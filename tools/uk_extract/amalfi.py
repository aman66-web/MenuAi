#!/usr/bin/env python3
"""Build data/source/amalfi/ from Amalfi's own menu pages with calories and allergens (hosted by Ten Kites).

    python3 tools/uk_extract/amalfi.py --checked-on 2026-10-09 [--cache DIR] [--report]

Amalfi (Amalfi Ristorante, part of The Big Table Group) lists its restaurants at https://www.amalfi.co.uk/locations: "Explore our four
beautiful locations": Oxford Circus (25 Argyll Street, W1F 7TU), St Paul's (5-14 St. Paul's Churchyard, EC4M 8AY), Woburn Center Parcs
(Woburn Forest, MK45 2HZ) and St Katharine Docks ("Coming Soon"). So three restaurants are open in Great Britain. https://www.amalfi.co.uk/our-menus
links one Ten Kites page to each open restaurant:
    Oxford Circus  https://menus.tenkites.com/thebigtg/amalfi02   (the page's own unit name: "Agryll Street")
    St Paul's      https://menus.tenkites.com/thebigtg/amalfi10   ("St Pauls")
    Woburn         https://menus.tenkites.com/thebigtg/amalfi07   ("CP WOBURN")
robots.txt of menus.tenkites.com disallows only /fonts/, /views/ and *.less; amalfi.co.uk allows everything.

What the pages print: per dish ONE number, the calories ("234 kcal" beside the name and "Energy (kCal)" in the dish's "Nutritional Values:" pop-up;
the page's "Hide Calories" switch does not start switched on, so the calories are shown to every visitor); no protein, carbohydrate, fat, salt,
kJ, fibre or weight. So the chain is published as calories-only. The caption does not say "per portion": the figure is the dish as sold (a
drink's size is given only when its name says so).
Allergens (docs/DATA.md "Allergens"): complete. Each dish's pop-up prints "Contains:" and "May contain:" (cereals and tree nuts named in
brackets) and tenkites_c.allergens_checked stops the run unless they agree with the label ids the page's own allergen filter reads. The older
pop-over template prints no "contains none" message: a dish without a "Contains" line is a dish the page's filter also shows no allergen id for
(Cafe Rouge's pages, read the same way, are published like this). One dish whose printed lines and filter ids disagree is left out (EXPECTED_UNREADABLE).

Three venues, one rule: a menu tab is used only if at least two venue pages carry it, and a dish is published only if its section, name,
calories and allergen lines are identical on every venue page that carries the tab (anything else is listed in the run's report and left
out; nothing is chosen between). On 2026-10-09 the three pages were identical on every shared tab (Main Menu 76 dishes, Desserts 13, Kids 32,
Drinks 166, Brunch 46 on Oxford Circus and St Paul's). The Main Menu also agrees, dish by dish, with the schema.org menu the same pages embed.

What is left out, and why (each is counted in the run's report):
- Tabs on one venue only: Breakfast (St Paul's), Christmas Day and Children's Christmas Day (Woburn): single-venue or seasonal.
- Afternoon Tea (St Paul's and Woburn): one set of sandwiches, scones and cakes shared by an unstated number of people (3,370 kcal), with hot
  drinks whose rows carry placeholder allergens: the portion is unclear.
- Spirits, liqueurs and gin and tonic (Gin and Tonic, Vodka, Rum, Whisky and Brandy, After-Dinner): no measure is stated and several figures are
  impossible on their face (a whisky at 1211 kcal, a gin at 0 kcal, 6 kcal for a vodka); wines print no calories at all.
- Dishes without calories (the page prints no figure, e.g. most cocktails and every wine) and the "Gelato / Sorbet" heading row.
- Held back (holdback.csv), never corrected: rows that print 12 or more of the 14 allergens as "Contains" for a drink or hot drink with a calorie
  figure (the page's placeholder for allergen data that was never entered), a pint of beer at 1977 kcal, and products the same page prints twice with different
  figures (Aperol Spritz 180 vs 154 at bottomless brunch; Fever-Tree Light tonic 36 vs 30).
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import amalfi_pages as ap  # noqa: E402
import tenkites_a as ta  # noqa: E402  (tidy_name)
import tenkites_c as tk  # noqa: E402  (meat_tags)
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "amalfi"
# (folder, Ten Kites code, venue, unit name the page gives itself, tabs the page must list, in order)
VENUES = [
    ("oxford", "amalfi02", "Oxford Circus", "Agryll Street", ["Main Menu", "Brunch", "Desserts", "Kids", "DRINKS"]),
    ("stpauls", "amalfi10", "St Paul's", "St Pauls", ["Main Menu", "Breakfast", "Desserts", "Kids", "DRINKS", "Brunch", "Afternoon Tea"]),
    ("woburn", "amalfi07", "Woburn Center Parcs", "CP WOBURN",
     ["Main Menu", "Desserts", "Kids", "DRINKS", "Afternoon Tea", "Christmas Day", "Children’s Christmas Day Menu"]),
]
TABS = OrderedDict([
    ("Main Menu", "use"), ("Desserts", "use"), ("Kids", "use"), ("DRINKS", "use"), ("Brunch", "use"),
    ("Breakfast", "St Paul's only (single-venue)"),
    ("Afternoon Tea", "a set for sharing with no stated number of people (3,370 kcal), plus hot-drink rows with placeholder allergens"),
    ("Christmas Day", "Woburn only, Christmas Day only (seasonal pre-booked menu)"),
    ("Children’s Christmas Day Menu", "Woburn only, Christmas Day only (seasonal pre-booked menu)"),
])
# dishes each tab must hold on every venue page that carries it: the script stops if the menu changes
EXPECTED = {"Main Menu": 76, "Desserts": 13, "Kids": 32, "DRINKS": 166, "Brunch": 46}
# the only dish whose printed allergen lines disagree with the page's own allergen filter (it is left out, never repaired)
EXPECTED_UNREADABLE = {"CRISPY FISH GOUJONS"}

SOURCE_URL = ap.BASE + "amalfi02"
SOURCE_TITLE = ("Amalfi menus with calories and allergens (Ten Kites pages linked from amalfi.co.uk/our-menus for Oxford Circus, St Paul's and "
                "Woburn Center Parcs): Main, Desserts, Kids, Drinks and Brunch (accessed 2026-10-09, no date shown)")
ALLERGEN_TITLE = ("Amalfi menus with allergens (Ten Kites, amalfi02): per-dish 'Contains' and 'May contain' on the same pages "
                  "(accessed 2026-10-09, no date shown)")
NOTE = ("Calories only, as printed on Amalfi's own menu pages for the dish as sold (no protein, carbs or fat); identical on every open "
        "restaurant page that carries the menu. Sides, sauces and extras are separate rows: add them yourself. Spirits, wine, afternoon "
        "tea and breakfast-only dishes are not included.")
assert len(NOTE) < 400
ALIASES = ["amalfi", "amalfi ristorante", "amalfi restaurant", "amalfi oxford circus", "amalfi st paul's", "amalfi woburn"]

ADDONS = "Add-ons & extras"
CATEGORY_ORDER = ["For the table", "Antipasti", "Pizza", "Pasta & risotto", "Secondi", "Sides", "Desserts", ADDONS,
                  "Kids: Starters", "Kids: Mains", "Kids: Desserts", "Kids: Drinks",
                  "Drinks: Cocktails", "Drinks: Non-alcoholic cocktails", "Drinks: Sparkling & champagne", "Drinks: Beer & cider",
                  "Drinks: Soft drinks", "Drinks: Hot drinks"]
SECTION_CATEGORY = {   # printed first-level section -> (category, rankable); sections not listed stop the run
    "Main Menu": {"FOR THE TABLE": ("For the table", False), "ANTIPASTI": ("Antipasti", False),
                  "STONE BAKED SOURDOUGH PIZZA": ("Pizza", True), "ADDITIONAL TOPPINGS": (ADDONS, False),
                  "PASTA & RISOTTO": ("Pasta & risotto", True), "SECONDI": ("Secondi", True), "SIDE": ("Sides", False)},
    "Desserts": {"DESSERTS": ("Desserts", False), "Off the Menu": ("Desserts", False)},
    "Kids": {"STARTERS": ("Kids: Starters", False), "MAIN COURSE": ("Kids: Mains", False), "DESSERTS": ("Kids: Desserts", False),
             "DRINKS": ("Kids: Drinks", False)},
    "Brunch": {"PICK YOUR BOTTOMLESS BEVERAGE": ("Drinks: Sparkling & champagne", False), "STARTERS": ("Antipasti", False),
               "PIZZA": ("Pizza", True), "PASTA": ("Pasta & risotto", True), "ADDITIONAL TOPPINGS": (ADDONS, False),
               "ADD A SIDE": ("Sides", False), "ADD DESSERT": ("Desserts", False)},
    "DRINKS": {"Christmas Specials": ("Drinks: Cocktails", False), "Cocktails": ("Drinks: Cocktails", False),
               "Non-Alcoholic Cocktails": ("Drinks: Non-alcoholic cocktails", False), "Champagne": ("Drinks: Sparkling & champagne", False),
               "Sparkling": ("Drinks: Sparkling & champagne", False), "Draught Beer": ("Drinks: Beer & cider", False),
               "Cider": ("Drinks: Beer & cider", False), "Soft Drinks": ("Drinks: Soft drinks", False),
               "Hot Drinks": ("Drinks: Hot drinks", False)},
}
SKIPPED_SECTIONS = {   # first-level drinks sections left out: no measure is stated (and several figures are impossible)
    "DRINKS": {"Gin and Tonic", "Vodka", "Rum", "Whisky and Brandy", "After-Dinner", "Dessert Wine", "Rose Wine", "White Wine", "Red Wine"},
}
SKIP_REASON = {"Gin and Tonic": "spirit with no stated measure", "Vodka": "spirit with no stated measure", "Rum": "spirit with no stated measure",
               "Whisky and Brandy": "spirit with no stated measure", "After-Dinner": "liqueur with no stated measure"}
PLAIN_BLOCKS = {"bottled beer", "herbal teas", "juice", "espresso", "coffee", "tea"}   # the option alone names the drink
GELATO_FLAVOURS = {"Chocolate", "Strawberry", "Vanilla", "Mango", "Pistachio", "Honeycomb"}
SIZE = re.compile(r"^(\d+\s?(ml|cl)( glass)?|small|large|regular|single|double|bottle|btl|half pint|pint)$", re.I)
ALL_FOURTEEN = set(ta.ALLERGEN_KEYS)
PLACEHOLDER_ALLERGENS = 12     # a drink or dish marked as containing 12 or more of the 14 allergens is the page's placeholder for "not entered"
ta._SMALL_WORDS.add("di")    # in this process only: 'Ravioli di Carne'

# rows held back by name (checked on every run: a name that is no longer an item stops the run)
HOLD_NAMES = {
    "Aperol Spritz": "The same page prints Aperol Spritz at 180 kcal (Cocktails) and at 154 kcal (bottomless brunch): the chain's own page disagrees with itself, so neither is published.",
    "Aperol Spritz (Bottomless Brunch)": "The same page prints Aperol Spritz at 180 kcal (Cocktails) and at 154 kcal (bottomless brunch): the chain's own page disagrees with itself, so neither is published.",
    "Fever-Tree Tonic: Light": "The same page prints the Light tonic at 36 kcal (Soft Drinks) and at 30 kcal (the tonic choices for a gin and tonic): the chain's own page disagrees with itself.",
    "Birre Amalfi (Pint)": "The brunch menu prints 1977 kcal for a pint of beer, which cannot be right (the same page prints 139 kcal for a bottled Birra Moretti); not corrected.",
}


def cname(raw: str) -> str:
    """The page's own phrasing tidied: bullets and 'ask for' wording removed, ALL CAPS tamed. No number is ever touched."""
    n = ta.tidy_name(raw.replace("\u2018", "'"))
    n = re.sub(r"^ask for\s+", "", n, flags=re.I)
    n = re.sub(r"\s+-\s+ask for gluten[- ]free$", " (Gluten-Free)", n, flags=re.I)
    n = re.sub(r"\s+-\s+(gluten[- ]free|vegan)$", lambda m: " (Gluten-Free)" if m.group(1).lower().startswith("gluten") else " (Vegan)", n, flags=re.I)
    n = re.sub(r"\s{2,}", " ", n).strip()
    return n[:1].upper() + n[1:]


