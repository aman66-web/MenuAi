"""Read the Gardener's Retreat restaurant menu PDF (British Garden Centres) into the calorie figures it prints, by position.

Used by tools/uk_extract/british_garden_centres.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "1593"); nothing is converted, rounded or estimated here.

The file is a 12-page InDesign booklet (one square page each) with a real text layer. Pages 4 to 10 are the menu. Every figure is
printed as "NNN kcal" (sometimes "NNNkcal"), either

  * right after a dish's name on the same line ("Tuna Mayonnaise 676 kcal"),
  * at the end of the dish's description ("... served with chips. 1593 kcal."), or on a line of its own under the name,
  * in an add-on line under the dish ("Add Chips 337 kcal.", "Served with Egg 122 kcal or Pineapple 40 kcal."), or
  * as a pair for the two ways a dish is served ("With chips: 802 kcal, with salad: 544 kcal").

Dish names are the lines set in the 12 pt bold face (line height 11.5 to 14 pt in the text layer, descriptions are 10 pt); the big
script titles (Breakfast, Main Meals, ...) are taller than that. Reading is by position, never by counting (a figure's owner is
decided in this order):

  a) a figure on a name line belongs to that name;
  b) a figure to the right of a name on the same row (at most 40 pt away) belongs to that name;
  c) any other figure belongs to the nearest name above it whose left-to-right extent holds the figure's left edge.

Anything that does not fit raises, so a new layout stops the run instead of attaching a number to the wrong dish. The figures of one
owner are numbered 0, 1, 2 ... in reading order, and the script that uses this module names each one and checks the words printed
just before it (see ITEMS in british_garden_centres.py).
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

BLOCK = re.compile(r'<block xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</block>', re.S)
LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
KCAL = re.compile(r"(\d[\d,]*)\s?kcal")
FIRST_PAGE, LAST_PAGE = 4, 10          # the menu itself; the other pages must not print a figure
HEAD_MIN, HEAD_MAX = 11.5, 14.0        # line height (points) of a dish name
TITLE_MIN = 20.0                       # taller lines are the script section titles
DESC_MAX = 10.4                        # description lines are 10.0 pt; photo captions (10.7) and 11 pt notes are not descriptions
ROW_TOLERANCE = 4.5                    # points: a figure and a name on the same row
SAME_ROW_GAP = 40.0                    # points: how far right of the name a same-row figure may sit
EDGE = 2.0                             # points of slack when testing a left edge against a name's extent


def _pdftotext_bbox(pdf: Path, page: int) -> str:
    return subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-bbox-layout", str(pdf), "-"],
                          check=True, capture_output=True, text=True).stdout


def page_lines(pdf: Path, page: int) -> list:
    """Every text line of one page: dict(block, x0, y0, x1, y1, h, text), blocks and lines in the PDF's order."""
    out = _pdftotext_bbox(pdf, page)
    lines = []
    for b, block in enumerate(BLOCK.finditer(out)):
        for m in LINE.finditer(block.group(5)):
            x0, y0, x1, y1, body = m.groups()
            text = " ".join(" ".join(html.unescape(w) for w in WORD.findall(body)).split())
            lines.append(dict(block=b, x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), h=float(y1) - float(y0), text=text))
    return lines


def has_kcal_value(text: str) -> bool:
    return bool(KCAL.search(text))


def _strip_kcal(text: str) -> str:
    return " ".join(KCAL.sub(" ", text).split())


def titles(lines: list) -> list:
    """The big script titles of a page with their spaces removed ('B reakfast' -> 'Breakfast')."""
    return ["".join(l["text"].split()) for l in lines if l["h"] >= TITLE_MIN]


