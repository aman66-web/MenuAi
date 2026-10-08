"""Read Pret A Manger UK's official Allergen Guide PDF (the allergen matrix) into rows of ticks.

Used by tools/uk_extract/pret.py. Requires `pdftotext` and `pdftoppm` (poppler).

The guide (https://www.pret.co.uk/en-GB/allergenguide links the current PDF) is a set of landscape pages 3 to 22, each a table: one
row per product, one column per allergen (a tick glyph, U+F061 in the PDF's symbol font, means "Product Contains"; a "Y" in the
two left-hand columns means suitable for vegetarians / vegan friendly and is not read). The guide prints no "may contain"
information (its footer says it cannot guarantee any product is allergen-free). Page 1 is the cover, page 2 the introduction.

How the table is read (every step has a hard check, nothing is guessed):
  * pdftotext -bbox gives every word with its box. The 29 allergen columns are found on each page from the header words
    (HEADER_COLUMNS, in printed order); the x centre of a header word is the column. Their order and spacing are checked.
  * rows are the stretches between the table's black separator lines (read from a 72 dpi render of the page); a product row's name is
    the text left of the "Vegetarians" column inside its stretch (a wrapped name has two lines; more stops the run). A tick belongs to
    the row it sits in and to the column whose centre is nearest (within 6 pt). Every tick on a page must be placed or the run stops.
  * section headings and the footer banner (white text on a dark red band) are told apart from products by the colour of the row
    in a 72 dpi render of the page (pdftoppm, read here without any library): a heading is never a product.
Numbers do not occur here. Rows are returned exactly as printed (names with zero-width spaces removed, whitespace collapsed).
"""
from __future__ import annotations
import re
import subprocess
import tempfile
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>')
TICK = ""
FIRST_TABLE_PAGE, LAST_TABLE_PAGE = 3, 22

# (first word of the printed column header, allergen word as printed on the guide, i.e. what common.allergen_words reads), in printed order.
# "Pine Nuts" is declared by Pret ("In addition we also declare Pine Nuts as an allergen") but is not one of the 14: it is returned as the
# word "pine nuts" and the caller decides what to do with it.
HEADER_COLUMNS = [
    ("Peanut", "peanuts"),
    ("Almond", "almond"), ("Brazil", "brazil nut"), ("Cashews", "cashew"), ("Hazelnut", "hazelnut"), ("Macadamia", "macadamia"),
    ("Pecan", "pecan"), ("Pistachio", "pistachio"), ("Walnut", "walnut"),
    ("Sesame", "sesame"),
    ("Barley", "barley"), ("Kamut", "kamut"), ("Oats", "oats"), ("Rye", "rye"), ("Spelt", "spelt"), ("Wheat", "wheat"),
    ("Crustacean", "crustaceans"), ("Celery", "celery"), ("Egg", "egg"), ("Fish", "fish"),
    ("Cow", "milk"), ("Goat", "milk"), ("Sheep", "milk"),
    ("Lupin", "lupin"), ("Molluscs", "molluscs"), ("Mustard", "mustard"), ("Soya", "soya"), ("Sulphites", "sulphites"),
    ("Pine", "pine nuts"),
]
# The guide's own spelling slips in a column header (page 13 prints "Kamult"): the column is still the one in this position, in this order.
HEADER_SPELLINGS = {"Kamut": {"Kamut", "Kamult"}}
TICK_COL_REACH = 6.0    # a tick this close (pt) to a column's centre belongs to it
MIN_COL_GAP = 9.0       # neighbouring column centres are at least this far apart


def _unescape(s: str) -> str:
    return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'").replace("&apos;", "'").replace("&quot;", '"')


def _tidy(s: str) -> str:
    return " ".join(s.replace("​", "").replace("\xa0", " ").split())


def _bbox_pages(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    with tempfile.NamedTemporaryFile(suffix=".html") as out:
        subprocess.run(["pdftotext", "-bbox", str(pdf), out.name], check=True)
        text = Path(out.name).read_text(encoding="utf-8")
    pages = text.split("<page ")[1:]
    return [[(float(a), float(b), float(c), float(d), _unescape(w)) for a, b, c, d, w in WORD.findall(p)] for p in pages]


class _Page:
    """A 72 dpi render of one page: one pixel is one point, so bbox coordinates index it directly."""

    def __init__(self, pdf: Path, page: int):
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["pdftoppm", "-r", "72", "-f", str(page), "-l", str(page), "-singlefile", str(pdf), str(Path(tmp) / "p")], check=True)
            raw = (Path(tmp) / "p.ppm").read_bytes()
        m = re.match(rb"P6\s+(\d+)\s+(\d+)\s+255\s", raw)
        if not m:
            raise SystemExit(f"page {page}: pdftoppm did not give a P6 image")
        self.w, self.h = int(m.group(1)), int(m.group(2))
        self.data = raw[m.end():]
        if len(self.data) != self.w * self.h * 3:
            raise SystemExit(f"page {page}: unexpected image size")

    def rgb(self, x: float, y: float) -> tuple[int, int, int]:
        xi, yi = min(max(int(x), 0), self.w - 1), min(max(int(y), 0), self.h - 1)
        o = (yi * self.w + xi) * 3
        return self.data[o], self.data[o + 1], self.data[o + 2]


