"""Reader for GAIL's "Beverages Nutrition & Allergen Guide" PDF (CoffeeMatrix_Autumn_26.pdf), used by gails.py.

The guide is a table with a text layer: TITLE | KCAL PER 100g | KCAL PER PORTION | ALLERGENS | DIETARY (V / VN). Each row's two
numbers sit on the row's middle line while its title takes one or two lines above and below, so the page is read by position
(`pdftotext -bbox`): every word is given to the row whose number line is nearest to it. Needs `pdftotext` and `pdfinfo` (poppler).
Section pages (COFFEE, TEA, MATCHA, HOT / ICED CHOCOLATE, SPROUD DRINK) carry only a big heading.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
NUMBER = re.compile(r"^(<?\d+(\.\d+)?|>\d+(\.\d+)?|N/A)$")
# Column edges (points), taken from the header words on every data page: TITLE at x 101, "KCAL PER 100g" at 213, "KCAL PER PORTION"
# at 299, ALLERGENS at 398, DIETARY at 505. The script checks that the header is where it expects it on every page.
X_TITLE_MAX, X_PER100_MAX, X_PORTION_MAX, X_ALLERGEN_MAX = 200.0, 265.0, 352.0, 500.0
HEADER_Y_MAX = 63.0     # header words (TITLE, KCAL PER 100g ...) start at y 43-58 on every data page; the first row's first title line
                        # starts at y 69-75 (it was 69.2 on page 4, where a 70.0 cut-off lost "SMALL CAPPUCCINO" from the first row)
FOOTER_Y_MIN = 775.0    # "Our food and drinks are made by hand ..." / "V Vegetarian VN Vegan" / "Adults need around 2000kcal a day."
MAX_DY = 9.0            # a word further than this from every row's number line is an error, never guessed


def _words(pdf: Path, page: int) -> list[dict]:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    return [dict(x0=float(a), y0=float(b), x1=float(c), y1=float(d), text=html.unescape(t)) for a, b, c, d, t in WORD.findall(out)]


def page_count(pdf: Path) -> int:
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))


def read_rows(pdf: Path) -> tuple[list[dict], dict]:
    """-> (rows, page_headings). Each row: page, per100, portion, title_lines, allergens (text as printed), marks (V / VN).
    page_headings maps a section page's number to the heading printed on it."""
    rows: list[dict] = []
    headings: dict[int, str] = {}
    for page in range(1, page_count(pdf) + 1):
        words = _words(pdf, page)
        header = [w for w in words if w["text"] in ("TITLE", "ALLERGENS", "DIETARY") and w["y0"] < HEADER_Y_MAX]
        if not header:
            # a cover / section page: the heading is the large text (taller than the 10-point table text)
            big = [w for w in words if (w["y1"] - w["y0"]) > 20]
            if big:
                headings[page] = " ".join(w["text"] for w in sorted(big, key=lambda w: (round(w["y0"]), w["x0"])))
            continue
        want = {"TITLE": 101, "ALLERGENS": 398, "DIETARY": 505}
        for w in header:
            if abs(w["x0"] - want[w["text"]]) > 3:
                raise SystemExit(f"page {page}: header {w['text']!r} is at x={w['x0']:.0f}, expected {want[w['text']]}: the layout changed, re-check the column edges")
        body = words
        anchors = [w for w in body if X_TITLE_MAX <= w["x0"] < X_PER100_MAX and NUMBER.match(w["text"]) and w["y0"] >= HEADER_Y_MAX]
        if not anchors:
            raise SystemExit(f"page {page}: no table rows found")
        anchors.sort(key=lambda w: w["y0"])
        spacing = min((b["y0"] - a["y0"]) for a, b in zip(anchors, anchors[1:])) if len(anchors) > 1 else 99
        if spacing < 2 * MAX_DY:
            raise SystemExit(f"page {page}: rows are only {spacing:.1f} pt apart, too close to read by position")
        page_rows = [dict(page=page, y=a["y0"], per100=a["text"], portion=None, title=[], allergens=[], marks=[]) for a in anchors]
        for w in body:
            if w in anchors:
                continue
            yc = (w["y0"] + w["y1"]) / 2
            if w["y0"] < HEADER_Y_MAX or w["y0"] >= FOOTER_Y_MIN:
                continue  # header band and footer text
            near = min(page_rows, key=lambda r: abs(r["y"] + 4.6 - yc))
            if abs(near["y"] + 4.6 - yc) > MAX_DY:
                raise SystemExit(f"page {page}: word {w['text']!r} at y={yc:.0f} belongs to no row")
            if w["x0"] < X_TITLE_MAX:
                near["title"].append(w)
            elif w["x0"] < X_PER100_MAX:
                raise SystemExit(f"page {page}: a second number {w['text']!r} in the per-100g column of {near}")
            elif w["x0"] < X_PORTION_MAX:
                if near["portion"] is not None:
                    raise SystemExit(f"page {page}: two per-portion values in one row near y={near['y']:.0f}")
                near["portion"] = w["text"]
            elif w["x0"] < X_ALLERGEN_MAX:
                near["allergens"].append(w)
            else:
                near["marks"].append(w["text"])
        for r in page_rows:
            lines: dict[int, list] = {}
            for w in r["title"]:
                lines.setdefault(round(w["y0"]), []).append(w)
            r["title_lines"] = [" ".join(w["text"] for w in sorted(ws, key=lambda w: w["x0"])) for _, ws in sorted(lines.items())]
            alines: dict[int, list] = {}
            for w in r["allergens"]:
                alines.setdefault(round(w["y0"]), []).append(w)
            r["allergen_text"] = " ".join(w["text"] for _, ws in sorted(alines.items()) for w in sorted(ws, key=lambda w: w["x0"]))
            del r["title"], r["allergens"]
            if r["portion"] is None or not r["title_lines"] or not r["allergen_text"]:
                raise SystemExit(f"page {page}: incomplete row near y={r['y']:.0f}: {r}")
            rows.append(r)
    return rows, headings
