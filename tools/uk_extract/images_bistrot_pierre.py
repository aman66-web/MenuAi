#!/usr/bin/env python3
"""Item photos for Bistrot Pierre from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_bistrot_pierre.py --cache DIR [--dry-run]

Where Bistrot Pierre shows dish photos.
* The menus (tools/uk_extract/bistrot_pierre.py reads the calories and allergens from them) are Ten Kites pages on viewthe.menu
  (hwyv All Day & Menu Pierre, hwdv Breakfast, hwuv Afternoon Tea, hw2v Petit Pierre, hw7v Bar Pierre), linked from
  www.bistrotpierre.co.uk/allergens/. Read 2026-11-17: they carry no dish pictures at all; the only picture address in them is the chain's
  logo on images.tenkites.com, whose robots.txt (read 2026-11-17) says "Allow: /tenkitestest/menus.html / Disallow: /" (never asked for a file).
* Order & Pay (https://orders.bistrotpierre.co.uk/, the chain's own table-ordering site, linked from /order-pay/; a Zonal iOrder site,
  DNS alias wlwo-iorder.zonalconnect.com): on 2026-11-17 it served a TLS certificate for *.zonalconnect.com only, so
  orders.bistrotpierre.co.uk/robots.txt could not be read ("certificate is not valid for 'orders.bistrotpierre.co.uk'"). RFC 9309 says an
  unreadable robots.txt means "do not fetch", so nothing there was read, and the Zonal host name is not asked instead (a different
  host name is not used to get round that). If the certificate is fixed, its menu feed is worth a look.
* www.bistrotpierre.co.uk itself is a WordPress site ("Site by Propeller"); its pictures are files in its own upload folder
  https://www.bistrotpierre.co.uk/propeller/uploads/ (UPLOADS). The event and menu pages (/events/main-menu/ "À La Carte Menu",
  /private-dining-hire/, /events/mothers-day/ ...) end with a photo carousel whose pictures carry an alt text that the site's editors
  typed: some are the photo's file name ("09.09.26_BP_FullAlbum-75", "18.02.26_BistrotPierre-109"), some name a dish ("Gambas",
  "French Onion Soup", "riz au lait", "Scallops", "Steak frites"), some a place or occasion ("Mumbles PDR", "Valentines day"). Only
  the alt text naming a dish is used; nothing else on these pages ties a picture to a dish (no captions or headings next to them).

Pages read: every page in https://www.bistrotpierre.co.uk/sitemap_index.xml (page-, locations-, rooms- and whatson-sitemap.xml) except
legal, policy, careers, feedback, training and contact pages and the home-recipe pages (SKIP_PAGE: /home/recipes/ and the "recipe of the
week" posts show a dish cooked from a home recipe, not the dish the menu serves). On 2026-11-17 that was 62 pages; one,
/30-years-of-bistrot-pierre/, answered HTTP 500 (a server error, not a refusal) and was not read.

Match rule (exact, nothing fuzzy). A picture `<img ... alt="<name>">` (the file given by its data-flickity-lazyload, data-src or src
attribute) names a published item when its alt text, read with norm_name, equals the item's whole name, and the file is under UPLOADS.
The renditions of one upload (file-800x450.jpg, file-346x480.jpg, file-scaled.jpg) count as one picture; the rendition the naming page
shows is fetched, exactly that address (the largest, if the page shows two). Then:
  1. if the À La Carte menu page /events/main-menu/ (MENU_PAGE, the chain's page for the All Day menu the items come from) names the item
     with exactly one picture, that picture is used;
  2. otherwise the item gets a picture only when exactly one picture on all the pages read carries its name;
  3. where two or more different pictures carry the name and the menu page does not, both were looked at side by side and the one in
     CHOSEN is used only when both show the dish as the current menu describes it (otherwise the item gets none).
A name shared by two published items gives no photo. Alt texts that only come close are never used: "BLT salad" (the item is "French BLT
Salad"), "mac n cheese" ("French Onion Mac N Cheese"), "Sea bass"/"sea bass" ("Pan-Fried Sea Bass"), "salmon" ("Salmon Béarnaise"),
"Calamari 2" ("Calamari"), "Honey Baked Camembert" ("Baked Camembert - Menu Pierre"/"Sharing Camembert"), "afternoon tea" ("French
Afternoon Tea"), "sunday roast" (not on the published menus). "Lamb Tagine" (/events/main-menu/) names an item that is held back
(holdback.csv), so it gets no photo. Photos looked at on contact sheets and left out go in DROP_ITEMS so a rerun can't bring them back.

robots.txt (read 2026-11-17): https://www.bistrotpierre.co.uk/robots.txt is "User-agent: * / Disallow: /wordpress/wp-admin/" with the
sitemap; the pages and /propeller/uploads/ are allowed and no group names an AI crawler. https://viewthe.menu/robots.txt disallows only
/fonts/, /views/ and /*.less$. polite_get checks robots.txt on every URL (RFC 9309) and stops on 401/403/429.

Terms (https://www.bistrotpierre.co.uk/terms/, "Help us preserve our content", read 2026-11-17): "All images, logos, names, trademarks,
articles, news items, feature sections, audio and video files on this site which identify Bistrot Pierre, its personnel and all
intellectual property rights in them (including copyright and trademark rights) (together the "Proprietary Content") are owned or
licensed to Cherry Two Ltd ... By using the site you're agreeing the website is available for personal use only and that you will not
copy, reproduce, publish, distribute or dispose of any content in any way." An express restriction; photos are installed on the founder's
decisions of 2026-10-06 (his accepted risk; a chain's photos come down the day it asks).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written. When no published item matches, no images.csv
is written (an existing one is left alone).

Run of 2026-11-17: 61 of 62 pages read (nothing refused). Five of the 119 published items are named by a picture's alt text and all five have a photo:
  Gambas, French Onion Soup, Riz au Lait   /events/main-menu/ (rule 1; "French Onion soup" also names a second picture of the soup on
                                           /private-dining-hire/, which rule 1 sets aside)
  Scallops                                 /private-dining-hire/ (rule 2)
  Steak Frites                             /private-dining-hire/ "Steak frites" (rule 3: /events/mothers-day/ "Steak Frites" shows another
                                           picture; both show sliced bavette, frites and a jug of sauce, as the menu's "Bavette sliced steak,
                                           frites, Périgueux sauce"; the private-dining one, from the 18 February 2026 shoot, is used)
Each was compared with the menu's own description on viewthe.menu: Gambas "King prawns, chilli butter, sourdough"; French Onion Soup
"Sourdough croûte, Saint Mont cheese"; Riz au Lait "Vanilla rice pudding, caramelised apple, Arlette biscuit"; Scallops "In a shell, burnt
lemon butter". The Gambas and French Onion Soup pictures are table scenes with a salad plate at the side; the dish named is the subject.
The Bistrot Pierre name printed on the plates is the chain's own crockery, and the menu cards in the background are out of focus (no
figures or prices can be read). None left out.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "bistrot-pierre"
HOST = "https://www.bistrotpierre.co.uk"
UPLOADS = HOST + "/propeller/uploads/"
SITEMAPS = ["page-sitemap.xml", "locations-sitemap.xml", "rooms-sitemap.xml", "whatson-sitemap.xml"]
MENU_PAGE = HOST + "/events/main-menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-bistrot-pierre")

# Pages not read: legal, policy, careers, feedback, training, contact, and home recipes (a dish cooked from a recipe, not the menu's dish).
SKIP_PAGE = re.compile(r"/(privacy-policy|governance|terms|join-our-team|visit-feedback|training|get-in-touch|"
                       r"club-bistrot-pierre/(frequently-asked-questions|terms-conditions)|home/recipes|events/recipe-)", re.I)

# Rule 3: two or more different pictures carry the item's name and the menu page does not. Both were looked at (2026-11-17); the page
# whose picture is used. An item not listed here gets no photo in that case.
CHOSEN: dict[str, str] = {
    # /private-dining-hire/ "Steak frites" (18.02.26_BistrotPierre-99) and /events/mothers-day/ "Steak Frites" (2025_12_10_BISTROT_PIERRE_18334):
    # both show sliced bavette, frites and a sauce jug as the menu describes; the mothers-day page is a "check back soon" page whose gallery
    # comes from a Valentine's shoot, so the private-dining one is used.
    "steak-frites": HOST + "/private-dining-hire/",
}

# Looked at on contact sheets and left without a photo; a rerun must not bring them back. (None so far: 2026-11-17.)
DROP_ITEMS: dict[str, str] = {}

IMG = re.compile(r"<img\b[^>]*>", re.I)
ATTR = re.compile(r'([\w-]+)\s*=\s*"([^"]*)"')
RENDITION = re.compile(r"(-\d+x\d+|-scaled)+(?=\.(?:jpe?g|png|webp)$)", re.I)
SIZE = re.compile(r"-(\d+)x(\d+)(?=\.(?:jpe?g|png|webp)$)", re.I)


def page_urls(cache: Path) -> list[str]:
    urls: list[str] = []
    for sm in SITEMAPS:
        xml = polite_get(f"{HOST}/{sm}", cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
            loc = htmllib.unescape(loc.strip())
            if loc.startswith(HOST) and not SKIP_PAGE.search(urllib.parse.urlsplit(loc).path) and loc not in urls:
                urls.append(loc)
    if not urls:
        raise SystemExit("no pages in the sitemaps: the site has changed shape")
    return urls


def pictures(page: str, page_url: str) -> list[tuple[str, str]]:
    """(alt text, absolute file address) for every <img> with an alt text and a file under UPLOADS."""
    out = []
    for tag in IMG.findall(page):
        attrs = {k.lower(): htmllib.unescape(v) for k, v in ATTR.findall(tag)}
        alt = attrs.get("alt", "").strip()
        src = next((attrs[k] for k in ("data-flickity-lazyload", "data-src", "src") if attrs.get(k, "").strip()), "")
        if not alt or not src:
            continue
        src = urllib.parse.urljoin(page_url, src.strip())
        if src.startswith(UPLOADS):
            out.append((alt, src))
    return out


def upload_key(src: str) -> str:
    return RENDITION.sub("", src)


def area(src: str) -> int:
    m = SIZE.search(src)
    return int(m.group(1)) * int(m.group(2)) if m else 10**9   # the unsized / -scaled file is the largest rendition


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it["id"])
    names = {it["id"]: it["name"] for it in items}

    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str, str]] = {}   # item id -> (file url, page url, rule)
    try:
        urls = page_urls(args.cache)
        # item id -> upload key -> {page url: file url shown there}
        named: dict[str, dict[str, dict[str, str]]] = {}
        unread: list[str] = []
        for url in urls:
            try:
                page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:   # a server error (5xx/404), not a refusal: report the page as not read
                unread.append(f"{url} (HTTP {e.code})")
                continue
            for alt, src in pictures(page, url):
                ids = by_name.get(norm_name(alt), [])
                if len(ids) != 1:
                    if len(ids) > 1:
                        skipped.append(f"picture {alt!r} on {url}: the name is shared by {', '.join(ids)}")
                    continue
                shown = named.setdefault(ids[0], {}).setdefault(upload_key(src), {})
                if url not in shown or area(src) > area(shown[url]):
                    shown[url] = src
        print(f"{len(urls) - len(unread)} of {len(urls)} pages read on {HOST}")
        for u in unread:
            print(f"  not read: {u}")

        for item_id, uploads in sorted(named.items()):
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                continue
            on_menu = {k: v[MENU_PAGE] for k, v in uploads.items() if MENU_PAGE in v}
            if len(on_menu) == 1:
                (src,) = on_menu.values()
                matched[item_id] = (src, MENU_PAGE, "1: the menu page names it")
            elif len(on_menu) > 1:
                skipped.append(f"{item_id}: the menu page shows {len(on_menu)} different pictures named {names[item_id]!r}")
            elif len(uploads) == 1:
                (pages,) = uploads.values()
                page_url = sorted(pages)[0]
                matched[item_id] = (pages[page_url], page_url, "2: one picture carries the name")
            elif item_id in CHOSEN:
                page_url = CHOSEN[item_id]
                there = [v[page_url] for v in uploads.values() if page_url in v]
                if len(there) == 1:
                    matched[item_id] = (there[0], page_url, "3: chosen after looking at every picture")
                else:
                    skipped.append(f"{item_id}: CHOSEN page {page_url} no longer shows exactly one picture named {names[item_id]!r}")
            else:
                listing = "; ".join(f"{sorted(p)[0]} {list(p.values())[0].rsplit('/', 1)[-1]}" for p in uploads.values())
                skipped.append(f"{item_id}: {len(uploads)} different pictures carry the name and the menu page does not ({listing})")

        for item_id, (src, page_url, rule) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:30} {src.rsplit('/', 1)[-1]}  <- {page_url} (rule {rule})")
                continue
            raw = polite_get(src, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {src}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:30} {fname}  <- {src.rsplit('/', 1)[-1]} on {page_url}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows:
        print(f"0 of {len(items)} published items matched: images.csv not written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
