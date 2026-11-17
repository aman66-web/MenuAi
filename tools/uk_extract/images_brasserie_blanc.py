#!/usr/bin/env python3
"""Item photos for Brasserie Blanc from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_brasserie_blanc.py --cache DIR [--dry-run]

Where Brasserie Blanc shows dish photos.
* The menus (tools/uk_extract/brasserie_blanc.py reads the nutrition from them) are Ten Kites pages, menus.tenkites.com/hwc/bb..., embedded
  on brasserieblanc.com/brasseries/<site>/menu/<menu>/. They carry no dish pictures at all: the only picture addresses in bbalacarte,
  bbsunday, bbbreakfast, bbchildren and bbdrinks123 (read 2026-11-17) are Ten Kites' own "default-unit-picture.jpg" placeholder and the
  favicon, both on images.tenkites.com, whose robots.txt (read 2026-11-17) says "User-agent: * / Allow: /tenkitestest/menus.html /
  Disallow: /" (never asked for a file).
* brasserieblanc.com itself is a Next.js site fed by the Heartwood Collection's WordPress (cms.heartwoodcollection.com/brasserieblanc).
  Its pictures are files in that WordPress upload folder (UPLOADS), shown through the site's /_next/image resizer. Almost every picture's
  alt text is its file name ("brasserie-blanc-chocolate-souffle-3", "charcuterie6341_Land"), "1", empty, or "Cover Image for <post
  title>"; a file name is not the page naming a dish, and a section picture over a list of several dishes (the Sunday roasts, Steak
  Night's three cuts, Happy Hour's drinks) does not say which of them it shows. Neither is used.

Pages read: every page in https://brasserieblanc.com/page-sitemap.xml and post-sitemap.xml (the news, offers and events posts) except
legal, policy, form and booking pages (SKIP_PAGE), and from restaurants-sitemap.xml each brasserie's own page and its /menu/ page (the
per-menu sub-pages, /menu/<menu>/, only embed the Ten Kites menus above). The recipe pages (recipes-sitemap.xml) are not read: they
show the dish as cooked for a home recipe, not the dish the menu serves.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when a rendered picture on one of those pages,
`<img alt="<name>" src="/_next/image/?url=<file>...">`, has an alt text that, read with norm_name (and with the site's own fixed prefix
"Cover Image for " taken off a post's cover picture), equals the item's whole name, and the file is under UPLOADS. The renditions of one
upload (file-400x400.jpg, file-1024x1024.jpg) count as one picture and the largest one shown is fetched. If two different pictures carry
the same name the item gets none. Photos looked at on contact sheets and left out go in DROP_ITEMS so a rerun can't bring them back.

robots.txt (read 2026-11-17): https://brasserieblanc.com/robots.txt (www.brasserieblanc.com answers 308 to it) is "User-agent: * /
Allow: /" with the sitemap; https://cms.heartwoodcollection.com/robots.txt is "User-agent: * / Allow: /"; menus.tenkites.com disallows only
/fonts/, /views/ and *.less; images.tenkites.com disallows everything (see above). No group names an AI crawler. polite_get checks
robots.txt on every URL (RFC 9309) and stops on 401/403/429.

Terms (read 2026-11-17): no clause about copying or reusing the site's content or images was found. brasserieblanc.com has no website
terms of use: its /legal/ page links only "Terms & Conditions" (https://brasserieblanc.com/terms/: group bookings, peak dates, Christmas,
offers, Happy Hour, Le Club rewards and gift cards; nothing about the site's content) and the Privacy Policy, plus four company policies;
the owner's site heartwoodcollection.com/legal/ lists cookies, privacy and anti-slavery pages only; the footer prints no copyright notice
(just "Heartwood Collection" and "made by SAINT"). Photos would be installed on the founder's decision of 2026-10-06 (his accepted risk).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written. When no published item matches, no
images.csv is written (an existing one is left alone).

Run of 2026-11-17: 664 pages read (38 site pages, 604 posts, 14 brasserie pages and their 14 /menu/ pages; nothing refused), 2,688
pictures with an alt text: none carries the whole name of any of the 238 published items, so no photo is attached and no images.csv is
written. The nearest are pictures that name something else: "BB cheese souffle with warm Ford Farm Coastal Cheddar sauce" (a 2017 post;
our item is "Soufflé au Fromage"), "Smoked haddock and Parmesan soufflé with frisée salad, a New Year's Eve special" (not on the published
menus), file-name alt texts such as "brasserie-blanc-french-onion-soup", "brasserie-blanc-moules-monday" and "pistachio-souffle6360-1"
(a file name is not the page naming a dish), and section pictures over lists of several dishes (/sunday/, /steak-night/, /happy-hour/).
One checked sub-page, /brasseries/oxford/menu/a-la-carte/, holds the Ten Kites embed and one menu-title graphic only. Rerun this script
when the site changes: it will pick up any picture the site names after a published dish.
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

CHAIN_ID = "brasserie-blanc"
HOST = "https://brasserieblanc.com"
SITEMAPS = ["page-sitemap.xml", "post-sitemap.xml", "restaurants-sitemap.xml"]
UPLOADS = "https://cms.heartwoodcollection.com/brasserieblanc/wp-content/uploads/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-brasserie-blanc")
SKIP_PAGE = re.compile(r"^/(legal|terms|privacy-policy|careers|contact|signup|enquiry|book|sitemap|faqs)(/|$)")
BRASSERIE_PAGE = re.compile(r"^/brasseries/[^/]+/(menu/)?$")   # from restaurants-sitemap.xml only these are read
COVER_PREFIX = "Cover Image for "
# Looked at on contact sheets; a rerun must not bring them back. {item id: reason}
DROP_ITEMS: dict[str, str] = {}

IMG = re.compile(r"<img\b[^>]*>")
SCRIPT = re.compile(r"<script\b.*?</script>", re.S)
SIZE_SUFFIX = re.compile(r"-(\d+)x(\d+)(?=\.[A-Za-z]+$)")


def page_list(cache: Path) -> list[str]:
    urls: list[str] = []
    for sm in SITEMAPS:
        xml = polite_get(f"{HOST}/{sm}", cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
            u = urllib.parse.urlsplit(loc.strip())
            if u.netloc != "brasserieblanc.com" or re.search(r"\.(jpe?g|png|webp|gif|svg)$", u.path, re.I):
                continue
            p = u.path or "/"
            if SKIP_PAGE.search(p):
                continue
            if sm == "restaurants-sitemap.xml" and not BRASSERIE_PAGE.match(p):
                continue
            url = HOST + p
            if url not in urls:
                urls.append(url)
    if len(urls) < 50:
        raise SystemExit(f"the sitemaps list only {len(urls)} pages: they have changed shape")
    return urls


def pictures_on_page(raw: str) -> list[tuple[str, str]]:
    """(alt text, upload file URL) for every rendered picture on one page."""
    out = []
    for tag in IMG.findall(SCRIPT.sub("", raw)):
        alt = re.search(r'\salt="([^"]*)"', tag)
        src = re.search(r'\ssrc="([^"]*)"', tag)
        if not alt or not src:
            continue
        s = htmllib.unescape(src.group(1))
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(s).query)
        f = q["url"][0] if "url" in q else s
        out.append((htmllib.unescape(alt.group(1)).strip(), f))
    return out


def base_of(file_url: str) -> str:
    """The upload a rendition belongs to: file-1024x1024.jpg and file-400x400.jpg are one picture."""
    return SIZE_SUFFIX.sub("", file_url)


def area(file_url: str) -> int:
    m = SIZE_SUFFIX.search(file_url)
    return int(m.group(1)) * int(m.group(2)) if m else 10**9


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        # name key -> {upload base: (largest rendition URL, first page that shows it with that name)}
        found: dict[str, dict[str, tuple[str, str]]] = {}
        named = 0
        pages = page_list(args.cache)
        for url in pages:
            raw = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for alt, f in pictures_on_page(raw):
                name = alt[len(COVER_PREFIX):] if alt.startswith(COVER_PREFIX) else alt
                k = norm_name(name)
                if not k:
                    continue
                named += 1
                if k not in by_key:
                    continue
                b = base_of(f)
                prev = found.setdefault(k, {}).get(b)
                if prev is None:
                    found[k][b] = (f, url)
                elif area(f) > area(prev[0]):
                    found[k][b] = (f, prev[1])
        print(f"{len(pages)} pages of {HOST} read ({named} pictures with an alt text); "
              f"{len(found)} published dish names are the alt text of a picture")

        matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
        for k, photos in sorted(found.items()):
            for it in by_key[k]:
                if it["id"] in DROP_ITEMS:
                    skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                    continue
                if len(photos) > 1:
                    skipped.append(f"{it['id']}: {len(photos)} different pictures carry this name "
                                   f"({', '.join(b.rsplit('/', 1)[-1] for b in photos)})")
                    continue
                ((photo, page),) = photos.values()
                if not photo.startswith(UPLOADS):
                    skipped.append(f"{it['id']}: the picture {photo} is not in Brasserie Blanc's own upload folder")
                    continue
                matched[it["id"]] = (photo, page)

        for item_id, (photo, page) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {photo.rsplit('/', 1)[-1]}  <- {page}")
                continue
            raw = polite_get(photo, args.cache, referer=page)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, page)
            print(f"  {item_id:50} {fname}  <- {photo.rsplit('/', 1)[-1]}  ({page})")
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
