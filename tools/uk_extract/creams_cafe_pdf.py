"""Read Creams Cafe's official "Allergens & Calorie Declaration and Matrix" PDF into table rows.

Used by tools/uk_extract/creams_cafe.py. Needs `pdftotext` and `pdftoppm` (poppler); standard library only (Python 3.9).
Numbers are returned exactly as printed (strings such as "784"); nothing is converted, rounded or estimated here.

The file is 29 landscape A4 pages (after a cover page) exported from Word. Every page holds one or two tables with the columns
Category | KCAL | Product name | 14 allergen columns (Celery ... Tree Nuts). A cell prints "Contains" or "May Contain" (sometimes
followed by the cereal or tree nut named) on a grey or green background; an empty light-grey cell means nothing is marked.

Reading is by position AND by the drawn page, never by counting:

  1. every word of the text layer is found with its box (pdftotext -bbox);
  2. the page is rendered (pdftoppm, 100 dpi) so the table's own ruled lines can be seen: the rows of a table are the spaces between
     the horizontal lines seen across the KCAL column, the groups in the Category column the spaces between the lines seen across
     that column (a group label is centred in a cell merged over several rows, so the label's position alone cannot say which rows
     it covers);
  3. each word goes to the row whose lines enclose it and to the column whose header it is nearest to;
  4. every allergen cell is read twice, from its text ("Contains" / "May Contain") and from its background colour (grey / green /
     light grey). A row where the two disagree (a coloured cell with no text, or text on a plain cell) is reported as `shade_mismatch`
     and the caller must not publish its allergens.

Rows with no KCAL number and text that is not a product (full-width notes) are returned in `notes` so the caller can check each one.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

SCALE = 100.0 / 72.0  # pixels per point at 100 dpi
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">')
# The 14 allergen columns in print order: (key, header word the column starts with)
COLUMNS = [("celery", "Celery"), ("gluten", "Gluten"), ("crustaceans", "Crustace"), ("eggs", "Eggs"), ("fish", "Fish"), ("lupin", "Lupin"),
           ("milk", "Milk"), ("molluscs", "Molluscs"), ("mustard", "Mustard"), ("peanuts", "Peanuts"), ("sesame", "Sesame"),
           ("soya", "Soya"), ("sulphites", "Sulphur"), ("nuts", "Tree")]
HEADER_WORDS = set("Category KCAL Product name Celery Gluten Crustaceans Crustace ans Eggs Fish Lupin Milk Molluscs Mustard Peanuts "
                   "Sesame Soya Sulphur Dioxide & Sulphites in Concentrations > 10mg/kg(10mg/L) Tree Nuts".split())
FLAT = {"none": (242, 242, 242), "contains": (191, 191, 191), "may": (216, 228, 188)}  # the three flat cell colours in this file


class Ppm:
    """A binary PPM (P6) page image."""

    def __init__(self, data: bytes) -> None:
        m = re.match(rb"P6\s+(\d+)\s+(\d+)\s+255\s", data)
        if not m:
            raise SystemExit("pdftoppm did not give a P6 PPM image")
        self.w, self.h, self.data, self.off = int(m.group(1)), int(m.group(2)), data, m.end()

    def px(self, x: int, y: int) -> tuple:
        if not (0 <= x < self.w and 0 <= y < self.h):
            return (255, 255, 255)
        i = self.off + (y * self.w + x) * 3
        return (self.data[i], self.data[i + 1], self.data[i + 2])

    def lum(self, x: int, y: int) -> int:
        r, g, b = self.px(x, y)
        return (r + g + b) // 3

    def dip_x(self, x: int, y: int) -> bool:
        """True if the pixel is darker than the pixels 3 px left AND right of it by at least 12 (a vertical ruled line)."""
        v = self.lum(x, y)
        return v <= self.lum(x - 3, y) - 12 and v <= self.lum(x + 3, y) - 12

    def dip_y(self, x: int, y: int) -> bool:
        """True if the pixel is darker than the pixels 3 px above AND below it by at least 12 (a horizontal ruled line)."""
        v = self.lum(x, y)
        return v <= self.lum(x, y - 3) - 12 and v <= self.lum(x, y + 3) - 12

    def line_fraction(self, y: int, spans: list) -> float:
        """Share of pixels on pixel-row y, inside the x spans (points), that are part of a horizontal ruled line. Lines in this
        file are hairlines (grey, 1-2 px), so a line is a dip against the rows above and below, not simply a dark pixel."""
        n = d = 0
        for a, b in spans:
            for x in range(int(a * SCALE), int(b * SCALE) + 1):
                n += 1
                if self.dip_y(x, y):
                    d += 1
        return d / n if n else 0.0

    def dark_fraction(self, y: int, spans: list) -> float:
        """Share of pixels on pixel-row y, inside the x spans (in points), that are dark (ruled lines are black or dark grey)."""
        n = d = 0
        for a, b in spans:
            for x in range(int(a * SCALE), int(b * SCALE) + 1):
                n += 1
                if max(self.px(x, y)) < 150:
                    d += 1
        return d / n if n else 0.0


def _render(pdf: Path, tmp: Path) -> dict:
    subprocess.run(["pdftoppm", "-r", "100", str(pdf), str(tmp / "pg")], check=True, capture_output=True)
    pages = {}
    for f in tmp.glob("pg-*.ppm"):
        pages[int(f.stem.split("-")[1])] = Ppm(f.read_bytes())
    return pages


def _lines_in(img: Ppm, spans: list, y_from: float, y_to: float) -> list:
    """Centres (points) of the horizontal ruled lines seen across `spans` between y_from and y_to (points)."""
    ys = [y for y in range(int(y_from * SCALE), int(y_to * SCALE) + 1) if img.line_fraction(y, spans) >= 0.9]
    out, run = [], []
    for y in ys:
        if run and y - run[-1] > 1:
            out.append(sum(run) / len(run) / SCALE)
            run = []
        run.append(y)
    if run:
        out.append(sum(run) / len(run) / SCALE)
    return out


def _flat(img: Ppm, x: float, y: float) -> str:
    """The flat cell colour at a point ('none' | 'contains' | 'may'), or '' if the point and its 4 horizontal neighbours are not
    all one of the three flat colours (text, a ruled line, or another colour)."""
    px, py = int(round(x * SCALE)), int(round(y * SCALE))
    got = set()
    for dx in (-2, -1, 0, 1, 2):
        c = img.px(px + dx, py)
        name = next((k for k, v in FLAT.items() if all(abs(a - b) <= 3 for a, b in zip(c, v))), "")
        got.add(name)
    return got.pop() if len(got) == 1 else ""


def _cell_mark(img: Ppm, centre: float, spacing: float, box: tuple, y0: float, y1: float) -> str:
    """The background of one allergen cell: 'none' | 'contains' | 'may' | 'other'. Sampled in the cell's padding right beside,
    above and below the text block (or across an empty cell); the samples must agree."""
    ym = (y0 + y1) / 2
    pts = []
    if box is None:
        pts = [(centre + d * spacing, ym + e) for d in (-0.2, -0.1, 0.0, 0.1, 0.2) for e in (-1.5, 0.0, 1.5)]
    else:
        bx0, by0, bx1, by1 = box
        for off in (2.0, 3.0):
            pts += [(bx0 - off, ym), (bx1 + off, ym), (bx0 - off, ym - 1.5), (bx1 + off, ym + 1.5)]
        for off in (1.5, 2.5):
            pts += [((bx0 + bx1) / 2, by0 - off), ((bx0 + bx1) / 2, by1 + off)]
    votes = {}
    for x, y in pts:
        if y < y0 + 0.5 or y > y1 - 0.5:
            continue
        v = _flat(img, x, y)
        if v:
            votes[v] = votes.get(v, 0) + 1
    if len(votes) == 1 and sum(votes.values()) >= 2:
        return next(iter(votes))
    return "other"


def _text_mark(tokens: list) -> tuple:
    """('contains'|'may'|'none'|'unreadable', specifics text) from a cell's words."""
    t = " ".join(tokens).strip()
    if not t:
        return "none", ""
    m = re.match(r"^(May Contain|Contains)\b\s*(.*)$", t)
    if not m:
        return "unreadable", t
    return ("may" if m.group(1) == "May Contain" else "contains"), m.group(2).strip()


