"""Read Village Hotels' "Main Pub & Grill Menu" PDF into its printed calorie values, by position.

Used by tools/uk_extract/village_hotels.py. Requires `pdftotext` (poppler). Values are returned exactly as printed (strings such as
"368"); nothing is converted, rounded or estimated here.

The file is a 7-page designed menu (InDesign, real text layer). Calories are printed in small type inside each dish's
description, as "(368 Kcals)", "(Small 368 Kcals / Large 730 Kcals)" or "(2 people sharing - 945 Kcals per person)". The layout is
free-form columns, so a calorie value is addressed by the text of the line that carries it (and its position on the line):

  * `Reader.value(page, find, pick, y)` finds the ONE line on that page whose text contains `find` (and, when given, whose top edge
    is within 3 points of `y`), and returns its `pick`-th calorie number. Zero or several matching lines stop the run.
  * `Reader.unaccounted()` lists every calorie number printed in the file that no item (and no documented exclusion) used, so a new
    dish, a changed number or a moved line stops the run instead of silently dropping or mis-attaching a value.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', re.S)
LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
KCAL = re.compile(r"(\d+) Kcals?\b")
# The footer of every food page: "Adults need around 2000 Kcals per day." is a guideline, not a dish value.
FOOTER = "adults need around 2000 kcals per day"


class Reader:
    def __init__(self, pdf: Path) -> None:
        out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
        self.pages = []
        self.footers = 0
        for pm in PAGE.finditer(out):
            lines = []
            for i, lm in enumerate(LINE.finditer(pm.group(3))):
                x0, y0, x1, y1, body = lm.groups()
                words = [html.unescape(w) for w in WORD.findall(body)]
                text = " ".join(" ".join(words).split())
                if FOOTER in text.lower():
                    self.footers += 1
                    values = []
                else:
                    values = KCAL.findall(text)
                lines.append(dict(i=i, x0=float(x0), y0=float(y0), text=text, values=values))
            self.pages.append(dict(lines=lines, text=" ".join(" ".join(ln["text"] for ln in lines).split()).lower()))
        self.used = {}

    def value(self, page: int, find: str, pick: int = 0, y: float = None) -> str:
        lines = self.pages[page - 1]["lines"]
        hits = [ln for ln in lines if find in ln["text"] and (y is None or abs(ln["y0"] - y) <= 3)]
        if len(hits) != 1:
            raise SystemExit(f"page {page}: expected exactly one line containing {find!r}" + (f" near y={y}" if y is not None else "")
                             + f", found {len(hits)}: the menu layout changed, re-read the page and update ITEMS")
        ln = hits[0]
        if pick >= len(ln["values"]):
            raise SystemExit(f"page {page}: line {ln['text']!r} has {len(ln['values'])} calorie values, wanted number {pick + 1}")
        key = (page, ln["i"], pick)
        self.used[key] = self.used.get(key, 0) + 1
        return ln["values"][pick]

    def printed(self, page: int, phrase: str) -> bool:
        """True when `phrase` (any case) is printed on the page, in reading order (used to back each tag with the printed words)."""
        return " ".join(phrase.lower().split()) in self.pages[page - 1]["text"]

    def unaccounted(self) -> list:
        out = []
        for p, page in enumerate(self.pages, 1):
            for ln in page["lines"]:
                for k, v in enumerate(ln["values"]):
                    if (p, ln["i"], k) not in self.used:
                        out.append((p, ln["text"], v))
        return out

    def total_values(self) -> int:
        return sum(len(ln["values"]) for page in self.pages for ln in page["lines"])
