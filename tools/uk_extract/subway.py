#!/usr/bin/env python3
"""Build data/source/subway/ from Subway UK & ROI's official "Nutrition Information" PDF.

    python3 tools/uk_extract/subway.py path/to/nutrition.pdf --checked-on 2026-10-05

Numbers are copied from the PDF as printed, from the "Per Serving size" block only (kcal, fat, saturates, carbohydrate,
sugars, fibre, protein, salt; kJ and the per-100 g block are never used, except to cross-check, see REVIEW lines).
Only the NAMES, categories and tags are typed by hand. The script checks that every section of the PDF still holds the
rows named below, in order, and stops if not, so a human re-checks the names after a new guide.

What goes in: the complete menu items (Subs, Toasties, Saver Subs, Wraps, Salads, Spuds, Sides, Protein Pots, Cookies)
and the counter extras the guide prices per serving (cheese, toppings, sauces, dunk pots). The guide's ingredient lists
that are only building blocks (breads, proteins, vegetables, jacket potato/butter/beans) are not menu items and are left out.

Why `standard` and not `build_your_own`: the guide prints each sub's own totals but does not say which bread/cheese/veg
each recipe uses, so the printed totals cannot be rebuilt from the printed ingredient values without guessing.

Sizes: the guide's per-serving block for subs is a 6-inch serving ("one footlong = two 6-inch servings"). Footlong values
are not printed (only "double the values"), so no footlong rows are written; the app's quantity stepper covers it.

Source: the "Nutritional Information" link on https://www.subway.com/en-gb/menunutrition/nutrition (a new PDF is
published about monthly, so the link and the title below change).
"""
import argparse
import csv
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import subway_pdf  # noqa: E402

CHAIN_ID = "subway"
SOURCE_URL = ("https://media.subway.com/dam/urn:aaid:aem:c9e92cc1-b7a5-493f-adcd-7acb0641eeba/original/as/"
              "UKIBuildsandIngredientsNutritionalInformationSeptember2.pdf")
SOURCE_TITLE = "Subway UK and ROI Nutrition Information (September 2026)"

BASIS_NOTE = "Guide header: calculated as bread, protein and vegetables (onions, cucumbers, lettuce); sauces and extras not included"

