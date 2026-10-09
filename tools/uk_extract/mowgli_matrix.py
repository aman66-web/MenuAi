"""Read Mowgli's own allergen matrix PDF (the page's "View Allergens Matrix PDF" link) into one row per dish. Python 3.9.

Used by tools/uk_extract/mowgli.py. Needs `pdftotext` (poppler). Nothing is guessed: the marks are text glyphs of the PDF itself
(FontAwesome "Check" glyphs, which pdftotext reports as the word "Check", and "(Check)" for the key's "(tick) Optional ingredient"),
so no colour or pixel reading is needed. The page is read by position:

  * a dish row is a line of the dish-name column (words whose left edge is left of NAME_X1) on the FOOD MENU page (page 1; page 2 is
    the drinks menu and is not read), between the first dish row and the "Brighton Exclusive" last row;
  * a mark belongs to the dish row whose name sits at the same height (the mark's top is 1.5-3.5 points below the name's top);
  * a mark belongs to the allergen column whose cell (COLUMNS, measured from this PDF in points) holds the mark's centre. Text next to a
    mark in the cell ("WHEAT", "WHEAT, BARLEY", "OAT", "ALMONDS", "PRAWNS") names the cereal / tree nut / crustacean kind.

Everything that does not fit (a mark outside every column, a mark on no row, a column header that moved, a different number of rows or
of marks) raises, so a new layout stops the run.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
NAME_X0, NAME_X1 = 70.0, 268.0       # points: the dish-name column
# allergen key -> (left, right) edge of its cell in points, measured from Mowgli-Mv35 v3 (Rev 35); keys follow tools/uk_extract/common._A
COLUMNS: List[Tuple[str, float, float]] = [
    ("celery", 270.7, 293.0), ("gluten", 293.0, 343.4), ("crustaceans", 343.4, 378.0), ("eggs", 378.0, 400.3), ("fish", 400.3, 422.6),
    ("lupin", 422.6, 444.9), ("milk", 444.9, 467.3), ("molluscs", 467.3, 490.3), ("mustard", 490.3, 512.6), ("nuts", 512.6, 554.4),
    ("peanuts", 554.4, 576.7), ("sesame", 576.7, 599.0), ("soya", 599.0, 622.0), ("sulphites", 622.0, 644.4),
]
HEADER_WORDS = {"celery": "CE", "sulphites": "SU"}   # sanity: the rotated header letters are still where the columns expect them
FIRST_ROW, LAST_ROW = "Yoghurt Chat Bombs", "Enka’s Fish & Chips (Brighton Exclusive)"
EXPECTED_ROWS = 51
EXPECTED_MARKS = 105      # tick marks on the food page, optional ones included (counted 2026-10-08)
KIND_WORDS = {"gluten": {"WHEAT", "BARLEY", "OAT", "RYE", "SPELT"}, "nuts": {"ALMONDS"}, "crustaceans": {"PRAWNS"}}


def read_rows(pdf: Path) -> List[dict]:
    """-> [{name, contains: {key: optional?}, kinds: {key: [words]}}] for the food menu page, in the PDF's order. A mark in
    parentheses is the key's 'optional ingredient' tick (optional = True)."""
    out = subprocess.run(["pdftotext", "-bbox-layout", "-f", "1", "-l", "1", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]
    names: Dict[float, List[tuple]] = {}
    for w in words:
        if NAME_X0 <= w[0] < NAME_X1 and w[1] > 180:
            names.setdefault(round(w[1], 0), []).append(w)
    # name words of one row share a top within a point; a wrapped or multi-word name stays on one line in this PDF
    rows = []
    for top in sorted(names):
        ws = sorted(names[top], key=lambda w: w[0])
        text = " ".join(w[4] for w in ws)
        if text == "Rev:" or text.startswith("Rev:"):
            continue
        rows.append({"name": text, "top": min(w[1] for w in ws), "contains": {}, "kinds": {}})
    start = next(i for i, r in enumerate(rows) if r["name"] == FIRST_ROW)
    end = next(i for i, r in enumerate(rows) if r["name"] == LAST_ROW)
    rows = rows[start:end + 1]
    # the left-hand section labels (rotated letters) can fall inside NAME_X0..NAME_X1 only when they are wider than this: reject strays
    rows = [r for r in rows if len(r["name"]) > 3]
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"mowgli_matrix: read {len(rows)} dish rows, expected {EXPECTED_ROWS}: the matrix layout changed")
    marks = 0
    for x0, y0, x1, y1, t in words:
        if t not in ("Check", "(Check)") or not rows[0]["top"] - 5 <= y0 <= rows[-1]["top"] + 20:
            continue   # (the key at the page foot, "(tick) Optional ingredient", is outside the rows)
        marks += 1
        centre = (x0 + x1) / 2
        col = [k for k, l, r in COLUMNS if l <= centre < r]
        owner = [r for r in rows if 1.0 <= y0 - r["top"] <= 4.5 or (t == "(Check)" and -1.5 <= y0 - r["top"] <= 0.5)]
        if len(col) != 1 or len(owner) != 1:
            raise SystemExit(f"mowgli_matrix: mark {t} at ({x0:.1f}, {y0:.1f}) fits column {col} and rows {[r['name'] for r in owner]}")
        row = owner[0]
        if col[0] in row["contains"]:
            raise SystemExit(f"mowgli_matrix: {row['name']!r} has two marks in column {col[0]}")
        row["contains"][col[0]] = (t == "(Check)")
        row["kinds"][col[0]] = []
    if marks != EXPECTED_MARKS:
        raise SystemExit(f"mowgli_matrix: {marks} tick marks on the food page, expected {EXPECTED_MARKS}")
    # kind words printed beside a mark in the same cell and on the same line
    for x0, y0, x1, y1, t in words:
        w = t.strip("(),").upper()
        if not w or w not in set().union(*KIND_WORDS.values()):
            continue
        centre = (x0 + x1) / 2
        col = [k for k, l, r in COLUMNS if l <= centre < r + 20]
        owner = [r for r in rows if abs(y0 - r["top"]) <= 4.5]
        if len(col) < 1 or len(owner) != 1:
            raise SystemExit(f"mowgli_matrix: kind word {t!r} at ({x0:.1f}, {y0:.1f}) fits no unique row/column")
        row = owner[0]
        key = next((k for k in col if k in row["contains"] and w in KIND_WORDS.get(k, ())), None)
        if key is None:
            raise SystemExit(f"mowgli_matrix: kind word {t!r} on {row['name']!r} has no mark in its cell")
        row["kinds"][key].append(w)
    return rows
