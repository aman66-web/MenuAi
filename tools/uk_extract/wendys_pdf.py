"""Read Wendy's UK's official "Nutrition Information" PDF into rows of printed numbers.

Used by tools/uk_extract/wendys.py. Requires `pdftotext` (poppler).

The guide is a 2-page Excel print-out (2040 x 2640 pt pages). Each row prints: weight in g, then kcal, fat, saturated
fat, carbohydrates, sugars, fibre, protein, salt (all "per menu item as sold"; there is no kJ column), then allergen ticks
to the right. Red section bars (HAMBURGERS, CHICKEN, ...) are set in much larger type than the rows. Numbers are
returned exactly as printed (strings such as "0.04", "34.9", "1195"); nothing is converted here.

Column order (checked against the rendered header): Grams, Energy (kcal), Fat, Saturated Fat, Carbohydrates, Sugars,
Fibre, Protein, Salt.

Allergens: ten columns to the right of the numbers (Celery, Egg, Fish, Barley (Gluten), Rye (Gluten), Milk, Mustard, Soy,
Wheat (Gluten), Sesame; the column names are rotated). The guide's "Allergen Key": "✓" = "Menu item contains the allergen",
a filled dot (the text layer gives the letter "l" of a symbol font) = "Menu item may contain the allergen". Each row's marks
are returned by column name; a mark outside a column, or text among the columns, stops the run.
"""
from __future__ import annotations
import re
import subprocess
import tempfile
from pathlib import Path

FIELDS = ("weight", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')

LABEL_MAX_X = 480.0     # row names sit left of this
NUM_MIN_X, NUM_MAX_X = 480.0, 1090.0   # the nine nutrient cells (allergen ticks start further right)
# Centre of each of the nine cells (points), measured on both pages of the September 2026 PDF.
COLUMN_X = (529.0, 640.0, 695.0, 750.0, 805.0, 861.0, 916.0, 971.0, 1026.0)
COLUMN_TOLERANCE = 28.0
ROW_TOLERANCE = 6.0
BIG_TEXT_HEIGHT = 30.0  # section bars and the page title
ALLERGEN_MIN_X = 1100.0  # the allergen marks sit right of this
ALLERGEN_COLUMNS = ("Celery", "Egg", "Fish", "Barley", "Rye", "Milk", "Mustard", "Soy", "Wheat", "Sesame")
ALLERGEN_TOLERANCE = 10.0  # pt between a mark's centre and its column name's centre (columns are 55 pt apart)
CONTAINS_MARK, MAY_MARK = "✓", "l"  # the key's "contains" tick and "may contain" dot (symbol font "l")
TITLE_BOTTOM = 330.0    # everything above this on page 1 is the title block / column headings


def _unescape(s: str) -> str:
    return (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'")
            .replace("&apos;", "'").replace("&quot;", '"'))


def read_words(pdf: Path) -> list[list[tuple]]:
    """Words of each page: (xMin, yMin, xMax, yMax, text)."""
    with tempfile.NamedTemporaryFile(suffix=".html") as out:
        subprocess.run(["pdftotext", "-bbox", str(pdf), out.name], check=True)
        text = Path(out.name).read_text(encoding="utf-8")
    pages = []
    for chunk in text.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), _unescape(w)) for a, b, c, d, w in WORD.findall(chunk)])
    return pages


