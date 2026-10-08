"""Readers for Norse Catering's two official primary-school PDFs (Norfolk catering hub, norsegroup.co.uk/catering-hub/), used by
norse_catering.py. Requires `pdftotext` (poppler). Standard library only. Numbers come back exactly as printed (strings).

1. "Nutrition Analysis for Primary Menu, Spring/Summer 2026" (9 pages, an Excel export, PDF dated 26 March 2026). One table per
   menu day ("Week 1 - Monday" ... "Week 3 - Friday"; the 3-week rotation). Columns, left to right: Menu Item, Portion, Energy (Kcal) Per
   Portion, Fat (g) Per Portion, Saturates (g) Per Portion, Carb (g) Per Portion, Protein (g) Per Portion, Carb (g) Per 100g. Each day
   lists the hot meal first and the packed-lunch choices after a gap, so a dish repeats on several days. A last table (Jacket Potato and
   fillings) has no Fat and no Protein column. Rows are read two ways, which must agree: by word position (`pdftotext -bbox`, the main
   reader) and from the `pdftotext -layout` text (`layout_rows`, the cross-check).
The allergen chart (a second PDF) is NOT read: its dish names differ from the analysis's ("Marble Shortbread" / "Marble Shortbread (Bitesize)",
   "Plant Sausages (v)" / "Plant Sausage Hot Dog (v)", cooking-state suffixes such as "(uncooked)" on one side only) and its rows are in
   a different order on some days, so the dishes cannot all be matched exactly (docs/DATA.md: all or nothing): the chain publishes the
   chart's link only.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
NUM = r"\d+(?:\.\d+)?"
HEADING = re.compile(r"^Week (\d) - (Monday|Tuesday|Wednesday|Thursday|Friday)$")
UNIT_WORDS = {"each", "tbsp", "tsp", "slice", "slices", "portion"}
ROW_TOLERANCE = 4.0     # words of one printed row sit within about 3 pt of each other; rows are 12+ pt apart


def pages(pdf: Path) -> list:
    """[[(xMin, yMin, xMax, yMax, text)]] per page, from pdftotext -bbox."""
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    result = []
    for chunk in out.split("<page ")[1:]:
        result.append([(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(chunk)])
    return result


def lines_of(words: list) -> list:
    """Group a page's words into printed lines (top to bottom, each left to right)."""
    lines: list = []
    start = None
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and w[1] - start <= ROW_TOLERANCE:
            lines[-1].append(w)
        else:
            lines.append([w])
            start = w[1]
    return [sorted(l, key=lambda w: w[0]) for l in lines]


# ---------------------------------------------------------------- nutrition analysis

def _split_row(tokens: list, n_values: int, where: str):
    """tokens of one row -> (name, portion text, [value tokens]) or None when the row has no figures. The last `n_values` tokens are
    the figures, the token(s) before them the portion ('89.95g', '1 each', '1 tbsp'), everything before that the name."""
    if len(tokens) < n_values + 2:
        return None
    values = tokens[-n_values:]
    if not all(re.fullmatch(NUM + r"(?:kcal|g)", v) for v in values):
        return None
    rest = tokens[:-n_values]
    if re.fullmatch(NUM + "g", rest[-1]):
        portion, name = rest[-1], rest[:-1]
    elif rest[-1] in UNIT_WORDS and len(rest) >= 2 and re.fullmatch(NUM, rest[-2]):
        portion, name = f"{rest[-2]} {rest[-1]}", rest[:-2]
    else:
        raise SystemExit(f"{where}: cannot read the portion in {tokens}")
    return " ".join(name), portion, values


