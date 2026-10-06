#!/usr/bin/env python3
"""Build data/source/chilango/ from Chilango's official "Nutrition & Allergen Information" PDF.

    curl -A "Mozilla/5.0" -o chilango-nutrition-guide.pdf https://a.storyblok.com/f/293792/x/c1bd09189b/chilango-nutrition-guide_19-nov-2024.pdf
    python3 tools/uk_extract/chilango.py chilango-nutrition-guide.pdf --checked-on 2026-10-06

Source: the PDF linked from https://www.chilango.co.uk/food ("Nutrition & allergens"; cover "Updated 19 November 2024", each
table page footed "Updated: Nov-24"). 10 pages: a cover, then one table per page (kcal, kJ, fat, saturates, carbs, sugars, fibre,
protein, salt; allergens). Numbers are copied exactly as printed (kJ is not used). Only names, groups and flags are typed below.

WHAT IS AND IS NOT PUBLISHED. Chilango's guide lists INGREDIENT portions per dish type (Burrito, Hotbox / Salad, Tres Tacos, Sharers)
and never prints a finished dish or its total, so none of those is an item and nothing is added up for them (a total the chain
does not print would be a number we made). What it does publish as whole things:
  * The four set boxes (Protein, Keto, Low Carb, Vegan): each page lists the box's ingredients with a printed kcal TOTAL. They
    are published as build-your-own items whose default recipe is exactly those printed rows (components.csv). The pipeline adds
    the printed rows up; this script first checks that the printed kcal rows add up to the printed TOTAL, and stops if not.
  * The Sides page (chips, salsa and dip pots, baked fries, lemonade): whole items with their own row.
The component pool is ONLY the rows printed on the four box pages (11 rows), so the builder can only mix portions the guide
prints for a box. The Burrito / Hotbox / Tacos / Sharers pages are read (to make sure the layout is still what this script
expects) but not used.

Left out on purpose: Burrito, Hotbox / Salad, Tres Tacos and Sharers pages (ingredient portions only, no dish or total; the
Sharers rows are portions of the sharing dishes, e.g. "Cheese Sauce 211.5 kcal" is three times the 70.5 kcal topping portion);
the duplicate "Tortilla Chips (Bag)" row on the Sharers page (identical to the Sides row).
Held back (holdback.csv): Baked Fries (Sides): 288 kcal printed beside 905 kJ (about 216 kcal) and fat, carbs and protein that add
up to about 225 kcal; the same page's two topped-fries rows and the BBQ salsa pot put the plain fries at about 216-228 kcal.

Also copied: the printed kJ of every component and side (energy_kj; never converted from kcal), the pot weights printed in the
side names ("Guacamole Pot (80g)" -> weight_g 80), and the allergens printed on the same rows ("Contains Allergens" / "May
Contain"; docs/DATA.md "Allergens"): components.csv ids and side items each get a row in allergens.csv, and the pipeline gives a
box the union of its components. Two rows (Fajita Peppers and Onions, Steak) print, in the Contains column, only a cross-contact
note: "*Cooked on the same grill as THIS Isn't Chicken which contains allergens: Soya, Sulphites, ..." / "... as grilled prawns
which contain allergens: Crustacean, Celery, Sulphites". The guide says these items are cooked beside an item that contains those
allergens, not that they contain them, so the note's allergens are recorded as "may contain" (GRILL_NOTE below). The same
ingredient rows on the Burrito page are compared with the box pages and any difference is printed in the run summary.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import re
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import chilango_pdf  # noqa: E402
import tortilla_pdf  # noqa: E402  (allergen_keys: the same group's guide design)
from common import ITEM_FIELDS, NUTRIENT_KEYS, ROOT, slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "chilango"
SOURCE_URL = "https://a.storyblok.com/f/293792/x/c1bd09189b/chilango-nutrition-guide_19-nov-2024.pdf"
SOURCE_TITLE = "Chilango Nutrition & Allergen Information (updated 19 November 2024)"
COVER_DATE = "19 November 2024"
NOTE = ("Chilango publishes its burritos, bowls, salads and tacos only as separate ingredients, so only its four set boxes and "
        "its sides are listed. Its guide was last updated in November 2024.")

BOXES, SIDES, DIPS, DRINKS = "Boxes", "Sides", "Dips & salsas", "Drinks"
CATEGORY_ORDER = [BOXES, SIDES, DIPS, DRINKS]

# Pages this script reads but does not use. title -> printed names in order (the script stops if any of this changes).
INGREDIENT_PAGES = {
    2: ("BURRITO", "Tortilla Wrap|Coriander Lime Rice|Cos Lettuce|Black Beans|Pinto Beans|Fajita Peppers and Onions|Vegan Chilli|Chicken|"
                   "THIS Isn’t Chicken|Carnitas (Pork)|Steak|Prawns|Surf and Turf|Chipotle Cheese Sauce|Monterey Jack Cheese|Sour Cream|"
                   "Guacamole|Pico de Gallo|Salsa Verde|Asada|BBQ Salsa|Pickled Red Onions|Chipotle Crema"),
    3: ("HOTBOX / SALAD", "Coriander Lime Rice|Cos Lettuce|Black Beans|Pinto Beans|Fajita Peppers and Onions|Vegan Chilli|Chicken|"
                          "THIS Isn’t Chicken|Carnitas (Pork)|Steak|Prawns|Surf and Turf|Chipotle Cheese Sauce|Monterey Jack Cheese|"
                          "Sour Cream|Guacamole|Pico de Gallo|Salsa Verde|Asada|BBQ Salsa|Pickled Red Onions|Chipotle Crema"),
    4: ("TRES TACOS", "Soft taco shell (3)|Fajita Peppers and Onions|Vegan Chilli|Chicken|THIS Isn’t Chicken|Carnitas (Pork)|Steak|Prawns|"
                      "Surf and Turf|Chipotle Cheese Sauce|Monterey Jack Cheese|Sour Cream|Guacamole|Pico de Gallo|Salsa Verde|Asada|"
                      "BBQ Salsa|Pickled Red Onions|Chipotle Crema"),
    5: ("SHARERS", "Baked Fries|Tortilla Chips (Bag)|Cheese Sauce|Guacamole|Pico de Gallo|Asada|Pickled Red Onion"),
}

# Box pages: page -> (title, item id, item name, printed rows in order, printed TOTAL kcal)
BOX_PAGES = {
    6: ("PROTEIN BOX", "protein-box", "Protein Box", ["Cos Lettuce", "Black Beans", "Fajita Peppers and Onions", "Chicken", "Pico de Gallo"], "584.4"),
    7: ("KETO BOX", "keto-box", "Keto Box", ["Cos Lettuce", "Steak", "Monterey Jack Cheese", "Sour Cream", "Guacamole", "Pico de Gallo"], "515.5"),
    8: ("LOW CARB BOX", "low-carb-box", "Low Carb Box", ["Cos Lettuce", "Fajita Peppers and Onions", "Chicken", "Guacamole", "Pico de Gallo"], "431.1"),
    9: ("VEGAN BOX", "vegan-box", "Vegan Box", ["Coriander Lime Rice", "Cos Lettuce", "Black Beans", "Fajita Peppers and Onions", "Guacamole", "Pico de Gallo"], "607.3"),
}

# Component spec by printed name -> (id, name, group, removable). Names are tidied to sentence case (and "Monterey Jack Cheese" to
# "Cheese (Monterey Jack)") so the pipeline's lower-cased labels read well ("no sour cream", "rice instead of lettuce").
# The same printed name on two box pages must carry the
# same printed numbers (checked below); the Protein Box's "Chicken" row is a different, larger portion (421.8 kcal, printed
# separately) so it is its own component and is never treated as a "double" of the 211.0 kcal chicken.
TOPPING, BASE, PROTEIN = "topping", "base", "protein"
COMPONENTS = {
    "Cos Lettuce": ("cos-lettuce", "Cos lettuce", BASE, False),
    "Coriander Lime Rice": ("coriander-lime-rice", "Coriander lime rice", BASE, False),
    "Black Beans": ("black-beans", "Black beans", TOPPING, False),
    "Fajita Peppers and Onions": ("fajita-peppers-and-onions", "Fajita peppers and onions", TOPPING, False),
    "Chicken": ("chicken", "Chicken", PROTEIN, False),
    "Steak": ("steak", "Steak", PROTEIN, False),
    "Monterey Jack Cheese": ("monterey-jack-cheese", "Cheese (Monterey Jack)", TOPPING, True),
    "Sour Cream": ("sour-cream", "Sour cream", TOPPING, True),
    "Guacamole": ("guacamole", "Guacamole", TOPPING, True),
    "Pico de Gallo": ("pico-de-gallo", "Pico de gallo", TOPPING, False),
}
PROTEIN_BOX_CHICKEN = ("chicken-protein-box", "Chicken (Protein Box portion)", PROTEIN, False)
BEEF_NAMES = {"Steak"}  # the guide's own name says steak -> contains_beef (playbook rule); no other pork/beef name is in the box rows

COMPONENT_FIELDS = ["id", "group", "name", "portion", *NUTRIENT_KEYS, "tags", "removable", "allow_double"]

# Sides page: printed name -> (item name, category, serving, rankable, note)
SIDES_PAGE = 10
SIDES_ROWS = {
    "Tortilla Chips (Bag)": ("Tortilla Chips", SIDES, "1 bag", True, ""),
    "Pico de Gallo Salsa pot (70g)": ("Pico de Gallo Salsa Pot", DIPS, "1 pot (70 g)", False, ""),
    "Asada Salsa Pot (70g)": ("Asada Salsa Pot", DIPS, "1 pot (70 g)", False, ""),
    "Verde Salsa Pot (70g)": ("Verde Salsa Pot", DIPS, "1 pot (70 g)", False, ""),
    "BBQ Salsa Pot (70g)": ("BBQ Salsa Pot", DIPS, "1 pot (70 g)", False, ""),
    "Chipotle Crema Pot (70g)": ("Chipotle Crema Pot", DIPS, "1 pot (70 g)", False,
                                 "Printed 410 kcal for the 70 g pot; the burrito/bowl/taco crema portions on other pages are far smaller"),
    "Guacamole Pot (80g)": ("Guacamole Pot (80 g)", DIPS, "1 pot (80 g)", False, ""),
    "Guacamole pot (170g)": ("Guacamole Pot (170 g)", DIPS, "1 pot (170 g)", False, ""),
    "Baked Fries": ("Baked Fries", SIDES, "", True, ""),
    "Baked Fries with BBQ Salsa": ("Baked Fries with BBQ Salsa", SIDES, "", True, ""),
    "Baked Fries with Chipotle Crema": ("Baked Fries with Chipotle Crema", SIDES, "", True, ""),
    "Homemade Lemonade": ("Homemade Lemonade", DRINKS, "", False, ""),
}
ALLERGEN_GUIDE = {"title": SOURCE_TITLE, "url": SOURCE_URL, "may_contain_published": True}
# The cross-contact note some rows print in the Contains column (see the docstring): its allergens become "may contain".
GRILL_NOTE = re.compile(r"^\*Cooked on the same grill as (?:our vegan )?(.+?) which contains? (?:the following )?allergens:\s*(.+)$")
POT_WEIGHT = re.compile(r"\((\d+)g\)$")  # "Guacamole Pot (80g)": the pot's printed weight
INGREDIENT_PAGE_FOR_CHECK = 2  # the Burrito page prints the same ingredient rows: compared with the box pages (advisory)


def allergens_of(row: dict, where: str) -> dict:
    """A printed row's Contains / May Contain cells as allergen keys. Stops on an unreadable cell or an unknown word."""
    if row.get("allergen_problem"):
        raise SystemExit(f"{where}: {row['allergen_problem']}")
    contains_text, may_extra = row["contains_text"], set()
    m = GRILL_NOTE.match(contains_text)
    if m:
        may_extra, _, _ = tortilla_pdf.allergen_keys(m.group(2), where)
        contains_text = ""
    elif contains_text.startswith("*"):
        raise SystemExit(f"{where}: a note this script doesn't know is printed under Contains: {contains_text!r}")
    contains, cereals, nuts = tortilla_pdf.allergen_keys(contains_text, where)
    may, _, _ = tortilla_pdf.allergen_keys(row["may_text"], where)
    return {"contains": contains, "may_contain": (may | may_extra) - contains, "cereals": cereals, "nuts": nuts,
            "_printed": (row["contains_text"], row["may_text"])}