def read_tables(pdf: Path) -> list:
    """-> one dict per table: page, table (1 or 2), title (page heading), rows, notes.
    row: {kcal, name, category, cells: {key: (mark, specifics)}, shade: {key: mark}, shade_mismatch: [keys], y}
    notes: [(text, page)] for full-width text rows without a KCAL number; unanchored: product rows with no KCAL number."""
    text = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = text.split("<page ")[1:]
    tables = []
    with tempfile.TemporaryDirectory() as td:
        imgs = _render(pdf, Path(td))
        for pno, pg in enumerate(pages, 1):
            words = [dict(x0=float(a), y0=float(b), x1=float(c), y1=float(d), t=html.unescape(t)) for a, b, c, d, t in WORD.findall(pg)]
            heads = sorted([w for w in words if w["t"] == "KCAL"], key=lambda w: w["y0"])
            if pno == 1:
                if heads:
                    raise SystemExit("The cover page now has a table: the layout changed")
                continue
            if not heads:
                raise SystemExit(f"Page {pno} has no KCAL header: the layout changed")
            foot = min([w["y0"] for w in words if w["t"] == "Version"] or [9999.0])
            for ti, h in enumerate(heads):
                tables.append(_read_table(pno, ti + 1, words, h, heads[ti + 1]["y0"] if ti + 1 < len(heads) else foot, imgs[pno], pg))
    return tables


