#!/usr/bin/env python3
"""Build data/source/hard-rock-cafe/ from Hard Rock Cafe London's own menu PDFs (a CALORIES-ONLY chain).

    python3 tools/uk_extract/hard_rock_cafe.py --menu menu.pdf --kids kids.pdf --checked-on 2026-10-07 \
        [--gf gluten_free.pdf] [--allergen-pdf allergens.pdf] [--fetch DIR] [--out DIR]

Sources (all linked from the chain's own London page https://cafe.hardrock.com/london/ , robots.txt allows everything):
  menu  "HARD ROCK CAFE MENU" (Drinks & Eats, footer "2/26 - London - ENG"; PDF created 13 Mar 2026, served Last-Modified 8 Apr 2026)
        https://cafe.hardrock.com/london/files/5330/USJ219878_-_HRC_EU_-DRINKS_&_EATS_MENU_-_FEB_26_-_B_-_LONDON_OPL_-_ENG.pdf
  kids  "MESSI KIDS MENU" (footer "MAY 26 - London Piccadilly - ENG"; PDF created 25 Aug 2026, Last-Modified 2 Sep 2026)
        https://cafe.hardrock.com/london/files/5330/Kids.pdf
  gf    "GLUTEN FREE MENU" (footer "GF AB - London - ENG - 1/26"; PDF created 12 Dec 2025): NOT published, only used as a cross-check
        (see GF_ROWS and the report this script prints).
  allergen sheet (link only, see below): "FOOD & BEVERAGE ALLERGENS"
        https://cafe.hardrock.com/london/files/5330/Food_menu_allergen_sheet_HardRockCafeLondon.pdf
Needs `pdftotext` (poppler). Brunch, Spritz, Pinktober and catering PDFs on the same page print no calories.

The menus print calories ONLY, as "(1947 cal)" after a dish's description and price: protein, carbs, fat, salt, kJ and weights are never
printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable). The number is copied from the text
layer exactly as printed. Only the item NAMES, categories and tags are written by hand, in ITEMS / KIDS_ITEMS below. Every
"(N cal)" on every page is read together with the text just before it (back to the previous calorie value) and must be claimed by
exactly one entry (its heading and the printed words before the number must match), and an entry must be found on every page it is
expected on with the same number; anything else stops the run, so a new menu, a moved dish or a new number is re-checked by a human.

How the menu's own wording is read:
- Several pages repeat the same dishes in another layout (zero-proof cocktails, desserts, hot drinks, sodas, Corona Cero): each repeated
  entry lists all its pages and the numbers must agree.
- A dish with a choice of sauce or protein is one item per choice, with the number printed beside the choice (wings, fajitas).
- "Add ..." / "Upgrade to ..." lines are items of their own, named for what they are added to; their number is printed as it is.
  "Half Rack of Ribs" and "House Side Salad" / "Side House Salad" each appear on two lines of the menu with the same number and are
  published as printed (two lines, two items), not merged by guessing.
- "ICED COFFEE (3 cal / 71 cal with milk)" is two items, "TEA (24 cal with milk)" is one ("Tea with milk": no figure without milk).
- "(556 cal + sauces)" (Chicken Dippers): the figure excludes the dipping sauces; stated in the note.
- Coca-Cola Zero Sugar prints 1.5 cal; the pipeline stores calories as whole numbers (2).
- Serving only where the menu prints a size (330ml, 16oz, 12oz). The menu does not say whether burgers/sandwiches/entrées include
  their fries/sides in the number, so nothing is said.
- Tags: vegetarian when the dish line carries the menu's own (V) or (VG) mark ((V-A) and (VG-A) mean "can be made", not tagged).
  contains_pork / contains_beef when the dish's name or the words printed under it say so (pork, bacon, ham, sausage, pepperoni, salami,
  chorizo; beef, steak). Ribs, "Smashed Burgers", the hot dog and the Duo Combo don't say the meat: no tag ("meat type not stated").
- No cocktails (except zero-proof), beer, wine or spirits: the menu prints no calories for them. Corona Cero (non-alcoholic) does.

Allergens (docs/DATA.md "Allergens") are link-only. The London allergen sheet is a matrix whose rows use kitchen names that are not the
menu's ("Hard Rock Nachos" for Classic Nachos, "Smoked Chicken Wings - Classic Sauce", "Breaded Tupelo Dippers", "Hickory Smoked Ribs",
"Classic Cheesecake"), has no rows for most add-ons, drinks, dips and the Messi kids dishes, and marks some cells "M/C" without a legend.
Allergens are safety information: no name matching, no guessing, so only the sheet's link is published (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "hard-rock-cafe"
SITE = "https://cafe.hardrock.com/london/"
BASE = "https://cafe.hardrock.com/london/files/5330/"
URLS = {
    "menu": BASE + "USJ219878_-_HRC_EU_-DRINKS_&_EATS_MENU_-_FEB_26_-_B_-_LONDON_OPL_-_ENG.pdf",
    "kids": BASE + "Kids.pdf",
    "gf": BASE + "USJ219498_-_HRC_EU_-_GLUTEN_FREE_MENU_-_JAN_26_-_AB_UK_CAFES_-_LONDON_OPL_-_ENG.pdf",
    "allergen": BASE + "Food_menu_allergen_sheet_HardRockCafeLondon.pdf",
}
SOURCE_TITLE = ("Hard Rock Cafe London menu with calories (Drinks & Eats, footer 2/26 - London, Feb 2026) and Messi kids meal menu "
                "(footer MAY 26), as linked from the cafe's own London page")
ALLERGEN_GUIDE_TITLE = ("Hard Rock Cafe London Old Park Lane allergen list, 'Food & Beverage Allergens' PDF linked from "
                        "cafe.hardrock.com/london (20 pages, file dated 7 October 2026)")
# The sheet prints a cross-contamination warning for deep-fried foods and marks cells "M/C" (no legend): traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Hard Rock Cafe prints calories only, beside each dish, on its London menus (food and soft drinks 2/26, kids meal 5/26): no protein, "
        "carbs, fat or salt. Cocktails, beer, wine and brunch print none and are not listed. Figures are for the London cafe; other UK cafes may "
        "differ. Chicken Dippers exclude their sauces.")
EXPECTED_MENU_ITEMS = 95
EXPECTED_KIDS_ITEMS = 18

PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MARKS = re.compile(r"\(([A-Z][A-Z\-]*(?:, [A-Z][A-Z\-]*)*)\)")  # (GF), (V), (GF, VG), (V, VG-A) ...

# categories, as the menus group them (names tidied to Title Case)
STA, WIN, ENT, AMP = "Starters & Shareables", "Wings", "Speciality Entrées", "Amplify Your Entrée"
STE, SMA, SAN, TUR, DIP = "Steak Burgers", "Smashed & Stacked", "Sandwiches", "Turn It Up A Notch", "French Fry Dips"
BOW, PRO, SID, DES, HOT = "Bowls & Salads", "Add Protein", "Add-On Sides", "Desserts", "Hot Drinks"
SOD, ZER, BEE = "Sodas & More", "Zero Proof Cocktails", "Bottled Beer"
KEN, KSI, KDE = "Kids Meal: Entrées", "Kids Meal: Sides", "Kids Meal: Desserts"


def I(pages, head, tail, name, cat, serving="", suffix="", after="", unstated=False, note="", second=None):
    """One published item. `pages`: the pages (1-based) of the PDF where its number is printed (all must agree). `head`: regex that
    must appear in the text before the number (the dish's heading) or None; `tail`: regex for the text that ends right before the
    number (the printed name/price); `suffix`: the exact text printed inside the brackets after the number; `after`: the text printed
    right after the brackets; `second`: (item name, regex of a second value inside `suffix`) for lines that print two values."""
    return dict(pages=tuple(pages), head=head, tail=tail, name=name, cat=cat, serving=serving, suffix=suffix, after=after,
                unstated=unstated, note=note, second=second)


def L(text: str) -> str:
    """A literal piece of printed text as a regex (any run of spaces matches any run of white space)."""
    return re.escape(text).replace(r"\ ", r"\s+")


M = "\\S?"   # the menu's mark glyph after a name (the "dish can be modified" triangle), whatever its code point

# ---------------------------------------------------------------- main menu: (page numbers of the 28-page PDF)
ITEMS = [
    I([6], "CLASSIC NACHOS", L("Lime Crema £13.95"), "Classic Nachos", STA),
    I([6], None, r"Add Guacamole \(GF, VG\) £4\.95", "Add Guacamole (to Classic Nachos)", STA),
    I([6], None, r"Grilled Chicken \(GF\) £5\.00", "Add Grilled Chicken (to Classic Nachos)", STA),
    I([6], None, r"Grilled Steak\* £8\.00", "Add Grilled Steak (to Classic Nachos)", STA),
    I([6], "ONE NIGHT IN BANGKOK", L("Green Onions £15.95"), "One Night in Bangkok Spicy Shrimp", STA),
    I([6], "CHICKEN DIPPERS", L("Dipping Sauces £14.45"), "House-Made Crispy Chicken Dippers", STA, suffix=" + sauces",
      note="Printed '(556 cal + sauces)': the figure excludes the two dipping sauces"),
    I([6], "WINGS", L("Stardust Dry Rub"), "Wings with Stardust Dry Rub", WIN, note="Wings £12.95; the number is beside the sauce choice"),
    I([6], None, r"^House-Made Barbecue", "Wings with House-Made Barbecue", WIN),
    I([6], None, r"^Sweet & Tangy", "Wings with Sweet & Tangy", WIN, note="Same printed value (1215) as Gochujang"),
    I([6], None, r"^Classic Buffalo", "Wings with Classic Buffalo", WIN),
    I([6], None, r"^Gochujang†", "Wings with Gochujang", WIN, note="Marked † contains nuts or seeds; same printed value (1215) as Sweet & Tangy"),
    I([9], "NEW YORK STRIP STEAK", r"Fresh Vegetables\* £33\.95", "New York Strip Steak", ENT),
    I([9], "SMOKEHOUSE BBQ COMBO", r"Coleslaw" + M + r" £24\.95", "Smokehouse BBQ Combo", ENT),
    I([9], None, L("Add a half rack of our famous baby back ribs (GF) £12.50"), "Add a Half Rack of Baby Back Ribs (to Smokehouse BBQ Combo)",
      ENT, unstated=True, note="Same printed value (544) as 'Half Rack of Ribs' under Amplify Your Entrée"),
    I([9], "BARBECUE CHICKEN", r"Coleslaw £22\.95", "Barbecue Chicken", ENT),
    I([9], "MAC, CHICKEN & CHEESE", L("Seasoned Breadcrumbs £17.95"), "Mac, Chicken & Cheese", ENT),
    I([9], "GRILLED SALMON", r"Fresh Vegetables\* £21\.45", "Grilled Salmon", ENT),
    I([9], None, r"^Grilled Chicken £20\.45", "Famous Fajitas with Grilled Chicken", ENT),
    I([9], None, r"^Grilled Steak\* £20\.95", "Famous Fajitas with Grilled Steak", ENT),
    I([9], None, r"^Duo Combo\* £25\.95", "Famous Fajitas Duo Combo", ENT, unstated=True),
    I([9], None, r"^Veggie Fajitas" + M + r" \(V, VG-A\) £17\.95", "Veggie Fajitas", ENT),
    I([9], None, r"Add Queso £3\.95", "Add Queso (to Famous Fajitas)", ENT),
    I([9], "CHICKEN TENDER PLATE", L("House-Made Barbecue Sauce £17.95"), "House-Made Crispy Chicken Tender Plate", ENT),
    I([9], "BABY BACK RIBS", r"Coleslaw £26\.95", "Baby Back Ribs", ENT, unstated=True),
    I([9], None, r"Half Rack of Ribs \(GF\) £12\.50", "Half Rack of Ribs", AMP, unstated=True,
      note="Same printed value (544) as the 'Add a half rack' line under Smokehouse BBQ Combo"),
    I([9], None, r"One Night in Bangkok Spicy Shrimp(?:TM|™) £6\.95", "One Night in Bangkok Spicy Shrimp (add-on)", AMP,
      note="The add-on portion (322) is smaller than the starter (449)"),
    I([9], None, r"Classic Caesar Side Salad" + M + r" \(GF-A\) £5\.95", "Classic Caesar Side Salad", AMP,
      note="Same printed value (182) as 'Side Caesar Salad' under Add-On Sides"),
    I([9], None, r"House Side Salad" + M + r" \(GF-A\) £5\.95", "House Side Salad", AMP,
      note="Same printed value (120) as 'Side House Salad' under Add-On Sides"),
    I([10], r"ORIGINAL LEGENDARY.{0,2} BURGER", r"Toasted Artisan Bun\*" + M + r" £19\.50", "Original Legendary Burger", STE,
      note="Printed under 'Served with seasoned fries'"),
    I([10], "BBQ BACON BURGER", r"Toasted Artisan Bun\*" + M + r" £21\.50", "BBQ Bacon Burger", STE),
    I([10], r"LEGENDARY.{0,2} SMASHED BURGER", r"Toasted Artisan Bun\*" + M + r" £19\.50", "Legendary Smashed Burger", SMA, unstated=True),
    I([10], "THE CLASSIC SMASHED BURGER", r"Toasted Artisan Bun\*" + M + r" £19\.50", "The Classic Smashed Burger", SMA, unstated=True),
    I([10], "SPICY DIABLO SMASHED BURGER", r"Toasted Artisan Bun\*" + M + r" £19\.50", "Spicy Diablo Smashed Burger", SMA, unstated=True),
    I([10], "BBQ PULLED PORK SANDWICH", r"Toasted Artisan Bun" + M + r" £16\.95", "BBQ Pulled Pork Sandwich", SAN),
    I([10], "GRILLED CHICKEN SANDWICH", r"Coleslaw" + M + r" £17\.95", "Grilled Chicken Sandwich", SAN),
    I([10], "MESSI CHICKEN SANDWICH", r"Toasted Artisan Bun £18\.95", "Messi Chicken Sandwich", SAN),
    I([10], None, r"Add a Smashed Patty \(GF\) £2\.75", "Add a Smashed Patty", TUR, unstated=True),
    I([10], None, r"Add Smoked Bacon \(GF\) £2\.25", "Add Smoked Bacon", TUR),
    I([10], None, r"Upgrade to Onion Rings £2\.95", "Upgrade to Onion Rings", TUR,
      note="Printed as given; the menu doesn't say whether it replaces the fries"),
    I([10], None, r"Upgrade to Loaded Cheese & Bacon Fries" + M + r" \(GF, V-A\) £2\.95", "Upgrade to Loaded Cheese & Bacon Fries", TUR,
      note="Same printed value (679) as the Loaded Cheese & Bacon Fries side"),
    I([10], None, L("FRENCH FRY DIPS £1.00 Ranch (GF)"), "Ranch (French fry dip)", DIP, note="Same printed value (198) as Legendary Sauce, Herb Aioli, Spicy Mayo"),
    I([10], None, r"^Honey Mustard \(GF\)", "Honey Mustard (French fry dip)", DIP),
    I([10], None, r"^Legendary Sauce \(GF\)", "Legendary Sauce (French fry dip)", DIP),
    I([10], None, r"^Buffalo \(GF\)", "Buffalo (French fry dip)", DIP),
    I([10], None, r"^Herb Aioli \(GF\)", "Herb Aioli (French fry dip)", DIP),
    I([10], None, r"^Spicy Mayo \(GF\)", "Spicy Mayo (French fry dip)", DIP),
    I([10], None, r"^House-Made Barbecue Sauce \(GF\)", "House-Made Barbecue Sauce (French fry dip)", DIP),
    I([12], "CAESAR SALAD", r"Shaved Parmesan Cheese" + M + r" £12\.95", "Caesar Salad", BOW),
    I([12], "COBB SALAD", r"Crispy Onions" + M + r" £15\.95", "Cobb Salad", BOW),
    I([12], "SOUTHWESTERN BOWL", r"Ranch Dressing £13\.95", "Southwestern Bowl", BOW),
    I([12], None, r"Add Guacamole \(GF\) £4\.95", "Add Guacamole (to Southwestern Bowl)", BOW),
    I([12], None, r"Grilled Chicken \(GF\) £5\.00", "Add Grilled Chicken", PRO, note="Same printed value (168) as the Classic Nachos add-on"),
    I([12], None, r"Grilled Steak £8\.00", "Add Grilled Steak", PRO, note="Same printed value (176) as the Classic Nachos add-on"),
    I([12], None, r"Grilled Salmon \(GF\) £10\.00", "Add Grilled Salmon", PRO),
    I([12], None, r"Seasoned Fries \(GF, VG\) £5\.95", "Seasoned Fries", SID),
    I([12], None, r"Loaded Cheese & Bacon Fries" + M + r" \(GF, V-A\) £7\.95", "Loaded Cheese & Bacon Fries", SID),
    I([12], None, r"Golden Onion Rings £6\.95", "Golden Onion Rings", SID),
    I([12], None, r"Mac & Cheese \(V\) £7\.95", "Mac & Cheese", SID),
    I([12], None, r"Market Vegetables \(GF\) £5\.95", "Market Vegetables", SID),
    I([12], None, r"Mashed Potatoes \(GF\) £5\.95", "Mashed Potatoes", SID),
    I([12], None, r"Side Caesar Salad" + M + r" \(GF-A\) £5\.95", "Side Caesar Salad", SID),
    I([12], None, r"Side House Salad" + M + r" \(GF-A\) £5\.95", "Side House Salad", SID),
    I([14, 28], "HOT FUDGE BROWNIE", r"Cherry" + M + r" £11\.95", "Hot Fudge Brownie", DES),
    I([14, 28], "NEW YORK CHEESECAKE", L("Whipped Cream £10.95"), "New York Cheesecake", DES),
    I([14, 28], "SEASONAL FRUIT COBBLER", L("Caramel Sauce £10.95"), "Seasonal Fruit Cobbler", DES),
    I([14, 28], None, r"ICE CREAM(?: \(GF\))? £7\.95", "Ice Cream", DES),
    I([14, 28], None, r"ESPRESSO £3\.55", "Espresso", HOT),
    I([14, 28], None, r"CAPPUCCINO £4\.65", "Cappuccino", HOT, note="Same printed value (71) as Latte"),
    I([14, 28], None, r"LATTE £4\.65", "Latte", HOT),
    I([14, 28], None, r"AMERICANO £4\.40", "Americano", HOT, note="Same printed value (3) as Espresso"),
    I([14, 28], None, r"ICED COFFEE £4\.65", "Iced Coffee", HOT, suffix=" / 71 cal with milk",
      note="Printed '(3 cal / 71 cal with milk)': this is the figure without milk", second=("Iced Coffee with milk", r" / (\d+) cal with milk")),
    I([14, 28], None, r"HOT CHOCOLATE £4\.40", "Hot Chocolate", HOT),
    I([14, 28], None, r"TEA £4\.40", "Tea with milk", HOT, suffix=" with milk", note="Printed '(24 cal with milk)': no figure is printed without milk"),
    I([14, 27], None, r"Coca-Cola £3\.95 330ml", "Coca-Cola", SOD, serving="330ml"),
    I([14, 27], None, r"Coca-Cola Zero Sugar £5\.25 16oz", "Coca-Cola Zero Sugar", SOD, serving="16oz",
      note="Printed 1.5 cal; the pipeline stores whole calories (2)"),
    I([14, 27], None, r"Diet Coke £5\.25 16oz", "Diet Coke", SOD, serving="16oz", note="Same printed value (2) as Dr Pepper Zero"),
    I([14, 27], None, r"Sprite Zero £5\.25 16oz", "Sprite Zero", SOD, serving="16oz"),
    I([14, 27], None, r"Fanta Orange £5\.25 16oz", "Fanta Orange", SOD, serving="16oz"),
    I([14, 27], None, r"Dr Pepper Zero £5\.25 16oz", "Dr Pepper Zero", SOD, serving="16oz"),
    I([14, 27], None, r"Juice £3\.95 12oz – Orange", "Orange Juice", SOD, serving="12oz"),
    I([14, 27], None, r"^, Apple", "Apple Juice", SOD, serving="12oz"),
    I([14, 27], None, r"^, Cranberry", "Cranberry Juice", SOD, serving="12oz"),
    I([14, 27], None, r"^, Pineapple", "Pineapple Juice", SOD, serving="12oz"),
    I([14, 27], None, r"Still Water £3\.95 330ml", "Still Water", SOD, serving="330ml"),
    I([14, 27], None, r"Sparkling Water £3\.95 330ml", "Sparkling Water", SOD, serving="330ml"),
    I([14, 27], None, r"Red Bull Energy Drink", "Red Bull Energy Drink", SOD, note="No size printed"),
    I([14, 27], None, r"Red Bull Sugarfree", "Red Bull Sugarfree", SOD, note="No size printed"),
    I([14, 27], None, L("Red Bull Special Editions – please ask your server"), "Red Bull Special Editions", SOD,
      note="No size printed; the menu says to ask the server which editions"),
    I([2, 27], "STRAWBERRY BASIL LEMONADE", L("Basil £9.25"), "Strawberry Basil Lemonade", ZER),
    I([2, 27], "MANGO TANGO", L("Orange Juice £9.25"), "Mango Tango", ZER),
    I([2, 27], "MANGO BERRY COOLER", L("Sprite Zero £9.25"), "Mango Berry Cooler", ZER),
    I([2, 27], "CHILLI PINEAPPLE", L("Fever-Tree Elderflower Tonic £9.25"), "Chilli Pineapple", ZER),
    I([2, 27], "CUCUMBER LIME PRESS", L("Fever-Tree Elderflower Tonic £9.25"), "Cucumber Lime Press", ZER),
    I([5, 23], None, L("Corona Cero (Non-Alcoholic)"), "Corona Cero (non-alcoholic)", BEE, serving="330ml", after="(330ml)"),
]

# ---------------------------------------------------------------- kids menu (one page; names get "Kids" so search tells them from the adult dishes)
KIDS_ITEMS = [
    I([1], None, L("Messi’s Golden Chicken Sandwich"), "Kids Messi’s Golden Chicken Sandwich", KEN),
    I([1], None, r"^Messi’s Burger", "Kids Messi’s Burger", KEN, unstated=True),
    I([1], None, r"^Pepperoni Pizza", "Kids Pepperoni Pizza", KEN),
    I([1], None, r"^Cheese Pizza", "Kids Cheese Pizza", KEN),
    I([1], None, r"^Chicken Tenders", "Kids Chicken Tenders", KEN),
    I([1], None, r"^Hot Dog", "Kids Hot Dog", KEN, unstated=True),
    I([1], None, r"^Bacon Cheeseburger", "Kids Bacon Cheeseburger", KEN, unstated=True),
    I([1], None, r"^Mac & Cheese", "Kids Mac & Cheese", KEN),
    I([1], None, r"^Grilled Chicken Breast", "Kids Grilled Chicken Breast", KEN),
    I([1], None, r"^Pasta And Marinara Sauce", "Kids Pasta and Marinara Sauce", KEN),
    I([1], None, r"^Grilled Chicken House Salad", "Kids Grilled Chicken House Salad", KEN),
    I([1], None, r"^Fresh Fruit", "Kids Fresh Fruit", KSI),
    I([1], None, r"^Fries", "Kids Fries", KSI),
    I([1], None, r"^Mashed Potatoes", "Kids Mashed Potatoes", KSI),
    I([1], None, r"^Seasonal Vegetable", "Kids Seasonal Vegetable", KSI),
    I([1], None, r"^Hot Fudge Sundae", "Kids Hot Fudge Sundae", KDE, note="£2.50 extra on the kids menu"),
    I([1], None, r"^£2\.50 Chocolate Milkshake", "Kids Chocolate Milkshake", KDE, note="£1.75 extra on the kids menu; same printed value (349) as Vanilla"),
    I([1], None, r"^£1\.75 Vanilla Milkshake", "Kids Vanilla Milkshake", KDE, note="£1.75 extra on the kids menu; same printed value (349) as Chocolate"),
]

# The gluten-free menu (1/26) is NOT published (its figures for "without ..." and gluten-free-bun versions mostly repeat the main menu's,
# and one disagrees by 341 cal); every one of its 27 calorie values must still be one of these rows so a new guide is noticed.
# (heading regex or None, text ending right before the number, printed number, published item it is compared with)
GF_ROWS = [
    (None, r"Choice of Sauce: Sweet & Tangy", "1215", "Wings with Sweet & Tangy"),
    (None, r"^Classic Buffalo", "1138", "Wings with Classic Buffalo"),
    (None, r"^House-Made Barbecue", "1194", "Wings with House-Made Barbecue"),
    (None, r"^Stardust Dry Rub", "1119", "Wings with Stardust Dry Rub"),
    (r"LEGENDARY.{0,2} SMASHED BURGER", r"Gluten-Free Bun\* £19\.50", "1454", "Legendary Smashed Burger"),
    ("THE CLASSIC SMASHED BURGER", r"Gluten-Free Bun £19\.50", "1339", "The Classic Smashed Burger"),
    ("SPICY DIABLO SMASHED BURGER", r"Gluten-Free Bun £19\.50", "1358", "Spicy Diablo Smashed Burger"),
    (r"ORIGINAL LEGENDARY.{0,2} BURGER", r"Gluten-Free Bun £19\.50", "1314", "Original Legendary Burger"),
    ("BBQ BACON BURGER", r"Gluten-Free Bun £21\.50", "1337", "BBQ Bacon Burger"),
    ("BBQ PULLED PORK SANDWICH", r"Gluten-Free Bun £16\.95", "1111", "BBQ Pulled Pork Sandwich"),
    ("GRILLED CHICKEN SANDWICH", r"Coleslaw £17\.95", "954", "Grilled Chicken Sandwich"),
    ("BABY BACK RIBS", r"Coleslaw £26\.95", "1655", "Baby Back Ribs"),
    ("NEW YORK STRIP STEAK", r"Fresh Vegetables\* £33\.95", "1124", "New York Strip Steak"),
    ("GRILLED SALMON", r"Fresh Vegetables £21\.45", "768", "Grilled Salmon"),
    ("SMOKEHOUSE BBQ COMBO", r"Coleslaw £24\.95", "1123", "Smokehouse BBQ Combo"),
    (None, r"Add a half rack of our famous baby back ribs £12\.50", "544", "Half Rack of Ribs"),
    ("BARBECUE CHICKEN", r"Coleslaw £22\.95", "1184", "Barbecue Chicken"),
    (None, r"Add Grilled Chicken £5\.00", "168", "Add Grilled Chicken"),
    (None, r"Add Grilled Salmon £10\.00", "450", "Add Grilled Salmon"),
    ("CAESAR SALAD", r"Shaved Parmesan Cheese £12\.95", "398", "Caesar Salad"),
    ("COBB SALAD", r"Charred Corn £15\.95", "419", "Cobb Salad"),
    (None, r"KID BACON CHEESEBURGER Gluten-Free Bun £12\.95", "735", "Kids Bacon Cheeseburger"),
    (None, r"KID MESSI BURGER Gluten-Free Bun £12\.95", "704", "Kids Messi’s Burger"),
    (None, r"KID GRILLED CHICKEN HOUSE SALAD £12\.95", "298", "Kids Grilled Chicken House Salad"),
    (None, r"KID GRILLED CHICKEN BREAST £12\.95", "200", "Kids Grilled Chicken Breast"),
    (None, r"ICE CREAM Vanilla Bean or Rich Chocolate £7\.95", "529", "Ice Cream"),
    ("HOT FUDGE BROWNIE", r"Cherry £11\.95", "2009", "Hot Fudge Brownie"),
]

TOKEN = re.compile(r"\((\d+(?:\.\d+)?) cal([^)]*)\)")


def norm(s: str) -> str:
    """Collapse white space; the kids PDF separates its entries with a stray control character (\\x03) and some text has zero-width spaces."""
    return " ".join(re.sub(r"[\x00-\x08\x0e-\x1f\x7f​]", " ", s).split())


def read_tokens(pdf: Path) -> list[dict]:
    """Every '(N cal...)' in the PDF's text layer with the text since the previous one (this page only) and the text right after it."""
    out = subprocess.run(["pdftotext", "-raw", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = out.split("\f")
    tokens = []
    for pno, text in enumerate(pages, 1):
        prev = 0
        for m in TOKEN.finditer(text):
            seg = re.sub(r"^\|\s*", "", norm(text[prev:m.start()]))
            tokens.append(dict(page=pno, value=m.group(1), suffix=m.group(2), seg=seg, after=norm(text[m.end():m.end() + 40])))
            prev = m.end()
    return tokens


def claims(item: dict, t: dict) -> bool:
    return (t["page"] in item["pages"] and re.search(item["tail"] + r"$", t["seg"]) is not None
            and (item["head"] is None or re.search(item["head"], t["seg"]) is not None)
            and t["suffix"] == item["suffix"] and t["after"].startswith(item["after"]))


def build(label: str, pdf: Path, items: list[dict], expected: int) -> list[dict]:
    tokens = read_tokens(pdf)
    found: dict[int, dict[int, dict]] = {}
    for t in tokens:
        hits = [i for i, it in enumerate(items) if claims(it, t)]
        where = f"{label} page {t['page']}: '{t['seg'][-80:]}' ({t['value']} cal{t['suffix']})"
        if not hits:
            raise SystemExit(f"{where} is not claimed by any entry: the menu changed (new dish, new wording or moved text). Update the tables.")
        if len(hits) > 1:
            raise SystemExit(f"{where} is claimed by several entries: {[items[i]['name'] for i in hits]}")
        if t["page"] in found.setdefault(hits[0], {}):
            raise SystemExit(f"{where}: {items[hits[0]]['name']} is printed twice on the same page")
        found[hits[0]][t["page"]] = t
    out = []
    for i, it in enumerate(items):
        seen = found.get(i, {})
        if set(seen) != set(it["pages"]):
            raise SystemExit(f"{label}: {it['name']!r} expected on pages {sorted(it['pages'])} but found on {sorted(seen)}")
        first = seen[it["pages"][0]]
        for p, t in seen.items():
            if (t["value"], t["suffix"]) != (first["value"], first["suffix"]):
                raise SystemExit(f"{label}: {it['name']!r} prints {first['value']} on page {it['pages'][0]} but {t['value']} on page {p}")
        text = first["seg"]
        m = re.search(it["head"], text) if it["head"] else None
        desc = text[m.start():] if m else (re.search(it["tail"] + r"$", text).group(0))
        tags = []
        marks = {w for g in MARKS.findall(desc) for w in g.split(", ")}
        if marks & {"V", "VG"}:
            tags.append("vegetarian")
        if PORK.search(desc):
            tags.append("contains_pork")
        if BEEF.search(desc):
            tags.append("contains_beef")
        printed = f"{label} p.{'/'.join(str(p) for p in it['pages'])}: printed '{first['value']} cal{first['suffix']}' after '{it['name'] if not it['head'] else desc[:60]}'"
        notes = "; ".join(x for x in (printed, it["note"], "meat type not stated" if it["unstated"] else "") if x)
        out.append(dict(name=it["name"], category=it["cat"], serving=it["serving"], calories=first["value"], tags="|".join(tags),
                        rankable=False, notes=notes, unstated=it["unstated"]))
        if it["second"]:
            name2, pattern = it["second"]
            m2 = re.fullmatch(pattern, first["suffix"])
            if not m2:
                raise SystemExit(f"{label}: {it['name']!r}: second value not found in {first['suffix']!r}")
            out.append(dict(name=name2, category=it["cat"], serving="", calories=m2.group(1), tags="|".join(tags), rankable=False,
                            notes=f"{printed}; second value", unstated=it["unstated"]))
    if len(out) != expected:
        raise SystemExit(f"{label}: built {len(out)} items, expected {expected}: the menu changed, re-check the table")
    return out


def check_gf(pdf: Path, published: list[dict]) -> list[str]:
    """Cross-check the gluten-free menu: every calorie value must be a known row; report where it differs from the published item."""
    by_name = {i["name"]: i for i in published}
    tokens = read_tokens(pdf)
    if len(tokens) != len(GF_ROWS):
        raise SystemExit(f"gf: {len(tokens)} calorie values but GF_ROWS has {len(GF_ROWS)}: the gluten-free menu changed")
    lines, used = [], set()
    for t in tokens:
        hits = [k for k, (head, tail, value, _) in enumerate(GF_ROWS)
                if re.search(tail + r"$", t["seg"]) and (head is None or re.search(head, t["seg"])) and t["suffix"] == ""]
        if len(hits) != 1 or hits[0] in used:
            raise SystemExit(f"gf: '{t['seg'][-80:]}' ({t['value']} cal) is not claimed exactly once: the gluten-free menu changed")
        used.add(hits[0])
        head, tail, value, name = GF_ROWS[hits[0]]
        if t["value"] != value:
            raise SystemExit(f"gf: {name}: printed {t['value']}, GF_ROWS says {value}")
        if name not in by_name:
            raise SystemExit(f"gf: GF_ROWS compares with {name!r}, which is not a published item")
        if by_name[name]["calories"] != value:
            lines.append(f"gluten-free menu differs: {name} {value} cal there, {by_name[name]['calories']} cal in the published menu")
    return lines


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url.replace(" ", "%20"), headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())
    time.sleep(1.2)  # one request per second at most


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--menu", type=Path, help="the main menu PDF (URLS['menu'])")
    ap.add_argument("--kids", type=Path, help="the Messi kids menu PDF (URLS['kids'])")
    ap.add_argument("--gf", type=Path, help="the gluten-free menu PDF (URLS['gf']), only cross-checked")
    ap.add_argument("--allergen-pdf", type=Path, help="the allergen sheet PDF (URLS['allergen']), only to print its SHA-256")
    ap.add_argument("--fetch", type=Path, help="download the four PDFs into this folder first and use them")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for key, name in (("menu", "menu.pdf"), ("kids", "kids.pdf"), ("gf", "gf.pdf"), ("allergen", "allergen.pdf")):
            fetch(URLS[key], args.fetch / name)
        args.menu, args.kids, args.gf, args.allergen_pdf = (args.fetch / n for n in ("menu.pdf", "kids.pdf", "gf.pdf", "allergen.pdf"))
    if not (args.menu and args.kids):
        ap.error("give --menu and --kids (or --fetch DIR)")
    for label, p in (("menu", args.menu), ("kids", args.kids), ("gf", args.gf), ("allergen", args.allergen_pdf)):
        if p:
            print(f"{label} PDF sha256 {sha256_file(p)}  {p}")
    items = build("menu", args.menu, ITEMS, EXPECTED_MENU_ITEMS) + build("kids", args.kids, KIDS_ITEMS, EXPECTED_KIDS_ITEMS)
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    report = check_gf(args.gf, items) if args.gf else []
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": URLS["allergen"], "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Hard Rock Cafe", cuisine="Burgers", source_title=SOURCE_TITLE, source_url=SITE,
                             checked_on=args.checked_on, aliases=["hard rock cafe", "hard rock", "hard rock cafe london", "hrc"],
                             items=[{k: v for k, v in i.items() if k != "unstated"} for i in items], out=args.out, note=NOTE,
                             allergen_guide=guide, nutrition_level="calories")
    counts: dict[str, int] = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("meat type not stated (" + str(sum(1 for i in items if i["unstated"])) + "): " + ", ".join(i["name"] for i in items if i["unstated"]))
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
