#!/usr/bin/env python3
"""Build data/source/bettys/ from the Bettys Café Tea Rooms Winter Core Menu PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/bettys.py path/to/bettys-winter-core-menu-2026.pdf --checked-on 2026-10-08 [--out DIR]

Source (the menu file the chain serves; its home page answers a bot challenge, so only this file address is used):
    https://www.bettys.co.uk/media/pdf/bettys-winter-core-menu-2026.pdf
    16 pages, Adobe InDesign 20.1, PDF created 18 December 2025 (served Last-Modified 14 September 2026), text layer. robots.txt
    (https://www.bettys.co.uk/robots.txt) does not disallow /media/pdf/. Needs `pdftotext` (poppler). The pages are read by position:
    see bettys_pdf.py.

The menu prints calories ONLY, as "NNN kcal £price" beside each dish: protein, carbs, fat, salt and the rest are never printed,
so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published").
Calories are copied from the PDF as printed (including the 0 kcal of teas and black coffee). Only the item NAMES, categories, tags
and servings are written by hand, in ITEMS below: the script stops if the dishes printed with calories differ from this table (a new,
renamed or removed dish, a moved layout, another number of calorie values), so a human re-checks the table when Bettys publishes a
new menu.

How the menu's own wording is read:
- One item per printed dish line that has its own calories and (where the menu prints one) its own price. A dish with two printed
  variants gets one item per variant, each with the value printed beside it: Scrambled Eggs on a Toasted Muffin (smoked salmon / dry-cured
  bacon), the Sultana Scone (with clotted cream and preserve / toasted with butter), Nozeco Rosé (125ml glass / 75cl bottle), Still or
  Sparkling Water (330ml / 750ml), milkshake flavours (each flavour prints its own value).
- Lines that print a small extra price and calories under a dish ("With smoked streaky bacon. 110 kcal £2.50" under Bettys Burger,
  "With dry-cured bacon. 190 kcal £2.50" under Yorkshire Rarebit) are add-ons priced separately: each is an item of its own named
  "... (added to ...)", never added into the dish's calories. The Breakfast Additions box prints the same kind of values; its names carry
  "(breakfast addition)". Rösti Bites print 390 kcal as a breakfast addition and 650 kcal as a side dish: two items.
- Little Rascal (children's) dishes print their own values; their names carry "Little Rascal" so they never collide with the adult dish.
- Marks (V) vegetarian and (Ve) vegan become the tag `vegetarian`. contains_pork / contains_beef only where the dish's printed name or
  description says bacon, ham, sausage, pork or beef. Nothing else is inferred.
- `serving` only where the menu states one (a drink's size, "Teapot for one" under the Teas heading, "Cafetière for one").
- Not listed, because the menu prints no usable calories: the Grande Breakfast set (a bundle: 860 kcal, then a choice of rösti at 300 / 375 /
  435 kcal and "115 kcal" with orange juice, with no total for any combination), Soup of the Day, Traditional Afternoon Tea ("kcal on
  request"), the two afternoon teas with a glass of wine, Little Rascal ice creams ("kcal on request"), the milkshake and Small Milkshakes
  heading lines (only their flavours print calories), and every wine, champagne, cocktail, spirit and ale (no calories).

Allergens (docs/DATA.md "Allergens") are link-only. The menu says "Detailed information on the 14 legal allergens is available on request"
and "Please scan the QR code to view allergen and dietary information of our dishes". The QR code on page 2 decodes to
https://qrco.de/bev1J4, which redirects (HTTP 302, the only request made to it) to https://www.bettys.co.uk/allergens. That page was NOT opened
(the site sits behind a bot challenge and only the menu file may be fetched), so its content is unverified: no allergen is copied, only the
link the chain's own menu points to is published.
"""
from __future__ import annotations
import argparse
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bettys_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "bettys"
SOURCE_URL = "https://www.bettys.co.uk/media/pdf/bettys-winter-core-menu-2026.pdf"
SOURCE_TITLE = ("Bettys Café Tea Rooms Winter Core Menu 2026 (bettys-winter-core-menu-2026.pdf; PDF created 18 December 2025, "
                "no date printed on the menu)")
