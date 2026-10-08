#!/usr/bin/env python3
"""Item photos for Everyman Cinemas from the chain's own Food & Drink page (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_everyman.py --cache DIR [--dry-run]

Source: https://www.everymancinema.com/food-and-drink/ (the page the menu-details calories page links to as "Food & drink").
It shows a gallery of food and drink photos (3 wide category banners "Lifestyle", "Burger", "Snacking Plates" and 18 dish tiles); each <img> carries the CMS "alt" text that names the dish
(e.g. alt="Hot Honey Halloumi"). The per-venue menu pages (/food-and-drink/<venue>/) only link a PDF menu, with no photos, so
this one page is the only source. Photos are fetched from the file the page names, on the chain's own CMS host
(https://cms-assets.webediamovies.pro/production/279/<id>.jpg, the original, not the CDN's resize transform).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the photo's alt text and the item's name are
equal under norm_name and the name is unique among published items. Of the 18 dish tiles only four are named exactly like an item
(Hot Honey Halloumi, Standard Fries, Burnt Basque Cheesecake, Peach Iced Tea). The others ("Popcorn", "Matcha", "Malted Shakes",
"Signature Smokehouse BBQ Beef Burger" vs our "Signature Smokehouse BBQ Burger", "Smashed Burger and Fries" ...) are not the same
name as any item and get no photo.

Terms (https://www.everymancinema.com/terms-and-conditions/, "Terms and Conditions", clause 8.3, read 2026-10-08): "The Website and the
materials on it are protected by copyright, trade mark and other intellectual property rights and laws throughout the world. The
materials on the Website are owned by or licensed to us and may not be copied, reproduced, republished, uploaded, posted, transmitted or
distributed in any way without our consent." Installed on the founder's decision of 2026-10-06 (the founder's accepted risk); a
chain's photos come down the day it asks.
robots.txt: https://www.everymancinema.com/robots.txt (read 2026-10-08) disallows /theaters/, /cms-preview/, /offline/, a few film
listing pages and "/*?strictlyInTags=*"; nothing about /food-and-drink/. https://cms-assets.webediamovies.pro/robots.txt does not
exist (answers the site's HTML shell with 200), so no rules.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "everyman"
PAGE = "https://www.everymancinema.com/food-and-drink/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-everyman")
DROP_ITEMS: dict[str, str] = {}   # item ids looked at after the first run and left without a photo (a rerun must not bring them back)

IMG = re.compile(r'<img alt="(?P<alt>[^"]*)"[^>]*? src="https://cms-assets\.webediamovies\.pro/cdn-cgi/image/[^"/]*/production/279/(?P<id>[0-9a-f]{32})\.jpg"')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the page and print the matches; download no photo and write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    names = Counter(norm_name(i["name"]) for i in items)
    by_name = {norm_name(i["name"]): i for i in items if names[norm_name(i["name"])] == 1}

    try:
        page_html = polite_get(PAGE, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1

    tiles = [(html.unescape(m["alt"]).strip(), m["id"]) for m in IMG.finditer(page_html)]
    print(f"{len(tiles)} photos with a name on {PAGE}")
    chosen: dict[str, tuple[str, str]] = {}
    for alt, photo_id in tiles:
        item = by_name.get(norm_name(alt))
        if item is None:
            print(f"  no item named '{alt}': skipped")
            continue
        if item["id"] in DROP_ITEMS:
            print(f"  {item['id']}: dropped ({DROP_ITEMS[item['id']]})")
            continue
        chosen[item["id"]] = (f"https://cms-assets.webediamovies.pro/production/279/{photo_id}.jpg", alt)
        print(f"  {item['id']}: '{alt}' -> photo {photo_id}")
    print(f"{len(chosen)} of {len(items)} published items have a matching photo")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (url, alt) in sorted(chosen.items()):
            try:
                rows[item_id] = (store_image(CHAIN_ID, polite_get(url, args.cache, referer=PAGE)), PAGE)
            except ValueError as e:
                print(f"  {item_id}: {e}, no photo")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    write_images_csv(CHAIN_ID, rows)
    shared = suspected_placeholders(rows)
    print(f"wrote {len(rows)} photos; shared by 4+ items: {shared or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
