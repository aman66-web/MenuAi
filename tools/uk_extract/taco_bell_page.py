"""Read Taco Bell UK's official nutrition table into ordered rows of printed numbers.

Used by tools/uk_extract/taco_bell.py. Standard library only.

The page https://www.tacobell.co.uk/nutrition-information/ is just a frame around
https://www.nutritionix.com/taco-bell-uk/menu/premium, which is where Taco Bell UK publishes its nutrition table
(server-rendered HTML, one <table class="tblCompare">). Numbers are returned exactly as printed, as strings
("<0.5", "0.68", "2456"), so nothing is converted or estimated here.
"""
import html
import re
from pathlib import Path

NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
# Column order of the table, left to right.
FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
HEADERS = ("Energy (kj)", "Energy (kcal)", "Total Fat (g)", "Saturated Fat (g)", "Carbohydrate (g)",
           "Sugars (g)", "Fibre (g)", "Protein (g)", "Salt (g)")

_LESS_THAN = re.compile(r'<span class="less-than">&lt;</span>')
_ROW = re.compile(r'<tr class="subCategory">.*?<h3>(.*?)</h3>|<tr class="(?:odd|even)">(.*?)</tr>', re.S)
_NAME = re.compile(r'class="nmItem" title="(.*?)"')
_CELL = re.compile(r'class="col"[^>]*>(.*?)</td>', re.S)
_TAGS = re.compile(r"<[^>]+>")


def last_updated(page: str) -> str:
    """The date the page says its table was last updated (the page prints MM/DD/YYYY)."""
    m = re.search(r"Last Updated:</strong>\s*(\d\d/\d\d/\d{4})", page)
    return m.group(1) if m else ""


def header_labels(page: str) -> tuple[str, ...]:
    i = page.find('<table class="tblCompare')
    head = page[i:page.find("</thead>", i)]
    return tuple(html.unescape(t) for t in re.findall(r'<span aria-hidden="true">(.*?)</span>', head))


def read_rows(path: Path) -> tuple[str, list[dict[str, str]]]:
    """Return (page text, rows in page order); each row has category, name and the nine printed numbers."""
    page = path.read_text(encoding="utf-8", errors="replace")
    start = page.find('<table class="tblCompare')
    end = page.find("</table>", start)
    if start < 0 or end < 0:
        raise SystemExit("No nutrition table found in the page: the layout changed, re-check the source.")
    if header_labels(page) != HEADERS:
        raise SystemExit(f"The table's columns changed.\n  expected {HEADERS}\n  found    {header_labels(page)}")
    rows: list[dict[str, str]] = []
    category = ""
    for m in _ROW.finditer(page[start:end]):
        if m.group(1) is not None:
            category = html.unescape(_TAGS.sub("", m.group(1))).strip()
            continue
        cells = [html.unescape(_TAGS.sub("", _LESS_THAN.sub("<", c))).strip() for c in _CELL.findall(m.group(2))]
        name = html.unescape(_NAME.search(m.group(2)).group(1)).strip()
        if len(cells) != len(FIELDS) or not all(NUM.match(c) for c in cells):
            raise SystemExit(f"Row {name!r} does not have {len(FIELDS)} printed numbers: {cells}")
        rows.append({"category": category, "name": name, **dict(zip(FIELDS, cells))})
    return page, rows
