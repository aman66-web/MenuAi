#!/usr/bin/env python3
"""Build data/source/wendys/ from Wendy's UK's official "Nutrition Information" PDF (UK national menu).

    python3 tools/uk_extract/wendys.py path/to/United-Kingdom-National-Nutrition-Information---9.10.2026.pdf --checked-on 2026-10-06

Numbers are copied from the PDF as printed: kcal, fat, saturates, carbohydrates, sugars, fibre, protein, salt (there is
no kJ column), per menu item as sold. The weight printed in the first column is copied into `serving` ("213 g") and into weight_g.
Only the NAMES, categories, rankable flags and meat tags below are typed by hand, in the PDF's reading order. The script
stops if the number of rows, any row label or any section changes, so a human re-checks the names when Wendy's edits the guide.

Source: https://www.wendys.com/sites/default/files/2026-09/United-Kingdom-National-Nutrition-Information---9.10.2026.pdf
(linked from https://www.wendys.com/en-gb/nutrition; printed "September 2026", PDF created 17 Sep 2026).

Allergens come from the same PDF's allergen columns (wendys_pdf.py): "✓" = contains, a dot = may contain, copied per row.
The guide prints columns for ten allergens only (celery, egg, fish, barley, rye, milk, mustard, soy, wheat, sesame) and says
it gives "current information on the known instances of the 14 major allergens", so an allergen without a column is one the
guide marks for no item. Gluten cereals are named as the guide names them (barley, rye, wheat).

Left out on purpose (see the `None` rows): the five dip pots, whose weight is printed as 100 g (values are per 100 g of sauce,
not per pot), and the second copy of the Jr. Crispy Chicken Sandwich (identical numbers, listed again under Kid's Meal).
"""
from __future__ import annotations
import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wendys_pdf  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "wendys"
SOURCE_URL = "https://www.wendys.com/sites/default/files/2026-09/United-Kingdom-National-Nutrition-Information---9.10.2026.pdf"
SOURCE_TITLE = "Wendy's UK National Nutrition Information (September 2026)"
ALLERGEN_TITLE = "Wendy's UK National Nutrition Information, allergen columns (September 2026)"
ALIASES = ["wendys", "wendy's", "wendys uk", "wendys burgers"]

BU, CH, WR, SL, SI, KD, BF, FR, DR = "Burgers", "Chicken", "Wraps", "Salads", "Sides", "Kids", "Breakfast", "Frosty & desserts", "Drinks"
PORK, BEEF = "contains_pork", "contains_beef"
H, C, W, S, K, F, B, V, D = ("HAMBURGERS", "CHICKEN", "WRAPS", "SALADS INCLUDES TOPPINGS & DRESSINGS", "SIDES", "KID'S MEAL",
                             "FROSTY®", "BREAKFAST", "BEVERAGES")
CONDIMENTS = "CONDIMENTS"
NOT_STATED = "Meat type not stated in the guide"
BACON = "Name says bacon (pork); patty type not stated in the guide"
SAUCE_NOTE = "Printed weight is 100 g for every dip pot (a pot is far lighter): these are per-100 g values, so not published"

