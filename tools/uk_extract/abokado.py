#!/usr/bin/env python3
"""Build data/source/abokado/ from Abokado's official "Nutritional Values" PDF.

    python3 tools/uk_extract/abokado.py path/to/NutritionalsAbokadoAugust26.pdf --checked-on 2026-10-06

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
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "abokado"
SOURCE_URL = "https://abokado.com/user/pages/nutrition/NutritionalsAbokadoAugust26.pdf"
SOURCE_TITLE = "Abokado Nutritional Values (August 2026, NutritionalsAbokadoAugust26.pdf)"
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

    items = []
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
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": serving,
            "calories": nums["kcal"], "protein_g": nums["protein"], "carbs_g": nums["carbs"], "fat_g": nums["fat"],
            "sat_fat_g": "" if nums["sat"] == "-" else nums["sat"], "sodium_mg": "", "salt_g": "" if nums["salt"] == "-" else nums["salt"],
            "sugar_g": "" if nums["sugars"] == "-" else nums["sugars"], "fiber_g": "" if nums["fibre"] == "-" else nums["fibre"],
            "tags": tags, "limited_time": False, "rankable": rankable, "notes": note,
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Abokado", cuisine="Japanese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["abokado"], items=items, out=args.out, note=NOTE)
    print(f"wrote {len(items)} items to {out} ({len(rows) - len(items)} printed rows left out; PDF sha256 {sha256_file(args.pdf)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
