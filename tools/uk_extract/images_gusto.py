#!/usr/bin/env python3
"""Item photos for Gusto Italian from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_gusto.py --cache DIR [--dry-run]

Source: the chain's own Menu page https://www.gustorestaurants.com/menu/ (the page tools/uk_extract/gusto.py names as the one that links the
allergen matrix the items came from). The page is server-rendered and carries every restaurant's menus as one JSON object in an inline script,
`const menusData = {<location>: {"groups": {"food"|"drinks"|"set_menus": {"menus": {<menu>: {... "name": "...", "image": "..."}}}}}}`; the page's own
script draws each dish card from it, with the photo above the dish name. Nothing else is requested besides that page and the photo files. Only a few
dishes carry a photo (on 2026-11-17: 11 different name/photo pairs across the seven restaurants' menus); every other record has "image": "".
The photos are files on www.gustorestaurants.com itself (/wp-content/themes/gusto-italian/assets/images/menu/<name>.jpg). The menus' "hero" pictures
(images.unsplash.com stock photos) are not dish photos and are never used.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a dish record in menusData has the same norm_name as the item's name (the item's name as published, e.g. "Beef Carpaccio"; the matrix's
     printed slips such as "Beef Carpacio" are not used for matching),
  2. every record of that name that carries a photo, on every restaurant's menus, points at the same file (if two files were named for one dish the
     item gets none), and
  3. the photo is a file under /wp-content/themes/gusto-italian/assets/images/menu/ on www.gustorestaurants.com.
The page has no other dish photos: the What's On, restaurant and home pages show photos with empty alt text or an event's name ("Sunday Roast",
"Festive Feasting"), never a dish's name, so they cannot be tied to an item.

Left out after looking (DROP_ITEMS below; a rerun cannot bring them back): see the list in this file.

Terms: the site has no website terms of use (https://www.gustorestaurants.com/terms-and-conditions/, read 2026-11-17, lists only the Booking &
Cancellation, Loyalty, Gift Cards, Early Christmas Booking Reward, My School Benefits, Student Beans and Blue Light Card terms; none of those nor the
Privacy Policy or FAQ mentions copying, reuse, intellectual property, photographs or automated access). The only notice is the footer line
"© 2026 Gusto Italian. All rights reserved." (every page, read 2026-11-17). No clause about copying or reusing content or images was found.
robots.txt (https://www.gustorestaurants.com/robots.txt, read 2026-11-17, Yoast): one group, `User-agent: *` with an empty `Disallow:` (everything
allowed); no group names an AI crawler. polite_get checks robots.txt on every URL (RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "gusto"
HOST = "https://www.gustorestaurants.com"
MENU_URL = f"{HOST}/menu/"
PHOTO_PREFIX = f"{HOST}/wp-content/themes/gusto-italian/assets/images/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-gusto")
MARKER = "const menusData = "

# Looked at on contact sheets and at full size (2026-11-17) and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {
    # The page's own description is "curved ridged pasta in a creamy vodka-infused tomato sauce" (creste di gallo), but the photo the page
    # attaches ("Vodka Creste.jpg") shows large flat squares of a smooth tube pasta (paccheri/calamarata, with raw tubes beside the bowl):
    # a different pasta from the dish named, so it is left out.
    "vodka-creste": "the photo shows a smooth tube pasta (paccheri), not the curved ridged 'creste' pasta the page's own description names",
}
# Kept after looking, noted for the record: "tiramisu (1).jpg" is also used by the page for "Tiramisu" (Gold menu), "Tiramisu French Toast"
# and "Tiramisu Martini", none of which is an item here; for "Homemade Tiramisu" it is a plated slice of tiramisu, the dish the record names.


def read_menus(page: str) -> dict:
    i = page.find(MARKER)
    if i < 0:
        raise SystemExit("menu page: no `const menusData = ` object: the page has changed shape")
    data, _ = json.JSONDecoder().raw_decode(page[page.index("{", i):])
    if not isinstance(data, dict) or not data:
        raise SystemExit("menu page: menusData is empty: the page has changed shape")
    return data


def dish_photos(data: dict) -> tuple[dict[str, dict[str, set[str]]], int]:
    """{norm_name: {photo url: {"<location>/<menu>", ...}}} for every dish record that carries a photo, and the number of dish records read."""
    out: dict[str, dict[str, set[str]]] = {}
    count = 0

    def walk(o, where: str) -> None:
        nonlocal count
        if isinstance(o, dict):
            if isinstance(o.get("name"), str) and "image" in o and "price" in o:
                count += 1
                if o["image"]:
                    out.setdefault(norm_name(o["name"]), {}).setdefault(o["image"], set()).add(where)
            for v in o.values():
                walk(v, where)
        elif isinstance(o, list):
            for v in o:
                walk(v, where)

    for loc, v in data.items():
        for g in (v.get("groups") or {}).values():
            for mk, m in (g.get("menus") or {}).items():
                walk(m.get("sections", m), f"{loc}/{mk}")
    return out, count


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, str] = {}
    try:
        page = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        photos, n_records = dish_photos(read_menus(page))
        print(f"{n_records} dish records on {MENU_URL}; {len(photos)} dish names carry a photo")
        for key, by_url in sorted(photos.items()):
            print(f"  page: {key!r} -> {', '.join(u.rsplit('/', 1)[-1] for u in by_url)}")

        for it in items:
            key = norm_name(it["name"])
            by_url = photos.get(key)
            if not by_url:
                continue
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if len(by_url) > 1:
                skipped.append(f"{it['id']}: the menus name {len(by_url)} different photos for {it['name']!r}")
                continue
            url = next(iter(by_url))
            if not url.startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: the photo {url!r} is not a file in the chain's own menu-image folder")
                continue
            matched[it["id"]] = url

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}")
                continue
            parts = urllib.parse.urlsplit(url)
            fetch_url = urllib.parse.urlunsplit(parts._replace(path=urllib.parse.quote(parts.path)))
            raw = polite_get(fetch_url, args.cache, referer=MENU_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, MENU_URL)
            print(f"  {item_id:50} {fname}  <- {url.rsplit('/', 1)[-1]}")
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
    for f, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
