#!/usr/bin/env python3
"""Build data/source/yo-to-go/ from YO! Sushi's own allergen & nutrition page for its Tesco kiosks ("YO! To Go!").

    python3 -I tools/uk_extract/yo_to_go.py --pages DIR --checked-on 2026-10-12 [--fetch]

DIR holds the saved page kiosk02.html (about 7 MB); --fetch downloads it first. The page is linked as "Tesco kiosk menu" from
https://yosushi.com/allergens (YO! Sushi's own Allergen & nutrition page). The kiosks are counters inside Tesco stores, registered
with councils as "Yo! To Go!" (found through the Food Standards Agency's hygiene-rating open data, 12 October 2026). Numbers are
copied from each product's "Nutrition values per serving" cells exactly as printed (kcal, kJ, fat, saturates, sugars, salt, protein,
carbohydrate, fibre; starch is not used). Only the section choices and the name tidying below are typed by hand. If the page gains
or loses products, or a new section appears, the run stops so a human re-checks. The page prints no date (the file name of its
printable copy carries the day it is opened, not a version). The Ireland kiosk menu is a separate page and is not used.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "yo-to-go"
NAME = "YO! To Go"
URL = "https://menus.tenkites.com/yosushi/kiosk02"
LINKED_FROM = "https://yosushi.com/allergens"
FILE = "kiosk02.html"
EXPECTED_ROWS = 70

# printed section -> (category shown, rankable)
SECTIONS = {
    "Classic Rolls": ("Sushi rolls", True), "Specialty Rolls": ("Sushi rolls", True),
    "Nigiri": ("Nigiri", True), "Value Bento": ("Bento & sushi sets", True), "Combo": ("Bento & sushi sets", True),
    "Combo+": ("Bento & sushi sets", True), "Sides & Snacks": ("Sides & snacks", True),
    "Heat to Eat - Mains": ("Hot meals", True), "Heat to Eat - Bites": ("Hot chicken bites", True),
    "Heat to Eat - Sides": ("Hot sides", True), "Game time": ("Game time", True),
    # sharing platters (about 700-1,900 kcal, several people), and desserts are not suggested as a meal
    "Sharers": ("Sharers", False), "Desserts": ("Desserts", False),
}
# heating instructions printed as part of some names ("- Heat me first!") and a code ("A1"): not part of the product's name
NAME_TAILS = re.compile(r"\s*(?:-\s*heat me (?:first|up)!?|\bA1)\s*$", re.I)
# Figures that repeat another product's: "mango cheesecake mochi" and "Raspberry White Chocolate Mochi" print the same kJ, kcal,
# fat, saturates, sugars, protein, carbohydrate and fibre (only salt differs, 0.2 vs 0.0) under different recipe ids, so one of
# them is very likely a copy; which one can't be told, so both are held back (never chosen between).
REPEATED = {"Mango Cheesecake Mochi", "Raspberry White Chocolate Mochi"}
ALLERGEN_COLUMNS = ["Cereals with Gluten", "Tree Nuts", "Peanuts", "Eggs", "Milk", "Fish", "Crustaceans", "Molluscs", "Celery",
                    "Mustard", "Sesame", "Soyabeans", "Sulphur Dioxide / Sulphites", "Lupin"]
ALLERGEN_EXTRA = {"soyabeans": ("soya", None), "sulphur dioxide / sulphites": ("sulphites", None)}
SOURCE_TITLE = "YO! Sushi Allergen & Nutrition Information, Tesco kiosk menu (Ten Kites page linked from yosushi.com/allergens; no date printed, read 2026-10-12)"
ALLERGEN_TITLE = SOURCE_TITLE
NOTE = ("Figures are per pack from YO! Sushi's own nutrition page for its kiosks in Tesco stores (hosted by Ten Kites), which "
        "prints no date. Products whose printed kJ and kcal disagree are left out.")


def tidy_name(raw: str) -> str:
    name = NAME_TAILS.sub("", raw.strip())
    return tk.tidy_case(name)


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    rows = tk.read_table_layout((pages_dir / FILE).read_text(encoding="utf-8"))
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The page has {len(rows)} products but this script expects {EXPECTED_ROWS}: the menu changed, "
                         "re-check SECTIONS and EXPECTED_ROWS before running again.")
    items, report = [], []
    for r in rows:
        if r["section"] not in SECTIONS:
            raise SystemExit(f"new section {r['section']!r}: add it to SECTIONS (category, rankable).")
        if r["per"] != "serving":
            raise SystemExit(f"{r['name']!r} is printed per {r['per']!r}, not per serving")
        nums, missing = tk.numbers(r["nutrients"], r["name"], extras=True)
        if missing:
            report.append(f"skipped {r['name']!r}: {missing} not printed")
            continue
        name = tidy_name(r["name"])
        category, rankable = SECTIONS[r["section"]]
        tags = ["vegetarian"] if r["vegetarian"] else []
        meat, unspecified = tk.meat_tags(r["name"], r["desc"], r["ingredients"], vegetarian=bool(r["vegetarian"]))
        if unspecified:
            report.append(f"meat type not stated: {name}")
        items.append({"id": slug(name), "name": name, "category": category, "serving": "1 pack", **nums,
                      "tags": "|".join(tags + meat), "limited_time": False, "rankable": rankable, "notes": "",
                      "allergens": tk.allergens_from_columns(r, f"{FILE} {r['name']}", ALLERGEN_COLUMNS, ALLERGEN_EXTRA)})
    report += [f"allergens: {n!r} is printed twice with the same numbers but different allergens: not used"
               for n in tk.allergen_conflicts(items)]
    report += [f"allergens: no allergen information to read for {i['name']!r}" for i in items if i["allergens"] is None]
    kept, dropped = tk.dedupe_items(items)
    report += [f"dropped exact duplicate: {n}" for n in dropped]
    for it in kept:
        notes = tk.annotate(it)
        it["notes"] = "; ".join(notes)
        report += [f"{it['name']}: {n}" for n in notes]
    holds: list[tuple[str, str]] = []
    seen: dict[str, int] = {}   # same ids as common.write_chain_folder: the second product of a repeated name is "<id>-2"
    names = [i["name"] for i in kept]
    for it in kept:
        seen[it["id"]] = seen.get(it["id"], 0) + 1
        hold_id = it["id"] if seen[it["id"]] == 1 else f"{it['id']}-{seen[it['id']]}"
        if names.count(it["name"]) > 1:
            holds.append((hold_id, "The page prints two products with this name and different figures; neither is chosen."))
            continue
        if it["name"] in REPEATED:
            holds.append((hold_id, "Its figures repeat another product's (mango cheesecake mochi and raspberry white chocolate mochi print the "
                                   "same energy, fat, sugars, protein and carbohydrate), so one is likely copied and neither is published."))
            continue
        salt = float(it["salt_g"]) if it.get("salt_g") not in ("", None) else 0.0
        if salt > 50:
            # Chicken Katsu Curry 900.8 g and Pumpkin Katsu Curry Rice Bowl 900.1 g: more salt than the whole meal weighs, a misprint
            # that can't be corrected from here, so the product is held back.
            holds.append((hold_id, f"The page prints {salt:g} g of salt for this product, more than the whole pack weighs, so its "
                                   "figures cannot be trusted."))
            continue
        kcal, kj = float(it["calories"]), float(str(it["energy_kj"]).replace(",", ""))
        # Same gate as yo_sushi.py and tools/audit/accuracy_audit.py: kcal x 4.184 against the printed kJ, outside 0.93-1.07.
        if kcal >= 20 and not 0.93 <= kj / (kcal * 4.184) <= 1.07:
            holds.append((hold_id, f"The page prints {kj:g} kJ and {kcal:g} kcal for this product, which disagree "
                                   f"({kcal:g} kcal is about {kcal * 4.184:.0f} kJ), so its energy cannot be trusted."))
    report += [f"held back: {i}: {why[:70]}" for i, why in holds]
    return kept, holds, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was read")
    ap.add_argument("--fetch", action="store_true", help="download the page into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        tk.fetch(URL, args.pages / FILE)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name=NAME, cuisine="Japanese", source_title=SOURCE_TITLE, source_url=URL,
                             checked_on=args.checked_on, aliases=["yo to go", "yo! to go", "yo! to go!", "yo sushi tesco"],
                             items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    print(f"{FILE} sha256 {tk.sha256_text_file(args.pages / FILE)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
