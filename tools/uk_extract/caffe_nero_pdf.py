"""Read Caffe Nero UK's official "Allergen, Nutritional & Ingredient Guide (GB)" PDF into rows of printed numbers.

Used by tools/uk_extract/caffe_nero.py only to CROSS-CHECK the website numbers (`--guide`); nothing from the PDF is
written to data/source. Requires `pdftotext` (poppler). Numbers come back exactly as printed (strings such as "0.0").

Food pages (5-21): one block per product, nine labelled rows (KJ, Kcal, Fat, Sat, Carbs, Sugar, Fibre, Protein, Salt),
each with a per-100g and a per-portion value, then "Portion weight (g)". Drink pages (22-44): one row per drink (and per
size) with 18 numbers: the nine values per 100 ml, then the same nine per product.
"""
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
LABELS = ("KJ", "Kcal", "Fat", "Sat", "Carbs", "Sugar", "Fibre", "Protein", "Salt")
_LABEL_ROW = re.compile(r"\b(KJ|Kcal|Fat|Sat|Carbs|Sugar|Fibre|Protein|Salt)\s+(" + NUM + r"|-|Tr)\s+(" + NUM + r"|-|Tr)\s*$")
_WEIGHT_ROW = re.compile(r"Portion\s+weight\s+\(g\)\s+(" + NUM + r")\s*$")
_DRINK_ROW = re.compile(r"((?:" + NUM + r"\s+){17}" + NUM + r")\s*$")
FOOD_PAGES = range(5, 22)
DRINK_PAGES = range(22, 45)


def _page(pdf: Path, page: int) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         capture_output=True, text=True, check=True).stdout
    return out.split("\n")


def read_guide(pdf: Path) -> list[dict]:
    """Every nutrition block/row as {"page", "kind", "portion": {label: printed value}}; "portion" = per product."""
    rows: list[dict] = []
    for page in FOOD_PAGES:
        cur = None
        for line in _page(pdf, page):
            m = _LABEL_ROW.search(line)
            if m:
                if m.group(1) == "KJ":
                    cur = {"page": page, "kind": "food", "portion": {}}
                    rows.append(cur)
                if cur is not None and m.group(1) not in cur["portion"]:
                    cur["portion"][m.group(1)] = m.group(3)
                continue
            if _WEIGHT_ROW.search(line):
                cur = None
    for page in DRINK_PAGES:
        for line in _page(pdf, page):
            m = _DRINK_ROW.search(line)
            if m:
                nums = m.group(1).split()
                rows.append({"page": page, "kind": "drink", "portion": dict(zip(LABELS, nums[9:]))})
    return rows
