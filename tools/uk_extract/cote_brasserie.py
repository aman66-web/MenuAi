#!/usr/bin/env python3
"""Build data/source/cote-brasserie/ from Côte Brasserie's official allergen and nutrition menus.

    python3 tools/uk_extract/cote_brasserie.py --checked-on 2026-10-06 [--pages DIR] [--out DIR]

Source: https://menus.tenkites.com/cote/cote (the menu pages linked from cote.co.uk; one page per menu, chosen with
?mguid=<menu id>). Every page is saved once into --pages (default: a temp folder; delete the folder to refresh) at one
request per second. Numbers are copied from the pages exactly as printed by tenkites_b.py ("-" means not published and is
left blank). Only names, categories and the choice of menus are typed here. The script stops if a page changes layout,
a section or nutrient column appears that is not mapped below, or the row counts no longer match EXPECTED.

Where a dish is printed on several menus the identical rows are kept once; rows with different numbers are kept as
separate items and the later ones are named "<dish> (<menu>)".
"""
from __future__ import annotations
import argparse
import hashlib
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "cote-brasserie"
BASE_URL = "https://menus.tenkites.com/cote/cote"

# label, menu id, short name (used to tell variants apart), long name
MENUS = [
    ("weekday", "2eb0f568-2c0f-47f8-b890-0a0ad81682c5", "weekday menu", "weekday menu"),
    ("weekend", "20cb5d33-acda-4e80-b285-df8014ece4fc", "weekend menu", "weekend menu"),
    ("brunch", "ef308d84-cdcf-4b7d-9e2d-05cfb5280350", "weekend brunch", "weekend brunch"),
    ("prixfixe", "9df299f1-2edd-4c21-96bc-01541867bd10", "prix fixe", "prix fixe"),
    ("treat", "d9cad3a1-df4e-4d18-8400-4176041836a2", "treat yourself", "treat yourself"),
    ("breakfast", "31a0e224-2926-4201-8f74-a170fce320b8", "breakfast", "breakfast"),
    ("kids", "2d1f3b78-e083-4504-b081-0c025e123d28", "kids menu", "kids menu"),
    ("kids_breakfast", "52cf4e62-9fbe-48fc-92c6-b3043492b347", "kids breakfast", "kids breakfast"),
    ("weekday_gf", "1fab7612-5c5f-430e-85dc-1bdfaefb8b83", "gluten free", "weekday gluten free menu"),
    ("weekend_gf", "3488f1d5-b5ef-44fe-bcb7-2617501f07a8", "gluten free", "weekend gluten free menu"),
    ("prixfixe_gf", "e9e75e8f-ce62-4636-8f17-b54bf4b442c5", "gluten free", "prix fixe gluten free menu"),
    ("treat_gf", "88b40e78-d7cc-4380-9e8f-4b2c0f94acb2", "gluten free", "treat yourself gluten free"),
    ("breakfast_gf", "aaba5ab1-afd6-400a-a766-8052ef2f7904", "gluten free", "breakfast gluten free"),
    ("kids_breakfast_gf", "0648feb7-132d-49c3-9169-5ba7cfa340c4", "gluten free", "kids breakfast gluten free"),
    ("drinks", "481ac505-ef3a-4bbb-bec8-bd31e92fadc6", "drinks menu", "drinks menu"),
]
# Menus left out on purpose (reasons are in the report): Digestif (every row is calories only), Canapes (events),
# "Coffee Cart - KINGSTON ONLY" and "St Pauls Breakfast (St Pauls ONLY)" (single restaurants).

S = {
    "For The Table": "For the table", "To Start": "Starters", "Cote Icons": "Côte icons", "Côte Icons": "Côte icons",
    "Upgrade any Burger": "Add-ons", "Free Flow Frites": "Sides", "Cote Butchery": "Côte butchery",
    "House Made Sauces": "Sauces", "Housemade Sauces": "Sauces", "Light Mains": "Light mains", "Sides": "Sides",
    "Aperitif": "Aperitif",
}
# categories whose items are never suggested as a meal on their own
UNRANKABLE = {"Add-ons", "Sauces", "Desserts", "Kids desserts", "Drinks", "Pastries", "For the table", "Aperitif", "Bar bites"}


