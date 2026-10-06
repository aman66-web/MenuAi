#!/usr/bin/env python3
"""Build data/source/tortilla/ from Tortilla's official "Nutrition & Allergen Information" PDF.

    curl -A "Mozilla/5.0" -o tortilla-nutrition-guide.pdf https://a.storyblok.com/f/158888/x/192342b9c3/tortilla-nutrition-guide.pdf
    python3 tools/uk_extract/tortilla.py tortilla-nutrition-guide.pdf --checked-on 2026-10-06

Source: the PDF linked from https://www.tortilla.co.uk/menu/nutrition-and-allergens ("Updated 17 September 2026", 24 pages).
Numbers are copied from the PDF as printed (kcal, fat, saturates, carbs, sugars, fibre, protein, salt; kJ is not used).
Only categories, servings and rankable flags below are typed by hand; names come from the PDF.

WHAT IS AND IS NOT PUBLISHED. Most of Tortilla's guide is one table per dish type that lists the INGREDIENTS (wrap, rice,
beans, fillings, sauces, salsas) with a value each and NO total for the finished dish: Medium/Large Burrito/Bowl and Salad
(pages 4-7), Tres Tacos, Nachos Queso, Quesadilla, Protein Pots, the three Fuel Bowls, the four Damn That's Hot dishes and
the Kids tables (pages 8-17 and 20). Those are never added up here (a total the chain does not print would be a number we
made), so none of them is an item. What the guide does print as whole items are the Sides (chips, dips, sauces, salsas),
Desserts, the Breakfast items and one Drink. The script stops if the ingredient pages change shape (a new layout may mean
Tortilla now prints whole dishes, which a human should look at), or if a whole-item name appears or disappears.

Left out on purpose:
  "(Canary Wharf only)"  breakfast rows sold in one restaurant (the guide's own label); Great Britain menu only.
  "(Belfast)"            Northern Ireland variant of the Hibiscus Lemonade.
  Hot Drinks             the table prints calories only (no protein, carbs or fat), so it cannot be used.
  Ingredient tables      see above.
"""
import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tortilla_pdf  # noqa: E402
from common import ROOT, write_chain_folder  # noqa: E402

CHAIN_ID = "tortilla"
SOURCE_URL = "https://a.storyblok.com/f/158888/x/192342b9c3/tortilla-nutrition-guide.pdf"
SOURCE_TITLE = "Tortilla Nutrition & Allergen Information (updated 17 September 2026)"
PAGES = 24

BR, SI, DI, SA, DE, DR = "Breakfast", "Sides", "Dips & sauces", "Salsas", "Desserts", "Drinks"
CATEGORY_ORDER = [BR, SI, DI, SA, DE, DR]

# Pages whose tables list ingredients (no dish totals) and how many rows each held when this script was written.
# Page 24's Hot Drinks (kcal only) is checked separately.
INGREDIENT_PAGE_ROWS = {4: 27, 5: 27, 6: 26, 7: 26, 8: 21, 9: 10, 10: 16, 11: 24, 12: 11, 13: 21, 14: 10, 15: 10, 16: 9, 17: 9, 20: 17}
HOT_DRINKS = ["Espresso Single / Double", "Americano", "English Breakfast Tea", "Peppermint Tea", "Cappuccino", "Iced Coffee", "Latte", "Mocha"]

PORK = "contains_pork"
ENERGY_KJ = "Printed kJ (2666) and kcal (729) do not agree (2666 kJ is about 637 kcal, and protein, carbs and fat add up to about 644 kcal). Entered as printed"
QUESO = ("All nine printed numbers (kcal, kJ, fat, saturates, carbs, sugars, fibre, protein, salt) are identical to the Tortilla Chips "
         "(bag) row on the same page, although this is a cheese dip whose only allergen is milk. Looks like a copy-paste error in the guide")
SALSA_SALT = "Printed salt is 3 g for the large and 1 g for the medium (every other medium/large pair is about double)"

