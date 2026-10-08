"""Read Maroush's official "Allergen & Calorie Menu" PDF (September 2026, 6 pages) into table rows.

Used by tools/uk_extract/maroush.py. Needs `pdftotext` and `pdftoppm` (poppler); standard library only (Python 3.9).
Numbers are returned exactly as printed (strings such as "702"); nothing is converted, rounded or estimated here.

Pages 2-5 are one table per page: Menu item | 14 allergen columns (GL CR EG FI PN SO MI NU CE MU SE SU LU MO) | V | VG | CALORIES (KCAL).
Section headings are full-width bars (white bold capitals). A gold dot in an allergen column is a DRAWN circle, not text, so the dots
are read from the rendered page by sampling the pixels at every (row, column) centre:

  - row centres come from the words of the text layer (pdftotext -bbox): the name's vertical middle;
  - column centres come from the header abbreviations ("GL", "CR", ... printed rotated; the middle of each word's box);
  - a cell holds a dot when at least MIN_GOLD pixels of a small window around its centre are the dot's gold; the gold is told apart from
    the table's white / cream row bands and its dark red bars by colour, so a cell cannot be mistaken for text or a ruled line.

Every page is also sanity-checked: the number of dots found per page is returned so a caller can compare it with a count by eye.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
TABLE_PAGES = [2, 3, 4, 5]
# The 14 allergen columns in print order: (key, abbreviation printed in the header)
COLUMNS = [("gluten", "GL"), ("crustaceans", "CR"), ("eggs", "EG"), ("fish", "FI"), ("peanuts", "PN"), ("soya", "SO"), ("milk", "MI"),
           ("nuts", "NU"), ("celery", "CE"), ("mustard", "MU"), ("sesame", "SE"), ("sulphites", "SU"), ("lupin", "LU"), ("molluscs", "MO")]
BODY_TOP, BODY_BOTTOM = 156.0, 800.0     # points: below the header row, above the footer
NAME_MAX_X = 228.0                       # the item-name column ends at about 231 pt
V_X, VG_X, KCAL_X = 488.0, 507.0, 520.0  # V at ~488, VG at ~507, calories right of ~520
DPI = 150
SCALE = DPI / 72.0
MIN_GOLD = 6


class Ppm:
    """A binary PPM (P6) page image."""

    def __init__(self, data: bytes) -> None:
        m = re.match(rb"P6\s+(\d+)\s+(\d+)\s+255\s", data)
        if not m:
            raise SystemExit("pdftoppm did not give a P6 PPM image")
        self.w, self.h, self.data, self.off = int(m.group(1)), int(m.group(2)), data, m.end()

    def px(self, x: int, y: int) -> tuple:
        if not (0 <= x < self.w and 0 <= y < self.h):
            return (255, 255, 255)
        i = self.off + (y * self.w + x) * 3
        return (self.data[i], self.data[i + 1], self.data[i + 2])


def is_gold(p: tuple) -> bool:
    """The dot's gold is about (205, 133, 50); the white / cream bands are all >= 240 in blue, the dark red bars have green < 60,
    the text is dark navy (blue > red) or green (VG)."""
    r, g, b = p
    return r >= 180 and 100 <= g <= 175 and b <= 110 and r - b >= 90


def pdf_text(pdf: Path, first: int, last: int) -> str:
    return subprocess.run(["pdftotext", "-layout", "-f", str(first), "-l", str(last), str(pdf), "-"], capture_output=True, text=True,
                          check=True).stdout


def _words(pdf: Path, page: int) -> list:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "bb.html"
        subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), str(out)], check=True)
        text = out.read_text(encoding="utf-8")
    return [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in WORD.findall(text)]


def _page_image(pdf: Path, page: int) -> Ppm:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(DPI), "-f", str(page), "-l", str(page), str(pdf), str(Path(tmp) / "p")], check=True)
        files = sorted(Path(tmp).glob("p-*.ppm"))
        if len(files) != 1:
            raise SystemExit(f"expected one rendered page, got {files}")
        return Ppm(files[0].read_bytes())


def _column_centres(words: list) -> list:
    """x centre of each allergen column from the rotated header abbreviations (the short ones: GL, CR, ...)."""
    centres = []
    for key, abbr in COLUMNS:
        hits = [w for w in words if w[4] == abbr and w[1] < BODY_TOP and w[0] > NAME_MAX_X]
        if len(hits) != 1:
            raise SystemExit(f"header abbreviation {abbr} found {len(hits)} times on a page, expected 1: the layout changed")
        centres.append((key, (hits[0][0] + hits[0][2]) / 2.0))
    return centres


def _dot(img: Ppm, x_pt: float, y_pt: float) -> int:
    """Number of gold pixels in a 9 x 9 pt window around the cell centre (a dot is about 5 pt across)."""
    cx, cy = int(x_pt * SCALE), int(y_pt * SCALE)
    r = int(4.5 * SCALE)
    return sum(1 for yy in range(cy - r, cy + r + 1) for xx in range(cx - r, cx + r + 1) if is_gold(img.px(xx, yy)))


def read_rows(pdf: Path) -> tuple:
    """Returns (rows, dots_per_page). Each row: dict(page, section, name, kcal ('-' when the guide prints a dash), v, vg, dots (list of
    allergen keys with a dot), gold (pixels per column, for audit)). Section headings are rows with no calorie cell and an all-capitals name."""
    rows, dots_per_page = [], {}
    section = None
    for page in TABLE_PAGES:
        words = _words(pdf, page)
        centres = _column_centres(words)
        img = _page_image(pdf, page)
        body = [w for w in words if BODY_TOP < w[1] < BODY_BOTTOM]
        body.sort(key=lambda w: (w[1], w[0]))
        lines: list = []
        for w in body:
            if lines and abs(w[1] - lines[-1][0]) < 2.5:
                lines[-1][1].append(w)
            else:
                lines.append([w[1], [w]])
        page_dots = 0
        for y, ws in lines:
            ws.sort(key=lambda w: w[0])
            name_words = [w for w in ws if w[2] <= NAME_MAX_X + 20 and w[0] < NAME_MAX_X]
            name = " ".join(w[4] for w in name_words)
            kcal_words = [w for w in ws if w[0] >= KCAL_X]
            v = any(w[4] == "V" and V_X - 6 <= w[0] <= V_X + 6 for w in ws)
            vg = any(w[4] == "VG" and VG_X - 8 <= w[0] <= VG_X + 8 for w in ws)
            if not name:
                raise SystemExit(f"page {page}: a table row at y={y:.0f} has no item name: {[w[4] for w in ws]}")
            if not kcal_words:
                if name != name.upper() or v or vg:
                    raise SystemExit(f"page {page}: row {name!r} has no calorie cell and is not a section heading")
                section = name
                continue
            if len(kcal_words) != 1:
                raise SystemExit(f"page {page}: row {name!r} has {len(kcal_words)} calorie cells: {[w[4] for w in kcal_words]}")
            if section is None:
                raise SystemExit(f"page {page}: row {name!r} comes before any section heading")
            y_mid = (name_words[0][1] + name_words[0][3]) / 2.0
            gold = {key: _dot(img, x, y_mid) for key, x in centres}
            dots = [key for key, n in gold.items() if n >= MIN_GOLD]
            # A cell is a dot or empty: anything in between means the window caught something else.
            unsure = {k: n for k, n in gold.items() if 0 < n < MIN_GOLD or (n >= MIN_GOLD and n < 20)}
            if unsure:
                raise SystemExit(f"page {page}: row {name!r} has cells that are neither clearly a dot nor empty: {unsure}")
            page_dots += len(dots)
            rows.append(dict(page=page, section=section, name=name, kcal=kcal_words[0][4], v=v, vg=vg, dots=dots, gold=gold))
        dots_per_page[page] = page_dots
    return rows, dots_per_page
