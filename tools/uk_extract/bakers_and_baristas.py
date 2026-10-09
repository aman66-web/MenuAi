#!/usr/bin/env python3
"""Build data/source/bakers-and-baristas/ from Bakers & Baristas' own "Nutrition & Allergen Guide" (a CALORIES-ONLY chain with
complete allergens).

    python3 tools/uk_extract/bakers_and_baristas.py path/to/BakersBaristas_Allergens_Summer2026_UK.pdf --checked-on 2026-10-09 [--out DIR]

Source (the file the chain's own page https://www.bakersbaristas.com/pages/allergen-information links to; cdn.shopify.com's robots.txt
disallows only two unrelated script paths):
    https://cdn.shopify.com/s/files/1/0790/5332/4516/files/BakersBaristas_Allergens_Summer2026_UK.pdf
    cover: "United Kingdom Autumn 2026", every page: "Version #20 - Updated 01 September 2026"; Adobe InDesign, PDF created 2026-08-21;
    34 pages with a text layer (the file name says Summer2026, the cover says Autumn 2026). Needs `pdftotext` (poppler); the table is
    read by bakers_and_baristas_pdf.py (one row per product: name, Kcal, then 19 allergen columns Y / N / MC).

The guide prints ONE nutrient, "Kcal", for each product as sold (drinks per size and per milk): protein, carbs, fat and every other
nutrient are never printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable). Calories are
copied from the PDF as printed. Allergens come from the SAME row (so every published item has an exact row): the 14 allergens with the
six gluten cereals as separate columns; "MC" = may contain.

How the guide's own wording is read:
- A drink row prints its size as the last word of the name (Small / Regular / Medium / Large) and its milk in brackets: each row is one
  item, named "Latte (oat milk, regular)" with `serving` = the printed size word. The sizes are not given in ml. Where a drink prints no
  size ("Kids Hot Chocolate (oat milk)", "Traditional Tea Regular Mug or Pot for one (...)") the name is as printed and serving stays blank.
- "Y*" (36 rows: the oat/soya/almond/coconut versions of hot chocolate, mocha, Kiddiccino and iced mocha) is the guide's "yes": the page
  says "OUR HOT CHOCOLATE POWDER DOES CONTAIN MILK, ANY MILK CHANGES WON'T REMOVE THE ALLERGEN", so milk is read as contained.
- "N*" (12 rows: Cappuccino No Chocolate Sprinkles with almond / coconut / oat / soya milk) is "no" with an asterisk that points to
  "OUR HOT CHOCOLATE POWDER USED FOR SPRINKLES CONTAIN MILK". The guide does not say what the asterisk changes for a cup without
  sprinkles, so milk is read in the SAFE direction as "may contain" (never as a clean "no").
- Gluten: a wheat/rye/barley/oats/spelt/kamut column marked Y means the dish contains gluten and names that cereal; MC means may contain.
  When a dish contains one cereal and may contain another the app shows the generic "gluten" (common.write_allergens).
- "Jacket potato toppings" (Grated Cheese, Tuna Mayonnaise, Coleslaw, Baked Beans) print "100g (Portion)": a stated 100 g portion (the
  sheet says they exclude the potato's own calories), so serving = "100 g portion" and weight_g = 100. "Tiptree Strawberry Jam 28g" prints
  its 28 g in the name (serving "28 g", weight_g 28).
- "NEW" badges are menu markers, not limited-time flags. The "LIMITED EDITION MUFFINS" section is limited_time = true.
- Two muffins carry "Made in a kitchen containing Gluten, we cannot guarantee it is suitable for Coeliac's" under their name (Blueberry
  Muffin, Banana Bread Muffin: their wheat column is N); the wording is kept in the item's notes.
- Name tidy-ups (names only, never numbers) are listed in PRINTED_AS with the printed spelling kept in the row's notes: three typos
  (Rasbperry, Eary Gray, Traditonal), a missing space after a comma, capitalisation, a doubled space. "Goat's Cheese, Caramelised Red
  Onion Chutney & Rocket" is printed without its last word (the guide cuts it) and kept as printed.
- Tags: vegetarian only for the muffin the guide itself puts under "VEGAN MUFFINS" (its name says Vegan). contains_pork when the name says
  bacon / ham / sausage / pork, contains_beef when it says beef / steak. Nothing else is inferred.

Not published (each is counted and checked on every run):
- ICE CREAM (7 rows, "B&J ..."): the column is "Kcal (Per 100g)", a per-100 g basis: never converted, so not listed.
- 8 rows with an empty Kcal cell (White/Brown Sugar Sticks, Canderel Sweetner, Pepper Sachet, Salt Sachet, Mayonnaise Sachets, Strawberry
  Jam, Butter Portions): no calories printed.
- 9 rows tagged with the guide's Halal logo and "(Halal)" in the name (Sausage Bap, Bacon Bap, Ham & Cheese Baguette / Ham & Cheddar
  Toastie / Panini with turkey ham, Chicken & Mushroom Slice, Steak Slice, Sausage Roll; page 2: "Halal. Selected stores only"): sold in
  selected stores only, so not a Great Britain-wide menu (docs/UK_DATA_PLAYBOOK.md rule 4). A rendered-page scan confirms the logo sits on
  exactly these 9 rows.

Held back (holdback.csv, kept in items.csv so a rerun cannot bring them back; never corrected):
- 24 milkshakes made "with almond / coconut / oat / soya milk" (3 flavours x 4 milks x 2 sizes): pages 30-31 print "ALLERGY ADVICE - WE
  DO NOT SERVE ANY MILKSHAKES WITH DAIRY FREE ALTERNATIVE MILKS", so the guide's own rows describe drinks it says it does not serve.
- Original Iced Matcha Latte (almond milk) Medium 85 kcal and Large 28 kcal: the larger size has far fewer calories, and Medium is above
  the skimmed (58) and coconut (55) versions; at least one is wrong and the guide gives no way to tell which, so neither is published.
- 4 rows whose own allergen marks contradict the dish's name (the accuracy audit's "name implies an allergen that is not marked" flags,
  each re-read on the rendered page: the guide prints exactly this): Tuna Mayonnaise (100 g portion) marks neither fish nor eggs; Hazelnut
  Syrup marks no nuts; Lemon Drizzle Cake and We Love Cake Chocolate Pecan Brownies mark no gluten although they are not named gluten free
  (the guide's gluten-free cake is named "Gluten Free - Triple Chocolate Fudge Cake"). They may really be gluten-free or nut-free
  products, but allergens are safety information: nothing is chosen or corrected, the rows are simply not published.
- The audit's other medium flags were read and left: "Clam" in Clamshell Muffin (packaging, not a mollusc), "Bread" in the Banana Bread
  Matcha Latte flavours (a syrup name), "Butter" in "Plain without Butter", and the two "Made without gluten" muffins (wheat N under the
  guide's own "MADE WITHOUT GLUTEN MUFFINS" heading, with its kitchen warning kept in note.txt and the row notes).
"""
from __future__ import annotations
import argparse
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bakers_and_baristas_pdf as reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "bakers-and-baristas"
SOURCE_URL = "https://cdn.shopify.com/s/files/1/0790/5332/4516/files/BakersBaristas_Allergens_Summer2026_UK.pdf"
SOURCE_TITLE = ("Bakers & Baristas Nutrition & Allergen Guide, United Kingdom, Autumn 2026 "
                "(Version #20, updated 1 September 2026; PDF created 21 August 2026)")
