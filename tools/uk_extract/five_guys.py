#!/usr/bin/env python3
"""Build data/source/five-guys/ from Five Guys UK's official "Allergen, Ingredient & Nutrition Guide" PDF.

    python3 tools/uk_extract/five_guys.py path/to/guide.pdf --checked-on 2026-10-05

Numbers are copied from the PDF's "NUTRITION GUIDE - UK LOCATIONS ONLY" table as printed, per serving (kcal, fat,
saturates, carbohydrate, sugars, fibre, protein, salt; kJ is not used; the per-100 g columns are never used).
Only the NAMES, categories and tags below are typed by hand, in the order the PDF prints its rows. The script stops if
the number of rows or any row label differs from ROWS, so a human re-checks the names when Five Guys edits the guide.

Why `standard` and not `build_your_own`: the guide prints a value for every ingredient (bun, patty, bacon, cheese,
each topping) AND a value for every finished burger/hot dog/sandwich, but the ingredient values do not add up to the
finished items (e.g. Hot Dog 477 kcal printed vs 215 bun + 192 sausage = 407; Little Cheeseburger 506 kcal vs Little
Hamburger 457 + cheese 64 = 521), and the guide does not say which toppings the printed items include. A components
recipe would therefore show numbers Five Guys does not publish, so the printed item values are used as they are.

Allergens (docs/DATA.md "Allergens", all or nothing): the same PDF prints an "ALLERGEN GUIDE - UK LOCATIONS ONLY" matrix, one row per
product and one column per allergen of the 14. A red dot means "CONTAINS AN ALLERGEN" (-> contains); the digit 1 means "Not suitable for
this allergen sufferer due to manufacturing and preparation methods" (-> may contain, as Cooplands' "Not suitable for someone with a ..."
is); the digit 2 ("Due to cooking methods used not suitable ... during Breakfast operation hours") is in the legend but no row uses it,
and the run stops if one ever does. The matrix names no cereal or tree-nut kinds, so none are published. Every published item is tied by
ALLERGEN_ROW to ONE matrix row of the same printed name (a few names differ only by a qualifier, each with its reason there); an item whose
name matches no matrix row is held back, never guessed. Self-checks: the matrix has the expected 76 rows, every mapped row exists exactly
once, the rows nobody maps are the ones expected, and every allergen the guide's own ingredient listing prints in bold for a product is a
red dot in the matrix row of that product (the guide may not contradict itself).

Source: https://www.fiveguys.co.uk/wp-content/uploads/sites/30/2026/08/FGUK_FOH_allergen_ingredient_nutrition_Myprotein_shake_DIGITAL_20260805.pdf
(linked as "UK Nutrition & Allergen Guide" on https://www.fiveguys.co.uk/nutritional-allergy-information/; re-published every few months).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import five_guys_pdf  # noqa: E402
from common import allergen_words, write_allergens  # noqa: E402

CHAIN_ID = "five-guys"
SOURCE_URL = ("https://www.fiveguys.co.uk/wp-content/uploads/sites/30/2026/08/"
              "FGUK_FOH_allergen_ingredient_nutrition_Myprotein_shake_DIGITAL_20260805.pdf")
SOURCE_TITLE = "Five Guys UK Allergen, Ingredient & Nutrition Guide, UK locations only (FGUK_20260805)"
ALIASES = "five guys|fiveguys|five guys burgers and fries"

BU, HD, SA, FR, MS, MX, TP, PT = ("Burgers", "Hot dogs", "Sandwiches", "Fries", "Milkshakes", "Milkshake mix-ins",
                                  "Toppings & sauces", "Burger & hot dog parts")
BEEF, PORK = "contains_beef", "contains_pork"
MIXIN_NOTE = "Per serving as printed; the guide says the amount of each mix-in varies with the number of mix-ins in the shake"
EXC_PART = "participating locations only"
EXC_HEATHROW = "Heathrow Airport only"

# One entry per printed nutrition row, in the PDF's order:
#   (printed label, name, category, serving, rankable, tags, note)
# name None = a row we deliberately leave out; `note` then gives the reason (printed in the run summary).
ROWS: list[tuple] = [
    # MEAT
    ("Bacon**", "Bacon", PT, "", False, [PORK], "Marked ** (non-halal stores only). A burger/hot dog add-on"),
    ("Beef Burger Patty", "Beef Burger Patty", PT, "", False, [BEEF], ""),
    ("Hot Dog", "Hot Dog (sausage only)", PT, "", False, [BEEF], "Printed as 'Hot Dog' in the MEAT section: the sausage on its own, not the finished hot dog"),
    # BUN
    ("Burger Bun", "Burger Bun", PT, "", False, [], ""),
    ("Hot Dog Bun", "Hot Dog Bun", PT, "", False, [], ""),
    # FRIES
    ("Mini Fries", "Mini Fries", FR, "Mini", True, [], "Saturates printed to 2 decimals (2.84); the pipeline stores 1 decimal"),
    ("Little Fries", "Little Fries", FR, "Little", True, [], ""),
    ("Reg Fries", "Regular Fries", FR, "Regular", True, [], "Printed as 'Reg Fries'"),
    ("Large Fries", "Large Fries", FR, "Large", True, [], ""),
    # LOADED FRIES section
    ("Loaded Fries*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Loaded Cajun Fries*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Diced Green Peppers", None, "", "", False, [], "loaded-fries topping; purpose not stated, and 'Fresh Onions' there duplicates the toppings row with other values"),
    ("Fresh Onions", None, "", "", False, [], "loaded-fries topping; duplicates the toppings row 'Fresh Onions' with different values"),
    ("Diced Jalapeño Peppers", None, "", "", False, [], "loaded-fries topping; purpose not stated"),
    ("Diced Tomatoes", None, "", "", False, [], "loaded-fries topping; purpose not stated"),
    # TOPPINGS
    ("BBQ Sauce", "BBQ Sauce", TP, "", False, [], ""),
    ("Cheese (pasteurised)", "Cheese (pasteurised)", TP, "", False, [], ""),
    ("Green Peppers", "Green Peppers", TP, "", False, [], ""),
    ("Grilled Mushrooms", "Grilled Mushrooms", TP, "", False, [], ""),
    ("Hot Sauce", "Hot Sauce", TP, "", False, [], ""),
    ("HP Brown Sauce", "HP Brown Sauce", TP, "", False, [], ""),
    ("Jalapeño Peppers", "Jalapeño Peppers", TP, "", False, [], ""),
    ("Tomato Ketchup", "Tomato Ketchup", TP, "", False, [], ""),
    ("Lettuce", "Lettuce", TP, "", False, [], ""),
    ("Mayonnaise", "Mayonnaise", TP, "", False, [], ""),
    ("Mustard", "Mustard", TP, "", False, [], ""),
    ("Fresh Onions", "Fresh Onions", TP, "", False, [], ""),
    ("Grilled Onions", "Grilled Onions", TP, "", False, [], ""),
    ("Pickles", "Pickles", TP, "", False, [], ""),
    ("Relish", "Relish", TP, "", False, [], ""),
    ("Tomatoes", "Tomatoes", TP, "", False, [], ""),
    ("Crispy Fried Onions", "Crispy Fried Onions", TP, "", False, [], ""),
    # MILKSHAKES (including Big Kids shake) + MIX-INS
    ("Five Guys Milkshake Base", "Five Guys Milkshake Base", MS, "", False, [], "Table heading: 'Milkshakes (including Big Kids Shake)'; no size named"),
    ("Whipped Cream", "Whipped Cream (milkshake)", MX, "", False, [], MIXIN_NOTE),
    ("Flake", "Flake (milkshake)", MX, "", False, [],
     "Fat printed as 18 g but 43 kcal (per 100 g: 28 g fat, 522 kcal): fat looks like a typo for 1.8; entered as printed. " + MIXIN_NOTE),
    ("Banana", "Banana mix-in", MX, "", False, [],
     "Calories (194) are higher than 4P+4C+9F (144) allows; kJ and kcal agree with each other. Fat 0 here but 2.5 in the little shake. " + MIXIN_NOTE),
    ("Chocolate", "Chocolate mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Lotus Biscoff", "Lotus Biscoff mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Oreo Cookie Pieces", "Oreo Cookie Pieces mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Jimmy’s Iced Coffee", "Jimmy’s Iced Coffee mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Pistachio***", "Pistachio mix-in", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Reese's Peanut Butter Cups***", "Reese's Peanut Butter Cups mix-in", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Peanut Butter***", "Peanut Butter mix-in", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Salted Caramel", "Salted Caramel mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Strawberry", "Strawberry mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Watermelon*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Myprotein (12g)", "Myprotein mix-in (12 g)", MX, "12 g", False, [], MIXIN_NOTE),
    # LITTLE MILKSHAKES + (MIX-INS)
    ("Five Guys Milkshake Base Little", "Five Guys Milkshake Base (little)", MS, "Little", False, [], ""),
    ("Whipped Cream Little", "Whipped Cream (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Flake", "Flake (little shake)", MX, "", False, [],
     "Identical to the regular-shake row, although every other little-shake mix-in is smaller. Fat printed as 18 g but 43 kcal: looks like a typo for 1.8; entered as printed. " + MIXIN_NOTE),
    ("Banana Little", "Banana mix-in (little shake)", MX, "", False, [], "Fat 2.5 here but 0 in the regular shake. " + MIXIN_NOTE),
    ("Chocolate Little", "Chocolate mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Lotus Biscoff Little", "Lotus Biscoff mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Oreo Cookie Pieces Little", "Oreo Cookie Pieces mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Jimmy’s Iced Coffee", "Jimmy’s Iced Coffee mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Pistachio***", "Pistachio mix-in (little shake)", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Reese's Peanut Butter Cups***", "Reese's Peanut Butter Cups mix-in (little shake)", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Peanut Butter Little***", "Peanut Butter mix-in (little shake)", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Salted Caramel Little", "Salted Caramel mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Strawberry Little", "Strawberry mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Watermelon Little*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Myprotein (6g)", "Myprotein mix-in (6 g, little shake)", MX, "6 g", False, [], MIXIN_NOTE),
    # BURGERS (the ingredient list names a beef patty and, for bacon burgers, bacon)
    ("Hamburger", "Hamburger", BU, "", True, [BEEF], ""),
    ("Little Hamburger", "Little Hamburger", BU, "", True, [BEEF], ""),
    ("Cheeseburger", "Cheeseburger", BU, "", True, [BEEF], ""),
    ("Little Cheeseburger", "Little Cheeseburger", BU, "", True, [BEEF], ""),
    ("Bacon Burger", "Bacon Burger", BU, "", True, [BEEF, PORK], ""),
    ("Little Bacon Burger", "Little Bacon Burger", BU, "", True, [BEEF, PORK],
     "Carbohydrate printed as 367 g (per 100 g: 23 g; the other burgers are 35-39 g): clearly a typo, probably 36.7; entered as printed"),
    ("Bacon Cheeseburger", "Bacon Cheeseburger", BU, "", True, [BEEF, PORK], ""),
    ("Little Bacon Cheeseburger", "Little Bacon Cheeseburger", BU, "", True, [BEEF, PORK], ""),
    # HOT DOGS (ingredient list: beef hot dog)
    ("Hot Dog", "Hot Dog", HD, "", True, [BEEF], ""),
    ("Cheese Dog", "Cheese Dog", HD, "", True, [BEEF], ""),
    ("Bacon Dog", "Bacon Dog", HD, "", True, [BEEF, PORK], ""),
    ("Bacon Cheese Dog", "Bacon Cheese Dog", HD, "", True, [BEEF, PORK], ""),
    # SANDWICHES
    ("Veggie Sandwich", "Veggie Sandwich", SA, "", True, [], "The guide has no vegetarian marking, so no vegetarian tag"),
    ("Cheese Veggie Sandwich", "Cheese Veggie Sandwich", SA, "", True, [], "The guide has no vegetarian marking, so no vegetarian tag"),
    ("Grilled Cheese", "Grilled Cheese", SA, "", True, [], ""),
    ("BLT**", "BLT (Bacon, Lettuce and Tomato)", SA, "", True, [PORK], "Marked ** (non-halal stores only)"),
    ("Lettuce Wrap", "Lettuce Wrap", SA, "", True, [BEEF],
     "Printed with: Patty, Tomatoes, Pickles, Grilled Onions, Green Peppers, Grilled Mushrooms (ingredient list: Ground Beef, Lettuce, ...)"),
    ("Bulk Peanuts Without Shell ***", None, "", "", False, [], "per-serving cells are empty (only per 100 g is printed)"),
    # BREAKFAST (sandwiches available at Heathrow only)
    ("Sausage, Egg & Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Bacon, Egg & Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Little Sausage, Egg and Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Little Bacon, Egg & Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Latte*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Cappuccino*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Flat White*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Americano Black*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Americano White*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART + "; every per-serving value printed as 0"),
    ("Double Espresso*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Breakfast Tea*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    # BUILD YOUR OWN (Heathrow only)
    ("Little Egg Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Little Sausage Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Add Cheese", None, "", "", False, [], EXC_HEATHROW + " (same values as the Cheese topping)"),
    ("Add Bacon", None, "", "", False, [], EXC_HEATHROW),
    ("Sausage Patty *", None, "", "", False, [], EXC_HEATHROW + ", marked *"),
    # SIDES (Heathrow only)
    ("Hash Browns*", None, "", "", False, [], EXC_HEATHROW + ", marked *"),
    # OTHER ITEMS
    ("Egg*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Cajun seasoning", "Cajun seasoning", TP, "", False, [], "Salt printed as 1.2 g per serving"),
]

CATEGORY_ORDER = [BU, HD, SA, FR, MS, MX, TP, PT]
# Rows whose printed numbers contradict each other: not published, never corrected (data/source/five-guys/holdback.csv).
# Item ids are the ids this script gives (slug of the name).
HOLDBACK = [
    ("little-bacon-burger", "The guide prints 367 g of carbohydrate (and 510 kcal) for this burger."),
    ("flake-milkshake", "The guide prints 18 g of fat with only 43 kcal."),
    ("flake-little-shake", "The guide prints 18 g of fat with only 43 kcal."),
    ("banana-mix-in", "The guide prints 194 kcal (814 kJ) with 36 g carbohydrate, 0 g fat and 0 g protein (about 144 kcal), "
                      "and 2.5 g fat for the little-shake banana at half the amount."),
]
HOLDBACK.append(("crispy-fried-onions", "The guide's allergen matrix has no row with this exact name (it prints 'Crispy Onions'), so its allergens "
                 "are not published; the nutrition table and the ingredient listing both print 'Crispy Fried Onions'."))
NOTE = "Milkshake mix-in values vary with how many you add and aren't added to the shake."
# The nutrition PDF is also the chain's allergen guide. Its matrix is copied by read_allergen_matrix (see the module docstring):
# the digit-1 mark ("not suitable ... due to manufacturing and preparation methods") is stored as "may contain", so the guide does print
# traces/cross-contact information.
ALLERGEN_GUIDE = {"title": SOURCE_TITLE, "url": SOURCE_URL,
                  "may_contain_published": True}
ITEM_FIELDS = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
               "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]


def slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")  # Jalapeño -> Jalapeno
    out = "".join(c.lower() if c.isalnum() else "-" for c in ascii_name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def norm(label: str) -> str:
    """Compare labels ignoring asterisks, the (R) sign, hyphenation, spacing and case."""
    return re.sub(r"[^a-z0-9]", "", label.lower().replace("&apos;", "'"))


# ------------------------------------------------------------------------------------------------ allergens
# item name (as in ROWS) -> (matrix section, matrix row label as printed, why the printed label differs from the item name).
# The section is the start of the heading above the row. An empty reason means the labels are equal after norm() (case, asterisks, the
# (R) sign and punctuation ignored). Anything else needs a reason that the self-check below accepts.
_SECTIONS = {"BURGERS": ["Hamburger", "Little Hamburger", "Cheeseburger", "Little Cheeseburger", "Bacon Burger", "Little Bacon Burger",
                         "Bacon Cheeseburger", "Little Bacon Cheeseburger"],
             "HOT DOGS": ["Hot Dog", "Cheese Dog", "Bacon Dog", "Bacon Cheese Dog"],
             "SANDWICHES": ["Veggie Sandwich", "Cheese Veggie Sandwich", "Grilled Cheese"],
             "MEAT": ["Bacon", "Beef Burger Patty"],
             "BUN": ["Burger Bun", "Hot Dog Bun"],
             "FRIES": ["Cajun seasoning"],
             "TOPPINGS": ["BBQ Sauce", "Cheese (pasteurised)", "Grilled Mushrooms", "Hot Sauce", "HP Brown Sauce", "Tomato Ketchup", "Lettuce",
                          "Mayonnaise", "Mustard", "Fresh Onions", "Grilled Onions", "Pickles", "Relish"],
             "MILKSHAKES": ["Five Guys Milkshake Base"]}
ALLERGEN_ROW: dict = {n: (sec, n, "") for sec, names in _SECTIONS.items() for n in names}
ALLERGEN_ROW.update({
    # the shake/mix-in rows: our names add "mix-in" or "(little shake)"; the section heading is "MILKSHAKES (INCLUDING BIG KIDS SHAKE AND
    # LITTLE SHAKE) + MIX-INS", so one row per product covers the regular and the little shake (checked below for every "little" item)
    "Jimmy’s Iced Coffee mix-in": ("MILKSHAKES", "Jimmy’s Iced Coffee", "our 'mix-in' suffix"),
    "Chocolate mix-in": ("MILKSHAKES", "Chocolate", "our 'mix-in' suffix"),
    "Salted Caramel mix-in": ("MILKSHAKES", "Salted Caramel", "our 'mix-in' suffix"),
    "Strawberry mix-in": ("MILKSHAKES", "Strawberry", "our 'mix-in' suffix"),
    "Pistachio mix-in": ("MILKSHAKES", "Pistachio", "our 'mix-in' suffix"),
    "Peanut Butter mix-in": ("MILKSHAKES", "Peanut Butter", "our 'mix-in' suffix"),
    "Reese's Peanut Butter Cups mix-in": ("MILKSHAKES", "Reese's Peanut Butter Cups", "our 'mix-in' suffix"),
    "Lotus Biscoff mix-in": ("MILKSHAKES", "Lotus Biscoff", "our 'mix-in' suffix"),
    "Oreo Cookie Pieces mix-in": ("MILKSHAKES", "Oreo Cookie Pieces", "our 'mix-in' suffix"),
    "Banana mix-in": ("MILKSHAKES", "Banana", "our 'mix-in' suffix"),
    "Flake (milkshake)": ("MILKSHAKES", "Flake", "our '(milkshake)' suffix"),
    "Whipped Cream (milkshake)": ("MILKSHAKES", "Whipped Cream", "our '(milkshake)' suffix"),
    "Myprotein mix-in (12 g)": ("MILKSHAKES", "Myprotein", "our 'mix-in' and amount; the matrix has one Myprotein row"),
    "Five Guys Milkshake Base (little)": ("MILKSHAKES", "Five Guys Milkshake Base", "heading says the rows include the little shake"),
    "Whipped Cream (little shake)": ("MILKSHAKES", "Whipped Cream", "heading says the rows include the little shake"),
    "Flake (little shake)": ("MILKSHAKES", "Flake", "heading says the rows include the little shake"),
    "Banana mix-in (little shake)": ("MILKSHAKES", "Banana", "heading says the rows include the little shake"),
    "Chocolate mix-in (little shake)": ("MILKSHAKES", "Chocolate", "heading says the rows include the little shake"),
    "Lotus Biscoff mix-in (little shake)": ("MILKSHAKES", "Lotus Biscoff", "heading says the rows include the little shake"),
    "Oreo Cookie Pieces mix-in (little shake)": ("MILKSHAKES", "Oreo Cookie Pieces", "heading says the rows include the little shake"),
    "Jimmy’s Iced Coffee mix-in (little shake)": ("MILKSHAKES", "Jimmy’s Iced Coffee", "heading says the rows include the little shake"),
    "Pistachio mix-in (little shake)": ("MILKSHAKES", "Pistachio", "heading says the rows include the little shake"),
    "Reese's Peanut Butter Cups mix-in (little shake)": ("MILKSHAKES", "Reese's Peanut Butter Cups", "heading says the rows include the little shake"),
    "Peanut Butter mix-in (little shake)": ("MILKSHAKES", "Peanut Butter", "heading says the rows include the little shake"),
    "Salted Caramel mix-in (little shake)": ("MILKSHAKES", "Salted Caramel", "heading says the rows include the little shake"),
    "Strawberry mix-in (little shake)": ("MILKSHAKES", "Strawberry", "heading says the rows include the little shake"),
    "Myprotein mix-in (6 g, little shake)": ("MILKSHAKES", "Myprotein", "heading says the rows include the little shake; one Myprotein row"),
    # qualifiers the matrix prints after the name
    "Green Peppers": ("TOPPINGS", "Green Peppers (including diced)", "the matrix adds '(including diced)'"),
    "Jalapeño Peppers": ("TOPPINGS", "Jalapeño Peppers (including diced)", "the matrix adds '(including diced)'"),
    "Tomatoes": ("TOPPINGS", "Tomatoes (including diced)", "the matrix adds '(including diced)'"),
    # the matrix has ONE row for the product in every size; the heading is "FRIES COOKED IN PEANUT OIL"
    "Mini Fries": ("FRIES", "Fries", "one matrix row covers every size"),
    "Little Fries": ("FRIES", "Fries", "one matrix row covers every size"),
    "Regular Fries": ("FRIES", "Fries", "one matrix row covers every size"),
    "Large Fries": ("FRIES", "Fries", "one matrix row covers every size"),
    # names we expanded or kept from the nutrition table
    "Hot Dog (sausage only)": ("MEAT", "Hot Dog", "the MEAT section's Hot Dog is the sausage alone"),
    "BLT (Bacon, Lettuce and Tomato)": ("SANDWICHES", "BLT **", "the guide's ingredient listing spells it 'BLT (Bacon, Lettuce and Tomato)'"),
    "Lettuce Wrap": ("SANDWICHES", "Lettuce Wrap Patty, Tomatoes, Pickles, Grilled Onions, Green Peppers, Grilled Mushrooms",
                     "the matrix label continues with the toppings, as the nutrition table's does"),
    # NOT mapped, so held back (HOLDBACK): "Crispy Fried Onions" (the matrix prints "Crispy Onions")
})
# Matrix rows no published item uses, each with the reason: a new matrix row that shows up here unexpectedly stops the run.
EXPECTED_UNUSED = {
    ("MEAT", "Sausage Patty*"): "Heathrow breakfast part, not in the nutrition table",
    ("FRIES", "Loaded Fries*"): "participating locations only, left out of the menu",
    ("FRIES", "Loaded Cajun Fries*"): "participating locations only, left out of the menu",
    ("FRIES", "Hash Browns*"): "Heathrow only, left out of the menu",
    ("TOPPINGS", "Crispy Onions"): "item held back: the name differs ('Crispy Fried Onions')",
    ("TOPPINGS", "Grilled Toppings"): "no nutrition row",
    ("MILKSHAKES", "Flake"): "both Flake items are held back (fat 18 g with 43 kcal)",
    ("MILKSHAKES", "Watermelon*"): "participating locations only, left out of the menu",
    ("BURGERS", "Little Bacon Burger"): "item held back (the nutrition table prints 367 g of carbohydrate)",
    ("BREAKFAST", "Sausage, Egg & Cheese Sandwich*"): "Heathrow only",
    ("BREAKFAST", "Bacon, Egg & Cheese Sandwich*"): "Heathrow only",
    ("BREAKFAST", "Little Sausage, Egg and Cheese Sandwich*"): "Heathrow only",
    ("BREAKFAST", "Little Bacon, Egg & Cheese Sandwich*"): "Heathrow only",
    ("BREAKFAST", "Little Sausage Sandwich*"): "Heathrow only",
    ("BREAKFAST", "Little Egg Sandwich*"): "Heathrow only",
    ("BREAKFAST", "Latte*"): "Heathrow / participating locations only",
    ("BREAKFAST", "Cappuccino*"): "Heathrow / participating locations only",
    ("BREAKFAST", "Flat White*"): "Heathrow / participating locations only",
    ("BREAKFAST", "Americano Black*"): "Heathrow / participating locations only",
    ("BREAKFAST", "Americano White*"): "Heathrow / participating locations only",
    ("BREAKFAST", "Double Espresso*"): "Heathrow / participating locations only",
    ("BREAKFAST", "Breakfast Tea*"): "Heathrow / participating locations only",
    ("OTHER ITEMS", "Bulk Peanuts Without Shell ***"): "per-serving numbers not printed, left out of the menu",
    ("OTHER ITEMS", "Egg*"): "participating locations only, left out of the menu",
}
EXPECTED_MATRIX_ROWS = 76
# The ingredient listing's label for a matrix label that is spelled differently (norm() form -> norm() form).
INGREDIENT_ALIAS = {"fries": "fiveguysstyle", "crispyonions": "crispyfriedonions", "bulkpeanutswithoutshell": "bulkpeanuts",
                    "oreocookiepieces": "oreocookie"}
MARK_MEANING = {"•": "contains", "1": "may_contain"}  # "2" (breakfast hours) has no meaning here: any row using it stops the run


def _find_row(matrix: list, section: str, label: str) -> dict:
    hit = [r for r in matrix if r["section"].startswith(section) and norm(r["label"]) == norm(label)]
    if len(hit) != 1:
        raise SystemExit(f"Allergen matrix: expected exactly one row {label!r} under {section!r}, found {len(hit)}. The guide changed: re-check ALLERGEN_ROW.")
    return hit[0]


def check_matrix_against_ingredients(matrix: list, ingredients: list) -> int:
    """The guide's own ingredient listing prints allergens in capitals. Each such allergen must be a red dot in the matrix row of the same
    product (a dot the listing does not show is fine: milkshake mix-ins are marked for the milk of the shake). Returns the rows compared."""
    used, compared, bad = set(), 0, []
    for row in matrix:
        want = INGREDIENT_ALIAS.get(norm(row["label"]), norm(row["label"]))
        found = None
        for i, ing in enumerate(ingredients):
            have = norm(ing["label"])
            if i not in used and (have == want or have.startswith(want) or want.startswith(have)):
                found = i
                break
        if found is None:
            continue
        used.add(found)
        keys, _, _ = allergen_words(five_guys_pdf.bold_allergen_words(ingredients[found]["text"], ingredients[found]["label"]), ingredients[found]["label"])
        dots = {k for k, v in row["marks"].items() if v == "•"}
        compared += 1
        if keys - dots:
            bad.append(f"{row['label']}: the ingredient listing prints {sorted(keys - dots)} in capitals but the matrix has no dot for it")
    if bad:
        raise SystemExit("The guide contradicts itself (matrix vs ingredient listing); hold these back or ask:\n  " + "\n  ".join(bad))
    return compared


def build_allergens(pdf: Path, items: list, held: set) -> tuple:
    """-> (rows for write_allergens, report lines). Stops (SystemExit) unless every published item has exactly one matrix row."""
    matrix = five_guys_pdf.read_allergen_matrix(pdf)
    if len(matrix) != EXPECTED_MATRIX_ROWS:
        raise SystemExit(f"The allergen matrix has {len(matrix)} rows but this script expects {EXPECTED_MATRIX_ROWS}: the guide changed, re-check ALLERGEN_ROW.")
    for r in matrix:
        for key, mark in r["marks"].items():
            if mark not in MARK_MEANING:
                raise SystemExit(f"Allergen matrix row {r['label']!r} uses the mark {mark!r} for {key}: its meaning (legend 2: breakfast hours) is not handled; decide first.")
    compared = check_matrix_against_ingredients(matrix, five_guys_pdf.read_ingredients(pdf))
    rows, used = [], set()
    for it in items:
        if it["id"] in held:
            continue
        if it["name"] not in ALLERGEN_ROW:
            raise SystemExit(f"{it['name']!r} has no allergen matrix row: map it in ALLERGEN_ROW or hold it back in HOLDBACK.")
        section, label, why = ALLERGEN_ROW[it["name"]]
        if not why and norm(it["name"]) != norm(label):
            raise SystemExit(f"{it['name']!r} is mapped to {label!r} without a reason: names must be equal or the difference explained.")
        row = _find_row(matrix, section, label)
        if ("little shake" in it["name"].lower() or it["name"].endswith("(little)")) and "LITTLE SHAKE" not in row["section"]:
            raise SystemExit(f"{it['name']!r}: the matrix section {row['section']!r} does not say it includes the little shake.")
        used.add((section, label))
        contains = {k for k, v in row["marks"].items() if MARK_MEANING[v] == "contains"}
        may = {k for k, v in row["marks"].items() if MARK_MEANING[v] == "may_contain"}
        rows.append((it["id"], {"contains": contains, "may_contain": may}))
    unused = {(r["section"], r["label"]) for r in matrix} - {(_find_row(matrix, sec, lab)["section"], _find_row(matrix, sec, lab)["label"]) for sec, lab in used}
    expected = {(_find_row(matrix, sec, lab)["section"], _find_row(matrix, sec, lab)["label"]) for sec, lab in EXPECTED_UNUSED}
    if unused != expected:
        raise SystemExit("The matrix rows used by no item differ from EXPECTED_UNUSED: "
                         f"unexpected {sorted(unused - expected)}, now used {sorted(expected - unused)}.")
    published = [i for i in items if i["id"] not in held]
    assert len(rows) == len(published), "every published item must have an allergen row"
    lines = [f"allergens: {len(rows)} published items each tied to one matrix row ({len(matrix)} matrix rows, {len(unused)} used by no item); "
             f"{compared} matrix rows agree with the ingredient listing's capitalised allergens"]
    return rows, lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live menu")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = five_guys_pdf.read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}. The layout or menu changed: "
              "re-check the names in ROWS against the PDF before running again.", file=sys.stderr)
        return 1
    for n, (printed, spec) in enumerate(zip(rows, ROWS), start=1):
        want, got = norm(spec[0]), norm(printed["label"])
        if want != got and not got.startswith(want):
            print(f"Row {n}: the PDF prints {printed['label']!r} but this script expects {spec[0]!r}. "
                  "The menu changed: re-check ROWS.", file=sys.stderr)
            return 1

    items, excluded = [], []
    for printed, spec in zip(rows, ROWS):
        label, name, category, serving, rankable, tags, note = spec
        if name is None:
            excluded.append((label, note))
            continue
        v = printed["values"]
        if v is None:
            print(f"{label!r} has no per-serving values but is listed as an item.", file=sys.stderr)
            return 1
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": serving,
            "calories": v["kcal"], "protein_g": v["protein"], "carbs_g": v["carbs"], "fat_g": v["fat"],
            "sat_fat_g": v["sat"], "sodium_mg": "", "salt_g": v["salt"], "sugar_g": v["sugars"], "fiber_g": v["fibre"],
            "tags": "|".join(sorted(tags)),
            "limited_time": "false", "rankable": str(rankable).lower(), "components": "", "added_on": "", "notes": note,
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), f"duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps the PDF order inside a category

    allergen_rows, allergen_report = build_allergens(args.pdf, items, {i for i, _ in HOLDBACK})

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ITEM_FIELDS)
        w.writeheader()
        w.writerows(items)
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Five Guys", "Burgers", "standard", SOURCE_TITLE, SOURCE_URL, args.checked_on, ALIASES, ""])
    with open(args.out / "holdback.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["item_id", "reason"])
        w.writerows(HOLDBACK)
    (args.out / "note.txt").write_text(NOTE + "\n", encoding="utf-8")
    write_allergens(args.out, CHAIN_ID, allergen_rows, {**ALLERGEN_GUIDE, "checked_on": args.checked_on})
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")

    by_cat = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {args.out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    print("by category:", ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    print("\n".join(allergen_report))
    print(f"left out {len(excluded)} printed rows:")
    for label, why in excluded:
        print(f"  - {label}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
