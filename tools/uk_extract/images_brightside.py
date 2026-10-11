#!/usr/bin/env python3
"""Item photos for Brightside from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_brightside.py --cache DIR [--dry-run]

Source: ONE page, https://brightside.co.uk/menu/ (the chain's own website menu, the page the item notes cite for the calorie
cross-check). Every dish on it is a block `<div class="position"> <div class="position-title"><div>NAME</div><div>PRICE</div></div>
[<div class="thumb"><img src=".../wp-content/uploads/<yyyy>/<mm>/<File>-700x394.jpg"></div>] <div class="position-subtitle">...<em>NNNkcal</em>`.
Only some dishes have a `thumb` (13 of 219 blocks). The picture's original file (the same name without the "-700x394" size suffix, 1920 px,
the chain's own upload) is fetched, never the cropped size, and store_image does the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a block's name has the same norm_name as the item's name, and
  2. every block with that name (the same dish can sit in two sections of the page) has the same price and kcal text, and carries the same
     photo or none, so the name is not ambiguous, and
  3. the photo is used by exactly ONE dish name on the page (a section picture such as "THICKSHAKES", shown under one shake, is not a
     picture of that one dish: it is left out), and
  4. where the page prints kcal for the dish, it is within 5% of the item's calories (the chain's own rule for this data, see note.txt).
Dishes the page shows with a picture but whose name matches no published item (held back, or named differently) get no photo.

Terms (https://brightside.co.uk/terms-conditions/, read 2026-10-11): "This website is property of Loungers plc." and, in the footer of every
page, "(c) Brightside Roadside 2026". No clause about images beyond that. robots.txt (https://brightside.co.uk/robots.txt, read 2026-10-11):
"User-agent: * / Allow: /". polite_get checks both on every URL (RFC 9309).

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

CHAIN_ID = "brightside"
MENU_URL = "https://brightside.co.uk/menu/"
UPLOADS = "https://brightside.co.uk/wp-content/uploads/"   # the chain's own media folder
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-brightside")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo
SIZE_SUFFIX = re.compile(r"-\d+x\d+(?=\.(?:jpe?g|png|webp)$)", re.I)


def blocks(menu_html: str) -> list[dict]:
    out = []
    for part in menu_html.split('<div class="position"')[1:]:
        t = re.search(r'<div class="position-title[^>]*>\s*<div>(.*?)</div>\s*<div>(.*?)</div>', part, re.S)
        if not t:
            continue
        k = re.search(r"<em>([^<]*)</em>", part)
        im = re.search(r'<div class="thumb">\s*<img[^>]*?\ssrc="([^"]+)"', part)
        kcal = None
        if k:
            m = re.search(r"([\d,]+)\s*kcal", k.group(1), re.I)
            kcal = int(m.group(1).replace(",", "")) if m else None
        out.append({
            "name": html.unescape(re.sub(r"<[^>]+>", "", t.group(1))).replace("\xa0", " ").strip(),
            "price": html.unescape(re.sub(r"<[^>]+>", "", t.group(2))).strip(),
            "kcal": kcal,
            "photo": SIZE_SUFFIX.sub("", html.unescape(im.group(1))) if im else None,
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
    matched: dict[str, str] = {}   # item id -> photo url
    try:
        menu = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        bl = blocks(menu)
        print(f"{len(bl)} dish blocks on {MENU_URL}; {sum(1 for b in bl if b['photo'])} carry a photo")
        if len(bl) < 150:
            raise SystemExit(f"the menu page changed shape ({len(bl)} dish blocks): stopping, nothing written")
        by_name: dict[str, list[dict]] = {}
        for b in bl:
            by_name.setdefault(norm_name(b["name"]), []).append(b)
        photo_names: dict[str, set[str]] = {}   # photo -> the dish names that carry it
        for key, bs in by_name.items():
            for b in bs:
                if b["photo"]:
                    photo_names.setdefault(b["photo"], set()).add(key)
        item_names: dict[str, int] = {}
        for it in items:
            item_names[norm_name(it["name"])] = item_names.get(norm_name(it["name"]), 0) + 1
        for it in items:
            key = norm_name(it["name"])
            bs = by_name.get(key)
            if not bs or not any(b["photo"] for b in bs):
                continue   # not on the page with a picture: nothing to say
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if item_names[key] > 1:
                skipped.append(f"{it['id']}: more than one published item has this name")
                continue
            if len({(b["price"], b["kcal"]) for b in bs}) > 1 or len({b["photo"] for b in bs}) > 1:
                skipped.append(f"{it['id']}: the page lists {it['name']!r} {len(bs)} times with different prices, kcal or pictures: ambiguous")
                continue
            b = bs[0]
            if not b["photo"].startswith(UPLOADS):
                skipped.append(f"{it['id']}: picture {b['photo']} is not in the chain's own uploads folder")
                continue
            if len(photo_names[b["photo"]]) > 1:
                skipped.append(f"{it['id']}: its picture is shared by {len(photo_names[b['photo']])} different dish names")
                continue
            try:
                cal = float(it["calories"])
            except ValueError:
                cal = None
            if b["kcal"] is not None and (cal is None or abs(cal - b["kcal"]) / b["kcal"] > 0.05):
                skipped.append(f"{it['id']}: calories {it['calories']} are not within 5% of the page's {b['kcal']}")
                continue
            matched[it["id"]] = b["photo"]

        for item_id, photo in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:46} {photo[len(UPLOADS):]}")
                continue
            raw = polite_get(photo, args.cache, referer=MENU_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, MENU_URL)
            print(f"  {item_id:46} {fname}  <- {photo[len(UPLOADS):]}")
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
