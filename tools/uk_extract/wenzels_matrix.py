"""Reads the allergen matrix (pages 5-7) of Wenzel's the Bakers' Allergen Sheet PDF (version 07, 19/06/2026) for wenzels.py.

Each of the three matrix pages is ONE IMAGE (1754 x 1240 px, about 150 ppi, no text layer): a header row of 26 allergen columns and one row per
recipe. Every cell holds one printed word: "Y" (the allergen is an ingredient), "May" (the sheet's precautionary "may contain": page 3 says
"Where provided by our suppliers, precautionary 'May Contain' allergen information is also included on our allergen matrix") or "N".
The cells are read by PIXELS, not by eye or by OCR:
  - the image and its transparency mask are extracted from the PDF (pdfimages) and laid on white;
  - the column edges are the 27 light separator lines of the dark header band; the rows are the horizontal bands of dark ink in the data
    columns (every recipe row prints one word in every column, so one band per recipe; the section bars are orange and carry no ink);
  - a word wider than 12 px is "May" (17 px against 5-7 px for a single letter); a single letter is "N" when its bottom rows span the glyph's whole
    width (the right leg of the N) and "Y" when they are a narrow stem (the Y's tail): measured over all 3,302 cells there is no in-between case
    (N spans 6-7 px, Y spans 1-2 px) and the run stops if one ever appears.
The recipe names (MATRIX_NAMES, typed from the printed sheet, in its order) are NOT read from the image: the run checks only that each page has the
expected number of rows. Whoever changes them re-reads the names (tesseract on the name column was used once as a cross-check).

    read_matrix(pdf_path) -> list of dicts {page, index, name, contains, may_contain, cereals, nuts} in printed order (127 rows)
"""
from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

# printed column order, left to right (checked against the header band of every page)
COLUMNS = [
    ("gluten", "wheat"), ("gluten", "rye"), ("gluten", "barley"), ("gluten", "oats"), ("gluten", "spelt"), ("gluten", "kamut"),
    ("crustaceans", None), ("eggs", None), ("fish", None), ("peanuts", None), ("soya", None), ("milk", None),
    ("nuts", "almond"), ("nuts", "hazelnut"), ("nuts", "walnut"), ("nuts", "cashew"), ("nuts", "pecan"), ("nuts", "brazil nut"),
    ("nuts", "pistachio"), ("nuts", "macadamia"),
    ("sesame", None), ("sulphites", None), ("molluscs", None), ("celery", None), ("mustard", None), ("lupin", None),
]
HEADER = ["Gluten Wheat", "Gluten Rye", "Gluten Barley", "Gluten Oats", "Gluten Spelt", "Gluten Kamut", "Crustaceans", "Egg", "Fish", "Peanuts",
          "Soybeans", "Milk", "Nuts Almonds", "Nuts Hazelnuts", "Nuts Walnuts", "Nuts Cashew", "Nuts Pecan", "Nuts Brazil", "Nuts Pistachios",
          "Nuts Macadamias", "Sesame seeds", "Sulphur Dioxide and Sulphites", "Molluscs", "Celery/Celeriac", "Mustard", "Lupin"]
PAGES = (5, 6, 7)
IMAGE_SIZE = (1754, 1240)
HEADER_YS = (192, 193, 194)   # rows at the foot of the dark header band (it spans y 140-195), below the last line of header text
FIRST_DATA_Y = 200

