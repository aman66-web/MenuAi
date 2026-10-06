"""Read Greene King's official "Pub & Social Core Menu Nutritional Information" PDF into ordered rows.

Used by tools/uk_extract/greene_king.py. Requires `pdftotext` (poppler, version with -tsv). Numbers are returned exactly
as printed (strings such as "4.96", "0.0", "2386") so nothing is converted or estimated here.

The PDF is an Excel export: one table row per dish, columns Menu | Menu Cat. | Dish Name | then pairs of
(per-serving value, % Reference Intake) for kJ, kcal, fat, saturates, carbohydrates, sugars, protein and salt. Dish names
and category names wrap onto several lines inside their cell, so each row is anchored on its line of numbers and the name
and category words are attached to the nearest such line (the cell text is vertically centred on the numbers).
"""
import csv
import io
import re
import subprocess
from pathlib import Path

FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "protein", "salt")
NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
PCT = re.compile(r"^\d+%$")

X_CAT = (115.0, 157.0)     # "Menu Cat." column (the Dish Name column starts at about x = 158.8)
X_NAME = (157.0, 262.0)    # "Dish Name" column; the first number column (kJ) starts at about x = 265
X_NUMS = 262.0
ROW_TOL = 1.6              # words whose tops differ by less than this are on one line
Y_BOTTOM = 520.0           # below this is the footer "Spring Summer 2024 / Version 1 / Page n"


def _words(pdf: Path, page: int) -> list[dict]:
    out = subprocess.run(["pdftotext", "-tsv", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         check=True, capture_output=True, text=True).stdout
    rows = csv.DictReader(io.StringIO(out), delimiter="\t", quoting=csv.QUOTE_NONE)
    return [{"x": float(r["left"]), "y": float(r["top"]), "w": float(r["width"]), "h": float(r["height"]), "t": r["text"]}
            for r in rows if r["level"] == "5" and r["text"].strip()]


def _lines(words: list[dict]) -> str:
    """Join words into text, one visual line at a time (top to bottom, left to right)."""
    words = sorted(words, key=lambda w: (w["y"], w["x"]))
    lines: list[list[dict]] = []
    for w in words:
        if lines and abs(lines[-1][0]["y"] - w["y"]) < 2.5:
            lines[-1].append(w)
        else:
            lines.append([w])
    return " ".join(" ".join(x["t"] for x in sorted(line, key=lambda w: w["x"])) for line in lines)


def page_has_table(words: list[dict]) -> bool:
    return any(w["t"] == "Dish" for w in words) and any(w["t"] == "Name" for w in words)


def read_page(pdf: Path, page: int) -> list[dict]:
    words = _words(pdf, page)
    if not page_has_table(words):
        return []
    header_y = min(w["y"] for w in words if w["t"] == "Dish")   # the "Menu | Menu Cat. | Dish Name" header line
    nums = [w for w in words if w["x"] >= X_NUMS and (NUM.match(w["t"]) or PCT.match(w["t"]))]
    # anchor lines: tops of numbers, grouped
    anchors: list[list[dict]] = []
    for w in sorted(nums, key=lambda w: (w["y"], w["x"])):
        if w["y"] >= Y_BOTTOM:
            continue
        if anchors and abs(anchors[-1][0]["y"] - w["y"]) < ROW_TOL:
            anchors[-1].append(w)
        else:
            anchors.append([w])
    rows = []
    for a in anchors:
        a.sort(key=lambda w: w["x"])
        toks = [w["t"] for w in a]
        if len(toks) != 16:
            raise ValueError(f"page {page}: a row has {len(toks)} numbers instead of 16: {toks}")
        values, pcts = toks[0::2], toks[1::2]
        if not all(NUM.match(v) for v in values) or not all(PCT.match(p) for p in pcts):
            raise ValueError(f"page {page}: unexpected column layout in row {toks}")
        rows.append({"page": page, "yc": sum(w["y"] for w in a) / len(a), "values": dict(zip(FIELDS, values)),
                     "pcts": dict(zip(FIELDS, pcts)), "name_words": [], "cat_words": []})
    if not rows:
        return []
    for w in words:
        if w["y"] <= header_y + 3 or w["y"] >= Y_BOTTOM or w["x"] >= X_NUMS:
            continue
        if X_NAME[0] <= w["x"] < X_NAME[1]:
            key = "name_words"
        elif X_CAT[0] <= w["x"] < X_CAT[1]:
            key = "cat_words"
        else:
            continue
        yc = w["y"] + w["h"] / 2
        best = min(rows, key=lambda r: abs(r["yc"] + 4 - yc))
        best[key].append(w)
    for r in rows:
        r["name"] = _lines(r.pop("name_words"))
        r["cat"] = _lines(r.pop("cat_words"))
    return rows


def read_rows(pdf: Path) -> list[dict]:
    """All table rows in reading order (pages 1..N); each has name, cat, values{kj,kcal,fat,sat,carbs,sugars,protein,salt}."""
    info = subprocess.run(["pdfinfo", str(pdf)], check=True, capture_output=True, text=True).stdout
    pages = int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))
    rows: list[dict] = []
    for p in range(1, pages + 1):
        rows.extend(read_page(pdf, p))
    return rows


def read_text(pdf: Path) -> str:
    """Whole-document text (for footnote checks)."""
    return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
