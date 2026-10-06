"""Read Premier Inn's official "Allergy and dietary information" PDFs into ordered rows of printed numbers.

Used by tools/uk_extract/premier_inn.py. Requires `pdftotext` (poppler). All three guides (restaurant menus,
Unlimited Cooked Breakfast, Hub by Premier Inn) share one layout: a grey item-name line, a "Contains:" line, then a
table whose "Per Portion:" row reads "<kJ> kJ / <kcal> kcal  <fat> g  <sat> g  <carbs> g  <sugars> g  <protein> g  <salt> g".
Numbers are returned exactly as printed (strings such as "16.5", "0.00") so nothing is converted or estimated here.

Allergens: each item's "Contains:" (left) and "May Contain:" (right) columns are returned as printed text (lines joined,
nothing interpreted); premier_inn.py turns the printed words into allergen keys.
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
FIELDS = ("fat", "sat", "carbs", "sugars", "protein", "salt")
ROW = re.compile(rf"(?P<kj>{NUM}) kJ / (?P<kcal>{NUM}) kcal" + "".join(rf"\s+(?P<{f}>{NUM}) g" for f in FIELDS))


def _pages(pdf: Path) -> list[str]:
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return text.split("\f")


def _allergen_columns(block: list[str], where: str) -> tuple[str, str]:
    """The lines from "Contains:" down to the Energy header -> (contains text, may-contain text), as printed. The two
    columns are told apart by position: text starting at (or right of) the "May Contain:" label belongs to that column."""
    first = block[0]
    x = first.find("May Contain:")
    if x < 0:
        raise ValueError(f"{where}: the 'Contains:' line has no 'May Contain:' column: {first.strip()!r}")
    left, right = [], []
    for line in block:
        for m in re.finditer(r"\S+(?: {1,2}\S+)*", line):
            (right if m.start() >= x - 3 else left).append(m.group(0))
    c, mc = " ".join(left), " ".join(right)
    if not c.startswith("Contains:") or not mc.startswith("May Contain:") or "Contain" in c[9:] + mc[12:]:
        raise ValueError(f"{where}: the allergen columns could not be told apart: {c!r} / {mc!r}")
    return c[len("Contains:"):].strip(), mc[len("May Contain:"):].strip()


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
                energy = next((k for k in range(contains + 1, len(pending)) if re.match(r"^\s*Energy\s+Fat\b", pending[k])), None)
                if energy is None or energy != len(pending) - 1:
                    raise ValueError(f"{pdf.name} page {page_no}: {head[-1]!r}: no Energy header right above 'Per Portion' (layout changed?)")
                contains_text, may_text = _allergen_columns(pending[contains:energy], f"{pdf.name} page {page_no} {head[-1]!r}")
                rows.append({"page": page_no, "headings": head[:-1], "printed_name": head[-1], **m.groupdict(),
                             "contains_text": contains_text, "may_text": may_text})
                pending = []
                i = j + 1
                continue
            if line.strip():
                pending.append(line)
            i += 1
    return rows
