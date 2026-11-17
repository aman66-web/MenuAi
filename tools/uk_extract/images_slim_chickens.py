#!/usr/bin/env python3
"""Item photos for Slim Chickens (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py). RESULT ON 2026-11-17: NO PHOTO CAN BE
TAKEN: every per-dish photo the chain publishes sits on a host whose robots.txt disallows everything (see below). The script exists so the
finding is recorded and a rerun can pick the photos up if that ever changes; until then it writes nothing.

    python3 tools/uk_extract/images_slim_chickens.py --cache DIR [--dry-run]

Where the chain shows its dishes (read 2026-11-17, one request each, cached):
  * www.slimchickens.co.uk (the chain's own website; robots.txt: "User-agent: * / Disallow:" = everything allowed; no sitemap, /sitemap.xml
    answers 404). /menus and its section pages (/menus/tenders, /wings, /boneless-bites, /mix-and-match, /sandwiches, /salad-and-wraps,
    /sides, /shakes, /kids-meals) carry ONE hero picture per menu section (the `menu_hero_image` of each entry of the page's :menus JSON:
    Tenders-meal-1738943536.png, Wings-meal.png, oct-25.png, 5&5.png, CHICKEN_BURGER-1738943659.png, Slims-salad.png, MINI_LOADED_FRIES.png,
    shakes-hero.png, Kids-boneless-bites-meal.png; no alt text) and a sauces banner. The page ties each picture to a section ("Tender
    Meals", "Sides"...), never to one dish, so none is used: one picture for a family of dishes is not a photo of any one of them, and a
    file name is not the page naming a dish. The home, about-us, delivery, loyalty and policy pages show restaurants, murals and banners only.
  * The chain's "Check the Dietary Information" page, https://menus.tenkites.com/brg/slimscore?sitecode=SLM%20Basildon (the page the
    nutrition came from: tools/uk_extract/slim_chickens.py; menus.tenkites.com's robots.txt disallows only /fonts/, /views/ and *.less, so
    the page itself may be read). Its schema.org JSON-LD ("Slims Main Menu") names each dish with an "image": by exact name within the
    dish's own course, 38 of the 93 published dishes have one (the tender, wing and boneless-bite meals, the sandwiches, Slim's Wrap, Texas
    Toast, Mac & Cheese and 14 house sauces). EVERY ONE is a file on images.tenkites.com, whose robots.txt (read 2026-11-17) is
    "User-agent: * / Allow: /tenkitestest/menus.html / Disallow: /". We honour it: no photo is requested (polite_get refuses), and we do not
    look for "the same file" on another host (that would be working round the rule).
  * The chain's click-and-collect ordering site, https://slim-chickens-click-and-collect.order.orderpay.com/ (linked from the chain's
    website): its robots.txt (read 2026-11-17) is "User-agent: * / Disallow: /". Not read beyond robots.txt.
  * Deliveroo, Just Eat and Uber Eats (also linked) are third parties: never used. The app (get-this-app.com/slimchickens) has no public feed.

Match rule (exact, nothing fuzzy; used only if images.tenkites.com ever allows it): a published item (items.csv minus holdback.csv) gets
the photo of the Ten Kites JSON-LD MenuItem that sits under the item's own course (the "course '...'" its notes record) and has the same
images_common.norm_name as the item's name; a name carrying two different images in that course gives no photo (e.g. "Slim Reaper" in
the tender sections: slm_reaper.png and Asset_565925fb...png), and Ten Kites' "no picture" tile (default-unit-picture.jpg) is never used.
Every photo would then have to be looked at on contact sheets before it is kept (DROP_ITEMS below; empty because nothing was fetched).

Terms: the chain's website has no terms of use page (/terms-and-conditions, /terms, /terms-of-use and /website-terms-and-conditions answer
404 on 2026-11-17; the footer links only the privacy policy, the gift card terms and the delivery loyalty terms). None of those has a
clause about copying or reusing the site's content or images: none found. (The privacy policy refers to "any applicable terms of use"
without linking any.)

A 401/403/429, a robots refusal or an unreadable robots.txt stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
from images_common import Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv  # noqa: E402

CHAIN_ID = "slim-chickens"
PAGE_URL = "https://menus.tenkites.com/brg/slimscore?sitecode=SLM%20Basildon"   # the chain's own dietary page (as slim_chickens.py)
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-slim-chickens")
PLACEHOLDERS = ("default-unit-picture.jpg",)   # Ten Kites' "no picture" tile, not a photo of a dish
LD_JSON = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
NOTE_COURSE = re.compile(r"course '([^']+)'")
# Looked at on contact sheets and left without a photo (item id -> why); a rerun must not bring them back. Empty: no photo has been fetched.
DROP_ITEMS: dict[str, str] = {}


def _as_list(x):
    return x if isinstance(x, list) else ([x] if x else [])


def _menu_items(section: dict):
    for it in _as_list(section.get("hasMenuItem")):
        yield it
    for sub in _as_list(section.get("hasMenuSection")):
        yield from _menu_items(sub)


def pictures_by_course(page: str) -> dict[tuple[str, str], set[str]]:
    """{(course as printed, norm_name of the dish): {image urls}} from the page's JSON-LD menu."""
    blocks = LD_JSON.findall(page)
    menus = [json.loads(b) for b in blocks]
    main = [m for m in menus if isinstance(m, dict) and m.get("@type") == "Menu"]
    if len(main) != 1:
        raise SystemExit(f"expected one schema.org Menu on the dietary page, found {len(main)}: the page has changed shape")
    out: dict[tuple[str, str], set[str]] = {}
    for course in _as_list(main[0].get("hasMenuSection")):
        for it in _menu_items(course):
            img = (it.get("image") or "").strip()
            if not img or img.endswith(PLACEHOLDERS):
                continue
            out.setdefault((course.get("name", ""), norm_name(it.get("name", ""))), set()).add(img)
    if not out:
        raise SystemExit("no MenuItem with an image in the page's JSON-LD: the page has changed shape")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    matched: dict[str, str] = {}
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        pics = pictures_by_course(page)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            m = NOTE_COURSE.match(it.get("notes", ""))
            if not m:
                skipped.append(f"{it['id']}: its notes name no course")
                continue
            found = pics.get((m.group(1), norm_name(it["name"])), set())
            if not found:
                skipped.append(f"{it['id']}: no picture named {it['name']!r} in course {m.group(1)!r}")
            elif len(found) > 1:
                skipped.append(f"{it['id']}: {len(found)} different pictures carry the name {it['name']!r}: ambiguous")
            else:
                matched[it["id"]] = next(iter(found))

        hosts = sorted({urllib.parse.urlsplit(u).netloc for u in matched.values()})
        refused = [h for h in hosts if not ic._robots_allow(f"https://{h}/")]   # reads robots.txt only, never a photo
        print(f"{len(matched)} of {len(items)} published items have a picture named after them on {PAGE_URL}; photo hosts: {hosts}")
        if refused:
            print(f"robots.txt of {', '.join(refused)} disallows fetching: no photo can be taken (nothing is requested from it)")
        if args.dry_run:
            for item_id, url in sorted(matched.items()):
                print(f"  {item_id:40} {url.rsplit('/', 1)[-1]}")
            for s in skipped:
                print(f"  no photo: {s}")
            return 0
        for item_id, url in sorted(matched.items()):
            raw = polite_get(url, args.cache, referer=PAGE_URL)   # raises Blocked while robots.txt disallows the host
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
