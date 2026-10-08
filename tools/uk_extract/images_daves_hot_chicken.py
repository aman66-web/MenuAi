#!/usr/bin/env python3
"""Item photos for Dave's Hot Chicken UK (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_daves_hot_chicken.py --cache DIR [--dry-run]

Source: https://www.daveshotchicken.co.uk/menus (robots.txt: Allow /; only /api/, /studio/, /bookings/share/ and /_next/ are disallowed).
The page's own data (the same "menuSections" array daves_hot_chicken.py reads the calories from) carries, for every item, an `image`
URL on the chain's image feed (images.weareopenr.com/<tenant>/<uuid>). The page shows that image next to the item's name and calories.
The browser fetches it through the site's /_next/image optimiser, which the chain's robots.txt disallows, so we do NOT use that path:
the original file is fetched from the image host named in the page data (that host's robots.txt answers 400 "Invalid path format",
which RFC 9309 treats as no rules; if it ever answers 401/403/429 or the image fetch is refused, polite_get raises Blocked and the
run stops: we never work round it).

Matching: a photo is attached to a published item only when the page's own entry carries exactly the same name (norm_name) and the
item's name occurs once (or only with the same photo) on the page. "Top-Loaded Fries - Small (Medium & Hot Spices)" is listed twice
with the same photo: one product, so it matches. Held-back rows (holdback.csv) are never published, so they get no photo.

Terms (https://www.daveshotchicken.co.uk/legal/terms, read 2026-10-08): "This website contains material which is owned by or licensed
to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is prohibited
other than in accordance with the copyright notice, which forms part of these terms and conditions." (no copyright notice text is
given on the site; the footer says "(c) Mind Blowing Chicken Ltd 2026. All rights reserved."). Installed under the founder's decision
of 2026-10-06 (accepted risk); the chain's photos come down the day it asks (delete the folder + images.csv).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import daves_hot_chicken as dhc  # noqa: E402
from images_common import (Blocked, ROOT, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN_ID = "daves-hot-chicken"
PAGE_URL = dhc.PAGE_URL  # https://www.daveshotchicken.co.uk/menus
IMAGE_HOST = "https://images.weareopenr.com/"
# Looked at on a contact sheet (2026-10-08): the page gives six different fountain drinks (cola, zero, diet, Dr Pepper Zero, Fanta, Sprite
# Zero) six different photo URLs that serve the same file: one generic Dave's cup of dark liquid. It does not show which drink the item is
# (a dark liquid under Fanta or Sprite Zero would be wrong), so no photo rather than a placeholder-like one. Excluded here so a rerun can't
# bring them back.
EXCLUDED = {
    "coca-cola-regular", "coca-cola-zero-regular", "diet-coke-regular", "dr-pepper-zero-regular", "fanta-regular", "sprite-zero-regular",
}


def page_photos(cache: Path) -> dict[str, set[str]]:
    """{norm_name: {image URL, ...}} from the page's own data (one request for the page, cached)."""
    raw = polite_get(PAGE_URL, cache, accept="text/html")
    tmp = cache / "menus.html"
    tmp.write_bytes(raw)
    out: dict[str, set[str]] = {}
    for section in dhc.read_payload(raw.decode("utf-8")):
        for it in section["items"]:
            url = (it.get("image") or "").strip()
            if url:
                out.setdefault(norm_name(it["name"]), set()).add(url)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true", help="list the matches and stop: no photo is downloaded or stored")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    photos = page_photos(args.cache)
    matches: dict[str, str] = {}
    skipped = []
    for it in items:
        if it["id"] in EXCLUDED:
            skipped.append((it["id"], "the chain's file is one generic cup shared by six different drinks"))
            continue
        urls = photos.get(norm_name(it["name"]), set())
        if len(urls) == 1:
            url = next(iter(urls))
            if not url.startswith(IMAGE_HOST):
                skipped.append((it["id"], f"image on an unexpected host: {url}"))
                continue
            matches[it["id"]] = url
        else:
            skipped.append((it["id"], "no photo on the page" if not urls else "the name has several different photos"))
    print(f"{len(matches)} of {len(items)} published items match a photo on {PAGE_URL}")
    for item_id, url in matches.items():
        print(f"  {item_id}  <-  {url}")
    for item_id, why in skipped:
        print(f"  SKIPPED {item_id}: {why}")
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
