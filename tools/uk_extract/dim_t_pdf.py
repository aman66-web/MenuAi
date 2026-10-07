"""Read dim t's official PDFs (calorie list, allergen matrix, menus) into plain Python values.

Used by tools/uk_extract/dim_t.py. Requires `pdftotext` (poppler). Everything is returned exactly as printed (strings such
as "1040"); nothing is converted, rounded or estimated here.

1. Calorie PDF ("dim-t-main-menu-calories-14.08.2026-v1.pdf", 3 pages): one table per menu section, a grey heading row
   ("Small Eats" ... "kcal") followed by one "name  kcal" row per dish. Read from `pdftotext -layout`; any line that is
   neither a heading nor a dish row stops the run.

2. Allergen PDF ("dim-t-main-menu-allergens-14.08.2026-v1.pdf", pages 2-7 are the summary matrix; later pages list recipe
   ingredients and are not used): one grey table per menu section with the 14 allergens as columns. A dish's cell holds "Y",
   or for the "Cereals With Gluten" column the cereals ("Gluten, Wheat", "Barley, Gluten, Wheat"), or for "Nuts" the nut
   ("Cashew", "Almond", "Coconut"). Rows are vertically centred and a dish name can wrap onto two lines, so rows cannot be
   found by line spacing: the caller passes the printed dish names it expects in each table, in order, and each row is cut
   by matching those names against the name column (any difference stops the run). A mark or cereal/nut word then belongs
   to the row whose centre is nearest to it (checked: it must be clearly nearest). The column of a mark is found from the
   header words of the same table by x position.

3. Menu PDFs: plain text via `pdftotext -layout` (used only to cross-check calories, serving sizes and two descriptions).
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')

# Allergen matrix columns, left to right: (the header word we locate it by, our key). Cereals -> gluten, Nuts -> nuts.
COLUMNS = [("Celery", "celery"), ("Cereals", "gluten"), ("Crust-", "crustaceans"), ("Egg", "eggs"), ("Fish", "fish"),
           ("Lupin", "lupin"), ("Milk", "milk"), ("Molluscs", "molluscs"), ("Mustard", "mustard"), ("Nuts", "nuts"),
           ("Peanuts", "peanuts"), ("Sesame", "sesame"), ("Soybeans", "soya"), ("Sulphur", "sulphites")]
HEADER_WORDS = {"Celery", "Cereals", "With", "Gluten", "Crust-", "aceans", "Egg", "Fish", "Lupin", "Milk", "Molluscs", "Mustard",
                "Nuts", "Peanuts", "Sesame", "Soybeans", "Sulphur", "Dioxide"}
# Table titles printed above the grey header rows (the first table of page 2 has none). Used only to cut tables apart.
TITLES = {"small eats", "bao buns", "handmade dim sum", "noodles and rice", "specialities", "curry's", "plant - based chicken specialities",
          "ramen and soups", "sides", "salads'", "desserts", "kids menu", "kids desserts"}
LINE_TOLERANCE = 1.5        # words whose top edges differ by less than this are on one line (points)
ROW_REACH = 9.0             # a mark/cereal/nut word must be within this many points of its row's centre
ROW_MARGIN = 2.0            # ... and at least this much closer to it than to any other row's centre


def _run(args: list[str]) -> str:
    return subprocess.run(["pdftotext", *args], check=True, capture_output=True, text=True).stdout


def _norm(s: str) -> str:
    return " ".join(s.split())


# ------------------------------------------------------------------------------------------------ calorie PDF
def read_calories(pdf: Path) -> list[tuple[str, list[tuple[str, str]]]]:
    """[(section heading, [(dish name, kcal text), ...]), ...] in printed order."""
    text = _run(["-layout", str(pdf), "-"])
    sections: list[tuple[str, list[tuple[str, str]]]] = []
    for raw in text.replace("\f", "\n").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.fullmatch(r"(.+?)\s{2,}kcal", line)
        if m:
            sections.append((_norm(m.group(1)), []))
            continue
        m = re.fullmatch(r"(.+?)\s{2,}(\d{1,4})", line)
        if m and sections:
            sections[-1][1].append((_norm(m.group(1)), m.group(2)))
            continue
        raise ValueError(f"Unreadable line in the calorie PDF: {raw!r}")
    return sections


def layout_text(pdf: Path) -> str:
    return _run(["-layout", str(pdf), "-"])


def kcal_values(text: str) -> list[str]:
    """Every 'NNNkcal' number printed in a menu's text (menus print the calories right after the dish name)."""
    return re.findall(r"(\d{1,4})\s?kcal", text)


