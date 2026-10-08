#!/usr/bin/env python3
"""Build data/source/caravan/ from Caravan's own "Nutritional + Allergen Info" menus (a CALORIES-ONLY chain, complete allergens).

    python3 -I tools/uk_extract/caravan.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://caravanandco.com/pages/nutrition (the chain's own page; robots.txt of caravanandco.com and of menus.tenkites.com
allow it) has three cards, London / Manchester / VARDO, each a page that embeds a Ten Kites menu:
    https://menus.tenkites.com/caravan/caravanlondon05      (10 menus: ALL DAY, BREAKFAST + BRUNCH, DRINKS, PRIX FIXE, SET,
                                                             FEASTING, VEGETARIAN FEASTING, CANAPE + PIZZA, SET BRUNCH, STANDING BRUNCH)
    https://menus.tenkites.com/caravan/caravanmanchester05  (9 menus: the same without STANDING BRUNCH; CANAPES + PIZZA)
    https://menus.tenkites.com/caravan/vardo04              (3 menus: BREAKFAST, ALL DAY, DRINKS)
Each menu is the same URL with ?mguid=<menu id> (ids are listed in PAGES and checked against each page's own tab bar). All 22 menus are
read. The page shows no date ("accessed <date>, no date shown"). The chain's page also links two old Flipsnack allergy matrices (Euston
Road, 4 Dec 2023; Lambworks / Brew Bar, 22 Feb 2024); they are not used.

What each dish prints: its calories in brackets beside the name ("(236 kcal)"; "-" when none), 14 allergen columns marked contains / may
contain / none, a "Deep Fat Fryer" column, "Plant-Based" and "Vegetarian" columns, and a Dietary Information card. There is NO protein,
carbohydrate, fat, salt, kJ or weight anywhere on the pages (the nutrient pop-ups are empty), so this is a calories-only chain
(docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank and every item is non-rankable. `serving` stays blank: the page
states no basis, the calories are "per dish as served" (a portion in the name, such as "100ml" or "(1 scoop)", is part of the name).

Founder's rule for this chain: include EVERYTHING the chain prints calories for (drinks, desserts, sides, sauces, kids items, set-menu
dishes). The menus differ by site and by menu, and the same dish name can have different figures on different menus (a sharing
portion, a set-menu portion). Same rule as English Heritage: a dish is published ONLY when its calories (wherever printed), its allergen
marks (contains / may contain, with the named cereals and nuts) and its diet flags are identical on EVERY menu, on every site, that
prints that dish name. Names are compared as printed except capitalisation, accents, spaces, "&" / "and" and punctuation. A different
figure is never merged, picked from or averaged: the dish is left out and listed in the run's output. A dish printed with no calories
("-") on some menus and a figure on others is published from the figure (the marks must still be identical everywhere); a dish that
prints no calories anywhere is not published. The same dish listed twice with identical marks counts once.

Allergens (docs/DATA.md "Allergens") are complete for every published dish: the 14 columns, the printed Contains / May contain lines and the
label ids the page's own allergen filter uses must agree (caravan_pages.py), or the run stops. "Deep Fat Fryer" is printed among the
allergens but is a cooking marker (the page's disclaimer: fried items are cooked in a fryer that may contain allergen traces or
non-plant-based matter), not one of the 14: it is not published as an allergen and note.txt says so. A dish whose every column says "no"
and that prints no line contains none of the 14. Named cereals and nuts are published for "Contains" only; those printed only under "May
contain" can't be expressed (the format names contained cereals and nuts only), and where a key is both contained and may-contained (wheat
contained, barley only possible) the key shows as contained.

Tags: vegetarian when the dish's own "Vegetarian" or "Plant-Based" column is marked. contains_pork / contains_beef only when the dish NAME
says so (bacon, ham, jamon, sausage, chorizo, pork ...; beef, steak ...); the pages print no ingredients. A name in square brackets such
as "[each]" or "[Covent Garden Only]" is kept as part of the name, shown in round brackets; "Special" in the brackets sets limited_time.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import caravan_pages as pages  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "caravan"
HUB_URL = "https://caravanandco.com/pages/nutrition"
BASES = {"london": "https://menus.tenkites.com/caravan/caravanlondon05",
         "manchester": "https://menus.tenkites.com/caravan/caravanmanchester05",
         "vardo": "https://menus.tenkites.com/caravan/vardo04"}
# (site, menu slug, tab name as printed, menu id, dishes the page must hold). Order = who gives a dish its category and name.
MENUS = [
    ("london", "all-day", "ALL DAY", "78ddd66d-956d-4037-aef8-02ee94d0a6e2", 50),
    ("manchester", "all-day", "ALL DAY", "8030821b-4940-4324-bc09-c6e016c7bbc5", 50),
    ("vardo", "all-day", "ALL DAY", "bd85955c-220d-43b2-bb42-aaf50335f53c", 48),
    ("london", "breakfast-brunch", "BREAKFAST + BRUNCH", "aef73cfb-64d7-483d-ab4b-2fbee628d852", 59),
    ("manchester", "breakfast-brunch", "BREAKFAST + BRUNCH", "fdfae50e-5685-4201-9f28-14d2b3bdbff6", 57),
    ("vardo", "breakfast", "BREAKFAST", "9c9b39d4-f105-42e9-9748-2c0d7cd6b1c1", 35),
    ("london", "drinks", "DRINKS", "62a31be3-fccf-44fe-b17d-d5f4fb33cf45", 196),
    ("manchester", "drinks", "DRINKS", "4cb11637-464a-4793-9603-fb723759ef0b", 202),
    ("vardo", "drinks", "DRINKS", "35fab049-8b55-4f6d-9272-eaa0c03080ec", 193),
    ("london", "canape-pizza", "CANAPE + PIZZA", "74051286-0a84-4b44-afcb-2e2ee78aac71", 22),
    ("manchester", "canapes-pizza", "CANAPES + PIZZA", "a6e31f4f-6ed8-4361-8c2a-250b79a13ffb", 20),
    ("london", "prix-fixe", "PRIX FIXE", "2c3ff418-aeac-415c-ae42-12b8391c78e1", 16),
    ("manchester", "prix-fixe", "PRIX FIXE", "e6f2a93f-b4f0-4a66-b12e-764bd76fbf63", 13),
    ("london", "set", "SET", "7b7662ec-c799-429c-a6a9-38b5e0d47c44", 17),
    ("manchester", "set", "SET", "bd50056f-0c78-4b6c-8daa-c355e87cd4a7", 17),
    ("london", "feasting", "FEASTING", "b012535c-4e02-4103-9f86-0b0495ba1fe1", 13),
    ("manchester", "feasting", "FEASTING", "49076b48-d09d-40ca-9c7f-f7c532852194", 13),
    ("london", "vegetarian-feasting", "VEGETARIAN FEASTING", "f24a1057-f66d-4fa0-b6fa-3005ce3691bd", 13),
    ("manchester", "vegetarian-feasting", "VEGETARIAN FEASTING", "a836e404-7063-4a15-bd87-35494c3b366a", 13),
    ("london", "set-brunch", "SET BRUNCH", "e5cba108-ca61-49fb-9ea7-ccb9da92a681", 16),
    ("manchester", "set-brunch", "SET BRUNCH", "f1dc4792-b8af-413a-aecc-daf4a9d10ea0", 16),
    ("london", "standing-brunch", "STANDING BRUNCH", "4fb01df7-2363-4b01-83cb-a1ec7440d496", 7),
]
TABS = {site: [(tab, guid) for s, _, tab, guid, _ in MENUS if s == site] for site in BASES}
# printed section (lower case, "&" -> "and") -> category shown. An unlisted section stops the run so a human places it.
CATEGORIES = {
    "for the table": "For the table", "small plates": "Small plates", "grains and bowls": "Grains and bowls",
    "grains/bowls": "Grains and bowls", "sourdough pizza": "Sourdough pizza", "pizza": "Sourdough pizza",
    "large plates": "Large plates", "sides": "Sides", "add a side": "Sides", "pudding": "Pudding",
    "choose a pudding": "Pudding", "desserts": "Pudding", "fruits and cereals": "Fruits and cereals",
    "on toast": "On toast", "brunch plates": "Brunch plates", "canapes": "Canapes", "bowls": "Canape bowls",
    "baked goods": "Baked goods", "brunch buns": "Brunch buns", "shared starter": "Shared starter",
    "shared mains": "Shared mains", "mains": "Mains", "cocktail": "Cocktails",
    "coffee": "Coffee", "not coffee": "Not coffee", "juices + smoothies": "Juices and smoothies",
    "ferments + sodas": "Ferments and sodas", "cocktails 0.0%": "Cocktails 0.0%", "cocktails - house": "Cocktails",
    "cocktails - spritz": "Cocktails", "cocktails - martini": "Cocktails", "cocktails - negroni": "Cocktails",
    "cocktail - classics": "Cocktails", "beers + ciders": "Beer and cider", "beer + cider 0.0%": "Beer and cider 0.0%",
    "wine - sparkling": "Wine", "wine - white": "Wine", "wine - rose + orange": "Wine", "wine - red": "Wine",
    "wines - sweet + fortified": "Wine", "sparkling 0.0%": "Sparkling 0.0%", "digestif": "Digestifs", "whisky": "Whisky",
    "mixers, cordials + syrups": "Mixers, cordials and syrups",
}
# Dishes that stay in items.csv but are not published (holdback.csv; restore by deleting the line). Nothing is corrected.
HOLDBACK = {
    "anz-2026-bacon-and-egg-pie": ("The page marks no gluten for a pie (its sibling 'ANZ - Lamb and Mint Kumara Tart' is marked gluten, "
                                   "and the pipeline's accuracy audit flags 'Pie' without gluten): probably an omission in the chain's "
                                   "allergen marks, and allergens are safety information. Left out until the chain confirms."),
}
SOURCE_TITLE = ("Caravan Nutritional + Allergen Info: the London (caravanlondon05), Manchester (caravanmanchester05) and Vardo (vardo04) "
                "menus on Ten Kites, all menu tabs (accessed {date}, no date shown)")
ALLERGEN_TITLE = ("Caravan Nutritional + Allergen Info (London, Manchester and Vardo menus on Ten Kites; accessed {date}, no date shown)")
ALIASES = ["caravan", "caravan restaurants", "caravan coffee roasters", "caravan restaurants & coffee roasters"]
PORK_EXTRA = re.compile(r"\b(jam[oó]n)\b", re.I)   # Spanish cured ham: the name says ham in another language
UNSTATED_EXTRA = re.compile(r"\b(veal|merguez)\b", re.I)   # names a meat without saying pork or beef (veal is calf meat; merguez is a sausage)
BRACKET = re.compile(r"\s*\[([^\]]+)\]")


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def key_of(name: str) -> str:
    """Names compared as printed except capitalisation, accents, spaces, '&' / 'and' and punctuation."""
    s = fold(name).lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def display_name(name: str) -> str:
    return BRACKET.sub(lambda m: f" ({m.group(1)})", name).strip()


def mark_signature(r: dict) -> tuple:
    """Everything printed about a dish's allergens and diet, so two prints of one dish can be compared."""
    def parts(ps):
        return frozenset((h.lower(), tuple(sorted(x.lower() for x in inner))) for h, inner in ps)
    return (parts(r["lines"]["contains"]), parts(r["lines"]["may"]), r["vegetarian"], r["plant_based"], r["fryer"])


