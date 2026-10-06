#!/usr/bin/env python3
"""Build data/source/farmer-j/ from Farmer J's own allergen & nutrition pages (hosted by Ten Kites).

    python3 tools/uk_extract/farmer_j.py --pages DIR --checked-on 2026-10-06 [--fetch]

DIR holds the three saved pages (farmerj_breakfast.html, farmerj_lunch.html, farmerj_allday.html); --fetch downloads
them first (one request per second). Numbers are copied from each dish's "Nutrition values per serving" cells exactly as
printed (kcal, fat, saturates, carbohydrate, sugars, fibre, protein, salt; kJ is not used). Only the section names and
the choices in SECTIONS below are typed by hand. If a page gains or loses dishes, or a new section appears, the run stops
so a human re-checks. The three pages are the three menus linked from https://www.farmerj.com/nutrition-allergens/.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "farmer-j"
BASE = "https://menus.tenkites.com/farmerjuk/farmerjallergypages"
PAGES = {  # file name -> (url, dishes expected on the page)
    "farmerj_breakfast.html": (BASE, 20),
    "farmerj_lunch.html": (BASE + "?mguid=6d41200b-d23a-43f8-a888-0cf03b6d0753", 42),
    "farmerj_allday.html": (BASE + "?mguid=5d133f8d-c028-43a4-ae20-f32607011cc0", 12),
}
# printed section -> (category shown, rankable). Parts of a tray (mains, bases, sides, sauces, toppings), extras, treats
# and drinks are not suggested as an order on their own.
SECTIONS = {
    "Toasts": ("Toasts", True), "Rolls": ("Rolls", True), "Egg Pots": ("Egg pots", True), "Porridge": ("Porridge", True),
    "Cold Pots": ("Cold pots", True), "Baked Goods": ("Baked goods", False), "Breakfast Extras": ("Breakfast extras", False),
    "Mains": ("Mains", False), "Bases": ("Bases", False), "Warm Sides": ("Warm sides", False), "Salads": ("Salads", True),
    "Sauces": ("Sauces", False), "Toppings & Extras": ("Toppings & extras", False),
    "Set Fieldtrays": ("Set fieldtrays", True), "Set Fieldbowls": ("Set fieldbowls", True),
    "Snacks": ("Snacks", False), "SEASONAL DRINKS": ("Seasonal drinks", False),
}
# The same pages print each dish's 14 allergen columns, a "Contains:" line naming cereals and nuts, and "May contain traces of".
ALLERGEN_TITLE = "Farmer J Allergen & Nutrition pages (Ten Kites)"
SOURCE_TITLE = "Farmer J Allergen & Nutrition pages: Breakfast, Lunch & Dinner and All Day menus (September 2026)"
NOTE = ("Figures are per serving from Farmer J's own nutrition pages, which say values and weights are averages and "
        "salad figures include the dressing. Mains, bases and sides are the parts of a tray, so they are not suggested on their own.")


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    items, report = [], []
    for fname, (_, expected) in PAGES.items():
        text = (pages_dir / fname).read_text(encoding="utf-8")
        rows = tk.read_table_layout(text)
        if len(rows) != expected:
            raise SystemExit(f"{fname} has {len(rows)} dishes but this script expects {expected}: the menu changed, "
                             "re-check SECTIONS and the expected counts before running again.")
        for r in rows:
            if r["section"] not in SECTIONS:
                raise SystemExit(f"{fname}: new section {r['section']!r}: add it to SECTIONS (category, rankable).")
            nums, missing = tk.numbers(r["nutrients"], f"{fname} {r['name']}")
            if missing:
                report.append(f"skipped {r['name']!r}: {missing} not printed")
                continue
            category, rankable = SECTIONS[r["section"]]
            tags = ["vegetarian"] if r["vegetarian"] else []
            meat, unspecified = tk.meat_tags(r["name"], r["desc"], r["ingredients"], vegetarian=bool(r["vegetarian"]))
            if unspecified:
                report.append(f"meat type not stated: {r['name']}")
            items.append({"id": slug(r["name"]), "name": r["name"], "category": category, "serving": "", **nums,
                          "tags": "|".join(tags + meat), "rankable": rankable, "notes": "",
                          "allergens": tk.allergens_from_row(r, f"{fname} {r['name']}")})
    kept, dropped = tk.dedupe_items(items)
    report += [f"dropped exact duplicate: {n}" for n in dropped]
    for it in kept:
        notes = tk.annotate(it)
        it["notes"] = "; ".join(notes)
        report += [f"{it['name']}: {n}" for n in notes]
    return kept, [], report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the pages with the live menu")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for fname, (url, _) in PAGES.items():
            tk.fetch(url, args.pages / fname)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Farmer J", cuisine="Bowls", source_title=SOURCE_TITLE, source_url=BASE,
                             checked_on=args.checked_on, aliases=["farmer j", "farmer j's", "farmer js"], items=items,
                             out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": BASE, "checked_on": args.checked_on, "may_contain_published": True})
    for fname in PAGES:
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
