#!/usr/bin/env python3
"""Turtle Bay: turn the menu data that turtlebay.co.uk's own menu page loads into the Chrome-importer inbox format.

    python3 tools/uk_extract/turtle_bay.py --fetch DIR --checked-on 2026-11-17 --inbox INBOX   # one request per restaurant, 1 a second
    python3 tools/uk_extract/turtle_bay.py --raw DIR --checked-on 2026-11-17 --inbox INBOX     # from feeds already saved in DIR
    python3 tools/uk_extract/chrome_import.py turtle-bay --inbox INBOX --out data/source/turtle-bay
    python3 tools/uk_extract/check_chain.py turtle-bay --fail-on-high

Source: https://turtlebay.co.uk/menu/<restaurant>. The page's <app-menu current-slug="bath"> component loads ONE JSON document,
https://tb-menu-proxy.herokuapp.com/restaurant/<slug> (Contentful entries; no key or login; robots.txt answers 404 = no rules),
and its "More info" pop-up shows each dish's `calories` ("N Kcals") and allergen list from it. The first Turtle Bay data
(2026-10-10) was read from the Bath page's pop-ups in the founder's Chrome (data/chrome-inbox/turtle-bay/); the independent
re-check of that day compared every published row with this same JSON. This script reads the JSON instead of clicking.

What is copied: for the Bath menu (SOURCE_SLUG), every dish in the food sections below that prints a calorie figure, with
its section, its name as printed (trimmed) and the `calories` number exactly as the feed gives it. Calories only: the feed
has no protein, carbs or fat. Left out (and listed): dishes with no calorie figure, the drinks and alcohol sections, the
set-menu "packages" and the bottomless brunch. The other restaurants read (CHECK_SLUGS) must show exactly the same food
dishes, calories and allergen lists, or the run stops (the published note says the menu is the same at the restaurants read).

Allergens: the pop-up's list (the entries' titles: "Gluten - Wheat", "Sulphites", ...) is written to the inbox `contains`
column as words the importer knows; a dish whose pop-up has no allergen list gets a blank cell (unknown, never NONE), so the
chain stays link-only for allergens (the importer publishes allergens only when every row has them).

Names: a dish name printed in two food sections (Mac & Cheese: Easy Eating and Sides) gets " (side)" on its Sides row, as
in the first import; any other repeated name stops the run.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHAIN_ID = "turtle-bay"
FEED = "https://tb-menu-proxy.herokuapp.com/restaurant/{slug}"
PAGE = "https://turtlebay.co.uk/menu/{slug}"
SOURCE_SLUG = "bath"
CHECK_SLUGS = ["winchester", "camden", "blackpool"]
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

# Feed section title (trimmed) -> category written to the inbox. Sections in SKIP are not read; any other section stops the run.
SECTIONS = {
    "Breakfast": "Breakfast",
    "Starters | Small Plates": "Starters | Small Plates",
    "Main Plates": "Main Plates",
    "Easy Eating": "Easy Eating",
    "Sides": "Side",
    "Desserts": "Desserts",
    "Bar Menu": "Bar Menu",
}
SKIP = {
    "Bottomless Brunch": "a set brunch package, not a dish",
    "Packages Main Estate": "set-menu packages, not dishes",
    "Packages London": "set-menu packages, not dishes",
    "Cocktails": "drinks and alcohol are left out",
    "Other alcoholic drinks": "drinks and alcohol are left out",
    "Non-alcoholic drinks": "drinks are left out",
    "Soft drinks": "drinks are left out",
}
# The pop-up's allergen titles -> the words the first import wrote (common.allergen_words knows them).
ALLERGEN_WORDS = {
    "Gluten - Wheat": "wheat", "Gluten - Barley": "barley", "Gluten - Rye": "rye", "Gluten - Oat": "oats", "Other cereals": "cereals",
    "Eggs": "eggs", "Milk": "milk", "Mustard": "mustard", "Soya": "soya", "Fish": "fish", "Crustaceans": "crustaceans",
    "Molluscs": "molluscs", "Celery": "celery", "Sulphites": "sulphites", "Peanuts": "peanuts", "Sesame": "sesame", "Lupin": "lupin",
    "Almond": "almonds", "Hazelnut": "hazelnuts", "Walnut": "walnuts", "Cashew": "cashews", "Pecan": "pecans", "Pistachio": "pistachios",
    "Brazil nut": "brazil nuts", "Macadamia": "macadamias", "Other Nuts": "nuts",
}
INBOX_COLUMNS = ["name", "category", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "salt_g",
                 "energy_kj", "weight_g", "serving", "page_url", "contains", "may_contain"]
META = {
    "name": "Turtle Bay",
    "cuisine": "World food",
    "source_title": "Turtle Bay Bath menu, the menu data its page loads (read {checked_on}, no date shown)",
    "source_url": PAGE.format(slug=SOURCE_SLUG),
    "nutrition_level": "calories",
    "basis": "per serving",
    "allowed_hosts": [],
    "note": ("Calories only. The chain's menu feed shows the same dishes, calories and allergens at the {n_read} restaurants read "
             "({read_names}). Dishes with no calories shown, drinks and alcohol are left out."),
    "allergen_guide_title": "Turtle Bay allergen guide (PDF)",
    "allergen_guide_url": "https://turtlebay.co.uk/assets/site/allergen-info.pdf",
    "may_contain_published": False,
}


def fetch(url: str, dest: Path, referer: str) -> None:
    """One polite GET (a normal browser user agent, the page's own Referer), saved decompressed. No retry round a refusal."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json", "Referer": referer})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip" or data[:2] == b"\x1f\x8b":
                import gzip
                data = gzip.decompress(data)
    except urllib.error.HTTPError as err:
        raise SystemExit(f"{url} answered HTTP {err.code}: stopping, not working round it.")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    time.sleep(1.0)


def dishes(feed: dict) -> tuple[list[dict], list[str]]:
    """[(category, name, calories, allergen words)] in menu order, and the dishes left out with the reason."""
    rows, left_out = [], []
    sections_of: dict[str, set[str]] = {}   # every food-section name, with or without calories (for the "(side)" rule)
    for menu in feed["fields"]["tierMenus"]:
        for sec in menu["fields"].get("sections", []):
            title = sec["fields"].get("title", "").strip()
            if title in SKIP:
                continue
            if title not in SECTIONS:
                raise SystemExit(f"New menu section {title!r}: add it to SECTIONS or SKIP in {Path(__file__).name}")
            for it in sec["fields"].get("menuItems", []):
                f = it.get("fields", {})
                name = " ".join(f.get("title", "").split())
                sections_of.setdefault(name.lower(), set()).add(SECTIONS[title])
                kcal = f.get("calories")
                if kcal is None:
                    left_out.append(f"{title} | {name}: no calories shown")
                    continue
                if not isinstance(kcal, (int, float)) or isinstance(kcal, bool):
                    raise SystemExit(f"{name}: calories {kcal!r} is not a number")
                words = []
                for a in f.get("allergens") or []:
                    t = a.get("fields", {}).get("title", "")
                    if t not in ALLERGEN_WORDS:
                        raise SystemExit(f"{name}: unknown allergen title {t!r}: add it to ALLERGEN_WORDS")
                    words.append(ALLERGEN_WORDS[t])
                rows.append({"category": SECTIONS[title], "name": name, "calories": kcal, "contains": ";".join(words)})
    # A name printed in two food sections (with or without calories): the Sides row is "(side)"; anything else stops.
    published = [r["name"].lower() for r in rows]
    for name, cats in sections_of.items():
        if len(cats) > 1 or published.count(name) > 1:
            if len(cats) != 2 or "Side" not in cats or published.count(name) > 2:
                raise SystemExit(f"{name!r} is printed in the food sections {sorted(cats)}: decide by hand")
            for r in rows:
                if r["name"].lower() == name and r["category"] == "Side":
                    r["name"] += " (side)"
    return rows, left_out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--fetch", type=Path, metavar="DIR", help="download each restaurant's menu JSON once into DIR, then read it")
    g.add_argument("--raw", type=Path, metavar="DIR", help="read <slug>.json files already saved in DIR")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the feeds were read")
    ap.add_argument("--inbox", type=Path, required=True, help="write <inbox>/turtle-bay/items.csv and meta.json here")
    args = ap.parse_args()
    raw = args.fetch or args.raw
    slugs = [SOURCE_SLUG] + CHECK_SLUGS
    if args.fetch:
        fetch(PAGE.format(slug=SOURCE_SLUG), raw / f"{SOURCE_SLUG}.html", "https://turtlebay.co.uk/menu")
        for s in slugs:
            fetch(FEED.format(slug=s), raw / f"{s}.json", PAGE.format(slug=s))
    feeds = {s: json.loads((raw / f"{s}.json").read_text(encoding="utf-8")) for s in slugs}
    for s, f in feeds.items():
        if f.get("fields", {}).get("slug") != s:
            raise SystemExit(f"{s}.json is not the {s} menu (slug {f.get('fields', {}).get('slug')!r})")

    rows, left_out = dishes(feeds[SOURCE_SLUG])
    if len(rows) < 40:
        raise SystemExit(f"Only {len(rows)} dishes with calories: the feed changed shape, check it by hand")
    key = lambda rs: sorted((r["category"], r["name"], r["calories"], tuple(sorted(r["contains"].split(";")))) for r in rs)  # noqa: E731
    for s in CHECK_SLUGS:
        other, _ = dishes(feeds[s])
        if key(other) != key(rows):
            a, b = set(key(rows)), set(key(other))
            raise SystemExit(f"{s} prints different dishes, calories or allergens from {SOURCE_SLUG}: only in {SOURCE_SLUG} "
                             f"{sorted(a - b)[:5]}, only in {s} {sorted(b - a)[:5]}. Decide by hand.")

    out = args.inbox / CHAIN_ID
    out.mkdir(parents=True, exist_ok=True)
    page_url = PAGE.format(slug=SOURCE_SLUG)
    with open(out / "items.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=INBOX_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({"name": r["name"], "category": r["category"], "calories": r["calories"], "page_url": page_url,
                        "contains": r["contains"]})
    meta = dict(META)
    read_names = ", ".join(feeds[s]["fields"]["title"] for s in sorted(slugs))
    meta["source_title"] = meta["source_title"].format(checked_on=args.checked_on)
    meta["note"] = meta["note"].format(n_read=len(slugs), read_names=read_names)
    meta["checked_on"] = args.checked_on
    # The site count: the restaurant list the menu page itself prints (its booking widget's `:restaurants` attribute).
    page_html = (raw / f"{SOURCE_SLUG}.html").read_text(encoding="utf-8")
    m = re.search(r"<App-booking-widget :restaurants='(\[.*?\])'>", page_html, re.S)
    if not m:
        raise SystemExit(f"{SOURCE_SLUG}.html has no restaurant list: the page changed, check it by hand")
    sites = [r["title"] for r in json.loads(m.group(1))]
    meta["sites"] = len(sites)
    meta["sites_evidence"] = f"turtlebay.co.uk/menu/{SOURCE_SLUG} lists {len(sites)} restaurants ({sites[0]} to {sites[-1]})"
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} dishes to {out / 'items.csv'} ({SOURCE_SLUG}; same at {', '.join(CHECK_SLUGS)})")
    for x in left_out:
        print("  left out:", x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
