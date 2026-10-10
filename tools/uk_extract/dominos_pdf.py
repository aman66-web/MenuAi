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


def read_rows(pdf: Path, size_x=(204.0, 216.0), num_x_min=234.0, expect_nums: int = 20) -> list[dict]:
    words, rects = _words(pdf), _rects(pdf)
    rows: list[dict] = []
    for pno, (ws, rs) in enumerate(zip(words, rects), start=1):
        anchors = [w for w in ws if w[4] in SIZES and size_x[0] <= w[0] <= size_x[1]]
        for x0, y0, x1, y1, size in sorted(anchors, key=lambda w: w[1]):
            yc = (y0 + y1) / 2
            nums = sorted([w for w in ws if w[0] >= num_x_min and abs((w[1] + w[3]) / 2 - yc) <= 3.6 and NUM.match(w[4])], key=lambda w: w[0])
            cells: dict[int, str] = {}
            for rx0, ry0, rx1, ry1 in rs:
                if rx1 > 209.5 or rx1 - rx0 < 10 or ry1 - ry0 < 10 or rx1 - rx0 > 300:
                    continue
                if not (ry0 - 0.2 <= yc <= ry1 + 0.2):
                    continue
                inside = [w for w in ws if rx0 - 0.5 <= (w[0] + w[2]) / 2 <= rx1 + 0.5 and ry0 - 0.5 <= (w[1] + w[3]) / 2 <= ry1 + 0.5 and w[4] not in SIZES]
                cells[round(rx0)] = " ".join(w[4] for w in sorted(inside, key=lambda w: (round(w[1]), w[0])))
            rows.append({"page": pno, "y": round(yc, 1), "size": size, "nums": [w[4] for w in nums], "n": len(nums), "cells": cells})
    return rows
