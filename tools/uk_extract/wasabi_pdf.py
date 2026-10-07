"""Read Wasabi's official "nutritional information" guide (PDF) into table rows, exactly as printed.

Used by tools/uk_extract/wasabi.py. Requires `pdftotext` (poppler) and nothing else. Nothing is converted, rounded or estimated
here: every cell is returned as the printed text ("620", "0.85", "n/a", "Y").

The guide (28 A4-landscape pages, Version 34, released 17 September 2026) is a set of grid tables, one product per row. Energy
is printed per 100 g AND per portion; protein, carbohydrate, sugar, fat, saturates and salt are printed per 100 g ONLY (the
caller must not use them as per-serving values); the portion weight in grams is printed. The layout of the columns differs
between table types, so each table type below lists its single-token columns left to right (COLUMNS).

How a row is read (everything by position, nothing by counting rows):
  1. `pdftotext -bbox` gives every word with its box, per page.
  2. A table is the part of the page below its "Product" header word (and above the next "Product" header on the same page).
  3. A row is anchored by the number printed in the first data column (kcal per 100 g); the header band is skipped by position.
  4. Every other word belongs to the anchor nearest in height (names, wrapped allergen text). Words further than MAX_DIST from
     every anchor (footnotes, the allergens key) belong to no row.
  5. The words left of the first data column are the product name; the single-token cells (numbers, "n/a", Y/N marks) are the
     next len(COLUMNS) tokens by x; the words right of the last of them are the allergen cell(s).
A table whose header words or row count differ from what the script expects raises, so a new layout stops the run.
"""
from __future__ import annotations
import hashlib
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">(.*?)</word>')
NUMBER = re.compile(r"^\d+(\.\d+)?$")
CELL = re.compile(r"^(\d+(\.\d+)?|n/a|[YN]\**)$")
MAX_DIST = 32.0       # points between a word's centre and its row anchor's centre
ANCHOR_TOL = 14.0     # points: an anchor number's centre may differ this much from the first column's header centre
BLOCK_GAP = 1.3       # lines of one allergen cell are at most this many text heights apart (they sit about 1.05 heights apart);
                      # the cells of two different rows are further apart than that
MARKS = {"Y", "N"}

_A1 = ["kcal100", "kj100", "kcal", "protein100", "carbs100", "sugar100", "fat100", "sat100", "salt100", "weight", "servings"]
_FLAGS_FISH = ["raw_fish", "veg", "vegan", "msg", "alcohol", "gluten"]
_FLAGS = ["veg", "vegan", "msg", "alcohol", "gluten"]
COLUMNS = {
    "sushi": _A1 + _FLAGS_FISH,                                   # onigiri, set boxes, salads, pottos, chilled pots
    "platter": ["kcal100", "kj100", "kcal_pack", "kcal", "protein100", "carbs100", "sugar100", "fat100", "sat100", "salt100",
                "weight", "servings"] + _FLAGS_FISH,
    "soup": _A1 + _FLAGS,
    "bain": ["kcal100", "kj100", "kcal_std", "kcal_large", "protein100", "carbs100", "sugar100", "fat100", "sat100", "salt100",
             "w_std", "w_large", "servings"] + _FLAGS,
    "mixed": _A1,                                                 # no allergen or dietary columns on these pages
    "hot": _A1 + _FLAGS,
    "sauce27": ["kcal100", "kj100", "kcal", "kcal_counter", "protein100", "carbs100", "sugar100", "fat100", "sat100", "salt100",
                "weight", "w_counter"] + _FLAGS,
    "sauce28": ["kcal100", "kj100", "kcal", "kcal_counter", "protein100", "carbs100", "sugar100", "fat100", "sat100", "salt100",
                "weight", "servings"] + _FLAGS,  # page 28 has no "portion size - for counter salad" column
}
# Tables with a second allergen cell ("Allergens: condiments only") right of the product cell.
HAS_CONDIMENTS = {"sushi", "platter"}
HAS_ALLERGENS = set(COLUMNS) - {"mixed"}

