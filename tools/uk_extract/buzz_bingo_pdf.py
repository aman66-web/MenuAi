"""Read Buzz Bingo's official "Kcal June 2025" PDF into (section, name, kcal) rows.

Used by tools/uk_extract/buzz_bingo.py. Needs `pdftotext` (poppler); standard library only (Python 3.9). Numbers are returned
exactly as printed (strings such as "1011"); nothing is converted, rounded or estimated here.

The file is 5 portrait A4 pages exported from Excel. Every section is a table: a shaded header band (the section title, centred, with
"Energy" and "(Kcal)" stacked at the right) followed by one row per item: the name on the left, the energy as a whole number in the
right-hand column. Two rows print a name over two lines (the hot dog rows); their number sits at the vertical middle of the two lines.

Reading is by position (pdftotext -bbox):
  1. words are grouped into lines by their vertical position;
  2. a header band runs from the "Energy" word at the right to the "(Kcal)" word under it; the words of the left column inside that
     band are the section title;
  3. every other left-column line is an item name line, every right-column whole number an energy value; each name line goes to the
     energy value whose vertical centre is nearest, and the script stops if a line has no value within reach, if two values are
     equally near, or if a value has no name.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">')
RIGHT_X = 330.0   # words starting right of this (points) are the energy column; the printed column sits at about 345-375
REACH = 9.0       # a name line belongs to an energy value at most this far (points) from its own vertical centre


def _words(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    pages: list[list[tuple[float, float, float, float, str]]] = []
    for chunk in re.split(r"(?=<page )", out):
        if not PAGE.search(chunk):
            continue
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunk)])
    return pages


def _lines(words: list[tuple[float, float, float, float, str]]) -> list[dict]:
    """Left-column words grouped into lines (words whose vertical centres are within 2 points)."""
    left = sorted((w for w in words if w[0] < RIGHT_X), key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    lines: list[dict] = []
    for w in left:
        mid = (w[1] + w[3]) / 2
        if lines and abs(lines[-1]["mid"] - mid) <= 2.0:
            lines[-1]["words"].append(w)
        else:
            lines.append({"mid": mid, "words": [w]})
    for ln in lines:
        ln["words"].sort(key=lambda w: w[0])
        ln["text"] = " ".join(w[4] for w in ln["words"])
    return lines


def read_rows(pdf: Path) -> tuple[list[str], list[tuple[str, str, str]], int]:
    """Returns (lines printed above the first table, [(section title, item name, kcal)] in print order, number of pages)."""
    pages = _words(pdf)
    heading: list[str] = []
    rows: list[tuple[str, str, str]] = []
    for pno, words in enumerate(pages, 1):
        energy = sorted((w for w in words if w[0] >= RIGHT_X and w[4] == "Energy"), key=lambda w: w[1])
        kcal_head = sorted((w for w in words if w[0] >= RIGHT_X and w[4].lower() == "(kcal)"), key=lambda w: w[1])
        if not energy or len(energy) != len(kcal_head):
            raise SystemExit(f"page {pno}: {len(energy)} 'Energy' and {len(kcal_head)} '(Kcal)' header words: the layout changed")
        bands = [(e[1] - 4.0, k[3] + 4.0) for e, k in zip(energy, kcal_head)]
        for lo, hi in bands:
            if hi - lo > 40:
                raise SystemExit(f"page {pno}: a header band is {hi - lo:.0f} points tall: the layout changed")
        values = sorted(((w[1] + w[3]) / 2, w[4]) for w in words
                        if w[0] >= RIGHT_X and w[4].lower() not in ("energy", "(kcal)"))
        for _, v in values:
            if not re.fullmatch(r"\d{1,4}", v):
                raise SystemExit(f"page {pno}: unexpected text {v!r} in the energy column")
        titles: list[list[str]] = [[] for _ in bands]
        names: list[dict] = []  # name lines outside the bands
        for ln in _lines(words):
            band = next((i for i, (lo, hi) in enumerate(bands) if lo <= ln["mid"] <= hi), None)
            if band is not None:
                titles[band].append(ln["text"])
            elif ln["mid"] < bands[0][0]:
                if pno != 1:
                    raise SystemExit(f"page {pno}: text above the first table: {ln['text']!r}")
                heading.append(ln["text"])
            else:
                names.append(ln)
        # a name line -> the nearest value; a value -> every name line that chose it (1 or 2 lines)
        owned: dict[int, list[dict]] = {i: [] for i in range(len(values))}
        for ln in names:
            dist = sorted((abs(ln["mid"] - v[0]), i) for i, v in enumerate(values))
            if not dist or dist[0][0] > REACH or (len(dist) > 1 and dist[1][0] - dist[0][0] < 3.0):
                raise SystemExit(f"page {pno}: cannot tell which energy value belongs to {ln['text']!r}")
            owned[dist[0][1]].append(ln)
        for i, (mid, v) in enumerate(values):
            if not owned[i]:
                raise SystemExit(f"page {pno}: energy value {v} has no name")
            parts = sorted(owned[i], key=lambda ln: ln["mid"])
            if len(parts) > 2:
                raise SystemExit(f"page {pno}: value {v} has {len(parts)} name lines")
            # which band is above this row
            band = max((j for j, (lo, hi) in enumerate(bands) if hi <= parts[0]["mid"]), default=None)
            if band is None:
                raise SystemExit(f"page {pno}: value {v} is above every header band")
            rows.append((" ".join(titles[band]), " ".join(p["text"] for p in parts), v))
    # keep print order: page by page, then top to bottom (values were sorted by y inside each page already)
    return heading, rows, len(pages)
