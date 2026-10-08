"""Read Bettys' official menu PDF (Winter Core Menu 2026) into calorie values paired with the dish line they belong to.

Used by tools/uk_extract/bettys.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as
"745"); nothing is converted, rounded or estimated here.

The file is a 16-page InDesign menu with a real text layer. Calories are printed as "NNN kcal £price" (sometimes "NNNkcal"),
beside the dish name, below its description, or centred below a name in a box. Reading is by position, never by counting:

  1. every word of the text layer is found with its box (pdftotext -bbox-layout) and grouped into the lines pdftotext reports;
  2. a calorie token is a number word followed by the word "kcal" (or one word "NNNkcal"); the running footer
     "Adults need around 2000 kcal a day." is not a token;
  3. the caller names, for each dish, the printed line that carries its name (an "anchor") and how its calories are laid out:
       "row"   the calories sit on the same baseline as the anchor, to its right (the nearest token to the right is the dish's);
       "below" the calories sit under the anchor in the same centred column (the nearest unclaimed token below is the dish's);
  4. every token must be claimed by exactly one anchor, and every anchor must claim exactly one token, otherwise the run stops
     (apart from the tokens the caller lists as deliberately not used).

A name is matched with all spaces removed, because InDesign's letter-spacing leaves gaps inside words ("Dr y-Cured Bacon").
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

PAGE = re.compile(r"<page\b[^>]*>(.*?)</page>", re.S)
LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', re.S)
FOOTER = "Adults need around 2000 kcal a day."
ROW_TOL = 3.0      # points: baselines (line bottoms) closer than this are the same row (rows are at least 12 points apart)
MAX_BELOW = 90.0   # points between an anchor's bottom and a calorie line below it
CX_TOL = 25.0      # points: line centres closer than this are the same centred column


def norm(text: str) -> str:
    return re.sub(r"\s+", "", text.replace("​", ""))


class Line:
    def __init__(self, x0: float, y0: float, x1: float, y1: float, words: list):
        self.x0, self.y0, self.x1, self.y1, self.words = x0, y0, x1, y1, words  # words: (x0, x1, text)
        self.text = " ".join(w[2] for w in words)

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2


class Token:
    def __init__(self, page: int, value: str, x0: float, line: Line, printed: str):
        self.page, self.value, self.x0, self.y1, self.cx, self.printed = page, value, x0, line.y1, line.cx, printed
        self.line_text = line.text


def read_pages(pdf: Path) -> list:
    """-> one dict per page: lines (anchor candidates, incl. the text left of a calorie token), tokens, on_request (count of
    lines saying "kcal on request")."""
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for number, body in enumerate(PAGE.findall(out), 1):
        lines, tokens, on_request = [], [], 0
        for m in LINE.finditer(body):
            x0, y0, x1, y1, inner = m.groups()
            words = [(float(a), float(c), " ".join(html.unescape(t).replace("​", "").split()))
                     for a, _, c, _, t in WORD.findall(inner)]
            words = [w for w in words if w[2]]
            if not words:
                continue
            line = Line(float(x0), float(y0), float(x1), float(y1), words)
            if line.text == FOOTER:
                continue
            if "kcal on request" in line.text:
                on_request += 1
            first = None
            for i, (wx0, wx1, text) in enumerate(words):
                value = None
                if re.fullmatch(r"\d+", text) and i + 1 < len(words) and words[i + 1][2] == "kcal":
                    value = text
                elif re.fullmatch(r"(\d+)kcal", text):
                    value = text[:-4]
                if value is not None:
                    tokens.append(Token(number, value, wx0, line, " ".join(w[2] for w in words[i:])))
                    first = i if first is None else first
            if first is None:
                lines.append(line)
            elif first > 0:  # text left of the calories on the same line ("Fever-Tree Tonic Light (Ve) 30 kcal £4.75")
                left = words[:first]
                lines.append(Line(line.x0, line.y0, left[-1][1], line.y1, left))
        pages.append(dict(number=number, lines=lines, tokens=tokens, on_request=on_request))
    return pages


def find_line(page: dict, text: str, which: tuple = (0, 1)) -> Line:
    """The printed line equal to `text` (spaces ignored). `which` = (index, how many such lines the page must have), counted top to
    bottom, so a repeated name ("Still or Sparkling Water") is told apart by position."""
    key = norm(text)
    hits = sorted((ln for ln in page["lines"] if norm(ln.text) == key), key=lambda ln: (ln.y1, ln.x0))
    index, total = which
    if len(hits) != total:
        raise SystemExit(f"page {page['number']}: expected {total} printed line(s) reading {text!r}, found {len(hits)}: the menu changed")
    return hits[index]


def pair(page: dict, anchors: list, unused_values: list) -> dict:
    """anchors: list of (key, line, mode). -> {key: Token}. Stops unless every token is used once or listed in unused_values."""
    tokens = page["tokens"]
    claimed = {}   # id(token) -> key
    result = {}

    def claim(key, token):
        if id(token) in claimed:
            raise SystemExit(f"page {page['number']}: {key!r} and {claimed[id(token)]!r} both claim the calories {token.printed!r} "
                             "at the same place: the layout changed")
        claimed[id(token)] = key
        result[key] = token

    for key, line, mode in anchors:
        if mode != "row":
            continue
        cands = [t for t in tokens if abs(t.y1 - line.y1) <= ROW_TOL and t.x0 >= line.x1 - 1]
        if not cands:
            raise SystemExit(f"page {page['number']}: no calories on the same row as {key!r}: the layout changed")
        claim(key, min(cands, key=lambda t: t.x0))
    row_taken = set(claimed)
    for key, line, mode in anchors:
        if mode != "below":
            continue
        cands = [t for t in tokens if id(t) not in row_taken and 0 < t.y1 - line.y1 <= MAX_BELOW and abs(t.cx - line.cx) <= CX_TOL]
        if not cands:
            raise SystemExit(f"page {page['number']}: no calories below {key!r}: the layout changed")
        claim(key, min(cands, key=lambda t: t.y1))
    left_over = sorted(t.value for t in tokens if id(t) not in claimed)
    if left_over != sorted(unused_values):
        raise SystemExit(f"page {page['number']}: calories not used by any dish {left_over}, expected {sorted(unused_values)}: "
                         "a new, moved or removed dish; re-read the page and update the table")
    return result
