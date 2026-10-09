"""Reader for Riva Blu's own allergen & calorie guide (https://www.rivablu.co.uk/allergens/riva-blu-<site>, one 26-page PDF with a text
layer, dated 25/08/2026 on its first page), used by riva_blu.py. Needs `pdftotext` (poppler); everything else is the standard library.

Every page is a set of tables, one per menu section. A table's header row prints the section's name at the left (and "Kcal"), then 14
columns; each dish is one row: its name at the left (wrapped over up to three lines, centred on the row), the calories (Kcal column)
and the 14 cells. The columns, left to right (by the x position of the cells; the printed header words are wrapped over several lines,
so they are checked by position too):

    Cereals containing gluten (the cell prints NO or the cereal: WHEAT ...), Milk, Egg, Peanuts, Nuts (NO or YES or the nut named),
    Crustaceans, Mustard, Fish, Lupin, Sesame, Celery, Soya, Molluscs, Sulphites (the last ones print YES or NO).

Rows are found by position, not by order of text, so a name that wraps cannot be mistaken for a cell. Nothing here converts, rounds or fills
in a value; a row that does not have a number in the Kcal column and all 14 cells is returned with kcal None so the caller can see it.
"""
from __future__ import annotations
import hashlib
import html
import re
import subprocess
from pathlib import Path

# x centre of each column's cells, and the allergen (common._A word) the column stands for; the header words are checked against them
COLUMNS = [("cereals", 187), ("milk", 223), ("egg", 247), ("peanuts", 271), ("nuts", 304), ("crustaceans", 338), ("mustard", 364),
           ("fish", 390), ("lupin", 416), ("sesame", 440), ("celery", 463), ("soya", 487), ("molluscs", 513), ("sulphites", 539)]
HEADER_WORDS = {  # header word (as printed, wrapped) -> column; x of the word's left edge must be within 14 of the column's header x
    "CEREALS": "cereals", "MILK": "milk", "EGG": "egg", "PEAN": "peanuts", "NUTS": "nuts", "CRUSTA": "crustaceans", "MUST": "mustard",
    "FISH": "fish", "LUPIN": "lupin", "SESA": "sesame", "CELER": "celery", "SOYA": "soya", "MOLLU": "molluscs", "SULP": "sulphites",
}
HEADER_X = {"cereals": 181, "milk": 220, "egg": 246, "peanuts": 267, "nuts": 301, "crustaceans": 331, "mustard": 360, "fish": 388,
            "lupin": 411, "sesame": 438, "celery": 459, "soya": 484, "molluscs": 507, "sulphites": 536}
KCAL_X = (146, 176)       # left edge of a calorie value
NAME_X = 148               # words left of this are the dish name / section title
ROW_TOL = 3.0


