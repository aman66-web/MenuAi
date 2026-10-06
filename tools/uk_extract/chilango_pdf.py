"""Read Chilango's official "Nutrition & Allergen Information" PDF into rows of printed numbers.

Used by tools/uk_extract/chilango.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "281.2", "19", "0.0"); nothing is converted, rounded or estimated here.

Each page (2 to 10) is one table. A data row is nine numbers in a line: kcal, kJ, fat, saturates, carbs, sugars, fibre,
protein, salt (g). The box pages end with a "TOTAL" row that holds one number (kcal). The item name sits left of the
numbers and is vertically centred on them, so a long name can wrap above and below the numbers; this reads word
coordinates (`pdftotext -bbox-layout`) and gives each row the name words that sit in its own band of the page.
Dietary codes (V / VE) sit right of the salt column in the same band.
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
NUMBER_MIN_X = 100.0  # the name column ends left of this; every printed number is right of it


def _words(page_xml: str) -> list[tuple[float, float, float, float, str]]:
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(page_xml)]


def read_pages(pdf: Path) -> dict[int, dict]:
    """{page number: {"title": "KETO BOX", "updated": "Nov-24" or "", "rows": [row, ...]}} in printed order.
    A row is {"name", "dietary", "veg", "page_y", <COLUMNS>} (strings); a TOTAL row has only "kcal"."""
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = out.split("<page ")[1:]
    result = {}
    for n, p in enumerate(pages, start=1):
        words = _words(p)
        result[n] = {"title": _title(words), "updated": _updated(words), "rows": _read_page(words)}
    return result


def _title(words) -> str:
    """The big heading at the top-left ("KETO BOX"): words above the table header, left of x=300."""
    head = [w for w in words if w[3] < 60 and w[0] < 300]
    return " ".join(w[4] for w in sorted(head, key=lambda w: (round(w[1]), w[0])))


def _updated(words) -> str:
    """The footer "Updated: Nov-24" printed under the table, if any."""
    for i, w in enumerate(words):
        if w[4].startswith("Updated"):
            line = [x for x in words if abs(x[1] - w[1]) < 3 and x[0] > w[2]]
            return " ".join(x[4] for x in sorted(line, key=lambda x: x[0]))
    return ""


def _read_page(words: list[tuple[float, float, float, float, str]]) -> list[dict]:
    headers = sorted(w[1] for w in words if w[4] == "KCAL")
    if not headers:
        return []
    header_bottom = max(w[3] for w in words if w[4] == "KCAL")
    footer_y = min((w[1] for w in words if w[4] == "Dietary:"), default=1e9)
    numeric = [w for w in words if NUMBER.match(w[4]) and w[0] >= NUMBER_MIN_X and header_bottom < w[1] < footer_y]
    if not numeric:
        return []
    name_limit = min(w[0] for w in numeric) - 1.0
    rows_y: list[list[tuple]] = []
    for w in sorted(numeric, key=lambda w: (w[1], w[0])):
        if rows_y and abs(rows_y[-1][0][1] - w[1]) <= ROW_TOLERANCE:
            rows_y[-1].append(w)
        else:
            rows_y.append([w])
    rows = []
    for r in rows_y:
        r.sort(key=lambda w: w[0])
        y = sum(w[1] for w in r) / len(r)
        if len(r) not in (1, 9):
            raise ValueError(f"A table row has {len(r)} numbers (expected 9, or 1 for a TOTAL) at y={y:.0f}: {[w[4] for w in r]}")
        rows.append({"y": y, "numbers": r})
    for k, row in enumerate(rows):
        lo = (rows[k - 1]["y"] + row["y"]) / 2 if k > 0 else max(header_bottom, row["y"] - BAND_REACH)
        hi = (row["y"] + rows[k + 1]["y"]) / 2 if k + 1 < len(rows) else row["y"] + BAND_REACH
        row["band"] = (lo, hi)
    right_edge = max(w[2] for r in rows for w in r["numbers"] if len(r["numbers"]) == 9)
    out = []
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
