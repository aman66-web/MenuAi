#!/usr/bin/env python3
"""Item photos for Yalla Yalla from its own Click & Collect ordering site (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_yalla_yalla.py --cache DIR [--dry-run]

Where the photos are. The chain's own website (yalla-yalla.co.uk) prints its menu as text with no per-dish photos: the menu, drinks,
feast-to-share, what's-on and Christmas pages show only the logo, icons, event banners and a slider of interior/stock pictures (read
2026-11-17). Every page's main navigation has a "Click & Collect" link to https://order.storekit.com/yalla-yalla/menu, the chain's own
ordering storefront (Storekit is the white-label platform behind it, not an aggregator: the venue record names the chain's own website,
https://yalla-yalla.co.uk/, and a yalla-yalla.co.uk email address). That page is a JavaScript app; its own code first loads the venue
record https://order.storekit.com/api/venues/yalla-yalla and then the menu it shows, the first of the venue's menus
(`venue.menu[0].id`), from https://order.storekit.com/api/categories/<menu id>?showAll=false. Each product in that JSON is one record:
{"id", "name", "description", "image": "https://ucarecdn.com/<uuid>/", ...}. The image is the photo the menu page shows on that product's
card and in its pop-up; the page itself requests it as "<image>-/resize/800x/-/format/auto/" from Uploadcare (the platform's image CDN).
This script asks for "<image>-/resize/800x/" (the same proportional resize to 800 px wide, in the uploaded file's own format; nothing is
cropped), and store_image resizes to <= 640 px and writes WebP, nothing else. The script checks first that the chain's menu page still
links the ordering site, and stops if it does not. Only the menu the page loads (menu[0]) is used; the venue's other, unused menus and the
separate "Group Platters" storefront (https://order.storekit.com/yalla-yalla-group-platters/menu, which adds nothing new for our items:
only the four lemonades, with other pictures) are not.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a product on that menu has a name whose norm_name equals the item's name in items.csv (e.g. "Lentil Soup", "Halloumi Wrap Platter"),
  2. every product of that name on the menu carries the same picture (Batata Harra, Fattoush and Tabbouleh are listed twice, under Mezze
     and under Sides & Nibbles, with the same picture), and
  3. that picture is not also used by a product of another name (the menu uses one picture for both the Chicken Taouk Wrap and the
     Chicken Shawarma Wrap, and one for the Chicken Shawarma Bowl and the "Shawarma Bowl and Drink Meal Deal": a shared picture is not a
     photo of one named dish), and is a file on ucarecdn.com.
Our names come from the chain's allergen and calorie guide; where the ordering site spells or names a dish differently there is no photo
(e.g. "Chicken Sambousek" vs our "Chicken Samboussek", "Za'atar & Garlic Flatbread" vs "Za'atar & Garlic Bread", "Marinated Mixed Olives",
"Steamed Couscous", "Baklawa Selection", "Mango & Vanilla Cheesecake", "Strawberry Lemonade", "Chicken Tagine", "Chicken Shawarma Bowl",
and the grills "Chicken Kofta", "Grilled Chicken Taouk" and "Grilled Lamb Kofta", which the guide prints both as dine-in and as takeaway
grills, so even the guide's own printed name would not say which of our two items the picture belongs to).

robots.txt (read 2026-11-17): https://yalla-yalla.co.uk/robots.txt is "User-agent: * / Disallow:" (everything allowed);
https://order.storekit.com/robots.txt has "User-agent: * / Allow: /" and a group naming GPTBot, ClaudeBot, CCBot and others with
"Allow: /.well-known/ucp" and "Allow: /" (everything allowed); https://ucarecdn.com/robots.txt answers 404 (no rules, RFC 9309).
polite_get checks robots.txt on every URL.

Terms (read 2026-11-17). yalla-yalla.co.uk has no terms of use for the website: its footer's "Terms & Conditions" link opens
https://yalla-yalla.co.uk/wp-content/uploads/2024/07/YallaYalla_DigitalGiftCard_TC_2024.pdf (ten gift-card terms, nothing about the
site's content or images); the footer prints "© 2026 - Yalla Yalla All rights reserved". The ordering site's venue record says
"customPolicies": {"hasTermsAndConditions": false}, so the storefront shows no terms of the chain's own. No clause about copying or
reusing content or images was found; the photos are the chain's own and installed on the founder's decision of 2026-10-06.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: 73 products on the menu, 31 of the 81 published items matched exactly; every photo was looked at on contact sheets and
full-size crops (the four wrap platters are four different photos, each showing its own filling; the Quinoa photo was compared with the
menu's own Steamed Couscous photo and shows a different, coarser grain); 1 left out (DROP_ITEMS), so 30 items have a photo.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "yalla-yalla"
CHAIN_MENU_PAGE = "https://yalla-yalla.co.uk/main-menu/"
STORE = "https://order.storekit.com"
SLUG = "yalla-yalla"
MENU_PAGE = f"{STORE}/{SLUG}/menu"            # the page that shows the photos (source_url of every row)
VENUE_API = f"{STORE}/api/venues/{SLUG}"
CATEGORIES_API = STORE + "/api/categories/{menu_id}?showAll=false"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
JSON_ACCEPT = "application/json, text/plain, */*"
DEFAULT_CACHE = Path("/tmp/menumacros-images-yalla-yalla")
IMAGE = re.compile(r"^https://ucarecdn\.com/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/$")
RESIZE = "-/resize/800x/"                      # proportional resize to 800 px wide (the page asks for the same width); never a crop

# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back. {item id: why}
DROP_ITEMS: dict[str, str] = {
    "lentil-soup": "the flatbread beside the soup sits on wrapping paper printed 'BREADS OVEN' and 'COMPTOIR LIBANAIS' (another restaurant "
                   "chain's name and branding in the picture)",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, product name as listed)
    try:
        page = polite_get(CHAIN_MENU_PAGE, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        if f'href="{MENU_PAGE}"' not in page:
            raise SystemExit(f"{CHAIN_MENU_PAGE} no longer links {MENU_PAGE}: check where the chain's ordering site is now")
        venue = json.loads(polite_get(VENUE_API, args.cache, accept=JSON_ACCEPT, referer=MENU_PAGE))["venue"]
        if venue.get("slug") != SLUG or "yalla-yalla.co.uk" not in (venue.get("url") or ""):
            raise SystemExit(f"{VENUE_API}: the venue record no longer names the chain's website ({venue.get('url')!r})")
        menu_id = venue["menu"][0]["id"]       # the menu the page loads (its own code: venue.menu[0].id)
        menu = json.loads(polite_get(CATEGORIES_API.format(menu_id=menu_id), args.cache, accept=JSON_ACCEPT, referer=MENU_PAGE))

        # (the feed writes "archived" as the string "false")
        products = [(c["name"].strip(), p) for c in menu["categories"]
                    if c.get("active", True) and c.get("hiddenInMenu") in (False, None) and c.get("archived") in (False, None, "false")
                    for p in c["products"]]
        if not products:
            raise SystemExit(f"menu {menu_id}: no products found: the feed has changed shape")
        print(f"{len(products)} products on {MENU_PAGE} (menu {menu_id})")
        names_by_image: dict[str, set[str]] = {}
        images_by_name: dict[str, set[str]] = {}
        listed_as: dict[str, str] = {}
        for _, p in products:
            key, img = norm_name(p["name"]), (p.get("image") or "")
            names_by_image.setdefault(img, set()).add(key)
            images_by_name.setdefault(key, set()).add(img)
            listed_as.setdefault(key, p["name"].strip())

        for it in items:
            key = norm_name(it["name"])
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            imgs = images_by_name.get(key)
            if not imgs:
                skipped.append(f"{it['id']}: no product named {it['name']!r} on the menu")
                continue
            if len(imgs) != 1:
                skipped.append(f"{it['id']}: the products named {it['name']!r} carry different pictures")
                continue
            img = next(iter(imgs))
            if not IMAGE.match(img):
                skipped.append(f"{it['id']}: the product's picture {img!r} is missing or not a ucarecdn.com file")
                continue
            if names_by_image[img] != {key}:
                skipped.append(f"{it['id']}: its picture is also used for {sorted(names_by_image[img] - {key})}: not a photo of one dish")
                continue
            matched[it["id"]] = (img + RESIZE, listed_as[key])

        for item_id, (url, listed) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:45} {url}  <- product {listed!r}")
                continue
            raw = polite_get(url, args.cache, referer=MENU_PAGE)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, MENU_PAGE)
            print(f"  {item_id:45} {fname}  <- {url}")
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
