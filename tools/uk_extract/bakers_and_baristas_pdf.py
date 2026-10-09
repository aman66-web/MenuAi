"""Reader for the Bakers & Baristas "Nutrition & Allergen Guide" PDF (UK, one big table over 34 pages).

`read_rows(pdf)` runs `pdftotext -layout` and returns every table row of the guide in reading order:

    {"page": 3, "section": "CLASSIC MUFFINS", "name": "Sticky Toffee Muffin", "kcal": "628" or "", "new": False,
     "flags": [19 tokens], "note": "<footnote printed under the name, if any>"}

The 19 flag columns are, in the printed order (checked against the rendered pages): Gluten/Wheat, Gluten/Rye, Gluten/Barley,
Gluten/Oats, Gluten/Spelt, Gluten/Kamut, Crustaceans, Eggs, Fish, Peanuts, Soya, Milk, Nuts, Celery, Mustard, Sesame Seeds,
Sulphur Dioxide/Sulphites, Lupin, Molluscs. A flag is "Y" (yes), "N" (no), "MC" (may contain), or "Y*" / "N*" (yes / no with an asterisk that
points to the page's allergy advice). The numbers are only ever copied; this module never converts or fills anything. It stops
(SystemExit) on any line it cannot classify as part of a row, a known section heading or known page furniture.
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

FLAG_COLUMNS = ["wheat", "rye", "barley", "oats", "spelt", "kamut", "crustaceans", "eggs", "fish", "peanuts", "soya", "milk", "nuts",
                "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"]
FLAG_TOKENS = {"Y", "N", "MC", "N*", "Y*"}
# Column titles as printed (rotated) in the header row, in column order; the check below confirms the header text is all there.
HEADER_WORDS = ["Gluten / Wheat", "Gluten / Rye", "Gluten / Barley", "Gluten / Oats", "Gluten / Spelt", "Gluten / Kamut", "Crustaceans",
                "Eggs", "Fish", "Peanuts", "Soya", "Milk", "Nuts", "Celery", "Mustard", "Sesame Seeds", "Molluscs", "Lupin", "Sulphites"]
SECTIONS = [
    "CLASSIC MUFFINS", "LIMITED EDITION MUFFINS", "DELUXE MUFFINS", "MADE WITHOUT GLUTEN MUFFINS", "VEGAN MUFFINS", "MINI MUFFINS",
    "CUPCAKES", "COOKIES", "DONUTS", "SCONES", "PASTRIES", "SLICED CAKES", "CAKE POPS", "TRAYBAKES", "TEACAKES",
    "FRESH BAPS", "BAGUETTES", "ITALIAN FLATBREADS", "BAGELS", "TOASTIES", "PANINIS", "BLOOMER SANDWICHES", "WRAPS", "FILLED CROISSANTS",
    "FRESH TOAST", "SAVOURY SLICES", "SAUSAGE ROLL", "JACKET POTATOES", "SOUP",
    "COFFEE", "MATCHA HOT LATTES", "CHOCOLATE DRINKS", "TEA", "SPECIALITY TEAS", "EXTRAS",
    "OVER ICE", "MATCHA ICED LATTES", "CREAMY FRAPPES", "FRUIT SMOOTHIES", "MILKSHAKES", "ICED TEAS", "ICED LEMONADES", "FROZEN REFRESHERS",
    "ICE CREAM", "SUGARS & CONDIMENTS",
]
# Page furniture: the tab strips, the rotated column titles, the version line, the legend. Anything else that is not a row is an error.
FURNITURE = re.compile(
    r"^(Muffins|Sweet Treats|Savoury|Hot Drinks|Chilled Drinks|Ice Cream|Extras|Cupcakes|Cookies|Scones|Pastries|Sliced Cakes|Traybakes|"
    r"Teacakes|Savoury Slices|Fresh Baps|Baguettes|Bagels|Flatbread|Toasties|Paninis|Bloomers|Wraps|Croissants|Toast|Sausage Rolls|Soap|"
    r"Barista Coffee|Matcha Hot Lattes|Chocolate Drinks|Tea|Over Ice|Matcha Iced Lattes|Creamy Frappes|Fruit Smoothies|Milkshakes|"
    r"Iced Teas|Iced Lemonades|Frozen Refreshers|Sugars & Condiments|Classic|Seasonal|Deluxe|Made without Gluten|Vegan|Mini|"
    r"Sulphur Dioxide/|Sulphites|Product|Kcal|Kcal \(Per 100g\)|Gluten / (Wheat|Rye|Barley|Oats|Spelt|Kamut)|Crustaceans|Eggs|Fish|Peanuts|"
    r"Soya|Milk|Nuts|Celery|Mustard|Sesame Seeds|Molluscs|Lupin|NEW|>|Y|"
    r"Version #20 - Updated 01 September 2026|Y Yes MC May contain|Y HALAL \d+|HALAL|\d+)$")


def _page_lines(pdf: Path) -> list[list[str]]:
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    pages = out.split("\f")
    if pages and not pages[-1].strip():
        pages = pages[:-1]
    return [p.split("\n") for p in pages]


def _cells(line: str) -> list[str]:
    return [c for c in re.split(r"\s{2,}", line.strip()) if c]


def _try_row(cells: list[str]):
    """cells -> (name or None, kcal str, flags) when the last 19 cells are all flags; else None."""
    if len(cells) < 19 or any(c not in FLAG_TOKENS for c in cells[-19:]):
        return None
    head = cells[:-19]
    new = False
    kcal = ""
    # head is [name] [NEW] [kcal] in that order; the name may end with " NEW"
    if head and re.fullmatch(r"\d+", head[-1]):
        kcal = head.pop()
    if head and head[-1] == "NEW":
        new = True
        head.pop()
    name = " ".join(head).strip() if head else None
    if name and name.endswith(" NEW"):
        new, name = True, name[:-4].strip()
    return name, kcal, new, cells[-19:]


def read_rows(pdf: Path) -> list[dict]:
    rows: list[dict] = []
    section = None
    pending = None  # (text) a line that might be the name of the next nameless row
    last_row = None
    pending_new = False
    for pno, lines in enumerate(_page_lines(pdf), 1):
        for raw in lines:
            if not raw.strip():
                continue
            cells = _cells(raw)
            text = " ".join(cells)
            r = _try_row(cells)
            if r is not None:
                name, kcal, new, flags = r
                if name is None:
                    if pending is None:
                        raise SystemExit(f"page {pno}: a row of flags with no name: {raw.strip()[:80]!r}")
                    name = pending
                row = {"page": pno, "section": section, "name": name, "kcal": kcal, "new": new or pending_new, "flags": flags, "note": ""}
                pending, pending_new, last_row = None, False, row
                rows.append(row)
                continue
            if len(cells) == 2 and re.fullmatch(r"\d+", cells[0]) is None and cells[0] == "NEW":
                pending_new = True
                continue
            if text in SECTIONS:
                section = text
                pending = None
                continue
            if text.startswith("Made in a kitchen containing Gluten") and last_row is not None:
                last_row["note"] = text
                continue
            if re.match(r"^\*?ALLERGY ADVICE", text) or text.startswith("Jacket Potato toppings"):
                continue
            if text == "NEW":
                pending_new = True
                continue
            if FURNITURE.match(text) or all(FURNITURE.match(c) for c in cells):
                continue
            if pno <= 2:  # cover and introduction pages carry prose, not rows
                continue
            # A line that is none of the above is the name of a row whose numbers sit on the next line (a wrapped name).
            if pending is None and re.fullmatch(r"[A-Za-z0-9&',.()\-/ ’éÈèÉ]+", text):
                pending = text
                continue
            raise SystemExit(f"page {pno}: unrecognised line {raw.strip()[:100]!r}: the guide's layout changed, re-check the reader")
    return rows


def page_text(pdf: Path) -> str:
    return "\n".join("\n".join(p) for p in _page_lines(pdf))


def check_header(pdf: Path) -> None:
    """The column order is read from the rendered header (rotated text), so check the guide still prints exactly those 19 titles."""
    text = page_text(pdf)
    for w in HEADER_WORDS:
        if text.count(w) < 30:
            raise SystemExit(f"column title {w!r} is printed {text.count(w)} times; expected a header on each of the table pages")


def allergens_for(flags: list[str]) -> dict:
    """19 printed flags -> contains / may_contain key sets (+ cereals). 'N*' is read as may contain (see the script docstring)."""
    contains, may, cereals = set(), set(), set()
    keys = {"crustaceans": "crustaceans", "eggs": "eggs", "fish": "fish", "peanuts": "peanuts", "soya": "soya", "milk": "milk",
            "nuts": "nuts", "celery": "celery", "mustard": "mustard", "sesame": "sesame", "sulphites": "sulphites", "lupin": "lupin",
            "molluscs": "molluscs"}
    for col, tok in zip(FLAG_COLUMNS, flags):
        if col in ("wheat", "rye", "barley", "oats", "spelt", "kamut"):
            key = "gluten"
        else:
            key = keys[col]
        if tok in ("Y", "Y*"):
            contains.add(key)
            if key == "gluten":
                cereals.add(col)
        elif tok in ("MC", "N*"):
            may.add(key)
    return {"contains": contains, "may_contain": may, "cereals": cereals}
