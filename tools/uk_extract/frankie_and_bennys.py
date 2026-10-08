#!/usr/bin/env python3
"""Build data/source/frankie-and-bennys/ from Frankie & Benny's official nutrition menus (hosted by Tenkites).

    python3 tools/uk_extract/frankie_and_bennys.py --checked-on 2026-10-06 [--report]

https://menus.tenkites.com/thebigtg/frankiebennys02 is the menu frankieandbennys.com embeds; every dish has a
"Nutrition (per portion)" table. The Breakfast tab is "in selected sites only", so it is left out. Parser:
tenkites_a.py. Numbers are copied as printed; only names, categories and the rules below are written by hand.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402

URL = "https://menus.tenkites.com/thebigtg/frankiebennys02"
TABS = {
    "Main Menu": "use",
    "Breakfast": "served in selected sites only (the tab says so)",
    "Lunch": "use",
    "Desserts": "use",
    "Drinks": "use",
    "Evening": "use",
    "Kids": "use",
}
EXPECTED = {"Main Menu": 126, "Lunch": 31, "Desserts": 28, "Drinks": 140, "Evening": 49, "Kids": 61}

ADDONS = "Add-ons & extras"
CATEGORY_ORDER = ["Autumn specials", "Starters", "Burgers", "Pizza", "Calzones", "Pasta", "Signature grills & classics",
                  "Salads", "Sides", "Lunch mains", ADDONS, "Desserts", "Shakes",
                  "Kids: Brunch", "Kids: Mains", "Kids: Sides", "Kids: Add-ons & extras", "Kids: Desserts", "Kids: Drinks",
                  "Drinks: Cocktails", "Drinks: Mocktails", "Drinks: Gin & tonics", "Drinks: Beers & ciders", "Drinks: Wine",
                  "Drinks: Soft drinks", "Drinks: Spirits"]
MAIN_CATEGORY = {"AUTUMN SPECIALS": "Autumn specials", "STARTERS": "Starters", "BURGERS": "Burgers", "PIZZA": "Pizza",
                 "CALZONES": "Calzones", "PASTA": "Pasta", "SIGNATURE GRILLS & CLASSICS": "Signature grills & classics",
                 "SALADS": "Salads", "SIDES": "Sides", "MAINS": "Lunch mains", "DESSERT": "Desserts", "DESSERTS": "Desserts"}
KIDS_CATEGORY = {"BRUNCH": "Kids: Brunch", "MAINS": "Kids: Mains", "SIDES": "Kids: Sides", "DESSERTS": "Kids: Desserts",
                 "DRINKS": "Kids: Drinks"}
DRINK_CATEGORY = {"COCKTAILS": "Drinks: Cocktails", "MOCKTAILS": "Drinks: Mocktails", "GIN & TONICS": "Drinks: Gin & tonics",
                  "BOTTLED BEERS & CIDERS": "Drinks: Beers & ciders", "DRAUGHT BEERS & CIDERS": "Drinks: Beers & ciders",
                  "WINES": "Drinks: Wine", "SOFT DRINKS": "Drinks: Soft drinks", "SPIRITS": "Drinks: Spirits"}
ALCOHOL = {"Drinks: Cocktails", "Drinks: Gin & tonics", "Drinks: Beers & ciders", "Drinks: Wine", "Drinks: Spirits"}
# the page's own typos in parent headings
PARENT_FIX = {"Cola-Cola": "Coca-Cola", "Coke-Cola Zero Sugar": "Coca-Cola Zero Sugar"}
VARIANT = re.compile(r"^(\d+\s?(ml|cl)|\d+ piece|small|large|regular|single|double|bottle|half|pint|(shandy|top) (half|pint)|"
                     r"still( large)?|sparkling( regular| large)?|small eater|large eater|go gluten[- ]free|standard|"
                     r"gluten[- ]free|\d stack|whole rack|ribs - half rack|fried|poached|scrambled)$", re.I)
ADD_SECTION = re.compile(r"^(add:|go on\.\.\. add|why not add:|get saucy! |cheese, please|choose your sauce|choose from:$)", re.I)
ADD_PARENT = re.compile(r"^(beef up your burger|double up your patty|extra pizza toppings|level up with our dips)", re.I)


def classify(rec: dict):
    menu, c1, c2, byo, sec = rec["menu"], rec["course"], rec["course2"], rec["byo"], rec["byo_section"]
    nm = t.tidy_name(rec["name"])
    byo = PARENT_FIX.get(byo, byo)

    if menu == "Kids":
        cat = KIDS_CATEGORY[c1]
        spec = {"category": cat, "rankable": False}
        if sec.startswith("Choose two toppings"):
            spec.update(name=f"{nm} (kids pizza topping)", category="Kids: Add-ons & extras")
        elif cat == "Kids: Sides":
            spec.update(name=f"{nm} (kids side)")
        elif byo == "Ice Cream":
            spec.update(name=f"Ice Cream: {nm}")
        elif cat == "Kids: Drinks" and not byo:
            spec.update(name=f"{nm} (kids drink)")
        elif byo and VARIANT.match(nm):
            spec.update(name=f"{byo} ({nm})")
        elif byo in ("Kids Pancakes", "Fresh fruit with choice of dip", "Fruit Juice", "Squash", "Water") and nm != byo:
            spec.update(name=f"{byo} ({nm})")
        return spec

    if menu == "Drinks":
        cat = DRINK_CATEGORY[c1]
        spec = {"category": cat, "rankable": False, "alcohol": cat in ALCOHOL}
        if byo and VARIANT.match(nm):
            spec.update(name=f"{byo} ({nm})", serving=nm if re.match(r"^(\d+\s?(ml|cl)|half|pint|large|bottle)$", nm, re.I) else "")
        elif byo == "Juices":
            spec.update(name=f"{nm} Juice" if "juice" not in nm.lower() else nm)
        return spec

    if menu == "Desserts":
        if c2 == "Shakes":
            return {"category": "Shakes", "rankable": False, "name": nm if "shake" in nm.lower() else f"Shake: {nm}"}
        if c2 == "Ice Cream" or byo == "Choose from:" or sec == "Choose from:":
            return {"category": "Desserts", "rankable": False, "name": f"Ice Cream: {nm}"}
        return {"category": "Desserts", "rankable": False}

    # Main Menu, Lunch, Evening
    cat = MAIN_CATEGORY[c1]
    if c1 in ("DESSERT", "DESSERTS"):
        if sec.startswith("Choose from"):
            return {"category": "Desserts", "rankable": False, "name": f"Ice Cream: {nm}"}
        return {"category": "Desserts", "rankable": False}
    if c2.startswith("Upgrade your fries") or c2 == "Loaded Fries":
        return {"category": "Sides", "rankable": True}
    if menu == "Lunch" and byo == "Southern Fried Chicken":     # chicken with the chosen sauce: values are for the dish
        return {"category": cat, "rankable": True, "name": f"Southern Fried Chicken ({nm})"}
    if menu == "Lunch" and nm == "Mozzarella" and sec == "Add:" and c1 == "STARTERS":
        return {"category": cat, "rankable": True, "name": "Garlic Pizza Bread with Mozzarella",
                "note": "printed as 'Add: Mozzarella' under Garlic Pizza Bread; the numbers are for the starter with it added"}
    if nm == "Cheesy Garlic Bread":     # shown as a "why not add" swap in some places; it is the same starter
        return {"category": "Starters", "rankable": True}
    if byo == "Frankie's Wings":
        if sec.startswith("Choose your size"):
            return {"category": cat, "rankable": True, "name": f"Frankie's Wings ({nm})", "serving": nm}
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (sauce)"}
    if byo == "Slow-Cooked Hickory Smoked BBQ Ribs":
        return {"category": cat, "rankable": True, "name": f"{byo} ({nm.replace('Ribs - ', '')})"}
    if (c2.startswith(("Go on... add", "Extras")) or ADD_SECTION.match(sec) or ADD_PARENT.match(byo)) \
            and not sec.startswith("Fancy"):
        label = "sauce" if re.match(r"^(get saucy|choose your sauce)", sec, re.I) or byo.lower().startswith("level up") else "add-on"
        return {"category": ADDONS, "rankable": False, "name": f"{nm} ({label})"}
    spec = {"category": cat, "rankable": not t.SHARING.search(nm)}
    if c1 == "AUTUMN SPECIALS":
        spec["limited_time"] = True
        spec["rankable"] = nm == "Hot Honey Fried Chicken Burger"
    return spec


HOLDBACK = {
    "Budweiser (Half)": "The table prints 1,034 kcal and 72.7 g of carbohydrate for half a pint of draught lager.",
    "Budweiser (Pint)": "The table prints 2,068 kcal and 145.4 g of carbohydrate for a pint of draught lager.",
    "Budweiser (Shandy Half)": "The table prints 701 kcal and 49.2 g of carbohydrate for half a pint of shandy.",
    "Budweiser (Shandy Pint)": "The table prints 1,402 kcal and 98.3 g of carbohydrate for a pint of shandy.",
    "Budweiser (Top Half)": "The table prints 853 kcal and 59.9 g of carbohydrate for half a pint of lager top.",
    "Budweiser (Top Pint)": "The table prints 1,706 kcal and 119.8 g of carbohydrate for a pint of lager top.",
    "Sweetcorn (add-on)": "The table prints saturates (4.9 g) above total fat (2.0 g).",
    "Sweetcorn (kids side)": "The table prints saturates (2.4 g) above total fat (1.0 g).",
    "Sweetcorn (kids pizza topping)": "The table prints saturates (1.6 g) above total fat (0.7 g).",
    "Orange (kids drink)": "The table prints 52 kcal with only 2.4 g of carbohydrate and no protein or fat.",
    "Tomato Juice": "The table prints 169 kcal; its own macros (3.1 g protein, 12.2 g carbs, 2.0 g fat) add up to about 79 kcal.",
    "Peroni 0.0% 330ml": "The table prints 139 kcal for an alcohol-free beer whose own macros (10.6 g carbs) add up to about 42 kcal.",
    "Jack Daniels (25ml)": "The table prints 605 kcal for a 25 ml measure of whiskey (0 g of everything else).",
    "Jack Daniels (50ml)": "The table prints 1,211 kcal for a 50 ml measure of whiskey (0 g of everything else).",
    # accuracy check 2026-10-08: the dietary section of each bottled water prints all 14 allergens, every gluten cereal and every tree nut
    # (a placeholder, not an allergen statement): allergen row contradicts the item's name, so it is not shown.
    "Strathmore Water (Still)": "Allergen row contradicts the item's name: the page marks all 14 allergens, every cereal and every tree nut for bottled still water.",
    "Strathmore Water (Still Large)": "Allergen row contradicts the item's name: the page marks all 14 allergens, every cereal and every tree nut for bottled still water.",
    "Strathmore Water (Sparkling Regular)": "Allergen row contradicts the item's name: the page marks all 14 allergens, every cereal and every tree nut for bottled sparkling water.",
    "Strathmore Water (Sparkling Large)": "Allergen row contradicts the item's name: the page marks all 14 allergens, every cereal and every tree nut for bottled sparkling water.",
}
NOTE = ("Per portion as printed on the chain's menu pages; the Breakfast menu (selected sites only) is not listed. Wines, many "
        "cocktails and some drinks print no numbers and are not listed. Sauces, toppings, extras and upgrade sides are separate "
        "rows: add them to a dish yourself.")

# The same pages print each dish's allergens ("Dietary Information": "Contains:" and "May contain:", naming the cereals
# and tree nuts) and carry the label ids of the page's own allergen filter; tenkites_a cross-checks the two.
ALLERGEN_TITLE = "Frankie & Benny's Dietary Information (allergens) on its online Main, Lunch, Desserts, Drinks, Evening and Kids menus (Ten Kites page generated 2026-10-06)"

if __name__ == "__main__":
    sys.exit(t.run(
        chain_id="frankie-and-bennys", name="Frankie & Benny's", cuisine="Italian American",
        aliases=["frankie & benny's", "frankie and bennys", "frankie & bennys", "frankie and benny's"], url=URL,
        source_title="Frankie & Benny's Nutritional Information: Main, Lunch, Desserts, Drinks, Evening and Kids menus (page generated 2026-10-06)",
        tabs=TABS, classify=classify, category_order=CATEGORY_ORDER, expected_rows=EXPECTED, note=NOTE, holdback=HOLDBACK,
        allergen_title=ALLERGEN_TITLE))
