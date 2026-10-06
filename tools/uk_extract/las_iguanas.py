#!/usr/bin/env python3
"""Build data/source/las-iguanas/ from Las Iguanas' official nutrition menus (hosted by Tenkites).

    python3 tools/uk_extract/las_iguanas.py --checked-on 2026-10-06 [--report]

https://menus.tenkites.com/thebigtg/lasiguanas202507 is the menu iguanas.co.uk links to (the sister page
lasiguanas202502 was not used: the 202507 page is the newer one). Every dish has a "Nutrition (per portion)" table.
The other tabs are the same address with ?mguid=<tab id>. Parser: tenkites_a.py. Numbers are copied as printed; only
names, categories and the rules below are written by hand.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402

URL = "https://menus.tenkites.com/thebigtg/lasiguanas202507"
TABS = {
    "Main Menu": "use",
    "Lunch": "use",
    "Bottomless Brunch": "use",
    "Kids": "use",
    "Sunday Sharer": "a whole chicken to share: the number of people is not stated, so the portion is unclear",
    "Cocktails": "use",
    "Drinks": "use",
    "Bottomless Tapas": "use",
}
EXPECTED = {"Main Menu": 165, "Lunch": 13, "Bottomless Brunch": 55, "Kids": 36, "Cocktails": 53, "Drinks": 128,
            "Bottomless Tapas": 33}

ADDONS = "Add-ons & extras"
CATEGORY_ORDER = ["Sharing", "Tapas & starters", "Curries", "Mains", "Burgers", "Lunch", "Bottomless brunch", "Sides",
                  "Dips & sauces", "Desserts", ADDONS,
                  "Kids: Mains", "Kids: Sides", "Kids: Desserts", "Kids: Drinks",
                  "Drinks: Cocktails", "Drinks: Mocktails", "Drinks: Gin & tonic", "Drinks: Spirits", "Drinks: Shots",
                  "Drinks: Wine", "Drinks: Beer & cider", "Drinks: Soft drinks"]
BYO_FIX = {"Burritos": "Burrito", "Enchilada": "Enchiladas", "Quesadillas": "Quesadilla", "Classic": "Classic Burger",
           "Classic Burgers": "Classic Burger", "Gaucho Smash Burger": "Gaucho Burger", "XinXim": "XimXim",
           "Brazilian Bahian Curry": "Bahian Curry"}
SIDE_SECTIONS = re.compile(r"^(choose your side|upgrade your side|served with|comes with)", re.I)
TACO_BASES = {"Soft Taco", "Lettuce Taco"}
CHURRO_DIPS = {"Chocolate Ganache", "Dulce de leche"}
MAIN_CATEGORY = {"Sharing Section": "Sharing", "Tapas & Starters": "Tapas & starters", "Curries": "Curries", "Mains": "Mains",
                 "Burgers": "Burgers", "Sides": "Sides", "Dips": "Dips & sauces", "Desserts": "Desserts", "": "Lunch",
                 "Brunch Plates": "Bottomless brunch", "Premium Brunch | From +5.50pp": "Bottomless brunch"}
DRINK_CATEGORY = {"Gin & Tonic": "Drinks: Gin & tonic", "Tequila & Mezcal": "Drinks: Spirits", "Cachaca": "Drinks: Spirits",
                  "Sober-Curious": "Drinks: Mocktails", "Virgin Mocktails": "Drinks: Mocktails",
                  "Shots, Shorts & Sippers": "Drinks: Shots", "Sparkling": "Drinks: Wine", "White Wine": "Drinks: Wine",
                  "Rose Wine": "Drinks: Wine", "Red Wine": "Drinks: Wine", "Beer & Cider": "Drinks: Beer & cider",
                  "Soft Drinks": "Drinks: Soft drinks", "Cocktails": "Drinks: Cocktails", "Classics": "Drinks: Cocktails",
                  "Fiesta": "Drinks: Cocktails", "Carnival": "Drinks: Cocktails", "Signatures": "Drinks: Cocktails",
                  "Sharing & Skulls": "Drinks: Cocktails", "Alcohol-Free Brunch": "Drinks: Mocktails"}
ALCOHOL = {"Drinks: Cocktails", "Drinks: Gin & tonic", "Drinks: Spirits", "Drinks: Shots", "Drinks: Wine", "Drinks: Beer & cider"}


def join(parent: str, nm: str) -> str:
    """Option under a parent dish: keep the option name if it already carries the parent's name."""
    parent = BYO_FIX.get(parent, parent)
    p, n = parent.lower().replace("&", "and"), nm.lower().replace("&", "and")
    if p.startswith(n):                       # 'Acapulco' under 'Acapulco Burger'
        return parent
    if p in n or n.split()[0] in p.split() and len(n.split()) > 1 and p.split()[0] == n.split()[0]:
        return nm
    if "chilli" in p and "chilli" in n:
        return nm
    return f"{parent}: {nm}"


