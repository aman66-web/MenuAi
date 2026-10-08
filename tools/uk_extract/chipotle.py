#!/usr/bin/env python3
"""Build data/source/chipotle/ from Chipotle UK's current official "14 allergens and nutrition facts" chart.

    python3 tools/uk_extract/chipotle.py path/to/Allergen-UK270726.pdf --checked-on 2026-10-08

SOURCE: CHART_URL (linked as "NUTRITION" from https://www.chipotle.co.uk/allergens). A one-page PDF, footer code UK270726 (PDF created
6 Aug 2026, Last-Modified 1 Sep 2026), titled on the page "14 ALLERGENS" and "NUTRITION FACTS (PER SERVING) TYPICAL VALUES". It prints,
for every product: a grid of the 14 UK allergens (a red cross marks an allergen; "Allergens are marked as a cross including cereals
containing gluten"), the serving as "Per Serving Portion" (e.g. "113 g", "3 Ea (75 g)", "59 ml"), and nutrition per serving (kJ, kcal,
fat, saturates, carbohydrate, sugars, fibre, protein, salt) and per 100 g/ml. It prints no "may contain" per item, only a general
warning that food is prepared in open-plan kitchens where multiple allergens are present.

WHY THIS SCRIPT TRANSCRIBES: the chart is drawn entirely as outlines (no text layer, no fonts), so no script can read it. It was read
by eye from a 150-250 dpi render (pdftoppm), every number and every allergen cell checked against the image, and cross-checked by an
independent per-cell OCR run (tesseract) and a pixel scan of the allergen grid (exactly six red cells on the whole chart: Milk x3, Cereals &
Gluten x2, Soya x1). The table CHART_ROWS below is that transcription; each line says which printed row it is. Numbers are kept exactly
as printed (strings such as "1.50"). To keep a re-run honest the script refuses any PDF other than the one transcribed (CHART_SHA256):
if Chipotle re-issues the chart, re-read the table by eye and update CHART_ROWS and the hash together.

This replaces the earlier source, the AUG 2022 "nutrition facts" sheet (https://www.chipotle.co.uk/nutrition-calculator, a PDF with a
text layer): the chart repeats 20 of that sheet's rows' figures and prints two rows differently (Flour Tortilla (taco) is printed for 3
tortillas, not one; Chips (large) is 170 g, 627 kcal, not double the regular row), and three rows differ only in how a "<" is printed
(see the notes below). Where the two documents differ, what the CURRENT chart prints is published. The 2022 sheet's page-2 allergen table
(named by group, out of date) is no longer used.

Only items the chart prints are published; rows the chart also prints that are not listed in ROWS (Hard Shell Taco (Crispy Corn Taco),
Chips (Kids), Super Greens, Queso Blanco, the three limited-time chicken rows, the fountain and Tractor drinks) are not part of this
extraction yet. Items stay in one "Ingredients" category and are not rankable: the chart publishes a value for each ingredient but none for a
finished burrito, bowl, salad or taco, and building one would mean adding ingredients together (and guessing portions).

Allergens are all or nothing (docs/DATA.md): this script stops unless every item in ROWS, including the held-back ones, has an allergen
entry from the chart's grid.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, write_chain_folder  # noqa: E402

CHAIN_ID = "chipotle"
CHART_URL = "https://www.chipotle.co.uk/content/dam/chipotle/menu/nutrition/2026/eu/Allergen-UK270726.pdf"
CHART_SHA256 = "fc07272f8702c7c4c635feae3c4d444029695758d2330021d9921724245641fe"
SOURCE_TITLE = "Chipotle UK 14 allergens and nutrition facts chart, per serving (UK270726, Aug 2026)"
ALLERGEN_GUIDE = {"title": "Chipotle UK 14 allergens and nutrition facts chart (UK270726)", "url": CHART_URL,
                  "may_contain_published": False}
ALIASES = ["chipotle", "chipotle mexican grill"]
ING = "Ingredients"
BEEF = "contains_beef"

# The chart's 14 allergen columns, left to right, as printed -> our allergen key (docs/DATA.md). "Shellfish" is the chart's word for
# crustaceans (it has a separate "Mollusc" column); "Lupine" and "Sulfites" are its spellings; "Cereals & Gluten" has no cereal named.
GRID = [("Milk", "milk"), ("Sulfites", "sulphites"), ("Cereals & Gluten", "gluten"), ("Mollusc", "molluscs"), ("Celery", "celery"),
        ("Soya", "soya"), ("Eggs", "eggs"), ("Fish", "fish"), ("Lupine", "lupin"), ("Shellfish", "crustaceans"),
        ("Mustard", "mustard"), ("Nut", "nuts"), ("Peanuts", "peanuts"), ("Sesame seeds", "sesame")]
GRID_KEYS = dict(GRID)

# Each line = one printed row of the chart's table, in printed order (page 1 is the only page):
#   (row, printed name, printed portion, kJ, kcal, fat, saturates, carbohydrate, sugars, fibre, protein, salt, allergen columns with a cross)
# `row` counts the table's product lines from the top (1 = Flour Tortilla (Burrito)); the numbers missing from the sequence are rows the
# chart prints that are not extracted yet (3 Hard Shell Taco, 26 Chips (Kids), 28 Super Greens, 29 Queso Blanco, then the limited-time and
# drinks rows). The two Romaine lines (22, 23) are one product label ("Romaine Lettuce (salad/topping)") with two portions.
CHART_ROWS = [
    (1, "Flour Tortilla (Burrito)", "1 Ea (95 g)", "1243", "297", "8.8", "0.7", "49.2", "1.8", "4.4", "7.9", "1.50", ("Cereals & Gluten",)),
    (2, "Flour Tortilla (Taco)", "3 Ea (75 g)", "1004", "240", "7.5", "0.5", "39.0", "1.0", "2.8", "6.0", "0.50", ("Cereals & Gluten",)),
    (4, "Coriander-Lime White Rice", "113 g", "774", "185", "2.0", "0.5", "41.5", "0.1", "1.2", "4.1", "1.20", ()),
    (5, "Coriander-Lime Brown Rice", "113 g", "774", "185", "1.7", "0.4", "32.8", "0.1", "2.3", "3.8", "1.10", ()),
    (6, "Black Beans", "113 g", "397", "95", "2.4", "1.0", "4.9", "0.9", "8.6", "7.2", "0.50", ()),
    (7, "Pinto Beans", "113 g", "397", "95", "0.6", "0.2", "6.2", "0.1", "11.2", "6.7", "0.50", ()),
    (8, "Fajita Vegetables", "57 g", "88", "21", "1.1", "0.1", "2.1", "1.4", "0.6", "0.4", "0.40", ()),
    (9, "Barbacoa", "113 g", "644", "154", "3.8", "1.3", "1.0", "0.1", "0.8", "29.7", "0.30", ()),
    (10, "Chicken", "113 g", "774", "185", "8.4", "2.4", "1.0", "0.1", "1.0", "27.3", "2.20", ()),
    (11, "Carnitas", "113 g", "879", "210", "11.9", "3.9", "1.0", "0.1", "1.0", "25.8", "2.00", ()),
    (12, "Steak", "113 g", "690", "165", "5.5", "1.9", "1.0", "0.2", "1.0", "28.8", "2.10", ()),
    (13, "Sofritas (braised tofu)", "113 g", "351", "84", "4.6", "0.7", "3.0", "2.2", "1.2", "7.0", "1.00", ("Soya",)),
    (14, "Fresh Tomato Salsa", "113 g", "63", "15", "0.5", "0.1", "1.1", "1.5", "1.2", "0.8", "0.20", ()),
    (15, "Chilli-Corn Salsa", "113 g", "159", "38", "0.8", "0.2", "5.9", "0.9", "1.3", "1.3", "0.40", ()),
    (16, "Roasted Tomato Green-Chilli Salsa", "59 g", "25", "6", "0.1", "0.1", "1.0", "0.9", "0.4", "0.3", "0.30", ()),
    (17, "Roasted Tomato Red-Chilli Salsa", "59 g", "38", "9", "0.3", "0.1", "1.4", "0.7", "0.2", "0.3", "0.70", ()),
    (18, "Monterey Jack Cheese", "28 g", "393", "94", "7.8", "4.8", "0.1", "0", "0", "5.8", "0.50", ("Milk",)),
    (19, "Sour Cream", "57 g", "188", "45", "3.9", "2.7", "1.4", "1.1", "0.5", "0.9", "0.10", ("Milk",)),
    (20, "Guacamole (topping/side)", "113 g", "607", "145", "13.5", "2.8", "2.8", "0.8", "3.3", "1.5", "0.70", ()),
    (21, "Guacamole (large)", "226 g", "1213", "290", "27", "5.6", "5.6", "1.6", "6.6", "3", "1.40", ()),
    (22, "Romaine Lettuce (salad/topping)", "85 g", "63", "15", "0", "0", "0", "1.1", "0", "0", "0.00", ()),
    (23, "Romaine Lettuce (salad/topping)", "28 g", "17", "4", "0", "0", "0", "0.3", "0", "0", "0.00", ()),
    (24, "Chips (regular)", "113 g", "1745", "417", "21.6", "1.7", "54.1", "1.2", "0", "4.6", "1.30", ()),
    (25, "Chips (large)", "170 g", "2623", "627", "32.5", "2.6", "81", "1.8", "0", "6.9", "1.96", ()),
    (27, "Chipotle Honey Vinaigrette", "59 ml", "1084", "259", "22.9", "2.4", "13.1", "6.2", "0.5", "0.2", "2.90", ()),
]

# What we add by hand per chart row (row -> (our name, serving text, tags, note)); everything numeric comes from CHART_ROWS.
# `serving` is only set where the portion is more than a plain weight (the item page shows the weight itself): a count, a size, a volume.
# Tags: the chart has no vegetarian marking and names no meat type except "Steak" (beef), so only that one is tagged.
SPEC = {
    1: ("Flour Tortilla (burrito)", "1 tortilla", [], "Printed per 1 tortilla (95 g). Chart marks Cereals & Gluten (no cereal named)"),
    2: ("Flour Tortillas (taco, 3)", "3 tortillas", [], "Printed per 3 tortillas (75 g), not one: the AUG 2022 sheet printed 94 kcal for one, which is not what the "
                                                         "chart prints. Chart marks Cereals & Gluten (no cereal named)"),
    4: ("Coriander-Lime White Rice", "", [], ""),
    5: ("Coriander-Lime Brown Rice", "", [], "Printed kcal (185) is higher than 4P + 4C + 9F gives (about 162); the chart's kJ (774) agrees with its kcal"),
    6: ("Black Beans", "", [], "Printed kcal (95) is higher than 4P + 4C + 9F gives (about 70), which the check flags; fibre (8.6) is a separate column "
                              "and higher than carbohydrate (4.9), and at 2 kcal/g it would add about 17 kcal. The chart's kJ (397) agrees with its kcal. "
                              "Entered as printed"),
    7: ("Pinto Beans", "", [], "Printed kcal (95) is higher than 4P + 4C + 9F gives (about 57), which the check flags; fibre (11.2) is a separate column "
                              "and higher than carbohydrate (6.2), and at 2 kcal/g it would add about 22 kcal (still about 16 short). The Black Beans "
                              "row prints the same 95 kcal. The chart's kJ (397) agrees with its kcal. Entered as printed"),
    8: ("Fajita Vegetables", "", [], "Portion is 57 g (the other ingredients are 113 g)"),
    9: ("Barbacoa", "", [], "Meat type not stated, so no meat tag; salt (0.30) is far lower than the other meats (2.0-2.2). The 2026 menu card lists "
                            "Braised Beef, but the current chart still prints Barbacoa"),
    10: ("Chicken", "", [], ""),
    11: ("Carnitas", "", [], "Meat type not stated, so no meat tag"),
    12: ("Steak", "", [BEEF], ""),
    13: ("Sofritas (braised tofu)", "", [], "The chart has no vegetarian marking, so no vegetarian tag. Chart marks Soya"),
    14: ("Fresh Tomato Salsa", "", [], "Sugars (1.5) are printed higher than carbohydrate (1.1)"),
    15: ("Chilli-Corn Salsa", "", [], ""),
    16: ("Roasted Tomato Green-Chilli Salsa", "", [], "Portion is 59 g. Saturates printed as 0.1 (the AUG 2022 sheet printed <0.1; per 100 g the chart prints 0.17)"),
    17: ("Roasted Tomato Red-Chilli Salsa", "", [], "Portion is 59 g. Saturates printed as 0.1 (the AUG 2022 sheet printed <0.1; per 100 g the chart prints 0.17)"),
    18: ("Monterey Jack Cheese", "", [], "Portion is 28 g. Chart marks Milk. Named just 'Cheese' in the AUG 2022 sheet"),
    19: ("Sour Cream", "", [], "Portion is 57 g. Chart marks Milk. Fibre printed as 0.5 (the AUG 2022 sheet printed <0.5)"),
    20: ("Guacamole (topping/side)", "", [], ""),
    21: ("Guacamole (large)", "Large", [], "Every value is exactly double the topping/side row"),
    22: ("Romaine Lettuce (85 g)", "", [], "First line of the chart's 'Romaine Lettuce (salad/topping)' row. Printed with 15 kcal but 0 g protein, carbohydrate "
                                          "and fat, and sugars (1.1) higher than carbohydrate (0)"),
    23: ("Romaine Lettuce (28 g)", "", [], "Second line of the chart's 'Romaine Lettuce (salad/topping)' row. Printed with 4 kcal but 0 g protein, "
                                          "carbohydrate and fat, and sugars (0.3) higher than carbohydrate (0)"),
    24: ("Chips (regular)", "Regular", [], "Fibre printed as 0"),
    25: ("Chips (large)", "Large", [], "Portion is 170 g, 627 kcal: about 1.5 x the regular row, not double as the AUG 2022 sheet printed (834 kcal). Fibre printed as 0"),
    27: ("Chipotle Honey Vinaigrette", "59 ml", [], "Portion is a volume (59 ml); the chart prints no weight"),
}

# Rows the chart prints impossibly (a part larger than its whole): not published, never corrected. Restore by deleting the line once the
# chart is re-issued with figures that hold together.
HOLDBACK = [
    ("fresh-tomato-salsa", "The chart (UK270726) prints sugars (1.5 g) higher than carbohydrate (1.1 g); sugars are part of carbohydrate."),
    ("romaine-lettuce-85-g", "The chart (UK270726) prints 15 kcal with 0 g carbohydrate, protein and fat, and 1.1 g sugars (sugars are part of carbohydrate)."),
    ("romaine-lettuce-28-g", "The chart (UK270726) prints 4 kcal with 0 g carbohydrate, protein and fat, and 0.3 g sugars (sugars are part of carbohydrate)."),
]

NOTE = ("Chipotle UK publishes values for single ingredients only, not finished burritos or bowls, and we don't add them together. Its chart says "
        "food is prepared in open-plan kitchens where multiple allergens are present, so it cannot guarantee any item is free from specific allergens.")

WEIGHT = re.compile(r"(?:^|\()\s*(\d+(?:\.\d+)?)\s*g\s*\)?$")  # "113 g", "3 Ea (75 g)" -> grams of the whole serving; "59 ml" -> no match
NUM = re.compile(r"^\d+(?:\.\d+)?$")


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def check_table() -> None:
    """Stops on anything that suggests a mis-transcribed line (it can only be re-read by eye, so these catch typos, not misreadings)."""
    assert len(GRID) == 14 and len(GRID_KEYS) == 14 and len(set(GRID_KEYS.values())) == 14, "the allergen grid must map 14 distinct columns"
    rows = [r[0] for r in CHART_ROWS]
    assert len(set(rows)) == len(rows) and rows == sorted(rows), "chart rows must be unique and in printed order"
    assert set(rows) == set(SPEC), f"every chart row needs a SPEC line and vice versa: {sorted(set(rows) ^ set(SPEC))}"
    for row, printed, portion, kj, kcal, fat, sat, carbs, sugars, fibre, protein, salt, marks in CHART_ROWS:
        for label, v in (("kJ", kj), ("kcal", kcal), ("fat", fat), ("saturates", sat), ("carbohydrate", carbs), ("sugars", sugars),
                         ("fibre", fibre), ("protein", protein), ("salt", salt)):
            assert NUM.match(v), f"row {row} {printed!r}: {label} {v!r} is not a printed number"
        # kJ and kcal are printed side by side: a slip in one of them shows here (the chart rounds, so allow 2% or 2 kJ)
        assert abs(float(kj) - 4.184 * float(kcal)) <= max(2.0, 0.02 * float(kj)), f"row {row} {printed!r}: {kj} kJ does not fit {kcal} kcal"
        bad = [m for m in marks if m not in GRID_KEYS]
        assert not bad, f"row {row} {printed!r}: unknown allergen column {bad}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="Allergen-UK270726.pdf, downloaded from CHART_URL")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the chart")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    digest = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    if digest != CHART_SHA256:
        print(f"{args.pdf} is not the chart that CHART_ROWS was transcribed from (sha256 {digest}, expected {CHART_SHA256}). "
              "Chipotle re-issued it: re-read the table by eye (render with `pdftoppm -r 150 -png`; it has no text layer), update "
              "CHART_ROWS, SPEC, HOLDBACK and CHART_SHA256 together, then run again.", file=sys.stderr)
        return 1
    check_table()

    items = []
    for row, printed, portion, kj, kcal, fat, sat, carbs, sugars, fibre, protein, salt, marks in CHART_ROWS:
        name, serving, tags, note = SPEC[row]
        m = WEIGHT.search(portion)
        contains = {GRID_KEYS[x] for x in marks}
        items.append({
            "id": slug(name), "name": name, "category": ING, "serving": serving,
            "calories": kcal, "protein_g": protein, "carbs_g": carbs, "fat_g": fat, "sat_fat_g": sat, "sodium_mg": "", "salt_g": salt,
            "sugar_g": sugars, "fiber_g": fibre, "energy_kj": kj, "weight_g": m.group(1) if m else "",
            "tags": "|".join(sorted(tags)), "limited_time": False, "rankable": False,
            "notes": f"Chart UK270726 p1 row {row} '{printed}', portion '{portion}'. {note}".strip(),
            # The chart prints no "may contain" and names no cereal or nut: only the 14 crosses.
            "allergens": {"contains": contains, "may_contain": set(), "cereals": set(), "nuts": set()},
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    missing = [h for h, _ in HOLDBACK if h not in ids]
    assert not missing, f"holdback names items that no longer exist: {missing}"
    lacking = [i["id"] for i in items if not isinstance(i.get("allergens"), dict)]
    assert not lacking, f"every item needs its allergens from the chart: {lacking}"

    out = write_chain_folder(chain_id=CHAIN_ID, name="Chipotle", cuisine="Mexican", source_title=SOURCE_TITLE, source_url=CHART_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=HOLDBACK,
                             allergen_guide={**ALLERGEN_GUIDE, "checked_on": args.checked_on})
    if not (out / "allergens.csv").exists():
        print("allergens.csv was not written: every item must have its allergens", file=sys.stderr)
        return 1
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {out} (chart sha256 {digest})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
