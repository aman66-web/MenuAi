#!/usr/bin/env python3
"""Build data/source/wenzels/ from Wenzel's the Bakers' official Allergen Sheet PDF (page 8, hand-READ from the rendered page).

    python3 tools/uk_extract/wenzels.py path/to/Wenzels_Allergen_Sheet_June_2026.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file Wenzel's own site serves; robots.txt only disallows /wp-json/, Crawl-delay 10 honoured, one download):
    https://www.wenzels.co.uk/wp-content/uploads/2026/06/Wenzels_Allergen_Sheet_June_2026.pdf
    "ALLERGEN SHEET VERSION NO - 07 19/06/2026", 9 A4 pages made in Canva, created 2026-06-22, served Last-Modified 2026-06-22.
    SHA-256 99cdafd5985aa2ee4260afcb0a61e5d609f2238731058e09960c549fe5ba511f (the script stops if the file differs).

WHY THE NUMBERS ARE IN A CSV. Page 8, "NUTRITIONAL INFORMATION (PER SERVING)", is ONE IMAGE (1754 x 1240 px, about 150 ppi, no text layer):
three side-by-side tables of 37 + 40 + 49 = 126 recipes (plus a "BELGIAN BUN" row printed with no figures). Nothing can be parsed from the file, so
the numbers in tools/uk_extract/wenzels_values.csv were READ from the rendered image and checked (see the header of that CSV: two full reads,
kJ/kcal ratio on every row, the pipeline's 4P+4C+9F check, a pixel-spacing check of every decimal point). This script re-checks on every run:
the PDF's SHA-256, the exact row list (127 rows, names and order), that every published row has all nine figures, and that kJ is 4.184 x kcal
(+-0.3%) on every row, so a typed digit that does not belong to its row is caught.

What is published and what is not (the CSV lists EVERY printed row; HOLDBACK below lists the rows the chain's own numbers make impossible):
- Per serving as sold; the sheet states no serving or weight, so `serving` is blank and there is no weight_g. Extra column captured: energy_kj.
  Printed columns: kcal, kJ, fat, saturates, carbohydrates, fibre, sugars, protein, salt (salt in g, never converted). Full nutrition level.
- Held back (holdback.csv, nothing corrected): rows with saturates greater than fat or sugars greater than carbohydrate, a salt figure that is
  not credible (251.27 g; 23.76 g and 26.72 g beside 7-9 g on the baguettes), or calories that differ from 4P+4C+9F by more than the pipeline's 15%.
- The page has no sections: categories are hand-written grouping. rankable is false for drinks, cakes and sweet bakes, bread and rolls, sides.
- Tags: vegetarian only where the name says vegan (Vegan Roll); contains_pork / contains_beef only where the name says so. The sheet's own
  matrix (pages 4-7, images) marks no vegetarian items.
- Allergens (docs/DATA.md "Allergens"): the sheet's allergen matrix, pages 5-7 (page 4 is photos), is also images: 127 recipe rows by 26 allergen columns, each cell
  one printed word, "Y" (an ingredient -> contains), "May" (the sheet's precautionary "may contain" -> may_contain) or "N". tools/uk_extract/wenzels_matrix.py
  reads every cell BY PIXELS (see its docstring; all 3,302 cells classify without an in-between case). Every published item is tied by its printed name to ONE
  matrix row (ALLERGEN_NAME_ALIAS lists the two spelling differences: the matrix prints "Jam Donut" and "Iced England Donut", page 8 prints "Doughnut"; the
  row is the same recipe in the same position in both tables); the Belgian Bun (printed in the matrix, no figures on page 8) is the only matrix row left over.
  The six "Gluten Source" columns and eight tree-nut columns name the kind: a dish marked Y for wheat and May for rye publishes gluten as "contains" and, because
  the guide also prints may-contain gluten, common.write_allergens drops the named cereal (policy 2 in docs/ACCURACY_AUDIT.md). The sheet's page 3 also says every
  product is made where gluten, egg, milk, nuts, fish, mustard, celery, sesame, soya and sulphites are handled and cannot be guaranteed free of them: the data
  contract has no field for a chain-wide statement, so it is in note.txt, never added to the per-dish rows. A dish whose matrix row contradicts its own
  name (policy 3) is held back: ALLERGEN_HOLDBACK.
"""
from __future__ import annotations
import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wenzels_matrix  # noqa: E402
from common import sha256_file, slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "wenzels"
PDF_SHA256 = "99cdafd5985aa2ee4260afcb0a61e5d609f2238731058e09960c549fe5ba511f"
SOURCE_URL = "https://www.wenzels.co.uk/wp-content/uploads/2026/06/Wenzels_Allergen_Sheet_June_2026.pdf"
SOURCE_TITLE = "Wenzel's the Bakers Allergen Sheet, version 07 (19 June 2026), page 8 Nutritional Information (per serving)"
ALLERGEN_TITLE = "Wenzel's the Bakers Allergen Sheet, version 07 (19 June 2026): allergen matrix, pages 4-7 (contains and may contain)"
ALIASES = ["wenzels", "wenzel's", "wenzels the bakers", "wenzel's the bakers"]
VALUES_CSV = Path(__file__).with_name("wenzels_values.csv")
EXPECTED_ROWS = 127            # every printed row of page 8, including BELGIAN BUN (no figures)
EXPECTED_PUBLISHED_ROWS = 126  # rows with figures
EXPECTED_HELD_BACK = 16
NOTE = ("From the chain's own allergen sheet, version 07 (19 June 2026), per serving; no serving sizes are printed. Whole loaves, bloomers and "
        "the slab cake look like whole-item values. Rows whose own numbers contradict each other (coffees, two breakfast rolls' salt and a few "
        "others) are left out. Wenzel's say everything is made where gluten, egg, milk, nuts, fish and other allergens are handled.")