def classify(rec: dict):
    menu, c1, c2, byo, sec = rec["menu"], rec["course"], rec["course2"], rec["byo"].split(" | ")[0], rec["byo_section"]
    nm = t.tidy_name(rec["name"])
    nums = t.numbers(rec)
    if byo == "Bottled Softs":
        return ("skip", "three bottled soft drinks are each printed only as 'Bottle', with no product name")

    if menu == "Kids":
        spec = {"rankable": False, "category": "Kids: Mains"}
        if c1 == "Sides":
            spec.update(category="Kids: Sides", name=f"{nm} (kids side)")
        elif c1 == "Dessert":
            spec.update(category="Kids: Desserts")
            if sec == "Ice Cream & Sorbet" or byo == "Ice Cream & Sorbet":
                spec.update(name=nm if "sorbet" in nm.lower() else f"Ice Cream: {nm}")
            elif sec:
                spec.update(name=f"{sec}: {nm}")
        elif c1 == "Drinks":
            spec.update(category="Kids: Drinks")
            if sec == "Fruit Shoot":
                spec.update(name=f"Fruit Shoot: {nm} (kids)")
            elif sec == "Juice":
                spec.update(name=f"{nm} (kids)")
        elif byo == "Quesadilla":
            spec.update(name=f"Quesadilla: {nm} (kids)")
        elif byo == "Burgers":
            spec.update(name=f"{nm} (kids)")
        elif byo in ("Coconut Curry",):
            spec.update(name=f"{nm} (kids)")
        else:
            spec.update(name=f"{nm} (kids)")
        return spec

    if menu in ("Drinks", "Cocktails") or (menu == "Bottomless Brunch" and c1 in ("Cocktails", "Alcohol-Free Brunch")):
        cat = DRINK_CATEGORY[c1]
        spec = {"category": cat, "rankable": False, "alcohol": cat in ALCOHOL}
        if t.SIZE_LABEL.match(nm) and byo:
            spec.update(name=f"{byo} ({nm})", serving=nm)
        elif byo in ("Jarritos", "Trip (15mg CBD)", "Juices", "Kopparberg"):
            spec.update(name=f"{byo}: {nm}")
        return spec

    # food: Main Menu, Lunch, Bottomless Brunch, Bottomless Tapas
    if SIDE_SECTIONS.match(sec):
        return {"category": "Sides", "rankable": True}
    if sec.startswith("Why Not Add"):
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (add-on)"}
    if c2 == "VIP your burger":
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (burger add-on)"}
    if byo == "Nachos" and sec.startswith("Pile on"):
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (nacho topping)"}
    if byo == "Taco Sharing Board" and sec:
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (taco board filling)"}
    if byo == "Tacos":
        if nm in TACO_BASES:
            return {"category": "Tapas & starters", "rankable": False}
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (taco filling)"}
    if byo == "Churros" and nm in CHURRO_DIPS:
        return {"category": ADDONS, "rankable": False, "name": f"{nm} (churro dip)"}
    if nm.startswith("Surf & Turf"):
        return {"category": ADDONS, "rankable": False, "tags_name_only": True}
    cat = MAIN_CATEGORY[c1]
    spec = {"category": cat, "rankable": cat not in ("Sharing", "Desserts", "Dips & sauces")}
    if byo == "Sizzling Fajitas":                         # base and protein are printed separately
        spec["rankable"] = False
        spec["name"] = nm if nm.startswith("Sizzling") else f"Sizzling Fajitas: {nm}"
    elif byo == "Chicken Wings":
        spec["name"] = f"Chicken Wings: {nm}"
    elif byo == "Nachos" and nm.startswith("For Two"):
        spec["name"] = f"Nachos for Two{nm[7:]}"
    elif byo == "Ice Cream & Sorbet":
        spec["name"] = nm if "sorbet" in nm.lower() else f"Ice Cream: {nm}"
    elif byo and byo not in ("Taco Sharing Board", "Nachos", "Padrón Peppers", "Hot Honey Fried Halloumi", "XinXim",
                             "Churros", "Ribeye Steak", "Sunshine Salad", "Brazilian Loaded Chicken", "Chilli Stack",
                             "Gaucho Burger", "Fajita Burgers - LIMITED TIME ONLY"):
        spec["name"] = join(byo, nm)
    elif byo in ("Chilli Stack", "Gaucho Burger"):
        spec["name"] = join(byo, nm)
    if c1 == "Burgers" and byo.startswith("Fajita Burgers"):
        spec["limited_time"] = True
    if "Sharing" in cat or t.SHARING.search(nm):
        spec["rankable"] = False
    if menu == "Bottomless Tapas" and cat != ADDONS:
        spec["category"] = "Tapas & starters"
    return spec


HOLDBACK = {
    "Orange Juice (kids)": "The table prints 38.0 g of protein (and 168 kcal) for a glass of orange juice.",
    "Fruit Shoot: Orange (kids)": "The table prints 52 kcal with only 2.4 g of carbohydrate and no protein or fat.",
    "Juices: Orange": "The table prints 26.0 g of protein and 115 kcal for orange juice; its own macros add up to about 206 kcal.",
}
NOTE = ("Per portion as printed on the chain's menu pages. Each part of a meal is listed on its own: the side served with a "
        "burger or steak, fajita and taco fillings, nacho toppings and extras are separate rows, so add the parts you order. "
        "Wines, cocktails and most drinks print no numbers and are not listed.")

if __name__ == "__main__":
    sys.exit(t.run(
        chain_id="las-iguanas", name="Las Iguanas", cuisine="Latin American", aliases=["las iguanas"], url=URL,
        source_title="Las Iguanas Nutrition (per portion) menus, page lasiguanas202507: Main, Lunch, Bottomless Brunch, Kids, Cocktails, Drinks and Bottomless Tapas (page generated 2026-10-06)",
        tabs=TABS, classify=classify, category_order=CATEGORY_ORDER, expected_rows=EXPECTED, note=NOTE, holdback=HOLDBACK))
