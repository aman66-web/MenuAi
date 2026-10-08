#!/usr/bin/env python3
"""Second, independent reading of Jollibee UK's calorie chart: OCR every cell and compare with TABLE in jollibee.py.

    python3 tools/uk_extract/jollibee_ocr_check.py path/to/Jollibee-Calorie-Chart-UK-Mar-2023.pdf [--work DIR]

The chart is a picture (no text layer), so jollibee.py holds a table that was read by eye. This script renders the page at 200 dpi
(`pdftoppm`), finds the table's ruled lines, crops each row's two cells, enlarges them 3x and reads them with `tesseract`
(brew install poppler tesseract; needs Pillow). It prints every row where the OCR does not agree with TABLE (number or name) so a human
can look at that row again, and exits 1 if any number disagrees. It never writes data: OCR is only a check, the eye is the source.
Takes a few minutes (about 170 small OCR runs).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import jollibee  # noqa: E402

LEFT, RIGHT = (727, 1277), (1285, 1613)  # x ranges of the two columns on the 200 dpi render (divider lines at x 722 / 1281 / 1617)


def table_lines(im) -> list:
    """y positions of the long horizontal rules across the table."""
    px = im.load()
    w, h = im.size
    x0, x1 = 735, 1615
    need = 0.9 * len(range(x0, x1, 4))
    ys = [y for y in range(h) if sum(1 for x in range(x0, x1, 4) if px[x, y] < 110) > need]
    merged: list = []
    for y in ys:
        if merged and y - merged[-1][-1] <= 3:
            merged[-1].append(y)
        else:
            merged.append([y])
    return [int(sum(m) / len(m)) for m in merged]


def ocr(img, work: Path) -> str:
    from PIL import ImageOps
    c = img.resize((img.width * 3, img.height * 3))
    c = ImageOps.expand(c, border=30, fill=255)
    f = work / "cell.png"
    c.save(f)
    return subprocess.run(["tesseract", str(f), "-", "--psm", "6"], capture_output=True, text=True, check=True).stdout.strip().replace("\n", " ")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--work", type=Path, default=None)
    args = ap.parse_args()
    from PIL import Image
    work = args.work or Path(tempfile.mkdtemp(prefix="jollibee-ocr-"))
    work.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-r", "200", "-png", "-singlefile", str(args.pdf), str(work / "page")], check=True)
    im = Image.open(work / "page.png").convert("L")
    lines = table_lines(im)
    rules = lines[1:1 + jollibee.EXPECTED_ROWS + 1]  # first rule below the header .. bottom rule of the table
    if len(rules) != jollibee.EXPECTED_ROWS + 1:
        print(f"found {len(lines)} rules, expected {jollibee.EXPECTED_ROWS + 3}: the page layout is not the one TABLE was read from", file=sys.stderr)
        return 2
    bad_numbers = 0
    for i, (row, name, cat, kcal, star, serving, excl) in enumerate(jollibee.TABLE):
        top, bottom = rules[i] + 4, rules[i + 1] - 3
        left = ocr(im.crop((LEFT[0], top, LEFT[1], bottom)), work)
        right = ocr(im.crop((RIGHT[0], top, RIGHT[1], bottom)), work)
        digits = re.findall(r"\d+", right)
        # the right cell prints "<value> kcal" or "<value> kcal* - Serves 4": the first number is the value, a second one may be 4
        got = digits[0] if digits else ""
        name_ok = re.sub(r"[^a-z0-9]", "", name.lower()) == re.sub(r"[^a-z0-9]", "", left.lower())
        flag = []
        if got != kcal:
            flag.append(f"NUMBER: table {kcal}, OCR {right!r}")
            bad_numbers += 1
        if not name_ok:
            flag.append(f"name: table {name!r}, OCR {left!r}")
        if serving and "4" not in digits[1:]:
            flag.append(f"serving: table {serving!r}, OCR {right!r}")
        print(f"row {row:2d} {'ok ' if not flag else 'CHECK'} {name} {kcal}" + ("  <- " + "; ".join(flag) if flag else ""))
    print(f"{bad_numbers} number(s) differ between the eye-read table and the OCR")
    return 1 if bad_numbers else 0


if __name__ == "__main__":
    sys.exit(main())
