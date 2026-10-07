#!/usr/bin/env python3
"""Build data/source/hungry-horse/ from Hungry Horse's own online pub menus (a CALORIES-ONLY chain).

    python3 tools/uk_extract/hungry_horse.py --cache DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: the menu data the chain's own pub pages load (for example https://www.hungryhorse.co.uk/pubs/bedfordshire/chequers/menu, which
shows "Crispy King Prawns ... 544 kcal"). The page calls a JSON endpoint of the same site, one file per pub and menu:
    https://www.hungryhorse.co.uk/api/menus/getmenus/<pub id>                   the pub's menus (id, name, version)
    https://www.hungryhorse.co.uk/api/menus/getmenudetails/<pub id>/<menu id>   a menu: categories, products, portions, calories
robots.txt of www.hungryhorse.co.uk (read 2026-10-07) does not disallow /api/menus/. --fetch downloads the files listed in PUBS
below (about 86 requests, one per second, normal browser User-Agent, stopping at the first refusal); the JSON is kept in --cache.
Menu ids and names: 35271 Main Menu, 35272 No Gluten Containing Ingredients Menu, 35273 Kids' Menu, 35274 Sunday Roasts,
35275 Curry & Drink Wednesday, 35449 Drinks Menu, 35277 Breakfast Menu, 35810 Breakfast Menu SCOT Web (Scottish pubs only).

The chain prints CALORIES ONLY ("calories" per portion): no kJ, protein, carbohydrate, fat, saturates or fibre anywhere, so those stay
blank (docs/DATA.md "Calories-only chains"). The only other numbers are in the children's items' description text, "4.2g sugar/0.01g
salt.": copied as sugar_g and salt_g exactly as printed (values per item as sold). Prices are not used.

Why a set of pubs. Hungry Horse publishes a menu PER PUB: the same menu ids and the same calories for a dish everywhere (this script stops if
two pubs print different calories for the same dish), but each pub lists only some of the dishes (63 to 112 dishes on the Main Menu;
Scottish pubs add Lorne sausage dishes and a Scottish breakfast). The 41 pubs in PUBS are: every seventh pub of the 199 on the pub finder
(sorted by county, 29 pubs), the 5 Scottish pubs on the finder, 5 of the 7 Welsh ones, plus The Chequers (Houghton Regis, the reference pub
with every menu) and Peregrine (Newcastle, breakfast menu only). Across the first 32 pubs the set of Main Menu dishes stopped growing after
the second pub (92 -> 106 -> 112 dishes), so this is very likely close to every dish, but it IS a sample: the chain note says so. Adding pub
ids to PUBS (and EXPECTED_FILES) and re-running extends it; reading all 199 pubs would take about 200 more requests.

Read on 2026-10-07 (Main Menu versionId 750930, Kids' 753129, Sunday Roasts 749443, Curry & Drink 746797, Drinks 746784, Breakfast 749444,
Scottish breakfast 751814, No Gluten Containing 749441, as listed by getmenus): the 86 files have a combined SHA-256 of
74bf37417381c8b945af0e65c1a5845fa373a9a10e9946b53b7fc4258e091d40 (SHA-256 of the sorted "<file sha256>  <file name>  (<pub>, <menu>)" lines
that this script prints). The JSON carries no date of its own, so the chain.csv title says "accessed 2026-10-07, no date shown".

Calories of the Drinks Menu (alcohol-free beers, ciders, mocktails): the feed carries them, but the pub page does NOT display a calorie figure for
that menu (the other menus show "NNN kcal"), so these 10 items are the one place where the feed is ahead of the page. Delete the category
"Drinks: Alcohol Free" in the output (or skip menu 35449) if the founder prefers only what the page displays.

How the menus are read:
- One item per product with calories (a product has one portion "Standard"/"Bottle"/"APP Serve" here; a product with two portions
  that both print calories would stop the run). Products with no calories printed (wines, cocktails, beers, "Mix It Up", ice cream)
  are not published; the counts are printed at the end.
- The same dish on several menus (Main, Sunday, No Gluten Containing, Kids...) with the same name and calories is ONE item. The same
  name with different calories is a different dish (a burger served the no-gluten way, a kids' portion, a Scottish version): the
  later one gets a short tag in its name, "(no gluten containing ingredients)", "(kids' menu)"..., or an entry in MANUAL_NAMES
  (two dips, two ice creams...). Nothing is merged unless the name AND the calories are the same.
- Two drinks listed twice in the same menu at different prices with different calories and no size stated (Berry Punch, Monsoon Kiss)
  cannot be told apart: SKIPPED below, with the reason.
- Tags: vegetarian when the feed lists "Vegetarian" or "Vegan"; contains_pork / contains_beef when the dish's name or description says
  so (tenkites_c.meat_tags). Nothing else is inferred. `serving` only when the text states it ("330ml", "Serves 2").
- Allergens: link only. Hungry Horse's per-dish allergen matrix is hosted by Smart Chef (smartchef.co.uk), whose robots.txt is
  "Disallow: /" for every robot, so it is not read here (nothing is worked round). The chain's own page https://www.hungryhorse.co.uk/allergens
  (pub finder -> each pub's allergen menu, plus four 'no gluten containing ingredients' menu PDFs) is the guide link.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402  (meat_tags)
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "hungry-horse"
BASE = "https://www.hungryhorse.co.uk"
SOURCE_URL = BASE + "/pubs/bedfordshire/chequers/menu"
ALLERGEN_GUIDE_TITLE = ("Hungry Horse allergens & nutritional reports: each pub's allergen menu, found through the pub finder "
                        "(accessed {date}, no date shown)")
ALLERGEN_GUIDE_URL = BASE + "/allergens"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

MENUS = {"35271": "Main Menu", "35272": "No Gluten Containing Ingredients Menu", "35273": "Kids' Menu", "35274": "Sunday Roasts",
         "35275": "Curry & Drink Wednesday", "35449": "Drinks Menu", "35277": "Breakfast Menu", "35810": "Breakfast Menu SCOT Web"}
# Which menu wins when the same dish is on several (its name and category are used); the no-gluten menu comes last.
PRIORITY = ["35271", "35274", "35275", "35277", "35810", "35273", "35449", "35272"]

# pub id -> (path on hungryhorse.co.uk/pubs/, menu ids downloaded). 1851 and 7674 come first: their category and dish order is used.
PUBS = {
    "1851": ("east-renfrewshire/capelrig", ("35271", "35272", "35273", "35274", "35275", "35277", "35449", "35810")),
    "7674": ("bedfordshire/chequers", ("35271", "35272", "35273", "35274", "35275", "35277", "35449")),
    "1237": ("essex/roaring-donkey", ("35271",)),
    "1647": ("tyne-and-wear/peregrine", ("35277",)),
    "1660": ("cheshire/brighton-belle", ("35271", "35273", "35274", "35275", "35277", "35449")),
    "1728": ("norfolk/gatehouse", ("35271",)),
    "1738": ("merseyside/seahorse", ("35271",)),
    "1743": ("avon/lodekka", ("35271",)),
    "1750": ("carmarthenshire/new-stepney", ("35271",)),
    "1751": ("east-riding-yorkshire/vikings", ("35271",)),
    "1764": ("west-midlands/cambridge", ("35271",)),
    "1765": ("warwickshire/signal-box", ("35271",)),
    "1772": ("greater-manchester/hornet", ("35271",)),
    "1776": ("renfrewshire/tail-o-the-bank", ("35271", "35272", "35273", "35274", "35275", "35449")),
    "1792": ("lanarkshire/projectionist", ("35271", "35810")),
    "1796": ("lanarkshire/oystercatcher", ("35271", "35810")),
    "1797": ("north-lanarkshire/barrbridge", ("35271", "35273", "35274", "35275", "35449", "35810")),
    "1799": ("lancashire/war-horse", ("35271",)),
    "1828": ("west-midlands/keymaster", ("35271",)),
    "1935": ("devon/sloop-inn", ("35271",)),
    "1951": ("clwyd/harbour", ("35271",)),
    "1954": ("herefordshire/grandstand", ("35271",)),
    "1964": ("somerset/bridge-inn", ("35271", "35273", "35274", "35275", "35277", "35449")),
    "1967": ("mid-glamorgan/three-elms", ("35271",)),
    "1974": ("worcestershire/copcut-elm", ("35271",)),
    "4360": ("staffordshire/cherry-tree", ("35271",)),
    "4750": ("lancashire/lea-gate", ("35271",)),
    "4790": ("northamptonshire/ock-n-dough", ("35271",)),
    "5298": ("oxfordshire/tandem", ("35271", "35273", "35274", "35275", "35277", "35449")),
    "5306": ("berkshire/wee-waif", ("35271",)),
    "5343": ("kent/waters-edge", ("35271",)),
    "6138": ("surrey/midday-sun", ("35271",)),
    "6307": ("west-glamorgan/copper-pot", ("35271",)),
    "6370": ("gwent/new-inn-motel", ("35271",)),
    "6375": ("west-yorkshire/noble-comb", ("35271",)),
    "6391": ("nottinghamshire/plank-and-leggit", ("35271",)),
    "7619": ("merseyside/arrowe-park", ("35271",)),
    "7663": ("north-yorkshire/byways", ("35271",)),
    "7710": ("south-yorkshire/cumberland", ("35271",)),
    "7812": ("hampshire/heron", ("35271", "35273", "35274", "35275", "35277", "35449")),
    "8003": ("cumbria/turf-tavern", ("35271",)),
}
EXPECTED_FILES = 86
EXPECTED_ITEMS = 221  # items built from the 86 files read on 2026-10-07; the run stops if a re-run finds a different number

# Category shown for (menu, printed category). Anything not listed is shown as "<menu label>: <printed category>".
MAIN_CATEGORIES = ["Starters", "Sharers", "Wings & Things", "Signature Subs", "Classic Subs", "Classics", "Rice Bowls", "Signature Burgers",
                   "Classic Burgers", "Classic Double Burgers", "Grills", "Sizzlers", "Mix It Up", "Big Plate Specials", "Sides",
                   "Steak Sauces", "Desserts"]
NO_GLUTEN = "No gluten containing ingredients"
CATEGORY_ORDER = MAIN_CATEGORIES + ["Sunday roasts", "Kids' Sunday roasts", "Curry & Drink Wednesday", "Breakfast: Legends",
                                    "Breakfast: Classics", "Breakfast: Bites", "Breakfast: Kids", "Kids' menu: Starters",
                                    "Kids' menu: Baby Food", "Kids' menu: Meal Deal Small Mains", "Kids' menu: Meal Deal Small Desserts",
                                    "Kids' menu: Meal Deal Large Mains", "Kids' menu: Meal Deal Large Desserts", "Kids' menu: Meal Deal Drinks",
                                    "Drinks: Alcohol Free", NO_GLUTEN]

# Listed twice in the same menu at different prices with different calories and no size or other difference stated.
SKIPPED = {
    ("berry punch", 280): "Berry Punch is listed twice in the Alcohol Free drinks (71 and 280 calories, two prices, no size stated)",
    ("berry punch", 71): "Berry Punch is listed twice in the Alcohol Free drinks (71 and 280 calories, two prices, no size stated)",
    ("monsoon kiss", 100): "Monsoon Kiss is listed twice in the Alcohol Free drinks (42 and 100 calories, two prices, no size stated)",
    ("monsoon kiss", 42): "Monsoon Kiss is listed twice in the Alcohol Free drinks (42 and 100 calories, two prices, no size stated)",
}
# Two products with the same name and different calories inside the same menu: told apart by the chain's own description.
# key = (menu id, normalised name, calories) -> name shown
MANUAL_NAMES = {
    ("35271", "garlic breaded mushrooms", 726): "Garlic Breaded Mushrooms (garlic & herb ranch dip)",
    ("35271", "garlic breaded mushrooms", 589): "Garlic Breaded Mushrooms (mayo dip)",
    ("35271", "mac n cheese", 299): "Mac 'n' Cheese (side)",
    ("35271", "all day breakfast", 1085): "All Day Breakfast (pork sausage)",
    ("35271", "all day breakfast", 1003): "All Day Breakfast (Lorne sausage)",
    ("35271", "apple crumble", 465): "Apple Crumble (with custard)",
    ("35271", "apple crumble", 544): "Apple Crumble (with vegan ice cream)",
    ("35271", "lava cookie", 623): "Lava Cookie (with ice cream)",
    ("35271", "lava cookie", 707): "Lava Cookie (with vegan ice cream)",
    ("35272", "tomato soup", 336): "Tomato Soup (with seeded bread & butter)",
    ("35272", "tomato soup", 235): "Tomato Soup (vegan, with seeded bread)",
}

QUORN = re.compile(r"(?:quorn|veggie|vegetarian|vegan|plant[- ]based)\W*\s*sausages?\W*", re.I)
PAIR = re.compile(r"(\d+(?:\.\d+)?)\s*g\s*sugars?\s*/\s*(\d+(?:\.\d+)?)\s*(k?g)\s*salt", re.I)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("&", " and ").replace("™", "")).strip()


def clean(s: str) -> str:
    return " ".join((s or "").split())


def file_name(site: str, menu: str) -> str:
    return f"menu_{site}_{menu}.json"


def fetch(cache: Path) -> None:
    """Download the files in PUBS that are not in the cache: 1 request per second, robots.txt checked first, stop at the first refusal."""
    import urllib.request
    import urllib.robotparser
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(BASE + "/robots.txt")
    rp.read()
    cache.mkdir(parents=True, exist_ok=True)
    for site, (_, menus) in PUBS.items():
        for m in menus:
            dest = cache / file_name(site, m)
            if dest.exists():
                continue
            url = f"{BASE}/api/menus/getmenudetails/{site}/{m}"
            if not rp.can_fetch(UA, url):
                raise SystemExit(f"robots.txt now disallows {url}: stop, do not work round it")
            time.sleep(1.0)
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = r.read()
            except Exception as e:  # noqa: BLE001
                raise SystemExit(f"{url} failed ({e}): stop; the founder can open it in a browser and save the JSON as {dest.name}")
            json.loads(body.decode("utf-8"))
            dest.write_bytes(body)


def load_rows(cache: Path) -> tuple[list[dict], list[str]]:
    """Every (menu, category, product, portion) slot found in the cache, merged across pubs. A slot's calories must agree in every pub."""
    slots: dict = {}
    order: list = []
    hashes = []
    for site, (pub, menus) in PUBS.items():
        for m in menus:
            path = cache / file_name(site, m)
            if not path.exists():
                raise SystemExit(f"missing {path}: run with --fetch")
            raw = path.read_bytes()
            hashes.append(f"{hashlib.sha256(raw).hexdigest()}  {path.name}  ({pub}, {MENUS[m]})")
            data = json.loads(raw.decode("utf-8"))
            if not isinstance(data, list):
                raise SystemExit(f"{path.name}: expected a list of categories")
            for c in data:
                for p in c["products"]:
                    for po in p["portions"]:
                        kcal = po["calories"]
                        if kcal is not None and not isinstance(kcal, int):
                            raise SystemExit(f"{path.name}: {p['name']!r} calories {kcal!r} is not a whole number")
                        key = (m, clean(c["name"]), clean(p["name"]), clean(p["description"]), clean(po["portionName"]))
                        if key not in slots:
                            slots[key] = {"menu": m, "cat": key[1], "name": key[2], "desc": key[3], "portion": key[4], "kcal": kcal,
                                          "diet": set(p["dietaryOptions"]), "sites": set()}
                            order.append(key)
                        s = slots[key]
                        if s["kcal"] != kcal:
                            raise SystemExit(f"Pubs disagree about calories for {key}: {s['kcal']} vs {kcal} (pub {site}): stop and look")
                        if s["diet"] != set(p["dietaryOptions"]):
                            s["diet"] |= set(p["dietaryOptions"])
                        s["sites"].add(site)
    return [slots[k] for k in order], hashes


