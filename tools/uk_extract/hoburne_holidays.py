#!/usr/bin/env python3
"""Build data/source/hoburne-holidays/ from Hoburne's official Autumn/Winter 2026 menu PDFs (a CALORIES-ONLY chain).

    python3 tools/uk_extract/hoburne_holidays.py path/to/pdf-folder --checked-on 2026-10-08 [--out DIR]

The folder holds the eight menu PDFs under the file names hoburne.com serves them with (MENU_FILES below) and, only to print
their SHA-256, the three allergen sheets. Source: https://www.hoburne.com/holidays/food-and-drink/about-our-food-and-drink/ links the
eight menus as "...Web.pdf?vid=N". robots.txt of hoburne.com says `Disallow: /*?`, so the PDFs were fetched WITHOUT the query string
(tools/uk_extract/robots_rfc.py: the bare path is allowed, the ?vid= address is not), one request per file, 1.2 s apart.
Needs `pdftotext` and `pdfinfo` (poppler). Pages are read by position: see hoburne_holidays_pdf.py.

The menus print calories ONLY, inline after each dish ("Served with French fries 1431kcal"; add-ons "+183kcal"; smaller-appetite
versions "1238kcal / sa 1023kcal"). Protein, carbs, fat, salt, kJ and weights are never printed, so every item is calories-only
(docs/DATA.md "Calories-only chains"). Calories are copied from the PDF as printed ("1,238kcal" becomes 1238). Only names, categories
and tags are written by hand, in TABLE below: one entry per dish heading in the order the page is read. The script stops if a
heading, the number of calorie values under it, or a label before a value ("fried", "sa") differs from the table, or if the number of
calorie words found does not equal an independent count of the PDF's plain text, so a new menu is re-checked by a human.

MENUS DIFFER BY PARK (the page says "Some menu items may vary by park"): Venue = Hoburne Park, Bashley, Cotswold and Naish; The Pier
House = Devon Bay; The Bay = Blue Anchor; the Restaurant and Clubhouse menus and the Breakfast, Sunday and Sweet Treats menus are
shared. All eight menus were read. A dish is PUBLISHED only if every menu that prints it prints the same calories; a dish whose
printed calories differ between menus is EXCLUDED (EXPECTED_CONFLICTS below lists each one and the stop-if-changed guard). "Same dish"
is decided by the published name in TABLE: where two menus print the same dish under slightly different wording (the Pier House's
"Gravy" and the others' "Jug of Homemade Gravy", "Katsu Curry" and "Pot of Katsu Curry Sauce", "Side of Chips" and "Chunky Chips",
the kids' meals) the table gives them one name so the disagreement is caught, never hidden.

Other exclusions (all written down here):
- The Bay's "Filled Deli Rolls / Sandwiches" (7 dishes) print two price and calorie pairs ("9.75 998kcal / 8.50 942kcal") with no label
  saying which is the roll and which the sandwich: not published.
- Plant-milk figures are per 100ml ("soy (41Kcal per 100ml)"): per-100 values are never published.
- Not on any menu with calories: cocktails, wine, beer, soft drinks, the Sammy Squad "scoop of ice cream" line, the Sunday Sammy roast,
  "Coffee & Cake" and the dog menu.
- The hot-drink figures are printed once beside a "from" price: the size is not stated (note.txt says so).
- "Make it vegan" swaps print the whole dish with the swap ("crispy cauli bites vg lc 622kcal" for the K Pop dish): published as
  items named "... (vegan swap)". "+NNNkcal" lines are the add-on's own calories (the same pot of katsu sauce prints "+228kcal" as an
  add-on and "228kcal" as a side): published as "Add-ons" named for what they add to.
- Macaroni Cheese prints "793kcal / 1189kcal" under "8.50 / Go Large 13.50": regular, then Go Large, in the printed order.
- The steak bavette's 614kcal is printed before "& your choice of a side from the Sides section": the figure is for the steak, rocket and
  chimichurri; the side is extra.

Tags: vegetarian only where the dish heading carries the menu's own v or vg mark ("(vg option available)" in brackets is ignored).
contains_pork / contains_beef only where the item's name or its printed description says bacon, ham, gammon, sausage (not Quorn),
pork, pepperoni, or beef, steak, sirloin. "Aberdeen Angus" alone is not beef here. Meat type not stated: listed in the run output.

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. Hoburne's allergen sheets (Hoburne_Allergen-Sheets_October-2026.pdf, 10 pages,
updated 06/10/2026) are per-menu matrices of drawn ticks, but they have no rows for several published dishes (the Sunday roasts, the
ice cream flavours, The Bay's own dishes: The Bay's sheet is dated 20/04/2026, before the autumn menu, and the Pier House sheet covers
only the chip-shop mains and sides), so they cannot be read completely: all or nothing, so only the guide's link is published.
"""
from __future__ import annotations
import argparse
import difflib
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import hoburne_holidays_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "hoburne-holidays"
SOURCE_URL = "https://www.hoburne.com/holidays/food-and-drink/about-our-food-and-drink/"
SOURCE_TITLE = ("Hoburne Autumn/Winter 2026 menus with calories: Breakfast, Clubhouse, Restaurant, Sunday, Sweet Treats, The Bay, "
                "The Pier House and Venue (eight PDFs created 30 September 2026, linked from hoburne.com; accessed 2026-10-08)")
ALIASES = ["hoburne", "hoburne holidays", "hoburne holiday parks", "hoburne parks", "hoburne park", "bashley by hoburne", "hoburne bashley",
           "naish by hoburne", "hoburne naish", "hoburne cotswold", "cotswold by hoburne", "hoburne devon bay", "devon bay by hoburne",
           "hoburne blue anchor", "blue anchor by hoburne"]
GUIDE_TITLE = ("Hoburne allergen information, autumn all-day menu (Hoburne_Allergen-Sheets_October-2026.pdf, updated 06/10/2026; "
               "Blue Anchor The Bay and Devon Bay The Pier House have their own sheets on hoburne.com)")
GUIDE_URL = "https://www.hoburne.com/assets/PDF-Downloads/Autumn-menu-2026/Hoburne_Allergen-Sheets_October-2026.pdf"
# The sheets print "we do use all 14 allergens (except peanuts) in our kitchens ... traces may be present" and mark may-contain cells.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Calories only, one figure per dish as printed on Hoburne's autumn 2026 menus (no protein, carbs or fat). Menus differ by park: a "
        "dish is listed only if every menu that prints it gives the same figure. Hot-drink sizes are not stated. Alcohol is not covered.")

