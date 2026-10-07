"""Read Caffè Concerto's official allergen guides (PDF grids with calories printed in the dish names).

Used by tools/uk_extract/cafe_concerto.py. Requires poppler (`pdftotext`, `pdftocairo`) and nothing else (Python 3.9+).
Nothing is converted, rounded or estimated here: dish names are returned as printed (calories are still inside the name text).

Each guide is a landscape A4-ish PDF (992 x 709 pt) made by the same template: a header on every page (legend at the top left:
"Contains" = green tick, "May Contain" = green M, "Removable" = green R; then 15 black column headings: NO ALLERGENS, CELERY &
CELERIAC, CEREALS CONTAINING GLUTEN, CRUSTACEAN, EGGS, FISH, LUPIN, MILK, MOLLUSCS, MUSTARD, PEANUTS, SESAME SEEDS, SOYA,
SULPHUR DIOXIDE (SULPHITES), TREE NUTS), then a dark banner naming the section, then one row per dish: the dish name (the
calories are printed inside it, e.g. "Bruschetta (kcal 377)") and one cell per column.

The marks are NOT text: they are small bitmap icons placed over the cells. The text layer gives the dish names and the small
labels printed beside a mark in the gluten and tree nut cells ("Rye", "Wheat", "Almonds", "Queensland nuts"). This reader:
  * reads each page's legend (the three icons next to the words Contains / May Contain / Removable) and maps every icon to its
    meaning BY THE ICON'S OWN PIXELS (the PNG data), never by position or colour guess;
  * takes the 15 column rectangles from the black header cells and checks the heading words of every column;
  * takes the row boundaries from the grid's own thin horizontal lines, and the section from the dark banner;
  * stops with a clear message on anything it cannot place exactly (an icon it does not know, a label without an icon, two
    icons in one place, text in a cell it does not expect, a row boundary that does not line up).
"""
from __future__ import annotations
import base64
import hashlib
import html
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

WORD = re.compile(r'<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">(.*?)</word>')
NUMBER = re.compile(r"[-+]?\d*\.?\d+(?:e[-+]?\d+)?", re.I)
SVG = "{http://www.w3.org/2000/svg}"
XLINK = "{http://www.w3.org/1999/xlink}"

# Column order of the 15 black header cells, each with the heading words it must carry (upper-case, sorted).
COLUMNS = [
    ("none", ["ALLERGENS", "NO"]), ("celery", ["&", "CELERIAC", "CELERY"]),
    ("gluten", ["CEREALS", "CONTAINING", "GLUTEN"]), ("crustaceans", ["CRUSTACEAN"]), ("eggs", ["EGGS"]), ("fish", ["FISH"]),
    ("lupin", ["LUPIN"]), ("milk", ["MILK"]), ("molluscs", ["MOLLUSCS"]), ("mustard", ["MUSTARD"]), ("peanuts", ["PEANUTS"]),
    ("sesame", ["SEEDS", "SESAME"]), ("soya", ["SOYA"]), ("sulphites", ["(SULPHITES)", "DIOXIDE", "SULPHUR"]),
    ("nuts", ["NUTS", "TREE"]),
]
# Fills as pdftocairo writes them (their last digits differ a little from page to page, so they are compared with a tolerance).
HEADER_FILL = (0.063, 0.047, 0.031)  # the black heading cells
BANNER_FILL = (0.235, 0.235, 0.231)  # the dark section banners
LINE_FILL = (0.867, 0.867, 0.867)  # the grid's light grey lines
LEGEND_WORDS = {"Contains": "contains", "May Contain": "may", "Removable": "removable"}


def _words(pdf: Path, page: int) -> list[tuple[float, float, float, float, str]]:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]


def pages(pdf: Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], check=True, capture_output=True, text=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))


def _matrix(text):
    if not text:
        return (1, 0, 0, 1, 0, 0)
    nums = [float(x) for x in NUMBER.findall(text)]
    if text.strip().startswith("matrix") and len(nums) == 6:
        return tuple(nums)
    raise ValueError(f"unsupported transform {text!r}")


def _mul(a: tuple, b: tuple) -> tuple:
    """Apply a first, then b (SVG: b is the outer transform)."""
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


