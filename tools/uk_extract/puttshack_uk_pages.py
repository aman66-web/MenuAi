"""Readers for Puttshack UK's three official files (used by tools/uk_extract/puttshack_uk.py). Python 3.9, standard library only,
plus poppler's `pdftotext` and `pdftoppm`.

1. read_menu_page(html)   the food page https://www.puttshack.com/uk/food-and-drink/ : every dish's printed name, "N kcal" and
                          description, in the order the page prints them, under the section heading it sits in.
2. read_menu_pdf(pdf)     the menu PDF the page links as "Download menu" (a clean text layer): only used to CHECK the page (same
                          calories) and for the V / VG marks, because the page's own mark text is not reliable (see below).
3. read_allergen_pdf(pdf) the food allergen guide the allergens page links (8 pages, one row per dish, one column per allergen).

Why the allergen guide needs care: its text layer holds TWO overlaid tables, the visible July 2026 one and an older hidden one
(old dish names such as "SHAWARMA PIZZA", a KCAL column that is not drawn). pdftotext prints both. So nothing is read from the text
layer unless it is also where the page draws it:
  - row labels: words on the same text line as a word starting at x = 25.90 pt (the visible left column; the hidden table's labels
    start at 25.63 and sit 0.3-1.1 pt higher);
  - the dots (a filled circle = the allergen is in the dish) are read from the RENDERED page (pdftoppm), at the centre of each cell
    of the 14-column grid, so a hidden layer can never add one;
  - "MAY CONTAIN" captions and the named gluten cereals (Wheat, Spelt, ...) are text words inside the cell; every caption must sit
    in a cell that also has a dot, otherwise the run stops.
Anything the reader does not expect stops the run with a message; nothing is guessed.
"""
from __future__ import annotations
import html as htmllib
import re
import subprocess
import tempfile
from pathlib import Path

# ---------------------------------------------------------------- the food page
SECTIONS = ["Shareables", "Flatbreads", "Salads & Bowls", "Handhelds", "Sides", "SAUCES", "Desserts"]
_HEADING = re.compile(r'<(h2|div|p) class="elementor-heading-title[^"]*">(.*?)</\1>', re.S)
_KCAL = re.compile(r"(\d[\d,]*)\s*kcal", re.I)


