"""Read a Gordon Ramsay Restaurants "calorie matrix / calorie menu" PDF into its printed rows.

Used by tools/uk_extract/gordon_ramsay_restaurants.py. Requires `pdftotext` (poppler). Numbers come back exactly as printed
(strings such as "222", "123 | 301"); nothing is converted, rounded or estimated here.

Both files are ONE tall page with a real text layer and two columns. Each row is a dish name on the left and its calories on the
right, printed as "NNNkcal" ("1055 kcal" with a space in a few places, "222kacl" once in the April 2026 file: a typo in the chain's
own file, reported as unit "kacl"); a few rows print two values separated by a bar or a slash ("123 | 301kcal" for sashimi and
nigiri, "1317/2244kcal" for a half and a full rack). A row without a calorie value is a section heading ("BURGERS", "SNACKS").

Reading is by position, never by counting:
  1. every word of page 1 is found with its box (pdftotext -bbox);
  2. a word belongs to the left or the right column by its box against the middle of the page; a word that crosses the middle stops
     the run (the layout changed);
  3. words in a column whose tops are within LINE_TOL points are one line, joined left to right;
  4. a line ending in calories is a dish row, any other line is a section heading and starts a new section for that column;
  5. a dish whose name runs over two lines is printed as three close lines (October 2026 Street file: "ADD: MAKE IT A TRIPLE" /
     "343kcal" / "(EXTRA PATTY & CHEESE & ONIONS)", each about 5 points apart instead of the usual 17): a line that is ONLY a
     calorie value takes the line just above it (closer than STACK_GAP) as its name, and a line just below it (closer than STACK_GAP)
     that starts with "(" is added to that name. A calorie-only line without such a line above stops the run.
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
ROW = re.compile(r"^(?P<name>.+?)\s+(?P<vals>\d+(?:\s*[|/]\s*\d+)*)\s*(?P<unit>kcal|kacl)$")
VALUE_ONLY = re.compile(r"^(?P<vals>\d+(?:\s*[|/]\s*\d+)*)\s*(?P<unit>kcal|kacl)$")
LINE_TOL = 3.0  # points: tops of words on one line differ by less than this (rows are about 17 points apart or more)
STACK_GAP = 8.0  # points: the three lines of a two-line dish name with its value between them are about 5.4 points apart


def read_rows(pdf: Path, skip_above: float = 0.0, skip_below: float = 0.0) -> List[Dict]:
    """Rows in reading order (left column top to bottom, then right column). Each row is a dict:
    column ("L"/"R"), section (heading as printed), name (as printed), values (list of strings, one per printed number), unit
    ("kcal", or "kacl" where the file misspells it), line (the whole printed line). Words whose top is above `skip_above` (the title
    and logo area) are ignored, and so are words whose top is below `skip_below` when it is set (a footer)."""
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
            if y0 < skip_above or (skip_below and y0 > skip_below):
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
        texts = [(y, " ".join(t for _, t in sorted(parts))) for y, parts in lines]
        section = None
        previous = None  # the section heading before the current one (a stacked dish name is first read as a heading)
        k = 0
        while k < len(texts):
            y, line = texts[k]
            v = VALUE_ONLY.match(line)
            if v:  # a dish printed over stacked lines: name above, value, optional "(...)" below
                above = texts[k - 1] if k else None
                if above is None or y - above[0] >= STACK_GAP or ROW.match(above[1]) or section != above[1] or previous is None:
                    raise SystemExit(f"{pdf}: the calorie value {line!r} has no dish name just above it in the {column} column: "
                                     "the layout changed, re-check the reader")
                name, printed = above[1], above[1] + " / " + line
                if k + 1 < len(texts) and texts[k + 1][0] - y < STACK_GAP and texts[k + 1][1].startswith("("):
                    name += " " + texts[k + 1][1]
                    printed += " / " + texts[k + 1][1]
                    k += 1
                section = previous  # the name line was not a heading
                rows.append({"column": column, "section": section, "name": name,
                             "values": [x.strip() for x in re.split(r"[|/]", v.group("vals"))], "unit": v.group("unit"), "line": printed})
                k += 1
                continue
            m = ROW.match(line)
            if not m:
                previous, section = section, line
                k += 1
                continue
            if section is None:
                raise SystemExit(f"{pdf}: dish row {line!r} before any section heading in the {column} column")
            rows.append({"column": column, "section": section, "name": m.group("name"),
                         "values": [x.strip() for x in re.split(r"[|/]", m.group("vals"))], "unit": m.group("unit"), "line": line})
            k += 1
    return rows


def headings(pdf: Path, skip_above: float = 0.0) -> List[str]:
    """The section headings in reading order (left column, then right), as printed."""
    rows = read_rows(pdf, skip_above)
    seen: List[str] = []
    for r in rows:
        if r["section"] not in seen:
            seen.append(r["section"])
    return seen
