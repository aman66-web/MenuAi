"""Read Caffe Nero UK's official "Allergen, Nutritional & Ingredient Guide (GB)" PDF into rows of printed numbers.

Used by tools/uk_extract/caffe_nero.py only to CROSS-CHECK the website numbers (`--guide`); nothing from the PDF is
written to data/source. Requires `pdftotext` (poppler). Numbers come back exactly as printed (strings such as "0.0").

Food pages (5-21): one block per product, nine labelled rows (KJ, Kcal, Fat, Sat, Carbs, Sugar, Fibre, Protein, Salt),
each with a per-100g and a per-portion value, then "Portion weight (g)". Drink pages (22-44): one row per drink (and per
size) with 18 numbers: the nine values per 100 ml, then the same nine per product.

`read_allergens()` reads the same guide's allergen information, also only to CROSS-CHECK the website's allergens (see
caffe_nero.py): the counter-food tables on pages 2-4 ("This Product Contains", an * under each of 14 allergen columns) and
the ALLERGENS column of every drink table (pages 22-44, one cell per drink and milk, printed once beside that drink's size
rows, e.g. "MILK, SOYA"; "NONE" or blank = none). Words are placed by their position on the page (pdftotext -bbox).
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
LABELS = ("KJ", "Kcal", "Fat", "Sat", "Carbs", "Sugar", "Fibre", "Protein", "Salt")
_LABEL_ROW = re.compile(r"\b(KJ|Kcal|Fat|Sat|Carbs|Sugar|Fibre|Protein|Salt)\s+(" + NUM + r"|-|Tr)\s+(" + NUM + r"|-|Tr)\s*$")
_WEIGHT_ROW = re.compile(r"Portion\s+weight\s+\(g\)\s+(" + NUM + r")\s*$")
_DRINK_ROW = re.compile(r"((?:" + NUM + r"\s+){17}" + NUM + r")\s*$")
FOOD_PAGES = range(5, 22)
DRINK_PAGES = range(22, 45)


def _page(pdf: Path, page: int) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         capture_output=True, text=True, check=True).stdout
    return out.split("\n")


def read_guide(pdf: Path) -> list[dict]:
    """Every nutrition block/row as {"page", "kind", "portion": {label: printed value}}; "portion" = per product."""
    rows: list[dict] = []
    for page in FOOD_PAGES:
        cur = None
        for line in _page(pdf, page):
            m = _LABEL_ROW.search(line)
            if m:
                if m.group(1) == "KJ":
                    cur = {"page": page, "kind": "food", "portion": {}}
                    rows.append(cur)
                if cur is not None and m.group(1) not in cur["portion"]:
                    cur["portion"][m.group(1)] = m.group(3)
                continue
            if _WEIGHT_ROW.search(line):
                cur = None
    for page in DRINK_PAGES:
        for line in _page(pdf, page):
            m = _DRINK_ROW.search(line)
            if m:
                nums = m.group(1).split()
                rows.append({"page": page, "kind": "drink", "portion": dict(zip(LABELS, nums[9:]))})
    return rows


# ---------------------------------------------------------------- allergens (cross-check only)
_WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
_PAGE = re.compile(r"<page [^>]*>(.*?)</page>", re.S)
# Matrix column headers as printed (first word of two-line headers such as "Sulphur / Dioxide", "Sesame / seeds").
MATRIX_COLUMNS = {"Gluten": "gluten", "Eggs": "eggs", "Milk": "milk", "Nuts": "nuts", "Peanuts": "peanuts", "Fish": "fish",
                  "Soya": "soya", "Celery": "celery", "Sulphur": "sulphites", "Mustard": "mustard", "Lupin": "lupin",
                  "Crustaceans": "crustaceans", "Sesame": "sesame", "Molluscs": "molluscs"}
_DIET = {"Vegan", "Vegetarian"}
_SIZE = re.compile(r"^(?:<?\d+(?:\.\d+)?|Regular|Grande|Single|Double)$")


def _words(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    return [[(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in _WORD.findall(p)]
            for p in _PAGE.findall(out)]


def _yc(w) -> float:
    return (w[1] + w[3]) / 2


def issued(pdf: Path) -> str:
    """The guide's own date line, e.g. 'Issued: 09/09/26'."""
    first = subprocess.run(["pdftotext", "-layout", "-f", "1", "-l", "1", str(pdf), "-"], capture_output=True, text=True,
                           check=True).stdout
    m = re.search(r"Issued:\s*(\d\d/\d\d/\d\d)", first)
    if not m:
        raise SystemExit("The guide's first page has no 'Issued: dd/mm/yy' line: the layout changed, re-check.")
    return m.group(1)


