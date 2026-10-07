"""Read Tesco Cafe's official "GB Allergen Matrix" PDF into rows: name, printed kcal cell and the printed Y / M marks.

Used by tools/uk_extract/tesco_cafe.py. Requires `pdftotext` (poppler). Everything is returned exactly as printed ("100/130 kcal",
"495 kcal", "-"); nothing is converted, rounded or estimated here.

Every table page is a landscape grid: row name (left), one "kcal" cell, then 26 allergen columns on a regular 24 pt pitch, each cell
empty or printed "Y" (contains) or "M" (may contain). Rows are read by position, never by counting:

  1. every word of the page is found with its box (pdftotext -bbox);
  2. the column headers are rotated words; each header's x centre must sit on the grid in COLUMNS (checked every page);
  3. in the data area (below the header, above the page footer) the "kcal cell" words (x in KCAL_X) give one anchor per row; the
     row's name is the name-column words (x < KCAL_X[0]) whose lines are closest to that anchor; a Y/M mark belongs to the anchor on
     its own line and to the column whose centre is nearest.

Anything that does not fit (a name nobody owns, a mark between two columns or between two rows, header words that moved, a number
of names that differs from the number of kcal cells) raises, so a new layout stops the run instead of attaching a mark to the
wrong dish.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

# header text (words joined with a space) -> x centre of its column, points. Same on every table page (checked).
COLUMNS = [
    ("Gluten :", 204), ("Wheat", 228), ("Rye", 252), ("Barley", 276), ("Oats", 300), ("Crustaceans", 324), ("Eggs", 348),
    ("Fish", 372), ("Peanuts", 396), ("Soya", 420), ("Milk", 444), ("Nuts :", 468), ("Almonds", 492), ("Hazelnut", 516),
    ("Walnut", 540), ("Cashew nut", 564), ("Pecan nut", 588), ("Brazil nut", 612), ("Pistachio nut", 636),
    ("Macadamia nut", 660), ("Celery", 684), ("Mustard", 708), ("Sesame", 732), ("Sulphites", 756), ("Lupin", 780),
    ("Molluscs", 804),
]
COL_TOL = 6.0          # a mark's x centre must be this close to a column centre
HEADER_TOL = 6.0       # a header word's x centre must be this close to its column centre
KCAL_X = (145.0, 195.0)   # words whose x centre is inside are the kcal cell
NAME_MAX_X = 145.0
ROW_TOL = 5.0          # a mark / name line must be this close (y centre) to its row anchor
NAME_LINE_GAP = 11.5   # consecutive name lines closer than this belong to one name
DATA_TOP_MIN = 172.0   # data rows start below the header (page-specific, see _data_top)
FOOTER_Y = 572.0       # the "PAGE n OF 20" footer sits below this (the last row of a page ends at about 566)


class PdfLayoutError(RuntimeError):
    pass


def _pages(pdf: Path) -> list[list[dict]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for chunk in out.split("<page ")[1:]:
        words = []
        for a, b, c, d, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', chunk):
            x0, y0, x1, y1 = float(a), float(b), float(c), float(d)
            words.append(dict(x0=x0, y0=y0, x1=x1, y1=y1, cx=(x0 + x1) / 2, cy=(y0 + y1) / 2, text=html.unescape(w)))
        pages.append(words)
    return pages


def page_texts(pdf: Path) -> list[str]:
    """Plain text of each page (reading order), used for the title lines."""
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return out.split("\f")


def _header(words: list[dict], page_no: int) -> tuple[float, str]:
    """(y of the bottom of the header band, first-column title) after checking every column header sits on the grid."""
    band_bottom = None
    heads = {}
    for name, cx in COLUMNS:
        parts = name.split(" ")
        # a header is one or two rotated words stacked in the same x band (e.g. "Cashew" + "nut", "Gluten" + ":")
        cand = [w for w in words if abs(w["cx"] - cx) <= HEADER_TOL and w["text"] in parts and w["y1"] < 175 + 40 and w["y0"] > 100]
        if sorted(w["text"] for w in cand) != sorted(parts):
            raise PdfLayoutError(f"page {page_no}: column header {name!r} not found at x={cx} (found {[w['text'] for w in cand]})")
        heads[name] = cand
    # the data area starts below the lowest header word of any column
    band_bottom = max(w["y1"] for cand in heads.values() for w in cand)
    return band_bottom, ""


def read_page(words: list[dict], page_no: int) -> tuple[str, list[dict]]:
    """-> (title of the first column e.g. 'Drinks', rows). Each row: name, kcal (printed cell text), marks {column: 'Y'|'M'}."""
    head_bottom, _ = _header(words, page_no)
    # first-column title: the words left of the kcal cell inside the header band
    head_top = min(w["y0"] for w in words if w["text"] in ("Gluten", "Molluscs", "Crustaceans") and w["y0"] > 100 and w["y1"] < head_bottom + 1)
    title_words = [w for w in words if 50 < w["cx"] < NAME_MAX_X and head_top - 3 < w["cy"] < head_bottom]
    title = " ".join(w["text"] for w in sorted(title_words, key=lambda w: (round(w["cy"]), w["x0"])))
    area = [w for w in words if w["y0"] > head_bottom + 1 and w["y1"] < FOOTER_Y]
    # a venue banner or other text between the notes and the header is above head_bottom; nothing printed in the data area
    # may sit outside the name / kcal / grid columns
    names = [w for w in area if w["cx"] < NAME_MAX_X]
    kcal = [w for w in area if KCAL_X[0] <= w["cx"] <= KCAL_X[1]]
    grid = [w for w in area if w["cx"] > KCAL_X[1]]
    # anchors: the kcal cell words grouped by line
    kcal.sort(key=lambda w: (w["cy"], w["x0"]))
    anchors: list[dict] = []
    for w in kcal:
        if anchors and abs(anchors[-1]["cy"] - w["cy"]) < 3.0:
            anchors[-1]["words"].append(w)
        else:
            anchors.append(dict(cy=w["cy"], words=[w]))
    for a in anchors:
        a["words"].sort(key=lambda w: w["x0"])
        a["kcal"] = " ".join(w["text"] for w in a["words"])
        a["marks"] = {}
    # names: lines grouped by y, then lines closer than NAME_LINE_GAP merged
    names.sort(key=lambda w: (w["cy"], w["x0"]))
    lines: list[dict] = []
    for w in names:
        if lines and abs(lines[-1]["cy"] - w["cy"]) < 3.0:
            lines[-1]["words"].append(w)
        else:
            lines.append(dict(cy=w["cy"], words=[w]))
    clusters: list[dict] = []
    for ln in lines:
        ln["words"].sort(key=lambda w: w["x0"])
        ln["text"] = " ".join(w["text"] for w in ln["words"])
        if clusters and ln["cy"] - clusters[-1]["lines"][-1]["cy"] < NAME_LINE_GAP:
            clusters[-1]["lines"].append(ln)
        else:
            clusters.append(dict(lines=[ln]))
    for c in clusters:
        c["cy"] = (c["lines"][0]["cy"] + c["lines"][-1]["cy"]) / 2
        name = c["lines"][0]["text"]
        for ln in c["lines"][1:]:   # a name wrapped after a hyphen ("Gluten-" / "Free Bread") is one word; otherwise a space
            name = name + ln["text"] if name.endswith("-") and not name.endswith(" -") else name + " " + ln["text"]
        c["name"] = name
    if len(clusters) != len(anchors):
        raise PdfLayoutError(f"page {page_no}: {len(clusters)} names but {len(anchors)} kcal cells: layout changed")
    rows = []
    for c, a in zip(clusters, anchors):
        if abs(c["cy"] - a["cy"]) > ROW_TOL:
            raise PdfLayoutError(f"page {page_no}: name {c['name']!r} is {abs(c['cy'] - a['cy']):.1f} pt from its kcal cell {a['kcal']!r}")
        rows.append(dict(name=c["name"], kcal=a["kcal"], cy=a["cy"], marks=a["marks"], page=page_no))
    for w in grid:
        if w["text"] not in ("Y", "M"):
            raise PdfLayoutError(f"page {page_no}: unexpected text {w['text']!r} in the allergen grid at x={w['cx']:.0f}, y={w['cy']:.0f}")
        row = min(rows, key=lambda r: abs(r["cy"] - w["cy"]))
        if abs(row["cy"] - w["cy"]) > ROW_TOL:
            raise PdfLayoutError(f"page {page_no}: mark {w['text']} at y={w['cy']:.0f} is not on any row")
        col, cx = min(COLUMNS, key=lambda c: abs(c[1] - w["cx"]))
        if abs(cx - w["cx"]) > COL_TOL:
            raise PdfLayoutError(f"page {page_no}: mark {w['text']} at x={w['cx']:.0f} is not in a column")
        if col in row["marks"]:
            raise PdfLayoutError(f"page {page_no}: row {row['name']!r} has two marks in column {col!r}")
        row["marks"][col] = w["text"]
    return title, rows


def read_matrix(pdf: Path) -> tuple[list[dict], list[dict]]:
    """-> (rows, skipped pages). Page 1 is the cover note (no table). A table page headed by a venue banner ("For Ingleby, Helsby &
    Heswall Only:") is single-venue and is not read: it is returned in the skipped list with its banner and its row names, so the
    caller can report it. Each row also carries 'title' (first-column heading)."""
    texts = page_texts(pdf)
    out, skipped = [], []
    for n, words in enumerate(_pages(pdf), 1):
        if n == 1:
            continue
        banner = re.search(r"^\s*(For [^\n]*? Only):?\s*$", texts[n - 1], re.M)
        if banner:
            skipped.append(dict(page=n, banner=" ".join(banner.group(1).split()),
                                names=[re.split(r"\s{2,}", ln.strip())[0] for ln in texts[n - 1].splitlines()
                                   if re.match(r"^[A-Za-z]", ln.strip()) and re.search(r"\s{2,}\d+ kcal\s", ln + " ")
                                   and not ln.strip().startswith("kcal ")]))
            continue
        title, rows = read_page(words, n)
        for r in rows:
            r["title"] = title
        out += rows
    return out, skipped


if __name__ == "__main__":
    import sys
    rows, skipped = read_matrix(Path(sys.argv[1]))
    for sk in skipped:
        print("SKIPPED page", sk["page"], sk["banner"], len(sk["names"]), "rows")
    for r in rows:
        print(r["page"], "|", r["title"], "|", r["name"], "|", r["kcal"], "|", " ".join(f"{k.split()[0]}={v}" for k, v in r["marks"].items()))
