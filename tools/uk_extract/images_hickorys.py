#!/usr/bin/env python3
"""Item photos for Hickory's Smokehouse from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_hickorys.py --cache DIR [--dry-run]

Source: Hickory's own website, https://hickorys.co.uk (WordPress). Pages read (one request each, cached):
  - every blog post, through the site's own WordPress REST API (/wp-json/wp/v2/posts?per_page=100&page=N: the same post content the
    page https://hickorys.co.uk/blog/<slug>/ shows; the row's source_url is that page, the post's own "link"),
  - every site page, through /wp-json/wp/v2/pages?per_page=100 (same rule),
  - every "offers and events" page and every venue page listed in https://hickorys.co.uk/offers-and-events-sitemap.xml and
    https://hickorys.co.uk/venues-sitemap.xml, plus the five /menus/<menu>/ pages of menus-sitemap.xml (those post types are not in
    the REST API, so the HTML page itself is read; only the page's <main> content counts, not the header, footer or social-feed scripts).
The photos are files on the same site (https://hickorys.co.uk/app/uploads/...), shown in the page at the size the page itself serves.

Match rule (exact, nothing fuzzy): a photo is attached to a published item (items.csv minus holdback.csv) only when an <img> in the page
content carries alt text that is exactly that item's name (images_common.norm_name equality: case, punctuation, "&"/"and" ignored;
no word dropped, added or reordered). So "Chicken Fried Waffle" (alt) -> item "Chicken Fried Waffle"; "Cherry Pie Pan Cake" (alt) ->
item "Cherry Pie (Pan Cake)". Alt texts that only CONTAIN a dish name are not used ("Hickory's Brunch Cherry Pie Pan Cake", "Chicken
Fried Waffle at Hickory's Smokehouse Brunch", "Hickory's Cherry Pie Waffle", "Smokehouse Platter" [items are "The Smokehouse Platter
with Fries" / "with Salad"], "Southern Sharer" [item "The Southern Sharer"], "Corn Dogs" [item "Classic Corn Dogs"], "Brisket Sub"
[item "Smoked Tennessee Brisket Sub"]). Image file names and WordPress media titles are never used to match: only what the page says.
Only pictures under https://hickorys.co.uk/app/uploads/ are used. If two pages give one item two different photos (different
uploads, not merely two sizes of one upload) the item gets none.

Where the photos are NOT taken from (checked 2026-11-17):
  - the menu that https://hickorys.co.uk/menus/ embeds (Ten Kites, menus.tenkites.com/hickorys/hickorys03, the source of our nutrition
    data) shows its dish pictures from images.tenkites.com, whose robots.txt says "User-agent: * / Allow: /tenkitestest/menus.html /
    Disallow: /" (read 2026-11-17). Honoured: none fetched, and the same pictures are not looked for elsewhere.
  - /dish-types/<type>/ and /dishes/<slug>/ (old WordPress "dishes" posts, 2016-2023): every card shows the WordPress default
    placeholder (wp-includes/images/media/default.png) and the dish pages carry no photo.
  - the menu PDFs the venue pages link (/app/uploads/2026/10/Main-Menu-AWB226.pdf and the brunch & lunch, dessert, drinks, kids and
    non-gluten PDFs): their photos are group shots of several dishes, or single-dish pictures too small for a photo (the three
    barbecue-tray pictures are 330 x 180 px, the "Go Big or Go Home" burger 142 x 223 px); the only large single-dish picture, the
    Smokehouse Platter (492 x 301 px), is printed beside the platter's name while the items are "The Smokehouse Platter with Fries" /
    "with Salad": the menu does not say which one it shows. None is used.
  - Deliveroo, Just Eat, Uber Eats, social media (the site's Instagram/Flockler feed) and the gift-card and careers sites: never used.

robots.txt (https://hickorys.co.uk/robots.txt, read 2026-11-17): the server answers 404 (which RFC 9309 reads as "no rules"); the body it
sends is a WordPress robots file with `User-agent: *` / `Disallow: /wp/wp-admin/` / `Allow: /wp/wp-admin/admin-ajax.php` and a Yoast
block `Disallow:` (nothing): the pages, the REST API and /app/uploads/ are allowed either way. polite_get checks robots.txt on every URL.

Terms (read 2026-11-17): https://hickorys.co.uk/legal/ ("COPYRIGHT"): "This website and its content is copyright of "The Hickory's
Smokehouse" - (c) "The Hickory's Smokehouse" 2017. All rights reserved. Any redistribution or reproduction of part or all of the contents
in any form is prohibited other than the following: ... You may not, except with our express written permission, distribute or
commercially exploit the content. Nor may you transmit it, or store it in any other website, or other form of electronic retrieval
system." The same page also says: "This website contains material which is owned by or licensed to us. ... Reproduction is prohibited
other than in accordance with the copyright notice". https://hickorys.co.uk/terms/ (booking and offer terms) has only an
"Intellectual property" clause about content visitors submit. An express restriction; installed on the founder's decision of
2026-10-06 (his accepted risk). No clause about robots or automated access was found.

A 401/403/429, a bot check or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: 595 pages read (177 blog posts, 16 site pages, 352 offers-and-events pages, 45 venue pages, 5 menu pages), nothing
refused. The site names only two published dishes exactly beside a photo, so 2 of 224 published items have a photo:
  - cherry-pie-pan-cake: /app/uploads/2026/10/Cherry-Pie-Pan-Cake-1024x640.png, alt "Cherry Pie Pan Cake" (on /blog/new-menu-at-hickorys-
    this-autumn/ and /offers-and-events/brunch-southern-style-at-hickorys-smokehouse-chester/): stacked pan cakes with cherry compote,
    custard and cookie crumble (and a scoop on top), as the menu describes it; no lettering.
  - chicken-fried-waffle: /app/uploads/2024/06/Hicks-Chicken-Waffle-GIF-1024x577.jpg (a still JPEG despite its name), alt "Chicken Fried
    Waffle" (on three offers-and-events pages): a waffle with Southern fried chicken and candied bacon, maple syrup poured over, on the
    chain's own printed basket paper; no added lettering, figures or stickers.
Both looked at on a contact sheet and at full size: kept. Every other dish photo on the site carries an alt text that only contains a dish
name, names a dish we do not publish (Smokin' Deals, Thanksgiving and Christmas specials, drinks with alcohol) or names none.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "hickorys"
SITE = "https://hickorys.co.uk"
UPLOADS = SITE + "/app/uploads/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
JSON_ACCEPT = "application/json,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-hickorys")
SITEMAPS = ("offers-and-events-sitemap.xml", "venues-sitemap.xml", "menus-sitemap.xml")
# Looked at on contact sheets / full size and left without a photo; a rerun must not bring them back. {item id: why}
DROP_ITEMS: dict[str, str] = {}
# Photos (by upload key, see upload_key()) left out after looking, whatever item they would go to. {key: why}
DROP_PHOTOS: dict[str, str] = {}

IMG = re.compile(r"<img\b[^>]*>", re.I)
SIZE_SUFFIX = re.compile(r"-(?:\d+x\d+|scaled|e\d{10,})(?=[-.])", re.I)


def attr(tag: str, name: str) -> str | None:
    m = re.search(rf'\s{name}\s*=\s*(["\'])(.*?)\1', tag, re.S | re.I)
    return htmllib.unescape(m.group(2)) if m else None


def upload_key(src: str) -> str:
    """The WordPress upload a picture comes from, whatever size the page shows ('Cherry-Pie-Pan-Cake-1024x640.png' and
    'Cherry-Pie-Pan-Cake.png' are one photo). Used only to tell 'two sizes of one photo' from 'two different photos'."""
    path = src.split("?", 1)[0]
    return SIZE_SUFFIX.sub("", path)


def main_content(page: str) -> str:
    i = page.find("<main")
    j = page.find("</main>", i)
    body = page[i:j] if i >= 0 and j > i else ""
    return re.sub(r"<script\b.*?</script>", "", body, flags=re.S | re.I)


def documents(cache: Path) -> list[tuple[str, str]]:
    """(page url, page content html) for every blog post, site page, offers-and-events page and venue page."""
    docs: list[tuple[str, str]] = []
    for kind in ("posts", "pages"):
        page_no = 1
        while True:
            url = f"{SITE}/wp-json/wp/v2/{kind}?per_page=100&page={page_no}&_fields=id,link,content"
            try:
                data = json.loads(polite_get(url, cache, accept=JSON_ACCEPT))
            except urllib.error.HTTPError as e:     # WordPress answers 400 for a page number past the end
                if e.code == 400:
                    break
                raise
            if not isinstance(data, list) or not data:
                break
            docs += [(d["link"], d["content"]["rendered"]) for d in data]
            if len(data) < 100:
                break
            page_no += 1
    for sm in SITEMAPS:
        xml = polite_get(f"{SITE}/{sm}", cache, accept="application/xml").decode("utf-8", "replace")
        for loc in re.findall(r"<loc>\s*(.*?)\s*</loc>", xml):
            if not loc.startswith(SITE + "/"):
                continue
            html = polite_get(loc, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            docs.append((loc, main_content(html)))
    return docs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it["id"])
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        docs = documents(args.cache)
        print(f"{len(docs)} pages read on {SITE}")
        found: dict[str, list[tuple[str, str, str]]] = {}      # item id -> [(photo url, page url, alt)]
        for page_url, content in docs:
            for tag in IMG.findall(content):
                alt = (attr(tag, "alt") or "").strip()
                src = (attr(tag, "src") or "").strip()
                if not alt or not src:
                    continue
                ids = by_name.get(norm_name(alt))
                if not ids:
                    continue
                if src.startswith("http://"):
                    src = "https://" + src[len("http://"):]
                if not src.startswith(UPLOADS):
                    skipped.append(f"{alt!r} on {page_url}: picture {src!r} is not a file in {UPLOADS}")
                    continue
                if len(ids) > 1:
                    skipped.append(f"{alt!r} on {page_url}: names {len(ids)} published items ({', '.join(ids)}): none")
                    continue
                found.setdefault(ids[0], []).append((src, page_url, alt))

        matched: dict[str, tuple[str, str]] = {}
        for item_id, hits in sorted(found.items()):
            keys = {upload_key(src) for src, _, _ in hits}
            if len(keys) > 1:
                skipped.append(f"{item_id}: pages show {len(keys)} different photos under its name ({', '.join(sorted(keys))}): none")
                continue
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                continue
            key = keys.pop()
            if key in DROP_PHOTOS:
                skipped.append(f"{item_id}: photo {key} dropped after looking: {DROP_PHOTOS[key]}")
                continue
            # the largest size any page shows; ties: the first page in reading order
            src, page_url, _ = max(hits, key=lambda h: (_px(h[0]), -hits.index(h)))
            matched[item_id] = (src, page_url)

        for item_id, (url, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {url.rsplit('/', 1)[-1]}  ({page_url})")
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


def _px(src: str) -> int:
    """Width the file name says (WordPress '-1024x640'), or a large number for the original upload / '-scaled' (2560 px)."""
    m = re.search(r"-(\d+)x(\d+)\.[a-z]+$", src.split("?", 1)[0], re.I)
    return int(m.group(1)) if m else 100_000


if __name__ == "__main__":
    sys.exit(main())
