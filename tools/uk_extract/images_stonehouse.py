#!/usr/bin/env python3
"""Item photos for Stonehouse from the menu feed its own online menu loads (docs/UK_DATA_PLAYBOOK.md, Phase 4; images_common.py).

    python3 tools/uk_extract/images_stonehouse.py --cache DIR [--dry-run]

Source: ONE request, the JSON that the Stonehouse restaurant menu page (<mab-menu>) loads for TradingEntity 1001496, the same
document tools/uk_extract/stonehouse.py reads the nutrition from (data/source/stonehouse/chain.csv source_url):
https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001496&websitePageUrlPath=main-menu1&idType=TradingEntity&salesChannel=DynamicWebMenus
In that document a dish record that has a picture carries it beside its name, e.g. (read 2026-11-17, menu "177. Stonehouse DN26
( REMODEL ) Main Menu *LIVE*"):
    {"name": "Home-Baked Sticky Toffee Pudding (V)", "image": {"cdnUrl": "https://cdn.mbplc.io/step-gateway-external/73/66/5317366.jpg",
     "altText": "A sticky toffee pudding with toffee sauce on a plate surrounded by custard, garnished with a mint leaf."}, ...}
so the photo, the dish name and its nutrition sit in ONE record. We fetch the original file the record names (`cdnUrl`, not the
"Small" thumbnail) from the chain's own media host cdn.mbplc.io and let store_image do the only change (downsize to <= 640 px, WebP).
The menu-level `image` (a banner for the whole menu) is never used. Dishes whose record has no `image` get no photo: on 2026-11-17
only ONE of the feed's 117 dish records carried a picture (Home-Baked Sticky Toffee Pudding), and that file is a 150 x 150 thumbnail,
which store_image refuses as too small (under 200 px), so Stonehouse has NO photo from this source today. The script stays so a rerun
picks up any picture the feed adds later; it does not create an empty images.csv.

Match rule (exact, nothing fuzzy), the same as images_sizzling_pubs.py. A photo goes on a published item only when the feed record that
carries it has a name whose norm_name (after tools/uk_extract/mb_feed.clean_name, i.e. without the (V)/(VE) label) equals the item's
name, exactly one published item has that name, and either
  (a) that name occurs once among the feed's dish records, or
  (b) it occurs more than once and the photo-carrying record is the ONLY one of them whose printed energyKcalPerPortion is, character
      for character, the published item's calories (the very record the item was extracted from).
Renamed or de-duplicated items (names the extraction script gave a " (Category)" suffix) therefore get no photo.

Terms and robots (read 2026-11-17). The chain's website www.stonehouserestaurants.co.uk and the group's www.mbplc.com answer HTTP 403 to
every page from this Mac (their robots.txt also answers 403, which RFC 9309 reads as "no rules", but the pages themselves are refused),
so the terms page could NOT be read and no clause can be quoted; the refusal is not worked round (no other client, no proxy, no
headless browser). The feed host api-production.mbplc.io (robots.txt answers 404 = no rules) and the media host cdn.mbplc.io (robots.txt
answers 400 = no rules, RFC 9309) answer normally; polite_get checks both on every URL. Nothing else is fetched. Founder's decision
2026-10-06: photos are installed even where terms restrict reuse (accepted risk); here the terms are simply unknown.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402  (entries / clean_name: the same reader the nutrition came from)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "stonehouse"
FEED_URL = ("https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001496&websitePageUrlPath=main-menu1"
            "&idType=TradingEntity&salesChannel=DynamicWebMenus")
PHOTO_HOST = "https://cdn.mbplc.io/"   # the chain's media host, as named by the feed's own cdnUrl values
DEFAULT_CACHE = Path("/tmp/menumacros-images-stonehouse")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)


def printed_kcal(entry) -> str:
    """The record's own energyKcalPerPortion exactly as the feed prints it ('' when it has none). Read only to tell two records
    with the same name apart; never converted or used as a figure."""
    portions = entry.item.get("portions") or []
    nut = (portions[0].get("nutrition") or {}) if len(portions) == 1 else {}
    return str(nut.get("energyKcalPerPortion", "")).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    photo_of: dict[str, str] = {}   # item id -> cdnUrl
    try:
        feed = json.loads(polite_get(FEED_URL, args.cache, accept="application/json, text/html").decode("utf-8"))
        ents = mb.entries(feed)
        if not ents:
            raise SystemExit("the feed holds no menu items: the page changed shape, re-check before running again")
        same_name: dict[str, list] = {}
        for e in ents:
            same_name.setdefault(norm_name(mb.clean_name(e.raw)[0]), []).append(e)
        print(f"{len(ents)} dish records in feed '{feed.get('name', '').strip()}' (last modified {feed.get('lastModified')}); "
              f"{sum(1 for e in ents if e.item.get('image'))} carry a photo")

        for e in ents:
            url = (e.item.get("image") or {}).get("cdnUrl")
            if not url:
                continue
            key = norm_name(mb.clean_name(e.raw)[0])
            hits = by_name.get(key, [])
            if len(hits) != 1:
                skipped.append(f"{e.raw!r}: {len(hits)} published items named like it")
                continue
            it = hits[0]
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if len(same_name[key]) != 1:
                same_kcal = [x for x in same_name[key] if printed_kcal(x) == it["calories"].strip()]
                if len(same_kcal) != 1 or same_kcal[0] is not e:
                    skipped.append(f"{it['id']}: the name occurs {len(same_name[key])} times in the feed and the photo's record is not "
                                   f"the one printing the item's {it['calories']} kcal")
                    continue
            if not url.startswith(PHOTO_HOST) or GENERATED.search(url):
                skipped.append(f"{it['id']}: photo is not on the chain's media host or looks generated: {url}")
                continue
            photo_of[it["id"]] = url

        for item_id, url in sorted(photo_of.items()):
            if args.dry_run:
                print(f"  match {item_id}: {url}")
                continue
            try:
                fname = store_image(CHAIN_ID, polite_get(url, args.cache))
            except ValueError as err:
                skipped.append(f"{item_id}: {err}")
                continue
            rows[item_id] = (fname, FEED_URL)
    except Blocked as err:
        print(f"STOPPED: {err}. Nothing written.", file=sys.stderr)
        return 1

    for s in skipped:
        print("  skipped", s)
    if args.dry_run:
        print(f"dry run: {len(photo_of)} of {len(items)} published items would get a photo")
        return 0
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK: {f} is used by {len(ids)} items: {ids}")
    csv_path = Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID / "images.csv"
    if not rows and not csv_path.exists():
        # 2026-11-17: the feed's only picture (sticky toffee pudding) is a 150 x 150 thumbnail, too small to use; don't create an empty file
        print(f"0 of {len(items)} published items have a photo; no images.csv written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
