#!/usr/bin/env python3
"""Build data/source/notcutts/ from Notcutts' official restaurant menus with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/notcutts.py PDF_DIR --checked-on 2026-11-17 [--out DIR]

PDF_DIR holds the five files the chain's own page https://www.notcutts.co.uk/restaurants/sample-menu links (robots.txt of
notcutts.co.uk disallows only shop/checkout/query paths: /media/ and /restaurants/ are allowed; all five are served as application/pdf).
Autumn/Winter 2026 set, read 2026-11-17 (the page itself says "Introducing our new seasonal menu"):
    AW26-Breakfast-Menu-for-Sample-Menu-Webpage.pdf   1 page,  PDF created 2026-10-13, Last-Modified 2026-10-14
    AW26-Lunch-Menu-for-Sample-Menu-Webpage.pdf       3 pages, PDF created 2026-10-13, Last-Modified 2026-10-14
    AW26-Childrens-Menu-for-Sample-Menu-Webpage.pdf   1 page,  PDF created 2026-10-07, Last-Modified 2026-10-14
    AW26-Drinks-Menu-for-Sample-Menu-Webpage.pdf      1 page,  PDF created 2026-10-13, Last-Modified 2026-10-14
        all under https://notcutts.co.uk/media/wysiwyg/restaurant-menu/
    AW26-festive-2 and-3-course-web-menu-with-booking.pdf   1 page, PDF created 2026-10-13, Last-Modified 2026-10-13
        under https://notcutts.co.uk/media/wysiwyg/cms-page/our-restaurants/ ("Festive Feast, served from 18th November")
Needs `pdftotext`, `pdftocairo` and `pdfinfo` (poppler); see notcutts_pdf.py.
(The Spring/Summer 2026 set this script read before, SS26-*-Menu.pdf, is no longer linked.)
The page calls them a "Sample menu" ("Regional variations may occur. Our menu may vary by day and by restaurant"), and the menus
print "Adults need around 2000 kcal a day". The page itself shows three dishes with calories (Pie of the day "From 1008kcal",
Cumberland sausages & mash 1065, Crispy chicken & bacon salad 648): they agree with the PDFs.

The menus print calories ONLY, as one figure after a dish's name ("WELSH RAREBIT AND POACHED EGG 884 kcal"): no kJ, protein, carbs,
fat, salt, sugar or weight, so protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"; every item is then not
rankable). Calories are copied from the PDF text as printed. Only item NAMES, categories, serving words and pork tags are typed in
ENTRIES below, and the script stops if the PDFs differ from that table: a figure that matches no entry or an entry that matches
too few/many figures (a new, renamed, moved or removed dish), a repeated figure whose repeats disagree (unless that contradiction
was read and is listed in CONTRADICTED, which holds the dish back), a "calories vary" line count that changed.

How the printed lines are read:
- A dish is bound to the figure by the text printed just before the figure (the dish's printed name), so a wrapped name
  ("BRECKLAND ORCHARD ZERO SUGAR / STRAWBERRY & RHUBARB 8 kcal") is read whole. Where two entries both match the words before a
  figure, the longer printed name wins ("CHEESY CHIPS" over "CHIPS"), and the count of figures each entry must claim is checked.
- "106/152 kcal" under the Drinks menu's "small / regular" columns: the first figure is the small drink and the second the regular
  one (two items). "DRESSED SALAD OR VEGETABLE PORTION 67/45 kcal": the first is the salad (67 kcal is also printed for the
  dressed salad beside the sandwiches) and the second the vegetable portion (two items).
- A choice written inside one dish ("BACON OR SAUSAGE CIABATTA: 3 rashers of back bacon (832 kcal), 2 Cumberland sausages (1031
  kcal), or 2 vegan sausages (579 kcal)"; the Pancake Stack's two toppings) is one item per option with its own printed figure.
  "Add smoked salmon (82 kcal)", "Add halloumi (320 kcal)", "Add mustard glazed gammon 221 kcal" and the Vegan platter's "Go large
  ... (536 kcal)" are the add-ons' own calories, so they are items of their own, never added to the dish. The soup's "butter (91
  kcal) or vegan spread (45 kcal)" are the spreads' own figures.
- No serving is stated for any dish (only the Drinks menu's small/regular columns), so `serving` is blank apart from those.
- Not listed, with the reason (printed on the run): lines the menu prints with "from" (the platters' "Go large ... (from 584
  kcal)", "Add fried egg (from 162 kcal)", "Pie of the day from 1008 kcal", "Pip juices from 67 kcal", "Milkshakes from 92 kcal",
  "2 scoops of ice cream from 257 kcal", the festive soup "From 393 kcal": a lowest figure, not a figure for any serving); "calories
  vary" lines (Homemade soup of the day, Choice of fruit); dishes with no figure at all (Speciality sandwich of the day, Decaf tea and
  coffee, the alcoholic drinks Jack Rabbit wines, Vitelli Prosecco, BrewDog Punk IPA, Old Mout cider, Adnams Ghostship, the 2-for-£18.95
  breakfast offer, the meal deals as sets); figures that repeat a dish listed elsewhere (the Cold meal deal's Cheese/Ham/Tuna
  sandwiches, Mini Cheddars, Pom Bears and brownie repeat the Snacks and Sandwiches lines; "Add 2 slices of bread and butter" and "Add
  a portion of chips" repeat the Side dishes; the "(270 KCAL)" chips and "(67 KCAL)" salad under the sandwich headings repeat the Side
  dishes): each repeat is checked to equal the listed figure, and the script stops if one disagrees (that is the "contradicted
  figure" rule: hold both rows back in holdback.csv after reading, via CONTRADICTED); and the "Adults need around 2000 kcal a day"
  footers.
- Tags: vegetarian when the dish carries the menu's Vegetarian or Vegan mark ("Vegetarian option available" / "Vegan option available"
  are not marks of the dish). The AW26 Breakfast, Lunch, Children's and Drinks menus draw the marks as coloured icons (no text):
  notcutts_pdf.marks() reads every icon and its colour from the page's own key and finds the dish name and figure printed beside it;
  each entry's `veg` below is what was read, and the run stops if the icons and the table disagree or an icon belongs to no entry.
  The Festive Feast prints its marks as icon-font glyphs that read as digits after the name ("CHRISTMAS PUDDING 02"); its key is
  read by notcutts_pdf.glyph_key(). contains_pork when the dish's printed name or description says so (bacon, sausage, gammon, ham,
  pig in blanket). Nothing else is inferred.
- The AW26 Festive Feast is included as limited time (served from 18 November, bookings to 24 December).

Allergens: none. Notcutts publishes no allergen guide or table (the page says to ask in the restaurants; the menus only warn that
their kitchens handle allergens), so no allergens.csv and no allergen_guide.csv are written.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import notcutts_pdf as reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "notcutts"
SOURCE_URL = "https://www.notcutts.co.uk/restaurants/sample-menu"
SOURCE_TITLE = ("Notcutts restaurant sample menus with calories: AW26 Breakfast, Lunch, Children's and Drinks and AW26 Festive Feast "
                "(PDFs created 7-13 October 2026)")
ALIASES = ["notcutts", "notcutts garden centre", "notcutts restaurant", "notcutts garden centre restaurant"]
NOTE = ("Notcutts prints calories only, on a menu it calls a sample: calories vary by restaurant. Sandwich sides are printed separately "
        "(chips 270 kcal, dressed salad 67 kcal) and the menu doesn't say whether a sandwich's figure includes its side. Dishes printed "
        "'from', 'calories vary' or with no figure (alcohol, soup of the day) are not listed. Festive Feast is limited time.")

FILES = {
    "breakfast": ("AW26-Breakfast-Menu-for-Sample-Menu-Webpage.pdf", [None]),
    "lunch": ("AW26-Lunch-Menu-for-Sample-Menu-Webpage.pdf", [None]),
    "children": ("AW26-Childrens-Menu-for-Sample-Menu-Webpage.pdf", [reader.LEFT, reader.RIGHT]),
    "drinks": ("AW26-Drinks-Menu-for-Sample-Menu-Webpage.pdf", [reader.LEFT, reader.RIGHT]),
    "festive": ("AW26-festive-2 and-3-course-web-menu-with-booking.pdf", [reader.LEFT, reader.RIGHT]),
}
# "calories vary" lines the menus print (no figure, so no item): checked on every run.
EXPECTED_VARY = {"breakfast": 0, "lunch": 1, "children": 1, "drinks": 0, "festive": 0}
# How each menu prints its dietary marks: drawn icons (read by reader.marks, with the column gutter of two-column pages) or icon-font
# glyphs that read as digits after the dish name (reader.glyph_key).
MARKS = {"breakfast": ("icons", None), "lunch": ("icons", None), "children": ("icons", reader.GUTTER),
         "drinks": ("icons", reader.GUTTER), "festive": ("glyphs", None)}
# Vegetarian/Vegan icons that sit beside no calorie figure (so they belong to no entry), each read on the page.
ICONS_WITHOUT_FIGURE = {
    ("lunch", "SERVED WITH A DRESSED SIDE SALAD"): "the jacket potatoes' side salad heading (no figure printed)",
    ("children", "Choice of fruit"): "printed 'calories vary' (not listed)",
}
# Repeats that disagree, read in the PDF: the dish is held back (holdback.csv), never corrected and never chosen between.
CONTRADICTED = {
    "Jelly Pot": ("the children's menu prints 'Jelly pot 8 kcal' under Snacks but 'jelly pot 39 kcal' in the Cold meal deal's dessert "
                  "choice: the menu contradicts itself, so the jelly pot is not published"),
}

BRK = "Breakfast"
HOT, COLD, JAC, SOUP, MAIN, SAL, SIDE = ("Hot sandwiches", "Cold sandwiches", "Jacket potatoes", "Soup", "Main courses",
                                         "Salads", "Side dishes")
CBRK, CHOT, CSAND, CSNK, CCOLD, CDES = ("Children’s breakfast", "Children’s hot meal deal", "Children’s sandwiches", "Children’s snacks",
                                       "Children’s cold meal deal", "Children’s desserts")
HDR, SEAS, CLD = "Hot drinks", "Seasonal drinks", "Cold drinks"
FEST = "Festive Feast"
PORK, BEEF = "contains_pork", "contains_beef"


def item(menu, anchor, name, cat, tags="", note="", count=1, serving="", limited=False, veg=False):
    return dict(kind="item", menu=menu, anchor=anchor, specs=[(name, serving)], cat=cat, tags=tags, note=note, count=count, limited=limited,
                veg=veg)


def pair(menu, anchor, specs, cat, tags="", note="", limited=False, veg=False):
    """One printed "a/b" figure = two items (name, serving), in the order the printed columns/words give."""
    return dict(kind="pair", menu=menu, anchor=anchor, specs=specs, cat=cat, tags=tags, note=note, count=1, limited=limited, veg=veg)


def skip(menu, anchor, reason, count=1, same_as=None):
    """A figure that is deliberately not an item. `same_as` = the published name whose figure it repeats (must be equal)."""
    return dict(kind="skip", menu=menu, anchor=anchor, reason=reason, count=count, same_as=same_as, veg=None)


FOOTER = "Adults need around"
FROM = "printed 'from': a lowest figure, no serving"
V = True  # the dish carries the menu's Vegetarian or Vegan mark (checked against the icons on every run)
ENTRIES = [
    # ---- Breakfast (AW26-Breakfast-Menu-for-Sample-Menu-Webpage.pdf)
    item("breakfast", "GARDENER’S BREAKFAST PLATTER", "Gardener’s Breakfast Platter", BRK, PORK, "Free-range eggs, bacon, Cumberland sausage, ..."),
    skip("breakfast", "Go large - add extra sausage, bacon and egg (from", "the Gardener's platter's 'Go large' is " + FROM),
    item("breakfast", "VEGETARIAN BREAKFAST PLATTER", "Vegetarian Breakfast Platter", BRK, veg=V),
    skip("breakfast", "Go large - add extra sausage, mushrooms and egg (from", "the Vegetarian platter's 'Go large' is " + FROM),
    item("breakfast", "VEGAN BREAKFAST PLATTER", "Vegan Breakfast Platter", BRK, veg=V),
    item("breakfast", "Go large - add extra sausage, mushrooms and hash browns", "Go large: extra sausage, mushrooms and hash browns (Vegan Breakfast Platter)",
         BRK, note="Printed under the Vegan Breakfast Platter 'Go large - add extra sausage, mushrooms and hash browns (536 kcal) for £3.50': "
                   "the extras' own calories; no mark is printed beside it"),
    item("breakfast", "WELSH RAREBIT AND POACHED EGG", "Welsh Rarebit and Poached Egg", BRK, PORK, "With smoked streaky bacon"),
    item("breakfast", "EGGS ROYALE", "Eggs Royale", BRK),
    item("breakfast", "EGGS BENEDICT", "Eggs Benedict", BRK, PORK, "Mustard-glazed gammon"),
    item("breakfast", "EGGS FLORENTINE", "Eggs Florentine", BRK, veg=V),
    item("breakfast", "MUSHROOMS ON SOURDOUGH", "Mushrooms on Sourdough", BRK, veg=V),
    item("breakfast", "SCRAMBLED EGGS ON SOURDOUGH", "Scrambled Eggs on Sourdough", BRK, veg=V,
         note="860 kcal printed as is (the menu's Mushrooms on Sourdough prints 613, the children's scrambled eggs on toast 540)"),
    item("breakfast", "Add smoked salmon", "Add smoked salmon (to Scrambled Eggs on Sourdough)", BRK,
         note="Printed 'Add smoked salmon (82 kcal) for £1.95': the salmon's own calories"),
    item("breakfast", "3 rashers of back bacon", "Bacon or Sausage Ciabatta with 3 rashers of back bacon", BRK, PORK),
    item("breakfast", "2 Cumberland sausages", "Bacon or Sausage Ciabatta with 2 Cumberland sausages", BRK, PORK),
    item("breakfast", "or 2 vegan sausages", "Bacon or Sausage Ciabatta with 2 vegan sausages", BRK, veg=V),
    skip("breakfast", "Add fried egg (from", "'Add fried egg' is " + FROM),
    item("breakfast", "natural yoghurt topped with forest fruits, fresh blueberries and honey",
         "Pancake Stack with natural yoghurt, forest fruits, blueberries and honey", BRK, veg=V),
    item("breakfast", "streaky bacon, sour cream, maple syrup and cinnamon", "Pancake Stack with streaky bacon, sour cream, maple syrup and cinnamon", BRK, PORK),
    skip("breakfast", FOOTER, "footer 'Adults need around 2000 kcal a day'"),

    # ---- Lunch (AW26-Lunch-Menu-for-Sample-Menu-Webpage.pdf)
    skip("lunch", "SERVED WITH CHIPS", "sandwich heading repeats the Chips figure", count=2, same_as="Chips"),
    skip("lunch", "OR DRESSED SALAD", "sandwich heading repeats the Dressed Salad figure", count=2, same_as="Dressed Salad"),
    item("lunch", "FLAT MUSHROOM, BRIE AND STOKES CHILLI JAM TOASTED CIABATTA", "Flat Mushroom, Brie and Stokes Chilli Jam Toasted Ciabatta", HOT, veg=V),
    item("lunch", "SAUSAGE AND CARAMELISED ONION CHUTNEY TOASTED CIABATTA", "Sausage and Caramelised Onion Chutney Toasted Ciabatta", HOT, PORK,
         "Marked 'Vegan option available' only"),
    item("lunch", "TUNA MELT TOASTED CIABATTA", "Tuna Melt Toasted Ciabatta", HOT),
    item("lunch", "VEGAN MEATBALL MARINARA TOASTED CIABATTA", "Vegan Meatball Marinara Toasted Ciabatta", HOT, veg=V,
         note="Beyond Meat meatballs in a tomato and herb sauce with spinach and vegan smoky cheese"),
    item("lunch", "SMOKED SALMON, CREAM CHEESE AND CUCUMBER", "Smoked Salmon, Cream Cheese and Cucumber Sandwich", COLD),
    item("lunch", "EGG MAYONNAISE AND BABY SPINACH", "Egg Mayonnaise and Baby Spinach Sandwich", COLD, veg=V),
    item("lunch", "TUNA MAYONNAISE WITH CUCUMBER", "Tuna Mayonnaise with Cucumber Sandwich", COLD),
    item("lunch", "CHEDDAR WITH APPLE AND SPRING ONION COLESLAW", "Cheddar with Apple and Spring Onion Coleslaw Sandwich", COLD, veg=V),
    item("lunch", "HAM, LETTUCE AND TOMATO", "Ham, Lettuce and Tomato Sandwich", COLD, PORK, "Mustard-glazed gammon"),
    item("lunch", "Choose from butter", "Butter (served with the soup’s sourdough roll)", SOUP,
         note="Printed 'Choose from butter (91 kcal) or vegan spread (45 kcal)'; the soup itself prints 'Calories vary'"),
    item("lunch", "or vegan spread", "Vegan spread (served with the soup’s sourdough roll)", SOUP),
    item("lunch", "CHEESY MUSHROOM AND SPRING ONION", "Cheesy Mushroom and Spring Onion Jacket Potato", JAC, veg=V),
    item("lunch", "TUNA MAYONNAISE", "Tuna Mayonnaise Jacket Potato", JAC),
    item("lunch", "APPLE AND SPRING ONION COLESLAW", "Apple and Spring Onion Coleslaw Jacket Potato", JAC, veg=V),
    item("lunch", "CHEDDAR AND BEANS", "Cheddar and Beans Jacket Potato", JAC, veg=V),
    item("lunch", "MIXED BEAN CHILLI", "Mixed Bean Chilli Jacket Potato", JAC, veg=V),
    item("lunch", "ORIENTAL RICE NOODLE SALAD", "Oriental Rice Noodle Salad", SAL, veg=V),
    item("lunch", "Add halloumi", "Add halloumi (to Oriental Rice Noodle Salad)", SAL, note="Printed 'Add halloumi (320 kcal) for £3.25'; no mark printed"),
    item("lunch", "CRISPY CHICKEN AND BACON SALAD", "Crispy Chicken and Bacon Salad", SAL, PORK, "The website page also prints 648 kcal"),
    item("lunch", "TUNA AND EGG SALAD", "Tuna and Egg Salad", SAL),
    skip("lunch", "Add a portion of chips", "'Add a portion of chips' repeats the Side dishes line", same_as="Chips"),
    item("lunch", "CUMBERLAND SAUSAGES AND MASH", "Cumberland Sausages and Mash", MAIN, PORK,
         "Two chunky butcher's sausages; marked 'Vegetarian option available' and 'Vegan option available' only; the website page also prints 1065 kcal"),
    skip("lunch", "PIE OF THE DAY from", "'Pie of the day' is " + FROM),
    item("lunch", "FISH AND CHIPS", "Fish and Chips", MAIN),
    skip("lunch", "Add 2 slices of bread and butter", "'Add 2 slices of bread and butter' repeats the Side dishes line", same_as="Bread and Butter, 2 slices"),
    item("lunch", "CHIPS", "Chips", SIDE),
    item("lunch", "CHEESY CHIPS", "Cheesy Chips", SIDE),
    item("lunch", "CRISPY HOMEMADE POTATO WEDGES", "Crispy Homemade Potato Wedges", SIDE),
    pair("lunch", "DRESSED SALAD OR VEGETABLE PORTION", [("Dressed Salad", ""), ("Vegetable Portion", "")], SIDE, veg=V,
         note="Printed '67/45 kcal': first = dressed salad, second = vegetable portion, in the printed order of the words"),
    item("lunch", "BREAD AND BUTTER - 2 SLICES", "Bread and Butter, 2 slices", SIDE, veg=V),
    item("lunch", "BREAD AND FLORA SPREAD - 2 SLICES", "Bread and Flora Spread, 2 slices", SIDE, veg=V),
    item("lunch", "GARLIC BREAD", "Garlic Bread", SIDE, veg=V),
    item("lunch", "HOMEMADE ONION RINGS", "Homemade Onion Rings", SIDE),
    item("lunch", "BREADED CHICKEN STRIPS", "Breaded Chicken Strips", SIDE),
    item("lunch", "PAN FRIED HALLOUMI", "Pan Fried Halloumi", SIDE, veg=V),
    skip("lunch", FOOTER, "footer 'Adults need around 2000 kcal a day' (printed on each of the 3 pages)", count=3),

    # ---- Children's menu (AW26-Childrens-Menu-for-Sample-Menu-Webpage.pdf), left column then right column
    item("children", "English breakfast", "English Breakfast", CBRK, PORK, "Sausage, fried egg, hash brown and baked beans"),
    item("children", "Banana, yoghurt and honey pancakes", "Banana, Yoghurt and Honey Pancakes", CBRK, veg=V),
    item("children", "Baked beans on toast", "Baked Beans on Toast", CBRK, veg=V),
    item("children", "Scrambled eggs on toast", "Scrambled Eggs on Toast", CBRK, veg=V),
    item("children", "Cheese on toast soldiers", "Cheese on Toast Soldiers", CBRK, veg=V),
    item("children", "Sausages and mash with peas", "Sausages and Mash with Peas", CHOT, PORK, "Marked 'Vegetarian option available' only"),
    item("children", "Breaded chicken strips with chips and beans", "Breaded Chicken Strips with Chips and Beans", CHOT),
    item("children", "Fish goujons with chips and peas", "Fish Goujons with Chips and Peas", CHOT),
    item("children", "Tomato and sausage rigatoni pasta", "Tomato and Sausage Rigatoni Pasta", CHOT, PORK),
    item("children", "Jacket potato with cheese and beans", "Jacket Potato with Cheese and Beans", CHOT, veg=V),
    item("children", "Cheese sandwich", "Cheese Sandwich", CSAND, veg=V),
    item("children", "Ham sandwich", "Ham Sandwich", CSAND, PORK),
    item("children", "Tuna mayonnaise sandwich", "Tuna Mayonnaise Sandwich", CSAND),
    item("children", "Pom Bears", "Pom Bears", CSNK, count=2, veg=V, note="Printed in Snacks and in the Cold meal deal with the same figure"),
    item("children", "Mini Cheddars", "Mini Cheddars", CSNK, count=2, note="Printed in Snacks and in the Cold meal deal with the same figure"),
    item("children", "Jelly pot", "Jelly Pot", CSNK),
    skip("children", "Dessert (jelly pot", "Cold meal deal's 'jelly pot' repeats the Snacks line", same_as="Jelly Pot"),
    item("children", "Brownie", "Brownie", CSNK, veg=V, note="Printed in Snacks and in the Cold meal deal with the same figure"),
    skip("children", "or brownie", "Cold meal deal's 'brownie' repeats the Snacks line", same_as="Brownie"),
    item("children", "Pip rainbow lolly", "Pip Rainbow Lolly", CSNK, veg=V),
    skip("children", "Sandwich or salad (Cheese", "Cold meal deal's Cheese repeats the Cheese Sandwich", same_as="Cheese Sandwich"),
    skip("children", "kcal, Ham", "Cold meal deal's Ham repeats the Ham Sandwich", same_as="Ham Sandwich"),
    skip("children", "kcal, Tuna", "Cold meal deal's Tuna repeats the Tuna Mayonnaise Sandwich", same_as="Tuna Mayonnaise Sandwich"),
    item("children", "kcal, Salad", "Salad (cold meal deal)", CCOLD, note="Printed only in the Cold meal deal's 'Sandwich or salad' choice"),
    skip("children", "Pip juices from", FROM),
    skip("children", "Milkshakes from", FROM),
    item("children", "Brownie and ice cream", "Brownie and Ice Cream", CDES, veg=V),
    item("children", "Banana and chocolate pancakes", "Banana and Chocolate Pancakes", CDES, veg=V),
    skip("children", "2 scoops of ice cream from", FROM),

    # ---- Drinks (AW26-Drinks-Menu-for-Sample-Menu-Webpage.pdf), left column (hot, seasonal) then right column (cold)
    item("drinks", "FLAT WHITE", "Flat White", HDR, note="One figure and one price (under the 'small' column)"),
    pair("drinks", "LATTE", [("Latte (small)", "Small"), ("Latte (regular)", "Regular")], HDR, note="Printed '106/152 kcal' under small / regular"),
    pair("drinks", "CAPPUCCINO", [("Cappuccino (small)", "Small"), ("Cappuccino (regular)", "Regular")], HDR, note="Printed '112/154 kcal' under small / regular"),
    pair("drinks", "AMERICANO", [("Americano (small)", "Small"), ("Americano (regular)", "Regular")], HDR, note="Printed '28/28 kcal': the same figure for both sizes"),
    pair("drinks", "MOCHA", [("Mocha (small)", "Small"), ("Mocha (regular)", "Regular")], HDR, note="Printed '167/213 kcal' under small / regular"),
    item("drinks", "ESPRESSO", "Espresso", HDR, note="Printed '0 kcal' beside a 'double' price"),
    item("drinks", "SYRUP SHOT", "Syrup Shot (caramel, hazelnut or vanilla)", HDR),
    item("drinks", "HOT CHOCOLATE", "Hot Chocolate", HDR),
    item("drinks", "LUXURY HOT CHOCOLATE", "Luxury Hot Chocolate", HDR),
    item("drinks", "TEA", "Tea", HDR),
    item("drinks", "SPECIALITY TEAS", "Speciality Teas", HDR, note="Printed '0 kcal'"),
    item("drinks", "CHAI LATTE", "Chai Latte", SEAS),
    item("drinks", "GINGERBREAD LATTE", "Gingerbread Latte", SEAS),
    item("drinks", "HAZELNUT HOT CHOCOLATE", "Hazelnut Hot Chocolate", SEAS, note="With cream and marshmallows"),
    item("drinks", "ICED LATTE", "Iced Latte", SEAS),
    item("drinks", "milkshakes: CHOCOLATE", "Chocolate Milkshake", SEAS, veg=V, note="Under 'Our homemade cream topped milkshakes'"),
    item("drinks", "STRAWBERRY", "Strawberry Milkshake", SEAS, veg=V),
    item("drinks", "VANILLA", "Vanilla Milkshake", SEAS, veg=V),
    item("drinks", "LUSCOMBE ELDERFLOWER BUBBLY", "Luscombe Elderflower Bubbly", CLD),
    item("drinks", "LUSCOMBE SICILIAN LEMONADE", "Luscombe Sicilian Lemonade", CLD),
    item("drinks", "BRECKLAND ORCHARD PLUM & CHERRY", "Breckland Orchard Plum & Cherry", CLD),
    item("drinks", "BRECKLAND ORCHARD ZERO SUGAR STRAWBERRY & RHUBARB", "Breckland Orchard Zero Sugar Strawberry & Rhubarb", CLD),
    item("drinks", "FENTIMANS GINGER BEER", "Fentimans Ginger Beer", CLD),
    item("drinks", "FRANKLIN & SONS DANDELION & BURDOCK", "Franklin & Sons Dandelion & Burdock", CLD),
    item("drinks", "FRANKLIN & SONS RHUBARB LEMONADE", "Franklin & Sons Rhubarb Lemonade", CLD),
    item("drinks", "PEPSI", "Pepsi", CLD),
    item("drinks", "PEPSI MAX", "Pepsi Max", CLD),
    item("drinks", "THIRSTY PLANET SPARKLING/ STILL MINERAL WATER", "Thirsty Planet Sparkling/Still Mineral Water", CLD, note="Printed '0 kcal'"),
    item("drinks", "FROBISHERS ORANGE JUICE", "Frobishers Orange Juice", CLD),
    item("drinks", "FROBISHERS APPLE JUICE", "Frobishers Apple Juice", CLD),
    item("drinks", "PERONI ZERO", "Peroni Zero", CLD),
    skip("drinks", FOOTER, "footer 'Adults need around 2000 kcal a day'"),

    # ---- Festive Feast (AW26-festive-2 and-3-course-web-menu-with-booking.pdf): limited time, served from 18 November. The digits after a
    # name are the menu's mark glyphs (0 Vegetarian, 1 Vegan, 2 No gluten, 3 Vegetarian option, 4 Vegan option: read from its key).
    skip("festive", "FESTIVE SOUP OF THE DAY 1 From", "printed 'From 393 kcal': a lowest figure, no serving"),
    item("festive", "CREAMY STILTON MUSHROOMS 0", "Creamy Stilton Mushrooms", FEST, limited=True, veg=V),
    item("festive", "BEETROOT AND PUMPKIN SEED ARANCINI BALLS 02", "Beetroot and Pumpkin Seed Arancini Balls", FEST, limited=True, veg=V),
    item("festive", "ROAST TURKEY WITH ALL THE TRIMMINGS", "Roast Turkey with all the Trimmings", FEST, PORK, "Description: pig in blanket", limited=True),
    item("festive", "Add mustard glazed gammon for 2", "Add mustard glazed gammon (to Roast Turkey)", FEST, PORK,
         "Printed 'Add mustard glazed gammon for £2.50 221 kcal'", limited=True),
    item("festive", "SEA BASS 2", "Sea Bass", FEST, limited=True),
    item("festive", "VEGETABLE WELLINGTON 1", "Vegetable Wellington", FEST, limited=True, veg=V),
    item("festive", "CHRISTMAS PUDDING 02", "Christmas Pudding", FEST, limited=True, veg=V),
    item("festive", "RHUBARB AND GINGER TORTE 12", "Rhubarb and Ginger Torte", FEST, limited=True, veg=V),
    item("festive", "STICKY TOFFEE PUDDING 4", "Sticky Toffee Pudding", FEST, limited=True,
         note="Marked 'Vegan option available' only: the dish itself is not marked vegetarian or vegan, so no vegetarian tag"),
]
CATEGORY_ORDER = [BRK, HOT, COLD, JAC, SOUP, MAIN, SAL, SIDE, CBRK, CHOT, CSAND, CSNK, CCOLD, CDES, HDR, SEAS, CLD, FEST]
VEG_MARKS = {"V", "Ve"}


def anchor_matches(before: str, anchor: str) -> bool:
    if not before.endswith(anchor):
        return False
    start = len(before) - len(anchor)
    return start == 0 or not before[start - 1].isalnum()


def _tail_overlap(head: str, anchor: str) -> bool:
    """The words printed beside an icon and the entry's printed name are the same name: one ends with the other (a wrapped name
    has only its last line beside the icon; a figure line can carry more of the line than the name)."""
    return anchor_matches(head, anchor) or anchor_matches(anchor, head)


def icon_veg(menu: str, pdf: Path, entries: list, values: dict) -> dict:
    """{id(entry): True} for every entry a Vegetarian or Vegan icon is printed beside. Every such icon must belong to exactly one
    entry (same printed figure, same name) or be listed in ICONS_WITHOUT_FIGURE."""
    found: dict = {}
    for m in reader.marks(pdf, MARKS[menu][1]):
        if m["mark"] not in VEG_MARKS:
            continue
        head = " ".join(x for x in (reader.normalise(m["before"]), m["pre"]) if x)
        if not m["value"]:
            if (menu, head) not in ICONS_WITHOUT_FIGURE:
                raise SystemExit(f"{menu}: a {m['mark']} icon after '{head}' is followed by no calorie figure: read the menu and decide")
            continue
        owners = [e for e in entries if values[id(e)] == m["value"] and _tail_overlap(head, e["anchor"])]
        if len(owners) != 1:
            raise SystemExit(f"{menu}: the {m['mark']} icon after '{head}' ({m['value']} kcal) belongs to {len(owners)} entries: "
                             f"{[e['anchor'] for e in owners]}")
        found[id(owners[0])] = True
    return found


def glyph_veg(menu: str, pdf: Path, entries: list) -> dict:
    """Festive menu: the mark glyphs read as digits at the end of the printed name ('CHRISTMAS PUDDING 02')."""
    key = reader.glyph_key(pdf)
    found = {}
    for e in entries:
        m = re.search(r"\s([0-9]+)(?: From)?$", e["anchor"])
        if m and any(key[d] in VEG_MARKS for d in m.group(1)):
            found[id(e)] = True
    return found


def bind(menu: str, text: str, entries: list) -> dict:
    """Give every calorie figure of the menu to exactly one entry; return {id(entry): [values]}."""
    figs = reader.figures(text)
    if len(figs) != len(reader.ANY_KCAL.findall(text)):
        raise SystemExit(f"{menu}: a calorie figure could not be read as 'number kcal'")
    claimed = {id(e): [] for e in entries}
    for value, before in figs:
        cands = [e for e in entries if anchor_matches(before, e["anchor"])]
        if not cands:
            raise SystemExit(f"{menu}: the figure {value} (after '...{before[-70:]}') matches no entry in ENTRIES: the menu changed, "
                             "read it again and update the table")
        longest = max(len(e["anchor"]) for e in cands)
        top = [e for e in cands if len(e["anchor"]) == longest]
        if len(top) > 1:
            raise SystemExit(f"{menu}: the figure {value} matches several entries equally: {[e['anchor'] for e in top]}")
        claimed[id(top[0])].append(value)
    for e in entries:
        got = claimed[id(e)]
        if len(got) != e["count"]:
            raise SystemExit(f"{menu}: '{e['anchor']}' should match {e['count']} figure(s) but matches {len(got)}: the menu changed")
        if len(set(got)) != 1:
            raise SystemExit(f"{menu}: '{e['anchor']}' is printed {len(got)} times with different figures {got}: a contradicted figure, "
                             "read the menu and hold the rows back in holdback.csv")
    return {id(e): claimed[id(e)][0] for e in entries}


def build(pdf_dir: Path):
    items, skipped, repeats, holdback = [], [], [], []
    by_name = {}
    texts = {}
    for menu, (fname, columns) in FILES.items():
        path = pdf_dir / fname
        if not path.is_file():
            raise SystemExit(f"missing {path}")
        texts[menu] = reader.read_menu(path, columns)
        vary = len(re.findall(r"calories vary", texts[menu], re.I))
        if vary != EXPECTED_VARY[menu]:
            raise SystemExit(f"{menu}: {vary} 'calories vary' lines, expected {EXPECTED_VARY[menu]}: a dish without a figure changed")
    for menu in FILES:
        entries = [e for e in ENTRIES if e["menu"] == menu]
        values = bind(menu, texts[menu], entries)
        pdf = pdf_dir / FILES[menu][0]
        veg = icon_veg(menu, pdf, entries, values) if MARKS[menu][0] == "icons" else glyph_veg(menu, pdf, entries)
        for e in entries:
            if e["kind"] != "skip" and bool(veg.get(id(e))) != e["veg"]:
                raise SystemExit(f"{menu}: '{e['anchor']}' is typed veg={e['veg']} but the menu's marks say {bool(veg.get(id(e)))}: "
                                 "read the menu again")
        for e in entries:
            v = values[id(e)]
            if e["kind"] == "skip":
                skipped.append((menu, e["anchor"], e["reason"], v, e["same_as"]))
                continue
            if e["kind"] == "pair":
                if not re.fullmatch(r"\d+/\d+", v):
                    raise SystemExit(f"{menu}: '{e['anchor']}' should print 'a/b kcal' but prints {v!r}")
                cals = v.split("/")
            else:
                if not re.fullmatch(r"\d+", v):
                    raise SystemExit(f"{menu}: '{e['anchor']}' should print one figure but prints {v!r}")
                cals = [v]
            tags = [t for t in e["tags"].split("|") if t]
            if veg.get(id(e)):
                tags.insert(0, "vegetarian")
            for (name, serving), cal in zip(e["specs"], cals):
                if name in by_name:
                    raise SystemExit(f"duplicate item name {name!r}")
                row = dict(name=name, category=e["cat"], serving=serving, calories=cal, tags="|".join(tags), rankable=False,
                           limited_time=e["limited"],
                           notes="; ".join(x for x in (f"{FILES[menu][0]}: printed '{e['anchor']}' {v}", e["note"]) if x))
                by_name[name] = row
                items.append(row)
    # a repeated figure must equal the figure of the dish it repeats
    for menu, anchor, reason, v, same_as in skipped:
        if same_as:
            if same_as not in by_name:
                raise SystemExit(f"'{anchor}' repeats {same_as!r}, which is not an item")
            if by_name[same_as]["calories"] != v:
                if same_as in CONTRADICTED:
                    holdback.append((slug(same_as), CONTRADICTED[same_as]))
                    continue
                raise SystemExit(f"CONTRADICTION: {menu} '{anchor}' prints {v} kcal but {same_as!r} prints {by_name[same_as]['calories']}: "
                                 "read both, then hold back both rows in holdback.csv (never correct one)")
            repeats.append((menu, anchor, same_as, v))
    held = {h for h, _ in holdback}
    unused = [n for n in CONTRADICTED if slug(n) not in held]
    if unused:
        raise SystemExit(f"CONTRADICTED lists {sorted(unused)}, but those repeats now agree (or the dish is gone): re-read and update the list")
    if [c for c in CATEGORY_ORDER if not any(i["category"] == c for i in items)]:
        raise SystemExit("a category has no items")
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    return items, skipped, repeats, holdback


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf_dir", type=Path, help="folder holding the five menu PDFs (see the top of this file)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for fname, _ in FILES.values():
        print(f"sha256 {sha256_file(args.pdf_dir / fname)}  {fname}")
    items, skipped, repeats, holdback = build(args.pdf_dir)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Notcutts", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
                             nutrition_level="calories", holdback=holdback)
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"{len(repeats)} repeated figures checked equal to the dish they repeat; held back (contradicted): {holdback}")
    print("figures not listed as items:")
    for menu, anchor, reason, v, _ in skipped:
        if "footer" not in reason:
            print(f"  {menu}: '{anchor}' {v}: {reason}")


if __name__ == "__main__":
    main()
