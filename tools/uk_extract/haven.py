#!/usr/bin/env python3
"""Build data/source/haven/ from Haven's own "menu allergy and nutritional information guide" (a CALORIES-ONLY chain with complete allergens).

    python3 tools/uk_extract/haven.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the saved pages named 00.html ... 18.html (one per menu, in the order of the guide's menu picker). --fetch downloads them first:
the guide page, then each other menu as <guide page>?mguid=<menu id> (the page shows one menu at a time), one request per second.

Source (linked from https://www.haven.com/discover/food-and-drink as "menu allergy and nutritional information guide", which "highlights
all of the key facts about our dishes served in each of our holiday parks' main restaurants"):
    https://viewthe.menu/1afv   (Ten Kites page; robots.txt disallows only /fonts/, /views/ and *.less)
It holds 19 menus (see MENUS). Each dish prints its calories beside its name ("( 498 kcal )"), a column per allergen (tick = contains,
M = may contain), Vegan / Vegetarian columns, and in the opened row the same facts in words. NOTHING else is published: no protein, carbs,
fat, salt, kJ or weights. So `nutrition_level = calories`: protein, carbs and fat stay blank; every item is not rankable.

Which menus and rows are published (written down so a monthly re-run keeps the same rules):
  Published   Breakfast, Main, Kids, Sunday, NGCI, Dark Kitchen, Perfect Match, Ice cream, Cake counter, Cakery, Pizza menu, Night menu
              (June 2026) and the Festive, Christmas Day, Christmas Day NGCI and Halloween Specials menus (limited time).
  Left out    "Pizza deck (Hafan y Mor & Seashore)": two parks only. "Pizza Trial 2026": a trial. Sections for one venue type or group only:
              "Rotisserie/CH ONLY", "Coast house only", "Coasthouse Only" (Coast House is one of the park venue types) and the "Owners Exclusive"
              drinks (caravan owners). "Prep Recipes" sections (kitchen sub-recipes, not sold). Rows with no calories printed (most alcoholic
              drinks, "Bubblegum" ice cream, the Costa notice). On the Master Drinks menu, every drink whose name does not state its size
              (Regular, Large, Dash, Glass, Pitcher, a whole wine with no volume): only drinks naming a pint or a volume (330ml, 25ml) are
              kept. The Halloween cocktails and mocktails (Glass / Pitcher, no volume).
              Rows whose printed name is the same as another row's with a different figure and no way to tell them apart (the Scones, the six
              Dark Kitchen Chicken Wings, bacon pancakes): see AMBIGUOUS.
  Not opened  The three pop-up menus haven.com links on Ten Kites (Beach Burger, Seaside Treats, Bertie's): "what's available" depends on the park.

Names are copied as printed (whitespace tidied; ALL CAPS names written in normal case). The same dish printed on several menus with the same
calories and the same allergens is published once, under the first menu that prints it. Where one name is printed with different figures
or allergens, the variants are told apart by their section or menu in brackets, or by VARIANT_NAMES (written by hand from the dish's own
printed description). Hand-written names are listed in VARIANT_NAMES; the script stops if two published items would share a name.

Allergens (docs/DATA.md): complete for every published item. The Contains / May contain lines, the allergen columns and the label ids the page's
own allergen filter reads must agree (haven_pages.allergens_for); a disagreement stops the run. "Gluten Free Oats" / "Gluten Free Barley" are
labels Haven prints beside (not inside) "Cereals Containing Gluten"; they are not among the 14 allergens, so they are not shown (note.txt says so).
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from collections import OrderedDict, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import haven_pages as hp  # noqa: E402
import tenkites_c as tc  # noqa: E402
from common import write_chain_folder  # noqa: E402

CHAIN_ID = "haven"
SOURCE_URL = "https://viewthe.menu/1afv"
SOURCE_TITLE = ("Haven menu allergy and nutritional information guide for the main restaurants (viewthe.menu/1afv; menus titled June 2026, "
                "festive 2026, Christmas Day 2026 and Halloween 2026; accessed {checked}, no date shown)")
ALLERGEN_GUIDE_TITLE = "Haven menu allergy and nutritional information guide (viewthe.menu/1afv: Contains / May contain per dish, menus June 2026)"
MAY_CONTAIN_PUBLISHED = True
ALIASES = ["haven", "haven holidays", "haven holiday parks", "haven parks", "mash and barrel", "mash & barrel", "coast house"]
NOTE = ("Calories only, per dish as served (Haven prints no protein, carbs or fat). Dishes and menus vary by park: Coast House-only lines, the "
        "two-park pizza deck, a pizza trial, owners' drinks and drinks with no stated size are left out. Gluten-free oats/barley labels are not shown.")

# (picker index, printed name with spaces tidied, label used in category names, published?, limited time?)
MENUS = [
    (0, "MAIN RESTAURANT - JUNE - 2026 - BREAKFAST", "Breakfast", True, False),
    (1, "MAIN RESTAURANT - JUNE - 2026 - MAIN MENU", "Main menu", True, False),
    (2, "MAIN RESTAURANT - JUNE - 2026 - KIDS MENU", "Kids menu", True, False),
    (3, "MAIN RESTAURANT - JUNE - 2026 - SUNDAY MENU", "Sunday menu", True, False),
    (4, "MAIN RESTAURANT - JUNE - 2026 - NGCI", "NGCI menu", True, False),
    (5, "DARK KITCHEN - JUNE - 2026", "Dark Kitchen", True, False),
    (6, "MAIN RESTAURANT - THE PERFECT MATCH - JUNE - 2026", "Perfect Match", True, False),
    (7, "MAIN RESTAURANT - ICE CREAM - JUNE - 2026", "Ice cream", True, False),
    (8, "MAIN RESTAURANT - CAKE COUNTER - JUNE - 2026", "Cake counter", True, False),
    (9, "MAIN RESTAURANT - CAKERY - JUNE - 2026", "Cakery", True, False),
    (10, "MAIN RESTAURANT - PIZZA MENU - 2026", "Pizza menu", True, False),
    (11, "GLENDOWER FOOD - FESTIVE - 2026 - MAIN MENU", "Festive menu", True, True),
    (12, "MAIN RESTAURANT - PIZZA DECK - JUNE - 2026 (HAFAN Y MOR & SEASHORE)", "Pizza deck", False, False),
    (13, "MAIN RESTAURANT - JUNE - 2026 - NIGHT MENU", "Night menu", True, False),
    (14, "Haven - Pizza Trial - 2026", "Pizza trial", False, False),
    (15, "HAVEN - MASTER DRINKS MENU - JUNE 2026", "Drinks", True, False),
    (16, "XMAS DAY - 2026", "Christmas Day", True, True),
    (17, "XMAS DAY - 2026 - NGCI", "Christmas Day NGCI", True, True),
    (18, "Halloween Specials Food & Drink", "Halloween", True, True),
]
# Where a dish printed on several menus is filed: the first of these menus that prints it (the shared menus first, the niche and
# limited-time ones last).
PRIORITY = [7, 8, 9, 0, 1, 2, 3, 10, 13, 4, 5, 6, 15, 11, 16, 17, 18]
EXCLUDED_SECTIONS = re.compile(r"prep recipes|\bch only\b|coast ?house only|owners exclusive", re.I)
DRINK_MENU = 15
HALLOWEEN_MENU = 18
HALLOWEEN_DRINK_SECTIONS = {"Cocktails", "O.O% Cocktails", "Mocktail", "Cocktail Supreme", "Mocktail - Cocktail Supreme"}
VOLUME = re.compile(r"\b\d+(?:\.\d+)?\s?(?:ml|cl)\b|\bpint\b", re.I)   # a drink's size, stated in its own name

# Hand-written names: (printed name lower-case, printed calories) -> (name, a menu index the dish must also be printed in or None, why).
# Every one comes from the dish's own printed description / menu. The script stops if the description or the menu differs.
VARIANT_NAMES = {
    ("big breakfast - fried egg, brown toast", "1072"): ("Big Breakfast - fried egg, white toast", None, "white toast"),
    ("bacon roll", "477"): ("Bacon Roll (gluten free bun available)", None, "gluten free bun available"),
    ("pancakes with maple flavoured syrup", "246"): ("Pancakes with maple flavoured syrup (Kids menu)", 2, ""),
    ("pancakes with strawberries & yoghurt", "224"): ("Pancakes With Strawberries & Yoghurt (Kids menu)", 2, ""),
    ("pancakes with chocolate spread & strawberries", "374"): ("Pancakes with chocolate spread & strawberries (Kids menu)", 2, ""),
    ("with mushy peas", "1099"): ("Hand-battered fish and chips with mushy peas", None, "Hand Battered fish fillet"),
    ("with peas", "1062"): ("Hand-battered fish and chips with peas", None, "Hand battered fish fillet"),
    ("chocolate fudge cake (v)", "567"): ("Chocolate Fudge Cake (V) with vanilla pod ice cream", None, "vanilla pod ice cream"),
    ("chocolate fudge cake (v)", "587"): ("Chocolate Fudge Cake (V) with hot custard or vanilla ice cream", None, "hot custard or vanilla ice cream"),
    ("kids penne pomodoro", "269"): ("Kids Penne Pomodoro (vegan sheese)", None, "vegan sheese"),
    ("mushroom bourguignon pie", "964"): ("Mushroom Bourguignon Pie (vegan)", None, "Roasted potatoes"),
    ("sticky toffee christmas pudding", "570"): ("Sticky Toffee Christmas Pudding with custard", None, "custard"),
    ("sticky toffee christmas pudding", "500"): ("Sticky Toffee Christmas Pudding with vanilla ice cream", None, "vanilla ice cream"),
    ("sticky toffee pudding (v) (ngci)", "701"): ("Sticky Toffee pudding (V) (NGCI) with custard", None, "custard"),
    ("sticky toffee pudding (v) (ngci)", "631"): ("Sticky Toffee pudding (V) (NGCI) with vanilla ice cream", None, "vanilla ice cream"),
    ("sticky toffee pudding (v) (ngci)", "365"): ("Sticky Toffee pudding (V) (NGCI) with vanilla pod ice cream", None, "vanilla pod ice cream"),
    ("baked beans", "432"): ("Baked Beans Jacket Potato", None, "jacket potato"),   # printed "Baked Beans" under Lite Bites, described as a jacket potato
    ("hf26 core hot honey chicken burger", "1330"): ("Hot Honey Chicken Burger", None, "hot honey sauce"),   # drops the kitchen code "HF26 CORE"
}
# Printed with the same name as another row and a different figure, and nothing on the page tells them apart: not published.
AMBIGUOUS = {
    ("pancakes with bacon and maple flavoured syrup", "713"): "same name and description as the 393 kcal row",
    ("pancakes with bacon and maple flavoured syrup", "393"): "same name and description as the 713 kcal row",
    ("chicken wings", "1462"): "Dark Kitchen prints six 'Chicken Wings' (three figures per sauce) with no size",
    ("chicken wings", "794"): "Dark Kitchen prints six 'Chicken Wings' (three figures per sauce) with no size",
    ("chicken wings", "1128"): "Dark Kitchen prints six 'Chicken Wings' (three figures per sauce) with no size",
    ("chicken wings", "1262"): "Dark Kitchen prints six 'Chicken Wings' (three figures per sauce) with no size",
    ("chicken wings", "694"): "Dark Kitchen prints six 'Chicken Wings' (three figures per sauce) with no size",
    ("chicken wings", "978"): "Dark Kitchen prints six 'Chicken Wings' (three figures per sauce) with no size",
    ("with clotted cream and strawberry jam", "683"): "scone: fragment name, two figures (683, 688) for the same text",
    ("with clotted cream and strawberry jam", "688"): "scone: fragment name, two figures (683, 688) for the same text",
    ("with butter and strawberry jam", "495"): "scone: fragment name, two figures (495, 499) for the same text",
    ("with butter and strawberry jam", "499"): "scone: fragment name, two figures (495, 499) for the same text",
}
# Printed figures that look odd; entered exactly as printed (nothing is corrected) and reported.
ANOMALIES = {("breezer watermelon 275ml", "534"): "534 kcal for a 275 ml bottle is high next to the other bottles on the menu"}
KEEP_UPPER = {"BBQ", "NGCI", "PET", "RTD", "V", "VE", "UK", "TV", "KFC"}


def tidy(name: str) -> str:
    name = re.sub(r"\s+", " ", name).strip().rstrip(",").strip()
    name = name.replace(" ®", "®")
    letters = [c for c in name if c.isalpha()]
    if letters and all(c.isupper() for c in letters):   # ALL CAPS -> normal case ("TURTLE SPLASH", "CHERRY HOOCH 440ML CAN")
        words = []
        for w in name.split(" "):
            core = re.sub(r"[^A-Za-z]", "", w)
            if core in KEEP_UPPER or (any(c.isdigit() for c in w) and not core.replace("ML", "").replace("CL", "")):
                words.append(w if core in KEEP_UPPER else w.lower())
            elif re.fullmatch(r"\d+(?:\.\d+)?(?:ML|CL)", w):
                words.append(w.lower())
            else:
                words.append(w[:1].upper() + w[1:].lower())
        name = " ".join(words)
    return name


def section_short(section: str) -> str:
    s = section.split(" - ")[0].strip()
    return s[:1].upper() + s[1:]


def menu_label(idx: int) -> str:
    return next(m[2] for m in MENUS if m[0] == idx)


def fetch_pages(pages: Path) -> None:
    pages.mkdir(parents=True, exist_ok=True)
    first = pages / "00.html"
    tc.fetch(SOURCE_URL, first)
    picker = hp.menu_list(first.read_text(encoding="utf-8"))
    for idx, ident, _ in picker:
        if idx != 0:
            tc.fetch(f"{SOURCE_URL}?mguid={ident}", pages / f"{idx:02d}.html")


def read_all(pages: Path) -> tuple:
    texts = {}
    for idx, *_ in MENUS:
        f = pages / f"{idx:02d}.html"
        if not f.exists():
            raise SystemExit(f"{f} is missing: run with --fetch")
        texts[idx] = f.read_text(encoding="utf-8")
    picker = hp.menu_list(texts[0])
    got = [(i, " ".join(tc.html.unescape(n).split())) for i, _, n in picker]
    want = [(m[0], " ".join(m[1].split())) for m in MENUS]
    if got != want:
        raise SystemExit(f"The guide's menu list changed.\n  now:      {got}\n  expected: {want}\nRe-read the new menus, update MENUS and the rules, then run again.")
    ids = {i: ident for i, ident, _ in picker}
    menus = {}
    for idx, text in texts.items():
        m = hp.read_menu(text)
        if " ".join(m["title"].split()) != " ".join(tc.html.unescape(dict((i, n) for i, _, n in picker)[idx]).split()):
            raise SystemExit(f"{idx:02d}.html holds {m['title']!r}, not the menu the picker lists at index {idx}")
        if m["identifier"] != ids[idx]:
            raise SystemExit(f"{idx:02d}.html shows menu id {m['identifier']}, the picker says {ids[idx]}")
        menus[idx] = m
    return menus, texts


def allergen_key(a: dict, suitable: set) -> tuple:
    return (tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])), tuple(sorted(suitable)))


def collect(menus: dict) -> tuple:
    """Rows kept, as variants (same name, calories and allergens = one variant), plus counts of what was left out and why."""
    left = defaultdict(int)
    variants: "OrderedDict" = OrderedDict()
    for idx, _, label, published, limited in MENUS:
        m = menus[idx]
        for pos, r in enumerate(m["rows"]):
            name = tidy(r["name"])
            if not published:
                left["menu not published (pizza deck, pizza trial)"] += 1
                continue
            if EXCLUDED_SECTIONS.search(r["section"]):
                left["venue-specific / owners / prep-recipe sections"] += 1
                continue
            if r["kcal"] == "":
                left["no calories printed"] += 1
                continue
            if tc.printed(r["kcal_attr"]) != r["kcal"]:
                raise SystemExit(f"{m['title']} / {name}: shown calories {r['kcal']} differ from the row's data-calories {r['kcal_attr']}")
            if idx == DRINK_MENU and not VOLUME.search(name):
                left["Master Drinks menu: size not stated in the name"] += 1
                continue
            if idx == HALLOWEEN_MENU and r["section"] in HALLOWEEN_DRINK_SECTIONS:
                left["Halloween cocktails/mocktails: no volume stated"] += 1
                continue
            alg = hp.allergens_for(r, m["filter"])
            suitable = hp.suitable_marks(r)
            key = (name.lower(), r["kcal"], allergen_key(alg, suitable))
            v = variants.get(key)
            if v is None:
                v = variants[key] = {"printed": name, "kcal": r["kcal"], "alg": alg, "suitable": suitable, "desc": r["desc"],
                                     "appears": [], "descs": set()}
            v["appears"].append((idx, section_short(r["section"]), r["section"], pos))
            v["descs"].add(r["desc"])
    return variants, dict(left)


def name_variants(variants: "OrderedDict") -> tuple:
    """Final unique names. Returns (list of variant dicts in order, ambiguous-excluded list)."""
    kept, ambiguous = [], []
    for (lower, kcal, _), v in variants.items():
        if (lower, kcal) in AMBIGUOUS:
            ambiguous.append((v["printed"], kcal, AMBIGUOUS[(lower, kcal)]))
            continue
        v["name"] = v["printed"]
        manual = VARIANT_NAMES.get((lower, kcal))
        if manual:
            new, need_menu, phrase = manual
            if need_menu is not None and need_menu not in {a[0] for a in v["appears"]}:
                raise SystemExit(f"{v['printed']!r} ({kcal} kcal) is no longer printed on menu {need_menu}: re-check VARIANT_NAMES")
            if phrase and not any(phrase.lower() in d.lower() for d in v["descs"]):
                raise SystemExit(f"{v['printed']!r} ({kcal} kcal): its description no longer mentions {phrase!r}: re-check VARIANT_NAMES")
            v["name"] = new
            v["hand"] = True
        # category: the printing in the highest-ranked menu (PRIORITY), limited-time menus last
        v["primary"] = min(v["appears"], key=lambda a: (PRIORITY.index(a[0]), a[3]))
        v["limited"] = all(next(m for m in MENUS if m[0] == a[0])[4] for a in v["appears"])
        kept.append(v)
    used = set(VARIANT_NAMES) | set(AMBIGUOUS)
    seen_keys = {(k[0], k[1]) for k in variants}
    stale = sorted(used - seen_keys)
    if stale:
        raise SystemExit(f"VARIANT_NAMES / AMBIGUOUS entries no longer match a printed row: {stale}")
    groups = defaultdict(list)
    for v in kept:
        groups[v["name"].lower()].append(v)
    for name, vs in groups.items():
        if len(vs) == 1:
            continue
        for level in (1, 2, 3):   # by menu, else by section, else by both
            names = []
            for v in vs:
                idx, sec = v["primary"][0], v["primary"][1]
                tail = {1: menu_label(idx), 2: sec, 3: f"{menu_label(idx)}, {sec}"}[level]
                names.append(f"{v['name']} ({tail})")
            if len({n.lower() for n in names}) == len(names):
                for v, n in zip(vs, names):
                    v["name"] = n
                break
        else:
            raise SystemExit(f"Cannot tell apart {[(v['printed'], v['kcal'], v['appears'][0][:2]) for v in vs]}: add them to VARIANT_NAMES or AMBIGUOUS")
    kept.sort(key=lambda v: ([m[0] for m in MENUS].index(v["primary"][0]), v["primary"][3]))
    finals = [v["name"].lower() for v in kept]
    dup = sorted({n for n in finals if finals.count(n) > 1})
    if dup:
        raise SystemExit(f"Two published items would share a name: {dup}")
    return kept, ambiguous


def category(v: dict) -> str:
    idx, sec = v["primary"][0], v["primary"][1]
    label = menu_label(idx)
    return label if sec.lower() == label.lower() else f"{label}: {sec}"


def build_items(kept: list) -> tuple:
    items, unspecified = [], []
    for v in kept:
        veg = bool(v["suitable"] & {"vegetarian", "vegan"})
        tags, vague = tc.meat_tags(v["name"], v["desc"], vegetarian=veg)
        if veg:
            tags = ["vegetarian"]
        elif vague:
            unspecified.append(v["name"])
        menus = sorted({menu_label(a[0]) for a in v["appears"]}, key=lambda s: [m[2] for m in MENUS].index(s))
        notes = f"Printed '{v['printed']}' ({', '.join(menus)}; section {v['primary'][2]!r})"
        if v.get("hand"):
            notes += "; name written from the printed description"
        anomaly = ANOMALIES.get((v["printed"].lower(), v["kcal"]))
        if anomaly:
            notes += f"; {anomaly}"
        items.append(dict(name=v["name"], category=category(v), calories=v["kcal"], tags="|".join(tags), limited_time=v["limited"],
                          rankable=False, notes=notes, allergens=v["alg"]))
    return items, unspecified


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder with 00.html ... 18.html (see the module doc)")
    ap.add_argument("--checked-on", required=True, help="the day the pages were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the 19 pages into --pages first (one request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if len(NOTE) >= 400:
        raise SystemExit("note.txt text is 400 characters or more")
    if args.fetch:
        fetch_pages(args.pages)
    for idx, *_ in MENUS:
        f = args.pages / f"{idx:02d}.html"
        if f.exists():
            print(f"sha256 {hashlib.sha256(f.read_bytes()).hexdigest()}  {f.name}")
    menus, _ = read_all(args.pages)
    variants, left = collect(menus)
    kept, ambiguous = name_variants(variants)
    items, unspecified = build_items(kept)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Haven", cuisine="Holiday park restaurant", source_title=SOURCE_TITLE.format(checked=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             allergen_guide=guide, nutrition_level="calories")
    print(f"rows read: {sum(len(m['rows']) for m in menus.values())}; items published: {len(items)} (limited time {sum(1 for i in items if i['limited_time'])})")
    for reason, n in sorted(left.items()):
        print(f"  left out ({n}): {reason}")
    for name, kcal, why in ambiguous:
        print(f"  ambiguous, not published: {name} {kcal} kcal: {why}")
    hand = [v["name"] for v in kept if v.get("hand")]
    print(f"hand-written names: {len(hand)}; meat type not stated: {len(unspecified)}")
    for k, why in ANOMALIES.items():
        print(f"  odd figure kept as printed: {k}: {why}")
    cats = OrderedDict()
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {out}: " + "; ".join(f"{c} {n}" for c, n in cats.items()))


if __name__ == "__main__":
    main()
