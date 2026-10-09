#!/usr/bin/env python3
"""Build data/source/muffin-break/ from Muffin Break's own allergen & nutrition data file.

    python3 tools/uk_extract/muffin_break.py --csv DIR/allergens_MBUK.csv --checked-on 2026-10-09 [--fetch]

The chain's allergen app (https://allergens-muffinbreak.co.uk/, region "England, Scotland & Wales") loads one CSV,
https://allergens-muffinbreak.co.uk/csv/allergens_MBUK.csv (591 rows on 2026-10-09, file dated 2 October 2026). --fetch downloads it
first: robots.txt is read and matched with robots_rfc (a 404 means the host publishes no rules; anything else unexpected stops the run),
then one request, a normal browser User-Agent. The other site muffinbreak.co.uk answers Cloudflare 403 and is NOT used.

Every number is copied from the file's "per serving" columns exactly as printed. Only names, categories and rankable are typed here.
What is published and what is not (each rule stops or reports, nothing is guessed):
  * "Portion Code" starting with a letter (BREAD, INGREDIENT, Allergen, ALLERGEN): the chain's own site marks these rows "Ingredient used
    in the product recipe - listed for allergen purposes only" and hides their nutrition, so they are not published (45 rows).
  * "Brand" = [LEWISHAM HOSPITAL]: the site tags it "Only available in Muffin Break Lewisham Hospital" (single venue): left out.
  * tagged [Scotland] (Irn Bru): a Scotland-only drink, a regional product: left out.
  * founder's rule 2026-10-09: only COMPLETE nutrition. A row with a blank calories, protein, carbohydrate or fat cell is left out
    (43 rows: bottled drinks, tea, espresso, syrups). A blank is never read as 0.
  * Salt is NOT published. The chain's own website (RecipesContext chunk of allergens-muffinbreak.co.uk) displays the file's "Salt per
    100g" value in its per-serving table and the "Salt per serving" value in its per-100g table, labelled "Sodium", so the website and the
    file disagree on every row. The two copies do not agree, so salt stays blank.
Meaning of name tags, from the chain's own site: [H] = "This product is made from ingredients suitable for Halal consumption." The other
bracketed words are the chain's own variant labels and are kept in parentheses. [BR nnnn] are internal recipe codes and are dropped.
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

CHAIN_ID = "muffin-break"
HOST = "https://allergens-muffinbreak.co.uk"
CSV_URL = HOST + "/csv/allergens_MBUK.csv"
PAGE_URL = HOST + "/allergens/mbuk"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
EXPECTED_ROWS = 591
SOURCE_TITLE = ("Muffin Break UK (England, Scotland & Wales) Allergens and Nutrition Information, data file allergens_MBUK.csv "
                "(file dated 2 October 2026)")
ALLERGEN_TITLE = "Muffin Break Allergens and Nutrition Information (England, Scotland & Wales)"
NOTE = ("Figures are per serving from Muffin Break's own England, Scotland & Wales data file. Drinks, tea, espresso and syrups where the "
        "file leaves protein, carbs or fat blank are not published, nor are its ingredient-only rows. Salt is left out: the chain's website "
        "and its file disagree on it.")

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

# chain's own "Recipe Description" -> (display order). Unknown categories stop the run.
CATEGORIES = ["Breakfast", "Breads", "Savoury", "Made to Order", "Muffins", "Muffins (Very Low Gluten)", "Duffins", "Cake",
              "Sweet Products", "Desserts", "Seasonal", "Coffee", "Hot Drinks", "Cold Drinks Made", "Cold Drinks",
              "Hot Beverage Modifiers", "Ingredients"]
# Recipe Notes (the chain's sub-group) that are whole meals/mains/sandwiches/savoury bakes: suggested by Best for you.
# Everything else (muffins, cakes, cookies, sweet breakfast bakes, pancakes, "(Topper)" cheese toppings, drinks, add-ons) is not.
RANKABLE_NOTES = {"Panini", "Italian Flatbread", "Sandwich", "Toastie", "Wrap", "Burrito", "Bagel", "Bap", "Egg Muffin", "Roll",
                  "Cannelloni", "Sausage Roll", "Hand Pie", "Quiche", "Savoury Croissant", "Soup", "Savoury Tart", "Tortilla Stack",
                  "Yorkshire Pudding", "Brunch From The Kitchen"}
LIMITED_CATEGORIES = {"Seasonal"}

NUM = re.compile(r"^\d+(\.\d+)?$")
PORK = re.compile(r"(?<!turkey )(?<!turkey-)\b(bacon|ham|gammon)\b|\b(salami|chorizo|nduja|pork|pancetta)\b|"
                  r"(?<!beef )(?<!chicken )(?<!vegan )\bsausage\b", re.I)
CHICKEN_CHORIZO = re.compile(r"chicken chorizo", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
MEAT_NOT_STATED = re.compile(r"\b(BLT|HCT|Gyros|Burger|Classic Breakfast)\b|- Meat\b|Yorkie Wrap - Breakfast", re.I)
SIZE_WORDS = {"LRG": "Large", "MED": "Medium", "SML": "Small"}


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
    if not robots_rfc.allowed(rules, "/csv/allergens_MBUK.csv"):
        raise SystemExit(f"robots.txt disallows /csv/allergens_MBUK.csv: do not download; ask the founder for the file")
    time.sleep(1)
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": UA, "Accept": "text/csv,text/plain;q=0.9,*/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.read())


def clean_name(raw: str) -> str:
    """'[MBUK] Toastie - BLT [White Bread] [H]' -> 'Toastie - BLT (White Bread) (Halal ingredients)'."""
    name = raw.strip()
    if not name.startswith("[MBUK]"):
        raise SystemExit(f"unexpected name {raw!r}: every row should start with [MBUK]")
    name = name[len("[MBUK]"):].strip()
    name = re.sub(r"\s*\[BR \d+\]", "", name)
    name = re.sub(r"^\[Kids\]\s*", "Kids ", name)
    name = re.sub(r"\[H\]", "(Halal ingredients)", name)
    name = re.sub(r"\[([^\]]+)\]", r"(\1)", name)
    name = " ".join(SIZE_WORDS.get(w, w) for w in name.split())
    return re.sub(r"\s+", " ", name).strip()


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
    items: list[dict] = []
    skipped = {"ingredient": [], "location": [], "scotland": [], "incomplete": []}
    report: list[str] = []
    for r in rows:
        raw = r["Recipe Name"]
        if r["Recipe Description"] not in CATEGORIES:
            raise SystemExit(f"new category {r['Recipe Description']!r}: add it to CATEGORIES (and decide its place)")
        code = r["Portion Code"].strip()
        if r["Brand"].strip():
            skipped["location"].append(raw)
            continue
        if re.match(r"[a-z]", code, re.I):  # the site's own rule: a letter-led code (other than NPD) = ingredient row
            skipped["ingredient"].append(raw)
            continue
        if "[Scotland]" in raw:
            skipped["scotland"].append(raw)
            continue
        need = ["Energy Kcal (kcal) per serving", "Protein (g) per serving", "Carbohydrate (g) per serving", "Fat (g) per serving"]
        if any(r[c].strip() == "" for c in need):
            skipped["incomplete"].append(raw)
            continue
        name = clean_name(raw)
        nums = {}
        for key, col in (("calories", "Energy Kcal (kcal) per serving"), ("protein_g", "Protein (g) per serving"),
                         ("carbs_g", "Carbohydrate (g) per serving"), ("fat_g", "Fat (g) per serving"),
                         ("sat_fat_g", "Saturated Fat (g) per serving"), ("sugar_g", "Sugars (g) per serving"),
                         ("fiber_g", "Fibre (g) per serving"), ("energy_kj", "Energy Kj (kJ) per serving")):
            v = r[col].strip()
            if v != "" and not NUM.match(v):
                raise SystemExit(f"{name}: {col} = {v!r} is not a plain number: handle it explicitly")
            nums[key] = v
        m = re.match(r"^(\d+(?:\.\d+)?)g$", r["Portion Measure (g)"].strip())
        if not m:
            raise SystemExit(f"{name}: Portion Measure {r['Portion Measure (g)']!r} is not '<n>g'")
        nums["weight_g"] = m.group(1)
        plain = re.sub(r"\[[^\]]*\]", "", raw[len("[MBUK]"):]).replace("  ", " ")
        vegan = bool(re.search(r"vegan", raw, re.I))
        tags = []
        if vegan:
            tags.append("vegetarian")  # the chain's own name says Vegan
        else:
            if PORK.search(CHICKEN_CHORIZO.sub("", plain)):
                tags.append("contains_pork")
            if BEEF.search(plain):
                tags.append("contains_beef")
            if not tags and MEAT_NOT_STATED.search(plain):
                report.append(f"meat type not stated: {name}")
        category = r["Recipe Description"]
        items.append({"name": name, "category": category, "serving": "", **nums, "tags": "|".join(tags),
                      "limited_time": category in LIMITED_CATEGORIES, "rankable": r["Recipe Notes"] in RANKABLE_NOTES and "(Topper)" not in name,
                      "notes": "", "allergens": allergens_for(r, name, report), "_id": r["Recipe ID"]})
    # two published rows that clean to the same name: identical numbers = one dish; different numbers = held back, never chosen between
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(it["name"], []).append(it)
    holdback: list[tuple[str, str]] = []
    kept: list[dict] = []
    for name, group in by_name.items():
        sig = {tuple(g[k] for k in ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "energy_kj", "weight_g"))
               for g in group}
        if len(group) > 1 and len(sig) > 1:
            raise SystemExit(f"{name!r} appears {len(group)} times with different numbers: hold back by hand, never choose")
        kept.append(group[0])
        if len(group) > 1:
            report.append(f"dropped exact duplicate: {name}")
    kept.sort(key=lambda it: (CATEGORIES.index(it["category"]), it["name"].lower()))
    for it in kept:
        it.pop("_id")
        it["id"] = slug(it["name"])
        # impossible in the chain's own file: protein + carbohydrate + fat per serving weigh more than the serving (same rule as
        # tools/audit/accuracy_audit.py). Its per-100g columns add up to more than 100 g for the same rows. Never corrected.
        macro_g = sum(float(it[k]) for k in ("protein_g", "carbs_g", "fat_g"))
        wt = float(it["weight_g"])
        if macro_g > wt * 1.05 + 1:
            holdback.append((it["id"], f"the chain's own file prints protein+carbohydrate+fat = {macro_g:.0f} g in a {it['weight_g']} g serving "
                                       "(more than the serving weighs); not published, never corrected"))
    names = {it["name"]: it["id"] for it in kept}
    for name, reason in NAME_HOLDBACK.items():
        if name not in names:
            raise SystemExit(f"NAME_HOLDBACK names {name!r} but the file no longer has it: re-check the list")
        holdback.append((names[name], reason))
    return kept, holdback, skipped, report


# Rows whose allergen marks contradict the dish's own name in the chain's own file (never corrected, never chosen between).
NAME_HOLDBACK = {
    "Iced Coffee Matcha & Pistachio": ("named for pistachio but the file marks no tree nut, while the chain's other pistachio drinks "
                                       "(Iced Coffee Pistachio, Frappe - Pistachio, Latte Salted Pistachio) mark tree nuts and pistachio"),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, required=True, help="path of allergens_MBUK.csv")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the file was compared with the live site")
    ap.add_argument("--fetch", action="store_true", help="download the file to --csv first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.csv)
    items, holdback, skipped, report = build(args.csv)
    guide = {"title": ALLERGEN_TITLE + ", data file allergens_MBUK.csv (2 October 2026)", "url": PAGE_URL,
             "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Muffin Break", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=["muffin break", "muffinbreak"], items=items, out=args.out,
                             note=NOTE, holdback=holdback, allergen_guide=guide)
    print(f"{args.csv.name} sha256 {sha256_file(args.csv)}")
    for k, v in skipped.items():
        print(f"not published ({k}): {len(v)}")
        if k != "incomplete":
            for n in v:
                print(f"    {n}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