# section -> (category, suffix added to the printed name, serving, rankable, printed names in the PDF's order)
# serving: "6-inch" (the guide's sub serving) or "grams" (the guide's printed Serving Size (g))
INCLUDED: dict[str, tuple] = {
    "Subs": ("Subs", " Sub", "6-inch", True, [
        "Bacon", "Poached Egg and Cheese", "Lincolnshire Sausage", "Lincolnshire Sausage and Bacon", "Big Breakwich",
        "Chicken Breast", "Chicken and Bacon", "Chicken Tikka", "Beef Chilli", "Rotisserie Style Chicken", "Tex Mexan",
        "Meatball Marinara (Pork & Beef Meatballs)", "Philly Steak", "Garlic Cheesesteak", "Ham", "Turkey", "Ham and Turkey",
        "Spicy Italian", "Italian B.M.T", "Veggie Delite", "Tuna Mayo", "Spiced Plant Patty", "5 Bean Chilli"]),
    "Toasties": ("Toasties", " Toastie", "grams", True, [
        "Bacon and Cheese Toastie", "Big Cheesesteak Toastie", "Triple Cheese"]),
    "Saver Subs": ("Saver Subs", " Saver Sub", "grams", True, ["Nacho Chicken", "Ham and Cheese", "BLT"]),
    "Wraps": ("Wraps", " Wrap", "grams", True, [
        "Big Breakwich", "Chicken Breast", "Chicken and Bacon", "Chicken Tikka", "Beef Chilli", "Rotisserie Style Chicken",
        "Tex Mexan", "Meatball Marinara (Pork & Beef Meatballs)", "Philly Steak", "Garlic Cheesesteak", "Ham", "Turkey",
        "Ham and Turkey", "Spicy Italian", "Italian B.M.T", "Veggie Delite", "Tuna Mayo", "Spiced Plant Patty", "5 Bean Chilli"]),
    "Salads": ("Salads", " Salad", "grams", True, [
        "Chicken Breast", "Chicken and Bacon", "Chicken Tikka", "Rotisserie Style Chicken", "Tex Mexan",
        "Meatball Marinara (Pork & Beef Meatballs)", "Philly Steak", "Beef Chilli", "Garlic Cheesesteak", "Ham", "Turkey",
        "Ham and Turkey", "Spicy Italian", "Italian B.M.T", "Veggie Delite", "5 Bean Chilli", "Tuna Mayo", "Spiced Plant Patty"]),
    "Spuds": ("Spuds", " Spud", "grams", True, [
        "Butter & Cheese", "Cheese & Beans", "Philly Cheese Steak & Cheese", "Tuna Mayo & Cheese", "B.M.T & Cheese",
        "Big Breakwich", "Chicken Breast & Cheese", "Chicken and Bacon", "Rotisserie-Style Chicken & Cheese", "Beef Chilli",
        "Garlic Cheese Steak", "Ham & Cheese", "Ham, Turkey & Cheese", "Meatball Marinara & Cheese", "Spicy Italian & Cheese",
        "Chicken Tikka & Cheese", "Tex Mexan", "Turkey & Cheese", "Spiced Plant Patty & Cheese", "5 Bean Chilli", "Veggie Delite"]),
    "Sides": ("Sides", "", "grams", True, [
        "Waffle Fries (Regular)", "Waffle Fries (Large)", "Hash Browns (6 pieces)", "Mozzarella & Cheddar Bites x 5",
        "Mozzarella & Cheddar Bites x 12", "Nacho Chicken Bites (6 Pieces)", "Nacho Chicken Bites (9 Pieces)",
        "Doritos Lightly Salted Nachos", "Doritos Tangy Cheese Nachos", "Doritos Chilli Heat Wave Nachos",
        "Chilli Beef Brisket Loaded Nachos", "Chilli Beef Brisket Loaded Waffle Fries", "5 Bean Chilli Loaded Waffle Fries",
        "5 Bean Chilli Loaded Nachos", "Footlong Cheesy Garlic Slice", "Meatballs Snack Bowl", "Baked Beans Snack Pot"]),
    "Protein Pots": ("Protein Pots", " Protein Pot", "grams", True, [
        "Chicken Breast Strips", "Rotisserie-Style Chicken", "Chicken Tikka", "Beef Chilli", "5 Bean Chilli", "Philly Steak", "Meatballs"]),
    "Cookies": ("Cookies", "", "grams", False, [
        "Chocolate Chunk Cookie", "Rainbow Cookie", "Vegan Double Chocolate Cookie", "White Macadamia Nut Cookie",
        "Oat and Raisin Cookie", "Mini Cookies and Caramel Dip", "Pumpkin Spiced Cookie", "Matcha & White Chip Cookie",
        "Brownie Cookie Cup"]),
    "CHEESE": ("Extras", "", "grams", False, [
        "American-style Cheese", "Peppered Cheese (ROI)", "Grated Mozzarella & Cheddar Cheese", "Vegan CheeZe"]),
    "TOPPINGS": ("Extras", "", "grams", False, ["Chilli Flakes", "Crispy Onions"]),
    "SAUCES & CONDIMENTS": ("Sauces", "", "grams", False, [
        "Chipotle Southwest sauce Dip", "Extra Spicy Chipotle sauce Dip", "Garlic & Herb Sauce Dip", "Hickory Smoked BBQ sauce Dip",
        "Honey Mustard Dip", "Lite Mayo Dip", "Sweet Onion sauce Dip", "Sweet Chilli Sauce Dip", "Teriyaki Sauce Dip", "Tomato Ketchup Dip"]),
    "DUNK POTS": ("Dunk pots", "", "grams", False, [
        "BBQ Dunk Pot", "Chipotle Southwest Dunk Pot", "Garlic & Herb Dunk Pot", "Honey Mustard Dunk Pot", "Ketchup Dunk Pot",
        "Lite Mayo Dunk Pot", "Sweet Onion Dunk Pot", "Teriyaki Dunk Pot", "X-Spicy Chipotle Southwest Dunk Pot", "Sweet Chilli Dunk Pot"]),
}
# Sections that are ingredient lists, not menu items: only their row counts are checked.
LEFT_OUT = {"BREADS": 7, "PROTEINS": 30, "VEGETABLES": 9, "OTHER": 3}
# Rows of included sections that are left out on purpose: (section, printed name) -> reason.
EXCLUDED_ROWS = {("CHEESE", "Peppered Cheese (ROI)"): "Republic of Ireland only"}

