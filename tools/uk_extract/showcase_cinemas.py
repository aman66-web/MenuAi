#!/usr/bin/env python3
"""Build data/source/showcase-cinemas/ from Showcase Cinemas' official "KCAL INFORMATION" PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/showcase_cinemas.py path/to/kcal.pdf --checked-on 2026-10-08 [--fetch] [--allergen-pdf path/to/allergens.pdf] [--out DIR]

Source (the file linked as "Nutritional Information" in the footer of the chain's own site):
    https://www.showcasecinemas.co.uk/  ->  https://cms-assets.webediamovies.pro/production/4756/82a53ad3c68b1813f7f348e6cac71b71.pdf
    "SHOWCASE CINEMAS - KCAL INFORMATION", footer "September 2026", 9 A4 pages (Microsoft Excel export with a text layer), PDF created
    2026-09-15 16:31 UTC, served Last-Modified 2026-09-15. robots.txt: www.showcasecinemas.co.uk only disallows /theaters/ and account
    pages; cms-assets.webediamovies.pro answers 404 for /robots.txt (no robots file, so no rules). The sheet is chain-wide (Showcase
    Cinemas, National Amusements); a few rows say they are for one venue and are left out (see below).
`--fetch` downloads it first (one request, normal browser User-Agent). Needs `pdftotext` (poppler); read by position: showcase_cinemas_pdf.py.

The sheet prints calories ONLY (title "KCAL INFORMATION", no unit on the cells): protein, carbs, fat, salt and the rest are never printed,
so they stay blank (docs/DATA.md "Calories-only chains"). Calories are copied from the PDF as printed (a few have decimals: 528.75, 5.5,
0.3). Each table has a "Per 100g" / "Per 100ml" column and one or more per-serving columns (sizes, "Per Serving", "Per Scoop", "Per 4oz
Splash"...): ONLY the per-serving columns are published (one item per product and size); the per-100 column is never used and never
converted into a serving. The column labels are checked against the labels this script expects, so a moved column stops the run.
Only names' formatting (a size added in brackets, "Costa " before the Costa tables' drinks, "Juice", "(topping)") is written by hand,
in BLOCKS below: the script stops if the tables, their row counts or their column labels change, so a human re-checks BLOCKS when
Showcase publishes a new sheet.

What is published, and what is left out (every table of the sheet is listed in BLOCKS):
- Left out, per 100 g only: PICK & MIX (62 sweets with a "Per 100g" figure and no per-serving figure; sold by weight, never converted).
- Left out, one venue only: "DRINKS" rows named "... - Derby CDL only" (5), "Cookie Dough (Peterborough)" (3), "NEO PIZZAS - Nottingham
  Only" (6). The other tables carry no venue label; the chain has about 15 sites, so not every cinema sells every item.
- Left out, no name: one row in the gelato table prints "185 / 157" with no product name (a name cell left empty in the sheet): it cannot
  be attributed, so it is not published.
- Held back (holdback.csv): the two MILKSHAKES rows. The table is headed "MILKSHAKES (Milk only)" yet the rows are named "Small Milkshake +
  Two Scoops of Gelato" (80 kcal) and "Large Milkshake + Three Scoops of Gelato" (106 kcal): the heading says the figure is the milk only
  and the name says gelato is part of the drink (the gelato scoops print 99-225 kcal each in the gelato table, so a milkshake with its
  scoops cannot be 80), so what the figure covers is unclear and neither reading is chosen.
- Sizes: "Totally Tots", "Kids Film Crew", "Small", "Medium", "Large" are printed without a volume or weight, so they are the item's
  `serving` as printed ("Large Hotdog (including bun)" and the like keep their own names). "Per Scoop" -> "1 scoop", "Each" -> "each",
  "Per 4oz Splash" / "Per 12oz Glass" / "Per Pint Glass" -> "4oz splash" / "12oz glass" / "pint glass", "per Pump" -> "1 pump". "Per
  Serving" prints no size, so `serving` stays blank. The Pizza Twists "Plus Chips" column is a second item ("... plus chips").
- Add-ons are items of their own with the calories printed on their row (toppings, sauces, the Crispy Onion Topping, nachos' cheese
  sauce, salsa, jalapenos and guacamole). Nachos' cheese sauce, salsa, jalapenos and guacamole print their figure under "Large" only.
- Tags: vegetarian only where the item NAME says vegan (Vegan Tenders, Vegan Vanilla/Chocolate Gelato); the sheet marks nothing vegetarian,
  so "Veggie Wrap", "Veggie Crisps" and the jackfruit pizza are not tagged. contains_pork where the name says pepperoni or bacon. The hotdogs
  and the Meat Feast pizza do not say what meat they hold ("meat type not stated").

Allergens (docs/DATA.md "Allergens") are LINK ONLY. Showcase's own allergen matrix (https://cms-assets.webediamovies.pro/production/4756/
b9d3bd163c467e64d5d300febbf9f405.pdf, "ALLERGEN INFORMATION MATRIX", reviewed 15 September 2026, 7 pages, same footer and same CDN) names the
kitchen's products, not the calorie sheet's: "Popcorn - Salt", "Popcorn- Sweet", "Nachos (no topping)", "Chicken & Bacon Pizza", "Margarita
Pizza Twists", "Cookie dough - Original Milk Chocolate", gelato flavours without "Gelato", "Boneless Hot Wings" for "Crunchy Hot Wings";
it has no row for the Coke Freestyle drinks, the ICEE sizes, the Costa drinks, the juices, the mocktails or the bar drinks. Allergens are
safety information and all-or-nothing, so no name is matched by similarity and only the guide's link is published.
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
import robots_rfc  # noqa: E402
import showcase_cinemas_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "showcase-cinemas"
PAGE_URL = "https://www.showcasecinemas.co.uk/"
SOURCE_URL = "https://cms-assets.webediamovies.pro/production/4756/82a53ad3c68b1813f7f348e6cac71b71.pdf"
SOURCE_TITLE = ("Showcase Cinemas - KCAL INFORMATION, September 2026 (the \"Nutritional Information\" PDF linked from the footer of "
                "showcasecinemas.co.uk; 9 pages, created 15 September 2026)")
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ALIASES = ["showcase cinemas", "showcase cinema", "showcase cinema de lux", "showcase", "showcase cinemas uk"]
ALLERGEN_GUIDE_TITLE = "Showcase Cinemas allergen information matrix (National Amusements, reviewed 15 September 2026, 7 pages)"
ALLERGEN_GUIDE_URL = "https://cms-assets.webediamovies.pro/production/4756/b9d3bd163c467e64d5d300febbf9f405.pdf"
MAY_CONTAIN_PUBLISHED = True  # the matrix prints "MAY CONTAIN" as well as "CONTAINS"
NOTE = ("Calories only, per serving or size as printed (the per-100 g columns are not used). One chain-wide sheet, September 2026: "
        "not every cinema sells every item, and sizes (Small, Medium, Large) have no volume. Pick & Mix (per 100 g only) and rows for "
        "Derby, Peterborough or Nottingham only are not listed.")

TITLES = ["POPCORN", "GOURMET POPCORN", "HOTDOGS", "NACHOS", "ICEE", "DRINKS", "COKE FREESTYLE", "ICE CREAM - DISOTTO GELATO",
          "MILKSHAKES (Milk only)", "ICE CREAM WAFFLE", "ICE CREAM / COOKIE TOPPINGS", "PICK & MIX", "Flexeserve / Louies - Hot Hold Products",
          "Cookie Dough (Peterborough)", "Grab & Go Cookies", "Louies Menu", "PIZZAS", "PIZZA TWISTS", "BAR DRINKS", "MOCKTAILS", "JUICES",
          "GALLERY POT OPTIONS", "GALLERY BENTO BOXES", "NEO PIZZAS - Nottingham Only", "COSTA PROUD TO SERVE - Hot Drinks",
          "COSTA PROUD TO SERVE - Cold Drinks", "COSTA PROUD TO SERVE - Syrups"]
SPLITS = {"Biscoff Sauce": "Cookie toppings"}  # three untitled rows (Biscoff Sauce, Biscoff Crumb, Nutella) under Grab & Go Cookies


def C(label, serving=None, template=None):
    """A column: the label it must have in the PDF; serving = the item's serving (None = column not published, ie per 100 g)."""
    return dict(label=label, serving=serving, template=template)


