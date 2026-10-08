#!/usr/bin/env python3
"""Build data/source/jollibee/ from Jollibee UK's official calorie chart (a CALORIES-ONLY chain, image-only PDF).

    python3 tools/uk_extract/jollibee.py path/to/Jollibee-Calorie-Chart-UK-Mar-2023.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own page links as "CALORIE CHART", under "Please download our current Allergy List and Calorie Chart below"):
    https://www.jollibee.uk/nutritional-info  ->  https://www.jollibee.uk/s/Jollibee-Calorie-Chart-UK-Mar-2023.pdf
    (HTTP 302) -> https://static1.squarespace.com/static/5f33b417d073c907b3c2e379/t/641316f9ee0266496d825664/1678972665500/
                  Jollibee-Calorie-Chart-UK-Mar-2023.pdf
    One page (842 x 1425 pt), PDF created 21 June 2022, modified 16 March 2023, Content-Length 292651. The page is a single 1754 x 2970 px
    picture of a two-column table ("Menu Item", "kcal") with no usable text layer (the hidden OCR text is garbled), so the numbers cannot
    be extracted by script. robots.txt (www.jollibee.uk, Squarespace default) disallows only /config, /search, /account, /api/, /static/
    on that host and a few query strings: /nutritional-info and /s/*.pdf are allowed; the CDN host serving the file has no robots.txt.

HOW THE NUMBERS WERE TAKEN (8 Oct 2026). Rendered at 200 dpi (`pdftoppm -r 200 -png`), every row read BY EYE at full size in five
strips, and each cell then read again by tesseract OCR (jollibee_ocr_check.py) as a second, independent pass. The transcription below
is therefore a checked table, not a script reading: TABLE holds every printed row of the chart, in the chart's own order, with its row
number counted from the top (row 1 = "1pc Chickenjoy", row 85 = "BBQ & Cheese Chicken Wrap Meal"), the name as printed and the value
as printed. A cell that could not be read with certainty would have been held back, never guessed; none needed it.
The script STOPS if the PDF's SHA-256 is not the one that was read (a new chart means the table must be re-read), if the row numbers
are not 1..85 in order, or if one of the chart's own sums (meal = item + fries + Diet Coke, bucket = pieces, ...) no longer holds.

What the chart prints (and what we copy):
- ONE number per row: kcal, "per item/meal as sold". Never protein, carbs, fat, kJ, salt, fibre, sugar, weights: so this is a
  CALORIES-ONLY chain (docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank and every item is not rankable.
- A "*" after the value marks what the footnote explains: "*Meal calories calculated with gravy, diet coke & fries. Chickenjoy
  calculations are based on average calories." (it is on every Chickenjoy, strips, bucket, meal, deal and bundle row). Kept in `notes`
  and in note.txt; the value itself is copied without the asterisk.
- "- Serves 4" after the value on the 8 pc and 12 pc bucket rows: copied as `serving` ("Serves 4"); the figure is for the whole bucket.
- "(LSQ and EC Only)": the two Jollibee Favourites bundles are sold at two branches only, so they are left out (single-venue rule).

Allergens (docs/DATA.md "Allergens") are link-only. Jollibee UK's allergen declaration ("CURRENT AS OF 17.10.25", one-page matrix, also
an image) is a newer document than this chart (October 2025 against March 2023) and a different menu: it lists Pepsi drinks (the chart
lists Coke), Ube / Dubai / Coco items, "Jolli Tenders", "Fries", "Plain Rice", and has NO row for any meal, bucket, bundle, deal, dip,
"Cheesy Yumburger" or "Double Yumburger with Cheese". Names that differ or rows that do not exist cannot be matched without guessing,
and allergens are safety information, so only the guide's link is published (all or nothing).

Tags: this chart names no vegetarian dish and no pork or beef, so no item gets a tag. "Meat type not stated" (reported, not tagged):
the Yumburgers, Jolly Hotdog, Jolly Spaghetti, Burgersteak (13 items); the rest are chicken, rice, sides, desserts, drinks, sauces.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "jollibee"
SOURCE_URL = "https://www.jollibee.uk/s/Jollibee-Calorie-Chart-UK-Mar-2023.pdf"
SOURCE_TITLE = "Jollibee UK Calorie Chart, March 2023 (PDF modified 16 March 2023; the chain's page calls it the current chart)"
EXPECTED_PDF_SHA256 = "8c5e2a768f933eb3d2d35a06c770151dd47676c467bf2fb135426653c64fc11b"
ALIASES = ["jollibee", "jollibee uk", "jollibee london", "jollibee chickenjoy"]
ALLERGEN_GUIDE_TITLE = "Jollibee UK Allergen Declaration (current as of 17.10.25; the chain's \"Allergy List\", 1 page)"
ALLERGEN_GUIDE_URL = "https://www.jollibee.uk/s/Jollibee-UK-Allergens.pdf"
# The matrix's legend prints "Contains" (filled) and "May contain" (hollow), and says kitchens share equipment: traces are published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Jollibee UK's calorie chart is dated March 2023 and prints calories only (no protein, carbs or fat). A * on a value means "
        "meal calories are worked out with gravy, Diet Coke and fries; Chickenjoy values are averages. Bucket values are for the whole "
        "bucket (serves 4). Newer menu items may be missing.")
EXPECTED_ROWS = 85
EXPECTED_ITEMS = 83  # 85 printed rows minus the two "(LSQ and EC Only)" bundles

CJ, CJM, BUC, STR, MAIN, SW, YUM, SIDE, DES, DRK, SAU, DEAL = (
    "Chickenjoy", "Chickenjoy meals", "Buckets", "Chicken strips", "Mains", "Sandwiches and wraps", "Yumburgers", "Sides",
    "Desserts", "Drinks", "Sauces and dips", "Meal deals and bundles")
CATEGORY_ORDER = [CJ, CJM, BUC, STR, MAIN, SW, YUM, SIDE, DES, DRK, SAU, DEAL]

# (row number on the page counted from the top, name as printed, category, value as printed, starred, printed serving, excluded reason)
# `*` = the printed value has an asterisk. Serving is only ever "Serves 4" (printed after the value on the 8 pc / 12 pc buckets).
S4 = "Serves 4"
TABLE = [
    (1, "1pc Chickenjoy", CJ, "324", True, "", ""),
    (2, "2pc Chickenjoy", CJ, "679", True, "", ""),
    (3, "3pc Chickenjoy", CJ, "1003", True, "", ""),
    (4, "1pc Spicy Chickenjoy", CJ, "299", True, "", ""),
    (5, "2pc Spicy Chickenjoy", CJ, "629", True, "", ""),
    (6, "3pc Spicy Chickenjoy", CJ, "928", True, "", ""),
    (7, "2pc Chickenjoy Meal", CJM, "1065", True, "", ""),
    (8, "3pc Chickenjoy Meal", CJM, "1389", True, "", ""),
    (9, "4pc Chickenjoy Meal", CJM, "1713", True, "", ""),
    (10, "2pc Spicy Chickenjoy Meal", CJM, "1015", True, "", ""),
    (11, "3pc Spicy Chickenjoy Meal", CJM, "1314", True, "", ""),
    (12, "4pc Spicy Chickenjoy Meal", CJM, "1613", True, "", ""),
    (13, "6pc Chickenjoy Bucket", BUC, "2037", True, "", ""),
    (14, "8pc Chickenjoy Bucket", BUC, "2716", True, S4, ""),
    (15, "12pc Chickenjoy Bucket", BUC, "4074", True, S4, ""),
    (16, "6pc Spicy Chickenjoy Bucket", BUC, "1887", True, "", ""),
    (17, "8pc Spicy Chickenjoy Bucket", BUC, "2516", True, S4, ""),
    (18, "12pc Spicy Chickenjoy Bucket", BUC, "3774", True, S4, ""),
    (19, "8pc Chickenjoy Bucket Meal", BUC, "4260", True, S4, ""),
    (20, "12pc Chickenjoy Bucket Meal", BUC, "5556", True, S4, ""),
    (21, "8pc Spicy Chickenjoy Bucket Meal", BUC, "4060", True, S4, ""),
    (22, "12pc Spicy Chickenjoy Bucket Meal", BUC, "5256", True, S4, ""),
    (23, "1pc Chickenjoy with Jolly Spaghetti", CJ, "689", True, "", ""),
    (24, "1pc Spicy Chickenjoy with Jolly Spaghetti", CJ, "664", True, "", ""),
    (25, "3pc Chicken Strips", STR, "430", True, "", ""),
    (26, "5pc Chicken Strips", STR, "696", True, "", ""),
    (27, "8pc Chicken Strips", STR, "1126", True, "", ""),
    (28, "3pc Chicken Strips Meal", STR, "816", True, "", ""),
    (29, "5pc Chicken Strips Meal", STR, "1082", True, "", ""),
    (30, "Chicken Rice Bowl", MAIN, "533", False, "", ""),
    (31, "Jollibee Chicken Sandwich", SW, "568", False, "", ""),
    (32, "Jollibee Spicy Chicken Sandwich", SW, "557", False, "", ""),
    (33, "Jollibee Double Chicken Sandwich", SW, "835", False, "", ""),
    (34, "Jollibee Chicken Sandwich Meal", SW, "954", True, "", ""),
    (35, "Jollibee Spicy Chicken Sandwich Meal", SW, "943", True, "", ""),
    (36, "Jollibee Double Chicken Sandwich Meal", SW, "1221", True, "", ""),
    (37, "Yumburger", YUM, "304", False, "", ""),
    (38, "Yumburger Meal", YUM, "690", True, "", ""),
    (39, "Cheesy Yumburger", YUM, "389", False, "", ""),
    (40, "Cheesy Yumburger Meal", YUM, "775", True, "", ""),
    (41, "Double Yumburger with Cheese", YUM, "446", False, "", ""),
    (42, "Double Yumburger with Cheese Meal", YUM, "832", True, "", ""),
    (43, "Jolly Hotdog", MAIN, "447", False, "", ""),
    (44, "Jolly Hotdog Meal", MAIN, "833", True, "", ""),
    (45, "Jolly Spaghetti", MAIN, "365", False, "", ""),
    (46, "Jolly Spaghetti Meal", MAIN, "751", True, "", ""),
    (47, "2pc Burgersteak With Rice", MAIN, "494", True, "", ""),
    (48, "Rice", SIDE, "210", False, "", ""),
    (49, "Medium Fries", SIDE, "384", False, "", ""),
    (50, "Chocolate Sundae", DES, "309", False, "", ""),
    (51, "Vanilla Twirl", DES, "71", False, "", ""),
    (52, "Chocolate Coconut Sundae", DES, "321", False, "", ""),
    (53, "Mango Coconut Sundae", DES, "241", False, "", ""),
    (54, "Cookies 'n Cream Sundae", DES, "374", False, "", ""),
    (55, "Peach Mango Pie", DES, "282", False, "", ""),
    (56, "Coke Classic, Medium, without ice", DRK, "143", False, "", ""),
    (57, "Coke Zero, Medium, without ice", DRK, "2", False, "", ""),
    (58, "Diet Coke, Medium, without ice", DRK, "2", False, "", ""),
    (59, "Sprite, Medium, without ice", DRK, "48", False, "", ""),
    (60, "Fanta, Medium, without ice", DRK, "65", False, "", ""),
    (61, "Water, Still, 500 mL", DRK, "0", False, "", ""),
    (62, "Pineapple Juice, without ice", DRK, "181", False, "", ""),
    (63, "Garlic Mayo Dip", SAU, "280", False, "", ""),
    (64, "Chickenjoy Gravy, small", SAU, "31", False, "", ""),
    (65, "Chickenjoy Gravy, large", SAU, "102", False, "", ""),
    (66, "Ketchup Sachet, 10 mL", SAU, "10", False, "", ""),
    (67, "Mayonnaise Sachet, 10 mL", SAU, "66", False, "", ""),
    (68, "Sriracha Mayo", SAU, "226", False, "", ""),
    (69, "Sweet Chili Sauce", SAU, "92", False, "", ""),
    (70, "Asian Ginger Chili Sauce", SAU, "132", False, "", ""),
    (71, "Sriracha Chicken Loaded Fries", SIDE, "716", False, "", ""),
    (72, "Gravy Chicken Loaded Fries", SIDE, "636", False, "", ""),
    (73, "Jollibee Chicken Sandwich Meal Deal", DEAL, "1195", True, "", ""),
    (74, "2pc Chickenjoy Meal Deal", DEAL, "1275", True, "", ""),
    (75, "Jollibee Spicy Chicken Sandwich Meal Deal", DEAL, "1184", True, "", ""),
    (76, "2pc Spicy Chickenjoy Meal Deal", DEAL, "1225", True, "", ""),
    (77, "Boneless Chicken Bundle for 4", DEAL, "3254", True, "", ""),
    (78, "Boneless Chicken Bundle for 2", DEAL, "2596", True, "", ""),
    (79, "Jollibee Favourites Family Bundle (LSQ and EC Only)", DEAL, "3920", True, "", "sold at two branches only (LSQ and EC)"),
    (80, "Jollibee Favourite Bundle for 2 (LSQ and EC Only)", DEAL, "2170", True, "", "sold at two branches only (LSQ and EC)"),
    (81, "8pc Chicken Strips + 2 Dips", STR, "1126", True, "", ""),
    (82, "Chicken Sandwich Lunchtime Deal", DEAL, "988", True, "", ""),
    (83, "Chicken Strips Lunchtime Deal", DEAL, "921", True, "", ""),
    (84, "BBQ & Cheese Chicken Wrap", SW, "505", False, "", ""),
    (85, "BBQ & Cheese Chicken Wrap Meal", SW, "891", True, "", ""),
]

# The chart's own sums, used only to catch a transcription slip (they are NOT published): a "Meal" row equals its item (+ the dish's
# own parts) plus Medium Fries (row 49) plus Diet Coke (row 58): the footnote says meals are counted with fries and Diet Coke.
# (total row, [part rows]). Every relation below holds exactly in the printed chart.
SUMS = [
    (7, [2, 49, 58]), (8, [3, 49, 58]), (10, [5, 49, 58]), (11, [6, 49, 58]),   # Chickenjoy meals
    (9, [3, 1, 49, 58]), (12, [6, 4, 49, 58]),                                   # 4 pc = 3 pc + 1 pc
    (16, [5, 5, 5]), (13, [2, 2, 2]), (14, [2, 2, 2, 2]), (15, [2] * 6),         # buckets are 2 pc boxes
    (17, [5] * 4), (18, [5] * 6),
    (19, [14, 49, 58, 49, 58, 49, 58, 49, 58]),                                   # 8 pc bucket meal = bucket + 4 meal sides
    (23, [1, 45]), (24, [4, 45]),                                                 # Chickenjoy with Jolly Spaghetti
    (27, [25, 26]),                                                               # 8 pc strips = 3 pc + 5 pc
    (28, [25, 49, 58]), (29, [26, 49, 58]),
    (34, [31, 49, 58]), (35, [32, 49, 58]), (36, [33, 49, 58]),
    (38, [37, 49, 58]), (40, [39, 49, 58]), (42, [41, 49, 58]), (44, [43, 49, 58]), (46, [45, 49, 58]),
    (85, [84, 49, 58]),
    (73, [34, 53]), (75, [35, 53]), (74, [7, 48]), (76, [10, 48]),                # meal deals (a Mango Coconut Sundae or Rice more)
    (21, [17, 49, 58, 49, 58, 49, 58, 49, 58]),
]
# Printed rows whose value is NOT the sum of the simple relation above: both 12 pc bucket meals print 1482 kcal over their bucket
# (the 8 pc ones print 1544 = 4 x (Medium Fries + Diet Coke)). Both are printed the same way, so they are copied as printed.
KNOWN_NOT_SUM = {20: "5556 = 12pc Bucket 4074 + 1482", 22: "5256 = 12pc Spicy Bucket 3774 + 1482"}
BUCKET_OF = {20: 15, 22: 18}  # the bucket row each of those two meals is built on


def check_table() -> None:
    rows = [t[0] for t in TABLE]
    if rows != list(range(1, EXPECTED_ROWS + 1)):
        raise SystemExit(f"TABLE rows must be 1..{EXPECTED_ROWS} in order, got {rows[:3]}...{rows[-3:]} ({len(rows)} rows)")
    by_row = {t[0]: int(t[3]) for t in TABLE}
    bad = []
    for total, parts in SUMS:
        if sum(by_row[p] for p in parts) != by_row[total]:
            bad.append(f"row {total} ({by_row[total]}) != sum of rows {parts} ({sum(by_row[p] for p in parts)})")
    if bad:
        raise SystemExit("The chart's own sums no longer hold, so a number was mistyped in TABLE or the chart changed:\n  " + "\n  ".join(bad))
    for total, why in KNOWN_NOT_SUM.items():
        if by_row[total] - by_row[BUCKET_OF[total]] != 1482:
            raise SystemExit(f"row {total}: expected {why}")
    names = [t[1] for t in TABLE]
    if len(set(names)) != len(names):
        raise SystemExit("Printed names are not unique")
    for row, name, cat, kcal, star, serving, excl in TABLE:
        if not re.fullmatch(r"\d{1,4}", kcal) or cat not in CATEGORY_ORDER:
            raise SystemExit(f"row {row} {name!r}: bad value {kcal!r} or category {cat!r}")


def build_items() -> tuple[list[dict], list[tuple[int, str, str]]]:
    check_table()
    items, excluded = [], []
    for row, name, cat, kcal, star, serving, excl in TABLE:
        if excl:
            excluded.append((row, name, excl))
            continue
        notes = f"Chart row {row}, printed '{name}' {kcal} kcal" + ("*" if star else "") + (f" - {serving}" if serving else "")
        if star:
            notes += "; * = meal calories calculated with gravy, diet coke & fries; Chickenjoy calculations are based on average calories"
        if row in KNOWN_NOT_SUM:
            notes += f"; printed as is ({KNOWN_NOT_SUM[row]}, same step on both 12pc bucket meals)"
        if row == 81:
            notes += "; same printed value as 8pc Chicken Strips (row 27)"
        items.append(dict(name=name, category=cat, calories=kcal, serving=serving, rankable=False, notes=notes))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}")
    return items, excluded


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the calorie chart PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    sha = sha256_file(args.pdf)
    print(f"calorie chart sha256 {sha}  {args.pdf}")
    if sha != EXPECTED_PDF_SHA256:
        raise SystemExit("This is not the PDF that was read by eye and OCR (SHA-256 differs): Jollibee has published a new chart. "
                         "Re-read every row (render at 200 dpi, read the strips, run jollibee_ocr_check.py), update TABLE and "
                         "EXPECTED_PDF_SHA256, then rerun.")
    items, excluded = build_items()
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Jollibee", cuisine="Chicken", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    for row, name, why in excluded:
        print(f"left out (row {row}): {name}: {why}")


if __name__ == "__main__":
    main()
