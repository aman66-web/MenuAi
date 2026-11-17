"""Read Domino's UK "Nutrition Information Guide" PDFs (pizzas; sides and desserts) into raw rows.

The guides are tables whose cells are drawn as filled rectangles. A row's pizza name, crust and cheese are read from the
cell rectangle that contains the row (so a name centred over many rows is attached to exactly the rows it spans), never guessed
from the order of the text. Numbers are returned as the strings printed: nothing is converted, rounded or filled in.

    rows = read_rows(pdf_path)   # list of dict(page, y, size, nums[list of strings], cells{x0: text})
"""
from __future__ import annotations

import html as _html
import re
import subprocess
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import ContentStream

SIZES = ("Large", "Medium", "Small", "Personal")
NUM = re.compile(r"^<?\d+(\.\d+)?$")


def _words(pdf: Path) -> list[list[tuple[float, float, float, float, str]]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = []
    for pg in re.findall(r"<page .*?</page>", out, re.S):
        pages.append([(float(a), float(b), float(c), float(d), _html.unescape(w)) for a, b, c, d, w in
                      re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg)])
    return pages


def _rects(pdf: Path) -> list[list[tuple[float, float, float, float]]]:
    """Filled/stroked rectangles per page as (x0, y_top, x1, y_bottom) in the same top-left coordinates as the words."""
    reader = PdfReader(str(pdf))
    pages = []
    for pg in reader.pages:
        height = float(pg.mediabox.height)
        cs = ContentStream(pg.get_contents(), reader)
        rects = []
        for ops, op in cs.operations:
            if op == b"re":
                x, y, w, h = (float(v) for v in ops)
                rects.append((x, height - (y + h), x + w, height - y))
        pages.append(rects)
    return pages


# The page layouts the pizza guide has been printed in (x positions in points from the left edge, as pdftotext -bbox reports them).
# "Correct as of 7th September 2026" is A4; "Correct as of 16th November 2026" is US Letter, with every column a few points further right.
# left / mozz / mid are the rounded x0 of the name, cheese and crust (or name) cells; line_x / mozz_x are the word windows dominos.py reads
# a row's own name or crust label and its cheese label from when no cell is drawn. An unknown page width stops the run.
LAYOUTS = {
    "A4": dict(width=595.32, size_x=(204.0, 216.0), num_x_min=234.0, rect_max_x1=209.5, left=51, mozz=91, mid=105,
               line_x=(104.5, 206.0), mozz_x=(89.0, 104.5)),
    "Letter": dict(width=612.0, size_x=(210.0, 221.0), num_x_min=240.0, rect_max_x1=215.0, left=51, mozz=92, mid=107,
                   line_x=(106.5, 212.0), mozz_x=(90.0, 106.5)),
}


def layout(pdf: Path) -> dict:
    # portrait pages only: the bases-and-toppings page is printed landscape in both guides and holds no pizza row
    widths = {round(float(pg.mediabox.width), 2) for pg in PdfReader(str(pdf)).pages if float(pg.mediabox.width) < float(pg.mediabox.height)}
    for name, lay in LAYOUTS.items():
        if all(abs(w - lay["width"]) < 1.0 for w in widths):
            return dict(lay, name=name)
    raise SystemExit(f"{pdf.name}: page widths {sorted(widths)} match no known layout of the guide: the layout changed, re-read it")


def read_rows(pdf: Path, size_x=None, num_x_min=None, expect_nums: int = 20) -> list[dict]:
    lay = layout(pdf)
    size_x = size_x or lay["size_x"]
    num_x_min = num_x_min if num_x_min is not None else lay["num_x_min"]
    rect_max_x1 = lay["rect_max_x1"]
    words, rects = _words(pdf), _rects(pdf)
    rows: list[dict] = []
    for pno, (ws, rs) in enumerate(zip(words, rects), start=1):
        anchors = [w for w in ws if w[4] in SIZES and size_x[0] <= w[0] <= size_x[1]]
        for x0, y0, x1, y1, size in sorted(anchors, key=lambda w: w[1]):
            yc = (y0 + y1) / 2
            nums = sorted([w for w in ws if w[0] >= num_x_min and abs((w[1] + w[3]) / 2 - yc) <= 3.6 and NUM.match(w[4])], key=lambda w: w[0])
            cells: dict[int, str] = {}
            for rx0, ry0, rx1, ry1 in rs:
                if rx1 > rect_max_x1 or rx1 - rx0 < 10 or ry1 - ry0 < 10 or rx1 - rx0 > 300:
                    continue
                if not (ry0 - 0.2 <= yc <= ry1 + 0.2):
                    continue
                inside = [w for w in ws if rx0 - 0.5 <= (w[0] + w[2]) / 2 <= rx1 + 0.5 and ry0 - 0.5 <= (w[1] + w[3]) / 2 <= ry1 + 0.5 and w[4] not in SIZES]
                cells[round(rx0)] = " ".join(w[4] for w in sorted(inside, key=lambda w: (round(w[1]), w[0])))
            rows.append({"page": pno, "y": round(yc, 1), "size": size, "nums": [w[4] for w in nums], "n": len(nums), "cells": cells})
    return rows
