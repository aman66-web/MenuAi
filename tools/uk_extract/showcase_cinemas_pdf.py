"""Read Showcase Cinemas' official "KCAL INFORMATION" PDF (an Excel export with a text layer) into blocks of rows with their printed cells.

Used by tools/uk_extract/showcase_cinemas.py. Requires `pdftotext` (poppler). Cells are returned exactly as printed (strings such as
"528.75", "0.3"); nothing is converted, rounded or estimated here.

The file is one wide spreadsheet printed on 9 A4 pages. Every table has a title in column A, column labels to the right ("Per 100g",
"Small", ...) and one row per product. Columns are fixed across the whole file (the x centres in COLS, measured from the PDF), and
a blank cell is simply absent, so values are placed by POSITION, never by counting. Reading:

  1. every word of the text layer is found with its box (pdftotext -bbox) and grouped into lines by y;
  2. words left of NAME_X are the row name, words right of it are cells, each put in the column whose x centre is nearest;
  3. a row is a line with numeric cells. Its name is the name on the same line, or (when the cells sit vertically between two name
     lines, a wrapped name) the two name lines 7.2 pt above and below it; a row with neither has NO NAME and is never published;
  4. name lines nobody used are table titles and must match TITLES exactly (a title may wrap onto two lines); anything else stops the run;
  5. a column label is read from the non-numeric cells next to its title (a label may wrap onto two lines) and is returned so the
     caller can check it is the label it expects for that column; a table with no labels of its own (the sub-tables under "Flexeserve /
     Louies - Hot Hold Products") inherits the columns above it.

Anything that does not fit (an unexpected line of text, a number between two columns, a title that moved) raises, so a new layout stops
the run instead of attaching a number to the wrong product.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
NUM = re.compile(r"^\d+(?:\.\d+)?$")
# x centres (points) of the value columns B..G, measured from the PDF; A is the name column.
COLS = {"B": 223.3, "C": 290.0, "D": 347.0, "E": 406.0, "F": 465.0, "G": 518.0}
COL_TOL = 16.0
NAME_X = 190.0
TOP, BOTTOM = 30.0, 790.0  # the first row of a page can sit at 54 pt (a different font puts its name higher than its cells)
PAGE1_TITLE = "SHOWCASE CINEMAS - KCAL INFORMATION"
Y_SAME = 3.0  # rows in a different font (the Biscoff rows) sit 2.4 pt higher than their cells
Y_WRAP = 7.25
Y_WRAP_TOL = 2.6
Y_TITLE_PAIR = 16.0


def _col(x_centre: float, where: str, strict: bool = True) -> str:
    """The column whose centre is nearest. Numbers must be within COL_TOL of it; label words (a label wraps over several words) are not."""
    best = min(COLS, key=lambda c: abs(COLS[c] - x_centre))
    if strict and abs(COLS[best] - x_centre) > COL_TOL:
        raise SystemExit(f"{where}: a cell centred at x={x_centre:.1f} is not under any column (nearest {best} at {COLS[best]}): the layout changed")
    return best


def read_pages(pdf: Path) -> list[list[dict]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for ptxt in out.split("<page ")[1:]:
        words = [dict(x0=float(a), y0=float(b), x1=float(c), y1=float(d), text=html.unescape(t)) for a, b, c, d, t in WORD.findall(ptxt)]
        pages.append(words)
    return pages


def _lines(words: list[dict], pno: int) -> list[dict]:
    """Group one page's words into lines (same y), split into the name part and the cells."""
    words = sorted(words, key=lambda w: (w["y0"], w["x0"]))
    clusters: list[list[dict]] = []
    for w in words:
        if clusters and abs(w["y0"] - clusters[-1][0]["y0"]) <= Y_SAME:
            clusters[-1].append(w)
        else:
            clusters.append([w])
    lines = []
    for cl in clusters:
        y0 = cl[0]["y0"]
        name = " ".join(w["text"] for w in sorted((w for w in cl if w["x0"] < NAME_X), key=lambda w: w["x0"]))
        name = " ".join(name.split())
        cells = sorted((w for w in cl if w["x0"] >= NAME_X), key=lambda w: w["x0"])
        header = any(not NUM.match(w["text"]) for w in cells)  # a line with any non-numeric cell is a header line ("6 inch" has a number in it)
        nums, labels = {}, []
        for w in cells:
            col = _col((w["x0"] + w["x1"]) / 2, f"page {pno}, y {y0:.0f}", strict=not header)
            if header:
                labels.append(dict(col=col, y0=w["y0"], x0=w["x0"], text=w["text"]))
            else:
                if col in nums:
                    raise SystemExit(f"page {pno}, y {y0:.0f}: two numbers in column {col}")
                nums[col] = w["text"]
        lines.append(dict(page=pno, y0=y0, name=name, nums=nums, labels=labels))
    return lines


