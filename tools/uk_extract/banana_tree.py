#!/usr/bin/env python3
"""Build data/source/banana-tree/ from Banana Tree's official nutrition information.

    python3 tools/uk_extract/banana_tree.py --checked-on 2026-10-06 [--pages DIR] [--out DIR]

Source: https://menus.tenkites.com/thebigtg/bananatree04 (the menu bananatree.co.uk embeds; "Nutrition (per portion)" in each
dish's pop-up; one page per menu, chosen with ?mguid=<menu id>). Pages are saved once into --pages (default: a temp folder;
delete it to refresh) at one request per second and read by tenkites_b.py; numbers are copied exactly as printed. Only names,
categories and the choice of menus are typed here. The script stops if a page changes layout, a nutrient column or section
appears that is not mapped, or the row count no longer matches EXPECTED_ROWS.

Banana Tree's pop-ups hold options of a dish ("Chicken", "Prawns", "With Spicy Mayo"): an option of the dish's own choice
becomes "<dish> - <option>"; side options offered on top of a dish (rice, sauces, extra protein) keep their own name and sit
in "Options & add-ons". The other price-band pages (bananatree03/05/07/19 = Band A, other bands and Cardiff) were compared
with this one on 2026-10-06: every row is identical or a regrouping of rows already here, so they are not read.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "banana-tree"
BASE_URL = "https://menus.tenkites.com/thebigtg/bananatree04"

MENUS = [
    ("allday", "f7a2ddff-9d59-431a-beab-4e561c8df780", "all day menu", "all day menu"),
    ("lunch", "924e42f6-a87c-43ae-bd16-c43bf4136e79", "express lunch", "express lunch deal"),
    ("bowls", "c9ddd385-f85f-4850-acdf-538590c93d66", "bottomless bowls", "bottomless bowls menu"),
    ("brunch", "aa37a3c8-b691-4f22-ad85-3e417ff32afe", "bottomless brunch", "bottomless brunch menu"),
    ("kids", "ecd447c0-c5a9-4e3f-ab95-c9e4dee336d0", "kids menu", "kids menu"),
    ("desserts", "3b613c70-6799-44b5-99fa-8ec86e3255e8", "desserts menu", "desserts menu"),
    ("drinks", "ee6481bb-9880-471f-9d0c-9c4aeec22ecd", "drinks menu", "drinks menu"),
]

ALLDAY = {
    "For The Table": "For the table", "To Share": "To share", "Small Plates": "Small plates", "Laksa": "Laksa", "Ramen": "Ramen",
    "Wok Tossed Noodles": "Wok tossed noodles", "Regional Curries": "Regional curries", "More to Explore": "More to explore",
    "Sides and extras": "Sides and extras",
}
UNRANKABLE = {"For the table", "To share", "Options & add-ons", "Desserts", "Kids desserts", "Drinks", "Bottomless bowls: extras"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
HOLDBACK: dict[str, str] = {}

# Notes for rows the check report flags (calories vs 4P+4C+9F): entered as printed, explained here
NOTES = {
    "Berries & Cherries": "In the Beer + Cider section; calories (235) are higher than its macros allow (122), which fits alcohol calories. Entered as printed.",
    "Lychee Juice": "Calories (50) are lower than 4P+4C+9F (62), possibly fibre counted in carbohydrate. Entered as printed.",
}

# Each dish's pop-up prints "Contains:" / "May contain:" (naming the cereals and tree nuts) and the dish carries label ids;
# tenkites_b.allergens_from_rec checks they agree.
ALLERGEN_TITLE = "Banana Tree allergen and nutrition information (menus.tenkites.com/thebigtg/bananatree04, pages dated 6 October 2026)"

EXPECTED_ROWS = 281


def clean_group(g: str) -> str:
    """'Katsu Burger - 2.00 supplement' -> 'Katsu Burger' (a price note in the block's title)."""
    return re.sub(r"\s*-\s*£?\d+(\.\d+)?\s*(supplement)?\s*$", "", g).strip()


def key(s: str) -> str:
    return tk.norm_name(s).replace("phad thai", "pad thai")


def is_option_of_dish(rec: dict) -> bool:
    return rec["level"] == "sub" and rec.get("group_has_root", False)


def skip(label: str, rec: dict) -> str | None:
    if re.fullmatch(r"\([^)]*\)", rec["name"]):
        return "option container without a dish name"
    if label == "desserts" and rec["level"] == "sub":
        return "scoop options under an unnamed '(2 scoops)' block: serving not clear"
    return None


STOP = {"and", "the", "in", "with", "of", "a", "gluten", "free", "gf", "vegan", "veggie", "kids"}


def words(s: str) -> set[str]:
    return set(key(s).split()) - STOP


def name_of(label: str, rec: dict) -> str:
    """'<dish> - <option>' for an option of the dish's own choice, unless the option already names the dish."""
    name, group = rec["name"], clean_group(rec["group"])
    if not group or is_option_of_dish(rec):
        return name
    gw = words(group)
    if gw and len(gw & words(name)) >= min(2, len(gw)):
        return name
    tail = re.search(r"\s*\(([^)]*)\)\s*$", group)  # 'Pad Thai (Gluten-Free)' + 'Chicken (Gluten-Free)'
    if tail and f"({tail.group(1).lower()})" in name.lower():
        group = group[: tail.start()].strip()
    return f"{group} - {name}"


def same_dish(label: str, rec: dict, name: str) -> str:
    """The same option with the same numbers under differently worded dish titles on different menus is one dish."""
    return rec["name"] if rec["group"] and not is_option_of_dish(rec) else name


def category(label: str, rec: dict, name: str) -> str:
    top = rec["course"][0]
    if label == "drinks":
        return "Drinks"
    if label == "desserts":
        return "Desserts"
    if top == "Drinks":
        return "Drinks"
    if is_option_of_dish(rec):
        return "Options & add-ons"
    if label == "allday":
        return ALLDAY[top]
    if label == "bowls":
        if top.startswith("Start the Adventure"):
            return "Bottomless bowls: starters"
        if top.startswith("Unlock more flavour"):
            return "Bottomless bowls: mains"
        if top == "Extras":
            return "Bottomless bowls: extras"
    if label == "lunch" and top == "Mains":
        return "Express lunch mains"
    if label == "kids":
        return {"Mains": "Kids mains", "Dessert": "Kids desserts"}[top]
    if label == "brunch":
        if top == "Main courses":
            return "Bottomless brunch mains"
        if top.startswith("Add a Dessert"):
            return "Desserts"
    raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to category() after checking the page")


def allergens_of(label: str, rec: dict) -> dict | None:
    """The dish's allergens as the pop-up prints them, plus one rule of ours: when the page names cereals (or tree nuts) in BOTH its
    "Contains:" and its "May contain:" line ("Contains: Cereals (Barley)", "May contain: Cereals (Wheat)"), the allergen goes into
    may_contain as well, so common.write_allergens drops the named kinds and the app shows the generic allergen (naming only the
    contained kind would hide the may-contain warning for the others). tenkites_b.allergens_from_rec removes that overlap itself."""
    where = f"{label} {rec['name']}"
    found = tk.allergens_from_rec(rec, where)
    if found is None:
        return None
    printed_may = rec["allergen_src"].get("may") or ""
    may_keys = tk._printed_list(printed_may, where, None)[0] if printed_may else set()
    both = {k for k in ("gluten", "nuts") if k in found["contains"] and k in may_keys}
    if both:
        found = dict(found, may_contain=set(found["may_contain"]) | both)
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "banana-tree-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    paths = tk.fetch_pages(BASE_URL, {m[0]: m[1] for m in MENUS}, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    rows, excluded, skipped, total = tk.collect_rows(
        labels, paths, "modal", name_of, category, skip_fn=skip,
        key_fn=same_dish, veg_fn=lambda rec: bool({"V", "VG"} & set(rec["check"]["labels"])),
        text_fn=lambda rec: " ".join([] if is_option_of_dish(rec) else [clean_group(rec["group"])]) + " " + rec["name"] + " " + rec["desc"],
        allergen_fn=allergens_of)
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    tk.unique_names(rows, rank, short, long)
    for r in rows:
        if r["name"] in NOTES:
            r["note"] = NOTES[r["name"]]
    items = tk.make_items(rows, long, UNRANKABLE)
    names = [i["name"] for i in items]
    missing = [n for n in list(HOLDBACK) + list(NOTES) if n not in names]
    if missing:
        print(f"HOLDBACK names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Banana Tree", cuisine="Southeast Asian",
        source_title="Banana Tree nutrition information (menus.tenkites.com/thebigtg/bananatree04: all day, express lunch, bottomless "
                     "bowls, bottomless brunch, kids, desserts and drinks menus, \"Nutrition (per portion)\", pages dated 6 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["banana tree", "the banana tree", "banana tree restaurant"], items=items, out=args.out,
        holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note="Values are per portion as printed. Options offered on top of a dish (rice, sauces, extra protein) are listed "
             "separately under Options & add-ons.",
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    for label in labels:
        print(f"{label:10} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat, by menu:", by_menu)
    print("skipped:", [(s[0], s[1]) for s in skipped])
    print("\n".join(tk.ALLERGEN_NOTES))
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