CATEGORY_ORDER = ["Subs", "Toasties", "Saver Subs", "Wraps", "Salads", "Spuds", "Sides", "Protein Pots", "Cookies",
                  "Extras", "Sauces", "Dunk pots"]
SECTION_ORDER = [  # the order the sections appear in the PDF (pages 1, 2, 3)
    "Subs", "Toasties", "Saver Subs", "Wraps", "Salads", "Spuds", "Sides", "Protein Pots", "Cookies",
    "BREADS", "PROTEINS", "CHEESE", "VEGETABLES", "SAUCES & CONDIMENTS", "DUNK POTS", "TOPPINGS", "OTHER"]

# Display-name touch-ups where "name + suffix" would read badly or the printed capitalisation is untidy.
NAME_FIXES = {
    "Chipotle Southwest sauce Dip": "Chipotle Southwest Sauce Dip",
    "Extra Spicy Chipotle sauce Dip": "Extra Spicy Chipotle Sauce Dip",
    "Hickory Smoked BBQ sauce Dip": "Hickory Smoked BBQ Sauce Dip",
    "Sweet Onion sauce Dip": "Sweet Onion Sauce Dip",
}
# Notes (not exported) for anything odd in the printed numbers. Keyed by (section, printed name).
ANOMALIES = {
    ("Subs", "Bacon"): "Printed serving size is 100 g and the per-100 g block is identical to the per-serving block (looks like a "
                       "copy slip); per-serving numbers entered as printed and pass the energy check",
    ("Cookies", "Brownie Cookie Cup"): "Printed kJ (896) does not agree with kcal (266; per-100 g kcal agrees with 266); kJ is not used",
    ("Salads", "Chicken and Bacon"): "Every printed number is identical to the Beef Chilli salad row (possible copy slip in the guide)",
    ("Salads", "Beef Chilli"): "Every printed number is identical to the Chicken and Bacon salad row (possible copy slip in the guide)",
    ("Salads", "Veggie Delite"): "Printed serving 431 g, far heavier than the other salads (176 to 359 g); both printed blocks agree with it",
}
# Meatball Marinara without the "(Pork & Beef Meatballs)" wording: the guide's own ingredient list names the (non-halal)
# marinara meatballs "Pork & Beef Meatballs (in marinara sauce)".
MEATBALL_MARINARA_NOTE = "Meat type from the guide's ingredient list: Pork & Beef Meatballs (in marinara sauce)"

PORK_RE = re.compile(r"\b(bacon|ham|sausage|pork|pepperoni|salami|chorizo)\b", re.I)
BEEF_RE = re.compile(r"(beef|steak)", re.I)


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def display_name(printed: str, suffix: str) -> str:
    name = NAME_FIXES.get(printed, printed)
    if not suffix or name.endswith(suffix.strip()):
        return name
    if " (" in name:  # "Meatball Marinara (Pork & Beef Meatballs)" -> "Meatball Marinara Sub (Pork & Beef Meatballs)"
        head, tail = name.split(" (", 1)
        return f"{head}{suffix} ({tail}"
    return name + suffix


