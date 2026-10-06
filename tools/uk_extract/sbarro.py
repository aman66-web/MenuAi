#!/usr/bin/env python3
"""Build data/source/sbarro/ from Sbarro UK's official "UK Nutritional & Allergen Guide - August 2026" PDF.

    python3 tools/uk_extract/sbarro.py path/to/guide.pdf --checked-on 2026-10-06

Source: https://www.sbarro.co.uk/_files/ugd/3da10b_04caa1f5c88441d588b76ca40bfaef78.pdf
(linked from https://www.sbarro.co.uk/nutritional-information). The PDF is an Excel export with 15 numeric columns:
weight, then kcal, fat, saturates, carbs, sugars, protein and salt, each per 100 g AND per serving. ONLY THE PER-SERVING
COLUMNS ARE USED (nothing is converted from per-100 g). kJ and fibre are not printed. Salt is salt_g.

Only the NAMES, categories, servings, tags and the hold-backs below are typed by hand, in the PDF's row order. Each row
is checked against the printed name and serving, so if Sbarro adds, removes, reorders or renames a row (or the layout
changes) this script stops with a clear message and a human re-checks ROWS.

The guide is messy, so every row is also tested against its own columns (consistency_problems below). A row is held back
(holdback.csv, still listed in items.csv, never corrected) when its printed numbers are impossible or when its weight,
per-100 g and per-serving columns cannot all be true. The script stops if a row that is not held back fails those tests,
so a new problem in a later guide is never published by accident.
"""
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sbarro_pdf  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "sbarro"
SOURCE_URL = "https://www.sbarro.co.uk/_files/ugd/3da10b_04caa1f5c88441d588b76ca40bfaef78.pdf"
SOURCE_TITLE = "Sbarro UK Nutritional & Allergen Guide (August 2026)"
NOTE = ("Sbarro's guide prints the 12in and 14in pizzas whole but most 17in pizzas per slice (each item says which). "
        "Rows where the guide's own weight, per-100 g and per-serving columns contradict each other are left out until Sbarro corrects it.")

SLICE, WHOLE, STROM, SIDES, DESSERT = "Pizza slices", "Whole pizzas", "Stromboli", "Sides", "Desserts"
SALAD, EXTRAS, HOT, COLD = "Salads", "Sauces & extras", "Hot drinks", "Cold drinks"
CATEGORY_ORDER = [SLICE, WHOLE, STROM, SIDES, SALAD, DESSERT, EXTRAS, HOT, COLD]
PORK = "contains_pork"
BEEF = "contains_beef"
BOTTLE = None   # serving built from the printed bottle size ("1 bottle (500ml)")

SLICE_NOTE = "The guide prints this 17in row per slice (1/6 pizza), unlike the 12in and 14in rows, which are whole pizzas."


def I(printed_name, printed_serving, name, category, serving, rank=True, tags="", note=""):
    return {"printed": (printed_name, printed_serving), "name": name, "category": category, "serving": serving,
            "rankable": rank, "tags": tags, "note": note}


def D(printed_name, printed_serving, of):
    """A row the guide prints twice with identical numbers: published once (as `of`), checked identical."""
    return {"printed": (printed_name, printed_serving), "dup_of": of}


