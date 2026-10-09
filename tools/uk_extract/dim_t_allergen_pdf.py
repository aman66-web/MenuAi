"""Read dim t's own "Main menu ALLERGEN INFORMATION" PDF (V1, 14.08.2026, 25 pages) into one row per dish. Python 3.9.

Used by tools/uk_extract/dim_t.py. Needs `pdftotext` and `pdftoppm` (poppler) and Pillow. Nothing is guessed. Pages 2-7 hold the
allergen matrix as tables (a title such as "Small eats", a header row, then one row per dish: the dish name in capitals and one
column per allergen; "Y" marks an allergen, and the "Cereals With Gluten" and "Nuts" cells name the cereals / the nut). Pages 8-25
are per-recipe ingredient lists (not a per-dish matrix) and are not read.

How it is read (by position, never by counting rows):
  1. the grid is found in a 150 dpi render of each page: long grey horizontal lines are row edges and long grey vertical lines are
     column edges; a header is the filled (non-white) block around the word "Celery";
  2. every word of the text layer (pdftotext -bbox-layout) is put into the row band and the column cell that hold its centre;
  3. a table header is found by its word "Celery" in the first data column; the 14 header labels must be in the 14 expected columns
     (header words that straddle a grid line are taken by their own height and are never read as cell contents);
  4. a dish row is a band with a name in the name column (a table's own title, such as "Small eats", is not a row).
Anything that does not fit (a different number of columns, a word that fits no cell, an unknown header) raises, so a new layout stops
the run.

Page 1 of the guide also says what "(F)" means and that the fryer oil carries traces of a list of allergens: read_fryer_words() reads that
sentence so dim_t.py can publish it as "may contain" for the dishes the guide marks (F), and stops if the sentence changes.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
DPI = 150
SCALE = DPI / 72.0
MAX_BAND = 60.0                 # points: no row or gap between tables is taller than this
GRID_GREY = 232                 # pixels darker than this (the grid is mid grey, text is black) count as line pixels
COLUMN_KEYS = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts", "sesame",
               "soya", "sulphites"]
HEADER_FIRST_WORDS = ["Celery", "Cereals", "Crust-", "Egg", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Nuts", "Peanuts", "Sesame",
                      "Soybeans", "Sulphur"]
PAGES = range(2, 8)             # the matrix pages
FRYER = re.compile(r"the oil in our fryers will contain traces of allergens including (.*?)\.")
F_LEGEND = "Items marked (F) – These items are fried as part of the preparation or cooking process."


def _collapse(values: List[int]) -> List[float]:
    out, start, prev = [], None, None
    for v in values:
        if start is None:
            start = prev = v
        elif v - prev <= 2:
            prev = v
        else:
            out.append((start + prev) / 2.0)
            start = prev = v
    if start is not None:
        out.append((start + prev) / 2.0)
    return out


def _grid(png: Path) -> Tuple[List[float], List[float], "Image.Image"]:
    im = Image.open(png).convert("L")
    w, h = im.size
    px = im.load()
    # horizontal lines: grey across most of the width
    hl = [y for y in range(h) if sum(1 for x in range(60, w - 60, 3) if px[x, y] < GRID_GREY) / ((w - 120) / 3.0) > 0.75]
    rows = [v / SCALE for v in _collapse(hl)]
    # vertical lines: grey over most of the table height (rows span the tables, gaps between tables are white)
    spans = [(rows[i], rows[i + 1]) for i in range(len(rows) - 1) if rows[i + 1] - rows[i] <= MAX_BAND]
    if not spans:
        raise ValueError(f"{png.name}: no table rows found")
    ys = []
    for a, b in spans:
        ys += list(range(int(a * SCALE) + 2, int(b * SCALE) - 1, 2))
    vl = [x for x in range(w) if sum(1 for y in ys if px[x, y] < GRID_GREY) / float(len(ys)) > 0.7]
    cols = [v / SCALE for v in _collapse(vl)]
    return cols, rows, im


def read_pages(pdf: Path) -> List[dict]:
    """-> [{'name', 'cells': {key: [words]}, 'page'}] over the matrix pages, in reading order.
    A row's 'name' joins the words of its name cell; 'cells' only holds the columns that have words."""
    bbox = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    chunks = bbox.split("<page ")[1:]
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(DPI), "-f", str(PAGES[0]), "-l", str(PAGES[-1]), "-png", str(pdf), str(Path(tmp) / "p")], check=True)
        pngs = sorted(Path(tmp).glob("p-*.png"))
        if len(pngs) != len(PAGES):
            raise ValueError(f"expected {len(PAGES)} rendered pages, got {len(pngs)}")
        for n, png in zip(PAGES, pngs):
            words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunks[n - 1])]
            cols, rows, im = _grid(png)
            words = _without_footer(words)
            out.extend(_read_page(n, words, cols, rows, im))
    return out


