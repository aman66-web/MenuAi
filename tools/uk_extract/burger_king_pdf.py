"""Read Burger King UK's official "Nutritional Information" PDF into rows of printed numbers.

Used by tools/uk_extract/burger_king.py.

The PDF (linked from https://www.burgerking.co.uk/nutritional-info, hosted on Google Drive) is an IMAGE-ONLY table:
each of its 7 pages is one 1080x1920 JPEG with no text layer, so `pdftotext` finds nothing. Numbers are therefore read
with OCR, which is why this module is more careful than kfc_pdf.py:

  * the table grid (row and column lines) is detected from the page image, so every number is read from its own cell;
  * every cell is read several times (RapidOCR, different render scales) and the readings are voted on;
  * the table's own arithmetic is used as an alarm, never as a source: kJ vs kcal, salt vs sodium, per-serving vs
    per-100g, saturates vs fat, sugars vs carbs, energy from macros. Cells that fail a check, or where the readings
    don't agree, are listed for a human to compare with the page image (see burger_king.py, OVERRIDES);
  * nothing is ever computed or filled in from another number.

Requirements (tools only, not the app):  poppler (`pdfimages`),  `pip install rapidocr-onnxruntime pillow numpy`
(opencv comes with rapidocr).  Numbers are returned as printed strings ("<0.5", "2.0", "1211.8").
"""
from __future__ import annotations

import collections
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

# Columns of the table, left to right (after the product name).
FIELDS = ("serving", "kcal", "kj", "fat", "sat", "sodium", "salt", "carbs", "sugars", "fibre", "protein")
# Render variants (scale, blur, horizontal stretch) used to read each cell. The first PLAIN are plain renders; the rest are
# stretched sideways, which keeps a decimal point from fusing with the digit before it (plain renders often lose it).
# Per-serving cells get all variants, per-100g cells (only used for cross-checks) get FEW_VARIANTS.
VARIANTS = ((3, 0.0, 1.0), (4, 0.0, 1.0), (5, 0.0, 1.0), (6, 0.0, 1.0), (6, 0.7, 1.0), (8, 0.7, 1.0),
            (6, 0.0, 1.6), (4, 0.0, 2.0), (6, 0.0, 2.0))
PLAIN = 6
FEW_VARIANTS = (VARIANTS[1], VARIANTS[3], VARIANTS[6], VARIANTS[7])
FEW_PLAIN = 2
PAD = 3
NUMBER = re.compile(r"^(<)?\d+(\.\d+)?$")


# ------------------------------------------------------------------ page images and grid

def extract_pages(pdf: Path) -> list[np.ndarray]:
    """One grayscale array per page (the PDF's embedded JPEGs, untouched)."""
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-j", str(pdf), f"{tmp}/pg"], check=True)
        files = sorted(Path(tmp).glob("pg-*.jpg"))
        pages = [np.asarray(Image.open(f).convert("L")).astype(np.uint8) for f in files]
    npages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout).group(1))
    if len(pages) != npages or any(p.shape != (1920, 1080) for p in pages):
        raise SystemExit(f"Expected {npages} page images of 1080x1920 but found {[p.shape for p in pages]}: the PDF layout changed, "
                         "re-check burger_king_pdf.py before trusting any numbers.")
    return pages


def _groups(idx: list[int]) -> list[list[int]]:
    out: list[list[int]] = []
    for i in idx:
        if out and i - out[-1][-1] <= 1:
            out[-1].append(i)
        else:
            out.append([i])
    return out


def column_edges(page: np.ndarray) -> list[float]:
    """x positions of the 12 numeric-column edges (11 columns)."""
    dark = (page[310:1300, :] < 225).sum(axis=0)
    xs = [round(sum(g) / len(g), 1) for g in _groups([x for x in range(page.shape[1]) if dark[x] > 700])]
    if len(xs) != 13:  # name-column edge + 12 numeric edges
        raise SystemExit(f"Found {len(xs)} vertical table lines, expected 13: the table layout changed.")
    return xs[1:]


@dataclass
class Grid:
    first: float      # y of the top edge of the first body row
    pitch: float      # row height
    nrows: int        # body rows on this page (two per product)
    cols: list[float]


def grid(page: np.ndarray, cols: list[float]) -> Grid:
    x0, x1 = int(cols[0]) + 6, int(cols[-1]) - 3
    dark = (page[:, x0:x1] < 225).sum(axis=1)
    lines = np.array([sum(g) / len(g) for g in _groups([y for y in range(296, page.shape[0]) if dark[y] > 0.87 * (x1 - x0)])][1:])
    if len(lines) < 10:
        raise SystemExit("Could not find the table's row lines.")
    d = np.diff(lines)
    pitch0 = float(np.median(d))
    steps = np.maximum(1, np.round(d / pitch0)).astype(int)  # a missed line shows up as a double step
    ks = np.concatenate([[0], np.cumsum(steps)])
    pitch, off = np.polyfit(ks, lines, 1)
    g = Grid(first=off - pitch, pitch=float(pitch), nrows=0, cols=cols)
    n = 0
    while g.first + (n + 2) * g.pitch < 1850:  # the lower row of a product holds the words "per 100g"
        if (cell(page, g, n + 1, 0) < 140).sum() < 60:
            break
        n += 2
    g.nrows = n
    return g


