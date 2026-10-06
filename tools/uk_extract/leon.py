#!/usr/bin/env python3
"""Build data/source/leon/ from LEON UK's official menu pages (leon.co/menu).

    # 1. save each page once (one request per second, normal browser user-agent) into a folder:
    #      for m in all-day breakfast bits-in-between coffee drinks kids; do curl -sSL -A 'Mozilla/5.0 ...' -o DIR/$m.html https://leon.co/menu/$m/; sleep 1; done
    # 2. build:
    python3 tools/uk_extract/leon.py DIR --checked-on 2026-10-06

Numbers are copied from the pages' own data as printed (kcal, protein, carbohydrate, fat, saturated fat, mono- and
poly-unsaturated fat, sugar, fibre, salt; every value is "per portion" and the site prints the portion weight in grams, used
here as the serving and as weight_g). The glycaemic index is not used (the pages print no kJ). How the pages are read, and
why only items a menu page really shows are used, is explained in leon_pages.py.

Allergens: NOT copied; the chain gets a link to its allergen guide only (ALLERGEN_GUIDE). LEON's allergen page
(https://leon.co/allergens/) says its "Foodie Fact Sheet" is the allergen guide (every ingredient with allergens in bold and
listed again in a separate column) and the menu pages carry only "a summary". On 2026-10-06 that online summary contradicted
the same pages' own ingredient lists (capitals mark allergens there): Levantine Squash Salad lists no allergens while its
ingredients print SOY beans and Yellow MUSTARD; LOVe Burger's list leaves out the SULPHITES its ingredients print; and
ingredients printing gluten-free OATS never list oats. The Foodie Fact Sheet itself ("Foodie Fact Sheet - September 2026
v1.pdf") is a Google Drive file whose download host disallows automated access in robots.txt, so it is not read here.

Only the grouping into categories, the tags rule and the notes are decided here. EXPECTED lists every item the six menu
pages show, by name. If LEON adds, removes or renames an item, or an item gains or loses its nutrition table, the lists
no longer match and this script stops, so a human re-checks before the next run.

Source: https://leon.co/menu/all-day/ (and the other five menu pages listed in leon_pages.PAGES). The pages show no issue
date or version; re-run when the menu changes.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import leon_pages  # noqa: E402
from common import ROOT, slug as base_slug, write_chain_folder  # noqa: E402

CHAIN_ID = "leon"
SOURCE_URL = "https://leon.co/menu/all-day/"
SOURCE_TITLE = "LEON UK menu, nutrition per portion (live pages on leon.co/menu; no issue date or version shown)"
# Link only (see the docstring): LEON's allergen page, which links its Foodie Fact Sheet.
ALLERGEN_GUIDE = {"title": "LEON allergen information and Foodie Fact Sheet (September 2026 v1)", "url": "https://leon.co/allergens/",
                  "may_contain_published": False}

# Every item the six menu pages show (page: submenu), in the pages' own order. The three listed in NO_NUTRITION are
# shown without a nutrition table, so they are not published.
EXPECTED: dict[str, list[str]] = {
    "all-day: LEON Boxes": ["Aji Verde Chicken", "Chantal's Romesco Chicken", "Poker Night Chilli", "Cheeky Gyros Box", "Satay Chicken", "Satay Chicken Big Box", "Aioli Chicken", "Aioli Chicken Big Box", "Brazilian Black Beans Small"],
    "all-day: Wraps": ["Chicken & Chorizo Club Wrap", "Chicken Aioli Wrap", "Grilled Halloumi Wrap", "Fish Finger Wrap", "Crunchy Korean Chicken Wrap"],
    "all-day: Superfood Salads": ["Levantine Squash Salad", "The Original Superfood Salad", "Chicken & Avocado Superfood Salad"],
    "all-day: Burgers": ["Aji Verde Crispy Chicken Burger", "Chargrilled Chicken Burger", "LOVe Burger"],
    "all-day: Sides": ["Aji Verde Chicken Mezze", "Charred Broccoli with Preserved Lemon", "Baked Fries", "GFC - Crispy Chicken Nuggets", "Cheddar & Black Pepper Mac Bites", "LEON Slaw"],
    "all-day: Sauces": ["Korean Mayo", "Vegan Garlic Aioli", "Chilli Sauce", "Tomato Ketchup"],
    "breakfast: Bigger Breakfasts": ["Halloumi, Egg & Avo Sando", "The Full Monty"],
    "breakfast: Breakfast Boxes": ["Salmon Smörgås-Box", "The Big Breakfast Box", "The Halloumi Breakfast Box"],
    "breakfast: Egg Pots": ["Green Shakshuka & Halloumi", "Shakshuka", "Saucy Beans Pot", "Full English Pot"],
    "breakfast: Muffins": ["Smoked Salmon & Cream Cheese Muffin", "Sausage Muffin", "Smashed Avocado & Halloumi Muffin", "Sausage & Egg Muffin", "Vegan Sausage Muffin", "Bacon & Egg Muffin", "Bacon Muffin"],
    "breakfast: Breakfast Sides": ["Hash Browns", "Sourdough Toast"],
    "breakfast: Porridge": ["Blueberry, Honey & Toasted Seeds Porridge", "Ruby Red Porridge", "Banana and Cinnamon Porridge"],
    "breakfast: Yoghurts": ["Very Berry Granola", "Banana & Turmeric Honey Granola"],
    "breakfast: Smoothies": ["Mango, Lime & Dragon Fruit Smoothie", "Clean Green Smoothie"],
    "breakfast: Kids' Breakfast": ["Banana and Chocolate Porridge", "Kids Egg and Beans Pot", "Kids' Egg Muffin"],
    "breakfast: Pastries": ["Pain au Chocolat", "Organic Butter Croissant"],
    "bits-in-between: Cakes": ["Triple Choc-a-lot Cookie", "Blueberry, Lemon & Poppy Seed Muffin", "LEON Chocolate Chip Cookie", "Blueberry & Yuzu Blondie", "Nutty Lime & Ginger Fabjack", "Choconutty Banana Bread", "Chocolate & Almond Butter Tiffin", "Better Brownie", "Lemon Ginger Crunch", "Oat & Cranberry Cookie"],
    "coffee: Coffee": ["Filter Coffee", "Teas and Infusions", "Mocha", "Hot Chocolate", "Flat White", "Cappuccino", "Latte", "Iced Latte", "Americano", "Iced Americano", "Black Velvet Iced Matcha Latte", "Vanilla Matcha Latte", "Vanilla Iced Matcha Latte", "Unsweetened Matcha Latte", "Unsweetened Iced Matcha Latte", "Passionfruit Lemon Iced Tea"],
    "drinks: Juices & Cans": ["Crisp Peach Cooler", "Raspberry & Pomegranate Cooler", "Karma Cola", "500ml Still Water", "Sparkling Water", "Gingerella Ginger-Ale", "Razza Raspberry Lemonade", "Lemony Lemonade"],
    "kids: Kids' All Day": ["GFC – Crispy Chicken Nuggets & Baked Fries", "Chargrilled Chicken Rice Box", "Brazilian Black Beans with Rice"],
}
NO_NUTRITION = {"Aji Verde Chicken Mezze", "Teas and Infusions", "Black Velvet Iced Matcha Latte"}
# The same item can be on two pages (smoothies, pastries and kids' breakfast items are): it is read once, from its first page.

# The site's submenu name -> our category, and the category order. Categories that are never suggested as an order.
SUBMENU_CATEGORY = {
    "LEON Boxes": "LEON Boxes", "Wraps": "Wraps", "Superfood Salads": "Superfood Salads", "Burgers": "Burgers",
    "Sides": "Sides", "Sauces": "Sauces",
    "Bigger Breakfasts": "Breakfast", "Breakfast Boxes": "Breakfast", "Egg Pots": "Breakfast", "Muffins": "Breakfast",
    "Breakfast Sides": "Breakfast sides", "Porridge": "Porridge & yoghurt", "Yoghurts": "Porridge & yoghurt",
    "Kids' Breakfast": "Kids", "Kids' All Day": "Kids",
    "Pastries": "Pastries & cakes", "Cakes": "Pastries & cakes",
    "Coffee": "Coffee", "Smoothies": "Drinks", "Juices & Cans": "Drinks",
}
CATEGORY_ORDER = ["LEON Boxes", "Wraps", "Superfood Salads", "Burgers", "Sides", "Sauces", "Breakfast", "Breakfast sides",
                  "Porridge & yoghurt", "Kids", "Pastries & cakes", "Coffee", "Drinks"]
NOT_RANKABLE = {"Sauces", "Breakfast sides", "Pastries & cakes", "Coffee", "Drinks"}

PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pork|salami|chorizo|prosciutto|gammon|pancetta|nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_UNSTATED = re.compile(r"\b(meatballs?|mince|minced|meat|hot dogs?|kebabs?|lamb|turkey)\b", re.I)

# Notes the script cannot work out by itself (it adds the energy, identical-row and zero-weight notes on its own).
HAND_NOTES = {
    "Chantal's Romesco Chicken": "Saturates and salt are printed as the same number (2.66); entered as printed",
    "Vegan Garlic Aioli": "No vegetarian mark on the page; vegetarian tag because the item's own name says Vegan",
    "Vegan Sausage Muffin": "Marked vegan by LEON, so no pork tag although the name says sausage (a plant-based patty)",
}
# Items whose printed numbers contradict themselves: kept in items.csv, listed in holdback.csv (never corrected).
HOLDBACK = {"love-burger": "The site prints 565 kcal; its own macros add up to about 403 kcal."}
NOTE = ("Per-portion values as shown on leon.co's menu pages, which carry no issue date. Milk drinks are the organic whole milk "
        "versions; other milks aren't shown on the menu pages. Three items the pages show without nutrition are left out.")

COLUMNS = {"calories": "kcal", "protein_g": "protein", "carbs_g": "carb", "fat_g": "fat", "sat_fat_g": "satFat",
           "salt_g": "salt", "sugar_g": "sugar", "fiber_g": "fibre"}


def make_id(name: str) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c))  # Smörgås -> Smorgas
    return base_slug(plain)


def num(text: str) -> float:
    return float(text)


def energy_note(n: dict) -> str:
    """Same test as the pipeline's energy warning (15%; for under 50 kcal, 25 kcal), so every warning is explained."""
    kcal, calc = num(n["kcal"]), 4 * num(n["protein"]) + 4 * num(n["carb"]) + 9 * num(n["fat"])
    gap = (kcal - calc) / kcal if kcal else 0
    if (kcal >= 50 and abs(kcal - calc) / kcal > 0.15) or (kcal < 50 and calc - kcal > 25):
        word = "above" if kcal > calc else "below"
        return f"Printed {n['kcal']} kcal is {abs(gap) * 100:.0f}% {word} the {calc:.0f} kcal that its printed protein, carbs and fat add up to; entered as printed"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", type=Path, help="folder holding all-day.html, breakfast.html, bits-in-between.html, coffee.html, drinks.html, kids.html")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were saved")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    try:
        items, facts = leon_pages.read_pages(args.pages)
    except (ValueError, KeyError, OSError) as err:
        print(f"Could not read the LEON menu pages in {args.pages}: {err!r}. The page layout or data shape probably changed: "
              "re-check leon_pages.py against a saved page before running again.", file=sys.stderr)
        return 1

    # Stop if the menu is not exactly the one this script was written for.
    expected = [n for names in EXPECTED.values() for n in names]
    got = [i["name"] for i in items]
    added, removed = sorted(set(got) - set(expected)), sorted(set(expected) - set(got))
    got_no_nut = {i["name"] for i in items if not i["nutrition"]}
    problems = []
    if added or removed:
        problems.append(f"items now on the menu pages but not in EXPECTED: {added}; in EXPECTED but no longer on the pages: {removed}")
    if got_no_nut != NO_NUTRITION:
        problems.append(f"items shown without nutrition changed: now {sorted(got_no_nut)}, expected {sorted(NO_NUTRITION)}")
    unknown = sorted({sub for i in items for _, sub in i["where"] if sub not in SUBMENU_CATEGORY})
    if unknown:
        problems.append(f"submenus with no category in SUBMENU_CATEGORY: {unknown}")
    if len(set(got)) != len(got):
        problems.append("two different menu items now share one name")
    if problems:
        print("The LEON menu pages no longer match this script. Re-check the names in EXPECTED / NO_NUTRITION against the pages "
              "(and the categories), then update them:\n  " + "\n  ".join(problems), file=sys.stderr)
        return 1

    rows = []
    for it in items:
        n = it["nutrition"]
        if n is None:
            continue
        category = SUBMENU_CATEGORY[it["where"][0][1]]
        text = f"{it['name']} {it['ingredients']}"
        vegetarian = bool(it["dietary"] & {"vegetarian", "vegan"}) or bool(re.search(r"\bvegan\b", it["name"], re.I))
        tags = []
        notes = []
        if vegetarian:
            tags.append("vegetarian")
        pork, beef = PORK.search(text), BEEF.search(text)
        if not vegetarian:
            if pork:
                tags.append("contains_pork")
            if beef:
                tags.append("contains_beef")
        if not vegetarian and not pork and not beef and MEAT_UNSTATED.search(text):
            notes.append(f"Meat type not stated ({MEAT_UNSTATED.search(text).group(0)})")
        if it["name"] in HAND_NOTES:
            notes.append(HAND_NOTES[it["name"]])
        e = energy_note(n)
        if e:
            notes.append(e)
        weight = n["totalPortionWeight"]
        if num(weight) == 0:
            notes.append("Portion weight is printed as 0, so no serving is shown")
        row = {
            "name": it["name"], "category": category, "serving": f"{weight} g" if num(weight) > 0 else "",
            "sodium_mg": "", "tags": "|".join(sorted(tags)), "limited_time": False, "rankable": category not in NOT_RANKABLE,
        }
        row.update({col: n[key] for col, key in COLUMNS.items()})
        for col, key in (("mono_fat_g", "mono"), ("poly_fat_g", "poly")):
            if key in n:
                if not leon_pages.NUMBER.match(n[key]):
                    raise SystemExit(f"{it['name']}: {key} is printed as {n[key]!r}, not a number: re-check the page.")
                row[col] = n[key]
        row["weight_g"] = weight if num(weight) > 0 else ""
        row["allergens"] = None  # link only, see the docstring
        row["id"] = make_id(it["name"])
        row["_notes"] = notes
        rows.append(row)

    # Rows whose printed numbers are identical to another row's (two names, one set of figures).
    groups = defaultdict(list)
    for r in rows:
        groups[tuple(r[c] for c in COLUMNS)].append(r)
    for key, same in groups.items():
        if len(same) > 1 and any(num(v) != 0 for v in key):  # rows of all zeros (water, black coffee) are expected to match
            for r in same:
                others = ", ".join(o["name"] for o in same if o is not r)
                r["_notes"].append(f"Same printed numbers as {others}")
    for r in rows:
        r["notes"] = "; ".join(r.pop("_notes"))
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids)), "duplicate ids"
    stale = [h for h in HOLDBACK if h not in ids]
    if stale:
        raise SystemExit(f"HOLDBACK names items that are not on the menu any more: {stale}")
    rows.sort(key=lambda r: CATEGORY_ORDER.index(r["category"]))  # stable: page order inside a category

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="LEON", cuisine="Wraps & bowls", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["leon", "leon naturally fast food", "leon restaurants"], items=rows,
        out=args.out, note=NOTE, holdback=list(HOLDBACK.items()), allergen_guide={**ALLERGEN_GUIDE, "checked_on": args.checked_on},
    )
    for page in leon_pages.PAGES:
        print(f"{page}.html sha256 {hashlib.sha256((args.pages / f'{page}.html').read_bytes()).hexdigest()}")
    meat_unstated = [r["name"] for r in rows if "Meat type not stated" in r["notes"]]
    print(f"wrote {len(rows)} items to {out}; {len(NO_NUTRITION)} shown without nutrition and not published; "
          f"{len(facts['unlisted'])} of {facts['documents']} menuItem documents in the site data are on no menu page and were not read; "
          f"meat type not stated: {meat_unstated or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
