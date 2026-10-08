#!/usr/bin/env python3
"""Build data/source/park-holidays-uk/ from Park Holidays UK's example park menu with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/park_holidays_uk.py path/to/menu.pdf --checked-on 2026-10-08 [--fetch] [--out DIR]

Source (the file the chain's own page links as "Park menus - Download a park menu - Download a menu"):
    https://www.parkholidays.com/holidays/planning/food-drink  ->
    https://eu-assets.contentstack.com/v3/assets/bltdb98d8f2fea905ea/blte8404555326094de/685ab20efad56c215f14c586/Small_Spring_25_menu.pdf
    "Small Spring 25 menu": cover "MENU / SPRING 2025", footer "SPRING 25 MENU - 000000" (a template: no park name or park code), 2 A3 pages
    with a text layer, PDF created 2025-02-07. robots.txt: www.parkholidays.com only disallows /holidays/search; eu-assets.contentstack.com
    answers 404 (no robots file), so there are no rules. The page's "Select a park below to view an example menu" selector is empty
    (no park is listed), so this is the one park menu the chain links; the chain calls it an "example menu".
`--fetch` downloads it first (one request, normal browser User-Agent). Needs `pdftotext` (poppler); read by position: park_holidays_uk_pdf.py.

The menu prints calories ONLY ("1360 kcal" beside each dish name): protein, carbs, fat and salt are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"). Calories are copied from the PDF as printed. Only the item names, categories, servings and tags are
written by hand, in ITEMS below: the script stops if a dish printed on the page differs from this table (a new, renamed or removed dish, a
moved heading, another number of calorie values), so a human re-checks the table when Park Holidays publishes a new menu.

How the menu's own wording is read:
- Add-ons ("WHY NOT ADD: Extra cheese (3 slices) 110 kcal + £2.00", pizza toppings, "ADD A CHICKEN BREAST 85 kcal", the sauces, the ice cream
  scoops) are items of their own with the calories printed beside them (the add-on's own calories, far smaller than the dish).
- "WHY NOT ADD CHEESE 1221 kcal + £2.00" under the Tear & Share Garlic Bread prints a figure ABOVE the plain bread's 1031 kcal, so it is the
  figure for the bread with cheese on it (the menu does not say so in words): published as "Tear & Share Garlic Bread with added cheese".
  The bread is printed twice (Starters and the Pizzas panel) with the same two figures: published once, under Starters.
- Jacket potato: the potato prints 247 kcal and the filling options print their own figures ("CHEESE 380 kcal", "BEANS 108 kcal", "VEGAN CHEESE
  267 kcal"). The menu does not say whether 247 is the potato without its filling (the price includes a filling), so the fillings are separate
  items and the note on the potato says so.
- Held back (holdback.csv): "JACKET POTATO TUNA & SWEETCORN 149 kcal". The plain jacket potato, a part of that dish, prints 247 kcal, so 149
  cannot be the whole dish (it looks like the filling only); the menu's two figures contradict each other and neither is chosen.
- Not listed: the Sunday Roast ("ADULT from 700 kcal", "CHILD from 400 kcal" print a minimum for a choice of roasts, not a figure for a
  dish), the wines, beer, spirits and cocktails (no calories printed). The separate drinks menu PDF and kids menu (an image) print no calories.
- "NEW" before a dish name is a menu marker, not a limited-time flag. No serving size is printed for the dishes, so `serving` stays blank
  except where the same line or its heading gives one (pizzas "11 inch", "3 slices", "2 scoops").
- Tags: vegetarian when the dish line carries the menu's own V or VE mark. contains_pork / contains_beef when the dish's printed name or its
  description says so (bacon, ham, sausage, pepperoni; beef, steak, "lean minced beef"). Nothing else is inferred.

Allergens (docs/DATA.md "Allergens") are link-only. The menu prints no per-dish allergens beyond V / VE / GF; its "Allergy information" QR code
leads to https://www.phukallergens.work/ ("Allergen List 2026 | PHForms", a Wix site), whose "Park Holidays Allergens Page"
(/blank-44-1-1) is a single image dated 22 Sept 2026 (file name "PH Allergens 220926"): an image, a different edition from the Spring 2025
menu, hosted on static.wixstatic.com whose robots.txt answers 403 (so it is not downloaded). No allergen is copied; only the page is linked.
"""
from __future__ import annotations
import argparse
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import park_holidays_uk_pdf as pdf_reader  # noqa: E402
import robots_rfc  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "park-holidays-uk"
PAGE_URL = "https://www.parkholidays.com/holidays/planning/food-drink"
SOURCE_URL = ("https://eu-assets.contentstack.com/v3/assets/bltdb98d8f2fea905ea/blte8404555326094de/685ab20efad56c215f14c586/"
              "Small_Spring_25_menu.pdf")