def sha256_file(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def pdf_words(pdf: Path) -> list[list[tuple]]:
    """[[ (x0, y0, x1, y1, text), ... ] per page] from `pdftotext -bbox`."""
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True).stdout.decode("utf-8", "replace")
    pages = []
    for page in out.split("<page ")[1:]:
        words = [(float(a), float(b), float(c), float(d), html.unescape(w))
                 for a, b, c, d, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', page)]
        pages.append(words)
    return pages


def _col(x_centre: float) -> str | None:
    best = min(COLUMNS, key=lambda c: abs(c[1] - x_centre))
    return best[0] if abs(best[1] - x_centre) <= 14 else None


BAND = (-3.0, 32.0)              # y range below a table's top header word ("CEREALS") that holds the wrapped header
HEADER_ONLY = {"Kcal", "KCAL", "CONTAINING", "GLUTEN", "UTS", "CEANS", "ARD", "ME", "Y", "SCS", "HITES"} | set(HEADER_WORDS)
SINGLE = {"YES", "NO"}
ANCHORS = {name for name, _ in COLUMNS} - {"cereals", "nuts"}   # columns whose cell is always one word and one line: they place a row


def _read_page(words: list[tuple], pno: int, carry: dict) -> list[dict]:
    """One page: tables (header band found by its CEREALS word), rows (found by their YES / NO cells and calories), names (the lines
    left of the cells, centred on their row), box titles (capitals lines left of nothing, just above a header). `carry` holds the
    table and title that were open at the end of the previous page (a table that continues on the next page has no header there)."""
    heads = []
    for w in words:
        if w[4] == "CEREALS" and 170 <= w[0] <= 195:
            top = w[1]
            band = [x for x in words if top + BAND[0] <= x[1] <= top + BAND[1]]
            kc = [x for x in band if x[4] in ("Kcal", "KCAL") and KCAL_X[0] <= x[0] <= KCAL_X[1]]
            hw = {}
            for x in band:
                col = HEADER_WORDS.get(x[4])
                if col and x[0] >= NAME_X and abs(x[0] - HEADER_X[col]) <= 16:
                    hw[col] = x[4]
            if set(hw) != set(HEADER_X):
                raise SystemExit(f"page {pno}: a table's header has the columns {sorted(hw)}, expected {sorted(HEADER_X)}: the layout changed")
            title_words = sorted((x for x in band if x[0] < NAME_X), key=lambda x: (round(x[1] / 4), x[0]))
            heads.append({"y": top, "has_kcal": bool(kc), "title": " ".join(x[4] for x in title_words), "band": (top + BAND[0], top + BAND[1])})
    heads.sort(key=lambda h: h["y"])

    def in_band(w):
        return any(h["band"][0] <= w[1] <= h["band"][1] for h in heads)

    body = [w for w in words if not in_band(w)]
    data = [w for w in body if w[0] >= NAME_X]
    anchors = []
    for w in data:
        col = _col((w[0] + w[2]) / 2) if w[0] >= 175 else None
        if (col in ANCHORS and w[4] in SINGLE) or (KCAL_X[0] <= w[0] <= KCAL_X[1] and re.fullmatch(r"\d[\d,]*", w[4])):
            anchors.append(w)
    anchors.sort(key=lambda w: w[1])
    groups: list[list[tuple]] = []
    for w in anchors:
        if groups and abs(w[1] - groups[-1][-1][1]) <= 4:
            groups[-1].append(w)
        else:
            groups.append([w])
    groups = [g for g in groups if len(g) >= 8]
    rows = [{"y": sum(w[1] for w in g) / len(g), "words": list(g), "lines": []} for g in groups]
    if not rows:
        return []
    used = {id(w) for g in groups for w in g}
    for w in data:
        if id(w) in used:
            continue
        col = _col((w[0] + w[2]) / 2) if w[0] >= 175 else None
        if col in ("cereals", "nuts"):                   # a cell that may wrap over up to three lines: belongs to the nearest row
            near = min(rows, key=lambda r: abs(r["y"] - w[1]))
            if abs(near["y"] - w[1]) <= 16:
                near["words"].append(w)
                continue
        if col is not None and w[4] in SINGLE and heads and w[1] > heads[0]["y"]:
            raise SystemExit(f"page {pno}: a {w[4]!r} cell at x={w[0]:.0f}, y={w[1]:.0f} is not part of any row")
    # names and box titles: left-hand text lines
    left = [w for w in body if w[0] < NAME_X]
    lines: dict = {}
    for w in left:
        lines.setdefault(round(w[1] / 2), []).append(w)
    titles = []
    for key in sorted(lines):
        lw = sorted(lines[key], key=lambda w: w[0])
        ly = sum(w[1] for w in lw) / len(lw)
        text = " ".join(w[4] for w in lw)
        near = min(rows, key=lambda r: abs(r["y"] - ly))
        if abs(near["y"] - ly) <= 16:
            near["lines"].append((ly, text))
        elif text.upper() == text and any(0 < h["y"] - ly <= 70 for h in heads):
            titles.append((ly, text))
    out = []
    for r in rows:
        above = [h for h in heads if h["y"] <= r["y"]]
        head = above[-1] if above else carry.get("head")
        if head is None:
            raise SystemExit(f"page {pno}: a row at y={r['y']:.0f} with no table header above it")
        tt = [t for t in titles if t[0] <= r["y"]]
        title = tt[-1][1] if tt else carry.get("title", "")
        cells: dict = {}
        kcal = None
        for w in sorted(r["words"], key=lambda w: (w[1], w[0])):
            if KCAL_X[0] <= w[0] <= KCAL_X[1] and re.fullmatch(r"\d[\d,]*", w[4]):
                kcal = w[4]
                continue
            col = _col((w[0] + w[2]) / 2)
            if col is None:
                raise SystemExit(f"page {pno}: a word {w[4]!r} at x={w[0]:.0f} is in no column")
            cells[col] = (cells.get(col, "") + " " + w[4]).strip()
        missing = [name for name, _ in COLUMNS if name not in cells]
        if missing and head["has_kcal"]:
            raise SystemExit(f"page {pno}: row {' '.join(t for _, t in sorted(r['lines']))!r} has no cell in {missing}")
        for name in missing:      # a table without calories is not published: its rows are only recorded
            cells[name] = ""
        out.append({"page": pno, "menu": title, "section": head["title"], "has_kcal": head["has_kcal"],
                    "name": " ".join(t for _, t in sorted(r["lines"])), "kcal": kcal, "cells": cells, "y": r["y"]})
    if heads:
        carry["head"] = heads[-1]
    if titles:
        carry["title"] = titles[-1][1]
    return out


def read_pdf(pdf: Path) -> list[dict]:
    """One dict per table row, in reading order:
    {page, menu (the box title above the table: 'MAIN MENU', 'SUNDAY ROAST' ...), section (the table's first header cell as printed),
     has_kcal (the table has a Kcal column), name (as printed, wrapped lines joined by a space), kcal (digits as printed or None),
     cells {column: text as printed}, y}.
    Stops (SystemExit) when a table header does not have the 14 columns where this reader expects them, or a cell is stray."""
    rows: list[dict] = []
    carry: dict = {}
    for pno, words in enumerate(pdf_words(pdf), start=1):
        rows += _read_page(words, pno, carry)
    return rows
