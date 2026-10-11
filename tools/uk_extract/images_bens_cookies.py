#!/usr/bin/env python3
"""Item photos for Ben's Cookies from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_bens_cookies.py --cache DIR [--dry-run]

Source: the chain's own product pages, https://www.benscookies.com/shop/<slug>/ . The home page (https://www.benscookies.com/) and the
shop list (https://www.benscookies.com/shop/) link every flavour; each product page has <h1> = the product name and <meta property="og:image"> = that product's own picture
(.../app/uploads/<yyyy>/<mm>/bc-300w-<flavour>.png, the chain's own media folder; the same file is the picture on the product's card in
/shop/ and on the page itself). We read the home page once, then each product page once, then each picture once.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when the product page's <h1> has the SAME
norm_name as the item (the item name comes from the chain's own Nutritional Information index). Two spelling-only differences between
the chain's two pages are listed by hand in ALIASES (item id -> the page's name), each checked against the page: the nutrition index
prints "Caramelized Crunch" where the product page says "Caramelised Crunch", and "Double Chocolate & Nuts" where the page says
"Double Chocolate & Nut"; the chain sells one cookie of each name, so there is no ambiguity. "Dark Chocolate & Nuts" is NOT
aliased: its product page is named "Nuts & Dark Chocolate" (words reordered), so it gets no photo. Flavours with no product page
(Date, Ginger Ginger, Lemon, Peanut Butter, Snickerdoodle, Vegan Classic, Vegan Double ...) get no photo.

Terms: the chain's website has no terms-of-use page (pages: shipping terms, privacy policy, cookie policy). The only statement about
content is the footer on every page, read 2026-10-11: "(c) 2026 Ben's Cookies. All rights reserved." Installed on the founder's
decision of 2026-10-06 (his accepted risk). robots.txt (https://www.benscookies.com/robots.txt, read 2026-10-11): "User-agent: * /
Disallow: /app/uploads/wc-logs/ /app/uploads/woocommerce_transient_files/ /app/uploads/woocommerce_uploads/ /wp/wp-admin/ ..., and a
Yoast block 'Disallow:' (nothing)". /shop/ and /app/uploads/2024/ are allowed; polite_get checks every URL (RFC 9309).

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

CHAIN_ID = "bens-cookies"
HOME_URL = "https://www.benscookies.com/"
SHOP_URL = "https://www.benscookies.com/shop/"
UPLOADS = "https://www.benscookies.com/app/uploads/"   # the chain's own media folder, as named by og:image
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-bens-cookies")
NOT_PRODUCTS = {"boxes-tins", "presets", "vegan", "feed"}     # category pages and the RSS feed, not products
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo
# Spelling-only differences between the nutrition index and the product page (see the docstring): item id -> the page's <h1>.
ALIASES = {
    "caramelized-crunch": "Caramelised Crunch",
    "double-chocolate-and-nuts": "Double Chocolate & Nut",
}


def product_pages(home_html: str) -> list[str]:
    slugs = []
    for s in re.findall(r'href="https://www\.benscookies\.com/shop/([a-z0-9-]+)/"', home_html):
        if s not in NOT_PRODUCTS and s not in slugs:
            slugs.append(s)
    return slugs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_norm: dict[str, list[dict]] = {}
    for it in items:
        by_norm.setdefault(norm_name(it["name"]), []).append(it)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, product page)
    try:
        home = polite_get(HOME_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        shop = polite_get(SHOP_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        slugs = product_pages(home + shop)
        print(f"{len(slugs)} product links on {HOME_URL} and {SHOP_URL}")
        if len(slugs) < 15:
            raise SystemExit(f"the home page changed shape ({len(slugs)} product links): stopping, nothing written")
        pages: dict[str, tuple[str, str, str]] = {}   # norm name -> (name, photo, url)
        for slug in slugs:
            url = f"{HOME_URL}shop/{slug}/"
            try:
                page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:   # 401/403/429 are Blocked (raised by polite_get); anything else is just a missing page
                skipped.append(f"{url}: HTTP {e.code}")
                continue
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
            og = re.search(r'<meta property="og:image" content="([^"]+)"', page)
            if not h1 or not og:
                skipped.append(f"{url}: no <h1> or og:image")
                continue
            name = html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip()
            photo = html.unescape(og.group(1))
            if not photo.startswith(UPLOADS):
                skipped.append(f"{url}: picture {photo} is not in the chain's own media folder")
                continue
            if norm_name(name) in pages:
                skipped.append(f"{url}: another product page already has the name {name!r}: ambiguous")
                pages[norm_name(name)] = ("", "", "")   # poison: duplicate names get no photo
                continue
            pages[norm_name(name)] = (name, photo, url)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            key = norm_name(ALIASES.get(it["id"], it["name"]))
            if len(by_norm.get(norm_name(it["name"]), [])) > 1:
                skipped.append(f"{it['id']}: more than one published item has this name")
                continue
            hit = pages.get(key)
            if not hit or not hit[1]:
                skipped.append(f"{it['id']}: no product page named {it['name']!r}")
                continue
            matched[it["id"]] = (hit[1], hit[2])

        for item_id, (photo, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {photo[len(UPLOADS):]}  <- {page_url}")
                continue
            raw = polite_get(photo, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {photo[len(UPLOADS):]}")
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
