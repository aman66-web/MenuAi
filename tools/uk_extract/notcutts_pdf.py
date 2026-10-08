"""Read Notcutts' five official menu PDFs into plain text and calorie figures.

Used by tools/uk_extract/notcutts.py. Needs `pdftotext` (poppler); standard library only (Python 3.9). Nothing is converted,
rounded or estimated here: a figure is returned as the string printed ("74", "106/152").

Every file has a text layer. Breakfast (1 page) and Lunch (3 pages) are one column; Children's, Drinks and the Festive Feast
are two columns, so each of those is read one column at a time (cut at x = 298 pt, in the gutter of all three layouts) and the
left column is followed by the right one. A calorie figure is "<number or number/number> kcal" (also "kcals", "(270 KCAL)"),
and is returned together with all the text printed before it, so the caller can bind it to the dish name it follows.
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

GUTTER = 298  # points; the page is 595 x 842 pt
LEFT = (0, GUTTER)
RIGHT = (GUTTER, 596 - GUTTER)  # x, width
PRICE = re.compile(r"£\d+(?:\.\d\d)?|\b\d+p\b")  # prices sit between a dish name and its description: dropped so wrapped names rejoin
TOKEN = re.compile(r"\(?\s*(\d+(?:/\d+)?)\s*kcals?\b\)?", re.I)
ANY_KCAL = re.compile(r"\d\s*kcals?\b", re.I)


def pdftotext(pdf: Path, crop=None, layout: bool = True) -> str:
    cmd = ["pdftotext"] + (["-layout"] if layout else [])
    if crop:
        x, w = crop
        cmd += ["-x", str(x), "-y", "0", "-W", str(w), "-H", "842"]
    proc = subprocess.run(cmd + [str(pdf), "-"], capture_output=True, text=True, check=True)
    return proc.stdout


def normalise(text: str) -> str:
    """Drop prices and form feeds, collapse every run of white space (line breaks included) to one space."""
    text = PRICE.sub(" ", text.replace("\f", " "))
    return " ".join(text.split())


def read_menu(pdf: Path, columns) -> str:
    """The menu's text in reading order, normalised. `columns` is a list of crops (None = the whole page)."""
    text = " ".join(normalise(pdftotext(pdf, crop)) for crop in columns)
    # A crop must not lose text: the whole page (read without cropping, in the raw order) has the same number of figures.
    whole = len(ANY_KCAL.findall(pdftotext(pdf, None, layout=False)))
    here = len(ANY_KCAL.findall(text))
    if whole != here:
        raise SystemExit(f"{pdf.name}: {whole} calorie figures on the page but {here} after cutting it into columns: re-check the layout")
    return text


def figures(text: str):
    """Every calorie figure in the text as (value, before): `before` is all the text printed ahead of it, white space trimmed."""
    return [(m.group(1), text[:m.start()].rstrip()) for m in TOKEN.finditer(text)]