GUIDE_TITLE = "Bakers & Baristas Nutrition & Allergen Guide, United Kingdom, Autumn 2026 (Version #20, updated 1 September 2026)"
ALIASES = ["bakers & baristas", "bakers and baristas", "bakers baristas", "bakers&baristas"]
NOTE = ("Bakers & Baristas prints calories only, per item as sold (drinks per size and milk), so protein, carbs and fat are not published. "
        "Halal products sold in selected stores, ice cream (per 100 g) and items without calories are not listed. The chain says it "
        "handles all allergens in its kitchens and cannot guarantee any item is allergen free.")

EXPECTED_ROWS = 643
EXPECTED_ICE_CREAM = 7
EXPECTED_NO_KCAL = 8
EXPECTED_HALAL = 9
EXPECTED_MILKSHAKE_HELD = 24
ADVICE_MILKSHAKE = "WE DO NOT SERVE ANY MILKSHAKES WITH DAIRY FREE ALTERNATIVE MILKS"

CATEGORY = {
    "CLASSIC MUFFINS": "Classic muffins", "LIMITED EDITION MUFFINS": "Limited edition muffins", "DELUXE MUFFINS": "Deluxe muffins",
    "MADE WITHOUT GLUTEN MUFFINS": "Made without gluten muffins", "VEGAN MUFFINS": "Vegan muffins", "MINI MUFFINS": "Mini muffins",
    "CUPCAKES": "Cupcakes", "COOKIES": "Cookies", "DONUTS": "Donuts", "SCONES": "Scones", "PASTRIES": "Pastries",
    "SLICED CAKES": "Sliced cakes", "CAKE POPS": "Cake pops", "TRAYBAKES": "Traybakes", "TEACAKES": "Teacakes",
    "FRESH BAPS": "Fresh baps", "BAGUETTES": "Baguettes", "ITALIAN FLATBREADS": "Italian flatbreads", "BAGELS": "Bagels",
    "TOASTIES": "Toasties", "PANINIS": "Paninis", "BLOOMER SANDWICHES": "Bloomer sandwiches", "WRAPS": "Wraps",
    "FILLED CROISSANTS": "Filled croissants", "FRESH TOAST": "Fresh toast", "SAVOURY SLICES": "Savoury slices",
    "SAUSAGE ROLL": "Sausage roll", "JACKET POTATOES": "Jacket potatoes", "SOUP": "Soup",
    "COFFEE": "Coffee", "MATCHA HOT LATTES": "Matcha hot lattes", "CHOCOLATE DRINKS": "Chocolate drinks", "TEA": "Tea",
    "SPECIALITY TEAS": "Speciality teas", "EXTRAS": "Extras",  # the two EXTRAS sections are told apart by page below
    "OVER ICE": "Over ice", "MATCHA ICED LATTES": "Matcha iced lattes", "CREAMY FRAPPES": "Creamy frappes",
    "FRUIT SMOOTHIES": "Fruit smoothies", "MILKSHAKES": "Milkshakes", "ICED TEAS": "Iced teas", "ICED LEMONADES": "Iced lemonades",
    "FROZEN REFRESHERS": "Frozen refreshers", "SUGARS & CONDIMENTS": "Sugars & condiments",
}
EXTRAS_BY_PAGE = {21: "Hot drink extras", 34: "Condiment extras"}  # EXTRAS under Hot Drinks (page 21) and under Extras (page 34)

