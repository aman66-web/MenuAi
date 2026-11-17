#!/usr/bin/env python3
"""Item photos for Everyman Cinemas from the chain's own Food & Drink pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_everyman.py --cache DIR [--dry-run]

Sources (both on www.everymancinema.com, both in its own sitemap-0.xml, both titled "Burgers, Pizzas, Cocktails & More at Everyman Cinema"):
  1. https://www.everymancinema.com/food-and-drink/ (the page the menu-details calories page and the site footer link as "Food & drink"), and
  2. https://www.everymancinema.com/everyman-food-and-drink/ (a second gallery of the same kind; on 2026-11-17 it still shows the Burnt Basque
     Cheesecake, which page 1 no longer shows).
Each page shows a gallery of food and drink photos (wide category banners "Lifestyle", "Burger", "Snacking Plates" and about 18 dish tiles); each
<img> carries the CMS "alt" text that names the dish (e.g. alt="Hot Honey Halloumi"). Some tiles are .jpg, some .png (the first version of this
script read only .jpg and so missed the .png tiles). The per-venue menu pages (/food-and-drink/<venue>/) only link a PDF menu (and Deliveroo, which
is never used), with no photos; /menu-details/ and /pre-ordering/ show no dish photos; the private-hire menu pages show only category pictures
("food for sharing", "drinks"). Photos are fetched from the file the page names, on the chain's own CMS host
(https://cms-assets.webediamovies.pro/production/279/<id>.jpg|png, the original, not the CDN's resize transform).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the photo's alt text and the item's name are equal under
norm_name and the name is unique among published items. Where both pages name the same item, page 1's photo is used. Matched on 2026-11-17 (5):
Hot Honey Halloumi, Standard Fries, Peach Iced Tea, Grapefruit & Elderflower Botivo Spritz (all page 1) and Burnt Basque Cheesecake (page 2).
Not matched because no published item has that exact name: "Popcorn", "Matcha" (our "Vanilla Matcha"), "Malted Shakes", "Pepperoni" (our
"Pepperoni pizza"), "Build Your Own Sundae" (ours are its scoops, sauces and toppings, one item each), "Signature Smokehouse BBQ Beef Burger"
(our "Signature Smokehouse BBQ Burger"), "Signature Lobster Roll" (our "Lobster Roll"), "Garlic Parsley Doughballs & Garlic Butter" (our
"Handmade garlic parsley dough balls"), "Smashed Burger and Fries", "Buttermilk Chicken and Fries" (kids' menu tiles; ours are "Kids smash burger
& chips" and "Kids Buttermilk chicken & chips"), "Everyman Reusable Water Bottle" (our "Everyman Reusable Water (still or sparkling)"), "Signature
Hawaiian", "Frozen Coolers", "Strawberry Elderflower Spritz", "Spicy Mango Daiquri", "Everyman G&T", "Old Fashioned & PicantE" (cocktails are not
published), "Little Guests Menu".

Terms (https://www.everymancinema.com/terms-and-conditions/, "Terms and Conditions", clause 8.3, read 2026-10-08 and again 2026-11-17, unchanged):
"The Website and the materials on it are protected by copyright, trade mark and other intellectual property rights and laws throughout the world.
The materials on the Website are owned by or licensed to us and may not be copied, reproduced, republished, uploaded, posted, transmitted or
distributed in any way without our consent." Installed on the founder's decision of 2026-10-06 (the founder's accepted risk); a chain's photos come
down the day it asks.
robots.txt: https://www.everymancinema.com/robots.txt (read 2026-10-08 and 2026-11-17) disallows /theaters/, /cms-preview/, /offline/, a few film
listing pages and "/*?strictlyInTags=*"; nothing about /food-and-drink/ or /everyman-food-and-drink/. https://cms-assets.webediamovies.pro/robots.txt
does not exist (404, 2026-11-17), so no rules.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "everyman"
PAGE = "https://www.everymancinema.com/food-and-drink/"
PAGES = [PAGE, "https://www.everymancinema.com/everyman-food-and-drink/"]   # first page wins where both name the same item
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-everyman")
DROP_ITEMS: dict[str, str] = {   # item ids looked at after the first run and left without a photo (a rerun must not bring them back)
    "grapefruit-and-elderflower-botivo-spritz": "half the photo is a third-party brand's bottle and label (Botivo), not just the drink (checker, 2026-11-17)",
}

IMG = re.compile(r'<img alt="(?P<alt>[^"]*)"[^>]*? src="https://cms-assets\.webediamovies\.pro/cdn-cgi/image/[^"/]*/production/279/(?P<id>[0-9a-f]{32})\.(?P<ext>jpg|png)"')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the page and print the matches; download no photo and write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    names = Counter(norm_name(i["name"]) for i in items)
    by_name = {norm_name(i["name"]): i for i in items if names[norm_name(i["name"])] == 1}

    chosen: dict[str, tuple[str, str]] = {}   # item_id -> (photo url, the page that shows it for that item)
    for page in PAGES:
        try:
            page_html = polite_get(page, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        except Blocked as e:
            print(f"BLOCKED: {e}. Stopping; nothing written.")
            return 1
        tiles = [(html.unescape(m["alt"]).strip(), m["id"], m["ext"]) for m in IMG.finditer(page_html)]
        print(f"{len(tiles)} photos with a name on {page}")
        for alt, photo_id, ext in tiles:
            item = by_name.get(norm_name(alt))
            if item is None:
                print(f"  no item named '{alt}': skipped")
                continue
            if item["id"] in DROP_ITEMS:
                print(f"  {item['id']}: dropped ({DROP_ITEMS[item['id']]})")
                continue
            if item["id"] in chosen:
                print(f"  {item['id']}: '{alt}' also on {page}; the photo from {chosen[item['id']][1]} is kept")
                continue
            chosen[item["id"]] = (f"https://cms-assets.webediamovies.pro/production/279/{photo_id}.{ext}", page)
            print(f"  {item['id']}: '{alt}' -> photo {photo_id}.{ext}")
    print(f"{len(chosen)} of {len(items)} published items have a matching photo")
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
