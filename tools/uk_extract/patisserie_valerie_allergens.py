"""Read the allergen part of Patisserie Valerie's five official allergen-grid PDFs (Standard, Counter, Kiosk, Drinks, Valerie).

Used by tools/uk_extract/patisserie_valerie.py. Requires `pdftotext` and `pdftocairo` (poppler). Nothing is inferred here: every
allergen word or mark returned is one the PDF prints in that row, and a row whose cells cannot be read with certainty is returned
with a reason (`why`) so the build holds the dish back.

The grid has 21 columns after the Kcal column: Suitable for Vegetarians, Suitable for Vegans, six gluten cereals (Wheat, Rye, Barley,
Oats, Spelt, Kamut), Crustaceans, Eggs, Fish, Peanuts, Soya, Milk, Nuts, Celery, Mustard, Sesame, Sulphites, Lupin, Molluscs, then a
free-text "May contain" column. Each cell holds Y (green fill, the dish contains it), MC (red fill, may contain) or N (white).

Three independent readings are combined, and the row is only readable when they agree:
  1. the text layer: the Y / N / MC word in each cell, tied to its column by the header word's position (not by counting);
  2. the cell's fill colour, read from the page's vector drawing (pdftocairo -svg): green / red / white (checked against rendered pixels
     once by hand during development: 11,900 marks, 18 disagreements, all of which this module reports as unreadable rows);
  3. the "May contain" text, tied to rows by the table's own horizontal borders (so a cell that is merged across several rows, e.g.
     the macarons, applies to every row it spans, and a cell that wraps over two lines is read whole).

A row is NOT readable (returned with `why`) when: a column has no mark (blank cell), a mark's text and fill disagree, a cell has a
fill colour this module does not know, a mark sits between two columns, or the grid holds other stray text.
"""
from __future__ import annotations
import re
import subprocess
import tempfile
from pathlib import Path

import patisserie_valerie_pdf as pdf_reader

COLS = ["veg", "vegan", "wheat", "rye", "barley", "oats", "spelt", "kamut", "crustaceans", "eggs", "fish", "peanuts", "soya", "milk", "nuts",
        "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"]
CEREAL_COLS = ("wheat", "rye", "barley", "oats", "spelt", "kamut")
# the printed header word of each column (Crustaceans is split differently on each PDF: matched by prefix)
HEADER_WORDS = {"Vegetarians": "veg", "Vegetarian": "veg", "Vegans": "vegan", "Wheat": "wheat", "Rye": "rye", "Barley": "barley", "Oats": "oats",
                "Spelt": "spelt", "Kamut": "kamut", "Eggs": "eggs", "Fish": "fish", "Peanuts": "peanuts", "Soya": "soya", "Milk": "milk",
                "Nuts": "nuts", "Celery": "celery", "Mustard": "mustard", "Sesame": "sesame", "Sulphites": "sulphites", "Lupin": "lupin",
                "Molluscs": "molluscs"}
FILL = {(0, 255, 0): "Y", (255, 0, 0): "MC", (255, 255, 255): "N"}
BLACK = (0, 0, 0)
COL_TOL = 8.0   # points between a mark's centre and its column's header centre


def _rects(svg: str) -> list:
    body = svg[svg.find("</defs>"):]
    out = []
    for p in re.findall(r"<path ([^>]*?)/>", body):
        f = re.search(r'fill="rgb\(([\d.]+)%, ([\d.]+)%, ([\d.]+)%\)"', p)
        d = re.search(r' d="([^"]+)"', p)
        if not f or not d:
            continue
        col = tuple(int(round(float(x) * 2.55)) for x in f.groups())
        nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", d.group(1))]
        xs, ys = nums[0::2], nums[1::2]
        out.append((col, min(xs), min(ys), max(xs), max(ys)))
    return out


def _geometry(pdf: Path, pno: int) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        svg = Path(tmp) / "p.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(pno), "-l", str(pno), str(pdf), str(svg)], check=True)
        rects = _rects(svg.read_text(encoding="utf-8"))
    fills = [r for r in rects if r[0] != BLACK]
    hlines = [((r[2] + r[4]) / 2, r[1], r[3]) for r in rects if r[0] == BLACK and (r[3] - r[1]) > 3 * (r[4] - r[2]) and (r[4] - r[2]) < 5]
    vlines = [((r[1] + r[3]) / 2, r[2], r[4]) for r in rects if r[0] == BLACK and (r[4] - r[2]) > 3 * (r[3] - r[1]) and (r[3] - r[1]) < 5]
    return {"fills": fills, "hlines": hlines, "vlines": vlines}


