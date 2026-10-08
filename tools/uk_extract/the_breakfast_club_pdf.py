"""Read The Breakfast Club's official "Calorie Menu" PDF into the text of its four menu columns.

Used by tools/uk_extract/the_breakfast_club.py. Requires `pdftotext` (poppler). Nothing is converted, rounded or estimated here: this
file only turns the page into reading-order text (one string per column), exactly as printed (ligatures such as "fl" are spelled out).

The file is a 2-page A4 landscape PDF made with Apple Pages: page 1 is the whole July 2026 breakfast/brunch/lunch menu in four
columns, page 2 is a cover with the logo only. Every dish prints its calories as "NNNkcal" beside its name or on the next line,
and extras ("ADD EGG 131kcal", "CHOOSE: BACON 220kcal ...") print theirs in small red capitals under the dish. The columns are
read separately, top to bottom (lines sorted by their position), so a value is never attached to a dish by counting.
"""
from __future__ import annotations
import html
import re
import subprocess
import unicodedata
from pathlib import Path

PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
# Left edges (points) of the four menu columns on page 1, measured from the July 2026 PDF; a line belongs to the column whose range holds its left edge.
COLUMN_EDGES = [(0.0, 205.0), (205.0, 419.0), (419.0, 630.0), (630.0, 842.0)]
HEADINGS = {0: ["CAF CLASSICS", "DIETARY REQUIREMENTS"], 1: ["PANCAKES FOR THE TABLE", "DINER PLATES"],
            2: ["VEGGIE PLATES", "CHICKEN"], 3: ["TACOS, HUEVOS+BURRITOS", "SIDES+SHARES"]}


def _clean(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).replace("​", "").split())


def read_columns(pdf: Path) -> list:
    """-> four strings (columns left to right), each the column's lines top to bottom joined with newlines."""
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = PAGE.findall(out)
    if len(pages) != 2:
        raise SystemExit(f"The PDF now has {len(pages)} pages (expected 2: the menu, then a logo cover). Re-check the layout.")
    width, height, body = pages[0]
    if abs(float(width) - 841.89) > 1 or abs(float(height) - 595.28) > 1:
        raise SystemExit(f"Page 1 is {width} x {height} points (expected A4 landscape 841.89 x 595.28): the layout changed")
    if "kcal" in pages[1][2]:
        raise SystemExit("Page 2 now prints calories: it used to be a logo-only cover. Re-check.")
    lines = []
    for m in LINE.finditer(body):
        x0, y0, _x1, _y1, inner = m.groups()
        words = [html.unescape(w) for w in WORD.findall(inner)]
        lines.append((float(x0), float(y0), _clean(" ".join(words))))
    columns = []
    for c, (lo, hi) in enumerate(COLUMN_EDGES):
        mine = sorted((ln for ln in lines if lo <= ln[0] < hi), key=lambda ln: (ln[1], ln[0]))
        text = "\n".join(t for _, _, t in mine if t)
        for heading in HEADINGS[c]:
            if len(re.findall(rf"^{re.escape(heading)}$", text, re.M)) != 1:
                raise SystemExit(f"Column {c + 1}: the heading {heading!r} is not printed once on its own line: the layout changed")
        columns.append(text)
    return columns
