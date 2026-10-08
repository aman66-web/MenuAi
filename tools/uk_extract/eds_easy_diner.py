#!/usr/bin/env python3
"""Build data/source/eds-easy-diner/ from Ed's Easy Diner's own "Dietary Information" pages (hosted by Ten Kites).

    python3 -I tools/uk_extract/eds_easy_diner.py --pages DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: https://edseasydiner.com/menu has a visible tab "DIETARY INFORMATION" that links to
https://menus.tenkites.com/brg/eds (the chain's own allergy and nutrition page; it prints no date). That page has a menu
selector with five menus, each its own page (?mguid=...): Breakfast, Main, Junior, Gluten Free and Drinks. DIR holds the five
saved pages (eds_breakfast.html, eds_main.html, eds_junior.html, eds_glutenfree.html, eds_drinks.html); --fetch downloads them
first (one request per page, one second apart; robots.txt of menus.tenkites.com disallows only /fonts/, /views/ and *.less).

The page opens on "View allergy and dietary" and carries the nutrition cells hidden (display:none) until the visitor clicks the
page's own tab "View nutrition information"; then every dish's per-serving table is shown ("Nutrition values per serving": kJ,
kcal, protein, carbohydrate, sugars, fat, saturates, fibre, salt). The numbers are therefore visitor-visible, published by the
chain: the script stops if that tab is no longer on the page. The Playwright check in the hand-over report clicked the tab and
compared every visible cell with this script's output.

Numbers are copied exactly as printed (tenkites_c.read_table_layout / numbers): kcal, kJ (energy_kj), protein, carbohydrate,
sugars, fat, saturates, fibre, salt. No weights, caffeine or sodium are printed. "-" means not printed (blank). Only the names
that must be told apart, the categories and the rankable choices are written by hand below. The run stops if a page gains or loses
dishes, a new section appears, two different dishes end up with one name, or the page's allergen columns disagree with its
printed "Contains / May contain" lines and the page's own filter ids (tenkites_c.allergens_from_columns).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "eds-easy-diner"
URL = "https://menus.tenkites.com/brg/eds"
# menu key -> (file, ?mguid, dishes expected on the page, label the page's menu selector shows)
PAGES = {
    "breakfast": ("eds_breakfast.html", "367dafd3-d011-4e03-a87b-4daeced53c62", 40, "Breakfast Menu"),
    "main": ("eds_main.html", "e13b82ba-fd05-42b6-b5c9-cde433318d21", 52, "Main Menu"),
    "junior": ("eds_junior.html", "d0f7068a-4343-4875-bfb0-87243adf759c", 26, "Junior Menu"),
    "drinks": ("eds_drinks.html", "7cb944d5-9943-4e5b-8ccd-75a32bddb4e9", 38, "Drinks Menu"),
    "glutenfree": ("eds_glutenfree.html", "2448fcd7-2447-494e-b2a3-265440c7f66e", 53, "Gluten Free Menu"),
}  # order = order of reading: a dish printed identically on a later menu is dropped as a duplicate of the earlier one

# (menu, printed section) -> (category shown, rankable). Parts of a meal (toppings, add-ons, dips), sides of a kids' meal, desserts,
# condiments and drinks are not suggested as an order on their own.
SECTIONS = {
    ("breakfast", "BREAKFAST"): ("Breakfast", True),
    ("breakfast", "BREAKFAST EXTRAS"): ("Breakfast extras", False),
    ("breakfast", "JUNIOR BREAKFAST"): ("Junior breakfast", True),
    ("main", "STARTERS"): ("Starters", True),
    ("main", "BEEF BURGERS"): ("Beef burgers", True),
    ("main", "CHICKEN BURGERS"): ("Chicken burgers", True),
    ("main", "VEGAN BURGERS"): ("Vegan burgers", True),
    ("main", "DOGS"): ("Dogs", True),
    ("main", "SIDES"): ("Sides", True),
    ("main", "Extras"): ("Extras", False),
    ("main", "DESSERTS"): ("Desserts", False),
    ("main", "CONDIMENTS"): ("Condiments", False),
    ("junior", "MAINS"): ("Junior mains", True),
    ("junior", "DESSERTS"): ("Junior desserts", False),
    ("junior", "DRINKS"): ("Junior drinks", False),
    ("drinks", "SHAKES"): ("Shakes", False),
    ("drinks", "DAIRY FREE SHAKES"): ("Dairy free shakes", False),
    ("drinks", "HARD SHAKES"): ("Hard shakes", False),
    ("drinks", "FREAK SHAKES"): ("Freak shakes", False),
    ("drinks", "SOFT DRINKS"): ("Soft drinks", False),
    ("drinks", "HOT STUFF"): ("Hot drinks", False),
    ("drinks", "BEER"): ("Beer", False),
    ("glutenfree", "STARTERS"): ("Gluten free: starters", True),
    ("glutenfree", "BEEF BURGERS"): ("Gluten free: beef burgers", True),
    ("glutenfree", "SIDES"): ("Gluten free: sides", True),
    ("glutenfree", "JUNIOR MENU"): ("Gluten free: junior", True),
    ("glutenfree", "SHAKES"): ("Gluten free: shakes", False),
    ("glutenfree", "JUNIOR SHAKES"): ("Gluten free: junior drinks", False),
    ("glutenfree", "HOT DRINKS"): ("Gluten free: hot drinks", False),
    ("glutenfree", "SOFT DRINKS"): ("Gluten free: soft drinks", False),
    ("glutenfree", "BREAKFAST"): ("Gluten free: breakfast", True),
}
# Printed names that are changed. Only to tell apart two different dishes the pages print under one name (the numbers differ), or
# to fix the capitalisation of one name. (menu, section, printed name) -> name shown.
GF = " (Gluten Free menu)"
JR = " (Junior menu)"
RENAMES = {
    ("main", "STARTERS", "6 wings - Inferno"): "6 Wings - Inferno",
    ("glutenfree", "STARTERS", "6 wings - Inferno"): "6 Wings - Inferno",
    ("glutenfree", "BEEF BURGERS", "Smokey Joe"): "Smokey Joe" + GF,
    ("glutenfree", "BEEF BURGERS", "The Cheesy"): "The Cheesy" + GF,
    ("glutenfree", "JUNIOR MENU", "Junior Cheeseburger"): "Junior Cheeseburger" + GF,
    ("glutenfree", "SOFT DRINKS", "Add Ice Cream Scoop"): "Add Ice Cream Scoop" + GF,
    ("junior", "DRINKS", "Orange Juice"): "Orange Juice" + JR,
    ("junior", "DRINKS", "Apple Juice"): "Apple Juice" + JR,
    ("glutenfree", "JUNIOR SHAKES", "Orange Juice"): "Orange Juice" + JR,
    ("glutenfree", "JUNIOR SHAKES", "Apple Juice"): "Apple Juice" + JR,
}
# Dishes in a rankable section that are a part of a dish, not an order: dips, and the toppings listed under JUNIOR BREAKFAST.
NOT_RANKABLE = {
    "Blue Cheese Dip", "Cayenne Ranch Dip",
    "Mini Marshmallow Topping", "Bacon", "Biscoff", "Caramel Sauce", "Chocolate Sauce", "Squirty Cream", "Ice Cream Topping",
    "Maple Syrup", "Nutella", "Oreo Crumb", "Peanut Butter", "Maple Butter",
    # Gluten Free menu, JUNIOR MENU: the fries and the two ice creams (the cheeseburger is the one main)
    "GF Junior Fries", "Vanilla Ice Cream with Chocolate Sauce", "Vanilla Ice Cream with Strawberry Sauce",
}
# JUNIOR MENU / MAINS: the four sides (beans, veg batons, fries, corn) are not mains.
NOT_RANKABLE_JUNIOR_SIDES = {"Junior Beans", "Junior Veg Batons", "Junior Fries", "Junior Corn"}
# Tags: vegetarian only where the page's own "Suitable for" columns mark the dish. contains_pork / contains_beef only where the dish's
# name or the page's own ingredient list for the dish ("Allergens by ingredient / sub-recipe": e.g. "Beef Burger", "Beef Hot Dog",
# "Streaky Bacon", "Cumberland Sausage") says so (tenkites_c.meat_tags). A meat dish whose name and ingredients name no meat is listed.

# The page prints each dish's 14 allergen columns (a tick = contains, "M" = may contain), a "Contains: ... May contain: ..." line
# naming cereals and tree nuts, and the label ids of its own allergen filter; all three are cross-checked.
ALLERGEN_COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
                    "Sulphur Dioxide/ Sulphites", "Peanuts", "Tree Nuts", "Cereals with Gluten"]
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # the page prints a space after the slash
SOURCE_TITLE = ("Ed's Easy Diner Dietary Information: allergy and nutrition pages for the Breakfast, Main, Junior, Gluten Free "
                "and Drinks menus (Ten Kites page linked from edseasydiner.com; no date shown, accessed {day})")
ALLERGEN_TITLE = ("Ed's Easy Diner Dietary Information, allergy and dietary view (Ten Kites page linked from edseasydiner.com; "
                  "no date shown, accessed {day})")
NOTE = ("Figures are per serving from Ed's own nutrition pages (hosted by Ten Kites, no date shown), calculated from typical weights "
        "and measures, so they can vary. Serving sizes are not stated. Where the Gluten Free menu prints different numbers for a dish, "
        "it is listed separately. Hard shakes and one beer print calories only, so they are left out.")


def read_ingredients(text: str) -> list[list[str]]:
    """The page's own ingredient list for each dish (the "Allergens by ingredient / sub-recipe" rows of its expanded view), in the
    same order as tenkites_c.read_table_layout's rows: [(dish name, [ingredient names])]."""
    root = tk.parse_html("<div>" + tk._desktop_part(text) + "</div></div>")
    out = []
    for node in root.iter():
        if node.has("k10-w-recipe__info") and node.has("k10-recipe"):
            card = node.parent if node.parent is not None else node
            out.append((node.find("k10-w-recipe__name").text(),
                        [re.sub(r"\s+", " ", i.text()).strip() for i in card.find_all("k10-recipe__ingredient-name")]))
    return out


