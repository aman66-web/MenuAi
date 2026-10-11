#!/usr/bin/env python3
"""Item photos for Greenhalgh's from its own online shop (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_greenhalghs.py --cache DIR [--dry-run]

Source: the shop's own product pages, the same pages tools/uk_extract/greenhalghs.py reads the calories from (EXPECTED_PAGES there, each
listed in https://www.greenhalghs.com/product-sitemap.xml). A product page has <h1> = the product's name, a JSON-LD / og:image picture
(https://www.greenhalghs.com/wp-content/uploads/<yyyy>/<mm>/<file>.jpg, the shop's own media folder) and the same file as the
page's main picture (img.wp-post-image, its data-src). One page request per product, one request per photo.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the page's <h1> has the same norm_name as the item's name (the item names were taken from these pages), and
  2. exactly one product page carries that name, and
  3. the page's og:image and its main picture (wp-post-image data-src; the shop's image plugin may serve it as "<file>.jpg.webp", a WebP copy of
     the same file) are the same file, in the shop's own uploads folder. We fetch the original og:image file, never the plugin's copy.
Items whose names no page carries, or whose page shows no picture, get no photo. Pages for the "individual" and the "2 pack" version of
one product are different products with their own pictures: each item takes only its own page's picture.

Terms (https://www.greenhalghs.com/terms-conditions/, read 2026-10-11): "This website contains material which is owned by or licensed to us.
This material includes, but is not limited to; the design, layout, look, appearance and graphics. Reproduction is prohibited other than in
accordance with the copyright notice, which forms part of these Terms and Conditions." An express restriction on reproduction; installed on
the founder's decision of 2026-10-06 (his accepted risk). robots.txt
(https://www.greenhalghs.com/robots.txt, read 2026-10-11): "User-agent: * / Disallow: /wp-admin/ / Allow: /wp-admin/admin-ajax.php /
Disallow: /*?*add-to-cart= ... (query-string paths only)"; product pages and /wp-content/uploads/ are allowed; polite_get checks every URL
(RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import greenhalghs  # noqa: E402  (EXPECTED_PAGES: the product pages the published items were built from)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "greenhalghs"
SITE = "https://www.greenhalghs.com/"
UPLOADS = "https://www.greenhalghs.com/wp-content/uploads/"   # the shop's own media folder
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-greenhalghs")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo


def parse(page: str) -> dict | None:
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    og = re.search(r'<meta property="og:image" content="([^"]+)"', page)
    main = re.search(r'<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*\sdata-src="([^"]+)"', page)
    if not (h1 and og and main):
        return None
    return {
        "name": html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip(),
        "og": html.unescape(og.group(1)),
        "main": html.unescape(main.group(1)),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    try:
        pages: dict[str, list[tuple[str, str, str]]] = {}   # norm name -> [(name, photo, page url)]
        for path in greenhalghs.EXPECTED_PAGES:
            url = SITE + path.strip("/") + "/"
            try:
                page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:   # 401/403/429 raise Blocked; anything else is just a missing page
                skipped.append(f"{url}: HTTP {e.code}")
                continue
            p = parse(page)
            if not p:
                skipped.append(f"{url}: page has no <h1>, og:image or main picture (the page changed shape)")
                continue
            # the shop's image plugin serves the main picture as "<file>.jpg.webp", a WebP copy of the very same file: same name once the suffix is dropped
            if p["og"] != re.sub(r"\.webp$", "", p["main"]) or not p["og"].startswith(UPLOADS):
                skipped.append(f"{url}: og:image {p['og']} and main picture {p['main']} differ or are not in the shop's uploads folder")
                continue
            pages.setdefault(norm_name(p["name"]), []).append((p["name"], p["og"], url))
        print(f"{sum(len(v) for v in pages.values())} product pages with a name and a picture")
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            hits = pages.get(norm_name(it["name"]), [])
            if len(hits) != 1:
                skipped.append(f"{it['id']}: {len(hits)} product pages named {it['name']!r}")
                continue
            matched[it["id"]] = (hits[0][1], hits[0][2])

        for item_id, (photo, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:46} {photo[len(UPLOADS):]}  <- {page_url}")
                continue
            raw = polite_get(photo, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:46} {fname}  <- {photo[len(UPLOADS):]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
