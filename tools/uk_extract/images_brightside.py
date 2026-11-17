#!/usr/bin/env python3
"""Item photos for Brightside from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_brightside.py --cache DIR [--dry-run]

Sources: TWO pages of the chain's own website, nothing else (no Deliveroo, no aggregator, no social media):

  A. https://brightside.co.uk/menu/ (the chain's own website menu, the page the item notes cite for the calorie cross-check). Every dish on it is
     a block `<div class="position"> <div class="position-title"><div>NAME</div><div>PRICE</div></div> [<div class="thumb"><img
     src=".../wp-content/uploads/<yyyy>/<mm>/<File>-700x394.jpg"></div>] <div class="position-subtitle">...<em>NNNkcal</em>`. Only a few dishes
     have a `thumb` (11 of 219 blocks on 2026-11-17).
  B. https://brightside.co.uk/ (the home page), its "Our menu" slider (`<section class="menu2">`): every slide is
     `<div class="splide__slide"><a href="/menu?target=..&position=.."><div class="thumb"><img src=".../wp-content/uploads/...-700x1050.jpg"></div>
     <span>CAPTION</span></a></div>`. Most captions name a section ("Takeaway Pizzas", "Brilliant Burgers", "Tasty Desserts"); a few name one dish
     ("Smokehouse BBQ Chicken Pizza", "Vegan Breakfast", "Smashed Avo Toast", "London Fog"). Only a caption that is exactly a published dish's name
     counts; a section caption matches no dish name, so its picture is never used.

For every picture the original upload (the same file name without WordPress's "-700x394" / "-700x1050" size suffix or its "-scaled" big-image copy:
the chain's own file, never a cropped rendition) is fetched, and store_image does the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. (A) a menu-page block's name, or (B) a home-page slide's caption, has the same norm_name as the item's name, and no other published item has
     that name, and
  2. (A) every menu-page block with that name (the same dish can sit in two sections of the page: Smashed Avo Toast is under "Rise & Shine" with a
     picture and again under "Noon to Night" without one) has the same price and kcal text, and the blocks that carry a picture all carry the same one;
     (B) the slides with that caption all carry the same picture, and
  3. the picture is used by exactly ONE dish name on its page (a section picture such as "THICKSHAKES", shown under one shake, is not a picture of
     that one dish: it is left out), and
  4. (A only) where the menu page prints kcal for the dish, it is within 5% of the item's calories (the chain's own rule for this data, see note.txt).
The menu page (A) wins when both pages picture the same dish (Smashed Avo Toast: its menu-page block carries the price and kcal that tie it to the
published item). Dishes pictured on either page whose name matches no published item (held back, or named differently) get no photo.

Looked at and NOT attached (the exact-name rule; listed so a later reader does not "fix" them by hand):
  - home page "Big Veggie Breakfast": the published dish is "The Big Veggie Breakfast" (a word differs).
  - menu page "Chicken, Bacon & Avocado Salad": the published dish (from the allergen matrix) is "Chicken, Bacon & Avo Salad" (a word differs), and
    "GF Chicken, Bacon & Avocado Salad" is the separate gluten-free dish.
  - menu page "Margherita" (picture SOURDOUGHPIZZA.jpg, the first pizza of the section): the published dish is "Margherita Pizza (adult)".
  - menu page "Chocolate" (picture THICKSHAKES.jpg: the section's picture) and "Fizz - Sparkling Chardonnay" (WINE.jpg): no published dish of
    that name; both are section pictures.
  - "Hot Honey Fried Chicken Waffle", "Treacle Ham, Egg & Chips", "Berry Waffle Whip": held back (the matrix and the website print different kcal).
  - home page "Rare Steak and Eggs" (an alt text under the caption "Gluten-Free"): no such dish is published.
  Other pages read on 2026-11-17 and found to tie no picture to a dish name (no caption, no alt naming one): /kids/, /offers/, /about-us/, /faqs/ and
  the 16 blog posts. The Ten Kites allergen matrix (the data source) shows no dish photos, only icons, and images.tenkites.com's robots.txt says
  `Disallow: /`. The chain has no ordering site of its own (no order or collection link on any page).

Terms (https://brightside.co.uk/terms-conditions/, read 2026-11-17, as on 2026-10-11): "This website is property of Loungers plc." and, in the
footer of every page, "(c) Brightside Roadside 2026". No clause about copying or reusing content or images was found. robots.txt
(https://brightside.co.uk/robots.txt, read 2026-11-17): "User-agent: * / Allow: /". polite_get checks robots.txt on every URL (RFC 9309).

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
HOME_URL = "https://brightside.co.uk/"
UPLOADS = "https://brightside.co.uk/wp-content/uploads/"   # the chain's own media folder
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-brightside")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after a run and left without a photo
SIZE_SUFFIX = re.compile(r"-(?:\d+x\d+|scaled)(?=\.(?:jpe?g|png|webp)$)", re.I)


def _text(fragment: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).replace("\xa0", " ").strip()


def blocks(menu_html: str) -> list[dict]:
    """(A) The menu page's dish blocks: name, price, kcal, picture (original upload) or None."""
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
            "name": _text(t.group(1)),
            "price": _text(t.group(2)),
            "kcal": kcal,
            "photo": SIZE_SUFFIX.sub("", html.unescape(im.group(1))) if im else None,
        })
    return out


