#!/usr/bin/env python3
"""Build data/source/chopstix/ from Chopstix's official "Nutritional Data" PDF (V22, September 2026).

    python3 tools/uk_extract/chopstix.py path/to/NUTRITIONAL-TABLE-V22-SEPT-26.pdf \
        --allergens path/to/CUSTOMER-ALLERGENS-NON-QR-V22-SEPT-2026.pdf --checked-on 2026-10-06 [--out DIR]

Source: https://chopstixnoodles.co.uk/wp-content/uploads/2026/09/NUTRITIONAL-TABLE-V22-SEPT-26.pdf (linked as
"Nutritional" in the footer of https://chopstixnoodles.co.uk/; a new version is published when the menu changes).

How it works
- `pdftotext -tsv` (poppler) gives every word with its position. Rows are rebuilt from the words and each number is
  assigned to a column by its x position, so a blank cell stays blank and nothing is shifted into the wrong column.
- Numbers are copied exactly as printed ("0.0", "39", "1.08"); nothing is converted, rounded or estimated. kJ is
  published as energy_kj exactly as printed (per serving, like kcal). Salt is salt_g as printed; sodium is not printed.
- Only the NAMES, categories, servings and grouping below are typed by hand. SPEC lists every row of the PDF in reading
  order with its printed label. If the PDF gains, loses, renames or reorders a row, this script stops with a message so a
  human re-checks SPEC before anything is written.
- Rows we leave out say why (EXCLUDED rows below). Rows the guide prints with impossible numbers go to holdback.csv
  (HOLDBACK) and are never corrected.

Allergens: the chain's "Customer Allergen Chart" (CS QA 07, V22 September 2026, linked in the same footer:
ALLERGEN_URL) lists dishes and pot parts by name only (no sizes: "Egg Fried Rice", "SPICY ONE - Firecracker"), groups the
Mini Stix meals under other names, and has no drinks or dip pots at all. So most published rows have no row of their own
in the chart and, all or nothing, no allergens are published: the chain links to the chart (allergen_guide.csv, which
prints "may contain" as M). --allergens is checked only for its title and version, so a new chart stops the run and a
human updates ALLERGEN_URL / ALLERGEN_TITLE (and re-checks whether the chart now covers every published row).
"""
from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "chopstix"
SOURCE_URL = "https://chopstixnoodles.co.uk/wp-content/uploads/2026/09/NUTRITIONAL-TABLE-V22-SEPT-26.pdf"
SOURCE_TITLE = "Chopstix Nutritional Data V22 (September 2026)"
ALLERGEN_URL = "https://chopstixnoodles.co.uk/wp-content/uploads/2026/09/CUSTOMER-ALLERGENS-NON-QR-V22-SEPT-2026.pdf"
ALLERGEN_TITLE = "Chopstix Customer Allergen Chart (CS QA 07, V22 September 2026)"
ALLERGEN_VERSION = re.compile(r"CUSTOMER ALLERGEN CHART\s+CS QA 07\s+V22 SEPTEMBER 2026")
NUMBER = re.compile(r"^<?\d+(?:\.\d+)?$")
FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
# x (pt) of the boundaries between the numeric columns; the name column ends at NAME_MAX_X. Same on all three pages.
NAME_MIN_X, NAME_MAX_X = 46.0, 264.0
COL_EDGES = (297.0, 329.5, 362.5, 400.0, 441.0, 477.5, 510.0, 543.0)

NOTE = ("Pots are published as separate parts (a base, a topping and an optional flavour boost, each by size), not as "
        "complete pots, so a full pot is the sum of its parts. The guide lists no ingredients, so the pork and beef "
        "filters can't vouch for any dish.")


