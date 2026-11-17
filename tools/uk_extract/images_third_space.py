#!/usr/bin/env python3
"""Item photos for Third Space's Natural Fitness Food shakes from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; images_common.py).

    python3 tools/uk_extract/images_third_space.py --cache DIR [--dry-run]

Source: ONE page, https://www.thirdspace.london/natural-fitness-foods-menu/ (the page tools/uk_extract/third_space.py reads the shakes
from). Every shake is one card: `<a href="https://www.thirdspace.london/food/<slug>/"> ... <span class="sr-only">NAME</span> ...
<picture><source srcset=...><img src="https://www.thirdspace.london/wp-content/uploads/<yyyy>/<mm>/<file>"> ... CALORIES 347kcal PROTEIN
27g CARBOHYDRATES 34g FAT 10g`. The photo is the <img src> file in the chain's own WordPress media library (same host as the page),
fetched directly (not a -300x200 / -1024x683 variant) and downsized by store_image only (<= 640 px, WebP).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the card's name has the same norm_name as the item's name and is unique on the page,
  2. the card's printed calories, protein, carbohydrate and fat equal the published row's (the card and the table we publish are the
     same record on the chain's page), and
  3. the card's <a href> ends in /food/<item id>/ (the chain's own page for that shake carries the same name as the item id), and
  4. the picture is in the chain's own media library (host check) and is not an obvious generated image (file name check).
Third Space prints one photo per shake, and no photo for the protein powders, milks and add-ons (those are not published items).

Terms (https://www.thirdspace.london/website-tcs/, "Intellectual property rights", read 2026-10-11): "All intellectual property rights
in the Website and its content are owned by us or our licensors. No part of the Website may be used for commercial purposes without our
prior written consent. You may view or print extracts of the Website for personal, non-commercial use but you must not copy,
reproduce, distribute or modify any content on the Website." That is an express restriction; installed on the founder's decision of
2026-10-06 (his accepted risk). robots.txt (https://www.thirdspace.london/robots.txt, read 2026-10-11): "User-agent: * / Disallow:
/wp-admin/ / Allow: /wp-admin/admin-ajax.php": the menu page and /wp-content/uploads/ are allowed (RFC 9309 matcher in polite_get).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Checked again 2026-11-17 (dry run only; images.csv left as written on 2026-10-11, 9 of 11 shakes). The page still has 11 cards, but the
card at /food/apple-crumble/ is now titled "Gingerbread" (photo GB-Shake-09.jpg, 379 kcal / 23 g / 42 g / 13 g): the Apple Crumble card
is gone, so no card names "Apple Crumble" any more. The Apple Crumble photo already stored (taken from the chain's own Apple Crumble card on
2026-10-11; looked at again on a contact sheet: a shake with apple slices and cinnamon) is still the chain's photo of the published item, so
CARRY_OVER keeps that row on a rerun instead of dropping it; nothing new is downloaded for it and Gingerbread is not a published item. Berry
Blast and Superhuman still show each other's file names (/food/berry-blast/ itself shows Superman-7; the Superhuman card links to
/food/superman/ and shows Berry-Blast-9): looked at again full size, a pink and a purple berry shake that can't be told apart, so both stay
without a photo. robots.txt and the terms clause quoted above were re-read on 2026-11-17: unchanged.
"""
from __future__ import annotations

import argparse
import csv
import html
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "third-space"
SITE = "https://www.thirdspace.london"
PAGE_URL = SITE + "/natural-fitness-foods-menu/"
PHOTO_PREFIX = SITE + "/wp-content/uploads/"          # the chain's own media library, as named by the card's <img src>
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-third-space")
DROP_ITEMS: dict[str, str] = {   # item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
    "berry-blast": "on the chain's page the Berry Blast card shows the file 'Superman-7-scaled.webp' and the Superhuman card shows "
                   "'Berry-Blast-9-scaled.webp' (the two file names look swapped); both shakes contain berries, so the pink and the purple "
                   "picture cannot be told apart by eye: ambiguous, no photo for either",
    "superhuman": "see berry-blast: its card shows 'Berry-Blast-9-scaled.webp' (the file names of the two cards look swapped)",
}

# item id -> why a photo already in images.csv is kept when no card on the page names the item any more (the row and its stored file are
# carried over unchanged; never used to add a photo that was not taken from the chain's own card for that item)
CARRY_OVER: dict[str, str] = {
    "apple-crumble": "the Apple Crumble card was replaced by Gingerbread after 2026-10-11; the stored photo came from the chain's own Apple "
                     "Crumble card and still shows the published item",
}

