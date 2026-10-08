#!/usr/bin/env python3
"""Build data/source/the-breakfast-club/ from The Breakfast Club's official "Calorie Menu" (a CALORIES-ONLY chain).

    python3 tools/uk_extract/the_breakfast_club.py path/to/Calorie-Menu.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own menu QR code "SCAN HERE FOR CALORIES OR TRUST YOUR INSTINCT" opens):
    https://www.thebreakfastclubcafes.com/s/Calorie-Menu.pdf  (HTTP 302) ->
    https://static1.squarespace.com/static/68b025163c03825dcdc6fcb7/t/6ab7a3eacf7cc07080c3dc59/1790419946208/Calorie+Menu.pdf
    PDF title "July 2026 Low Menu", created 2026-07-19, last modified 2026-09-26, no date printed on the page; 2 pages (page 1 the menu in four
    columns, page 2 a logo-only cover). robots.txt of www.thebreakfastclubcafes.com disallows only /static/ and a few query strings (not /s/);
    static1.squarespace.com serves no robots.txt (404). Needs `pdftotext` (poppler); the page is read by position: see the_breakfast_club_pdf.py.

The menu prints calories ONLY ("1551kcal" after a dish's name): protein, carbs, fat and every other nutrient are never printed, so they stay
blank (docs/DATA.md "Calories-only chains"). Calories are copied from the PDF text exactly as printed. Only the item NAMES, categories and
tags are written by hand, in ITEMS below, and each item says WHERE the number is printed (the block of the dish it sits under and a pattern
that must match exactly once); the script stops if a calorie value on the page is not claimed by an item, if a pattern matches twice or not
at all, if a dish heading moved, or if an item printed in several places shows different values (only the two named CONFLICTS may).

How the menu's own wording is read:
- Dish lines print "Name 1551kcal"; a few print the value on the next line ("The Veggie Monty" / "1287kcal"). Short Stack Pancakes print
  "15.00/16.00 643kcal": the prices are for 2 or 3 toppings, the calories are the one figure printed.
- Extras are printed in small capitals under a dish ("ADD AN EGG 2.00 131kcal", "CHOOSE: EGG 131kcal BACON 220kcal ..."). Each distinct extra is
  one item in "Add-ons and Toppings", published once when every place it is printed shows the same value (Egg: 5 places, Bacon: 4, ...).
  The PDF does not say whether a dish's own figure includes its toppings, sides or dips; each extra's own figure is printed separately.
- Same name, different values = a contradiction in the chain's own PDF, so both rows are held back (holdback.csv), never corrected:
  Veggie Sausage 188 (pancake toppings) vs 144 (side choice for the avocado toasts); Fries 486 (Sides) vs 485 (add-on to the Halloumi Tacos
  and the Schnitzel).
- Names of different wording but the same value in the same sort of place are folded into one item only where the PDF itself uses both
  words for the dish: "POTATOES 300kcal" in the side choice lists and "HOMESTYLE POTATOES 300kcal" elsewhere are the Homestyle Potatoes;
  "ADD CAESAR SALAD 451kcal" is the Caesar Side Salad (451kcal on the Sides list). Both are noted in the rows' notes.
- "Chicken or Chorizo Tacos 730kcal / 758kcal": two values for two fillings, paired in the printed order (chicken 730, chorizo 758); the
  PDF does not label them (flagged in the rows' notes). "Hash browns & dip 390kcal/780kcal/1170kcal" with "Choose 3, 6 or 9 hash browns":
  paired in the printed order (3, 6, 9).
- Tags: vegetarian only where the PDF marks the dish (V) or (PB) plant based. "(V available)" means a vegetarian version can be asked for, so
  the printed dish is not tagged. contains_pork where the dish's printed ingredients say bacon, sausage ('Nduja counts as the pork salumi it is);
  the PDF itself calls bacon and sausage "pork products". Chorizo is "vegan or pork" in the Breakfast Burrito and "vegan chorizo available"
  on the tacos, so chorizo items carry no pork tag (meat type not stated). "beef tomato" in Mr Big Chicken is a tomato: no beef tag.
- The leading "(PB)" before "Fries 486kcal (PB)" could belong to the line above (Homestyle Potatoes) or to Fries; Homestyle Potatoes is not
  tagged vegetarian because of that doubt (Fries carries the trailing (PB)).
- Not listed: drinks and the kids' menu (separate PDFs on the chain's /menu page that print no calories), pancake menu PDF (no calories).

Allergens (docs/DATA.md "Allergens"): none. The chain publishes no allergen guide or table anywhere on its site or in its PDFs; the menu says
"Please inform your server of allergies or intolerances before you order", so there is no allergen_guide.csv either.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import the_breakfast_club_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "the-breakfast-club"
SOURCE_URL = "https://www.thebreakfastclubcafes.com/s/Calorie-Menu.pdf"
SOURCE_TITLE = ("The Breakfast Club menu with calories (PDF 'July 2026 Low Menu', created 19 July 2026, last modified 26 September 2026; "
                "no date printed on the page)")
ALIASES = ["the breakfast club", "breakfast club", "the breakfast club cafes"]
NOTE = ("Calories only: The Breakfast Club prints a calorie figure beside each dish and extra; protein, carbs, fat and the rest are not "
        "published. Drinks and kids' menus print no calories and are not listed. The PDF does not say whether a dish's figure includes the "
        "toppings, sides or dips offered with it. Some branches may use a different menu.")
EXPECTED_VALUES = 78  # calorie values on page 1
EXPECTED_ITEMS = 55

CAF, PAN, TAB, DIN, VEG, CHK, TAC, SID, ADD = ("Caf Classics", "Pancake Filled Hope", "Pancakes for the Table", "Diner Plates",
                                               "Veggie Plates", "Chicken", "Tacos, Huevos + Burritos", "Sides + Shares",
                                               "Add-ons and Toppings")
VEGETARIAN, PORK = "vegetarian", "contains_pork"

# Dish headings per column (printed text at the start of a line), in reading order. A dish's "block" runs from its heading to the next one.
ANCHORS = {
    0: ["The Full Monty", "The Veggie Monty", "The Full English", "Bacon, Eggs + Hash Browns", "Avo & Eggs (V + PB)", "DIETARY REQUIREMENTS"],
    1: ["The All American", "Short Stack Pancakes", "PANCAKES FOR THE TABLE", "Pancakes with Marmite Maple Butter", "DINER PLATES",
        "TBC Breakfast Burger", "French Toast Plate", "Eggs Benedict", "Smoked Salmon, Avo & Eggs"],
    2: ["VEGGIE PLATES", "Anvar’s Turkish Eggs", "Crispy Chilli & Feta Avo Toast", "Hot Honey Halloumi Tacos",
        "Smashed Avocado & Mojo Picon on Toast", "CHICKEN", "Fried Chicken, Bacon & Waffles", "Chicken Schnitzel Caesar", "Mr Big Chicken"],
    3: ["TACOS, HUEVOS+BURRITOS", "The Breakfast Burrito", "’Nduja & Fried Egg Tacos", "Chicken or Chorizo Tacos", "Huevos Rancheros",
        "SIDES+SHARES", "Hash browns & dip", "French Toast Fingers", "Chicken Tenders", "Homestyle Potatoes", "(PB) Fries", "Caesar Side Salad"],
}
# Column numbers used below: 0 = Caf Classics, 1 = pancakes and diner plates, 2 = veggie plates and chicken, 3 = tacos, sides.
PRICE = r"(?:\s+\d+\.\d\d(?:/\d+\.\d\d)?)?"


def dish(col, anchor):
    """The value printed on the dish's own line (or the line after it), after the name and an optional price."""
    return (col, anchor, rf"\A{re.escape(anchor)}{PRICE}\s+(\d+)kcal")


