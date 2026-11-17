#!/usr/bin/env python3
"""Item photos for Pasta Evangelists from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_pasta_evangelists.py --cache DIR [--dry-run] [--confirm-pages] [--only-cdn]

The menu (data/source/pasta-evangelists/, from tools/uk_extract/pasta_evangelists.py) is the chain's Restaurants allergen chart: 239 published
rows, most of them wines, spirits, cocktails, hot drinks, soft drinks and add-ons/garnishes, for which the chain shows no photo anywhere.

Where the chain shows its restaurant dishes, and why most of it can't be used (read 2026-11-17):
  - https://pastaevangelists.com/pages/restaurants-menu ("Sample menus") links to https://plan.pastaevangelists.com/restaurant-menu-preview/<menu>,
    which shows each menu as ONE picture of the printed menu (a Google Drive file, lh3.googleusercontent.com/d/<fileId>; read from the page's own
    script RestaurantMenuPreview-*.js): no per-dish photo.
  - The ordering and booking app on https://plan.pastaevangelists.com (robots.txt: `User-agent: *` `allow: /`) is an empty JavaScript shell whose
    menus, dishes and photos come from its GraphQL API https://pensa.pastaevangelists.com/graphql; that host's robots.txt is `User-agent: *`
    `Disallow: /` (read 2026-11-17, HTTP 200). So it is not fetched, not directly and not through a browser that would fetch it for us.
What the chain's own pages do tie to a dish by name (both on its Shopify storefront https://pastaevangelists.com, robots.txt `User-agent: *`
`Allow: /` with only checkout/cart/account/admin, filter and preview paths disallowed; its images on cdn.shopify.com, robots.txt allows /s/files/):
  (A) the storefront's product sitemap (https://pastaevangelists.com/sitemap.xml -> sitemap_products_1.xml): every product page <loc> with its
      featured image <image:loc> (on cdn.shopify.com/s/files/1/1725/5449/, the store's own file folder) and the product's title <image:title>.
      These are the chain's delivery dishes ("Pasta Evangelists Sub - ..." in the image captions). A photo is attached only when the product's
      title has the same norm_name as the restaurant item's name (e.g. product "Beef & Chianti lasagne" = item "Beef & Chianti Lasagne"). The
      sitemap entry is the store's own record tying that image to that product page (Shopify writes the product's title and featured image
      into it; lastmod 2026-11-17 on the run). With --confirm-pages the product page itself is also fetched and must still carry that title as
      og:title and that same file as og:image; on 2026-11-17 the product pages answered HTTP 429 (twice, 18 minutes apart, at one request per
      5 s), so that run used the sitemap record alone. The restaurant chart and the delivery product use the same dish name; a picture that
      shows packaging instead of the plated dish is left out (DROP_ITEMS).
  (B) the seasonal page https://pastaevangelists.com/pages/autumn: each "image text" section names one dish in bold (<strong>) and shows its
      photo (<picture> of pastaevangelists.com/cdn/shop/files/...). Attached when the bold name has the same norm_name as the item's name.
      "Rigatoni alla Crema di Formaggi" is NOT attached to the chart's "Rigatoni Alla Crema Di Fomaggi" (the chart's spelling: not an exact
      match, and nothing fuzzy is done), and "Fusilli with Tuscan-Style Sausage & Fennel Ragù" names a different dish from the chart's
      "Egg Fusilli with ..." (held back anyway).
Nothing else is used: no delivery platform, no social media, no search engine, no other site.

Match rule (exact, nothing fuzzy): norm_name(page name) == norm_name(item name), the item is published (not in holdback.csv), the item is not in
DROP_ITEMS, and the photo is a file on the chain's own Shopify store (cdn.shopify.com/s/files/1/1725/5449/ or pastaevangelists.com/cdn/shop/files/).

robots.txt: pastaevangelists.com (Shopify storefront, `User-agent: *` `Allow: /`; disallows /admin, /cart/, /checkout, /orders, /account,
/services, /sf_*, /cdn/wpm/*.js, sort/filter/preview query strings, read 2026-11-17), cdn.shopify.com (`Disallow: */blog-article-remove-faq-utms-*.js`,
`Disallow: /wpm/*.js` only), plan.pastaevangelists.com (`allow: /`), pensa.pastaevangelists.com (`Disallow: /`: not used). polite_get checks robots.txt
on every URL (RFC 9309), keeps 1 request a second per host (PAGE_DELAY seconds here for the storefront, which answered 429 to a burst of
product .json requests on 2026-11-17: the .json endpoints are not used) and stops on 401/403/429.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17 (--only-cdn): the storefront answered HTTP 429 to product .json and product HTML pages (the robots.txt, sitemaps, the autumn
page, /pages/terms-and-conditions and the blog sitemap were read, at one request per 1-5 s), so no further request was made to pastaevangelists.com
and the autumn page's Pumpkin Gnocchi photo (a file on pastaevangelists.com/cdn/shop/files/) was NOT fetched; it was not fetched through
cdn.shopify.com either (a different host name for the same file would dodge the 429). The five product photos are files the product sitemap
names on cdn.shopify.com and were fetched from there. A later rerun without --only-cdn adds the Pumpkin Gnocchi photo if the storefront answers:
look at it before keeping it (it is a wide campaign photo).

Terms (https://pastaevangelists.com/pages/terms-and-conditions, read 2026-11-17): sections 1-15 cover ordering, payments, prices, delivery,
returns, offers, competitions, gift cards, events, force majeure, liability, personal information, abuse and the registered office; none says
anything about copying or reusing the site's content, images or trade marks (no such clause found; the footer reads "(c) 2026 Pasta Evangelists
Ltd. All rights reserved."). The same was found for the logo on 2026-10-11 (web/public/logos/pasta-evangelists.source.txt).
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

CHAIN_ID = "pasta-evangelists"
STORE = "https://pastaevangelists.com"
SITEMAP = f"{STORE}/sitemap.xml"
AUTUMN = f"{STORE}/pages/autumn"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
XML_ACCEPT = "application/xml,text/xml;q=0.9,*/*;q=0.8"
PAGE_DELAY = 5.0   # seconds between requests to the storefront (slower than the 1/s default after its 429 on 2026-11-17)
DEFAULT_CACHE = Path("/tmp/menumacros-images-pasta-evangelists")
OWN_IMAGE = re.compile(r"^https://(cdn\.shopify\.com/s/files/1/1725/5449/files/|pastaevangelists\.com/cdn/shop/files/)[^?#]+\.(jpe?g|png|webp)(\?|$)", re.I)

# Looked at on contact sheets after the run of 2026-11-17 and left without a photo; a rerun must not bring them back.
# All five photos of that run (Aubergine Parmigiana, Beef & Chianti Lasagne, Tiramisu, Tomato Focaccia, Truffle Mac & Cheese) were looked at at
# full size: each shows the named dish plated, with no lettering, figures, sticker, packaging or logo, so none is dropped.
DROP_ITEMS: dict[str, str] = {}


def products_sitemap_url(cache: Path) -> str:
    idx = polite_get(SITEMAP, cache, delay=PAGE_DELAY, accept=XML_ACCEPT).decode("utf-8", "replace")
    m = re.search(r"<loc>(https://pastaevangelists\.com/sitemap_products_1\.xml[^<]*)</loc>", idx)
    if not m:
        raise SystemExit("the sitemap index no longer lists sitemap_products_1.xml: the site has changed shape")
    return htmllib.unescape(m.group(1))


def sitemap_products(cache: Path) -> list[dict]:
    """[{page, image, title}] for every product entry with an image in the storefront's product sitemap."""
    xml = polite_get(products_sitemap_url(cache), cache, delay=PAGE_DELAY, accept=XML_ACCEPT).decode("utf-8", "replace")
    out = []
    for body in re.findall(r"<url>(.*?)</url>", xml, re.S):
        loc = re.search(r"<loc>([^<]+)</loc>", body)
        img = re.search(r"<image:loc>([^<]+)</image:loc>", body)
        title = re.search(r"<image:title>([^<]*)</image:title>", body)
        if loc and img and title and "/products/" in loc.group(1):
            out.append({"page": htmllib.unescape(loc.group(1)), "image": htmllib.unescape(img.group(1)),
                        "title": htmllib.unescape(title.group(1)).strip()})
    if len(out) < 20:
        raise SystemExit(f"only {len(out)} products with an image in the product sitemap: the site has changed shape")
    return out


