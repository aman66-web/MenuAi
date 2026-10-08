#!/usr/bin/env python3
"""Build data/source/taco-bell/ from Taco Bell UK's official nutrition table.

    curl -A "Mozilla/5.0" -o taco-bell-nutrition.html https://www.nutritionix.com/taco-bell-uk/menu/premium
    python3 tools/uk_extract/taco_bell.py taco-bell-nutrition.html --checked-on 2026-10-05

Source: https://www.tacobell.co.uk/nutrition-information/ is a page that only frames
https://www.nutritionix.com/taco-bell-uk/menu/premium, the table Taco Bell UK itself publishes there
(the table says "Last Updated: MM/DD/YYYY"; it is updated about monthly). Download that one page and give it to this script.

Numbers are copied from the table as printed (kcal, fat, saturates, carbs, sugars, fibre, protein, salt; kJ is not used).
Only the NAMES, categories, servings and rankable flags below are typed by hand. The script stops if the table's row count,
its columns, or any item name no longer matches PLAN, so a human re-checks the names before the next run.

Left out on purpose (see EXCLUDED_CATEGORIES and DUPLICATES):
  Meals            fixed meal/box/bundle combos ("Meal with Fries", "for 2", "Match Day for 4"): the table does not say what
                   they contain, and the playbook skips combos.
  Single Portions  ingredient amounts (e.g. "Lettuce, Single Portion"), not things sold on their own.
  Cravings Value Menu rows that repeat an item listed elsewhere with identical numbers (the script checks they are identical).
"""
import argparse
import csv
import datetime
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import taco_bell_page  # noqa: E402

CHAIN_ID = "taco-bell"
SOURCE_URL = "https://www.tacobell.co.uk/nutrition-information/"
EXPECTED_ROWS = 477

TA, BU, SP, CH, SI, DE, DR, SA = "Tacos", "Burritos", "Specialties", "Chicken", "Sides", "Desserts", "Drinks", "Sauces & add-ons"
CATEGORY_ORDER = [TA, BU, SP, CH, SI, DE, DR, SA]

# Page categories we do not import, with the number of rows the table had when this script was written.
EXCLUDED_CATEGORIES = {"Meals": 315, "Single Portions": 13}

Q = ("Printed values are far higher than every other item (and than the same quesadilla inside the Meals rows, which imply "
     "about 540 kcal). Entered exactly as printed; looks like an error in the source")
# Rows the chain's own table makes impossible: held back, never corrected (data/source/taco-bell/holdback.csv is written from these).
HOLD_QUESADILLA = "The table prints 1,849-2,708 kcal for one quesadilla; its own meal rows containing a quesadilla imply about 540 kcal."
HOLD_DRINK = ("Taco Bell's drinks table has impossible values (e.g. 803 kcal for a large iced tea, a 'sugar free' drink with 21 g of "
              "sugar), so none of its drinks are published until Taco Bell confirms them.")
# The quesadillas printed with the impossible values (the "Baby Quesadilla" has ordinary numbers and is published).
HELD_QUESADILLAS = {
    "Grilled Cheese Quesadilla - Beef", "Grilled Cheese Quesadilla - Black Beans", "Grilled Cheese Quesadilla - Chicken",
    "Quesadilla - Beef", "Quesadilla - Black Beans", "Quesadilla - Cheese", "Quesadilla - Double Beef",
    "Quesadilla - Double Black Beans", "Quesadilla - Double Grilled Chicken", "Quesadilla - Grilled Chicken",
}
SHARER = "Called a 'Sharer'; how many people it feeds is not stated, so it is not suggested as one person's order"
NOSIZE = "Container size is not stated; values are per can/bottle as sold"
BEANS = "Printed fibre is more than the printed total carbohydrate"

