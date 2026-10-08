#!/usr/bin/env python3
"""Build data/source/places-leisure/ from Places Leisure's two official Cafeology allergen and calorie charts (a CALORIES-ONLY chain).

    python3 tools/uk_extract/places_leisure.py FOOD.pdf HOT_DRINKS.pdf --checked-on 2026-10-08 [--out DIR]

Sources (both linked from https://www.placesleisure.org/allergens-and-nutritional-information/, "Cafeology" block; robots.txt of
placesleisure.org lists only centre/campaign pages and no User-agent group, /media/ and the page are not disallowed):
    FOOD    https://www.placesleisure.org/media/cqwfej0d/allergen-calories-cafeology-unlabelled-food-september-2026-0209-v1.pdf
            "Unlabelled food information": 27 pages, Excel export, chart date 03/09/2026 (PDF created 2026-09-03, Last-Modified 2026-09-10)
    HOT     https://www.placesleisure.org/media/krhpzlpw/allergen-calories-cafeology-hot-drinks-september-2026-1.pdf
            "Hot drink information": 36 pages, Excel export (PDF created 2026-09-03, Last-Modified 2026-09-10)
Needs `pdftotext` and `pdftocairo` (poppler). The grid is read by tools/uk_extract/places_leisure_pdf.py.

What the charts print: "Calories Kcal" (calorie information is "based on an average adult serving size for each dish or drink unless
stated otherwise") and a 14-allergen grid (tick = contains, tick* = may contain). Protein, carbs, fat and every other nutrient are never
printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is non-rankable).

Scope (Great Britain, the Cafeology cafes in general; one chain id for the operator's Cafeology menu):
- PUBLISHED: food chart pages 2-5 (Coffee Shop: teacake, bacon bap, milkshakes, smoothies, slushies, frappes, extras), 10 (Cakes) and
  27 (Post Mix / Squash); hot drinks chart pages 2-33 = six blocks, one per coffee machine and cup size (Vitali 8oz, Vitro X3 12oz,
  Egro 12oz and 16oz, Franke 12oz and 16oz). The chart does not say which centre has which machine, so every block is published and the
  machine and cup size are part of the item name and category.
- LEFT OUT (the script checks each page's own "ONLY" line before skipping it): food pages 6-9 (Mr Whippy, Chips, scooped Ice Cream:
  "Charlton Lakeside Only" / "Prudhoe Waterworld Only", single centres), food pages 11-26 (nachos, wings, sides, burgers, jacket potato,
  street fries, kids meals, party food: "Concordia, Wentworth, and Ponteland ONLY", "Northumberland ONLY", "Ashington and Morpeth ONLY",
  Costa Proud to Serve sites), hot drinks pages 34-36 ("Chessington Coffee Machine Only"). Costa and Costa Proud to Serve drinks have
  their own charts and are not Cafeology; packaged food shows its own label ("Pre-packaged products will show allergen information on
  their packaging") and is not in these charts.

How the printed rows are read:
- A row is one product with one calorie value. The kcal cell is copied as printed: "439", "83.8", "342 per slice" (serving 1 slice),
  "300ml = 1 / 454ml = 2" (two printed sizes = two items, serving 300ml / 454ml).
- Names are the printed names. Hot drink names get the printed milk in brackets when the cell prints it on a second line ("Latte" /
  "Fresh Milk" -> "Latte (Fresh Milk)") and the machine and cup size after a dash. The Hot Chocolate Deluxe section prints the same
  names as the plain section, so its heading's text is added ("Hot Chocolate Deluxe (Fresh Milk, cream and marshmallows)"). The
  cakes' catering pack code ("1x12 (1kg)") is left out of the name (it stays in notes): the calories are per slice.
- Tags: only contains_pork, from the name ("Bacon Bap"). The charts never mark a dish vegetarian or vegan (their footer says
  "Vegan products may not be suitable for persons with allergies"), so no vegetarian tag.
- Weights: the 20 g marshmallows and 25 g aerosol cream portions print their weight; it is copied to weight_g. Other weights in
  names ("Shake 160g") are the weight of the bought-in mix, not of the drink served, and are not copied.

Allergens (docs/DATA.md "Allergens") are COMPLETE for every published item: each row sits in the same table as its 14 allergen
columns. A tick in a column = contains, a tick* = may contain, no tick = the chart marks none for that column. The small label under a
tick names the cereal ("Wheat", "Oats") or tree nut ("Walnut") and is copied into cereals / nuts; "May Contain Barley and Oats" under the
scone's wheat tick is not storable (gluten is already contained) and stays in the item's notes. A label this script does not know stops
the run. The chart's own warning ("We cannot guarantee that our products are free from allergens, as we use shared equipment") is in
the note shown with the chain.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import places_leisure_pdf as reader  # noqa: E402
from common import allergen_words, sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "places-leisure"
NAME = "Places Leisure Cafeology"
PAGE_URL = "https://www.placesleisure.org/allergens-and-nutritional-information/"
FOOD_URL = "https://www.placesleisure.org/media/cqwfej0d/allergen-calories-cafeology-unlabelled-food-september-2026-0209-v1.pdf"
HOT_URL = "https://www.placesleisure.org/media/krhpzlpw/allergen-calories-cafeology-hot-drinks-september-2026-1.pdf"
SOURCE_TITLE = ("Places Leisure Cafeology allergen and calorie charts: unlabelled food (chart dated 03/09/2026, 27 pages) and hot drinks "
                "(September 2026, 36 pages); both PDFs created 3 September 2026")
ALIASES = ["places leisure", "places leisure cafeology", "places leisure cafe", "places leisure cafes", "cafeology", "cafeology cafe",
           "cafeology coffee shop"]
ALLERGEN_GUIDE_TITLE = ("Places Leisure Cafeology allergen and calorie charts: unlabelled food (03/09/2026) and hot drinks (September "
                        "2026)")
NOTE = ("Calories only, for an average adult serving as the chart prints it: protein, carbs and fat are not published. Hot drink "
        "values depend on the cafe's coffee machine and cup size (the chart doesn't say which centre has which). Items sold at "
        "only some centres, Costa sites and packaged food are not listed.")

FOOD_PAGES = {2: "Coffee Shop", 3: "Coffee Shop", 4: "Coffee Shop", 5: "Coffee Shop", 10: "Cake", 27: "Post Mix/Squash"}
FOOD_ROWS = {2: 6, 3: 8, 4: 3, 5: 4, 10: 3, 27: 9}  # product rows per published page (stops the run if the chart changes)
FOOD_LEFT_OUT = list(range(6, 10)) + list(range(11, 27))  # each must carry its own "only" line
HOT_BLOCKS = {  # (machine as printed, cup size) -> pages
    ("Coffeetek Vitali", 8): [2, 3, 4], ("Coffeetek Vitro X3", 12): [5, 6, 7], ("Egro Coffee Machines", 12): list(range(8, 15)),
    ("Egro Coffee Machines", 16): list(range(15, 21)), ("Franke Coffee Machines", 12): list(range(21, 28)),
    ("Franke Coffee Machines", 16): list(range(28, 34)),
}
HOT_LEFT_OUT = [34, 35, 36]  # "Chessington Coffee Machine Only"
HOT_ROWS = {2: 5, 3: 9, 4: 5, 5: 6, 6: 8, 7: 6}
for _p in range(8, 34):  # the Egro and Franke blocks repeat the same page pattern
    HOT_ROWS[_p] = {8: 10, 9: 9, 10: 9, 11: 9, 12: 9, 13: 9, 14: 5, 15: 10, 16: 9, 17: 9, 18: 9, 19: 9, 20: 5, 21: 10, 22: 9, 23: 9,
                    24: 9, 25: 9, 26: 9, 27: 5, 28: 10, 29: 9, 30: 9, 31: 9, 32: 9, 33: 5}[_p]
MACHINE_NAME = {"Coffeetek Vitali": "Vitali", "Coffeetek Vitro X3": "Vitro X3", "Egro Coffee Machines": "Egro",
                "Franke Coffee Machines": "Franke"}
HOT_SECTIONS = {"Espresso", "Americano", "Hot Chocolate", "Hot Chocolate Deluxe (Cream and marshmallows)", "Latte", "Cappuccino",
                "Flat White", "Mocha", "Tea", "Speciality Tea", "Speciality Tea Contin..", "Syrups", "Toppings"}
MILKS = {"fresh milk", "oat milk", "soya milk"}
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)

# Food chart sections: printed heading -> category (order = display order). Serving text comes from the heading itself.
FOOD_SECTIONS = {
    "Teacake": "Food", "Bacon Bap": "Food",
    "Cakes": "Cakes",
    "Extra Items": "Extras",
    "Love Struck Milkshake (All prepared with 150ml Semi Skimmed Milk)": "Milkshakes",
    "Love Struck Smoothies (All prepared with 200ml Apple Juice)": "Smoothies",
    "Polar Krush Slushy Drinks - served in 330ml cup": "Slushies",
    "Polar Krush Caffe Frappe - served in 330ml cup": "Frappes",
    "Post Mix / Squash": "Post mix and squash",
}
SLUSHIES = {  # printed name -> item name (the asterisks mark the glycerol note printed under the table)
    "Strawberry* / Blue Raspberry* (Both Products Contain Glycerol)": "Polar Krush Slushy Strawberry / Blue Raspberry (contains glycerol)",
    "Strawberry Drift / Blue and Raspberry (Glycerol Free)": "Polar Krush Slushy Strawberry Drift / Blue and Raspberry (glycerol free)",
}
CATEGORY_ORDER = ["Food", "Cakes", "Extras", "Milkshakes", "Smoothies", "Slushies", "Frappes", "Post mix and squash"]


def parse_kcal(text: str, where: str) -> list[dict]:
    """The printed calories cell -> [{'kcal': '439', 'basis': None | 'per slice' | '300ml'}]. Anything else stops the run."""
    lines = [" ".join(x.split()) for x in text.split("\n") if x.strip()]
    one = " ".join(lines)
    m = re.fullmatch(r"(\d+(?:\.\d+)?)", one)
    if m:
        return [{"kcal": m.group(1), "basis": None}]
    m = re.fullmatch(r"(\d+(?:\.\d+)?) per (\w+)", one)
    if m:
        return [{"kcal": m.group(1), "basis": "per " + m.group(2)}]
    sizes = [re.fullmatch(r"(\d+ml) = (\d+(?:\.\d+)?)", x) for x in lines]
    if lines and all(sizes):
        return [{"kcal": m2.group(2), "basis": m2.group(1)} for m2 in sizes]
    raise SystemExit(f"{where}: calories cell {text!r} is not one of the printed forms this script knows")


def _phrases(text: str) -> list[str]:
    return [p.strip() for p in re.split(r",|\band\b", text) if p.strip()]


def row_allergens(row: dict, where: str) -> tuple[dict, str]:
    """(allergens dict for write_chain_folder, text for the item's notes) from the tick marks and labels of one row."""
    contains: set[str] = set()
    may: set[str] = set()
    cereals: set[str] = set()
    nuts: set[str] = set()
    extra_notes: list[str] = []
    for key, text in row["marks"].items():
        for tick in text.split():
            if tick == "✓":
                contains.add(key)
            elif tick == "✓*":
                may.add(key)
            else:
                raise SystemExit(f"{where}: unknown mark {tick!r} in the {key} column")
    for key, label in row["labels"].items():
        if key not in row["marks"]:
            raise SystemExit(f"{where}: label {label!r} in the {key} column without a tick")
        if key == "sulphites":
            if not {w for w in label.lower().split()} <= {">10ppm", "metabisulphite", "sulphites", "sulphite"}:
                raise SystemExit(f"{where}: unknown label {label!r} under sulphur dioxide")
            extra_notes.append(f"sulphites label printed: {label}")
        elif key in ("gluten", "nuts"):
            before, _, after = re.split(r"\b(may contain)\b", label, maxsplit=1, flags=re.I) if re.search(r"\bmay contain\b", label, re.I) \
                else (label, "", "")
            before = re.sub(r"^contains\b", "", before.strip(), flags=re.I).strip()
            if before:
                keys, c, n = allergen_words(_phrases(before), where)
                if keys != {key}:
                    raise SystemExit(f"{where}: label {before!r} under {key} names {sorted(keys)}")
                if "✓" not in row["marks"][key].split():
                    raise SystemExit(f"{where}: label {before!r} printed under a may-contain mark only")
                cereals |= c
                nuts |= n
            if after.strip():
                keys, c, n = allergen_words(_phrases(after), where)
                if keys != {key}:
                    raise SystemExit(f"{where}: may-contain label {after!r} under {key} names {sorted(keys)}")
                extra_notes.append(f"{key}: may contain {', '.join(sorted(c | n))} (printed)")
        else:
            raise SystemExit(f"{where}: unexpected label {label!r} in the {key} column")
    return dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts), "; ".join(extra_notes)


