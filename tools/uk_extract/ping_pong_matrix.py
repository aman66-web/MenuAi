"""Reader for Ping Pong's own "Allergen Matrix / Free From Menus" PDF (one A3 matrix page + 21 "Made without ..." pages).

    https://www.pingpongdimsum.com/wp-content/uploads/2025/06/Ping_Pong_Allergen_Matrix_Free_From_Menus_100625.pdf
    (23 pages; "Allergen Info Free from MATRIX - 2025 06.xlsx" printed to PDF on 8 June 2025; linked as "Allergen Matrix" from
    https://www.pingpongdimsum.com/menus/; the pages say "Last updated on 08/06/2025").

Page 1 is "Summer 2025 Allergen List": one row per dish, one column per allergen, a printed "x" where the dish has it. Columns 4-17 are
the 14 UK allergens (Celery ... Sulphur dioxide); columns 18-33 are "Additional allergens & Ingredient" flags (Onion, Garlic, Gluten, Wheat,
Seafood, Shellfish, Beef, Pork, Chilli, MSG ...), which are NOT part of the 14 and are not published. The marks are text ("x"), so each
mark is placed in its column by the x position of the word (`pdftotext -bbox`) against the printed column numbers.

Pages 3-23 are the chain's own "Made without <allergen>" menus: the same dishes in the same order, each with the chain's dish CODE
(the number the nutrition guide also prints), and a dish's name and price are shown only when the dish does NOT contain that allergen.
That is a second, independent encoding of the matrix inside the same file, used twice here:
  1. code <-> matrix row: row i of every "Made without" page is row i of the code list (55 dishes; six desserts have no code);
  2. every mark in 21 columns (11 allergen columns of the 14, plus 10 additional flags) is cross-checked: a dish is named on the
     "Made without X" page exactly when the matrix has no x in column X (1,155 cells). Lupin and sulphur dioxide have no such page.
Everything stops with a clear message when the file no longer looks like this (header words, column numbers, row counts, order).
Needs `pdftotext` and `pdfinfo` (poppler). Python 3.9 compatible.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

PAGES = 23
# printed column number -> printed header (words joined without spaces, lower case; the header wraps over lines)
COLUMN_HEADERS = {
    4: "celery", 5: "cereals", 6: "crustacean", 7: "eggs", 8: "fish", 9: "lupin", 10: "milk", 11: "molluscs", 12: "mustard",
    13: "nuts", 14: "peanuts", 15: "sesame", 16: "soya", 17: "sulphurdioxide",
    18: "onion", 19: "garlic", 20: "allium", 21: "alcohol", 22: "mushrooms", 23: "gluten", 24: "seafood", 25: "shellfish",
    26: "beef", 27: "pork", 28: "ch'ckn/duck", 29: "meat", 30: "chilli", 31: "wheat", 32: "testedgf", 33: "msg(e621)",
}
ALLERGEN_COLUMNS = list(range(4, 18))      # the 14 allergens, as printed (column 5 "Cereals" = cereals containing gluten)
NAME_X_MAX = 184.0                          # the dish-name column ends here; allergen column 4 (Celery) starts right of it
HEADINGS = {"NOODLES & SOUPS", "RICE", "SHARING", "DIM SUMMER SPECIALS", "DIM SUM", "CRISPY", "BUNS", "STEAMED",
            "GRILLED GYOZA & DUMPLINGS", "DESSERTS", "ice creams & sorbets", "Set Menu items (not sold separately)"}
FIRST_HEADING = "NIBBLES"                   # carries the column numbers, so it is read as the table's first row
# dishes the matrix prints with no mark at all (a blank row: no allergen of any column)
BLANK_ROWS = {"steamed jasmine rice vg gf", "pear sorbet vg gf", "mango sorbet vg gf"}
# the six matrix rows that the "Made without" pages do not list (no dish code)
NO_CODE_ROWS = ["vegan passion fruit and mango mochi vg gf", "vegan berry mochi v gf", "chocolate ice cream v gf",
                "vanilla ice cream v gf", "pear sorbet vg gf", "mango sorbet vg gf"]
EXPECTED_DISHES = 61
EXPECTED_CODED = 55
# "Made without X" page -> printed column number(s) of the matrix it must agree with (title as printed under "Made without")
FREE_FROM_PAGES = {
    3: ("allium", [20]), 4: ("beef", [26]), 5: ("celery", [4]), 6: ("cereals", [5]), 7: ("chilli", [30]), 8: ("crustacean", [6]),
    9: ("eggs", [7]), 10: ("fish", [8]), 11: ("garlic", [19]), 12: ("meat", [29]), 13: ("milk", [10]), 14: ("molluscs", [11]),
    15: ("msg(e621)", [33]), 16: ("mushrooms", [22]), 17: ("mustard", [12]), 18: ("nuts+peanuts", [13, 14]), 19: ("onion", [18]),
    20: ("seafood", [24]), 21: ("sesame", [15]), 22: ("shellfish", [25]), 23: ("soya", [16]),
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _page_words(pdf: Path, p: int) -> list:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(p), "-l", str(p), str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(w))
            for a, b, c, d, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', out)]


def _lines(words: list, tol: float = 2.5) -> list:
    res: list = []
    for w in sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        yc = (w[1] + w[3]) / 2
        if res and abs(res[-1][0] - yc) <= tol:
            res[-1][1].append(w)
        else:
            res.append([yc, [w]])
    return [(y, sorted(ws, key=lambda w: w[0])) for y, ws in res]


def read_matrix_page(pdf: Path) -> list:
    """Page 1 -> [{"name": printed dish name, "section": printed heading, "marks": set of printed column numbers}] in print order."""
    lines = _lines(_page_words(pdf, 1))
    num_y, centres = None, {}
    for y, l in lines:
        ns = [x for x in l if re.fullmatch(r"\d{1,2}", x[4]) and 4 <= int(x[4]) <= 33]
        if len(ns) >= 25:
            num_y, centres = y, {int(x[4]): (x[0] + x[2]) / 2 for x in ns}
            break
    if num_y is None or sorted(centres) != list(range(4, 34)):
        raise SystemExit("Allergen matrix page 1: the column numbers 4..33 are not printed in one row any more: the layout changed.")

    def column_of(x: tuple) -> int:
        cx = (x[0] + x[2]) / 2
        n, c = min(centres.items(), key=lambda t: abs(t[1] - cx))
        if abs(c - cx) > 10:
            raise SystemExit(f"Allergen matrix page 1: the word {x[4]!r} at x={cx:.0f} lies between two columns.")
        return n

    header: dict = {}
    for y, l in lines:
        if num_y - 24 < y < num_y:
            for x in l:
                if x[0] > NAME_X_MAX and x[4] != "Allergen":
                    try:
                        header.setdefault(column_of(x), []).append(x[4])
                    except SystemExit:
                        pass                       # banner words ("Allergen present in dish is marked with a 'x'")
    got = {c: "".join(ws).lower() for c, ws in header.items()}
    for c, want in COLUMN_HEADERS.items():
        # the banner line sits above the header row and is cut off by the y window; a column header must match exactly
        if got.get(c) != want:
            raise SystemExit(f"Allergen matrix page 1: column {c} is headed {got.get(c)!r}, expected {want!r}: the columns changed.")

    rows, section = [], None
    for y, l in lines:
        if y <= num_y + 1:
            continue
        name_words = [x for x in l if x[2] < NAME_X_MAX]
        right = [x for x in l if x[0] >= NAME_X_MAX]
        if not name_words:
            if right:
                raise SystemExit(f"Allergen matrix page 1: a row with marks but no dish name at y={y:.0f}.")
            continue
        name = " ".join(x[4] for x in name_words)
        if name.startswith("(H) denotes"):
            break
        if name == FIRST_HEADING or name in HEADINGS:
            if name != FIRST_HEADING and right:
                raise SystemExit(f"Allergen matrix page 1: the heading {name!r} carries marks.")
            section = name
            continue
        stray = [x[4] for x in right if x[4] != "x"]
        if stray:
            raise SystemExit(f"Allergen matrix page 1: {name!r} has printed cells other than 'x': {stray}.")
        marks = {column_of(x) for x in right}
        if not marks and name not in BLANK_ROWS:
            raise SystemExit(f"Allergen matrix page 1: the row {name!r} has no mark and is not a known blank row or heading: "
                             "a new heading or a layout change.")
        if len(marks) != len(right):
            raise SystemExit(f"Allergen matrix page 1: {name!r} has two marks in one column.")
        rows.append({"name": name, "section": section, "marks": marks})
    if len(rows) != EXPECTED_DISHES:
        raise SystemExit(f"Allergen matrix page 1 has {len(rows)} dish rows, expected {EXPECTED_DISHES}: the menu changed. "
                         "Re-check the dish mapping in ping_pong.py.")
    names = [norm(r["name"]) for r in rows]
    if len(set(names)) != len(names):
        raise SystemExit("Allergen matrix page 1: the same dish name is printed twice; the rows would have to agree exactly "
                         "(they are not published until a person decides).")
    for r in rows:
        missing = {23, 31} & r["marks"]
        if missing and 5 not in r["marks"]:
            raise SystemExit(f"Allergen matrix: {r['name']!r} marks Gluten/Wheat but not Cereals: decide how to read it.")
    return rows


def read_free_from_pages(pdf: Path) -> dict:
    """Pages 3-23 -> {page: {"col": printed column number, "title": printed allergen title, "rows": [{"code", "name" or None}]}}."""
    out = {}
    for p in sorted(FREE_FROM_PAGES):
        lines = _lines(_page_words(pdf, p))
        head = [" ".join(x[4] for x in l) for y, l in lines if y < 90]
        m = re.fullmatch(r"Made without (\d+) Jun-25", head[1]) if len(head) > 2 else None
        if not m:
            raise SystemExit(f"Allergen PDF page {p} is not a 'Made without ...' page any more: the file changed.")
        title = head[2]
        rows = []
        for y, l in lines:
            if y < 84:
                continue
            first = l[0]
            if first[0] < 75 and (re.fullmatch(r"\d+", first[4]) or first[4] == "b"):
                nm = " ".join(x[4] for x in l if 75 <= x[0] < 236)
                rows.append({"code": first[4], "name": nm or None})
        out[p] = {"col": int(m.group(1)), "title": title, "rows": rows}
    return out


def read_allergen_pdf(pdf: Path) -> dict:
    """Everything the script needs: matrix rows, the code of each coded row, and the cross-check report."""
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    pages = re.search(r"^Pages:\s+(\d+)", info, re.M)
    if not pages or int(pages.group(1)) != PAGES:
        raise SystemExit(f"The allergen PDF has {pages.group(1) if pages else '?'} pages, expected {PAGES}: the file changed.")
    rows = read_matrix_page(pdf)
    ff = read_free_from_pages(pdf)
    base = None
    for p, d in ff.items():
        title, cols = FREE_FROM_PAGES[p]
        printed_col = d["col"]
        if norm(d["title"]) != norm(title) or (printed_col not in cols and not (title == "nuts+peanuts" and printed_col == 38)):
            raise SystemExit(f"Allergen PDF page {p} is titled {d['title']!r} (column {printed_col}), expected {title!r}.")
        codes = [r["code"] for r in d["rows"]]
        if len(codes) != EXPECTED_CODED:
            raise SystemExit(f"Allergen PDF page {p} lists {len(codes)} dish codes, expected {EXPECTED_CODED}.")
        if base is None:
            base = codes
        elif codes != base:
            raise SystemExit(f"Allergen PDF page {p} lists a different code sequence from page 3: the 'Made without' pages disagree.")
    if len(set(base)) != len(base):
        raise SystemExit("The 'Made without' pages print a dish code twice.")
    # align: matrix dishes minus the six with no code = the coded list, in order (a clipped name may lose its first letters)
    coded = [r for r in rows if r["name"] not in NO_CODE_ROWS]
    if len(coded) != EXPECTED_CODED:
        raise SystemExit("Allergen PDF: the six uncoded rows are not all present in the matrix.")
    union_names = []
    for i in range(EXPECTED_CODED):
        names = {d["rows"][i]["name"] for d in ff.values() if d["rows"][i]["name"]}
        # the same dish is printed identically on every page that names it, except where the cell clips a long name
        longest = max(names, key=len) if names else None
        union_names.append(longest)
    code_of = {}
    for i, (row, un) in enumerate(zip(coded, union_names)):
        if un is None or not (norm(row["name"]) == norm(un) or norm(row["name"]).endswith(norm(un))):
            raise SystemExit(f"Allergen PDF: code list row {i} ({base[i]}) is named {un!r} but the matrix row in that position is "
                             f"{row['name']!r}: the two lists are not in the same order.")
        code_of[row["name"]] = base[i]
    # cross-check every mark of 21 columns against the "Made without" pages
    compared = 0
    for p, d in ff.items():
        cols = FREE_FROM_PAGES[p][1]
        for i, row in enumerate(coded):
            named = d["rows"][i]["name"] is not None
            has = any(c in row["marks"] for c in cols)
            if named == has:
                raise SystemExit(f"Allergen PDF: on the 'Made without {d['title']}' page {row['name']!r} is "
                                 f"{'named' if named else 'not named'} but the matrix {'has' if has else 'has no'} mark in column {cols}.")
            compared += 1
    report = {"matrix_rows": len(rows), "coded_rows": len(coded), "made_without_pages": len(ff), "cells_cross_checked": compared,
              "marks_total": sum(len(r["marks"]) for r in rows)}
    return {"rows": rows, "code_of": code_of, "report": report}
