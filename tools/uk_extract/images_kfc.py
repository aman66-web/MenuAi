#!/usr/bin/env python3
"""Item photos for KFC UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_kfc.py --cache DIR [--dry-run]

Sources (all on the chain's own site, nothing else is requested besides the photo files):
  * the menu pages https://www.kfc.co.uk/our-menu/<category> (15 category pages, listed on /our-menu). Each page is a Next.js
    page whose page data (`__NEXT_DATA__`) holds one tile per product: `{image: {original: {url, alt, width, height}}, heading, image_link,
    button_link}`: the photo, its alt text, the tile's heading and the link to the product page;
  * the product pages https://www.kfc.co.uk/our-menu/<category>/<slug>: those the tiles link to, plus those the site's own
    https://www.kfc.co.uk/sitemap.xml lists under /our-menu/ (e.g. /our-menu/sides-dips/kfc-large-gravy, live product pages the
    category pages don't link to). A product page's data holds ONE product block (`two_column_cta`): its h1 heading names the product
    and the block's other column carries the product's photo (`image.original`). Pages whose address names a meal, bucket, feast,
    banquet, box, bundle, kids' box or "with drink" are not requested (bundles: they name no single item);
  * the photos are files on the chain's own media host https://brand-uk.assets.kfc.co.uk (1200 x 800 JPEG), so store_image only
    downsizes them to <= 640 px and converts to WebP.

Match rule (exact, nothing fuzzy). A photo is attached to a published item (data/source/kfc/items.csv, built from the chain's nutrition PDF)
only by one of these rules, tried in this order:
  1. Tile. A tile's image alt text AND the tile's own heading (when it has one) both have the same norm_name as the item's whole name,
     exactly one photo carries that name on the whole menu (a name used by two different photos gets no photo), and the photo is on
     brand-uk.assets.kfc.co.uk.
  2. Sizes. An item "<Base> (regular|small|large)" is matched, in the same exact way, in two more cases: (a) a tile whose alt and heading
     are "<Size> <Base>" (the same words, only the size word moved: "Regular Popcorn Chicken" for "Popcorn Chicken (regular)"), or (b) a
     tile named "<Base>" whose own product page's picture is named "<Base> <Size>" or "<Size> <Base>" ("Coleslaw Regular": the page carries
     the product, its size and the photo in one record). A "(large)" row never matches a tile that names the Regular portion.
  3. Product page (added 2026-11-17). The product page's h1 heading names the item exactly: the same norm_name as the item's whole name, or
     for "<Base> (size)" the h1 "<Size> <Base>" / "<Base> <Size>" (only the size word moved). Trademark signs (TM, (R), (C)) in a heading
     are dropped before comparing (they are not part of the name; NFKD would otherwise turn "TM" into letters). The photo is the one photo
     in the same product block, on brand-uk.assets.kfc.co.uk. If two product pages name the item with different photos, no photo.
     ("KENTUCKY MAYO TWISTER" for "Kentucky Mayo Twister", whose tile says "Kentucky Mayo Twister Wrap"; "LARGE GRAVY" for "Gravy (large)".)
  4. One piece (added 2026-11-17; switch MATCH_ONE_PIECE). An item "<Base> (per piece)" matches a tile whose alt and heading agree and
     name exactly one piece of the same thing: "1 <Base>", "<Base>: 1pc" or "1pc <Base>" ("Original Recipe Chicken: 1pc" for
     "Original Recipe Chicken (per piece)", "1 Tender" for "Tender (per piece)"); the same words, "per piece" written as a count of 1.
     A picture of 2 or more pieces ("2 Hot Wings") never matches a per-piece row.
Everything else gets no photo: names the PDF words differently from the site ("Supercharger Twister" vs "Supercharger Mayo Twister";
"Signature Fries (large)" vs "Large Fries"; "BBQ Beans" vs "Beans"; "Corn Cobette" vs "Corn Cob: 1 pc"; "Cajun Dirty Rice" vs "Cajun Rice";
"Veggie Ranch Rice Bowl" vs "Original Ranch Veggie Rice Bowl"; "Milk Chocolate Cookie" vs "Chocolate Chip Cookie"; "Oreo Krushems Shake" vs
"Oreo Biscuit Krushems Shake"; dips "... Dip Pot" vs "... Dip"), "Iced Tiramisu Latte" (its tile's alt and its page's h1 spell it differently),
sachets, third-party bottles and cans named differently ("Bottle of Still Water" vs "Still Water", "Fruit Shoot Robinsons ..." vs
"... Fruit Shoot"), fountain drinks with no size on the site's record ("Pepsi Max" for "Pepsi Max (regular)"). Meal tiles ("... Meal",
"... Box Meal", "Kids' Box: ...") name different products (a burger with fries and a drink) and match no item. No match by slug, file name,
colour, category or similarity.

Source page recorded per photo: the product page the tile links to, or the product page (rule 3), or, for a tile with no link, the category
page that shows the tile (e.g. /our-menu/kwench-by-kfc for the Strawberry Shortcake Krunch Shake).

Terms (https://www.kfc.co.uk/terms-conditions, section INTELLECTUAL PROPERTY, read 2026-10-11 and again 2026-11-17, unchanged): "The graphic images,
buttons and text contained in the Sites (and the Sites' 'look and feel') are the exclusive property of KFC and, except for personal use, may not be
copied, distributed, or reproduced or transmitted in any form or by any mean, electronic, mechanical, photocopying, recording or otherwise, without
the prior written permission of KFC." An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk). robots.txt
(https://www.kfc.co.uk/robots.txt, read 2026-10-11 and 2026-11-17): "User-agent: * / Allow: / / Disallow: /wingzapp/" (the menu pages, the
product pages and sitemap.xml are allowed); https://brand-uk.assets.kfc.co.uk/robots.txt (read 2026-11-17): "User-agent: * / Allow: /".
polite_get checks robots.txt on every URL (RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "kfc"
SITE = "https://www.kfc.co.uk"
MENU_URL = f"{SITE}/our-menu"
SITEMAP_URL = f"{SITE}/sitemap.xml"
PHOTO_HOST = "https://brand-uk.assets.kfc.co.uk/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
XML_ACCEPT = "application/xml,text/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-kfc")
MATCH_ONE_PIECE = True   # rule 4: "<Base> (per piece)" <-> a tile naming exactly one piece ("1 <Base>", "<Base>: 1pc"); False turns it off
# item id -> why it was looked at after a run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    # looked at on the contact sheet (2026-10-11): the chain's photo shows the Oatly (oat drink) version, our menu has separate "Oatly Iced ..." rows
    "iced-latte": "the photo carries an Oatly badge: it shows the oat-drink version, not the standard iced latte",
    "iced-caramel-latte": "the photo carries an Oatly badge: it shows the oat-drink version, not the standard iced caramel latte",
}

CATEGORY_LINK = re.compile(r'href="/our-menu/([a-z0-9-]+)"')
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
PRODUCT_PATH = re.compile(r"^/our-menu/[a-z0-9-]+/[a-z0-9-]+$")
BUNDLE_SLUG = re.compile(r"meal|bucket|feast|banquet|box|bundle|kids|with-drink")   # pages not requested (bundles name no single item)
SITEMAP_LOC = re.compile(r"<loc>\s*(https://www\.kfc\.co\.uk/our-menu/[a-z0-9-]+/[a-z0-9-]+)\s*</loc>")
MARKS = re.compile(r"[™®©℠]")   # TM, (R), (C), SM: trademark signs, not part of a name


def name_key(s: str) -> str:
    return norm_name(MARKS.sub("", s))


def tiles_of(page: str, category: str) -> list[dict]:
    m = NEXT_DATA.search(page)
    if not m:
        raise SystemExit(f"/our-menu/{category}: no page data: the page has changed shape")
    out: list[dict] = []

    def walk(o):
        if isinstance(o, dict):
            img = o.get("image")
            if isinstance(img, dict) and isinstance(img.get("original"), dict) and ("image_link" in o or "button_link" in o):
                im = img["original"]
                out.append({"category": category, "alt": im.get("alt") or "", "heading": o.get("heading") or "",
                            "url": im.get("url") or "", "link": o.get("image_link") or o.get("button_link") or ""})
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(json.loads(m.group(1)))
    return out


SIZE_SUFFIX = re.compile(r"^(?P<base>.+?)\s*\((?P<size>regular|small|large)\)\s*$", re.I)
PER_PIECE = re.compile(r"^(?P<base>.+?)\s*\(per piece\)\s*$", re.I)


def page_pictures(page: str) -> list[tuple[str, str]]:
    """(alt, url) of every picture record (`image_alt.original`) in the product page's data."""
    m = NEXT_DATA.search(page)
    if not m:
        return []
    found: list[tuple[str, str]] = []

    def walk(o):
        if isinstance(o, dict):
            ia = o.get("image_alt")
            if isinstance(ia, dict) and isinstance(ia.get("original"), dict):
                found.append((ia["original"].get("alt") or "", ia["original"].get("url") or ""))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(json.loads(m.group(1)))
    return found


