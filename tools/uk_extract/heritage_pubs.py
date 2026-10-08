#!/usr/bin/env python3
"""Build data/source/heritage-pubs/ from Heritage Pubs' own "Allergen & Nutritional Data" menus (hosted by Ten Kites).

    python3 tools/uk_extract/heritage_pubs.py --checked-on 2026-10-08 [--pages DIR] [--out DIR]

Source: https://menus.tenkites.com/heritage, the page every Heritage pub's own menus page on heritagepubs.co.uk links to
("If you would like any allergy or other dietary information, please click here"). It holds the CURRENT (February 2026)
menus; the older https://menus.tenkites.com/heritage02 (January 2025 menus) is a superseded set and is NOT used (several of
its figures differ from the pubs' current menu). One page per menu, chosen with ?mguid=<menu id>; pages are saved once into
--pages (default: a temp folder; delete it to refresh) at one request per second and read by tenkites_b.py (the "items"
layout, the same one Slug & Lettuce uses). Numbers are copied exactly as printed (kcal, kJ, protein, carbs, sugars, fat,
saturates, salt); only names, categories and the choice of menus are typed here. The script stops if a page is renamed (a new
month), a nutrient column or section appears that is not mapped, or a row count no longer matches EXPECTED.

Some dishes are printed as a "core" plus choices: "Earth Burger (V) (Excluding Accompaniment Option)" with Skin-on Fries,
Chunky Chips... each with its own numbers. The core is published as the chain prints it (its name keeps the "Excluding"
wording, "see below" dropped) and each choice is its own item under "Options & add-ons", so a person can add them up;
nothing is summed here. Cores are not suggested as a meal (rankable=false) because they are printed without the choice.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
import tenkites_c as tc  # noqa: E402  (only for the "meat type not stated" test)
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "heritage-pubs"
BASE_URL = "https://menus.tenkites.com/heritage"

# label, menu id, page title (the run stops if it changes), short name, long name. The order is the order of preference when two
# different dishes share a name: the earliest menu keeps the plain name.
MENUS = [
    ("main", "314e4050-65b9-44ae-8f2d-671152835414", "Heritage Pubs Main Menu - February 2026", "main menu", "main menu"),
    ("lunch", "03e20a7f-4a4c-4548-8183-671a7f78e11c", "Heritage Pubs Lunch Menu - February 2026", "lunch menu", "lunch menu"),
    ("pie", "d8441ed3-1d94-4a7f-bdab-abcf99b15a18", "Heritage Pubs Pie Menu - February 2026", "pie menu", "pie menu"),
    ("pizza", "957c217b-4380-4072-a29c-bc12f20987e2", "Heritage Pubs Pizza Menu - February 2026", "pizza menu", "pizza menu"),
    ("breakfast", "d1e4301d-d077-4beb-92ba-79160096c6e6", "Heritage Pubs Breakfast Menu - February 2026", "breakfast menu", "breakfast menu"),
    ("scottish_breakfast", "c19cdf61-24b7-4143-a5ff-79a848963389", "Heritage Pubs Scottish Breakfast Menu - February 2026",
     "Scottish breakfast", "Scottish breakfast menu"),
    ("sunday", "99a14b1c-b5a0-4993-93e4-a1f9d4e4333f", "Heritage Pubs Sunday Menu - February 2026", "Sunday menu", "Sunday menu"),
    ("veg", "ae1ffe94-4a81-4615-bca7-6ea8493705fe", "Heritage Pubs Vegan & Vegetarian Menu - February 2026", "vegan & vegetarian menu",
     "vegan & vegetarian menu"),
    ("nogluten", "12afc7d3-a3a5-44f3-9338-099be8c546d5", "Heritage Pubs No Gluten-Containing Ingredients Menu - February 2026",
     "no-gluten menu", "no gluten-containing ingredients menu"),
    ("scottish_specials", "c9d4cdeb-c94b-4c5b-8fb2-bf1737a603b5", "Heritage Pubs Scottish Specials - February 2026",
     "Scottish specials", "Scottish specials menu"),
    ("kids", "6273e2c5-99e4-4150-a96a-8c2f93f77264", "Heritage Pubs Kids Menu - February 2026", "kids' menu", "kids' menu"),
    ("brunch", "5a5dc8cc-5007-448a-b4aa-baec6d8120e4", "Heritage Pubs Bottomless/Boozy Brunch - February 2026", "brunch menu",
     "bottomless/boozy brunch menu"),
    ("coffee", "612c1db6-e884-40e8-ac85-8de9734e67dc", "Heritage Coffee Shop Offer 2026", "coffee shop", "coffee shop offer"),
    ("drinks", "d961d58a-3bc7-45e5-a9c4-10da99604218", "Heritage Pubs Drinks Menu - February 2026", "drinks menu", "drinks menu"),
]
# dish records on each page (all rows, with or without the four required numbers); the run stops if a page now has another count
EXPECTED = {"main": 113, "lunch": 26, "pie": 4, "pizza": 9, "breakfast": 52, "scottish_breakfast": 55, "sunday": 208, "veg": 69,
            "nogluten": 27, "scottish_specials": 7, "kids": 30, "brunch": 46, "coffee": 23, "drinks": 151}
# Left out on purpose (all on the same page's menu list): festive set / kids' festive / festive buffet / Christmas Day / New Year's
# Eve / festive canapes and bowl food / festive afternoon tea (seasonal), The Spritz Edition (summer 2026 drinks), MIXR Bakewell
# Specials and The Metropolitan Pizza Menu (one pub each), Pubsmiths BBQ Menu (another pub brand), Matchday Food & Drink (event),
# Canapes & Bowl Food, Afternoon Tea, Set, Buffet, Lunch Buffet, Wake Buffets and Day Delegate menus (pre-booked group catering),
# the Bar Bites Menu (the same seven bar bites as the Main Menu; its wines print no nutrition), Travel Menu 2025 (travel venues),
# and every 2024 / 2025 menu (superseded by the February 2026 set).

# printed top-level section -> category shown, per menu ("*" = any menu)
SECTIONS = {
    "*": {
        "Bar Bites": "Bar bites", "Starters": "Starters", "Starters and Sharers": "Starters & sharers",
        "Sharers - Recommended for Two or More": "Sharers", "From The Grill": "From the grill", "Burgers": "Burgers",
        "Burger Extras": "Burger extras", "Classics": "Classics", "Pies": "Pies", "Sides": "Sides", "Desserts": "Desserts",
        "Mains": "Mains", "Sunday Roasts": "Sunday roasts", "Sunday Sharing Roast": "Sunday sharing roast",
        "Kids' Sunday Roasts": "Kids' Sunday roasts", "Pizzas": "Pizza", "Lunch - Ciabatta": "Lunch", "Lunch - Flatbread": "Lunch",
        "Lunch - Salad": "Lunch",
    },
    "breakfast": {"Mains": "Breakfast", "Kids' Breakfasts": "Kids' breakfasts", "Extras": "Breakfast extras", "Hot Drinks": "Hot drinks"},
    "scottish_breakfast": {"Mains": "Breakfast", "Kids' Breakfasts": "Kids' breakfasts", "Extras": "Breakfast extras",
                           "Hot Drinks": "Hot drinks"},
    "lunch": {"Flatbreads": "Lunch", "Sandwiches": "Lunch", "Classics": "Lunch", "Salads": "Lunch"},
    "scottish_specials": {"Starters": "Scottish specials", "Mains": "Scottish specials"},
    "kids": {"Starters": "Kids: starters", "Mains": "Kids: mains", "Choose a Special Main": "Kids: mains", "+ Side": "Kids: sides",
             "+ Veg": "Kids: veg", "Desserts": "Kids: desserts", "Innocent® Juicy Water": "Kids: drinks"},
    "brunch": {"Breakfast Dishes": "Breakfast", "Sandwiches": "Lunch", "Burgers": "Burgers", "Cocktails": "Drinks", "Spritz": "Drinks",
               "Fizz": "Drinks", "Pints": "Drinks"},
    "coffee": {"Tray Bakes": "Coffee shop", "Pastries": "Coffee shop", "Cakes": "Coffee shop", "Scones": "Coffee shop",
               "Cookies": "Coffee shop"},
}
OPTIONS = "Options & add-ons"
# not suggested as an order on their own: snacks, shared dishes, extras, desserts, drinks, children's portions, parts of a meal
UNRANKABLE = {"Bar bites", "Sharers", "Starters & sharers", "Burger extras", "Desserts", "Hot drinks", "Breakfast extras", OPTIONS,
              "Drinks", "Coffee shop", "Sunday sharing roast", "Kids' Sunday roasts", "Kids' breakfasts"}

# This chain marks vegetarian / vegan dishes (V) / (VG) in the dish name. (VG-M) is not explained anywhere on the pages, so it is
# not treated as a vegetarian claim.
THIS_BRAND = re.compile(r"THIS™?\s+isn['’]t\s+\w+(?:\s+(?:burgers?|sausages?|bacon|mash|meatballs?|mince))?", re.I)  # plant-based brand
EXTRA_PORK = re.compile(r"\b(pigs? in blankets?|hog roast|crackling)\b", re.I)

# Allergens: each dish's "Contains:" / "Dish ingredients may also contain:" lines (naming the cereals and nuts) and the dish's
# label ids agree (tenkites_b.allergens_from_rec checks every form the page prints and stops on a disagreement).
ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # as printed on these pages
ALLERGEN_TITLE = ("Heritage Pubs Allergen & Nutritional Data (menus.tenkites.com/heritage, February 2026 menus, data correct as of "
                  "8 October 2026)")
SOURCE_TITLE = ("Heritage Pubs Allergen & Nutritional Data (menus.tenkites.com/heritage: Main Menu February 2026 and the February 2026 "
                "lunch, pie, pizza, breakfast, Scottish breakfast, Sunday, vegan & vegetarian, no gluten-containing ingredients, "
                "Scottish specials, kids' and bottomless/boozy brunch menus, the drinks menu and Heritage Coffee Shop Offer 2026; "
                "data correct as of 8 October 2026)")
NOTE = ("Values are per dish as served, with the standard garnishes and accompaniments on the menu. Dishes printed 'Excluding ...' "
        "leave out the side or choice named, which is listed under Options & add-ons. Menus are February 2026; not every dish is "
        "sold at every pub.")

# Notes for rows the check report flags or that look odd: entered as printed, explained here (matched by published name)
NOTES = {
    "Millionaires Shortbread (V)": "Printed kJ (1,435) is about 6% above the 322 kcal (1,347 kJ); the macros give about 342 kcal. Entered as printed.",
}


# Dishes whose own allergen row contradicts the dish (independent accuracy check, 8 October 2026): the chain's page marks no gluten
# for a breaded fish finger, a brownie, a cookie and a stuffing, and gives no ingredient text or gluten-free wording that would
# explain it (the crumbles, by contrast, are on the chain's own "No Gluten-Containing Ingredients" menu, so they stay). Not
# corrected, not guessed: held back, so a coeliac visitor is never shown "no gluten" for them.
ALLERGEN_HOLDBACK = {
    "baked-fish-fingers": "the chain's allergen row for Baked Fish Fingers marks only Fish (no gluten) and gives no ingredients or gluten-free wording",
    "chocolate-brownie-vg": "the chain's allergen row for Chocolate Brownie (VG) marks no allergen it contains (not even gluten) and gives no ingredients or gluten-free wording",
    "salted-caramel-chocolate-brownie-vg": "the chain's allergen row for Salted Caramel Chocolate Brownie (VG) marks no allergen it contains (not even gluten) and gives no ingredients or gluten-free wording",
    "chocolate-chunk-cookie-v": "the chain's allergen row for Chocolate Chunk Cookie (V) marks only Soya (no gluten) and gives no ingredients or gluten-free wording",
    "pork-orange-and-fig-stuffing": "the chain's allergen row for Pork, Orange & Fig Stuffing marks no allergen at all (no gluten) and gives no ingredients or gluten-free wording",
}


def clean_name(raw: str) -> str:
    """The page's name, tidied: ', see below' dropped from '(Excluding ..., see below)' and 'Excluding' capitalised."""
    n = " ".join(raw.split())
    n = re.sub(r",?\s*see below\)", ")", n, flags=re.I)
    n = re.sub(r"\(excluding\b", "(Excluding", n, flags=re.I)
    return n


