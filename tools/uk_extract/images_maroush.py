#!/usr/bin/env python3
"""Item photos for Maroush from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_maroush.py --cache DIR [--dry-run]

Where Maroush shows dish photos (looked at 2026-11-17).
* The menu data (tools/uk_extract/maroush.py) is the "Allergen & Calorie Menu" PDF linked from https://www.maroush.com/allergen-and-calorie/;
  that page and the PDF carry no dish pictures. The older house menu PDF the home page links
  (/wp-content/uploads/2024/07/Maroush-House-Menu-Sept-2022-with-sandwishes8pp-1.pdf) holds only small decorative icons (pdfimages -list:
  nothing larger than 73 x 45 px), no photos.
* https://www.maroush.com/menu/ has no list of dishes: a short text and a photo gallery whose pictures carry general alt texts ("A special dish
  of Maroush", "Food of Maroush Restaurant", "Lebanese cuisine at Maroush in London"), none naming a dish.
* Ordering: the site's "Collect or Deliver" picker links only to Deliveroo pages and a "Delivery & Collection" link goes to Uber Eats. Those
  are third parties and are never used. Maroush has no ordering site of its own.
* www.maroush.com is a WordPress site (theme "Grand Restaurant"); its pictures are files in its own upload folder UPLOADS. Some pages end with a
  photo gallery whose pictures carry an alt text that the site's editors typed: most are general ("Lebanese dish", "Dining Area"), a few
  name a dish ("Kibbeh", "Hummus", "Lamb Shank", "Lamb Chops" on /catering/; "Hummus" on /restaurants/high-street-kensington/; "Shawarma"
  on three restaurant pages). Only an alt text naming a dish is used; nothing else on these pages ties a picture to a dish (no captions or
  headings next to the pictures).

Pages read: every page in https://www.maroush.com/page-sitemap.xml (Yoast; 19 pages on 2026-11-17) except SKIP_PAGES: the privacy policy and
contact page, and the blog index /blog/. Blog posts (post-sitemap.xml, 60 posts on 2026-11-17) are NOT read: they are articles about Lebanese
food, not the menu, and their pictures include stock photographs (files named pexels-...-*.jpg, e.g. on /blog/authentic-lebanese-wine-in-london-at-maroush/
and /blog/maroush-a-london-lebanese-restaurant/), so a picture there cannot be taken to be Maroush's own photo of its dish. (The one blog alt
text that names a dish exactly, "Maroush Salad" on the /blog/ card for /blog/vegan-lebanese-food-london/, shows a salad with fried bread
pieces that looks like fattoush, which shows why blog alt texts are not used.)

Match rule (exact, nothing fuzzy). A picture `<img ... alt="<name>">` (the file given by its data-src or src attribute) names a published
item when its alt text, read with norm_name, equals the item's whole name, and the file is under UPLOADS. The renditions of one upload
(file-768x1152.jpg, file-scaled.jpg, file.jpg) count as one picture; the rendition the naming page shows is fetched, exactly that address
(the largest, if the page shows two). An item gets a picture only when exactly one picture on all the pages read carries its name. A name
shared by two published items gives no photo. Alt texts that only come close are never used: "Hummus" (the items are "Hommos", "Hommos
Beiruty" ...), "Lamb Shank" ("Mediterranean-Spiced Lamb Shank"), "Lamb Chops" ("Kastaleta Lamb"), "Shawarma" (the items are "Shawarma Lamb",
"Shawarma Chicken", "Mixed Shawarma" and the wraps), "Chicken Shawarma on the table", "Mixed Grilled Platter" ("Maroush Mixed Grills").
Photos looked at on contact sheets and left out go in DROP_ITEMS so a rerun can't bring them back.

robots.txt (https://www.maroush.com/robots.txt, read 2026-11-17): "User-agent: * / Allow: /" with the sitemap; no group names an AI crawler.
polite_get checks robots.txt on every URL (RFC 9309) and stops on 401/403/429.

Terms: none found (read 2026-11-17). The site has no terms-of-use page (none in page-sitemap.xml, the REST page list or the footer, which
links only /privacy-policy/), the footer prints no copyright notice, and the privacy policy (https://www.maroush.com/privacy-policy/,
"Maroush is operated by Maroush Group Limited", company 08030800) says nothing about copying or reusing the site's content or images.
Photos are installed on the founder's decisions of 2026-10-06 (a chain's photos come down the day it asks).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written. When no published item matches, no images.csv
is written (an existing one is left alone).

Run of 2026-11-17: 16 pages read (nothing refused). One of the 92 published items is named exactly by a picture's alt text and has a photo:
  Kibbeh   /catering/ (DSCF9772: a bowl of four fried kibbeh with parsley and a lemon wedge, other mezze at the edges of the frame)
The other 91 dishes have no picture on Maroush's own pages that names them.
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
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "maroush"
HOST = "https://www.maroush.com"
SITEMAP = f"{HOST}/page-sitemap.xml"
UPLOADS = f"{HOST}/wp-content/uploads/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-maroush")
# Not menu or dish pages: legal/contact pages and the blog index (its cards show blog-post pictures; see the docstring).
SKIP_PAGES = {f"{HOST}/privacy-policy/", f"{HOST}/contact/", f"{HOST}/blog/"}
# Looked at on contact sheets and left without a photo; a rerun must not bring them back. (None so far: the one photo kept was looked at.)
DROP_ITEMS: dict[str, str] = {}

IMG = re.compile(r"<img\b[^>]*>", re.S)
RENDITION = re.compile(r"(-\d+x\d+|-scaled)(?=\.[A-Za-z]+$)")


def page_urls(cache: Path) -> list[str]:
    xml = polite_get(SITEMAP, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    urls = [htmllib.unescape(u) for u in re.findall(r"<loc>([^<]+)</loc>", xml)]
    if not urls:
        raise SystemExit("page-sitemap.xml lists no pages: the sitemap has changed shape")
    return [u for u in urls if u not in SKIP_PAGES]


def pictures(page: str) -> list[tuple[str, str]]:
    """(alt text, absolute file address) for every <img> with an alt text and a file under UPLOADS."""
    page = re.sub(r"<(script|style|noscript)\b[^>]*>.*?</\1>", "", page, flags=re.S)
    out = []
    for tag in IMG.findall(page):
        alt = re.search(r'\balt="([^"]*)"', tag)
        src = re.search(r'\bdata-src="([^"]+)"', tag) or re.search(r'\ssrc="([^"]+)"', tag)
        if not alt or not src:
            continue
        url = urllib.parse.urljoin(HOST + "/", htmllib.unescape(src.group(1)))
        if url.startswith(UPLOADS):
            out.append((htmllib.unescape(alt.group(1)).strip(), url))
    return out


def upload_key(url: str) -> str:
    """One upload, whichever rendition: strip WordPress's -WxH / -scaled suffix."""
    path = urllib.parse.urlsplit(url).path
    return RENDITION.sub("", path)


