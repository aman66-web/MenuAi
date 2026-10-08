#!/usr/bin/env python3
"""Build data/source/chozen/ from Chozen's official "Nutritional Information" PDF (file name 082018: an AUGUST 2018 file).

    python3 tools/uk_extract/chozen.py path/to/Chozen-Noodle-Nutritional-Information-082018.pdf --checked-on 2026-10-08 [--out DIR]

Source: https://chozen.co.uk/wp-content/uploads/2021/08/Chozen-Noodle-Nutritional-Information-082018.pdf, the file linked as
"GENERAL NUTRITIONAL INFO" from https://chozen.co.uk/nutrition/ (checked 2026-10-08; robots.txt allows everything). The PDF is an Excel
export (created 16 October 2018, 4 A4 pages, text layer). It is EIGHT YEARS OLD but it is the only nutrition file Chozen publishes, so it
is published with a note that says so. The page itself says "Care and attention have been taken to ensure all information in this
document is as accurate as possible at the time of printing".

How it works
- `pdftotext -tsv` (poppler) gives every word with its position. Rows are rebuilt from the words and each number is assigned to a column
  by its x position, so a blank cell stays blank and nothing slides into the wrong column (Noodles has no fibre, Sweet Chilli Sauce has no
  fat or saturates, Sriracha Chilli Sauce has no fibre).
- The columns are per portion, as the file prints them: Portion Size (g), Energy (Kcal), Protein, Carbohydrate, Sugars, Fibre, Fat,
  Saturated Fat, Salt. Numbers are copied as printed ("608.4", "0.04"); nothing is converted or rounded here (the pipeline rounds
  calories to whole numbers). Salt is salt_g (the Salads table header says "(g)", the others only "Salt"). No kJ, no sodium, no mono/poly/trans.
  The portion size is copied as weight_g. No "serving" text is typed except what the file says ("REGULAR 2 SCOOPS SAUCE", "Large").
- Only the NAMES, categories and grouping below are typed by hand. SPEC lists every row of the PDF in reading order with its printed
  label. If the PDF gains, loses, renames or reorders a row, this script stops so a human re-checks SPEC.
- A row whose own numbers cannot be true is held back (HOLDBACK, holdback.csv) and never corrected.

Mixed chain: Sweet Chilli Sauce prints protein and carbohydrate but no fat, and a published item has protein, carbs and fat together or none
(docs/DATA.md "Mixed chains"), so that row is published with calories, sugars, fibre, salt and weight only. Its printed protein (0.2) and
carbohydrate (16.7) are in the row's notes.

Allergens: link only. Chozen's allergen file (CHOZEN-ALLERGENS-FEBRUARY-2022.pdf, pages marked "Updated 26/27 August 2023") is a tick
matrix of images with its own product names ("CP SWEET AND SOUR CHICKEN", "RED/GREEN THAI VEG.", "HOISIN DUCK", "JAVA CURRY SAUCE",
"GOBO VEGETABLE SPRING ROLLS", "RICE"), no row at all for Panang, Massaman, Spicy Sesame, Beef Rendang, Gangnam Sauce, the dressings,
Roast Chicken / Seafood Udon and the two brown rice soups, and a different edition from the 2018 nutrition file. Allergens are safety
information: no name matching, no guessing, so only the guide's link is published (all or nothing).
"""
from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "chozen"
SOURCE_URL = "https://chozen.co.uk/wp-content/uploads/2021/08/Chozen-Noodle-Nutritional-Information-082018.pdf"
SOURCE_TITLE = ("Chozen Noodle Nutritional Information (August 2018: file name 082018, Excel export created 16 October 2018; "
                "still the file linked from chozen.co.uk/nutrition on 8 October 2026)")
ALLERGEN_URL = "https://chozen.co.uk/wp-content/uploads/2022/03/CHOZEN-ALLERGENS-FEBRUARY-2022.pdf"
ALLERGEN_TITLE = ("Chozen allergen matrix (file name February 2022; its pages say 'Updated 26 August 2023' and 'Updated 27 August 2023'; "
                  "linked from chozen.co.uk/nutrition as ALLERGY ADVICE)")
