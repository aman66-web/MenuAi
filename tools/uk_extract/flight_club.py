#!/usr/bin/env python3
"""Build data/source/flight-club/ from Flight Club's own online menu with nutrition and allergens (a Ten Kites page).

    python3 tools/uk_extract/flight_club.py --checked-on 2026-10-08 [--pages DIR] [--out DIR] [--report]

Source: https://menus.tenkites.com/redengine/flightclub, the "allergen tool" that flightclubdarts.com/uk/faqs links to. One menu
per tab (the same address with ?mguid=<menu id>, listed in the page's tab bar). Pages are saved once into --pages (default: a
temp folder; delete it to refresh) at one request per second by tenkites_a.fetch_menus and read by flight_club_pages.py.

Every dish has a "Nutrition values per serving" block that a visitor opens with the arrow beside the dish (and the page's
"View nutrition information" tab shows the same numbers in the dish row): Energy kCal, Protein, Carb, of which Sugars, Fat,
Sat Fat, Salt. The same page prints each dish's allergens in three ways (14 yes/may/no columns, the dietary box's
"Contains:" / "May contain:" lines naming cereals and tree nuts, and the label ids the page's allergen filter reads); the
reader stops unless all of them agree (tenkites_b.allergens_from_rec). Numbers are copied exactly as printed ("-" = not
published = blank for the optional columns; a dish with "-" in kcal, protein, carbs or fat is not published). Only names,
categories and the rules below are written by hand. The script stops if the tab bar changes, a tab's dish count changes,
or a section / drink group appears that is not mapped.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import flight_club_pages as fp  # noqa: E402
import tenkites_a as ta  # noqa: E402
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "flight-club"
URL = "https://menus.tenkites.com/redengine/flightclub"

# tab name on the page -> (label, long name, dish rows the script was written for, or a reason the tab is left out)
TABS = {
    "Bar Snacks": ("bar", "Bar Snacks menu", 9, None),
    "Sharing Plates": ("sharing", "Sharing Plates menu", 25, None),
    "Sides": ("sides", "Sides menu", 10, None),
    "Sharing Pizza Paddles": ("paddles", "Sharing Pizza Paddles menu", 18, None),
    "Sweet Treats": ("sweet", "Sweet Treats menu", 5, None),
    "Breakfast menu": ("breakfast", "Breakfast menu", 24, None),
    "Packages": ("packages", "Packages", 6,
                 "group packages (bundles of other dishes for a party; no serving per person): 4 of the 6 print no numbers and the other two print the same numbers"),
    "Flight Club Drinks - Full Menu": ("drinks", "Drinks menu", 375, None),
}
RANK = {v[0]: i for i, v in enumerate(TABS.values())}
SHORT = {v[0]: v[1] for v in TABS.values()}
LONG = SHORT

# (tab label, printed section) -> category shown in the app
CATEGORY = {
    ("bar", "Bar Snacks"): "Bar snacks",
    ("sharing", "Tacos"): "Tacos", ("sharing", "Wings"): "Wings", ("sharing", "Sliders"): "Sliders",
    ("sharing", "Sticks"): "Sticks", ("sharing", "Platters"): "Sharing platter",
    ("sides", "Sides"): "Sides", ("sides", "Fries"): "Fries",
    ("paddles", "Sharing Pizza Paddles"): "Sharing pizza paddles",
    ("paddles", "Gluten-Free Pizza Paddles"): "Gluten-free pizza paddles",
    ("paddles", "Pizza Dips"): "Pizza dips",
    ("sweet", "Desserts"): "Desserts",
    ("breakfast", "Breakfast"): "Breakfast", ("breakfast", "Breakfast Extra's"): "Breakfast extras",
    ("breakfast", "Scottish Breakfast"): "Scottish breakfast",
    ("breakfast", "Scottish Breakfast Extra's"): "Scottish breakfast extras",
    ("drinks", "Draught Beer & Cider"): "Drinks: Draught beer & cider",
    ("drinks", "Soft & Hot Drinks"): "Drinks: Soft & hot drinks",
}
CATEGORY_ORDER = ["Bar snacks", "Tacos", "Wings", "Sliders", "Sticks", "Sharing platter", "Sides", "Fries",
                  "Sharing pizza paddles", "Gluten-free pizza paddles", "Pizza dips", "Desserts",
                  "Breakfast", "Breakfast extras", "Scottish breakfast", "Scottish breakfast extras",
                  "Drinks: Draught beer & cider", "Drinks: Soft & hot drinks"]
# Whole meals. Everything else is a bar snack, a plate meant for sharing (the chain's own tab names say "Sharing"; no serving
# size or number of people is printed), a side, a dip, a dessert, an extra or a drink, so "Best for you" never suggests it.
RANKABLE = {"Breakfast", "Scottish breakfast"}
UNRANKABLE = set(CATEGORY_ORDER) - RANKABLE
DRINK_SERVINGS = {"Glass", "Bottle", "Pot"}   # first word of the printed description, e.g. "Glass, 4.5%", "Pot, with or without milk"

# The page's own spelling of a sulphites label that common._A does not list.
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None)}

# Rows the page prints impossibly: left out of the published menu (never corrected), listed in the check report.
HOLDBACK: dict[str, str] = {}

ALLERGEN_TITLE = ("Flight Club allergy and dietary information on its online menu (menus.tenkites.com/redengine/flightclub: Bar Snacks, "
                  "Sharing Plates, Sides, Sharing Pizza Paddles, Sweet Treats, Breakfast and Drinks tabs; live page, no date shown)")
NOTE = ("Per serving as printed on Flight Club's online menu; only dishes printing calories, protein, carbs and fat are listed "
        "(most drinks, some breakfasts print none). Its page prints 0.0 g salt for over half the dishes, even sausage roll, so salt is not shown. "
        "Sharing dishes have no stated serving size. Flight Club warns that not all ingredients are listed and "
        "allergens can't be ruled out.")
assert len(NOTE) <= 400, len(NOTE)   # the pipeline's limit (tools/build_menus.py)

# Oddities in what the page prints, kept in the notes column only (never corrected, never exported)
ITEM_NOTES = {
    "Honey-glazed chorizo": "the page prints 0.0 g saturates with 39.1 g fat",
    "Full Scottish Breakfast": "the page prints 0.0 g salt; the Full Scottish Roll (same bacon, sausage and black pudding) prints 0.8 g",
    "Sausage roll": "the page lists as 'Contains' eggs, milk, mustard, soya, sulphites, peanuts, wheat and all eight tree nuts",
    "Bang bang cauliflower": "the page marks it Vegetarian but its own sub-recipe list includes 'Chorizo Stick'",
}

_MEAT_NAMED = re.compile(r"\b(frankfurters?|black pudding|hot dogs?|burgers?|sausages?|meat|mince|meatballs?|ribs?)\b", re.I)
_ANIMAL = re.compile(r"\b(chicken|lamb|turkey|duck|fish|cod|haddock|salmon|tuna|prawns?|shrimp|crab|squid|calamari|mussels?|"
                     r"anchov(y|ies)|halloumi|vegetable|mushroom|egg|eggs)\b", re.I)


PLANT_BASED = re.compile(r"plant[- ]based pork", re.I)


def tag_text(rec: dict) -> str:
    """Name, description and the chain's own sub-recipe names, used only for the pork / beef tags. "Plant based pork" (the
    Vegan Breakfast Roll, which the page marks Vegan and Vegetarian) is the chain's own words for a meat substitute, so it
    is not read as pork."""
    return PLANT_BASED.sub("", " ".join([rec["name"], rec["desc"], rec["ingredients"]]))


def category(label: str, rec: dict, name: str) -> str:
    key = (label, rec["course"][-1] if rec["course"] else "")
    if key not in CATEGORY:
        raise SystemExit(f"unmapped section {key!r} for {rec['name']!r}: add it to CATEGORY after checking the page")
    return CATEGORY[key]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "flight-club-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--report", action="store_true", help="print every unpublished, skipped and duplicate dish")
    args = ap.parse_args()

    cache = ta.fetch_menus(URL, args.pages)   # one request per tab, one per second, files already saved are reused
    names = [n for n, _ in cache]
    if names != list(TABS):
        print(f"The tab bar changed: page has {names}, this script expects {list(TABS)}. Decide for each tab whether it is used.",
              file=sys.stderr)
        return 1
    paths = {TABS[n][0]: p for n, p in cache}

    # read every tab once (the drinks page is 19 MB) and check the dish counts
    pages: dict[str, list[dict]] = {}
    for n, p in cache:
        label, _, expected, _ = TABS[n]
        title, recs = fp.read_page(p)
        if title != n:
            print(f"page {p.name} is titled {title!r}, expected {n!r}", file=sys.stderr)
            return 1
        if len(recs) != expected:
            print(f"Tab {n!r} has {len(recs)} dishes but this script expects {expected}: the menu changed, re-check the rules.",
                  file=sys.stderr)
            return 1
        pages[label] = recs
    tk.read_menu = lambda path: ("table", pages[next(l for l, q in paths.items() if q == Path(path))])

    used = [v[0] for v in TABS.values() if v[3] is None]
    where = lambda label, rec: rec["course"][-1] if rec["course"] else ""  # noqa: E731
    rows, excluded, skipped, total = tk.collect_rows(
        used, paths, "table", lambda label, rec: rec["name"], category,
        text_fn=tag_text,
        where_fn=where,
        allergen_fn=lambda label, rec: tk.allergens_from_rec(rec, f"{SHORT[label]} > {rec['name']}", ALLERGEN_EXTRA))

    # a dish printed on two tabs with the same numbers and allergens is one item; the dessert doughnuts sit under Desserts
    for r in rows:
        if "Sweet Treats menu" in r["menus"]:
            r["category"] = "Desserts"
    # drinks: what the page's description gives as the serving; notes for the reader of the data
    recs_by_name = {}
    for label in used:
        for rec in pages[label]:
            recs_by_name.setdefault((label, rec["name"]), rec)
    for r in rows:
        if "Drinks menu" in r["menus"]:
            rec = recs_by_name[("drinks", r["name"])]
            first = rec["desc"].split(",")[0].strip()
            if first not in DRINK_SERVINGS:
                raise SystemExit(f"drink {r['name']!r} has description {rec['desc']!r}: add its serving to DRINK_SERVINGS")
            r["serving"] = first
            r["note"] = f"page description: {rec['desc']!r}"
            if r["name"] == "Inch's Cider":
                r["note"] += "; energy includes alcohol (kcal is higher than protein, carbs and fat explain)"
    rows.sort(key=lambda r: CATEGORY_ORDER.index(r["category"]))
    lowered = [r["name"].lower() for r in rows]
    clashes = sorted({n for n in lowered if lowered.count(n) > 1})
    if clashes:   # the printed names are used as they are ("Margarita" and "GF Margarita" differ); two different dishes with one name need a rule
        raise SystemExit(f"two different dishes share a printed name: {clashes}")
    items = tk.make_items(rows, LONG, UNRANKABLE)
    # the page prints 0.0 g salt for over half the dishes (even sausage roll): known-unreliable figures are not published
    # (the column shows "not published"); every other figure is copied as printed
    for it in items:
        it["salt_g"] = ""
    for it in items:
        if it["category"] not in CATEGORY_ORDER:
            raise SystemExit(f"category {it['category']!r} missing from CATEGORY_ORDER")
        extra = ITEM_NOTES.get(it["name"], "")
        if it["name"].endswith(" A26"):
            extra = "the page prints the name with the suffix 'A26' (not explained on the page)"
        if extra:
            it["notes"] = "; ".join(x for x in (it["notes"], extra) if x)
    ids = {i["name"]: i["id"] for i in items}
    holds = []
    for item_name, reason in HOLDBACK.items():
        if item_name not in ids:
            print(f"HOLDBACK names {item_name!r}, which is not an item any more (the page changed)", file=sys.stderr)
            return 1
        holds.append((ids[item_name], reason))

    # candidates for holdback: contradictions inside the printed row (the row itself is never altered)
    problems = []
    for it in items:
        for p in ta.sanity_problems(it):
            problems.append((it["name"], p))
        gap = ta.energy_gap(it)
        if gap and "includes alcohol" not in it["notes"]:
            problems.append((it["name"], gap))

    allergens_all = all(it["allergens"] is not None for it in items)
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Flight Club", cuisine="Social darts bar",
        source_title="Flight Club online menu with nutrition and allergens (menus.tenkites.com/redengine/flightclub: Bar Snacks, Sharing Plates, "
                     f"Sides, Sharing Pizza Paddles, Sweet Treats, Breakfast and Drinks tabs; accessed {args.checked_on}, no date shown)",
        source_url=URL, checked_on=args.checked_on, aliases=["flight club", "flight club darts", "flightclub"],
        items=items, out=args.out, note=NOTE, holdback=holds,
        allergen_guide={"title": ALLERGEN_TITLE, "url": URL, "checked_on": args.checked_on, "may_contain_published": True})
    if not holds:
        (Path(folder) / "holdback.csv").unlink(missing_ok=True)

    for n, p in cache:
        print(f"{TABS[n][0]:10} {len(pages[TABS[n][0]]):4} dishes  sha256 {sha256_file(p)}  {n}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("dishes without calories/protein/carbs/fat, by tab:", by_menu)
    print(f"tabs left out: { {n: v[3] for n, v in TABS.items() if v[3]} }")
    print(f"dish rows read {total}; wrote {len(items)} items to {folder} ({len(holds)} held back); "
          f"duplicates merged: {total - len(excluded) - len(skipped) - len(items)}; allergens complete: {allergens_all}")
    print("allergen notes:", tk.ALLERGEN_NOTES)
    print("self-contradicting rows to review (not changed):", problems)
    text_of = {r["name"]: r["text"] for r in rows}
    not_stated = [it["name"] for it in items
                  if not it["tags"] and _MEAT_NAMED.search(text_of[it["name"]]) and not _ANIMAL.search(text_of[it["name"]])]
    print(f"meat type not stated ({len(not_stated)}):", not_stated)
    if args.report:
        print("-- not published (a '-' in kcal, protein, carbs or fat):")
        for label, name, why in excluded:
            print("  ", label, ">", name)
        by_cat: dict[str, int] = {}
        for it in items:
            by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
        print("-- items by category:", by_cat)
    return 0


if __name__ == "__main__":
    sys.exit(main())
