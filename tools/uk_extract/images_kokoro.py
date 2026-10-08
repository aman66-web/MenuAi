#!/usr/bin/env python3
"""Item photos for Kokoro (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_kokoro.py --cache DIR [--dry-run]

STATUS 2026-10-08: the matching below works (--dry-run lists it) but NO photo is installed, because every photo is served only from the
Webflow CDN https://cdn.prod.website-files.com/ and its robots.txt answers HTTP 403 AccessDenied (an object-store "no such key" reply, so
probably "no robots file", but images_common treats a 403 on robots.txt as "do not fetch" for any host that is not an S3 bucket name or
a CDN MissingKey/NoSuchKey reply). polite_get therefore raises Blocked on the first photo, this script stops and writes nothing. It was NOT
worked round. The same host stopped the logo (web/public/logos/kokoro.source.txt). To install: the founder or orchestrator decides that this
403 means "no robots.txt" (then add the host to the exception in images_common._robots_allow) and reruns this script.

Source: https://www.kokorouk.com/menu (robots.txt of www.kokorouk.com is empty = no rules, read 2026-10-08). The page lists one card per dish:
`<div category=... class="div-block-87 _w-dyn-item"><img class="item-img" src=PHOTO> ... <div class="body-4">NAME</div> ...
<div class="item-kcal">NNN</div><div class="item-large-kcal">NNN</div>`. A photo is attached to a published item only when the card's name
equals the item's name (norm_name), the name is unique on the page, and the item's calories equal the card's regular or large kcal.

Terms (https://www.kokorouk.com/terms, read 2026-10-08): lists as prohibited use "using any automated means to monitor or copy the
website or its content" and says "A wide range of intellectual property rights are used in and relating to this website, including: ...
the design, text, graphics and other content of the web pages on this website". Founder's decision of 2026-10-06 (accepted risk) applies.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (Blocked, ROOT, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN_ID = "kokoro"
# Left out without looking (no photo could be downloaded): the card's photo FILE NAME names a different dish than the card, so it is
# not certain the picture shows this item. Look at a contact sheet of the rest before installing (e.g. "Layer 1.jpg", "pancake1.jpg").
EXCLUDE = {"crabstick-tobiko-and-mayo-onigiri"}  # file name says "TUNA, TOBIKO & MAYO ONIGIRI (2)"
PAGE_URL = "https://www.kokorouk.com/menu"
PHOTO_HOST = "https://cdn.prod.website-files.com/"

_CARD = re.compile(r'<div category="[^"]*" class="div-block-87')
_IMG = re.compile(r'<img[^>]*src="([^"]+)"[^>]*class="item-img"')
_NAME = re.compile(r'<div class="body-4">(.*?)</div>', re.S)
_KCAL = re.compile(r'<div class="item-kcal">\s*(\d*)\s*</div>')
_LARGE = re.compile(r'<div class="item-large-kcal">\s*(\d*)\s*</div>')


def page_cards(page: str) -> list[dict]:
    cards = []
    for chunk in _CARD.split(page)[1:]:
        chunk = chunk[:6000]
        img, name = _IMG.search(chunk), _NAME.search(chunk)
        if not (img and name):
            continue
        url = html.unescape(img.group(1))
        k, lg = _KCAL.search(chunk), _LARGE.search(chunk)
        cards.append({"name": " ".join(html.unescape(re.sub(r"<[^>]+>", " ", name.group(1))).split()),
                      "photo": url if url.startswith(PHOTO_HOST) else None,
                      "kcal": {x.group(1) for x in (k, lg) if x and x.group(1)}})
    return cards


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true", help="list the matches and stop: no photo is downloaded or stored")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    page = polite_get(PAGE_URL, args.cache, accept="text/html").decode("utf-8", "replace")
    cards = page_cards(page)
    print(f"{len(cards)} dish cards on {PAGE_URL}, {sum(1 for c in cards if c['photo'])} with a photo")
    by_name: dict[str, list[dict]] = {}
    for c in cards:
        by_name.setdefault(norm_name(c["name"]), []).append(c)

    matches: dict[str, str] = {}
    for it in items:
        if it["id"] in EXCLUDE:
            continue
        found = by_name.get(norm_name(it["name"]), [])
        if len(found) != 1 or not found[0]["photo"]:
            if len(found) > 1:
                print(f"  SKIPPED {it['id']}: {len(found)} cards with this name")
            continue
        if str(it["calories"]).strip() not in found[0]["kcal"]:
            print(f"  SKIPPED {it['id']}: card kcal {sorted(found[0]['kcal'])}, item has {it['calories']}")
            continue
        matches[it["id"]] = found[0]["photo"]
    item_names = {norm_name(i["name"]) for i in items}
    print(f"{len(matches)} of {len(items)} published items match a card with a photo")
    for item_id, url in matches.items():
        print(f"  {item_id}  <-  {url}")
    for c in cards:
        if norm_name(c["name"]) not in item_names:
            print(f"  card with no published item of that name: {c['name']}")
    if args.dry_run:
        print("dry run: nothing downloaded")
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, url in matches.items():
            try:
                raw = polite_get(url, args.cache, referer=PAGE_URL)
                rows[item_id] = (store_image(CHAIN_ID, raw), PAGE_URL)
            except ValueError as e:
                print(f"  not stored {item_id}: {e}")
    except Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing is written and no photo is installed.")
        return 2
    write_images_csv(CHAIN_ID, rows)
    total = sum(p.stat().st_size for p in (ROOT / "web" / "public" / "menu-images" / CHAIN_ID).glob("*.webp"))
    print(f"stored {len(rows)} of {len(items)} items; {len({f for f, _ in rows.values()})} files, {total / 1024:.0f} KB")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  SHARED by {len(ids)} items: {f} {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