def load(pages_dir: Path, fetch: bool) -> tuple[list[dict], list[str]]:
    """Every dish of every menu, in MENUS order: dicts with site, menu, tab, section, name and the row from caravan_pages."""
    instances, hashes = [], []
    for site, slug_, tab, guid, expected in MENUS:
        path = pages_dir / f"{site}_{slug_}.html"
        url = f"{BASES[site]}?mguid={guid}"
        if fetch:
            pages.fetch(url, path)
        text = path.read_text(encoding="utf-8")
        where = f"{site} {tab}"
        title = tk.page_title(text)
        if title != tab:
            raise SystemExit(f"{where}: the page is titled {title!r}, expected {tab!r}")
        tabs = pages.menu_tabs(tk.parse_html(text))
        if sorted(tabs) != sorted(TABS[site]):
            raise SystemExit(f"{where}: the tab bar changed. Now {tabs}, expected {TABS[site]}: a menu was added, renamed or removed; "
                             "update MENUS (and fetch the new menu) before running again.")
        rows = pages.read_page(text, where)
        if len(rows) != expected:
            raise SystemExit(f"{where}: {len(rows)} dishes but this script expects {expected}: the menu changed, re-check before running again.")
        for r in rows:
            sec = r["section"].lower().replace("&", "and")
            if sec not in CATEGORIES:
                raise SystemExit(f"{where}: new section {r['section']!r}: add it to CATEGORIES.")
            instances.append({"site": site, "menu": tab, "category": CATEGORIES[sec], "printed_section": r["section"], **r})
        hashes.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}  {url}")
    return instances, hashes


