"""Read Wahaca's official table menu PDF ("Menu with Calories") into dishes with their printed calories.

Used by tools/uk_extract/wahaca.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such as
"542"); nothing is converted, rounded or estimated here.

The file is ONE A3 page, an InDesign layout with a real text layer. Each dish is a name line, then its description, then the
calories printed as "NNNkcal" at the end of the description:

    Pork Pibil 7.95                                  <- name, dietary marks (v, vg, vgo, n), price
    Free range, slow-cooked in citrus and achiote,
    a Mexican classic 279kcal                        <- calories

Some dishes print the calories on the name line itself ("Jalapeno oil vg 6.75 574kcal", "Trio of Fresh Salsas vg n 2.50
430kcal"). Reading is by position, never by counting:

  1. every line of the text layer is found with its box (pdftotext -bbox-layout);
  2. a "dish line" is a line made of a name, optional marks and a price (7.95, 11.95, +25p);
  3. every "NNNkcal" word belongs to the dish line on its own line, else to the dish line in its own text block, else to the
     nearest dish line above it that starts at the same left edge (columns are left-aligned) at most MAX_GAP points higher;
  4. a dish line belongs to the menu section whose box (SECTION_BOXES, measured from this PDF) holds it; the section's heading
     text must still be printed where the box expects it.

Anything that does not fit (a calorie value nobody owns, a dish line outside every box that carries calories, a heading that
moved) raises, so a new menu layout stops the run instead of attaching a number to the wrong dish.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
BLOCK = re.compile(r"<block\b[^>]*>(.*?)</block>", re.S)
WORD = re.compile(r"<word[^>]*>(.*?)</word>")
DISH = re.compile(
    r"^(?P<new>NEW )?(?P<name>[A-Z‘'][^\d]*?)(?P<marks>(?: (?:vgo|vg|v|n))*) "
    r"(?P<price>\+?\d+(?:\.\d\d|p))(?: (?P<kcal>\d+)kcal)?$")
KCAL_WORD = re.compile(r"^(\d+)kcal$")
MAX_GAP = 45.0        # points between a dish's name line and a calorie line below it
SAME_COLUMN = 2.0     # points: left edges closer than this are the same column

# (section, heading as printed, x0, y0, x1, y1): the area of the page (points) holding that section's dish lines. Measured from
# WAH-Summer-050326. The heading must be printed with its left edge inside [x0 - 40, x1] and its top between y0 - 60 and y0.
SECTION_BOXES = [
    ("ENTRADAS", "ENTRADAS", 325, 55, 880, 160),
    ("TACOS", "TACOS", 325, 215, 880, 345),
    ("GRILLED SEABASS TACO BOARD", "GRILLED SEABASS TACO BOARD", 410, 365, 600, 430),
    ("SALSAS", "SALSAS", 700, 360, 880, 440),
    ("QUESADILLAS", "QUESADILLAS", 325, 495, 505, 620),
    ("PLATITOS", "PLATITOS", 505, 495, 880, 640),
    ("SUNSHINE BOWLS", "SUNSHINE BOWLS", 905, 55, 1170, 165),
    ("BURRITOS", "BURRITOS", 905, 215, 1170, 330),
    ("SIDES", "SIDES", 905, 350, 1170, 510),
    ("DESSERTS", "DESSERTS", 905, 535, 1170, 640),
]


def _lines(pdf: Path) -> list[dict]:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = []
    for b, block in enumerate(BLOCK.finditer(out)):
        for m in LINE.finditer(block.group(1)):
            x0, y0, x1, y1, body = m.groups()
            words = [html.unescape(w) for w in WORD.findall(body)]
            text = " ".join(words).replace("​", "")
            text = " ".join(text.split())
            lines.append(dict(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1), text=text, words=words, block=b))
    return lines


def _section(line: dict) -> str | None:
    hits = [s for s, _, x0, y0, x1, y1 in SECTION_BOXES if x0 <= line["x0"] <= x1 and y0 <= line["y0"] <= y1]
    if len(hits) > 1:
        raise ValueError(f"Dish line {line['text']!r} sits in two section boxes: {hits}")
    return hits[0] if hits else None


def _check_headings(lines: list[dict]) -> None:
    for section, heading, x0, y0, x1, y1 in SECTION_BOXES:
        found = [ln for ln in lines if ln["text"] == heading and x0 - 40 <= ln["x0"] <= x1 and y0 - 60 <= ln["y0"] <= y0]
        if len(found) != 1:
            raise ValueError(f"Heading {heading!r} is not printed where the {section} box expects it: the layout changed, "
                             "re-measure SECTION_BOXES in wahaca_pdf.py")


def read_dishes(pdf: Path) -> tuple[list[dict], list[dict]]:
    """-> (dishes with calories, dish lines that print none). Each dish: name (as printed), marks, price, new, section,
    kcal (list of (value as printed, text of the line that carries it)), text (the dish's own lines, for the meat check)."""
    lines = _lines(pdf)
    _check_headings(lines)
    dish_lines = []
    for ln in lines:
        m = DISH.match(ln["text"])
        if m:
            dish_lines.append(dict(ln, name=m["name"].strip(), marks=m["marks"].split(), price=m["price"], new=bool(m["new"]),
                                   own_kcal=m["kcal"], section=_section(ln), kcal=[], desc=[ln["text"]]))
    kcal_lines = [(ln, w) for ln in lines for w in ln["words"] if KCAL_WORD.match(w)]
    for ln, word in kcal_lines:
        value = KCAL_WORD.match(word).group(1)
        owner = next((d for d in dish_lines if d is not None and d["x0"] == ln["x0"] and d["y0"] == ln["y0"] and d["own_kcal"] == value), None)
        if owner is None:
            same_block = [d for d in dish_lines if d["block"] == ln["block"] and d["y0"] <= ln["y0"] and d["own_kcal"] is None]
            above = [d for d in dish_lines if d["own_kcal"] is None and d["y0"] < ln["y0"] and ln["y0"] - d["y0"] <= MAX_GAP
                     and abs(d["x0"] - ln["x0"]) <= SAME_COLUMN]
            pool = same_block or above
            if not pool:
                raise ValueError(f"Calories {word!r} at ({ln['x0']:.0f}, {ln['y0']:.0f}) belong to no dish line: {ln['text']!r}")
            owner = max(pool, key=lambda d: d["y0"])
            owner["desc"].extend(t for t in (ln["text"],) if t not in owner["desc"])
        owner["kcal"].append((value, ln["text"]))
    # description lines between the name and the last calorie line, same column, for the meat tags
    for d in dish_lines:
        if d["kcal"]:
            last = max(ln["y0"] for ln in lines if any(ln["text"] == t for _, t in d["kcal"]) and abs(ln["x0"] - d["x0"]) < 200)
            d["desc"] = [ln["text"] for ln in lines if abs(ln["x0"] - d["x0"]) <= SAME_COLUMN and d["y0"] <= ln["y0"] <= last] or d["desc"]
    with_kcal = [d for d in dish_lines if d["own_kcal"] or d["kcal"]]
    for d in with_kcal:
        if d["own_kcal"] and not d["kcal"]:
            d["kcal"].append((d["own_kcal"], d["text"]))
        if d["section"] is None:
            raise ValueError(f"Dish {d['name']!r} prints calories but sits outside every section box (x {d['x0']:.0f}, y {d['y0']:.0f})")
    seen = [v for d in with_kcal for v, _ in d["kcal"]]
    if len(seen) != len(kcal_lines):
        raise ValueError(f"{len(kcal_lines)} calorie values on the page but {len(seen)} were attached to dishes")
    return with_kcal, [d for d in dish_lines if not (d["own_kcal"] or d["kcal"])]
