"""Read Five Guys UK's official "Allergen, Ingredient & Nutrition Guide" PDF into rows of printed numbers.

Used by tools/uk_extract/five_guys.py. Requires `pdftotext` (poppler).

The guide is ONE very large page (about 2000 x 12000 pt) holding three tables one under the other: the allergen
matrix, the ingredient listing and, at the bottom, "NUTRITION GUIDE - UK LOCATIONS ONLY". We read only the last one.
Each nutrition row prints 9 numbers "per serving" then the same 9 "per 100 g". Only the per-serving numbers are used.
Numbers are returned exactly as printed (strings such as "0.92", "2.84", "367") so nothing is converted here.

Column order (checked against the rendered header): kJ, kcal, total fat, of which saturates, carbohydrate,
of which sugars, fibre, protein, salt.

The same page also gives the allergens twice (docs/DATA.md "Allergens"):
  * read_allergen_matrix(): the "ALLERGEN GUIDE - UK LOCATIONS ONLY" grid. One row per product, 14 columns (the order below,
    checked against the rendered header and against each column's own header word), each cell blank, "•" (legend: "CONTAINS AN
    ALLERGEN") or "1" (legend: "Not suitable for this allergen sufferer due to manufacturing and preparation methods"); "2"
    (breakfast hours) is in the legend but used by no row.
  * read_ingredients(): the "INGREDIENT LISTING ... (for allergens see ingredients in BOLD)" table. The bold allergen words are
    printed in capitals (checked on the rendered page), so bold_allergen_words() reads the capitalised words.
"""
from __future__ import annotations
import re
import subprocess
import tempfile
from pathlib import Path

FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')

# Geometry of the nutrition table in the 5 August 2026 PDF (points). Row labels sit left of LABEL_MAX_X; the nine
# "per serving" cells are 86 pt wide starting at SERVING_X0; the "per 100 g" cells start after SERVING_X1.
LABEL_MAX_X = 380.0
SERVING_X0 = 358.0
CELL_W = 86.0
SERVING_X1 = SERVING_X0 + CELL_W * len(FIELDS)  # 1132
ROW_TOLERANCE = 6.0  # numbers whose vertical centres are this close belong to the same row
LABEL_REACH = 28.0  # a label word this close to a row's centre belongs to that row


def _unescape(s: str) -> str:
    return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'").replace("&apos;", "'").replace("&quot;", '"')


def read_words(pdf: Path) -> list[tuple[float, float, float, float, str]]:
    with tempfile.NamedTemporaryFile(suffix=".html") as out:
        subprocess.run(["pdftotext", "-bbox", "-f", "1", "-l", "1", str(pdf), out.name], check=True)
        text = Path(out.name).read_text(encoding="utf-8")
    return [(float(a), float(b), float(c), float(d), _unescape(w)) for a, b, c, d, w in WORD.findall(text)]


