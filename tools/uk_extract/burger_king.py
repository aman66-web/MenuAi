#!/usr/bin/env python3
"""Build data/source/burger-king/ from Burger King UK's official "Nutritional Information" PDF.

    python3 tools/uk_extract/burger_king.py path/to/nutrition.pdf --checked-on 2026-10-05

Source: https://www.burgerking.co.uk/nutritional-info (the site redirects that page to the PDF, which Burger King hosts on
Google Drive; the Drive link changes when a new "kit" is published, so look at the page rather than a saved link).

The PDF is image-only, so its numbers are read by OCR (burger_king_pdf.py: grid detection, several readings per cell,
voting, arithmetic alarms). Only NAMES, categories and flags are typed by hand (burger_king_rows.py). The script stops
- if the number of printed products no longer matches burger_king_rows.ROWS, or
- if any product trips an alarm that a human has not yet compared with the page image (REVIEWED below), or
  whose printed numbers have changed since it was reviewed.
It never changes a printed number except through OVERRIDES: cells where the OCR was wrong and a human read the page
image instead. Each override says what the page prints.

Setup:  python3 -m venv venv && venv/bin/pip install rapidocr-onnxruntime pillow numpy   (poppler must be installed)
"""
import argparse
import csv
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import burger_king_pdf as bkpdf  # noqa: E402
from burger_king_rows import BEEF, BREAKFAST, CATEGORY_ORDER, EXCLUDED, KIDS, ROWS  # noqa: E402

CHAIN_ID = "burger-king"
SOURCE_URL = "https://www.burgerking.co.uk/nutritional-info"
SOURCE_TITLE = "Burger King UK Nutritional Information (Kit 6 National, 18 June 2026)"
MAX_OUTLIERS = 1  # readings of one cell that may differ in their digits from the rest before a human must look

# (product name, "s.<field>" or "h.<field>") -> (value the page prints, why the OCR could not be used).
# "s." = the per-serving row (this is what goes into items.csv); "h." = the "per 100g" row (only used for the alarms).
MISSED_DOT = "OCR dropped the decimal point"
EXTRA_DOT = "OCR invented a decimal point"
OVERRIDES: dict[tuple[str, str], tuple[str, str]] = {
    ("Bacon Double Cheese", "s.kj"): ("1839", EXTRA_DOT),
    ("Classic Double Melts Burger", "s.sat"): ("7.4", MISSED_DOT),
    ("The Wagyu", "s.protein"): ("37.9", MISSED_DOT),
    ("Breakfast King (HP Sauce)", "s.fibre"): ("2.7", MISSED_DOT),
    ("Egg & Cheese Breakfast Sandwich", "s.fibre"): ("2.7", MISSED_DOT),
    ("BBQ Stacker Chicken Melts Burger Single", "s.sugars"): ("7.7", MISSED_DOT),
    ("Caesar Dressing", "s.sugars"): ("1.36", MISSED_DOT),
    ("Kids Hamburger", "s.kcal"): ("244", EXTRA_DOT),
    ("BK Dip Pot - Flame Grilled Mayo", "s.salt"): ("0.7", MISSED_DOT),
    ("BK Dip Pot - Flame Grilled Mayo", "s.sugars"): ("0.7", MISSED_DOT),
    ("Chilli Cheese Bites 6pc", "s.sat"): ("7.3", MISSED_DOT),
    ("Hash Browns 15pc", "s.protein"): ("2.7", MISSED_DOT),
    ("Onion Rings 9pc", "s.kj"): ("1411", EXTRA_DOT),
    ("Truffle Loaded Fries", "s.sat"): ("7.7", MISSED_DOT),
    # "per 100g" row cells (only used for the cross-checks, never exported):
    ("Wellington Wagyu", "h.sodium"): ("207.9", MISSED_DOT),
    ("Apple Slices", "h.fibre"): ("2.7", MISSED_DOT),
    ("BK Dip Pot - Sweet Chilli", "h.fat"): ("0.12", "printed as .12 without the leading zero"),
    ("Chilli Cheese Bites 6pc", "h.protein"): ("9", "OCR could not read it"),
    ("Salad - Plain", "h.protein"): ("2.7", MISSED_DOT),
    ("King Fusion - Plain", "h.protein"): ("2.7", MISSED_DOT),
    ("Sundae Plain", "h.protein"): ("2.7", MISSED_DOT),
}