def sig(row: dict) -> tuple:
    return (row["section"], row["block"], row["heading"], row["name"], ap.calories(row)[0], repr(row["contains"]), repr(row["may"]),
            tuple(row["suitable"]))


# ---------------------------------------------------------------- classification
def classify(tab: str, row: dict):
    """-> ("skip", reason) or {"name", "category", "rankable", "serving", "limited_time"}."""
    first = row["section"].split(" > ")[0]
    if first in SKIPPED_SECTIONS.get(tab, ()):
        return ("skip", SKIP_REASON.get(first, "wine: no calories printed"))
    if first not in SECTION_CATEGORY[tab]:
        raise SystemExit("%s: section %r of %r is new: decide for it in SECTION_CATEGORY" % (tab, first, row["name"]))
    cat, rankable = SECTION_CATEGORY[tab][first]
    nm = cname(row["name"])
    block = cname(row["block"]) if row["block"] else ""
    heading = row["heading"].strip()
    spec = {"category": cat, "rankable": rankable, "serving": "", "limited_time": False, "name": nm}
    if first in ("Off the Menu", "Christmas Specials"):
        spec["limited_time"] = True

    if tab == "DRINKS" or (tab == "Brunch" and first == "PICK YOUR BOTTOMLESS BEVERAGE"):
        opt = nm.lstrip("- ").strip()
        if block and SIZE.match(opt):
            spec.update(name="%s (%s)" % (block, opt), serving=opt)
        elif block and block.lower() not in PLAIN_BLOCKS and block.lower() != opt.lower() and block.lower() not in opt.lower() \
                and opt.lower() not in block.lower():
            spec["name"] = "%s: %s" % (block, opt)
        else:
            spec["name"] = opt
        if first == "Christmas Specials" and "no-jito" in nm.lower():
            spec["category"] = "Drinks: Non-alcoholic cocktails"
        return spec

    if tab == "Kids":
        spec["name"] = nm.lstrip("- ").strip()
        if first == "MAIN COURSE" and heading.startswith("Add two toppings"):
            spec.update(category=ADDONS, rankable=False, name="%s (kids topping)" % spec["name"])
        elif first == "DESSERTS" and block in ("Ice Lolly", "Gelato"):
            spec["name"] = "%s: %s" % ("Ice Lolly" if block == "Ice Lolly" else "Gelato", spec["name"])
        return spec

    if tab in ("Desserts", "Brunch") and first in ("DESSERTS", "ADD DESSERT") and nm in GELATO_FLAVOURS:
        spec["name"] = "Gelato / Sorbet: %s" % nm
        return spec

    # food: Main Menu, Brunch (food), Desserts
    if heading:
        if heading.startswith("Add"):
            spec.update(category=ADDONS, rankable=False, name="%s (add-on)" % nm)
        elif heading.startswith(("Enjoy with", "Served with", "Or upgrade")):
            spec.update(category="Sides", rankable=False)
        else:
            raise SystemExit("%s: option heading %r of %r is new: decide for it in classify()" % (tab, heading, nm))
    elif first == "ADDITIONAL TOPPINGS":
        spec["name"] = "%s (topping)" % nm
    return spec