def read_page(pdf: Path, page: int) -> dict:
    """-> dict(headings=[...], figures=[...], titles=[...]).

    headings: dict(text, x0, x1, name_x1, y0, last_y0, desc=[description lines], figures=[figure dicts]) in page order.
    figures:  dict(value, owner (index into headings), index (0-based among that owner's figures), before (words printed since the
              previous figure or the start of the line/block), line (text of its line))."""
    lines = page_lines(pdf, page)
    head_lines = [l for l in lines if HEAD_MIN <= l["h"] < HEAD_MAX and re.search(r"[A-Za-z]", l["text"])]
    # a dish name can wrap over several 12 pt lines of one block
    headings = []
    for block in sorted({l["block"] for l in head_lines}):
        group = sorted((l for l in head_lines if l["block"] == block), key=lambda l: (l["y0"], l["x0"]))
        run = [group[0]]
        for l in group[1:]:
            if l["y0"] - run[-1]["y0"] <= 14.5 and abs(l["x0"] - run[-1]["x0"]) <= 3:
                run.append(l)
            else:
                headings.append(run)
                run = [l]
        headings.append(run)
    heads = []
    for run in headings:
        name_end = run[-1]["x1"] if not has_kcal_value(run[-1]["text"]) else _name_x1(run)
        heads.append(dict(text=_strip_kcal(" ".join(l["text"] for l in run)), x0=min(l["x0"] for l in run), x1=max(l["x1"] for l in run),
                          name_x1=name_end, y0=run[0]["y0"], last_y0=run[-1]["y0"], lines=run, desc=[], figures=[], block=run[0]["block"]))
    heads.sort(key=lambda h: (h["y0"], h["x0"]))
    head_line_ids = {id(l) for h in heads for l in h["lines"]}

    def owner_below(line: dict):
        """rule c: nearest name above whose extent holds the line's left edge."""
        cands = [h for h in heads if h["y0"] < line["y0"] and h["x0"] - EDGE <= line["x0"] <= h["x1"]]
        return max(cands, key=lambda h: h["y0"]) if cands else None

    # description lines (for the meat check): the 10 pt lines under a name, in its column
    for l in lines:
        if id(l) in head_line_ids or l["h"] > DESC_MAX:  # photo captions are 10.7 pt: not descriptions
            continue
        h = owner_below(l)
        if h is not None and l["y0"] - h["y0"] < 200:
            h["desc"].append(l)
    # figures
    block_lines = {}
    for l in lines:
        block_lines.setdefault(l["block"], []).append(l)
    figures = []
    for b, bl in block_lines.items():
        bl.sort(key=lambda l: (l["y0"], l["x0"]))
        prefix = ""
        for l in bl:
            text = l["text"]
            pos = 0
            for m in KCAL.finditer(text):
                before = (prefix + " " + text[pos:m.start()]).strip(" .,;:")
                prefix = ""
                pos = m.end()
                own_head = next((h for h in heads if any(l is hl for hl in h["lines"])), None)
                owner = own_head
                if owner is None:  # rule b
                    row = [h for h in heads if abs(h["last_y0"] - l["y0"]) <= ROW_TOLERANCE and 0 <= m_x(l, m) - h["name_x1"] <= SAME_ROW_GAP]
                    owner = row[0] if len(row) == 1 else None
                    if len(row) > 1:
                        raise ValueError(f"p.{page}: figure {m.group(0)!r} sits beside {len(row)} names: {[h['text'] for h in row]}")
                if owner is None:  # rule c
                    owner = owner_below(l)
                if owner is None:
                    raise ValueError(f"p.{page}: figure {m.group(0)!r} at ({l['x0']:.0f}, {l['y0']:.0f}) belongs to no dish name: {text!r}")
                figures.append(dict(value=m.group(1), owner=owner, before=before, line=text, y0=l["y0"], x0=m_x(l, m)))
            prefix = text[pos:].strip() if pos else (prefix + " " + text).strip()
    figures.sort(key=lambda f: (f["y0"], f["x0"]))
    for h in heads:
        h["figures"] = [f for f in figures if f["owner"] is h]
        for i, f in enumerate(h["figures"]):
            f["index"] = i
    return dict(headings=heads, figures=figures, titles=titles(lines))


def m_x(line: dict, match) -> float:
    """Approximate x of a figure inside its line (characters are not measured: used only to order figures of one row)."""
    n = max(len(line["text"]), 1)
    return line["x0"] + (line["x1"] - line["x0"]) * match.start() / n


def _name_x1(run: list) -> float:
    """Right edge of a name line that also carries a figure: the line's own left edge plus the share of its text before the figure."""
    last = run[-1]
    m = KCAL.search(last["text"])
    if not m:
        return last["x1"]
    return last["x0"] + (last["x1"] - last["x0"]) * m.start() / max(len(last["text"]), 1)


def read_menu(pdf: Path) -> dict:
    """page -> read_page(...) for the menu pages; raises if any other page of the file prints a calorie figure."""
    info = subprocess.run(["pdfinfo", str(pdf)], check=True, capture_output=True, text=True).stdout
    pages = int(re.search(r"^Pages:\s+(\d+)", info, re.M).group(1))
    if pages != 12:
        raise SystemExit(f"The PDF has {pages} pages, expected 12: the menu changed, re-read it")
    for p in range(1, pages + 1):
        if FIRST_PAGE <= p <= LAST_PAGE:
            continue
        for l in page_lines(pdf, p):
            if has_kcal_value(l["text"]):
                raise SystemExit(f"Page {p} prints a calorie figure ({l['text']!r}) but only pages {FIRST_PAGE}-{LAST_PAGE} are read")
    return {p: read_page(pdf, p) for p in range(FIRST_PAGE, LAST_PAGE + 1)}
