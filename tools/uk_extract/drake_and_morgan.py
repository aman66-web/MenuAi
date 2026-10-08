#!/usr/bin/env python3
"""Build data/source/drake-and-morgan/ from Drake & Morgan's own menu pages (a CALORIES-ONLY chain, with allergens).

    python3 tools/uk_extract/drake_and_morgan.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the saved pages: for every bar `<venue>-menus.html` (https://www.drakeandmorgan.co.uk/<venue>/menus/) and one
`<venue>__<menuID>.json` per menu in that page's selector (the answer of the call the page itself makes:
POST <venue>/wp-admin/admin-ajax.php  action=ajax_menus&menuID=<menuID>). --fetch downloads them first, one request a second
(robots.txt: "User-agent: *  Disallow:" = nothing disallowed). See drake_and_morgan_pages.py for the markup that is read.

What the chain prints (verified by eye on the rendered pages, 2026-10-08): per dish a name, description, price, "NNN KCAL" (some
dishes have none) and one allergen label per allergen ("Contains Wheat" / "May Contain Wheat"). Protein, carbs and fat are never
printed, so this is a calories-only chain (docs/DATA.md "Calories-only chains": those columns stay blank, nothing is rankable).

Menus differ by bar. Eleven different menus exist (menu IDs below); each is word for word the same at every bar that shows it (the
script checks that), but the bars show different sets: e.g. the "All Day Menu" 18371 at 7 bars, a "reduced" All Day Menu 18435 at 9
others, the Otherist has its own. Rules, applied by dish name (case and the trade mark sign ignored, nothing fuzzy):
- A dish is published only if every menu that prints it shows the same calories (menus that print no figure for it don't count)
  AND the same Contains / May Contain labels. Otherwise it is held back (holdback.csv, listed with every figure found): the
  chain's own website contradicts itself, so we can't say which figure a given bar uses.
- A dish with one calorie figure beside several prices (espresso "£3 / 4 Double up", the three eggs benedict variants) is held
  back: the page doesn't say which size or variant the figure is for.
- A dish above 2,000 kcal that isn't described as for sharing is held back as implausible for one portion (2,000 kcal is the
  whole day's reference intake for an average adult woman); nothing is corrected. Sharing dishes (the page says "For 2 people"
  / "perfect for sharing") stay.
- A dish with no calorie figure on any menu isn't listed (wines have none at all). Pre-order package menus are not dishes.
Allergens are all-or-nothing: every published dish has its own Contains / May Contain labels copied from the page. A dish with no
label is one the chain marks with none of the 14 (the page's own "Filter by dietary requirement" works from the same data).
Tags: vegetarian when the chain marks the dish vegetarian or vegan on every menu that prints it; contains_pork / contains_beef when
the name or the page's description says so (words below); nothing else is inferred.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from collections import OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import drake_and_morgan_pages as pg  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "drake-and-morgan"
SOURCE_URL = "https://www.drakeandmorgan.co.uk/sample-menus/"
# Every bar that has its own menus page (https://www.drakeandmorgan.co.uk/bars-restaurants/ lists the first 16; the Edinburgh bar's
# page is in the site map and shows the same children's and brunch menus). The-refinery-spinningfields has only 2019 PDFs: not read.
VENUES = [
    ("the-anthologist", "The Anthologist (London)"), ("the-anthologist-manchester", "The Anthologist (Manchester)"),
    ("the-drift", "The Drift"), ("the-fable", "The Fable"), ("the-folly", "The Folly"), ("the-happenstance", "The Happenstance"),
    ("the-moniker", "The Moniker"), ("the-otherist", "The Otherist"), ("the-parlour", "The Parlour"),
    ("the-refinery-bankside", "The Refinery Bankside"), ("the-refinery-citypoint", "The Refinery City Point"),
    ("the-refinery-new-street-square", "The Refinery New Street Square"), ("the-refinery-regents-place", "The Refinery Regents Place"),
    ("the-refinery-st-andrew-square", "The Refinery St Andrew Square (Edinburgh)"), ("the-sipping-room", "The Sipping Room"),
    ("kings-cross", "Drake & Morgan King's Cross"), ("devonshire-terrace", "Devonshire Terrace"),
]
# menuID -> (label, number of dishes the script expects on it, the PDF the menu page links). The first menu a dish is found in (in
# this order) gives its category. The script stops if a bar shows a menu that isn't listed, or a menu's size or PDF changes.
MENUS = OrderedDict([
    ("18371", ("All Day Menu", 64, "DM-AW26-Collection-AllDay-v8.pdf")),
    ("18435", ("All Day Menu (reduced)", 55, "DM-AW26-Reduced-AllDay-v8.pdf")),
    ("18403", ("Weekend Brunch Menu", 53, "DM-AW26-Collection-Brunch-v6.pdf")),
    ("18352", ("Breakfast Menu", 41, "DM-AW26-Collection-Breakfast-v7.pdf")),
    ("18374", ("Dessert Menu", 24, "DM-AW26-Collection-Desserts-v6.pdf")),
    ("18429", ("Dessert Menu (reduced)", 22, "DM-AW26-Reduced-Desserts-v6.pdf")),
    ("18346", ("Drinks Menu", 66, "DM-AW26-Collection-Drinks-v13.pdf")),
    ("18378", ("Children's Menu", 21, "DM-AW26-Collection-Kids-v4.pdf")),
    ("17732", ("Otherist food menu", 34, "DM-AW26-Otherist-FoodDrink-v6.pdf")),
    ("17734", ("Otherist drinks menu", 33, "DM-AW26-Otherist-FoodDrink-v6-1.pdf")),
    ("18350", ("Wine Menu", 40, "DM-AW26-Collection-Wines-v8.pdf")),
])
EXPECTED_PUBLISHED = 93
EXPECTED_HELD = 40
SOURCE_TITLE = ("Drake & Morgan food and drink menus with calories and allergens on drakeandmorgan.co.uk, AW26 collection "
                "(PDFs: All Day v8, Reduced All Day v8, Brunch v6, Breakfast v7, Desserts v6, Reduced Desserts v6, Drinks v13, Kids v4, "
                "Otherist v6; bar menu pages accessed 2026-10-08, no date shown)")
ALLERGEN_TITLE = ("Drake & Morgan menu pages: Contains / May Contain allergen labels on every dish, AW26 collection "
                  "(bar menu pages accessed 2026-10-08, no date shown)")
NOTE = ("Calories only, as printed on each bar's own menu page (protein, carbs and fat are not published). Menus differ by bar: a dish is "
        "listed only if every menu that prints it shows the same calories and allergens, so some are on only some bars' menus. Wines have no calories.")
# Printed sub-headings that start a new group of dishes (section heading as carried, sub-heading) -> category; anything else uses the
# section heading as printed. A new sub-heading stops the run.
CATEGORY_FOR_SUB = {
    ("£10.95 for 2 courses & a soft drink", "Choose one drink"): "Children's: choose one drink",
    ("£10.95 for 2 courses & a soft drink", "The main event"): "Children's: the main event",
    ("Baby food", "Weekend brunch options (available until 4pm on weekends):"): "Children's: weekend brunch options",
    ("Baby food", "Sunday roast main options (in addition to the above)"): "Children's: Sunday roast main options",
    ("Baby food", "Desserts"): "Children's: desserts",
    ("Baby food", "Or, build your own sundae:"): "Children's: build your own sundae",
    ("Burgers & sandwiches", "Roasts - Sundays only"): "Sunday roasts",
    ("Fries", "Brunch Bar"): "Brunch bar",
}
CATEGORY_FOR_SECTION = {"£10.95 for 2 courses & a soft drink": "Children's menu", "Baby food": "Children's: baby food"}
# This chain's own spellings of allergens (docs: common.allergen_words `extra`): the same allergens, printed with a longer name.
EXTRA_WORDS = {
    "spelt (wheat)": ("gluten", "spelt"), "kamut (wheat)": ("gluten", "kamut"),
    "sulphur dioxide / sulphites": ("sulphites", None),
    "cashew nut": ("nuts", "cashew"), "pecan nut": ("nuts", "pecan"), "pistachio nut": ("nuts", "pistachio"),
    "macadamia or queensland nut": ("nuts", "macadamia"),
}
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|salami|chorizo|coppa|pepperoni|gammon|pigs in blankets)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEATY = re.compile(r"\b(chicken|duck|turkey|lamb|wagyu|burger|sausage|steak|ox|cheek|meatballs?|charcuterie|rump|sirloin|bolognese|bao)\b", re.I)
SHARING = re.compile(r"for 2 people|perfect for sharing|for sharing", re.I)
SERVING_TEXT = {"chateaubriand 18oz": ("For 2 people", "for 2 people"), "metre long steak": ("For sharing, 1.6kg of steak", "perfect for sharing")}
PLAUSIBLE_KCAL = 2000


def norm(name: str) -> str:
    s = name.replace("™", "").replace("`", "").replace("’", "'")
    return " ".join(s.split()).casefold()


def clean_name(name: str) -> str:
    return " ".join(name.replace("™", "").replace("`", "").split())


def category_for(section: str, sub: str) -> str:
    if sub:
        if (section, sub) not in CATEGORY_FOR_SUB:
            raise SystemExit(f"New sub-heading {sub!r} under {section!r}: add it to CATEGORY_FOR_SUB")
        return CATEGORY_FOR_SUB[(section, sub)]
    return CATEGORY_FOR_SECTION.get(section, section)


def load(pages: Path) -> tuple[dict, dict]:
    """-> (menus: id -> {items, venues, sha256, hide}, venues_menus: venue -> [ids])."""
    menus: dict = {}
    venue_menus: dict = {}
    for venue, _ in VENUES:
        page = pages / f"{venue}-menus.html"
        if not page.exists():
            raise SystemExit(f"{page} is missing: run with --fetch")
        ids = []
        for mid, label in pg.menu_options(page.read_text(encoding="utf-8"), venue):
            if mid in pg.PACKAGE_MENUS:
                continue
            if mid not in MENUS:
                raise SystemExit(f"{venue} shows a menu {mid} ({label!r}) that this script doesn't know: read it and add it to MENUS")
            f = pages / f"{venue}__{mid}.json"
            text = f.read_text(encoding="utf-8")
            parsed = pg.read_menu(text, f.name)
            ids.append(mid)
            if mid not in menus:
                menus[mid] = {"items": parsed["items"], "venues": [venue], "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                              "pdfs": parsed["pdfs"], "hide": (parsed["hide_icons"], parsed["hide_filters"])}
            else:
                if parsed["items"] != menus[mid]["items"]:
                    raise SystemExit(f"Menu {mid} differs between {menus[mid]['venues'][0]} and {venue}: bar-specific content; extend the script")
                menus[mid]["venues"].append(venue)
        venue_menus[venue] = ids
    for mid, (label, expected, pdf) in MENUS.items():
        if mid not in menus:
            raise SystemExit(f"Menu {mid} ({label}) is no longer shown by any bar")
        m = menus[mid]
        if len(m["items"]) != expected:
            raise SystemExit(f"Menu {mid} ({label}) has {len(m['items'])} dishes, expected {expected}: re-check the menu and this script")
        if m["hide"] != (False, False):
            raise SystemExit(f"Menu {mid} ({label}) hides its allergen icons or filters: allergens can't be read from it")
        names = {p.rsplit("/", 1)[-1] for p in m["pdfs"]}
        if names != {pdf}:
            raise SystemExit(f"Menu {mid} ({label}) now links {sorted(names)}, expected {pdf}: update SOURCE_TITLE and MENUS")
    return menus, venue_menus


def occurrences(menus: dict) -> "OrderedDict[str, list]":
    """Every printed dish, grouped by normalised name, menus in MENUS order; exact duplicates inside one menu are one occurrence."""
    groups: "OrderedDict[str, list]" = OrderedDict()
    for mid in MENUS:
        seen = set()
        for it in menus[mid]["items"]:
            kcal = None
            if it["kcal_text"]:
                mm = re.fullmatch(r"(\d+) KCAL", it["kcal_text"])
                if not mm:
                    raise SystemExit(f"{mid} {it['name']!r}: calories printed as {it['kcal_text']!r}, expected 'NNN KCAL'")
                kcal = int(mm.group(1))
            if str(kcal or 0) != (it["data_calories"] or "0"):
                raise SystemExit(f"{mid} {it['name']!r}: printed {it['kcal_text']!r} but the page's own filter value is {it['data_calories']!r}")
            where = f"{mid} {it['name']!r}"
            c_keys, c_cer, c_nuts = allergen_words(it["contains"], where, EXTRA_WORDS)
            m_keys, _, _ = allergen_words(it["may"], where, EXTRA_WORDS)
            occ = {"menu": mid, "section": it["section"], "sub": it["sub"], "name": it["name"], "desc": it["desc"], "price": it["price"],
                   "kcal": kcal, "dietary": tuple(sorted(it["dietary"])), "contains": frozenset(c_keys), "may": frozenset(m_keys - c_keys),
                   "cereals": frozenset(c_cer), "nuts": frozenset(c_nuts)}
            sig = tuple(sorted((k, str(v)) for k, v in occ.items()))
            if sig in seen:
                continue
            seen.add(sig)
            groups.setdefault(norm(it["name"]), []).append(occ)
    return groups


def build(menus: dict, venue_menus: dict) -> tuple[list, list, dict]:
    venue_names = dict(VENUES)
    groups = occurrences(menus)
    items, holdback = [], []
    stats = {"no_figure": 0, "meat_not_stated": [], "pork": 0, "beef": 0, "vegetarian_contradiction": []}
    for key, occs in groups.items():
        with_kcal = [o for o in occs if o["kcal"] is not None]
        if not with_kcal:
            stats["no_figure"] += 1
            continue
        first = with_kcal[0]
        name = clean_name(first["name"])
        where_printed = lambda o: ", ".join(sorted(venue_names[v].split(" (")[0] for v in menus[o["menu"]]["venues"]))  # noqa: E731
        reasons = []
        kcals = sorted({o["kcal"] for o in with_kcal})
        if len(kcals) > 1:
            reasons.append("the chain's own menus print different calories for it: " +
                           "; ".join(f"{o['kcal']} kcal on the {MENUS[o['menu']][0]} (menu {o['menu']})" for o in with_kcal))
        if len({(o["contains"], o["may"], o["cereals"], o["nuts"]) for o in occs}) > 1:
            reasons.append("the menus that print it show different allergen labels: " +
                           "; ".join(f"{MENUS[o['menu']][0]} ({o['menu']})" for o in occs))
        if any("/" in o["price"] or "double up" in o["price"].lower() for o in with_kcal):
            reasons.append(f"one calorie figure beside several prices ({first['price']!r}); the page doesn't say which size or variant it is for")
        sharing = any(SHARING.search(o["desc"]) for o in occs)
        if len(kcals) == 1 and kcals[0] > PLAUSIBLE_KCAL and not sharing:
            reasons.append(f"printed {kcals[0]} kcal for one portion, more than a day's 2,000 kcal reference intake, and the page doesn't say it is for sharing")
        vegetarian = all(("vegetarian" in o["dietary"] or "vegan" in o["dietary"]) for o in occs)
        # Optional extras ("Add grilled bacon or sausage 2.50") are not part of the dish: tags are read from the text before them.
        text = name + " " + " ".join(re.split(r"\bAdd\b", o["desc"])[0] for o in occs)
        tags = []
        if PORK.search(text) and "wagyu" not in name.lower():
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        animal = bool(set(first["contains"]) & {"fish", "crustaceans", "molluscs"}) or bool(tags)
        if vegetarian and animal:
            # The chain marks the dish vegetarian while its own labels (fish, crustaceans) or description (pork, beef) say otherwise.
            stats["vegetarian_contradiction"].append(name)
            vegetarian = False
        if vegetarian:
            tags.insert(0, "vegetarian")
        if not vegetarian and MEATY.search(text) and not any(t.startswith("contains_") for t in tags):
            stats["meat_not_stated"].append(name)
        serving = ""
        if key in SERVING_TEXT:
            serving, phrase = SERVING_TEXT[key]
            if not any(phrase in o["desc"].lower() for o in occs):
                raise SystemExit(f"{name}: the description no longer says {phrase!r}")
        item_id = slug(name)
        sections = "; ".join(f"{MENUS[o['menu']][0]} ({o['menu']}): {o['section']}" + (f" / {o['sub']}" if o["sub"] else "")
                             + (f", {o['kcal']} kcal" if o["kcal"] is not None else ", no calories printed") for o in occs)
        items.append({
            "id": item_id, "name": name, "category": category_for(first["section"], first["sub"]), "serving": serving,
            "calories": first["kcal"], "tags": "|".join(tags), "rankable": False,
            "notes": f"Printed on: {sections}. Price {first['price']}. Bars: " + "; ".join(sorted({where_printed(o) for o in occs})),
            "allergens": {"contains": set(first["contains"]), "may_contain": set(first["may"]), "cereals": set(first["cereals"]), "nuts": set(first["nuts"])},
        })
        if reasons:
            holdback.append((item_id, "; ".join(reasons)))
        else:
            stats["pork"] += "contains_pork" in tags
            stats["beef"] += "contains_beef" in tags
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Two dishes make the same id: " + str(sorted({i for i in ids if ids.count(i) > 1})))
    stats["published"] = len(items) - len(holdback)
    return items, holdback, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first (about 100 requests, one a second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for venue, _ in VENUES:
            pg.fetch_venue(args.pages, venue)
    menus, venue_menus = load(args.pages)
    items, holdback, stats = build(menus, venue_menus)
    if stats["published"] != EXPECTED_PUBLISHED or len(holdback) != EXPECTED_HELD:
        raise SystemExit(f"The menus changed: {stats['published']} dishes published / {len(holdback)} held back, expected "
                         f"{EXPECTED_PUBLISHED} / {EXPECTED_HELD}. Re-read the held-back list below and update EXPECTED_*.\n" +
                         "\n".join(f"  {i} - {r}" for i, r in holdback))
    guide = {"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Drake & Morgan", cuisine="Cocktail bar", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["drake and morgan", "drake & morgan"],
                             items=items, out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    for mid, (label, _, _) in MENUS.items():
        print(f"menu {mid} {label}: {len(menus[mid]['items'])} dishes at {len(menus[mid]['venues'])} bars, sha256 {menus[mid]['sha256']}")
    combined = hashlib.sha256("".join(menus[m]["sha256"] for m in MENUS).encode()).hexdigest()
    print(f"combined sha256 (menus in MENUS order) {combined}")
    print(f"dishes with no calories on any menu (not listed): {stats['no_figure']}")
    print(f"wrote {len(items)} items to {out}: {stats['published']} published, {len(holdback)} held back")
    for i, r in holdback:
        print(f"  held back {i}: {r}")
    print(f"published with contains_pork {stats['pork']}, contains_beef {stats['beef']}; meat type not stated: {len(stats['meat_not_stated'])}")
    print("marked vegetarian by the chain but not tagged (its own labels or description contradict the mark): " + ", ".join(stats["vegetarian_contradiction"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
