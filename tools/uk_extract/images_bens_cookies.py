#!/usr/bin/env python3
"""Item photos for Ben's Cookies from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_bens_cookies.py --cache DIR [--dry-run]

Source: the chain's own product pages, https://www.benscookies.com/shop/<slug>/ . They are found from three of the chain's own pages: the
home page (https://www.benscookies.com/), the shop list (https://www.benscookies.com/shop/) and the site's own product sitemap
(https://www.benscookies.com/product-sitemap.xml, named by /sitemap_index.xml and by robots.txt). The sitemap was added on 2026-11-17: it
lists product pages the home page and the shop list no longer link (Vegan Classic, Ginger Ginger, Peanut Butter, Lemon, Date & Milk
Chocolate ...). Each product page has <h1> = the product name, <meta property="og:title"> = "<product name> | Ben's Cookies" and
<meta property="og:image"> = that product's own picture (.../app/uploads/<yyyy>/<mm>/bc-300w-<flavour>.png, the chain's own media folder;
the same file is the picture on the product's card in /shop/ and on the page itself). The chain's "Our Flavours" page
(https://www.benscookies.com/flavours/) shows the same pictures, each flavour card with an <h3> heading, a blurb and a "More Info" link to
its product page. We read each page once, then each picture once.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when the chain prints the item's name (same norm_name;
the item name comes from the chain's own Nutritional Information index) for a product page in one of two ways, and the photo is that
product page's og:image:
  1. the product page's <h1> and its og:title both carry that name, or
  2. a Flavours card heading carries that name AND links to a product page whose og:title carries the same name.
A product page whose <h1> and og:title name different things is not used under (1) (read 2026-11-17: /shop/rum-raisin/ and
/shop/snickerdoodle/ both print the <h1> "Date & Milk Chocolate"; /shop/orange-dark-chocolate/ prints the <h1> "Orange & Milk Chocolate"
over a dark-chocolate-and-orange picture; /shop/dark-chocolate-nuts/ prints "Nuts & Dark Chocolate" in its <h1> and "Dark Chocolate & Nut"
in its title). A name printed for two different pictures gets no photo. Spelling-only differences between the nutrition index and the
chain's pages are listed by hand in ALIASES (item id -> the page's name), each checked against the page: the index prints "Caramelized
Crunch" where the product page says "Caramelised Crunch", "Double Chocolate & Nuts" where the page says "Double Chocolate & Nut", and
"Dark Chocolate & Nuts" where the Flavours card and the product page's title say "Dark Chocolate & Nut" (singular/plural only, as for the
double-chocolate one; the chain sells one cookie of each name). Words are never reordered. Vegan Double has no product page and gets no
photo; Snickerdoodle's page has no picture and a wrong <h1>, so Snickerdoodle gets no photo.

Terms: the chain's website has no terms-of-use page (its page sitemap, read 2026-11-17, lists shipping terms, privacy policy and
cookie policy pages, nothing on content use). The only statement about content is the footer on every page, read 2026-11-17:
"(c) 2026 Ben's Cookies. All rights reserved." Installed on the founder's decision of 2026-10-06 (his accepted risk). robots.txt
(https://www.benscookies.com/robots.txt, read 2026-11-17): "User-agent: * / Disallow: /app/uploads/wc-logs/
/app/uploads/woocommerce_transient_files/ /app/uploads/woocommerce_uploads/ /*?add-to-cart= /*?*add-to-cart= /wp/wp-admin/ (Allow:
/wp/wp-admin/admin-ajax.php)", and a Yoast block "User-agent: * / Disallow:" (nothing) naming the sitemap. /shop/, /flavours/, the
sitemaps and /app/uploads/2024/ ... are allowed; polite_get checks every URL (RFC 9309).

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
SITEMAP_URL = "https://www.benscookies.com/product-sitemap.xml"
FLAVOURS_URL = "https://www.benscookies.com/flavours/"
UPLOADS = "https://www.benscookies.com/app/uploads/"   # the chain's own media folder, as named by og:image
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-bens-cookies")
# category pages, gift boxes and tins, and the RSS feed: not a single cookie
NOT_PRODUCTS = {"boxes-tins", "presets", "vegan", "feed", "uncategorized", "bens-faves", "small-box", "large-box",
                "limited-edition-large-gift-tin", "limited-edition-small-gift-tin", "large-gift-tin", "small-tin",
                "christmas-large-tin", "christmas-small-tin", "page"}
# item id -> why it was looked at after a run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    "date-and-milk-chocolate": "the picture (bc-300w-milk-chocolate-and-dates_xmas.png) carries a red 'Festive Special' bauble sticker "
                               "with lettering: promotional, not a plain photo of the cookie (looked at 2026-11-17)",
}
# Spelling-only differences between the nutrition index and the chain's page (see the docstring): item id -> the page's name.
ALIASES = {
    "caramelized-crunch": "Caramelised Crunch",
    "double-chocolate-and-nuts": "Double Chocolate & Nut",
    "dark-chocolate-and-nuts": "Dark Chocolate & Nut",
}

SHOP_LINK = re.compile(r'(?:href="|<loc>)https://www\.benscookies\.com/shop/([a-z0-9-]+)/')


def product_slugs(*pages: str) -> list[str]:
    slugs: list[str] = []
    for page in pages:
        for s in SHOP_LINK.findall(page):
            if s not in NOT_PRODUCTS and s not in slugs:
                slugs.append(s)
    return slugs


def flavour_cards(page: str) -> list[tuple[str, str]]:
    """(heading, product slug) for each card on the Flavours page: an <h3> heading, its blurb, then its "More Info" link to the product
    page, with no other heading in between."""
    out = []
    for m in re.finditer(r'<h3[^>]*>(.*?)</h3>(?:(?!<h[1-6][ >]).){0,3000}?'
                         r'<a[^>]+href="https://www\.benscookies\.com/shop/([a-z0-9-]+)/"[^>]*>\s*(?:<img[^>]*>\s*)?<span>More Info</span>',
                         page, re.S):
        name = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()
        if name and (name, m.group(2)) not in out:
            out.append((name, m.group(2)))
    return out


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
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page that shows it under that name)
    try:
        home = polite_get(HOME_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        shop = polite_get(SHOP_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        sitemap = polite_get(SITEMAP_URL, args.cache, accept="application/xml,text/xml,*/*").decode("utf-8", "replace")
        flavours = polite_get(FLAVOURS_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        slugs = product_slugs(home, shop, sitemap)
        print(f"{len(slugs)} product pages named by {HOME_URL}, {SHOP_URL} and {SITEMAP_URL}")
        if len(slugs) < 15:
            raise SystemExit(f"the pages changed shape ({len(slugs)} product links): stopping, nothing written")
        photo_of: dict[str, str] = {}                 # slug -> its og:image
        title_of: dict[str, str] = {}                 # slug -> the product name in its <title> / og:title
        names: dict[str, set[tuple[str, str]]] = {}   # norm name -> {(photo, page url that prints the name)}
        for slug in slugs:
            url = f"{HOME_URL}shop/{slug}/"
            try:
                page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:   # 401/403/429 are Blocked (raised by polite_get); anything else is just a missing page
                skipped.append(f"{url}: HTTP {e.code}")
                continue
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
            og = re.search(r'<meta property="og:image" content="([^"]+)"', page)
            title = re.search(r'<meta property="og:title" content="([^"]+)"', page)
            if not h1 or not og or not title:
                skipped.append(f"{url}: no <h1>, og:title or og:image")
                continue
            name = html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip()
            title_name = html.unescape(title.group(1)).rsplit(" | ", 1)[0].strip()
            photo = html.unescape(og.group(1))
            if not photo.startswith(UPLOADS):
                skipped.append(f"{url}: picture {photo} is not in the chain's own media folder")
                continue
            photo_of[slug], title_of[slug] = photo, title_name
            if norm_name(name) != norm_name(title_name):
                skipped.append(f"{url}: its <h1> {name!r} and its title {title_name!r} differ: the page's own name is not used")
                continue
            names.setdefault(norm_name(name), set()).add((photo, url))
        cards = flavour_cards(flavours)
        print(f"{len(cards)} flavour cards on {FLAVOURS_URL}")
        for name, slug in cards:
            if slug in photo_of and norm_name(title_of[slug]) == norm_name(name):
                names.setdefault(norm_name(name), set()).add((photo_of[slug], FLAVOURS_URL))
            elif slug in photo_of:
                skipped.append(f"flavour card {name!r}: its product page /shop/{slug}/ is titled {title_of[slug]!r}: not used")

        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if len(by_norm.get(norm_name(it["name"]), [])) > 1:
                skipped.append(f"{it['id']}: more than one published item has this name")
                continue
            hits = names.get(norm_name(ALIASES.get(it["id"], it["name"])), set())
            photos = {p for p, _ in hits}
            if not photos:
                skipped.append(f"{it['id']}: no product page or flavour card named {ALIASES.get(it['id'], it['name'])!r}")
                continue
            if len(photos) > 1:
                skipped.append(f"{it['id']}: the name is printed over {len(photos)} different pictures: ambiguous")
                continue
            # prefer the product page as the source page when it prints the name itself
            pages = sorted(u for _, u in hits)
            page_url = next((u for u in pages if "/shop/" in u), pages[0])
            matched[it["id"]] = (photos.pop(), page_url)

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
