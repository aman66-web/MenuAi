"""Read Greggs' official "Nutritional Information (Guide only)" PDF into rows of printed numbers.

Used by tools/uk_extract/greggs.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.79", "10.0", "23%") so nothing is converted or estimated here.

The guide is one wide table, one product per row, alphabetical. `pdftotext -layout` puts the product name on its
own line directly above the line holding the 26 numbers for that row, and repeats the column headings at the top
of every page. The 26 columns, in order, are:

    portion size (g/ml);
    energy kJ per 100g, kJ per portion, kcal per 100g, kcal per portion, energy % RI;
    fat per 100g, per portion, % RI;  saturates per 100g, per portion, % RI;
    carbohydrate per 100g, per portion, % RI;  sugars per 100g, per portion, % RI;
    fibre per 100g, per portion;  protein per 100g, per portion, % RI;  salt per 100g, per portion, % RI.

Only the per-portion columns are used for the menu data (per-100g values are not per-serving values).
"""
import re
import subprocess
from pathlib import Path

NUM = r"\d+(?:\.\d+)?"
COLUMNS = (
    "portion",
    "kj100", "kj", "kcal100", "kcal", "kcal_ri",
    "fat100", "fat", "fat_ri",
    "sat100", "sat", "sat_ri",
    "carbs100", "carbs", "carbs_ri",
    "sugars100", "sugars", "sugars_ri",
    "fibre100", "fibre",
    "protein100", "protein", "protein_ri",
    "salt100", "salt", "salt_ri",
)
DATA_LINE = re.compile(rf"^\s*(?:{NUM}%?\s+){{{len(COLUMNS) - 1}}}{NUM}%?\s*$")
# Column-heading and legend lines repeated on every page (never a product name).
NOISE = re.compile(
    r"^(Portion|Energy|Size|\(kJ\) Portion|\(g/ml\)|Nutritional Information|Product Name|Information correct|= Hospital Shop)"
)
# The legend printed on page 1 says (HS) = Hospital Shop.
HOSPITAL_SHOP = "(HS)"


def read_text(pdf: Path) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True)
    return out.stdout.split("\n")


def read_rows(pdf: Path) -> list[dict[str, str]]:
    """One dict per product, in printed order: {"name": ..., <COLUMNS>: printed text}."""
    lines = read_text(pdf)
    rows: list[dict[str, str]] = []
    for i, line in enumerate(lines):
        if not DATA_LINE.match(line):
            continue
        j = i - 1
        while j >= 0 and not lines[j].strip():
            j -= 1
        name = lines[j].strip() if j >= 0 else ""
        if not name or NOISE.match(name) or DATA_LINE.match(lines[j]):
            raise ValueError(f"No product name found above the numbers on text line {i + 1}: {line.strip()[:80]}")
        values = line.split()
        rows.append({"name": name, **dict(zip(COLUMNS, values))})
    return rows