# recipe names as printed (a hyphen that only broke a line is joined), in the matrix's order, per PDF page
MATRIX_NAMES = {
    5: [
        "Seasoned Wedges", "Chicken Goujons", "Sausage Roll", "Cheese and Onion Slice", "Chicken Slice", "Steak Slice",
        "Jamaican Beef pattie", "Vegan Roll", "Tomato, Mozzarella and Pesto Panini", "Ham and Cheddar Panini",
        "Piri Piri Chicken Panini", "Southern Fried Chicken Panini", "Margherita Pizza", "Pepperoni Pizza",
        "Peri-Peri Chicken Pizza", "Premium Pepperoni Filled Baguette", "Premium Ham Filled Baguette",
        "Premium Piri Piri Filled Baguette", "Premium Vegetable Filled Baguette", "Tomato Mozzarella & Pesto Focaccia",
        "Smoked Cheese & Caramelised Onion Focaccia", "Roasted Chicken & Nduja Mayo Focaccia",
        "Brioche Egg Mayo and Spring Onion Knot", "Brioche Ham Cheese and Gherkin Knot", "Cheese & Salad Baguette",
        "Chicken & Bacon Baguette", "Chicken Club Baguette", "Chicken Salad Baguette", "Egg & Cress Baguette",
        "Egg Mayo & Salad Baguette", "Egg & Tomato Baguette", "Ham & Cheese Baguette", "Ham Salad Baguette",
        "Peri Peri Chicken Baguette", "Southern Fried Chicken Baguette", "Korean Chicken Baguette",
        "Tuna & Sweetcorn Baguette", "Tuna Salad Baguette", "Chicken & Sweetcorn Baguette", "Chipotle Chicken & Avocado Wrap",
        "Fajita Chicken Wrap",
    ],
    6: [
        "Pulled Pork & Apple Slaw Wrap", "White Cheese Salad Bloomer", "Multiseed Cheese Salad Bloomer",
        "White Chicken & Bacon Bloomer", "Multiseed Chicken & Bacon Bloomer", "White Tuna Salad Bloomer",
        "Multiseed Tuna Salad Bloomer", "White Ham & Cheese Bloomer", "Multiseed Ham & Cheese Bloomer",
        "White Chicken Club Bloomer", "Multiseed Chicken Club Bloomer", "White Chicken Mayo salad Bloomer",
        "Multiseed Chicken Mayo Salad Bloomer", "Multiseed Ham Salad Bloomer", "White Ham Salad Bloomer", "Tuna Nicoise Salad",
        "Falafel and Feta Salad", "Chicken Avocado and Bacon Salad", "Big Breakfast Baguette", "Breakfast Baguette",
        "Breakfast Roll", "Big Breakfast Roll", "The Wenzel's Breakfast", "All Day Breakfast White Bloomer",
        "All Day Breakfast Multiseed Bloomer", "Hashbrowns", "Croissant", "Double Chocolate Muffin", "Almond Muffin",
        "Lemon & Blackberry Crumble Muffin", "Chocolate viennese", "Strawberry viennese", "Lemon viennese", "Iced Ring Donut",
        "Sugar Ring Donut", "Jam Donut", "Iced England Donut", "Yummie", "Cinnamon Yummie", "Maple and Pecan Yummie",
        "Tottenham Slice", "Marble Cake Slice",
    ],
    7: [
        "Victoria sponge cake Slice", "Marble Slab Cake", "Almond Madeira", "Cherry Bakewell Tart",
        "Apple & Mixed Spice Strudel", "Cornflake Cake", "Fairy Cake", "Two Cornflake Cakes", "Belgian Bun",
        "Demi White Baguette", "Multiseed Baguette", "Small Bloomer Loaf", "Multiseed Bloomer", "Sourdough Loaf",
        "Multiseed Sourdough", "Signature Sourdough", "Large Bloomer Loaf", "Seeded Bloomer Loaf", "Crusty Roll", "Soft Roll",
        "4 Soft Rolls", "4 Crusty Rolls", "Iced Latte", "Iced Americano", "Strawberry Matcha Latte", "Vanilla Matcha Latte",
        "Ice Matcha Latte", "Pink Lemonade", "Dragon Fruit and Mango Chiller", "Mango and Passion Fruit Chiller",
        "Salted Caramel Frappe", "Vanilla Cream Frappe", "Coffee Frappe", "Mocha Frappe", "Latte", "Cappuccino", "Mochaccino",
        "Macchiato", "Flat White", "Americano", "Double Espresso", "Espresso", "Hot Chocolate", "Breakfast Tea",
    ],
}


def _extract_page_image(pdf: Path, page: int, tmp: Path) -> Image.Image:
    """The page's 1754x1240 matrix image laid on white through its transparency mask (the PDF stores both)."""
    prefix = tmp / ("p%d" % page)
    subprocess.run(["pdfimages", "-png", "-f", str(page), "-l", str(page), str(pdf), str(prefix)], check=True)
    files = sorted(tmp.glob("p%d-*.png" % page))
    for i, f in enumerate(files):
        im = Image.open(f)
        if im.size == IMAGE_SIZE and im.mode in ("RGB", "RGBA") and i + 1 < len(files):
            mask = Image.open(files[i + 1])
            if mask.size == IMAGE_SIZE and mask.mode == "L":
                bg = Image.new("RGB", im.size, (255, 255, 255))
                bg.paste(im.convert("RGB"), (0, 0), mask)
                return bg
    raise SystemExit("page %d: the %dx%d matrix image with its mask was not found: the sheet changed" % ((page,) + IMAGE_SIZE))


