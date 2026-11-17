#!/usr/bin/env python3
"""Item photos for BarBurrito from its own "ORDER AHEAD" ordering site (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_barburrito.py --cache DIR [--dry-run]

Where the photos are. BarBurrito's items come from its Ten Kites allergen and nutrition page (tkmenus.com/barburrito, tools/uk_extract/barburrito.py),
which shows no photos we may fetch (any Ten Kites photo sits on images.tenkites.com, whose robots.txt says `Disallow: /`). The chain's own website
https://barburrito.co.uk/menu/ shows only pictures of its printed menu boards (Menu-1.jpg ... Menu-9.jpg: lettering and calorie figures, no dish
photos) and its home page only unnamed marketing shots. Its navigation's "ORDER AHEAD" button links https://order.storekit.com/stores/barburrito,
the chain's own click-and-collect ordering site (white-label, run for BarBurrito on Storekit; every venue on it is a BarBurrito restaurant with an
@barburrito.co.uk email). "DELIVERY" links Deliveroo and Uber Eats: never used. That ordering site is a JavaScript app; this script reads the same
JSON it loads, nothing else:
  /api/store-group/barburrito                                  the brand (its id)
  /api/store-group/<id>/stores?fulfillmentMethod=Pickup        the restaurants (six on 2026-11-17)
  /api/venues/<venue slug>                                     a restaurant (its menu id)
  /api/categories/<menu id>?showAll=false                      the menu: categories -> products {id, name, image, nutrition.calories}
The photo is the product record's own `image`, a file on ucarecdn.com (the media store the ordering site loads its photos from); the page that
shows it is https://order.storekit.com/<venue slug>.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a product record on one of the restaurants' menus (a menu product, or an option inside a product that carries its own `image`) has the same
     norm_name as the item's name (the record's name as printed: a "(Ve)"/"(V)" diet mark or an emoji in it is NOT removed, so "Pico De Gallo Salsa
     (Ve)" does not match our "Dips - Pico de Gallo Salsa"),
  2. every record of that name on every menu that carries a photo carries the SAME photo (two different photos for one name: no photo),
  3. where the record prints calories, they equal the item's calories in items.csv (a second check that it is the same dish), and
  4. the photo is https://ucarecdn.com/<uuid>/ (the ordering site's media store), not a category banner (category images are never used).
Options inside a build-your-own dish (rice, proteins, salsas, the loaded-fries fillings...) carry no photo on this site, so the "Build your own" parts
cannot get one; the burritos, bowls and nachos that do have photos are not items here (BarBurrito publishes no calories for a finished build).
Run of 2026-11-17: the menu products and the options that carry a photo come to 54 distinct names (52 with a photo; 188 names counting every option
without one); 2 match an item exactly: Chicken Bites (601 kcal on both) and Big Pot Sauce (527 kcal on both; the ordering site describes it as "Sweet
Sriracha Mayo"). Chicken Bites' picture carries a "NEW" sticker, so it is left out (DROP_ITEMS): 1 photo kept. Orange Juice Smooth and Orange Juice with
bits are on the ordering site without a photo. Every other name differs from the Ten Kites name ("Mexi Fries (Ve)" vs "Side - Mexican Fries",
"Coca-Cola Original Taste 330ml Can" vs "Can Coca Cola", "Pico De Gallo Salsa (Ve)" vs "Dips - Pico de Gallo Salsa"...), so no photo is attached to them.

robots.txt (read 2026-11-17): https://barburrito.co.uk/robots.txt `User-agent: *` Disallow: /wp-admin/ only. https://order.storekit.com/robots.txt
`User-agent: *` Allow: / and a group naming GPTBot, ClaudeBot and other AI crawlers with Allow: / (everything allowed). https://ucarecdn.com/robots.txt
answers 404, which RFC 9309 reads as no rules. polite_get checks robots.txt on every URL.

Terms: BarBurrito's "Terms and Conditions" page (https://barburrito.co.uk/terms-conditions/, read 2026-11-17) covers only its offers, rewards and
competitions ("Loyalty Stamp-Card", "Student Discount", "Voucher Booklets"...): no clause about copying or reusing the website's content or images was
found. (Storekit's own platform terms were not read: they are the ordering platform's, not the chain's.) Installed on the founder's decision of
2026-10-06 in any case.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "barburrito"
CHAIN_MENU_PAGE = "https://barburrito.co.uk/menu/"
STORE = "https://order.storekit.com"
STORE_GROUP_SLUG = "barburrito"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
JSON_ACCEPT = "application/json, text/plain, */*"
DEFAULT_CACHE = Path("/tmp/menumacros-images-barburrito")
PHOTO_URL = re.compile(r"^https://ucarecdn\.com/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/$")
VENUE_EMAIL = re.compile(r"@barburrito\.co\.uk$", re.I)
# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {
    "chicken-bites": "the picture carries an orange 'NEW' sticker (a promotional flash that goes stale)",
}


def get_json(url: str, cache: Path, referer: str) -> object:
    return json.loads(polite_get(url, cache, accept=JSON_ACCEPT, referer=referer).decode("utf-8"))


def kcal_of(record: dict) -> str:
    n = record.get("nutrition") or {}
    c = n.get("calories")
    return "" if c is None else str(c)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        # the chain's own site must still send "ORDER AHEAD" to this store group
        page = polite_get(CHAIN_MENU_PAGE, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        links = {m.group(1) for m in re.finditer(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', page, re.S)
                 if re.sub(r"<[^>]+>", "", m.group(2)).strip().upper() == "ORDER AHEAD"}
        if f"{STORE}/stores/{STORE_GROUP_SLUG}" not in links:
            raise SystemExit(f"{CHAIN_MENU_PAGE}: 'ORDER AHEAD' no longer links {STORE}/stores/{STORE_GROUP_SLUG} (found {sorted(links)}): check the source")
        group_page = f"{STORE}/stores/{STORE_GROUP_SLUG}"
        group = get_json(f"{STORE}/api/store-group/{STORE_GROUP_SLUG}", args.cache, group_page)
        stores = get_json(f"{STORE}/api/store-group/{group['id']}/stores?fulfillmentMethod=Pickup", args.cache, group_page)
        venues = sorted(stores, key=lambda v: v["slug"])
        for v in venues:
            if not VENUE_EMAIL.search(v.get("email") or ""):
                raise SystemExit(f"venue {v['slug']} has no @barburrito.co.uk email ({v.get('email')!r}): not plainly the chain's own restaurant")
        print(f"{len(venues)} restaurants on {group_page}: {', '.join(v['slug'] for v in venues)}")

        # name key -> list of (name as printed, photo url or '', kcal or '', venue page)
        records: dict[str, list[tuple[str, str, str, str]]] = {}
        for v in venues:
            venue_page = f"{STORE}/{v['slug']}"
            venue = get_json(f"{STORE}/api/venues/{urllib.parse.quote(v['slug'])}", args.cache, venue_page)["venue"]
            for menu in venue.get("menu") or []:
                data = get_json(f"{STORE}/api/categories/{menu['id']}?showAll=false", args.cache, venue_page)
                for cat in data["categories"]:
                    for p in cat["products"]:
                        records.setdefault(norm_name(p["name"]), []).append((p["name"], p.get("image") or "", kcal_of(p), venue_page))
                for g in data["modifierGroups"].values():
                    for p in g["products"]:
                        img = p.get("image") or ""
                        if img:   # an option with no photo of its own adds nothing
                            records.setdefault(norm_name(p["name"]), []).append((p["name"], img, kcal_of(p), venue_page))
        with_photo = sum(1 for recs in records.values() if any(r[1] for r in recs))
        print(f"{len(records)} distinct product/option names on the menus, {with_photo} with a photo")

        matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, venue page, name as printed)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            recs = records.get(norm_name(it["name"]))
            if not recs:
                continue   # no record of that name on the ordering site (the common case: listed in the summary only)
            photos = {r[1] for r in recs if r[1]}
            if not photos:
                skipped.append(f"{it['id']}: {recs[0][0]!r} is on the ordering site but without a photo")
                continue
            if len(photos) > 1:
                skipped.append(f"{it['id']}: {recs[0][0]!r} carries {len(photos)} different photos on different menus: not attached")
                continue
            photo = photos.pop()
            if not PHOTO_URL.match(photo):
                skipped.append(f"{it['id']}: photo {photo!r} is not a file on the ordering site's media store")
                continue
            kcals = {r[2] for r in recs if r[1] == photo and r[2]}
            if kcals and kcals != {it["calories"]}:
                skipped.append(f"{it['id']}: the ordering site prints {sorted(kcals)} kcal for {recs[0][0]!r}, items.csv has {it['calories']}: not attached")
                continue
            page_url = sorted(r[3] for r in recs if r[1] == photo)[0]
            matched[it["id"]] = (photo, page_url, recs[0][0])

        for item_id, (url, page_url, shown) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {url}  <- {shown!r} on {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {url}")
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
