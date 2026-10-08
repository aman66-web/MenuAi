#!/usr/bin/env python3
"""Build data/source/little-dessert-shop/ from Little Dessert Shop's own website (a CALORIES-ONLY chain, with complete allergens).

    python3 tools/uk_extract/little_dessert_shop.py --cache DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Sources (robots.txt allows /menu and /allergens; the pages print no date, so the title says "accessed <date>, no date shown"):
  menu pages  https://www.littledessertshop.co.uk/menu/<id>/<slug>  one per store (STORES below; the chain has about 150 stores, the
              site's /stores page links 64 of them). Each card prints "N kcal" (and the same number in data-prodkcal).
  allergens   https://www.littledessertshop.co.uk/allergens  one table, 14 allergen columns, a tick (contains) or a tick with
              "(May Contain)" or a cross per dish. It is the one allergen page of the whole site (not per store).
--fetch downloads the files that are missing from --cache (one request per file, one per second, browser User-Agent); without it the
script only reads --cache. File names in --cache: menu-<id>.html and allergens.html.

What is printed, and what this script publishes
- The only nutrition figure is the calorie count on a menu card: no protein, carbs, fat, salt, sugar, kJ or weight anywhere, so this is
  a calories-only chain (docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank and every item is non-rankable.
- A card whose product has choices (flavour, sauce, extras...) prints the figure for the dish before the choices: the site's own basket
  adds each chosen option's calories to it ("Total N kcal"). Those figures are published as printed and note.txt says choices add to them.
- The menus differ a little from store to store (an item list of 119 to 133 cards). A dish is published only when EVERY store read
  that prints a calorie figure for it prints the same one, and the dish has exactly one clear row in the allergens table (below).
  Dishes that fail either test are left out and listed in the run's output. Which stores were read is in note.txt.
- Allergens (docs/DATA.md "Allergens"): the table's rows are joined to the menu by the dish's printed name (only spaces tidied; nothing
  fuzzy). A tick = contains, a tick followed by "(May Contain)" = may contain, a cross = not marked (the page's own filter buttons treat
  a tick as "has the allergen"). The "Nuts" column is tree nuts, "Soybeans" is soya, "Sulphur Dioxide" is sulphites. The table names no
  cereals or tree nuts, and the page says "Our products are prepared & created on-site in a kitchen area where nuts, gluten & other
  allergens are present" (so may_contain_published = yes). A dish with no row, with a row reading "Product may vary, please ask a member
  of staff for further allergen information", or with several rows that disagree has no readable allergens, so it is NOT published
  (allergens are all or nothing for the chain: every published dish has a row). Choices can add allergens (the options carry their own).
- The small allergen/diet icons on a card are hidden by the site's stylesheet and are not used; the menu has no vegetarian mark that
  visitors see, so no dish is tagged vegetarian. No dish name says pork or beef.
"""
from __future__ import annotations
import argparse
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.robotparser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import little_dessert_shop_pages as pages  # noqa: E402
from common import allergen_words, sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "little-dessert-shop"
BASE = "https://www.littledessertshop.co.uk"
ALLERGENS_URL = BASE + "/allergens"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ALIASES = ["little dessert shop", "little dessert shop uk", "the little dessert shop"]
# (store id, slug, short place name for note.txt, cards on the page, cards with a calorie figure): the numbers are checked on every run.
# Reading (/menu/106/reading) was read too but not used: its page is an older, smaller menu that prints a calorie figure on only 3 dishes.
STORES = [
    (1, "city-centre-wolverhampton", "Wolverhampton", 229, 132),
    (10, "bullring-grand-central-birmingham", "Birmingham Bullring", 218, 134),
    (8, "altrincham-greater-manchester", "Altrincham", 218, 132),
    (35, "chorlton-manchester", "Chorlton", 215, 132),
    (24, "balham-south-london", "Balham", 215, 132),
    (65, "battersea-south-west-london", "Battersea", 221, 132),
    (36, "southall-west-london", "Southall", 215, 132),
    (93, "croydon", "Croydon", 215, 132),
    (40, "glasgow-east-scotland", "Glasgow East", 220, 132),
    (34, "cardiff-wales", "Cardiff", 219, 132),
    (13, "isle-of-wight-sandown", "Sandown", 213, 132),
    (59, "exeter-devon", "Exeter", 219, 132),
    (84, "nottingham", "Nottingham", 216, 134),
    (64, "leicester-central-leicestershire", "Leicester", 217, 133),
    (105, "stockport", "Stockport", 225, 133),
    (94, "wrexham", "Wrexham", 223, 132),
    (83, "doncaster", "Doncaster", 216, 133),
    (92, "huddersfield", "Huddersfield", 214, 133),
]
EXPECTED_ALLERGEN_ROWS = 207
EXPECTED_ITEMS = 104
# Dishes whose allergen row marks no milk at all (not even "may contain") although the dish's own description on the site names milk
# or a dairy ingredient. Neither is chosen (nothing is corrected): they stay in items.csv and are listed in holdback.csv, so the
# pipeline does not publish them. Found by the independent re-read of 2026-10-08; restore by deleting the line once the chain fixes its table.
HOLDBACK = {
    "strawberry-cheesecake": "Allergen row contradicts the dish name/description: a cheesecake described as 'buttery biscuit base. Smooth, creamy' but the allergens table marks no milk (it ticks gluten and soya only)",
    "roche-krunch-kunafa-cake": "Allergen row contradicts the dish description: 'layered with smooth milk chocolate ganache' but the allergens table marks no milk (the two other Krunch Kunafa Cakes tick milk)",
    "coconut-snowflake-crunch-loaded-crepe": "Allergen row contradicts the dish description: 'coconut white chocolate ... white chocolate curls ... a scoop of ice cream' but the allergens table marks no milk",
}


