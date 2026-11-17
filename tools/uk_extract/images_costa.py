#!/usr/bin/env python3
"""Item photos for Costa Coffee from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_costa.py --cache DIR [--dry-run]

STATUS 2026-11-17: written, NOT run against live pages, NO photo installed. www.costa.co.uk (Akamai edge, costa.co.uk.edgekey.net)
does not answer scripted requests: robots.txt timed out twice from this Mac on 2026-11-17 (urllib, 20 s and 40 s; curl got "HTTP/2 stream 1
was not closed cleanly: INTERNAL_ERROR"), as it did from the cloud environment on 2026-10-10 to 2026-10-12. A robots.txt that cannot be read
is "unreachable" in RFC 9309 section 2.3.1.4 (assume complete disallow), so images_common._robots_allow refuses every costa.co.uk URL and this
script stops with Blocked before anything is written. It was NOT worked round (no other client, user agent, proxy or headless browser).
Rerun it when costa.co.uk answers robots.txt; the parser below has never seen a live page, so read the --dry-run output first.

Source: the product pages https://www.costa.co.uk/menu/<slug>, exactly the page each item was read from (data/source/costa/items.csv
notes: "Read from <url>"; the 2026-10-09 read in the founder's Chrome saw a product photo on every one, but its tools exposed no address for
it, data/chrome-inbox/costa/notes.md). Nothing else is requested besides those pages and their photo files.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the item's notes name the product page it was read from (the same product record), and that page is fetched;
  2. the page names the product (JSON-LD Product "name", else og:title before " | ", else the first <h1>) with the same norm_name as the
     item's name, or, for a drink row whose name adds the default size/milk after " - " (e.g. "Latte - Medium, semi-skimmed milk,
     Signature blend"), as the part before " - " (both in-store and take-out rows come from the one page, which shows one photo);
  3. the photo (JSON-LD Product "image", else og:image) is a file on one of Costa's own hosts (COSTA_IMAGE_HOSTS). A photo on any other host
     is reported and NOT stored until a person has checked the host is Costa's own and added it here;
  4. the same photo address is not shown on 4 or more different product pages (that is a share banner or placeholder, not this product).
Every kept photo must then be looked at on a contact sheet (photo_sheet.py) and bad ones added to DROP_ITEMS.

robots.txt (https://www.costa.co.uk/robots.txt): unreadable on 2026-11-17 (timeout), so nothing was fetched. The founder's Chrome read it on
2026-10-09: `Allow: /`, `Disallow: /api/` (product pages allowed; data/chrome-inbox/costa/notes.md). polite_get checks it on every URL.

Terms: none found. costa.co.uk could not be opened on 2026-11-17; on 2026-10-09 https://www.costa.co.uk/terms-and-conditions held only Costa Club
and promotion terms, with no clause on copying, reproducing or automated reading (data/chrome-inbox/costa/notes.md). Check
https://www.costa.co.uk/policies-and-reports when the site answers. Photos are installed even where terms restrict reuse (founder's decision of
2026-10-06, his accepted risk); a clause found later is to be quoted here and in docs/IMAGE_TERMS.md.

A 401/403/429, a robots refusal or an unreadable robots.txt stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "costa"
PAGE_PREFIX = "https://www.costa.co.uk/menu/"
COSTA_IMAGE_HOSTS = {"www.costa.co.uk", "costa.co.uk"}
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-costa")
SHARED_PHOTO_PAGES = 4
# Looked at on contact sheets and left without a photo; a rerun must not bring them back. (Empty: no photo has been downloaded yet.)
DROP_ITEMS: dict[str, str] = {}

NOTE_URL = re.compile(r"Read from (https://www\.costa\.co\.uk/menu/[^\s;]+)")
META = re.compile(r"<meta\s+[^>]*?(?:property|name)=[\"']{}[\"'][^>]*?content=[\"']([^\"']+)[\"']", re.I)
META_REV = re.compile(r"<meta\s+[^>]*?content=[\"']([^\"']+)[\"'][^>]*?(?:property|name)=[\"']{}[\"']", re.I)
JSONLD = re.compile(r"<script[^>]*type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.S | re.I)
H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S | re.I)


def meta(page: str, key: str) -> str:
    for pat in (META, META_REV):
        m = re.search(pat.pattern.format(re.escape(key)), page, re.I)
        if m:
            return htmllib.unescape(m.group(1)).strip()
    return ""


def jsonld_product(page: str) -> dict:
    def walk(node):
        if isinstance(node, list):
            for n in node:
                yield from walk(n)
        elif isinstance(node, dict):
            t = node.get("@type")
            if t == "Product" or (isinstance(t, list) and "Product" in t):
                yield node
            for v in node.values():
                if isinstance(v, (list, dict)):
                    yield from walk(v)
    for block in JSONLD.findall(page):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for prod in walk(data):
            return prod
    return {}


def read_page(page: str, page_url: str) -> tuple[str, str]:
    """(product name, absolute photo address) as the page itself states them."""
    prod = jsonld_product(page)
    name = str(prod.get("name") or "").strip()
    if not name:
        name = meta(page, "og:title").split(" | ")[0].strip()
    if not name:
        m = H1.search(page)
        name = re.sub(r"<[^>]+>", " ", m.group(1)).strip() if m else ""
    img = prod.get("image")
    if isinstance(img, list):
        img = img[0] if img else ""
    if isinstance(img, dict):
        img = img.get("url", "")
    img = str(img or "").strip() or meta(page, "og:image")
    return htmllib.unescape(name), urllib.parse.urljoin(page_url, htmllib.unescape(img)) if img else ""


def names_for(item_name: str) -> set[str]:
    keys = {norm_name(item_name)}
    if " - " in item_name:
        keys.add(norm_name(item_name.split(" - ", 1)[0]))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    try:
        pages: dict[str, tuple[str, str]] = {}
        for it in items:
            m = NOTE_URL.search(it.get("notes", ""))
            if m and m.group(1) not in pages:
                url = m.group(1)
                page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
                pages[url] = read_page(page, url)
        print(f"{len(pages)} product pages read under {PAGE_PREFIX}")
        by_photo: dict[str, set[str]] = {}
        for url, (_, img) in pages.items():
            if img:
                by_photo.setdefault(img, set()).add(url)

        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            m = NOTE_URL.search(it.get("notes", ""))
            if not m:
                skipped.append(f"{it['id']}: notes name no Costa product page")
                continue
            page_url = m.group(1)
            shown, img = pages[page_url]
            if not shown or norm_name(shown) not in names_for(it["name"]):
                skipped.append(f"{it['id']}: page names {shown!r}, not {it['name']!r}")
                continue
            if not img:
                skipped.append(f"{it['id']}: the page states no product photo")
                continue
            if urllib.parse.urlsplit(img).netloc not in COSTA_IMAGE_HOSTS:
                skipped.append(f"{it['id']}: photo {img} is not on a host listed as Costa's own (check it, then add it to COSTA_IMAGE_HOSTS)")
                continue
            if len(by_photo.get(img, ())) >= SHARED_PHOTO_PAGES:
                skipped.append(f"{it['id']}: the same photo is on {len(by_photo[img])} product pages (a banner or placeholder)")
                continue
            matched[it["id"]] = (img, page_url)

        for item_id, (img, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:70} {img}")
                continue
            raw = polite_get(img, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {img}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:70} {fname}  <- {img}")
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
