"""Read Starbucks UK's official "Nutrition & Allergen Guide" PDFs (beverages and food) into blocks of printed numbers.

Used by tools/uk_extract/starbucks.py. Requires `pdftotext` and `pdftocairo` (poppler). Values are returned exactly as
printed (strings such as "<0.5", "0.20", "2800") so nothing is converted or estimated here.

How the tables are read
-----------------------
* Words and their positions come from `pdftotext -bbox`.
* The horizontal rules that separate table rows come from `pdftocairo -svg` (a rule is a stroke that starts at the
  left edge of the Product column, x = 20 pt). Everything between two rules is one block, so a product name, its
  ingredient text and its size rows are tied together by the page geometry and not by guessing from the text order.
* Beverages: one block per product-and-milk, with one row per printed size (Short/Tall/Grande/Venti/Mini/...), each row
  holding 10 numbers: kJ, kcal, fat, saturates, carbs, sugars, fibre, protein, salt, caffeine.
* Food: one block per product with 9 numbers: kJ, kcal, fat, saturates, carbs, sugars, fibre, protein, salt.
Any block that does not look exactly like that stops the run with a message naming the page.
"""
from __future__ import annotations
import html
import re
import subprocess
import tempfile
from pathlib import Path

PRODUCT_COL_X0 = 20.0            # left edge of the Product column; table rules start here
NAME_MAX_X = 93.0                # product names sit left of the ingredients column
SIZE_X = (510.0, 525.0)          # beverage size labels start at ~519 pt
BEV_NUM_X = (540.0, 745.0)       # beverage numbers sit between the size and allergen columns
TABLE_Y = (100.0, 522.0)         # rows live between the header and the footer bar
TABLE_BOTTOM = 523.0             # just above the green footer bar (starts at 525.2)
TABLE_TOP = 110.3                # bottom edge of the dark header; the first block starts here even if no rule is drawn

BEV_SIZES = {"Short", "Tall", "Grande", "Venti", "Mini", "Single", "Double", "Doppio", "One"}
BEV_FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fiber", "protein", "salt", "caffeine")
# Centre x of each food number column (measured over all food pages) and the field it holds.
FOOD_COLS = [(535, "kj"), (557, "kcal"), (580, "fat"), (605, "sat"), (625, "carbs"), (650, "sugars"),
             (672, "fiber"), (695, "protein"), (720, "salt")]
FOOD_FLAG_X = {"veg": 100.0, "vegan": 125.0}


class GuideError(Exception):
    pass


def _yc(w):
    return (w[1] + w[3]) / 2


def bbox_pages(pdf: Path) -> list[list[tuple]]:
    """Words per page as (x0, y0, x1, y1, text)."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "bbox.html"
        subprocess.run(["pdftotext", "-bbox", str(pdf), str(out)], check=True)
        text = out.read_text(encoding="utf-8")
    pages = []
    for pm in re.finditer(r'<page width="[\d.]+" height="[\d.]+">(.*?)</page>', text, re.S):
        words = []
        for w in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pm.group(1)):
            words.append((float(w[1]), float(w[2]), float(w[3]), float(w[4]), html.unescape(w[5])))
        pages.append(words)
    return pages


def page_rules(pdf: Path, page: int) -> list[float]:
    """y positions (pt from the top) of the table rules on one page: strokes starting at the Product column's left edge."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "p.svg"
        subprocess.run(["pdftocairo", "-svg", "-f", str(page), "-l", str(page), str(pdf), str(out)], check=True)
        svg = out.read_text(encoding="utf-8")
    ys = []
    pat = re.compile(r'<path fill="none" stroke-width="[\d.]+"[^>]*? d="M ([-\d.e]+) ([-\d.e]+) L ([-\d.e]+) ([-\d.e]+) " '
                     r'transform="matrix\(1, 0, 0, -1, ([-\d.]+), ([-\d.]+)\)"')
    for m in pat.finditer(svg):
        x0, y0, x1, y1, tx, ty = (float(g) for g in m.groups())
        if abs(y0 - y1) < 0.01 and abs(tx + x0 - PRODUCT_COL_X0) < 2.0 and abs(x1 - x0) > 20:
            ys.append(round(ty - y0, 1))
    ys = sorted(set(ys))
    merged: list[float] = []
    for y in ys:
        if not merged or y - merged[-1] > 0.6:
            merged.append(y)
    merged = [y for y in merged if TABLE_Y[0] < y < TABLE_Y[1] + 5]
    if merged and merged[0] - TABLE_TOP > 1.0:
        merged.insert(0, TABLE_TOP)
    if merged and merged[-1] < TABLE_BOTTOM - 1.0:
        merged.append(TABLE_BOTTOM)   # the last block of a full page may be closed by the footer bar instead of a rule
    return merged


