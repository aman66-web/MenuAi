#!/usr/bin/env python3
"""Item photos for IKEA UK food from IKEA's own food item pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_ikea.py --cache DIR [--pages DIR] [--dry-run]

Source: each item's own page https://www.ikea.com/gb/en/food/salesareas/<area>/<PRF id>/ (the pages tools/uk_extract/ikea.py read the
numbers from). The page's __NEXT_DATA__ JSON carries the item record with `mainImage.url` (a file on IKEA's own product image store,
https://storage.googleapis.com/fpi_product_images_prod/<uuid>, the host the page itself loads its pictures from). The published item was
built from exactly that record (ikea.SPEC maps IKEA item id -> our name), so the photo and the numbers are tied by the same product record,
which is the rule's "same product record carries both the photo and the item's size/variant". IKEA gives several dishes the same title
("Meatballs"), so the id from SPEC is the key, never the title; the title is only checked against SPEC (a changed title stops the script).

`--pages DIR` is where item-<PRF>.json files (as written by ikea.py) are looked for first (default: the --cache folder); a missing one is
fetched once from the page above with polite_get (robots.txt honoured, 1 request/second). The photo is the `mainImage.url` original, one
fetch each. A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Terms (https://www.ikea.com/gb/en/customer-service/terms-conditions/terms-of-use-pub8262e11a/, "Terms of use", read 2026-10-08): "This
includes copyright in all of the text, descriptions and images." / "Reproduction of part or all of the contents in any form is prohibited
unless for personal use." / "None of the content of our website may be copied or otherwise incorporated into or stored in any other web
site, electronic retrieval system, publication or other work in any form". Installed on the founder's decision of 2026-10-06 (CLAUDE.md
rule 2, the founder's accepted risk); the chain's photos come down the day it asks.
robots.txt: https://www.ikea.com/robots.txt (read 2026-10-08) disallows search, filter, cart/checkout, fragment and similar paths for "*";
nothing about /gb/en/food/. https://storage.googleapis.com/robots.txt answers 404 (no rules).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ikea  # noqa: E402  (SPEC: IKEA item id -> title, our name)
from images_common import (  # noqa: E402
    Blocked, load_items, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "ikea"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-ikea")
IMAGE_HOST = "https://storage.googleapis.com/fpi_product_images_prod/"
# item ids looked at on the contact sheets after the first run and left without a photo (a rerun must not bring them back)
DROP_ITEMS: dict[str, str] = {
    "cream-sauce-portion-and-condiments": "the photo is a kitchen scene with a ketchup bottle, not a cream sauce portion",
    "sunflower-spread-portion": "the photo is a third party's branded tub (Flora): a brand pack shot, not the chain's own food",
    "hot-chocolate": "IKEA's record reuses the photo of a milky coffee (shared with Cappuccino and Latte): not recognisably hot chocolate",
    "black-coffee-with-oat-milk": "IKEA's record reuses the black coffee photo: no milk shown",
    "tea-with-milk": "the photo shows tea with no visible milk (shared with Tea with Oat Milk)",
    "tea-with-oat-milk": "the photo shows tea with no visible milk (shared with Tea with Milk)",
}


def item_record(prf: str, pages: Path, cache: Path) -> dict:
    """The item record of IKEA's page for `prf`: from ikea.py's cached JSON if present, else fetched once from the page."""
    f = pages / f"item-{prf}.json"
    if f.exists():
        data = json.loads(f.read_text(encoding="utf-8"))
    else:
        area = next(a for a in ikea.AREAS)  # the page opens under any of its sales areas; the restaurant listing carries them all
        html = polite_get(f"{ikea.BASE}{area}/{prf}/", cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        if not m:
            raise Blocked(f"{prf}: the page came back without its __NEXT_DATA__ JSON (a challenge page or a changed site)")
        data = json.loads(m.group(1))
    return data["props"]["pageProps"]["product"]["item"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--pages", type=Path, default=None, help="folder with ikea.py's item-<PRF>.json files (default: --cache)")
    ap.add_argument("--dry-run", action="store_true", help="read the records and print the matches; download no photo and write nothing")
    args = ap.parse_args()
    pages = args.pages or args.cache

    published = {i["id"]: i for i in load_items(CHAIN_ID)}
    chosen: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    try:
        for prf, title, name, _category, _rankable in ikea.SPEC:
            item_id = ikea.ascii_slug(name)
            if item_id not in published:
                continue
            if item_id in DROP_ITEMS:
                print(f"  {item_id}: dropped ({DROP_ITEMS[item_id]})")
                continue
            rec = item_record(prf, pages, args.cache)
            if rec.get("id") != prf or rec.get("title") != title:
                print(f"  {item_id}: IKEA's page {prf} is now {rec.get('id')!r} / {rec.get('title')!r}, expected {title!r}: no photo")
                continue
            img = (rec.get("mainImage") or {}).get("url") or ""
            if not img.startswith(IMAGE_HOST):
                print(f"  {item_id}: no photo on IKEA's record")
                continue
            area = next((a for a in ikea.AREAS if a in {s["slug"] for s in rec["salesAreas"]}), None)
            if area is None:
                print(f"  {item_id}: the record lists none of the food sales areas: no photo")
                continue
            chosen[item_id] = (img, f"{ikea.BASE}{area}/{prf}/")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    print(f"{len(chosen)} of {len(published)} published items have a photo on their own IKEA record")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (url, page) in sorted(chosen.items()):
            try:
                rows[item_id] = (store_image(CHAIN_ID, polite_get(url, args.cache, referer=page)), page)
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
