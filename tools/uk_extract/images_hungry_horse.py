#!/usr/bin/env python3
"""Item photos for Hungry Horse from its own pub menu pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py and the Greene King
platform reader in images_greene_king.py).

    python3 tools/uk_extract/images_hungry_horse.py --cache DIR [--dry-run]

Source: Hungry Horse's own pub menu pages, https://www.hungryhorse.co.uk/pubs/<area>/<pub>/menu (for example https://www.hungryhorse.co.uk/pubs/bedfordshire/chequers/menu), and the JSON
endpoints of the same site each page loads, https://www.hungryhorse.co.uk/api/menus/getmenus/<venue id> and .../getmenudetails/<venue id>/<menu id>: the same
feed tools/uk_extract/hungry_horse.py built the menu from. Hungry Horse runs on Greene King's pub platform; how the feed is read, which photo hosts are
used and why is written once in images_greene_king.py. Each product record names the dish and gives its photo (`image`), or "" when the dish
has none; only photos on Greene King's content hub (gkbr-p-001.sitecorecontenthub.cloud/api/public/content/...) are used.

Pubs read: 40 of the /pubs/<area>/<pub>/menu pages listed in https://www.hungryhorse.co.uk/sitemap.xml (about 199 when the menu was extracted), spread evenly over the sorted list (spread() in images_greene_king.py), each pub's every menu, 1 request/second. Product ids and their photos are the brand's own and the same at every pub; a pub lists only some dishes, so the sample is read until it stops finding new ones. The run prints how many distinct products each further 10 pubs added, to show whether the sample has stopped growing.

Match rule (exact, nothing fuzzy): images_greene_king.py, "Match rule": the product record names the item (norm_name equality, or the item's
name is the product's name plus the bracketed labels our extraction added and the record itself says every word of them), prints exactly the
item's calories, and carries a content-hub photo; several photos for one item -> the most common, a tie gives none.

Terms (https://www.hungryhorse.co.uk/terms-and-conditions, "Intellectual property", read 2026-11-17): "Intellectual property The content and design of these website pages are subject to copyright owned by us. You are welcome to print pages for your personal use but no part of this website, our logos or trademarks may be reproduced or transmitted in any way for any other purpose."
An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk); a chain's photos come down the day it asks.
robots.txt (https://www.hungryhorse.co.uk/robots.txt, read 2026-11-17): one group for `User-agent: *` disallowing /App_Data/, /masterpages/, /bin/, /config/, /css/,
/data/, /js/, /images/, /includes/, /media/, /Properties/, /scripts/, /sitecore/, /usercontrols/, /xslt/, /Web.config and a few booking
queries; /pubs/ and /api/menus/ are allowed (only "Screaming Frog SEO Spider" is refused everything; no AI crawler is named).
gkbr-p-001.sitecorecontenthub.cloud/robots.txt: "Disallow: / / Allow: /api/public/" (the photos are under /api/public/content/).
izoneapps-cdn.zonalconnect.com (where some products' photos sit) is not used: its robots.txt redirects to one that says "Disallow: /".
polite_get checks robots.txt on every URL; a 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: 40 of 196 pubs read (286 distinct products after the first 10 pubs, none new after), 14 products with a photo: 7 on the
content hub (three wines, not items, and the four alcohol-free beers/cider below) and 7 on the robots-refused Zonal host (Cheesy Chips, Dressed
Side Salad, Let's Get Battered, Onion Rings, Sausage & Mash, Sweet Potato Fries, Ultimate Candymania: no photo). 4 items matched, all 4 dropped
after looking (DROP_ITEMS: third-party brand packs): 0 photos, so no images.csv.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import Blocked  # noqa: E402
from images_greene_king import brand_args, run_brand, sitemap_pubs, spread  # noqa: E402

CHAIN_ID = "hungry-horse"
BASE = "https://www.hungryhorse.co.uk"
MAX_PUBS = 40
DEFAULT_CACHE = Path("/tmp/menumacros-images-hungry-horse")
DROP_ITEMS: dict[str, str] = {   # looked at on contact sheets 2026-11-17 and left without a photo (a rerun must not bring them back)
    "guinness-0-0": "a third-party brand's can (Guinness 0.0 pack shot), not a photo of the drink served",
    "heineken-0-0": "a third-party brand's bottle (Heineken 0.0 pack shot), not a photo of the drink served",
    "peroni-nastro-azzurro-0-0": "a third-party brand's bottle (Peroni 0.0% pack shot), not a photo of the drink served",
    "thatchers-zero": "a third-party brand's bottle (Thatchers Zero pack shot), not a photo of the drink served",
}
SKIP_PHOTOS: dict[str, str] = {}  # content-hub photo id -> why it is not used


def main() -> int:
    args = brand_args(DEFAULT_CACHE)
    try:
        listed = sitemap_pubs(BASE, args.cache)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    pubs = spread(listed, MAX_PUBS)
    print(f"{len(listed)} pub menu pages in {BASE}/sitemap.xml; reading {len(pubs)}")
    return run_brand(CHAIN_ID, BASE, pubs, args.cache, args.dry_run, DROP_ITEMS, SKIP_PHOTOS)


if __name__ == "__main__":
    sys.exit(main())