def image_file(url: str) -> str:
    """The file name of a Shopify image URL without its size suffix or query: '.../files/foo.jpg?v=1&width=600' -> 'foo.jpg'."""
    name = url.split("?", 1)[0].rsplit("/", 1)[-1]
    return re.sub(r"_\d+x\d*(?=\.[a-z]+$)|_x\d+(?=\.[a-z]+$)", "", name, flags=re.I)


def product_page_confirms(page_html: str, title: str, image_url: str) -> str | None:
    """None when the product page's own og:title is the sitemap title and its og:image is the same file; else why not."""
    og_title = re.search(r'<meta property="og:title" content="([^"]*)"', page_html)
    og_image = re.search(r'<meta property="og:image" content="([^"]*)"', page_html)
    if not og_title or norm_name(htmllib.unescape(og_title.group(1))) != norm_name(title):
        return f"the product page's og:title {og_title.group(1) if og_title else None!r} is not {title!r}"
    if not og_image or image_file(htmllib.unescape(og_image.group(1))) != image_file(image_url):
        return f"the product page's og:image {og_image.group(1) if og_image else None!r} is not {image_file(image_url)!r}"
    return None


def autumn_dishes(cache: Path) -> list[dict]:
    """[{name, image}] for each image-text section of the autumn page: its bold dish name and its photo (the 1024 px rendition)."""
    page = polite_get(AUTUMN, cache, delay=PAGE_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
    out = []
    for sec in re.split(r'<div id="shopify-section-', page)[1:]:
        if 'class="image-text-section"' not in sec:
            continue
        name = re.search(r'<div class="text[^"]*">\s*<p><strong>(.*?)</strong></p>', sec, re.S)
        pic = re.search(r'srcset="(//pastaevangelists\.com/cdn/shop/files/[^"?]+)\?(v=\d+)&(?:amp;)?width=1024"', sec)
        if name and pic:
            out.append({"name": htmllib.unescape(re.sub(r"<[^>]+>", "", name.group(1))).strip(),
                        "image": f"https:{pic.group(1)}?{pic.group(2)}&width=1024"})
    if not out:
        raise SystemExit("the autumn page has no image-text section with a bold dish name: the page has changed shape")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    ap.add_argument("--confirm-pages", action="store_true", help="also fetch each matched product page and check its og:title and og:image")
    ap.add_argument("--only-cdn", action="store_true",
                    help="fetch photos from cdn.shopify.com only (after the storefront answered 429): a photo on pastaevangelists.com is not fetched")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, how)
    try:
        # (B) the seasonal page first, so a dish shown there keeps the restaurant campaign's photo
        for d in autumn_dishes(args.cache):
            hits = by_name.get(norm_name(d["name"]), [])
            if not hits:
                skipped.append(f"autumn page dish {d['name']!r}: no published item has that exact name")
            for it in hits:
                matched.setdefault(it["id"], (d["image"], AUTUMN, f"autumn page: {d['name']!r}"))
        # (A) the storefront's products, confirmed on each product page
        for p in sitemap_products(args.cache):
            hits = [it for it in by_name.get(norm_name(p["title"]), []) if it["id"] not in matched]
            if not hits:
                continue
            if not OWN_IMAGE.match(p["image"]):
                skipped.append(f"product {p['title']!r}: its image {p['image']} is not in the store's own file folder")
                continue
            if args.confirm_pages:
                page = polite_get(p["page"], args.cache, delay=PAGE_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
                why = product_page_confirms(page, p["title"], p["image"])
                if why:
                    skipped.append(f"product {p['title']!r} ({p['page']}): {why}")
                    continue
            for it in hits:
                matched[it["id"]] = (p["image"], p["page"], f"product {p['title']!r}")

        for item_id in list(matched):
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                del matched[item_id]

        for item_id in list(matched):
            if args.only_cdn and not matched[item_id][0].startswith("https://cdn.shopify.com/"):
                skipped.append(f"{item_id}: not fetched (--only-cdn: the photo {matched[item_id][0]} is on the storefront, which answered 429)")
                del matched[item_id]

        for item_id, (url, page_url, how) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:45} {image_file(url)}  <- {how}")
                continue
            raw = polite_get(url, args.cache, delay=PAGE_DELAY if "pastaevangelists.com" in url else 1.0, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:45} {fname}  <- {how}")
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