# Printed name -> tidied name (names only). The printed spelling goes into the row's notes.
PRINTED_AS = {
    "Rasbperry & Coconut Traybake": "Raspberry & Coconut Traybake",
    "Eary Gray": "Earl Grey",
    "Traditonal Lemonade Regular": "Traditional Lemonade Regular",
    "Traditonal Lemonade Large": "Traditional Lemonade Large",
    "Mozzarella,Tomato & Basil Pesto Flatbread": "Mozzarella, Tomato & Basil Pesto Flatbread",
    "White belgian Chocolate Chunk & Raspberry Cookie": "White Belgian Chocolate Chunk & Raspberry Cookie",
}
# Rows whose basis is a stated weight: printed name -> (tidied name, serving, weight_g)
PORTIONS = {
    "Grated Cheese - 100g (Portion)": ("Grated Cheese (100 g portion)", "100 g portion", "100"),
    "Tuna Mayonnaise - 100g (Portion)": ("Tuna Mayonnaise (100 g portion)", "100 g portion", "100"),
    "Coleslaw - 100g (Portion)": ("Coleslaw (100 g portion)", "100 g portion", "100"),
    "Baked Beans - 100g (Portion)": ("Baked Beans (100 g portion)", "100 g portion", "100"),
    "Tiptree Strawberry Jam 28g": ("Tiptree Strawberry Jam 28g", "28 g", "28"),
}
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_TYPE_NOT_STATED = re.compile(r"\b(chicken|turkey|tuna|salmon|fish)\b", re.I)
GLUTEN_NOTE = "Made in a kitchen containing Gluten, we cannot guarantee it is suitable for Coeliac’s"

