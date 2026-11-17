"""Read Notcutts' five official menu PDFs into plain text and calorie figures.

Used by tools/uk_extract/notcutts.py. Needs `pdftotext` (poppler); standard library only (Python 3.9). Nothing is converted,
rounded or estimated here: a figure is returned as the string printed ("74", "106/152").

Every file has a text layer. Breakfast (1 page) and Lunch (3 pages) are one column; Children's, Drinks and the Festive Feast
are two columns, so each of those is read one column at a time (cut at x = 298 pt, in the gutter of all three layouts) and the
left column is followed by the right one. A calorie figure is "<number or number/number> kcal" (also "kcals", "(270 KCAL)"),
and is returned together with all the text printed before it, so the caller can bind it to the dish name it follows.

Dietary marks (AW26 menus, October 2026): the Breakfast, Lunch, Children's and Drinks menus print a dish's marks as small round
icons drawn in the page (no text), one fill colour per mark. `marks()` reads them with `pdftocairo -svg` (the icon shapes and
their colours) and `pdftotext -bbox` (the words around them). Each page's own key ("<icon> = Vegetarian <icon> = Vegan ...") says
which colour is which mark, so no colour is assumed here; an icon whose colour is not in its page's key is a decoration and is
ignored. The Festive Feast prints its marks as glyphs of an icon font that read as the digits 0-4; `glyph_key()` reads which digit
stands for which mark from its key. Needs `pdftocairo` and `pdfinfo` (poppler) as well.
"""
from __future__ import annotations
import html
import os
import re
import subprocess
import tempfile
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


# ---- dietary marks ------------------------------------------------------------------------------------------------------------
KEY_LABELS = {"Vegetarian": "V", "Vegan": "Ve", "No ingredients containing gluten": "GF",
              "Vegetarian option available": "V-opt", "Vegan option available": "Ve-opt"}
FIGURE_AFTER = re.compile(r"^\(?\s*(from\s+)?(\d+(?:/\d+)?)\s*kcals?\b", re.I)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
FILL_PATH = re.compile(r'<path[^>]*?fill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)"[^>]*?>')


def page_count(pdf: Path) -> int:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", out, re.M).group(1))


def page_words(pdf: Path, page: int) -> list:
    """(xMin, yMin, xMax, yMax, text) of every word on the page, top-left origin, in points."""
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         capture_output=True, text=True, check=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]


def page_circles(pdf: Path, page: int) -> list:
    """Filled, round, icon-sized shapes (7-12 pt across) drawn on the page: (rgb, cx, cy). The marks are drawn as a ring and a
    disc of the same colour, so shapes of one colour whose centres are within 2 pt are one icon."""
    with tempfile.TemporaryDirectory() as d:
        svg = os.path.join(d, "page.svg")
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), svg], check=True)
        text = Path(svg).read_text(encoding="utf-8")
    body = text[text.find("</defs>"):]
    found = []
    for m in FILL_PATH.finditer(body):
        tag = m.group(0)
        rgb = tuple(round(float(x), 1) for x in m.group(1, 2, 3))
        if rgb == (100.0, 100.0, 100.0):
            continue
        d = re.search(r'\sd="([^"]*)"', tag)
        nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", d.group(1))] if d else []
        if len(nums) < 4:
            continue
        xs, ys = nums[0::2], nums[1::2]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        if not (7 <= w <= 12 and abs(w - h) < 0.6):
            continue
        if "transform" in tag:
            raise SystemExit(f"{pdf.name} page {page}: an icon-sized shape is drawn with a transform: the layout changed, read it again")
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        if not any(r == rgb and abs(cx - x) < 2 and abs(cy - y) < 2 for r, x, y in found):
            found.append((rgb, cx, cy))
    return found


def _line(words: list, y: float, x_from: float, x_to: float) -> list:
    return sorted(w for w in words if w[1] - 2 <= y <= w[3] + 2 and x_from <= w[0] < x_to)


