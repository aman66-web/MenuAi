"""Read Patisserie Valerie's official allergen-grid PDFs into rows with their printed Kcal cell (by position).

Used by tools/uk_extract/patisserie_valerie.py. Requires `pdftotext` (poppler). Nothing is converted, rounded or estimated here: the
Kcal cell is returned exactly as printed ("198", "144 per 1 whole", "1 x 116", "see menu", ...), and the interpretation of those
strings lives in patisserie_valerie.py.

The five PDFs (Standard, Counter, Kiosk, Drinks, Valerie) are one wide table each, drawn with a text layer:

    Product | Nutritics Code | Kcal | Suitable for Vegetarians | for Vegans | 6 gluten cereals | 14 more allergen columns | May contain

Each data row has Y / N / MC marks (21 columns, a few rows of the Valerie menu leave Lupin / Molluscs blank), the Product, Code and
Kcal cells are centred in their columns, and section headings are full-width rows with no marks. The table is read by position:

  1. every word of the page is found with its box (pdftotext -bbox-layout);
  2. a data row is a cluster of Y / N / MC words on one baseline;
  3. the page's header cells ("Nutritics", "Kcal") give the centre of the code and kcal columns; a word left of the code column is
     the product name, a word between the code and kcal centres is the code, a word between the kcal centre and the first mark is
     the Kcal cell, and a word right of the last mark is the "May contain" text;
  4. words are tied to the data row on their own baseline (name / code / kcal within 1.9 pt, may-contain text and codes within 4.6 pt
     because those cells can wrap); a Kcal word that sits between two rows belongs to a merged cell and is returned as `loose`;
  5. a line with no marks that starts in the product column is a section heading (the table's own header block is skipped).

Anything that does not fit raises, so a new layout stops the run instead of attaching a number to the wrong product.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
MARKS = ("Y", "N", "MC")
NAME_TOL = 1.9     # points: name / kcal / other cells are centred on the row's baseline
WRAP_TOL = 4.6     # points: code and "May contain" cells can wrap onto two or three lines


def _pages(pdf: Path) -> list:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        words = []
        for m in WORD.finditer(chunk):
            x0, y0, x1, y1 = (float(v) for v in m.groups()[:4])
            words.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "t": html.unescape(m.group(5)), "yc": (y0 + y1) / 2})
        pages.append(words)
    return pages


def _lines(words: list) -> list:
    """Group words into text lines (by baseline) -> list of (yc, words sorted by x)."""
    words = sorted(words, key=lambda w: (w["yc"], w["x0"]))
    lines = []
    for w in words:
        if lines and abs(lines[-1][0] - w["yc"]) < 2.2:
            lines[-1][1].append(w)
        else:
            lines.append([w["yc"], [w]])
    return [(yc, sorted(ws, key=lambda w: w["x0"])) for yc, ws in lines]


def read_rows(pdf: Path) -> tuple:
    """-> (rows, loose) for the whole PDF.

    rows: dicts with file, page, y, section, name, code, kcal (printed text), marks (list of (x0, "Y"/"N"/"MC")), col0 (x of the
          first mark column on the page), may (printed "May contain" text).
    loose: Kcal-column words that sit between rows (merged cells): dicts with file, page, y, text, section.
    """
    rows, loose = [], []
    cal = None
    section = ""
    for pno, words in enumerate(_pages(pdf), 1):
        head = {w["t"]: w for w in words if w["t"] in ("Kcal", "Nutritics")}
        if "Kcal" in head and "Nutritics" in head:
            cal = head
        if cal is None:
            raise SystemExit(f"{pdf.name} page {pno}: no table header found")
        nut, kc = cal["Nutritics"], cal["Kcal"]
        nut_x0 = nut["x0"]
        code_c, kcal_c = (nut["x0"] + nut["x1"]) / 2, (kc["x0"] + kc["x1"]) / 2
        marks = sorted((w for w in words if w["t"] in MARKS and w["x0"] > kc["x1"]), key=lambda w: (w["yc"], w["x0"]))
        if not marks:
            raise SystemExit(f"{pdf.name} page {pno}: no Y/N/MC marks found")
        col0 = min(m["x0"] for m in marks)
        last_x1 = max(m["x1"] for m in marks)
        recs = []
        for m in marks:
            if recs and abs(recs[-1]["y"] - m["yc"]) < 2.0:
                recs[-1]["marks"].append((m["x0"], m["t"]))
            else:
                recs.append({"file": pdf.name, "page": pno, "y": m["yc"], "marks": [(m["x0"], m["t"])], "name": [], "code": [], "kcal": [],
                             "may": [], "other": []})
        mark_ids = {id(m) for m in marks}
        rest = [w for w in words if id(w) not in mark_ids]
        for w in rest:
            cx = (w["x0"] + w["x1"]) / 2
            if w["x0"] >= last_x1 + 2:
                col = "may"
            elif w["x0"] >= col0 - 3:
                col = "other"
            elif cx >= (code_c + kcal_c) / 2:
                col = "kcal"
            elif cx >= nut_x0 - 5:
                col = "code"
            else:
                col = "name"
            w["col"] = col
        placed = set()
        for w in rest:
            lim = WRAP_TOL if w["col"] in ("may", "code") else NAME_TOL
            best = None
            for r in recs:
                d = abs(r["y"] - w["yc"])
                if d <= lim and (best is None or d < abs(best["y"] - w["yc"])):
                    best = r
            if best is not None:
                best[w["col"]].append(w)
                placed.add(id(w))
        # header block = every line down to the one holding "Sulphites" (last header line) before the first data row
        first_y = min(r["y"] for r in recs)
        hdr_end = max([ln[0] for ln in _lines([w for w in rest if w["t"] == "Sulphites" and w["yc"] < first_y])] or [0])
        # words not on a data row: headings (start in the product column), merged Kcal cells, stray codes
        leftover = [w for w in rest if id(w) not in placed and w["yc"] > hdr_end]
        events = [("row", r["y"], r) for r in recs]
        for yc, ws in _lines(leftover):
            first = ws[0]
            if first["col"] == "name":
                events.append(("heading", yc, " ".join(w["t"] for w in ws)))
            elif any(w["col"] == "kcal" for w in ws):
                events.append(("loose", yc, " ".join(w["t"] for w in ws if w["col"] in ("kcal", "code"))))
        events.sort(key=lambda e: e[1])
        for kind, y, obj in events:
            if kind == "heading":
                section = obj
            elif kind == "loose":
                loose.append({"file": pdf.name, "page": pno, "y": y, "text": obj, "section": section})
            else:
                def j(key):
                    return " ".join(w["t"] for w in sorted(obj[key], key=lambda w: (round(w["yc"]), w["x0"])))
                row = {"file": pdf.name, "page": pno, "y": y, "section": section, "name": j("name"), "code": j("code"), "kcal": j("kcal"),
                       "marks": obj["marks"], "col0": col0, "may": j("may"), "other": j("other")}
                # "1 x 207 (half 104)" is cut by the column boundary ("1" lands in the code cell)
                if row["kcal"].startswith("x ") and row["code"].split()[-1:] == ["1"]:
                    row["kcal"] = "1 " + row["kcal"]
                    row["code"] = " ".join(row["code"].split()[:-1])
                rows.append(row)
    return rows, loose
