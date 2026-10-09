"""Read Wahaca's own back-of-house allergen guide (WAH.SUM2026.V3, 7 pages) into one row per dish. Python 3.9.

UNUSED (2026-10-09): nothing imports this file. Wahaca stays link-only because 15 of its 44 published dishes have no guide row of the same
name (see the allergen paragraph of wahaca.py). Kept as a working reader of the guide's grid for the day that is decided.

Would be used by tools/uk_extract/wahaca.py. Needs `pdftotext` and `pdftoppm` (poppler) and Pillow. Nothing is guessed. The guide is a grid:
a PLU number and a dish name on the left, then 19 columns (VEGETARIAN?, VEGAN?, DEEP FRIED?, the 14 allergens, GARLIC, ONION). Its key:
a black dot is "allergen present", the same cell in pink text names the part of the dish that carries it and means "our chefs can
prepare the dish without it" (the dish as served has it), "●w/s/b/o/r" says which gluten cereal and "●p/c/a/m" which tree nut.

How it is read (by position, never by counting rows):
  1. the grid lines are found in a 150 dpi render of each page (long dark horizontal lines = row edges; long dark vertical lines = the
     column edges: 20 lines make the 19 columns, in the order of the header words, which are checked);
  2. every word of the text layer (pdftotext -bbox-layout) is put into the row band and the column cell that hold its centre;
  3. a dish row is a band whose first cell holds a PLU number; its name is the words of the name column in the band;
  4. a cell is MARKED when it holds a dot or any text; text in the glyph's cell ("w", "w, b", "p") is the cereal / tree-nut kind.
Anything that does not fit (not 21 vertical lines, a header label in the wrong column, two PLU numbers in one band, a word that fits no
cell) raises, so a new layout stops the run.
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
COLUMN_KEYS = ["vegetarian", "vegan", "fried", "gluten", "celery", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard",
               "nuts", "peanuts", "sesame", "soya", "sulphites", "garlic", "onion"]
HEADER_LABELS = {"VEGETARIAN?": "vegetarian", "VEGAN?": "vegan", "FRIED?": "fried", "GLUTEN": "gluten", "CELERY": "celery",
                 "CRUSTACEANS": "crustaceans", "EGGS": "eggs", "FISH": "fish", "LUPIN": "lupin", "MILK": "milk", "MOLLUSCS": "molluscs",
                 "MUSTARD": "mustard", "NUTS": "nuts", "PEANUTS": "peanuts", "SESAME": "sesame", "SOYA": "soya", "SULPHITES": "sulphites",
                 "GARLIC": "garlic", "ONION": "onion"}
ALLERGENS = ["gluten", "celery", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts", "sesame", "soya",
             "sulphites"]
KIND = {"gluten": {"w": "wheat", "s": "spelt", "b": "barley", "o": "oats", "r": "rye"},
        "nuts": {"p": "pecan", "c": "cashew", "a": "almond", "m": "macadamia"}}


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


def _grid(png: Path) -> Tuple[List[float], List[float]]:
    """-> (column edges, row edges) in points: long dark vertical lines, then long dark horizontal lines between the outer ones."""
    im = Image.open(png).convert("L")
    w, h = im.size
    px = im.load()
    top, bottom = int(h * 0.12), int(h * 0.88)
    vl = [x for x in range(w) if sum(1 for y in range(top, bottom, 2) if px[x, y] < 120) / ((bottom - top) / 2.0) > 0.45]
    cols = [v / SCALE for v in _collapse(vl)]
    if not cols:
        raise ValueError(f"{png.name}: no vertical grid lines found")
    x0, x1 = int(cols[0] * SCALE) + 3, int(cols[-1] * SCALE) - 3
    hl = [y for y in range(h) if sum(1 for x in range(x0, x1, 2) if px[x, y] < 120) / ((x1 - x0) / 2.0) > 0.85]
    rows = [v / SCALE for v in _collapse(hl)]
    return cols, rows


def read_pages(pdf: Path) -> List[dict]:
    """-> list of pages, each {'page': n, 'rows': [row dicts]} for every grid page of the guide (pages 2-7)."""
    bbox = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    page_chunks = bbox.split("<page ")[1:]
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(DPI), "-png", str(pdf), str(Path(tmp) / "p")], check=True)
        pngs = sorted(Path(tmp).glob("p-*.png"))
        if len(pngs) != len(page_chunks):
            raise ValueError("page count differs between the render and the text layer")
        for n, (chunk, png) in enumerate(zip(page_chunks, pngs), start=1):
            if n == 1:
                continue    # page 1 is the key and the notes
            words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunk)]
            out.append({"page": n, **_read_page(n, words, *_grid(png))})
    return out


def _read_page(n: int, words: List[tuple], cols: List[float], rows: List[float]) -> dict:
    if len(cols) == 22 and cols[1] - cols[0] < 40:
        cols = cols[1:]                       # page 4 has a narrow label column ("Choice of two tacos") left of the dish names
    if len(cols) != 21:
        raise ValueError(f"page {n}: {len(cols)} vertical grid lines, expected 21 (the name column's left edge and 20 edges of the 19 data columns)")
    # header words (rotated text) sit in their own column: the labels must be in the expected order
    labels = {}
    for x0, y0, x1, y1, t in words:
        key = HEADER_LABELS.get(t.upper())
        if key and (y1 - y0) > 12:                 # rotated text is tall and narrow
            idx = _col((x0 + x1) / 2, cols[1:])
            if idx is not None:
                labels.setdefault(key, set()).add(idx)
    for key, idxs in labels.items():
        if idxs != {COLUMN_KEYS.index(key)}:
            raise ValueError(f"page {n}: header {key!r} sits in column(s) {sorted(idxs)}, expected {COLUMN_KEYS.index(key)}")
    if not labels:
        raise ValueError(f"page {n}: no header labels found")
    out_rows = []
    edges = [r for r in rows if True]
    for a, b in zip(edges, edges[1:]):
        band = [w for w in words if a <= (w[1] + w[3]) / 2 < b]
        plu = [w for w in band if w[0] < cols[0] and re.fullmatch(r"\d{3,4}", w[4])]
        if len(plu) > 1:
            raise ValueError(f"page {n}: band {a:.0f}-{b:.0f} holds two PLU numbers {[w[4] for w in plu]}")
        name_words = sorted((w for w in band if cols[0] <= w[0] < cols[1] and (w[0] + w[2]) / 2 < cols[1]), key=lambda w: (round(w[1] / 4), w[0]))
        row = {"plu": plu[0][4] if plu else None, "top": a, "bottom": b, "name_raw": " ".join(w[4] for w in name_words), "cells": {}}
        for w in band:
            if w in plu or w in name_words:
                continue
            c = (w[0] + w[2]) / 2
            if c < cols[0]:
                if not re.fullmatch(r"\d+", w[4]):
                    continue                  # the column's own header label "PLU", or the rotated "Choice of two tacos"
                raise ValueError(f"page {n}: word {w[4]!r} at ({w[0]:.0f}, {w[1]:.0f}) is left of the name column and is no PLU number")
            idx = _col(c, cols[1:])
            if idx is None:
                continue                      # beyond the grid (page furniture)
            row["cells"].setdefault(COLUMN_KEYS[idx], []).append(w[4])
        if row["plu"] or name_words:
            out_rows.append(row)
    return {"rows": out_rows, "cols": cols}


def _col(x: float, cols: List[float]):
    for i in range(len(cols) - 1):
        if cols[i] <= x < cols[i + 1]:
            return i
    return None
