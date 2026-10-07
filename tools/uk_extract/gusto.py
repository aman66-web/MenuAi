#!/usr/bin/env python3
"""Build data/source/gusto/ from Gusto Italian's own allergen matrix (a CALORIES-ONLY chain, with complete allergens).

    python3 tools/uk_extract/gusto.py --html path/to/allergen-matrix.html --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: https://www.gustorestaurants.com/allergen-matrix/  (the page the chain's own Menu page links as "Allergens & Nutritional
Information"; robots.txt allows it; the page prints "Last Updated: 06/10/2026"). --fetch downloads it once (browser User-Agent) into
--html first. The page is read by gusto_pages.py. For every dish it prints ONE nutrition figure, "Calories: Normal: N kcal" (a few
pasta and dessert components print "Small: N Large: N kcal"); there is no protein, carbohydrate, fat, salt, sugar, fibre, kJ or weight
anywhere on the page, so this is a calories-only chain (docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank.

Which menus are published (one worksheet per menu on the page; the Menu page of the same site says which restaurants serve which):
  published  A La Carte (national menu: Birmingham, Knutsford, Liverpool, Nottingham, Oxford), Dessert, Soft Drinks, Kids,
             Bottomless Brunch, Menu Fisso, 13-18 Menu, Gold Set Menu (all but dishes without a calorie figure)
  left out   Cheadle Menu (Cheadle Hulme only), Breakfast (Cheadle Hulme only), Oxford Private Dining Menu (one venue, private),
             Sunday A La Carte, Platinum Set Menu, Alcoholic Drinks, Wine (no calorie figure on any row, "N/A")
Dishes printed "N/A" for calories in a published menu are left out too (see EXPECTED_NO_KCAL). A dish that appears on several menus with
the SAME calories and allergens is published once (first menu in ORDER); with different figures each version is published and the later
ones are named "(Kids menu)", "(Menu Fisso)" ... so nothing is merged or guessed.

Allergens (docs/DATA.md "Allergens") are complete: every published dish has a row in the matrix. The matrix prints, per dish and per
column, "Yes" (contains) or "Yes*" (legend: "Allergen can be removed") or nothing. The 14 allergen columns are copied; "Yes*" is published
as CONTAINS (the dish as listed contains it; removing it is a request to the kitchen), the safe reading. The matrix also has columns
"Deep Fried", "No Intentional Gluten" and (on some sheets) an always-empty "Tree Nuts Type": these are not among the 14 and are not
published. "Gluten Type" and "Tree Nut Type" lists name the cereals and nuts. The matrix prints no per-dish "may contain" (the
Allergens page says cross-contamination cannot be ruled out and the deep fat fryers hold refined GM soya oil), so may_contain stays
empty and may_contain_published = no. Three printed forms of the same marks are cross-checked for every dish and the run stops if
they disagree: the cells, the row's data-mandatory-allergens / data-removable-allergens attributes and the "Contains" / "Removable
Ingredients" lists of its details row.

Names are as printed, except for plain spelling slips (TIDY below; the printed form is kept in the item's notes). Tags: vegetarian only
where the dish's own name says Vegan (the matrix has no vegetarian mark; the website menu page's diet flags are not used: it marks the
Chicken Caesar Salad vegetarian); contains_pork / contains_beef only when the dish name says so. Everything is non-rankable (calories only).
"""
from __future__ import annotations
import argparse
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import gusto_pages as pages  # noqa: E402
from common import allergen_words, sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "gusto"
PAGE_URL = "https://www.gustorestaurants.com/allergen-matrix/"
ALLERGENS_PAGE_URL = "https://www.gustorestaurants.com/allergens/"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ALIASES = ["gusto", "gusto italian", "gusto restaurants", "gusto restaurant"]
NOTE = ("Gusto's allergen matrix prints one calorie figure per dish and nothing else (no protein, carbs, fat, salt or weights). "
        "Covers the national à la carte (Birmingham, Knutsford, Liverpool, Nottingham, Oxford) and the dessert, kids, brunch, "
        "Menu Fisso, 13-18, Gold set and soft drinks lists. Manchester and Cheadle Hulme have their own menus, not listed.")