def category(label: str, rec: dict, name: str) -> str:
    if rec["kind"] == "option":
        return OPTIONS
    if label == "drinks":
        return "Drinks"
    top = rec["course"][0] if rec["course"] else ""
    table = SECTIONS.get(label) or SECTIONS["*"]
    if top not in table:
        table = SECTIONS["*"]
    if top not in table:
        raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to SECTIONS after checking the page")
    return table[top]


def veg_marked(rec: dict) -> bool:
    return bool(re.search(r"\((V|VG)\)", rec["name"]))


def tag_text(rec: dict) -> str:
    """The dish's own name and description, as the pork / beef tests read them: the 'THIS Isn't ...' brand is plant-based,
    and a gammon steak is pork (not beef)."""
    s = THIS_BRAND.sub(" ", rec["name"] + " " + rec["desc"])
    return re.sub(r"gammon steak", "gammon", s, flags=re.I)


def serving_of(name: str) -> tuple:
    """('Coca-Cola Zero Sugar', '330ml') from 'Coca-Cola Zero Sugar - 330ml'; (name, '') when the name carries no size."""
    m = re.match(r"^(.*?)(?:\s+-)?\s+(\d+\s?ml)$", name)
    return (m.group(1).strip(), m.group(2).replace(" ", "")) if m else (name, "")