# (printed name, category, serving, rankable, note) per page category, in the table's order.
# Serving is only what the item's own name states ("(Large)", "(3)", "Sachet"). `None` as category = a row that repeats an
# item listed under another page category (values checked identical below).
PLAN: dict[str, list[tuple]] = {
    "Featured": [
        ("3x Salted Caramel Churro Bites", DE, "3 bites", False, ""),
        ("6x Salted Caramel Churro Bites", DE, "6 bites", False, ""),
        ("9x Salted Caramel Churro Bites", DE, "9 bites", False, ""),
        ("Baja Blast (Large)", DR, "Large", False, ""),
        ("Baja Blast (Regular)", DR, "Regular", False, ""),
        ("Beefy Melt Burrito", BU, "", True, "'Beefy' in the name, tagged contains_beef"),
        ("Caramel Apple Empanada", DE, "", False, ""),
        ("Chicken Bite (1)", CH, "1 bite", False, "Per piece, so not suggested as a meal on its own"),
        ("Chicken Bites (3)", CH, "3 bites", True, ""),
        ("Chicken Bites (3) with Nacho Cheese Sauce", CH, "3 bites + sauce", True, ""),
        ("Chicken Bites (5)", CH, "5 bites", True, ""),
        ("Chicken Bites (5) with Nacho Cheese Sauce", CH, "5 bites + sauce", True, ""),
        ("Chicken Bites (20)", CH, "20 bites", True, ""),
        ("Chicken Bites (20) with Nacho Cheese Sauce (2)", CH, "20 bites + 2 sauces", True, ""),
        ("Grilled Cheese Crunchwrap - Beef", SP, "", True, ""),
        ("Grilled Cheese Crunchwrap - Black Beans", SP, "", True, ""),
        ("Grilled Cheese Crunchwrap - Chicken", SP, "", True, ""),
        ("Grilled Cheese Quesadilla - Beef", SP, "", True, Q),
        ("Grilled Cheese Quesadilla - Black Beans", SP, "", True, Q),
        ("Grilled Cheese Quesadilla - Chicken", SP, "", True, Q),
        ("Grilled Cheese Volcano Burrito - Beef", BU, "", True, ""),
        ("Grilled Cheese Volcano Burrito - Black Beans", BU, "", True, ""),
        ("Grilled Cheese Volcano Burrito - Chicken", BU, "", True, ""),
        ("Large Crispy Chicken Sharer", CH, "Large", False, SHARER),
        ("Loaded Protein Bowl", SP, "", True, ""),
        ("Loaded XL Burrito - Beef", BU, "", True, ""),
        ("Loaded XL Burrito - Black Beans", BU, "", True, ""),
        ("Loaded XL Burrito - Grilled Chicken", BU, "", True, ""),
        ("Regular Crispy Chicken Sharer", CH, "Regular", False, SHARER),
    ],
    "Tacos": [
        ("Crispy Chicken Soft Taco", TA, "", True, ""),
        ("Crunchy Taco - Beef", TA, "", True, ""),
        ("Crunchy Taco - Black Beans", TA, "", True, ""),
        ("Crunchy Taco - Grilled Chicken", TA, "", True, ""),
        ("Crunchy Taco Supreme - Beef", TA, "", True, ""),
        ("Crunchy Taco Supreme - Black Beans", TA, "", True, ""),
        ("Crunchy Taco Supreme - Grilled Chicken", TA, "", True, ""),
        ("Soft Taco - Beef", TA, "", True, ""),
        ("Soft Taco - Black Beans", TA, "", True, ""),
        ("Soft Taco - Grilled Chicken", TA, "", True, ""),
        ("Soft Taco Supreme - Beef", TA, "", True, ""),
        ("Soft Taco Supreme - Black Beans", TA, "", True, ""),
        ("Soft Taco Supreme - Grilled Chicken", TA, "", True, ""),
    ],
    "Burritos": [
        ("7-Layer Burrito", BU, "", True, ""),
        ("Beefy Nacho Cravings Burrito", BU, "", True, "'Beefy' in the name, tagged contains_beef"),
        ("Crispy Chicken Burrito", BU, "", True, ""),
        ("Double Cheesy Black Bean Cravings Burrito", BU, "", True, ""),
        ("Spicy Chicken Cravings Burrito", BU, "", True, ""),
        ("Volcano Burrito - Beef", BU, "", True, ""),
        ("Volcano Burrito - Black Beans", BU, "", True, ""),
        ("Volcano Burrito - Grilled Chicken", BU, "", True, ""),
    ],
    "Specialties": [
        ("Baby Quesadilla", SP, "", True, ""),
        ("Chalupa Supreme - Beef", SP, "", True, ""),
        ("Chalupa Supreme - Black Bean", SP, "", True, ""),
        ("Chalupa Supreme - Grilled Chicken", SP, "", True, ""),
        ("Cheesy Gordita Crunch", SP, "", True, ""),
        ("Cheesy Gordita Crunch - Black Beans", SP, "", True, ""),
        ("Cheesy Gordita Crunch - Grilled Chicken", SP, "", True, ""),
        ("Crunchwrap Supreme - Beef", SP, "", True, ""),
        ("Crunchwrap Supreme - Black Beans", SP, "", True, ""),
        ("Crunchwrap Supreme - Grilled Chicken", SP, "", True, ""),
        ("Quesadilla - Beef", SP, "", True, Q),
        ("Quesadilla - Black Beans", SP, "", True, Q),
        ("Quesadilla - Cheese", SP, "", True, Q),
        ("Quesadilla - Double Beef", SP, "", True, Q),
        ("Quesadilla - Double Black Beans", SP, "", True, Q),
        ("Quesadilla - Double Grilled Chicken", SP, "", True, Q),
        ("Quesadilla - Grilled Chicken", SP, "", True, Q),
    ],
    "Sides": [
        ("Black Beans", SI, "", True, BEANS),
        ("Crispy Chicken Tenders (2)", CH, "2 tenders", True, ""),
        ("Crispy Chicken Tenders (3)", CH, "3 tenders", True, ""),
        ("Crispy Chicken Tenders (3) with Cali Ranch Sauce", CH, "3 tenders + sauce", True, ""),
        ("Crispy Chicken Tenders (3) with Creamy Jalapeno Sauce", CH, "3 tenders + sauce", True, ""),
        ("Crispy Chicken Tenders (3) with Lava Sauce", CH, "3 tenders + sauce", True, ""),
        ("Crispy Chicken Tenders (3) with Nacho Cheese Sauce", CH, "3 tenders + sauce", True, ""),
        ("Crispy Chicken Tenders (5)", CH, "5 tenders", True, ""),
        ("Crispy Chicken Tenders (5) with Cali Ranch Sauce", CH, "5 tenders + sauce", True, ""),
        ("Crispy Chicken Tenders (5) with Creamy Jalapeno Sauce", CH, "5 tenders + sauce", True, ""),
        ("Crispy Chicken Tenders (5) with Lava Sauce", CH, "5 tenders + sauce", True, ""),
        ("Crispy Chicken Tenders (5) with Nacho Cheese Sauce", CH, "5 tenders + sauce", True, ""),
        ("Dip Pot - Cali Ranch Sauce", SA, "1 pot", False, ""),
        ("Dip Pot - Creamy Jalapeno Sauce", SA, "1 pot", False, ""),
        ("Dip Pot - Lava Sauce", SA, "1 pot", False, ""),
        ("Dip Pot - Nacho Cheese", SA, "1 pot", False, ""),
        ("Fries Bell Grande", SI, "", True, ""),
        ("Fries Supreme", SI, "", True, ""),
        ("Guacamole", SA, "", False, ""),
        ("Jalapeños", SA, "", False, ""),
        ("Nacho Cheese Sauce", SA, "", False, ""),
        ("Nacho Chips (Large)", SI, "Large", True, ""),
        ("Nacho Chips (Regular)", SI, "Regular", True, ""),
        ("Nacho Chips with Cheese Sauce (Large)", SI, "Large", True, ""),
        ("Nacho Chips with Cheese Sauce (Regular)", SI, "Regular", True, ""),
        ("Nachos Bell Grande", SI, "", True, ""),
        ("Seasoned Fries (Large)", SI, "Large", True, ""),
        ("Seasoned Fries (Regular)", SI, "Regular", True, ""),
        ("Seasoned Fries (XL)", SI, "XL", True, ""),
        ("Seasoned Fries with Cheese Sauce (Large)", SI, "Large", True, ""),
        ("Seasoned Fries with Cheese Sauce (Regular)", SI, "Regular", True, ""),
        ("Seasoned Rice", SI, "", True, ""),
        ("Sour Cream", SA, "", False, ""),
    ],
    "Desserts": [
        ("Churros", DE, "", False, ""),
        ("Churros (2) with Caramel Sauce", DE, "2 churros", False, ""),
        ("Churros (6) with Caramel Sauce", DE, "6 churros", False, ""),
        ("Cinnamon Twists", DE, "", False, ""),
        ("Grande Cinnamon Twists", DE, "", False, ""),
    ],
    "Drinks": [
        ("7Up Free (500ml Bottle)", DR, "500ml bottle", False, ""),
        ("7Up Free (Can)", DR, "1 can", False, NOSIZE),
        ("7Up Free (Large)", DR, "Large", False, "Printed 85 kcal with every macro '<0.5'; the Regular is 45 kcal. Entered as printed"),
        ("7Up Free (Regular)", DR, "Regular", False, ""),
        ("Bottled Water", DR, "", False, "Bottle size not stated. 0 kcal printed but carbohydrate printed as 2.5 g"),
        ("Diet Pepsi (500ml Bottle)", DR, "500ml bottle", False, ""),
        ("Diet Pepsi (Can)", DR, "1 can", False, NOSIZE),
        ("Diet Pepsi (Large)", DR, "Large", False, ""),
        ("Diet Pepsi (Regular)", DR, "Regular", False, ""),
        ("Lipton Ice Tea Peach (Large)", DR, "Large", False, "Very high for an iced tea (803 kcal, 190 g sugars); entered as printed"),
        ("Lipton Ice Tea Peach (Regular)", DR, "Regular", False, "Very high for an iced tea (425 kcal, 101 g sugars); entered as printed"),
        ("Mountain Dew Citrus Sugar Free (Bottle)", DR, "1 bottle", False, "Bottle size not stated; values are per bottle as sold"),
        ("Pepsi (500ml Bottle)", DR, "500ml bottle", False, "450 kcal is over twice the Pepsi can (196 kcal); entered as printed"),
        ("Pepsi (Can)", DR, "1 can", False, NOSIZE),
        ("Pepsi Max (500ml Bottle)", DR, "500ml bottle", False, ""),
        ("Pepsi Max (Can)", DR, "1 can", False, NOSIZE),
        ("Pepsi Max (Large)", DR, "Large", False, ""),
        ("Pepsi Max (Regular)", DR, "Regular", False, ""),
        ("Pepsi Max Cherry (Large)", DR, "Large", False, ""),
        ("Pepsi Max Cherry (Regular)", DR, "Regular", False, ""),
        ("Red Bull Energy Drink (250ml)", DR, "250ml", False, ""),
        ("Red Bull Sugar Free (250ml)", DR, "250ml", False, ""),
        ("Red Bull The Winter Edition (250ml)", DR, "250ml", False, "Name says Winter Edition; the table does not label it limited time"),
        ("Robinsons Apple and Blackcurrent (Large)", DR, "Large", False, "Printed 'Blackcurrent'; name spelled Blackcurrant here"),
        ("Robinsons Apple and Blackcurrent (Regular)", DR, "Regular", False, "Printed 'Blackcurrent'; name spelled Blackcurrant here"),
        ("Robinsons Fruit Shoot Apple and Blackcurrant (200ml)", DR, "200ml", False, ""),
        ("Tango Apple Sugar Free (Large)", DR, "Large", False, "'Sugar Free' in the name but 21 g sugars printed, and kcal (169) is about double what the macros give"),
        ("Tango Apple Sugar Free (Regular)", DR, "Regular", False, "'Sugar Free' in the name but 11 g sugars printed, and kcal (89) is about double what the macros give"),
        ("Tango Orange (500ml Bottle)", DR, "500ml bottle", False, ""),
        ("Tango Orange (Can)", DR, "1 can", False, NOSIZE + "; 207 kcal is over twice the 500ml bottle (95 kcal), entered as printed"),
        ("Tango Orange Sugar Free (Large)", DR, "Large", False, ""),
        ("Tango Orange Sugar Free (Regular)", DR, "Regular", False, ""),
    ],
    "Cravings Value Menu": [
        ("Beefy Nacho Cravings Burrito", None, "", True, "duplicate of the Burritos row"),
        ("Cheesy Roll Up", SP, "", True, ""),
        ("Cinnamon Twists", None, "", False, "duplicate of the Desserts row"),
        ("Spicy Chicken Cravings Burrito", None, "", True, "duplicate of the Burritos row"),
    ],
    "Add-Ons": [
        ("Extra Black Beans", SA, "", False, BEANS),
        ("Extra Grilled Chicken", SA, "", False, ""),
        ("Extra Seasoned Beef", SA, "", False, BEANS),
        ("Fire Sauce", SA, "", False, ""),
        ("Heinz Light Mayonnaise Sachet", SA, "1 sachet", False, ""),
        ("Heinz Mayonnaise Sachet", SA, "1 sachet", False, ""),
        ("Heinz Tomato Ketchup Sachet", SA, "1 sachet", False, ""),
        ("Mild Sauce", SA, "", False, ""),
    ],
}

