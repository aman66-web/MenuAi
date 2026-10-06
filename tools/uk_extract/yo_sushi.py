#!/usr/bin/env python3
"""Build data/source/yo-sushi/ from Yo! Sushi's own allergen & nutrition page for its Dine-in menu (hosted by Ten Kites).

    python3 tools/uk_extract/yo_sushi.py --pages DIR --checked-on 2026-10-06 [--fetch]

DIR holds the saved page yosushi.html (15 MB); --fetch downloads it first. The page is linked as "Restaurant menu" from
https://yosushi.com/legal/allergen-information. Numbers are copied from each dish's "Nutrition values per serving" cells
exactly as printed (kcal, fat, saturates, sugars, salt, protein, carbohydrate, fibre; kJ and starch are not used).
Only the section choices and the name tidying below are typed by hand. If the page gains or loses dishes, or a new
section appears, the run stops so a human re-checks. Yo! Sushi prints no date on the page.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "yo-sushi"
URL = "https://menus.tenkites.com/yosushi/allergenpageyosushi"
FILE = "yosushi.html"
EXPECTED_ROWS = 108

# printed section -> (category shown, rankable, limited_time) or None = left out (reason in EXCLUDED).
SECTIONS = {
    "Curry": ("Curry", True, False), "Rice": ("Rice", True, False), "Ramen": ("Ramen", True, False),
    "Noodles": ("Noodles", True, False), "Street food and sharing": ("Street food", True, False),
    "Fish": ("Sushi & fish", True, False), "Yasai": ("Yasai (vegetable)", True, False), "Meat": ("Meat", True, False),
    "To share": ("To share", False, False), "Desserts": ("Desserts", False, False), "Condiments": ("Condiments", False, False),
    "Sides": ("Sides", True, False), "Limited time": ("Limited time", True, True),
    "Selfridges & Heathrow": None, "Selfridges": None, "Heathrow": None,
}
EXCLUDED = {"Selfridges & Heathrow": "dishes sold only at the Selfridges and Heathrow sites",
            "Selfridges": "dishes sold only at the Selfridges site", "Heathrow": "dishes sold only at Heathrow"}
# rows that are not a meal on their own although they sit in a rankable section
NOT_RANKABLE = {"curry sauce"}
# printed numbers that look odd; they are entered exactly as printed
ODD = {"Pulled Shiitake Teriyaki Donburi": "Fibre is printed as 27.0 g, far above the other dishes (7.6 g for the fried rice)"}
SOURCE_TITLE = "Yo! Sushi Allergen & Nutrition Information, Dine-in menu (no date printed on the page; read 2026-10-06)"
NOTE = ("Figures are per serving from Yo! Sushi's own nutrition page for its Dine-in menu (hosted by Ten Kites), which "
        "prints no date. Dishes sold only at Selfridges and Heathrow are left out.")


def tidy_name(raw: str) -> tuple[str, str]:
    """('chicken katsu curry large') -> ('Chicken Katsu Curry (large)', 'Large'): capitalisation tidied, size in brackets."""
    name, serving = raw.strip(), ""
    m = re.match(r"^(.*\S)\s+(large|regular)$", name, re.I)
    if m:
        name, serving = f"{m.group(1)} ({m.group(2).lower()})", m.group(2).capitalize()
    return tk.tidy_case(name), serving


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    rows = tk.read_table_layout((pages_dir / FILE).read_text(encoding="utf-8"))
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The page has {len(rows)} dishes but this script expects {EXPECTED_ROWS}: the menu changed, "
                         "re-check SECTIONS and EXPECTED_ROWS before running again.")
    items, report = [], []
    left_out: dict[str, int] = {}
    for r in rows:
        if r["section"] not in SECTIONS:
            raise SystemExit(f"new section {r['section']!r}: add it to SECTIONS (category, rankable, limited_time) or None.")
        spec = SECTIONS[r["section"]]
        if spec is None:
            left_out[r["section"]] = left_out.get(r["section"], 0) + 1
            continue
        nums, missing = tk.numbers(r["nutrients"], r["name"])
        if missing:
            report.append(f"skipped {r['name']!r}: {missing} not printed")
            continue
        name, serving = tidy_name(r["name"])
        category, rankable, limited = spec
        tags = ["vegetarian"] if r["vegetarian"] else []
        meat, unspecified = tk.meat_tags(r["name"], r["desc"], r["ingredients"], vegetarian=bool(r["vegetarian"]))
        if unspecified:
            report.append(f"meat type not stated: {name}")
        items.append({"id": slug(name), "name": name, "category": category, "serving": serving, **nums,
                      "tags": "|".join(tags + meat), "limited_time": limited,
                      "rankable": rankable and r["name"].lower() not in NOT_RANKABLE, "notes": ""})
    report += [f"left out {n} dishes in {s!r}: {EXCLUDED[s]}" for s, n in left_out.items()]
    kept, dropped = tk.dedupe_items(items)
    report += [f"dropped exact duplicate: {n}" for n in dropped]
    names = [i["name"] for i in kept]
    for it in kept:
        notes = tk.annotate(it)
        if names.count(it["name"]) > 1:
            notes.append("The page prints two dishes with this name and different numbers; both are kept")
        if it["name"] in ODD:
            notes.append(ODD[it["name"]])
        it["notes"] = "; ".join(notes)
        report += [f"{it['name']}: {n}" for n in notes]
    return kept, [], report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the page with the live menu")
    ap.add_argument("--fetch", action="store_true", help="download the page into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        tk.fetch(URL, args.pages / FILE)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Yo! Sushi", cuisine="Japanese", source_title=SOURCE_TITLE, source_url=URL,
                             checked_on=args.checked_on, aliases=["yo sushi", "yo! sushi", "yosushi"], items=items,
                             out=args.out, note=NOTE, holdback=holdback)
    print(f"{FILE} sha256 {tk.sha256_text_file(args.pages / FILE)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
