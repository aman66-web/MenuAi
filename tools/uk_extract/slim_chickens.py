#!/usr/bin/env python3
"""Build data/source/slim-chickens/ from Slim Chickens' own "Allergy and Dietary Information" page (a FULL-nutrition chain, with
complete allergens).

    python3 tools/uk_extract/slim_chickens.py --html path/to/slimscore.html --site-html path/to/menus.html --checked-on 2026-10-08 \
        [--fetch] [--out DIR]

Sources (both the chain's own, robots.txt allows both):
  * Nutrition and allergens: https://menus.tenkites.com/brg/slimscore?sitecode=SLM%20Basildon  ("Slims Main Menu", Ten Kites platform).
    The chain's menu page (https://www.slimchickens.co.uk/menus) links to it as "Check the Dietary Information"
    (https://menus.tenkites.com/brg/slimchickensall, where you pick a restaurant). The page shows no edition date (its PDF file name
    carries the day it was generated). Every dish has a per-portion table: kJ, kcal, protein, carbohydrate, sugars, fat, saturates, fibre
    and salt, and an allergen table ("Contain" / "May Contain"). Read by slim_chickens_pages.py.
  * Cross-check only: https://www.slimchickens.co.uk/menus (menu text such as "Coleslaw (313kcal)" or "3 Tender Meal (from 662kcal)").
    --fetch downloads each page once (browser User-Agent, one second apart) into --html / --site-html first.

The triage said "calories only" because the chain's own menu page prints only kcal; the dietary page behind its link prints everything
above, so this is a FULL chain.

Which menu: the page has one menu per group of sites (core, hubs, "inc breakfast", high street, Belfast). Core, hubs and "inc breakfast"
hold exactly the same recipes and numbers (compared id by id: 67 recipes, no difference); the high-street menu (Bromley, London Ealing,
London Wood Green only) has a different list, and the Belfast menu serves Northern Ireland / Ireland sites. Published: the core menu
(GB sites). Not published: the high-street-only list and Belfast.

How the numbers are to be read (checked in Chromium): tenders, wings, boneless bites, sandwiches, salads and meals are "build your own" items.
Their figure is the item as listed, WITHOUT the house sauce(s) and drink it is sold with: ticking a sauce in the page adds that sauce's
calories (4 Tenders 303 kcal + Hot Honey Ranch 206 kcal = 509 kcal). The sauces are listed once, under House Sauces. note.txt says so.
Blank values stay blank (the page's script shows a missing fibre figure as 0.0; we do not publish that as a value).

Cross-check against the chain's menu page (so nothing is published that the chain's own website contradicts; nothing is corrected):
  * a single website figure for the same dish must equal ours (+/- 1 kcal is rounding), or differ by whole house sauces
    (14 kcal each, the lowest-calorie sauce: the website adds the sauces to tenders, 241 = 227 + 14, 393 = 379 + 14, 559 = 531 + 28);
  * a website "from N kcal" (the lowest option of a meal, sauces and drink included) must be at or above ours and at most 5% above it.
  A dish that fails stays in items.csv but is listed in holdback.csv with both figures.

Left out (each checked on every run, the script stops if the list changes):
  * "The Boneless Fix": marked (Delivery Only);
  * Gravy: no allergen and no diet label at all (the record looks unfilled), so "no allergens" could not be believed;
  * Bottomless Soda: a refill drink with no size or flavour (no stated serving or basis);
  * Monster Mango Loco and the three alcoholic drinks: protein and/or fat (or all values) printed "-";
  * the 6 / 8 / 10 Crispy Wings: each size is listed twice under the same name with different figures (580 and 606 kcal for 6), so they
    cannot be told apart.

Allergens (docs/DATA.md "Allergens") are complete: every published dish has them. Plain dishes: the page's allergen table; build-your-own
dishes: the labels of the recipe (Value yes = contains, maybe = may contain). For plain dishes the table is cross-checked against the
page's own data-labels / data-no-may-labels lists and the run stops if they disagree. The page prints "may contain" (supplier cross
contact) and says deep-fried foods share fryers; may_contain_published = yes. Diet labels: Vegetarian / Vegan are tagged vegetarian
(plus items named Plant Based). contains_pork only where the name says bacon. Calories-wise nothing is rounded.
"""
from __future__ import annotations
import argparse
import html as htmllib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import slim_chickens_pages as pages  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "slim-chickens"
NUTRITION_URL = "https://menus.tenkites.com/brg/slimscore?sitecode=SLM%20Basildon"
LANDING_URL = "https://menus.tenkites.com/brg/slimchickensall"
SITE_URL = "https://www.slimchickens.co.uk/menus"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
ALIASES = ["slim chickens", "slim chicken", "slims chicken", "slims"]
SOURCE_TITLE = ("Slim Chickens UK and Ireland Allergy and Dietary Information, Slims Main Menu "
                "(Ten Kites; accessed {checked}, no edition date shown)")