EXPECTED_SHA256 = "96ebe69eb302c68680bad1ef41a8b9924884b551fb219c28170d237f9440a5c6"
NOTE = ("Chozen's nutrition file is dated 2018 (file name 082018, created October 2018) and is still the one linked from its nutrition page, "
        "so recipes and portions may have changed. It covers the hot food, sides, salads and soups only: newer items such as sushi boxes "
        "are not in it.")

NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
FIELDS = ("portion", "kcal", "protein", "carbs", "sugars", "fibre", "fat", "sat", "salt")
NAME_MIN_X, NAME_MAX_X = 15.0, 245.0
# Column centres are 272, 336, 400, 466.5, 533, 597, 661, 725, 789 pt (same on all four pages): the edges are the midpoints.
COL_EDGES = (304.0, 368.0, 433.0, 500.0, 565.0, 629.0, 693.0, 757.0)


# ---------------------------------------------------------------- reading the PDF
def read_rows(pdf: Path) -> list[dict]:
    """Every table row in reading order: {'label': printed name, <FIELDS>: printed text or ''}."""
    with tempfile.NamedTemporaryFile(suffix=".tsv") as out:
        subprocess.run(["pdftotext", "-tsv", str(pdf), out.name], check=True)
        raw = list(csv.reader(Path(out.name).read_text(encoding="utf-8").splitlines(), delimiter="\t"))[1:]
    # (page, left, centre x, centre y, text)
    words = [(int(r[1]), float(r[6]), float(r[6]) + float(r[8]) / 2, float(r[7]) + float(r[9]) / 2, r[11]) for r in raw
             if r[0] == "5" and r[11].strip()]
    rows: list[dict] = []
    for page in sorted({w[0] for w in words}):
        ws = sorted((w for w in words if w[0] == page and w[1] >= NAME_MIN_X), key=lambda w: w[3])
        lines: list[list[tuple]] = []
        for w in ws:
            if lines and abs(w[3] - sum(x[3] for x in lines[-1]) / len(lines[-1])) <= 3.5:
                lines[-1].append(w)
            else:
                lines.append([w])
        for line in lines:
            line.sort(key=lambda w: w[1])
            name_words = [w[4] for w in line if w[1] < NAME_MAX_X]
            cells = ["" for _ in FIELDS]
            for w in line:
                if w[1] >= NAME_MAX_X:
                    if not NUMBER.match(w[4]):
                        continue  # header words such as "(Kcal)" or "Fat (g)" sit on rows with no name
                    col = sum(1 for e in COL_EDGES if w[2] > e)
                    if cells[col]:
                        raise SystemExit(f"two numbers in one cell on page {page}: {' '.join(name_words)}")
                    cells[col] = w[4]
            if not name_words or not any(cells):
                continue  # titles, column headers and the empty bordered rows are not data rows
            if not cells[0] or not cells[1]:
                raise SystemExit(f"page {page}: '{' '.join(name_words)}' has no portion size or no calories: the layout changed")
            rows.append({"label": " ".join(name_words), "page": page, **dict(zip(FIELDS, cells))})
    return rows


# ---------------------------------------------------------------- what each printed row becomes
CAT_W, CAT_B, CAT_N = "Hot food with white rice", "Hot food with brown rice", "Hot food with noodles"
CAT_SIDE, CAT_SALAD, CAT_SOUP, CAT_SAUCE = "Side orders", "Salads", "Udon and rice soups", "Sauces, dressings and pastes"
CATEGORY_ORDER = [CAT_W, CAT_B, CAT_N, CAT_SIDE, CAT_SALAD, CAT_SOUP, CAT_SAUCE]
REGULAR = "Regular, 2 scoops of sauce"
BASE_NOTE = "Printed under the table heading 'REGULAR 2 SCOOPS SAUCE'"
PART = "A plain portion of the base alone (not a complete order)"

