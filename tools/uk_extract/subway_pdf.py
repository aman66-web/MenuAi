"""Read Subway UK & ROI's official "Nutrition Information" PDF into sections of rows of printed numbers.

Used by tools/uk_extract/subway.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.64", "2.0", "11.0") so nothing is converted or estimated here.

Every row of the PDF has two blocks of numbers: "Per Serving size" (the first ten columns, which we use) and
"Per 100g" (the last ten, which we only use to cross-check the first block; per-100 g values are never entered).
"""
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
# Column order of both blocks, as printed in the PDF's header.
FIELDS = ("serving_g", "kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")

# name, two or more spaces, ten per-serving numbers, then the per-100 g block (9 or 10 numbers: one printed row has
# an empty per-100 g salt cell).
ROW = re.compile(rf"^\s*(?P<name>\S.*?\S)\s{{2,}}(?P<serv>{NUM}(?:\s+{NUM}){{9}})\s+(?P<per100>{NUM}(?:\s+{NUM}){{8,9}})\s*$")

SECTIONS = [
    "Subs", "Toasties", "Saver Subs", "Wraps", "Salads",                      # page 1
    "Spuds", "Sides", "Protein Pots", "Cookies",                              # page 2
    "BREADS", "PROTEINS", "CHEESE", "VEGETABLES", "SAUCES & CONDIMENTS",      # page 3
    "DUNK POTS", "TOPPINGS", "OTHER",
]


class PdfLayoutChanged(Exception):
    """The PDF no longer looks like the one the script was written for."""


def read_sections(pdf: Path) -> dict[str, list[dict[str, str]]]:
    """Return {section: [row, ...]} in reading order. Each row has `name`, the ten FIELDS as printed, and
    `per100` (the ten per-100 g strings, kept only for cross-checks)."""
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    sections: dict[str, list[dict[str, str]]] = {}
    current: str | None = None
    for line in text.split("\n"):
        flat = " ".join(line.split())
        if flat in SECTIONS:
            if flat in sections:
                raise PdfLayoutChanged(f"section {flat!r} appears twice")
            sections[flat] = []
            current = flat
            continue
        m = ROW.match(line)
        if not m:
            continue
        if current is None:
            raise PdfLayoutChanged(f"a nutrition row appears before the first section heading: {line.strip()[:60]!r}")
        serv = m.group("serv").split()
        per100 = m.group("per100").split()
        if per100[0] != "100":
            raise PdfLayoutChanged(f"row {m.group('name')!r}: the per-100 g block does not start with 100 ({per100[0]!r}); "
                                   "a cell may be empty or the columns moved")
        row = {"name": " ".join(m.group("name").split()), "per100": per100}
        row.update(dict(zip(FIELDS, serv)))
        sections[current].append(row)
    return sections