def _read_table(pno: int, tno: int, words: list, kc: dict, y_end: float, img: Ppm, pg: str) -> dict:
    kx = (kc["x0"] + kc["x1"]) / 2
    # header band: the black rows around the KCAL word (white text on black: look at the strip right of the KCAL word's box)
    strip = [(kc["x1"] + 8, kc["x1"] + 12)]
    top = kc["y0"]
    while img.dark_fraction(int((top - 1) * SCALE), strip) >= 0.88:
        top -= 1
    bottom = kc["y1"]
    while img.dark_fraction(int((bottom + 1) * SCALE), strip) >= 0.88:
        bottom += 1
    hdr = [w for w in words if top - 25 <= w["y0"] and w["y1"] <= bottom + 1 and w["t"] in HEADER_WORDS]
    cent = {}
    for key, first in COLUMNS:
        c = [w for w in hdr if w["t"].startswith(first)]
        if not c:
            raise SystemExit(f"Page {pno} table {tno}: header {first!r} not found: the layout changed")
        if key == "nuts":
            c = [w for w in hdr if w["t"] in ("Tree", "Nuts")]
        cent[key] = (min(w["x0"] for w in c) + max(w["x1"] for w in c)) / 2
    cat = [w for w in hdr if w["t"] == "Category"]
    prod = [w for w in hdr if w["t"] in ("Product", "name")]
    if len(cat) != 1 or len(prod) != 2:
        raise SystemExit(f"Page {pno} table {tno}: Category / Product name headers not found")
    cx, px_ = (cat[0]["x0"] + cat[0]["x1"]) / 2, (min(w["x0"] for w in prod) + max(w["x1"] for w in prod)) / 2
    order = [k for k, _ in COLUMNS]
    spacing = (cent["nuts"] - cent["celery"]) / 13.0
    # title: the dark-on-white heading above the table (the page's section name), if any
    title = " ".join(w["t"] for w in words if w["y1"] < top - 3 and w["y0"] > 30 and w["x0"] < 200 and not w["t"].startswith("Version"))
    # vertical ruled lines (x of every column border) over the body of the table, then the cell edges around the Category and KCAL
    # columns; a horizontal line is a pixel row that is dark across a whole cell, which text never is
    nums = [w for w in words if bottom < w["y0"] < y_end - 1 and abs((w["x0"] + w["x1"]) / 2 - kx) < 14 and re.fullmatch(r"\d+(?:\.\d+)?", w["t"])]
    if not nums:
        raise SystemExit(f"Page {pno} table {tno}: no KCAL numbers")
    last = max(w["y1"] for w in nums) + 12
    ys = [y for y in range(int((bottom + 3) * SCALE), int((last - 1) * SCALE), 2)]
    def vfrac(x: int) -> float:
        return sum(1 for y in ys if img.dip_x(x, y)) / max(1, len(ys))
    vx = [x / SCALE for x in range(int((cx - 70) * SCALE), int((cent["nuts"] + spacing) * SCALE)) if vfrac(x) >= 0.55]
    vcl = []
    for x in vx:
        if vcl and x - vcl[-1][-1] < 0.6:
            vcl[-1].append(x)
        else:
            vcl.append([x])
    vlines = [sum(c) / len(c) for c in vcl]
    def cell_span(x: float) -> list:
        left = [v for v in vlines if v < x - 3]
        right = [v for v in vlines if v > x + 3]
        if not right:
            raise SystemExit(f"Page {pno} table {tno}: column border right of x={x:.0f} not found")
        r = min(right)
        l = max(left) if left else x - (r - x)  # the table's outer left border is sometimes not drawn: assume a centred header
        return [(l + 2.5, r - 2.5)]
    kspan, cspan = cell_span(kx), cell_span(cx)
    k_left, k_right = kspan[0][0] - 2.5, kspan[0][1] + 2.5
    prod_right = cent["celery"] - spacing / 2
    # row lines are looked for in the margins of the KCAL cell (the number is centred and never reaches them)
    kmargin = [(kspan[0][0], kspan[0][0] + 6), (kspan[0][1] - 6, kspan[0][1])]
    rl = [l for l in _lines_in(img, kmargin, bottom, y_end - 1) if l > bottom + 2]
    # a category boundary is a row line that is ALSO drawn across the Category cell (a merged cell has no line inside it)
    cl = [l for l in rl if img.line_fraction(int(round(l * SCALE)), cspan) >= 0.7 or img.line_fraction(int(round(l * SCALE)) - 1, cspan) >= 0.7
          or img.line_fraction(int(round(l * SCALE)) + 1, cspan) >= 0.7]
    if len(rl) < 2:
        raise SystemExit(f"Page {pno} table {tno}: row lines not found")
    edges = [bottom] + rl
    stop = max(w["y1"] for w in nums)
    after = [e for e in edges if e > stop]
    if not after:
        raise SystemExit(f"Page {pno} table {tno}: no ruled line under the last row")
    edges = [e for e in edges if e <= min(after)]
    cl = [e for e in cl if e <= min(after) + 1]
    rows, notes, unanchored = [], [], []
    cat_edges = [bottom] + cl
    for a, b in zip(edges[:-1], edges[1:]):
        inside = [w for w in words if a <= (w["y0"] + w["y1"]) / 2 < b and w["y0"] < y_end]
        if not inside:
            continue
        cols = {}  # column name -> words
        for w in inside:
            xc = (w["x0"] + w["x1"]) / 2
            if xc < k_left:
                col = "cat"
            elif xc < k_right:
                col = "kcal"
            elif xc < prod_right:
                col = "prod"
            else:
                col = min(order, key=lambda k: abs(cent[k] - xc))
            cols.setdefault(col, []).append(w)
        def join(ws):
            return " ".join(w["t"] for w in sorted(ws, key=lambda w: (round(w["y0"] / 3), w["x0"])))
        kc_words = [w["t"] for w in cols.get("kcal", [])]
        cat_label = join(cols.get("cat", []))
        spans_cols = len(cols.keys() - {"cat"})
        mid = (a + b) / 2
        category = ""
        for ca, cb in zip(cat_edges[:-1], cat_edges[1:]):
            if ca <= mid < cb:
                category = " ".join(w["t"] for w in sorted([w for w in words if ca <= (w["y0"] + w["y1"]) / 2 < cb and w["x0"] < kx - 20 and abs((w["x0"] + w["x1"]) / 2 - cx) < 62], key=lambda w: (round(w["y0"] / 3), w["x0"])))
        if not kc_words:
            body = [w for w in inside if (w["x0"] + w["x1"]) / 2 > kx - 10]
            textline = join(body)
            has_marks = any(re.match(r"^(May|Contains)$", w["t"]) for w in body)
            if has_marks or (len(cols.get("prod", [])) and spans_cols <= 4):
                unanchored.append(dict(page=pno, text=textline, category=category))
            elif textline:
                notes.append((textline, pno))
            continue
        if len(kc_words) != 1 or not re.fullmatch(r"\d+(?:\.\d+)?", kc_words[0]):
            raise SystemExit(f"Page {pno}: KCAL cell {kc_words} is not one number (row at y={a:.0f}-{b:.0f})")
        cells, shade, mismatch = {}, {}, []
        for k in order:
            tm, spec = _text_mark([w["t"] for w in sorted(cols.get(k, []), key=lambda w: (round(w["y0"] / 3), w["x0"]))])
            ws = cols.get(k, [])
            box = (min(w["x0"] for w in ws), min(w["y0"] for w in ws), max(w["x1"] for w in ws), max(w["y1"] for w in ws)) if ws else None
            sh = _cell_mark(img, cent[k], spacing, box, a, b)
            sh = {"contains": "contains", "may": "may", "none": "none"}.get(sh, "other")
            cells[k], shade[k] = (tm, spec), sh
            # 'other' = the text fills the cell so no background could be sampled beside it: only acceptable when there is text
            if (sh == "other" and tm == "none") or (sh != "other" and sh != tm and not (sh == "may" and tm == "may")):
                mismatch.append(k)
        rows.append(dict(page=pno, table=tno, kcal=kc_words[0], name=join(cols.get("prod", [])), category=category, cells=cells,
                         shade=shade, shade_mismatch=mismatch, y=(a, b)))
    return dict(page=pno, table=tno, title=title, rows=rows, notes=notes, unanchored=unanchored)
