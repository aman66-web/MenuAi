#!/usr/bin/env python3
"""Build data/source/five-guys/ from Five Guys UK's official "Allergen, Ingredient & Nutrition Guide" PDF.

    python3 tools/uk_extract/five_guys.py path/to/guide.pdf --checked-on 2026-10-05

Numbers are copied from the PDF's "NUTRITION GUIDE - UK LOCATIONS ONLY" table as printed, per serving (kcal, fat,
saturates, carbohydrate, sugars, fibre, protein, salt; kJ is not used; the per-100 g columns are never used).
Only the NAMES, categories and tags below are typed by hand, in the order the PDF prints its rows. The script stops if
the number of rows or any row label differs from ROWS, so a human re-checks the names when Five Guys edits the guide.

Why `standard` and not `build_your_own`: the guide prints a value for every ingredient (bun, patty, bacon, cheese,
each topping) AND a value for every finished burger/hot dog/sandwich, but the ingredient values do not add up to the
finished items (e.g. Hot Dog 477 kcal printed vs 215 bun + 192 sausage = 407; Little Cheeseburger 506 kcal vs Little
Hamburger 457 + cheese 64 = 521), and the guide does not say which toppings the printed items include. A components
recipe would therefore show numbers Five Guys does not publish, so the printed item values are used as they are.

Source: https://www.fiveguys.co.uk/wp-content/uploads/sites/30/2026/08/FGUK_FOH_allergen_ingredient_nutrition_Myprotein_shake_DIGITAL_20260805.pdf
(linked as "UK Nutrition & Allergen Guide" on https://www.fiveguys.co.uk/nutritional-allergy-information/; re-published every few months).
"""
import argparse
import csv
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import five_guys_pdf  # noqa: E402

CHAIN_ID = "five-guys"
SOURCE_URL = ("https://www.fiveguys.co.uk/wp-content/uploads/sites/30/2026/08/"
              "FGUK_FOH_allergen_ingredient_nutrition_Myprotein_shake_DIGITAL_20260805.pdf")
SOURCE_TITLE = "Five Guys UK Allergen, Ingredient & Nutrition Guide, UK locations only (FGUK_20260805)"
ALIASES = "five guys|fiveguys|five guys burgers and fries"

BU, HD, SA, FR, MS, MX, TP, PT = ("Burgers", "Hot dogs", "Sandwiches", "Fries", "Milkshakes", "Milkshake mix-ins",
                                  "Toppings & sauces", "Burger & hot dog parts")
BEEF, PORK = "contains_beef", "contains_pork"
MIXIN_NOTE = "Per serving as printed; the guide says the amount of each mix-in varies with the number of mix-ins in the shake"
EXC_PART = "participating locations only"
EXC_HEATHROW = "Heathrow Airport only"

