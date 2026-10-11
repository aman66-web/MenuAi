#!/usr/bin/env python3
"""Build data/source/goals-soccer-centres/ from the Goals food menu PDF (a CALORIES-ONLY chain; the PDF is a picture, so it is read by OCR).

    python3 tools/uk_extract/goals_soccer_centres.py path/to/fb-dl-table-talker-designs-v4.pdf --checked-on 2026-10-11 [--out DIR]

Source: https://www.goalsfootball.co.uk/about-us/food-menu-2025 ("Food Menu", linked from every club page's "How can we help" menu; its
"Download menu" button) -> https://cdn.goalsfootball.co.uk/media/zyue2gmn/fb-dl-table-talker-designs-v4.pdf (Last-Modified 14 Jan 2026,
PDF created 12 Jan 2026 in InDesign; one page, 983 x 637 pt, ONE embedded 3992 x 2551 px image and no text layer).
robots.txt of www.goalsfootball.co.uk: `User-agent: *  Allow: /`; cdn.goalsfootball.co.uk/robots.txt is a 404 (no rules).
Clubs: the chain's sitemap lists 43 /our-clubs/{region}/{club} pages (Scotland 3, Midlands 7, North West 4, South 2, South West 2,
South East 16, Yorkshire 4, East 2, North East 3 ...). The six club pages read on 2026-10-11 (Glasgow South, Birmingham Perry Barr, Coventry,
Leicester, Northampton, Chester) each link this one Food Menu page. The menu is ONE central design for every club; its footer says
"* Scan the full menu to see what your club has available" and the QR page was not followed, so which dish each club stocks is not published.

The menu prints calories ONLY, in a KCAL column beside each price (and "Kcal NNNN" under each pizza): protein, carbs and fat stay blank
(docs/DATA.md "Calories-only chains"). Prices are not used.

How the figures are read (copy, never type): the page is rendered at 250, 300 and 350 dpi, the menu panel (right) and the pizza panel (middle) are
cropped and inverted (white-on-black print) and read by Tesseract (`tesseract --psm 6`). The KCAL figure of each row is the number printed
before the price ("749  £5.00"), the pizza figure the one after "Kcal". The script stops unless all three resolutions give the SAME figure for
every one of the 19 rows, in the expected order, under the expected printed name. (The first reading at 200 dpi mixed up the menu's slashed
zero; the check against two further resolutions is the guard.) The values were also read by eye on 450 dpi crops: see data/audit/verified/.
Names, categories and tags are written by hand in ITEMS; the script stops if a printed name or the row count differs.

Tags come from the menu's own icons, which were read by eye (the menu's key: green leaf = Vegetarian, green circle = Halal; "Vegan/Vegetarian
items may be available, please ask a member of staff"): vegetarian for French Fries and Chicago Town 4 Cheese Pizza (leaf icon). Halal has no tag in the
data model. Pork where the name or the printed ingredients say sausage, bacon, pepperoni or ham; beef where they say beef (the BBQ Magnificent Meat
Feast: "slices of pork and beef pepperoni, fennel sausage and smoke flavour ham"). Meat type not stated: Quarter Pounder With Cheese (and & Fries), 5" Hotdog (and With Fries).
Not listed: drinks, which print no calories. Allergens: none in the file.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "goals-soccer-centres"
SOURCE_URL = "https://cdn.goalsfootball.co.uk/media/zyue2gmn/fb-dl-table-talker-designs-v4.pdf"
SOURCE_TITLE = "Goals food menu (table-talker PDF fb-dl-table-talker-designs-v4, created 12 January 2026)"
ALIASES = ["goals", "goals soccer centre", "goals soccer centres", "goals football", "goals football centre", "goals football centres"]
NOTE = ("Goals prints calories only, on one menu for all its clubs, and says not every item is stocked at every club. Calories are for the whole dish as "
        "listed (each pizza is a whole 12-inch Chicago Town pizza). Drinks print no calories and are not listed.")
DPIS = (250, 300, 350)
MENU_CROP = (0.69, 0.27, 0.975, 0.90)   # right-hand panel, as fractions of the page
PIZZA_CROP = (0.40, 0.52, 0.66, 0.88)   # middle panel
PORK, BEEF, VEG = "contains_pork", "contains_beef", "vegetarian"

BH, FR, CW, SI, PZ = "Burgers & hot dogs", "Filled rolls", "Chicken & wings", "Sides", "Pizza"
# (printed name on the menu, item name, category, tags, note) in the order the menu prints them.
ITEMS = [
    ("Quarter Pounder With Cheese", "Quarter Pounder With Cheese", BH, [], "Meat type not stated"),
    ("Quarter Pounder With Cheese & Fries", "Quarter Pounder With Cheese & Fries", BH, [], "Meat type not stated"),
    ("Chicken Goujon Burger", "Chicken Goujon Burger", BH, [], "Halal icon on the menu; 456 + the 492 of French Fries = the 948 printed for the burger & fries"),
    ("Chicken Goujon Burger & Fries", "Chicken Goujon Burger & Fries", BH, [], "The other '& Fries' dishes add about 410 kcal to the dish alone (749 to 1159, 269 to 679), this one 492"),
    ('5" Hotdog', '5" Hotdog', BH, [], "Meat type not stated"),
    ('5" Hotdog With Fries', '5" Hotdog With Fries', BH, [], "Meat type not stated"),
    ("Sausage Filled Roll", "Sausage Filled Roll", FR, [PORK], ""),
    ("Bacon Filled Roll", "Bacon Filled Roll", FR, [PORK], "A first OCR pass and the checking pass at 450 dpi read the slashed zero of 409 as 469 and 4099; read by eye as 409"),
    ("Sausage & Bacon Filled Roll", "Sausage & Bacon Filled Roll", FR, [PORK], ""),
    ("Chicken Strips (3)", "Chicken Strips (3)", CW, [], "Halal icon on the menu"),
    ("Chicken Strips (5)", "Chicken Strips (5)", CW, [], "Halal icon on the menu"),
    ("Spicy Buffalo Chicken Wings (8)", "Spicy Buffalo Chicken Wings (8)", CW, [], ""),
    ("Chicken Wings (4) & Chicken Strips (3)", "Chicken Wings (4) & Chicken Strips (3)", CW, [], ""),
    ("French Fries", "French Fries", SI, [VEG], "Vegetarian icon on the menu"),
    ("Cheesy Fries", "Cheesy Fries", SI, [], ""),
    ("Doritos Nachos", "Doritos Nachos", SI, [], "Printed 'Doritos® Nachos'"),
    ('Chicago Town 12" 4 Cheese Pizza', 'Chicago Town 12" 4 Cheese Pizza', PZ, [VEG], "Vegetarian icon on the menu; 'Please ask staff for pizza availability'"),
    ('Chicago Town 12" Stuffed Crust Pepperoni Pizza', 'Chicago Town 12" Stuffed Crust Pepperoni Pizza', PZ, [PORK], "Printed 'slices of pepperoni'"),
    ('Chicago Town 12" BBQ Magnificent Meat Feast', 'Chicago Town 12" BBQ Magnificent Meat Feast', PZ, [PORK, BEEF], "Printed 'slices of pork and beef pepperoni, fennel sausage and smoke flavour ham'"),
]
MENU_ROWS, PIZZAS = ITEMS[:16], ITEMS[16:]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("®", ""))


def _ocr(page_png: Path, crop: tuple[float, float, float, float], tmp: Path) -> str:
    im = Image.open(page_png).convert("L")
    w, h = im.size
    part = ImageOps.invert(im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h))))
    f = tmp / "crop.png"
    part.save(f)
    return subprocess.run(["tesseract", str(f), "-", "--psm", "6"], capture_output=True, text=True, check=True).stdout


def read_once(pdf: Path, dpi: int, tmp: Path) -> tuple[list[tuple[str, str]], list[str]]:
    Image.MAX_IMAGE_PIXELS = None
    base = tmp / f"p{dpi}"
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", str(pdf), str(base)], check=True, capture_output=True)
    page = next(tmp.glob(f"p{dpi}-*.png"))
    menu = _ocr(page, MENU_CROP, tmp)
    pizza = _ocr(page, PIZZA_CROP, tmp)
    rows = [(m.group(1).strip(), m.group(2)) for m in re.finditer(r"^(.*?)\s+(\d{3,4})\s+£", menu, re.M)]
    pizzas = re.findall(r"K[ce]+al\s+(\d{3,4})", pizza)
    return rows, pizzas


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    runs = []
    with tempfile.TemporaryDirectory() as t:
        for dpi in DPIS:
            d = Path(t) / str(dpi)
            d.mkdir()
            runs.append(read_once(args.pdf, dpi, d))
    kcal: list[str] = []
    for dpi, (rows, pizzas) in zip(DPIS, runs):
        if len(rows) != len(MENU_ROWS) or len(pizzas) != len(PIZZAS):
            raise SystemExit(f"OCR at {dpi} dpi found {len(rows)} menu rows and {len(pizzas)} pizzas, expected {len(MENU_ROWS)} and {len(PIZZAS)}: "
                             "the menu changed or the reading failed; read the PDF by eye")
        for (label, _), item in zip(rows, MENU_ROWS):
            if not _norm(label).startswith(_norm(item[0])[: max(8, len(_norm(item[0])) - 4)]):
                raise SystemExit(f"OCR at {dpi} dpi read the row {label!r} where {item[0]!r} was expected: the menu changed")
    for i in range(len(MENU_ROWS)):
        values = {runs[k][0][i][1] for k in range(len(DPIS))}
        if len(values) != 1:
            raise SystemExit(f"Row {MENU_ROWS[i][0]!r}: the resolutions disagree ({[runs[k][0][i][1] for k in range(len(DPIS))]}): read the PDF by eye")
        kcal.append(values.pop())
    for i in range(len(PIZZAS)):
        values = {runs[k][1][i] for k in range(len(DPIS))}
        if len(values) != 1:
            raise SystemExit(f"Pizza {PIZZAS[i][0]!r}: the resolutions disagree ({[runs[k][1][i] for k in range(len(DPIS))]}): read the PDF by eye")
        kcal.append(values.pop())
    items = [dict(name=name, category=cat, calories=k, tags="|".join(tags), rankable=False,
                  notes="; ".join(x for x in (f"Printed '{printed}' {k} kcal (OCR at {'/'.join(map(str, DPIS))} dpi agreed)", note) if x))
             for (printed, name, cat, tags, note), k in zip(ITEMS, kcal)]
    if len({i["name"] for i in items}) != len(items):
        raise SystemExit("Item names are not unique")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Goals", cuisine="Bar & Kitchen", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories")
    cats = Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print("  kcal read (all three resolutions agree): " + ", ".join(f"{it[1]} {k}" for it, k in zip(ITEMS, kcal)))


if __name__ == "__main__":
    main()
