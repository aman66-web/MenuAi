#!/usr/bin/env python3
"""Build data/source/chipotle/ from Chipotle UK's official "nutrition facts" sheet (a 2-page PDF).

    python3 tools/uk_extract/chipotle.py path/to/chipotle-nutrition.pdf --checked-on 2026-10-06

Numbers are copied from the PDF's table as printed, per serving (kcal, total fat, saturates, carbohydrates, sugars,
fibre, protein, salt; the sheet has no kJ and no per-100 g values). Only the NAMES, category, tags and notes below are
typed by hand, in the order the sheet prints its rows. The script stops if the row count or any row label differs from
ROWS, or if the sheet's printed date is no longer "AUG 2022", so a human re-checks the names and the source title.

Why `standard` items in one "Ingredients" category and no components: the sheet publishes a value for each ingredient
(tortilla, rice, beans, meats, salsas ...) but none for a finished burrito, bowl, salad or taco, and it does not say
what a serving of each ingredient weighs or how many a menu item holds. Building bowls would mean adding ingredients
together (and guessing portions), so each ingredient row is published as it is and none is rankable.

Column order is read from the header words' positions in the PDF (rotated text), not assumed: Energy (kcal), Total Fat,
Of Which Saturates, Carbohydrates, Of Which Sugars, Fibre, Protein, Salt (all in g except energy).

Source: https://www.chipotle.co.uk/nutrition-calculator (the page URL itself serves the PDF; Last-Modified 14 Dec 2023,
PDF metadata created 19 Sep 2022, printed date "AUG 2022"). Requires `pdftotext` (poppler).

ALLERGENS: link only (allergen_guide.csv, no allergens.csv). Chipotle UK's current allergen chart is ALLERGEN_URL, linked as
"NUTRITION" from https://www.chipotle.co.uk/allergens (footer code UK270726, PDF created 6 Aug 2026): a 14-allergen grid with
per-serving nutrition, but drawn entirely as outlines (no text layer, no fonts), so no script can read its row names; it can only
be read by eye or OCR. The AUG 2022 sheet's own page-2 allergen table is out of date (it marks the two roasted-tomato salsas with
gluten, soya, mustard and celery as cross-contamination, and the vinaigrette with sulphites; the 2026 chart marks none of these)
and names its rows by groups ("Meats (All)",
"Beans (Black & Pinto)", "Tortilla Chips"), not the item names, so it isn't used either. Every item's allergens stay None and
the app links to the chart. The 2026 chart prints no "may contain" per item (only a general open-kitchen warning).
"""
from __future__ import annotations
import argparse
import hashlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, write_chain_folder  # noqa: E402

CHAIN_ID = "chipotle"
SOURCE_URL = "https://www.chipotle.co.uk/nutrition-calculator"
SOURCE_TITLE = "Chipotle UK nutrition facts, per serving of each ingredient (AUG 2022)"
PRINTED_DATE = ("AUG", "2022")
ALIASES = ["chipotle", "chipotle mexican grill"]
ING = "Ingredients"
BEEF = "contains_beef"

NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')
FIELDS = ("kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
# Header word whose position gives each column's centre (the rotated headers are split into words).
HEADER_WORD = {"kcal": "Energy", "fat": "Total", "sat": "Saturates", "carbs": "Carbohydrates", "sugars": "Sugars",
               "fibre": "Fibre", "protein": "Protein", "salt": "Salt"}
LABEL_MAX_X = 120.0  # row labels sit left of this (points); the number cells start at about x=129
ROW_TOLERANCE = 4.0  # words whose vertical centres are this close belong to the same row
COLUMN_REACH = 6.0   # a number must sit within this many points of its column's centre

# One entry per printed row, in the sheet's order: (printed label, name, serving, tags, note).
# name None = a row we deliberately leave out (the note says why). No row is left out at present.
ROWS: list[tuple] = [
    ("Flour Tortilla* (burrito)", "Flour Tortilla (burrito)", "", [], "Printed with * (contains wheat)"),
    ("Flour Tortilla* (taco)", "Flour Tortilla (taco)", "", [], "Printed with * (contains wheat)"),
    ("Coriander-Lime White Rice", "Coriander-Lime White Rice", "", [], ""),
    ("Coriander-Lime Brown Rice", "Coriander-Lime Brown Rice", "", [], "Printed kcal (185) is higher than 4P + 4C + 9F gives (about 162)"),
    ("Black Beans", "Black Beans", "", [], "Printed kcal (95) is higher than 4P + 4C + 9F gives (about 70), which the check flags; fibre (8.6) is a separate column and higher than carbohydrate (4.9), and at 2 kcal/g it would add about 17 kcal. Entered as printed"),
    ("Pinto Beans", "Pinto Beans", "", [], "Printed kcal (95) is higher than 4P + 4C + 9F gives (about 57), which the check flags; fibre (11.2) is a separate column and higher than carbohydrate (6.2), and at 2 kcal/g it would add about 22 kcal (still about 16 short). The Black Beans row prints the same 95 kcal. Entered as printed"),
    ("Fajita Vegetables", "Fajita Vegetables", "", [], ""),
    ("Barbacoa", "Barbacoa", "", [], "Meat type not stated, so no meat tag. Triage found the 2026 menu card lists Braised Beef, not Barbacoa (not re-checked here), so this may no longer be sold; salt (0.3) is far lower than the other meats (2.0-2.2)"),
    ("Chicken", "Chicken", "", [], ""),
    ("Carnitas", "Carnitas", "", [], "Meat type not stated, so no meat tag"),
    ("Steak", "Steak", "", [BEEF], ""),
    ("Sofritas (braised tofu)", "Sofritas (braised tofu)", "", [], "The sheet has no vegetarian marking, so no vegetarian tag"),
    ("Fresh Tomato Salsa", "Fresh Tomato Salsa", "", [], "Sugars (1.5) are printed higher than carbohydrate (1.1)"),
    ("Chilli-Corn Salsa", "Chilli-Corn Salsa", "", [], ""),
    ("Roasted Tomato Green-Chilli Salsa**", "Roasted Tomato Green-Chilli Salsa", "", [], "Printed with ** (cross-contamination note); saturates printed as <0.1"),
    ("Roasted Tomato Red-Chilli Salsa**", "Roasted Tomato Red-Chilli Salsa", "", [], "Printed with ** (cross-contamination note); saturates printed as <0.1"),
    ("Cheese", "Cheese", "", [], "The allergen table names it Monterey Jack Cheese"),
    ("Sour Cream", "Sour Cream", "", [], "Fibre printed as <0.5"),
    ("Guacamole (topping/side)", "Guacamole (topping/side)", "", [], ""),
    ("Guacamole (large)", "Guacamole (large)", "Large", [], "Every value is exactly double the topping/side row"),
    ("Romaine Lettuce (salad)", "Romaine Lettuce (salad)", "", [], "Printed with 15 kcal but 0 g protein, carbohydrate and fat, and sugars (1.1) higher than carbohydrate (0)"),
    ("Romaine Lettuce (topping)", "Romaine Lettuce (topping)", "", [], "Printed with 4 kcal but 0 g protein, carbohydrate and fat, and sugars (0.3) higher than carbohydrate (0)"),
    ("Chips (regular)", "Chips (regular)", "Regular", [], "Fibre printed as 0"),
    ("Chips (large)", "Chips (large)", "Large", [], "Every value is exactly double the regular row; fibre printed as 0"),
    ("Chipotle Honey Vinaigrette", "Chipotle Honey Vinaigrette", "", [], ""),
]

# Rows the sheet prints impossibly (a part larger than its whole): not published, never corrected.
ALLERGEN_URL = "https://www.chipotle.co.uk/content/dam/chipotle/menu/nutrition/2026/eu/Allergen-UK270726.pdf"
ALLERGEN_GUIDE = {"title": "Chipotle UK 14 allergens and nutrition facts chart (UK270726)", "url": ALLERGEN_URL,
                  "may_contain_published": False}

HOLDBACK = [
    ("fresh-tomato-salsa", "The sheet prints sugars (1.5 g) higher than carbohydrate (1.1 g); sugars are part of carbohydrate."),
    ("romaine-lettuce-salad", "The sheet prints 15 kcal with 0 g carbohydrate, protein and fat, and 1.1 g sugars (sugars are part of carbohydrate)."),
    ("romaine-lettuce-topping", "The sheet prints 4 kcal with 0 g carbohydrate, protein and fat, and 0.3 g sugars (sugars are part of carbohydrate)."),
]

NOTE = ("Chipotle UK publishes values for single ingredients only, not finished burritos or bowls, and we don't add them "
        "together. The sheet is dated August 2022, so some ingredients may have changed since.")


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def norm(label: str) -> str:
    return re.sub(r"[^a-z0-9]", "", label.lower())


def _unescape(s: str) -> str:
    return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'").replace("&apos;", "'").replace("&quot;", '"')


def read_pages(pdf: Path) -> list[list[tuple]]:
    """Words per page as (xMin, yMin, xMax, yMax, text)."""
    with tempfile.NamedTemporaryFile(suffix=".html") as out:
        subprocess.run(["pdftotext", "-bbox", str(pdf), out.name], check=True)
        text = Path(out.name).read_text(encoding="utf-8")
    pages = []
    for chunk in text.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), _unescape(w)) for a, b, c, d, w in WORD.findall(chunk)])
    return pages


