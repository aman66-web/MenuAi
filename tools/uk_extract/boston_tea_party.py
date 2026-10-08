#!/usr/bin/env python3
"""Build data/source/boston-tea-party/ from Boston Tea Party's official menus with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/boston_tea_party.py path/to/autumn-2026-menu_1a.pdf path/to/kids-menu_0926_1.pdf --checked-on 2026-10-08 [--out DIR]

Sources (the files the chain's own page https://bostonteaparty.co.uk/our-menus/ links; robots.txt allows /media/):
    main menu   https://bostonteaparty.co.uk/media/gizngioz/autumn-2026-menu_1a.pdf   (the "See an example of our menu" file and the
                menu linked for 19 of the 22 cafes; code 0926_1A; PDF created 2026-09-09, served Last-Modified 2026-09-11; 2 pages)
    kids' menu  https://bostonteaparty.co.uk/media/nihjouoc/kids-menu_0926_1.pdf       (code 0926_1; PDF created 2026-09-09; 1 page)
The other two menu files on that page (autumn-2026-menu_2a.pdf for Bath Kingsmead Square and Worcester, autumn-2026-menu_3a.pdf for
Honiton) were compared line by line with 1a: every dish and calorie value they print is also printed in 1a, with the same numbers;
1a additionally has Smoked Salmon Hash (not in 2a or 3a) and the Bacon Cheeseburger, The Aussie Veg Burger and Top your burger lines
(not in 2a). So 1a is the full menu and is the one published. Needs `pdftotext` (poppler); the pages are read by position, see
boston_tea_party_pdf.py.

The menus print calories ONLY ("847 kcal" at the end of a dish's description): protein, carbs and fat are never printed, so they stay
blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published"). No kJ, salt, sugar,
weight or other nutrient is printed either. Calories are copied from the PDFs as printed. Only the item NAMES, categories and
tags' hand-written parts are in the tables below: the script stops if the dishes printed in a column differ from the table (a new,
renamed or removed dish, a moved column, another number of calorie values), so a human re-checks the table when the menu changes.

How the menus' own wording is read:
- "Add 2 hash browns +2.50 187 kcal", "Add halloumi +2.80 219 kcal", "Top your burger: Avo +2.50 141 kcal", "Double up: add an extra
  patty +3.35 (pork 152 kcal or vegan 140 kcal)": the printed value is the add-on's own calories, so each is an item of its own, named
  "Add ... (to <dish>)" with the dish it sits under.
- "Make it vegan - switch to scrambled tofu VE 899 kcal", "Make it veggie - remove the chorizo 687 kcal 10.95 V", "Remove the bacon
  13.95 1047 kcal", "Swap clotted cream for butter 764 kcal": a variant of the dish; each prints the value for the WHOLE variant (the
  values are below the dish's own and the ones with a price print the variant's full price), so each is an item of its own.
- A line with two options and two values ("Scrambled 545 kcal or poached 499 kcal", "sausage 598 kcal or back bacon 396 kcal",
  "Choose Apple & Rhubarb 24 kcal or Apple & Sour Cherry 24 kcal") is one item per option.
- The dips (Sriracha mayo, Stokes Real Brown Sauce, Creamy garlic & chive) are printed twice with the same values: under "Add two dips
  to six hash browns" (Hash browns) and under "Dips" (Sides & extras). Both are kept, named as printed, because the menu does not
  say whether the value is for one dip or for two.
- Kids' menu items get " (kids)" so names stay unique (Scrambled Egg, Poached Egg, Hash Brown, Avocado, Milk... are on both menus).
- No serving is stated, except 330ml for the Lucky Saint beer ("0.5% ABV 330ml 53 kcal"). Coffee / hot chocolate / chai sizes are not
  stated ("Large also available" is printed under the hot drinks and the star is not part of the text layer).
- "New!" before a dish name is a menu marker, not a limited-time flag, so limited_time stays false.
- Tags: vegetarian when the menu's own V or VE mark stands straight before the number ("Hash Brown VE 94 kcal") or straight after
  "kcal" ("... 847 kcal V"), or the line says "Make it vegan". The menu's NGO mark (non-gluten option) is not a tag. contains_pork /
  contains_beef when the dish's printed name or description says so (bacon, ham, sausage, pork, chorizo; beef, burger patties that
  say beef), "vegan sausage" excluded. A few variants name an ingredient they REMOVE ("Remove the bacon"): their meat tags are set by
  hand below. Nothing else is inferred.

Items not listed, because the menus print no calories for them: Bloody Mary, Prosecco, Buck's Fizz, Strawberry Mimosa, Lost and
Grounded Keller / Wanna Go To The Sun, Thatchers Rascal Cider, Still/Sparkling Mineral Water, all teapots (Boston Breakfast, Decaf,
Earl Grey, Berry & Hibiscus, Dragonwell Green tea, Japanese Cherry Blossom, Digestive, Activate), and the cakes and pastries "at the
counter". Not read at all: the Afternoon Tea set menu (https://bostonteaparty.co.uk/media/lc5hyjzt/afternoon-tea-0326-all.pdf, two
sheets dated 0326 and 0925, with scone lines whose basis is unclear).

Allergens (docs/DATA.md "Allergens") are NOT published: the menus print only a notice ("speak to a member of the team before you
order... we cannot list every ingredient") and the V / VE / NGO marks; the chain's FAQ says to ask staff for "our current allergen
information", and the site has no allergen page or file. So there is no allergen_guide.csv and no allergens.csv.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import boston_tea_party_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "boston-tea-party"
SOURCE_URL = "https://bostonteaparty.co.uk/media/gizngioz/autumn-2026-menu_1a.pdf"
SOURCE_TITLE = ("Boston Tea Party autumn 2026 menu with calories (file autumn-2026-menu_1a.pdf, code 0926_1A, PDF created 9 September 2026) "
                "and kids' menu (kids-menu_0926_1.pdf, code 0926_1)")
ALIASES = ["boston tea party", "btp"]
NOTE = ("Calories only, as printed beside each dish on the autumn 2026 menu (the version most cafes use: Bath Kingsmead Square, Worcester "
        "and Honiton print slightly shorter ones) and on the kids' menu. Teas, water, alcohol, cakes and the afternoon tea set menu are "
        "not listed. Drink sizes are not stated.")
EXPECTED_ITEMS = 147

PORK = re.compile(r"\b(pork|chorizo|bacon|ham|sausages?|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
NO_PORK_PHRASES = re.compile(r"\bvegan sausage\b", re.I)

# Menu section names (as the menus print them, sentence case) = categories, in reading order.
BREKKY, LIGHT, BRUNCH, MUFFIN, LUNCH, TOASTIE, HASH, SIDES = ("All day brekky", "Lighter breakfasts", "Brunch", "Breakfast muffins", "Lunch",
                                                             "Boston toasties", "Hash browns", "Sides & extras")
SMOOTHIE, COOLER, TIPPLE, BEER, SOFTS, CAKES, MATCHA, COFFEE, HOTTIES = ("Smoothies & shakes", "Coolers & juices", "Brunch tipples",
                                                                        "Craft beer & cider", "Softs", "Cakes & treats", "Matcha", "Coffee",
                                                                        "Other hotties")
K_BYO, K_MINI, K_PAN, K_MAIN, K_SWEET, K_SHAKE, K_DRINK = ("Kids: Build your own breakfast", "Kids: Mini meals", "Kids: Pancakes",
                                                           "Kids: Mains", "Kids: Sweet treats", "Kids: Shakes", "Kids: Drinks")


def E(key, name, cat, **opts):
    """key = text the item's own chunk must contain (its printed name, or the option's printed label); name = published name."""
    return dict(key=key, name=name, cat=cat, **opts)


# One list per (page, column) of the main menu; one entry per "NNN kcal" the column prints, in reading order (top to bottom).
MAIN = {
    (1, 0): [
        E("The Full Monty", "The Full Monty", BREKKY),
        E("The Boss Breakfast", "The Boss Breakfast", BREKKY),
        E("The Breakfast", "The Breakfast", BREKKY),
        E("Add 2 hash browns +2.50", "Add 2 hash browns (to The Breakfast)", BREKKY),
        E("The Veggie", "The Veggie", BREKKY),
        E("Add halloumi +2.80", "Add halloumi (to The Veggie)", BREKKY),
        E("Make it vegan – switch to scrambled tofu", "The Veggie, vegan (switch to scrambled tofu)", BREKKY),
        E("Avocado & Ricotta on Toast", "Avocado & Ricotta on Toast", LIGHT),
        E("Add a poached egg +1.50", "Add a poached egg (to Avocado & Ricotta on Toast)", LIGHT),
        E("Granola Bowl", "Granola Bowl", LIGHT),
        E("Butcher’s Bap", "Butcher’s Bap with Old English sausage", LIGHT),
        E("or back bacon", "Butcher’s Bap with back bacon", LIGHT),
        E("Add 2 hash browns +2.50", "Add 2 hash browns (to Butcher’s Bap)", LIGHT),
        E("Free-Range Eggs on Toast", "Free-Range Eggs on Toast, scrambled", LIGHT, veg=True,
          note="Printed 'Scrambled 545 kcal or poached 499 kcal V NGO': the V mark closes the line, so it is read for both options"),
        E("or poached", "Free-Range Eggs on Toast, poached", LIGHT),
    ],
    (1, 1): [
        E("Sweetcorn Hash", "Sweetcorn Hash", BRUNCH),
        E("Santa Fe Fritters", "Santa Fe Fritters", BRUNCH),
        E("Add halloumi +2.80", "Add halloumi (to Santa Fe Fritters)", BRUNCH),
        E("Smoked Salmon Hash", "Smoked Salmon Hash", BRUNCH, note="Not on the Bath Kingsmead Square, Worcester and Honiton menus (2a, 3a)"),
        E("Add a poached egg +1.50", "Add a poached egg (to Smoked Salmon Hash)", BRUNCH),
        E("Shakshuka with Chorizo", "Shakshuka with Chorizo", BRUNCH),
        E("Make it veggie – remove the chorizo", "Shakshuka without chorizo (veggie)", BRUNCH, meat=(),
          note="Printed 'Make it veggie - remove the chorizo 687 kcal 10.95 V': the dish's own price, so the value is for the whole dish"),
        E("Buttermilk Pancakes", "Buttermilk Pancakes with smoked streaky bacon & Boston maple syrup", BRUNCH),
        E("Blueberry compote, natural yoghurt", "Buttermilk Pancakes with blueberry compote, natural yoghurt & Boston maple syrup", BRUNCH),
        E("Smoked Salmon, Avocado & Scrambled Eggs", "Smoked Salmon, Avocado & Scrambled Eggs", BRUNCH),
        E("Eggs Benedict", "Eggs Benedict", BRUNCH),
        E("Eggs Royale", "Eggs Royale", BRUNCH),
        E("Add avo to your Benedict or Royale +2.50", "Add avo (to Eggs Benedict or Eggs Royale)", BRUNCH),
        E("Boss Smoked streaky bacon", "Boss Breakfast Muffin", MUFFIN),
        E("Sausage Pork sausage patty", "Sausage Breakfast Muffin", MUFFIN),
        E("Veggie Vegan sausage patty", "Veggie Breakfast Muffin", MUFFIN),
        E("Make it vegan – with vegan cheese", "Veggie Breakfast Muffin, vegan (vegan cheese & baby leaf spinach)", MUFFIN),
        E("Add an extra patty +3.35 (pork", "Double up: extra pork patty (add to a breakfast muffin)", MUFFIN),
        E("or vegan 140", "Double up: extra vegan patty (add to a breakfast muffin)", MUFFIN),
    ],
    (1, 2): [
        E("Mexican Eggs", "Mexican Eggs", LUNCH),
        E("Add avo smash +2.00", "Add avo smash (to Mexican Eggs)", LUNCH),
        E("Quesadilla", "Quesadilla", LUNCH),
        E("Roasted Vegetable Flatbread", "Roasted Vegetable Flatbread", LUNCH),
        E("Add hot honey halloumi +2.80", "Add hot honey halloumi (to Roasted Vegetable Flatbread)", LUNCH),
        E("Roasted Vegetable Buddha Bowl", "Roasted Vegetable Buddha Bowl", LUNCH),
        E("Add hot honey halloumi +2.80", "Add hot honey halloumi (to Roasted Vegetable Buddha Bowl)", LUNCH),
        E("Bacon Cheeseburger", "Bacon Cheeseburger", LUNCH, note="Not on the Bath Kingsmead Square and Worcester menus (2a)"),
        E("Remove the bacon 13.95", "Bacon Cheeseburger without bacon", LUNCH, meat=("contains_beef",),
          note="Printed 'Remove the bacon 13.95 1047 kcal': the dish's own reduced price, so the value is for the whole dish"),
        E("The Aussie Veg Burger", "The Aussie Veg Burger", LUNCH, note="Not on the Bath Kingsmead Square and Worcester menus (2a)"),
        E("Make it vegan – remove the halloumi 11.95", "The Aussie Veg Burger without halloumi (vegan)", LUNCH, veg=True,
          note="Printed 'Make it vegan - remove the halloumi 11.95 1137 kcal': the dish's own reduced price, so the value is for the whole dish"),
        E("Hash brown +1.25", "Top your burger: Hash brown", LUNCH),
        E("Avo +2.50", "Top your burger: Avo", LUNCH),
        E("Fried egg +1.50", "Top your burger: Fried egg", LUNCH),
        E("Mature cheddar cheese +1.00", "Top your burger: Mature cheddar cheese", LUNCH),
        E("Ham & Cheese", "Ham & Cheese Toastie", TOASTIE),
        E("Cheese & Baked Bean", "Cheese & Baked Bean Toastie", TOASTIE),
        E("Mushroom & Pesto", "Mushroom & Pesto Toastie", TOASTIE),
        E("Make it vegan – swap to vegan cheese", "Mushroom & Pesto Toastie, vegan (vegan cheese)", TOASTIE,
          note="Printed '(NGO unavailable)': no non-gluten option for the vegan version"),
    ],
    (1, 3): [
        E("Two Hash Browns", "Two Hash Browns", HASH),
        E("Six Hash Browns", "Six Hash Browns", HASH),
        E("Add two dips to six hash browns Sriracha mayo", "Add two dips to six hash browns: Sriracha mayo", HASH),
        E("Stokes Real Brown Sauce", "Add two dips to six hash browns: Stokes Real Brown Sauce", HASH),
        E("or Creamy garlic & chive", "Add two dips to six hash browns: Creamy garlic & chive", HASH),
        E("Large Portion of Fries", "Large Portion of Fries", SIDES),
        E("Old English Sausage", "Old English Sausage", SIDES),
        E("Back Bacon", "Back Bacon", SIDES),
        E("Smoked Streaky Bacon", "Smoked Streaky Bacon", SIDES),
        E("Free-Range Chorizo", "Free-Range Chorizo", SIDES),
        E("Smoked Salmon", "Smoked Salmon", SIDES),
        E("Avocado", "Avocado", SIDES),
        E("Roasted Flat Mushroom", "Roasted Flat Mushroom", SIDES),
        E("Poached Egg", "Poached Egg", SIDES),
        E("Scrambled Egg", "Scrambled Egg", SIDES),
        E("Halloumi", "Halloumi", SIDES),
        E("Dips Sriracha mayo", "Dips: Sriracha mayo", SIDES),
        E("Stokes Real Brown Sauce", "Dips: Stokes Real Brown Sauce", SIDES),
        E("or Creamy garlic & chive", "Dips: Creamy garlic & chive", SIDES),
    ],
    (2, 0): [
        E("Berry Peachy Smoothie", "Berry Peachy Smoothie", SMOOTHIE),
        E("The Green One Smoothie", "The Green One Smoothie", SMOOTHIE),
        E("Pineapple Coco Smoothie", "Pineapple Coco Smoothie", SMOOTHIE),
        E("Raspberry & Mango Smoothie", "Raspberry & Mango Smoothie", SMOOTHIE),
        E("Strawberry Ripple Shake", "Strawberry Ripple Shake", SMOOTHIE, note="Printed 'V (VE available)': the value is for the V version"),
        E("Chocolate Oreo Shake", "Chocolate Oreo Shake", SMOOTHIE, note="Printed 'V (VE available)': the value is for the V version"),
        E("Lotus Biscoff Shake", "Lotus Biscoff Shake", SMOOTHIE, note="Printed 'V (VE available)': the value is for the V version"),
        E("Homemade Lemonade", "Homemade Lemonade", COOLER),
        E("Orange Juice", "Orange Juice", COOLER),
        E("Cloudy Apple Juice", "Cloudy Apple Juice", COOLER),
        E("Homemade Iced Tea", "Homemade Iced Tea", COOLER),
    ],
    (2, 1): [
        E("Go virgin - ditch the vodka", "Bloody Mary, virgin (ditch the vodka)", TIPPLE,
          note="Printed 'Go virgin - ditch the vodka 50 kcal 4.90 VE': the virgin drink's own price, so the value is for the whole drink"),
        E("Lucky Saint Alcohol Free Superior", "Lucky Saint Alcohol Free Superior Unfiltered Lager", BEER, serving="330ml"),
        E("Coca-Cola", "Coca-Cola", SOFTS),
        E("Diet Coke", "Diet Coke", SOFTS),
        E("Coke Zero", "Coke Zero", SOFTS),
        E("Belvoir Farm Sparkling Elderflower", "Belvoir Farm Sparkling Elderflower", SOFTS),
        E("Choose Apple & Rhubarb", "Flawsome Lightly Sparkling Juice, Apple & Rhubarb", SOFTS),
        E("or Apple & Sour Cherry", "Flawsome Lightly Sparkling Juice, Apple & Sour Cherry", SOFTS),
        E("Counter Culture Kombucha Soda", "Counter Culture Kombucha Soda", SOFTS),
        E("Cream Tea", "Cream Tea", CAKES),
        E("Swap clotted cream for butter", "Cream Tea with butter instead of clotted cream", CAKES),
        E("Make it vegan – swap clotted cream for vegan spread", "Cream Tea, vegan (vegan spread instead of clotted cream)", CAKES),
    ],
    (2, 2): [
        E("Matcha Latte", "Matcha Latte", MATCHA),
        E("Vanilla Matcha Latte", "Vanilla Matcha Latte", MATCHA),
        E("Iced Matcha Latte", "Iced Matcha Latte", MATCHA),
        E("Iced Vanilla Matcha Latte", "Iced Vanilla Matcha Latte", MATCHA),
        E("Iced Strawberry Matcha Latte", "Iced Strawberry Matcha Latte", MATCHA),
        E("Iced Peaches & Cream Matcha Latte", "Iced Peaches & Cream Matcha Latte", MATCHA),
        E("Espresso", "Espresso", COFFEE),
        E("Americano", "Americano", COFFEE),
        E("Flat White", "Flat White", COFFEE),
        E("Cappuccino", "Cappuccino", COFFEE),
        E("Latte", "Latte", COFFEE),
        E("Mocha", "Mocha", COFFEE),
        E("Piccolo", "Piccolo", COFFEE),
        E("Iced Latte Espresso over milk", "Iced Latte", COFFEE),
        E("Maple Blended Iced Coffee", "Maple Blended Iced Coffee", COFFEE),
        E("Hot Chocolate", "Hot Chocolate", HOTTIES),
        E("Chai Latte", "Chai Latte", HOTTIES),
    ],
}

KIDS = {
    (1, 0): [
        E("Scrambled Egg", "Scrambled Egg (kids)", K_BYO),
        E("Bacon", "Bacon (kids)", K_BYO),
        E("Poached Egg", "Poached Egg (kids)", K_BYO),
        E("Sausage", "Sausage (kids)", K_BYO),
        E("Hash Brown", "Hash Brown (kids)", K_BYO),
        E("Beans", "Beans (kids)", K_BYO),
        E("Buttered Toast", "Buttered Toast (kids)", K_BYO),
        E("Avocado", "Avocado (kids)", K_BYO),
        E("Vegan Sausage Patty", "Vegan Sausage Patty (kids)", K_BYO),
        E("Mushroom", "Mushroom (kids)", K_BYO),
        E("Scrambly Eggs & Soldiers", "Scrambly Eggs & Soldiers (kids)", K_MINI),
        E("Beans on Toast", "Beans on Toast (kids)", K_MINI),
        E("Granola Bowl with Yoghurt, Berry Compote & Banana", "Granola Bowl with Yoghurt, Berry Compote & Banana (kids)", K_MINI),
        E("Bacon & Maple Syrup", "Bacon & Maple Syrup Pancakes (kids)", K_PAN),
        E("Maple Syrup", "Maple Syrup Pancakes (kids)", K_PAN),
        E("Blueberry Compote", "Blueberry Compote Pancakes (kids)", K_PAN),
        E("Banana & Lotus Biscoff Spread", "Banana & Lotus Biscoff Spread Pancakes (kids)", K_PAN),
    ],
    (1, 1): [
        E("Beef Burger", "Beef Burger (kids)", K_MAIN),
        E("Sweetcorn Fritter Burger", "Sweetcorn Fritter Burger (kids)", K_MAIN),
        E("Double Cheese Toastie", "Double Cheese Toastie (kids)", K_MAIN),
        E("Cheese & Ham Toastie", "Cheese & Ham Toastie (kids)", K_MAIN),
        E("Beetroot Houmous", "Beetroot Houmous, Cucumber, Carrot Sticks & Flatbread Soldiers (kids)", K_MAIN),
    ],
    (1, 2): [
        E("Chocolate Brownie Ice Cream Sundae", "Chocolate Brownie Ice Cream Sundae (kids)", K_SWEET),
        E("Vanilla Ice Cream & Lotus Biscoff", "Vanilla Ice Cream & Lotus Biscoff Topping (kids)", K_SWEET,
          note="Printed 'V 242 kcal (VE available)': the value is for the V version"),
        E("Chocolate Brownie V", "Chocolate Brownie (kids)", K_SWEET),
        E("Strawberry", "Strawberry Shake (kids)", K_SHAKE),
        E("Chocolate", "Chocolate Shake (kids)", K_SHAKE),
        E("Lotus Biscoff", "Lotus Biscoff Shake (kids)", K_SHAKE),
        E("Raspberry & Mango", "Raspberry & Mango Smoothie (kids)", K_DRINK),
        E("OJ", "OJ (kids)", K_DRINK),
        E("Apple Juice", "Apple Juice (kids)", K_DRINK),
        E("Homemade Lemonade", "Homemade Lemonade (kids)", K_DRINK),
        E("Milk", "Milk (kids)", K_DRINK),
        E("Mini Hot Chocolate", "Mini Hot Chocolate (kids)", K_DRINK),
        E("Babyccino", "Babyccino (kids)", K_DRINK),
    ],
}


def _kcal_words(pdf: Path) -> int:
    """Independent count of the word 'kcal' (pdftotext -raw reading order, no columns): every calorie value must be consumed."""
    text = subprocess.run(["pdftotext", "-raw", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    return len(re.findall(r"\bkcal\b", text))


def build_items(pdf: Path, kind: str, table: dict) -> list[dict]:
    streams = pdf_reader.read_streams(pdf, kind)
    cols_with_kcal = {k for k, s in streams.items() if pdf_reader.occurrences(s)}
    if cols_with_kcal != set(table):
        raise SystemExit(f"{pdf.name}: calories are printed in columns {sorted(cols_with_kcal)} but the table covers {sorted(table)}: the layout changed")
    items = []
    used = 0
    for col, entries in table.items():
        occ = pdf_reader.occurrences(streams[col])
        if len(occ) != len(entries):
            raise SystemExit(f"{pdf.name} column {col}: {len(occ)} calorie values printed, the table has {len(entries)} items: the menu changed, "
                             "re-read it and update the table")
        for o, e in zip(occ, entries):
            chunk = o["chunk"]
            pos = chunk.find(e["key"])
            if pos < 0:
                raise SystemExit(f"{pdf.name} column {col}: item {e['name']!r} expects {e['key']!r} in {chunk!r}: the menu changed or the table is out of order")
            desc = chunk[pos:]
            tags = []
            if e.get("veg") or any(m in ("V", "VE") for m in o["marks"]):
                tags.append("vegetarian")
            meat = e.get("meat")
            if meat is None:
                meat = []
                if PORK.search(NO_PORK_PHRASES.sub("", desc)):
                    meat.append("contains_pork")
                if BEEF.search(desc):
                    meat.append("contains_beef")
            tags.extend(meat)
            printed = re.sub(r" +", " ", desc)
            if len(printed) > 170:
                printed = printed[:80] + " ... " + printed[-80:]
            note = f"Printed: {printed}; marks: {' '.join(o['marks']) or 'none'}"
            if e.get("note"):
                note += f"; {e['note']}"
            item = dict(name=e["name"], category=e["cat"], calories=o["value"], tags="|".join(tags), rankable=False, notes=note)
            if e.get("serving"):
                item["serving"] = e["serving"]
            items.append(item)
            used += 1
    if used != _kcal_words(pdf):
        raise SystemExit(f"{pdf.name}: {_kcal_words(pdf)} 'kcal' words in the file but {used} were read: a calorie value is outside the columns")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("main_pdf", type=Path, help="autumn-2026-menu_1a.pdf (SOURCE_URL)")
    ap.add_argument("kids_pdf", type=Path, help="kids-menu_0926_1.pdf")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"main menu PDF sha256 {sha256_file(args.main_pdf)}  {args.main_pdf}")
    print(f"kids menu PDF sha256 {sha256_file(args.kids_pdf)}  {args.kids_pdf}")
    items = build_items(args.main_pdf, "main", MAIN) + build_items(args.kids_pdf, "kids", KIDS)
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check the tables")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit(f"Item names are not unique: {sorted(n for n in set(names) if names.count(n) > 1)}")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Boston Tea Party", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
                             nutrition_level="calories")
    cats: dict = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))


if __name__ == "__main__":
    main()