def build_items(rows_by_tab: "dict[str, list[dict]]", stats: Counter, report: list) -> list:
    items = []
    for tab, rows in rows_by_tab.items():
        for r in rows:
            spec = classify(tab, r)
            if isinstance(spec, tuple):
                stats["left out: " + spec[1]] += 1
                continue
            kcal, problem = ap.calories(r)
            if problem:
                raise SystemExit(problem)
            if not kcal:
                stats["no calories printed"] += 1
                continue
            where = "%s > %s > %s" % (tab, r["section"], r["name"])
            try:
                alg = ap.allergens(r, where)
            except SystemExit as exc:
                if r["name"] not in EXPECTED_UNREADABLE:
                    raise
                stats["left out: printed allergens disagree with the page's own filter"] += 1
                report.append("left out %s: %s" % (r["name"], exc))
                continue
            if alg is None:
                raise SystemExit("%s: the dish carries no label ids to check its allergens against" % where)
            veg = any(s.lower() in ("vegetarian", "vegan") for s in r["suitable"])
            tags, unspecified = tk.meat_tags(spec["name"], r["desc"], r["block"], vegetarian=veg)
            if veg:
                tags = ["vegetarian"]
            note = "Source: %s > %s" % (tab, r["section"]) + (" > %s" % r["block"] if r["block"] else "") + (" > %s" % r["heading"] if r["heading"] else "")
            items.append({"name": spec["name"], "category": spec["category"], "serving": spec["serving"], "calories": kcal,
                          "tags": "|".join(tags), "limited_time": spec["limited_time"], "rankable": spec["rankable"], "notes": note,
                          "allergens": alg, "_unstated": unspecified, "_row": r, "_tab": tab})
    return items