# ------------------------------------------------------------------------------------------------ allergen PDF
def _pages(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    out = _run(["-bbox", str(pdf), "-"])
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunk)])
    return pages


def _cy(w: tuple) -> float:
    return (w[1] + w[3]) / 2


def _cx(w: tuple) -> float:
    return (w[0] + w[2]) / 2


def _find_headers(words: list[tuple]) -> list[dict]:
    """One dict per grey header row: top/bottom (points) and each column's centre x."""
    headers = []
    for w in sorted((w for w in words if w[4] == "Celery"), key=lambda w: w[1]):
        near = [v for v in words if abs(v[1] - w[1]) <= 2.0]
        if not {"Egg", "Lupin", "Molluscs", "Soybeans"} <= {v[4] for v in near}:
            continue  # the word 'Celery' in running text, not a header row
        lo, hi = w[1] - 10, w[1] + 18
        hw = [v for v in words if lo <= v[1] <= hi and v[4] in HEADER_WORDS and v[0] >= w[0] - 5]
        centres = {}
        for label, key in COLUMNS:
            found = [v for v in hw if v[4] == label]
            if len(found) != 1:
                raise ValueError(f"Allergen header: expected one {label!r} at y {w[1]:.0f}, found {len(found)}. The layout changed.")
            centres[key] = _cx(found[0])
        order = [centres[k] for _, k in COLUMNS]
        if order != sorted(order):
            raise ValueError("Allergen header columns are not in the expected order. The layout changed.")
        headers.append({"top": min(v[1] for v in hw), "bottom": max(v[3] for v in hw), "centres": centres})
    return headers


def _column_of(x: float, centres: dict[str, float]) -> str:
    return min(centres, key=lambda k: abs(centres[k] - x))


def read_allergen_rows(pdf: Path, expected: dict[str, list[str]]) -> dict[str, dict[str, dict[str, list[str]]]]:
    """For each table title in `expected` (lower-case printed title) return {printed dish name: {column key: [printed words]}}.
    `expected[title]` lists EVERY dish name the table prints, in order, upper-case as printed ("CHICKEN SATAY"). A table with a
    different set of names, or a mark that cannot be placed clearly, stops the run."""
    result: dict[str, dict[str, dict[str, list[str]]]] = {}
    for page_no, words in enumerate(_pages(pdf), start=1):
        headers = _find_headers(words)
        if not headers:
            continue
        celery_x = headers[0]["centres"]["celery"]
        cereals_x = headers[0]["centres"]["gluten"]
        name_right = celery_x - (cereals_x - celery_x) / 2  # left edge of the Celery column
        name_words = [w for w in words if w[2] <= name_right + 1.0]
        lines: list[dict] = []
        for w in sorted(name_words, key=lambda w: (w[1], w[0])):
            if lines and abs(lines[-1]["top"] - w[1]) < LINE_TOLERANCE:
                lines[-1]["words"].append(w)
            else:
                lines.append({"top": w[1], "words": [w]})
        for ln in lines:
            ln["words"].sort(key=lambda w: w[0])
            ln["text"] = _norm(" ".join(w[4] for w in ln["words"]))
            ln["cy"] = sum(_cy(w) for w in ln["words"]) / len(ln["words"])
        titles = [ln for ln in lines if ln["text"].lower() in TITLES]
        # table i = header i with the last title above it (None for the untitled first table of page 2)
        tables = []
        for h_i, h in enumerate(headers):
            above = [t for t in titles if t["top"] < h["top"] and (h_i == 0 or t["top"] > headers[h_i - 1]["bottom"])]
            tables.append({"header": h, "title": above[-1] if above else None})
        for t_i, tb in enumerate(tables):
            end = tables[t_i + 1]["title"]["top"] if t_i + 1 < len(tables) and tables[t_i + 1]["title"] else (
                tables[t_i + 1]["header"]["top"] if t_i + 1 < len(tables) else 1e9)
            tb["end"] = end
        for tb in tables:
            if tb["title"] is None:
                continue
            title = tb["title"]["text"].lower()
            if title not in expected:
                continue
            if title in result:
                raise ValueError(f"Allergen table {title!r} appears twice (page {page_no}).")
            h = tb["header"]
            body = [ln for ln in lines if h["bottom"] <= ln["cy"] and ln["top"] < tb["end"] and ln is not tb["title"]
                    and ln["text"].lower() not in TITLES]
            body = [ln for ln in body if ln["top"] > tb["title"]["top"]]
            rows = _cut_rows(body, expected[title], title, page_no)
            result[title] = _fill_rows(rows, words, h, name_right, tb["end"], title, page_no)
    missing = [t for t in expected if t not in result]
    if missing:
        raise ValueError(f"Allergen tables not found: {missing}. The guide's layout or section names changed.")
    return result