def _header(words: list, first_y: float) -> tuple:
    """-> ({column: header centre x}, may_centre x) from the header words above the first data row."""
    cols: dict = {}
    for w in words:
        if w["yc"] >= first_y - 3 or w["x0"] < 150:
            continue
        key = HEADER_WORDS.get(w["t"])
        if key is None and w["t"].startswith("Crustac"):
            key = "crustaceans"
        if key is None:
            continue
        cols.setdefault(key, []).append((w["x0"] + w["x1"]) / 2)
    out = {}
    for key in COLS:
        vals = cols.get(key, [])
        if not vals or max(vals) - min(vals) > 6:
            raise SystemExit(f"header of column {key!r} not found exactly once: {vals}")
        out[key] = sum(vals) / len(vals)
    may = [(w["x0"] + w["x1"]) / 2 for w in words if w["t"] == "May" and w["yc"] < first_y and w["x0"] > 150]
    if len(may) != 1:
        raise SystemExit("header 'May contain' not found exactly once")
    return out, may[0]


def read_allergen_rows(pdf: Path) -> list:
    """One dict per product row of the PDF, in the order of patisserie_valerie_pdf.read_rows():
    {"file", "page", "y", "name", "cells": {column: "Y"|"N"|"MC"} (text marks), "fills": {column: ...}, "may_text": str,
     "may_cell": (top, bottom), "merged": bool (the may cell spans several rows), "why": reason the row is unreadable or ""}."""
    rows, _ = pdf_reader.read_rows(pdf)
    pages = pdf_reader._pages(pdf)
    out = []
    header = None
    assigned_may: dict = {}
    for pno, words in enumerate(pages, 1):
        prow = [r for r in rows if r["page"] == pno]
        if not prow:
            continue
        geo = _geometry(pdf, pno)
        first_y = min(r["y"] for r in prow)
        if any(w["t"] == "May" and w["yc"] < first_y for w in words):
            header = _header(words, first_y)
        if header is None:
            raise SystemExit(f"{pdf.name} page {pno}: no allergen header found")
        centres, may_c = header
        may_left = max(v[0] for v in geo["vlines"] if v[0] < may_c - 2)
        cover = sorted({round(h[0], 2) for h in geo["hlines"] if h[1] <= may_left + 3 and h[2] >= may_left + 25})
        # the table's last row may have no bottom border in the "May contain" column (Drinks p3): the column's own left border then ends it
        table_bottom = max(v[2] for v in geo["vlines"] if abs(v[0] - may_left) < 1.5)
        if not cover or table_bottom > cover[-1] + 1:
            cover.append(round(table_bottom, 2))
        may_words = [w for w in words if w["x0"] >= may_left - 0.5 and w["yc"] > first_y - 3]
        used = set()
        cells_by_row = []
        for r in prow:
            why = []
            cells, fills = {}, {}
            for x0, x1, t in r["boxes"]:
                xc = (x0 + x1) / 2
                near = sorted(COLS, key=lambda c: abs(centres[c] - xc))
                if abs(centres[near[0]] - xc) > COL_TOL or abs(centres[near[1]] - xc) < abs(centres[near[0]] - xc) + 3:
                    why.append(f"a mark at x={xc:.0f} cannot be tied to one column")
                    continue
                col = near[0]
                if col in cells:
                    why.append(f"two marks in the {col} column")
                    continue
                cells[col] = t
                colours = {f[0] for f in geo["fills"] if f[1] <= xc <= f[3] and f[2] <= r["y"] <= f[4]}
                unknown = colours - set(FILL)
                if unknown:
                    why.append(f"the {col} cell has an unknown fill colour {sorted(unknown)}")
                    fills[col] = "?"
                elif len(colours) > 1:
                    why.append(f"the {col} cell has two fill colours")
                    fills[col] = "?"
                else:
                    fills[col] = FILL[next(iter(colours))] if colours else "N"
                if fills[col] != "?" and fills[col] != t:
                    why.append(f"the {col} cell prints {t} but is filled as {fills[col]}")
            missing = [c for c in COLS if c not in cells]
            if missing:
                why.append("blank cell(s): " + ", ".join(missing))
            if r["other"].strip():
                why.append(f"stray text in the grid: {r['other']!r}")
            top = max([y for y in cover if y <= r["y"]] or [None], key=lambda v: -1e9 if v is None else v)
            bottom = min([y for y in cover if y >= r["y"]] or [None], key=lambda v: 1e9 if v is None else v)
            if top is None or bottom is None:
                raise SystemExit(f"{pdf.name} p{pno}: no borders around the 'May contain' cell of {r['name']!r}")
            cells_by_row.append((r, cells, fills, why, (top, bottom)))
        spans: dict = {}
        for r, cells, fills, why, cell in cells_by_row:
            spans.setdefault(cell, []).append(r["name"])
        for r, cells, fills, why, cell in cells_by_row:
            inside = [w for w in may_words if cell[0] < w["yc"] < cell[1]]
            used.update(id(w) for w in inside)
            lines: list = []
            for w in sorted(inside, key=lambda w: (w["yc"], w["x0"])):
                if lines and abs(lines[-1][0] - w["yc"]) < 2.2:
                    lines[-1][1].append(w["t"])
                else:
                    lines.append([w["yc"], [w["t"]]])
            text = " ".join(" ".join(ws) for _, ws in lines)
            out.append({"file": pdf.name, "page": pno, "y": r["y"], "name": r["name"], "cells": cells, "fills": fills, "may_text": text,
                        "may_cell": cell, "merged": len(spans[cell]) > 1, "why": "; ".join(why)})
        stray = [w for w in may_words if id(w) not in used and w["yc"] > first_y - 3]
        if stray:
            assigned_may[(pdf.name, pno)] = [(w["t"], round(w["yc"], 1)) for w in stray]
    if assigned_may:
        raise SystemExit(f"'May contain' words outside every row's cell: {assigned_may}")
    return out


