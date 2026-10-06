#!/usr/bin/env python3
"""Build data/source/greggs/ from Greggs' official "Nutritional Information (Guide only)" PDF.

    python3 tools/uk_extract/greggs.py path/to/nutritional-information.pdf --allergen-pdf path/to/allergen-guide.pdf \
        --checked-on 2026-10-06

Numbers are copied from the PDF as printed, PER PORTION (kJ, kcal, fat, saturates, carbohydrate, sugars, fibre, protein,
salt). The per-100g and %RI columns are not used. weight_g is the "Portion Size (g/ml)" number, only for the solid-food
categories whose serving is "<portion> g" (GRAM_SERVINGS): for drinks, sauces, syrups and soup it may be millilitres. Only the grouping below (category, rankable) and the
display names are typed by hand. Every printed product name must appear exactly once below (or be an exclusion) and
the script stops, listing the differences, if Greggs adds, renames or removes a product, so a human re-checks.

Source: the "Our Nutrition Guide" button on https://www.greggs.com/nutrition. It links to a PDF on Greggs' own asset
host; the address changes whenever Greggs uploads a new file (about monthly), so re-read the page for the new link.
The guide says "Information correct at time of print (<Month Year>)": that text becomes part of source_title.
Rows marked (HS) = Hospital Shop are left out automatically.

Allergens (docs/DATA.md "Allergens"): Greggs prints them in a separate file, the "Customer Allergen Information Guide" (the
"Our Allergen Guide" button on the same page, ALLERGEN_URL; a ✓/• matrix per product). Only allergen_guide.csv is written
(the app links to the guide), never allergens.csv: items may only be matched across the two files by exact normalised name,
and on 2026-10-06 (allergen guide Version 13, 01.10.26) 124 of the 263 published items had no exactly matching name there.
The allergen guide prints each drink once (no Regular/Large, no decaf), lists pizzas but not the 2/4/6 pizza boxes, and
spells many products differently ("Bacon & Omelette with cheese Breakfast Roll" for "Bacon & Omelette Breakfast Roll",
"Gingerbread Man" for "Gingerbread Men", "&" for "and"). Matching those by hand would be fuzzy matching, so it is not done.
--allergen-pdf is read only for the guide's version and date (page 1: "Version 13 01.10.26"), which go into its title.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import greggs_pdf  # noqa: E402
from common import ITEM_FIELDS, write_allergens  # noqa: E402

CHAIN_ID = "greggs"
SOURCE_URL = "https://a.storyblok.com/f/94904/x/7dd8489dab/nutritional-information.pdf"
SOURCE_PAGE = "https://www.greggs.com/nutrition"
ALLERGEN_URL = "https://a.storyblok.com/f/94904/x/c38f77c7c1/allergen-guide.pdf"
ALLERGEN_TITLE = "Greggs Customer Allergen Information Guide"

BR, SV, PZ, PB, HF, SW, SP, SS, ST, HD, CD, AD, DP, BD = (
    "Breakfast", "Savouries & bakes", "Pizzas", "Pizza boxes", "Hot food", "Sandwiches, rolls & baguettes",
    "Salads & pasta", "Snacks & sides", "Sweet treats & pastries", "Hot drinks", "Cold drinks",
    "Add-ons & extras", "Sauces & dips", "Bread & rolls",
)
DRINKS = {HD, CD}
# Solid-food categories get serving "<portion> g" (the guide's "Portion Size (g/ml)" number). Drinks, sauces, syrups
# and soup are left blank because the guide does not say whether their number is grams or millilitres.
GRAM_SERVINGS = {BR, SV, PZ, PB, HF, SW, SP, SS, ST, BD}
NO_SERVING = {"Tomato Soup"}

# (category, rankable, [printed names]) in display order. rankable=false: drinks, sweet treats, sauces, add-ons, crisps,
# sharing packs (pizza boxes, 4-pack of sausage rolls) and plain bread.
GROUPS: list[tuple[str, bool, list[str]]] = [
    (BR, True, [
        "Bacon & Lorne Breakfast Baguette", "Bacon & Omelette Breakfast Roll", "Bacon & Sausage Breakfast Baguette",
        "Bacon and Lorne Breakfast Roll", "Bacon and Omelette Breakfast Baguette", "Bacon and Sausage Breakfast Roll",
        "Bacon Breakfast Baguette", "Bacon Breakfast Roll", "Breakfast Box",
        "Lorne & Omelette Breakfast Baguette", "Lorne & Omelette Breakfast Roll", "Lorne Breakfast Baguette",
        "Lorne Breakfast Roll", "Omelette Breakfast Baguette", "Omelette Breakfast Roll",
        "Sausage and Omelette Breakfast Baguette", "Sausage and Omelette Breakfast Roll", "Sausage Breakfast Baguette",
        "Sausage Breakfast Roll", "Apple & Cinnamon Flavour Porridge", "Golden Syrup Flavour Porridge",
        "Simply Creamy Porridge",
    ]),
    (SV, True, [
        "6 Mini Sausage Rolls", "Sausage Roll(s)", "Chicken Bake", "Steak Bake", "Steak & Stilton® Bake",
        "Cheese & Onion Bake", "Corned Beef Bake", "Vegetable Bake", "Vegan Roll Pork-Free", "Chicken Rolls",
        "Scotch Pie", "Savoury Mince Pie", "Sausage, Bean & Cheese Melt", "Cheese Scones", "Bacon and Cheese Wrap",
    ]),
    (SV, False, ["Sausage Roll 4 Pack"]),
    (PZ, True, [
        "BBQ Chicken & Bacon Pizza", "Buffalo Chicken Pizza", "Margherita Pizza", "Pepperoni Pizza",
        "Spicy Chicken Pizza", "Veggie Feast Pizza",
    ]),
    (PB, False, [
        f"{p} Pizza Box {n} Pack" for p in ("BBQ Chicken & Bacon", "Buffalo Chicken", "Margherita", "Pepperoni",
                                            "Spicy Chicken", "Veggie Feast") for n in (2, 4, 6)
    ]),
    (HF, True, [
        "Mac & Cheese", "Tomato Soup", "Southern Fried Chicken Goujons", "Spicy BBQ Chicken Bites",
        "Mozzarella & Cheddar Bites", "BBQ Bites Meal Box", "Cheese and Caramelised Onion Toastie",
        "Chicken & Pepperoni Pizza Toastie", "Ham and Cheese Toastie",
    ]),
    (SW, True, [
        "BBQ Chicken and Bacon Melt Baguette", "BLT", "Cheese & Onion Stottie", "Cheese & Pickle", "Cheese & Tomato",
        "Cheese Sandwich", "Egg Mayonnaise & Tomato", "Egg Mayonnaise Sandwich", "Free Range Egg Mayonnaise Baguette",
        "Free Range Egg Mayonnaise Half Baguette", "Free Range Egg Mayonnaise", "Ham & Cheese Baguette",
        "Ham Sandwich", "Honey Roast Ham & Egg Salad", "Honey Roast Ham and Egg Salad Roll",
        "Hot Buffalo Chicken Baguette", "Hot Ham & Cheese Baguette", "Hot Mexican Chicken Baguette",
        "Mature Cheddar Cheese Ploughman's Oval Bite", "Mature Cheddar Cheese Salad Baguette",
        "Mexican Chicken Baguette", "Mexican Chicken Flatbread", "Mexican Chicken Oval Bite",
        "Mexican Chicken Sandwich", "Roast Chicken and Bacon Club Baguette",
        "Roast Chicken and Bacon Club Half Baguette", "Roast Chicken Mayonnaise Baguette", "Roast Chicken Salad",
        "Roast Chicken Salad Roll", "Roast Chicken with Honey Mustard Mayonnaise Oval Bite",
        "Southern Fried Chicken Baguette", "Tandoori Chicken", "Tandoori Chicken Baguette",
        "Tandoori Chicken Half Baguette", "Tandoori Chicken Roll", "Tuna Crunch Baguette", "Tuna Crunch Roll",
        "Tuna Mayonnaise & Cucumber", "Tuna Mayonnaise Stottie",
    ]),
    (SP, True, [
        "Chicken Caesar Salad with Egg", "Prawn Layered Pasta Salad", "BBQ Chicken and Bacon Pasta",
        "Tomato and Mozzarella Pasta",
    ]),
    (SS, True, [
        "Hash Browns", "Southern Fried Potato Wedges", "Side Salad", "Free Range Egg Pot",
        "Apple and Strawberry Fruit Pot", "Pineapple Fruit Pot", "Fat Free Greek Style Yoghurt with Strawberry Compote",
    ]),
    (SS, False, [
        "Greggs Mature Cheddar & Onion Hand Cooked Crisps 40g", "Greggs Sea Salt & Cider Vinegar Hand Cooked Crisps 40g",
        "Greggs Thai Sweet Chilli Flavour Hand Cooked Crisps 40g",
    ]),
    (ST, False, [
        "All Butter Croissant", "Apple Danish", "Bavarian Slice", "Belgian Buns", "Bonfire Toffee Muffin",
        "Caramel Crispy", "Caramel Custard Doughnut", "Chocolate Brownie Bar", "Chocolate Cake Bar", "Cream Éclair",
        "Cream Iced Finger", "Empire Biscuit", "Fruit Scones", "Fruity Flapjack", "Gingerbread Men",
        "Glazed Ring Doughnuts", "Glazed Ring Doughnuts (2 pack)", "Hot Chocolate Brownies",
        "Hot Milk Chocolate Cookies", "Hot Yum Yums", "Jam Doughnut(s)", "Jammy Heart Biscuit",
        "Milk Chocolate Caramel Shortbread Offcuts", "Milk Chocolate Caramel Shortbreads", "Milk Chocolate Cookies",
        "Novelty Bun (pink)", "Novelty Bun (white)", "Pain au Chocolat", "Peach Melba", "Pineapple Cake",
        "Pink Jammie Doughnut", "Pumpkin Spice Doughnut", "Star Biscuit", "Sugar Strand Doughnut", "Tottenham Cake",
        "Triple Chocolate Cookies", "Triple Chocolate Doughnut", "Triple Chocolate Muffin",
        "Vanilla Custard Cream Doughnut", "Vanilla Custard Slice", "White Chocolate Cookies", "Yum Yum",
        "Yum Yums (2 pack)",
    ]),
    (HD, False, [
        "Americano Decaf Large", "Americano Decaf Regular", "Americano Large", "Americano Regular",
        "Cappuccino Large", "Cappuccino Large Decaf", "Cappuccino Regular", "Cappuccino Regular Decaf",
        "Caramel Latte Large", "Caramel Latte Large Decaf", "Caramel Latte Regular", "Caramel Latte Regular Decaf",
        "Flat White Decaf", "Flat White Regular", "Green Tea Regular", "Hot Chocolate Large", "Hot Chocolate Regular",
        "Latte Decaf Large", "Latte Decaf Regular", "Latte Large", "Latte Regular",
        "Mocha Decaf Large", "Mocha Decaf Regular", "Mocha Large", "Mocha Regular", "Peppermint Tea Regular",
        "Pumpkin Spice Latte with Salted Caramel Drizzle Decaf Large",
        "Pumpkin Spice Latte with Salted Caramel Drizzle Decaf Regular",
        "Pumpkin Spice Latte with Salted Caramel Drizzle Large",
        "Pumpkin Spice Latte with Salted Caramel Drizzle Regular",
        "Vanilla Latte Large", "Vanilla Latte Large Decaf", "Vanilla Latte Regular", "Vanilla Latte Regular Decaf",
        "White Coffee Decaf Large", "White Coffee Decaf Regular", "White Coffee Large", "White Coffee Regular",
        "White Tea Large", "White Tea Regular", "Espresso Shot", "Espresso Decaf Shot",
    ]),
    (CD, False, [
        "Iced Americano", "Iced Americano Decaf", "Iced Caramel Chocolate", "Iced Caramel Latte Regular",
        "Iced Caramel Latte Regular Decaf", "Iced Chocolate", "Iced Latte Regular", "Iced Latte Regular Decaf",
        "Iced Matcha Latte", "Iced Mocha", "Iced Mocha Decaf", "Iced Pumpkin Spice Latte with Salted Caramel Drizzle",
        "Iced Pumpkin Spice Latte with Salted Caramel Drizzle Decaf", "Iced Vanilla Latte Regular",
        "Iced Vanilla Latte Regular Decaf", "Blueberry Iced Matcha Latte", "Strawberry Iced Matcha Latte",
        "Vanilla Iced Matcha Latte", "Pumpkin Spice Iced Matcha Latte with Salted Caramel Drizzle",
        "Cherry & Mango Cooler", "Mango and Strawberry Cooler", "Cherry Lemonade", "Cloudy Lemonade", "Mango Lemonade",
        "Strawberry Lemonade", "Sparkling Raspberry Lemonade", "Greggs Natural Mineral Water 500ml",
        "Greggs Natural Mineral Water 750ml",
    ]),
    (AD, False, [
        "Extra Bacon", "Extra Breakfast Sausage", "Extra Caramel Syrup", "Extra Cream", "Extra Hot Chocolate Powder",
        "Extra Lorne Sausage", "Extra Omelette with Cheese", "Extra Pumpkin Spice Syrup", "Extra Vanilla Syrup",
        "Espresso Extra Shot", "Espresso Decaf Extra Shot", "Spread",
    ]),
    (DP, False, [
        "Buffalo Sauce", "Garlic & Herb Dip", "Hot Honey", "Smoky BBQ Dip", "Milk Chocolate Dipping Sauce",
        "Salted Caramel Dipping Sauce",
    ]),
    (BD, False, [
        "Baguettes", "Corn Topped Rolls", "Malted Brown Loaf", "Oval Bites", "Stotties", "White & Wholemeal Loaf",
        "White & Wholemeal Rolls", "White Bread made with Sourdough",
    ]),
]

# Printed rows we deliberately leave out (besides every "(HS)" Hospital Shop row, which is skipped automatically).
EXCLUDED = {
    "Fairtrade Apple Juice from Concentrate": "per-portion numbers are for a 150 g/ml portion and the guide does not say the size sold",
    "Fairtrade Orange Juice from Concentrate 250ml": "name says 250ml but the numbers are for a 150 g/ml portion",
    "Fairtrade Orange Juice from Concentrate 500ml": "name says 500ml but the numbers are for a 150 g/ml portion (identical to the 250ml row)",
}

NEW_RECIPE = (
    "greggs.com/nutrition lists this product under 'Latest updates: new recipe' (checked 5 Oct 2026); the guide is dated "
    "September 2026, so re-check on the next refresh"
)
# Hand-written notes (not exported by the pipeline). Keyed by printed name.
NOTES = {
    "Southern Fried Potato Wedges": NEW_RECIPE,
    "BBQ Bites Meal Box": NEW_RECIPE + "; contents not stated, so no meat tag",
    "Pumpkin Spice Latte with Salted Caramel Drizzle Regular": NEW_RECIPE,
    "Pumpkin Spice Latte with Salted Caramel Drizzle Large": NEW_RECIPE,
    "Pumpkin Spice Latte with Salted Caramel Drizzle Decaf Regular": NEW_RECIPE,
    "Pumpkin Spice Latte with Salted Caramel Drizzle Decaf Large": NEW_RECIPE,
    "Iced Pumpkin Spice Latte with Salted Caramel Drizzle": NEW_RECIPE,
    "Iced Pumpkin Spice Latte with Salted Caramel Drizzle Decaf": NEW_RECIPE,
    "Vegan Roll Pork-Free": "Vegetarian tag because the guide's own item name says Vegan; no vegetarian column in this guide",
    "BLT": "contains_pork inferred from the name (BLT = bacon, lettuce and tomato)",
    "Extra Lorne Sausage": "contains_pork because the name says sausage (the rule in the playbook); lorne sausage may not be pork",
    "Hot Yum Yums": "Printed numbers are identical to 'Yum Yums (2 pack)'",
    "Yum Yums (2 pack)": "Printed numbers are identical to 'Hot Yum Yums'",
    "Greggs Natural Mineral Water 500ml": "Portion column prints 100 for a 500ml bottle; every value is 0 either way",
    "Greggs Natural Mineral Water 750ml": "Portion column prints 100 for a 750ml bottle; every value is 0 either way",
    "Lorne Breakfast Roll": "Meat type of lorne not stated",
    "Lorne Breakfast Baguette": "Meat type of lorne not stated",
    "Lorne & Omelette Breakfast Roll": "Meat type of lorne not stated",
    "Lorne & Omelette Breakfast Baguette": "Meat type of lorne not stated",
    "Bacon and Lorne Breakfast Roll": "Meat type of lorne not stated (pork from bacon)",
    "Bacon & Lorne Breakfast Baguette": "Meat type of lorne not stated (pork from bacon)",
    "Breakfast Box": "Contents not stated, so no meat tag",
    "Scotch Pie": "Meat type not stated",
    "Savoury Mince Pie": "Meat type of the mince not stated",
    "Baguettes": "Bread only, as listed in the guide; may not be sold on its own",
    "Corn Topped Rolls": "Bread only, as listed in the guide; may not be sold on its own",
    "Malted Brown Loaf": "Loaf; the 42 g portion is probably one slice (not stated)",
    "Oval Bites": "Bread only, as listed in the guide; may not be sold on its own",
    "Stotties": "Bread only, as listed in the guide; may not be sold on its own",
    "White & Wholemeal Loaf": "Loaf; the 42 g portion is probably one slice (not stated)",
    "White & Wholemeal Rolls": "Bread only, as listed in the guide; may not be sold on its own",
    "White Bread made with Sourdough": "Bread only, as listed in the guide; may not be sold on its own",
}

PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pork|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(steak|beef)\b", re.I)
VEGAN_NAME = re.compile(r"\bvegan\b", re.I)


def slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    out = "".join(c.lower() if c.isalnum() else "-" for c in ascii_name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def display_name(printed: str, category: str) -> str:
    """Printed name with tidy suffixes: 'Latte Large Decaf' -> 'Latte Decaf (large)'; '(s)' dropped."""
    name = printed.replace("(s)", "")
    if category in DRINKS:
        words = name.split()
        size = next((w.lower() for w in words if w in ("Regular", "Large")), "")
        if size:  # names without a size word stay exactly as printed
            decaf = "Decaf" in words
            base = [w for w in words if w not in ("Regular", "Large", "Decaf")]
            name = " ".join(base) + (" Decaf" if decaf else "") + f" ({size})"
    return name


def serving_for(printed: str, category: str, portion: str) -> str:
    if category in DRINKS:
        words = printed.split()
        return next((w for w in words if w in ("Regular", "Large")), "")
    if category in GRAM_SERVINGS and printed not in NO_SERVING:
        return f"{portion} g"
    return ""


def weight_for(printed: str, category: str, portion: str) -> str:
    """The portion size in grams: the same rows whose serving is '<portion> g'."""
    return portion if category in GRAM_SERVINGS and printed not in NO_SERVING else ""


def tags_for(printed: str) -> str:
    tags = []
    if VEGAN_NAME.search(printed):
        tags.append("vegetarian")
    name = printed.replace("Pork-Free", "")
    if PORK.search(name) or printed == "BLT":
        tags.append("contains_pork")
    if BEEF.search(name):
        tags.append("contains_beef")
    return "|".join(tags)


def kj_note(r: dict[str, str]) -> str:
    kcal, kj = float(r["kcal"]), float(r["kj"])
    if kcal >= 10 and abs(kj / kcal - 4.184) / 4.184 > 0.08:
        return f"Printed kJ ({r['kj']}) and kcal ({r['kcal']}) per portion do not quite agree (per-100g values are rounded)"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--allergen-pdf", type=Path, required=True, help="Greggs' allergen guide PDF (ALLERGEN_URL), for its version and date")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the website")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = greggs_pdf.read_rows(args.pdf)
    printed_names = [r["name"] for r in rows]
    dup = [n for n, c in Counter(printed_names).items() if c > 1]
    if dup:
        print(f"Duplicate product names in the PDF: {dup}. Ids would clash: re-check.", file=sys.stderr)
        return 1

    grouped = [n for _, _, names in GROUPS for n in names]
    again = [n for n, c in Counter(grouped).items() if c > 1]
    if again:
        print(f"This script lists these products twice: {again}", file=sys.stderr)
        return 1
    hospital = {n for n in printed_names if n.endswith(greggs_pdf.HOSPITAL_SHOP)}
    known = set(grouped) | set(EXCLUDED) | hospital
    new_in_pdf = [n for n in printed_names if n not in known]
    gone_from_pdf = sorted(n for n in set(grouped) | set(EXCLUDED) if n not in set(printed_names))
    if new_in_pdf or gone_from_pdf:
        print(f"The PDF has {len(rows)} rows but this script accounts for {len(known)}.", file=sys.stderr)
        print(f"  In the PDF but not in the script (add to GROUPS or EXCLUDED): {new_in_pdf}", file=sys.stderr)
        print(f"  In the script but not in the PDF (renamed or removed): {gone_from_pdf}", file=sys.stderr)
        return 1

    # Column-shift guard: kcal per portion must agree with kcal per 100g x portion size (rounding allowed).
    shifted = [r["name"] for r in rows
               if abs(float(r["kcal"]) - float(r["kcal100"]) * float(r["portion"]) / 100) > max(2.0, 0.06 * float(r["kcal"]))]
    if shifted:
        print(f"kcal per portion does not match kcal per 100g x portion size for {shifted}: "
              "the columns may have moved. Check the PDF before using these numbers.", file=sys.stderr)
        return 1

    text = "\n".join(greggs_pdf.read_text(args.pdf))
    m = re.search(r"Information correct at time of print \(([^)]+)\)", text)
    if not m:
        print("Could not find 'Information correct at time of print (<date>)' in the PDF: the layout changed.", file=sys.stderr)
        return 1
    guide_date = m.group(1)
    allergen_text = " ".join(greggs_pdf.read_text(args.allergen_pdf)[:5])
    v = re.search(r"Version\s+(\d+)\s+(\d\d\.\d\d\.\d\d)\b", allergen_text)
    if not v:
        print("Could not find 'Version <n> <dd.mm.yy>' on page 1 of the allergen guide: is it the right file?", file=sys.stderr)
        return 1
    allergen_version = f"Version {v.group(1)}, {v.group(2)}"

    by_name = {r["name"]: r for r in rows}
    items = []
    category_order: list[str] = []
    for category, rankable, names in GROUPS:
        if category not in category_order:
            category_order.append(category)
        for printed in names:
            r = by_name[printed]
            note = "; ".join(x for x in (NOTES.get(printed, ""), kj_note(r)) if x)
            name = display_name(printed, category)
            items.append({
                "id": slug(name), "name": name, "category": category, "serving": serving_for(printed, category, r["portion"]),
                "calories": r["kcal"], "protein_g": r["protein"], "carbs_g": r["carbs"], "fat_g": r["fat"],
                "sat_fat_g": r["sat"], "sodium_mg": "", "salt_g": r["salt"], "sugar_g": r["sugars"], "fiber_g": r["fibre"],
                "energy_kj": r["kj"], "weight_g": weight_for(printed, category, r["portion"]),
                "tags": tags_for(printed), "limited_time": "false", "rankable": str(rankable).lower(),
                "components": "", "added_on": "", "notes": note,
            })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), f"duplicate ids: {[i for i, c in Counter(ids).items() if c > 1]}"
    items.sort(key=lambda i: category_order.index(i["category"]))  # stable: keeps the order inside each group

    args.out.mkdir(parents=True, exist_ok=True)
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ITEM_FIELDS)
        w.writeheader()
        w.writerows(items)
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Greggs", "Bakery", "standard",
                    f"Greggs Nutritional Information guide (information correct at time of print, {guide_date})",
                    SOURCE_URL, args.checked_on, "greggs|greggs bakery", ""])
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")
    # Link only (see the docstring): every item's allergens are None, so write_allergens writes allergen_guide.csv alone.
    write_allergens(args.out, CHAIN_ID, [(i["id"], None) for i in items],
                    {"title": f"{ALLERGEN_TITLE} ({allergen_version})", "url": ALLERGEN_URL, "checked_on": args.checked_on,
                     "may_contain_published": True})

    per_cat = Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {args.out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()}, guide date {guide_date})")
    print("by category: " + "; ".join(f"{c} {per_cat[c]}" for c in category_order))
    print(f"left out: {len(hospital)} hospital-shop rows {sorted(hospital)}; {len(EXCLUDED)} others {sorted(EXCLUDED)}")
    print(f"allergens: link to {ALLERGEN_TITLE} ({allergen_version}) only, allergen PDF sha256 "
          f"{hashlib.sha256(args.allergen_pdf.read_bytes()).hexdigest()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