# One entry per printed row, in the PDF's order: (printed label, printed section, name, category, rankable, tags, note).
# name None = a row we deliberately leave out; `note` then gives the reason (printed in the run summary).
ROWS: list[tuple] = [
    # HAMBURGERS
    ("Wendy's Single", H, "Wendy's Single", BU, True, [], NOT_STATED),
    ("Wendy's Double", H, "Wendy's Double", BU, True, [], NOT_STATED),
    ("Wendy's Triple", H, "Wendy's Triple", BU, True, [], NOT_STATED),
    ("Baconator", H, "Baconator", BU, True, [PORK], BACON),
    ("Jr. Cheeseburger Deluxe", H, "Jr. Cheeseburger Deluxe", BU, True, [], NOT_STATED),
    ("Jr. Bacon Cheeseburger", H, "Jr. Bacon Cheeseburger", BU, True, [PORK], BACON),
    ("BBQ Bacon Melt Single Cheeseburger", H, "BBQ Bacon Melt Single Cheeseburger", BU, True, [PORK], BACON),
    ("BBQ Bacon Melt Double Cheeseburger", H, "BBQ Bacon Melt Double Cheeseburger", BU, True, [PORK], BACON),
    ("BBQ Bacon Melt Triple Cheeseburger", H, "BBQ Bacon Melt Triple Cheeseburger", BU, True, [PORK], BACON),
    # CHICKEN
    ("Spicy Chicken", C, "Spicy Chicken", CH, True, [], ""),
    ("Classic Chicken", C, "Classic Chicken", CH, True, [], ""),
    ("Avocado Chicken Club", C, "Avocado Chicken Club", CH, True, [], ""),
    ("Jr. Crispy Chicken Sandwich", C, "Jr. Crispy Chicken Sandwich", CH, True, [], "Listed again, with identical numbers, under Kid's Meal"),
    ("BBQ Bacon Melt Classic Chicken", C, "BBQ Bacon Melt Classic Chicken", CH, True, [PORK], "Name says bacon (pork)"),
    ("BBQ Bacon Melt Spicy Chicken", C, "BBQ Bacon Melt Spicy Chicken", CH, True, [PORK], "Name says bacon (pork)"),
    ("4 Pc Boneless Bites", C, "4 Pc Boneless Bites", CH, True, [], ""),
    ("8 Pc Boneless Bites", C, "8 Pc Boneless Bites", CH, True, [], ""),
    ("11 Pc Boneless Bites", C, "11 Pc Boneless Bites", CH, True, [], ""),
    ("12 Pc Boneless Bites", C, "12 Pc Boneless Bites", CH, True, [], ""),
    ("20 Pc Boneless Bites", C, "20 Pc Boneless Bites", CH, True, [], ""),
    ("4 Pc Spicy Boneless Bites", C, "4 Pc Spicy Boneless Bites", CH, True, [], ""),
    ("8 Pc Spicy Boneless Bites", C, "8 Pc Spicy Boneless Bites", CH, True, [], ""),
    ("11 Pc Spicy Boneless Bites", C, "11 Pc Spicy Boneless Bites", CH, True, [], ""),
    ("12 Pc Spicy Boneless Bites", C, "12 Pc Spicy Boneless Bites", CH, True, [], ""),
    ("20 Pc Spicy Boneless Bites", C, "20 Pc Spicy Boneless Bites", CH, True, [], ""),
    ("8 Pc Buffalo Saucy Boneless Bites", C, "8 Pc Buffalo Saucy Boneless Bites", CH, True, [], ""),
    ("12 Pc Buffalo Saucy Classic Boneless Bites", C, "12 Pc Buffalo Saucy Classic Boneless Bites", CH, True, [], ""),
    ("8 Pc Buffalo Saucy Spicy Boneless Bites", C, "8 Pc Buffalo Saucy Spicy Boneless Bites", CH, True, [], ""),
    ("12 Pc Buffalo Saucy Spicy Boneless Bites", C, "12 Pc Buffalo Saucy Spicy Boneless Bites", CH, True, [], ""),
    ("8 Pc BBQ Saucy Classic Boneless Bites", C, "8 Pc BBQ Saucy Classic Boneless Bites", CH, True, [], ""),
    ("12 Pc BBQ Saucy Classic Boneless Bites", C, "12 Pc BBQ Saucy Classic Boneless Bites", CH, True, [], ""),
    ("8 Pc BBQ Saucy Spicy Boneless Bites", C, "8 Pc BBQ Saucy Spicy Boneless Bites", CH, True, [], ""),
    ("12 Pc BBQ Saucy Spicy Boneless Bites", C, "12 Pc BBQ Saucy Spicy Boneless Bites", CH, True, [], ""),
    ("3 Pc Chicken Tenders", C, "3 Pc Chicken Tenders", CH, True, [], ""),
    ("4 Pc Chicken Tenders", C, "4 Pc Chicken Tenders", CH, True, [], ""),
    ("5 Pc Chicken Tenders", C, "5 Pc Chicken Tenders", CH, True, [], ""),
    ("6 Pc Chicken Tenders", C, "6 Pc Chicken Tenders", CH, True, [], ""),
    # WRAPS
    ("Avocado Wrap w/ Chicken Tender", W, "Avocado Wrap w/ Chicken Tender", WR, True, [], ""),
    ("Avocado Wrap w/ Halloumi Fries", W, "Avocado Wrap w/ Halloumi Fries", WR, True, [], ""),
    ("Avocado Wrap w/ Halloumi Fries (Duo Wrap)", W, "Avocado Wrap w/ Halloumi Fries (Duo Wrap)", WR, True, [], ""),
    ("Signature Wrap w/ Chicken Tender", W, "Signature Wrap w/ Chicken Tender", WR, True, [], ""),
    ("Signature Wrap w/ Halloumi Fries", W, "Signature Wrap w/ Halloumi Fries", WR, True, [], ""),
    ("Signature Wrap w/ Halloumi Fries (Duo Wrap)", W, "Signature Wrap w/ Halloumi Fries (Duo Wrap)", WR, True, [], ""),
    ("BBQ Wrap w/ Chicken Tender", W, "BBQ Wrap w/ Chicken Tender", WR, True, [], ""),
    ("BBQ Wrap w/ Halloumi Fries", W, "BBQ Wrap w/ Halloumi Fries", WR, True, [], ""),
    ("BBQ Wrap w/ Halloumi Fries (Duo Wrap)", W, "BBQ Wrap w/ Halloumi Fries (Duo Wrap)", WR, True, [], ""),
    ("Buffalo Wrap w/ Chicken Tender", W, "Buffalo Wrap w/ Chicken Tender", WR, True, [], ""),
    ("Buffalo Wrap w/ Halloumi Fries", W, "Buffalo Wrap w/ Halloumi Fries", WR, True, [], ""),
    # SALADS (heading: "includes toppings & dressings")
    ("Caesar Salad", S, "Caesar Salad", SL, True, [], ""),
    ("Caesar Salad w/ Classic Chicken", S, "Caesar Salad w/ Classic Chicken", SL, True, [], ""),
    ("Caesar Salad w/ Spicy Chicken", S, "Caesar Salad w/ Spicy Chicken", SL, True, [], ""),
    ("Caesar Salad w/ Halloumi Fries", S, "Caesar Salad w/ Halloumi Fries", SL, True, [], ""),
    ("Avocado Salad", S, "Avocado Salad", SL, True, [], ""),
    ("Avocado Salad w/ Classic Chicken", S, "Avocado Salad w/ Classic Chicken", SL, True, [], ""),
    ("Avocado Salad w/ Spicy Chicken", S, "Avocado Salad w/ Spicy Chicken", SL, True, [], ""),
    ("Avocado Salad w/ Halloumi Fries", S, "Avocado Salad w/ Halloumi Fries", SL, True, [], ""),
    # SIDES
    ("Small Fries", K, "Small Fries", SI, True, [], ""),
    ("Medium Fries", K, "Medium Fries", SI, True, [], ""),
    ("Large Fries", K, "Large Fries", SI, True, [], ""),
    ("Baconator Fries", K, "Baconator Fries", SI, True, [PORK], "Name says bacon (pork)"),
    ("Cheesy Topped Fries", K, "Cheesy Topped Fries", SI, True, [], ""),
    ("BBQ Topped Fries", K, "BBQ Topped Fries", SI, True, [], ""),
    ("Plain Potato", K, "Plain Potato", SI, True, [], ""),
    ("Bacon & Cheese Potato", K, "Bacon & Cheese Potato", SI, True, [PORK], "Name says bacon (pork)"),
    ("Sour Cream and Chives Potato", K, "Sour Cream and Chives Potato", SI, True, [], ""),
    ("Chili", K, "Chili", SI, True, [], NOT_STATED),
    ("Chili Cheese Fries", K, "Chili Cheese Fries", SI, True, [], NOT_STATED),
    ("Chili Cheese Baked Potato", K, "Chili Cheese Baked Potato", SI, True, [], NOT_STATED),
    ("Halloumi Fries", K, "Halloumi Fries", SI, True, [], ""),
    ("Beef Chili Cheese Fries", K, "Beef Chili Cheese Fries", SI, True, [BEEF], "Name says beef"),
    ("Chocolate Pop Dots", K, "Chocolate Pop Dots", FR, False, [], "Printed under Sides; a dessert, so grouped with Frosty and not suggested as a meal"),
    # KID'S MEAL
    ("Kid's Cheeseburger", F, "Kid's Cheeseburger", KD, True, [], NOT_STATED),
    ("Kid's Hamburger", F, "Kid's Hamburger", KD, True, [], NOT_STATED),
    ("4 Pc Chicken Nuggets", F, "4 Pc Chicken Nuggets", KD, True, [], ""),
    ("Jr. Crispy Chicken Sandwich", F, None, "", False, [], "second copy of the Jr. Crispy Chicken Sandwich (identical numbers) already listed under Chicken"),
    # FROSTY
    ("Jr. Vanilla Frosty", B, "Jr. Vanilla Frosty", FR, False, [], ""),
    ("Regular Vanilla Frosty", B, "Regular Vanilla Frosty", FR, False, [], ""),
    ("Large Vanilla Frosty", B, "Large Vanilla Frosty", FR, False, [], ""),
    ("X-Large Vanilla Frosty", B, "X-Large Vanilla Frosty", FR, False, [], ""),
    ("Jr. Chocolate Frosty", B, "Jr. Chocolate Frosty", FR, False, [], ""),
    ("Regular Chocolate Frosty", B, "Regular Chocolate Frosty", FR, False, [], ""),
    ("Large Chocolate Frosty", B, "Large Chocolate Frosty", FR, False, [], ""),
    ("X-Large Chocolate Frosty", B, "X-Large Chocolate Frosty", FR, False, [], ""),
    ("Regular Vanilla Strawberries & Cream Frosty", B, "Regular Vanilla Strawberries & Cream Frosty", FR, False, [], ""),
    ("Large Vanilla Strawberries & Cream Frosty", B, "Large Vanilla Strawberries & Cream Frosty", FR, False, [], ""),
    ("Regular Chocolate Strawberries & Cream Frosty", B, "Regular Chocolate Strawberries & Cream Frosty", FR, False, [], ""),
    ("Large Chocolate Strawberries & Cream Frosty", B, "Large Chocolate Strawberries & Cream Frosty", FR, False, [], ""),
    ("Regular Vanilla Frostyccino", B, "Regular Vanilla Frostyccino", FR, False, [], ""),
    ("Large Vanilla Frostyccino", B, "Large Vanilla Frostyccino", FR, False, [], ""),
    ("Regular Chocolate Frostyccino", B, "Regular Chocolate Frostyccino", FR, False, [], ""),
    ("Large Chocolate Frostyccino", B, "Large Chocolate Frostyccino", FR, False, [], ""),
    # BREAKFAST
    ("Classic Egg & Cheese Muffin", V, "Classic Egg & Cheese Muffin", BF, True, [], ""),
    ("Classic Sausage & Cheese Muffin", V, "Classic Sausage & Cheese Muffin", BF, True, [PORK], "Name says sausage (pork)"),
    ("Classic Bacon & Cheese Muffin", V, "Classic Bacon & Cheese Muffin", BF, True, [PORK], "Name says bacon (pork)"),
    ("Breakfast Baconator w/ Brown Sauce", V, "Breakfast Baconator w/ Brown Sauce", BF, True, [PORK], BACON),
    ("Breakfast Baconator w/ Red Sauce", V, "Breakfast Baconator w/ Red Sauce", BF, True, [PORK], BACON),
    ("Egg Double Stack", V, "Egg Double Stack", BF, True, [], ""),
    ("Sausage Breakfast Butty w/ Brown Sauce", V, "Sausage Breakfast Butty w/ Brown Sauce", BF, True, [PORK], "Name says sausage (pork)"),
    ("Bacon Breakfast Butty w/ Brown Sauce", V, "Bacon Breakfast Butty w/ Brown Sauce", BF, True, [PORK], "Name says bacon (pork)"),
    ("Sausage Breakfast Butty w/ Red Sauce", V, "Sausage Breakfast Butty w/ Red Sauce", BF, True, [PORK], "Name says sausage (pork)"),
    ("Bacon Breakfast Butty w/ Red Sauce", V, "Bacon Breakfast Butty w/ Red Sauce", BF, True, [PORK], "Name says bacon (pork)"),
    ("Breakfast Wrap Bacon w/ Red Sauce", V, "Breakfast Wrap Bacon w/ Red Sauce", BF, True, [PORK], "Name says bacon (pork)"),
    ("Breakfast Wrap Sausage w/ Red Sauce", V, "Breakfast Wrap Sausage w/ Red Sauce", BF, True, [PORK], "Name says sausage (pork)"),
    ("Breakfast Wrap Egg & Cheese w/ Red Sauce", V, "Breakfast Wrap Egg & Cheese w/ Red Sauce", BF, True, [], ""),
    ("Breakfast Wrap Bacon w/ Brown Sauce", V, "Breakfast Wrap Bacon w/ Brown Sauce", BF, True, [PORK], "Name says bacon (pork)"),
    ("Breakfast Wrap Sausage w/ Brown Sauce", V, "Breakfast Wrap Sausage w/ Brown Sauce", BF, True, [PORK], "Name says sausage (pork)"),
    ("Breakfast Wrap Egg & Cheese w/ Brown Sauce", V, "Breakfast Wrap Egg & Cheese w/ Brown Sauce", BF, True, [], ""),
    ("Small Hashbrown", V, "Small Hashbrown", SI, True, [], "Printed under Breakfast; sold in three sizes, so listed with the sides"),
    ("Regular Hashbrown", V, "Regular Hashbrown", SI, True, [], "Printed under Breakfast; sold in three sizes, so listed with the sides"),
    ("Large Hashbrown", V, "Large Hashbrown", SI, True, [], "Printed under Breakfast; sold in three sizes, so listed with the sides"),
    ("Apple Slices", V, "Apple Slices", SI, True, [], "Printed under Breakfast; listed with the sides"),
    ("6 Pc Mini Donuts", V, "6 Pc Mini Donuts", FR, False, [], "Printed under Breakfast; a dessert, so grouped with Frosty and not suggested as a meal"),
    # BEVERAGES
    ("Can Coke", D, "Can Coke", DR, False, [], ""),
    ("Can Diet Coke", D, "Can Diet Coke", DR, False, [], ""),
    ("Can Coke Zero", D, "Can Coke Zero", DR, False, [], ""),
    ("Can Sprite", D, "Can Sprite", DR, False, [], ""),
    ("Coke Small Drink 12 oz", D, "Coke (small, 12 oz)", DR, False, [], ""),
    ("Diet Coke Small Drink 12 oz", D, "Diet Coke (small, 12 oz)", DR, False, [], ""),
    ("Coke Zero Small Drink 12 oz", D, "Coke Zero (small, 12 oz)", DR, False, [], ""),
    ("Orange Fanta Small Drink 12 oz", D, "Orange Fanta (small, 12 oz)", DR, False, [], ""),
    ("Sprite Zero Small Drink 12 oz", D, "Sprite Zero (small, 12 oz)", DR, False, [], ""),
    ("Coke Regular Drink 16 oz", D, "Coke (regular, 16 oz)", DR, False, [], ""),
    ("Diet Coke Regular Drink 16 oz", D, "Diet Coke (regular, 16 oz)", DR, False, [], ""),
    ("Coke Zero Regular Drink 16 oz", D, "Coke Zero (regular, 16 oz)", DR, False, [], ""),
    ("Orange Fanta Regular Drink 16 oz", D, "Orange Fanta (regular, 16 oz)", DR, False, [], ""),
    ("Sprite Zero Regular Drink 16 oz", D, "Sprite Zero (regular, 16 oz)", DR, False, [], ""),
    ("Coke Large Drink 20 oz", D, "Coke (large, 20 oz)", DR, False, [], ""),
    ("Diet Coke Large Drink 20 oz", D, "Diet Coke (large, 20 oz)", DR, False, [], ""),
    ("Coke Zero Large Drink 20 oz", D, "Coke Zero (large, 20 oz)", DR, False, [], ""),
    ("Orange Fanta Large Drink 20 oz", D, "Orange Fanta (large, 20 oz)", DR, False, [], ""),
    ("Sprite Zero Large Drink 20 oz", D, "Sprite Zero (large, 20 oz)", DR, False, [], ""),
    ("Espresso", D, "Espresso", DR, False, [], ""),
    ("Americano", D, "Americano", DR, False, [], ""),
    ("Flat White", D, "Flat White", DR, False, [], ""),
    ("Cappuccino", D, "Cappuccino", DR, False, [], ""),
    ("Latte", D, "Latte", DR, False, [], ""),
    ("Mocha", D, "Mocha", DR, False, [], ""),
    ("Tea", D, "Tea", DR, False, [], ""),
    ("Hot Chocolate", D, "Hot Chocolate", DR, False, [], ""),
    # CONDIMENTS
    ("Buttermilk Ranch Dip Pot", CONDIMENTS, None, "", False, [], SAUCE_NOTE),
    ("Honey BBQ Dip Pot", CONDIMENTS, None, "", False, [], SAUCE_NOTE),
    ("Smokin' Hot Dip Pot", CONDIMENTS, None, "", False, [], SAUCE_NOTE),
    ("Sweet Chili Dip Pot", CONDIMENTS, None, "", False, [], SAUCE_NOTE),
    ("Signature Dip Pot", CONDIMENTS, None, "", False, [], SAUCE_NOTE),
]

