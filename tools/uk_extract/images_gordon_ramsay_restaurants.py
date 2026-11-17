#!/usr/bin/env python3
"""Item photos for Gordon Ramsay Restaurants (Street Burger & Street Pizza, Lucky Cat Manchester) from the group's own website
(docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_gordon_ramsay_restaurants.py --cache DIR [--dry-run]

The chain's items come from two calorie PDFs (tools/uk_extract/gordon_ramsay_restaurants.py): Street Burger & Street Pizza (one shared
"DUAL-STREET" matrix) and Lucky Cat Manchester. Where the group's own site shows dishes, read on 2026-11-17:

  Street Burger  https://www.gordonramsayrestaurants.com/en/uk/street-burger/menus/<page>  for <page> in MENU_PAGES below (the
                 "standard" menu and the menu each location page links: charing-cross-road, edinburgh, farringdon, liverpool, reading,
                 the-o2, woking). A Next.js page; every one carries the chain's own schema.org record of its menu,
                 <script type="application/ld+json">{"@type":"Menu","hasMenuSection":[{"name":..,"hasMenuItem":[{"name":..,"image":..}]}]}.
                 Of 118-196 MenuItems per page, only these carry an "image": Sticky Toffee Pudding (section "Desserts"), the six Kids
                 items and one wine (whose "image" is a Restaurant 1890 caviar video still: not a photo of that wine). The image files
                 are on res.cloudinary.com/gordonramsay/ (the group's own Cloudinary account, the host all its Street pages use), in the
                 square rendition the record names (c_fill,w_460,h_460): fetched exactly as the record gives it, then store_image only
                 resizes/re-encodes. The Desserts and Kids sections are flagged ShowImages=false in the page data, so the picture is in
                 the page's published menu record rather than drawn on screen: that record is the chain's own and names the dish.
  Street Pizza   https://www.gordonramsayrestaurants.com/en/uk/street-pizza/menus/<page> (standard, battersea, st-paul-s, Liverpool,
                 woking): read too; no MenuItem on any of them carries an image, so they give nothing.
  Lucky Cat Manchester  https://www.gordonramsayrestaurants.com/lucky-cat-manchester/menus/ and the restaurant's home page: menus are
                 PDFs only (A La Carte, Lunch, Afternoon Tea, Desserts...); the pages show no per-dish photos (only a hero picture and
                 two promotional tiles whose alt text is a file name, e.g. "GRR LC BISHOPSGATE DECEMBER 2024 FOOD BONITO FRIED DUCK LEG
                 BAO": a Bishopsgate promotion, not a menu record, and not our "Bonito fried duck leg"). Not fetched by this script.
  Delivery       the Street pages' "Delivery" links go to Deliveroo and Uber Eats only: third parties, never used.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the item is one of Street Burger & Pizza's (category "Street Burger & Pizza · ..."),
  2. a MenuItem on a Street menu page has the same norm_name as the item's name, and no other published Street item has that norm_name
     (our file has two "Brocolli" and two "G.F.C" rows: such a name is never matched, whatever the page says),
  3. every MenuItem with that name, on every page read, names the same one image URL (two different pictures for one name: none), and
  4. that image URL is used by no MenuItem of any other name on any page (a picture shared by different dishes is a placeholder: the
     Kids "Plant-Based Burger" picture is also given to "Bottomless Ice Cream" and "FRUIT SHOOT ...") and is a file under
     https://res.cloudinary.com/gordonramsay/image/upload/.
The Kids records name "Beef Burger", "'Say Cheese' Burger", "Little G.F.C Burger", "Plant-Based Burger": none is the name of our "Kids Beef
Burger", "Kids Cheeseburger", "Kids Chicken Burger" or "Kids Vegan Burger" (the section heading is not added to a name), so none is matched.

Result of 2026-11-17: 1 of 216 published items has a photo (Sticky Toffee Pudding), looked at on a contact sheet: a plain photograph of the
pudding with toffee sauce and a scoop of ice cream on the restaurant's printed tray paper (no figures, prices, stickers or offer text).

robots.txt (read 2026-11-17): https://www.gordonramsayrestaurants.com/robots.txt is one group `User-agent: *`, `Allow: /`,
`Disallow: /admin`, `Disallow: /high/bishopsgate/manifest.webmanifest*`: the menu pages are allowed. https://res.cloudinary.com/robots.txt
has only commented-out lines (no rules). No group names an AI crawler. polite_get checks robots.txt on every URL (RFC 9309).

Terms (read 2026-11-17): the site's Disclaimer (https://www.gordonramsayrestaurants.com/disclaimer/ and
https://www.gordonramsayrestaurants.com/en/uk/street-burger/disclaimer) says "Copyright in this website belongs to Gordon Ramsay Restaurants
Limited unless otherwise indicated."; the Terms & Conditions pages (/terms-and-conditions/, /en/uk/street-burger/terms-and-conditions) cover
bookings, vouchers and offers only, with no clause about copying or reusing the site's content or images. No express prohibition found;
the copyright notice is reported. Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written. A menu page that answers 404 is skipped and reported.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "gordon-ramsay-restaurants"
HOST = "https://www.gordonramsayrestaurants.com"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-gordon-ramsay-restaurants")
STREET_PREFIX = "Street Burger & Pizza · "
IMAGE_PREFIX = "https://res.cloudinary.com/gordonramsay/image/upload/"
# The menu pages read (2026-11-17: the "standard" menu and the one each location page links), Street Burger first, so a photo's
# source_url is the first Street Burger page that names it.
MENU_PAGES = [f"{HOST}/en/uk/street-burger/menus/{p}" for p in
              ("standard", "charing-cross-road", "edinburgh", "farringdon", "liverpool", "reading", "the-o2", "woking")] + \
             [f"{HOST}/en/uk/street-pizza/menus/{p}" for p in ("standard", "battersea", "st-paul-s", "Liverpool", "woking")]
# Looked at on a contact sheet (2026-11-17) and left without a photo; a rerun must not bring them back. (None so far.)
DROP_ITEMS: dict[str, str] = {}

LD_JSON = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S)


def menu_records(page: str, url: str) -> list[dict]:
    """[{section, name, image}] from the page's schema.org Menu record."""
    out = []
    menus = []
    for block in LD_JSON.findall(page):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for d in (data if isinstance(data, list) else [data]):
            if isinstance(d, dict) and d.get("@type") == "Menu":
                menus.append(d)
    if not menus:
        raise SystemExit(f"{url}: no schema.org Menu record found: the page has changed shape")
    for m in menus:
        for sec in m.get("hasMenuSection") or []:
            for it in sec.get("hasMenuItem") or []:
                out.append({
                    "section": htmllib.unescape(sec.get("name") or "").strip(),
                    "name": htmllib.unescape(re.sub(r"<[^>]+>", " ", it.get("name") or "")).strip(),
                    "image": (it.get("image") or "").strip(),
                })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    street = [it for it in items if it["category"].startswith(STREET_PREFIX)]
    name_count: dict[str, int] = {}
    for it in street:
        name_count[norm_name(it["name"])] = name_count.get(norm_name(it["name"]), 0) + 1

    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        by_name: dict[str, dict[str, str]] = {}     # norm name -> {image url: first page url}
        names_by_image: dict[str, set[str]] = {}    # image url -> norm names of every MenuItem that uses it
        printed: dict[str, str] = {}                # norm name -> name as the page prints it
        for url in MENU_PAGES:
            try:
                page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                print(f"  menu page {url} answered HTTP {e.code}: skipped")
                continue
            recs = menu_records(page, url)
            with_img = [r for r in recs if r["image"]]
            print(f"{url}: {len(recs)} menu items, {len(with_img)} with an image")
            for r in with_img:
                key = norm_name(r["name"])
                by_name.setdefault(key, {}).setdefault(r["image"], url)
                names_by_image.setdefault(r["image"], set()).add(key)
                printed.setdefault(key, r["name"])

        matched: dict[str, tuple[str, str]] = {}    # item id -> (photo url, page url)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if not it["category"].startswith(STREET_PREFIX):
                continue   # Lucky Cat Manchester publishes no per-dish photos (see the docstring)
            key = norm_name(it["name"])
            if key not in by_name:
                continue
            if name_count[key] > 1:
                skipped.append(f"{it['id']}: {name_count[key]} published Street items are called {it['name']!r}: not matched")
                continue
            imgs = by_name[key]
            if len(imgs) > 1:
                skipped.append(f"{it['id']}: the pages give {len(imgs)} different pictures for {printed[key]!r}")
                continue
            (img, page_url), = imgs.items()
            if len(names_by_image[img]) > 1:
                skipped.append(f"{it['id']}: the picture for {printed[key]!r} is also given to other dishes "
                               f"({', '.join(sorted(names_by_image[img] - {key}))}): a shared placeholder")
                continue
            if not img.startswith(IMAGE_PREFIX):
                skipped.append(f"{it['id']}: the picture {img!r} is not a file in the group's own Cloudinary account")
                continue
            matched[it["id"]] = (img, page_url)

        for item_id, (url, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.split('/upload/', 1)[1]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {url.split('/upload/', 1)[1]}")
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
