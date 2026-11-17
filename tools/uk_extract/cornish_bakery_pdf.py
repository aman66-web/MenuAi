"""Read The Cornish Bakery's official "Allergen Information Booklet" PDF (Document V48, 01-09-2026) into table rows.

Used by tools/uk_extract/cornish_bakery.py. Needs `pdftotext` and `pdftoppm` (poppler); standard library only (Python 3.9).
Numbers are returned exactly as printed (strings such as "1039"); nothing is converted, rounded or estimated here.

V48 (refresh of 2026-11-17) is 20 landscape A4 pages made in InDesign: pages 1-2 and 19-20 are a cover and pictures with no text layer
(skipped, and checked to hold no words but the cover's title "Allergen Information Booklet"); pages 3-18 each hold ONE table like the V42
matrix's, with a row of allergen pictures under the column headings and a footer "01-09-2026  <page 1-16>  Document : V48". (V42,
26-02-2026, was 10 Excel pages; the reader was written for it and adapted, not rewritten, for V48.) Page 3 starts with a paragraph of text.
Each table has the columns  item name | Kcal each (number, then the word "kcal") | No Allergens | 14 allergen columns (Celery ... Sulphites).
A cell is empty, or prints "Contains" / "May Contain" (the gluten cell also names the cereals, the nuts cell the tree nuts; the wording of
those two cells varies in V48, see cornish_bakery.read_allergens). The "No Allergens" cell prints "None", "See Pack" or nothing. The cells
have black borders and no shading, so a row is read by position:

  1. every word of the text layer is found with its box (pdftotext -bbox);
  2. the page is rendered (pdftoppm, 110 dpi, grey) so the table's own ruled lines can be seen: a row is the space between two
     horizontal lines drawn right across the table (text never fills 90% of a pixel row with black), and a column is the space between
     two vertical lines drawn down the table body (V48's columns differ in width, so a heading's midpoint is not a border);
  3. a row holds at most one calorie value ("1039" or "n/a") and the word that follows it; a row with an empty calorie cell (V48 prints one)
     comes back with kcal "" and must print no unit either; every word between the table's first and last row line must belong to a row;
     every word under the table must be the page footer (date, page number, document id);
  4. each word goes to the column whose heading it is nearest to, and must lie inside that column's ruled borders (so a word can't
     straddle two cells without the script noticing).
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

SCALE = 110.0 / 72.0  # pixels per point at 110 dpi
# The booklet this reader is set for (the footer of every table page prints DATE, the page number and "Document : VERSION").
DATE, VERSION, PAGES = "01-09-2026", "V48", 20
PICTURE_PAGES = {1: ["Allergen", "Information", "Booklet"], 2: [], 19: [], 20: []}  # the only words they may hold
PAGE_OFFSET = 2                   # the footer numbers the table pages 1-16 (PDF pages 3-18)
NUM_LO, NUM_HI = 75.0, 99.0       # the calorie number column, points (V42: 112-133); the name column ends at NUM_LO
HDR_X0 = 115.0                    # column headings start right of this (V42: 150; V48's "No Allergens" heading starts at 122)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
# The 14 allergen columns in print order: (key, header word that belongs to the column)
COLUMNS = [("celery", "CELERY"), ("gluten", "CEREALS"), ("crustaceans", "CRUSTA-"), ("eggs", "EGGS"), ("fish", "FISH"),
           ("lupin", "LUPIN"), ("milk", "MILK"), ("molluscs", "MOLLUSCS"), ("mustard", "MUSTARD"), ("nuts", "NUTS"),
           ("peanuts", "PEANUTS"), ("sesame", "SESAME"), ("soya", "SOYA"), ("sulphites", "SULPHITES")]


class Pgm:
    """A binary PGM (P5) page image."""

    def __init__(self, data: bytes) -> None:
        m = re.match(rb"P5\s+(\d+)\s+(\d+)\s+255\s", data)
        if not m:
            raise SystemExit("pdftoppm did not give a P5 PGM image")
        self.w, self.h, self.data, self.off = int(m.group(1)), int(m.group(2)), data, m.end()

    def dark_fraction(self, y: int, x0: int, x1: int) -> float:
        if not (0 <= y < self.h):
            return 0.0
        row = self.data[self.off + y * self.w + x0: self.off + y * self.w + x1]
        return sum(1 for v in row if v < 110) / max(1, len(row))

    def dark_fraction_col(self, x: int, y0: int, y1: int) -> float:
        if not (0 <= x < self.w):
            return 0.0
        col = self.data[self.off + y0 * self.w + x: self.off + y1 * self.w + x: self.w]
        return sum(1 for v in col if v < 110) / max(1, len(col))


def _lines(img: Pgm, x0_pt: float, x1_pt: float) -> list:
    """Centres (points) of the horizontal ruled lines drawn across x0_pt..x1_pt."""
    ys = [y for y in range(img.h) if img.dark_fraction(y, int(x0_pt * SCALE), int(x1_pt * SCALE)) >= 0.9]
    out, run = [], []
    for y in ys:
        if run and y - run[-1] > 1:
            out.append(sum(run) / len(run) / SCALE)
            run = []
        run.append(y)
    if run:
        out.append(sum(run) / len(run) / SCALE)
    return out


def _vlines(img: Pgm, y0_pt: float, y1_pt: float, x0_pt: float, x1_pt: float) -> list:
    """Centres (points) of the vertical ruled lines drawn down y0_pt..y1_pt, between x0_pt and x1_pt (V48, refresh of 2026-11-17:
    the cell borders are read from the page's own lines, because V48's columns differ in width and a heading's midpoint is not a border)."""
    a, b = int(y0_pt * SCALE) + 2, int(y1_pt * SCALE) - 2
    xs = [x for x in range(int(x0_pt * SCALE), int(x1_pt * SCALE)) if img.dark_fraction_col(x, a, b) >= 0.9]
    out, run = [], []
    for x in xs:
        if run and x - run[-1] > 1:
            out.append(sum(run) / len(run) / SCALE)
            run = []
        run.append(x)
    if run:
        out.append(sum(run) / len(run) / SCALE)
    return out


def _cell_text(ws: list) -> str:
    return " ".join(w["t"] for w in sorted(ws, key=lambda w: (round(w["y0"] / 4), w["x0"])))


def read_rows(pdf: Path) -> list:
    """-> one dict per table row: page, name (printed, wrapped lines joined), kcal ("1039" / "n/a"), unit ("kcal" / "n/a"),
    noall (text of the No Allergens cell), cells {key: printed text}, header (the table's own heading, e.g. "Pasties")."""
    text = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = text.split("<page ")[1:]
    rows = []
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["pdftoppm", "-r", "110", "-gray", str(pdf), str(Path(td) / "pg")], check=True, capture_output=True)
        imgs = {int(f.stem.split("-")[1]): Pgm(f.read_bytes()) for f in Path(td).glob("pg-*.pgm")}
    if len(pages) != len(imgs):
        raise SystemExit("page count and rendered page count differ")
    if len(pages) != PAGES:
        raise SystemExit(f"the booklet has {len(pages)} pages, expected {PAGES}: layout or version changed")
    for pno, pg in enumerate(pages, 1):
        words = [dict(x0=float(a), y0=float(b), x1=float(c), y1=float(d), t=html.unescape(t)) for a, b, c, d, t in WORD.findall(pg)]
        if pno in PICTURE_PAGES:
            if [w["t"] for w in words] != PICTURE_PAGES[pno]:
                raise SystemExit(f"Page {pno} should be a picture page reading {PICTURE_PAGES[pno]}, but holds {[w['t'] for w in words[:8]]}")
            continue
        rows += _read_page(pno, words, imgs[pno])
    return rows


