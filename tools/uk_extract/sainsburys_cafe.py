#!/usr/bin/env python3
"""Build data/source/sainsburys-cafe/ from Sainsbury's own in-store Cafe menus (a CALORIES-ONLY chain, allergen link only).

    python3 tools/uk_extract/sainsburys_cafe.py path/to/folder --checked-on 2026-10-08 [--out DIR]

`folder` holds the five menu PDFs exactly as the chain's own help site serves them (one download each, robots.txt of
help.sainsburys.co.uk answers 404 = no rules):
    https://help.sainsburys.co.uk/client/asset/Cafemenubreakfast.pdf        "Breakfast served until 11.30am" (cooked breakfasts, toast, porridge)
    https://help.sainsburys.co.uk/client/asset/Cafemenubreakfast2.pdf       "Breakfast served until 11.30am" (breakfast sandwich, bap, bap stack, pancakes)
    https://help.sainsburys.co.uk/client/asset/Cafemainmenu1.pdf            "Main Meals"
    https://help.sainsburys.co.uk/client/asset/Cafemenulightbiteskids.pdf   "Light Bites" and "Great for the Kids"
    https://help.sainsburys.co.uk/client/asset/Cafemenudrinks.pdf           "Drinks"
All five are ONE 1920 x 1080 pt page with a text layer, Adobe InDesign 18.2, PDF created 18 April 2023 09:59 UTC (modified 09:59:29);
none prints a menu date or version. The help site serves them with Last-Modified 22 August 2025 (a re-upload) and file-mtime 2 May 2023.
SHA-256 are printed on every run. The chain's own Cafe page on sainsburys.co.uk refuses this environment (HTTP 403, Akamai), so whether
a newer menu exists there could not be checked: that is stated in note.txt. The menus print £ prices (not used).
Needs `pdftotext` (poppler). The pages are read by position: see sainsburys_cafe_pdf.py.

What the menus print, per item as served: calories (kcal), energy (kJ) and %RI of 2000 kcal. Never protein, carbohydrate, fat, sugars,
salt or weights, so this is a CALORIES-ONLY chain (docs/DATA.md): protein, carbs and fat stay blank. kcal and kJ are copied from the
PDFs as printed ("<1" and "<4" for the zero-calorie drinks); the %RI is only used to check the kcal (RI = kcal / 20, within 1) and is
recorded in each row's notes (not exported). Only item names, categories and tags are written by hand, in SPECS below, and the script
stops if the labels or the number of values on a page differ from this table (a new, renamed or removed dish, a moved column).

How the menus' own wording is read:
- Breakfast menu: "Calories for all items are given for white bread and baked egg"; the breakfast sandwich / bap menu: "Calories given
  for white bread". Options that swap an ingredient print "(add 63kcal / 261kJ / 3%RI)" (multiseed bread, scrambled egg): those are
  differences, not items, so they are not listed (they are kept in the notes of the dish they belong to).
- "Add honey" / "Add banana" under Porridge and Kids' porridge, and the seven "Breakfast bap stack" extras, print their own energy
  (not a dish total): items of their own, named "Add honey (to Porridge)" and "Bap stack add-on: Sausage" and so on.
- Light Bites "Add a white plait roll & butter" (+£0.70, 314kcal / 1324kJ / 16% RI under Tomato & basil soup 119kcal): the menu does not say
  whether 314 is the roll and butter alone or the soup with them, so the row is not published (nothing is guessed).
- The kids' mains and sides print one value each ("Choose a main and 3 sides £3.25"); no serving is stated, so `serving` stays blank. The
  whole kids' meal and the Children's lunch bag print no energy: not listed.
- Drinks: Regular and Large columns are two items ("(regular)" / "(large)", serving "Regular" / "Large"); Flat white and Double espresso
  have a Regular value only. The calories "have been calculated using semi-skimmed milk" (printed under the drinks). "Syrups" print one
  value per flavour (the syrup's own energy).
- Dishes printed on two menus (All day breakfast and All day vegetarian breakfast on the breakfast and the main menu; the two pancakes on
  the breakfast sandwich menu and Light Bites) are one item each: the script compares kcal, kJ and %RI of the two printings and holds
  the item back if they ever differ. Today they are identical.
- Rows whose own kcal and kJ contradict each other (kJ / kcal outside 4.0-4.4 for 15 kcal or more) are held back, never corrected: the
  Gingerbread and Toffee nut syrups. The script stops if a different row shows the same problem.
- Tags: vegetarian where the menu's own words say so (the two dishes named "vegetarian", the "No chicken burger*" with vegan garlic
  mayo, whose asterisk points at the "Vegan and Plant Based Recipe" footnote, and the Shroomdog sandwich and bap, "Make it Vegan with
  Flora plant based spread *"). contains_pork when the name says sausage, bacon, ham or pepperoni, contains_beef when it says beef or
  steak. Everything else is "meat type not stated" (printed in the report).

Allergens (docs/DATA.md "Allergens") are link-only. Each menu prints one sentence: "Products from our cafes are not suitable for those with
an allergy to Fish, Molluscs, Crustaceans, Milk, Egg, Cereals containing gluten (Wheat, Rye, Barley, Oats, Spelt, Kamut), Peanut, Soya, Nuts,
Celery, Mustard, Sesame or Sulphites." There is no per-item allergen guide for the cafes (the chain's help page tells shoppers with allergies to
avoid its cafes), so nothing per item can be copied: only the help page's link is published.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sainsburys_cafe_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "sainsburys-cafe"
BASE = "https://help.sainsburys.co.uk/client/asset/"
SOURCE_URL = BASE + "Cafemainmenu1.pdf"
SOURCE_TITLE = ("Sainsbury's Café menus with calories and kJ (breakfast, breakfast sandwiches and baps, main meals, light bites and kids, "
                "drinks): five PDFs on help.sainsburys.co.uk, all created 18 April 2023, no menu date printed (accessed 8 October 2026)")
ALIASES = ["sainsburys cafe", "sainsbury's cafe", "sainsburys café", "sainsbury's café"]
ALLERGEN_GUIDE_TITLE = ("Sainsbury's help: allergens and intolerances in own brand and in-store prepared products (tells shoppers with "
                        "allergies to avoid its cafés; no per-item guide; no date shown)")
ALLERGEN_GUIDE_URL = "https://help.sainsburys.co.uk/help/products/products-instore-allergen"
MAY_CONTAIN_PUBLISHED = False  # one blanket "not suitable for ... allergy" sentence; no per-item traces information
NOTE = ("Sainsbury's prints calories and kJ only, so protein, carbs and fat are not published. These are its café menus from April "
        "2023 (no menu date is printed), so the café may have changed since. Breakfast figures are for white bread and baked egg; "
        "drinks use semi-skimmed milk. It says café food is not suitable for anyone with an allergy to any of the 14 allergens.")
EXPECTED_ITEMS = 92

FILES = {
    "breakfast": dict(pdf="Cafemenubreakfast.pdf", title="Breakfast menu", columns={"L": (0, 960), "R": (960, 1920)}),
    "baps": dict(pdf="Cafemenubreakfast2.pdf", title="Breakfast sandwich and bap menu", columns={"L": (0, 1920)}),
    "main": dict(pdf="Cafemainmenu1.pdf", title="Main meals menu", columns={"L": (0, 960), "R": (960, 1920)}),
    "lightbites": dict(pdf="Cafemenulightbiteskids.pdf", title="Light bites and kids menu", columns={"L": (0, 960), "R": (960, 1920)}),
    "drinks": dict(pdf="Cafemenudrinks.pdf", title="Drinks menu", columns={"L": (0, 960), "R": (960, 1920)}),
}

BRK, BAP, MAIN, LB, KIDS, DRK = ("Breakfast", "Breakfast sandwiches and baps", "Main meals", "Light bites", "Kids", "Drinks")
PORK, BEEF, VEG = "contains_pork", "contains_beef", "vegetarian"
REGULAR, LARGE = (200, 560), (560, 900)  # drinks table: x band of the Regular and the Large column (points)


def I(name, cat, tags="", serving="", note=""):
    return dict(name=name, cat=cat, tags=tags, serving=serving, note=note)


def S(label, col="L", *, n=1, adds=0, xs=None, out=None, same_as=None, skip=None):
    """One printed label: it must own `n` energy values and `adds` '(add ...)' values; `out` has one item per value."""
    out = out or []
    if not skip and not same_as and len(out) != n:
        raise ValueError(f"{label}: {n} values but {len(out)} items")
    return dict(label=label, col=col, n=n, n_adds=adds, xs=xs, out=out, same_as=same_as, skip=skip)


SWAP_BREAD = "Option printed: multiseed bread adds 63kcal / 261kJ / 3%RI (a swap, not listed)"
WHITE = "Calories are given for white bread and baked egg (printed on the menu)."
SPECS = {
    "breakfast": [
        S("All day breakfast", n=1, adds=2, out=[I("All day breakfast", BRK, PORK, note=WHITE + " Also on the main meals menu with the same values. Options: multiseed bread (add 63kcal / 261kJ / 3%RI), scrambled egg (add 25kcal / 104kJ / 1%RI): swaps, not listed.")]),
        S("All day vegetarian breakfast", n=1, adds=2, out=[I("All day vegetarian breakfast", BRK, VEG, note=WHITE + " Also on the main meals menu with the same values. Options: multiseed bread (add 63kcal / 261kJ / 3%RI), scrambled egg (add 50kcal / 209kJ / 2%RI): swaps, not listed.")]),
        S("Bitesize breakfast", n=1, adds=2, out=[I("Bitesize breakfast", BRK, PORK, note=WHITE + " Options: multiseed bread (add 63kcal / 261kJ / 3%RI), scrambled egg (add 25kcal / 104kJ / 1%RI): swaps, not listed.")]),
        S("Bitesize vegetarian breakfast", n=1, adds=2, out=[I("Bitesize vegetarian breakfast", BRK, VEG, note=WHITE + " Options: multiseed bread (add 63kcal / 261kJ / 3%RI), scrambled egg (add 25kcal / 104kJ / 1%RI): swaps, not listed.")]),
        S("Eggs & bacon", n=1, adds=2, out=[I("Eggs & bacon", BRK, PORK, note=WHITE + " Options: multiseed bread (add 63kcal / 261kJ / 3%RI), scrambled egg (add 50kcal / 209kJ / 2%RI): swaps, not listed.")]),
        S("Toast and one topping", "R", n=0),
        S("Beans", "R", out=[I("Toast and one topping: Beans", BRK, note=WHITE)]),
        S("Scrambled eggs", "R", out=[I("Toast and one topping: Scrambled eggs", BRK, note=WHITE)]),
        S("Cheese", "R", out=[I("Toast and one topping: Cheese", BRK, note=WHITE)]),
        S("Eggs", "R", out=[I("Toast and one topping: Eggs", BRK, note=WHITE)]),
        S("Options: Multiseed bread", "R", n=0, adds=1),
        S("Toast", "R", out=[I("Toast", BRK, note=WHITE + " 2 slices of toast with butter and a choice of jam, marmalade, honey or Marmite. Option: multiseed bread (add 126kcal / 521kJ / 6%RI): a swap, not listed.")]),
        S("Options: Multiseed bread", "R", n=0, adds=1),
        S("Porridge", "R", out=[I("Porridge", BRK, note=WHITE + " Non-dairy option available (not listed).")]),
        S("Add honey", "R", out=[I("Add honey (to Porridge)", BRK, note="Printed +£0.35 under Porridge: the honey's own energy, not a porridge total")]),
        S("Add banana", "R", out=[I("Add banana (to Porridge)", BRK, note="Printed +£0.55 under Porridge: the banana's own energy, not a porridge total")]),
        S("Kids’ porridge", "R", out=[I("Kids’ porridge", BRK, note="No %RI printed on the kids' lines")]),
        S("Add honey", "R", out=[I("Add honey (to Kids’ porridge)", BRK, note="Printed +£0.35 under Kids' porridge: the honey's own energy")]),
        S("Add banana", "R", out=[I("Add banana (to Kids’ porridge)", BRK, note="Printed +£0.55 under Kids' porridge: the banana's own energy")]),
        S("Kids’ scrambled egg on toast", "R", out=[I("Kids’ scrambled egg on toast", BRK, note="No %RI printed on the kids' lines")]),
        S("Options: Multiseed bread", "R", n=0, adds=1),
    ],
    "baps": [
        S("Breakfast sandwich", n=0, adds=1),
        S("Sausage", out=[I("Breakfast sandwich: Sausage", BAP, PORK, note="Calories given for white bread")]),
        S("Bacon", out=[I("Breakfast sandwich: Bacon", BAP, PORK, note="Calories given for white bread")]),
        S("Shroomdog", out=[I("Breakfast sandwich: Shroomdog", BAP, VEG, note="Calories given for white bread. Printed 'Make it Vegan with Flora plant based spread *' (asterisk = vegan and plant based recipe footnote)")]),
        S("Breakfast bap", n=0),
        S("Sausage", out=[I("Breakfast bap: Sausage", BAP, PORK)]),
        S("Bacon", out=[I("Breakfast bap: Bacon", BAP, PORK)]),
        S("Shroomdog", out=[I("Breakfast bap: Shroomdog", BAP, VEG, note="Printed 'Make it Vegan with Flora plant based spread *' (asterisk = vegan and plant based recipe footnote)")]),
        S("Breakfast bap stack", n=0),
        S("Sausage", out=[I("Bap stack add-on: Sausage", BAP, PORK, note="Customise a Sausage, Bacon or Shroomdog bap by adding 3 items (£5.00): each extra's own energy. Same figures as the kids' Sausage")]),
        S("Mushroom", out=[I("Bap stack add-on: Mushroom", BAP, note="Customise a bap by adding 3 items: the extra's own energy")]),
        S("Bacon", out=[I("Bap stack add-on: Bacon", BAP, PORK, note="Customise a bap by adding 3 items: the extra's own energy")]),
        S("Tomato", out=[I("Bap stack add-on: Tomato", BAP, note="Customise a bap by adding 3 items: the extra's own energy")]),
        S("Shroomdog", out=[I("Bap stack add-on: Shroomdog", BAP, note="Customise a bap by adding 3 items: the extra's own energy. Same figures as the kids' Shroomdog")]),
        S("Hash brown", out=[I("Bap stack add-on: Hash brown", BAP, note="Customise a bap by adding 3 items: the extra's own energy")]),
        S("Baked egg", out=[I("Bap stack add-on: Baked egg", BAP, note="Customise a bap by adding 3 items: the extra's own energy")]),
        S("Nutella pancakes", same_as=("lightbites", "Nutella pancakes")),
        S("Lemon & sugar pancakes", same_as=("lightbites", "Lemon & sugar pancakes")),
    ],
    "main": [
        S("Beer battered cod & chips", out=[I("Beer battered cod & chips", MAIN, note="Served with peas")]),
        S("Scampi & chips", out=[I("Scampi & chips", MAIN, note="Served with peas")]),
        S("Ham, egg & chips", out=[I("Ham, egg & chips", MAIN, PORK, note="2 slices of British carvery ham, 2 eggs and chips")]),
        S("Beef lasagne", out=[I("Beef lasagne", MAIN, BEEF, note="Served with mixed leaves salad")]),
        S("Vegetable lasagne", out=[I("Vegetable lasagne", MAIN, note="Served with mixed leaves salad")]),
        S("BBQ chicken burger", out=[I("BBQ chicken burger", MAIN, note="BBQ sauce, coleslaw and mixed leaves, served with chips")]),
        S("No chicken burger*", out=[I("No chicken burger", MAIN, VEG, note="Printed 'No chicken burger*' with vegan garlic mayo; the asterisk points at the 'Vegan and Plant Based Recipe' footnote. Served with chips")]),
        S("Margherita pizza", out=[I("Margherita pizza", MAIN, note="Stonebaked 10 inch pizza with tomato sauce and mozzarella")]),
        S("Pepperoni pizza", out=[I("Pepperoni pizza", MAIN, PORK, note="Stonebaked 10 inch pizza with tomato sauce, mozzarella and pepperoni")]),
        S("Steak & ale pie", "R", out=[I("Steak & ale pie", MAIN, BEEF, note="Served with peas, mash and gravy")]),
        S("Sausages & mash", "R", out=[I("Sausages & mash", MAIN, PORK, note="3 sausages, mash, peas and gravy")]),
        S("Shroomdogs & mash", "R", out=[I("Shroomdogs & mash", MAIN, note="3 shroomdogs, mash, peas and gravy; the gravy's meat type is not stated")]),
        S("All day breakfast", "R", adds=2, same_as=("breakfast", "All day breakfast")),
        S("All day vegetarian breakfast", "R", adds=2, same_as=("breakfast", "All day vegetarian breakfast")),
    ],
    "lightbites": [
        S("Jacket potato", n=0),
        S("Beans", out=[I("Jacket potato with beans", LB, note="Jacket potato with topping and mixed leaf salad")]),
        S("Cheese", out=[I("Jacket potato with cheese", LB, note="Jacket potato with topping and mixed leaf salad")]),
        S("Cheese & beans", out=[I("Jacket potato with cheese & beans", LB, note="Jacket potato with topping and mixed leaf salad")]),
        S("Tuna & sweetcorn", out=[I("Jacket potato with tuna & sweetcorn", LB, note="Jacket potato with topping and mixed leaf salad")]),
        S("Fish finger sandwich", out=[I("Fish finger sandwich", LB, note="3 fish fingers and mixed leaf in white bread")]),
        S("Tomato & basil soup", out=[I("Tomato & basil soup", LB)]),
        S("Add a white plait roll & butter", skip="Printed +£0.70 with 314kcal / 1324kJ / 16% RI under the soup's 119kcal: the menu does not say whether that is the roll and butter alone or the soup with them, so it is not published"),
        S("Chips", out=[I("Chips", LB)]),
        S("Nutella pancakes", out=[I("Nutella pancakes", LB, note="2 pancakes served with Nutella. Also on the breakfast sandwich menu with the same values")]),
        S("Lemon & sugar pancakes", out=[I("Lemon & sugar pancakes", LB, note="2 pancakes served with lemon and sugar. Also on the breakfast sandwich menu with the same values")]),
        S("Shroomdog", "R", out=[I("Kids’ main: Shroomdog", KIDS, note="Kids' meal: choose a main and 3 sides (£3.25). Same figures as the bap stack Shroomdog. No %RI printed")]),
        S("Chicken nuggets", "R", out=[I("Kids’ main: Chicken nuggets", KIDS, note="Kids' meal: choose a main and 3 sides (£3.25). No %RI printed")]),
        S("Omega-3 fish fingers", "R", out=[I("Kids’ main: Omega-3 fish fingers", KIDS, note="Kids' meal: choose a main and 3 sides (£3.25). No %RI printed")]),
        S("Cheese and tomato pizza", "R", out=[I("Kids’ main: Cheese and tomato pizza", KIDS, note="Kids' meal: choose a main and 3 sides (£3.25). No %RI printed")]),
        S("Sausage", "R", out=[I("Kids’ main: Sausage", KIDS, PORK, note="Kids' meal: choose a main and 3 sides (£3.25). Same figures as the bap stack Sausage. No %RI printed")]),
        S("Carrot sticks", "R", out=[I("Kids’ side: Carrot sticks", KIDS, note="Kids' meal side. No %RI printed")]),
        S("Baked beans", "R", out=[I("Kids’ side: Baked beans", KIDS, note="Kids' meal side. No %RI printed")]),
        S("Broccoli", "R", out=[I("Kids’ side: Broccoli", KIDS, note="Kids' meal side. No %RI printed")]),
        S("Half jacket potato", "R", out=[I("Kids’ side: Half jacket potato", KIDS, note="Kids' meal side. No %RI printed")]),
        S("Peas", "R", out=[I("Kids’ side: Peas", KIDS, note="Kids' meal side. No %RI printed")]),
        S("Mashed potato", "R", out=[I("Kids’ side: Mashed potato", KIDS, note="Kids' meal side. No %RI printed")]),
    ],
    "drinks": [
        S("Filter coffee", n=2, xs=[REGULAR, LARGE], out=[I("Filter coffee, without milk (regular)", DRK, serving="Regular"), I("Filter coffee, without milk (large)", DRK, serving="Large")]),
        S("Americano", n=2, xs=[REGULAR, LARGE], out=[I("Americano, without milk (regular)", DRK, serving="Regular"), I("Americano, without milk (large)", DRK, serving="Large")]),
        S("Latte", n=2, xs=[REGULAR, LARGE], out=[I("Latte (regular)", DRK, serving="Regular"), I("Latte (large)", DRK, serving="Large")]),
        S("Cappuccino", n=2, xs=[REGULAR, LARGE], out=[I("Cappuccino (regular)", DRK, serving="Regular"), I("Cappuccino (large)", DRK, serving="Large")]),
        S("Flat white", n=1, xs=[REGULAR], out=[I("Flat white", DRK, serving="Regular", note="Printed in the Regular column only")]),
        S("Double espresso", n=1, xs=[REGULAR], out=[I("Double espresso", DRK, serving="Regular", note="Printed in the Regular column only")]),
        S("Mocha", n=2, xs=[REGULAR, LARGE], out=[I("Mocha (regular)", DRK, serving="Regular"), I("Mocha (large)", DRK, serving="Large")]),
        S("Hot chocolate", n=2, xs=[REGULAR, LARGE], out=[I("Hot chocolate (regular)", DRK, serving="Regular"), I("Hot chocolate (large)", DRK, serving="Large")]),
        S("Whipped cream", out=[I("Whipped cream", DRK, note="Printed £0.55 under the hot drinks: its own energy")]),
        S("Extra espresso shot", out=[I("Extra espresso shot", DRK, note="Printed £0.55: its own energy")]),
        S("Glass of milk", out=[I("Glass of milk", DRK)]),
        S("Babyccino", out=[I("Babyccino", DRK, note="Printed Free; no %RI printed")]),
        S("Luxury caramel hot chocolate", "R", out=[I("Luxury caramel hot chocolate", DRK, note="With whipped cream and chocolate dusting")]),
        S("Iced americano", "R", out=[I("Iced americano", DRK)]),
        S("Iced latte", "R", out=[I("Iced latte", DRK)]),
        S("Red Label tea", "R", out=[I("Red Label tea (without milk)", DRK)]),
        S("Speciality tea", "R", out=[I("Speciality tea (without milk)", DRK, note="Decaf tea, Earl Grey tea, Green tea, Flavoured teas")]),
        S("Syrups", "R", n=0),
        S("Caramel", "R", out=[I("Caramel syrup", DRK, note="Syrups printed £0.55: the syrup's own energy")]),
        S("Hazelnut", "R", out=[I("Hazelnut syrup", DRK, note="Syrups printed £0.55: the syrup's own energy")]),
        S("Gingerbread", "R", out=[I("Gingerbread syrup", DRK, note="Syrups printed £0.55: the syrup's own energy")]),
        S("Toffee nut", "R", out=[I("Toffee nut syrup", DRK, note="Syrups printed £0.55: the syrup's own energy")]),
        S("Mint", "R", out=[I("Mint syrup", DRK, note="Syrups printed £0.55: the syrup's own energy")]),
        S("Vanilla", "R", out=[I("Vanilla syrup", DRK, note="Syrups printed £0.55: the syrup's own energy")]),
        S("Sugar free caramel", "R", out=[I("Sugar free caramel syrup", DRK, note="Syrups printed £0.55: the syrup's own energy")]),
    ],
}

# Rows whose own kcal and kJ contradict each other: held back (never corrected). The script stops if any other row has the same problem.
HELD = {
    "Gingerbread syrup": "Printed 43 kcal / 150 kJ: the two figures do not match (43 kcal is about 180 kJ; 150 kJ is about 36 kcal). The menu contradicts itself, so the row is held back, not corrected.",
    "Toffee nut syrup": "Printed 34 kcal / 183 kJ: the two figures do not match (34 kcal is about 142 kJ; 183 kJ is about 44 kcal). The menu contradicts itself, so the row is held back, not corrected.",
}
KJ_PER_KCAL = (4.0, 4.4)


def number(text):
    return None if text.startswith("<") else int(text)


def triple_text(t):
    return f"{t['kcal']}kcal / {t['kj']}kJ" + (f" / {t['ri']}%RI" if t["ri"] is not None else "")


def read_all(folder: Path) -> dict:
    result = {}
    for name, f in FILES.items():
        pdf = folder / f["pdf"]
        if not pdf.exists():
            raise SystemExit(f"{pdf} not found: download {BASE}{f['pdf']}")
        segments, triples = pdf_reader.read_page(pdf)
        located = pdf_reader.locate(segments, SPECS[name], f["columns"], f["title"])
        result[name] = pdf_reader.attach(located, triples, f["columns"], f["title"])
    return result


def build(read: dict) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    items = []
    problems, skipped = [], []
    for fname, specs in read.items():
        for spec in specs:
            for t, it in zip(spec["main"], spec["out"]):
                kcal, kj, ri = number(t["kcal"]), number(t["kj"]), number(t["ri"]) if t["ri"] is not None else None
                if ri is not None and kcal is not None and abs(round(kcal / 20) - ri) > 1:
                    problems.append(f"{it['name']}: %RI {ri} does not match {kcal} kcal / 20")
                row = dict(name=it["name"], category=it["cat"], serving=it["serving"], calories=t["kcal"], energy_kj=t["kj"], tags=it["tags"],
                           rankable=False, notes="; ".join(x for x in (f"printed {triple_text(t)} ({FILES[fname]['title']})", it["note"]) if x))
                items.append(row)
            if spec["skip"]:
                skipped.append(f"{spec['label']}: {spec['skip']}")
    # the same dish printed on two menus must agree
    holdback = {}
    for fname, specs in read.items():
        for spec in specs:
            if not spec["same_as"]:
                continue
            ofile, olabel = spec["same_as"]
            other = [s for s in read[ofile] if s["label"] == olabel]
            if len(other) != 1 or len(other[0]["main"]) != 1 or len(spec["main"]) != 1:
                raise SystemExit(f"cannot compare {spec['label']!r} on {fname} with {olabel!r} on {ofile}")
            a, b = spec["main"][0], other[0]["main"][0]
            if (a["kcal"], a["kj"], a["ri"]) != (b["kcal"], b["kj"], b["ri"]):
                name = other[0]["out"][0]["name"]
                holdback[name] = (f"The two menus disagree: {FILES[fname]['title']} prints {triple_text(a)}, {FILES[ofile]['title']} prints {triple_text(b)}. "
                                  "Held back, not corrected.")
    # kJ vs kcal
    outliers = set()
    for r in items:
        kcal, kj = number(r["calories"]), number(r["energy_kj"])
        if kcal is not None and kj is not None and kcal >= 15 and not (KJ_PER_KCAL[0] <= kj / kcal <= KJ_PER_KCAL[1]):
            outliers.add(r["name"])
    if outliers != set(HELD):
        problems.append(f"kJ / kcal outside {KJ_PER_KCAL} for {sorted(outliers)}; expected exactly {sorted(HELD)}: re-read those rows")
    for name, reason in HELD.items():
        holdback[name] = reason
    if problems:
        raise SystemExit("Checks failed:\n  " + "\n  ".join(problems))
    names = [r["name"] for r in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menus changed, re-check SPECS")
    missing = [n for n in holdback if n not in names]
    if missing:
        raise SystemExit(f"held back but not an item: {missing}")
    return items, [(slug(n), r) for n, r in holdback.items()], skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path, help="folder with the five menu PDFs (see the docstring)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for f in FILES.values():
        print(f"sha256 {sha256_file(args.folder / f['pdf'])}  {f['pdf']}")
    items, holdback, skipped = build(read_all(args.folder))
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt is {len(NOTE)} characters: keep it under 400")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Sainsbury's Café", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"held back ({len(holdback)}): " + ", ".join(i for i, _ in holdback))
    for s in skipped:
        print("not published: " + s)
    veg_or_meat = [i for i in items if i["category"] != DRK and not (set(i["tags"].split("|")) & {PORK, BEEF, VEG})]
    print(f"food items with no pork / beef / vegetarian tag ('meat type not stated' or meat-free): {len(veg_or_meat)}")


if __name__ == "__main__":
    main()
