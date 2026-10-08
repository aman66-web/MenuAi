#!/usr/bin/env python3
"""Item photos for Greene King from its own pub menu pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_greene_king.py --cache DIR [--dry-run]

Source: the menu data that each Greene King pub page loads. A pub's menu page is
    https://www.greeneking.co.uk/pubs/<county>/<pub>/menu
and it contains the pub's Sitecore/SmartChef site id (the "siteid=NNNN" of its "View Allergen Info" link). The page then calls the
chain's own JSON endpoint
    https://www.greeneking.co.uk/api/menus/getmenus/<site id>
which lists every menu of that pub (Main, Lunch, Desserts, Kids', Sunday...), each product with `name`, `image` (a URL on the chain's
own content hub, https://gkbr-p-001.sitecorecontenthub.cloud/api/public/content/<id>?v=<version>, or "" when the dish has no photo) and
`portions[].calories`. The photo is fetched exactly as the feed gives it (no `t=` resize transform), so store_image makes the only change.

Why a sample of pubs. Every pub prints its own menu and the chain has 748 pub menu pages; reading them all would be crawling. This reads a
fixed list of 35 pubs (every 25th pub menu page of the chain's sitemap, plus 5 pubs looked at while scoping), 2 requests per pub at
1 request/second. The set is a sample, so coverage is partial by design.

Match rule (exact, nothing fuzzy). The guide behind our data is the spring/summer 2024 Pub & Social core menu; the pubs' menus have moved on
(same name, different calories, or a side with the main's name: "Mac & Cheese" is 745 kcal as a main in our guide and 315 kcal as a side on a
pub menu). So a photo is attached to a published item only when
  1. a product with a photo has a name whose norm_name equals the item's name in the CURRENT items.csv, and
  2. one of that product's portions states exactly the item's calories (so it is the same dish and portion, not a kids' or side version), and
  3. exactly one photo file qualifies for that item (the most common photo across the sampled pubs; a tie gives no photo), and
  4. the item's name is unique among published items.
Everything else gets no photo.

Terms (https://www.greeneking.co.uk/terms-conditions, "Website Terms of Use", 5. Intellectual property, read 2026-10-08): "The content and
design of these website pages are subject to copyright owned by us. You are welcome to print pages for your personal use but no part of this
website, our logos or trademarks may be reproduced or transmitted in any way for any other purpose." Installed on the founder's decision of
2026-10-06 (the founder's accepted risk); a chain's photos come down the day it asks.
robots.txt: https://www.greeneking.co.uk/robots.txt (read 2026-10-08) disallows /App_Data/, /masterpages/, /bin/, /config/, /css/, /data/,
/js/, /images/, /includes/, /media/, /Properties/, /scripts/, /sitecore/ ... and says nothing about /pubs/ or /api/menus/.
https://gkbr-p-001.sitecorecontenthub.cloud/robots.txt is "User-agent: * / Disallow: / / Allow: /api/public/" and the photos are under
/api/public/content/. polite_get checks both on every URL.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "greene-king"
BASE = "https://www.greeneking.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-greene-king")
PUBS = [
    "middlesex/middlesex-arms", "west-yorkshire/new-inn", "lancashire/lane-ends", "lancashire/counting-house", "east-sussex/chequers",
    "west-glamorgan/pub-on-the-pond", "devon/dartbridge-inn", "greater-london/golden-lion", "buckinghamshire/white-hart",
    "hampshire/bold-forester", "hampshire/red-lion-stubbington", "kent/oak", "gloucestershire/bishops-tavern", "west-sussex/star",
    "hertfordshire/old-red-lion", "cambridgeshire/george-hotel", "greater-london/masons-arms", "greater-london/rose-and-crown",
    "greater-london/travellers-tavern", "greater-manchester/royal-oak", "northamptonshire/abington", "avon/wackum-inn",
    "south-yorkshire/tut-n-shive", "oxfordshire/black-horse", "essex/town-crier", "essex/duke-of-wellington", "berkshire/white-swan",
    "west-midlands/nickelodeon", "nottinghamshire/tap-and-tumbler", "merseyside/shrewsbury-arms",
    # looked at while scoping
    "greater-london/rutland-arms", "middlesex/crown-and-horseshoes", "greater-manchester/kings-ransom", "wiltshire/royal-oak",
    "lancashire/washington",
]
DROP_ITEMS: dict[str, str] = {}   # items looked at after the first run and left without a photo (a rerun must not bring them back)
SKIP_PHOTOS: dict[str, str] = {}  # photo id -> why it is not used

SITE_ID = re.compile(r"siteid=(\d+)")
PHOTO = re.compile(r"^https://gkbr-p-001\.sitecorecontenthub\.cloud/api/public/content/(?P<id>[0-9a-f]{32})(?:\?v=[0-9a-f]+)?$")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the menus and print the matches; download and write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    names = Counter(norm_name(i["name"]) for i in items)
    by_name = {norm_name(i["name"]): i for i in items if names[norm_name(i["name"])] == 1}

    candidates: dict[str, list[tuple[str, str, str]]] = defaultdict(list)   # item id -> [(photo id, photo url, pub menu page)]
    try:
        for pub in PUBS:
            page = f"{BASE}/pubs/{pub}/menu"
            html = polite_get(page, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            m = SITE_ID.search(html)
            if not m:
                print(f"  {pub}: no site id on the page, skipped")
                continue
            menus = json.loads(polite_get(f"{BASE}/api/menus/getmenus/{m.group(1)}", args.cache, accept="application/json"))
            for menu in menus or []:
                for cat in menu.get("categories") or []:
                    for prod in cat.get("products") or []:
                        url = (prod.get("image") or "").strip()
                        pm = PHOTO.match(url)
                        item = by_name.get(norm_name(prod.get("name", "")))
                        if not pm or item is None or pm["id"] in SKIP_PHOTOS or item["id"] in DROP_ITEMS:
                            continue
                        kcal = {po.get("calories") for po in (prod.get("portions") or [])}
                        if int(float(item["calories"])) in kcal:
                            candidates[item["id"]].append((pm["id"], url, page))
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1

    chosen: dict[str, tuple[str, str, str]] = {}
    for item_id, found in candidates.items():
        counts = Counter(f[0] for f in found).most_common()
        if len(counts) > 1 and counts[0][1] == counts[1][1]:
            print(f"  {item_id}: {len(counts)} different photos with equal support, none used")
            continue
        photo_id = counts[0][0]
        first = sorted(f for f in found if f[0] == photo_id)[0]
        chosen[item_id] = first
        print(f"  {item_id}: photo {photo_id} seen in {counts[0][1]} pub menu(s), other photos {len(counts) - 1}")
    print(f"{len(chosen)} of {len(items)} published items have a matching photo ({len(PUBS)} pubs read)")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (photo_id, url, page) in sorted(chosen.items()):
            try:
                rows[item_id] = (store_image(CHAIN_ID, polite_get(url, args.cache)), page)
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
