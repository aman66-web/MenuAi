#!/usr/bin/env python3
"""Build data/source/deep-blue/ from the calories Deep Blue's own ordering site prints once a shop is picked (a CALORIES-ONLY chain).

    python3 tools/uk_extract/deep_blue.py CACHE_DIR --fetch                    # robots check, then each shop's category pages (headless Chromium)
    python3 tools/uk_extract/deep_blue.py CACHE_DIR --checked-on 2026-10-12 [--out DIR]

Source: Deep Blue fish & chips (www.deepbluerestaurants.com; its "Nutritional Information" page says "please visit our online ordering platform to
view it" and its "Order Online" link is https://order.deepbluerestaurants.com/, a Vita Mojo site). After a postcode search the shop list shows the
chain's shops; each shop's menu tiles print the product, its price and "NNN kcal" ("Adults need around 2000 kcal / day"). Read with the shared
reader vita_mojo.py (robots.txt of order.deepbluerestaurants.com: `Disallow:` empty; vmos2.vmos.io serves no robots file: no rules).
The chain's own locations page lists 7 restaurants (Brandesburton, Horsham, Lymington, Market Weighton, Newmarket, Norwich, Wetwang); the 6 below
take orders online (Norwich does not). Two menus: "Deep Blue North Takeaway" (the three East Yorkshire shops) and "Takeaway Menu" (the three in
the South and East). All 6 are read.

Rule (as for the pub chains): a product is published only when the same name prints the same kcal at 2 or more of the shops read, and left out
if any shop prints another figure. What is copied is the tile's printed "NNN kcal" (rendered page text); the saved API answer is used only to
check the copy (`check_listing`: every printed figure must equal the product's own calories figure at a 100 % default quantity).
Left out: the "Bundles" category (meal deals made of other products), every tile that prints 0 kcal (Hake Regular and Large print 0 kcal while
the data behind them holds one shared figure for both sizes, so no figure is the chain's), any product whose tile offers more than one size,
every alcoholic drink (none seen), and tiles printing no kcal.
Held back (holdback.csv): two counts or sizes of one product printing the same kcal ("Boneless Chicken Wings (4)" and "(6)"), since one of the
chain's own figures can't be right; and the two Northern Bloc flavours in HOLD (see there).
No allergens are copied: the chain's allergen page links matrices filed in 2021 that don't name today's products exactly; the chain gets that
page as a link. No vegetarian tags: the chain's locations page says fried food at the Yorkshire shops is cooked in beef dripping, and no
item says what it is fried in. contains_pork / contains_beef only from the product's own name (pork, sausage, bacon, ham; beef, steak).
"""
from __future__ import annotations

import argparse
import collections
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vita_mojo as vm  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "deep-blue"
ORIGIN = "https://order.deepbluerestaurants.com"
NORTH, SOUTH = "d12aac22-0e9d-42dd-8895-2278e97f16b0", "0e1f4b30-6e20-457a-bab6-fc8d2c44a0ba"
STORES = [("ce5ffed0-c9ee-11eb-903b-0676c9cc7839", "Market Weighton", NORTH), ("ce601849-c9ee-11eb-903b-0676c9cc7839", "Wetwang", NORTH),
          ("ce5fef0f-c9ee-11eb-903b-0676c9cc7839", "Brandesburton", NORTH), ("ce5fffc3-c9ee-11eb-903b-0676c9cc7839", "Newmarket", SOUTH),
          ("ce5ff9f6-c9ee-11eb-903b-0676c9cc7839", "Horsham", SOUTH), ("ce5ffbf6-c9ee-11eb-903b-0676c9cc7839", "Lymington", SOUTH)]
SKIP = r"^(bundles|promotions|meal deals?)$"
MIN_STORES = 2
SOURCE_URL = ORIGIN + "/"
SOURCE_TITLE = "Deep Blue online ordering menus with calories (order.deepbluerestaurants.com, 6 shops, read 12 October 2026)"
ALLERGEN_URL = "https://www.deepbluerestaurants.com/allergens"
NOTE = ("Calories only, as Deep Blue's ordering site prints them once a shop is picked; 6 shops were read and only figures printed the same at 2 "
        "or more are shown, so most cod, haddock and chip portions (which differ between its Yorkshire and southern shops) are missing. Sauces and "
        "extras are not counted; fried food at the Yorkshire shops is cooked in beef dripping.")
