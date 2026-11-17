"""Read Mowgli's allergen matrix PICTURE (the "View Allergens Matrix Page" link, https://mowglistreetfood.com/allergens/) into one row
per dish. Python 3.9. Used by tools/uk_extract/mowgli.py --allergen-image.

Since November 2026 the food menu page links the Allergens page instead of a PDF, and that page shows the matrix only as a picture,
Mowgli_Mv36_Allergen_Matrix_AW_v2-Xmas_page-0001.jpg (Rev 36, 1418 x 4282 px), with no text layer. Nothing is guessed or typed from it
except the dish NAMES (ROW_NAMES below, in the picture's order, typed by hand like every other script's names); the marks are read from
the pixels:

  * the allergen columns are the 14 brown header cells of the FOOD MENU table, found in the picture (a pixel row with exactly 14 dark
    cells wider than 30 px between x 550 and 1360); they must sit where COLUMNS says (within 4 px), in the order of common._A keys;
  * a dish row is a line of dark text in the dish-name column (x 145-555) below that header, up to the first gap of more than 60 px
    (the DRINKS MENU heading); the number of lines must equal len(ROW_NAMES);
  * a cell holds a mark when at least MARK_MIN pixels of the cell (6 px above to 6 px below the row's text, 3 px inside the cell's edges)
    are darker than luminance 190. On Rev 36 an empty cell has 0 such pixels and a tick 52-53 (more where the cell also prints a cereal
    or nut kind beside it); any count between 1 and MARK_MIN - 1 stops the run as unreadable.

What this reader cannot do (so it does not claim to): it does not read the words beside a tick (WHEAT, BARLEY, OATS, ALMONDS, PRAWNS),
so no cereal / tree nut kinds come from it, and it does not tell the key's "(tick) Optional ingredient" from a plain tick: both count as
the allergen being present, as the food page's own list does.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

from PIL import Image

COLUMNS: List[Tuple[str, int, int]] = [
    ("celery", 563, 608), ("gluten", 610, 714), ("crustaceans", 716, 785), ("eggs", 787, 832), ("fish", 834, 879), ("lupin", 881, 926),
    ("milk", 928, 973), ("molluscs", 975, 1020), ("mustard", 1022, 1067), ("nuts", 1069, 1153), ("peanuts", 1155, 1200),
    ("sesame", 1202, 1247), ("soya", 1249, 1294), ("sulphites", 1297, 1342),
]
NAME_X0, NAME_X1 = 145, 555
MARK_MIN = 30
EXPECTED_SIZE = (1418, 4282)
EXPECTED_MARKS = 104  # cells with a mark on the food table, Rev 36 (counted 2026-11-17, by row and by section)
# the picture's FOOD MENU rows, top to bottom (Rev 36): names only, typed from the picture
ROW_NAMES = [
    "Yoghurt Chat Bombs", "Vegan Yoghurt Chat Bombs", "Poppadoms & Dips", "Vegan Poppadoms & Dips", "Onion Bhajis",
    "Bombay Butter Prawns", "Mowgli Spice Bag", "Diwali Cauliflower", "Vegan Diwali Cauliflower", "Mowgli Crispy Wings", "Gunpowder Chicken",
    "Himalayan Cheese Toast", "Mowgli Chip Butty", "Sticky Chicken",
    "Mowgli Mixed Grill", "Lamb Kofta Kebabs", "Maa’s Lamb Chops", "Angry Bird", "Monkey Tandoor Roti",
    "Mother Butter Chicken", "House Chicken Curry", "House Lamb Curry", "Goan Fish Curry", "Aunty Geeta’s Prawn Curry", "Mowgli Paneer",
    "Mowgli Black Dahl", "Temple Dahl", "Tea Steeped Chickpeas", "Picnic Potato Curry",
    "Garlic & Coriander Butter Paratha", "Puffed Puri Bread", "Roti Breads", "Vegan Roti Breads", "Mowgli Cumin Rice", "Masala Carrots",
    "Mowgli Slaw", "Fenugreek Kissed Fries", "Treacle Tamarind Fries",
    "Chocolate & Cherry Chat Bombs", "Sticky Ginger Toffee Pudding", "Gulab Jamun", "The Mowgli Chocolate Brownie", "Kids Brownie",
    "Ice Cream Cones - Salted Caramel", "Ice Cream Cones - Coconut", "Ice Cream Cones - Mango Sorbet", "Ice Cream Cones - Vanilla",
    "Kids Gunpowder Chicken & Fries", "Mother Butter Chicken & Rice", "House Chicken Curry & Rice", "Mowgli Paneer & Rice",
    "Temple Dahl & Rice", "Chocolate Chat Bombs",
    "Enka’s Fish & Chips (Brighton Exclusive)", "Haggis Pakora (Edinburgh Exclusive)", "Jewelled Lamb Shank (Sunday Special)",
]


def _lum(p) -> float:
    return (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000


def _header(px, w: int) -> Tuple[int, List[Tuple[int, int]]]:
    for y in range(250, 600):
        segs, start = [], None
        for x in range(550, 1360):
            dark = _lum(px[x, y]) < 170
            if dark and start is None:
                start = x
            elif not dark and start is not None:
                if x - start > 30:
                    segs.append((start, x - 1))
                start = None
        if len(segs) == 14:
            return y, segs
    raise SystemExit("mowgli_matrix_image: no 14-cell header found: the picture's layout changed")


def read_rows(jpg: Path) -> List[dict]:
    """-> [{name, contains: {key: False}, kinds: {}}] for the FOOD MENU table, in the picture's order."""
    im = Image.open(jpg).convert("RGB")
    if im.size != EXPECTED_SIZE:
        raise SystemExit(f"mowgli_matrix_image: picture is {im.size}, expected {EXPECTED_SIZE}: a new matrix, check it first")
    px = im.load()
    w, h = im.size
    hy, cells = _header(px, w)
    for (key, l, r), (cl, cr) in zip(COLUMNS, cells):
        if abs(l - cl) > 4 or abs(r - cr) > 4:
            raise SystemExit(f"mowgli_matrix_image: column {key} found at {cl}-{cr}, expected {l}-{r}")
    lines, start = [], None
    for y in range(hy + 20, h):
        n = sum(1 for x in range(NAME_X0, NAME_X1) if _lum(px[x, y]) < 110)
        if n and start is None:
            start = y
        elif not n and start is not None:
            lines.append((start, y - 1))
            start = None
    food = [lines[0]]
    for ln in lines[1:]:
        if ln[0] - food[-1][1] > 60:
            break
        food.append(ln)
    if len(food) != len(ROW_NAMES):
        raise SystemExit(f"mowgli_matrix_image: {len(food)} dish rows in the picture, ROW_NAMES has {len(ROW_NAMES)}: the matrix changed")
    rows, marks = [], 0
    for name, (a, b) in zip(ROW_NAMES, food):
        row = {"name": name, "contains": {}, "kinds": {}}
        for (key, _l, _r), (cl, cr) in zip(COLUMNS, cells):
            n = sum(1 for y in range(a - 6, b + 7) for x in range(cl + 3, cr - 2) if _lum(px[x, y]) < 190)
            if 0 < n < MARK_MIN:
                raise SystemExit(f"mowgli_matrix_image: {name!r} column {key}: {n} dark pixels, neither empty nor a mark")
            if n >= MARK_MIN:
                row["contains"][key] = False
                marks += 1
        rows.append(row)
    if marks != EXPECTED_MARKS:
        raise SystemExit(f"mowgli_matrix_image: {marks} marks on the food table, expected {EXPECTED_MARKS}: the matrix changed")
    return rows
