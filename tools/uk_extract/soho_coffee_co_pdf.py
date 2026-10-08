"""Read SOHO Coffee's official "Ingredient & Nutrition Guide (DRINKS)" PDF into blocks of printed numbers.

Used by tools/uk_extract/soho_coffee_co.py. Requires `pdftotext` and `pdftocairo` (poppler). Numbers are returned exactly as printed
(strings such as "0.0", "10", "1976") so nothing is converted or estimated here.

How the tables are read
-----------------------
* Words and their positions come from `pdftotext -bbox`.
* Every table page has the same columns (Product | Vegetarian? | Vegan? | Ingredients | Size | kJ, kcal, fat, saturates,
  carbohydrates, sugars, fibre, protein, salt) but the table is a little wider or narrower from page to page, so the column
  positions are found from each page's own header words ("Vegetarian?", "Vegan?", "Size").
* The horizontal rules that separate products come from `pdftocairo -svg` (a product rule starts at the left of the Product
  column, x < 40 pt; a thinner rule between the size rows of ONE product starts at the Size column and is ignored). Everything
  between two product rules is one block: the product name, flags and ingredients are tied to their size rows by the page
  geometry, not by guessing from the text order.
* A block with size rows is one product (one row per printed size: Small / Regular / Large / N/A), each row holding exactly
  9 numbers. Anything else (a row with another number of numbers, an unknown size label, a numeric column that moves, a size
  row outside every block) stops the run with a message naming the page.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fiber", "protein", "salt")
SIZES = {"Small", "Regular", "Reg", "Large", "N/A"}   # "Reg" is how a few rows print Regular
NUM = re.compile(r"^<?(?:\d+[.,/]?\d*|[.,]\d+)$")  # kept as printed even when malformed (cells print "0,3", "0/5", "2."); the extractor holds those rows back
FOOTER_Y = 505.0       # the footer bar starts at about y = 507 pt


class GuideError(Exception):
    pass


def _yc(w):
    return (w[1] + w[3]) / 2


def _xc(w):
    return (w[0] + w[2]) / 2


def bbox_pages(pdf: Path) -> list[list[tuple]]:
    """Words per page as (x0, y0, x1, y1, text)."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "bbox.html"
        subprocess.run(["pdftotext", "-bbox", str(pdf), str(out)], check=True)
        text = out.read_text(encoding="utf-8")
    pages = []
    for pm in re.finditer(r'<page width="[\d.]+" height="[\d.]+">(.*?)</page>', text, re.S):
        words = []
        for w in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pm.group(1)):
            words.append((float(w[1]), float(w[2]), float(w[3]), float(w[4]), html.unescape(w[5])))
        pages.append(words)
    return pages


# Fill colours of the table's cells (percent of 255 as pdftocairo prints them): the Vegetarian? cell of every product is one
# rectangle spanning all of that product's size rows, so these rectangles ARE the product blocks (drawn on every page, whether
# or not the page also draws rules between products). The lilac band is a category heading ("Hot Coffee").
FILL_VEG = (85.099792, 94.898987, 81.59942)
FILL_VEGAN = (55.699158, 85.099792, 45.09887)
FILL_SIZE = (83.898926, 78.399658, 83.09936)
FILL_BAND = (72.499084, 63.09967, 71.398926)


