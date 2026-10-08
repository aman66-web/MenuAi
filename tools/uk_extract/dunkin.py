#!/usr/bin/env python3
"""Build data/source/dunkin/ from Dunkin' UK's own allergen pages (a CALORIES-ONLY chain), cross-checked against its product pages.

    python3 tools/uk_extract/dunkin.py --pages DIR --products DIR --checked-on 2026-10-08 [--fetch] [--fetch-products] [--out DIR]

DIR (--pages) holds the seven saved pages (allergens-donuts.html, allergens-munchkins.html, allergens-cookies.html, allergens-bakery.html,
allergens-lto-donuts.html, allergens-hot-drinks.html, allergens-cold-drinks.html), the pages linked from https://dunkin.co.uk/allergens.
--products holds one product page per product (<slug>.html, the page the allergen page links to). --fetch / --fetch-products download
them. Dunkin's robots.txt says "Crawl-delay: 30" and "Disallow: /*?": every download waits 31 seconds and no URL has a query string, so
--fetch takes about 4 minutes and --fetch-products (one page per product, 76) about 40 minutes. A saved set can simply be reused.

What the chain prints (checked 2026-10-08: every block is visible text in the page, nothing is hidden behind a control or CSS, and the
words protein, carbohydrate, saturates, sugars, fat, salt, fibre, energy and kJ appear nowhere on the allergen or product pages): for every
product its allergens ("Allergens: ..."), sometimes "May Contain: ...", and CALORIES ONLY ("Nutrition: 222 kcal"; drinks "Small 113 kcal,
Medium 170 kcal, Large 227 kcal"). So protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains") and every item is not
rankable. Calories are copied from the page as printed; only the grouping/names below are typed by hand.

How the pages are read (each rule stops the run if the page stops fitting it):
- One item per donut/cookie/bakery product, and one item per drink SIZE ("Cappuccino (Small)"), serving = the size as printed. A donut,
  cookie or bakery item's serving ("1 donut", "1 croissant", "1 item") is the unit the product page prints after the calories.
- Drinks printed as a RANGE ("Latte Small 57-113 kcal": the figure depends on the milk the customer picks) are left out: a range is not
  a single printed figure and we never choose an end. Americano, Tea, Macchiato, Mocha, Cold Brew and the iced Latte/Macchiato/Mocha are ranges.
- A figure the allergen page prints without its size (the first figure of the Strawberry Dragon fruit Daydream Refresher) is given its size
  only when the same product's own page prints that same figure WITH the size ("Small 156 Kcal"). The Red Bull Strawberry Infusion's only
  figure (597 kcal) has no size on either page, so it has no stated serving and is left out. Filter Coffee prints "Nutrition:" with nothing.
- The Hot Drinks and Cold Drinks pages both list Pumpkin Spiced Latte, Maple Pecan Pie Latte and Dubai Chocolate Mocha with different
  figures (the product page prints "Iced" and "Hot" lines); the names get ", hot" / ", cold" from the page they are on, and each page's
  figures are compared with the product page's Hot / Iced line.
- "Vegan Friendly" after a name is the chain's own mark: tag vegetarian, name without it. Nothing else is tagged: no item's name or the pages'
  text mentions meat.
- The "LTO DONUTS" page is the chain's own limited-time list: limited_time = true.
- Every product page is compared with the allergen page: a figure that differs is HELD BACK (holdback.csv), never chosen between. So is
  a drink whose sizes contradict each other on one page (a bigger size with fewer calories). Two allergen-page links are dead (404): Hazelnut
  Pie ("hazlenut-pie", the chain's sitemap has /hazelnut-pie) and Glazed Munchkins ("strawberry-sprinkle-munchkins"; the in-store range page
  links /glazed-munchkins); a corrected page is used only when its <title> is the allergen page's product name exactly (SLUG_FIX).

Allergens (docs/DATA.md "Allergens") are link-only. The allergen pages do list allergens for most products, but not completely: eight
drinks have no allergen line (or an empty one), Espresso is listed with Milk on the allergen page and with no allergens on its product page,
two print a bare "Milk", eleven print "Dairy in Milk Choice", two print text that is not a list of the 14 ("Milk (May Contain: Cereals
(Gluten), Eggs, Nuts"), and no drink has the separate "May Contain" line the donut pages have. Allergens are safety information: no
guessing and no reading silence as "none", so the pages' link is published and allergens.csv is not (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dunkin_pages as dp  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "dunkin"
SOURCE_URL = "https://dunkin.co.uk/allergens"
SOURCE_TITLE = ("Dunkin' UK allergens & nutrition pages: donuts, Munchkins, cookies, bakery, LTO donuts, hot drinks and cold drinks "
                "(dunkin.co.uk/allergens-*, (c) 2026 DD IP Holder LLC; accessed {checked}, no date shown)")
ALLERGEN_GUIDE_TITLE = "Dunkin' UK allergens pages: donuts, Munchkins, cookies, bakery, LTO donuts, hot and cold drinks (no date shown)"
ALIASES = ["dunkin", "dunkin'", "dunkin’", "dunkin donuts", "dunkin' donuts", "dunkin’ donuts", "dunkin uk"]
NOTE = ("Dunkin' publishes calories only, so protein, carbs, fat and other nutrients are not published. Drinks whose calories are printed "
        "as a range (it depends on the milk chosen, e.g. Latte), or without a size, are left out. Sizes are Small, Medium and Large as "
        "printed (no ml given). Items whose calories differ between Dunkin's allergen page and product page are not shown.")

# allergen page -> (category, limited_time, products expected on it, is a drink page)
PAGES = {
    "allergens-donuts": ("Donuts", False, 12, False),
    "allergens-munchkins": ("Munchkins", False, 1, False),
    "allergens-cookies": ("Cookies", False, 3, False),
    "allergens-bakery": ("Bakery", False, 3, False),
    "allergens-lto-donuts": ("Limited time donuts", True, 9, False),
    "allergens-hot-drinks": ("Hot drinks", False, 13, True),
    "allergens-cold-drinks": ("Cold drinks", False, 35, True),
}
EXPECTED_ITEMS = 134  # published + held back, checked on every run
# Products listed on both drink pages with their own figures: the suffix says which page the row is from.
BOTH_PAGES = {"Pumpkin Spiced Latte", "Maple Pecan Pie Latte", "Dubai Chocolate Mocha"}
# Printed with nothing after "Nutrition:" (checked on every run; any other product without a calorie figure stops the script).
NO_CALORIES = {"Filter Coffee"}
# Allergen-page links that answer 404 -> the live page of the same product (its <title> must equal the product's name on the allergen page).
SLUG_FIX = {"hazlenut-pie": "hazelnut-pie", "strawberry-sprinkle-munchkins": "glazed-munchkins"}
# Left out on purpose: printed without a size on both the allergen page and the product page.
NO_SIZE_EVERYWHERE = {"Red Bull Strawberry Infusion"}


def clean_name(printed: str) -> tuple[str, bool]:
    """'Original Glazed (OG) - Vegan Friendly' -> ('Original Glazed (OG)', True); '(R)' marks removed."""
    vegan = bool(re.search(r"\s-\s*Vegan Friendly\s*$", printed, re.I))
    name = re.sub(r"\s-\s*Vegan Friendly\s*$", "", printed, flags=re.I).replace("®", "").strip()
    return re.sub(r"\s+", " ", name), vegan


def product_slug(url: str) -> str:
    s = url.rsplit("/", 1)[1]
    return SLUG_FIX.get(s, s)


def norm_title(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("®", "")).strip()


def serving_word(nutrition_text: str) -> str:
    """'222 kcal per donut' -> '1 donut'; '' when the page prints no unit."""
    m = re.search(r"kcal\s+per\s+([A-Za-z]+)", nutrition_text or "", re.I)
    return f"1 {m.group(1).lower()}" if m else ""


def load_products(products_dir: Path, records: list[dict]) -> dict[str, dict]:
    out = {}
    for r in records:
        slug_ = product_slug(r["url"])
        f = products_dir / f"{slug_}.html"
        if not f.exists():
            continue
        page = dp.read_product_page(f.read_text(encoding="utf-8"))
        if not page["ok"]:
            continue
        if slug_ != r["url"].rsplit("/", 1)[1] and norm_title(page["title"]) != norm_title(r["name"]):
            raise SystemExit(f"{r['name']!r}: the replacement page /{slug_} is titled {page['title']!r}, not the same product: check SLUG_FIX")
        out[r["url"]] = page
    return out


def digits_accounted(text: str, tokens: list[dict]) -> bool:
    """Every number in the printed nutrition text was read as a calorie figure (so nothing in the line is silently skipped)."""
    body = re.sub(r"^nutrition\s*(\([^)]*\))?\s*:?", "", text.strip(), flags=re.I)
    return len(re.findall(r"\d+", body)) == sum(2 if t["is_range"] else 1 for t in tokens)


def build(pages_dir: Path, products_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str], dict]:
    items: list[dict] = []
    holdback: list[tuple[str, str]] = []
    report: list[str] = []
    stats = {"records": 0, "cross_checked": 0, "cross_checked_ranges": 0, "no_product_page": [], "allergen_lines_missing": [],
             "sized_from_product_page": []}
    records_by_page = {}
    for page, (category, limited, expected, is_drink) in PAGES.items():
        text = (pages_dir / f"{page}.html").read_text(encoding="utf-8")
        recs = dp.read_allergen_page(text, page)
        if len(recs) != expected:
            raise SystemExit(f"{page}: {len(recs)} products found, expected {expected}: the menu changed, re-check PAGES and the rules above")
        records_by_page[page] = recs
    drink_names = [r["name"] for p in ("allergens-hot-drinks", "allergens-cold-drinks") for r in records_by_page[p]]
    dupes = {n for n in drink_names if drink_names.count(n) > 1}
    if dupes != BOTH_PAGES:
        raise SystemExit(f"Products on both drink pages are now {sorted(dupes)}, expected {sorted(BOTH_PAGES)}: re-check BOTH_PAGES")
    all_records = [r for recs in records_by_page.values() for r in recs]
    products = load_products(products_dir, all_records)
    for page, (category, limited, _, is_drink) in PAGES.items():
        for r in records_by_page[page]:
            stats["records"] += 1
            base, vegan = clean_name(r["name"])
            if vegan and r["allergens"] and re.search(r"\b(milk|eggs?|fish|honey)\b", r["allergens"], re.I):
                raise SystemExit(f"{r['name']!r} is marked Vegan Friendly but its allergens say {r['allergens']!r}: the page contradicts itself")
            tokens = dp.parse_kcal(r["nutrition"])
            if r["allergens"] is None and not r["bare"]:
                stats["allergen_lines_missing"].append(r["name"])
            elif r["allergens"] in ("",):
                stats["allergen_lines_missing"].append(r["name"] + " (empty)")
            if not tokens:
                if r["name"] not in NO_CALORIES:
                    raise SystemExit(f"{r['name']!r} prints no calorie figure ({r['nutrition']!r}) and is not in NO_CALORIES")
                report.append(f"not listed: {r['name']} ({category}): the page prints 'Nutrition:' and no figure")
                continue
            if not digits_accounted(r["nutrition"], tokens):
                raise SystemExit(f"{r['name']!r}: a number in {r['nutrition']!r} is not read as a calorie figure: the layout changed")
            prod = products.get(r["url"])
            if prod is None:
                stats["no_product_page"].append(r["name"])
                report.append(f"{r['name']}: no product page could be read (404 or not saved): not cross-checked")
            pfigs = dp.parse_product_figures(prod["nutrition"]) if prod and prod.get("nutrition") else []
            if prod is not None and not pfigs:
                raise SystemExit(f"{r['name']!r}: the product page prints no calorie figure the script can read: {prod.get('nutrition')!r}")
            variant = None
            display = base
            if is_drink and r["name"] in BOTH_PAGES:
                variant = "Hot" if page == "allergens-hot-drinks" else "Iced"
                display = f"{base}, {'hot' if variant == 'Hot' else 'cold'}"
            tags = ["vegetarian"] if vegan else []
            printed_note = f"Printed '{r['name']}': {r['nutrition']}"
            if is_drink:
                if prod is None:
                    raise SystemExit(f"{r['name']!r}: a drink without a readable product page: the size cross-check cannot run")
                rows = []
                for t in tokens:
                    if t["size"] is None:
                        same = {p["size"] for p in pfigs if p["value"] == t["value"] and p["size"] and not p["is_range"]
                                and (p["variant"] in (None, variant))}
                        if len(same) == 1:
                            t = dict(t, size=same.pop(), from_product=True)
                            stats["sized_from_product_page"].append(f"{display} ({t['size']}) {t['value']} kcal")
                        else:
                            if r["name"] not in NO_SIZE_EVERYWHERE:
                                raise SystemExit(f"{r['name']!r}: figure {t['value']} has no size on either page and is not in NO_SIZE_EVERYWHERE")
                            report.append(f"not listed: {display}: figure {t['value']} kcal is printed without a size on both pages ({r['nutrition']!r})")
                            continue
                    if t["is_range"]:
                        report.append(f"not listed: {display} ({t['size']}): printed as a range, {t['value']} kcal")
                        _cross_check_range(display, t, pfigs, variant, stats, report)
                        continue
                    rows.append(t)
                made = []
                for t in rows:
                    name = f"{display} ({t['size']})"
                    note = printed_note + ("; size taken from the product page, which prints the same figure with its size" if t.get("from_product") else "")
                    item = dict(name=name, category=category, serving=t["size"], calories=t["value"], tags="|".join(tags),
                                limited_time=limited, rankable=False, notes=note)
                    items.append(item)
                    made.append((item, t))
                    _cross_check(item, t, pfigs, variant, prod, stats, holdback, report)
                _check_sizes_agree(display, made, holdback, report)
            else:
                if len(tokens) != 1 or tokens[0]["size"] is not None or tokens[0]["is_range"]:
                    raise SystemExit(f"{r['name']!r}: expected one plain calorie figure, got {r['nutrition']!r}")
                t = tokens[0]
                serving = serving_word(prod["nutrition"]) if prod and prod.get("nutrition") else ""
                if not serving and "per item" in r["nutrition"].lower():
                    serving = "1 item"
                item = dict(name=display, category=category, serving=serving, calories=t["value"], tags="|".join(tags),
                            limited_time=limited, rankable=False, notes=printed_note + (f"; product page: {prod['nutrition']}" if prod else ""))
                items.append(item)
                _cross_check(item, t, pfigs, None, prod, stats, holdback, report)
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique: " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"{len(items)} items built, expected {EXPECTED_ITEMS}: the menu changed; re-read the report and update EXPECTED_ITEMS")
    return items, holdback, report, stats


def _candidates(pfigs: list[dict], size: str | None, variant: str | None) -> list[dict]:
    """The product page's figures for one size. A page that prints both an Iced and a Hot line is read with the variant of the page the
    row came from; a page with only one line is read as it is."""
    cands = [p for p in pfigs if p["size"] == size or (size is None and len(pfigs) == 1)]
    if len({p["variant"] for p in cands}) > 1:
        cands = [p for p in cands if p["variant"] == variant]
    return cands


def _cross_check(item: dict, token: dict, pfigs: list[dict], variant: str | None, prod: dict | None, stats: dict,
                 holdback: list[tuple[str, str]], report: list[str]) -> None:
    """Compare one row's figure with the product page's figure for the same size; a different figure is held back."""
    if prod is None:
        return
    cands = _candidates(pfigs, token["size"], variant)
    if len(cands) != 1:
        report.append(f"{item['name']}: product page prints {len(cands)} figures for this size ({prod['nutrition']!r}): not cross-checked")
        return
    stats["cross_checked"] += 1
    if cands[0]["value"] != token["value"]:
        holdback.append((slug(item["name"]), f"The allergen page prints {token['value']} kcal but the same product's page prints "
                                             f"{cands[0]['value']} kcal ({prod['nutrition'].replace(chr(10), ' / ')!r}); two figures on the chain's own website, so neither is published"))
        report.append(f"HELD BACK {item['name']}: allergen page {token['value']} kcal vs product page {cands[0]['value']} kcal")


def _cross_check_range(display: str, token: dict, pfigs: list[dict], variant: str | None, stats: dict, report: list[str]) -> None:
    """Ranges are not published, but a range the two pages print differently would be reported."""
    cands = _candidates(pfigs, token["size"], variant)
    if len(cands) == 1:
        stats["cross_checked_ranges"] += 1
        if cands[0]["value"] != token["value"]:
            report.append(f"NOTE {display} ({token['size']}): range {token['value']} on the allergen page, {cands[0]['value']} on the product page (not published either way)")


def _check_sizes_agree(display: str, made: list[tuple[dict, dict]], holdback: list[tuple[str, str]], report: list[str]) -> None:
    """On one page a bigger size must not have fewer calories than a smaller one; if it does the page contradicts itself: hold the drink back."""
    order = {"Small": 0, "Medium": 1, "Large": 2}
    seq = sorted(made, key=lambda m: order[m[1]["size"]])
    vals = [int(m[0]["calories"]) for m in seq]
    if any(b < a for a, b in zip(vals, vals[1:])):
        for item, _ in seq:
            holdback.append((slug(item["name"]), f"The page prints {', '.join(m[1]['size'] + ' ' + m[0]['calories'] for m in seq)} kcal: "
                                                 "a bigger size with fewer calories, so the page contradicts itself and no size is published"))
        report.append(f"HELD BACK {display}: sizes {vals} are not increasing")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder with the seven allergen pages (allergens-*.html)")
    ap.add_argument("--products", type=Path, required=True, help="folder with the product pages (<slug>.html) for the cross-check")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the seven allergen pages into --pages first (31 s apart)")
    ap.add_argument("--fetch-products", action="store_true", help="download every product page into --products (31 s apart, about 40 minutes)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    args.pages.mkdir(parents=True, exist_ok=True)
    args.products.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        for page in PAGES:
            dp.fetch(f"{dp.HOST}/{page}", args.pages / f"{page}.html")
    if args.fetch_products:
        for page in PAGES:
            for r in dp.read_allergen_page((args.pages / f"{page}.html").read_text(encoding="utf-8"), page):
                dest = args.products / f"{product_slug(r['url'])}.html"
                if not dest.exists():
                    try:
                        dp.fetch(f"{dp.HOST}/{product_slug(r['url'])}", dest)
                    except Exception as e:  # a dead product link must not stop the run; the row is then simply not cross-checked
                        print(f"could not fetch {r['url']}: {e}")
    for page in PAGES:
        print(f"{page}.html sha256 {sha256_file(args.pages / (page + '.html'))}")
    items, holdback, report, stats = build(args.pages, args.products)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Dunkin'", cuisine="Bakery", source_title=SOURCE_TITLE.format(checked=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    by_cat: dict[str, int] = {}
    for i in items:
        by_cat[i["category"]] = by_cat.get(i["category"], 0) + 1
    print(f"products on the pages: {stats['records']}; cross-checked rows: {stats['cross_checked']} (+ {stats['cross_checked_ranges']} ranges); "
          f"products without a product page: {len(stats['no_product_page'])}")
    print("sized from the product page: " + ", ".join(stats["sized_from_product_page"]))
    print("allergen line missing/empty on the allergen page: " + ", ".join(stats["allergen_lines_missing"]))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