def check_rows(table_rows: list[dict], page: int) -> list[dict]:
    products = [r for r in table_rows if not r["heading"]]
    for r in products:
        where = f"page {page}, {r['name']!r}"
        if not r["name"]:
            raise SystemExit(f"{where}: a row without a name")
        if not r["kcal"]:
            raise SystemExit(f"{where}: a row without calories")
    return products


def food_items(food: dict) -> list[dict]:
    items = []
    for page in sorted(FOOD_PAGES):
        got = sum(1 for t in food[page]["tables"] for r in t["rows"] if not r["heading"])
        if got != FOOD_ROWS[page]:
            raise SystemExit(f"food chart page {page}: {got} product rows, expected {FOOD_ROWS[page]}: the chart changed, re-check")
        for table in food[page]["tables"]:
            if not table["rows"] or not table["rows"][0]["heading"]:
                raise SystemExit(f"food chart page {page}: a table that does not start with a section heading")
            heading = table["rows"][0]["name"]
            if heading not in FOOD_SECTIONS:
                raise SystemExit(f"food chart page {page}: new section heading {heading!r}: add it to FOOD_SECTIONS")
            category = FOOD_SECTIONS[heading]
            if any(r["heading"] for r in table["rows"][1:]):
                raise SystemExit(f"food chart page {page}: a second heading inside the {heading!r} table")
            m_prep = re.search(r"All prepared with (.+)\)$", heading)
            m_cup = re.search(r"served in (.+)$", heading)
            for r in check_rows(table["rows"], page):
                where = f"food chart page {page}, {r['name']!r}"
                allergens, a_note = row_allergens(r, where)
                tags = ["contains_pork"] if PORK.search(r["name"]) else []
                if BEEF.search(r["name"]):
                    tags.append("contains_beef")
                name, serving, weight = r["name"], "", ""
                note = f"food chart p.{page}, section {heading!r}; supplier column {r['supplier']!r}"
                if category == "Cakes":
                    name = re.sub(r"\s+\d+x\d+ \([\d.]+k?g\)$", "", name)
                    note += f"; printed name {r['name']!r}"
                elif category == "Slushies":
                    name = SLUSHIES.get(r["name"]) or sys.exit(f"{where}: new slushy name")
                elif category == "Frappes":
                    name = f"{r['name']} (Polar Krush Caffe Frappe)"
                if m_prep:
                    serving = "Prepared with " + m_prep.group(1)
                if m_cup:
                    serving = m_cup.group(1)
                if category == "Extras" and re.search(r"\(each\)$", r["name"], re.I):
                    serving = "each"
                for k in parse_kcal(r["kcal"], where):
                    item_name = name
                    item_serving = serving
                    if category == "Post mix and squash":
                        item_name = f"{name} ({k['basis']})"
                        item_serving = k["basis"]
                    elif k["basis"] == "per slice":
                        item_serving = "1 slice"
                    elif k["basis"] is not None:
                        raise SystemExit(f"{where}: unexpected calories basis {k['basis']!r}")
                    items.append(dict(name=item_name, category=category, serving=item_serving, calories=k["kcal"], weight_g=weight,
                                      tags="|".join(tags), rankable=False, allergens=allergens,
                                      notes="; ".join(x for x in (note, f"printed calories cell {r['kcal']!r}", a_note) if x)))
    return items


