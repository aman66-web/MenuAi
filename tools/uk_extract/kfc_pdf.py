"""Read KFC UK's official "Allergen & Nutrition Information" PDF into ordered rows of printed numbers and allergen words.

Used by tools/uk_extract/kfc.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "<0.5", "0.50", "2.20") so nothing is converted or estimated here.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "protein", "salt")
ROW = re.compile(r"\s+".join(f"(?P<{f}>{NUM})" for f in FIELDS) + r"\s+(?P<veg>[✔✖])\s+(?P<vegan>[✔✖])")
# A row whose first number (kJ) wrapped onto the line above leaves 7 numbers on the next line.
ROW7 = re.compile(r"\s+".join(f"(?P<{f}>{NUM})" for f in FIELDS[1:]) + r"\s+(?P<veg>[✔✖])\s+(?P<vegan>[✔✖])")


def _crop(pdf: Path, page: int, side: str) -> list[str]:
    x = 0 if side == "L" else 450
    with tempfile.NamedTemporaryFile(suffix=".txt") as out:
        subprocess.run(
            ["pdftotext", "-layout", "-f", str(page), "-l", str(page), "-x", str(x), "-y", "0", "-W", "456", "-H", "1255", str(pdf), out.name],
            check=True,
        )
        return Path(out.name).read_text(encoding="utf-8").split("\n")


def read_rows(pdf: Path) -> list[dict[str, str]]:
    """Rows in reading order: page 1 left, page 1 right, page 2 left, page 2 right."""
    rows: list[dict[str, str]] = []
    for page in (1, 2):
        for side in ("L", "R"):
            lines = _crop(pdf, page, side)
            for i, line in enumerate(lines):
                m = ROW.search(line)
                if m:
                    rows.append(m.groupdict())
                    continue
                m7 = ROW7.search(line)
                if m7 and i > 0:
                    prev = re.search(rf"({NUM})\s*$", lines[i - 1])
                    if prev:
                        rows.append({"kj": prev.group(1), **m7.groupdict()})
    return rows


# ---------------------------------------------------------------- allergens
# Each table section has its own header line ("Contains Allergens", "May Contain Allergens", "kJ" ...); the two allergen
# cells of a row are word lists printed in those two columns, wrapped over up to four lines and centred vertically on the
# row's numbers. A row is located by its vegetarian/vegan marks (one pair per printed row, the same rows read_rows finds).

HALF_X = 450          # the pages are printed as two tables side by side
FOOTER_Y = 1010       # the "THE IMPORTANT STUFF" / symbol notes start below this on both pages
CENTRE_TOLERANCE = 2.0  # pt: a cell's lines must be centred on its row's marks (they are within 0.6 pt in the Sept 2026 PDF)
CELL_REACH = 14.0     # pt: the furthest a cell's line may sit from its row's centre (four lines is about 12 pt)


def _words(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "words.html"
        subprocess.run(["pdftotext", "-bbox", str(pdf), str(out)], check=True)
        text = out.read_text(encoding="utf-8")
    return [[(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
             re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', page)]
            for page in text.split("<page")[1:]]


def _reading_order(ws: list) -> list[str]:
    """Words of one cell in reading order: lines (words whose vertical centres are within 2 pt) top to bottom, then x."""
    lines: list[list] = []
    for w in sorted(ws, key=lambda w: (w[1] + w[3]) / 2):
        yc = (w[1] + w[3]) / 2
        if lines and abs(yc - lines[-1][0]) < 2:
            lines[-1][1].append(w)
        else:
            lines.append([yc, [w]])
    return [w[4] for _, line in lines for w in sorted(line, key=lambda w: w[0])]


def read_allergen_cells(pdf: Path) -> list[dict]:
    """One dict per printed row, in read_rows' order: {"page", "kcal", "contains": [words], "may_contain": [words]}.
    Raises SystemExit if a word cannot be placed in exactly one cell or a cell is not centred on its row."""
    cells: list[dict] = []
    for pno, ws in enumerate(_words(pdf), 1):
        for half in ("L", "R"):
            hw = [w for w in ws if (w[0] < HALF_X) == (half == "L") and w[1] < FOOTER_Y]
            heads = sorted((w for w in hw if w[4] == "Contains"), key=lambda w: w[1])
            rows: list[dict] = []
            for m in sorted((w for w in hw if w[4] in ("✔", "✖")), key=lambda w: (w[1], w[0])):
                yc = (m[1] + m[3]) / 2
                if not rows or abs(rows[-1]["y"] - yc) > 2:
                    rows.append({"y": yc, "page": pno, "half": half})
            for i, h in enumerate(heads):
                may = [w for w in hw if w[4] == "May" and abs(w[1] - h[1]) < 5]
                kj = [w for w in hw if w[4] == "kJ" and abs(w[1] - h[1]) < 5]
                if len(may) != 1 or len(kj) != 1:
                    raise SystemExit(f"KFC PDF page {pno}{half}: the section header at y={h[1]:.0f} is not 'Contains / May Contain / kJ'")
                may_x, kj_x = may[0][0], kj[0][0]
                bottom = heads[i + 1][1] if i + 1 < len(heads) else FOOTER_Y
                section = [r for r in rows if h[3] < r["y"] < bottom]
                if not section:
                    raise SystemExit(f"KFC PDF page {pno}{half}: no rows under the header at y={h[1]:.0f}")
                for r in section:
                    r.update(contains=[], may_contain=[], kcal=None)
                    nums = sorted((w for w in hw if w[0] > kj_x + 8 and abs((w[1] + w[3]) / 2 - r["y"]) < 3
                                   and re.fullmatch(NUM, w[4])), key=lambda w: w[0])
                    r["kcal"] = nums[0][4] if nums else None
                # allergen words: letters only (the kJ numbers start left of the "kJ" heading), between the header and the next one
                for w in hw:
                    yc = (w[1] + w[3]) / 2
                    if not (h[0] - 1 <= w[0] < kj_x and h[3] < yc < bottom and re.fullmatch(r"[A-Za-z]+", w[4])):
                        continue
                    r = min(section, key=lambda r: abs(r["y"] - yc))
                    if abs(r["y"] - yc) > CELL_REACH:
                        raise SystemExit(f"KFC PDF page {pno}{half}: allergen word {w[4]!r} at y={yc:.1f} is not beside any row")
                    r["contains" if w[0] < may_x - 1 else "may_contain"].append(w)
            for r in rows:
                if "contains" not in r:
                    raise SystemExit(f"KFC PDF page {pno}{half}: a row at y={r['y']:.0f} has no section header above it")
                for col in ("contains", "may_contain"):
                    ws_ = r[col]
                    if ws_:
                        centre = (min(w[1] for w in ws_) + max(w[3] for w in ws_)) / 2
                        if abs(centre - r["y"]) > CENTRE_TOLERANCE:
                            raise SystemExit(f"KFC PDF page {pno}{half}: the {col} cell of the row at y={r['y']:.0f} "
                                             f"({' '.join(_reading_order(ws_))}) is not centred on it: re-check the layout")
                    r[col] = _reading_order(ws_)
                cells.append({"page": pno, "kcal": r["kcal"], "contains": r["contains"], "may_contain": r["may_contain"]})
    return cells
