#!/usr/bin/env python3
"""Build data/source/abokado/ from Abokado's official "Nutritional Values" PDF and its "Allergens" PDF.

    python3 tools/uk_extract/abokado.py path/to/NutritionalsAbokadoAugust26.pdf \
        --allergens path/to/AllergensAbokadoAugust26.pdf --checked-on 2026-10-06

Source: https://abokado.com/user/pages/nutrition/NutritionalsAbokadoAugust26.pdf (linked from https://abokado.com/nutrition;
the file name carries the month, so a new month means a new URL: update SOURCE_URL and SOURCE_TITLE below).
Requires `pdftotext` (poppler).

The PDF is one alphabetical table (text layer, 5 pages). Columns, left to right: kcal, kJ, fat, saturates, carbohydrate,
sugars, protein, fibre, salt (all in g except energy). Numbers are copied exactly as printed ("0", "6", "0.0", "-" for a
value the guide leaves out); kJ is not used. Only the display names, categories and grouping below are typed by hand.
The guide prints no serving wording: every row is one dish / drink as made or sold (a dish's separate dressing pot is
not included in it), "Reg"/"Lge"/"Large" rows are separate products.

The script stops if the printed rows no longer match PRINTED_ROWS (a dish was added, removed or renamed, or a row that
had no numbers now has some), so a human re-checks the names and categories before running again.

kJ is published as energy_kj exactly as printed (it is per dish, like kcal).

Allergens come from the separate "Allergens" PDF linked from the same page
(https://abokado.com/user/pages/nutrition/AllergensAbokadoAugust26.pdf): one alphabetical table, 20 columns per row, every
cell printed "yes" or "-" (Cereals containing Gluten, Wheat, Spelt (Wheat), Kamut (Wheat), Rye, Barley, Oats, Crustaceans,
Eggs, Fish, Peanuts, Soybeans, Milk, Tree Nuts, Celery, Mustard, Sesame, Sulphur dioxide/sulphites, Lupin, Molluscs). The
gluten column is cross-checked against the cereal columns. The guide prints no "may contain" per dish (only a general
warning) and names no tree nut. Rows are matched to the nutrition rows by exact name (case, punctuation and spacing
ignored), never by similarity. All or nothing: if any published dish has no row of its own in the allergen guide, no
allergens are published and the chain only links to the guide (the run says which dishes are missing).
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "abokado"
SOURCE_URL = "https://abokado.com/user/pages/nutrition/NutritionalsAbokadoAugust26.pdf"
SOURCE_TITLE = "Abokado Nutritional Values (August 2026, NutritionalsAbokadoAugust26.pdf)"
ALLERGEN_URL = "https://abokado.com/user/pages/nutrition/AllergensAbokadoAugust26.pdf"
ALLERGEN_TITLE = "Abokado Allergens (August 2026, AllergensAbokadoAugust26.pdf)"
NOTE = ("Dishes exclude any dressing pot, which is listed separately. Abokado says these values are a guide and does not "
        "print serving sizes (soft drinks included).")

BOWLS, RICE, SALAD, UDON, SUSHI, BANH, BAGEL, BRK, SIDE, EXTRA, HOT, COLD = (
    "Poke & nourish bowls", "Rice bowls", "Salads", "Yaki udon", "Sushi", "Banh mi", "Bagels", "Breakfast",
    "Sides & snacks", "Extras & pots", "Hot drinks", "Cold drinks")
CATEGORY_ORDER = [BOWLS, RICE, SALAD, UDON, SUSHI, BANH, BAGEL, BRK, SIDE, EXTRA, HOT, COLD]

NS = "Meat/fish type not stated in the guide"
GYOZA_NOTE = "Numbers are identical to the other three Gyoza rows as printed. " + NS
PORK = "contains_pork"

# (printed name, category, rankable, tags, note) in the PDF's reading order, one entry per printed row.
# `None` instead of a category = a row the guide prints with "-" in every column (no numbers): left out.
# The guide marks no item vegetarian or vegan, so no item gets a `vegetarian` tag; only bacon rows get `contains_pork`.
PRINTED_ROWS: list[tuple] = [
    ('"On Rice" Salad - Miso Salmon', SALAD, True, "", ""),
    ('"On Rice" Salad - Teriyaki Chicken', SALAD, True, "", ""),
    ('"On Rice" Salad - Gyoza', SALAD, True, "", NS),
    ("Bagel - Avo & Bacon", BAGEL, True, PORK, ""),
    ("Bagel - Avo & Cream Cheese", BAGEL, True, "", ""),
    ("Bagel - Avo & Vegan Bacon", BAGEL, True, "", ""),
    ("Bagel - Avocado & Shichimi", BAGEL, True, "", ""),
    ("Bagel - Bacon & Egg", BAGEL, True, PORK, ""),
    ("Bagel - Bacon Butty", BAGEL, True, PORK, ""),
    ("Bagel - Buttered", BAGEL, True, "", ""),
    ("Bagel - Cream Cheese", BAGEL, True, "", ""),
    ("Bagel - Egg", BAGEL, True, "", ""),
    ("Bagel - Marmite", BAGEL, True, "", ""),
    ("Bagel - Peanut Butter", BAGEL, True, "", ""),
    ("Bagel - Smoked Salmon & Cream Cheese", BAGEL, True, "", ""),
    ("Banh Mi - Crispy Chicken", BANH, True, "", ""),
    ("Banh Mi - Sweet & Sour Chicken", BANH, True, "", ""),
    ('Banh Mi - Tonkatsu BBQ "Chicken"', BANH, True, "", 'The guide puts "Chicken" in quotes'),
    ("Black Americano - Large", HOT, False, "", ""),
    ("Black Americano - Reg", HOT, False, "", ""),
    ("Brown Rice Bowl - Sweet Chilli Dumplings Reg", RICE, True, "", NS),
    ("Brown Rice Bowl - Sweet Chilli Dumplings Lge", RICE, True, "", NS),
    ("Brown Rice Bowl - Teriyaki Chicken Reg", RICE, True, "", ""),
    ("Brown Rice Bowl - Teriyaki Chicken Lge", RICE, True, "", ""),
    ("Brown Rice Bowl - Teriyaki Salmon Reg", RICE, True, "", ""),
    ("Brown Rice Bowl - Teriyaki Salmon Lge", RICE, True, "", ""),
    ("Brown Rice Bowl - Thai Green Curry Reg", RICE, True, "", ""),
    ("Brown Rice Bowl - Thai Green Curry Lge", RICE, True, "", ""),
    ("Brown Rice Bowl - Thai Red Curry Reg", RICE, True, "", ""),
    ("Brown Rice Bowl - Thai Red Curry Lge", RICE, True, "", ""),
    ("California Nigiri Sushi", SUSHI, True, "", NS),
    ("Cappuccino - Large", HOT, False, "", ""),
    ("Cappuccino - Reg", HOT, False, "", ""),
    ("Coca Cola", COLD, False, "", "Drink size not printed"),
    ("Coke Zero", COLD, False, "", "Drink size not printed"),
    ("Deep Blue Sushi", SUSHI, True, "", NS),
    ("Diet Coke", COLD, False, "", "Drink size not printed. Printed kJ (6.6) and kcal (3.3) do not agree"),
    ("Double Espresso", HOT, False, "", ""),
    ("Dragon - California Crab", SUSHI, True, "", ""),
    ("Dragon - Chicken Katsu", SUSHI, True, "", ""),
    ("Dragon - Salmon & Avo", SUSHI, True, "", ""),
    ("Dressing Pot - Asian (Soy & Ginger)", EXTRA, False, "", ""),
    ("Dressing Pot - Sesame", EXTRA, False, "", 'Fibre printed as "0" (no decimal)'),
    ("Dressing Pot - Sweet Chilli", EXTRA, False, "", ""),
    ("Dressing Pot - Teriyaki", EXTRA, False, "", ""),
    ("Dressing Pot - Tonkatsu BBQ", EXTRA, False, "", ""),
    ("Edamame Beans", SIDE, True, "", "Printed kcal is 17% above 4P+4C+9F; the printed kcal and kJ agree with each other"),
    ("Exotic Fruit Salad", SIDE, False, "", "Same kcal as Mango & Lime Pot (96.9) but kJ, saturates and sugars differ"),
    ("Extra - Avocado", EXTRA, False, "", "Fibre printed higher than carbohydrate"),
    ("Extra - Bacon", EXTRA, False, PORK, ""),
    ("Extra - Cream Cheese", EXTRA, False, "", ""),
    ("Extra - Espresso Shot", EXTRA, False, "", ""),
    ("Extra - Smoked Salmon", EXTRA, False, "", ""),
    ("Extra - Vegan Bacon", EXTRA, False, "", ""),
    ("Flat White", HOT, False, "", ""),
    ("Ginger", EXTRA, False, "", 'Fibre printed as "-" (not published). The guide does not say what Ginger is served with'),
    ("Gyoza - Spicy", SIDE, True, "", GYOZA_NOTE),
    ("Gyoza - Sweet Chilli", SIDE, True, "", GYOZA_NOTE),
    ("Gyoza - Teriyaki", SIDE, True, "", GYOZA_NOTE),
    ("Gyoza - Tonkatsu BBQ", SIDE, True, "", GYOZA_NOTE),
    ("Katsu Nigiri Sushi", SUSHI, True, "", NS),
    ("Latte - Large", HOT, False, "", ""),
    ("Latte - Reg", HOT, False, "", ""),
    ("Mango & Lime Pot", SIDE, False, "", "Same kcal as Exotic Fruit Salad (96.9) but kJ, saturates and sugars differ"),
    ("Mean, Clean & Green Sushi", SUSHI, True, "", NS),
    ("Miso Soup", SIDE, True, "", ""),
    ("Nourish Bowl - Miso Salmon", BOWLS, True, "", ""),
    ("Nourish Bowl - Plant-Based", BOWLS, True, "", "Named Plant-Based but the guide marks no diet"),
    ("Nourish Bowl - Teriyaki Chicken", BOWLS, True, "", ""),
    ("Oishi Sushi", SUSHI, True, "", NS),
    ("Omega 3 Sushi", SUSHI, True, "", NS),
    ("Omega Lite Sushi", SUSHI, True, "", NS),
    ("Overnight Oats - Berry & Almond", BRK, True, "", ""),
    ("Overnight Oats - Golden Mango", BRK, True, "", ""),
    ("Overnight Oats - PB & Banana", BRK, True, "", ""),
    ("Poke - Plant Based", BOWLS, True, "", "Named Plant Based but the guide marks no diet"),
    ("Poke - Spicy Citrus Salmon", BOWLS, True, "", ""),
    ("Poke - Teriyaki Salmon", BOWLS, True, "", ""),
    ("Poke - Teriyaki Chicken", BOWLS, True, "", ""),
    ("Poke - Tonkatsu BBQ Chicken", BOWLS, True, "", ""),
    ("Pot - Crispy Onions", EXTRA, False, "", ""),
    ("Pot - Sriracha Hot Sauce", EXTRA, False, "", ""),
    ("Pot - Pumpkin Seeds", EXTRA, False, "", 'Protein printed as "6" (no decimal)'),
    ("Rice Bowl - Chicken Katsu Curry", RICE, True, "", ""),
    ("Rice Bowl - Thai Green Chicken Curry", RICE, True, "", ""),
    ("Rice Bowl - Thai Red Chicken Curry", RICE, True, "", ""),
    ("Rice Bowl - Tonkatsu BBQ Chicken", RICE, True, "", ""),
    ("Rice Bowl - Sweet Chilli Chicken", RICE, True, "", ""),
    ("Rice Bowl - Plant-Based Katsu Curry", RICE, True, "", "Named Plant-Based but the guide marks no diet"),
    ("River Run Sushi", SUSHI, True, "", NS),
    ("Sashimi Salmon Sushi", SUSHI, True, "", ""),
    ("Scrambled Eggs - Plain", BRK, True, "", 'Carbohydrate, sugars and fibre printed as "0" (no decimal)'),
    ("Scrambled Eggs - Smashed Avo", BRK, True, "", "Fibre printed higher than carbohydrate"),
    ("Scrambled Eggs - Crispy Smoked Bacon", BRK, True, PORK, 'Carbohydrate, sugars and fibre printed as "0" (no decimal)'),
    ('Scrambled Eggs - Vegan "Bacon"', BRK, True, "",
     'Saturates printed as "0" with 18.7 g fat, while Scrambled Eggs - Plain prints 5.0 g saturates'),
    ("Scrambled Eggs - Smoked Salmon", BRK, True, "", 'Carbohydrate, sugars and fibre printed as "0" (no decimal)'),
    ("Sparkling Water", COLD, False, "", "Drink size not printed. Every number is printed as 0.0"),
    ("Spicy Chicken Katsu Sushi", SUSHI, True, "", ""),
    ("Spicy Salmon Sushi", SUSHI, True, "", ""),
    ("Still Water", None, False, "", "No numbers printed (every column is -)"),
    ("Sushi Roll - Salmon Avo", SUSHI, True, "", ""),
    ("Sushi Roll - Sesame Seaweed", SUSHI, True, "", ""),
    ("Sushi Roll - Spicy California", SUSHI, True, "", NS),
    ("Sushi Roll - Teriyaki Chicken", SUSHI, True, "", ""),
    ("Sushi Roll - Teriyaki Salmon", SUSHI, True, "", ""),
    ("Sushi Roll - Tonkatsu BBQ Chicken", SUSHI, True, "", ""),
    ("Tea - Earl Grey - Large", None, False, "", "No numbers printed"),
    ("Tea - Earl Grey - Reg", None, False, "", "No numbers printed"),
    ("Tea - English Breakfast - Large", None, False, "", "No numbers printed"),
    ("Tea - English Breakfast - Reg", None, False, "", "No numbers printed"),
    ("Tea - Green - Large", None, False, "", "No numbers printed"),
    ("Tea - Green - Reg", None, False, "", "No numbers printed"),
    ("Tea - Mint - Large", None, False, "", "No numbers printed"),
    ("Tea - Mint - Reg", None, False, "", "No numbers printed"),
    ("Topping - Pumpkin Seeds", EXTRA, False, "", ""),
    ("Topping - Sun-Dried Tomatoes", EXTRA, False, "", ""),
    ("Wasabi", EXTRA, False, "", ""),
    ("White Americano - Large", HOT, False, "", ""),
    ("White Americano - Reg", HOT, False, "", ""),
    ("Wild Rice Salad - Chicken", SALAD, True, "", ""),
    ("Wild Rice Salad - Salmon Tartare", SALAD, True, "", ""),
    ("Yaki Udon Noodles - Katsu Curry", UDON, True, "", NS),
    ("Yaki Udon Noodles - Sweet Chilli", UDON, True, "", NS),
    ("Yaki Udon Noodles - Teriyaki", UDON, True, "", NS),
    ("Yaki Udon Noodles - Thai Green Curry", UDON, True, "", NS),
    ("Yaki Udon Noodles - Thai Red Curry", UDON, True, "", NS),
    ("Yaki Udon Noodles - Tonkatsu BBQ", UDON, True, "", NS),
]

NUM = r"(-|<?\d+(?:\.\d+)?)"
ROW = re.compile(r"^(?P<name>\S.*?)\s+" + r"\s+".join([NUM] * 9) + r"\s*$")
FIELDS = ("kcal", "kj", "fat", "sat", "carbs", "sugars", "protein", "fibre", "salt")
SIZE = re.compile(r"^(?P<base>.+?)(?: - | )(?P<size>Reg|Lge|Large)$")


def read_rows(pdf: Path) -> list[tuple[str, dict]]:
    """(printed name, {field: printed text}) for every table row, in reading order."""
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    rows = []
    for line in text.splitlines():
        m = ROW.match(line)
        if m:
            rows.append((m.group("name").strip(), dict(zip(FIELDS, m.groups()[1:]))))
    return rows


# The allergen table's 20 columns, left to right, as printed (every cell is "yes" or "-").
ALLERGEN_COLUMNS = ["Cereals containing Gluten", "Wheat", "Spelt", "Kamut", "Rye", "Barley", "Oats", "Crustaceans", "Eggs",
                    "Fish", "Peanuts", "Soybeans", "Milk", "Tree Nuts", "Celery", "Mustard", "Sesame",
                    "Sulphur dioxide/sulphites", "Lupin", "Molluscs"]
CEREAL_COLUMNS = {"Wheat", "Spelt", "Kamut", "Rye", "Barley", "Oats"}
A_ROW = re.compile(r"^(?P<name>\S.*?)" + r"\s+(yes|-)" * len(ALLERGEN_COLUMNS) + r"\s*$")
# The three header lines printed at the top of every page, which fix the column order above.
A_HEADER = [re.compile(r"^Allergens\s+WARNING: Our suppliers and kitchens handle numerous ingredients and allergens"),
            re.compile(r"^\s+it's impossible for us to guaranteee that our dishes will be 100% allergen free\.$"),
            re.compile(r"^\s+Cereals\s+Sulphur$"),
            re.compile(r"^Recipe Name \(alphabetical order\)\s+containing\s+Spelt\s+Kamut\s+Crustacean\s+dioxide/sulp$"),
            re.compile(r"^\s+Gluten :\s+Wheat\s+\(Wheat\)\s+\(Wheat\)\s+Rye\s+Barley\s+Oats\s+s\s+Eggs\s+Fish\s+Peanuts\s+"
                       r"Soybeans\s+Milk\s+Tree Nuts\s+Celery\s+Mustard\s+Sesame\s+hites\s+Lupin\s+Molluscs$")]


def norm(name: str) -> str:
    """Exact-name key: case, punctuation and spacing ignored ('Black Americano- - Reg' == 'Black Americano - Reg')."""
    return " ".join(re.sub(r"[^0-9a-z]+", " ", name.lower()).split())


def read_allergens(pdf: Path) -> dict[str, dict]:
    """norm(printed name) -> allergens dict, for every row of the allergen PDF. Stops on any line it can't place, a page
    without the expected header, a name printed twice, or a cereal marked without the gluten column."""
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages = [p for p in text.split("\f") if p.strip()]
    out: dict[str, dict] = {}
    for n, page in enumerate(pages, 1):
        lines = [ln.rstrip() for ln in page.splitlines() if ln.strip()]
        if len(lines) < len(A_HEADER) or not all(h.match(ln) for h, ln in zip(A_HEADER, lines)):
            raise SystemExit(f"allergen PDF page {n}: the header is not the expected 20 columns; re-check ALLERGEN_COLUMNS")
        for ln in lines[len(A_HEADER):]:
            m = A_ROW.match(ln)
            if not m:
                raise SystemExit(f"allergen PDF page {n}: can't read the line {ln!r}")
            name, cells = m.group("name").strip(), m.groups()[1:]
            marked = [col for col, cell in zip(ALLERGEN_COLUMNS, cells) if cell == "yes"]
            where = f"allergen PDF {name!r}"
            if CEREAL_COLUMNS & set(marked) and "Cereals containing Gluten" not in marked:
                raise SystemExit(f"{where}: a cereal column is marked but 'Cereals containing Gluten' is not")
            keys, cereals, nuts = allergen_words(marked, where)
            if norm(name) in out:
                raise SystemExit(f"{where}: printed twice")
            out[norm(name)] = {"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts, "printed": name}
    return out


def display(printed: str) -> tuple[str, str]:
    """('Cappuccino - Reg') -> ('Cappuccino (regular)', 'Regular'); names without a size are unchanged, serving blank."""
    m = SIZE.match(printed)
    if not m:
        return printed, ""
    size = "regular" if m.group("size") == "Reg" else "large"
    return f"{m.group('base')} ({size})", size.capitalize()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--allergens", type=Path, required=True, help="the Allergens PDF (ALLERGEN_URL)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = read_rows(args.pdf)
    printed_names = [n for n, _ in rows]
    expected = [spec[0] for spec in PRINTED_ROWS]
    if printed_names != expected:
        new, gone = [n for n in printed_names if n not in expected], [n for n in expected if n not in printed_names]
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(expected)}, or the order changed.\n"
              f"  in the PDF only: {new or '-'}\n  in this script only: {gone or '-'}\n"
              "Re-check the names and categories in PRINTED_ROWS against the PDF before running again.", file=sys.stderr)
        return 1

    allergens = read_allergens(args.allergens)
    items, unmatched = [], []
    for (printed, nums), (_, category, rankable, tags, note) in zip(rows, PRINTED_ROWS):
        blank = [k for k, v in nums.items() if v == "-"]
        if category is None:
            if len(blank) != len(FIELDS):
                print(f"{printed!r} is left out because it printed no numbers, but now has some: {nums}. "
                      "Give it a category in PRINTED_ROWS.", file=sys.stderr)
                return 1
            continue
        missing = [k for k in ("kcal", "protein", "carbs", "fat") if nums[k] == "-"]
        if missing:
            print(f"{printed!r} prints no value for {missing}: it cannot be published. Set its category to None.", file=sys.stderr)
            return 1
        name, serving = display(printed)
        a = allergens.get(norm(printed))
        if a is None:
            unmatched.append(printed)
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": serving,
            "calories": nums["kcal"], "protein_g": nums["protein"], "carbs_g": nums["carbs"], "fat_g": nums["fat"],
            "sat_fat_g": "" if nums["sat"] == "-" else nums["sat"], "sodium_mg": "", "salt_g": "" if nums["salt"] == "-" else nums["salt"],
            "sugar_g": "" if nums["sugars"] == "-" else nums["sugars"], "fiber_g": "" if nums["fibre"] == "-" else nums["fibre"],
            "energy_kj": "" if nums["kj"] == "-" else nums["kj"],
            "allergens": None if a is None else {k: v for k, v in a.items() if k != "printed"},
            "tags": tags, "limited_time": False, "rankable": rankable, "notes": note,
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    if unmatched:  # all or nothing: the chain links to the guide but lists no allergens
        for it in items:
            it["allergens"] = None
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": False}

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Abokado", cuisine="Japanese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["abokado"], items=items, out=args.out, note=NOTE, allergen_guide=guide)
    print(f"wrote {len(items)} items to {out} ({len(rows) - len(items)} printed rows left out; PDF sha256 {sha256_file(args.pdf)})")
    print(f"allergen PDF: {len(allergens)} rows, sha256 {sha256_file(args.allergens)}")
    if unmatched:
        print(f"allergens NOT published (link to the guide only): {len(unmatched)} published rows have no row of their own "
              f"in the allergen PDF: {unmatched}")
    else:
        print(f"allergens published for all {len(items)} items")
    used = {norm(p) for p, _ in rows}
    print(f"allergen rows with no published nutrition row: {[a['printed'] for k, a in allergens.items() if k not in used] or '-'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