def hot_block(page: int, outside: str) -> tuple[str, int] | None:
    """The (machine, cup size) a hot drinks page is for, read from its own heading; None for the Chessington-only pages."""
    m = re.search(r"^(Coffeetek Vitali|Coffeetek Vitro X3|Egro Coffee Machines|Franke Coffee Machines)\b.*?(\d+)oz Cup Size", outside, re.M)
    if "Chessington" in outside:
        return None
    if not m:
        raise SystemExit(f"hot drinks chart page {page}: no machine and cup size heading found")
    return m.group(1), int(m.group(2))


def hot_name(row: dict, section: str, where: str) -> str:
    lines = row["name_lines"]
    if len(lines) == 2 and lines[1].lower() in MILKS:
        base = f"{lines[0]} ({lines[1]})"
    else:
        base = " ".join(lines)
    if section.startswith("Hot Chocolate Deluxe"):
        m = re.fullmatch(r"Hot Chocolate \(((?:Fresh|Oat|Soya) Milk)\)", base)
        if not m:
            raise SystemExit(f"{where}: unexpected name {base!r} under Hot Chocolate Deluxe")
        base = f"Hot Chocolate Deluxe ({m.group(1)}, cream and marshmallows)"
    return base


def hot_items(hot: dict) -> list[dict]:
    items = []
    seen_pages = []
    for (machine_printed, size), pages in HOT_BLOCKS.items():
        machine = MACHINE_NAME[machine_printed]
        category = f"Hot drinks, {machine} machine, {size}oz cup"
        for page in pages:
            seen_pages.append(page)
            block = hot_block(page, hot[page]["outside"])
            if block != (machine_printed, size):
                raise SystemExit(f"hot drinks chart page {page}: heading says {block}, expected {(machine_printed, size)}: the chart changed")
            got = sum(1 for t in hot[page]["tables"] for r in t["rows"] if not r["heading"])
            if got != HOT_ROWS[page]:
                raise SystemExit(f"hot drinks chart page {page}: {got} product rows, expected {HOT_ROWS[page]}: the chart changed, re-check")
            for table in hot[page]["tables"]:
                if not re.fullmatch(rf"hot drinks {size}oz cup size", table["title"]):
                    raise SystemExit(f"hot drinks chart page {page}: table header {table['title']!r} does not say {size}oz cup size")
                section = None
                for r in table["rows"]:
                    where = f"hot drinks chart page {page}, {r['name']!r}"
                    if r["heading"]:
                        if r["name"] not in HOT_SECTIONS:
                            raise SystemExit(f"{where}: new section heading {r['name']!r}: add it to HOT_SECTIONS")
                        section = r["name"]
                        continue
                    if section is None:
                        raise SystemExit(f"{where}: a row before any section heading")
                    if not r["kcal"]:
                        raise SystemExit(f"{where}: a row without calories")
                    allergens, a_note = row_allergens(r, where)
                    (k,) = parse_kcal(r["kcal"], where)
                    if k["basis"] is not None:
                        raise SystemExit(f"{where}: unexpected calories basis {k['basis']!r}")
                    base = hot_name(r, section, where)
                    serving, weight = f"{size}oz cup", ""
                    if section == "Syrups":
                        m = re.search(r"\((\d+ml)\)", base)
                        if not m:
                            raise SystemExit(f"{where}: syrup without a printed ml size")
                        serving = m.group(1)
                    elif section == "Toppings":
                        m = re.search(r"(\d+)g\b", base)
                        if not m:
                            raise SystemExit(f"{where}: topping without a printed weight")
                        serving, weight = f"{m.group(1)}g portion", m.group(1)
                    items.append(dict(name=f"{base} - {machine} {size}oz", category=category, serving=serving, calories=k["kcal"],
                                      weight_g=weight, tags="", rankable=False, allergens=allergens,
                                      notes="; ".join(x for x in (f"hot drinks chart p.{page}, section {section!r}; machine "
                                                                   f"{machine_printed}, {size}oz cup size", a_note) if x)))
    if sorted(seen_pages) != list(range(2, 34)):
        raise SystemExit("hot drinks blocks do not cover pages 2-33")
    return items