def _matrix(page: list) -> list[tuple[str, list[str]]]:
    """Counter-food tables: (product name as printed, [column headers with an *])."""
    rows = []
    heads = sorted((w for w in page if w[4] == "Name" and any(v[4] == "Product" and abs(v[1] - w[1]) < 2 and v[2] < w[0]
                                                                for v in page)), key=lambda w: w[1])
    for i, h in enumerate(heads):
        top, bottom = h[3], (heads[i + 1][1] if i + 1 < len(heads) else 1e9)
        cols = {}
        for label in MATRIX_COLUMNS:
            c = [w for w in page if w[4] == label and h[1] - 12 < w[1] < h[1] + 30 and w[0] > h[2]]
            if len(c) != 1:
                raise SystemExit(f"guide matrix: column {label!r} not found once near y={h[1]:.0f}; the layout changed.")
            cols[label] = (c[0][0] + c[0][2]) / 2
        left = min(cols.values()) - 25
        start = max(v[0] for v in page if v[4] == "Product" and abs(v[1] - h[1]) < 2 and v[2] < h[0])
        stars = [w for w in page if w[4] == "*" and top < _yc(w) < bottom]
        names = [w for w in page if w[2] < left and w[0] >= start - 5 and top + 2 < w[1] < bottom - 2]
        lines: list[list] = []
        for w in sorted(names, key=_yc):
            if lines and abs(_yc(lines[-1][0]) - _yc(w)) < 3:
                lines[-1].append(w)
            else:
                lines.append([w])
        texts = [(_yc(ln[0]), " ".join(x[4] for x in sorted(ln, key=lambda x: x[0]))) for ln in lines]
        texts = [(y, t) for y, t in texts if not (t.isupper() or "This Product Contains" in t)]
        star_rows: list[list] = []
        for w in sorted(stars, key=_yc):
            if star_rows and abs(_yc(star_rows[-1][0]) - _yc(w)) < 3:
                star_rows[-1].append(w)
            else:
                star_rows.append([w])
        used = set()
        for sr in star_rows:
            y = _yc(sr[0])
            hit = [n for n, (ty, _) in enumerate(texts) if abs(ty - y) < 3]
            if not hit:   # a name printed on two lines, its stars between them
                hit = [n for n, (ty, _) in enumerate(texts) if abs(ty - y) < 12]
                if len(hit) != 2:
                    raise SystemExit(f"guide matrix: a row of * at y={y:.0f} has no product name; the layout changed.")
            marks = []
            for s in sr:
                label = min(cols, key=lambda c: abs(cols[c] - (s[0] + s[2]) / 2))
                if abs(cols[label] - (s[0] + s[2]) / 2) > 15:
                    raise SystemExit(f"guide matrix: an * at x={s[0]:.0f} is under no column; the layout changed.")
                marks.append(label)
            rows.append((" ".join(texts[n][1] for n in hit), marks))
            used.update(hit)
        rows += [(t, []) for n, (_, t) in enumerate(texts) if n not in used]
    return rows


def _drinks(page: list) -> list[tuple[str, str]]:
    """Drink tables: (product name as printed, ALLERGENS cell as printed)."""
    rows = []
    heads = sorted((w for w in page if w[4] == "ALLERGENS"), key=lambda w: w[1])
    for i, h in enumerate(heads):
        top, bottom = h[3], (heads[i + 1][1] if i + 1 < len(heads) else 1e9)
        diet_h = [w for w in page if w[4] == "DIETARY" and abs(w[1] - h[1]) < 3]
        prod_h = [w for w in page if w[4] == "PRODUCT" and abs(w[1] - h[1]) < 3]
        if len(prod_h) != 1 or len(diet_h) > 1:
            raise SystemExit(f"guide drinks table at y={h[1]:.0f}: no PRODUCT/DIETARY header; the layout changed.")
        if not diet_h:
            continue   # the sample table on the drinks intro page (no DIETARY column); every drink is printed again later
        dx = diet_h[0][0]
        body = [w for w in page if top < w[1] < bottom]
        diets = sorted((w for w in body if w[4] in _DIET and dx - 15 < w[0] < dx + 40), key=_yc)
        for n, d in enumerate(diets):
            def nearest(w):
                return min(range(len(diets)), key=lambda j: abs(_yc(diets[j]) - _yc(w)))
            name = [w for w in body if abs(_yc(w) - _yc(d)) <= 16 and nearest(w) == n
                    and not _SIZE.match(w[4]) and not w[4].isupper() and w[2] < dx]   # capitals = titles, allergens
            cell = [w for w in body if h[0] - 25 < w[0] and w[2] < dx - 2 and abs(_yc(w) - _yc(d)) <= 4 and w[4].isupper()]
            lines: list[list] = []
            for w in sorted(name, key=_yc):
                if lines and abs(_yc(lines[-1][0]) - _yc(w)) < 3:
                    lines[-1].append(w)
                else:
                    lines.append([w])
            rows.append((" ".join(w[4] for ln in lines for w in sorted(ln, key=lambda w: w[0])),
                         " ".join(w[4] for w in sorted(cell, key=lambda w: w[0]))))
    return rows


def read_allergens(pdf: Path) -> list[tuple[str, set[str]]]:
    """Every allergen row of the guide as (product name as printed, set of allergen keys). Names are not unique (a drink
    can be printed in two tables, e.g. with and without whipped cream)."""
    from common import allergen_words
    out = []
    for n, page in enumerate(_words(pdf), start=1):
        if any(w[4] == "HOW" for w in page) and any(w[4] == "GUIDE" for w in page):
            continue   # page 1 explains how to read the tables with an example
        for name, marks in _matrix(page):
            out.append((name, {MATRIX_COLUMNS[m] for m in marks}))
        for name, cell in _drinks(page):
            words = [] if cell in ("", "NONE") else cell.split(",")
            out.append((name, allergen_words(words, f"guide p{n} {name}")[0]))
    return out
