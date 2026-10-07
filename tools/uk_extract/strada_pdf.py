"""Read Strada's official Southbank menu with calories (January 2025 edition) into dishes with their printed calories.

Used by tools/uk_extract/strada.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as
"1056 / 1648"); nothing is converted, rounded or estimated here.

The file is ONE A4 landscape page, an InDesign layout with a real text layer, in three columns. Each dish is an upper-case name
line with its dietary mark and price, then a description line or two; the calories are printed at the end of the description as
"NNN KCAL" (or on the name line itself: "LARGE GREEN OLIVES ( VE) 5 203 KCAL"):

    PAPPARDELLE BOLOGNESE 17                         <- name, price
    Beef ragu & red wine 790 KCAL                    <- description, calories

Reading is by position, never by counting:
  1. every line of the text layer is found with its box (pdftotext -bbox-layout) and put in the column its left edge is in;
  2. a heading is a line whose text is one of HEADINGS, in the column its centre is in; a dish belongs to the heading above it
     in its own column;
  3. a dish line is an upper-case name, an optional ( VG) / ( VE) mark and a price; the dish owns the following lines of its
     column up to the next dish line or heading, but only through the last line that carries a KCAL value (so a "TOPPINGS"
     list under the last pizza is never read as part of its description);
  4. every "NNN KCAL" / "NNN / NNN KCAL" on the page must belong to a dish, in the order printed.

Anything that does not fit (a calorie value nobody owns, a heading that moved) raises, so a new layout stops the run instead of
attaching a number to the wrong dish.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
BLOCK = re.compile(r"<block\b[^>]*>(.*?)</block>", re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
DISH = re.compile(
    r"^(?P<name>(?:8oz )?[A-Z][A-Z &’'\-]+?)(?: (?P<marks>\( ?V[GE] ?\)))? "
    r"(?P<price>\d+(?:\.\d+)?(?: / \d+(?:\.\d+)?)?)(?P<rest>(?: .*)?)$")
KCAL = re.compile(r"(\d+(?: / \d+)?) KCAL")
HEADINGS = ["APERITIVI", "BREAD & NIBBLES", "ANTIPASTI", "PASTA AND RISOTTO", "MAINS & GRILLS", "PIZZA", "SALADS", "SIDES"]
LEGEND = "( VG) SUITABLE FOR VEGETARIANS. ( VE ) SUITABLE FOR VEGANS."


def _column_of_x(x: float, edges=(150.0, 450.0)) -> int:
    return 0 if x < edges[0] else 1 if x < edges[1] else 2


def _lines(pdf: Path) -> list[dict]:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = []
    for b, block in enumerate(BLOCK.finditer(out)):
        for m in LINE.finditer(block.group(1)):
            x0, y0, x1, y1, body = m.groups()
            words = [html.unescape(w) for w in WORD.findall(body)]
            text = " ".join(" ".join(words).replace("​", "").split())
            lines.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), text=text, block=b))
    return lines


def read_dishes(pdf: Path) -> tuple[list[dict], list[dict]]:
    """-> (dishes that print KCAL values, dish lines that print none). Each dish: name (as printed), marks ('VG', 'VE' or ''),
    price (as printed), section (heading), tokens (list of (value as printed, text printed before it back to the previous
    value or the start of the dish)), text (the dish's own lines through the last KCAL line, for the meat check)."""
    lines = _lines(pdf)
    if not any(ln["text"] == LEGEND for ln in lines):
        raise ValueError(f"The legend {LEGEND!r} is not printed: (VG)/(VE) may mean something else now, re-read the menu")
    headings = []
    for ln in lines:
        if ln["text"] in HEADINGS:
            headings.append(dict(ln, col=_column_of_x((ln["x0"] + ln["x1"]) / 2, (250.0, 550.0))))
    if sorted(h["text"] for h in headings) != sorted(HEADINGS):
        raise ValueError(f"Headings found {sorted(h['text'] for h in headings)}, expected {sorted(HEADINGS)}: the layout changed")
    by_col = {c: sorted([ln for ln in lines if _column_of_x(ln["x0"]) == c], key=lambda ln: ln["y0"]) for c in range(3)}
    dishes, silent = [], []
    for c, col_lines in by_col.items():
        col_heads = [h for h in headings if h["col"] == c]
        starts = []
        for i, ln in enumerate(col_lines):
            m = DISH.match(ln["text"])
            if m:
                above = [h for h in col_heads if h["y0"] <= ln["y0"]]
                if not above:
                    raise ValueError(f"Dish line {ln['text']!r} has no heading above it in its column")
                starts.append((i, m, max(above, key=lambda h: h["y0"])["text"]))
        for k, (i, m, section) in enumerate(starts):
            nxt = starts[k + 1][0] if k + 1 < len(starts) else len(col_lines)
            own = []
            for ln in col_lines[i:nxt]:
                if ln is not col_lines[i] and ln["text"] in HEADINGS:
                    break
                own.append(ln)
            kcal_idx = [j for j, ln in enumerate(own) if KCAL.search(ln["text"])]
            own = own[: kcal_idx[-1] + 1] if kcal_idx else own[:1]
            text = " ".join(ln["text"] for ln in own)
            tokens, prev_end = [], 0
            for t in KCAL.finditer(text):
                tokens.append((t.group(1), text[prev_end:t.start()]))
                prev_end = t.end()
            marks = (m["marks"] or "").replace(" ", "").strip("()")
            dish = dict(name=m["name"].strip(), marks=marks, price=m["price"], section=section, tokens=tokens, text=text,
                        x0=col_lines[i]["x0"], y0=col_lines[i]["y0"])
            (dishes if tokens else silent).append(dish)
    printed = sum(len(KCAL.findall(ln["text"])) for ln in lines)
    owned = sum(len(d["tokens"]) for d in dishes)
    if printed != owned:
        raise ValueError(f"{printed} KCAL values on the page but {owned} were attached to dishes")
    dishes.sort(key=lambda d: (d["x0"] // 100, d["y0"]))
    return dishes, silent
