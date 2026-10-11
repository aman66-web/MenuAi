"""Read Coco di Mama's official "Nutrition Guide - Stores" PDF into rows of printed numbers.

Used by tools/uk_extract/coco_di_mama.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed
(strings such as "0.13", "6.8", "1315"); nothing is converted, rounded or estimated here.

The guide is one wide table per page. The column headings are rotated text; the order, per 100g then per serving, is
    energy kJ, energy kcal, fat, saturates, carbohydrate, sugar, protein, salt   (8 columns, twice = 16 numbers).
Product names are centred in the first column and wrap over two lines, so the name can sit above, on, or below the
line of numbers. This reader uses word positions (`pdftotext -bbox`), takes each line of 16 numbers as one row and
gives it the name words whose vertical centre is nearest to that row, which is robust to the wrapping.
"""
import re
import subprocess
from pathlib import Path

NUM = re.compile(r"^\d+(?:\.\d+)?$")
COLUMNS = ("kj100", "kcal100", "fat100", "sat100", "carbs100", "sugar100", "protein100", "salt100",
           "kj", "kcal", "fat", "sat", "carbs", "sugar", "protein", "salt")
HEADER_WORDS = {"PER", "100G", "NUTRITION", "SERVING", "ENERGY", "KCAL", "kJ", "SATURATES", "CARBOHYDRATES", "PROTEIN",
                "SUGAR", "SALT", "FAT", "PRODUCT", "NAME", "ALLERGEN", "GUIDE"}
NAME_X_MAX = 228.0  # product names live left of the first number column (kJ per 100g starts at x=236) on every page


def _words(pdf: Path) -> list[list[dict]]:
    out = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    pages: list[list[dict]] = []
    for line in out.splitlines():
        s = line.strip()
        if s.startswith("<page "):
            pages.append([])
        elif s.startswith("<word "):
            m = re.match(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)</word>', s)
            if not m:
                raise ValueError(f"unreadable word line: {s!r}")
            x0, y0, x1, y1, text = m.groups()
            text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'").replace("&apos;", "'").replace("&quot;", '"')
            pages[-1].append({"x0": float(x0), "y0": float(y0), "x1": float(x1), "y1": float(y1), "t": text})
    return pages


def read_rows(pdf: Path) -> list[dict]:
    """Rows in reading order: {page, section, name, <16 columns>}. `section` is the page heading ("Breakfast", ...)."""
    rows: list[dict] = []
    for pno, words in enumerate(_words(pdf), start=1):
        # page heading: large type at the top left, under "NUTRITION GUIDE"
        top = sorted((w for w in words if w["x0"] < 300 and w["y0"] < 125), key=lambda w: (round(w["y0"]), w["x0"]))
        texts = [w["t"] for w in top]
        if "NUTRITION" not in texts:
            continue
        section = " ".join(w["t"] for w in top if w["t"] not in ("NUTRITION", "GUIDE") and 50 < w["y0"] < 120)
        numbers = [w for w in words if NUM.match(w["t"]) and w["x0"] >= NAME_X_MAX]
        # group numbers into lines by vertical centre
        lines: list[list[dict]] = []
        for w in sorted(numbers, key=lambda w: ((w["y0"] + w["y1"]) / 2, w["x0"])):
            yc = (w["y0"] + w["y1"]) / 2
            if lines and abs(((lines[-1][0]["y0"] + lines[-1][0]["y1"]) / 2) - yc) < 3:
                lines[-1].append(w)
            else:
                lines.append([w])
        data_lines = []
        for ln in lines:
            ln.sort(key=lambda w: w["x0"])
            if len(ln) != 16:
                raise ValueError(f"page {pno}: a line of numbers has {len(ln)} values, expected 16: {[w['t'] for w in ln]}")
            data_lines.append(ln)
        name_words = [w for w in words if w["x1"] < NAME_X_MAX + 20 and w["x0"] < NAME_X_MAX]
        centres = [sum((w["y0"] + w["y1"]) / 2 for w in ln) / 16 for ln in data_lines]
        assigned: list[list[dict]] = [[] for _ in data_lines]
        for w in name_words:
            yc = (w["y0"] + w["y1"]) / 2
            if not centres or yc < centres[0] - 40:
                continue
            k = min(range(len(centres)), key=lambda i: abs(centres[i] - yc))
            if abs(centres[k] - yc) > 18:
                continue
            assigned[k].append(w)
        for ln, nm in zip(data_lines, assigned):
            nm.sort(key=lambda w: (round((w["y0"] + w["y1"]) / 2 / 4), w["x0"]))
            name = " ".join(w["t"] for w in nm)
            row = {"page": pno, "section": section, "name": name}
            row.update({c: w["t"] for c, w in zip(COLUMNS, ln)})
            rows.append(row)
    return rows
