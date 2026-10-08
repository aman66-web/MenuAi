#!/usr/bin/env python3
"""Build data/source/fat-hippo/ from Fat Hippo's own website (the nutrition panel inside every dish modal).

    # one download per page, normal browser user-agent, at most 1 request/second (see docs/UK_DATA_PLAYBOOK.md):
    mkdir pages && cd pages
    for p in food drinks kids special-menu; do curl -sS -L -A 'Mozilla/5.0 ...' -o $p.html https://fathippo.co.uk/menus/$p/; sleep 2; done
    python3 tools/uk_extract/fat_hippo.py pages --checked-on 2026-10-06

Numbers are copied from each panel as printed: "per 1 serving", whole grams (kcal, fat, saturates, carbohydrate, sugars,
fibre, protein, salt). Trans fat and added sugar are not used: on 2026-10-06 every panel (134) printed "0g" for both, even
milkshakes for added sugar and beef burgers for trans fat, so those two lines look unfilled rather than measured. Only NAMES, categories and flags below are typed by hand,
in the pages' reading order. If Fat Hippo adds, removes, renames or reorders a dish (or a panel changes its layout, its
unit or gets a second diet tab) the rows no longer match ROWS and this script stops, so a human re-checks the names.

Rows whose own printed numbers cannot be true are NOT corrected: they go to holdback.csv (see impossible()). The rule is
evaluated on every run, so a corrected page brings the row back automatically.

Pages: https://fathippo.co.uk/menus/food/ (the source_url), /menus/kids/, /menus/drinks/, /menus/special-menu/.
The pages show no issue date: chain.csv says "accessed <date>, no date shown".

Allergens (docs/DATA.md "Allergens"): Fat Hippo's allergen page https://fathippo.co.uk/allergens/ says the allergen details
are the ones in each dish's modal on these same menu pages. Each modal lists the dish's parts, each with its own allergens
(or "No Known Allergens") and a "May Contain" list; under the card the page repeats the dish's whole list ("May Contain X" for
traces). read_allergens() reads both and stops if they disagree. Garlic and Onion are printed too but are not among the 14,
so they are skipped. A dish with a part that prints no allergen statement at all (not even "No Known Allergens") is not
complete, so it gets no allergens; then (all or nothing) only the guide link is written. When the generic "Cereal - Gluten"
appears next to "Barley", the cereals are not named (the generic one may be wheat), so the list doesn't read "barley" only.
The allergen page also says "all dishes may contain traces of nuts, as peanuts are present on the premises", which the
per-dish lists don't repeat: per-dish allergens are only written once NUT_NOTICE_DECIDED says how to show that.
"""
from __future__ import annotations
import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "fat-hippo"
SOURCE_URL = "https://fathippo.co.uk/menus/food/"
PAGES = {"food": "food.html", "special": "special-menu.html", "kids": "kids.html", "drinks": "drinks.html"}

ST, BB, CB, VB = "Starters", "Beef burgers", "Chicken burgers", "Veggie & vegan burgers"
UP, FH, SD, SA, DE = "Upgrades", "Fast Hippo (weekdays until 4pm)", "Sides", "Sauces", "Desserts"
SP = "Specials"
KM, KT, KS, KD, KSH = "Kids mains", "Kids toppings & sauces", "Kids sides", "Kids drinks", "Kids shakes"
DCO, DHS, DSH, DSO = "Cocktails & shots", "Hard shakes", "Shakes", "Soft drinks"

# Sections the chain itself labels veggie / vegan (the burger section says "Veggie as standard. Switch to vegan? Just ask!").
VEG_SECTIONS = {"VEGGIE / Vegan", "Veggie / Vegan Starters"}
# Drinks sections that are alcoholic: their calories legitimately exceed 4P+4C+9F (alcohol is 7 kcal/g).
ALCOHOL_SECTIONS = {"Cocktails", "Hard Shakes", "Naughty Shots", "Sparkling"}
UPGRADE_NOTE = "Burger-meal upgrade option (the page's Upgrades section)."

ALLERGEN_URL = "https://fathippo.co.uk/allergens/"
# Fat Hippo's own spellings (the dish lists and the allergen filter): lower-case word -> (key, specific).
ALLERGEN_EXTRA = {"cereal - gluten": ("gluten", None), "crustaeceans": ("crustaceans", None)}
NOT_14 = {"garlic", "onion"}            # printed as allergens by the page, but not among the 14 UK allergens
NONE_WORD = "No Known Allergens"
# Founder's decision needed (see docstring) before per-dish allergens are published; until then: guide link only.
NUT_NOTICE_DECIDED = False


def it(section, title, name, category, rankable=True, limited=False, note=""):
    return {"kind": "item", "section": section, "title": title, "table": True, "name": name, "category": category,
            "rankable": rankable, "limited": limited, "note": note}


def dup(section, title, of_section, of_title):
    return {"kind": "dup", "section": section, "title": title, "table": True, "of": (of_section, of_title)}