def tags_for(printed: str) -> str:
    """Tags only when the printed name says so (CLAUDE.md rule 1, playbook rule 4). No `vegetarian` tag: the nutrition guide
    marks nothing vegetarian, except that the item is named Vegan."""
    tags = []
    if "vegan" in printed.lower():
        tags.append("vegetarian")
    pork = bool(PORK_RE.search(printed)) or printed.startswith("Meatball Marinara")
    beef = bool(BEEF_RE.search(printed)) or printed.startswith("Meatball Marinara")
    if pork:
        tags.append("contains_pork")
    if beef:
        tags.append("contains_beef")
    return "|".join(tags)


def review_lines(section: str, row: dict) -> list[str]:
    """Informational cross-checks between the guide's own blocks. They never change a number."""
    num = lambda s: float(s.lstrip("<"))  # noqa: E731
    out = []
    kj, kcal = num(row["kj"]), num(row["kcal"])
    if kcal and not 4.0 <= kj / kcal <= 4.4:
        out.append(f"kJ/kcal = {kj / kcal:.2f}")
    serving = num(row["serving_g"])
    for field, per100 in zip(subway_pdf.FIELDS[1:], row["per100"][1:]):
        scaled = num(row[field]) * 100 / serving
        tolerance = max(0.15 * max(scaled, num(per100)), 0.5 if field in ("fat", "sat", "carbs", "sugars", "fibre", "protein") else 0.1 if field == "salt" else 5)
        if abs(scaled - num(per100)) > tolerance:
            out.append(f"{field}: serving {row[field]}, per 100 g {per100}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live page")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    try:
        sections = subway_pdf.read_sections(args.pdf)
    except subway_pdf.PdfLayoutChanged as e:
        print(f"The PDF layout changed: {e}. Re-check tools/uk_extract/subway_pdf.py against the PDF.", file=sys.stderr)
        return 1
    if list(sections) != SECTION_ORDER:
        print(f"The PDF's sections are {list(sections)} but this script expects {SECTION_ORDER}. Re-check before running again.",
              file=sys.stderr)
        return 1
    for name, count in LEFT_OUT.items():
        if len(sections[name]) != count:
            print(f"Section {name!r} has {len(sections[name])} rows, expected {count}. The menu changed: re-check the script.", file=sys.stderr)
            return 1

    items, reviews = [], []
    for section, (category, suffix, serving_mode, rankable, expected) in INCLUDED.items():
        printed_names = [r["name"] for r in sections[section]]
        if printed_names != expected:
            print(f"Section {section!r} in the PDF: {printed_names}\nbut this script names: {expected}\n"
                  "The menu changed: update the names in INCLUDED after reading the PDF, then run again.", file=sys.stderr)
            return 1
        for row in sections[section]:
            printed = row["name"]
            if (section, printed) in EXCLUDED_ROWS:
                continue
            for problem in review_lines(section, row):
                reviews.append(f"{section} / {printed}: {problem}")
            notes = []
            if section in ("Subs", "Toasties", "Saver Subs", "Wraps"):
                notes.append(BASIS_NOTE)
            if printed.startswith("Meatball Marinara") and "Pork & Beef" not in printed:
                notes.append(MEATBALL_MARINARA_NOTE)
            if (section, printed) in ANOMALIES:
                notes.append(ANOMALIES[(section, printed)])
            name = display_name(printed, suffix)
            items.append({
                "id": slug(name), "name": name, "category": category,
                "serving": "6-inch" if serving_mode == "6-inch" else f"{row['serving_g']} g",
                "calories": row["kcal"], "protein_g": row["protein"], "carbs_g": row["carbs"], "fat_g": row["fat"],
                "sat_fat_g": row["sat"], "sodium_mg": "", "salt_g": row["salt"], "sugar_g": row["sugars"], "fiber_g": row["fibre"],
                "tags": tags_for(printed), "limited_time": "false", "rankable": str(rankable).lower(),
                "components": "", "added_on": "", "notes": "; ".join(notes),
            })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), f"duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps the PDF's order inside a category

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(items)
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Subway", "Sandwiches", "standard", SOURCE_TITLE, SOURCE_URL, args.checked_on,
                    "subway|subway uk|subway sandwiches", ""])
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")

    by_cat = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {args.out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    print("by category:", ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    for line in reviews:
        print("REVIEW:", line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
