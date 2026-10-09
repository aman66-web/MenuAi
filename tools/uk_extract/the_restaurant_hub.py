#!/usr/bin/env python3
"""Build data/source/the-restaurant-hub/ from The Restaurant Hub's own "Allergens & Nutrition" page (hosted by Ten Kites).

    python3 -I tools/uk_extract/the_restaurant_hub.py --checked-on 2026-10-09 [--cache DIR] [--out DIR] [--report]

Source: https://menus.tenkites.com/brg/therestauranthub, the page https://therestauranthub.co.uk links to as "Allergens & Nutrition"
from the home page and from all 21 location pages (robots.txt of both hosts allows it). The page has six tabs (Ed's, Main Meals, GBK,
Slims Main Menu, Caffe Carluccios - Drinks, Caffe Carluccios - Food); each dish has a "Nutrition (per portion)" table (kJ, kcal, protein,
carbohydrate, sugars, fat, saturates, fibre, salt) and "Contains / May contain" allergen lines. The page prints no edition date (its
PDF export name carries the day it was generated, 2026-10-09). --cache holds the six saved tabs (menu-0.html ...), downloaded once at one
request per second when missing. The numbers are copied from this page only (not from the Ed's, Slim Chickens, GBK or Carluccio's
chains we publish separately: the Hub's dishes are its own subsets and the figures differ for some).

One menu for every hub: all 21 location pages link to this same address (no site code), so there is nothing to compare site by site; what
differs is which brands a hub sells (read from each location page's opening-times list, saved on 2026-10-09): Caffe Carluccio's 21 of 21,
Ed's Easy Diner and Fish & Chips 19 (not Blackheath, St Albans), Slim Chickens and GBK 10 (Crayford, Heaton Park, Kidderminster,
London Colney, Walthamstow/Low Hall, Selly Oak, Sevenoaks, Sydenham, Tamworth, Wolverhampton). note.txt says so.

What is not published (each checked on every run; the script stops if the page changes):
  * Slim Chickens' 6 / 8 / 10 Crispy Wings: each size is listed twice under one name with different figures (580 and 606 kcal for 6):
    they cannot be told apart, so none is used.
  * The Boneless Fix: described "(Delivery Only)"; Bottomless Soda: a refill drink with no size or amount.
  * Monster Mango Loco, Lucky Saint 0% Beer, Brixton Coldharbour, Brixton Low Voltage: protein and fat printed "-" or no table at all.
  * Caffe Carluccio's 23 coffees, iced coffees, frappes and teas "with a milk choice": the figure printed for the drink is the drink
    without the milk (a latte shows 1 kcal; the milk is a second option with its own figures), so no figure for the drink as served exists.
  * Dishes printed on two tabs with the same name and numbers are published once; with the same name and different numbers they are
    published under "Name (Brand)".
Build-your-own dishes of Slim Chickens (tenders, wings, sandwiches, salads, meals) are published as the page lists them, WITHOUT the
house sauce(s) and drink they are sold with (each sauce is listed once, under House sauces).
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as ta  # noqa: E402
import tenkites_c as tk  # noqa: E402
import the_restaurant_hub_pages as pages  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "the-restaurant-hub"
URL = "https://menus.tenkites.com/brg/therestauranthub"
SITE_URL = "https://therestauranthub.co.uk/"
LOCATIONS_URL = "https://therestauranthub.co.uk/locations/"
SITEMAP_URL = "https://therestauranthub.co.uk/location-sitemap.xml"
SOURCE_TITLE = "The Restaurant Hub Allergens & Nutrition, six brand menus (Ten Kites page linked from therestauranthub.co.uk; accessed {day}, no date shown)"
ALLERGEN_TITLE = "The Restaurant Hub Allergens & Nutrition, allergen and dietary information (Ten Kites page linked from therestauranthub.co.uk)"
NOTE = ("One menu for all 21 Hubs (in Sainsbury's stores), but each Hub sells only some brands: Carluccio's 21, Ed's and Fish & Chips 19, "
        "Slim Chickens and GBK 10. Per portion, from typical weights. Slim Chickens figures exclude the house sauces and drink. "
        "Coffees with a milk choice are not listed.")

# tab name -> (brand shown in categories, how it is used). Every tab the page lists must be named here.
TABS = {
    "ED'S": "Ed's",
    "MAIN MEALS": "Fish & Chips",
    "GBK": "GBK",
    "Slims Main Menu": "Slim Chickens",
    "Caffe Carluccios - Food": "Carluccio's",
    "Caffe Carluccios - Drinks": "Carluccio's",
}
# how a brand is named in brackets when the same dish name has different figures on two tabs (the Main Meals tab is not called
# "Fish & Chips" here: item names that contain fish or chips would look as if they named an allergen)
SUFFIX = {"ED'S": "Ed's", "MAIN MEALS": "Main Meals menu", "GBK": "GBK", "Slims Main Menu": "Slim Chickens",
          "Caffe Carluccios - Food": "Carluccio's", "Caffe Carluccios - Drinks": "Carluccio's"}
ORDER = ["ED'S", "MAIN MEALS", "GBK", "Slims Main Menu", "Caffe Carluccios - Food", "Caffe Carluccios - Drinks"]
# dishes the script expects per tab: (plain pop-ups, first-level options of build-your-own groups)
EXPECTED = {"ED'S": (35, 0), "MAIN MEALS": (23, 0), "GBK": (2, 0), "Slims Main Menu": (64, 53),
            "Caffe Carluccios - Food": (37, 0), "Caffe Carluccios - Drinks": (26, 23)}

# (tab, printed section) -> (category shown, rankable). Parts of a meal (sides, sauces, toppings, add-ons), sweet treats and drinks are
# not suggested as an order on their own.
SECTIONS = {
    ("ED'S", "ED'S BREAKFAST"): ("Ed's: Breakfast", True),
    ("ED'S", "ED'S SIDES"): ("Ed's: Sides", False),
    ("ED'S", "ED'S MAINS"): ("Ed's: Mains", True),
    ("MAIN MEALS", "FISH AND CHIPS"): ("Fish & Chips: Fish and chips", True),
    ("MAIN MEALS", "MAIN MEALS"): ("Fish & Chips: Main meals", True),
    ("MAIN MEALS", "KIDS"): ("Fish & Chips: Kids", True),
    ("MAIN MEALS", "SIDES"): ("Fish & Chips: Sides", False),
    ("GBK", "GBK"): ("GBK: Burgers", True),
    ("Slims Main Menu", "CHICKEN TENDERS"): ("Slim Chickens: Tenders", True),
    ("Slims Main Menu", "CRISPY WINGS"): ("Slim Chickens: Wings", True),
    ("Slims Main Menu", "BONELESS BITES"): ("Slim Chickens: Boneless bites", True),
    ("Slims Main Menu", "TENDERS & WINGS MEALS"): ("Slim Chickens: Tenders & wings meals", True),
    ("Slims Main Menu", "SANDWICHES"): ("Slim Chickens: Sandwiches", True),
    ("Slims Main Menu", "SALAD & WRAPS"): ("Slim Chickens: Salad & wraps", True),
    ("Slims Main Menu", "SIDES"): ("Slim Chickens: Sides", False),
    ("Slims Main Menu", "HOUSE SAUCES"): ("Slim Chickens: House sauces", False),
    ("Slims Main Menu", "KIDS MEALS"): ("Slim Chickens: Kids meals", True),
    ("Slims Main Menu", "HANDSPUN SHAKES"): ("Slim Chickens: Shakes", False),
    ("Slims Main Menu", "Desserts"): ("Slim Chickens: Desserts", False),
    ("Slims Main Menu", "SOFT DRINKS"): ("Slim Chickens: Soft drinks", False),
    ("Slims Main Menu", "ALCOHOLIC DRINKS"): ("Slim Chickens: Alcoholic drinks", False),
    ("Slims Main Menu", "HOT DRINKS"): ("Slim Chickens: Hot drinks", False),
    ("Caffe Carluccios - Food", "BREAKFAST FAVOURITES"): ("Carluccio's: Breakfast favourites", False),
    ("Caffe Carluccios - Food", "FRESH FOOD"): ("Carluccio's: Fresh food", False),
    ("Caffe Carluccios - Food", "MEAL DEAL"): ("Carluccio's: Meal deal", True),
    ("Caffe Carluccios - Drinks", "COFFEE"): ("Carluccio's: Coffee", False),
    ("Caffe Carluccios - Drinks", "ICED COFFEE"): ("Carluccio's: Iced coffee", False),
    ("Caffe Carluccios - Drinks", "FRAPPE"): ("Carluccio's: Frappe", False),
    ("Caffe Carluccios - Drinks", "HOT CHOCOLATE & MOCHA"): ("Carluccio's: Hot chocolate & mocha", False),
    ("Caffe Carluccios - Drinks", "TEA"): ("Carluccio's: Tea", False),
    ("Caffe Carluccios - Drinks", "SOFT DRINKS"): ("Carluccio's: Soft drinks", False),
}
# Dishes in a rankable section that are a part of a meal, an add-on, a condiment or a bundle for several people.
NOT_RANKABLE = {
    "Tartare", "Add cheese to jackets", "Jam", "Cheese & Bacon - Add On", "Extra Chicken Breast",
    "Full Reload Bundle",   # 15 tenders, 2 large fries and 4 sauces: a bundle (the page states no number of servings)
}
# (tab, section, name) -> why it is not published at all
LEFT_OUT = {
    ("Slims Main Menu", "BONELESS BITES", "The Boneless Fix"): "described '(Delivery Only)'",
    ("Slims Main Menu", "SOFT DRINKS", "Bottomless Soda"): "a refill drink with no size or amount stated",
    ("Slims Main Menu", "SOFT DRINKS", "Monster Mango Loco"): "protein and fat printed '-' (not published)",
    ("Slims Main Menu", "ALCOHOLIC DRINKS", "Lucky Saint 0% Beer"): "protein, carbohydrate and fat printed '-' (not published)",
    ("Slims Main Menu", "ALCOHOLIC DRINKS", "Brixton Coldharbour"): "no nutrition table on the page",
    ("Slims Main Menu", "ALCOHOLIC DRINKS", "Brixton Low Voltage"): "no nutrition table on the page",
}
# Names listed twice in one section of a build-your-own group with different figures (cannot be told apart): left out.
EXPECTED_DUPLICATES = {("Slims Main Menu", "CRISPY WINGS", "6 Crispy Wings"), ("Slims Main Menu", "CRISPY WINGS", "8 Crispy Wings"),
                       ("Slims Main Menu", "CRISPY WINGS", "10 Crispy Wings")}
# The page prints a space after the slash in this allergen name.
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None)}

# Rows the page contradicts itself on (found by comparing the page's own rows; nothing is corrected or chosen between).
HOLD_NAMED = {
    "Slim's Salad": "The page prints the salad at 641 kcal but 'Slim's Salad Meal' (the same salad plus 2 house sauces and a drink) at 542 kcal, "
                    "so one of the two rows is wrong and the page does not say which",
    "Sausage, Mash, Peas and Gravy": "Salt is printed as 13.0 g (more than twice the 6 g daily limit) for a 901 kcal dish, while the same page prints "
                                     "2.5 to 4.3 g for its other main meals and 1.3 g for the gravy: it looks like a misprint, and the page does not say",
    "Ultimate Brownie": "The dish is a brownie but the page marks no cereals with gluten, neither as contained nor as may contain (the blondie "
                        "beside it marks gluten) and does not call the brownie gluten free, so its allergen row cannot be trusted",
    "Slim's Salad Meal": "The page prints this meal (the salad plus 2 house sauces and a drink) at 542 kcal, lower than the salad alone "
                         "(641 kcal), so one of the two rows is wrong and the page does not say which",
}


def holdback_reason(it: dict, allergens: dict) -> str:
    """Why a published row is also held back (never corrected): its own energy figures contradict each other, or it is named for a
    diet its allergen marks contradict."""
    kcal = float(it["calories"])
    kj = float(it["energy_kj"]) if it["energy_kj"] != "" else 0.0
    reasons = []
    if kcal >= 20 and kj and not 3.9 <= kj / kcal <= 4.5:
        reasons.append(f"Printed {it['calories']} kcal but {it['energy_kj']} kJ ({kj / kcal:.2f} kJ per kcal, not 4.18): the page's energy figures contradict each other")
    name = it["name"].lower()
    if allergens and re.search(r"plant based|vegan", name) and allergens["contains"] & {"milk", "eggs"}:
        reasons.append("The dish is named Plant Based/Vegan but the page marks " + " and ".join(sorted(allergens["contains"] & {"milk", "eggs"}))
                       + " as contained, so its allergen information conflicts with its name")
    if allergens and re.search(r"\bgf\b|gluten free", name) and "gluten" in allergens["contains"]:
        reasons.append("The dish is named gluten free but the page marks cereals with gluten as contained")
    if it["name"] in HOLD_NAMED:
        reasons.append(HOLD_NAMED[it["name"]])
    return "; ".join(reasons)


def build(cache: list, extra_holds: dict) -> tuple[list, list, list, dict]:
    """Returns (items, holdback rows, report lines, stats)."""
    report, stats = [], {"left_out": [], "byo_choice_drinks": 0}
    items, seen_dish = [], {}
    for tab in ORDER:
        text = dict(cache)[tab].read_text(encoding="utf-8")
        rows = pages.read_tab(text)
        n_plain = sum(1 for r in rows if r["kind"] == "plain")
        n_byo = len(rows) - n_plain
        if (n_plain, n_byo) != EXPECTED[tab]:
            raise SystemExit(f"Tab {tab!r} has {n_plain} plain dishes and {n_byo} build-your-own options but this script expects "
                             f"{EXPECTED[tab]}: the menu changed, re-check SECTIONS and the rules before running again.")
        counts = {}
        for r in rows:
            counts[(r["section"], r["name"])] = counts.get((r["section"], r["name"]), 0) + (1 if r["kind"] == "byo" else 0)
        dup_byo = {(tab, s, n) for (s, n), c in counts.items() if c > 1}
        if tab == "Slims Main Menu" and dup_byo != EXPECTED_DUPLICATES:
            raise SystemExit(f"Options listed twice under one name changed: now {sorted(dup_byo)}, expected {sorted(EXPECTED_DUPLICATES)}")
        for r in rows:
            key = (tab, r["section"], r["name"])
            if r["kind"] == "byo" and tab == "Caffe Carluccios - Drinks":
                stats["byo_choice_drinks"] += 1
                continue                      # a drink printed without the milk it is made with: see the module docstring
            if key in dup_byo:
                stats["left_out"].append((key, "listed twice under the same name with different figures (cannot be told apart)"))
                continue
            if key in LEFT_OUT:
                stats["left_out"].append((key, LEFT_OUT[key]))
                continue
            if (tab, r["section"]) not in SECTIONS:
                raise SystemExit(f"{tab}: new section {r['section']!r}: add it to SECTIONS (category, rankable).")
            category, rankable = SECTIONS[(tab, r["section"])]
            if r["basis"] != "Nutrition (per portion)":
                raise SystemExit(f"{key}: nutrition basis {r['basis']!r}, not 'Nutrition (per portion)': check before publishing")
            nums, missing = tk.numbers(r["nutrients"], f"{tab} {r['name']}", extras=True)
            if missing:
                raise SystemExit(f"{key}: {', '.join(missing)} not printed and the dish is not in LEFT_OUT: add it after checking the page")
            name = re.sub(r"\s+", " ", r["name"]).strip()
            diet = r["diet"] | ({"vegetarian"} if re.search(r"plant based", name, re.I) else set())
            vegetarian = bool(diet)
            tags = ["vegetarian"] if vegetarian else []
            meat, unspecified = tk.meat_tags(name, r["desc"], vegetarian=vegetarian)
            if unspecified:
                report.append(f"meat type not stated: {name}")
            where = f"{tab} > {r['section']} > {name}"
            a = tk.allergens_checked(r, where, ALLERGEN_EXTRA)
            item = {"id": "", "name": name, "category": category, "serving": "", **nums, "tags": "|".join(tags + meat),
                    "rankable": rankable and name not in NOT_RANKABLE, "allergens": a, "_brand": SUFFIX[tab],
                    "_tab": tab, "_sec": (tab, r["section"]), "notes": f"Printed on the {tab} tab, section {r['section']}" + (f", group {r['group']}" if r["group"] else "")}
            items.append(item)
    # page order: tabs in ORDER, sections in the order SECTIONS lists them (the order the page shows them); a stable sort keeps dishes in page order
    order = list(SECTIONS)
    items.sort(key=lambda it: order.index(it["_sec"]))
    # same name printed on two tabs: identical numbers = one row; different numbers = told apart by brand
    kept, dropped, first = [], [], {}
    for it in items:   # names are compared ignoring capital letters ('Still Water' / 'Still water' are one product name)
        key = (it["name"].lower(), tuple(it[k] for k in tk.LABELS))
        if key not in first:
            first[key] = it
            kept.append(it)
            continue
        dropped.append(it["name"])
        if it["allergens"] != first[key]["allergens"]:
            report.append(f"allergens: {it['name']!r} is printed twice with the same numbers but different allergens: not used")
            first[key]["allergens"] = None
    report += [f"dropped exact duplicate (same name and numbers on another tab): {n}" for n in dropped]
    report += [f"allergens: no allergen information to read for {i['name']!r}" for i in kept if i["allergens"] is None]
    names = [i["name"].lower() for i in kept]
    for n in sorted({n for n in names if names.count(n) > 1}):
        clash = [i for i in kept if i["name"].lower() == n]
        if len({i["_brand"] for i in clash}) != len(clash):
            raise SystemExit(f"Different dishes share the name {n!r} within one brand: add a rename rule.")
        for i in clash:
            old_name = i["name"]
            i["name"] = f"{old_name} ({i['_brand']})"
            report.append(f"renamed to tell apart: {old_name!r} -> {i['name']!r} (same name, different figures on another brand's tab)")
    final, holdback = [], []
    for it in kept:
        it["id"] = slug(it["name"])
        notes = tk.annotate(it)
        why = holdback_reason(it, it["allergens"])
        if why:
            holdback.append((it["id"], why))
        it["notes"] = "; ".join([it["notes"]] + notes)
        report += [f"{it['name']}: {n}" for n in notes]
        for k in ("_brand", "_tab", "_sec"):
            it.pop(k)
        final.append(it)
    ids = [i["id"] for i in final]
    if len(set(ids)) != len(ids):
        raise SystemExit("item ids are not unique: " + str(sorted({i for i in ids if ids.count(i) > 1})))
    return final, holdback, report, stats


def main(argv: list | None = None) -> int:
    ap = argparse.ArgumentParser(description=f"Build data/source/{CHAIN_ID}/ from {URL}")
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "tenkites" / CHAIN_ID,
                    help="folder for the six saved tabs (menu-0.html ...), downloaded once at one request a second when missing")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the page")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--report", action="store_true", help="print every note")
    args = ap.parse_args(argv)

    cache = ta.fetch_menus(URL, args.cache)
    names = [n for n, _ in cache]
    if sorted(names) != sorted(TABS):
        raise SystemExit(f"The tab bar changed (page: {names}, script: {list(TABS)}). Decide for each tab before running again.")
    items, holdback, report, stats = build(cache, {})
    out = write_chain_folder(chain_id=CHAIN_ID, name="The Restaurant Hub", cuisine="Diner & cafe",
                             source_title=SOURCE_TITLE.format(day=args.checked_on), source_url=URL, checked_on=args.checked_on,
                             aliases=["the restaurant hub", "restaurant hub"], items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": URL, "checked_on": args.checked_on, "may_contain_published": True})
    if not holdback:
        (Path(out) / "holdback.csv").unlink(missing_ok=True)
    for i, (name, path) in enumerate(cache):
        print(f"tab {i} {name!r} sha256 {sha256_file(path)}")
    complete = all(i["allergens"] is not None for i in items)
    per_cat = {}
    for it in items:
        per_cat[it["category"]] = per_cat.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in per_cat.items()))
    print(f"allergens: {'every item has its allergens (allergens.csv written)' if complete else 'INCOMPLETE: allergen_guide.csv only'}")
    print(f"held back ({len(holdback)}): " + "; ".join(f"{i}: {r}" for i, r in holdback))
    print(f"left out ({len(stats['left_out'])}): " + "; ".join(f"{t} / {s} / {n}: {r}" for (t, s, n), r in stats["left_out"]))
    print(f"coffees, teas and frappes with a milk choice left out: {stats['byo_choice_drinks']}")
    if args.report:
        print("\n".join(report))
    else:
        print(f"{len(report)} report lines (run with --report)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
