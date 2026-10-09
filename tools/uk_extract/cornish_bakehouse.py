#!/usr/bin/env python3
"""Build data/source/cornish-bakehouse/ from Cornish Bakehouse's own "Pasty & Savoury Allergen Information" PDF
(a CALORIES-ONLY chain with a COMPLETE allergen grid; not the same business as Cornish Bakery).

    python3 tools/uk_extract/cornish_bakehouse.py path/to/Pasty-Savouries-Allergens.pdf --checked-on 2026-10-09 [--out DIR]

Source: the chain's own page https://www.cornish-bakehouse.com/allergens, link "Pasty & Savoury Allergen Information - Click here":
    https://www.cornish-bakehouse.com/s/Pasty-Savouries-Allergens.pdf  (HTTP 302 -> static1.squarespace.com/static/.../Pasty+%26+Savouries+Allergens.pdf,
    uploaded 21 April 2026; the PDF's own footer says "Updated 27 January 2025"). Two A4 pages with a text layer.
    robots.txt on cornish-bakehouse.com disallows only /config, /search, /account, /api/, /static/ and some query strings (the PDF is under
    /s/); the redirect target's host (static1.squarespace.com) answers 404 to /robots.txt, i.e. no rules.
Needs `pdftotext` (poppler). The table is read by word position: see cornish_bakehouse_pdf.py. Python 3.9 compatible.

What the sheet prints: per product a "Calories" number (no unit and no weight is printed; a pasty's value fits kcal, and the sizes of one
product differ - small, medium, large and giant steak pasty, medium and large sausage roll - so each is per product, not per 100 g) and
14 allergen columns (tick = contains, M = may contain). No protein, carbs, fat or any other nutrient, so this is a calories-only chain:
protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"). Calories are copied exactly as printed.

Allergens (docs/DATA.md "Allergens"): the nutrition number and the allergen marks are in the SAME table row, so every published product ties
exactly to its row. Marks are copied by position, never typed; the column headers are checked on every run. The gluten column reads
"Cereals containing Gluten eg Wheat": the cereal is an example, not a named cereal, so no specific cereal is stored. "Nuts" is stored as
the generic tree-nut allergen.

Names: copied from the sheet with its trailing "*" removed (the sheet never says what the asterisk means) and capitalisation tidied.
Categories are by the product's own name (Pasties, Slices, Bites, Sausage rolls): the sheet has no section headings.
Tags: contains_pork for bacon, sausage, pork, chorizo in the NAME; contains_beef for steak, beef in the NAME; vegetarian only for the two
products the sheet itself calls Vegan (Vegan Thai Pasty, Vegan Sausage Roll). limited_time only for the Christmas Sausage Roll (its name).

Not published (each exclusion is also printed on every run):
- "Ovex Glaze": an ingredient row with a milk mark and no calories.
- "Heavy Cake (Portreath Bakery)": a bought-in cake with one size only; the sheet prints no basis and a heavy cake's per-100 g value could be of the
  same size as 459, so per piece cannot be told from per 100 g (the chain's separate Cakes sheet prints per 100 g only). Not published.
The other sheets on the chain's page (Cakes and Recipe Items, both dated 25 January 2023, and Cold Drinks & Crisps) are not used: the cakes
sheet prints per 100 g only and the drinks sheet has an empty calorie column.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cornish_bakehouse_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "cornish-bakehouse"
SOURCE_URL = "https://www.cornish-bakehouse.com/s/Pasty-Savouries-Allergens.pdf"
SOURCE_TITLE = ("Cornish Bakehouse Product Allergen Specifications, Pasty & Savouries "
                "(footer: Updated 27 January 2025; PDF file uploaded 21 April 2026)")
ALLERGEN_GUIDE_TITLE = "Cornish Bakehouse Product Allergen Specifications, Pasty & Savouries (updated 27 January 2025)"
MAY_CONTAIN_PUBLISHED = True  # "M = May Contain" is printed under the table
ALIASES = ["cornish bakehouse", "the cornish bakehouse"]
NOTE = ("Calories only, one value per product (the sheet prints no weights or units; the column 'Calories' is read as kcal), from the chain's "
        "Pasty & Savouries sheet marked 'Updated 27 January 2025'. Cakes, recipe items and drinks are not listed: their sheets give per "
        "100 g only or no calories.")
EXPECTED_PRODUCTS = 36            # rows with calories on the two pages, before exclusions
EXCLUDED = {
    "Heavy Cake (Portreath Bakery)": "bought-in cake, one size, no basis printed: per piece cannot be told from per 100 g",
}
PAS, SLI, BIT, ROL = "Pasties", "Slices", "Bites", "Sausage rolls"
# printed name without its trailing asterisk -> (name, category). Tags come from the name (rules in the docstring).
ITEMS = {
    "Small Steak Pasty": ("Small Steak Pasty", PAS),
    "Medium Steak Pasty": ("Medium Steak Pasty", PAS),
    "Large Steak Pasty": ("Large Steak Pasty", PAS),
    "Giant Steak Pasty": ("Giant Steak Pasty", PAS),
    "Beef and Stilton Pasty (Large)": ("Beef and Stilton Pasty (Large)", PAS),
    "Cheese and Bacon Pasty": ("Cheese and Bacon Pasty", PAS),
    "Steak and Ale Pasty (Large)": ("Steak and Ale Pasty (Large)", PAS),
    "Lamb and Mint Pasty": ("Lamb and Mint Pasty", PAS),
    "Chicken and Leek Pasty": ("Chicken and Leek Pasty", PAS),
    "Cheese and Onion Pasty": ("Cheese and Onion Pasty", PAS),
    "Spicy Mediterranean Vegetable": ("Spicy Mediterranean Vegetable", PAS),
    "Vegetable Pasty": ("Vegetable Pasty", PAS),
    "Broccoli Cheese and Sweetcorn Pasty": ("Broccoli Cheese and Sweetcorn Pasty", PAS),
    "Chicken and Mushroom Pasty": ("Chicken and Mushroom Pasty", PAS),
    "Spinach and Ricotta Pasty": ("Spinach and Ricotta Pasty", PAS),
    "Chicken Chorizo Bacon Pasty": ("Chicken Chorizo Bacon Pasty", PAS),
    "Chicken and Bacon Pasty": ("Chicken and Bacon Pasty", PAS),
    "Red Thai Chicken Pasty": ("Red Thai Chicken Pasty", PAS),
    "Turkey and Cranberry Pasty": ("Turkey and Cranberry Pasty", PAS),
    "Chicken and Mushroom Slice": ("Chicken and Mushroom Slice", SLI),
    "Chicken Jalfrezi Slice": ("Chicken Jalfrezi Slice", SLI),
    "Steak Slice": ("Steak Slice", SLI),
    "Cheese and Onion Slice": ("Cheese and Onion Slice", SLI),
    "Vegan Thai Pasty": ("Vegan Thai Pasty", PAS),
    "Bacon and Cheese Bite": ("Bacon and Cheese Bite", BIT),
    "Sausage and Cheese Bite": ("Sausage and Cheese Bite", BIT),
    "Medium Sausage Roll": ("Medium Sausage Roll", ROL),
    "Large Sausage Roll": ("Large Sausage Roll", ROL),
    "Vegan Sausage Roll": ("Vegan Sausage Roll", ROL),
    "Bacon, Brie and Cranberry Bite": ("Bacon, Brie and Cranberry Bite", BIT),
    "Christmas Sausage Roll": ("Christmas Sausage Roll", ROL),
    "Sweet Chilli pork Gourmet Sausage Roll": ("Sweet Chilli Pork Gourmet Sausage Roll", ROL),
    "Pork Apple Cider Gourmet Sausage Roll": ("Pork Apple Cider Gourmet Sausage Roll", ROL),
    "Cheese & Chutney Gourmet Sausage Roll": ("Cheese & Chutney Gourmet Sausage Roll", ROL),
    "Corned Beef Pasty (Bako)": ("Corned Beef Pasty (Bako)", PAS),
}
CATEGORY_ORDER = [PAS, SLI, BIT, ROL]
PORK = re.compile(r"\b(bacon|sausage|pork|chorizo|ham)\b", re.I)
BEEF = re.compile(r"\b(steak|beef)\b", re.I)


def norm(printed: str) -> str:
    return re.sub(r"\s*\*\s*$", "", printed).strip()


def build_items(rows: list) -> tuple:
    if len(rows) != EXPECTED_PRODUCTS:
        raise SystemExit(f"Read {len(rows)} products with calories, expected {EXPECTED_PRODUCTS}: the sheet changed, re-check ITEMS")
    printed = [norm(r["name"]) for r in rows]
    if len(set(printed)) != len(printed):
        raise SystemExit("A product is printed twice: check the layout")
    known = set(ITEMS) | set(EXCLUDED)
    new, gone = sorted(set(printed) - known), sorted(known - set(printed))
    if new or gone:
        raise SystemExit(f"The sheet changed. Printed but not in ITEMS/EXCLUDED: {new}. In ITEMS/EXCLUDED but no longer printed: {gone}.")
    items, report = [], []
    for r in rows:
        p = norm(r["name"])
        if p in EXCLUDED:
            report.append(f"not published: {p!r} ({r['calories']}): {EXCLUDED[p]}")
            continue
        name, category = ITEMS[p]
        tags = []
        vegan = bool(re.search(r"\bvegan\b", name, re.I))
        if vegan:
            tags.append("vegetarian")
        if not vegan and PORK.search(name):
            tags.append("contains_pork")
        if not vegan and BEEF.search(name):
            tags.append("contains_beef")
        allergens = {"contains": set(r["contains"]), "may_contain": set(r["may_contain"]), "cereals": set(), "nuts": set()}
        notes = f"Printed '{r['name']}' on page {r['page']}"
        if name.startswith("Corned Beef Pasty (Bako)"):
            notes += "; named for its supplier on the sheet"
        if name == "Christmas Sausage Roll":
            notes += "; seasonal by its name (the sheet does not label it)"
        items.append(dict(name=name, category=category, serving="", calories=r["calories"], tags="|".join(tags), rankable=False,
                          limited_time=(name == "Christmas Sausage Roll"), notes=notes, allergens=allergens))
    report.append("not published: 'Ovex Glaze' (ingredient row, no calories; one milk mark)")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    return items, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the Pasty & Savouries PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    items, report = build_items(pdf_reader.read_products(args.pdf))
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Cornish Bakehouse", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("\n".join(report))


if __name__ == "__main__":
    main()
