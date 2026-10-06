"""Read Tortilla's official "Nutrition & Allergen Information" PDF into rows of printed numbers.

Used by tools/uk_extract/tortilla.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "151.8", "0.0", "1166"); nothing is converted, rounded or estimated here.

Every page holds one or two tables. A data row is nine numbers in a line: kcal, kJ, fat, saturates, carbs, sugars, fibre,
protein, salt (g). The Hot Drinks table has the kcal column only. The item name is left of the numbers and is vertically
centred on them, so a long name wraps onto the line above AND below the numbers (e.g. "Medium" / "Breakfast Burrito
(Canary Wharf only)"). `pdftotext -layout` cannot say which wrapped line belongs to which row, so this reads word
coordinates (`-bbox-layout`) and gives each row the name words that sit in its own band of the page.
"""
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
COLUMNS = ("kcal", "kj", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
ROW_TOLERANCE = 2.0  # points: numbers of one row share a y within this
LINE_TOLERANCE = 3.0  # points: words of one printed line of a name
BAND_REACH = 16.0  # points above/below the numbers where a wrapped name can still belong to that row
DIETARY_CODES = {"V", "VE", "H"}


def _words(page_xml: str) -> list[tuple[float, float, float, float, str]]:
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(page_xml)]


def read_pages(pdf: Path) -> dict[int, list[dict]]:
    """{page number: [row, ...]} in printed order. A row is {"name", "veg", "dietary", <COLUMNS>} (strings), or for the
    Hot Drinks table {"name", "kcal", "dietary", "veg"} only, with "kcal" "-" when nothing is printed."""
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = out.split("<page ")[1:]
    return {n: _read_page(_words(p)) for n, p in enumerate(pages, start=1)}


def _read_page(words: list[tuple[float, float, float, float, str]]) -> list[dict]:
    # Header cells "Kcal" mark where each table starts; the numbers are right of the name column.
    headers = sorted(w[1] for w in words if w[4] == "Kcal")
    numeric = [w for w in words if NUMBER.match(w[4]) and w[0] >= 100]
    if not headers or not numeric:
        return []
    name_limit = min(w[0] for w in numeric) - 1.0
    # A data row = numbers sharing a y. Hot Drinks rows hold one number (or a lone "-").
    rows_y: list[list[tuple]] = []
    footer_y = min((w[1] for w in words if w[4] == "Dietary:"), default=1e9)  # its legend ("V - Vegetarian") holds hyphens
    dashes = [x for x in words if x[4] == "-" and x[0] >= 100 and x[1] < footer_y]
    for w in sorted(numeric + dashes, key=lambda w: (w[1], w[0])):
        if rows_y and abs(rows_y[-1][0][1] - w[1]) <= ROW_TOLERANCE:
            rows_y[-1].append(w)
        else:
            rows_y.append([w])
    table_of = lambda y: max(i for i, h in enumerate(headers) if h <= y)  # noqa: E731
    rows = []
    for r in rows_y:
        r.sort(key=lambda w: w[0])
        y = sum(w[1] for w in r) / len(r)
        if len(r) not in (1, 9):
            raise ValueError(f"A table row has {len(r)} numbers (expected 9, or 1 for hot drinks) at y={y:.0f}: {[w[4] for w in r]}")
        rows.append({"y": y, "table": table_of(y), "numbers": r})
    for i, row in enumerate(rows):
        same = [x for x in rows if x["table"] == row["table"]]
        k = same.index(row)
        header_bottom = max(w[3] for w in words if w[4] == "Kcal" and w[1] == headers[row["table"]])
        lo = (same[k - 1]["y"] + row["y"]) / 2 if k > 0 else max(header_bottom, row["y"] - BAND_REACH)
        hi = (row["y"] + same[k + 1]["y"]) / 2 if k + 1 < len(same) else row["y"] + BAND_REACH
        row["band"] = (lo, hi)
    out = []
    right_edge = max(w[2] for r in rows for w in r["numbers"])
    for row in rows:
        lo, hi = row["band"]
        name_words = sorted((w for w in words if w[2] <= name_limit and lo <= (w[1] + w[3]) / 2 < hi), key=lambda w: (w[1], w[0]))
        lines: list[list[str]] = []
        first_y = None
        for w in name_words:
            if first_y is None or w[1] - first_y > LINE_TOLERANCE:
                lines.append([])
                first_y = w[1]
            lines[-1].append(w[4])
        name = " ".join(" ".join(line) for line in lines).strip()
        # Dietary codes (V / VE / H) sit right of the numbers, in the same band.
        codes = set()
        for w in words:
            if w[0] > right_edge and lo <= (w[1] + w[3]) / 2 < hi:
                parts = [p for p in re.split(r"[,\s]+", w[4]) if p]
                if parts and all(p in DIETARY_CODES for p in parts):
                    codes.update(parts)
        nums = [w[4] for w in row["numbers"]]
        printed = {"name": name, "dietary": "/".join(sorted(codes)), "veg": bool(codes & {"V", "VE"}), "page_y": round(row["y"])}
        if len(nums) == 9:
            printed.update(dict(zip(COLUMNS, nums)))
        else:
            printed["kcal"] = nums[0]
        out.append(printed)
    return out