def build(instances: list[dict]) -> tuple[list[dict], list[str], list[str], list[str]]:
    """Group by dish name, apply the 'identical wherever printed' rule. Returns (items, report lines, left-out lines for dishes
    that print calories but conflict, names of dishes that print no calories anywhere)."""
    groups: dict[str, list[dict]] = {}
    for inst in instances:
        groups.setdefault(key_of(inst["name"]), []).append(inst)
    items, report, left_out = [], [], []
    no_calories: list[str] = []
    for k, group in groups.items():
        first = group[0]
        where = lambda i: f"{i['site']}/{i['menu']}/{i['printed_section']}"  # noqa: E731
        kcals = sorted({g["kcal"] for g in group if g["kcal"] is not None}, key=int)
        sigs = {mark_signature(g) for g in group}
        names = {g["name"] for g in group}
        if len(names) > 1:
            report.append(f"same dish, spelled differently: {sorted(names)}")
        bad = [g for g in group if g["problem"]]
        if bad:
            left_out.append(f"the page's own allergen marks contradict each other: {first['name']!r} on " +
                            ", ".join(sorted({where(g) for g in bad})) + " (columns / printed lines / filter ids disagree)")
            continue
        if not kcals:
            no_calories.append(first["name"])
            continue
        if len(kcals) > 1:
            by = {}
            for g in group:
                by.setdefault(g["kcal"], []).append(where(g))
            left_out.append(f"calories differ: {first['name']!r}: " + "; ".join(f"{v} kcal in {', '.join(w)}" for v, w in sorted(by.items(), key=lambda kv: (kv[0] is None, kv[0]))))
            continue
        if len(sigs) > 1:
            left_out.append(f"allergen or diet marks differ: {first['name']!r} in " + ", ".join(sorted({where(g) for g in group})))
            continue
        name = display_name(first["name"])
        veg = first["vegetarian"] or first["plant_based"]
        if veg and {"fish", "crustaceans", "molluscs"} & set(first["allergens"]["contains"]):
            report.append(f"CLASH, not tagged vegetarian although the chain marks it so (it contains fish, crustaceans or molluscs): {name}")
            veg = False
        meat, unspecified = tk.meat_tags(name, vegetarian=veg)
        if not veg and "contains_pork" not in meat and PORK_EXTRA.search(name):
            meat.append("contains_pork")
        if (unspecified or UNSTATED_EXTRA.search(name)) and not veg:
            report.append(f"meat type not stated: {name}")
        printed_in = sorted({f"{g['site']} {g['menu']}" for g in group})
        no_figure = sorted({f"{g['site']} {g['menu']}" for g in group if g["kcal"] is None})
        notes = f"Printed on: {'; '.join(printed_in)}"
        if no_figure:
            notes += f". Printed without calories on: {'; '.join(no_figure)}"
        if first["fryer"]:
            notes += ". Marked Deep Fat Fryer"
        limited = bool(re.search(r"\[[^\]]*special\]", first["name"], re.I))
        items.append({"name": name, "id": slug(fold(name)), "category": first["category"], "serving": "", "calories": kcals[0],
                      "tags": "|".join((["vegetarian"] if veg else []) + meat), "rankable": False, "limited_time": limited,
                      "notes": notes, "allergens": first["allergens"]})
    return items, report, left_out, no_calories


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or receiving, with --fetch) the 22 menu pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the menus were read")
    ap.add_argument("--fetch", action="store_true", help="download the 22 menus into --pages first (one request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    instances, hashes = load(args.pages, args.fetch)
    items, report, left_out, no_calories = build(instances)
    if not items:
        raise SystemExit("no items built")
    note = ("Calories only, as printed beside each dish; dishes with none (mostly alcohol) are not listed. The London, Manchester and Vardo menus differ, "
            f"so a dish is listed only if its calories and allergens match on every menu that prints it ({len(left_out)} left out). Coffees exclude milk. "
            "The chain's 'Deep Fat Fryer' mark (a shared fryer) is not in the allergen list.")
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters, over the 400 limit")
    title = SOURCE_TITLE.format(date=args.checked_on)
    guide = {"title": ALLERGEN_TITLE.format(date=args.checked_on), "url": HUB_URL, "checked_on": args.checked_on, "may_contain_published": True}
    unknown = sorted(set(HOLDBACK) - {it["id"] for it in items})
    if unknown:
        raise SystemExit(f"HOLDBACK names dishes that are no longer built: {unknown}")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Caravan", cuisine="World food", source_title=title, source_url=HUB_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=note, holdback=sorted(HOLDBACK.items()),
                             allergen_guide=guide, nutrition_level="calories")
    if not HOLDBACK:
        (out / "holdback.csv").unlink(missing_ok=True)
    combined = hashlib.sha256("\n".join(sorted(h.split()[0] for h in hashes)).encode()).hexdigest()
    print("\n".join(hashes))
    print(f"combined sha256 of the {len(hashes)} page hashes (sorted): {combined}")
    print(f"{len(instances)} printed dishes -> {len({key_of(i['name']) for i in instances})} distinct names -> {len(items)} built, {len(HOLDBACK)} held back, "
          f"{len(left_out)} left out because they differ between menus, {len(no_calories)} print no calories anywhere (not listed)")
    print("\n".join(f"report: {r}" for r in report))
    print("\n".join(f"left out: {x}" for x in left_out))
    print(f"no calories printed anywhere ({len(no_calories)} dishes): " + "; ".join(no_calories))
    counts: dict[str, int] = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print("wrote", len(items), "items to", out, ":", ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