def rendition_size(url: str) -> int:
    m = re.search(r"-(\d+)x(\d+)\.[A-Za-z]+$", url)
    return int(m.group(1)) * int(m.group(2)) if m else 10**9   # an unsuffixed file is the full upload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_norm: dict[str, list[dict]] = {}
    for it in items:
        by_norm.setdefault(norm_name(it["name"]), []).append(it)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        pages = page_urls(args.cache)
        # item id -> {upload key -> (page, url)}: every picture whose alt text names the item, on any page
        named: dict[str, dict[str, tuple[str, str]]] = {}
        for page_url in pages:
            page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for alt, url in pictures(page):
                its = by_norm.get(norm_name(alt))
                if not its:
                    continue
                if len(its) > 1:
                    skipped.append(f"alt {alt!r} on {page_url}: the name is shared by {len(its)} published items, so no photo")
                    continue
                key = upload_key(url)
                seen = named.setdefault(its[0]["id"], {})
                prev = seen.get(key)
                if prev is None or rendition_size(url) > rendition_size(prev[1]):
                    seen[key] = (page_url, url)
        print(f"{len(pages)} pages read from {SITEMAP}; {len(named)} published items named by a picture's alt text")

        matched: dict[str, tuple[str, str]] = {}   # item id -> (page, photo url)
        for item_id, pics in sorted(named.items()):
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                continue
            if len(pics) != 1:
                skipped.append(f"{item_id}: {len(pics)} different pictures carry the name ({', '.join(sorted(pics))}): none chosen")
                continue
            matched[item_id] = next(iter(pics.values()))

        for item_id, (page_url, url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {url}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {url.rsplit('/', 1)[-1]} on {page_url}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows:
        print(f"0 of {len(items)} published items have a photo: no images.csv written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
