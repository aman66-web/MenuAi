#!/usr/bin/env python3
"""Item photos for Amigos Burgers & Shakes (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_amigos_burgers_and_shakes.py --cache <dir> --dry-run   # fetch the item pages only, list matches
    python3 tools/uk_extract/images_amigos_burgers_and_shakes.py --cache <dir>             # download, store, write images.csv

Source: the chain's own menu item pages (https://www.amigosburgersandshakes.com/b-001 ..., the same pages the nutrition figures come from;
slugs and printed headings are the ITEMS table of amigos_burgers_and_shakes.py). Each item page carries one large dish photo (an <img> with
sizes of 400+ px that no other item page shares; the shared images are the logo, social icons and background). Smaller badges/stickers on a page
(e.g. a 160 px "hot" sticker, a 110 px thumbnail) are never used.

Matching (exact only): the page's printed heading must be the published item's name (or name + serving, e.g. "THE BOSS 2x 6oz. beef patties"),
compared with norm_name; where the page runs words together ("BUTTERMILKBURGER", "LIL'CHICKEN BURGER") the comparison ignores spaces
(same letters, same order, only spacing differs). The site's pages are known to carry figures cloned from other dishes, so a photo is taken
only where the page's own heading names the item. Not matched, on purpose: "Crispy Korean Wrap" (the page heading says "CRISPY KOREAN" and
its figures are cloned from the Amigos Wrap page, so the page does not name the item exactly); items that are held back are not published.

Photo file: the page serves the photo through Wix's image service with a display crop (/v1/crop/...). We fetch the ORIGINAL media file
(https://static.wixstatic.com/media/<id>, no crop or transform parameters) so nothing is cropped in the file; store_image then only downsizes
to 640 px and converts to WebP.

Politeness / robots: the site answers HTTP 429 to roughly every other request from our shared address, whatever the pace (checked at 1 and 10 s
spacing), so this script paces at 5 s, waits and asks again after a 429 (up to 4 times, 20-80 s) and reads robots.txt the same way; a 403 or a
robots disallow still stops the run. www.amigosburgersandshakes.com/robots.txt (read 2026-10-08): "User-agent: *  Allow: /  Disallow: *?lightbox=" (no query
strings are used here). Terms (https://www.amigosburgersandshakes.com/legal, clause 4): "You must not: republish material from this website
...; reproduce, duplicate, copy or otherwise exploit material on our website for a commercial purpose; edit or otherwise modify any material on
the website"; founder's decision 2026-10-06: installed anyway, his accepted risk.

Photo host robots: static.wixstatic.com/robots.txt answers HTTP 403 with the 9-byte body "Forbidden" (the media router answers 403 to every
non-media path), which images_common reads as "do not fetch": a real run therefore stops at the first photo with Blocked unless the main
session passes --wix-media-has-no-robots (RFC 9309 reads a 4xx on robots.txt as "no rules"; the same call images_common already makes for S3 and
CloudFront "MissingKey" answers). Photo GETs themselves return 200.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
import robots_rfc  # noqa: E402
from amigos_burgers_and_shakes import ITEMS  # noqa: E402
from amigos_burgers_and_shakes_pages import read_item_page  # noqa: E402
from common import slug  # noqa: E402

CHAIN_ID = "amigos-burgers-and-shakes"
HOST = "https://www.amigosburgersandshakes.com"
MEDIA = "https://static.wixstatic.com/media/"
MIN_SIZES = 400            # the dish photo is rendered 500+ px wide; stickers/thumbnails are 25-160 px
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

PACE = 5.0                 # seconds between requests to one host (the site answers HTTP 429 to about every other request from our shared address)
_HOSTS = ("https://www.amigosburgersandshakes.com", "https://static.wixstatic.com")


def read_robots_with_patience() -> None:
    """The site rate-limits (HTTP 429) some requests, including robots.txt, and polite_get treats a 429 on robots.txt as 'disallow all'.
    Here we wait and ask again until robots.txt really answers 200, then hand its real rules to polite_get. Any other answer (403, 5xx...)
    is left to polite_get's own handling, which stops the run."""
    for host in _HOSTS:
        for attempt in range(8):
            try:
                req = urllib.request.Request(host + "/robots.txt", headers={"User-Agent": ic.UA})
                with urllib.request.urlopen(req, timeout=30) as r:
                    ic._robots[host] = robots_rfc.parse(r.read().decode("utf-8", "replace"))
                break
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    break
                time.sleep(15 * (attempt + 1))
            except OSError:
                time.sleep(15)
        time.sleep(PACE)


def get(url: str, cache: Path, **kw) -> bytes:
    """polite_get that waits and retries when the site says 429 (too many requests: slow down). 403 and robots refusals still stop the run."""
    for attempt in range(5):
        try:
            return ic.polite_get(url, cache, delay=PACE, **kw)
        except ic.Blocked as e:
            if "HTTP 429" not in str(e) or attempt == 4:
                raise
            time.sleep(20 * (attempt + 1))
    raise AssertionError("unreachable")


_IMG = re.compile(r"<img\b[^>]*>", re.S)
_MEDIA_ID = re.compile(r"static\.wixstatic\.com/media/([0-9a-zA-Z_]+(?:~|%7E)mv2\.\w+|[0-9a-f]{32}\.\w+)")


