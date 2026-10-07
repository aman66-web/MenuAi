#!/usr/bin/env python3
"""Item photos for Wimpy from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wimpy.py --cache DIR [--dry-run]

Source: the five menu pages on https://wimpy.uk.com/ (/menus/breakfast, /menus/anytime-meals, /menus/desserts,
/menus/drinks, /menus/kids; /menus is the breakfast page again). Each dish is one server-rendered card:
    <div class="menu-dish ..."> <article class="card menu-card -has-image|-no-image"> <div class="menu-card__image">
    <img src="https://wimpy.uk.com/img/uploads/<id>.png?w=325&h=300&fit=crop" alt="<dish> image"> ...
    <h4 class="card-title"><dish></h4> <p class="card-text">... 794 Kcal. ...</p>
The page asks the chain's image server for a 325x300 crop (?w=325&h=300&fit=crop). We never use a crop: we fetch the same
upload WITHOUT the query string (the full original, 648x600 for the files checked) from the same host and let
store_image do the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a card with a photo has a card-title whose norm_name equals the item's name in the CURRENT items.csv, and the
     photo's own alt text ("<title> image") names the same dish, and
  2. the card's own text states the item's calories (the item's calories appear among the card's "<n> kcal" figures), so
     a same-named card for a different portion (e.g. kids chips, 178 kcal, against the adult 318 kcal) can never lend its
     photo, and
  3. exactly one photo file qualifies for that item. A name shared by two published items, or an item that two cards
     illustrate with different photos (All-Day Breakfast has one photo on /menus/breakfast and another on
     /menus/anytime-meals), gets no photo.
The chain prints different names from its PDF guide for many dishes ("Bacon, Egg & Hash Brown Muffin" for the guide's
"Bacon & Hash Brown Muffin", "Crispy Chicken" for "Crispy Chicken Fillet (excl. sauce)", "Fish, Chips & Peas" for "Battered
Cod, Chips & Peas", "Strawberry" for "Thick Shake - Strawberry" ...). Those are NOT matched: that would be matching by
meaning, not by name. Variants the site names once but we publish several times (sauces, side portions vs dip pots, floats,
"Kids Thick Shake" flavours) get no photo either. Cards without a photo (-no-image) are ignored. Also skipped on purpose: "Wimpy Hamburger" (its photo's alt text on
/menus/anytime-meals is the promotion "WIMPY WEDNESDAY - 8.50 pounds!", not the dish) and "Jelly & Ice Cream" (the card
says 54 kcal, our guide row 112 kcal: the two sources disagree, so the card is not trusted for that row).

Terms (https://wimpy.uk.com/pages/legal, "Terms of use", read 2026-10-07): "We are the owner or the licensee of all
intellectual property rights in our site, and in the material published on it. Those works are protected by copyright laws
and treaties around the world. All such rights are reserved. You may print off one copy, and may download extracts, of any
page(s) from our site for your personal use ... you must not use any illustrations, photographs, video or audio sequences or
any graphics separately from any accompanying text. ... You must not use any part of the content on our site for commercial
purposes without obtaining a licence to do so from us or our licensors." Installed on the founder's decision of 2026-10-06
(the founder's accepted risk). robots.txt (https://wimpy.uk.com/robots.txt, read 2026-10-07) is "User-agent: * / Disallow:"
(nothing disallowed); polite_get checks it on every URL anyway.

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

CHAIN_ID = "wimpy"
BASE = "https://wimpy.uk.com"
PAGES = ["/menus/breakfast", "/menus/anytime-meals", "/menus/desserts", "/menus/drinks", "/menus/kids"]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wimpy")
SKIP_FILES: dict[str, str] = {}   # upload file name -> why it is not used (nutrition text, placeholder...)

CARD = re.compile(r'<div class="menu-dish [^"]*"[^>]*>(?P<body>.*?)</article>', re.S)
TITLE = re.compile(r'<h4 class="card-title">(?P<t>.*?)</h4>', re.S)
IMAGE = re.compile(r'<div class="menu-card__image">\s*<img src="(?P<src>[^"]+)" alt="(?P<alt>[^"]*)"', re.S)
TEXT = re.compile(r'<p class="card-text">(?P<t>.*?)</p>', re.S)
UPLOAD = re.compile(r"^(?P<base>https://wimpy\.uk\.com/img/uploads/(?P<file>[A-Za-z0-9]+\.(?:png|jpe?g|webp)))(?:\?[^\s]*)?$")
KCAL = re.compile(r"(\d+(?:\.\d+)?)\s*kcal", re.I)


def clean(fragment: str) -> str:
    """Card text with markup (<sup>®</sup>, <br>) and entities removed."""
    s = re.sub(r"<sup>.*?</sup>", "", fragment, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("®", "").replace("™", "")
    return " ".join(s.split())


def cards(page: str) -> list[dict]:
    """Every dish card WITH a photo on a menu page: title, original photo URL, alt, kcal figures."""
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)   # old, switched-off markup lives in comments
    out = []
    for m in CARD.finditer(page):
        body = m.group("body")
        t, im = TITLE.search(body), IMAGE.search(body)
        if not t or not im:
            continue
        up = UPLOAD.match(html.unescape(im.group("src")))
        if not up:
            continue
        txt = TEXT.search(body)
        out.append({
            "title": clean(t.group("t")),
            "alt": clean(im.group("alt")),
            "photo": up.group("base"),          # the original upload: no ?w=&h=&fit=crop
            "file": up.group("file"),
            "kcal": {float(x) for x in KCAL.findall(clean(txt.group("t")))} if txt else set(),
        })
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

    found: dict[str, dict[str, str]] = {}      # item id -> {photo url: page url}
    skipped: list[str] = []
    try:
        for path in PAGES:
            page_url = BASE + path
            page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            cs = cards(page)
            print(f"{len(cs)} cards with a photo on {page_url}")
            for c in cs:
                key = norm_name(c["title"])
                its = by_key.get(key)
                if not its:
                    continue
                if norm_name(re.sub(r"\s+image$", "", c["alt"], flags=re.I)) != key:
                    skipped.append(f"{path}: {c['title']!r}: photo alt text is {c['alt']!r}, not the dish name")
                    continue
                if len(its) != 1:
                    skipped.append(f"{path}: {c['title']!r} is the name of {len(its)} published items")
                    continue
                item = its[0]
                if c["file"] in SKIP_FILES:
                    skipped.append(f"{path}: {c['file']} skipped: {SKIP_FILES[c['file']]}")
                    continue
                try:
                    cal = float(item["calories"])
                except ValueError:
                    skipped.append(f"{item['id']}: no calories in items.csv to check the card against")
                    continue
                if cal not in c["kcal"]:
                    skipped.append(f"{item['id']}: card {c['title']!r} on {path} states {sorted(c['kcal'])} kcal, not {cal:g}")
                    continue
                found.setdefault(item["id"], {})[c["photo"]] = page_url

        rows: dict[str, tuple[str, str]] = {}
        for item_id, photos in sorted(found.items()):
            if len(photos) != 1:
                skipped.append(f"{item_id}: {len(photos)} different photos on the site ({', '.join(sorted(photos.values()))}); ambiguous")
                continue
            (photo, page_url), = photos.items()
            if args.dry_run:
                print(f"  {item_id:40} {photo}  <- {page_url}")
                continue
            raw = polite_get(photo, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {photo}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        n = sum(1 for p in found.values() if len(p) == 1)
        print(f"{n} of {len(items)} published items matched")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
