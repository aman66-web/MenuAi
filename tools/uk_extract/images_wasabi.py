#!/usr/bin/env python3
"""Item photos for Wasabi from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wasabi.py --cache DIR [--dry-run]

Source: https://www.wasabi.uk.com/menus/ (one server-rendered page, WordPress). Each dish is one card:
    <div class="menu-item | ..."> <div class="menu-item__image"> <img src="https://www.wasabi.uk.com/wp-content/uploads/.../<file>.jpg">
    ... <span class="menu-item__title">Harmony Set</span> ... <div class="js-open-item-modal" data-menu-id="2409">
The photo is the image file the page itself shows for the card (the site's own display size, usually 800 px); the
"new" badge is a separate overlay image (new.svg), not part of the photo. We only downsize to <= 640 px and convert to WebP.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when a card's title has the same norm_name as
the item's name in the CURRENT items.csv, exactly one published item has that name, and every card of that name shows the same
photo file. Variants such as "(excl. dressing)", "(standard)", "(large)", "(whole platter)" and the combo rows are NOT given the
base dish's photo (their names are not on the site), and the site's differently worded names ("Yasai Roll Set", "Salmon
Sashimi Set", "Salmon Hosomaki", "Duck Gyoza" ...) are not matched to the guide's wording either.

Terms (https://www.wasabi.uk.com/terms-conditions/, read 2026-10-08), clause 14.2: "You are expressly prohibited from:
14.2.1. reproducing, copying, editing, transmitting, uploading or incorporating into any other materials, any of the Website";
14.4: "you must not use any illustrations, photographs, video or audio sequences or any graphics separately from any accompanying
text"; 14.6: "You must not use any part of the materials on the Website for commercial purposes without obtaining a licence to do so
from us or our licensors." Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2: the founder's accepted risk).
robots.txt (https://www.wasabi.uk.com/robots.txt, read 2026-10-08): "Crawl-delay: 10 / User-agent: * / Disallow:" (nothing
disallowed). We honour the 10 second crawl delay for every request to the host.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wasabi"
PAGE_URL = "https://www.wasabi.uk.com/menus/"
CRAWL_DELAY = 10.0       # robots.txt: "Crawl-delay: 10"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wasabi")
DROP_ITEMS: dict[str, str] = {}   # items looked at after the first run and left without a photo (a rerun must not bring them back)
SKIP_FILES: dict[str, str] = {}   # upload file name -> why it is not used (nutrition text, placeholder...)

CARD = re.compile(r'<div class="menu-item \|[^"]*">(?P<body>.*?)<div class="js-open-item-modal" data-menu-id="(?P<id>\d+)">', re.S)
TITLE = re.compile(r'<span class="menu-item__title">(?P<t>.*?)</span>', re.S)
IMAGE = re.compile(r'<div class="menu-item__image">(?P<b>.*?)</div>', re.S)
IMG_SRC = re.compile(r'<img[^>]*\bsrc="(?P<src>[^"]+)"')
UPLOAD = re.compile(r"^https://www\.wasabi\.uk\.com/wp-content/uploads/[^\s]+\.(?:png|jpe?g|webp)$", re.I)


def quote_url(url: str) -> str:
    """Percent-encode non-ASCII characters (some uploads have a (c) sign in the file name); leave existing escapes alone."""
    return urllib.parse.quote(url, safe=":/%?&=#~@!$'()*+,;-._")


def cards(page: str) -> list[dict]:
    """Every menu card WITH a photo: title, photo URL, menu id."""
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    found: dict[str, set[str]] = {}      # item id -> {photo url}
    skipped: list[str] = []
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

        rows: dict[str, tuple[str, str]] = {}
        for item_id, photos in sorted(found.items()):
            if len(photos) != 1:
                skipped.append(f"{item_id}: {len(photos)} different photos on the site; ambiguous")
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
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        n = sum(1 for p in found.values() if len(p) == 1)
        print(f"{n} of {len(items)} published items matched")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
