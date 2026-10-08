#!/usr/bin/env python3
"""Contact sheet for checking a supermarket's product photos by eye: every stored photo with the product's name and size beneath it.

    python3 tools/groceries/photo_sheet.py <retailer> [--part N] [--per 24] [--cols 6] [--out sheet.png]

Prints the path of the PNG. Look at it: the photo must plausibly show the product named under it, and must not be a placeholder ("image coming
soon"), a banner, a logo, or a picture that prints nutrition numbers. A wrong photo is worse than none: delete that row from
data/groceries/images/<retailer>.csv and rerun tools/groceries/fetch_retailer_images.py (it removes the file nothing uses any more).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("retailer")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--part", type=int, default=0)
    ap.add_argument("--per", type=int, default=24)
    ap.add_argument("--cols", type=int, default=6)
    a = ap.parse_args()
    doc = json.loads((ROOT / "web" / "public" / "groceries" / f"{a.retailer}.json").read_text())
    names = {p["gtin"]: f"{p['name']} {p.get('size', '')}".strip() for p in doc["products"]}
    with open(ROOT / "data" / "groceries" / "images" / f"{a.retailer}.csv", newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r.get("file")]
    rows = rows[a.part * a.per:(a.part + 1) * a.per]
    if not rows:
        raise SystemExit("no photos in that part")
    cols, cell_w, cell_h = a.cols, 230, 215
    sheet = Image.new("RGB", (cols * cell_w, ((len(rows) + cols - 1) // cols) * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
    except OSError:
        font = ImageFont.load_default()
    for i, r in enumerate(rows):
        x, y = (i % cols) * cell_w, (i // cols) * cell_h
        raw = Image.open(ROOT / "web" / "public" / "grocery-images" / a.retailer / r["file"]).convert("RGBA")
        im = Image.new("RGB", raw.size, "white")  # the app shows photos on white, so transparent cut-outs are judged on white
        im.paste(raw, mask=raw.getchannel("A"))
        im.thumbnail((cell_w - 10, 150))
        sheet.paste(im, (x + (cell_w - im.width) // 2, y + 4))
        for j, line in enumerate(textwrap.wrap(names.get(r["gtin"], r["gtin"]), 34)[:3]):
            draw.text((x + 6, y + 158 + j * 16), line, fill="black", font=font)
    out = a.out or Path(f"/private/tmp/grocery-photo-sheet-{a.retailer}-{a.part}.png")
    sheet.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
