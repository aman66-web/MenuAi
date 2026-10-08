"""Read Baynes' official "Nutritional Information" and "Allergen Information" PDFs (Excel exports, A4 portrait).

Used by tools/uk_extract/baynes.py. Needs `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as "0.0",
"259.0", "807.1"); nothing is converted, rounded or estimated here.

NUTRITION PDF (https://baynes.co.uk/wp-content/uploads/2026/10/Nutritional-Website-1.pdf, 5 pages, "MASTER Nutritional.xlsx").
One product per table row; two blocks of eight numbers side by side, all CENTRED in their column:
    PER 100g OF PRODUCT : energy kJ, energy kcal, fat, saturates, carbohydrate, total sugars, protein, salt   (NOT used: not a serving)
    PER PRODUCT         : the same eight columns, for the product as sold (a roll, a pie, a whole loaf, a drink in its size)
A number is assigned to its column by the centre of the word (nearest column centre, within COLUMN_TOLERANCE), never by counting.
Grey section lines (bold in the PDF) sit between the rows. They come in two levels: a top heading ("Fresh Cream Cakes") and, under
some of them, a sub heading ("Small Cream Cakes"): both lists are in HEADINGS below and any other text-only line stops the run.
A table can run across a page break (Filled Morning Rolls, Small Cream Cakes): the heading carries over.

A product name that wraps onto two lines is printed in several ways: before its numbers ("Hazelnut Hot Chocolate with Cream"), after
them ("Pepperoni & Mozzarella Roll Melt") or split around them ("Burnt Orange Hot Chocolate with" / numbers + "Mallows & Cream").
Rows are joined to their name text by the rules in `_resolve`; the three names split in two lines are listed in WRAPS. If a text line
cannot be placed the run stops.

ALLERGEN PDF (https://docs.baynes.co.uk/Allergens-Website.pdf, 4 pages, "MASTER Allergens.xlsx"): the allergens are coloured cells
of a 17-column grid (a green fill = contained, a grey fill = not marked) with no text in them, so they are read from the page's own
vector shapes (`pdftocairo -svg`): see read_allergens(). The last column, "Suitable for Vegetarians" (YES / NO / NO** / YES*), is text:
read_vegetarian() returns it by section and name; read_allergens() also checks every cell's fill against that text (a YES row has the
peach fill, a NO row the grey one), which proves each row's cells were read at the right height.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE = re.compile(r"<page ")
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")

# Centres (points) of the numeric columns, measured from the column headers and the numbers. Most rows are centred in their cell,
# but the last rows of page 3 (Filled Morning Rolls) are left-aligned, so a word is assigned to the cell its CENTRE falls in (cells are
# bounded half way between neighbouring centres) and must lie inside that cell, whichever way it is aligned.
COLUMNS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "protein", "salt")
CENTRES_PER100 = (162.3, 184.0, 205.5, 227.0, 248.5, 270.0, 291.5, 313.0)
CENTRES_PER = (348.5, 371.5, 394.0, 416.0, 437.5, 459.0, 480.5, 502.0)
CELL_HALF_WIDTH = 10.8
EDGE_SLACK = 1.5
X_NAME_MAX = 148.0          # a word starting left of this is part of the name column; numbers start at 153 or later
X_FLAG_MIN = 505.0          # allergen PDF: the "Suitable for Vegetarians" column
LINE_TOLERANCE = 1.0
MAX_WORD_HEIGHT = 12.0      # rotated column labels come out as tall words

# Section lines as printed (bold in the PDF). "top" = main heading, "sub" = heading under a main heading.
HEADINGS = {
    "HALLOWEEN RANGE 2026": "top", "Rolls & Breads": "top", "Freshly Baked Savouries": "top", "Fresh Cream Cakes": "top",
    "Small Cream Cakes": "sub", "Large Cream Cakes": "sub", "Tea Breads & Iced Tea Breads": "top", "Tea Breads": "sub",
    "Seasonal Tea Bread": "sub", "Iced Tea Breads": "sub", "Small Cakes & Large Cakes": "top", "Small Cakes": "sub",
    "Large Cakes": "sub", "Components Of Hot Filled Rolls": "top", "Rolls with Butter": "top", "Hot Rolls": "top", "Soup": "top",
    "Tea & Hot Chocolate": "top", "Freshly Ground Coffee": "top", "Iced Drinks": "top", "Celebration Cakes": "top",
    "Filled Rolls": "top", "Filled Morning Rolls": "sub", "Filled Rye Rolls": "sub", "Simply Morning Roll Range": "sub",
    "Filled Dark Fired Rolls": "sub", "Filled Granary Rolls": "sub", "Filled Baguettes": "sub", "Filled Batons": "sub",
}
# Names printed on two lines: first line -> second line (either may sit on the row's own line). The allergen PDF breaks
# "Tuna Mayonnaise, Red Onion & Tomato Chutney" one word later than the nutrition PDF, hence two entries.
WRAPS = {
    "Burnt Orange Hot Chocolate with": "Mallows & Cream",
    "Gingerbread Latte with Cream &": "Sprinkles",
    "Tuna Mayonnaise, Red Onion &": "Tomato Chutney",
    "Tuna Mayonnaise, Red Onion & Tomato": "Chutney",
}
# Words that make up the column headers of the nutrition PDF (a line made only of these is skipped).
NUTRITION_HEADER_WORDS = {"PER", "100g", "OF", "PRODUCT", "NUTRITIONAL", "INFORMATION", "DATE", "ISSUE", "06.10.26", "(g)", "(kj)", "(kcal)",
                          "ENERGY", "FAT", "SATURATES", "CARBOHYDRATE", "TOTAL", "SUGARS", "PROTEIN", "SALT"}
FLAGS = {"YES", "NO", "YES*", "NO**", "NO*", "YES**"}


def _pages(pdf: Path) -> list[list[tuple]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in PAGE.split(out)[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunk)])
    return pages


def _lines(words: list[tuple]) -> list[list[tuple]]:
    lines: list[list[tuple]] = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) <= LINE_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
    for line in lines:
        line.sort(key=lambda w: w[0])
    return lines


def _resolve(events: list[list], where: str) -> list[dict]:
    """events: ["H", text] heading, ["F", text] text-only line, ["R", inline_name, payload] a table row.
    Returns [{"top", "sub", "name", "payload"}] in printed order. Stops on any text line it cannot place."""
    # 1. names split in two lines (WRAPS)
    merged: list[list] = []
    i = 0
    while i < len(events):
        e = events[i]
        if e[0] == "F" and e[1] in WRAPS:
            second = WRAPS[e[1]]
            nxt = events[i + 1] if i + 1 < len(events) else None
            nxt2 = events[i + 2] if i + 2 < len(events) else None
            if nxt is not None and nxt[0] == "R" and nxt[1] == second:
                merged.append(["R", e[1] + " " + second, nxt[2]])
                i += 2
                continue
            if nxt is not None and nxt[0] == "R" and nxt[1] == "" and nxt2 is not None and nxt2[0] == "F" and nxt2[1] == second:
                merged.append(["R", e[1] + " " + second, nxt[2]])
                i += 3
                continue
            raise SystemExit(f"{where}: the two-line name {e[1]!r} is not followed by {second!r}: the layout changed, re-check WRAPS")
        merged.append(e)
        i += 1
    # 2. a row without its own name takes the text line just before it, else the one just after it
    used = [False] * len(merged)
    for idx, e in enumerate(merged):
        if e[0] != "R" or e[1] != "":
            continue
        if idx > 0 and merged[idx - 1][0] == "F" and not used[idx - 1]:
            e[1] = merged[idx - 1][1]
            used[idx - 1] = True
        elif idx + 1 < len(merged) and merged[idx + 1][0] == "F" and not used[idx + 1]:
            e[1] = merged[idx + 1][1]
            used[idx + 1] = True
        else:
            raise SystemExit(f"{where}: a table row without a product name: {e[2]!r}")
    # 3. headings and rows
    rows: list[dict] = []
    top = sub = None
    for idx, e in enumerate(merged):
        if e[0] == "F":
            if used[idx] or e[1].startswith("*"):
                continue  # consumed above, or a footnote ("**Contains colours which may cause hyperactivity in children")
            raise SystemExit(f"{where}: a text line that is neither a known heading nor a product name: {e[1]!r}. Check HEADINGS.")
        if e[0] == "H":
            if HEADINGS[e[1]] == "top":
                top, sub = e[1], None
            else:
                sub = e[1]
            continue
        if top is None:
            raise SystemExit(f"{where}: a product row before any heading: {e[1]!r}")
        rows.append({"top": top, "sub": sub, "name": e[1], "payload": e[2]})
    return rows


def _name_events(pages: list[list[tuple]], row_of_line, skip_line, x_name_max: float, where: str) -> list[list]:
    events: list[list] = []
    for pno, words in enumerate(pages, 1):
        # the column labels are rotated text: tall words (and a few stray short ones) that mark the header band of the table
        band_bottom = max([w[3] for w in words if w[3] - w[1] > MAX_WORD_HEIGHT] or [0.0])
        words = [w for w in words if w[3] - w[1] <= MAX_WORD_HEIGHT]
        for line in _lines(words):
            if skip_line(line):
                continue
            if line[0][1] < band_bottom - 0.5:
                continue
            name_text = " ".join(w[4] for w in line if w[0] < x_name_max).strip()
            payload = row_of_line(line, f"{where} page {pno}")
            if payload is not None:
                events.append(["R", name_text, payload])
            elif name_text in HEADINGS:
                events.append(["H", name_text])
            elif name_text:
                events.append(["F", name_text])
            else:
                raise SystemExit(f"{where} page {pno}: cannot place the line {[w[4] for w in line]!r}")
    return events


def read_nutrition(pdf: Path) -> tuple[dict, list[dict]]:
    """-> (meta, rows). meta = {"issue_date", "version"}; each row = {"top", "sub", "name", "per": {col: text}, "per100": {col: text}}."""
    pages = _pages(pdf)
    meta: dict = {}

    def skip(line: list[tuple]) -> bool:
        texts = [w[4] for w in line]
        if texts[0] == "VERSION":  # footer: VERSION 108 DATE OF ISSUE 06.10.26 NUTRITIONAL INFORMATION - S.M. BAYNE
            meta["version"] = texts[1]
            meta["issue_date"] = texts[texts.index("ISSUE") + 1]
            return True
        if all(t in NUTRITION_HEADER_WORDS for t in texts):
            if "ISSUE" in texts:
                meta.setdefault("header_date", texts[texts.index("ISSUE") + 1])
            return True
        return False

    def row_of_line(line: list[tuple], where: str):
        nums = [w for w in line if w[0] >= X_NAME_MAX]
        if not nums:
            return None
        if len(nums) != 16:
            raise SystemExit(f"{where}: a row with {len(nums)} numbers instead of 16: {[w[4] for w in line]!r}")
        per100: dict = {}
        per: dict = {}
        for w in nums:
            centre = (w[0] + w[2]) / 2
            if not NUMBER.match(w[4]):
                raise SystemExit(f"{where}: {w[4]!r} is not a plain number (row {[x[4] for x in line][:6]!r})")
            hit = None
            for block, centres in ((per100, CENTRES_PER100), (per, CENTRES_PER)):
                for col, c in zip(COLUMNS, centres):
                    if abs(centre - c) < CELL_HALF_WIDTH:
                        if w[0] < c - CELL_HALF_WIDTH - EDGE_SLACK or w[2] > c + CELL_HALF_WIDTH + EDGE_SLACK:
                            raise SystemExit(f"{where}: {w[4]!r} ({w[0]:.1f}-{w[2]:.1f}) sticks out of its cell")
                        hit = (block, col)
            if hit is None or hit[1] in hit[0]:
                raise SystemExit(f"{where}: cannot place {w[4]!r} (centre {centre:.1f}) in a column")
            hit[0][hit[1]] = w[4]
        return {"per": per, "per100": per100}

    events = _name_events(pages, row_of_line, skip, X_NAME_MAX, "nutrition PDF")
    rows = _resolve(events, "nutrition PDF")
    out = []
    for r in rows:
        out.append({"top": r["top"], "sub": r["sub"], "name": r["name"], "per": r["payload"]["per"], "per100": r["payload"]["per100"]})
    if meta.get("header_date") != meta.get("issue_date") or "version" not in meta:
        raise SystemExit(f"nutrition PDF: header/footer dates differ or the footer is missing: {meta}")
    return meta, out


def read_vegetarian(pdf: Path) -> tuple[dict, dict]:
    """The allergen PDF's text column "Suitable for Vegetarians". -> (meta, {(heading, name): flag}) where heading is the sub heading
    when there is one, else the top heading, and flag is the printed text ("YES", "NO", "NO**", "YES*")."""
    pages = _pages(pdf)
    meta: dict = {}

    def skip(line: list[tuple]) -> bool:
        texts = [w[4] for w in line]
        if texts[0] == "VERSION":
            meta["version"] = texts[1]
            meta["issue_date"] = texts[texts.index("OF") + 2] if "OF" in texts else ""
            return True
        if texts[0] == "ALLERGEN" or texts == ["ALLERGENS"]:  # title line, column band
            if texts[0] == "ALLERGEN":
                meta["header_date"] = texts[-1]
            return True
        if line[0][1] < 150 and line[0][0] < 40 and len(texts) > 8:  # the explanatory paragraph at the top of page 1
            return True
        return False

    def row_of_line(line: list[tuple], where: str):
        flags = [w[4] for w in line if w[0] >= X_FLAG_MIN]
        if not flags:
            return None
        if len(flags) != 1 or flags[0] not in FLAGS:
            raise SystemExit(f"{where}: unexpected text in the vegetarian column: {flags!r}")
        return flags[0]

    events = _name_events(pages, row_of_line, skip, X_FLAG_MIN, "allergen PDF")
    rows = _resolve(events, "allergen PDF")
    out: dict = {}
    for r in rows:
        key = (r["sub"] or r["top"], r["name"])
        if key in out:
            raise SystemExit(f"allergen PDF: {key} is printed twice")
        out[key] = r["payload"]
    return meta, out


# ----------------------------------------------------------------------------------------------------- allergen cells
# The 17 allergen columns left to right, as the rotated header text prints them (checked against the header words of every page).
# "Oats/Rye/Barley/Wheat Gluten" are four cereal columns; "(Tree) Nuts" names no nut; no column names "spelt", "kamut" or a nut.
ALLERGEN_HEADERS = ("(Tree) Nuts", "Celery", "Crustaceans", "Eggs", "Fish", "Oats Gluten", "Rye Gluten", "Barley Gluten", "Wheat Gluten",
                    "Lupin", "Milk", "Molluscs", "Mustard", "Peanut", "Sesame", "Soya", "Sulphites")
GRID_X0 = 148.99            # left edge of the first allergen cell (points); 17 equal cells end at GRID_X1, the vegetarian cell follows
GRID_X1 = 501.63
VEG_X = (501.51, 535.67)    # the "Suitable for Vegetarians" cell
CELL_W = (GRID_X1 - GRID_X0) / len(ALLERGEN_HEADERS)
PATH = re.compile(r'<path fill-rule="[^"]*" fill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)" fill-opacity="1" d="([^"]*)"')
SUBRECT = re.compile(r"M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) Z")
# Fills as pdftocairo prints them (percent of 255). Two light greys are used (different Excel cell styles) and both mean "not marked".
GREEN, PEACH = (0.0, 49.8, 0.0), (95.7, 69.0, 51.8)
GREYS = ((82.35, 82.35, 82.35), (85.10, 85.10, 85.10))


def _near(c: tuple, ref: tuple, tol: float = 0.3) -> bool:
    return all(abs(a - b) <= tol for a, b in zip(c, ref))


def _page_rects(pdf: Path, page: int) -> list[tuple]:
    """Filled rectangles of one page in painting order: (r, g, b percent, x0, y0, x1, y1). Hairlines (table borders) are left out."""
    with tempfile.TemporaryDirectory() as d:
        svg = Path(d) / "p.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(svg)], check=True, capture_output=True)
        text = svg.read_text(encoding="utf-8")
    out = []
    for m in PATH.finditer(text):
        rgb = tuple(float(m.group(i)) for i in (1, 2, 3))
        for sm in SUBRECT.finditer(m.group(4)):  # one path can hold several rectangles (all painted with the same fill)
            xs = [float(sm.group(i)) for i in (1, 3, 5, 7)]
            ys = [float(sm.group(i)) for i in (2, 4, 6, 8)]
            if max(xs) - min(xs) >= 2 and max(ys) - min(ys) >= 2:
                out.append(rgb + (min(xs), min(ys), max(xs), max(ys)))
    return out


def _fill_at(rects: list[tuple], x: float, y: float):
    """Colour of the topmost rectangle that covers the point (None if nothing does)."""
    hit = None
    for r in rects:
        if r[3] + 0.05 < x < r[5] - 0.05 and r[4] + 0.05 < y < r[6] - 0.05:
            hit = r[:3]
    return hit


def _header_labels(words: list[tuple]) -> list[str]:
    """The 17 rotated column labels of one page, left to right ("Oats Gluten": the rotated words read bottom to top)."""
    cols: dict = {}
    for w in words:
        if w[3] - w[1] > MAX_WORD_HEIGHT and GRID_X0 < (w[0] + w[2]) / 2 < GRID_X1:
            cols.setdefault(min(int(((w[0] + w[2]) / 2 - GRID_X0) / CELL_W), len(ALLERGEN_HEADERS) - 1), []).append(w)
    return [" ".join(w[4] for w in sorted(cols.get(i, []), key=lambda w: -w[1])) for i in range(len(ALLERGEN_HEADERS))]


def read_allergens(pdf: Path) -> tuple[dict, dict]:
    """The allergen PDF's grid. -> (meta, {(heading, printed name): {"flag": printed vegetarian text, "cells": [bool x 17]}}).

    A row's cells are read from the page's vector fills at the height of the row's "Suitable for Vegetarians" text, in the middle of each
    of the 17 columns (sampled at three heights; they must agree). Stops if a fill is neither green nor one of the two greys, if a point
    is covered by no fill, if a page's header words are not the 17 expected labels, or if a row's vegetarian cell fill disagrees with its
    text. A name printed twice under one heading stops the run (read_vegetarian does the same)."""
    pages = _pages(pdf)
    meta: dict = {}
    for pno, words in enumerate(pages, 1):
        labels = _header_labels(words)
        if labels != list(ALLERGEN_HEADERS):
            raise SystemExit(f"allergen PDF page {pno}: header labels {labels!r} differ from the expected {list(ALLERGEN_HEADERS)!r}: the grid changed")
    rects_by_page = {pno: _page_rects(pdf, pno) for pno in range(1, len(pages) + 1)}

    def skip(line: list[tuple]) -> bool:
        texts = [w[4] for w in line]
        if texts[0] == "VERSION":
            meta["version"] = texts[1]
            meta["issue_date"] = texts[texts.index("OF") + 2] if "OF" in texts else ""
            return True
        if texts[0] == "ALLERGEN" or texts == ["ALLERGENS"]:
            if texts[0] == "ALLERGEN":
                meta["header_date"] = texts[-1]
            return True
        if line[0][1] < 150 and line[0][0] < 40 and len(texts) > 8:
            return True
        return False

    def row_of_line(line: list[tuple], where: str):
        flags = [w for w in line if w[0] >= X_FLAG_MIN]
        if not flags:
            return None
        if len(flags) != 1 or flags[0][4] not in FLAGS:
            raise SystemExit(f"{where}: unexpected text in the vegetarian column: {[w[4] for w in flags]!r}")
        pno = int(where.rsplit(" ", 1)[1])
        rects = rects_by_page[pno]
        yc = (flags[0][1] + flags[0][3]) / 2
        cells = []
        for i in range(len(ALLERGEN_HEADERS)):
            xc = GRID_X0 + (i + 0.5) * CELL_W
            fills = [_fill_at(rects, xc, yc + dy) for dy in (-2.0, 0.0, 2.0)]
            kinds = set()
            for f in fills:
                if f is None:
                    raise SystemExit(f"{where}: no fill under the cell {ALLERGEN_HEADERS[i]!r} of the row with flag {flags[0][4]!r} at y={yc:.1f}")
                if _near(f, GREEN):
                    kinds.add("yes")
                elif any(_near(f, g) for g in GREYS):
                    kinds.add("no")
                else:
                    raise SystemExit(f"{where}: unknown fill {f} under {ALLERGEN_HEADERS[i]!r} at y={yc:.1f}")
            if len(kinds) != 1:
                raise SystemExit(f"{where}: the three samples of the cell {ALLERGEN_HEADERS[i]!r} at y={yc:.1f} disagree")
            cells.append(kinds == {"yes"})
        vf = [_fill_at(rects, (VEG_X[0] + VEG_X[1]) / 2, yc + dy) for dy in (-2.0, 0.0, 2.0)]
        want_peach = flags[0][4].startswith("YES")
        for f in vf:
            if f is None or not (_near(f, PEACH) if want_peach else any(_near(f, g) for g in GREYS)):
                raise SystemExit(f"{where}: the vegetarian cell fill {f} does not fit the printed {flags[0][4]!r} at y={yc:.1f}: the row height is off")
        return {"flag": flags[0][4], "cells": cells}

    events = _name_events(pages, row_of_line, skip, X_FLAG_MIN, "allergen PDF")
    rows = _resolve(events, "allergen PDF")
    out: dict = {}
    for r in rows:
        key = (r["sub"] or r["top"], r["name"])
        if key in out:
            raise SystemExit(f"allergen PDF: {key} is printed twice")
        out[key] = r["payload"]
    return meta, out