# sheet id -> (label used in names/categories, published?, rows the page must still have, why not published)
SHEETS = {
    "sheet-a-la-carte": ("", True, 74, ""),
    "sheet-dessert": ("", True, 18, ""),
    "sheet-soft-drinks": ("", True, 48, ""),
    "sheet-kids": ("Kids", True, 26, ""),
    "sheet-bottomless-brunch": ("Brunch", True, 9, ""),
    "sheet-menu-fisso": ("Menu Fisso", True, 28, ""),
    "sheet-13-18-menu": ("13-18 menu", True, 17, ""),
    "sheet-gold-set-menu": ("Gold set menu", True, 19, ""),
    "sheet-cheadle-menu": ("", False, 86, "Cheadle Hulme restaurant only"),
    "sheet-breakfast": ("", False, 11, "breakfast menu is on the Cheadle Hulme menu only"),
    "sheet-oxford-private-dining-menu": ("", False, 27, "one venue's private dining menu"),
    "sheet-sunday-a-la-carte": ("", False, 7, "no calorie figure (N/A) on any row"),
    "sheet-platinum-set-menu": ("", False, 16, "no calorie figure (N/A) on any row"),
    "sheet-alcoholic-drinks": ("", False, 75, "no calorie figure (N/A) on any row"),
    "sheet-wine": ("", False, 88, "no calorie figure (N/A) on any row"),
}
MENU_NAME = {"sheet-a-la-carte": "A la carte", "sheet-dessert": "Dessert menu", "sheet-soft-drinks": "Soft drinks list",
             "sheet-kids": "Kids menu", "sheet-bottomless-brunch": "Brunch menu", "sheet-menu-fisso": "Menu Fisso",
             "sheet-13-18-menu": "13-18 menu", "sheet-gold-set-menu": "Gold set menu"}
ORDER = ["sheet-a-la-carte", "sheet-dessert", "sheet-soft-drinks", "sheet-kids", "sheet-bottomless-brunch", "sheet-menu-fisso",
         "sheet-13-18-menu", "sheet-gold-set-menu"]
# Dishes of a published menu whose calories are printed "N/A": left out (checked on every run).
EXPECTED_NO_KCAL = {"sheet-soft-drinks": {"Coca-Cola", "Diet Coke", "Coke Zero", "Café Gusto", "Irish Coffee", "Hot Chocolate with Rum",
                                          "Hot Chocolate with Baileys", "Hot Cocolate with Cointreau"}}
ALLERGEN_COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Gluten", "Lupin", "Milk", "Molluscs", "Mustard", "Peanuts", "Sesame",
                    "Soya", "Sulphites", "Tree Nuts"]
OTHER_COLUMNS = ["Deep Fried", "No Intentional Gluten", "Tree Nuts Type"]  # not among the 14: not published
# The matrix's own category (lower case, as in data-category) -> category shown. "" is a dish with no category printed: it sits between
# the Mains and the Steak rows and the website menu page lists the three of them (Seared Tuna Steak, Pan-Fried Seabass, Aubergine
# Parmigiana) under Mains.
CATEGORY = {"bread & nibbles": "Bread & nibbles", "to start": "To start", "pasta & risotto": "Pasta & risotto", "mains": "Mains",
            "steak": "Steak", "pizza": "Pizza", "sides": "Sides", "salad": "Salad", "desserts": "Desserts", "dessert": "Desserts",
            "soft drinks": "Soft drinks", "hot drinks": "Hot drinks", "alcohol-free": "Alcohol-free drinks",
            "on the table to share": "On the table to share", "": "Mains"}
# Plain spelling slips in the matrix's dish names (substring -> fix). The printed name goes into the item's notes.
TIDY = [("onlly", "only"), ("Gelatto", "Gelato"), ("Madagscan", "Madagascan"), ("Carpacio", "Carpaccio"), ("Buratta", "Burrata"),
        ("Americanno", "Americano"), ("Cawstons Press", "Cawston Press"), ("Fior de Latte", "Fior di Latte"), ("seperate", "separate")]
