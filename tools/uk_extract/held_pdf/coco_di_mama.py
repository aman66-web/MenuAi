#!/usr/bin/env python3
"""Build data/source/coco-di-mama/ from Coco di Mama's official "Nutrition Guide - Stores" PDF.

    python3 tools/uk_extract/coco_di_mama.py path/to/AW26-C1-Store-Nutrition-Guide.pdf --checked-on 2026-10-06

Numbers are copied from the PDF exactly as printed: the PER SERVING columns (kcal, fat, saturates, carbohydrate, sugar,
protein, salt). kJ and every per-100g column are not used. Fibre and sodium are not in the guide, so they stay blank.
Names are the printed names with tidy capitalisation, wrapped words re-joined and the guide's (V) / (VE) marks turned into
the vegetarian tag (the marks are the chain's own). Categories and "rankable" are decided by the rules below.

If Coco di Mama reorders, adds, drops or renames rows the fingerprint below no longer matches and this script stops, so a
human re-checks the rules (and the holdback list) against the new PDF before running again. A new guide with the same
rows but new numbers just re-runs.

Source: https://cdn.sanity.io/files/ysupxjc9/production/102679c3f2607c4c695147b83e2b83da49d6fe61.pdf/AW26-C1-Store-Nutrition-Guide.pdf
(linked as "Instore & Catering Nutritional Information" from https://www.cocodimama.co.uk/menus; cover: "Nutrition Guide -
Stores, V2 - 08.09.26").
"""
import argparse
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import coco_di_mama_pdf  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "coco-di-mama"
SOURCE_URL = "https://cdn.sanity.io/files/ysupxjc9/production/102679c3f2607c4c695147b83e2b83da49d6fe61.pdf/AW26-C1-Store-Nutrition-Guide.pdf"
SOURCE_TITLE = "Coco di Mama Nutrition Guide - Stores, V2 dated 08.09.26 (AW26)"

# Fingerprint of the rows this script was written for (639 rows in the guide, in reading order, by printed name).
EXPECTED_SECTIONS = {"Breakfast": 71, "Lunch": 103, "Sides and Snacks": 36, "Catering": 61, "Coffee & Teas": 353, "Cold Drinks": 15}
EXPECTED_NAMES_SHA256 = "eea805772c2e0844b2f6f18f9ac0f7ef4b35cf89e35ece329559e43a49c77e51"

NOTE = ("Figures are the chain's approximate in-store values per serving, core menu only, no substitutions. Catering platters "
        "are not included. A pasta pot is a pasta base plus a sauce: the guide lists each by size (Midi or Grande) as its own "
        "row, so add the two; we don't.")

# --- categories (display order) ---------------------------------------------------------------------------------------
C_BREAKFAST = "Breakfast"
C_POTS = "Pots, oats & porridge"
C_PASTRY = "Pastries"
C_PBASE = "Pasta bases"
C_PSAUCE = "Pasta sauces"
C_HOT = "Hot dishes"
C_PINSA = "Pinsa"
C_BOWLS = "Bowls & salads"
C_SAND = "Sandwiches & baguettes"
C_SIDES = "Sides"
C_SNACK = "Snacks & sweet treats"
C_ADD = "Add-ons & extras"
C_HOTD = "Hot drinks"
C_ICED = "Iced drinks"
C_DADD = "Drink add-ons"
C_COLD = "Cold drinks"
CATEGORY_ORDER = [C_BREAKFAST, C_POTS, C_PASTRY, C_PBASE, C_PSAUCE, C_HOT, C_PINSA, C_BOWLS, C_SAND, C_SIDES, C_SNACK, C_ADD,
                  C_HOTD, C_ICED, C_DADD, C_COLD]
NOT_RANKABLE = {C_PASTRY, C_PBASE, C_PSAUCE, C_SNACK, C_ADD, C_HOTD, C_ICED, C_DADD, C_COLD}

# --- rows left out on purpose ------------------------------------------------------------------------------------------
# Whole section: catering platters, boxes and bottles: each "serving" is a platter for a group, with no stated serving size.
EXCLUDED_SECTIONS = {"Catering"}
# One row that is a group of products, not an item.
EXCLUDED_NAMES = {"Fancy Teas (all options)"}

# --- rows the guide prints impossibly: not published (never corrected). id -> reason -----------------------------------
HOLDBACK = {
    "add-1-sausage": "Printed as 3 kcal, 0 g protein and 0 g fat for one sausage, which the guide's own per-100g line (290 kcal) "
                     "makes a 1 g sausage; 'Add 2 sausages' on the same page is 232 kcal.",
    "extra-sausage": "Printed as 3 kcal, 0 g protein and 0 g fat for one sausage (a 1 g sausage on the guide's own per-100g line, "
                     "290 kcal); 'Add 2 sausages' is 232 kcal.",
    "large-pistachio-latte-whole-milk": "Printed numbers (265 kcal, 12 g fat, 1.6 g saturates) are identical to the skimmed-milk row "
                                        "above it; a large whole-milk latte can't have 1.6 g saturates when the plain Large Latte "
                                        "Whole Milk already has 6.3 g.",
}

