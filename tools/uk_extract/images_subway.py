#!/usr/bin/env python3
"""Item photos for Subway UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_subway.py --cache DIR [--dry-run]

Source: the eight category pages https://www.subway.com/en-gb/menu/category/<id> (the same pages tools/uk_extract/subway_html.py reads the
products from; nothing else is requested besides the photo files). Every product card on them is one record:
`<button data-testid="card-list-<product id>"> <img src="/en-gb/dam/urn:aaid:aem:<uuid>/renditions/original/as/<Name>.png"> <h2 class="card__title">name
</h2> <p class="card__description">...`. The photo is a file on www.subway.com itself (/en-gb/dam/...), the chain's own media path named by the card.
(The files are named .png but are JPEG; store_image reads the bytes, resizes to <= 640 px and writes WebP, nothing else.)

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the item's notes in items.csv name the product it was built from ("product <id>; listed under ..."), and the card with data-testid
     card-list-<id> exists on a category page (the Saver Subs category 1099 wins where a product is listed twice, as in subway_html.py),
  2. the card's name, completed the way subway_html.display_name does (a sub, wrap or salad gets "Sub"/"Wrap"/"Salad" from the card's own
     description), has the same norm_name as the item's name, and
  3. the card's photo is a file under /en-gb/dam/ on www.subway.com (not the shared logo placeholder /en-gb/dam/c4/454x342-sw-logo.jpg, not an
     unnamed ".png").
Subway's pages carry the caption "Image for illustrative purposes only." and the product page "Nutritional may not match product image": the photo
shows the product the card names, not necessarily the exact serving, so items where the picture prints a figure (e.g. "FOOTLONG 42G OF PROTEIN" on
a picture while our figures are for the 6-inch) are left out below (DROP_ITEMS): see the list in this file.

Terms (https://www.subway.com/en-gb/legal/terms-of-use/, section 3 "Permitted Use of the Site; Use Restrictions", read 2026-10-11): "The Site's content is
prohibited from being copied, reproduced, downloaded, distributed, modified, republished, uploaded, licensed, adopted, adapted, posted or transmitted in any
way, except as may be otherwise explicitly permitted by us in writing." and, among the things a visitor agrees not to do, "Engage in data mining or similar
data gathering or extraction activities or retrieve data or other content from the Site (including, without limitation, using spiders, robots, indexing agents,
and screen scrapers) for purposes of creating or compiling that content for any purpose". An express restriction; installed on the founder's decision of
2026-10-06 (his accepted risk). robots.txt (https://www.subway.com/robots.txt, read 2026-10-11): one group, `User-agent: *`,
Disallow: /sitecore/ and some /en-us, /en-ca, /fr-ca, /es-us, /en-pr, /es-pr delivery-locator paths: the category pages and /en-gb/dam/ files are
allowed; no group names an AI crawler (subway_html.py refuses to run if one does). polite_get checks robots.txt on every URL (RFC 9309).
(media.subway.com is NOT used: its robots.txt says `Disallow: /`.)

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import subway_html  # noqa: E402  (CATEGORIES, tidy, display_name: the same reader the items came from)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "subway"
HOST = "https://www.subway.com"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-subway")
# Looked at on contact sheets after the first run (2026-10-11) and left without a photo; a rerun must not bring them back.
# (a) the picture prints a protein figure on a green badge: "FOOTLONG 42G OF PROTEIN", "SALAD 22g OF PROTEIN", "WRAP 27g OF PROTEIN" (our tables
#     show the 6-inch sub, the wrap and the salad as printed: the picture's figure could contradict them, and a footlong is not our serving).
PRINTED_FIGURE = """chicken-tikka-sub chicken-breast-sub rotisserie-style-chicken-sub philly-steak-sub ham-sub turkey-breast-wrap ham-salad
rotisserie-style-chicken-wrap chicken-tikka-salad turkey-breast-salad philly-steak-salad chicken-tikka-wrap rotisserie-style-chicken-salad
chicken-breast-salad""".split()
# (b) the picture carries a "NEW" burst (a sticker that goes stale; the same kind of sticker as "new recipe"). Set to False to keep these 23.
DROP_NEW_BADGE = True
NEW_BADGE = """shawarma-spiced-chicken-jacket-potato beef-chilli-protein-pot chicken-and-bacon-salad 5-bean-chilli-loaded-nachos pumpkin-spiced-cookie
beef-chilli-jacket-potato matcha-and-white-chocolate-chip-cookie 5-bean-chilli-jacket-potato 5-bean-chilli-salad chilli-beef-salad chicken-and-bacon-wrap
5-bean-chilli-wrap chilli-beef-sub chicken-and-bacon-jacket-potato 5x-mozzarella-and-cheddar-bites 5-bean-chilli-protein-pot sauce-dunk-pot chilli-beef-wrap
chicken-and-bacon-sub beef-chilli-loaded-waffle-fries 5-bean-chilli-sub 5-bean-chilli-loaded-waffle-fries 3x-pumpkin-spiced-cookie""".split()
# (c) one generic Subway paper cup for coffee, latte and hot chocolate alike: not a photo of that drink
GENERIC_CUP = "large-coffee large-latte regular-hot-chocolate regular-latte".split()
DROP_ITEMS: dict[str, str] = {}
DROP_ITEMS.update({i: "the picture prints a protein figure on a badge (footlong/salad/wrap 'g of protein')" for i in PRINTED_FIGURE})
if DROP_NEW_BADGE:
    DROP_ITEMS.update({i: "the picture carries a 'NEW' sticker" for i in NEW_BADGE})
DROP_ITEMS.update({i: "one generic Subway paper cup is used for every hot drink: not a photo of this drink" for i in GENERIC_CUP})
# looked at 2026-10-11: the "Saver Subs" pictures carry large promotional lettering over the photo (not a plain photograph)
DROP_ITEMS.update({i: "the picture carries large 'SAVER SUBS' promotional lettering over the photo" for i in (
    "blt-saver-sub", "ham-and-cheese-saver-sub-toastie", "nacho-chicken-saver-sub", "triple-cheese-saver-sub-toastie")})

NOTE_PID = re.compile(r"product (\d+);")
CARD = re.compile(r'<button data-testid="card-list-(\d+)"(.*?)</button>', re.S)
PLACEHOLDER_NAMES = ("454x342-sw-logo.jpg",)   # the chain's shared logo tile (used on 4 cards), not a photo of a product


def parse_cards(page: str, cid: str) -> list[dict]:
    out = []
    for pid, body in CARD.findall(page):
        title = re.search(r'<h2 class="card__title">(.*?)</h2>', body, re.S)
        desc = re.search(r'<p class="card__description">(.*?)</p>', body, re.S)
        img = re.search(r'<img[^>]*?\ssrc="([^"]+)"', body)
        out.append({
            "pid": pid, "cid": cid,
            "title": subway_html.tidy(title.group(1)) if title else "",
            "desc": subway_html.tidy(desc.group(1)) if desc else "",
            "src": htmllib.unescape(img.group(1)) if img else "",
        })
    if not out:
        raise SystemExit(f"category {cid}: no product cards found: the page has changed shape")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        listed: dict[str, dict] = {}
        for cid in subway_html.CATEGORIES:
            url = f"{HOST}/en-gb/menu/category/{cid}"
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for card in parse_cards(page, cid):
                prev = listed.get(card["pid"])
                if prev is None or cid == "1099":
                    listed[card["pid"]] = card
        print(f"{len(listed)} product cards on the category pages of {HOST}/en-gb/menu")

        matched: dict[str, tuple[str, dict]] = {}   # item id -> (photo url, card)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            m = NOTE_PID.search(it.get("notes", ""))
            if not m:
                skipped.append(f"{it['id']}: notes name no product")
                continue
            card = listed.get(m.group(1))
            if not card:
                skipped.append(f"{it['id']}: product {m.group(1)} is no longer on the category pages")
                continue
            try:
                shown = subway_html.display_name(card["title"], card["desc"], card["cid"])
            except SystemExit:
                skipped.append(f"{it['id']}: the card's description no longer says what kind of product it is")
                continue
            if norm_name(shown) != norm_name(it["name"]):
                skipped.append(f"{it['id']}: card {shown!r} does not carry the name {it['name']!r}")
                continue
            src = card["src"]
            if not src.startswith("/en-gb/dam/"):
                skipped.append(f"{it['id']}: the card's picture {src!r} is not a file in the chain's /en-gb/dam/ media path")
                continue
            if any(src.endswith(p) for p in PLACEHOLDER_NAMES) or src.endswith("/.png"):
                skipped.append(f"{it['id']}: the card's picture is the shared logo tile or an unnamed file, not a photo of the product")
                continue
            matched[it["id"]] = (HOST + src, card)

        for item_id, (url, card) in sorted(matched.items()):
            page_url = f"{HOST}/en-gb/menu/category/{card['cid']}"
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}  <- card {card['pid']} {card['title']!r}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
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