def _lines(words, tol=2.0):
    """Group words into text lines by y; returns list of lists, each sorted left to right."""
    out: list[list[tuple]] = []
    for w in sorted(words, key=_yc):
        if out and abs(_yc(w) - _yc(out[-1][0])) <= tol:
            out[-1].append(w)
        else:
            out.append([w])
    return [sorted(l, key=lambda w: w[0]) for l in out]


def _text(words) -> str:
    return " ".join(" ".join(w[4] for w in l) for l in _lines(words))


def _section(words) -> tuple[str, str] | None:
    """('Beverages'|'Food', section name) from the page header, or None for cover/divider pages."""
    top = sorted([w for w in words if w[1] < 35], key=lambda w: w[0])
    head = " ".join(w[4] for w in top)
    m = re.search(r"Nutrition & Allergen Guide \| (Beverages|Food) \| (.*?)\s+Version:", head)
    return (m.group(1), m.group(2)) if m else None


def guide_version(pages) -> str:
    for words in pages[:3]:
        t = " ".join(w[4] for w in words)
        m = re.search(r"Version:\s*(\d\d/\d\d/\d\d)", t)
        if m:
            return m.group(1)
    raise GuideError("no 'Version: dd/mm/yy' on the first pages")


def _intervals(rules):
    return [(a, b) for a, b in zip(rules, rules[1:]) if b - a > 5]


def read_beverages(pdf: Path, include_sections: set[str]) -> tuple[list[dict], list[str]]:
    """Blocks of the beverage guide for the named sections. Returns (blocks, all section names seen, in order)."""
    pages = bbox_pages(pdf)
    blocks: list[dict] = []
    seen: list[str] = []
    for pno, words in enumerate(pages, 1):
        sec = _section(words)
        if sec is None:
            if any(w[4] in BEV_SIZES and SIZE_X[0] <= w[0] <= SIZE_X[1] and TABLE_Y[0] < w[1] < TABLE_Y[1] for w in words if pno > 4):
                raise GuideError(f"page {pno} has size rows but no section header")
            continue
        if sec[0] != "Beverages":
            raise GuideError(f"page {pno} is not a beverage page: {sec}")
        if sec[1] not in seen:
            seen.append(sec[1])
        if sec[1] not in include_sections:
            continue
        rules = page_rules(pdf, pno)
        ivs = _intervals(rules)
        size_words = [w for w in words if SIZE_X[0] <= w[0] <= SIZE_X[1] and TABLE_Y[0] < _yc(w) < TABLE_Y[1] and w[4] not in ("Size", "day.")]
        covered = 0
        for a, b in ivs:
            sw = [w for w in size_words if a < _yc(w) < b]
            nw = [w for w in words if w[2] <= NAME_MAX_X and a < _yc(w) < b]
            if not sw:
                continue
            if not nw:
                raise GuideError(f"page {pno}: block {a}-{b} has size rows but no product name")
            rows = []
            for s in sorted(sw, key=_yc):
                if s[4] not in BEV_SIZES:
                    raise GuideError(f"page {pno}: unexpected size label {s[4]!r}")
                nums = sorted([x for x in words if BEV_NUM_X[0] < x[0] < BEV_NUM_X[1] and abs(_yc(x) - _yc(s)) < 3], key=lambda x: x[0])
                if len(nums) != len(BEV_FIELDS):
                    raise GuideError(f"page {pno}: row {s[4]} at y={_yc(s):.0f} has {len(nums)} numbers, expected {len(BEV_FIELDS)}")
                rows.append({"size": s[4], **{f: n[4] for f, n in zip(BEV_FIELDS, nums)}})
            covered += len(sw)
            ingredients = _text([w for w in words if 93 < w[0] and w[2] <= 515 and a < _yc(w) < b])
            blocks.append({"page": pno, "section": sec[1], "name": _text(nw), "ingredients": ingredients, "rows": rows})
        if covered != len(size_words):
            raise GuideError(f"page {pno}: {len(size_words) - covered} size rows are not inside any ruled block")
    return blocks, seen