# --- name tidying ------------------------------------------------------------------------------------------------------
SMALL_WORDS = {"and", "of", "on", "with", "in", "di", "by", "the", "a", "to", "for"}
TYPO_FIXES = [("Cortardo", "Cortado"), ("Latter", "Latte"), ("12 hr ", "12hr "), ("NEW ", ""), (" GRANDE", " Grande"), (" LRG", " Large")]
VEG_MARK = re.compile(r"\s*\((?:V|VE|Ve)\)", re.I)
SIZE_WORDS = ["Small", "Large", "Regular", "Midi", "Grande", "12oz", "16oz"]


def tidy(raw: str) -> tuple[str, bool]:
    """Printed name -> (display name, vegetarian mark printed)."""
    s = raw.replace("’", "'")
    s = re.sub(r"(?<=[A-Za-z])- (?=[a-z])", "", s)  # words the PDF hyphenated at a line end ("Sau- sage")
    veg = bool(VEG_MARK.search(s))
    s = VEG_MARK.sub("", s)
    for a, b in TYPO_FIXES:
        s = s.replace(a, b)
    out = []
    for i, tok in enumerate(s.split()):
        if tok.lower() in SMALL_WORDS and i > 0:
            out.append(tok.lower())
        elif re.search(r"[A-Z]", tok[1:]) or tok[0].isdigit() or not tok[0].isalpha():
            out.append(tok)  # EatReal, TRIP, 12hr, &, 'Nduja ...
        else:
            out.append(tok[0].upper() + tok[1:])
    return " ".join(out), veg


def serving_of(name: str) -> str:
    for w in SIZE_WORDS:
        if re.search(rf"\b{w}\b", name):
            return w
    return ""


# --- categories --------------------------------------------------------------------------------------------------------
def categorise(section: str, page: int, name: str) -> str:
    n = name
    if section == "Cold Drinks":
        return C_COLD
    if section == "Coffee & Teas":
        if re.match(r"^(Add |Splash of )", n) or re.search(r"\bSyrup\b", n) or n in ("Add Biscoff Sauce",):
            return C_DADD
        return C_ICED if re.search(r"\bIced\b", n) else C_HOTD
    if section == "Breakfast":
        if re.match(r"^(Add |Extra )", n) or n in ("Brown Sauce Pot", "Calabrese Chilli Honey Pot", "Ketchup Pot"):
            return C_ADD
        if re.search(r"Overnight Oats|Bircher|Yoghurt|Pot$|Chia Pudding|Porridge", n):
            return C_POTS
        if n in ("Almond Croissant", "Butter Croissant", "Pistachio Croissant", "Raspberry Croissant", "Pain Au Chocolat", "Pan Aux Raisins"):
            return C_PASTRY
        return C_BREAKFAST
    if section == "Sides and Snacks":
        if re.search(r"Dip$", n) or n == "Garlic Mayo":
            return C_ADD
        if re.search(r"Bomboloni|Bombo Trio|Biscoff Donut|Cookie|Chocolonely|Crisps|EatReal|Fresh Fruit|Fruit Pot", n):
            return C_SNACK
        return C_SIDES
    if section == "Lunch":
        if page <= 16:
            return C_PBASE if re.match(r"^(Cocolini|Wholewheat|Gluten Free) (Midi|Grande)$", n) else C_PSAUCE
        if re.match(r"^Add ", n):
            return C_ADD
        if "Bowl" in n or n == "Power Chicken Caesar":
            return C_BOWLS
        if "Pinsa" in n:
            return C_PINSA
        if re.search(r"Mac & Cheese|Lasagne", n):
            return C_HOT
        if re.search(r"Sourdough|Baguette", n):
            return C_SAND
        return C_ADD  # dressings, salad sides, toppings and extras on pages 17-18 and 21-22
    raise ValueError(f"unexpected section {section!r}")


PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pork|salami|chorizo|pancetta|prosciutto|'?nduja)\b", re.I)
BEEF = re.compile(r"\b(beef)\b", re.I)