assert len(NOTE) < 400, len(NOTE)
# the matrix (pages 5-7) spells two names differently from page 8: normalised page-8 name -> normalised matrix name
ALLERGEN_NAME_ALIAS = {"jamdoughnut": "jamdonut", "icedenglanddoughnut": "icedenglanddonut"}
EXPECTED_MATRIX_ROWS = 127
EXPECTED_UNMAPPED_MATRIX_ROWS = {"belgianbun"}   # printed in the matrix, no figures on page 8
# product name -> reason. A matrix row that contradicts the recipe's own name (policy 3, docs/ACCURACY_AUDIT.md) is held back, never shown, never corrected.
ALLERGEN_HOLDBACK: dict = {
    "White Tuna Salad Bloomer": "Its allergen row marks no fish although the dish is a tuna salad bloomer, and the Multiseed Tuna Salad Bloomer (same filling) is "
                                "marked fish (the audit's tuna-without-fish flag); the sheet contradicts itself, so the dish is left out rather than shown with a "
                                "fish-free row; not corrected",
    "Cherry Bakewell Tart": "A Bakewell tart is made with almond (frangipane), yet its allergen row marks no nut in any of the eight tree-nut columns "
                            "(the Almond Madeira and Almond Muffin rows do mark almonds); a row that contradicts the dish's own name is not shown as "
                            "nut-free, so the dish is left out; not corrected",
}

NUM_KEYS = ["kcal", "kj", "fat", "sat", "carbs", "fibre", "sugars", "protein", "salt"]
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo|nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
VEGAN = re.compile(r"\bvegan\b", re.I)
KJ_PER_KCAL = 4.184

