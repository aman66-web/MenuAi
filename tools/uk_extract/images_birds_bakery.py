#!/usr/bin/env python3
"""Item photos for Birds Bakery from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_birds_bakery.py [--cache DIR]             # match and report only (default)
    python3 tools/uk_extract/images_birds_bakery.py [--cache DIR] --install   # download, store, write images.csv

HELD (2026-10-06): the default run only reads the chain's pages and reports which items have a photo; it downloads no
photo and writes nothing. Birds' terms (below) forbid commercial use of the site's content without a licence, and
CLAUDE.md rule 2 (as committed) says such a chain's photos are installed only when the founder says so for that chain.
Run with --install once the founder has confirmed Birds Bakery; then look at every stored file by eye (drop anything that
is not a photo of that item, or that prints nutrition numbers or claims) and run check_chain.py.

Source: the chain's own "Our food" pages, listed in https://birdsbakery.com/sitemap_metaobject_pages_1.xml as
https://birdsbakery.com/pages/our-food/<slug>. Each such page is about ONE product: its <title> is
"<Name> - Nutrition & Allergy Data | Birds Bakery", its only <h1> is "Our <name>", and its hero block
<div class="c-chocolate-hero__image"> holds ONE photo on the chain's own CDN (//birdsbakery.com/cdn/shop/files/...). The
per-item pages under /pages/nutrition-and-allergen-data/ (where the nutrition came from) show no photo. Also the shop
feed https://birdsbakery.com/products.json (the online-order products), whose records carry a title and the photos.
We fetch the original upload (the hero URL without the CDN's &width= resize) and store_image only downsizes it.

Match rule: a photo is attached to a published item only when the page's heading (less the template's leading "Our ")
equals the item's name in the CURRENT items.csv (norm_name), the page's slug-made <title> agrees with that heading (the
title drops "&" and brackets), the page has exactly one hero photo, and exactly one page names the item; or when a products.json record's title equals the item's name exactly. No
slug, file-name or "closest" matching. Items matched by no page, or by more than one, get no photo.

Terms (https://birdsbakery.com/pages/terms-of-service, read 2026-10-06): "We (Birds) are the owner of all intellectual
property rights in and on our site, and in the material published on it. ... You must not use any illustrations,
photographs, video or audio files or any graphics separately from any accompanying text content. You must not use any
part of the content on our site for commercial purposes without obtaining a licence to do so from us or our licensors."
robots.txt (read 2026-10-06) disallows /policies/, /search, cart/checkout/account paths and /cdn/wpm/*.js, not
/pages/ or /cdn/shop/files/; polite_get checks it on every URL.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "birds-bakery"
BASE = "https://birdsbakery.com"
SITEMAP_URL = f"{BASE}/sitemap_metaobject_pages_1.xml"
PRODUCTS_URL = f"{BASE}/products.json?limit=250"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-birds-bakery")

OUR_FOOD = re.compile(r"<loc>(https://birdsbakery\.com/pages/our-food/[a-z0-9-]+)</loc>")
TITLE = re.compile(r"<title>\s*(?P<name>.*?)\s+-\s+Nutrition &amp; Allergy Data\s*\|\s*Birds Bakery\s*</title>", re.S)
H1 = re.compile(r'<h1 class="c-chocolate-hero__heading">\s*Our\s+(?P<name>[^<]+?)\s*</h1>')
HERO = re.compile(r'<div class="c-chocolate-hero__image">\s*<img src="(?P<src>[^"]+)"')
CDN_FILE = re.compile(r"^//birdsbakery\.com/cdn/shop/files/(?P<file>[A-Za-z0-9._-]+\.(?:jpe?g|png|webp))\?v=(?P<v>\d+)(?:&width=\d+)?$", re.I)
SHOP_CDN = re.compile(r"^https://cdn\.shopify\.com/s/files/1/0811/8049/2079/files/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)\?v=\d+$", re.I)


def page_text(url: str, cache: Path) -> str:
    return polite_get(url, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--install", action="store_true",
                    help="download and store the matched photos and write images.csv (only once the founder has confirmed)")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    found: dict[str, list[tuple[str, str]]] = {}   # norm name -> [(page url, photo url)]
    notes: list[str] = []
    try:
        sitemap = page_text(SITEMAP_URL, args.cache)
        pages = sorted(set(OUR_FOOD.findall(sitemap)))
        print(f"{len(pages)} 'Our food' pages in {SITEMAP_URL}")
        for url in pages:
            page = page_text(url, args.cache)
            t, h, heroes = TITLE.search(page), H1.findall(page), HERO.findall(page)
            if not t or len(h) != 1 or len(heroes) != 1:
                notes.append(f"{url}: title {bool(t)}, {len(h)} headings, {len(heroes)} hero photos: not used")
                continue
            title_name = html.unescape(t.group("name"))
            head_name = html.unescape(h[0])
            # The heading is the product's visible name. The <title> is made from the page slug, which drops "&" and
            # brackets ("Ham Cheese Filled Roll White"), so it only has to agree with the heading less its "and"s.
            if norm_name(title_name) not in (norm_name(head_name), norm_name(head_name).replace(" and ", " ")):
                notes.append(f"{url}: title {title_name!r} and heading 'Our {head_name}' disagree: not used")
                continue
            m = CDN_FILE.match(html.unescape(heroes[0]))
            if not m:
                notes.append(f"{url}: hero photo {heroes[0]} is not on the chain's CDN: not used")
                continue
            photo = f"{BASE}/cdn/shop/files/{m.group('file')}?v={m.group('v')}"
            found.setdefault(norm_name(head_name), []).append((url, photo))

        feed = json.loads(polite_get(PRODUCTS_URL, args.cache, accept="application/json").decode("utf-8"))
        for p in feed.get("products", []):
            imgs = [i["src"] for i in p.get("images", []) if SHOP_CDN.match(i.get("src", ""))]
            if len(imgs) >= 1:
                # The record's first image is the product's main photo on its own page.
                found.setdefault(norm_name(p["title"]), []).append((f"{BASE}/products/{p['handle']}", imgs[0]))

        matched: dict[str, tuple[str, str]] = {}  # item id -> (page url, photo url)
        skipped: list[str] = []
        for key, its in sorted(by_key.items()):
            hits = found.get(key, [])
            if not hits:
                continue
            if len(its) != 1:
                skipped.append(f"{key}: {len(its)} items share this name")
                continue
            if len({photo for _, photo in hits}) != 1:
                skipped.append(f"{its[0]['id']}: {len(hits)} different pages/photos name {its[0]['name']!r}")
                continue
            matched[its[0]["id"]] = hits[0]

        print(f"{len(matched)} of {len(items)} published items are named exactly by a page with one photo:")
        for item_id, (page_url, photo) in sorted(matched.items()):
            print(f"  {item_id:58} {photo}  ({page_url})")
        for s in notes + skipped:
            print(f"  note: {s}")
        if not args.install:
            print("Match-only run (photos held until the founder confirms Birds Bakery): nothing downloaded or written.")
            return 0

        rows: dict[str, tuple[str, str]] = {}
        for item_id, (page_url, photo) in sorted(matched.items()):
            raw = polite_get(photo, args.cache, referer=page_url)
            try:
                rows[item_id] = (store_image(CHAIN_ID, raw), page_url)
            except ValueError as e:
                print(f"  no photo: {item_id}: {photo}: {e}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