def extra(col, anchor, label, not_after=None):
    """An extra printed in capitals inside the dish's block: 'LABEL 131kcal' (the label may wrap onto the next line)."""
    words = r"\s+".join(re.escape(w) for w in label.split())
    lookbehind = rf"(?<!{re.escape(not_after)}\s)" if not_after else ""
    return (col, anchor, rf"{lookbehind}\b{words}\s+(\d+)kcal")


def item(name, cat, sources, tags=(), serving="", note=""):
    return dict(name=name, cat=cat, sources=sources, tags=list(tags), serving=serving, note=note)


SHORT = "Short Stack Pancakes"
CHOOSE_A, CHOOSE_B = "Crispy Chilli & Feta Avo Toast", "Smashed Avocado & Mojo Picon on Toast"
HHT, SCH, SMS, HUE, FTP, FTF, ANV = ("Hot Honey Halloumi Tacos", "Chicken Schnitzel Caesar", "Smoked Salmon, Avo & Eggs", "Huevos Rancheros",
                                     "French Toast Plate", "French Toast Fingers", "Anvar’s Turkish Eggs")
SIDE_NOTE = "'ON ITS OWN OR WITH 1 OR 2 ADDITIONAL SIDES' lists: printed under both the Crispy Chilli & Feta Avo Toast and the Smashed Avocado"