SOURCE_TITLE = ("Park Holidays UK example park menu with calories, \"Small Spring 25 menu\" (Spring 2025; PDF created 7 February 2025; "
                "the park menu linked from parkholidays.com/holidays/planning/food-drink)")
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ALIASES = ["park holidays", "park holidays uk", "park holidays uk restaurant", "park holidays restaurant", "park holidays bar",
           "park holidays clubhouse", "park holidays bar and restaurant"]
ALLERGEN_GUIDE_TITLE = ("Park Holidays UK allergen information page (phukallergens.work, reached by the \"Allergy information\" QR code on the "
                        "chain's own menu; a single image dated 22 September 2026, not matched to this menu)")
ALLERGEN_GUIDE_URL = "https://www.phukallergens.work/blank-44-1-1"
# The menu prints that all dishes are prepared in kitchens where all known allergens are present and nothing can be guaranteed allergen
# free: a general warning, but the linked page is not read, so no per-dish "may contain" information is published from it.
MAY_CONTAIN_PUBLISHED = False
NOTE = ("Calories only, per dish as printed. This is the example menu for a small park (Spring 2025) that Park Holidays links; dishes and "
        "prices differ by park and season. Wines, other drinks and the Sunday Roast ('from' calories only) are not listed. All dishes are "
        "cooked in kitchens where all known allergens are present.")
EXPECTED_TOKENS = 78
EXPECTED_FROM = {("SUNDAY ROAST", "ADULT from", "700"), ("SUNDAY ROAST", "CHILD from", "400")}

LB, ST, FV, TM, SD, GR, PZ, DS, CF, TE = ("Lite Bites", "Starters", "Favourites", "2 Meals for £25", "Sides", "From the Grill", "Pizzas",
                                         "Desserts", "Coffee", "Tea")
CATEGORY_ORDER = [LB, ST, FV, TM, SD, GR, PZ, DS, CF, TE]
SECTION_CATEGORY = {"LITE BITES": LB, "STARTERS": ST, "FAVOURITES": FV, "2 MEALS FOR £25": TM, "SIDES": SD, "FROM THE GRILL": GR,
                    "PIZZAS": PZ, "DESSERTS": DS, "COFFEE": CF, "TEAS": TE}
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)


def E(section, printed, name, cat=None, serving="", pork=False, beef=False, note="", dup_of=None):
    return dict(section=section, printed=printed, name=name, cat=cat or SECTION_CATEGORY[section], serving=serving, pork=pork, beef=beef,
                note=note, dup_of=dup_of)


