#!/usr/bin/env python3
"""Build data/source/leonardo-hotels/ from the menu PDFs Leonardo Hotels links on its UK hotels' restaurant pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/leonardo_hotels.py CACHE_DIR --fetch                      # download the pages and PDFs politely
    python3 tools/uk_extract/leonardo_hotels.py CACHE_DIR --checked-on 2026-10-10 [--out DIR] [--ocr-check] [--clash-check]

Source: each hotel's restaurant page, e.g. https://www.leonardohotels.co.uk/leeds/leonardo-hotel-leeds/restaurants (the old address leonardo-hotels.co.uk
redirects to leonardohotels.co.uk; the same pages exist on www.leonardo-hotels.com, whose sitemap lists the 41 Great Britain and Northern Ireland hotel
pages in PAGES below), links its menus as PDFs on https://media.leonardo-hotels.com/static.leonardo-hotels.com/image/<32 hex>_<name>.pdf (Bar & Grill main
and lunch menus, Leo's menus, kids menus, room service ...). robots.txt on both hosts (checked with robots_rfc.py): www has `User-agent: * / Allow: / /
Disallow: /booking`, media has `User-agent: * / Disallow:` (nothing). One request per 1.1 seconds, a browser User-Agent, 41 pages and 38 PDFs, once each.
All 41 hotel pages were read; the Belfast hotel (Northern Ireland) links no menu with calories, so no hotel outside Great Britain is counted.

Nutrition: every dish prints calories only ("NNN kcal" beside the dish); protein, carbs and fat are never printed, so they stay blank (docs/DATA.md
"Calories-only chains"; every item is then not rankable). Allergens: none (every menu says to ask a member of the team; the restaurant pages publish no
allergen table or guide).

The ten published menu files (ID_* below; the SHA-256 of each is in FILES and is checked on every run):
  * Leo's menus (text layer, read by the script with pdftotext): LEOS FULL MENU SEPT 2026, LEOS LIGHT MENU SEPT 2026, LEO'S SET MENU SEPT 2026, LEO'S DESSERT
    MENU SEPT 2026, LEONARDO ROOM SERVICE MENU SEPT 2026 (all created 22-24 Sep 2026). Every printed kcal line must be in DISHES or the script stops.
  * Bar & Grill at Leonardo's: LEONARDO BAR & GRILL MAIN MENU - MAIN ESTATE EMAIL and ... LUNCH MENU - MAIN ESTATE EMAIL, LEONARDO HOTELS CLASSICS MENU EMAIL
    (all created 17 Jun 2026), and the two children's menus LEONARDO KIDS MENU (22 Nov 2024) and LEONARDO ROYAL KIDS MENU OCT 2025 (Leo's kids menu) are
    PICTURES: the text is outlined (no text layer), so these are the files where the numbers are typed into BG_ROWS / KIDS_ROWS below after being READ (the
    cluckd.py pattern; allowed only because every number was confirmed by a second method):
      1. read by eye from enlargements of each page (150 dpi pages; 500-600 dpi crops of the kids menus and of every line OCR could not confirm);
      2. confirmed with tesseract OCR at 300 and 400 dpi (`--ocr-check`: kids menu white text turned black first): a number is accepted only when OCR reads the
         same digits on that dish's line in at least one of the passes (OCR often reads 5 as s, drops a digit or glues the price on; 152 of 159 typed dish lines
         were confirmed, the 7 it could not were settled by eye on 500-600 dpi crops and each read 501, 518, 116, 580, 405, 631, 409 as typed: Crispy halloumi
         fries, Twice cooked pork belly bites, Tarragon cream sauce, Spinach and oat wrap, kids Cheesy garlic bread slices, kids Classic cheeseburger, Leo's kids
         Choco Brownie Delight). Single OCR passes misread Beef lasagne (245; printed 845), kids Fried chicken strips (723; printed 733) and kids Classic cheese
         and tomato pizza (222; printed 232): the by-eye reading was used, and the later two-resolution OCR agrees;
      3. other files of the chain print the same dishes: Heathrow's own Bar & Grill main and lunch menus (looked at by eye on the page images) print the same calories
         for every dish they share with the Main Estate files, the Classics room service menu the same as the Classics menu, Hinckley Island's Triumph & Piazza
         menu the same as the Lunch menu (except Tuna Niçoise salad, see the clash rule below), and the Main, Lunch and Classics menus agree with each other for
         every dish they share (the file letters in BG_ROWS say which menu prints which dish).
    Because these files are pictures the script cannot re-read them: it STOPS if one's SHA-256 is not the one the table was checked against, so a human
    re-reads every number (and re-runs `--ocr-check`) when Leonardo publishes a new file.

Sites. Leonardo has one menu per brand, shared by many hotels: each menu file is linked from several hotels' restaurant pages (hotels_for() counts the hotels
that link the file, or another file with identical bytes: "Children's Menu.pdf" at Hinckley Island is the same file as LEONARDO KIDS MENU). Hotels linking each
published file: Main 17, Lunch 17, Classics 5, Kids 21, Leo's kids 8, Leo's full 6, light 4, set 7, dessert 6, room service Sept 2026 9; 32 hotels link at
least one. A dish is published only when the file(s) that print it are linked from 2 or more hotels, and:
  1. every file that prints the dish prints the same calories (the script stops otherwise);
  2. no other dish of the published menus with the same NAME (compared without dietary marks, "&"/"and", case and plurals) is printed with other calories on a
     different published file: a name printed with two values is left out (CLASH lines in the output, listed in the report), and a name that contains another
     dish's name (two words or more) with other calories is left out too unless it is in SAME_NAME_OK, where the two dishes were judged by eye to be different
     dishes (reason written there);
  3. the other menus of the chain that print calories (Heathrow's Bar & Grill main and lunch, Hinckley Island's main, Triumph & Piazza and dessert menus,
     Bradford's room service menu, the March 2026 Leo's and Classics room service menus, the Oxford bottomless brunch, the Dilly terrace menu, The Cardinal and the
     Midland's LL menu) were searched for each published dish's name (`--clash-check`: pdftotext, or tesseract for the picture ones) and every difference looked at
     on the page image: a dish whose name those menus print with other calories is left out (OTHER_MENU_CLASH, with the figure and the menu).

What is and is not listed: every dish line that prints one "NNN kcal" figure. Not listed: the Arran ice cream flavours (printed per scoop, you choose the
flavours), drinks (no calories printed), and the dishes left out by the rules above. The single-hotel menus above (and Belfast, Dilly, Madhu's, afternoon tea
and brunch menus) are used only to look for clashes.
Tags: vegetarian where the printed line carries (v) or (pb) (plant based); contains_pork / contains_beef where the dish name or the printed description says
bacon, ham, sausage, salami, pancetta, pepperoni, speck, gammon / beef, steak (not swordfish or gammon steak), ribeye, sirloin, bavette, lasagne. "Beef
tomato" is not beef. Everything else is "meat type not stated".
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "leonardo-hotels"
HOST = "www.leonardohotels.co.uk"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
SOURCE_URL = f"{BASE}/united-kingdom"
SOURCE_TITLE = ("Leonardo Hotels UK restaurant menus with calories (Bar & Grill at Leonardo's, Leo's, children's and room service menus; PDFs linked "
                "from each hotel's restaurant page, files dated November 2024 to September 2026)")
ALIASES = ["leonardo hotels", "leonardo hotel", "leonardo royal hotel", "leonardo royal", "leonardo inn", "leonardo boutique hotel",
           "bar and grill at leonardo's", "leo's restaurant", "leos bar and grill"]
NOTE = ("Calories only, per dish as printed on Leonardo's menus; protein, carbs, fat and allergens are not published. Leonardo has one menu per brand "
        "shared by many hotels; only dishes on a menu linked from 2 or more of the 40 hotels read are listed, and names printed with two different "
        "values are left out.")
MIN_ITEMS = 25
NI_HOTELS = {"belfast__leonardo-hotel-belfast"}

# 41 Great Britain + Northern Ireland hotel restaurant pages: https://<host>/<city>/<hotel>/restaurants (from the sitemap of www.leonardo-hotels.com)
PAGES = """manchester/the-rex east-midlands/leonardo-hotel-east-midlands-airport edinburgh/leonardo-hotel-edinburgh-murrayfield
perth/leonardo-boutique-hotel-huntingtower-perth hinckley/leonardo-hotel-and-conference-venue-hinckley-island belfast/leonardo-hotel-belfast
bradford/leonardo-hotel-bradford brighton/leonardo-hotel-brighton cardiff/leonardo-hotel-cardiff derby/leonardo-hotel-derby
edinburgh/leonardo-hotel-edinburgh-city edinburgh/leonardo-hotel-edinburgh-haymarket exeter/leonardo-hotel-exeter leeds/leonardo-hotel-leeds
liverpool/leonardo-hotel-liverpool london/leonardo-hotel-london-aldgate london/leonardo-hotel-london-croydon
london/leonardo-hotel-london-heathrow-airport london/leonardo-hotel-london-watford manchester/leonardo-hotel-manchester-central
manchester/leonardo-hotel-manchester-piccadilly milton-keynes/leonardo-hotel-milton-keynes newcastle/leonardo-hotel-newcastle
newcastle/leonardo-hotel-newcastle-quayside nottingham/leonardo-hotel-nottingham plymouth/leonardo-hotel-plymouth sheffield/leonardo-hotel-sheffield
southampton/leonardo-hotel-southampton glasgow/leonardo-inn-hotel-glasgow-west-end birmingham/leonardo-royal-hotel-birmingham
brighton/leonardo-royal-hotel-brighton-waterfront edinburgh/leonardo-royal-hotel-edinburgh glasgow/leonardo-royal-hotel-glasgow
london/leonardo-royal-hotel-london-city london/leonardo-royal-hotel-london-st-pauls london/leonardo-royal-hotel-london-tower-bridge
oxford/leonardo-royal-hotel-oxford southampton/leonardo-royal-hotel-southampton-grand-harbour london/the-dilly brighton/the-grand-brighton
manchester/the-midland""".split()

# ------------------------------------------------------------------------------------------------------------- the ten published files
ID_MAIN = "e412b2daee2d2c327d801ecef23e2077"     # LEONARDO BAR & GRILL MAIN MENU - MAIN ESTATE EMAIL (2 pages, picture, created 17 Jun 2026)
ID_LUNCH = "6a0969ae19a6f7e62e2501ba1677022c"    # LEONARDO BAR & GRILL LUNCH MENU - MAIN ESTATE EMAIL (picture, 17 Jun 2026)
ID_CLASSICS = "58bcdd514f0dec41d062ecf6a632eb2a"  # LEONARDO HOTELS CLASSICS MENU EMAIL (picture, 17 Jun 2026)
ID_KIDS = "f0998b3aa8e1b7f379e777674a805d11"     # LEONARDO KIDS MENU (picture, 22 Nov 2024)
ID_RKIDS = "20837314211203b058c23a61b07e9877"    # LEONARDO ROYAL KIDS MENU OCT 2025 (Leo's kids menu, picture, 16 Oct 2025)
ID_FULL = "b36543bc9d20c93bdc56e1c2ee04dbfa"     # LEOS FULL MENU SEPT 2026 (text, 24 Sep 2026)
ID_LIGHT = "7cc619756313219bd7c5a7b7941e965c"    # LEONARDO LEOS LIGHT MENU SEPT 2026
ID_ROOM = "47fa493e66ed6df1280e72b96f74fbe0"     # LEONARDO ROOM SERVICE MENU SEPT 2026
ID_SET = "ae1362674339a19e46653fcdee65caaa"      # LEO'S SET MENU SEPT 2026
ID_DESSERT = "9d5763b5920345fc072a94d887624d4c"  # LEO'S DESSERT MENU SEPT 2026
FILES = {  # id -> (short name, SHA-256 the table was checked against)
    ID_MAIN: ("Bar & Grill main menu (Main Estate)", "d445f3cae8aed566dc0d27debc940793221c0ece60424b85914a325ede0d633f"),
    ID_LUNCH: ("Bar & Grill lunch menu (Main Estate)", "e1b468573cb6db44a6d36462fcd27299ec66a568e466078405237595d6c9579d"),
    ID_CLASSICS: ("Bar & Grill Classics menu", "068b4bb778a315d556794fff3aad10ee576f8e856251a451c0253933402ba1ab"),
    ID_KIDS: ("Leonardo kids menu", "0b7531b3befb6919d758c00461d65373857b70d7f52eb26db8223acae937212d"),
    ID_RKIDS: ("Leo's kids menu (Royal)", "84f20233341af0bf8528209195bd6e79d51dad89427ee765bc8dad7cb30b830a"),
    ID_FULL: ("Leo's full menu", "48c69520e51a4cbaf005825e045e9d93252fad6b5c0416b36ea6d9dafd8ed46e"),
    ID_LIGHT: ("Leo's light menu", "853aa513b38653dd369c23f3ef3aadfaa1505887b4b10a72e5f04d06e52e453f"),
    ID_ROOM: ("Room service menu (Sept 2026)", "87e912b9fa329720b98618471045e7c1515db64192fb6f1ee7c474ffd551a10d"),
    ID_SET: ("Leo's set menu", "26341f64efcaff83363acad29235351b8ae188783923dea663a9adb0452eb175"),
    ID_DESSERT: ("Leo's dessert menu", "a01fccb2d67b95c309caae8c83b81484b240c7e0f35469dcc002ee5b39911b0a"),
}
TEXT_FILES = [ID_FULL, ID_LIGHT, ID_ROOM, ID_SET, ID_DESSERT]
LETTER = {"M": ID_MAIN, "L": ID_LUNCH, "C": ID_CLASSICS, "K": ID_KIDS, "R": ID_RKIDS}
# files in the pictures' typed tables: page numbers to OCR for --ocr-check
EXCLUDE = re.compile(r"drink|wine|margarita|esg_|gds|bottle|festive|new.?year|christmas|boxing", re.I)

SUP = {"Starters": "Starters & sharing", "Salads": "Salads", "Grills": "Grills", "Burgers": "Burgers", "Mains": "Mains", "Pizza": "Pizza & pasta",
       "Deli": "Sandwiches & deli", "Sides": "Sides", "Desserts": "Desserts", "Extras": "Sauces & extras", "Kids": "Kids menu"}
ST, SA, GR, BU, MA, PP, DE, SI, DS, EX, KI = (SUP[k] for k in ("Starters", "Salads", "Grills", "Burgers", "Mains", "Pizza", "Deli", "Sides", "Desserts",
                                                                "Extras", "Kids"))
CATEGORY_ORDER = [ST, SA, GR, MA, BU, PP, DE, SI, DS, EX, KI]

# ------------------------------------------------------------------------------------------------------------- typed tables (pictures)
PORK_T, BEEF_T = "pork", "beef"


def R(files, cat, name, kcal, marks="", meat=(), size="", base=None, printed=""):
    """One dish line of a picture menu. files: letters M L C K R (which pictures print it with this value); marks: printed (v) (pb) (gf) as
    'v pb gf'; meat: 'pork' / 'beef' where the printed name or description says so; size: 'Small' / 'Large' where the line prints both."""
    return dict(files=[LETTER[c] for c in files], cat=cat, name=name, kcal=str(kcal), marks=marks.split(), meat=list(meat), size=size,
                base=base or name, printed=printed or name)


BG_ROWS = [
    # Small and sharing / Small bites
    R("ML", ST, "Warm flatbreads", 567, "v"),
    R("MLC", ST, "Sticky glazed chicken wings", 332, "gf"),
    R("ML", ST, "Frickles", 572, "pb"),
    R("MLC", ST, "Crispy squid", 428),
    R("MLC", ST, "Today's soup", 265, "v"),
    R("M", ST, "Crispy halloumi fries", 501, "v"),
    R("M", ST, "Baked Camembert", 738, "v"),
    R("M", ST, "Twice cooked pork belly bites", 518, meat=[PORK_T]),
    R("ML", ST, "Rosemary roasted beetroot", 447, "v gf"),
    # Leaves and grains (two sizes, each labelled Small / Large on the menu)
    R("MLC", SA, "Classic Caesar salad (small)", 206, size="Small", base="Classic Caesar salad"),
    R("MLC", SA, "Classic Caesar salad (large)", 573, size="Large", base="Classic Caesar salad"),
    R("MLC", SA, "Avocado, soya bean and black rice salad (small)", 396, "gf pb", size="Small", base="Avocado, soya bean and black rice salad"),
    R("MLC", SA, "Avocado, soya bean and black rice salad (large)", 764, "gf pb", size="Large", base="Avocado, soya bean and black rice salad"),
    R("ML", SA, "Tuna Niçoise salad (small)", 227, "gf", size="Small", base="Tuna Niçoise salad"),
    R("ML", SA, "Tuna Niçoise salad (large)", 338, "gf", size="Large", base="Tuna Niçoise salad"),
    R("MLC", EX, "4oz grilled chicken (add to a salad or pasta)", 215, "gf", base="4oz grilled chicken"),
    R("MLC", EX, "4oz grilled salmon (add to a salad or pasta)", 252, "gf", base="4oz grilled salmon"),
    # The grill
    R("M", GR, "8oz ribeye steak", 1275, "gf", [BEEF_T]),
    R("M", GR, "Rosemary and garlic marinated chicken breast", 1163, "gf"),
    R("MC", GR, "8oz Gammon steak", 1210, "gf", [PORK_T]),
    R("MC", GR, "Grilled fillet of salmon", 1086, "gf"),
    R("MC", GR, "Steak frites", 691, meat=[BEEF_T]),
    R("MC", EX, "Peppercorn sauce", 125, "gf", printed="Peppercorn"),
    R("MC", EX, "Béarnaise sauce", 167, "gf", printed="Béarnaise"),
    R("MC", EX, "Tarragon cream sauce", 116, "gf"),
    R("MC", EX, "Chimichurri sauce", 250, "gf pb", printed="Chimichurri"),
    # Burgers
    R("M", BU, "Classic cheeseburger", 1196, meat=[BEEF_T]),
    R("MC", BU, "BBQ beef burger", 1396, meat=[BEEF_T, PORK_T]),
    R("M", BU, "Peppered beef burger", 1620, meat=[BEEF_T]),
    R("MC", BU, "Buttermilk fried chicken burger", 1041),
    R("MC", BU, "Spinach and oat burger", 1153, "pb"),
    R("M", EX, "Crispy bacon (burger topping)", 154, "gf", [PORK_T], base="Crispy bacon"),
    R("M", EX, "Fried hen's egg (burger topping)", 190, "gf", base="Fried hen's egg"),
    R("M", EX, "Extra patty (burger topping)", 535, "gf", base="Extra patty"),
    # High street favourites
    R("MC", MA, "Non-alcoholic beer battered fish & chips", 1248),
    R("M", MA, "Steak and ale pie", 1154, meat=[BEEF_T]),
    R("MC", MA, "Chicken Rogan Josh", 1018),
    R("M", MA, "Cumberland sausage ring", 830, meat=[PORK_T]),
    R("M", MA, "Smoked haddock fishcake", 503),
    R("M", MA, "Moroccan roasted cauliflower", 577, "gf pb"),
    # Pizza and pasta
    R("MLC", PP, "Rustic di Lusso pizza", 930, "v"),
    R("ML", PP, "The Garden Club pizza", 952, "v"),
    R("MLC", PP, "Pepperoni Piccante pizza", 1129, meat=[PORK_T]),
    R("MLC", PP, "BBQ chicken pizza", 1105, meat=[PORK_T]),
    R("MLC", PP, "Spaghetti Puttanesca", 474),
    R("ML", PP, "Spinach and ricotta tortelloni", 1002, "v"),
    R("MLC", PP, "Beef lasagne", 845, meat=[BEEF_T]),
    # Deli favourites
    R("ML", DE, "Crispy buttermilk chicken", 961),
    R("MLC", DE, "Grilled steak", 1052, meat=[BEEF_T]),
    R("ML", DE, "Leonardo club sandwich", 1053, meat=[PORK_T]),
    R("MLC", DE, "Classic tuna mayonnaise and cucumber", 566),
    R("ML", DE, "Spinach and oat wrap", 580, "v"),
    R("MLC", DE, "Classic Ploughman's", 661, meat=[PORK_T]),
    R("ML", DE, "Beetroot Borani and feta", 580, "v"),
    # On the side
    R("MLC", SI, "Steamed green vegetables", 116, "gf v"),
    R("MLC", SI, "Rocket leaves", 248, "gf"),
    R("ML", SI, "Non-alcoholic beer battered onion rings", 456, "v"),
    R("MLC", SI, "Skinny fries or chunky chips", 282, "pb"),
    R("ML", SI, "Sweet potato fries", 282, "pb"),
    R("M", SI, "Mashed potato", 305, "gf v"),
    R("M", SI, "Spiced corn wedges", 658, "gf v"),
    R("MC", SI, "Garlic bread", 578, "v"),
    # Sweet treats
    R("MLC", DS, "Sticky toffee pudding", 601, "gf v"),
    R("MLC", DS, "Baked chocolate chip cookie dough", 460, "v"),
    R("M", DS, "Filled choux buns", 500, "v"),
    R("M", DS, "Chocolate mousse", 203, "pb"),
    R("ML", DS, "Lotus Biscoff cheesecake", 610, "v"),
]
KIDS_ROWS = [
    R("K", KI, "Cheesy garlic bread slices", 405, "v"),
    R("K", KI, "Wings", 357),
    R("K", KI, "Today's soup", 105, "v"),
    R("K", KI, "Classic cheeseburger", 631, meat=[BEEF_T]),
    R("K", KI, "Fried chicken strips", 733),
    R("K", KI, "Rigatoni pasta", 285, "v"),
    R("K", KI, "Classic cheese and tomato pizza", 232, "v"),
    R("K", KI, "Sticky toffee pudding", 235, "v gf"),
    R("K", KI, "Arran ice cream", 246, "v", printed="Arran ice cream (two flavours)"),
    R("K", KI, "Fresh fruit salad", 27, "v gf"),
    R("R", KI, "Crunchy Veggie Sticks", 218, "v"),
    R("R", KI, "Cheesy Dough Ball Pops", 205),
    R("R", KI, "Magic Veggie Soup", 113, "v"),
    R("R", KI, "Chicken & Taters", 278),
    R("R", KI, "Crunchy Fish Fingers", 454),
    R("R", KI, "Pasta Party", 180, "v"),
    R("R", KI, "Mini Burger & Fries", 622, meat=[BEEF_T]),
    R("R", KI, "Cheesy Pizza Slice", 278, "v"),
    R("R", KI, "Sticky Toffee Pud", 235),
    R("R", KI, "Scoopalicious Ice Cream", 284),
    R("R", KI, "Choco Brownie Delight", 409),
]
IMAGE_ROWS = BG_ROWS + KIDS_ROWS

# ------------------------------------------------------------------------------------------------------------- text menus (Leo's)
# (start of the printed text, display name, category). The printed text is "dish, description (v) NNNkcal": a dish is published when
# one of these starts matches; any printed kcal line in the five Leo's files that matches none stops the script.
DISHES = [
    ("Rosemary and beetroot hummus", "Rosemary and beetroot hummus", ST),
    ("Butternut squash and chestnut soup", "Butternut squash and chestnut soup", ST),
    ("Tiger prawn cocktail", "Tiger prawn cocktail", ST),
    ("Stornoway black pudding and apple croquette", "Stornoway black pudding and apple croquette", ST),
    ("Smoked venison", "Smoked venison", ST),
    ("Baked camembert", "Baked camembert, pickled pear and watercress salad", ST),
    ("Smoked mackerel", "Smoked mackerel", ST),
    ("Grilled swordfish steak", "Grilled swordfish steak", GR),
    ("225g grilled Sirloin", "225g grilled Sirloin", GR),
    ("250g grilled Rib eye", "250g grilled Rib eye", GR),
    ("145g Bavette steak frites", "145g Bavette steak frites", GR),
    ("Peppercorn 4.00", "Peppercorn sauce", EX),
    ("Blue cheese 4.00", "Blue cheese sauce", EX),
    ("Béarnaise 4.00", "Béarnaise sauce", EX),
    ("Chimichurri 4.00", "Chimichurri sauce", EX),
    ("Two fried eggs 4.00", "Two fried eggs", EX),
    ("Battered onion rings 3.00", "Battered onion rings (grill extra)", EX),
    ("Café de Paris butter", "Café de Paris butter", EX),
    ("Classic battered fish and chips", "Classic battered fish and chips", MA),
    ("Malbec braised shin of beef stew", "Malbec braised shin of beef stew", MA),
    ("Katsu curry", "Katsu curry", MA),
    ("Roasted celeriac fondant", "Roasted celeriac fondant", MA),
    ("Mushroom and truffle ravioli", "Mushroom and truffle ravioli", MA),
    ("Stonebaked margherita pizza", "Stonebaked margherita pizza", PP),
    ("British Wagyu beef burger", "British Wagyu beef burger", BU),
    ("Crispy chicken burger", "Crispy chicken burger", BU),
    ("Spinach and oat burger", "Spinach and oat burger", BU),
    ("Crispy pancetta 3.00", "Crispy pancetta (burger topping)", EX),
    ("Grilled Gruyere 3.50", "Grilled Gruyere (burger topping)", EX),
    ("Peppercorn sauce 4.00", "Peppercorn sauce", EX),
    ("Extra beef patty", "Extra beef patty (burger topping)", EX),
    ("Grilled chicken 5.50", "Grilled chicken (extra)", EX),
    ("Crispy breaded chicken 5.50", "Crispy breaded chicken (extra)", EX),
    ("Grilled swordfish 8.50", "Grilled swordfish (extra)", EX),
    ("Filled Scrocchiarella bread, Milano salami", "Filled Scrocchiarella bread, Milano salami", DE),
    ("Filled Scrocchiarella bread, beetroot and rosemary hummus", "Filled Scrocchiarella bread, beetroot and rosemary hummus", DE),
    ("Filled Scrocchiarella bread, chicken and bacon mayonnaise", "Filled Scrocchiarella bread, chicken and bacon mayonnaise", DE),
    ("Filled Scrocchiarella bread, tiger prawn", "Filled Scrocchiarella bread, tiger prawn", DE),
    ("Leo’s club sandwich", "Leo's club sandwich", DE),
    ("Caesar salad, smoked pancetta", "Caesar salad, smoked pancetta lardons", SA),
    ("Poke bowl", "Poke bowl", SA),
    ("Truffled skinny fries", "Truffled skinny fries", SI),
    ("Skinny fries (pb)", "Skinny fries", SI),
    ("Sweet potato fries", "Sweet potato fries", SI),
    ("Mashed potatoes", "Mashed potatoes", SI),
    ("Honey and wholegrain mustard roasted beetroot", "Honey and wholegrain mustard roasted beetroot", SI),
    ("Wilted seasonal greens", "Wilted seasonal greens", SI),
    ("Camden Hells beer-battered onion rings", "Camden Hells beer-battered onion rings", SI),
    ("Creamed spinach", "Creamed spinach", SI),
    ("Classic Caesar salad", "Classic Caesar salad (side)", SI),
    ("Hot chocolate fondant", "Hot chocolate fondant", DS),
    ("Mango Charlotte", "Mango Charlotte", DS),
    ("White chocolate and raspberry cheesecake", "White chocolate and raspberry cheesecake", DS),
    ("Warm treacle tart", "Warm treacle tart", DS),
    ("Selection of Isle of Arran ice creams", "Selection of Isle of Arran ice creams and sorbets", DS),
    ("Artisan cheese", "Artisan cheese, walnuts, fruit chutney", DS),
]
# text-layer dishes whose printed words say pork or beef (the regex below would also fire on "beef tomato" or "swordfish steak": handled there)
KCAL = re.compile(r"(\d{2,4})\s*kcal", re.I)
HEADERS = re.compile(r"^(starters|grills|mains|salads|sandwiches( & salads)?|burgers|sides|desserts|extras|leo.s specials|toppings for your burger|"
                     r"sauces and extras( for your grills)?|room service|available .*|all our grills are served.*|additional toppings.*|"
                     r"choose 3 toppings.*|3 courses .*|\d+\.\d\d|prices include.*|all our steaks.*|food allergies.*|dishes may contain.*|"
                     r"\(v\) suitable.*|adults need.*|please ask your server.*|a delivery charge.*|a discretionary.*|team for information.*|all weights.*)$",
                     re.I)

# pairs of display names judged by eye to be DIFFERENT dishes although one contains the other (or they are equal): published as they are.
# (nothing is here unless the printed descriptions show different dishes; see the output's CLASH lines)
SAME_NAME_OK: dict[frozenset, str] = {
    frozenset(("Steak frites", "145g Bavette steak frites")): "different dishes: a classic chargrilled steak with skinny fries, rocket and Parmesan salad "
                                                               "(Bar & Grill) and a 145g bavette with Café de Paris butter (Leo's)",
    frozenset(("Garlic bread", "Cheesy garlic bread slices")): "different dishes: garlic bread (Bar & Grill side) and the kids' cheesy garlic bread slices",
    frozenset(("Arran ice cream", "Selection of Isle of Arran ice creams and sorbets")): "different dishes: the kids' two flavours and Leo's selection",
}
# dishes of the published menus whose NAME another menu of the chain prints with other calories (found with --clash-check and looked at by eye on the
# page images, 10 Oct 2026; the hotel's own menu files are in OTHER_KCAL_FILES): left out, never chosen between.
OTHER_MENU_CLASH = {
    "Crispy squid": "Bradford's room service menu prints Crispy squid 343 kcal",
    "Crispy halloumi fries": "Bradford's room service menu prints 505 kcal",
    "Rosemary roasted beetroot": "Hinckley Island's main menu prints 826 kcal",
    "Spinach and ricotta tortelloni": "Hinckley Island's main menu prints 973 kcal",
    "Steak frites": "Hinckley Island's main menu prints 671 kcal",
    "Peppercorn sauce": "Hinckley Island's main menu prints 97 kcal",
    "Tuna Niçoise salad (small)": "Hinckley Island's Triumph & Piazza menu prints Tuna Niçoise salad (one size) 388 kcal, its main menu 338 kcal",
    "Tuna Niçoise salad (large)": "Hinckley Island's Triumph & Piazza menu prints Tuna Niçoise salad (one size) 388 kcal, its main menu 338 kcal",
    "Non-alcoholic beer battered fish & chips": "Bradford's room service menu prints 1256 kcal, the March 2026 Leo's room service menu 1372 kcal",
    "Steamed green vegetables": "Bradford's room service menu prints 133 kcal",
    "Garlic bread": "Bradford's room service menu prints 398 kcal",
    "Classic Ploughman's": "Bradford's room service menu prints Classic Ploughman's on brioche bun 606 kcal",
    "Filled choux buns": "Hinckley Island's dessert menu prints 305 kcal",
    "Crispy chicken burger": "the March 2026 Leo's room service menu prints Crispy chicken burger 1063 kcal",
    "British Wagyu beef burger": "the Oxford bottomless brunch menu prints it (spelt 'Wagu') at 990 kcal",
    "Leo's club sandwich": "the Oxford bottomless brunch menu prints 1034 kcal",
    "Caesar salad, smoked pancetta lardons": "the Oxford bottomless brunch and Dilly terrace menus print the same dish at 608 kcal",
    "Selection of Isle of Arran ice creams and sorbets": "Bradford's room service menu prints 557 kcal, Oxford's brunch menu 573 kcal, Hinckley Island 465 kcal",
    "Rigatoni pasta": "Bradford's room service menu prints Rigatoni pasta 1023 kcal (the kids' menu 285 kcal)",
}
# judged by eye to be different dishes although a name is contained in another menu's name (nothing to do in the code, listed so the report can say it):
#   "Sticky glazed chicken wings" (Frank's RedHot sauce, 332 kcal) and Bradford's "Chicken wings" (mango, lime and chilli salsa, 603 kcal).
# pairs that are left out although their names differ in one word: the same add-on printed in two menus with other calories
FORCE_CLASH = [
    ("Extra patty (burger topping)", "Extra beef patty (burger topping)", "the same burger add-on printed in two menus with other calories"),
]

PORK_RX = re.compile(r"\b(pork|bacon|ham|sausages?|salami|pancetta|pepperoni|chorizo|prosciutto|gammon|speck)\b", re.I)
BEEF_RX = re.compile(r"\b(beef|steaks?|ribeye|rib eye|sirloin|bavette|brisket|lasagne)\b", re.I)


def pkey(s: str) -> str:
    s = s.lower().replace("’", "'").replace("&", " and ")
    s = re.sub(r"\((?:v|pb|gf|ngci)\)", " ", s)
    return " ".join(re.sub(r"[^a-z0-9àâçéèêëîïôûùüÿñæœ]+", " ", s).split())


def nkey(s: str) -> str:
    """Name key for the clash rule: marks, case, '&'/'and', punctuation and plural 's' ignored."""
    def sing(w: str) -> str:
        if len(w) > 4 and w.endswith("oes"):
            return w[:-2]
        return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w

    return " ".join(sing(w) for w in pkey(s).split())


def contained(a: str, b: str) -> bool:
    return len(a.split()) >= 2 and len(b.split()) >= 2 and (f" {a} " in f" {b} " or f" {b} " in f" {a} ")


# ------------------------------------------------------------------------------------------------------------- fetching
def curl(url: str, out: Path) -> int:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    return int(res.stdout.strip() or 0)


def page_file(cache: Path, path: str) -> Path:
    return cache / "pages" / (path.replace("/", "__") + ".html")


def file_id(url: str) -> str:
    m = re.match(r"[0-9a-f]{32}", urllib.parse.unquote(url.rsplit("/", 1)[-1]))
    return m.group(0) if m else ""


LINK = re.compile(r"https?://[^\"'<>\\ ]+?\.pdf")


def menu_links(cache: Path) -> dict:
    """{file id: (url, set of hotel ids that link it)} for every food-menu PDF linked from the cached restaurant pages."""
    out: dict = {}
    for path in PAGES:
        f = page_file(cache, path)
        if not f.exists():
            continue
        hotel = path.replace("/", "__")
        for url in sorted(set(LINK.findall(f.read_text(encoding="utf-8")))):
            name = urllib.parse.unquote(url.rsplit("/", 1)[-1])
            fid = file_id(url)
            if not fid or EXCLUDE.search(name):
                continue
            out.setdefault(fid, (url, set()))[1].add(hotel)
    return out


def fetch(cache: Path) -> None:
    (cache / "pages").mkdir(parents=True, exist_ok=True)
    (cache / "pdf").mkdir(exist_ok=True)
    rules_by_host: dict = {}

    def rules(host: str):
        if host not in rules_by_host:
            robots = cache / f"robots_{host}.txt"
            if not robots.exists():
                if curl(f"https://{host}/robots.txt", robots) != 200:
                    raise SystemExit(f"cannot read https://{host}/robots.txt: stop (never work round it)")
                time.sleep(1.1)
            rules_by_host[host] = robots_rfc.parse(robots.read_text(encoding="utf-8-sig"))
        return rules_by_host[host]

    for path in PAGES:
        out = page_file(cache, path)
        if out.exists() and out.stat().st_size > 5000:
            continue
        if not robots_rfc.allowed(rules(HOST), f"/{path}/restaurants"):
            raise SystemExit(f"robots.txt disallows /{path}/restaurants: stop (never work round it)")
        code = curl(f"{BASE}/{path}/restaurants", out)
        if code != 200:
            out.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code} for {BASE}/{path}/restaurants")
        time.sleep(1.1)
    for fid, (url, _hotels) in sorted(menu_links(cache).items()):
        out = cache / "pdf" / f"{fid}.pdf"
        if out.exists() and out.stat().st_size > 500:
            continue
        p = urllib.parse.urlparse(url)
        if not robots_rfc.allowed(rules(p.netloc), p.path):
            raise SystemExit(f"robots.txt on {p.netloc} disallows {p.path}: stop (never work round it)")
        code = curl(url, out)
        if code != 200 or out.read_bytes()[:5] != b"%PDF-":
            out.unlink(missing_ok=True)
            print(f"HTTP {code}, not saved: {url}")
        time.sleep(1.1)


# ------------------------------------------------------------------------------------------------------------- reading
def text_records(path: Path) -> list:
    """[(printed text before the figure, kcal)] from a Leo's PDF's text layer (reading order; prices, headers and notes skipped)."""
    txt = subprocess.run(["pdftotext", str(path), "-"], capture_output=True, text=True).stdout
    buf, out = [], []
    for raw in txt.splitlines():
        line = " ".join(raw.split())
        if not line or HEADERS.match(line):
            if line and not re.match(r"^\d+\.\d\d$", line):
                buf = []
            continue
        buf.append(line)
        joined = " ".join(buf)
        ms = list(KCAL.finditer(joined))
        if ms:
            pos = 0
            for m in ms:
                out.append((joined[pos:m.start()].strip(" -"), m.group(1)))
                pos = m.end()
            rest = joined[pos:].strip(" -")
            buf = [rest] if rest else []
    return out


def meat_tags(text: str) -> list:
    t = re.sub(r"beef tomato|swordfish steak|gammon steak|beef-?tomato", " ", text, flags=re.I)
    tags = []
    if PORK_RX.search(text):
        tags.append("contains_pork")
    if BEEF_RX.search(t):
        tags.append("contains_beef")
    return tags


def hotels_for(cache: Path) -> dict:
    """{file id: set of hotels linking it or a file with identical bytes}, Belfast left out."""
    links = menu_links(cache)
    by_sha: dict = collections.defaultdict(set)
    for fid in links:
        p = cache / "pdf" / f"{fid}.pdf"
        if p.exists():
            by_sha[sha256_file(p)].add(fid)
    out = {}
    for fid in FILES:
        p = cache / "pdf" / f"{fid}.pdf"
        same = by_sha.get(sha256_file(p), {fid}) if p.exists() else {fid}
        out[fid] = {h for s in same for h in links.get(s, ("", set()))[1]} - NI_HOTELS
    return out


def check_files(cache: Path) -> None:
    for fid, (name, sha) in FILES.items():
        p = cache / "pdf" / f"{fid}.pdf"
        if not p.exists():
            raise SystemExit(f"{name}: {p} is missing (run --fetch)")
        if sha256_file(p) != sha:
            raise SystemExit(f"{name}: the file is not the one the table was checked against (SHA-256 differs): Leonardo published a new version. "
                             "For the text menus re-run and read the CLASH/unlisted lines; for the pictures re-read every number by eye, run --ocr-check, "
                             "then update the table and FILES.")


def build_candidates(cache: Path, hotels: dict) -> list:
    """Every dish from the ten files as dict(name, base, cat, kcal, files, tags, size, printed)."""
    cands = []
    # pictures: typed rows
    for r in IMAGE_ROWS:
        tags = []
        if "v" in r["marks"] or "pb" in r["marks"]:
            tags.append("vegetarian")
        else:
            if PORK_T in r["meat"]:
                tags.append("contains_pork")
            if BEEF_T in r["meat"]:
                tags.append("contains_beef")
        cands.append(dict(name=r["name"], base=r["base"], cat=r["cat"], kcal=r["kcal"], files=set(r["files"]), tags=tags, size=r["size"],
                          printed=r["printed"]))
    # text menus: parsed
    groups: dict = {}
    for fid in TEXT_FILES:
        for text, kcal in text_records(cache / "pdf" / f"{fid}.pdf"):
            hits = [d for d in DISHES if pkey(text).startswith(pkey(d[0]))]
            if len(hits) != 1:
                raise SystemExit(f"{FILES[fid][0]}: printed text {text!r} ({kcal} kcal) matches {len(hits)} entries of DISHES: the menu changed, re-check DISHES")
            key = hits[0]
            g = groups.setdefault(key[1], dict(name=key[1], cat=key[2], vals={}, texts=set()))
            g["vals"].setdefault(kcal, set()).add(fid)
            g["texts"].add(text)
    for g in groups.values():
        if len(g["vals"]) != 1:
            raise SystemExit(f"{g['name']}: printed with different calories in the Leo's files {dict(g['vals'])}: stop (never choose)")
        kcal, fids = next(iter(g["vals"].items()))
        text = " ".join(sorted(g["texts"]))
        marked = bool(re.search(r"\((?:v|pb)\)", text))
        tags = ["vegetarian"] if marked else meat_tags(text)
        cands.append(dict(name=g["name"], base=re.sub(r"\s*\((?:extra|burger topping|grill extra|side)\)$", "", g["name"]), cat=g["cat"], kcal=kcal, files=set(fids), tags=tags, size="", printed=sorted(g["texts"])[0]))
    unused = [d[1] for d in DISHES if d[1] not in groups]
    if unused:
        raise SystemExit(f"DISHES entries no longer printed in any Leo's menu: {unused}")
    # the same dish (name and calories) printed in a picture menu and in a Leo's menu is one dish: merge. The same name with other calories stays
    # as two candidates: apply_rules() leaves both out.
    merged: dict = {}
    for c in cands:
        k = (c["name"], c["kcal"])
        if k in merged:
            merged[k]["files"] |= c["files"]
            merged[k]["tags"] = sorted(set(merged[k]["tags"]) | set(c["tags"]))
        else:
            merged[k] = c
    cands = list(merged.values())
    for c in cands:
        c["hotels"] = set().union(*(hotels[f] for f in c["files"]))
    return cands


def apply_rules(cands: list) -> tuple:
    """Drop dishes whose name is printed with other calories on another dish line. Returns (kept, dropped [(display, kcal, why)])."""
    dropped: dict = {}
    for a in cands:
        for b in cands:
            if a is b or a["kcal"] == b["kcal"] or a["files"] & b["files"]:
                continue
            ka, kb = nkey(a["base"]), nkey(b["base"])
            if ka == kb or contained(ka, kb):
                if frozenset((a["name"], b["name"])) in SAME_NAME_OK:
                    continue
                dropped.setdefault(id(a), (a, []))[1].append(f"{b['name']} {b['kcal']} kcal")
    by_name = {c["name"]: c for c in cands}
    for a, b, why in FORCE_CLASH:
        for x, y in ((a, b), (b, a)):
            if x in by_name and y in by_name and by_name[x]["kcal"] != by_name[y]["kcal"]:
                dropped.setdefault(id(by_name[x]), (by_name[x], []))[1].append(f"{y} {by_name[y]['kcal']} kcal ({why})")
    kept = [c for c in cands if id(c) not in dropped]
    return kept, [(a["name"], a["kcal"], why) for a, why in dropped.values()]


# ------------------------------------------------------------------------------------------------------------- OCR helpers
def ocr_lines(pdf: Path, tmp: Path, dpi: int, invert_white: bool = False, psm: str = "6") -> list:
    from PIL import Image
    prefix = tmp / f"p{dpi}"
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", str(pdf), str(prefix)], check=True)
    lines: list = []
    for png in sorted(tmp.glob(f"p{dpi}-*.png")):
        im = Image.open(png).convert("RGB")
        if invert_white:  # white text on a red background: keep what is bright in the green channel as black text
            im = im.split()[1].point(lambda v: 0 if v > 170 else 255)
        else:
            im = im.convert("L")
        w, h = im.size
        # tesseract copes best with one text column at a time: split each page into overlapping vertical strips
        strips = 4 if w > h else 1
        for i in range(strips):
            x0, x1 = max(0, int(w * (i / strips) - w * 0.02)), min(w, int(w * ((i + 1) / strips) + w * 0.02))
            part = png.with_name(f"{png.stem}_s{i}.png")
            im.crop((x0, 0, x1, h)).save(part)
            for p in (psm, "11"):
                lines += subprocess.run(["tesseract", str(part), "-", "--psm", p], capture_output=True, text=True).stdout.splitlines()
    return lines


def ocr_check(cache: Path) -> None:
    """Re-read the picture menus with tesseract and list each typed dish whose calories OCR cannot find on that dish's own line."""
    norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower().replace("’", "").replace("'", ""))  # noqa: E731
    missing, total = [], 0
    for letter, fid in LETTER.items():
        rows = [r for r in IMAGE_ROWS if fid in r["files"]]
        saved = cache / "ocrcheck" / f"{fid}.txt"
        if saved.exists():
            lines = saved.read_text(encoding="utf-8").splitlines()
        else:
            lines = []
            with tempfile.TemporaryDirectory() as t:
                for dpi in (300, 400):
                    tmp = Path(t) / str(dpi)
                    tmp.mkdir()
                    lines += ocr_lines(cache / "pdf" / f"{fid}.pdf", tmp, dpi, invert_white=(fid == ID_KIDS))
            saved.parent.mkdir(exist_ok=True)
            saved.write_text("\n".join(lines), encoding="utf-8")
        nl = [norm(x) for x in lines]
        total += len(rows)
        for r in rows:
            printed = re.sub(r"\((small|large|two flavours)\)|\(.*?\)", "", r["printed"])
            words = [w for w in re.findall(r"[A-Za-zÀ-ÿ0-9']+", printed) if len(w) >= 3]
            keys = [norm(printed)[-14:]] + [norm(w) for w in words[-2:]] + [norm(w) for w in words[:1]]
            k = r["kcal"]
            ok = False
            for key in keys:
                for i, n in enumerate(nl):
                    if key and key in n:
                        window = " ".join(lines[max(0, i - 1):i + 3]).lower().replace(",", "")
                        if re.search(r"(?<!\d)\d{0,2}" + k + r"(?!\d)", window):
                            ok = True
                            break
                if ok:
                    break
            if not ok:
                missing.append(f"{FILES[fid][0]}: {r['printed']} {k}")
    print(f"OCR could not confirm {len(missing)} of {total} typed dish lines (OCR is noisy; each one was checked by eye on an enlargement):")
    print("\n".join("  " + m for m in missing))


