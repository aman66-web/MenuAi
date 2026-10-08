#!/usr/bin/env python3
"""Item photos for Oodles Wok (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_oodles_wok.py --cache DIR [--dry-run]

Source: https://oodleswok.co.uk/our-food/ (robots.txt: Allow /, only /api/ is disallowed). The page is Next.js server-rendered and
embeds its menu as JSON (self.__next_f.push): one product record per dish with `slug`, `title`, `category` and `image`, the image
being a file on the chain's own ordering host https://app.oodleshub.co.uk/storage/products/... (the host the site itself loads
these photos from; its robots.txt has an empty Disallow). The nutrition page we take the numbers from
(https://oodleswok.co.uk/nutritional-information/) names each dish card with that same product slug and title, and prints one row
per portion size (Value / Regular / Large): the three sizes of a dish are the same product record, so they share the product's photo.

Matching: a published item gets a photo only when its dish name (the item name without the "(Value)/(Regular)/(Large)" size) is
the same, by norm_name, as the title of ONE product record whose category is the item's own category. "Wok-Fired Beef" exists twice
on the menu (the dry dish and a bao filling): the category check picks the dry dish only. Nothing is matched by closeness.
Held-back rows (holdback.csv) are never published, so they get no photo.

Terms (https://oodleswok.co.uk/terms, read 2026-10-08): "All published material and intellectual property are copyrighted and owned
by us. These works are protected by copyright laws and all rights are reserved. Our material must not be used, reproduced or stored
in any other website or included in any public or private system/service, without the express written permission of Oodles Chinese
Holdings Ltd." Installed under the founder's decision of 2026-10-06 (accepted risk); the chain's photos come down the day it asks
(delete the folder + images.csv).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (Blocked, ROOT, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN_ID = "oodles-wok"
PAGE_URL = "https://oodleswok.co.uk/our-food/"
IMAGE_HOST = "https://app.oodleshub.co.uk/storage/products/"
SIZE_SUFFIX = re.compile(r"\s*\((?:Value|Regular|Large)\)\s*$")
PRODUCT = re.compile(r'\{"slug":"([^"]+)","title":"([^"]+)","category":"([^"]+)","alsoIn":\[[^\]]*\],"image":"([^"]*)"')


def page_products(cache: Path) -> list[tuple[str, str, str, str]]:
    """[(slug, title, category slug, image URL)] from the page's own embedded data (one request, cached)."""
    raw = polite_get(PAGE_URL, cache, accept="text/html").decode("utf-8", "replace")
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', raw, flags=re.S)
    flight = "".join(json.loads('"' + c + '"') for c in chunks)
    return [(s, json.loads('"' + t + '"'), c, i) for s, t, c, i in PRODUCT.findall(flight)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true", help="list the matches and stop: no photo is downloaded or stored")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    products = page_products(args.cache)
    by_key: dict[tuple[str, str], set[str]] = {}
    for _slug, title, cat, image in products:
        if image:
            by_key.setdefault((norm_name(title), norm_name(cat)), set()).add(image)

    matches: dict[str, str] = {}
    skipped = []
    for it in items:
        key = (norm_name(SIZE_SUFFIX.sub("", it["name"])), norm_name(it["category"]))
        urls = by_key.get(key, set())
        if len(urls) == 1:
            url = next(iter(urls))
            if not url.startswith(IMAGE_HOST):
                skipped.append((it["id"], f"image on an unexpected host: {url}"))
                continue
            matches[it["id"]] = url
        else:
            skipped.append((it["id"], "no product of that name and category on the page" if not urls else "several photos for that name"))
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