ALLERGEN_GUIDE_TITLE = "Slim Chickens UK and Ireland Allergy and Dietary Information (Ten Kites)"
NOTE = ("Figures and allergens are for each item as listed, before the house sauce(s) and drink that come with tenders, wings, "
        "sandwiches and meals: look the sauce up under House Sauces. Main menu of most sites; three London high-street sites "
        "have a different menu.")

# Allergen words this page prints that common._A does not know (kept here, per chain).
EXTRA_ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}
# Allergen label ids the page uses for the 14, for the cross-check of plain dishes (names as printed in the allergen table).
LABEL_IDS = {"Celery": "23", "Eggs": "22", "Milk": "11", "Mustard": "24", "Soya": "31", "Sulphur Dioxide/ Sulphites": "76",
             "Cereals with Gluten": "12", "Sesame Seeds": "20", "Fish": "8"}
DIET_LABELS = {"Vegetarian", "Vegan"}

# Course (as printed) -> category. Order in the file = order on the page.
CATEGORY = {"CHICKEN TENDERS": "Chicken Tenders", "CRISPY WINGS": "Crispy Wings", "BONELESS BITES": "Boneless Bites",
            "TENDERS & WINGS MEALS": "Tenders & Wings Meals", "SANDWICHES": "Sandwiches", "SALAD & WRAPS": "Salad & Wraps",
            "SIDES": "Sides", "HOUSE SAUCES": "House Sauces", "KIDS MEALS": "Kids Meals", "HANDSPUN SHAKES": "Handspun Shakes",
            "Desserts": "Desserts", "SOFT DRINKS": "Soft Drinks", "ALCOHOLIC DRINKS": "Alcoholic Drinks", "HOT DRINKS": "Hot Drinks"}
# Dishes the page lists per course (all of them, before exclusions): the run stops if this changes.
EXPECTED_COUNTS = {"CHICKEN TENDERS": 9, "CRISPY WINGS": 18, "BONELESS BITES": 7, "TENDERS & WINGS MEALS": 3, "SANDWICHES": 10,
                   "SALAD & WRAPS": 6, "SIDES": 16, "HOUSE SAUCES": 15, "KIDS MEALS": 3, "HANDSPUN SHAKES": 10, "Desserts": 1,
                   "SOFT DRINKS": 12, "ALCOHOLIC DRINKS": 3, "HOT DRINKS": 4}
# (course, name) -> why it is left out (not in items.csv at all)
EXCLUDED = {
    ("BONELESS BITES", "The Boneless Fix"): "marked (Delivery Only)",
    ("SIDES", "Gravy"): "no allergen and no diet label at all on the page (record looks unfilled)",
    ("SOFT DRINKS", "Bottomless Soda"): "refill drink with no size or flavour: no stated serving or basis",
    ("SOFT DRINKS", "Monster Mango Loco"): "protein and fat printed '-' (not published)",
    ("ALCOHOLIC DRINKS", "Lucky Saint 0% Beer"): "protein, carbs and fat printed '-' (not published)",
    ("ALCOHOLIC DRINKS", "Brixton Coldharbour"): "no nutrition values printed ('-')",
    ("ALCOHOLIC DRINKS", "Brixton Low Voltage"): "no nutrition values printed ('-')",
}
# Names listed twice in one course with different figures (cannot be told apart): left out.
EXPECTED_DUPLICATES = {("CRISPY WINGS", "6 Crispy Wings"), ("CRISPY WINGS", "8 Crispy Wings"), ("CRISPY WINGS", "10 Crispy Wings")}

NUTRIENT_COLUMN = {"energy (kj)": "energy_kj", "energy (kcal)": "calories", "protein (g)": "protein_g", "carb (g)": "carbs_g",
                   "of which sugars (g)": "sugar_g", "fat (g)": "fat_g", "sat fat (g)": "sat_fat_g", "fibre (g)": "fiber_g",
                   "salt (g)": "salt_g"}