# menu key -> (file name as served, title). Order = the order the CLI lists them.
MENU_FILES = {
    "breakfast": "Hoburne_Winter_Breakfast-Menu_Web.pdf",
    "sunday": "Hoburne_Winter_Sunday-Menu_Web.pdf",
    "sweet": "Hoburne_Winter_Sweet-Treat-Menu_Web.pdf",
    "venue": "Hoburne_Winter_Venue-Menu_Web.pdf",
    "pier": "Hoburne_Winter_The-Pier-House-Menu_Web.pdf",
    "bay": "Hoburne_Winter_The-Bay-Menu_Web.pdf",
    "restaurant": "Hoburne_Winter_Restaurant-Menu_Web.pdf",
    "clubhouse": "Hoburne_Winter_Clubhouse-Menu_Web.pdf",
}
ALLERGEN_FILES = ["Hoburne_Allergen-Sheets_October-2026.pdf", "Hoburne-Blue-Anchor_Allergen-Sheets_April-2026-Final.pdf",
                  "Hoburne_Pierhouse-Allergen-Sheets_October-2026.pdf"]
MENU_LABEL = {"breakfast": "Breakfast", "sunday": "Sunday", "sweet": "Sweet Treats", "venue": "Venue", "pier": "The Pier House",
              "bay": "The Bay", "restaurant": "Restaurant", "clubhouse": "Clubhouse"}

SECTION_CATEGORY = {
    "Breakfast": "Breakfast", "On the Run": "Breakfast Rolls & Toast", "Sammy Squad": "Kids", "Sammy Squad Menu": "Kids",
    "Smaller Tummies": "Kids", "Kids’ Kitchen": "Kids", "To Start": "Starters & Sharers", "Sharers & Small Plates": "Starters & Sharers",
    "Loaded Fries": "Loaded Fries", "Rolls & Wraps": "Rolls & Wraps", "Baked Jacket Potatoes": "Baked Jacket Potatoes", "Mains": "Mains",
    "The Bay Classics": "Mains", "Burgers": "Burgers", "Salads": "Salads", "Sides": "Sides", "Sunday Roasts": "Sunday Roasts",
    "Sunday Sides": "Sunday Sides", "Sweet Treats": "Desserts", "Hot Drinks": "Hot Drinks", "Smoothies": "Smoothies & Milkshakes",
    "Milkshakes": "Smoothies & Milkshakes",
}
CATEGORY_ORDER = ["Breakfast", "Breakfast Rolls & Toast", "Starters & Sharers", "Loaded Fries", "Rolls & Wraps", "Baked Jacket Potatoes", "Mains",
                  "Burgers", "Pizza", "Salads", "Sides", "Add-ons", "Sunday Roasts", "Sunday Sides", "Kids", "Desserts", "Hot Drinks",
                  "Smoothies & Milkshakes"]

PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausages?|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|sirloin)\b", re.I)
NOT_STATED = re.compile(r"\b(angus|burgers?|cheeseburger|lasagne|gyros|bolognaise|mince)\b", re.I)


def E(key, *items, cat=None):
    """One dish heading (key = the heading without prices, marks and calorie values) and the items its calorie values give, in the
    printed order. An item is 'Name' or 'Name @ expect=<words before the value> @ cat=.. @ veg=0|1 @ meat=0 @ serving=..'."""
    return ("E", key, items, cat)


def X(key, n, reason):
    """A dish heading with n calorie values that is deliberately not published."""
    return ("X", key, n, reason)


