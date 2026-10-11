#!/usr/bin/env python3
"""Item photos for KFC UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_kfc.py --cache DIR [--dry-run]

Source: the chain's own menu pages https://www.kfc.co.uk/our-menu/<category> (15 category pages, listed on /our-menu). Each page is a Next.js
page whose page data (`__NEXT_DATA__`) holds one tile per product: `{image: {original: {url, alt, width, height}}, heading, image_link,
button_link}`: the photo, its alt text, the tile's heading and the link to the product page. The photos are files on the chain's own media
host https://brand-uk.assets.kfc.co.uk (1200 x 800 JPEG), so store_image only downsizes them to <= 640 px and converts to WebP.

Match rule (exact, nothing fuzzy). A photo is attached to a published item (data/source/kfc/items.csv, built from the chain's nutrition PDF) only when
  1. a tile's image alt text AND the tile's own heading (when it has one) both have the same norm_name as the item's whole name, and
  2. exactly one photo carries that name on the whole menu (a name used by two different photos gets no photo), and
  3. the photo is on brand-uk.assets.kfc.co.uk.
Sizes. An item "<Base> (regular|small|large)" is matched, in the same exact way, in two more cases: (a) a tile whose alt and heading are "<Size> <Base>" (the same words, only the size
word moved: "Regular Signature Fries" for "Signature Fries (regular)"), or (b) a tile named "<Base>" whose own product page's picture is named "<Base> <Size>" or "<Size> <Base>"
("Coleslaw Regular": the page carries the product, its size and the photo in one record; that page is the one request made for it). A "(large)" row never matches a tile that
names the Regular portion.
Everything else gets no photo: names the PDF words differently from the menu ("Zinger Stacker Burger" vs the tile "Zinger Stacker"; "Coleslaw (regular)"
vs the tile "Coleslaw" whose picture is the REGULAR portion; "Signature Fries (regular)" vs "Regular Signature Fries"; dips "... Dip Pot" vs
"... Dip"), sizes, per-piece rows and sachets. Meal tiles ("... Meal", "... Box Meal") name different products (a burger with fries and a drink) and
match no item. No match by slug, file name, colour, category or similarity.

Terms (https://www.kfc.co.uk/terms-conditions, section INTELLECTUAL PROPERTY, read 2026-10-11): "The graphic images, buttons and text contained in the Sites
(and the Sites' 'look and feel') are the exclusive property of KFC and, except for personal use, may not be copied, distributed, or reproduced or
transmitted in any form or by any mean, electronic, mechanical, photocopying, recording or otherwise, without the prior written permission of KFC." An
express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk). robots.txt (https://www.kfc.co.uk/robots.txt, read 2026-10-11):
"User-agent: * / Allow: / / Disallow: /wingzapp/" (the menu pages are allowed; brand-uk.assets.kfc.co.uk is checked by polite_get on every URL, RFC 9309).

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
PHOTO_HOST = "https://brand-uk.assets.kfc.co.uk/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-kfc")
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    # looked at on the contact sheet (2026-10-11): the chain's photo shows the Oatly (oat drink) version, our menu has separate "Oatly Iced ..." rows
    "iced-latte": "the photo carries an Oatly badge: it shows the oat-drink version, not the standard iced latte",
    "iced-caramel-latte": "the photo carries an Oatly badge: it shows the oat-drink version, not the standard iced caramel latte",
}

CATEGORY_LINK = re.compile(r'href="/our-menu/([a-z0-9-]+)"')
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


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

        by_name: dict[str, set[tuple[str, str]]] = {}   # norm name -> {(photo file without version, tile page)}
        for t in tiles:
            if not t["url"].startswith(PHOTO_HOST) or not t["alt"]:
                continue
            if t["heading"] and norm_name(t["heading"]) != norm_name(t["alt"]):
                continue   # the tile's heading and its picture's alt text name different products: neither is trusted
            by_name.setdefault(norm_name(t["alt"]), set()).add((t["url"], f"{SITE}{t['link']}" if t["link"].startswith("/") else MENU_URL))

        matched: dict[str, tuple[str, str]] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            cands = by_name.get(norm_name(it["name"]))
            sz = SIZE_SUFFIX.match(it["name"])
            if not cands and sz:
                base, size = sz.group("base"), sz.group("size").lower()
                cands = by_name.get(norm_name(f"{size} {base}"))                 # (a) "Regular Signature Fries"
                if not cands and size == "regular" and by_name.get(norm_name(base)):    # (b) tile "Coleslaw": its page must name the Regular portion
                    (tile_url, tile_page), = sorted(by_name[norm_name(base)])[:1] if len(by_name[norm_name(base)]) == 1 else [(None, None)]
                    if tile_page and tile_page.startswith(SITE):
                        want = tile_url.split("?")[0].rsplit("/", 1)[-1]   # the tile's picture file name; the page's own record must carry the same file
                        for alt, url in page_pictures(polite_get(tile_page, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")):
                            if url.split("?")[0].rsplit("/", 1)[-1] == want and norm_name(alt) in (norm_name(f"{base} {size}"), norm_name(f"{size} {base}")):
                                cands = {(tile_url, tile_page)}
            if not cands:
                skipped.append(f"{it['id']}: no tile on the menu is named {it['name']!r}")
                continue
            files = {u.split("?")[0] for u, _ in cands}
            if len(files) > 1:
                skipped.append(f"{it['id']}: {len(files)} different photos carry the name {it['name']!r}")
                continue
            matched[it["id"]] = sorted(cands)[0]

        for item_id, (url, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.split('?')[0][len(PHOTO_HOST):]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=MENU_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {url.split('?')[0][len(PHOTO_HOST):]}")
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