# the chain's other menus that print calories (found by running OCR / pdftotext over every linked menu): used only to look for clashes
OTHER_KCAL_FILES = {
    "a45f7f1beae393fe5be6f70f4dcbc423": "Heathrow Bar & Grill main menu", "ddaebce08e9a92576ec28667692c2669": "Heathrow Bar & Grill lunch menu",
    "c450ef515d3ee5b0ef3b998044bf4f36": "Hinckley Island main menu", "76f22f38666272a327e0a105031ed1ce": "Hinckley Island Triumph & Piazza menu",
    "0fc76ef98bd181849ac169906f78fb13": "Hinckley Island dessert menu", "58e65c63b49523b99473b09cd79cc663": "Room service menu March 2026",
    "5e667b33cfa5edb551fa58f0b4c71a94": "Classics room service menu", "24465493ed4d83144743174dc4fa25c4": "Reduced room service menu",
    "9a5dde2e665d12e0ec604968fc57d654": "Oxford bottomless brunch menu", "28a754dfe2b47ecf0ab3f61aceb932a8": "Dilly terrace a la carte menu",
    "a812c1caa44237d5742c9b1301f3fbe3": "The Cardinal food menu", "846a51aee5feb245c39e8a5499078abc": "The Cardinal set menu",
    "8c0f6b77f606e33cf2accece92ee42e0": "The Cardinal dessert menu", "6692ed8494d1adcaa1313606799c0ac5": "The Midland LL menu",
}


