#!/usr/bin/env python3
"""Item photos for LEON from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_leon.py --cache <dir> [--dry-run]

Source: the menu pages on https://leon.co/ that the nutrition data came from (/menu/all-day/, /menu/breakfast/,
/menu/bits-in-between/, /menu/coffee/, /menu/drinks/, /menu/kids/). Each dish is a tile
    <a class="menu-grid__item" href="/menu/<slug>/"> <img src="https://cdn.sanity.io/images/m6cxd6zv/production/<asset>"
        alt="<dish name>"> ... <div class="menu-grid__item__text__name"><dish name></div> </a>
and the dish's own page (/menu/<slug>/, linked by the tile) shows the same photo under an <h1> with the same name
(spot-checked for 7 dishes across categories; the script itself reads only the six menu pages). The photos are on
cdn.sanity.io, the asset host those pages load them from.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when a tile's photo alt text AND its
visible caption both name the item exactly (images_common.norm_name equality with the item's name in the CURRENT
items.csv). Not used: the unnamed banner tile at the top of /menu/breakfast/ (no caption, alt "Leon Restaurants"), tiles
for dishes that are not published items (Aji Verde Chicken Mezze, Teas and Infusions, Black Velvet Iced Matcha Latte,
LOVe Burger which is held back). A name shared by two published items, or an item whose tiles show two different photos,
gets no photo. The same dish listed on two pages (Banana and Chocolate Porridge, Kids Egg and Beans Pot, Pain au Chocolat,
Organic Butter Croissant, ...) shows one photo, so it counts once; source_url is the first menu page (in PAGES order)
that shows it.

Which file is fetched: the page's tiles request the photo with a crop rectangle (rect=0,1,W,H-1) and fit=clip. We do not
use that: we fetch the whole photo, `<asset>?w=<min(960, original width)>` (one of the widths the page itself asks for in
its srcset, never enlarged, no crop, no format conversion), and images_common.store_image does the only change
(downsize to <= 640 px, WebP). The photo file's name encodes its pixel size (<hash>-<W>x<H>.<ext>).

Photos that print nutrition numbers or claims must not be used: put the Sanity asset file name in SKIP_FILES after
looking at it (none known; the photos are not downloaded in --dry-run, so this is for the checker to fill in).

Terms (https://leon.co/terms-and-conditions/, read 2026-10-07), "Intellectual Property": "Any graphics, artwork,
information, audio and video are copyrighted by us or an affiliate of ours. This means that you can use the images from
this Website for your own personal use, but you may not use any other elements of the Website, including the images, on
your own website or in any other public or commercial manner. If you want to do this, you must get our prior written
consent." and "None of the content may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without
the prior written consent of the copyright holder. We're generous, so just ask." Installed on the founder's decision of
2026-10-06 (CLAUDE.md rule 2; the founder's accepted risk): a chain's photos come down the day it asks.
robots.txt: https://leon.co/robots.txt answers 404 (no rules); https://cdn.sanity.io/robots.txt (read 2026-10-07) says
"User-agent: * / Allow: /files/cgnmnbqj/ / Disallow: /*.pdf / Disallow: /*.PDF", so /images/ is allowed. polite_get
checks both on every URL (note: Python's robots parser reads "/*.pdf" literally; none of our URLs is a PDF).

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "leon"
SITE = "https://leon.co"
# The menu pages the nutrition data came from (one request each, cached). /menu/rice-boxes/, /menu/wraps/ ... are
# nav anchors on /menu/all-day/ and answer 404 as pages, so they are not listed.
PAGES = ["/menu/all-day/", "/menu/breakfast/", "/menu/bits-in-between/", "/menu/coffee/", "/menu/drinks/", "/menu/kids/"]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
SKIP_FILES: dict[str, str] = {}   # Sanity asset file name -> why it is not used (nutrition text, placeholder, ...)
WIDTH = 960                       # the page's own srcset asks for this width; every original here is at least 1086 px wide

# A dish tile (the banner at the top of /menu/breakfast/ has no class and no caption, so it never matches).
TILE = re.compile(r'<a class="menu-grid__item" href="(?P<href>/menu/[a-z0-9-]+/)">(?P<inner>.*?)</a>', re.S)
IMG = re.compile(r'<img src="(?P<src>[^"]+)" alt="(?P<alt>[^"]*)"')
CAPTION = re.compile(r'<div class="menu-grid__item__text__name">(?P<name>.*?)</div>', re.S)
ASSET = re.compile(r"^https://cdn\.sanity\.io/images/(?P<project>[a-z0-9]+)/(?P<dataset>[a-z0-9]+)/"
                   r"(?P<file>[0-9a-f]{40}-(?P<w>\d+)x(?P<h>\d+)\.(?:jpg|jpeg|png|webp))(?:\?|$)")


def tiles(page: str) -> list[tuple[str, str, str]]:
    """(dish name, item page path, photo URL) for every dish tile whose photo alt text and visible caption agree."""
    out = []
    for m in TILE.finditer(page):
        img = IMG.search(m.group("inner"))
        cap = CAPTION.search(m.group("inner"))
        if not img or not cap:
            continue
        alt = html.unescape(img.group("alt"))
        name = html.unescape(re.sub(r"<[^>]+>", "", cap.group("name")))
        if ic.norm_name(alt) != ic.norm_name(name) or not ic.norm_name(name):
            continue
        a = ASSET.match(html.unescape(img.group("src")))
        if not a:
            continue
        w = min(WIDTH, int(a.group("w")))
        photo = (f"https://cdn.sanity.io/images/{a.group('project')}/{a.group('dataset')}/{a.group('file')}?w={w}")
        out.append((name, m.group("href"), photo))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; fetch only the menu pages; write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    found: dict[str, dict[str, tuple[str, str]]] = {}   # item id -> {photo url: (menu page url, item page url)}
    skipped: list[str] = []
    try:
        for path in PAGES:
            page_url = SITE + path
            page = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            found_here = tiles(page)
            print(f"{len(found_here)} named dish tiles on {page_url}")
            for name, href, photo in found_here:
                ids = by_name.get(ic.norm_name(name))
                if not ids:
                    continue
                if len(ids) > 1:
                    skipped.append(f"{name!r} is the name of {len(ids)} published items")
                    continue
                fname = photo.split("?")[0].rsplit("/", 1)[-1]
                if fname in SKIP_FILES:
                    skipped.append(f"{ids[0]['id']}: {fname} skipped: {SKIP_FILES[fname]}")
                    continue
                found.setdefault(ids[0]["id"], {}).setdefault(photo, (page_url, SITE + href))
        if args.dry_run:   # the photos are not fetched in a dry run, but their host's robots.txt rules are checked now
            for item_id, photos in found.items():
                for photo in photos:
                    if not ic._robots_allow(photo):
                        raise ic.Blocked(f"robots.txt disallows {photo}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows: dict[str, tuple[str, str]] = {}
    matched = 0
    names = {it["id"]: it["name"] for it in items}
    for item_id in sorted(found):
        photos = found[item_id]
        if len(photos) > 1:
            skipped.append(f"{item_id}: {len(photos)} different photos on the site; ambiguous, no photo")
            continue
        photo, (page_url, item_page) = next(iter(photos.items()))
        matched += 1
        if args.dry_run:
            print(f"  {item_id:46} {names[item_id]!r}  {photo}  <- {page_url}  (dish page {item_page})")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=page_url)
            rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            print(f"  {item_id:46} {rows[item_id][0]}  <- {photo}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            matched -= 1
            skipped.append(f"{item_id}: {photo}: {e}")

    for it in items:
        if it["id"] not in found:
            skipped.append(f"{it['id']}: no tile on the menu pages names {it['name']!r}")
    for s in skipped:
        print("  no photo:", s)
    if args.dry_run:
        print(f"{matched} of {len(items)} published items matched")
        return 0

    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  suspected_placeholders: {f} is used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
