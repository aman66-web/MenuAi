#!/usr/bin/env python3
"""Build data/source/bella-italia/ from Bella Italia's official nutrition menus (hosted by Tenkites).

    python3 tools/uk_extract/bella_italia.py --checked-on 2026-10-06 [--report]

The page https://menus.tenkites.com/thebigtg/mobilemenus04 (the menu bellaitalia.co.uk embeds) gives every dish a
"Nutrition (per portion)" table. The other tabs are the same address with ?mguid=<tab id>. The parser is
tenkites_a.py; numbers are copied as printed. Only names, categories and the rules below are written by hand.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402

URL = "https://menus.tenkites.com/thebigtg/mobilemenus04"
TABS = {
    "Main Menu": "use",
    "Personalise Your Pasta": "the table prints each ingredient (pasta, sauce, topping, finish) on its own, not a finished dish",
    "Desserts": "use",
    "Drinks": "use",
    "Kids": "use",
}
EXPECTED = {"Main Menu": 157, "Desserts": 20, "Drinks": 106, "Kids": 107}

ADDONS = "Add-ons & extras"
CATEGORY_ORDER = ["Starters", "Pastas", "Pizzas", "Go Lighter", "House Specials", "Sides", ADDONS, "Desserts",
                  "Kids: Starters", "Kids: Smaller mains", "Kids: Larger mains", "Kids: Sides", "Kids: Add-ons & extras",
                  "Kids: Desserts", "Kids: Drinks", "Drinks: Cocktails", "Drinks: Mocktails", "Drinks: Gin & tonic",
                  "Drinks: Wine", "Drinks: Beers & ciders", "Drinks: Soft drinks", "Drinks: Hot drinks"]
SIZE = re.compile(r"^(\d+\s?(ml|cl)|small|large|regular|single|double|bottle|half|pint)( decaf)?$", re.I)
KIDS_CATEGORY = {"Starters": "Kids: Starters", "Smaller Mains": "Kids: Smaller mains", "Larger Mains": "Kids: Larger mains",
                 "Desserts": "Kids: Desserts", "Drinks": "Kids: Drinks", "Extra Drinks": "Kids: Drinks"}
DRINK_CATEGORY = {"Cocktails": "Drinks: Cocktails", "Mocktails": "Drinks: Mocktails", "Gin & Tonic": "Drinks: Gin & tonic",
                  "Sparkling": "Drinks: Wine", "White": "Drinks: Wine", "Red": "Drinks: Wine", "Rosé": "Drinks: Wine",
                  "Beers & Ciders": "Drinks: Beers & ciders", "Soft Drinks": "Drinks: Soft drinks", "Hot Drinks": "Drinks: Hot drinks"}
ALCOHOL = {"Drinks: Cocktails", "Drinks: Gin & tonic", "Drinks: Wine", "Drinks: Beers & ciders"}


def classify(rec: dict):
    menu, c1, byo, sec = rec["menu"], rec["course"], rec["byo"], rec["byo_section"]
    raw = rec["name"].strip()
    bullet = raw.startswith("-")
    nm = t.tidy_name(raw)
    nums = t.numbers(rec)
    if all(nums[k] in ("0", "0.0") for k in ("calories", "protein_g", "carbs_g", "fat_g")) and re.match(r"^\d Scoops? ", nm):
        return ("skip", "scoop counts: every nutrient is printed as 0 (a placeholder, not a food)")

    if menu == "Kids":
        cat = KIDS_CATEGORY[c1]
        size = c1.split()[0].lower() if c1 in ("Smaller Mains", "Larger Mains") else ""
        spec = {"category": cat, "rankable": False}
        name = nm
        if byo == "Create Your Own Gelato" and sec.startswith("Choose two toppings"):
            name, spec["category"] = f"{nm} (gelato topping)", "Kids: Add-ons & extras"
        elif byo == "Create Your Own Gelato":
            name = f"Gelato: {nm}"
        elif sec.startswith("Choose your sauce"):
            name = f"{byo}: {nm} (kids {size})"
        elif sec.startswith("Choose two toppings"):
            name, spec["category"] = f"{nm} (kids pizza topping, {size})", "Kids: Add-ons & extras"
        elif sec.startswith("Choose two sides"):
            name, spec["category"] = f"{nm} (kids side)", "Kids: Sides"
        elif cat == "Kids: Drinks":
            name = f"{nm} (kids)"
        elif size:
            name = f"{nm} (kids {size})"
        spec["name"] = name
        return spec

    if menu == "Drinks":
        cat = DRINK_CATEGORY[c1]
        spec = {"category": cat, "rankable": False, "alcohol": cat in ALCOHOL}
        if sec.lower().startswith("add"):
            spec.update(name=f"{nm} (add-on)")
        elif SIZE.match(nm):
            spec.update(name=f"{byo} ({nm})", serving=nm)
        elif bullet and byo:
            spec.update(name=f"{byo} ({nm})")
        elif byo == "Old Mout Cider":
            spec.update(name=f"{byo}: {nm}")
        return spec

    if menu == "Desserts":
        if c1 == "Gelato":
            return {"category": "Desserts", "rankable": False, "name": f"Gelato: {nm}"}
        return {"category": "Desserts", "rankable": False}

    # Main Menu
    if sec.startswith(("Served with", "Upgrade:")):
        return {"category": "Sides", "rankable": True}
    if bullet or sec.startswith("Add") or byo.startswith("Upgrade your pizza"):
        kind = "crust dip" if byo.startswith("Crust Dips") else "add-on"
        return {"category": ADDONS, "rankable": False, "name": f"{nm} ({kind})"}
    spec = {"category": c1, "rankable": True}
    if rec["course2"] == "Protein Enriched Pasta":
        spec["name"] = f"{nm} (Protein Enriched Pasta)"
    return spec


HOLDBACK = {
    "Green Olives": "The table prints 284 kcal; its own macros (2.0 g protein, 1.2 g carbs, 4.9 g fat) add up to about 57 kcal.",
}
NOTE = ("Per portion as printed on the chain's menu pages. Wines, many cocktails and some drinks print no numbers and are not "
        "listed; the build-your-own pasta is not listed because only its ingredients are given. Extras (toppings, dips, "
        "add-ons) and the sides served with a dish are separate rows: add them yourself.")

# The same pages print each dish's allergens ("Dietary Information": "Contains:" and "May contain:", naming the cereals
# and tree nuts) and carry the label ids of the page's own allergen filter; tenkites_a cross-checks the two.
ALLERGEN_TITLE = "Bella Italia Dietary Information (allergens) on its online Main, Desserts, Drinks and Kids menus (Ten Kites page generated 2026-10-06)"

if __name__ == "__main__":
    sys.exit(t.run(
        chain_id="bella-italia", name="Bella Italia", cuisine="Italian", aliases=["bella italia"], url=URL,
        source_title="Bella Italia Nutritional Information: Main, Desserts, Drinks and Kids menus (page generated 2026-10-06)",
        tabs=TABS, classify=classify, category_order=CATEGORY_ORDER, expected_rows=EXPECTED, note=NOTE, holdback=HOLDBACK,
        allergen_title=ALLERGEN_TITLE))