P100G, P100ML, P100MLG = C("Per 100g"), C("Per 100ml"), C("Per 100ml/g")
PER_SERVING = C("Per Serving", "")
TOTS, KIDS, SMALL, MED, LARGE = (C("Totally Tots", "Totally Tots"), C("Kids Film Crew", "Kids Film Crew"), C("Small", "Small"),
                                 C("Medium", "Medium"), C("Large", "Large"))
# One entry per table of the sheet: category, columns (letter -> C), the number of rows it prints, name format, and why it is left out.
BLOCKS = {
    "POPCORN": dict(cat="Popcorn", cols=dict(B=P100G, C=TOTS, D=KIDS, E=SMALL, F=MED, G=LARGE), rows=2),
    "GOURMET POPCORN": dict(cat="Gourmet Popcorn", cols=dict(B=P100G, C=PER_SERVING), rows=4),
    "HOTDOGS": dict(cat="Hot Dogs", cols=dict(B=P100G, C=PER_SERVING), rows=3),
    "NACHOS": dict(cat="Nachos", cols=dict(B=P100G, C=SMALL, D=MED, E=LARGE), rows=5),
    "ICEE": dict(cat="ICEE", cols=dict(B=P100G, C=KIDS, D=SMALL, E=MED, F=LARGE), rows=3),
    "DRINKS": dict(cols=dict(B=P100ML, C=KIDS, D=SMALL, E=MED, F=LARGE), rows=5, exclude="Derby cinema only (every row is named '... - Derby CDL only')"),
    "COKE FREESTYLE": dict(cat="Soft Drinks (Coke Freestyle)", cols=dict(B=P100ML, C=KIDS, D=SMALL, E=MED, F=LARGE), rows=109),
    "ICE CREAM - DISOTTO GELATO": dict(cat="Ice Cream", cols=dict(B=P100G, C=C("Each", "each"), D=C("Per Scoop", "1 scoop")), rows=21, nameless=1),
    "MILKSHAKES (Milk only)": dict(cat="Milkshakes", cols=dict(B=P100ML, C=SMALL, D=LARGE), rows=2, holdback=(
        "The table is headed 'MILKSHAKES (Milk only)' but the rows are named '... Milkshake + Two/Three Scoops of Gelato', and the gelato scoops "
        "print 99-225 kcal each elsewhere in the sheet: the figure cannot cover the whole drink, so what it covers is unclear; neither reading is chosen")),
    "ICE CREAM WAFFLE": dict(cat="Ice Cream", cols=dict(B=P100MLG, C=PER_SERVING), rows=1, name_fmt="Ice Cream {}"),
    "ICE CREAM / COOKIE TOPPINGS": dict(cat="Toppings", cols=dict(B=P100MLG, C=PER_SERVING), rows=10, name_fmt="{} (topping)"),
    "PICK & MIX": dict(cols=dict(B=P100G), rows=62, exclude="per 100 g only: no per-serving figure is printed (sold by weight; never converted)"),
    "Flexeserve / Louies - Hot Hold Products": dict(cat="Hot Food", cols=dict(B=P100G, C=PER_SERVING), rows=5),
    "Cookie Dough (Peterborough)": dict(cols=dict(B=P100G, C=PER_SERVING), rows=3, exclude="Peterborough cinema only"),
    "Grab & Go Cookies": dict(cat="Cookies", cols=dict(B=P100G, C=PER_SERVING), rows=3),
    "Cookie toppings": dict(cat="Cookies", cols=dict(B=P100G, C=PER_SERVING), rows=3),
    "Louies Menu": dict(cat="Louies Menu", cols=dict(B=P100G, C=PER_SERVING), rows=31),
    "PIZZAS": dict(cat="Pizzas", cols=dict(B=P100G, C=PER_SERVING), rows=7),
    "PIZZA TWISTS": dict(cat="Pizza Twists", cols=dict(B=P100G, C=PER_SERVING, D=C("Plus Chips", "", "{n} plus chips")), rows=2, name_fmt="{} Pizza Twists"),
    "BAR DRINKS": dict(cat="Bar Drinks", cols=dict(B=P100ML, C=C("Per 4oz Splash", "4oz splash"), D=C("Per 12oz Glass", "12oz glass"),
                                                   E=C("Per Pint Glass", "pint glass")), rows=6),
    "MOCKTAILS": dict(cat="Mocktails", cols=dict(B=P100ML, C=PER_SERVING), rows=3),
    "JUICES": dict(cat="Juices", cols=dict(B=P100ML, C=PER_SERVING), rows=3, name_fmt="{} Juice"),
    "GALLERY POT OPTIONS": dict(cat="Gallery Pots", cols=dict(B=P100G, C=PER_SERVING), rows=7),
    "GALLERY BENTO BOXES": dict(cat="Gallery Bento Boxes", cols=dict(B=P100G, C=PER_SERVING), rows=2),
    "NEO PIZZAS - Nottingham Only": dict(cols=dict(B=P100G, C=C("6 inch", "6 inch"), D=C("10 inch", "10 inch")), rows=6, exclude="Nottingham cinema only"),
    "COSTA PROUD TO SERVE - Hot Drinks": dict(cat="Costa Hot Drinks", cols=dict(B=P100ML, C=SMALL, D=MED, E=LARGE), rows=11, name_fmt="Costa {}"),
    "COSTA PROUD TO SERVE - Cold Drinks": dict(cat="Costa Cold Drinks", cols=dict(B=P100ML, C=SMALL, D=MED), rows=5, name_fmt="Costa {}"),
    "COSTA PROUD TO SERVE - Syrups": dict(cat="Costa Syrups", cols=dict(B=C("per 100ml"), C=C("per Pump", "1 pump")), rows=7, name_fmt="Costa {}"),
}
CATEGORY_ORDER = ["Popcorn", "Gourmet Popcorn", "Hot Dogs", "Nachos", "ICEE", "Soft Drinks (Coke Freestyle)", "Ice Cream", "Milkshakes", "Toppings",
                  "Hot Food", "Cookies", "Louies Menu", "Pizzas", "Pizza Twists", "Bar Drinks", "Mocktails", "Juices", "Gallery Pots",
                  "Gallery Bento Boxes", "Costa Hot Drinks", "Costa Cold Drinks", "Costa Syrups"]
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
VEGAN = re.compile(r"\bvegan\b", re.I)
EXPECTED_NAMELESS = {"ICE CREAM - DISOTTO GELATO": {"B": "185", "D": "157"}}