def _without_footer(words: List[tuple]) -> List[tuple]:
    """Drop the page footer ("Page 7 of 25"): the word 'Page' and the words on its line near it."""
    feet = [w for w in words if w[4] == "Page" and (w[1] + w[3]) / 2 > 500]
    return [w for w in words if not any(abs((w[1] + w[3]) / 2 - (f[1] + f[3]) / 2) < 4 and abs(w[0] - f[0]) < 90 for f in feet)]


def _header_extent(im: "Image.Image", x_pt: float, cy_pt: float) -> Tuple[float, float]:
    """The y range (points) of the filled header block that holds y = cy_pt, read at x = x_pt (a blank spot inside a header cell)."""
    px = im.load()
    x = int(x_pt * SCALE)
    y0 = y1 = int(cy_pt * SCALE)
    while y0 > 0 and px[x, y0 - 1] < 245:
        y0 -= 1
    while y1 < im.size[1] - 1 and px[x, y1 + 1] < 245:
        y1 += 1
    return y0 / SCALE, y1 / SCALE


def _read_page(n: int, words: List[tuple], cols: List[float], rows: List[float], im: "Image.Image") -> List[dict]:
    if len(cols) != 16:
        raise ValueError(f"page {n}: {len(cols)} vertical grid lines, expected 16 (the name column and 14 data columns)")
    bands = sorted((rows[i], rows[i + 1]) for i in range(len(rows) - 1) if rows[i + 1] - rows[i] <= MAX_BAND)
    data_col = lambda c: next((j for j in range(14) if cols[1 + j] <= c < cols[2 + j]), None)  # noqa: E731
    # table headers: the word "Celery" in the first data column; the filled block around it holds the other header words (and, on
    # page 7, a table's title); those words are not cell contents
    header_ids, headers = set(), 0
    for w in words:
        if w[4] != "Celery" or data_col((w[0] + w[2]) / 2) != 0:
            continue
        top, bottom = _header_extent(im, cols[1] + 1.5, (w[1] + w[3]) / 2)
        if not 14 <= bottom - top <= 40:
            raise ValueError(f"page {n}: the header block around 'Celery' at y {w[1]:.0f} spans {top:.0f}-{bottom:.0f}, not a header row")
        block = [x for x in words if top <= (x[1] + x[3]) / 2 <= bottom]
        for k, first in enumerate(HEADER_FIRST_WORDS):
            if not any(x[4] == first and data_col((x[0] + x[2]) / 2) == k for x in block):
                raise ValueError(f"page {n}: header word {first!r} is not in data column {k}")
        header_ids.update(id(x) for x in block)
        headers += 1
    if not headers:
        raise ValueError(f"page {n}: no table header found")
    out = []
    for a, b in bands:
        band = [w for w in words if a <= (w[1] + w[3]) / 2 < b and id(w) not in header_ids]
        name_words = sorted((w for w in band if cols[0] <= (w[0] + w[2]) / 2 < cols[1]), key=lambda w: (round(w[1] / 3), w[0]))
        if not name_words:
            continue
        row = {"name": " ".join(w[4] for w in name_words), "cells": {}, "page": n}
        for w in band:
            c = (w[0] + w[2]) / 2
            if cols[0] <= c < cols[1]:
                continue
            k = data_col(c)
            if k is None:
                raise ValueError(f"page {n}: word {w[4]!r} at ({w[0]:.0f}, {w[1]:.0f}) fits no column")
            row["cells"].setdefault(COLUMN_KEYS[k], []).append(w[4])
        out.append(row)
    return out


def read_fryer_words(pdf: Path) -> List[str]:
    """The allergen words page 1 prints after 'the oil in our fryers will contain traces of allergens including', as printed
    (e.g. 'dairy', 'sulphates'); stops unless the legend for '(F)' is printed next to it."""
    text = " ".join(subprocess.run(["pdftotext", "-f", "1", "-l", "1", str(pdf), "-"], check=True, capture_output=True, text=True).stdout.split())
    m = FRYER.search(text)
    if not m or F_LEGEND not in text:
        raise ValueError("page 1 no longer prints the (F) legend and the fryer-oil sentence as expected: re-read it before publishing traces")
    return [w.strip() for w in re.split(r",| and ", m.group(1)) if w.strip()]
