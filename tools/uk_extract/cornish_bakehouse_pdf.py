"""Read Cornish Bakehouse's official "Product Allergen Specifications" (Pasty & Savouries) PDF.

Used by tools/uk_extract/cornish_bakehouse.py. Requires `pdftotext` (poppler). Python 3.9 compatible.

The PDF is a Word table on two A4 pages: one product per row; columns left to right: Product, Calories, then the 14 UK allergens
(Celery, Cereals containing Gluten eg Wheat, Crustaceans e.g. Prawns, Eggs, Fish, Lupin, Milk (Lactose), Molluscs i.e. shellfish,
Mustard, Nuts, Peanuts, Sesame Seeds, Soya, Sulphur Dioxide). A cell holds a tick (a Wingdings 2 glyph, U+F050 in the text layer)
for "contains", the letter "M" for "may contain" ("M = May Contain" is printed under the table), or is empty.

Everything is read by word position (`pdftotext -bbox`): a mark belongs to the allergen column whose header it sits under (the header
words are rotated, so a column's header text is rebuilt from the words that share its x position and checked against HEADERS on every
run) and to the product row whose first line it sits level with. A mark that cannot be placed, or a text line that is not a known
row, stops the run: nothing is guessed.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
TICK = ""
BLANK = ""
# (allergen key used by tools/build_menus.py, header text exactly as printed, reading the rotated text bottom to top)
HEADERS = [
    ("celery", "Celery"), ("gluten", "Cereals containing Gluten eg Wheat"), ("crustaceans", "Crustaceans e.g. Prawns"),
    ("eggs", "Eggs"), ("fish", "Fish"), ("lupin", "Lupin"), ("milk", "Milk (Lactose)"), ("molluscs", "Molluscs i.e. shellfish"),
    ("mustard", "Mustard"), ("nuts", "Nuts"), ("peanuts", "Peanuts"), ("sesame", "Sesame Seeds"), ("soya", "Soya"),
    ("sulphites", "Sulphur Dioxide"),
]
NAME_MAX_X = 235.0          # a word whose centre is left of this belongs to the product name
CAL_X = (235.0, 275.0)      # centre of the Calories column
MARK_MIN_X = 280.0          # allergen cells (the Celery column is the first) start right of this
LINE_TOL = 1.5              # words within this many points of each other in y are on one line
ROW_TOL = 9.0               # a mark's centre must be this close (y) to its row's first line
COL_TOL = 8.0               # ... and this close (x) to its column's header centre
CONTINUATION_MAX_GAP = 14.0  # a wrapped name's second line is no further than this below the first
# Lines that are not products: the footer lines, and "Ovex Glaze" (an ingredient row with one allergen mark and no calories).
NOT_PRODUCTS = {"Updated 27 January 2025", "M = May Contain", "Ovex Glaze"}
CONTINUATIONS = {"Roll"}


def _pages(pdf: Path) -> list:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunk)])
    return pages


def _lines(words: list) -> list:
    """Words grouped into lines by their top edge: [(y, [(xmin, xmax, text, ymin, ymax), ...])] top to bottom, words left to right."""
    rows = []
    for x0, y0, x1, y1, t in sorted(words, key=lambda w: (w[1], w[0])):
        if rows and abs(rows[-1][0] - y0) <= LINE_TOL:
            rows[-1][1].append((x0, x1, t, y0, y1))
        else:
            rows.append([y0, [(x0, x1, t, y0, y1)]])
    for r in rows:
        r[1].sort()
    return [(y, ws) for y, ws in rows]


def read_products(pdf: Path) -> list:
    """Rows in reading order: {page, name (as printed), calories (string as printed), contains: [keys], may_contain: [keys]}."""
    out = []
    pages = _pages(pdf)
    if len(pages) != 2:
        raise SystemExit(f"The PDF has {len(pages)} pages, expected 2: the sheet changed")
    for page_no, words in enumerate(pages, 1):
        left = [w for w in words if (w[0] + w[2]) / 2 < NAME_MAX_X]
        cal = [w for w in words if CAL_X[0] <= (w[0] + w[2]) / 2 < CAL_X[1] and re.fullmatch(r"\d+", w[4])]
        if not cal:
            raise SystemExit(f"Page {page_no}: no calorie numbers found")
        first_y = min(w[1] for w in cal)
        # --- the allergen columns: header words are rotated; rebuild each column's text from the words sharing its x position
        header = [w for w in words if (w[0] + w[2]) / 2 >= MARK_MIN_X and w[3] < first_y - 8 and w[2] - w[0] < 14.0]  # rotated words are narrow; the title is not
        centres = []
        for key, text in HEADERS:
            first_word = text.split()[0]
            anchors = [w for w in header if w[4] == first_word]
            if len(anchors) != 1:
                raise SystemExit(f"Page {page_no}: header word {first_word!r} found {len(anchors)} times: the column layout changed")
            xc = (anchors[0][0] + anchors[0][2]) / 2
            same = sorted((w for w in header if abs((w[0] + w[2]) / 2 - xc) < 3.0), key=lambda w: -w[3])
            got = " ".join(w[4] for w in same)
            if got != text:
                raise SystemExit(f"Page {page_no}: column header reads {got!r}, expected {text!r}: the column layout changed")
            centres.append((key, xc))
        if len({round(c) for _, c in centres}) != len(centres):
            raise SystemExit(f"Page {page_no}: two allergen columns have the same position")
        # --- product rows: a name line that carries a calorie number starts a row; the only other lines allowed are listed above
        cal_by_line = {}
        for w in cal:
            cal_by_line.setdefault(round(w[1]), []).append(w)
        rows = []  # {y, ymid, name parts, calories}
        prev = None
        for y, ws in _lines([w for w in left if w[1] >= first_y - 3]):
            text = " ".join(t for _, _, t, _, _ in ws)
            nums = [w for k, v in cal_by_line.items() if abs(k - y) <= 3 for w in v]
            if nums:
                if len(nums) != 1:
                    raise SystemExit(f"Page {page_no}: line {text!r} has {len(nums)} calorie numbers")
                prev = {"y": y, "ymid": (ws[0][3] + ws[0][4]) / 2, "parts": [text], "calories": nums[0][4], "product": True}
                rows.append(prev)
            elif text in NOT_PRODUCTS:
                prev = {"y": y, "ymid": (ws[0][3] + ws[0][4]) / 2, "parts": [text], "calories": "", "product": False}
                rows.append(prev)
            elif text in CONTINUATIONS and prev is not None and 0 < y - prev["y"] <= CONTINUATION_MAX_GAP:
                prev["parts"].append(text)
            else:
                raise SystemExit(f"Page {page_no}: unexpected line {text!r} at y {y:.0f}: the sheet changed, re-check the reader")
        # --- marks
        marks = [w for w in words if (w[0] + w[2]) / 2 >= MARK_MIN_X and w[1] >= first_y - 8]
        for r in rows:
            r["contains"], r["may_contain"] = [], []
        for x0, y0, x1, y1, t in marks:
            token = t.strip()
            if token.replace(BLANK, "") == "":
                continue  # an empty cell (a space glyph)
            if token.startswith(TICK) and token.replace(BLANK, "") == TICK:
                kind = "contains"
            elif token == "M":
                kind = "may_contain"
            else:
                raise SystemExit(f"Page {page_no}: unknown mark {token!r} at x {x0:.0f}, y {y0:.0f}")
            ymid = (y0 + y1) / 2
            row = min(rows, key=lambda r: abs(r["ymid"] - ymid))
            if abs(row["ymid"] - ymid) > ROW_TOL:
                raise SystemExit(f"Page {page_no}: mark {token!r} at y {ymid:.0f} is not level with any row")
            xc = (x0 + x1) / 2
            key, cx = min(centres, key=lambda kc: abs(kc[1] - xc))
            if abs(cx - xc) > COL_TOL:
                raise SystemExit(f"Page {page_no}: mark {token!r} at x {xc:.0f} is not under any allergen column")
            if key in row["contains"] or key in row["may_contain"]:
                raise SystemExit(f"Page {page_no}: two marks in one cell ({' '.join(row['parts'])!r}, {key})")
            row[kind].append(key)
        for r in rows:
            if r["product"]:
                out.append({"page": page_no, "name": " ".join(r["parts"]), "calories": r["calories"],
                            "contains": sorted(r["contains"]), "may_contain": sorted(r["may_contain"])})
    return out