# product name -> (fingerprint of its printed per-serving numbers, what is odd about the printed row).
# A product that trips an alarm must be listed here, after a human compared it with the page image.
# The fingerprint makes a changed row ask for a new review.
REVIEWED: dict[str, tuple[str, str]] = {
    "Big King": ("358|1402|3416|56|20|1430|3.6|56.3|17|2.5|52",
                 "Printed kcal 1402 disagrees with its kJ (3416) and with fat/carbs/protein (about 940 kcal); per 100g kcal 391 also disagrees with per 100g kJ 954"),
    "Burger Buddies - Big King": ("119|293|1229|15|5|416|1.4|24|5|2.3|14", "Printed salt 1.4 g does not match sodium 416 mg"),
    "Wellington Wagyu": ("283|820.8|3429.4|52.1|16.9|588.5|2.0|45.2|13.1|3.6|42.1", "Printed salt 2.0 g does not match sodium 588.5 mg (the PDF prints decimals in this row)"),
    "Whopper": ("287|595|2491|30|8.2|920|2.3|53|11|3.4|29", "Fibre 3.4 g per serving but 1.5 g per 100g (287 g)"),
    "Big King Sauce": ("28|497|120|11.1|1|300|0.8|4.7|3.3|0.2|0.6",
                       "Printed kcal 497 and kJ 120 look swapped (the per 100g row is swapped too: 1776 / 430); entered as printed"),
    "Caesar Style Sauce": ("28|156|654|161|1.6|180|4.5|2.3|1.4|0.1|0.7",
                           "Fat printed as 161 g for a 28 g sauce (per 100g 57.5 g, so probably 16.1) and kcal 156 disagrees with it; salt 4.5 g does not match sodium 180 mg; entered as printed"),
    "HP Sauce": ("1|1|5|<0.5|<0.1|10|<0.01|<0.5|<0.5|<0.5|<0.5", "Sodium 10 mg for a 1 g serving but 500 mg per 100g (small serving, rounded)"),
    "Pickles": ("3|0|1|<0.5|<0.1|50|0.12|<0.5|<0.5|<0.5|<0.5", "Sodium 50 mg for a 3 g serving but 1300 mg per 100g (small serving, rounded)"),
    "Tomato Slices": ("14|2|10|<0.5|<0.1|0|<0.01|<0.5|<0.5|<0.5|<0.5", "Sodium 0 mg per serving but 10 mg per 100g (small serving, rounded)"),
    "Wagyu Patty": ("125|340|1418|24|9.9|95|0.2|0.1|0.1|0.5|24", "Protein 24 g per 125 g serving but 24 g per 100g (would be about 30 g)"),
    "Whopper Patty": ("85|239|999|17|7.5|70|0.2|<0.5|<0.5|0.6|21", "Per 100g saturates printed as 208.8 (a typo); the per-serving 7.5 is what is entered"),
    "Chicken Nuggets 20pc": ("334|848|3546|46|7.2|1800|4.6|59|3.7|1.5|45", "Sugars 3.7 g and fibre 1.5 g per serving do not match the per 100g row (1.4 g and <0.5 g)"),
    "Chilli Cheese Bites 20pc": ("372|106|4438|56|24|2600|6.8|104|4.6|5.4|34",
                                 "Printed kcal 106 disagrees with its kJ (4438), the macros and the per 100g row (about 1060 expected); entered as printed"),
    "Halloumi Fries 5pc": ("90|287|1199|19|12|860|2.1|13|11|<0.5|16", "Carbs 13 g and sugars 11 g per serving do not match the per 100g row (11 g and 8.9 g)"),
    "Halloumi Fries 8pc": ("129|431|1801|30|19|1300|3.2|14|12|<0.5|26",
                           "Per-serving fat, saturates, carbs, sugars and protein do not match the per 100g row (carbs per 100g is printed as 2)"),
    "Sharer Box (5x Sour Cream & Onion Chicken Fries, Chicken Nuggets, Chilli Cheese Bites and Onion Rings)": (
        "295|769|3216|41|10.2|1614|4.0|66|4.2|4.4|34.6", "Several per-serving values do not match the per 100g row (e.g. sodium 1614 mg vs 375 mg per 100g x 295 g)"),
    "Truffle Loaded Fries": ("209|666|2788|42|7.7|650|1.6|61|0.7|3.1|8.9", "Sugars 0.7 g per serving but 1.5 g per 100g (209 g)"),
    "Cheesecake Bar - Gooey Salted Caramel": ("82|285|1195|8.7|7.1|140|0.4|34.2|17|1.1|4.8",
                                              "kcal 285 does not match its macros (about 234 kcal); fat 8.7 g per serving but 17.9 g per 100g (82 g)"),
    "Salted Caramel Milkshake 22oz": ("711|838|3506|20|14|1131|3|143|102|3|21", "Salt 3 g and fibre 3 g per serving but 0 per 100g"),
    "Sundae Salted Caramel": ("135|183|766|5.2|3.8|200|0.51|30|24|0.6|3.5", "Sodium 200 mg per serving but 50 mg per 100g (135 g)"),
    "Vanilla Milkshake 16oz": ("510|531|2223|13|9.2|440|1.10|86|0.7|2.5|16", "Sugars 0.7 g with 86 g carbs (per 100g sugars 12 g)"),
    "Plant-based Double Whopper": ("382|722|3022|35|7.7|1400|3.4|52|13|17|44", "Per 100g sugars printed as 34 (a typo); per-serving 13 g is what is entered"),
}

