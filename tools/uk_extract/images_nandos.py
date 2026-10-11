#!/usr/bin/env python3
"""Item photos for Nando's UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_nandos.py --cache DIR [--dry-run]

Source: ONE page and the data file it loads, the same two requests tools/uk_extract/nandos.py reads the menu from:
https://www.nandos.co.uk/food/menu/index.html and https://www.nandos.co.uk/food/menu/page-data/index/page-data.<N>.json (N taken from the live HTML, see
nandos_feed.py). Every dish entry in that feed carries `displayName` and `image: {aspectRatio_16_9: {res640x360: <url>}, altText}`: the photo is a
file on the chain's own media host https://images.menu.nandos.dev/ (640 x 360 JPEG, the size the menu page itself shows), so store_image only converts it
to WebP (never enlarged). `source_url` = https://www.nandos.co.uk/food/menu (the page that shows the dish with this photo).

Match rule (exact, nothing fuzzy). nandos.py builds each published item (data/source/nandos/items.csv) from ONE product record of the feed, found by its `plu`
(e.g. "1-2-chicken:pe-ri-pe-ri-chicken"); the item's name is that record's displayName (or nandos.NAME_OVERRIDE) plus " (regular)"/" (large)" when the record
prints two portions. This script re-reads the feed the same way (nandos_feed.read_menu: only entries shown to all of Great Britain, no trials) and attaches a photo
to a published item only when
  1. the row nandos.py builds from record <plu> has the same name (norm_name) as the published item (and no other record builds that name), and
  2. that record itself carries `image.aspectRatio_16_9.res640x360`, and every record with that plu carries the same photo, and
  3. the photo is on images.menu.nandos.dev.
Regular and Large of one dish share the record's single photo (the same product record carries the photo and both portions; the photo is not a statement about
the portion). Nandino sides and spice levels are not product records with a photo of their own: no photo. Records of the same NAME in other sections or the
trial/meal/breakfast variants (ids like "whole-chicken-meal:...") are never used for an item built from another record.

Terms (https://www.nandos.co.uk/nandos-terms-and-conditions, section "Intellectual property", read 2026-10-11): "We are the owner or licensee of all intellectual property
rights in the Website and their content, ... and Nando's product names, images and packaging." and "No part of the Website or Nando's App, including, without limitation,
the text, designs, graphics, photographs and images contained in them, may be copied, reproduced, republished, uploaded, re-posted, modified, transmitted or distributed
or otherwise used in any way for any non-personal, public or commercial purpose without our prior written consent." An express restriction; installed on the founder's
decision of 2026-10-06 (his accepted risk). robots.txt (https://www.nandos.co.uk/robots.txt, read 2026-10-11): "User-agent: * / Allow: /restaurants/ / Allow: /whats-new/ /
Disallow: /order/search/results, /order/menu, /order/checkout, /order/login, /order/logout, /eat-in-landing" (/food/menu and its data file are allowed); the photo host's
robots.txt answers 404 (no rules). polite_get checks robots.txt on every URL (RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import nandos  # noqa: E402  (NAME_OVERRIDE, SKIP: the same naming the items were built with)
import nandos_feed  # noqa: E402  (feed_url_from_html, read_menu: the same reader the menu came from)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "nandos"
PAGE_URL = "https://www.nandos.co.uk/food/menu/index.html"
SOURCE_PAGE = "https://www.nandos.co.uk/food/menu"
PHOTO_HOST = "https://images.menu.nandos.dev/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-nandos")
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    "mango-gelado": "the picture is a lettered graphic (the name written over a plate), not a photograph (looked at 2026-10-11)",
}


def photos_by_plu(feed: dict) -> dict[str, set[str]]:
    """plu -> the photo urls its product record(s) carry ('' when a record has none). Only records the menu page shows to all of Great Britain."""
    out: dict[str, set[str]] = {}
    for section in feed["result"]["data"]["nandos"]["menu"]["sections"]:
        for item in section["items"]:
            if item.get("restaurantGroup") or "IS_TRIAL" in (item.get("flags") or []):
                continue
            img = item.get("image") if isinstance(item.get("image"), dict) else {}
            out.setdefault(item["plu"], set()).add(((img.get("aspectRatio_16_9") or {}).get("res640x360")) or "")
    return out


def built_names(feed: dict) -> dict[str, tuple[str, str]]:
    """norm_name of the item name -> (item name, plu) exactly as nandos.py builds them from the feed's 'item' rows (not Nandino sides, not spice
    levels). Two records building the same name are both left out (ambiguous)."""
    out: dict[str, tuple[str, str]] = {}
    seen_twice: set[str] = set()
    rows, _ = nandos_feed.read_menu(feed)
    for r in rows:
        if r.kind != "item" or r.key in nandos.SKIP:
            continue
        name = nandos.NAME_OVERRIDE.get(r.key, r.name)
        if r.portion:
            name = f"{name} ({r.portion.lower()})"
        key = norm_name(name)
        if key in out and out[key][1] != r.key:
            seen_twice.add(key)
        out[key] = (name, r.key)
    for key in seen_twice:
        del out[key]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        feed_url = nandos_feed.feed_url_from_html(page)
        feed = json.loads(polite_get(feed_url, args.cache, accept="application/json,*/*").decode("utf-8"))
        photos = photos_by_plu(feed)
        built = built_names(feed)
        print(f"{len(photos)} product records in {feed_url.rsplit('/', 1)[-1]}, {sum(1 for u in photos.values() if u != {''})} with a photo")

        matched: dict[str, str] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            got = built.get(norm_name(it["name"]))
            if not got:
                skipped.append(f"{it['id']}: not built from a product record of the feed (Nandino side, spice level, or a name two records share)")
                continue
            urls = photos.get(got[1], {""})
            if len(urls) > 1:
                skipped.append(f"{it['id']}: record {got[1]} carries {len(urls)} different photos")
                continue
            (url,) = urls
            if not url:
                skipped.append(f"{it['id']}: the product record {got[1]} has no photo")
                continue
            if not url.startswith(PHOTO_HOST):
                skipped.append(f"{it['id']}: photo {url} is not on the chain's media host")
                continue
            matched[it["id"]] = url

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url[len(PHOTO_HOST):]}")
                continue
            raw = polite_get(url, args.cache, referer=SOURCE_PAGE)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, SOURCE_PAGE)
            print(f"  {item_id:50} {fname}  <- {url[len(PHOTO_HOST):]}")
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