def check_page(text: str, key: str) -> None:
    if "k10-toolbar__button_nutrition" not in text or "View nutrition information" not in text:
        raise SystemExit(f"{key}: the page no longer has the 'View nutrition information' tab: the nutrition may now be hidden "
                         "from visitors. Do not publish until a human has looked at the live page.")
    if "NUTRITION VALUES PER SERVING" not in text.upper():
        raise SystemExit(f"{key}: the page no longer says 'Nutrition values per serving': check the basis before running again.")


# Dishes whose allergen row contradicts the dish's own name (found by the independent accuracy check, 2026-10-08). A pretzel is
# wheat, but the page marks no cereals with gluten for this shake and lists no pretzel among its ingredients (milk, squirty
# cream, vanilla ice cream, peanut butter: their kcal add up to exactly the printed 1,040), so the page's row cannot be trusted.
HOLDBACK_ALLERGEN = {
    "Peanut Butter Pretzel Shake": ("allergen row contradicts the dish name/ingredients: the dish is called a Pretzel shake but the "
                                    "page marks no cereals with gluten and lists no pretzel among its ingredients (semi skimmed milk, "
                                    "squirty cream, vanilla ice cream, peanut butter)"),
}


def holdback_reason(it: dict) -> str:
    """Rows whose own numbers contradict each other: kJ and kcal must agree (1 kcal = 4.184 kJ) once the energy is not tiny."""
    if it["name"] in HOLDBACK_ALLERGEN:
        return HOLDBACK_ALLERGEN[it["name"]]
    kcal, kj = float(it["calories"]), float(it["energy_kj"] or 0)
    if kcal >= 20 and kj and not 3.9 <= kj / kcal <= 4.5:
        return (f"Printed {it['calories']} kcal but {it['energy_kj']} kJ ({kj / kcal:.2f} kJ per kcal, not 4.18): the page's energy "
                "figures contradict each other, and the protein, carbs and fat fit the kJ, not the kcal")
    return ""


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    items, report, holdback = [], [], []
    for key, (fname, _, expected, menu_label) in PAGES.items():
        text = (pages_dir / fname).read_text(encoding="utf-8")
        check_page(text, key)
        rows = tk.read_table_layout(text)
        if len(rows) != expected:
            raise SystemExit(f"{fname} has {len(rows)} dishes but this script expects {expected}: the menu changed, "
                             "re-check SECTIONS, RENAMES and the expected counts before running again.")
        ingredients = read_ingredients(text)
        if [n for n, _ in ingredients] != [r["name"] for r in rows]:
            raise SystemExit(f"{fname}: the ingredient lists do not line up with the dishes: the page layout changed")
        for r, (_, ings) in zip(rows, ingredients):
            if (key, r["section"]) not in SECTIONS:
                raise SystemExit(f"{fname}: new section {r['section']!r}: add it to SECTIONS (category, rankable).")
            category, rankable = SECTIONS[(key, r["section"])]
            printed_name = r["name"]
            name = RENAMES.get((key, r["section"], printed_name), printed_name)
            nums, missing = tk.numbers(r["nutrients"], f"{fname} {printed_name}", extras=True)
            if missing:
                report.append(f"not listed: {printed_name!r} ({menu_label}) prints no {', '.join(missing)}")
                continue
            vegetarian = bool(r["vegetarian"])
            tags = ["vegetarian"] if vegetarian else []
            meat, unspecified = tk.meat_tags(printed_name, "; ".join(ings), vegetarian=vegetarian)
            if unspecified:
                report.append(f"meat type not stated: {name}")
            if rankable and (name in NOT_RANKABLE or (key, r["section"]) == ("junior", "MAINS") and name in NOT_RANKABLE_JUNIOR_SIDES):
                rankable = False
            it = {"id": slug(name), "name": name, "category": category, "serving": "", **nums, "tags": "|".join(tags + meat),
                  "rankable": rankable, "notes": f"Printed on the {menu_label} page, section {r['section']}",
                  "allergens": tk.allergens_from_columns(r, f"{fname} {printed_name}", ALLERGEN_COLUMNS, ALLERGEN_EXTRA),
                  "_menu": key}
            items.append(it)
    report += [f"allergens: {n!r} is printed twice with the same numbers but different allergens: not used"
               for n in tk.allergen_conflicts(items)]
    report += [f"allergens: no allergen information to read for {i['name']!r}" for i in items if i["allergens"] is None]
    kept, dropped = tk.dedupe_items(items)
    report += [f"dropped exact duplicate (same name and numbers on another menu): {n}" for n in dropped]
    names = [i["name"] for i in kept]
    clash = sorted({n for n in names if names.count(n) > 1})
    if clash:
        raise SystemExit(f"Different dishes share one name {clash}: add RENAMES so each name is unique.")
    final = []
    for it in kept:
        it.pop("_menu")
        notes = tk.annotate(it)
        why = holdback_reason(it)
        if why:
            holdback.append((it["id"], why))
        it["notes"] = "; ".join([it["notes"]] + notes)
        report += [f"{it['name']}: {n}" for n in notes]
        final.append(it)
    return final, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the pages with the live site")
    ap.add_argument("--fetch", action="store_true", help="download the five pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for _, (fname, guid, _, _) in PAGES.items():
            tk.fetch(f"{URL}?mguid={guid}", args.pages / fname)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Ed's Easy Diner", cuisine="Burgers", source_title=SOURCE_TITLE.format(day=args.checked_on),
        source_url=URL, checked_on=args.checked_on, aliases=["ed's easy diner", "eds easy diner", "ed's diner", "eds diner"],
        items=items, out=args.out, note=NOTE, holdback=holdback,
        allergen_guide={"title": ALLERGEN_TITLE.format(day=args.checked_on), "url": URL, "checked_on": args.checked_on,
                        "may_contain_published": True})
    for _, (fname, _, _, _) in PAGES.items():
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    print(f"held back: {len(holdback)}")
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