def _column_edges(im: Image.Image) -> list:
    """x of the 27 vertical separators between the 26 data columns (and the name column), from the light lines in the dark header band."""
    px = im.load()
    xs = [x for x in range(190, 1700) if all(sum(px[x, y]) > 150 for y in HEADER_YS)]
    groups: list = []
    for x in xs:
        if groups and x - groups[-1][-1] <= 1:
            groups[-1].append(x)
        else:
            groups.append([x])
    # a separator is 1-2 px wide; the last group is the white margin beyond the table, whose left edge is the table's edge
    edges = [(g[0] + g[-1]) / 2.0 if g[-1] - g[0] <= 2 else float(g[0]) for g in groups if g[0] < 1690]
    if len(edges) != len(COLUMNS) + 1:
        raise SystemExit("matrix header: %d column edges found, expected %d: the layout changed" % (len(edges), len(COLUMNS) + 1))
    widths = [b - a for a, b in zip(edges, edges[1:])]
    if min(widths) < 54 or max(widths) > 61:
        raise SystemExit("matrix header: column widths %s are not the expected 55-60 px: the layout changed" % sorted(set(round(w) for w in widths)))
    return edges


def _ink(px, x: int, y: int) -> bool:
    r, g, b = px[x, y]
    return max(r, g, b) < 150 and max(r, g, b) - min(r, g, b) < 60     # dark grey type; the orange bars and pink rules are not ink


def _row_bands(im: Image.Image, edges: list) -> list:
    px = im.load()
    x0, x1 = int(edges[0]) + 2, int(edges[-1]) - 2
    bands, cur = [], None
    for y in range(FIRST_DATA_Y, im.size[1]):
        has = any(_ink(px, x, y) for x in range(x0, x1))
        if has and cur is None:
            cur = [y, y]
        elif has:
            cur[1] = y
        elif cur is not None:
            bands.append(tuple(cur))
            cur = None
    if cur is not None:
        bands.append(tuple(cur))
    return bands


def _word(im: Image.Image, edges: list, c: int, band: tuple, where: str) -> str:
    px = im.load()
    x0, x1 = int(round(edges[c])) + 2, int(round(edges[c + 1])) - 2
    pts = [(x, y) for y in range(band[0], band[1] + 1) for x in range(x0, x1) if _ink(px, x, y)]
    if not pts:
        raise SystemExit("%s: an empty cell: every cell of the matrix prints a word, so the reading is wrong" % where)
    bx0, bx1 = min(p[0] for p in pts), max(p[0] for p in pts)
    by0, by1 = min(p[1] for p in pts), max(p[1] for p in pts)
    width = bx1 - bx0 + 1
    if width >= 12:
        if not 15 <= width <= 18:
            raise SystemExit("%s: a word %d px wide is neither 'May' (15-18 px) nor a single letter (5-7 px)" % (where, width))
        return "May"
    if not 5 <= width <= 7 or by1 - by0 + 1 < 6:
        raise SystemExit("%s: a glyph %d x %d px is not a single letter Y or N" % (where, width, by1 - by0 + 1))
    spans = []
    for y in range(by1 - 2, by1 + 1):                    # the glyph's bottom three rows
        xs = [x for x in range(bx0, bx1 + 1) if _ink(px, x, y)]
        spans.append(max(xs) - min(xs) + 1 if xs else 0)
    if max(spans) <= 3:
        return "Y"
    if min(spans) >= width - 2:
        return "N"
    raise SystemExit("%s: a letter whose bottom rows span %s px (glyph %d px wide) is neither Y nor N: re-read the sheet" % (where, spans, width))


def read_matrix(pdf: Path) -> list:
    """Every matrix row, in printed order: {page, index, name, words (26 of Y/May/N), contains, may_contain, cereals, nuts}."""
    rows = []
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for page in PAGES:
            im = _extract_page_image(pdf, page, tmp)
            edges = _column_edges(im)
            bands = _row_bands(im, edges)
            names = MATRIX_NAMES[page]
            if len(bands) != len(names):
                raise SystemExit("matrix page %d: %d rows of cells found, expected %d: the sheet changed" % (page, len(bands), len(names)))
            for i, (band, name) in enumerate(zip(bands, names)):
                where = "matrix page %d row %d (%s)" % (page, i + 1, name)
                words = [_word(im, edges, c, band, where + " column " + HEADER[c]) for c in range(len(COLUMNS))]
                contains, may, cereals, nuts = set(), set(), set(), set()
                for (key, specific), w in zip(COLUMNS, words):
                    if w == "Y":
                        contains.add(key)
                        if specific and key == "gluten":
                            cereals.add(specific)
                        elif specific and key == "nuts":
                            nuts.add(specific)
                    elif w == "May":
                        may.add(key)
                rows.append({"page": page, "index": i, "name": name, "words": words, "contains": contains,
                             "may_contain": may, "cereals": cereals, "nuts": nuts})
    if len(rows) != sum(len(v) for v in MATRIX_NAMES.values()):
        raise SystemExit("matrix: wrong total row count")
    return rows


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("&", "and"))