HOLDBACK = {
    "baked-fries": ("kcal", "288.0", "kj", "905.0",
                    "Printed 288 kcal disagrees with its own 905 kJ (about 216 kcal) and with its fat, carbs and protein (about 225 kcal); "
                    "the BBQ-salsa and chipotle-crema versions on the same page are consistent with about 216-228 kcal for the plain fries"),
}


def die(msg: str) -> int:
    print(f"STOP: {msg}", file=sys.stderr)
    return 1


def d(x: str) -> Decimal:
    return Decimal(x)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted it")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    pages = chilango_pdf.read_pages(args.pdf)
    if len(pages) != 10:
        return die(f"the PDF has {len(pages)} pages, this script expects 10; re-check the layout")
    if pages[1]["updated"] != COVER_DATE:
        return die(f"the cover date is {pages[1]['updated']!r}, not {COVER_DATE!r}: a new guide? re-check names, TOTALs and the source title")
    for n in range(2, 11):
        if pages[n]["updated"] not in ("", "Nov-24"):
            return die(f"page {n} footer says {pages[n]['updated']!r}; this script was written for Nov-24")

    # Ingredient pages: only checked, never used.
    for n, (title, names) in INGREDIENT_PAGES.items():
        got = [r["name"] for r in pages[n]["rows"]]
        if pages[n]["title"] != title or got != names.split("|"):
            return die(f"page {n} ({title}) rows changed. A new layout may mean Chilango now prints whole dishes, which a human should look at. "
                       f"Printed: {got}")

    # Box pages -> components + default recipes.
    components: dict[str, dict] = {}
    items: list[dict] = []
    for n, (title, item_id, item_name, names, total) in BOX_PAGES.items():
        page = pages[n]
        rows = page["rows"]
        if page["title"] != title or [r["name"] for r in rows] != names + ["TOTAL"] or rows[-1]["kcal"] != total:
            return die(f"page {n} ({title}) changed: printed {[r['name'] for r in rows]} / TOTAL {rows[-1]['kcal']}")
        printed_sum = sum(d(r["kcal"]) for r in rows[:-1])
        if printed_sum != d(total):
            return die(f"{title}: the printed kcal rows add up to {printed_sum} but the page prints TOTAL {total}; do not build from these rows")
        recipe = []
        tags = []
        for r in rows[:-1]:
            if title == "PROTEIN BOX" and r["name"] == "Chicken":
                cid, cname, group, removable = PROTEIN_BOX_CHICKEN
            else:
                cid, cname, group, removable = COMPONENTS[r["name"]]
            nums = {k: r[k] for k in chilango_pdf.COLUMNS}
            if cid in components:
                if components[cid]["_printed"] != nums:
                    return die(f"{cname}: printed numbers differ between box pages ({components[cid]['_printed']} vs {nums}); give it its own component")
                if components[cid]["_allergens"]["_printed"] != allergens_of(r, f"page {n} {r['name']!r}")["_printed"]:
                    return die(f"{cname}: printed allergens differ between box pages; look at the guide before publishing either")
            else:
                ctags = []
                if r["veg"]:
                    ctags.append("vegetarian")
                if r["name"] in BEEF_NAMES:
                    ctags.append("contains_beef")
                components[cid] = {
                    "id": cid, "group": group, "name": cname, "portion": "", "calories": r["kcal"], "protein_g": r["protein"],
                    "carbs_g": r["carbs"], "fat_g": r["fat"], "sat_fat_g": r["sat"], "sodium_mg": "", "salt_g": r["salt"],
                    "sugar_g": r["sugars"], "fiber_g": r["fibre"], "energy_kj": r["kj"], "tags": "|".join(ctags),
                    "removable": str(removable).lower(), "allow_double": "false", "_printed": nums,
                    "_allergens": allergens_of(r, f"page {n} {r['name']!r}"), "_printed_name": r["name"],
                }
            recipe.append(cid)
        items.append({
            "id": item_id, "name": item_name, "category": BOXES, "serving": "1 box", "components": "|".join(recipe),
            "limited_time": "false", "rankable": "true",
            "notes": f"Recipe = the rows printed on the {title.title()} page. The page prints TOTAL {total} kcal (the printed kcal rows add up to it); "
                     "the pipeline sums rounded components so its total can differ from that by 1 kcal",
        })

    # Sides page -> whole items.
    side_rows = pages[SIDES_PAGE]["rows"]
    if pages[SIDES_PAGE]["title"] != "SIDES" or [r["name"] for r in side_rows] != list(SIDES_ROWS):
        return die(f"the Sides page changed: printed {[r['name'] for r in side_rows]}")
    standard = []
    holdback = []
    for r in side_rows:
        name, category, serving, rankable, note = SIDES_ROWS[r["name"]]
        item = {
            "name": name, "category": category, "serving": serving, "calories": r["kcal"], "protein_g": r["protein"],
            "carbs_g": r["carbs"], "fat_g": r["fat"], "sat_fat_g": r["sat"], "salt_g": r["salt"], "sugar_g": r["sugars"],
            "fiber_g": r["fibre"], "energy_kj": r["kj"], "weight_g": (POT_WEIGHT.search(r["name"]) or [None, ""])[1],
            "tags": "vegetarian" if r["veg"] else "", "limited_time": False, "rankable": rankable, "notes": note,
            "allergens": allergens_of(r, f"page {SIDES_PAGE} {r['name']!r}"),
        }
        standard.append(item)
    for item_id, (k1, v1, k2, v2, reason) in HOLDBACK.items():
        row = next(r for r in side_rows if slug(SIDES_ROWS[r["name"]][0]) == item_id)
        if row[k1] != v1 or row[k2] != v2:
            return die(f"{item_id}: the held-back numbers changed ({row[k1]} / {row[k2]}); re-check whether the holdback still applies")
        holdback.append((item_id, reason))

    # Advisory anomaly report (never changes a number).
    for r in side_rows:
        kcal, kj = d(r["kcal"]), d(r["kj"])
        est = 4 * d(r["protein"]) + 4 * d(r["carbs"]) + 9 * d(r["fat"])
        kj_kcal = kj / Decimal("4.184")
        flags = []
        if abs(kj_kcal - kcal) / kcal > Decimal("0.03"):
            flags.append(f"kJ {r['kj']} is {kj_kcal:.0f} kcal")
        if kcal >= 50 and abs(est - kcal) / kcal > Decimal("0.15"):
            flags.append(f"4P+4C+9F = {est:.0f}")
        if flags:
            print(f"  anomaly: {r['name']} printed {r['kcal']} kcal: {'; '.join(flags)}")

    # Write the folder: whole items through the shared writer, then the box items and components on top.
    out = write_chain_folder(chain_id=CHAIN_ID, name="Chilango", cuisine="Mexican", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["chilango", "chilango burritos", "chilango mexican"],
                             items=standard, out=args.out, note=NOTE, holdback=holdback)
    with open(out / "items.csv", newline="", encoding="utf-8") as f:
        std_rows = list(csv.DictReader(f))
    rows = []
    for it in items:
        row = {k: "" for k in ITEM_FIELDS}
        row.update(it)
        rows.append(row)
    rows += std_rows
    rows.sort(key=lambda r: CATEGORY_ORDER.index(r["category"]))
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids)), "duplicate item ids"
    with open(out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=ITEM_FIELDS)
        w.writeheader()
        w.writerows(rows)
    with open(out / "chain.csv", newline="", encoding="utf-8") as f:
        chain_rows = list(csv.DictReader(f))
    chain_rows[0]["builder_type"] = "build_your_own"
    with open(out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(chain_rows[0]))
        w.writeheader()
        w.writerows(chain_rows)
    with open(out / "components.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COMPONENT_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(components.values())

    # allergens.csv: every side item (under the id the shared writer gave it) and every component (boxes get their union).
    side_allergens = {it["name"]: it["allergens"] for it in standard}
    allergen_rows = [(r["id"], side_allergens[r["name"]]) for r in std_rows] + [(c["id"], c["_allergens"]) for c in components.values()]
    write_allergens(out, CHAIN_ID, allergen_rows, {**ALLERGEN_GUIDE, "checked_on": args.checked_on})
    # Advisory second reading: the Burrito page prints the same ingredients; report where it differs from the box pages.
    burrito = {r["name"]: r for r in pages[INGREDIENT_PAGE_FOR_CHECK]["rows"]}
    for c in components.values():
        other = burrito.get(c["_printed_name"])
        if other is None:
            print(f"  allergen check: {c['_printed_name']} is not on the Burrito page")
            continue
        a, b = c["_allergens"], allergens_of(other, f"page {INGREDIENT_PAGE_FOR_CHECK} {other['name']!r}")
        if (a["contains"], a["may_contain"]) != (b["contains"], b["may_contain"]):
            print(f"  allergen check: {c['_printed_name']}: box page contains {sorted(a['contains'])} may {sorted(a['may_contain'])}; "
                  f"Burrito page contains {sorted(b['contains'])} may {sorted(b['may_contain'])} (the box page's row is used)")
    print(f"wrote {len(items)} box items ({len(components)} components) + {len(standard)} side items ({len(holdback)} held back) "
          f"to {out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
