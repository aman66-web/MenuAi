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


# ---------------------------------------------------------------- November 2026 layout ("SBARRO UK | NUTRITION GUIDE")
# From the November 2026 guide on, the PDF prints PER SERVING ONLY: Category, Item Name, Serving Size, Weight (g), then
# Energy (kcal), Fat, Saturates, Carbs, Sugars, Protein, Salt per serving (no per-100 g columns), on pages 1-4, followed by an
# allergen table (Category, Item Name, Contains, May Contain) on pages 5-7 that is not read here. Positions measured on the
# November 2026 file (the same on every nutrition page); the reader stops if a header word has moved.
V2_HEADERS = {"Weight": 360.4, "Energy": 408.9, "Fat": 476.5, "Saturates": 520.5, "Carbs": 581.7, "Sugars": 632.7,
              "Protein": 686.0, "Salt": 743.3}
V2_RIGHT = (457.0, 510.0, 567.0, 620.0, 673.0, 727.0, 776.0)   # right edges of the 7 per-serving columns (right-aligned numbers)
V2_FIELDS = ("kcal", "fat", "sat", "carbs", "sugars", "protein", "salt")
V2_CAT_X_MAX, V2_NAME_X_MAX, V2_SERVING_X_MAX, V2_WEIGHT_X_MAX = 112.0, 278.0, 355.0, 400.0
V2_NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
V2_WEIGHT = re.compile(r"^\d+(?:\.\d+)?(?:ml|g)?$")


def _join_lines(ws: list[dict]) -> str:
    """Words of one cell, line by line (top to bottom), each line left to right."""
    grouped: list[list[dict]] = []
    for w in sorted(ws, key=lambda w: (w["y"], w["x"])):
        if grouped and abs(w["y"] - grouped[-1][0]["y"]) < 1.2:
            grouped[-1].append(w)
        else:
            grouped.append([w])
    return " ".join(" ".join(w["t"] for w in sorted(g, key=lambda w: w["x"])) for g in grouped)


def read_rows_v2(pdf: Path) -> list[dict]:
    """Rows of the November 2026 layout in reading order: {page, category, name, serving, weight, kcal, fat, sat, carbs, sugars,
    protein, salt}, every value the printed text (numbers exactly as printed, e.g. "894.71", "500ml")."""
    words = _words(pdf)
    rows: list[dict] = []
    nutrition_pages = 0
    for page in sorted({w["page"] for w in words}):
        pw = [w for w in words if w["page"] == page]
        energy = [w for w in pw if w["t"] == "Energy"]
        if not energy:
            if not any(w["t"] == "Contains" for w in pw):
                raise PdfLayoutError(f"page {page} has neither the nutrition header (Energy) nor the allergen header (Contains)")
            continue                                   # the allergen table: not read here
        nutrition_pages += 1
        if len(energy) != 1:
            raise PdfLayoutError(f"page {page}: 'Energy' printed {len(energy)} times")
        head_y = energy[0]["y"]
        for label, x in V2_HEADERS.items():
            hits = [w for w in pw if w["t"] == label and abs(w["y"] - head_y) < 6]
            if len(hits) != 1 or abs(hits[0]["x"] - x) > 3:
                raise PdfLayoutError(f"page {page}: header {label!r} not found at x={x} (found {[round(h['x'], 1) for h in hits]}): "
                                     "the layout changed, re-measure V2_HEADERS / V2_RIGHT")
        footer = [w for w in pw if w["t"] == "Page"]
        bottom = min(w["y"] for w in footer) - 4 if footer else 10_000.0
        body = [w for w in pw if head_y + 12 < w["y"] < bottom]
        numeric = sorted((w for w in body if w["x"] >= V2_WEIGHT_X_MAX), key=lambda w: w["y"])
        groups: list[list[dict]] = []
        for w in numeric:
            if groups and abs(w["y"] - statistics.mean(g["y"] for g in groups[-1])) <= 3:
                groups[-1].append(w)
            else:
                groups.append([w])
        page_rows = []
        for g in groups:
            y = statistics.mean(w["y"] for w in g)
            cells: list[list[str]] = [[] for _ in V2_RIGHT]
            for w in g:
                right = 2 * w["cx"] - w["x"]
                i = min(range(len(V2_RIGHT)), key=lambda i: abs(V2_RIGHT[i] - right))
                if abs(V2_RIGHT[i] - right) > 6:
                    raise PdfLayoutError(f"page {page}, y={y:.0f}: number {w['t']!r} ends at x={right:.0f}, not under a column")
                cells[i].append(w["t"])
            if not all(len(c) == 1 and V2_NUMBER.match(c[0]) for c in cells):
                raise PdfLayoutError(f"page {page}, y={y:.0f}: a table row does not have one number in each of the 7 columns: {cells}")
            weight = [w["t"] for w in body if V2_SERVING_X_MAX <= w["x"] < V2_WEIGHT_X_MAX and abs(w["y"] - y) <= 3]
            if len(weight) != 1 or not V2_WEIGHT.match(weight[0]):
                raise PdfLayoutError(f"page {page}, y={y:.0f}: the weight cell reads {weight}")
            page_rows.append({"page": page, "y": y, "weight": weight[0], **{f: c[0] for f, c in zip(V2_FIELDS, cells)},
                              "_words": {"category": [], "name": [], "serving": []}})
        if not page_rows:
            raise PdfLayoutError(f"page {page}: a nutrition header but no table rows")
        for w in body:
            if w["x"] >= V2_SERVING_X_MAX:
                continue
            nearest = min(page_rows, key=lambda r: abs(r["y"] - w["y"]))
            if abs(nearest["y"] - w["y"]) > 10:
                raise PdfLayoutError(f"page {page}: text {w['t']!r} at y={w['y']:.0f} is not beside any table row")
            key = "category" if w["x"] < V2_CAT_X_MAX else "name" if w["x"] < V2_NAME_X_MAX else "serving"
            nearest["_words"][key].append(w)
        for r in page_rows:
            for key, ws in r.pop("_words").items():
                r[key] = _join_lines(ws)
        rows += page_rows
    if nutrition_pages == 0:
        raise PdfLayoutError("no page has the November 2026 nutrition header: this is not that layout")
    return rows