HOLD_MILKSHAKE = ("The guide's page 30-31 advice says 'WE DO NOT SERVE ANY MILKSHAKES WITH DAIRY FREE ALTERNATIVE MILKS' but it prints "
                  "this row: the guide contradicts itself, so the drink is not published")
# Printed name -> why the guide's own allergen row contradicts the dish's name (each re-read on the rendered page)
HOLD_ALLERGEN_ROW = {
    "Tuna Mayonnaise - 100g (Portion)": "the allergen row marks neither fish nor eggs for a tuna mayonnaise: it contradicts the dish's own name",
    "Hazelnut Syrup": "the allergen row marks no nuts for a hazelnut syrup: it contradicts the dish's own name",
    "Lemon Drizzle Cake": "the allergen row marks no gluten for a cake the guide does not name gluten free: it contradicts the dish",
    "We Love Cake Chocolate Pecan Brownies": "the allergen row marks no gluten for brownies the guide does not name gluten free: it contradicts the dish",
}
HOLD_ALMOND_MATCHA = ("Original Iced Matcha Latte (almond milk): the guide prints Medium 85 kcal but Large 28 kcal (and Medium is above "
                      "the skimmed 58 and coconut 55 versions); one of the two is wrong and the guide does not say which")


def tidy(printed: str, section: str, page: int):
    """Printed name -> (display name, serving, weight_g, id source)."""
    printed = " ".join(printed.split())
    if printed in PORTIONS:
        name, serving, weight = PORTIONS[printed]
        return name, serving, weight
    base = PRINTED_AS.get(printed, printed)
    m = re.match(r"^(.*?) (Small|Regular|Medium|Large)$", base)
    if m:
        stem, size = m.group(1), m.group(2)
        name = stem[:-1] + ", " + size.lower() + ")" if stem.endswith(")") else stem + " (" + size.lower() + ")"
        return name, size, ""
    return base, "", ""


