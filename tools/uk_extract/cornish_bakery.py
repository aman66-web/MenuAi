#!/usr/bin/env python3
"""Build data/source/cornish-bakery/ from The Cornish Bakery's official "Allergen Information" matrix (a CALORIES-ONLY chain, with the
allergens read from the same matrix).

    python3 tools/uk_extract/cornish_bakery.py path/to/Allergen_Matrix_V42.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own website links from its footer, one download):
    https://thecornishbakery.com/  ->  https://cdn.shopify.com/s/files/1/0598/2512/7573/files/Allergen_Matrix_V42.pdf?v=1773755583
    "Document : V42", dated 26-02-2026 on every page; PDF created 2026-02-26 (Excel). 10 landscape A4 pages, text layer.
    robots.txt of thecornishbakery.com: "Allow: /"; of cdn.shopify.com: only two script paths are disallowed.
Needs `pdftotext` and `pdftoppm` (poppler). The table is read by position and by its ruled lines: see cornish_bakery_pdf.py.

The matrix prints ONE calorie figure per item ("Kcal each") and no protein, carbohydrate, fat, salt, weight or kJ, so every item is
calories-only (docs/DATA.md "Calories-only chains"). Calories are copied as printed ("1039", "0"). Only names, categories, sizes and tags
are written by hand, in ITEMS below: the script stops if the rows printed on the pages differ from this table (a new, renamed or removed
row, another page order), so a human re-checks the table when the bakery publishes a new matrix.

What is published, what is not:
- 81 rows are printed. 4 print "n/a" instead of a calorie figure (Whole Cows Milk, Skimmed Cows Milk, Oatly Oat Milk, Soya Milk): not
  listed. The page-1 sentence "*Soft Drinks & Pre packaged retail please see pack" sends those products to their packs; the matrix
  itself lists the two lemonades with "None" in the No Allergens cell, so they are published as printed (flagged in the report).
- 2 rows are listed but HELD BACK (holdback.csv): their "No Allergens" cell reads "see pack" (Double Espresso / Decaf Coffee, Stokes Brown
  Sauce Sachet). The matrix itself sends the reader to the pack, so its row is not a complete allergen statement, and the allergens are
  safety information: not published (never completed or guessed).
- Chocolate Brownie is HELD BACK too (HOLD_NAME): the matrix marks no gluten for it, which contradicts the dish name (a brownie is normally
  made with wheat flour) and nothing in the matrix or on the chain's site (no gluten-free label, no ingredients) settles it (accuracy re-check
  2026-10-08). 'Apple, Rhubarb & Custard' prints no egg mark and is published: the chain's own site lists its at-home Apple & Rhubarb pasty
  'drizzled with custard' as custard powder (milk, no egg) with the same allergens (Gluten (Wheat), Milk).
- Sizes: only hot drinks carry a size, in oz ("Latte 10oz"): copied to `serving` as printed ("10oz"). Everything else is "Kcal each" as
  sold (a pasty, a slice, a sachet, a ramekin): `serving` stays blank. Syrups, sauces, jam and cream print a figure per "each" too.
- Names: pasties get the word "Pasty" (the section heading is "Pasties"; "Traditional" alone says nothing), teas get "Tea" (section
  "Teas"); one stray ")" in the Cappuccino row is dropped; "Carrot cake" is capitalised. Every changed name keeps the printed text in
  `notes`. The printed section headings are the categories ("Pastries" and "Pastries and Cakes" are two sections on pages 2 and 3).
- Tags: `vegetarian` only for "Vegan Raspberry Croissant" (the matrix marks nothing else; the name says vegan). `contains_pork` where the
  printed name says chorizo, sausage, bacon or ham. "Meat type not stated": Large Traditional and Traditional pasties (filling not named;
  Smoked Cheddar Ploughman does not say whether it holds meat).

Allergens (docs/DATA.md "Allergens"): the matrix IS the allergen guide and every published row is read from it: each of the 14 cells as
"Contains" / "May Contain" (+ the cereals named in the gluten cell and the tree nuts named in the nuts cell). A row whose "No Allergens"
cell says "none" must have all 14 cells empty; a row with no mark and no "none" or "see pack" stops the run. Words for cereals and nuts
are looked up in common._A: an unknown word stops the run. Where the nuts cell prints "Contains (Almonds) May Contain (Hazelnuts)" the
item is published as containing nuts (almonds): the schema has no way to keep "may contain" for a nut in the same cell, so the printed
text is kept in `notes`.
"""
from __future__ import annotations
import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cornish_bakery_pdf as pdf_reader  # noqa: E402
from common import _A, sha256_file, slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "cornish-bakery"
SOURCE_URL = "https://cdn.shopify.com/s/files/1/0598/2512/7573/files/Allergen_Matrix_V42.pdf?v=1773755583"
SOURCE_TITLE = "The Cornish Bakery Allergen Information matrix, Document V42, dated 26-02-2026 (PDF created 26 February 2026)"
GUIDE_TITLE = "The Cornish Bakery Allergen Information matrix, Document V42 (26-02-2026)"
ALIASES = ["the cornish bakery", "cornish bakery"]
MAY_CONTAIN_PUBLISHED = True  # the matrix prints "May Contain" cells for every allergen
NOTE = ("Calories only: the bakery's allergen matrix prints one calorie figure per item (\"Kcal each\") and no protein, carbs, fat or salt. "
        "Sizes are given only for hot drinks (oz). Milks print no calories and are not listed; the matrix sends soft drinks and "
        "pre-packed retail items to their packs. Matrix dated 26 February 2026.")