def _svg_shapes(pdf: Path, page: int) -> tuple[list[dict], list[dict]]:
    """(paths, icons) of the page. paths: {fill, x0, y0, x1, y1, curved}; icons: {hash, cx, cy, size} for every bitmap placed on the
    page body (the soft-mask copies inside <mask> are skipped). `hash` is the SHA-256 of the PNG bytes."""
    with tempfile.TemporaryDirectory() as tmp:
        svg = Path(tmp) / "p.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(svg)], check=True, capture_output=True)
        root = ET.parse(svg).getroot()
    image_hash: dict[str, str] = {}
    for el in root.iter(SVG + "image"):
        href = el.get(XLINK + "href") or el.get("href") or ""
        m = re.match(r"data:image/png;base64,(.*)", href, re.S)
        if m and el.get("id"):
            image_hash[el.get("id")] = hashlib.sha256(base64.b64decode(m.group(1))).hexdigest()
    paths: list[dict] = []
    icons: list[dict] = []

    def walk(node: ET.Element, ctm: tuple) -> None:
        for child in node:
            tag = child.tag.replace(SVG, "")
            if tag in ("defs", "mask", "clipPath"):
                continue
            m = _mul(_matrix(child.get("transform")), ctm)
            if tag == "path":
                nums = [float(x) for x in NUMBER.findall(re.sub(r"[A-Za-z]", " ", child.get("d", "")))]
                if len(nums) < 4 or len(nums) % 2:
                    continue
                pts = [(nums[i] * m[0] + nums[i + 1] * m[2] + m[4], nums[i] * m[1] + nums[i + 1] * m[3] + m[5]) for i in range(0, len(nums), 2)]
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                paths.append({"fill": child.get("fill"), "x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys),
                              "curved": "C" in child.get("d", "")})
            elif tag == "use":
                ref = (child.get(XLINK + "href") or child.get("href") or "").lstrip("#")
                if ref in image_hash:
                    cx = 50 * m[0] + 50 * m[2] + m[4]
                    cy = 50 * m[1] + 50 * m[3] + m[5]
                    icons.append({"hash": image_hash[ref], "cx": cx, "cy": cy, "size": 100 * abs(m[0])})
            elif tag == "g":
                walk(child, m)

    walk(root, (1, 0, 0, 1, 0, 0))
    return paths, icons


def _is(fill, target: tuple) -> bool:
    """True when an 'rgb(a%, b%, c%)' fill is within 0.5 % of the target colour."""
    m = re.match(r"rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)", fill or "")
    return bool(m) and all(abs(float(v) / 100 - t) < 0.005 for v, t in zip(m.groups(), target))


def _inside(x: float, y: float, x0: float, y0: float, x1: float, y1: float) -> bool:
    return x0 <= x <= x1 and y0 <= y <= y1


def _line_text(words: list[tuple]) -> str:
    """Words joined in reading order: lines by y (3 pt tolerance), left to right inside a line."""
    ws = sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    lines: list[list[tuple]] = []
    for w in ws:
        if lines and abs((lines[-1][0][1] + lines[-1][0][3]) / 2 - (w[1] + w[3]) / 2) <= 3:
            lines[-1].append(w)
        else:
            lines.append([w])
    return " ".join(" ".join(x[4] for x in sorted(line, key=lambda w: w[0])) for line in lines)


