#!/usr/bin/env python3
"""Build data/source/zizzi/ from Zizzi UK's official "Nutrition Guide" PDF (Autumn 2026, V1, dated 15.09.26).

    python3 tools/uk_extract/zizzi.py path/to/ZIZZI-UK-NUTRITION-GUIDE.pdf --allergen-pdf path/to/ZIZZI-UK-ALLERGEN-GUIDE.pdf \
        --checked-on 2026-10-06 [--out DIR]

Numbers are copied by script from the PDF's "Per Portion Nutrition" columns exactly as printed (kcal, fat, saturates,
carbohydrate, sugar, protein, salt; kJ and the per-100g columns are not used). Names are read from the PDF too. What is
written by hand here is only the grouping (which printed table is which category), the rankable flag and a few
name tidy-ups. If Zizzi adds, removes or re-titles a table or a Special Guest dish, or the row count changes, this
script stops with a message so a person re-checks.

The nutrition guide has no vegetarian column. Zizzi's separate UK Allergen Guide (same date, V3) does: an item gets the
`vegetarian` tag only when that guide's Vegetarian or Vegan column says "Yes" for the same name (a name not found, or
printed twice with different marks, gets no tag), or when the item's own name says Vegan.

Source: https://www.zizzi.co.uk/menus -> "UK nutrition guide" and "UK allergen guide" (new PDFs for each menu change).
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import azzurri_pdf  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "zizzi"
SOURCE_URL = "https://cdn.sanity.io/files/ysupxjc9/production/abb3546d604fabb82945c2b1291c22949e5dc66e.pdf/ZIZZI-UK-NUTRITION-GUIDE_AUTUMN_SEP2026_V1.pdf"
SOURCE_TITLE = "Zizzi UK Nutrition Guide, Autumn 2026 V1 (15.09.26); vegetarian marks from the UK Allergen Guide, Autumn 2026 V3"
ALLERGEN_URL = "https://cdn.sanity.io/files/ysupxjc9/production/f09c553c16331e303f96ab6b8da9ceffd7808a19.pdf/ZIZZI-UK-ALLERGEN-GUIDE_AUTUMN_SEP2026-V3.pdf"
EXPECTED_ROWS = 434  # nutrition rows the PDF prints (all 16-number rows); a different count means the guide changed

# printed table heading -> (category, rankable). rankable None = decided per name below.
HEADINGS: dict[str, tuple[str, bool | None]] = {
    "APERITIVO": ("Aperitivo", False),
    "STARTERS": ("Starters", True),
    "SHARERS": ("Sharers", False),
    "SIGNATURE DISHES": ("Signature dishes", True),
    "SALADS": ("Salads", True),
    "THE RUSTICA": ("Rustica pizza", True),
    "PIZZANINI": ("Pizzanini", True),
    "NON-GLUTEN PIZZA": ("Non-gluten pizza", True),
    "CALZONE": ("Calzone", True),
    "CLASSICO PIZZA": ("Classico pizza", True),
    "SIDE": ("Sides", True),
    "SUPERIORE": ("Superiore pasta", True),
    "CLASSICO PASTA": ("Classico pasta", True),
    "AL FORNO": ("Al forno", True),
    "NON-GLUTEN PASTA": ("Non-gluten pasta", True),
    "DESSERTS": ("Desserts", False),
    "GELATOS": ("Gelatos", False),
    "EXTRAS": ("Extras", False),
    "BAMBINI": ("Kids", None),
    "MOCKTAILS & SOFT DRINKS": ("Drinks", False),
    "BEER & CIDERS": ("Drinks", False),
    "COFFEE & TEA": ("Coffee and tea", False),
    "SPECIAL GUEST": ("Special guest", None),
}
# Page 19 is headed "EXTRAS" in print but is the second page of the kids' (Bambini) menu: every row starts "Kids"/"Tiny"/etc.
HEADING_BY_PAGE = {(19, "EXTRAS"): "BAMBINI"}

# Special Guest dishes: rankable (a meal or starter) vs not (desserts, drinks, sauce). Anything not listed stops the script.
SPECIAL_MEALS = {
    "Sticky Pig Fonduta", "Chicken Cacciatore", "Five Cheese Gnocchi", "Take Away Only: Smoked Paprika Gnocchi",
    "Pig in Blanket Bombe", "Black Truffle Arancini", "Vegan Baked Gnocchi", "Lobster & Five Cheese Casareccia",
    "Cranberry & Prosciutto Roast Chicken with potatoes", "Cranberry & Prosciutto Roast Chicken with Gnocchi",
    "Sticky Pigs in Blankets", "Hot Honey Pork Belly", "Crab & Lemon Arancini", "Chicken Milanese Fonduta",
    "Quattro Pomodoro", "Non-Gluten Quattro Pomodoro", "Zucca Salad",
}
SPECIAL_OTHER = {
    "Salted Caramel Bread & Butter Pudding", "Take Away Only: Salted Caramel Bread & Butter Pudding", "Lime & Mint Cooler",
    "Pistachio Christmas Tree", "Take Away Only: Christmas Bombolini", "Cranberry Sauce", "Cioccolato Mousse", "Nemesis",
    "Raspberry & Rose Lemonade", "Take Away Only: Nemesis", "Tropical Pina Colada Sundae", "Sunset Mango Margarita",
    "Mango & Lime Cooler", "Raspberry & Rose Flavoured Soda Drink", "Sicilian Lemon & Ricotta Gelato",
    "Blood Orange & Elderflower Tonic", "Roasted Pineapple Soda", "Pink Grapefruit Soda", "Ginger Ale",
    "Dragon Fruit & Wild Strawberry Sundae", "Sicilian Still Lemonade",
}

# printed name -> published name (stray characters, and a row that only makes sense under the dish above it)
NAME_FIXES = {
    "Pineapple and Citrus?Refresher": "Pineapple and Citrus Refresher",  # the PDF prints a stray "?" between the words
    "Add Goat`s Cheese": "Add Goat's Cheese",
    # the guide prints this dish's description as its name, directly under Six Layer Lasagne; zizzi.co.uk/menus lists the same
    # dish, with the same 1123 kcal, as "All Out Lasagne" (description: "...More beef ragu. More mozzarella. More bechamel.")
    "Even better with more beef ragu, more mozzarella & more bechamel": "All Out Lasagne",
}
NOTES = {
    "All Out Lasagne": "Printed in the guide as 'Even better with more beef ragu, more mozzarella & more bechamel' (row under Six Layer Lasagne); "
                       "zizzi.co.uk/menus names this dish All Out Lasagne with the same 1123 kcal",
    "Pineapple and Citrus Refresher": "PDF prints 'Citrus?Refresher'",
    "Sunset Mango Margarita": "Printed kJ and kcal agree. kcal is 78 above 4P+4C+9F per portion (52 per 100g): the gap is the same in both "
                              "column sets and the guide does not say what it is (alcohol is not one of the printed columns)",
}
# Items whose printed numbers are impossible are listed here with the reason (never corrected); see the check report.
# (None found in the Autumn 2026 guide: every row passed the energy, kJ/kcal and per-100g-to-portion consistency checks.)
HOLDBACK: dict[str, str] = {}

PORK = re.compile(r"\b(pepperoni|salami|chorizo|pancetta|prosciutto|ham|bacon|pork|sausages?|nduja|pigs?|coppa)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|manzo)\b", re.I)
NOT_RANKABLE_NAME = re.compile(r"Sharepan|\bBoard\b|\bx ?(8|9|10)\b", re.I)
KIDS_MAIN = re.compile(r"Pizza|Pasta|Spaghetti|Casareccia|Pomodoro|Bolognese|Lentil Ragu", re.I)
KIDS_NOT_MAIN = re.compile(r"Topping|Base Only|Dough Crust|Crisps|Cone|Sundae|Gelato|Milk|Juice|Squash|Carton", re.I)


def tidy(name: str) -> str:
    name = NAME_FIXES.get(name, name)
    name = re.sub(r"^take away only\s*:\s*", "Take Away Only: ", name, flags=re.I)
    return name


def serving_from(name: str) -> str:
    m = re.search(r"\b(Small|Large)\b", name)
    if m:
        return m.group(1)
    m = re.search(r"\bx ?(\d+)$", name)
    if m:
        return f"{m.group(1)} pieces"
    m = re.search(r"\b(\d+) ?ml\b", name)
    return f"{m.group(1)} ml" if m else ""


def build_items(rows: list[dict], marks: dict) -> tuple[list[dict], list[str]]:
    """Items and a list of human-readable messages (drops and anything odd)."""
    items, log, seen = [], [], {}
    unknown = sorted({r["table"] for r in rows if (r["page"], r["table"]) not in HEADING_BY_PAGE and r["table"] not in HEADINGS})
    if unknown:
        raise SystemExit(f"Unknown table heading(s) {unknown}: the guide changed. Add them to HEADINGS in zizzi.py after reading the PDF.")
    for r in rows:
        heading = HEADING_BY_PAGE.get((r["page"], r["table"]), r["table"])
        category, rankable = HEADINGS[heading]
        name = tidy(r["name"])
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        p = r["portion"]
        if key in seen:
            first = seen[key]
            if first["portion"] != p:
                raise SystemExit(f"{name!r} is printed twice with different numbers (pages {first['page']} and {r['page']}): re-check.")
            log.append(f"dropped repeat of '{name}' (page {r['page']}, {r['table']}); identical to page {first['page']}")
            continue
        seen[key] = {"portion": p, "page": r["page"]}
        if heading == "SPECIAL GUEST":
            if name not in SPECIAL_MEALS and name not in SPECIAL_OTHER:
                raise SystemExit(f"New Special Guest dish {name!r}: add it to SPECIAL_MEALS or SPECIAL_OTHER in zizzi.py.")
            rankable = name in SPECIAL_MEALS
        elif heading == "BAMBINI":
            rankable = bool(KIDS_MAIN.search(name)) and not KIDS_NOT_MAIN.search(name)
        if NOT_RANKABLE_NAME.search(name):
            rankable = False
        tags = []
        mark = marks.get(azzurri_pdf.norm(r["name"]))  # (vegetarian, vegan) from the allergen guide, or None
        if re.search(r"\bvegan\b|\bvegetarian\b", name, re.I) or (mark and (mark[0] or mark[1])):
            tags.append("vegetarian")
        if PORK.search(name) or PORK.search(r["name"]):
            tags.append("contains_pork")
        if BEEF.search(name) or BEEF.search(r["name"]):  # also the printed text: "All Out Lasagne" is printed with 'beef ragu'
            tags.append("contains_beef")
        if "vegetarian" in tags and len(tags) > 1:
            raise SystemExit(f"{name!r} is marked vegetarian but its name says pork or beef: re-check the allergen guide.")
        if mark is None:
            log.append(f"no vegetarian mark found in the allergen guide for '{r['name']}' (no tag from it)")
        items.append({
            "name": name, "category": category, "serving": serving_from(name),
            "calories": p["kcal"], "protein_g": p["protein"], "carbs_g": p["carbs"], "fat_g": p["fat"],
            "sat_fat_g": p["sat"], "salt_g": p["salt"], "sugar_g": p["sugar"],
            "tags": "|".join(tags), "limited_time": heading == "SPECIAL GUEST", "rankable": rankable,
            "notes": NOTES.get(name, ""),
        })
    return items, log


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--allergen-pdf", type=Path, default=None, help="Zizzi UK Allergen Guide PDF (for vegetarian marks)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDF")
    ap.add_argument("--out", type=Path, default=None, help="default: data/source/zizzi")
    args = ap.parse_args()

    result = azzurri_pdf.read_zizzi(args.pdf)
    if result["skipped"]:
        print("Lines with numbers that are not exactly 16 columns (not guessed):", *result["skipped"], sep="\n  ", file=sys.stderr)
        return 1
    rows = result["rows"]
    if len(rows) != EXPECTED_ROWS:
        print(f"The PDF has {len(rows)} nutrition rows but this script expects {EXPECTED_ROWS}. The menu or layout changed: "
              "re-check the PDF, then update EXPECTED_ROWS (and HEADINGS / SPECIAL_* if needed).", file=sys.stderr)
        return 1
    marks = {}
    if args.allergen_pdf:
        res = azzurri_pdf.read_veg_marks(args.allergen_pdf, {azzurri_pdf.norm(r["name"]) for r in rows})
        marks = res["marks"]
        if res["conflicts"]:
            print("Names printed with different vegetarian marks in the allergen guide (no tag given):", *res["conflicts"], sep="\n  ")
    items, log = build_items(rows, marks)
    ids = {slug(i["name"]) for i in items}
    held = []
    for name, reason in HOLDBACK.items():
        if slug(name) not in ids:
            print(f"HOLDBACK names {name!r}, which is not in the guide any more: remove it.", file=sys.stderr)
            return 1
        held.append((slug(name), reason))
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Zizzi", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["zizzi", "zizzi italian"], items=items,
        note="Zizzi says its figures are approximate (ingredients measured by hand, a mix of calculation and lab testing) and cover core dishes only, not substitutions or added extras. Portion weights are not published.",
        holdback=held, out=args.out)
    print(*log, sep="\n")
    veg = sum("vegetarian" in i["tags"] for i in items)
    pork = sum("contains_pork" in i["tags"] for i in items)
    beef = sum("contains_beef" in i["tags"] for i in items)
    print(f"wrote {len(items)} items ({len(held)} held back; {veg} vegetarian, {pork} pork, {beef} beef) to {out} (PDF sha256 {sha256_file(args.pdf)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
