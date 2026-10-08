#!/usr/bin/env python3
"""Item photos for Boston Tea Party from its own online-ordering menu (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    node tools/uk_extract/images_boston_tea_party_dump.js <dump-dir> <playwright-core-path> 0 1     # reads the menu in a browser
    python3 tools/uk_extract/images_boston_tea_party.py --dump <dump-dir> [--cache DIR] [--dry-run]  # matches and downloads photos

Source: https://bostonteaparty.vmos.io/ (the chain's own "Click & collect" ordering site, the "Order now" link on
https://bostonteaparty.co.uk/how-to-order/; the platform is Vita Mojo, white-labelled with the chain's name). The nutrition
data came from the chain's menu PDFs (bostonteaparty.co.uk/media/...), which carry no photos; the chain's own website
(bostonteaparty.co.uk/our-menus/) has no per-item pages, only those PDFs. The ordering app only answers inside a browser
session, so the helper .js reads each menu category page for two cafes (Kingsmead Square and Alfred Street, Bath) and saves
the JSON the page itself loads (https://vmos2.vmos.io/catalog/categories/<category uuid>/bundles): every dish ("bundle")
has a uuid and a name, and the page's photo of that dish is
https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid (the page's own <img>
tags use exactly these ids behind a Cloudflare resize-and-crop wrapper; we fetch the ORIGINAL image, never the cropped
wrapper, and store_image only downsizes it to <= 640 px WebP).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when
  1. a dish on the ordering menu has the same name as the item (images_common.norm_name equality), the dish's uuid is the
     same in every cafe/category where the name appears, and no other dish carries that name;
  2. the item's name is unique among the published items;
  3. the photo is the one the page ties to that dish's uuid (entityUUID = dish uuid).
Variants of a dish ("Bacon Cheeseburger without bacon", "(kids)" portions, add-ons, drinks sizes) have no photo of their own
on the site and get none. The ordering menu names a dish differently from the printed menu in many places ("The Veggie
with Halloumi" vs "Add halloumi (to The Veggie)"): no photo, we never match by similarity.

Terms and robots (read 2026-10-08):
  * https://bostonteaparty.co.uk/terms-and-conditions/ is the Rewards programme terms (stamps, vouchers, liability): no clause
    about images, photography, copyright or reuse of the site's content (searched for copyright, intellectual, image,
    photograph, reproduce, trade mark, licence, content); the pages carry no copyright line either. Privacy policy not read.
  * robots.txt of bostonteaparty.co.uk: "User-agent: *" disallows only /App_Data, /App_Plugins, /umbraco, /uSync.
    bostonteaparty.vmos.io/robots.txt and media-multitenant.vmos-static.com/robots.txt: "User-agent: *  Disallow:" (nothing).
    vmos2.vmos.io serves no robots.txt (answers the app's HTML, so no rules); multitenant.vmos-static.com (the resize
    wrapper) answers 403 for robots.txt and is not used. The ordering site loads a Cloudflare passive bot-detection script
    but let a normal headless browser read it without any challenge.
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "boston-tea-party"
APP = "https://bostonteaparty.vmos.io"
MENU_UUID = "dc763602-0c74-43ab-934e-bcb5d67eb9ae"   # "Click & Collect" menu
STORES = {"0": "0ee3a901-b800-410f-8474-f83c51eeaf4d",   # Kingsmead Square, Bath
          "1": "49bd9746-0e9c-40a1-ab7d-731db455154b"}   # Alfred Street, Bath
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
DEFAULT_CACHE = Path("/tmp/menumacros-images-boston-tea-party")
# Dish uuids looked at by eye (2026-10-08) and left out. The ordering site uses ONE photo (a latte-art coffee in a teal cup) for
# Espresso, Cappuccino and Mocha: it cannot show each of the three, and for an espresso it is plainly not the drink, so none of
# the three gets a photo. (Flat White/Latte and Matcha Latte/Vanilla Matcha Latte also share a photo each; those pairs are
# variants of the same drink and the photo shows that drink, so they keep it.)
SKIP_UUIDS: set[str] = {
    "ca4fbe2e-75fe-4157-abbb-980cbe125745",  # Espresso
    "101834a2-6b6f-48bc-bfd6-1c19c35aa285",  # Cappuccino
    "028625ba-bab6-4bd7-b6cb-cfb84ab4627c",  # Mocha
}


def walk_bundles(cat: dict):
    for b in cat.get("bundles") or []:
        yield b
    for sub in cat.get("categories") or []:
        yield from walk_bundles(sub)


def read_dump(dump: Path) -> dict[str, list[dict]]:
    """norm_name(dish name) -> [{uuid, name, store, category}] over every saved category page."""
    dishes: dict[str, list[dict]] = {}
    for f in sorted(dump.glob("store*_*.json")):
        store, cat = f.stem.split("_", 1)
        payload = json.loads(f.read_text(encoding="utf-8"))["payload"]
        for b in walk_bundles(payload):
            dishes.setdefault(norm_name(b["name"]), []).append(
                {"uuid": b["uuid"], "name": b["name"], "store": store.removeprefix("store"), "category": cat})
    return dishes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", type=Path, required=True, help="folder written by images_boston_tea_party_dump.js")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    count: dict[str, int] = {}
    for it in items:
        count[norm_name(it["name"])] = count.get(norm_name(it["name"]), 0) + 1
    dishes = read_dump(args.dump)
    print(f"{sum(len(v) for v in dishes.values())} dish entries, {len(dishes)} distinct names on the ordering menu")
    rows: dict[str, tuple[str, str]] = {}
    try:
        for it in items:
            key = norm_name(it["name"])
            hits = dishes.get(key)
            if not hits or count[key] != 1:
                continue
            uuids = {h["uuid"] for h in hits}
            if len(uuids) != 1:
                print(f"  skip {it['name']!r}: {len(uuids)} different dishes carry that name")
                continue
            uuid = next(iter(uuids))
            if uuid in SKIP_UUIDS:
                print(f"  skip {it['name']!r}: photo {uuid} is not the dish itself")
                continue
            h = hits[0]
            page = f"{APP}/store/{STORES[h['store']]}/menu/category/{h['category']}/bundles?menuUUID={MENU_UUID}"
            print(f"  MATCH {it['id']}: {it['name']!r} = dish {h['name']!r} ({uuid})")
            if args.dry_run:
                continue
            raw = polite_get(MEDIA.format(uuid=uuid), args.cache)
            try:
                rows[it["id"]] = (store_image(CHAIN_ID, raw), page)
            except ValueError as e:
                print(f"    not stored: {e}")
    except Blocked as e:
        print(f"BLOCKED: {e}")
        return 1
    print(f"{len(rows)} of {len(items)} published items have a photo")
    if args.dry_run:
        return 0
    write_images_csv(CHAIN_ID, rows)
    for f, ids in suspected_placeholders(rows).items():
        print(f"  shared photo {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