# (page, table index on the page, category as the chain heads it, column layout). Order = order in the guide.
TABLES = [
    (4, 0, "Onigiri", "sushi"),
    (5, 0, "Sushi set boxes", "sushi"), (6, 0, "Sushi set boxes", "sushi"), (7, 0, "Sushi set boxes", "sushi"),
    (8, 0, "Platters", "platter"),
    (9, 0, "Salads and bowls", "sushi"), (10, 0, "Salads and bowls", "sushi"),
    (11, 0, "Potto salads and protein pots", "sushi"),
    (12, 0, "Tom yum", "soup"), (12, 1, "Ramen", "soup"), (12, 2, "Miso", "soup"),
    (13, 0, "Bain marie", "bain"), (14, 0, "Bain marie", "bain"),
    (15, 0, "Mixed bento", "mixed"), (16, 0, "Mixed bento", "mixed"), (17, 0, "Mixed bento", "mixed"),
    (18, 0, "Hot cabinet", "hot"), (19, 0, "Hot cabinet", "hot"),
    (20, 0, "Breakfast hot cabinet", "hot"),
    (21, 0, "Breakfast pots", "sushi"),
    (22, 0, "Hot sides", "hot"), (23, 0, "Hot sides", "hot"),
    (24, 0, "Coffee", "hot"),
    (25, 0, "Tea", "hot"), (25, 1, "Other hot drinks", "hot"),
    (26, 0, "Hot drink extras", "hot"),
    (27, 0, "Sauces and dressings for sushi", "sauce27"),
    (28, 0, "Sauces and dressings", "sauce28"),
]
# Rows each table must have (the run stops when the guide changes).
EXPECTED_ROWS = {4: [4], 5: [8], 6: [12], 7: [10], 8: [4], 9: [8], 10: [2], 11: [7], 12: [3, 2, 1], 13: [13], 14: [11], 15: [13],
                 16: [13], 17: [3], 18: [9], 19: [7], 20: [9], 21: [2], 22: [10], 23: [7], 24: [15], 25: [6, 4], 26: [3],
                 27: [8], 28: [5]}
# sha1 (first 12 hex) of each table's header words, lower-cased and sorted: a changed or re-ordered header stops the run.
HEADER_HASH = {}  # filled in by wasabi.py from HEADER_HASHES below when it is not empty


def _words(pdf: Path, page: int) -> list[dict]:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    words = []
    for x0, y0, x1, y1, text in WORD.findall(out):
        t = html.unescape(text).replace("​", "").strip()
        if t:
            words.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), t=t, xc=(float(x0) + float(x1)) / 2, yc=(float(y0) + float(y1)) / 2))
    return words


def _lines(words: list[dict]) -> str:
    """Words in reading order (lines by height, then left to right), joined with single spaces."""
    ws = sorted(words, key=lambda w: (w["y0"], w["x0"]))
    lines: list[list[dict]] = []
    for w in ws:
        if lines and abs(w["yc"] - lines[-1][0]["yc"]) < 3.0:
            lines[-1].append(w)
        else:
            lines.append([w])
    return " ".join(" ".join(x["t"] for x in sorted(line, key=lambda w: w["x0"])) for line in lines)


def _blocks(words: list[dict]) -> list[list[dict]]:
    """Group words into text blocks: lines by height, consecutive lines closer than BLOCK_GAP form one block (one table cell)."""
    ws = sorted(words, key=lambda w: (w["yc"], w["x0"]))
    lines: list[list[dict]] = []
    for w in ws:
        if lines and abs(w["yc"] - lines[-1][0]["yc"]) < 3.0:
            lines[-1].append(w)
        else:
            lines.append([w])
    blocks: list[list[dict]] = []
    prev = None
    for line in lines:
        yc = sum(w["yc"] for w in line) / len(line)
        height = max(w["y1"] - w["y0"] for w in line)
        if prev is not None and yc - prev[0] <= BLOCK_GAP * max(height, prev[1]):
            blocks[-1].extend(line)
        else:
            blocks.append(list(line))
        prev = (yc, height)
    return blocks