def page_images(text: str) -> list[tuple[int, str, str]]:
    """[(rendered width from sizes="…px", media id, alt)] for every Wix <img> in the page, in order."""
    out = []
    for m in _IMG.finditer(text):
        tag = m.group(0)
        ms = re.search(r'\bsizes="(\d+)px"', tag)
        mid = _MEDIA_ID.search(tag)
        if ms and mid:
            alt = re.search(r'\balt="([^"]*)"', tag)
            out.append((int(ms.group(1)), mid.group(1).replace("%7E", "~"), htmllib.unescape(alt.group(1)) if alt else ""))
    return out


def same_name(head: str, name: str, serving: str) -> bool:
    """The printed heading is the item's name (optionally followed by its serving), ignoring case/punctuation; spaces ignored too."""
    heads = {ic.norm_name(head)}
    wanted = {ic.norm_name(name)}
    if serving:
        wanted.add(ic.norm_name(f"{name} {serving}"))
    if heads & wanted:
        return True
    return ic.norm_name(head).replace(" ", "") in {w.replace(" ", "") for w in wanted}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="cache dir (each page and photo is fetched at most once)")
    ap.add_argument("--dry-run", action="store_true", help="list the matches; fetch only the item pages (never a photo)")
    ap.add_argument("--retrieved-on", default=None)
    ap.add_argument("--wix-media-has-no-robots", action="store_true",
                    help="DECISION FOR THE FOUNDER/MAIN SESSION, off by default: static.wixstatic.com/robots.txt answers HTTP 403 'Forbidden' (the media "
                         "router has no robots.txt: every non-media path is 403), which images_common reads as 'do not fetch'. With this flag the photo host "
                         "is treated as having no robots.txt (RFC 9309: a 4xx means no rules). The chain's own site robots.txt (Allow: /) is always honoured.")
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    by_id = {i["id"]: i for i in items}
    entries = []
    for e in ITEMS:
        item_id = e["id"] or slug(e["name"])
        if item_id in by_id:
            entries.append((e["slug"], item_id))
    print(f"{len(items)} published items; {len(entries)} have an item page in the extraction table")
    read_robots_with_patience()
    if args.wix_media_has_no_robots:
        ic._robots["https://static.wixstatic.com"] = []

    pages: dict[str, str] = {}
    for sl, _ in entries:
        pages[sl] = get(f"{HOST}/{sl}", args.cache, accept="text/html,application/xhtml+xml;q=0.9,*/*;q=0.8").decode("utf-8", "replace")

    # images used on (nearly) every page are the logo/social icons/background, never a dish photo
    count: dict[str, int] = {}
    for text in pages.values():
        for mid in {m for _, m, _ in page_images(text)}:
            count[mid] = count.get(mid, 0) + 1
    common_ids = {m for m, n in count.items() if n >= len(pages) // 2}

    wanted: dict[str, tuple[str, str, str]] = {}      # item_id -> (media url, page url, alt)
    notes: list[str] = []
    for sl, item_id in entries:
        it = by_id[item_id]
        r = read_item_page(pages[sl], sl)
        if not same_name(r["head"], it["name"], it["serving"]):
            notes.append(f"{it['name']} (/{sl}): the page heading is {r['head']!r}, not exactly the item's name -> none")
            continue
        if item_id in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[item_id]})")
            continue
        big = [(w, m, a) for w, m, a in page_images(pages[sl]) if w >= MIN_SIZES and m not in common_ids]
        distinct = list(dict.fromkeys(m for _, m, _ in big))
        if len(distinct) != 1:
            notes.append(f"{it['name']} (/{sl}): {len(distinct)} candidate dish photos on the page -> none")
            continue
        alt = next(a for _, m, a in big if m == distinct[0])
        wanted[item_id] = (MEDIA + distinct[0], f"{HOST}/{sl}", alt)

    order = [i["id"] for i in items]
    print(f"{len(wanted)} items matched to a photo ({len({v[0] for v in wanted.values()})} distinct photos)")
    for item_id in sorted(wanted, key=order.index):
        print(f"  {by_id[item_id]['category']:<10} {by_id[item_id]['name']:<36} alt={wanted[item_id][2][:60]!r}  {wanted[item_id][0][len(MEDIA):][:40]}")
    print("Left without a photo:")
    for n in notes:
        print("  -", n)
    print(f"  ({len(items) - len(wanted)} published items without a photo in total)")
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, (url, page_url, _alt) in wanted.items():
            if url not in stored:
                raw = get(url, args.cache, referer=page_url)
                try:
                    stored[url] = ic.store_image(CHAIN_ID, raw)
                except ValueError as e:
                    print(f"  skipped {by_id[item_id]['name']}: {e}")
                    stored[url] = ""
            if stored[url]:
                rows[item_id] = (stored[url], page_url)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing was written to images.csv. We never work round a block.")
        raise SystemExit(2)
    ic.write_images_csv(CHAIN_ID, rows, args.retrieved_on)
    print(f"{len(rows)} of {len(items)} published items now have a photo; {len(set(f for f, _ in rows.values()))} files")
    for fname, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")


if __name__ == "__main__":
    main()