# ---- shared blocks (the same dishes are printed, with the same layout, on several menus)
BREAKFAST = [
    E("THE BIG BREAKFAST", "The Big Breakfast with Fried Eggs @ expect=fried", "The Big Breakfast with Scrambled Eggs @ expect=scrambled",
      "The Big Breakfast with Poached Eggs @ expect=poached"),
    E("CLASSIC HOBURNE BREAKFAST", "Classic Hoburne Breakfast with Fried Egg @ expect=fried",
      "Classic Hoburne Breakfast with Scrambled Egg @ expect=scrambled", "Classic Hoburne Breakfast with Poached Egg @ expect=poached"),
    E("VEGETARIAN BREAKFAST", "Vegetarian Breakfast with Fried Eggs @ expect=fried", "Vegetarian Breakfast with Scrambled Eggs @ expect=scrambled",
      "Vegetarian Breakfast with Poached Eggs @ expect=poached"),
    E("VEGAN BREAKFAST", "Vegan Breakfast"),
    E("BRIOCHE FRENCH TOAST", "Brioche French Toast with Grilled Bacon @ expect=bacon @ veg=0",
      "Brioche French Toast with Red Berry Compote & Greek Style Yoghurt @ expect=yoghurt @ meat=0"),
    E("YOGHURT, GRANOLA & BERRIES", "Yoghurt, Granola & Berries"),
    E("HOMEMADE BUBBLE & SQUEAK", "Homemade Bubble & Squeak"),
    E("EGGS & AVOCADO", "Eggs & Avocado"),
]
ON_THE_RUN = [
    E("BACK BACON RASHERS", "Back Bacon Rashers Breakfast Roll"),
    E("BUTCHER’S SAUSAGES", "Butcher’s Sausages Breakfast Roll"),
    E("VEGAN QUORN SAUSAGES", "Vegan Quorn Sausages Breakfast Roll"),
    E("TOAST & EGGS", "Toast & Eggs with Scrambled Eggs @ expect=scrambled", "Toast & Eggs with Fried Eggs @ expect=fried",
      "Toast & Eggs with Poached Eggs @ expect=poached eggs"),
    E("TOAST & PRESERVE", "Toast & Preserve"),
    E("TIPTREE STRAWBERRY JAM", "Tiptree Strawberry Jam (add to toast)"),
    E("TIPTREE ORANGE MARMALADE", "Tiptree Orange Marmalade (add to toast)"),
    E("NUTELLA", "Nutella (add to toast)"),
]
SAMMY_BREAKFAST = [
    E("SAMMY BREAKFAST", "Sammy Breakfast with Fried Egg @ expect=fried", "Sammy Breakfast with Poached Egg @ expect=poached",
      "Sammy Breakfast with Scrambled Egg @ expect=scrambled"),
    E("CAPTAIN SMUGGLES CEREAL", "Captain Smuggles Cereal"),
    E("TOMMY’S EGG & SOLDIERS", "Tommy’s Egg & Soldiers with Scrambled Egg @ expect=scrambled", "Tommy’s Egg & Soldiers with Fried Egg @ expect=fried",
      "Tommy’s Egg & Soldiers with Poached Egg @ expect=poached"),
    E("CORAL’S FRUIT YOGHURT", "Coral’s Fruit Yoghurt"),
]
SUNDAY = [
    E("ROAST SIRLOIN OF BEEF WITH HORSERADISH SAUCE", "Roast Sirloin of Beef with Horseradish Sauce"),
    E("HERB ROASTED SUPREME OF CHICKEN", "Herb Roasted Supreme of Chicken"),
    E("ROASTED PORK SHOULDER WITH APPLE SAUCE", "Roasted Pork Shoulder with Apple Sauce"),
    E("ROASTED MUSHROOM & LENTIL BAKE", "Roasted Mushroom & Lentil Bake"),
    E("MAPLE ROASTED CARROTS & PARSNIPS", "Maple Roasted Carrots & Parsnips"),
    E("SWEDE MASH", "Swede Mash"),
    E("HERB ROASTED POTATOES", "Herb Roasted Potatoes"),
    E("EXTRA YORKSHIRE PUDDING", "Extra Yorkshire Pudding"),
]
SWEET = [
    E("HOMEMADE APPLE & BLACKBERRY CRUMBLE", "Homemade Apple & Blackberry Crumble with Custard @ expect=custard",
      "Homemade Apple & Blackberry Crumble with New Forest Ice Cream @ expect=ice cream"),
    E("RICH CHOCOLATE BROWNIE", "Rich Chocolate Brownie"),
    E("CHOCOLATE & TOFFEE TRILLIONAIRE’S TART", "Chocolate & Toffee Trillionaire’s Tart"),
    E("BUBBLE WAFFLE & BERRIES", "Bubble Waffle & Berries"),
    E("STICKY TOFFEE PUDDING", "Sticky Toffee Pudding with Custard @ expect=custard", "Sticky Toffee Pudding with New Forest Ice Cream @ expect=ice cream"),
    E("NEW FOREST ICE CREAMS 1 SCOOP 2 SCOOPS 3 SCOOPS",
      "New Forest Ice Cream, Vanilla Bean @ expect=vanilla bean @ serving=1 scoop", "New Forest Ice Cream, Strawberry @ expect=strawberry @ serving=1 scoop",
      "New Forest Ice Cream, Double Chocolate @ expect=double chocolate @ serving=1 scoop",
      "New Forest Ice Cream, Salted Caramel @ expect=salted caramel @ serving=1 scoop",
      "New Forest Ice Cream, Mint Choc Chip @ expect=mint choc chip @ serving=1 scoop", "New Forest Ice Cream, Coconut @ expect=coconut @ serving=1 scoop",
      "New Forest Ice Cream, Brownie & White Chocolate @ expect=white chocolate @ serving=1 scoop",
      "New Forest Ice Cream, Honeycomb Swirl @ expect=honeycomb swirl @ serving=1 scoop",
      "New Forest Ice Cream, Bubblegum @ expect=bubblegum @ serving=1 scoop", "New Forest Ice Cream, Lotus Biscoff @ expect=lotus biscoff @ serving=1 scoop",
      "New Forest Ice Cream, Black Cherry @ expect=black cherry @ serving=1 scoop", "New Forest Ice Cream, Rum & Raisin @ expect=rum raisin @ serving=1 scoop",
      "New Forest Ice Cream, Vegan Salted Caramel @ expect=salted caramel vg @ serving=1 scoop @ veg=1",
      "New Forest Ice Cream, Vegan Vanilla Pod @ expect=vanilla pod vg @ serving=1 scoop @ veg=1"),
]
DRINKS = [
    E("CAPPUCCINO", "Cappuccino"), E("FLAT WHITE", "Flat White"), E("LATTE", "Latte"), E("AMERICANO", "Americano"), E("MOCHA", "Mocha"),
    E("ESPRESSO", "Espresso"), E("CORTADO", "Cortado"), E("CHAI LATTE", "Chai Latte"), E("DIRTY CHAI LATTE", "Dirty Chai Latte"),
    E("ICED COFFEE LATTE", "Iced Coffee Latte"), E("ICED MATCHA TEA", "Iced Matcha Tea"), E("ICED STRAWBERRY MATCHA", "Iced Strawberry Matcha"),
    E("POT OF TEA FOR ONE", "Pot of Tea for One"), E("SPECIALITY FLAVOURED TEAS", "Speciality Flavoured Teas"), E("HOT CHOCOLATE", "Hot Chocolate"),
    E("LUXURY HOT CHOCOLATE", "Luxury Hot Chocolate"),
    E("BERRY GO ROUND", "Berry Go Round Smoothie"), E("PASH N SHOOT", "Pash N Shoot Smoothie"),
]
SIDE_POTS = [  # printed as "+NNNkcal" add-ons and as plain sides with the same value; sold on their own
    E("POT OF KATSU CURRY SAUCE", "Pot of Katsu Curry Sauce @ cat=Sides"), E("JUG OF HOMEMADE GRAVY", "Jug of Homemade Gravy @ cat=Sides"),
    E("3 PIECES OF SCAMPI", "3 Pieces of Scampi @ cat=Sides"), E("PICKLED ONION", "Pickled Onion @ cat=Sides"),
    E("3 ONION RINGS", "3 Onion Rings @ cat=Sides"),
]
LOADED_FRIES = [
    E("THAI FRIES", "Thai Fries"), E("AMERICAN FRIES", "American Fries"), E("KATSU CHICKEN FRIES", "Katsu Chicken Fries"), E("GREEK FRIES", "Greek Fries"),
]
KATSU_CHOICES = [
    E("BREADED CHICKEN MINI FILLETS", "Breaded Chicken Mini Fillets (add to Japanese Katsu Curry)",
      "Breaded Chicken Mini Fillets (add to Japanese Katsu Curry, smaller appetite) @ expect=sa"),
    E("CRISPY CAULIFLOWER BITES", "Crispy Cauliflower Bites (add to Japanese Katsu Curry)",
      "Crispy Cauliflower Bites (add to Japanese Katsu Curry, smaller appetite) @ expect=sa"),
    E("CRISPY BATTERED TOFU", "Crispy Battered Tofu (add to Japanese Katsu Curry)",
      "Crispy Battered Tofu (add to Japanese Katsu Curry, smaller appetite) @ expect=sa"),
]
MAINS_COMMON_A = [  # Restaurant and Clubhouse "Mains" column, from the fish fillet down to the katsu curry
    E("BEER BATTERED FISH FILLET", "Beer Battered Fish Fillet", "Beer Battered Fish Fillet (smaller appetite) @ expect=sa",
      "Crispy Battered Tofu instead of Fish Fillet (vegan swap) @ expect=tofu vg @ veg=1 @ meat=0",
      "Crispy Battered Tofu instead of Fish Fillet (vegan swap, smaller appetite) @ expect=sa @ veg=1 @ meat=0"),
]
BURGER_TOPPINGS = [
    E("CHEDDAR CHEESE", "Cheddar Cheese (burger topping)"), E("GRILLED BACON", "Grilled Bacon (burger topping)"),
    E("FREE RANGE EGG", "Free Range Egg (burger topping)"), E("GRILLED MUSHROOM", "Grilled Mushroom (burger topping)"),
    E("SMASHED AVOCADO", "Smashed Avocado (burger topping)"),
]
SALAD_TOPPINGS = [
    E("FLAKED TUNA MAYO", "Flaked Tuna Mayo (salad topping)"), E("CRISPY CAULI BITES", "Crispy Cauli Bites (salad topping)"),
    E("KOREAN CHICKEN PIECES", "Korean Chicken Pieces (salad topping)"), E("CRISPY FRIED TOFU", "Crispy Fried Tofu (salad topping)"),
]
KIDS_LUNCH = [  # Venue "Smaller Tummies", Clubhouse "Sammy Squad Menu", Pier House "Smaller Tummies": one name each so differences are caught
    E("3 OZ BEEF BURGER", "3 oz Beef Burger (kids' meal)"),
    E("BREADED CHICKEN GOUJONS", "Breaded Chicken Goujons (kids' meal)"),
    E("BREADED FISH FINGERS", "Breaded Fish Fingers (kids' meal)"),
    E("GRILLED BUTCHER’S SAUSAGES", "Butcher’s Sausages (kids' meal)"),
    E("GRILLED QUORN SAUSAGES", "Quorn Sausages (kids' meal)"),
    E("GARDEN PEAS", "Garden Peas @ cat=Sides"), E("BAKED BEANS", "Baked Beans @ cat=Sides"), E("MINI SALAD", "Mini Salad @ cat=Sides"),
    E("CORN ON THE COB", "Corn on the Cob @ cat=Sides"),
]