BEEF_WORDS = re.compile(r"\b(beef|steak|angus|wagyu)\b", re.I)
PORK_WORDS = re.compile(r"\b(bacon|ham|sausage|pork|pepperoni|salami|chorizo)\b", re.I)
VEG_WORDS = re.compile(r"\b(vegan|plant-based)\b", re.I)


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def fingerprint(pr: bkpdf.Product) -> str:
    return "|".join(str(pr.serving[f]) for f in bkpdf.FIELDS)


def tags_for(name: str) -> str:
    tags = []
    if VEG_WORDS.search(name):
        tags.append("vegetarian")
    if PORK_WORDS.search(name):
        tags.append("contains_pork")
    if BEEF_WORDS.search(name):
        tags.append("contains_beef")
    return "|".join(tags)


def meat_unstated(name: str, category: str, tags: str) -> bool:
    """Burgers and sandwiches whose name does not say which meat they contain (reported, not tagged)."""
    if category == BEEF:
        return "contains_beef" not in tags
    if category == KIDS:
        return name in ("Kids Cheeseburger", "Kids Hamburger")
    if category == BREAKFAST:
        return name != "Egg & Cheese Breakfast Sandwich" and "contains_pork" not in tags
    return name in ("Hamburger Patty", "Whopper Patty")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live menu")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--cache", type=Path, help="JSON file for the raw OCR readings of this PDF (reading takes ~20 minutes); "
                    "reused only if it was made from the same PDF bytes")
    ap.add_argument("--list-alarms", action="store_true", help="print every product that needs a human look, then stop")
    args = ap.parse_args()

    pdf_sha = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    products = bkpdf.load_readings(args.cache, pdf_sha) if args.cache else None
    if products is None:
        products = bkpdf.read_products(args.pdf, workers=args.workers)
        if args.cache:
            bkpdf.save_readings(products, pdf_sha, args.cache)
    if len(products) != len(ROWS):
        print(f"The PDF has {len(products)} products but burger_king_rows.py names {len(ROWS)}. The layout or menu changed: "
              "re-check the names in ROWS against the PDF before running again.", file=sys.stderr)
        return 1

    names = [r[0] if r else None for r in ROWS]
    for (name, key), (value, why) in OVERRIDES.items():
        pr = products[names.index(name)]
        row, field = key.split(".")
        (pr.serving if row == "s" else pr.per100)[field] = value
        pr.agree[key] = 99  # a human read this cell
        print(f"override: {name} {key} = {value} ({why})")

    # a product listed twice must have identical printed numbers
    for i, spec in enumerate(ROWS):
        if spec is None:
            twin = next(p for p, s in zip(products, ROWS) if s and s[0] == "Whopper Jr.")
            if fingerprint(products[i]) != fingerprint(twin):
                print("The second 'Whopper Jr.' row no longer matches the first: re-check burger_king_rows.py.", file=sys.stderr)
                return 1

    for name, why in EXCLUDED.items():
        pr = products[names.index(name)]
        print(f"excluded: {name} ({why}); printed row: {fingerprint(pr)}")
    alarms = {}
    for i, pr in enumerate(products):
        if ROWS[i] is None or ROWS[i][0] in EXCLUDED:
            continue
        msgs = bkpdf.check(pr, MAX_OUTLIERS)
        name = ROWS[i][0]
        if msgs and REVIEWED.get(name, ("",))[0] != fingerprint(pr):
            alarms[name] = (pr, msgs)
    if alarms:
        print(f"\n{len(alarms)} product(s) need a human look (compare with the page image, then add to OVERRIDES / REVIEWED):")
        for name, (pr, msgs) in alarms.items():
            print(f"  {name}  [page {pr.page + 1}, product {pr.index + 1}]  fingerprint {fingerprint(pr)}")
            for m in msgs:
                print(f"      {m}")
        return 2
    if args.list_alarms:
        print("no alarms")
        return 0

    items = []
    for pr, spec in zip(products, ROWS):
        if spec is None or spec[0] in EXCLUDED:
            continue
        name, category, rankable, note = spec
        s = pr.serving
        tags = tags_for(name)
        notes = [n for n in (note, REVIEWED.get(name, ("", ""))[1], "Meat type not stated in the item name" if meat_unstated(name, category, tags) else "") if n]
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": f"{s['serving']} g",
            "calories": s["kcal"], "protein_g": s["protein"], "carbs_g": s["carbs"], "fat_g": s["fat"],
            "sat_fat_g": s["sat"], "sodium_mg": s["sodium"], "salt_g": s["salt"], "sugar_g": s["sugars"], "fiber_g": s["fibre"],
            "tags": tags, "limited_time": "false", "rankable": str(rankable).lower(), "components": "", "added_on": "",
            "notes": "; ".join(notes),
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), f"duplicate ids: {sorted(i for i in ids if ids.count(i) > 1)}"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(items)
    (args.out / "chain.csv").write_text(
        "id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample\n"
        f'{CHAIN_ID},Burger King,Burgers,standard,"{SOURCE_TITLE}",{SOURCE_URL},{args.checked_on},burger king|burgerking|bk,\n',
        encoding="utf-8")
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")
    print(f"wrote {len(items)} items to {args.out} (PDF sha256 {pdf_sha})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