def category_for(menu: str, cat: str) -> str:
    low = cat.lower()
    if low.startswith("no gluten") or low.startswith("non gluten") or menu == "35272":
        return NO_GLUTEN
    if menu == "35271":
        return cat
    if menu == "35274":
        return {"Roasts": "Sunday roasts", "Kids' Roasts": "Kids' Sunday roasts"}.get(cat, cat)
    if menu == "35275":
        return "Curry & Drink Wednesday"
    if menu in ("35277", "35810"):
        return "Breakfast: " + cat
    if menu == "35273":
        return "Kids' menu: " + cat
    if menu == "35449":
        return "Drinks: " + cat
    raise SystemExit(f"unknown menu {menu}")


def variant_tag(row: dict) -> str:
    """Short tag added to a dish's name when another dish with the same name has different calories."""
    if row["cat_out"] == NO_GLUTEN:
        return "no gluten containing ingredients"
    if row["menu"] == "35273":
        return "kids' menu"
    if row["cat_out"] == "Kids' Sunday roasts":
        return "kids' roast"
    if row["cat_out"] == "Breakfast: Kids":
        return "kids' breakfast"
    if row["menu"] == "35810":
        return "Scotland"
    return ""


def parse_pair(desc: str) -> tuple[str, str, str]:
    """(sugar, salt, problem). Exactly one 'Xg sugar/Yg salt' in the text -> copied as printed. None -> blank. Two different pairs
    (ambiguous) -> blank with a note. A salt printed in kg is an impossible figure -> problem."""
    found = PAIR.findall(desc)
    distinct = sorted(set(found))
    if not distinct:
        if re.search(r"\bsugar\b.*\bsalt\b", desc, re.I):
            raise SystemExit(f"a description mentions sugar and salt but is not in the usual form: {desc!r}")
        return "", "", ""
    if len(distinct) > 1:
        return "", "", "two different sugar/salt pairs printed in the description, so none is copied"
    sugar, salt, unit = distinct[0]
    if unit.lower() == "kg":
        return sugar, "", f"salt printed as '{salt}{unit}', which is impossible"
    return sugar, salt, ""