def read_rows(pdf: Path) -> list[dict]:
    """Rows top to bottom (page 1 then page 2): {"section", "label", "values": {field: str}}.

    Stops with SystemExit if a row doesn't have exactly nine numbers in the nine expected columns, or if any
    non-numeric word sits among the number columns: the layout changed and a human must look.
    """
    pages = read_words(pdf)
    if len(pages) != 2:
        raise SystemExit(f"Expected a 2-page PDF, found {len(pages)} pages: the guide's layout changed.")
    centre = lambda w: (w[1] + w[3]) / 2  # noqa: E731
    # Allergen column names (rotated) on page 1's header, left to right; marks on both pages line up with them.
    heads = sorted((w for w in pages[0] if ALLERGEN_MIN_X <= w[0] and 290 < w[1] < 400 and not w[4].startswith("(")), key=lambda w: w[0])
    if tuple(w[4] for w in heads) != ALLERGEN_COLUMNS:
        raise SystemExit(f"The allergen columns are now {[w[4] for w in heads]}, expected {list(ALLERGEN_COLUMNS)}. Layout changed.")
    col_x = [((w[0] + w[2]) / 2, w[4]) for w in heads]
    rows: list[dict] = []
    section = ""
    for page_no, words in enumerate(pages, start=1):
        # The note under the table (page 2) starts at "Allergen Key"; nothing below it is table.
        foot = [w for w in words if w[4] == "Allergen" and w[0] < 400]
        y_end = min(w[1] for w in foot) - 5 if foot else float("inf")
        in_table = lambda w: w[3] <= y_end and (page_no == 2 or w[1] > TITLE_BOTTOM + 90)  # noqa: E731

        # Section bars: words in big type. Smaller words on the same bar (e.g. "INCLUDES TOPPINGS & DRESSINGS") join the heading.
        big = sorted((w for w in words if (w[3] - w[1]) > BIG_TEXT_HEIGHT and w[3] <= y_end and (page_no == 2 or w[1] > TITLE_BOTTOM)),
                     key=lambda w: (round(centre(w) / 20), w[0]))
        bar_ys: list[float] = []
        for w in big:
            if not bar_ys or abs(bar_ys[-1] - centre(w)) > 20:
                bar_ys.append(centre(w))
        bar_text: list[tuple[float, str]] = []  # (y centre, heading)
        for by in bar_ys:
            parts = sorted((w for w in words if abs(centre(w) - by) <= 25 and w[0] >= LABEL_MAX_X and w[3] <= y_end and (page_no == 2 or w[1] > TITLE_BOTTOM)),
                           key=lambda w: w[0])
            bar_text.append((by, " ".join(w[4] for w in parts)))
        bar_band = [(by - 25, by + 25) for by in bar_ys]

        body = [w for w in words if in_table(w) and not any(lo <= centre(w) <= hi and w[0] >= LABEL_MAX_X for lo, hi in bar_band)]
        numeric = [w for w in body if NUM_MIN_X <= w[0] < NUM_MAX_X and NUM.match(w[4])]
        stray = [w for w in body if NUM_MIN_X <= w[0] < NUM_MAX_X and not NUM.match(w[4])]
        if stray:
            raise SystemExit(f"Page {page_no}: non-numeric text among the nutrient columns: {[w[4] for w in stray][:5]}. Layout changed.")
        numeric.sort(key=centre)
        clusters: list[list[tuple]] = []
        for w in numeric:
            if clusters and abs(centre(w) - centre(clusters[-1][0])) <= ROW_TOLERANCE:
                clusters[-1].append(w)
            else:
                clusters.append([w])
        labelwords = [w for w in body if w[0] < LABEL_MAX_X]
        marks = [w for w in body if w[0] >= ALLERGEN_MIN_X]
        odd = [w[4] for w in marks if w[4] not in (CONTAINS_MARK, MAY_MARK)]
        if odd:
            raise SystemExit(f"Page {page_no}: unexpected text among the allergen columns: {odd[:5]}. Layout changed.")
        placed: set[int] = set()

        events = [(y, "bar", t) for y, t in bar_text] + [(sum(centre(w) for w in cl) / len(cl), "row", cl) for cl in clusters]
        events.sort(key=lambda e: e[0])
        for y, kind, payload in events:
            if kind == "bar":
                section = payload
                continue
            cl = sorted(payload, key=lambda w: w[0])
            if len(cl) != len(FIELDS):
                raise SystemExit(f"Page {page_no}, y={y:.0f}: a row has {len(cl)} numbers, expected {len(FIELDS)}: "
                                 f"{[w[4] for w in cl]}. Layout changed.")
            for w, cx in zip(cl, COLUMN_X):
                if abs((w[0] + w[2]) / 2 - cx) > COLUMN_TOLERANCE:
                    raise SystemExit(f"Page {page_no}, y={y:.0f}: number {w[4]!r} is not in its expected column. Layout changed.")
            lw = sorted((w for w in labelwords if abs(centre(w) - y) <= ROW_TOLERANCE), key=lambda w: w[0])
            label = " ".join(w[4] for w in lw)
            if not label:
                raise SystemExit(f"Page {page_no}, y={y:.0f}: a row of numbers has no name. Layout changed.")
            allergens: dict[str, list[str]] = {"contains": [], "may_contain": []}
            for i, m in enumerate(marks):
                if abs(centre(m) - y) > ROW_TOLERANCE:
                    continue
                mx = (m[0] + m[2]) / 2
                cx, name = min(col_x, key=lambda c: abs(c[0] - mx))
                if abs(cx - mx) > ALLERGEN_TOLERANCE:
                    raise SystemExit(f"Page {page_no}, {label!r}: an allergen mark at x={mx:.0f} is not under a column. Layout changed.")
                if i in placed:
                    raise SystemExit(f"Page {page_no}, {label!r}: an allergen mark is beside two rows. Layout changed.")
                placed.add(i)
                kind = "contains" if m[4] == CONTAINS_MARK else "may_contain"
                if name in allergens["contains"] + allergens["may_contain"]:
                    raise SystemExit(f"Page {page_no}, {label!r}: two marks in the {name} column. Layout changed.")
                allergens[kind].append(name)
            for kind in allergens:
                allergens[kind].sort(key=ALLERGEN_COLUMNS.index)
            rows.append({"section": section, "label": label, "values": {f: w[4] for f, w in zip(FIELDS, cl)},
                         "allergens": allergens})
        if len(placed) != len(marks):
            raise SystemExit(f"Page {page_no}: {len(marks) - len(placed)} allergen marks are not beside any row. Layout changed.")
    return rows
