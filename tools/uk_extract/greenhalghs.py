#!/usr/bin/env python3
"""Build data/source/greenhalghs/ from Greenhalgh's Craft Bakery online shop (a CALORIES-ONLY chain, allergen guide linked).

    python3 tools/uk_extract/greenhalghs.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the saved product pages (greenhalghs_pages.cache_name). --fetch downloads robots.txt, https://www.greenhalghs.com/product-sitemap.xml
and every product page it lists first (one request per page, 1.1 s apart, a page robots.txt disallows stops the run).

Source: the shop's own product pages (WooCommerce). robots.txt disallows only /wp-admin/ and some ?query-string paths. Most food pages print a
"Nutrition Information - Per 100g" table (kJ / kcal, fat, saturates, carbohydrate, sugars, fibre, protein, salt). That is PER 100 g and is never
published (docs/DATA.md: we never turn per-100 g into a serving). What IS published: the pages whose product summary also gives the energy of ONE
unit, pie, pasty or portion in a line of text, e.g. "Calorie content per pie 605 kcals", "Cals per unit 333 kcal.", "693 kcal per pie (250g)",
"505 kcal per 1/8 pie.". That is a calories-only chain (`nutrition_level = calories`): protein, carbs, fat, salt, sugars, fibre and kJ stay
blank because the pages print them per 100 g only. `serving` is the basis exactly as the page words it ("per unit", "per pie", "per 250g");
`weight_g` is filled only where the line itself gives grams ("per pie (250g)", "per 250g").

Which pages are published (written down so a re-run keeps the same rules):
  Published   every product page with a per-unit / per-pie / per-portion calorie line (EXPECTED_PAGES below, 29 pages on 2026-10-08).
  Left out    all other pages (cakes, platters, hampers, vouchers, gifts, subscriptions, bread loaves, most soups and pies): they print no calories or
              per-100 g figures only. "Small GI Seeded Loaf" and "Large GI Seeded Loaf" print "314 kcal per 100g" only. "Large Scotch Loaf" prints a
              kJ / kcal row of its per-100 g table only.
  Held back   the two custard pages and the apple slice (see HOLD): their "per unit" figure cannot be confirmed as per unit.
The script stops if the set of pages with a calorie line changes, or a page words its energy in a way UNIT_LINES does not know.

Tags: `vegetarian` only where the page itself says "Suitable for vegetarians / vegans". `contains_beef` / `contains_pork` when the page's own ingredient
list or the product name says so (Beef, Steak; Ham, Pork, Bacon, Sausage ...). Nothing is inferred beyond that. `rankable=false` (calories only).

Allergens (docs/DATA.md "Allergens") are link-only. The shop's allergen matrix (Version 9, 16/06/2026, linked from /allergen-information/) is a table of
product CODES and shop names ("Butter Pies", "Potato & Meat Pie Large Baked") that are not the web shop's names and, for most published products, not its
SKUs (Butter Pie sells as 12301-1000, the matrix has 10301-0001; the multi-portion pies have SKU "N/A"; the soups' SKUs 34511-3900 / 34531-3900 are not the matrix's 4510 / 4530 for "Tomato Soup" / "Pea and Ham Soup"). Each product page
prints its ingredients with the allergens in bold, which is ingredient text rather than a list. Allergens are safety information: no name matching,
no guessing, so only the guide's link is published (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import greenhalghs_pages as gp  # noqa: E402
from common import write_chain_folder  # noqa: E402

CHAIN_ID = "greenhalghs"
SOURCE_URL = "https://www.greenhalghs.com/bakery-shop/"
SOURCE_TITLE = ("Greenhalgh's Craft Bakery online shop, product pages listed in product-sitemap.xml "
                "(calories per unit, pie or portion as printed on each page; accessed {checked}, no date shown)")
ALIASES = ["greenhalghs", "greenhalgh's", "greenhalgh's craft bakery", "greenhalghs craft bakery", "greenhalgh's bakery", "greenhalghs bakery"]
ALLERGEN_GUIDE_TITLE = "Greenhalgh's allergen information page (links the shop allergen matrix, Version 9, 16/06/2026)"
ALLERGEN_GUIDE_URL = "https://www.greenhalghs.com/allergen-information/"
# The matrix marks Y (contains), N and MC (may contain) per product: traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Calories only, as each Greenhalgh's product page prints them per unit, pie, pasty or portion (the serving says which). Protein, carbs, fat "
        "and salt are printed per 100 g only, so they are not published. Cakes, platters, hampers and most other products print no calories.")
CATEGORY_ORDER = ["Savouries", "Sweet Treats", "Bread", "Next Day"]

# The product pages (path after the domain) that print a per-unit calorie line on 2026-10-08. The script stops if the set changes.
EXPECTED_PAGES = """
bread/bread-rolls-baps/brown-soft-rolls-4-pack
bread/bread-rolls-baps/white-maxi-rolls-6-pack
bread/bread-rolls-baps/white-soft-rolls-4-pack
bread/packet-bread/white-scotch-baps-4s
confectionery/chocolate-eclair
confectionery/chocolate-eclair-individual
confectionery/cream-cakes/bavarian-slice
confectionery/cream-cakes/bavarian-slice-individual
confectionery/cream-cakes/cream-doughnut
confectionery/cream-cakes/cream-doughnut-individual
confectionery/cream-cakes/cream-scone
confectionery/cream-cakes/vanilla-slice
confectionery/cream-cakes/vanilla-slice-individual
confectionery/sweet-pastries/cakes-pastries/apple-slice
confectionery/sweet-pastries/small-custard-2pk
confectionery/sweet-pastries/small-custard-individual
next-day/potato-and-meat-puff-pasty
savouries/beefsteak-pie
savouries/pies/butter-pie
savouries/pies/cheese-and-onion-pie
savouries/pies/meat-potato-pie
savouries/pies/party-pies/multi-portion-beef-steak-pie
savouries/pies/party-pies/multiportion-lancashire-pie
savouries/pies/party-pies/multiportion-potato-and-meat-pie
savouries/pies/plate-meat-pie
savouries/pies/steak-and-ale-pie
savouries/pies/steak-pudding
savouries/soup/500ml-pea-and-ham-soup
savouries/soup/500ml-pot-soup/tomato-soup-500ml
""".split()
# Pages that print a per-100 g energy line only (checked on every run; anything else with an unknown wording stops the script).
EXPECTED_PER_100G_ONLY = {"bread/loaf-bread/small-gi-seeded-loaf", "bread/loaf-bread/large-gi-seeded-loaf"}

APPLE_SLICE_REASON = ("The page prints 'Cals per unit 267 kcal', the same figure as the two custard pages, and has no nutrition table to check it "
                      "against. The custard pages' own per-100 g table also reads 267 kcal, so the basis of this figure is not confirmed.")
HOLD = {
    "confectionery/sweet-pastries/cakes-pastries/apple-slice": APPLE_SLICE_REASON,
}
SAME_AS_PER_100G = ("The page prints 'Cals per unit {kcal} kcal' but its own 'Nutrition Information - Per 100g' table also gives {kcal} kcal, so the "
                    "figure may be the per-100 g value and its basis cannot be confirmed. The page does not say what a unit weighs.")

PORK = re.compile(r"\b(pork|bacon|ham|sausage|sausages|pepperoni|salami|chorizo|gammon|lard)\b", re.I)  # lard: the pies list it in their own ingredients
BEEF = re.compile(r"\b(beef|steak)\b", re.I)


def ascii_slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    s = s.lower().replace("&", " and ").replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def build(pages_dir: Path, checked_on: str):
    urls = (pages_dir / "urls.txt").read_text(encoding="utf-8").split()
    published, per100_only, rows = [], set(), []
    for u in urls:
        path = u.split("greenhalghs.com/", 1)[1].strip("/")
        if not path or path == "bakery-shop":
            continue  # the shop index is not a product
        f = pages_dir / (gp.cache_name(u) + ".html")
        if not f.exists():
            raise SystemExit(f"missing page {f}: run with --fetch")
        p = gp.parse_page(f.read_text(encoding="utf-8", errors="replace"), u)
        if p["per_100g_only_line"]:
            per100_only.add(path)
        if p["unit"]:
            published.append(path)
            rows.append((path, p))
    if set(published) != set(EXPECTED_PAGES):
        raise SystemExit("The pages with a per-unit calorie line changed. New: %s. Gone: %s. Read them, then update EXPECTED_PAGES."
                         % (sorted(set(published) - set(EXPECTED_PAGES)), sorted(set(EXPECTED_PAGES) - set(published))))
    if per100_only != EXPECTED_PER_100G_ONLY:
        raise SystemExit(f"Pages that print kcal per 100g only changed: now {sorted(per100_only)}")
    items, holdback = [], []
    for path, p in rows:
        crumbs = p["crumbs"]
        if "Bakery Shop" not in crumbs or crumbs.index("Bakery Shop") + 1 >= len(crumbs):
            raise SystemExit(f"{path}: no category under 'Bakery Shop' in the breadcrumb {crumbs}")
        category = crumbs[crumbs.index("Bakery Shop") + 1]
        if category not in CATEGORY_ORDER:
            raise SystemExit(f"{path}: unknown category {category!r}")
        unit = p["unit"]
        title = p["title"]
        tags = []
        if p["veg"]:
            tags.append("vegetarian")
        text = title + " " + p["ingredients"]
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        item_id = ascii_slug(title)
        notes = [f"Printed on the page: {unit['line']!r}"]
        if p["per100_kcal"]:
            notes.append(f"the page's per-100 g table says {p['per100_kcal']} kcal")
        if p["veg"]:
            notes.append(f"page says: {p['veg']}")
        items.append(dict(name=title, id=item_id, category=category, serving=unit["serving"], calories=unit["kcal"], weight_g=unit["weight"] or "",
                          tags="|".join(tags), rankable=False, notes="; ".join(notes), _path=path))
        if path in HOLD:
            holdback.append((item_id, HOLD[path]))
        elif p["per100_kcal"] and p["per100_kcal"] == unit["kcal"]:
            holdback.append((item_id, SAME_AS_PER_100G.format(kcal=unit["kcal"])))
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two items share an id")
    for i in items:
        del i["_path"]
    return items, holdback


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder of saved product pages (and urls.txt)")
    ap.add_argument("--checked-on", required=True, help="the day the pages were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download robots.txt, the sitemap and every product page into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        urls = gp.fetch_all(args.pages)
        print(f"fetched {len(urls)} product pages into {args.pages}")
    items, holdback = build(args.pages, args.checked_on)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Greenhalgh's", cuisine="Bakery", source_title=SOURCE_TITLE.format(checked=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"held back {len(holdback)}: " + ", ".join(i for i, _ in holdback))
    no_meat_type = [i["name"] for i in items if re.search(r"meat|pie|pudding|pasty", i["name"], re.I) and not ({"contains_pork", "contains_beef", "vegetarian"} & set(i["tags"].split("|")))]
    print(f"meat type not stated ({len(no_meat_type)}): " + ", ".join(no_meat_type))


if __name__ == "__main__":
    main()
