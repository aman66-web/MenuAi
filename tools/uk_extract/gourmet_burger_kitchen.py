#!/usr/bin/env python3
"""Build data/source/gourmet-burger-kitchen/ from Gourmet Burger Kitchen's official allergen and nutrition menus.

    python3 tools/uk_extract/gourmet_burger_kitchen.py --checked-on 2026-10-06 [--pages DIR] [--out DIR]

Source: https://menus.tenkites.com/brg/gourmetburgerkitchen (the allergen/dietary menu linked from gbk.co.uk/dietary-information;
one page per menu, chosen with ?mguid=<menu id>). Pages are saved once into --pages (default: a temp folder; delete it to
refresh) at one request per second and read by tenkites_b.py; numbers are copied exactly as printed. Only names, categories and
the choice of menus are typed here. The script stops if a page changes layout, a nutrient column or section appears that is not
mapped, the kcal in a dish's header disagrees with its table, or the row count no longer matches EXPECTED_ROWS.
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

CHAIN_ID = "gourmet-burger-kitchen"
BASE_URL = "https://menus.tenkites.com/brg/gourmetburgerkitchen"

MENUS = [
    ("main", "d5fc370e-d465-4c4a-a1a1-2a13082df292", "main menu", "main menu"),
    ("kids", "bc8cff19-f396-4a1a-838b-ebdd0c525886", "kids menu", "kids menu"),
    ("nogluten", "c34b2daf-3038-4810-8ea5-9e8752fb78cf", "gluten free", "no gluten menu"),
    ("drinks", "f706f564-6c2d-4b03-8762-78fc20a898a9", "drinks menu", "drinks menu"),
]
# Left out on purpose: the delivery-only "dark kitchen" menus and the "trial sites" menus linked from the same page.

SECTIONS = {
    "SMASHED BURGERS": "Smashed burgers", "GOURMET BURGERS": "Gourmet burgers", "CHICKEN BURGERS": "Chicken burgers",
    "BEAN OR BEYOND": "Bean or Beyond burgers", "GO NAKED": "Go naked (no bun)", "SMASHED, FRIES & DRINK": "Smashed, fries & drink",
    "GBK YOUR WAY": "GBK your way: extras", "HOUSE SAUCES": "Sauces", "SHARERS & SIDES": "Sharers & sides",
    "ICE CREAM": "Desserts", "CONDIMENTS": "Condiments", "MAINS": "Kids mains", "SIDES": "Kids sides", "DRINKS": "Drinks",
    "SMALL MILKSHAKES": "Kids shakes", "DESSERT": "Desserts", "DESSERTS": "Desserts", "SHAKES": "Shakes",
    "BEER AND CIDER": "Drinks", "DRAUGHT": "Drinks", "WINE": "Drinks", "COCKTAILS": "Drinks", "SPIRITS": "Drinks",
    "MIXERS": "Drinks", "SOFT DRINKS": "Drinks", "FRESH & FIZZY": "Drinks", "HOT DRINKS": "Drinks", "KIDS DESSERT": "Desserts",
}
UNRANKABLE = {"GBK your way: extras", "Sauces", "Condiments", "Desserts", "Drinks", "Shakes", "Kids shakes"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
OAT = "The menu prints {kj} kJ and {kcal} kcal, which cannot both be right; its own macros add up to about {est} kcal."
HOLDBACK: dict[str, str] = {
    "Americano (Oat Milk)": OAT.format(kj="183", kcal="438", est="43"),
    "Latte (Oat Milk)": OAT.format(kj="426", kcal="1,022", est="99"),
    "Cappuccino (Oat Milk)": OAT.format(kj="426", kcal="1,022", est="99"),
    "Flat White (Oat Milk)": OAT.format(kj="426", kcal="1,022", est="99"),
    "Hot Chocolate (Oat Milk)": OAT.format(kj="1,214", kcal="1,208", est="276"),
}
# Notes for rows the check report flags or that look odd: entered as printed, explained here
NOTES: dict[str, str] = {
    "Cruzcampo Sevilla 330ml": "Draught lager (4.4%): calories (129) are higher than its macros allow (45), which fits alcohol calories. Entered as printed.",
    "K Town Panko": "Printed with exactly the same numbers as K-Town - Grilled Chicken in the same section (the Panko versions elsewhere are higher). Entered as printed.",
}

EXPECTED_ROWS = 268


def skip(label: str, rec: dict) -> str | None:
    if rec["name"].rstrip().endswith("*"):
        return "refillable soft drink ('* = selected refillable option'): serving not stated"
    if rec["course"][-1] == "CONDIMENTS" and "Dip Pot" not in rec["name"]:
        return "table condiment (bottle or shaker): serving not defined"
    return None


def name_of(label: str, rec: dict) -> str:
    """The printed name; the one-word names in the shake and ice cream sections get their product name."""
    name, sec = rec["name"], section(rec)
    if sec == "SHAKES" and not name.startswith("Add"):
        return f"{name} shake"
    if sec in ("ICE CREAM", "DESSERTS") and name == "Vanilla":
        return "Vanilla ice cream"
    return name


def section(rec: dict) -> str:
    sec = rec["course"][-1]
    return sec[3:] if sec.startswith("GF ") else sec


def category(label: str, rec: dict, name: str) -> str:
    raw = rec["course"][-1]
    if raw == "GF KIDS MENU":  # one mixed section: burgers, a salad, drinks and shakes
        if "Shake" in rec["name"]:
            return "Kids shakes"
        if "Fruit Shoot" in rec["name"] or "Water" in rec["name"]:
            return "Drinks"
        return "Kids sides" if "Salad" in rec["name"] else "Kids mains"
    sec = section(rec)
    if sec not in SECTIONS:
        raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to SECTIONS after checking the page")
    return SECTIONS[sec]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "gbk-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    paths = tk.fetch_pages(BASE_URL, {m[0]: m[1] for m in MENUS}, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    # the kcal printed in each dish's header must equal the kcal in its table (a built-in check on the reader)
    for label in labels:
        for rec in tk.read_menu(paths[label])[1]:
            head = re.sub(r"[^0-9]", "", rec["check"]["header_energy"])
            table = rec["nutrients"].get("Energy (kCal)", "-")
            if table != "-" and head != tk.number(table):
                raise SystemExit(f"{label}: {rec['name']!r} header says {rec['check']['header_energy']!r}, table says {table!r}")

    rows, excluded, skipped, total = tk.collect_rows(labels, paths, "perfect", name_of, category,
                                                     skip_fn=skip)
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    for r in rows:
        r["where"] = r["where"].title().removeprefix("Gf ")
    tk.unique_names(rows, rank, short, long)
    for r in rows:
        if r["name"] in NOTES:
            r["note"] = NOTES[r["name"]]
    items = tk.make_items(rows, long, UNRANKABLE)
    names = [i["name"] for i in items]
    missing = [n for n in list(HOLDBACK) + list(NOTES) if n not in names]
    if missing:
        print(f"HOLDBACK/NOTES names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Gourmet Burger Kitchen", cuisine="Burgers",
        source_title="Gourmet Burger Kitchen allergen and nutrition menus (menus.tenkites.com/brg/gourmetburgerkitchen: main, kids, "
                     "drinks and no gluten menus, files dated 6 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["gbk", "gourmet burger kitchen", "gbk burgers"], items=items, out=args.out,
        holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note="GBK calculates these values using typical weights and measures. Dishes that differ on the no gluten, kids or drinks menus appear once per version.",
    )
    for label in labels:
        print(f"{label:9} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat, by menu:", by_menu)
    print("skipped:", [(s[0], s[1]) for s in skipped])
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
