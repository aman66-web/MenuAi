#!/usr/bin/env python3
"""Build data/source/joseph-holt/ from Joseph Holt's own menu PDFs with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/joseph_holt.py --main main.pdf --kids kids.pdf --lunch lunch.pdf --checked-on 2026-10-08 [--out DIR]

Sources (the PDFs linked as the current menus from the chain's own pub page https://www.joseph-holt.com/pubs/roebuck; hosted on the
chain's own storage, joseph-holt.lon1.digitaloceanspaces.com, which serves them publicly; joseph-holt.com's robots.txt has content
signals only, no Disallow):
    main : https://joseph-holt.lon1.digitaloceanspaces.com/uploads/2026/10/22.09.26_CD-W26_Main-Menu_Higher.pdf
           "W26-H" (winter 2026), PDF created 2026-09-22, two A3 pages with a text layer.
    kids : https://joseph-holt.lon1.digitaloceanspaces.com/uploads/2026/10/17.09.26_JH_CD-W26_Kids-Menu_Original.pdf
           "W26-KIDS", PDF created 2026-09-17; page 2 is a colouring competition.
    lunch: https://joseph-holt.lon1.digitaloceanspaces.com/uploads/2026/10/16.09.26_JH_CDW26_Supp-Menus_Lunch.pdf
           "W26-L", PDF created 2026-09-16: the seven wraps and jacket potatoes of the main menu again, with the same calories.
Needs `pdftotext` (poppler). The pages are read by position: see joseph_holt_pdf.py.

The menus print calories ONLY ("927 kcal" under each dish): protein, carbs and fat are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable). Nothing else is printed per dish (no kJ, salt, weights: the
small print says "All weights are approximate and taken before cooking" but gives none). Calories are copied from the PDFs as
printed. Only the item NAMES, categories and tags are written by hand, in ITEMS below: the script stops if the dishes printed on the
pages differ from this table (a new, renamed or removed dish, a number that moved to another dish, a hidden value), so a human
re-checks the table when Joseph Holt publishes a new menu.

How the menus' own wording is read:
- The calories are "based on standard recipe portions": one value per dish as served. `serving` is blank except where the menu itself
  labels the portions: the Sunday roast prints "Adult" and "Child" columns and "1496 / 823 kcal" (adult / child); Espresso prints
  "Sgl" and "Dbl" rows and "5 / 10 kcal". Chicken Wings print three flavours, each with its own value.
- The child Sunday roast of Half Roast Chicken is served with chicken breast (footnote 1 on the menu); the value is as printed.
- "Add ..." lines under a dish print their own price and their own calories: they are items of their own, named "(to <dish>)" where
  they sit under that dish. The burger upgrades are printed under their own heading and keep their printed names.
- Kids menu items are named "(kids)": the kids menu prints "Kids meal, lolly & a drink 5.45" with a choice of main, side, spud, lolly
  and drink, each with its own calories, plus a few add-ons with their own prices.
- NOT listed: "Steak Frites" prints two values ("692 / 699 kcal") for "your choice of chimichurri butter or garlic and herb butter" and
  the menu does not say which value belongs to which butter, so no value is attached to either; "Upgrade your chips to skin on fries"
  prints a price but no calories; set-price offers (lunch, dessert and hot drink, two or three courses, mix and match small plates,
  fish Friday, winter warmers) print no calories of their own; draught beer, wine and soft drinks other than the kids menu's are not
  on the menus.
- A calorie line "79 kcal" sits in the kids menu's text layer on top of the DIET COKE name, but the rendered page prints only "1 kcal"
  for Diet Coke (the 79 kcal printed lower down belongs to Schweppes Lemonade): the hidden line is ignored, and the script stops if any
  other calorie line is hidden.
- Tags: vegetarian when the dish line carries the menu's own (v) or (ve) mark (the menu warns that fryers are not dedicated).
  contains_pork / contains_beef when the dish's name or description says so (pork, bacon, ham, gammon, sausage, pancetta, chorizo;
  beef, steak (not gammon steak)). Nothing else is inferred (e.g. "Three Pigs in Blankets" names no meat, so it has no tag).

Allergens (docs/DATA.md "Allergens"): none. Every PDF says "Full allergen information is available upon request" and the chain's website
publishes no allergen guide or page, so there is nothing to copy and no allergen_guide.csv.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import joseph_holt_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "joseph-holt"
SOURCE_URL = "https://joseph-holt.lon1.digitaloceanspaces.com/uploads/2026/10/22.09.26_CD-W26_Main-Menu_Higher.pdf"
SOURCE_TITLE = ("Joseph Holt winter 2026 main menu with calories (W26-H, PDF dated 22.09.26), with the kids menu (W26-KIDS, 17.09.26) "
                "and the lunch supplement (W26-L, 16.09.26)")
ALIASES = ["joseph holt", "joseph holt pub", "joseph holt's", "joseph holts"]
NOTE = ("Joseph Holt prints calories only, per standard recipe portion (it says they may vary slightly): protein, carbs and fat are "
        "not published. Offers, beer and wine are not listed. Steak Frites prints two values without saying which is which, so it is not listed.")

PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausages?|pancetta|chorizo)\b", re.I)
BEEF = re.compile(r"\bbeef\b|(?<!gammon )\bsteak\b", re.I)
VEG = re.compile(r"\((?:v|ve)\)")
NON_DISH_MAIN = frozenset({"Choose from:", "Adult", "Child", "Burger Upgrades"})  # headings set in the dish-name size
EXPECTED_HIDDEN = [("kids", "DIET COKE", ["79"])]
EXPECTED_NO_KCAL = {("main", "upgrade your chips to skin on fries")}


def norm(s: str) -> str:
    return " ".join(s.replace("’", "'").replace("‘", "'").split()).lower()


def E(src, key, name, cat, note="", variants=None, check=None, exclude=None, expect=None):
    return dict(src=src, key=key, name=name, cat=cat, note=note, variants=variants, check=check, exclude=exclude, expect=expect)


def V(name, serving="", phrase=""):
    return dict(name=name, serving=serving, phrase=phrase)


WRAPS, SMALL, CLASSICS, SIGS, BURG, UPG, SALADS = ("Wraps & Jacket Potatoes", "Small Plates", "Pub Classics", "Pub Signatures", "Burgers",
                                                   "Burger Upgrades", "Salads")
SUNDAY, SUNSIDES, SIDES, DESS, TEA = "Traditional Sunday Roast", "Sunday Sides", "Sides", "Desserts", "Tea & Coffee"
KMAIN, KSIDE, KSPUD, KLOLLY, KDRINK, KADD = ("Kids: Main", "Kids: Side", "Kids: Spud", "Kids: Lolly", "Kids: Drink", "Kids: Add-ons")
LUNCH_NOTE = "Also printed with the same calories on the lunch supplement menu"

# One entry per dish the PDFs print, in the order they are listed in the app. `key` is the dish's printed name (the name lines joined
# with a space; curly apostrophes may be typed straight). Two dishes with the same printed name are told apart by the first description
# line ("name | description") or, failing that, by the column ("name [x482]").
ITEMS = [
    E("main", "Buttermilk Chicken, BBQ Sauce, Bacon and Cheddar Wrap", "Buttermilk Chicken, BBQ Sauce, Bacon and Cheddar Wrap", WRAPS, LUNCH_NOTE),
    E("main", "Onion Bhaji and Red Pepper Wrap (ve)", "Onion Bhaji and Red Pepper Wrap", WRAPS, LUNCH_NOTE),
    E("main", "Lamb Kofta Wrap", "Lamb Kofta Wrap", WRAPS, LUNCH_NOTE + "; same printed value (591) as the Onion Bhaji and Red Pepper Wrap"),
    E("main", "Beef and Bean Chilli Loaded Jacket Potato", "Beef and Bean Chilli Loaded Jacket Potato", WRAPS, LUNCH_NOTE),
    E("main", "Trailblazer BBQ Pulled Pork and Mature Cheddar Loaded Jacket Potato", "Trailblazer BBQ Pulled Pork and Mature Cheddar Loaded Jacket Potato", WRAPS, LUNCH_NOTE),
    E("main", "Baked Beans and Mature Cheddar Jacket Potato (v)", "Baked Beans and Mature Cheddar Jacket Potato", WRAPS, LUNCH_NOTE),
    E("main", "Tuna and Spring Onion Mayonnaise Jacket Potato", "Tuna and Spring Onion Mayonnaise Jacket Potato", WRAPS, LUNCH_NOTE),

    E("main", "Cheddar Topped Garlic and Herb Bread (v)", "Cheddar Topped Garlic and Herb Bread", SMALL),
    E("main", "Chicken Wings", None, SMALL, "Three flavours printed under 'Choose from:', each with its own value", variants=[
        V("Chicken Wings, salt and pepper", phrase="Salt and pepper spiced stir fried onion and peppers"),
        V("Chicken Wings, chicken salt", phrase="Chicken salt seasoned with a crushed pepper mayonnaise"),
        V("Chicken Wings, sticky BBQ", phrase="Sticky BBQ with a crushed pepper mayonnaise")]),
    E("main", "Halloumi Fries (v)", "Halloumi Fries", SMALL),
    E("main", "Black Pudding Fritter", "Black Pudding Fritter", SMALL, "Same printed value (470) as Hot Honey Chicken"),
    E("main", "Onion Bhaji Stack (ve)", "Onion Bhaji Stack", SMALL),
    E("main", "Steamed Duck Dumplings", "Steamed Duck Dumplings", SMALL),
    E("main", "Pan-Fried King Prawns and Chorizo", "Pan-Fried King Prawns and Chorizo", SMALL),
    E("main", "Hot Honey Chicken", "Hot Honey Chicken", SMALL, "Same printed value (470) as the Black Pudding Fritter"),
    E("main", "Mac and Smoked Pancetta Cheese", "Mac and Smoked Pancetta Cheese", SMALL),
    E("main", "Stilton and Joseph Holt’s Trailblazer Mushrooms (v)", "Stilton and Joseph Holt’s Trailblazer Mushrooms", SMALL),
    E("main", "Beef and Bean Chilli Tortillas", "Beef and Bean Chilli Tortillas", SMALL),
    E("main", "Sticky Chilli Pork Bites", "Sticky Chilli Pork Bites", SMALL),

    E("main", "The Jolly Hog TM Beer Braised Sausages", "The Jolly Hog Beer Braised Sausages", CLASSICS, "Printed 'The Jolly Hog' with a trade mark sign"),
    E("main", "Chicken Tikka Masala", "Chicken Tikka Masala", CLASSICS),
    E("main", "Add poppadoms and mango chutney (ve)", "Add poppadoms and mango chutney (to Chicken Tikka Masala)", CLASSICS,
      "Printed under Chicken Tikka Masala: its own calories, not a total"),
    E("main", "H.M.Pasties Steak and Joseph Holt’s Ale Pie", "H.M.Pasties Steak and Joseph Holt’s Ale Pie", CLASSICS),
    E("main", "Scottish Scampi and Chips", "Scottish Scampi and Chips", CLASSICS),
    E("main", "Hand Crafted Beef and Joseph Holt’s Golden Ale Lasagne", "Hand Crafted Beef and Joseph Holt’s Golden Ale Lasagne", CLASSICS),
    E("main", "H.M.Pasties Cheese and Onion Pie (v)", "H.M.Pasties Cheese and Onion Pie", CLASSICS),
    E("main", "Joseph Holt’s Beer Battered Fish and Chips", "Joseph Holt’s Beer Battered Fish and Chips", CLASSICS),
    E("main", "Thick Cut Gammon Steak", "Thick Cut Gammon Steak", CLASSICS, "Gammon steak: tagged pork by the cut name, not beef"),

    E("main", "Beef Bourguignon", "Beef Bourguignon", SIGS),
    E("main", "Steak, Pepper and Cheddar Baguette", "Steak, Pepper and Cheddar Baguette", SIGS),
    E("main", "Wexford Chicken", "Wexford Chicken", SIGS),
    E("main", "Firecracker Chicken", "Firecracker Chicken", SIGS),
    E("main", "Steak Frites", None, SIGS, exclude="two values (692 / 699) for two butters, not said which is which", expect=["692", "699"]),
    E("main", "Add black pepper sauce", "Add black pepper sauce (to Steak Frites)", SIGS, "Printed under Steak Frites: its own calories, not a total"),
    E("main", "Add 3 king prawns", "Add 3 king prawns (to Steak Frites)", SIGS, "Printed under Steak Frites: its own calories, not a total"),
    E("main", "Beef, Bean and Chorizo Chilli", "Beef, Bean and Chorizo Chilli", SIGS),
    E("main", "Korean BBQ Pulled Pork and Asian Slaw Brioche", "Korean BBQ Pulled Pork and Asian Slaw Brioche", SIGS),
    E("main", "Fiery Red Thai Vegetable Curry (ve)", "Fiery Red Thai Vegetable Curry", SIGS),

    E("main", "Classic Beef", "Classic Beef Burger", BURG, "Printed 'Classic Beef'; description: Aberdeen Angus beef burger with burger sauce and chips"),
    E("main", "Add mature Cheddar and bacon", "Add mature Cheddar and bacon (to Classic Beef)", BURG, "Printed under Classic Beef: its own calories, not a total"),
    E("main", "Halloumi, Red Pepper and Smashed Avocado (v)", "Halloumi, Red Pepper and Smashed Avocado Burger", BURG, "Printed without the word burger"),
    E("main", "Buttermilk Chicken", "Buttermilk Chicken Burger", BURG, "Printed 'Buttermilk Chicken' under the Burgers heading"),
    E("main", "The Ultimate", "The Ultimate Burger", BURG, "Printed 'The Ultimate' under the Burgers heading"),
    E("main", "Add a 6oz Aberdeen Angus beef burger", "Add a 6oz Aberdeen Angus beef burger", UPG),
    E("main", "Add a crisp buttermilk chicken fillet", "Add a crisp buttermilk chicken fillet", UPG),
    E("main", "Add pulled pork", "Add pulled pork", UPG),
    E("main", "Upgrade your chips to skin on fries", None, UPG, exclude="prints a price (0.50) but no calories", expect=[]),

    E("main", "Signature Salad (ve)", "Signature Salad", SALADS),
    E("main", "Add Pan-Fried Halloumi (v)", "Add Pan-Fried Halloumi (to Signature Salad)", SALADS, "Printed under Signature Salad: its own calories, not a total"),
    E("main", "Add Chicken Breast and Bacon [x482]", "Add Chicken Breast and Bacon (to Signature Salad)", SALADS, "Printed under Signature Salad: its own calories, not a total"),
    E("main", "Caesar Salad", "Caesar Salad", SALADS),
    E("main", "Add Pan-Fried Halloumi", "Add Pan-Fried Halloumi (to Caesar Salad)", SALADS, "Printed under Caesar Salad: its own calories, not a total"),
    E("main", "Add Chicken Breast and Bacon [x711]", "Add Chicken Breast and Bacon (to Caesar Salad)", SALADS, "Printed under Caesar Salad: its own calories, not a total"),

    E("main", "Half Roast Chicken", None, SUNDAY, "Footnote 1 on the menu: chicken breast is served on children's roast", check="sunday", variants=[
        V("Half Roast Chicken (Sunday roast)", "Adult"), V("Half Roast Chicken (Sunday roast, child)", "Child")]),
    E("main", "Topside of Beef", None, SUNDAY, check="sunday", variants=[
        V("Topside of Beef (Sunday roast)", "Adult"), V("Topside of Beef (Sunday roast, child)", "Child")]),
    E("main", "Honey Roast Gammon", None, SUNDAY, check="sunday", variants=[
        V("Honey Roast Gammon (Sunday roast)", "Adult"), V("Honey Roast Gammon (Sunday roast, child)", "Child")]),
    E("main", "Chestnut and Seed Roast (v)", None, SUNDAY, check="sunday", variants=[
        V("Chestnut and Seed Roast (Sunday roast)", "Adult"), V("Chestnut and Seed Roast (Sunday roast, child)", "Child")]),
    E("main", "Cauliflower Cheese (v)", "Cauliflower Cheese (Sunday side)", SUNSIDES),
    E("main", "Three Pigs in Blankets", "Three Pigs in Blankets (Sunday side)", SUNSIDES, "The menu names no meat for this dish"),

    E("main", "Chips (ve)", "Chips", SIDES, "Same printed value (464) as the Kelly’s Cornish Vegan Vanilla Ice Cream"),
    E("main", "Skin On Fries (ve)", "Skin On Fries", SIDES),
    E("main", "Asian Slaw (v)", "Asian Slaw", SIDES),
    E("main", "Loaded Fries", "Loaded Fries", SIDES),
    E("main", "Skin On Fries with Chicken Salt", "Skin On Fries with Chicken Salt", SIDES),
    E("main", "Sweet Potato Fries (ve)", "Sweet Potato Fries", SIDES),
    E("main", "Beer Battered Onion Rings (ve)", "Beer Battered Onion Rings", SIDES, "Letter-spaced in the PDF text layer ('4 4 4 kcal'); read as 444"),
    E("main", "Truffle Fries (v)", "Truffle Fries", SIDES),
    E("main", "Salt and Pepper Chips (ve)", "Salt and Pepper Chips", SIDES),

    E("main", "Kelly’s Cornish Vegan Vanilla Ice Cream (ve)", "Kelly’s Cornish Vegan Vanilla Ice Cream", DESS, "Three scoops; same printed value (464) as Chips"),
    E("main", "Apple and Blackberry Shortbread Crumble (v)", "Apple and Blackberry Shortbread Crumble", DESS),
    E("main", "Gin and Raspberry ‘Cheesecake’ (ve)", "Gin and Raspberry ‘Cheesecake’", DESS),
    E("main", "Cadbury Dairy Milk Ice Cream and Chocolate Sundae (v)", "Cadbury Dairy Milk Ice Cream and Chocolate Sundae", DESS),
    E("main", "The Lakes’ Sticky Toffee Pudding (v)", "The Lakes’ Sticky Toffee Pudding", DESS),
    E("main", "Kelly’s Cornish Ice Cream (v)", "Kelly’s Cornish Ice Cream", DESS, "Three scoops; 'ask a member of the team for today's choice'"),
    E("main", "Jam Sponge Pudding (v)", "Jam Sponge Pudding", DESS),
    E("main", "Amaretto Cake (v)", "Amaretto Cake", DESS, "Letter-spaced in the PDF text layer ('57 1 kcal'); read as 571"),
    E("main", "Chocolate Fudge Cake (v)", "Chocolate Fudge Cake", DESS),

    E("main", "Flat White", "Flat White", TEA),
    E("main", "Americano", "Americano", TEA),
    E("main", "Cappuccino", "Cappuccino", TEA),
    E("main", "Espresso", None, TEA, "Printed with 'Sgl' and 'Dbl' rows and '5 / 10 kcal'", check="espresso", variants=[
        V("Espresso (single)", "Single"), V("Espresso (double)", "Double")]),
    E("main", "Latte", "Latte", TEA),
    E("main", "Mocha", "Mocha", TEA),
    E("main", "Hot Chocolate", "Hot Chocolate", TEA),
    E("main", "Pot of Tea", "Pot of Tea", TEA),
    E("main", "Speciality and Flavoured Teas", "Speciality and Flavoured Teas", TEA, "Printed '0 kcal'; 'ask a member of the team for our range'"),
    E("main", "Flavoured Syrups", "Flavoured Syrups (to add to any coffee)", TEA, "Printed 61 kcal beside 'flavoured syrups to add to any coffee'"),

    E("kids", "BATTERED FISH", "Battered Fish (kids)", KMAIN),
    E("kids", "HALLOUMI FRIES (v)", "Halloumi Fries (kids)", KMAIN),
    E("kids", "BEEF BURGER", "Beef Burger (kids)", KMAIN),
    E("kids", "CHEESEBURGER", "Cheeseburger (kids)", KMAIN),
    E("kids", "TOMATO AND MASCARPONE PASTA (v)", "Tomato and Mascarpone Pasta (kids)", KMAIN),
    E("kids", "BUTTERMILK CHICKEN BURGER", "Buttermilk Chicken Burger (kids)", KMAIN),
    E("kids", "PAN-FRIED HALLOUMI AND CHARRED RED PEPPER BURGER (v)", "Pan-Fried Halloumi and Charred Red Pepper Burger (kids)", KMAIN),
    E("kids", "BATTERED CHICKEN BREAST BITES", "Battered Chicken Breast Bites (kids)", KMAIN),
    E("kids", "THE JOLLY HOG TM PORK SAUSAGES", "The Jolly Hog Pork Sausages (kids)", KMAIN),
    E("kids", "BAKED BEANS (v)", "Baked Beans (kids)", KSIDE),
    E("kids", "CARROT BATONS (v)", "Carrot Batons (kids)", KSIDE),
    E("kids", "CRUNCHY SALAD (v)", "Crunchy Salad (kids)", KSIDE),
    E("kids", "FRESH VEGGIE STICKS (v)", "Fresh Veggie Sticks (kids)", KSIDE),
    E("kids", "GARDEN PEAS (v)", "Garden Peas (kids)", KSIDE),
    E("kids", "MUSHY PEAS (v)", "Mushy Peas (kids)", KSIDE),
    E("kids", "CHIPS (v)", "Chips (kids)", KSPUD),
    E("kids", "MASHED POTATO (v)", "Mashed Potato (kids)", KSPUD),
    E("kids", "SKIN ON FRIES (v)", "Skin On Fries (kids)", KSPUD),
    E("kids", "FRUIT PASTILLES (v)", "Fruit Pastilles Lolly (kids)", KLOLLY),
    E("kids", "SMARTIES POP UP", "Smarties Pop Up Lolly (kids)", KLOLLY),
    E("kids", "FAB (v)", "Fab Lolly (kids)", KLOLLY),
    E("kids", "COCA COLA ZERO SUGAR", "Coca Cola Zero Sugar (kids)", KDRINK),
    E("kids", "DIET COKE", "Diet Coke (kids)", KDRINK, "A hidden '79 kcal' sits on top of the name in the text layer; the rendered page prints 1 kcal", expect=["1"]),
    E("kids", "SCHWEPPES LEMONADE", "Schweppes Lemonade (kids)", KDRINK),
    E("kids", "INNOCENT JUICY WATER | Apples & Strawberries", "Innocent Juicy Water, Apples & Strawberries (kids)", KDRINK),
    E("kids", "INNOCENT JUICY WATER | Apples & Mangoes", "Innocent Juicy Water, Apples & Mangoes (kids)", KDRINK),
    E("kids", "GARLIC AND HERB BREAD (v)", "Garlic and Herb Bread (kids add-on)", KADD),
    E("kids", "KELLY’S CORNISH ICE CREAM (v)", "Kelly’s Cornish Ice Cream (kids add-on)", KADD, "Two scoops, 'ask a member of the team for today's choice'"),
    E("kids", "KELLY’S CORNISH VEGAN VANILLA ICE CREAM (ve)", "Kelly’s Cornish Vegan Vanilla Ice Cream (kids add-on)", KADD, "Two scoops with a red berry sauce"),
]
# The lunch supplement prints these dishes again with the same calories: each must match a main-menu entry (name and value) exactly.
LUNCH_SAME_AS_MAIN = [e["key"] for e in ITEMS[:7]]
EXPECTED_ITEMS = 121
SECTION_ORDER = [WRAPS, SMALL, CLASSICS, SIGS, BURG, UPG, SALADS, SUNDAY, SUNSIDES, SIDES, DESS, TEA, KMAIN, KSIDE, KSPUD, KLOLLY, KDRINK, KADD]


def keyed(src: str, dishes: list) -> dict:
    """Dish -> key (printed name, made unique by its first description line, or failing that its column, when two dishes print the same name)."""
    base = {}
    for d in dishes:
        base.setdefault(norm(d["name"]), []).append(d)
    out = {}
    for k, group in base.items():
        if len(group) == 1:
            out[(src, k)] = group[0]
            continue
        descs = []
        for d in group:
            rest = [ln for ln in d["desc"] if all(ln is not n for n in d["name_lines"])]
            descs.append(norm(rest[0]["text"]) if rest else "")
        if all(descs) and len(set(descs)) == len(descs):
            keys = [k + " | " + x for x in descs]
        else:
            keys = [k + " [x%d]" % round(d["x0"]) for d in group]
        for key, d in zip(keys, group):
            out[(src, key)] = d
    return out


def check_labels(entry: dict, d: dict, lines: list, orphans: list) -> None:
    page = [ln for ln in lines if ln["page"] == d["page"]]
    if entry["check"] == "sunday":
        adult = [ln for ln in page if ln["text"] == "Adult"]
        child = [ln for ln in page if ln["text"] == "Child"]
        if len(adult) != 1 or len(child) != 1 or len(d["prices"]) != 2:
            raise SystemExit(f"{entry['key']}: expected one Adult and one Child heading and two prices")
        if abs(adult[0]["x1"] - d["prices"][0][1]) > 1.5 or abs(child[0]["x1"] - d["prices"][1][1]) > 1.5:
            raise SystemExit(f"{entry['key']}: the Adult/Child headings no longer sit over its two prices")
    elif entry["check"] == "espresso":
        sgl = [ln for ln in page if ln["text"] == "Sgl" and abs(ln["y0"] - d["prices"][0][2]) <= 2.5]
        below = [o for o in orphans if o["page"] == d["page"] and 8 < o["y0"] - d["prices"][0][2] < 20 and abs(o["x1"] - d["prices"][0][1]) <= 1.0]
        dbl = [ln for ln in page if ln["text"] == "Dbl" and below and abs(ln["y0"] - below[0]["y0"]) <= 2.5]
        if len(sgl) != 1 or len(below) != 1 or len(dbl) != 1:
            raise SystemExit("Espresso: the Sgl / Dbl rows and their two prices are not where the script expects them")


def variant_values(entry: dict, d: dict) -> list:
    """[(variant spec, value)] for a dish that prints several values (one line 'a / b kcal', or one calorie line per flavour)."""
    values = [v for vs, _ in d["kcal"] for v in vs]
    variants = entry["variants"]
    if len(values) != len(variants):
        raise SystemExit(f"{entry['key']}: {len(values)} values printed, expected {len(variants)}")
    if len(d["kcal"]) > 1:  # one calorie line per variant: the variant's description must sit above its own value
        prev_y = d["y0"]
        for (vs, ln), spec in zip(d["kcal"], variants):
            text = " ".join(x["text"] for x in d["desc"] if prev_y <= x["y0"] < ln["y0"])
            if spec["phrase"] not in text:
                raise SystemExit(f"{entry['key']}: expected {spec['phrase']!r} above the value {vs}, found {text!r}")
            prev_y = ln["y0"]
    return list(zip(variants, values))


def build_items(found: dict, lines: dict, orphans: dict) -> tuple:
    table = {(e["src"], norm(e["key"])): e for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (menu, printed name)")
    new, gone = sorted(set(found) - set(table)), sorted(set(table) - set(found))
    if new or gone:
        raise SystemExit(f"The menus changed. Printed but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. "
                         "Update ITEMS (names, categories) after reading the new menus.")
    items, excluded = [], []
    for e in ITEMS:
        d = found[(e["src"], norm(e["key"]))]
        printed = [v for vs, _ in d["kcal"] for v in vs]
        if e["expect"] is not None and printed != e["expect"]:
            raise SystemExit(f"{e['key']}: printed values {printed}, expected {e['expect']}")
        if e["exclude"]:
            excluded.append((e["key"], e["exclude"]))
            continue
        if not printed:
            raise SystemExit(f"{e['key']}: no calories printed (add it to EXPECTED_NO_KCAL and ITEMS as an exclusion if that is right)")
        if e["check"]:
            check_labels(e, d, lines[e["src"]], orphans[e["src"]])
        text = " ".join(ln["text"] for ln in d["desc"])
        tags = []
        if VEG.search(d["name"]):
            tags.append("vegetarian")
        if PORK.search(e["key"] + " " + text):
            tags.append("contains_pork")
        if BEEF.search(e["key"] + " " + text):
            tags.append("contains_beef")
        price = f"printed price {' / '.join(p[0] for p in d['prices'])}; " if d["prices"] else ""
        note = "; ".join(x for x in (price.rstrip("; "), e["note"]) if x)
        if e["variants"]:
            for n, (spec, value) in enumerate(variant_values(e, d)):
                vprice = "printed price %s" % d["prices"][n][0] if len(d["prices"]) == len(e["variants"]) else ""
                items.append(dict(name=spec["name"], category=e["cat"], serving=spec["serving"], calories=value, tags="|".join(tags),
                                  rankable=False, notes="; ".join(x for x in (vprice, e["note"]) if x), desc=text))
            continue
        if len(printed) != 1:
            raise SystemExit(f"{e['key']}: {len(printed)} calorie values found, expected 1")
        items.append(dict(name=e["name"], category=e["cat"], calories=printed[0], tags="|".join(tags), rankable=False, notes=note, desc=text))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menus changed, re-check ITEMS")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    if [c for c in dict.fromkeys(i["category"] for i in items)] != SECTION_ORDER:
        raise SystemExit("Category order changed")
    return items, excluded


def read_all(main: Path, kids: Path, lunch: Path) -> tuple:
    r = pdf_reader
    lines = {"main": r.read_lines(main), "kids": r.read_lines(kids), "lunch": r.read_lines(lunch)}
    if [ln for ln in lines["kids"] if ln["page"] == 2 and r.kcal_values(ln) is not None] or [ln for ln in lines["lunch"] if ln["page"] == 1 and r.kcal_values(ln) is not None]:
        raise SystemExit("Calories printed on a page the script does not read (kids page 2 / lunch page 1): the layout changed")
    found, hidden, orphans = {}, [], {}
    specs = {"main": dict(pages=[1, 2], name_heights=[11.0, 7.8], pitch=(7.5, 11.5), need_price=True, non_dish=NON_DISH_MAIN),
             "kids": dict(pages=[1], name_heights=[15.4], pitch=(7.0, 13.0), need_price=False, merge_split=True, max_gap=60.0),
             "lunch": dict(pages=[2], name_heights=[11.0], pitch=(7.5, 11.5), need_price=False, max_gap=60.0)}
    dishes = {}
    for src, spec in specs.items():
        ds, hid, orph = r.read_dishes(lines[src], **spec)
        dishes[src] = ds
        orphans[src] = orph
        hidden += [(src, n, v) for n, v, _ in hid]
        if src != "lunch":
            found.update(keyed(src, ds))
    if [(s, n, v) for s, n, v in hidden] != EXPECTED_HIDDEN:
        raise SystemExit(f"Hidden calorie lines changed: found {hidden}, expected {EXPECTED_HIDDEN}")
    stray = [(src, o["text"]) for src in ("kids", "lunch") for o in orphans[src]] + [("main", o["text"]) for o in orphans["main"] if o["text"] != "3.25"]
    if stray:
        raise SystemExit(f"Prices that belong to no dish: {stray}")
    no_kcal = {(src, norm(d["name"])) for src in ("main", "kids") for d in dishes[src] if not d["kcal"]}
    if no_kcal != EXPECTED_NO_KCAL:
        raise SystemExit(f"Dishes without calories changed: now {sorted(no_kcal)}, expected {sorted(EXPECTED_NO_KCAL)}")
    # the lunch supplement must repeat seven main-menu dishes with identical values
    lunch_found = {norm(d["name"]): [v for vs, _ in d["kcal"] for v in vs] for d in dishes["lunch"]}
    main_found = {k[1]: [v for vs, _ in d["kcal"] for v in vs] for k, d in found.items() if k[0] == "main"}
    expected = {norm(k) for k in LUNCH_SAME_AS_MAIN}
    if set(lunch_found) != expected:
        raise SystemExit(f"The lunch supplement changed: prints {sorted(lunch_found)}, expected {sorted(expected)}")
    for k in expected:
        if lunch_found[k] != main_found[k]:
            raise SystemExit(f"Lunch supplement prints {lunch_found[k]} for {k!r} but the main menu prints {main_found[k]}")
    return found, lines, orphans


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", type=Path, required=True, help="main menu PDF (SOURCE_URL)")
    ap.add_argument("--kids", type=Path, required=True, help="kids menu PDF")
    ap.add_argument("--lunch", type=Path, required=True, help="lunch supplement PDF")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for label, p in (("main", args.main), ("kids", args.kids), ("lunch", args.lunch)):
        print(f"{label} PDF sha256 {sha256_file(p)}  {p}")
    found, lines, orphans = read_all(args.main, args.kids, args.lunch)
    items, excluded = build_items(found, lines, orphans)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Joseph Holt", cuisine="Pub", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
                             nutrition_level="calories")
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("not listed: " + "; ".join(f"{k} ({why})" for k, why in excluded))
    veg = lambda i: "vegetarian" in i["tags"]  # noqa: E731
    skip = {DESS, TEA, KDRINK, KLOLLY, KSIDE, KSPUD, SIDES, SUNSIDES, UPG}
    unstated = [i["name"] for i in items if not veg(i) and "contains_pork" not in i["tags"] and "contains_beef" not in i["tags"]
                and i["category"] not in skip]
    print(f"meat type not stated ({len(unstated)}): " + "; ".join(unstated))


if __name__ == "__main__":
    main()
