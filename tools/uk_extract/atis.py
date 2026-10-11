#!/usr/bin/env python3
"""Build data/source/atis/ from atis's own HTML menu pages (a FULL-NUTRITION chain, 16 sites, all in London).

    python3 tools/uk_extract/atis.py CACHE_DIR --fetch                          # download the pages politely (3 pages + 5 small feed pages)
    python3 tools/uk_extract/atis.py CACHE_DIR --checked-on 2026-10-11 [--out DIR] [--no-write]

Source (all on https://atis.life, whose robots.txt is `User-agent: *  Allow: /  Disallow: /admin`, no group for any crawler; checked with
robots_rfc.py before every request, one request a second, a normal browser User-Agent):
    /bowls-plates-sides   Essentials Edit, Power Plates, Salad Bowls, Side Pots: each dish card prints CALORIES, PROTEIN, CARBS and FAT
    /wraps                Wraps: the same four figures
    /locations            the restaurant list (16 sites)
    /api/en/products?collections=<id>&page=1   the feed behind each section's "Load more" button: read only to confirm that the page already
                          holds every dish of the section (its `meta.total` equals the number of dishes on the page; page 2 is empty)
The figures sit in the page's own data (the Vue component `<our-menu :preloaded-collections="[...]">`, one `nutrients` list per dish) and are the
same four numbers the cards show (a rendered-page read of every card was compared in the spot check, data/audit/verified/atis.json).
NOT used, never fetched: the build-your-own bowls and the drinks, which are published only in "BYO Nutritional Guide" / "Drinks Menu Nutritionals"
PDFs on atis-life.s3.eu-west-1.amazonaws.com (that host's robots.txt answers 403), and the page's "Smoothies, Shakes + Snacks" and "Breakfast + Coffee"
pages, which print no nutrition. The page data also holds allergen and dietary lists per dish that no page shows (the cards and the FAQ show neither;
the FAQ points to a PDF allergen guide): they are not used, so there are no allergens and no vegetarian tags here.

What the page says the figures are: per dish as served, whole numbers, and (its FAQ, "Do the nutritional values on the website include the dressing?")
"Yes, the nutritional values on our website include the dressing, based on a regular sized dressing pot." No serving size is printed (`serving` stays blank).
No kJ, saturates, sugars, fibre or salt are printed (blank).

How a dish qualifies: all four numbers present, each a plain whole number once the trailing "G" is dropped. A dish whose figure is a range
("330 - 414") or that prints calories only is not published (listed in the run output). The script stops if the sections or dish counts change.
Dish names are the cards' own capitals tidied to Title Case; the site's spelling is kept ("Ceasar" in the wraps section).
Tags: contains_beef / contains_pork only when the dish's name or description says so (steak, beef; bacon, ham, sausage, pork, chorizo). Nothing else is inferred.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from azzurri_html import Blocked, http_get  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

HOST = "https://atis.life"
CHAIN_ID = "atis"
PAGES = {"bowls-plates-sides": "/bowls-plates-sides", "wraps": "/wraps", "locations": "/locations"}
# Section id -> (name as the page prints it, number of dishes the page and the feed both hold on 2026-10-11)
SECTIONS = {18: ("Essentials Edit", 2), 4: ("Power Plates", 4), 2: ("Salad Bowls", 4), 6: ("Side Pots", 5), 30: ("Wraps", 4)}
CATEGORY_ORDER = ["Essentials Edit", "Power Plates", "Salad Bowls", "Wraps", "Side Pots"]
EXPECTED_SITES = 16
SOURCE_TITLE = "atis menu pages with nutrition (atis.life/bowls-plates-sides and atis.life/wraps: curated bowls, plates, wraps and side pots), read 11 October 2026"
SOURCE_URL = "https://atis.life/bowls-plates-sides"
ALIASES = ["atis", "atis life", "atis london"]
NOTE = ("Calories, protein, carbs and fat per dish as printed on atis's menu pages, including the dressing (a regular dressing pot). Only the curated "
        "dishes are listed: build-your-own bowls and drinks publish their figures in PDF guides only. Allergens are not shown here.")
_PORK = re.compile(r"\b(bacon|ham|sausages?|pork|chorizo|pepperoni|salami|prosciutto|pancetta|nduja)\b", re.I)
_BEEF = re.compile(r"\b(beef|steak|brisket|sirloin)\b", re.I)


# ------------------------------------------------------------------------------------------------------------------ fetching

def robots_rules(cache: Path) -> list:
    path = cache / "robots.txt"
    if not path.exists():
        status, data = http_get(HOST + "/robots.txt", rules=None, accept="text/plain,*/*;q=0.8")
        if status != 200:
            raise Blocked(f"robots.txt answered HTTP {status}: stopped (not read as 'no rules')")
        path.write_bytes(data)
    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        if line.split("#", 1)[0].strip().lower().startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip().lower()
            if any(w in agent for w in ("claude", "anthropic")):
                raise Blocked(f"robots.txt has a group for {agent!r}: stopped")
    return robots_rfc.parse(text)


def get_cached(cache: Path, rel: str, url_path: str, rules: list, accept: str | None = None) -> str:
    f = cache / rel
    if not f.exists():
        kw = {"accept": accept} if accept else {}
        status, data = http_get(HOST + url_path, rules=rules, **kw)
        if status != 200:
            raise Blocked(f"{url_path} answered HTTP {status}: stopped")
        f.write_bytes(data)
    return f.read_text(encoding="utf-8", errors="replace")


def fetch_all(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    rules = robots_rules(cache)
    for key, path in PAGES.items():
        get_cached(cache, f"{key}.html", path, rules)
    for sid in SECTIONS:
        get_cached(cache, f"api-{sid}.json", f"/api/en/products?collections={sid}&page=1", rules, accept="application/json")


# ------------------------------------------------------------------------------------------------------------------ parsing

def prop(page: str, name: str):
    """The JSON of a Vue prop such as :preloaded-collections="[...]" (HTML-escaped)."""
    start = page.find(f' :{name}="')
    if start < 0:
        raise SystemExit(f"the page no longer has the {name} prop: the site has changed shape")
    start += len(f' :{name}="')
    return json.loads(htmllib.unescape(page[start:page.index('"', start)]))


def title_case(raw: str) -> str:
    """'SEIZ\u2019A CAESAR' -> 'Seiz\u2019a Caesar' (only the capitals are tidied; the site's spelling is kept)."""
    return " ".join(w[:1].upper() + w[1:].lower() for w in re.sub(r"\s+", " ", raw).strip().split(" "))


def number(raw: str) -> str | None:
    """'724' -> '724'; '31G' -> '31'; a range, a blank or anything else -> None."""
    m = re.fullmatch(r"\s*(\d+)\s*[gG]?\s*", raw or "")
    return m.group(1) if m else None


def read(cache: Path) -> tuple[list[dict], list[str]]:
    items: list[dict] = []
    skipped: list[str] = []
    seen_sections: dict[int, int] = {}
    for key in ("bowls-plates-sides", "wraps"):
        page = (cache / f"{key}.html").read_text(encoding="utf-8")
        for coll in prop(page, "preloaded-collections"):
            sid = coll["id"]
            if sid not in SECTIONS:
                raise SystemExit(f"{key}: unknown section {sid} {coll.get('name')!r}: the menu has changed, re-check SECTIONS")
            label, expected = SECTIONS[sid]
            if coll["name"].strip().title() != label.title():
                raise SystemExit(f"section {sid} is now called {coll['name']!r} (expected {label!r})")
            products = coll["products"]
            api = json.loads((cache / f"api-{sid}.json").read_text(encoding="utf-8"))
            if len(products) != expected or api["meta"]["total"] != len(products) or api["meta"]["last_page"] != 1:
                raise SystemExit(f"section {label}: {len(products)} dishes on the page, feed total {api['meta']['total']} (expected {expected}): "
                                 "the menu has changed, re-check SECTIONS")
            seen_sections[sid] = len(products)
            for p in products:
                title = re.sub(r"\s+", " ", p["title"]).strip()
                nut = {n["title"].strip().upper(): n["value"] for n in p.get("nutrients", [])}
                if set(nut) - {"CALORIES", "PROTEIN", "CARBS", "FAT"}:
                    raise SystemExit(f"{title}: unexpected nutrient titles {sorted(nut)}")
                vals = {k: number(nut.get(k, "")) for k in ("CALORIES", "PROTEIN", "CARBS", "FAT")}
                if any(v is None for v in vals.values()):
                    why = "a range" if any(" - " in str(nut.get(k, "")) for k in nut) else "not all four figures printed"
                    skipped.append(f"{title} ({label}): {why}: {dict(nut)}")
                    continue
                desc = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", p.get("description") or ""))).strip()
                tags = [t for t, rx in (("contains_pork", _PORK), ("contains_beef", _BEEF)) if rx.search(title + " " + desc)]
                items.append({"name": title_case(title), "category": label, "calories": vals["CALORIES"], "protein_g": vals["PROTEIN"],
                              "carbs_g": vals["CARBS"], "fat_g": vals["FAT"], "tags": "|".join(tags), "rankable": True,
                              "notes": f"{desc}. Page figures: {nut['CALORIES']} kcal, {nut['PROTEIN']}, {nut['CARBS']}, {nut['FAT']}"})
    if set(seen_sections) != set(SECTIONS):
        raise SystemExit(f"sections read {sorted(seen_sections)} but expected {sorted(SECTIONS)}")
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    return items, skipped


def count_sites(cache: Path) -> list[str]:
    page = (cache / "locations.html").read_text(encoding="utf-8")
    locs = prop(page, "locations")
    names = [l["name"] for l in locs]
    if len(names) != EXPECTED_SITES:
        raise SystemExit(f"/locations now lists {len(names)} sites (expected {EXPECTED_SITES})")
    return names


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true", help="download the pages first (the cache is reused if present)")
    ap.add_argument("--checked-on", help="the day the pages were read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.cache)
        print("fetched into", args.cache)
        if not args.checked_on:
            return
    if not args.checked_on:
        ap.error("--checked-on is required")
    for key in PAGES:
        print(f"{key}.html sha256 {sha256_file(args.cache / (key + '.html'))}")
    items, skipped = read(args.cache)
    sites = count_sites(args.cache)
    print(f"{len(sites)} sites on /locations: " + ", ".join(sites))
    for s in skipped:
        print("not published:", s)
    if args.no_write:
        print(f"would publish {len(items)} items")
        return
    out = write_chain_folder(chain_id=CHAIN_ID, name="Atis", cuisine="Bowls", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE)
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {sum(1 for i in items if i['category'] == c)}" for c in CATEGORY_ORDER))


if __name__ == "__main__":
    main()
