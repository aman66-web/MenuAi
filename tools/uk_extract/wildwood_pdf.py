"""Read Wildwood's official calorie sheets (Excel exports with a text layer) into dishes with their printed calories.

Used by tools/uk_extract/wildwood.py. Requires poppler (`pdftotext`, `pdfinfo`) and nothing else. Nothing is converted, rounded or
estimated here: calories come back as the digits printed ("1,306" -> "1306": the thousands comma is punctuation, not a conversion).

Each sheet ("Main Menu Calories", "Lunch Set", "Evening Set", "Specials") is a list of dishes under section headings. A heading line is
`<Section>   Calories`; a dish line is `<NAME>   <number>`. Pages are read with `pdftotext -layout`. Any other non-blank line that is
not known page furniture (the printed date, "Page N of M", "Set Lunch Menu:", "Evening Set Menu:", "Specials:") stops the run, so a
changed layout never attaches a number to the wrong dish. (Cross-checked once by pairing each number with the words on its own line
from `pdftotext -bbox`: identical on all 195 rows of the five sheets.)
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

HEADING = re.compile(r"^\s*(?P<section>\S.*?)\s{2,}Calories\s*$")
DISH = re.compile(r"^\s*(?P<name>\S.*?)\s{2,}(?P<kcal>\d{1,3}(?:,\d{3})*|\d+)\s*$")
FURNITURE = re.compile(r"^\s*(?:Page \d+ of \d+|\d\d\.\d\d\.\d{4}|Set Lunch Menu:|Evening Set Menu:|Specials:)\s*$")


def _run(*cmd: str) -> str:
    return subprocess.run(list(cmd), check=True, capture_output=True, text=True).stdout


def page_count(pdf: Path) -> int:
    return int(re.search(r"^Pages:\s+(\d+)", _run("pdfinfo", str(pdf)), re.M).group(1))


def calorie_rows(pdf: Path) -> list[dict]:
    """[{"section", "name", "kcal", "page"}] in printed order. kcal is the printed digits without the thousands comma."""
    rows: list[dict] = []
    for page in range(1, page_count(pdf) + 1):
        section = None
        for line in _run("pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-").splitlines():
            if not line.strip() or FURNITURE.match(line):
                continue
            h = HEADING.match(line)
            if h:
                section = " ".join(h.group("section").split())
                continue
            d = DISH.match(line)
            if d and section:
                rows.append({"section": section, "name": " ".join(d.group("name").split()), "kcal": d.group("kcal").replace(",", ""),
                             "page": page})
                continue
            raise SystemExit(f"{pdf.name} page {page}: unexpected line {line!r}: the calorie sheet's layout changed, re-check the reader")
    return rows