TABLE = {
    "breakfast": BREAKFAST + ON_THE_RUN + SAMMY_BREAKFAST,
    "sunday": SUNDAY,
    "sweet": SWEET + DRINKS + [E("A FRESHLY BLENDED MILKSHAKE WITH TWO SCOOPS OF YOUR FAVOURITE ICE CREAM", "Milkshake (two scoops of ice cream)")],
    "venue": [
        E("SEA SALT & ROSEMARY FOCACCIA WEDGE", "Sea Salt & Rosemary Focaccia Wedge", cat="Starters & Sharers"),
        E("GREEK FRIES", "Greek Fries", cat="Loaded Fries"), E("THAI FRIES", "Thai Fries", cat="Loaded Fries"),
        E("AMERICAN FRIES", "American Fries", cat="Loaded Fries"), E("KATSU CHICKEN FRIES", "Katsu Chicken Fries", cat="Loaded Fries"),
        E("K POP KOREAN CHICKEN BITES", "K Pop Korean Chicken Bites", "K Pop Crispy Cauli Bites (vegan swap) @ expect=vg lc @ veg=1 @ meat=0", cat="Starters & Sharers"),
        E("SKIN ON FRIES", "Skin on Fries", cat="Sides"),
        E("CHEESY GARLIC FLATBREAD", "Cheesy Garlic Flatbread", cat="Starters & Sharers"),
        E("MARGHERITA FLATBREAD", "Margherita Flatbread", cat="Starters & Sharers"),
        E("6 ONION RINGS", "6 Onion Rings", cat="Sides"),
        E("POT OF KATSU CURRY SAUCE", "Pot of Katsu Curry Sauce", cat="Sides"), E("JUG OF HOMEMADE GRAVY", "Jug of Homemade Gravy", cat="Sides"),
        E("BUBBLE WAFFLE & BERRIES", "Bubble Waffle & Berries", cat="Desserts"),
    ] + KIDS_LUNCH,
    "pier": [
        E("MARGHERITA", "Margherita Pizza", cat="Pizza"), E("PEPPERONI", "Pepperoni Pizza", cat="Pizza"), E("BBQ", "BBQ Pizza", cat="Pizza"),
        E("HAWAIIAN", "Hawaiian Pizza", cat="Pizza"),
        E("THAI FRIES", "Thai Fries", cat="Loaded Fries"), E("AMERICAN FRIES", "American Fries", cat="Loaded Fries"),
        E("KATSU CHICKEN FRIES", "Katsu Chicken Fries", cat="Loaded Fries"), E("GREEK FRIES", "Greek Fries", cat="Loaded Fries"),
        E("BEER BATTERED FISH FILLET", "Beer Battered Fish Fillet", cat="Mains"), E("WHOLETAIL SCAMPI", "Wholetail Scampi", cat="Mains"),
        E("2 BATTERED BUTCHER’S SAUSAGES", "2 Battered Butcher’s Sausages", cat="Mains"),
        E("2 BATTERED QUORN SAUSAGES", "2 Battered Quorn Sausages", cat="Mains"), E("3 CHICKEN GOUJONS", "3 Chicken Goujons", cat="Mains"),
        E("BREADED FISH FINGERS", "Breaded Fish Fingers (kids' meal)", cat="Kids"), E("CHICKEN GOUJONS", "Breaded Chicken Goujons (kids' meal)", cat="Kids"),
        E("BUTCHER’S SAUSAGES", "Butcher’s Sausages (kids' meal)", cat="Kids"), E("QUORN SAUSAGES", "Quorn Sausages (kids' meal)", cat="Kids"),
        E("SIDE OF CHIPS", "Chips (side)", cat="Sides"), E("CHEESY CHIPS", "Cheesy Chips", cat="Sides"), E("6 ONION RINGS", "6 Onion Rings", cat="Sides"),
        E("CHEESY GARLIC FLATBREAD", "Cheesy Garlic Flatbread", cat="Starters & Sharers"),
        E("3 PIECES OF SCAMPI", "3 Pieces of Scampi", cat="Sides"), E("PICKLED ONION", "Pickled Onion", cat="Sides"),
        E("MUSHY PEAS", "Mushy Peas", cat="Sides"), E("BAKED BEANS", "Baked Beans", cat="Sides"), E("TARTARE SAUCE", "Tartare Sauce", cat="Sides"),
        E("GRAVY", "Jug of Homemade Gravy", cat="Sides"), E("KATSU CURRY", "Pot of Katsu Curry Sauce", cat="Sides"),
    ],
    "bay": [
        E("THE BAY’S FULL ENGLISH", "The Bay’s Full English"), E("THE VEGGIE BREAKFAST", "The Veggie Breakfast"), E("THE VEGAN BREAKFAST", "The Vegan Breakfast"),
        E("FRIED EGGS OR BAKED BEANS ON TOAST", "Fried Eggs on Toast @ expect=fried eggs @ cat=Breakfast Rolls & Toast",
          "Baked Beans on Toast @ expect=baked beans @ cat=Breakfast Rolls & Toast"),
        E("TOAST, BUTTER & PRESERVE", "Toast, Butter & Preserve @ cat=Breakfast Rolls & Toast", "Tiptree Jam (add to toast) @ expect=jam @ veg=0",
          "Marmalade (add to toast) @ expect=marmalade @ veg=0", "Nutella (add to toast) @ expect=nutella @ veg=0"),
        E("GRILLED BACK BACON RASHERS", "Back Bacon Rashers Breakfast Roll @ cat=Breakfast Rolls & Toast"),
        E("BUTCHER’S SAUSAGES", "Butcher’s Sausages Breakfast Roll @ cat=Breakfast Rolls & Toast"),
        E("VEGAN QUORN SAUSAGES", "Vegan Quorn Sausages Breakfast Roll @ cat=Breakfast Rolls & Toast"),
        E("KID’S BREAKFAST", "Kid’s Breakfast @ cat=Kids"), E("KID’S COCO POPS", "Kid’s Coco Pops @ cat=Kids"),
        X("FLAKED TUNA MELT", 2, "unlabelled roll/sandwich pair"),
        X("CORONATION CHICKEN & CRISP GEM LETTUCE", 2, "unlabelled roll/sandwich pair"),
        X("FISH FINGER, GEM LETTUCE & TARTARE SAUCE", 2, "unlabelled roll/sandwich pair"),
        X("PRAWN MARIE ROSE", 2, "unlabelled roll/sandwich pair"),
        X("GRATED CHEDDAR & TOMATO CHUTNEY", 2, "unlabelled roll/sandwich pair"),
        X("SLICED HAM, GRAIN MUSTARD & TOMATO", 2, "unlabelled roll/sandwich pair"),
        X("THE BAY B.L.T.", 2, "unlabelled roll/sandwich pair"),
        E("PLAIN WITH BUTTER", "Baked Jacket Potato, Plain with Butter"), E("BAKED BEANS & CHEDDAR CHEESE", "Baked Jacket Potato, Baked Beans & Cheddar Cheese"),
        E("FLAKED TUNA & CHEDDAR CHEESE", "Baked Jacket Potato, Flaked Tuna & Cheddar Cheese"),
        E("PRAWN MARIE ROSE", "Baked Jacket Potato, Prawn Marie Rose"), E("CORONATION CHICKEN", "Baked Jacket Potato, Coronation Chicken"),
        E("BEER BATTERED FISH & CHIPS", "Beer Battered Fish & Chips"),
        E("POT OF KATSU CURRY SAUCE", "Pot of Katsu Curry Sauce @ cat=Sides"), E("3 PIECES OF SCAMPI", "3 Pieces of Scampi @ cat=Sides"),
        E("PICKLED ONION", "Pickled Onion @ cat=Sides"), E("3 ONION RINGS", "3 Onion Rings @ cat=Sides"),
        E("WHOLETAIL SCAMPI", "Wholetail Scampi"), E("DOUBLE CHEESEBURGER", "Double Cheeseburger"), E("BUTTERMILK CHICKEN BURGER", "Buttermilk Chicken Burger"),
        E("HAM, EGG & CHIPS", "Ham, Egg & Chips with Garden Peas @ expect=garden peas", "Ham, Egg & Chips with Baked Beans @ expect=baked beans"),
        E("VEGAN QUORN SAUSAGES", "Vegan Quorn Sausages & Chips with Garden Peas @ expect=garden peas", "Vegan Quorn Sausages & Chips with Baked Beans @ expect=baked beans"),
        E("TOMATO & BASIL SOUP", "Tomato & Basil Soup"), E("OVEN BAKED BEEF LASAGNE", "Oven Baked Beef Lasagne"), E("VEGETABLE LASAGNE", "Vegetable Lasagne"),
        E("JAPANESE KATSU CURRY", "Japanese Katsu Curry"),
        E("BREADED CHICKEN MINI FILLETS", "Breaded Chicken Mini Fillets (add to Japanese Katsu Curry)"),
        E("CRISPY CAULIFLOWER BITES", "Crispy Cauliflower Bites (add to Japanese Katsu Curry)"),
        E("CHEDDAR CHEESE & CHUTNEY", "Salad topped with Cheddar Cheese & Chutney"), E("FLAKED TUNA MAYO", "Salad topped with Flaked Tuna Mayo"),
        E("CORONATION CHICKEN", "Salad topped with Coronation Chicken"), E("PRAWN MARIE ROSE", "Salad topped with Prawn Marie Rose"),
        E("CHUNKY CHIPS", "Chips (side)"), E("CHEESY CHIPS", "Cheesy Chips"), E("SIX ONION RINGS", "6 Onion Rings"), E("SIDE SALAD BOWL", "Side Salad Bowl"),
        E("GARLIC BREAD", "Garlic Bread"),
        E("3 oz BEEF BURGER", "3 oz Beef Burger (kids' meal)"), E("BEEF OR VEGGIE LASAGNE", "Beef or Veggie Lasagne (kids' meal) @ veg=0"),
        E("FISH FINGERS", "Breaded Fish Fingers (kids' meal)"), E("BUTCHER’S SAUSAGES", "Butcher’s Sausages (kids' meal)"),
        E("BREADED CHICKEN GOUJONS", "Breaded Chicken Goujons (kids' meal)"),
    ] + DRINKS + [E("A FRESHLY BLENDED MILKSHAKE WITH TWO SCOOPS OF VANILLA, STRAWBERRY OR CHOCOLATE ICE CREAM", "Milkshake (two scoops of ice cream)")],
    "restaurant": [
        E("SEA SALT & ROSEMARY FOCACCIA WEDGE", "Sea Salt & Rosemary Focaccia Wedge"),
        E("SPICED BUTTERNUT SQUASH & SWEET POTATO SOUP", "Spiced Butternut Squash & Sweet Potato Soup"),
        E("LUXURY PRAWN & CRAB COCKTAIL", "Luxury Prawn & Crab Cocktail"),
        E("K POP KOREAN CHICKEN BITES", "K Pop Korean Chicken Bites", "K Pop Crispy Cauli Bites (vegan swap) @ expect=vg lc @ veg=1 @ meat=0"),
        E("CHICKEN LIVER PÂTÉ", "Chicken Liver Pâté"), E("CHEESY GARLIC FLATBREAD", "Cheesy Garlic Flatbread"), E("MARGHERITA FLATBREAD", "Margherita Flatbread"),
    ] + MAINS_COMMON_A + [
        E("POT OF KATSU CURRY SAUCE", "Pot of Katsu Curry Sauce @ cat=Sides"), E("JUG OF HOMEMADE GRAVY", "Jug of Homemade Gravy @ cat=Sides"),
        E("3 PIECES OF SCAMPI", "3 Pieces of Scampi @ cat=Sides"), E("PICKLED ONION", "Pickled Onion @ cat=Sides"), E("3 ONION RINGS", "3 Onion Rings @ cat=Sides"),
        E("8oz STEAK BAVETTE", "8oz Steak Bavette"),
        E("VENISON BOLOGNAISE", "Venison Bolognaise", "Venison Bolognaise (smaller appetite) @ expect=sa"),
        E("BUTCHER’S SAUSAGES & MASH", "Butcher’s Sausages & Mash", "Butcher’s Sausages & Mash (smaller appetite) @ expect=sa"),
        E("CHICKEN GYROS FLATBREAD", "Chicken Gyros Flatbread"),
        E("OVEN BAKED AUBERGINE PARMIGIANA", "Oven Baked Aubergine Parmigiana", "Oven Baked Aubergine Parmigiana (smaller appetite) @ expect=sa"),
        E("JAPANESE KATSU CURRY", "Japanese Katsu Curry", "Japanese Katsu Curry (smaller appetite) @ expect=sa"),
    ] + KATSU_CHOICES + [
        E("THE HOBURNE SHEPHERD’S PIE", "The Hoburne Shepherd’s Pie", "The Hoburne Shepherd’s Pie (smaller appetite) @ expect=sa"),
        E("ABERDEEN ANGUS BACON CHEESEBURGER", "Aberdeen Angus Bacon Cheeseburger"),
        E("MISSISSIPPI STYLE HUNTERS CHICKEN BURGER", "Mississippi Style Hunters Chicken Burger"),
        E("BEETROOT, RED PEPPER & QUINOA BURGER", "Beetroot, Red Pepper & Quinoa Burger"),
    ] + BURGER_TOPPINGS + [E("3 ONION RINGS", "3 Onion Rings @ cat=Sides")] + [
        E("CALIFORNIAN COBB", "Californian Cobb", "Californian Cobb (smaller appetite) @ expect=sa"),
        E("BUDDHA BOWL", "Buddha Bowl", "Buddha Bowl (smaller appetite) @ expect=sa"),
    ] + SALAD_TOPPINGS + [
        E("SKIN ON FRIES", "Skin on Fries"), E("6 ONION RINGS", "6 Onion Rings"), E("MINI SALAD BOWL", "Mini Salad Bowl"),
        E("SMOKED GARLIC MASH", "Smoked Garlic Mash"), E("CRUSHED MINTED PEAS", "Crushed Minted Peas"), E("MOROCCAN COUS COUS", "Moroccan Cous Cous"),
        E("POT OF KATSU CURRY SAUCE", "Pot of Katsu Curry Sauce"), E("JUG OF HOMEMADE GRAVY", "Jug of Homemade Gravy"),
    ],
    "clubhouse": BREAKFAST + ON_THE_RUN + SAMMY_BREAKFAST + [
        E("FLAKED TUNA MAYO MELT", "Flaked Tuna Mayo Melt"), E("BOURBON BBQ CHICKEN MELT", "Bourbon BBQ Chicken Melt"),
        E("CORONATION CHICKEN CLUB", "Coronation Chicken Club"),
        E("CHUNKY FISH FINGER", "Chunky Fish Finger Roll", "Chunky Fish Finger Roll with Crispy Battered Tofu (vegan swap) @ expect=tofu vg @ veg=1 @ meat=0"),
        E("BREADED CHICKEN GOUJONS", "Grilled Tortilla Wrap with Breaded Chicken Goujons @ expect=goujons"),
        E("CRISPY CAULI BITES", "Grilled Tortilla Wrap with Crispy Cauli Bites @ expect=cauli bites vg"),
        E("PLAIN WITH JUST BUTTER", "Baked Jacket Potato, Plain with Just Butter"), E("CHEESY BAKED BEANS", "Baked Jacket Potato, Cheesy Baked Beans"),
        E("FLAKED TUNA MAYO & CHEDDAR CHEESE", "Baked Jacket Potato, Flaked Tuna Mayo & Cheddar Cheese"),
        E("CHEESY GARLIC FLATBREAD", "Cheesy Garlic Flatbread"), E("MARGHERITA FLATBREAD", "Margherita Flatbread"),
        E("SEA SALT & ROSEMARY FOCACCIA WEDGE", "Sea Salt & Rosemary Focaccia Wedge"),
        E("K POP KOREAN CHICKEN BITES", "K Pop Korean Chicken Bites", "K Pop Crispy Cauli Bites (vegan swap) @ expect=vg lc @ veg=1 @ meat=0"),
    ] + LOADED_FRIES + MAINS_COMMON_A + SIDE_POTS + [
        E("CHICKEN GYROS FLATBREAD", "Chicken Gyros Flatbread"),
        E("JAPANESE KATSU CURRY", "Japanese Katsu Curry", "Japanese Katsu Curry (smaller appetite) @ expect=sa"),
    ] + KATSU_CHOICES + [
        E("ABERDEEN ANGUS BACON CHEESEBURGER", "Aberdeen Angus Bacon Cheeseburger"),
        E("BEETROOT, RED PEPPER & QUINOA BURGER", "Beetroot, Red Pepper & Quinoa Burger"),
    ] + BURGER_TOPPINGS + [E("3 ONION RINGS", "3 Onion Rings @ cat=Sides")] + [
        E("CALIFORNIAN COBB", "Californian Cobb", "Californian Cobb (smaller appetite) @ expect=sa"),
        E("BUDDHA BOWL", "Buddha Bowl", "Buddha Bowl (smaller appetite) @ expect=sa"),
    ] + SALAD_TOPPINGS + [
        E("SKIN ON FRIES", "Skin on Fries"), E("6 ONION RINGS", "6 Onion Rings"), E("MINI SALAD BOWL", "Mini Salad Bowl"),
        E("POT OF KATSU CURRY SAUCE", "Pot of Katsu Curry Sauce"), E("JUG OF HOMEMADE GRAVY", "Jug of Homemade Gravy"),
    ] + SUNDAY[:4] + KIDS_LUNCH + [
        E("PASTA BOWL", "Pasta Bowl (kids' meal)"), E("LARRY’S LUNCH", "Larry’s Lunch (kids' meal)"),
        E("MACARONI CHEESE", "Macaroni Cheese (kids' meal)", "Macaroni Cheese, Go Large (kids' meal)"),
        E("BUILD YOUR OWN WRAP", "Build Your Own Wrap (kids' meal)"),
        E("BREADED CHICKEN GOUJONS", "Breaded Chicken Goujons (add to Build Your Own Wrap)"),
        E("CRISPY CAULIFLOWER BITES", "Crispy Cauliflower Bites (add to Build Your Own Wrap)"),
        E("RICH CHOCOLATE BROWNIE", "Rich Chocolate Brownie (Sammy’s Sweet Treats) @ cat=Kids"), E("BUBBLE WAFFLE", "Bubble Waffle (Sammy’s Sweet Treats) @ cat=Kids"),
    ] + SWEET + DRINKS + [E("A FRESHLY BLENDED MILKSHAKE WITH TWO SCOOPS OF YOUR FAVOURITE ICE CREAM", "Milkshake (two scoops of ice cream)")],
}