def build_items(rows: list, text: str):
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The guide has {len(rows)} rows, this script expects {EXPECTED_ROWS}: the guide changed, re-read it and update the counts.")
    if ADVICE_MILKSHAKE not in " ".join(text.split()):
        raise SystemExit("The milkshake advice about dairy free alternative milks is no longer printed: re-check HOLD_MILKSHAKE.")
    ice = [r for r in rows if r["section"] == "ICE CREAM"]
    if len(ice) != EXPECTED_ICE_CREAM or not re.search(r"Kcal \(Per 100g\)", text):
        raise SystemExit("The ice cream section changed (expected 7 rows with a per-100g Kcal column): re-check.")
    rest = [r for r in rows if r["section"] != "ICE CREAM"]
    no_kcal = [r for r in rest if not r["kcal"]]
    if len(no_kcal) != EXPECTED_NO_KCAL:
        raise SystemExit(f"{len(no_kcal)} rows without calories, expected {EXPECTED_NO_KCAL}: {[r['name'] for r in no_kcal]}")
    rest = [r for r in rest if r["kcal"]]
    halal = [r for r in rest if "(Halal)" in r["name"]]
    if len(halal) != EXPECTED_HALAL:
        raise SystemExit(f"{len(halal)} rows named (Halal), expected {EXPECTED_HALAL}")
    rest = [r for r in rest if "(Halal)" not in r["name"]]

    items, holdback, report = [], [], []
    seen = set()
    for r in rest:
        section = r["section"]
        category = EXTRAS_BY_PAGE[r["page"]] if section == "EXTRAS" else CATEGORY[section]
        printed = " ".join(r["name"].split())
        name, serving, weight = tidy(printed, section, r["page"])
        item_id = slug(name)
        if item_id in seen:
            raise SystemExit(f"Duplicate item id {item_id!r} ({printed!r} on page {r['page']}): re-check the names")
        seen.add(item_id)
        flags = r["flags"]
        a = reader.allergens_for(flags)
        # run the allergen keys through the shared word table so an unknown key can never slip in
        allergen_words(sorted(a["contains"] | a["may_contain"]), f"p{r['page']} {printed}")
        tags = []
        if section == "VEGAN MUFFINS":
            tags.append("vegetarian")
        if PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        if MEAT_TYPE_NOT_STATED.search(name) and not tags:
            report.append(f"meat type not stated: {name}")
        notes = [f"Printed '{printed}' on page {r['page']}, {r['kcal']} kcal"]
        if r["new"]:
            notes.append("marked NEW")
        if r["note"]:
            notes.append(f"guide note: {GLUTEN_NOTE}")
        if "N*" in flags:
            notes.append("milk is printed N* (asterisk -> sprinkles powder contains milk): read as may contain")
        if "Y*" in flags:
            notes.append("milk is printed Y* (asterisk -> hot chocolate powder contains milk whatever the milk)")
        if printed in PRINTED_AS or printed in PORTIONS and name != printed:
            notes.append("name tidied, spelling as printed above")
        item = {"id": item_id, "name": name, "category": category, "serving": serving, "calories": r["kcal"], "weight_g": weight,
                "tags": "|".join(tags), "limited_time": section == "LIMITED EDITION MUFFINS", "rankable": False,
                "notes": "; ".join(notes), "allergens": a}
        items.append(item)
        if section == "MILKSHAKES" and re.search(r"\((almond|coconut|oat|soya) milk", name):
            holdback.append((item_id, HOLD_MILKSHAKE))
        if printed.startswith("Original Iced Matcha Latte (almond milk)"):
            holdback.append((item_id, HOLD_ALMOND_MATCHA))
        if printed in HOLD_ALLERGEN_ROW:
            holdback.append((item_id, HOLD_ALLERGEN_ROW[printed]))
    milkshakes = [h for h in holdback if h[1] == HOLD_MILKSHAKE]
    if len(milkshakes) != EXPECTED_MILKSHAKE_HELD:
        raise SystemExit(f"{len(milkshakes)} dairy-free milkshake rows, expected {EXPECTED_MILKSHAKE_HELD}")
    if sum(1 for h in holdback if h[1] in HOLD_ALLERGEN_ROW.values()) != len(HOLD_ALLERGEN_ROW):
        raise SystemExit("A row named in HOLD_ALLERGEN_ROW is no longer printed (or printed twice): re-check it")
    if sum(1 for h in holdback if h[1] == HOLD_ALMOND_MATCHA) != 2:
        raise SystemExit("The Original Iced Matcha Latte (almond milk) rows changed: re-check HOLD_ALMOND_MATCHA")
    skipped = {"ice cream (per 100 g)": [r["name"] for r in ice], "no calories printed": [r["name"] for r in no_kcal],
               "Halal, selected stores only": [r["name"] for r in halal]}
    return items, holdback, report, skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"guide PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    reader.check_header(args.pdf)
    rows = reader.read_rows(args.pdf)
    text = reader.page_text(args.pdf)
    for needle in ("Version #20 - Updated 01 September 2026", "Autumn 2026", "Halal. Selected stores only"):
        if needle not in text:
            raise SystemExit(f"{needle!r} is no longer printed: the guide is a new version, re-check every count and the source title")
    items, holdback, report, skipped = build_items(rows, text)
    guide = {"title": GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Bakers & Baristas", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    counts = Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    print(", ".join(f"{c} {n}" for c, n in counts.items()))
    for why, names in skipped.items():
        print(f"not listed, {why}: {len(names)}: " + "; ".join(names))
    print(f"meat type not stated: {sum(1 for x in report if x.startswith('meat type not stated'))}")


if __name__ == "__main__":
    main()
