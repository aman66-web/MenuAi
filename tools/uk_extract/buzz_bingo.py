#!/usr/bin/env python3
"""Build data/source/buzz-bingo/ from Buzz Bingo's official "Kcal June 2025" PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/buzz_bingo.py path/to/kcal-info-june25.pdf --checked-on 2026-10-08 [--out DIR]

Source (one download):
    https://www.buzzbingo.com/library/Clubs/food-and-drink/kcal-info-june25.pdf
    Title "Kcal June 2025", 5 A4 pages exported from Microsoft Excel, PDF created 15 June 2025, 133,236 bytes. robots.txt of
    www.buzzbingo.com allows /library/. The page the menu's own QR code opens (https://www.buzzbingo.com/clubs/food-and-drink,
    "Scan for calorie and allergen information") is a JavaScript app that does not render without the platform's launcher script.
Needs `pdftotext` (poppler). The pages are read by position: see buzz_bingo_pdf.py.

The PDF prints ONE number per item: "Energy (Kcal)". Protein, carbs, fat, salt, sugar etc. are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published"). Calories are copied
from the PDF as printed. Only item NAMES, categories and tags are written by hand, in SECTIONS below: the script stops if the
sections, names or number of rows printed differ from that table, so a human re-checks it when Buzz Bingo reissues the sheet.

How the sheet's own wording is read:
- Names are kept as printed, including the sheet's own brackets ("Classic Beef Burger (inc all ingredients & Mayo)"), which say what
  the number covers. A name printed in more than one section ("Baked Beans", "Cheese", "Chips"...) keeps its words and gets the
  section in brackets so every name is unique ("Cheese (jacket potato)", "Cheese (sides)"): the figures are NOT merged or compared.
- "16oz Diet Pepsi" is shown as "Diet Pepsi (16oz)" with serving "16oz" (the size the sheet prints). "RW Lemonade" is left as printed.
- No serving is printed for any other item ("per item as sold"), so `serving` stays blank.
- Main meals are "main ingredient only - all accompaniments listed separately" and baskets / Fiver Faves list their sauce choice
  separately: the number is for the item as named, not a whole plate. The category keeps that wording.
- Tags: vegetarian when the sheet's own item name says Vegan or Veggie. contains_pork when the name says bacon, sausage(s) or
  pepperoni (not for vegan items). contains_beef when the name says beef. Nothing else is inferred: Lorne sausage, Uncle Johns hot dog
  and Hunters chips do not state their meat, so they carry no meat tag.
- Left out: nothing printed is left out. Not on the sheet (so not here): dips, alcohol, and any dish added after June 2025. A
  club-specific sheet (Northampton, September 2024, linked only from that club's page) is a single venue and not used.

Allergens: none published. The sheet has no allergen information, the priced menu PDFs say "Prior to ordering, ask for any meal
allergen or Kcal content" and nothing else, and no allergen table could be found on the site (the QR page could not be rendered
here), so there is no allergen_guide.csv either.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import buzz_bingo_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "buzz-bingo"
SOURCE_URL = "https://www.buzzbingo.com/library/Clubs/food-and-drink/kcal-info-june25.pdf"
SOURCE_TITLE = "Buzz Bingo \"Kcal June 2025\" food and drink calorie sheet (PDF created 15 June 2025; calories only)"
ALIASES = ["buzz bingo", "buzz bingo club", "buzz bingo clubs"]
NOTE = ("Calories only, per item as sold, from Buzz Bingo's kcal sheet dated June 2025: the menu was reissued in March 2026, so dishes "
        "may have changed. Main meals list the main ingredient only; sides, sauces and dips are separate. Breakfast and Sunday lunch "
        "are 'where available'. No allergen list is published.")
EXPECTED_PAGES = 5
EXPECTED_ROWS = 94
EXPECTED_HEADING = ["Kcal June 2025", "Adults need around 2000kcal per day"]

# (section title as printed, category shown, qualifier added to a name that the sheet prints in several sections, printed names in order)
SECTIONS = [
    ("Breakfast", "Breakfast", "breakfast",
     ["Bacon Bap", "Sausage Bap", "Vegan Sausage Bap", "Lorne Sausage Bap"]),
    ("5 Item Breakfast (Where Available)", "5 Item Breakfast (where available)", "5 item breakfast",
     ["Bacon", "Sausage", "Vegan Sausage", "Lorne Sausage", "Egg", "Baked Beans", "Toast"]),
    ("Main Meals - Main Ingredient Only - All accompaniments listed separately", "Main Meals (main ingredient only)", "main meals",
     ["Chicken Tikka Masala", "Macaroni Cheese", "Scampi", "Cauliflower & Red Pepper Curry", "Chips", "Garden Peas", "Baked Beans",
      "Garlic Bread", "White Rice"]),
    ("Sunday Lunch (Where available)", "Sunday Lunch (where available)", "Sunday lunch",
     ["Chicken Breast", "Roast Potatoes", "Yorkshire Pudding", "Stuffing Ball", "Garden Peas", "Carrots", "Gravy", "Vegan Sausage"]),
    ("Baskets (sauce choice listed seperatley)", "Baskets", "baskets",
     ["Chicken Basket", "Fish Basket", "Veggie Basket"]),
    ("Burgers & Chips", "Burgers & Chips", "burgers & chips",
     ["Classic Beef Burger (inc all ingredients & Mayo)", "Chicken Burger (inc all ingredients & Mayo)",
      "Vegan Burger (inc all ingredients & Mayo)", "Cheese", "Bacon", "Onion Rings", "Fried / Boiled Onions"]),
    ("Fiver Faves - Sauce Choices listed seperatley", "Fiver Faves", "Fiver Faves",
     ["Fish Fingers & Chips", "Chicken Goujons & Chips", "Sausages & Chips", "Vegan Sausages & Chips",
      "Uncle Johns Hot Dog & Chips (inc all ingredients & Tomato Sauce & Mustard)",
      "Vegan Hot Dog & Chips (inc all ingredients & Tomato Sauce & Mustard)"]),
    ("Pizza", "Pizza", "pizza", ["Margherita", "Pepperoni"]),
    ("Jacket Potato", "Jacket Potato", "jacket potato",
     ["Plain Jacket Potato", "Butter", "Cheese", "Tuna Mayonnaise", "Baked Beans"]),
    ("Chips, Toppings & Sides", "Chips, Toppings & Sides", "sides",
     ["Ultimate Southern-Fried Hunters Chips", "Chip Butty", "Chips", "Curry Sauce", "Gravy", "Cheese", "Baked Beans", "Garden Peas",
      "Garlic Bread", "Garlic Bread with Cheese", "Halloumi Fries", "Onion Rings", "Fried / Boiled Onions", "Butter Portion",
      "Burger Bun"]),
    ("Sauces", "Sauces", "sauces",
     ["BBQ Sauce", "Mayonnaise", "Garlic Mayonnaise", "Tomato Sauce", "Sweet Chilli Sauce", "American Mustard", "Tartare Sauce"]),
    ("Desserts", "Desserts", "desserts",
     ["Lemon Torte & Raspberry Sauce", "Caramel & Honeycomb Torte & Raspberry Sauce", "4 Layer Fudge Cake",
      "Ice cream & Raspberry Sauce", "Ice Cream for 4 Layer Cake"]),
    ("Hot Drinks:", "Hot Drinks", "hot drinks",
     ["Tea with milk", "Tea without milk", "Coffee with milk", "Coffee without milk", "Latte", "Cappuccino", "Mocha", "Hot Chocolate"]),
    ("Soft Drinks:", "Soft Drinks", "soft drinks",
     ["16oz Diet Pepsi", "20oz Diet Pepsi", "16oz Pepsi Max", "20oz Pepsi Max", "16oz Pepsi Max Cherry", "20oz Pepsi Max Cherry",
      "16oz RW Lemonade", "20oz RW Lemonade"]),
]
VEG = re.compile(r"\b(vegan|veggie)\b", re.I)
PORK = re.compile(r"\b(bacon|sausages?|pepperoni)\b", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
# Named by the sheet as sausage/hot dog/chips but the meat is not stated: no pork or beef tag (listed in the run's output).
MEAT_NOT_STATED = ("lorne", "hot dog", "hunters")
SIZE = re.compile(r"^(\d+oz) (.+)$")


def build_items(rows: list[tuple[str, str, str]]) -> list[dict]:
    expected = [(sec, name) for sec, _cat, _q, names in SECTIONS for name in names]
    got = [(sec, name) for sec, name, _kcal in rows]
    if got != expected:
        new = [g for g in got if g not in expected]
        gone = [e for e in expected if e not in got]
        raise SystemExit(f"The sheet changed. Printed but not in SECTIONS: {new}. In SECTIONS but no longer printed: {gone}. "
                         "If only the order differs, fix SECTIONS. Update names/categories after reading the new sheet.")
    meta = {sec: (cat, q) for sec, cat, q, _names in SECTIONS}
    count: dict[str, int] = {}
    for _sec, name, _kcal in rows:
        count[name.lower()] = count.get(name.lower(), 0) + 1
    items = []
    for sec, printed, kcal in rows:
        cat, qualifier = meta[sec]
        name, serving = printed, ""
        m = SIZE.match(printed)
        if m:
            name, serving = f"{m.group(2)} ({m.group(1)})", m.group(1)
        if count[printed.lower()] > 1:
            name = f"{name} ({qualifier})"
        tags = []
        vegan = bool(VEG.search(printed))
        if vegan:
            tags.append("vegetarian")
        unstated = not vegan and any(w in printed.lower() for w in MEAT_NOT_STATED)
        if PORK.search(printed) and not vegan and not unstated:
            tags.append("contains_pork")
        if BEEF.search(printed) and not unstated:
            tags.append("contains_beef")
        note = f"Printed '{printed}' {kcal} in section '{sec}'"
        if unstated:
            note += "; meat type not stated"
        items.append(dict(name=name, category=cat, serving=serving, calories=kcal, tags="|".join(tags), rankable=False, notes=note))
    names = [i["name"].lower() for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the kcal PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"kcal PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    heading, rows, pages = pdf_reader.read_rows(args.pdf)
    if heading != EXPECTED_HEADING:
        raise SystemExit(f"The sheet's title lines changed: {heading!r}, expected {EXPECTED_HEADING!r}")
    if pages != EXPECTED_PAGES or len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"Expected {EXPECTED_PAGES} pages and {EXPECTED_ROWS} rows, found {pages} and {len(rows)}: the sheet changed")
    items = build_items(rows)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Buzz Bingo", cuisine="Bingo club", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories")
    cats: dict[str, int] = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print("meat type not stated: " + ", ".join(i["name"] for i in items if "meat type not stated" in i["notes"]))


if __name__ == "__main__":
    main()