# The twelve sauces in the order every block prints them: (printed stem, display stem, tags). Beef Rendang names beef.
STEMS = [
    ("Sweet & Sour", "Sweet & Sour", ""), ("Thai Red Chicken", "Thai Red Chicken", ""), ("Green Thai Chicken", "Green Thai Chicken", ""),
    ("Teriyaki Chicken", "Teriyaki Chicken", ""), ("Red Thai Vegetable", "Red Thai Vegetable", ""), ("Panang", "Panang", ""),
    ("Spicy Sesame", "Spicy Sesame", ""), ("Massaman Chicken Curry", "Massaman Chicken Curry", ""),
    ("Beef Rendang", "Beef Rendang", "contains_beef"), ("Chicken Katsu Curry", "Chicken Katsu Curry", ""),
    ("Prawn Katsu Curry", "Prawn Katsu Curry", ""), ("Pumpkin Katsu Curry", "Pumpkin Katsu Curry", ""),
]
# Printed spellings that differ from the other blocks (the label the PDF prints for stem number i in a block).
WHITE_PRINTED_RICE_ONLY = {7, 8, 9, 10, 11}  # the white rice block prints "... with Rice" for these five (and "... with White Rice" for the first seven)
TYPO = {("Chicken Katsu Curry", "noodles"): "Chicken Katsyu Curry"}  # printed "Chicken Katsyu Curry with Noodles"


def block(kind: str) -> list[tuple]:
    out = []
    for i, (stem, display, tags) in enumerate(STEMS):
        if kind == "white":
            printed = f"{stem} with {'Rice' if i in WHITE_PRINTED_RICE_ONLY else 'White Rice'}"
            name, cat, tail = f"{display} with White Rice", CAT_W, " with White Rice"
        elif kind == "brown":
            printed, name, cat = f"{stem} with Brown Rice", f"{display} with Brown Rice", CAT_B
        else:
            printed, name, cat = f"{TYPO.get((stem, 'noodles'), stem)} with Noodles", f"{display} with Noodles", CAT_N
        notes = [BASE_NOTE]
        if printed != name:
            notes.append(f"printed '{printed}'" + (" in the white rice block" if kind == "white" and "with Rice" in printed else " (a typo for Katsu)"))
        out.append((printed, name, cat, REGULAR, True, "; ".join(notes), tags))
    plain = {"white": ("White Rice", CAT_W), "brown": ("Brown Rice", CAT_B), "noodles": ("Noodles", CAT_N)}[kind]
    out.append((plain[0], plain[0], plain[1], "", False, PART, ""))
    return out


