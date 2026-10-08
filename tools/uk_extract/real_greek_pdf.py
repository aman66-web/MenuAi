"""Read The Real Greek's official "Macronutrient Allergen Menu" (page 1 of its allergen PDF) into rows of printed text.

Used by tools/uk_extract/real_greek.py. Requires `pdftotext` (poppler). Everything is returned exactly as printed (strings such as
"3.64", "G (WHEAT) E D S SD"); nothing is converted, rounded or estimated here.

Page 1 is one ruled table: ITEM, eight number columns (CALORIES (KCAL), PROTEIN, FAT, SAT FAT, CARBS, SUGARS, FIBRE, SALT, all
per dish as served) and an ALLERGENS column of letter codes. Rows are read by position from `pdftotext -bbox`:
- a row's numbers and its first name/allergen words sit on its first line; a name or allergen that wraps continues on lines
  about 9 pt lower (a normal row is 12-13 pt below the one above), so those lines are joined to the row above;
- each number is assigned to the column whose header sits nearest above it, and the header words are checked to be in the
  expected order; a number that is not clearly inside one column stops the run.
Pages 2-4 (lunch, ice cream/coffee/tea and kids menus) print calories only and are not read here.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

NUM = re.compile(r"^\d+(?:\.\d+)?$")
KEYS = ("calories", "protein_g", "fat_g", "sat_fat_g", "carbs_g", "sugar_g", "fiber_g", "salt_g")
HEADER_ORDER = ["CALORIES", "PROTEIN", "FAT", "SAT", "CARBS", "SUGARS", "FIBRE", "SALT"]
BODY_TOP = 186.0        # y of the first table row's top edge is about 188; the header ends at 184
LINE_TOL = 1.0          # words whose yMin differ by less than this are on one line
CONTINUATION_GAP = 11.0  # a line this close below the previous line continues the same row
NAME_MAX_X = 250.0      # words starting left of this are the item name
ALLERGEN_MIN_X = 625.0  # words starting right of this are the allergens


class PdfLayoutError(RuntimeError):
    pass


def _page_words(pdf: Path, page: int) -> list:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         check=True, capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
            re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', out)]


def _cx(w) -> float:
    return (w[0] + w[2]) / 2


def read_rows(pdf: Path) -> list:
    """Page 1's table rows in order: {"name", "cells": {key: printed or ""}, "allergens": printed text}."""
    words = _page_words(pdf, 1)
    if not any(w[4] == "MACRONUTRIENT" for w in words):
        raise PdfLayoutError("page 1 no longer says MACRONUTRIENT ALLERGEN MENU: the file is not the one this reader expects")
    # ---- column centres from the rotated header (name word + its "(G)"/"(KCAL)" unit word, one line apart)
    head = [w for w in words if w[1] < BODY_TOP and 130 < w[1] < 190 and 250 < w[0] < 625]
    names = sorted((w for w in head if w[4] in HEADER_ORDER), key=lambda w: w[0])
    # SAT and FAT of "SAT FAT" share one x: the header words in x order must be exactly the eight columns once each
    seen, ordered = set(), []
    for w in names:
        if w[4] == "FAT" and any(o[4] == "SAT" and abs(o[0] - w[0]) < 3 for o in names):
            continue  # the second line of the SAT FAT header
        ordered.append(w)
    if [w[4] for w in ordered] != HEADER_ORDER:
        raise PdfLayoutError(f"column headers are {[w[4] for w in ordered]}, expected {HEADER_ORDER}")
    units = sorted((w for w in head if w[4] in ("(G)", "(KCAL)")), key=lambda w: w[0])
    if len(units) != 8 or units[0][4] != "(KCAL)" or any(u[4] != "(G)" for u in units[1:]):
        raise PdfLayoutError("expected one (KCAL) and seven (G) unit words in the header")
    centres = [(_cx(n) + _cx(u)) / 2 for n, u in zip(ordered, units)]
    pitch = min(b - a for a, b in zip(centres, centres[1:]))
    # ---- body lines
    end = min((w[1] for w in words if w[4] == "ALLERGENS" and w[1] > 1000), default=None)
    if end is None:
        raise PdfLayoutError("the ALLERGENS KEY block was not found below the table")
    body = [w for w in words if BODY_TOP < w[1] < end - 5]
    lines: list = []
    for w in sorted(body, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) < LINE_TOL:
            lines[-1].append(w)
        else:
            lines.append([w])
    rows: list = []
    prev_y = None
    for line in lines:
        line.sort(key=lambda w: w[0])
        y = line[0][1]
        name = [w[4] for w in line if w[0] < NAME_MAX_X]
        allergens = [w[4] for w in line if w[0] >= ALLERGEN_MIN_X]
        numbers = [w for w in line if NAME_MAX_X <= w[0] < ALLERGEN_MIN_X]
        continuation = prev_y is not None and y - prev_y < CONTINUATION_GAP
        prev_y = y
        if continuation:
            if numbers:
                raise PdfLayoutError(f"numbers on a continuation line near y={y:.0f}: {[w[4] for w in numbers]}")
            rows[-1]["name"] += name
            rows[-1]["allergens"] += allergens
            continue
        if not name:
            raise PdfLayoutError(f"a row at y={y:.0f} has no item name")
        cells = {k: "" for k in KEYS}
        for w in numbers:
            if not NUM.match(w[4]):
                raise PdfLayoutError(f"non-numeric text {w[4]!r} in the number columns on the row of {' '.join(name)!r}")
            d = [abs(c - _cx(w)) for c in centres]
            col = d.index(min(d))
            if min(d) > pitch * 0.4:
                raise PdfLayoutError(f"{w[4]!r} on the row of {' '.join(name)!r} is not clearly inside one column (x {_cx(w):.0f}, columns {[round(c) for c in centres]})")
            key = KEYS[col]
            if cells[key]:
                raise PdfLayoutError(f"two numbers in the {key} column on the row of {' '.join(name)!r}")
            cells[key] = w[4]
        rows.append({"name": list(name), "cells": cells, "allergens": list(allergens)})
    out = []
    for r in rows:
        out.append({"name": re.sub(r"\s+", " ", " ".join(r["name"])).strip(), "cells": r["cells"],
                    "allergens": re.sub(r"\s+", " ", " ".join(r["allergens"])).strip()})
    return out
