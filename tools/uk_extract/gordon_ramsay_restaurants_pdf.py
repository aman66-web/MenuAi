"""Read a Gordon Ramsay Restaurants "calorie matrix / calorie menu" PDF into its printed rows.

Used by tools/uk_extract/gordon_ramsay_restaurants.py. Requires `pdftotext` (poppler). Numbers come back exactly as printed
(strings such as "222", "123 | 301"); nothing is converted, rounded or estimated here.

Both files are ONE tall page with a real text layer and two columns. Each row is a dish name on the left and its calories on the
right, printed as "NNNkcal" ("1055 kcal" with a space in a few places, "222kacl" once: a typo in the chain's own file, reported as
unit "kacl"); a few rows print two values separated by a bar ("123 | 301kcal", sashimi and nigiri). A row without a calorie value
is a section heading ("BURGERS", "SNACKS").

Reading is by position, never by counting:
  1. every word of page 1 is found with its box (pdftotext -bbox);
  2. a word belongs to the left or the right column by its box against the middle of the page; a word that crosses the middle stops
     the run (the layout changed);
  3. words in a column whose tops are within LINE_TOL points are one line, joined left to right;
  4. a line ending in calories is a dish row, any other line is a section heading and starts a new section for that column.
Anything that does not fit (a dish row before any heading, a calorie value that is not a whole number, a word across the middle)
raises, so a new layout stops the run instead of attaching a number to the wrong dish.
"""
from __future__ import annotations

import html
import re
import subprocess
from pathlib import Path
from typing import Dict, List

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)"')
ROW = re.compile(r"^(?P<name>.+?)\s+(?P<vals>\d+(?:\s*\|\s*\d+)*)\s*(?P<unit>kcal|kacl)$")
LINE_TOL = 3.0  # points: tops of words on one line differ by less than this (rows are about 17 points apart or more)


def read_rows(pdf: Path, skip_above: float = 0.0) -> List[Dict]:
    """Rows in reading order (left column top to bottom, then right column). Each row is a dict:
    column ("L"/"R"), section (heading as printed), name (as printed), values (list of strings, one per printed number), unit
    ("kcal", or "kacl" where the file misspells it), line (the whole printed line). Words whose top is above `skip_above` (the title
    and logo area) are ignored."""
    out = subprocess.run(["pdftotext", "-bbox", "-f", "1", "-l", "1", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    page = PAGE.search(out)
    if not page:
        raise SystemExit(f"{pdf}: no page found in pdftotext output")
    middle = float(page.group(1)) / 2
    words = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]
    if not words:
        raise SystemExit(f"{pdf}: no text layer (the file may have become an image)")
    rows: List[Dict] = []
    for column in ("L", "R"):
        mine = []
        for x0, y0, x1, y1, text in words:
            if y0 < skip_above:
                continue
            if x0 < middle < x1:
                raise SystemExit(f"{pdf}: the word {text!r} crosses the middle of the page: the layout changed, re-check the reader")
            if (x1 <= middle) == (column == "L"):
                mine.append((y0, x0, text))
        mine.sort()
        lines: List[List] = []
        for y0, x0, text in mine:
            if lines and y0 - lines[-1][0] < LINE_TOL:
                lines[-1][1].append((x0, text))
            else:
                lines.append([y0, [(x0, text)]])
        section = None
        for _, parts in lines:
            line = " ".join(t for _, t in sorted(parts))
            m = ROW.match(line)
            if not m:
                section = line
                continue
            if section is None:
                raise SystemExit(f"{pdf}: dish row {line!r} before any section heading in the {column} column")
            rows.append({"column": column, "section": section, "name": m.group("name"),
                         "values": [v.strip() for v in m.group("vals").split("|")], "unit": m.group("unit"), "line": line})
    return rows


def headings(pdf: Path, skip_above: float = 0.0) -> List[str]:
    """The section headings in reading order (left column, then right), as printed."""
    rows = read_rows(pdf, skip_above)
    seen: List[str] = []
    for r in rows:
        if r["section"] not in seen:
            seen.append(r["section"])
    return seen