# ------------------------------------------------------------------------------------------------ rows -> allergens
# Words the chain prints in its "May contain" column that common._A does not know (its own spellings; each is an allergen of the 14).
EXTRA_WORDS = {
    "macadamia/queensland nut": ("nuts", "macadamia"),
    "cashew nut": ("nuts", "cashew"),
    "pecan nut": ("nuts", "pecan"),
    "macadamia nut": ("nuts", "macadamia"),
    "brazil": ("nuts", "brazil nut"),            # the Dark Chocolate Croissant row names its tree nuts by their short names
    "cerals containing gluten": ("gluten", None),   # sic: printed so on the Counter and Kiosk menus' croissant rows
    "kamut (wheat)": ("gluten", "kamut"),
    "spelt (wheat)": ("gluten", "spelt"),
}
KEY_OF_COL = {"crustaceans": "crustaceans", "eggs": "eggs", "fish": "fish", "peanuts": "peanuts", "soya": "soya", "milk": "milk", "nuts": "nuts",
              "celery": "celery", "mustard": "mustard", "sesame": "sesame", "sulphites": "sulphites", "lupin": "lupin", "molluscs": "molluscs"}


def may_text_keys(text: str, where: str) -> set:
    """The allergens named in a "May contain" cell (an unknown word stops the run). 'NONE' means the cell names nothing."""
    from common import allergen_words
    tokens = [t.strip() for t in re.split(r",|;|&|\band\b", text) if t.strip()]
    tokens = [t for t in tokens if t.lower() != "none"]
    keys, _, _ = allergen_words(tokens, where, EXTRA_WORDS)
    return keys


def record(ar: dict) -> dict:
    """A row of read_allergen_rows() -> {"why", "contains", "may_contain", "cereals", "grid_may", "text_may"} (sets of keys).
    contains = every Y cell; may_contain = every MC cell UNION every allergen named in the row's "May contain" cell (both are the guide's
    own may-contain statements; the grid and the text disagree on many rows, so each is published). `why` is set when the row is not readable."""
    if ar["why"]:
        return {"why": ar["why"], "contains": set(), "may_contain": set(), "cereals": set(), "grid_may": set(), "text_may": set()}
    contains, grid_may, cereals = set(), set(), set()
    for col, mark in ar["cells"].items():
        if col in ("veg", "vegan") or mark == "N":
            continue
        key = "gluten" if col in CEREAL_COLS else KEY_OF_COL[col]
        (contains if mark == "Y" else grid_may).add(key)
        if mark == "Y" and col in CEREAL_COLS:
            cereals.add(col)
    text_may = may_text_keys(ar["may_text"], f"{ar['file']} p{ar['page']} {ar['name']!r}")
    return {"why": "", "contains": contains, "may_contain": grid_may | text_may, "cereals": cereals, "grid_may": grid_may, "text_may": text_may}
