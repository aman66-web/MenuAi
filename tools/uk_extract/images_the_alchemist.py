#!/usr/bin/env python3
"""Item photos for The Alchemist from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_the_alchemist.py --cache DIR [--dry-run]

Source: ONE page, https://thealchemistbars.com/food/ (the page the calories were read from). Each dish is one block
`<div number="N" class="food-K food"> ... <h2 class="food-name"><p>PORK BELLY &amp; BROTH</p></h2> <div class="food-imagebox"><img
class="food-image" src="https://a.storyblok.com/f/321600/1500x1225/a099377ad8/pork-belly-broth.jpg/m/10x0/filters:quality(50)"></div> ...
<span class="calories">558</span>`: name, photo and calories sit in one block of the chain's own page. 4 of its 24 blocks carry a photo.
The page's src is a tiny (10 px wide) re-encode of a file in the chain's own media store (a.storyblok.com/f/321600/...): we fetch that
file itself (the src without its "/m/10x0/filters:..." transform suffix; same host, same path) and let store_image do the only change
(downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). A photo goes on a published item only when
  1. the block's name has the same norm_name as the item's name, and
  2. that name is carried by exactly ONE block on the page, and exactly one published item has that name, and
  3. the block's calories equal the item's calories.
"CHICKEN IN A BASKET" is printed twice on the page (buttermilk chicken / plant-based goujons: our two items carry a bracketed
suffix), and only the first block has a photo: ambiguous, so no photo for either. Blocks with no image get no photo.

Terms (https://thealchemistbars.com/terms-and-conditions/, read 2026-10-11): "This website contains material which is owned by or
licensed to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
prohibited other than in accordance with the copyright notice, which forms part of these terms and conditions." That restricts
reuse; installed on the founder's decision of 2026-10-06 (his accepted risk). robots.txt (https://thealchemistbars.com/robots.txt,
read 2026-10-11): "User-agent: * / Allow: / / Disallow: /api/ /_nuxt/ /admin/ /.netlify/" (the food page and the storyblok host are
checked by polite_get on every URL, RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

STATUS 2026-10-11: NOT RUN. The dry run matches 3 of 23 items (Pork Belly & Broth, Salt & Pepper Chicken Basket, Nashville Chicken
Basket), but the photos' host a.storyblok.com answers its robots.txt with HTTP 403 AccessDenied (not a "MissingKey" object-store
answer), which polite_get treats as "do not fetch". Not worked round. Same open question as Sbarro/Amigos/Kokoro/Tortilla
(PROGRESS.md founder to-do (d)): if the founder rules that a 403 on an image host's robots.txt means "no rules", run it.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "the-alchemist"
PAGE_URL = "https://thealchemistbars.com/food/"
PHOTO_HOST = "https://a.storyblok.com/"   # the chain's own media store, as named by the page's img src
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-the-alchemist")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)

BLOCK = re.compile(r'<div number="\d+" class="food-\d+ food">')
NAME = re.compile(r'class="food-name"><p>(.*?)</p>', re.S)
IMG = re.compile(r'<img[^>]*class="food-image"[^>]*\ssrc="([^"]+)"')
CALS = re.compile(r'<span class="calories">\s*([0-9.]+)\s*</span>')


def blocks(page: str) -> list[dict]:
    out = []
    for b in BLOCK.split(page)[1:]:
        n, im, c = NAME.search(b), IMG.search(b), CALS.search(b)
        out.append({
            "name": html.unescape(re.sub(r"<[^>]+>", "", n.group(1))).strip() if n else "",
            "src": html.unescape(im.group(1)) if im else "",
            "kcal": c.group(1) if c else "",
        })
    return out


def original(src: str) -> str:
    """The media-store file itself: the src without the '/m/<size>/filters:...' transform suffix the page adds."""
    return re.sub(r"/m/[^/]*(/filters:[^/]*)?$", "", src)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        bl = blocks(page)
        if len(bl) < 10 or not all(b["name"] and b["kcal"] for b in bl):
            raise SystemExit(f"{PAGE_URL}: {len(bl)} dish blocks, some without a name or calories: the page changed shape, re-check")
        count: dict[str, int] = {}
        for b in bl:
            count[norm_name(b["name"])] = count.get(norm_name(b["name"]), 0) + 1
        print(f"{len(bl)} dish blocks on {PAGE_URL}; {sum(1 for b in bl if b['src'])} carry a photo")

        photo_of: dict[str, str] = {}
        for b in bl:
            if not b["src"]:
                continue
            key = norm_name(b["name"])
            hits = by_name.get(key, [])
            if count[key] != 1 or len(hits) != 1:
                skipped.append(f"{b['name']!r}: {count[key]} blocks on the page, {len(hits)} published items named like it")
                continue
            it = hits[0]
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            try:
                same_kcal = float(it["calories"]) == float(b["kcal"])
            except ValueError:
                same_kcal = False
            if not same_kcal:
                skipped.append(f"{it['id']}: calories {it['calories']} on item vs {b['kcal']} on the page block")
                continue
            url = original(b["src"])
            if not url.startswith(PHOTO_HOST) or GENERATED.search(url):
                skipped.append(f"{it['id']}: photo is not on the chain's media store or looks generated: {url}")
                continue
            photo_of[it["id"]] = url

        for item_id, url in sorted(photo_of.items()):
            if args.dry_run:
                print(f"  match {item_id}: {url}")
                continue
            try:
                fname = store_image(CHAIN_ID, polite_get(url, args.cache))
            except ValueError as err:
                skipped.append(f"{item_id}: {err}")
                continue
            rows[item_id] = (fname, PAGE_URL)
    except Blocked as err:
        print(f"STOPPED: {err}. Nothing written.", file=sys.stderr)
        return 1

    for s in skipped:
        print("  skipped", s)
    if args.dry_run:
        print(f"dry run: {len(photo_of)} of {len(items)} published items would get a photo")
        return 0
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK: {f} is used by {len(ids)} items: {ids}")
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