# (table, row) -> reason. The chain's own numbers contradict each other or are not credible; never corrected. To restore a row, delete its line.
HOLDBACK = {
    ("L", "21"): "Its own figures contradict each other: calories 967.6 vs 4P+4C+9F = 775 (with fibre 786), 20% lower; printed per serving: 967.6 kcal, 4048.44 kJ, fat 34.8 g, saturates 19.2 g, carbohydrate 89.4 g, protein 26 g; left out until the chain corrects its sheet",
    ("M", "3"): "Its own figures contradict each other: calories 395.5 vs 4P+4C+9F = 290 (with fibre 297), 27% lower; printed per serving: 395.5 kcal, fat 8.8 g, carbohydrate 31.7 g, protein 21 g; left out until the chain corrects its sheet",
    ("M", "25"): "Salt prints 23.76 g for a 648 kcal roll while the Breakfast Baguette prints 7.66 g and the Big Breakfast Baguette 9.1 g: not a credible figure (looks like a misplaced decimal); not corrected",
    ("M", "26"): "Salt prints 26.72 g for a 977 kcal roll while the Breakfast Baguette prints 7.66 g and the Big Breakfast Baguette 9.1 g: not a credible figure (looks like a misplaced decimal); not corrected",
    ("R", "11"): "Sugars print 113.6 g beside carbohydrate 74.7 g, which is impossible (and calories 584.12 vs 4P+4C+9F = 452); not corrected",
    ("R", "12"): "Its own figures contradict each other: calories 440.23 vs 4P+4C+9F = 284 (with fibre 286), 35% lower; the Two Cornflake Cakes row prints the same 440 kcal as this single cake; left out until the chain corrects its sheet",
    ("R", "14"): "Its own figures contradict each other: calories 440 vs 4P+4C+9F = 284 (with fibre 286), 35% lower; it prints the same figures as the single Cornflake Cake; left out until the chain corrects its sheet",
    ("R", "24"): "Salt prints 251.27 g, which is impossible, beside 2,247.68 kcal and 102.9 g fat for a roll (the 4 Crusty Rolls row prints 192.06 kcal); not corrected",
    ("R", "28"): "Saturates print 18.3 g beside fat 11 g, which is impossible (and calories 171.6 vs 4P+4C+9F = 320); not corrected",
    ("R", "29"): "Saturates print 16.5 g beside fat 8.4 g, which is impossible (and calories 92.4 vs 4P+4C+9F = 241); not corrected",
    ("R", "40"): "Saturates print 7.7 g beside fat 7 g, which is impossible (and calories 161 vs 4P+4C+9F = 202); not corrected",
    ("R", "41"): "Saturates print 6.7 g beside fat 5.9 g, which is impossible (and calories 128.8 vs 4P+4C+9F = 168); not corrected",
    ("R", "44"): "Saturates print 6.5 g beside fat 5.5 g, which is impossible (and calories 117 vs 4P+4C+9F = 159); not corrected",
    ("R", "45"): "Saturates print 4.6 g beside fat 2.3 g, which is impossible (and calories 26 vs 4P+4C+9F = 66); not corrected",
    ("R", "46"): "Saturates print 4.5 g beside fat 2.2 g, which is impossible (and calories 25.2 vs 4P+4C+9F = 65); not corrected",
    ("R", "47"): "Saturates print 2.3 g beside fat 1.1 g, which is impossible (and calories 12.38 vs 4P+4C+9F = 32); not corrected",
}
# printed oddities that are kept (they are the chain's own numbers and not impossible), reported for the founder
ODD = {
    ("R", "9"): "Almond Madeira prints only 25.77 kcal (fat 1.4 g, carbohydrate 2.9 g): the sheet gives no weight, so it may be a tasting piece; kept as printed",
    ("R", "17"): "Small Bloomer Loaf 1107.76 kcal: looks like a whole-loaf figure; kept as printed",
    ("R", "18"): "Multiseed Bloomer 2225.15 kcal: looks like a whole-loaf figure; kept as printed",
    ("R", "22"): "Large Bloomer Loaf 2289.66 kcal: looks like a whole-loaf figure; kept as printed",
    ("R", "23"): "Seeded Bloomer Loaf 2546.19 kcal: looks like a whole-loaf figure; kept as printed",
    ("R", "8"): "Marble Slab Cake 1490.4 kcal: looks like a whole-cake figure; kept as printed",
    ("M", "23"): "Salt 9.1 g is high beside the other breakfast items (3-7.7 g); kept as printed",
}


