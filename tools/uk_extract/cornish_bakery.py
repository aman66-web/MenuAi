#!/usr/bin/env python3
"""Build data/source/cornish-bakery/ from The Cornish Bakery's official "Allergen Information Booklet" (a CALORIES-ONLY chain, with the
allergens read from the same booklet).

    python3 tools/uk_extract/cornish_bakery.py path/to/CB-AB-A4-A-1_Allergen_Book_V48_Proof.pdf --checked-on 2026-11-17 [--out DIR]

Source (the file the chain's own website links from its footer, one download):
    https://thecornishbakery.com/  ->  https://cdn.shopify.com/s/files/1/0598/2512/7573/files/CB-AB-A4-A-1_Allergen_Book_V48_Proof.pdf?v=1791951635
    "Document : V48", dated 01-09-2026 on every table page; PDF created 2026-10-01 (InDesign). 20 landscape A4 pages, tables on pages 3-18,
    sha256 a12da6496aecb490c37a3ec934c6c260074742084bff517a4f625e8a6e315428 (read 2026-11-17).
    robots.txt of thecornishbakery.com: "Allow: /"; of cdn.shopify.com: only two script paths are disallowed.
    Until 2026-11-17 the source was the "Allergen Information" matrix, Document V42 (26-02-2026, Allergen_Matrix_V42.pdf, 10 pages, 81 rows):
    this script and cornish_bakery_pdf.py were adapted to V48 then (new page layout, item table, cell wording); V42 is in git history.
Needs `pdftotext` and `pdftoppm` (poppler). The table is read by position and by its ruled lines: see cornish_bakery_pdf.py.

The booklet prints ONE calorie figure per item ("Kcal each") and no protein, carbohydrate, fat, salt, weight or kJ, so every item is
calories-only (docs/DATA.md "Calories-only chains"). Calories are copied as printed ("1039", "0"). Only names, categories, sizes and tags
are written by hand, in ITEMS below: the script stops if the rows printed on the pages differ from this table (a new, renamed or removed
row, another page order), so a human re-checks the table when the bakery publishes a new booklet.

What is published, what is not (V48):
- 98 rows are printed. 6 milks print "n/a" instead of a calorie figure (NO_CALORIES) and "Dirty Chai Latte (cows milk) topped with
  cinnamon" has an empty calorie cell: not listed. The sentence "*Soft Drinks & Pre packaged retail please see pack" on page 3 sends those
  products to their packs.
- HELD BACK (holdback.csv), listed but not published, never completed or guessed:
  - "see pack" in the "No Allergens" cell (Double Espresso / Decaf Coffee, Stokes Brown Sauce Sachet): not a complete allergen statement;
  - no allergen marked AND an empty "No Allergens" cell (UNMARKED: four syrups and Cherry Berry Lemonade): the row says nothing;
  - the allergen row contradicts the drink's own name (HOLD_NAME): "Americano 8oz (black)" marks milk "Contains"; "Chai Latte (cows milk)
    topped with cinnamon" marks nothing at all.
- Sizes: only some hot drinks carry a size, in oz ("Latte 10oz"): copied to `serving` as printed ("10oz"). Everything else is "Kcal each"
  as sold (a pasty, a slice, a sachet, a ramekin): `serving` stays blank.
- Names: pasties get the word "Pasty" (the section heading is "Pasties"; "Traditional" alone says nothing), teas get "Tea" (section
  "Teas"); one stray ")" in the Cappuccino row is dropped; a size in oz moves to `serving`. Every changed name keeps the printed text in
  `notes`. The printed section headings are the categories (one per page, "Iced Drinks (Cold Brew)" included).
- Tags: `vegetarian` only for "Vegan Raspberry Croissant" (the booklet marks nothing else; the name says vegan). `contains_pork` where the
  printed name says chorizo, sausage, bacon or ham. "Meat type not stated": Large Traditional and Traditional pasties (filling not named).

Allergens (docs/DATA.md "Allergens"): the booklet IS the allergen guide and every published row is read from it: each of the 14 cells as
"Contains" / "May Contain" (+ the cereals named in the gluten cell and the tree nuts named in the nuts cell), see read_allergens. A row whose
"No Allergens" cell says "None" must have all 14 cells empty. Words for cereals and nuts are looked up in common._A (+ "Brazil", EXTRA_WORDS):
an unknown word stops the run. Where a cell prints "Contains" and "May contain" for the same allergen ("Contains Gluten (Wheat), May contain
(Rye, Barley, Oats, Spelt)") the item contains that allergen and write_allergens leaves the specific kinds out (the app shows the generic
allergen, so the may-contain kinds are not hidden); the printed text is kept in `notes`. Two oat-milk drinks print "Gluten (Oats)" with no
"Contains" or "May contain": read as contains (BARE_GLUTEN; the direction that can only add a warning), noted.
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
SOURCE_URL = "https://cdn.shopify.com/s/files/1/0598/2512/7573/files/CB-AB-A4-A-1_Allergen_Book_V48_Proof.pdf?v=1791951635"
SOURCE_TITLE = "The Cornish Bakery Allergen Information Booklet, Document V48, dated 01-09-2026 (PDF created 1 October 2026)"
GUIDE_TITLE = "The Cornish Bakery Allergen Information Booklet, Document V48 (01-09-2026)"
ALIASES = ["the cornish bakery", "cornish bakery"]
MAY_CONTAIN_PUBLISHED = True  # the booklet prints "May Contain" cells for every allergen
NOTE = ("Calories only: the bakery's allergen booklet prints one calorie figure per item (\"Kcal each\") and no protein, carbs, fat or salt. "
        "Sizes are given only for some hot drinks (oz). Milks print no calories and are not listed; the booklet sends soft drinks and "
        "pre-packed retail items to their packs. Booklet dated 1 September 2026.")
EXPECTED_ROWS = 98
NO_CALORIES = {"Whole Cows Milk", "Skimmed Cows Milk", "Coconut milk", "Oat Milk (Oatly)", "Oat Milk (Minor Figures)", "Soya Milk (NEC)"}  # "n/a"
BLANK_CALORIES = {"Dirty Chai Latte (cows milk) topped with cinnamon"}  # the calorie cell is empty: not listed
HOLD_SEE_PACK = "The booklet's 'No Allergens' cell for this row reads 'see pack': the allergen information is on the pack, so the row is not a complete allergen statement. Not published."
HOLD_UNMARKED = ("The booklet marks no allergen for this row and its 'No Allergens' cell is empty (not 'None'), so the row says nothing about "
                 "its allergens. Not published.")
# Rows whose allergen cells are all empty AND whose No Allergens cell is empty (V48). Any other such row stops the run.
UNMARKED = {"Blueberry Syrup", "Peach Iced Tea Syrup", "Strawberry Smoothie Syrup", "Yuzu + Ginger Syrup", "Cherry Berry Lemonade",
            "Chai Latte (cows milk) topped with cinnamon"}  # the last is held with its own reason (HOLD_NAME)

# Rows whose own allergen cells contradict the dish name and that nothing in the booklet settles: not published.
HOLD_NAME = {
    "Americano 8oz (black)": "Allergen row contradicts the drink's own name: it is printed '(black)' but the milk cell reads 'Contains'. Not published.",
    "Chai Latte (cows milk) topped with cinnamon": "Allergen row contradicts the drink's own name: it names cows milk, but the booklet marks no allergen at all "
                                                   "for it (no milk) and its 'No Allergens' cell is empty. Not published.",
}
# Cells V48 prints as the bare allergen with its cereal, with no 'Contains' or 'May contain' (two oat-milk drinks): read as "contains",
# the direction that can only add a warning (as Deli by Shell's unexplained "M" is read as "may contain"); the printed text is in `notes`.
BARE_GLUTEN = re.compile(r"Gluten\s*\(([^()]*)\)")
# A word the booklet prints in its nut lists that common._A does not hold: "Brazil" beside "Hazelnut, Walnut, Cashew, ..." (V48).
EXTRA_WORDS = {"brazil": ("nuts", "brazil nut")}

PORK = re.compile(r"\b(pork|chorizo|sausage|bacon|ham|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_NOT_STATED = {"Large Traditional", "Traditional"}
VEGETARIAN = {"Vegan Raspberry Croissant"}  # the printed name says vegan

PAS, PST, CAK, BRL, SAU, HOT, MLK, MSY, TEA, ICE, ICB = ("Pasties", "Pastries", "Pastries and Cakes", "Breakfast & Lunch",
                                                        "Sauces, Jams, Chutney, Creams", "Hot Drinks", "Milks", "Milk & Syrups", "Teas",
                                                        "Iced Drinks", "Iced Drinks (Cold Brew)")


def E(page, printed, header, name=None, serving="", note="", id=None):
    return dict(page=page, printed=printed, header=header, name=name or printed, serving=serving, note=note, id=id)


# One entry per row the booklet prints with a calorie figure (PDF page number; printed name exactly as the script reads it from the page).
# Names are only tidied where the printed name says less on its own (pasties get "Pasty", teas get "Tea", a size in oz moves to `serving`).
ITEMS = [
    E(3, "Large Traditional", PAS, "Large Traditional Pasty"), E(3, "Traditional", PAS, "Traditional Pasty"),
    E(3, "Chorizo & Mozzarella", PAS, "Chorizo & Mozzarella Pasty"), E(3, "Cornish Cheddar & Onion", PAS, "Cornish Cheddar & Onion Pasty"),
    E(3, "Garden Vegetable", PAS, "Garden Vegetable Pasty"), E(3, "Cauliflower & Onion Bhaji", PAS, "Cauliflower & Onion Bhaji Pasty"),
    E(3, "Sausage Roll", PAS),
    E(4, "Apple and Rhubarb Pasty", PST), E(4, "Cherry & Almond Croissant", PST), E(4, "Chocolate Torsade", PST),
    E(4, "Cinnamon Bun", PST), E(4, "Croissant", PST),
    E(5, "Pain au Chocolat", CAK), E(5, "Pain aux Raisins", CAK), E(5, "Pastel De Nata", CAK), E(5, "Vegan Raspberry Croissant", CAK),
    E(6, "Banana, Chocolate & Cornish Peanut Butter Pastry", CAK), E(6, "Cornish Pudding", CAK), E(6, "Fruit Scone", CAK),
    E(6, "Caramel Pear and Miso Pastry", CAK),
    E(7, "Orange & White Chocolate Chai Bun", CAK), E(7, "Pistachio Croissant", CAK), E(7, "Spiced Marmalade Cake", CAK), E(7, "Winter Bun", CAK),
    E(8, "Bacon & Cheese Croissant", BRL), E(8, "British Ham Hock & Dijon Mayo", BRL), E(8, "Hot Honey & Cornish Cheddar", BRL),
    E(8, "West Country Cheese Straw", BRL),
    E(9, "Farmhouse Sausage Roll", BRL), E(9, "Pea & Feta Tortilla", BRL), E(9, "Spinach and Feta Pastry", BRL),
    E(10, "Stokes Brown Sauce Sachet", SAU), E(10, "Stokes Brown Sauce Ramekin", SAU), E(10, "Stokes Tomato Sauce Sachet", SAU),
    E(10, "Stokes Tomato Sauce Ramekin", SAU), E(10, "Bodd Strawberry Jam Jar", SAU), E(10, "Strawberry Jam Ramekin", SAU),
    E(10, "Onion Chutney Ramekin", SAU), E(10, "Rodda's Clotted Cream Pot", SAU), E(10, "Rodda's Clotted Cream Ramekin", SAU),
    E(10, "Butter Portions", SAU),
    E(11, "Double Espresso / Decaf Coffee", HOT),
    E(11, "Piccolo 4oz (including cows milk)", HOT, "Piccolo (including cows milk)", "4oz"),
    E(11, "Flat White 6oz (including cows milk)", HOT, "Flat White (including cows milk)", "6oz"),
    E(11, "Babycino 4oz (cows milk)", HOT, "Babycino (cows milk)", "4oz"),
    E(11, "Americano 8oz (black)", HOT, "Americano (black)", "8oz"),
    E(11, "Cappuccino 8oz (incl. cows milk) topped with chocolate powder)", HOT, "Cappuccino (incl. cows milk) topped with chocolate powder", "8oz",
      "the printed row ends with a stray ')'"),
    E(11, "Latte 10oz (incl. cows milk)", HOT, "Latte (incl. cows milk)", "10oz"),
    E(12, "Mocha 10oz (incl. cows milk)", HOT, "Mocha (incl. cows milk)", "10oz"),
    E(12, "White Mocha 10oz (cows milk)", HOT, "White Mocha (cows milk)", "10oz"),
    E(12, "Tall White (cows milk)", HOT), E(12, "Chai Latte (cows milk) topped with cinnamon", HOT),
    E(12, "Salted Banana Chai Latte (oat Milk)", HOT), E(12, "Matcha Latte (oat milk)", HOT),
    E(13, "Pure Matcha", HOT), E(13, "Italian Hot Chocolate (cows milk)", HOT), E(13, "Regular Hot Chocolate (cows Milk)", HOT),
    E(13, "White Hot Chocolate (cows Milk)", HOT),
    E(14, "Cold Foam", MLK),
    E(15, "Almond Syrup", MSY), E(15, "Banana Puree", MSY), E(15, "Caramel Syrup", MSY), E(15, "Cherry Syrup", MSY), E(15, "Blueberry Syrup", MSY),
    E(15, "Earl Grey Syrup", MSY), E(15, "Hazelnut Syrup", MSY), E(15, "Peach Iced Tea Syrup", MSY), E(15, "Strawberry Smoothie Syrup", MSY),
    E(15, "Vanilla Syrup", MSY), E(15, "White Chocolate Syrup", MSY), E(15, "Yuzu + Ginger Syrup", MSY),
    E(16, "Breakfast (no milk)", TEA, "Breakfast Tea (no milk)"), E(16, "Breakfast Decaf (no milk)", TEA, "Breakfast Decaf Tea (no milk)"),
    E(16, "Rooibos (no milk)", TEA, "Rooibos Tea (no milk)"), E(16, "Green Tea (no milk)", TEA), E(16, "Peppermint (no milk)", TEA, "Peppermint Tea (no milk)"),
    E(16, "Earl Grey (no milk)", TEA, "Earl Grey Tea (no milk)"), E(16, "Chamomile (no milk)", TEA, "Chamomile Tea (no milk)"),
    E(17, "Cloudy Lemonade", ICE), E(17, "Strawberry Lemonade", ICE), E(17, "Cherry Berry Lemonade", ICE), E(17, "Iced Chai", ICE),
    E(17, "Iced Dirty Chai", ICE), E(17, "Iced Chocolate (cows milk)", ICE), E(17, "Peach & Earl Grey Iced Tea", ICE), E(17, "Iced Matcha", ICE),
    E(18, "Iced Americano", ICB), E(18, "Iced Flat White", ICB), E(18, "Iced Latte", ICB), E(18, "Iced Mocha", ICB),
    E(18, "Iced Cherry Almond with Cold Foam", ICB),
]
# Section heading printed in the table's first cell, per PDF page (checked on every run)
HEADERS = {3: PAS, 4: PST, 5: CAK, 6: CAK, 7: CAK, 8: BRL, 9: BRL, 10: SAU, 11: HOT, 12: HOT, 13: HOT, 14: MLK, 15: MSY, 16: TEA, 17: ICE, 18: ICB}
HEADERS_PRINTED = dict(HEADERS)


def phrases(text: str, where: str) -> list:
    """Printed words of a cereal / nut list ("Wheat, Barley" / "Almonds Pistachios Pecans") -> allergen phrases from common._A (+ EXTRA_WORDS),
    longest match first. Raises on any word that neither knows (allergen words are never guessed)."""
    toks = [t for t in re.split(r"[\s/&,]+", text.strip()) if t]
    out, i = [], 0
    while i < len(toks):
        for n in (3, 2, 1):
            cand = " ".join(toks[i:i + n]).lower()
            if i + n <= len(toks) and (cand in _A or cand in EXTRA_WORDS):
                out.append(cand)
                i += n
                break
        else:
            raise SystemExit(f"the {where} names {toks[i]!r}, a word that common._A does not know: check the guide and add it if it is one of the 14")
    return out


def _word(w: str) -> tuple:
    return _A[w] if w in _A else EXTRA_WORDS[w]


MARK = re.compile(r"\b(May\s+Contain|Contains|Contain)\b", re.I)
OWN_WORD = {"gluten": "Gluten", "peanuts": "Peanuts"}   # V48 prints "Contains Gluten (...)" and "Contains Peanuts"


def read_allergens(row: dict) -> dict:
    """The row's 14 cells (+ the No Allergens cell) -> {contains, may_contain, cereals, nuts, notes, state}; stops on anything unexpected.

    V48 (refresh of 2026-11-17) prints a cell as one or two parts, each "Contains" / "May Contain" / "May contain" (and, in the gluten
    cell, "Contain"), followed by the allergen's own word where the booklet prints it ("Gluten", "Peanuts") and, in the gluten and nuts
    cells only, the cereals / tree nuts in brackets ("Contains Gluten (Wheat), May contain (Rye, Barley, Oats, Spelt, Kamut)"; a bracket is
    sometimes left open or a word sits outside it, so brackets and commas only separate words). Every word left over must be a cereal (gluten
    cell) or a tree nut (nuts cell) that common._A knows, so no other text can slip through. A part says "contains" or "may contain"; where a
    cell holds both for the same allergen, write_allergens shows the generic allergen (the specific kinds would hide the may-contain warning)."""
    where = f"p.{row['page']} {row['name']!r}"
    contains, may, cereals, nuts, notes = set(), set(), set(), set(), []
    for key, text in row["cells"].items():
        if not text:
            continue
        t = " ".join(text.split())
        marks = list(MARK.finditer(t))
        parts = []                      # (kind, rest of the part)
        pre = t[:marks[0].start()].strip() if marks else t
        if pre:
            m = BARE_GLUTEN.fullmatch(pre)
            if key != "gluten" or not m or marks:
                raise SystemExit(f"{where}: the {key} cell reads {text!r}, which the script does not know how to read")
            parts.append(("contains", "Gluten " + pre[len("Gluten"):]))
            notes.append(f"the {key} cell prints {t!r} with no 'Contains' or 'May contain': read as contains")
        for i, m in enumerate(marks):
            word = " ".join(m.group(1).split()).lower()
            if word == "contain" and key != "gluten":
                raise SystemExit(f"{where}: the {key} cell reads 'Contain' (not 'Contains')")
            rest = t[m.end(): marks[i + 1].start() if i + 1 < len(marks) else len(t)]
            parts.append(("may" if word == "may contain" else "contains", rest))
        if len(parts) > 2 or (len(parts) > 1 and key not in ("gluten", "nuts")):
            raise SystemExit(f"{where}: the {key} cell holds several parts {text!r}")
        for kind, rest in parts:
            rest = rest.strip()
            own = OWN_WORD.get(key)
            if own and rest[:len(own)].lower() == own.lower():
                rest = rest[len(own):]
            words = " ".join(x for x in re.split(r"[\s,()]+", rest) if x)
            if words and key not in ("gluten", "nuts"):
                raise SystemExit(f"{where}: the {key} cell prints {rest!r} after {kind!r}, which is not expected for that allergen")
            if re.search(r"[^\w\s,()'+-]", rest):
                raise SystemExit(f"{where}: the {key} cell holds unexpected characters {rest!r}")
            found = phrases(words, f"{where} {key} cell") if words else []
            for w in found:
                k, _ = _word(w)
                if k != key:
                    raise SystemExit(f"{where}: the {key} cell names {w!r}, a {k} word")
            if kind == "may":
                may.add(key)
                if words:
                    notes.append(f"may contain {key} ({words})")
                continue
            contains.add(key)
            for w in found:
                _, specific = _word(w)
                if specific:
                    (cereals if key == "gluten" else nuts).add(specific)
        if len(parts) > 1:
            notes.append(f"{key} cell printed {t!r}")
    state = row["noall"].strip().lower()
    if state not in ("", "none", "see pack"):
        raise SystemExit(f"{where}: the No Allergens cell reads {row['noall']!r}")
    if state == "none" and (contains or may):
        raise SystemExit(f"{where}: 'none' in the No Allergens cell but allergens are marked")
    if state == "" and not (contains or may):
        state = "unmarked"
    return dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts, notes=notes, state=state)


def build(rows: list) -> tuple:
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The booklet prints {len(rows)} rows, expected {EXPECTED_ROWS}: re-read the PDF and update ITEMS")
    for r in rows:
        if HEADERS_PRINTED.get(r["page"]) != r["header"]:
            raise SystemExit(f"Page {r['page']}: the section heading reads {r['header']!r}, expected {HEADERS_PRINTED.get(r['page'])!r}")
    printed = {(r["page"], r["name"]) for r in rows if r["kcal"] not in ("n/a", "")}
    table = {(e["page"], e["printed"]) for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (page, printed name)")
    new, gone = sorted(printed - table), sorted(table - printed)
    if new or gone:
        raise SystemExit(f"The booklet changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}.")
    no_cal = {r["name"] for r in rows if r["kcal"] == "n/a"}
    if no_cal != NO_CALORIES:
        raise SystemExit(f"Rows without a calorie figure changed: now {sorted(no_cal)}, expected {sorted(NO_CALORIES)}")
    blank = {r["name"] for r in rows if r["kcal"] == ""}
    if blank != BLANK_CALORIES:
        raise SystemExit(f"Rows with an empty calorie cell changed: now {sorted(blank)}, expected {sorted(BLANK_CALORIES)}")
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
        if (state == "unmarked") != (e["printed"] in UNMARKED):
            raise SystemExit(f"p.{e['page']} {e['printed']!r}: marks no allergen and no 'None' ({state!r}) but is not listed in UNMARKED, or the reverse")
        hold = (HOLD_NAME.get(e["printed"]) or (HOLD_SEE_PACK if state == "see pack" else "") or (HOLD_UNMARKED if state == "unmarked" else ""))
        if hold:
            report.append(f"HELD BACK {e['name']}: {hold}")
        items.append(dict(name=e["name"], id=e["id"], category=HEADERS[e["page"]], calories=r["kcal"], serving=e["serving"], tags="|".join(tags),
                          rankable=False, notes="; ".join(note), allergens=a, hold=hold))
    report.append(f"not listed, no calorie figure printed (n/a): {sorted(NO_CALORIES)}; empty calorie cell: {sorted(BLANK_CALORIES)}")
    slugs = [slug(i["name"]) for i in items]
    if len(set(slugs)) != len(slugs):
        raise SystemExit(f"Item names are not unique: {sorted({s for s in slugs if slugs.count(s) > 1})}")
    return items, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the allergen booklet PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"booklet PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
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
