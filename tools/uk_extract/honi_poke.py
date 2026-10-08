#!/usr/bin/env python3
"""Build data/source/honi-poke/ from Honi Poke's own Nutritional Calculator (honipoke.com, a Webflow site). Python 3.9.

    python3 -I tools/uk_extract/honi_poke.py --pages DIR --checked-on 2026-10-08 --fetch [--playwright-dir D] [--chrome PATH]
    python3 -I tools/uk_extract/honi_poke.py --pages DIR --checked-on 2026-10-08            # re-read pages already in DIR

--fetch downloads into DIR (robots.txt first; one request per page, one second apart; see honi_poke_page.py) and needs Node,
playwright-core and Chromium because the calculator's table is drawn by the page's own script.

WHAT THE SOURCE PRINTS. https://www.honipoke.com/nutritional-calculator (footed "(c) 2026 HONI POKE", no other date) shows, per whole
bowl as sold, in three tabs (Signature Bowls = signature bowls, warm bowls and poke salads; Ramen; Sides): a table row with kcal,
protein, carbs and fat as whole numbers, and, when a bowl is selected, a panel with kcal, protein, carbs, fat and fibre (one decimal)
and sodium in mg. It prints no sugars, saturates, salt, kJ, serving weight or per-item portion. This script copies the PANEL values
exactly as displayed (protein, carbs and fat to one decimal) and checks every one against the table row's whole number.

HOW THE PAGE GETS ITS NUMBERS (reported to the founder; nothing here recomputes it). The page's script holds per-100 g ingredient data
and portion weights, adds them up for each bowl and then multiplies the sums before display: energy x0.85, protein x1.10, carbohydrate
x0.90, fat x0.90 (fibre and sodium unscaled). So a bowl's kcal is not 4P+4C+9F of its displayed macros (typically 5-20% apart). The
displayed totals are what the chain publishes, so they are copied as shown; the energy gap is explained in note.txt.

WHAT IS PUBLISHED. The 26 finished dishes the calculator lists: 9 signature bowls, 3 warm bowls, 4 poke salads, 4 ramen, 6 sides.
Not published, and why:
  * Build Your Own, and the Extra protein / toppings / crunchies / sauce add-ons: the page prints no per-ingredient macros. It prints
    only a total that the script recomputes for whatever is picked (and a per-ingredient kcal list that is not scaled and does not add
    up to the displayed total), and there is no default recipe. Components, modifiers and recipes would be numbers we derived, so none.
  * Dishes whose own dish page on the same website prints a different calorie figure (docs/UK_DATA_PLAYBOOK.md: hold back, never
    choose between): for each published dish whose /menu/<dish> page prints a "Cal" number that differs from the calculator's kcal by
    more than 10%, the dish is listed in holdback.csv with both figures. (Seen 2026-10-08: Honi Salmon 450 vs 638, Ahi Tuna 450 vs 572,
    Sriracha Mayo Salmon 450 vs 659, Avocado & Mango 400 vs 542, Teriyaki Chicken 300 vs 507, Chicken Katsu Curry 500 vs 836.) Dish
    pages with an empty Cal field are not a contradiction. Dishes that appear only on the menu (Poke Burritos, sushi sets, gyoza,
    edamame, drinks, desserts) are not in the calculator and are not listed.
Allergens are LINK ONLY. The chain's allergen matrix (https://www.honipoke.com/allergens, "Review date: 05/08/2026") has no row under
the calculator's name for several items: Chicken Teriyaki is "Teriyaki Chicken" and Tofu Teriyaki is "Teriyaki Tofu" there, the ramen
carry "Ramen", Guacamole and Japanese Salad have no row of that name ("Guacamole with Tortilla Chips", "Japanese Cabbage Salad"), and
Crab Salad, Salmon Tartare, Seaweed Salad and Tortilla Chips appear only as build-your-own components (proteins, toppings, bases) or
as "... with Tortilla Chips" grab-and-go sides, not as the calculator's sides. The matrix also disagrees with the chain's own dish
pages for several dishes (the Sriracha Mayo Salmon page lists no crustaceans, the matrix does; the California page lists gluten, the
matrix does not; the pages for Pacific Tuna and Seoul Fire Chicken list "No items found."). Allergens are safety information: no name
matching, no choosing between the chain's two lists, so only the guide's link is published (the calculator itself links to it).
Tags: `vegetarian` where the chain's own listing page marks the dish with its Vegetarian icon; `contains_beef` where the name or
calculator description says beef/brisket. Nothing else is inferred.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).parent))
import honi_poke_page as hp  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "honi-poke"
SOURCE_URL = hp.HOST + hp.CALC_PATH
SOURCE_TITLE_FMT = "Honi Poke Nutritional Calculator (accessed {date}, no date shown)"
ALLERGEN_GUIDE_URL = hp.HOST + hp.ALLERGENS_PATH
ALLERGEN_TITLE_FMT = "Honi Poke allergen matrix (review date {review})"
NOTE = ("Figures are the per-bowl totals shown by Honi Poke's own Nutritional Calculator, which adds up its own ingredient data "
        "(so kcal and macros do not always agree with each other). No sugars, salt or saturates are published. "
        "Dishes whose own menu page shows a different calorie figure are not published.")
CONFLICT_TOLERANCE = 0.10  # a dish page's "Cal" within 10% of the calculator's kcal is not treated as a contradiction

SIG, WARM, SALAD, RAMEN, SIDES = "Signature bowls", "Warm bowls", "Poke salads", "Ramen", "Sides"
# calculator row id -> (name as the calculator prints it, category, grid, dish page slug (None for sides), name that dish page prints)
# Ramen names get " Ramen" added: the calculator prints them on its Ramen tab, the chain's menu pages print the full name.
ITEMS: List[Tuple[str, str, str, str, object, str]] = [
    ("honi", "Honi Salmon", SIG, "bowlGrid", "honi-poke-bowl", "Honi Salmon"),
    ("ahi", "Ahi Tuna", SIG, "bowlGrid", "ahi-poke-bowl", "Ahi Tuna"),
    ("sriracha", "Sriracha Mayo Salmon", SIG, "bowlGrid", "sriracha-mayo-bowl", "Sriracha Mayo Salmon"),
    ("california", "California", SIG, "bowlGrid", "california-bowl", "California"),
    ("avo-mango", "Avocado & Mango", SIG, "bowlGrid", "avocado-mango", "Avocado & Mango"),
    ("tofu", "Tofu Teriyaki", SIG, "bowlGrid", "tofu-teriyaki", "Tofu Teriyaki"),
    ("teriyaki-chk", "Chicken Teriyaki", SIG, "bowlGrid", "teriyaki-chicken", "Teriyaki Chicken"),
    ("swicy-prawns", "Swicy Prawns", SIG, "bowlGrid", "swicy-prawn", "Swicy Prawn"),
    ("tokyo-yuzu", "Tokyo Yuzu", SIG, "bowlGrid", "tokyo-yuzu-salmon", "Tokyo Yuzu Salmon"),
    ("miso-salmon", "Miso Salmon", WARM, "bowlGrid", "miso-salmon", "Miso Salmon"),
    ("gochujang", "Gochujang Chicken", WARM, "bowlGrid", "gochujang-chicken", "Gochujang Chicken"),
    ("katsu", "Chicken Katsu Curry", WARM, "bowlGrid", "chicken-katsu-curry", "Chicken Katsu Curry"),
    ("citrus-yuzu", "Citrus Yuzu Salmon", SALAD, "bowlGrid", "citrus-yuzu-salmon", "Citrus Yuzu Salmon"),
    ("pacific-tuna", "Pacific Tuna", SALAD, "bowlGrid", "pacific-tuna", "Pacific Tuna"),
    ("seoul-fire", "Seoul Fire Chicken", SALAD, "bowlGrid", "seoul-fire-chicken", "Seoul Fire Chicken"),
    ("green-zen", "Green Zen Tofu", SALAD, "bowlGrid", "green-zen-tofu", "Green Zen Tofu"),
    ("paitan-chicken", "Paitan Chicken", RAMEN, "ramenGrid", "paitan-chicken-ramen", "Paitan Chicken Ramen"),
    ("shoyu-beef", "Shoyu Paitan Beef", RAMEN, "ramenGrid", "beef-ramen", "Shoyu Paitan Beef Ramen"),
    ("shoyu-miso-tofu", "Miso Shoyu Tofu", RAMEN, "ramenGrid", "tofu-ramen", "Miso Shoyu Tofu Ramen"),
    ("gochujang-prawns", "Gochujang Prawns", RAMEN, "ramenGrid", "gochujang-prawns-ramen", "Gochujang Prawns Ramen"),
    ("side-crab", "Crab Salad", SIDES, "sidesGrid", None, ""),
    ("side-guac", "Guacamole", SIDES, "sidesGrid", None, ""),
    ("side-tartare", "Salmon Tartare", SIDES, "sidesGrid", None, ""),
    ("side-jp-salad", "Japanese Salad", SIDES, "sidesGrid", None, ""),
    ("side-seaweed", "Seaweed Salad", SIDES, "sidesGrid", None, ""),
    ("side-tortilla", "Tortilla Chips", SIDES, "sidesGrid", None, ""),
]
EXPECTED_TABS = ["Signature Bowls:menu", "Ramen:ramen", "Sides:sides", "Build Your Own:byo"]
EXPECTED_HEADS = ["Bowl", "kcal", "Protein", "Carbs", "Fat"]
BEEF = re.compile(r"\b(beef|brisket|steak)\b", re.I)
PORK = re.compile(r"\b(pork|bacon|ham|sausage|chorizo|pepperoni|salami)\b", re.I)
NUM = re.compile(r"\d+(\.\d+)?")


def item_name(printed: str, category: str) -> str:
    return printed + " Ramen" if category == RAMEN else printed


def read_calculator(calc: dict) -> Dict[str, dict]:
    """Validate the rendered calculator and return calculator row id -> {table cells, panel values (strings as displayed), desc}."""
    if calc["tabs"] != EXPECTED_TABS:
        raise SystemExit(f"The calculator's tabs changed: {calc['tabs']} (expected {EXPECTED_TABS})")
    if calc["tables"]["heads"] != EXPECTED_HEADS:
        raise SystemExit(f"The calculator's table columns changed: {calc['tables']['heads']} (expected {EXPECTED_HEADS})")
    found = {}
    for grid in ("bowlGrid", "ramenGrid", "sidesGrid"):
        for row in calc["tables"][grid]:
            found[row["id"]] = dict(row, grid=grid)
    expected = [i[0] for i in ITEMS]
    if sorted(found) != sorted(expected) or sorted(calc["panels"]) != sorted(expected):
        new, gone = sorted(set(found) - set(expected)), sorted(set(expected) - set(found))
        raise SystemExit(f"The calculator's dishes changed. Listed but not in ITEMS: {new}. In ITEMS but no longer listed: {gone}. "
                         "Read the page again and update ITEMS (names, categories, dish pages).")
    out = {}
    for rid, name, category, grid, _, _ in ITEMS:
        row, panel = found[rid], calc["panels"][rid]
        if row["grid"] != grid or row["name"] != name or panel["title"] != name:
            raise SystemExit(f"{rid}: row/panel name {row['name']!r}/{panel['title']!r} in {row['grid']} differs from ITEMS ({name!r}, {grid})")
        cells = row["cells"]
        if len(cells) != 4 or not re.fullmatch(r"\d+", cells[0]) or any(not re.fullmatch(r"\d+g", c) for c in cells[1:]):
            raise SystemExit(f"{rid}: table cells not 'kcal, Ng, Ng, Ng': {cells}")
        for key, pat in (("kcal", r"\d+"), ("protein", r"\d+\.\d"), ("carbs", r"\d+\.\d"), ("fat", r"\d+\.\d"), ("fibre", r"\d+\.\d"), ("sodium", r"\d+")):
            if not re.fullmatch(pat, panel[key]):
                raise SystemExit(f"{rid}: panel {key} {panel[key]!r} is not in the expected format")
        if panel["kcal"] != cells[0]:
            raise SystemExit(f"{rid}: panel kcal {panel['kcal']} differs from the table's {cells[0]}")
        for key, cell in (("protein", cells[1]), ("carbs", cells[2]), ("fat", cells[3])):
            if abs(float(panel[key]) - int(cell[:-1])) > 0.55:
                raise SystemExit(f"{rid}: panel {key} {panel[key]} g is not the table's {cell} rounded")
        out[rid] = {"cells": cells, "panel": panel, "desc": row["desc"], "badge": row["badge"]}
    return out


def build(pages: Path) -> Tuple[List[dict], List[Tuple[str, str]], List[str], str]:
    calc = hp.read_calculator(pages / "calculator.json")
    rows = read_calculator(calc)
    listings: Dict[str, dict] = {}
    for p in hp.LISTING_PATHS:
        name = "listing_" + p.strip("/") + ".html"
        for s, v in hp.read_listing((pages / name).read_text(encoding="utf-8"), name).items():
            listings[s] = v
    review = hp.read_review_date((pages / "allergens.html").read_text(encoding="utf-8"))
    if not review:
        raise SystemExit("The allergen page no longer prints 'Review date: dd/mm/yyyy'")
    items, holdback, report = [], [], []
    for rid, printed, category, _, page_slug, page_name in ITEMS:
        r = rows[rid]
        p = r["panel"]
        name = item_name(printed, category)
        tags = []
        notes = [f"Calculator row '{printed}' ({r['badge'] or category}); table row {' / '.join(r['cells'])}"]
        if page_slug:
            if page_slug not in listings:
                raise SystemExit(f"{rid}: /menu/{page_slug} is not on any listing page any more")
            if listings[page_slug]["vegetarian"]:
                tags.append("vegetarian")
            dish = hp.read_dish_page((pages / f"dish_{page_slug}.html").read_text(encoding="utf-8"), page_slug)
            if dish["name"] != page_name or listings[page_slug]["title"] != page_name:
                raise SystemExit(f"{rid}: dish page names it {dish['name']!r} / listing {listings[page_slug]['title']!r}, expected {page_name!r}")
            if page_name != name:
                notes.append(f"the chain's menu calls it '{page_name}'")
            if dish["cal"]:
                cal, kcal = int(dish["cal"]), int(p["kcal"])
                if abs(cal - kcal) / kcal > CONFLICT_TOLERANCE:
                    reason = (f"The chain's own dish page for this dish ('{page_name}', {hp.HOST}/menu/{page_slug}) prints {cal} Cal; its Nutritional "
                              f"Calculator shows {kcal} kcal. The two figures on the chain's website disagree, and nothing is chosen between them.")
                    holdback.append((slug(name), reason))
                    report.append(f"held back: {name}: dish page {cal} Cal vs calculator {kcal} kcal")
                else:
                    notes.append(f"dish page prints {cal} Cal (within 10% of the calculator)")
            else:
                notes.append("dish page prints no calories")
        text = name + " " + r["desc"]
        if BEEF.search(text):
            tags.append("contains_beef")
        if PORK.search(text):
            tags.append("contains_pork")
        items.append({"name": name, "category": category, "serving": "", "calories": p["kcal"], "protein_g": p["protein"],
                      "carbs_g": p["carbs"], "fat_g": p["fat"], "fiber_g": p["fibre"], "sodium_mg": p["sodium"],
                      "tags": "|".join(tags), "rankable": category != SIDES, "notes": "; ".join(notes)})
    # sanity: the energy gap the page's own scaling produces (explained in the docstring), reported for the check_chain warnings
    for it in items:
        est = 4 * float(it["protein_g"]) + 4 * float(it["carbs_g"]) + 9 * float(it["fat_g"])
        if abs(est - float(it["calories"])) / float(it["calories"]) > 0.15:
            report.append(f"energy gap >15%: {it['name']}: {it['calories']} kcal vs 4P+4C+9F={est:.0f}")
    return items, holdback, report, review


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder for the downloaded/rendered pages (not inside the repo's tools)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download and render the pages into --pages first")
    ap.add_argument("--playwright-dir", default=hp.DEFAULT_PLAYWRIGHT_DIR, help="folder holding playwright-core (node_modules)")
    ap.add_argument("--chrome", default=hp.DEFAULT_CHROME, help="Chromium executable")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for line in hp.fetch_all(args.pages, [i[4] for i in ITEMS if i[4]], args.playwright_dir, args.chrome):
            print("sha256", line)
    items, holdback, report, review = build(args.pages)
    guide = {"title": ALLERGEN_TITLE_FMT.format(review=review), "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on,
             # the page says "we can't promise any dish is entirely free from traces": a traces notice is printed
             "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Honi Poke", cuisine="Poke bowls", source_title=SOURCE_TITLE_FMT.format(date=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["honi poke", "honi"], items=items, out=args.out,
                             note=NOTE, holdback=holdback, allergen_guide=guide)
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back, {len(items) - len(holdback)} published) to {out}; allergen guide review date {review}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
