"""Read Five Guys UK's official "Allergen, Ingredient & Nutrition Guide" PDF into rows of printed numbers.

Used by tools/uk_extract/five_guys.py. Requires `pdftotext` (poppler).

The guide is ONE very large page (about 2000 x 12000 pt) holding three tables one under the other: the allergen
matrix, the ingredient listing and, at the bottom, "NUTRITION GUIDE - UK LOCATIONS ONLY". We read only the last one.
Each nutrition row prints 9 numbers "per serving" then the same 9 "per 100 g". Only the per-serving numbers are used.
Numbers are returned exactly as printed (strings such as "0.92", "2.84", "367") so nothing is converted here.

Column order (checked against the rendered header): kJ, kcal, total fat, of which saturates, carbohydrate,
of which sugars, fibre, protein, salt.
"""
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