def fetch_missing(cache: Path) -> None:
    rp = urllib.robotparser.RobotFileParser()
    req = urllib.request.Request(BASE + "/robots.txt", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        rp.parse(r.read().decode("utf-8", "replace").splitlines())
    todo = [("allergens.html", ALLERGENS_URL)] + [(f"menu-{i}.html", f"{BASE}/menu/{i}/{slug}") for i, slug, _, _, _ in STORES]
    for fname, url in todo:
        path = cache / fname
        if path.exists():
            continue
        if not rp.can_fetch("*", url):
            raise SystemExit(f"robots.txt does not allow {url}: stop, do not work round it")
        time.sleep(1)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status != 200:
                raise SystemExit(f"{url}: HTTP {r.status}")
            path.write_bytes(r.read())
        print(f"fetched {url}")


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def make_id(name: str) -> str:
    s = strip_accents(name).lower().replace("&", " and ").replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "item"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder holding allergens.html and menu-<id>.html")
    ap.add_argument("--checked-on", required=True, help="the day the pages were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the files missing from --cache (1 request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        fetch_missing(args.cache)

    # ---- allergens table
    apath = args.cache / "allergens.html"
    print(f"allergens page sha256 {sha256_file(apath)}  {apath}")
    arows = pages.read_allergens(apath.read_text(encoding="utf-8"))
    if len(arows) != EXPECTED_ALLERGEN_ROWS:
        raise SystemExit(f"The allergens table has {len(arows)} rows, this script expects {EXPECTED_ALLERGEN_ROWS}: the table changed, re-check")
    by_name = {}
    for r in arows:
        by_name.setdefault(pages.name_key(r["name"]), []).append(r)

    # ---- store menus
    stores = []   # (id, place name, {key: [cards]})
    for sid, slug, label, n_cards, n_kcal in STORES:
        p = args.cache / f"menu-{sid}.html"
        print(f"store {sid:>3} {slug:<36} sha256 {sha256_file(p)}")
        _, cards = pages.read_menu(p.read_text(encoding="utf-8"), f"store {sid}")
        with_kcal = sum(1 for c in cards if c["kcal"])
        print(f"          cards {len(cards)}, with calories {with_kcal}")
        if n_cards and (len(cards), with_kcal) != (n_cards, n_kcal):
            raise SystemExit(f"store {sid}: {len(cards)} cards / {with_kcal} with calories, expected {n_cards} / {n_kcal}: the menu changed")
        keyed = {}
        for c in cards:
            keyed.setdefault(pages.name_key(c["name"]), []).append(c)
        stores.append((sid, label, keyed))

    # ---- merge
    order = []  # keys in the order first met (reference store first)
    for _, _, keyed in stores:
        for k in keyed:
            if k not in order:
                order.append(k)
    report = {"no_kcal": [], "kcal_differs": [], "no_allergens": [], "vary": [], "allergens_disagree": [], "cat_differs": [],
              "some_stores_no_kcal": [], "only_some_stores": [], "same_name_two_cards": []}
    published = []
    for key in order:
        seen_in = [(sid, keyed[key]) for sid, _, keyed in stores if key in keyed]
        kcals = {}
        silent = []
        clash = [sid for sid, cs in seen_in if len({c["kcal"] for c in cs}) > 1]
        if clash:
            report["same_name_two_cards"].append(f"{key}: two cards with this name but different calories (or one without) in stores {clash}")
            continue
        for sid, cs in seen_in:
            for c in cs:
                if c["kcal"] is None:
                    silent.append(sid)
                else:
                    kcals.setdefault(c["kcal"], []).append(sid)
        if not kcals:
            report["no_kcal"].append(key)
            continue
        if len(kcals) > 1:
            report["kcal_differs"].append(f"{key}: " + "; ".join(f"{k} kcal in stores {sorted(set(v))}" for k, v in sorted(kcals.items())))
            continue
        if silent:
            report["some_stores_no_kcal"].append(f"{key}: no calories shown in stores {sorted(set(silent))}")
        rows = by_name.get(key, [])
        if not rows:
            report["no_allergens"].append(key)
            continue
        if any(r["vary"] for r in rows):
            report["vary"].append(key)
            continue
        if any(r["cells"] != rows[0]["cells"] for r in rows):
            report["allergens_disagree"].append(key)
            continue
        cats = []
        for sid, cs in seen_in:
            for c in cs:
                if c["category"] not in cats:
                    cats.append(c["category"])
        if len(cats) > 1:
            report["cat_differs"].append(f"{key}: {cats}")
        n_stores = len({sid for sid, _ in seen_in})
        if n_stores < len(stores):
            report["only_some_stores"].append(f"{key}: listed in {n_stores} of {len(stores)} stores")
        published.append({"key": key, "kcal": next(iter(kcals)), "category": cats[0], "cells": rows[0]["cells"], "n_rows": len(rows),
                          "n_stores": n_stores, "options": any(c["options"] for _, cs in seen_in for c in cs)})

    # ---- items
    items = []
    for p in published:
        cells = p["cells"]
        contains_words = [col for col, v in cells.items() if v == "contains"]
        may_words = [col for col, v in cells.items() if v == "may"]
        keys_c, _, _ = allergen_words(contains_words, p["key"])
        keys_m, _, _ = allergen_words(may_words, p["key"])
        notes = [f"listed in {p['n_stores']} of {len(stores)} stores read", f"{p['n_rows']} allergen table row(s)"]
        if p["options"]:
            notes.append("card has choices; the calories are for the dish before choices")
        items.append({"id": make_id(p["key"]), "name": p["key"], "category": p["category"], "calories": p["kcal"], "rankable": False,
                      "notes": "; ".join(notes),
                      "allergens": {"contains": keys_c, "may_contain": keys_m, "cereals": set(), "nuts": set()}})
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Built {len(items)} items, this script expects {EXPECTED_ITEMS}: the menus or the allergens table changed, re-check before running again")
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids are not unique")
    store_text = ", ".join(label for _, label, _ in stores)
    note = ("Calories for the dish before any choices: flavours, sauces and extras add calories and can add allergens. Listed only if "
            "all %d stores read print the same figure: %s." % (len(stores), store_text))
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters, the limit is 400")
    guide = {"title": "Little Dessert Shop allergens page (accessed %s, no date shown)" % args.checked_on, "url": ALLERGENS_URL,
             "checked_on": args.checked_on, "may_contain_published": True}
    title = "Little Dessert Shop store menu pages with calories and allergens page (accessed %s, no date shown)" % args.checked_on
    stale = [h for h in HOLDBACK if h not in ids]
    if stale:
        raise SystemExit(f"HOLDBACK names items that are not on the menu any more: {stale}")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Little Dessert Shop", cuisine="Desserts", source_title=title,
                             source_url=f"{BASE}/menu/1/city-centre-wolverhampton", checked_on=args.checked_on, aliases=ALIASES, items=items,
                             out=args.out, note=note, allergen_guide=guide, nutrition_level="calories", holdback=list(HOLDBACK.items()))
    cats = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print("note.txt length", len(note))
    unmatched = sorted(set(by_name) - set(order))
    print(f"allergen table names that are on none of the {len(stores)} store menus: {len(unmatched)}: {unmatched}")
    for k, v in report.items():
        print(f"--- {k} ({len(v)})")
        for line in v:
            print("   " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