def category(menu: str, course: list[str], name: str) -> str:
    leaf, top = course[-1], course[0]
    if name.startswith("Add on "):
        return "Add-ons"
    if menu in ("weekday", "weekend", "weekday_gf", "weekend_gf"):
        return S[leaf]
    if menu in ("brunch",):
        return "Breakfast"
    if menu in ("prixfixe", "prixfixe_gf"):
        return {"To Start": "Prix fixe starters", "Mains": "Prix fixe mains", "To Finish": "Prix fixe desserts"}[leaf]
    if menu in ("treat", "treat_gf"):
        return "Desserts"
    if menu in ("breakfast", "breakfast_gf"):
        if leaf == "+ Upgrade your breakfast":
            return "Add-ons"
        if leaf == "On the side":
            return "Sides"
        if leaf == "Sides":
            return "Sides"
        if leaf == "Pastries":
            return "Pastries"
        if top in ("Côte Icons", "Signature Breakfast", "Eggs Hollandaise", "Eggs Hollaindaise", "The Croques",
                   "French Toast Stacks", "Light Options", "Bowls"):
            return "Breakfast"
    if menu in ("kids", "kids_breakfast", "kids_breakfast_gf"):
        if menu != "kids":
            return "Drinks" if leaf == "Drinks" else "Kids breakfast"
        return {"Starters": "Kids starters", "Mains": "Kids mains", "Sides": "Kids sides", "Desserts": "Kids desserts",
                "Build Your Own": "Kids desserts", "Drinks": "Drinks"}[leaf]
    if menu == "drinks":
        return "Bar bites" if leaf == "Why WAIT?" else "Drinks"
    raise ValueError(f"unmapped section {course!r} on menu {menu!r}: add it to category() after checking the page")


