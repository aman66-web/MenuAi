"""Read Park Holidays UK's example park menu PDF ("Small_Spring_25_menu.pdf") into dishes with their printed calories.

Used by tools/uk_extract/park_holidays_uk.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as
"1360"); nothing is converted, rounded or estimated here.

The file is a 2-page A3 InDesign layout with a real text layer: page 1 is the wines, the allergy/QR boxes and the cover; page 2 is
the food and hot-drinks menu. Each dish is printed as "NAME NNN kcal [V] [VE] [GF]" on one line (a few names wrap onto a second
line, a few dietary marks sit on a line of their own), with the price at the right and a description under it. Reading is by
position, never by counting:

  1. every line of page 2 is found with its box (pdftotext -bbox-layout);
  2. every "NNN kcal" on a line becomes a token: the words before it (up to the previous token) are the printed name, the V / VE / GF
     words straight after it are its dietary marks. Several tokens can share a line ("CHEESE 380 kcal V BEANS 108 kcal V");
  3. a mark-only line (a lone "V", "V VE GF") belongs to the token on the line 0-8 points above it in the same column;
  4. a wrapped name ("GARLIC CIABATTA" / "BITES BUCKET 260 kcal") is joined from the exact continuation line listed in CONTINUATIONS
     (which must be printed right above, in the same column);
  5. a token belongs to the menu section whose box (SECTIONS, measured from this PDF) holds its line; the section's heading must
     still be printed where the box expects it.

Anything that does not fit (a mark line nobody owns, a heading that moved, a token outside every box) raises, so a new layout stops the
run instead of attaching a number to the wrong dish.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
TOKEN = re.compile(r"(?P<name>.+?) (?P<kcal>\d+) kcal(?P<marks>(?: (?:VE|V|GF)(?= |$))*)")
MARK_ONLY = re.compile(r"^(?:VE|V|GF)(?: (?:VE|V|GF))*$")
# Names that wrap onto two lines: printed name of the line with the calories -> the line printed right above it (same column).
CONTINUATIONS = {"BITES BUCKET": "GARLIC CIABATTA", "BBQ BURGER": "CHARGRILLED CHICKEN"}

# (section, heading text as printed, x0, y0, x1, y1): the area of page 2 (points) holding that section's dishes. Measured from
# "SPRING 25 MENU - 000000". The heading must be printed once, with its left edge in [x0 - 15, x1] and its top in [y0 - 110, y0 + 30].
SECTIONS = [
    ("LITE BITES", "AMAZING VALUE", 25, 100, 285, 445),
    ("STARTERS", "STARTERS", 25, 445, 285, 830),
    ("FAVOURITES", "FAVOURITES", 310, 60, 570, 300),
    ("2 MEALS FOR £25", "2 FOR £ 25", 310, 300, 570, 570),
    ("SIDES", "Sides", 310, 575, 570, 830),
    ("FROM THE GRILL", "FROM THE GRILL", 625, 40, 885, 380),
    ("PIZZAS", "PIZZAS", 625, 385, 885, 690),
    ("SUNDAY ROAST", "SUNDAY ROAST", 625, 690, 885, 830),
    ("DESSERTS", "Desserts", 910, 100, 1175, 540),
    ("COFFEE", "COFFEE", 910, 575, 1175, 705),
    ("TEAS", "TEAS", 910, 705, 1175, 830),
]


def read_lines(pdf: Path, page: int) -> list[dict]:
    out = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-bbox-layout", str(pdf), "-"], check=True,
                         capture_output=True, text=True).stdout
    lines = []
    for m in LINE.finditer(out):
        x0, y0, x1, y1, body = m.groups()
        words = [html.unescape(w) for w in WORD.findall(body)]
        # the dietary icons come with an invisible control character in the text layer: drop control characters and zero-width spaces
        text = " ".join(re.sub("[\x00-\x1f​]", " ", " ".join(words)).split())
        if text:
            lines.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), text=text))
    return lines


def _section(x0: float, y0: float) -> str:
    hits = [s for s, _, bx0, by0, bx1, by1 in SECTIONS if bx0 <= x0 <= bx1 and by0 <= y0 <= by1]
    if len(hits) != 1:
        raise SystemExit(f"A calorie line at ({x0:.0f}, {y0:.0f}) sits in {len(hits)} section boxes {hits}: the layout changed, "
                         "re-measure SECTIONS in park_holidays_uk_pdf.py")
    return hits[0]


def _check_headings(lines: list[dict]) -> None:
    for section, heading, x0, y0, x1, y1 in SECTIONS:
        found = [ln for ln in lines if ln["text"] == heading and x0 - 15 <= ln["x0"] <= x1 and y0 - 110 <= ln["y0"] <= y0 + 30]
        if len(found) != 1:
            raise SystemExit(f"Heading {heading!r} is not printed once where the {section} box expects it ({len(found)} found): the "
                             "layout changed, re-measure SECTIONS in park_holidays_uk_pdf.py")


def read_tokens(pdf: Path) -> tuple[list[dict], list[dict]]:
    """-> (tokens, from_tokens). A token: section, name (as printed, wrapped names joined), kcal (string), marks (list), x0, y0, line.
    from_tokens are the "ADULT from 700 kcal" style lines, which print a minimum, not a figure for a dish (never published)."""
    lines = read_lines(pdf, 2)
    _check_headings(lines)
    tokens, from_tokens = [], []
    for ln in lines:
        pos = 0
        for m in TOKEN.finditer(ln["text"]):
            if ln["text"][pos:m.start()].strip(" •"):
                raise SystemExit(f"Text {ln['text'][pos:m.start()]!r} before a calorie value on the line {ln['text']!r}")
            name = m["name"].strip(" •").strip()
            pos = m.end()
            tok = dict(section=_section(ln["x0"], ln["y0"]), name=name, kcal=m["kcal"], marks=m["marks"].split(), x0=ln["x0"], y0=ln["y0"],
                       x1=ln["x1"], line=ln["text"])
            (from_tokens if name.endswith(" from") else tokens).append(tok)
        rest = ln["text"][pos:].strip() if pos else ""
        if pos and rest and not re.fullmatch(r"(?:\+ )?£\d+\.\d\d", rest):
            raise SystemExit(f"Unread text {rest!r} after the calorie value on the line {ln['text']!r}")
    # wrapped names
    for t in tokens:
        want = CONTINUATIONS.get(t["name"])
        if want is None:
            continue
        above = [ln for ln in lines if ln["text"] == want and abs(ln["x0"] - t["x0"]) <= 2 and 0 < t["y0"] - ln["y0"] <= 12]
        if len(above) != 1:
            raise SystemExit(f"The wrapped name {want!r} is not printed right above {t['name']!r} any more")
        t["name"] = f"{want} {t['name']}"
    wrapped = set(CONTINUATIONS)
    if any(t["name"] in wrapped for t in tokens):
        raise SystemExit("A wrapped name was not joined")
    # mark-only lines
    for ln in lines:
        if MARK_ONLY.match(ln["text"]):
            owners = [t for t in tokens if t["x0"] - 2 <= ln["x0"] <= t["x0"] + 260 and 0 <= ln["y0"] - t["y0"] <= 8]
            if len(owners) != 1:
                raise SystemExit(f"The mark line {ln['text']!r} at ({ln['x0']:.0f}, {ln['y0']:.0f}) belongs to {len(owners)} dishes")
            owners[0]["marks"] += ln["text"].split()
    # every lowercase "kcal" on page 2 must have become a token (the "2000 KCAL" statement is upper case)
    printed = sum(len(re.findall(r"\bkcal\b", ln["text"])) for ln in lines)
    if printed != len(tokens) + len(from_tokens):
        raise SystemExit(f"{printed} 'kcal' values are printed on page 2 but {len(tokens) + len(from_tokens)} were read")
    if sum(len(re.findall(r"\bkcal\b", ln["text"])) for ln in read_lines(pdf, 1)):
        raise SystemExit("Page 1 (wines) now prints calories: read it before trusting this script")
    return tokens, from_tokens