def page_fills(pdf: Path, page: int) -> dict[str, list[tuple]]:
    """Filled rectangles of one page by role, as (x0, x1, y0, y1) in points from the top-left, sorted by y."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "p.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(out)], check=True)
        svg = out.read_text(encoding="utf-8")
    roles = {"veg": FILL_VEG, "vegan": FILL_VEGAN, "size": FILL_SIZE, "band": FILL_BAND}
    found: dict[str, list[tuple]] = {k: [] for k in roles}
    pat = re.compile(r'<path fill-rule="evenodd" fill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)"[^>]*? '
                     r'd="M ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) L ([\d.]+) ([\d.]+) Z')
    for m in pat.finditer(svg):
        col = tuple(float(g) for g in m.groups()[:3])
        pts = [float(g) for g in m.groups()[3:]]
        xs, ys = pts[0::2], pts[1::2]
        rect = (min(xs), max(xs), min(ys), max(ys))
        for role, want in roles.items():
            if all(abs(a - b) < 0.05 for a, b in zip(col, want)) and rect[2] > 100 and rect[3] < FOOTER_Y + 3:
                found[role].append(rect)
    return {k: sorted(v, key=lambda r: r[2]) for k, v in found.items()}


def _lines(words, tol=2.0):
    out: list[list[tuple]] = []
    for w in sorted(words, key=_yc):
        if out and abs(_yc(w) - _yc(out[-1][0])) <= tol:
            out[-1].append(w)
        else:
            out.append([w])
    return [sorted(l, key=lambda w: w[0]) for l in out]


def _text(words) -> str:
    return " ".join(" ".join(w[4] for w in l) for l in _lines(words))


def guide_version(pages) -> str:
    t = " ".join(w[4] for w in pages[0])
    m = re.search(r"V\s*e\s*r\s*s\s*i\s*o\s*n\s*(\d+)\s*:\s*(\d+)\s*(?:th|st|nd|rd)?\s*(.*)$", t)
    if not m:
        raise GuideError("no 'Version N: <date>' on the cover page")
    return re.sub(r"\s+", "", m.group(0))


def read_drinks(pdf: Path) -> tuple[list[dict], list[str]]:
    """One dict per product block: page, menu (page subtitle), section (the divider page before it), band (category heading),
    name, veg, vegan, ingredients and rows [{size, kj, kcal, fat, sat, carbs, sugars, fiber, protein, salt}] exactly as printed.
    Also returns the list of divider-page section names in order."""
    pages = bbox_pages(pdf)
    blocks: list[dict] = []
    dividers: list[str] = []
    section = ""
    for pno, words in enumerate(pages, 1):
        if pno <= 2:
            continue
        fills = page_fills(pdf, pno)
        if not fills["veg"]:
            if len(words) <= 6:
                section = _text(words)
                dividers.append(section)
                continue
            raise GuideError(f"page {pno}: no product cells (Vegetarian? column) and not a divider page")
        veg0, veg1 = fills["veg"][0][0], fills["veg"][0][1]
        vegan0, vegan1 = fills["vegan"][0][0], fills["vegan"][0][1]
        has_size = bool(fills["size"])
        energy_x = min([w[0] for w in words if w[4] == "Energy" and w[1] < 125] + [9999.0])
        if energy_x > 9000:
            raise GuideError(f"page {pno}: no 'Energy' column header")
        num_x0 = energy_x - 12          # everything right of this is the nine number columns
        size0, size1 = (fills["size"][0][0], fills["size"][0][1]) if has_size else (num_x0, num_x0)
        if any(abs(r[0] - veg0) > 1 or abs(r[1] - veg1) > 1 for r in fills["veg"]):
            raise GuideError(f"page {pno}: the Vegetarian? column is not one column")
        menu = _text([w for w in words if w[1] < 35 and 140 < w[0] < 540])
        top = fills["veg"][0][2]
        events = [("band", r) for r in fills["band"] if r[2] >= top - 40] + [("block", r) for r in fills["veg"]]
        events.sort(key=lambda e: e[1][2])
        band = ""
        covered = 0
        page_blocks = []
        n_size_words = len([w for w in words if has_size and size0 - 2 <= w[0] and w[2] <= size1 + 2 and top - 1 < _yc(w) < FOOTER_Y])
        for kind, (x0, x1, a, b) in events:
            inside = [w for w in words if a < _yc(w) < b]
            if kind == "band":
                band = _text([w for w in inside if w[0] < 130])
                continue
            lines = _lines([w for w in inside if w[0] >= (size0 - 2 if has_size else num_x0)], tol=3.0)
            rows = []
            for line in lines:
                label = [w for w in line if has_size and size0 - 2 <= w[0] and w[2] <= size1 + 2]
                nums = [w for w in line if w[0] >= num_x0]
                other = [w for w in line if w not in label and w not in nums]
                if has_size and len(label) != 1:
                    raise GuideError(f"page {pno}: a row at y={_yc(line[0]):.0f} has {len(label)} size labels")
                if other or len(nums) != len(FIELDS) or any(not NUM.match(n[4]) for n in nums):
                    raise GuideError(f"page {pno}: row at y={_yc(line[0]):.0f} is not exactly {len(FIELDS)} numbers: {[w[4] for w in line]}")
                size = label[0][4] if label else ""
                if has_size and size not in SIZES:
                    raise GuideError(f"page {pno}: unexpected size label {size!r}")
                rows.append({"size": "Regular" if size == "Reg" else size, **{f: n[4] for f, n in zip(FIELDS, nums)}, "_x": [_xc(n) for n in nums]})
            if not rows:
                raise GuideError(f"page {pno}: product cell {a:.0f}-{b:.0f} has no number row")
            covered += len(rows)
            name_words = [w for w in inside if w[2] <= veg0 + 3]
            veg_flags = [w for w in inside if veg0 <= _xc(w) <= veg1 and w[4] in ("Y", "N")]
            vegan_flags = [w for w in inside if vegan0 <= _xc(w) <= vegan1 and w[4] in ("Y", "N")]
            stray = [w for w in inside if veg0 - 1 <= w[0] <= vegan1 + 1 and w[4] not in ("Y", "N")]
            if len(veg_flags) > 1 or len(vegan_flags) > 1 or stray:
                raise GuideError(f"page {pno}: unexpected text in the flag columns of the block at {a:.0f}-{b:.0f}")
            ing = [w for w in inside if w[0] >= vegan1 + 2 and w[2] <= (size0 - 2 if has_size else num_x0)]
            bl = {"page": pno, "menu": menu, "section": section, "band": band, "name": _text(name_words),
                  "veg": veg_flags[0][4] if veg_flags else "", "vegan": vegan_flags[0][4] if vegan_flags else "",
                  "ingredients": _text(ing), "rows": rows}
            blocks.append(bl)
            page_blocks.append(bl)
        if has_size and covered != n_size_words:
            raise GuideError(f"page {pno}: {n_size_words - covered} size labels are not inside any product cell")
        # numeric columns must not move within a page
        cols = [[r["_x"][i] for bl in page_blocks for r in bl["rows"]] for i in range(len(FIELDS))]
        for i, c in enumerate(cols):
            if c and max(c) - min(c) > 8:
                raise GuideError(f"page {pno}: column {FIELDS[i]} drifts ({min(c):.0f}..{max(c):.0f}): a cell is probably blank")
    for bl in blocks:
        for r in bl["rows"]:
            r.pop("_x", None)
    return blocks, dividers