def read_page(pdf: Path, page: int) -> dict:
    """{"legend": {meaning: hash}, "rows": [{"page", "section", "name", "marks": {column: [{"meanings", "label"}]}}], "banners": [...]}.
    `marks[column]` lists, line by line, the icons found in that column's cell: {"meanings": sorted list of 'contains' / 'may' /
    'removable' (one or two icons share a line), "label": the small text printed left of them, '' when none}."""
    words = _words(pdf, page)
    paths, icons = _svg_shapes(pdf, page)

    # ---- the 15 column header cells ----
    heads = sorted({round(p["x0"], 1): p for p in paths if _is(p["fill"], HEADER_FILL) and (p["y1"] - p["y0"]) > 100 and (p["x1"] - p["x0"]) > 40}.values(),
                   key=lambda p: p["x0"])
    if len(heads) != len(COLUMNS):
        raise ValueError(f"{pdf.name} page {page}: {len(heads)} column header cells, expected {len(COLUMNS)}: the layout changed")
    for h, (col, expected) in zip(heads, COLUMNS):
        got = sorted(w[4].upper() for w in words if _inside((w[0] + w[2]) / 2, (w[1] + w[3]) / 2, h["x0"], h["y0"], h["x1"], h["y1"]))
        if got != expected:
            raise ValueError(f"{pdf.name} page {page}: column heading for {col!r} reads {got}, expected {expected}: the layout changed")
    name_x1 = heads[0]["x0"]
    head_bottom = heads[0]["y1"]

    # ---- legend: the icon at the left of each of the words Contains / May Contain / Removable ----
    legend: dict[str, str] = {}
    for label, meaning in LEGEND_WORDS.items():
        parts = label.split()
        for w in words:
            if w[4] == parts[0] and w[0] < name_x1 and w[1] < head_bottom:
                line = sorted((x for x in words if abs((x[1] + x[3]) / 2 - (w[1] + w[3]) / 2) < 3 and x[0] >= w[0]), key=lambda x: x[0])
                if [x[4] for x in line[:len(parts)]] != parts:
                    continue
                near = [i for i in icons if i["cx"] < w[0] and w[0] - i["cx"] < 20 and abs(i["cy"] - (w[1] + w[3]) / 2) < 6 and i["size"] < 15]
                if len(near) != 1:
                    raise ValueError(f"{pdf.name} page {page}: expected one legend icon beside {label!r}, found {len(near)}")
                legend[meaning] = near[0]["hash"]
    if sorted(legend) != ["contains", "may", "removable"] or len(set(legend.values())) != 3:
        raise ValueError(f"{pdf.name} page {page}: legend not read completely: {sorted(legend)}")
    by_hash = {h: m for m, h in legend.items()}

    # ---- banners and row bands ----
    banners = [p for p in paths if _is(p["fill"], BANNER_FILL) and (p["x1"] - p["x0"]) > 800 and (p["y1"] - p["y0"]) > 15]
    banners.sort(key=lambda p: p["y0"])
    name_x0 = min(p["x0"] for p in paths if _is(p["fill"], LINE_FILL) and p["x1"] > p["x0"] and p["x0"] < name_x1 - 100)
    # row boundaries: the thin light-grey lines between rows, and the dark thin line that closes the table (name column only)
    seps = sorted((p for p in paths if (_is(p["fill"], LINE_FILL) or _is(p["fill"], BANNER_FILL)) and (p["y1"] - p["y0"]) < 1.4
                   and abs(p["x0"] - name_x0) < 1.5 and abs(p["x1"] - name_x1) < 2.5 and p["y0"] > head_bottom), key=lambda p: p["y0"])
    seps = [p for k, p in enumerate(seps) if k == 0 or p["y0"] - seps[k - 1]["y0"] > 0.5]  # the same line drawn twice
    banner_labels = []
    for b in banners:
        inside = [w for w in words if _inside((w[0] + w[2]) / 2, (w[1] + w[3]) / 2, b["x0"], b["y0"], b["x1"], b["y1"])]
        banner_labels.append({"label": _line_text(inside), "y0": b["y0"], "y1": b["y1"]})
    rows = []
    marks_used = set()
    for a, b in zip(seps, seps[1:]):
        top, bottom = a["y1"], b["y0"]
        if bottom - top < 8:
            continue
        if any(bn["y0"] - 2 <= top and bottom <= bn["y1"] + 2 for bn in banner_labels):
            continue
        if not any(bn["y1"] <= top + 2 for bn in banner_labels):
            continue  # the icon row between the column headings and the first banner
        name_words = [w for w in words if name_x0 - 1 <= (w[0] + w[2]) / 2 <= name_x1 and top <= (w[1] + w[3]) / 2 <= bottom]
        name = _line_text(name_words)
        if not name:
            raise ValueError(f"{pdf.name} page {page}: a table row at y={top:.1f} has no dish name")
        section = None
        for bn in banner_labels:
            if bn["y1"] <= top + 2:
                section = bn["label"]
        row = {"page": page, "y": top, "section": section, "name": name, "marks": {}}
        for h, (col, _) in zip(heads, COLUMNS):
            cell_words = [w for w in words if _inside((w[0] + w[2]) / 2, (w[1] + w[3]) / 2, h["x0"], top, h["x1"], bottom)]
            cell_icons = [(k, i) for k, i in enumerate(icons) if _inside(i["cx"], i["cy"], h["x0"], top, h["x1"], bottom)]
            found = []
            used_words = set()
            lines: list[list[tuple]] = []  # icons grouped by line inside the cell (a "May contain" and a "Removable" icon can share one)
            for k, i in sorted(cell_icons, key=lambda ki: (ki[1]["cy"], ki[1]["cx"])):
                if i["hash"] not in by_hash:
                    raise ValueError(f"{pdf.name} page {page}: an icon in the {col} cell of {name!r} is not one of the three legend icons")
                marks_used.add(k)
                if lines and abs(lines[-1][0][1]["cy"] - i["cy"]) < 3:
                    lines[-1].append((k, i))
                else:
                    lines.append([(k, i)])
            for line in lines:
                first_x = min(i["cx"] for _, i in line)
                cy = line[0][1]["cy"]
                same_line = [w for w in cell_words if abs((w[1] + w[3]) / 2 - cy) < 4 and (w[0] + w[2]) / 2 < first_x]
                used_words.update(same_line)
                meanings = sorted(by_hash[i["hash"]] for _, i in line)
                found.append({"meanings": meanings, "label": _line_text(same_line)})
            stray = [w[4] for w in cell_words if w not in used_words]
            if stray:
                raise ValueError(f"{pdf.name} page {page}: text {stray} in the {col} cell of {name!r} is not next to an icon")
            if found:
                row["marks"][col] = found
        rows.append(row)
    # every table icon (below the header) must have landed in a row's cell
    table_icons = [(k, i) for k, i in enumerate(icons) if i["cy"] > head_bottom + 40 and i["cx"] > name_x1]
    lost = [i for k, i in table_icons if k not in marks_used]
    if lost:
        raise ValueError(f"{pdf.name} page {page}: {len(lost)} icon(s) below the header outside every row/cell (first at x={lost[0]['cx']:.1f}, y={lost[0]['cy']:.1f})")
    return {"legend": legend, "rows": rows, "banners": banner_labels}


def read_pdf(pdf: Path) -> list[dict]:
    out = []
    for p in range(1, pages(pdf) + 1):
        out.extend(read_page(pdf, p)["rows"])
    return out
