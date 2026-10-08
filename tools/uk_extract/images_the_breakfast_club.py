#!/usr/bin/env python3
"""Item photos for The Breakfast Club (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_the_breakfast_club.py --cache <dir> --dry-run   # list matches, download no photo
    python3 tools/uk_extract/images_the_breakfast_club.py --cache <dir>             # download, store, write images.csv

STATUS (2026-10-08): the real run STOPS at the first photo. See "Blocked" below. The dry run works and lists what would be attached.

Source: the chain's own online-ordering storefront, linked from thebreakfastclubcafes.com ("Order"): a Slerp-hosted white-label store at
https://thebreakfastclub.slerp.com/order/store/the-breakfast-club-spitalfields ("The Breakfast Club Spitalfields | Order breakfast platters").
The chain's main site (thebreakfastclubcafes.com, Squarespace) has NO per-item photos: its /menu page embeds the three menu PDFs and one
background photo. The Slerp store page builds its menu in the browser, so the page must be rendered once by a browser; this script reads
that rendered HTML (the DOM after the page loaded), saved as `<cache>/slerp-spitalfields.html`:

    node <playwright script> https://thebreakfastclub.slerp.com/order/store/the-breakfast-club-spitalfields <cache>/slerp-spitalfields.html

Every dish card on that page is `<img alt="Order {dish name} online" src=".../uploads/images/variant/.../...jpg_original.jpg">`. A card's
photo goes to the published item whose name equals the dish name (norm_name equality) and to no other. Names that appear twice with
different photos get none. Not matched on purpose (the storefront names a different product, e.g. the sizes "Three Hash Browns & 1 Dip",
"Smoked Salmon" (a side, not "Smoked Salmon, Avo & Eggs"), "Crispy Bacon x 2" (two rashers, not our "Bacon"), "BC Beans" (not "Harissa Beans")).

Blocked: the photos are on assets.slerp.com (Slerp's CDN). Its /robots.txt answers HTTP 403 (a CloudFront "AccessDenied" XML body, not a
"MissingKey"/"NoSuchKey" body and not an amazonaws.com host), which images_common.polite_get treats as "do not fetch" and raises Blocked.
This script does NOT work round that: whether a 403 on a CDN's robots.txt counts like the S3/MissingKey cases images_common already
exempts is for the founder / main session to decide.
The storefront's own robots.txt (thebreakfastclub.slerp.com) has no Disallow lines. thebreakfastclubcafes.com robots.txt (Squarespace
standard) disallows only /config, /search, /account, /api/, /static/ and some ?format= queries.

Terms: no terms-of-use / legal page exists on thebreakfastclubcafes.com (404 on /terms etc.; the Squarespace site config has
termsOfService: null, privacyPolicy: null) or on the Slerp storefront (no footer links; /terms 404). Nothing about images was found to quote.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "the-breakfast-club"
PAGE_URL = "https://thebreakfastclub.slerp.com/order/store/the-breakfast-club-spitalfields"
SNAPSHOT = "slerp-spitalfields.html"
# Item ids never given a photo (checked by eye after a download), e.g. {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_IMG = re.compile(r"<img\b[^>]*>")


def read_cards(page: str) -> list[tuple[str, str]]:
    """[(dish name, photo url)] for every dish card of the rendered store page."""
    out = []
    for tag in _IMG.findall(page):
        m = re.search(r'\balt="Order (.+?) online"', tag)
        s = re.search(r'\bsrc="([^"]+/uploads/images/variant/[^"]+)"', tag)
        if m and s:
            out.append((htmllib.unescape(m.group(1)), htmllib.unescape(s.group(1))))
    return out


def match(cards: list[tuple[str, str]], items: list[dict]) -> tuple[dict[str, str], list[str]]:
    notes: list[str] = []
    by_name: dict[str, set] = {}
    for name, url in cards:
        by_name.setdefault(ic.norm_name(name), set()).add(url)
    item_by_name: dict[str, list[dict]] = {}
    for it in items:
        item_by_name.setdefault(ic.norm_name(it["name"]), []).append(it)
    out: dict[str, str] = {}
    for key, urls in by_name.items():
        its = item_by_name.get(key, [])
        label = next(n for n, _ in cards if ic.norm_name(n) == key)
        if not its:
            notes.append(f"{label}: on the store page, no published item with exactly this name")
        elif len(urls) != 1 or len(its) != 1:
            notes.append(f"{label}: ambiguous ({len(urls)} photos, {len(its)} items) -> none")
        elif its[0]["id"] in EXCLUDE:
            notes.append(f"{label}: excluded ({EXCLUDE[its[0]['id']]})")
        else:
            out[its[0]["id"]] = next(iter(urls))
    return out, notes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    snap = args.cache / SNAPSHOT
    if not snap.exists():
        print(f"Missing {snap}: render {PAGE_URL} in a browser and save the DOM there (see the docstring)")
        return 2
    items = ic.load_items(CHAIN_ID)
    cards = read_cards(snap.read_text(encoding="utf-8"))
    matches, notes = match(cards, items)
    names = {i["id"]: i["name"] for i in items}
    print(f"{len(items)} published items; {len(cards)} dish cards on the store page; {len(matches)} exact-name matches")
    for iid, url in sorted(matches.items()):
        print(f"  MATCH {names[iid]}  <-  {url}")
    for n in notes[:40]:
        print("  skip:", n)
    if args.dry_run:
        return 0
    rows: dict[str, tuple[str, str]] = {}
    try:
        for iid, url in sorted(matches.items()):
            raw = ic.polite_get(url, args.cache, referer=PAGE_URL)
            rows[iid] = (ic.store_image(CHAIN_ID, raw), PAGE_URL)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopping: not worked round. Nothing was stored and no images.csv was written.")
        return 3
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"stored {len(rows)} photos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
