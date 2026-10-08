#!/usr/bin/env python3
"""Build data/source/everyman/ from Everyman Cinemas' official "Calories Menu" (a CALORIES-ONLY chain).

    python3 tools/uk_extract/everyman.py path/to/calories-menu.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own page links as "View Calories Menu"):
    https://www.everymancinema.com/menu-details/  (also linked from https://www.everymancinema.com/everyman-food-and-drink/)
    -> https://cms-assets.webediamovies.pro/production/279/a04f49b720bb02d413dd28bb329147c6.pdf
    PDF created 2026-09-23 (Adobe InDesign), served Last-Modified 2026-09-28. ONE landscape page (1200 x 980 pt) with a text layer.
Needs `pdftotext` (poppler). The page is read by position: see everyman_pdf.py.

The menu prints calories ONLY ("580kcal" at the right of a dish): protein, carbs and fat are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable). Calories are copied from the PDF as printed. Only the item
NAMES, categories, servings and tags are written by hand, in ENTRIES below, one entry per value expression the page prints, in
reading order: the script stops if the page prints a different set (a new, renamed or removed line, a moved heading, another number
of calorie values), so a human re-checks the table when Everyman publishes a new menu.

How the menu's own wording is read:
- "small / large" popcorn lines and "Pain au Chocolat / Croissant 313/260kcal", "Coca Cola, Diet Coke, Coke Zero 125/0/0kcal",
  "Non Alcoholic Prosecco 175ml/Bottle 32kcal/135kcal" print one value per option, in the order the options are named: one item each.
- The sundae lists ("Scoops: vanilla 89kcal, chocolate 101kcal ...", "Sauce: ...", "Toppings: ...") give a value per option of a
  Build Your Own Sundae (3 scoops, 1 sauce, 3 toppings). The guide does not say the amount each value is for, so `serving` stays blank
  and each option is its own item named after the printed heading (scoop / sauce / topping).
- "Swap bun for gluten free +9kcal" and "Swap bun for guac (naked) -30kcal" are differences from a burger, not dishes: not listed
  (a calorie value can't be negative and the menu gives no total). "Add cured streaky bacon 121kcal" is an absolute value for the
  bacon, so it is listed as an item of its own (as Wahaca's "Add chilli oil").
- No serving is stated except where the page prints it (popcorn small / large, 175ml / Bottle, 330ml, 500ml). Pots are sold as pots
  (the section heading), so those say "Pot".
- Not listed because the menu prints no calories for them: beers & ciders, wine (sparkling, white, rose & orange, red), cocktails,
  sharing cocktails. The run stops if any of those sections ever prints a value.
- Tags: vegetarian only where the name says "Plant-based". contains_pork / contains_beef when the item name or the dish's own
  description on the page says so (bacon, ham, prosciutto, pepperoni, sausages, chorizo, nduja; beef). Nothing else is inferred.
- The spelling "Trufffle" is a typo on the page; the item is named "Truffle & artichoke dip" (noted on the row).

Allergens (docs/DATA.md "Allergens"): none. Everyman publishes no allergen guide: the page ends "Please make the team aware of any
allergies; up to date allergy information is available upon request", and the food and drink pages only link venue menus (PDFs
without allergen marks) and this calories menu. So there is no allergen_guide.csv and no allergens.csv.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import everyman_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "everyman"
SOURCE_URL = "https://cms-assets.webediamovies.pro/production/279/a04f49b720bb02d413dd28bb329147c6.pdf"
SOURCE_TITLE = "Everyman Cinemas Calories Menu (PDF created 23 September 2026; linked from everymancinema.com/menu-details)"
ALIASES = ["everyman", "everyman cinema", "everyman cinemas"]
NOTE = ("One calorie menu for all Everyman venues; menus vary by venue and some have a reduced selection. Calories only: no protein, "
        "carbs or fat. Wine, beer, cider and cocktails print no calories and are not listed. Burgers are served with fries; the menu "
        "doesn't say whether the figure includes them.")
EXPECTED_ENTRIES = 108   # value expressions printed on the page (115 values, 2 of them bun swaps that are not listed)
EXPECTED_ITEMS = 113

CATEGORY = {
    "SHARING PLATES": "Sharing plates", "BURGERS": "Burgers", "DOGS & ROLLS": "Dogs & rolls", "FRIES": "Fries", "PIZZA": "Pizza",
    "KIDS MENUS": "Kids menus", "POPCORN": "Popcorn", "SUNDAES": "Sundaes",
    "PASTRIES, CAKES AND COOKIE DOUGH": "Pastries, cakes and cookie dough", "SWEET POTS": "Sweet pots", "SAVOURY POTS": "Savoury pots",
    "SHAKES & COOLERS": "Shakes & coolers", "SOFT": "Soft drinks", "HOT DRINKS": "Hot drinks", "NO & LOW": "No & low",
}
PORK = re.compile(r"\b(pork|bacon|ham|prosciutto|pepperoni|sausages?|chorizo|nduja|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)


def E(section, label, names, servings=None, note="", desc="", prev=None, skip=""):
    """One value expression printed on the page. `label` is what the reader finds before the value on its row, `names` one item
    name per printed value (in the order printed), `desc` an exact phrase from the dish's own description on the page (tags are
    read from the name and this phrase), `prev` the end of the row above when the name wrapped onto this row, `skip` the reason
    the line is not an item."""
    names = [names] if isinstance(names, str) else list(names)
    return dict(section=section, label=label, names=names, servings=servings or [""] * len(names), note=note, desc=desc, prev=prev, skip=skip)


SH, BU, DO, FR, PI, KI, PO, SU, PA, SW, SA, SK, SO, HO, NL = ("SHARING PLATES", "BURGERS", "DOGS & ROLLS", "FRIES", "PIZZA", "KIDS MENUS",
    "POPCORN", "SUNDAES", "PASTRIES, CAKES AND COOKIE DOUGH", "SWEET POTS", "SAVOURY POTS", "SHAKES & COOLERS", "SOFT", "HOT DRINKS", "NO & LOW")
FRIES_NOTE = "All burgers are 'served in a brioche bun with hand-cut fries' on the page; it does not say whether the value includes the fries"
BYO = "Build Your Own Sundae option (3 scoops, 1 sauce, 3 toppings): the page prints a value per option and does not say the amount it is for"
ENTRIES = [
    E(SH, "Popcorn chicken", "Popcorn chicken"),
    E(SH, "Hot honey halloumi", "Hot honey halloumi"),
    E(SH, "Tempura prawns", "Tempura prawns"),
    E(SH, "Salsa & tortilla chips", "Salsa & tortilla chips"),
    E(SH, "Hummus & flat bread", "Hummus & flat bread"),
    E(SH, "Handmade garlic parsley dough balls", "Handmade garlic parsley dough balls"),
    E(SH, "Padron peppers", "Padron peppers"),
    E(SH, "Fresh guac & tortilla chips", "Fresh guac & tortilla chips"),
    E(SH, "Honey & mustard glazed sausages", "Honey & mustard glazed sausages"),
    E(SH, "Trufffle & artichoke dip", "Truffle & artichoke dip", note="Printed 'Trufffle' (typo on the page); named Truffle"),
    E(SH, "Cheesy garlic flatbread", "Cheesy garlic flatbread"),
    E(SH, "Frickles", "Frickles"),
    E(BU, "Korean Burger", "Korean Burger", note=FRIES_NOTE, desc="Crispy fried chicken breast"),
    E(BU, "Signature Smokehouse BBQ Burger", "Signature Smokehouse BBQ Burger", note=FRIES_NOTE, desc="Dry-aged British beef, cured bacon"),
    E(BU, "Double Smash Cheeseburger", "Double Smash Cheeseburger", note=FRIES_NOTE, desc="Smashed dry-aged beef"),
    E(BU, "The Spielburger", "The Spielburger", note=FRIES_NOTE, desc="Dry-aged British beef, cheddar, house sauce"),
    E(BU, "Add cured streaky bacon", "Add cured streaky bacon",
      note="Printed under The Spielburger's description with its own value; the page does not say which burgers it can be added to"),
    E(BU, "Piri Piri Chicken Burger", "Piri Piri Chicken Burger", note=FRIES_NOTE, desc="Grilled piri piri-marinated chicken"),
    E(BU, "Plant-based Cheeseburger", "Plant-based Cheeseburger", note=FRIES_NOTE, desc="Plant-based patty"),
    E(BU, "Swap bun for gluten free", [], skip="a difference from a burger (+9kcal), not a dish"),
    E(BU, "Swap bun for guac (naked)", [], skip="a difference from a burger (-30kcal), not a dish"),
    E(DO, "Classic Dog", "Classic Dog", desc="Beef hot dog served with crispy onions"),
    E(DO, "Plant-based", "Plant-based Dog", note="Printed on the Classic Dog line as 'or choose Plant-based 410kcal'"),
    E(DO, "Fish Finger Club Sandwich", "Fish Finger Club Sandwich", desc="Battered cod fillet"),
    E(DO, "Lobster Roll", "Lobster Roll", desc="Warm buttered brioche roll, lobster"),
    E(FR, "Standard", "Standard Fries"),
    E(FR, "Sweet Potato", "Sweet Potato Fries"),
    E(FR, "Buffalo", "Buffalo Fries"),
    E(PI, "Fig, Prosciutto and Gorgonzola", "Fig, Prosciutto and Gorgonzola pizza"),
    E(PI, "Margherita", "Margherita pizza"),
    E(PI, "Pepperoni", "Pepperoni pizza"),
    E(PI, "Plant-based Pesto and Sundried Tomato", "Plant-based Pesto and Sundried Tomato pizza"),
    E(PI, "Nduja Hot", "Nduja Hot pizza", desc="chorizo, nduja"),
    E(KI, "Margherita pizza", "Kids Margherita pizza"),
    E(KI, "Pepperoni pizza", "Kids Pepperoni pizza"),
    E(KI, "Kids smash burger & chips", "Kids smash burger & chips", note="Meat type not stated"),
    E(KI, "Buttermilk chicken & chips", "Kids Buttermilk chicken & chips"),
    E(KI, "Hummus & crudites", "Kids Hummus & crudites"),
    E(KI, "Little Sundae", "Kids Little Sundae"),
    E(PO, "salted", ["Salted popcorn (small)", "Salted popcorn (large)"], ["Small", "Large"]),
    E(PO, "sweet", ["Sweet popcorn (small)", "Sweet popcorn (large)"], ["Small", "Large"]),
    E(PO, "mixed", ["Mixed popcorn (small)", "Mixed popcorn (large)"], ["Small", "Large"]),
    E(PO, "Everything Mix", "Everything Mix", note="Printed under the popcorn flavours with one value (no small / large pair)"),
    E(SU, "Scoops: vanilla", "Build Your Own Sundae: vanilla scoop", note=BYO),
    E(SU, "chocolate", "Build Your Own Sundae: chocolate scoop", note=BYO),
    E(SU, "strawberry", "Build Your Own Sundae: strawberry scoop", note=BYO),
    E(SU, "caramel", "Build Your Own Sundae: salted caramel scoop", note=BYO + "; printed 'salted' at the end of the line above and 'caramel' on this one",
      prev="strawberry 89kcal or salted"),
    E(SU, "Sauce: caramel", "Build Your Own Sundae: caramel sauce", note=BYO),
    E(SU, "strawberry", "Build Your Own Sundae: strawberry sauce", note=BYO),
    E(SU, "chocolate", "Build Your Own Sundae: chocolate sauce", note=BYO),
    E(SU, "Toppings: chocolate flake", "Build Your Own Sundae: chocolate flake topping", note=BYO),
    E(SU, "mini marshmallows", "Build Your Own Sundae: mini marshmallows topping", note=BYO),
    E(SU, "bites", "Build Your Own Sundae: honeycomb bites topping", note=BYO + "; printed 'honeycomb' at the end of the line above and 'bites' on this one",
      prev="mini marshmallows 30kcal, honeycomb"),
    E(SU, "strawberries", "Build Your Own Sundae: strawberries topping", note=BYO),
    E(SU, "chocolate buttons", "Build Your Own Sundae: chocolate buttons topping", note=BYO),
    E(SU, "Oreos", "Build Your Own Sundae: Oreos topping", note=BYO),
    E(SU, "Everything Sundae", "Everything Sundae"),
    E(PA, "Freshly Baked Double Chocolate Cookies", "Freshly Baked Double Chocolate Cookies", note="Plural on the page; the number of cookies is not stated"),
    E(PA, "Pain au Chocolat / Croissant", ["Pain au Chocolat", "Croissant"], note="Printed 'Pain au Chocolat / Croissant 313/260kcal': values in the order named"),
    E(PA, "Carrot & orange cake", "Carrot & orange cake"),
    E(PA, "Ultimate brownie", "Ultimate brownie"),
    E(PA, "Burnt Basque Cheesecake", "Burnt Basque Cheesecake"),
    E(PA, "Add a scoop of vanilla ice cream", "Add a scoop of vanilla ice cream", note="Printed 107kcal; the sundae's vanilla scoop prints 89kcal (different portions)"),
    E(SW, "Milk chocolate buttons", "Milk chocolate buttons", ["Pot"]),
    E(SW, "Chocolate fruit & nut mix", "Chocolate fruit & nut mix", ["Pot"]),
    E(SW, "Honeycomb bites", "Honeycomb bites", ["Pot"], note="The sundae topping of the same name prints 103kcal (different portion)"),
    E(SW, "Jelly retro candy", "Jelly retro candy", ["Pot"]),
    E(SW, "Fizzy retro candy", "Fizzy retro candy", ["Pot"]),
    E(SA, "Olives", "Olives", ["Pot"]),
    E(SA, "Salt & pepper cashews", "Salt & pepper cashews", ["Pot"]),
    E(SA, "Honey roasted cashews", "Honey roasted cashews", ["Pot"]),
    E(SA, "Chilli bites", "Chilli bites", ["Pot"]),
    E(SA, "Salted pretzels", "Salted pretzels", ["Pot"]),
    E(SK, "Vanilla", "Vanilla shake"),
    E(SK, "Chocolate", "Chocolate shake"),
    E(SK, "Strawberry", "Strawberry shake"),
    E(SK, "", "Salted caramel shake", note="Printed 'Salted caramel' at the end of the line above and '461kcal' on this one", prev="Strawberry 457kcal, Salted caramel"),
    E(SK, "Oreo", "Oreo shake"),
    E(SK, "Choose from Oreo", "Plant-based Oreo shake", note="Printed 'Plant-based shakes: Choose from Oreo 541kcal, Vanilla 353kcal'", prev="Plant-based shakes"),
    E(SK, "Vanilla", "Plant-based Vanilla shake", note="Printed 'Plant-based shakes: Choose from Oreo 541kcal, Vanilla 353kcal'"),
    E(SO, "Coke Zero", ["Coca Cola", "Diet Coke", "Coke Zero"], note="Printed 'Coca Cola, Diet Coke, Coke Zero 125/0/0kcal': values in the order named; the size is not stated",
      prev="Coca Cola, Diet Coke,"),
    E(SO, "Luscombe Sicilian Lemonade", "Luscombe Sicilian Lemonade"),
    E(SO, "Luscombe Sparkling Apple", "Luscombe Sparkling Apple"),
    E(SO, "Karma Orangeade", "Karma Orangeade"),
    E(SO, "Gingerella Ginger Ale", "Gingerella Ginger Ale"),
    E(SO, "Apple Juice", "Apple Juice"),
    E(SO, "Orange Juice", "Orange Juice"),
    E(SO, "Pineapple Juice", "Pineapple Juice"),
    E(SO, "Peach Iced Tea", "Peach Iced Tea"),
    E(SO, "Dash Water", "Dash Water (lemon or raspberry)", note="One value printed for both flavours (line below: 'Lemon or raspberry')"),
    E(SO, "Reusable Water 500ml", "Everyman Reusable Water (still or sparkling)", ["500ml"], note="Printed 'Everyman / Reusable Water 500ml 0kcal / Still or sparkling'",
      prev="Everyman"),
    E(HO, "Americano", "Americano"),
    E(HO, "Cappuccino", "Cappuccino"),
    E(HO, "Latte", "Latte"),
    E(HO, "Flat White", "Flat White"),
    E(HO, "Hot Chocolate", "Hot Chocolate"),
    E(HO, "Vanilla Matcha", "Vanilla Matcha"),
    E(HO, "Fresh Mint Tea", "Fresh Mint Tea"),
    E(HO, "Speciality Teas", "Speciality Teas", note="One value for the teas printed below it: 'The Great British Cuppa, Sunny / Sencha, Earl Grey or Rooibos (decaf)'"),
    E(HO, "Chai Tea", "Chai Tea"),
    E(NL, "Crodino non-alcoholic Spritz", "Crodino non-alcoholic Spritz"),
    E(NL, "Grapefruit & Elderflower Botivo Spritz", "Grapefruit & Elderflower Botivo Spritz"),
    E(NL, "Elderflower & Mint Collins", "Elderflower & Mint Collins"),
    E(NL, "Sipsmith FreeGlider & Tonic", "Sipsmith FreeGlider & Tonic"),
    E(NL, "Lucky Saint Lager 0.5abv 330ml", "Lucky Saint Lager 0.5abv", ["330ml"]),
    E(NL, "Lucky Saint Hazy IPA 0.5abv 330ml", "Lucky Saint Hazy IPA 0.5abv", ["330ml"]),
    E(NL, "Non Alcoholic Prosecco 175ml/Bottle", ["Non Alcoholic Prosecco (175ml)", "Non Alcoholic Prosecco (bottle)"], ["175ml", "Bottle"],
      note="Printed '175ml/Bottle 32kcal/135kcal': values in the order named; the bottle size is not stated"),
    E(NL, "Botivo Mule", "Botivo Mule"),
]
# Phrases the page must still print (the evidence for notes and tags, and the sections that print no calories).
MUST_PRINT = ["Dry-aged British beef, cured bacon", "Smashed dry-aged beef", "Dry-aged British beef, cheddar, house sauce", "Beef hot dog served with crispy onions",
              "chorizo, nduja", "Plant-based patty", "Crispy fried chicken breast", "Grilled piri piri-marinated chicken", "Battered cod fillet",
              "Warm buttered brioche roll, lobster", "The Great British Cuppa, Sunny", "Sencha, Earl Grey or Rooibos (decaf)", "Lemon or raspberry",
              "Still or sparkling", "Trufffle", "3 scoops, 1 sauce, 3 toppings", "up to date allergy information is available upon request"]


def build_items(entries: "list[dict]", plain: str) -> "list[dict]":
    if len(entries) != EXPECTED_ENTRIES or len(entries) != len(ENTRIES):
        raise SystemExit(f"The page prints {len(entries)} value expressions; this script expects {EXPECTED_ENTRIES} and has {len(ENTRIES)} "
                         "entries: the menu changed, re-read it and update ENTRIES.")
    printed_kcal = sum(e["printed"].count("kcal") for e in entries)
    if plain.count("kcal") != printed_kcal:
        raise SystemExit(f"The page text has {plain.count('kcal')} 'kcal' words but {printed_kcal} were read as values: a value was missed")
    for phrase in MUST_PRINT:
        if phrase not in plain:
            raise SystemExit(f"The page no longer prints {phrase!r}: re-check the notes and tags that rely on it")
    items = []
    for read, want in zip(entries, ENTRIES):
        if (read["section"], read["label"]) != (want["section"], want["label"]):
            raise SystemExit(f"Reading order changed: the page has {(read['section'], read['label'])} where ENTRIES expects "
                             f"{(want['section'], want['label'])}")
        if want["prev"] is not None and not read["prev_row"].endswith(want["prev"]):
            raise SystemExit(f"{read['label']!r}: the row above ends {read['prev_row'][-40:]!r}, expected it to end {want['prev']!r}")
        if want["skip"]:
            if len(read["values"]) != 1:
                raise SystemExit(f"{read['label']!r} is a skipped line but prints {len(read['values'])} values")
            continue
        if len(read["values"]) != len(want["names"]):
            raise SystemExit(f"{read['label']!r} prints {len(read['values'])} values {read['values']} but ENTRIES names {len(want['names'])} items")
        if any(not re.fullmatch(r"\d+", v) for v in read["values"]):
            raise SystemExit(f"{read['label']!r}: a calorie value is not a plain number: {read['values']}")
        for name, serving, value in zip(want["names"], want["servings"], read["values"]):
            if want["desc"] and want["desc"] not in plain:
                raise SystemExit(f"{name!r}: description phrase {want['desc']!r} is no longer on the page")
            text = name + " " + want["desc"]
            tags = []
            if "plant-based" in name.lower():
                tags.append("vegetarian")
            if PORK.search(text):
                tags.append("contains_pork")
            if BEEF.search(text):
                tags.append("contains_beef")
            notes = "; ".join(x for x in (f"Printed '{read['printed']}' on the row '{read['row'].strip()}'", want["note"]) if x)
            items.append(dict(name=name, category=CATEGORY[want["section"]], serving=serving, calories=value, tags="|".join(tags),
                              rankable=False, notes=notes))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Built {len(items)} items, expected {EXPECTED_ITEMS}: the menu changed, re-check ENTRIES")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the calories menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if len(NOTE) >= 400:
        raise SystemExit("note.txt must stay under 400 characters")
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    entries, plain = pdf_reader.read_rows(args.pdf)
    items = build_items(entries, plain)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Everyman Cinemas", cuisine="Cinema", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
                             nutrition_level="calories")
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("printed without calories (not listed): beers & ciders, wine, cocktails, sharing cocktails; bun swaps (+9 / -30 kcal) are differences, not dishes")


if __name__ == "__main__":
    main()
