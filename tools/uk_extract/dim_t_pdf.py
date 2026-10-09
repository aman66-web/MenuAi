"""Read dim t's official PDFs (calorie list, main menu) into plain Python values.

Used by tools/uk_extract/dim_t.py. Requires `pdftotext` (poppler). Everything is returned exactly as printed (strings such
as "1040"); nothing is converted, rounded or estimated here.

1. Calorie PDF ("dim-t-main-menu-calories-14.08.2026-v1.pdf", 3 pages): one table per menu section, a grey heading row
   ("Small Eats" ... "kcal") followed by one "name  kcal" row per dish. Read from `pdftotext -layout`; any line that is
   neither a heading nor a dish row stops the run.

2. Main menu PDF ("dim-t-main-menu-August-2026.pdf", 2 pages): plain text via `pdftotext -layout`. It prints "NNNkcal" after
   each dish and the chain's own marks ((v) vegetarian, (ve) vegan ...), so it is used to cross-check every calorie value and to
   read the marks. Its columns are laid side by side, so it is only searched for short printed snippets (see dim_t.py), never
   parsed as a table. A variant line such as "chicken h 820kcal" is the same under every dish ("Thai spicy basil fried rice",
   "Pad kee mao", ...), so `column_lines` also reads the menu one column at a time (pdftotext crops) and `variant_hits` says
   which printed dish heading each variant line sits under.

(The allergen guide's matrix, "dim-t-main-menu-allergens-14.08.2026-v1.pdf", is read by dim_t_allergen_pdf.py since 2026-10-09; its
dish names differ from the calorie list's for 19 published dishes, which are held back, see dim_t.py.)
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path


def _run(args: list[str]) -> str:
    return subprocess.run(["pdftotext", *args], check=True, capture_output=True, text=True).stdout


def _norm(s: str) -> str:
    return " ".join(s.split())


def read_calories(pdf: Path) -> list[tuple[str, list[tuple[str, str]]]]:
    """[(section heading, [(dish name, kcal text), ...]), ...] in printed order."""
    text = _run(["-layout", str(pdf), "-"])
    sections: list[tuple[str, list[tuple[str, str]]]] = []
    for raw in text.replace("\f", "\n").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.fullmatch(r"(.+?)\s{2,}kcal", line)
        if m:
            sections.append((_norm(m.group(1)), []))
            continue
        m = re.fullmatch(r"(.+?)\s{2,}(\d{1,4})", line)
        if m and sections:
            sections[-1][1].append((_norm(m.group(1)), m.group(2)))
            continue
        raise ValueError(f"Unreadable line in the calorie PDF: {raw!r}")
    return sections


def layout_text(pdf: Path) -> str:
    return _run(["-layout", str(pdf), "-"])


def kcal_values(text: str) -> list[str]:
    """Every 'NNNkcal' number printed in a menu's text (menus print the calories right after the dish name)."""
    return re.findall(r"(\d{1,4})\s?kcal", text)


# The menu pages are 802 x 1146 pt with three text columns; (x, width) of each crop in points (pdftotext's default 72 dpi).
CROPS = [(0, 275), (275, 245), (520, 290)]
MENU_PAGES = (1, 2)


def column_lines(pdf: Path) -> list[list[str]]:
    """The menu's text one column at a time (pages 1 and 2, three crops each), so a dish heading and the variant lines printed
    below it stay together. Lines are in reading order within a column."""
    out = []
    for page in MENU_PAGES:
        for x, w in CROPS:
            text = _run(["-layout", "-f", str(page), "-l", str(page), "-x", str(x), "-y", "0", "-W", str(w), "-H", "1200", str(pdf), "-"])
            out.append([ln.replace("\t", "    ") for ln in text.splitlines()])
    return out


def variant_hits(columns: list[list[str]], headings: list[str], pattern: "re.Pattern[str]") -> list[str]:
    """For every line of every column that matches `pattern`, the printed heading (one of `headings`, matched at the start of a
    segment) it sits under, or '' when no heading has been seen yet in that column."""
    # a heading starts a printed segment: line start, two or more spaces, or the tail of a price cut off by the crop ("14.75   Pad kee mao")
    starts = [(h, re.compile(r"(?:^|\s{2,}|\d\.\d\d\s+)" + re.escape(h))) for h in headings]
    hits = []
    for lines in columns:
        current = ""
        for ln in lines:
            for h, rx in starts:
                if rx.search(ln):
                    current = h
                    break
            if pattern.search(ln):
                hits.append(current)
    return hits
