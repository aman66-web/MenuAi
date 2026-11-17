#!/usr/bin/env python3
"""Item photos for Wahaca from its own ordering site (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wahaca.py --cache DIR [--dry-run]

Source: Wahaca's own Click & Collect ordering site, the "Order Takeaway" link in the header of every page of www.wahaca.co.uk
(https://www.wahaca.co.uk/mexican-menu-full/ -> https://order.withqikserve.com/Wahaca-CC/#/main/choose-branch). The site is Wahaca's
own white-label shop on the QikServe platform ("Wahaca Click & Collect Web", application 6748). Its page loads two plain JSON feeds,
read here with polite_get (no browser):
  1. https://order.withqikserve.com/api/venues?appId=6748&applicationType=WEB&expand=outlets   (the branches and their outlet ids)
  2. https://order.withqikserve.com/api/menus?type=MENU&expand=true,parentSection,sectionHours&expandItems=true,tagActions&outletId=<id>&applicationType=WEB
     (one per live branch: sections -> items, each item with its own `images` list; the photo file is in the platform's store for
     Wahaca's till system, https://s3.amazonaws.com/toasttab/restaurants/restaurant-<n>/menu/items/...).
(The two addresses were seen in the ordering page's own requests, once, with a headless browser; this script only reads the JSON.)
Every live branch's menu is read (11 on 2026-11-17); they carry the same dish names and the same photo for each name.

Not used: the photos on https://www.wahaca.co.uk/mexican-menu-full/ itself. They are one picture per menu section (a spread of several
dishes, a quesadilla, a sweet potato bowl) with no dish named; only two have alt text naming a dish, and neither is a published name
("Butter Bean and Confit Garlic Dip", "Pork Belly Skewer with crispy leeks and tamarind mole"), so nothing there passes the exact-name rule.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a record in one of the ordering menu's dish sections (not SKIP_SECTIONS: the "Vegan" section repeats dishes as their vegan
     versions with other photos, "Kids" and "Set Menus" are other meals, "Softs" and "Alcoholic Beverages" are drinks) has the same
     norm_name as the item's name ("Sweet Potato and Feta Taquito" = "Sweet Potato & Feta Taquito"; "Free Range Chicken Burrito" is NOT
     "Grilled Chicken Burrito", "Churros with Chocolate" is NOT "Churros with chocolate sauce", "Grilled 'Halloumi Al Pastor' Tacos" is NOT
     "'Halloumi' Al Pastor Tacos": those stay without a photo),
  2. that name has exactly one photo across every dish section of every branch's menu (a name with two different photos is skipped), and
  3. the photo is a file under https://s3.amazonaws.com/toasttab/restaurants/ (the ordering site's own image store).
Our items come from the Summer 2026 table menu PDF (wahaca.py); the ordering site is the takeaway menu. Only dishes the ordering site
names exactly get a photo (25 of 44 on 2026-11-17).

robots.txt (read 2026-11-17): https://www.wahaca.co.uk/robots.txt has one group `User-agent: *` with `Disallow: /wp-admin/` (Allow
/wp-admin/admin-ajax.php): nothing used here is disallowed. https://order.withqikserve.com/robots.txt answers 404: no rules (RFC 9309).
https://s3.amazonaws.com/robots.txt answers 403 AccessDenied: no rules (RFC 9309; founder's decision of 2026-10-12, see images_common.py).
https://preo.gumlet.io/robots.txt (the ordering site's logo host, not used) is `User-agent: *` with an empty Disallow.
The ordering site's config says a Cloudflare challenge can be switched on (`isCloudFlareChallengeEnabled`); none was shown on 2026-11-17.
If one is, or any request answers 401/403/429, the script stops (exit 1) before anything is written: never worked round.

Terms (read 2026-11-17): none found. www.wahaca.co.uk publishes no website terms of use (its sitemap lists only offer, student, gift
and wildcard T&Cs, a privacy policy and a staff privacy policy; neither privacy page nor the FAQs nor the page footer has a clause about
copying or reusing content or images; the FAQs ask press for images to write to the press office). The ordering site's own config lists
no legal documents (`"legalDocuments": []` in /api/config/app).
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

CHAIN_ID = "wahaca"
ORDER_SITE = "https://order.withqikserve.com/Wahaca-CC/"
API = "https://order.withqikserve.com/api"
APP_ID = 6748
VENUES_URL = f"{API}/venues?appId={APP_ID}&applicationType=WEB&expand=outlets"
MENU_URL = (f"{API}/menus?type=MENU&expand=true,parentSection,sectionHours&expandItems=true,tagActions"
            "&outletId={outlet}&applicationType=WEB")
JSON_ACCEPT = "application/json, text/plain, */*"
PHOTO_PREFIX = "https://s3.amazonaws.com/toasttab/restaurants/"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wahaca")
# Sections whose records are not the table menu's dishes: vegan versions (other photos), kids' meals, set meals, drinks.
SKIP_SECTIONS = {"Vegan", "Kids", "Set Menus", "Softs", "Alcoholic Beverages"}
# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back.
# Run of 2026-11-17: all 25 photos were looked at (contact sheet and at full size): each is a plain studio photo of the dish named, with
# no writing, figures, stickers, logos or brand packs (two have an unbranded glass of beer in the background); none was left out.
DROP_ITEMS: dict[str, str] = {
    # Independent check 2026-11-17: the table menu's trio is Tomatillo, Habanero and Macha (marked n); the ordering site's record of
    # the same name describes Tomatillo, Chipotle and Habanero, so its photo may show a different salsa: left out.
    "trio-of-fresh-salsas": "ordering-site trio is Tomatillo/Chipotle/Habanero; ours is Tomatillo/Habanero/Macha (different salsa)",
}


def get_json(url: str, cache: Path):
    raw = polite_get(url, cache, accept=JSON_ACCEPT, referer=ORDER_SITE)
    try:
        return json.loads(raw)
    except ValueError as e:
        raise SystemExit(f"{url}: not JSON (a challenge page or an error page?): stopping: {e}") from e


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        venues = get_json(VENUES_URL, args.cache)
        outlets = [(v["name"], o["id"]) for v in venues if v.get("liveFlag") == 1 for o in (v.get("outlets") or [])]
        if not outlets:
            raise SystemExit("no live branch in the venues feed: the feed has changed shape")
        photos: dict[str, set[str]] = {}       # norm name -> photo urls seen for it in dish sections
        shown: dict[str, str] = {}             # norm name -> the name as the ordering site prints it
        for vname, outlet in outlets:
            menus = get_json(MENU_URL.format(outlet=outlet), args.cache)
            n = 0
            for menu in menus:
                for sec in menu.get("sections") or []:
                    if sec.get("name") in SKIP_SECTIONS:
                        continue
                    for rec in sec.get("items") or []:
                        n += 1
                        key = norm_name(rec.get("name") or "")
                        shown.setdefault(key, rec.get("name") or "")
                        imgs = sorted(rec.get("images") or [], key=lambda i: i.get("position") or 0)
                        url = (imgs[0].get("image") or "") if imgs else ""
                        photos.setdefault(key, set()).add(url)
            if n == 0:
                raise SystemExit(f"{vname}: no dish records in the menu feed: the feed has changed shape")
            print(f"{vname} (outlet {outlet}): {n} records in dish sections")

        matched: dict[str, str] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            key = norm_name(it["name"])
            urls = photos.get(key)
            if not urls:
                skipped.append(f"{it['id']}: the ordering site names no dish {it['name']!r}")
                continue
            if len(urls) != 1:
                skipped.append(f"{it['id']}: {shown[key]!r} has {len(urls)} different photos (or none on some branches)")
                continue
            url = next(iter(urls))
            if not url.startswith(PHOTO_PREFIX) or urllib.parse.urlsplit(url).path.endswith("/"):
                skipped.append(f"{it['id']}: {shown[key]!r} has no photo file in the ordering site's image store ({url!r})")
                continue
            matched[it["id"]] = url

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}")
                continue
            raw = polite_get(url, args.cache, referer=ORDER_SITE)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, ORDER_SITE)
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
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
