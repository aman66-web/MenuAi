"""Read Everyman Cinemas' one-page "Calories Menu" PDF into rows of (section, printed label, printed values).

Used by tools/uk_extract/everyman.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as "580",
"+9"); nothing is converted, rounded or estimated here.

The file is ONE landscape page (1200 x 980 pt), an InDesign poster in three columns with a real text layer. A value is printed in one
of four ways, and all four are read by position, never by counting:

    Popcorn chicken ........................ 580kcal           name at the left, "NNNkcal" at the right of the same row
    Classic Dog 499kcal or choose Plant-based 410kcal         several labels and values in one row
    salted ................ 267kcal / 631kcal                 two values (small / large); also "313/260kcal", "125/0/0kcal"
    Vanilla 565kcal, Chocolate 499kcal, Strawberry 457kcal, Salted caramel      a list that wraps onto the next row
    461kcal, Oreo 736kcal

How a row is read:
  1. every word of the text layer is found with its box (pdftotext -bbox-layout);
  2. a section is an area of the page (SECTIONS, measured from this PDF) whose heading text must still be printed where the area
     expects it; words belong to the section whose area holds their left edge and vertical centre;
  3. the words of a section are grouped into rows by vertical centre (ROW_TOL points);
  4. in a row, each value expression ("NNNkcal", "N/N/Nkcal", "N kcal / N kcal", "+9kcal") takes as its label the words between the
     previous value and itself (a leading "or", "or choose" and commas are dropped). A label may be empty when the name was printed at the
     end of the row above (a wrapped list): `prev_row` carries that row's text so the caller can check it.

Anything that does not fit raises: a kcal value outside every section, a heading that moved, a section that should hold no values but does.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', re.S)
LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
VALUE = re.compile(r"(?<![\w.])[+-]?\d+(?:kcal)?(?:\s*/\s*\d+(?:kcal)?)*kcal(?!\w)")
NUMBER = re.compile(r"[+-]?\d+")
ROW_TOL = 3.5   # points between the vertical centres of two words on the same row

# (key, heading text a line must start with, heading left edge, heading top, box x0, y0, x1, y1, holds values?)
# The box is tested against each word's left edge and vertical centre. Measured from the PDF created 2026-09-23 (page 1200 x 980 pt).
SECTIONS = [
    ("SHARING PLATES", "SHARING PLATES", 24, 15, 20, 30, 400, 195, True),
    ("BURGERS", "BURGERS All served in a brioche bun", 24, 198, 20, 225, 400, 505, True),
    ("DOGS & ROLLS", "DOGS & ROLLS", 25, 529, 20, 540, 400, 640, True),
    ("FRIES", "FRIES", 24, 653, 20, 670, 400, 682, True),
    ("PIZZA", "PIZZA", 24, 681, 20, 695, 400, 830, True),
    ("KIDS MENUS", "KIDS MENUS", 24, 846, 20, 860, 400, 945, True),
    # "POPCORN" is drawn as outlines (not in the text layer), so the section is anchored on the "small / large" header under SWEETS.
    ("POPCORN", "small / large", 707, 58, 420, 75, 780, 130, True),
    ("SUNDAES", "SUNDAES", 428, 139, 420, 165, 780, 300, True),
    ("PASTRIES, CAKES AND COOKIE DOUGH", "PASTRIES, CAKES AND COOKIE DOUGH", 427, 308, 420, 325, 780, 400, True),
    ("SWEET POTS", "SWEET POTS", 430, 410, 420, 425, 596, 500, True),
    ("SAVOURY POTS", "SAVOURY POTS", 603, 410, 597, 425, 780, 500, True),
    ("SHAKES & COOLERS", "SHAKES & COOLERS", 429, 527, 420, 560, 780, 610, True),
    ("SOFT", "SOFT", 430, 617, 420, 640, 596, 815, True),
    ("HOT DRINKS", "HOT DRINKS", 603, 618, 597, 640, 780, 775, True),
    ("NO & LOW", "NO & LOW", 429, 822, 420, 838, 780, 945, True),
    # These three print no calories at all on this menu: the run stops if one ever does.
    ("BEERS & CIDERS", "BEERS & CIDERS", 816, 19, 810, 30, 1200, 130, False),
    ("WINE", "WINE", 817, 136, 810, 150, 1200, 470, False),
    ("COCKTAILS", "COCKTAILS", 816, 476, 810, 500, 1200, 960, False),
]


def read_words(pdf: Path) -> "tuple[list[dict], list[dict], str]":
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    words, lines = [], []
    for m in LINE.finditer(out):
        x0, y0, x1, y1, body = m.groups()
        ws = [dict(x0=float(a), y0=float(b), x1=float(c), y1=float(d), text=html.unescape(e).replace("​", "")) for a, b, c, d, e in WORD.findall(body)]
        words.extend(ws)
        lines.append(dict(x0=float(x0), y0=float(y0), text=" ".join(w["text"] for w in ws)))
    plain = subprocess.run(["pdftotext", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return words, lines, " ".join(plain.split())


def _clean_label(text: str) -> str:
    text = " ".join(text.split())
    while True:
        new = re.sub(r"^(?:or choose|or|,|/)\s*", "", text).strip().strip(",").strip()
        if new == text:
            return text
        text = new


def read_rows(pdf: Path) -> "tuple[list[dict], str]":
    """-> (entries in reading order, plain text of the page). Each entry: section, label (as printed on its row), values (list of
    strings exactly as printed, signs kept), row (the whole row's text), prev_row (text of the row above in the same section)."""
    words, lines, plain = read_words(pdf)
    for key, heading, hx, hy, *_ in SECTIONS:
        found = [ln for ln in lines if ln["text"].startswith(heading) and abs(ln["x0"] - hx) <= 8 and abs(ln["y0"] - hy) <= 8]
        if len(found) != 1:
            raise SystemExit(f"Heading {heading!r} is not printed where the {key} section expects it: the layout changed, "
                             "re-measure SECTIONS in everyman_pdf.py")
    claimed = set()
    entries = []
    for key, _h, _hx, _hy, bx0, by0, bx1, by1, holds in SECTIONS:
        inside = [(i, w) for i, w in enumerate(words) if bx0 <= w["x0"] <= bx1 and by0 <= (w["y0"] + w["y1"]) / 2 <= by1]
        for i, _ in inside:
            if i in claimed:
                raise SystemExit(f"A word sits in two sections ({key}): the section areas overlap, fix SECTIONS")
            claimed.add(i)
        rows = []   # each: [centre y, [words]]
        for i, w in sorted(inside, key=lambda iw: ((iw[1]["y0"] + iw[1]["y1"]) / 2, iw[1]["x0"])):
            yc = (w["y0"] + w["y1"]) / 2
            if rows and abs(rows[-1][0] - yc) <= ROW_TOL:
                rows[-1][1].append(w)
            else:
                rows.append([yc, [w]])
        prev = ""
        for _yc, ws in rows:
            ws.sort(key=lambda w: w["x0"])
            text = " ".join(w["text"] for w in ws)
            matches = list(VALUE.finditer(text))
            if matches and not holds:
                raise SystemExit(f"Section {key} now prints calories ({matches[0].group(0)!r}): the menu changed, extend the script")
            start = 0
            for m in matches:
                entries.append(dict(section=key, label=_clean_label(text[start:m.start()]), values=NUMBER.findall(m.group(0)),
                                    printed=m.group(0), row=text, prev_row=prev))
                start = m.end()
            prev = text
    stray = [w["text"] for i, w in enumerate(words) if "kcal" in w["text"] and i not in claimed]
    if stray:
        raise SystemExit(f"Calorie values outside every section: {stray}")
    if not entries:
        raise SystemExit("No calorie values were found")
    return entries, plain