# An included row: (printed label, display name, category, serving, rankable, note, tags). Order = the PDF's reading order.
SPEC: list[tuple] = [
    *block("white"), *block("brown"), *block("noodles"),
    ("Chicken gyozas x3", "Chicken Gyozas (x3)", CAT_SIDE, "", True, "", ""),
    ("Vegetable Gyozas x3", "Vegetable Gyozas (x3)", CAT_SIDE, "", True, "", ""),
    ("Vegetable Spring Rolls x2", "Vegetable Spring Rolls (x2)", CAT_SIDE, "", True, "", ""),
    ("Duck Spring Rolls x3", "Duck Spring Rolls (x3)", CAT_SIDE, "", True, "", ""),
    ("Ebi Prawn each", "Ebi Prawn (each)", CAT_SIDE, "", False, "One piece: not an order on its own", ""),
    ("Pumpkin Croquettes x2", "Pumpkin Croquettes (x2)", CAT_SIDE, "", True, "Fibre is printed as 0.0", ""),
    ("Popcorn Chicken portion x4", "Popcorn Chicken (portion x4)", CAT_SIDE, "", True, "", ""),
    ("Chicken Katsu x2", "Chicken Katsu (x2)", CAT_SIDE, "", True, "", ""),
    ("Sweet Chilli Sauce", "Sweet Chilli Sauce", CAT_SAUCE, "", False,
     "Printed in the Side Orders table (continued on page 3). Protein 0.2 g and carbohydrate 16.7 g are printed but fat and saturates are blank, so "
     "protein, carbs and fat are not published (all three or none)", ""),
    ("Gangnam Sauce", "Gangnam Sauce", CAT_SAUCE, "", False, "Printed in the Side Orders table (continued on page 3)", ""),
    ("Curry Sauce", "Curry Sauce", CAT_SAUCE, "", False, "Printed in the Side Orders table (continued on page 3)", ""),
    ("Chicken Katsu Salad", "Chicken Katsu Salad", CAT_SALAD, "", True, "", ""),
    ("Chicken Teriyaki Salad", "Chicken Teriyaki Salad", CAT_SALAD, "", True, "", ""),
    ("Avocado & Egg Salad", "Avocado & Egg Salad", CAT_SALAD, "", True, "", ""),
    ("Vegetable Gyoza Salad", "Vegetable Gyoza Salad", CAT_SALAD, "", True, "", ""),
    ("Miso, Carrot & Turmeric Dressing (Excel)", "Miso, Carrot & Turmeric Dressing", CAT_SAUCE, "", False,
     "Printed with '(Excel)' after the name; printed in the Salads table", ""),
    ("Lime & Coriander Dressing (Excel)", "Lime & Coriander Dressing", CAT_SAUCE, "", False,
     "Printed with '(Excel)' after the name; printed in the Salads table", ""),
    ("Teriyaki Sauce Dressing", "Teriyaki Sauce Dressing", CAT_SAUCE, "", False, "Printed in the Salads table", ""),
    ("Sweet Chilli Mayo", "Sweet Chilli Mayo", CAT_SAUCE, "", False, "Printed in the Salads table", ""),
    ("Lime, Soy & Sweet Chilli Dressing", "Lime, Soy & Sweet Chilli Dressing", CAT_SAUCE, "", False, "Printed in the Salads table", ""),
    ("Roast Chicken Udon Large", "Roast Chicken Udon (large)", CAT_SOUP, "Large", True, "", ""),
    ("Vegetable Gyoza Udon Large", "Vegetable Gyoza Udon (large)", CAT_SOUP, "Large", True, "", ""),
    ("Seafood Udon Large", "Seafood Udon (large)", CAT_SOUP, "Large", True, "", ""),
    ("Chicken Gyoza Udon Large", "Chicken Gyoza Udon (large)", CAT_SOUP, "Large", True, "", ""),
    ("Salmon Brown Rice Soup Large", "Salmon Brown Rice Soup (large)", CAT_SOUP, "Large", True, "", ""),
    ("Chicken Brown Rice Soup Large", "Chicken Brown Rice Soup (large)", CAT_SOUP, "Large", True, "", ""),
    ("Sriracha Chilli Sauce", "Sriracha Chilli Sauce", CAT_SAUCE, "", False,
     "Printed at the foot of the Udon Soups table (continued on page 4); fibre is blank", ""),
    ("Tom Yum Paste", "Tom Yum Paste", CAT_SAUCE, "", False, "Printed at the foot of the Udon Soups table (continued on page 4)", ""),
]
EXPECTED_ROWS = 67