ALCOHOL = re.compile(r"\b(beer|lager|ale|cider|wine|prosecco|gin|vodka|rum|whisk(?:e)?y|alcohol)\b", re.I)
PORK = re.compile(r"\b(pork|bacon|ham|sausage|salami|chorizo|gammon)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
SIZE_SUFFIX = re.compile(r"\s*\((?:\d+|x\d+|regular|large|small|medium)\)\s*$", re.I)
# Printed figures held back after looking (reason in holdback.csv; never corrected). Keyed by the printed name.
HOLD = {
    "Northern Bloc Peppermint Choc Chip 100ml": ("prints 82 kcal per 100 ml, the same figure as the Lemon flavour beside it, while the other dairy "
                                                 "flavours print 204-211 kcal: it looks copied, so it is held back"),
    "Northern Bloc Strawberries Cream 100ml": ("prints 82 kcal per 100 ml, the same figure as the Lemon flavour beside it, while the other dairy "
                                               "flavours print 204-211 kcal: it looks copied, so it is held back"),
}
RANKABLE_CATS = {"fish", "fish & chips", "savouries", "andrew jones pies", "chip shop classics", "burgers", "seniors'", "kids meals", "specials"}


def build(cache: Path, checked_on: str, out: Path | None) -> None:
    seen: dict[str, dict[str, str | None]] = collections.defaultdict(dict)
    first: dict[str, dict] = {}
    order: list[str] = []
    left_out: list[str] = []
    checked = 0
    for store, sname, menu in STORES:
        for c in vm.categories(cache, store, menu):
            if re.match(SKIP, c["name"].strip(), re.I):
                continue
            bl = vm.bundles(cache, store, c["uuid"])
            text = (cache / f"{store}_cat_{c['uuid']}.txt").read_text(encoding="utf-8")
            names = [b["name"].strip() for b in bl]
            printed = vm.listing_kcal(text, names)
            for b in bl:
                name = " ".join(b["name"].split())
                tiles = printed.get(b["name"].strip(), [])
                if not tiles and "No products to display" in text:
                    # a time-limited category (e.g. "Lunchtime Special (12-2)") read outside its hours: nothing printed
                    key = name.lower()
                    if key not in first:
                        first[key] = dict(b=b, cat=c["name"].strip(), name=name)
                        order.append(key)
                    seen[key][sname] = None
                    continue
                if not tiles:
                    raise SystemExit(f"{sname} / {c['name']}: product {name!r} is in the data but no tile of it was found on the page: look")
                if len(set(tiles)) > 1:
                    raise SystemExit(f"{sname} / {c['name']}: {name!r} has tiles printing different kcal {tiles}: look")
                kc = tiles[0]
                # check the copy against the data the page loaded (never used as a figure)
                base = vm.base_items(b)
                nm = (base[0].get("nutritionalMeta") or {}) if base else {}
                if kc is not None and nm.get("defaultQuantity") == 100 and str(nm.get("calories")) != kc:
                    raise SystemExit(f"{sname}: {name!r} prints {kc} kcal but its data says {nm.get('calories')}: the copy is wrong, look")
                checked += kc is not None
                key = name.lower()
                if key not in first:
                    first[key] = dict(b=b, cat=c["name"].strip(), name=name)
                    order.append(key)
                if vm.size_count(b) > 1:
                    val = "SIZES"
                elif kc in (None, "0"):
                    val = None if kc is None else "0"
                else:
                    val = kc
                if sname in seen[key] and seen[key][sname] is not None and val is not None and seen[key][sname] != val:
                    val = f"CONFLICT {seen[key][sname]}/{val}"  # one shop prints two figures for one name (two categories)
                if val is not None or sname not in seen[key]:
                    seen[key][sname] = val
    items, disagree, one_store = [], [], []
    for key in order:
        cat, name = first[key]["cat"], first[key]["name"]
        by = seen[key]
        vals = {s: v for s, v in by.items() if v not in (None, "0", "SIZES")}
        if any(v == "SIZES" for v in by.values()):
            left_out.append(f"{cat}: {name} (more than one size on one tile)")
            continue
        if any(isinstance(v, str) and v.startswith("CONFLICT") for v in by.values()):
            disagree.append(f"{cat}: {name} {dict(by)}")
            continue
        if cat.lower() == "drinks" and ALCOHOL.search(name):
            left_out.append(f"{cat}: {name} (alcoholic drink)")
            continue
        if any(v == "0" for v in by.values()):
            left_out.append(f"{cat}: {name} (prints 0 kcal at {sorted(s for s, v in by.items() if v == '0')})")
            continue
        if not vals:
            left_out.append(f"{cat}: {name} (no kcal printed)")
            continue
        if len(set(vals.values())) > 1:
            disagree.append(f"{cat}: {name} {vals}")
            continue
        if len(vals) < MIN_STORES:
            one_store.append(f"{cat}: {name} (printed at {sorted(vals)} only)")
            continue
        tags = []
        if PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        items.append(dict(id=slug(name), name=name, category=cat.title().replace("'S", "'s"), calories=next(iter(vals.values())),
                          rankable=cat.lower() in RANKABLE_CATS, tags="|".join(tags),
                          notes=f"printed identically at {len(vals)} of {len(STORES)} shops: {', '.join(sorted(vals))}"))
    # a name in two categories with the same figure is one product: keep the first
    seen_names: dict[str, dict] = {}
    unique = []
    for it in items:
        prev = seen_names.get(it["name"].lower())
        if prev:
            if prev["calories"] != it["calories"]:
                raise SystemExit(f"{it['name']} is in two categories with different kcal: look")
            continue
        seen_names[it["name"].lower()] = it
        unique.append(it)
    # the same product in two counts or sizes ("Boneless Chicken Wings (4)" and "(6)") printing the same kcal: one figure can't be right
    holdback = []
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for it in unique:
        groups[SIZE_SUFFIX.sub("", it["name"]).strip().lower()].append(it)
    for it in unique:
        if it["name"] in HOLD:
            holdback.append((it["id"], f"Deep Blue's site {HOLD[it['name']]}. Never corrected."))
    for base, its in groups.items():
        kc = collections.Counter(it["calories"] for it in its)
        for it in its:
            if len(its) > 1 and kc[it["calories"]] > 1:
                others = [o["name"] for o in its if o is not it and o["calories"] == it["calories"]]
                holdback.append((it["id"], f"Deep Blue's site prints the same {it['calories']} kcal for {it['name']} and {', '.join(others)}, "
                                           "a different count or size of the same product, so one figure can't be right. Held back, never corrected."))
    print(f"tiles checked against the page's own data: {checked}, all equal")
    print(f"published {len(unique)} items from {len(STORES)} shops")
    for title, rows in (("left out", left_out), ("DIFFERENT kcal between shops (left out)", disagree), ("at one shop only (left out)", one_store)):
        print(f"{title}: {len(rows)}")
        for r in rows:
            print("   ", r)
    guide = {"title": "Deep Blue allergen information", "url": ALLERGEN_URL, "checked_on": checked_on, "may_contain_published": False}
    write_chain_folder(chain_id=CHAIN_ID, name="Deep Blue", cuisine="Seafood", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                       checked_on=checked_on, aliases=["deep blue", "deep blue fish and chips", "deep blue restaurants", "deep blue fish & chips"],
                       items=unique, out=out, note=NOTE, nutrition_level="calories", allergen_guide=guide, holdback=holdback)
    print(f"held back: {len(holdback)}")
    for h in holdback:
        print("   ", h[0])
    print("written", out or f"data/source/{CHAIN_ID}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--checked-on", default=time.strftime("%Y-%m-%d"))
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    if a.fetch:
        vm.harvest(a.cache, ORIGIN, [(s, m) for s, _, m in STORES], products=False, skip=SKIP, delay=2.0)
    build(a.cache, a.checked_on, a.out)


if __name__ == "__main__":
    main()
