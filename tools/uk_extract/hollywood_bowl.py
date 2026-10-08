#!/usr/bin/env python3
"""Build data/source/hollywood-bowl/ from Hollywood Bowl's official Food & Drink menu (a CALORIES-ONLY chain).

    python3 tools/uk_extract/hollywood_bowl.py path/to/menu.pdf --checked-on 2026-10-08 [--out DIR]

Source: the "View Menu" button on https://www.hollywoodbowl.co.uk/<centre>/food-and-drink. EVERY centre has its own PDF (a
different media id for each of the 78 centres whose page links one); this script was written from the Ashford file
    https://media.hollywoodbowlgroup.com/assets/media/1000026/original?v=1791278420144
(6 pages, text layer, menu codes SS2/B2/K2/SO2/SP2 "/1026"; served Last-Modified 2026-10-06). On 2026-10-08 all 78 PDFs were read with
these same patterns (`--compare DIR`, below): every published item has the same calories on all 72 Great Britain bowling-centre menus
(Livingston's page links no menu; Banbridge and Belfast, Northern Ireland, print no or hardly any calories; the four Puttstars mini-golf
sites, Harrow, Leeds, Peterborough and Rochdale, have their own menus and recipes and are left out). Five items on the Ashford file are read but NOT published
(NOT_PUBLISHED): Guinness 0.0% (on 24 of 72 menus) and the four non-alcoholic cocktails (absent from 9 of 72, which list other drinks
there). The six Scottish centres also sell Irn-Bru, which Ashford does not, so it is not in the table. Needs `pdftotext` (poppler); the
page is cut into columns by hollywood_bowl_pdf.py.

The menu prints calories ONLY, in brackets beside each item, "(412 kcal)": protein, carbs and fat are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable). Calories are copied from the PDF by the patterns in SPEC below,
each of which names the words printed beside its number, so a number can only be attached to the item it is printed with. Only item
names, categories, servings and tags are written by hand: the script stops if an anchor, a pattern, the count of kcal figures in a
column or the count on a page no longer matches, so a human re-checks the table when Hollywood Bowl publishes a new menu.

How the menu's own wording is read:
- "(+60 kcal)" beside an add-on or a sauce choice is that item's own calories, added to the dish: stored as 60 under the add-on's own
  name (Chilli jam, Frank's RedHot sauce, BBQ dip, Cheese slice, Bacon...). The same sauce is printed beside many dishes; the script
  insists every printed copy shows the same number. The calories printed for a dish already include what the dish is served with ("served
  with fries (1039 kcal)", "served with chilli jam (572 kcal)"); the dish line's own sauce choices are the "+" figures, not part of it.
- "The Hollywood Burger ... (Beef 1330 kcal, Chicken 1221 kcal)" is two items. "Double Your Burger (from +212 kcal)": the figure is a
  minimum, so the item name says "(from)".
- "Nacho Sharer serves 2 ... (795 kcal per serving)": copied as 795 with the serving "per serving (dish serves 2)"; the menu does not
  say whether a serving is the whole sharer or half of it, and nothing here guesses.
- "Pepsi Max / Diet Pepsi 330ml (2 kcal)" is one printed figure for two drinks: both items carry it.
- Sized rows: "Regular / Large" (soft drinks), "Solo / Doppio" (espresso), "Primo / Medio" (the other hot drinks, which the menu prints
  once above Americano and applies to every row down to Hot chocolate). One item per size. Raspberry Refresher, English breakfast tea
  and the herbal teas are printed with one price in a size column: no size is stated, so the serving stays blank.
- Slushies: two price lists side by side, each under its own logo. The left logo reads "Slushy Jack's"; the right one is a splash
  graphic whose name is not legible in the file, so those two items are called "Slushie (second range)". Their kcal figures are
  read by position in the two lists: Small 75 and Regular 100 and the Jug 94 (left), Regular 68 and Large 119 (right).
- Milkshakes: one dish (the heading carries the "V" mark), four flavours, each with its own figure; the menu prints no size.
- "(V)" and "(VE)" icons are vector drawings, not text: they were read from the rendered pages (110 and 220 dpi) and are listed in
  VEGETARIAN below (VE = vegan, also tagged vegetarian). contains_pork / contains_beef only where the item's own name or description
  says pork, bacon, hot dog (the menu says "a pork hot dog"), or beef.
- Not listed, because the menu prints no calories for them: J2O, Robinsons Ready to Drink, Fruit Shoot, the soft drink sharer jug,
  "Add regular fries" (an offer), the iced versions of Americano and Latte ("Make me iced"), all cocktails with alcohol, beers, ciders,
  spirits, shots, wines, the Family Feast, the "Add a chocolate bar" shake upgrade and "Swap your tortilla chips for fries".

Allergens (docs/DATA.md "Allergens") are link-only. The menu's allergen QR code opens "Hollywood Bowl Allergy Data" (Ten Kites,
https://viewthe.menu/czav), a dot matrix of 419 kitchen recipe names ("Nacho Single Portion" for Nachos, "Regular Fries" for Fries, "Pepsi
Medium" for Pepsi Regular, "Poppi Wild Berry" for each flavour of Poppi, no row at all for several sizes and add-ons). Allergens are
safety information: no name matching, no guessing, so only the guide's link is published (all or nothing).

`--compare DIR` reads every PDF in DIR (one per centre, any file name) with the same patterns and prints, per centre, which items are
missing or have another number: how the claim "same in every GB centre" was checked.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import hollywood_bowl_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "hollywood-bowl"
SOURCE_URL = "https://media.hollywoodbowlgroup.com/assets/media/1000026/original?v=1791278420144"
SOURCE_TITLE = ("Hollywood Bowl Food & Drink menu, Ashford centre copy (menu codes SS2, B2, K2, SO2, SP2 /1026; "
                "PDF served 6 October 2026)")
ALIASES = ["hollywood bowl", "hollywood bowl group"]
ALLERGEN_GUIDE_TITLE = ("Hollywood Bowl Allergy Data (Ten Kites page that the allergen QR code on the menu opens; "
                        "accessed 2026-10-08, no date shown)")
ALLERGEN_GUIDE_URL = "https://viewthe.menu/czav"
# The page gives each dish "contains" and "may contain" marks and says "we cannot guarantee that every product is 100% nut free or that
# there won't be traces of nuts around the centre": traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Hollywood Bowl prints calories only, beside each item, so protein, carbs and fat are not published. Every figure is printed the "
        "same on all 72 Great Britain bowling-centre menus read; Scottish centres also sell Irn-Bru, and the Puttstars sites and Northern "
        "Ireland use other menus. Alcohol and items with no calories printed are not listed.")
EXPECTED_ITEMS = 106
EXPECTED_PAGE_KCAL = {1: 26, 2: 17, 3: 32, 4: 36, 5: 9, 6: 4}

SNK, BUR, WRA, ADD, KID, BIG, SWE, SLU, SHA, SOF, BOT, HOT, LOW, MIX = (
    "Snacks & sharers", "Burgers & dogs", "Wraps", "Sauces & add-ons", "Kids", "Big kids", "Something sweet", "Slushies", "Shakes",
    "Soft drinks", "Bottled drinks", "Hot drinks", "Low & no alcohol", "Mixers")
CATEGORY_ORDER = [SNK, BUR, WRA, ADD, KID, BIG, SWE, SLU, SHA, SOF, BOT, HOT, LOW, MIX]

ITEMS: dict = {}


def item(key, name, cat, serving="", note="", id=None):
    if key in ITEMS:
        raise SystemExit(f"duplicate item key {key}")
    ITEMS[key] = dict(name=name, cat=cat, serving=serving, note=note, id=id)


# --- items, in menu order (names as printed; tidy capitalisation). Calories come from SPEC, never from here. ---
ADDON = "Printed '+N kcal': the item's own calories, added to the dish"
item("nacho-sharer", "Nacho Sharer", SNK, "Per serving (dish serves 2)", "Printed '(795 kcal per serving)' on a dish that 'serves 2'; whether a serving is the whole sharer or half is not stated")
item("nachos", "Nachos", SNK, "Perfect for one")
item("chicken-tenders", "Chicken Tenders", SNK)
item("chilli-cheese-bites", "Chilli Cheese Bites", SNK)
item("chicken-wings", "Chicken Wings", SNK)
item("popcorn-chicken", "Popcorn Chicken", SNK)
item("margherita-pizza-twist", "Margherita Pizza Twist", SNK)
item("mozzarella-sticks", "Mozzarella Sticks", SNK, "", "Printed 'served with chilli jam (572 kcal)'")
item("onion-rings", "Onion Rings", SNK)
item("corn-ribs", "Corn Ribs", SNK, "", "Marked NEW and VE on the menu")
item("loaded-fries", "Loaded Fries", SNK)
item("hot-loaded-fries", "Hot Loaded Fries", SNK)
item("add-tenders-loaded-fries", "Add Chicken Tenders to Loaded Fries", SNK, "", "Printed 'for £2.00 extra (+224 kcal)'; the menu's footnote says the upgrade is not a full portion of tenders")
item("fries", "Fries (regular)", SNK, "Regular")
item("large-fries", "Large Fries", SNK, "Large")
item("add-cheese-fries", "Add Cheese to Fries", SNK, "", ADDON)
item("seasoned-fries", "Seasoned Fries", SNK, "", "Printed 'Our classic large fries, dusted with seasoning'")
item("hollywood-beef", "The Hollywood Burger (beef)", BUR, "", "Printed '(Beef 1330 kcal, Chicken 1221 kcal)', served with fries")
item("hollywood-chicken", "The Hollywood Burger (chicken)", BUR, "", "Printed '(Beef 1330 kcal, Chicken 1221 kcal)', served with fries")
item("chicken-burger", "Chicken Burger", BUR)
item("beef-burger", "Beef Burger", BUR)
item("plant-based-burger", "Plant-Based Burger", BUR)
item("hot-dog", "Hot Dog", BUR)
item("gluten-free-bun", "Non-Gluten-Containing Bun (bun only)", BUR, "Bun only", "Printed '(175 kcal, bun only)' for beef and plant-based burgers, extra £0.75")
item("chicken-wrap", "Chicken Wrap", WRA, "", "Marked NEW")
item("plant-based-wrap", "Plant-Based Wrap", WRA, "", "Marked NEW")
item("sauce-franks", "Frank's RedHot Sauce", ADD, "", ADDON + "; printed beside every dish that offers it")
item("sauce-chilli-jam", "Chilli Jam", ADD, "", ADDON + "; printed beside every dish that offers it; the Make it yours panel shows a V mark but the chain's allergy page says Chilli Jam is not vegetarian, so it is not tagged")
item("sauce-bbq-dip", "BBQ Dip", ADD, "", ADDON + "; a sauce choice only, not in the Make it yours panel")
item("cheese-slice", "Cheese Slice", ADD, "", ADDON)
item("crispy-onions", "Crispy Onions", ADD, "", ADDON)
item("bacon", "Bacon", ADD, "", ADDON)
item("three-onion-rings", "3 Onion Rings", ADD, "", ADDON)
item("double-burger", "Double Your Burger (from)", ADD, "", "Printed '(from +212 kcal)': a minimum, the figure for other burgers is not printed")
item("upgrade-seasoned-fries", "Upgrade to Seasoned Fries", ADD, "", ADDON)
item("kids-beef-burger", "Beef Burger (kids)", KID)
item("kids-add-bacon", "Add Bacon (kids)", KID, "", ADDON)
item("kids-add-cheese", "Add Cheese (kids)", KID, "", ADDON)
item("kids-chicken-burger", "Chicken Burger (kids)", KID)
item("kids-plant-based-nuggets", "Plant-Based Nuggets (kids)", KID)
item("kids-hot-dog", "Hot Dog (kids)", KID)
item("kids-margherita-pizza-twist", "Margherita Pizza Twist (kids)", KID)
item("kids-chicken-nuggets", "Chicken Nuggets (kids)", KID)
item("big-chicken-nuggets-fries", "Chicken Nuggets & Fries (big kids)", BIG)
item("big-chilli-cheese-bites-fries", "Chilli Cheese Bites & Fries (big kids)", BIG)
item("big-chicken-wings-fries", "Chicken Wings & Fries (big kids)", BIG)
item("big-mozzarella-sticks-fries", "Mozzarella Sticks & Fries (big kids)", BIG, "", "Printed 'served with chilli jam and a side of fries (952 kcal)'")
item("big-chicken-tenders-fries", "Chicken Tenders & Fries (big kids)", BIG)
item("ice-vanilla", "Ice Cream Tub: Vanilla", SWE, "140ml")
item("ice-strawberries", "Ice Cream Tub: Strawberries & Cream", SWE, "140ml")
item("ice-chocolate", "Ice Cream Tub: Chocolate", SWE, "140ml")
item("ice-vegan", "Ice Cream Tub: Vegan Vanilla", SWE, "140ml", "Marked VE")
item("slushy-jacks-small", "Slushy Jack's Slushie (small)", SLU, "Small")
item("slushy-jacks-regular", "Slushy Jack's Slushie (regular)", SLU, "Regular")
item("slushy-jacks-jug", "Slushy Jack's Slushie Jug", SLU, "Per serving (jug serves four children)", "Printed '(94 kcal per serving)'")
item("slushie-2-regular", "Slushie, second range (regular)", SLU, "Regular", "Right-hand price list; its logo is a graphic whose name is not legible in the file")
item("slushie-2-large", "Slushie, second range (large)", SLU, "Large", "Right-hand price list; its logo is a graphic whose name is not legible in the file")
for flavour in ("vanilla", "chocolate", "strawberry", "banana"):
    item(f"shake-{flavour}", f"Milkshake: {flavour.capitalize()}", SHA, "", "Printed under the Milkshakes heading, which carries the V mark; no size is printed")
for key, name in [("pepsi", "Pepsi"), ("diet-pepsi", "Diet Pepsi"), ("pepsi-max", "Pepsi Max"), ("pepsi-max-cherry", "Pepsi Max Cherry"),
                  ("tango-orange", "Tango Orange Sugar Free"), ("7up", "7UP Sugar Free"), ("r-whites", "R. White's Lemonade")]:
    item(f"{key}-regular", f"{name} (regular)", SOF, "Regular")
    item(f"{key}-large", f"{name} (large)", SOF, "Large")
item("raspberry-refresher", "Raspberry Refresher", SOF, "", "One price and figure, printed in the Large column; no size is stated")
item("poppi", "Poppi", SOF, "", "One figure for the product; flavours Wild Berry, Raspberry Rose, Strawberry Lemon")
item("bottle-pepsi", "Pepsi 330ml", BOT, "330ml")
item("bottle-pepsi-max", "Pepsi Max 330ml", BOT, "330ml", "Printed 'Pepsi Max / Diet Pepsi 330ml (2 kcal)': one figure for both drinks")
item("bottle-diet-pepsi", "Diet Pepsi 330ml", BOT, "330ml", "Printed 'Pepsi Max / Diet Pepsi 330ml (2 kcal)': one figure for both drinks")
item("appletiser", "Appletiser 275ml", BOT, "275ml")
item("ginger-beer", "Britvic Ginger Beer 200ml", BOT, "200ml")
item("lipton", "Lipton Peach Iced Tea 500ml", BOT, "500ml")
item("aqua-libra", "Aqua Libra Still or Sparkling Water 330ml can", BOT, "330ml can", "Printed '(0 kcal)'")
for key, name, small, big in [("espresso", "Espresso", "solo", "doppio"), ("americano", "Americano", "primo", "medio"),
                              ("cappuccino", "Cappuccino", "primo", "medio"), ("latte", "Latte", "primo", "medio"),
                              ("mocha", "Mocha", "primo", "medio"), ("hot-chocolate", "Hot Chocolate", "primo", "medio")]:
    iced = "; the menu also offers it iced ('Make me iced') with no calories printed" if key in ("americano", "latte") else ""
    for tag, label in ((small, small), (big, big)):
        item(f"{key}-{tag}", f"{name} ({label})", HOT, label.capitalize(), (f"Size names as printed; Primo and Medio headings are printed once above Americano{iced}" if key != "espresso" else "Size names as printed"))
item("english-breakfast-tea", "English Breakfast Tea", HOT, "", "One price and figure, printed in the right-hand size column; no size is stated")
item("cranberry-peppermint-tea", "Cranberry & Raspberry or Peppermint Tea", HOT, "", "One figure printed for the two teas; one price, no size stated")
item("corona-cero", "Corona Cero 0.0%", LOW, "330ml")
item("madri-zero", "Madrí Excepcional Zero", LOW, "330ml", id="madri-excepcional-zero")
item("becks-blue", "Beck's Blue", LOW, "275ml", "Printed '0.05% ABV'")
item("rekorderlig-af", "Rekorderlig Alcohol Free Strawberry & Lime", LOW, "500ml")
item("fever-tree-indian", "Fever-Tree Indian Tonic Water", MIX, "200ml")
item("fever-tree-light", "Fever-Tree Refreshingly Light Tonic Water", MIX, "200ml", "Printed under the Fever-Tree heading")
item("red-bull", "Red Bull", MIX, "250ml")
item("red-bull-peach", "Red Bull The Peach Edition", MIX, "250ml")

# Read from the Ashford PDF and checked, but NOT published: not printed on every Great Britain bowling-centre menu (see --compare).
NOT_PUBLISHED = {
    "fizzy-fruit-blast": "Non-alcoholic cocktails page differs by centre: absent from 9 of 72 GB bowling-centre menus (which print other drinks there)",
    "strawberry-mint-cooler": "as Fizzy Fruit Blast: absent from 9 of 72",
    "hollywood-sunset": "as Fizzy Fruit Blast: absent from 9 of 72",
    "mango-punch": "as Fizzy Fruit Blast: absent from 9 of 72",
    "guinness-zero": "Guinness 0.0% is printed on only 24 of 72 GB bowling-centre menus",
}

# (V)/(VE) icons beside the names, read from the rendered pages. "VE" items are also vegetarian. Cross-checked against the "Vegetarian" and
# "Vegan" marks of the chain's allergy page for 38 items whose names match exactly: all agree except Chilli Jam, where the menu prints a V
# but the allergy page says not vegetarian. Chilli Jam is therefore NOT tagged (two official sources disagree).
VEGETARIAN = {
    "nacho-sharer", "nachos", "chilli-cheese-bites", "margherita-pizza-twist", "mozzarella-sticks", "onion-rings", "corn-ribs",
    "loaded-fries", "hot-loaded-fries", "fries", "large-fries", "add-cheese-fries", "seasoned-fries",
    "plant-based-burger", "plant-based-wrap", "sauce-franks", "cheese-slice", "crispy-onions", "three-onion-rings",
    "upgrade-seasoned-fries", "kids-add-cheese", "kids-plant-based-nuggets", "kids-margherita-pizza-twist",
    "big-chilli-cheese-bites-fries", "big-mozzarella-sticks-fries", "ice-vanilla", "ice-strawberries", "ice-chocolate", "ice-vegan",
    "shake-vanilla", "shake-chocolate", "shake-strawberry", "shake-banana",
}
PORK_ITEMS = {"hollywood-beef", "hollywood-chicken", "hot-dog", "bacon", "kids-add-bacon", "kids-hot-dog"}   # bacon / "a pork hot dog"
BEEF_ITEMS = {"hollywood-beef", "beef-burger", "kids-beef-burger"}
PORK = re.compile(r"\b(pork|bacon)\b", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
SEGMENT_MAY_MENTION_MEAT = {"gluten-free-bun"}   # its text block also holds "Our beef and plant-based burgers" and a photo caption
SHARED_BEEF_OR_CHICKEN_TEXT = {"hollywood-chicken"}   # "Choose a beef or chicken burger ... (Beef 1330 kcal, Chicken 1221 kcal)": one text, two items

SAUCES = (r"Frank.s.{0,3}RedHot.{0,3} sauce \(\+(\d+) kcal\), chilli jam \(\+(\d+) kcal\) or BBQ dip \(\+(\d+) kcal\)",
          ["sauce-franks", "sauce-chilli-jam", "sauce-bbq-dip"])
PLUS = r"\(\+(\d+) kcal\)"
PRICE_PAIR = r"£[\d.]+ \((\d+) kcal\) £[\d.]+ \((\d+) kcal\)"
PRICE_ONE = r"£[\d.]+ \((\d+) kcal\)"


def fries(key):
    return (r"side of fries \((\d+) kcal\)", [key])


# region -> [(anchor regex, [(value regex with one group per number, [item keys]), ...]), ...]; anchors are searched in this order.
SPEC = {
    "p1L": [
        (r"Nacho Sharer", [(r"\((\d+) kcal per serving\)", ["nacho-sharer"])]),
        (r"Nachos £", [(r"Perfect for one \((\d+) kcal\)", ["nachos"])]),
        (r"Chicken Tenders £", [(r"fillets \((\d+) kcal\)", ["chicken-tenders"]), SAUCES]),
        (r"Chilli Cheese Bites £", [(r"crumb \((\d+) kcal\)", ["chilli-cheese-bites"])]),
        (r"Chicken wings £", [(r"Chicken wings \((\d+) kcal\)", ["chicken-wings"]), SAUCES]),
        (r"POPCORN CHICKEN £", [(r"Crispy popcorn chicken \((\d+) kcal\)", ["popcorn-chicken"]), SAUCES]),
        (r"(?i:Margherita Pizza Twist) £", [(r"with a twist \((\d+) kcal\)", ["margherita-pizza-twist"])]),
        (r"(?i:mozzarella sticks) £", [(r"served with chilli jam \((\d+) kcal\)", ["mozzarella-sticks"])]),
    ],
    "p1R": [
        (r"ONION RINGS £", [(r"breadcrumbs \((\d+) kcal\)", ["onion-rings"])]),
        (r"Corn Ribs", [(r"lime \((\d+) kcal\)", ["corn-ribs"])]),
        (r"LOADED FRIES £", [(r"BBQ sauce \((\d+) kcal\)", ["loaded-fries"])]),
        (r"Hot Loaded Fries £", [(r"sauce \((\d+) kcal\)", ["hot-loaded-fries"])]),
        (r"ADD CHICKEN TENDERS TO OUR LOADED FRIES", [(PLUS, ["add-tenders-loaded-fries"])]),
        (r"FRIES \(", [(r"^FRIES \((\d+) kcal\)", ["fries"])]),
        (r"LARGE FRIES", [(r"^LARGE FRIES \((\d+) kcal\)", ["large-fries"])]),
        (r"Add cheese to fries", [(PLUS, ["add-cheese-fries"])]),
        (r"SEASONED FRIES £", [(r"flavour \((\d+) kcal\)", ["seasoned-fries"])]),
    ],
    "p2L": [
        (r"The Hollywood Burger £", [(r"\(Beef (\d+) kcal, Chicken (\d+) kcal\)", ["hollywood-beef", "hollywood-chicken"])]),
        (r"Chicken Burger £", [fries("chicken-burger")]),
        (r"Beef Burger £", [fries("beef-burger")]),
        (r"Plant-Based Burger £", [fries("plant-based-burger")]),
        (r"HOT DOG £", [fries("hot-dog")]),
        (r"Our beef and plant-based burgers", [(r"\((\d+) kcal, bun only\)", ["gluten-free-bun"])]),
    ],
    "p2R": [
        (r"Chicken Wrap", [(r"chips \((\d+) kcal\)", ["chicken-wrap"])]),
        (r"Plant-Based Wrap", [(r"chips \((\d+) kcal\)", ["plant-based-wrap"])]),
        (r"Chilli Jam \(", [(PLUS, ["sauce-chilli-jam"])]),
        (r"Frank.s.{0,3} RedHot.{0,3} Sauce \(", [(PLUS, ["sauce-franks"])]),
        (r"Cheese Slice \(", [(PLUS, ["cheese-slice"])]),
        (r"Crispy Onions \(", [(PLUS, ["crispy-onions"])]),
        (r"Bacon \(", [(PLUS, ["bacon"])]),
        (r"3 Onion Rings \(", [(PLUS, ["three-onion-rings"])]),
        (r"Double Your Burger", [(r"\(from \+(\d+) kcal\)", ["double-burger"])]),
        (r"Upgrade to Seasoned Fries", [(PLUS, ["upgrade-seasoned-fries"])]),
    ],
    "p3L": [
        (r"Beef Burger £", [fries("kids-beef-burger")]),
        (r"Add bacon", [(r"^Add bacon \(\+(\d+) kcal\)", ["kids-add-bacon"])]),
        (r"Add cheese", [(r"^Add cheese \(\+(\d+) kcal\)", ["kids-add-cheese"])]),
        (r"Chicken Burger £", [fries("kids-chicken-burger")]),
        (r"PLANT-BASED NUGGETS £", [fries("kids-plant-based-nuggets")]),
        (r"HOT DOG £", [fries("kids-hot-dog")]),
        (r"Margherita Pizza Twist £", [(r"with a twist \((\d+) kcal\)", ["kids-margherita-pizza-twist"])]),
        (r"Chicken Nuggets £", [fries("kids-chicken-nuggets")]),
        (r"Ice cream TUB", [(r"Vanilla Strawberries & Cream 140ml \((\d+) kcal\) 140ml \((\d+) kcal\) Chocolate Vegan Vanilla Ice Cream "
                             r"140ml \((\d+) kcal\) 140ml \((\d+) kcal\)", ["ice-vanilla", "ice-strawberries", "ice-chocolate", "ice-vegan"])]),
        (r"SLUSHIES", [(r"Small \((\d+) kcal\) £[\d.]+ Regular \((\d+) kcal\) £[\d.]+ Regular \((\d+) kcal\) £[\d.]+ Large \((\d+) kcal\) "
                        r"£[\d.]+ Jug serves four children £[\d.]+ \((\d+) kcal per serving\)",
                        ["slushy-jacks-small", "slushie-2-regular", "slushy-jacks-regular", "slushie-2-large", "slushy-jacks-jug"])]),
    ],
    "p3R": [
        (r"Chicken nuggets & fries £", [fries("big-chicken-nuggets-fries")]),
        (r"Chilli Cheese Bites & Fries £", [fries("big-chilli-cheese-bites-fries")]),
        (r"Chicken Wings & Fries £", [SAUCES, fries("big-chicken-wings-fries")]),
        (r"Mozzarella Sticks & Fries £", [fries("big-mozzarella-sticks-fries")]),
        (r"Chicken Tenders & Fries £", [SAUCES, fries("big-chicken-tenders-fries")]),
        (r"milkshakes", [(r"vanilla \((\d+) kcal\) \| chocolate \((\d+) kcal\) strawberry \((\d+) kcal\) \| banana \((\d+) kcal\)",
                          ["shake-vanilla", "shake-chocolate", "shake-strawberry", "shake-banana"])]),
    ],
    "p4L": [
        (r"Pepsi £", [(PRICE_PAIR, ["pepsi-regular", "pepsi-large"])]),
        (r"Diet Pepsi £", [(PRICE_PAIR, ["diet-pepsi-regular", "diet-pepsi-large"])]),
        (r"Pepsi Max £", [(PRICE_PAIR, ["pepsi-max-regular", "pepsi-max-large"])]),
        (r"Pepsi Max Cherry £", [(PRICE_PAIR, ["pepsi-max-cherry-regular", "pepsi-max-cherry-large"])]),
        (r"Tango Orange £", [(PRICE_PAIR, ["tango-orange-regular", "tango-orange-large"])]),
        (r"7UP sugar Free £", [(PRICE_PAIR, ["7up-regular", "7up-large"])]),
        (r"R\. White.s £", [(PRICE_PAIR, ["r-whites-regular", "r-whites-large"])]),
        (r"Raspberry Refresher", [(PRICE_ONE, ["raspberry-refresher"])]),
        (r"Poppi £", [(r"flavours\. \((\d+) kcal\)", ["poppi"])]),
    ],
    "p4R": [
        (r"J2O 275ml", []),
        (r"Pepsi 330ml", [(r"^Pepsi 330ml \((\d+) kcal\)", ["bottle-pepsi"])]),
        (r"Pepsi Max / Diet Pepsi 330ml", [(r"330ml \((\d+) kcal\)", ["bottle-pepsi-max", "bottle-diet-pepsi"])]),
        (r"Appletiser 275ml", [(r"275ml \((\d+) kcal\)", ["appletiser"])]),
        (r"(?i:britvic ginger beer) 200ml", [(r"200ml \((\d+) kcal\)", ["ginger-beer"])]),
        (r"Lipton Peach Iced Tea 500ml", [(r"500ml \((\d+) kcal\)", ["lipton"])]),
        (r"Robinsons Ready to Drink 500ml", []),
        (r"Fruit Shoot 275ml", []),
        (r"Aqua Libra Still or", [(r"can \((\d+) kcal\)", ["aqua-libra"])]),
        (r"ESPRESSO", [(PRICE_PAIR, ["espresso-solo", "espresso-doppio"])]),
        (r"(?i:americano) £", [(PRICE_PAIR, ["americano-primo", "americano-medio"])]),
        (r"(?i:cappuccino) £", [(PRICE_PAIR, ["cappuccino-primo", "cappuccino-medio"])]),
        (r"Latte £", [(PRICE_PAIR, ["latte-primo", "latte-medio"])]),
        (r"Mocha £", [(PRICE_PAIR, ["mocha-primo", "mocha-medio"])]),
        (r"(?i:hot chocolate) £", [(PRICE_PAIR, ["hot-chocolate-primo", "hot-chocolate-medio"])]),
        (r"(?i:english) £", [(PRICE_ONE, ["english-breakfast-tea"])]),
        (r"Cranberry & raspberry", [(PRICE_ONE, ["cranberry-peppermint-tea"])]),
    ],
    "p5L": [],
    "p5R": [
        (r"Fizzy Fruit Blast £", [(r"\((\d+) kcal\)", ["fizzy-fruit-blast"])]),
        (r"Strawberry Mint Cooler £", [(r"\((\d+) kcal\)", ["strawberry-mint-cooler"])]),
        (r"Hollywood Sunset £", [(r"\((\d+) kcal\)", ["hollywood-sunset"])]),
        (r"Mango & Passion Fruit Punch £", [(r"\((\d+) kcal\)", ["mango-punch"])]),
        (r"Corona Cero 0\.0% £", [(r"330ml 0\.0% ABV \((\d+) kcal\)", ["corona-cero"])]),
        (r"Madr. Excepcional ZERO £", [(r"330ml 0\.0% ABV \((\d+) kcal\)", ["madri-zero"])]),
        (r"Beck.s Blue £", [(r"275ml 0\.05% ABV \((\d+) kcal\)", ["becks-blue"])]),
        (r"Rekorderlig Alcohol Free £", [(r"Strawberry & Lime 500ml 0% ABV \((\d+) kcal\)", ["rekorderlig-af"])]),
        (r"Guinness 0\.0% £", [(r"558ml 0\.0% ABV \((\d+) kcal\)", ["guinness-zero"])]),
    ],
    "p6M": [
        (r"Fever-Tree", [(r"Indian Tonic Water £[\d.]+ 200ml \((\d+) kcal\)", ["fever-tree-indian"])]),
        (r"Refreshingly Light", [(r"Tonic Water 200ml \((\d+) kcal\)", ["fever-tree-light"])]),
        (r"RED BULL £", [(r"250ml \((\d+) kcal\)", ["red-bull"])]),
        (r"RED BULL The Peach Edition", [(r"250ml \((\d+) kcal\)", ["red-bull-peach"])]),
    ],
}


def extract(pdf: Path, strict: bool = True) -> dict:
    """Read one centre's PDF with SPEC. Returns {values: key -> calories as printed, printed: key -> matched text, segments:
    key -> text block, problems: [...]}. strict=True raises on the first problem (the build); False collects them (--compare)."""
    texts = pdf_reader.region_texts(pdf)
    page_counts = pdf_reader.page_kcal_counts(pdf)
    problems: list = []

    def problem(msg: str) -> None:
        if strict:
            raise SystemExit(f"Hollywood Bowl menu does not match SPEC: {msg}. Re-read the menu and update hollywood_bowl.py.")
        problems.append(msg)

    values: dict = {}
    printed: dict = {}
    segments: dict = {}
    page_tokens: dict = {}
    for rid, entries in SPEC.items():
        text = texts[rid]
        found = []
        pos = 0
        for anchor, vals in entries:
            m = re.compile(anchor).search(text, pos)
            if not m:
                problem(f"{rid}: anchor {anchor!r} not found after character {pos}")
                continue
            found.append((m.start(), vals, anchor))
            pos = m.end()
        n_tokens = len(pdf_reader.KCAL.findall(text))
        page_tokens[REGION_PAGE[rid]] = page_tokens.get(REGION_PAGE[rid], 0) + n_tokens
        claimed_total = 0
        before = text[:found[0][0]] if found else text
        if pdf_reader.KCAL.search(before):
            problem(f"{rid}: a kcal figure printed before the first anchor: {before[-80:]!r}")
        for i, (start, vals, anchor) in enumerate(found):
            end = found[i + 1][0] if i + 1 < len(found) else len(text)
            seg = text[start:end]
            tokens = [m.start() for m in pdf_reader.KCAL.finditer(seg)]
            claimed = set()
            for vre, keys in vals:
                m = re.search(vre, seg)
                if not m:
                    problem(f"{rid}: {anchor!r}: pattern {vre!r} not found in {seg[:160]!r}")
                    continue
                groups = m.groups()
                if len(groups) != len(keys) and not (len(groups) == 1 and len(keys) > 1):
                    raise SystemExit(f"SPEC error: {len(groups)} numbers for keys {keys}")
                for gi in range(len(groups)):
                    claimed.add(m.start(gi + 1))
                for ki, key in enumerate(keys):
                    value = groups[ki if len(groups) == len(keys) else 0]
                    if key in values and values[key] != value:
                        problem(f"{rid}: {key} printed as {value} here but {values[key]} elsewhere")
                    values.setdefault(key, value)
                    printed.setdefault(key, " ".join(m.group(0).split())[:140])
                    segments.setdefault(key, seg)
            claimed_total += len(claimed)
            if len(claimed) != len(tokens):
                problem(f"{rid}: {anchor!r}: {len(tokens)} kcal figures printed but {len(claimed)} claimed in {seg[:200]!r}")
    for page, expected in page_counts.items():
        if page_tokens.get(page, 0) != expected:
            problem(f"page {page}: {expected} kcal figures printed but the columns hold {page_tokens.get(page, 0)}")
    return dict(values=values, printed=printed, segments=segments, problems=problems)


REGION_PAGE = {rid: spec[0] for rid, spec in pdf_reader.REGIONS.items()}


def build_items(result: dict) -> list:
    values, printed, segments = result["values"], result["printed"], result["segments"]
    missing = [k for k in list(ITEMS) + list(NOT_PUBLISHED) if k not in values]
    extra = [k for k in values if k not in ITEMS and k not in NOT_PUBLISHED]
    if missing or extra:
        raise SystemExit(f"Items without calories in the PDF: {missing}; calories read for items not in ITEMS: {extra}")
    for key in PORK_ITEMS | BEEF_ITEMS | set(VEGETARIAN):
        if key not in ITEMS:
            raise SystemExit(f"tag set names unknown item {key}")
    items = []
    for key, it in ITEMS.items():
        seg = segments[key]
        meat_text = it["name"] + " " + seg
        if key not in SEGMENT_MAY_MENTION_MEAT:
            if key in PORK_ITEMS and not PORK.search(meat_text) and "hot dog" not in meat_text.lower():
                raise SystemExit(f"{key}: tagged pork but neither the name nor its description says pork, bacon or hot dog")
            if key in BEEF_ITEMS and not BEEF.search(meat_text):
                raise SystemExit(f"{key}: tagged beef but the text does not say beef")
            if key not in PORK_ITEMS and PORK.search(meat_text):
                raise SystemExit(f"{key}: the text says pork/bacon but the item has no pork tag: {meat_text[:200]!r}")
            if key not in BEEF_ITEMS and key not in SHARED_BEEF_OR_CHICKEN_TEXT and BEEF.search(meat_text):
                raise SystemExit(f"{key}: the text says beef but the item has no beef tag: {meat_text[:200]!r}")
        tags = [t for t, s in (("vegetarian", VEGETARIAN), ("contains_pork", PORK_ITEMS), ("contains_beef", BEEF_ITEMS)) if key in s]
        note = "; ".join(x for x in (f"Printed '{printed[key]}'", it["note"]) if x)
        items.append(dict(name=it["name"], id=it["id"], category=it["cat"], serving=it["serving"], calories=values[key],
                          tags="|".join(tags), rankable=False, notes=note))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items


NORTHERN_IRELAND = {"banbridge", "belfast"}


def compare(directory: Path) -> None:
    """Read every centre PDF with the same patterns. A centre counts as a Great Britain BOWLING centre when it is not in Northern Ireland
    and its file name has no 'putt-play' (the Puttstars mini-golf sites have their own menu with other recipes, e.g. a Hollywood
    Burger without bacon at 1191 kcal at Harrow). Prints, per item, in how many bowling centres it is printed with Ashford's number, with another number, or not
    at all, then each centre that differs."""
    results = {}
    for pdf in sorted(directory.glob("*.pdf")):
        results[pdf.stem] = extract(pdf, strict=False)
    if "ashford" not in results:
        raise SystemExit("no ashford.pdf in the folder to compare against")
    base = results["ashford"]["values"]
    bowling = {n: r for n, r in results.items() if n not in NORTHERN_IRELAND and "putt-play" not in n}
    for n in results:
        if n not in bowling:
            print(f"left out: {n}: " + ("Northern Ireland (the file prints calories for at most a few items)" if n in NORTHERN_IRELAND else "Puttstars mini-golf site"))
    print(f"{len(bowling)} bowling centres read, {len(results)} PDFs in the folder")
    for key in list(ITEMS) + list(NOT_PUBLISHED):
        same = [n for n, r in bowling.items() if r["values"].get(key) == base.get(key)]
        other = [(n, r["values"][key]) for n, r in bowling.items() if key in r["values"] and r["values"][key] != base.get(key)]
        absent = [n for n, r in bowling.items() if key not in r["values"]]
        if len(same) != len(bowling):
            print(f"{key} ({'NOT PUBLISHED' if key in NOT_PUBLISHED else 'published'}): same in {len(same)}, other number in {other}, absent in {len(absent)}: {absent[:12]}")
    unread = sorted({k for r in bowling.values() for k in r["values"]} - set(ITEMS) - set(NOT_PUBLISHED))
    print("calories read by the patterns for keys not in ITEMS:", unread)
    for n, r in bowling.items():
        odd = [p for p in r["problems"] if "p5R" not in p]
        if odd:
            print(f"{n} [{pdf_reader.centre_name(directory / (n + '.pdf'))}]: " + " | ".join(p[:200] for p in odd))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL), or with --compare a folder of centre PDFs")
    ap.add_argument("--checked-on", help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--compare", action="store_true", help="compare every PDF in the folder against ashford.pdf and print the differences")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.compare:
        compare(args.pdf)
        return
    if not args.checked_on:
        raise SystemExit("--checked-on is required")
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    centre = pdf_reader.centre_name(args.pdf)
    if centre != "Ashford":
        raise SystemExit(f"The PDF is for centre {centre!r}; SOURCE_URL and SOURCE_TITLE name the Ashford copy")
    result = extract(args.pdf)
    items = build_items(result)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Hollywood Bowl", cuisine="Bowling diner", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))


if __name__ == "__main__":
    main()