# Website menu title -> [(website dish name, our (course, name))]. Numbers come from the website page itself, names only are typed.
SITE_MAP = {
    "Tender Meals": [("3 Tender Meal", ("CHICKEN TENDERS", "3 Tenders Meal")), ("4 Tender Meal", ("CHICKEN TENDERS", "4 Tenders Meal")),
                     ("5 Tender Meal", ("CHICKEN TENDERS", "5 Tenders Meal")), ("7 Tender Meal", ("CHICKEN TENDERS", "7 Tenders Meal")),
                     ("Plant-Based 3 Tender Meal*", ("CHICKEN TENDERS", "Plant Based 3 Tenders Meal"))],
    "Wing Meals": [("6 Wings Meal", ("CRISPY WINGS", "6 Crispy Wings Meal")), ("8 Wings Meal", ("CRISPY WINGS", "8 Crispy Wings Meal")),
                   ("10 Wings Meal", ("CRISPY WINGS", "10 Crispy Wings Meal"))],
    "Boneless Bites": [("6 Boneless Bites Meal", ("BONELESS BITES", "6 Boneless Bites Meal")),
                       ("8 Boneless Bites meal", ("BONELESS BITES", "8 Boneless Bites Meal")),
                       ("10 Boneless Bites meal", ("BONELESS BITES", "10 Boneless Bites Meal"))],
    "Tenders & Wings Meals": [("3 & 3 Meal", ("TENDERS & WINGS MEALS", "3 Tender & 3 Crispy Wing")),
                              ("5 & 5 Meal", ("TENDERS & WINGS MEALS", "5 Tenders & 5 Crispy Wings"))],
    "Sandwich Meals": [("Hot Buffalo Sandwich", ("SANDWICHES", "Buffalo Sandwich Meal")),
                       ("Honey BBQ Sandwich", ("SANDWICHES", "Honey BBQ Sandwich Meal")),
                       ("Classic Chicken Sandwich", ("SANDWICHES", "Classic Sandwich Meal")),
                       ("Plant-Based Buffalo Sandwich", ("SANDWICHES", "Plant Based Buffalo Sandwich Meal"))],
    "Salad & Wrap Meals": [("Slim's Salad", ("SALAD & WRAPS", "Slim's Salad Meal")), ("Slim's Wrap", ("SALAD & WRAPS", "Slim's Wrap Meal")),
                           ("Buffalo Wrap", ("SALAD & WRAPS", "Buffalo Wrap Meal"))],
    "Sides": [("Fried Pickles", ("SIDES", "Fried Pickles")), ("Coleslaw", ("SIDES", "Coleslaw")),
              ("Mac & Cheese", ("SIDES", "Mac & Cheese")), ("Seasoned Fries", ("SIDES", "Regular Seasoned Fries")),
              ("3 Tenders", ("SIDES", "3 Tenders")), ("5 Tenders", ("CHICKEN TENDERS", "5 Tenders")),
              ("7 Tenders", ("CHICKEN TENDERS", "7 Tenders")), ("3 Wings", ("SIDES", "3 Crispy Wings")),
              ("Crispy Fried Onions", ("SIDES", "Crispy Fried Onions")),
              ("Buffalo & Blue Cheese Loaded Fries", ("SIDES", "Buffalo Blue Loaded Fries")),
              ("Texas Toast", ("SIDES", "Texas Toast")), ("The Big Ranch Pot", ("SIDES", "The Big Ranch Pot")),
              ("Slims Cookie", ("Desserts", "Slims Cookie"))],
    "Shakes": [("Vanilla", ("HANDSPUN SHAKES", "Vanilla")), ("Chocolate", ("HANDSPUN SHAKES", "Chocolate")),
                         ("Strawberry", ("HANDSPUN SHAKES", "Strawberry")), ("Popcorn", ("HANDSPUN SHAKES", "Popcorn")),
                         ("Caramel", ("HANDSPUN SHAKES", "Caramel")), ("Mocha Shake", ("HANDSPUN SHAKES", "Mocha Shake")),
                         ("Oreo®", ("HANDSPUN SHAKES", "Oreo")), ("Biscoff®", ("HANDSPUN SHAKES", "Biscoff Shake")),
                         ("Cadbury Flake®", ("HANDSPUN SHAKES", "Flake Shake")),
                         ("NEW Banana & Biscoff®", ("HANDSPUN SHAKES", "Biscoff & Banana"))],
    "Kid's Meals": [("Tenders Meal", ("KIDS MEALS", "Kids Tenders Meal")), ("Boneless Bites Meal", ("KIDS MEALS", "Kids Boneless Bite Meal")),
                    ("Tender Mac & Cheese", ("KIDS MEALS", "Kids Tender Mac & Cheese"))],
}
# The website's dipping sauce list (title -> our House Sauces name)
SAUCE_MAP = {"Blue Cheese": "Blue Cheese", "Buffalo": "Buffalo", "Cayenne Ranch": "Cayenne Ranch", "Garlic Cheese": "Garlic & Cheese",
             "Gravy Mayo": "Gravy Mayo", "Honey BBQ": "Honey BBQ", "Honey Mustard": "Honey Mustard", "Hot Honey Ranch": "Hot Honey Ranch",
             "Korean BBQ": "Korean BBQ", "Mango Habanero": "Mango Habanero", "Ranch": "House Ranch", "Slim Reaper": "Slim Reaper",
             "Slim Sauce": "Slims Sauce", "Spicy BBQ": "Spicy BBQ", "Sweet Chilli": "Sweet Chilli"}
