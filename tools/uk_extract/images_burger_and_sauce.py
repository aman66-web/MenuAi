#!/usr/bin/env python3
"""Item photos for Burger & Sauce from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_burger_and_sauce.py --cache DIR [--dry-run]

Source: the chain's own product pages https://burgerandsauce.com/products/... (WordPress), found from the links on its menu page
https://burgerandsauce.com/menu/ (the page that links the Calorie Count PDF data/source/burger-and-sauce/chain.csv cites) and, since
2026-11-17, from the chain's own product sitemap https://burgerandsauce.com/products-sitemap.xml (named in its robots.txt through
sitemap_index.xml), which also lists product pages the menu page no longer links (e.g. /products/animal-nachos/, /products/mexican-nachos/,
both marked "BACK SOON!" on the page while the dishes are on the Calorie Count PDF). A product page carries the product's name (<title>
"<Name> BURGER & SAUCE" and the heading text printed next to the picture) and its picture (og:image = the 1024 px PNG the page itself
shows). Server-rendered HTML, no browser needed.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the name printed on the product page right beside its picture (the product's heading) has the same norm_name as the item's name.
     Usually the page's <title> carries the same name; where it doesn't, the printed heading is the product's name and the <title> is
     the page's short name (the "Apple Refresher" page prints "When Apple Was Just A Fruit" beside its picture: that drink gets the photo;
     the "Mango Refresher" page prints "Everything Goes Better with Mango", which is not the published "Everything's Better With Mango",
     so it gets nothing),
  2. exactly one published item has that name and exactly one product page carries it, and
  3. the picture file is not used by product pages with different names. (The three wings pages all show one "Lemon Pepper Wings"
     banner picture, so none of the wings gets a photo; the four "The Wrap ..." pages share one picture and none of them is named
     "The Wrap".)
Pages whose name differs from the published item's name ("Angus Beef Stack Burger" vs "Angus Stack", "The Original Veggi Burger" vs
"The Original Veggie Burger", "Fererro Rocher" vs "Ferrero Rocher", "Chicken Strips (3)" vs "Strips", "Club Range Beef Burger" vs
"Club Beef", "The Fiery Legend Burger" vs "Fiery Legend", ...) get nothing: we do not guess.

Run of 2026-11-17: robots.txt re-read (unchanged, as above; its Sitemap line names sitemap_index.xml); 34 product pages linked from /menu/
plus 12 more from products-sitemap.xml; the footer clause quoted below re-read on /menu/ (same words, "BURGER & SAUCE(c) LTD"). 17 items
matched (the 14 of 2026-10-09 plus Animal Nachos, Mexican Nachos and When Apple Was Just a Fruit); all 17 looked at on a contact sheet
and kept (the drinks' cups print the chain's own "LET'S GET SAUCY" cup design, no figure or offer).

Terms: the site has no terms-of-use page (/terms, /terms-and-conditions are 404; the privacy and refund policies say nothing about
images). Its footer on every page reads (read 2026-10-10): "Copyright (c) 2026 All Rights Reserved. BURGER & SAUCE LTD ALL CONTENT IS
THE PROPERTY OF BURGER & SAUCE LTD AND ANY USE, DISTRIBUTION OR CHANGE MAY ONLY BE SUBJECT TO PERMISSION." Installed on the founder's
decision of 2026-10-06 (CLAUDE.md rule 2: the founder's accepted risk). robots.txt (https://burgerandsauce.com/robots.txt, read
2026-10-10): `User-agent: *  Disallow: /wp-admin/  Allow: /wp-admin/admin-ajax.php`; /menu/, /products/ and /wp-content/uploads/ are
allowed (polite_get checks every URL anyway).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "burger-and-sauce"
BASE = "https://burgerandsauce.com"
MENU_URL = BASE + "/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-burger-and-sauce")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it is left without a photo after looking (a rerun must not bring it back)
SKIP_FILES: dict[str, str] = {}   # picture file name -> why it is not used

SITEMAP_URL = BASE + "/products-sitemap.xml"
PRODUCT_LINK = re.compile(r'href="(https://burgerandsauce\.com/products/[^"#?]+)"')
SITEMAP_LOC = re.compile(r"<loc>(https://burgerandsauce\.com/products/[^<#?]+)</loc>")
TITLE = re.compile(r"<title>(.*?)</title>", re.S)
OG_IMAGE = re.compile(r'<meta property="og:image" content="([^"]+)"')


def clean(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def product_page(page: str) -> dict | None:
    """name = the heading the page prints as text right after its picture; picture URL = og:image, only when that picture is an
    <img> of the page. `title` is the page's <title> name (usually the same words; kept for the report)."""
    t, og = TITLE.search(page), OG_IMAGE.search(page)
    if not (t and og):
        return None
    title = clean(t.group(1))
    title = re.sub(r"\s*BURGER (?:&amp;|&) SAUCE\s*$", "", title).strip()
    pic = html.unescape(og.group(1))
    file = pic.rsplit("/", 1)[-1]
    body = re.sub(r"<(script|style)\b.*?</\1>", "", page, flags=re.S)
    m = re.search(r'<img[^>]*src="' + re.escape(pic) + r'"[^>]*>(.{0,1500})', body, re.S)
    if not m:
        return None
    # the first non-empty text after the picture is the product name as the page prints it
    texts = [clean(x) for x in re.findall(r">([^<>]{2,120})<", m.group(1))]
    texts = [x for x in texts if x]
    if not texts:
        return None
    return {"name": texts[0], "title": title, "pic": pic, "file": file}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[dict, str]] = {}
    try:
        menu = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        links: list[str] = []
        for m in PRODUCT_LINK.finditer(menu):
            if m.group(1) not in links:
                links.append(m.group(1))
        print(f"{len(links)} product pages linked from {MENU_URL}")
        sitemap = polite_get(SITEMAP_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        extra = [u for u in SITEMAP_LOC.findall(sitemap) if u not in links and u.rstrip("/") != BASE + "/products"]
        links += extra
        print(f"{len(extra)} more product pages listed in {SITEMAP_URL}")
        pages: list[tuple[str, dict]] = []
        for url in links:
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            info = product_page(page)
            if info is None:
                skipped.append(f"{url}: no name + picture pair read from the page")
                continue
            pages.append((url, info))

        names: dict[str, list[tuple[str, dict]]] = {}
        file_names: dict[str, set[str]] = {}
        for url, info in pages:
            names.setdefault(norm_name(info["name"]), []).append((url, info))
            file_names.setdefault(info["file"], set()).add(norm_name(info["name"]))

        for key, entries in names.items():
            its = by_key.get(key)
            if not its:
                skipped.append(f"{entries[0][1]['name']!r} ({entries[0][0]}) names no published item")
                continue
            if len(its) != 1 or len(entries) != 1:
                skipped.append(f"{entries[0][1]['name']!r}: {len(its)} published items / {len(entries)} pages with that name")
                continue
            url, info = entries[0]
            item = its[0]
            if len(file_names[info["file"]]) != 1:
                skipped.append(f"{item['id']}: picture {info['file']} is shared by pages with different names")
                continue
            if item["id"] in DROP_ITEMS:
                skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                continue
            if info["file"] in SKIP_FILES:
                skipped.append(f"{item['id']}: {info['file']} skipped: {SKIP_FILES[info['file']]}")
                continue
            matched[item["id"]] = (info, url)

        for item_id, (info, url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:36} {info['pic']}" + (f"  (heading {info['name']!r}, page title {info['title']!r})" if info["title"] != info["name"] else ""))
                continue
            raw = polite_get(info["pic"], args.cache, referer=url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {info['pic']}: {e}")
                continue
            rows[item_id] = (fname, url)
            print(f"  {item_id:36} {fname}  <- {info['name']}" + (f" (page title {info['title']!r})" if info["title"] != info["name"] else ""))
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
