#!/usr/bin/env python3
"""Item photos for Wasabi from its own website and its own ordering site (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers:
images_common.py, and vita_mojo.py for reading the ordering site's pages).

    python3 tools/uk_extract/images_wasabi.py --cache DIR [--dry-run] [--no-ordering-site]

The published items come from Wasabi's nutrition guide PDF (tools/uk_extract/wasabi.py), which carries no photos. Two of Wasabi's
own pages show photos of its dishes; both are read, the website first:

1. Website menu: https://www.wasabi.uk.com/menus/ (one server-rendered WordPress page). Each dish is one card:
       <div class="menu-item | ..."> <div class="menu-item__image"> <img src="https://www.wasabi.uk.com/wp-content/uploads/.../<file>.jpg">
       ... <span class="menu-item__title">Harmony Set</span> ... <div class="js-open-item-modal" data-menu-id="2409">
   The photo is the image file the page itself shows for the card (the site's own display size, usually 800 px); the "new" badge
   is a separate overlay image (new.svg), not part of the photo. (The menus sitemap lists only this one menu page.)

2. Ordering site: https://wasabi.vmos.io/ (the chain's own "Order" site, linked from https://www.wasabi.uk.com/order-wasabi/ and
   used by its "Wasabi Sushi & Bento" app; the platform is Vita Mojo, white-labelled with the chain's name). Every one of its
   shops offers the same single menu ("Wasabi Menu", ORDER_MENU; checked over all 34 shops listed on 2026-11-17, Bluewater has
   none), so one shop's pages are read (ORDER_STORE, 116 High Holborn): the menu page and each category page
   (store/<shop>/menu/category/<category>/bundles?menuUUID=<menu>), in a headless browser, one page at a time, by
   vita_mojo.harvest (the pages only answer inside a browser session; the JSON each page loads, vmos2.vmos.io/catalog/categories/
   <category>/bundles, is saved beside it). Each dish ("bundle") there has a uuid and a name, and the page's photo of that dish is
   https://media-multitenant.vmos-static.com/media/v1/media?entityUUID=<the dish's uuid>&scope=grid: the page's own <img> tags use
   exactly these ids behind a Cloudflare resize-and-crop wrapper (multitenant.vmos-static.com/cdn-cgi/image/fit=cover,...); we fetch
   the ORIGINAL image, never the cropped wrapper. A dish whose media answers 404 has no photo on the site and gets none.
   This source is used only for items the website gives no photo; it adds the two tom yums ("Prawn Tom Yum", "Tofu Tom Yum": the
   website calls them "... Tom Yum Soup", so the website card is not an exact match). Its sachets (soy, wasabi, ginger) have no photo.

We only downsize to <= 640 px and convert to WebP (store_image); nothing is cropped, recoloured or retouched.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  * a website card's title, or an ordering-site dish's name, has the same norm_name as the item's name in the CURRENT items.csv,
  * exactly one published item has that name,
  * on the website every card of that name shows the same photo file; on the ordering site every dish of that name is the same dish
    (one uuid), and the photo is the one tied to that uuid.
Variants such as "(excl. dressing)", "(standard)", "(large)", "(whole platter)", the section-suffixed names the guide prints twice
("Spicy Korean chicken pops (hot sides)" / "(bain marie)") and the combo rows are NOT given the base dish's photo (their names are
on neither site), and the sites' differently worded names ("Yasai Roll Set", "Salmon Sashimi Set", "Salmon Hosomaki", "Salmon
Teriyaki Onigiri" for the guide's "Teriyaki Salmon Onigiri", "Mini Korean BBQ Chicken & Rice", "Chicken Tom Yum", "Duck Gyoza" ...)
are not matched to the guide's wording either.

Looked at by eye (contact sheets, 2026-11-17): every kept photo shows the dish named, in the chain's own packaging where it is sold
in a pot or box (the tom yums in their own printed "tom yum noodle soup" cups); no printed numbers, prices, offers or stickers.
Anything left out is listed in DROP_ITEMS / SKIP_FILES / SKIP_UUIDS so a rerun cannot bring it back.

Terms (https://www.wasabi.uk.com/terms-conditions/, read 2026-10-08 and again 2026-11-17, unchanged), clause 14.2: "You are
expressly prohibited from: 14.2.1. reproducing, copying, editing, transmitting, uploading or incorporating into any other materials,
any of the Website"; 14.4: "you must not use any illustrations, photographs, video or audio sequences or any graphics separately
from any accompanying text"; 14.6: "You must not use any part of the materials on the Website for commercial purposes without
obtaining a licence to do so from us or our licensors." The ordering site shows no terms of its own on its menu pages (footer: "Powered
by" only). Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2: the founder's accepted risk).

robots.txt (read 2026-11-17):
  * https://www.wasabi.uk.com/robots.txt: "Crawl-delay: 10 / User-agent: * / Disallow:" (nothing disallowed). We honour the 10 second
    crawl delay for every request to that host.
  * https://wasabi.vmos.io/robots.txt and https://media-multitenant.vmos-static.com/robots.txt: "User-agent: * / Disallow:" (nothing).
  * https://vmos2.vmos.io/robots.txt answers the app's HTML page (no robots rules: nothing disallowed). The ordering site loads a
    Cloudflare passive bot-detection script but let a normal headless browser read it without any challenge.

A 401/403/429, a challenge page or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import glob
import html
import os
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vita_mojo as vm  # noqa: E402
from images_common import (  # noqa: E402
    ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wasabi"
PAGE_URL = "https://www.wasabi.uk.com/menus/"
CRAWL_DELAY = 10.0       # robots.txt: "Crawl-delay: 10"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wasabi")
DROP_ITEMS: dict[str, str] = {}   # items looked at after the first run and left without a photo (a rerun must not bring them back)
SKIP_FILES: dict[str, str] = {}   # website upload file name -> why it is not used (nutrition text, placeholder...)

ORDER_APP = "https://wasabi.vmos.io"
ORDER_STORE = "4473154f-72d1-428d-9848-a35ce94c99d1"   # 116 High Holborn (every shop offers the same one menu)
ORDER_MENU = "6d8f1a55-362a-4417-9502-8d8dda36823b"    # "Wasabi Menu"
ORDER_DELAY = 3.0                                       # seconds between ordering-site pages
MEDIA = "https://media-multitenant.vmos-static.com/media/v1/media?entityUUID={uuid}&scope=grid"
SKIP_UUIDS: dict[str, str] = {}   # ordering-site dish uuid -> why its photo is not used

CARD = re.compile(r'<div class="menu-item \|[^"]*">(?P<body>.*?)<div class="js-open-item-modal" data-menu-id="(?P<id>\d+)">', re.S)
TITLE = re.compile(r'<span class="menu-item__title">(?P<t>.*?)</span>', re.S)
IMAGE = re.compile(r'<div class="menu-item__image">(?P<b>.*?)</div>', re.S)
IMG_SRC = re.compile(r'<img[^>]*\bsrc="(?P<src>[^"]+)"')
UPLOAD = re.compile(r"^https://www\.wasabi\.uk\.com/wp-content/uploads/[^\s]+\.(?:png|jpe?g|webp)$", re.I)


def quote_url(url: str) -> str:
    """Percent-encode non-ASCII characters (some uploads have a (c) sign in the file name); leave existing escapes alone."""
    return urllib.parse.quote(url, safe=":/%?&=#~@!$'()*+,;-._")


def cards(page: str) -> list[dict]:
    """Every website menu card WITH a photo: title, photo URL, menu id."""
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)
    out = []
    for m in CARD.finditer(page):
        body = m.group("body")
        t, im = TITLE.search(body), IMAGE.search(body)
        if not t or not im:
            continue
        srcs = [html.unescape(s) for s in IMG_SRC.findall(im.group("b")) if not s.endswith("new.svg")]
        if len(srcs) != 1 or not UPLOAD.match(srcs[0]):
            continue
        title = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", t.group("t"))).split())
        out.append({"title": title, "photo": quote_url(srcs[0]), "file": srcs[0].rsplit("/", 1)[-1], "menu_id": m.group("id")})
    return out


def local_browser() -> None:
    """Point vita_mojo at this machine's playwright-core and headless Chromium (its defaults are the cloud machine's paths)."""
    pw = ROOT / "web" / "e2e" / "node_modules" / "playwright-core"
    if pw.is_dir():
        vm.PLAYWRIGHT = str(pw)
    chrome = os.environ.get("PLAYWRIGHT_CHROME")
    if not chrome:
        found = sorted(glob.glob(os.path.expanduser(
            "~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell")))
        found += sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome"))
        chrome = found[-1] if found else None
    if chrome:
        vm.CHROME = chrome


def ordering_dishes(cache: Path) -> dict[str, list[dict]]:
    """norm_name(dish name) -> [{uuid, name, category}] for every dish on every category page of the ordering site's menu."""
    local_browser()
    vm.harvest(cache, ORDER_APP, [(ORDER_STORE, ORDER_MENU)], products=False, skip=r"^$", delay=ORDER_DELAY)
    dishes: dict[str, list[dict]] = {}
    for c in vm.categories(cache, ORDER_STORE, ORDER_MENU):
        for _sub, b in vm.all_bundles(cache, ORDER_STORE, c["uuid"]):
            dishes.setdefault(norm_name(b["name"]), []).append({"uuid": b["uuid"], "name": b["name"], "category": c["uuid"]})
    return dishes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    ap.add_argument("--no-ordering-site", action="store_true", help="read the website menu only")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    found: dict[str, set[str]] = {}      # item id -> {website photo url}
    order_found: dict[str, tuple[str, str]] = {}   # item id -> (ordering-site photo url, page url)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, delay=CRAWL_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
        cs = cards(page)
        print(f"{len(cs)} cards with a photo on {PAGE_URL}")
        for c in cs:
            its = by_key.get(norm_name(c["title"]))
            if not its:
                continue
            if len(its) != 1:
                skipped.append(f"{c['title']!r} is the name of {len(its)} published items")
                continue
            item = its[0]
            if item["id"] in DROP_ITEMS:
                skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                continue
            if c["file"] in SKIP_FILES:
                skipped.append(f"{item['id']}: {c['file']} skipped: {SKIP_FILES[c['file']]}")
                continue
            found.setdefault(item["id"], set()).add(c["photo"])

        if not args.no_ordering_site:
            try:
                dishes = ordering_dishes(args.cache / "ordering-site")
            except SystemExit as e:   # vita_mojo stops on robots, 401/403/429, a challenge page or a changed layout
                raise Blocked(f"ordering site: {e}") from e
            print(f"{sum(len(v) for v in dishes.values())} dishes, {len(dishes)} distinct names on {ORDER_APP} (menu {ORDER_MENU})")
            for key, hits in sorted(dishes.items()):
                its = by_key.get(key)
                if not its:
                    continue
                if len(its) != 1:
                    skipped.append(f"ordering site {hits[0]['name']!r} is the name of {len(its)} published items")
                    continue
                item = its[0]
                if item["id"] in found:          # the website already shows a photo for it
                    continue
                if item["id"] in DROP_ITEMS:
                    skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                    continue
                uuids = {h["uuid"] for h in hits}
                if len(uuids) != 1:
                    skipped.append(f"{item['id']}: {len(uuids)} different dishes carry that name on the ordering site; ambiguous")
                    continue
                (uuid,) = uuids
                if uuid in SKIP_UUIDS:
                    skipped.append(f"{item['id']}: ordering-site photo {uuid} skipped: {SKIP_UUIDS[uuid]}")
                    continue
                pg = f"{ORDER_APP}/store/{ORDER_STORE}/menu/category/{hits[0]['category']}/bundles?menuUUID={ORDER_MENU}"
                order_found[item["id"]] = (MEDIA.format(uuid=uuid), pg)

        for item_id, photos in sorted(found.items()):
            if len(photos) != 1:
                skipped.append(f"{item_id}: {len(photos)} different photos on the website; ambiguous")
                continue
            (photo,) = photos
            if args.dry_run:
                print(f"  {item_id:40} {photo}")
                continue
            raw = polite_get(photo, args.cache, delay=CRAWL_DELAY, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
            print(f"  {item_id:40} {fname}  <- {photo}")

        for item_id, (photo, pg) in sorted(order_found.items()):
            try:
                raw = polite_get(photo, args.cache, referer=ORDER_APP + "/")
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    skipped.append(f"{item_id}: the ordering site shows no photo for it (media 404)")
                    continue
                raise
            if args.dry_run:
                print(f"  {item_id:40} {photo}  (ordering site)")
                continue
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, pg)
            print(f"  {item_id:40} {fname}  <- {photo}  (ordering site)")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        n = sum(1 for p in found.values() if len(p) == 1) + len(order_found)
        print(f"{n} of {len(items)} published items matched (before media 404s)")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