# Dishes printed with different calories on different menus: excluded, never averaged or chosen between. {name: {menu: value}}.
# The run stops if this set changes, so a new menu is re-read by a human.
EXPECTED_CONFLICTS: dict = {
    '3 Onion Rings': {'Restaurant': '177 / 177', 'Clubhouse': '117 / 177', 'The Bay': '117'},
    '6 Onion Rings': {'Restaurant': '355', 'Clubhouse': '355', 'Venue': '355', 'The Bay': '355', 'The Pier House': '354'},
    'Beer Battered Fish Fillet': {'Restaurant': '1238', 'Clubhouse': '1238', 'The Pier House': '878'},
    "Breaded Chicken Goujons (kids' meal)": {'Clubhouse': '624', 'Venue': '624', 'The Bay': '624', 'The Pier House': '658'},
    "Breaded Fish Fingers (kids' meal)": {'Clubhouse': '584', 'Venue': '584', 'The Bay': '584', 'The Pier House': '618'},
    "Butcher’s Sausages (kids' meal)": {'Clubhouse': '904', 'Venue': '904', 'The Bay': '904', 'The Pier House': '970'},
    'Cheesy Chips': {'The Bay': '968', 'The Pier House': '884'},
    'Chips (side)': {'The Bay': '782', 'The Pier House': '687'},
    'Jug of Homemade Gravy': {'Restaurant': '67 / 67', 'Clubhouse': '67 / 67', 'Venue': '67', 'The Pier House': '50'},
    'Margherita Flatbread': {'Restaurant': '715', 'Clubhouse': '715', 'Venue': '656'},
    'Pot of Katsu Curry Sauce': {'Restaurant': '228 / 228', 'Clubhouse': '228 / 228', 'Venue': '228', 'The Bay': '228', 'The Pier House': '282'},
    "Quorn Sausages (kids' meal)": {'Clubhouse': '545', 'Venue': '545', 'The Pier House': '579'},
    'Wholetail Scampi': {'The Bay': '867', 'The Pier House': '634'},
}
PROCESS_ORDER = ["restaurant", "clubhouse", "breakfast", "sunday", "sweet", "venue", "bay", "pier"]


