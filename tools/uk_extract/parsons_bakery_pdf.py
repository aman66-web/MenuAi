"""Read one Parsons Bakery product PDF (text layer) into the numbers and allergen words it prints (used by parsons_bakery.py).

Every product PDF is one A4 page made by the chain's NutriCalc report: the title and "Report date" at the top, a "Nutrition" table with a
"per 100g" column and one column for the item as sold ("per Each Sandwich", "per 283g", ...), an "Ingredient Declaration", an "Allergens"
list (left; one "Contains X" line per allergen, then "Suitable for Vegetarians" / "Vegans and Vegetarians" when it applies) beside a
"Front of Pack" traffic-light panel, then the energy-contribution chart and the EU reference-intake table. Requires poppler's
`pdftotext`. Numbers are returned exactly as printed (strings such as "9.9", "<0.5") and nothing is converted, rounded or estimated.
Only the per-item column is returned. Python 3.9 compatible.
"""
from __future__ import annotations
import html
import re
import subprocess
from pathlib import Path

NUM = r"<?\d+(?:\.\d+)?"
ENERGY = re.compile(r"^(" + NUM + r")kJ/(" + NUM + r")kcal$")
GRAMS = re.compile(r"^(" + NUM + r")g$")
# printed row label -> key (the "of which" labels are completed from the next line when the label wraps)
ROWS = {"Energy": "energy", "Fat": "fat", "of which Saturates": "sat", "Carbohydrate": "carbs", "of which Sugars": "sugar",
        "of which Polyols": "polyols", "Fibre": "fibre", "Protein": "protein", "Salt": "salt"}


class PdfError(RuntimeError):
    pass


def layout_text(pdf: Path) -> str:
    return subprocess.run(["pdftotext", "-layout", "-f", "1", "-l", "1", str(pdf), "-"], check=True, capture_output=True, text=True).stdout