def _is_banner(rgb: tuple[int, int, int]) -> bool:
    """The dark red of the section headings and the footer banner (about 160, 30, 50)."""
    r, g, b = rgb
    return r > 110 and g < 70 and b < 90 and r - g > 70


def _columns(words: list, veg_x0: float, page: int) -> tuple[list[tuple[str, float]], float]:
    """-> ([(allergen word, x centre)] in printed order, y where the header band ends)."""
    tree = [w for w in words if w[4] == "Tree" and w[0] > veg_x0]
    if len(tree) != 1:
        raise SystemExit(f"page {page}: expected one 'Tree' header word, found {len(tree)}: the guide's layout changed")
    top = tree[0][1] - 1.0
    # The header band ends under the lowest header word; row text starts below it. Header words are right of the Vegetarians column.
    band_words = [w for w in words if w[0] > veg_x0 and w[1] > top and w[4] in {c for c, _ in HEADER_COLUMNS} | {"Kamult", "Nuts", "(Wheat)", "celeriac", "and", "Tree", "Cereals", "containing", "gluten", "Milk", "milk", "Vegan", "Friendly", "Vegetarians"}
                  and w[1] < top + 60]
    bottom = max(w[3] for w in band_words)
    cols: list[tuple[str, float]] = []
    for first, word in HEADER_COLUMNS:
        hits = [w for w in words if w[4] in HEADER_SPELLINGS.get(first, {first}) and w[0] > veg_x0 and top < w[1] < bottom]
        if len(hits) != 1:
            raise SystemExit(f"page {page}: header word {first!r} found {len(hits)} times in the header band: the guide's layout changed")
        x0, x1 = hits[0][0], hits[0][2]
        if first == "Pine":  # "Pine Nuts" is one line, the other two-word headers are stacked and centred on their first word
            nxt = [w for w in words if w[4] == "Nuts" and abs(w[1] - hits[0][1]) < 1.0 and 0 <= w[0] - x1 < 4.0]
            if len(nxt) != 1:
                raise SystemExit(f"page {page}: header 'Pine Nuts' not found as one line")
            x1 = nxt[0][2]
        cols.append((word, (x0 + x1) / 2))
    xs = [x for _, x in cols]
    if any(b - a < MIN_COL_GAP for a, b in zip(xs, xs[1:])):
        raise SystemExit(f"page {page}: header columns are out of order or overlap: {cols}")
    return cols, bottom


