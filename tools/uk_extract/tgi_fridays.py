#!/usr/bin/env python3
"""Build data/source/tgi-fridays/ (a CALORIES-ONLY chain with complete allergens) from TGI Fridays UK's own allergen guide.

    python3 tools/uk_extract/tgi_fridays.py --checked-on 2026-10-07 [--pages DIR] [--out DIR]

Source: https://viewthe.menu/2alz, TGI Fridays UK's allergen & intolerance guide (a 10kites page). The chain's own printed
kids menu (https://www.tgifridays.co.uk/sites/default/files/2026-09/kids%20menu_web.pdf, linked from
https://www.tgifridays.co.uk/menu) prints this URL as a QR code beside "ALLERGY & INTOLERANCE GUIDE". The page has two menus
(tabs, one page each): "TGI Fridays Main Menu" (?mguid=f822d7d7-...) and "Kids Menu" (?mguid=98ddf171-...). The pages show no
date (the file name they offer is stamped with the day they are generated), so the title says "accessed <date>, no date shown".
robots.txt on viewthe.menu disallows only /fonts/, /views/ and *.less. Pages are saved once into --pages (default: a temp
folder; delete it to refresh), one request per second, and read by tgi_fridays_pages.py.

Basis. The chain's FAQ (https://www.tgifridays.co.uk/faqs) says: "We provide the calorie content of our dishes. We do not
currently provide full nutritional content at present." and "all of our menus now have the calorie content included for each
dish". So the energy beside a dish is for the dish as served: calories only, protein, carbs and fat are blank (docs/DATA.md
"Calories-only chains"); every item is not rankable. Nothing else is printed (no kJ, salt, weights), so nothing else is copied.
The main food menu PDF and the drinks PDFs print no calories (the food PDF's own QR code, "scan to view calories", opens a
rewards-app download page), so the guide above is the only readable source. Drinks and cocktails are not in the guide.

Allergens. Each dish prints "Contains:" and "May contain:" lines (naming cereals and tree nuts in brackets) and carries the label
ids the page's own allergen filter reads; tenkites_b.allergens_from_rec checks the two agree for every dish, so allergens.csv
is complete for every published item.

Only the names, categories and the choices below are typed by hand. The script stops if a page gains or loses dishes, a section
or "choose your ..." block appears that is not mapped, two dishes get the same name, or a duplicate row differs.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
import tgi_fridays_pages as pages_reader  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "tgi-fridays"
BASE_URL = pages_reader.BASE_URL
PAGES = {  # label -> (url, dishes expected on the page)
    "main": (BASE_URL + "?mguid=f822d7d7-c64b-48d2-8bce-20ac752682ea", 96),
    "kids": (BASE_URL + "?mguid=98ddf171-736b-4d26-bbda-4814e5cf3efa", 44),
}
ALLERGEN_TITLE = "TGI Fridays allergen and intolerance guide with calories, Main Menu and Kids Menu (viewthe.menu/2alz, accessed {date}, no date shown)"
SOURCE_TITLE = ("TGI Fridays allergen and calorie guide: Main Menu and Kids Menu (viewthe.menu/2alz, accessed {date}, no date shown)")
NOTE = ("Calories only (per dish, from TGI Fridays' own allergen guide): protein, carbs and fat are not published. Drinks and cocktails "
        "are not in the guide, and it doesn't say whether grills include their two sides. Several different dishes print identical "
        "calories (all four steaks print 679): ask the restaurant if it matters.")

MAIN_SECTIONS = {
    "APPETIZERS": "Appetizers", "BURGERS & SANDWICHES": "Burgers & sandwiches", "PASTA": "Pasta", "CHICKEN": "Chicken",
    "FRIDAYS SIGNATURE WHISKEY-GLAZED GRILL": "Whiskey-glazed grill", "GRILL & STEAKS": "Grill & steaks", "FRESH-MEX": "Fresh-Mex",
    "BOWLS & SALADS": "Bowls & salads", "TOPPINGS FOR BOWLS & SALADS": "Toppings for bowls & salads", "SIDES": "Sides",
    "DESSERTS": "Desserts",
}
KIDS_SECTIONS = {
    "CHICKEN & DIPS": "Kids menu: chicken & dips", "BURGERS, DOGS & PASTA": "Kids menu: burgers, dogs & pasta",
    "WILD BUNCH FAVES": "Kids menu: wild bunch faves", "SIDES": "Kids menu: sides", "DESSERTS": "Kids menu: desserts",
}
# The options inside the kids tab's "choose your ..." blocks: the words added to their name so they can't be mistaken for the
# main menu's dishes of the same name.
KIDS_BYO = {"CHOOSE YOUR CHICKEN": "kids", "CHOOSE YOUR DIP": "kids", "CHOOSE FROM": "kids sundae",
            "CHOOSE YOUR SAUCE": "kids sundae", "CHOOSE UP TO 3 TOPPINGS": "kids sundae"}
SECTIONS = {"main": MAIN_SECTIONS, "kids": KIDS_SECTIONS}

# (menu, printed section, printed name) -> the name shown, where the printed name alone would clash or mislead.
NAME_OVERRIDES = {
    ("main", "APPETIZERS", "FRIDAYS™ SIGNATURE WHISKEY-GLAZED SESAME CHICKEN STRIPS"):
        "Fridays™ Signature Whiskey-Glazed Sesame Chicken Strips (appetizer)",
    ("main", "CHICKEN", "FRIDAYS™ SIGNATURE WHISKEY-GLAZED SESAME CHICKEN STRIPS"):
        "Fridays™ Signature Whiskey-Glazed Sesame Chicken Strips (main)",
    # printed twice in Appetizers with the same name apart from capitals: 549 kcal (all caps, "celery & blue cheese or ranch")
    # and 503 kcal (mixed case, "ranch or blue cheese dressing"); both are held back below
    ("main", "APPETIZERS", "Boneless Wings with BBQ Sauce"): "Boneless Wings with BBQ Sauce (second listing, 503 kcal)",
    # the page's own description is "For cheese nachos"
    ("main", "APPETIZERS", "ADD CAJUN SPICED CHICKEN FAJITA MIX"): "Add Cajun Spiced Chicken Fajita Mix (for cheese nachos)",
}
# The same dish printed under two sections with the same name, calories and allergens appears once: the SIDES one is kept.
KEEP_SECTION = "SIDES"

# Rows left out of the published menu (never corrected), keyed by the name shown; listed in the check report.
HOLDBACK = {
    "Cajun Shrimp & Chicken Pasta": "printed 4,542 kcal for one pasta dish: not credible for a single serving (the next-highest pasta in the guide is 1,120)",
    "Bruschetta Chicken Pasta": "printed 3,486 kcal for one pasta dish: not credible for a single serving (the next-highest pasta in the guide is 1,120)",
    "Vegan Bruschetta Pasta": "printed 11,435 kcal for one pasta dish: not credible for a single serving",
    "Fridays™ Signature Whiskey-Glazed Combo with Chicken & Ribs":
        "printed 779 kcal for a full rack of ribs plus chicken, but the same guide prints 1,484 for the half rack of ribs alone and 2,260 for the full rack",
    "Boneless Wings with BBQ Sauce": "the guide prints this name twice with different calories (549 and 503) and nothing says which is meant",
    "Boneless Wings with BBQ Sauce (second listing, 503 kcal)":
        "the guide prints this name twice with different calories (549 and 503) and nothing says which is meant",
    "Vegan BBQ Burger":
        "allergen row contradicts the dish name/ingredients: the guide marks only celery (may contain milk, mustard, sesame) for a burger, "
        "with no gluten or cereal, while every other burger in the guide marks gluten and its gluten-free burgers are labelled as such",
    "Add Cajun Spiced Chicken Fajita Mix (for cheese nachos)":
        "printed 972 kcal, exactly the Cheese Nachos' own 972: the guide doesn't say whether this is the add-on's own value or a dish total",
    "Dirt & Worm Pie (kids)": "guide prints 541 kcal; TGI Fridays' own kids menu PDF (September 2026) prints 270 kcal for its Dirt and Worm Pie",
    "Add Cheese (kids)": "guide prints 37 kcal; the kids menu PDF prints +113 kcal for Add Cheese (on Tomato Tubes and the Hot Dog)",
    "Oreo® Pieces (kids sundae)": "guide prints 72 kcal; the kids menu PDF prints 67 kcal for Oreo Pieces",
    "Mini Marshmallows (kids sundae)": "guide prints 32 kcal; the kids menu PDF prints 41 kcal for Mini Marshmallows",
    "Berries (kids sundae)": "guide prints 15 kcal; the kids menu PDF prints 41 kcal for Seasonal Berries (probably the same topping, names differ)",
}

NAMES_A_MEAT_DISH = re.compile(r"burger|\bribs?\b|hot ?dog|meatball|mince", re.I)
NAMES_OTHER_FOOD = re.compile(r"chicken|fish|salmon|prawn|shrimp|vegan|plant[- ]based|veg(?:etable|gie)?\b|bean|mushroom", re.I)
ACRONYMS = {"BBQ", "BLT", "TGI", "AF"}
SMALL_WORDS = {"and", "with", "for", "of", "the", "in", "on", "to", "or", "a"}


def tidy(name: str) -> str:
    """'CHEF'S VEGETABLES' -> "Chef's Vegetables"; names that already have lower-case letters are left as printed."""
    if name != name.upper():
        return name
    words = []
    for i, word in enumerate(name.split(" ")):
        parts = []
        for j, part in enumerate(word.split("-")):
            core = re.sub(r"[™®]", "", part)
            if core.strip("&") == "" or core.upper() in ACRONYMS:
                parts.append(part)
            elif i > 0 and j == 0 and part.lower() in SMALL_WORDS:
                parts.append(part.lower())
            else:
                lower = part.lower()
                parts.append(lower[:1].upper() + lower[1:])
        words.append("-".join(parts))
    return " ".join(words)


