#!/usr/bin/env python3
"""Build data/source/burger-and-sauce/ from Burger & Sauce's own "Calorie Count" PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/burger_and_sauce.py path/to/calorie-count.pdf --checked-on 2026-10-09 [--allergen-pdf path/to/allergens.pdf] [--out DIR]

Sources (both linked from the chain's own menu page https://burgerandsauce.com/menu/ on 2026-10-09, buttons "Calorie Count PDF" and
"ALLERGENS PDF"; robots.txt there only disallows /wp-admin/):
    calorie sheet : https://burgerandsauce.com/wp-content/uploads/2025/03/carlorie-count-12-03-25.pdf
                    one A4 page with a text layer, PDF created 12 March 2025 (artwork ref "A. 31.10.24"), server Last-Modified 29 Nov 2025
    allergen sheet: https://burgerandsauce.com/wp-content/uploads/2025/12/Allergen-sheet-2025-1.pdf
                    two pages, "LAST UPDATED: DEC - 2025"
Needs `pdftotext` (poppler). Python 3.9 compatible.

The calorie sheet prints, for each of 43 products, "NNN kcal (NNNN kJ) per serving" and nothing else (the footer says "All portion sizes
listed are based on a serving for one person"): protein, carbs and fat are never printed, so they stay blank (docs/DATA.md "Calories-only
chains"; every item is then not rankable). kcal and kJ are copied as printed. Only names (tidied from capitals), categories and portion
wording are written by hand, in ITEMS below: the script stops if the products printed on the sheet differ from this table.

Names: capitals are tidied; the sheet's two spelling slips are corrected in the NAME only ("FERERRO ROCHER", "BLUE LEMONDADE"); the printed
text is kept in each row's notes. "PORTION 5" / "PORTION OF 4" is moved to `serving`. Categories are the chain's own menu groups where its
menu page shows them (Burgers, Wraps, Wings, Loaded sides, Bites & snacks, Desserts, Refresher drinks), simplified by the item's name.
Tags: contains_beef only where the printed NAME says beef (The Original Beef Burger, Beef Nacho, Club Beef); vegetarian is never tagged
because the sheet marks nothing. Items whose meat is not in their name are listed in the run output as "meat type not stated".

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. The Dec 2025 allergen matrix names its rows differently from the calorie sheet and
does not have a row for every product: "Beef Burger" / "Chicken Burger" / "Veggi Burger" for THE ORIGINAL ... BURGER, "Chicken Wings" for the
four wing flavours, "Chicken Strips" for STRIPS, "Fries" for REGULAR FRIES, "The Beef Nacho Melt" for BEEF NACHO (and nothing for ANGUS NACHO),
"Classic Sauce" and "Spicy Sauce" for the one CLASSIC/SPICY SAUCE value, "Chocolate Oreo Creamysu" for CHOCOLATE OREO, and no row at all for the
five drinks, BBQ SAUCE, CHEESE DIP, KIDS CHICKEN BITES MEAL. Allergens are safety information: no name matching, no guessing, so only the
guide's link is published (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "burger-and-sauce"
SOURCE_URL = "https://burgerandsauce.com/wp-content/uploads/2025/03/carlorie-count-12-03-25.pdf"
SOURCE_TITLE = "Burger & Sauce Calorie Count (PDF created 12 March 2025, artwork ref A. 31.10.24; linked from the chain's menu page)"
ALLERGEN_GUIDE_TITLE = "Burger & Sauce Allergens & Intolerances sheet (last updated Dec 2025, 2 pages)"
ALLERGEN_GUIDE_URL = "https://burgerandsauce.com/wp-content/uploads/2025/12/Allergen-sheet-2025-1.pdf"
# The allergen sheet marks "MAY CONTAIN" with its own dots and says some products may be cooked in the same oil.
MAY_CONTAIN_PUBLISHED = True
ALIASES = ["burger and sauce", "burger & sauce", "burger&sauce"]
NOTE = ("Calories and kJ only, per serving for one person, from the chain's Calorie Count sheet dated 12 March 2025 (the chain still "
        "links it). The menu may have changed since, and seasonal items (Festive Burger, Ferrero Rocher) may be off it.")
EXPECTED_ITEMS = 43

BUR, WRA, WIN, NAC, FRI, BIT, KID, SAU, DES, DRI = ("Burgers", "Wraps", "Wings and strips", "Nachos", "Fries", "Bites & snacks",
                                                    "Kids", "Sauces & dips", "Desserts", "Refresher drinks")
# printed name -> (name, category, serving, extra note)
ITEMS = {
    "ANGUS NACHO": ("Angus Nacho", NAC, "", ""),
    "ANGUS STACK": ("Angus Stack", BUR, "", ""),
    "ANIMAL FRIES": ("Animal Fries", FRI, "", ""),
    "ANIMAL NACHOS": ("Animal Nachos", NAC, "", ""),
    "ATLANTIC COD BURGER": ("Atlantic Cod Burger", BUR, "", ""),
    "BBQ SAUCE": ("BBQ Sauce", SAU, "", ""),
    "THE ORIGINAL BEEF BURGER": ("The Original Beef Burger", BUR, "", ""),
    "BEEF NACHO": ("Beef Nacho", NAC, "", ""),
    "BLUE LEMONDADE": ("Blue Lemonade", DRI, "", "the sheet prints 'LEMONDADE'"),
    "CHEESE DIP": ("Cheese Dip", SAU, "", ""),
    "THE ORIGINAL CHICKEN BURGER": ("The Original Chicken Burger", BUR, "", ""),
    "CHICKEN & CHEESE FRIES": ("Chicken & Cheese Fries", FRI, "", ""),
    "CHILLI CHEESE BITES PORTION OF 4": ("Chilli Cheese Bites", BIT, "Portion of 4", ""),
    "CHOCOLATE OREO": ("Chocolate Oreo", DES, "", ""),
    "CLASSIC/SPICY SAUCE": ("Classic/Spicy Sauce", SAU, "", "one value is printed for the two sauces"),
    "CLUB BEEF": ("Club Beef", BUR, "", ""),
    "CLUB CHICKEN": ("Club Chicken", BUR, "", ""),
    "COD STICKS PORTION OF 3": ("Cod Sticks", BIT, "Portion of 3", ""),
    "EVERYTHING’S BETTER WITH MANGO": ("Everything's Better With Mango", DRI, "", ""),
    "FERERRO ROCHER": ("Ferrero Rocher", DES, "", "the sheet prints 'FERERRO'"),
    "FESTIVE BURGER": ("Festive Burger", BUR, "", "name suggests a seasonal item; the sheet does not label it limited-time"),
    "FIRE FRIES": ("Fire Fries", FRI, "", ""),
    "FIERY LEGEND": ("Fiery Legend", BUR, "", ""),
    "FIERY HOT WINGS PORTION 5": ("Fiery Hot Wings", WIN, "Portion of 5", ""),
    "HASH BROWN PORTION OF 2": ("Hash Brown", BIT, "Portion of 2", ""),
    "KIDS CHICKEN BITES": ("Kids Chicken Bites", KID, "", ""),
    "KIDS CHICKEN BITES MEAL": ("Kids Chicken Bites Meal", KID, "", "a meal: the sheet does not say what it includes"),
    "LEMON PEPPER WINGS PORTION 5": ("Lemon Pepper Wings", WIN, "Portion of 5", ""),
    "LOTUS BISCOFF": ("Lotus Biscoff", DES, "", ""),
    "MEXICAN NACHOS": ("Mexican Nachos", NAC, "", ""),
    "MOZZARELLA STICKS PORTION OF 3": ("Mozzarella Sticks", BIT, "Portion of 3", ""),
    "ONION RINGS PORTION OF 4": ("Onion Rings", BIT, "Portion of 4", ""),
    "PLAIN WINGS PORTION 5": ("Plain Wings", WIN, "Portion of 5", ""),
    "REGULAR FRIES": ("Regular Fries", FRI, "", ""),
    "ROSE LEMONADE": ("Rose Lemonade", DRI, "", ""),
    "SIGNATURE FRIES": ("Signature Fries", FRI, "", ""),
    "SIGNATURE STRIPS": ("Signature Strips", WIN, "", ""),
    "SMOKING HOT BBQ WINGS PORTION 5": ("Smoking Hot BBQ Wings", WIN, "Portion of 5", ""),
    "STRAWBERRY SUNRISE": ("Strawberry Sunrise", DRI, "", ""),
    "STRIPS": ("Strips", WIN, "", ""),
    "THE WRAP": ("The Wrap", WRA, "", "one value for The Wrap; the chain's menu page shows four sauce versions"),
    "THE ORIGINAL VEGGIE BURGER": ("The Original Veggie Burger", BUR, "", ""),
    "WHEN APPLE WAS JUST A FRUIT": ("When Apple Was Just a Fruit", DRI, "", ""),
}
CATEGORY_ORDER = [BUR, WRA, NAC, FRI, WIN, BIT, KID, SAU, DES, DRI]
BEEF = re.compile(r"\bbeef\b", re.I)
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
# Items whose name does not say what meat they hold (composite dishes): listed for the report, never tagged.
NAME_NO_MEAT = {"Angus Nacho", "Angus Stack", "Animal Fries", "Animal Nachos", "Festive Burger", "Fiery Legend", "Mexican Nachos",
                "Signature Fries", "The Wrap", "Kids Chicken Bites Meal"}
LINE = re.compile(r"^(\d+)\s*kcal\s*\((\d+)\s*kJ\)\s*per serving$")
FOOTER = {"CUSTOMER INFORMATION", "A.31.10.24", "CALORIE COUNT", "WWW.BURGERANDSAUCE.COM", "ALL PORTION SIZES LISTED",
          "ARE BASED ON A SERVING", "FOR ONE PERSON"}


def read_sheet(pdf: Path) -> list:
    """(printed name, kcal, kJ) in reading order, numbers as printed. `pdftotext -raw` prints each name and then its value line."""
    text = subprocess.run(["pdftotext", "-raw", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out, name = [], None
    for ln in lines:
        if ln in FOOTER:
            continue
        m = LINE.match(ln)
        if m:
            if name is None:
                raise SystemExit(f"A value line {ln!r} has no product name before it: the layout changed")
            out.append((name, m.group(1), m.group(2)))
            name = None
        else:
            if name is not None:
                raise SystemExit(f"Product {name!r} has no 'NNN kcal (NNNN kJ) per serving' line (next text {ln!r}): the layout changed")
            name = ln
    if name is not None:
        raise SystemExit(f"Product {name!r} has no value line: the layout changed")
    return out


def build_items(rows: list) -> tuple:
    printed = [r[0] for r in rows]
    if len(set(printed)) != len(printed):
        raise SystemExit("A product is printed twice on the sheet: check the layout")
    new, gone = sorted(set(printed) - set(ITEMS)), sorted(set(ITEMS) - set(printed))
    if new or gone:
        raise SystemExit(f"The calorie sheet changed. Printed but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. "
                         "Update ITEMS (names, categories) after reading the new sheet.")
    if len(rows) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} products, read {len(rows)}")
    items, report = [], []
    for printed_name, kcal, kj in rows:
        name, category, serving, extra = ITEMS[printed_name]
        tags = []
        if BEEF.search(name):
            tags.append("contains_beef")
        if PORK.search(name):
            tags.append("contains_pork")
        if name in NAME_NO_MEAT:
            report.append(f"meat type not stated: {name}")
        notes = f"Printed '{printed_name}: {kcal} kcal ({kj} kJ) per serving'" + (f"; {extra}" if extra else "")
        items.append(dict(name=name, category=category, serving=serving, calories=kcal, energy_kj=kj, tags="|".join(tags),
                          rankable=False, notes=notes))
        ratio = int(kj) / int(kcal)
        if not 4.0 <= ratio <= 4.35:
            report.append(f"kJ/kcal check: {name} {kj} kJ vs {kcal} kcal = {ratio:.2f} (expected about 4.18)")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    return items, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the calorie sheet PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--allergen-pdf", type=Path, help="the allergen sheet PDF (only to print its SHA-256)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"calorie sheet sha256 {sha256_file(args.pdf)}  {args.pdf}")
    if args.allergen_pdf:
        print(f"allergen sheet sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    items, report = build_items(read_sheet(args.pdf))
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Burger & Sauce", cuisine="Burgers", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("\n".join(report))


if __name__ == "__main__":
    main()
