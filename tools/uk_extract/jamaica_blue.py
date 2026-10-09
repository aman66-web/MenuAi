#!/usr/bin/env python3
"""Build data/source/jamaica-blue/ from Jamaica Blue's own allergen & nutrition data file (England, Scotland & Wales).

    python3 tools/uk_extract/jamaica_blue.py --csv DIR/allergens_JBUK.csv --checked-on 2026-10-09 [--fetch]

The chain's allergen app (https://allergens-jamaicablue.co.uk/, region "England, Scotland & Wales"; linked from jamaicablue.co.uk/our-menu/)
loads one CSV, https://allergens-jamaicablue.co.uk/csv/allergens_JBUK.csv (546 rows on 2026-10-09, served Last-Modified 1 October 2026
19:45 GMT, which the app prints as "Last modified: 01/10/2026, 19:45"). --fetch downloads it first: robots.txt is read and matched with
robots_rfc (a 404 means the host publishes no rules; anything else unexpected stops the run), then one request, a normal browser User-Agent.
The same app and file layout serve Muffin Break (tools/uk_extract/muffin_break.py); this script follows the decisions made there.

Every number is copied from the file's "per serving" columns exactly as printed (kJ, kcal, fat, saturates, carbohydrate, sugars, fibre,
protein) plus the serving weight the app prints ("AVG QUANTITY PER SERVING (226g)" = the file's "Portion Measure (g)"). Only names, categories
and rankable are typed here. What is published and what is not (each rule stops or reports, nothing is guessed):
  * "Portion Code" starting with a letter (BREAD, INGREDIENT, ALLERGEN): the chain's own app (RecipesContext chunk) marks these rows
    isIngredient and hides their kcal ("Ingredient used in the product recipe - listed for allergen purposes only"), so they are not published.
  * "Brand" holding sites ([READING], [ILFORD][MANCHESTER][BRADFORD], [KINGSWAY GOLF CENTRE], [CHELMSFORD], ...): the app tells the visitor
    "This product is only available in Jamaica Blue <site>", so these are dishes of selected cafes only: left out (docs/UK_DATA_PLAYBOOK.md
    rule 4). Only rows with a blank Brand (every cafe) are published.
  * Where the same dish name is printed twice with different figures (a blank-Brand row and a site row, or two blank rows), the printed
    copies disagree and are never chosen between: the blank-Brand row is held back (holdback.csv). EXPECTED_CONFLICTS lists the ones seen on
    2026-10-09; any other conflict stops the run so a human looks.
  * "(Scotland)" in the name (Irn Bru): a Scotland-only soft drink, a regional product, left out (the same decision as Muffin Break).
  * founder's rule 2026-10-09: only COMPLETE nutrition. A row with a blank calories, protein, carbohydrate or fat cell is left out
    (bottled water, black tea, long black and espresso, canned and bottled soft drinks...). A blank is never read as 0.
  * Salt is NOT published. The chain's own app (RecipesContext chunk) shows the file's "Salt per 100g" value in its per-serving table and the
    file's "Salt per serving" value in its per-100g table, labelled "Sodium", so the app and the file disagree on every row: salt stays blank.
Meaning of name tags: [H] = halal ingredients (the chain's own variant label; only on site rows here), the other bracketed words are the
chain's own variant labels (kept in parentheses); [BR nnnn] are internal recipe codes and are dropped.

Allergens: the same file prints, per row, 26 columns (gluten + oats/wheat/barley/rye, tree nuts + 8 named nuts, peanuts, eggs, milk, fish,
crustaceans, molluscs, celery, mustard, sesame, soya, sulphites, lupin) holding "Contains", "May Contain" or blank. Every published item
is a row of the file, so the list is complete (docs/DATA.md "Allergens"); a blank means the file marks none of the 14 for that row. An
unknown cell value stops the run.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "jamaica-blue"
HOST = "https://allergens-jamaicablue.co.uk"
CSV_URL = HOST + "/csv/allergens_JBUK.csv"
PAGE_URL = HOST + "/allergens/jbuk"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
EXPECTED_ROWS = 546
SOURCE_TITLE = ("Jamaica Blue UK (England, Scotland & Wales) Allergens and Nutrition Information, data file allergens_JBUK.csv "
                "(file dated 1 October 2026)")
ALLERGEN_TITLE = "Jamaica Blue Allergens and Nutrition Information (England, Scotland & Wales)"
NOTE = ("Figures are per serving from Jamaica Blue's own England, Scotland & Wales data file. Dishes the file lists for named cafes only "
        "are left out. Drinks and other items where the file leaves protein, carbs or fat blank are not published, nor are its "
        "ingredient-only rows. Salt is left out: the chain's website and its file disagree on it.")

HEADER = ['Recipe ID', 'Last Modified', 'Recipe Name', 'Recipe Description', 'Servings Weight', 'Brand', 'Portion Code',
          'Portion Measure (g)', 'Energy Kj (kJ) per 100g', 'Energy Kcal (kcal) per 100g', 'Fat (g) per 100g',
          'Saturated Fat (g) per 100g', 'Carbohydrate (g) per 100g', 'Sugars (g) per 100g', 'Fibre (g) per 100g',
          'Protein (g) per 100g', 'Salt (g) per 100g', 'Energy Kj (kJ) per serving', 'Energy Kcal (kcal) per serving',
          'Fat (g) per serving', 'Saturated Fat (g) per serving', 'Carbohydrate (g) per serving', 'Sugars (g) per serving',
          'Fibre (g) per serving', 'Protein (g) per serving', 'Salt (g) per serving', 'Gluten', 'Oats', 'Wheat', 'Barley', 'Rye',
          'Tree nuts', 'Hazelnuts', 'Pecans', 'Almonds', 'Cashews', 'Walnuts', 'Brazil nuts', 'Pistachios', 'Macadamias', 'Peanuts',
          'Eggs', 'Milk', 'Fish', 'Crustaceans', 'Molluscs', 'Celery', 'Mustard', 'Sesame', 'Soya', 'Sulphites', 'Lupin',
          'Recipe Notes']
ALLERGEN_COLUMNS = HEADER[HEADER.index("Gluten"):HEADER.index("Lupin") + 1]
NUMBER_COLUMNS = (("calories", "Energy Kcal (kcal) per serving"), ("protein_g", "Protein (g) per serving"),
                  ("carbs_g", "Carbohydrate (g) per serving"), ("fat_g", "Fat (g) per serving"),
                  ("sat_fat_g", "Saturated Fat (g) per serving"), ("sugar_g", "Sugars (g) per serving"),
                  ("fiber_g", "Fibre (g) per serving"), ("energy_kj", "Energy Kj (kJ) per serving"))
REQUIRED = ["Energy Kcal (kcal) per serving", "Protein (g) per serving", "Carbohydrate (g) per serving", "Fat (g) per serving"]

# The chain's own "Recipe Description", in the order shown. Unknown categories stop the run.
CATEGORIES = ["All Day Menu", "Breakfast", "Breads", "Savoury", "Seasonal", "Kids Corner", "Sides", "Pastries", "Muffins", "Cakes",
              "Confectionery", "Hot Drinks", "Coffee", "Cold Drinks Made", "Cold Drinks", "Condiments", "Hot Beverage Modifiers",
              "Ingredients"]
# Whole meals, mains, sandwiches and savoury bakes are suggested by Best for you; cakes, pastries, muffins, drinks, sides, add-ons,
# condiments, loaves and the children's menu are not.
RANKABLE_CATEGORIES = {"All Day Menu", "Breads", "Savoury", "Seasonal"}
LIMITED_CATEGORIES = {"Seasonal"}

# Dishes printed twice with different figures (blank-Brand row + a site row, or two blank rows), seen on 2026-10-09: the blank-Brand
# rows are held back, nothing is chosen. name -> reason. Any other disagreement stops the run.
EXPECTED_CONFLICTS = {
    "Mambonito Chicken Salad": "The file prints this dish twice: for every cafe 598 kcal (452 g) and for Richmond, Telford and Wednesbury 516 kcal (382 g). The two copies disagree, so neither is published.",
    "Korean Gochujang Chicken Waffle": "The file prints this dish twice for every cafe with different figures (707 kcal, 301 g and 685 kcal, 303 g) and different allergens. The copies disagree, so neither is published.",
}

# Rows whose own numbers are impossible (found by the accuracy audit "macros-exceed-weight" on 2026-10-09; never corrected): protein +
# carbohydrate + fat in grams is more than the serving's printed weight. The reason is written from the row's own values; the run stops if
# a row no longer has the problem so a human re-checks the list.
HOLD_MACROS_OVER_WEIGHT = ["Cookie Double Choc Chip", "Cookie Raspberry & White Chocolate", "Cookie White Choc Chunk",
                           "Croll Nutella & Honey", "Sweet Tart Cornflake", "Sweet Tart Pistachio"]
# Rows whose allergen marks contradict the dish's own name (the project's rule: such rows are held back, never corrected): name -> reason.
HOLD_ALLERGEN_NAME = {
    "Cake Dark Chocolate & Walnut Brownie": "The file marks no gluten (not even 'May Contain') for this cake, although every other cake, slice and cheesecake in the same file marks gluten; a cake with no gluten mark contradicts the dish's own name, so its allergens cannot be published (all or nothing, neither is the dish).",
    "Cake Dark Chocolate & Walnut Brownie (Ice Cream)": "The file marks no gluten (not even 'May Contain') for this cake, although every other cake, slice and cheesecake in the same file marks gluten; a cake with no gluten mark contradicts the dish's own name, so its allergens cannot be published (all or nothing, neither is the dish).",
    # Pistachio/hazelnut-flavoured drinks whose flavour is the chain's own nut-free syrup (the file's 'Syrup Hazelnut Flavour [SHOTT]' and
    # 'Syrup Salted Pistachio [SHOTT]' rows mark none of the 14) are accepted in data/audit/reviewed/jamaica-blue.csv. These three have no
    # such evidence in the file: no 'Caramelised Pistachio' syrup row exists, and no row says what is in the Key Lime Pie smoothie.
    "Latte Caramelised Pistachio Medium": "The file marks Milk only, but 'Pistachio' is in the name and the file has no 'Caramelised Pistachio' flavour-syrup row showing that this flavour holds no nuts (the Hazelnut and Salted Pistachio syrup rows do), so a nut-free mark cannot be confirmed; not published (all or nothing, neither is the dish).",
    "Latte Caramelised Pistachio Large": "The file marks Milk only, but 'Pistachio' is in the name and the file has no 'Caramelised Pistachio' flavour-syrup row showing that this flavour holds no nuts (the Hazelnut and Salted Pistachio syrup rows do), so a nut-free mark cannot be confirmed; not published (all or nothing, neither is the dish).",
    "Smoothie Key Lime Pie": "The file marks no gluten for a drink named after a pie and has no ingredient text or other row to show that it holds no biscuit or pastry, so the gluten-free mark cannot be confirmed; not published (all or nothing, neither is the dish).",
}

NUM = re.compile(r"^\d+(\.\d+)?$")
PORK = re.compile(r"(?<!turkey )(?<!turkey-)\b(bacon|ham|gammon)\b|\b(salami|chorizo|nduja|pork|pancetta|mortadella|pepperoni)\b|"
                  r"(?<!beef )(?<!chicken )(?<!vegan )\bsausages?\b", re.I)
CHICKEN_CHORIZO = re.compile(r"chicken chorizo", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
MEAT_NOT_STATED = re.compile(r"\b(burger|reuben|charcuterie|italian job|diner breakfast|big brekkie|full monty|sausage)\b", re.I)
SIZE_RANK = {"small": 0, "medium": 1, "large": 2}


def fetch(dest: Path) -> None:
    """robots.txt first (404 = no rules; a refusal or error stops), then the CSV once."""
    req = urllib.request.Request(HOST + "/robots.txt", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rules = robots_rfc.parse(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise SystemExit(f"robots.txt answered HTTP {e.code}: stop and ask the founder to download {CSV_URL} himself")
        rules = []
    if not robots_rfc.allowed(rules, "/csv/allergens_JBUK.csv"):
        raise SystemExit("robots.txt disallows /csv/allergens_JBUK.csv: do not download; ask the founder for the file")
    time.sleep(1)
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": UA, "Accept": "text/csv,text/plain;q=0.9,*/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.read())


def clean_name(raw: str) -> str:
    """'[JBUK] [Kids] Egg on Toast [Poached]' -> 'Kids Egg on Toast (Poached)'; [BR nnn] codes are dropped."""
    name = raw.strip()
    if not name.startswith("[JBUK]"):
        raise SystemExit(f"unexpected name {raw!r}: every row should start with [JBUK]")
    name = name[len("[JBUK]"):].strip()
    name = re.sub(r"\s*\[BR \d+\]", "", name)
    name = re.sub(r"^\[Kids\]\s*", "Kids ", name)
    name = re.sub(r"\[H\]", "(Halal ingredients)", name)
    name = re.sub(r"\[([^\]]+)\]", r"(\1)", name)
    name = re.sub(r"\s+", " ", name).strip()
    if "&nbsp;" in name or "&amp;" in name or "[" in name or "]" in name:
        raise SystemExit(f"{raw!r} still has markup after cleaning: handle it explicitly")
    return name


def allergens_for(row: dict, where: str, report: list[str]) -> dict:
    contains_words, may_words = [], []
    for col in ALLERGEN_COLUMNS:
        v = row[col].strip()
        if v == "Contains":
            contains_words.append(col)
        elif v == "May Contain":
            may_words.append(col)
        elif v != "":
            raise SystemExit(f"{where}: unexpected allergen cell {v!r} in column {col}")
    keys, cereals, nuts = allergen_words(contains_words, where)
    may, _, _ = allergen_words(may_words, where)
    if cereals and row["Gluten"].strip() != "Contains":
        report.append(f"{where}: a named cereal is marked Contains but the Gluten column is not (counted as gluten)")
    if nuts and row["Tree nuts"].strip() != "Contains":
        report.append(f"{where}: a named tree nut is marked Contains but the Tree nuts column is not (counted as nuts)")
    return {"contains": keys, "may_contain": may, "cereals": cereals, "nuts": nuts}


def numbers(row: dict, name: str) -> dict:
    nums = {}
    for key, col in NUMBER_COLUMNS:
        v = row[col].strip()
        if v != "" and not NUM.match(v):
            raise SystemExit(f"{name}: {col} = {v!r} is not a plain number: handle it explicitly")
        nums[key] = v
    m = re.match(r"^(\d+(?:\.\d+)?)g$", row["Portion Measure (g)"].strip())
    if not m:
        raise SystemExit(f"{name}: Portion Measure {row['Portion Measure (g)']!r} is not '<n>g'")
    nums["weight_g"] = m.group(1)
    return nums


def signature(nums: dict) -> tuple:
    return tuple(nums[k] for k in ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "energy_kj", "weight_g"))


def sort_key(it: dict) -> tuple:
    base = re.sub(r"\b(Small|Medium|Large)\b", "", it["name"], flags=re.I)
    base = re.sub(r"\s+", " ", base).strip().lower()
    size = next((SIZE_RANK[w.lower()] for w in re.findall(r"\b(Small|Medium|Large)\b", it["name"], re.I)), -1)
    return (CATEGORIES.index(it["category"]), base, size)


def build(csv_path: Path):
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        f.seek(0)
        header = next(csv.reader(f))
    if header != HEADER:
        raise SystemExit("the file's columns changed: re-read the new header and update HEADER before running again")
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"the file has {len(rows)} rows but this script expects {EXPECTED_ROWS}: the menu changed, "
                         "re-check the exclusions below and the count before running again")
    skipped = {"ingredient": [], "site": [], "scotland": [], "incomplete": []}
    report: list[str] = []
    candidates: list[dict] = []  # complete, non-ingredient rows, blank Brand or site-tagged
    for r in rows:
        raw = r["Recipe Name"]
        if r["Recipe Description"] not in CATEGORIES:
            raise SystemExit(f"new category {r['Recipe Description']!r}: add it to CATEGORIES (and decide its place)")
        code = r["Portion Code"].strip()
        if code.lower() != "npd" and re.match(r"[a-z]", code, re.I):  # the app's own rule: a letter-led code = ingredient row
            skipped["ingredient"].append(raw)
            continue
        if any(r[c].strip() == "" for c in REQUIRED):
            skipped["incomplete"].append(raw)
            continue
        name = clean_name(raw)
        brand = r["Brand"].strip()
        if brand and not re.fullmatch(r"(\[[A-Za-z' ]+\])+", brand):
            raise SystemExit(f"{name}: unexpected Brand cell {brand!r}")
        candidates.append({"row": r, "name": name, "brand": brand, "nums": numbers(r, name)})
    # same printed name with different figures: the printed copies disagree, the blank-Brand rows are held back
    by_name: dict[str, list[dict]] = {}
    for c in candidates:
        by_name.setdefault(c["name"], []).append(c)
    conflicts: dict[str, list[dict]] = {}
    for name, group in by_name.items():
        if len({signature(g["nums"]) for g in group}) > 1:
            conflicts[name] = group
    for name, group in conflicts.items():
        if any(not g["brand"] for g in group) and name not in EXPECTED_CONFLICTS:
            raise SystemExit(f"{name!r} is printed {len(group)} times with different figures and is not in EXPECTED_CONFLICTS: "
                             "decide (hold back, never choose) and add it")
    missing = [n for n in EXPECTED_CONFLICTS if n not in conflicts]
    if missing:
        raise SystemExit(f"EXPECTED_CONFLICTS names {missing} but the file no longer disagrees about them: re-check the list")
    items: list[dict] = []
    holdback: list[tuple[str, str]] = []
    for c in candidates:
        r, name = c["row"], c["name"]
        if c["brand"]:
            skipped["site"].append(f"{r['Recipe Name']} {c['brand']}")
            continue
        if "(Scotland)" in name:
            skipped["scotland"].append(r["Recipe Name"])
            continue
        raw = r["Recipe Name"]
        plain = re.sub(r"\[[^\]]*\]", "", raw[len("[JBUK]"):]).replace("  ", " ")
        tags = []
        if re.search(r"vegan|plant[- ]based", raw, re.I):
            tags.append("vegetarian")  # the chain's own name says Vegan / Plant Based
        else:
            if PORK.search(CHICKEN_CHORIZO.sub("", plain)):
                tags.append("contains_pork")
            if BEEF.search(plain):
                tags.append("contains_beef")
            if not tags and MEAT_NOT_STATED.search(plain) and not re.search(r"chicken|turkey|salmon|tuna", plain, re.I):
                report.append(f"meat type not stated: {name}")
        category = r["Recipe Description"]
        rid = r["Recipe ID"].strip()
        it = {"name": name, "category": category, "serving": "", **c["nums"], "tags": "|".join(tags),
              "limited_time": category in LIMITED_CATEGORIES,
              "rankable": category in RANKABLE_CATEGORIES or (category == "Breakfast" and r["Recipe Notes"] != "Loaf"),
              "notes": f"Recipe ID {rid}; Portion Code {r['Portion Code'].strip()}; sub-group {r['Recipe Notes'].strip()}",
              "allergens": allergens_for(r, name, report), "_rid": rid}
        items.append(it)
    # identical blank-Brand duplicates are one dish; held-back conflicts keep the Recipe ID in their id so each is addressable
    kept: list[dict] = []
    seen: dict[str, dict] = {}
    for it in items:
        if it["name"] in EXPECTED_CONFLICTS:
            it["id"] = f"{slug(it['name'])}-{it['_rid']}"
            holdback.append((it["id"], EXPECTED_CONFLICTS[it["name"]]))
            kept.append(it)
            continue
        if it["name"] in seen:
            if signature(seen[it["name"]]) != signature(it) or seen[it["name"]]["allergens"] != it["allergens"]:
                raise SystemExit(f"{it['name']!r} appears twice with different numbers or allergens: handle by hand, never choose")
            report.append(f"dropped exact duplicate: {it['name']}")
            continue
        seen[it["name"]] = it
        it["id"] = slug(it["name"])
        kept.append(it)
    ids = [it["id"] for it in kept]
    if len(ids) != len(set(ids)):
        raise SystemExit("two different dishes got the same id: " + ", ".join(i for i in set(ids) if ids.count(i) > 1))
    kept.sort(key=sort_key)
    for it in kept:
        it.pop("_rid")
    by_item = {it["name"]: it for it in kept}
    for name in HOLD_MACROS_OVER_WEIGHT:
        it = by_item.get(name)
        if it is None:
            raise SystemExit(f"HOLD_MACROS_OVER_WEIGHT names {name!r}, which is not a published item: re-check the list")
        mass = float(it["protein_g"]) + float(it["carbs_g"]) + float(it["fat_g"])
        if mass <= float(it["weight_g"]):
            raise SystemExit(f"{name}: protein + carbs + fat ({mass:g} g) no longer exceeds the serving weight ({it['weight_g']} g): re-check the list")
        holdback.append((it["id"], f"The file prints a serving weight of {it['weight_g']} g but protein {it['protein_g']} g + carbohydrate "
                         f"{it['carbs_g']} g + fat {it['fat_g']} g = {mass:g} g, more than the serving weighs (its per-100 g columns are impossible "
                         "too), so the weight or the figures are wrong. Not corrected."))
    for name, reason in HOLD_ALLERGEN_NAME.items():
        if name not in by_item:
            raise SystemExit(f"HOLD_ALLERGEN_NAME names {name!r}, which is not a published item: re-check the list")
        holdback.append((by_item[name]["id"], reason))
    return kept, holdback, skipped, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, required=True, help="path of allergens_JBUK.csv")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the file was compared with the live site")
    ap.add_argument("--fetch", action="store_true", help="download the file to --csv first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.csv)
    items, holdback, skipped, report = build(args.csv)
    guide = {"title": ALLERGEN_TITLE + ", data file allergens_JBUK.csv (1 October 2026)", "url": PAGE_URL,
             "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Jamaica Blue", cuisine="Coffee", source_title=SOURCE_TITLE, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=["jamaica blue", "jamaica blue uk", "jamaicablue"], items=items,
                             out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide)
    print(f"{args.csv.name} sha256 {sha256_file(args.csv)}")
    for k, v in skipped.items():
        print(f"not published ({k}): {len(v)}")
        if k not in ("incomplete", "ingredient", "site"):
            for n in v:
                print(f"    {n}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out} ({len(holdback)} held back)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
