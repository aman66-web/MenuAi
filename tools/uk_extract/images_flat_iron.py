#!/usr/bin/env python3
"""Item photos for Flat Iron from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_flat_iron.py --cache DIR [--dry-run]

STATUS: 1 of 19 published items. Flat Iron's menu page https://flatironsteak.co.uk/menu/ (the page the calories were read from) is a text
list with no per-dish pictures. It carries one photo gallery (a splide carousel, each slide `<img data-splide-lazy="/wp-content/uploads/<file>"
alt="...">`, the slides repeated once for mobile) whose alt texts are the chain's own captions, e.g. "Flat Iron steak", "Flat Iron steak main and
sides", "Flat Iron Mac and Cheese", "Flat Iron Green Chilli Cheeseburger", "Flat Iron Ice Cream", "Flat Iron Popcorn", "Flat Iron Water",
"Flat Iron Steak and Malbec Wine".

Match rule (exact, nothing fuzzy). A gallery photo goes on a published item only when the slide's alt text, by norm_name, equals the item's name
and every slide that carries that alt shows the same file; captions that add words ("... main and sides", "... and Malbec Wine", "Mac and Cheese"
for the published "Truffled Macaroni Cheese", "Green Chilli Cheeseburger" for the published "Smashed Onion Double Cheeseburger") name a
different product or a meal, so they match nothing. Today that is one item: "Flat Iron Steak" (alt "Flat Iron steak", Flat-Iron-Menu-photos-6.jpg,
checked by eye: a sliced flat iron steak on its board, a pot of bearnaise and a glass at the edge of the frame). The photo is the chain's own
file on its own host (flatironsteak.co.uk/wp-content/uploads/); store_image downsizes it to <= 640 px and converts to WebP, nothing else.

Terms (https://flatironsteak.co.uk/terms-and-conditions/, read 2026-10-11): the site's terms are an ordering/website disclaimer; they contain no
clause about images, photographs, copyright or reuse of site content (the only "Materials" wording is "Flat Iron does not represent or warrant
the accuracy or reliability of any of the information or content about any products or services, software or advertisements (together, the
"Materials") contained on ... this website"), so no express restriction was found. robots.txt (https://flatironsteak.co.uk/robots.txt, read
2026-10-11): a Yoast block "User-agent: * / Disallow:" (nothing disallowed); polite_get checks it on every URL (RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, write_images_csv,
)

CHAIN_ID = "flat-iron"
PAGE_URL = "https://flatironsteak.co.uk/menu/"
HOST = "https://flatironsteak.co.uk"
PHOTO_PATH = "/wp-content/uploads/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-flat-iron")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo

SLIDE = re.compile(r'<img\b[^>]*?\bdata-splide-lazy="([^"]+)"[^>]*?\balt="([^"]*)"', re.S)


def gallery(page: str) -> dict[str, set[str]]:
    """norm_name(alt) -> the set of photo paths the slides with that alt show."""
    out: dict[str, set[str]] = {}
    for src, alt in SLIDE.findall(page):
        out.setdefault(norm_name(htmllib.unescape(alt)), set()).add(src)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, str] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        slides = gallery(page)
        if not slides:
            print("page changed shape: no gallery slides found", file=sys.stderr)
            return 1
        print(f"{sum(len(v) for v in slides.values())} gallery photos with {len(slides)} distinct captions on {PAGE_URL}")
        for it in items:
            if it["id"] in DROP_ITEMS:
                print(f"  no photo: {it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            files = slides.get(norm_name(it["name"]))
            if not files:
                continue
            if len(files) != 1:
                print(f"  no photo: {it['id']}: the caption {it['name']!r} is on {len(files)} different photos")
                continue
            (src,) = files
            if not src.startswith(PHOTO_PATH):
                print(f"  no photo: {it['id']}: {src} is not on the chain's own host")
                continue
            matched[it["id"]] = HOST + src

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {url}")
                continue
            raw = polite_get(url, args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                print(f"  no photo: {item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
            print(f"  {item_id:40} {fname}  <- {url}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