def cell(page: np.ndarray, g: Grid, r: int, k: int) -> np.ndarray:
    y0 = int(round(g.first + r * g.pitch)) + 3
    y1 = int(round(g.first + (r + 1) * g.pitch)) - 3
    x0 = int(round(g.cols[k])) + 4
    x1 = int(round(g.cols[k + 1])) - 4
    return page[y0:y1, x0:x1]


# ------------------------------------------------------------------ reading one cell

_rec = None


def _recogniser():
    global _rec
    if _rec is None:
        from rapidocr_onnxruntime import RapidOCR
        _rec = RapidOCR()
    return _rec


def _render(c: np.ndarray, scale: int, blur: float, stretch: float) -> np.ndarray | None:
    from PIL import ImageFilter
    ink = (255 - c.astype(np.float32)).clip(0, 255)
    rows, cols = np.where(ink.max(axis=1) > 45)[0], np.where(ink.max(axis=0) > 45)[0]
    if len(rows) == 0:
        return None
    ink = ink[max(rows.min() - 2, 0):rows.max() + 3, max(cols.min() - 2, 0):cols.max() + 3]
    im = Image.fromarray((255 - ink).astype(np.uint8)).resize((int(ink.shape[1] * scale * stretch), int(ink.shape[0] * scale)), Image.BICUBIC)
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    arr = np.asarray(im)
    out = np.full((arr.shape[0] + 2 * PAD, arr.shape[1] + 2 * PAD), 255, np.uint8)
    out[PAD:-PAD, PAD:-PAD] = arr
    return out


def clean(s: str) -> str:
    s = s.replace(" ", "").replace("，", ".").replace("。", ".").replace("：", ".").replace(":", ".")
    s = s.replace("o", "0").replace("O", "0")  # the recogniser sometimes reads a stretched zero as a letter
    s = re.sub(r"[A-Za-z]+$", "", s)  # a few cells print a unit ("30g", "<0.5 g"), which stretched renders read as a letter
    if s.startswith("<") and "." not in s:
        s = re.sub(r"^<0(\d)", lambda m: "<0." + m.group(1), s)  # "<05" can only be "<0.5"
    return s


def read_cell(c: np.ndarray, variants=VARIANTS) -> list[str]:
    outs = []
    for scale, blur, stretch in variants:
        img = _render(c, scale, blur, stretch)
        if img is None:
            outs.append("")
            continue
        res, _ = _recogniser()(np.stack([img] * 3, axis=2), use_det=False, use_cls=False, use_rec=True)
        outs.append(clean(res[0][0]) if res else "")
    return outs


def vote(readings: list[str], plain: int) -> tuple[str | None, int]:
    """Choose the printed value from several readings of one cell.

    Step 1: the digits (ignoring the decimal point) must be chosen by majority.
    Step 2: among readings with those digits, the decimal point placement is taken from the stretched renders when they
    agree with each other (plain renders lose decimal points far more often than they invent them); otherwise from all
    readings. Returns (value, number of readings with exactly that value, digits-agreement count)."""
    good = [r for r in readings if NUMBER.match(r)]
    if not good:
        return None, 0
    key = lambda r: r.replace(".", "")  # noqa: E731
    digits, nd = collections.Counter(key(r) for r in good).most_common(1)[0]
    same = [r for r in good if key(r) == digits]
    stretched = [r for r in readings[plain:] if r in same]
    pool = stretched if len(stretched) >= 2 and collections.Counter(stretched).most_common(1)[0][1] >= 2 else same
    value = collections.Counter(pool).most_common(1)[0][0]
    return value, nd


# ------------------------------------------------------------------ whole table

_PAGES: list[np.ndarray] = []
_GRIDS: list[Grid] = []


def _work(job):
    p, r, k = job
    variants = VARIANTS if r % 2 == 0 else FEW_VARIANTS
    return job, read_cell(cell(_PAGES[p], _GRIDS[p], r, k), variants)


@dataclass
class Product:
    page: int
    index: int                         # product number on its page (0-based)
    serving: dict[str, str | None] = field(default_factory=dict)   # per-serving row, as printed
    per100: dict[str, str | None] = field(default_factory=dict)    # "per 100g" row, as printed
    readings: dict[str, list[str]] = field(default_factory=dict)   # "s.kcal" / "h.kcal" -> all readings
    agree: dict[str, int] = field(default_factory=dict)            # how many readings have the same DIGITS as the chosen value