def read_nutrition(pdf: Path):
    """Returns (rows, jacket_rows). rows: dicts {week, day, name, portion, energy, fat, sat, carb, protein, carb100} for every dish row
    of the 15 day tables, in printed order, as printed strings ('184.75kcal' -> energy '184.75', unit kept in `energy_unit`). Name-only
    lines (no figures: 'Fresh Fruit Platter', 'Fruit Portion') come back in `rows` with portion None. jacket_rows: the last table's
    rows {name, portion, energy, sat, carb, carb100} (it has no Fat or Protein column)."""
    rows: list = []
    jacket: list = []
    table, week, day = None, None, None
    header_seen: dict = {}
    pending = None
    for pi, words in enumerate(pages(pdf), 1):
        for line in lines_of(words):
            tokens = [w[4] for w in line]
            text = " ".join(tokens)
            where = f"page {pi}: {text!r}"
            m = HEADING.match(text)
            if m:
                week, day, table, pending = int(m.group(1)), m.group(2), "day", None
                header_seen = {"day": False}
                continue
            if text.startswith("These values are correct") or text.startswith("We advise the contents"):
                table, pending = ("after" if table else table), None
                continue
            if "Energy" in tokens and "(Kcal)" in tokens:    # first line of a table header
                if table == "after":
                    table = "jacket"
                    header_seen = {"jacket": False}
                pending = None
                continue
            if tokens[:2] == ["Menu", "Item"] or (tokens and tokens[0] == "Portion" and set(tokens) <= {"Portion", "Carb", "(g)", "Per", "100g"}):
                pending = None      # the other header lines; their column order is checked once, in header_order()
                continue
            if table is None or table == "after":
                continue
            if table == "day":
                parsed = _split_row(tokens, 6, where)
                if parsed is None:
                    if tokens and not any(re.fullmatch(NUM + r"(?:kcal|g)", t) for t in tokens):
                        # a name on a line of its own: either a dish whose figures follow on the next line, or a dish with no figures
                        if pending is not None:
                            rows.append(_row(week, day, pending, None, None))
                        pending = " ".join(tokens)
                        continue
                    # a line of figures only (its name is the line above)
                    if pending is not None and re.fullmatch(NUM + "g|" + NUM + "kcal", tokens[-1]):
                        name, portion, values = _split_row(["X"] + tokens, 6, where)
                        rows.append(_row(week, day, pending, portion, values))
                        pending = None
                        continue
                    raise SystemExit(f"{where}: cannot read this row")
                name, portion, values = parsed
                if pending is not None:
                    rows.append(_row(week, day, pending, None, None))
                    pending = None
                rows.append(_row(week, day, name, portion, values))
            elif table == "jacket":
                parsed = _split_row(tokens, 4, where)
                if parsed is None:
                    if tokens and not any(re.fullmatch(NUM + r"(?:kcal|g)", t) for t in tokens):
                        jacket.append({"name": " ".join(tokens), "portion": None})
                        continue
                    raise SystemExit(f"{where}: cannot read this row")
                name, portion, values = parsed
                jacket.append({"name": name, "portion": portion, "energy": values[0], "sat": values[1], "carb": values[2], "carb100": values[3]})
    if pending is not None:
        rows.append(_row(week, day, pending, None, None))
    return rows, jacket


def _row(week, day, name, portion, values):
    if portion is None:
        return {"week": week, "day": day, "name": name, "portion": None}
    energy, fat, sat, carb, protein, carb100 = values
    unit = "kcal" if energy.endswith("kcal") else "g"
    return {"week": week, "day": day, "name": name, "portion": portion, "energy": energy[:-4] if unit == "kcal" else energy[:-1],
            "energy_unit": unit, "fat": fat[:-1], "sat": sat[:-1], "carb": carb[:-1], "protein": protein[:-1], "carb100": carb100[:-1]}


def header_order(pdf: Path) -> list:
    """For every table header in the PDF, the left-to-right order of its column titles, from the words' x positions. Day tables must all
    read ['Energy', 'Fat', 'Saturates', 'Carb', 'Protein', 'Carb100']; the last table ['Energy', 'Saturates', 'Carb', 'Carb100']."""
    out = []
    for words in pages(pdf):
        cur: list = []
        for line in lines_of(words):
            tokens = [w[4] for w in line]
            text = " ".join(tokens)
            is_head = ("Energy" in tokens and "(Kcal)" in tokens) or tokens[:2] == ["Menu", "Item"] or \
                (tokens and tokens[0] == "Portion" and set(tokens) <= {"Portion", "Carb", "(g)", "Per", "100g"})
            if is_head:
                cur += line
            elif cur:
                out.append(_titles(cur))
                cur = []
        if cur:
            out.append(_titles(cur))
    return out


def _titles(words: list) -> list:
    titles = []
    for w in sorted(words, key=lambda w: w[0]):
        t = w[4]
        if t in ("Energy", "Fat", "Saturates", "Protein"):
            titles.append((w[0], t))
        elif t == "Carb":
            per100 = any(x[4] == "100g" for x in words if x[1] == w[1] and w[0] < x[0] < w[0] + 60)
            titles.append((w[0], "Carb100" if per100 else "Carb"))
    return [t for _, t in sorted(titles)]


def layout_rows(pdf: Path) -> list:
    """The cross-check: every dish row with figures read from `pdftotext -layout` text by a regular expression:
    [(week, day, name, portion, energy token, fat, sat, carb, protein, carb100)] (figures as printed, units removed)."""
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    rx = re.compile(r"^(?P<name>\S.*?)\s{2,}(?P<portion>" + NUM + r"g|" + NUM + r" (?:each|tbsp|tsp|slice|slices|portion))\s+(?P<e>" + NUM +
                    r")(?P<eu>kcal|g)\s+(?P<f>" + NUM + r")g\s+(?P<s>" + NUM + r")g\s+(?P<c>" + NUM + r")g\s+(?P<p>" + NUM + r")g\s+(?P<c100>" + NUM + r")g\s*$")
    out, week, day = [], None, None
    for raw in text.splitlines():
        s = raw.strip()
        m = HEADING.match(s)
        if m:
            week, day = int(m.group(1)), m.group(2)
            continue
        m = rx.match(raw)
        if m and week is not None:
            out.append((week, day, m.group("name").strip(), m.group("portion"), m.group("e") + ("" if m.group("eu") == "kcal" else "g"),
                        m.group("f"), m.group("s"), m.group("c"), m.group("p"), m.group("c100")))
    return out
