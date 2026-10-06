#!/usr/bin/env python3
"""Item photos for Bagel Factory from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_bagel_factory.py [--cache DIR] [--dry-run]

Source: https://bagelfactory.co.uk/menu/ (the page the nutrition data came from) links every bagel to its own page
(/menu/<slug>/). Each bagel's own page shows ONE photo of it: <img id="single-bagel-image" alt="<bagel name>"
data-src="https://cdn.bagelfactory.co.uk/upload/w_696,o_jpg/https://bagelfactory.co.uk/wp-content/uploads/<file>.png">.
The chain's CDN only resizes/re-encodes the original upload, and some uploads are smaller than the CDN width (it would
upscale), so we fetch the ORIGINAL upload on bagelfactory.co.uk (the same file the page's og:image names) and let
store_image do the only change (downsize to <= 640 px, WebP).

Match rule: a photo is attached to a published item only when the bagel page's own photo alt text AND the menu tile that
links to that page both name the item exactly (norm_name equality with the item's name in the CURRENT items.csv), and the
tile and the page show the same upload. Nothing is matched by slug, file name or similarity. Items whose name matches no
page, or more than one, get no photo.

Terms (https://bagelfactory.co.uk/terms-and-conditions/, read 2026-10-06): "Redistribution or republication of any part of
this site or its content is prohibited, including such by framing or other similar or any other means, without the express
written consent of the Company." Installed on the founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (read 2026-10-06) disallows only /wp-admin/ and WooCommerce upload folders; polite_get checks it on every URL.

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

CHAIN_ID = "bagel-factory"
BASE = "https://bagelfactory.co.uk"
MENU_URL = f"{BASE}/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-bagel-factory")

# A menu tile: <a href="https://bagelfactory.co.uk/menu/<slug>/" ...> ... <img alt="<name>" ... data-src="<cdn url>">
TILE = re.compile(
    r'<a href="(?P<href>https://bagelfactory\.co\.uk/menu/[a-z0-9-]+/)"[^>]*>\s*'
    r'<div class="filler"[^>]*></div>\s*<picture>.*?<img alt="(?P<alt>[^"]*)"[^>]*data-src="(?P<src>[^"]+)"',
    re.S)
# The bagel page's own photo.
SINGLE = re.compile(r'<img id="single-bagel-image"[^>]*?alt="(?P<alt>[^"]*)"[^>]*?data-src="(?P<src>[^"]+)"', re.S)
UPLOAD = re.compile(r"^https://cdn\.bagelfactory\.co\.uk/upload/[^/]+/(?P<orig>https://(?:www\.)?bagelfactory\.co\.uk/wp-content/uploads/[^\s\"']+\.(?:png|jpe?g|webp))$", re.I)


def strip_comments(page: str) -> str:
    # The menu page keeps old, switched-off markup inside HTML comments: only live markup counts.
    return re.sub(r"<!--.*?-->", "", page, flags=re.S)


def original_upload(cdn_url: str) -> str | None:
    m = UPLOAD.match(html.unescape(cdn_url))
    if not m:
        return None
    orig = urllib.parse.unquote(m.group("orig"))
    return orig.replace("://www.bagelfactory.co.uk/", "://bagelfactory.co.uk/")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    try:
        menu = strip_comments(polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8"))
        tiles: dict[str, list[tuple[str, str]]] = {}   # norm name -> [(page url, original upload)]
        for m in TILE.finditer(menu):
            orig = original_upload(m.group("src"))
            if orig:
                tiles.setdefault(norm_name(html.unescape(m.group("alt"))), []).append((m.group("href"), orig))
        print(f"{len(tiles)} named bagel tiles on {MENU_URL}")

        rows: dict[str, tuple[str, str]] = {}
        skipped: list[str] = []
        for key, its in sorted(by_key.items()):
            if len(its) != 1:
                skipped.append(f"{key}: {len(its)} items share this name")
                continue
            item = its[0]
            found = tiles.get(key, [])
            if len(found) != 1:
                skipped.append(f"{item['id']}: {len(found)} menu tiles named {item['name']!r}")
                continue
            page_url, tile_orig = found[0]
            page = strip_comments(polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8"))
            singles = SINGLE.findall(page)
            if len(singles) != 1:
                skipped.append(f"{item['id']}: {len(singles)} main photos on {page_url}")
                continue
            alt, src = singles[0]
            if norm_name(html.unescape(alt)) != key:
                skipped.append(f"{item['id']}: page photo is captioned {html.unescape(alt)!r}, not {item['name']!r}")
                continue
            orig = original_upload(src)
            if orig is None or orig != tile_orig:
                skipped.append(f"{item['id']}: page photo {orig} differs from the menu tile's {tile_orig}")
                continue
            if args.dry_run:
                print(f"  {item['id']:58} {orig}")
                continue
            raw = polite_get(orig, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item['id']}: {orig}: {e}")
                continue
            rows[item["id"]] = (fname, page_url)
            print(f"  {item['id']:58} {fname}  <- {orig}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