EXPECTED_ROWS = 81
NO_CALORIES = {"Whole Cows Milk", "Skimmed Cows Milk", "Oatly Oat Milk", "Soya Milk"}
HOLD_SEE_PACK = "The matrix's 'No Allergens' cell for this row reads 'see pack': the allergen information is on the pack, so the row is not a complete allergen statement. Not published."

# Rows whose own allergen cells contradict the dish name and that nothing in the matrix or on the chain's site can settle: not published.
HOLD_NAME = {
    "Chocolate Brownie": "Allergen row contradicts the dish name: a brownie is normally made with wheat flour, but the matrix marks no gluten for it "
                         "(it marks eggs, milk, almonds and soya), prints no 'gluten free' label or ingredients, so its gluten status can't be confirmed. Not published.",
}

PORK = re.compile(r"\b(pork|chorizo|sausage|bacon|ham|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_NOT_STATED = {"Large Traditional", "Traditional"}
VEGETARIAN = {"Vegan Raspberry Croissant"}  # the printed name says vegan

PAS, PST, CAK, BRL, SAU, HOT, MSY, TEA, ICE = ("Pasties", "Pastries", "Pastries and Cakes", "Breakfast & Lunch",
                                                "Sauces, Jams, Chutney, Creams", "Hot Drinks", "Milk & Syrups", "Teas", "Iced Drinks")


def E(page, printed, header, name=None, serving="", note="", id=None):
    return dict(page=page, printed=printed, header=header, name=name or printed, serving=serving, note=note, id=id)


# One entry per row the matrix prints with a calorie figure (printed name exactly as the script reads it from the page).
ITEMS = [
    E(1, "Large Traditional", PAS, "Large Traditional Pasty"), E(1, "Traditional", PAS, "Traditional Pasty"),
    E(1, "Chicken Masala", PAS, "Chicken Masala Pasty"), E(1, "Chorizo & Mozzarella", PAS, "Chorizo & Mozzarella Pasty"),
    E(1, "Cornish Cheddar & Onion", PAS, "Cornish Cheddar & Onion Pasty"), E(1, "Garden Vegetable", PAS, "Garden Vegetable Pasty"),
    E(1, "Cauliflower & Onion Bhaji", PAS, "Cauliflower & Onion Bhaji Pasty"), E(1, "Sausage Roll", PAS),
    E(2, "Cinnamon Bun", PST), E(2, "Croissant", PST), E(2, "Pain au Chocolat", PST), E(2, "Pain aux Raisins", PST),
    E(2, "Chocolate Torsade", PST), E(2, "Cherry & Almond Croissant", PST), E(2, "Vegan Raspberry Croissant", PST),
    E(2, "Pastel De Nata", PST),
    E(3, "Apple, Rhubarb & Custard", CAK), E(3, "Carrot cake", CAK, "Carrot Cake"), E(3, "Chocolate Brownie", CAK),
    E(3, "Cornish Pudding", CAK), E(3, "Fruit Scone", CAK), E(3, "Apple Crumble Scone", CAK), E(3, "Lemon & Berry Danish", CAK),
    E(3, "Pistachio Croissant", CAK), E(3, "Orange Crème Brûlée", CAK, id="orange-creme-brulee"),  # slug() would turn the accents into hyphens
    E(4, "Bacon & Cheese Croissant", BRL), E(4, "Shakshuka Croissant", BRL), E(4, "British Ham Hock & Dijon Mayo", BRL),
    E(4, "Hot Honey & Cornish Cheddar", BRL), E(4, "Cheese Straw", BRL), E(4, "Farmhouse Sausage Roll", BRL),
    E(4, "Spinach Pie", BRL), E(4, "Pea & Feta Tortilla", BRL), E(4, "Smoked Cheddar Ploughman", BRL),
    E(5, "Stokes Brown Sauce Sachet", SAU), E(5, "Stokes Brown Sauce Ramekin", SAU), E(5, "Stokes Tomato Sauce Sachet", SAU),
    E(5, "Stokes Tomato Sauce Ramekin", SAU), E(5, "Bodd Strawberry Jam Jar", SAU), E(5, "Strawberry Jam Ramekin", SAU),
    E(5, "Onion Chutney Ramekin", SAU), E(5, "Rodda's Clotted Cream Pot", SAU), E(5, "Rodda's Clotted Cream Ramekin", SAU),
    E(5, "Butter Portions", SAU),
    E(6, "Double Espresso / Decaf Coffee", HOT),
    E(6, "Piccolo 4oz (including cows milk)", HOT, "Piccolo (including cows milk)", "4oz"),
    E(6, "Flat White 6oz (including cows milk)", HOT, "Flat White (including cows milk)", "6oz"),
    E(6, "Babycino 4oz (frothed milk)", HOT, "Babycino (frothed milk)", "4oz"),
    E(6, "Americano 8oz", HOT, "Americano", "8oz"),
    E(6, "Cappuccino 8oz (incl. cows milk) topped with chocolate powder)", HOT, "Cappuccino (incl. cows milk) topped with chocolate powder", "8oz",
      "the printed row ends with a stray ')'"),
    E(6, "Latte 10oz (incl. cows milk)", HOT, "Latte (incl. cows milk)", "10oz"),
    E(6, "Mocha 10oz (incl. cows milk)", HOT, "Mocha (incl. cows milk)", "10oz"),
    E(7, "White Mocha 10oz (incl. cows milk)", HOT, "White Mocha (incl. cows milk)", "10oz"),
    E(7, "Chai Latte (cows milk) topped with chocolate powder & cinnamon", HOT),
    E(7, "Italian Hot Chocolate", HOT), E(7, "Regular Hot Chocolate", HOT), E(7, "White Hot Chocolate", HOT),
    E(8, "Caramel Syrup", MSY), E(8, "Vanilla Syrup", MSY), E(8, "White Chocolate Syrup", MSY), E(8, "Whipped Cream with Maple Syrup", MSY),
    E(9, "Breakfast (no milk)", TEA, "Breakfast Tea (no milk)"), E(9, "Breakfast Decaf (no milk)", TEA, "Breakfast Decaf Tea (no milk)"),
    E(9, "Rooibos (no milk)", TEA, "Rooibos Tea (no milk)"), E(9, "Green Tea (no milk)", TEA), E(9, "Peppermint (no milk)", TEA, "Peppermint Tea (no milk)"),
    E(9, "Earl Grey (no milk)", TEA, "Earl Grey Tea (no milk)"), E(9, "Chamomile (no milk)", TEA, "Chamomile Tea (no milk)"),
    E(10, "Cloudy Lemonade", ICE), E(10, "Strawberry Lemonade", ICE), E(10, "Iced Latte", ICE), E(10, "Iced Mocha", ICE),
    E(10, "Iced Chai", ICE), E(10, "Iced Americano", ICE), E(10, "Iced Chocolate", ICE), E(10, "Iced Dirty Chai", ICE),
    E(10, "Strawberry Coconut Matcha", ICE),
]
# Section heading printed in the table's first cell, per page (checked on every run)
HEADERS = {1: PAS, 2: PST, 3: CAK, 4: BRL, 5: SAU, 6: HOT, 7: HOT, 8: MSY, 9: TEA, 10: ICE}
HEADERS_PRINTED = {1: "Pasties", 2: "Pastries", 3: "Pastries and Cakes", 4: "Breakfast & Lunch", 5: "Sauces, Jams, Chutney, Creams",
                   6: "Hot Drinks", 7: "Hot Drinks", 8: "Milk & Syrups", 9: "Teas", 10: "Iced Drinks"}


def phrases(text: str, where: str) -> list:
    """Printed words of a cereal / nut list ("Wheat, Barley" / "Almonds Pistachios Pecans") -> allergen phrases from common._A,
    longest match first. Raises on any word that common._A does not know (allergen words are never guessed)."""
    toks = [t for t in re.split(r"[\s/&,]+", text.strip()) if t]
    out, i = [], 0
    while i < len(toks):
        for n in (3, 2, 1):
            cand = " ".join(toks[i:i + n]).lower()
            if i + n <= len(toks) and cand in _A:
                out.append(cand)
                i += n
                break
        else:
            raise SystemExit(f"the {where} names {toks[i]!r}, a word that common._A does not know: check the guide and add it if it is one of the 14")
    return out


def read_allergens(row: dict) -> dict:
    """The row's 14 cells (+ the No Allergens cell) -> {contains, may_contain, cereals, nuts, notes, state}; stops on anything unexpected."""
    where = f"p.{row['page']} {row['name']!r}"
    contains, may, cereals, nuts, notes = set(), set(), set(), set(), []
    for key, text in row["cells"].items():
        if not text:
            continue
        # a cell is one or more "Contains|Contain|May Contain [Gluten] [(specifics)]" parts
        parts = re.findall(r"(May Contain|Contains|Contain)(?:\s+Gluten)?(?:\s*\(([^)]*)\))?", text)
        rebuilt = " ".join(re.sub(r"\s+", " ", m.group(0)).strip() for m in re.finditer(r"(May Contain|Contains|Contain)(?:\s+Gluten)?(?:\s*\(([^)]*)\))?", text))
        if not parts or rebuilt != text:
            raise SystemExit(f"{where}: the {key} cell reads {text!r}, which the script does not know how to read")
        if len(parts) > 1 and key != "nuts":
            raise SystemExit(f"{where}: the {key} cell holds several parts {text!r}")
        for mark, spec in parts:
            if spec and key not in ("gluten", "nuts"):
                raise SystemExit(f"{where}: the {key} cell prints {spec!r}, which is not expected for that allergen")
            if mark == "Contain" and key != "gluten":
                raise SystemExit(f"{where}: the {key} cell reads 'Contain' (not 'Contains')")
            words = phrases(spec, f"{where} {key} cell") if spec else []
            if mark == "May Contain":
                may.add(key)
                if spec:
                    notes.append(f"may contain {key} ({spec})")
                continue
            contains.add(key)
            for w in words:
                k, specific = _A[w]
                if k != key:
                    raise SystemExit(f"{where}: the {key} cell names {w!r}, a {k} word")
                if specific:
                    (cereals if key == "gluten" else nuts).add(specific)
        if key == "nuts" and len(parts) > 1:
            notes.append(f"nuts cell printed {text!r}")
    state = row["noall"].strip().lower()
    if state not in ("", "none", "see pack"):
        raise SystemExit(f"{where}: the No Allergens cell reads {row['noall']!r}")
    if state == "none" and (contains or may):
        raise SystemExit(f"{where}: 'none' in the No Allergens cell but allergens are marked")
    if state == "" and not (contains or may):
        raise SystemExit(f"{where}: no allergen marked and no 'none' either: the guide says nothing for this row")
    return dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts, notes=notes, state=state)