def _read_page(pno: int, words: list, img: Pgm) -> list:
    # the page footer (date, printed page number, "Document : V48") may touch the table's bottom line: take it out first
    foot_ok = {DATE, str(pno - PAGE_OFFSET), "Document", ":", VERSION}
    footer = [w for w in words if w["y0"] > 555 and w["t"] in foot_ok]
    if sorted(w["t"] for w in footer) != sorted(foot_ok):
        raise SystemExit(f"Page {pno}: the footer reads {sorted(w['t'] for w in footer)}, expected {sorted(foot_ok)}: layout or version changed")
    gone = {id(w) for w in footer}
    words = [w for w in words if id(w) not in gone]
    # header cells: the column headings (printed in capitals, 6.4 pt) give each column's centre
    kc = [w for w in words if w["t"] == "Kcal"]
    if len(kc) != 1:
        raise SystemExit(f"Page {pno}: expected one 'Kcal' heading, found {len(kc)}: the layout changed")
    top_hdr = kc[0]["y0"] - 40
    hdr = [w for w in words if top_hdr <= w["y0"] and w["y1"] <= kc[0]["y1"] + 25 and w["x0"] > HDR_X0]
    cent = {}
    for key, first in COLUMNS:
        c = [w for w in hdr if w["t"] == first]
        if len(c) != 1:
            raise SystemExit(f"Page {pno}: heading {first!r} found {len(c)} times: the layout changed")
        cent[key] = (c[0]["x0"] + c[0]["x1"]) / 2
    al = [w for w in hdr if w["t"] == "Allerg"]
    if len(al) != 1:
        raise SystemExit(f"Page {pno}: 'No Allergens' heading not found")
    cent["noall"] = (al[0]["x0"] + al[0]["x1"]) / 2
    order = ["noall"] + [k for k, _ in COLUMNS]
    num_lo, num_hi = NUM_LO, NUM_HI   # the calorie number column (points); the word "kcal" sits right of it
    name_hi = num_lo
    # ruled lines across the whole table
    lines = _lines(img, 52.0, 810.0)
    if len(lines) < 4:
        raise SystemExit(f"Page {pno}: ruled lines not found")
    kcal_tokens = sorted([w for w in words if num_lo <= (w["x0"] + w["x1"]) / 2 < num_hi and re.fullmatch(r"\d+|n/a", w["t"])
                          and w["y0"] > kc[0]["y1"]], key=lambda w: w["y0"])
    if not kcal_tokens:
        raise SystemExit(f"Page {pno}: no calorie values")
    # the heading cell of the table ("Pasties", "Hot Drinks"): the words left of the Kcal heading, above the first row
    first_top = max(l for l in lines if l < (kcal_tokens[0]["y0"] + kcal_tokens[0]["y1"]) / 2)
    header = _cell_text([w for w in words if (w["x0"] + w["x1"]) / 2 < name_hi and kc[0]["y0"] - 15 <= w["y0"] < first_top])
    rows = []
    # V48: every band between the first row's top line and the table's bottom border is a row; a row may print no calorie value at
    # all (an empty calorie cell, e.g. "Dirty Chai Latte"): its kcal is "" and it must print no unit either
    bands = [(a, b) for a, b in zip(lines[:-1], lines[1:]) if a >= first_top - 0.5]
    if not bands:
        raise SystemExit(f"Page {pno}: no row bands found")
    per_band = [[w for w in kcal_tokens if a < (w["y0"] + w["y1"]) / 2 < b] for a, b in bands]
    if sum(len(x) for x in per_band) != len(kcal_tokens) or any(len(x) > 1 for x in per_band):
        raise SystemExit(f"Page {pno}: {len(bands)} row bands and {len(kcal_tokens)} calorie values do not pair up: ruled lines or layout changed")
    bottom = bands[-1][1]
    # column borders: the vertical ruled lines drawn down the table body; each heading must sit between two of them, and the
    # 15 columns (No Allergens + 14 allergens) must be 15 neighbouring cells with no line between a heading and its borders
    vl = _vlines(img, first_top, bottom, cent["noall"] - 40, cent["sulphites"] + 45)
    edges = []
    for k in order:
        left = [x for x in vl if x < cent[k]]
        right = [x for x in vl if x > cent[k]]
        if not left or not right:
            raise SystemExit(f"Page {pno}: no ruled border round the {k} column: layout changed")
        if edges and abs(edges[-1] - max(left)) > 0.5:
            raise SystemExit(f"Page {pno}: the {k} column does not start where the previous one ends: layout changed")
        if not edges:
            edges.append(max(left))
        edges.append(min(right))
    if len(set(round(e, 1) for e in edges)) != len(order) + 1:
        raise SystemExit(f"Page {pno}: two headings share one cell: layout changed")
    unit_hi = edges[0]
    used = set()
    for (a, b), toks in zip(bands, per_band):
        tok = toks[0] if toks else {"t": ""}
        inside = [w for w in words if a < (w["y0"] + w["y1"]) / 2 < b]
        cols = {}
        for w in inside:
            xc = (w["x0"] + w["x1"]) / 2
            if xc < name_hi:
                col = "name"
            elif xc < num_hi:
                col = "kcal"
            elif xc < unit_hi:
                col = "unit"
            else:
                col = min(order, key=lambda k: abs(cent[k] - xc))
                i = order.index(col)
                if not (edges[i] - 0.5 <= w["x0"] and w["x1"] <= edges[i + 1] + 0.5):
                    raise SystemExit(f"Page {pno}: the word {w['t']!r} straddles the border of the {col} column: layout changed")
            cols.setdefault(col, []).append(w)
            used.add(id(w))
        if [w["t"] for w in cols.get("kcal", [])] != ([tok["t"]] if tok["t"] else []):
            raise SystemExit(f"Page {pno}: the calorie cell of the row at y={a:.0f} holds {[w['t'] for w in cols.get('kcal', [])]}")
        unit = _cell_text(cols.get("unit", []))
        if not cols.get("name"):
            raise SystemExit(f"Page {pno}: the row at y={a:.0f} has no name: ruled lines or layout changed")
        if not tok["t"]:
            if unit:
                raise SystemExit(f"Page {pno}: the row at y={a:.0f} prints the unit {unit!r} but no calorie value")
        elif unit not in ("kcal", "n/a"):
            raise SystemExit(f"Page {pno}: the unit cell next to {tok['t']!r} reads {unit!r}, expected 'kcal'")
        if unit == "n/a" and tok["t"] != "n/a":
            raise SystemExit(f"Page {pno}: calorie value {tok['t']!r} is followed by {unit!r}")
        rows.append(dict(page=pno, name=_cell_text(cols.get("name", [])), kcal=tok["t"], unit=unit, header=header,
                         noall=_cell_text(cols.get("noall", [])), cells={k: _cell_text(cols.get(k, [])) for k, _ in COLUMNS}))
    # nothing else may sit inside the table body, and nothing under it except the page footer
    body_top = bands[0][0]
    stray = [w["t"] for w in words if body_top < (w["y0"] + w["y1"]) / 2 < bottom and id(w) not in used]
    if stray:
        raise SystemExit(f"Page {pno}: words inside the table that belong to no row: {stray[:8]}")
    return rows