def left_out_counts(food: dict, hot: dict) -> list[str]:
    out = []
    for label, pages, data, chart in (("food chart", FOOD_LEFT_OUT, food, "food"), ("hot drinks chart", HOT_LEFT_OUT, hot, "hot")):
        n = 0
        for p in pages:
            if not re.search(r"\bonly\b", data[p]["outside"], re.I):
                raise SystemExit(f"{label} page {p} is skipped as venue-specific but prints no 'only' line: re-check the scope")
            n += sum(1 for t in data[p]["tables"] for r in t["rows"] if not r["heading"])
        out.append(f"{label} pages {pages[0]}-{pages[-1]} (skipped, venue-specific): {n} product rows")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("food_pdf", type=Path, help="the unlabelled food chart (FOOD_URL)")
    ap.add_argument("hot_pdf", type=Path, help="the hot drinks chart (HOT_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"food PDF sha256 {sha256_file(args.food_pdf)}  {args.food_pdf}")
    print(f"hot drinks PDF sha256 {sha256_file(args.hot_pdf)}  {args.hot_pdf}")
    food = reader.read_pdf(args.food_pdf, range(2, 28))
    hot = reader.read_pdf(args.hot_pdf, range(2, 37))
    for page, title in FOOD_PAGES.items():
        outside = food[page]["outside"]
        m = re.search(r"Chart - ([A-Za-z /]+?)\s+(?:Page:\s*)?\d+of27", outside)
        if not m or m.group(1) != title:
            raise SystemExit(f"food chart page {page}: title {m.group(1) if m else None!r}, expected {title!r}")
        if re.search(r"\bonly\b", outside, re.I):
            raise SystemExit(f"food chart page {page} now prints an 'only' line: it is venue-specific, re-check the scope")
    food_list = sorted(food_items(food), key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: page order inside a category
    items = food_list + hot_items(hot)
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        dup = sorted({n for n in names if names.count(n) > 1})
        raise SystemExit(f"item names are not unique: {dup}")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": PAGE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name=NAME, cuisine="Cafe", source_title=SOURCE_TITLE, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    by_cat: dict[str, int] = {}
    for i in items:
        by_cat[i["category"]] = by_cat.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}")
    for c, n in by_cat.items():
        print(f"  {c}: {n}")
    for line in left_out_counts(food, hot):
        print(line)


if __name__ == "__main__":
    main()
