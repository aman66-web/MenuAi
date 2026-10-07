"""Read Kokoro UK's official allergen chart PDF ("Allergen chart V3 AUG 2026", 22nd edition) into per-dish allergen marks.

Used by tools/uk_extract/kokoro.py ONLY as an independent cross-check of the allergen lines printed on the menu page (the
chart's dish names differ from the menu's in places, so it is never used to fill in an item). Needs `pdftotext` and
`pdftoppm` (poppler) and Pillow (PIL) to tell the tick colours apart: the chart prints a GREEN tick for "contains" and a GREY
tick for "may contain" (its note: "Grey Ticks = May Contain"); the text layer holds the same tick glyph for both.

Each table (Hearty Bowl, Fresh Roll, Salad, Dessert, Side) has 17 columns: Celery, Wheat, Rye, Barley, Oats (the four gluten
cereals), Crustaceans, Eggs, Fish, Lupin, Milk, Molluscs, Mustard, Nuts, Peanuts, Sesame seeds, Soya, Sulphur dioxide.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

COLUMNS = ["celery", "wheat", "rye", "barley", "oats", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard",
           "nuts", "peanuts", "sesame", "soya", "sulphites"]
HEADER_WORDS = ["Celery", "Wheat", "Rye", "Barley", "Oats", "Crustacean", "Eggs", "Fish", "Lupin", "Milk", "Molluscs",
                "Mustard", "Nuts*", "Peanuts", "Sesame", "Soya", "Sulphur"]
ROW_GAP = 14.0           # name lines closer than this belong to one wrapped name
DPI = 100


class ChartError(RuntimeError):
    pass


def _bbox_pages(pdf: Path):
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        pages.append([(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
                      re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', chunk)])
    return pages


def _tick_colour(img, box) -> str:
    """'green' (contains) or 'grey' (may contain) for the tick glyph inside `box` (points), by counting coloured pixels."""
    scale = DPI / 72.0
    x0, y0, x1, y1 = [int(v * scale) for v in box]
    green = grey = 0
    for x in range(max(x0, 0), min(x1 + 1, img.width)):
        for y in range(max(y0, 0), min(y1 + 1, img.height)):
            r, g, b = img.getpixel((x, y))[:3]
            if g - max(r, b) > 60:
                green += 1
            elif abs(r - g) < 14 and abs(g - b) < 14 and 110 < r < 215:
                grey += 1
    if green == grey == 0:
        raise ChartError(f"no tick pixels found in {box}")
    return "green" if green > grey else "grey"


def read_chart(pdf: Path) -> list[dict]:
    """[{section, name, contains: set(columns), may: set(columns)}] for every dish row of every table, in order."""
    try:
        from PIL import Image  # noqa: WPS433 (optional dependency: only the cross-check needs it)
    except ImportError as e:  # pragma: no cover
        raise ChartError("Pillow (PIL) is needed to read the tick colours: python3 -m pip install pillow") from e
    pages = _bbox_pages(pdf)
    rows: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(DPI), "-png", str(pdf), str(Path(tmp) / "pg")], check=True)
        pngs = sorted(Path(tmp).glob("pg-*.png"))
        if len(pngs) != len(pages):
            raise ChartError("page count mismatch between text and images")
        centres, spacing, section, name_x_max = [], 0.0, "", 0.0
        for words, png in zip(pages, pngs):
            img = Image.open(png).convert("RGB")
            head = [w for w in words if w[4] == "Celery" and w[1] < 200]
            if len(head) > 1:
                raise ChartError("a chart page has two 'Celery' column headers: layout changed")
            if head:
                hy = head[0][1]
                name_x_max = head[0][0] - 1  # dish names end where the Celery column begins
                centres = []
                for hw in HEADER_WORDS:
                    cand = [w for w in words if w[4] == hw and abs(w[1] - hy) < 20 and w[0] > name_x_max]
                    if hw == "Celery":
                        cand = head
                    if len(cand) != 1:
                        raise ChartError(f"column header {hw!r} found {len(cand)} times: layout changed")
                    centres.append((cand[0][0] + cand[0][2]) / 2)
                spacing = min(b - a for a, b in zip(centres, centres[1:]))
                section = " ".join(w[4] for w in sorted(words, key=lambda w: w[0]) if w[0] < name_x_max and abs(w[1] - hy) < 12)
            elif not centres:
                raise ChartError("the first chart page has no column header: layout changed")
            else:
                hy = -12.0  # a continuation page (the Hearty Bowl table runs over): same columns and section as the page before
            names = sorted((w for w in words if w[0] < name_x_max and w[1] > hy + 12 and w[4] != "\u2714"), key=lambda w: (w[1], w[0]))
            lines: list[list] = []
            for w in names:
                if lines and abs(lines[-1][-1][1] - w[1]) < 3:
                    lines[-1].append(w)
                else:
                    lines.append([w])
            groups: list[list[list]] = []
            for ln in lines:
                if groups and ln[0][1] - groups[-1][-1][0][1] < ROW_GAP:
                    groups[-1].append(ln)
                else:
                    groups.append([ln])
            page_rows = []
            for g in groups:
                ys = [w[1] for ln in g for w in ln]
                page_rows.append({"section": section, "name": " ".join(w[4] for ln in g for w in sorted(ln, key=lambda w: w[0])),
                                  "y": (min(ys) + max(w[3] for ln in g for w in ln)) / 2, "contains": set(), "may": set()})
            for w in words:
                if w[4] != "\u2714" or w[1] < hy + 8:
                    continue
                cx = (w[0] + w[2]) / 2
                col = min(range(len(centres)), key=lambda i: abs(centres[i] - cx))
                if abs(centres[col] - cx) > spacing / 2:
                    raise ChartError(f"tick at x={cx:.0f} is not under a column")
                cy = (w[1] + w[3]) / 2
                row = min(page_rows, key=lambda r: abs(r["y"] - cy))
                if abs(row["y"] - cy) > ROW_GAP:
                    raise ChartError(f"tick at y={cy:.0f} is not on a dish row")
                (row["contains"] if _tick_colour(img, w[:4]) == "green" else row["may"]).add(COLUMNS[col])
            rows.extend(page_rows)
    return rows