ALIASES = ["bettys", "betty's", "bettys cafe tea rooms", "betty's cafe tea rooms", "bettys tea rooms", "betty's tea rooms"]
ALLERGEN_GUIDE_TITLE = ("Bettys allergen and dietary information (the page the QR code on the Winter Core Menu opens; "
                        "the page itself was not opened)")
ALLERGEN_GUIDE_URL = "https://www.bettys.co.uk/allergens"
# The guide page was not read, so whether it prints "may contain" is unknown: "no" keeps the app from implying "no traces".
MAY_CONTAIN_PUBLISHED = False
NOTE = ("Bettys prints calories only, beside each dish, so protein, carbs and fat are not published. This is the Winter core menu; "
        "seasonal and branch menus may differ. Set menus (Grande Breakfast, afternoon teas), soup and wine print no usable calories "
        "and are not listed. The menu does not say which bread sandwiches use or whether milk is counted in hot drinks.")
EXPECTED_PAGES = 16
EXPECTED_ITEMS = 134
EXPECTED_ON_REQUEST = 4  # lines reading "kcal on request": Soup of the Day, Traditional Afternoon Tea, two Little Rascal ice creams
# Calories printed on a page that no dish in ITEMS uses (checked on every run; anything else stops the script).
UNUSED = {3: ["860", "300", "375", "435", "115"]}  # Grande Breakfast set: see the docstring
# Headings that must still be printed on their page (a moved or renamed section stops the run).
HEADINGS = {4: ["Breakfast Specialities", "BREAKFAST ADDITIONS"], 5: ["Speciality Poached Eggs"], 6: ["Main Dishes"],
            7: ["Sandwiches", "Side Dishes"], 9: ["Afternoon Tea"], 10: ["Cakes & Pâtisserie"],
            11: ["Ice Cream Sundaes", "Bettys Bakery Favourites"], 12: ["Teas"], 13: ["Coffees & Hot Chocolate", "Cafetières"],
            15: ["LOW ALCOHOL", "SOFT DRINKS"], 16: ["Little Rascal Menu"]}

BF, BA, EGG, MAIN, SAND, SIDE, TEA_AT, CAKE, SUND, BAKE, TEAS, COF, LOW, SOFT, LR = (
    "Breakfast specialities", "Breakfast additions", "Eggs on a toasted muffin", "Main dishes", "Sandwiches", "Side dishes",
    "Afternoon tea", "Cakes & pâtisserie", "Ice cream sundaes", "Bettys bakery favourites", "Teas", "Coffees & hot chocolate",
    "Low alcohol drinks", "Soft drinks", "Little Rascal menu")


def E(page, anchor, name, cat, mark="", pork=False, beef=False, mode="row", which=(0, 1), serving="", note=""):
    return dict(page=page, anchor=anchor, name=name, cat=cat, mark=mark, pork=pork, beef=beef, mode=mode, which=which,
                serving=serving, note=note)


