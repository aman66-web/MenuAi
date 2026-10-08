"""Read the allergen grid of Jamie's Italian (UK)'s official "Allergen Menu" PDF (Sept V1, 8 September 2026).

Used by tools/uk_extract/jamies_italian.py. Requires `pdftotext` (poppler) only.

The PDF has a text layer: one row per dish, a name on the left and, per allergen column, the word "Contains" (legend: "Contains =
Allergen Present in Dish") or "MC" (legend: "MC = Dish MC Allergen": the guide's find-and-replace of "may contain": its own sentence reads
"Foods cooked in our fryers MC traces of allergens due to shared cooking oil"), or nothing. The last two columns, Vegetarian and Vegan,
hold "Yes". Every table repeats the header row ("Menu Item", "Cereals Containing Gluten", "Tree Nuts", "Peanuts", "Eggs", "Milk",
"Fish", "Crustaceans", "Molluscs", "Celery", "Mustard", "Sesame", "Soya", "Sulphites", "Lupin", "Vegetarian", "Vegan"), so each cell is
assigned to the column whose header centre is nearest on the same page and must lie within a third of the column spacing of it.

Nothing is inferred: a cell word other than Contains / MC / Yes, a cell word that no dish row owns, a dish row that is empty in every
column including Vegetarian/Vegan and Lupin, or a header that is not one of the known allergen words stops the run (docs/DATA.md
"Allergens"; common.allergen_words stops on any word it does not know).
"""
from __future__ import annotations

import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import allergen_words  # noqa: E402

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')
# header text (as printed, lower case words joined by a space) in column order; the two last are not allergens
HEADERS = ["cereals containing gluten", "tree nuts", "peanuts", "eggs", "milk", "fish", "crustaceans", "molluscs", "celery", "mustard",
           "sesame", "soya", "sulphites", "lupin", "vegetarian", "vegan"]
LABEL_MAX_X = 268.0  # dish names end left of the first column (pt)
SECTIONS = {"Spuntino and Antipasto", "Pizza", "Pasta", "Contorni", "Dolci", "Kids", "Beer & Cider", "Cocktails", "Hot Drinks", "Soft Drinks", "Mixers", "Spirits",
            "Menu Item"}
CELL_VALUES = {"Contains": "contains", "MC": "may_contain", "Yes": "yes"}
HEADER_WORDS = {"Menu", "Item", "Cereals", "Containing", "Gluten", "Tree", "Nuts", "Peanuts", "Eggs", "Milk", "Fish", "Crustaceans", "Molluscs",
                "Celery", "Mustard", "Sesame", "Soya", "Sulphites", "Lupin", "Vegetarian", "Vegan"}


def _words(pdf: Path) -> list[list[tuple]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for page in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in WORD.findall(page)])
    return pages


def _header_centres(words: list[tuple], page_no: int) -> list[float]:
    """Column centres from the first 'Menu Item' header row of the page (the same on every repeat; checked)."""
    ys = sorted({round(w[1]) for w in words if w[4] == "Menu"})
    if not ys:
        raise SystemExit(f"Allergen menu page {page_no}: no 'Menu Item' header row found: the layout changed.")
    centres_per_header = []
    for y in ys:
        # header words sit within 20 pt of the 'Menu' word's line (Cereals Containing / Gluten wrap onto two lines)
        near = [w for w in words if abs(w[1] - y) < 22 and w[0] > LABEL_MAX_X - 5]
        got = []
        # single words, plus the two-word headers
        by = {w[4]: w for w in near}
        try:
            gl = [by["Cereals"], by["Containing"]]
            tree = [by["Tree"], by["Nuts"]]
            singles = [by[x] for x in ("Peanuts", "Eggs", "Milk", "Fish", "Crustaceans", "Molluscs", "Celery", "Mustard", "Sesame", "Soya",
                                       "Sulphites", "Lupin")]
        except KeyError:
            continue  # a band row that repeats only part of the header (e.g. the section rows with Vegetarian / Vegan)
        got.append((min(w[0] for w in gl) + max(w[2] for w in gl)) / 2)
        got.append((min(w[0] for w in tree) + max(w[2] for w in tree)) / 2)
        got += [(w[0] + w[2]) / 2 for w in singles]
        veg = [w for w in words if w[4] == "Vegetarian" and abs(w[1] - y) < 40 and w[1] >= y - 5]
        vegan = [w for w in words if w[4] == "Vegan" and abs(w[1] - y) < 40 and w[1] >= y - 5]
        if not veg or not vegan:
            continue
        got.append((veg[0][0] + veg[0][2]) / 2)
        got.append((vegan[0][0] + vegan[0][2]) / 2)
        centres_per_header.append(got)
    if not centres_per_header:
        raise SystemExit(f"Allergen menu page {page_no}: no complete header row found: the layout changed.")
    first = centres_per_header[0]
    for other in centres_per_header[1:]:
        if max(abs(a - b) for a, b in zip(first, other)) > 2.0:
            raise SystemExit(f"Allergen menu page {page_no}: header rows are not at the same x positions: the layout changed.")
    return first


