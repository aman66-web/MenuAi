#!/usr/bin/env python3
"""Item photos for Sam's Chicken from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_sams_chicken.py --cache DIR [--dry-run]

Source: the item pages https://samschicken.com/item/<n>_<slug>, the same static pages tools/uk_extract/sams_chicken.py reads every
published dish from (one page per menu item; each published row's notes in items.csv begin with the address of the page it was
built from). Each page shows one photo of its product in the item block:
`<img alt="item-img" src="https://res.cloudinary.com/dh6pkczfx/image/upload/v<version>/<id>.jpg" class="img-fluid h-100 item-details-img">`,
the same file as the page's own og:image. res.cloudinary.com/dh6pkczfx is the chain's own media account (every product picture on
samschicken.com is served from it; the category cards show the same file through a Cloudinary crop, `c_fill,h_430,w_720`, so the
item page's uncropped file is the one taken). Nothing else is requested besides the item pages and the photo files.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the item's notes in items.csv name its item page (https://samschicken.com/item/<n>_<slug>), i.e. the photo comes from the same
     product record the figures were copied from;
  2. that page's own title (<h3> in the item block), turned into the published name and id exactly as sams_chicken.py does
     (NAMES, ID_OVERRIDE, slug), gives this item's id and the same norm_name as its name;
  3. the page's item-details photo is a file under https://res.cloudinary.com/dh6pkczfx/image/upload/ and is the page's og:image too;
  4. no other published item's page shows the same file (a picture shared by different pages is treated as a placeholder or a
     family picture and left out) and the item is not in DROP_ITEMS (left out after looking at every photo, below).

robots.txt: https://samschicken.com/robots.txt answers 404 (read 2026-11-17), which RFC 9309 reads as no rules;
https://res.cloudinary.com/robots.txt (read 2026-11-17) has only commented-out lines, i.e. no rules. polite_get checks both on every URL.
Pacing: samschicken.com answered HTTP 429 at one request a second in earlier runs (see sams_chicken.py), so its pages are asked for
6 s apart (PAGE_DELAY); a 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Terms: none found. The site links no terms and conditions or privacy page (footer: social links and "Sam's Chicken | © 2025 All rights
reserved!"; read 2026-11-17 on the item pages). No clause about reusing content or images was found; the footer claims copyright in
general. Installed under the founder's decision of 2026-10-06 (CLAUDE.md rule 2); a chain's photos come down the day it asks.

Run of 2026-11-17: all 59 published items matched their page; 50 photos kept after looking at every one on contact sheets
(the seven under DROP_ITEMS and the two Family mixes that share one file were left out). No 401/403/429 from either host.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sams_chicken  # noqa: E402  (NAMES, ID_OVERRIDE: the same naming the items came from)
from common import slug  # noqa: E402
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "sams-chicken"
SITE = "https://samschicken.com"
MEDIA_PREFIX = "https://res.cloudinary.com/dh6pkczfx/image/upload/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PAGE_DELAY = 6.0   # seconds between samschicken.com requests (it answered 429 at one a second before)
DEFAULT_CACHE = Path("/tmp/menumacros-images-sams-chicken")
NOTE_PAGE = re.compile(r"^(https://samschicken\.com/item/\d+_[a-z0-9-]+)(?:;|$)")
ITEM_BLOCK = re.compile(r'<div class="about-item overflow-hidden">(.*?)</table>', re.S)
DETAILS_IMG = re.compile(r'<img\b[^>]*\bsrc="([^"]+)"[^>]*\bclass="[^"]*\bitem-details-img\b[^"]*"', re.S)
OG_IMAGE = re.compile(r'<meta\s+content="([^"]+)"\s+property="og:image"', re.S)

# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back.
# (a) a third-party brand's sealed pack instead of the food: the four Harrisons dip pots show only the printed lid (the sauce is not visible;
#     each lid also prints "25g" and "Vegetarian, Vegan & Gluten free" claims), and the two Ben & Jerry's pictures show only the tub (the
#     Strawberry Cheesecake tub prints "465ml" while the published figures, 264 kcal, are for a much smaller serving).
DROP_ITEMS: dict[str, str] = {}
DROP_ITEMS.update({i: "a Harrisons sealed dip pot: the brand's printed lid ('25g', 'Vegetarian, Vegan & Gluten free'), not the sauce" for i in (
    "bbq-sauce-25-g", "garlic-and-herb-sauce-25-g", "sweet-and-sour-sauce-25-g", "tomato-sauce-25-g")})
DROP_ITEMS.update({i: "a Ben & Jerry's tub: the brand's pack (a 465 ml tub) instead of the ice cream, not the serving published" for i in (
    "ben-and-jerrys-cookie-dough", "ben-and-jerrys-strawberry-cheesecake")})
# (c) left out by the independent check (2026-11-17): the page is the Family "20 BBQ Wings" product and its photo is that whole bucket,
#     while the published dish is one wing (the page's per-wing figures).
DROP_ITEMS["bbq-wing-1-wing"] = "the photo is the Family '20 BBQ Wings' bucket, not the one wing the published figures are for"
# (b) found by the run, not by name: Family Mini Mix (4 pieces, 2 fillet burgers, 2 fries) and Family Mega Mix (6 pieces, 2 strips burgers,
#     4 fries) show the very same photo file under two different Cloudinary ids, so it cannot be a picture of both; main() drops every item
#     whose downloaded file is shared with another item's page (checked on every run, so this needs no list).


def page_title(page: str, url: str) -> str:
    block = ITEM_BLOCK.search(page)
    h3 = re.search(r"<h3>(.*?)</h3>", block.group(1), re.S) if block else None
    if not h3:
        raise SystemExit(f"{url}: no item block with a title: the page has changed shape")
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", h3.group(1))).split())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        candidates: dict[str, tuple[str, str]] = {}   # item id -> (photo url, item page url)
        for it in items:
            m = NOTE_PAGE.match(it.get("notes", ""))
            if not m:
                skipped.append(f"{it['id']}: notes name no item page")
                continue
            page_url = m.group(1)
            page = polite_get(page_url, args.cache, delay=PAGE_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
            title = page_title(page, page_url)
            shown = sams_chicken.NAMES.get(title, title)
            shown_id = sams_chicken.ID_OVERRIDE.get(title, slug(shown))
            if shown_id != it["id"] or norm_name(shown) != norm_name(it["name"]):
                skipped.append(f"{it['id']}: the page {page_url} is now titled {title!r}, which is not the item {it['name']!r}")
                continue
            img = DETAILS_IMG.search(page)
            og = OG_IMAGE.search(page)
            src = htmllib.unescape(img.group(1)) if img else ""
            if not src.startswith(MEDIA_PREFIX):
                skipped.append(f"{it['id']}: the page's photo {src!r} is not a file in the chain's Cloudinary account")
                continue
            if not og or htmllib.unescape(og.group(1)) != src:
                skipped.append(f"{it['id']}: the page's photo is not also its og:image (the page does not tie one picture to the product)")
                continue
            candidates[it["id"]] = (src, page_url)

        by_src: dict[str, list[str]] = {}
        for item_id, (src, _) in candidates.items():
            by_src.setdefault(src, []).append(item_id)
        matched: dict[str, tuple[str, str]] = {}
        for item_id, (src, page_url) in candidates.items():
            if len(by_src[src]) > 1:
                skipped.append(f"{item_id}: the same picture is on the pages of {', '.join(sorted(by_src[src]))}: a shared picture, not this item's own")
                continue
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                continue
            matched[item_id] = (src, page_url)

        for item_id, (url, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {url.rsplit('/', 1)[-1]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {url.rsplit('/', 1)[-1]}")
        # the same picture (identical source bytes) under different pages' addresses: shared, so it is no one item's own photo
        by_file: dict[str, list[str]] = {}
        for item_id, (fname, _) in rows.items():
            by_file.setdefault(fname, []).append(item_id)
        for fname, ids in by_file.items():
            if len(ids) > 1:
                for item_id in ids:
                    del rows[item_id]
                    skipped.append(f"{item_id}: its page's photo is the same file as on the pages of {', '.join(sorted(set(ids) - {item_id}))}: "
                                   "a shared picture, not this item's own")
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
    for f, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
