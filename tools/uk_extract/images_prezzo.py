#!/usr/bin/env python3
"""Item photos for Prezzo (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_prezzo.py --cache <dir> [--dry-run]

Two sources, both Prezzo's own, tried in this order (an item keeps the photo of the first source that names it):

1. Prezzo's "See our Specials" page, https://www.prezzo.co.uk/about/specials/ (one request, cached). Each special is a card on that
   page: a photo (/media/<id>/<name>.jpg on prezzo.co.uk itself) above the dish's name (<p class="h3">) and its description.
   It is the only page on www.prezzo.co.uk where a photo sits next to a dish name:
     * the allergen & nutrition page (/allergens/, the page the numbers come from) carries `"image": null` for every one of its
       dishes (checked again 2026-11-17: 541 nulls, no image), and so do the a-la-carte, drinks, kids, gluten-free and
       vegetarian-vegan menu pages;
     * the other pages with photos (home, offers, lunch, kids, afternoon tea, brunch, "our best pizza ever has landed"...) show
       banners and lifestyle shots with no dish name beside them, so they are not used.

2. Prezzo's own click-and-collect ordering site, https://prezzo.orderswift.com/<restaurant> (white-label Orderswift storefront,
   titled "Prezzo"). www.prezzo.co.uk links it as each restaurant's "ORDER FOR COLLECTION" button: the restaurant list on
   https://www.prezzo.co.uk/restaurants/ gives every restaurant a "collectionLink" of https://prezzo.orderswift.com/<handle>.
   The storefront is a JavaScript page that reads its menu from the Orderswift API the page itself calls (the same calls,
   nothing else):
     https://api.orderswift.com/operator?handle=prezzo                         -> a "flow" token the page passes on
     https://api.orderswift.com/sites?handle=prezzo&flow=                      -> the restaurants (handles)
     https://api.orderswift.com/menu?site_handle=<h>&channel=collection&flow=<flow>&handle=prezzo&distinct_id=unused
   Each menu item record has its own "name" and "image" (a file in the storefront's asset store,
   https://s3.eu-west-2.amazonaws.com/orderswift-production/assets/...). Every restaurant's menu is read, because the
   collection menus differ between restaurants (on 2026-11-17: five price-tier menus, "C&C - Nov 26 T1 ... T5"). Every menu
   carries its own upload of each photo, and for most dishes some menus carry a different photo of the same dish (a newer
   shoot): uploads with identical bytes count as one photo, and the photo shown on the most storefronts is used (see match()).
   Hidden categories and items (is_hidden) are not used (the page does not show them). The row's source_url is the storefront
   page (https://prezzo.orderswift.com/<handle>) of the first restaurant, in handle order, whose menu shows the chosen upload
   under that name.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the card's or menu record's own name equals
the item's name (images_common.norm_name). Nothing is added to or removed from a name ("Lunch Margherita Pizza" is not
"Margherita", "Tiramisu for Two" is not "Tiramisu for 2", "Days Lager 330ml (0.0% ABV)" is not "Days Lager Alcohol Free").
A name that two published items share gets no photo. On the specials page a name given with two different photos gets none;
on the storefront the photo shown on the most storefronts under that exact name is used (every candidate was looked at on
2026-11-17: the alternatives are other shots of the same dish). Cards and records whose name matches no published item are
ignored, as are items no source names. The storefront's prices, calories and descriptions are not used (the numbers come only
from the allergen page).

robots.txt (read 2026-11-17):
  * https://www.prezzo.co.uk/robots.txt: "User-Agent: * / Disallow: /umbraco#/ / Disallow: /Api/": the specials page, the
    restaurant list and /media/ are allowed.
  * https://prezzo.orderswift.com/robots.txt: "User-agent: * / Disallow:" (everything allowed).
  * https://api.orderswift.com/robots.txt: "User-agent: * / Disallow: /agent/pay/ / Allow: /": operator, sites and menu allowed.
  * https://s3.eu-west-2.amazonaws.com/robots.txt answers 403 AccessDenied (S3 has no such file): no rules (RFC 9309 4xx;
    images_common treats an S3 403 for robots.txt as a missing file).
  images_common.polite_get honours each of them (RFC 9309), 1 request/second per host; 401/403/429 stop the run.

Terms:
  * Prezzo's website terms of use, https://www.prezzo.co.uk/about/website-terms-of-use/ (read 2026-11-17), "Intellectual
    Property Rights": "You may print off one copy, and may download extracts, of any page(s) from our site for your personal use.
    You must not modify the paper or digital copies of any materials you have printed off or downloaded in any way, and you must
    not use any illustrations, photographs, video or audio sequences or any graphics separately from any accompanying text." and
    "You must not use any part of the content on our site for commercial purposes without obtaining a licence to do so from us or
    our licensors."
  * The Orderswift storefront's own "Terms and Conditions" (shown in the storefront, read 2026-11-17): "You may only use the
    Service for non-commercial use", "you are not allowed to: store pages of the Service on a server or other storage device
    connected to a network or create an electronic database by systematically downloading and storing all of the pages of the
    Service" and "All intellectual property rights in any content of the Service (including text, graphics, software, photographs
    and other images, videos, sound, trade marks and logos) are owned by us or our licensors."
  Both are express restrictions; photos are installed on the founder's decision of 2026-10-06 (his accepted risk, CLAUDE.md rule 2).

Run of 2026-11-17: 99 storefronts (2 returned no menu: leeds-white-rose, norwich), 9,703 visible records with a photo, 102
different names; 35 name a published item exactly (Garlic and Parmesan Chicken Strips keeps its specials photo), so 34 new photos
+ the 13 specials = 47 of 418 published items. Every one was looked at on contact sheets: plain photos of the dish on Prezzo's
own plates (the plate rim prints "PREZZO"), no figures, prices, stickers or promotional lettering; none left out. The other 371
items have no record of their exact name on either source (gluten-free, vegan and kids' versions, sizes, pizzettas, extras,
dips, drinks, breakfast, afternoon tea, family sharers: the storefront sells them under other names or not at all).

After every run, look at every photo kept on contact sheets (photo_sheet.py) and add any that must not be used to DROP_ITEMS.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.error
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "prezzo"
SITE = "https://www.prezzo.co.uk"
PAGE = "/about/specials/"
OS_STORE = "https://prezzo.orderswift.com"
OS_API = "https://api.orderswift.com"
OS_HANDLE = "prezzo"
OS_IMAGE_PREFIX = "https://s3.eu-west-2.amazonaws.com/orderswift-production/assets/"
JSON_ACCEPT = "application/json, text/plain, */*"
# specials page photo URL -> why it is not used (filled in after looking at every photo)
DROP: dict[str, str] = {}
# item id -> why it gets no photo (looked at on contact sheets; a rerun must not bring these back)
DROP_ITEMS: dict[str, str] = {}


def cards(page_html: str) -> list[tuple[str, str]]:
    """[(photo url, dish name)] for every card of the specials page that has both a photo and a dish name."""
    out = []
    for chunk in page_html.split('<div class="flex flex-col h-full justify-between">')[1:]:
        img = re.search(r'<img[^>]*\bsrc="(/media/[^"?]+\.(?:jpg|jpeg|png|webp))[^"]*"', chunk)
        name = re.search(r'<p class="h3">(.*?)</p>', chunk, re.S)
        if img and name:
            out.append((SITE + img.group(1), html.unescape(re.sub(r"<[^>]+>", "", name.group(1))).strip()))
    return out


def get_json(url: str, cache: Path) -> dict:
    return json.loads(ic.polite_get(url, cache, accept=JSON_ACCEPT).decode("utf-8"))


def orderswift_records(cache: Path, report: list[str]) -> list[tuple[str, str, str]]:
    """[(photo url, item name, storefront page url)] for every visible item with a photo on every Prezzo storefront menu."""
    flow = get_json(f"{OS_API}/operator?handle={OS_HANDLE}", cache).get("flow") or ""
    sites = get_json(f"{OS_API}/sites?handle={OS_HANDLE}&flow=", cache).get("data") or []
    handles = sorted({s["handle"] for s in sites if s.get("handle")})
    if not handles:
        raise SystemExit("the Orderswift site list is empty: the API has changed shape")
    print(f"{OS_STORE}: {len(handles)} restaurants")
    out = []
    for h in handles:
        url = f"{OS_API}/menu?site_handle={h}&channel=collection&flow={flow}&handle={OS_HANDLE}&distinct_id=unused"
        try:
            menu = (get_json(url, cache).get("data") or {}).get("menu") or {}
        except urllib.error.HTTPError as e:   # 401/403/429 raise Blocked inside polite_get and stop the run
            report.append(f"storefront {h}: the menu call answered HTTP {e.code}: skipped")
            continue
        for cat in menu.get("categories") or []:
            if cat.get("is_hidden"):
                continue
            for it in cat.get("items") or []:
                img = it.get("image") or ""
                if it.get("is_hidden") or not img or not it.get("name"):
                    continue
                if not img.startswith(OS_IMAGE_PREFIX):
                    report.append(f"storefront {h}: {it['name']!r}: picture {img!r} is not in the storefront's asset store: skipped")
                    continue
                out.append((img, it["name"].strip(), f"{OS_STORE}/{h}"))
    return out


def match(found: list[tuple[str, str, str]], by_name: dict[str, list[dict]], label: str, *,
          content: Callable[[str, str], str] | None = None) -> dict[str, tuple[str, str]]:
    """{item id: (photo url, page url)} for every published item that one record name of this source names exactly.

    A name two published items share gets nothing. A name the source shows with more than one photo gets nothing, unless
    `content` is given (the storefront: every restaurant's menu carries its own upload of each photo, and some menus a different
    photo of the same dish). Then the URLs are grouped by their bytes (`content(url, page)` = a hash of the file; byte-identical
    uploads are one photo) and the photo shown on the most storefronts is used (ties: the first URL in sort order). Every candidate
    is the chain's own photo under that exact name, so this chooses between its photos of the dish; it never guesses a dish."""
    photos: dict[str, dict[str, list[str]]] = {}    # norm name -> {photo url: [page urls, in order]}
    for url, name, page in found:
        pages = photos.setdefault(ic.norm_name(name), {}).setdefault(url, [])
        if page not in pages:
            pages.append(page)
    out: dict[str, tuple[str, str]] = {}
    for key, urls in sorted(photos.items()):
        items = by_name.get(key, [])
        if not items:
            continue
        if len(items) > 1 or (len(urls) > 1 and content is None):
            print(f"  {label}: ambiguous {key!r} ({len(items)} items, {len(urls)} photos): skipped")
            continue
        groups: dict[str, list[str]] = {}           # content key -> URLs with those bytes
        for u in sorted(urls):
            groups.setdefault(content(u, urls[u][0]) if content and len(urls) > 1 else u, []).append(u)
        def shown_on(g: str) -> int:
            return len({p for u in groups[g] for p in urls[u]})
        best = sorted(groups, key=lambda g: (-shown_on(g), groups[g][0]))[0]
        url = groups[best][0]
        if len(groups) > 1:
            print(f"  {label}: {key!r} has {len(groups)} different photos ({len(urls)} uploads); using the one shown on "
                  f"{shown_on(best)} of {len({p for v in urls.values() for p in v})} storefronts")
        out[items[0]["id"]] = (url, urls[url][0])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true",
                    help="match only and store nothing (storefront photos that come in several uploads are still downloaded "
                         "to the cache, to tell byte-identical copies from different photos)")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    report: list[str] = []
    page_url = SITE + PAGE
    try:
        page_html = ic.polite_get(page_url, args.cache, accept="text/html").decode("utf-8", "replace")
        specials = [(u, n, page_url) for u, n in cards(page_html) if u not in DROP]
        print(f"{page_url}: {len(specials)} cards with a photo and a dish name")
        storefront = orderswift_records(args.cache, report)
        print(f"{OS_STORE}: {len(storefront)} menu records with a photo")
    except ic.Blocked as e:
        print(f"STOP (nothing written): {e}")
        return 2

    def content(url: str, page: str) -> str:
        """sha256 of a storefront photo's bytes (downloaded once, cached), to tell byte-identical uploads from other photos."""
        return hashlib.sha256(ic.polite_get(url, args.cache, referer=page)).hexdigest()

    chosen: dict[str, tuple[str, str, str]] = {}    # item id -> (photo url, page url, source label)
    try:
        for label, found in (("specials", specials), ("storefront", storefront)):
            for item_id, (url, page) in match(found, by_name, label, content=content if label == "storefront" else None).items():
                if item_id in chosen:
                    continue
                if item_id in DROP_ITEMS:
                    report.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                    continue
                chosen[item_id] = (url, page, label)
    except ic.Blocked as e:
        print(f"STOP (nothing written): {e}")
        return 2

    rows: dict[str, tuple[str, str]] = {}
    for item_id, (url, page, label) in sorted(chosen.items()):
        if args.dry_run:
            print(f"  match {item_id:55} <- {label} {url}")
            continue
        try:
            fname = ic.store_image(CHAIN, ic.polite_get(url, args.cache, referer=page))
        except ic.Blocked as e:
            print(f"STOP (nothing written): {e}")
            return 2
        except ValueError as e:
            report.append(f"{item_id}: {url}: {e}: skipped")
            continue
        rows[item_id] = (fname, page)
        print(f"  {item_id:55} <- {label} {url.rsplit('/', 1)[-1]} -> {fname}")

    for line in report:
        print(f"  {line}")
    by_label: dict[str, int] = {}
    for _, _, label in chosen.values():
        by_label[label] = by_label.get(label, 0) + 1
    if args.dry_run:
        print(f"{len(chosen)} of {len(items)} published items matched ({by_label})")
        return 0
    ic.write_images_csv(CHAIN, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {f} is used by {len(ids)} items: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