def skip(section, title, reason):
    """A dish that prints no nutrition panel: left out (reason is for this file and the report)."""
    return {"kind": "skip", "section": section, "title": title, "table": False, "reason": reason}


NO_PANEL = "no nutrition panel on the page"
ROWS: dict[str, list[dict]] = {
    "food": [
        it("Starters", "FRICKLES", "Frickles", ST, False),
        it("Starters", "CORN RIBS", "Corn Ribs", ST, False,
           note="Also listed under Veggie / Vegan Starters with identical numbers; one row kept."),
        it("Starters", "TRASH BROWNS", "Trash Browns", ST, False,
           note="Also listed under Veggie / Vegan Starters with identical numbers; one row kept."),
        it("Starters", "CHEESEBALLS", "Cheeseballs", ST, False,
           note="Also listed under Veggie / Vegan Starters with identical numbers; one row kept."),
        it("Starters", "FREDDIES FINGERS: BUFFALO", "Freddies Fingers: Buffalo", ST, False),
        it("Starters", "FREDDIES FINGERS: CRACK", "Freddies Fingers: Crack", ST, False),
        it("Starters", "FREDDIES FINGERS: WHITE RABBIT", "Freddies Fingers: White Rabbit", ST, False),
        it("Veggie / Vegan Starters", "VEGAN FRICKLES", "Vegan Frickles", ST, False),
        dup("Veggie / Vegan Starters", "CORN RIBS", "Starters", "CORN RIBS"),
        dup("Veggie / Vegan Starters", "TRASH BROWNS", "Starters", "TRASH BROWNS"),
        dup("Veggie / Vegan Starters", "CHEESEBALLS", "Starters", "CHEESEBALLS"),
        it("Beef", "PLAIN AYLI BEEF", "Plain Ayli Beef", BB),
        it("Beef", "BIG POPPA", "Big Poppa", BB),
        it("Beef", "AMERICAN", "American", BB),
        it("Beef", "WILD BILL", "Wild Bill", BB),
        it("Beef", "UNCLE PHIL", "Uncle Phil", BB),
        it("Beef", "FAT HIPPO", "Fat Hippo", BB),
        it("Beef", "BORN SLIPPY", "Born Slippy", BB),
        it("Chicken", "PLAIN AYLI - CHICKEN", "Plain Ayli - Chicken", CB),
        it("Chicken", "TRIPLE G", "Triple G", CB),
        it("Chicken", "WHITE RABBIT", "White Rabbit", CB),
        it("Chicken", "HANGOVER III", "Hangover III", CB),
        it("Chicken", "BRUCE ALMIGHTY", "Bruce Almighty", CB),
        it("VEGGIE / Vegan", "FIVE LIES", "Five Lies", VB),
        it("VEGGIE / Vegan", "HARLEM FAKE", "Harlem Fake", VB),
        it("VEGGIE / Vegan", "NOTORIOUS VFC 2.0", "Notorious VFC 2.0", VB),
        it("Upgrades", "Hand Cut Fries", "Hand Cut Fries (upgrade)", UP, False,
           note=UPGRADE_NOTE + " The page prints 424 kcal here and for the kids' portion but 113 kcal for the HANDCUT FRIES side."),
        it("Upgrades", "Purple 'Slaw", "Purple 'Slaw (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Tater tots", "Tater Tots (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Superfries Me!", "Superfries Me! (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Dirty Hand Cut Fries", "Dirty Hand Cut Fries (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Vegan Dirty Hand Cut Fries", "Vegan Dirty Hand Cut Fries (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Dirty tater tots", "Dirty Tater Tots (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Vegan Dirty tots", "Vegan Dirty Tots (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "5oz Beef Patty", "5oz Beef Patty (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Vegan Patty", "Vegan Patty (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "Buttermilk Chicken Breast", "Buttermilk Chicken Breast (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Upgrades", "2x chicken tenders", "2x Chicken Tenders (upgrade)", UP, False,
           note=UPGRADE_NOTE + " Prints exactly the numbers of the Buttermilk Chicken Breast upgrade."),
        it("Upgrades", "Vegan chkn", "Vegan Chkn (upgrade)", UP, False, note=UPGRADE_NOTE),
        it("Fast Hippo", "LITTLE AMERICAN", "Little American", FH),
        it("Fast Hippo", "LITTLE HIPPO", "Little Hippo", FH),
        it("Fast Hippo", "LITTLE LIES", "Little Lies", FH),
        it("Fast Hippo", "LITTLE BUFFALO", "Little Buffalo", FH),
        it("Fast Hippo", "LITTLE CRACK STRIPS", "Little Crack Strips", FH),
        it("Fast Hippo", "LITTLE WHITE RABBIT", "Little White Rabbit", FH),
        it("Sides", "HANDCUT FRIES", "Handcut Fries", SD,
           note="The page prints 113 kcal for this side but 424 kcal for the Hand Cut Fries upgrade and the kids' portion; it does not say why."),
        it("Sides", "TATER TOTS", "Tater Tots", SD),
        it("Sides", "PURPLE SLAW SIDE", "Purple Slaw Side", SD),
        it("Sides", "DIRTY HANDCUT FRIES", "Dirty Handcut Fries", SD),
        it("Sides", "DIRTY TOTS", "Dirty Tots", SD),
        it("Sides", "VEGAN DIRTY HANDCUT FRIES", "Vegan Dirty Handcut Fries", SD),
        it("Sides", "VEGAN DIRTY TOTS", "Vegan Dirty Tots", SD),
        it("Sides", "3x ONION RINGS", "3x Onion Rings", SD),
        it("Sides", "5X ONION RINGS", "5x Onion Rings", SD),
        it("Sauces", "BBQ", "BBQ", SA, False),
        it("Sauces", "CHEESE WHIZ MAYO", "Cheese Whiz Mayo", SA, False),
        it("Sauces", "CAROLINA BBQ", "Carolina BBQ", SA, False),
        it("Sauces", "Fat Hippo Sauce", "Fat Hippo Sauce", SA, False),
        it("Sauces", "Vegan Fat Hippo Sauce", "Vegan Fat Hippo Sauce", SA, False),
        it("Sauces", "Garlic Butter Mayo", "Garlic Butter Mayo", SA, False),
        it("Sauces", "Hot Honey", "Hot Honey", SA, False),
        it("Sauces", "Cream Cheese Aioli", "Cream Cheese Aioli", SA, False),
        it("Sauces", "Buffalo Sauce", "Buffalo Sauce", SA, False),
        it("Sauces", "Ranch", "Ranch", SA, False),
        it("Sauces", "Blue Cheese Ranch", "Blue Cheese Ranch", SA, False),
        it("Sauces", "Ketchup", "Ketchup", SA, False),
        it("Sauces", "Mayo", "Mayo", SA, False),
        it("Sauces", "Vegan Mayo", "Vegan Mayo", SA, False),
        it("Sauces", "Mustard", "Mustard", SA, False),
        it("Desserts", "Baby Spice", "Baby Spice", DE, False),
        it("Desserts", "Lamar's Bar", "Lamar's Bar", DE, False),
        it("Desserts", "Gimme S'more!", "Gimme S'more!", DE, False),
        it("Desserts", "Ice Cream Cookie Sandwich", "Ice Cream Cookie Sandwich", DE, False),
    ],
    "special": [
        it("", "BIG POPPA", "Big Poppa (special menu)", SP, True, True,
           note="Special menu version: a double beef patty and a bacon crumb; not the Big Poppa of the main menu. The page says 'Grab yours now before it disappears!'"),
        it("", "HYPNOTIZE FRIES", "Hypnotize Fries (special menu)", SP, True, True, note="Listed on the Special menu page."),
    ],
    "kids": [
        it("Choose A Burger", "Kids Beef Burger", "Kids Beef Burger", KM, False,
           note="A patty in a brioche; toppings, sauce, garnish, side and drink are chosen separately (page text)."),
        it("Choose A Burger", "Kids Chicken Burger", "Kids Chicken Burger", KM, False),
        it("Choose A Burger", "Kids VFC Burger", "Kids VFC Burger", KM, False),
        it("Choose A Burger", "Kids Vegan Burger", "Kids Vegan Burger", KM, False),
        it("Don't Fancy A Burger?", "Kids Chicken Fingers", "Kids Chicken Fingers", KM, False,
           note="Served with a choice of one side and one sauce (page text); those are listed separately."),
        it("Add Your Toppings", "Bacon", "Bacon (kids burger topping)", KT, False),
        it("Add Your Toppings", "Cheese", "Cheese (kids burger topping)", KT, False),
        it("Add Your Toppings", "Onion Ring", "Onion Ring (kids burger topping)", KT, False),
        it("Add Your Toppings", "Fakon", "Fakon (kids burger topping)", KT, False),
        it("Add Your Toppings", "Vegan Cheese", "Vegan Cheese (kids burger topping)", KT, False),
        it("Select A Sauce", "Kids Ketchup", "Kids Ketchup", KT, False),
        it("Select A Sauce", "Kids Fat Hippo Sauce", "Kids Fat Hippo Sauce", KT, False),
        it("Select A Sauce", "Kids Mayo", "Kids Mayo", KT, False),
        it("Select A Sauce", "Kids Vegan Fat Hippo Sauce", "Kids Vegan Fat Hippo Sauce", KT, False),
        skip("Select A Sauce", "Kids Mustard", NO_PANEL),
        it("Select A Sauce", "Kids BBQ", "Kids BBQ", KT, False),
        it("Here's The Garnish", "Lettuce", "Lettuce (kids burger garnish)", KT, False),
        it("Here's The Garnish", "Pickles", "Pickles (kids burger garnish)", KT, False),
        it("Pick Your Side", "Kids Hand Cut Fries", "Kids Hand Cut Fries", KS, False),
        it("Pick Your Side", "Kids Tater Tots", "Kids Tater Tots", KS, False),
        it("Pick Your Side", "Kids Purple 'slaw", "Kids Purple 'Slaw", KS, False),
        it("Grab A Drink", "Kids Orange Cordial", "Kids Orange Cordial", KD, False),
        it("Grab A Drink", "Kids Blackcurrant Cordial", "Kids Blackcurrant Cordial", KD, False),
        it("Grab A Drink", "Kids Milk", "Kids Milk", KD, False),
        it("Grab A Drink", "Kids Hippo Juice", "Kids Hippo Juice", KD, False),
        it("Grab A Drink", "Kids Pop: Pepsi", "Kids Pop: Pepsi", KD, False),
        skip("Grab A Drink", "Kids Pop: Pepsi Max", NO_PANEL),
        it("Grab A Drink", "Kids Pop: Diet Lemonade", "Kids Pop: Diet Lemonade", KD, False),
        it("Grab A Drink", "Kids Pop: Iron Bru", "Kids Pop: Iron Bru", KD, False),
        it("Upgrade To A Shake", "Chocolate Brownie Milkshake", "Chocolate Brownie Milkshake (kids upgrade)", KSH, False),
        it("Upgrade To A Shake", "Vanilla Oreo Cookie Crunch Milkshake", "Vanilla Oreo Cookie Crunch Milkshake (kids upgrade)", KSH, False),
        skip("Room For Dessert?", "Baby Spice", NO_PANEL + " here (it has one on the food page)"),
        skip("Room For Dessert?", "Gimme S'more!", NO_PANEL + " here (it has one on the food page)"),
    ],
    "drinks": [
        skip("Beers", "Fat Hippo Hillbilly Lager", NO_PANEL),
        skip("Beers", "Schöfferhofer", NO_PANEL),
        skip("Beers", "Special Effects", NO_PANEL),
        skip("Beers", "Hells", NO_PANEL),
        skip("Beers", "Galacia", NO_PANEL),
        skip("Beers", "Clwb Tropica", NO_PANEL),
        skip("Beers", "Corona", NO_PANEL),
        skip("Cider", "Mixed Fruit", NO_PANEL),
        skip("Cider", "Strawberry + Lime", NO_PANEL),
        skip("Cocktails", "Watermelon Marg", NO_PANEL),
        skip("Cocktails", "Pornstar", NO_PANEL),
        skip("Cocktails", "Cherry Negroni", NO_PANEL),
        skip("Cocktails", "Pina", NO_PANEL),
        skip("Cocktails", "Long Island Peach Tea", NO_PANEL),
        it("Cocktails", "Espresso Shortini", "Espresso Shortini", DCO, False),
        it("Hard Shakes", "PB+Jack", "PB+Jack (hard shake)", DHS, False),
        it("Hard Shakes", "Milky Bar", "Milky Bar (hard shake)", DHS, False),
        it("Hard Shakes", "The Irish One", "The Irish One (hard shake)", DHS, False),
        it("Hard Shakes", "Butterbeer", "Butterbeer (hard shake)", DHS, False),
        skip("Naughty Shots", "Pickleback", NO_PANEL),
        it("Naughty Shots", "Homer", "Homer (shot)", DCO, False),
        it("Naughty Shots", "Baby Shaft", "Baby Shaft (shot)", DCO, False),
        skip("White", "Reign of Terroir Chein Blanc", NO_PANEL),
        skip("Red", "El Pugil, Tempranillo Toro", NO_PANEL),
        skip("Rose", "Le Beau Sud Grenache Rose", NO_PANEL),
        skip("Orange", "Luis Felipe Edwards Macerao", NO_PANEL),
        skip("Sparkling", "Prosecco Famiglia Extra Dry: 125ml", NO_PANEL),
        skip("Sparkling", "Prosecco Famiglia Extra Dry: Bottle", NO_PANEL),
        skip("Sparkling", "Aperol Spritz", NO_PANEL),
        it("Sparkling", "Hugo Spritz", "Hugo Spritz", DCO, False),
        it("Shakes", "Mars Attack", "Mars Attack", DSH, False),
        it("Shakes", "Meet Joe Crack", "Meet Joe Crack", DSH, False),
        it("Shakes", "Love Me Blender", "Love Me Blender", DSH, False),
        it("Shakes", "Wellaye Dubai", "Wellaye Dubai", DSH, False),
        it("Shakes", "Biscoffy", "Biscoffy", DSH, False),
        skip("Liquor", "Spirits: 25ml / 50ml", NO_PANEL),
        skip("Liquor", "Draught Mixers", NO_PANEL),
        it("Softs", "Draught Pint: Pepsi", "Draught Pint: Pepsi", DSO, False),
        skip("Softs", "Draught Pint: Pepsi Max", NO_PANEL),
        it("Softs", "Draught Pint: Diet Lemonade", "Draught Pint: Diet Lemonade", DSO, False),
        it("Softs", "Draught Pint: Orange", "Draught Pint: Orange", DSO, False),
        it("Softs", "Draught Pint: Irn Bru", "Draught Pint: Irn Bru", DSO, False),
        it("Softs", "Orange Fruit Juice", "Orange Fruit Juice", DSO, False),
        it("Softs", "Apple Fruit Juice", "Apple Fruit Juice", DSO, False),
        it("Softs", "Cranberry Fruit Juice", "Cranberry Fruit Juice", DSO, False),
        it("Softs", "Pint: Blackcurrant Cordial", "Pint: Blackcurrant Cordial", DSO, False),
        it("Softs", "Pint: Orange Cordial", "Pint: Orange Cordial", DSO, False),
        it("Softs", "Pint: Lime Cordial", "Pint: Lime Cordial", DSO, False),
        it("Softs", "Pint: Elderflower Cordial", "Pint: Elderflower Cordial", DSO, False),
        it("Softs", "Coca Cola", "Coca Cola", DSO, False),
        it("Softs", "Diet Coke", "Diet Coke", DSO, False),
        skip("Softs", "Coke Zero", NO_PANEL),
        it("Softs", "Sprite Zero", "Sprite Zero", DSO, False),
        it("Softs", "Lemon San Pellegrino", "Lemon San Pellegrino", DSO, False),
        it("Softs", "Blood Orange San Pellegrino", "Blood Orange San Pellegrino", DSO, False),
        it("Softs", "Orange + Pomegranate San Pellegrino", "Orange + Pomegranate San Pellegrino", DSO, False),
        skip("Softs", "Tonic", NO_PANEL),
        skip("Softs", "Soda", NO_PANEL),
        skip("Softs", "Ginger Ale", NO_PANEL),
        skip("Softs", "Mineral Water", NO_PANEL),
        skip("Softs", "Mineral Water", NO_PANEL),
    ],
}

# Rows the chain lists as veggie/vegan (section) but whose own ingredient list holds a "Cheesy Garlic Crumb", which the
# Special menu page calls a "cheesy garlic bacon crumb": two statements of the chain disagree, so no vegetarian tag.
NO_VEG_TAG = {"Trash Browns": "listed under Veggie / Vegan Starters, but it contains the Cheesy Garlic Crumb that the Special menu "
                              "page calls a 'cheesy garlic bacon crumb'; not tagged vegetarian"}

LABELS = ["Energy:", "Fat:", "Saturated Fat:", "Trans Fat:", "Carbohydrates:", "Sugars:", "Added Sugar:", "Fibre:", "Protein:", "Salt:"]
PORK = re.compile(r"\b(bacon|ham|pepperoni|sausage|pork|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
# The Special menu page calls the Cheesy Garlic Crumb a "cheesy garlic bacon crumb" (the main menu names the same component, with the
# same allergen list, without saying bacon): found in the 8 Oct 2026 accuracy check, so every dish with the component is tagged contains_pork.
CRUMB = re.compile(r"\bcheesy garlic crumb\b", re.I)
# Held back by the 8 Oct 2026 accuracy check although just inside the 25% rule above: the panel's kcal equals the sum of the kcal of its
# own listed parts, but its printed fat is more than those parts can supply, so the macros and the kcal cannot both be right.
PARTS_CONTRADICT = {
    "dirty-handcut-fries": "The page prints 234 kcal, which is the sum of its listed parts (Bacon Bits 48 + Fat Hippo Sauce 74 + Handcut Fries 113 = 235), "
                           "but its own protein, carbohydrate and fat (6 g, 31 g, 16 g) add up to about 292 kcal; 16 g of fat is more than "
                           "the 0 g fat of the fries plus 122 kcal of toppings can supply.",
    "vegan-dirty-tots-upgrade": "The page prints 514 kcal, which is the sum of its listed parts (Cajun Fakon Bits 71 + Tater Tots 374 + Vegan Fat Hippo "
                                "Sauce 69 = 514), but its own protein, carbohydrate and fat (7 g, 56 g, 41 g) add up to about 621 kcal; 41 g of fat is "
                                "more than the Tater Tots' 21 g plus 140 kcal of toppings can supply.",
}
CRUMB_NOTE = ("Contains the Cheesy Garlic Crumb, which the Special menu page calls a 'cheesy garlic bacon crumb'; "
              "tagged contains_pork.")


# ---------------------------------------------------------------- reading the pages

def text_of(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def number(cell: str, unit: str, where: str) -> str:
    m = re.fullmatch(r"(\d[\d,]*(?:\.\d+)?)\s*" + unit, cell.strip())
    if not m:
        raise SystemExit(f"{where}: expected a number followed by '{unit}' but the panel prints {cell!r}. The layout changed: re-check the page.")
    return m.group(1).replace(",", "")


def read_page(path: Path, page: str) -> list[dict]:
    """One dict per dish card, in reading order: section, title, panel numbers (or None), ingredient/description text."""
    doc = path.read_text(encoding="utf-8")
    sections = [(m.start(), text_of(m.group(1))) for m in re.finditer(r'<h3 class="menu-section__title">(.*?)</h3>', doc, re.S)]
    rows = []
    for m in re.finditer(r'<article class="menu-item".*?</article>', doc, re.S):
        blk = m.group(0)
        section = ([s for pos, s in sections if pos < m.start()] or [""])[-1]
        title = text_of(re.search(r'menu-item__title">(.*?)</h4>', blk, re.S).group(1))
        where = f"{page} page, '{title}'"
        tabs = re.findall(r'data-toggle="tab_\d+_(\w+)"', blk)
        panel = re.findall(r'nutrition__table__cell title">([^<]*)</div>\s*<div class="nutrition__table__cell value">\s*([^<]*?)\s*</div>', blk)
        table = None
        if panel:
            if tabs != ["standard"]:
                raise SystemExit(f"{where}: expected one 'standard' tab but found {tabs}: a diet variant changes the numbers, re-check the page.")
            sub = re.findall(r'nutrition__subtitle">([^<]*)<', blk)
            if sub != ["per 1 serving"] or [a for a, _ in panel] != LABELS:
                raise SystemExit(f"{where}: the panel's basis/labels changed ({sub}, {[a for a, _ in panel]}).")
            v = dict(panel)
            table = {"calories": number(v["Energy:"], "kcal", where), "fat_g": number(v["Fat:"], "g", where),
                     "sat_fat_g": number(v["Saturated Fat:"], "g", where), "carbs_g": number(v["Carbohydrates:"], "g", where),
                     "sugar_g": number(v["Sugars:"], "g", where), "fiber_g": number(v["Fibre:"], "g", where),
                     "protein_g": number(v["Protein:"], "g", where), "salt_g": number(v["Salt:"], "g", where),
                     "trans_g": number(v["Trans Fat:"], "g", where), "added_sugar_g": number(v["Added Sugar:"], "g", where)}
            card = re.search(r"<p[^>]*data-nutrition>\s*([\d,]+)\s*kcal\s*</p>", blk)
            if card and card.group(1).replace(",", "") != table["calories"]:
                raise SystemExit(f"{where}: the card says {card.group(1)} kcal but the panel says {table['calories']} kcal.")
        desc = re.search(r'<div class="menu-item__description">(.*?)</div>\s*<div class="menu-item__allergens"', blk, re.S)
        modal_desc = re.search(r'modal__dialogue__price">.*?</p>\s*(.*?)</div>\s*</div>\s*</div>\s*<div class="modal__dialogue__content">', blk, re.S)
        comps = [text_of(x) for x in re.findall(r'<div style="margin-bottom:1em;"><div>(.*?)<span data-nutrition>', blk, re.S)]
        marks = re.findall(r'data-content="([^"]*)"', blk)
        allergens = read_allergens(blk, where) if table is not None else None
        rows.append({"section": section, "title": title, "table": table, "marks": marks, "comps": comps, "allergens": allergens,
                     "text": " ".join([text_of(desc.group(1)) if desc else "", text_of(modal_desc.group(1)) if modal_desc else ""])})
    return rows


def read_allergens(blk: str, where: str) -> dict:
    """The dish's allergens as printed: {'words': (contains, may) as printed, 'gaps': [parts with no statement],
    'allergens': dict for write_chain_folder or None}. Stops if the card's list is not the union of its parts' lists."""
    start = blk.find('modal__dialogue__cell ingredients">')
    ends = [k for k in (blk.find("modal__dialogue__cell nutrition", start), blk.find("modal__dialogue__footer", start)) if k > 0]
    if start < 0 or not ends:
        raise SystemExit(f"{where}: no ingredients/allergen cell in the dish modal. The layout changed: re-check the page.")
    contains, may, gaps, parts = set(), set(), [], blk[start:min(ends)].split('<div style="margin-bottom:1em;">')[1:]
    for part in parts:
        name = text_of(re.match(r"<div>(.*?)</div>", part, re.S).group(1)) if part.startswith("<div>") else "?"
        con = [text_of(x) for x in re.findall(r'<span class="modal__dialogue__allergen" data-allergen-highlight="\d+">([^<]*)</span>', part)]
        mc = [text_of(x) for x in re.findall(r'<span class="modal__dialogue__allergen modal__dialogue__allergen--may" '
                                              r'data-allergen-highlight="\d+">([^<]*)</span>', part)]
        if part.count("modal__dialogue__allergen\"") + part.count("modal__dialogue__allergen--may") != len(con) + len(mc):
            raise SystemExit(f"{where}: part {name!r} has allergen markup this script doesn't read. Re-check the page.")
        if NONE_WORD in con and con != [NONE_WORD]:
            raise SystemExit(f"{where}: part {name!r} prints {NONE_WORD!r} next to allergens {con}.")
        if not con and not mc:
            gaps.append(name or "(unnamed part)")
        contains |= set(con) - {NONE_WORD}
        may |= set(mc)
    if not parts:
        gaps.append("(no parts listed)")
    lst = re.search(r'<div class="menu-item__allergens__list">(.*?)</div>', blk, re.S)
    if lst is None:
        raise SystemExit(f"{where}: no allergen list under the card. The layout changed: re-check the page.")
    card = re.findall(r'<span class="menu-item__allergens__item( menu-item__allergens__item--may-contain)?" data-allergen-id="\d+">([^<]*)</span>',
                      lst.group(1))
    card_con = {text_of(w) for m, w in card if not m}
    card_may = {text_of(w) for m, w in card if m}
    if not all(w.startswith("May Contain ") for w in card_may):
        raise SystemExit(f"{where}: may-contain entries under the card don't start with 'May Contain ': {sorted(card_may)}")
    card_may = {w[len("May Contain "):] for w in card_may}
    if card_con != contains or card_may != may - contains:
        raise SystemExit(f"{where}: the card's allergen list ({sorted(card_con)}, may {sorted(card_may)}) is not the union of its parts' "
                         f"lists ({sorted(contains)}, may {sorted(may - contains)}). Re-check the page.")

    def keys(words: set[str]) -> tuple[set, set, set]:
        return allergen_words([w for w in words if w.lower() not in NOT_14], where, extra=ALLERGEN_EXTRA)
    k_con, cereals, nuts = keys(contains)
    k_may, _, _ = keys(may - contains)
    if "cereal - gluten" in {w.lower() for w in contains}:
        cereals = set()      # generic gluten next to a named cereal: the other cereal is not named, so name none
    a = {"contains": k_con, "may_contain": k_may - k_con, "cereals": cereals, "nuts": nuts}
    return {"words": (sorted(contains), sorted(may - contains)), "gaps": gaps, "allergens": None if gaps else a}


# ---------------------------------------------------------------- the "impossible numbers" rule

def impossible(n: dict, alcoholic: bool) -> str | None:
    """Reason text if the row's own printed numbers cannot all be true, else None. Nothing is ever corrected.

    - saturates above total fat, or sugars above carbohydrate (as printed, whole grams);
    - fat alone (9 kcal/g) above the printed calories;
    - printed calories more than 25% (and 15 kcal) away from 4 x protein + 4 x carbohydrate + 9 x fat. Whole-gram rounding,
      fibre and sweeteners explain small gaps (those stay published with a warning); alcohol adds energy the macros don't show,
      so for alcoholic drinks only a gap in the other direction (macros above the calories) counts."""
    cal, p, c, f = (float(n[k]) for k in ("calories", "protein_g", "carbs_g", "fat_g"))
    if float(n["sat_fat_g"]) > f:
        return f"The page prints {n['sat_fat_g']} g saturates but only {n['fat_g']} g total fat."
    if float(n["sugar_g"]) > c:
        return f"The page prints {n['sugar_g']} g sugars but only {n['carbs_g']} g carbohydrate."
    if 9 * f > cal + 4.5:
        return f"The page prints {n['calories']} kcal with {n['fat_g']} g of fat; the fat alone would be about {9 * f:.0f} kcal."
    est = 4 * p + 4 * c + 9 * f
    gap = est - cal if alcoholic else abs(est - cal)
    if gap > 0.25 * cal and gap > 15:
        return (f"The page prints {n['calories']} kcal; its own protein, carbohydrate and fat ({n['protein_g']} g, {n['carbs_g']} g, "
                f"{n['fat_g']} g) add up to about {est:.0f} kcal.")
    return None


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", type=Path, help="folder holding food.html, special-menu.html, kids.html and drinks.html")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were downloaded")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    items, holdback, excluded, shas = [], [], [], {}
    first: dict[tuple, dict] = {}
    for page, fname in PAGES.items():
        path = args.pages / fname
        shas[fname] = sha256_file(path)
        read = read_page(path, page)
        want = [(r["section"], r["title"], r["table"]) for r in ROWS[page]]
        got = [(r["section"], r["title"], r["table"] is not None) for r in read]
        if want != got:
            print(f"The {page} page ({fname}) no longer matches ROWS in this script: {len(got)} cards on the page, {len(want)} named here.",
                  file=sys.stderr)
            for i, (a, b) in enumerate(zip(want, got)):
                if a != b:
                    print(f"  first difference at card {i + 1}: script expects {a}, page has {b}", file=sys.stderr)
                    break
            else:
                print(f"  the first {min(len(want), len(got))} cards agree; the page has {'more' if len(got) > len(want) else 'fewer'} cards.",
                      file=sys.stderr)
            print("Re-check the names in ROWS against the page before running again.", file=sys.stderr)
            return 1
        for spec, card in zip(ROWS[page], read):
            key = (page, spec["section"], spec["title"])
            if spec["kind"] == "skip":
                excluded.append((page, spec["section"], spec["title"], spec["reason"]))
                continue
            if spec["kind"] == "dup":
                original = first[(page,) + spec["of"]]
                if (original["_panel"] != card["table"] or original["_text"] != card["text"]
                        or original["_allergens"]["words"] != card["allergens"]["words"]):
                    print(f"{page} page: '{spec['title']}' appears twice with DIFFERENT numbers or text: keep both and name them.", file=sys.stderr)
                    return 1
                original["_veg"] = original["_veg"] or spec["section"] in VEG_SECTIONS
                continue
            n = card["table"]
            name = spec["name"]
            text = " ".join([name, card["text"], *card["comps"]])
            tags = []
            marked_veg = (any(m in ("Vegan", "Vegetarian") for m in card["marks"]) or spec["section"] in VEG_SECTIONS
                          or "vegan" in name.lower())
            row = {"id": slug(name), "name": name, "category": spec["category"], "serving": "",
                   "calories": n["calories"], "protein_g": n["protein_g"], "carbs_g": n["carbs_g"], "fat_g": n["fat_g"],
                   "sat_fat_g": n["sat_fat_g"], "sodium_mg": "", "salt_g": n["salt_g"], "sugar_g": n["sugar_g"],
                   "fiber_g": n["fiber_g"], "limited_time": spec["limited"], "rankable": spec["rankable"],
                   "_panel": n, "_text": card["text"], "_veg": marked_veg, "_pork": bool(PORK.search(text)) or bool(CRUMB.search(text)), "_crumb_only": bool(CRUMB.search(text)) and not PORK.search(text),
                   "_beef": bool(BEEF.search(text)), "_title": spec["title"], "_note": spec["note"],
                   "_allergens": card["allergens"],
                   "_alcohol": spec["section"] in ALCOHOL_SECTIONS and page == "drinks"}
            first[key] = row
            items.append(row)

    notes_out = []
    for row in items:
        tags = []
        if row["_veg"] and row["name"] not in NO_VEG_TAG:
            tags.append("vegetarian")
        if row["_pork"]:
            tags.append("contains_pork")
        if row["_beef"]:
            tags.append("contains_beef")
        row["tags"] = "|".join(tags)
        notes = [row["_note"]] if row["_note"] else []
        if row["_veg"] and row["name"] in NO_VEG_TAG:
            notes.append(NO_VEG_TAG[row["name"]][0].upper() + NO_VEG_TAG[row["name"]][1:] + ".")
        if row["_crumb_only"]:
            notes.append(CRUMB_NOTE)
        if row["_alcohol"]:
            notes.append("Alcoholic: the calories include alcohol, so they are higher than 4P+4C+9F.")
        cal, est = float(row["calories"]), 4 * float(row["protein_g"]) + 4 * float(row["carbs_g"]) + 9 * float(row["fat_g"])
        reason = impossible(row["_panel"], row["_alcohol"]) or PARTS_CONTRADICT.get(row["id"])
        if reason:
            holdback.append((row["id"], reason))
        elif not row["_alcohol"] and ((cal >= 50 and abs(est - cal) / cal > 0.15) or (cal < 50 and est > cal + 25)):
            notes.append(f"Printed {row['calories']} kcal vs {est:.0f} kcal from its own macros ({abs(est - cal) / cal:.0%} off); entered as printed.")
        row["notes"] = " ".join(notes)

    gaps = [(r["name"], r["_allergens"]["gaps"]) for r in items if r["_allergens"]["gaps"]]
    complete = not gaps and NUT_NOTICE_DECIDED
    for r in items:
        r["allergens"] = r["_allergens"]["allergens"] if complete else None

    ids = [r["id"] for r in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    out_items = [{k: v for k, v in r.items() if not k.startswith("_")} for r in items]
    note = ("Per serving from each dish's nutrition panel on fathippo.co.uk (no date shown), in whole grams: salt often reads 0 g. "
            "Burgers come with a free side of your choice, listed separately and not added in. Dishes whose printed numbers contradict "
            "each other are left out, and so are drinks with no numbers (beers, wines, spirits).")
    assert len(note) < 400, len(note)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Fat Hippo", cuisine="Burgers",
        source_title=f"Fat Hippo website nutrition panels: Food, Kids, Drinks and Special menu pages (accessed {args.checked_on}, no date shown)",
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["fat hippo", "the fat hippo", "fathippo"],
        items=out_items, out=args.out, note=note, holdback=holdback,
        allergen_guide={"title": f"Fat Hippo allergen information: Allergens page and each dish's allergen details on its online menus "
                                 f"(accessed {args.checked_on}, no date shown)",
                        "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"wrote {len(out_items)} items ({len(holdback)} held back, {len(excluded)} dishes without a panel left out) to {out}")
    if complete:
        print("allergens: every published dish has its allergens: allergens.csv written")
    else:
        print("allergens: guide link only (allergen_guide.csv); allergens.csv not written because"
              + ("" if NUT_NOTICE_DECIDED else " NUT_NOTICE_DECIDED is False (see docstring)") + ("" if not gaps else
              f"; {len(gaps)} dishes have a part with no allergen statement:"))
        for name, g in gaps:
            print(f"  {name}: {', '.join(g)}")
    for fname, sha in shas.items():
        print(f"  {fname} sha256 {sha}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