def read_blocks(pdf: Path, titles: list[str], splits: dict[str, str]) -> list[dict]:
    """-> blocks in document order: dict(title, labels {col: label as printed} or None, rows [dict(name, cells {col: text}, page, y0)]).
    `titles`: every table title that must be printed, in order. `splits`: row name -> title of a table that starts at that row (untitled)."""
    pages = read_pages(pdf)
    all_lines: list[dict] = []
    footers = []
    for pno, words in enumerate(pages, 1):
        body = [w for w in words if TOP <= w["y0"] <= BOTTOM]
        foot = " ".join(w["text"] for w in sorted((w for w in words if w["y0"] > BOTTOM), key=lambda w: (round(w["y0"]), w["x0"])))
        footers.append(foot)
        if pno == 1:
            title = " ".join(w["text"] for w in sorted((w for w in body if w["y0"] < 90), key=lambda w: w["x0"]))
            if title != PAGE1_TITLE:
                raise SystemExit("Page 1 no longer starts with the title 'SHOWCASE CINEMAS - KCAL INFORMATION'")
            body = [w for w in body if w["y0"] >= 90]
        all_lines.extend(_lines(body, pno))
    for pno, foot in enumerate(footers, 1):
        if not re.fullmatch(rf"September 2026 Adults need around 2000kcal a day Page {pno} of {len(pages)}", foot):
            raise SystemExit(f"Page {pno} footer is {foot!r}: the edition or page count changed, re-read the file")
    rows = [ln for ln in all_lines if ln["nums"]]
    label_lines = [ln for ln in all_lines if ln["labels"]]
    name_only = [ln for ln in all_lines if ln["name"] and not ln["nums"]]
    for r in rows:
        if r["name"]:
            r["_name"] = r["name"]
            continue
        above = [ln for ln in name_only if ln["page"] == r["page"] and abs((r["y0"] - ln["y0"]) - Y_WRAP) <= Y_WRAP_TOL and not ln["labels"]]
        below = [ln for ln in name_only if ln["page"] == r["page"] and abs((ln["y0"] - r["y0"]) - Y_WRAP) <= Y_WRAP_TOL and not ln["labels"]]
        if len(above) == 1 and len(below) == 1:
            r["_name"] = f"{above[0]['name']} {below[0]['name']}"
            above[0]["used"] = below[0]["used"] = True
        elif not above and not below:
            r["_name"] = ""
        else:
            raise SystemExit(f"page {r['page']}, y {r['y0']:.0f}: cells {r['nums']} sit next to {len(above)} + {len(below)} name lines")
    # titles: unused name lines, matched in order (a title may wrap onto two lines)
    unused = [ln for ln in name_only if not ln.get("used")]
    found, i = [], 0
    for want in titles:
        if i >= len(unused):
            raise SystemExit(f"Title {want!r} is not printed (after {found[-1]['title'] if found else 'the start'})")
        ln = unused[i]
        if ln["name"] == want:
            found.append(dict(title=want, page=ln["page"], y0=ln["y0"], ymid=ln["y0"]))
            i += 1
        elif i + 1 < len(unused) and unused[i + 1]["page"] == ln["page"] and unused[i + 1]["y0"] - ln["y0"] < Y_TITLE_PAIR \
                and f"{ln['name']} {unused[i + 1]['name']}" == want:
            found.append(dict(title=want, page=ln["page"], y0=ln["y0"], ymid=(ln["y0"] + unused[i + 1]["y0"]) / 2))
            i += 2
        else:
            raise SystemExit(f"Expected the title {want!r} but the next unread text is {ln['name']!r} (page {ln['page']}, y {ln['y0']:.0f})")
    if i != len(unused):
        extra = unused[i]
        raise SystemExit(f"Unexpected text {extra['name']!r} (page {extra['page']}, y {extra['y0']:.0f}) is not a known title or a row name")
    # blocks: a title starts a block; rows follow in document order until the next title (or a split row)
    order = lambda o: (o["page"], o["y0"])  # noqa: E731
    starts = sorted(found, key=order)
    blocks = [dict(title=t["title"], page=t["page"], y0=t["y0"], ymid=t["ymid"], labels={}, rows=[]) for t in starts]
    for r in sorted(rows, key=order):
        cur = None
        for b in blocks:
            if order(b) <= order(r):
                cur = b
        if cur is None:
            raise SystemExit(f"A row {r['_name']!r} (page {r['page']}) comes before the first title")
        if r["_name"] in splits and cur["title"] != splits[r["_name"]]:
            new = dict(title=splits[r["_name"]], page=r["page"], y0=r["y0"] - 0.5, ymid=r["y0"], labels=None, rows=[])
            blocks.insert(blocks.index(cur) + 1, new)
            cur = new
        cur["rows"].append(dict(name=r["_name"], cells=r["nums"], page=r["page"], y0=r["y0"]))
    # labels: each label word belongs to the title nearest to it on the same page
    for ln in label_lines:
        for lab in ln["labels"]:
            same = [b for b in blocks if b["page"] == ln["page"] and b["labels"] is not None and abs(b["ymid"] - lab["y0"]) <= 12.5]
            if not same:
                raise SystemExit(f"Column label {lab['text']!r} (page {ln['page']}, y {lab['y0']:.0f}) is not next to any title")
            b = min(same, key=lambda b: abs(b["ymid"] - lab["y0"]))
            b.setdefault("_words", []).append(lab)
    prev = None
    for b in blocks:
        words = b.pop("_words", [])
        if b["labels"] is None:
            b["labels"] = dict(prev["labels"]) if prev else {}
            b["inherited"] = True
        else:
            labels = {}
            for col in sorted({w["col"] for w in words}):
                labels[col] = " ".join(w["text"] for w in sorted((w for w in words if w["col"] == col), key=lambda w: (round(w["y0"]), w["x0"])))
            b["labels"] = labels
            if not labels:
                b["labels"] = dict(prev["labels"]) if prev else {}
                b["inherited"] = True
        prev = b
    return blocks