# One entry per printed nutrition row, in the PDF's order:
#   (printed label, name, category, serving, rankable, tags, note)
# name None = a row we deliberately leave out; `note` then gives the reason (printed in the run summary).
ROWS: list[tuple] = [
    # MEAT
    ("Bacon**", "Bacon", PT, "", False, [PORK], "Marked ** (non-halal stores only). A burger/hot dog add-on"),
    ("Beef Burger Patty", "Beef Burger Patty", PT, "", False, [BEEF], ""),
    ("Hot Dog", "Hot Dog (sausage only)", PT, "", False, [BEEF], "Printed as 'Hot Dog' in the MEAT section: the sausage on its own, not the finished hot dog"),
    # BUN
    ("Burger Bun", "Burger Bun", PT, "", False, [], ""),
    ("Hot Dog Bun", "Hot Dog Bun", PT, "", False, [], ""),
    # FRIES
    ("Mini Fries", "Mini Fries", FR, "Mini", True, [], "Saturates printed to 2 decimals (2.84); the pipeline stores 1 decimal"),
    ("Little Fries", "Little Fries", FR, "Little", True, [], ""),
    ("Reg Fries", "Regular Fries", FR, "Regular", True, [], "Printed as 'Reg Fries'"),
    ("Large Fries", "Large Fries", FR, "Large", True, [], ""),
    # LOADED FRIES section
    ("Loaded Fries*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Loaded Cajun Fries*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Diced Green Peppers", None, "", "", False, [], "loaded-fries topping; purpose not stated, and 'Fresh Onions' there duplicates the toppings row with other values"),
    ("Fresh Onions", None, "", "", False, [], "loaded-fries topping; duplicates the toppings row 'Fresh Onions' with different values"),
    ("Diced Jalapeño Peppers", None, "", "", False, [], "loaded-fries topping; purpose not stated"),
    ("Diced Tomatoes", None, "", "", False, [], "loaded-fries topping; purpose not stated"),
    # TOPPINGS
    ("BBQ Sauce", "BBQ Sauce", TP, "", False, [], ""),
    ("Cheese (pasteurised)", "Cheese (pasteurised)", TP, "", False, [], ""),
    ("Green Peppers", "Green Peppers", TP, "", False, [], ""),
    ("Grilled Mushrooms", "Grilled Mushrooms", TP, "", False, [], ""),
    ("Hot Sauce", "Hot Sauce", TP, "", False, [], ""),
    ("HP Brown Sauce", "HP Brown Sauce", TP, "", False, [], ""),
    ("Jalapeño Peppers", "Jalapeño Peppers", TP, "", False, [], ""),
    ("Tomato Ketchup", "Tomato Ketchup", TP, "", False, [], ""),
    ("Lettuce", "Lettuce", TP, "", False, [], ""),
    ("Mayonnaise", "Mayonnaise", TP, "", False, [], ""),
    ("Mustard", "Mustard", TP, "", False, [], ""),
    ("Fresh Onions", "Fresh Onions", TP, "", False, [], ""),
    ("Grilled Onions", "Grilled Onions", TP, "", False, [], ""),
    ("Pickles", "Pickles", TP, "", False, [], ""),
    ("Relish", "Relish", TP, "", False, [], ""),
    ("Tomatoes", "Tomatoes", TP, "", False, [], ""),
    ("Crispy Fried Onions", "Crispy Fried Onions", TP, "", False, [], ""),
    # MILKSHAKES (including Big Kids shake) + MIX-INS
    ("Five Guys Milkshake Base", "Five Guys Milkshake Base", MS, "", False, [], "Table heading: 'Milkshakes (including Big Kids Shake)'; no size named"),
    ("Whipped Cream", "Whipped Cream (milkshake)", MX, "", False, [], MIXIN_NOTE),
    ("Flake", "Flake (milkshake)", MX, "", False, [],
     "Fat printed as 18 g but 43 kcal (per 100 g: 28 g fat, 522 kcal): fat looks like a typo for 1.8; entered as printed. " + MIXIN_NOTE),
    ("Banana", "Banana mix-in", MX, "", False, [],
     "Calories (194) are higher than 4P+4C+9F (144) allows; kJ and kcal agree with each other. Fat 0 here but 2.5 in the little shake. " + MIXIN_NOTE),
    ("Chocolate", "Chocolate mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Lotus Biscoff", "Lotus Biscoff mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Oreo Cookie Pieces", "Oreo Cookie Pieces mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Jimmy’s Iced Coffee", "Jimmy’s Iced Coffee mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Pistachio***", "Pistachio mix-in", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Reese's Peanut Butter Cups***", "Reese's Peanut Butter Cups mix-in", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Peanut Butter***", "Peanut Butter mix-in", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Salted Caramel", "Salted Caramel mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Strawberry", "Strawberry mix-in", MX, "", False, [], MIXIN_NOTE),
    ("Watermelon*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Myprotein (12g)", "Myprotein mix-in (12 g)", MX, "12 g", False, [], MIXIN_NOTE),
    # LITTLE MILKSHAKES + (MIX-INS)
    ("Five Guys Milkshake Base Little", "Five Guys Milkshake Base (little)", MS, "Little", False, [], ""),
    ("Whipped Cream Little", "Whipped Cream (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Flake", "Flake (little shake)", MX, "", False, [],
     "Identical to the regular-shake row, although every other little-shake mix-in is smaller. Fat printed as 18 g but 43 kcal: looks like a typo for 1.8; entered as printed. " + MIXIN_NOTE),
    ("Banana Little", "Banana mix-in (little shake)", MX, "", False, [], "Fat 2.5 here but 0 in the regular shake. " + MIXIN_NOTE),
    ("Chocolate Little", "Chocolate mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Lotus Biscoff Little", "Lotus Biscoff mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Oreo Cookie Pieces Little", "Oreo Cookie Pieces mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Jimmy’s Iced Coffee", "Jimmy’s Iced Coffee mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Pistachio***", "Pistachio mix-in (little shake)", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Reese's Peanut Butter Cups***", "Reese's Peanut Butter Cups mix-in (little shake)", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Peanut Butter Little***", "Peanut Butter mix-in (little shake)", MX, "", False, [], "Marked *** (not at Heathrow Airport). " + MIXIN_NOTE),
    ("Salted Caramel Little", "Salted Caramel mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Strawberry Little", "Strawberry mix-in (little shake)", MX, "", False, [], MIXIN_NOTE),
    ("Watermelon Little*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Myprotein (6g)", "Myprotein mix-in (6 g, little shake)", MX, "6 g", False, [], MIXIN_NOTE),
    # BURGERS (the ingredient list names a beef patty and, for bacon burgers, bacon)
    ("Hamburger", "Hamburger", BU, "", True, [BEEF], ""),
    ("Little Hamburger", "Little Hamburger", BU, "", True, [BEEF], ""),
    ("Cheeseburger", "Cheeseburger", BU, "", True, [BEEF], ""),
    ("Little Cheeseburger", "Little Cheeseburger", BU, "", True, [BEEF], ""),
    ("Bacon Burger", "Bacon Burger", BU, "", True, [BEEF, PORK], ""),
    ("Little Bacon Burger", "Little Bacon Burger", BU, "", True, [BEEF, PORK],
     "Carbohydrate printed as 367 g (per 100 g: 23 g; the other burgers are 35-39 g): clearly a typo, probably 36.7; entered as printed"),
    ("Bacon Cheeseburger", "Bacon Cheeseburger", BU, "", True, [BEEF, PORK], ""),
    ("Little Bacon Cheeseburger", "Little Bacon Cheeseburger", BU, "", True, [BEEF, PORK], ""),
    # HOT DOGS (ingredient list: beef hot dog)
    ("Hot Dog", "Hot Dog", HD, "", True, [BEEF], ""),
    ("Cheese Dog", "Cheese Dog", HD, "", True, [BEEF], ""),
    ("Bacon Dog", "Bacon Dog", HD, "", True, [BEEF, PORK], ""),
    ("Bacon Cheese Dog", "Bacon Cheese Dog", HD, "", True, [BEEF, PORK], ""),
    # SANDWICHES
    ("Veggie Sandwich", "Veggie Sandwich", SA, "", True, [], "The guide has no vegetarian marking, so no vegetarian tag"),
    ("Cheese Veggie Sandwich", "Cheese Veggie Sandwich", SA, "", True, [], "The guide has no vegetarian marking, so no vegetarian tag"),
    ("Grilled Cheese", "Grilled Cheese", SA, "", True, [], ""),
    ("BLT**", "BLT (Bacon, Lettuce and Tomato)", SA, "", True, [PORK], "Marked ** (non-halal stores only)"),
    ("Lettuce Wrap", "Lettuce Wrap", SA, "", True, [BEEF],
     "Printed with: Patty, Tomatoes, Pickles, Grilled Onions, Green Peppers, Grilled Mushrooms (ingredient list: Ground Beef, Lettuce, ...)"),
    ("Bulk Peanuts Without Shell ***", None, "", "", False, [], "per-serving cells are empty (only per 100 g is printed)"),
    # BREAKFAST (sandwiches available at Heathrow only)
    ("Sausage, Egg & Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Bacon, Egg & Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Little Sausage, Egg and Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Little Bacon, Egg & Cheese Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Latte*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Cappuccino*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Flat White*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Americano Black*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Americano White*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART + "; every per-serving value printed as 0"),
    ("Double Espresso*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    ("Breakfast Tea*", None, "", "", False, [], "breakfast drink, marked * " + EXC_PART),
    # BUILD YOUR OWN (Heathrow only)
    ("Little Egg Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Little Sausage Sandwich", None, "", "", False, [], EXC_HEATHROW),
    ("Add Cheese", None, "", "", False, [], EXC_HEATHROW + " (same values as the Cheese topping)"),
    ("Add Bacon", None, "", "", False, [], EXC_HEATHROW),
    ("Sausage Patty *", None, "", "", False, [], EXC_HEATHROW + ", marked *"),
    # SIDES (Heathrow only)
    ("Hash Browns*", None, "", "", False, [], EXC_HEATHROW + ", marked *"),
    # OTHER ITEMS
    ("Egg*", None, "", "", False, [], "marked * " + EXC_PART),
    ("Cajun seasoning", "Cajun seasoning", TP, "", False, [], "Salt printed as 1.2 g per serving"),
]

CATEGORY_ORDER = [BU, HD, SA, FR, MS, MX, TP, PT]
ITEM_FIELDS = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
               "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]


def slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")  # Jalapeño -> Jalapeno
    out = "".join(c.lower() if c.isalnum() else "-" for c in ascii_name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def norm(label: str) -> str:
    """Compare labels ignoring asterisks, the (R) sign, hyphenation, spacing and case."""
    return re.sub(r"[^a-z0-9]", "", label.lower().replace("&apos;", "'"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live menu")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = five_guys_pdf.read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}. The layout or menu changed: "
              "re-check the names in ROWS against the PDF before running again.", file=sys.stderr)
        return 1
    for n, (printed, spec) in enumerate(zip(rows, ROWS), start=1):
        want, got = norm(spec[0]), norm(printed["label"])
        if want != got and not got.startswith(want):
            print(f"Row {n}: the PDF prints {printed['label']!r} but this script expects {spec[0]!r}. "
                  "The menu changed: re-check ROWS.", file=sys.stderr)
            return 1

    items, excluded = [], []
    for printed, spec in zip(rows, ROWS):
        label, name, category, serving, rankable, tags, note = spec
        if name is None:
            excluded.append((label, note))
            continue
        v = printed["values"]
        if v is None:
            print(f"{label!r} has no per-serving values but is listed as an item.", file=sys.stderr)
            return 1
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": serving,
            "calories": v["kcal"], "protein_g": v["protein"], "carbs_g": v["carbs"], "fat_g": v["fat"],
            "sat_fat_g": v["sat"], "sodium_mg": "", "salt_g": v["salt"], "sugar_g": v["sugars"], "fiber_g": v["fibre"],
            "tags": "|".join(sorted(tags)),
            "limited_time": "false", "rankable": str(rankable).lower(), "components": "", "added_on": "", "notes": note,
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), f"duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps the PDF order inside a category

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ITEM_FIELDS)
        w.writeheader()
        w.writerows(items)
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Five Guys", "Burgers", "standard", SOURCE_TITLE, SOURCE_URL, args.checked_on, ALIASES, ""])
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")

    by_cat = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {args.out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    print("by category:", ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    print(f"left out {len(excluded)} printed rows:")
    for label, why in excluded:
        print(f"  - {label}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