ITEMS = [
    # ---- Caf Classics
    item("The Full Monty", CAF, [dish(0, "The Full Monty")], [PORK], note="Crispy bacon, sausage, black pudding; turkey bacon + chicken sausage available"),
    item("The Veggie Monty", CAF, [dish(0, "The Veggie Monty")], note="Named 'Veggie' but no (V) mark printed: not tagged vegetarian"),
    item("The Full English", CAF, [dish(0, "The Full English")], [PORK], note="Crispy bacon, sausage"),
    item("Bacon, Eggs + Hash Browns", CAF, [dish(0, "Bacon, Eggs + Hash Browns")], [PORK], note="Streaky bacon; turkey bacon available"),
    item("Avo & Eggs", CAF, [dish(0, "Avo & Eggs (V + PB)")], [VEGETARIAN], note="Printed (V + PB)"),
    # ---- Pancake Filled Hope (the heading is a picture, read from the rendered page)
    item("The All American", PAN, [dish(1, "The All American")], [PORK], note="Pancakes, bacon, sausage; 'swap out pork products for turkey bacon and chicken sausage'"),
    item(SHORT, PAN, [dish(1, SHORT)], serving="3 pancakes",
         note="Printed '15.00/16.00 643kcal': price for 2 or 3 toppings, one calorie figure; toppings are printed with their own calories"),
    # ---- Pancakes for the Table
    item("Pancakes with Marmite Maple Butter", TAB, [dish(1, "Pancakes with Marmite Maple Butter")], serving="2 pancakes"),
    # ---- Diner Plates
    item("TBC Breakfast Burger", DIN, [dish(1, "TBC Breakfast Burger")], [PORK], note="Sausage patty, double bacon; with hash browns, homestyle potatoes or fries"),
    item(FTP, DIN, [dish(1, FTP)], [PORK], note="Crispy bacon; (V available) so not tagged vegetarian; turkey bacon available"),
    item("Eggs Benedict", DIN, [dish(1, "Eggs Benedict")], [PORK], note="Bacon; with homestyle potatoes, hash browns, fries or fruit salad; turkey bacon available"),
    item(SMS, DIN, [dish(1, SMS)]),
    # ---- Veggie Plates
    item(ANV, VEG, [dish(2, ANV)], [VEGETARIAN], note="Printed (V)"),
    item(CHOOSE_A, VEG, [dish(2, CHOOSE_A)], [VEGETARIAN], note="Printed (V); on its own or with 1 or 2 additional sides"),
    item(HHT, VEG, [dish(2, HHT)], [VEGETARIAN], serving="2 soft tacos", note="Printed (V)"),
    item(CHOOSE_B, VEG, [dish(2, CHOOSE_B)], [VEGETARIAN], note="Printed (PB) plant based; on its own or with 1 or 2 additional sides"),
    # ---- Chicken
    item("Fried Chicken, Bacon & Waffles", CHK, [dish(2, "Fried Chicken, Bacon & Waffles")], [PORK], note="Crispy bacon; turkey bacon available"),
    item(SCH, CHK, [dish(2, SCH)]),
    item("Mr Big Chicken", CHK, [dish(2, "Mr Big Chicken")], note="'beef tomato' in the description is a tomato: no beef tag"),
    # ---- Tacos, Huevos + Burritos
    item("The Breakfast Burrito", TAC, [dish(3, "The Breakfast Burrito")], note="Chorizo 'vegan or pork': meat type not stated; (V available)"),
    item("’Nduja & Fried Egg Tacos", TAC, [dish(3, "’Nduja & Fried Egg Tacos")], [PORK], serving="2 soft tacos",
         note="'Nduja is a pork salumi (the PDF doesn't say pork); (V available) by swapping in veggie chorizo"),
    item("Chicken Tacos", TAC, [(3, "Chicken or Chorizo Tacos", r"\AChicken or Chorizo Tacos\s+(\d+)kcal\s*/\s*\d+kcal")], serving="2 soft tacos",
         note="Printed 'Chicken or Chorizo Tacos 730kcal / 758kcal': values paired with the fillings in printed order, not labelled in the PDF"),
    item("Chorizo Tacos", TAC, [(3, "Chicken or Chorizo Tacos", r"\AChicken or Chorizo Tacos\s+\d+kcal\s*/\s*(\d+)kcal")], serving="2 soft tacos",
         note="Second of the two printed values (see Chicken Tacos); chorizo 'vegan chorizo available': meat type not stated"),
    item(HUE, TAC, [dish(3, HUE)], [VEGETARIAN], note="Printed (V)"),
    # ---- Sides + Shares
    item("Hash Browns & Dip (3 hash browns)", SID, [(3, "Hash browns & dip", r"\AHash browns & dip\s+(\d+)kcal/\d+kcal/\d+kcal")], serving="3 hash browns",
         note="Printed 390kcal/780kcal/1170kcal for 'Choose 3, 6 or 9 hash browns With 1, 2 or 3 dips': paired in printed order; dip calories not printed; gravy dip (not V)"),
    item("Hash Browns & Dip (6 hash browns)", SID, [(3, "Hash browns & dip", r"\AHash browns & dip\s+\d+kcal/(\d+)kcal/\d+kcal")], serving="6 hash browns",
         note="Second of three printed values (see the 3 hash browns row)"),
    item("Hash Browns & Dip (9 hash browns)", SID, [(3, "Hash browns & dip", r"\AHash browns & dip\s+\d+kcal/\d+kcal/(\d+)kcal")], serving="9 hash browns",
         note="Third of three printed values (see the 3 hash browns row)"),
    item(FTF, SID, [(3, FTF, r"\AFrench Toast Fingers\s+(\d+)kcal/\(V\)")], [VEGETARIAN], note="Printed '526kcal/(V)'; maple syrup and chocolate dip have their own values"),
    item("Chicken Tenders", SID, [dish(3, "Chicken Tenders")], serving="4 tenders", note="4 golden chicken tenders with your choice of two dips (dip calories not printed; gravy is one)"),
    item("Homestyle Potatoes", SID, [dish(3, "Homestyle Potatoes"), extra(1, SMS, "HOMESTYLE POTATOES"), extra(2, HHT, "HOMESTYLE POTATOES"),
                                     extra(2, CHOOSE_A, "POTATOES", "HOMESTYLE"), extra(2, CHOOSE_B, "POTATOES", "HOMESTYLE")],
         note="Printed on the Sides list, as an add-on to the Smoked Salmon and the Halloumi Tacos, and as 'POTATOES' in the side choice lists (same value); the PB mark above 'Fries' may belong here: not tagged"),
    item("Fries", SID, [dish(3, "(PB) Fries")], [VEGETARIAN], note="Printed '(PB) Fries 486kcal (PB)'. HELD BACK: the add-on Fries are printed 485kcal elsewhere in the same PDF"),
    item("Caesar Side Salad", SID, [dish(3, "Caesar Side Salad"), extra(2, HHT, "CAESAR SALAD")],
         note="Printed on the Sides list, and as 'ADD CAESAR SALAD' on the Halloumi Tacos (same value)"),
    # ---- Add-ons and Toppings (printed under dishes; each listed once with every place it is printed)
    item("Egg", ADD, [(0, "The Full Monty", r"ADD AN EGG\s+\d+\.\d\d\s+(\d+)kcal"), extra(1, SHORT, "EGG"), (1, FTP, r"ADD EGG\s+(\d+)kcal"),
                      extra(2, CHOOSE_A, "EGG"), extra(2, CHOOSE_B, "EGG")],
         note="Printed 5 times (Full Monty add, pancake toppings, French Toast Plate add, two side choice lists), always 131kcal"),
    item("Golden Yolk Poached Egg", ADD, [extra(2, SCH, "GOLDEN YOLK POACHED EGG")], note="Printed 'ADD GOLDEN YOLK POACHED EGG' on the Chicken Schnitzel Caesar"),
    item("Bacon", ADD, [extra(1, SHORT, "BACON", "TURKEY"), extra(2, CHOOSE_A, "BACON", "TURKEY"), extra(2, CHOOSE_B, "BACON", "TURKEY"),
                        extra(3, HUE, "BACON")], [PORK], note="Printed in the pancake toppings, both side choice lists and the Huevos Rancheros adds, always 220kcal"),
    item("Turkey Bacon", ADD, [extra(1, SHORT, "TURKEY BACON"), extra(2, CHOOSE_A, "TURKEY BACON"), extra(2, CHOOSE_B, "TURKEY BACON")],
         note="Printed in the pancake toppings and both side choice lists, always 42kcal"),
    item("Sausage (pancake topping)", ADD, [extra(1, SHORT, "SAUSAGE", "VEGGIE")], [PORK], note="Pancake toppings; the PDF calls sausage a pork product (turkey bacon and chicken sausage swap)"),
    item("Veggie Sausage (pancake topping)", ADD, [extra(1, SHORT, "VEGGIE SAUSAGE")],
         note="HELD BACK: pancake toppings print 188kcal, the side choice lists print 144kcal for the same name"),
    item("Veggie Sausage (side choice)", ADD, [extra(2, CHOOSE_A, "VEGGIE SAUSAGE"), extra(2, CHOOSE_B, "VEGGIE SAUSAGE")],
         note="HELD BACK: side choice lists print 144kcal, the pancake toppings print 188kcal for the same name"),
    item("Hash Browns", ADD, [extra(1, SHORT, "HASH BROWNS"), extra(1, SMS, "HASH BROWNS"), extra(2, CHOOSE_A, "HASH BROWNS"), extra(2, CHOOSE_B, "HASH BROWNS")],
         note="Printed in the pancake toppings, as an add-on to the Smoked Salmon and in both side choice lists, always 155kcal; the 3 hash browns & dip is 390kcal"),
    item("Mixed Berries (pancake topping)", ADD, [extra(1, SHORT, "MIXED BERRIES")]),
    item("Vanilla Cream (pancake topping)", ADD, [extra(1, SHORT, "VANILLA CREAM")]),
    item("Chocolate (pancake topping)", ADD, [extra(1, SHORT, "CHOCOLATE")]),
    item("Banana (pancake topping)", ADD, [extra(1, SHORT, "BANANA")]),
    item("Blueberry Compote (pancake topping)", ADD, [extra(1, SHORT, "BLUEBERRY COMPOTE")]),
    item("Maple Syrup (with French Toast Fingers)", ADD, [extra(3, FTF, "MAPLE SYRUP")], note="'with: MAPLE SYRUP 120kcal OR CHOCOLATE DIP 270kcal'"),
    item("Chocolate Dip (with French Toast Fingers)", ADD, [extra(3, FTF, "CHOCOLATE DIP")], note="'with: MAPLE SYRUP 120kcal OR CHOCOLATE DIP 270kcal'"),
    item("Harissa Beans", ADD, [extra(2, CHOOSE_A, "HARISSA BEANS"), extra(2, CHOOSE_B, "HARISSA BEANS")], note=SIDE_NOTE),
    item("Mushrooms", ADD, [extra(2, CHOOSE_A, "MUSHROOMS"), extra(2, CHOOSE_B, "MUSHROOMS")], note=SIDE_NOTE),
    item("Chorizo", ADD, [extra(2, ANV, "CHORIZO"), extra(3, HUE, "CHORIZO", "VEGGIE")],
         note="Printed on the Turkish Eggs and Huevos Rancheros adds (290kcal both); vegan or pork not stated"),
    item("Veggie Chorizo", ADD, [extra(3, HUE, "VEGGIE CHORIZO")], note="Huevos Rancheros add; named 'veggie' but no (V) mark: not tagged"),
    item("Halloumi", ADD, [extra(2, ANV, "HALLOUMI"), extra(3, HUE, "HALLOUMI")], note="Printed on the Turkish Eggs and Huevos Rancheros adds (246kcal both)"),
    item("Fried Chicken Tenders", ADD, [extra(2, ANV, "FRIED CHICKEN TENDERS")], note="Add-on to the Turkish Eggs; the Chicken Tenders on the Sides list (4 tenders) are 530kcal"),
    item("Chicken", ADD, [extra(3, HUE, "CHICKEN")], note="Huevos Rancheros add"),
    item("Fries (add-on)", ADD, [extra(2, HHT, "FRIES"), extra(2, SCH, "FRIES")],
         note="HELD BACK: printed 485kcal on the Halloumi Tacos and Schnitzel adds, but 486kcal as the Fries side on the Sides list"),
]
# Names printed with different values in different places of the same PDF: both rows are held back (never corrected). The script checks the
# values really differ, so a re-issued menu that fixes one stops the run instead of silently keeping the hold-back.
CONFLICTS = [("veggie-sausage-pancake-topping", "veggie-sausage-side-choice", "Veggie Sausage"), ("fries", "fries-add-on", "Fries")]


