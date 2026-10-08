"""Read The Cornish Bakery's official "Allergen Information" matrix PDF (Document V42, 26-02-2026) into table rows.

Used by tools/uk_extract/cornish_bakery.py. Needs `pdftotext` and `pdftoppm` (poppler); standard library only (Python 3.9).
Numbers are returned exactly as printed (strings such as "1039"); nothing is converted, rounded or estimated here.

The file is 10 landscape A4 pages exported from Excel. Page 1 starts with a paragraph of text; every page then holds ONE table
with the columns  item name | Kcal each (number, then the word "kcal") | No Allergens | 14 allergen columns (Celery ... Sulphites).
A cell is empty, or prints "Contains" / "May Contain" (the gluten cell also names the cereals "Contains Gluten (Wheat, Barley)", the
nuts cell the tree nuts "Contains (Almonds Walnuts)", possibly followed by "May Contain (Hazelnuts)"). The "No Allergens" cell prints
"none" or "See Pack" or nothing. The cells have black borders and no shading, so a row is read by position:

  1. every word of the text layer is found with its box (pdftotext -bbox);
  2. the page is rendered (pdftoppm, 110 dpi, grey) so the table's own ruled lines can be seen: a row is the space between two
     horizontal lines drawn right across the table (text never fills 90% of a pixel row with black);
  3. every row must hold exactly one calorie value ("1039" or "n/a") and the word that follows it; every word between the table's first
     and last row line must belong to a row; every word under the table must be the page footer (date, page number, document id);
  4. each word goes to the column whose header it is nearest to, and must lie inside that column's borders (so a word can't straddle
     two cells without the script noticing).
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

SCALE = 110.0 / 72.0  # pixels per point at 110 dpi
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
# The 14 allergen columns in print order: (key, header word that belongs to the column)
COLUMNS = [("celery", "CELERY"), ("gluten", "CONTAINING"), ("crustaceans", "CRUSTA-"), ("eggs", "EGGS"), ("fish", "FISH"),
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
    for pno, pg in enumerate(pages, 1):
        words = [dict(x0=float(a), y0=float(b), x1=float(c), y1=float(d), t=html.unescape(t)) for a, b, c, d, t in WORD.findall(pg)]
        rows += _read_page(pno, words, imgs[pno])
    return rows


def _read_page(pno: int, words: list, img: Pgm) -> list:
    # the page footer (date, page number, "Document : V42") may touch the table's bottom line (page 3): take it out first
    foot_ok = {"26-02-2026", str(pno), "Document", ":", "V42"}
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
    hdr = [w for w in words if top_hdr <= w["y0"] and w["y1"] <= kc[0]["y1"] + 25 and w["x0"] > 150]
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
    # column borders: halfway between neighbouring headings, the outer ones taken from the same spacing
    mids = [(cent[a] + cent[b]) / 2 for a, b in zip(order[:-1], order[1:])]
    edges = [cent["noall"] - (mids[0] - cent["noall"])] + mids + [cent["sulphites"] + (cent["sulphites"] - mids[-1])]
    num_lo, num_hi = 112.0, 133.0     # the calorie number column (points); the word "kcal" sits right of it
    unit_hi = edges[0]
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
    bands = [(a, b) for a, b in zip(lines[:-1], lines[1:]) if a >= first_top - 0.5]
    # the last row ends at the first line below its calorie value (the table's bottom border)
    last_mid = (kcal_tokens[-1]["y0"] + kcal_tokens[-1]["y1"]) / 2
    bands = [(a, b) for a, b in bands if a < last_mid]
    if len(bands) != len(kcal_tokens):
        raise SystemExit(f"Page {pno}: {len(bands)} row bands but {len(kcal_tokens)} calorie values: ruled lines or layout changed")
    bottom = bands[-1][1]
    used = set()
    for (a, b), tok in zip(bands, kcal_tokens):
        mid = (tok["y0"] + tok["y1"]) / 2
        if not (a < mid < b):
            raise SystemExit(f"Page {pno}: calorie value {tok['t']!r} is not inside its row band {a:.0f}-{b:.0f}")
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
        if [w["t"] for w in cols.get("kcal", [])] != [tok["t"]]:
            raise SystemExit(f"Page {pno}: the calorie cell of the row at y={a:.0f} holds {[w['t'] for w in cols.get('kcal', [])]}")
        unit = _cell_text(cols.get("unit", []))
        if unit not in ("kcal", "n/a"):
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
