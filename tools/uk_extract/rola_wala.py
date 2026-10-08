#!/usr/bin/env python3
"""Build data/source/rola-wala/ from Rola Wala's official "2024 Nutrition" PDF (calorie chart on page 2).

    python3 tools/uk_extract/rola_wala.py path/to/RLW-Nutrition-2024-v3.0.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own menu page offers under "ALLERGENS & NUTRITION - Download here"):
    https://rolawala.com/menu/  ->  https://rolawala.com/wp-content/uploads/2024/07/RLW-Nutrition-2024-v3.0.pdf
    4 pages, created 22 July 2024 (Adobe InDesign), served Last-Modified 22 July 2024; page 2 is the calorie chart, pages 3-4 the
    allergen chart. SHA-256 95d4b71c144f106464166c61c2c9377a5c5b70050e810afd2cd90c2d9885e59a (the script prints the file's own).
Needs `pdftotext` (poppler). The chart is read by word position: see rola_wala_pdf.py.

What the chart prints: for each filling (columns) and each base (blocks) one portion's Energy KCal, Fat, of which saturates,
Carbohydrates, of which sugars, Fibre, Protein and Salt. No units are printed beside the figures (grams for the seven non-energy
rows is the chart's own layout; salt is a "Salt" row, so it goes to salt_g and is never converted). The chart says its values are
"calculated using standard portion sizes", so `serving` stays blank. Per-100 g figures are not printed, nothing is converted.
Published: the five fillings that have numbers (Chicken Tikka, Butter Chicken, Nagaland Lamb, Keralan Chickpea, Red Dal) in the
three bases that have numbers (Naan Roll (plain), Spice Bowl (rice), Spice Bowl (cauli)) = 15 items.
Not published because the chart prints no numbers: Beef Masala and Paneer Tikka Masala (empty or COMING SOON in every block) and the
whole Tikka Tacos block (COMING SOON). The chart has no sides, drinks, desserts or sauces (the allergen chart lists them, the
calorie chart does not), and no Taco Pack, regular/large sizes or "Paneer Upgrade" figures.

Names are the chart's own words: "<filling> <base>". The chain's current menu page (an image, Feb 2024 hand-out) names some fillings
differently (Pulled Lamb, Chickpea Masala, Beef Brisket Masala) and has no Red Dal; whether those are the same dishes is not stated
anywhere, so the chart's names are kept and the note says so.

Allergens are link-only. The allergen chart (pages 3-4) is one row per COMPONENT (fillings, bases, garnish, sides, chutneys) and its
own notes say to "consider all components of the meal" (all meat mains also come with raita, which is dairy); it has no row for a
roll or a bowl, and which components make up each published dish is not printed. Putting a dish's allergens together from parts
would be inference, so only the guide's link is published (all or nothing). The guide prints a general cross-contamination notice
but not what may be present, so may_contain_published is "no".
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import rola_wala_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "rola-wala"
SOURCE_URL = "https://rolawala.com/wp-content/uploads/2024/07/RLW-Nutrition-2024-v3.0.pdf"
SOURCE_TITLE = "Rola Wala 2024 Nutrition calorie chart (RLW-Nutrition-2024-v3.0, PDF created 22 July 2024; still linked from its menu page)"
ALIASES = ["rola wala", "rolawala", "rola wala restaurants"]
ALLERGEN_GUIDE_TITLE = "Rola Wala Allergen Chart 2024 (pages 3-4 of RLW-Nutrition-2024-v3.0, 22 July 2024; one row per component, not per dish)"
NOTE = ("Figures are from Rola Wala's 2024 nutrition chart (July 2024), which its menu page still links. That page names some fillings "
        "differently (Pulled Lamb, Chickpea Masala) and has no Red Dal, so dishes may have changed. Beef Masala, Paneer Tikka Masala, "
        "Tikka Tacos, sides and drinks have no figures.")

# chart block -> (category, base name as printed with the filling); filling column -> name as printed (tidied capitalisation only)
BASES = {"NAAN ROLL (PLAIN)": ("Naan Rolls", "Naan Roll (plain)"),
         "SPICE BOWL (RICE)": ("Spice Bowls", "Spice Bowl (rice)"),
         "SPICE BOWL (CAULI)": ("Spice Bowls", "Spice Bowl (cauli)")}
FILLINGS = {"CHICKEN TIKKA": "Chicken Tikka", "BUTTER CHICKEN": "Butter Chicken", "NAGALAND LAMB": "Nagaland Lamb",
            "KERALAN CHICKPEA": "Keralan Chickpea", "RED DAL": "Red Dal"}
# Columns and blocks the chart leaves without numbers (checked on every run: if numbers appear, the script stops).
UNPUBLISHED_COLUMNS = ["BEEF MASALA", "PANEER TIKKA MASALA"]
UNPUBLISHED_BLOCKS = ["TIKKA TACOS"]
EXPECTED_ITEMS = 15


def build_items(cells: dict) -> list:
    items = []
    for block, (category, base) in BASES.items():
        for column, filling in FILLINGS.items():
            c = cells.get((block, column))
            if c is None:
                raise SystemExit(f"{block} / {column}: the chart no longer prints numbers for this dish")
            items.append(dict(name=f"{filling} {base}", category=category, calories=c["calories"], protein_g=c["protein_g"],
                              carbs_g=c["carbs_g"], fat_g=c["fat_g"], sat_fat_g=c["sat_fat_g"], sugar_g=c["sugar_g"],
                              fiber_g=c["fiber_g"], salt_g=c["salt_g"], rankable=True,
                              notes=f"Chart block {block}, column {column}; chart prints no units; 'standard portion sizes'"))
    printed = {k for k in cells}
    allowed = {(b, c) for b in BASES for c in FILLINGS}
    extra = sorted(printed - allowed)
    if extra:
        raise SystemExit(f"The chart now prints numbers for {extra}: add them to BASES / FILLINGS after reading them")
    for col in UNPUBLISHED_COLUMNS:
        if any(k[1] == col for k in cells):
            raise SystemExit(f"{col} now has numbers on the chart: publish it")
    for blk in UNPUBLISHED_BLOCKS:
        if any(k[0] == blk for k in cells):
            raise SystemExit(f"{blk} now has numbers on the chart: publish it")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the nutrition PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    cells, facts = pdf_reader.read_chart(args.pdf, page=2)
    for f in facts:
        print("chart says: " + f)
    items = build_items(cells)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Rola Wala", cuisine="Indian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide)
    print(f"wrote {len(items)} items to {out}")


if __name__ == "__main__":
    main()