CARD = re.compile(r'<div class="Post__Grid-post[^"]*"[^>]*>\s*<a href="(https://www\.thirdspace\.london/food/([a-z0-9-]+)/)"(.*?)</a>\s*</div>', re.S)
NAME = re.compile(r'<span class="sr-only">(.*?)</span>', re.S)
IMG_SRC = re.compile(r'<img[^>]*?\ssrc="([^"]+)"')
STAT = re.compile(r"<span>\s*(CALORIES|PROTEIN|CARBOHYDRATES|FAT)\s*</span>\s*<span>\s*([\d.]+)\s*(?:kcal|g)\s*</span>", re.S)
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)
FIELD = {"CALORIES": "calories", "PROTEIN": "protein_g", "CARBOHYDRATES": "carbs_g", "FAT": "fat_g"}


def cards(page_html: str) -> list[dict]:
    out = []
    for href, slug, body in CARD.findall(page_html):
        name = NAME.search(body)
        img = IMG_SRC.search(body)
        stats = {FIELD[k]: float(v) for k, v in STAT.findall(body)}
        out.append({
            "href": href, "slug": slug,
            "name": " ".join(html.unescape(re.sub(r"<[^>]+>", "", name.group(1))).split()) if name else "",
            "photo": html.unescape(img.group(1)) if img else "",
            "stats": stats,
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page_html = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        cs = cards(page_html)
        if len(cs) < 8:
            print(f"STOP: only {len(cs)} shake cards found on {PAGE_URL}; the page has changed shape", file=sys.stderr)
            return 1
        print(f"{len(cs)} shake cards on {PAGE_URL}")
        by_name: dict[str, list[dict]] = {}
        for c in cs:
            by_name.setdefault(norm_name(c["name"]), []).append(c)

        previous: dict[str, tuple[str, str]] = {}
        prev_csv = Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID / "images.csv"
        if prev_csv.exists():
            with open(prev_csv, newline="", encoding="utf-8") as f:
                previous = {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(f)}
        images_dir = Path(__file__).resolve().parents[2] / "web" / "public" / "menu-images" / CHAIN_ID

        matched: dict[str, str] = {}
        carried: dict[str, tuple[str, str]] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            hits = by_name.get(norm_name(it["name"]), [])
            if not hits and it["id"] in CARRY_OVER and it["id"] in previous and (images_dir / previous[it["id"]][0]).exists():
                carried[it["id"]] = previous[it["id"]]
                skipped.append(f"{it['id']}: no card names it any more; the stored photo is kept: {CARRY_OVER[it['id']]}")
                continue
            if len(hits) != 1:
                skipped.append(f"{it['id']}: {len(hits)} cards named {it['name']!r}")
                continue
            c = hits[0]
            if c["slug"] != it["id"]:
                skipped.append(f"{it['id']}: the card links to /food/{c['slug']}/")
                continue
            try:
                same = all(float(it[k]) == v for k, v in c["stats"].items()) and len(c["stats"]) == 4
            except ValueError:
                same = False
            if not same:
                skipped.append(f"{it['id']}: card figures {c['stats']} differ from the published row")
                continue
            if not c["photo"].startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: photo {c['photo']!r} is not in the chain's media library")
                continue
            if GENERATED.search(urllib.parse.unquote(c["photo"])):
                skipped.append(f"{it['id']}: file name says AI-generated")
                continue
            matched[it["id"]] = c["photo"]

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:25} {url[len(PHOTO_PREFIX):]}")
                continue
            raw = polite_get(url, args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url[len(PHOTO_PREFIX):]}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
        for item_id, row in carried.items():
            if item_id not in rows:
                rows[item_id] = row
    except Blocked as e:
        print(f"STOP (blocked, nothing written): {e}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"{len(matched) + len(carried)} of {len(items)} items would have a photo ({len(carried)} kept from the earlier run)")
    else:
        if not rows:
            print("no photo matched; nothing written")
            return 0
        write_images_csv(CHAIN_ID, rows)
        for f, ids in suspected_placeholders(rows).items():
            print(f"LOOK: {f} is used by {len(ids)} items: {ids}")
        print(f"{len(rows)} of {len(items)} items have a photo; wrote data/source/{CHAIN_ID}/images.csv")
    for s in skipped:
        print("  skipped:", s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
