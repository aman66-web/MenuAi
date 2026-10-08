#!/usr/bin/env python3
"""Build data/source/chiquito/ from Chiquito's official nutrition menus (hosted by Tenkites).

    python3 tools/uk_extract/chiquito.py --checked-on 2026-10-06 [--report]

https://menus.tenkites.com/thebigtg/chiquito02 is the menu chiquito.co.uk/menu embeds; every dish has a
"Nutrition (per portion)" table. The other tabs are the same address with ?mguid=<tab id>. Parser: tenkites_a.py.
Numbers are copied as printed; only names, categories and the rules below are written by hand.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402

# tenkites_a leaves its "current section" at "suitable" after the "Suitable for:" line, so the next `section-values` element
# on the page (the line "This dish contains none of the listed allergens", which has no section class of its own) replaced the
# dish's Suitable-for list and the vegetarian tag was lost for every dish without allergens (found by the independent check,
# 2026-10-08). Ignoring that line as a value fixes it here; tenkites_a is shared by other chains, so it is not edited.
_NONE_LINE = "This dish contains none of the listed allergens"
_captured = t._Parser._captured


def _captured_ignoring_none_line(self, key, text):
    if key == "sect_suitable" and text == _NONE_LINE:
        return
    _captured(self, key, text)


t._Parser._captured = _captured_ignoring_none_line

URL = "https://menus.tenkites.com/thebigtg/chiquito02"
TABS = {"Main Menu": "use", "Lunch": "use", "Dessert": "use", "Kids": "use", "Drinks": "use"}
EXPECTED = {"Main Menu": 112, "Lunch": 44, "Dessert": 14, "Kids": 42, "Drinks": 103}

ADDONS = "Add-ons & extras"
BYO = "Build your own"
CATEGORY_ORDER = ["Nibbles", "Starters", "Fajita Fiesta", BYO, "Classics", "Salads", "On the grill", "Burgers", "Lunch", "Sides",
                  "Dips & sauces", "Desserts", ADDONS,
                  "Kids: Mains", "Kids: Sides", "Kids: Desserts", "Kids: Drinks",
                  "Drinks: Hot drinks", "Drinks: Mocktails", "Drinks: Cocktails", "Drinks: Gin", "Drinks: Tequila",
                  "Drinks: Wine", "Drinks: Beer", "Drinks: Soft drinks"]
MAIN_CATEGORY = {"NIBBLES": "Nibbles", "STARTERS": "Starters", "FAJITA FIESTA": "Fajita Fiesta", "CLASSICS": "Classics",
                 "SALADS": "Salads", "ON THE GRILL": "On the grill", "BURGERS": "Burgers", "SIDES": "Sides"}
KIDS_CATEGORY = {"MAINS": "Kids: Mains", "SIDES": "Kids: Sides", "DESSERTS": "Kids: Desserts", "DRINKS": "Kids: Drinks"}
DRINK_CATEGORY = {"MOCKTAILS": "Drinks: Mocktails", "CLASSIC COCKTAILS": "Drinks: Cocktails",
                  "SHARING COCKTAILS": "Drinks: Cocktails", "MARGARITAS": "Drinks: Cocktails", "GIN": "Drinks: Gin",
                  "WINE": "Drinks: Wine", "TEQUILA": "Drinks: Tequila", "BEER": "Drinks: Beer", "SOFTS": "Drinks: Soft drinks",
                  "HOT DRINKS": "Drinks: Hot drinks"}
ALCOHOL = {"Drinks: Cocktails", "Drinks: Gin", "Drinks: Tequila", "Drinks: Wine", "Drinks: Beer"}
SAUCE = re.compile(r"sauce$", re.I)
_STATE = {"parent": ""}      # the last main row seen: tells ice-cream flavours from churro sauces under "Choose from:"


def label(text: str) -> str:
    return t.tidy_name(text).rstrip(":")


def _classify(rec: dict):
    menu, c1, c2, byo, sec = rec["menu"], rec["course"], rec["course2"], rec["byo"], rec["byo_section"]
    raw = rec["name"]
    nm = re.sub(r"(?i)\bskin[- ]on\b", "Skin On", t.tidy_name(raw))
    parent = _STATE["parent"]
    if not sec:
        _STATE["parent"] = nm
    byo_t = label(byo) if byo else ""

    if menu == "Drinks":
        cat = DRINK_CATEGORY[c1]
        spec = {"category": cat, "rankable": False, "alcohol": cat in ALCOHOL}
        if byo == "Bottled Soda" and nm == "Bottle":
            return ("skip", "three bottled soft drinks are each printed only as 'Bottle', with no product name")
        if sec == "Double espresso":
            spec.update(category="Drinks: Hot drinks", name="Extra espresso shot (add-on)")
        elif t.SIZE_LABEL.match(nm) and byo:
            spec.update(name=f"{byo} ({nm})", serving=nm)
        elif byo in ("Bottled Water", "J2O"):
            spec.update(name=f"{byo}: {nm}")
        return spec

    if menu == "Kids":
        cat = KIDS_CATEGORY[c1]
        spec = {"category": cat, "rankable": False}
        if c1 == "MAINS":
            spec["name"] = f"{byo_t}: {nm} (kids)" if byo else f"{nm} (kids)"
        elif c1 == "SIDES":
            spec["name"] = f"{nm} (kids side)"
        elif c1 == "DRINKS":
            spec["name"] = f"{nm} Juice (kids)" if byo == "FRUIT JUICES" else f"{nm} (kids)"
        elif byo == "Ice Cream":
            spec["name"] = nm if "sorbet" in nm.lower() else f"Ice Cream: {nm}"
        elif byo == "CHURROS" and sec:
            spec["name"] = f"{nm} (churro sauce)"
        return spec

    # Main Menu, Lunch, Dessert
    if sec in ("Add:", "Why not add:", "Add to your burger:") or sec.startswith("Add chicken"):
        if c1 == "FAJITA FIESTA":
            kind = "fajita add-on"
        elif sec == "Add to your burger:" or (menu == "Lunch" and c1 == "MAINS" and nm in ("Cheese", "Bacon")):
            kind = "burger add-on"
        elif sec.startswith("Add chicken"):
            kind = "salad topping"
        else:
            kind = "add-on"
        return {"category": ADDONS, "rankable": False, "name": f"{nm} ({kind})"}
    if sec.startswith(("Choose a side", "Swap your fries")):
        return {"category": "Sides", "rankable": True}
    if sec.startswith(("Pick your sauce", "Choose a sauce")) or (byo == "RIBS" and sec == "Choose from:"):
        kind = {"Pick your sauce:": "wing sauce", "Choose a sauce:": "grill sauce"}.get(sec, "ribs sauce")
        return {"category": "Dips & sauces", "rankable": False, "name": f"{nm} ({kind})"}
    if c1 == "BUILD YOUR OWN":
        if c2 == "Choose your tortilla":
            return {"category": BYO, "rankable": False, "name": f"Build Your Own: {nm}"}
        kind = "build your own spice" if c2 == "Choose your spice" else "build your own filling"
        return {"category": BYO, "rankable": False, "name": f"{nm} ({kind})"}
    if c1 == "DESSERTS" or menu == "Dessert":
        if sec == "Choose from:" and parent == "Churros":
            return {"category": ADDONS, "rankable": False, "name": f"{nm} (churro sauce)"}
        if sec == "Choose from:":
            return {"category": "Desserts", "rankable": False, "name": nm if "sorbet" in nm.lower() else f"Ice Cream: {nm}"}
        return {"category": "Desserts", "rankable": False}
    if byo == "TOPPED SALAD":
        return {"category": "Salads", "rankable": True, "name": f"Topped Salad ({nm})"} if not sec else \
            {"category": ADDONS, "rankable": False, "name": f"{nm} (salad topping)"}
    if byo == "LETTUCE TACOS":
        return {"category": "Starters", "rankable": True, "name": f"Lettuce Tacos: {nm}"}
    if byo == "QUESADILLA BIRRIA":
        return {"category": "Starters", "rankable": True, "name": f"Quesadilla Birria: {nm}"}
    if byo == "BURRITO":
        return {"category": "Lunch", "rankable": True, "name": f"Burrito: {nm}"}
    if byo == "CHILLI" and menu == "Lunch":
        return {"category": "Lunch", "rankable": True}
    if sec == "Choose from:" and c1 == "STARTERS":
        return {"category": "Starters", "rankable": True, "name": f"{parent}: {nm}"}
    if menu == "Lunch":
        if c1 == "SIDES":
            return {"category": "Sides", "rankable": not SAUCE.search(nm)}
        return {"category": "Lunch", "rankable": True}
    if nm == "Go Large" and c1 == "STARTERS":
        return {"category": "Starters", "rankable": True, "name": "Nachos (Go Large)"}
    spec = {"category": MAIN_CATEGORY[c1], "rankable": True}
    if byo == "RIBS" or c1 == "SIDES":
        pass
    if t.SHARING.search(nm):
        spec["rankable"] = False
    return spec


def classify(rec: dict):
    spec = _classify(rec)
    if isinstance(spec, dict):
        spec.setdefault("name", re.sub(r"(?i)\bskin[- ]on\b", "Skin On", t.tidy_name(rec["name"])))
    return spec


# The 1,152 kcal "Vegan Cheese" add-on that was held back here is no longer on the page (2026-10-06 refresh: both vegan
# cheese add-ons were removed), so that row is gone. Held back instead (2026-10-08): the four bottled waters, whose allergen
# row is a placeholder that lists everything the page's filter knows.
_ALL_14 = "The page prints all 14 allergens, every cereal and every tree nut as 'Contains' for a bottle of water: allergen row contradicts the dish name/ingredients."
HOLDBACK: dict = {
    "Bottled Water: Still": _ALL_14,
    "Bottled Water: Still Large": _ALL_14,
    "Bottled Water: Sparkling Regular": _ALL_14,
    "Bottled Water: Sparkling Large": _ALL_14,
}
NOTE = ("Per portion as printed on the chain's menu pages. Each part of a meal is listed on its own: sides, sauces, tortillas, "
        "toppings and build-your-own parts are separate rows, so add the parts you order. Wines, cocktails and most drinks "
        "print no numbers and are not listed.")

# The same pages print each dish's allergens ("Dietary Information": "Contains:" and "May contain:", naming the cereals
# and tree nuts) and carry the label ids of the page's own allergen filter; tenkites_a cross-checks the two.
ALLERGEN_TITLE = "Chiquito Dietary Information (allergens) on its online Main, Lunch, Dessert, Kids and Drinks menus (Ten Kites page generated 2026-10-06)"

if __name__ == "__main__":
    sys.exit(t.run(
        chain_id="chiquito", name="Chiquito", cuisine="Mexican", aliases=["chiquito"], url=URL,
        source_title="Chiquito Nutrition (per portion) menus: Main, Lunch, Dessert, Kids and Drinks (page generated 2026-10-06)",
        tabs=TABS, classify=classify, category_order=CATEGORY_ORDER, expected_rows=EXPECTED, note=NOTE, holdback=HOLDBACK,
        allergen_title=ALLERGEN_TITLE))
