#!/usr/bin/env python3
"""Item photos for Wenzel's the Bakers from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wenzels.py [--cache DIR] [--dry-run]

Source: https://www.wenzels.co.uk/menu/ (the chain's own in-store menu page). Its "All Products" list is one card per
product: <div class="product-item"> with the product photo (<img src=... alt=NAME>) and the product name (<h4>NAME</h4>).
One request for the page, then one request per photo.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when
  1. exactly one published item has the card's name (images_common.norm_name equality) and the page has no other card
     with that name and a different photo (two cards, two photos = ambiguous = no photo);
  2. the card's <img alt> and <h4> carry the same name;
  3. the photo downloads as a real photo (store_image: >= 200 px, a still JPEG/PNG/WebP).
So "Sausage Roll" gets the card "Sausage Roll", and "Hashbrowns" does NOT get the card "2 Hash Browns" (another product).
Photos used by 2 or more items are reported (normal only for variants of one product).
EXCLUDE below lists anything looked at on a contact sheet and left out (logo, sticker, not the item); a rerun keeps them out.

Terms and robots (read 2026-10-08):
  * https://www.wenzels.co.uk/terms-conditions/ , clause 5 "Intellectual property rights": "All copyright and other
    intellectual property rights in the Website and its content belong exclusively to Wenzel's The Bakers Ltd. By accessing
    the Website, you agree that you will access the content for your personal non-commercial use only. None of the content
    may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without the consent of Wenzels The
    Bakers Ltd." That is an express restriction. Installed on the founder's standing decision of 2026-10-06 (CLAUDE.md rule
    2: photos are installed even where a chain's terms restrict reuse; the founder's accepted risk); the chain's photos come
    down the day it asks (delete web/public/menu-images/wenzels/ and data/source/wenzels/images.csv).
  * robots.txt of www.wenzels.co.uk: "Crawl-delay: 10" and, for all agents, "Disallow: /wp-json/" and
    "Disallow: /?rest_route=". /menu/ and /wp-content/uploads/ are allowed. This script waits 10 seconds between requests
    (the crawl delay) and checks every URL with the RFC 9309 matcher in images_common.polite_get.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wenzels"
MENU_URL = "https://www.wenzels.co.uk/menu/"
DELAY = 10.0   # robots.txt: Crawl-delay: 10
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wenzels")
CARD = re.compile(r'<div class="product-item"[^>]*>(.*?)<p class="price">', re.S)
CARD_IMG = re.compile(r'<img[^>]*\ssrc="([^"]+)"[^>]*\salt="([^"]*)"')
CARD_NAME = re.compile(r"<h4>(.*?)</h4>", re.S)

# item_id -> why it was left out after looking at the contact sheet (keeps a rerun from bringing it back)
EXCLUDE: dict[str, str] = {
    "multiseed-sourdough": "the chain's photo carries a 'Buy 1 Get 1 Half Price' promotional sticker",
    "premium-ham-filled-baguette": "the chain's photo carries a small meat-icon badge overlay",
    "egg-and-cress-baguette": "the chain's photo carries a small vegetable-icon (dietary) badge overlay",
    "chicken-slice": "the chain uses one photo (a cut-open pastry with one filling) for both Chicken Slice and Steak Slice: cannot tell which it shows",
    "steak-slice": "the chain uses one photo (a cut-open pastry with one filling) for both Chicken Slice and Steak Slice: cannot tell which it shows",
}


def cards(page: str) -> list[dict]:
    out = []
    for body in CARD.findall(page):
        img = CARD_IMG.search(body)
        name = CARD_NAME.search(body)
        if not img or not name:
            continue
        title = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", name.group(1))).split())
        alt = " ".join(html.unescape(img.group(2)).split())
        out.append({"name": title, "alt": alt, "photo": html.unescape(img.group(1))})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="list the matches; download no photo")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)

    try:
        page = polite_get(MENU_URL, args.cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except Blocked as e:
        print(f"STOP: {e}", file=sys.stderr)
        return 1
    cs = cards(page)
    by_card: dict[str, list[dict]] = {}
    for c in cs:
        by_card.setdefault(norm_name(c["name"]), []).append(c)
    print(f"{len(cs)} product cards on {MENU_URL}")

    matches: dict[str, dict] = {}
    for key, its in sorted(by_name.items()):
        cands = by_card.get(key)
        if not cands:
            continue
        if len(its) != 1 or len({c["photo"] for c in cands}) != 1:
            print(f"no photo (ambiguous name {key!r}): items {[i['id'] for i in its]}, photos {sorted({c['photo'] for c in cands})}")
            continue
        c = cands[0]
        if norm_name(c["alt"]) != key:
            print(f"no photo (card alt {c['alt']!r} differs from its name {c['name']!r}): {its[0]['id']}")
            continue
        if its[0]["id"] in EXCLUDE:
            print(f"no photo (excluded: {EXCLUDE[its[0]['id']]}): {its[0]['id']}")
            continue
        matches[its[0]["id"]] = c
    print(f"{len(matches)} of {len(items)} published items match a product card exactly")
    for item_id, c in matches.items():
        print(f"  match: {item_id} <- {c['name']!r} {c['photo']}")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, c in matches.items():
            try:
                fname = store_image(CHAIN_ID, polite_get(c["photo"], args.cache, delay=DELAY, referer=MENU_URL))
            except ValueError as e:
                print(f"no photo: {item_id}: {e}")
                continue
            rows[item_id] = (fname, MENU_URL)
    except Blocked as e:
        print(f"STOP: {e} (nothing written)", file=sys.stderr)
        return 1

    for f, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"shared photo {f}: {ids}")
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
