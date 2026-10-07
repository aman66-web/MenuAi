"""Read Warrens Bakery's official "Calories & Allergens Guide" PDF into rows of printed text.

Used by tools/uk_extract/warrens_bakery.py. Requires `pdftotext` (poppler). Python 3.9 compatible.

The guide is one table per tab (Breakfast, Drinks, Pasties, Savouries, Sweet Bakery, Last Chance Buys, Seasonal, Liverpool Street
Station), with the columns Group | Dept | Name | Calories | Allergens | May Contain. The header row is printed only on the first
page of a tab, and every page lays its columns out differently, so a page's columns are found from the left edges of its own
cells: a word that follows a gap of more than GAP points starts a new cell, and the left edges of those cells fall into 5 or 6
clusters (the May Contain column is absent from a page where no row has a value in it). A row starts on the line that has a number
in the Calories column; the lines under it (wrapped names and allergen lists) belong to that row. Everything is returned as the
printed text; nothing is converted. Anything that does not look as expected raises PdfLayoutError.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE_TOL = 1.5     # words whose yMin differs by less than this are on one line
GAP = 5.5          # a bigger gap between two words on a line starts a new cell (words in one cell are 1.3-4.3 apart)
BANNER_Y = 140.0   # everything above this is the page banner (title, tab name, "BACK TO INDEX")
NUM = re.compile(r"^\d+$")
COLUMNS = ("group", "dept", "name", "calories", "allergens", "may_contain")


class PdfLayoutError(RuntimeError):
    pass


def _pages(pdf: Path) -> list:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
                      re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', chunk)])
    return pages


def _lines(words: list) -> list:
    lines = []  # type: list
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) < LINE_TOL:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(l, key=lambda w: w[0]) for l in lines]


def _tab_name(words: list, page_no: int) -> str:
    """The tab named in the banner: the words on the same line as 'BACK TO INDEX'."""
    back = [w for w in words if w[4] == "BACK" and w[1] < BANNER_Y]
    if len(back) != 1:
        raise PdfLayoutError(f"page {page_no}: expected one 'BACK TO INDEX' in the banner")
    y = back[0][1]
    title = [w for w in words if abs(w[1] - y) < 4 and w[4] not in ("BACK", "TO", "INDEX")]
    name = " ".join(w[4] for w in sorted(title, key=lambda w: w[0]))
    if not name:
        raise PdfLayoutError(f"page {page_no}: no tab name in the banner")
    return name


def _column_starts(lines: list, page_no: int) -> list:
    xs = []
    for line in lines:
        cells = [[line[0]]]
        for a, b in zip(line, line[1:]):
            if b[0] - a[2] > GAP:
                cells.append([b])
            else:
                cells[-1].append(b)
        xs += [c[0][0] for c in cells]
    clusters = []  # type: list
    for x in sorted(xs):
        if clusters and x - clusters[-1][-1] < 4.0:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    starts = [min(c) for c in clusters]
    if len(starts) not in (5, 6):
        raise PdfLayoutError(f"page {page_no}: found {len(starts)} column starts {starts}, expected 5 or 6")
    return starts


def read_rows(pdf: Path) -> list:
    """Every table row of the PDF, in order: {"tab", "page", "group", "dept", "name", "calories", "allergens", "may_contain"}
    with the printed text of each cell ("" when empty). Page 1 (the cover) holds no table."""
    rows = []  # type: list
    for page_no, words in enumerate(_pages(pdf), 1):
        if page_no == 1:
            continue
        tab = _tab_name(words, page_no)
        body = [w for w in words if w[1] >= BANNER_Y]
        if not body:
            raise PdfLayoutError(f"page {page_no}: no table found")
        lines = _lines(body)
        header = [l for l in lines if l[0][4] == "Group"]
        if header:  # the header row is not data
            lines = [l for l in lines if l is not header[0]]
        starts = _column_starts(lines, page_no)
        # the Calories column is the one holding the numbers; Group, Dept and Name are the three columns before it
        number_x = {round(w[0]) for l in lines for w in l if NUM.match(w[4]) and w[0] > starts[2] + 20}
        cal_col = [i for i, s in enumerate(starts) if any(abs(s - x) < 4.0 for x in number_x)]
        if len(cal_col) != 1 or cal_col[0] != 3:
            raise PdfLayoutError(f"page {page_no}: the Calories column is not the 4th of {starts}")
        names = COLUMNS[:len(starts)]

        def column(w):
            idx = max(i for i, s in enumerate(starts) if w[0] >= s - 2.0)
            return names[idx]
        current = None
        for line in lines:
            cells = {}  # type: dict
            for w in line:
                cells.setdefault(column(w), []).append(w[4])
            starts_row = "calories" in cells
            if starts_row:
                if not (len(cells["calories"]) == 1 and NUM.match(cells["calories"][0])):
                    raise PdfLayoutError(f"page {page_no}: odd Calories cell {cells['calories']} on line {' '.join(w[4] for w in line)}")
                current = {"tab": tab, "page": page_no, **{c: [] for c in names}}
                rows.append(current)
            elif "group" in cells:
                raise PdfLayoutError(f"page {page_no}: a Group value without a calories value: {' '.join(w[4] for w in line)}")
            if current is None:
                raise PdfLayoutError(f"page {page_no}: text before the first row: {' '.join(w[4] for w in line)}")
            for c, ws in cells.items():
                current[c] += ws
    out = []
    for r in rows:
        row = {"tab": r["tab"], "page": r["page"]}
        for c in COLUMNS:
            row[c] = " ".join(r.get(c, []))
        out.append(row)
    return out
