"""Read Yalla Yalla's official "Allergen & Calorie Menu" PDF into rows: name, calories, comment, allergen marks.

Used by tools/uk_extract/yalla_yalla.py. Yalla Yalla's guide has the same table layout as its sister brand's (comptoir_libanais_pdf.py, of which this
is an adapted copy: only the banner colour differs). Requires poppler (`pdftotext`, `pdftocairo`) and nothing else. Nothing is
converted, rounded or estimated here: calories are returned as the printed text ("29", "793pp", "xxx", "").

The guide (8 A4 pages, Spring 2026, Version 04) is a set of grid tables, one dish per row. Page 1 is the cover with the
legend text; pages 2-8 hold the tables, each under a gold banner naming the section (NIBBLES, MEZZE, GRILLS...). The
columns, left to right, are: Menu Item Name; 14 allergen columns (CRUSTACEANS, MILK, PEANUTS, SESAME SEEDS, EGG, FISH, NUTS,
MOLLUSCS, MUSTARD, CELERY, SULPHITES & SULPHUR DIOXIDE, LUPIN, SOYA, CEREALS THAT CONTAIN GLUTEN); SUITABLE FOR VEGETARIAN;
VEGAN; kcals; COMMENTS.

The text layer (pdftotext -bbox) carries the names, kcals, comments and the small "Wheat" / "Almond" labels under a mark.
The allergen marks themselves are NOT text: they are filled circles drawn as vector shapes (no images, no glyphs). Each page's
legend says what the colours mean ("Allergen" red = contains, "May Contain" blue, "Vegan / Vegetarian" green; the code calls the green bucket
"teal" because the sister brand's guide is teal), and this reader
takes the colour -> meaning map FROM THE LEGEND of each page (never hard-coded), then reads every circle's colour and the
table cell its centre lies in (cell rectangles come from `pdftocairo -svg`). The header text of every column is checked on
every table, so a changed column order stops the run.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

WORD = re.compile(r'<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">(.*?)</word>')
NUMBER = re.compile(r"[-+]?\d*\.?\d+(?:e[-+]?\d+)?", re.I)
SVG = "{http://www.w3.org/2000/svg}"

# Column order of the 19 cells in a table row, with the header words each must carry (sorted, upper-case, "&" kept).
COLUMNS = [
    ("name", ["ITEM", "MENU", "NAME"]),
    ("crustaceans", ["CRUSTACEANS"]), ("milk", ["MILK"]), ("peanuts", ["PEANUTS"]), ("sesame", ["SEEDS", "SESAME"]),
    ("eggs", ["EGG"]), ("fish", ["FISH"]), ("nuts", ["NUTS"]), ("molluscs", ["MOLLUSCS"]), ("mustard", ["MUSTARD"]),
    ("celery", ["CELERY"]), ("sulphites", ["&", "DIOXIDE", "SULPHITES", "SULPHUR"]), ("lupin", ["LUPIN"]), ("soya", ["SOYA"]),
    ("gluten", ["CEREALS", "CONTAIN", "GLUTEN", "THAT"]),
    ("vegetarian", ["VEGETARIAN"]), ("vegan", ["VEGAN"]), ("kcals", ["KCALS"]), ("comments", ["COMMENTS"]),
]
ALLERGEN_COLUMNS = [c for c, _ in COLUMNS[1:15]]
TABLE_STROKE = "rgb(11.372375%, 11.372375%, 10.588074%)"  # the grid lines
BANNER_FILL = "rgb(74.118042%, 60.784912%, 34.901428%)"  # the gold section banners
DOT_SIZE = (5.0, 5.6)  # a mark in a table cell is a circle about 5.3 pt across (legend circles are 6.3 pt)
LEGEND_SIZE = (6.0, 6.6)
ROW_TOLERANCE = 0.4


def _words(pdf: Path, page: int) -> list[tuple[float, float, float, float, str]]:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]


def _matrix(text: str | None) -> tuple[float, ...]:
    if not text:
        return (1, 0, 0, 1, 0, 0)
    nums = [float(x) for x in NUMBER.findall(text)]
    m = re.match(r"\s*(\w+)", text).group(1)
    if m == "matrix" and len(nums) == 6:
        return tuple(nums)
    raise ValueError(f"unsupported transform {text!r}")


def _mul(a: tuple, b: tuple) -> tuple:
    """Apply a first, then b (SVG: b is the outer transform)."""
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


def _shapes(pdf: Path, page: int) -> list[dict]:
    """Every <path> of the page as {fill, stroke, x0, y0, x1, y1} in page points (y down), glyph outlines skipped."""
    with tempfile.TemporaryDirectory() as tmp:
        svg = Path(tmp) / "p.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(svg)], check=True, capture_output=True)
        root = ET.parse(svg).getroot()
    shapes: list[dict] = []

    def walk(node: ET.Element, ctm: tuple) -> None:
        for child in node:
            tag = child.tag.replace(SVG, "")
            if tag == "defs":
                continue  # glyph outlines
            m = _mul(_matrix(child.get("transform")), ctm)
            if tag == "path":
                nums = [float(x) for x in NUMBER.findall(re.sub(r"[A-Za-z]", " ", child.get("d", "")))]
                if len(nums) < 4 or len(nums) % 2:
                    continue
                pts = [(nums[i] * m[0] + nums[i + 1] * m[2] + m[4], nums[i] * m[1] + nums[i + 1] * m[3] + m[5]) for i in range(0, len(nums), 2)]
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                shapes.append({"fill": child.get("fill"), "stroke": child.get("stroke"), "x0": min(xs), "y0": min(ys),
                               "x1": max(xs), "y1": max(ys), "d": child.get("d", "")})
            elif tag == "g":
                walk(child, m)
            elif tag == "use" or tag == "image":
                continue

    walk(root, (1, 0, 0, 1, 0, 0))
    return shapes


def _rgb(fill: str) -> tuple[float, float, float]:
    r, g, b = (float(x) / 100 for x in re.findall(r"[\d.]+", fill))
    return r, g, b


def _nearest_legend(fill: str, legend: dict[str, str]) -> str | None:
    """The legend label whose swatch colour is nearest to `fill` (the legend swatches are not quite the table's colour: the
    legend red is 87/12/12 %, the marks are 86/0/0 %). None unless one swatch is clearly nearest (twice as near as the next)."""
    dist = sorted((sum((a - b) ** 2 for a, b in zip(_rgb(fill), _rgb(swatch))) ** 0.5, label) for label, swatch in legend.items())
    if not dist or dist[0][0] > 0.25 or (len(dist) > 1 and dist[1][0] < 2 * dist[0][0]):
        return None
    return dist[0][1]


def _size_ok(s: dict, rng: tuple[float, float]) -> bool:
    w, h = s["x1"] - s["x0"], s["y1"] - s["y0"]
    return rng[0] <= w <= rng[1] and rng[0] <= h <= rng[1]


def _center(s: dict) -> tuple[float, float]:
    return (s["x0"] + s["x1"]) / 2, (s["y0"] + s["y1"]) / 2


def _inside(x: float, y: float, c: dict) -> bool:
    return c["x0"] <= x <= c["x1"] and c["y0"] <= y <= c["y1"]


def _text(words: list[tuple]) -> str:
    words = sorted(words, key=lambda w: (round(w[1] / 3), w[0]))
    return " ".join(w[4] for w in words)


def cover_text(pdf: Path) -> str:
    """Page 1's words in reading order (used to pin the guide's version and to quote the legend)."""
    out = subprocess.run(["pdftotext", "-layout", "-f", "1", "-l", "1", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return " ".join(out.split())


def pages(pdf: Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], check=True, capture_output=True, text=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))


def read_page(pdf: Path, page: int) -> dict:
    """{"legend": {label: colour}, "banners": [(label, y)], "rows": [row dicts], "stray": [words outside every cell/banner]}.
    A row: {"page", "section", "name", "kcals", "comments", "red": {column: label text under the mark or ""}, "blue": {...},
    "teal": {...}}. `red`/`blue`/`teal` are the columns holding a circle of that legend colour; the value is the small text
    printed inside that cell (e.g. "Wheat", "Almond") or ""."""
    words = _words(pdf, page)
    shapes = _shapes(pdf, page)

    # ---- legend: circles of LEGEND_SIZE and the word group printed right of each ----
    legend: dict[str, str] = {}
    for s in shapes:
        if s["fill"] and s["fill"] != "none" and not s["stroke"] and _size_ok(s, LEGEND_SIZE):
            cx, cy = _center(s)
            line = sorted((w for w in words if abs((w[1] + w[3]) / 2 - cy) < 4 and w[0] > cx and w[0] - cx < 90), key=lambda w: w[0])
            # take words until a gap > 12 pt (the next legend entry starts after a larger gap)
            label, last = [], cx + 3
            for w in line:
                if w[0] - last > 12:
                    break
                label.append(w[4])
                last = w[2]
            legend[" ".join(label)] = s["fill"]

    # ---- banners ----
    banners = []
    for s in shapes:
        if s["fill"] == BANNER_FILL and (s["x1"] - s["x0"]) > 100 and (s["y1"] - s["y0"]) > 15:
            inside = [w for w in words if s["x0"] <= (w[0] + w[2]) / 2 <= s["x1"] and s["y0"] - 3 <= (w[1] + w[3]) / 2 <= s["y1"] + 3]
            banners.append({"label": _text(inside), "y0": s["y0"], "y1": s["y1"], "x0": s["x0"], "x1": s["x1"]})
    banners.sort(key=lambda b: b["y0"])

    # ---- cell rectangles, grouped into rows by y ----
    cells = [s for s in shapes if s["stroke"] == TABLE_STROKE and (s["x1"] - s["x0"]) > 5 and (s["y1"] - s["y0"]) > 5
             and s["d"].count("M") <= 2 and s["d"].count("L") <= 4]
    rows_by_y: list[list[dict]] = []
    for c in sorted(cells, key=lambda c: (c["y0"], c["x0"])):
        if rows_by_y and abs(rows_by_y[-1][0]["y0"] - c["y0"]) <= ROW_TOLERANCE and abs(rows_by_y[-1][0]["y1"] - c["y1"]) <= ROW_TOLERANCE:
            rows_by_y[-1].append(c)
        else:
            rows_by_y.append([c])
    table_rows = []
    for r in rows_by_y:
        r.sort(key=lambda c: c["x0"])
        if len(r) == len(COLUMNS):
            table_rows.append(r)
        elif len(r) == len(COLUMNS) - 1:
            # a column-heading row: its COMMENTS cell is one tall rectangle that also spans the "DOES IT CONTAIN" row above
            tall = [c for c in cells if abs(c["x0"] - r[-1]["x1"]) < 1 and c["y0"] <= r[0]["y0"] + 1 and c["y1"] >= r[0]["y1"] - 1]
            if len(tall) != 1:
                raise ValueError(f"page {page}: no COMMENTS cell for the heading row at y={r[0]['y0']:.1f}")
            table_rows.append(r + tall)
        elif len(r) > 3:
            raise ValueError(f"page {page}: a table row at y={r[0]['y0']:.1f} has {len(r)} cells, expected {len(COLUMNS)}")
        # rows of 1-3 cells are banners and the merged "DOES IT CONTAIN / SUITABLE FOR" heading row

    def cell_words(cell: dict) -> list[tuple]:
        return [w for w in words if _inside((w[0] + w[2]) / 2, (w[1] + w[3]) / 2, cell)]

    marks = [s for s in shapes if s["fill"] and s["fill"] != "none" and not s["stroke"] and _size_ok(s, DOT_SIZE)]
    out_rows: list[dict] = []
    used_words: set[tuple] = set()
    used_marks: set[int] = set()
    header_seen = False
    for r in table_rows:
        cw = [cell_words(c) for c in r]
        for ws in cw:
            used_words.update(ws)
        name = _text(cw[0])
        if name == "Menu Item Name":
            for (col, expected), ws in zip(COLUMNS, cw):
                got = sorted(w[4].upper() for w in ws)
                if got != expected:
                    raise ValueError(f"page {page}: column header for {col!r} reads {got}, expected {expected}: the table layout changed")
            header_seen = True
            continue
        if not header_seen:
            raise ValueError(f"page {page}: table rows before any header row")
        if any(w for i, ws in enumerate(cw) for w in ws if i in (15, 16)):
            raise ValueError(f"page {page}: text in a Vegetarian/Vegan cell for {name!r}")
        row = {"page": page, "y": r[0]["y0"], "name": name, "kcals": _text(cw[17]).strip(), "comments": _text(cw[18]).strip(),
               "red": {}, "blue": {}, "teal": {}, "section": None}
        for i, (col, _) in enumerate(COLUMNS):
            if col in ("name", "kcals", "comments"):
                continue
            in_cell = [(k, m) for k, m in enumerate(marks) if _inside(*_center(m), r[i])]
            if len(in_cell) > 1:
                raise ValueError(f"page {page}: {len(in_cell)} marks in the {col} cell of {name!r}")
            if in_cell:
                k, m = in_cell[0]
                used_marks.add(k)
                meaning = _nearest_legend(m["fill"], legend)
                bucket = {"Allergen": "red", "May Contain": "blue", "Vegan / Vegetarian": "teal"}.get(meaning)
                if bucket is None:
                    raise ValueError(f"page {page}: mark colour {m['fill']} in {name!r}/{col} is not in this page's legend {legend}")
                if (col in ("vegetarian", "vegan")) != (bucket == "teal"):
                    raise ValueError(f"page {page}: a {meaning!r} mark in the {col} column of {name!r}")
                row[bucket][col] = _text(cw[i])
            elif cw[i]:
                raise ValueError(f"page {page}: text {_text(cw[i])!r} in the {col} cell of {name!r} without a mark")
        out_rows.append(row)
    unused = [m for k, m in enumerate(marks) if k not in used_marks]
    if unused:
        raise ValueError(f"page {page}: {len(unused)} mark(s) outside every table row (first at {_center(unused[0])})")

    # section of each row = the nearest banner above it
    for row in out_rows:
        above = [b for b in banners if b["y1"] <= row["y"] + 1]
        row["section"] = above[-1]["label"] if above else None

    banner_words = set()
    for b in banners:
        banner_words.update(w for w in words if b["x0"] <= (w[0] + w[2]) / 2 <= b["x1"] and b["y0"] - 3 <= (w[1] + w[3]) / 2 <= b["y1"] + 3)
    stray = [w[4] for w in words if w not in used_words and w not in banner_words]
    return {"legend": legend, "banners": banners, "rows": out_rows, "stray": stray}