def fetch(dest: Path) -> None:
    """One polite download of the PDF; robots.txt of both hosts is read first (RFC 9309 matching, robots_rfc.py). A 404 means no rules."""
    for site, path in (("https://www.showcasecinemas.co.uk", "/"), ("https://cms-assets.webediamovies.pro", SOURCE_URL.split(".pro", 1)[1])):
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


def build_items(blocks: list) -> tuple[list, list, dict]:
    """-> (items, holdback [(item name, reason)], report counts)."""
    titles = [b["title"] for b in blocks]
    expected = [t for title in TITLES for t in ([title, "Cookie toppings"] if title == "Grab & Go Cookies" else [title])]
    if titles != expected or set(expected) != set(BLOCKS):
        raise SystemExit(f"Tables changed: read {titles}, expected {expected}")
    items, holdback = [], []
    counts = dict(published=0, excluded={}, nameless=0)
    for b in blocks:
        spec = BLOCKS[b["title"]]
        if len(b["rows"]) != spec["rows"]:
            raise SystemExit(f"{b['title']}: {len(b['rows'])} rows printed, expected {spec['rows']}: the sheet changed, re-check BLOCKS")
        want = {col: c["label"] for col, c in spec["cols"].items()}
        if b["labels"] != want:
            raise SystemExit(f"{b['title']}: column labels are {b['labels']}, expected {want}: the sheet changed, re-check BLOCKS")
        for row in b["rows"]:
            extra = set(row["cells"]) - set(spec["cols"])
            if extra:
                raise SystemExit(f"{b['title']}: {row['name']!r} has cells in unlabelled columns {sorted(extra)}")
        if spec.get("exclude"):
            counts["excluded"][b["title"]] = (len(b["rows"]), spec["exclude"])
            continue
        nameless = [r for r in b["rows"] if not r["name"]]
        if len(nameless) != spec.get("nameless", 0):
            raise SystemExit(f"{b['title']}: {len(nameless)} rows have no name, expected {spec.get('nameless', 0)}")
        for r in nameless:
            if r["cells"] != EXPECTED_NAMELESS[b["title"]]:
                raise SystemExit(f"{b['title']}: the nameless row now prints {r['cells']}")
            counts["nameless"] += 1
        for row in b["rows"]:
            if not row["name"]:
                continue
            base = spec.get("name_fmt", "{}").format(row["name"])
            for col, c in spec["cols"].items():
                if c["serving"] is None or col not in row["cells"]:
                    continue
                value = row["cells"][col]
                if c["template"]:
                    name = c["template"].format(n=base)
                elif c["serving"]:
                    name = f"{base} ({c['serving']})"
                else:
                    name = base
                tags = []
                if VEGAN.search(name):
                    tags.append("vegetarian")
                if PORK.search(name):
                    tags.append("contains_pork")
                if BEEF.search(name):
                    tags.append("contains_beef")
                per100 = row["cells"].get("B")
                printed = f"Printed row '{row['name']}' in '{b['title']}', column '{c['label']}' = {value}" + \
                          (f"; the per-100 column ({spec['cols']['B']['label']}) prints {per100} and is not used" if per100 else "")
                items.append(dict(name=name, category=spec["cat"], serving=c["serving"] or "", calories=value, tags="|".join(tags),
                                  rankable=False, notes=printed))
                if spec.get("holdback"):
                    holdback.append((name, spec["holdback"]))
    names = [i["name"] for i in items]
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        raise SystemExit(f"Item names are not unique: {dupes}")
    counts["published"] = len(items)
    return items, [(slug(n), r) for n, r in holdback], counts


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the KCAL INFORMATION PDF (SOURCE_URL); with --fetch it is downloaded to this path first")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--allergen-pdf", type=Path, help="Showcase's allergen matrix PDF (only to print its SHA-256)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.pdf)
    print(f"kcal PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    if args.allergen_pdf:
        print(f"allergen PDF sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    blocks = pdf_reader.read_blocks(args.pdf, TITLES, SPLITS)
    items, holdback, counts = build_items(blocks)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Showcase Cinemas", cuisine="Cinema snacks", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    per_cat = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    missing = sorted({i["category"] for i in items} - set(CATEGORY_ORDER))
    if missing:
        raise SystemExit(f"Categories missing from CATEGORY_ORDER: {missing}")
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in per_cat.items()))
    for t, (n, why) in counts["excluded"].items():
        print(f"left out: {t}: {n} rows ({why})")
    print(f"left out: {counts['nameless']} row with no product name; held back: {[h for h, _ in holdback]}")


if __name__ == "__main__":
    main()
