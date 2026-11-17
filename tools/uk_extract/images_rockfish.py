#!/usr/bin/env python3
"""Item photos for Rockfish from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_rockfish.py --cache DIR [--dry-run]

Rockfish's items come from its two allergen/calorie PDFs (tools/uk_extract/rockfish.py). Where its own website shows dish photos,
checked 2026-11-17:

1. The restaurant and takeaway menu pages (https://therockfish.co.uk/pages/restaurant-menu/<town>, /pages/takeaway-menu/<town>, listed in
   the site's sitemap_metaobject_pages_1.xml): every dish is text only (<li class="menu-item"> with title, price and description, and a
   schema.org Menu with MenuItem name/description/price, no image). The pictures on those pages are carousel slides with the alt text
   "Slide image" (a Dover sole, a prawn cocktail, the Quayside Grill...) that the page ties to no dish: not used (file names are never
   used to match). The takeaway pages' alt texts name no published dish exactly (e.g. "The takeaway Rock Dog from Rockfish. It features
   a rockfish fillet in a golden brioche bun ..." is not the published "The Rock dog and chips"); blog cards ("The Quayside Grill: A
   British Seafood Feast for Two") are article titles, not the published "“The Quayside Grill” for two". None used.
2. The click-and-collect ordering site the chain links ("Order online", https://www.sevenrooms.com/explore/rockfishexeter/ordering/pickup,
   linked from /pages/clickandcollect and the takeaway menu pages): its menu is in the page's own window.PRELOADED.menu_data; on
   2026-11-17 all 11 items had imageUrls large/medium/small = null and no external_urls. No photo there.
3. The chain's own online shop (the "Online Seafood Market", same Shopify storefront): its product sitemap
   https://therockfish.co.uk/sitemap_products_1.xml (found from https://therockfish.co.uk/sitemap.xml) gives, for every product, its page
   (/products/<handle>) and its featured photo: <image:loc> (a file in Rockfish's own Shopify file store
   cdn.shopify.com/s/files/1/0421/8263/9770/, the same store that holds the allergen PDFs the items were read from) with <image:title>
   = the product's title. Rockfish sells some of its restaurant butters and sauces, and its cockles, there. THIS is the only source used.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. exactly one shop product's title (<image:title> in the product sitemap) has the same images_common.norm_name as the item's name,
     and exactly one published item has that name ("Béarnaise Butter" = "Bearnaise butter"; "Aioli" is not "Garlic aioli", "Rockfish
     Noisette Butter" is not "Noisette butter", "Anchovy Mayonnaise" is not "Crystal bread roll and anchovy mayonnaise": no photo);
  2. the photo is that product's first (featured) <image:loc> and is a file in Rockfish's own store (PHOTO_PREFIXES);
  3. the item is not in DROP_ITEMS (looked at on a contact sheet and left out).
The row's source_url is the product page the sitemap names for that photo.

Run of 2026-11-17: 6 exact matches (Leigh-on-Sea cockles, Garlic butter, Kedgeree butter, Bearnaise butter, Dill butter, Romesco
sauce). therockfish.co.uk answered the sitemaps (and the menu pages above), then HTTP 429 "Too Many Requests" to the first product
feed asked for (/products/garlic-butter-2.json), at one request a second: we stopped asking therockfish.co.uk anything (nothing retried,
no product page fetched; this script itself sends that host only the two sitemap requests). The photos were fetched from the addresses
the chain's own sitemap names for them, on cdn.shopify.com (a different host, which had not refused us; its robots.txt is checked by
polite_get). Looked at on a contact sheet and full size: 5 kept (the four butters and the Romesco sauce: Rockfish's own labelled jar
with a spoonful of the food in front, no figure or sticker), 1 left out (the cockles: DROP_ITEMS). Result: 5 of 78 published items.

robots.txt (read 2026-11-17):
  * https://therockfish.co.uk/robots.txt: Shopify's standard file, "User-agent: *" with "Allow: /"; disallows /admin, /cart, /checkout,
    /orders, /account, /services, /sf_*, /cart.js, /recommendations/products, sort/filter crawl traps and preview parameters. The
    sitemaps, /pages/ and /products/ are allowed. (Its comments also carry text addressed to AI agents about installing a shopping
    "skill": not instructions to us, ignored.)
  * www.sevenrooms.com/robots.txt: "User-agent: *" disallows /.v/, /.a/, /.t/, /.c/, /.h/, /direct/, /embed/, /booker.html, /iframe, /x:
    /explore/... is allowed.
  * cdn.shopify.com/robots.txt: checked by polite_get before the photos (RFC 9309).

Terms: https://therockfish.co.uk/policies/terms-of-service (Shopify's standard store terms), as read on 2026-10-10 for the logo
(web/public/logos/rockfish.source.txt): "You agree not to reproduce, duplicate, copy, sell, resell or exploit any portion of the Service
... without express written permission by us", and it forbids infringing its intellectual property rights. Not re-read on 2026-11-17
(the host had answered 429 and was not asked again). An express restriction; photos installed on the founder's decision of 2026-10-06
(CLAUDE.md rule 2, his accepted risk).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "rockfish"
HOST = "https://therockfish.co.uk"
SITEMAP_INDEX = f"{HOST}/sitemap.xml"
XML_ACCEPT = "application/xml,text/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-rockfish")
# Rockfish's own Shopify file store (the allergen PDFs the items were read from are in the same store), and the storefront's own path to it.
PHOTO_PREFIXES = ("https://cdn.shopify.com/s/files/1/0421/8263/9770/", f"{HOST}/cdn/shop/")
# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {
    # The shop's photo is a bowl of plain cockle meat (the product sold by weight); the published starter is, as the guide prints it,
    # "Cockles, bread roll (wheat), butter and malt vinegar" (375 kcal, the restaurant menu's "Leigh-on-Sea cockles with bread and
    # butter"): the picture shows only part of what the figure is for.
    "leigh-on-sea-cockles": "the shop's photo is plain cockle meat; the published starter also has a bread roll, butter and malt vinegar",
}
# Kept after looking (2026-11-17): the five butters/sauce are shown as the shop sells them, a glass jar with Rockfish's own label (the
# product's name and a short line such as "with garlic & flat leaf parsley"; no figure, weight, price or sticker) and a spoonful of the
# butter or sauce itself in front: a photo of the food the item names.

URL_BLOCK = re.compile(r"<url>(.*?)</url>", re.S)
LOC = re.compile(r"<loc>\s*(.*?)\s*</loc>", re.S)
IMAGE = re.compile(r"<image:image>(.*?)</image:image>", re.S)
IMAGE_LOC = re.compile(r"<image:loc>\s*(.*?)\s*</image:loc>", re.S)
IMAGE_TITLE = re.compile(r"<image:title>\s*(.*?)\s*</image:title>", re.S)


def product_sitemap_urls(index_xml: str) -> list[str]:
    urls = [htmllib.unescape(u) for u in LOC.findall(index_xml) if "/sitemap_products_" in u]
    if not urls:
        raise SystemExit("sitemap.xml lists no product sitemap: the site has changed shape")
    return urls


def parse_products(xml: str) -> list[dict]:
    """One dict per product with a photo: page (product URL), title (the product's title), photo (its first, featured image)."""
    out = []
    for block in URL_BLOCK.findall(xml):
        loc = LOC.search(block)
        if not loc or "/products/" not in loc.group(1):
            continue
        images = IMAGE.findall(block)
        if not images:
            continue
        first = images[0]
        src, title = IMAGE_LOC.search(first), IMAGE_TITLE.search(first)
        if not src or not title:
            continue
        out.append({"page": htmllib.unescape(loc.group(1)), "title": htmllib.unescape(title.group(1)),
                    "photo": htmllib.unescape(src.group(1))})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    item_names: dict[str, list[dict]] = {}
    for it in items:
        item_names.setdefault(norm_name(it["name"]), []).append(it)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, dict] = {}
    try:
        index = polite_get(SITEMAP_INDEX, args.cache, accept=XML_ACCEPT).decode("utf-8", "replace")
        products: list[dict] = []
        for url in product_sitemap_urls(index):
            products += parse_products(polite_get(url, args.cache, accept=XML_ACCEPT).decode("utf-8", "replace"))
        print(f"{len(products)} shop products with a photo in the product sitemap of {HOST}")

        by_name: dict[str, list[dict]] = {}
        for p in products:
            by_name.setdefault(norm_name(p["title"]), []).append(p)
        for key, prods in sorted(by_name.items()):
            its = item_names.get(key)
            if not its:
                continue
            if len(prods) != 1 or len(its) != 1:
                skipped.append(f"{key!r}: {len(prods)} products and {len(its)} published items share the name: ambiguous, no photo")
                continue
            it, p = its[0], prods[0]
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if not p["photo"].startswith(PHOTO_PREFIXES):
                skipped.append(f"{it['id']}: the product's photo {p['photo']!r} is not a file in Rockfish's own store")
                continue
            matched[it["id"]] = p

        for item_id, p in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:30} {p['photo'].rsplit('/', 1)[-1]}  <- product {p['title']!r} {p['page']}")
                continue
            raw = polite_get(p["photo"], args.cache, referer=p["page"])
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {p['photo']}: {e}")
                continue
            rows[item_id] = (fname, p["page"])
            print(f"  {item_id:30} {fname}  <- {p['photo'].rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows:
        print(f"0 of {len(items)} published items have a photo (no images.csv written)")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