PORK = re.compile(r"\b(pork|bacon|ham|pepperoni|sausages?|salsiccia|salami|chorizo|pancetta|prosciutto|'?nduja|gammon)\b", re.I)
BEEF = re.compile(r"\b(beef|(?<!tuna )(?<!salmon )steak|manzo|chateaubriand|rib-eye)\b", re.I)
# Dishes whose name says there is meat but not which: listed in the report as "meat type not stated".
MEAT_UNSTATED = re.compile(r"\b(meatballs?|burger|rag[uù]|carbonara|lasagne|bolognese)\b", re.I)
KCAL_ONE = re.compile(r"^Normal: (\d[\d,]*) kcal$")
KCAL_SIZES = re.compile(r"^Normal: Small: (\d[\d,]*) Large: (\d[\d,]*) kcal$")


def fetch(path: Path) -> None:
    req = urllib.request.Request(PAGE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    path.write_bytes(data)
    time.sleep(1)


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", strip_accents(name).lower().replace("&", "and"))


def make_id(name: str) -> str:
    s = strip_accents(name).lower().replace("&", " and ").replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "item"


def tidy_name(printed: str) -> str:
    name = printed
    for bad, good in TIDY:
        name = name.replace(bad, good)
    return re.sub(r"\*+$", "", name).strip()


def kcal_values(row: dict):
    """[(size or '', 'N')]: the figures printed for the dish, commas of thousands removed, or None when the dish prints N/A."""
    cal = row["meta"].get("Calories")
    if cal is None:
        raise SystemExit(f"{row['sheet']} / {row['name']!r}: no Calories section")
    if not cal["items"]:
        if cal["text"] != "N/A":
            raise SystemExit(f"{row['sheet']} / {row['name']!r}: calories text {cal['text']!r} is neither a list nor N/A")
        return None
    if len(cal["items"]) != 1:
        raise SystemExit(f"{row['sheet']} / {row['name']!r}: {len(cal['items'])} calorie lines {cal['items']}")
    text = cal["items"][0]
    m = KCAL_ONE.match(text)
    if m:
        return [("", m.group(1).replace(",", ""))]
    m = KCAL_SIZES.match(text)
    if m:
        return [("small", m.group(1).replace(",", "")), ("large", m.group(2).replace(",", ""))]
    raise SystemExit(f"{row['sheet']} / {row['name']!r}: unknown calorie format {text!r}")


def read_allergens(row: dict, headers: dict) -> dict:
    """contains / cereals / nuts for one dish from the matrix cells, checked against the two other printed forms."""
    where = f"{row['sheet']} / {row['name']!r}"
    names = {i: headers[i] for i in headers}
    yes, removable = set(), set()
    for col, mark in row["cells"].items():
        if mark == "":
            continue
        (yes if mark == "Yes" else removable).add(names[col])
    flag_cols = set(OTHER_COLUMNS)
    unknown = set(names.values()) - set(ALLERGEN_COLUMNS) - flag_cols
    if unknown:
        raise SystemExit(f"{where}: new matrix columns {sorted(unknown)}: decide whether they are allergens")
    if "Tree Nuts Type" in (yes | removable):
        raise SystemExit(f"{where}: the 'Tree Nuts Type' column has a mark: read its meaning before publishing")
    # the three printed forms of the same marks must agree
    attr_yes = {x for x in row["attrs"]["data-mandatory-allergens"].split(",") if x}
    attr_rem = {x for x in row["attrs"]["data-removable-allergens"].split(",") if x}
    meta_yes = {x.lower() for x in row["meta"]["Contains"]["items"]}
    meta_rem = {x.lower() for x in row["meta"]["Removable Ingredients *"]["items"]}
    low = lambda s: {x.lower() for x in s}  # noqa: E731
    if not (low(yes) == attr_yes == meta_yes and low(removable) == attr_rem == meta_rem):
        raise SystemExit(f"{where}: the cells, data attributes and Contains/Removable lists disagree: {sorted(yes)} {sorted(removable)} "
                         f"{sorted(attr_yes)} {sorted(attr_rem)} {sorted(meta_yes)} {sorted(meta_rem)}")
    for text_key, sec in (("Contains", "Contains"), ("Removable Ingredients *", "Removable Ingredients *")):
        t = row["meta"][sec]["text"]
        if not row["meta"][sec]["items"] and t != "None":
            raise SystemExit(f"{where}: {text_key} section is neither a list nor 'None': {t!r}")
    present = [n for n in (yes | removable) if n in ALLERGEN_COLUMNS]
    keys, _, _ = allergen_words(present, where)
    cereals, nuts = set(), set()
    gluten_type = row["meta"].get("Gluten Type")
    if gluten_type:
        k, cereals, _ = allergen_words(gluten_type["items"], where)
        if k != {"gluten"} or "gluten" not in keys:
            raise SystemExit(f"{where}: Gluten Type {gluten_type['items']} but gluten is not marked")
    nut_type = row["meta"].get("Tree Nut Type")
    if nut_type:
        k, _, nuts = allergen_words(nut_type["items"], where)
        if k != {"nuts"} or "nuts" not in keys:
            raise SystemExit(f"{where}: Tree Nut Type {nut_type['items']} but tree nuts are not marked")
    tn = row["meta"].get("Tree Nuts")
    if tn:
        want = "Yes*" if "Tree Nuts" in removable else "Yes"
        if tn["items"] != [want]:
            raise SystemExit(f"{where}: Tree Nuts section {tn['items']} disagrees with the cell ({want})")
    elif "Tree Nuts" in (yes | removable):
        raise SystemExit(f"{where}: Tree Nuts marked but no Tree Nuts section")
    return {"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts,
            "removable": {n for n in removable if n in ALLERGEN_COLUMNS}, "deep_fried": "Deep Fried" in (yes | removable)}


def build(html_text: str):
    rows, headers, last_updated = pages.read_matrix(html_text)
    if not last_updated:
        raise SystemExit("The page no longer prints 'Last Updated: dd/mm/yyyy': check the layout")
    seen = {}
    for r in rows:
        seen[r["sheet"]] = seen.get(r["sheet"], 0) + 1
    if set(seen) != set(SHEETS):
        raise SystemExit(f"The menus (worksheets) on the page changed: new {sorted(set(seen) - set(SHEETS))}, gone {sorted(set(SHEETS) - set(seen))}")
    for sheet, (_, _, expected, _) in SHEETS.items():
        if seen[sheet] != expected:
            raise SystemExit(f"{sheet} has {seen[sheet]} dishes but this script expects {expected}: the menu changed, re-check before running again.")
    report = {"excluded": [], "no_kcal": [], "tidied": [], "dropped": [], "variants": [], "meat_unstated": [], "blank_category": [],
              "deep_fried": 0, "removable_items": 0}
    for sheet, (_, published, _, why) in SHEETS.items():
        if not published:
            report["excluded"].append(f"{sheet}: {seen[sheet]} dishes, {why}")
    items = []        # published item dicts (with "allergens" for write_allergens)
    by_key = {}       # norm_key(base name + size) -> list of (item, payload)
    for sheet in ORDER:
        label = SHEETS[sheet][0]
        sheet_no_kcal = set()
        sheet_names = set()
        for r in (x for x in rows if x["sheet"] == sheet):
            printed = r["name"]
            if printed in sheet_names:
                raise SystemExit(f"{sheet}: dish {printed!r} is printed twice on the same menu")
            sheet_names.add(printed)
            kcals = kcal_values(r)
            if kcals is None:
                sheet_no_kcal.add(printed)
                continue
            base = tidy_name(printed)
            al = read_allergens(r, headers[sheet])
            report["deep_fried"] += 1 if al["deep_fried"] else 0
            raw_cat = r["attrs"]["data-category"].strip()
            if raw_cat not in CATEGORY:
                raise SystemExit(f"{sheet} / {printed!r}: new category {raw_cat!r}: add it to CATEGORY")
            if raw_cat == "":
                report["blank_category"].append(f"{sheet}: {printed}")
            category = CATEGORY[raw_cat] if not label else f"{label}: {CATEGORY[raw_cat]}"
            tags = []
            if re.search(r"\bvegan\b", base, re.I):
                tags.append("vegetarian")
            if PORK.search(base):
                tags.append("contains_pork")
            if BEEF.search(base):
                tags.append("contains_beef")
            for size, kcal in kcals:
                if not size:
                    name = base
                elif base.endswith(")"):
                    name = f"{base[:-1]}, {size})"   # "Cannoli (shell only, small)"
                else:
                    name = f"{base} ({size})"
                payload = (kcal, frozenset(al["contains"]), frozenset(al["cereals"]), frozenset(al["nuts"]))
                key = norm_key(name)
                same = [it for it, p in by_key.get(key, []) if p == payload]
                if same:
                    report["dropped"].append(f"{sheet}: {name} (same calories and allergens as {same[0]['_sheet']})")
                    continue
                if key in by_key:
                    name = f"{name} ({MENU_NAME[sheet]})"
                    report["variants"].append(f"{sheet}: {name} ({kcal} kcal) differs from the same-named dish on {by_key[key][0][0]['_sheet']}")
                notes = [f"menu: {sheet.replace('sheet-', '')}"]
                if printed != base:
                    notes.append(f"printed as {printed!r}")
                    report["tidied"].append(f"{printed!r} -> {base!r}")
                if raw_cat == "":
                    notes.append("category blank in the matrix; the website menu page lists it under Mains")
                if al["removable"]:
                    report["removable_items"] += 1
                    notes.append("removable (Yes*): " + ", ".join(sorted(al["removable"])))
                if al["deep_fried"]:
                    notes.append("Deep Fried column marked")
                item = {"id": make_id(name), "name": name, "category": category, "serving": size.capitalize() if size else "",
                        "calories": kcal, "tags": "|".join(tags), "rankable": False, "notes": "; ".join(notes),
                        "allergens": al, "_sheet": sheet.replace("sheet-", "")}
                if MEAT_UNSTATED.search(base) and not PORK.search(base) and not BEEF.search(base):
                    report["meat_unstated"].append(name)
                items.append(item)
                by_key.setdefault(key, []).append((item, payload))
        expected_missing = EXPECTED_NO_KCAL.get(sheet, set())
        if sheet_no_kcal != expected_missing:
            raise SystemExit(f"{sheet}: dishes printed N/A for calories changed: now {sorted(sheet_no_kcal)}, expected {sorted(expected_missing)}")
        report["no_kcal"] += [f"{sheet}: {n}" for n in sorted(sheet_no_kcal)]
    ids = [i["id"] for i in items]
    names = [i["name"] for i in items]
    if len(set(ids)) != len(ids) or len(set(names)) != len(names):
        raise SystemExit("Item names/ids are not unique")
    return items, report, last_updated


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True, help="the saved allergen-matrix page (PAGE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the page was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download PAGE_URL into --html first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.html)
    print(f"matrix page sha256 {sha256_file(args.html)}  {args.html}")
    items, report, last_updated = build(args.html.read_text(encoding="utf-8"))
    day, month, year = last_updated.split("/")
    title = f"Gusto Italian allergen matrix with calories per dish (page shows Last Updated: {last_updated})"
    guide = {"title": f"Gusto Italian allergen matrix (Last Updated: {last_updated}) and allergen information", "url": PAGE_URL,
             "checked_on": args.checked_on, "may_contain_published": False}
    for it in items:
        it.pop("_sheet", None)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Gusto Italian", cuisine="Italian", source_title=title, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    cats = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"page: Last Updated {last_updated}; wrote {len(items)} items to {out}")
    print("by category: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    for key in ("excluded", "no_kcal", "tidied", "dropped", "variants", "blank_category", "meat_unstated"):
        print(f"--- {key} ({len(report[key])})")
        for line in report[key]:
            print("   " + line)
    print(f"dishes marked Deep Fried (not published): {report['deep_fried']}")
    print(f"published dishes with at least one 'Yes*' (allergen can be removed; published as contains): {report['removable_items']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