def read_rows(pdf: Path) -> list[dict]:
    """Table rows top to bottom: {"label": printed text, "values": {field: printed string}}. Stops on any surprise."""
    pages = read_pages(pdf)
    holders = [p for p in pages if any(w[4] == "Energy" for w in p)]
    if len(holders) != 1:
        raise SystemExit("Could not find the table's 'Energy' header on exactly one page: the sheet's layout changed.")
    words = holders[0]
    centres = {}
    for field, head in HEADER_WORD.items():
        found = [w for w in words if w[4] == head and w[0] > LABEL_MAX_X]
        if len(found) != 1:
            raise SystemExit(f"Could not find the column header {head!r} once: the sheet's layout changed.")
        centres[field] = (found[0][0] + found[0][2]) / 2
    header_bottom = max(w[3] for w in words if w[4] in HEADER_WORD.values() and w[0] > LABEL_MAX_X)
    foot = [w for w in words if w[4] == "Data" and w[1] > header_bottom]
    if len(foot) != 1:
        raise SystemExit("Could not find the 'Data above ...' footnote under the table: the sheet's layout changed.")
    foot_y = foot[0][1]

    body = [w for w in words if header_bottom <= w[1] < foot_y]
    mid = lambda w: (w[1] + w[3]) / 2  # noqa: E731
    numeric = sorted((w for w in body if w[0] > LABEL_MAX_X and NUM.match(w[4])), key=mid)
    clusters: list[list[tuple]] = []
    for w in numeric:
        if clusters and abs(mid(w) - mid(clusters[-1][-1])) <= ROW_TOLERANCE:
            clusters[-1].append(w)
        else:
            clusters.append([w])

    rows = []
    for cl in clusters:
        y = sum(mid(w) for w in cl) / len(cl)
        values: dict[str, str] = {}
        for w in cl:
            field = min(centres, key=lambda f: abs(centres[f] - (w[0] + w[2]) / 2))
            if abs(centres[field] - (w[0] + w[2]) / 2) > COLUMN_REACH or field in values:
                raise SystemExit(f"A number {w[4]!r} does not sit cleanly in one column: the sheet's layout changed.")
            values[field] = w[4]
        if set(values) != set(FIELDS):
            raise SystemExit(f"A table row has {len(values)} of the 8 numbers (missing {sorted(set(FIELDS) - set(values))}): the sheet's layout changed.")
        label_words = sorted((w for w in body if w[0] <= LABEL_MAX_X and abs(mid(w) - y) <= ROW_TOLERANCE), key=lambda w: w[0])
        rows.append({"label": " ".join(w[4] for w in label_words), "values": values})

    tail = {w[4] for p in pages for w in p if w[1] > 450}
    if not set(PRINTED_DATE) <= tail:
        raise SystemExit(f"The sheet no longer prints the date {' '.join(PRINTED_DATE)!r}: it was re-issued. Re-check ROWS and SOURCE_TITLE.")
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the sheet")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The sheet has {len(rows)} nutrition rows but this script names {len(ROWS)}. The menu changed: "
              "re-check the names in ROWS against the sheet before running again.", file=sys.stderr)
        return 1
    for n, (printed, spec) in enumerate(zip(rows, ROWS), start=1):
        if norm(printed["label"]) != norm(spec[0]):
            print(f"Row {n}: the sheet prints {printed['label']!r} but this script expects {spec[0]!r}. "
                  "The menu changed: re-check ROWS.", file=sys.stderr)
            return 1

    items = []
    for printed, (label, name, serving, tags, note) in zip(rows, ROWS):
        if name is None:
            continue
        v = printed["values"]
        items.append({
            "id": slug(name), "name": name, "category": ING, "serving": serving,
            "calories": v["kcal"], "protein_g": v["protein"], "carbs_g": v["carbs"], "fat_g": v["fat"],
            "sat_fat_g": v["sat"], "sodium_mg": "", "salt_g": v["salt"], "sugar_g": v["sugars"], "fiber_g": v["fibre"],
            "tags": "|".join(sorted(tags)), "limited_time": False, "rankable": False, "notes": note,
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    missing = [h for h, _ in HOLDBACK if h not in ids]
    assert not missing, f"holdback names items that no longer exist: {missing}"

    out = write_chain_folder(chain_id=CHAIN_ID, name="Chipotle", cuisine="Mexican", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=HOLDBACK,
                             allergen_guide={**ALLERGEN_GUIDE, "checked_on": args.checked_on})
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
