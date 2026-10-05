"""Read KFC UK's official "Allergen & Nutrition Information" PDF into ordered rows of printed numbers.

Used by tools/uk_extract/kfc.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "<0.5", "0.50", "2.20") so nothing is converted or estimated here.
"""
import re
import subprocess
import tempfile
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "protein", "salt")
ROW = re.compile(r"\s+".join(f"(?P<{f}>{NUM})" for f in FIELDS) + r"\s+(?P<veg>[✔✖])\s+(?P<vegan>[✔✖])")
# A row whose first number (kJ) wrapped onto the line above leaves 7 numbers on the next line.
ROW7 = re.compile(r"\s+".join(f"(?P<{f}>{NUM})" for f in FIELDS[1:]) + r"\s+(?P<veg>[✔✖])\s+(?P<vegan>[✔✖])")


def _crop(pdf: Path, page: int, side: str) -> list[str]:
    x = 0 if side == "L" else 450
    with tempfile.NamedTemporaryFile(suffix=".txt") as out:
        subprocess.run(
            ["pdftotext", "-layout", "-f", str(page), "-l", str(page), "-x", str(x), "-y", "0", "-W", "456", "-H", "1255", str(pdf), out.name],
            check=True,
        )
        return Path(out.name).read_text(encoding="utf-8").split("\n")


def read_rows(pdf: Path) -> list[dict[str, str]]:
    """Rows in reading order: page 1 left, page 1 right, page 2 left, page 2 right."""
    rows: list[dict[str, str]] = []
    for page in (1, 2):
        for side in ("L", "R"):
            lines = _crop(pdf, page, side)
            for i, line in enumerate(lines):
                m = ROW.search(line)
                if m:
                    rows.append(m.groupdict())
                    continue
                m7 = ROW7.search(line)
                if m7 and i > 0:
                    prev = re.search(rf"({NUM})\s*$", lines[i - 1])
                    if prev:
                        rows.append({"kj": prev.group(1), **m7.groupdict()})
    return rows
