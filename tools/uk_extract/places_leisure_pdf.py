"""Read Places Leisure's two official Cafeology PDF charts into table rows (names, calories, allergen marks).

Used by tools/uk_extract/places_leisure.py. Requires poppler (`pdftotext`, `pdftocairo`) and nothing else. Nothing is converted,
rounded or estimated here: calories come back as the printed text ("439", "83.8", "43 each", "300ml = 1").

Both PDFs are Microsoft Excel exports: one grid table per block of rows, a grey header row, then rows. The text layer carries the
names, supplier codes, calories, the tick marks ("✓" contains, "✓*" may contain) and the small labels printed under a tick
("Wheat", "May Contain Barley and Oats", "Contains Walnut", ">10ppm Metabisulphite"). The table GRID is read from the page drawing
(`pdftocairo -svg`: the borders are thin black rectangles), so every word is put in the row and column cell it sits in. Nothing is
matched by name or position guess: a word outside every cell, a header that is not the expected one, a row without calories, a row
with two calorie values or a label this reader does not know stops the run with the page number.

Columns of a table, left to right: name; (food chart and the Vitali page: "Supplier and Codes"); "Calories Kcal"; then the 14
allergen columns: Celery, Cereals Containing Gluten, Crustacean(s), Eggs, Fish, Lupin, Milk, Mollusc, Mustard, Nuts, Peanuts,
Sesame Seeds, Soya, Sulphur Dioxide.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

WORD = re.compile(r'<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">(.*?)</word>')
RECT = re.compile(r'<path fill-rule="evenodd" fill="rgb\(([^)]*)\)"[^>]*? d="M ([-\d.]+) ([-\d.]+) L ([-\d.]+) ([-\d.]+) '
                  r'L ([-\d.]+) ([-\d.]+) L ([-\d.]+) ([-\d.]+) Z')
ALLERGEN_KEYS = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts",
                 "sesame", "soya", "sulphites"]
# Header text (lower-case, words joined by a space) of each allergen column, in order.
HEADERS = [("celery", ["celery"]), ("gluten", ["cereals containing gluten"]), ("crustaceans", ["crustacean", "crustaceans"]),
           ("eggs", ["eggs"]), ("fish", ["fish"]), ("lupin", ["lupin"]), ("milk", ["milk"]), ("molluscs", ["mollusc", "molluscs"]),
           ("mustard", ["mustard"]), ("nuts", ["nuts"]), ("peanuts", ["peanuts"]), ("sesame", ["sesame seeds"]), ("soya", ["soya"]),
           ("sulphites", ["sulphur dioxide"])]
# Words printed under a tick that are annotations of the column itself (not a named allergen).
SULPHITE_NOTES = {">10ppm", "metabisulphite", "sulphites", "sulphite", "sulphur", "dioxide", "and"}


def _words(pdf: Path, page: int) -> list[tuple[float, float, float, float, str]]:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], check=True, capture_output=True,
                         text=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]


def _lines(pdf: Path, page: int) -> tuple[list[tuple[float, float, float]], list[tuple[float, float, float]]]:
    """Thin black rectangles of the page drawing: (vertical lines as (x, y0, y1), horizontal lines as (y, x0, x1))."""
    with tempfile.TemporaryDirectory() as tmp:
        svg = Path(tmp) / "p.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(svg)], check=True, capture_output=True)
        text = svg.read_text(encoding="utf-8")
    vert, horiz = [], []
    for m in RECT.finditer(text):
        if m.group(1).replace(" ", "") != "0%,0%,0%":
            continue
        nums = [float(x) for x in m.groups()[1:]]
        xs, ys = nums[0::2], nums[1::2]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        if x1 - x0 < 2.5 and y1 - y0 > 20:
            vert.append(((x0 + x1) / 2, y0, y1))
        elif y1 - y0 < 2.5 and x1 - x0 > 30:
            horiz.append(((y0 + y1) / 2, x0, x1))
    return vert, horiz


def _group_lines(vert: list[tuple[float, float, float]]) -> list[list[tuple[float, float, float]]]:
    """Vertical lines of one table share the same bottom edge (their tops differ by about a point)."""
    groups: list[list[tuple[float, float, float]]] = []
    for v in sorted(vert, key=lambda t: (round(t[2]), t[0])):
        for g in groups:
            if abs(g[0][2] - v[2]) < 1.5:
                g.append(v)
                break
        else:
            groups.append([v])
    return [sorted(g) for g in groups if len(g) >= 15]


def _row_edges(horiz: list[tuple[float, float, float]], x0: float, x1: float, y0: float, y1: float) -> list[float]:
    """y of every horizontal border that runs across (most of) the table, from the table's top to its bottom."""
    ys: dict[float, float] = {}
    for y, a, b in horiz:
        if y0 - 1.5 <= y <= y1 + 1.5:
            key = next((k for k in ys if abs(k - y) < 1.5), y)
            ys[key] = ys.get(key, 0.0) + max(0.0, min(b, x1) - max(a, x0))
    edges = sorted(k for k, cover in ys.items() if cover >= 0.7 * (x1 - x0))
    return edges