def display_name(menu: str, rec: dict) -> str:
    section = rec["course"][0] if rec["course"] else ""
    key = (menu, section, rec["name"])
    if key in NAME_OVERRIDES:
        return NAME_OVERRIDES[key]
    name = tidy(rec["name"])
    if menu == "kids":
        if rec["byo"]:
            if rec["byo"] not in KIDS_BYO:
                raise SystemExit(f"kids menu: unmapped 'choose your' block {rec['byo']!r}: add it to KIDS_BYO after checking the page")
            return f"{name[:-1]}, {KIDS_BYO[rec['byo']]})" if name.endswith(")") else f"{name} ({KIDS_BYO[rec['byo']]})"
        if "kids" not in name.lower():
            # "Beef Burger (Gluten Free)" -> "Beef Burger (Gluten Free, kids)": one pair of brackets
            return f"{name[:-1]}, kids)" if name.endswith(")") else f"{name} (kids)"
    return name


def item_id(name: str) -> str:
    """'Fridays™ Signature Burger' -> 'fridays-signature-burger' (the trade-mark signs are dropped, not spelled out)."""
    return slug(tk.fold(re.sub(r"[™®]", "", name)))


def allergen_key(a: dict) -> tuple:
    return tuple(tuple(sorted(a[k])) for k in ("contains", "may_contain", "cereals", "nuts"))