# Rows the guide prints impossibly: kept in items.csv for the record but listed in holdback.csv (never corrected).
HOLDBACK: dict[str, str] = {
    "BBQ Topped Fries": ("The guide prints 19.3 g of salt for this 226 g serving (8.5% of its weight, about three times the adult daily "
                         "limit); the other fries rows print 1.7 to 2.6 g."),
}

NOTE = ("The guide prints no ingredients, so the pork and beef filters only know what an item's name says (bacon, sausage, "
        "beef); its burgers and chili don't state their meat. The five dip pots are not listed because the guide prints "
        "them only as 100 g each.")

CATEGORY_ORDER = [BU, CH, WR, SL, SI, KD, BF, FR, DR]

# Odd-but-possible things the pipeline or a reader of the PDF may flag, by printed label (go to `notes`, which is not exported).
ODDITIES: dict[str, str] = {
    "BBQ Topped Fries": "Salt printed as 19.3 g for 226 g (8.5% of the weight; the other fries rows print 1.7 to 2.6 g): looks like a typo for 1.93, held back and not corrected",
    "Small Fries": "Salt 2.1 g is 2.6% of the 81 g weight and the same number as Medium Fries (98 g)",
    "Medium Fries": "Salt 2.1 g is the same number as Small Fries (81 g)",
    "Sour Cream and Chives Potato": "Salt printed as 0.04 g although Plain Potato prints 1.9 g; entered as printed",
    "Flat White": "Every printed number is identical to the Latte row",
    "Latte": "Every printed number is identical to the Flat White row",
    "Large Vanilla Frostyccino": "Weight 421 g is 66 g more than the regular but only 6 kcal more; entered as printed",
    "Large Chocolate Frostyccino": "Weight 421 g is 66 g more than the regular but only 7 kcal more; entered as printed",
    "Tea": "Printed weight is 31 g; every nutrient printed as 0",
    "3 Pc Chicken Tenders": "Salt is 3.0% of the weight in all four tender sizes (4 to 8 g); entered as printed",
    "4 Pc Chicken Tenders": "Salt is 3.0% of the weight in all four tender sizes (4 to 8 g); entered as printed",
    "5 Pc Chicken Tenders": "Salt is 3.0% of the weight in all four tender sizes (4 to 8 g); entered as printed",
    "6 Pc Chicken Tenders": "Salt is 3.0% of the weight in all four tender sizes (4 to 8 g); entered as printed",
    "11 Pc Spicy Boneless Bites": "Fibre printed as 1 here and for 12 Pc but 0 for 8 Pc and 20 Pc",
    "12 Pc Spicy Boneless Bites": "Fibre printed as 1 here and for 11 Pc but 0 for 8 Pc and 20 Pc",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    rows = wendys_pdf.read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}. The layout or menu changed: "
              "re-check the names in ROWS against the PDF before running again.", file=sys.stderr)
        return 1
    for n, (printed, spec) in enumerate(zip(rows, ROWS), start=1):
        if printed["label"] != spec[0] or printed["section"] != spec[1]:
            print(f"Row {n}: the PDF prints {printed['label']!r} under {printed['section']!r} but this script expects "
                  f"{spec[0]!r} under {spec[1]!r}. The menu changed: re-check ROWS.", file=sys.stderr)
            return 1

    items, first_seen, excluded = [], {}, []
    for printed, (label, _section, name, category, rankable, tags, note) in zip(rows, ROWS):
        v = printed["values"]
        printed_allergens = (tuple(printed["allergens"]["contains"]), tuple(printed["allergens"]["may_contain"]))
        if name is None:
            if label in first_seen and first_seen[label] != (tuple(v.values()), printed_allergens):
                print(f"{label!r} appears twice with different numbers or allergens: it is not a plain duplicate. Re-check.", file=sys.stderr)
                return 1
            excluded.append((label, note))
            continue
        first_seen[label] = (tuple(v.values()), printed_allergens)
        contains, cereals, nuts = allergen_words(printed["allergens"]["contains"], f"{label} (contains)")
        may, _, _ = allergen_words(printed["allergens"]["may_contain"], f"{label} (may contain)")
        notes = "; ".join(x for x in (note, ODDITIES.get(label, "")) if x)
        items.append({
            "name": name, "category": category, "serving": f"{v['weight']} g",
            "calories": v["kcal"], "protein_g": v["protein"], "carbs_g": v["carbs"], "fat_g": v["fat"],
            "sat_fat_g": v["sat"], "salt_g": v["salt"], "sugar_g": v["sugars"], "fiber_g": v["fibre"], "weight_g": v["weight"],
            "tags": "|".join(tags), "rankable": rankable, "limited_time": False, "notes": notes,
            "allergens": {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts},
        })
    ids = [slug(i["name"]) for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    held = [(slug(n), why) for n, why in HOLDBACK.items()]
    unknown = [h for h, _ in held if h not in ids]
    if unknown:
        print(f"HOLDBACK names items that are not in the guide any more: {unknown}", file=sys.stderr)
        return 1
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    out = write_chain_folder(chain_id=CHAIN_ID, name="Wendy's", cuisine="Burgers", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=held,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    print(f"wrote {len(items)} items ({len(held)} held back) to {out}; PDF has {len(rows)} rows, {len(excluded)} left out "
          f"(PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    for label, why in excluded:
        print(f"  left out: {label}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