def serving_from(desc: str) -> str:
    m = re.search(r"\bServes (\d+)\b", desc)
    if m:
        return "Serves " + m.group(1)
    m = re.search(r"(?<![\d.])(\d{2,4})\s?ml\b", desc)
    if m:
        return m.group(1) + "ml"
    return ""


def build(rows: list[dict]) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    no_kcal: dict = {}
    for r in rows:
        r["cat_out"] = category_for(r["menu"], r["cat"])
    # 1. one product per (menu, category, name, description): several portions with calories would need a decision
    seen_prod: dict = {}
    for r in rows:
        if r["kcal"] is None:
            no_kcal[MENUS[r["menu"]]] = no_kcal.get(MENUS[r["menu"]], 0) + 1
            continue
        k = (r["menu"], r["cat"], r["name"], r["desc"])
        if k in seen_prod:
            raise SystemExit(f"{r['name']!r} has two portions with calories ({seen_prod[k]['portion']}, {r['portion']}): decide how to name them")
        seen_prod[k] = r
    # 2. merge the same dish across menus (same normalised name AND calories); the highest-priority menu names it
    items: dict = {}
    ordered = sorted([r for r in rows if r["kcal"] is not None], key=lambda r: PRIORITY.index(r["menu"]))
    skipped = []
    for r in ordered:
        why = SKIPPED.get((norm(r["name"]), r["kcal"]))
        if why:
            skipped.append(why)
            continue
        key = (norm(r["name"]), r["kcal"])
        if key not in items:
            items[key] = {"rows": [r], "menus": {r["menu"]}, "sites": set(r["sites"])}
        else:
            it = items[key]
            it["rows"].append(r)
            it["menus"].add(r["menu"])
            it["sites"] |= r["sites"]
    report += [f"skipped (ambiguous, not published): {w}" for w in sorted(set(skipped))]
    # 3. names: the same normalised name with different calories is a different dish
    by_name: dict = {}
    for key, it in items.items():
        by_name.setdefault(key[0], []).append(it)
    for nm, group in by_name.items():
        for it in group:
            first = it["rows"][0]
            it["name_out"] = first["name"]
            it["cat_out"] = first["cat_out"]
            if len(group) == 1:
                continue
            manual = MANUAL_NAMES.get((first["menu"], nm, first["kcal"]))
            if manual:
                it["name_out"] = manual
                continue
            tag = variant_tag(first)
            if tag:  # the dish without a tag keeps the plain name; a second untagged one is caught below
                it["name_out"] = f"{first['name']} ({tag})"
    # a first (untagged) dish may still clash with a manual name: check final names are unique
    names = [norm(it["name_out"]) for it in items.values()]
    dup = sorted({n for n in names if names.count(n) > 1})
    if dup:
        raise SystemExit(f"Dish names still clash after naming: {dup}: same name, different calories, nothing tells them apart. "
                         "Add MANUAL_NAMES entries (menu id, normalised name, calories) using the chain's own descriptions.")
    # 4. build item dicts
    out, holdback = [], []
    for key, it in items.items():
        first = it["rows"][0]
        veg = any(("Vegetarian" in r["diet"] or "Vegan" in r["diet"]) for r in it["rows"])
        for r in it["rows"]:
            unknown = r["diet"] - {"Vegetarian", "Vegan", "GlutenFree"}
            if unknown:
                raise SystemExit(f"{r['name']!r}: new dietary option(s) {sorted(unknown)}: check how they should be read")
        flags = {("Vegetarian" in r["diet"] or "Vegan" in r["diet"]) for r in it["rows"]}
        if len(flags) > 1:
            report.append(f"vegetarian flag differs between menus for {it['name_out']!r}: tagged vegetarian because the chain marks it on at least one menu")
        sugar, salt, problem, pair_note = "", "", "", ""
        pairs = {parse_pair(r["desc"]) for r in it["rows"]}
        pairs.discard(("", "", ""))
        if len(pairs) > 1:
            raise SystemExit(f"{it['name_out']!r}: the menus print different sugar/salt values: {pairs}")
        if pairs:
            sugar, salt, problem = next(iter(pairs))
            if problem and "two different" in problem:
                pair_note = problem
        # Quorn / veggie sausages are not pork: those words are removed before the meat words are looked for (the chain does not
        # always mark such a dish vegetarian, e.g. Veggie Sausage & Mash, and we only tag vegetarian when the chain does)
        text = QUORN.sub(" ", " ".join([first["name"], first["desc"]]))
        tags, unspecified = tk.meat_tags(QUORN.sub(" ", first["name"]), text, vegetarian=veg)
        if unspecified:
            report.append(f"meat type not stated: {it['name_out']}")
        notes = [f"{MENUS[first['menu']]} / {first['cat']}"]
        if len(it["menus"]) > 1:
            notes.append("also on: " + ", ".join(MENUS[m] for m in sorted(it["menus"], key=PRIORITY.index) if m != first["menu"]))
        notes.append(f"seen on {len(it['sites'])} of {len(PUBS)} pubs read")
        if pair_note:
            notes.append(pair_note)
        item = {"name": it["name_out"], "category": it["cat_out"], "serving": serving_from(first["desc"]), "calories": first["kcal"],
                "sugar_g": sugar, "salt_g": salt, "tags": "|".join((["vegetarian"] if veg else []) + tags), "rankable": False,
                "notes": "; ".join(notes)}
        # impossible figures the chain's own text makes: sugar alone can't exceed the dish's energy (4 kcal/g); salt over 20 g
        if not problem and sugar and float(sugar) * 4 > first["kcal"] * 1.05:
            problem = f"{sugar} g of sugar is more energy than the {first['kcal']} calories printed"
        if not problem and salt and float(salt) > 20:
            problem = f"salt printed as {salt} g"
        item["_sort"] = (CATEGORY_ORDER.index(it["cat_out"]) if it["cat_out"] in CATEGORY_ORDER else len(CATEGORY_ORDER), len(out))
        if it["cat_out"] not in CATEGORY_ORDER:
            report.append(f"category not in CATEGORY_ORDER (put last): {it['cat_out']}")
        out.append(item)
        if problem and "two different" not in problem:
            holdback.append((slug(item["name"]), f"The chain's own text prints impossible figures for this dish: {problem}. Not corrected, not published"))
    out.sort(key=lambda i: i["_sort"])
    for i in out:
        del i["_sort"]
    report.append("no calories printed, not published: " + ", ".join(f"{k} {v}" for k, v in sorted(no_kcal.items())))
    return out, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder holding menu_<pub>_<menu>.json files")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the files were downloaded/read")
    ap.add_argument("--fetch", action="store_true", help="download missing files first (1 request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    nfiles = sum(len(m) for _, m in PUBS.values())
    if nfiles != EXPECTED_FILES:
        raise SystemExit(f"PUBS lists {nfiles} files, expected {EXPECTED_FILES}")
    if args.fetch:
        fetch(args.cache)
    rows, hashes = load_rows(args.cache)
    items, holdback, report = build(rows)
    combined = hashlib.sha256("\n".join(sorted(hashes)).encode("utf-8")).hexdigest()
    if EXPECTED_ITEMS and len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menus changed, re-check the report and MANUAL_NAMES")
    note = ("Calories only: Hungry Horse prints no protein, carbs or fat. Each pub lists different dishes, so this is every dish on the "
            f"menus of {len(PUBS)} pubs we read; yours may not serve all of them. Sugar and salt are printed for children's dishes only. "
            "Drinks with no calories printed (wines, cocktails, beers) are not listed; alcohol-free drink calories are in the menu data "
            "but not shown on the menu page.")
    assert len(note) < 400, len(note)
    title = (f"Hungry Horse online pub menus with calories: main, children's, Sunday roast, curry night, breakfast, no-gluten and "
             f"alcohol-free drinks menus, as published for {len(PUBS)} pubs (accessed {args.checked_on}, no date shown)")
    guide = {"title": ALLERGEN_GUIDE_TITLE.format(date=args.checked_on), "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on,
             "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Hungry Horse", cuisine="Pub", source_title=title, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["hungry horse", "the hungry horse"], items=items, out=args.out,
                             note=note, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(sorted(hashes)))
    print(f"combined sha256 of the {len(hashes)} files (sorted lines above): {combined}")
    print("\n".join(report))
    cats: dict = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
