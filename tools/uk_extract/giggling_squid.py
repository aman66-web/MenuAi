#!/usr/bin/env python3
"""Build data/source/giggling-squid/ from Giggling Squid's official allergen and nutrition guide.

    python3 tools/uk_extract/giggling_squid.py --checked-on 2026-10-06 [--pages DIR] [--out DIR]

Source: https://viewthe.menu/kawv (the "allergens guide" linked from gigglingsquid.com/allergies; a 10kites page, one
menu per ?mguid=<menu id>). Pages are saved once into --pages (default: a temp folder; delete it to refresh) at one request
per second and read by tenkites_b.py; numbers are copied exactly as printed ("-" = not published = blank). Only names,
categories and the choice of menus are typed here. The script stops if a page changes layout, a nutrient column or section
appears that is not mapped, or the row count no longer matches EXPECTED_ROWS.
"""
from __future__ import annotations
import argparse
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "giggling-squid"
BASE_URL = "https://viewthe.menu/kawv"

# label, menu id, short name, long name  (order = which version of a clashing dish keeps the plain name)
MENUS = [
    ("allday", "11c21866-7868-4ec0-8c8a-e777ececea13", "all day menu", "all day menu"),
    ("kids", "20d2863a-54dc-4868-ada5-01afdfd34921", "kids menu", "kids menu"),
    ("bigsquids", "ae80ad4c-19b9-4a36-b933-0c072bd023cf", "Big Squids menu", "Big Squids menu"),
    ("drinks", "9005ec07-1907-4e85-871d-ebbc27759c83", "drinks menu", "drinks menu"),
    ("nongluten", "f15460de-758a-4375-8b61-c4559ac7e0db", "non gluten menu", "non gluten menu"),
    ("clickcollect", "368298f3-1bd8-4a3d-802d-d689766481e4", "click & collect", "click & collect menu"),
    ("deliveroo", "4898e290-c9b2-4c02-b5ec-70052fd82e9f", "Deliveroo", "Deliveroo menu"),
    ("kidsset", "", "kids set", "kids set"),  # pseudo menu: the kids' build-your-own set on the all day and kids pages
]
FETCH = {m[0]: m[1] for m in MENUS if m[1]}
# Left out on purpose: Billericay Menu (one restaurant), Festive Menu 2026 (seasonal, over before the app launches),
# Barclays Premier Dining Experience, Travel Trade Lunch Menu, Group Set Menu, Private Dining (set menus for groups/offers).
SKIPPED_SECTIONS = {"Giggling Bundles"}  # Deliveroo / click & collect bundles for 1, 2 or 4 people (combos of other dishes)

TOP = {
    "Thai Tapas Lunch Sets": "Lunch sets", "Nibbles & Bar Snacks": "Nibbles & bar snacks", "Sharing Platters": "Sharing platters",
    "Sides & Sharers": "Sides & sharers", "Small Plates & Sharers": "Small plates & sharers", "Noodles": "Noodles",
    "Stir Fries": "Stir fries", "Big Apetites": "Big appetites", "Seafood Specials": "Seafood specials",
    "Classic Curries": "Curries", "Rice & Roti": "Rice & roti", "Desserts": "Desserts", "Candy": "Desserts",
    "Showstoppers": "Showstoppers", "Lunch Boxes": "Lunch boxes", "Drinks": "Drinks",
    "Beer, Cider, Wine & Bubbles": "Drinks", "Something to Drink": "Drinks", "Kids Tapas Set": "Kids set picks",
    "Pick a Side": "Big Squids sides", "Choose your Mains": "Big Squids mains", "Dessert": "Desserts",
}
UNRANKABLE = {"Nibbles & bar snacks", "Sharing platters", "Desserts", "Drinks", "Kids set picks"}

# the prefix for a "Choose from :" block (options such as "Chicken", "Prawn") comes from its section
PREFIX = {
    "Pad Thai": "Pad Thai", "Drunken Noodles": "Drunken Noodles", "Wholesome Cashew": "Wholesome Cashew Stir Fry",
    "Chilli & Basil Gra Pao": "Chilli & Basil Gra Pao", "Thai Green": "Thai Green Curry", "Thai Red": "Thai Red Curry",
    "Paneang": "Paneang Curry", "Massaman": "Massaman Curry", "Rice & Roti": "",
}

# Rows the guide itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
HOLDBACK: dict[str, str] = {}

EXPECTED_ROWS = 681


def is_kids_set(rec: dict) -> bool:
    return any(c in ("Kids Set", "Kids Tapas Set") for c in rec["course"])


def menu_of(label: str, rec: dict) -> str:
    return "kidsset" if is_kids_set(rec) else label


def name_of(label: str, rec: dict) -> str:
    name, group = rec["name"], rec["group"].strip()
    if label == "drinks":  # drink options (mixers, cocktails) are printed with their full names
        return name
    prefix = ""
    if group.lower().startswith("choose from"):
        leaf = rec["course"][-1]
        if leaf not in PREFIX:
            raise SystemExit(f"unmapped 'Choose from' section {rec['course']!r}: add it to PREFIX after checking the page")
        prefix = PREFIX[leaf]
    elif group and not group.lower().startswith(("build", "choose")):
        prefix = group  # e.g. "Red Curry Lunch Box" with options Chicken / Prawns / Vegetable
    if prefix and tk.norm_name(prefix) not in tk.norm_name(name):
        name = f"{prefix} - {name}"
    return name


def category(label: str, rec: dict, name: str) -> str:
    if label == "drinks":
        return "Drinks"
    top = rec["course"][0]
    if top not in TOP:
        raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to TOP after checking the page")
    if is_kids_set(rec):
        return "Kids set picks"
    return TOP[top]


def skip(label: str, rec: dict) -> str | None:
    return "bundle for several people (a combo of other dishes)" if rec["course"][0] in SKIPPED_SECTIONS else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "giggling-squid-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    paths = tk.fetch_pages(BASE_URL, FETCH, args.pages)
    labels = list(FETCH)
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    rows, excluded, skipped, total = tk.collect_rows(labels, paths, "table", name_of, category, skip_fn=skip, menu_fn=menu_of)
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    tk.unique_names(rows, rank, short, long)
    items = tk.make_items(rows, long, UNRANKABLE)
    names = [i["name"] for i in items]
    missing = [n for n in HOLDBACK if n not in names]
    if missing:
        print(f"HOLDBACK names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Giggling Squid", cuisine="Thai",
        source_title="Giggling Squid allergens and nutrition guide (viewthe.menu/kawv; all day, kids, Big Squids, drinks, non gluten, "
                     "click & collect and Deliveroo menus, files dated 6 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["giggling squid", "the giggling squid"], items=items, out=args.out,
        holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note="Values are per dish as served. Dishes that differ on the non gluten, kids, click & collect or Deliveroo menus appear once per version; "
             "bundles for several people are not included.",
    )
    for label in labels:
        print(f"{label:14} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat, by menu:", by_menu)
    print(f"skipped (bundles): {len(skipped)}")
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