# Rows whose own numbers cannot be true (printed label -> reason). Not published, never corrected.
HOLDBACK = {
    "Massaman Chicken Curry with Noodles": (
        "Guide prints 65.4 g protein, 132.4 g carbohydrate and 52.5 g fat (saturates 28.4 g, salt 10.6 g), which add up to about 1,260 kcal, "
        "but 652.2 kcal; the same dish with white or brown rice prints 26.2 / 94.6 / 13.3 g and 27.8 / 86.7 / 14.8 g. The row cannot be right"),
    "Chicken Brown Rice Soup Large": (
        "Guide prints 159.2 g carbohydrate, 32.3 g protein and 12.0 g fat, which add up to about 874 kcal, but 648.4 kcal; 159.2 g of "
        "carbohydrate alone is about 637 kcal. The row cannot be right"),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=None, help="default: data/source/chozen")
    args = ap.parse_args()

    sha = sha256_file(args.pdf)
    if sha != EXPECTED_SHA256:
        print(f"NOTICE: the PDF is not the 2018 file this script was written for (sha256 {sha}). If Chozen published a newer file, "
              "update SOURCE_TITLE and NOTE (the file is no longer dated 2018) and re-check SPEC.", file=sys.stderr)

    rows = read_rows(args.pdf)
    printed = [r["label"] for r in rows]
    expected = [s[0] for s in SPEC]
    if printed != expected or len(rows) != EXPECTED_ROWS:
        print(f"The PDF has {len(printed)} nutrition rows but SPEC names {len(expected)}. The menu or layout changed.", file=sys.stderr)
        extra = [p for p in printed if p not in expected]
        missing = [e for e in expected if e not in printed]
        if extra:
            print("  In the PDF but not in SPEC:", *extra, sep="\n    ", file=sys.stderr)
        if missing:
            print("  In SPEC but not in the PDF:", *missing, sep="\n    ", file=sys.stderr)
        if not extra and not missing:
            print("  Same rows, different order or count of repeats: compare the PDF with SPEC.", file=sys.stderr)
        print("Re-check the names, categories and exclusions in SPEC against the PDF, then run again.", file=sys.stderr)
        return 1

    items, held, id_of, not_stated = [], [], {}, []
    for row, spec in zip(rows, SPEC):
        label, name, category, serving, rankable, note, tags = spec
        blanks = [f for f in ("sugars", "fibre", "fat", "sat") if not row[f]]
        notes = [note] if note else []
        if blanks:
            notes.append("not printed: " + ", ".join(blanks))
        macros_complete = all(row[k] for k in ("protein", "carbs", "fat"))
        it = {
            "name": name, "category": category, "serving": serving, "rankable": rankable and macros_complete, "tags": tags,
            "calories": row["kcal"], "sat_fat_g": row["sat"], "salt_g": row["salt"], "sugar_g": row["sugars"], "fiber_g": row["fibre"],
            "weight_g": row["portion"], "notes": "; ".join(notes),
        }
        if macros_complete:
            it.update(protein_g=row["protein"], carbs_g=row["carbs"], fat_g=row["fat"])
        elif any(row[k] for k in ("protein", "carbs", "fat")) and label != "Sweet Chilli Sauce":
            print(f"'{label}' prints some but not all of protein, carbohydrate and fat: decide how to publish it.", file=sys.stderr)
            return 1
        elif not any(row[k] for k in ("protein", "carbs", "fat")):
            print(f"'{label}' prints no protein, carbohydrate or fat: check SPEC.", file=sys.stderr)
            return 1
        id_of[label] = slug(name)
        items.append(it)
        if label in {f"{s} with {b}" for s in ("Sweet & Sour", "Panang", "Spicy Sesame") for b in ("White Rice", "Brown Rice", "Noodles")}:
            not_stated.append(name)

    for label, reason in HOLDBACK.items():
        if label not in id_of:
            print(f"HOLDBACK names '{label}', which is not an included row.", file=sys.stderr)
            return 1
        held.append((id_of[label], reason))
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps the PDF order inside a category

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Chozen", cuisine="Noodles", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["chozen", "chozen noodle", "chozen noodle bar", "chozen noodles"], items=items,
        out=args.out, note=NOTE, holdback=held, nutrition_level="mixed",
        allergen_guide={"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True})
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items ({len(held)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"PDF sha256 {sha}")
    print(f"meat type not stated (name names no protein): {len(not_stated)}: " + ", ".join(not_stated))
    return 0


if __name__ == "__main__":
    sys.exit(main())