def read_food(pdf: Path) -> tuple[list[dict], list[str]]:
    """One dict per food product: page, section, band (category heading), per_portion (band says 'per portion'), name,
    veg/vegan flags and the printed numbers."""
    pages = bbox_pages(pdf)
    items: list[dict] = []
    seen: list[str] = []
    for pno, words in enumerate(pages, 1):
        sec = _section(words)
        if sec is None:
            continue
        if sec[0] != "Food":
            raise GuideError(f"page {pno} is not a food page: {sec}")
        seen.append(sec[1]) if sec[1] not in seen else None
        ivs = _intervals(page_rules(pdf, pno))
        flag_words = [w for w in words if w[4] in ("Y", "N") and 95 < w[0] < 135 and TABLE_Y[0] < _yc(w) < TABLE_Y[1]]
        covered = 0
        for a, b in ivs:
            inside = [w for w in words if a < _yc(w) < b]
            fl = [w for w in flag_words if a < _yc(w) < b]
            if not fl:
                # a band heading ("Bakery", "Chocolate & Snacks") has text on the left and maybe "per portion" in the middle
                band = _text([w for w in inside if w[0] < 300])
                if band:
                    items.append({"band": band, "page": pno, "section": sec[1], "per_portion": any(w[4] == "portion" for w in inside)})
                continue
            if len(fl) != 2:
                raise GuideError(f"page {pno}: block {a}-{b} has {len(fl)} Y/N flags, expected 2")
            flags = {}
            for w in fl:
                key = min(FOOD_FLAG_X, key=lambda k: abs(FOOD_FLAG_X[k] - (w[0] + w[2]) / 2))
                flags[key] = w[4]
            nw = [w for w in inside if w[2] <= NAME_MAX_X]
            if not nw:
                raise GuideError(f"page {pno}: block {a}-{b} has no product name")
            nums = {}
            for w in inside:
                if w[0] >= 515 and re.fullmatch(r"<?\d+(?:\.\d+)?g?", w[4]):
                    cx = (w[0] + w[2]) / 2
                    col = min(FOOD_COLS, key=lambda c: abs(c[0] - cx))
                    if abs(col[0] - cx) > 12:
                        raise GuideError(f"page {pno}: number {w[4]!r} at x={cx:.0f} is not in a known column")
                    if col[1] in nums:
                        raise GuideError(f"page {pno}: two numbers in column {col[1]} for {_text(nw)!r}")
                    nums[col[1]] = w[4][:-1] if w[4].endswith("g") else w[4]
            ingredients = _text([w for w in inside if 133 <= w[0] and w[2] <= 522])
            items.append({"page": pno, "section": sec[1], "name": _text(nw), "veg": flags["veg"], "vegan": flags["vegan"],
                          "ingredients": ingredients, "values": nums, "unit_suffix": [w[4] for w in inside if w[0] >= 515 and re.fullmatch(r"<?\d+(?:\.\d+)?g", w[4])]})
            covered += 1
        if covered != len([1 for w in flag_words if w[0] < 110]):
            raise GuideError(f"page {pno}: {len([1 for w in flag_words if w[0] < 110]) - covered} food rows are not inside any ruled block")
    return items, seen
