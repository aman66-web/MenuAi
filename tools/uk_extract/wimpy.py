#!/usr/bin/env python3
"""Build data/source/wimpy/ from Wimpy UK's official "Allergen & Nutritional Guide" PDF.

    python3 tools/uk_extract/wimpy.py path/to/Nutrition-Guide.pdf --checked-on 2026-10-06 [--out DIR]

Numbers are copied from the PDF's "Nutritional Values per Portion (Meal)" table exactly as printed (kcal, fat, saturates,
carbohydrate, sugars, fibre, protein, salt; kJ is not used). Only the NAMES, categories and tags below are typed by hand.
Every printed row is matched, in the PDF's reading order, with one entry in SECTIONS: the script stops if a heading, a row
label or the number of rows differs, so a human re-checks the names when Wimpy edits the guide (about twice a year).

Source: https://wimpy-uk.s3-eu-west-2.amazonaws.com/static/Nutrition%20Guide.pdf
(linked as the Allergen & Nutritional Guide from https://www.wimpy.uk.com/; "correct at time of going to print 01/04/2026").
Needs `pdftotext` (poppler).

Allergens come from the same PDF's "Allergen Information" table: one coloured dot per allergen column, drawn as a shape (not
text), so they are read from the page's vector drawing (pdftocairo -svg) and matched to the rows and the column names that
pdftotext prints (read_allergens). The guide's key: red = "contains the indicated allergen as a planned ingredient"; amber =
"may contain ... a supplier has advised us of the possible presence ... through cross-contact"; dark brown = "may contain ...
via the use of shared cooking equipment or cross-contact through shared cooking oil". Both kinds of "may contain" are copied
as may-contain. The script checks the key's own bullet colours, and stops on a dot of any other colour, a dot that is not in
a column or beside a numbered row, or two dots in one cell. The guide names gluten cereals (wheat, rye, barley, oats, spelt,
kamut) in their own columns, and tree nuts only as "Nuts".
The printed Energy (kJ) per portion is copied into energy_kj.

Why `standard` items only: the guide prints a value for each finished item and for each add-on, not for ingredients, and it
says nothing about which add-ons a finished item already includes, so nothing is added up from parts.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "wimpy"
SOURCE_URL = "https://wimpy-uk.s3-eu-west-2.amazonaws.com/static/Nutrition%20Guide.pdf"
SOURCE_TITLE = "Wimpy Allergen & Nutritional Guide (April 2026 edition, correct at time of going to print 01/04/2026)"
ALIASES = ["wimpy", "wimpy uk", "wimpy burger", "wimpy burgers", "wimpy restaurant"]
ALLERGEN_TITLE = "Wimpy Allergen & Nutritional Guide, allergen table (correct at time of going to print 01/04/2026)"
NOTE = ("Figures are per portion as served. Items marked 'excl.' leave out the sauce, topping or cream you choose, and "
        "Big Brekkie, Sunrise and Meat-Free Mini are for white toast. Wimpy's guide doesn't say which meat is in most items.")

PORK = "contains_pork"
VEG = "vegetarian"

# ---------------------------------------------------------------------------------------------------------------------
# One section per heading in the PDF, in reading order (page 1, then page 2). Each section:
#   (printed heading, [entries]); an entry is
#     R(printed label, name, category, serving="", rankable=True, tags=(), note="")   a row we publish
#     X(printed label, reason)                                                         a printed row we leave out
# `printed label` is compared with the PDF (trademark signs and spacing ignored), so a changed guide stops the script.
# ---------------------------------------------------------------------------------------------------------------------


def R(label, name, cat, serving="", rank=True, tags=(), note=""):
    return dict(label=label, name=name, cat=cat, serving=serving, rank=rank, tags=list(tags), note=note)


def X(label, reason):
    return dict(label=label, name=None, reason=reason)


BRK, ADD, SID, SAU, BUR, GRL = "Breakfasts", "Add-ons", "Sides", "Sauces", "Burgers", "Grill plates"
CHK, CMF, JKT, DES, TOP = "Chicken & plant-based", "Comfort eats", "Jacket potatoes", "Desserts", "Toppings"
SHK, CLD, HOT = "Shakes & floats", "Cold drinks", "Hot drinks"
KMN, KDE, KDR = "Kids meals", "Kids desserts", "Kids drinks"

DUP = "same name and identical numbers printed again under {where}; published once there"
SIDE = "20 g"
POT = "100 g dip pot"
WT = "Printed 'Figures are for white toast'"
ES = "Printed 'Figures exclude choice of sauce'"
ET = "Printed 'Figures exclude choice of topping'"
EC = "Printed 'Figures exclude choice of cream or ice cream side'"
PB = "Fat and carbs are printed as the same number; calories agree with them"

SECTIONS: list[tuple[str, list[dict]]] = [
    ("BREAKFASTS", [
        R("Bacon & Hash Brown Muffin", "Bacon & Hash Brown Muffin", BRK, tags=[PORK], note="Bacon is in the name"),
        R("Double Up Bacon", "Double Up Bacon", BRK, tags=[PORK], note="Bacon is in the name"),
        R("Sausage & Hash Brown Muffin", "Sausage & Hash Brown Muffin", BRK, tags=[PORK], note="Sausage is in the name"),
        R("Double Up Sausage", "Double Up Sausage", BRK, tags=[PORK], note="Sausage is in the name"),
        R("Hash Brown Muffin", "Hash Brown Muffin", BRK),
        R("Sausage Muffin", "Sausage Muffin", BRK, tags=[PORK], note="Sausage is in the name"),
        R("Bacon Muffin", "Bacon Muffin", BRK, tags=[PORK], note="Bacon is in the name"),
        R("Breakfast Stack", "Breakfast Stack", BRK),
        R("with Wimpy Ketchup (Adds)", "Wimpy Ketchup on Breakfast Stack (adds)", ADD, rank=False,
          note="Printed under Breakfast Stack as 'with Wimpy Ketchup (Adds)': the amount it adds"),
        R("with HP Brown Sauce (Adds)", "HP Brown Sauce on Breakfast Stack (adds)", ADD, rank=False,
          note="Printed under Breakfast Stack as 'with HP Brown Sauce (Adds)': the amount it adds"),
        R("All-Day Breakfast", "All-Day Breakfast", BRK),
        R("Big Brekkie (Figures are for white toast)", "Big Brekkie (white toast)", BRK, note=WT),
        R("Sunrise (Figures are for white toast)", "Sunrise (white toast)", BRK, note=WT),
        R("Meat-Free Mini (Figures are for white toast)", "Meat-Free Mini (white toast)", BRK, note=WT),
        R("Toasted Teacake & Butter", "Toasted Teacake & Butter", BRK),
    ]),
    ("MUFFINS & BREAKFAST ADD-ONS", [
        R("1 Slice of White Toast & Butter", "1 Slice of White Toast & Butter", ADD, "1 slice", False),
        R("1 Slice of Wholemeal Toast & Butter", "1 Slice of Wholemeal Toast & Butter", ADD, "1 slice", False),
        R("Bacon Slice", "Bacon Slice", ADD, "1 slice", False, [PORK], "Bacon is in the name; also printed under Burger and Grill add-ons"),
        R("Breakfast Sausage", "Breakfast Sausage", ADD, "", False, [PORK], "Sausage is in the name; also printed under Grill add-ons"),
        R("Sausage Patty", "Sausage Patty", ADD, "", False, [PORK], "Sausage is in the name"),
        R("Free-Range Fried Egg", "Free-Range Fried Egg", ADD, "", False, note="Also printed under Grill add-ons"),
        R("Hash Brown", "Hash Brown", ADD, "", False, note="Also printed under Burger add-ons, Grill add-ons and Kids side choices"),
        R("Cheese Slice", "Cheese Slice", ADD, "1 slice", False, note="Also printed under Burger add-ons"),
        X("Heinz Baked Beans", DUP.format(where="Sides")),
        X("Mushrooms", DUP.format(where="Sides")),
    ]),
    ("SIDES", [
        R("3 Chicken Strips", "3 Chicken Strips", SID),
        R("5 Chicken Strips", "5 Chicken Strips", SID),
        R("10 Chicken Strips", "10 Chicken Strips", SID),
        R("3 Plant-Based Strips", "3 Plant-Based Strips", SID, note=PB),
        R("5 Plant-Based Strips", "5 Plant-Based Strips", SID, note=PB),
        R("10 Plant-Based Strips", "10 Plant-Based Strips", SID, note=PB),
        R("4 Mozzarella Melts", "4 Mozzarella Melts", SID),
        R("6 Mozzarella Melts", "6 Mozzarella Melts", SID),
        R("6 Onion Rings", "6 Onion Rings", SID),
        R("10 Onion Rings", "10 Onion Rings", SID),
        R("Cheesy Chips", "Cheesy Chips", SID),
        R("Sweet Potato Chips", "Sweet Potato Chips", SID),
        R("Wimpy Chips", "Wimpy Chips", SID),
        R("Steakhouse Seasoned Chips", "Steakhouse Seasoned Chips", SID),
        R("Heinz Baked Beans", "Heinz Baked Beans", SID, note="Also printed, identical, under Breakfast add-ons"),
        R("Peas", "Peas", SID),
        R("Mushrooms", "Mushrooms", SID, note="Also printed, identical, under Breakfast and Burger add-ons"),
        R("Coleslaw", "Coleslaw", SID),
        R("Mini Cob", "Mini Cob", SID, note="Also printed, identical, under Kids side choices"),
    ]),
    ("SAUCES - SIDE PORTION (20G SERVING)", [
        R("BBQ Sauce", "BBQ Sauce (side portion)", SAU, SIDE, False),
        R("HP Brown Sauce", "HP Brown Sauce (side portion)", SAU, SIDE, False),
        R("Habanero Sauce", "Habanero Sauce (side portion)", SAU, SIDE, False),
        R("Wimpy Ketchup", "Wimpy Ketchup (side portion)", SAU, SIDE, False),
        R("Wimpy Mayo", "Wimpy Mayo (side portion)", SAU, SIDE, False),
        R("Wimpy Special Sauce", "Wimpy Special Sauce (side portion)", SAU, SIDE, False),
        R("Tartare Sauce", "Tartare Sauce (side portion)", SAU, SIDE, False),
        R("Vegan Mayo", "Vegan Mayo (side portion)", SAU, SIDE, False, [VEG], "'Vegan' is in the name"),
    ]),
    ("SAUCES - 100g DIP POTS (TAKE AWAY & DELIVERY)", [
        R("BBQ Sauce", "BBQ Sauce (dip pot)", SAU, POT, False),
        R("HP Brown Sauce", "HP Brown Sauce (dip pot)", SAU, POT, False),
        R("Habanero Sauce", "Habanero Sauce (dip pot)", SAU, POT, False),
        R("Wimpy Ketchup", "Wimpy Ketchup (dip pot)", SAU, POT, False),
        R("Wimpy Mayo", "Wimpy Mayo (dip pot)", SAU, POT, False),
        R("Wimpy Special Sauce", "Wimpy Special Sauce (dip pot)", SAU, POT, False),
        R("Tartare Sauce", "Tartare Sauce (dip pot)", SAU, POT, False),
        R("Vegan Mayo", "Vegan Mayo (dip pot)", SAU, POT, False, [VEG], "'Vegan' is in the name"),
    ]),
    ("BURGERS", [
        R("Wimpy Hamburger", "Wimpy Hamburger", BUR),
        R("Wimpy Cheeseburger", "Wimpy Cheeseburger", BUR),
        R("Double Wimpy Cheeseburger", "Double Wimpy Cheeseburger", BUR),
        R("Quarterpounder Bacon & Cheese Burger", "Quarterpounder Bacon & Cheese Burger", BUR, tags=[PORK], note="Bacon is in the name"),
        R("Original Quarterpounder Cheese", "Original Quarterpounder Cheese", BUR),
        R("Original Halfpounder", "Original Halfpounder", BUR),
        R("Halfpounder Bacon & Cheese", "Halfpounder Bacon & Cheese", BUR, tags=[PORK], note="Bacon is in the name"),
        R("Hot n Loaded", "Hot n Loaded", BUR),
        R("Bendy & Cheese", "Bendy & Cheese", BUR),
        R("Big n Mighty", "Big n Mighty", BUR),
        R("Fish Burger", "Fish Burger", BUR),
        R("Crispy Chicken Fillet (Figures exclude choice of sauce)", "Crispy Chicken Fillet (excl. sauce)", BUR, note=ES),
        R("Crispy Chicken Stack (Figures exclude choice of sauce)", "Crispy Chicken Stack (excl. sauce)", BUR, note=ES),
        R("Crispy Chickn Bacon Stack (Figures exclude choice of sauce)", "Crispy Chicken Bacon Stack (excl. sauce)", BUR,
          tags=[PORK], note=ES + ". Printed 'Chickn' (typo in the guide); name tidied. Bacon is in the name"),
        R("Spicy Bean & Slaw", "Spicy Bean & Slaw", BUR),
        R("The Beyond Burger", "The Beyond Burger", BUR),
        R("Express Hamburger", "Express Hamburger", BUR),
        R("Express Cheeseburger", "Express Cheeseburger", BUR),
        R("Express Bacon & Cheese Burger", "Express Bacon & Cheese Burger", BUR, tags=[PORK], note="Bacon is in the name"),
    ]),
    ("BURGER ADD-ONS", [
        X("Bacon Slice", DUP.format(where="Breakfast add-ons")),
        X("Cheese Slice", DUP.format(where="Breakfast add-ons")),
        X("Hash Brown", DUP.format(where="Breakfast add-ons")),
        X("Mushrooms", DUP.format(where="Sides")),
        R("Jalapeños", "Jalapeños", ADD, "", False, note="Salt printed 2.5 g for 6 kcal: high but not impossible; entered as printed"),
    ]),
    ("GRILL PLATES", [
        R("The Big Grill", "The Big Grill", GRL),
        R("Mini Grill", "Mini Grill", GRL),
        X("All-Day Breakfast", DUP.format(where="Breakfasts")),
        R("Wimpy Grill", "Wimpy Grill", GRL),
    ]),
    ("GRILL ADD-ONS", [
        X("Bacon Slice", DUP.format(where="Breakfast add-ons")),
        X("Breakfast Sausage", DUP.format(where="Breakfast add-ons")),
        X("Free-Range Fried Egg", DUP.format(where="Breakfast add-ons")),
        X("Hash Brown", DUP.format(where="Breakfast add-ons")),
        R("Pork Bendy", "Pork Bendy", ADD, "", False, [PORK], "Pork is in the name"),
    ]),
    ("CRISPY CHICKEN & PLANT-BASED", [
        R("Chicken Wrap (Figures exclude choice of sauce)", "Chicken Wrap (excl. sauce)", CHK, note=ES),
        R("Plant-Based Wrap (Figures exclude choice of sauce)", "Plant-Based Wrap (excl. sauce)", CHK, note=ES),
        R("Chicken Strips & Chips (Figures exclude choice of sauce)", "Chicken Strips & Chips (excl. sauce)", CHK, note=ES),
        R("Plant-Based Strips & Chips (Figures exclude choice of sauce)", "Plant-Based Strips & Chips (excl. sauce)", CHK, note=ES),
        R("Chicken Salad Basket", "Chicken Salad Basket", CHK),
        R("Plant-Based Salad Basket", "Plant-Based Salad Basket", CHK),
        R("Club Sandwich", "Club Sandwich", CHK),
    ]),
    ("COMFORT EATS", [
        R("Loaded Cheesy Chips", "Loaded Cheesy Chips", CMF),
        R("Battered Cod, Chips & Peas", "Battered Cod, Chips & Peas", CMF),
        R("Express Battered Cod & Chips", "Express Battered Cod & Chips", CMF),
    ]),
    ("JACKET POTATO & FILLING CHOICES", [
        R("Jacket Potato and Butter", "Jacket Potato and Butter", JKT),
        R("Heinz Baked Beans", "Baked Beans (jacket potato filling)", JKT, "", False, note="Different numbers from the Baked Beans side"),
        R("Grated Cheese", "Grated Cheese (jacket potato filling)", JKT, "", False),
        R("Mushrooms", "Mushrooms (jacket potato filling)", JKT, "", False, note="Fibre printed 1.0 here, 1.7 for the Mushrooms side; other numbers identical"),
        R("Bacon", "Bacon (jacket potato filling)", JKT, "", False, [PORK], "Bacon is in the name; numbers identical to Bacon Slice"),
        R("Coleslaw", "Coleslaw (jacket potato filling)", JKT, "", False, note="Different numbers from the Coleslaw side"),
    ]),
    ("DESSERTS", [
        R("Brown Derby", "Brown Derby", DES, "", False),
        R("Waffle Stack (Figures exclude choice of topping)", "Waffle Stack (excl. topping)", DES, "", False, note=ET),
        R("Chocolate Brownie (Figures exclude choice of cream or ice cream side)", "Chocolate Brownie (excl. cream or ice cream)", DES, "", False, note=EC),
        R("Brownie Whirl", "Brownie Whirl", DES, "", False),
        R("Wimpy Whirl (Figures exclude choice of toppings)", "Wimpy Whirl (excl. toppings)", DES, "", False, note="Printed 'Figures exclude choice of toppings'"),
        R("Berry Nice Cheesecake (Figures exclude choice of cream or ice cream side)", "Berry Nice Cheesecake (excl. cream or ice cream)", DES, "", False, note=EC),
        R("Caramel Apple Pie (Figures exclude choice of cream or ice cream side)", "Caramel Apple Pie (excl. cream or ice cream)", DES, "", False, note=EC),
        R("Churro Whirl (Adult)", "Churro Whirl (adult)", DES, "", False),
        R("Loaded Churros (Sharer Basket) - (excludes choice of sauce)", "Loaded Churros, sharer basket (excl. sauce)", DES, "", False,
          note="Printed 'excludes choice of sauce'"),
        R("Takeaway Churro Cup (excludes choice of sauce)", "Takeaway Churro Cup (excl. sauce)", DES, "", False, note="Printed 'excludes choice of sauce'"),
        R("Ice Cream Cone", "Ice Cream Cone", DES, "", False),
        R("Side of Ice Cream", "Side of Ice Cream", DES, "", False),
        R("Side of Cream", "Side of Cream", DES, "", False),
    ]),
    ("ICE CREAM TOPPINGS", [
        R("Chocolate Sauce", "Chocolate Sauce", TOP, "", False),
        R("Strawberry Sauce", "Strawberry Sauce", TOP, "", False),
        R("Maple-Flavoured Syrup", "Maple-Flavoured Syrup", TOP, "", False),
        R("Toffee Fudge Sauce", "Toffee Fudge Sauce", TOP, "", False),
        R("OREO Cookie Pieces", "OREO Cookie Pieces", TOP, "", False, note="Also printed, identical, under Shake add-ons"),
        R("Lotus Biscoff Crumb", "Lotus Biscoff Crumb", TOP, "", False, note="Also printed, identical, under Shake add-ons"),
        R("Chocolate Flake", "Chocolate Flake", TOP, "", False, note="Also printed, identical, under Shake add-ons"),
        R("Mini Marshmallows", "Mini Marshmallows", TOP, "", False, note="Also printed, identical, under Shake add-ons"),
    ]),
    ("COLD DRINKS", [
        R("Pepsi", "Pepsi", CLD, "", False),
        R("Pepsi Max Cherry", "Pepsi Max Cherry", CLD, "", False),
        R("Pepsi Max", "Pepsi Max", CLD, "", False),
        R("7UP Zero Sugar", "7UP Zero Sugar", CLD, "", False),
        R("Tango Orange Sugar Free", "Tango Orange Sugar Free", CLD, "", False),
        X("Pepsi Sparkling Drink Range - Home Delivery 300ml Can", "No numbers printed ('Various flavours - See details on can')"),
        X("Pepsi Sparkling Drink Range - Home Delivery 500ml Bottle", "No numbers printed ('Various flavours - See details on bottle')"),
        R("Iced Coffee", "Iced Coffee", CLD, "", False),
        R("Lipton Ice Tea Peach", "Lipton Ice Tea Peach", CLD, "", False),
        R("Lipton Ice Tea Lemon", "Lipton Ice Tea Lemon", CLD, "", False),
        R("Ballygowan Mineral Water - Sparkling", "Ballygowan Sparkling Mineral Water", CLD, "", False),
        R("Ballygowan Mineral Water - Still", "Ballygowan Still Mineral Water", CLD, "", False),
        R("Orange Juice", "Orange Juice", CLD, "", False),
        R("Apple Juice", "Apple Juice", CLD, "", False),
    ]),
    ("CLASSIC THICK SHAKES", [
        R("Thick Shake - Vanilla", "Thick Shake - Vanilla", SHK, "", False),
        R("Thick Shake - Strawberry", "Thick Shake - Strawberry", SHK, "", False),
        R("Thick Shake - Chocolate", "Thick Shake - Chocolate", SHK, "", False),
        R("Thick Shake - Banana", "Thick Shake - Banana", SHK, "", False),
        R("Thick Shake - Salted Caramel", "Thick Shake - Salted Caramel", SHK, "", False),
        R("Thick Shake - Coffee", "Thick Shake - Coffee", SHK, "", False),
    ]),
    ("SHAKE ADD-ONS & DRINK TOPPINGS", [
        X("Chocolate Flake", DUP.format(where="Ice cream toppings")),
        X("Mini Marshmallows", DUP.format(where="Ice cream toppings")),
        X("OREO Cookie Pieces", DUP.format(where="Ice cream toppings")),
        X("Lotus Biscoff Crumb", DUP.format(where="Ice cream toppings")),
        R("Cream", "Cream (shake or drink topping)", TOP, "", False, note="Different numbers from Side of Cream"),
    ]),
    ("ICE CREAM FLOATS", [
        R("Pepsi Float", "Pepsi Float", SHK, "", False),
        R("Pepsi Max Cherry Float", "Pepsi Max Cherry Float", SHK, "", False),
        R("Pepsi Max Float", "Pepsi Max Float", SHK, "", False),
        R("7UP Zero Sugar Float", "7UP Zero Sugar Float", SHK, "", False),
        R("Tango Orange Sugar Free Float", "Tango Orange Sugar Free Float", SHK, "", False),
    ]),
    ("HOT DRINKS", [
        R("Cappuccino", "Cappuccino", HOT, "Regular", False),
        R("Latte", "Latte", HOT, "Regular", False),
        R("Flat White", "Flat White", HOT, "Regular", False),
        R("Americano with Milk", "Americano with Milk", HOT, "Regular", False),
        R("Americano - Black", "Americano - Black", HOT, "Regular", False),
        R("Hot Chocolate (without Cream)", "Hot Chocolate (without cream)", HOT, "Regular", False),
        R("Tea with Milk", "Tea with Milk", HOT, "Regular", False),
        R("Tea - Black", "Tea - Black", HOT, "Regular", False),
        R("Fruit & Herbal Teas (Various)", "Fruit & Herbal Teas (various)", HOT, "Regular", False, note="One set of numbers printed for 'Various' teas"),
        R("Extra Shot of Coffee", "Extra Shot of Coffee", HOT, "Single shot", False),
        R("Flavoured Syrup - Vanilla", "Flavoured Syrup - Vanilla", HOT, "1 shot", False),
        R("Flavoured Syrup - Salted Caramel", "Flavoured Syrup - Salted Caramel", HOT, "1 shot", False),
        R("Lotus Biscoff Biscuit", "Lotus Biscoff Biscuit", HOT, "", False),
    ]),
    ("KIDS MEAL - MAIN ITEMS", [
        R("Chicken Strips", "Kids Chicken Strips", KMN, note="Printed 'Chicken Strips' under Kids meal main items"),
        R("Junior Hamburger", "Junior Hamburger", KMN),
        R("Junior Cheeseburger", "Junior Cheeseburger", KMN),
        R("Sausage", "Kids Sausage", KMN, tags=[PORK], note="Printed 'Sausage' under Kids meal main items; sausage is in the name; numbers identical to Breakfast Sausage"),
        R("Plant-Based Strips", "Kids Plant-Based Strips", KMN, note="Printed 'Plant-Based Strips' under Kids meal main items; " + PB),
    ]),
    ("KIDS MEAL - SIDE CHOICES", [
        R("Chips", "Kids Chips", KMN, note="Printed 'Chips' under Kids meal side choices"),
        X("Hash Brown", DUP.format(where="Breakfast add-ons")),
        R("Heinz Baked Beans", "Kids Baked Beans", KMN, note="Printed 'Heinz Baked Beans' under Kids meal side choices"),
        R("Peas", "Kids Peas", KMN, note="Printed 'Peas' under Kids meal side choices"),
        X("Mini Cob", DUP.format(where="Sides")),
    ]),
    ("KIDS DESSERTS", [
        R("Junior Whirl (Figures exclude choice of sauce topping)", "Junior Whirl (excl. sauce topping)", KDE, "", False, note="Printed 'Figures exclude choice of sauce topping'"),
        R("Waffle & Ice Cream (Figures exclude choice of sauce topping)", "Waffle & Ice Cream (excl. sauce topping)", KDE, "", False,
          note="Printed 'Figures exclude choice of sauce topping'"),
        R("Jelly & Ice Cream", "Jelly & Ice Cream", KDE, "", False),
        R("Chocolate Sauce", "Kids Chocolate Sauce", KDE, "", False, note="Printed 'Chocolate Sauce' under Kids desserts"),
        R("Strawberry Sauce", "Kids Strawberry Sauce", KDE, "", False, note="Printed 'Strawberry Sauce' under Kids desserts"),
        R("Toffee Fudge Sauce", "Kids Toffee Fudge Sauce", KDE, "", False, note="Printed 'Toffee Fudge Sauce' under Kids desserts"),
    ]),
    ("KIDS DRINKS", [
        R("Pepsi Max", "Kids Pepsi Max", KDR, "", False, note="Printed 'Pepsi Max' under Kids drinks"),
        R("Pepsi Max Cherry", "Kids Pepsi Max Cherry", KDR, "", False, note="Printed 'Pepsi Max Cherry' under Kids drinks"),
        R("7UP Zero Sugar", "Kids 7UP Zero Sugar", KDR, "", False, note="Printed '7UP Zero Sugar' under Kids drinks"),
        R("Tango Orange Free", "Kids Tango Orange Free", KDR, "", False, note="Printed 'Tango Orange Free' under Kids drinks"),
        R("Robinsons Fruit Shoot Orange", "Robinsons Fruit Shoot Orange", KDR, "", False),
        R("Robinsons Fruit Shoot Apple and Blackcurrant", "Robinsons Fruit Shoot Apple and Blackcurrant", KDR, "", False),
        R("Orange Squash", "Orange Squash", KDR, "", False),
        R("Apple & Blackcurrant Squash", "Apple & Blackcurrant Squash", KDR, "", False),
        R("Thick Shake - Vanilla", "Kids Thick Shake - Vanilla", KDR, "", False, note="Printed 'Thick Shake - Vanilla' under Kids drinks"),
        R("Thick Shake - Strawberry", "Kids Thick Shake - Strawberry", KDR, "", False, note="Printed 'Thick Shake - Strawberry' under Kids drinks"),
        R("Thick Shake - Chocolate", "Kids Thick Shake - Chocolate", KDR, "", False, note="Printed 'Thick Shake - Chocolate' under Kids drinks"),
        R("Thick Shake - Banana", "Kids Thick Shake - Banana", KDR, "", False, note="Printed 'Thick Shake - Banana' under Kids drinks"),
        R("Thick Shake - Salted Caramel", "Kids Thick Shake - Salted Caramel", KDR, "", False, note="Printed 'Thick Shake - Salted Caramel' under Kids drinks"),
    ]),
]

# Items whose numbers the guide prints impossibly (item id, reason). Nothing is corrected: the item is simply not published.
# Filled in after the consistency review printed by this script (see "consistency flags").
HOLDBACK: list[tuple[str, str]] = []

# ---------------------------------------------------------------------------------------------------------------------
# Reading the PDF
# ---------------------------------------------------------------------------------------------------------------------
NUM = r"<?\d+(?:\.\d+)?"
FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
ROW = re.compile(r"^(?P<label>\S.*?)\s{2,}(?:(?P<size>Reg|Single|Shot)\s{2,})?"
                 + r"\s+".join(f"(?P<{f}>{NUM})" for f in FIELDS) + r"(?=\s|$)")
# Printed lines in the table area that are neither a numbered row nor a heading (their reason is in SECTIONS).
UNNUMBERED = {"Pepsi Sparkling Drink Range - Home Delivery 300ml Can Various flavours - See details on can",
              "Pepsi Sparkling Drink Range - Home Delivery 500ml Bottle Various flavours - See details on bottle"}


def norm(s: str) -> str:
    """Compare labels ignoring trademark signs, dashes and spacing."""
    s = s.replace("®", "").replace("™", "").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s).strip().lower()


def read_pdf(pdf: Path) -> list[dict]:
    """Rows in reading order: [{'heading', 'label', 'size', kj..salt}] and unnumbered lines as {'heading', 'label', 'text'}."""
    out: list[dict] = []
    heading = None
    known = {norm(h) for h, _ in SECTIONS}
    for page in (1, 2):
        text = subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                              check=True, capture_output=True, text=True).stdout
        lines = text.split("\n")
        start = next((i for i, ln in enumerate(lines) if ln.strip() == "MENU ITEM"), None)
        if start is None:
            raise SystemExit(f"Page {page}: the 'MENU ITEM' table header was not found: the layout changed, re-check the parser.")
        for ln in lines[start + 1:]:
            if not ln.strip():
                continue
            m = ROW.match(ln.strip())
            if m:
                out.append({"heading": heading, **m.groupdict()})
                continue
            flat = re.sub(r"\s+", " ", ln.strip())
            if norm(flat) in known:
                heading = flat
                continue
            if norm(flat) in {norm(u) for u in UNNUMBERED}:
                out.append({"heading": heading, "label": flat, "unnumbered": True})
                continue
            raise SystemExit(f"Page {page}: unexpected line in the table area: {flat!r}. The layout or menu changed: re-check SECTIONS.")
    return out


# ---------------------------------------------------------------------------------------------------------------------
# Reading the allergen dots
# ---------------------------------------------------------------------------------------------------------------------
# The allergen column names, as printed (rotated) above the dots, left to right.
ALLERGEN_COLUMNS = ("Wheat", "Rye", "Barley", "Oats", "Spelt", "Kamut", "Milk", "Egg", "Soya", "Peanuts", "Nuts", "Sesame",
                    "Mustard", "Celery", "Fish", "Crustacean", "Sulphur Dioxide", "Lupin", "Mollusc")
# The three dot colours drawn in the table (exact fills in the April 2026 PDF) and what the key says each means.
CONTAINS, MAY = "contains", "may_contain"
DOT_COLOURS = {
    "rgb(66.168213%, 6.941223%, 16.738892%)": CONTAINS,   # red: planned ingredient
    "rgb(97.740173%, 68.045044%, 4.518127%)": MAY,        # amber: supplier cross-contact
    "rgb(28.773499%, 24.528503%, 21.588135%)": MAY,       # dark brown: shared cooking equipment / oil
}
# The key's three bullets top to bottom (text glyphs, slightly different tints): contains, may (supplier), may (equipment).
KEY_ORDER = ("rgb(66.168213%, 6.941223%, 16.738892%)", "rgb(97.740173%, 68.045044%, 4.518127%)",
             "rgb(28.773499%, 24.528503%, 21.588135%)")
DOT_SIZE = (5.0, 6.5)       # pt, the dots are 5.7 pt circles
ROW_REACH, COL_REACH = 2.0, 2.5  # pt between a dot's centre and its row / column centre (rows are 7.1 pt, columns 15.4 pt apart)
LABEL_MAX_X, NUM_X = 240.0, (240.0, 505.0)  # crop-box x: row names left of 240, the nine numbers between 240 and 505


def _rgb(s: str) -> tuple[float, ...]:
    return tuple(float(x) for x in re.findall(r"[\d.]+", s))


def _page_words(pdf: Path, page: int) -> list[tuple]:
    """pdftotext words in crop-box coordinates (the same origin as pdftocairo's SVG)."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "words.html"
        subprocess.run(["pdftotext", "-cropbox", "-bbox", "-f", str(page), "-l", str(page), str(pdf), str(out)], check=True)
        text = out.read_text(encoding="utf-8")
    return [(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
            re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', text)]


def _page_svg(pdf: Path, page: int) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "page.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(out)], check=True)
        return out.read_text(encoding="utf-8")


def _dots(svg: str) -> list[tuple[str, float, float]]:
    """Every filled round shape of dot size: (fill, centre x, centre y)."""
    body = svg[svg.index("</defs>"):]
    dots = []
    for attrs in re.findall(r"<path ([^>]*)/>", body):
        fill = re.search(r'\bfill="([^"]+)"', attrs).group(1)
        d = re.search(r'\bd="([^"]+)"', attrs).group(1)
        if fill == "none" or "C" not in d:
            continue
        nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", d)]
        pts = list(zip(nums[0::2], nums[1::2]))
        tm = re.search(r'transform="matrix\(([^)]+)\)"', attrs)
        if tm:
            a, b, c, dd, e, f = (float(x) for x in tm.group(1).split(","))
            pts = [(a * x + c * y + e, b * x + dd * y + f) for x, y in pts]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if DOT_SIZE[0] < w < DOT_SIZE[1] and DOT_SIZE[0] < h < DOT_SIZE[1]:
            dots.append((fill, (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2))
    return dots


def _check_key(svg: str) -> None:
    """The key's three bullets (page 1, top left) must be, top to bottom, nearest in colour to red, amber, dark brown."""
    body = svg[svg.index("</defs>"):]
    bullets = []
    for fill, inner in re.findall(r'<g fill="([^"]+)"[^>]*>(.*?)</g>', body, re.S):
        for x, y in re.findall(r'<use xlink:href="#[^"]+" x="([\d.]+)" y="([\d.]+)"/>', inner):
            if float(x) < 36 and 80 < float(y) < 125:
                bullets.append((float(y), fill))
    bullets.sort()
    if len(bullets) != 3:
        raise SystemExit(f"The allergen key has {len(bullets)} bullets, expected 3: the layout changed, re-check the key.")
    for (_, key_fill), dot_fill in zip(bullets, KEY_ORDER):
        nearest = min(KEY_ORDER, key=lambda f: sum((a - b) ** 2 for a, b in zip(_rgb(f), _rgb(key_fill))))
        if nearest != dot_fill:
            raise SystemExit(f"The allergen key's colours are not in the expected order ({key_fill} is nearest to {nearest}): "
                             "re-check what each dot colour means.")


def read_allergens(pdf: Path) -> list[dict]:
    """Numbered table rows in reading order (page 1, then page 2):
    {"label", "kj", "kcal", "contains": [column names], "may_contain": [column names]}."""
    rows: list[dict] = []
    for page in (1, 2):
        words, svg = _page_words(pdf, page), _page_svg(pdf, page)
        text = " ".join(w[4] for w in words)
        if page == 1:
            _check_key(svg)
            for phrase in ("This product contains the indicated allergen as a planned ingredient.",
                           "This product may contain the indicated allergen. A supplier has advised us",
                           "his product may contain the indicated allergen via the use of shared cooking equipment"):
                if phrase not in text:
                    raise SystemExit(f"The allergen key no longer says {phrase!r}: re-check what each dot colour means.")
        # column names: rotated words in the header band right of the numbers
        heads = [w for w in words if w[0] > NUM_X[1] and w[1] > 140 and w[3] < 205 and (w[3] - w[1]) > (w[2] - w[0])]
        cols: list[list] = []
        for w in sorted(heads, key=lambda w: (w[0] + w[2]) / 2):
            cx = (w[0] + w[2]) / 2
            if cols and abs(cols[-1][0] - cx) < 3:
                cols[-1][1].append(w)
            else:
                cols.append([cx, [w]])
        names = [" ".join(w[4] for w in sorted(ws, key=lambda w: -w[1])) for _, ws in cols]  # rotated: read bottom to top
        if tuple(names) != ALLERGEN_COLUMNS:
            raise SystemExit(f"Page {page}: the allergen columns are now {names}: the layout changed, re-check ALLERGEN_COLUMNS.")
        col_x = [cx for cx, _ in cols]
        # numbered rows: a line (words within 2 pt) below the header with exactly nine numbers in the nutrition columns
        lines: list[list] = []
        for w in sorted((w for w in words if w[1] > 205), key=lambda w: (w[1] + w[3]) / 2):
            yc = (w[1] + w[3]) / 2
            if lines and abs(lines[-1][0] - yc) < 2:
                lines[-1][1].append(w)
            else:
                lines.append([yc, [w]])
        page_rows = []
        for yc, ws in lines:
            nums = sorted((w for w in ws if NUM_X[0] < w[0] < NUM_X[1] and re.fullmatch(NUM, w[4])), key=lambda w: w[0])
            if len(nums) != len(FIELDS):
                continue
            label = " ".join(w[4] for w in sorted(ws, key=lambda w: w[0]) if w[2] < LABEL_MAX_X)
            page_rows.append({"y": yc, "label": label, "kj": nums[0][4], "kcal": nums[1][4], CONTAINS: [], MAY: []})
        cells: set = set()
        for fill, x, y in _dots(svg):
            if fill not in DOT_COLOURS:
                raise SystemExit(f"Page {page}: a dot of an unknown colour {fill} at ({x:.0f}, {y:.0f}): re-check the key.")
            ri = min(range(len(page_rows)), key=lambda i: abs(page_rows[i]["y"] - y))
            r = page_rows[ri]
            c = min(range(len(col_x)), key=lambda i: abs(col_x[i] - x))
            if abs(r["y"] - y) > ROW_REACH or abs(col_x[c] - x) > COL_REACH:
                raise SystemExit(f"Page {page}: a dot at ({x:.0f}, {y:.0f}) is not in a column beside a numbered row: layout changed.")
            if (ri, c) in cells:
                raise SystemExit(f"Page {page}: two dots in one cell ({r['label']!r}, {ALLERGEN_COLUMNS[c]}): re-check the PDF.")
            cells.add((ri, c))
            r[DOT_COLOURS[fill]].append(ALLERGEN_COLUMNS[c])
        for r in page_rows:
            for k in (CONTAINS, MAY):
                r[k].sort(key=ALLERGEN_COLUMNS.index)
            del r["y"]
        rows += page_rows
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=None, help="default: data/source/wimpy")
    args = ap.parse_args()

    printed = read_pdf(args.pdf)
    spec: list[tuple[str, dict]] = [(h, e) for h, entries in SECTIONS for e in entries]
    if len(printed) != len(spec):
        print(f"The PDF has {len(printed)} table rows but this script names {len(spec)}. The layout or menu changed: "
              "re-check SECTIONS against the PDF before running again.", file=sys.stderr)
        return 1
    numbered = [r for r in printed if not r.get("unnumbered")]
    dots = read_allergens(args.pdf)
    if len(dots) != len(numbered) or any(norm(a["label"]) != norm(r["label"]) or a["kj"] != r["kj"] or a["kcal"] != r["kcal"]
                                         for a, r in zip(dots, numbered)):
        print("The allergen rows do not line up with the nutrition rows (count, name, kJ or kcal differs): re-check the layout.",
              file=sys.stderr)
        return 1
    by_row = {id(r): a for r, a in zip(numbered, dots)}
    items, excluded = [], []
    for n, (row, (heading, e)) in enumerate(zip(printed, spec), start=1):
        same = (norm(row["label"]).startswith(norm(e["label"])) if row.get("unnumbered")
                else norm(row["label"]) == norm(e["label"]))
        if norm(row["heading"] or "") != norm(heading) or not same:
            print(f"Row {n}: the PDF prints {row['label']!r} under {row['heading']!r} but this script expects {e['label']!r} "
                  f"under {heading!r}. The menu changed: re-check SECTIONS.", file=sys.stderr)
            return 1
        if e["name"] is None:
            excluded.append((heading, e["label"], e["reason"]))
            continue
        if row.get("unnumbered"):
            print(f"Row {n}: {row['label']!r} has no numbers but is listed as an item.", file=sys.stderr)
            return 1
        a = by_row[id(row)]
        contains, cereals, nuts = allergen_words(a[CONTAINS], f"{e['label']} (contains)")
        may, _, _ = allergen_words(a[MAY], f"{e['label']} (may contain)")
        note = e["note"]
        if row.get("size"):
            note = (note + "; " if note else "") + f"Printed size column: {row['size']}"
        items.append({
            "name": e["name"], "category": e["cat"], "serving": e["serving"],
            "calories": row["kcal"], "protein_g": row["protein"], "carbs_g": row["carbs"], "fat_g": row["fat"],
            "sat_fat_g": row["sat"], "sodium_mg": "", "salt_g": row["salt"], "sugar_g": row["sugars"], "fiber_g": row["fibre"],
            "tags": "|".join(sorted(e["tags"])), "limited_time": False, "rankable": e["rank"], "notes": note,
            "energy_kj": row["kj"], "_kj": row["kj"], "_heading": heading,
            "allergens": {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts},
        })
    # Unique ids (the names above are written to be unique; a clash would mean two different products share a name).
    for it in items:
        it["id"] = slug(unicodedata.normalize("NFKD", it["name"]).encode("ascii", "ignore").decode())  # 'Jalapeños' -> jalapenos
    ids = [i["id"] for i in items]
    clashes = sorted({i for i in ids if ids.count(i) > 1})
    if clashes:
        print(f"Duplicate item names: {clashes}. Give each product its own name.", file=sys.stderr)
        return 1

    # Consistency review of what is PRINTED (never corrected): flags go to the report, impossible rows to HOLDBACK.
    flags = []
    for it in items:
        f = lambda k: float(it[k].lstrip("<")) if it[k] != "" else 0.0  # noqa: E731
        kcal, kj = f("calories"), float(it["_kj"].lstrip("<"))
        if f("sat_fat_g") > f("fat_g"):
            flags.append((it["name"], f"saturates {it['sat_fat_g']} g exceed fat {it['fat_g']} g"))
        if f("sugar_g") > f("carbs_g"):
            flags.append((it["name"], f"sugars {it['sugar_g']} g exceed carbs {it['carbs_g']} g"))
        if kcal >= 20 and abs(kj - 4.184 * kcal) > 0.08 * 4.184 * kcal:
            flags.append((it["name"], f"kJ {it['_kj']} and kcal {it['calories']} disagree"))
        if it["fat_g"] == it["carbs_g"] and f("fat_g") >= 5:
            flags.append((it["name"], f"fat and carbs are both printed {it['fat_g']}"))
    for it in items:
        it.pop("_kj"), it.pop("_heading")

    out = write_chain_folder(chain_id=CHAIN_ID, name="Wimpy", cuisine="Burgers", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=HOLDBACK,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    by_cat: dict[str, int] = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    print("by category:", ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    print(f"left out {len(excluded)} printed rows:")
    for heading, label, why in excluded:
        print(f"  - [{heading}] {label}: {why}")
    print(f"held back {len(HOLDBACK)} items:", ", ".join(h for h, _ in HOLDBACK) or "none")
    print(f"consistency flags on printed numbers ({len(flags)}):")
    for name, why in flags:
        print(f"  - {name}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
