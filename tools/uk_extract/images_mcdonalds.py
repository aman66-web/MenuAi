#!/usr/bin/env python3
"""Item photos for McDonald's UK from its own product pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_mcdonalds.py --cache DIR [--dry-run]

Source. Every published McDonald's item was read from its own product page, https://www.mcdonalds.com/gb/en-gb/product/<slug>.html (the
item's notes in items.csv say "Read from <that page>"). That read was done page by page in the founder's own Chrome on 2026-10-09
(data/chrome-inbox/QUEUE.md; mcdonalds.com answers 403 to scripts, see below), and the same read recorded, for each page, the product name the
page prints and the address of the product's own photo, copied from the page's own request log: data/chrome-inbox/mcdonalds/images.csv
(`name,page_url,image_url`). Every photo address is on McDonald's own Scene7 image account, https://s7d1.scene7.com/is/image/mcdonalds/<asset>
(the account the product pages themselves load the picture from). This script reads that list (nothing on mcdonalds.com is requested) and
fetches each photo file from that account with polite_get.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the list row's page_url is the page the item itself was read from (the "Read from <url>" in its notes): the same product record, and
  2. the list row's name, as that page prints it, has the same norm_name as the item's name, and exactly one row does, and
  3. the photo address is under https://s7d1.scene7.com/is/image/mcdonalds/ (McDonald's own image account),
and it is not in DROP_ITEMS (photos looked at on contact sheets and left out; a rerun must not bring them back).
source_url in images.csv is the product page that shows the photo for that item.

robots.txt (read 2026-11-17 from this Mac): https://www.mcdonalds.com/robots.txt answers 403 (RFC 9309 and the founder's decision of 2026-10-12: a 4xx
for robots.txt means no rules), and the product page itself answers 403 to a script (tried once, https://www.mcdonalds.com/gb/en-gb/product/big-mac.html,
2026-11-17): a refusal, so this script requests NOTHING from www.mcdonalds.com and does not try to work round it. The Chrome read of 2026-10-09 recorded
the robots.txt as disallowing only /config/, /utility/, /content/prelaunch/, /prelaunch/ and one US page (/gb/ product pages allowed).
https://s7d1.scene7.com/robots.txt answers 404 (no rules); polite_get checks robots.txt before every fetch (RFC 9309), paces 1 request a second
and stops on 401/403/429.

Terms (https://www.mcdonalds.com/gb/en-gb/terms-and-conditions.html, section 8 "Acceptable uses and restrictions for the online services", as read in the
founder's Chrome on 2026-10-09 and recorded in data/chrome-inbox/mcdonalds/terms-note.txt; the page could not be re-read on 2026-11-17 because the host
answers 403 to scripts): a visitor may not "d) Use, copy, distribute, republish, display, disclose, upload, post, or transmit the online services in any
commercial manner;" nor "h) Use or launch any unauthorised technology or automated system to access the online services or extract content from the online
services, including but not limited to spiders, robots, screen scrapers, or offline readers;" (the "online services" include their content). An express
restriction; installed on the founder's decision of 2026-10-06 (his accepted risk, CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "mcdonalds"
LIST_PATH = ROOT / "data" / "chrome-inbox" / "mcdonalds" / "images.csv"
PHOTO_PREFIX = "https://s7d1.scene7.com/is/image/mcdonalds/"
PAGE_PREFIX = "https://www.mcdonalds.com/gb/en-gb/product/"
DEFAULT_CACHE = Path("/tmp/menumacros-images-mcdonalds")
NOTE_PAGE = re.compile(r"Read from (https://\S+)")

# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back.
# (a) the picture is another company's branded cup, bottle, carton or sachet (Coca-Cola, Fanta, Sprite, Oasis, IRN-BRU, Tropicana, Robinsons,
#     smartwater, Deep RiverRock, Brecon Carreg, Canderel, Arla): a third-party brand's pack, not a photo of the food (the "Pepsi can" rule).
#     (Coca-Cola Classic's picture reads "ORIGINAL TASTE" although its file is named "...Zero-Sugar...FIFA-promo"; Deep RiverRock 330ml's file is
#     the 250ml bottle: both out under this rule anyway.) Kept on purpose: McDonald's and McCafé's own cups, boxes, sleeves and dip pots, the McFlurry
#     cups (a McDonald's product with the ice cream in view), the McCafé "x Sprite Zero" cups (the drink in view), Flahavan's oats in McDonald's own pot.
THIRD_PARTY_PACK = """coca-cola-classic-small coca-cola-classic-medium coca-cola-classic-large coca-cola-zero-sugar-small coca-cola-zero-sugar-medium
coca-cola-zero-sugar-large diet-coke-small diet-coke-medium diet-coke-large sprite-zero-small sprite-zero-medium sprite-zero-large fanta-orange-zero-small
fanta-orange-zero-medium fanta-orange-zero-large oasis-summer-fruits-zero-small oasis-summer-fruits-zero-medium oasis-summer-fruits-zero-large irn-bru-small
irn-bru-medium irn-bru-large tropicana-apple-juice tropicana-orange-juice robinsons-fruit-shoot smartwater-still-600ml deep-riverrock-water-330ml
deep-riverrock-water-500ml brecon-carreg-natural-mineral-water-still-330ml canderel-yellow-sweetener organic-milk""".split()
DROP_ITEMS: dict[str, str] = {}
DROP_ITEMS.update({i: "the picture is another company's branded pack (cup, bottle, carton or sachet), not a photo of the food" for i in THIRD_PARTY_PACK})
# Independent check (2026-11-17): two more packs with no McDonald's branding and no food in view, left out like the ones above.
DROP_ITEMS["milk-portion"] = "the picture is a supplier's printed milk-stick sachet (no McDonald's branding, no food in view), not a photo of the food"
DROP_ITEMS["semi-skimmed-milk-250ml"] = "the picture is a supplier's labelled milk bottle (no McDonald's branding), like the dropped Organic Milk carton"


def read_list() -> dict[str, list[dict]]:
    """The 2026-10-09 read's photo list, grouped by product page."""
    with open(LIST_PATH, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows or not {"name", "page_url", "image_url"} <= set(rows[0]):
        raise SystemExit(f"{LIST_PATH}: header must be name,page_url,image_url")
    by_page: dict[str, list[dict]] = {}
    for r in rows:
        by_page.setdefault(r["page_url"].strip(), []).append({k: (v or "").strip() for k, v in r.items()})
    return by_page


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_page = read_list()
    print(f"{sum(len(v) for v in by_page.values())} photo addresses on {len(by_page)} product pages in {LIST_PATH.relative_to(ROOT)}")
    skipped: list[str] = []
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    for it in items:
        if it["id"] in DROP_ITEMS:
            skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
            continue
        m = NOTE_PAGE.search(it.get("notes", ""))
        if not m or not m.group(1).startswith(PAGE_PREFIX):
            skipped.append(f"{it['id']}: notes name no McDonald's product page")
            continue
        page = m.group(1)
        same = [r for r in by_page.get(page, []) if norm_name(r["name"]) == norm_name(it["name"])]
        if len(same) != 1:
            skipped.append(f"{it['id']}: {len(same)} rows of the list name {it['name']!r} on {page}")
            continue
        url = same[0]["image_url"]
        if not url.startswith(PHOTO_PREFIX) or len(url) <= len(PHOTO_PREFIX):
            skipped.append(f"{it['id']}: photo address {url!r} is not on McDonald's own Scene7 account")
            continue
        matched[it["id"]] = (url, page)

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (url, page) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:52} {url.rsplit('/', 1)[-1]}")
                continue
            raw = polite_get(url, args.cache, referer=page)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page)
            print(f"  {item_id:52} {fname}  <- {url.rsplit('/', 1)[-1]}")
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