RENAME = {
    "Robinsons Apple and Blackcurrent (Large)": "Robinsons Apple and Blackcurrant (Large)",
    "Robinsons Apple and Blackcurrent (Regular)": "Robinsons Apple and Blackcurrant (Regular)",
}
PORK_WORDS = ("bacon", "ham", "pepperoni", "sausage", "pork", "salami", "chorizo")


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() and c.isascii() else "-" for c in name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def tags_for(name: str) -> str:
    """contains_* only when the item's own name says so. `vegetarian` is never set: this table does not mark it."""
    low = name.lower()
    tags = []
    if any(re.search(rf"\b{w}\b", low) for w in PORK_WORDS):
        tags.append("contains_pork")
    if "beef" in low:  # Beef, Beefy, Seasoned Beef
        tags.append("contains_beef")
    return "|".join(tags)


def check_plan_against_page(rows: list[dict]) -> None:
    problems = []
    if len(rows) != EXPECTED_ROWS:
        problems.append(f"the table has {len(rows)} rows, this script expects {EXPECTED_ROWS}")
    seen: dict[str, list[str]] = {}
    for r in rows:
        seen.setdefault(r["category"], []).append(r["name"])
    for cat, names in seen.items():
        if cat in EXCLUDED_CATEGORIES:
            if len(names) != EXCLUDED_CATEGORIES[cat]:
                problems.append(f"page category {cat!r} has {len(names)} rows, expected {EXCLUDED_CATEGORIES[cat]}")
        elif cat not in PLAN:
            problems.append(f"new page category {cat!r} ({len(names)} rows) is not in PLAN or EXCLUDED_CATEGORIES")
        else:
            planned = [p[0] for p in PLAN[cat]]
            if names != planned:
                problems.append(f"page category {cat!r}: new rows {sorted(set(names) - set(planned))}, "
                                f"missing rows {sorted(set(planned) - set(names))}"
                                + ("" if set(names) != set(planned) else ", same names but a different order"))
    for cat in list(PLAN) + list(EXCLUDED_CATEGORIES):
        if cat not in seen:
            problems.append(f"page category {cat!r} is gone from the table")
    if problems:
        print("The table no longer matches this script. Re-check the names in PLAN against the page before running again:",
              file=sys.stderr)
        for p in problems:
            print("  - " + p, file=sys.stderr)
        raise SystemExit(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("html", type=Path, help="the downloaded nutrition table page")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the page with the live menu")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    datetime.date.fromisoformat(args.checked_on)

    page, rows = taco_bell_page.read_rows(args.html)
    updated = taco_bell_page.last_updated(page)
    if not updated:
        print("The page no longer shows a 'Last Updated' date: check it by hand before running again.", file=sys.stderr)
        return 1
    updated_date = datetime.datetime.strptime(updated, "%m/%d/%Y").date()  # the page prints MM/DD/YYYY
    check_plan_against_page(rows)

    by_key = {(r["category"], r["name"]): r for r in rows}
    items, kept_by_name = [], {}
    for page_cat, entries in PLAN.items():
        for printed_name, category, serving, rankable, note in entries:
            printed = by_key[(page_cat, printed_name)]
            if category is None:  # repeats an item listed elsewhere: its numbers must be identical
                first = kept_by_name[printed_name]
                for f in taco_bell_page.FIELDS:
                    if first[f] != printed[f]:
                        print(f"{printed_name!r} appears twice with different {f}: {first[f]} vs {printed[f]}", file=sys.stderr)
                        return 1
                continue
            name = RENAME.get(printed_name, printed_name)
            items.append({
                "id": slug(name), "name": name, "category": category, "serving": serving,
                "calories": printed["kcal"], "protein_g": printed["protein"], "carbs_g": printed["carbs"], "fat_g": printed["fat"],
                "sat_fat_g": printed["sat"], "sodium_mg": "", "salt_g": printed["salt"], "sugar_g": printed["sugars"],
                "fiber_g": printed["fibre"], "tags": tags_for(printed_name),
                "limited_time": "false", "rankable": str(rankable).lower(), "components": "", "added_on": "", "notes": note,
            })
            kept_by_name[printed_name] = printed
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps the table's order inside a category

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(items)
    title = f"Taco Bell UK Full Nutrition Information (last updated {updated_date.day} {updated_date:%B %Y})"
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Taco Bell", "Mexican", "standard", title, SOURCE_URL, args.checked_on, "taco bell|tacobell", ""])
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")
    held = [(i["id"], HOLD_QUESADILLA) for i in sorted(items, key=lambda x: x["id"]) if i["name"] in HELD_QUESADILLAS]
    missing = HELD_QUESADILLAS - {i["name"] for i in items}
    if missing:
        print(f"hold-back list names items that are not in the table any more: {sorted(missing)}", file=sys.stderr)
        return 1
    held += [(i["id"], HOLD_DRINK) for i in items if i["category"] == DR]
    with open(args.out / "holdback.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["item_id", "reason"])
        w.writerows(held)
    print(f"wrote {len(items)} items to {args.out} (page sha256 {hashlib.sha256(args.html.read_bytes()).hexdigest()}, "
          f"table last updated {updated_date.isoformat()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