def settle_names(items: list, report: list) -> list:
    """Drop exact duplicates (same name, calories, allergens); tell apart same-name rows with different figures by their menu."""
    kept, seen = [], {}
    for it in items:
        key = (it["name"].lower(), it["calories"], repr(sorted((k, sorted(v)) for k, v in it["allergens"].items())))
        if key in seen:
            continue
        seen[key] = it
        kept.append(it)
    groups: dict = {}
    for it in kept:
        groups.setdefault(it["name"].lower(), []).append(it)
    for group in groups.values():
        if len(group) < 2:
            continue
        labels = []
        for it in group:
            tab, sec = it["_tab"], it["_row"]["section"].split(" > ")[0]
            labels.append("kids" if tab == "Kids" else ("Bottomless Brunch" if tab == "Brunch" and sec.startswith("PICK") else ""))
        if labels.count("") > 1:      # several plain members: tell them apart by their section
            labels = [l or it["_row"]["section"].split(" > ")[0].title() for l, it in zip(labels, group)]
        if len([l for l in labels if l]) != len(set(l for l in labels if l)) or len(set(labels)) != len(group):
            raise SystemExit("names still clash: %s (add rules to the script)" % [g["name"] for g in group])
        for it, label in zip(group, labels):
            if label:
                old = it["name"]
                it["name"] = "%s (%s)" % (old, label)
                report.append("renamed to tell apart: %s -> %s" % (old, it["name"]))
    names = [i["name"].lower() for i in kept]
    clashes = sorted({n for n in names if names.count(n) > 1})
    if clashes:
        raise SystemExit("names clash after renaming: %s" % clashes[:8])
    return kept


