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
  1. a card with a photo has a card-title whose norm_name equals EITHER the item's name in the CURRENT items.csv OR the dish name
     the chain's own guide prints for that row (wimpy.SECTIONS, the label the item was extracted from) once the guide's own note
     on the figures is taken off the end: "(Figures are for white toast)", "(Figures exclude choice of sauce)", "(Figures exclude
     choice of cream or ice cream side)", "(excludes choice of sauce)" (FIGURE_NOTE). That note says what the numbers cover, it is
     not part of the dish's name: the guide row "Crispy Chicken Stack (Figures exclude choice of sauce)" is the dish the site's card
     "Crispy Chicken Stack" names ("656 Kcal" on both), published by us as "Crispy Chicken Stack (excl. sauce)". Only a trailing
     figures note is removed; words are never dropped, added or reordered ("Loaded Churros (Sharer Basket)", "Hot Chocolate (without
     Cream)" and "Quarterpounder Bacon & Cheese Burger" stay as printed and match no card). A key that would point at two published
     items is not used. The photo's own alt text ("<title> image") must name the same dish as the card title, and
  2. the card's own text states the item's calories (the item's calories appear among the card's "<n> kcal" figures), so
     a same-named card for a different portion (e.g. kids chips, 178 kcal, against the adult 318 kcal) can never lend its
     photo, and
  3. exactly one photo qualifies for that item, compared by the bytes of the files (SHA-256), not by their addresses: All-Day
     Breakfast's cards on /menus/breakfast and /menus/anytime-meals point at two upload names that hold the identical file, so it is
     one photo (credited to /menus/breakfast, the first page that shows it); two cards with genuinely different pictures still give
     no photo. A name shared by two published items gets no photo.
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

Run of 2026-11-17: the five menu pages, /robots.txt (still "User-agent: * / Disallow:") and /pages/legal (the clause above, word for word
unchanged) were read again. The site's other pages were checked for more per-dish photos: /pages/sitemap lists no other menu page;
/promotions/new-menu and /promotions/wimpy-savers show promotional pictures under marketing headings ("Coffee Thick Shake", "SAVER
CHEESEBURGER" ...), none of which names a published item exactly that the menu cards don't already cover, so they are not used;
/pages/kids answers 404. Added by the guide-label rule (1) and the same-bytes rule (3): All-Day Breakfast, Big Brekkie (white toast),
Sunrise (white toast), Crispy Chicken Stack (excl. sauce), Chicken Wrap (excl. sauce), Chocolate Brownie and Caramel Apple Pie (excl.
cream or ice cream: each card prints the dish's kcal and the cream/ice-cream side's kcal separately) and Waffle & Ice Cream (excl.
sauce topping). Still no photo, by name: the muffins ("Bacon, Egg & Hash Brown Muffin", "Sausage & Egg Muffin" ...), "Toasted
Teacake", "Quarterpounder Bacon & Cheese", "Chicken Bacon Stack", "Crispy Chicken", "Fish, Chips & Peas", "Jacket Potato with 2
Toppings", the "... Sundae" desserts, "Loaded Churros", "Waffle Stack & Ice Cream", the shakes ("Strawberry", "Kids Vanilla Thick
Shake" ...), "Wimpy Float", "Lipton Ice Tea", "Ballygowan Mineral Water", "7UP Free", "Tango Orange Free", "Hot Chocolate",
"Crispy Chicken Strips (2)", "Fruit Shoot". Berry Nice Cheesecake: its card says 415 kcal, the guide 439 (sources disagree, like Jelly &
Ice Cream), so no photo. Every kept photo was looked at again on contact sheets: the Pepsi one (kept since 2026-10-07) is the Pepsi
logo, not the drink, so it was taken out (DROP_ITEMS); Pepsi Max stays (a glass of the drink, the brand embossed on the glass). The
Chicken Wrap, Chicken Salad Basket and Loaded Cheesy Chips photos show Wimpy's own printed food paper, not lettering laid over the photo.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wimpy as wimpy_guide  # noqa: E402  (SECTIONS: the guide's printed label for every published row)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wimpy"
BASE = "https://wimpy.uk.com"
PAGES = ["/menus/breakfast", "/menus/anytime-meals", "/menus/desserts", "/menus/drinks", "/menus/kids"]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wimpy")
DROP_ITEMS: dict[str, str] = {   # items looked at after the first run and left without a photo (a rerun must not bring them back)
    "kids-pepsi-max": "the photo is the Pepsi Max logo, not the drink",
    "pepsi-max-cherry": "the photo is the Pepsi Max Cherry logo, not the drink",
    "pepsi": "the photo is the Pepsi logo, not the drink (kept by the 2026-10-07 run; found on the contact sheet of 2026-11-17)",
}
SKIP_FILES: dict[str, str] = {}   # upload file name -> why it is not used (nutrition text, placeholder...)

CARD = re.compile(r'<div class="menu-dish [^"]*"[^>]*>(?P<body>.*?)</article>', re.S)
TITLE = re.compile(r'<h4 class="card-title">(?P<t>.*?)</h4>', re.S)
IMAGE = re.compile(r'<div class="menu-card__image">\s*<img src="(?P<src>[^"]+)" alt="(?P<alt>[^"]*)"', re.S)
TEXT = re.compile(r'<p class="card-text">(?P<t>.*?)</p>', re.S)
UPLOAD = re.compile(r"^(?P<base>https://wimpy\.uk\.com/img/uploads/(?P<file>[A-Za-z0-9]+\.(?:png|jpe?g|webp)))(?:\?[^\s]*)?$")
KCAL = re.compile(r"(\d+(?:\.\d+)?)\s*kcal", re.I)
# the guide's own note on what a row's figures cover, at the end of its printed label (match rule 1)
FIGURE_NOTE = re.compile(r"\s*-?\s*\((?:figures?\s+(?:are|exclude)|excludes?)\b[^)]*\)\s*$", re.I)


def guide_names() -> dict[str, str]:
    """item name -> the dish name the guide prints for it, for rows whose printed label ends in a figures note (rule 1)."""
    out = {}
    for _heading, entries in wimpy_guide.SECTIONS:
        for e in entries:
            if e.get("name") and FIGURE_NOTE.search(e["label"]):
                out[e["name"]] = FIGURE_NOTE.sub("", e["label"])
    return out


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
    printed = guide_names()
    by_key: dict[str, list[dict]] = {}
    for it in items:
        keys = {norm_name(it["name"])}
        if it["name"] in printed:
            keys.add(norm_name(printed[it["name"]]))
        for k in keys:
            by_key.setdefault(k, []).append(it)

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
                if item["id"] in DROP_ITEMS:
                    skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                    continue
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
        matched = 0
        for item_id, photos in sorted(found.items()):
            if len(photos) != 1:
                # several upload names: the same photo only if every file holds the same bytes (rule 3)
                digests = {hashlib.sha256(polite_get(u, args.cache, referer=pg)).hexdigest() for u, pg in photos.items()}
                if len(digests) != 1:
                    skipped.append(f"{item_id}: {len(digests)} different photos on the site ({', '.join(sorted(set(photos.values())))}); ambiguous")
                    continue
                photos = dict([next(iter(photos.items()))])   # identical files: credit the first page that shows it
            (photo, page_url), = photos.items()
            if args.dry_run:
                matched += 1
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
        print(f"{matched} of {len(items)} published items matched")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
