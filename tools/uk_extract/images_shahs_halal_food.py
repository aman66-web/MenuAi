#!/usr/bin/env python3
"""Item photos for Shah's Halal Food UK (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_shahs_halal_food.py --cache <dir> --dry-run   # fetch the menu + product pages only, list matches
    python3 tools/uk_extract/images_shahs_halal_food.py --cache <dir>             # download, store, write images.csv

Source: the chain's own WooCommerce site. https://shahshalalfood.co.uk/menu/ lists each product as <h3 class="th-menu_title"><a href="/our-menu/<slug>/">Name</a>;
the product page (the same page data/source/shahs-halal-food was built from) has <h1 class="product_title">Name</h1> and its photo as the
"wp-post-image" <img> (data-src = the full-size upload, e.g. .../2025/03/chicken-gyro.png, 2048 px wide). The menu page's own thumbnails are 180 px
square crops and are NOT used: we fetch the uncropped upload from the product page. store_image downsizes it to 640 px and converts to WebP, nothing
else is changed.

Matching (exact only): a published item gets the photo of the product page whose h1 (and menu card title) equals the item's name (norm_name).

Politeness / robots: https://shahshalalfood.co.uk/robots.txt (read 2026-10-08): "User-agent: * Disallow: /wp-content/uploads/wc-logs/,
/wp-content/uploads/woocommerce_transient_files/, /wp-content/uploads/woocommerce_uploads/, /*?add-to-cart=, /*?*add-to-cart=, /wp-admin/ (Allow
/wp-admin/admin-ajax.php)". Product pages and /wp-content/uploads/2025/03/ are allowed; no query strings are used.
Terms: the site has no terms-of-use / terms-and-conditions page (its pages: about-us, contact-us, faq, franchise, our-locations, menu, allergen information,
privacy-policy; the sitemap lists no terms page and /terms-and-conditions/ answers 404). Its footer says only "Copyright (c) 2026 Shah's Halal UK" (a generic
all-rights-reserved line, not an express prohibition on copying images). Installed on the founder's decision of 2026-10-06 (accepted risk, CLAUDE.md rule 2).
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "shahs-halal-food"
HOST = "https://shahshalalfood.co.uk"
MENU_URL = HOST + "/menu/"
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_CARD = re.compile(r'<h3 class="th-menu_title"><a href="(https://shahshalalfood\.co\.uk/our-menu/[^"]+/)">([^<]*)</a>')
_H1 = re.compile(r'<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>(.*?)</h1>', re.S)
_PHOTO = re.compile(r'<img\b[^>]*\bclass="[^"]*wp-post-image[^"]*"[^>]*>')


def clean(s: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", s)).split())


def product_photo(page: str) -> str | None:
    """The full-size photo URL of a product page: the wp-post-image img inside the gallery (data-src before lazy loading, else src)."""
    for m in _PHOTO.finditer(page):
        tag = m.group(0)
        if "w-100" not in tag:        # the gallery photo; menu/related-product thumbnails use other classes
            continue
        src = re.search(r'\bdata-src="([^"]+)"', tag) or re.search(r'\bsrc="(?!data:)([^"]+)"', tag)
        if src:
            return htmllib.unescape(src.group(1))
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="cache dir (each page and photo is fetched at most once)")
    ap.add_argument("--dry-run", action="store_true", help="list the matches; fetch only the menu and product pages (never a photo)")
    ap.add_argument("--retrieved-on", default=None)
    args = ap.parse_args()
    html_accept = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"

    items = ic.load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    menu = ic.polite_get(MENU_URL, args.cache, accept=html_accept).decode("utf-8", "replace")
    cards = [(u, clean(t)) for u, t in _CARD.findall(menu)]
    if not cards:
        raise SystemExit("menu page: no product cards found: the layout changed")

    wanted: dict[str, tuple[str, str]] = {}          # item_id -> (photo url, product page url)
    notes: list[str] = []
    for url, title in cards:
        hits = by_name.get(ic.norm_name(title), [])
        if len(hits) != 1:
            notes.append(f"{title}: {'no published item with exactly this name' if not hits else 'several published items share this name'} -> none")
            continue
        it = hits[0]
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        page = ic.polite_get(url, args.cache, delay=1.1, accept=html_accept).decode("utf-8", "replace")
        h1 = _H1.search(page)
        if not h1 or ic.norm_name(clean(h1.group(1))) != ic.norm_name(it["name"]):
            notes.append(f"{title}: the product page's own heading differs -> none")
            continue
        photo = product_photo(page)
        if not photo:
            notes.append(f"{title}: the product page shows no photo -> none")
            continue
        if it["id"] in wanted:
            notes.append(f"{it['name']}: listed twice -> kept the first")
            continue
        wanted[it["id"]] = (photo, url)

    by_id = {i["id"]: i for i in items}
    order = [i["id"] for i in items]
    print(f"{len(items)} published items; {len(cards)} products on the menu page; {len(wanted)} items matched to a photo")
    for item_id in sorted(wanted, key=order.index):
        print(f"  {by_id[item_id]['category']:<12} {by_id[item_id]['name']:<24} {wanted[item_id][0].rsplit('/', 1)[-1]}")
    print("Menu entries without a published item (or without a usable photo):")
    for n in notes:
        print("  -", n)
    print(f"  ({len(items) - len(wanted)} published items without a photo in total)")
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, (url, page_url) in wanted.items():
            if url not in stored:
                raw = ic.polite_get(url, args.cache, delay=1.1, referer=page_url)
                try:
                    stored[url] = ic.store_image(CHAIN_ID, raw)
                except ValueError as e:
                    print(f"  skipped {by_id[item_id]['name']}: {e}")
                    stored[url] = ""
            if stored[url]:
                rows[item_id] = (stored[url], page_url)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing was written to images.csv. We never work round a block.")
        raise SystemExit(2)
    ic.write_images_csv(CHAIN_ID, rows, args.retrieved_on)
    print(f"{len(rows)} of {len(items)} published items now have a photo; {len(set(f for f, _ in rows.values()))} files")
    for fname, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")


if __name__ == "__main__":
    main()