def parse_item(text: str):
    parts = [p.strip() for p in text.split(" @ ")]
    opts = {}
    for p in parts[1:]:
        k, v = p.split("=", 1)
        opts[k.strip()] = v.strip()
    return parts[0], opts


def norm(s: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9+ ]", " ", s.lower()).split())


def seg_key(seg: dict) -> str:
    h = re.sub(r"\([^)]*\)", " ", seg["heading"])
    h = re.sub(r"\+?\d[\d,]*\s?kca\s?l", " ", h, flags=re.I)
    h = pdf_reader.PRICE.sub(" ", h)
    h = re.sub(r"\b(v|vg|vgo|lc|gfi|sa|from|or)\b,?", " ", h)
    h = h.replace("/", " ").replace("|", " ")
    h = re.sub(r"\bGo Large\b", " ", h)
    return " ".join(h.split())


def plain_kcal_count(pdf: Path) -> int:
    text = subprocess.run(["pdftotext", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return len(re.findall(r"(?<![A-Za-z])\+?\d[\d,]*\s?kca\s?l\b", text, re.I))


def read_all(folder: Path) -> dict:
    out = {}
    for key, fname in MENU_FILES.items():
        path = folder / fname
        if not path.exists():
            raise SystemExit(f"Missing {path}: download the eight menu PDFs (see this script's docstring)")
        segs, stats = pdf_reader.read_menu(path)
        counted = sum(len(s["tokens"]) for s in segs) + stats["footer"] + stats["per100"]
        independent = plain_kcal_count(path)
        if not (counted == stats["kcal_words"] == independent):
            raise SystemExit(f"{fname}: calorie words: in segments+footer+per-100ml {counted}, line count {stats['kcal_words']}, "
                             f"plain-text count {independent}: the reader is missing or double counting a value")
        out[key] = [s for s in segs if s["tokens"]]
        print(f"{MENU_LABEL[key]:15s} {len(out[key]):3d} dish headings, {sum(len(s['tokens']) for s in out[key]):3d} calorie values "
              f"(+{stats['footer']} daily-need footer, {stats['per100']} per-100ml milk)  sha256 {sha256_file(path)[:16]}")
    return out


def build_records(menus: dict) -> tuple:
    records, excluded, problems = [], [], []
    for mk in PROCESS_ORDER:
        segs, entries = menus[mk], TABLE[mk]
        keys_seen = [seg_key(s) for s in segs]
        keys_table = [e[1] for e in entries]
        if keys_seen != keys_table:
            sm = difflib.SequenceMatcher(a=keys_table, b=keys_seen, autojunk=False)
            for op, a0, a1, b0, b1 in sm.get_opcodes():
                if op != "equal":
                    problems.append(f"{mk}: table {keys_table[a0:a1]} vs printed {keys_seen[b0:b1]} (printed at table position {a0})")
            continue
        for seg, entry in zip(segs, entries):
            if entry[0] == "X":
                if len(seg["tokens"]) != entry[2]:
                    problems.append(f"{mk}: {entry[1]!r}: {len(seg['tokens'])} values, table says {entry[2]}")
                excluded.append((MENU_LABEL[mk], entry[1], entry[3], [t["value"] for t in seg["tokens"]]))
                continue
            _, key, items, cat = entry
            if len(items) != len(seg["tokens"]):
                problems.append(f"{mk}: {key!r}: {len(seg['tokens'])} calorie values printed, {len(items)} items in the table")
                continue
            for tok, item in zip(seg["tokens"], items):
                name, opts = parse_item(item)
                before = norm(tok["before"])
                if "expect" in opts and f" {norm(opts['expect'])} " not in f" {before} ":
                    problems.append(f"{mk}: {name!r}: expected {opts['expect']!r} before the value {tok['value']} but the page reads {tok['before']!r}")
                category = opts.get("cat") or cat or ("Add-ons" if tok["plus"] else SECTION_CATEGORY.get(seg["section"]))
                if category not in CATEGORY_ORDER:
                    problems.append(f"{mk}: {name!r}: category {category!r} (section {seg['section']!r}) is not in CATEGORY_ORDER")
                veg = bool({"v", "vg"} & set(seg["marks"])) if "veg" not in opts else opts["veg"] == "1"
                basis = name if opts.get("meat") == "0" else " ".join([name, seg["heading"], seg["desc"]])
                basis = re.sub(r"quorn\s+sausages?", " ", basis, flags=re.I)
                pork, beef = bool(PORK.search(basis)), bool(BEEF.search(basis))
                tags = (["vegetarian"] if veg else []) + (["contains_pork"] if pork else []) + (["contains_beef"] if beef else [])
                if veg and (pork or beef):
                    problems.append(f"{mk}: {name!r} is marked vegetarian but its text names meat")
                records.append(dict(name=name, menu=mk, value=tok["value"], category=category, tags=tags, serving=opts.get("serving", ""),
                                    plus=tok["plus"], stated=not (pork or beef or veg) and bool(NOT_STATED.search(basis)), section=seg["section"]))
    if problems:
        raise SystemExit("The menus differ from TABLE:\n  " + "\n  ".join(problems))
    return records, excluded


def merge(records: list) -> tuple:
    groups: dict = {}
    for r in records:
        groups.setdefault(r["name"], []).append(r)
    published, conflicts = [], {}
    for name, rs in groups.items():
        values = {r["value"] for r in rs}
        if len(values) > 1:
            shown: dict = {}
            for r in rs:  # one entry per menu; a menu that prints the dish twice shows both values ("117 / 177")
                shown.setdefault(MENU_LABEL[r["menu"]], []).append(r["value"])
            conflicts[name] = {m: " / ".join(v) for m, v in shown.items()}
            continue
        # a mark printed on any menu counts (the Pier House marks its baked beans vg, the Venue's kids' side line carries no mark)
        union = [t for t in ("vegetarian", "contains_pork", "contains_beef") if any(t in r["tags"] for r in rs)]
        if "vegetarian" in union and len(union) > 1:
            raise SystemExit(f"{name!r}: marked vegetarian on one menu but names meat on another: {union}")
        first = dict(rs[0], tags=union)
        menus = []
        for r in rs:
            if MENU_LABEL[r["menu"]] not in menus:
                menus.append(MENU_LABEL[r["menu"]])
        published.append(dict(name=name, category=first["category"], calories=first["value"], serving=first["serving"], tags="|".join(first["tags"]),
                              rankable=False, stated=first["stated"],
                              notes=f"Printed on: {', '.join(menus)}" + ("; printed as +NNNkcal, the add-on's own calories" if first["plus"] else "")))
    return published, conflicts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path, help="folder with the eight menu PDFs (and the allergen sheets)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    menus = read_all(args.folder)
    for f in ALLERGEN_FILES:
        if (args.folder / f).exists():
            print(f"allergen sheet {f}  sha256 {sha256_file(args.folder / f)}")
    records, excluded = build_records(menus)
    published, conflicts = merge(records)
    if conflicts != EXPECTED_CONFLICTS:
        lines = "\n".join(f"    {n!r}: {v!r}," for n, v in sorted(conflicts.items()))
        raise SystemExit("Dishes printed with different calories on different menus changed. Review them, then paste this into "
                         f"EXPECTED_CONFLICTS:\n{{\n{lines}\n}}")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    published.sort(key=lambda it: order[it["category"]])  # stable: keeps first-seen order inside a category
    items = [dict(name=p["name"], category=p["category"], calories=p["calories"], serving=p["serving"], tags=p["tags"], rankable=False,
                  notes=p["notes"], id=("chicken-liver-pate" if p["name"] == "Chicken Liver Pâté" else None)) for p in published]
    for it in items:
        if it["id"] is None:
            del it["id"]
    guide = {"title": GUIDE_TITLE, "url": GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Hoburne Holidays", cuisine="Holiday park restaurant", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    cats = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print(f"calorie values read: {len(records)}; excluded as unlabelled pairs: {sum(len(x[3]) for x in excluded)} values in {len(excluded)} dishes")
    print(f"printed with different calories on different menus (excluded): {len(conflicts)} dishes")
    for n, v in sorted(conflicts.items()):
        print(f"    {n}: {v}")
    stated = [p["name"] for p in published if p["stated"]]
    print(f"meat type not stated ({len(stated)}): " + "; ".join(stated))


if __name__ == "__main__":
    main()