def read_matrix(pdf: Path) -> list[dict]:
    """[{label, page, y, contains:set(keys), may_contain:set(keys), cereals:set, nuts:set, vegetarian:bool, vegan:bool, cells:{header:value}}]
    for every dish row in reading order. Keys are the 14 allergen keys (common.allergen_words)."""
    keys = []
    for h in HEADERS[:-2]:
        k, c, n = allergen_words([h], f"allergen menu header {h!r}")
        if len(k) != 1 or c or n:
            raise SystemExit(f"Header {h!r} did not map to exactly one generic allergen.")
        keys.append(next(iter(k)))
    rows: list[dict] = []
    for page_no, words in enumerate(_words(pdf), start=1):
        if not words:
            continue
        centres = _header_centres(words, page_no)
        spacing = min(b - a for a, b in zip(centres, centres[1:]))
        label_words = sorted([w for w in words if w[2] <= LABEL_MAX_X], key=lambda w: (w[1], w[0]))
        page_rows: list[dict] = []
        for w in label_words:
            for r in page_rows:
                if abs(r["y"] - w[1]) < 2.5:
                    r["w"].append(w)
                    break
            else:
                page_rows.append({"y": w[1], "w": [w]})
        # prose lines (the intro paragraphs) carry ordinary words right of the label area; dish rows only carry cell values and headers there
        prose_ys = [w[1] for w in words if w[0] > LABEL_MAX_X and w[4] not in HEADER_WORDS and w[4] not in CELL_VALUES]
        for r in page_rows:
            r["label"] = re.sub(r"\s+", " ", " ".join(x[4] for x in sorted(r["w"], key=lambda x: x[0]))).strip()
            r["cells"] = {}
            r["prose"] = any(abs(y - r["y"]) < 3.5 for y in prose_ys)
        page_rows = [r for r in page_rows if not r["prose"]]
        # anything right of the labels inside the table area must be a header word or a cell value (the title, legend and footer lie
        # above the first header row or below the page's last row)
        first_header_y = min(w[1] for w in words if w[4] == "Menu")
        footer_y = max(w[1] for w in words) - 5
        for w in words:
            if w[0] > LABEL_MAX_X and first_header_y - 2 <= w[1] < footer_y and w[4] not in HEADER_WORDS and w[4] not in CELL_VALUES:
                raise SystemExit(f"Allergen menu page {page_no}: unexpected word {w[4]!r} at y={w[1]:.0f} x={w[0]:.0f} inside the table area.")
        for w in words:
            if w[4] not in CELL_VALUES or w[0] <= LABEL_MAX_X - 1:
                continue
            cx = (w[0] + w[2]) / 2
            owners = [r for r in page_rows if abs(r["y"] - w[1]) < 3.5 and r["label"] != "Menu Item"]
            if not owners and w[1] < first_header_y - 2:
                continue  # the legend box above the first table of page 1 ("MC" / "Contains"): no dish row beside it
            if len(owners) != 1:
                raise SystemExit(f"Allergen menu page {page_no}: cell {w[4]!r} at y={w[1]:.0f} belongs to {len(owners)} rows: {[o['label'] for o in owners]}")
            col = min(range(len(centres)), key=lambda i: abs(centres[i] - cx))
            if abs(centres[col] - cx) > spacing / 3:
                raise SystemExit(f"Allergen menu page {page_no}: cell word {w[4]!r} at x={cx:.0f} is not under a column header.")
            if (col >= 14) != (w[4] == "Yes"):
                raise SystemExit(f"Allergen menu page {page_no}: {w[4]!r} under column {HEADERS[col]!r}: unexpected.")
            if HEADERS[col] in owners[0]["cells"]:
                raise SystemExit(f"Allergen menu row {owners[0]['label']!r}: two values under {HEADERS[col]!r}")
            owners[0]["cells"][HEADERS[col]] = CELL_VALUES[w[4]]
        for r in page_rows:
            if r["label"] in SECTIONS or r["label"] in ("", "Gluten", "Containing"):
                if r["cells"]:
                    raise SystemExit(f"Allergen menu: the heading row {r['label']!r} has cell values: the layout changed.")
                continue
            if r["y"] < first_header_y - 2 and not r["cells"]:
                continue  # intro text above the first table
            if r["label"].startswith("Jamie's Italian Allergen Menu") or r["label"] in ("Sept V1", "ALLERGEN MENU"):
                continue  # page footer
            contains = {keys[HEADERS.index(h)] for h, v in r["cells"].items() if v == "contains"}
            may = {keys[HEADERS.index(h)] for h, v in r["cells"].items() if v == "may_contain"}
            rows.append({"label": r["label"], "page": page_no, "y": r["y"], "contains": contains, "may_contain": may,
                         "vegetarian": r["cells"].get("vegetarian") == "yes", "vegan": r["cells"].get("vegan") == "yes",
                         "cells": dict(r["cells"])})
    return rows