# ---------------------------------------------------------------- reading the PDF
def read_rows(pdf: Path) -> list[dict]:
    """Every table row in reading order: {'label': printed name (NEW marker dropped), <FIELDS>: printed text or ''}."""
    with tempfile.NamedTemporaryFile(suffix=".tsv") as out:
        subprocess.run(["pdftotext", "-tsv", str(pdf), out.name], check=True)
        raw = list(csv.reader(Path(out.name).read_text(encoding="utf-8").splitlines(), delimiter="\t"))[1:]
    words = [(int(r[1]), float(r[6]), float(r[7]) + float(r[9]) / 2, r[11]) for r in raw if r[0] == "5" and r[11].strip()]
    rows: list[dict] = []
    for page in sorted({w[0] for w in words}):
        ws = sorted((w for w in words if w[0] == page and w[1] >= NAME_MIN_X), key=lambda w: w[2])
        lines: list[list[tuple]] = []
        for w in ws:
            if lines and abs(w[2] - sum(x[2] for x in lines[-1]) / len(lines[-1])) <= 3.5:
                lines[-1].append(w)
            else:
                lines.append([w])
        for line in lines:
            line.sort(key=lambda w: w[1])
            name_words = [w[3] for w in line if w[1] < NAME_MAX_X]
            cells = ["" for _ in FIELDS]
            for w in line:
                if w[1] >= NAME_MAX_X and NUMBER.match(w[3]):
                    col = sum(1 for e in COL_EDGES if w[1] + 6 > e)  # +6 pt: numbers are centred, so use ~the middle
                    if cells[col]:
                        raise SystemExit(f"two numbers in one cell on page {page}: {' '.join(name_words)}")
                    cells[col] = w[3]
            label = " ".join(name_words)
            if label.endswith(" NEW"):
                label = label[:-4]
            if not name_words or not any(cells):
                continue  # page titles ("... 2000 kcal per day"), the column header rows and similar are not table rows
            rows.append({"label": label, "page": page, **dict(zip(FIELDS, cells))})
    return rows


# ---------------------------------------------------------------- what each printed row becomes
BASES, BOOSTS, TOPPINGS = "Noodle and rice bases", "Flavour boosts", "Toppings"
MEALS, SIDES, DIPS, TREATS, DRINKS = "Meals and deals", "Sides and snacks", "Dips and sauces", "Desserts and treats", "Drinks"
CATEGORY_ORDER = [BASES, BOOSTS, TOPPINGS, MEALS, SIDES, DIPS, TREATS, DRINKS]
PART = "Part of a pot, not a complete order on its own"


def base(label: str) -> list[tuple]:
    return [(f"{label} - {p}", f"{label} ({n})", BASES, s, False, PART) for p, n, s in
            (("TASTER BASE", "taster base", "Taster"), ("Small", "small", "Small"), ("Regular", "regular", "Regular"),
             ("Large", "large", "Large"))]


def topping(label: str, note: str = "") -> list[tuple]:
    return [(f"{label} - {p}", f"{label} ({n})", TOPPINGS, s, False, (PART + ". " + note).strip(". ") if note else PART)
            for p, n, s in (("TASTER TOPPING", "taster topping", "Taster"), ("Small", "small", "Small"),
                            ("Regular / Large", "regular / large", "Regular / Large"), ("Topper Pot", "topper pot", "Topper pot"))]


def drink3(label: str, printed: list[str], notes: tuple = ("", "", "")) -> list[tuple]:
    """Fountain drink in 12 / 16 / 22 fl oz; `printed` = the three labels exactly as the PDF prints them."""
    return [(p, f"{label} ({oz} fl oz / {ml} ml)", DRINKS, f"{oz} fl oz ({ml} ml)", False, n)
            for p, (oz, ml), n in zip(printed, (("12", "355"), ("16", "473"), ("22", "651")), notes)]


