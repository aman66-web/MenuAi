#!/usr/bin/env python3
"""Item photos for Dunkin' UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_dunkin.py [--cache DIR] [--dry-run]

Source: the seven allergen pages the nutrition data came from (https://dunkin.co.uk/allergens-donuts, -munchkins, -cookies, -bakery,
-lto-donuts, -hot-drinks, -cold-drinks) link every product to its own product page (https://dunkin.co.uk/<slug>). A product page shows
ONE photo of the product: <img alt="main product photo" title="<product name>" src="https://dunkin.co.uk/media/catalog/product/cache/<hash>/<file>"
width="700" height="700">, the photo the page itself displays (700 x 700; store_image makes the only change: downsize to <= 640 px, WebP).

Match rule (nothing is matched by slug, file name or similarity): a record on an allergen page (its link text is the product name) gives
a photo to a published item only when
  - the item is that record's own item: same category, same normalised name (drinks: "<name> (Small|Medium|Large)"; the products listed
    on both drink pages carry ", hot" / ", cold" exactly as dunkin.py names them), and
  - the product page's main photo is captioned with the product's name (norm_name equality), OR the allergen page's own link for that
    product holds the same image file (the link then carries the name and the photo together; this is the only case for "Original
    Glazed (OG)", whose product page is titled "The OG").
Photos whose own sticker makes a claim our tables don't (EXCLUDE) are left out. Sizes of a drink share the product's photo (the same product record carries the photo and the size). Held-back items are not published, so
they get none. A record with no published item is not fetched at all.

Terms: dunkin.co.uk/robots.txt Disallows /terms-conditions, so the terms page was NOT fetched (we never go round robots.txt); the pages'
footer reads "(c)2026 DD IP Holder LLC". Installed on the founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (read 2026-10-08): "Crawl-delay: 30", "Disallow: /*?", /catalog/, /index.php/ ...; /media/catalog/product/... and the product
pages are allowed. We wait 31 s between requests to dunkin.co.uk (a full run with an empty cache is about 80 requests: the 7 allergen
pages, the product pages and the photos, so it takes more than an hour; reruns use the cache).

A 401/403/429, a robots refusal or a URL with a query string stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dunkin as dk  # noqa: E402  (page list, name rules, SLUG_FIX)
import dunkin_pages as dp  # noqa: E402
from images_common import (  # noqa: E402
    Blocked, _robots_allow, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "dunkin"
HOST = dp.HOST
DELAY = float(dp.CRAWL_DELAY)  # robots.txt: Crawl-delay 30
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-dunkin")
SIZES = ("Small", "Medium", "Large")
# Left out after looking at the photo (a rerun must not bring them back). The chain's photo carries a sticker that is a claim of its own,
# which our tables (copied from the chain's allergen pages) do not make or could contradict.
EXCLUDE = {
    "Cookie Kreme Blast": "photo carries a 'NEW RECIPE' sticker",
    "Speculoos Sensation": "photo carries a 'NEW RECIPE' sticker",
    "Cinnamon Roll": "photo carries a 'Vegan Friendly' leaf, but the chain's allergen page does not call it Vegan Friendly",
    "Strawberry Jelly": "photo carries a 'Vegan Friendly' leaf, but the chain's allergen page does not call it Vegan Friendly",
}

MAIN_PHOTO = re.compile(r'<img\s+alt="main product photo"\s+title="(?P<title>[^"]*)"[^>]*?\ssrc="(?P<src>[^"]+)"', re.S)
PHOTO_URL = re.compile(r"^https://dunkin\.co\.uk/media/catalog/product/(?:cache/[0-9a-f]{32}/)?(?P<file>[A-Za-z0-9_./%-]+\.(?:png|jpe?g|webp))$")


def anchor_images(text: str) -> dict[str, list[str]]:
    """product URL -> the image file(s) inside that product's own link on an allergen page (same region as dp.read_allergen_page)."""
    region = text[text.find("COLD DRINKS"):text.find('<div class="newsletter')]
    out: dict[str, list[str]] = {}
    for m in re.finditer(r'<a\b[^>]*href="(https://dunkin\.co\.uk/[^"#]+)"[^>]*>(.*?)</a>', region, flags=re.S):
        if dp._clean(re.sub(r"<[^>]+>", "", m.group(2))):
            out[m.group(1)] = [PHOTO_URL.match(s).group("file") for s in re.findall(r'<img[^>]*\ssrc="([^"]+)"', m.group(2)) if PHOTO_URL.match(s)]
    return out


