#!/usr/bin/env python3
"""Item photos for Five Guys UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_five_guys.py --cache DIR [--dry-run]

Source: the chain's own menu category pages on www.fiveguys.co.uk (the site that links the nutrition PDF the data came from):
    /menu/burgers/  /menu/dogs/  /menu/sandwiches/  /menu/toppings/
Each page is a grid of cards: <div class="card-menu-item"> ... <h3>Name</h3> ... <div class="card-menu-item-thumb"><img src=...>.
The photo is the card's own thumbnail, on the chain's own uploads folder (www.fiveguys.co.uk/wp-content/uploads/...).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when
  - the card's <h3> equals the published item's name (images_common.norm_name equality against the CURRENT items.csv),
  - the item's category is one that page lists (burgers page -> Burgers, dogs -> Hot dogs, sandwiches -> Sandwiches,
    toppings -> Toppings & sauces), so a name that only coincides across pages can never pull a photo from the wrong kind of
    product,
  - where the card has an "Order Now, <name>." button, that name equals the heading too,
  - the card's photo is on www.fiveguys.co.uk/wp-content/uploads/ and no other card on the page shows the same file
    (a repeated file would be a placeholder or banner, not a photo of one item), and
  - exactly one published item has that name, and every card that names it shows the same photo.
Not matched, on purpose: the shakes page (its cards are mix-in tiles named "Bananas", "Oreo Cookies", "Bacon"...: not the
published names "Banana mix-in", ..., and the exact-name collision "Bacon" is a bacon milkshake photo, not the bacon strip
item); the fries page ("Five Guys Style" / "Cajun Style" / "Loaded ..." are not the published "Regular Fries" etc.); toppings
the chain names differently ("Onions" vs "Fresh Onions", "Ketchup" vs "Tomato Ketchup", "HP Sauce" vs "HP Brown Sauce",
"Heinz Mayo" vs "Mayonnaise"); and the page's "BLT" card (the published item is "BLT (Bacon, Lettuce and Tomato)").
Photos are never matched by file name, alt text or position.

Terms (https://www.fiveguys.co.uk/legal/, read 2026-10-07), quoted:
  3.1.1 "... the copyright and other intellectual property rights in this Website and in material published on it (including
        without limitation photographs and graphical images) are owned by Five Guys UK or Five Guys UK's licensors."
  3.1.2 "... you must not use any pictures, photographs or any other graphics, video or audio sequences separately from any
        accompanying text."
  3.1.4 "You are not allowed to use or pass to any other party to use any of the materials on this Website or the Website
        itself for commercial purposes without obtaining a licence from Five Guys UK to do so."
  3.2   "... no part of this Website may be reproduced or stored in any other website or included in any public or private
        electronic retrieval system or service without our prior written permission."
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2; the founder's accepted risk). The photos are shown with
the item's name and the caption "Photo from the Five Guys website"; take them down the day Five Guys asks.

robots.txt (read 2026-10-07): "Crawl-delay: 10", then "User-agent: * / Disallow:" (nothing is disallowed) plus a sitemap.
We honour the crawl delay: one request every 10 seconds to www.fiveguys.co.uk, pages and photos alike.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "five-guys"
SITE = "https://www.fiveguys.co.uk"
UPLOADS = SITE + "/wp-content/uploads/"
DELAY = 10.0   # robots.txt "Crawl-delay: 10"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# page path -> the item categories (items.csv) that page's cards can name
PAGES: list[tuple[str, set[str]]] = [
    ("/menu/burgers/", {"Burgers"}),
    ("/menu/dogs/", {"Hot dogs"}),
    ("/menu/sandwiches/", {"Sandwiches"}),
    ("/menu/toppings/", {"Toppings & sauces"}),
]
SKIP_FILES: dict[str, str] = {}   # uploaded file name -> why it is not used (prints nutrition numbers/claims, placeholder...)

CARD_SPLIT = re.compile(r'<div class="card-menu-item"')
H3 = re.compile(r"<h3[^>]*>(.*?)</h3>", re.S)
THUMB = re.compile(r'class="card-menu-item-thumb"[^>]*>\s*<img\b[^>]*?\bsrc="([^"]+)"', re.S)
ORDER_LABEL = re.compile(r'aria-label="Order Now,\s*(.*?)\.?\s*"', re.S)


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def cards(page: str) -> list[dict]:
    """Every menu card on a category page: heading, order-button name (or None) and thumbnail URL (or None)."""
    out = []
    for part in CARD_SPLIT.split(page)[1:]:
        part = part.split("</li>")[0]
        h = H3.search(part)
        if not h:
            continue
        thumb = THUMB.search(part)
        label = ORDER_LABEL.search(part)
        out.append({
            "name": clean(h.group(1)),
            "label": clean(label.group(1)) if label else None,
            "photo": html.unescape(thumb.group(1)).strip() if thumb else None,
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the pages only; print the matches; write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    found: dict[str, set[tuple[str, str]]] = {}   # item id -> {(photo url, page url)}
    skipped: list[str] = []
    unmatched_cards: list[str] = []
    try:
        for path, cats in PAGES:
            page_url = SITE + path
            page = ic.polite_get(page_url, args.cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
            cs = cards(page)
            print(f"{len(cs)} cards on {page_url}")
            photo_use: dict[str, int] = {}
            for c in cs:
                if c["photo"]:
                    photo_use[c["photo"]] = photo_use.get(c["photo"], 0) + 1
            for c in cs:
                key = ic.norm_name(c["name"])
                if not c["photo"]:
                    continue                        # promo / "for those who like..." cards carry no photo of an item
                its = [it for it in by_name.get(key, []) if it["category"] in cats]
                if not its:
                    unmatched_cards.append(f"{path}: card {c['name']!r} names no published item")
                    continue
                if len(its) > 1:
                    skipped.append(f"{path}: {c['name']!r} is the name of {len(its)} published items")
                    continue
                item = its[0]
                if c["label"] is not None and ic.norm_name(c["label"]) != key:
                    skipped.append(f"{item['id']}: card heading {c['name']!r} but order button names {c['label']!r}")
                    continue
                if not c["photo"].startswith(UPLOADS):
                    skipped.append(f"{item['id']}: photo is not on the chain's uploads folder: {c['photo']}")
                    continue
                if photo_use[c["photo"]] > 1:
                    skipped.append(f"{item['id']}: {c['photo']} is shown on {photo_use[c['photo']]} cards of {path}")
                    continue
                fname = c["photo"].rsplit("/", 1)[-1]
                if fname in SKIP_FILES:
                    skipped.append(f"{item['id']}: {fname} skipped: {SKIP_FILES[fname]}")
                    continue
                found.setdefault(item["id"], set()).add((c["photo"], page_url))
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    matches: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    for it in items:
        pairs = found.get(it["id"])
        if not pairs:
            continue
        photos = {p for p, _ in pairs}
        if len(photos) > 1:
            skipped.append(f"{it['id']}: {len(photos)} different photos for this name; ambiguous, no photo")
            continue
        photo = photos.pop()
        matches[it["id"]] = (photo, sorted(pg for p, pg in pairs)[0])

    names = {it["id"]: it["name"] for it in items}
    rows: dict[str, tuple[str, str]] = {}
    for item_id, (photo, page_url) in matches.items():
        if args.dry_run:
            print(f"  {item_id:36} {names[item_id]!r:36} {photo}  <- {page_url}")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, delay=DELAY, referer=page_url)
            rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            print(f"  {item_id:36} {rows[item_id][0]}  <- {photo}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 1
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")

    for s in unmatched_cards:
        print("  card only:", s)
    for s in skipped:
        print("  skip:", s)
    if args.dry_run:
        print(f"{len(matches)} of {len(items)} published items matched")
        return 0
    if rows:
        ic.write_images_csv(CHAIN, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
