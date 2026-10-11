#!/usr/bin/env python3
"""Build data/source/ask-italian/ from ASK Italian's official UK Allergen Guide PDF (nutrition tables at the back).

    python3 tools/uk_extract/ask_italian.py path/to/May26_allergenguide_v2.pdf --checked-on 2026-10-06 [--out DIR]

The PDF is titled "ASK Italian Allergen and Nutritional Information, Spring/Summer 2026" and is marked V3 10.09.26.
Numbers are copied by script from the "Per Portion" columns exactly as printed (kcal, fat, saturates, carbohydrate, sugar,
protein, salt; kJ and the per-100g columns are not used). Names come from the PDF too. What is written by hand is only
the grouping (printed menu section -> category), the rankable flag and a few name tidy-ups. The guide's allergen tables
(same PDF) have Vegetarian and Vegan columns: an item gets the `vegetarian` tag only when one of them says "Yes" for the
same name, or its own name says Vegan/Vegetarian.

Left out: the "Summer Specials" table (page 35), which the guide dates 02/06/26 - 31/08/26, i.e. over. If ASK adds a new
section, a "&" add-on row or changes the row count, this script stops so a person re-checks.

Source: https://www.askitalian.co.uk/menus -> "Allergen guide" (a new PDF is published for each menu change).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import azzurri_pdf  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "ask-italian"
SOURCE_URL = "https://cdn.sanity.io/files/ysupxjc9/production/cf7f0dd9c834b56ad7ed9885d089398075841181.pdf/May26_allergenguide_v2.pdf"
SOURCE_TITLE = "ASK Italian Allergen and Nutritional Information, Spring/Summer 2026 (V3, 10.09.26)"
EXPECTED_ROWS = 370  # every 16-number row in the PDF, including the 8 Summer Specials rows we leave out
EXPECTED_EXPIRED = 8

# printed "Menu Section" -> (category, rankable). rankable None = decided per name below.
SECTIONS: dict[str, tuple[str, bool | None]] = {
    "Bread & Nibbles": ("Bread and nibbles", True),
    "Starters": ("Starters", True),
    "Classic Pasta": ("Classic pasta", True),
    "Pasta Fresca": ("Pasta fresca", True),
    "Al Forno": ("Al forno", True),
    "Pizza": ("Pizza", True),
    "Extra Toppings": ("Extra toppings", False),
    "Speciality Mains": ("Speciality mains", True),
    "Sides": ("Sides", True),
    "Dips": ("Dips", False),
    "Condiments": ("Condiments", False),
    "Desserts": ("Desserts", False),
    "Takeaway Only": ("Takeaway only", True),
    "Vegan": ("Vegan menu", True),
    "Soft Drinks": ("Drinks", False),
    "Hot Drinks": ("Hot drinks", False),
    "Decaf Coffees": ("Hot drinks", False),
    "Beers & Ciders": ("Drinks", False),
    "Mocktails & Non-alcoholic cocktails": ("Drinks", False),
    "Kids Starters": ("Kids starters", False),
    "Kids Mains": ("Kids mains", True),
    "Kids Sides": ("Kids sides", False),
    "Kids Desserts": ("Kids desserts", False),
    "Kids Drinks": ("Kids drinks", False),
    "Kids Tiny Tums": ("Kids tiny tums", None),
    "Vegan kids menu": ("Vegan kids menu", True),
    "Non-Gluten Starters": ("Non-gluten starters", True),
    "Non-Gluten Pasta": ("Non-gluten pasta", True),
    "Non-Gluten Pizza": ("Non-gluten pizza", True),
    "Non-Gluten Dessert": ("Non-gluten dessert", False),
    "Non-gluten Kids": ("Non-gluten kids", True),
}
EXPIRED_SECTION = "Summer Specials"

# Rows printed as "& Topping" / "& Sauce" under a dish are that add-on's own values, not a whole dish. The guide lists them
# under the dish they go with; the dish they are for is named here, so the published name reads "Dish: & Add-on".
ADDON_OF = {
    ("Bread & Nibbles", "& Balsamic Caramelised Onion Confiture"): "Garlic Bread with Mozzarella",
    **{("Kids Mains", n): "Kids make your own pasta" for n in ("& Tasty Tomato Sauce", "& Pesto Sauce", "& Creamy Cheese Sauce")},
    **{("Kids Mains", n): "Happy Face Pizza" for n in ("& Roasted Peppers", "& Mushrooms", "& Olives", "& Spinach", "& Pancetta",
                                                    "& Pepperoni", "& Chicken Breast", "& Ham")},
    **{("Kids Desserts", n): "Build Your Own Sundae" for n in (
        "& Toffee Sauce", "& Mixed Berry Sauce", "& Chocolate Sauce", "& Mini Marshmallows", "& Mini Meringues",
        "& White Chocolate Curls", "& Grapes", "& Fudge", "& Popcorn", "& Biscoff Crumb")},
}
# bare "make your own" bases: the sauce is a separate row, so these are not an order on their own; named to match the
# guide's own wording ("Vegan - kids make your own ...")
RENAME = {
    ("Kids Mains", "Spaghetti"): "Kids make your own pasta: Spaghetti",
    ("Kids Mains", "Curly Pasta"): "Kids make your own pasta: Curly Pasta",
}
NOT_RANKABLE = {
    "Kids make your own pasta: Spaghetti", "Kids make your own pasta: Curly Pasta", "Vegan - kids make your own pasta curly pasta",
    "Vegan - kids make your own spaghetti", "Non Gluten - Kids NG fusilli", "Non Gluten Base",  # bases without sauce / topping
    "ASK Favourites Sharer", "Antipasti Classico",  # sharing platters (1,500+ kcal)
}
# Items the guide prints but ASK's own live menu page (askitalian.co.uk/menus, read 2026-10-06) lists with clearly different
# calories (5% or more), i.e. the guide looks out of date for them. Not corrected: left out until the guide matches.
HOLDBACK: dict[str, str] = {
    "Vegan - Spicy Tomato Dough Bites": "Guide prints 678 kcal per portion; askitalian.co.uk/menus lists 798 kcal (read 2026-10-06). Left out until ASK's guide and menu agree.",
    "Vegan - Pesto Dough Bites": "Guide prints 770 kcal per portion; askitalian.co.uk/menus lists 855 kcal (read 2026-10-06). Left out until ASK's guide and menu agree.",
    "Linguine con Frutti di Mare": "Guide prints 579 kcal per portion; askitalian.co.uk/menus lists 655 kcal (read 2026-10-06). Left out until ASK's guide and menu agree.",
    "Pollo Milanese With Potatoes": "Guide prints 1009 kcal per portion; askitalian.co.uk/menus lists 955 kcal (read 2026-10-06). Left out until ASK's guide and menu agree.",
    "Pollo Milanese With Chips": "Guide prints 1335 kcal per portion; askitalian.co.uk/menus lists 1260 kcal (read 2026-10-06). Left out until ASK's guide and menu agree.",
    "Zucchini Fritti with Garlic Mayo": "Guide prints 345 kcal per portion; askitalian.co.uk/menus lists 466 kcal (read 2026-10-06). Left out until ASK's guide and menu agree.",
}

NOTES = {
    "Balsamic Glazed Greens": "Printed kJ and kcal agree. kcal is 12 above 4P+4C+9F in both the per-100g and per-portion columns; fibre is not printed",
}
PORK = re.compile(r"\b(pepperoni|salami|chorizo|pancetta|prosciutto|ham|bacon|pork|sausages?|nduja|'nduja|pigs?|coppa)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|manzo)\b", re.I)


def tidy(printed: str, section: str) -> str:
    name = RENAME.get((section, printed), printed)
    name = re.sub(r"^'&", "&", name)  # a stray apostrophe before the ampersand
    addon = ADDON_OF.get((section, name))
    if addon:
        name = f"{addon}: {name}"
    return name[:1].upper() + name[1:]


def serving_from(name: str) -> str:
    m = re.search(r"\b(Small|Large|Regular)\b", name, re.I)
    if m:
        return m.group(1).capitalize()
    m = re.search(r"\b(\d+) ?ml\b", name, re.I)
    if m:
        return f"{m.group(1)} ml"
    return "1 scoop" if re.search(r"one scoop", name, re.I) else ""


def build_items(rows: list[dict], marks: dict) -> tuple[list[dict], list[str]]:
    items, log, seen = [], [], {}
    expired = [r for r in rows if r["section"] == EXPIRED_SECTION]
    if len(expired) != EXPECTED_EXPIRED:
        raise SystemExit(f"Expected {EXPECTED_EXPIRED} Summer Specials rows, found {len(expired)}: re-check which specials are over.")
    core = [r for r in rows if r["section"] != EXPIRED_SECTION]
    unknown = sorted({r["section"] for r in core if r["section"] not in SECTIONS})
    if unknown:
        raise SystemExit(f"Unknown menu section(s) {unknown}: the guide changed. Add them to SECTIONS in ask_italian.py after reading the PDF.")
    for r in core:
        printed, section = r["name"], r["section"]
        if re.match(r"'?&", printed) and (section, re.sub(r"^'&", "&", printed)) not in ADDON_OF:
            raise SystemExit(f"New '&' add-on row {printed!r} in {section}: say which dish it goes with in ADDON_OF.")
        category, rankable = SECTIONS[section]
        name = tidy(printed, section)
        key = re.sub(r"[^a-z0-9]", "", name.lower())
        p = r["portion"]
        if key in seen:
            first = seen[key]
            if first["portion"] != p:
                raise SystemExit(f"{name!r} is printed twice with different numbers (pages {first['page']} and {r['page']}): re-check.")
            log.append(f"dropped repeat of '{name}' (page {r['page']}, {r['section']}); identical to page {first['page']}")
            continue
        seen[key] = {"portion": p, "page": r["page"]}
        if section == "Kids Tiny Tums":
            rankable = printed.startswith("Mini Main")
        if name in NOT_RANKABLE or ADDON_OF.get((section, re.sub(r"^'&", "&", printed))):
            rankable = False
        mark = marks.get(azzurri_pdf.norm(printed))  # (vegetarian, vegan) from the allergen tables, or None
        tags = []
        if re.search(r"\bvegan\b|\bvegetarian\b", name, re.I) or (mark and (mark[0] or mark[1])):
            tags.append("vegetarian")
        if PORK.search(printed):
            tags.append("contains_pork")
        if BEEF.search(printed):
            tags.append("contains_beef")
        if "vegetarian" in tags and len(tags) > 1:
            raise SystemExit(f"{name!r} is marked vegetarian but its name says pork or beef: re-check the allergen tables.")
        if mark is None:
            log.append(f"no vegetarian mark found in the allergen tables for '{printed}' (no tag from them)")
        items.append({
            "name": name, "category": category, "serving": serving_from(name),
            "calories": p["kcal"], "protein_g": p["protein"], "carbs_g": p["carbs"], "fat_g": p["fat"],
            "sat_fat_g": p["sat"], "salt_g": p["salt"], "sugar_g": p["sugar"],
            "tags": "|".join(tags), "limited_time": False, "rankable": bool(rankable), "notes": NOTES.get(name, ""),
        })
    return items, log


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDF")
    ap.add_argument("--out", type=Path, default=None, help="default: data/source/ask-italian")
    args = ap.parse_args()

    result = azzurri_pdf.read_ask(args.pdf)
    if result["skipped"]:
        print("Lines with numbers that are not exactly 16 columns (not guessed):", *result["skipped"], sep="\n  ", file=sys.stderr)
        return 1
    rows = result["rows"]
    if len(rows) != EXPECTED_ROWS:
        print(f"The PDF has {len(rows)} nutrition rows but this script expects {EXPECTED_ROWS}. The menu or layout changed: "
              "re-check the PDF, then update EXPECTED_ROWS (and SECTIONS / ADDON_OF if needed).", file=sys.stderr)
        return 1
    res = azzurri_pdf.read_veg_marks(args.pdf, {azzurri_pdf.norm(r["name"]) for r in rows})
    if res["conflicts"]:
        print("Names printed with different vegetarian marks in the allergen tables (no tag given):", *res["conflicts"], sep="\n  ")
    items, log = build_items(rows, res["marks"])
    ids = {slug(i["name"]) for i in items}
    held = []
    for name, reason in HOLDBACK.items():
        if slug(name) not in ids:
            print(f"HOLDBACK names {name!r}, which is not in the guide any more: remove it.", file=sys.stderr)
            return 1
        held.append((slug(name), reason))
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="ASK Italian", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["ask italian", "ask italian restaurant"], items=items,
        note="From ASK Italian's Spring/Summer 2026 guide (V3, 10 Sep 2026), which does not list every dish on the current menu; dishes whose calories differ on askitalian.co.uk are left out. ASK says the figures are approximate and exclude substitutions and extras.",
        holdback=held, out=args.out)
    print(*log, sep="\n")
    veg = sum("vegetarian" in i["tags"] for i in items)
    pork = sum("contains_pork" in i["tags"] for i in items)
    beef = sum("contains_beef" in i["tags"] for i in items)
    print(f"wrote {len(items)} items ({len(held)} held back; {veg} vegetarian, {pork} pork, {beef} beef; "
          f"{EXPECTED_EXPIRED} expired Summer Specials left out) to {out} (PDF sha256 {sha256_file(args.pdf)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