def bbox_lines(pdf: Path) -> list:
    """Words of page 1 grouped into visual lines, top to bottom: [[(x0, y0, x1, y1, text), ...], ...] (each line left to right)."""
    out = subprocess.run(["pdftotext", "-bbox", "-f", "1", "-l", "1", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    words = [(float(a), float(b), float(c), float(d), html.unescape(w)) for a, b, c, d, w in
             re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', out)]
    lines: list = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if lines and abs(lines[-1][0][1] - w[1]) < 2.0:
            lines[-1].append(w)
        else:
            lines.append([w])
    return [sorted(l, key=lambda w: w[0]) for l in lines]


def has_text_layer(pdf: Path) -> bool:
    return len(layout_text(pdf).strip()) > 200


def allergen_lines(pdf: Path) -> list:
    """The lines of the left-hand "Allergens" list, e.g. ["Contains Gluten", "Contains Wheat", "Suitable for Vegetarians"]."""
    lines = bbox_lines(pdf)
    head = [i for i, l in enumerate(lines) if [w[4] for w in l][:1] == ["Allergens"] and any(w[4] == "Front" for w in l)]
    tail = [i for i, l in enumerate(lines) if [w[4] for w in l][:2] == ["Energy", "Contributions"]]
    if len(head) != 1 or len(tail) != 1 or tail[0] <= head[0]:
        raise PdfError("cannot find the Allergens heading / Energy Contributions heading")
    front_x = next(w[0] for w in lines[head[0]] if w[4] == "Front")
    out = []
    for l in lines[head[0] + 1:tail[0]]:
        left = [w for w in l if w[2] < front_x - 4]
        if left:
            out.append(" ".join(w[4] for w in left))
    return out


def parse_table(block: list) -> tuple:
    """The non-blank lines of the Nutrition block (header first) -> (basis, per100, item)."""
    hm = re.match(r"^\s*per 100g\s+per\s+(.+?)\s*$", block[0])
    if not hm:
        raise PdfError("the table header is not 'per 100g  per <item>': %r" % block[0])
    basis = hm.group(1)
    rows = block[1:]
    # a wrapped header continues on the next line with no numbers ("roll", "choc"); a wrapped "of which" completes on its own line
    per100, item = {}, {}
    i = 0
    if rows and not re.match(r"^\s*(Energy|Fat|Carbohydrate|Protein|Salt|Fibre|of which)\b", rows[0]):
        basis += " " + rows[0].strip()
        i = 1
    pending = None
    while i < len(rows):
        line = rows[i].strip()
        i += 1
        if pending is not None:
            if not re.fullmatch(r"(Saturates|Sugars|Polyols)", line):
                raise PdfError("'of which' row continues with %r" % line)
            label, vals = "of which " + line, pending
            pending = None
        else:
            lm = re.match(r"^(Energy|Fat|Carbohydrate|Protein|Salt|Fibre|of which(?: Saturates| Sugars| Polyols)?)\s+(\S+)\s+(\S+)$", line)
            if not lm:
                raise PdfError("unreadable nutrition row %r" % line)
            label, vals = lm.group(1), (lm.group(2), lm.group(3))
            if label == "of which":
                pending = vals
                continue
        key = ROWS[label]
        for col, v in zip((per100, item), vals):
            if key in col:
                raise PdfError("row %r printed twice" % label)
            if key == "energy":
                em = ENERGY.match(v)
                if not em:
                    raise PdfError("energy cell %r" % v)
                col[key] = (em.group(1), em.group(2))
            else:
                gm = GRAMS.match(v)
                if not gm:
                    raise PdfError("%s cell %r" % (label, v))
                col[key] = gm.group(1)
    if pending is not None:
        raise PdfError("dangling 'of which' row")
    return basis, per100, item


def read_pdf(pdf: Path) -> dict:
    """{"title", "date", "basis" (the per-item column's header), "per100", "item", "contains" (printed allergen words),
    "suitable" (printed suitability line), "ingredients", "fop" (front-of-pack figures for a cross-check)}.
    per100/item map the keys of ROWS (energy is (kJ, kcal)) to the printed text."""
    text = layout_text(pdf)
    lines = text.splitlines()
    nonblank = [l.strip() for l in lines if l.strip()]
    title = nonblank[0]
    m = re.search(r"Report date:\s*(\d\d/\d\d/\d{4})", text)
    if not m:
        raise PdfError("no 'Report date'")
    date = m.group(1)
    try:
        n0 = next(i for i, l in enumerate(lines) if l.strip() == "Nutrition")
        n1 = next(i for i, l in enumerate(lines) if l.strip() == "Ingredient Declaration")
    except StopIteration:
        raise PdfError("no Nutrition / Ingredient Declaration headings")
    block = [l for l in lines[n0 + 1:n1] if l.strip()]
    basis, per100, item = parse_table(block)
    # ingredients: the lines between "Ingredient Declaration" and the "Allergens" heading
    a0 = next(i for i, l in enumerate(lines) if re.match(r"^\s*Allergens\s+Front of Pack", l))
    ingredients = " ".join(l.strip() for l in lines[n1 + 1:a0] if l.strip())
    # front-of-pack panel (right of the allergen list): Energy/Fat/Saturates/Sugars/Salt for the item, for a cross-check
    fop = {}
    for j in range(a0, len(lines)):
        if re.search(r"\bEnergy\s+Fat\s+Saturates\s+Sugars\s+Salt\b", lines[j]):
            cells = re.findall(r"(<?\d+(?:\.\d+)?)(kJ|g)\b", lines[j + 1])
            kc = re.search(r"(<?\d+(?:\.\d+)?)kcal", " ".join(lines[j + 1:j + 3]))
            if len(cells) == 5 and kc:
                fop = {"energy": (cells[0][0], kc.group(1)), "fat": cells[1][0], "sat": cells[2][0], "sugar": cells[3][0], "salt": cells[4][0]}
            break
    al = allergen_lines(pdf)
    contains, suitable = [], []
    for l in al:
        if l.lower().startswith("suitable for "):
            suitable.append(l)
        elif l.startswith("Contains "):
            # older reports print two columns ("Contains Gluten   Contains Eggs"): one allergen per "Contains"
            contains += [w.strip() for w in re.split(r"\bContains\s+", l) if w.strip()]
        else:
            raise PdfError("unexpected line in the Allergens list: %r" % l)
    return {"title": title, "date": date, "basis": basis, "per100": per100, "item": item, "contains": contains, "suitable": suitable,
            "ingredients": ingredients, "fop": fop}