def header_signature(words: list[dict]) -> str:
    return hashlib.sha1(" ".join(sorted(w["t"].lower() for w in words)).encode()).hexdigest()[:12]


def read_tables(pdf: Path, expected_headers: dict | None = None) -> tuple[list[dict], dict]:
    """All table rows of the guide: dicts with page, category, layout, name, base (mixed bento), cells (field -> printed text),
    allergens (product cell text), condiments (second cell text or ''). Also returns the header signatures found
    ({(page, index): sha1}) so the caller can compare them with the ones it expects."""
    rows: list[dict] = []
    signatures: dict = {}
    by_page: dict[int, list[tuple[int, str, str]]] = {}
    for page, idx, category, layout in TABLES:
        by_page.setdefault(page, []).append((idx, category, layout))
    for page, tables in sorted(by_page.items()):
        words = _words(pdf, page)
        products = sorted((w for w in words if w["t"] == "Product"), key=lambda w: w["y0"])
        if len(products) != len(tables):
            raise SystemExit(f"Page {page}: expected {len(tables)} table(s) (header word 'Product'), found {len(products)}: the guide changed")
        starts = [p["y0"] - 30 for p in products]
        ends = starts[1:] + [10_000.0]
        for (idx, category, layout), top, bottom in zip(sorted(tables), starts, ends):
            cols = COLUMNS[layout]
            region = [w for w in words if top <= w["yc"] < bottom]
            energy = sorted((w for w in region if w["t"] == "Energy"), key=lambda w: w["x0"])
            if not energy:
                raise SystemExit(f"Page {page} table {idx}: no 'Energy' header word")
            first_x = energy[0]["xc"]
            anchors = sorted((w for w in region if NUMBER.match(w["t"]) and abs(w["xc"] - first_x) <= ANCHOR_TOL and w["y0"] > products[idx]["y1"] + 8),
                             key=lambda w: w["yc"])
            exp = EXPECTED_ROWS[page][idx]
            if len(anchors) != exp:
                raise SystemExit(f"Page {page} table {idx} ({category}): found {len(anchors)} rows, expected {exp}: the guide changed")
            # header band: words in the data columns above the first anchor line (data cells all sit on anchor lines)
            header = [w for w in region if w["x0"] >= energy[0]["x0"] - 4 and w["y1"] < anchors[0]["y0"] + 0.5 and w["y0"] >= products[idx]["y0"] - 30]
            head_bottom = max(w["y1"] for w in header)
            half = head_bottom - products[idx]["yc"]  # the "Product" word sits in the middle of the header band
            header_all = [w for w in region if w["y1"] <= head_bottom + 0.01 and w["yc"] >= products[idx]["yc"] - half - 1.0]
            sig = header_signature(header_all)
            signatures[(page, idx)] = sig
            if expected_headers is not None and expected_headers.get((page, idx)) != sig:
                raise SystemExit(f"Page {page} table {idx} ({category}): header words changed (signature {sig}, expected {expected_headers.get((page, idx))}): re-check the columns")
            allergen_x = [w["xc"] for w in header_all if w["t"] == "Allergens"]
            footer = [w["y0"] for w in region if w["t"] == "key:"]  # "Allergens key: ..." and footnotes belong to no row
            limit = min(footer) - 1.5 if footer else 1e9
            body = [w for w in region if head_bottom - 0.5 <= w["y0"] < limit]
            near = lambda w: min(range(len(anchors)), key=lambda k: abs(anchors[k]["yc"] - w["yc"]))  # noqa: E731
            per_row: list[list[dict]] = [[] for _ in anchors]
            for w in body:
                j = near(w)
                if abs(anchors[j]["yc"] - w["yc"]) <= MAX_DIST:
                    per_row[j].append(w)
            # the single-token cells of each row sit on its anchor line
            centrals: list[list[dict]] = []
            for anchor, ws in zip(anchors, per_row):
                right = [w for w in ws if w["x1"] > energy[0]["x0"] + 1]
                central = sorted((w for w in right if CELL.match(w["t"]) and abs(w["yc"] - anchor["yc"]) < 4.0), key=lambda w: w["x0"])
                if len(central) < len(cols):
                    raise SystemExit(f"Page {page} {category}: row near {_lines([w for w in ws if w['x1'] <= energy[0]['x0'] + 1])!r} has {len(central)} cells in the data columns, expected {len(cols)}")
                centrals.append(central)
            # allergen cells: everything right of the last single-token column, in text blocks (a tall cell of 6 lines can sit
            # closer to its neighbour's anchor than to its own), each block belonging to the anchor nearest its middle
            allergen_left = max(c[len(cols) - 1]["x1"] for c in centrals) + 1.0
            texts = [dict(product=[], condiments=[]) for _ in anchors]
            if layout in HAS_ALLERGENS:
                allergen_x = sorted(w["xc"] for w in header_all if w["t"] == "Allergens")
                if layout in HAS_CONDIMENTS and len(allergen_x) != 2:
                    raise SystemExit(f"Page {page}: expected two 'Allergens' header cells, found {len(allergen_x)}")
                split = sum(allergen_x) / 2 if layout in HAS_CONDIMENTS else 1e9
                for column in ("product", "condiments"):
                    cell_words = [w for w in body if w["x0"] > allergen_left and ((w["xc"] < split) == (column == "product"))]
                    for block in _blocks(cell_words):
                        j = near({"yc": sum(w["yc"] for w in block) / len(block)})
                        if texts[j][column]:
                            raise SystemExit(f"Page {page} {category}: two {column} allergen blocks for one row ({_lines(texts[j][column])!r} and {_lines(block)!r})")
                        texts[j][column] = block
            else:
                stray = [w for w in body if w["x0"] > allergen_left]
                if stray:
                    raise SystemExit(f"Page {page}: unexpected text right of the data columns: {_lines(stray)!r}")
            for anchor, ws, central, text in zip(anchors, per_row, centrals, texts):
                name_words = [w for w in ws if w["x1"] <= energy[0]["x0"] + 1]
                cells = {c: w["t"] for c, w in zip(cols, central)}
                row = dict(page=page, category=category, layout=layout, cells=cells, allergens=_lines(text["product"]),
                           condiments=_lines(text["condiments"]), base="")
                if layout in HAS_ALLERGENS and not row["allergens"]:
                    raise SystemExit(f"Page {page} {category}: no allergen text for the row near y={anchor['yc']:.0f}")
                if layout in HAS_CONDIMENTS and not row["condiments"]:
                    raise SystemExit(f"Page {page} {category}: no condiments allergen text for the row near y={anchor['yc']:.0f}")
                if layout == "mixed":
                    base_words = [w for w in name_words if w["t"] in ("Rice", "Yakisoba", "noodles")]
                    name_words = [w for w in name_words if w not in base_words]
                    row["base"] = _lines(base_words)
                row["name"] = _lines(name_words)
                if not row["name"]:
                    raise SystemExit(f"Page {page} {category}: a row without a name near y={anchor['yc']:.0f}")
                for c, v in cells.items():
                    if c in ("veg", "vegan", "msg", "alcohol", "gluten", "raw_fish") and v.rstrip("*") not in MARKS:
                        raise SystemExit(f"Page {page} {row['name']!r}: column {c} holds {v!r}, expected Y or N")
                rows.append(row)
    return rows, signatures