# One entry per printed row, in the PDF's reading order (page 1 top to page 6).
ROWS: list[dict] = [
    I("HAM & MUSHROOM 12in (UK)", "Whole Pizza", "Ham & Mushroom 12in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'ham' in the name"),
    I("Nachos", "1 Portion", "Nachos", SIDES, "1 portion"),
    I("Nachos XL", "1 Portion", "Nachos XL", SIDES, "1 portion"),
    I("Nachos Addon - Chicken", "1 Portion", "Nachos add-on - Chicken", EXTRAS, "1 portion", rank=False),
    I("Nachos Addon - Sausage", "1 Portion", "Nachos add-on - Sausage", EXTRAS, "1 portion", rank=False, tags=PORK, note="Pork from 'sausage' in the name"),
    I("Nachos Addon - Pepperoni", "1 Portion", "Nachos add-on - Pepperoni", EXTRAS, "1 portion", rank=False, tags=PORK, note="Pork from 'pepperoni' in the name"),
    I("HAM & MUSHROOM 14in (UK)", "Whole Pizza", "Ham & Mushroom 14in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'ham' in the name"),
    I("HAM & MUSHROOM 17in (UK)", "Whole Pizza", "Ham & Mushroom 17in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'ham' in the name"),
    I("MEAT FEAST 12in (UK)", "Whole Pizza", "Meat Feast 12in", WHOLE, "Whole pizza", note="Meat type not stated"),
    I("MEAT FEAST 14in (UK)", "Whole Pizza", "Meat Feast 14in", WHOLE, "Whole pizza", note="Meat type not stated"),
    I("MEAT FEAST 17in (UK)", "Whole Pizza", "Meat Feast 17in", WHOLE, "Whole pizza", note="Meat type not stated"),
    I("Cheese Pizza 12in", "Whole Pizza", "Cheese Pizza 12in", WHOLE, "Whole pizza"),
    I("Cheese Pizza 14in", "Whole Pizza", "Cheese Pizza 14in", WHOLE, "Whole pizza"),
    I("Cheese Pizza 17in", "1 Slice, 1/6 Pizza", "Cheese Pizza 17in (slice)", SLICE, "1 slice (1/6 pizza)", note=SLICE_NOTE),
    I('Pulled Chicken & Pepperoni Pizza 17"', 'Whole 17" Pizza', "Pulled Chicken & Pepperoni Pizza 17in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'pepperoni' in the name"),
    I('Pulled Chicken & Pepperoni Pizza 14"', 'Whole 14" Pizza', "Pulled Chicken & Pepperoni Pizza 14in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'pepperoni' in the name"),
    I('Pulled Chicken & Pepperoni Pizza 12"', 'Whole 12" Pizza', "Pulled Chicken & Pepperoni Pizza 12in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'pepperoni' in the name"),
    I("Pulled Chicken & Pepperoni Slice", "Whole Slice", "Pulled Chicken & Pepperoni Pizza (slice)", SLICE, "1 slice", tags=PORK, note="Pork from 'pepperoni' in the name; printed serving is 'Whole Slice'"),
    I("Veggie Volcano 12in", "Whole Pizza", "Veggie Volcano 12in", WHOLE, "Whole pizza"),
    I("Veggie Volcano 14in", "Whole Pizza", "Veggie Volcano 14in", WHOLE, "Whole pizza"),
    I("Veggie Volcano 17in", "Whole pizza", "Veggie Volcano 17in", WHOLE, "Whole pizza"),
    I("Veggie Volcano Slice", "Slice", "Veggie Volcano Pizza (slice)", SLICE, "1 slice"),
    I("Pepperoni 12in", "Whole Pizza", "Pepperoni 12in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'pepperoni' in the name"),
    I("Pepperoni 14in", "Whole Pizza", "Pepperoni 14in", WHOLE, "Whole pizza", tags=PORK, note="Pork from 'pepperoni' in the name"),
    I("Pepperoni 17in", "1 Slice, 1/6 Pizza", "Pepperoni 17in (slice)", SLICE, "1 slice (1/6 pizza)", tags=PORK, note="Pork from 'pepperoni' in the name. " + SLICE_NOTE),
    I("BBQ Chicken 12in", "Whole Pizza", "BBQ Chicken 12in", WHOLE, "Whole pizza",
      note="Per-serving saturates (19 g) are higher than weight x per-100 g (about 13.5 g; per-100 g is a whole number); entered as printed"),
    I("BBQ Chicken 14in", "Whole Pizza", "BBQ Chicken 14in", WHOLE, "Whole pizza",
      note="Per-serving saturates (28 g) are higher than weight x per-100 g (about 19.4 g; per-100 g is a whole number); entered as printed"),
    I("BBQ Chicken 17in", "1 Slice, 1/6 Pizza", "BBQ Chicken 17in (slice)", SLICE, "1 slice (1/6 pizza)", note=SLICE_NOTE),
    I("Firecracker 12in", "Whole Pizza", "Firecracker 12in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I("Firecracker 14in", "Whole Pizza", "Firecracker 14in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I("Firecracker 17in", "1 Slice, 1/6 Pizza", "Firecracker 17in (slice)", SLICE, "1 slice (1/6 pizza)",
      note="Printed twice with identical numbers; entered once. Meat content not stated. " + SLICE_NOTE),
    D("Firecracker 17in", "1 Slice, 1/6 Pizza", of="Firecracker 17in (slice)"),
    I("Cheeseburger (Classic, Spicy, BBQ) 12in", "Whole Pizza", "Cheeseburger (Classic, Spicy, BBQ) 12in", WHOLE, "Whole pizza",
      note="One row covers the Classic, Spicy and BBQ cheeseburger pizzas. Meat type not stated"),
    I("Cheeseburger (Classic, Spicy, BBQ) 14in", "Whole Pizza", "Cheeseburger (Classic, Spicy, BBQ) 14in", WHOLE, "Whole pizza",
      note="One row covers the Classic, Spicy and BBQ cheeseburger pizzas. Meat type not stated"),
    I("Cheeseburger (Classic, Spicy, BBQ) 17in", "1 Slice, 1/6 Pizza", "Cheeseburger (Classic, Spicy, BBQ) 17in (slice)", SLICE, "1 slice (1/6 pizza)",
      note="One row covers the Classic, Spicy and BBQ cheeseburger pizzas. Meat type not stated. " + SLICE_NOTE),
    I("SBARRO - Festive Pizza 12in (UK)", "Whole Pizza", "Festive Pizza 12in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I("SBARRO - Festive Pizza 14in (UK)", "Whole Pizza", "Festive Pizza 14in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I("SBARRO - Festive Pizza 17in (UK)", "Whole Pizza", "Festive Pizza 17in", WHOLE, "Whole pizza", note="Meat content not stated"),
    I("SBARRO - Festive Pizza Slice (UK)", "Slice", "Festive Pizza (slice)", SLICE, "1 slice", note="Meat content not stated"),
    I("Stuffed Breadstick", "1 Breadstick", "Stuffed Breadstick", SIDES, "1 breadstick", rank=False,
      note="Per piece, so not suggested as a meal on its own. The cell text is 'Stuffed Breadstick' but the printout clips the first line and shows 'Breadstick'"),
    I("Stuffed Sausage Pepperoni", "1 Slice, 1/8 Pizza", "Stuffed Sausage Pepperoni (slice)", SLICE, "1 slice (1/8 pizza)", tags=PORK,
      note="Pork from 'sausage' and 'pepperoni' in the name"),
    I("Spinach & Ricotta Stromboli", "1 Stromboli", "Spinach & Ricotta Stromboli", STROM, "1 stromboli"),
    I("Ham & Cheese Stromboli", "1 Stromboli", "Ham & Cheese Stromboli", STROM, "1 stromboli", tags=PORK, note="Pork from 'ham' in the name"),
    I("Chicken & Cheese Stromboli", "1 Stromboli", "Chicken & Cheese Stromboli", STROM, "1 stromboli"),
    I("Pepperoni & Cheese Stromboli", "1 Stromboli", "Pepperoni & Cheese Stromboli", STROM, "1 stromboli", tags=PORK, note="Pork from 'pepperoni' in the name"),
    I("Sbarro - Classic Lemonade Cooler", "16oz", "Classic Lemonade Cooler", COLD, "16oz", rank=False),
    I("Sbarro - Dragon & Passion Fruit Cooler", "16oz", "Dragon & Passion Fruit Cooler", COLD, "16oz", rank=False),
    I("Ham, Egg & Cheese Strombolini", "1 Stromboli ni", "Ham, Egg & Cheese Strombolini", STROM, "1 strombolini", tags=PORK, note="Pork from 'ham' in the name"),
    I("Sausage, Egg & Cheese Strombolini", "1 Stromboli ni", "Sausage, Egg & Cheese Strombolini", STROM, "1 strombolini", tags=PORK, note="Pork from 'sausage' in the name"),
    I('Breakfast pizza 17"', '17" Pizza', "Breakfast Pizza 17in", WHOLE, "17in pizza"),
    I("Breakfast pizza Slice", "Pizza Slice", "Breakfast Pizza (slice)", SLICE, "1 slice",
      note="Meat content not stated. Per-serving values are about 5% above weight (273 g) x per-100 g (they equal 288 g x per-100 g); entered as printed"),
    I('Breakfast pizza 14"', '14" Pizza', "Breakfast Pizza 14in", WHOLE, "14in pizza"),
    I('Breakfast pizza 12"', '12" Pizza', "Breakfast Pizza 12in", WHOLE, "12in pizza"),
    I("Hashbrown x 1", "1 Hashbrow n", "Hashbrown", SIDES, "1 hashbrown", rank=False, note="Per piece, so not suggested as a meal on its own"),
    I("Hashbrown x2", "2 Hashbrow ns", "Hashbrown x2", SIDES, "2 hashbrowns", rank=False),
    I("Monin Caramel syrup", "1 Portion", "Monin Caramel Syrup", EXTRAS, "1 portion", rank=False),
    I("MONIN HAZELNUT SYRUP PLASTIC", "1 Portion", "Monin Hazelnut Syrup", EXTRAS, "1 portion", rank=False),
    I("Monin Vanilla syrup", "1 Portion", "Monin Vanilla Syrup", EXTRAS, "1 portion", rank=False),
    I("Latte (Regular)", "12oz", "Latte (Regular)", HOT, "12oz", rank=False),
    I("Latte (Large)", "16oz", "Latte (Large)", HOT, "16oz", rank=False),
    I("Cappuccino (Regluar)", "12oz", "Cappuccino (Regular)", HOT, "12oz", rank=False, note="Printed 'Regluar' (typo in the guide)"),
    I("Cappuccino (Large)", "16oz", "Cappuccino (Large)", HOT, "16oz", rank=False),
    I("White Americano (Regular)", "12oz", "White Americano (Regular)", HOT, "12oz", rank=False),
    I("White Americano (Large)", "16oz", "White Americano (Large)", HOT, "16oz", rank=False),
    I("Black Americano (Regular)", "12oz", "Black Americano (Regular)", HOT, "12oz", rank=False),
    I("Black Americano (Large)", "16oz", "Black Americano (Large)", HOT, "16oz", rank=False),
    I("Flat white", "8oz", "Flat White", HOT, "8oz", rank=False),
    I("Hot Chocolate (Regular)", "12oz", "Hot Chocolate (Regular)", HOT, "12oz", rank=False),
    I("Hot Chocolate (Large)", "16oz", "Hot Chocolate (Large)", HOT, "16oz", rank=False),
    I("Cheesy Bread", "1 Order", "Cheesy Bread", SIDES, "1 order"),
    I("Cheesy Garlic Breadsticks", "1 Each", "Cheesy Garlic Breadsticks", SIDES, "1 each", rank=False, note="Per piece, so not suggested as a meal on its own"),
    I("Cinnamon Breadstick (UK)", "2", "Cinnamon Breadstick (2)", DESSERT, "", rank=False, note="Serving printed as just '2'; the count is kept in the name"),
    I("Potato Wedges (McCain)", "1 Serving", "Potato Wedges", SIDES, "1 serving"),
    I("CHEESY WEDGES (McCain)", "1 Serving", "Cheesy Wedges", SIDES, "1 serving"),
    I("SBARRO - Breaded Mozzarella sticks (UK)", "4 Fingers", "Breaded Mozzarella Sticks", SIDES, "4 fingers"),
    I("SBARRO - Halal Chicken Nuggets, 4 portion (UK)", "4 Nuggets", "Halal Chicken Nuggets (4)", SIDES, "4 nuggets"),
    I("SBARRO - Halal Chicken Nuggets, 6 portion (UK)", "6 Nuggets", "Halal Chicken Nuggets (6)", SIDES, "6 nuggets"),
    I("SBARRO - Hot & Kickin' Chicken Wings (UK)", "4 Wings", "Hot & Kickin' Chicken Wings", SIDES, "4 wings"),
    I("SBARRO - Chicken Strips (UK)", "4 Strips", "Chicken Strips", SIDES, "4 strips"),
    I("SBARRO - Fries (UK)", "250g", "Fries", SIDES, "250g"),
    I("Loaded Fries - Cheese", "1 Portion", "Loaded Fries - Cheese", SIDES, "1 portion"),
    I("Loaded Fries - Chicken Tikka", "1 Portion", "Loaded Fries - Chicken Tikka", SIDES, "1 portion"),
    I("Loaded Fries - Diced Pepperoni", "1 Portion", "Loaded Fries - Diced Pepperoni", SIDES, "1 portion", tags=PORK, note="Pork from 'pepperoni' in the name"),
    I("Chicken tikka Salad (No Sauce)", "Whole Salad", "Chicken Tikka Salad (no sauce)", SALAD, "Whole salad"),
    I("Diced Beef Peperoni Salad (No Sauce)", "Whole Salad", "Diced Beef Pepperoni Salad (no sauce)", SALAD, "Whole salad", tags=BEEF,
      note="Printed 'Peperoni'; beef from the name, whether the pepperoni is pork is not stated"),
    I("Spicy Beef Sausage Salad (No Sauce)", "Whole Salad", "Spicy Beef Sausage Salad (no sauce)", SALAD, "Whole salad", tags=BEEF, note="Beef sausage per the name, so no pork tag"),
    I("Turkey Ham Salad (No Sauce)", "Whole Salad", "Turkey Ham Salad (no sauce)", SALAD, "Whole salad", note="Turkey ham, so no pork tag"),
    I("Cheese Salad (No Sauce)", "Whole Salad", "Cheese Salad (no sauce)", SALAD, "Whole salad"),
    I("Side Salad", "Whole Side Salad", "Side Salad", SALAD, "Whole side salad"),
    I("Caesar Dressing", "15 Grams", "Caesar Dressing", EXTRAS, "15 grams", rank=False, note="Printed twice (pages 4 and 5) with identical numbers; entered once"),
    I("Balsamic Vinegar Glaze", "15 Grams", "Balsamic Vinegar Glaze", EXTRAS, "15 grams", rank=False, note="Printed twice (pages 4 and 5) with identical numbers; entered once"),
    I("SBARRO - Cookie Dough - Milk Chocolate (UK)", "1 Portion", "Cookie Dough - Milk Chocolate", DESSERT, "1 portion", rank=False),
    I("SBARRO - Cookie Dough - White Chocolate (UK)", "1 Portion", "Cookie Dough - White Chocolate", DESSERT, "1 portion", rank=False),
    I("Pre-Packaged Sbarro Milk Chocolate Cookie", "1 Cookie", "Pre-Packaged Milk Chocolate Cookie", DESSERT, "1 cookie", rank=False),
    I("SBARRO - Salted Caramel Cookie Dough & Ice Cream (UK)", "Whole Entrée", "Salted Caramel Cookie Dough & Ice Cream", DESSERT, "Whole entrée", rank=False),
    I("Ice Cream", "1 each", "Ice Cream", DESSERT, "1 each", rank=False),
    D("Caesar Dressing", "15 Grams", of="Caesar Dressing"),
    D("Balsamic Vinegar Glaze", "15 Grams", of="Balsamic Vinegar Glaze"),
    I("Garlic and Herb - Silbury", "1 Package", "Garlic and Herb - Silbury", EXTRAS, "1 package", rank=False,
      note="Salt printed as 0.0 g per serving but 2.0 g per 100 g (a 25 g pot would be about 0.5 g); entered as printed"),
    I("Heinz Mayonnaise Dip Pots", "1 Package", "Heinz Mayonnaise Dip Pot", EXTRAS, "1 package", rank=False,
      note="Sugars printed as 0.06 g per serving but 2.90 g per 100 g (a 25 g pot would be about 0.7 g); entered as printed"),
    I("Heinz Tomato Ketchup Dip Pots", "1 Package", "Heinz Tomato Ketchup Dip Pot", EXTRAS, "1 package", rank=False),
    I("Heinz BBQ Sauce Dip Pots", "1 Package", "Heinz BBQ Sauce Dip Pot", EXTRAS, "1 package", rank=False),
    I("Dip Pot - Deluxe BBQ Sauce", "1 Pot", "Dip Pot - Deluxe BBQ Sauce", EXTRAS, "1 pot", rank=False),
    I("Dip Pot - Ketchup With a Kick of Chilli", "1 Pot", "Dip Pot - Ketchup With a Kick of Chilli", EXTRAS, "1 pot", rank=False),
    I("Dip Pot - Spicy Fried Chicken Sauce", "1 Pot", "Dip Pot - Spicy Fried Chicken Sauce", EXTRAS, "1 pot", rank=False),
    I("Dip Pot - Garlic & Herb", "1 Pot", "Dip Pot - Garlic & Herb", EXTRAS, "1 pot", rank=False),
    I("Dip Pot - Sweet Chilli Sauce", "1 Pot", "Dip Pot - Sweet Chilli Sauce", EXTRAS, "1 pot", rank=False),
    I("Dip Pot - Perinnaise", "1 Pot", "Dip Pot - Perinnaise", EXTRAS, "1 pot", rank=False, note="Name printed 'Perinnaise'"),
    I("Pepsi Max Cherry", "1 Bottle", "Pepsi Max Cherry", COLD, BOTTLE, rank=False, note="Per-100 g printed as 0.0 kcal but 5.0 kcal per bottle; entered as printed"),
    I("Pepsi Max", "1 Bottle", "Pepsi Max", COLD, BOTTLE, rank=False),
    I("Pepsi Regular", "1 Bottle", "Pepsi Regular", COLD, BOTTLE, rank=False),
    I("Tango Orange", "1 Bottle", "Tango Orange", COLD, BOTTLE, rank=False, note="Per-100 g printed as 0.0 kcal but 5.0 kcal per bottle; entered as printed"),
    I("Diet Pepsi", "1 Bottle", "Diet Pepsi", COLD, BOTTLE, rank=False),
    I("7Up", "1 Bottle", "7Up", COLD, BOTTLE, rank=False),
    I("Water", "1 Bottle", "Water", COLD, BOTTLE, rank=False,
      note="Prints 16.5 kcal and 3.3 g sugars for a 275ml bottle of 'Water'; entered as printed (may be a flavoured water: the guide doesn't say)"),
    I("Fruit Shoot - Orange", "1 Bottle", "Fruit Shoot - Orange", COLD, BOTTLE, rank=False),
    I("Fruit Shoot - Apple & Blackcurrant", "1 Bottle", "Fruit Shoot - Apple & Blackcurrant", COLD, BOTTLE, rank=False),
    I("Robinsons Peach and Mango", "1 Bottle", "Robinsons Peach and Mango", COLD, BOTTLE, rank=False,
      note="Pipeline warning explained: prints 50 kcal per bottle but 10.1 g carbohydrate (about 40 kcal); the guide's per-100 g columns "
           "say the same (10.0 kcal, 2.0 g carbohydrate), so it is the source's rounding, not a typo; entered as printed"),
    I("Robinsons - Orange and Mango", "1 Bottle", "Robinsons - Orange and Mango", COLD, BOTTLE, rank=False,
      note="Bottle size printed as '500' (no unit); sugars printed as 0.0 with 9.5 g carbohydrate; entered as printed"),
    I("Robinsons Blueberry & Blackberry", "1 Bottle", "Robinsons Blueberry & Blackberry", COLD, BOTTLE, rank=False),
]


# ---- consistency tests on a row's OWN printed numbers --------------------------------------------------------------

def num(text: str) -> float:
    m = re.match(r"<?(\d+(?:\.\d+)?)", text)
    if not m:
        raise ValueError(f"not a number: {text!r}")
    return float(m.group(1))


def expected_kcal(p: dict) -> float:
    return num(p["weight"]) * num(p["kcal100"]) / 100


def consistency_problems(p: dict) -> list[str]:
    """Problems in one printed row. An empty list means the weight, per-100 g and per-serving columns can all be true."""
    out = []
    if num(p["kcal100"]) > 900:
        out.append(f"{p['kcal100']} kcal per 100 g is impossible (pure fat is about 900)")
    total100 = num(p["carbs100"]) + num(p["fat100"]) + num(p["protein100"])
    if total100 > 100.05:
        out.append(f"carbohydrate, fat and protein add up to {total100:.1f} g per 100 g")
    for basis, label in (("", "per serving"), ("100", "per 100 g")):
        if num(p["sugars" + basis]) > num(p["carbs" + basis]) + 0.05:
            out.append(f"sugars above carbohydrate {label}")
        if num(p["sat" + basis]) > num(p["fat" + basis]) + 0.05:
            out.append(f"saturates ({p['sat' + basis]} g) above total fat ({p['fat' + basis]} g) {label}")
    served = num(p["kcal"])
    gap = abs(expected_kcal(p) - served)
    if gap > 10 and gap > 0.10 * served:
        out.append(f"weight {p['weight']} x {p['kcal100']} kcal per 100 g is about {expected_kcal(p):,.0f} kcal "
                   f"but per serving prints {p['kcal']}")
    return out


def _cols(p: dict) -> str:
    return (f"The guide's own columns disagree: its weight ({p['weight']}) x {p['kcal100']} kcal per 100 g comes to about "
            f"{expected_kcal(p):,.0f} kcal, but the per-serving column prints {p['kcal']} kcal.")


def _macros100(p: dict) -> str:
    return (f"{p['carbs100']} g carbohydrate + {p['fat100']} g fat + {p['protein100']} g protein = "
            f"{num(p['carbs100']) + num(p['fat100']) + num(p['protein100']):.1f} g per 100 g")


# Held back by item name (the id comes from the name). Each value gets the printed row and returns the reason.
HOLDBACK = {
    "Veggie Volcano 12in": lambda p: _cols(p) + " Sugars (about 44 g vs 19.5 g) and salt (11.5 g vs 7.7 g) disagree by the same sum.",
    "Veggie Volcano 14in": lambda p: _cols(p) + " Fat (about 40 g vs 64.5 g), sugars (78 g vs 27 g) and salt (21 g vs 10.1 g) disagree far more.",
    "Veggie Volcano 17in": lambda p: ("Printed as a whole pizza of only " + p["weight"] + " g (a slice-sized weight): that weight at "
                                      f"{p['kcal100']} kcal per 100 g is about {expected_kcal(p):,.0f} kcal, but the per-serving column prints {p['kcal']} kcal."),
    "Veggie Volcano Pizza (slice)": lambda p: (f"Printed as a {p['weight']} g slice with {p['kcal']} kcal per serving, which would be over 1,100 kcal per 100 g "
                                               f"(impossible), while its per-100 g column prints {p['kcal100']} kcal."),
    "Classic Lemonade Cooler": lambda p: _cols(p) + " The per-100 g and per-serving columns are about nine times apart.",
    "Dragon & Passion Fruit Cooler": lambda p: _cols(p) + " The per-100 g and per-serving columns are about nine times apart.",
    "Ham, Egg & Cheese Strombolini": lambda p: _cols(p) + " The per-serving numbers equal a 288 g Stromboli's weight x per-100 g, not the printed serving.",
    "Sausage, Egg & Cheese Strombolini": lambda p: _cols(p) + " The per-serving numbers equal a 288 g Stromboli's weight x per-100 g, not the printed serving.",
    "Breakfast Pizza 17in": lambda p: (f"Prints {p['kcal100']} kcal and {p['carbs100']} g carbohydrate per 100 g (impossible), against "
                                       f"{p['kcal']} kcal per serving for {p['weight']} g."),
    "Breakfast Pizza 14in": lambda p: (f"Prints {_macros100(p)} (impossible) and {p['kcal100']} kcal per 100 g, against "
                                       f"{p['kcal']} kcal per serving for {p['weight']} g."),
    "Breakfast Pizza 12in": lambda p: _cols(p),
    "Hashbrown x2": lambda p: (f"Prints {p['kcal100']} kcal per 100 g (the single hashbrown prints 191 with the same fat, carbohydrate and protein), which "
                               f"doesn't fit its own macros (about 165 kcal per 100 g) or its {p['kcal']} kcal per {p['weight']} g serving."),
    "Hot Chocolate (Regular)": lambda p: f"Prints {_macros100(p)} (impossible) and {p['kcal100']} kcal per 100 g, against {p['kcal']} kcal per {p['weight']} g serving.",
    "Hot Chocolate (Large)": lambda p: f"Prints {_macros100(p)} (impossible) and {p['kcal100']} kcal per 100 g, against {p['kcal']} kcal per {p['weight']} g serving.",
    "Cheesy Wedges": lambda p: _cols(p),
    "Fries": lambda p: (f"Prints saturates ({p['sat']} g per serving, {p['sat100']} g per 100 g) above total fat ({p['fat']} g, {p['fat100']} g): "
                        "saturates are part of the fat."),
    "Loaded Fries - Cheese": lambda p: _cols(p),
    "Loaded Fries - Chicken Tikka": lambda p: _cols(p) + f" Per 100 g it also prints {_macros100(p)} (impossible).",
    "Loaded Fries - Diced Pepperoni": lambda p: _cols(p) + f" Per 100 g it also prints {_macros100(p)} (impossible).",
    "Chicken Tikka Salad (no sauce)": lambda p: _cols(p),
    "Diced Beef Pepperoni Salad (no sauce)": lambda p: _cols(p),
    "Spicy Beef Sausage Salad (no sauce)": lambda p: _cols(p),
    "Turkey Ham Salad (no sauce)": lambda p: _cols(p),
    "Cheese Salad (no sauce)": lambda p: _cols(p),
    "Side Salad": lambda p: _cols(p),
    "Diet Pepsi": lambda p: (f"Prints {p['kcal']} kcal and {p['sugars']} g of sugars for a diet drink (the Pepsi Regular row prints 90 kcal and 23.0 g); "
                             "it looks copied from the regular row."),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDF")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    try:
        printed_rows = sbarro_pdf.read_rows(args.pdf)
    except sbarro_pdf.PdfLayoutError as e:
        print(e, file=sys.stderr)
        return 1
    if len(printed_rows) != len(ROWS):
        print(f"The PDF has {len(printed_rows)} nutrition rows but this script names {len(ROWS)}. The guide or its layout "
              "changed: re-check the names in ROWS against the PDF before running again.", file=sys.stderr)
        return 1
    for i, (p, spec) in enumerate(zip(printed_rows, ROWS)):
        want_name, want_serving = spec["printed"]
        if sbarro_pdf.norm(p["name"]) != sbarro_pdf.norm(want_name) or sbarro_pdf.norm(p["serving"]) != sbarro_pdf.norm(want_serving):
            print(f"Row {i + 1} (page {p['page']}) is printed as {p['name']!r} / {p['serving']!r} but ROWS expects "
                  f"{want_name!r} / {want_serving!r}. Re-check the names in ROWS against the PDF.", file=sys.stderr)
            return 1

    by_name: dict[str, dict] = {}     # item name -> printed row
    items: list[dict] = []
    for p, spec in zip(printed_rows, ROWS):
        if "dup_of" in spec:
            first = by_name[spec["dup_of"]]
            if any(first[f] != p[f] for f in sbarro_pdf.FIELDS):
                print(f"The repeated row {spec['printed']} no longer matches its first copy ({spec['dup_of']}): "
                      "two different rows share a name now, so a human must decide which applies.", file=sys.stderr)
                return 1
            continue
        serving = spec["serving"]
        if serving is BOTTLE:
            serving = f"1 bottle ({p['weight']})" if p["weight"].endswith("ml") else "1 bottle"
        by_name[spec["name"]] = p
        items.append({
            "name": spec["name"], "category": spec["category"], "serving": serving,
            "calories": p["kcal"], "protein_g": p["protein"], "carbs_g": p["carbs"], "fat_g": p["fat"],
            "sat_fat_g": p["sat"], "salt_g": p["salt"], "sugar_g": p["sugars"],
            "tags": spec["tags"], "rankable": spec["rankable"], "notes": spec["note"],
        })

    ids = [slug(i["name"]) for i in items]
    if len(ids) != len(set(ids)):
        print("Two items got the same id: give them different names in ROWS.", file=sys.stderr)
        return 1
    unknown = [n for n in HOLDBACK if n not in by_name]
    if unknown:
        print(f"HOLDBACK names an item that is not in ROWS: {unknown}", file=sys.stderr)
        return 1

    new_problems = {n: consistency_problems(p) for n, p in by_name.items() if n not in HOLDBACK}
    new_problems = {n: pr for n, pr in new_problems.items() if pr}
    if new_problems:
        for n, pr in new_problems.items():
            print(f"{n}: {'; '.join(pr)}", file=sys.stderr)
        print("These rows fail the consistency tests but are not held back. Decide: add them to HOLDBACK (with a reason) "
              "or, if the guide is right after all, change the tests.", file=sys.stderr)
        return 1
    for n in HOLDBACK:
        if not consistency_problems(by_name[n]):
            print(f"note: {n} is held back by hand (it passes the automatic tests)")

    holdback = [(slug(n), reason(by_name[n])) for n, reason in HOLDBACK.items()]
    for it in items:
        it["category_rank"] = CATEGORY_ORDER.index(it["category"])
    items.sort(key=lambda it: it["category_rank"])
    write_chain_folder(
        chain_id=CHAIN_ID, name="Sbarro", cuisine="Pizza", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["sbarro", "sbarro pizza"], items=items, out=args.out, note=NOTE, holdback=holdback)
    sha = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {args.out} (PDF sha256 {sha})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
