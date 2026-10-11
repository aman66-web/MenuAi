#!/usr/bin/env python3
"""Item photos for Turtle Bay from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_turtle_bay.py --cache DIR [--dry-run]

Source: the menu page https://turtlebay.co.uk/menu/bath (the page the calories were read from). That page is a small Vue app that loads
the chain's own menu record from the feed its own script names, https://tb-menu-proxy.herokuapp.com/restaurant/bath (a cache of the
chain's Contentful space; `fetch(`${tt}/restaurant/${currentSlug}`)` in https://turtlebay.co.uk/assets/js/234.js), and draws each dish card
from one `menuItem` record: fields.title, fields.image (an asset whose file.url is on the chain's own Contentful media host
images.ctfassets.net, space k1ttx7vjqtsp) and fields.info. The page shows that image in the dish's pop-up (`?w=500`). We fetch the
original asset file once (no query string) and let store_image make the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. exactly ONE menuItem record in the chain's Main Menu has a title whose norm_name equals the item's name (the item's name is the title
     the pop-up read gave; the one exception is MAC & CHEESE (side), see ALIAS: the chain prints "Mac & Cheese" under Sides and again under
     Easy Eating, so the section decides), and
  2. that record's section title is the item's category (the data calls Sides "Side"), and
  3. the same record carries the image, and the image is on the chain's Contentful host (images.ctfassets.net/k1ttx7vjqtsp/).
Records with no image give no photo (59 of the 100 food dishes). A dish name printed twice (Mac & Cheese) is not matched by name alone.
The feed holds the Bath restaurant's record; the chain's note says the same dishes appear in all 43 restaurants.

Terms (https://turtlebay.co.uk/legal, "1. Legal Terms" and "2. User License", read 2026-10-11): "The materials contained in this web site are
protected by applicable copyright and trade mark law." and "Permission is granted to temporarily download one copy of the materials
(information or software) on Turtle Bay's web site for personal, non-commercial transitory viewing only. ... you may not: 1. Modify or copy
the materials; use the materials for any commercial purpose, or for any public display (commercial or non-commercial); ... 4. Transfer the
materials to another person or "mirror" the materials on any other server." That is an express restriction; installed on the founder's
decision of 2026-10-06 (his accepted risk). robots.txt: https://turtlebay.co.uk/robots.txt answers 404 (no rules);
https://tb-menu-proxy.herokuapp.com/robots.txt answers 404 ("Cannot GET /robots.txt", no rules); https://images.ctfassets.net/robots.txt answers
404 (no rules). polite_get checks all three on every URL (RFC 9309). The site refuses a bare "Mozilla/5.0" user agent with 404; polite_get's
normal browser User-Agent is accepted.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "turtle-bay"
PAGE_URL = "https://turtlebay.co.uk/menu/bath"
FEED_URL = "https://tb-menu-proxy.herokuapp.com/restaurant/bath"
PHOTO_PREFIX = "https://images.ctfassets.net/k1ttx7vjqtsp/"   # the chain's own Contentful media store, as named by the feed
DEFAULT_CACHE = Path("/tmp/menumacros-images-turtle-bay")
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {}
# item id -> (section title, record title) for the one item whose published name carries our own disambiguation
ALIAS: dict[str, tuple[str, str]] = {
    "mac-and-cheese-side": ("Sides", "Mac & Cheese"),
}
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)


def load_feed(cache: Path) -> dict:
    raw = polite_get(FEED_URL, cache, accept="application/json")
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw)


def records(feed: dict) -> list[dict]:
    """Every menuItem of the Main Menu as {section, title, url, name_key}."""
    out = []
    mains = [m for m in feed["fields"]["tierMenus"] if m["fields"].get("displayTitle", "").lower() == "main menu"]
    if len(mains) != 1:
        raise SystemExit("page changed shape: no single 'Main Menu' in the feed")
    for sec in mains[0]["fields"]["sections"]:
        sf = sec.get("fields")
        if not sf:
            continue
        for it in sf.get("menuItems", []):
            f = it.get("fields") or {}
            if not f.get("title"):
                continue
            img = (f.get("image") or {}).get("fields", {}).get("file", {}) if f.get("image") else {}
            url = img.get("url") or ""
            if url.startswith("//"):
                url = "https:" + url
            out.append({"section": sf["title"], "title": f["title"].strip(), "url": url, "key": norm_name(f["title"])})
    return out


def same_section(item_cat: str, section: str) -> bool:
    a, b = norm_name(item_cat), norm_name(section)
    return a == b or a + "s" == b


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        recs = records(load_feed(args.cache))
        print(f"{len(recs)} dish records in the Main Menu feed; {sum(1 for r in recs if r['url'])} carry a photo")

        matched: dict[str, str] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if it["id"] in ALIAS:
                sec, title = ALIAS[it["id"]]
                cands = [r for r in recs if r["section"] == sec and r["title"] == title]
            else:
                cands = [r for r in recs if r["key"] == norm_name(it["name"])]
            if len(cands) != 1:
                skipped.append(f"{it['id']}: {len(cands)} records of the chain carry the name {it['name']!r}")
                continue
            r = cands[0]
            if not same_section(it["category"], r["section"]):
                skipped.append(f"{it['id']}: record is in section {r['section']!r}, the item in {it['category']!r}")
                continue
            if not r["url"]:
                skipped.append(f"{it['id']}: the chain's record has no photo")
                continue
            if not r["url"].startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: photo {r['url']} is not in the chain's media store")
                continue
            if GENERATED.search(r["url"]):
                skipped.append(f"{it['id']}: file name says AI-generated: {r['url']}")
                continue
            matched[it["id"]] = r["url"]

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {url[len(PHOTO_PREFIX):]}")
                continue
            raw = polite_get(url, args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
            print(f"  {item_id:40} {fname}  <- {url[len(PHOTO_PREFIX):]}")
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