def read_values() -> list:
    lines = [ln for ln in VALUES_CSV.read_text(encoding="utf-8").splitlines() if not ln.startswith("#")]
    rows = list(csv.DictReader(lines))
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit("wenzels_values.csv has %d rows, expected %d: the sheet changed, read page 8 again" % (len(rows), EXPECTED_ROWS))
    published = 0
    seen = set()
    for r in rows:
        key = (r["table"], r["row"])
        if key in seen:
            raise SystemExit("wenzels_values.csv: duplicate row %s%s" % key)
        seen.add(key)
        if r["status"] != "publish" and not r["status"].startswith("exclude: "):
            raise SystemExit("wenzels_values.csv: bad status %r on %s" % (r["status"], r["product"]))
        if r["status"].startswith("exclude"):
            if any(r[k] for k in NUM_KEYS):
                raise SystemExit("wenzels_values.csv: excluded row %s carries numbers" % r["product"])
            continue
        published += 1
        for k in NUM_KEYS:
            if r[k].strip() == "":
                raise SystemExit("wenzels_values.csv: %s has no %s" % (r["product"], k))
            float(r[k])
        ratio = float(r["kj"]) / float(r["kcal"])
        if abs(ratio - KJ_PER_KCAL) > 0.0125:
            raise SystemExit("%s%s %s: kJ %s is not 4.184 x kcal %s (ratio %.3f): a number was typed wrongly" % (r["table"], r["row"], r["product"], r["kj"], r["kcal"], ratio))
    if published != EXPECTED_PUBLISHED_ROWS:
        raise SystemExit("%d rows with figures, expected %d" % (published, EXPECTED_PUBLISHED_ROWS))
    unknown = [k for k in HOLDBACK if k not in seen]
    if unknown:
        raise SystemExit("HOLDBACK names rows that are not in the CSV: %s" % unknown)
    return rows


