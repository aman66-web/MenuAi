"""Read Boston Tea Party's official menu PDFs (calories printed beside each dish) into calorie occurrences.

Used by tools/uk_extract/boston_tea_party.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such
as "847"); nothing is converted, rounded or estimated here.

The menus are two A3-ish landscape pages of four columns (the kids' menu is one page of three panels), all with a real text layer:

    The Full Monty                              17.25            <- name, price at the right
    Boston's biggest ever breakfast. A whole mature
    ...
    slow-roasted tomato, smoky tomato jam 1634 kcal              <- calories end the description

so reading is by position, never by counting:

  1. every line of the text layer is found with its box (pdftotext -bbox-layout);
  2. a line belongs to the column (panel) whose x-range holds its left edge (COLUMNS, measured from these PDFs); the footer
     (allergy notice, legend, file code) is dropped, and so are lines that are only a price ("12.95", "+2.85", "8.00 / 30.00");
  3. the lines of a column are read top to bottom (left to right on the same row) into one text stream;
  4. every "NNN kcal" in that stream is an occurrence; its `chunk` is the text since the previous occurrence ended (so it holds the
     dish's name and description, or the option's own label), and `marks` are the dietary marks the menu prints straight before the
     number ("VE 899 kcal") or straight after "kcal" ("... kcal V NGO", "... kcal 10.95 V").

boston_tea_party.py then ties every occurrence to a named item and stops if anything differs.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
PRICE_ONLY = re.compile(r"^(?:\+?\d+\.\d\d)(?: / \d+\.\d\d)?$")
KCAL = re.compile(r"(\d+) kcal")
MARK = re.compile(r"(VE|V|NGO|N)\b")
PRICE = re.compile(r"\d+\.\d\d")

# Left edges (points) that split a page into columns; a line goes to the column whose range holds its x0. Measured from the
# 1a/2a/3a menus (page width 1000.6: the four columns start at about 34/271/506/743 on page 1 and 36/273/509/767 on page 2; the
# prices sit at the right end of their own column) and from the kids' menu (page width 841.9: left panel 57-280, middle 336-560,
# right 617-782).
MAIN_BOUNDS = [262.0, 500.0, 736.0]
KIDS_BOUNDS = [300.0, 580.0]
FOOTER_Y = 660.0       # main menus: the allergy notice and legend sit below this
KIDS_FOOTER_Y = 540.0  # kids' menu: the allergy notice sits below this


def _norm(text: str) -> str:
    return " ".join(text.replace("​", " ").replace("\xa0", " ").split())


def _pages(pdf: Path) -> list[list[dict]]:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for page in re.split(r"<page ", out)[1:]:
        lines = []
        for m in LINE.finditer(page):
            x0, y0, x1, y1, body = m.groups()
            words = [html.unescape(w) for w in WORD.findall(body)]
            lines.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), text=_norm(" ".join(words))))
        pages.append(lines)
    return pages


def _marks_before(text: str) -> list[str]:
    toks = text.split()
    found = []
    while toks and MARK.fullmatch(toks[-1]):
        found.append(toks.pop())
    return found[::-1]


def _marks_after(text: str) -> list[str]:
    toks = text.replace(",", " , ").split()
    found = []
    i = 0
    while i < len(toks):
        t = toks[i]
        if t == "," or PRICE.fullmatch(t):
            i += 1
            continue
        bare = t.rstrip(")")  # "(pork 152 kcal or vegan 140 kcal VE)" ends the bracket right after the mark
        if MARK.fullmatch(bare):
            found.append(bare)
            i += 1
            if bare != t:
                break
            continue
        break
    return found


def read_streams(pdf: Path, kind: str) -> dict[tuple[int, int], str]:
    """-> {(page number from 1, column number from 0): text stream}. kind is "main" (4 columns) or "kids" (3 panels)."""
    bounds, footer = (MAIN_BOUNDS, FOOTER_Y) if kind == "main" else (KIDS_BOUNDS, KIDS_FOOTER_Y)
    streams: dict[tuple[int, int], list[dict]] = {}
    for pno, lines in enumerate(_pages(pdf), start=1):
        for ln in lines:
            if ln["y0"] >= footer or not ln["text"] or PRICE_ONLY.match(ln["text"]):
                continue
            col = sum(1 for b in bounds if ln["x0"] >= b)
            streams.setdefault((pno, col), []).append(ln)
    return {k: _norm(" ".join(ln["text"] for ln in sorted(v, key=lambda ln: (round(ln["y0"]), ln["x0"])))) for k, v in sorted(streams.items())}


def occurrences(stream: str) -> list[dict]:
    """Every "NNN kcal" of one column's stream: value (as printed), chunk (text since the previous occurrence), marks."""
    occ = []
    prev = 0
    for m in KCAL.finditer(stream):
        chunk = stream[prev:m.end()]
        before = _marks_before(stream[prev:m.start()].rstrip())
        after = _marks_after(stream[m.end():m.end() + 40])
        occ.append(dict(value=m.group(1), chunk=chunk, marks=before + after, end=m.end()))
        prev = m.end()
    return occ


def column_texts(pdf: Path, kind: str) -> dict[tuple[int, int], str]:
    return read_streams(pdf, kind)
