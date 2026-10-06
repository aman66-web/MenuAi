"""Read Tortilla's official "Nutrition & Allergen Information" PDF into rows of printed numbers.

Used by tools/uk_extract/tortilla.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "151.8", "0.0", "1166"); nothing is converted, rounded or estimated here.

Every page holds one or two tables. A data row is nine numbers in a line: kcal, kJ, fat, saturates, carbs, sugars, fibre,
protein, salt (g). The Hot Drinks table has the kcal column only. The item name is left of the numbers and is vertically
centred on them, so a long name wraps onto the line above AND below the numbers (e.g. "Medium" / "Breakfast Burrito
(Canary Wharf only)"). `pdftotext -layout` cannot say which wrapped line belongs to which row, so this reads word
coordinates (`-bbox-layout`) and gives each row the name words that sit in its own band of the page.

Allergens: right of the Dietary column every table prints "Contains Allergens" and "May Contain" as wrapped text centred on
the row (e.g. "Soybean, Sesame, / Mustard, / Celery, Fish, / Egg & Cereals / Containing / Gluten."). `allergen_cells()` reads
them by position: the two columns' x-limits come from their own header words, each vertically contiguous block of text in a
column must be centred (within CENTRE_TOL) on ONE row's numbers (else that row gets an `allergen_problem` and the caller
stops), and the words are returned as printed ("contains_text", "may_text"). `allergen_keys()` turns a printed cell into allergen keys with
common.allergen_words (an unknown word stops the run). Chilango's guide (same group, same design) uses both functions too.
"""
from __future__ import annotations
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
    for t, header_y in enumerate(headers):
        idx = [i for i, r in enumerate(rows) if r["table"] == t]
        bottom = headers[t + 1] - 26 if t + 1 < len(headers) else footer_y  # the next table's header words start ~25 pt above its Kcal
        allergen_cells(words, [rows[i] for i in idx], [out[i] for i in idx], header_y, bottom)
    return out


# ---------------------------------------------------------------- allergens (docs/DATA.md "Allergens")
CONTAINS_HEADS = {"contains", "allergens"}
MAY_HEADS = {"may", "contain"}
LINE_GAP = 2.5  # points between one printed line's bottom and the next line's top inside one wrapped cell (measured: 0.3-0.6)
CENTRE_TOL = 3.0  # points between a cell's vertical centre and its row's numbers' centre


def allergen_cells(words, rows: list[dict], printed: list[dict], header_y: float, bottom: float) -> None:
    """Fill printed[i]["contains_text"], ["may_text"] and ["allergen_problem"] for the rows of one table.

    rows[i] carries the row's printed "numbers" (word boxes); a wrapped cell is centred on them. header_y is the table's Kcal
    header (the column headers sit just above it); bottom is where the table region ends (next table's header or the page's
    "Dietary:" legend). A problem is recorded, never guessed round: the caller stops if a row it publishes has one."""
    for p in printed:
        p.update({"contains_text": "", "may_text": "", "allergen_problem": ""})
    head = [w for w in words if header_y - 25 <= w[1] <= header_y + 5]
    cont = [w for w in head if w[4].lower() in CONTAINS_HEADS]
    may = [w for w in head if w[4].lower() in MAY_HEADS]
    diet = [w for w in head if w[4].lower() == "dietary"]
    if not cont or not may or len(diet) != 1:
        for p in printed:
            p["allergen_problem"] = "the table's Dietary / Contains Allergens / May Contain headers were not found"
        return
    left = diet[0][2] + 3.0
    span = lambda ws: (min(w[0] for w in ws) + max(w[2] for w in ws)) / 2  # noqa: E731
    boundary = (span(cont) + span(may)) / 2
    top = max(w[3] for w in head)
    mid = lambda w: (w[1] + w[3]) / 2  # noqa: E731
    region = [w for w in words if w[0] >= left and top < mid(w) < bottom]
    if not rows:
        return
    centres = [sum(mid(w) for w in r["numbers"]) / len(r["numbers"]) for r in rows]
    first, last = min(min(w[1] for w in r["numbers"]) for r in rows), max(max(w[3] for w in r["numbers"]) for r in rows)

    for side, ws in (("contains_text", [w for w in region if w[2] < boundary]), ("may_text", [w for w in region if w[0] > boundary])):
        blocks: list[list[tuple]] = []
        for w in sorted(ws, key=lambda w: (w[1], w[0])):
            if blocks and w[1] - max(x[3] for x in blocks[-1]) <= LINE_GAP:
                blocks[-1].append(w)
            else:
                blocks.append([w])
        for b in blocks:
            # A cell is printed vertically centred on its row's numbers: the block goes to the row whose numbers' centre is
            # within CENTRE_TOL of the block's centre. Anything else inside the table is a layout we don't understand.
            top_b, bot_b = min(w[1] for w in b), max(w[3] for w in b)
            cb = (top_b + bot_b) / 2
            i = min(range(len(rows)), key=lambda k: abs(centres[k] - cb))
            text = _reading_order(b)
            if abs(centres[i] - cb) <= CENTRE_TOL:
                if printed[i][side]:
                    printed[i]["allergen_problem"] = f"two separate text blocks in one cell ({printed[i][side]!r}, {text!r})"
                printed[i][side] = text
            elif bot_b > first and top_b < last:
                printed[i]["allergen_problem"] = f"allergen text {text!r} is not centred on any row (nearest is {abs(centres[i] - cb):.1f} pt away)"
            # else: a note above or below the table rows, not a cell
    for w in region:
        if w[0] <= boundary <= w[2] and first < mid(w) < last:
            i = min(range(len(rows)), key=lambda k: abs(centres[k] - mid(w)))
            printed[i]["allergen_problem"] = f"the word {w[4]!r} straddles the Contains / May Contain columns"


def _reading_order(ws) -> str:
    lines: list[list[tuple]] = []
    for w in sorted(ws, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) <= LINE_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
    return " ".join(" ".join(x[4] for x in sorted(line, key=lambda x: x[0])) for line in lines)


def allergen_keys(text: str, where: str, extra: dict | None = None) -> tuple[set[str], set[str], set[str]]:
    """'Cereals Containing Gluten, Soybeans, Milk, Eggs & Sulphur Dioxide.' -> ({gluten, soya, milk, eggs, sulphites}, cereals, nuts).
    A part may name its cereal in brackets ("Gluten (Wheat)"); "(and products thereof)" is legal wording, not a cereal."""
    from common import allergen_words
    text = re.sub(r"\(and products thereof\)", "", text, flags=re.I).strip().rstrip(".")
    keys, cereals, nuts = set(), set(), set()
    for part in _split_top(text):
        head, _, inner = part.partition("(")
        k, c, n = allergen_words([head], where, extra)
        keys |= k
        cereals |= c
        nuts |= n
        if inner:
            k2, c2, n2 = allergen_words(re.split(r"[,/&]", inner.rstrip(")")), where, extra)
            if not k2 <= k:
                raise SystemExit(f"{where}: {part!r} names {sorted(k2 - k)} in brackets under a different allergen")
            cereals |= c2
            nuts |= n2
    return keys, cereals, nuts


def _split_top(text: str) -> list[str]:
    """Split on ',', '&' and '/' outside brackets."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        depth += (ch == "(") - (ch == ")")
        if ch in ",&/" and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    return [p.strip() for p in parts + [cur] if p.strip()]
