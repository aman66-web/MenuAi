#!/usr/bin/env python3
"""Build data/source/blank-street-coffee/ from Blank Street's official UK allergen guide (a CALORIES-ONLY chain).

    python3 tools/uk_extract/blank_street_coffee.py path/to/BlankStreetUKAllergenGuideAutumn26.pdf --checked-on 2026-10-08 [--out DIR]

Source (the "Allergens" link of the chain's UK menu page https://www.blankstreet.com/en-GB/menu):
    https://www.blankstreet.com/en-GB/BlankStreetUKAllergenGuideAutumn26.pdf
    HTTP 200, 1,129,343 bytes, PDF created 2026-08-21 (served Last-Modified 2026-10-01), 18 A4 pages with a text layer.
    robots.txt of www.blankstreet.com answers 404 (no restrictions). Needs `pdftotext` (poppler); the pages are read by
    column: see blank_street_coffee_pdf.py.
The US site (/en-US) is a different menu and is not used.

The guide prints CALORIES ONLY ("120 kcal"): protein, carbs, fat, salt and every other nutrient are never printed, so they stay blank
(docs/DATA.md "Calories-only chains": every item is then not rankable and the app shows "not published"). Calories are copied from
the PDF as printed by blank_street_coffee_pdf.py; only item names, categories and tags are built here, by fixed rules below. The run
stops if the number of products, the products per section or the items built differ from EXPECTED_*, so a human re-checks the
mapping when Blank Street publishes a new guide.

How the guide's wording is read:
- Drinks: one product line prints its calories per size ("S - 120 | L - 199 kcal") and, where it says so, per temperature ("Hot | ...",
  "Iced | ..."; "Hot/Iced - 80 kcal" is one figure for both). One item per printed figure: "Latte (hot, small)". S and L are shown as
  Small and Large. A figure printed for "Hot/Iced" is one item "(hot or iced)". The guide prints ONE figure per drink and size
  and does not say which milk (dairy or oat drink) it assumes: both milks are listed under the same figure, so no milk is named.
- Pastries differ by city: the guide has a London list and a list for Manchester, Birmingham, Scotland, Leeds, Cambridge, Bristol and
  Brighton, with different recipes and figures for the same name (Plain Croissant 325 / 291 / 448 / 360 / 556 kcal ...). Each is its
  own item with the city in its name and its own category; nothing is merged.
- Custom: ice creams, shells and dustings for the build-your-own ice cream are listed as printed (each has its own figure).
- Page 8 (sub-ingredients such as syrups, with no calories) is not read.
- "NEW" after Cinnamon Bun is a menu marker, not a limited-time flag, so limited_time stays false.
- Tags: vegetarian when EVERY ingredient block of the product (dairy and oat version for drinks) carries the guide's own word
  "Vegetarian" or "Vegan". contains_pork / contains_beef when the name or the printed ingredients say so (none do: no meat is sold).

Allergens (docs/DATA.md "Allergens") are link-only. The guide declares allergens inside each ingredient list (printed in capitals,
plus a "May Contain" line) and does it twice for every drink (a "With DAIRY" and a "With OAT" version) while printing one calorie
figure, so an item's allergens cannot be stated exactly: there is no per-allergen table, and picking one milk or merging the two would
be a guess. Allergens are safety information: no inference from ingredient text, so only the guide's link is published (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import blank_street_coffee_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "blank-street-coffee"
SOURCE_URL = "https://www.blankstreet.com/en-GB/BlankStreetUKAllergenGuideAutumn26.pdf"
SOURCE_TITLE = "Blank Street UK Allergen Guide, Autumn 2026 (PDF created 21 August 2026)"
ALIASES = ["blank street", "blank street coffee"]
ALLERGEN_GUIDE_TITLE = "Blank Street UK Allergen Guide, Autumn 2026 (18 pages)"
ALLERGEN_GUIDE_URL = SOURCE_URL
MAY_CONTAIN_PUBLISHED = True  # every product has a "May Contain - ..." line
NOTE = ("Blank Street prints calories only. Each drink has one figure per size and the guide does not say which milk (dairy or oat) "
        "it assumes. Pastries are listed by city because the guide gives each city its own range and figures. S and L are shown as "
        "Small and Large.")

EXPECTED_PRODUCTS = 127
EXPECTED_ITEMS = 178
EXPECTED_PER_SECTION = {
    "COFFEE": 9, "NOT COFFEE & TEAS": 11, "COLD BREW": 4, "MATCHAS": 14, "HOUSE LATTES": 8, "SIGNATURE ICE CREAM": 4, "CUSTOM": 12,
    "PASTRIES - LONDON STORES": 8, "MANCHESTER PASTRIES & SAVOURIES": 7, "BIRMINGHAM PASTRIES & SAVOURIES": 9,
    "SCOTLAND PASTRIES & SWEETS": 8, "LEEDS PASTRIES & SWEETS": 10, "CAMBRIDGE PASTRIES & SWEETS": 8,
    "BRISTOL PASTRIES & SWEETS": 7, "BRIGHTON PASTRIES & SWEETS": 8,
}
# Section heading as printed -> (category shown in the app, city for the pastry sections).
CATEGORIES = {
    "COFFEE": ("Coffee", ""), "NOT COFFEE & TEAS": ("Not coffee & teas", ""), "COLD BREW": ("Cold brew", ""),
    "MATCHAS": ("Matchas", ""), "HOUSE LATTES": ("House lattes", ""), "SIGNATURE ICE CREAM": ("Signature ice cream", ""),
    "CUSTOM": ("Custom", ""),
    "PASTRIES - LONDON STORES": ("Pastries, London", "London"),
    "MANCHESTER PASTRIES & SAVOURIES": ("Pastries & savouries, Manchester", "Manchester"),
    "BIRMINGHAM PASTRIES & SAVOURIES": ("Pastries & savouries, Birmingham", "Birmingham"),
    "SCOTLAND PASTRIES & SWEETS": ("Pastries & sweets, Scotland", "Scotland"),
    "LEEDS PASTRIES & SWEETS": ("Pastries & sweets, Leeds", "Leeds"),
    "CAMBRIDGE PASTRIES & SWEETS": ("Pastries & sweets, Cambridge", "Cambridge"),
    "BRISTOL PASTRIES & SWEETS": ("Pastries & sweets, Bristol", "Bristol"),
    "BRIGHTON PASTRIES & SWEETS": ("Pastries & sweets, Brighton", "Brighton"),
}
# Printed product name -> (name used, qualifiers shown in the brackets, temperature taken from the name, note).
# Every other printed name is used as printed. Names with brackets, " - HOT" or "Hot/Iced" that are not listed stop the run.
NAME_FIX = {
    "Americano (BLACK)": ("Americano", ["black"], "", ""),
    "Double Espresso (BLACK)": ("Double Espresso", ["black"], "", ""),
    "Original Cold Brew (DEFAULT BLACK)": ("Original Cold Brew", ["default black"], "", ""),
    "Mocha (Dark Chocolate Sauce)": ("Mocha", ["dark chocolate sauce"], "", ""),
    "Mocha (White Chocolate Sauce)": ("Mocha", ["white chocolate sauce"], "", ""),
    "Hot/Iced Chocolate": ("Chocolate", [], "", "Printed 'Hot/Iced Chocolate' with separate hot and iced figures"),
    "Earl Grey - HOT": ("Earl Grey", [], "hot", ""),
    "Chamomile - HOT": ("Chamomile", [], "hot", ""),
    "Green Tea - HOT": ("Green Tea", [], "hot", ""),
    "English Breakfast - HOT": ("English Breakfast", [], "hot", ""),
    "Cinnamon Bun (NEW)": ("Cinnamon Bun", [], "", "Marked NEW in the guide"),
    "Plan Croissant": ("Plain Croissant", [], "", "Printed 'Plan Croissant' (Manchester list); read as a typo for Plain Croissant"),
}
# The four signature ice creams share names with drinks: their category is not part of an item's name, so they get a suffix.
SIGNATURE_SUFFIX = {"White Chocolate Matcha", "Strawberry Shortcake Matcha", "Mocha"}
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
ODD = re.compile(r"\(|\s-\s|Hot/Iced")

# Notes for figures that look odd but are printed so (not exported; also listed in the report).
EXTRA_NOTES = {
    ("HOUSE LATTES", "Iced Blondie Latte"): "The guide prints 'S - 207 | L - 227' without the unit kcal; read as kcal like every other line",
    ("HOUSE LATTES", "Pistachio Latte"): "Hot and iced are printed with identical figures (197 small, 256 large)",
    ("MATCHAS", "White Chocolate Matcha"): "Hot and iced large are both printed 152",
}


def build_items(products: list[dict]) -> list[dict]:
    if len(products) != EXPECTED_PRODUCTS:
        raise SystemExit(f"{len(products)} products read, expected {EXPECTED_PRODUCTS}: the guide changed, re-check the mapping")
    per = {}
    for p in products:
        per[p["section"]] = per.get(p["section"], 0) + 1
    if per != EXPECTED_PER_SECTION:
        raise SystemExit(f"Products per section changed: now {per}, expected {EXPECTED_PER_SECTION}")
    items = []
    for p in products:
        category, city = CATEGORIES[p["section"]]
        printed = p["name"]
        if printed in NAME_FIX:
            base, quals, name_temp, fix_note = NAME_FIX[printed]
        else:
            if ODD.search(printed):
                raise SystemExit(f"Product name {printed!r} has a bracket, ' - ' or 'Hot/Iced' and is not in NAME_FIX: add it after reading the page")
            base, quals, name_temp, fix_note = printed, [], "", ""
        if p["section"] == "SIGNATURE ICE CREAM" and base in SIGNATURE_SUFFIX:
            base += " (signature ice cream)"
        veg = all(m & {"Vegan", "Vegetarian"} for m in p["marks"])
        text = printed + " " + " ".join(p["variants"])
        tags = (["vegetarian"] if veg else []) + (["contains_pork"] if PORK.search(text) else []) + (["contains_beef"] if BEEF.search(text) else [])
        for k in p["kcal"]:
            temp = {"hot/iced": "hot or iced", "hot": "hot", "iced": "iced", "": name_temp}[k["temp"]]
            sizes = [("", k["n"])] if k["n"] is not None else [("Small", k["s"]), ("Large", k["l"])]
            for size, value in sizes:
                parts = quals + ([temp] if temp else []) + ([size.lower()] if size else []) + ([city] if city else [])
                name = base + (f" ({', '.join(parts)})" if parts else "")
                notes = [f"Printed '{printed}' / '{k['printed']}'"]
                if fix_note:
                    notes.append(fix_note)
                if p["variants"][0].startswith("With DAIRY:"):
                    notes.append("one figure for the dairy and the oat version; milk behind the figure not stated")
                if (p["section"], printed) in EXTRA_NOTES:
                    notes.append(EXTRA_NOTES[(p["section"], printed)])
                items.append(dict(name=name, category=category, serving=size, calories=value, tags="|".join(tags), rankable=False,
                                  limited_time=False, notes="; ".join(notes)))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the guide changed, re-check the mapping")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        dup = sorted({n for n in names if names.count(n) > 1})
        raise SystemExit(f"Item names are not unique: {dup}")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the allergen guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"guide PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    products = pdf_reader.read_products(args.pdf)
    items = build_items(products)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Blank Street", cuisine="Coffee", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    cats = []
    for i in items:
        if i["category"] not in cats:
            cats.append(i["category"])
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {sum(1 for i in items if i['category'] == c)}" for c in cats))


if __name__ == "__main__":
    main()
