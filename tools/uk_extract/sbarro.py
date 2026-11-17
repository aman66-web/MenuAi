#!/usr/bin/env python3
"""Build data/source/sbarro/ from Sbarro UK's official "SBARRO UK | NUTRITION GUIDE - NOVEMBER 2026" PDF.

    python3 tools/uk_extract/sbarro.py path/to/guide.pdf --checked-on 2026-11-17

Source: https://www.sbarro.co.uk/_files/ugd/3da10b_777bf395a499494da813aada871f13c2.pdf
(the one PDF linked from https://www.sbarro.co.uk/nutritional-information on 2026-11-17; 7 pages, 55,194 bytes, sha256
951bffee2e6877ca9f6428e067e56fc84c191486af190bd69654fc2914f3bd1d). It replaces the August 2026 guide
(3da10b_04caa1f5c88441d588b76ca40bfaef78.pdf), which the page no longer links.

The November 2026 layout (read by sbarro_pdf.read_rows_v2): pages 1-4 are one table, Category, Item Name, Serving Size,
Weight (g), then Energy (kcal), Fat, Saturates, Carbs, Sugars, Protein and Salt, ALL PER SERVING (the August guide's per-100 g
columns are gone). kJ and fibre are not printed. Salt is salt_g. The weight column becomes weight_g (as printed, a trailing
"g" dropped) except for drinks (a bottle size in ml, or not the drink's weight at all: a 12oz Black Americano prints 14) and the
Ben & Jerry's rows (a "1 x 100ml portion", so the 100 is millilitres): those are left blank. Pages 5-7 are an allergen table.

Only the NAMES, categories, servings, tags and the hold-backs below are typed by hand, in the PDF's row order. Each row is
checked against the printed category, name and serving, so if Sbarro adds, removes, reorders or renames a row (or the layout
changes) this script stops with a clear message and a human re-checks ROWS. The script also stops if the first page no longer
says "NOVEMBER 2026" (a new edition: re-check everything and update SOURCE_TITLE).

Every row is tested against its own printed numbers (consistency_problems below: saturates above fat, sugars above
carbohydrate, more grams of carbohydrate + protein + fat than the printed weight, more than 930 kcal per 100 g of printed weight,
energy more than 30% away from 4 x protein + 4 x carbohydrate + 9 x fat). A row is held back (holdback.csv, still listed in
items.csv, never corrected) when its numbers are impossible or when it is one of the rows below whose per-serving figures are the
same as the August 2026 guide printed while that guide's own weight and per-100 g columns contradicted them (the November guide
no longer prints per-100 g figures, so nothing shows they were corrected). The script stops if a row that is not held back fails
the tests, and if a "same as August" row's calories differ from August's (then the row has changed and must be judged again).

Allergens: LINK ONLY (allergen_guide.csv, no allergens.csv). The November allergen pages print "Contains" and "May Contain" as
words, but rows cover several items at once ("Veggie Volcano - (all sizes & slices)", one row for both nugget portions), the
four Stromboli rows list Soy as both contains and may contain, and the August guide's allergen columns could not show 7 of the
14 allergens. Reading them would be a separate decision (all or nothing per chain, docs/DATA.md), so the app links to the guide.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sbarro_pdf  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "sbarro"
SOURCE_URL = "https://www.sbarro.co.uk/_files/ugd/3da10b_777bf395a499494da813aada871f13c2.pdf"
SOURCE_TITLE = "Sbarro UK Nutrition Guide (November 2026)"
GUIDE_EDITION = ("NOVEMBER", "2026")     # printed under the title on page 1
ALLERGEN_GUIDE = {"title": "Sbarro UK Allergen Guide (November 2026)", "url": SOURCE_URL, "may_contain_published": True}
NOTE = ("Sbarro's guide prints whole 12in, 14in and 17in pizzas and slices of the 17in pizzas (1/6) and of the 16in Stuffed "
        "Sausage Pepperoni (1/8); each item says which. Rows printed with impossible figures, or with the same figures that the "
        "August 2026 guide's own columns contradicted, are left out until Sbarro corrects them.")

SLICE, WHOLE, STROM, SIDES, DESSERT = "Pizza slices", "Whole pizzas", "Stromboli", "Sides", "Desserts"
EXTRAS, HOT, COLD = "Sauces & extras", "Hot drinks", "Cold drinks"
CATEGORY_ORDER = [SLICE, WHOLE, STROM, SIDES, DESSERT, EXTRAS, HOT, COLD]
PORK = "contains_pork"
BOTTLE = None   # serving built from the printed bottle size ("1 bottle (500ml)")
SLICE17 = "1 slice (1/6 of a 17in pizza)"
PORK_PEPPERONI = "Pork from 'pepperoni' in the name"
PORK_HAM = "Pork from 'ham' in the name"


def I(category, printed_name, printed_serving, name, cat, serving, rank=True, tags="", note="", item_id="", weight=True):
    return {"printed": (category, printed_name, printed_serving), "name": name, "category": cat, "serving": serving,
            "rankable": rank, "tags": tags, "note": note, "id": item_id, "weight": weight}


# One entry per printed row, in the PDF's reading order (page 1 top to page 4). Names keep the ids of the August 2026 items
# where the product is the same (a slice printed as "Pepperoni Slice" is still "Pepperoni 17in (slice)").
ROWS: list[dict] = [
    I("Stromboli", "Pepperoni & Cheese Stromboli", "1 Stromboli", "Pepperoni & Cheese Stromboli", STROM, "1 stromboli", tags=PORK, note=PORK_PEPPERONI),
    I("Stromboli", "Spinach & Ricotta Stromboli", "1 Stromboli", "Spinach & Ricotta Stromboli", STROM, "1 stromboli"),
    I("Stromboli", "Chicken & Cheese Stromboli", "1 Stromboli", "Chicken & Cheese Stromboli", STROM, "1 stromboli"),
    I("Stromboli", "Ham & Cheese Stromboli", "1 Stromboli", "Ham & Cheese Stromboli", STROM, "1 stromboli", tags=PORK, note=PORK_HAM),
    I("Soft Drinks", "7Up", "1 Bottle", "7Up", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Beverages Pepsi Max Cherry", "1 Bottle", "Pepsi Max Cherry", COLD, BOTTLE, rank=False,
      note="The name cell also prints the word 'Beverages' above the name"),
    I("Soft Drinks", "Diet Pepsi", "1 Bottle", "Diet Pepsi", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Fruit Shoot - Apple & Blackcurrant", "1 Bottle", "Fruit Shoot - Apple & Blackcurrant", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Fruit Shoot - Orange", "1 Bottle", "Fruit Shoot - Orange", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Pepsi Max", "1 Bottle", "Pepsi Max", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Pepsi Regular", "1 Bottle", "Pepsi Regular", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Robinsons - Orange and Mango", "1 Bottle", "Robinsons - Orange and Mango", COLD, BOTTLE, rank=False,
      note="Sugars printed as 0 with 9.5 g carbohydrate; entered as printed"),
    I("Soft Drinks", "Robinsons Blueberry & Blackberry", "1 Bottle", "Robinsons Blueberry & Blackberry", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Robinsons Peach and Mango", "1 Bottle", "Robinsons Peach and Mango", COLD, BOTTLE, rank=False,
      note="Prints 50 kcal per bottle with 10.1 g carbohydrate (about 40 kcal); the August 2026 guide's per-100 g columns said the same "
           "(10.0 kcal, 2.0 g carbohydrate), so it is the source's rounding, not a typo; entered as printed"),
    I("Soft Drinks", "Tango Orange", "1 Bottle", "Tango Orange", COLD, BOTTLE, rank=False),
    I("Soft Drinks", "Water", "1 Bottle", "Water", COLD, BOTTLE, rank=False,
      note="Prints 16.5 kcal and 3.3 g sugars for a 275ml bottle of 'Water'; entered as printed (may be a flavoured water: the guide doesn't say)"),
    I("Sides & Snacks", "CHEESY WEDGES (McCain)", "1 Portion", "Cheesy Wedges", SIDES, "1 portion"),
    I("Sides & Snacks", "Nachos", "1 Portion", "Nachos", SIDES, "1 portion"),
    I("Sides & Snacks", "Nachos XL", "1 Portion", "Nachos XL", SIDES, "1 portion"),
    I("Sides & Snacks", "Potato Wedges (McCain)", "1 Portion", "Potato Wedges", SIDES, "1 portion"),
    I("Sides & Snacks", "SBARRO - Breaded Mozzarella sticks (UK)", "4 Breadsticks", "Breaded Mozzarella Sticks", SIDES, "4 sticks",
      note="Serving printed as '4 Breadsticks'"),
    I("Sides & Snacks", "SBARRO - Chicken Strips (UK)", "4 Strips", "Chicken Strips", SIDES, "4 strips"),
    I("Sides & Snacks", "SBARRO - Halal Chicken Nuggets, 4 portion (UK)", "4 Nuggets", "Halal Chicken Nuggets (4)", SIDES, "4 nuggets"),
    I("Sides & Snacks", "SBARRO - Halal Chicken Nuggets, 6 portion (UK)", "6 Nuggets", "Halal Chicken Nuggets (6)", SIDES, "6 nuggets"),
    I("Sides & Snacks", "SBARRO - Hot & Kickin' Chicken Wings (UK)", "4 Wings", "Hot & Kickin' Chicken Wings", SIDES, "4 wings"),
    I("Sides & Snacks", "Stuffed Breadstick", "1 Breadstick", "Stuffed Breadstick", SIDES, "1 breadstick", rank=False,
      note="Per piece, so not suggested as a meal on its own"),
    I("Sides & Snacks", "Sides Cheesy Bread", "1 Portion", "Cheesy Bread", SIDES, "1 portion",
      note="The name cell also prints the word 'Sides' above the name"),
    I("Sauces & Extras", "Dip Pot - Deluxe BBQ Sauce", "1 Pot", "Dip Pot - Deluxe BBQ Sauce", EXTRAS, "1 pot", rank=False),
    I("Sauces & Extras", "Dip Pot - Garlic & Herb_x000D_", "1 Pot", "Dip Pot - Garlic & Herb", EXTRAS, "1 pot", rank=False,
      note="Name printed with a stray '_x000D_' (a spreadsheet line-break code)"),
    I("Sauces & Extras", "Dip Pot - Ketchup With a Kick of Chilli", "1 Pot", "Dip Pot - Ketchup With a Kick of Chilli", EXTRAS, "1 pot", rank=False),
    I("Sauces & Extras", "Dip Pot - Perinnaise", "1 Pot", "Dip Pot - Perinnaise", EXTRAS, "1 pot", rank=False, note="Name printed 'Perinnaise'"),
    I("Sauces & Extras", "Dip Pot - Spicy Fried Chicken Sauce", "1 Pot", "Dip Pot - Spicy Fried Chicken Sauce", EXTRAS, "1 pot", rank=False),
    I("Sauces & Extras", "Dip Pot - Sweet Chilli Sauce", "1 Pot", "Dip Pot - Sweet Chilli Sauce", EXTRAS, "1 pot", rank=False),
    I("Sauces & Extras", "Heinz BBQ Sauce Dip Pots", "1 Pot", "Heinz BBQ Sauce Dip Pot", EXTRAS, "1 pot", rank=False),
    I("Sauces & Extras", "Heinz Mayonnaise Dip Pots", "1 Pot", "Heinz Mayonnaise Dip Pot", EXTRAS, "1 pot", rank=False),
    I("Sauces & Extras", "Heinz Tomato Ketchup Dip Pots", "1 Pot", "Heinz Tomato Ketchup Dip Pot", EXTRAS, "1 pot", rank=False),
    I("Sauces & Extras", "Monin Caramel syrup", "1 Portion", "Monin Caramel Syrup", EXTRAS, "1 portion", rank=False),
    I("Sauces & Extras", "MONIN HAZELNUT SYRUP", "1 Portion", "Monin Hazelnut Syrup", EXTRAS, "1 portion", rank=False),
    I("Sauces & Extras", "Monin Vanilla syrup", "1 Portion", "Monin Vanilla Syrup", EXTRAS, "1 portion", rank=False),
    I("Pizza Slice", "Veggie Volcano Slice", '1 Slice, 1/6 17" Pizza', "Veggie Volcano Pizza (slice)", SLICE, SLICE17),
    I("Pizza Slice", "BBQ Chicken Slice", '1 Slice, 1/6 17" Pizza', "BBQ Chicken 17in (slice)", SLICE, SLICE17),
    I("Pizza Slice", "Firecracker Slice", '1 Slice, 1/6 17" Pizza', "Firecracker 17in (slice)", SLICE, SLICE17, note="Meat content not stated"),
    I("Pizza Slice", "Stuffed Sausage Pepperoni", '1 Slice, 1/8 16" Pizza', "Stuffed Sausage Pepperoni (slice)", SLICE,
      "1 slice (1/8 of a 16in pizza)", tags=PORK, note="Pork from 'sausage' and 'pepperoni' in the name"),
    I("Pizza Slice", "Pepperoni Slice", '1 Slice, 1/6 17" Pizza', "Pepperoni 17in (slice)", SLICE, SLICE17, tags=PORK, note=PORK_PEPPERONI),
    I("Pizza Slice", "Chicken Tikka Pizza Slice", "1 Slice (1/6 of 17in pizza)", "Chicken Tikka Pizza 17in (slice)", SLICE, SLICE17),
    I("Pizza Slice", "Cheese Pizza Slice", "1 Slice, 1/6 Pizza", "Cheese Pizza 17in (slice)", SLICE, "1 slice (1/6 pizza)",
      note="Printed as 'Cheese Pizza Slice', 1/6 pizza, without a size; its weight is one sixth of the 17in Cheese Pizza row"),
    I("Pizza Slice", "MEAT FEAST SLICE", '1 Slice, 1/6 17" Pizza', "Meat Feast 17in (slice)", SLICE, SLICE17, note="Meat type not stated"),
    I("Pizza Slice", "Ham & Mushroom Slice", '1 Slice, 1/6 17" Pizza', "Ham & Mushroom 17in (slice)", SLICE, SLICE17, tags=PORK, note=PORK_HAM),
    I('Pizza 17"', "Pepperoni 17in", "Whole Pizza", "Pepperoni 17in", WHOLE, "Whole pizza", tags=PORK, note=PORK_PEPPERONI),
    I('Pizza 17"', 'Veggie Volcano 17"', "Whole pizza", "Veggie Volcano 17in", WHOLE, "Whole pizza"),
    I('Pizza 17"', 'BBQ Chicken 17"', "Whole Pizza,", "BBQ Chicken 17in", WHOLE, "Whole pizza"),
    I('Pizza 17"', "Firecracker 17in", "Whole Pizza", "Firecracker 17in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I('Pizza 17"', 'Cheese Pizza 17"', 'Whole 17" Pizza', "Cheese Pizza 17in", WHOLE, "Whole pizza"),
    I('Pizza 17"', "Chicken Tikka Pizza 17in", "Whole 17in pizza", "Chicken Tikka Pizza 17in", WHOLE, "Whole pizza"),
    I('Pizza 17"', "HAM & MUSHROOM 17in (UK)", "Whole Pizza", "Ham & Mushroom 17in", WHOLE, "Whole pizza", tags=PORK, note=PORK_HAM),
    I('Pizza 17"', "MEAT FEAST 17in (UK)", "Whole Pizza", "Meat Feast 17in", WHOLE, "Whole pizza", note="Meat type not stated"),
    I('Pizza 16"', "Stuffed Sausage Pepperoni", "Whole Pizza", "Stuffed Sausage Pepperoni 16in", WHOLE, "Whole pizza", tags=PORK,
      note="Pork from 'sausage' and 'pepperoni' in the name"),
    I('Pizza 14"', "Pepperoni 14in", "Whole Pizza", "Pepperoni 14in", WHOLE, "Whole pizza", tags=PORK, note=PORK_PEPPERONI),
    I('Pizza 14"', 'Veggie Volcano 14"', "Whole Pizza", "Veggie Volcano 14in", WHOLE, "Whole pizza"),
    I('Pizza 14"', 'BBQ Chicken 14"', "Whole Pizza", "BBQ Chicken 14in", WHOLE, "Whole pizza"),
    I('Pizza 14"', "Firecracker 14in", "Whole Pizza", "Firecracker 14in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I('Pizza 14"', "Cheese Pizza 14in", "Whole Pizza", "Cheese Pizza 14in", WHOLE, "Whole pizza"),
    I('Pizza 14"', "Chicken Tikka Pizza 14in", "Whole 14in pizza", "Chicken Tikka Pizza 14in", WHOLE, "Whole pizza"),
    I('Pizza 14"', "HAM & MUSHROOM 14in (UK)", "Whole Pizza", "Ham & Mushroom 14in", WHOLE, "Whole pizza", tags=PORK, note=PORK_HAM),
    I('Pizza 14"', "MEAT FEAST 14in (UK)", "Whole Pizza", "Meat Feast 14in", WHOLE, "Whole pizza", note="Meat type not stated"),
    I('Pizza 12"', "Pepperoni 12in", "Whole Pizza", "Pepperoni 12in", WHOLE, "Whole pizza", tags=PORK, note=PORK_PEPPERONI),
    I('Pizza 12"', "Pizza HAM & MUSHROOM 12in (UK)", "Whole Pizza", "Ham & Mushroom 12in", WHOLE, "Whole pizza", tags=PORK,
      note=PORK_HAM + "; the name cell also prints the word 'Pizza' above the name"),
    I('Pizza 12"', 'Veggie Volcano 12"', "Whole Pizza", "Veggie Volcano 12in", WHOLE, "Whole pizza"),
    I('Pizza 12"', 'BBQ Chicken 12"', "Whole Pizza", "BBQ Chicken 12in", WHOLE, "Whole pizza"),
    I('Pizza 12"', "Firecracker 12in", "Whole Pizza", "Firecracker 12in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I('Pizza 12"', "Cheese Pizza 12in", "Whole Pizza", "Cheese Pizza 12in", WHOLE, "Whole pizza"),
    I('Pizza 12"', "Chicken Tikka Pizza 12in", "Whole 12in pizza", "Chicken Tikka Pizza 12in", WHOLE, "Whole pizza"),
    I('Pizza 12"', "MEAT FEAST 12in (UK)", "Whole Pizza", "Meat Feast 12in", WHOLE, "Whole pizza", note="Meat type not stated"),
    I("Pizza & Bakery", "Cheesy Garlic Breadsticks", "1 Breadstick", "Cheesy Garlic Breadsticks", SIDES, "1 breadstick", rank=False,
      note="Per piece, so not suggested as a meal on its own"),
    I("Hot Drinks", "Black Americano (Large)", "16oz", "Black Americano (Large)", HOT, "16oz", rank=False),
    I("Hot Drinks", "Black Americano (Regular)", "12oz", "Black Americano (Regular)", HOT, "12oz", rank=False),
    I("Hot Drinks", "Cappuccino (Large)", "16oz", "Cappuccino (Large)", HOT, "16oz", rank=False),
    I("Hot Drinks", "Cappuccino (Regluar)", "12oz", "Cappuccino (Regular)", HOT, "12oz", rank=False, note="Printed 'Regluar' (typo in the guide)"),
    I("Hot Drinks", "Flat white", "8oz", "Flat White", HOT, "8oz", rank=False),
    I("Hot Drinks", "Hot Chocolate (Large)", "16oz", "Hot Chocolate (Large)", HOT, "16oz", rank=False),
    I("Hot Drinks", "Hot Chocolate (Regular)", "12oz", "Hot Chocolate (Regular)", HOT, "12oz", rank=False),
    I("Hot Drinks", "Latte (Large)", "16oz", "Latte (Large)", HOT, "16oz", rank=False),
    I("Hot Drinks", "Latte (Regular)", "12oz", "Latte (Regular)", HOT, "12oz", rank=False),
    I("Hot Drinks", "White Americano (Large)", "16oz", "White Americano (Large)", HOT, "16oz", rank=False),
    I("Hot Drinks", "White Americano (Regular)", "12oz", "White Americano (Regular)", HOT, "12oz", rank=False),
    I("Desserts", "Pre-Packaged Sbarro Milk Chocolate Cookie", "1 Cookie", "Pre-Packaged Milk Chocolate Cookie", DESSERT, "1 cookie", rank=False),
    I("Desserts", "Ben & Jerry's Brookies & Cream 100ml", "1 × 100ml portion", "Ben & Jerry's Brookies & Cream 100ml", DESSERT,
      "1 x 100ml portion", rank=False, weight=False),
    I("Desserts", "Ben & Jerry's Caramel Chew Chew 100ml", "1 × 100ml portion", "Ben & Jerry's Caramel Chew Chew 100ml", DESSERT,
      "1 x 100ml portion", rank=False, weight=False),
    I("Desserts", "Ben & Jerry's Cookie Dough 465ml", "1 × 100ml portion", "Ben & Jerry's Cookie Dough (100ml portion)", DESSERT,
      "1 x 100ml portion", rank=False, weight=False,
      note="The guide lists the 465ml tub ('Ben & Jerry's Cookie Dough 465ml') but prints its figures for 1 x 100ml portion; the whole tub is not given"),
    I("Desserts", "Ben & Jerry's Strawberry Cheesecake 100ml", "1 × 100ml portion", "Ben & Jerry's Strawberry Cheesecake 100ml", DESSERT,
      "1 x 100ml portion", rank=False, weight=False),
    I("Desserts", "Ice Cream (Yarde Farm)", "1 each", "Ice Cream (Yarde Farm)", DESSERT, "1 each", rank=False, item_id="ice-cream"),
    I("Desserts", "Portuguese Custard Tart 60g", "1 tart (58g nutrition basis)", "Portuguese Custard Tart", DESSERT,
      "1 tart (58g nutrition basis)", rank=False, note="Listed as a 60g tart; the guide says its figures are for 58g"),
    I("Desserts", "SBARRO - Cookie Dough - Milk Chocolate (UK)", "1 Portion", "Cookie Dough - Milk Chocolate", DESSERT, "1 portion", rank=False),
    I("Desserts", "SBARRO - Cookie Dough - White Chocolate (UK)", "1 Portion", "Cookie Dough - White Chocolate", DESSERT, "1 portion", rank=False),
    I("Breakfast", "Ham, Egg & Cheese Strombolini", "1 Strombolini", "Ham, Egg & Cheese Strombolini", STROM, "1 strombolini", tags=PORK, note=PORK_HAM),
    I("Breakfast", "Sausage, Egg & Cheese Strombolini", "1 Strombolini", "Sausage, Egg & Cheese Strombolini", STROM, "1 strombolini", tags=PORK,
      note="Pork from 'sausage' in the name"),
    I("Addon", "Nachos Addon - Chicken", "1 Portion", "Nachos add-on - Chicken", EXTRAS, "1 portion", rank=False),
    I("Addon", "Nachos Addon - Pepperoni", "1 Portion", "Nachos add-on - Pepperoni", EXTRAS, "1 portion", rank=False, tags=PORK, note=PORK_PEPPERONI),
    I("Addon", "Nachos Addon - Sausage", "1 Portion", "Nachos add-on - Sausage", EXTRAS, "1 portion", rank=False, tags=PORK,
      note="Pork from 'sausage' in the name"),
]


# ---- consistency tests on a row's OWN printed numbers --------------------------------------------------------------

def num(text: str) -> float:
    m = re.match(r"<?(\d+(?:\.\d+)?)", text)
    if not m:
        raise ValueError(f"not a number: {text!r}")
    return float(m.group(1))


def grams(p: dict, spec: dict) -> float | None:
    """The printed weight in grams, or None where it is not a weight in grams (drinks, the 100ml ice-cream portions)."""
    if not spec["weight"] or spec["category"] in (HOT, COLD):
        return None
    return num(p["weight"])


def consistency_problems(p: dict, spec: dict) -> list[str]:
    """Problems in one printed row. An empty list means its printed numbers can all be true."""
    out = []
    if num(p["sugars"]) > num(p["carbs"]) + 0.05:
        out.append(f"sugars ({p['sugars']} g) above carbohydrate ({p['carbs']} g)")
    if num(p["sat"]) > num(p["fat"]) + 0.05:
        out.append(f"saturates ({p['sat']} g) above total fat ({p['fat']} g)")
    w = grams(p, spec)
    macros = num(p["carbs"]) + num(p["protein"]) + num(p["fat"])
    if w is not None:
        if macros > w * 1.05 + 1:
            out.append(f"{macros:.1f} g of carbohydrate, protein and fat in a {p['weight']} g serving")
        if num(p["kcal"]) / w * 100 > 930:
            out.append(f"{num(p['kcal']) / w * 100:,.0f} kcal per 100 g of its printed weight")
    implied = 4 * num(p["protein"]) + 4 * num(p["carbs"]) + 9 * num(p["fat"])
    kcal = num(p["kcal"])
    if kcal >= 50 and abs(kcal - implied) > 0.30 * kcal:
        out.append(f"{p['kcal']} kcal against about {implied:,.0f} kcal from its protein, carbohydrate and fat")
    return out


# Rows the August 2026 guide printed with these same per-serving figures while its own weight and per-100 g columns contradicted
# them (the reason given then, copied from that run's holdback.csv, and the per-serving kcal it printed). The November guide no
# longer prints per-100 g figures, so nothing shows the figures were corrected: still held back. The script stops if a row's
# calories no longer match August's (then judge the row again).
SAME_AS_AUGUST = {
    "Veggie Volcano 12in": ("1298.2", "The guide's own columns disagree: its weight (677.0) x 218.2 kcal per 100 g comes to about 1,477 kcal, "
                                      "but the per-serving column prints 1298.2 kcal. Sugars (about 44 g vs 19.5 g) and salt (11.5 g vs 7.7 g) "
                                      "disagree by the same sum."),
    "Veggie Volcano 14in": ("1866.0", "The guide's own columns disagree: its weight (960.0) x 209.2 kcal per 100 g comes to about 2,008 kcal, "
                                      "but the per-serving column prints 1866.0 kcal. Fat (about 40 g vs 64.5 g), sugars (78 g vs 27 g) and salt "
                                      "(21 g vs 10.1 g) disagree far more."),
    "Ham, Egg & Cheese Strombolini": ("714.2", "The guide's own columns disagree: its weight (233.7) x 248.0 kcal per 100 g comes to about 580 "
                                               "kcal, but the per-serving column prints 714.2 kcal. The per-serving numbers equal a 288 g "
                                               "Stromboli's weight x per-100 g, not the printed serving."),
    "Sausage, Egg & Cheese Strombolini": ("798.2", "The guide's own columns disagree: its weight (258.7) x 277.2 kcal per 100 g comes to about 717 "
                                                   "kcal, but the per-serving column prints 798.2 kcal. The per-serving numbers equal a 288 g "
                                                   "Stromboli's weight x per-100 g, not the printed serving."),
    "Hot Chocolate (Regular)": ("356.3", "Prints 89.3 g carbohydrate + 32.1 g fat + 11.4 g protein = 132.8 g per 100 g (impossible) and 710.0 "
                                         "kcal per 100 g, against 356.3 kcal per 360.0 g serving."),
    "Hot Chocolate (Large)": ("459.3", "Prints 89.3 g carbohydrate + 32.1 g fat + 11.4 g protein = 132.8 g per 100 g (impossible) and 710.0 "
                                       "kcal per 100 g, against 459.3 kcal per 473.0 g serving."),
    "Cheesy Wedges": ("465", "The guide's own columns disagree: its weight (260) x 290.625 kcal per 100 g comes to about 756 kcal, but the "
                             "per-serving column prints 465 kcal."),
}


def same_as_august_reason(name: str, p: dict) -> str:
    _, then = SAME_AS_AUGUST[name]
    return (f"The November 2026 guide prints the same per-serving figures ({p['kcal']} kcal) as the August 2026 guide, where Sbarro's own "
            f"columns contradicted them: {then} The November guide no longer prints per-100 g figures, so nothing shows they were corrected.")


def held_by_name(by_name: dict[str, dict]) -> dict[str, str]:
    """Rows held back because their own printed November figures are impossible or plainly copied (computed from the rows)."""
    vv_slice, vv17 = by_name["Veggie Volcano Pizza (slice)"], by_name["Veggie Volcano 17in"]
    other17 = [num(by_name[n]["weight"]) for n in ("Pepperoni 17in", "BBQ Chicken 17in", "Firecracker 17in", "Cheese Pizza 17in",
                                                  "Chicken Tikka Pizza 17in", "Ham & Mushroom 17in", "Meat Feast 17in")]
    diet, regular = by_name["Diet Pepsi"], by_name["Pepsi Regular"]
    vs_macros = num(vv_slice["carbs"]) + num(vv_slice["protein"]) + num(vv_slice["fat"])
    return {
        "Veggie Volcano Pizza (slice)": (
            f"Printed as a {vv_slice['weight']} g slice with {vv_slice['kcal']} kcal and {vv_slice['carbs']} g carbohydrate, "
            f"{vv_slice['protein']} g protein and {vv_slice['fat']} g fat: {vs_macros:.1f} g of those in a {vv_slice['weight']} g slice, "
            f"about {num(vv_slice['kcal']) / num(vv_slice['weight']) * 100:,.0f} kcal per 100 g (impossible). The August 2026 guide printed the same row."),
        "Veggie Volcano 17in": (
            f"Printed as a whole 17in pizza of only {vv17['weight']} g (the guide's other whole 17in pizzas weigh {min(other17):,.0f} g to "
            f"{max(other17):,.0f} g): {vv17['kcal']} kcal in {vv17['weight']} g would be about "
            f"{num(vv17['kcal']) / num(vv17['weight']) * 100:,.0f} kcal per 100 g (impossible). The August 2026 guide printed the same row."),
        "Diet Pepsi": (
            f"Prints {diet['kcal']} kcal and {diet['sugars']} g of sugars for a diet drink (the Pepsi Regular row prints {regular['kcal']} kcal "
            f"and {regular['sugars']} g); it looks copied from the regular row, as in the August 2026 guide."),
    }


def guide_edition(pdf: Path) -> tuple[str, str]:
    words = [w for w in sbarro_pdf._words(pdf) if w["page"] == 1]
    first = sorted(words, key=lambda w: (round(w["y"]), w["x"]))
    lines: dict[int, list[str]] = {}
    for w in first:
        lines.setdefault(round(w["y"]), []).append(w["t"])
    texts = [" ".join(v) for _, v in sorted(lines.items())][:3]
    if not texts or "NUTRITION GUIDE" not in texts[0]:
        raise SystemExit(f"page 1 does not start with 'SBARRO UK | NUTRITION GUIDE' ({texts}): a different file?")
    edition = tuple(texts[1].split()) if len(texts) > 1 else ()
    return edition


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDF")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if len(NOTE) >= 400:
        print(f"NOTE is {len(NOTE)} characters; the limit is 400", file=sys.stderr)
        return 1

    edition = guide_edition(args.pdf)
    if edition != GUIDE_EDITION:
        print(f"Page 1 prints the edition {' '.join(edition)!r}, not {' '.join(GUIDE_EDITION)!r}: a new guide. Re-check every row and "
              "update SOURCE_TITLE, GUIDE_EDITION and SOURCE_URL before running again.", file=sys.stderr)
        return 1
    try:
        printed_rows = sbarro_pdf.read_rows_v2(args.pdf)
    except sbarro_pdf.PdfLayoutError as e:
        print(e, file=sys.stderr)
        return 1
    if len(printed_rows) != len(ROWS):
        print(f"The PDF has {len(printed_rows)} nutrition rows but this script names {len(ROWS)}. The guide or its layout "
              "changed: re-check the names in ROWS against the PDF before running again.", file=sys.stderr)
        return 1
    for i, (p, spec) in enumerate(zip(printed_rows, ROWS)):
        got = (p["category"], p["name"], p["serving"])
        if any(sbarro_pdf.norm(a) != sbarro_pdf.norm(b) for a, b in zip(got, spec["printed"])):
            print(f"Row {i + 1} (page {p['page']}) is printed as {got!r} but ROWS expects {spec['printed']!r}. "
                  "Re-check the names in ROWS against the PDF.", file=sys.stderr)
            return 1

    by_name: dict[str, dict] = {}     # item name -> printed row
    spec_of: dict[str, dict] = {}
    items: list[dict] = []
    for p, spec in zip(printed_rows, ROWS):
        serving = spec["serving"]
        if serving is BOTTLE:
            if not p["weight"].endswith("ml"):
                print(f"{spec['name']}: bottle size printed {p['weight']!r}, not in ml: re-check before running again.", file=sys.stderr)
                return 1
            serving = f"1 bottle ({p['weight']})"
        if spec["name"] in by_name:
            print(f"Two rows are named {spec['name']!r} in ROWS.", file=sys.stderr)
            return 1
        by_name[spec["name"]], spec_of[spec["name"]] = p, spec
        weight = ""
        if spec["weight"] and spec["category"] not in (HOT, COLD):
            m = re.fullmatch(r"(\d+(?:\.\d+)?)g?", p["weight"])
            if not m:
                print(f"{spec['name']}: printed weight {p['weight']!r} is not grams: re-check before running again.", file=sys.stderr)
                return 1
            weight = m.group(1)
        items.append({
            "id": spec["id"] or slug(spec["name"]), "name": spec["name"], "category": spec["category"], "serving": serving,
            "calories": p["kcal"], "protein_g": p["protein"], "carbs_g": p["carbs"], "fat_g": p["fat"],
            "sat_fat_g": p["sat"], "salt_g": p["salt"], "sugar_g": p["sugars"], "weight_g": weight,
            "tags": spec["tags"], "rankable": spec["rankable"], "notes": spec["note"],
        })

    ids = [i["id"] for i in items]
    if len(ids) != len(set(ids)):
        print("Two items got the same id: give them different names in ROWS.", file=sys.stderr)
        return 1
    unknown = [n for n in SAME_AS_AUGUST if n not in by_name]
    if unknown:
        print(f"SAME_AS_AUGUST names an item that is not in ROWS: {unknown}", file=sys.stderr)
        return 1
    for n, (kcal_then, _) in SAME_AS_AUGUST.items():
        if abs(num(by_name[n]["kcal"]) - float(kcal_then)) > 0.051:
            print(f"{n}: now prints {by_name[n]['kcal']} kcal, the August 2026 guide printed {kcal_then}: the row changed, judge it again "
                  "(remove it from SAME_AS_AUGUST if the new figures hold).", file=sys.stderr)
            return 1
    held = {n: same_as_august_reason(n, by_name[n]) for n in SAME_AS_AUGUST}
    held.update(held_by_name(by_name))

    new_problems = {n: consistency_problems(p, spec_of[n]) for n, p in by_name.items() if n not in held}
    new_problems = {n: pr for n, pr in new_problems.items() if pr}
    if new_problems:
        for n, pr in new_problems.items():
            print(f"{n}: {'; '.join(pr)}", file=sys.stderr)
        print("These rows fail the consistency tests but are not held back. Decide: hold them back (with a reason) "
              "or, if the guide is right after all, change the tests.", file=sys.stderr)
        return 1
    for n in held:
        if not consistency_problems(by_name[n], spec_of[n]):
            print(f"note: {n} is held back by hand (it passes the automatic tests)")

    id_of = {i["name"]: i["id"] for i in items}
    holdback = [(id_of[n], reason) for n, reason in held.items()]
    for it in items:
        it["category_rank"] = CATEGORY_ORDER.index(it["category"])
    items.sort(key=lambda it: it["category_rank"])
    write_chain_folder(
        chain_id=CHAIN_ID, name="Sbarro", cuisine="Pizza", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["sbarro", "sbarro pizza"], items=items, out=args.out, note=NOTE, holdback=holdback,
        allergen_guide={**ALLERGEN_GUIDE, "checked_on": args.checked_on})   # link only: items carry no allergens (see docstring)
    sha = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {args.out} (PDF sha256 {sha})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
