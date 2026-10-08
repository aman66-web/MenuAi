#!/usr/bin/env python3
"""Item photos for Hard Rock Cafe from the chain's own menu page (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_hard_rock_cafe.py --cache DIR [--dry-run]

Source: https://cafe.hardrock.com/menu.aspx (the chain's one menu page; https://cafe.hardrock.com/london/menu.aspx redirects to it,
the sitemap lists only this menu page, and the London cafe page itself only links PDF menus, which carry no per-dish photos we
may use). The page is the chain's GLOBAL menu ("Item and Availability may vary by location."); the London cafe's printed PDF menu
is our nutrition source. Each tab shows up to two "featured items": a photo plus the dish's name,
    <div class="featuredItem TabFeaturedItem1"> <img alt="..." title="<dish>" data-originalsrc="https://cafe.hardrock.com/files/5282/<file>.jpg"> ...
    <div class=featuredItemContent><h3><DISH NAME></h3><div>ingredients</div></div></div>
The page loads `data-originalsrc` into `src` when the tab is opened; that is the chain's own full-size file, which we fetch (one
request each) and let store_image do the only change (downsize to <= 640 px, WebP). The menu page itself is read as plain HTML
(it is served in the raw response, no browser needed).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when, in the same featured-item record,
  1. the <h3> dish name has the same norm_name as the item's name in the CURRENT items.csv, and
  2. the photo's own title attribute (the name the chain gave the photo) has that same norm_name, and
  3. exactly one published item has that name.
That matches 6 items; after looking at the photos 5 are kept: Original Legendary Burger, One Night in Bangkok Spicy Shrimp,
BBQ Pulled Pork Sandwich, Cobb Salad, Baby Back Ribs (Hot Fudge Brownie is dropped: see DROP_ITEMS). Everything else on the page is left alone on purpose: "Legendary Nachos" (our guide's dish is
"Classic Nachos": a different name), "Messi's X Burger" (a photo of Lionel Messi with children, not food; our kids' item is
"Kids Messi's Burger"), the "Hurricane" cocktail (not in our guide) and the lifestyle photo with no dish name. The names in
our guide that do not appear on the page get no photo, however similar the dish may look.

Terms (https://www.hardrock.com/terms-conditions, "Terms and Conditions", linked as TERMS in the cafe site's footer, read 2026-10-08):
"Except as provided in the next sentence, the Materials may not be copied, reproduced, modified, published, uploaded, downloaded,
posted, transmitted, or distributed in any way, without hardrock.com's prior written permission. You may download one (1) copy of
the Materials on a single computer only for your personal, non-commercial, internal use." ("Materials" = "the text, information,
material, software and graphics contained on this web site".) Installed on the founder's decision of 2026-10-06 (the founder's
accepted risk). robots.txt (https://cafe.hardrock.com/robots.txt, read 2026-10-08) allows everything (only Allow lines for js/css
and sitemap lines); polite_get checks it on every URL anyway.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
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

CHAIN_ID = "hard-rock-cafe"
PAGE_URL = "https://cafe.hardrock.com/menu.aspx"
PHOTO_PREFIX = "https://cafe.hardrock.com/files/5282/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-hard-rock-cafe")
DROP_ITEMS: dict[str, str] = {     # item id -> why it was looked at and left without a photo (a rerun must not bring it back)
    "hot-fudge-brownie": "the chain's photo for this dish shows an ice-cream sundae in a glass (whipped cream, hot fudge, cherry); "
                         "no brownie is visible, so it does not clearly show the named item",
}

RECORD = re.compile(r'<div class="featuredItem [^"]*">(?P<body>.*?)</script>', re.S)
IMG = re.compile(r"<img\b(?P<attrs>[^>]*)>", re.S)
ATTR = re.compile(r"""([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))""")
H3 = re.compile(r"<h3>(?P<t>.*?)</h3>", re.S)


def clean(fragment: str) -> str:
    s = re.sub(r"<br\s*/?>", " ", fragment)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("®", "").replace("™", "")
    return " ".join(s.split())


def records(page: str) -> list[dict]:
    """Every featured-item record that has a photo file and a dish name: {name, title, alt, photo}."""
    out = []
    for m in RECORD.finditer(page):
        body = m.group("body")
        im, h3 = IMG.search(body), H3.search(body)
        if not im or not h3:
            continue
        attrs = {a.lower(): (b or c or d) for a, b, c, d in ATTR.findall(im.group("attrs"))}
        photo = html.unescape(attrs.get("data-originalsrc", ""))
        if not photo.startswith(PHOTO_PREFIX):
            continue
        out.append({"name": clean(h3.group("t")), "title": html.unescape(attrs.get("title", "")),
                    "alt": html.unescape(attrs.get("alt", "")), "photo": photo})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    matches: dict[str, str] = {}      # item id -> original photo URL
    skipped: list[str] = []
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        recs = records(page)
        print(f"{len(recs)} featured items with a photo and a dish name on {PAGE_URL}")
        for r in recs:
            key = norm_name(r["name"])
            its = by_key.get(key)
            if not its:
                skipped.append(f"{r['name']!r}: no published item with this name (photo title {r['title']!r})")
                continue
            if norm_name(r["title"]) != key:
                skipped.append(f"{r['name']!r}: the photo's own title is {r['title']!r}, not the dish name")
                continue
            if len(its) != 1:
                skipped.append(f"{r['name']!r} is the name of {len(its)} published items")
                continue
            item = its[0]
            if item["id"] in DROP_ITEMS:
                skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                continue
            matches[item["id"]] = r["photo"]
            print(f"MATCH {item['id']}: {r['name']!r} -> {r['photo']}")

        rows: dict[str, tuple[str, str]] = {}
        stored: dict[str, str] = {}       # photo url -> stored file name
        for item_id, photo in sorted(matches.items()):
            raw = polite_get(photo, args.cache, referer=PAGE_URL)
            if photo not in stored:
                try:
                    stored[photo] = "" if args.dry_run else store_image(CHAIN_ID, raw)
                except ValueError as e:
                    skipped.append(f"{item_id}: {photo}: {e}")
                    stored[photo] = ""
                    continue
            if stored[photo] or args.dry_run:
                rows[item_id] = (stored[photo] or "dry-run", PAGE_URL)
    except Blocked as e:
        print(f"BLOCKED: {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print("skipped:", s)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for fname, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"shared photo {fname}: {ids}")
    if not args.dry_run:
        write_images_csv(CHAIN_ID, rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