def read_dishes(paths: dict) -> tuple:
    """(rows, excluded, dropped_duplicates, total). A row is one published dish (name, section, calories, allergens, ...)."""
    rows, excluded, total = [], [], 0
    for menu, (_, expected) in PAGES.items():
        page = pages_reader.read_page(paths[menu])
        recs = page["records"]
        if len(recs) != expected:
            raise SystemExit(f"{menu}: the page holds {len(recs)} dishes but this script was written for {expected}: the menu changed, "
                             "re-check the mappings and update PAGES.")
        total += len(recs)
        for rec in recs:
            if not rec["course"] or rec["course"][0] not in SECTIONS[menu]:
                raise SystemExit(f"{menu}: dish {rec['name']!r} is in an unmapped section {rec['course']!r}: add it to the section table")
            name = display_name(menu, rec)
            if rec["kcal"] == "":
                excluded.append((menu, name, "no calories printed"))
                continue
            where = f"{menu} {rec['name']}"
            allergens = pages_reader.allergens_of(rec, page["labels"], where)
            vegetarian = bool({"Vegan", "Vegetarian"} & set(rec["suitable"]))
            text = rec["name"] + " " + rec["desc"]
            tags, conflict = tk.diet_tags(text, vegetarian)
            # a burger or ribs whose name and description never say which meat (the report lists them; no tag is given)
            unspecified = (not vegetarian and not tags and bool(NAMES_A_MEAT_DISH.search(rec["name"]))
                           and not NAMES_OTHER_FOOD.search(rec["name"] + " " + rec["desc"]))
            rows.append({"menu": menu, "section": rec["course"][0], "printed": rec["name"], "name": name,
                         "category": SECTIONS[menu][rec["course"][0]], "kcal": rec["kcal"], "allergens": allergens,
                         "tags": tags, "conflict": conflict, "unspecified": unspecified, "desc": rec["desc"],
                         "suitable": rec["suitable"]})
    # the same dish printed under two sections (same name, calories and allergens): keep the SIDES one
    groups: dict = {}
    for r in rows:
        groups.setdefault((r["menu"], tk.norm_name(r["name"]), r["kcal"], allergen_key(r["allergens"])), []).append(r)
    dropped, kept = [], []
    for r in rows:
        g = groups[(r["menu"], tk.norm_name(r["name"]), r["kcal"], allergen_key(r["allergens"]))]
        if len(g) == 1:
            kept.append(r)
            continue
        keepers = [x for x in g if x["section"] == KEEP_SECTION]
        if len(keepers) != 1:
            raise SystemExit(f"{r['name']!r} is printed {len(g)} times with the same calories and allergens, not exactly once under "
                             f"{KEEP_SECTION}: decide which to keep")
        if r is keepers[0]:
            kept.append(r)
        else:
            dropped.append(r)
    names = [r["name"] for r in kept]
    clashes = sorted({n for n in names if names.count(n) > 1})
    if clashes:
        raise SystemExit(f"two dishes have the same name: {clashes}: add NAME_OVERRIDES after checking the page")
    ids = [item_id(n) for n in names]
    if len(set(ids)) != len(ids):
        raise SystemExit("two dishes have the same id: add NAME_OVERRIDES")
    return kept, excluded, dropped, total


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "tgi-fridays-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    paths = pages_reader.fetch_pages({m: u for m, (u, _) in PAGES.items()}, args.pages)
    rows, excluded, dropped, total = read_dishes(paths)
    shown = {r["name"] for r in rows}
    missing = [n for n in HOLDBACK if n not in shown]
    if missing:
        raise SystemExit(f"HOLDBACK names no longer on the menu (the pages changed): {missing}")

    items, report = [], []
    for r in rows:
        notes = [f"printed '{r['printed']}' under {r['section']} ({r['menu']} menu)"]
        if r["conflict"]:
            notes.append(r["conflict"])
        if r["unspecified"]:
            report.append(f"meat type not stated: {r['name']}")
        items.append({"id": item_id(r["name"]), "name": r["name"], "category": r["category"], "serving": "",
                      "calories": r["kcal"], "tags": r["tags"], "limited_time": False, "rankable": False,
                      "notes": "; ".join(notes), "allergens": r["allergens"]})
    report += [f"no calories printed, not published: {n} ({m} menu)" for m, n, _ in excluded]
    report += [f"duplicate dropped (same name, calories and allergens under {d['section']}): {d['name']}" for d in dropped]
    report += tk.ALLERGEN_NOTES

    date = args.checked_on
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="TGI Fridays", cuisine="American", source_title=SOURCE_TITLE.format(date=date),
        source_url=BASE_URL, checked_on=date, aliases=["tgi fridays", "tgi friday's", "tgi friday", "fridays"], items=items,
        out=args.out, note=NOTE, holdback=[(item_id(n), why) for n, why in HOLDBACK.items()],
        allergen_guide={"title": ALLERGEN_TITLE.format(date=date), "url": BASE_URL, "checked_on": date, "may_contain_published": True},
        nutrition_level="calories")
    for menu, path in paths.items():
        print(f"{menu:5} saved page sha256 {sha256_file(path)}  ({pages_reader.read_page(path)['title']})")
    by_cat: dict = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    print("\n".join(report))
    print(f"wrote {len(items)} items to {folder} ({len(HOLDBACK)} held back): " + ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    print(f"{total} dishes on the pages; {len(excluded)} without calories; {len(dropped)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
