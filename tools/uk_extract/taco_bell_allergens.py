"""Read Taco Bell UK's official allergen table (Nutritionix "special diets" page) into a per-item, per-allergen contains / free grid.

Used by tools/uk_extract/taco_bell.py. Standard library only.

https://www.tacobell.co.uk/allergen-information/ only frames https://www.nutritionix.com/taco-bell-uk/menu/special-diets/premium, the
allergen tool Taco Bell UK publishes there. The tool asks which allergens to avoid and shows a table with one column per chosen allergen. With
`allergenFree=0` ("All Items") it lists EVERY item of the menu (the same 477 rows as the nutrition table) and each cell is an explicit statement:
    <em class="allergen free center"    aria-label="Baja Blast (Regular) does not contain Milk. ">
    <em class="allergen warning center" aria-label="Warning! 3x Salted Caramel Churro Bites Contains Milk. ">!</em>
So nothing is read from silence: every cell says "does not contain" or "Contains". One page is saved per allergen (14 pages,
`?allergens=<name>&allergenFree=0`; no sort or tag parameters, which the host's robots.txt disallows). The tool prints no "may contain"
information, so none is published. Cells are copied as printed; an unexpected cell stops the run.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

# page parameter -> the column heading the page prints (checked on every run)
ALLERGEN_PAGES = {
    "celery": "Celery", "eggs": "Eggs", "fish": "Fish", "gluten": "Cereals Containing Gluten", "lupin": "Lupin", "milk": "Milk",
    "molluscan_shellfish": "Molluscs", "mustard": "Mustard", "peanuts": "Peanuts", "sesame": "Sesame", "shellfish": "Crustaceans",
    "soy": "Soya", "sulfites": "Sulphites", "tree_nuts": "Tree Nuts",
}
URL = "https://www.nutritionix.com/taco-bell-uk/menu/special-diets/premium?allergens={name}&allergenFree=0"

_ROW = re.compile(r'<tr class="subCategory">.*?<h3>(.*?)</h3>|<tr class="(?:odd|even)">(.*?)</tr>', re.S)
_NAME = re.compile(r'class="nmItem" title="(.*?)"')
_CELL = re.compile(r'<em class="allergen (free|warning)(?: center)?"([^>]*)>', re.S)
_LABEL = re.compile(r'aria-label="(.*?)"')
_TAGS = re.compile(r"<[^>]+>")
_HEADER = re.compile(r'<span aria-hidden="true">(.*?)</span>')


def last_updated(page: str) -> str:
    m = re.search(r"Last Updated:</strong>\s*(\d\d/\d\d/\d{4})", page)
    return m.group(1) if m else ""


def read_one(path: Path, heading: str) -> tuple[str, list[tuple[str, str, str]]]:
    """-> (last updated text, [(category, item name, 'contains' | 'free')] in page order) for one allergen page."""
    page = path.read_text(encoding="utf-8", errors="replace")
    start = page.find('<table class="tblCompare')
    end = page.find("</table>", start)
    if start < 0 or end < 0:
        raise SystemExit(f"{path.name}: no allergen table found: the layout changed")
    head = page[start:page.find("</thead>", start)]
    headers = [html.unescape(h) for h in _HEADER.findall(head)]
    if headers != [heading]:
        raise SystemExit(f"{path.name}: the table's columns are {headers}, expected {[heading]}")
    rows, category = [], ""
    for m in _ROW.finditer(page[start:end]):
        if m.group(1) is not None:
            category = html.unescape(_TAGS.sub("", m.group(1))).strip()
            continue
        name = html.unescape(_NAME.search(m.group(2)).group(1)).strip()
        cells = _CELL.findall(m.group(2))
        if len(cells) != 1:
            raise SystemExit(f"{path.name}: {name!r} has {len(cells)} allergen cells, expected 1")
        kind, attrs = cells[0]
        label = html.unescape(_LABEL.search(attrs).group(1)).strip() if _LABEL.search(attrs) else ""
        want = f"{name} does not contain {heading}." if kind == "free" else f"Warning! {name} Contains {heading}."
        if label != want:
            raise SystemExit(f"{path.name}: {name!r}: the cell says {label!r}, expected {want!r}")
        rows.append((category, name, "free" if kind == "free" else "contains"))
    return last_updated(page), rows


def read_grid(folder: Path) -> tuple[str, list[tuple[str, str]], dict[tuple[str, str], dict[str, str]]]:
    """All 14 pages -> (last updated, [(category, name)] in page order, {(category, name): {allergen param: 'contains'|'free'}}).
    Every page must list the same rows in the same order and print the same 'Last Updated' date."""
    order: list[tuple[str, str]] | None = None
    updated = ""
    grid: dict[tuple[str, str], dict[str, str]] = {}
    for param, heading in ALLERGEN_PAGES.items():
        upd, rows = read_one(folder / f"{param}.html", heading)
        if not upd:
            raise SystemExit(f"{param}.html: no 'Last Updated' date")
        if updated and upd != updated:
            raise SystemExit(f"{param}.html is dated {upd} but the other pages are dated {updated}: download them again together")
        updated = upd
        keys = [(c, n) for c, n, _ in rows]
        if order is None:
            order = keys
        elif keys != order:
            raise SystemExit(f"{param}.html lists different rows from the first page: download all 14 pages again")
        for c, n, status in rows:
            grid.setdefault((c, n), {})[param] = status
    assert order is not None
    if len(set(order)) != len(order):
        raise SystemExit("two rows share a category and a name in the allergen table: " + ", ".join(sorted({f"{c} / {n}" for c, n in order if order.count((c, n)) > 1})))
    return updated, order, grid