_OCR_DIGITS = str.maketrans({"s": "5", "S": "5", "o": "0", "O": "0", "i": "1", "l": "1", "I": "1", "\u00e9": "8", "z": "2", "Z": "2", "g": "9", "b": "6"})


def same_figure(published: str, seen: str) -> bool:
    """OCR often turns 5 into s, 0 into o, glues the price to the figure ("17930" for £17 930) or drops the first digit: those are the same figure."""
    f = seen.translate(_OCR_DIGITS)
    if not f.isdigit():
        return False
    return f == published or (f.endswith(published) and len(f) - len(published) <= 2) or (published.endswith(f) and len(published) - len(f) == 1)


def other_texts(cache: Path) -> dict:
    """{file id: [normalised text, ...]}: the text layer where there is one, else tesseract at 250 dpi (psm 11 and psm 6), cached in CACHE/ocr."""
    texts = {}
    odir = cache / "ocr"
    odir.mkdir(exist_ok=True)
    for p in sorted((cache / "pdf").glob("*.pdf")):
        if p.stem not in OTHER_KCAL_FILES:
            continue
        t = subprocess.run(["pdftotext", str(p), "-"], capture_output=True, text=True).stdout
        if len(t.strip()) >= 100:
            texts[p.stem] = [pkey(t.replace("\n", " "))]
            continue
        versions = []
        for psm in ("11", "6"):
            cached = odir / f"{p.stem}.psm{psm}.txt"
            if not cached.exists():
                with tempfile.TemporaryDirectory() as tmp:
                    tmp = Path(tmp)
                    subprocess.run(["pdftoppm", "-r", "250", "-png", str(p), str(tmp / "p")], check=True)
                    out = [subprocess.run(["tesseract", str(png), "-", "--psm", psm], capture_output=True, text=True).stdout
                           for png in sorted(tmp.glob("p-*.png"))]
                    cached.write_text("\n".join(out), encoding="utf-8")
            versions.append(pkey(cached.read_text(encoding="utf-8").replace("\n", " ")))
        texts[p.stem] = versions
    return texts


