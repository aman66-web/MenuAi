#!/usr/bin/env python3
"""Build data/source/notcutts/ from Notcutts' official restaurant menus with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/notcutts.py PDF_DIR --checked-on 2026-10-08 [--out DIR]

PDF_DIR holds the five files the chain's own page https://www.notcutts.co.uk/restaurants/sample-menu links (robots.txt of
notcutts.co.uk disallows only shop/checkout/query paths: /media/ and /restaurants/ are allowed; all five are served as application/pdf):
    SS26-Breakfast-Menu.pdf   1 page,  PDF created 2026-04-10, Last-Modified 2026-04-10
    SS26-Lunch-Menu.pdf       3 pages, PDF created 2026-04-10, Last-Modified 2026-04-10
    SS26-Childrens-Menu.pdf   1 page,  PDF created 2026-04-07, Last-Modified 2026-04-10
    SS26-Drinks-Menu.pdf      1 page,  PDF created 2026-04-10, Last-Modified 2026-04-10
    AW26-festive-menu-with-hyperlink_V2.pdf   1 page, PDF created 2026-09-17, Last-Modified 2026-09-18 ("Festive Feast, served from 18th November")
    all under https://www.notcutts.co.uk/media/wysiwyg/restaurant-menu/ . Needs `pdftotext` (poppler); see notcutts_pdf.py.
The page calls them a "Sample menu" ("Regional variations may occur. Our menu may vary by day and by restaurant"), and every PDF
and the page print "Adults need around 2000 kcal a day"; the page adds "*Calorie information varies - see information in our
restaurants for details". The page itself shows three dishes with calories (Welsh Rarebit & Poached Egg 784, Bacon & Cheese Burger
975, Oriental Rice Noodle Salad 553): they agree with the PDFs.

The menus print calories ONLY, as one figure after a dish's name ("WELSH RAREBIT AND POACHED EGG 784 kcal"): no kJ, protein, carbs,
fat, salt, sugar or weight, so protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"; every item is then not
rankable). Calories are copied from the PDF text as printed. Only item NAMES, categories, serving words and tags are typed in
ENTRIES below, and the script stops if the PDFs differ from that table: a figure that matches no entry or an entry that matches
too few/many figures (a new, renamed, moved or removed dish), a repeated figure whose repeats disagree, a "calories vary" line
count that changed.

How the printed lines are read:
- A dish is bound to the figure by the text printed just before the figure (the dish's printed name with its dietary marks), so a
  wrapped name ("BRECKLAND ORCHARD ZERO SUGAR / STRAWBERRY & RHUBARB 8 kcal") is read whole. Where two entries both match the
  words before a figure, the longer printed name wins ("CHEESY CHIPS (GF)" over "CHIPS (GF)"), and the count of figures each
  entry must claim is checked.
- "106/152 kcal" under the Drinks menu's "small / regular" columns: the first figure is the small drink and the second the regular
  one (two items). "DRESSED SALAD OR VEGETABLE PORTION 67/45 kcal": the first is the salad (67 kcal is also printed for the
  dressed salad beside the sandwiches) and the second the vegetable portion (two items).
- A choice written inside one dish ("SAUSAGE OR BACON CIABATTA: 2 Cumberland sausages (1061 kcal), 3 rashers of back bacon (863
  kcal) or 2 vegan sausages (610 kcal)"; the Pancake Stack's two toppings) is one item per option with its own printed figure.
  "Add bacon 236 kcals", "Add halloumi 320 kcal", "Add mustard glazed gammon 221 kcal" are the add-ons' own calories, so they are
  items of their own, never added to the dish. The soup's "butter (91 kcal) or vegan spread (45 kcal)" are the spreads' own figures.
- No serving is stated for any dish (only the Drinks menu's small/regular columns), so `serving` is blank apart from those.
- Not listed, with the reason (printed on the run): lines the menu prints with "from" ("Pip juices from 67 kcal", "Milkshakes from
  92 kcal", "2 scoops of ice cream from 257 kcal", the festive soup "From 393 kcal": a lowest figure, not a figure for any serving);
  "calories vary" lines (Homemade soup of the day, Choice of fruit); dishes with no figure at all (Speciality sandwich of the
  day, Decaf tea and coffee, the alcoholic drinks Jack Rabbit wines, Vitelli Prosecco, BrewDog Punk IPA, Old Mout cider, Adnams
  Ghostship, the 2-for-£18.95 breakfast offer, the meal deals as sets); figures that repeat a dish listed elsewhere (the Cold
  meal deal's Cheese/Ham/Tuna sandwiches, Mini Cheddars, Pom Bears, Jelly pot and kids cake repeat the Snacks and Sandwiches
  lines; "Add 2 slices of bread and butter" and "Add garlic bread" repeat the Side dishes; the "(270 KCAL)" chips and "(67 KCAL)"
  salad under the sandwich headings repeat the Side dishes): each repeat is checked to equal the listed figure, and the script
  stops if one disagrees (that is the "contradicted figure" rule: hold both rows back in holdback.csv after reading); and the
  "Adults need around 2000 kcal a day" footers.
- Tags: vegetarian when the dish's own mark is (V) or (Ve) ("(Ve*)", vegan substitute available, is not a mark of the dish);
  contains_pork / contains_beef when the dish's printed name or description says so (bacon, sausage, gammon, ham, chorizo, pig in
  blanket; beef burgers). "Cheese burger and chips" (children's) does not say beef, so it has no tag. Nothing else is inferred.
- The AW26 Festive Feast is included as limited time (served from 18 November, bookings to 24 December).

Allergens: none. Notcutts publishes no allergen guide or table (the page says to ask in the restaurants; the festive menu only
warns that its kitchens handle allergens), so no allergens.csv and no allergen_guide.csv are written.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import notcutts_pdf as reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "notcutts"
SOURCE_URL = "https://www.notcutts.co.uk/restaurants/sample-menu"
SOURCE_TITLE = ("Notcutts restaurant sample menus with calories: SS26 Breakfast, Lunch, Children's and Drinks (PDFs created 7-10 April 2026) "
                "and AW26 Festive Feast (PDF created 17 September 2026)")
ALIASES = ["notcutts", "notcutts garden centre", "notcutts restaurant", "notcutts garden centre restaurant"]
NOTE = ("Notcutts prints calories only, on a menu it calls a sample: calories vary by restaurant. Sandwich sides are printed separately "
        "(chips 270 kcal, dressed salad 67 kcal) and the menu doesn't say whether a sandwich's figure includes its side. Dishes printed "
        "'from', 'calories vary' or with no figure (alcohol, soup of the day) are not listed. Festive Feast is limited time.")

FILES = {
    "breakfast": ("SS26-Breakfast-Menu.pdf", [None]),
    "lunch": ("SS26-Lunch-Menu.pdf", [None]),
    "children": ("SS26-Childrens-Menu.pdf", [reader.LEFT, reader.RIGHT]),
    "drinks": ("SS26-Drinks-Menu.pdf", [reader.LEFT, reader.RIGHT]),
    "festive": ("AW26-festive-menu-with-hyperlink_V2.pdf", [reader.LEFT, reader.RIGHT]),
}
# "calories vary" lines the menus print (no figure, so no item): checked on every run.
EXPECTED_VARY = {"breakfast": 0, "lunch": 1, "children": 1, "drinks": 0, "festive": 0}

BRK = "Breakfast"
HOT, COLD, JAC, SOUP, MAIN, SAL, SIDE = ("Hot sandwiches", "Cold sandwiches", "Jacket potatoes", "Soup", "Main courses",
                                         "Salads and flatbreads", "Side dishes")
CBRK, CHOT, CSAND, CSNK, CCOLD, CDES = ("Children’s breakfast", "Children’s hot meal deal", "Children’s sandwiches", "Children’s snacks",
                                       "Children’s cold meal deal", "Children’s desserts")
HDR, SEAS, CLD = "Hot drinks", "Seasonal drinks", "Cold drinks"
FEST = "Festive Feast"
PORK, BEEF = "contains_pork", "contains_beef"


def item(menu, anchor, name, cat, tags="", note="", count=1, serving="", limited=False):
    return dict(kind="item", menu=menu, anchor=anchor, specs=[(name, serving)], cat=cat, tags=tags, note=note, count=count, limited=limited)


def pair(menu, anchor, specs, cat, tags="", note="", limited=False):
    """One printed "a/b" figure = two items (name, serving), in the order the printed columns/words give."""
    return dict(kind="pair", menu=menu, anchor=anchor, specs=specs, cat=cat, tags=tags, note=note, count=1, limited=limited)


def skip(menu, anchor, reason, count=1, same_as=None):
    """A figure that is deliberately not an item. `same_as` = the published name whose figure it repeats (must be equal)."""
    return dict(kind="skip", menu=menu, anchor=anchor, reason=reason, count=count, same_as=same_as)


FOOTER = "Adults need around"
ENTRIES = [
    # ---- Breakfast (SS26-Breakfast-Menu.pdf)
    item("breakfast", "GARDENER’S BREAKFAST PLATTER", "Gardener’s Breakfast Platter", BRK, PORK, "Free range eggs, bacon, Cumberland sausage, ..."),
    item("breakfast", "Add 2 slices of Farmhouse Toast (V)", "Add 2 slices of Farmhouse Toast (to a platter)", BRK, count=2,
         note="Printed under both the Gardener's and the Vegetarian platter with the same figure"),
    item("breakfast", "VEGETARIAN BREAKFAST PLATTER (V)", "Vegetarian Breakfast Platter", BRK),
    item("breakfast", "VEGAN BREAKFAST PLATTER (Ve)", "Vegan Breakfast Platter", BRK),
    item("breakfast", "WELSH RAREBIT AND POACHED EGG", "Welsh Rarebit and Poached Egg", BRK, PORK, "With smoked streaky bacon; the website page also prints 784 kcal"),
    item("breakfast", "EGGS ROYALE", "Eggs Royale", BRK),
    item("breakfast", "EGGS BENEDICT", "Eggs Benedict", BRK, PORK, "Mustard glazed gammon"),
    item("breakfast", "EGGS FLORENTINE (V)", "Eggs Florentine", BRK),
    item("breakfast", "MUSHROOMS ON SOURDOUGH (V)", "Mushrooms on Sourdough", BRK),
    item("breakfast", "SCRAMBLED EGGS ON SOURDOUGH (V)", "Scrambled Eggs on Sourdough", BRK, note="860 kcal printed as is (the menu's Mushrooms on Sourdough prints 560, the children's scrambled eggs on toast 540)"),
    item("breakfast", "Add bacon", "Add bacon (to Scrambled Eggs on Sourdough)", BRK, PORK, "Printed 'Add bacon 236 kcals for £1.75': the bacon's own calories"),
    item("breakfast", "2 Cumberland sausages", "Sausage or Bacon Ciabatta with 2 Cumberland sausages", BRK, PORK),
    item("breakfast", "3 rashers of back bacon", "Sausage or Bacon Ciabatta with 3 rashers of back bacon", BRK, PORK),
    item("breakfast", "or 2 vegan sausages (Ve)", "Sausage or Bacon Ciabatta with 2 vegan sausages", BRK),
    item("breakfast", "natural yoghurt topped with forest fruits, fresh blueberries and honey (V)",
         "Pancake Stack with natural yoghurt, forest fruits, blueberries and honey", BRK),
    item("breakfast", "streaky bacon, sour cream, maple syrup and cinnamon", "Pancake Stack with streaky bacon, sour cream, maple syrup and cinnamon", BRK, PORK),
    skip("breakfast", FOOTER, "footer 'Adults need around 2000 kcal a day'"),

    # ---- Lunch (SS26-Lunch-Menu.pdf)
    skip("lunch", "SERVED WITH CHIPS", "sandwich heading repeats the Chips figure", count=2, same_as="Chips"),
    skip("lunch", "OR DRESSED SALAD", "sandwich heading repeats the Dressed Salad figure", count=2, same_as="Dressed Salad"),
    item("lunch", "FLAT MUSHROOM, BRIE AND CHILLI JAM TOASTED CIABATTA (V)", "Flat Mushroom, Brie and Chilli Jam Toasted Ciabatta", HOT),
    item("lunch", "SAUSAGE AND CARAMELISED ONION CHUTNEY TOASTED CIABATTA", "Sausage and Caramelised Onion Chutney Toasted Ciabatta", HOT, PORK),
    item("lunch", "TUNA MELT TOASTED CIABATTA", "Tuna Melt Toasted Ciabatta", HOT),
    item("lunch", "BBQ VEGETABLE TOASTED CIABATTA (Ve)", "BBQ Vegetable Toasted Ciabatta", HOT),
    item("lunch", "HOT FLAKED SMOKED SALMON, CREAM CHEESE AND CUCUMBER", "Hot Flaked Smoked Salmon, Cream Cheese and Cucumber Sandwich", COLD),
    item("lunch", "EGG MAYONNAISE AND BABY SPINACH (V)", "Egg Mayonnaise and Baby Spinach Sandwich", COLD),
    item("lunch", "TUNA MAYONNAISE WITH CUCUMBER", "Tuna Mayonnaise with Cucumber Sandwich", COLD),
    item("lunch", "CHEDDAR WITH APPLE AND SPRING ONION COLESLAW (V)", "Cheddar with Apple and Spring Onion Coleslaw Sandwich", COLD),
    item("lunch", "HAM, LETTUCE AND TOMATO", "Ham, Lettuce and Tomato Sandwich", COLD, PORK),
    item("lunch", "CORONATION CHICKEN (GF)", "Coronation Chicken Jacket Potato", JAC),
    item("lunch", "TUNA MAYONNAISE (GF)", "Tuna Mayonnaise Jacket Potato", JAC),
    item("lunch", "APPLE AND SPRING ONION COLESLAW (V, GF)", "Apple and Spring Onion Coleslaw Jacket Potato", JAC),
    item("lunch", "CHEDDAR AND BEANS (V, GF)", "Cheddar and Beans Jacket Potato", JAC),
    item("lunch", "MIXED BEAN CHILLI (Ve, GF)", "Mixed Bean Chilli Jacket Potato", JAC),
    item("lunch", "Choose from butter", "Butter (served with the soup’s sourdough roll)", SOUP,
         note="Printed 'Choose from butter (91 kcal) or vegan spread (45 kcal)'; the soup itself prints 'Calories vary'"),
    item("lunch", "or vegan spread", "Vegan spread (served with the soup’s sourdough roll)", SOUP),
    item("lunch", "FISH AND CHIPS (GF)", "Fish and Chips", MAIN),
    skip("lunch", "Add 2 slices of bread and butter (V)", "'Add 2 slices of bread and butter' repeats the Side dishes line", same_as="Bread and Butter, 2 slices"),
    item("lunch", "CHICKEN AND CHORIZO RIGATONI", "Chicken and Chorizo Rigatoni", MAIN, PORK),
    skip("lunch", "Add garlic bread (Ve)", "'Add garlic bread' repeats the Side dishes line", same_as="Garlic Bread"),
    item("lunch", "BACON AND CHEESE BURGER", "Bacon and Cheese Burger", MAIN, PORK + "|" + BEEF, "Two 3oz beef burgers, smoked streaky bacon; the website page also prints 975 kcal"),
    item("lunch", "BEYOND MEAT BURGER (Ve)", "Beyond Meat Burger", MAIN),
    item("lunch", "FISH GOUJON BURGER", "Fish Goujon Burger", MAIN),
    item("lunch", "ORIENTAL RICE NOODLE SALAD (Ve, GF)", "Oriental Rice Noodle Salad", SAL, note="The website page also prints 553 kcal"),
    item("lunch", "Add halloumi", "Add halloumi (to Oriental Rice Noodle Salad)", SAL, note="Printed 'Add halloumi 320 kcal for £2.95'; no dietary mark printed"),
    item("lunch", "CRISPY CHICKEN AND BACON SALAD (GF)", "Crispy Chicken and Bacon Salad", SAL, PORK),
    item("lunch", "TUNA AND EGG SALAD (GF)", "Tuna and Egg Salad", SAL),
    item("lunch", "CHICKEN TIKKA FLATBREAD", "Chicken Tikka Flatbread", SAL),
    item("lunch", "HALLOUMI AND HOT HONEY FLATBREAD (V)", "Halloumi and Hot Honey Flatbread", SAL),
    item("lunch", "SWEET POTATO FALAFEL FLATBREAD (Ve)", "Sweet Potato Falafel Flatbread", SAL),
    item("lunch", "CHIPS (GF)", "Chips", SIDE),
    item("lunch", "CHEESY CHIPS (GF)", "Cheesy Chips", SIDE),
    item("lunch", "CRISPY HOMEMADE POTATO WEDGES (GF)", "Crispy Homemade Potato Wedges", SIDE),
    pair("lunch", "DRESSED SALAD OR VEGETABLE PORTION (Ve, GF)", [("Dressed Salad", ""), ("Vegetable Portion", "")], SIDE,
         note="Printed '67/45 kcal': first = dressed salad, second = vegetable portion, in the printed order of the words"),
    item("lunch", "BREAD AND BUTTER - 2 SLICES (V)", "Bread and Butter, 2 slices", SIDE),
    item("lunch", "GARLIC BREAD (Ve)", "Garlic Bread", SIDE),
    item("lunch", "HOMEMADE ONION RINGS (GF)", "Homemade Onion Rings", SIDE),
    item("lunch", "CRISPY BREADED HALF CHICKEN BREAST (GF)", "Crispy Breaded Half Chicken Breast", SIDE),
    skip("lunch", FOOTER, "footer 'Adults need around 2000 kcal a day' (printed on each of the 3 pages)", count=3),

    # ---- Children's menu (SS26-Childrens-Menu.pdf), left column then right column
    item("children", "English breakfast", "English Breakfast", CBRK, PORK, "Sausage, fried egg, hash brown and baked beans"),
    item("children", "Banana, yoghurt and honey pancakes (V)", "Banana, Yoghurt and Honey Pancakes", CBRK),
    item("children", "Baked beans on toast (V)", "Baked Beans on Toast", CBRK),
    item("children", "Scrambled eggs on toast (V)", "Scrambled Eggs on Toast", CBRK),
    item("children", "Cheese on toast soldiers (V)", "Cheese on Toast Soldiers", CBRK),
    item("children", "Breaded chicken strips with chips and beans (GF)", "Breaded Chicken Strips with Chips and Beans", CHOT),
    item("children", "Fish goujons with chips and peas (GF)", "Fish Goujons with Chips and Peas", CHOT),
    item("children", "Cheese burger and chips", "Cheese Burger and Chips", CHOT, note="The menu does not say beef: no tag"),
    item("children", "Tomato and sausage rigatoni pasta", "Tomato and Sausage Rigatoni Pasta", CHOT, PORK),
    item("children", "Jacket potato with cheese and beans (V, GF)", "Jacket Potato with Cheese and Beans", CHOT),
    item("children", "Cheese sandwich (V)", "Cheese Sandwich", CSAND),
    item("children", "Ham sandwich", "Ham Sandwich", CSAND, PORK),
    item("children", "Tuna mayonnaise sandwich", "Tuna Mayonnaise Sandwich", CSAND),
    item("children", "Pom Bears", "Pom Bears", CSNK, count=2, note="Printed in Snacks and in the Cold meal deal with the same figure"),
    item("children", "Mini Cheddars", "Mini Cheddars", CSNK, count=2, note="Printed in Snacks and in the Cold meal deal with the same figure"),
    item("children", "Jelly pot", "Jelly Pot", CSNK, count=2, note="Printed in Snacks and in the Cold meal deal with the same figure"),
    item("children", "Kids cake", "Kids Cake", CSNK),
    skip("children", "or kids cake", "Cold meal deal's 'kids cake' repeats the Snacks line", same_as="Kids Cake"),
    item("children", "Pip rainbow lolly", "Pip Rainbow Lolly", CSNK),
    skip("children", "Sandwich or salad (Cheese", "Cold meal deal's Cheese repeats the Cheese Sandwich", same_as="Cheese Sandwich"),
    skip("children", "kcal, Ham", "Cold meal deal's Ham repeats the Ham Sandwich", same_as="Ham Sandwich"),
    skip("children", "kcal, Tuna", "Cold meal deal's Tuna repeats the Tuna Mayonnaise Sandwich", same_as="Tuna Mayonnaise Sandwich"),
    item("children", "kcal, Salad", "Salad (cold meal deal)", CCOLD, note="Printed only in the Cold meal deal's 'Sandwich or salad' choice"),
    skip("children", "Pip juices from", "printed 'from': a lowest figure, no serving"),
    skip("children", "Milkshakes from", "printed 'from': a lowest figure, no serving"),
    item("children", "Brownie and ice cream (V)", "Brownie and Ice Cream", CDES),
    item("children", "Banana and chocolate pancakes (V)", "Banana and Chocolate Pancakes", CDES),
    skip("children", "2 scoops of ice cream (V, GF) from", "printed 'from': a lowest figure, no serving"),
    item("children", "Cake and custard (V)", "Cake and Custard", CDES),

    # ---- Drinks (SS26-Drinks-Menu.pdf), left column (hot, seasonal) then right column (cold)
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
    item("drinks", "ICED LATTE", "Iced Latte", SEAS),
    item("drinks", "CHAI LATTE", "Chai Latte", SEAS),
    item("drinks", "MANGO AND LIME (Ve)", "Mango and Lime Cooler", SEAS),
    item("drinks", "STRAWBERRY AND MINT (Ve)", "Strawberry and Mint Cooler", SEAS),
    item("drinks", "ELDERFLOWER AND APPLE", "Elderflower and Apple Cooler", SEAS),
    item("drinks", "PEACH ICED TEA (Ve)", "Peach Iced Tea", SEAS, note="Listed under 'Our refreshing coolers'"),
    item("drinks", "CHOCOLATE (V)", "Chocolate Milkshake", SEAS, note="Under 'Our homemade cream topped milkshakes'"),
    item("drinks", "STRAWBERRY (V)", "Strawberry Milkshake", SEAS),
    item("drinks", "VANILLA (V)", "Vanilla Milkshake", SEAS),
    item("drinks", "CHERRY BAKEWELL", "Cherry Bakewell Milkshake", SEAS),
    item("drinks", "LUSCOMBE ELDERFLOWER BUBBLY", "Luscombe Elderflower Bubbly", CLD),
    item("drinks", "LUSCOMBE SICILIAN LEMONADE", "Luscombe Sicilian Lemonade", CLD),
    item("drinks", "BRECKLAND ORCHARD PLUM & CHERRY", "Breckland Orchard Plum & Cherry", CLD),
    item("drinks", "BRECKLAND ORCHARD ZERO SUGAR STRAWBERRY & RHUBARB", "Breckland Orchard Zero Sugar Strawberry & Rhubarb", CLD),
    item("drinks", "FENTIMANS GINGER BEER", "Fentimans Ginger Beer", CLD),
    item("drinks", "FENTIMANS LEMON SHANDY", "Fentimans Lemon Shandy", CLD),
    item("drinks", "FRANKLIN & SONS DANDELION & BURDOCK", "Franklin & Sons Dandelion & Burdock", CLD),
    item("drinks", "PEPSI", "Pepsi", CLD),
    item("drinks", "PEPSI MAX", "Pepsi Max", CLD),
    item("drinks", "THIRSTY PLANET SPARKLING/ STILL MINERAL WATER", "Thirsty Planet Sparkling/Still Mineral Water", CLD, note="Printed '0 kcal'"),
    item("drinks", "FROBISHERS ORANGE JUICE", "Frobishers Orange Juice", CLD),
    item("drinks", "FROBISHERS APPLE JUICE", "Frobishers Apple Juice", CLD),
    item("drinks", "PERONI ZERO", "Peroni Zero", CLD),
    skip("drinks", FOOTER, "footer 'Adults need around 2000 kcal a day'"),

    # ---- Festive Feast (AW26-festive-menu-with-hyperlink_V2.pdf): limited time, served from 18 November
    skip("festive", "FESTIVE SOUP OF THE DAY (Ve, GF*) From", "printed 'From 393 kcal': a lowest figure, no serving"),
    item("festive", "CREAMY STILTON MUSHROOMS (V, GF*)", "Creamy Stilton Mushrooms", FEST, limited=True),
    item("festive", "BEETROOT AND PUMPKIN SEED ARANCINI BALLS (V, GF)", "Beetroot and Pumpkin Seed Arancini Balls", FEST, limited=True),
    item("festive", "ROAST TURKEY WITH ALL THE TRIMMINGS (GF*)", "Roast Turkey with all the Trimmings", FEST, PORK, "Description: pig in blanket", limited=True),
    item("festive", "Add mustard glazed gammon for (GF)", "Add mustard glazed gammon (to Roast Turkey)", FEST, PORK, "Printed 'Add mustard glazed gammon for £2.50 (GF) 221 kcal'", limited=True),
    item("festive", "SEA BASS (GF)", "Sea Bass", FEST, limited=True),
    item("festive", "VEGETABLE WELLINGTON (Ve)", "Vegetable Wellington", FEST, limited=True),
    item("festive", "CHRISTMAS PUDDING (V, GF)", "Christmas Pudding", FEST, limited=True),
    item("festive", "RHUBARB AND GINGER TORTE (Ve, GF)", "Rhubarb and Ginger Torte", FEST, limited=True),
    item("festive", "STICKY TOFFEE PUDDING (Ve*)", "Sticky Toffee Pudding", FEST, limited=True, note="Marked (Ve*) = vegan substitute available on request: the dish itself is not marked vegan, so no vegetarian tag"),
]
CATEGORY_ORDER = [BRK, HOT, COLD, JAC, SOUP, MAIN, SAL, SIDE, CBRK, CHOT, CSAND, CSNK, CCOLD, CDES, HDR, SEAS, CLD, FEST]
VEG_MARKS = {"V", "Ve"}


def vegetarian_mark(anchor: str) -> bool:
    """True if the printed name ends with a (V) or (Ve) mark, alone or in a list: '(V, GF)'. '(Ve*)' is not a mark of the dish."""
    m = re.search(r"\(([^()]*)\)$", anchor)
    return bool(m) and any(p.strip() in VEG_MARKS for p in m.group(1).split(","))


def anchor_matches(before: str, anchor: str) -> bool:
    if not before.endswith(anchor):
        return False
    start = len(before) - len(anchor)
    return start == 0 or not before[start - 1].isalnum()


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
    items, skipped, repeats = [], [], []
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
            if vegetarian_mark(e["anchor"]):
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
                raise SystemExit(f"CONTRADICTION: {menu} '{anchor}' prints {v} kcal but {same_as!r} prints {by_name[same_as]['calories']}: "
                                 "read both, then hold back both rows in holdback.csv (never correct one)")
            repeats.append((menu, anchor, same_as, v))
    if [c for c in CATEGORY_ORDER if not any(i["category"] == c for i in items)]:
        raise SystemExit("a category has no items")
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    return items, skipped, repeats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf_dir", type=Path, help="folder holding the five menu PDFs (see the top of this file)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for fname, _ in FILES.values():
        print(f"sha256 {sha256_file(args.pdf_dir / fname)}  {fname}")
    items, skipped, repeats = build(args.pdf_dir)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Notcutts", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"{len(repeats)} repeated figures checked equal to the dish they repeat")
    print("figures not listed as items:")
    for menu, anchor, reason, v, _ in skipped:
        if "footer" not in reason:
            print(f"  {menu}: '{anchor}' {v}: {reason}")


if __name__ == "__main__":
    main()
