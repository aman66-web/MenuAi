"""Read Premier Inn's official "Allergy and dietary information" PDFs into ordered rows of printed numbers.

Used by tools/uk_extract/premier_inn.py. Requires `pdftotext` (poppler). All three guides (restaurant menus,
Unlimited Cooked Breakfast, Hub by Premier Inn) share one layout: a grey item-name line, a "Contains:" line, then a
table whose "Per Portion:" row reads "<kJ> kJ / <kcal> kcal  <fat> g  <sat> g  <carbs> g  <sugars> g  <protein> g  <salt> g".
Numbers are returned exactly as printed (strings such as "16.5", "0.00") so nothing is converted or estimated here.
"""
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
FIELDS = ("fat", "sat", "carbs", "sugars", "protein", "salt")
ROW = re.compile(rf"(?P<kj>{NUM}) kJ / (?P<kcal>{NUM}) kcal" + "".join(rf"\s+(?P<{f}>{NUM}) g" for f in FIELDS))


def _pages(pdf: Path) -> list[str]:
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return text.split("\f")


def read_rows(pdf: Path) -> list[dict]:
    """One dict per nutrition table, in reading order: page, headings (grey section lines above the item name, usually
    none), printed_name (as printed, including a trailing " - V" / " - VE" mark) and the printed numbers."""
    rows: list[dict] = []
    for page_no, text in enumerate(_pages(pdf), 1):
        lines = text.split("\n")
        pending: list[str] = []  # non-empty lines since the previous table on this page
        i = 0
        while i < len(lines):
            line = lines[i]
            if re.match(r"^\s*Per Portion:", line):
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                m = ROW.search(lines[j]) if j < len(lines) else None
                if not m:
                    raise ValueError(f"{pdf.name} page {page_no}: a 'Per Portion' row has no readable numbers: {lines[j:j + 1]!r}")
                contains = next((k for k, p in enumerate(pending) if re.match(r"^\s*Contains:", p)), None)
                if contains is None or contains == 0:
                    raise ValueError(f"{pdf.name} page {page_no}: a nutrition table has no item name above it (layout changed?)")
                head = [re.sub(r"\s+", " ", re.sub(r"\s{3,}V$", "", h.strip())) for h in pending[:contains]]
                rows.append({"page": page_no, "headings": head[:-1], "printed_name": head[-1], **m.groupdict()})
                pending = []
                i = j + 1
                continue
            if line.strip():
                pending.append(line)
            i += 1
    return rows