def build(rows: list) -> tuple:
    items, holdback, report = [], [], []
    for r in rows:
        if not r["status"] == "publish":
            continue
        key = (r["table"], r["row"])
        product = r["product"]
        v = {k: r[k].strip() for k in NUM_KEYS}
        if key not in HOLDBACK:
            if float(v["sugars"]) > float(v["carbs"]) + 0.01 or float(v["sat"]) > float(v["fat"]) + 0.01:
                raise SystemExit("%s: sugars > carbs or saturates > fat in a row that is not held back: add it to HOLDBACK after checking the page" % product)
            if float(v["salt"]) > 15:
                raise SystemExit("%s: salt %s g is not credible: add it to HOLDBACK after checking the page" % (product, v["salt"]))
        tags = []
        if VEGAN.search(product):
            tags.append("vegetarian")
        if PORK.search(product):
            tags.append("contains_pork")
        if BEEF.search(product):
            tags.append("contains_beef")
        if key not in HOLDBACK and r["category"] != "Drinks" and re.search(r"breakfast|club", product, re.I) and not PORK.search(product):
            report.append("meat type not stated: " + product)
        notes = ODD.get(key, "")
        items.append({"name": product, "category": r["category"], "serving": "", "calories": v["kcal"], "protein_g": v["protein"],
                      "carbs_g": v["carbs"], "fat_g": v["fat"], "sat_fat_g": v["sat"], "sugar_g": v["sugars"], "fiber_g": v["fibre"],
                      "salt_g": v["salt"], "energy_kj": v["kj"], "tags": "|".join(tags), "rankable": r["rankable"] == "true",
                      "notes": notes, "_key": key})
        if notes:
            report.append(notes)
    ids = [slug(it["name"]) for it in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two items share an id: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    for it in items:
        key = it.pop("_key")
        if key in HOLDBACK:
            holdback.append((slug(it["name"]), HOLDBACK[key]))
    return items, holdback, report


def attach_allergens(items: list, matrix: list) -> list:
    """Tie every published item to ONE matrix row by printed name and add its allergens. Returns the report lines."""
    if len(matrix) != EXPECTED_MATRIX_ROWS:
        raise SystemExit("the matrix has %d rows, expected %d" % (len(matrix), EXPECTED_MATRIX_ROWS))
    by_name: dict = {}
    for row in matrix:
        by_name.setdefault(wenzels_matrix.norm(row["name"]), []).append(row)
    for name, rows in by_name.items():                       # the same dish printed twice must agree exactly
        if len(rows) > 1 and any(r["words"] != rows[0]["words"] for r in rows[1:]):
            raise SystemExit("the matrix prints %r twice with different marks: not published" % name)
    used = set()
    for it in items:
        key = wenzels_matrix.norm(it["name"])
        key = ALLERGEN_NAME_ALIAS.get(key, key)
        if key not in by_name:
            raise SystemExit("%s: no matrix row of that printed name: hold it back in ALLERGEN_HOLDBACK instead of guessing" % it["name"])
        if len(by_name[key]) != 1:
            raise SystemExit("%s: the matrix has several rows of that name" % it["name"])
        used.add(key)
        row = by_name[key][0]
        it["allergens"] = {"contains": row["contains"], "may_contain": row["may_contain"], "cereals": row["cereals"], "nuts": row["nuts"]}
    left = set(by_name) - used
    if left != EXPECTED_UNMAPPED_MATRIX_ROWS:
        raise SystemExit("matrix rows tied to no item: %s (expected %s)" % (sorted(left), sorted(EXPECTED_UNMAPPED_MATRIX_ROWS)))
    return ["matrix rows tied to items: %d of %d (left over: %s)" % (len(used), len(matrix), ", ".join(sorted(left)))]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDF was downloaded and compared with wenzels_values.csv")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    digest = sha256_file(args.pdf)
    if digest != PDF_SHA256:
        raise SystemExit("%s has SHA-256 %s, but wenzels_values.csv was read from %s: a new sheet needs page 8 read again (pdfimages -f 8 -l 8 -png, "
                         "upscale 4x and 6x, read every cell twice), then update wenzels_values.csv and PDF_SHA256." % (args.pdf, digest, PDF_SHA256))
    rows = read_values()
    items, holdback, report = build(rows)
    if len(holdback) != EXPECTED_HELD_BACK:
        raise SystemExit("%d held-back rows, expected %d" % (len(holdback), EXPECTED_HELD_BACK))
    report += attach_allergens(items, wenzels_matrix.read_matrix(args.pdf))
    held = {h[0] for h in holdback}
    for name, reason in ALLERGEN_HOLDBACK.items():
        if slug(name) not in {slug(it["name"]) for it in items}:
            raise SystemExit("ALLERGEN_HOLDBACK names %r, which is not an item" % name)
        if slug(name) not in held:
            holdback.append((slug(name), reason))
            held.add(slug(name))
    # A dish held back for its ALLERGEN row (it contradicts the dish's own name) gets no allergens.csv row at all, so deleting its holdback line
    # stops the build instead of publishing the contradicting row; every other item, including those held back only for their numbers, keeps its row.
    no_row = {slug(n) for n in ALLERGEN_HOLDBACK}
    allergen_rows = [(slug(it["name"]), it["allergens"]) for it in items if slug(it["name"]) not in no_row]
    published = [it for it in items if slug(it["name"]) not in held]
    assert all(slug(it["name"]) not in no_row for it in published), "a dish held back for its allergens is published"
    assert {i for i, _ in allergen_rows} >= {slug(it["name"]) for it in published}, "a published dish has no allergen row"
    assert len(ALLERGEN_HOLDBACK) * 3 <= len(items), "too many dishes held back for their allergens: link-only is better"
    for it in items:
        it["allergens"] = None    # write_chain_folder writes the guide link only; allergens.csv is written below (abokado.py pattern)
    guide = {"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Wenzel's the Bakers", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide)
    with open(Path(out) / "items.csv", newline="", encoding="utf-8") as f:           # allergens.csv in items.csv's order
        order = {r["id"]: n for n, r in enumerate(csv.DictReader(f))}
    allergen_rows.sort(key=lambda r: order[r[0]])
    write_allergens(out, CHAIN_ID, allergen_rows, guide)
    print("pdf sha256", digest)
    print("\n".join(report))
    print("wrote %d items (%d held back) to %s; %d allergen rows (%d dishes held back for their allergen row)" % (len(items), len(holdback), out, len(allergen_rows), len(no_row)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
