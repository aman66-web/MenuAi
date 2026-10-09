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

Allergens (docs/DATA.md "Allergens", all or nothing for the published items): every menuItem on the six menu pages also carries
the site's own per-dish allergen list (`allergens`: a list of {slug, title} such as "milk", "gluten-wheat", "nuts-almonds",
"sulphur-dioxide"). leon.co/allergens/ calls it "a summary of the allergens present in our dishes on our menu boards and online" and
the menu pages filter dishes by it; the chain's full guide, the "Foodie Fact Sheet" (every ingredient with its allergens in bold), is
a Google Drive file whose robots.txt disallows automated access, so it is NOT read here (it is linked, and the chain page note says
the summary is what we copied). The summary is copied exactly as listed; the pages print no "may contain" list (may_contain_published =
no), and the chain says "We handle all allergens in our kitchen" (in the note, not per dish). Two safety rules, because the summary
is not the full guide:
  * a BLANK list (null) is not "none" (Levantine Squash Salad's blank sits beside ingredients that print SOY and MUSTARD), so an item
    with a blank allergen list has no row and is held back (NULL_REASON);
  * every item's own ingredient list prints its allergens (LEON capitalises most of them: "Miso Paste (Water, SOY beans ...", "Yellow
    MUSTARD"). Those capitalised words, plus cereals, tree nuts and the lesser allergens named in any case ("Gluten Free Rolled
    Oats", "barley malt extract"), are read as a second source (ingredient_gaps) and an item is held back when its ingredient list
    names an allergen (or a cereal / tree-nut kind) that its allergen list does not include (policy 3 in docs/ACCURACY_AUDIT.md).
    On 2026-10-08 that caught LOVe Burger (SULPHITES missing; already held back for its numbers), nine dishes made with gluten-free
    oats (their lists show no oats) and Karma Cola (gluten-free barley malt extract, no barley).
Held-back items stay in items.csv and holdback.csv; their allergen rows are not written.

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
from common import ROOT, allergen_words, slug as base_slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "leon"
SOURCE_URL = "https://leon.co/menu/all-day/"
SOURCE_TITLE = "LEON UK menu, nutrition per portion (live pages on leon.co/menu; no issue date or version shown)"
# The allergen summary lives on the menu pages; leon.co/allergens/ describes it and links the full "Foodie Fact Sheet" (see the docstring).
ALLERGEN_GUIDE = {"title": "LEON allergen summary on leon.co's menu pages (full guide: Foodie Fact Sheet, September 2026 v1)",
                  "url": "https://leon.co/allergens/", "may_contain_published": False}

# The site's allergen slugs -> the printed word common.allergen_words understands. An unknown slug stops the run.
SLUG_WORD = {
    "celery": "celery", "egg": "egg", "fish": "fish", "milk": "milk", "mustard": "mustard", "peanuts": "peanuts", "soya": "soya",
    "sulphur-dioxide": "sulphur dioxide", "gluten-wheat": "wheat", "gluten-rye": "rye", "gluten-barley": "barley",
    "gluten-oats": "oats", "nuts-almonds": "almonds", "nuts-cashew": "cashew", "nuts-hazelnut": "hazelnut",
    "nuts-pecans": "pecans", "nuts-walnut": "walnut",
}
# The capitalised allergen words an item's own ingredient list prints (LEON capitalises allergens there) -> the same printed words.
CAPS_WORD = {
    "MILK": "milk", "EGG": "egg", "EGGS": "egg", "WHEAT": "wheat", "RYE": "rye", "BARLEY": "barley", "OAT": "oats", "OATS": "oats",
    "SOYA": "soya", "SOY": "soya", "MUSTARD": "mustard", "CELERY": "celery", "FISH": "fish", "PEANUT": "peanuts", "PEANUTS": "peanuts",
    "ALMOND": "almonds", "ALMONDS": "almonds", "HAZELNUT": "hazelnut", "HAZELNUTS": "hazelnut", "WALNUT": "walnut", "WALNUTS": "walnut",
    "PECAN": "pecans", "PECANS": "pecans", "CASHEW": "cashew", "CASHEWS": "cashew", "NUTS": "nuts", "SULPHITES": "sulphites",
    "SESAME": "sesame", "LUPIN": "lupin", "CRUSTACEANS": "crustaceans", "MOLLUSCS": "molluscs",
}
# Words that name a cereal, a tree nut or one of the lesser allergens, read in ANY case from the ingredient list (LEON capitalises most
# allergens but not all: "Gluten Free Rolled Oats", "barley malt extract"). Milk, egg, soya and the generic gluten are NOT read in any case:
# "coconut milk", "vegan mayonnaise" and "gluten free flour" are not allergens.
ANY_CASE_WORD = {
    "wheat": "wheat", "rye": "rye", "barley": "barley", "oat": "oats", "oats": "oats", "spelt": "spelt", "kamut": "kamut",
    "almond": "almonds", "almonds": "almonds", "hazelnut": "hazelnut", "hazelnuts": "hazelnut", "walnut": "walnut", "walnuts": "walnut",
    "pecan": "pecans", "pecans": "pecans", "cashew": "cashew", "cashews": "cashew", "pistachio": "pistachio", "pistachios": "pistachio",
    "macadamia": "macadamia", "peanut": "peanuts", "peanuts": "peanuts", "sesame": "sesame", "tahini": "sesame", "celery": "celery",
    "celeriac": "celery", "mustard": "mustard", "fish": "fish", "anchovy": "fish", "anchovies": "fish", "prawn": "crustaceans",
    "prawns": "crustaceans", "shrimp": "crustaceans", "crab": "crustaceans", "lobster": "crustaceans", "mussels": "molluscs",
    "squid": "molluscs", "oyster": "molluscs", "oysters": "molluscs", "sulphite": "sulphites", "sulphites": "sulphites",
    "lupin": "lupin",
}
NULL_REASON = "allergen list is blank on the menu page (a blank is not 'none': Levantine Squash Salad's blank sits beside SOY and MUSTARD in its ingredients)"

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
NOTE = ("Per-portion values from leon.co's menu pages (no issue date); milk drinks are whole milk. Dishes shown without nutrition, or with "
        "a blank or incomplete allergen list, are left out. Allergens are LEON's own summary, not its full Foodie Fact Sheet: check that sheet "
        "if you have an allergy. All allergens are handled in its kitchens.")

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


def allergen_set(slugs: tuple, where: str) -> dict:
    """The site's allergen slugs for one dish -> {contains, may_contain, cereals, nuts} (sets), through common.allergen_words."""
    words = []
    for slug in slugs:
        if slug not in SLUG_WORD:
            raise SystemExit(f"{where}: unknown allergen slug {slug!r} on the menu page: add it to SLUG_WORD only after checking what it names")
        words.append(SLUG_WORD[slug])
    keys, cereals, nuts = allergen_words(words, where)
    return {"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts}


def ingredient_gaps(summary: dict, text: str, where: str) -> list[str]:
    """Capitalised allergen words in the dish's own ingredient list that its allergen list does not cover (key, cereal kind or nut kind)."""
    gaps = []
    tokens = [(t, CAPS_WORD.get(t)) for t in sorted(set(re.findall(r"\b[A-Z]{3,}\b", text)))]
    tokens += [(t.lower(), ANY_CASE_WORD.get(t.lower())) for t in sorted({m.lower() for m in re.findall(r"\b[A-Za-z]{3,}\b", text)})]
    for token, word in tokens:
        if word is None or token.lower() in gaps:
            continue
        keys, cereals, nuts = allergen_words([word], where)
        if not keys <= summary["contains"] or not cereals <= summary["cereals"] or not nuts <= summary["nuts"]:
            gaps.append(token.lower())
    return gaps


def build_allergens(published: list, source: dict, already_held: set) -> tuple[list, list, list]:
    """-> (rows for write_allergens, new holdbacks [(id, reason)], report lines). Stops when more than a third would be held back."""
    rows, held, report = [], [], []
    for r in published:
        if r["id"] in already_held:
            continue
        it = source[r["id"]]
        where = f"allergens of {it['name']!r}"
        if it["allergens"] is None:
            held.append((r["id"], NULL_REASON))
            continue
        summary = allergen_set(it["allergens"], where)
        gaps = ingredient_gaps(summary, it["ingredients"], where)
        if gaps:
            held.append((r["id"], "its own ingredient list names " + ", ".join(gaps) + " but its allergen list does not include it (policy 3)"))
            continue
        rows.append((r["id"], summary))
    live = [r for r in published if r["id"] not in already_held]
    if len(held) * 3 > len(live):
        raise SystemExit(f"{len(held)} of {len(live)} items would be held back for allergens (more than a third): leave allergens link-only and report")
    assert len(rows) + len(held) == len(live)
    report.append(f"allergens: {len(rows)} items carry the menu page's own list; {len(held)} of {len(live)} held back "
                  f"({sum(1 for _, why in held if why == NULL_REASON)} blank list, {sum(1 for _, why in held if why != NULL_REASON)} ingredient list "
                  f"prints an allergen the list lacks)")
    return rows, held, report


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
    source_by_id = {}
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
        row["allergens"] = None  # written after the loop by write_allergens, for the published items only (see build_allergens)
        row["id"] = make_id(it["name"])
        source_by_id[row["id"]] = it
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

    allergen_rows, allergen_held, allergen_report = build_allergens(rows, source_by_id, set(HOLDBACK))
    holdback = list(HOLDBACK.items()) + allergen_held
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="LEON", cuisine="Wraps & bowls", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["leon", "leon naturally fast food", "leon restaurants"], items=rows,
        out=args.out, note=NOTE, holdback=holdback, allergen_guide=None,
    )
    write_allergens(out, CHAIN_ID, allergen_rows, {**ALLERGEN_GUIDE, "checked_on": args.checked_on})
    for page in leon_pages.PAGES:
        print(f"{page}.html sha256 {hashlib.sha256((args.pages / f'{page}.html').read_bytes()).hexdigest()}")
    print("\n".join(allergen_report))
    meat_unstated = [r["name"] for r in rows if "Meat type not stated" in r["notes"]]
    print(f"wrote {len(rows)} items to {out}; {len(NO_NUTRITION)} shown without nutrition and not published; "
          f"{len(facts['unlisted'])} of {facts['documents']} menuItem documents in the site data are on no menu page and were not read; "
          f"meat type not stated: {meat_unstated or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