def marks(pdf: Path, gutter: float | None = None) -> list:
    """Every mark icon on every page: dict(page, mark, before, pre, value, after). `before` = the words printed left of the icon on its
    line (in its own column when `gutter` splits the page in two), `value` = the calorie figure printed right after it ("1148",
    "67/45"; "" when the icon is not followed by a figure), `pre` = "from" when the figure is printed "from N kcal". The key icons
    themselves are not returned. Stops if a page's key does not name all five marks once, or two marks share a colour."""
    result = []
    for page in range(1, page_count(pdf) + 1):
        words = page_words(pdf, page)
        circles = page_circles(pdf, page)
        colour_of: dict = {}
        key_icons = set()
        for rgb, cx, cy in circles:
            row = _line(words, cy, cx, 10_000)
            if not row or row[0][4] != "=" or row[0][0] - cx > 12:
                continue
            label = []
            for w in row[1:]:
                if w[4] == "=" or any(abs(w[0] - x) < 1 for _, x, y in circles if abs(y - cy) < 2 and x > cx):
                    break
                nxt = [x for _, x, y in circles if abs(y - cy) < 2 and cx < x < w[0]]
                if nxt:
                    break
                label.append(w[4])
            name = " ".join(label)
            if name not in KEY_LABELS:
                raise SystemExit(f"{pdf.name} page {page}: key icon followed by {name!r}, not one of {list(KEY_LABELS)}")
            if rgb in colour_of and colour_of[rgb] != KEY_LABELS[name]:
                raise SystemExit(f"{pdf.name} page {page}: one colour {rgb} stands for two marks in the key")
            colour_of[rgb] = KEY_LABELS[name]
            key_icons.add((rgb, cx, cy))
        if sorted(colour_of.values()) != sorted(KEY_LABELS.values()):
            raise SystemExit(f"{pdf.name} page {page}: the key names {sorted(colour_of.values())}, expected all five marks once")
        for rgb, cx, cy in circles:
            if (rgb, cx, cy) in key_icons or rgb not in colour_of:
                continue
            lo, hi = (0, 10_000) if gutter is None else ((0, gutter) if cx < gutter else (gutter, 10_000))
            row = _line(words, cy, lo, hi)
            before = " ".join(w[4] for w in row if w[2] <= cx)
            after = " ".join(w[4] for w in row if w[0] >= cx)
            m = FIGURE_AFTER.match(after)
            result.append(dict(page=page, mark=colour_of[rgb], before=before, pre="from" if m and m.group(1) else "",
                               value=m.group(2) if m else "", after=after))
    return result


def glyph_key(pdf: Path) -> dict:
    """For a menu whose marks are icon-font glyphs read as digits: {digit: mark}, read from the key, where each glyph is followed on
    its line by '= <label>'. The glyphs sit a little higher than the words, so a word belongs to a glyph's line when its centre is
    within 6 pt of the glyph's centre."""
    words = page_words(pdf, 1)
    key = {}
    for g in words:
        if not re.fullmatch(r"\d", g[4]):
            continue
        gy = (g[1] + g[3]) / 2
        row = sorted(w for w in words if abs((w[1] + w[3]) / 2 - gy) < 6 and w[0] >= g[2] - 1 and w is not g)
        if not row or row[0][4] != "=" or row[0][0] - g[2] > 3:
            continue
        label = []
        for w in row[1:]:
            if w[4] == "=" or re.fullmatch(r"\d", w[4]):
                break
            label.append(w[4])
        name = " ".join(label)
        if name in KEY_LABELS:
            if g[4] in key and key[g[4]] != KEY_LABELS[name]:
                raise SystemExit(f"{pdf.name}: glyph {g[4]} stands for two marks in the key")
            key[g[4]] = KEY_LABELS[name]
    if sorted(key.values()) != sorted(KEY_LABELS.values()):
        raise SystemExit(f"{pdf.name}: the glyph key reads {key}, expected all five marks once")
    return key
