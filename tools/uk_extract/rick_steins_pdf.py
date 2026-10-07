"""Reads Rick Stein's menu PDFs by position (helper for rick_steins.py).

The menus are Word / InDesign print-outs with a text layer. Several have two to four columns, so a plain `pdftotext` run
interleaves the columns. `pdftotext -bbox` gives every word with its box; a ZONE (a rectangle on the page, in PDF points,
origin top-left) is read as visual rows: words whose vertical centres are within a few points are one row, sorted left to right.
Nothing is converted or rounded: figures come out as the characters the PDF holds.

    python3 tools/uk_extract/rick_steins_pdf.py menu.pdf [page] [x0 y0 x1 y1]     # debug: print rows with their positions
"""
from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path

_WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
_PAGE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)"')
ROW_TOLERANCE = 2.5  # points between the vertical centres of two words that sit on one visual row


def _unescape(s: str) -> str:
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")


def page_count(pdf: Path) -> int:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(re.search(r"^Pages:\s+(\d+)", out, re.M).group(1))


def read_words(pdf: Path, page: int) -> list[tuple[float, float, float, float, str]]:
    """All words of one page as (xMin, yMin, xMax, yMax, text), positions in points from the top-left corner."""
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    return [(float(a), float(b), float(c), float(d), _unescape(t)) for a, b, c, d, t in _WORD.findall(out)]


def page_size(pdf: Path, page: int) -> tuple[float, float]:
    out = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    m = _PAGE.search(out)
    return float(m.group(1)), float(m.group(2))


def zone_rows(words, box=None) -> list[tuple[float, float, str]]:
    """Visual rows (y, x of the first word, text) of the words whose top-left corner is inside box = (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box if box else (-1e9, -1e9, 1e9, 1e9)
    inside = [w for w in words if x0 <= w[0] < x1 and y0 <= w[1] < y1]
    inside.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    rows: list[list] = []
    for w in inside:
        mid = (w[1] + w[3]) / 2
        if rows and abs(rows[-1][0] - mid) <= ROW_TOLERANCE:
            rows[-1][1].append(w)
        else:
            rows.append([mid, [w]])
    result = []
    for mid, ws in rows:
        ws.sort(key=lambda w: w[0])
        result.append((round(mid, 1), round(ws[0][0], 1), " ".join(w[4] for w in ws)))
    return result


def zone_text(pdf: Path, page: int, box=None) -> str:
    """The text of a zone, one visual row per line."""
    return "\n".join(t for _, _, t in zone_rows(read_words(pdf, page), box))


if __name__ == "__main__":
    pdf = Path(sys.argv[1])
    pg = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    box = tuple(float(v) for v in sys.argv[3:7]) if len(sys.argv) >= 7 else None
    print("page size", page_size(pdf, pg))
    for y, x, t in zone_rows(read_words(pdf, pg), box):
        print(f"{y:7.1f} {x:6.1f}  {t}")
