"""Read Ole & Steen's official "Allergen Information" PDF (calories + allergens) into rows of printed cells.

Used by tools/uk_extract/ole_and_steen.py. Requires `pdftotext` and `pdftocairo` (both poppler). Nothing is converted,
rounded or estimated here: every cell is returned as the words printed in it.

The guide is a 29-page Word export (A4 landscape). Page 1 is a cover note; pages 2-29 each hold one table (a long menu section
continues on the next page, with or without its title row). Each table has a title row ("Hot Drinks"), a rotated column header
row, and one row per dish. The columns, left to right: dish name; "kcal per serving"; "Cereals Containing Gluten", Peanuts,
Nuts, Fish, Crustaceans, Molluscs, Sesame, Milk, Eggs, Mustard, Soya, Celery, Sulphites, Lupin ("This dish contains");
Vegan, Vegetarian, "Non-Gluten diets" ("Suitable for?"). A tick (the "√" character) means the allergen is present, "MC" means
it may be present but is not guaranteed (the guide's own "Guide to symbols"); the gluten and nuts cells also name the cereals
or nuts in words ("√ wheat, oats, rye & barley", "√ almonds MC other nuts").

Reading by position, not by line order: the text layer has no table structure, so
  * a row is one gray name-cell rectangle in the page's vector graphics (pdftocairo -svg; fill 85%), whose y-range holds every
    word of that row (cells are vertically centred and the tallest cell sets the row height, so text alone cannot tell rows apart);
  * a column is found from the rotated header words on that page (the table sits at a slightly different x on some pages), and
    a word belongs to the column whose header centre is nearest to the word's centre.
Every check below stops the run with a message instead of guessing.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PATH = re.compile(r'<path fill-rule="evenodd" fill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)" fill-opacity="1" d="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) Z M [\d. ]+"/>')

# Column order and the printed header words that make each one (rotated, one word per line).
COLUMNS = [
    ("kcal", ("kcal", "per", "serving")),
    ("gluten", ("Cereals", "Containing", "Gluten")),
    ("peanuts", ("Peanuts",)), ("nuts", ("Nuts",)), ("fish", ("Fish",)), ("crustaceans", ("Crustaceans",)),
    ("molluscs", ("Molluscs",)), ("sesame", ("Sesame",)), ("milk", ("Milk",)), ("eggs", ("Eggs",)), ("mustard", ("Mustard",)),
    ("soya", ("Soya",)), ("celery", ("Celery",)), ("sulphites", ("Sulphites",)), ("lupin", ("Lupin",)),
    ("vegan", ("Vegan",)), ("vegetarian", ("Vegetarian",)), ("nongluten", ("Non-Gluten", "diets")),
]
# The header label of each allergen column (used by the caller to map it to an allergen key).
ALLERGEN_HEADER = {"gluten": "cereals containing gluten", "peanuts": "peanuts", "nuts": "nuts", "fish": "fish",
                   "crustaceans": "crustaceans", "molluscs": "molluscs", "sesame": "sesame", "milk": "milk", "eggs": "eggs",
                   "mustard": "mustard", "soya": "soya", "celery": "celery", "sulphites": "sulphites", "lupin": "lupin"}
GRAY, DARK = 85.1, 5.1   # fill (percent) of a dish row's name cell and of the header cells
TOLERANCE = 0.6


def _words(pdf: Path) -> list[list[tuple]]:
    """Words of every page as (xMin, yMin, xMax, yMax, text), y growing downwards."""
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunk)])
    return pages


def _rects(pdf: Path, page: int, tmp: Path) -> list[tuple[float, float, float, float, float]]:
    """Filled rectangles of one page as (fill percent, x0, x1, y0, y1), from pdftocairo's SVG (same units as pdftotext -bbox)."""
    svg = tmp / f"p{page}.svg"
    subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(svg)], check=True, capture_output=True)
    text = svg.read_text(encoding="utf-8")
    rects = []
    for m in PATH.finditer(text):
        r, g, b = float(m.group(1)), float(m.group(2)), float(m.group(3))
        if abs(r - g) > 0.01 or abs(g - b) > 0.01:
            continue  # not a gray
        fill = r
        xs = [float(m.group(i)) for i in (4, 6, 8, 10)]
        ys = [float(m.group(i)) for i in (5, 7, 9, 11)]
        rects.append((fill, min(xs), max(xs), min(ys), max(ys)))
    return rects


def _fail(page: int, message: str):
    raise ValueError(f"page {page}: {message}")


