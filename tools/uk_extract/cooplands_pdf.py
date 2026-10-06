"""Read Cooplands' official "Allergen and Nutrition Information" PDF into rows of printed numbers.

Used by tools/uk_extract/cooplands.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.25", "14049"); nothing is converted, rounded or estimated here.

The guide is ONE page (an Excel export, A4 landscape, about 3 pt type), one product per line, grouped under single-cell
section lines (SEASONAL, SANDWICH, SALAD, SAVOURIES, BREAD, CONFECTIONERY, PACKS, CREAMS). The columns, left to right:

    Product Name; Contains; May Contain; Vegetarians; Vegans; Weight; KCAL_Per (a note on what "per product" means for
    that row, e.g. "per cake", "Per 1/6 Slice", often empty);
    Energy kJ per 100g, kJ per product, kcal per 100g, kcal per product; Fat per 100g, per product;
    saturates per 100g, per product; Carbohydrates per 100g, per product; sugars per 100g, per product;
    Protein per 100g, per product; Salt per 100g, per product.

A few rows print fewer than 16 numbers (a cell is simply left out), so a number is assigned to its column by the
right-hand edge of the word (every numeric column is right-aligned), never by counting. Only the per-product columns
are used for the menu data: per-100g values are not per-serving values.
"""
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")

# (key, right edge x of the column in points). Measured from the PDF; tolerance below.
NUM_COLUMNS = (
    ("kj100", 348.6), ("kj", 377.2), ("kcal100", 404.9), ("kcal", 435.6),
    ("fat100", 453.2), ("fat", 473.6), ("sat100", 507.4), ("sat", 544.1),
    ("carbs100", 573.7), ("carbs", 606.5), ("sugars100", 637.4), ("sugars", 671.0),
    ("protein100", 692.8), ("protein", 717.6), ("salt100", 735.9), ("salt", 756.9),
)
EDGE_TOLERANCE = 1.2
# Left edges of the text columns (points).
X_CONTAINS, X_MAY, X_VEG, X_VEGAN, X_WEIGHT, X_PER, X_NUMBERS = 69.5, 138.5, 263.0, 280.5, 293.0, 305.3, 323.0
LINE_TOLERANCE = 1.0
SECTION_HEADINGS = {"SEASONAL", "SANDWICH", "SALAD", "SAVOURIES", "BREAD", "CONFECTIONERY", "PACKS", "CREAMS"}


def _words(pdf: Path) -> list[tuple[float, float, float, float, str]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]


def read_rows(pdf: Path) -> list[dict]:
    """One dict per product in printed order: {"section", "name", "contains", "veg", "vegan", "weight", "per",
    <the 16 NUM_COLUMNS keys: printed text, only those present>}. Raises if a number fits no column."""
    words = _words(pdf)
    lines: list[list[tuple]] = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) <= LINE_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
    rows: list[dict] = []
    section = ""
    for line in lines[1:]:  # line 0 is the header
        line.sort(key=lambda w: w[0])
        text = " ".join(w[4] for w in line).strip()
        if text in SECTION_HEADINGS:
            section = text
            continue
        row = {"section": section, "name": "", "contains": "", "veg": "", "vegan": "", "weight": "", "per": ""}
        parts: dict[str, list[str]] = {k: [] for k in ("name", "contains", "veg", "vegan", "weight", "per")}
        for w in line:
            x0, _, x1, _, t = w
            if x0 >= X_NUMBERS:
                key = next((k for k, edge in NUM_COLUMNS if abs(x1 - edge) <= EDGE_TOLERANCE), None)
                if key is None or not NUMBER.match(t) or key in row:
                    raise ValueError(f"{row['name'] or text[:40]!r}: cannot place {t!r} (right edge {x1:.1f}) in a numeric column")
                row[key] = t
            elif x0 < X_CONTAINS:
                parts["name"].append(t)
            elif x0 < X_VEG:
                parts["contains"].append(t)  # "Contains" and "May Contain" text together
            elif x0 < X_VEGAN:
                parts["veg"].append(t)
            elif x0 < X_WEIGHT:
                parts["vegan"].append(t)
            elif x0 < X_PER:
                parts["weight"].append(t)
            else:
                parts["per"].append(t)
        for k, v in parts.items():
            row[k] = " ".join(v)
        if not row["name"]:
            raise ValueError(f"A line without a product name: {text[:80]!r}")
        rows.append(row)
    return rows