FILL = "Printed under 'Filling options'; the menu does not say whether the potato's 247 kcal already includes a filling"
ADD = "Printed as an add-on with its own price: the add-on's own calories"
TOP1 = "Printed under 'ADD EXTRA TOPPINGS FOR £1 EACH': the topping's own calories"
TOP2 = "Printed under 'EXTRA TOPPINGS FOR £2 EACH': the topping's own calories"
PIZ = "Printed under 'All above are available as gluten free bases'; 11\" sourdough base"
# One entry per dish line the PDF prints with calories, keyed by section and the printed name (a leading NEW removed). The two Tear & Share
# lines in PIZZAS are the same dish as in STARTERS (printed twice): they must carry the same figures and are not published again.
ITEMS = [
    E("LITE BITES", "CHICKEN WRAP", "Chicken Wrap", note="Printed under 'AMAZING VALUE ALL UNDER £10'"),
    E("LITE BITES", "THREE CHEESE & ONION TOASTIE", "Three Cheese & Onion Toastie", note="'All our toasties come with a side of chips'"),
    E("LITE BITES", "BBQ CHICKEN TOASTIE", "BBQ Chicken Toastie", note="'All our toasties come with a side of chips'"),
    E("LITE BITES", "TUNA MELT TOASTIE", "Tuna Melt Toastie", note="'All our toasties come with a side of chips'"),
    E("LITE BITES", "JACKET POTATO", "Jacket Potato",
      note="'Baked potato with your choice of filling & salad garnish'; the fillings print their own calories (listed separately); the menu "
           "does not say whether 247 includes a filling"),
    E("LITE BITES", "CHEESE", "Jacket Potato Filling: Cheese", note=FILL),
    E("LITE BITES", "BEANS", "Jacket Potato Filling: Beans", note=FILL),
    E("LITE BITES", "VEGAN CHEESE", "Jacket Potato Filling: Vegan Cheese", note=FILL),
    E("LITE BITES", "JACKET POTATO TUNA & SWEETCORN", "Jacket Potato Tuna & Sweetcorn",
      note="HELD BACK: the plain Jacket Potato prints 247 kcal, so 149 cannot be the whole dish (probably the filling only)"),
    E("STARTERS", "TOMATO & BASIL SOUP", "Tomato & Basil Soup", note="Served with a bread roll & butter"),
    E("STARTERS", "GARLIC CIABATTA BITES BUCKET", "Garlic Ciabatta Bites Bucket", note="Name printed on two lines; 'Bucket Style, great to mix & match'"),
    E("STARTERS", "ONION BHAJIS BUCKET", "Onion Bhajis Bucket", note="Marks V VE GF; 'Bucket Style, great to mix & match'"),
    E("STARTERS", "CHICKEN GOUJON BUCKET", "Chicken Goujon Bucket", note="'Bucket Style, great to mix & match'"),
    E("STARTERS", "ONION RING TOWER", "Onion Ring Tower", note="'Ideal for sharing'"),
    E("STARTERS", "TEAR & SHARE GARLIC BREAD", "Tear & Share Garlic Bread", note="'Ideal for sharing'; printed again under Pizzas with the same figure"),
    E("STARTERS", "WHY NOT ADD CHEESE", "Tear & Share Garlic Bread with added cheese",
      note="Printed 'WHY NOT ADD CHEESE 1221 kcal + £2.00'; the figure is above the plain bread's 1031, so it is read as the bread with cheese"),
    E("FAVOURITES", "PIRI-PIRI ROAST CHICKEN", "Piri-Piri Roast Chicken", note="Mark GF"),
    E("FAVOURITES", "SCAMPI", "Scampi", note="Marine Stewardship Council mark"),
    E("FAVOURITES", "CHICKEN HAM HOCK & LEEK PIE", "Chicken Ham Hock & Leek Pie", pork=True, note="Description: 'chicken, slow cooked ham hock and leeks'"),
    E("FAVOURITES", "FISH ‘N’ CHIPS", "Fish 'n' Chips", note="Marine Stewardship Council mark; gluten free batter available"),
    E("FAVOURITES", "CHIP SHOP PLATTER", "Chip Shop Platter", pork=True, note="Marked NEW; description: 'battered sausage'"),
    E("2 MEALS FOR £25", "MAC ‘N’ CHEESE", "Mac 'n' Cheese", note="Served with garlic bread"),
    E("2 MEALS FOR £25", "ADD A CHICKEN BREAST", "Add a Chicken Breast (to Mac 'n' Cheese)", note=ADD),
    E("2 MEALS FOR £25", "TRADITIONAL HAM, EGG & CHIPS", "Traditional Ham, Egg & Chips", pork=True, note="Mark GF"),
    E("2 MEALS FOR £25", "CHILLI CON CARNE", "Chilli Con Carne", beef=True, note="Description: 'Lean minced beef'"),
    E("2 MEALS FOR £25", "SAUSAGE & MASH", "Sausage & Mash", pork=True, note="Description: '3 Cumberland sausages'"),
    E("SIDES", "5 BATTERED ONION RINGS", "5 Battered Onion Rings"),
    E("SIDES", "DIRTY HOUSE CHIPS", "Dirty House Chips", pork=True, note="Description: 'crispy smoked bacon'"),
    E("SIDES", "PORTION OF CHIPS", "Portion of Chips"),
    E("SIDES", "CHEESY CHIPS", "Cheesy Chips"),
    E("SIDES", "GARLIC BREAD", "Garlic Bread", note="'3 slices of toasted bread'"),
    E("SIDES", "CHEESY GARLIC BREAD", "Cheesy Garlic Bread", note="'3 slices of toasted garlic bread topped with melted cheese'"),
    E("SIDES", "MIXED GREEN VEGETABLES", "Mixed Green Vegetables"),
    E("SIDES", "RED CABBAGE WITH APPLE", "Red Cabbage with Apple"),
    E("SIDES", "COLESLAW", "Coleslaw"),
    E("FROM THE GRILL", "HOUSE CHEESEBURGER", "House Cheeseburger", note="'double quarter pounders': meat type not stated"),
    E("FROM THE GRILL", "BACON BBQ BURGER", "Bacon BBQ Burger", pork=True, note="'2 massive quarter pounders ... bacon'; the patty's meat type is not stated"),
    E("FROM THE GRILL", "CHARGRILLED CHICKEN BBQ BURGER", "Chargrilled Chicken BBQ Burger", note="Name printed on two lines"),
    E("FROM THE GRILL", "PLANT BASED BURGER", "Plant Based Burger", note="Marks V VE; gluten free buns available"),
    E("FROM THE GRILL", "Extra cheese (3 slices)", "Add Extra Cheese (3 slices)", serving="3 slices", note=ADD + " ('WHY NOT ADD', + £2.00)"),
    E("FROM THE GRILL", "4oz beef pattie", "Add 4oz Beef Pattie", serving="4oz", beef=True, note=ADD + " ('WHY NOT ADD', + £3.00)"),
    E("FROM THE GRILL", "Bacon ( 2 slices)", "Add Bacon (2 slices)", serving="2 slices", pork=True, note=ADD + " ('WHY NOT ADD', + £2.00)"),
    E("FROM THE GRILL", "8oz SIRLOIN STEAK", "8oz Sirloin Steak", beef=True, note="Marked NEW"),
    E("FROM THE GRILL", "SURF & TURF", "Surf & Turf", beef=True, note="Marked NEW; 8oz sirloin steak and six pieces of scampi"),
    E("FROM THE GRILL", "ADD DIANE SAUCE OR PEPPERCORN SAUCE", "Add Diane Sauce or Peppercorn Sauce",
      note=ADD + " (+ £2.50); one figure printed for either sauce"),
    E("PIZZAS", "TEAR & SHARE GARLIC BREAD", None, dup_of=("STARTERS", "TEAR & SHARE GARLIC BREAD")),
    E("PIZZAS", "WHY NOT ADD CHEESE", None, dup_of=("STARTERS", "WHY NOT ADD CHEESE")),
    E("PIZZAS", "MARGHERITA PIZZA", "Margherita Pizza", serving="11 inch", note=PIZ),
    E("PIZZAS", "PERFECT PEPPERONI", "Perfect Pepperoni Pizza", serving="11 inch", pork=True, note=PIZ + "; 'spicy pepperoni sausage'"),
    E("PIZZAS", "MIGHTY MEAT FEAST", "Mighty Meat Feast Pizza", serving="11 inch", pork=True,
      note=PIZ + "; meatballs (meat type not stated), pepperoni, ham, chicken slices"),
    E("PIZZAS", "Red onions", "Pizza Topping: Red Onions", note=TOP1),
    E("PIZZAS", "Tomatoes", "Pizza Topping: Tomatoes", note=TOP1),
    E("PIZZAS", "Jalapeños", "Pizza Topping: Jalapeños", note=TOP1),
    E("PIZZAS", "Cheese", "Pizza Topping: Cheese", note=TOP2),
    E("PIZZAS", "Pepperoni", "Pizza Topping: Pepperoni", pork=True, note=TOP2),
    E("PIZZAS", "Chicken", "Pizza Topping: Chicken", note=TOP2),
    E("PIZZAS", "BBQ chicken", "Pizza Topping: BBQ Chicken", note=TOP2),
    E("PIZZAS", "Meat Balls", "Pizza Topping: Meat Balls", note=TOP2 + "; meat type not stated"),
    E("DESSERTS", "STICKY TOFFEE PUDDING", "Sticky Toffee Pudding", note="With custard & toffee sauce"),
    E("DESSERTS", "APPLE CRUMBLE", "Apple Crumble", note="Served with custard"),
    E("DESSERTS", "PANCAKE DELIGHT", "Pancake Delight", note="3 American style pancakes, berries, ice cream, cream"),
    E("DESSERTS", "DOUGHNUT TOWER", "Doughnut Tower", note="'Ideal for sharing'; 6 sugared ring doughnuts with chocolate and toffee sauces"),
    E("DESSERTS", "Why not add 2 scoops of vanilla ice cream", "Vanilla Ice Cream (2 scoops)", serving="2 scoops",
      note="Printed 'Why not add 2 scoops ... 170 kcal £2.95' under the Doughnut Tower"),
    E("DESSERTS", "or 4 scoops of vanilla ice cream", "Vanilla Ice Cream (4 scoops)", serving="4 scoops",
      note="Printed 'or 4 scoops ... 340 kcal £4.95' under the Doughnut Tower"),
    E("COFFEE", "ESPRESSO", "Espresso", note="No size printed"),
    E("COFFEE", "DOUBLE ESPRESSO", "Double Espresso", note="No size printed"),
    E("COFFEE", "AMERICANO", "Americano", note="No size printed"),
    E("COFFEE", "CAFFE LATTE", "Caffe Latte", note="No size printed"),
    E("COFFEE", "FLAT WHITE", "Flat White", note="No size printed"),
    E("COFFEE", "CAPPUCCINO", "Cappuccino", note="No size printed"),
    E("COFFEE", "CAFFE MOCHA", "Caffe Mocha", note="No size printed"),
    E("COFFEE", "HOT CHOCOLATE", "Hot Chocolate", note="No size printed"),
    E("TEAS", "EARL GREY TEA", "Earl Grey Tea", note="No size printed"),
    E("TEAS", "DECAF TEA", "Decaf Tea", note="No size printed"),
    E("TEAS", "BREAKFAST TEA", "Breakfast Tea", note="No size printed"),
    E("TEAS", "LEMON TEA", "Lemon Tea", note="No size printed"),
    E("TEAS", "PEPPERMINT TEA", "Peppermint Tea", note="No size printed"),
    E("TEAS", "GREEN TEA", "Green Tea", note="No size printed"),
]
HOLDBACK = {
    "jacket-potato-tuna-and-sweetcorn": ("The menu prints 149 kcal for this dish but 247 kcal for the plain Jacket Potato, a part of it, so the two "
                                         "figures contradict each other (149 looks like the filling only); neither is chosen"),
}