def clash_check(cache: Path, items: list) -> None:
    """Look in the chain's other menus that print calories for each published dish's name and the figure that follows it; print the ones that differ."""
    texts = other_texts(cache)
    hits = 0
    for it in items:
        base = pkey(re.sub(r"\((small|large|add to a salad or pasta|burger topping|grill extra|side|extra|two flavours)\)", "", it["base"]))
        words = base.split()
        needle = " ".join(words[:4]) if len(words) > 4 else base
        seen = set()
        for stem, versions in texts.items():
            for t in versions:
                for m in re.finditer(re.escape(needle), t):
                    tail = t[m.end():m.end() + 130]
                    for k in re.finditer(r"([0-9sSoOilIz\u00e9]{2,5}) ?k ?(?:cal|ea|ca)", tail):
                        # the first figure after the name that is not just a price (prices are followed by another figure)
                        fig = k.group(1)
                        if same_figure(it["kcal"], fig):
                            break
                        key = (stem, fig)
                        if key not in seen and fig.translate(_OCR_DIGITS).isdigit():
                            seen.add(key)
                            hits += 1
                            print(f"CHECK {it['name']} ({it['kcal']}): {OTHER_KCAL_FILES[stem]} prints {fig} ... {t[max(0, m.start() - 15):m.end() + k.end()][-120:]!r}")
                        break
    print(f"{hits} places where another menu prints a different figure after a published dish's name (OCR text is noisy: each was looked at)")