def slides(home_html: str) -> list[dict]:
    """(B) The home page's "Our menu" slider: caption and picture (original upload) of every slide."""
    sec = re.search(r'<section class="menu2"(.*?)</section>', home_html, re.S)
    if not sec:
        return []
    out = []
    for part in sec.group(1).split('<div class="splide__slide"')[1:]:
        im = re.search(r'<div class="thumb">\s*<img[^>]*?\ssrc="([^"]+)"', part)
        cap = re.search(r"</div>\s*<span>(.*?)</span>", part, re.S)
        if not im or not cap:
            continue
        out.append({"name": _text(cap.group(1)), "photo": SIZE_SUFFIX.sub("", html.unescape(im.group(1)))})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page that shows it for this dish)
    try:
        menu = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        bl = blocks(menu)
        print(f"(A) {len(bl)} dish blocks on {MENU_URL}; {sum(1 for b in bl if b['photo'])} carry a photo")
        if len(bl) < 150:
            raise SystemExit(f"the menu page changed shape ({len(bl)} dish blocks): stopping, nothing written")
        home = polite_get(HOME_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        sl = slides(home)
        print(f"(B) {len(sl)} slides in the 'Our menu' slider on {HOME_URL}")
        if len(sl) < 8:
            raise SystemExit(f"the home page's menu slider changed shape ({len(sl)} slides): stopping, nothing written")

        item_names: dict[str, int] = {}
        for it in items:
            item_names[norm_name(it["name"])] = item_names.get(norm_name(it["name"]), 0) + 1

        # ---- (A) the menu page
        by_name: dict[str, list[dict]] = {}
        for b in bl:
            by_name.setdefault(norm_name(b["name"]), []).append(b)
        photo_names: dict[str, set[str]] = {}   # photo -> the dish names that carry it on the menu page
        for key, bs in by_name.items():
            for b in bs:
                if b["photo"]:
                    photo_names.setdefault(b["photo"], set()).add(key)
        for it in items:
            key = norm_name(it["name"])
            bs = by_name.get(key)
            if not bs or not any(b["photo"] for b in bs):
                continue   # not on the menu page with a picture: nothing to say
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if item_names[key] > 1:
                skipped.append(f"{it['id']}: more than one published item has this name")
                continue
            photos = {b["photo"] for b in bs if b["photo"]}
            if len({(b["price"], b["kcal"]) for b in bs}) > 1 or len(photos) > 1:
                skipped.append(f"{it['id']}: the menu page lists {it['name']!r} {len(bs)} times with different prices, kcal or pictures: ambiguous")
                continue
            photo = photos.pop()
            if not photo.startswith(UPLOADS):
                skipped.append(f"{it['id']}: picture {photo} is not in the chain's own uploads folder")
                continue
            if len(photo_names[photo]) > 1:
                skipped.append(f"{it['id']}: its picture is shared by {len(photo_names[photo])} different dish names")
                continue
            kcal = bs[0]["kcal"]
            try:
                cal = float(it["calories"])
            except ValueError:
                cal = None
            if kcal is not None and (cal is None or abs(cal - kcal) / kcal > 0.05):
                skipped.append(f"{it['id']}: calories {it['calories']} are not within 5% of the menu page's {kcal}")
                continue
            matched[it["id"]] = (photo, MENU_URL)

        # ---- (B) the home page's menu slider, for dishes the menu page does not picture
        by_caption: dict[str, set[str]] = {}
        caption_of: dict[str, set[str]] = {}    # photo -> the captions that carry it
        for s in sl:
            by_caption.setdefault(norm_name(s["name"]), set()).add(s["photo"])
            caption_of.setdefault(s["photo"], set()).add(norm_name(s["name"]))
        for it in items:
            key = norm_name(it["name"])
            if key not in by_caption or it["id"] in matched:
                continue
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if item_names[key] > 1:
                skipped.append(f"{it['id']}: more than one published item has this name")
                continue
            photos = by_caption[key]
            if len(photos) > 1:
                skipped.append(f"{it['id']}: the home page's slider shows {len(photos)} different pictures captioned {it['name']!r}: ambiguous")
                continue
            photo = next(iter(photos))
            if not photo.startswith(UPLOADS):
                skipped.append(f"{it['id']}: picture {photo} is not in the chain's own uploads folder")
                continue
            if len(caption_of[photo]) > 1:
                skipped.append(f"{it['id']}: its home-page picture carries {len(caption_of[photo])} different captions")
                continue
            matched[it["id"]] = (photo, HOME_URL)

        for item_id, (photo, page) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:46} {photo[len(UPLOADS):]:52} <- {page}")
                continue
            raw = polite_get(photo, args.cache, referer=page)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, page)
            print(f"  {item_id:46} {fname}  <- {photo[len(UPLOADS):]} ({page})")
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