def _cut_rows(body: list[dict], names: list[str], title: str, page_no: int) -> list[dict]:
    rows = []
    i = 0
    for name in names:
        for take in (1, 2, 3):
            chunk = body[i:i + take]
            if len(chunk) == take and _norm(" ".join(c["text"] for c in chunk)) == name:
                rows.append({"name": name, "cy": sum(c["cy"] for c in chunk) / take, "cells": {}})
                i += take
                break
        else:
            seen = [c["text"] for c in body[i:i + 3]]
            raise ValueError(f"Allergen table {title!r} (page {page_no}): expected a row {name!r} but the PDF has {seen}. The menu changed.")
    if i != len(body):
        raise ValueError(f"Allergen table {title!r} (page {page_no}) has extra rows after {names[-1]!r}: {[c['text'] for c in body[i:]]}")
    return rows


def _fill_rows(rows: list[dict], words: list[tuple], h: dict, name_right: float, end: float, title: str, page_no: int) -> dict:
    centres = h["centres"]
    keys = [k for _, k in COLUMNS]
    left_edge = (centres["celery"] + name_right) / 2  # anything left of the Celery column is a dish name
    for w in sorted(words, key=lambda w: (_cy(w), w[0])):
        if _cy(w) <= h["bottom"] or w[1] >= end or w[2] <= name_right + 1.0:
            continue
        text = w[4]
        key = _column_of(_cx(w), centres)
        if text in {"Page", "of"} or re.fullmatch(r"\d+", text):
            if key not in ("gluten", "nuts"):
                continue  # the page footer ("Page 7 of 25") can sit on top of the table
        if key not in ("gluten", "nuts") and text != "Y":
            raise ValueError(f"Allergen table {title!r} (page {page_no}): unexpected text {text!r} in the {key} column.")
        order = sorted(rows, key=lambda r: abs(r["cy"] - _cy(w)))
        d1 = abs(order[0]["cy"] - _cy(w))
        d2 = abs(order[1]["cy"] - _cy(w)) if len(order) > 1 else 1e9
        if d1 > ROW_REACH or d2 - d1 < ROW_MARGIN:
            raise ValueError(f"Allergen table {title!r} (page {page_no}): cannot place {text!r} in the {key} column "
                             f"(nearest rows {order[0]['name']!r} {d1:.1f} pt, {order[1]['name']!r} {d2:.1f} pt).")
        order[0]["cells"].setdefault(key, []).append(text)
    del keys, left_edge
    return {r["name"]: r["cells"] for r in rows}
