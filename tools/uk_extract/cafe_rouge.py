#!/usr/bin/env python3
"""Build data/source/cafe-rouge/ from Cafe Rouge's official nutrition menus (hosted by Tenkites).

    python3 tools/uk_extract/cafe_rouge.py --checked-on 2026-10-06 [--report]

https://menus.tenkites.com/thebigtg/mobilemenuscaferouge is the generic menu caferouge.com links to; every dish has a
"Nutritional Values" popup with kCal, protein, carb, sugars, fat, sat fat, salt per portion. This chain uses the older
Tenkites page template (popover instead of modal), which tenkites_a.py also reads. The other tabs are the same address
with ?mguid=<tab id>. Numbers are copied as printed; only names, categories and the rules below are written by hand.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402

URL = "https://menus.tenkites.com/thebigtg/mobilemenuscaferouge"
TABS = {
    "Main Menu": "use",
    "Desserts": "use",
    "Lunch": "use",
    "Kids": "use",
    "Afternoon Tea": "sets for sharing with no stated number of people: the portion is unclear",
    "Breakfast": "use",
    "Drinks": "use",
    "Sunday Roast": "Centre Parcs sites only (the tab says so)",
    "Christmas Day Menu": "Christmas Day only (seasonal pre-booked menu)",
    "Children's Christmas Day Menu": "Christmas Day only (seasonal pre-booked menu)",
}
EXPECTED = {"Main Menu": 80, "Desserts": 13, "Lunch": 15, "Kids": 23, "Breakfast": 53, "Drinks": 76}

ADDONS = "Add-ons & extras"
CATEGORY_ORDER = ["Starters", "Mains", "From the grill", "Sides", "Lunch", "Breakfast", "Breakfast pastries", "Desserts",
                  "Coffee & cake", ADDONS, "Kids: Breakfast", "Kids: Starters", "Kids: Mains", "Kids: Desserts", "Kids: Drinks",
                  "Drinks: Hot drinks", "Drinks: Sparkling & champagne", "Drinks: Cocktails", "Drinks: Non-alcoholic cocktails",
                  "Drinks: Gin", "Drinks: Beer & cider", "Drinks: Wine", "Drinks: Soft drinks"]
MAIN_CATEGORY = {"STARTERS": "Starters", "MAINS": "Mains", "FROM THE GRILL": "From the grill", "SIDES": "Sides",
                 "DESSERTS": "Desserts", "LUNCH": "Lunch"}
KIDS_CATEGORY = {"STARTERS": "Kids: Starters", "MAINS": "Kids: Mains", "DESSERTS": "Kids: Desserts", "DRINKS": "Kids: Drinks"}
DRINK_CATEGORY = {"Sparkling & Champagne": "Drinks: Sparkling & champagne", "Cocktails": "Drinks: Cocktails",
                  "Non-Alcoholic Cocktails": "Drinks: Non-alcoholic cocktails", "Gin Collection": "Drinks: Gin",
                  "Beer": "Drinks: Beer & cider", "Cider": "Drinks: Beer & cider", "White Wine": "Drinks: Wine",
                  "Rose Wine": "Drinks: Wine", "Red Wine": "Drinks: Wine", "Soft Drinks": "Drinks: Soft drinks"}
ALCOHOL = {"Drinks: Sparkling & champagne", "Drinks: Cocktails", "Drinks: Gin", "Drinks: Beer & cider", "Drinks: Wine"}
UNNAMED = {"standard", "- single", "- regular", "single", "regular"}   # variant labels printed without a dish name
OMELETTE_FILLINGS = {"Ham", "Tomatoes", "Spinach", "Mushrooms"}
BREAKFAST_TOPPINGS = {"Streaky Bacon", "Fresh Blueberries & Strawberries"}
ICE_CREAMS = {"Vanilla", "Double Chocolate", "Strawberry", "Salted Caramel", "Vegan Vanilla"}
SAUCE = re.compile(r"(sauce|jus)$", re.I)


def cname(raw: str) -> str:
    """The page's own phrasing tidied: 'ask for X - Gluten Free' -> 'X (Gluten Free)', prices dropped from 'add X for £1.75'."""
    n = t.tidy_name(raw)
    n = re.sub(r"^(ask for|add)\s+", "", n, flags=re.I)
    n = re.sub(r"^•\s*", "", n)
    n = re.sub(r"\s+for (£\d+(\.\d+)?|\d+p)$", "", n)
    n = re.sub(r"\s+-\s+(Gluten[- ]free|Vegan)$", lambda m: f" ({m.group(1)})", n, flags=re.I)
    return n[:1].upper() + n[1:]


