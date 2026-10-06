#!/usr/bin/env python3
"""Build data/source/carluccios/ from Carluccio's own allergen & nutrition page (hosted by Ten Kites).

    python3 tools/uk_extract/carluccios.py --pages DIR --checked-on 2026-10-06 [--fetch]

DIR holds the saved hub page carluccios_hub.html (https://menus.tenkites.com/brg/carluccios, the page carluccios.com
embeds on its menu page); --fetch downloads it first. The hub opens on the All Day Menu; each restaurant has its own page
(?sitecode=...) but the Reading page carries the same All Day Menu with identical figures, so the hub is used once and
the restaurants are not read one by one. The Pizza, Kids, Dessert, Gluten Free and other menus the page lists are separate
pages and are not part of this run.

Numbers are copied from each dish's "Nutritional values (per menu item)" pop-up exactly as printed (kcal, protein, carb,
sugars, fat, saturates, fibre, salt; kJ is not used). The steak, its sides and the four sauces are read from the dish data
the same page embeds, which carries the same figures the page's own nutrition pop-up shows. Only names, categories and
the choices below are typed by hand. If the page gains or loses dishes, or a new section appears, the run stops.
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "carluccios"
URL = "https://menus.tenkites.com/brg/carluccios"
FILE = "carluccios_hub.html"
EXPECTED_ROWS = 48  # 41 dishes + the steak with its choices (1 + 2 sides + 4 sauces)

# printed section -> (category shown, rankable)
SECTIONS = {
    "OLIVES & BREAD": ("Olives & bread", True), "SMALL PLATES & SHARERS": ("Small plates & sharers", True),
    "PASTA & RISOTTO": ("Pasta & risotto", True), "GRILL & MAINS": ("Grill & mains", True), "SIDES": ("Sides", True),
    "Choose your side": ("Sides", True), "Choose a sauce": ("Sauces", False),
}
# not an order on their own
NOT_RANKABLE = {"Add Chicken": "an add-on to the risotto", "Add Truffle Oil": "an add-on to the risotto",
                "Add Extra Pancetta": "an add-on", "Antipasti Board (To Share)": "a sharing board",
                "Sirloin 8oz": "the steak only: the side is chosen and printed separately"}
NOTES = {"Sirloin 8oz": "The steak only: the side (fries or roasted potatoes, listed under Sides) and any sauce are chosen separately",
         "Antipasti Board (To Share)": "A sharing board",
         "Add Chicken": "Printed as an add-on to the Risotto ai Funghi", "Add Truffle Oil": "Printed as an add-on to the Risotto ai Funghi",
         "Add Extra Pancetta": "An add-on"}
SOURCE_TITLE = "Carluccio's Allergen & Nutrition Information, All Day Menu (hub page, no date printed; read 2026-10-06)"
NOTE = ("Figures are per menu item from Carluccio's All Day Menu, calculated by the chain from typical weights and measures. "
        "Its separate Pizza, Kids, Dessert and other menus are not included; dishes marked * are on the set menu.")


def tidy(raw: str) -> tuple[str, str]:
    """Drop the set-menu star and put a size in brackets: 'Calamari Fritti Small' -> ('Calamari Fritti (small)', 'Small')."""
    name = re.sub(r"\s*\*\s*$", "", raw.strip())
    m = re.match(r"^(.*\S)\s+(Small|Large)$", name)
    if m:
        return f"{m.group(1)} ({m.group(2).lower()})", m.group(2)
    return name, ""


def suitable_for_vegetarians(text: str) -> bool:
    """True when the chain's own 'Suitable for:' line lists Vegetarian or Vegan."""
    m = re.search(r"Suitable for:(.*?)(?:Contains:|May contain:|$)", text)
    return bool(m and re.search(r"Vegetarian|Vegan", m.group(1)))


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    rows = tk.read_popover_layout((pages_dir / FILE).read_text(encoding="utf-8"))
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The page has {len(rows)} dishes but this script expects {EXPECTED_ROWS}: the menu changed, "
                         "re-check SECTIONS and EXPECTED_ROWS before running again.")
    items, report = [], []
    for r in rows:
        if r["section"] not in SECTIONS:
            raise SystemExit(f"new section {r['section']!r}: add it to SECTIONS (category, rankable).")
        category, rankable = SECTIONS[r["section"]]
        name, serving = tidy(r["name"])
        nums, missing = tk.numbers(r["nutrients"], name)
        if missing:
            report.append(f"skipped {name!r}: {missing} not printed")
            continue
        shown = re.sub(r"[^\d.]", "", r["energy_shown"])
        if shown and shown != nums["calories"]:
            report.append(f"{name}: kcal shown beside the dish ({r['energy_shown']}) differs from the table ({nums['calories']})")
        vegetarian = suitable_for_vegetarians(r["suitable"])
        # an add-on's description names the dish it goes with ("Add ... to your Steak"), so only its own name is read
        add_on = category == "Sauces" or name.startswith("Add ")
        meat, unspecified = tk.meat_tags(name, "" if add_on else r["desc"], vegetarian=vegetarian)
        if unspecified:
            report.append(f"meat type not stated: {name}")
        items.append({"id": slug(name), "name": name, "category": category, "serving": serving, **nums,
                      "tags": "|".join((["vegetarian"] if vegetarian else []) + meat),
                      "rankable": rankable and name not in NOT_RANKABLE, "notes": NOTES.get(name, "")})
    kept, dropped = tk.dedupe_items(items)
    report += [f"dropped exact duplicate: {n}" for n in dropped]
    names = [i["name"] for i in kept]
    for it in kept:
        extra = tk.annotate(it)
        if names.count(it["name"]) > 1:
            extra.append("Another row has this name with different numbers; both are kept")
        if extra:
            it["notes"] = "; ".join(filter(None, [it["notes"], *extra]))
            report += [f"{it['name']}: {n}" for n in extra]
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
    out = write_chain_folder(chain_id=CHAIN_ID, name="Carluccio's", cuisine="Italian", source_title=SOURCE_TITLE, source_url=URL,
                             checked_on=args.checked_on, aliases=["carluccio's", "carluccios"], items=items, out=args.out,
                             note=NOTE, holdback=holdback)
    print(f"{FILE} sha256 {tk.sha256_text_file(args.pages / FILE)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
