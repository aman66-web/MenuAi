#!/usr/bin/env python3
"""Item photos for The Cornish Bakery from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_cornish_bakery.py [--cache DIR] [--dry-run]

Source: https://thecornishbakery.com/ is the chain's own Shopify storefront. It has NO café menu with photos: the only per-item
photos are on the "Pasties by Post" shop (/products/<handle>), whose public product feed is /products.json (the storefront's own
agents.md lists "Product JSON" as read-only browsing). The "Our Food" page (/pages/our-food) carries only lifestyle photos with no
item names, so it is not used. Each product has a "title" and "images" (cdn.shopify.com/s/files/1/0598/2512/7573/files/...).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when ALL of these hold:
  1. exactly one shop product is titled with the item's name (images_common.norm_name equality) and exactly one published item
     has that name;
  2. that product's own page (/products/<handle>) shows the same title in its <h1> and names the feed's first image as its
     og:image (same file): the photo used is the product's first (featured) one;
  3. the photo file is not used by any other matched item.
The shop sells boxes ("10 x Traditional Cornish Pasties") and uses different names from the allergen matrix ("Traditional Cornish"
vs the published "Traditional Pasty", "Cornish Cheddar and Onion" vs "Cornish Cheddar & Onion Pasty", "Garden Vegetable Pasty
(vegan)" vs "Garden Vegetable Pasty"): those get no photo, we never match by similarity. Today's exact matches are the two sausage
rolls ("Sausage Roll", "Farmhouse Sausage Roll"). The shop's Farmhouse Sausage Roll page prints "475 kcals each", the same
figure as the published item.

Terms and robots (read 2026-10-08):
  * https://thecornishbakery.com/pages/terms-and-conditions (Website Terms and Conditions of Use), clause 6.1: "The intellectual
    property rights in the Site and in any text, images, video, audio or other multimedia content ... (Content) are owned by us
    and our licensors."; 6.3: "Nothing in these Terms grants you any legal rights in the Site or the Content other than as
    necessary for you to access it."; 3.1: "The Site is for your personal and non-commercial use only."; 6.4 prohibits using
    trade marks without prior written permission. No express "do not copy images" sentence, but no licence to reuse either.
    The "Terms and Conditions of Supply" (/policies/terms-of-service) say nothing about images or copyright.
    Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2: accepted risk).
  * robots.txt (thecornishbakery.com): "User-agent: *" allows /, disallows only cart/checkout/orders/account, /services, /sf_*,
    /cart.js, /recommendations/products, sort/filter crawl traps and a few query parameters. /products.json, /products/<handle>
    and /cdn/shop/files are allowed. cdn.shopify.com/robots.txt disallows only two script patterns.

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

CHAIN_ID = "cornish-bakery"
BASE = "https://thecornishbakery.com"
FEED = f"{BASE}/products.json?limit=250"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
JSON_ACCEPT = "application/json,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-cornish-bakery")
H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
OG_IMAGE = re.compile(r'<meta property="og:image" content="([^"]+)"')


def file_stem(url: str) -> str:
    """The upload's file name without query string or Shopify size suffix, to compare the feed's photo with the page's."""
    name = html.unescape(url).split("?")[0].rsplit("/", 1)[-1]
    return re.sub(r"_(\d+x\d*|\d*x\d+)(?=\.[A-Za-z]+$)", "", name)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="list the matches; download and store no photo, write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)

    try:
        feed = json.loads(polite_get(FEED, args.cache, accept=JSON_ACCEPT).decode("utf-8"))
        products = feed["products"]
        by_title: dict[str, list[dict]] = {}
        for p in products:
            by_title.setdefault(norm_name(p["title"]), []).append(p)
        print(f"feed: {len(products)} products; published items: {len(items)}")

        rows: dict[str, tuple[str, str]] = {}
        matches = []
        for key, its in sorted(by_name.items()):
            ps = by_title.get(key)
            if not ps:
                continue
            if len(its) != 1 or len(ps) != 1:
                print(f"  skip (name not unique): {its[0]['name']!r} items={len(its)} products={len(ps)}")
                continue
            it, p = its[0], ps[0]
            if not p.get("images"):
                print(f"  skip (product has no photo): {p['title']!r}")
                continue
            page_url = f"{BASE}/products/{p['handle']}"
            page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            h1 = H1.search(page)
            og = OG_IMAGE.search(page)
            img_url = p["images"][0]["src"]
            if not h1 or norm_name(html.unescape(re.sub(r"<[^>]+>", " ", h1.group(1)))) != key:
                print(f"  skip (page title differs): {p['title']!r}")
                continue
            if not og or file_stem(og.group(1)) != file_stem(img_url):
                print(f"  skip (page's og:image is not the feed's first photo): {p['title']!r}")
                continue
            matches.append((it, p, page_url, img_url))

        files_used: dict[str, list[str]] = {}
        for it, p, page_url, img_url in matches:
            files_used.setdefault(file_stem(img_url), []).append(it["id"])
        for it, p, page_url, img_url in matches:
            if len(files_used[file_stem(img_url)]) > 1:
                print(f"  skip (photo shared by several items): {it['name']!r}")
                continue
            print(f"  match: {it['id']!r} ({it['name']}) <- {page_url}  photo {img_url}")
            if args.dry_run:
                continue
            raw = polite_get(img_url, args.cache)
            try:
                rows[it["id"]] = (store_image(CHAIN_ID, raw), page_url)
            except ValueError as e:
                print(f"  skip (not a usable photo): {it['name']!r}: {e}")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopped; nothing written.", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"dry run: {len(matches)} matches, nothing downloaded or written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"coverage: {len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {f} used by {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
