#!/usr/bin/env python3
"""Build data/source/coffee-1/ from Coffee #1's three official PDFs (food guide, core beverage guide, autumn beverage guide).

    python3 tools/uk_extract/coffee_1.py --food food.pdf --core-drinks core-beverages.pdf --autumn-drinks autumn-beverages.pdf \
        --checked-on 2026-10-06

Numbers are copied from the PDFs exactly as printed, PER PORTION (food: the "per portion (g)" column; drinks: the "Per
product" / "Per serving" block). kJ and the per-100 g / per-100 ml columns are never written. Only names, grouping and the
holdback reasons below are typed by hand. The script stops, listing the differences, if Coffee #1 adds, renames or removes
a product (food), adds or removes a drink or a size (beverages), or if a page no longer has the layout
`coffee_1_pdf.py` reads, so a human re-checks the lists below.

Sources (all linked from https://www.coffee1.co.uk/allergy-advice/; the file names change with every issue, so re-read that page):
    food     https://www.coffee1.co.uk/wp-content/uploads/2026/09/C1-Core-Food-Sept-2026-Issue-Date-0409-V57.pdf
    core     https://www.coffee1.co.uk/wp-content/uploads/2026/04/C1-Core-Beverage-Allergen-Nutritional-Information-April-26-v1.pdf
    autumn   https://www.coffee1.co.uk/wp-content/uploads/2026/08/C1-Autumn-Beverage-Allergen-Nutritional-Information-Sept-2026.pdf

Left out on purpose (each is listed again in the final report):
  * Food guide page 9: "Apricot Croissant" is the worked example in "How to use this guide", not a menu row.
  * Core beverage guide page 32: "Milk & dairy alternatives" (per 100 ml only, no per-product values) and "Sweetbird syrups &
    sauces" (per 15 ml / per 22.5 ml measures, not a product serving).
  * The guides carry no Ireland / Northern Ireland / trial / selected-store markings, so nothing is dropped for region.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import coffee_1_pdf as pdf  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "coffee-1"
SOURCE_PAGE = "https://www.coffee1.co.uk/allergy-advice/"
SOURCE_TITLE = ("Coffee #1 Allergens, Ingredients and Nutrition Guide, version 57 (issue date 04/09/26); Core Beverage Allergen "
                "Nutritional Information (issued 08.04.26); Autumn Beverage Allergen Nutritional Information (issued 02.09.26)")
ALIASES = ["coffee 1", "coffee #1", "coffee#1", "coffee no 1", "coffee number one", "coffee one"]

# ---------------------------------------------------------------------------------------------------------------- food
PB, PT, CK, TB, TP, BC, CR, SP, SW, BF = (
    "Pastries & buns", "Porridge & toast", "Cakes & muffins", "Traybakes", "Tarts, pies & desserts", "Biscuits & cookies",
    "Crisps & popcorn", "Spreads & extras", "Sandwiches & toasties", "Breakfast")
GY = "Granola & yoghurt"

# (printed name, display name or None for "as printed", category, rankable) in the PDF's reading order, one entry per block.
# rankable=false: pastries, cakes, traybakes, desserts, biscuits, crisps, spreads and plain toast (treats, snacks and add-ons).
FOOD: list[tuple[str, str | None, str, bool]] = [
    ("Almond Croissant", None, PB, False), ("Butter Croissant", None, PB, False), ("Pain au Chocolat", None, PB, False),
    ("Pain au Raisin", None, PB, False), ("Vegan Raspberry Croissant", None, PB, False), ("Pistachio Croissant", None, PB, False),
    ("Cardamom and Orange Bun", None, PB, False), ("Cinnamon Bun", None, PB, False),
    ("Porridge Plain", None, PT, True), ("Porridge with Chocolate Chips", None, PT, True),
    ("Porridge with Banana & Cinnamon", None, PT, True), ("Porridge with Blueberries, Seeds & Maple Syrup", None, PT, True),
    ("Teacake", None, PT, False), ("Tinned White Bloomer", None, PT, False), ("Tinned Harvest Bloomer", None, PT, False),
    ("Granola & Yogurt with Blueberry & Honey", None, GY, True), ("Granola & Yogurt with Banana & Honey", None, GY, True),
    ("Yogurt & Seeds with Blueberry & Honey", None, GY, True), ("Yogurt & Seeds with Banana & Honey", None, GY, True),
    ("Ginger Cake", None, CK, False), ("Banana & Chocolate Loaf Cake", None, CK, False), ("Lemon Drizzle Cake", None, CK, False),
    ("Welsh Cake", None, CK, False), ("Victoria Sponge Cake", None, CK, False), ("Coffee and Caramel Cake", None, CK, False),
    ("Carrot Cake", None, CK, False), ("Speculoos Blondie", None, CK, False), ("Raspberry & Coconut Cake", None, CK, False),
    ("Deluxe Dark Chocolate Cake", None, CK, False), ("Blueberry Muffin", None, CK, False),
    ("Sicilian Lemon Curd Muffin", None, CK, False),
    ("Salted Caramel Brownie", None, TB, False), ("Caramel Shortbread", None, TB, False), ("Triple Chocolate Brownie", None, TB, False),
    ("Rocky Road", None, TB, False), ("Yoghurt Apple & Blackcurrant Flapjack", None, TB, False),
    ("Blackberry & Apple Crumble Jack", None, TB, False), ("Maple Syrup Flapjack", None, TB, False),
    ("Mango & Passionfruit Tart", None, TP, False), ("Bakewell Tart", None, TP, False),
    ("Lemon Merringue Pie", "Lemon Meringue Pie", TP, False),  # spelling fixed in the name only
    ("Portuguese Tarts", None, TP, False), ("Caramel Apple Crumble Pie", None, TP, False),
    ("Caramel Apple Crumble Pie with Whipped Cream", None, TP, False), ("Almond & Cherry Bakewell Tart", None, TP, False),
    ("Sticky Toffee Pudding with whipped cream", None, TP, False), ("Sticky Toffee Pudding", None, TP, False),
    ("Cookies & Cream Slice", None, TP, False), ("Salted Caramel Slice", None, TP, False),
    ("Starwberries & Clotted Cream Slice", "Strawberries & Clotted Cream Slice", TP, False),  # spelling fixed in the name only
    ("Lotus Biscoff Cheesecake", None, TP, False),
    ("Triple Chocolate Cookie", None, BC, False), ("Milk Chocolate Cookie", None, BC, False), ("Gingerbread Man", None, BC, False),
    ("Pistachio Crème Cookie", None, BC, False), ("Lotus Biscuits", None, BC, False), ("Shortbread", None, BC, False),
    ("Toffee Waffle", None, BC, False), ("Gianduiotti", None, BC, False), ("Jammy Delight", None, BC, False),
    ("GF Caramel Jewel Bar", None, BC, False),
    ("Kettle Sea Salt Crisps", None, CR, False), ("Kettle Sea Salt & Vinegar Crisps", None, CR, False),
    ("Kettle Cheddar & Onion Crisps", None, CR, False), ("Sweet & Salty Popcorn", None, CR, False),
    ("Preserve Blackcurrant", None, SP, False), ("Preserve Strawberry", None, SP, False),
    ("Hazelnut Chocolate Spread", None, SP, False), ("Lakeland Butter", None, SP, False),
    ("Rodda's Cornish Clotted Cream", None, SP, False), ("Flora", None, SP, False), ("Marmite", None, SP, False),
    ("Maple Syrup", None, SP, False),
    ("Chicken Pesto Ciabatta", None, SW, True), ("Tuna Melt Ciabatta", None, SW, True), ("Italian Antipasti Ciabatta", None, SW, True),
    ("Cheese & Chutney Toastie", None, SW, True), ("Mozzarella & Tomato Toastie", None, SW, True), ("Ham & Cheese Toastie", None, SW, True),
    ("Ham & Cheese Croissant", None, BF, True), ("Breakfast Bagel", None, BF, True), ("Sausage Bap", None, BF, True),
    ("Bacon Bap", None, BF, True),
    ("Chicken Tikka Flatbread", None, SW, True), ("Chicken & Pepper Focaccia", None, SW, True),
]

FOOD_FIELDS = {"Kcal": "calories", "Protein": "protein_g", "Carbs": "carbs_g", "Fat": "fat_g", "Sat": "sat_fat_g",
               "Sugar": "sugar_g", "Fibre": "fiber_g", "Salt": "salt_g"}
REQUIRED = ("Kcal", "Protein", "Carbs", "Fat")
NUMBER = re.compile(r"^<?\d+(?:\.\d+)?$")
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|salami|chorizo|pepperoni|gammon|prosciutto)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT = re.compile(r"\b(ham|bacon|pork|sausages?|beef|chorizo|salami|pepperoni|gelatine?|lard|chicken|tuna|fish|turkey|lamb|steak|"
                  r"prawns?|anchov\w+|cured)\b", re.I)


def clean_food_name(text: str) -> tuple[str, bool]:
    """('Almond Croissant', True) from the printed 'NEW Almond Croissant (V)': name without NEW / PRODUCT / diet marks, and
    whether the guide marks it vegetarian or vegan ((V), (Vg), (V/GF), (Vg/GF))."""
    t = re.sub(r"^PRODUCT\s+", "", text)
    t = re.sub(r"^NEW\s+", "", t)
    marked = bool(re.search(r"\((?:V|Vg)(?:/GF)?\)", t))
    t = re.sub(r"\s*\((?:V|Vg)(?:/GF)?\)\s*\*?\s*$", "", t).replace("*", "")
    return re.sub(r"\s+", " ", t).strip(), marked


def printed_number(value: str, what: str) -> str:
    if not NUMBER.match(value):
        raise SystemExit(f"{what}: {value!r} is not a plain number: re-check the PDF layout")
    return value


def serving_label(printed: str) -> str:
    return re.sub(r"\.0+$", "", printed)  # '125.00' is shown as '125'; the nutrient numbers themselves are never touched


def build_food(food_pdf: Path) -> tuple[list[dict], list[str], list[str]]:
    """(items, anomalies, meat_type_not_stated)"""
    blocks = pdf.food_blocks(food_pdf)
    printed = [clean_food_name(b["name_text"]) for b in blocks]
    typed = [f[0] for f in FOOD]
    if [p[0] for p in printed] != typed:
        only_pdf = [p[0] for p in printed if p[0] not in typed]
        only_script = [t for t in typed if t not in [p[0] for p in printed]]
        raise SystemExit(f"The food guide has {len(printed)} products but FOOD names {len(typed)}.\n"
                         f"  in the PDF only: {only_pdf}\n  in this script only: {only_script}\n"
                         "The menu changed (or the order did): re-check the names in FOOD against the PDF, then run again.")
    items, anomalies, meat_unstated = [], [], []
    for block, (pname, marked), (_, display, category, rankable) in zip(blocks, printed, FOOD):
        row = block["rows"]
        item = {"name": display or pname, "category": category, "rankable": rankable, "limited_time": False, "tags": []}
        notes = []
        for label, field in FOOD_FIELDS.items():
            vals = row[label]
            if not vals:
                if label in REQUIRED:
                    raise SystemExit(f"{pname}: no {label} row")
                continue  # not printed for this product (the guide has no Fibre row for some): stays blank
            if len(vals) != 2:
                raise SystemExit(f"{pname}: {label} has {len(vals)} numbers, expected per-100 g and per-portion")
            item[field] = printed_number(vals[1], f"{pname} {label}")  # vals[1] = the per-portion column
        if len(block["portion_g"]) != 1:
            raise SystemExit(f"{pname}: portion weight not found")
        item["serving"] = f"{serving_label(printed_number(block['portion_g'][0], pname + ' portion'))} g"
        # tags: from the guide's own marks and ingredient lists only
        text = pname + " " + block["ingredients"]
        meat = sorted({m.group(0).lower() for m in MEAT.finditer(block["ingredients"])})
        if marked and meat:
            anomalies.append(f"{pname}: marked vegetarian ((V)) in the guide but its ingredients list {meat}; no vegetarian tag")
            notes.append(f"Guide marks this (V) but the ingredients list {', '.join(meat)}: not tagged vegetarian")
        elif marked:
            item["tags"].append("vegetarian")
        if PORK.search(text):
            item["tags"].append("contains_pork")
        if BEEF.search(text):
            item["tags"].append("contains_beef")
        if re.search(r"\b(sausages?|bacon|ham|gelatine?|lard|cured|salami|chorizo|pepperoni)\b", text, re.I) \
                and not re.search(r"\b(pork|beef)\b", text, re.I):
            meat_unstated.append(pname)
        # cross-check the printed per-100 g and per-portion columns against each other (a diagnostic only: never a correction)
        w = float(block["portion_g"][0])
        for label in ("Kcal", "Fat", "Carbs", "Protein"):
            p100, pport = row[label][0], row[label][1]
            if NUMBER.match(p100) and NUMBER.match(pport):
                exp, got = float(p100.lstrip("<")) * w / 100, float(pport.lstrip("<"))
                if abs(exp - got) > max(0.15 * max(exp, got), 1.5 if label != "Kcal" else 10):
                    notes.append(f"printed per-100 g {label} {p100} x {w:g} g would be {exp:.1f}, but per-portion is {pport}")
        kj, kc = row["KJ"], row["Kcal"]
        if len(kj) == 2 and len(kc) == 2 and NUMBER.match(kj[1]) and NUMBER.match(kc[1]) and float(kc[1]) > 0:
            if not 3.9 <= float(kj[1]) / float(kc[1]) <= 4.4:
                notes.append(f"kJ {kj[1]} and kcal {kc[1]} (per portion) do not agree (kJ/kcal = {float(kj[1]) / float(kc[1]):.2f})")
        if notes:
            anomalies.append(f"{item['name']}: " + "; ".join(notes))
            item["notes"] = "; ".join(notes)
        item["tags"] = "|".join(item["tags"])
        items.append(item)
    return items, anomalies, meat_unstated


# -------------------------------------------------------------------------------------------------------------- drinks
HC, HH, SD, IC, CF, IM, FR, MS, SQ, KD, AD, ADD = (
    "Hot coffee", "Hot chocolate", "Speciality drinks", "Iced coffee", "Cold foam", "Iced matcha", "Frappes", "Milkshakes",
    "Smoothies & quenchers", "Kids' drinks", "Autumn drinks", "Add-ons")

# printed section heading (ALL CAPS, without 'NEW') -> (category, number of drink variants the script expects). A heading
# that is not listed, or a different number, stops the script.
CORE_SECTIONS: dict[str, tuple[str, int]] = {
    "ESPRESSO": (HC, 1), "MACCHIATO": (HC, 5), "CARAMEL MACCHIATO": (HC, 5), "AMERICANO": (HC, 6), "LATTE": (HC, 5),
    "CAPPUCCINO": (HC, 5), "FLAT WHITE": (HC, 5), "PICCOLO": (HC, 5), "MOCHA": (HC, 5), "WHITE MOCHA": (HC, 5),
    "MOCHA DELUXE": (HC, 5), "WHITE MOCHA DELUXE": (HC, 5),
    "HOT CHOCOLATE": (HH, 5), "HOT CHOCOLATE DELUXE": (HH, 5), "WHITE HOT CHOCOLATE": (HH, 5), "WHITE HOT CHOCOLATE DELUXE": (HH, 5),
    "TUMERIC LATTE": (SD, 5), "MATCHA LATTE": (SD, 5), "SPICED CHAI LATTE": (SD, 5), "HOT APPLE & CINNAMON": (SD, 1),
    "ICED LATTE": (IC, 5), "ICED AMERICANO": (IC, 6), "ICED MOCHA": (IC, 5), "VANILLA ICED LATTE": (IC, 5),
    "BLUEBERRY ICED LATTE": (IC, 5), "PRALINE ICED LATTE": (IC, 5), "DUBAI STYLE ICED MOCHA": (IC, 5), "TRIPLE ICED CHOCOLATE": (IC, 5),
    "COLD FOAM - ICED CAPPUCCINO": (CF, 5), "COLD FOAM - ICED FLAT WHITE": (CF, 5), "COLD FOAM - ICED AMERICANO": (CF, 1),
    "ICED VANILLA MATCHA": (IM, 5), "BLUEBERRY ICED MATCHA": (IM, 5), "STAWBERRY ICED MATCHA": (IM, 5),
    "ESPRESSO FRAPPE": (FR, 5), "MOCHA FRAPPE": (FR, 5), "DUBAI STYLE MOCHA FRAPPE": (FR, 5),
    "CARAMEL MILKSHAKE": (MS, 5), "CHOCOLATE MILKSHAKE": (MS, 5), "VANILLA MILKSHAKE": (MS, 5), "STAWBERRY MILKSHAKE": (MS, 5),
    "CARAMEL PRALINE MILKSHAKE": (MS, 5), "BLUEBERRY WHITE CHOCOLATE MILKSHAKE": (MS, 5), "VEGAN TROPICAL MILKSHAKE": (MS, 1),
    "TROPICAL MILKSHAKE": (MS, 1),
    "SMOOTHIES": (SQ, 5), "HOMEMADE QUENCHERS": (SQ, 4),
    "BABYCCINO": (KD, 5), "BABY HOT CHOCOLATE": (KD, 5), "VANILLA BABYSHAKE": (KD, 5), "CHOCOLATE BABYSHAKE": (KD, 5),
    "STRAWBERRY BABYSHAKE": (KD, 5),
}
AUTUMN_SECTIONS: dict[str, tuple[str, int]] = {
    "CARAMEL PUMPKIN SPICE LATTE": (AD, 5), "CARAMEL PUMPKIN SPICE HOT CHOCOLATE": (AD, 5), "WHITE CHOCOLATE MATCHA": (AD, 10),
    "TOASTED MARSHMALLOW ICED MATCHA": (AD, 5), "CINNAMON BUN ICED MATCHA": (AD, 5), "MATCHA CORTADO": (AD, 5),
    "ICED MATCHA CORTADO": (AD, 5), "CORTADO": (AD, 5),
}
# Core beverage guide, page 32: only "EXTRAS" is read (per 100 g / per serving, serving size not printed); the other two
# tables on that page are left out (see the module docstring) but must still be there, so a change is noticed.
CORE_LEFT_OUT = {"MILK & DAIRY ALTERNATIVES": 5, "SWEETBIRD SYRUPS & SAUCES": 5}
CORE_ADDONS = {"EXTRAS": 3}

DRINK_FIELDS = {"Kcal": "calories", "Protein": "protein_g", "Carb": "carbs_g", "Fat": "fat_g", "Sat": "sat_fat_g",
                "Sugar": "sugar_g", "Fibre": "fiber_g", "Salt": "salt_g"}
TYPOS = {"vintamin": "vitamin", "Stawberry": "Strawberry", "Tumeric": "Turmeric", "Passiofruit": "Passionfruit"}
# printed drink name (before the milk) -> the name the section heading and description show
BASE_FIX = {
    "Dubai Style Iced Latte": "Dubai Style Iced Mocha",  # rows say "Latte", the heading and recipe say Mocha
    "Iced Chocolate": "Triple Iced Chocolate",           # rows drop "Triple"
    "YUZU Lemon & Ginger Quencher with added lion's mane": "Yuzu Lemon & Ginger Quencher with added lion's mane",
}
# the two tropical milkshakes name their whipped cream instead of a milk
SPECIAL_NAMES = {
    "Vegan Tropical Milkshake- Coconut Milk (Vegan Whip)": "Vegan Tropical Milkshake (coconut milk, vegan whip)",
    "Vegan Tropical Milkshake- Coconut Milk (Regular Whipped Cream)* not suitable for vegans due to milk in whipped cream":
        "Tropical Milkshake (coconut milk, regular whipped cream)",
}
MILK = re.compile(r"^(?P<base>.*?)\s*-\s*(?P<milk>Whole Milk|Skimmed Milk|Oat(?: Milk)?|Soya(?: Milk)?|Coconut(?: Milk)?|Black)\s*$")
MILK_LABEL = {"whole milk": "whole milk", "skimmed milk": "skimmed milk", "oat": "oat milk", "oat milk": "oat milk",
              "soya": "soya milk", "soya milk": "soya milk", "coconut": "coconut milk", "coconut milk": "coconut milk", "black": "black"}


def drink_name(printed: str, size: str) -> str:
    """'Latte - Oat' + 'Large' -> 'Latte (oat milk, large)'; a drink with no milk in its name -> 'Espresso (single)'."""
    for bad, good in TYPOS.items():
        printed = printed.replace(bad, good)
    printed = re.sub(r"\s+", " ", printed).strip()
    label = size_label(size).lower()
    if printed in SPECIAL_NAMES:
        name = SPECIAL_NAMES[printed]
        return f"{name[:-1]}, {label})" if label else name
    m = MILK.match(printed)
    base, variants = (m.group("base"), [MILK_LABEL[m.group("milk").lower()]]) if m else (printed, [])
    base = BASE_FIX.get(base, base)
    if label:
        variants.append(label)
    return f"{base} ({', '.join(variants)})" if variants else base


def size_label(size: str) -> str:
    return size.replace("oz", " oz")  # '12oz' -> '12 oz'; Regular, Large, Small, Single, Double as printed


def section_key(section: str) -> str:
    return re.sub(r"^NEW\s+", "", section.strip())


def build_drinks(drinks_pdf: Path, sections: dict[str, tuple[str, int]], limited: bool, label: str,
                 left_out: dict[str, int] | None = None, addons: dict[str, int] | None = None) -> tuple[list[dict], list[str], list[str]]:
    """(items, anomalies, left_out_report)"""
    products = pdf.drink_products(drinks_pdf)
    counts: dict[str, int] = {}
    for p in products:
        counts[section_key(p["section"])] = counts.get(section_key(p["section"]), 0) + 1
    known = {**sections, **{k: ("", v) for k, v in (left_out or {}).items()}, **{k: ("", v) for k, v in (addons or {}).items()}}
    expected = {k: v[1] for k, v in known.items()}
    if counts != expected:
        diff = sorted((k, counts.get(k), expected.get(k)) for k in set(counts) | set(expected) if counts.get(k) != expected.get(k))
        raise SystemExit(f"{label}: the drink list changed. (heading, found, expected) differences: {diff}\n"
                         "Re-check the lists in this script against the PDF, then run again.")
    items, anomalies, skipped = [], [], []
    for p in products:
        key = section_key(p["section"])
        if key in (left_out or {}):
            skipped.append(f"{label} p{p['page']} {key}: {p['name']}")
            continue
        category = sections[key][0] if key in sections else ADD
        if key in sections and p["basis"] not in ("Per 100ml Per product", "Per 100ml Per Product", "Per 100g Per serving"):
            raise SystemExit(f"{label}: unexpected column headings {p['basis']!r} under {key}")
        for s in p["sizes"]:
            vals = s["per_product"]
            if len(vals) != 9:
                raise SystemExit(f"{label}: {p['name']} has no per-product block")
            item = {"name": drink_name(p["name"], s["size"]) if key not in (addons or {}) else p["name"],
                    "category": category, "serving": size_label(s["size"]), "rankable": False, "limited_time": limited, "tags": ""}
            for col, field in DRINK_FIELDS.items():
                item[field] = printed_number(vals[col], f"{p['name']} {s['size']} {col}")
            notes = []
            if s["size"] == "" and key in (addons or {}):
                notes.append("Serving size not printed: values are the guide's 'Per serving' column")
            elif s["size"] == "" and "serving" in p["basis"]:
                notes.append("Size not printed: values are the guide's 'Per serving' column")
            elif s["size"] == "":
                notes.append("Size is blank on this row in the guide (the other rows of this drink say Regular)")
            if not s["per100_ok"]:
                notes.append("The per-100 block of this row is misprinted in the guide (not used); the per-product block reads normally")
            # diagnostics only: the same product volume must come out of kJ, kcal and carbs (per product / per 100)
            if s["per100_ok"] and s["per100"]:
                vols = []
                for col in ("KJ", "Kcal", "Carb", "Fat", "Protein"):
                    a, b = s["per100"][col], vals[col]
                    if NUMBER.match(a) and NUMBER.match(b) and float(a.lstrip("<")) >= 5:
                        vols.append((col, float(b.lstrip("<")) / float(a.lstrip("<")) * 100))
                core = [v for c, v in vols if c in ("KJ", "Kcal", "Carb")]
                if len(core) >= 2 and max(core) / min(core) > 1.25:
                    notes.append("per-product values imply different volumes (" + ", ".join(f"{c} {v:.0f}" for c, v in vols) + ")")
            if notes:
                item["notes"] = "; ".join(notes)
                if any("imply" in n or "misprinted" in n or "blank" in n for n in notes):
                    anomalies.append(f"{label} p{p['page']} {item['name']}: " + "; ".join(notes))
            items.append(item)
    return items, anomalies, skipped


# --------------------------------------------------------------------------------------------------------------- output
# item id -> why it is not published: the guide's own printed numbers contradict each other or the stated portion, so none
# of them can be trusted (nothing is corrected). Found with `check_chain.py coffee-1` plus the cross-checks in this script
# (per-100 vs per-portion, same cup across milks); each row was re-read in the PDF. A refresh re-checks them: if Coffee #1
# fixes a row, delete its line here.
HOLDBACK: dict[str, str] = {
    "teacake": "Printed per-portion fat (26.7 g) does not fit the same row: calories 433 vs 615 from the macros, and 5.09 g fat per 100 g in 160 g is 8.1 g.",
    "marmite": "Portion weight is printed as 8 g but the per-portion values (78 kcal, 9 g carbs, 10.2 g protein) are what about 30 g would give; the macros alone (19.2 g) exceed 8 g.",
    "sticky-toffee-pudding-with-whipped-cream": "Per-portion 550 kcal cannot come from the printed 120 g portion at 333 kcal per 100 g (400 kcal at most); carbs and protein disagree the same way.",
    "macchiato-whole-milk-double": "Double values are identical to Single in every column, while the other milks' Double is about twice Single; the row's per-100 ml would make it a 26 ml drink.",
    "hot-chocolate-deluxe-soya-milk-large": "Per-product values (529 kcal, 22 g protein) and per-100 ml values (82 kcal) imply a cup of about 640 ml, against about 370 ml for the other milks and 396 kcal for the Regular row.",
    "hot-chocolate-deluxe-coconut-milk-large": "Per-product values (505 kcal, 17 g protein) and per-100 ml values (77 kcal) imply a cup of about 650 ml, against about 370 ml for the other milks and 375 kcal for the Regular row.",
    "iced-white-chocolate-matcha-soya-milk-regular": "The per-product block is a copy of the per-100 ml block (251 kJ, 59 kcal), so it is not the values for a regular cup (the Large row is 156 kcal).",
}

NOTE = ("Each milk and size is its own row, as the guide prints it. Extra syrups, shots and toppings aren't included. "
        "Food values are per portion; cream, chocolate flakes and marshmallows print 'per serving' with no size.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--food", type=Path, required=True)
    ap.add_argument("--core-drinks", type=Path, required=True)
    ap.add_argument("--autumn-drinks", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the three PDFs")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    try:
        food, f_anom, meat_unstated = build_food(args.food)
        core, c_anom, c_skipped = build_drinks(args.core_drinks, CORE_SECTIONS, False, "core beverages", CORE_LEFT_OUT, CORE_ADDONS)
        autumn, a_anom, _ = build_drinks(args.autumn_drinks, AUTUMN_SECTIONS, True, "autumn beverages")
    except pdf.LayoutChanged as e:
        print(f"A PDF no longer has the layout coffee_1_pdf.py reads: {e}\nRe-check the PDF by eye before changing the reader.",
              file=sys.stderr)
        return 1
    items = food + core + autumn

    ids = [slug(i["name"]) for i in items]
    dupes = sorted({x for x in ids if ids.count(x) > 1})
    if dupes:
        raise SystemExit(f"duplicate item names (ids): {dupes}")
    for hid in HOLDBACK:
        if hid not in ids:
            raise SystemExit(f"HOLDBACK names {hid!r}, which is not an item: the names changed")

    write_chain_folder(chain_id=CHAIN_ID, name="Coffee #1", cuisine="Coffee", source_title=SOURCE_TITLE, source_url=SOURCE_PAGE,
                       checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                       holdback=sorted(HOLDBACK.items()))
    print(f"wrote {len(items)} items to {args.out}: {len(food)} food, {len(core)} core drinks and add-ons, {len(autumn)} autumn drinks; "
          f"{len(HOLDBACK)} held back")
    for name, path in (("food", args.food), ("core beverages", args.core_drinks), ("autumn beverages", args.autumn_drinks)):
        print(f"  {name}: sha256 {sha256_file(path)}")
    print(f"left out of core beverages p32 (per 100 ml only / per 15 ml-22.5 ml measures): {len(c_skipped)} rows")
    print(f"meat type not stated: {meat_unstated or 'none'}")
    for a in f_anom + c_anom + a_anom:
        print("ANOMALY:", a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