def read_matrix(pdf: Path, expect_pages: int = LAST_TABLE_PAGE) -> list[dict]:
    """All product rows of pages 3..22: {"page", "name", "marks": [allergen words as printed, in column order], "y"}.

    Section headings and the footer banner are not returned. Stops (SystemExit) on any tick that cannot be placed.
    """
    pages = _bbox_pages(pdf)
    if len(pages) != expect_pages:
        raise SystemExit(f"The allergen guide has {len(pages)} pages, expected {expect_pages}: the guide changed, re-check pret_allergen_pdf.py.")
    out: list[dict] = []
    for pno in range(FIRST_TABLE_PAGE, LAST_TABLE_PAGE + 1):
        words = pages[pno - 1]
        veg = [w for w in words if w[4] == "Vegetarians"]
        if len(veg) != 1:
            raise SystemExit(f"page {pno}: expected one 'Vegetarians' header word, found {len(veg)}")
        veg_x0 = veg[0][0]
        cols, header_bottom = _columns(words, veg_x0, pno)
        img = _Page(pdf, pno)
        left, right = cols[0][1], cols[-1][1]
        # Rows are the stretches between the table's own black separator lines (found along a vertical line through the empty part of the
        # first allergen column, 12 pt right of its centre: clear of tick glyphs and of the cell borders).
        probe_x = left + 12.0
        # (the header cells are light grey 237 and the first heading band can start straight under them with no black line)
        black = [max(img.rgb(probe_x, y)) < 70 or img.rgb(probe_x, y) == (237, 237, 237) for y in range(int(header_bottom) - 2, img.h)]
        runs: list[tuple[int, int]] = []
        for i, is_black in enumerate(black):
            y = int(header_bottom) - 2 + i
            if is_black:
                if runs and runs[-1][1] == y - 1:
                    runs[-1] = (runs[-1][0], y)
                else:
                    runs.append((y, y))
        bands = [(a + 1.0, b_ - 1.0) for (_, a), (b_, _) in zip(runs, runs[1:]) if b_ - a > 8]  # bands shorter than a text line are not rows
        rows = [{"top": a, "bottom": b_, "lines": [], "ticks": []} for a, b_ in bands]
        name_words = sorted((w for w in words if w[0] < veg_x0 - 2 and w[1] > header_bottom - 1 and w[4] != "Product"), key=lambda w: ((w[1] + w[3]) / 2, w[0]))
        stray = []
        for w in name_words:
            yc = (w[1] + w[3]) / 2
            home = [r for r in rows if r["top"] <= yc <= r["bottom"]]
            if len(home) != 1:
                stray.append(w)
                continue
            home[0]["lines"].append(w)
        for r in rows:
            r["y"] = (r["top"] + r["bottom"]) / 2
            by_line: list[list] = []
            for w in sorted(r["lines"], key=lambda w: ((w[1] + w[3]) / 2, w[0])):
                yc = (w[1] + w[3]) / 2
                if by_line and abs(by_line[-1][0] - yc) < 2.5:
                    by_line[-1][1].append(w)
                else:
                    by_line.append([yc, [w]])
            if len(by_line) > 2:
                raise SystemExit(f"page {pno}: a row has {len(by_line)} text lines ({[_tidy(' '.join(x[4] for x in ws)) for _, ws in by_line]}): re-check by hand")
            r["name"] = _tidy(" ".join(w[4] for _, ws in by_line for w in sorted(ws, key=lambda w: w[0])))
            # banner test: 16 points along the row inside the table. A heading is red at most of them (white letters hide some),
            # a product row at none; one or two red points are not understood.
            probes = [(left + (right - left) * i / 15.0, r["y"]) for i in range(16)]
            red = sum(_is_banner(img.rgb(x, y)) for x, y in probes)
            if red >= 3:
                r["banner"] = True
            elif red == 0:
                r["banner"] = False
            else:
                raise SystemExit(f"page {pno} row {r['name']!r}: {red} of 16 points are banner red: neither a heading nor a product row, re-check by hand")
        # words outside every row band are only allowed under the table (nothing of the product list may be lost)
        if stray:
            last = rows[-1]["bottom"] if rows else header_bottom
            lost = [w for w in stray if (w[1] + w[3]) / 2 < last]
            if lost:
                raise SystemExit(f"page {pno}: text {[w[4] for w in lost][:6]} left of the table sits in no row: the layout changed")
        ticks = [w for w in words if w[4] == TICK and w[1] > header_bottom - 1]  # the key box at the top left has a tick too
        unplaced = []
        for t in ticks:
            yc, xc = (t[1] + t[3]) / 2, (t[0] + t[2]) / 2
            if xc < left - TICK_COL_REACH:
                continue  # the 'Y' and tick glyphs of the first two columns are not in this list (those are 'Y' words); a tick here would be unplaced
            home = [r for r in rows if r["top"] <= yc <= r["bottom"]]
            nearest = home[0] if len(home) == 1 else None
            ci = min(range(len(cols)), key=lambda i: abs(cols[i][1] - xc))
            if nearest is None or abs(cols[ci][1] - xc) > TICK_COL_REACH or nearest["banner"]:
                unplaced.append((round(xc, 1), round(yc, 1)))
                continue
            if any(i == ci for i, _ in nearest["ticks"]):
                raise SystemExit(f"page {pno}: two ticks in one cell of row {nearest['name']!r}")
            nearest["ticks"].append((ci, cols[ci][0]))
        # a tick left of the first allergen column (e.g. in the vegetarian columns) is not a thing in this guide
        left_ticks = [t for t in ticks if (t[0] + t[2]) / 2 < left - TICK_COL_REACH]
        if unplaced or left_ticks:
            raise SystemExit(f"page {pno}: {len(unplaced)} ticks could not be placed {unplaced[:5]} / {len(left_ticks)} left of the allergen columns: the layout changed")
        for r in rows:
            if r["banner"]:
                continue
            out.append({"page": pno, "name": r["name"], "marks": [w for _, w in sorted(r["ticks"])], "y": r["y"]})
    return out