# dishes whose printed name is only a variant of the section they sit in: "Royale" is under Eggs Hollandaise and The Croques
VARIANT_SECTIONS = {"Eggs Hollandaise", "Eggs Hollaindaise", "The Croques"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
HOLDBACK = {
    "Olives (gluten free)": "The menu prints 278 kcal; its own macros add up to about 84 kcal (the regular Olives print 97 kcal).",
    "French Onion Soup": "The menu prints 176.4 g of fat for a dish of 314 kcal.",
    "Wild Mushroom": "The menu prints 251.0 g of fat for a sauce of 151 kcal.",
    "Florentine (Eggs Hollandaise)": "The menu prints 718 kcal (the same as Benedict) but its own macros add up to about 553 kcal.",
    "Leek & Potato Soup (gluten free)": "The menu prints 225 kcal; its own macros add up to about 319 kcal (50 g of carbohydrate alone is about 200 kcal).",
    "Kids Salted Caramel Ice Cream with Wafer": "The menu prints 112 kcal; its own macros add up to about 60 kcal.",
    # Added after the independent re-read of 2026-10-08 (the numbers below are exactly as printed; the menu contradicts itself):
    "Risotto Vert - Vegan (weekday gluten free menu)": "The menu prints 46.7 g of saturates for 19.6 g of fat.",
    "Risotto Vert - Vegan (weekend gluten free menu)": "The menu prints 46.7 g of saturates for 19.6 g of fat, and marks no allergen at all although its own "
                                                       "ingredient list names sulphites (wine vinegar).",
    "Risotto Vert (weekend gluten free menu)": "The menu marks no allergen at all, but its own ingredient list names cow's milk (cheese) and sulphites "
                                               "(wine vinegar); the weekday gluten free version marks them.",
    "Half Poulet Breton (gluten free)": "The menu marks no allergen at all, but its own ingredient list names butter (milk); the weekday gluten free "
                                        "version marks milk.",
    "Whole Poulet Breton (gluten free)": "The menu marks no allergen at all, but its own ingredient list names butter (milk); the weekday gluten free "
                                         "version marks milk.",
    "Veggie French Onion Soup": "The menu marks no celery, but its own ingredient list names celery (vegetable stock and celery root powder).",
    "Andrea's Pasta": "The menu marks no egg, but its own ingredient list names egg (the pasta); the vegan version has none.",
    "Botivo Elderflower Spritz": "The menu prints 10.6 g of sugars for 6 g of carbohydrate.",
    "Chocolate Mousse for One": "The menu prints 23.9 g of sugars for 22 g of carbohydrate.",
    "Poulet Grille": "The menu prints 6.2 g of sugars for 2 g of carbohydrate.",
}

# The same pages print each dish's allergens three ways (the 14 yes/may/no columns, the card's "Contains:" / "May contain:"
# lines naming the cereals and tree nuts, and the dish's label ids); tenkites_b.allergens_from_rec checks they agree.
ALLERGEN_TITLE = "Côte Brasserie allergen and nutrition menus (June 2026 menus, menus.tenkites.com/cote/cote)"

# row counts the pages had when this script was written (rows with the four required numbers / all rows)
EXPECTED_ROWS = 541


# A page that ticks "Vegetarian" for a dish whose own allergen marks say it contains fish, crustaceans or molluscs contradicts itself
# (Caesar Salad, gluten free: anchovy): no vegetarian tag is given (the allergens are published as printed). Found 2026-10-08.
SEAFOOD = {"fish", "crustaceans", "molluscs"}
VEG_DROPPED: dict = {}
_last_name: dict[str, str] = {}


def veg_of(rec: dict) -> bool:
    page = bool({"Vegetarian", "Vegan"} & set(rec["yes_labels"]))
    if not page:
        return False
    a = tk.allergens_from_rec(rec, f"vegetarian check {rec['name']}")
    if a and a["contains"] & SEAFOOD:
        VEG_DROPPED[(_last_name["name"], frozenset(a["contains"]))] = ("page marks it vegetarian but its own allergens say it contains "
                                           + " and ".join(sorted(a["contains"] & SEAFOOD)) + ": no vegetarian tag given")
        return False
    return True


def name_of(label: str, rec: dict) -> str:
    name = rec["name"]
    if rec["course"][-1] == "+ Upgrade your breakfast":
        name = f"{name} (breakfast upgrade)"
    sect = [c for c in rec["course"] if c in VARIANT_SECTIONS]
    if sect:
        name = f"{name} ({'Eggs Hollandaise' if 'Hollaind' in sect[0] or 'Hollandaise' in sect[0] else sect[0]})"
    _last_name["name"] = name
    return name


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "cote-brasserie-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    paths = tk.fetch_pages(BASE_URL, {m[0]: m[1] for m in MENUS}, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    rows, excluded, _, total = tk.collect_rows(
        labels, paths, "table", name_of, lambda label, rec, name: category(label, rec["course"], rec["name"]),
        veg_fn=veg_of, allergen_fn=lambda label, rec: tk.allergens_from_rec(rec, f"{label} {rec['name']}"))
    for r in rows:
        key = (r["name"], frozenset(r["allergens"]["contains"])) if r["allergens"] else None
        if key in VEG_DROPPED:
            r["note"] = VEG_DROPPED[key]
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and category() against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    tk.unique_names(rows, rank, short, long)
    items = tk.make_items(rows, long, UNRANKABLE)
    names = [i["name"] for i in items]
    missing = [n for n in HOLDBACK if n not in names]
    if missing:
        print(f"HOLDBACK names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Côte Brasserie", cuisine="French",
        source_title="Côte Brasserie allergen and nutrition menus (June 2026 menus, menus.tenkites.com/cote/cote: weekday, weekend, "
                     "brunch, prix fixe, treat yourself, breakfast, kids and drinks, with gluten free versions)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["cote brasserie", "côte brasserie", "cote", "côte", "cote restaurant"], items=items, out=args.out,
        holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note="Carbohydrate is the menu's 'Available Carb' column, and the menu prints salt for only some dishes. Dishes that differ "
             "on the gluten free, weekend or kids menus appear once per version. Where a dish contains one kind of tree nut or cereal the menu "
             "may also list other kinds as 'may contain'; the app shows only what the dish contains.",
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    for label in labels:
        print(f"{label:18} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat, by menu:", by_menu)
    print("\n".join(tk.ALLERGEN_NOTES))
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{total - len(excluded) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
