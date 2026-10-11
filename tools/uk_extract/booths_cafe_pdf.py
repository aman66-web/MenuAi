"""Reader for the Booths Café menu PDFs (see booths_cafe.py): every "NNNkcal" printed beside a dish, with the dish's printed name.

Needs `pdftotext` (poppler). The menus are A5 pages in two columns. A dish's name is printed in capitals, in the column's left margin,
sometimes over two or three lines, with "NNNkcal" after its last line and the price at the right edge. A few dishes (the toast
breads, the two preserves) are printed as a lower-case option line under a heading: those carry their own label.
read_kcal() returns one record per kcal figure: page, column, label (the printed name, lines joined with a space, prices and the
dagger mark removed), kcal (the digits as printed). The "2000KCAL per day" guidance line (capital KCAL) is not a dish and is skipped.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
KCAL = re.compile(r"^(\d+)kcal$")
PRICE = re.compile(r"^(£\d+(\.\d\d)?|\d+p|From)$")
COLUMN_SPLIT = 210.0  # points: the page is 419.5 wide, the two columns meet near the middle


def _words(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    xml = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    pages = []
    for chunk in re.split(r"<page ", xml)[1:]:
        # the dagger mark (plant-based butter footnote) is a raised glyph on its own baseline: it would split a wrapped name
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(e)) for a, b, c, d, e in WORD.findall(chunk)
                      if html.unescape(e) != "†"])
    return pages


def _is_caps(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)


def _lines(words: list[tuple], column: int) -> list[list[tuple]]:
    """The words of one column grouped into text lines (same baseline), each line sorted left to right."""
    cw = sorted((w for w in words if (w[0] < COLUMN_SPLIT) == (column == 0)), key=lambda w: (w[3], w[0]))
    lines: list[list[tuple]] = []
    for w in cw:
        if lines and abs(lines[-1][0][3] - w[3]) < 2.2:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(line) for line in lines]


def read_kcal(pdf: Path) -> list[dict]:
    out = []
    for pno, words in enumerate(_words(pdf), 1):
        for column in (0, 1):
            lines = _lines(words, column)
            for i, line in enumerate(lines):
                kcal = [w for w in line if KCAL.match(w[4])]
                if not kcal:
                    continue
                if len(kcal) != 1:
                    raise SystemExit(f"page {pno}: two kcal figures on one line {[w[4] for w in line]}: the layout changed")
                k = kcal[0]
                left = [w for w in line if w[0] < k[0] and not PRICE.match(w[4])]
                text = " ".join(w[4] for w in left)
                parts = [text]
                if _is_caps(text):
                    # walk up while the line above is a capitals line in the same left margin with no kcal figure (a wrapped name)
                    margin = line[0][0]
                    j = i - 1
                    while j >= 0:
                        above = lines[j]
                        gap = line[0][3] - above[0][3] if j == i - 1 else lines[j + 1][0][3] - above[0][3]
                        if gap > 13.0 or any(KCAL.match(w[4]) for w in above) or abs(above[0][0] - margin) > 4.0:
                            break
                        left_above = [w for w in above if not PRICE.match(w[4])]
                        t = " ".join(w[4] for w in left_above)
                        if not t or not _is_caps(t):
                            break
                        parts.insert(0, t)
                        j -= 1
                out.append(dict(page=pno, column=column, label=" ".join(parts), kcal=KCAL.match(k[4]).group(1)))
    return out
