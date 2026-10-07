#!/usr/bin/env python3
"""Build data/source/comptoir-libanais/ from Comptoir Libanais' official "Allergen & Calorie Menu" PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/comptoir_libanais.py path/to/guide.pdf --checked-on 2026-10-07 [--out DIR]

Source (the file the chain's own menus page links, as a visible button "Allergens & Calories"):
    https://www.comptoirlibanais.com/menus/  ->  https://bunny-wp-pullzone-5vpjsfiiqi.b-cdn.net/wp-content/uploads/2026/08/Comptoir_AllergenMenu_Spring2026_v07.pdf
    Spring 2026, Version 07; PDF created 21 Aug 2026, served Last-Modified 25 Aug 2026; 9 A4 pages with a text layer.
Needs poppler (`pdftotext`, `pdftocairo`, `pdfinfo`). The tables are read by position and by the drawn allergen circles: see
comptoir_libanais_pdf.py (nothing is converted, rounded or estimated there).

The guide prints calories ONLY, one number per dish in its "kcals" column (no serving sizes, no kJ, no protein/carbs/fat), so this
is a calories-only chain: protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains").

The same table carries each dish's allergens, so every published dish's allergens are read from its OWN row (no name matching):
a red circle = contains (the small word under it names the cereal or tree nut), a blue circle = may contain (the legend on every
page says so), teal circles = vegetarian / vegan. Printed comments are used only through the patterns in COMMENT_* below
("May contain: ...", "...potential cross-contact with Gluten (Barley, Wheat), Milk, Eggs", "...stored in same open fridge same as
other dairy products", the nut names printed beside Selection of Baklawa, "double N kcals", "Westfield only"); any other comment stops
the run. Allergens (docs/DATA.md "Allergens") are therefore complete for every published item.

Not published (each is printed by the script and listed in the final report):
- dishes whose kcals cell is empty or "xxx" (alternative-milk coffees and hot chocolates, Peach lemonade, cocktails, mocktails,
  wine, beer, cider, Arak, Karfa Sangria / Yalla Baby Yalla, Mixed Grill with Wings): no calorie figure is printed;
- Halloumi Man'ousha: the guide says "Westfield only" (a single venue).
Held back (in items.csv with the printed figure, listed in holdback.csv, not published):
- Mezze Platter "793pp" and Baklawa & Rose Mint Tea "528pp": the guide never says what "pp" means, so the basis is unclear;
- the four Wrap Platters (869 / 973 / 1206 / 1012): the chain's menus page says "Choose any wrap served with hommos & salad
  (293 kcal)" for that section, which contradicts them;
- Mixed Grill with Wings (takeaway) 1135: identical to the plain dine-in Mixed Grill, while every other takeaway grill is the
  dine-in figure + 241 (the Warm Olive Oil Bread figure) and the dine-in "with Wings" row prints xxx.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import comptoir_libanais_pdf as reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "comptoir-libanais"
SOURCE_URL = "https://bunny-wp-pullzone-5vpjsfiiqi.b-cdn.net/wp-content/uploads/2026/08/Comptoir_AllergenMenu_Spring2026_v07.pdf"
MENUS_PAGE = "https://www.comptoirlibanais.com/menus/"
SOURCE_TITLE = "Comptoir Libanais Allergen & Calorie Menu, Spring 2026, Version 07 (PDF created 21 August 2026)"
ALIASES = ["comptoir libanais", "comptoir"]
NOTE = ("Calories only, as printed in the guide's kcals column (it gives no serving sizes), so protein, carbs and fat are not "
        "published. Dishes with no calorie figure in the guide (most alternative-milk coffees, cocktails, wine, beer, some "
        "lemonades) are not listed, and the guide's drinks pages carry no 'may contain' marks.")
EXPECTED_ROWS = 160
EXPECTED_WITHOUT_KCAL = 53  # rows whose kcals cell is empty or "xxx" (not published)
# The words printed outside table cells that are not dishes: column headings, the legend, the version line.
EXPECTED_STRAY = {"SUITABLE", "FOR", "DOES", "IT", "CONTAIN", "May", "Contain", "Allergen", "Vegan", "/", "Vegetarian", "Version", "07"}

# (page, banner as printed, category shown, [dish names as printed in that section, in order]). Only dishes with a printed number.
SECTIONS = [
    (2, "NIBBLES", "Nibbles", ["Lebanese Pickles", "Marinated Olives", "Roasted Almonds"]),
    (2, "MEZZE", "Mezze", ["Mezze Platter", "Lentil Soup", "Hommos", "Baba Ghanuj", "Falafel", "Cheese Samboussek", "Chicken Samboussek",
                           "Feta & Pepper Dip", "Batata Harra", "Lebanese Wings", "Halloumi Steak", "Lamb Kibbeh", "Tabbouleh", "Fattoush"]),
    (2, "FLATBREADS", "Flatbreads", ["Warm Olive Oil Bread", "Za’atar & Garlic Bread"]),
    (3, "GRILLS", "Grills", ["Mixed Grill", "Lamb Kofta", "Chicken Taouk", "Chicken Kofta", "Lamb Kofta Burger", "Chicken Kofta Burger"]),
    (3, "TAKEAWAY GRILLS (with flatbread)", "Takeaway grills (with flatbread)",
     ["Mixed Grill", "Mixed Grill with Wings", "Lamb Kofta Grill", "Chicken Taouk", "Chicken Kofta"]),
    (3, "HOUSE SPECIALITIES", "House specialities", ["Roasted Salmon", "Spinach & Feta Borek", "Chicken Shawarma Rice Bowl", "Halloumi Man’ousha"]),
    (3, "TAGINES", "Tagines", ["Chicken & Green Olive", "Aubergine"]),
    (4, "SALADS", "Salads", ["Mama Zohra", "Grilled Halloumi"]),
    (4, "WRAP PLATTERS", "Wrap platters", ["Chicken Taouk", "Lamb Kofta", "Halloumi", "Falafel"]),
    (4, "SINGLE WRAPS (takeaway)", "Single wraps (takeaway)", ["Chicken Taouk", "Lamb Kofta", "Halloumi", "Falafel"]),
    (4, "SIDE DISHES & SAUCES", "Side dishes & sauces", ["Fries & Garlic Dip", "Quinoa", "Vermicelli Rice", "Couscous", "Garlic Sauce", "Tahina Sauce",
                                                         "Harissa Sauce", "Mint Yoghurt Sauce"]),
    (5, "DESSERTS", "Desserts", ["Mango Cheesecake", "Orange Blossom Mouhalabia", "Chocolate Brownie", "Orange & Almond Cake", "Selection of Baklawa",
                                 "Baklawa & Rose Mint Tea"]),
    (5, "Ice Cream (40g per scoop)", "Ice cream", ["Dairy Free Vanilla", "Pistachio", "Chocolate", "Rose"]),
    (5, "KIDS MENU", "Kids menu", ["Cheesy Chicken Flatbread", "Cheesy Tomato Flatbread", "Chicken Wrap", "Halloumi Wrap", "Chicken Taouk Bites",
                                   "Mezze Adventure Platter", "Dairy Free Ice Cream"]),
    (6, "BREAKFAST", "Breakfast", ["Comptoir Breakfast", "Veggie Breakfast", "Vegan Breakfast"]),
    (6, "Our Favourites", "Breakfast: our favourites", ["Shakshuka Egg & Feta", "Scrambled Egg & Feta", "Smoked Salmon & Scrambled Egg", "Shakshuka & Soujok",
                                                       "Poached Eggs", "Soujok Shakshuka Sandwich", "Soujok Man’ousha", "Za’tar & Halloumi Man’ousha"]),
    (6, "Morning Bakes & Bites", "Breakfast: morning bakes & bites", ["Butter Croissant", "Pain au Raisin", "Chocolate Croissant",
                                                                     "Soujok & Shakshuka Croissant", "Halloumi & Za’atar Croissant", "Orange & Almond Cake", "Fatayer"]),
    (6, "Mezze", "Breakfast: mezze", ["Ful Moudamas"]),
    (7, "Hot Drinks", "Hot drinks", ["Fresh Rose Mint Tea", "Orange blossom, hibiscus & mint tea", "Americano with Cow Milk", "Cappuccino with Cow Milk",
                                     "Latte with Cow Milk", "Flat White with Cow Milk", "Mocha with Cow Milk", "Macchiato with Cow Milk"]),
    (8, "Hot Drinks - Continued", "Hot drinks", ["Espresso Single", "Tahina & Date Molasses with Almond Milk", "Hot Chocolate with Cow Milk",
                                                "Lebanese Hot Choc. with Cow Milk"]),
    (8, "Homemade Lemonades / Loaded Lemonades", "Lemonades", ["Roomana", "Roza", "Toufaha", "Leymona", "Strawberyy"]),
]
# Section dishes that print no number are not listed above; every other printed row must be (the run stops otherwise).
# Names shown where they differ from the printed one (the same dish name recurs in several sections, or the type of dish helps).
NAMES = {
    ("GRILLS", "Lamb Kofta"): "Lamb Kofta Grill", ("GRILLS", "Chicken Taouk"): "Chicken Taouk Grill", ("GRILLS", "Chicken Kofta"): "Chicken Kofta Grill",
    ("TAKEAWAY GRILLS (with flatbread)", "Mixed Grill"): "Mixed Grill (takeaway, with flatbread)",
    ("TAKEAWAY GRILLS (with flatbread)", "Mixed Grill with Wings"): "Mixed Grill with Wings (takeaway, with flatbread)",
    ("TAKEAWAY GRILLS (with flatbread)", "Lamb Kofta Grill"): "Lamb Kofta Grill (takeaway, with flatbread)",
    ("TAKEAWAY GRILLS (with flatbread)", "Chicken Taouk"): "Chicken Taouk Grill (takeaway, with flatbread)",
    ("TAKEAWAY GRILLS (with flatbread)", "Chicken Kofta"): "Chicken Kofta Grill (takeaway, with flatbread)",
    ("TAGINES", "Chicken & Green Olive"): "Chicken & Green Olive Tagine", ("TAGINES", "Aubergine"): "Aubergine Tagine",
    ("SALADS", "Mama Zohra"): "Mama Zohra Salad", ("SALADS", "Grilled Halloumi"): "Grilled Halloumi Salad",
    ("WRAP PLATTERS", "Chicken Taouk"): "Chicken Taouk Wrap Platter", ("WRAP PLATTERS", "Lamb Kofta"): "Lamb Kofta Wrap Platter",
    ("WRAP PLATTERS", "Halloumi"): "Halloumi Wrap Platter", ("WRAP PLATTERS", "Falafel"): "Falafel Wrap Platter",
    ("SINGLE WRAPS (takeaway)", "Chicken Taouk"): "Chicken Taouk Single Wrap (takeaway)",
    ("SINGLE WRAPS (takeaway)", "Lamb Kofta"): "Lamb Kofta Single Wrap (takeaway)",
    ("SINGLE WRAPS (takeaway)", "Halloumi"): "Halloumi Single Wrap (takeaway)", ("SINGLE WRAPS (takeaway)", "Falafel"): "Falafel Single Wrap (takeaway)",
    ("Ice Cream (40g per scoop)", "Dairy Free Vanilla"): "Dairy Free Vanilla Ice Cream", ("Ice Cream (40g per scoop)", "Pistachio"): "Pistachio Ice Cream",
    ("Ice Cream (40g per scoop)", "Chocolate"): "Chocolate Ice Cream", ("Ice Cream (40g per scoop)", "Rose"): "Rose Ice Cream",
    ("Morning Bakes & Bites", "Orange & Almond Cake"): "Orange & Almond Cake (breakfast menu)",
    ("Hot Drinks", "Orange blossom, hibiscus & mint tea"): "Orange Blossom, Hibiscus & Mint Tea",
    ("Hot Drinks - Continued", "Lebanese Hot Choc. with Cow Milk"): "Lebanese Hot Chocolate with Cow Milk",
    ("Homemade Lemonades / Loaded Lemonades", "Strawberyy"): "Strawberry",  # printed "Strawberyy" (typo in the guide)
}
# Rows printed with a number that are not published, and why (the script checks the printed comment still says so).
EXCLUDED = {("HOUSE SPECIALITIES", "Halloumi Man’ousha"): ("Westfield only", "Single venue: the guide's comment says 'Westfield only'")}
# Rows published in items.csv with the printed figure but held back (holdback.csv): (section, printed name) -> reason.
HELD = {
    ("MEZZE", "Mezze Platter"): "Printed '793pp': the guide never says what 'pp' means (per person?), so the basis of the figure is unclear.",
    ("DESSERTS", "Baklawa & Rose Mint Tea"): "Printed '528pp': the guide never says what 'pp' means (per person?), so the basis of the figure is unclear.",
    ("TAKEAWAY GRILLS (with flatbread)", "Mixed Grill with Wings"):
        "Printed 1135, identical to the plain dine-in Mixed Grill (1135) on the same page, while every other takeaway grill is its dine-in "
        "figure + 241 (the Warm Olive Oil Bread figure) and the dine-in 'Mixed Grill with Wings' row prints xxx: the figure looks copied from another row.",
    **{("WRAP PLATTERS", n): ("The chain's own menus page (https://www.comptoirlibanais.com/menus/) says 'Choose any wrap served with hommos & salad "
                              "(293 kcal)' for Wrap Platters; the guide's figure for this platter is far higher, so the two figures contradict.")
       for n in ("Chicken Taouk", "Lamb Kofta", "Halloumi", "Falafel")},
}
SERVING = {("Ice Cream (40g per scoop)", None): ("1 scoop", "40"), ("Hot Drinks - Continued", "Espresso Single"): ("Single", "")}

# Chain-own spellings of allergen words (kept here, not in common._A).
EXTRA_WORDS = {"cashew nut": ("nuts", "cashew"), "pecan nut": ("nuts", "pecan"), "macadamia/queensland nut": ("nuts", "macadamia"),
               "brazil nut": ("nuts", "brazil nut")}
COMMENT_MAY = re.compile(r"^May contain: (.+)$")
COMMENT_FRYER = re.compile(r"^\*[A-Za-z’' ]+ is fried in a fryer with potential cross-contact with (.+)$")
COMMENT_FRIDGE = re.compile(r"^\*[A-Za-z’' ]+ is stored in same open fridge same as other dairy products$")
COMMENT_DOUBLE = re.compile(r"^double (\d+) kcals$")
COLUMN_KEYS = ["crustaceans", "milk", "peanuts", "sesame", "eggs", "fish", "nuts", "molluscs", "mustard", "celery", "sulphites", "lupin", "soya", "gluten"]
PORK = re.compile(r"\b(pork|bacon|ham|sausage|chorizo|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
NAMED_MEAT = re.compile(r"\b(chicken|lamb|salmon|fish|tuna|prawn|egg|eggs)\b", re.I)


def _split_words(text: str) -> list:
    text = re.sub(r"\([^)]*\)", "", text)
    return [w.strip() for w in re.sub(r"\s+and\s+", ",", text).split(",") if w.strip()]


def parse_allergens(row: dict) -> dict:
    where = f"page {row['page']} {row['name']!r}"
    contains, may, cereals, nuts = set(), set(), set(), set()
    for col, label in row["red"].items():
        if col not in COLUMN_KEYS:
            raise SystemExit(f"{where}: allergen mark in column {col!r}, which is not one of the 14")
        keys, c, n = allergen_words([col] + (label.split() if label else []), where, EXTRA_WORDS)
        if keys != {col}:
            raise SystemExit(f"{where}: the label {label!r} under the {col} mark names another allergen ({sorted(keys)})")
        if label and col not in ("gluten", "nuts"):
            raise SystemExit(f"{where}: label {label!r} under a mark in the {col} column")
        contains |= keys
        cereals |= c
        nuts |= n
    for col, label in row["blue"].items():
        if col not in COLUMN_KEYS or label:
            raise SystemExit(f"{where}: unexpected may-contain mark {col!r} label {label!r}")
        may |= allergen_words([col], where)[0]
    comment = row["comments"]
    if comment and not COMMENT_DOUBLE.match(comment) and comment != "Westfield only":
        m = COMMENT_MAY.match(comment)
        f = COMMENT_FRYER.match(comment)
        if m:
            may |= allergen_words(_split_words(m.group(1)), where, EXTRA_WORDS)[0]
        elif f:
            words = _split_words(f.group(1))
            may |= allergen_words(words, where)[0]
            inner = re.findall(r"\(([^)]*)\)", f.group(1))
            for part in inner:
                allergen_words([w.strip() for w in part.split(",")], where)  # the named cereals must be known words
        elif COMMENT_FRIDGE.match(comment):
            may.add("milk")
        else:
            words = _split_words(comment)
            keys, c, n = allergen_words(words, where, EXTRA_WORDS)
            if keys != {"nuts"} or "nuts" not in contains:
                raise SystemExit(f"{where}: unrecognised comment {comment!r}: add a pattern for it after reading the guide")
            nuts |= n
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


def build(pdf: Path) -> tuple:
    cover = reader.cover_text(pdf)
    if "SPRING 2026 Version 07" not in cover:
        raise SystemExit(f"The guide's version changed (cover reads ...{cover[-60:]!r}): update SOURCE_TITLE and re-check every table below")
    rows, stray = [], []
    for page in range(2, reader.pages(pdf) + 1):
        d = reader.read_page(pdf, page)
        rows += d["rows"]
        stray += d["stray"]
    if set(stray) - EXPECTED_STRAY:
        raise SystemExit(f"Words outside every table cell: {sorted(set(stray) - EXPECTED_STRAY)}: the layout changed")
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The guide has {len(rows)} dish rows, this script expects {EXPECTED_ROWS}: re-check SECTIONS")
    by_key = {}
    for r in rows:
        k = (r["page"], r["section"], r["name"])
        if k in by_key:
            raise SystemExit(f"{k} is printed twice")
        by_key[k] = r
    without = [r for r in rows if r["kcals"] in ("", "xxx")]
    if len(without) != EXPECTED_WITHOUT_KCAL:
        raise SystemExit(f"{len(without)} rows without a calorie figure, expected {EXPECTED_WITHOUT_KCAL}: re-check")
    for r in rows:
        if r["kcals"] not in ("", "xxx") and not re.fullmatch(r"\d+(pp)?", r["kcals"]):
            raise SystemExit(f"{r['name']!r}: calorie text {r['kcals']!r} is not a plain number (or number + pp): check the guide")
    # Rows printed with a number must be exactly those in SECTIONS.
    expected = [(p, s, n) for p, s, _, names in SECTIONS for n in names]
    printed = [(r["page"], r["section"], r["name"]) for r in rows if r["kcals"] not in ("", "xxx")]
    new, gone = sorted(set(printed) - set(expected)), sorted(set(expected) - set(printed))
    if new or gone:
        raise SystemExit(f"The guide changed. Printed with calories but not in SECTIONS: {new}. In SECTIONS but no longer printed with calories: {gone}.")
    items, holdback, report, ids = [], [], [], set()
    for page, section, category, names in SECTIONS:
        for printed_name in names:
            r = by_key[(page, section, printed_name)]
            if (section, printed_name) in EXCLUDED:
                comment, why = EXCLUDED[(section, printed_name)]
                if r["comments"] != comment:
                    raise SystemExit(f"{printed_name!r}: the comment is now {r['comments']!r}, expected {comment!r}: re-check the exclusion")
                report.append(f"excluded {printed_name!r} ({section}, {r['kcals']} kcal): {why}")
                continue
            name = NAMES.get((section, printed_name), printed_name)
            m = re.fullmatch(r"(\d+)(pp)?", r["kcals"])
            kcal = m.group(1)
            if r["teal"] and not set(r["teal"]) <= {"vegetarian", "vegan"}:
                raise SystemExit(f"{name}: unexpected teal mark columns {sorted(r['teal'])}")
            if "vegan" in r["teal"] and "vegetarian" not in r["teal"]:
                raise SystemExit(f"{name}: marked vegan but not vegetarian: check the guide")
            vegetarian = bool(r["teal"])
            tags = ["vegetarian"] if vegetarian else []
            if not vegetarian and PORK.search(name):
                tags.append("contains_pork")
            if not vegetarian and BEEF.search(name):
                tags.append("contains_beef")
            serving, weight = SERVING.get((section, printed_name), SERVING.get((section, None), ("", "")))
            notes = [f"printed kcals {r['kcals']!r}"]
            if r["comments"]:
                notes.append(f"comment: {r['comments']}")
            if name != printed_name:
                notes.append(f"printed name {printed_name!r}")
            if "vegan" in r["teal"] and (set(r["red"]) & {"milk", "eggs"}):
                notes.append("marked vegan although milk/egg are marked as contained (cross-contact comment): published as printed")
            al = parse_allergens(r)
            item_id = slug(name)
            if item_id in ids:
                raise SystemExit(f"duplicate item id {item_id}")
            ids.add(item_id)
            items.append(dict(id=item_id, name=name, category=category, serving=serving, weight_g=weight, calories=kcal, tags="|".join(tags),
                              rankable=False, notes="; ".join(notes), allergens=al, _vegetarian=vegetarian))
            if (section, printed_name) in HELD:
                holdback.append((item_id, HELD[(section, printed_name)]))
            dbl = COMMENT_DOUBLE.match(r["comments"])
            if dbl:
                dname = ("Espresso Double" if printed_name == "Espresso Single" else name + " (double)")
                did = slug(dname)
                if did in ids:
                    raise SystemExit(f"duplicate item id {did}")
                ids.add(did)
                items.append(dict(id=did, name=dname, category=category, serving="Double", weight_g="", calories=dbl.group(1), tags="|".join(tags),
                                  rankable=False, notes=f"printed in the comment of {printed_name!r}: {r['comments']!r}", allergens=al, _vegetarian=vegetarian))
    held_keys = {k for k in HELD}
    seen_held = {(s, n) for _, s, _, names in SECTIONS for n in names if (s, n) in HELD}
    if held_keys != seen_held:
        raise SystemExit(f"HELD names a dish that is not printed with calories: {sorted(held_keys - seen_held)}")
    for r in without:
        report.append(f"no calorie figure printed ({r['kcals'] or 'blank'}): {r['section']}: {r['name']}")
    return items, holdback, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"guide PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    items, holdback, report = build(args.pdf)
    veg = {i["id"]: i.pop("_vegetarian") for i in items}
    guide = {"title": "Comptoir Libanais Allergen & Calorie Menu, Spring 2026, Version 07", "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Comptoir Libanais", cuisine="Lebanese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    drinks = {"Hot drinks", "Lemonades"}
    unstated = [i["name"] for i in items if not veg[i["id"]] and i["category"] not in drinks and i["category"] not in ("Desserts", "Ice cream")
                and not NAMED_MEAT.search(i["name"])]
    print("\n".join(report))
    print(f"meat type not stated ({len(unstated)}): " + "; ".join(unstated))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")


if __name__ == "__main__":
    main()