def read_products(pdf: Path, workers: int = 4) -> list[Product]:
    """All products in reading order (page 1 top to page 7 bottom)."""
    global _PAGES, _GRIDS
    _PAGES = extract_pages(pdf)
    cols = column_edges(_PAGES[0])
    for p in _PAGES[1:]:
        if max(abs(a - b) for a, b in zip(column_edges(p), cols)) > 2:
            raise SystemExit("Column lines differ between pages: the layout changed.")
    _GRIDS = [grid(p, cols) for p in _PAGES]
    jobs = [(p, r, k) for p, g in enumerate(_GRIDS) for r in range(g.nrows) for k in range(1, 11) if True] + \
           [(p, r, 0) for p, g in enumerate(_GRIDS) for r in range(0, g.nrows, 2)]
    with Pool(workers) as pool:
        results = dict(pool.map(_work, jobs, chunksize=40))
    products: list[Product] = []
    for p, g in enumerate(_GRIDS):
        for r in range(0, g.nrows, 2):
            pr = Product(page=p, index=r // 2)
            for k, f in enumerate(FIELDS):
                outs = results[(p, r, k)]
                pr.readings[f"s.{f}"] = outs
                pr.serving[f], pr.agree[f"s.{f}"] = vote(outs, PLAIN)
                if k > 0:
                    outs2 = results[(p, r + 1, k)]
                    pr.readings[f"h.{f}"] = outs2
                    pr.per100[f], pr.agree[f"h.{f}"] = vote(outs2, FEW_PLAIN)
            products.append(pr)
    return products


def revote(pr: Product) -> Product:
    """Recompute every chosen value from the stored readings (so a change to clean()/vote() applies to a cache)."""
    for key, outs in list(pr.readings.items()):
        outs = [clean(o) for o in outs]
        pr.readings[key] = outs
        row, f = key.split(".")
        value, n = vote(outs, PLAIN if row == "s" else FEW_PLAIN)
        (pr.serving if row == "s" else pr.per100)[f] = value
        pr.agree[key] = n
    return pr


def save_readings(products: list[Product], pdf_sha256: str, path: Path) -> None:
    import dataclasses
    import json
    path.write_text(json.dumps({"pdf_sha256": pdf_sha256, "products": [dataclasses.asdict(p) for p in products]}), encoding="utf-8")


def load_readings(path: Path, pdf_sha256: str) -> list[Product] | None:
    """The cached readings of this exact PDF, or None if there is no cache / it belongs to another file."""
    import json
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("pdf_sha256") != pdf_sha256:
        return None
    return [revote(Product(**p)) for p in data["products"]]


# ------------------------------------------------------------------ alarms (never used to change a number)

def _num(x: str | None) -> float | None:
    if x is None:
        return None
    return 0.0 if x.startswith("<") else float(x)


def check(pr: Product, max_outliers: int = 1) -> list[str]:
    """Reasons a human should compare this product with the page image. Empty list = nothing suspicious."""
    msgs: list[str] = []
    for key, n in pr.agree.items():
        if n < 99 and n < len(pr.readings[key]) - max_outliers:  # 99 = a human override
            msgs.append(f"readings disagree on the digits of {key}: {pr.readings[key]}")
    s = {f: _num(v) for f, v in pr.serving.items()}
    h = {f: _num(v) for f, v in pr.per100.items()}
    if any(v is None for v in s.values()) or any(v is None for v in h.values()):
        msgs.append("unreadable cell(s): " + ", ".join(f for f, v in {**{f"s.{k}": v for k, v in s.items()}, **{f"h.{k}": v for k, v in h.items()}}.items() if v is None))
        return msgs
    kcal, kj = s["kcal"], s["kj"]
    if kj and abs(kj - kcal * 4.184) > max(0.06 * kj, 6):
        msgs.append(f"kJ and kcal disagree: kcal {pr.serving['kcal']}, kJ {pr.serving['kj']}")
    if abs(s["sodium"] * 2.5 / 1000 - s["salt"]) > max(0.2 * s["salt"], 0.06):
        msgs.append(f"salt and sodium disagree: sodium {pr.serving['sodium']} mg, salt {pr.serving['salt']} g")
    energy = 4 * s["protein"] + 4 * s["carbs"] + 9 * s["fat"]
    if kcal >= 50 and abs(energy - kcal) > 0.15 * kcal:
        msgs.append(f"kcal {pr.serving['kcal']} vs 4P+4C+9F = {energy:.0f}")
    if s["sat"] > s["fat"] + 0.15:
        msgs.append(f"saturates {pr.serving['sat']} > fat {pr.serving['fat']}")
    if s["sugars"] > s["carbs"] + 0.15:
        msgs.append(f"sugars {pr.serving['sugars']} > carbs {pr.serving['carbs']}")
    g = s["serving"]
    for f in ("kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt", "sodium"):
        exp = h[f] * g / 100
        lo = 1.0 if f in ("kcal", "sodium") else 0.6  # a small serving prints its numbers rounded
        sv, hv = pr.serving[f], pr.per100[f]
        if sv.startswith("<") and exp <= s[f] + float(sv[1:]) + 0.06:
            continue  # "<0.5 g" per serving is consistent with anything under 0.5
        if hv.startswith("<") and s[f] <= float(hv[1:]) * g / 100 + lo:
            continue  # "<0.5 g" per 100g allows up to 0.5 x serving/100
        if abs(exp - s[f]) > max(0.15 * max(exp, s[f]), lo):
            msgs.append(f"{f}: per serving {sv} but per 100g {hv} x {pr.serving['serving']} g = {exp:.2f}")
    return msgs