def product_record(page: str) -> tuple[str, str] | None:
    """(h1 heading, photo url) of a product page's one product block, or None when the page has no such single block: exactly one
    `two_column_cta` block carries an h1 heading, and its other column(s) carry exactly one photo file on the chain's media host."""
    m = NEXT_DATA.search(page)
    if not m:
        return None
    data = (json.loads(m.group(1)).get("props", {}).get("pageProps", {}) or {}).get("data") or {}
    blocks = []
    for comp in data.get("mainContent") or []:
        if not isinstance(comp, dict) or comp.get("id") != "two_column_cta":
            continue
        children = (comp.get("data") or {}).get("children") or []
        h1 = [c.get("heading") for c in children if isinstance(c, dict) and c.get("heading_level") == "h1" and c.get("heading")]
        if not h1:
            continue
        photos = {((c.get("image") or {}).get("original") or {}).get("url", "").split("?")[0]: ((c.get("image") or {}).get("original") or {}).get("url", "")
                  for c in children if isinstance(c, dict) and not (c.get("heading_level") == "h1" and c.get("heading"))}
        photos = {k: v for k, v in photos.items() if k.startswith(PHOTO_HOST)}
        blocks.append((h1, photos))
    if len(blocks) != 1 or len(blocks[0][0]) != 1 or len(blocks[0][1]) != 1:
        return None
    (h1,), photos = blocks[0]
    return h1, next(iter(photos.values()))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        landing = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        categories = sorted(set(CATEGORY_LINK.findall(landing)))
        if len(categories) < 10:
            raise SystemExit(f"only {len(categories)} category links on {MENU_URL}: the page has changed shape")
        tiles: list[dict] = []
        for cat in categories:
            page = polite_get(f"{MENU_URL}/{cat}", args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            tiles += tiles_of(page, cat)
        print(f"{len(tiles)} tiles on {len(categories)} category pages of {MENU_URL}")

        def tile_page(t: dict) -> str:
            # the page that shows this photo for this product: the product page the tile links to, else the category page showing the tile
            return f"{SITE}{t['link']}" if t["link"].startswith("/") else f"{MENU_URL}/{t['category']}"

        by_name: dict[str, set[tuple[str, str]]] = {}   # norm name -> {(photo url, page)}
        for t in tiles:
            if not t["url"].startswith(PHOTO_HOST) or not t["alt"]:
                continue
            if t["heading"] and name_key(t["heading"]) != name_key(t["alt"]):
                continue   # the tile's heading and its picture's alt text name different products: neither is trusted
            by_name.setdefault(name_key(t["alt"]), set()).add((t["url"], tile_page(t)))

        # product pages: those the tiles link to plus the site's own sitemap entries under /our-menu/<category>/<slug>
        product_urls = {f"{SITE}{t['link']}" for t in tiles if PRODUCT_PATH.match(t["link"])}
        sitemap = polite_get(SITEMAP_URL, args.cache, accept=XML_ACCEPT).decode("utf-8", "replace")
        product_urls |= set(SITEMAP_LOC.findall(sitemap))
        product_urls = {u for u in product_urls if not BUNDLE_SLUG.search(u.rsplit("/", 1)[1])}
        by_h1: dict[str, set[tuple[str, str]]] = {}     # norm h1 -> {(photo url, product page)}
        for url in sorted(product_urls):
            rec = product_record(polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
            if rec:
                by_h1.setdefault(name_key(rec[0]), set()).add((rec[1], url))
        print(f"{len(product_urls)} product pages read, {sum(len(v) for v in by_h1.values())} with one named product and one photo")

        def one_photo(cands: set[tuple[str, str]] | None) -> set[tuple[str, str]] | None:
            if not cands:
                return None
            return cands if len({u.split("?")[0] for u, _ in cands}) == 1 else set()   # empty set = two different photos carry the name

        matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page, rule)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            key = name_key(it["name"])
            sz = SIZE_SUFFIX.match(it["name"])
            pp = PER_PIECE.match(it["name"])
            rule, cands = "tile", by_name.get(key)
            if not cands and sz:
                base, size = sz.group("base"), sz.group("size").lower()
                rule, cands = "size", by_name.get(name_key(f"{size} {base}"))       # (a) "Regular Popcorn Chicken"
                if not cands and size == "regular" and by_name.get(name_key(base)):     # (b) tile "Coleslaw": its page must name the Regular portion
                    (tile_url, page_url), = sorted(by_name[name_key(base)])[:1] if len(by_name[name_key(base)]) == 1 else [(None, None)]
                    if page_url and page_url.startswith(f"{SITE}/our-menu/") and PRODUCT_PATH.match(page_url[len(SITE):]):
                        want = tile_url.split("?")[0].rsplit("/", 1)[-1]   # the tile's picture file name; the page's own record must carry the same file
                        for alt, url in page_pictures(polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")):
                            if url.split("?")[0].rsplit("/", 1)[-1] == want and name_key(alt) in (name_key(f"{base} {size}"), name_key(f"{size} {base}")):
                                cands = {(tile_url, page_url)}
            if not cands:
                names = [key] + ([name_key(f"{sz.group('size')} {sz.group('base')}"), name_key(f"{sz.group('base')} {sz.group('size')}")] if sz else [])
                found: set[tuple[str, str]] = set()
                for n in names:
                    found |= by_h1.get(n, set())
                rule, cands = "product page", found or None
            if not cands and pp and MATCH_ONE_PIECE:
                base = pp.group("base")
                found = set()
                for n in (f"1 {base}", f"{base}: 1pc", f"{base} 1pc", f"1pc {base}"):
                    found |= by_name.get(name_key(n), set())
                rule, cands = "one piece", found or None
            cands = one_photo(cands)
            if cands is None:
                skipped.append(f"{it['id']}: no tile or product page on the site is named {it['name']!r}")
                continue
            if not cands:
                skipped.append(f"{it['id']}: different photos carry the name {it['name']!r}")
                continue
            url, page_url = sorted(cands)[0]
            matched[it["id"]] = (url, page_url, rule)

        for item_id, (url, page_url, rule) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} [{rule:12}] {url.split('?')[0][len(PHOTO_HOST):]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} [{rule:12}] {fname}  <- {url.split('?')[0][len(PHOTO_HOST):]}")
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