# ------------------------------------------------------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path, help="folder for the downloaded pages and PDFs")
    ap.add_argument("--fetch", action="store_true", help="download the pages and PDFs first (skips what is already there)")
    ap.add_argument("--checked-on", help="the day the PDFs were read, YYYY-MM-DD")
    ap.add_argument("--ocr-check", action="store_true", help="re-run tesseract over the picture menus and list typed lines it cannot confirm")
    ap.add_argument("--clash-check", action="store_true", help="search the chain's other menus for published dish names with other calories")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
        if not args.checked_on:
            return 0
    if not args.checked_on:
        ap.error("--checked-on is required")
    check_files(args.cache)
    hotels = hotels_for(args.cache)
    for fid, (name, sha) in FILES.items():
        print(f"{len(hotels[fid]):>2} hotels  {name}  sha256 {sha[:16]}")
    pages = [p for p in PAGES if page_file(args.cache, p).exists()]
    print(f"{len(pages)} hotel restaurant pages read (Belfast included, not counted); {len({h for v in hotels.values() for h in v})} hotels link a published file")
    if args.ocr_check:
        ocr_check(args.cache)
    cands = build_candidates(args.cache, hotels)
    kept, dropped = apply_rules(cands)
    for name, kcal, why in dropped:
        print(f"CLASH left out: {name} {kcal} kcal; also printed as {'; '.join(why)}")
    for c in [c for c in kept if c["name"] in OTHER_MENU_CLASH]:
        print(f"OTHER-MENU CLASH left out: {c['name']} {c['kcal']} kcal; {OTHER_MENU_CLASH[c['name']]}")
    kept = [c for c in kept if c["name"] not in OTHER_MENU_CLASH]
    unknown = [n for n in OTHER_MENU_CLASH if n not in {c["name"] for c in cands}]
    if unknown:
        raise SystemExit(f"OTHER_MENU_CLASH names no longer in the menus: {unknown}")
    kept = [c for c in kept if len(c["hotels"]) >= 2]
    if args.clash_check:
        clash_check(args.cache, kept)
    if len(kept) < MIN_ITEMS:
        raise SystemExit(f"only {len(kept)} dishes pass (minimum {MIN_ITEMS}): do not publish")
    names = [c["name"] for c in kept]
    if len(set(names)) != len(names):
        raise SystemExit("item names are not unique")
    kept.sort(key=lambda c: CATEGORY_ORDER.index(c["cat"]))
    items = []
    for c in kept:
        where = ", ".join(sorted(FILES[f][0] for f in c["files"]))
        items.append(dict(name=c["name"], category=c["cat"], serving=c["size"], calories=c["kcal"], tags="|".join(c["tags"]), rankable=False,
                          notes=f"printed '{c['printed']}' {c['kcal']} kcal on: {where}; {len(c['hotels'])} hotels link those files"))
    assert len(NOTE) < 400
    out = write_chain_folder(chain_id=CHAIN_ID, name="Leonardo Hotels", cuisine="Hotel restaurant", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories")
    counts = collections.Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items ({len(cands) - len(kept)} dishes left out) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
