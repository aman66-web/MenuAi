#!/usr/bin/env python3
"""Build data/source/baynes/ from Baynes' own "Nutritional Information" PDF (Scottish bakery, about 60 shops).

    python3 tools/uk_extract/baynes.py NUTRITION.pdf --allergen-pdf ALLERGENS.pdf --checked-on 2026-10-08 [--out DIR]

Sources (both linked from https://baynes.co.uk/allergen-nutrition/, both Excel exports "printed to PDF", issue date 06.10.26, version 108):
    nutrition  https://baynes.co.uk/wp-content/uploads/2026/10/Nutritional-Website-1.pdf   (5 pages, Last-Modified 2026-10-06)
    allergens  https://docs.baynes.co.uk/Allergens-Website.pdf                              (4 pages, Last-Modified 2026-10-06)
Needs `pdftotext` (poppler). The pages are read by position: see baynes_pdf.py. robots.txt of baynes.co.uk allows everything.

Numbers: the nutrition table has two blocks, "per 100g of product" and "per product". Only the PER PRODUCT block is published (a per-100g
value is not a serving and is never converted). Every value is copied as printed, as text ("5.0", "259.0"): kJ, kcal, fat, saturates,
carbohydrate, total sugars, protein and salt (salt_g; the guide prints salt, not sodium). The guide prints no fibre, no weights and no
serving column, so those stay blank. Only item NAMES, categories and the choices below are written by hand; the script stops if the PDF's
row count, headings, issue date or version change.

Names: printed names are used as they are, except that (1 slice) / (1 sausage) / (1 piece) / (8oz) / (12oz) after a name become the
item's `serving`, and a name printed in several sections (Ham Salad is a filled morning roll, a rye roll and a dark fired roll) gets its
section's printed name added in brackets so that no two items share a name. The product ids come from the final names.

Tags: `vegetarian` only for an item the allergen PDF's "Suitable for Vegetarians" column marks YES under the SAME section heading and the
SAME printed name (a name that differs in any way, such as "Apple Puff" / "Apple Turnover", gets no tag). contains_pork / contains_beef
only when the item's name says so (pork, bacon, ham, pepperoni, salami, chorizo, gammon, sausage -> pork unless the name says beef;
beef, steak -> beef).

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. The allergen PDF marks the 14 allergens as coloured cells, and its product names do
not match the nutrition PDF exactly: 35 of the 178 rows of the nutrition PDF have no row of the same name in it ("Apple Puff" / "Apple Turnover",
"Shell Steak Pie" / "Steak Pie", "Gingerbread" / "Plain Gingerbread", "White French Cake with Lilac Drizzle" / "French Cake with Lilac
Drizzle**", "Hot Chocolate" / "Hot Chocolate (12oz)", "Flat White (8oz)" / "Flat White Regular", the oat drinks, the hot roll
components, and the whole Filled Dark Fired Rolls section, which the allergen PDF does not have). Allergens are safety information: no
matching by similar names, so only the guide's link is published (all or nothing). The script prints the unmatched rows on every run.

rankable: filled rolls, baguettes and batons, hot rolls (melts), soup, and the savouries are meals; breads, cakes, biscuits, treats,
tea breads, drinks, celebration cakes and the parts of a hot filled roll are not. The Large and Medium Steak Pie print very large totals
(3,123 and 1,749 kcal), so they are not suggested either.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import baynes_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "baynes"
NUTRITION_URL = "https://baynes.co.uk/wp-content/uploads/2026/10/Nutritional-Website-1.pdf"
ALLERGEN_URL = "https://docs.baynes.co.uk/Allergens-Website.pdf"
EXPECTED_VERSION = "108"
EXPECTED_ISSUE = "06.10.26"
EXPECTED_ROWS = 178
SOURCE_TITLE = "Baynes Nutritional Information (MASTER Nutritional.xlsx, version 108, date of issue 06.10.26, PDF created 6 October 2026)"
ALLERGEN_TITLE = "Baynes Allergen Information (MASTER Allergens.xlsx, version 108, date of issue 06.10.26)"
# The allergen PDF prints one general warning (the bakery uses peanuts, nuts, gluten cereals, egg, soya, milk, fish, celery, mustard, sesame
# and sulphites at more than 10 ppm and cannot guarantee separation) and "May contain Milk" for the oat drinks: traces information is printed.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Baynes' own per-product figures, a guideline only (the bakery says its products are hand-crafted and vary). Loaves, large pies, "
        "gateaux and celebration cakes print very large totals, so check the size. No fibre or weights are published. Allergens: see the guide.")

# printed heading -> (category shown, rankable, limited_time). "Seasonal" / "Halloween range" are the guide's own labels.
CATEGORIES = {
    "HALLOWEEN RANGE 2026": ("Halloween range 2026", False, True),
    "Rolls & Breads": ("Rolls & breads", False, False),
    "Freshly Baked Savouries": ("Freshly baked savouries", True, False),
    "Small Cream Cakes": ("Small cream cakes", False, False),
    "Large Cream Cakes": ("Large cream cakes", False, False),
    "Tea Breads": ("Tea breads", False, False),
    "Seasonal Tea Bread": ("Seasonal tea bread", False, True),
    "Iced Tea Breads": ("Iced tea breads", False, False),
    "Small Cakes": ("Small cakes", False, False),
    "Large Cakes": ("Large cakes", False, False),
    "Components Of Hot Filled Rolls": ("Components of hot filled rolls", False, False),
    "Rolls with Butter": ("Rolls with butter", False, False),
    "Hot Rolls": ("Hot rolls", True, False),
    "Soup": ("Soup", True, False),
    "Tea & Hot Chocolate": ("Tea & hot chocolate", False, False),
    "Freshly Ground Coffee": ("Freshly ground coffee", False, False),
    "Iced Drinks": ("Iced drinks", False, False),
    "Celebration Cakes": ("Celebration cakes", False, False),
    "Filled Morning Rolls": ("Filled morning rolls", True, False),
    "Filled Rye Rolls": ("Filled rye rolls", True, False),
    "Simply Morning Roll Range": ("Simply morning roll range", True, False),
    "Filled Dark Fired Rolls": ("Filled dark fired rolls", True, False),
    "Filled Granary Rolls": ("Filled granary rolls", True, False),
    "Filled Baguettes": ("Filled baguettes", True, False),
    "Filled Batons": ("Filled batons", True, False),
}
# Whole-pie rows that print a total far beyond one person's order.
NOT_RANKABLE = {("Freshly Baked Savouries", "Large Steak Pie"), ("Freshly Baked Savouries", "Medium Steak Pie")}
# Capitalisation / spacing tidied for display (the printed text is shown in the report and notes).
TIDY = {"Empire Biscuit with jelly sweet": "Empire Biscuit with Jelly Sweet", 'Chocolate 8"Round': 'Chocolate 8" Round',
        'Chocolate 8"Square': 'Chocolate 8" Square', 'Sponge Sugar Paste 8"Round': 'Sponge Sugar Paste 8" Round',
        'Sponge Sugar Paste 8"Square': 'Sponge Sugar Paste 8" Square'}
SERVING = re.compile(r"^(.*?)\s*\((1 slice|1 sausage|1 piece|8oz|12oz)\)$")
SERVING_TEXT = {"8oz": "8 oz", "12oz": "12 oz"}
ID_OVERRIDE = {"Chocolate Éclair": "chocolate-eclair"}  # slug() would turn the accented letter into a hyphen
PORK = re.compile(r"\b(pork|bacon|ham|pepperoni|salami|chorizo|gammon)\b", re.I)
SAUSAGE = re.compile(r"\bsausage\b", re.I)  # pork unless the name says beef ("Beef Sausage Roll")
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
# Rows whose own printed figures contradict each other are NOT published (restoring one = deleting its line in holdback.csv).
HOLDBACK = {
    ("Iced Drinks", "Iced Caramel Latte"):
        "Per product the guide prints 527 kJ with 136 kcal (kJ/kcal = 3.88, every other row is 4.15-4.27) while its macros add up to 136 kcal; "
        "the Iced Vanilla Latte, whose macros are almost identical, prints 568 kJ. Not corrected.",
    ("Celebration Cakes", 'Sponge Sugar Paste 8"Square'):
        "Per product carbohydrate 1866 g does not fit the row's energy (4 x protein + 4 x carbohydrate + 9 x fat = 9,728 kcal against 8,535 kcal printed) "
        "nor the weight every other column implies with the per-100 g block (about 1,570 g). Not corrected.",
    ("Filled Dark Fired Rolls", "Ham and Cheese"):
        "Per product protein 13.4 g disagrees with the same row's per-100 g protein (14.4 g): every other column implies a product of about 135 g, "
        "which would be about 19 g of protein. Protein is the key figure, so the row is not published. Not corrected.",
}
# Facts about a published row worth knowing (items.csv notes; not exported). All concern the per-100 g block, which is not published.
ROW_NOTES = {
    ("HALLOWEEN RANGE 2026", "Halloween French Cake"): "Its per-100 g block (not used) does not add up: fat 3.8 g does not fit 340 kcal. The per-product block is consistent.",
    ("Small Cream Cakes", "Chocolate Éclair"): "Per-100 g fat is printed as 207 (not used); the per-product block is consistent.",
    ("Rolls with Butter", "Traditional Morning Roll with Butter"): "Per-100 g carbohydrate is printed as 551.8 (not used); the per-product block is consistent.",
    ("Iced Drinks", "Pineapple Twist"): "Per-100 g carbohydrate is printed as 47.0 with sugars 4.7 (not used); the per-product block is consistent.",
    ("Filled Rye Rolls", "Salad (no filling)"): "Per-100 g block prints 867 kJ with 507 kcal (not used); the per-product block is consistent.",
    ("Tea & Hot Chocolate", "Hot Chocolate"): "Per-product protein 8.4 g is about 16% above what the per-100 g protein (3.4 g) gives at the weight the other columns imply; published as printed.",
    ("Components Of Hot Filled Rolls", "Sliced Sausage (1 slice)"): "Meat not stated: tagged pork because of the word sausage.",
    ("Freshly Baked Savouries", "Large Steak Pie"): "Very large total (3,123 kcal): not suggested as an order.",
    ("Freshly Baked Savouries", "Medium Steak Pie"): "Very large total (1,749 kcal): not suggested as an order.",
}
# Items whose name does not say what meat they contain (for the report; no tag is written, except the sausage rule above).
MEAT_NOT_STATED = ["Mince & Onion Bridie", "Scotch Pie", "Black Pudding (1 slice)", "Chicken & Haggis Pie", "Sliced Sausage (1 slice)"]
# Per-heading row counts, so a changed table stops the run.
EXPECTED_COUNTS = {
    "HALLOWEEN RANGE 2026": 4, "Rolls & Breads": 8, "Freshly Baked Savouries": 15, "Small Cream Cakes": 7, "Large Cream Cakes": 6, "Tea Breads": 4,
    "Seasonal Tea Bread": 1, "Iced Tea Breads": 7, "Small Cakes": 14, "Large Cakes": 2, "Components Of Hot Filled Rolls": 5, "Rolls with Butter": 6,
    "Hot Rolls": 4, "Soup": 2, "Tea & Hot Chocolate": 12, "Freshly Ground Coffee": 18, "Iced Drinks": 7, "Celebration Cakes": 4,
    "Filled Morning Rolls": 9, "Filled Rye Rolls": 13, "Simply Morning Roll Range": 6, "Filled Dark Fired Rolls": 12, "Filled Granary Rolls": 4,
    "Filled Baguettes": 3, "Filled Batons": 5,
}


def build_items(rows: list[dict], vegetarian: dict) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The nutrition PDF has {len(rows)} product rows, this script expects {EXPECTED_ROWS}: the menu changed. Re-check the "
                         "tables (names, categories, holdbacks) and update EXPECTED_ROWS / EXPECTED_COUNTS.")
    counts: dict = {}
    for r in rows:
        heading = r["sub"] or r["top"]
        if heading not in CATEGORIES:
            raise SystemExit(f"A new section {heading!r}: add it to CATEGORIES (category, rankable, limited_time).")
        counts[heading] = counts.get(heading, 0) + 1
    if counts != EXPECTED_COUNTS:
        diff = {h: (counts.get(h, 0), EXPECTED_COUNTS.get(h, 0)) for h in set(counts) | set(EXPECTED_COUNTS) if counts.get(h, 0) != EXPECTED_COUNTS.get(h, 0)}
        raise SystemExit(f"Rows per section changed (found, expected): {diff}. Re-check the PDF and update EXPECTED_COUNTS.")
    shown = {}
    for r in rows:
        name = TIDY.get(r["name"], r["name"])
        serving = ""
        m = SERVING.match(name)
        if m:
            name, serving = m.group(1), SERVING_TEXT.get(m.group(2), m.group(2))
        shown[(r["sub"] or r["top"], r["name"])] = (name, serving)
    dup: dict = {}
    for (heading, printed), (name, _) in shown.items():
        dup.setdefault(slug(name), []).append((heading, printed))
    items, holdback, report = [], [], []
    unmatched = []
    used_holdbacks = set()
    for r in rows:
        heading = r["sub"] or r["top"]
        printed = r["name"]
        category, rankable, limited = CATEGORIES[heading]
        name, serving = shown[(heading, printed)]
        if len(dup[slug(name)]) > 1:
            name = f"{name} ({heading})"
        p = r["per"]
        tags = []
        flag = vegetarian.get((heading, printed))
        if flag is None:
            unmatched.append(f"{heading} / {printed}")
        elif flag == "YES":
            tags.append("vegetarian")
        beef = bool(BEEF.search(printed))
        if PORK.search(printed) or (SAUSAGE.search(printed) and not beef):
            tags.append("contains_pork")
        if beef:
            tags.append("contains_beef")
        if "vegetarian" in tags and any(t.startswith("contains_") for t in tags):
            raise SystemExit(f"{printed!r} is marked suitable for vegetarians but its name names a meat: check by hand")
        item = {"id": ID_OVERRIDE.get(name, slug(name)), "name": name, "category": category, "serving": serving, "energy_kj": p["kj"], "calories": p["kcal"],
                "fat_g": p["fat"], "sat_fat_g": p["sat"], "carbs_g": p["carbs"], "sugar_g": p["sugars"], "protein_g": p["protein"],
                "salt_g": p["salt"], "tags": "|".join(tags), "limited_time": limited,
                "rankable": rankable and (heading, printed) not in NOT_RANKABLE,
                "notes": "; ".join(x for x in (f"Printed '{printed}' under '{heading}'" if printed != name else "", ROW_NOTES.get((heading, printed), "")) if x)}
        key = (heading, printed)
        if key in HOLDBACK:
            used_holdbacks.add(key)
            holdback.append((item["id"], HOLDBACK[key]))
        items.append(item)
    if used_holdbacks != set(HOLDBACK):
        raise SystemExit(f"Held-back rows not found in the PDF: {sorted(set(HOLDBACK) - used_holdbacks)}")
    for key in ROW_NOTES:
        if key not in shown:
            raise SystemExit(f"ROW_NOTES names a row that is not in the PDF: {key}")
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids are not unique: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    report.append(f"vegetarian column: {len(rows) - len(unmatched)} of {len(rows)} rows have a row of the same section and name; no row for: " + "; ".join(unmatched))
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the nutrition PDF (NUTRITION_URL)")
    ap.add_argument("--allergen-pdf", type=Path, required=True, help="the allergen PDF (ALLERGEN_URL): read for the vegetarian column only")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"nutrition PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    print(f"allergen PDF  sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    meta, rows = pdf_reader.read_nutrition(args.pdf)
    vmeta, vegetarian = pdf_reader.read_vegetarian(args.allergen_pdf)
    for label, m in (("nutrition", meta), ("allergen", vmeta)):
        if m.get("version") != EXPECTED_VERSION or m.get("issue_date") != EXPECTED_ISSUE:
            raise SystemExit(f"The {label} PDF is version {m.get('version')} issued {m.get('issue_date')}, this script was written for version "
                             f"{EXPECTED_VERSION} issued {EXPECTED_ISSUE}: re-check the tables, then update EXPECTED_VERSION / EXPECTED_ISSUE.")
    items, holdback, report = build_items(rows, vegetarian)
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Baynes", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=NUTRITION_URL,
                             checked_on=args.checked_on, aliases=["baynes", "baynes bakery", "baynes bakers", "baynes the bakers", "baynes the family bakers",
                                                                  "bayne's", "bayne's the family bakers"],
                             items=items, out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide)
    print("\n".join(report))
    print("meat type not stated: " + ", ".join(MEAT_NOT_STATED))
    for item_id, reason in holdback:
        print(f"held back {item_id}: {reason}")
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
