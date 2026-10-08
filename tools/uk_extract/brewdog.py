#!/usr/bin/env python3
"""Build data/source/brewdog/ from BrewDog's official "Burger & Wings Menu" calorie file (a CALORIES-ONLY chain).

    python3 tools/uk_extract/brewdog.py path/to/Burger_Menu.pdf --checked-on 2026-10-08 [--out DIR]

Source (BrewDog's own page lists the file under "Calories" -> "Burger & Wings Menu"):
    https://brewdog.com/pages/food-info-allergens  ->  button "Burger & Wings Menu"
    https://cdn.shopify.com/s/files/1/0822/7281/3382/files/Burger_Menu.pdf?v=1779267492
    PDF created 20 May 2026 08:44 UTC (Microsoft Excel export, author Derek Regan), 7 A4 pages, text layer; pages 5-7 are empty
    table rows. The menu itself prints no date. robots.txt of brewdog.com and cdn.shopify.com allow the page and the file.
Needs `pdftotext` (poppler).

The file is a two-column table, "DISHES" and "kCal": one printed number per dish, no sizes, weights or other nutrients. So the chain
is calories-only (docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank (never 0) and every item is not rankable.
Calories are copied from the PDF as printed. Only names, categories, servings and tags are written by hand, in GROUPS below: the
script stops if the rows printed in the PDF differ from that table (a new, renamed, removed or moved dish, another heading, a
different number of rows), so a human re-checks it when BrewDog publishes a new file.

How the file's own wording is read:
- The table is cropped to its own columns (the stray character "i" printed outside the table on page 1 is ignored).
- Headings are the rows with no number (WINGS, Snacks, Big Snacks, BURGERS, BURGER ADD ONS, SUBS & MELTS, SIDE, SALADS, KIDS HOPPY
  MEALS, DESSERTS, DIPS). A blank row between dishes starts a new block under the same heading. Under WINGS the file prints four
  blocks with no sub-headings (wings, tenders, cauliflower wings, cluckless tenders): they become four categories. "The Feast" and
  "The Plant Stack" sit in their own block after Big Snacks; BrewDog's own allergen table for burger sites lists both under BIG SNACKS,
  so they are filed there.
- "5 x Buffalo Chicken Wings" becomes the item "Buffalo Chicken Wings (5)" with serving "5 wings": the count is the file's own.
  Printed spellings are kept, including the file's inconsistent "Louisianna Wings" (5) against "Louisianna Chicken Wings" (10, 15)
  and "Herby Louisianna Tenders" (3) against "Louisianna Chicken Tenders" (5): we do not merge names the file prints differently.
  The one typo fixed is "Caeser" -> "Caesar" in the salad's name (BrewDog's own allergen table spells it Caesar).
- "Fries lrg" / "Fries reg" are the file's own large / regular sizes. "add fried Chicken", "add jalapenos & bacon" and "add shortrib"
  are printed under Cracking Mac & Cheese in the Snacks block and "add Chicken" under Golden State Greens in Salads: each is the
  add-on's own calories; the file does not name the dish it is added to, so none is stated.
- "2 Buffalo Chicken Tender" etc. are under BURGER ADD ONS: two tenders added to a burger (the add-on's own calories).
- Drinks (beer, cocktails, soft drinks) are not in this file, and BrewDog's pizza, brunch, Newcastle pizza and slow-cooked-meats
  calorie files are separate files: not covered here.
- Tags: vegetarian only where the dish's own name says vegan; contains_pork / contains_beef only where the name says bacon, ham,
  sausage, pork... / beef, steak. Nothing else is inferred (the file prints no ingredients).

Allergens (docs/DATA.md "Allergens") are link-only. BrewDog publishes allergen matrices per bar and per menu, with the kitchen's recipe
names and dates ("Patriot Burger - BrewDog - April 2022", "Large (15) Buffalo Chicken Wings - Brewdog - May 2025"): only one size of a
wing flavour, no row at all for many dishes of this calorie file (Big Pastrami, Philly Smash, Hazy & Hash, Root 66, BBQ Beyond, New
Yorker, Chicken Parm, Beyond Meatball, Brisket & Onion, Golden State Greens, Rainbow Slaw, Tater Tots, Loaded Donut, Marinara,
Lemon Ricotta, Beer Cheese...), and rows with no mark at all that cannot be told from "not filled in". Allergens are safety
information: no name matching, no guessing, so only the page's link is published (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "brewdog"
SOURCE_URL = "https://cdn.shopify.com/s/files/1/0822/7281/3382/files/Burger_Menu.pdf?v=1779267492"
SOURCE_TITLE = "BrewDog Burger & Wings Menu calories (PDF created 20 May 2026; the menu itself shows no date)"
ALIASES = ["brewdog", "brew dog", "brewdog bar", "brewdog doghouse"]
ALLERGEN_GUIDE_TITLE = "BrewDog UK bars: food calories and allergens page (per-bar allergen matrices; accessed 2026-10-08, no date shown)"
ALLERGEN_GUIDE_URL = "https://brewdog.com/pages/food-info-allergens"
# The matrices print "Does contain" and "May contain" cells: traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("BrewDog's Burger & Wings menu file prints calories only, one figure per dish as listed, so protein, carbs and fat are not "
        "published. It has no drinks, pizza, brunch or slow-cooked meats (separate BrewDog files). Menus differ by bar. The file is undated.")
EXPECTED_ITEMS = 126

# (heading as printed, block number under that heading, category, [printed dish names in order]).
WINGS, TEND, CAULI, CLUCK = "Wings", "Tenders", "Cauli wings", "Cluckless tenders"
GROUPS = [
    ("WINGS", 0, WINGS, [
        "5 x  Buffalo Chicken Wings", "10 x Buffalo Chicken Wings", "15 x Buffalo Chicken Wings",
        "5 x  Korean Chicken Wings", "10 x  Korean Chicken Wings", "15 x Korean Chicken Wings",
        "5 x  Dragon Spice Chicken Wings", "10 x  Dragon Spice Chicken Wings", "15 x Dragon Spice Chicken Wings",
        "5 x  BBQ Chicken Wings", "10 x BBQ Chicken Wings", "15 x  BBQ Chicken Wings",
        "5 x Louisianna Wings", "10 x Louisianna Chicken Wings", "15 x Louisianna Chicken Wings"]),
    ("WINGS", 1, TEND, [
        "3 x  Buffalo Chicken Tenders", "5 x Buffalo Chicken Tenders", "3 x  Korean Chicken Tenders", "5 x  Korean Chicken Tenders",
        "3 x  Dragon Spice Chicken Tenders", "5 x  Dragon Spice Chicken Tenders", "3 x  BBQ Chicken Tenders", "5 x BBQ Chicken Tenders",
        "3 x Herby Louisianna Tenders", "5 x Louisianna Chicken Tenders"]),
    ("WINGS", 2, CAULI, [
        "5 x  Buffalo Cauli Wings", "10 x Buffalo Cauli Wings", "15 x Buffalo Cauli Wings",
        "5 x  Korean Cauli Wings", "10 x  Korean Cauli Wings", "15 x  Korean Cauli Wings",
        "5 x  Dragon Spice Cauli Wings", "10 x  Dragon Spice Cauli Wings", "15 x Dragon Spice Cauli Wings",
        "5 x  BBQ Cauli Wings", "10 x BBQ Cauli Wings", "15 x  BBQ Cauli Wings",
        "5 x Louisianna Cauli Wings", "10 x Louisianna Cauli Wings", "15 x Louisianna Cauli Wings"]),
    ("WINGS", 3, CLUCK, [
        "6 x  Buffalo Cluckless Tenders", "9 x Buffalo Cluckless Tenders", "6 x  Korean Cluckless Tenders", "9 x Korean Cluckless Tenders",
        "6 x  Dragon Spice Cluckless Tenders", "9 x Dragon Spice Cluckless Tenders", "6 x  BBQ Cluckless Tenders", "9 x BBQ Cluckless Tenders",
        "6 x  Louisianna Cluckless Tenders", "9 x Louisianna Cluckless Tenders"]),
    ("Snacks", 0, "Snacks", [
        "Frickles", "Cracking Mac & Cheese", "add fried Chicken", "add jalapenos & bacon", "add shortrib", "Loaded Street Corn",
        "Fries lrg", "Louisianna Fries lrg"]),
    ("Big Snacks", 0, "Big snacks", [
        "Buffalo Loaded Fries", "Korean Loaded Fries", "Cheeseburger Loaded Fries", "Spice Bag Fries", "Spice Bag Fries with Chicken",
        "Loaded Tater Tots"]),
    ("Big Snacks", 1, "Big snacks", ["The Feast", "The Plant Stack"]),
    ("BURGERS", 0, "Burgers", ["Oklahoma Stack", "The Pit", "Patriot", "The Punk", "Big Pastrami", "Philly Smash"]),
    ("BURGERS", 1, "Burgers", ["Return of the Mac", "Buffalo Chicken", "Cluck Norris"]),
    ("BURGERS", 2, "Burgers", ["BBQ Beyond", "Hazy & Hash", "Root 66", "What the Cluck"]),
    ("BURGER ADD ONS", 0, "Burger add-ons", [
        "2 Buffalo Chicken Tender", "2 Korean Chicken Tender", "2 Louisianna Chicken Tender", "2 Smoky BBQ Chicken Tender",
        "2 Dragon Spice Chicken Tender", "Beer Cheese"]),
    ("SUBS & MELTS", 0, "Subs & melts", ["Cuban Melt", "New Yorker", "Chicken Parm", "Beyond Meatball", "Brisket & Onion"]),
    ("SIDE", 0, "Sides", ["Fries reg", "Louisianna Fries reg", "Onion Rings", "Chopped Salad", "Rainbow Slaw", "Mini Mac N Cheese", "Tater Tots"]),
    ("SALADS", 0, "Salads", ["Chicken & Bacon Caeser Salad", "Golden State Greens", "add Chicken", "Buffalo Chicken Bowl"]),
    ("KIDS HOPPY MEALS", 0, "Kids Hoppy meals", [
        "Kids Hoppy Hamburger", "Kids Hoppy Cheeseburger", "Kids Hoppy Vegan Hamburger", "Kids Hoppy Vegan Cheeseburger",
        "Kids Hoppy Nuggets", "Kids Hoppy Tenders", "Kids Hoppy Rebel Tenders", "Kids Hoppy Billy the Grill"]),
    ("DESSERTS", 0, "Desserts", [
        "XL Cookie Skillet", "Loaded Donut", "Toffee Ice Cream Sando", "Deep Fried Oreos", "Deep Fried Oreos with Ice Cream",
        "Ice Cream 2 Scoops", "Ice Cream 3 Scoops"]),
    ("DIPS", 0, "Dips", [
        "Buffalo Sauce", "Ranch Mayo", "BBQ Sauce", "Blue Cheese Dip", "Korean BBQ Sauce", "Sriracha Mayo", "Garlic Mayo", "Marinara",
        "Lemon Ricotta", "Vegan Mayo"]),
]

# Display name and serving where the printed text is not used as it stands (printed text -> (name, serving)).
OVERRIDES = {
    "Fries lrg": ("Fries (large)", "Large"),
    "Louisianna Fries lrg": ("Louisianna Fries (large)", "Large"),
    "Fries reg": ("Fries (regular)", "Regular"),
    "Louisianna Fries reg": ("Louisianna Fries (regular)", "Regular"),
    "add fried Chicken": ("Add fried chicken", ""),
    "add jalapenos & bacon": ("Add jalapenos & bacon", ""),
    "add shortrib": ("Add shortrib", ""),
    "add Chicken": ("Add chicken", ""),
    "Chicken & Bacon Caeser Salad": ("Chicken & Bacon Caesar Salad", ""),
    "Ice Cream 2 Scoops": ("Ice Cream (2 scoops)", "2 scoops"),
    "Ice Cream 3 Scoops": ("Ice Cream (3 scoops)", "3 scoops"),
}
COUNTED = re.compile(r"^(\d+)\s*x\s+(.+)$")
ADDON_TENDERS = re.compile(r"^(\d+) (.+) Tender$")
VEGAN = re.compile(r"\bvegan\b", re.I)
PORK = re.compile(r"\b(pork|bacon|ham|sausage|sausages|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
ROW = re.compile(r"^(.+?)\s{2,}(\d{1,4})$")
# Crop (points) that holds the table and nothing else: the table spans about x 151-457 on an A4 page.
CROP = ["-x", "140", "-y", "0", "-W", "330", "-H", "842"]


def read_rows(pdf: Path) -> list:
    """Printed rows as (heading, block, printed name, kcal string), in file order. Exits on anything unexpected."""
    out = subprocess.run(["pdftotext", "-layout", *CROP, str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    rows = []
    heading, block, after_dish = None, 0, False
    for raw in out.replace("\f", "").split("\n"):
        line = raw.strip()
        if not line:
            if after_dish:
                block += 1
            after_dish = False
            continue
        if re.fullmatch(r"DISHES\s+kCal", line):
            continue
        m = ROW.match(line)
        if m:
            if heading is None:
                raise SystemExit(f"A dish row before any heading: {line!r}")
            rows.append((heading, block, " ".join(m.group(1).split()), m.group(2)))
            after_dish = True
        else:
            heading, block, after_dish = line, 0, False
    return rows


def display(printed: str) -> tuple:
    """(name, serving) for a printed dish name."""
    if printed in OVERRIDES:
        return OVERRIDES[printed]
    m = COUNTED.match(printed)
    if m:
        n, rest = m.group(1), m.group(2)
        unit = rest.split()[-1].lower()  # wings / tenders
        return f"{rest} ({n})", f"{n} {unit}"
    m = ADDON_TENDERS.match(printed)
    if m:
        return f"{m.group(1)} {m.group(2)} Tenders (burger add-on)", f"{m.group(1)} tenders"
    return printed, ""


def build_items(rows: list) -> list:
    norm = lambda s: " ".join(s.split())  # noqa: E731
    expected = [(h, b, norm(p)) for h, b, _, names in GROUPS for p in names]
    printed = [(h, b, p) for h, b, p, _ in rows]
    if printed != expected:
        new = [r for r in printed if r not in expected]
        gone = [r for r in expected if r not in printed]
        raise SystemExit(f"The menu file changed (or order/blocks moved). Printed but not in GROUPS: {new}. In GROUPS but not printed: {gone}. "
                         "Re-read the new file and update GROUPS.")
    cats = {(h, b): c for h, b, c, _ in GROUPS}
    items = []
    for h, b, p, kcal in rows:
        name, serving = display(p)
        tags = []
        if VEGAN.search(name):
            tags.append("vegetarian")
        if PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        note = f"Printed '{p}' under {h}" + (f" (block {b + 1})" if h in ("WINGS", "BURGERS", "Big Snacks") else "")
        items.append(dict(name=name, category=cats[(h, b)], serving=serving, calories=kcal, tags="|".join(tags), rankable=False, notes=note))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check GROUPS")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="Burger_Menu.pdf (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    items = build_items(read_rows(args.pdf))
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="BrewDog", cuisine="Craft beer bar", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    order = []
    for i in items:
        if i["category"] not in order:
            order.append(i["category"])
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {sum(1 for i in items if i['category'] == c)}" for c in order))


if __name__ == "__main__":
    main()
