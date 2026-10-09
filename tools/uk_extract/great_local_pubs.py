#!/usr/bin/env python3
"""Build data/source/great-local-pubs/ from Great Local Pubs' official allergen and nutritional data.

    python3 tools/uk_extract/great_local_pubs.py --checked-on 2026-10-09 [--pages DIR] [--out DIR]

Source: https://tkmenus.com/greattraditionalpubs (Stonegate's "Allergen & Nutritional Data" for Great Local Pubs, one page per
menu, chosen with ?mguid=<menu id>). Each Great Local Pubs pub page on greatlocalpubs.co.uk links it ("Please click here to read our
allergens and dietary information", menus.tenkites.com/greattraditionalpubs). It is the same Ten Kites platform as Slug & Lettuce
and Social Pub & Kitchen, so tenkites_b.py reads it. Pages are saved once into --pages (default: a temp folder; delete it to
refresh) at one request per second; numbers are copied exactly as printed. Only names, categories and the choice of menus are
typed here. The script stops if a page changes layout, a nutrient column or section appears that is not mapped, or the row count no
longer matches EXPECTED_ROWS.

Founder's rule (9 Oct 2026): only dishes with COMPLETE nutrition (calories, protein, carbs and fat) are published, so the
chain is a "full" chain and every row that lacks any of the four (most spirits, wines, soft drinks, some brunch drinks) is left out
and counted in the output. Nothing is estimated.

Pubs differ by menu. The page says "not all menu items displayed on this website are available at all of our sites", and Scottish
pubs have their own breakfast menu. So the rule is: a dish is published only if every place the page prints it agrees:
  * the Scottish breakfast menu is read for comparison only. A dish on both the breakfast menu and its Scottish twin must have
    identical figures and allergens (otherwise it is left out and listed); Scottish-only dishes are regional and are not published;
  * the same dish name printed on two menus with different figures is published once per menu, each named after its menu
    (tenkites_b.unique_names).

Some dishes are printed as a "core" plus choices: "6 Chicken Wings (Excluding Topping Option, see below)" with a list of toppings,
each with its own numbers. The core is published as the chain prints it (its name keeps the "Excluding" wording, and it is never
suggested as a meal on its own) and each choice is its own item under "Options & add-ons", so a person can add them up; nothing
is summed here.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "great-local-pubs"
BASE_URL = "https://tkmenus.com/greattraditionalpubs"

# label, menu id, short name, long name (order = which version of a clashing dish keeps the plain name)
MENUS = [
    ("main", "d74631b4-1986-435e-8991-f3608ba49ec8", "main menu", "main menu"),
    ("lunch", "841e4555-70be-4aed-9de7-5aedde0fd389", "lunch menu", "lunch menu"),
    ("vegan", "79ce82fd-9d46-4e71-8649-c65b942cd019", "veggie & vegan menu", "veggie & vegan menu"),
    ("nogluten", "1e464069-ef9c-4ce6-ad66-b02e907d009a", "no-gluten menu", "non gluten containing ingredients menu"),
    ("kids", "6d301d0b-428c-46fd-bb1c-3e0ee238885f", "kids' menu", "kids' menu"),
    ("breakfast", "a4ddf476-6aaa-4988-b95a-b7d771e0b9d8", "breakfast menu", "breakfast menu"),
    ("brunch", "dbba56de-232a-4408-b105-7459b030a486", "brunch menu", "brunch menu"),
    ("sunday", "f3662dc0-f345-4eed-af92-89c171f90437", "Sunday menu", "Sunday menu"),
    ("afternoontea", "1697dee9-1320-4ba2-8bf0-1f9cf2c59c45", "afternoon tea", "afternoon tea menu"),
    ("drinks", "6bb01b3f-8fce-49b8-b10b-ea15923ebed1", "drinks menu", "drinks menu"),
]
# The Scottish breakfast menu: read to compare with its regular twin, never published.
SCOTTISH = [("scottish_breakfast", "f130f47c-3c3a-41f7-87c0-0677b0bf8bc6")]
TWINS = {"breakfast": "scottish_breakfast"}
# Left out on purpose: the "Set for the Season", Christmas Day, Christmas kids', "Buffet and Be Merry" and Halloween drinks menus
# and the Drink Sumer (August) campaign (seasonal or past), Matchday Food & Drink (event menu), Buffet, Set Menu, Day Delegate and
# Hotels Breakfast menus (group or hotel catering), Sailors Arms Newquay Cornish Pasty Dishes and MIXR Bakewell Specials (one venue),
# the Travel and Carvery (2021) menus, and every People's Pubs / Proper Pubs menu dated 2023-2025 (superseded guides).

SECTIONS = {
    "Small Plates": "Small plates", "Loaded Chips": "Loaded", "Loaded Hash Browns": "Loaded", "Doritos® Loaded Nachos": "Loaded",
    "Loaded": "Loaded", "Chicken": "Chicken", "Sharers": "Sharers",
    "Classic Burgers": "Burgers", "Showstopper Burgers": "Burgers", "Showstoppers Burgers": "Burgers", "Burgers": "Burgers",
    "Burger Upgrades": "Burger add-ons", "Pub Faves": "Pub faves", "The Grill": "Grill", "Grill Upgrades": "Grill add-ons",
    "Seafood": "Seafood", "Sides": "Sides", "Side": "Sides", "Curry Corner": "Curry", "Curry": "Curry",
    "Curry Corner Upgrades": "Curry add-ons", "Curry Upgrades": "Curry add-ons", "Perfect Pizza": "Pizza", "Pizza Upgrades": "Pizza extras",
    "Sweet Treats": "Desserts", "Hot Drinks": "Drinks", "Lunch": "Lunch", "Loaded Jackets": "Lunch", "Toasties": "Lunch",
    "Wraps & Baguettes": "Lunch",
    "Proper Breakfast": "Breakfast", "Extras": "Breakfast extras", "Breakfast Sarnies": "Breakfast sandwiches",
    "Little Early Birds": "Kids: breakfast", "Morning Brews": "Drinks", "Breakfast Dishes": "Brunch",
    "The Big Roast": "Sunday roast", "Kids Mini Roast": "Kids: Sunday roast",
    "Sandwich & Wrap Selection": "Afternoon tea", "Scones": "Afternoon tea", "Sweet Treat": "Afternoon tea",
    # the drinks sections printed on the brunch menu
    "Cocktail & Fizz": "Drinks", "Pints": "Drinks", "Spirits": "Drinks", "Softs": "Drinks", "Alcohol Free": "Drinks",
}
KIDS_SECTIONS = {
    "The Faves": "Kids: mains", "Small Plates": "Kids: mains", "Pick & Mix - Step 1: Choose Your Main": "Kids: mains",
    "Pick & Mix - Step 2: Choose Your Side": "Kids: sides", "Pick & Mix - Step 3: Choose Your Veg": "Kids: sides",
    "Sweet Treats": "Kids: dessert",
}
# Not suggested as an order: parts of a dish, sauces and toppings, desserts, drinks, shared platters, children's portions.
UNRANKABLE = {"Burger add-ons", "Grill add-ons", "Curry add-ons", "Pizza extras", "Options & add-ons", "Drinks", "Desserts", "Sharers",
              "Breakfast extras", "Afternoon tea", "Kids: mains", "Kids: sides", "Kids: dessert", "Kids: breakfast", "Kids: Sunday roast"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
# Names are the final published names (after tenkites_b.unique_names).
_FRANKS = ("the page prints {k} kcal but {kj} kJ (about {kjk} kcal) and macros worth about {m} kcal: its own figures contradict each "
           "other. Restore by deleting this line once the chain corrects the page.")
_NOGLUTEN = ("Allergen row contradicts the dish name: {why}, but the guide marks no gluten{also}. Restore by deleting this line once the "
             "chain confirms the allergens.")
HOLDBACK: dict[str, str] = {
    # accuracy check 2026-10-09: the five Frank's Red Hot topping rows print a kcal figure that matches neither the kJ beside it nor the
    # macros (kJ / 4.184 and 4P+4C+9F agree with each other, not with the kcal); they are one series, so all five are held back
    "Frank's® Red Hot® Sauce & Chillies (with 6 Chicken Wings)": _FRANKS.format(k=16, kj=39, kjk=9, m=5),
    "Frank's® Red Hot® Sauce & chillies (VG)": _FRANKS.format(k=32, kj=78, kjk=19, m=8),
    "Frank's® Red Hot® Sauce & Chillies (with 10 Chicken Wings)": _FRANKS.format(k=32, kj=78, kjk=19, m=8),
    "Frank's® Red Hot® Sauce & Chillies (with 20 Chicken Wings)": _FRANKS.format(k=48, kj=117, kjk=28, m=13),
    "Frank's® Red Hot® Sauce & Chillies (with 30 Chicken Wings)": _FRANKS.format(k=64, kj=156, kjk=37, m=17),
    # breaded / baked-in-flour dishes whose allergen row marks no gluten (the dish is not on the chain's no-gluten menu)
    "Baked Fish Fingers": _NOGLUTEN.format(why="baked fish fingers are breaded and carry 17.3 g of carbohydrate", also=" (it marks only fish)"),
    "Pork, Orange & Fig Stuffing": _NOGLUTEN.format(why="a stuffing, with 11.4 g of carbohydrate", also=" and nothing else (no allergen at all)"),
    "Chocolate Brownie (VG)": _NOGLUTEN.format(why="a brownie with 17.8 g of carbohydrate", also=" (it marks no allergen as contained)"),
}
# Notes for rows the check report flags or that look odd: entered as printed, explained here
NOTES: dict[str, str] = {
    "Jack Daniel's Tennessee Honey": "A spirit: 60 kcal with no macros, which fits alcohol calories. Entered as printed.",
    "Vegetable Pakoras (VG)": "Calories (223, and 935 kJ agrees) are about 16% above what its macros allow (188). Entered as printed.",
}

# Each dish's info box prints "Contains:" / "Dish ingredients may also contain:" (naming the cereals and nuts) and the dish carries
# label ids; tenkites_b.allergens_from_rec checks they agree.
ALLERGEN_TITLE = ("Great Local Pubs allergen & nutritional data (tkmenus.com/greattraditionalpubs, April 2026 menus, "
                  "data correct as of 9 October 2026)")
ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # as printed on these pages

NOTE = ("Not every pub serves every menu or dish; Scottish pubs have their own breakfast dishes (not included). A dish with different "
        "figures on two menus appears once per menu, named after it. Values are per dish as served; dishes marked 'Excluding ...' leave "
        "out the part named (see Options & add-ons). Drinks that print no protein, carbs and fat are not listed.")
assert len(NOTE) < 400


def fix_records(recs: list[dict]) -> list[dict]:
    """The page marks a few 'choose your ...' dishes (the Sunday roasts with a seasonal veg choice) as options without a core block
    around them. Their data-search-name lists the dish first and then its choices (separated by ';*;'): the first row is the dish, the
    others are its choices. Nothing is changed except which row counts as the dish and which as its choices."""
    for r in recs:
        search = r["check"]["search"]
        if r["kind"] == "option" and not r["group"] and ";*;" in search:
            first = search.split(";*;")[0]
            if first.startswith(re.sub(r"\s+", "", r["name"]).lower()):
                r["kind"] = "item"
            else:
                core = next((x for x in recs if x["kind"] == "item" and x["check"]["search"] == search), None)
                if core is None:
                    raise SystemExit(f"choice {r['name']!r} has no dish before it: the page changed")
                r["group"] = core["name"]
    return recs


_read_menu = tk.read_menu


def read_menu_fixed(path):
    layout, recs = _read_menu(path)
    return layout, fix_records(recs)


tk.read_menu = read_menu_fixed  # tenkites_b.collect_rows reads the pages through this name

EXPECTED_ROWS = 749  # dish records on the ten published menus (main 198, lunch 23, vegan 66, no-gluten 36, kids 30, breakfast 36, brunch 63, Sunday 96, afternoon tea 6, drinks 195)


def is_option(rec: dict) -> bool:
    """A choice offered with a core dish (not a stand-alone dish that the page happens to mark as an option)."""
    return rec["kind"] == "option" and bool(rec["group"])


def base_of(group: str) -> str:
    return re.sub(r"\s*\((excluding|see below)[^)]*\)", "", group, flags=re.I).strip()


def category(label: str, rec: dict, name: str) -> str:
    top = rec["course"][0]
    if label == "kids":
        if top not in KIDS_SECTIONS:
            raise SystemExit(f"unmapped kids section {rec['course']!r}: add it to KIDS_SECTIONS after checking the page")
        return KIDS_SECTIONS[top]
    if label == "drinks":
        return "Drinks"
    if top not in SECTIONS:
        raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to SECTIONS after checking the page")
    if is_option(rec):
        return "Options & add-ons"
    return SECTIONS[top]


def veg_marked(rec: dict) -> bool:
    """The chain marks vegetarian and vegan dishes with (V) or (VG) in the name. '(V-M)' / '(VG-M)' are not explained on the
    page, so they are not treated as a vegetarian claim."""
    return bool(re.search(r"\((V|VG)\)", rec["name"]))


def twin_key(rec: dict) -> tuple:
    return (rec["course"][0], tk.norm_name(rec["name"]), tk.norm_name(rec["group"]))


def compare_scottish(paths: dict[str, Path], report: list[str]) -> dict[str, set]:
    """Compare each regular menu with its Scottish twin. Returns {regular label: keys whose figures or allergens differ}."""
    conflicts: dict[str, set] = {}
    for regular, scottish in TWINS.items():
        a = {twin_key(r): r for r in tk.read_menu(paths[regular])[1]}
        b = {twin_key(r): r for r in tk.read_menu(paths[scottish])[1]}
        conflicts[regular] = set()
        for k, ra in a.items():
            rb = b.get(k)
            if rb is None:
                report.append(f"on the {regular} menu only (not on its Scottish twin), published: {ra['name']}")
                continue
            aa = tk.allergens_from_rec(ra, f"{regular} {ra['name']}", ALLERGEN_WORDS)
            ab = tk.allergens_from_rec(rb, f"{scottish} {rb['name']}", ALLERGEN_WORDS)
            if ra["nutrients"] != rb["nutrients"] or tk._allergen_key(aa) != tk._allergen_key(ab):
                conflicts[regular].add(k)
                report.append(f"DIFFERS between {regular} and {scottish}, not published: {ra['name']}")
        for k, rb in b.items():
            if k not in a:
                report.append(f"Scotland only, not published ({scottish}): {rb['name']}")
    return conflicts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "great-local-pubs-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    guids = {m[0]: m[1] for m in MENUS}
    guids.update(dict(SCOTTISH))
    paths = tk.fetch_pages(BASE_URL, guids, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    # the kcal printed beside each dish's name must equal the kcal in its table (a built-in check on the reader)
    for label in list(guids):
        for rec in tk.read_menu(paths[label])[1]:
            head = re.sub(r"[^0-9]", "", rec["check"]["header_energy"])
            table = rec["nutrients"].get("Energy (kcal)", "-")
            if table not in ("-", "") and head != tk.number(table):
                raise SystemExit(f"{label}: {rec['name']!r} header says {rec['check']['header_energy']!r}, table says {table!r}")
    for label in guids:
        for rec in tk.read_menu(paths[label])[1]:
            if rec["kind"] == "option" and not rec["group"]:
                raise SystemExit(f"{label}: choice {rec['name']!r} has no dish: the page changed")

    scot_report: list[str] = []
    conflicts = compare_scottish(paths, scot_report)

    def skip(label: str, rec: dict):
        if twin_key(rec) in conflicts.get(label, ()):
            return "figures differ from the Scottish menu"
        return None

    rows, excluded, skipped, total = tk.collect_rows(
        labels, paths, "items", lambda label, rec: rec["name"], category, skip_fn=skip, veg_fn=veg_marked,
        where_fn=lambda label, rec: f"with {base_of(rec['group'])}" if is_option(rec) else rec["course"][-1],
        allergen_fn=lambda label, rec: tk.allergens_from_rec(rec, f"{label} {rec['name']}", ALLERGEN_WORDS))
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    for r in rows:
        r["prefer_where"] = r["category"] in ("Options & add-ons", "Burger add-ons", "Grill add-ons", "Curry add-ons", "Pizza extras")
    tk.unique_names(rows, rank, short, long)
    for r in rows:
        if r["name"] in NOTES:
            r["note"] = NOTES[r["name"]]
    items = tk.make_items(rows, long, UNRANKABLE)
    for it in items:
        if re.search(r"\(excluding ", it["name"], re.I):  # the chain prints the dish without a part named in its title
            it["rankable"] = False
            it["notes"] = ("Printed without the part named in its title (see Options & add-ons), so it is not suggested as a meal. "
                           + it["notes"])
    names = [i["name"] for i in items]
    missing = [n for n in list(HOLDBACK) + list(NOTES) if n not in names]
    if missing:
        print(f"HOLDBACK/NOTES names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Great Local Pubs", cuisine="Pub",
        source_title="Great Local Pubs allergen & nutritional data (tkmenus.com/greattraditionalpubs: Main Menu April 2026 and the April 2026 "
                     "lunch, veggie & vegan, no-gluten containing, kids', breakfast, brunch, Sunday, afternoon tea and drinks menus; data "
                     "correct as of 9 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["great local pubs", "great local pub", "great traditional pubs", "peoples pubs", "people's pubs"],
        items=items, out=args.out, holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note=NOTE,
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    for label in guids:
        print(f"{label:20} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat (left out), by menu:", by_menu)
    print("rows skipped:", [(s[0], s[1], s[2]) for s in skipped])
    print("\n".join(scot_report))
    print("\n".join(tk.ALLERGEN_NOTES))
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{len(skipped)} skipped; {total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
