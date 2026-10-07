#!/usr/bin/env python3
"""Build data/source/creams-cafe/ from Creams Cafe's official "Allergens & Calorie Declaration and Matrix" (a CALORIES-ONLY chain,
with a complete allergen matrix).

    python3 tools/uk_extract/creams_cafe.py path/to/Allergen-Matrix--02-Oct-26.pdf --checked-on 2026-10-07 [--out DIR]

Source (the file the chain's own menu page links as "ALLERGEN INFORMATION (PDF)"):
    https://www.creamscafe.com/menu/  ->  https://www.creamscafe.com/brochures/Allergen-Matrix--02-Oct-26.pdf
    "Version - 02 Oct 2026" on every page; PDF created 2026-09-30 (Word), served Last-Modified 2026-10-02. 30 pages, text layer.
    robots.txt of creamscafe.com: Crawl-delay 3, no Disallow for /brochures/ (one page and one PDF were fetched, 3 s apart).
Needs `pdftotext` and `pdftoppm` (poppler). The tables are read by position and by the drawn page: see creams_cafe_pdf.py.

The guide prints ONE calorie figure per dish ("calorie information is found in the second column next to each dish") and no protein,
carbohydrate, fat, salt, weight or kJ, so every item is calories-only (docs/DATA.md "Calories-only chains"). Calories are copied as
printed ("16.5" stays 16.5). Only names, categories and tags are written by hand, in GROUPS below: the script stops if the groups, the
number of rows in a group, a full-width note or a row without calories differ from what is listed here, so a human re-checks this file
when Creams publishes a new matrix.

What is published, what is not (every exclusion is written down here and counted in the run's output):
- NOT listed, because the guide gives no portion and the figures are not one-dish totals: sauces, syrups, toppings and dips (pages 23
  and 24 and single rows elsewhere: the same page prints "Milk Chocolate Sauce 137" and "Nutkao Milk Chocolate Sauce 560"), and the
  PARTS of build-your-own dishes (page 12 "Create Your Own" steps, the scoop-shake base and flavour rows, the plant-based shake base and
  sorbet rows): the guide prints no total for them and we never add numbers up. Shake add-on "Whipped Cream" is a topping too.
- "Machiato" (page 19) has no calorie figure printed: not listed.
- HELD BACK (listed in items.csv and holdback.csv, never published): rows the matrix itself contradicts:
  the two "Creams Soft Vanilla Ice Cream" rows (135 kcal and a "Trial" row with 80 kcal for the same product on the same page); rows
  whose allergen cell TEXT disagrees with the cell's own colour (Creams Wafer milk, Red Velvet cake peanuts); rows with an allergen
  cell that names a cereal in the Eggs column (two rows); a row naming a nut the script has no word for ("HAZLENUTS", a printed
  misspelling: allergen words are never guessed).
- Spelling slips of ordinary words in a name are corrected (SPELLING below, e.g. "Cappucino"); product names such as "Creams Buenot"
  stay as printed. Every changed name keeps the printed text in `notes`.
- "(Eat in/TA/DEL)" after the hot chocolates (printed on the guide: eat in / takeaway / delivery) is dropped from the name.
- The guide does not mark vegetarian dishes except by name ("Vegan Belgian Chocolate Fudge Cake"): that item is tagged vegetarian.
  No item name says pork or beef. "Meat type not stated": Mexican Nachos (small, to share).

Allergens (docs/DATA.md "Allergens"): the matrix IS the allergen guide, and every published row is read from it: each of the 14 cells as
"Contains" / "May Contain" (+ the cereal / tree nut named) from the text AND from the cell colour; a row where the two disagree is held
back (above). Words the matrix prints for cereals and nuts are looked up in common._A: an unknown word stops the run.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import creams_cafe_pdf as pdf_reader  # noqa: E402
from common import _A, sha256_file, slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "creams-cafe"
SOURCE_URL = "https://www.creamscafe.com/brochures/Allergen-Matrix--02-Oct-26.pdf"
SOURCE_TITLE = "Creams Cafe Allergens & Calorie Declaration and Matrix, Version 02 Oct 2026 (PDF created 30 September 2026)"
ALIASES = ["creams cafe", "creams café", "creams"]
GUIDE_TITLE = "Creams Cafe Allergens & Calorie Declaration and Matrix, Version 02 Oct 2026"
# The guide prints "may contain" information from the suppliers in every row.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Calories only: one figure per dish as listed in Creams Cafe's own allergen matrix; portion sizes are not stated and protein, carbs, "
        "fat and salt are not published. Sauces, syrups, toppings and the parts of build-your-own shakes and desserts are left out (no portion "
        "given). Creams says slushies contain glycerol: not recommended for children aged 4 and under.")
EXPECTED_ROWS = 402
# Full-width notes printed inside the tables (checked on every run; anything else stops the script).
EXPECTED_NOTES = {
    (12, "For matching scoops of gelato or sorbet used to create your own with the above bases please see the Gelato / Sorbet Sections."),
    (12, "For matching sauces & toppings used to create your own with the above please see the Sauces / Toppings Sections."),
    (12, "For matching scoops of sorbet used to create your own with the above bases please see the Sorbet Section."),
    (12, "For matching vegan sauces & toppings used to create your own with the above please see the Sauces / Toppings Sections."),
    (16, "Slushies products contain glycerol. Not recommended for children 4 years of age and under."),
    (16, "Select from below matching scoops of sorbet used to create your shakes with the above bases."),
}
# Product rows that print no calories: (page, text found on the row). Not listed.
EXPECTED_NO_KCAL = {(19, "Machiato")}

SPELLING = {"Geleto": "Gelato", "Cappucino": "Cappuccino", "Dougnut": "Doughnut", "Pistaccio": "Pistachio", "Siwrled": "Swirled"}
SIZE = re.compile(r"\b(Regular|Large|Small|Medium|To Share)$")

# (page, table, category label as printed, rows in it, how it is published). `show` = category shown in the app (None = not listed);
# `why` = reason when not listed; `suffix` = word added to bare flavour names so a name says what it is (and stays unique);
# `serving` = serving text when the category itself states a size; `qual` = text added in brackets (milk type).
G = dict
GROUPS = [
    G(key=(2, 1, "Savoury Pockets", 5), show="Savoury pockets"),
    G(key=(2, 1, "Savourish", 2), show="Savourish"),
    G(key=(3, 1, "Gelato", 19), show="Gelato"),
    G(key=(4, 1, "Sorbet", 5), show="Sorbet"),
    G(key=(4, 1, "Soft Serve", 2), show="Soft serve"),
    G(key=(4, 1, "Cones", 4), show="Cones"),
    G(key=(4, 1, "Wafer", 1), show="Wafer"),
    G(key=(5, 1, "Kids Menu", 6), show="Kids menu"),
    G(key=(6, 1, "Cakes & Pastries", 17), show="Cakes & pastries"),
    G(key=(7, 1, "Doughnuts", 8), show="Doughnuts"),
    # No category is printed for these seven rows: the page's own heading is "SAVOURIES, DOUGHNUTS, CAKES & BAKES"
    G(key=(7, 1, "", 7), show="Savouries"),
    G(key=(7, 1, "Birthday Cake Package", 4), show="Birthday cake package"),
    G(key=(7, 1, "Milk Cakes", 3), show="Milk cakes"),
    G(key=(8, 1, "Cookie Dough", 6), show="Cookie dough", suffix="Cookie Dough"),
    G(key=(9, 1, "Hot Waffles", 12), show="Hot waffles", suffix="Waffle"),
    G(key=(10, 1, "Fresh Crepes", 12), show="Fresh crepes", suffix="Crepe"),
    G(key=(10, 1, "FRUIT KEBABS", 1), show="Fruit kebabs"),
    G(key=(10, 1, "SMOOTHIE POTS", 3), show="Smoothie pots"),
    G(key=(11, 1, "Sensational Sundaes", 9), show="Sensational sundaes"),
    G(key=(11, 1, "Soft Siwrled Sundae", 5), show="Soft swirled sundaes"),
    G(key=(12, 1, "Create Your Own Base (Step 1)", 6), show=None, why="part of a build-your-own dish"),
    G(key=(12, 1, "Create Your Own Vegan Base (Step 1)", 3), show=None, why="part of a build-your-own dish"),
    G(key=(12, 1, "Pistachio Sauce", 1), show=None, why="sauce, part of a build-your-own dish"),
    G(key=(13, 1, "Hot Puddings", 2), show="Hot puddings"),
    G(key=(13, 1, "Hot Pockets", 4), show="Hot pockets"),
    G(key=(14, 1, "Scoop Shakes", 19), show=None, why="base and flavour rows of a build-your-own shake, no total printed"),
    G(key=(14, 1, "Add Whipped Cream", 1), show=None, why="topping, no portion stated"),
    G(key=(15, 1, "Thick Shakes", 20), show="Thick shakes", suffix="Thick Shake"),
    G(key=(15, 1, "Add Whipped Cream", 1), show=None, why="topping, no portion stated"),
    G(key=(16, 1, "Loaded Shakes", 2), show="Loaded shakes", suffix="Loaded Shake"),
    G(key=(16, 1, "Slushies", 6), show="Slushies", suffix="Slushie"),
    G(key=(16, 1, "Plantbased Shakes", 8), show=None, why="base and sorbet rows of a build-your-own shake, no total printed"),
    # No category is printed for these three rows (the page's heading is DRINKS)
    G(key=(16, 1, "", 3), show="Drinks"),
    G(key=(17, 1, "Bubble Tea Regular Size", 17), show="Bubble tea (regular)", serving="Regular", qual="regular"),
    G(key=(18, 1, "Bubble Tea Large Size", 17), show="Bubble tea (large)", serving="Large", qual="large"),
    G(key=(19, 1, "Coffee & Hot Chocolate", 1), show="Coffee & hot chocolate"),
    G(key=(19, 1, "Coffee & Hot Chocolate with Milk", 9), show="Coffee & hot chocolate with milk", qual="milk"),
    G(key=(19, 1, "Coffee and Hot Chocolate with Soya Milk", 9), show="Coffee & hot chocolate with soya milk", qual="soya milk"),
    G(key=(20, 1, "Coffee & Hot Chocolate with Coconut Milk", 9), show="Coffee & hot chocolate with coconut milk", qual="coconut milk"),
    G(key=(20, 1, "Coffee & Hot Chocolate with Almond Milk", 9), show="Coffee & hot chocolate with almond milk", qual="almond milk"),
    G(key=(21, 1, "Coffee & Hot Chocolate with Oat Milk", 9), show="Coffee & hot chocolate with oat milk", qual="oat milk"),
    G(key=(21, 1, "Floats", 2), show="Floats"),
    G(key=(21, 1, "Frappes", 3), show="Frappes", suffix="Frappe"),
    G(key=(21, 1, "Tea", 6), show="Tea"),
    G(key=(21, 1, "Milk", 1), show="Milk"),
    G(key=(22, 1, "Cold Drinks", 11), show="Cold drinks"),
    G(key=(23, 1, "Sauces", 19), show=None, why="sauce or spread, no portion stated"),
    G(key=(23, 1, "Syrups", 4), show=None, why="syrup, no portion stated"),
    G(key=(24, 1, "Toppings", 26), show=None, why="topping, no portion stated"),
    G(key=(25, 1, "Cake Upgrade", 4), show="Cake upgrade"),
    G(key=(25, 2, "Secret Menu", 2), show="Secret menu"),
    G(key=(26, 1, "FLOATS", 3), show="Pepsi collab: floats"),
    G(key=(26, 2, "Soft Swirl Sundaes", 6), show="Pepsi collab: soft swirl sundaes", suffix="Soft Swirl Sundae"),
    G(key=(27, 1, "Froffle Toasts", 4), show="Froffle toasts"),
    G(key=(28, 1, "SHAKES", 4), show="Value menu: shakes", suffix="Shake"),
    G(key=(28, 1, "COOKIE DOUGHETTES", 2), show="Value menu: cookie doughettes", suffix="Cookie Doughette"),
    G(key=(28, 1, "WAFFLE WEDGES", 4), show="Value menu: waffle wedges", suffix="Waffle Wedges"),
    G(key=(28, 1, "STUFFED PANCAKE BITES", 1), show="Value menu: stuffed pancake bites", suffix="Stuffed Pancake Bites"),
    G(key=(29, 1, "CRAVE&SAVE", 5), show="Crave & Save"),
    G(key=(30, 1, "GOO BAKES", 3), show="Winter: goo bakes", suffix="Goo Bake"),
    G(key=(30, 1, "BITES", 2), show="Winter: bites"),
    G(key=(30, 1, "HOT CHOCOLATE", 3), show="Winter: hot chocolate", suffix="Hot Chocolate"),
]
# Single rows left out of an otherwise listed group: (page, printed name) -> reason
EXCLUDE_ROWS = {
    (2, "Cheese Sauce"): "sauce, no portion stated",
    (7, "Guacamole"): "topping, no portion stated",
    (7, "Jalapenos"): "topping, no portion stated",
    (7, "Milk Sauce"): "sauce, no portion stated",
    (29, "Nacho Cheese Sauce"): "sauce, no portion stated",
    (29, "BBQ Salsa"): "dip, no portion stated",
    (29, "Chipotle Mayonnaise"): "dip, no portion stated",
}
# Rows the guide itself contradicts: (page, printed name) -> reason. Listed in items.csv and holdback.csv, never published.
HOLD = {
    (4, "Creams Soft Vanilla Ice Cream"): "The same page prints 'Trial Creams Soft Vanilla Ice Cream' at 80 kcal for what is the same product: the guide contradicts itself",
    (4, "Trial Creams Soft Vanilla Ice Cream"): "The same page prints 'Creams Soft Vanilla Ice Cream' at 135 kcal for what is the same product: the guide contradicts itself",
}
RENAME = {(25, "Basque Cheesecake"): "Basque Cheesecake (cake upgrade)"}  # the Gelato list also has a "Basque Cheesecake"
VEGETARIAN = {(6, "Vegan Belgian Chocolate Fudge Cake")}  # the guide's own item name says vegan
MEAT_NOT_STATED = {(7, "Mexican Nachos Small"), (7, "Mexican Nachos To Share")}


def clean(s: str) -> str:
    s = " ".join(s.split())
    return re.sub(r"\s+([,.)])", r"\1", s)


def spell(name: str) -> str:
    return " ".join(SPELLING.get(w, w) for w in name.split(" "))


def phrases(text: str, where: str) -> list:
    """Printed words of a cereal / nut note -> allergen phrases, longest match first ('WHEA T' and 'HAZELNUT S' are one word
    wrapped over two lines). Raises on any word that common._A does not know."""
    toks = [t for t in re.split(r"[\s/&,]+", text.strip()) if t]
    out, i = [], 0
    while i < len(toks):
        if i + 1 < len(toks) and len(toks[i + 1]) == 1 and toks[i + 1].isalpha() and (toks[i] + toks[i + 1]).lower() in _A:
            out.append((toks[i] + toks[i + 1]).lower())  # a word wrapped over two lines: 'WHEA' + 'T', 'HAZELNUT' + 'S'
            i += 2
            continue
        for n in (3, 2, 1):
            cand = " ".join(toks[i:i + n]).lower()
            if i + n <= len(toks) and cand in _A:
                out.append(cand)
                i += n
                break
        else:
            raise ValueError(f"the {where} names {toks[i]!r}, a word that is not a standard allergen spelling (allergen words are never guessed)")
    return out


def read_allergens(row: dict) -> dict:
    """The row's 14 cells -> {contains, may_contain, cereals, nuts, notes}. Raises ValueError if a cell can't be read exactly."""
    if row["shade_mismatch"]:
        label = {"contains": "Contains", "may": "May Contain", "none": "empty", "other": "another colour"}
        raise ValueError("; ".join(f"the {k} cell reads '{label[row['cells'][k][0]]}' but is coloured as '{label[row['shade'][k]]}'" for k in row["shade_mismatch"]))
    contains, may, cereals, nuts, notes = set(), set(), set(), set(), []
    for key, (mark, spec) in row["cells"].items():
        if mark == "none":
            continue
        if mark == "unreadable":
            raise ValueError(f"the {key} cell reads {spec!r}")
        if spec and key not in ("gluten", "nuts"):
            raise ValueError(f"the {key} cell also prints {spec!r}, which is not a word for that allergen, so the cell contradicts itself")
        words = phrases(spec, f"{key} cell") if spec else []
        (contains if mark == "contains" else may).add(key)
        if mark == "contains":
            for w in words:
                k, specific = _A[w]
                if k != key:
                    raise ValueError(f"the {key} cell names {w!r}, a {k} word, so the cell contradicts itself")
                if specific:
                    (cereals if key == "gluten" else nuts).add(specific)
        elif words:
            notes.append(f"may contain {key} names {spec!r}")
    return dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts, notes=notes)


def build(tables: list) -> tuple:
    """-> (items, report lines). Each item has name, category, calories, serving, tags, notes, allergens, hold (reason or '')."""
    got = {}
    for t in tables:
        for r in t["rows"]:
            got.setdefault((t["page"], t["table"], r["category"]), []).append(r)
    want = [g["key"] for g in GROUPS]
    have = [(k[0], k[1], k[2], len(v)) for k, v in got.items()]
    if have != want:
        diff = sorted(set(have) ^ set(want))
        raise SystemExit(f"The matrix changed: groups of rows differ from GROUPS in creams_cafe.py ({diff[:6]}). Re-read the PDF and update GROUPS.")
    if sum(len(v) for v in got.values()) != EXPECTED_ROWS:
        raise SystemExit("The number of rows changed: update EXPECTED_ROWS after reading the PDF")
    notes = {(p, " ".join(x.split())) for t in tables for x, p in t["notes"]}
    if notes != EXPECTED_NOTES:
        raise SystemExit(f"Full-width notes changed: now {sorted(notes ^ EXPECTED_NOTES)}")
    unanch = {(u["page"], " ".join(w for w in u["text"].split() if w not in ("May", "Contains", "Contain"))) for t in tables for u in t["unanchored"]}
    if unanch != EXPECTED_NO_KCAL:
        raise SystemExit(f"Rows without a calorie figure changed: now {sorted(unanch)}, expected {sorted(EXPECTED_NO_KCAL)}")
    report, items, left_out = [], [], {}
    for g in GROUPS:
        page, table, label, _ = g["key"]
        for r in got[(page, table, label)]:
            printed = clean(r["name"])
            if g["show"] is None:
                left_out.setdefault(g["why"], []).append(printed)
                continue
            if (page, printed) in EXCLUDE_ROWS:
                left_out.setdefault(EXCLUDE_ROWS[(page, printed)], []).append(printed)
                continue
            base = spell(clean(printed.replace("(Eat in/TA/DEL)", "")))
            serving = g.get("serving", "")
            size = SIZE.search(base)
            if size and not serving:
                serving = size.group(1)
            if base.endswith("- 1 scoop"):
                base, serving = clean(base[: -len("- 1 scoop")]), "1 scoop"
            name = base
            suffix = g.get("suffix")
            if suffix and not name.lower().endswith(suffix.lower()):
                if size and page in (15, 16):  # "Oreo Regular" -> "Oreo Thick Shake (Regular)"
                    name = f"{base[:size.start()].strip()} {suffix} ({size.group(1)})"
                else:
                    name = f"{base} {suffix}"
            if g.get("qual") and g["qual"] != "milk":  # whole-milk drinks keep the printed name; other milks / sizes go in brackets
                name = f"{name} ({g['qual']})"
            name = RENAME.get((page, printed), name)
            tags = []
            if (page, printed) in VEGETARIAN:
                tags.append("vegetarian")
            note = [f"p.{page}", f"printed '{printed}'" + (f" under '{label}'" if label else " with no category printed")]
            if "(Eat in/TA/DEL)" in printed:
                note.append("guide adds (Eat in/TA/DEL)")
            if (page, printed) in MEAT_NOT_STATED:
                note.append("meat type not stated")
            hold = HOLD.get((page, printed), "")
            allergens, why = None, ""
            try:
                allergens = read_allergens(r)
                note += allergens.pop("notes")
            except ValueError as e:
                why = str(e)
            if why and not hold:
                hold = "The matrix's own allergen cells for this row can't be read exactly (" + why + "): not published"
            if hold:
                report.append(f"HELD BACK {name}: {hold}")
            items.append(dict(name=name, category=g["show"], calories=r["kcal"], serving=serving, tags="|".join(tags), rankable=False,
                              notes="; ".join(note), allergens=allergens if allergens else dict(contains=set(), may_contain=set(), cereals=set(), nuts=set()),
                              hold=hold, page=page, printed=printed))
    for why, names in sorted(left_out.items()):
        report.append(f"NOT LISTED ({why}): {len(names)}")
    report.append(f"printed without calories, not listed: {sorted(EXPECTED_NO_KCAL)}")
    # Contradictions between rows of the same page: the same name in the same category with different calories
    seen = {}
    for it in items:
        k = (it["page"], it["category"], slug(it["name"]))
        if k in seen and seen[k]["calories"] != it["calories"]:
            raise SystemExit(f"Same dish twice with different calories: {it['name']} p.{it['page']}: decide and add to HOLD")
        if k in seen:
            raise SystemExit(f"Duplicate row {it['name']} p.{it['page']}: drop or rename")
        seen[k] = it
    names = [slug(i["name"]) for i in items]
    if len(set(names)) != len(names):
        dup = sorted({n for n in names if names.count(n) > 1})
        raise SystemExit(f"Item names are not unique: {dup}")
    return items, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the allergen matrix PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"matrix PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    tables = pdf_reader.read_tables(args.pdf)
    items, report = build(tables)
    guide = {"title": GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    holdback_ids = []
    out = write_chain_folder(chain_id=CHAIN_ID, name="Creams Cafe", cuisine="Desserts", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=[{k: v for k, v in it.items() if k not in ("hold", "page", "printed")} for it in items],
                             out=args.out, note=NOTE, allergen_guide=guide, nutrition_level="calories")
    # ids come from write_chain_folder (name -> slug, in category order): rebuild holdback.csv and allergens.csv from them
    import csv
    with open(out / "items.csv", newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    by_name = {it["name"]: it for it in items}
    if len(rows) != len(items):
        raise SystemExit("items.csv row count differs from the items built")
    holdback = [(r["id"], by_name[r["name"]]["hold"]) for r in rows if by_name[r["name"]]["hold"]]
    # allergens for the published rows only: a held-back row's cells are not trusted, so it gets no row
    write_allergens(out, CHAIN_ID, [(r["id"], by_name[r["name"]]["allergens"]) for r in rows if not by_name[r["name"]]["hold"]], guide)
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