def locate_blocks(columns):
    """{(column, anchor): (block text, offset of the block in the column text)}; every anchor is printed once, in order."""
    blocks = {}
    for c, anchors in ANCHORS.items():
        text = columns[c]
        starts = []
        for a in anchors:
            hits = [m.start() for m in re.finditer(rf"^{re.escape(a)}", text, re.M)]
            if len(hits) != 1:
                raise SystemExit(f"Column {c + 1}: {a!r} is printed {len(hits)} times at the start of a line (expected once): the menu changed")
            starts.append(hits[0])
        if starts != sorted(starts):
            raise SystemExit(f"Column {c + 1}: the dishes are no longer in the expected order: the menu changed")
        for i, a in enumerate(anchors):
            end = starts[i + 1] if i + 1 < len(starts) else len(text)
            blocks[(c, a)] = (text[starts[i]:end], starts[i])
    return blocks


def build_items(columns):
    blocks = locate_blocks(columns)
    consumed = {}
    items = []
    for spec in ITEMS:
        values = []
        for col, anchor, rx in spec["sources"]:
            block, base = blocks[(col, anchor)]
            hits = list(re.finditer(rx, block))
            if len(hits) != 1:
                raise SystemExit(f"{spec['name']}: pattern {rx!r} matches {len(hits)} times in the block of {anchor!r} (expected once): the menu changed")
            key = (col, base + hits[0].start(1))
            if key in consumed:
                raise SystemExit(f"{spec['name']}: the value at column {col + 1}, offset {key[1]} is already used by {consumed[key]!r}")
            consumed[key] = spec["name"]
            values.append(hits[0].group(1))
        if len(set(values)) != 1:  # a name printed with different values is never merged: split it and list it in CONFLICTS (held back)
            raise SystemExit(f"{spec['name']}: printed with different values {values}: split the row and hold both back (CONFLICTS)")
        items.append(dict(name=spec["name"], category=spec["cat"], calories=values[0], serving=spec["serving"], tags="|".join(spec["tags"]),
                          rankable=False, notes="; ".join(x for x in (spec["note"], f"printed {len(values)} time(s)") if x)))
    # every calorie value on the page must belong to an item (a new value stops the run), and no value may be written oddly ("131 kcal")
    for c, text in enumerate(columns):
        for m in re.finditer(r"(\d+)kcal", text):
            if (c, m.start(1)) not in consumed:
                line = text[text.rfind("\n", 0, m.start()) + 1:text.find("\n", m.end())]
                raise SystemExit(f"Column {c + 1}: the calorie value {m.group(1)} in {line!r} belongs to no item: the menu changed")
    stray = sum(len(re.findall("kcal", t, re.I)) for t in columns) - len(consumed)
    if stray != 1:  # exactly one other mention: "ADULTS NEED AROUND 2000 KCAL A DAY"
        raise SystemExit(f"{stray} other 'kcal' mentions on the page (expected only the 2000 KCAL advice line): check for values written oddly")
    if len(consumed) != EXPECTED_VALUES:
        raise SystemExit(f"{len(consumed)} calorie values on the page, expected {EXPECTED_VALUES}: the menu changed")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"{len(items)} items built, expected {EXPECTED_ITEMS}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items