def kj_contradicts(vals: dict) -> str:
    """Why the printed kJ and kcal of one dish cannot both be right ('' when they agree within 12% of kcal x 4.184)."""
    try:
        kcal, kj = float(vals["calories"]), float(vals["energy_kj"])
    except (KeyError, ValueError):
        return ""
    expected = kcal * 4.184
    if kcal >= 10 and abs(kj - expected) / expected > 0.12:
        return f"{vals['energy_kj']} kJ with {vals['calories']} kcal (about {expected:.0f} kJ would go with it)"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "heritage-pubs-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    paths = tk.fetch_pages(BASE_URL, {m[0]: m[1] for m in MENUS}, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[3] for m in MENUS}
    long = {m[0]: m[4] for m in MENUS}

    # the pages must be the menus this script was written for
    for label, _, title, _, _ in MENUS:
        got = tk.page_title(paths[label])
        if got != title:
            print(f"{label}: the page is now titled {got!r} but this script was written for {title!r}: a new menu was published; "
                  "re-check MENUS and the mappings against the pages.", file=sys.stderr)
            return 1
        layout, recs = tk.read_menu(paths[label])
        if layout != "items" or len(recs) != EXPECTED[label]:
            print(f"{label}: found {len(recs)} dishes in the {layout!r} layout but this script expects {EXPECTED[label]} in 'items': "
                  "the menu changed, re-check the mappings and update EXPECTED.", file=sys.stderr)
            return 1
        # the kcal printed beside each dish's name must equal the kcal in its table (a built-in check on the reader)
        for rec in recs:
            head = re.sub(r"[^0-9]", "", rec["check"]["header_energy"])
            table = rec["nutrients"].get("Energy (kcal)", "-")
            if table not in ("-", "") and head != tk.number(table):
                raise SystemExit(f"{label}: {rec['name']!r} header says {rec['check']['header_energy']!r}, table says {table!r}")

    def allergens(label: str, rec: dict):
        return tk.allergens_from_rec(rec, f"{label} {rec['name']}", ALLERGEN_WORDS)

    # A choice offered with a core dish that is also a dish of its own (the same chips as a side) is listed once, as the dish;
    # the same goes for burger extras that are also sides.
    standalone, sides, core_ok = set(), set(), set()
    for label in labels:
        for rec in tk.read_menu(paths[label])[1]:
            vals = tk.printed_values(rec)
            if rec["kind"] == "core" and tk.has_required(vals):
                core_ok.add((label, rec["name"]))
            if rec["kind"] != "item" or not tk.has_required(vals):
                continue
            key = (tk.norm_name(clean_name(rec["name"])), tuple(vals.get(k, "") for k in tk.KEY_COLS), tk._allergen_key(allergens(label, rec)))
            standalone.add(key)
            if rec["course"] and rec["course"][0] == "Sides":
                sides.add(key)

    def skip(label: str, rec: dict):
        vals = tk.printed_values(rec)
        if not tk.has_required(vals):
            return None
        key = (tk.norm_name(clean_name(rec["name"])), tuple(vals.get(k, "") for k in tk.KEY_COLS), tk._allergen_key(allergens(label, rec)))
        if rec["kind"] == "option" and (label, rec["group"]) not in core_ok:
            return "choice offered with a dish whose own nutrition is incomplete (not published)"
        if rec["kind"] == "option" and key in standalone:
            return "choice that is also listed as a dish of its own"
        if rec["kind"] == "item" and rec["course"][:1] == ["Burger Extras"] and key in sides:
            return "burger extra that is also listed under Sides"
        return None

    def where(label: str, rec: dict) -> str:
        """What to call the place a dish sits in when two dishes need telling apart."""
        if rec["kind"] == "option":
            return "with " + re.sub(r"\s*\(excluding[^)]*\)", "", clean_name(rec["group"]), flags=re.I).strip()
        return rec["course"][-1] if rec["course"] else ""

    rows, excluded, skipped, total = tk.collect_rows(
        labels, paths, "items", lambda label, rec: clean_name(rec["name"]), category, skip_fn=skip, veg_fn=veg_marked,
        text_fn=tag_text, where_fn=where, allergen_fn=allergens)
    expected_total = sum(EXPECTED.values())
    if total != expected_total:
        print(f"The pages hold {total} dishes but this script was written for {expected_total}.", file=sys.stderr)
        return 1
    for r in rows:
        r["prefer_where"] = r["category"] == OPTIONS
        r["serving"] = ""
        if r["category"] == "Drinks" or r["category"] == "Kids: drinks":
            r["name"], r["serving"] = serving_of(r["name"])
    tk.unique_names(rows, rank, short, long)
    for r in rows:
        if r["name"] in NOTES:
            r["note"] = NOTES[r["name"]]
    items = tk.make_items(rows, long, UNRANKABLE)
    for it in items:
        if it["category"].startswith("Kids"):   # children's portions and the parts of a "pick your main + side + veg" meal
            it["rankable"] = False

    holdback, pork_extra, unspecified = [], 0, []
    for it, r in zip(items, rows):
        if re.search(r"\(excluding\b", it["name"], re.I):
            it["rankable"] = False
            it["notes"] = "Printed without the side or choice named in its title; add that item. " + it["notes"]
        if EXTRA_PORK.search(r["text"]) and "contains_pork" not in it["tags"] and not it["tags"].startswith("vegetarian"):
            it["tags"] = "|".join(x for x in (it["tags"], "contains_pork") if x)
            pork_extra += 1
        if not it["tags"] and tc.MEAT_UNSPECIFIED.search(it["name"]) and not tc.OTHER_SPECIES.search(it["name"]):
            unspecified.append(it["name"])
        why = kj_contradicts(it)
        if why:
            holdback.append((it["id"], f"the chain's own page prints {why}: the row contradicts itself, so it is not published"))
        try:
            if float(it["sugar_g"]) > float(it["carbs_g"]):
                holdback.append((it["id"], f"the chain's own page prints sugars ({it['sugar_g']} g) above carbohydrate ({it['carbs_g']} g), "
                                           "which cannot be right, so it is not published"))
        except ValueError:
            pass
    by_id = {i["id"] for i in items}
    gone = [i for i in ALLERGEN_HOLDBACK if i not in by_id]
    if gone:
        print(f"ALLERGEN_HOLDBACK names no longer on the menu (the pages changed): {gone}", file=sys.stderr)
        return 1
    holdback.extend((i, why + ": the row contradicts the dish, so it is not published") for i, why in ALLERGEN_HOLDBACK.items())
    names = {i["name"] for i in items}
    missing = [n for n in NOTES if n not in names]
    if missing:
        print(f"NOTES names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    for it in items:
        it["notes"] = it["notes"].strip()
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Heritage Pubs", cuisine="Pub", source_title=SOURCE_TITLE, source_url=BASE_URL,
        checked_on=args.checked_on, aliases=["heritage pubs", "heritage pub", "heritage"], items=items, out=args.out, note=NOTE,
        holdback=holdback,
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    for label in labels:
        print(f"{label:19} sha256 {sha256_file(paths[label])}  {tk.page_title(paths[label])}")
    by_menu: dict = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    skips: dict = {}
    for _, _, why in skipped:
        skips[why] = skips.get(why, 0) + 1
    print("rows without calories/protein/carbs/fat, by menu:", by_menu)
    print("rows listed once instead of twice:", skips)
    print("\n".join(tk.ALLERGEN_NOTES))
    for _id, why in holdback:
        print(f"HELD BACK {_id}: {why}")
    print("meat type not stated:", len(unspecified), unspecified)
    print(f"extra pork tags from 'pigs in blankets / hog roast / crackling': {pork_extra}")
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
