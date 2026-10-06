#!/usr/bin/env python3
"""Contact sheet for checking a chain's item photos by eye: every photo with its item name beneath it.

    python3 tools/uk_extract/photo_sheet.py <chain-id> [--out sheet.png] [--part N] [--per 24]

Prints the path of the PNG. Look at it: the photo must plausibly show the item named under it, and must not be a banner,
logo, placeholder or a picture that prints nutrition numbers. A wrong photo is worse than none: remove it with
tools/uk_extract/remove_photos.py.
"""
from __future__ import annotations

import argparse
import csv
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("chain")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--part", type=int, default=0)
    ap.add_argument("--per", type=int, default=24)
    a = ap.parse_args()
    folder = ROOT / "data" / "source" / a.chain
    names = {r["id"]: r["name"] for r in csv.DictReader(open(folder / "items.csv", newline="", encoding="utf-8-sig"))}
    rows = list(csv.DictReader(open(folder / "images.csv", newline="", encoding="utf-8")))
    rows = rows[a.part * a.per:(a.part + 1) * a.per]
    if not rows:
        raise SystemExit("no photos in that part")
    cols, cell_w, cell_h = 4, 230, 215
    sheet = Image.new("RGB", (cols * cell_w, ((len(rows) + cols - 1) // cols) * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
    except OSError:
        font = ImageFont.load_default()
    for i, r in enumerate(rows):
        x, y = (i % cols) * cell_w, (i // cols) * cell_h
        im = Image.open(ROOT / "web" / "public" / "menu-images" / a.chain / r["file"]).convert("RGB")
        im.thumbnail((cell_w - 10, 150))
        sheet.paste(im, (x + (cell_w - im.width) // 2, y + 4))
        label = names.get(r["item_id"], r["item_id"])
        for j, line in enumerate(textwrap.wrap(label, 34)[:3]):
            draw.text((x + 6, y + 158 + j * 16), line, fill="black", font=font)
    out = a.out or Path(f"/private/tmp/photo-sheet-{a.chain}-{a.part}.png")
    sheet.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
