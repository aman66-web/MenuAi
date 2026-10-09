#!/usr/bin/env python3
"""Build data/source/brightside/ from Brightside's own allergen matrix on Ten Kites. A CALORIES-ONLY chain.

    python3 tools/uk_extract/brightside.py --pages DIR --checked-on 2026-10-09 [--fetch] [--out DIR]

Source: https://menus.tenkites.com/loungers/brightside, the "Allergen Matrix" that the footer of https://brightside.co.uk/ links. The page
has seven menus (FOOD, GLUTEN FREE, VEGAN, KIDS, ADDS & EXTRAS, DRINKS, KIDS PIZZA PARTY): the first at that URL, the others at
?mguid=<menu id> (the ids are listed in the page's own menu selector). The page shows no date, so the source title says "(accessed <date>,
no date shown)". --fetch downloads the seven pages and the chain's website menu (https://brightside.co.uk/menu/), one request per second;
without it DIR must hold brightside_standard.html, brightside_glutenfree.html, brightside_vegan.html, brightside_kids.html,
brightside_adds.html, brightside_drinks.html, brightside_kidspizza.html and brightside_webmenu.html. Reader: brightside_pages.py.
robots.txt of menus.tenkites.com disallows only /fonts/, /views/ and /*.less$; brightside.co.uk's says "User-agent: * Allow: /".

SITES (founder's bar, 10 Oct 2026: 3 or more UK sites): https://brightside.co.uk/locations/ (read 2026-10-09) lists four roadside restaurants in
Great Britain: Honiton (A303, EX14 9ND), Exeter (A38, EX6 7XS), Saltash (A38, PL12 5BL) and Ram Jam (A1, LE15 7QX).

WHAT IS PRINTED. Each dish prints its calories ("(618 kCal)", the same number in the row's data-calories) and nothing else numeric: no
protein, carbohydrate, fat, salt, sugar, fibre, kJ or weight anywhere, so protein_g, carbs_g, fat_g and every other nutrient column stay
blank (never 0) and the chain is calories-only (docs/DATA.md). A thousands comma is dropped ("1,008" -> 1008); nothing else is changed. Dishes
with no figure (the cocktails Aperol Spritz, Banana Colada and Berry Blush, Baileys Espresso Martini, Classic Bramble, Birra Moretti
"(Ram Jam Only)") are not listed.

ALLERGENS are complete. The dish row prints 14 columns (a red dot = contains, a black M = may contain) and a hover pop-up per marked column
("Contains Cereals with Gluten (Barley, Wheat)", "May contain Cereals with Gluten (Rye)"); the mobile list prints the same as two lines; and
the row carries the label ids the page's own allergen filter reads. brightside_pages.read_page() checks all four forms against each other
(including that each pop-up's id is the id of its column) and the run stops if they ever disagree. The Vegan and Vegetarian columns are
checked against the diet ids and the mobile list's "Suitable for" line. The page prints "May contain" (also for fried items cooked beside
other allergens: its own guide text), so may_contain_published is yes.

CHOICES (all logged in the report; none touches a number):
- The seven menus overlap. A repeat with the same name, calories, allergens and diet marks is dropped (the first menu in PRIORITY is kept: the
  Cheesy Garlic Dough Balls are printed under Pizza and under Sides, the Vegan Breakfast on FOOD and VEGAN, the dips on FOOD and ADDS).
  The same name with other numbers (the adult and the kids' Margherita Pizza, the two Cola Floats, the Add Herb Chicken for breakfast and
  for pizza) is kept under the name plus the category in brackets.
- Categories: FOOD's and the other menus' sections as printed (the GLUTEN FREE and VEGAN menus each become one category, the way the
  chain's GF / vegan dishes carry their own names), the KIDS menu keeps its four parts, ADDS & EXTRAS its four, the DRINKS menu its sections.
  The printed "Draugths" section is "Draught beer" (typo fixed). The "Old Drinks" section is not published: the chain's own heading says the
  drinks are old (two of its four drinks print calories) and the website menu no longer lists them.
- "(Ram Jam Only)": the Heineken 0.0% draught is sold at one of the four sites, so it is left out (single-site rule).
- Tags: vegetarian when the Vegetarian (or Vegan) column is marked. contains_pork / contains_beef only from the dish's name and the page's
  own description under it (bacon, sausage, ham, pepperoni, chorizo, pork belly; beef, brisket); black pudding and the unspecified
  "Chicken", "patty" lines carry none.

THE CHAIN'S WEBSITE MENU AS A SECOND SOURCE. https://brightside.co.uk/menu/ prints a calorie figure beside most of the same dishes and does not
always agree with the allergen matrix (e.g. Fish & Chips 1,405 kcal there, 1795 in the matrix; Mocha 276 / 199; Berry Waffle Whip 512 / 259).
Following the repo rule (conflicting sources are held back, never chosen between; Yo! Sushi's precedent: a gap over 5%), a dish whose two
printed figures differ by more than 5% (of the larger) is held back (holdback.csv), a dish whose figures differ by 5% or less is published
with the matrix figure and a note giving the website's, and a dish the website prints no figure for, or names differently with no clear
one-to-one match, is published with the matrix figure alone. Which website line belongs to which dish is the explicit table WEB_ALIAS
below (names only; the numbers are read from the saved website page).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import brightside_pages as bp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "brightside"
BASE = "https://menus.tenkites.com/loungers/brightside"
WEB_MENU_URL = "https://brightside.co.uk/menu/"
SOURCE_TITLE = "Brightside Allergen Matrix (nutrition and allergens) on Ten Kites: Food, Gluten Free, Vegan, Kids, Adds & Extras, Drinks and Kids Pizza Party (accessed {checked}, no date shown)"
ALLERGEN_TITLE = "Brightside allergen matrix on the Ten Kites menu page linked from brightside.co.uk (accessed {checked}, no date shown)"
SITES = "Honiton, Exeter, Saltash and Ram Jam"
NOTE = ("Brightside prints calories only, so protein, carbs and fat are not published. Four roadside restaurants (Honiton, Exeter, Saltash, "
        "Ram Jam, per brightside.co.uk). Dishes whose calories differ by over 5% from the chain's own website menu are left out. "
        "Cocktails show no calories and are not listed.")
# menu name -> (saved file name, dishes the page must print)
MENUS = {
    "FOOD": ("brightside_standard.html", 76),
    "GLUTEN FREE": ("brightside_glutenfree.html", 48),
    "VEGAN": ("brightside_vegan.html", 16),
    "KIDS": ("brightside_kids.html", 38),
    "ADDS & EXTRAS": ("brightside_adds.html", 59),
    "DRINKS": ("brightside_drinks.html", 119),
    "KIDS PIZZA PARTY": ("brightside_kidspizza.html", 23),
}
WEB_FILE, WEB_POSITIONS = "brightside_webmenu.html", 219
PRIORITY = ["FOOD", "KIDS", "ADDS & EXTRAS", "DRINKS", "VEGAN", "GLUTEN FREE", "KIDS PIZZA PARTY"]
GF_SECTIONS = {"Breakfast", "Toasties", "Burgers", "Mains", "Salads", "Sides", "Puddings & Cakes"}
VEGAN_SECTIONS = {"Breakfast", "Mains", "Sides", "Puddings & Cakes"}
CATEGORIES = {   # menu -> printed section -> category shown
    "FOOD": {"Breakfast & Brunch": "Breakfast & brunch", "Burgers": "Burgers", "Mains": "Mains", "Salads": "Salads",
             "Toasties": "Toasties", "Pizza": "Pizza", "Sides": "Sides", "Puddings & Cakes": "Puddings & cakes"},
    "GLUTEN FREE": {s: "Gluten free menu" for s in GF_SECTIONS},
    "VEGAN": {s: "Vegan menu" for s in VEGAN_SECTIONS},
    "KIDS": {"Healthy Snack Pot": "Kids snack pot", "Bright Sparks Classics": "Kids classics",
             "Build Your Own Dish": "Kids build your own", "Puddings": "Kids puddings"},
    "ADDS & EXTRAS": {"Breakfast & Burger": "Add-ons: breakfast & burger", "Toasties": "Add-ons: toasties",
                      "Pizza": "Add-ons: pizza", "Condiments": "Condiments"},
    "DRINKS": {"Coffees": "Coffees", "Teas": "Teas", "Homemade Drinks": "Homemade drinks", "Thick Shakes": "Thick shakes",
               "Kids Drinks": "Kids drinks", "Soft Drinks": "Soft drinks", "Cocktails": "Cocktails",
               "Alcohol-Free Cocktails": "Alcohol-free cocktails", "Draugths": "Draught beer", "Dashes": "Dashes",
               "Old Drinks": None},   # None = section not published (see CHOICES)
    "KIDS PIZZA PARTY": {"Kids Pizza": "Kids pizza party", "Kids Sundae": "Kids pizza party"},
}
SINGLE_SITE = re.compile(r"\(Ram Jam Only\)", re.I)
NAME_FIXES = {"Vegan Buttered Sourdough Toast with marmite": "Vegan Buttered Sourdough Toast with Marmite",
              "BiscoffTM Thick Shake": "Biscoff™ Thick Shake", "Kids BiscoffTM Extra Thick Milkshake": "Kids Biscoff™ Extra Thick Milkshake"}
# Rows held back for a reason of their own (never corrected). key = final item name.
MANUAL_HOLDBACK = {
    "Add Waffle": "Printed 1766 kcal for one waffle add-on, more than the whole Hot Honey Fried Chicken Waffle (833 kcal in the same matrix) "
                  "that contains a Belgian waffle: not a plausible figure for the item.",
    "Pizza Dips": "Printed as one 'Pizza Dips' dish of 582 kcal, which is exactly the sum of the four dips printed separately (178 + 264 + 45 + 95); "
                  "the chain sells one dip, so the row is not a serving.",
}
KIDS_WORD = re.compile(r"^Kids", re.I)
ADULT_CATEGORIES = {"Pizza", "Vegan menu", "Add-ons: pizza", "Add-ons: breakfast & burger"}   # the non-kids side of a name shared with a kids' dish

# WEB_ALIAS: (category or None, our item name) -> (website line name, website line price as printed, which figure on that line).
# The figure is an index into the line's printed numbers ("107/66kcal" -> 0, 1) or, for lines that list "Label 159kcal / ...", the label.
# Names only: the numbers are read from the saved website page. Items not listed here are matched to the website only when exactly one
# website line has the same name (after dropping "Add ", "-", "&"/"and") and that name appears with one printed figure.
WEB_ALIAS = {
    ("Sides", "Sweet Potato Fries"): ("Sweet Potato Fries", "4.50", 0),
    ("Sides", "French Fries"): ("French Fries", "3.50", 0),
    ("Sides", "Tenderstem Broccoli"): ("Tenderstem Broccoli", "3.95", 0),
    (None, "Berries & Maple Mascarpone Pancakes"): ("Berry and Maple Mascarpone Pancakes", "9.95", 0),
    ("Pizza", "Margherita Pizza"): ("Margherita", "10.95", 0),
    ("Pizza", "Pepperoni Pizza"): ("Pepperoni", "13.25", 0),
    ("Pizza", "The Meaty One Pizza"): ("The Meaty One", "14.25", 0),
    ("Kids classics", "Margherita Pizza"): ("Margherita Pizza", "6.95", 0),
    (None, "Chicken, Bacon & Avo Salad"): ("Chicken, Bacon & Avocado Salad", "14.45", 0),
    (None, "Roasted Garlic Mayo Dip"): ("Dips", "1.5", "roasted garlic mayo"),
    (None, "Chipotle Mayo Dip"): ("Dips", "1.5", "chipotle mayo"),
    (None, "Smoked Chilli Ketchup Dip"): ("Dips", "1.5", "smoked chilli ketchup"),
    (None, "Smoky BBQ Dip"): ("Dips", "1.5", "smoky bbq"),
    (None, "Berry Messy Sundae"): ("Berry Messy", "6.25", 0),
    (None, "Toasted Teacake"): ("Toasted Tea Cake", "2.95", 0),
    ("Add-ons: breakfast & burger", "Add Half an Avocado"): ("Avocado", "2.50", 0),
    (None, "Add Jolly Hog Sausage"): ("The Jolly Hog ‘Proper Porker’ sausage", "2.50", 0),
    (None, "Add Scrambled Eggs (2)"): ("Scrambled Egg", "2.50", 0),
    ("Add-ons: breakfast & burger", "Add Fried Egg"): ("Fried or Poached Egg", "1.50", 0),
    (None, "Add Poached Egg"): ("Fried or Poached Egg", "1.50", 1),
    (None, "Streaky Bacon"): ("Streaky Bacon", "2.50", 0),
    (None, "Add Hash Browns (3)"): ("Hash browns", "2", 0),
    (None, "Add 3oz Smashed Patty"): ("3oz smashed beef patty", "2.00", 0),
    (None, "Add Buttermilk Fried Chicken"): ("Buttermilk fried chicken", "2.50", 0),
    ("Add-ons: breakfast & burger", "Add Caramelised Onion"): ("Caramelised onions", "1.00", 0),
    ("Add-ons: pizza", "Add Pepperoni"): ("Pepperoni", "1.5", 0),
    ("Add-ons: breakfast & burger", "Add Jalapeños"): ("Jalapeños", "1.00", 0),
    ("Add-ons: pizza", "Add Rocket"): ("Rocket", "1", 0),
    ("Add-ons: pizza", "Add Sliced Mushrooms"): ("Flat mushroom", "1.25", 0),
    ("Kids build your own", "With Peas"): ("Peas", "", 0),
    ("Kids build your own", "With Baked Beans"): ("Baked Beans", "", 0),
    ("Kids build your own", "With French Fries"): ("French Fries", "", 0),
    ("Kids build your own", "With Sweet Potato Fries"): ("Sweet Potato Fries", "", 0),
    ("Kids build your own", "With Tenderstem Broccoli"): ("Tenderstem Broccoli", "", 0),
    (None, "Kids Chocolate Extra Thick Milkshake"): ("Chocolate", "2.7", 0),
    (None, "Kids Strawberry Extra Thick Milkshake"): ("Strawberry", "2.7", 0),
    (None, "Kids Banana Extra Thick Milkshake"): ("Banana", "2.7", 0),
    ("Kids puddings", "Soft Serve Ice Cream"): ("Soft-Serve Ice Cream", "2.95", 0),
    ("Kids puddings", "Chocolate Shavings Topping"): ("Toppings", "", 0),
    ("Kids puddings", "Chocolate Sauce"): ("Sauces", "", "chocolate"),
    ("Kids puddings", "Salted Caramel Sauce"): ("Sauces", "", "salted caramel"),
    ("Kids puddings", "Raspberry Sauce"): ("Sauces", "", "raspberry"),
    (None, "Iced Coffee - White"): ("Iced Coffee", "3.7", 0),
    (None, "Chocolate Thick Shake"): ("Chocolate", "5.25", 0),
    (None, "Banana Thick Shake"): ("Banana", "5.25", 0),
    (None, "Salted Caramel Thick Shake"): ("Salted Caramel", "5.25", 0),
    (None, "Strawberry Thick Shake"): ("Strawberry", "5.25", 0),
    (None, "Biscoff™ Thick Shake"): ("Biscoff™", "5.25", 0),
    (None, "Cola - Small"): ("Cola", "2.35 / 3.35", 0),
    (None, "Cola - Large"): ("Cola", "2.35 / 3.35", 1),
    (None, "Diet Cola - Small"): ("Diet Cola", "2.00/ 3.15", 0),
    (None, "Diet Cola - Large"): ("Diet Cola", "2.00/ 3.15", 1),
    (None, "Lemonade - Small"): ("Lemonade", "2.00 / 2.95", 0),
    (None, "Lemonade - Large"): ("Lemonade", "2.00 / 2.95", 1),
    (None, "Pure Orange Juice - Small"): ("Pure Orange Juice", "3.60 / 5.75", 0),
    (None, "Pure Orange Juice - Large"): ("Pure Orange Juice", "3.60 / 5.75", 1),
    # the website lists these juices at one price and one figure; the matrix has a Small and a Large: the website's single size is
    # the Large one by its figure (189 / 172 / 211 against 190 / 172 / 212), so only the Large rows are compared
    (None, "Apple Juice - Large"): ("Apple Juice", "3.25", 0),
    (None, "Cranberry Juice - Large"): ("Cranberry Juice", "3.25", 0),
    (None, "Pineapple Juice - Large"): ("Pineapple Juice", "3.25", 0),
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower().replace("&", "and").replace("™", ""))


def fetch_pages(dest: Path) -> None:
    first = dest / MENUS["FOOD"][0]
    bp.fetch(BASE, first)
    tabs = bp.menu_tabs(first.read_text(encoding="utf-8"))
    if [t[0] for t in tabs] != list(MENUS):
        raise SystemExit(f"The page's menu selector changed: {[t[0] for t in tabs]}, expected {list(MENUS)}")
    for name, mid in tabs[1:]:
        bp.fetch(f"{BASE}?mguid={mid}", dest / MENUS[name][0])
    bp.fetch(WEB_MENU_URL, dest / WEB_FILE)


def read_all(pages: Path) -> list[dict]:
    rows = []
    for menu, (fname, expected) in MENUS.items():
        text = (pages / fname).read_text(encoding="utf-8")
        title = tk.page_title(text)
        if title != menu:
            raise SystemExit(f"{fname} is the page {title!r}, expected {menu!r}")
        dishes = bp.read_page(text, f"{menu}")
        if len(dishes) != expected:
            raise SystemExit(f"{fname} prints {len(dishes)} dishes but this script expects {expected}: the menu changed, re-check the "
                             "category tables and the expected counts before running again.")
        for d in dishes:
            d["menu"] = menu
        rows += dishes
    return rows


def sig(e: dict) -> tuple:
    a = e["allergens"]
    return (e["name"], e["kcal"], tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])),
            tuple(sorted(a["nuts"])), e["vegetarian"], e["vegan"])


def web_figure(web: list[dict], category: str, name: str) -> tuple:
    """(website figure or None, website line label or '', how) for one of our items."""
    key = (category, name) if (category, name) in WEB_ALIAS else (None, name)
    if key in WEB_ALIAS:
        wname, wprice, which = WEB_ALIAS[key]
        lines = [w for w in web if w["name"] == wname and w["price"] == wprice]
        if not lines or len({(tuple(w["values"]), w["ing"]) for w in lines}) != 1:
            raise SystemExit(f"WEB_ALIAS {key}: {len(lines)} website lines named {wname!r} at {wprice!r}, expected one (or identical repeats)")
        w = lines[0]
        if isinstance(which, int):
            if which >= len(w["values"]):
                raise SystemExit(f"WEB_ALIAS {key}: the website line {wname!r} prints {w['values']}, no figure {which}")
            return w["values"][which], f"{wname} {wprice}", "alias"
        labelled = bp.web_labelled_values(w["ing"])
        if which not in labelled:
            raise SystemExit(f"WEB_ALIAS {key}: no {which!r} in {labelled}")
        return labelled[which], f"{wname}: {which}", "alias"
    n = norm(name)
    lines = [w for w in web if norm(w["name"]) == n and w["values"]]
    if lines and len({tuple(w["values"]) for w in lines}) == 1 and len(lines[0]["values"]) == 1:
        return lines[0]["values"][0], f"{lines[0]['name']} {lines[0]['price']}".strip(), "same name"
    return None, "", ""


def build(pages: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    rows = read_all(pages)
    web = bp.read_web_menu((pages / WEB_FILE).read_text(encoding="utf-8", errors="replace"))
    if len(web) != WEB_POSITIONS:
        raise SystemExit(f"The website menu has {len(web)} dish lines but this script expects {WEB_POSITIONS}: re-check WEB_ALIAS")
    entries = []
    for r in rows:
        where = f"{r['menu']} > {r['section']} > {r['name']}"
        cats = CATEGORIES[r["menu"]]
        if r["section"] not in cats:
            raise SystemExit(f"New section {r['section']!r} on the {r['menu']} menu: add it to CATEGORIES.")
        cat = cats[r["section"]]
        if cat is None:
            report.append(f"not published (section the chain calls 'Old Drinks'): {where} ({r['kcal']} kcal)")
            continue
        if SINGLE_SITE.search(r["name"]):
            report.append(f"left out (one site only): {where} ({r['kcal']} kcal)")
            continue
        if r["kcal"] is None:
            report.append(f"not listed (no calories printed): {where}")
            continue
        name = NAME_FIXES.get(r["name"], r["name"])
        entries.append({**r, "name": name, "printed": r["name"], "category": cat})

    # the same dish printed on several menus: keep the first in PRIORITY order when name, calories, allergens and diet marks all agree
    kept: dict = {}
    for e in sorted(entries, key=lambda e: PRIORITY.index(e["menu"])):
        k = sig(e)
        if k in kept:
            first = kept[k]
            report.append(f"dropped repeat: {e['menu']} > {e['section']} > {e['name']} ({e['kcal']} kcal) is the same dish, calories and "
                          f"allergens as {first['menu']} > {first['section']} > {first['name']}")
            continue
        kept[k] = e
    keep_ids = {id(e) for e in kept.values()}
    entries = [e for e in entries if id(e) in keep_ids]
    order = {id(e): i for i, e in enumerate(sorted(entries, key=lambda e: PRIORITY.index(e["menu"])))}
    entries.sort(key=lambda e: order[id(e)])

    # the same name left on different dishes: add the category (kids' dishes: "(kids)")
    by_name: dict = {}
    for e in entries:
        by_name.setdefault(slug(e["name"]), []).append(e)
    for group in by_name.values():
        if len(group) > 1:
            for e in group:
                e["ours"] = e["name"]
            kid = [bool(KIDS_WORD.match(e["category"])) for e in group]
            for e, is_kid in zip(group, kid):
                if is_kid and kid.count(True) == 1:
                    suffix = "kids"
                elif kid.count(True) == 1 and e["category"] in ADULT_CATEGORIES:
                    suffix = "adult"
                else:
                    suffix = re.sub(r"^add-ons: ", "", e["category"].lower())
                e["name"] = f"{e['name']} ({suffix})"
                report.append(f"same name on different dishes, renamed: {e['name']!r} ({e['kcal']} kcal)")
    names = [e["name"] for e in entries]
    if len({slug(n) for n in names}) != len(names):
        dup = sorted({n for n in names if [slug(x) for x in names].count(slug(n)) > 1})
        raise SystemExit(f"names (or their ids) still not unique: {dup}")

    items, holdback = [], []
    used_alias: set = set()
    for e in entries:
        base_name = e.get("ours", e["name"])
        tags = ["vegetarian"] if e["vegetarian"] else []
        notes = [f"Printed {e['printed']!r} under {e['menu']} > {e['section']}, '{e['kcal_text']}'"]
        meat, unspecified = tk.meat_tags(e["name"], e["desc"], vegetarian=e["vegetarian"])
        tags += meat
        if unspecified and not e["vegetarian"]:
            report.append(f"meat type not stated: {e['name']}")
        if e["name"].startswith("Add ") or e["category"].startswith("Add-ons"):
            notes.append("an add-on with its own figure, not a dish total")
        figure, label, how = web_figure(web, e["category"], base_name)
        if (e["category"], base_name) in WEB_ALIAS:
            used_alias.add((e["category"], base_name))
        elif (None, base_name) in WEB_ALIAS:
            used_alias.add((None, base_name))
        item_id = slug(e["name"])
        if figure is not None:
            kcal = int(e["kcal"])
            gap = abs(kcal - figure) / max(kcal, figure)
            if gap > 0.05:
                holdback.append((item_id, f"The allergen matrix prints {kcal} kcal but the chain's own website menu ({WEB_MENU_URL}, "
                                          f"'{label}') prints {figure} kcal: {gap:.0%} apart, so neither is published."))
                report.append(f"HELD BACK (website {figure} vs matrix {kcal}, {gap:.1%}): {e['name']}")
            elif figure != kcal:
                notes.append(f"the website menu prints {figure} kcal for '{label}' ({gap:.1%} apart); the matrix figure is entered")
                report.append(f"website differs slightly: {e['name']} matrix {kcal}, website {figure} ({gap:.1%})")
            else:
                notes.append(f"the website menu prints the same {figure} kcal")
        if e["name"] in MANUAL_HOLDBACK or base_name in MANUAL_HOLDBACK:
            holdback.append((item_id, MANUAL_HOLDBACK.get(e["name"]) or MANUAL_HOLDBACK[base_name]))
            report.append(f"HELD BACK (manual): {e['name']}")
        items.append({"id": item_id, "name": e["name"], "category": e["category"], "serving": "", "calories": e["kcal"],
                      "tags": "|".join(tags), "rankable": False, "notes": "; ".join(notes), "allergens": e["allergens"]})
    unused = sorted(k for k in WEB_ALIAS if k not in used_alias)
    if unused:
        raise SystemExit(f"WEB_ALIAS names dishes that are no longer on the pages: {unused}")
    missing = [n for n in MANUAL_HOLDBACK if not any(i["name"] == n for i in items)]
    if missing:
        raise SystemExit(f"MANUAL_HOLDBACK names dishes that are no longer on the pages: {missing}")
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or to receive, with --fetch) the saved pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were downloaded")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first (one request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.pages.mkdir(parents=True, exist_ok=True)
        fetch_pages(args.pages)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Brightside", cuisine="Roadside diner", source_title=SOURCE_TITLE.format(checked=args.checked_on),
        source_url=BASE, checked_on=args.checked_on, aliases=["brightside", "brightside roadside", "brightside roadside dining"],
        items=items, out=args.out, note=NOTE, holdback=holdback, nutrition_level="calories",
        allergen_guide={"title": ALLERGEN_TITLE.format(checked=args.checked_on), "url": BASE, "checked_on": args.checked_on,
                        "may_contain_published": True})
    for menu, (fname, _) in MENUS.items():
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print(f"{WEB_FILE} sha256 {tk.sha256_text_file(args.pages / WEB_FILE)}")
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
