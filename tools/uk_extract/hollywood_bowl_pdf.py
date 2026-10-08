"""Read Hollywood Bowl's official "Food & Drink" menu PDF (one PDF per bowling centre) into column texts.

Used by tools/uk_extract/hollywood_bowl.py. Requires `pdftotext` (poppler). Numbers are never read here: this module only
cuts each page into the columns the menu is laid out in and returns each column as one line of text, in reading order, with
the words exactly as printed. The calories are then picked out of that text by hollywood_bowl.py, item by item, with a pattern
that names the words printed beside each number.

The PDF is a designed menu (two or three columns per page, items and prices in separate text blocks), so a plain page dump
interleaves the columns. Each column is therefore cut out with its own crop box (points from the top-left of the page, as
`pdftotext -x -y -W -H` takes them), measured from the Ashford file (menu code SS2/1026); the same boxes read all 72 Great Britain bowling-centre files
(hollywood_bowl.py --compare). The Puttstars and Northern Ireland files use other layouts and are not read. The footer of every page ("Adults need around 2000 kcal per day", menu code, centre name) lies
below y = 828 and is outside every crop.
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

# region id -> (page, x, y, width, height). Page size is 590.6 x 837.2 points.
REGIONS = {
    "p1L": (1, 55, 270, 250, 555),
    "p1R": (1, 325, 270, 265, 555),
    "p2L": (2, 55, 330, 250, 495),
    "p2R": (2, 325, 330, 265, 495),
    "p3L": (3, 55, 180, 250, 645),
    "p3R": (3, 325, 180, 265, 645),
    "p4L": (4, 55, 160, 265, 665),
    "p4R": (4, 345, 160, 245, 665),
    "p5L": (5, 55, 220, 265, 605),
    "p5R": (5, 325, 220, 265, 605),
    "p6M": (6, 402, 285, 183, 165),   # the mixers (Fever-Tree, Red Bull); the middle column's prices sit left of x = 402
}
KCAL = re.compile(r"\d+\s*kcal")
FOOTER = "Adults need around 2000 kcal per day"


def pdftotext(pdf: Path, *args: str) -> str:
    return subprocess.run(["pdftotext", *args, str(pdf), "-"], check=True, capture_output=True, text=True).stdout


def region_texts(pdf: Path) -> dict[str, str]:
    """Each region's text on one line (whitespace collapsed, zero-width spaces dropped)."""
    out = {}
    for rid, (page, x, y, w, h) in REGIONS.items():
        raw = pdftotext(pdf, "-layout", "-f", str(page), "-l", str(page), "-x", str(x), "-y", str(y), "-W", str(w), "-H", str(h))
        out[rid] = " ".join(raw.replace("​", "").split())
    return out


def page_kcal_counts(pdf: Path) -> dict[int, int]:
    """Number of 'N kcal' figures printed on each page, not counting the footer line. Used to prove the regions miss none."""
    counts = {}
    for page in range(1, 7):
        text = " ".join(pdftotext(pdf, "-f", str(page), "-l", str(page)).replace("​", "").split())
        counts[page] = len(KCAL.findall(text)) - text.count(FOOTER)
    return counts


def centre_name(pdf: Path) -> str:
    """The venue name printed bottom right of page 5 (the cocktail page), '' when there is none."""
    raw = pdftotext(pdf, "-layout", "-f", "5", "-l", "5", "-x", "480", "-y", "829", "-W", "110", "-H", "15")
    return " ".join(raw.split())
