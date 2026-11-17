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

Published dishes the live feed no longer lists (a seasonal dish that has come off Nando's menu while our published data, extracted on an earlier
day, still has it: on 2026-11-17 HalloOoOoOomi Sticks, 3/5/10 Phantom Wings and Tombstone Chips, the Halloween dishes, were in items.csv but no longer
anywhere in the feed): the row an earlier run wrote for that item, from the record that named it then, is kept as it is (same file, same source page), as
long as its file is still in web/public/menu-images/nandos/ and no record in today's feed builds that name (when a record does, today's feed decides).
When re-extraction removes such a dish from items.csv, load_items no longer returns it and the rerun drops its photo. Because write_images_csv stamps one
date on every row, the file keeps its earlier retrieved_on date when every row the rerun writes is exactly as it was (the photos are byte-identical: the
file names are a hash of the source bytes; rows may only have been left out), and is dated today when a photo is new or changed.

Nandino sides (Chips, Spicy Rice, Corn on the Cob, Cucumber Sticks offered with the Nandinos set menu) are modifier options of the kids' dishes: their
records (plu "nandinos-side:...") carry no image field at all (checked 2026-11-17), so they get no photo; the regular-size side's photo belongs to a
different product record and portion and is never borrowed.

Terms (https://www.nandos.co.uk/nandos-terms-and-conditions, section "Intellectual property", read 2026-10-11 and again 2026-11-17, unchanged): "We are the
owner or licensee of all intellectual property rights in the Website and their content, ... and Nando's product names, images and packaging." and "No part
of the Website or Nando's App, including, without limitation, the text, designs, graphics, photographs and images contained in them, may be copied,
reproduced, republished, uploaded, re-posted, modified, transmitted or distributed or otherwise used in any way for any non-personal, public or commercial
purpose without our prior written consent." An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).
robots.txt (https://www.nandos.co.uk/robots.txt, read 2026-11-17): "User-agent: * / Allow: /restaurants/ / Allow: /whats-new/ / Disallow: /order/search/results,
/order/restaurants/, /order/checkout, /order/login, /order/logout, /eat-in-landing, /cms-tools" (/food/menu and its data file are allowed; read 2026-10-11 it
also disallowed /order/menu, which is not used here either); the photo host's robots.txt answers 404 (no rules, read 2026-11-17). polite_get checks
robots.txt on every URL (RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import nandos  # noqa: E402  (NAME_OVERRIDE, SKIP: the same naming the items were built with)
import nandos_feed  # noqa: E402  (feed_url_from_html, read_menu: the same reader the menu came from)
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "nandos"
PAGE_URL = "https://www.nandos.co.uk/food/menu/index.html"
SOURCE_PAGE = "https://www.nandos.co.uk/food/menu"
PHOTO_HOST = "https://images.menu.nandos.dev/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-nandos")
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    "mango-gelado": "the picture is the pot's printed lid (the name lettered on the packaging), not the food (looked at 2026-10-11, same picture 2026-11-17)",
    # Looked at again on 2026-11-17 (contact sheets of all 123): pictures of a sealed pack, lid or bottle with its brand's logo and lettering instead of
    # the food or the drink (the playbook's "a Pepsi can" rule: a can, bottle, carton or lidded pot is the brand's packaging, not the food).
    "chilli-jam": "the sealed pot's lid (Nando's logo, 'Chilli Jam' lettering), not the food (2026-11-17)",
    "garlic-perinaise": "the sealed pot's lid (Nando's logo, 'PERinaise Garlic', a 'Vegan friendly' sticker, '50g'), not the food (2026-11-17)",
    "peri-peri-drizzle": "a 20 ml bottle with Nando's logo and label, not the sauce (2026-11-17)",
    "beavertown-lazer-crush-alcohol-free-ipa": "a third-party brand's can (Beavertown), not the drink (2026-11-17)",
    "bero-kingston-golden-pils": "a third-party brand's can (BERO), not the drink (2026-11-17)",
    "freedom-pils": "a third-party brand's bottle (Freedom), not the drink (2026-11-17)",
    "karma-drinks-gingerella": "a third-party brand's bottle (Karma Drinks), not the drink (2026-11-17)",
    "pip-organic-cloudy-apple-juice": "a third-party brand's carton (Pip Organic), not the drink (2026-11-17)",
    "pip-organic-pineapple-mango-smoothie": "a third-party brand's carton (Pip Organic), not the drink (2026-11-17)",
    "rubro-berry-iced-tea": "a branded can (RUBRO), not the drink (2026-11-17)",
    "rubro-lemon-iced-tea": "a branded can (RUBRO), not the drink (2026-11-17)",
    "rubro-peach-iced-tea": "a branded can (RUBRO), not the drink (2026-11-17)",
    "sagres": "a third-party brand's bottle (Sagres), not the drink (2026-11-17)",
    "spier-merlot-south-africa": "a third-party brand's can (Spier), not the drink (2026-11-17)",
    "spier-rose-south-africa": "a third-party brand's can (Spier), not the drink (2026-11-17)",
    "spier-sauvignon-blanc-south-africa": "a third-party brand's can (Spier), not the drink (2026-11-17)",
    "sparkling-water": "a third-party brand's bottle (Carvalhelhos), not the drink (2026-11-17)",
    "still-water": "a third-party brand's bottle (Carvalhelhos), not the drink (2026-11-17)",
    "sxollie-cider": "a third-party brand's bottle (Sxollie), not the drink (2026-11-17)",
    "tiny-rebel-session-ipa": "a third-party brand's can (Tiny Rebel), not the drink (2026-11-17)",
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


def built_names(feed: dict, every: set[str] | None = None) -> dict[str, tuple[str, str]]:
    """norm_name of the item name -> (item name, plu) exactly as nandos.py builds them from the feed's 'item' rows (not Nandino sides, not spice
    levels). Two records building the same name are both left out (ambiguous). `every`, when given, receives every name built (ambiguous ones too)."""
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
        if every is not None:
            every.add(key)
        if key in out and out[key][1] != r.key:
            seen_twice.add(key)
        out[key] = (name, r.key)
    for key in seen_twice:
        del out[key]
    return out


def earlier_rows() -> tuple[dict[str, tuple[str, str]], set[str]]:
    """The rows images.csv holds now ({item_id: (file, source_url)}) and the retrieved_on dates in it."""
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}, set()
    with open(path, newline="", encoding="utf-8") as f:
        got = list(csv.DictReader(f))
    return {r["item_id"]: (r["file"], r["source_url"]) for r in got}, {r["retrieved_on"] for r in got}


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
        every_name: set[str] = set()
        built = built_names(feed, every_name)
        before, before_dates = earlier_rows()
        kept_gone: list[str] = []
        print(f"{len(photos)} product records in {feed_url.rsplit('/', 1)[-1]}, {sum(1 for u in photos.values() if u != {''})} with a photo")

        matched: dict[str, str] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            got = built.get(norm_name(it["name"]))
            if not got and norm_name(it["name"]) not in every_name and it["id"] in before:
                fname, src = before[it["id"]]
                if src == SOURCE_PAGE and (IMAGES_ROOT / CHAIN_ID / fname).is_file():
                    rows[it["id"]] = (fname, src)
                    kept_gone.append(f"{it['id']}: no record in today's feed names it; kept the earlier row ({fname})")
                    continue
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

    for k in kept_gone:
        print(f"  kept: {k}")
    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched, {len(kept_gone)} earlier rows kept")
        return 0
    unchanged = len(before_dates) == 1 and all(before.get(k) == v for k, v in rows.items())
    write_images_csv(CHAIN_ID, rows, retrieved_on=next(iter(before_dates)) if unchanged else None)
    if unchanged:
        print("every row kept is exactly as before (same photos, byte for byte; rows may only have been left out): the earlier retrieved_on date is kept")
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