def holdback_rows(items):
    by_id = {slug(i["name"]): i for i in items}
    rows = []
    for a, b, label in CONFLICTS:
        if a not in by_id or b not in by_id:
            raise SystemExit(f"CONFLICTS names {a!r}/{b!r} but no such item ids exist")
        if by_id[a]["calories"] == by_id[b]["calories"]:
            raise SystemExit(f"{label}: both rows now print {by_id[a]['calories']}kcal: the contradiction is gone, remove it from CONFLICTS")
        rows.append((a, f"The PDF prints {label} as {by_id[a]['calories']}kcal in one place ({by_id[a]['name']}) and {by_id[b]['calories']}kcal in another ({by_id[b]['name']}): contradicting itself, not published"))
        rows.append((b, f"The PDF prints {label} as {by_id[b]['calories']}kcal in one place ({by_id[b]['name']}) and {by_id[a]['calories']}kcal in another ({by_id[a]['name']}): contradicting itself, not published"))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the calorie menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    columns = pdf_reader.read_columns(args.pdf)
    items = build_items(columns)
    if len(NOTE) >= 400:
        raise SystemExit("note.txt must stay under 400 characters")
    held = holdback_rows(items)
    out = write_chain_folder(chain_id=CHAIN_ID, name="The Breakfast Club", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=held,
                             allergen_guide=None, nutrition_level="calories")
    cats = []
    for i in items:
        if i["category"] not in cats:
            cats.append(i["category"])
    print(f"wrote {len(items)} items ({len(held)} held back) to {out}: " + ", ".join(f"{c} {sum(1 for i in items if i['category'] == c)}" for c in cats))


if __name__ == "__main__":
    main()