def _text(fragment: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def read_menu_page(page_html: str) -> list[dict]:
    """[{section, name, kcal (str as printed), desc, marks (raw mark text on the page)}] in page order. Sauces come from one
    paragraph ("<b>BBQ </b>60kcal<br>...") and have no description."""
    start = page_html.find(">Shareables</h2>")
    end = page_html.find("Download menu")
    if start < 0 or end < 0 or end < start:
        raise SystemExit("food page: cannot find the menu block (Shareables ... Download menu): the page changed")
    block = page_html[start - 200:end]
    dishes: list[dict] = []
    section = None
    cur = None
    for m in _HEADING.finditer(block):
        tag, inner = m.group(1), m.group(2)
        txt = _text(inner)
        if tag == "h2":
            if txt in SECTIONS:
                section, cur = txt, None
                continue
            if section is None:
                continue
            cur = {"section": section, "name": txt, "kcal": None, "desc": "", "marks": []}
            dishes.append(cur)
        elif tag == "div":
            if cur is not None and len(txt) <= 3:
                cur["marks"].append(txt)
        else:  # p
            if "<b>" in inner and section == "SAUCES":
                found = re.findall(r"<b>(.*?)</b>\s*(\d+)\s*kcal", inner, re.S)
                if not found:
                    raise SystemExit("food page: sauces paragraph has no '<b>name</b> N kcal' rows: the page changed")
                for name, kcal in found:
                    dishes.append({"section": "SAUCES", "name": _text(name), "kcal": kcal, "desc": "", "marks": []})
                cur = None
                continue
            k = _KCAL.search(_text(inner))
            if cur is not None and k and cur["kcal"] is None:
                cur["kcal"] = k.group(1).replace(",", "")
                cur["desc"] = _text(re.sub(r"\d[\d,]*\s*kcal", " ", inner, flags=re.I))
    for d in dishes:
        if d["kcal"] is None:
            raise SystemExit(f"food page: dish {d['name']!r} has no 'N kcal' value: the page changed")
    return dishes


# ---------------------------------------------------------------- the menu PDF (cross-check + V / VG marks)
_MARKS = re.compile(r"kcal\s*((?:(?:VG|V|NG|H)(?![A-Za-z])(?:\s+available)?(?:\s*\|\s*)?)*)")


def menu_pdf_text(pdf: Path) -> str:
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return " ".join(out.replace("‘", "'").replace("’", "'").split())


def menu_pdf_dish(text: str, printed: str, after: str = "") -> tuple[str, list[str]]:
    """(kcal as printed, marks) for the dish the PDF prints as `printed` (exact case, so "Potato Tots" the side is not "potato tots" in
    a description): the first 'NNNkcal' within 80 characters after the name, and the marks (V, VG, NG, H) right after it. `after`
    starts the search at that text (used for the sauces block)."""
    norm = lambda x: " ".join(x.replace("\u2018", "'").replace("\u2019", "'").split())  # noqa: E731
    start = text.find(norm(after)) if after else 0
    if start < 0:
        raise SystemExit(f"menu PDF: {after!r} not found")
    key = norm(printed)
    i = text.find(key, start)
    if i < 0:
        raise SystemExit(f"menu PDF: dish {printed!r} not found")
    m = re.compile(r"(\d+)kcal").search(text, i + len(key))
    if not m or m.start() - (i + len(key)) > 80:
        raise SystemExit(f"menu PDF: no calories within 80 characters after {printed!r}")
    mm = _MARKS.match(text, m.end() - 4)  # starts at 'kcal'
    marks = re.findall(r"(?<![A-Za-z])(VG|V|NG|H)(?![A-Za-z])", mm.group(1)) if mm else []
    return m.group(1), marks


# ---------------------------------------------------------------- the allergen guide
PT_COLS_X0 = 158.882          # left edge of the first allergen column (CELERY), in points
PT_COL_W = 46.921             # width of each of the 14 columns
COLUMNS = ["celery", "gluten", "crustaceans", "egg", "fish", "lupin", "dairy", "molluscs", "mustard", "peanuts", "sesame", "soya",
           "sulphur dioxide", "tree nuts"]
HEADER_WORDS = {"celery": "CELERY", "gluten": "GLUTEN", "crustaceans": "CRUSTACEANS", "egg": "EGG", "fish": "FISH", "lupin": "LUPIN",
                "dairy": "DAIRY", "molluscs": "MOLLUSCS", "mustard": "MUSTARD", "peanuts": "PEANUTS", "sesame": "SESAME", "soya": "SOYA",
                "sulphur dioxide": "SULPHUR", "tree nuts": "TREE"}
LABEL_X = 25.90               # x of the first word of every visible row label
SECTION_ROWS = {"GAME NIGHT WINGS", "SHAREABLES", "SOURDOUGH FLATBREADS", "HANDHELDS", "SIGNATURES", "SAUCES", "SALADS", "SIDES",
                "DESSERTS", "ADD ON'S"}
CEREAL = re.compile(r"^(Wheat|Spelt|Kamut|Rye|Barley|Oat|Oats),?$")
DPI = 144
PX = DPI / 72.0


def _norm_label(s: str) -> str:
    return " ".join(s.replace("‘", "'").replace("’", "'").upper().split())


def _read_ppm(path: Path):
    data = path.read_bytes()
    parts = data.split(None, 4)
    if parts[0] != b"P6":
        raise SystemExit("pdftoppm did not write a P6 PPM")
    w, h = int(parts[1]), int(parts[2])
    pix = data[len(data) - w * h * 3:]  # the pixel rows are the last w*h*3 bytes
    return w, h, pix


def _coloured_pixels(img, x0: float, y0: float, x1: float, y1: float) -> int:
    """Count strongly coloured pixels (the purple / blue dots) inside a box given in points."""
    w, h, pix = img
    n = 0
    for py in range(max(0, int(y0 * PX)), min(h, int(y1 * PX))):
        row = py * w * 3
        for px in range(max(0, int(x0 * PX)), min(w, int(x1 * PX))):
            r, g, b = pix[row + px * 3], pix[row + px * 3 + 1], pix[row + px * 3 + 2]
            if max(r, g, b) - min(r, g, b) > 70:
                n += 1
    return n


def read_allergen_pdf(pdf: Path, section_rows=SECTION_ROWS) -> dict:
    """{(section, row label): {"contains": set, "may": set, "cereals": set(printed words)}} for every row of the guide.
    section / label are upper case, apostrophes straight. `section_rows` names the guide's section heading rows (the kids guide has
    MAINS, SIDES and DESSERTS). Raises SystemExit on anything unexpected."""
    pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], check=True, capture_output=True, text=True).stdout).group(1))
    result: dict = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmpd = Path(tmp)
        for pno in range(1, pages + 1):
            bbox = subprocess.run(["pdftotext", "-bbox", "-f", str(pno), "-l", str(pno), str(pdf), "-"], check=True,
                                  capture_output=True, text=True).stdout
            words = [(float(a), float(b), float(c), float(d), htmllib.unescape(w)) for a, b, c, d, w in
                     re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', bbox)]
            subprocess.run(["pdftoppm", "-r", str(DPI), "-f", str(pno), "-l", str(pno), "-singlefile", str(pdf), str(tmpd / "page")],
                           check=True, capture_output=True)
            img = _read_ppm(tmpd / "page.ppm")
            # label lines: first words at x = 25.90, joined with the visible words that share their y
            firsts = sorted((w for w in words if abs(w[0] - LABEL_X) < 0.03), key=lambda w: w[1])
            labels = []  # (y_top, y_bottom, text)
            for f in firsts:
                line = sorted((w for w in words if abs(w[1] - f[1]) < 0.05 and w[2] < PT_COLS_X0 and w[0] >= LABEL_X - 0.03), key=lambda w: w[0])
                text = " ".join(w[4] for w in line)
                if labels and f[1] - labels[-1][0] < 9.5 and not _norm_label(text) in section_rows and not _norm_label(labels[-1][2]) in section_rows:
                    labels[-1] = (labels[-1][0], f[1], labels[-1][2] + " " + text)  # wrapped label line
                else:
                    labels.append((f[1], f[1], text))
            if not labels:
                raise SystemExit(f"allergen guide page {pno}: no row labels found: the layout changed")
            section = None
            for top, last_top, text in labels:
                label = _norm_label(text)
                centre = (top + last_top) / 2 + 3.7  # the text is about 7.4 pt tall, rows are 28.1 pt high
                if label in section_rows:
                    section = label
                    # header row: every column's heading word must be where the grid says
                    for col_i, col in enumerate(COLUMNS):
                        x0 = PT_COLS_X0 + col_i * PT_COL_W
                        near = [w[4] for w in words if x0 <= w[0] < x0 + PT_COL_W and abs(w[1] - top) < 4.0]
                        if HEADER_WORDS[col] not in near:
                            raise SystemExit(f"allergen guide page {pno}, section {label}: column {col_i + 1} is not headed {HEADER_WORDS[col]!r}")
                    continue
                if section is None:
                    raise SystemExit(f"allergen guide page {pno}: row {label!r} before any section heading")
                row = {"contains": set(), "may": set(), "cereals": set()}
                for col_i, col in enumerate(COLUMNS):
                    x0 = PT_COLS_X0 + col_i * PT_COL_W
                    y0, y1 = centre - 13.0, centre + 13.0
                    dot = _coloured_pixels(img, x0 + 2.0, y0, x0 + PT_COL_W - 2.0, y1)
                    caption = any(w[4] == "MAY" and x0 <= w[0] < x0 + PT_COL_W and y0 <= w[1] < y1 for w in words)
                    # a cell naming five cereals wraps to three lines and its top line can start a hair above the row's +-13 pt window (kids guide,
                    # Hot dog: "Wheat, Spelt," at 0.03 pt outside), so a cereal word belongs to the row its vertical CENTRE is in (rows are 28.1 pt high)
                    cereals = [w[4] for w in words if x0 <= w[0] < x0 + PT_COL_W and abs((w[1] + w[3]) / 2 - centre) <= 14.05 and CEREAL.match(w[4])]
                    if 0 < dot < 100:
                        raise SystemExit(f"allergen guide page {pno}, {label!r}, {col}: unclear dot ({dot} coloured pixels)")
                    if caption and not dot:
                        raise SystemExit(f"allergen guide page {pno}, {label!r}, {col}: a MAY CONTAIN caption without a dot")
                    if cereals and col != "gluten":
                        raise SystemExit(f"allergen guide page {pno}, {label!r}: cereal words {cereals} outside the gluten column")
                    if dot:
                        row["may" if caption else "contains"].add(col)
                    for c in cereals:
                        row["cereals"].add(c.rstrip(","))
                if row["cereals"]:
                    row["contains"].add("gluten")  # the guide names the cereals instead of drawing a dot in the gluten column
                if "gluten" in row["contains"] and "gluten" in row["may"]:
                    raise SystemExit(f"allergen guide page {pno}, {label!r}: gluten both contained and may-contain")
                key = (section, label)
                if key in result and result[key] != row:  # an add-on listed under two pages must carry the same marks
                    raise SystemExit(f"allergen guide: row {key} appears twice with different marks")
                result[key] = row
            (tmpd / "page.ppm").unlink()
    return result


# ---------------------------------------------------------------- the kids menu PDF (calories printed beside each dish)
_KIDS_MARKS = r"((?:(?:VG|V|NG|H)\s+)*)"


def kids_menu_text(pdf: Path) -> str:
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return " ".join(out.replace("\u2018", "'").replace("\u2019", "'").split())


def kids_menu_dish(text: str, printed: str, after: str = "", then: str = "") -> tuple[str, list[str]]:
    """(kcal as printed, marks) for a dish of the kids menu PDF: the name exactly as printed (upper case), an optional '*', its marks
    (V, VG, NG, H) and 'NNN kcal'. `after` starts the search at that text (the 'VG version available 416 kcal' line sits under the
    Margherita pizza); `then` is text that must follow the calories (the brownie's 'with caramel sauce')."""
    start = text.find(after) if after else 0
    if start < 0:
        raise SystemExit(f"kids menu PDF: {after!r} not found")
    i = text.find(printed, start)
    if i < 0:
        raise SystemExit(f"kids menu PDF: dish {printed!r} not found")
    m = re.compile(r"\*?\s*" + _KIDS_MARKS + r"(\d+)\s*kcal").match(text, i + len(printed))
    if not m:
        raise SystemExit(f"kids menu PDF: no 'NNN kcal' right after {printed!r}")
    if then and not text[m.end():].lstrip().startswith(then):
        raise SystemExit(f"kids menu PDF: {printed!r} is not followed by {then!r}")
    return m.group(2), re.findall(r"VG|V|NG|H", m.group(1))