def read_rows(pdf: Path) -> list[dict]:
    """Nutrition rows top to bottom. Each is {"label": printed label text, "values": {field: str} or None, "per100g_only": bool}.

    A row with no per-serving numbers but with per-100 g numbers (e.g. Bulk Peanuts) has values=None and per100g_only=True.
    """
    words = read_words(pdf)
    start = [w for w in words if w[4] == "NUTRITION" and w[0] < 400]
    if len(start) != 1:
        raise SystemExit("Could not find the 'NUTRITION GUIDE' heading exactly once: the guide's layout changed.")
    y0 = start[0][1]
    foot = [w for w in words if w[1] > y0 and w[4].startswith("*Products")]
    if not foot:
        raise SystemExit("Could not find the footnote under the nutrition table: the guide's layout changed.")
    y1 = min(w[1] for w in foot)

    region = [w for w in words if y0 < w[1] < y1]
    numeric = [w for w in region if w[0] >= LABEL_MAX_X and NUM.match(w[4])]
    centre = lambda w: (w[1] + w[3]) / 2  # noqa: E731
    numeric.sort(key=centre)

    clusters: list[list[tuple]] = []
    for w in numeric:
        if clusters and abs(centre(w) - centre(clusters[-1][-1])) <= ROW_TOLERANCE:
            clusters[-1].append(w)
        else:
            clusters.append([w])

    centres = [sum(centre(w) for w in cl) / len(cl) for cl in clusters]
    # Each label word belongs to the nearest row, if it is within LABEL_REACH of that row's centre. A one-line label sits
    # within ~3 pt of its row, the four-line "Lettuce Wrap" label within ~25 pt, while the black section bars
    # (MEAT, BURGERS, ...) are ~31 pt or more from the rows on either side, so they are never picked up.
    labels: list[list[tuple]] = [[] for _ in clusters]
    for w in region:
        if w[0] >= LABEL_MAX_X:
            continue
        j = min(range(len(centres)), key=lambda k: abs(centres[k] - centre(w)))
        if abs(centres[j] - centre(w)) <= LABEL_REACH:
            labels[j].append(w)

    rows = []
    for i, cl in enumerate(clusters):
        serving = sorted((w for w in cl if w[0] < SERVING_X1), key=lambda w: w[0])
        per100 = [w for w in cl if w[0] >= SERVING_X1]
        label_words = sorted(labels[i], key=lambda w: (round(centre(w) / 6), w[0]))
        label = " ".join(w[4] for w in label_words)
        if len(serving) == len(FIELDS):
            cols = [int((w[0] + w[2]) / 2 - SERVING_X0) // int(CELL_W) for w in serving]
            if cols != list(range(len(FIELDS))):
                raise SystemExit(f"Row {label!r}: numbers are not one per column ({cols}); the guide's layout changed.")
            rows.append({"label": label, "values": {f: w[4] for f, w in zip(FIELDS, serving)}, "per100g_only": False})
        elif not serving and per100:
            rows.append({"label": label, "values": None, "per100g_only": True})
        else:
            raise SystemExit(f"Row {label!r}: found {len(serving)} per-serving numbers (expected 9 or 0): layout changed.")
    return rows


# ---------------------------------------------------------------- allergens
# Matrix columns left to right: (allergen key, the first word fragment pdftotext gives for that column's rotated header).
MATRIX_COLUMNS = [("nuts", "Nut"), ("peanuts", "Pea"), ("sesame", "Ses"), ("milk", "Milk"), ("eggs", "Egg"), ("lupin", "L"),
                  ("soya", "Soy"), ("gluten", "Cer"), ("fish", "F"), ("crustaceans", "Cr"), ("celery", "Cele"),
                  ("molluscs", "Mol"), ("sulphites", "S"), ("mustard", "Mus")]
MATRIX_X0, MATRIX_STEP = 407.0, 110.0  # centre of the first mark column and the column pitch (points)
MARK_REACH = 6.0  # a mark's centre must be this close to its column's centre
LEGEND = ["CONTAINS AN", "ALLERGEN.", "Not suitable for this allergen sufferer", "manufacturing and preparation methods"]
HEADING_H = 24.0  # section bars (MEAT, BUN, ...) are set in bigger type than the rows (25.9 pt boxes vs 18-20 pt)
LINE_JOIN = 22.0  # a label line this close (centre to centre) below the previous one continues the same row (rows are >= 28 pt apart)


def _mid(w) -> float:
    return (w[1] + w[3]) / 2


def _lines(ws, tol: float = 3.0) -> list[list[tuple]]:
    out: list[list[tuple]] = []
    for w in sorted(ws, key=lambda w: (_mid(w), w[0])):
        if out and abs(_mid(w) - _mid(out[-1][0])) <= tol:
            out[-1].append(w)
        else:
            out.append([w])
    return [sorted(line, key=lambda w: w[0]) for line in out]


def _text(lines) -> str:
    return " ".join(" ".join(w[4] for w in line) for line in lines)


def read_allergen_matrix(pdf: Path) -> list[dict]:
    """Rows top to bottom: {"section", "label", "marks": {allergen key: "•" | "1" | "2"}}. Stops on any surprise."""
    words = read_words(pdf)
    ing = [w for w in words if w[4] == "INGREDIENT" and w[0] < 400]
    if len(ing) != 1:
        raise SystemExit("Could not find the 'INGREDIENT LISTING' heading exactly once: the guide's layout changed.")
    first_bar = [w for w in words if w[4] == "MEAT" and w[1] < ing[0][1]]
    if len(first_bar) != 1:
        raise SystemExit("Could not find the allergen grid's first section bar (MEAT): the guide's layout changed.")
    y0, y1 = first_bar[0][1] - 1, ing[0][1]
    header = [w for w in words if 140 < w[1] < y0]
    legend = _text(_lines([w for w in header if w[0] < 300]))
    missing = [p for p in LEGEND if p not in legend]
    if missing:
        raise SystemExit(f"The allergen grid's legend changed (missing {missing}): re-read what '•' and '1' mean.")
    for k, (_, frag) in enumerate(MATRIX_COLUMNS):
        c = MATRIX_X0 + k * MATRIX_STEP
        near = [w for w in header if c - 5 <= w[0] <= c + 35]
        if not near or min(near, key=lambda w: w[0])[4] != frag:
            raise SystemExit(f"Allergen grid column {k + 1}: expected the header to start with {frag!r} near x={c:.0f}; the grid changed.")

    region = [w for w in words if y0 < w[1] < y1]
    headings = [w for w in region if w[3] - w[1] > HEADING_H]
    marks = [w for w in region if w[0] >= 380 and w[4] in ("•", "1", "2") and w[3] - w[1] <= HEADING_H]
    labels = [w for w in region if w[0] < 380 and w[3] - w[1] <= HEADING_H]
    others = [w for w in region if w[0] >= 380 and w not in marks and w not in headings and not w[4].startswith(("FGJV", "FGUK", "|"))]
    if others:
        raise SystemExit(f"Unexpected text inside the allergen grid: {[w[4] for w in others]}")

    rows: list[dict] = []
    for line in _lines(labels):
        y = sum(_mid(w) for w in line) / len(line)
        if rows and y - rows[-1]["_last"] <= LINE_JOIN:
            rows[-1]["_lines"].append(line)
            rows[-1]["_last"] = y
        else:
            rows.append({"_lines": [line], "_last": y})
    head_lines = _lines(headings)
    for r in rows:
        r["y"] = sum(_mid(w) for line in r["_lines"] for w in line) / sum(len(line) for line in r["_lines"])
        r["label"] = _text(r["_lines"])
        above = [line for line in head_lines if _mid(line[0]) < r["y"]]
        r["section"] = " ".join(w[4] for w in above[-1]) if above else ""
        r["marks"] = {}
    for line in _lines(marks):
        y = sum(_mid(w) for w in line) / len(line)
        r = min(rows, key=lambda r: abs(r["y"] - y))
        if abs(r["y"] - y) > 3.0 or r["marks"]:
            raise SystemExit(f"A line of allergen marks at y={y:.0f} does not sit on one product row: the grid changed.")
        for w in line:
            k = round(((w[0] + w[2]) / 2 - MATRIX_X0) / MATRIX_STEP)
            if not 0 <= k < len(MATRIX_COLUMNS) or abs((w[0] + w[2]) / 2 - (MATRIX_X0 + k * MATRIX_STEP)) > MARK_REACH:
                raise SystemExit(f"Row {r['label']!r}: a mark at x={w[0]:.0f} is not in an allergen column: the grid changed.")
            key = MATRIX_COLUMNS[k][0]
            if key in r["marks"]:
                raise SystemExit(f"Row {r['label']!r}: two marks in the {key} column.")
            r["marks"][key] = w[4]
    return [{"section": r["section"], "label": r["label"], "marks": r["marks"]} for r in rows]


def read_ingredients(pdf: Path) -> list[dict]:
    """The ingredient listing, top to bottom: {"section", "label", "text"}. A product's label (left column, possibly two lines)
    is paired with the block of ingredient text (right column, possibly several lines) centred beside it."""
    words = read_words(pdf)
    ing = [w for w in words if w[4] == "INGREDIENT" and w[0] < 400]
    nut = [w for w in words if w[4] == "NUTRITION" and w[0] < 400]
    if len(ing) != 1 or len(nut) != 1:
        raise SystemExit("Could not find the INGREDIENT LISTING / NUTRITION GUIDE headings: the guide's layout changed.")
    region = [w for w in words if ing[0][3] < w[1] < nut[0][1]]
    headings = _lines([w for w in region if w[3] - w[1] > HEADING_H])
    body = [w for w in region if w[3] - w[1] <= HEADING_H]

    def blocks(ws) -> list[list[list[tuple]]]:
        out: list[list[list[tuple]]] = []
        for line in _lines(ws):
            if out and min(w[1] for w in line) - max(w[3] for w in out[-1][-1]) <= 3.0:
                out[-1].append(line)
            else:
                out.append([line])
        return out

    label_blocks = blocks([w for w in body if w[0] < 400])
    text_blocks = blocks([w for w in body if w[0] >= 400])
    centre = lambda b: (min(w[1] for line in b for w in line) + max(w[3] for line in b for w in line)) / 2  # noqa: E731
    rows, used = [], set()
    for lb in label_blocks:
        c = centre(lb)
        j = min(range(len(text_blocks)), key=lambda k: abs(centre(text_blocks[k]) - c))
        if abs(centre(text_blocks[j]) - c) > 6.0 or j in used:
            raise SystemExit(f"Ingredient listing: no text block sits beside {_text(lb)!r}: the layout changed.")
        used.add(j)
        above = [h for h in headings if _mid(h[0]) < c]
        rows.append({"section": " ".join(w[4] for w in above[-1]) if above else "", "label": _text(lb),
                     "text": _text(text_blocks[j])})
    if len(used) != len(text_blocks):
        raise SystemExit("Ingredient listing: some ingredient text has no product label beside it: the layout changed.")
    return rows


# Capitalised words in the ingredient listing that are not allergen names (checked against the rendered listing).
NOT_ALLERGEN_CAPS = {"OIL", "EDTA"}


def bold_allergen_words(text: str, where: str) -> list[str]:
    """The allergen words printed in bold (= capitals) in one ingredient text, e.g. 'SESAME SEEDS', 'WHEAT', 'MILK'.
    A capitalised word that is neither an allergen word nor in NOT_ALLERGEN_CAPS stops the run."""
    from common import _A
    out = []
    for run in re.findall(r"\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b", text):
        if run.lower() in _A:
            out.append(run)
            continue
        for word in run.split():
            if word.lower() in _A:
                out.append(word)
            elif word not in NOT_ALLERGEN_CAPS:
                raise SystemExit(f"{where}: capitalised word {word!r} in the ingredients is not a known allergen word: check the guide")
    return out