def fetch(dest: Path) -> None:
    """One polite download of the PDF; robots.txt of both hosts is read first (RFC 9309 matching, robots_rfc.py)."""
    for site, path in (("https://www.parkholidays.com", "/holidays/planning/food-drink"),
                       ("https://eu-assets.contentstack.com", "/v3/assets/bltdb98d8f2fea905ea/blte8404555326094de/685ab20efad56c215f14c586/Small_Spring_25_menu.pdf")):
        rules: list = []
        try:
            req = urllib.request.Request(site + "/robots.txt", headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as resp:
                rules = robots_rfc.parse(resp.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise SystemExit(f"{site}/robots.txt answered HTTP {e.code}: unreadable, stopping (never work round a block)")
        if not robots_rfc.allowed(rules, path):
            raise SystemExit(f"robots.txt of {site} disallows {path}")
        time.sleep(1.1)
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        dest.write_bytes(resp.read())


def build_items(tokens: list, from_tokens: list) -> list:
    got_from = {(t["section"], t["name"], t["kcal"]) for t in from_tokens}
    if got_from != EXPECTED_FROM:
        raise SystemExit(f"The 'from' calorie lines changed: now {sorted(got_from)}, expected {sorted(EXPECTED_FROM)}")
    if len(tokens) != EXPECTED_TOKENS:
        raise SystemExit(f"Expected {EXPECTED_TOKENS} calorie values, read {len(tokens)}: the menu changed, re-check ITEMS")
    found = {}
    for t in tokens:
        printed = re.sub(r"^NEW ", "", t["name"])
        key = (t["section"], printed)
        if key in found:
            raise SystemExit(f"{key} is printed twice in the same section: check the layout")
        found[key] = dict(t, printed=printed, new=printed != t["name"])
    table = {(e["section"], e["printed"]): e for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (section, printed name)")
    new, gone = sorted(set(found) - set(table)), sorted(set(table) - set(found))
    if new or gone:
        raise SystemExit(f"The menu changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. "
                         "Update ITEMS (names, categories) after reading the new menu.")
    items = []
    for e in ITEMS:
        d = found[(e["section"], e["printed"])]
        if e["dup_of"]:
            first = found[e["dup_of"]]
            if (first["kcal"], sorted(first["marks"])) != (d["kcal"], sorted(d["marks"])):
                raise SystemExit(f"{e['printed']} is printed twice with different figures or marks: {first['kcal']} vs {d['kcal']}")
            continue
        if PORK.search(e["name"]) and not e["pork"]:
            raise SystemExit(f"{e['name']}: the name says pork but ITEMS has no pork tag")
        if BEEF.search(e["name"]) and not e["beef"]:
            raise SystemExit(f"{e['name']}: the name says beef but ITEMS has no beef tag")
        tags = []
        if any(m in ("V", "VE") for m in d["marks"]):
            tags.append("vegetarian")
        if e["pork"]:
            tags.append("contains_pork")
        if e["beef"]:
            tags.append("contains_beef")
        printed_note = f"Printed '{d['line']}'" + (" NEW" if d["new"] else "") + (f", marks: {' '.join(d['marks'])}" if d["marks"] else "")
        items.append(dict(name=e["name"], category=e["cat"], serving=e["serving"], calories=d["kcal"], tags="|".join(tags), rankable=False,
                          notes="; ".join(x for x in (e["note"], printed_note) if x)))
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    ids = {slug(i["name"]) for i in items}
    for hid in HOLDBACK:
        if hid not in ids:
            raise SystemExit(f"holdback id {hid} is not an item id")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL); with --fetch it is downloaded to this path first")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.pdf)
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    tokens, from_tokens = pdf_reader.read_tokens(args.pdf)
    items = build_items(tokens, from_tokens)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Park Holidays UK", cuisine="Holiday park restaurant", source_title=SOURCE_TITLE,
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=sorted(HOLDBACK.items()), allergen_guide=guide, nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"held back: {sorted(HOLDBACK)}; not listed (a minimum, not a figure): {sorted(EXPECTED_FROM)}")


if __name__ == "__main__":
    main()