# The website's sandwich add-on message and the dish of ours it describes
ADD_ON_MESSAGE = ("Double up your sandwich for", ("SANDWICHES", "Extra Chicken Breast"))
# Things that look wrong in the page's own numbers but are not impossible: entered as printed, noted for the founder.
SPECIAL_NOTES = {
    ("CRISPY WINGS", "8 Honey BBQ Wings"): "sugars 1.0 g beside 93.4 g carbs, while the 6 and 10 piece sizes print 29.4 g and 49.1 g: looks like a typo on the page",
    ("BONELESS BITES", "8 Boneless Bites Meal"): "protein 32.8 g is lower than the 6 piece meal's 40.1 g",
    ("SALAD & WRAPS", "Slim's Salad Meal"): "lower than the Slim's Salad alone (542 vs 641 kcal) although it adds sauces and a drink",
}


# ------------------------------------------------------------------------------------------------ fetching
def fetch(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                dest.write_bytes(resp.read())
            return
        except OSError as exc:  # dropped connection: retry; an HTTP error status (403, 429) is a block and stops the run
            if isinstance(exc, urllib.error.HTTPError) or attempt == 2:
                raise SystemExit(f"{url}: {exc}")
            time.sleep(5)


# ------------------------------------------------------------------------------------------------ the website
def read_site(page: str) -> dict:
    """The chain's menu page: {'dishes': {(menu title, dish name): ('single'|'from', kcal)}, 'sauces': {title: kcal}, 'messages': [..]}."""
    i = page.find("<menus-page")
    j = page.find("</menus-page>", i)
    if i < 0 or j < 0:
        raise SystemExit("the chain's menu page no longer has the menus-page element")
    tag = page[i:j]

    def attr(name: str):
        m = re.search(re.escape(name) + r'="([^"]*)"', tag)
        if not m:
            raise SystemExit(f"menus page: attribute {name} not found")
        return json.loads(htmllib.unescape(m.group(1)))

    menus, sauces = attr(":menus"), attr(":dipping-sauces")
    dishes, messages = {}, []
    for menu in menus:
        for msg in menu.get("additional_messages") or []:
            messages.append(msg.get("message_text", ""))
        for fi in menu.get("food_items") or []:
            text = re.sub(r"<[^>]+>", " ", htmllib.unescape(fi.get("food_description") or ""))
            hits = re.findall(r"(\bfrom\s+)?(\d[\d,]*)\s*kcals?\b", text, flags=re.I)
            if not hits:
                continue
            if len(hits) != 1:
                raise SystemExit(f"{menu['title']} / {fi['food_name']}: several kcal figures in {text!r}")
            frm, num = hits[0]
            dishes[(menu["title"], fi["food_name"])] = ("from" if frm else "single", int(num.replace(",", "")))
    return {"dishes": dishes, "sauces": {s["title"]: int(s["calories"]) for s in sauces if s.get("calories") is not None},
            "messages": messages}


def add_on_figure(messages: list) -> int:
    for m in messages:
        if m.startswith(ADD_ON_MESSAGE[0]):
            hit = re.search(r"\(\+\s*(\d+)\s*kcal\)", m)
            if hit:
                return int(hit.group(1))
    raise SystemExit("the website's sandwich 'Double up' message with its kcal figure is gone")


# ------------------------------------------------------------------------------------------------ the dietary page
def number(raw: str) -> str:
    raw = raw.strip()
    if raw in ("", "-"):
        return ""
    raw = raw.replace(",", "")
    if not re.fullmatch(r"\d+(?:\.\d+)?", raw):
        raise SystemExit(f"unexpected nutrition value {raw!r}")
    return raw


def nutrients_of(entry: dict) -> dict:
    out = {}
    for label, value in entry["nutrients"]:
        key = NUTRIENT_COLUMN.get(label.lower())
        if key is None:
            raise SystemExit(f"{entry['name']}: unknown nutrition row {label!r}")
        if key in out:
            raise SystemExit(f"{entry['name']}: nutrition row {label!r} twice")
        out[key] = number(value)
    if set(out) != set(NUTRIENT_COLUMN.values()):
        raise SystemExit(f"{entry['name']}: nutrition rows {sorted(out)}")
    return out


def allergens_of(entry: dict) -> dict:
    if entry["kind"] == "byo":
        contains, may = [], []
        for _id, desc, value in entry["labels"]:
            if desc in DIET_LABELS:
                continue
            if value == "yes":
                contains.append(desc)
            elif value == "maybe":
                may.append(desc)
            else:
                raise SystemExit(f"{entry['name']}: allergen label {desc!r} has value {value!r}")
    else:
        contains = [n for n, y, m in entry["allergens"] if y and not m]
        may = [n for n, y, m in entry["allergens"] if m and not y]
        if any(y and m for _n, y, m in entry["allergens"]) or any(not y and not m for _n, y, m in entry["allergens"]):
            raise SystemExit(f"{entry['name']}: an allergen row is both or neither contains / may contain")
        # cross-check with the page's own label lists (ids of the allergens the page names in the table)
        all_ids, no_may = set(entry["all_labels"].split(",")) - {""}, set(entry["no_may_labels"].split(",")) - {""}
        known = set(LABEL_IDS.values())
        want_contains = {LABEL_IDS[n] for n in contains if n in LABEL_IDS}
        want_may = {LABEL_IDS[n] for n in may if n in LABEL_IDS}
        if (no_may & known) != want_contains or ((all_ids - no_may) & known) != want_may:
            raise SystemExit(f"{entry['name']}: allergen table and data-labels disagree "
                             f"({sorted(want_contains)}/{sorted(want_may)} vs {sorted(no_may & known)}/{sorted((all_ids - no_may) & known)})")
    c_keys, cereals, nuts = allergen_words(contains, entry["name"], EXTRA_ALLERGEN_WORDS)
    m_keys, _, _ = allergen_words(may, entry["name"], EXTRA_ALLERGEN_WORDS)
    return {"contains": c_keys, "may_contain": m_keys - c_keys, "cereals": cereals, "nuts": nuts}


def is_vegetarian(entry: dict) -> bool:
    if "plant based" in entry["name"].lower():
        return True
    if entry["kind"] == "byo":
        return any(d in DIET_LABELS for _i, d, _v in entry["labels"])
    ids = set(entry["data_labels"].split(","))
    return bool(ids & {"50", "52"})


def rankable(course: str, name: str) -> bool:
    if course in ("HOUSE SAUCES", "HANDSPUN SHAKES", "Desserts", "SOFT DRINKS", "ALCOHOLIC DRINKS", "HOT DRINKS"):
        return False
    if "Add On" in name or name in ("Extra Chicken Breast", "Texas Toast", "The Big Ranch Pot", "The Big Slim's Pot"):
        return False
    return True


def cross_check(entries: dict, site: dict) -> dict:
    """(course, name) -> reason, for dishes the website contradicts. Also returns agreement notes under key None."""
    lowest_sauce = min(int(nutrients_of(e)["calories"]) for e in entries.values() if e["course"] == "HOUSE SAUCES")
    held, notes = {}, {}

    def judge(key, kind, site_kcal, label):
        ours = int(nutrients_of(entries[key])["calories"])
        diff = site_kcal - ours
        if kind == "single":
            ok = abs(diff) <= 1 or (diff > 0 and diff % lowest_sauce == 0 and diff // lowest_sauce <= 3)
            how = ("same figure" if diff == 0 else "within rounding (1 kcal)" if abs(diff) <= 1 else
                   f"website adds {diff // lowest_sauce} x {lowest_sauce} kcal house sauce(s)" if ok else "differs")
        else:
            ok = 0 <= diff <= 0.05 * site_kcal
            how = f"website 'from' minimum is {diff} kcal higher (sauce and drink choices)" if ok else "'from' minimum is not within 5% above ours"
        text = f"website '{label}' {'from ' if kind == 'from' else ''}{site_kcal} kcal vs {ours} kcal here: {how}"
        if ok:
            notes[key] = text
        else:
            held[key] = text
    for menu, pairs in SITE_MAP.items():
        for site_name, key in pairs:
            hit = site["dishes"].get((menu, site_name))
            if hit is None:
                raise SystemExit(f"the website no longer lists {site_name!r} under {menu!r}: update SITE_MAP")
            if key not in entries:
                raise SystemExit(f"{key} (website {site_name!r}) is not on the dietary page: update SITE_MAP")
            judge(key, hit[0], hit[1], site_name)
    for title, name in SAUCE_MAP.items():
        if title not in site["sauces"]:
            raise SystemExit(f"the website no longer lists the dipping sauce {title!r}")
        judge(("HOUSE SAUCES", name), "single", site["sauces"][title], title)
    if set(site["sauces"]) != set(SAUCE_MAP):
        raise SystemExit(f"the website's dipping sauces changed: {sorted(set(site['sauces']) ^ set(SAUCE_MAP))}")
    # the sandwich add-on: the website's "+136kcal" is for the extra portion; same dish, same £3.00 price
    figure = add_on_figure(site["messages"])
    ours = int(nutrients_of(entries[ADD_ON_MESSAGE[1]])["calories"])
    text = f"website 'Double up your sandwich for £3.00' +{figure} kcal vs {ours} kcal here"
    (notes if figure == ours else held)[ADD_ON_MESSAGE[1]] = text
    return {"held": held, "notes": notes}


# Independent accuracy check, 8 Oct 2026: dishes whose own page entry conflicts with itself on an allergen. The meal is named Plant Based
# and its page entry marks Milk as CONTAINED (the Solo sandwich of the same recipe marks milk only as "may contain"; the page shows no
# Vegan label for either), so the page does not say whether the milk comes from the meal's sauce or drink or is a mistake: held back.
HOLD_NAMED = {
    ("SANDWICHES", "Plant Based Buffalo Sandwich Meal"): "The dish is named Plant Based but the page marks Milk as contained (its Solo sandwich marks milk only as may contain), so its allergen information conflicts with its name.",
}


def energy_notes(n: dict) -> tuple:
    """(hold-back reason or '', [notes]) from the dish's own numbers. kJ and kcal that contradict each other (kJ/kcal outside
    3.7-4.5; the usual factor is 4.18) are held back; smaller oddities are only noted."""
    kcal = float(n["calories"])
    notes, hold = [], ""
    if kcal >= 50 and n["energy_kj"] != "":
        ratio = float(n["energy_kj"]) / kcal
        if ratio < 3.7 or ratio > 4.5:
            hold = f"kJ and kcal contradict each other: {n['energy_kj']} kJ vs {n['calories']} kcal (kJ/kcal {ratio:.2f}, usual 4.18)"
        elif ratio < 3.95 or ratio > 4.4:
            notes.append(f"kJ/kcal {ratio:.2f} (usual 4.18)")
    if kcal >= 50:
        est = 4 * float(n["protein_g"]) + 4 * float(n["carbs_g"]) + 9 * float(n["fat_g"])
        if abs(est - kcal) / kcal > 0.10:
            notes.append(f"4P+4C+9F = {est:.0f} vs {n['calories']} kcal")
    if n["salt_g"] != "" and float(n["salt_g"]) > 6:
        notes.append(f"salt {n['salt_g']} g as printed")
    return hold, notes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True, help="the dietary page (NUTRITION_URL)")
    ap.add_argument("--site-html", type=Path, required=True, help="the chain's menu page (SITE_URL), for the cross-check")
    ap.add_argument("--checked-on", required=True, help="the day the pages were read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download both pages once first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.html.parent.mkdir(parents=True, exist_ok=True)
        fetch(NUTRITION_URL, args.html)
        time.sleep(1.2)
        fetch(SITE_URL, args.site_html)
    print(f"dietary page sha256 {sha256_file(args.html)}  {args.html}")
    print(f"website menu page sha256 {sha256_file(args.site_html)}  {args.site_html}")

    parsed = pages.read_menu(args.html.read_text(encoding="utf-8", errors="replace"))
    counts = {}
    for e in parsed:
        counts[e["course"]] = counts.get(e["course"], 0) + 1
    if counts != EXPECTED_COUNTS:
        raise SystemExit(f"The dietary page changed. Dishes per course now {counts}, expected {EXPECTED_COUNTS}. Re-read it and update the script.")
    seen, dup = {}, set()
    for e in parsed:
        k = (e["course"], e["name"])
        if k in seen:
            dup.add(k)
        seen[k] = seen.get(k, 0) + 1
        table_kcal = number(dict((a.lower(), b) for a, b in e["nutrients"])["energy (kcal)"])
        if e["printed_kcal"] and e["printed_kcal"].replace(",", "") != table_kcal:
            raise SystemExit(f"{e['name']}: heading says {e['printed_kcal']} kcal but the table says {table_kcal}")
    if dup != EXPECTED_DUPLICATES:
        raise SystemExit(f"Dishes listed twice under one name changed: now {sorted(dup)}, expected {sorted(EXPECTED_DUPLICATES)}")
    leftout = {}
    entries = {}
    for e in parsed:
        key = (e["course"], e["name"])
        if key in dup:
            leftout[key] = "listed twice under the same name with different figures (cannot be told apart)"
            continue
        if key in EXCLUDED:
            leftout[key] = EXCLUDED[key]
            continue
        entries[key] = e
    missing = set(EXCLUDED) - {(e["course"], e["name"]) for e in parsed}
    if missing:
        raise SystemExit(f"Excluded dishes no longer on the page: {sorted(missing)}")
    # anything else with a missing number needed for a full chain is a change to look at
    for key, e in entries.items():
        n = nutrients_of(e)
        for need in ("calories", "protein_g", "carbs_g", "fat_g"):
            if n[need] == "":
                raise SystemExit(f"{key}: {need} is not published; add it to EXCLUDED after checking the page")

    site = read_site(args.site_html.read_text(encoding="utf-8", errors="replace"))
    result = cross_check(entries, site)

    items, holdback = [], []
    for key, e in entries.items():
        course, name = key
        n = nutrients_of(e)
        tags = []
        if is_vegetarian(e):
            tags.append("vegetarian")
        if re.search(r"\bbacon\b", name, re.I):
            tags.append("contains_pork")
        shown = name + " Shake" if course == "HANDSPUN SHAKES" and "Shake" not in name else name
        notes = [f"course '{course}'" + (f", description: {e['desc']}" if e["desc"] else "")]
        if shown != name:
            notes.append(f"printed '{name}'")
        if key in result["notes"]:
            notes.append(result["notes"][key])
        energy_hold, energy_extra = energy_notes(n)
        notes.extend(energy_extra)
        if key in SPECIAL_NOTES:
            notes.append(SPECIAL_NOTES[key])
        items.append(dict(name=shown, category=CATEGORY[course], tags="|".join(tags), rankable=rankable(course, name),
                          allergens=allergens_of(e), notes="; ".join(notes), **n))
        reasons = [r for r in (result["held"].get(key), energy_hold, HOLD_NAMED.get(key)) if r]
        if reasons:
            holdback.append((key, "; ".join(reasons)))
    ids = [slug(it["name"]) for it in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("item ids are not unique")
    id_of = {(c, nm): slug(nm + " Shake" if c == "HANDSPUN SHAKES" and "Shake" not in nm else nm) for (c, nm) in entries}
    holdback_rows = [(id_of[k], reason) for k, reason in holdback]

    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": LANDING_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Slim Chickens", cuisine="Chicken",
                             source_title=SOURCE_TITLE.format(checked=args.checked_on), source_url=NUTRITION_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback_rows, allergen_guide=guide)
    per_cat = {}
    for it in items:
        per_cat[it["category"]] = per_cat.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in per_cat.items()))
    print(f"held back ({len(holdback_rows)}): " + "; ".join(f"{i}: {r}" for i, r in holdback_rows))
    print(f"left out ({len(leftout)}): " + "; ".join(f"{c} / {n}: {r}" for (c, n), r in leftout.items()))


if __name__ == "__main__":
    main()