# printed name -> (category, serving, rankable, extra tags, note). Name, numbers and the vegetarian tag come from the PDF.
SPEC: dict[str, tuple] = {
    # page 21: breakfast burritos (the first four rows of the page are "Canary Wharf only" and are left out)
    "Medium Bacon Breakfast Burrito": (BR, "Medium", True, [PORK], ""),
    "Large Bacon Breakfast Burrito": (BR, "Large", True, [PORK], ""),
    "Medium Veggie Breakfast Burrito": (BR, "Medium", True, [], "A different 'Medium Veggie Breakfast Burrito (Canary Wharf only)' with other numbers is on the same page and is left out"),
    "Large Veggie Breakfast Burrito": (BR, "Large", True, [], ENERGY_KJ + ". A different 'Large Veggie Breakfast Burrito (Canary Wharf only)' is on the same page and is left out"),
    # page 22: breakfast bowls
    "Medium Bacon & Chorizo Bowl": (BR, "Medium", True, [PORK], ""),
    "Large Bacon & Chorizo Bowl": (BR, "Large", True, [PORK], ""),
    "Medium Veggie Bowl": (BR, "Medium", True, [], ""),
    "Large Veggie Bowl": (BR, "Large", True, [], ""),
    # page 23: breakfast buns
    "Bacon Breakfast Bun": (BR, "", True, [PORK], ""),
    "Pork & Pico de Gallo Breakfast Bun": (BR, "", True, [PORK], ""),
    "Veggie Breakfast Bun": (BR, "", True, [], ""),
    # page 18: sides
    "Tortilla Chips (bag)": (SI, "Bag", True, [], ""),
    "Tortilla Chips (side portion)": (SI, "Side portion", True, [], ""),
    "Medium Guacamole": (DI, "Medium", False, [], ""),
    "Large Guacamole": (DI, "Large", False, [], ""),
    "Medium Ghost Chilli Ranch": (DI, "Medium", False, [], ""),
    "Large Ghost Chilli Ranch": (DI, "Large", False, [], ""),
    "Medium Chipotle Cheese Sauce": (DI, "Medium", False, [], ""),
    "Large Chipotle Cheese Sauce": (DI, "Large", False, [], ""),
    "Medium Sour Cream": (DI, "Medium", False, [], ""),
    "Large Sour Cream": (DI, "Large", False, [], ""),
    "Medium Chipotle Mayo (Ve)": (DI, "Medium", False, [], ""),
    "Large Chipotle Mayo (Ve)": (DI, "Large", False, [], ""),
    "Queso Fundido": (DI, "", False, [], QUESO),
    "Pina Picante Hot Sauce": (DI, "", False, [], ""),
    "Valentina Hot Sauce": (DI, "", False, [], ""),
    "Medium Salsa de Pina": (SA, "Medium", False, [], ""),
    "Large Salsa de Pina": (SA, "Large", False, [], ""),
    "Medium Pico de Gallo": (SA, "Medium", False, [], ""),
    "Large Pico de Gallo": (SA, "Large", False, [], ""),
    "Medium Sweetcorn Salsa": (SA, "Medium", False, [], ""),
    "Large Sweetcorn Salsa": (SA, "Large", False, [], ""),
    "Medium Salsa Ranchera (mild)": (SA, "Medium", False, [], ""),
    "Large Salsa Ranchera (mild)": (SA, "Large", False, [], ""),
    "Medium Salsa Verde (medium)": (SA, "Medium", False, [], ""),
    "Large Salsa Verde (medium)": (SA, "Large", False, [], SALSA_SALT),
    "Medium Salsa Roja (hot)": (SA, "Medium", False, [], ""),
    "Large Salsa Roja (hot)": (SA, "Large", False, [], ""),
    # page 19: desserts
    "3 Churros & Chocolate Sauce": (DE, "3 churros", False, [], ""),
    "5 Churros & Chocolate Sauce": (DE, "5 churros", False, [], ""),
    "Dessert Quesadilla": (DE, "", False, [], ""),
    # page 24: drinks
    "Hibiscus Lemonade": (DR, "", False, [], "The guide's footnote '*Available at participating stores only.' sits under this table but no row carries an asterisk, so it is not known whether it applies to this drink. Serving size is not stated"),
}
# Rows left out because the guide itself limits them to one restaurant or to Northern Ireland.
EXCLUDED_SUFFIXES = ("(Canary Wharf only)", "(Belfast)")
# Items whose printed numbers cannot be right: not published (docs/DATA.md holdback.csv). Never corrected.
HOLDBACK = [("queso-fundido", QUESO)]
NOTE = ("Tortilla publishes its burritos, bowls, salads, tacos, nachos, quesadillas and fuel bowls only as separate ingredients, "
        "never as finished dishes, so those are not listed here. Breakfast items sold at Canary Wharf only are left out.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    pages = tortilla_pdf.read_pages(args.pdf)
    problems: list[str] = []
    if len(pages) != PAGES:
        problems.append(f"The PDF has {len(pages)} pages, not {PAGES}.")
    for page, expected in INGREDIENT_PAGE_ROWS.items():
        got = len(pages.get(page, []))
        if got != expected:
            problems.append(f"Page {page} (ingredient table) has {got} rows, not {expected}.")
    hot = [r["name"] for r in pages.get(24, []) if "kj" not in r]
    if hot != HOT_DRINKS:
        problems.append(f"Hot Drinks rows changed: {hot}")

    whole = [(n, r) for n in (18, 19, 21, 22, 23, 24) for r in pages.get(n, []) if "kj" in r]
    printed = [r["name"] for _, r in whole]
    excluded = [r["name"] for _, r in whole if r["name"].endswith(EXCLUDED_SUFFIXES)]
    kept = [r for _, r in whole if not r["name"].endswith(EXCLUDED_SUFFIXES)]
    if len(set(printed)) != len(printed):
        problems.append("Two printed rows have the same name.")
    new = [r["name"] for r in kept if r["name"] not in SPEC]
    gone = [n for n in SPEC if n not in {r["name"] for r in kept}]
    if new:
        problems.append(f"New whole-item rows not in SPEC (decide category, serving, rankable): {new}")
    if gone:
        problems.append(f"SPEC rows no longer in the PDF: {gone}")
    if problems:
        print("The guide has changed shape: re-check tools/uk_extract/tortilla.py against the PDF before running again.", file=sys.stderr)
        for p in problems:
            print(" -", p, file=sys.stderr)
        return 1

    items = []
    for r in kept:
        category, serving, rankable, extra_tags, note = SPEC[r["name"]]
        tags = (["vegetarian"] if r["veg"] else []) + extra_tags
        items.append({
            "name": r["name"], "category": category, "serving": serving,
            "calories": r["kcal"], "protein_g": r["protein"], "carbs_g": r["carbs"], "fat_g": r["fat"],
            "sat_fat_g": r["sat"], "sodium_mg": "", "salt_g": r["salt"], "sugar_g": r["sugars"], "fiber_g": r["fibre"],
            "tags": "|".join(tags), "limited_time": False, "rankable": rankable, "components": "", "added_on": "", "notes": note,
        })
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: PDF order inside a category
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Tortilla", cuisine="Mexican", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["tortilla", "tortilla burritos and tacos", "tortilla burritos & tacos"],
        items=items, out=args.out, note=NOTE, holdback=HOLDBACK)
    print(f"wrote {len(items)} items ({len(HOLDBACK)} of them held back) to {out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    print(f"left out: {len(excluded)} rows labelled Canary Wharf only / Belfast, {len(HOT_DRINKS)} hot drinks (calories only), "
          f"{sum(INGREDIENT_PAGE_ROWS.values())} ingredient rows on {len(INGREDIENT_PAGE_ROWS)} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())
