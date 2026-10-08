#!/usr/bin/env python3
"""Build data/source/kfc/ from KFC UK & Ireland's official "Allergen & Nutrition Information" PDF.

    python3 tools/uk_extract/kfc.py path/to/nutrition-allergens.pdf --checked-on 2026-10-05

Numbers are copied from the PDF as printed (kJ into energy_kj, kcal, fat, saturates, carbs, sugars, protein, salt).
Only the NAMES and the grouping below are typed by hand, in the PDF's reading order. If KFC reorders or adds
rows the row count no longer matches and this script stops, so a human re-checks the names.

Allergens come from the same PDF: each row's "Contains Allergens" and "May Contain Allergens" cells, copied word for word
(kfc_pdf.read_allergen_cells). The guide names gluten cereals as "wheat gluten", "oat gluten" ..., so every cereal word must be
followed by "gluten" (and every "gluten" must follow a cereal) or the script stops. Any word that is not one of the 14 allergens
also stops it (common.allergen_words). The cells are matched to the nutrition rows by position and checked by their kcal.

Source: https://brand-uk.assets.kfc.co.uk/nutrition-allergens.pdf (a new PDF is published about monthly).
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kfc_pdf  # noqa: E402
from common import ITEM_FIELDS, allergen_words, write_allergens  # noqa: E402

CHAIN_ID = "kfc"
SOURCE_URL = "https://brand-uk.assets.kfc.co.uk/nutrition-allergens.pdf"

# (name, category, serving, rankable, limited_time, note) in the PDF's reading order, one entry per printed row.
# `None` = a row we deliberately leave out; the reason is given in EXCLUDED_REASON.
B, W, R, C, S, A, D, DR, SA = "Burgers", "Twisters & Wraps", "Rice bowls", "Chicken", "Sides", "Add-ons", "Desserts & treats", "Drinks", "Sauces"
ROWS: list[tuple | None] = [
    # page 1, left: burgers
    ("Fillet Burger", B, "1 burger", True, False, ""),
    ("Zinger Burger", B, "1 burger", True, False, ""),
    ("Fillet Tower Burger", B, "1 burger", True, False, ""),
    ("BBQ Fillet Tower Burger", B, "1 burger", True, False, ""),
    ("Zinger Supercharger Tower Burger", B, "1 burger", True, False, ""),
    ("Zinger Stacker Burger", B, "1 burger", True, False, ""),
    ("Mini Burger", B, "1 burger", True, False, ""),
    ("Kids Burger", B, "1 burger", True, False, ""),
    ("Vegan Burger", B, "1 burger", True, False, ""),
    None,  # Original Recipe Chicken Fillet Roll # (Ireland only)
    None,  # Zinger Fillet Roll # (Ireland only)
    ("BBQ Fillet Stacker Burger", B, "1 burger", True, False, ""),
    # twisters and wraps
    ("Kentucky Mayo Twister", W, "1 twister", True, False, ""),
    ("Sweet Chilli Twister", W, "1 twister", True, False, ""),
    ("Smokey BBQ Twister", W, "1 twister", True, False, ""),
    ("Supercharger Twister", W, "1 twister", True, False, ""),
    ("Flamin' Mini Wrap", W, "1 wrap", True, False, ""),
    ("BBQ Mini Wrap", W, "1 wrap", True, False, ""),
    # rice bowls
    ("Original Ranch Rice Bowl", R, "1 bowl", True, False, ""),
    ("Zinger Ranch Rice Bowl", R, "1 bowl", True, False, ""),
    ("Veggie Ranch Rice Bowl", R, "1 bowl", True, False, ""),
    # chicken pieces
    ("Original Recipe Chicken (per piece)", C, "1 piece (average)", False, False, "Per piece, so not suggested as a meal on its own"),
    ("Popcorn Chicken (small)", C, "Small", True, False, "Fat, carbs and protein are printed as the same number; calories agree with them"),
    ("Popcorn Chicken (regular)", C, "Regular", True, False, "Fat, carbs and protein are printed as the same number; calories agree with them"),
    ("Popcorn Chicken (large)", C, "Large", True, False, "Fat, carbs and protein are printed as the same number; calories agree with them"),
    ("Hot Wing (per piece)", C, "1 piece (average)", False, False, "Per piece, so not suggested as a meal on its own"),
    ("Tender (per piece)", C, "1 piece (average)", False, False, "Per piece, so not suggested as a meal on its own"),
    ("Sweet Chilli Drip'd Bites", C, "", True, False, ""),
    ("Kansas BBQ Drip'd Bites", C, "", True, False, ""),
    # sides
    ("Signature Fries (regular)", S, "Regular", True, False, ""),
    ("Signature Fries (large)", S, "Large", True, False, ""),
    ("BBQ Beans (regular)", S, "Regular", True, False, ""),
    ("BBQ Beans (large)", S, "Large", True, False, ""),
    ("Coleslaw (regular)", S, "Regular", True, False, ""),
    ("Coleslaw (large)", S, "Large", True, False, ""),
    ("Corn Cobette", S, "1 cobette", True, False, ""),
    ("2 Corn Cobettes (large)", S, "2 cobettes", True, False, ""),
    ("Gravy (regular)", S, "Regular", True, False, ""),
    ("Gravy (large)", S, "Large", True, False, ""),
    ("Creamy Mash (regular)", S, "Regular", True, False, ""),
    ("Creamy Mash (large)", S, "Large", True, False, ""),
    # page 1, right: sides
    ("Cajun Dirty Rice", S, "", True, False, ""),
    ("Side Salad", S, "", True, False, ""),
    ("Dirty Loaded Fries", S, "", True, False, ""),
    # add-ons
    ("Cheese Slice (per slice)", A, "1 slice (average)", False, False, ""),
    ("Hash Brown (per piece)", A, "1 piece (average)", False, False, ""),
    # krushems
    ("Oreo Krushems Shake", D, "", False, False, ""),
    ("MilkyBar Krushems Shake", D, "", False, False, ""),
    ("Aero Peppermint Krushem Shake", D, "", False, False, ""),
    ("Raspberry Ripple Krushem Shake", D, "", False, False, ""),
    # limited time offers
    ("3 Mega Mozza Sticks", S, "3 sticks", True, True, ""),
    ("Mozzamelt Fillet Burger", B, "1 burger", True, True, ""),
    ("Mozzamelt Zinger Burger", B, "1 burger", True, True, ""),
    ("Kentucky Original Wrap", W, "1 wrap", True, True, ""),
    # desserts and treats
    ("Mini Chocolate Sundae", D, "", False, False, ""),
    ("Oreo Sundae", D, "", False, False, ""),
    ("Milkybar Sundae", D, "", False, False, ""),
    ("Raspberry Ripple Sundae", D, "", False, False, ""),
    ("Milk Chocolate Cookie", D, "1 cookie", False, False, ""),
    ("White Chocolate Cookie", D, "1 cookie", False, False, ""),
    ("Yoyo Bear Strawberry", D, "", False, False, ""),
    # refreshers and lemonade
    ("Cherry Boba Refresher", DR, "", False, False, ""),
    ("Strawberry Boba Refresher", DR, "", False, False, ""),
    ("Sparkling Raspberry Lemonade", DR, "", False, False, ""),
    ("Sparkling Cloudy Lemonade", DR, "", False, False, ""),
    # iced coffee and shakes
    ("Iced Latte", DR, "", False, False, ""),
    ("Iced Tiramisu Latte", DR, "", False, False, ""),
    ("Iced Caramel Latte", DR, "", False, False, ""),
    ("Iced Vanilla Latte", DR, "", False, False, ""),
    ("Vanilla Iced Matcha", DR, "", False, False, ""),
    ("Strawberry Shortcake Iced Matcha", DR, "", False, False, ""),
    ("Oatly Iced Latte", DR, "", False, False, ""),
    ("Oatly Iced Caramel Latte", DR, "", False, False, ""),
    ("Oatly Iced Tiramisu Latte", DR, "", False, False, ""),
    ("Oatly Iced Vanilla Latte", DR, "", False, False, ""),
    ("Oatly Vanilla Iced Matcha", DR, "", False, False, ""),
    ("Oatly Strawberry Shortcake Iced Matcha", DR, "", False, False, ""),
    ("Caramel Krunch Shake", DR, "", False, False, ""),
    ("Chocolate Krunch Shake", DR, "", False, False, ""),
    ("Strawberry Shortcake Krunch Shake", DR, "", False, False, ""),
    # page 2, left: sauces
    ("Garlic Parm Dip Pot", SA, "1 pot", False, False, ""),
    ("Honey Mustard Dip Pot", SA, "1 pot", False, False, ""),
    ("Hot Honey Habanero Dip Pot", SA, "1 pot", False, False, ""),
    ("Jalapeno Ranch Dip Pot", SA, "1 pot", False, False, ""),
    ("Mango Masala Dip Pot", SA, "1 pot", False, False, ""),
    ("Original Sauce Dip Pot", SA, "1 pot", False, False, ""),
    ("Supercharger Dip Pot", SA, "1 pot", False, False, ""),
    ("Sweet Teriyaki Dip Pot", SA, "1 pot", False, False, ""),
    ("Texas BBQ Dip Pot", SA, "1 pot", False, False, ""),
    ("Heinz Tomato Ketchup sachet", SA, "1 sachet", False, False, ""),
    ("Heinz Light Mayonnaise sachet", SA, "1 sachet", False, False, ""),
    # drinks
    ("Bottle of Still Water", DR, "1 bottle", False, False, "Fat, carbs, sugars and protein are printed as 0.5 g although calories are 0"),
    ("Fruit Shoot Robinsons Blackcurrant & Apple", DR, "1 bottle", False, False, ""),
    ("Fruit Shoot Robinsons Orange", DR, "1 bottle", False, False, ""),
    ("Pepsi Max (regular)", DR, "Regular", False, False, ""),
    ("Pepsi Max (large)", DR, "Large", False, False, ""),
    ("Pepsi Max Cherry (regular)", DR, "Regular", False, False, ""),
    ("Pepsi Max Cherry (large)", DR, "Large", False, False, ""),
    None,  # Pepsi - Regular # (Ireland only)
    None,  # Pepsi - Large # (Ireland only)
    ("7Up Free (regular)", DR, "Regular", False, False, ""),
    ("7Up Free (large)", DR, "Large", False, False, ""),
    ("Robinsons Apple & Blackcurrant (regular)", DR, "Regular", False, False, ""),
    ("Robinsons Apple & Blackcurrant (large)", DR, "Large", False, False, ""),
    ("Tango Orange Sugar Free (regular)", DR, "Regular", False, False, ""),
    ("Tango Orange Sugar Free (large)", DR, "Large", False, False, ""),
    # page 2, right: drinks
    None,  # Club Orange - Regular ~ (Northern Ireland and Ireland only)
    None,  # Club Orange - Large ~
    None,  # Club Orange Zero - Regular ~
    None,  # Club Orange Zero - Large ~
    ("Diet Pepsi (regular)", DR, "Regular", False, False, ""),
    ("Diet Pepsi (large)", DR, "Large", False, False, ""),
    None,  # Pepsi Max Bottle per 250ml (bottle size not stated)
    None,  # Diet Pepsi Bottle per 250ml
    None,  # Tango Bottle per 250ml
    None,  # 7up Free Bottle per 250ml
    None,  # Club Orange per 250ml ~
    None,  # Pepsi Bottle per 250ml
    ("Apple Tango (regular)", DR, "Regular", False, False, "Printed kJ and kcal do not agree for this drink"),
    ("Apple Tango (large)", DR, "Large", False, False, "Printed kJ and kcal do not agree for this drink"),
    ("Lipton Ice Tea (regular)", DR, "Regular", False, False, "Salt printed as 0.90 g for regular but 0.13 g for large"),
    ("Lipton Ice Tea (large)", DR, "Large", False, False, "Salt printed as 0.90 g for regular but 0.13 g for large"),
    None,  # Pepsi Max Blueberry - Regular (selected restaurants only)
    None,  # Pepsi Max Blueberry - Large
    None,  # Pepsi Max Vanilla - Regular
    None,  # Pepsi Max Vanilla - Large
    None,  # 7Up Free Watermelon - Regular
    None,  # 7Up Free Watermelon - Large
]

CATEGORY_ORDER = [B, W, R, C, S, A, D, DR, SA]

# Rows the PDF prints with figures that contradict each other (accuracy check 2026-10-08, rendered pages read): not published, listed in the
# check report, never corrected. Restore by deleting the id's line from holdback.csv once KFC corrects the PDF.
HOLDBACK = {
    "Apple Tango (regular)": "The PDF prints 30 kJ with 12 kcal: 12 kcal is about 50 kJ, so kJ and kcal contradict (and carbohydrate 1.5 g would "
                             "give about 6 kcal).",
    "Apple Tango (large)": "The PDF prints 68 kJ with 18 kcal: 18 kcal is about 75 kJ, so kJ and kcal contradict (and carbohydrate 2.3 g would "
                           "give about 9 kcal).",
    "Lipton Ice Tea (regular)": "The PDF prints salt 0.90 g for the regular size but 0.13 g for the large: the larger size cannot have much less "
                                "salt, so the sizes contradict and neither is chosen.",
    "Lipton Ice Tea (large)": "The PDF prints salt 0.90 g for the regular size but 0.13 g for the large: the larger size cannot have much less "
                              "salt, so the sizes contradict and neither is chosen.",
}
# Printed as "<cereal> gluten" in the allergen cells.
CEREALS = ("wheat", "barley", "oat", "rye", "spelt")
ALLERGEN_TITLE = "KFC UK & Ireland Allergen & Nutrition Information (September 2026)"


def cell_allergens(words: list[str], where: str) -> tuple[set[str], set[str], set[str]]:
    """One printed allergen cell -> (keys, cereals, nuts). "wheat gluten" is one entry (wheat); a cereal without "gluten"
    after it, or a "gluten" without a cereal before it, stops the run."""
    entries, i = [], 0
    while i < len(words):
        w = words[i].lower()
        if w in CEREALS:
            if i + 1 >= len(words) or words[i + 1].lower() != "gluten":
                raise SystemExit(f"{where}: {w!r} is not followed by 'gluten' in {' '.join(words)!r}: re-check the PDF")
            entries.append(w)
            i += 2
            continue
        if w == "gluten":
            raise SystemExit(f"{where}: 'gluten' printed without its cereal in {' '.join(words)!r}: re-check the PDF")
        entries.append(w)
        i += 1
    return allergen_words(entries, where)


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live menu")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = kfc_pdf.read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}. The layout or menu changed: "
              "re-check the names in ROWS against the PDF before running again.", file=sys.stderr)
        return 1
    cells = kfc_pdf.read_allergen_cells(args.pdf)
    if len(cells) != len(rows) or any(c["kcal"] != r["kcal"] for c, r in zip(cells, rows)):
        print("The allergen cells do not line up with the nutrition rows (count or kcal differs): re-check the PDF layout.",
              file=sys.stderr)
        return 1

    items, allergens = [], {}
    for printed, cell, spec in zip(rows, cells, ROWS):
        if spec is None:
            continue
        name, category, serving, rankable, limited, note = spec
        contains, cereals, nuts = cell_allergens(cell["contains"], f"{name} (contains)")
        may, _, _ = cell_allergens(cell["may_contain"], f"{name} (may contain)")
        allergens[slug(name)] = {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": serving,
            "calories": printed["kcal"], "protein_g": printed["protein"], "carbs_g": printed["carbs"], "fat_g": printed["fat"],
            "sat_fat_g": printed["sat"], "sodium_mg": "", "salt_g": printed["salt"], "sugar_g": printed["sugars"], "fiber_g": "",
            "energy_kj": printed["kj"],
            "tags": "vegetarian" if printed["veg"] == "✔" else "",
            "limited_time": str(limited).lower(), "rankable": str(rankable).lower(), "components": "", "added_on": "", "notes": note,
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ITEM_FIELDS, restval="")
        w.writeheader()
        w.writerows(items)
    (args.out / "chain.csv").write_text(
        "id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample\n"
        f'{CHAIN_ID},KFC,Chicken,standard,"KFC UK & Ireland Allergen & Nutrition Information (September 2026)",{SOURCE_URL},{args.checked_on},kfc|kentucky fried chicken,\n',
        encoding="utf-8")
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")
    write_allergens(args.out, CHAIN_ID, [(i["id"], allergens[i["id"]]) for i in items],
                    {"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    held = {i["name"]: i["id"] for i in items}
    missing = [n for n in HOLDBACK if n not in held]
    if missing:
        print(f"HOLDBACK names rows that are no longer in the PDF: {missing}", file=sys.stderr)
        return 1
    with open(args.out / "holdback.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["item_id", "reason"])
        w.writerows((held[n], why) for n, why in HOLDBACK.items())
    print(f"wrote {len(items)} items to {args.out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()[:16]})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