def build(rows: list) -> tuple:
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The matrix prints {len(rows)} rows, expected {EXPECTED_ROWS}: re-read the PDF and update ITEMS")
    for r in rows:
        if HEADERS_PRINTED.get(r["page"]) != r["header"]:
            raise SystemExit(f"Page {r['page']}: the section heading reads {r['header']!r}, expected {HEADERS_PRINTED.get(r['page'])!r}")
    printed = {(r["page"], r["name"]) for r in rows if r["kcal"] != "n/a"}
    table = {(e["page"], e["printed"]) for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (page, printed name)")
    new, gone = sorted(printed - table), sorted(table - printed)
    if new or gone:
        raise SystemExit(f"The matrix changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}.")
    no_cal = {r["name"] for r in rows if r["kcal"] == "n/a"}
    if no_cal != NO_CALORIES:
        raise SystemExit(f"Rows without a calorie figure changed: now {sorted(no_cal)}, expected {sorted(NO_CALORIES)}")
    by_key = {(r["page"], r["name"]): r for r in rows}
    items, report = [], []
    for e in ITEMS:
        r = by_key[(e["page"], e["printed"])]
        if r["unit"] != "kcal":
            raise SystemExit(f"p.{e['page']} {e['printed']!r}: the unit is {r['unit']!r}, expected 'kcal'")
        tags = []
        if e["printed"] in VEGETARIAN:
            tags.append("vegetarian")
        if PORK.search(e["printed"]):
            tags.append("contains_pork")
        if BEEF.search(e["printed"]):
            tags.append("contains_beef")
        note = [f"p.{e['page']}", f"printed '{e['printed']}' under '{r['header']}'"]
        if e["note"]:
            note.append(e["note"])
        if e["printed"] in MEAT_NOT_STATED:
            note.append("meat type not stated")
        a = read_allergens(r)
        note += a.pop("notes")
        state = a.pop("state")
        hold = HOLD_SEE_PACK if state == "see pack" else HOLD_NAME.get(e["printed"], "")
        if hold:
            report.append(f"HELD BACK {e['name']}: {hold}")
        items.append(dict(name=e["name"], id=e["id"], category=HEADERS[e["page"]], calories=r["kcal"], serving=e["serving"], tags="|".join(tags),
                          rankable=False, notes="; ".join(note), allergens=a, hold=hold))
    report.append(f"not listed, no calorie figure printed (n/a): {sorted(NO_CALORIES)}")
    slugs = [slug(i["name"]) for i in items]
    if len(set(slugs)) != len(slugs):
        raise SystemExit(f"Item names are not unique: {sorted({s for s in slugs if slugs.count(s) > 1})}")
    return items, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the allergen matrix PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"matrix PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    rows = pdf_reader.read_rows(args.pdf)
    items, report = build(rows)
    guide = {"title": GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="The Cornish Bakery", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES,
                             items=[{k: v for k, v in it.items() if k != "hold"} for it in items],
                             out=args.out, note=NOTE, allergen_guide=guide, nutrition_level="calories")
    # ids come from write_chain_folder (name -> slug, in category order): rebuild holdback.csv and allergens.csv from them
    with open(out / "items.csv", newline="", encoding="utf-8") as f:
        written = list(csv.DictReader(f))
    by_name = {it["name"]: it for it in items}
    if len(written) != len(items):
        raise SystemExit("items.csv row count differs from the items built")
    holdback = [(r["id"], by_name[r["name"]]["hold"]) for r in written if by_name[r["name"]]["hold"]]
    # allergens for the published rows only: a held-back row's allergen statement is incomplete, so it gets no row
    write_allergens(out, CHAIN_ID, [(r["id"], by_name[r["name"]]["allergens"]) for r in written if not by_name[r["name"]]["hold"]], guide)
    if holdback:
        with open(out / "holdback.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["item_id", "reason"])
            w.writerows(holdback)
    else:
        (out / "holdback.csv").unlink(missing_ok=True)
    cats = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))


if __name__ == "__main__":
    main()
