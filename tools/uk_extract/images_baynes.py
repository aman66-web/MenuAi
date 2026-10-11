#!/usr/bin/env python3
"""Item photos for Baynes from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_baynes.py --cache DIR [--dry-run]

Source: the chain's own product pages, https://baynes.co.uk/our-products/<slug>/ , listed in the site's own sitemap
(https://baynes.co.uk/wp-sitemap-posts-bn_product-1.xml). A product page has <h1> = the product's name and its featured picture
(<img class="... wp-post-image" src="https://baynes.co.uk/wp-content/uploads/<yyyy>/<mm>/<file>">, the chain's own media folder).
One request per product page, one per photo.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a product page's <h1> has the same norm_name as the item's name (the items came from the chain's own nutrition guide, which uses the
     shop's product names), and
  2. exactly one product page carries that name, and
  3. that page's featured picture is in the chain's own uploads folder.
Items no product page names (the guide has products the web pages don't list) get no photo.

Terms (https://baynes.co.uk/policy/terms-and-conditions/, read 2026-10-11, section "Intellectual Property"): "All content is the property
of SM Bayne & Co Ltd. and protected by copyright. Use is restricted to personal, non-commercial purposes." An express restriction;
installed on the founder's decision of 2026-10-06 (his accepted risk). robots.txt (https://baynes.co.uk/robots.txt, read 2026-10-11):
"User-agent: * / Disallow: /wp-admin/ / Allow: /wp-admin/admin-ajax.php"; product pages and /wp-content/uploads/ are allowed; polite_get
checks every URL (RFC 9309).

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
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "baynes"
SITEMAP_URL = "https://baynes.co.uk/wp-sitemap-posts-bn_product-1.xml"
UPLOADS = "https://baynes.co.uk/wp-content/uploads/"   # the chain's own media folder
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-baynes")
PLACEHOLDER = re.compile(r"no-image-placeholder", re.I)   # the site's own "no image yet" file (used by 13 product pages): not a photo of the product
DROP_ITEMS: dict[str, str] = {   # item id -> why it was looked at after the first run and left without a photo
    "white-coffee-large": "the page named 'White Coffee Large' shows the file 'Baynes-White-Coffee-Reg-...jpg', the regular cup: a picture of a different size",
}


def parse(page: str) -> dict | None:
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    imgs = [m for m in re.findall(r"<img[^>]*>", page) if "wp-post-image" in m]
    if not h1 or len(imgs) != 1:
        return None
    src = re.search(r'\ssrc="([^"]+)"', imgs[0])
    if not src:
        return None
    return {"name": html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip(), "photo": html.unescape(src.group(1))}


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
        sm = polite_get(SITEMAP_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        urls = re.findall(r"<loc>(https://baynes\.co\.uk/our-products/[a-z0-9-]+/)</loc>", sm)
        print(f"{len(urls)} product pages in the sitemap")
        if len(urls) < 100:
            raise SystemExit(f"the sitemap changed shape ({len(urls)} product pages): stopping, nothing written")
        pages: dict[str, list[tuple[str, str]]] = {}   # norm name -> [(photo, page url)]
        for url in urls:
            try:
                page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:   # 401/403/429 raise Blocked; anything else is just a missing page
                skipped.append(f"{url}: HTTP {e.code}")
                continue
            p = parse(page)
            if not p:
                continue   # a page with no single featured picture (celebration-cake listings, categories): not a product with a photo
            if not p["photo"].startswith(UPLOADS):
                skipped.append(f"{url}: picture {p['photo']} is not in the chain's own uploads folder")
                continue
            if PLACEHOLDER.search(p["photo"]):
                skipped.append(f"{url}: the page's picture is the site's own placeholder ({p['photo'][len(UPLOADS):]})")
                continue
            pages.setdefault(norm_name(p["name"]), []).append((p["photo"], url))
        print(f"{sum(len(v) for v in pages.values())} product pages with a name and a picture")
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            hits = pages.get(norm_name(it["name"]), [])
            if len(hits) != 1:
                skipped.append(f"{it['id']}: {len(hits)} product pages named {it['name']!r}")
                continue
            matched[it["id"]] = hits[0]

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