def main() -> int:
    parser = argparse.ArgumentParser(description="Build data/source/amalfi/ from Amalfi's Ten Kites menu pages")
    parser.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "tenkites" / CHAIN_ID,
                        help="folder for the downloaded pages (one sub-folder per venue; downloaded once, 1 request/second, reused later)")
    parser.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    parser.add_argument("--report", action="store_true")
    args = parser.parse_args()

    # ---- read every venue page
    per_venue: dict = {}
    hashes = []
    for folder, code, venue, unit, tabs_expected in VENUES:
        cache = ap.fetch_menus(code, args.cache / folder)
        names = [n for n, _ in cache]
        if names != tabs_expected:
            print("The tab bar of %s (%s) changed: %s, expected %s. Decide for each tab in TABS." % (venue, code, names, tabs_expected), file=sys.stderr)
            return 1
        unknown = [n for n in names if n not in TABS]
        if unknown:
            print("%s: new tab(s) %s: decide in TABS" % (venue, unknown), file=sys.stderr)
            return 1
        per_venue[venue] = {}
        for tab, path in cache:
            text = path.read_text(encoding="utf-8")
            info, tog = ap.unit_info(text), ap.toggle_info(text)
            if info["code"] != "thebigtg/" + code or info["unit"] != unit:
                print("%s: the page says it is %s / %s, not %s / %s" % (path, info["code"], info["unit"], "thebigtg/" + code, unit), file=sys.stderr)
                return 1
            if tog["starts_on"]:
                print("%s: the 'Hide Calories' switch now starts switched on: the calories are hidden by default, decide before publishing" % path, file=sys.stderr)
                return 1
            hashes.append(("%s/%s" % (code, tab), ap.sha256_file(path)))
            if TABS[tab] == "use":
                per_venue[venue][tab] = ap.read_menu(text, tab)
    stats: Counter = Counter()
    report: list = []

    # ---- the venue rule: a tab on at least two venue pages; a dish identical on every page that carries the tab
    rows_by_tab: "OrderedDict[str, list]" = OrderedDict()
    for tab in TABS:
        if TABS[tab] != "use":
            continue
        carriers = [(v, per_venue[v][tab]) for v in per_venue if tab in per_venue[v]]
        for v, rows in carriers:
            if len(rows) != EXPECTED[tab]:
                print("Tab %r on %s holds %d dishes but this script expects %d: the menu changed, re-check the rules." % (tab, v, len(rows), EXPECTED[tab]), file=sys.stderr)
                return 1
        if len(carriers) < 2:
            print("Tab %r is on one venue only: decide in TABS" % tab, file=sys.stderr)
            return 1
        counts = [Counter(sig(r) for r in rows) for _, rows in carriers]
        common = counts[0]
        for c in counts[1:]:
            common = common & c
        agreed = []
        for r in carriers[0][1]:
            s = sig(r)
            if common[s] > 0:
                common[s] -= 1
                agreed.append(r)
            else:
                stats["left out: not identical on every venue page"] += 1
                report.append("tab %s: %r is not identical on all %d venue pages" % (tab, r["name"], len(carriers)))
        rows_by_tab[tab] = agreed
        stats["tab %s: venues carrying it" % tab] = len(carriers)

    # ---- items
    items = settle_names(build_items(rows_by_tab, stats, report), report)
    rows_total = sum(len(v) for v in rows_by_tab.values())
    by_name = {i["name"]: i for i in items}
    holds = []
    for item_name, reason in HOLD_NAMES.items():
        if item_name not in by_name:
            print("holdback names %r, which is not an item any more" % item_name, file=sys.stderr)
            return 1
        holds.append((slug(item_name), reason))
    held = {slug(n) for n in HOLD_NAMES}
    for it in items:
        if len(it["allergens"]["contains"] & ALL_FOURTEEN) >= PLACEHOLDER_ALLERGENS and slug(it["name"]) not in held:
            holds.append((slug(it["name"]), "The page prints %d of the 14 allergens as 'Contains' for a drink or dish with a calorie figure: allergen row contradicts the item "
                                            "(the page's placeholder for allergen data that was not entered); not corrected." % len(it["allergens"]["contains"] & ALL_FOURTEEN)))
            held.add(slug(it["name"]))
    ids = [slug(i["name"]) for i in items]
    assert len(set(ids)) == len(ids), "two items would get the same id"
    if not holds:
        (Path(args.out) / "holdback.csv").unlink(missing_ok=True)
    public = [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]
    out = write_chain_folder(chain_id=CHAIN_ID, name="Amalfi", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=public, out=args.out, note=NOTE, holdback=holds,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True},
                             nutrition_level="calories")
    print("wrote %d items to %s (%d held back) from %d agreed dish rows" % (len(items), out, len(holds), rows_total))
    print("by category:", dict(Counter(i["category"] for i in items)))
    print("counts:", dict(stats))
    for name, digest in hashes:
        print("page %s sha256 %s" % (name, digest))
    print("meat type not stated: %d" % sum(1 for i in items if i["_unstated"]), [i["name"] for i in items if i["_unstated"]])
    for line in report:
        print("note:", line)
    if args.report:
        print("-- held back:")
        for item_id, reason in holds:
            print("  ", item_id, "::", reason[:110])
        print("-- items:")
        for it in items:
            print("  ", it["category"], "|", it["name"], "|", it["calories"], "|", it["tags"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