ADD = "Printed as a separate extra with its own price: the add-on's own calories, not a total for the dish"
# One entry per dish line with printed calories, in menu order. `anchor` is the printed line that carries the name (spaces are
# ignored when matching); `mark` is the menu's own (V) / (Ve) mark, which may sit on the name's second line; `mode` says whether the
# calories are on the anchor's row ("row") or centred under it ("below").
ITEMS = [
    # page 4: Breakfast Specialities
    E(4, "Swiss Breakfast Rösti", "Swiss Breakfast Rösti", BF, pork=True),
    E(4, "Florentine Rösti (V)", "Florentine Rösti", BF, "V"),
    E(4, "English Breakfast", "English Breakfast", BF, pork=True),
    E(4, "Vegan English Breakfast (Ve)", "Vegan English Breakfast", BF, "Ve"),
    E(4, "Avocado & Poached Eggs (V)", "Avocado & Poached Eggs", BF, "V"),
    E(4, "Avocado & Aubergine (Ve)", "Avocado & Aubergine", BF, "Ve"),
    E(4, "Kedgeree", "Kedgeree", BF),
    # page 4: Breakfast Additions (calories centred under each name)
    E(4, "Dry-Cured Bacon", "Dry-cured bacon (breakfast addition)", BA, pork=True, mode="below", note="Can only be ordered as an addition to a breakfast dish"),
    E(4, "Spinach (Ve)", "Spinach (breakfast addition)", BA, "Ve", mode="below"),
    E(4, "Tomato (Ve)", "Tomato (breakfast addition)", BA, "Ve", mode="below"),
    E(4, "Yorkshire Sausage", "Yorkshire sausage (breakfast addition)", BA, pork=True, mode="below"),
    E(4, "Baked or Smoked", "Baked or smoked beans (breakfast addition)", BA, "Ve", mode="below", note="Name runs over two lines: 'Baked or Smoked / Beans (Ve)'"),
    E(4, "Crushed Avocado (Ve)", "Crushed avocado (breakfast addition)", BA, "Ve", mode="below"),
    E(4, "Rösti Bites (Ve)", "Rösti Bites (breakfast addition)", BA, "Ve", mode="below", note="Side-dish Rösti Bites print a different value (page 7)"),
    E(4, "Mushroom (Ve)", "Mushroom (breakfast addition)", BA, "Ve", mode="below"),
    E(4, "Yorkshire", "Yorkshire smoked salmon (breakfast addition)", BA, mode="below", note="Name runs over two lines: 'Yorkshire / Smoked Salmon'"),
    # page 5
    E(5, "Eggs Florentine with spinach (V)", "Eggs Florentine with spinach", EGG, "V", note="Printed under 'Speciality Poached Eggs: on a toasted muffin with hollandaise sauce'"),
    E(5, "Eggs Benedict with traditional Wiltshire cured ham", "Eggs Benedict with traditional Wiltshire cured ham", EGG, pork=True, note="Printed under 'Speciality Poached Eggs: on a toasted muffin with hollandaise sauce'"),
    E(5, "Eggs Royale with Yorkshire smoked salmon", "Eggs Royale with Yorkshire smoked salmon", EGG, note="Printed under 'Speciality Poached Eggs: on a toasted muffin with hollandaise sauce'"),
    E(5, "With Yorkshire smoked salmon", "Scrambled eggs on a toasted muffin with Yorkshire smoked salmon", EGG, note="Printed under 'Scrambled Eggs on a Toasted Muffin'"),
    E(5, "With dry-cured bacon", "Scrambled eggs on a toasted muffin with dry-cured bacon", EGG, pork=True, note="Printed under 'Scrambled Eggs on a Toasted Muffin'"),
    E(5, "Dry-cured Bacon in a Toasted Muffin", "Dry-cured bacon in a toasted muffin", EGG, pork=True),
    E(5, "Bircher Muesli (V)", "Bircher Muesli", BF, "V"),
    E(5, "Pastry & Pikelet Selection* (V)", "Pastry & Pikelet Selection", BF, "V", note="Menu: served until 11.30am"),
    E(5, "Fruit Loaf & Berries (V)", "Fruit Loaf & Berries", BF, "V"),
    E(5, "Cinnamon Toast (V)", "Cinnamon Toast", BF, "V"),
    # page 6
    E(6, "Bacon & Raclette Rösti", "Bacon & Raclette Rösti", MAIN, pork=True),
    E(6, "Bettys Burger", "Bettys Burger", MAIN, beef=True, note="Printed with pommes frites and pickles"),
    E(6, "With smoked streaky bacon.", "Smoked streaky bacon (added to Bettys Burger)", MAIN, pork=True, note=ADD),
    E(6, "Chicken Schnitzel", "Chicken Schnitzel", MAIN),
    E(6, "Alpine Macaroni", "Alpine Macaroni", MAIN, pork=True),
    E(6, "Haddock, Salmon & Prawn Gratin", "Haddock, Salmon & Prawn Gratin", MAIN),
    E(6, "Salmon Salad", "Salmon Salad", MAIN),
    E(6, "Fried Fillet of Haddock", "Fried Fillet of Haddock", MAIN),
    E(6, "Yorkshire Rarebit (V)", "Yorkshire Rarebit", MAIN, "V"),
    E(6, "With dry-cured bacon.", "Dry-cured bacon (added to Yorkshire Rarebit)", MAIN, pork=True, note=ADD),
    E(6, "Mushroom Quiche (V)", "Mushroom Quiche", MAIN, "V"),
    # page 7: sandwiches (left box: calories centred under the description; right column: calories on the name's row)
    E(7, "Club Sandwich", "Club Sandwich", SAND, pork=True, mode="below"),
    E(7, "Croque Monsieur", "Croque Monsieur", SAND, pork=True, mode="below", note="Printed 'Served with salad'"),
    E(7, "Croque Madame", "Croque Madame", SAND, pork=True, mode="below", note="Printed 'Served with salad'"),
    E(7, "Yorkshire Chicken", "Yorkshire Chicken", SAND),
    E(7, "Flaked Salmon & Prawn", "Flaked Salmon & Prawn", SAND),
    E(7, "Mediterranean", "Mediterranean Roasted Pepper", SAND, "Ve", note="Name runs over two lines: 'Mediterranean / Roasted Pepper (Ve)'"),
    E(7, "Egg Mayonnaise", "Egg Mayonnaise & Cress", SAND, "V", note="Name runs over two lines: 'Egg Mayonnaise / & Cress (V)'"),
    E(7, "Ham & Cheese", "Ham & Cheese", SAND, pork=True),
    # page 7: side dishes
    E(7, "Mixed Side Salad (V)", "Mixed Side Salad", SIDE, "V"),
    E(7, "Pear & Pomegranate", "Pear & Pomegranate Salad", SIDE, "V", note="Name runs over two lines: 'Pear & Pomegranate / Salad (V)'"),
    E(7, "Rösti Bites (V)", "Rösti Bites", SIDE, "V", note="The breakfast addition Rösti Bites print a different value (page 4)"),
    E(7, "Chips (Ve)", "Chips", SIDE, "Ve"),
    E(7, "Pommes Frites (Ve)", "Pommes Frites", SIDE, "Ve"),
    # page 9
    E(9, "Yorkshire Cream Tea (V)", "Yorkshire Cream Tea", TEA_AT, "V", mode="below", note="Printed 'Vegan option available on request. (Ve)'"),
    # page 10
    E(10, "Swiss Chocolate Torte & Ice Cream (V)", "Swiss Chocolate Torte & Ice Cream", CAKE, "V", note="Printed '715kcal' with no space"),
    E(10, "Engadine Torte & Ice Cream (V)", "Engadine Torte & Ice Cream", CAKE, "V"),
    E(10, "Fruit Tart & Ice Cream (V)", "Fruit Tart & Ice Cream", CAKE, "V"),
    E(10, "Seasonal Cheesecake & Berries (V)", "Seasonal Cheesecake & Berries", CAKE, "V"),
    E(10, "Grande Raspberry Macaroon (V)", "Grande Raspberry Macaroon", CAKE, "V"),
    E(10, "Carrot Gugelhupf (Ve)", "Carrot Gugelhupf", CAKE, "Ve"),
    E(10, "Yorkshire Curd Tart (V)", "Yorkshire Curd Tart", CAKE, "V"),
    E(10, "Vanilla Slice (V)", "Vanilla Slice", CAKE, "V"),
    E(10, "Chocolate Éclair (V)", "Chocolate Éclair", CAKE, "V"),
    # page 11
    E(11, "Bettys Gooey Rascal Sundae (V)", "Bettys Gooey Rascal Sundae", SUND, "V"),
    E(11, "Bettys Fruit Sundae (V)", "Bettys Fruit Sundae", SUND, "V"),
    E(11, "Bettys Brown Bread Sundae (V)", "Bettys Brown Bread Sundae", SUND, "V"),
    E(11, "Yorkshire Fat Rascal Scone (V)", "Yorkshire Fat Rascal Scone", BAKE, "V"),
    E(11, "Gooey Rascal (V)", "Gooey Rascal", BAKE, "V"),
    E(11, "With clotted cream and Yorkshire strawberry preserve.", "Sultana Scone with clotted cream and Yorkshire strawberry preserve", BAKE, "V",
      note="Sultana Scone (V): two printed variants, each on its own line; 'Vegan option available on request. (Ve)'"),
    E(11, "Toasted with butter.", "Sultana Scone, toasted with butter", BAKE, "V",
      note="Sultana Scone (V): two printed variants, each on its own line; 'Vegan option available on request. (Ve)'"),
    E(11, "Rarebit Scone* (V)", "Rarebit Scone", BAKE, "V", note="Menu: served toasted with butter"),
    E(11, "Currant & Sultana Teacake* (V)", "Currant & Sultana Teacake", BAKE, "V", note="Menu: served toasted with butter"),
    # page 12: teas (the heading: "Finest quality tea served in a teapot for one, with milk or lemon")
    E(12, "Bettys Tea Room Blend (Ve)", "Bettys Tea Room Blend", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Earl Grey (Ve)", "Earl Grey", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Bettys Breakfast Tea (Ve)", "Bettys Breakfast Tea", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Golden Valley Darjeeling (Ve)", "Golden Valley Darjeeling", TEAS, "Ve", serving="Teapot for one"),
    E(12, "China Rose Petal (Ve)", "China Rose Petal", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Jasmine Blossom (Ve)", "Jasmine Blossom", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Ceylon Blue Sapphire (Ve)", "Ceylon Blue Sapphire", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Pi Lo Chun Green Tea (Ve)", "Pi Lo Chun Green Tea", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Yu Luo White Tea (Ve)", "Yu Luo White Tea", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Lemongrass & Ginger Tisane (Ve)", "Lemongrass & Ginger Tisane", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Peppermint Tisane (Ve)", "Peppermint Tisane", TEAS, "Ve", serving="Teapot for one"),
    E(12, "Raspberry & Cherry Tisane (Ve)", "Raspberry & Cherry Tisane", TEAS, "Ve", serving="Teapot for one"),
    # page 13: coffees (the heading: "Served with hot milk or cream")
    E(13, "Americano (Ve)", "Americano", COF, "Ve"),
    E(13, "Flat White (V)", "Flat White", COF, "V"),
    E(13, "Latte (V)", "Latte", COF, "V"),
    E(13, "Cappuccino (V)", "Cappuccino", COF, "V"),
    E(13, "Bettys Espresso (Ve)", "Bettys Espresso", COF, "Ve"),
    E(13, "Latte Latino (V)", "Latte Latino", COF, "V"),
    E(13, "Mocha (V)", "Mocha", COF, "V"),
    E(13, "Hot Chocolate (V)", "Hot Chocolate", COF, "V"),
    E(13, "Café Classic Blend (Ve)", "Café Classic Blend (cafetière)", COF, "Ve", mode="below", serving="Cafetière for one"),
    E(13, "Kenya (Ve)", "Kenya single origin coffee (cafetière)", COF, "Ve", mode="below", serving="Cafetière for one"),
    E(13, "Colombia (Ve)", "Colombia single origin coffee (cafetière)", COF, "Ve", mode="below", serving="Cafetière for one"),
    E(13, "Guatemala (Ve)", "Guatemala single origin coffee (cafetière)", COF, "Ve", mode="below", serving="Cafetière for one"),
    # page 15
    E(15, "Nozeco Rosé (Ve)", "Nozeco Rosé (125ml glass)", LOW, "Ve", serving="125ml glass", note="Printed '25 kcal (125ml Glass)'"),
    E(15, "Fine and elegant bubbles with intense fruity notes from", "Nozeco Rosé (75cl bottle)", LOW, "Ve", serving="75cl bottle",
      note="Printed '150 kcal (75cl Bottle)' on the second line of the Nozeco Rosé entry"),
    E(15, "Cold Bath 1571 (Ve)", "Cold Bath 1571", LOW, "Ve", serving="330ml bottle"),
    E(15, "Swiss Chocolate", "Swiss Chocolate Milkshake", SOFT, "V", note="Printed under 'Milkshakes (V) £6.25: Bettys ice cream blended with milk and your choice of'"),
    E(15, "Banana", "Banana Milkshake", SOFT, "V", note="Printed under 'Milkshakes (V) £6.25: Bettys ice cream blended with milk and your choice of'"),
    E(15, "Raspberry", "Raspberry Milkshake", SOFT, "V", note="Printed under 'Milkshakes (V) £6.25: Bettys ice cream blended with milk and your choice of'"),
    E(15, "Strawberry", "Strawberry Milkshake", SOFT, "V", note="Printed under 'Milkshakes (V) £6.25: Bettys ice cream blended with milk and your choice of'"),
    E(15, "Fresh Orange Juice (V)", "Fresh Orange Juice", SOFT, "V"),
    E(15, "Yorkshire Wolds", "Yorkshire Wolds Pressed Apple Juice", SOFT, "Ve", note="Name runs over two lines: 'Yorkshire Wolds / Pressed Apple Juice (Ve)'"),
    E(15, "Bettys Lemonade (Ve)", "Bettys Lemonade", SOFT, "Ve"),
    E(15, "Elderflower Bubbly (Ve)", "Elderflower Bubbly", SOFT, "Ve"),
    E(15, "Sparkling Apple (Ve)", "Sparkling Apple", SOFT, "Ve"),
    E(15, "Still or Sparkling", "Still or Sparkling Water (330ml)", SOFT, "Ve", which=(0, 2), serving="330ml", note="Name runs over two lines: 'Still or Sparkling / Water (Ve)'"),
    E(15, "Still or Sparkling", "Still or Sparkling Water (750ml)", SOFT, "Ve", which=(1, 2), serving="750ml", note="Name runs over two lines: 'Still or Sparkling / Water (Ve)'"),
    E(15, "Fever-Tree Tonic (Ve)", "Fever-Tree Tonic", SOFT, "Ve"),
    E(15, "Fever-Tree Tonic Light (Ve)", "Fever-Tree Tonic Light", SOFT, "Ve", note="Printed on one line: 'Fever-Tree Tonic Light (Ve) 30 kcal £4.75'"),
    E(15, "Ginger Beer (Ve)", "Ginger Beer", SOFT, "Ve"),
    E(15, "Coca-Cola (Ve)", "Coca-Cola", SOFT, "Ve"),
    E(15, "Diet Coke (Ve)", "Diet Coke", SOFT, "Ve"),
    # page 16: Little Rascal menu (smaller portions for younger diners)
    E(16, "English Breakfast", "Little Rascal English Breakfast", LR, pork=True),
    E(16, "Chicken Schnitzel", "Little Rascal Chicken Schnitzel", LR),
    E(16, "Alpine Macaroni", "Little Rascal Alpine Macaroni", LR, pork=True),
    E(16, "Fried Fillet of Haddock", "Little Rascal Fried Fillet of Haddock", LR),
    E(16, "Yorkshire Sausages", "Little Rascal Yorkshire Sausages", LR, pork=True),
    E(16, "Cheddar Cheese", "Little Rascal Cheddar Cheese & Cucumber sandwich", LR, "V", note="Name runs over two lines: 'Cheddar Cheese / & Cucumber (V)'; menu: served in malted grain, wholemeal or white bread"),
    E(16, "Egg Mayonnaise (V)", "Little Rascal Egg Mayonnaise sandwich", LR, "V", note="Menu: served in malted grain, wholemeal or white bread"),
    E(16, "Traditional Wiltshire", "Little Rascal Traditional Wiltshire Cured Ham sandwich", LR, pork=True, note="Name runs over two lines: 'Traditional Wiltshire / Cured Ham'; menu: served in malted grain, wholemeal or white bread"),
    E(16, "Yorkshire Chicken", "Little Rascal Yorkshire Chicken sandwich", LR, note="Menu: served in malted grain, wholemeal or white bread"),
    E(16, "Chips (Ve)", "Little Rascal Chips", LR, "Ve"),
    E(16, "Baked Beans (Ve)", "Little Rascal Baked Beans", LR, "Ve"),
    E(16, "Fondant Fancy (V)", "Little Rascal Fondant Fancy", LR, "V"),
    E(16, "Caramel Slice (V)", "Little Rascal Caramel Slice", LR, "V"),
    E(16, "Small Hot Chocolate", "Little Rascal Small Hot Chocolate with Cream", LR, "V", note="Name runs over two lines: 'Small Hot Chocolate / with Cream (V)'"),
    E(16, "Swiss chocolate", "Little Rascal Small Swiss chocolate milkshake", LR, "V", note="Printed under 'Small Milkshakes (V) £3.75'"),
    E(16, "Banana", "Little Rascal Small Banana milkshake", LR, "V", note="Printed under 'Small Milkshakes (V) £3.75'"),
    E(16, "Raspberry", "Little Rascal Small Raspberry milkshake", LR, "V", note="Printed under 'Small Milkshakes (V) £3.75'"),
    E(16, "Strawberry", "Little Rascal Small Strawberry milkshake", LR, "V", note="Printed under 'Small Milkshakes (V) £3.75'"),
    E(16, "Small Fresh", "Little Rascal Small Fresh Orange Juice", LR, "V", note="Name runs over two lines: 'Small Fresh / Orange Juice (V)'"),
    E(16, "Small Lemonade (Ve)", "Little Rascal Small Lemonade", LR, "Ve"),
    E(16, "Small Yorkshire Wolds", "Little Rascal Small Yorkshire Wolds Pressed Apple Juice", LR, "Ve", note="Name runs over two lines: 'Small Yorkshire Wolds / Pressed Apple Juice (Ve)'"),
    E(16, "Chilled Milk (V)", "Little Rascal Chilled Milk", LR, "V"),
]
CATEGORY_ORDER = [BF, BA, EGG, MAIN, SAND, SIDE, TEA_AT, CAKE, SUND, BAKE, TEAS, COF, LOW, SOFT, LR]


def ident(name: str) -> str:
    """slug() without turning accented letters into hyphens ('Rösti' -> 'rosti', 'Éclair' -> 'eclair')."""
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii"))


def build_items(pages: list) -> list:
    if len(pages) != EXPECTED_PAGES:
        raise SystemExit(f"The PDF has {len(pages)} pages, expected {EXPECTED_PAGES}: the menu changed")
    on_request = sum(p["on_request"] for p in pages)
    if on_request != EXPECTED_ON_REQUEST:
        raise SystemExit(f"{on_request} lines read 'kcal on request', expected {EXPECTED_ON_REQUEST}: re-read the menu")
    for number, headings in HEADINGS.items():
        for heading in headings:
            pdf_reader.find_line(pages[number - 1], heading)
    by_page = {}
    for e in ITEMS:
        by_page.setdefault(e["page"], []).append(e)
    items = []
    for number, entries in sorted(by_page.items()):
        page = pages[number - 1]
        anchors = []
        for i, e in enumerate(entries):
            m = re.search(r"\((Ve?)\)", e["anchor"])
            if m and m.group(1) != e["mark"]:
                raise SystemExit(f"{e['name']}: the printed name carries ({m.group(1)}) but mark={e['mark']!r}")
            if e["mark"] and e["pork"]:
                raise SystemExit(f"{e['name']}: marked {e['mark']} and also tagged pork")
            anchors.append((i, pdf_reader.find_line(page, e["anchor"], e["which"]), e["mode"]))
        found = pdf_reader.pair(page, anchors, UNUSED.get(number, []))
        for i, e in enumerate(entries):
            tok = found[i]
            tags = (["vegetarian"] if e["mark"] else []) + (["contains_pork"] if e["pork"] else []) + (["contains_beef"] if e["beef"] else [])
            notes = f"Printed '{tok.printed}' on page {number}" + (f"; {e['note']}" if e["note"] else "")
            items.append(dict(name=e["name"], id=ident(e["name"]), category=e["cat"], serving=e["serving"], calories=tok.value,
                              tags="|".join(tags), rankable=False, notes=notes))
    for number in UNUSED:
        if number not in by_page:
            pdf_reader.pair(pages[number - 1], [], UNUSED[number])  # nothing is used: all tokens must be the listed ones
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check ITEMS")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names) or len({i["id"] for i in items}) != len(items):
        raise SystemExit("Item names or ids are not unique")
    order = {c: n for n, c in enumerate(CATEGORY_ORDER)}
    if any(i["category"] not in order for i in items):
        raise SystemExit("An item has a category outside CATEGORY_ORDER")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    pages = pdf_reader.read_pages(args.pdf)
    items = build_items(pages)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Bettys", cuisine="Tea rooms", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("printed with calories but not listed: Grande Breakfast set values 860, 300, 375, 435, 115 (page 3)")


if __name__ == "__main__":
    main()
