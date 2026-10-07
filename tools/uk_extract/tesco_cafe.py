#!/usr/bin/env python3
"""Build data/source/tesco-cafe/ from Tesco Cafe's official "GB Allergen Matrix" (a CALORIES-ONLY chain with a complete allergen matrix).

    python3 tools/uk_extract/tesco_cafe.py path/to/matrix.pdf --checked-on 2026-10-07 [--out DIR]

Source (Tesco's own digital-content CDN; the PDF that Tesco's Cafe pages link as the allergen matrix):
    https://digitalcontent.api.tesco.com/v2/media/homepage/3e74ec75-f288-46a3-90a6-5db01d5db09f/Summer+2026+GB+Allergen+Matrix+V5.pdf
    "SUMMER 2026 GB ALLERGEN MATRIX VERSION 5", 20 pages, PDF created 30 July 2026 (served Last-Modified 2 August 2026), A4 landscape,
    a real text layer. A separate Northern Ireland matrix exists and is not used.
Needs `pdftotext` (poppler). The grid is read by position: see tesco_cafe_pdf.py.

What the matrix prints, per row: the dish / drink name, "kcal per serving" (and nothing else numeric: no kJ, protein, carbohydrate, fat,
sugars, salt or weight anywhere in the file) and 26 allergen columns marked Y (contains) or M (may be present). So this is a CALORIES-ONLY
chain (docs/DATA.md): protein, carbs and fat stay blank. Calories are copied from the PDF as printed. Only the category names, the
cosmetic name fixes in NAME_FIXES and the tags are decided here, and the script stops if the rows the PDF prints are not the rows
expected below (a new, renamed or removed dish, another number of rows, a moved column).

How the matrix's own wording is read:
- Drinks pages say "kcal per serving, Small/Medium". A value "100/130 kcal" is therefore Small 100 and Medium 130: two items, "(Small)"
  and "(Medium)", with serving "Small"/"Medium" and the same allergens. A single value ("30 kcal", "110 kcal") is one item with no serving
  stated, because the matrix does not say which size it is for.
- Syrups print "50/75 kcal" the same way (the syrup's own calories for a small / medium drink): items "(Small)" / "(Medium)" too.
- Rows whose kcal cell is a dash (sugar, salt, pepper, sauces, vinegar, sweetener) print no calories: not published (no calories, no item).
- The page headed "Hot Food Counter - For Ingleby, Helsby & Heswall Only" is three venues only: not published.
- "(Scotland)" dishes (tattie scone breakfasts) stay in with the name as printed: the matrix is the GB (England, Scotland, Wales) one.
- A name printed twice with identical calories and identical allergen marks (Baked Beans, Butter Portion ...) is one item (the
  first printed). A name printed twice with different values (Peas: Kids 60 kcal, Sides 120 kcal) is held back, both rows: nothing
  says the portions differ, so the matrix contradicts itself (holdback.csv).
- A row whose own marks contradict each other (a named cereal or nut marked while Gluten / Nuts is not "Y") is held back too (none today).
- Allergens: every published item's allergens come from its OWN row of the same table, so they are complete (allergens.csv). A blank cell
  means the matrix marks nothing for that allergen. Y -> contains, M -> may_contain; the named cereals / tree nuts marked Y fill
  `cereals` / `nuts`. A named cereal / nut marked M only adds "may contain" gluten / nuts (already contained when Gluten / Nuts is Y).
- Tags: vegetarian only when the dish's own name says vegan, vegetarian or veggie; contains_pork when the name says bacon, ham, pork,
  sausage or chorizo (not for the dishes named vegan / vegetarian / veggie, and not for Lorne sausage, whose meat is not stated);
  contains_beef when it says beef or steak. Everything else is "meat type not stated" (printed in the report).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tesco_cafe_pdf as pdf_reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "tesco-cafe"
SOURCE_URL = "https://digitalcontent.api.tesco.com/v2/media/homepage/3e74ec75-f288-46a3-90a6-5db01d5db09f/Summer+2026+GB+Allergen+Matrix+V5.pdf"
SOURCE_TITLE = "Tesco Cafe Summer 2026 GB Allergen Matrix, Version 5 (kcal per serving; PDF created 30 July 2026)"
ALIASES = ["tesco cafe", "tesco café", "tesco the cafe", "the cafe tesco", "tesco's cafe"]
MATRIX_VERSION_LINE = "SUMMER 2026 GB ALLERGEN MATRIX VERSION 5"
# The matrix prints "M = This allergen may be present ... because there is high risk of cross contamination": traces are published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Tesco Cafe publishes calories only (kcal per serving), so protein, carbs and fat are not published. Drinks print Small / Medium "
        "values. Not listed: condiments that print no calories (sugar, salt, pepper, some sauces) and the Hot Food Counter (3 venues "
        "only). The cafe says shared equipment means any item can carry traces.")

# first-column heading printed on each table -> category shown
CATEGORIES = {"Drinks": "Drinks", "Breakfast": "Breakfast", "Breakfast Extras": "Breakfast extras", "Mains": "Mains", "Kids": "Kids",
              "Snacks & Bakery": "Snacks & bakery", "Sides": "Sides & condiments"}
# rows the PDF prints per table (the page-16 Hot Food Counter is skipped): the run stops if any of these changes
EXPECTED_ROWS = {"Drinks": 146, "Breakfast": 85, "Breakfast Extras": 25, "Mains": 28, "Kids": 25, "Snacks & Bakery": 23, "Sides": 33}
EXPECTED_SKIPPED_PAGES = {16: "For Ingleby, Helsby & Heswall Only"}
EXPECTED_NO_KCAL = 12      # rows whose kcal cell is a dash (Sweetener is printed twice)
EXPECTED_ITEMS = 389       # calorie rows after splitting Small/Medium (353 + 36), before dropping identical duplicates
EXPECTED_DUPLICATES_DROPPED = 9
EXPECTED_HELD_BACK = 2

# Cosmetic fixes to printed names only (key = name exactly as read from the PDF; the run stops if a key is no longer printed).
NAME_FIXES = {
    "Smashed Avo on Sourdough with, Feta & Sundried Tomatoes": "Smashed Avo on Sourdough with Feta & Sundried Tomatoes",
    "Cheese Sandwich (Made-In House)": "Cheese Sandwich (Made In-House)",
    "Fried Eggs On Sourdough Toast": "Fried Eggs on Sourdough Toast",
    "Fried Eggs On Multiseed Toast": "Fried Eggs on Multiseed Toast",
    "Fried Eggs On Wholemeal Toast": "Fried Eggs on Wholemeal Toast",
    "Poached Eggs On Sourdough Toast": "Poached Eggs on Sourdough Toast",
    "Poached Eggs On Multiseed Toast": "Poached Eggs on Multiseed Toast",
    "Poached Eggs On Wholemeal Toast": "Poached Eggs on Wholemeal Toast",
    "Scrambled Eggs On White Toast": "Scrambled Eggs on White Toast",
    "Scrambled Eggs On Sourdough Toast": "Scrambled Eggs on Sourdough Toast",
    "Scrambled Eggs On Multiseed Toast": "Scrambled Eggs on Multiseed Toast",
    "Scrambled Eggs On Wholemeal Toast": "Scrambled Eggs on Wholemeal Toast",
    "Butter portion": "Butter Portion",
}

# Values that look odd but are not impossible or contradicted: published as printed, flagged in items.csv `notes` (not exported).
ANOMALIES = {"Hot Chocolate with Soya": "Medium is only 25 kcal above Small; the other milks' Mediums are 65-85 above: possible misprint, entered as printed"}

# ids where slug() would turn an accented letter (the matrix prints "Créme", sic) into a hyphen
ID_OVERRIDES = {"Pistachio Créme Cookie": "pistachio-creme-cookie",
                "White Chocolate & Hazelnut Créme Cookie": "white-chocolate-and-hazelnut-creme-cookie"}

# allergen column header (as printed) -> the printed word handed to common.allergen_words. The four "... nut" headers are this chain's
# own spellings (common._A knows the plural forms), so they are added through `extra` and stay in this script.
HEADER_WORD = {"Gluten :": "gluten", "Wheat": "wheat", "Rye": "rye", "Barley": "barley", "Oats": "oats", "Crustaceans": "crustaceans",
               "Eggs": "eggs", "Fish": "fish", "Peanuts": "peanuts", "Soya": "soya", "Milk": "milk", "Nuts :": "nuts",
               "Almonds": "almonds", "Hazelnut": "hazelnut", "Walnut": "walnut", "Cashew nut": "cashew nut", "Pecan nut": "pecan nut",
               "Brazil nut": "brazil nut", "Pistachio nut": "pistachio nut", "Macadamia nut": "macadamia nut", "Celery": "celery",
               "Mustard": "mustard", "Sesame": "sesame", "Sulphites": "sulphites", "Lupin": "lupin", "Molluscs": "molluscs"}
EXTRA_WORDS = {"cashew nut": ("nuts", "cashew"), "pecan nut": ("nuts", "pecan"), "pistachio nut": ("nuts", "pistachio"),
               "macadamia nut": ("nuts", "macadamia")}
CEREAL_COLUMNS = ["Wheat", "Rye", "Barley", "Oats"]
NUT_COLUMNS = ["Almonds", "Hazelnut", "Walnut", "Cashew nut", "Pecan nut", "Brazil nut", "Pistachio nut", "Macadamia nut"]

VEG = re.compile(r"\b(vegan|vegetarian|veggie)\b", re.I)
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
NO_PORK_TAG = re.compile(r"\blorne\b", re.I)   # Lorne sausage: the matrix does not say which meat
MEAT_UNSPECIFIED = re.compile(r"\b(lorne|black pudding|deli focaccia)\b|^The (Big )?Breakfast\b|^Ultimate Breakfast Bap\b|^Breakfast Wrap\b", re.I)
KCAL_ONE = re.compile(r"^(\d+) kcal$")
KCAL_PAIR = re.compile(r"^(\d+) ?/ ?(\d+) kcal$")
NO_KCAL = {"-", "–", "­–", "­-"}   # a dash (some with a soft hyphen)


def row_allergens(row: dict) -> tuple[dict, str]:
    """-> (allergens dict for write_allergens, contradiction text or ''). Y -> contains, M -> may_contain."""
    marks = row["marks"]
    where = f"page {row['page']} {row['name']!r}"
    contains_words, may_words, y_cereal_words, y_nut_words = [], [], [], []
    for col, mark in marks.items():
        word = HEADER_WORD[col]
        if mark == "Y":
            contains_words.append(word)
            if col in CEREAL_COLUMNS:
                y_cereal_words.append(word)
            if col in NUT_COLUMNS:
                y_nut_words.append(word)
        else:
            may_words.append(word)
    contains, cereals, nuts = allergen_words(contains_words, where, EXTRA_WORDS)
    may, _, _ = allergen_words(may_words, where, EXTRA_WORDS)
    problems = []
    if y_cereal_words and marks.get("Gluten :") != "Y":
        problems.append(f"cereal marked Y ({', '.join(y_cereal_words)}) but Gluten is {marks.get('Gluten :') or 'blank'}")
    if y_nut_words and marks.get("Nuts :") != "Y":
        problems.append(f"tree nut marked Y ({', '.join(y_nut_words)}) but Nuts is {marks.get('Nuts :') or 'blank'}")
    for col in CEREAL_COLUMNS:
        if col in marks and "Gluten :" not in marks:
            problems.append(f"{col} marked but Gluten is blank")
    for col in NUT_COLUMNS:
        if col in marks and "Nuts :" not in marks:
            problems.append(f"{col} marked but Nuts is blank")
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}, "; ".join(problems)


def tags_for(name: str) -> tuple[list[str], bool]:
    """(tags, meat type not stated)."""
    veg = bool(VEG.search(name))
    tags = ["vegetarian"] if veg else []
    if not veg and PORK.search(name) and not NO_PORK_TAG.search(name):
        tags.append("contains_pork")
    if not veg and BEEF.search(name):
        tags.append("contains_beef")
    unspecified = (not veg) and not any(t.startswith("contains_") for t in tags) and bool(MEAT_UNSPECIFIED.search(name))
    return tags, unspecified


def build(pdf: Path) -> tuple[list[dict], list[tuple[str, str]], list[str], dict]:
    texts = pdf_reader.page_texts(pdf)
    if MATRIX_VERSION_LINE not in texts[1]:
        raise SystemExit(f"Page 2 no longer prints {MATRIX_VERSION_LINE!r}: this is a different edition, re-check the layout and the title.")
    rows, skipped = pdf_reader.read_matrix(pdf)
    if {s["page"]: s["banner"] for s in skipped} != EXPECTED_SKIPPED_PAGES:
        raise SystemExit(f"Venue-only pages changed: {[(s['page'], s['banner']) for s in skipped]}, expected {EXPECTED_SKIPPED_PAGES}")
    counts: dict = {}
    for r in rows:
        counts[r["title"]] = counts.get(r["title"], 0) + 1
    if counts != EXPECTED_ROWS:
        raise SystemExit(f"Rows per table changed: now {counts}, expected {EXPECTED_ROWS}. The matrix changed: re-read it and update the script.")
    drink_pages = {r["page"] for r in rows if r["title"] == "Drinks"}
    for n in drink_pages:
        if "Small/Medium" not in texts[n - 1]:
            raise SystemExit(f"Page {n} (Drinks) no longer says 'Small/Medium' above the kcal column")
    printed_names = {r["name"] for r in rows}
    missing = sorted(set(NAME_FIXES) - printed_names)
    if missing:
        raise SystemExit(f"NAME_FIXES keys no longer printed: {missing}")
    report: list[str] = []
    # 1. rows -> candidate items (a Small/Medium pair becomes two)
    cands: list[dict] = []
    no_kcal = []
    for r in rows:
        name = NAME_FIXES.get(r["name"], r["name"])
        category = CATEGORIES.get(r["title"])
        if category is None:
            raise SystemExit(f"New table heading {r['title']!r}: add it to CATEGORIES")
        cell = r["kcal"].strip()
        if cell in NO_KCAL:
            no_kcal.append(r["name"])
            continue
        allergens, contradiction = row_allergens(r)
        base = dict(row=r, category=category, allergens=allergens, contradiction=contradiction)
        one, pair = KCAL_ONE.match(cell), KCAL_PAIR.match(cell)
        if one:
            cands.append(dict(base, name=name, calories=one.group(1), serving=""))
        elif pair:
            if r["title"] != "Drinks":
                raise SystemExit(f"{r['name']!r} prints two values {cell!r} outside the Drinks tables: the size heading is not known")
            small, medium = pair.group(1), pair.group(2)
            cands.append(dict(base, name=f"{name} (Small)", calories=small, serving="Small", size_pair=(small, medium)))
            cands.append(dict(base, name=f"{name} (Medium)", calories=medium, serving="Medium", size_pair=(small, medium)))
        else:
            raise SystemExit(f"{r['name']!r}: kcal cell {cell!r} is not 'N kcal', 'N/N kcal' or a dash")
    if len(no_kcal) != EXPECTED_NO_KCAL:
        raise SystemExit(f"{len(no_kcal)} rows with a dash instead of calories, expected {EXPECTED_NO_KCAL}: {no_kcal}")
    if len(cands) != EXPECTED_ITEMS:
        raise SystemExit(f"{len(cands)} calorie rows after splitting sizes, expected {EXPECTED_ITEMS}: the matrix changed")
    report.append("not published, kcal printed as a dash: " + ", ".join(sorted(set(no_kcal))))
    # 2. duplicates by name: identical -> keep the first; different -> keep every row and hold them all back
    groups: dict = {}
    for c in cands:
        groups.setdefault(" ".join(c["name"].lower().split()), []).append(c)
    items: list[dict] = []
    held: dict = {}      # id of a candidate (python id()) -> reason
    dropped = 0
    keep: list[dict] = []
    for c in cands:
        g = groups[" ".join(c["name"].lower().split())]
        if g[0] is not c and all(x["calories"] == g[0]["calories"] and x["row"]["marks"] == g[0]["row"]["marks"] for x in g):
            dropped += 1
            report.append(f"dropped identical duplicate: {c['name']!r} (page {c['row']['page']}, {c['category']}); kept page {g[0]['row']['page']}")
            continue
        keep.append(c)
        if len(g) > 1 and not all(x["calories"] == g[0]["calories"] and x["row"]["marks"] == g[0]["row"]["marks"] for x in g):
            where = "; ".join(f"{x['category']} {x['calories']} kcal" for x in g)
            held[id(c)] = f"The same name is printed more than once with different values ({where}) and nothing says the portions differ"
        if c["contradiction"]:
            held[id(c)] = "The row's own allergen marks contradict each other: " + c["contradiction"]
        if "size_pair" in c and int(c["size_pair"][0]) >= int(c["size_pair"][1]):
            held[id(c)] = f"Small ({c['size_pair'][0]} kcal) is not smaller than Medium ({c['size_pair'][1]} kcal)"
    if dropped != EXPECTED_DUPLICATES_DROPPED:
        raise SystemExit(f"{dropped} identical duplicates dropped, expected {EXPECTED_DUPLICATES_DROPPED}")
    # 3. items (ids as common.write_chain_folder will make them: slug of the name, -2 for a second item with the same slug)
    seen: dict = {}
    holdback: list[tuple[str, str]] = []
    unspecified: list[str] = []
    for c in keep:
        base = ID_OVERRIDES.get(c["name"]) or slug(c["name"])
        n = seen.get(base, 0)
        seen[base] = n + 1
        item_id = base if n == 0 else f"{base}-{n + 1}"
        tags, meat_unspecified = tags_for(c["name"])
        if meat_unspecified:
            unspecified.append(c["name"])
        r = c["row"]
        notes = f"Page {r['page']}, {r['title']} table; printed {r['kcal']!r}"
        if r["name"] in NAME_FIXES and NAME_FIXES[r["name"]] != r["name"]:
            notes += f"; printed name {r['name']!r}"
        if r["name"] in ANOMALIES:
            notes += "; " + ANOMALIES[r["name"]]
            report.append(f"anomaly (published as printed): {c['name']}: {ANOMALIES[r['name']]}")
        items.append(dict(id=ID_OVERRIDES.get(c["name"]), name=c["name"], category=c["category"], serving=c["serving"], calories=c["calories"],
                          tags="|".join(tags), rankable=False, notes=notes, allergens=c["allergens"]))
        if id(c) in held:
            holdback.append((item_id, held[id(c)]))
    if len(holdback) != EXPECTED_HELD_BACK:
        raise SystemExit(f"{len(holdback)} rows held back, expected {EXPECTED_HELD_BACK}: {holdback}")
    report += [f"held back {i}: {why}" for i, why in holdback]
    report.append(f"meat type not stated ({len(unspecified)}): " + "; ".join(unspecified))
    report.append("hot food counter page(s) skipped (venue-only): " + "; ".join(f"page {s['page']} {s['banner']}: {', '.join(s['names'])}" for s in skipped))
    return items, holdback, report, {"rows": len(rows), "calorie_rows": len(cands), "dropped": dropped}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the matrix PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded and read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"matrix PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    items, holdback, report, stats = build(args.pdf)
    guide = {"title": "Tesco Cafe GB Allergen Matrix, Summer 2026, Version 5 (20 pages)", "url": SOURCE_URL, "checked_on": args.checked_on,
             "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Tesco Cafe", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
