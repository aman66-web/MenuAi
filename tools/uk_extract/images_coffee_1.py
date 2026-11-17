#!/usr/bin/env python3
"""Item photos for Coffee #1 from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_coffee_1.py --cache DIR [--dry-run]

STATUS 2026-11-17: run (dry run and real run), 0 of 553 published items matched, NO photo installed, nothing written. Coffee #1's own website
publishes no per-dish photos: this script is kept so a rerun picks them up if the site ever names a photo after a dish.

What the chain's own site shows (all read 2026-11-17 with polite_get, robots.txt honoured):
  * https://www.coffee1.co.uk/menu-kcal/ ("Menu", food and drinks tabs) and https://www.coffee1.co.uk/menu-kcal/seasonal-menu/ are TEXT lists:
    `<li>Bacon Bap <span class="menurow-kcal">384kcal</span></li>`, one line per product, no picture per line. Between the sections sit a few
    full-width "promobar" banners (<div class="promobar"><img ...></div>): on 2026-11-17 a Christmas platter ("a snapshot of the coffee#1
    Christmas products"), a cortado-style glass with alt="" (the only name is the photographer's file name "COFFEE #1 CORTADO_0078"; the page
    does not name it, and our Cortado rows are five milk variants with no product record tying a photo to each), three iced matchas side by side
    with alt="", "coffee#1 festive drinks" (a group shot), "Coffee#1 Black Forest Slice" (a seasonal product that is not in the published menu
    data) and one unnamed seasonal shot. None names a published item, so none is used.
  * The nutrition PDFs linked from https://www.coffee1.co.uk/allergy-advice/ (C1-Core-Food-Oct-2026-Issue-Date-1910.pdf,
    C1-Core-Beverage-Allergen-Nutritional-Information-April-26-v1.pdf) hold no product photos (pdfimages: header banners and the logo only).
  * The WordPress media library (/wp-json/wp/v2/media, newest 77 entries) holds photo-shoot files named by shoot and frame number
    ("Coffee#1 2026 Autumn-Christmas WebRes-2826"), not product records.
  * Ordering: click and collect is in the Coffee #1 app only (coffee1.app.link, no web ordering site linked from the chain's pages); delivery is
    through Just Eat and Uber Eats (aggregators: never used).

Match rule (exact, nothing fuzzy). On the menu pages and the home page, an <img> on www.coffee1.co.uk/wp-content/uploads/ is attached to a
published item only when its alt text, as the page prints it, has the same norm_name as the item's full name, or is exactly "Coffee#1 " followed
by that name (the seasonal page writes alts that way: "Coffee#1 Black Forest Slice"); no word of the dish is dropped. A milk/size variant row
("Latte (oat milk, large)") only matches an alt that names that variant; a photo named only "Latte" is NOT spread over the variants (there is no
product record on these pages that lists them). The same photo address used for 4 or more items is reported for a look by eye. Every kept
photo must then be looked at on a contact sheet (photo_sheet.py) and bad ones added to DROP_ITEMS.

robots.txt (https://www.coffee1.co.uk/robots.txt, read 2026-11-17): "User-agent: * / Disallow: /wp-admin/ / Allow: /wp-admin/admin-ajax.php" and
a sitemap line: the menu pages, the uploads folder and /wp-json/ are allowed; no group names an AI crawler. polite_get checks it on every URL.

Terms (https://www.coffee1.co.uk/terms-and-conditions/, "Intellectual property rights", read 2026-11-17): "You may print off one copy, and may
download extracts, of any page(s) from our site for your personal use ... You must not modify the paper or digital copies of any materials you have
printed off or downloaded in any way, and you must not use any illustrations, photographs, video or audio sequences or any graphics separately from
any accompanying text. ... You must not use any part of the content on our site for commercial purposes without obtaining a licence to do so from us
or our licensors." The acceptable use policy (https://www.coffee1.co.uk/acceptable-use-policy/) adds: "Not to reproduce, duplicate, copy or re-sell any
part of our site in contravention of the provisions of our terms of website use." An express restriction; photos would be installed on the founder's
decision of 2026-10-06 (his accepted risk) if any matched.

A 401/403/429, a robots refusal or an unreadable robots.txt stops the script (exit 1) before anything is written. With no match the real run writes
nothing (no empty images.csv is created).
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "coffee-1"
HOST = "https://www.coffee1.co.uk"
PAGES = [f"{HOST}/menu-kcal/", f"{HOST}/menu-kcal/seasonal-menu/", f"{HOST}/"]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-coffee-1")
BRAND_PREFIX = "coffee 1 "          # norm_name("Coffee#1 ")
# Looked at on contact sheets and left without a photo; a rerun must not bring them back. (Empty: nothing has matched yet.)
DROP_ITEMS: dict[str, str] = {}

IMG = re.compile(r"<img\b[^>]*>", re.I)
ATTR = re.compile(r'(\w[\w-]*)\s*=\s*"([^"]*)"')


def page_images(page: str) -> list[tuple[str, str]]:
    """(absolute src, alt) of every <img> in the page body that is a file in the chain's own uploads folder."""
    out = []
    for tag in IMG.findall(page):
        attrs = {k.lower(): htmllib.unescape(v) for k, v in ATTR.findall(tag)}
        src, alt = attrs.get("src", "").strip(), attrs.get("alt", "").strip()
        if not src or not alt:
            continue
        src = urllib.parse.urljoin(HOST + "/", src)
        if not src.startswith(f"{HOST}/wp-content/uploads/"):
            continue
        out.append((src, alt))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it["id"])

    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, alt)
    seen_alts: list[str] = []
    try:
        for page_url in PAGES:
            page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for src, alt in page_images(page):
                seen_alts.append(f"{page_url} {alt!r} -> {src.rsplit('/', 1)[-1]}")
                key = norm_name(alt)
                if key.startswith(BRAND_PREFIX) and key[len(BRAND_PREFIX):] in by_name:
                    key = key[len(BRAND_PREFIX):]
                ids = by_name.get(key, [])
                if len(ids) != 1:
                    continue        # no published item has this exact name (or two share it: nothing is guessed)
                item_id = ids[0]
                if item_id in DROP_ITEMS:
                    print(f"  no photo: {item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                    continue
                prev = matched.get(item_id)
                if prev and prev[0] != src:
                    print(f"  no photo: {item_id}: two pages show different photos under its name")
                    matched[item_id] = ("", "", "")
                    continue
                matched.setdefault(item_id, (src, page_url, alt))

        matched = {k: v for k, v in matched.items() if v[0]}
        print(f"{len(seen_alts)} named pictures in the uploads folder on {len(PAGES)} pages:")
        for s in seen_alts:
            print(f"  {s}")
        for item_id, (url, page_url, alt) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}  <- alt {alt!r} on {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                print(f"  no photo: {item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {url.rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows and not (ROOT / "data" / "source" / CHAIN_ID / "images.csv").exists():
        print(f"0 of {len(items)} published items have a photo: nothing written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