# Things worth knowing about a published row (not exported). Keyed by display name.
NOTES = {
    "Berry Fruit Pot": "Printed 53 kcal; fat, carbohydrate and protein add to about 44 kcal (fibre is not published).",
    "Very Berry Fruit Pot": "Printed 53 kcal; fat, carbohydrate and protein add to about 44 kcal (fibre is not published). Same numbers as Berry Fruit Pot.",
    "Add Chicken": "Printed saturates (0.1 g) are above printed fat (0 g): rounding in the guide.",
    "Large Matcha Latte - Soya Milk": "Printed numbers are identical to the coconut-milk row (the iced soya row has 8.2 g protein, this has 4.7 g): possible copy error in the guide, kept as printed.",
    "Small Iced Matcha Latte - Soya Milk": "Printed numbers are identical to the coconut-milk row: possible copy error in the guide, kept as printed.",
    "Small Matcha Latte - Soya Drink": "Printed numbers are identical to the coconut-drink row: possible copy error in the guide, kept as printed.",
    "Large Pistachio Latte - Soya Milk": "Printed numbers are identical to Large Pistachio Iced Latte - Soya Milk although the other hot and iced pistachio rows differ: possible copy error, kept as printed.",
    "Pipers Chorizo Crisps": "Tagged contains_pork because the name says chorizo (the guide lists no ingredients; may be a flavour name).",
}


def fingerprint(rows: list[dict]) -> str:
    return hashlib.sha256("\n".join(f"{r['page']}|{r['section']}|{r['name']}" for r in rows).encode()).hexdigest()


def build_items(rows: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    items: list[dict] = []
    seen: dict[str, dict] = {}
    dropped: list[str] = []
    for r in rows:
        if r["section"] in EXCLUDED_SECTIONS or r["name"] in EXCLUDED_NAMES:
            continue
        name, veg = tidy(r["name"])
        category = categorise(r["section"], r["page"], name)
        nums = {k: r[k] for k in ("kcal", "protein", "carbs", "fat", "sat", "sugar", "salt")}
        if name in seen:
            if seen[name]["_nums"] == nums:
                dropped.append(f"{name} (printed twice with the same numbers; page {r['page']})")
                continue
            raise SystemExit(f"Two different rows are both named {name!r} (page {seen[name]['_page']} and {r['page']}): decide by hand.")
        tags = []
        if veg:
            tags.append("vegetarian")
        elif PORK.search(name):
            tags.append("contains_pork")
        if not veg and BEEF.search(name):
            tags.append("contains_beef")
        item = {
            "name": name, "category": category, "serving": serving_of(name),
            "calories": r["kcal"], "protein_g": r["protein"], "carbs_g": r["carbs"], "fat_g": r["fat"],
            "sat_fat_g": r["sat"], "salt_g": r["salt"], "sugar_g": r["sugar"],
            "tags": "|".join(tags), "limited_time": False, "rankable": category not in NOT_RANKABLE,
            "notes": NOTES.get(name, ""), "_nums": nums, "_page": r["page"],
        }
        seen[name] = item
        items.append(item)
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps the guide's order inside a category
    missing_notes = [k for k in NOTES if k not in seen]
    return items, dropped, missing_notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you downloaded and read the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--print-fingerprint", action="store_true", help="print the row fingerprint and exit (use after re-checking the rules)")
    args = ap.parse_args()

    rows = coco_di_mama_pdf.read_rows(args.pdf)
    if args.print_fingerprint:
        print(len(rows), dict(Counter(r["section"] for r in rows)), fingerprint(rows))
        return 0
    sections = dict(Counter(r["section"] for r in rows))
    if sections != EXPECTED_SECTIONS or fingerprint(rows) != EXPECTED_NAMES_SHA256:
        print(f"The PDF has {len(rows)} nutrition rows by section {sections}; this script was written for "
              f"{sum(EXPECTED_SECTIONS.values())} rows {EXPECTED_SECTIONS} with a different list or order of names. The menu or "
              "layout changed: re-check the category rules, EXCLUDED_*, HOLDBACK and NOTES against the new PDF, then update "
              "EXPECTED_* (--print-fingerprint) before running again.", file=sys.stderr)
        return 1

    items, dropped, missing_notes = build_items(rows)
    if missing_notes:
        print(f"NOTES names not found in this guide: {missing_notes}", file=sys.stderr)
        return 1
    ids = {slug(i["name"]) for i in items}
    unknown_holdback = [h for h in HOLDBACK if h not in ids]
    if unknown_holdback:
        print(f"HOLDBACK ids not found: {unknown_holdback}", file=sys.stderr)
        return 1
    for i in items:
        i.pop("_nums"), i.pop("_page")
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Coco di Mama", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["coco di mama", "cocodimama", "coco di mama italian"], items=items, out=args.out,
        note=NOTE, holdback=list(HOLDBACK.items()))
    for d in dropped:
        print("dropped duplicate:", d)
    print(f"wrote {len(items)} items to {out} ({len(HOLDBACK)} held back; PDF sha256 {sha256_file(args.pdf)})")
    print(dict(Counter(i["category"] for i in items)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