def _text(words: list[tuple[float, float, float, float, str]]) -> str:
    """Words of one cell as text: top to bottom, left to right within a line."""
    lines: list[list[tuple[float, float, float, float, str]]] = []
    for w in sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        cy = (w[1] + w[3]) / 2
        if lines and abs((lines[-1][0][1] + lines[-1][0][3]) / 2 - cy) < 4:
            lines[-1].append(w)
        else:
            lines.append([w])
    return "\n".join(" ".join(x[4] for x in sorted(line, key=lambda w: w[0])) for line in lines)


def read_page(pdf: Path, page: int) -> dict:
    """{'title': footer/heading text of the page, 'tables': [{'columns': [...], 'rows': [...]}, ...]}. A table's rows are dicts:
    heading (True when the row has no calories and no marks: a section title), name (cell text), supplier, kcal (cell text),
    marks {allergen key: cell text of its tick words}, labels {allergen key: text of the other words in its cell}."""
    words = _words(pdf, page)
    vert, horiz = _lines(pdf, page)
    tables = []
    used: set[int] = set()
    for g in _group_lines(vert):
        xs = [v[0] for v in g]
        top, bottom = min(v[1] for v in g), max(v[2] for v in g)
        edges = _row_edges(horiz, xs[0], xs[-1], top, bottom)
        if len(edges) < 3:
            raise SystemExit(f"page {page}: table without row borders")
        ncol = len(xs) - 1
        if ncol not in (16, 17):
            raise SystemExit(f"page {page}: a table with {ncol} columns, expected 16 or 17 (name, [supplier], kcal, 14 allergens)")
        has_supplier = ncol == 17
        cells: dict[tuple[int, int], list] = {}
        for i, w in enumerate(words):
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            if not (xs[0] < cx < xs[-1] and edges[0] < cy < edges[-1]):
                continue
            col = max(c for c in range(ncol) if xs[c] <= cx)
            row = max(r for r in range(len(edges) - 1) if edges[r] <= cy)
            cells.setdefault((row, col), []).append(w)
            used.add(i)
        # header row: the first band
        header = {c: " ".join(" ".join(_text(cells.get((0, c), [])).split()).lower().split()) for c in range(ncol)}
        first = 2 if has_supplier else 1
        got = [header[first + 1 + i] for i in range(14)]
        if got[2] in ("crustaceanseggs", "crustaceaneggs") and got[3] == "":
            # the two headers touch and the text layer joins them into one word "CrustaceansEggs": it sits in the first cell
            got[2], got[3] = "crustaceans", "eggs"
        for (key, options), text in zip(HEADERS, got):
            if text not in options:
                raise SystemExit(f"page {page}: column header {text!r} where {options} was expected (the layout changed)")
        if not header[first].startswith("calories"):
            raise SystemExit(f"page {page}: calories column header is {header[first]!r}")
        rows = []
        for r in range(1, len(edges) - 1):
            name_lines = [" ".join(x.split()) for x in _text(cells.get((r, 0), [])).split("\n") if x.strip()]
            name = " ".join(name_lines)
            supplier = " ".join(_text(cells.get((r, 1), [])).split("\n")) if has_supplier else ""
            kcal = _text(cells.get((r, first), []))
            marks, labels = {}, {}
            for i, key in enumerate(ALLERGEN_KEYS):
                ws = cells.get((r, first + 1 + i), [])
                ticks = sorted(w[4] for w in ws if w[4].startswith("✓"))
                other = [w for w in ws if not w[4].startswith("✓")]
                if ticks:
                    marks[key] = " ".join(ticks)
                if other:
                    labels[key] = " ".join(_text(other).split())
            rows.append(dict(page=page, row=r, name=" ".join(name.split()), name_lines=name_lines, supplier=" ".join(supplier.split()),
                             kcal=kcal.strip(), marks=marks, labels=labels, has_supplier=has_supplier,
                             heading=(not kcal.strip() and not marks and not labels), y=edges[r]))
        tables.append(dict(top=top, bottom=bottom, rows=rows, edges=edges, xs=xs, title=" ".join(header[0].split())))
    tables.sort(key=lambda t: t["top"])
    # words that are in no table: page furniture (titles, notices). Returned so the caller can look at the title and venue lines.
    outside = [w for i, w in enumerate(words) if i not in used]
    return dict(tables=tables, outside=_text(outside))


def read_pdf(pdf: Path, pages: range) -> dict[int, dict]:
    return {p: read_page(pdf, p) for p in pages}