def _classify(rec: dict):
    menu, c1, byo, sec = rec["menu"], rec["course"], rec["byo"], rec["byo_section"]
    raw = rec["name"].strip()
    nm = cname(raw)
    nums = t.numbers(rec)
    if nm == "Ice Cream & Sorbet" and all(nums[k] in ("0", "0.0") for k in ("calories", "protein_g", "carbs_g", "fat_g")):
        return ("skip", "'Ice Cream & Sorbet' is a heading row: every nutrient is printed as 0")
    if raw.lower() in UNNAMED and not byo:
        return ("skip", f"printed only as {raw!r}, with no dish name")
    if nm == "Breakfast Muffin":
        return ("skip", "the table prints 223 kcal but the description gives its own kcal for the fillings (bacon 170, sausage 289): unclear what 223 covers")
    is_add = bool(re.match(r"^add\s", raw, re.I)) or sec.startswith("Why not add")
    if menu == "Lunch" and nm in OMELETTE_FILLINGS:
        is_add = True
    if menu == "Breakfast" and (c1 == "EXTRAS" or nm in BREAKFAST_TOPPINGS):
        is_add = True
    if is_add:
        label = "kids add-on" if "KIDS" in c1 else "add-on"
        return {"category": ADDONS, "rankable": False, "name": f"{nm} ({label})"}

    if menu == "Drinks":
        cat = DRINK_CATEGORY[c1]
        spec = {"category": cat, "rankable": False, "alcohol": cat in ALCOHOL}
        if t.SIZE_LABEL.match(nm) and byo:
            spec.update(name=f"{byo} ({nm.lstrip('- ')})", serving=nm.lstrip("- "))
        elif byo and not nm.lower().startswith(byo.split()[0].lower()):
            spec.update(name=f"{byo}: {nm}")
        return spec

    if menu == "Kids":
        cat = KIDS_CATEGORY[c1]
        if cat == "Kids: Desserts" and nm in ICE_CREAMS:
            return {"category": cat, "rankable": False, "name": f"Ice Cream: {nm}"}
        return {"category": cat, "rankable": False}

    if menu == "Breakfast":
        if c1.startswith("KIDS"):
            return {"category": "Kids: Breakfast", "rankable": False}
        if c1 == "SWEET":
            return {"category": "Breakfast pastries", "rankable": False}
        if c1.startswith("COFFEE & CAKE"):
            return {"category": "Coffee & cake", "rankable": False}
        if c1.startswith("HOT DRINKS"):
            return {"category": "Drinks: Hot drinks", "rankable": False, "name": nm.lstrip("- ").strip()}
        return {"category": "Breakfast", "rankable": True}

    # Main Menu, Desserts, Lunch
    if menu == "Desserts" or c1 == "DESSERTS":
        if nm in ICE_CREAMS:
            return {"category": "Desserts", "rankable": False, "name": f"Ice Cream: {nm}"}
        return {"category": "Desserts", "rankable": False}
    if sec.startswith(("served with", "Add your choice")) or byo.startswith(("All lunch dishes", "Add your choice")):
        return {"category": "Sides", "rankable": not SAUCE.search(nm)}
    if nm.lower().startswith("upgrade to sweet potato fries"):
        return {"category": "Sides", "rankable": True, "name": "Sweet Potato Fries (lunch upgrade)"}
    if c1 == "SIDES":
        return {"category": "Sides", "rankable": not SAUCE.search(nm)}
    return {"category": MAIN_CATEGORY[c1], "rankable": True}


def classify(rec: dict):
    spec = _classify(rec)
    if isinstance(spec, dict):
        spec.setdefault("name", cname(rec["name"]))
    return spec


HOLDBACK = {
    "Olives": "The table prints 237 kcal; its own macros (1.7 g protein, 1.0 g carbs, 4.1 g fat) add up to about 48 kcal.",
}
NOTE = ("Per portion as printed on the chain's menu pages. Wines, cocktails and most drinks print no numbers and are not listed; "
        "afternoon tea, Sunday roast (Centre Parcs only) and the Christmas Day menus are not listed. Extras and the side served "
        "with a grill dish are separate rows: add them yourself.")

if __name__ == "__main__":
    sys.exit(t.run(
        chain_id="cafe-rouge", name="Cafe Rouge", cuisine="French", aliases=["cafe rouge", "café rouge"], url=URL,
        source_title="Cafe Rouge Nutritional Values: Main, Desserts, Lunch, Kids, Breakfast and Drinks menus (page generated 2026-10-06)",
        tabs=TABS, classify=classify, category_order=CATEGORY_ORDER, expected_rows=EXPECTED, note=NOTE, holdback=HOLDBACK))
