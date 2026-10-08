"""Read Rola Wala's "2024 Nutrition" PDF calorie chart (page 2) by word position (pdftotext -bbox).

The chart is a matrix: seven filling columns (Chicken Tikka ... Paneer Tikka Masala) and four stacked blocks (Naan Roll (plain),
Spice Bowl (rice), Spice Bowl (cauli), Tikka Tacos) of eight rows each (Energy KCal, Fat, of which saturates, Carbohydrates, of
which sugars, Fibre, Protein, Salt). A cell is a number as printed; an unpublished cell is empty or the block says COMING SOON.
Everything is read from the page; anything unexpected (a new column, a renamed row, a number that is not a plain number) stops the run.
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

COLUMNS = ["CHICKEN TIKKA", "BUTTER CHICKEN", "NAGALAND LAMB", "BEEF MASALA", "KERALAN CHICKPEA", "RED DAL", "PANEER TIKKA MASALA"]
BLOCKS = ["NAAN ROLL (PLAIN)", "SPICE BOWL (RICE)", "SPICE BOWL (CAULI)", "TIKKA TACOS"]
# Row labels as pdftotext prints them (the chart's brackets come out mirrored: ")of which saturates(").
ROWS = [("Energy KCal", "calories"), ("Fat", "fat_g"), ("(of which saturates)", "sat_fat_g"), ("Carbohydrates", "carbs_g"),
        ("(of which sugars)", "sugar_g"), ("Fibre", "fiber_g"), ("Protein", "protein_g"), ("Salt", "salt_g")]
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
NUMBER = re.compile(r"^\d+(\.\d+)?$")
LABEL_X_MAX = 460.0  # row labels and the rotated block names sit left of the value columns
VALUES_X_MIN = 460.0


def _words(pdf: Path, page: int) -> list[dict]:
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    words = []
    for x0, y0, x1, y1, text in WORD.findall(out):
        text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        words.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), text=text, xc=(float(x0) + float(x1)) / 2, yc=(float(y0) + float(y1)) / 2))
    return words


def _normal_label(s: str) -> str:
    s = " ".join(s.split())
    return s.replace(")of which saturates(", "(of which saturates)").replace(")of which sugars(", "(of which sugars)")


def read_chart(pdf: Path, page: int = 2) -> tuple[dict, list[str]]:
    """Returns ({(block, column): {key: printed value}}, facts) where facts lists what the page says about unpublished cells.
    Only cells with a printed number are in the dict; every cell of a column that has any number must have all eight."""
    words = _words(pdf, page)
    page_text = " ".join(w["text"] for w in sorted(words, key=lambda w: (round(w["yc"]), w["xc"])))
    if "CALORIE" not in page_text or "CHART." not in page_text:
        raise SystemExit(f"page {page} is not the CALORIE CHART page: the PDF layout changed")
    # --- the seven column headers: words above the first row, right of the labels, clustered by x
    head = sorted((w for w in words if w["yc"] < 80 and w["xc"] > VALUES_X_MIN), key=lambda w: w["xc"])
    clusters: list[list[dict]] = []
    for w in head:
        if clusters and w["xc"] - clusters[-1][-1]["xc"] < 20:
            clusters[-1].append(w)
        else:
            clusters.append([w])
    names = [" ".join(w["text"] for w in sorted(c, key=lambda w: w["yc"])) for c in clusters]
    if names != COLUMNS:
        raise SystemExit(f"Column headings changed: now {names}, expected {COLUMNS}")
    centres = [sum(w["xc"] for w in c) / len(c) for c in clusters]
    # --- rows: each label word-group on the left, values on the same line to the right
    label_words = sorted((w for w in words if 380 < w["x0"] < LABEL_X_MAX and w["yc"] > 80), key=lambda w: (w["yc"], w["x0"]))
    lines: list[tuple[float, str]] = []
    for w in label_words:
        if lines and abs(lines[-1][0] - w["yc"]) < 3:
            lines[-1] = (lines[-1][0], lines[-1][1] + " " + w["text"])
        else:
            lines.append((w["yc"], w["text"]))
    lines = [(y, _normal_label(t)) for y, t in lines]
    want = [r[0] for r in ROWS] * len(BLOCKS)
    got = [t for _, t in lines]
    if got != want:
        raise SystemExit(f"Row labels changed: now {got}, expected {want}")
    # --- the block names are printed rotated at the left edge of each block (read bottom to top)
    for bi, block in enumerate(BLOCKS):
        top, bottom = lines[bi * len(ROWS)][0] - 12, lines[bi * len(ROWS) + len(ROWS) - 1][0] + 12
        rotated = sorted((w for w in words if 360 < w["x0"] < 370 and top <= w["yc"] <= bottom), key=lambda w: -w["yc"])
        printed = " ".join(w["text"] for w in rotated)
        if printed != block:
            raise SystemExit(f"Block {bi + 1} is headed {printed!r}, expected {block!r}")
    values_words = [w for w in words if w["x0"] >= VALUES_X_MIN and w["yc"] > 80 and NUMBER.match(w["text"])]
    other = [w for w in words if w["x0"] >= VALUES_X_MIN and w["yc"] > 80 and not NUMBER.match(w["text"]) and w["text"] not in ("COMING", "SOON")]
    if other:
        raise SystemExit(f"Unexpected text in the value area: {[w['text'] for w in other]}")
    cells: dict = {}
    for bi, block in enumerate(BLOCKS):
        for ri, (_, key) in enumerate(ROWS):
            y = lines[bi * len(ROWS) + ri][0]
            for w in values_words:
                if abs(w["yc"] - y) < 3:
                    ci = min(range(len(centres)), key=lambda i: abs(centres[i] - w["xc"]))
                    if abs(centres[ci] - w["xc"]) > 15:
                        raise SystemExit(f"{block} {key}: value {w['text']!r} is not under a column heading")
                    k = (block, COLUMNS[ci])
                    if key in cells.setdefault(k, {}):
                        raise SystemExit(f"{block} {key} {COLUMNS[ci]}: two values on one row")
                    cells[k][key] = w["text"]
    n_cells = sum(len(v) for v in cells.values())
    if len(values_words) != n_cells:
        raise SystemExit(f"{len(values_words)} numbers on the page but {n_cells} were placed in the grid: layout changed")
    # --- a column in a block has all eight numbers or none
    for k, v in cells.items():
        if sorted(v) != sorted(r[1] for r in ROWS):
            raise SystemExit(f"{k}: only {sorted(v)} printed, expected all eight rows")
    # --- what the page says about the cells that are empty: COMING SOON markers (position noted)
    soon = [(round(w["xc"]), round(w["yc"])) for w in words if w["text"] == "COMING"]
    facts = []
    for x, y in sorted(soon):
        # which column(s) and block does this marker sit in?
        ci = min(range(len(centres)), key=lambda i: abs(centres[i] - x))
        bi = sum(1 for yy, t in lines if t == "Energy KCal" and yy <= y + 1) - 1
        facts.append(f"COMING SOON at x={x} y={y}: block {BLOCKS[bi]}, nearest column {COLUMNS[ci]}")
    return cells, facts