def display_name(page: str, rec_name: str, is_drink: bool) -> tuple[str, str]:
    """(product name as printed without 'Vegan Friendly', the name dunkin.py gives its items)."""
    base, _ = dk.clean_name(rec_name)
    if is_drink and rec_name in dk.BOTH_PAGES:
        return base, f"{base}, {'hot' if page == 'allergens-hot-drinks' else 'cold'}"
    return base, base


def fetch_html(url: str, cache: Path) -> str:
    if "?" in url:
        raise Blocked(f"robots.txt disallows URLs with a query string: {url}")
    if not _robots_allow(url):   # also for cached pages: the rule is about the URL, not about whether we hold a copy
        raise Blocked(f"robots.txt disallows {url}")
    return polite_get(url, cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and list only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[tuple[str, str], list[dict]] = {}
    for it in items:
        by_key.setdefault((it["category"], norm_name(it["name"])), []).append(it)

    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    claimed: set[str] = set()
    try:
        for page, (category, _limited, _expected, is_drink) in dk.PAGES.items():
            text = fetch_html(f"{HOST}/{page}", args.cache)
            records = dp.read_allergen_page(text, page)       # stops the run if the layout changed
            in_link = anchor_images(text)
            for rec in records:
                base, shown = display_name(page, rec["name"], is_drink)
                if base in EXCLUDE:
                    skipped.append(f"{rec['name']}: left out by choice, {EXCLUDE[base]}")
                    continue
                keys = [norm_name(f"{shown} ({s})") for s in SIZES] if is_drink else [norm_name(shown)]
                mine = [it for k in keys for it in by_key.get((category, k), [])]
                if not mine:
                    skipped.append(f"{rec['name']} ({category}): no published item (held back or not listed): not fetched")
                    continue
                dup = [it["id"] for it in mine if it["id"] in claimed]
                if dup:
                    skipped.append(f"{rec['name']} ({category}): items {dup} already matched by another record: no photo")
                    continue
                slug = dk.product_slug(rec["url"])
                product_url = f"{HOST}/{slug}"
                try:
                    product = fetch_html(product_url, args.cache)
                except urllib.error.HTTPError as e:
                    skipped.append(f"{rec['name']}: product page {product_url} answered {e.code}: no photo")
                    continue
                mains = MAIN_PHOTO.findall(product)
                if len(mains) != 1:
                    skipped.append(f"{rec['name']}: {len(mains)} main product photos on {product_url}: no photo")
                    continue
                title, src = mains[0]
                pm = PHOTO_URL.match(html.unescape(src))
                if not pm or "placeholder" in src.lower():
                    skipped.append(f"{rec['name']}: main photo {src!r} is not a catalogue photo: no photo")
                    continue
                if slug != rec["url"].rsplit("/", 1)[1] and norm_name(html.unescape(dp.page_title(product))) != norm_name(rec["name"]):
                    skipped.append(f"{rec['name']}: replacement page {product_url} is titled {dp.page_title(product)!r}: no photo")
                    continue
                name_agrees = norm_name(html.unescape(title)) == norm_name(base)
                link_agrees = pm.group("file") in in_link.get(rec["url"], [])
                if not (name_agrees or link_agrees):
                    skipped.append(f"{rec['name']}: photo captioned {html.unescape(title)!r} and not the allergen page's own link image: no photo")
                    continue
                photo_url = html.unescape(src)
                why = "caption" if name_agrees else "link"
                if args.dry_run:
                    print(f"  {shown:44} [{why}] {len(mine)} item(s)  {photo_url.split('/media/catalog/product/')[1]}")
                    claimed.update(it["id"] for it in mine)
                    continue
                raw = polite_get(photo_url, args.cache, delay=DELAY, referer=product_url)
                try:
                    fname = store_image(CHAIN_ID, raw)
                except ValueError as e:
                    skipped.append(f"{rec['name']}: {photo_url}: {e}")
                    continue
                for it in mine:
                    rows[it["id"]] = (fname, product_url)
                    claimed.add(it["id"])
                print(f"  {shown:44} [{why}] {fname}  {len(mine)} item(s) <- {photo_url.split('/media/catalog/product/')[1]}", flush=True)
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"dry run: {len(claimed)} of {len(items)} published items would get a photo")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