# An included row: (printed label, display name, category, serving, rankable, note).
# An excluded row: (printed label, None, reason). Order = the PDF's reading order, page 1 to page 3.
CAN = "No protein or carbohydrate printed for this row"
SPEC: list[tuple] = [
    # page 1: base choice
    *base("Vegetable Chow Mein"), *base("Egg Fried Rice"), *base("Cauli Rice"),
    # flavour boosts
    ("Savoury One", "Savoury One", BOOSTS, "", False, PART),
    ("Sweet One", "Sweet One", BOOSTS, "", False, PART),
    ("Spicy One", "Spicy One", BOOSTS, "", False, PART),
    # topping choices
    *topping("K-Pop BBQ Chicken"), *topping("Orange Chicken"), *topping("Hot Honey Hustler Chicken"),
    *topping("No Chick'n Sweet & Sour"), *topping("No Beef Teriyaki", "Meat-free despite the name"),
    *topping("Caramel Drizzle Chicken"), *topping("Chinese Chicken Curry"), *topping("Salt & Pepper Chicken"),
    ("Spice Bag Meal with Katsu Sauce", "Spice Bag Meal with Katsu Sauce", MEALS, "", True, "Meat type not stated"),
    ("Salt & Pepper Chips - Small", "Salt & Pepper Chips (small)", TOPPINGS, "Small", False,
     PART + ". Same numbers are printed for Small, Regular / Large and Small Side"),
    ("Salt & Pepper Chips - Regular / Large", "Salt & Pepper Chips (regular / large)", TOPPINGS, "Regular / Large", False,
     PART + ". Same numbers are printed for Small, Regular / Large and Small Side"),
    ("Salt & Pepper Chips - SMALL SIDE", "Salt & Pepper Chips (small side)", SIDES, "Small side", True,
     "Same numbers are printed for Small, Regular / Large and Small Side"),
    ("Salt & Pepper Chips - LARGE SIDE", "Salt & Pepper Chips (large side)", SIDES, "Large side", True, ""),
    *topping("Sweet & Sour Chicken"), *topping("Soy-Mazing Chicken"), *topping("Firecracker Chicken"),
    ("Battered Chicken Katsu Curry - Small (4 Pieces)", "Battered Chicken Katsu Curry (small, 4 pieces)", TOPPINGS,
     "Small (4 pieces)", False, PART),
    ("Battered Chicken Katsu Curry - Regular / Large (3 Pieces)", "Battered Chicken Katsu Curry (regular / large, 3 pieces)",
     TOPPINGS, "Regular / Large (3 pieces)", False, PART),
    ("Panko Chicken Katsu Curry - Small (2 Pieces)", "Panko Chicken Katsu Curry (small, 2 pieces)", TOPPINGS,
     "Small (2 pieces)", False, PART + ". Printed kJ (1243) and kcal (219) do not agree. Identical numbers to the Regular / Large row"),
    ("Panko Chicken Katsu Curry - Regular / Large (2 Pieces)", "Panko Chicken Katsu Curry (regular / large, 2 pieces)",
     TOPPINGS, "Regular / Large (2 pieces)", False,
     PART + ". Printed kJ (1243) and kcal (219) do not agree. Identical numbers to the Small row"),
    ("Pumpkin Katsu Curry", "Pumpkin Katsu Curry", TOPPINGS, "", False,
     PART + ". Printed kJ and kcal agree with each other, but the printed fat, carbohydrate and protein add up to about 170 kcal, not 215"),
    # page 2: side choices
    ("Katsu Curry Sauce Portion - Small", "Katsu Curry Sauce Portion (small)", DIPS, "Small", False, ""),
    ("Katsu Curry Sauce Portion - Large", "Katsu Curry Sauce Portion (large)", DIPS, "Large", False, ""),
    ("FLAVOUR SAVOUR Mini Crispy Chicken Balls (5) + DIP", "Flavour Savour Mini Crispy Chicken Balls (5) + dip", SIDES,
     "5 balls + dip", True, "Printed as '+ DIP'; which dip is not stated"),
    ("Mini Crispy Chicken Balls (10)", "Mini Crispy Chicken Balls (10)", SIDES, "10 balls", True, ""),
    ("Mini Crispy Chicken Balls (15)", "Mini Crispy Chicken Balls (15)", SIDES, "15 balls", True, ""),
    ("Mini Crispy Chicken Balls Sharer", "Mini Crispy Chicken Balls Sharer", SIDES, "", True, "Number of balls not stated"),
    ("FLAVOUR SAVOUR Battered Katsu Chicken Strips (2) + DIP", "Flavour Savour Battered Katsu Chicken Strips (2) + dip",
     SIDES, "2 strips + dip", True, "Printed as '+ DIP'; which dip is not stated"),
    ("Battered Katsu Chicken Strips (3)", "Battered Katsu Chicken Strips (3)", SIDES, "3 strips", True, ""),
    ("Battered Katsu Chicken Strips (10)", "Battered Katsu Chicken Strips (10)", SIDES, "10 strips", True, ""),
    ("FLAVOUR SAVOUR Chicken Katsu Panko PIeces (2) + DIP", "Flavour Savour Chicken Katsu Panko Pieces (2) + dip", SIDES,
     "2 pieces + dip", True, "Printed as '+ DIP'; which dip is not stated"),
    ("Chicken Katsu Panko Pieces (3)", "Chicken Katsu Panko Pieces (3)", SIDES, "3 pieces", True, ""),
    ("Chicken Katsu Panko PIeces (10)", "Chicken Katsu Panko Pieces (10)", SIDES, "10 pieces", True, ""),
    ("Prawn Cracker Bag - 60g", "Prawn Cracker Bag (60 g)", SIDES, "60 g", True, ""),
    ("Fortune Cookie - 6g", "Fortune Cookie (6 g)", TREATS, "6 g", False, ""),
    ("FLAVOUR SAVOUR Vegetable Spring Rolls (3) + DIP", "Flavour Savour Vegetable Spring Rolls (3) + dip", SIDES,
     "3 rolls + dip", True, "Printed as '+ DIP'; which dip is not stated"),
    ("Vegetable Spring Rolls (3)", "Vegetable Spring Rolls (3)", SIDES, "3 rolls", True, ""),
    ("Vegetable Spring Rolls (5)", "Vegetable Spring Rolls (5)", SIDES, "5 rolls", True, ""),
    ("Vegetable Spring Rolls (10)", "Vegetable Spring Rolls (10)", SIDES, "10 rolls", True, ""),
    ("Vegetable Spring Rolls (15)", "Vegetable Spring Rolls (15)", SIDES, "15 rolls", True, ""),
    ("FLAVOUR SAVOUR Crispy Vegetable Gyoza (2) & Dip", "Flavour Savour Crispy Vegetable Gyoza (2) + dip", SIDES,
     "2 gyoza + dip", True, "Printed as '& Dip'; which dip is not stated"),
    ("Crispy Vegetable Gyoza (3)", "Crispy Vegetable Gyoza (3)", SIDES, "3 gyoza", True, ""),
    ("Crispy Vegetable Gyoza (5)", "Crispy Vegetable Gyoza (5)", SIDES, "5 gyoza", True, ""),
    ("Crispy Vegetable Gyoza (10)", "Crispy Vegetable Gyoza (10)", SIDES, "10 gyoza", True, ""),
    ("Sugared Baonut (each)", "Sugared Baonut (each)", TREATS, "1 baonut", False, ""),
    ("Sugared Baonut (x2)", "Sugared Baonut (x2)", TREATS, "2 baonuts", False, ""),
    ("Mini Stix Deal - Noodles and Vegetable Spring Rolls", "Mini Stix Deal - Noodles and Vegetable Spring Rolls", MEALS, "", True, ""),
    ("Mini Stix Deal - Noodles and Chicken Balls", "Mini Stix Deal - Noodles and Chicken Balls", MEALS, "", True, ""),
    ("Mini Stix Deal - Egg Fried Rice and Vegetable Spring Rolls", "Mini Stix Deal - Egg Fried Rice and Vegetable Spring Rolls",
     MEALS, "", True, ""),
    ("Mini Stix Deal - Egg Fried Rice and Chicken Balls", "Mini Stix Deal - Egg Fried Rice and Chicken Balls", MEALS, "", True, ""),
    ("Sweet Chilli Sauce Dip Pot", "Sweet Chilli Sauce Dip Pot", DIPS, "1 pot", False, ""),
    ("Firecracker Sauce Dip Pot", "Firecracker Sauce Dip Pot", DIPS, "1 pot", False, ""),
    ("Chinese BBQ Sauce Dip Pot", "Chinese BBQ Sauce Dip Pot", DIPS, "1 pot", False, ""),
    ("Caramel Sauce Dip Pot", "Caramel Sauce Dip Pot", DIPS, "1 pot", False, ""),
    # drinks (fountain: 12 / 16 / 22 fl oz; bag-in-box syrup rows are per 100 ml, not a serving)
    *drink3("Pepsi", ["Pepsi 12 floz/355ml", "Pepsi 16 floz/473ml", "Pepsi 22 floz/651ml"]),
    ("Pepsi Max BIB - 100ml as consumed", None, "Per 100 ml of the bag-in-box mix, not a serving"),
    *drink3("Pepsi Max", ["Pepsi Max 12 floz/355ml", "Pepsi Max 16 floz/473ml", "Pepsi Max 22 floz/651ml"]),
    ("Diet Pepsi BIB - 100ml as consumed", None, "Per 100 ml of the bag-in-box mix, not a serving"),
    *drink3("Diet Pepsi", ["Diet Pepsi 12 floz/355ml", "Diet Pepsi 16 floz/473ml", "Diet Pepsi 22 floz/651ml"],
           ("", "Salt is printed as 0.84 g for 16 fl oz but 0.18 g for 12 fl oz and 0.33 g for 22 fl oz", "")),
    ("Pepsi Max Cherry BIB - 100ml as consumed", None, "Per 100 ml of the bag-in-box mix, not a serving"),
    *drink3("Pepsi Max Cherry", ["Pepsi Max Cherry 12floz/355ml", "Pepsi Max Cherry 16 floz/473ml", "Pepsi Max Cherry 22 floz/651ml"]),
    ("Tango Orange Sugar Free BIB - 100ml as consumed", None, "Per 100 ml of the bag-in-box mix, not a serving"),
    *drink3("Tango Orange Sugar Free", ["Tango Orange Sugar Free 12 floz/355ml", "Tango Orange Sugar Free 16 floz/473ml", "Tango Orange Sugar Free 22 floz/651ml"]),
    ("7Up Free BIB - 100ml as consumed", None, "Per 100 ml of the bag-in-box mix, not a serving"),
    *drink3("7Up Zero", ["7Up Zero 12 floz/355ml", "7Up Zero16 floz/473ml", "7Up Zero 22 floz/651ml"]),
    ("Cherry BIB per 100g/ml (as sold/unprepared)", None, "Per 100 g/ml of the unprepared syrup, not a serving"),
    ("Cherry 160z Bottomless", "Cherry (16 oz bottomless)", DRINKS, "16 oz", False, "The guide does not say what the drink is beyond the flavour"),
    ("Lime BIB per 100g/ml (as sold/unprepared)", None, "Per 100 g/ml of the unprepared syrup, not a serving"),
    ("Lime 16oz Bottomless", "Lime (16 oz bottomless)", DRINKS, "16 oz", False, "The guide does not say what the drink is beyond the flavour"),
    ("Strawberry BIB per 100g/ml (as sold/unprepared)", None, "Per 100 g/ml of the unprepared syrup, not a serving"),
    ("Strawberry 16oz Bottomless", "Strawberry (16 oz bottomless)", DRINKS, "16 oz", False,
     "The guide does not say what the drink is beyond the flavour"),
    ("Vanilla BIB per 100g/ml (as sold/unprepared)", None, "Per 100 g/ml of the unprepared syrup, not a serving"),
    ("Vanilla 16oz Bottomless", "Vanilla (16 oz bottomless)", DRINKS, "16 oz", False, "The guide does not say what the drink is beyond the flavour"),
    # Red Bull: each flavour is printed twice with no size on either row (the first looks like a per-100 ml row, the
    # second like a can), so neither can be shown as a stated serving.
    ("Red Bull Drink Original", None, "Printed twice with different numbers and no size on either row"),
    ("Red Bull Drink Original", None, "Printed twice with different numbers and no size on either row"),
    ("Red Bull Drink - Pink Forest Fruits Sugar Free", None, "Printed twice with different numbers and no size on either row"),
    ("Red Bull Drink - Pink Forest Fruits Sugar Free", None, "Printed twice with different numbers and no size on either row"),
    # page 3
    ("Red Bull Drink - Watermelon", None, "Printed twice with different numbers and no size on either row"),
    ("Red Bull Drink - Watermelon", None, "Printed twice with different numbers and no size on either row"),
    ("Red Bull Drink - Citrus Zest", None, "Printed twice with different numbers and no size on either row"),
    ("Red Bull Drink - Citrus Zest", None, "Printed twice with different numbers and no size on either row"),
    ("Robinsons Juice Drink - Apple, Orange and Mango 500ml", "Robinsons Juice Drink - Apple, Orange and Mango (500 ml)", DRINKS,
     "500 ml", False, ""),
    ("Fruit Shoot Blackcurrant 275ml bottle", "Fruit Shoot Blackcurrant (275 ml bottle)", DRINKS, "275 ml bottle", False,
     "Printed kJ (55) and kcal (17) do not agree"),
    ("Fruit Shoot Orange 275ml bottle", "Fruit Shoot Orange (275 ml bottle)", DRINKS, "275 ml bottle", False,
     "Printed kJ (55) and kcal (17) do not agree"),
    ("Liptons Ice Tea Lemon 500ml bottle", "Liptons Ice Tea Lemon (500 ml bottle)", DRINKS, "500 ml bottle", False, ""),
    ("Iron Bru CAN 330ml", None, CAN), ("Pepsi CAN 330ml", None, CAN), ("Diet Pepsi CAN 330ml", None, CAN),
    ("Pepsi Max CAN 330ml", None, CAN), ("Pepsi Max Cherry CAN 330ml", None, CAN), ("7Up Zero CAN 330ml", None, CAN),
    ("Tango Orange Original CAN 330ml", None, "No carbohydrate printed for this row (sugars are, but we never convert)"),
    ("Tango Orange Sugar Free CAN 330ml", None, CAN),
    ("Classic Coke 16 floz", None, CAN), ("Classic Coke 20 floz", None, CAN), ("Coke Zero 16 floz", None, CAN),
    ("Coke Zero 20 floz", None, CAN), ("Diet Coke 16 floz", None, CAN), ("Diet Coke 20 floz", None, CAN),
    ("Fanta regular 16 floz", None, CAN), ("Fanta regular 20 floz", None, CAN), ("Sprite Zero 16 floz", None, CAN),
    ("Sprite Zero 20 floz", None, CAN),
]

