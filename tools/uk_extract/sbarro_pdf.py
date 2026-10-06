"""Read Sbarro UK's official "UK Nutritional & Allergen Guide" PDF into ordered rows of printed numbers.

Used by tools/uk_extract/sbarro.py. Requires `pdftotext` (poppler 21 or newer, for -tsv word positions).

The PDF is an Excel export: one table row per item, 15 numeric columns in this fixed order

    weight (g), then for each of kcal, fat, saturates, carbs, sugars, protein, salt: per 100 g, per serving

followed by allergen ticks (not read here). Names and serving sizes wrap over several lines. Words are placed by their
position on the page: the 15 numbers of a row share one y, and the name / serving words belong to the nearest row.
Numbers are returned exactly as printed (strings such as "1500", "27.6875", "500ml"); nothing is converted here.
"""
import csv
import io
import re
import statistics
import subprocess
from pathlib import Path

# Column centres (pt) of the 15 numeric columns, measured on the August 2026 file; a column is the nearest centre.
CENTERS = [130 + 23.6 * i for i in range(15)]
NUM_X = (118, 476)          # numeric block (the allergen ticks start to the right of it)
NAME_X_MAX = 93             # name column is left of this, the serving column between this and NUM_X[0]
HEADINGS = {"Pizza", "Sides", "Sauces", "Beverages"}   # section headings that sit in the first column, alone on a line
NUMBER = re.compile(r"^<?\d+(?:\.\d+)?(?:ml|g)?$")

FIELDS = ("weight", "kcal100", "kcal", "fat100", "fat", "sat100", "sat", "carbs100", "carbs",
          "sugars100", "sugars", "protein100", "protein", "salt100", "salt")


class PdfLayoutError(RuntimeError):
    pass


def _words(pdf: Path) -> list[dict]:
    out = subprocess.run(["pdftotext", "-tsv", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    words = []
    for r in csv.DictReader(io.StringIO(out), delimiter="\t", quoting=csv.QUOTE_NONE):
        if r["level"] != "5" or not r["text"].strip():
            continue
        x, w, y, h = float(r["left"]), float(r["width"]), float(r["top"]), float(r["height"])
        words.append({"page": int(r["page_num"]), "cx": x + w / 2, "x": x, "y": y + h / 2, "t": r["text"]})
    return words


def read_rows(pdf: Path) -> list[dict]:
    """Data rows in reading order (page by page, top to bottom): {page, name, serving, <15 numeric fields>}."""
    words = _words(pdf)
    numeric = [w for w in words if NUM_X[0] <= w["cx"] <= NUM_X[1]]
    groups: list[tuple[int, list[dict]]] = []
    for page in sorted({w["page"] for w in numeric}):
        cur: list[dict] = []
        for w in sorted((w for w in numeric if w["page"] == page), key=lambda w: w["y"]):
            if cur and abs(w["y"] - statistics.mean(c["y"] for c in cur)) > 3:
                groups.append((page, cur))
                cur = []
            cur.append(w)
        if cur:
            groups.append((page, cur))

    rows: list[dict] = []
    for page, cur in groups:
        cells: list[list[str]] = [[] for _ in range(15)]
        for w in sorted(cur, key=lambda w: w["x"]):
            cells[min(range(15), key=lambda i: abs(CENTERS[i] - w["cx"]))].append(w["t"])
        is_num = [bool(c) and all(NUMBER.match(t) for t in c) for c in cells]
        if all(is_num) and all(len(c) == 1 for c in cells):
            rows.append({"page": page, "y": statistics.mean(c["y"] for c in cur), **{f: c[0] for f, c in zip(FIELDS, cells)}})
        elif sum(is_num) >= 3:
            raise PdfLayoutError(f"page {page}, y={cur[0]['y']:.0f}: a table row has {sum(is_num)} of 15 numeric cells "
                                 f"({[' '.join(c) for c in cells]}). The layout changed or a cell is blank: re-check the PDF.")

    for page in {r["page"] for r in rows}:
        page_rows = [r for r in rows if r["page"] == page]
        lines: dict[int, dict[str, list[dict]]] = {id(r): {"name": [], "serving": []} for r in page_rows}
        for w in words:
            if w["page"] != page or w["cx"] >= NUM_X[0]:
                continue
            nearest = min(page_rows, key=lambda r: abs(r["y"] - w["y"]))
            if abs(nearest["y"] - w["y"]) <= 16:
                lines[id(nearest)]["name" if w["cx"] < NAME_X_MAX else "serving"].append(w)
        for r in page_rows:
            for key in ("name", "serving"):
                ws = sorted(lines[id(r)][key], key=lambda w: (w["y"], w["x"]))
                grouped: list[list[dict]] = []
                for w in ws:   # words on one printed line share a y within ~1 pt
                    if grouped and abs(w["y"] - grouped[-1][0]["y"]) < 1.2:
                        grouped[-1].append(w)
                    else:
                        grouped.append([w])
                texts = [" ".join(w["t"] for w in sorted(g, key=lambda w: w["x"])) for g in grouped]
                if key == "name":   # a lone "Pizza"/"Sides"/... line in the item column is a section heading, not a name
                    texts = [t for t in texts if t not in HEADINGS]
                r[key] = " ".join(texts)
    return rows


def norm(text: str) -> str:
    """Printed name/serving text with all whitespace removed, so wrap points ('Stromboli' / 'ni') don't matter."""
    return re.sub(r"\s+", "", text)
