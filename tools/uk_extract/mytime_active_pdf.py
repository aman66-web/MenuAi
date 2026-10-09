"""Read Mytime Active's three "Eatwell" menu PDFs into dishes with their printed calories.

Used by tools/uk_extract/mytime_active.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as
"585"); nothing is converted, rounded or estimated here.

Each menu is an InDesign layout with a real text layer, in columns. A dish prints "£5.95 | 571kcal" (High Elms: "£5.50 | 532 kcal") at the
right of its name line or, when the name wraps or has a description, on a later line or in a column of prices beside the names. Reading is by
position, never by counting:

  1. every line and word of the text layer is found with its box (pdftotext -bbox-layout);
  2. every "£price | NNNkcal" group is a calorie tuple, placed at its "£" word;
  3. tuples are put in reading order (column by column, then top to bottom, left to right in a row), and the caller's list of dishes
     (also in reading order) is zipped with them: the Nth dish owns the Nth tuple;
  4. for every dish its printed name (the `anchor`: the start of the name's first line) must be a line of the same column, above the tuple or
     on its row, at most MAX_GAP points higher: if not, or if the counts differ, the run stops.

Page 1 of the Golf and Pavilion menus is a cover (golf days, parties) and must carry no tuple.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PRICE = re.compile(r"^£(\d+\.\d\d)$")
KCAL_ONE = re.compile(r"^(\d+)kcal$")
KCAL_TWO = re.compile(r"^(\d+)$")
MAX_GAP = 60.0  # points between a dish's name line and the line with its calories (a wrapped description in between)


def norm(text: str) -> str:
    return " ".join(text.replace("​", "").replace("\t", " ").split())


def read_pages(pdf: Path) -> list:
    """[{lines: [{x0, y0, text}], tuples: [{x, y, price, kcal}]}] one dict per page."""
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        lines, tuples = [], []
        for m in LINE.finditer(chunk):
            x0, y0, _x1, _y1, body = m.groups()
            words = []
            for a, _b, c, _d, w in WORD.findall(body):
                # the text layer glues tab-separated cells into one word ("cheese\t\t£4.95"): split it and place each piece by its characters
                w, xa, xc = html.unescape(w), float(a), float(c)
                step = (xc - xa) / max(len(w), 1)
                for piece in re.finditer(r"\S+", w):
                    words.append((xa + piece.start() * step, piece.group(0)))
            lines.append(dict(x0=float(x0), y0=float(y0), text=norm(" ".join(w for _, w in words))))
            for i, (wx, w) in enumerate(words):
                pm = PRICE.match(w)
                if not pm or i + 2 >= len(words) or words[i + 1][1] != "|":
                    continue
                third = words[i + 2][1]
                km = KCAL_ONE.match(third)
                if not km and KCAL_TWO.match(third) and i + 3 < len(words) and words[i + 3][1] == "kcal":
                    km = KCAL_TWO.match(third)
                if km:
                    tuples.append(dict(x=wx, y=float(y0), price=pm.group(1), kcal=km.group(1)))
        pages.append(dict(lines=lines, tuples=tuples))
    return pages


def page_text(page: dict) -> str:
    return norm(" ".join(ln["text"] for ln in page["lines"]))


def dishes(pages: list, page_no: int, bounds: list, entries: list) -> list:
    """Attach calories to `entries` (dicts with an `anchor`), given in reading order, from page `page_no` (1-based). `bounds` are the x
    positions where a new column starts (a name's x and its price's x fall in the same column)."""
    page = pages[page_no - 1]
    col = lambda x: sum(1 for b in bounds if x >= b)  # noqa: E731
    ordered = sorted(page["tuples"], key=lambda t: (col(t["x"]), round(t["y"]), t["x"]))
    if len(ordered) != len(entries):
        raise SystemExit(f"page {page_no}: {len(ordered)} calorie values printed but {len(entries)} dishes listed: the menu changed, re-check the table")
    result = []
    for e, t in zip(entries, ordered):
        anchor = norm(e["anchor"])
        cands = [ln for ln in page["lines"] if col(ln["x0"]) == col(t["x"]) and ln["x0"] < t["x"] - 10
                 and ln["text"].startswith(anchor) and ln["y0"] <= t["y"] + 3]
        if not cands:
            raise SystemExit(f"page {page_no}: no line starting {anchor!r} above/at the row of its calorie value {t['price']} | {t['kcal']}: "
                             "the menu changed, re-check the table")
        ln = max(cands, key=lambda c: c["y0"])
        if t["y"] - ln["y0"] > MAX_GAP:
            raise SystemExit(f"page {page_no}: {anchor!r} is {t['y'] - ln['y0']:.0f} pt above its calorie value: check the layout")
        result.append(dict(e, price=t["price"], kcal=t["kcal"], line=ln["text"], y=ln["y0"]))
    return result