def read_pages(pdf: Path) -> tuple[str, list[dict]]:
    """Returns (the cover header text e.g. "01.10.2026 | Version 20", rows). One dict per dish row in printed order:
    {"page", "table" (the title row text, inherited from the previous page when a continuation page has none), "name"
    (printed lines joined by a space), "cells": {column key: [printed lines, each a list of words]}}."""
    pages = _words(pdf)
    if len(pages) < 2:
        raise ValueError("the PDF has no table pages")
    first = pages[0]
    header_line = " ".join(w[4] for w in sorted((w for w in first if 36 <= w[1] <= 55 and w[0] < 200), key=lambda w: w[0]))
    if any(w[4] == "Dish" for w in first):
        _fail(1, "a table appeared on the cover page: the layout changed")
    rows: list[dict] = []
    table = ""
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for pn, ws in enumerate(pages[1:], start=2):
            rects = _rects(pdf, pn, tmp)
            gray = [r for r in rects if abs(r[0] - GRAY) < TOLERANCE and r[2] - r[1] > 80]
            if not gray:
                _fail(pn, "no dish rows found")
            mode_x = Counter(round(r[1]) for r in gray).most_common(1)[0][0]
            row_rects = sorted((r for r in gray if abs(r[1] - mode_x) < 2), key=lambda r: r[3])  # the name cells, not the text-line highlights
            name_x1 = max(r[2] for r in row_rects)
            top = row_rects[0][3]
            # title row: a dark first-column cell shorter than a header row, directly above the column header row
            dark = [r for r in rects if abs(r[0] - DARK) < TOLERANCE and abs(r[1] - row_rects[0][1]) < 2 and r[4] < top and r[4] - r[3] < 30]
            title = ""
            if dark:
                tr = min(dark, key=lambda r: r[3])
                title = " ".join(w[4] for w in sorted((w for w in ws if tr[3] <= (w[1] + w[3]) / 2 <= tr[4] and w[0] < name_x1),
                                                      key=lambda w: (round(w[1]), w[0])))
            if title:
                table = title
            elif not table:
                _fail(pn, "no table title and nothing to continue")
            # column centres from the rotated header words
            hdr = [w for w in ws if w[3] < top and w[1] > 56 and (w[2] - w[0]) < 10 and (w[3] - w[1]) > 8]
            centres = []
            for key, labels in COLUMNS:
                xs = []
                for label in labels:
                    hit = [(w[0] + w[2]) / 2 for w in hdr if w[4] == label]
                    if len(hit) != 1:
                        _fail(pn, f"header word {label!r} for column {key!r} found {len(hit)} times: the layout changed")
                    xs.append(hit[0])
                centres.append(sum(xs) / len(xs))
            if centres != sorted(centres) or min(b - a for a, b in zip(centres, centres[1:])) < 20:
                _fail(pn, f"header columns not in the expected order: {[round(c) for c in centres]}")
            edges = [name_x1] + [(a + b) / 2 for a, b in zip(centres, centres[1:])]
            footer = [w[1] for w in ws if w[4] == "Guide" and w[0] < 60 and w[1] > 400]
            footer_top = min(footer) if footer else 10_000
            assigned = set()
            for r in row_rects:
                cells: dict[str, list] = {}
                name_words = []
                for i, w in enumerate(ws):
                    cy, cx = (w[1] + w[3]) / 2, (w[0] + w[2]) / 2
                    if not (r[3] <= cy <= r[4]) or cx < r[1] - 1:
                        continue
                    assigned.add(i)
                    if cx < name_x1:
                        name_words.append(w)
                    else:
                        col = max(k for k in range(len(edges)) if cx >= edges[k])
                        cells.setdefault(COLUMNS[col][0], []).append(w)
                rows.append({"page": pn, "table": table, "name": _join(name_words), "cells": {k: _lines(v) for k, v in cells.items()}})
            stray = [w[4] for i, w in enumerate(ws) if top <= w[1] and w[3] <= footer_top and i not in assigned]
            if stray:
                _fail(pn, f"words in the table area belong to no row: {stray[:8]}")
    return header_line, rows


def _lines(ws: list[tuple]) -> list[list[str]]:
    """Words of a cell grouped into printed lines (top to bottom, left to right)."""
    lines: list[list[tuple]] = []
    for w in sorted(ws, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) < 3:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [[w[4] for w in sorted(l, key=lambda w: w[0])] for l in lines]


def _join(ws: list[tuple]) -> str:
    return " ".join(" ".join(l) for l in _lines(ws))
