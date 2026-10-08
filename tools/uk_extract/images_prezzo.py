#!/usr/bin/env python3
"""Item photos for Prezzo (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_prezzo.py --cache <dir> [--dry-run]

Source: Prezzo's own "See our Specials" page, https://www.prezzo.co.uk/about/specials/ (one request, cached). Each special is a
card on that page: a photo (/media/<id>/<name>.jpg on prezzo.co.uk itself) above the dish's name (<p class="h3">) and its
description. That is the only place on prezzo.co.uk where a photo sits next to a dish name:
  * the allergen & nutrition page (/allergens/, the page the numbers come from) carries `"image": null` for every one of its
    513 dishes, and the a-la-carte, drinks, kids, gluten-free and vegetarian-vegan menu pages show no dish photos at all;
  * the other pages with photos (home, offers, lunch, kids, afternoon tea, Christmas, pizza party...) show banners and
    lifestyle shots with no dish name beside them, so they are not used.

Match rule (exact, nothing fuzzy): a card's photo is attached to a published item only when the card's dish name equals the
item's name (images_common.norm_name). A name that two published items share, or that two cards give with different photos,
gets no photo; cards whose name matches no published item (a special that is not in the allergen guide, or was held back) are
ignored, as are items the page does not name.

robots.txt of www.prezzo.co.uk (checked 2026-10-08): "User-agent: * / Disallow: /umbraco#/ / Disallow: /Api/" - the page and
/media/ are allowed; images_common.polite_get honours it (1 request/second, a normal browser User-Agent, 403/429 stop the run).
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "prezzo"
SITE = "https://www.prezzo.co.uk"
PAGE = "/about/specials/"
# photo URL -> why it is not used (filled in after looking at every photo)
DROP: dict[str, str] = {}


def cards(page_html: str) -> list[tuple[str, str]]:
    """[(photo url, dish name)] for every card of the page that has both a photo and a dish name."""
    out = []
    for chunk in page_html.split('<div class="flex flex-col h-full justify-between">')[1:]:
        img = re.search(r'<img[^>]*\bsrc="(/media/[^"?]+\.(?:jpg|jpeg|png|webp))[^"]*"', chunk)
        name = re.search(r'<p class="h3">(.*?)</p>', chunk, re.S)
        if img and name:
            out.append((SITE + img.group(1), html.unescape(re.sub(r"<[^>]+>", "", name.group(1))).strip()))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="match only: download and store nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    page_url = SITE + PAGE
    try:
        page_html = ic.polite_get(page_url, args.cache, accept="text/html").decode("utf-8", "replace")
    except ic.Blocked as e:
        print(f"STOP: {e}")
        return 2
    found = cards(page_html)
    print(f"{page_url}: {len(found)} cards with a photo and a dish name")

    photos_by_name: dict[str, set[str]] = {}
    for url, name in found:
        if url in DROP:
            print(f"  dropped {name!r}: {DROP[url]}")
            continue
        photos_by_name.setdefault(ic.norm_name(name), set()).add(url)

    rows: dict[str, tuple[str, str]] = {}
    for key, urls in sorted(photos_by_name.items()):
        matches = by_name.get(key, [])
        if not matches:
            print(f"  no published item named {key!r}: skipped")
            continue
        if len(matches) > 1 or len(urls) > 1:
            print(f"  ambiguous {key!r} ({len(matches)} items, {len(urls)} photos): skipped")
            continue
        it, url = matches[0], next(iter(urls))
        if args.dry_run:
            print(f"  match {it['id']} <- {url}")
            rows[it["id"]] = ("(dry-run)", page_url)
            continue
        try:
            fname = ic.store_image(CHAIN, ic.polite_get(url, args.cache, referer=page_url))
        except ic.Blocked as e:
            print(f"STOP: {e}")
            return 2
        except ValueError as e:
            print(f"  {it['id']}: {e}: skipped")
            continue
        rows[it["id"]] = (fname, page_url)
        print(f"  {it['id']} <- {url} -> {fname}")

    print(f"{len(rows)} of {len(items)} published items have a photo")
    if args.dry_run:
        return 0
    ic.write_images_csv(CHAIN, rows)
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {f} is used by {len(ids)} items: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