# Rows the guide prints with numbers that cannot be right. Not published, never corrected (printed label -> reason).
HOLDBACK = {
    "Katsu Curry Sauce Portion - Small": "Guide prints saturates 2.8 g above total fat 0.8 g, and 80 kcal where its own fat, carbohydrate and protein add up to about 33 kcal",
    "Katsu Curry Sauce Portion - Large": "Guide prints saturates 5.6 g above total fat 1.6 g, and 160 kcal where its own fat, carbohydrate and protein add up to about 66 kcal",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--allergens", type=Path, required=True, help="the Customer Allergen Chart PDF (ALLERGEN_URL)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=None, help="default: data/source/chopstix")
    args = ap.parse_args()

    chart = subprocess.run(["pdftotext", "-layout", str(args.allergens), "-"], check=True, capture_output=True, text=True).stdout
    if not ALLERGEN_VERSION.search(chart):
        print("The allergen chart is not 'CUSTOMER ALLERGEN CHART CS QA 07 V22 SEPTEMBER 2026': update ALLERGEN_URL and "
              "ALLERGEN_TITLE, and check whether it now has a row for every published item.", file=sys.stderr)
        return 1

    rows = read_rows(args.pdf)
    printed = [r["label"] for r in rows]
    expected = [s[0] for s in SPEC]
    if printed != expected:
        print(f"The PDF has {len(printed)} nutrition rows but SPEC names {len(expected)}. The menu or layout changed.", file=sys.stderr)
        extra = [p for p in printed if p not in expected]
        missing = [e for e in expected if e not in printed]
        if extra:
            print("  In the PDF but not in SPEC:", *extra, sep="\n    ", file=sys.stderr)
        if missing:
            print("  In SPEC but not in the PDF:", *missing, sep="\n    ", file=sys.stderr)
        if not extra and not missing:
            print("  Same rows, different order or count of repeats: compare the PDF with SPEC.", file=sys.stderr)
        print("Re-check the names, categories and exclusions in SPEC against the PDF, then run again.", file=sys.stderr)
        return 1

    items, held, id_of = [], [], {}
    for row, spec in zip(rows, SPEC):
        if spec[1] is None:
            continue
        label, name, category, serving, rankable, note = spec
        for k in ("kcal", "protein", "carbs", "fat"):
            if not row[k]:
                print(f"'{label}' is included in SPEC but the PDF has no {k} for it: move it to the excluded rows.", file=sys.stderr)
                return 1
        id_of[label] = slug(name)
        items.append({
            "name": name, "category": category, "serving": serving, "rankable": rankable, "notes": note,
            "calories": row["kcal"], "protein_g": row["protein"], "carbs_g": row["carbs"], "fat_g": row["fat"],
            "sat_fat_g": row["sat"], "salt_g": row["salt"], "sugar_g": row["sugars"], "fiber_g": row["fibre"],
            "energy_kj": row["kj"],
        })
    for label, reason in HOLDBACK.items():
        if label not in id_of:
            print(f"HOLDBACK names '{label}', which is not an included row.", file=sys.stderr)
            return 1
        held.append((id_of[label], reason))
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps the PDF order inside a category

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Chopstix", cuisine="Noodles", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["chopstix", "chopstix noodle bar", "chopstix noodles"], items=items,
        out=args.out, note=NOTE, holdback=held,
        allergen_guide={"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True})
    excluded = [s for s in SPEC if s[1] is None]
    print(f"wrote {len(items)} items ({len(held)} held back) to {out}; {len(excluded)} PDF rows left out "
          f"(PDF sha256 {sha256_file(args.pdf)}; allergen chart sha256 {sha256_file(args.allergens)}, linked only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
