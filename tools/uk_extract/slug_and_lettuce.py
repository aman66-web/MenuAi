#!/usr/bin/env python3
"""Build data/source/slug-and-lettuce/ from Slug & Lettuce's official allergen and nutritional data.

    python3 tools/uk_extract/slug_and_lettuce.py --checked-on 2026-10-06 [--pages DIR] [--out DIR]

Source: https://tkmenus.com/theslugandlettuce (Stonegate's "Allergen & Nutritional Data", linked from slugandlettuce.co.uk/menus; one
page per menu, chosen with ?mguid=<menu id>). Pages are saved once into --pages (default: a temp folder; delete it to refresh) at
one request per second and read by tenkites_b.py; numbers are copied exactly as printed. Only names, categories and the choice of
menus are typed here. The script stops if a page changes layout, a nutrient column or section appears that is not mapped, or the
row count no longer matches EXPECTED_ROWS.

Some dishes are printed as a "core" plus choices: "Bacon Cheeseburger (Excluding Accompaniment Option, see below)" with Skin-On
Fries, Side Salad... each with its own numbers. The core is published as the chain prints it (its name keeps the "Excluding"
wording) and each choice is its own item under "Options & add-ons", so a person can add them up; nothing is summed here.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "slug-and-lettuce"
BASE_URL = "https://tkmenus.com/theslugandlettuce"

# label, menu id, short name, long name (order = which version of a clashing dish keeps the plain name)
MENUS = [
    ("main", "29dd0e7b-366d-4e3e-84d6-6c2a6278ce78", "main menu", "main food menu"),
    ("lunch", "902dbb4e-bb76-4322-82ca-e3bf9ee41cda", "lunch menu", "lunch menu"),
    ("brunch", "e1c4485d-e225-40ab-8e7b-1c5a041f3561", "brunch menu", "brunch menu"),
    ("midweek", "b9ba6f98-a647-4a9e-9428-8bf0753c6a4a", "midweek eats", "midweek eats menu"),
    ("kids", "3ae1b2a7-5229-408c-b40f-f0da8907dc8a", "kids' menu", "kids' menu"),
    ("bottomless_day", "182f725c-fd41-472d-9ebb-d32cb4347dc8", "bottomless daytime brunch", "bottomless daytime brunch menu"),
    ("bottomless_eve", "003b72c9-d41f-44d0-8cf8-5364cf48bc93", "bottomless evening brunch", "bottomless evening brunch menu"),
    ("nogluten", "a1ae6419-8a15-4776-9eb7-081726e01c1a", "no-gluten menu", "no-gluten containing ingredients menu"),
    ("afternoontea", "7f0ba093-ac0a-4ffc-935c-30275eefc27d", "afternoon tea", "afternoon tea menu"),
    ("drinks", "8108a5d4-0b36-417b-b5da-a51d1524e44e", "drinks menu", "drinks menu"),
]
# Left out on purpose: festive set / kids' festive / festive bottomless brunch / festive buffet menus, Halloween drinks, August Bank
# Holiday special serve (seasonal or past), Buffet and Events menus (group catering), MIXR Bakewell specials (one venue),
# Maliblue campaign (past), and every June 2025 / 2024 / 2022 menu (superseded guides).

SECTIONS = {
    "Small Plates": "Small plates", "Sharers": "Sharers", "Sharer": "Sharers", "Mains": "Mains", "Burgers": "Burgers",
    "Extra Toppings": "Extra toppings", "Sides": "Sides", "Desserts": "Desserts", "Lunch": "Lunch", "Light Bites": "Light bites",
    "Lunch Drinks": "Drinks", "Brunch": "Brunch", "Brunch Add-Ons": "Brunch add-ons", "Kids' Brunch": "Kids brunch",
    "Drinks": "Drinks", "Starters": "Starters", "Burger Add-Ons": "Burger add-ons", "Sandwiches": "Sandwiches",
    "Pick Your Bottomless Drinks": "Drinks", "Mocktails": "Drinks", "Unlock Iconic Serves": "Drinks",
    "Pick Your Food": "Bottomless brunch food", "Fancy A Premium Plate?": "Bottomless brunch food",
    "Brunch Burgers": "Brunch burgers", "Salad": "Mains", "Treat the Table": "Sharers",
    "Afternoon Tea Selection": "Afternoon tea", "Non-Gluten Containing Afternoon Tea Selection": "Afternoon tea",
}
UNRANKABLE = {"Extra toppings", "Desserts", "Drinks", "Options & add-ons", "Brunch add-ons", "Burger add-ons", "Afternoon tea"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
HOLDBACK: dict[str, str] = {
    # accuracy check 2026-10-08: the page prints kJ and kcal that cannot both be right (kJ = 4.184 x kcal within 2%), so neither is chosen
    "Crodino Spritz": "The page prints 1330 kJ with 41 kcal: 1330 kJ is about 318 kcal, so kJ and kcal contradict. Restore by deleting this "
                      "line once the chain corrects the page.",
    "Crodino Spritz - 175ml": "The page prints 1285 kJ with 30 kcal: 1285 kJ is about 307 kcal, so kJ and kcal contradict. Restore by deleting "
                              "this line once the chain corrects the page.",
    "Crispy Tofu (VG)": "The page prints 1489 kJ with 387 kcal: 1489 kJ is about 356 kcal (and protein, carbs and fat add to about 352 kcal), so "
                        "kJ and kcal contradict. Restore by deleting this line once the chain corrects the page.",
    # the dish is 'Hand-battered fish with skin-on fries, tartare sauce' but the guide marks only fish and mustard: no gluten for the batter
    # and no egg or milk for the tartare sauce. The chain's no-gluten menu does not list it either. Safety information: not shown.
    "Fish & Chips (Excluding Your Pea Option, see below)": "Allergen row contradicts the dish name/ingredients: the dish is hand-battered fish with "
                                                          "tartare sauce, but the guide marks only fish and mustard (no gluten, egg or milk). "
                                                          "Restore by deleting this line once the chain confirms the allergens.",
    # same battered fish in two more dishes: no gluten marked, and none of the three is on the chain's own no-gluten menu
    "Fish Goujon (Excluding Base Option, see below)": "Allergen row contradicts the dish name/ingredients: hand-battered fish goujons with tartare "
                                                      "sauce, but the guide marks only fish and mustard (no gluten, egg or milk), and the chain's own "
                                                      "no-gluten menu does not list it. Restore by deleting this line once the chain confirms the allergens.",
    "Fish Goujons (Excluding Accompaniment Option, see below)": "Allergen row contradicts the dish name/ingredients: battered fish goujons, but the "
                                                                "guide marks only fish (no gluten), and the chain's own no-gluten menu does not "
                                                                "list it. Restore by deleting this line once the chain confirms the allergens.",
}
# Notes for rows the check report flags or that look odd: entered as printed, explained here
NOTES: dict[str, str] = {
    "Sweetcorn (VG)": "Calories (76) are about 20% higher than its macros allow (61). Entered as printed.",
    "Jack Daniel's Tennessee Honey": "A spirit: 60 kcal with no macros, which fits alcohol calories. Entered as printed.",
}

# Each dish's info box prints "Contains:" / "Dish ingredients may also contain:" (naming the cereals) and the dish carries label
# ids; tenkites_b.allergens_from_rec checks they agree.
ALLERGEN_TITLE = "Slug & Lettuce allergen & nutritional data (tkmenus.com/theslugandlettuce, July 2026 menus, data correct as of 6 October 2026)"
ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # as printed on these pages

EXPECTED_ROWS = 841


def is_option(rec: dict) -> bool:
    """A choice offered with a core dish (not a stand-alone dish that the page happens to mark as an option)."""
    return rec["kind"] == "option" and bool(rec["group"])


def base_of(group: str) -> str:
    return re.sub(r"\s*\((excluding|see below)[^)]*\)", "", group, flags=re.I).strip()


def category(label: str, rec: dict, name: str) -> str:
    if label == "drinks":
        return "Drinks"
    top = rec["course"][0]
    if top not in SECTIONS:
        raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to SECTIONS after checking the page")
    if is_option(rec):
        return "Options & add-ons"
    return SECTIONS[top]


def veg_marked(rec: dict) -> bool:
    """The chain marks vegetarian and vegan dishes with (V) or (VG) in the name. '(V-M)' / '(VG-M)' are not explained on the
    page, so they are not treated as a vegetarian claim."""
    return bool(re.search(r"\((V|VG)\)", rec["name"]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "slug-and-lettuce-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    paths = tk.fetch_pages(BASE_URL, {m[0]: m[1] for m in MENUS}, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    # the kcal printed beside each dish's name must equal the kcal in its table (a built-in check on the reader)
    for label in labels:
        for rec in tk.read_menu(paths[label])[1]:
            head = re.sub(r"[^0-9]", "", rec["check"]["header_energy"])
            table = rec["nutrients"].get("Energy (kcal)", "-")
            if table not in ("-", "") and head != tk.number(table):
                raise SystemExit(f"{label}: {rec['name']!r} header says {rec['check']['header_energy']!r}, table says {table!r}")

    rows, excluded, skipped, total = tk.collect_rows(
        labels, paths, "items", lambda label, rec: rec["name"], category, veg_fn=veg_marked,
        where_fn=lambda label, rec: f"with {base_of(rec['group'])}" if is_option(rec) else rec["course"][-1],
        allergen_fn=lambda label, rec: tk.allergens_from_rec(rec, f"{label} {rec['name']}", ALLERGEN_WORDS))
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    for r in rows:
        r["prefer_where"] = r["category"] == "Options & add-ons"
    tk.unique_names(rows, rank, short, long)
    for r in rows:
        if r["name"] in NOTES:
            r["note"] = NOTES[r["name"]]
    items = tk.make_items(rows, long, UNRANKABLE)
    for it in items:
        if re.search(r"\(excluding [^)]*(topper|chicken)", it["name"], re.I):  # the dish is printed without its main protein
            it["rankable"] = False
            it["notes"] = "Printed without its main protein topper, so not suggested as a meal; add the topper item. " + it["notes"]
        elif re.search(r"\(excluding ", it["name"], re.I):
            it["notes"] = "Printed without the side or option named in its title; add that item. " + it["notes"]
    names = [i["name"] for i in items]
    missing = [n for n in list(HOLDBACK) + list(NOTES) if n not in names]
    if missing:
        print(f"HOLDBACK/NOTES names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Slug & Lettuce", cuisine="Pub",
        source_title="Slug & Lettuce allergen & nutritional data (tkmenus.com/theslugandlettuce: Main Food Menu July 2026 and the July 2026 "
                     "lunch, brunch, bottomless brunch, midweek eats, kids', no-gluten, afternoon tea and drinks menus; data correct as of "
                     "6 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["slug and lettuce", "slug & lettuce", "the slug and lettuce", "slug n lettuce"], items=items, out=args.out,
        holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note="Values are per dish as served, with the standard garnishes and accompaniments on the menu. Dishes printed 'Excluding ...' leave "
             "out the topper or side named, which is listed under Options & add-ons.",
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    for label in labels:
        print(f"{label:15} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat, by menu:", by_menu)
    print("\n".join(tk.ALLERGEN_NOTES))
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
