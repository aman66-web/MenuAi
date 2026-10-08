#!/usr/bin/env python3
"""Build data/source/mcmullens/ from McMullen & Sons' own menu with nutrition and allergens (hosted by Ten Kites).

    python3 tools/uk_extract/mcmullens.py --checked-on 2026-10-08 [--cache DIR] [--report]

https://menus.tenkites.com/mcmullenandsons/macsclassicmenu04 is the "Mac's Classic" menu that every pub page on
www.mcmullens.co.uk embeds. Every dish has a "Nutrition (per portion)" table (Energy kCal, Protein, Carb, of which Sugars,
Fat, Sat Fat, Salt: no kJ, fibre or weight) behind the dish card, and a "Dietary Information" block ("Contains:",
"May contain:", naming the cereals and tree nuts). The other tabs are the same address with ?mguid=<tab id>. Parser:
tenkites_a.py (the same Ten Kites template as Bella Italia, Frankie & Benny's, Las Iguanas...). Numbers are copied as
printed; only names, categories and the rules below are written by hand. The run stops if a tab appears or disappears or
a tab's dish count changes.

Used: Main Menu, Sunday (the dishes it adds), Kids, Gluten Free and Gluten Free Sunday (every dish there is also on
Main/Sunday with identical numbers: read so their allergens are cross-checked), the Festive Menu and the festive Kid's
tab (limited time). Left out: the Buffet tabs (party packages, per piece or per selection, no stated portion), Christmas
Day and New Year's Eve (single-day pre-booked set menus).

Which menu this is (checked 2026-10-08 by reading each pub page on mcmullens.co.uk's /local-pubs/ list once): the pubs embed
about 60 different Ten Kites menu pages: the Mac's Classic family (macsclassicmenu04, 05, 07, 08), "socialspecialist03/04" and
one page per pub (angels04, bullbrox04 ...); about 10 pubs show none. macsclassicmenu08 (read in full) is a strict subset of 04
with identical numbers; 05 (pizzas) and 07 (bar bundles) hold dishes that 04 lacks, and 07 prints other numbers for dishes that
share a name with 04, so figures differ between menu versions. Only 04 is read here; the others are not.
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402

URL = "https://menus.tenkites.com/mcmullenandsons/macsclassicmenu04"
TABS = {
    "Main Menu": "use",
    "Sunday": "use",
    "Buffet": "party buffet packages: pieces and selections for a group, no stated portion",
    "Kids": "use",
    "Gluten Free": "use",
    "Gluten Free Sunday": "use",
    "Festive Menu": "use",
    "Christmas Day": "Christmas Day only (single-day pre-booked set menu)",
    "Festive Buffet": "party buffet packages: pieces and selections for a group, no stated portion",
    "New Year's Eve": "New Year's Eve only (single-day pre-booked set menu)",
    "Kid's": "use",
}
EXPECTED = {"Main Menu": 157, "Sunday": 137, "Kids": 23, "Gluten Free": 71, "Gluten Free Sunday": 71, "Festive Menu": 22,
            "Kid's": 11}

ADDONS = "Add-ons & extras"
CATEGORY_ORDER = ["Nibbles", "Bar bundles", "Soups", "Social sharers", "Pub heroes", "Signature dishes", "Burgers & dogs",
                  "Grills", "Sunday starters", "Sunday roasts", "Sunday sides", "Sides", "Lunch: Sandwiches",
                  "Lunch: Light bites", "Lunch: Spuds", "Desserts", ADDONS, "Hot drinks",
                  "Kids: Starters", "Kids: Mains", "Kids: Desserts",
                  "Festive: Starters", "Festive: Mains", "Festive: Desserts", "Festive: Kids"]

# main-menu course -> (category, rankable). Soups (a sub-course of Bar Bundles), add-ons and lunch parts are handled below.
COURSE = {
    "Nibbles": ("Nibbles", False), "Bar Bundles": ("Bar bundles", False), "Social Sharers": ("Social sharers", False),
    "Pub Heroes": ("Pub heroes", True), "Signature Dishes": ("Signature dishes", True),
    "Burgers & Dogs": ("Burgers & dogs", True), "Burgers": ("Burgers & dogs", True), "Grills": ("Grills", True),
    "Sunday Starters": ("Sunday starters", False), "Sunday Roasts": ("Sunday roasts", True),
    "Sunday Sides": ("Sunday sides", False), "Sides": ("Sides", False), "Desserts": ("Desserts", False),
    "Hot Drinks": ("Hot drinks", False),
}
LUNCH = {"Sandwiches": "Lunch: Sandwiches", "Light Bites": "Lunch: Light bites", "Spuds": "Lunch: Spuds"}
# printed as dishes of their own but they only make sense with another dish: not an order on their own
NOT_AN_ORDER = {
    "House Salad": "listed under Signature Dishes with the Add Ons (chicken, steak, seabass, halloumi) that are served on it",
    "Double Your Beef Burger": "printed with no description or bun: reads as an extra patty for a burger",
    "Double Your Chicken Burger": "printed with no description: reads as an extra chicken fillet for a burger",
}


def classify(rec: dict):
    menu, c1, c2 = rec["menu"], rec["course"], rec["course2"]
    nm = t.tidy_name(rec["name"])

    if menu == "Festive Menu":
        cat = {"Starters": "Festive: Starters", "Mains": "Festive: Mains", "Desserts": "Festive: Desserts",
               "Add On": ADDONS}[c1]
        return {"category": cat, "rankable": cat == "Festive: Mains", "name": f"{nm} (festive menu)", "limited_time": True}
    if menu == "Kid's":
        return {"category": "Festive: Kids", "rankable": False, "name": f"{nm} (festive kids menu)", "limited_time": True}
    if menu == "Kids":
        if c1 == "For the Bigger Appetite":     # the same three dishes, with the same numbers, as on the Main Menu (Lunch)
            return {"category": "Lunch: Light bites", "rankable": True}
        if c2 == "Add a topping":
            return {"category": ADDONS, "rankable": False, "name": f"{nm} (kids add-on)"}
        cat = {"Starters": "Kids: Starters", "Mains": "Kids: Mains", "Desserts": "Kids: Desserts"}[c1]
        return {"category": cat, "rankable": False, "name": f"{nm} (kids)"}

    # Main Menu, Sunday, Gluten Free, Gluten Free Sunday
    if c2 in ("Add Ons", "Top Your Burger"):
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (add-on)"}
    if c2 == "Homemade Soup of the Day":
        return {"category": "Soups", "rankable": False}
    if c2 == "Coffee & Mini Dessert":
        return {"category": "Desserts", "rankable": False}
    if c1 == "Lunch":
        return {"category": LUNCH[c2], "rankable": True}
    cat, rankable = COURSE[c1]
    if nm in NOT_AN_ORDER:
        return {"category": ADDONS if nm.startswith("Double") else cat, "rankable": False}
    return {"category": cat, "rankable": rankable}


# Rows the page prints impossibly (never corrected, never published): see the reasons. Keys are final item names.
HOLDBACK: dict = {
    'Breaded Mozzarella Bites': 'The page prints 234 kcal, but its own protein, carbohydrate and fat add up to about 612 kcal.',
    'Posh Cocktail Sausages': 'The page prints 1184 kcal, but its own protein, carbohydrate and fat add up to about 4173 kcal. The page prints 23.8 g of salt for one portion, which cannot be right.',
    'Roast Butternut Squash & Red Chilli Soup': 'The page prints 87.9 g of salt for one portion of soup, which cannot be right.',
    'Gluten Free Roast Butternut Squash & Red Chilli Soup': 'The page prints 87.9 g of salt for one portion of soup, which cannot be right.',
    'Parsnip & Honey Soup': 'The page prints 43.9 g of salt for one portion of soup, which cannot be right.',
    'Gluten Free Parsnip & Honey Soup': 'The page prints 44.0 g of salt for one portion of soup, which cannot be right.',
    'Broccoli & Stilton Soup': 'The page prints 340 kcal, but its own protein, carbohydrate and fat add up to about 433 kcal.',
    'Gluten Free Broccoli & Stilton Soup': 'The page prints 346 kcal, but its own protein, carbohydrate and fat add up to about 440 kcal.',
    'Leek & Potato Soup': 'The page prints 97.3 g of salt for one portion of soup, which cannot be right.',
    'Gluten Free Leek & Potato Soup': 'The page prints 97.3 g of salt for one portion of soup, which cannot be right.',
    'Scampi & Chips': 'The page prints 608 kcal, but its own protein, carbohydrate and fat add up to about 805 kcal.',
    'Ultimate Scampi & Chips': 'The page prints 817 kcal, but its own protein, carbohydrate and fat add up to about 1013 kcal.',
    'Grilled Chicken Kebab': 'The page prints 688 kcal, but its own protein, carbohydrate and fat add up to about 1008 kcal.',
    'Creamy Cajun Vegetable Penne': 'The page prints 885 kcal, but its own protein, carbohydrate and fat add up to about 1669 kcal.',
    'The Classic Dog': 'The page prints 1719 kcal, but its own protein, carbohydrate and fat add up to about 4692 kcal. The page prints 25.4 g of salt for one portion, which cannot be right.',
    'The Ultimate British Bulldog': 'The page prints 1965 kcal, but its own protein, carbohydrate and fat add up to about 4941 kcal. The page prints 26.4 g of salt for one portion, which cannot be right.',
    'Coconut, Chilli & Lime Chicken Thighs': 'The page prints 422 kcal, but its own protein, carbohydrate and fat add up to about 743 kcal.',
    'Ultimate Mixed Grill': 'The page prints 2815 kcal, but its own protein, carbohydrate and fat add up to about 5849 kcal. The page prints 28.6 g of salt for one portion, which cannot be right.',
    'Gluten Free Ultimate Sweet Potato & Chestnut Nut Loaf': 'The page prints 1186 kcal, but its own protein, carbohydrate and fat add up to about 1382 kcal.',
    'Roast Potatoes': 'The page prints 223 kcal, but its own protein, carbohydrate and fat add up to about 436 kcal.',
    'Pork Crackling': 'The page prints 327 kcal, but its own protein, carbohydrate and fat add up to about 1164 kcal.',
    'Light Scampi & Chips': 'The page prints 537 kcal, but its own protein, carbohydrate and fat add up to about 662 kcal.',
    'Lotus Biscoff Waffle': 'The page prints 523 kcal, but its own protein, carbohydrate and fat add up to about 1023 kcal.',
    'Black Forest Gateau': 'The page prints 271 kcal, but its own protein, carbohydrate and fat add up to about 357 kcal.',
    'Mini Belgian Biscoff Waffle': 'The page prints 139 kcal, but its own protein, carbohydrate and fat add up to about 339 kcal.',
    'Great With A Grill (add-on)': 'The page prints 216 kcal, but its own protein, carbohydrate and fat add up to about 286 kcal.',
    'Add Surf To Your Turf (add-on)': 'The page prints 199 kcal, but its own protein, carbohydrate and fat add up to about 292 kcal.',
    'Add a Gluten Free British Cheese Board (festive menu)': 'The page prints 562 kcal, but its own protein, carbohydrate and fat add up to about 684 kcal.',
    'Tomato Penne (kids)': 'The page prints 57 kcal, but its own protein, carbohydrate and fat add up to about 133 kcal.',
    'Fish Fingers (kids)': 'The page prints 335 kcal, but its own protein, carbohydrate and fat add up to about 449 kcal.',
    'Black Cherry Pie (festive menu)': 'The page prints 411 kcal, but its own protein, carbohydrate and fat add up to about 935 kcal.',
    'Apple Cinnamon Waffle (festive menu)': 'The page prints 336 kcal, but its own protein, carbohydrate and fat add up to about 638 kcal.',
    'Tomato & Red Pepper Soup (festive kids menu)': 'The page prints 53.3 g of salt for one portion of soup, which cannot be right.',
    'Gluten Free Tomato & Red Pepper Soup (festive kids menu)': 'The page prints 52.9 g of salt for one portion of soup, which cannot be right.',
    'Cauliflower Cheese': 'The page prints 178.8 g of protein in a 1093 kcal portion of cauliflower cheese (65% of its energy, with only 33.4 g of fat), against 15.5 g of protein for its Mac \'n\' Cheese side: not credible. Held back as a judgement call.',
    'Gluten Free Bread & Butter': 'The page prints 0.1 g carbohydrate, 0.1 g protein and 15.8 g fat (the numbers of the butter alone, nothing of a gluten free bread) and no allergens, for a dish named Bread & Butter: the record looks unfinished, so its numbers and allergens are not published. Held back as a judgement call (independent re-read 2026-10-08).',
    'Grilled Seabass Fillet': 'The page prints 12.1 g protein, 91.7 g carbohydrate and 46.3 g sugars for a fish fillet dish (a fillet alone has more protein than that) and its description says buttered new potatoes but no milk is marked: the record does not fit the dish. Held back as a judgement call (independent re-read 2026-10-08).',
    'Grilled Seabass Fillet (add-on)': 'The page prints 3.1 g protein, 62.6 g carbohydrate and 41.6 g sugars for a seabass fillet add-on: the figures cannot be a fish fillet. Held back as a judgement call (independent re-read 2026-10-08).',
    'Baked Seabass Fillet (festive menu)': 'The page prints 12.5 g protein, 112.9 g carbohydrate and 63.1 g sugars for a seabass dish, like the two other seabass rows (a fillet alone has more protein than that): the record does not fit the dish. Held back as a judgement call (independent re-read 2026-10-08).',
    'Duck Bon Bons': 'Allergen row contradicts the dish ingredients: the description names a smoky mayo but the page marks no egg. Held back (independent re-read 2026-10-08).',
    'Roast Turkey (festive menu)': 'Allergen row contradicts the dish description: it names a buttery roast gravy but the page marks no milk. Held back (independent re-read 2026-10-08).',
    'Roast Turkey (festive kids menu)': 'Allergen row contradicts the dish description: it names a buttery roast gravy but the page marks no milk. Held back (independent re-read 2026-10-08).',
    'Beef Meatballs': 'The page lists all 14 allergens for this beef meatball, tomato sauce and garlic ciabatta dish and prints 3.7 g of protein: the record looks unfinished. Held back as a judgement call.',
}

NOTE = ("Per portion from McMullen's Mac's Classic menu page (version 04, no date shown), which only some of its pubs use: many "
        "pubs publish their own menu pages, and other Classic versions differ in dishes and figures, so they are not included. "
        "Cold and alcoholic drinks are not on the page. Dishes whose own figures contradict each other are held back.")

# The same pages print each dish's allergens ("Dietary Information": "Contains:" and "May contain:", naming the cereals and
# tree nuts) and carry the label ids of the page's own allergen filter; tenkites_a cross-checks the two.
ALLERGEN_TITLE = ("McMullen & Sons Dietary Information (allergens) on its online Mac's Classic menu: Main, Sunday, Kids, Gluten "
                  "Free, Gluten Free Sunday, Festive and Kid's tabs (Ten Kites page, no date shown; read 2026-10-08)")

if __name__ == "__main__":
    sys.exit(t.run(
        chain_id="mcmullens", name="McMullen & Sons", cuisine="Pub",
        aliases=["mcmullens", "mcmullen & sons", "mcmullen and sons", "mcmullens pubs", "mcmullen's", "mac's", "macs"],
        url=URL,
        source_title="McMullen & Sons Mac's Classic menu with Nutrition (per portion), page macsclassicmenu04: Main, Sunday, Kids, Gluten Free, Gluten Free Sunday, Festive and Kid's tabs (Ten Kites page, no date shown; read 2026-10-08)",
        tabs=TABS, classify=classify, category_order=CATEGORY_ORDER, expected_rows=EXPECTED, note=NOTE, holdback=HOLDBACK,
        allergen_title=ALLERGEN_TITLE))
