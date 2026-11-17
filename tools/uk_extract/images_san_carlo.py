#!/usr/bin/env python3
"""Item photos for San Carlo from its own website, sancarlo.co.uk (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_san_carlo.py --cache DIR [--dry-run]

Where the menu comes from: tools/uk_extract/san_carlo.py reads San Carlo's calorie and allergen pages on menus.tenkites.com (the Ten Kites
"Web Menu" each restaurant page on sancarlo.co.uk embeds). Those menus carry NO dish photos: every dish row is marked
`k10-recipe__text-wrapper_no-image` (checked 2026-11-17 on San Carlo Manchester's A la Carte, 111 of 111 dishes), and Ten Kites' image host
images.tenkites.com would be out of bounds anyway (its robots.txt: `User-agent: *`, `Allow: /tenkitestest/menus.html`, `Disallow: /`).

Source of the photos: San Carlo's own news pages on sancarlo.co.uk, where a dish is shown as a card
`<div class="offer-card"><div class="offer-image"><img src="https://cdn.sancarlo.co.uk/wp-content/uploads/..." alt="<dish>"></div>
<div class="offer-content"><h4><dish></h4>...`. Only these San Carlo pages are read (PAGES below):
  * /news/new-autumn-winter-menus-at-san-carlo/   (Autumn/Winter "Dishes of the Season")
  * /news/new-autumn-winter-cocktails-at-san-carlo/ (the Autumn/Winter seasonal cocktails)
  * /blog/san-carlo-bristol-30th-anniversary/      (the Bristol "1996 menu")
On 2026-11-17 every page in the site's own sitemaps (page, news, events and category sitemaps, 126 pages, plus the 13 San Carlo restaurant
pages) was read once and searched for a card or a picture whose caption names a published San Carlo dish: these three pages are the only
ones. Other pages name dishes only in running text (no photo tied to the dish), show generic table or room shots, or belong to the group's
other brands (Cicchetti, Fumo, Alto, Bottega, Signor Sassi...), which are separate chains and are never read here. The "Dishes of the Season",
1996 and cocktail PDFs are not used: their pages are single full-page pictures, so a dish photo could only be had by cropping (never done).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. it is the picture of an offer-card on one of PAGES whose own heading (<h4>) has the same norm_name as the item's name, and the
     picture's alt text says the same name (a card whose alt and heading disagree is skipped), and that name belongs to exactly one
     published item; or
  2. (SECTION_PHOTOS, one dish) the page's text block names exactly one published dish as a line of its own ("Autumn, Finished Tableside" /
     "Risotto Zucca & Tartufo") and the picture named in SECTION_PHOTOS sits in the image group directly under that block (its alt is
     empty; the file is named after the dish: Risotto-Zucca-Tartufo-AP.png). The group's other picture (21.png, the risotto being
     finished in the pecorino wheel) is not used: one photo per dish.
The picture must be a file on San Carlo's own media host https://cdn.sancarlo.co.uk/wp-content/uploads/.

robots.txt (read 2026-11-17): https://sancarlo.co.uk/robots.txt and https://cdn.sancarlo.co.uk/robots.txt are the same file: `User-agent: *`
with `Disallow: /wp-content/uploads/wpforms/` and, in a second group, an empty `Disallow:`; no group names an AI crawler. The news pages and
the photo files are allowed. polite_get checks robots.txt on every URL (RFC 9309) and keeps to one request a second per host.

Terms (https://sancarlo.co.uk/terms-conditions/, read 2026-11-17): "Use of material San Carlo’s website is protected under copyright laws and
international conventions." and "Apart from any fair dealing for the purposes of private study, or criticism or review, as permitted under the UK
Copyright Designs and Patents Act, 1988, no part of San Carlo’s website pages may be reproduced anywhere, in any medium, or transmitted (including
retransmission) in any form or by any means to, or stored in any other website or in any form of retrieval system other than for the purpose of
review and consideration of the information contained on the pages for the purposes of informing the decision to purchase or otherwise a San
Carlo product or service. For all other purposes whatsoever prior permission, in writing, must be obtained from San Carlo to use the information on
these pages." An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).

Looked at on contact sheets (2026-11-17): all 13 are plain photographs of the dish or drink named, on San Carlo's own plates (the rim prints
"SAN CARLO", the restaurant's own crockery) or glasses; no printed figures, prices, stickers or other brands. Tagliolini San Daniele's photo has
the edge of the 1996 anniversary menu card in the far corner (part of the scene, out of focus, no figure about the dish): kept. DROP_ITEMS is
empty; anything put there is never attached by a rerun.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "san-carlo"
SITE = "https://sancarlo.co.uk"
MEDIA_PREFIX = "https://cdn.sancarlo.co.uk/wp-content/uploads/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-san-carlo")
PAGES = [
    f"{SITE}/news/new-autumn-winter-menus-at-san-carlo/",
    f"{SITE}/news/new-autumn-winter-cocktails-at-san-carlo/",
    f"{SITE}/blog/san-carlo-bristol-30th-anniversary/",
]
# item id -> (page, file name of the picture in the image group under the text block that names the dish): match rule 2
SECTION_PHOTOS = {
    "risotto-zucca-and-tartufo": (f"{SITE}/news/new-autumn-winter-menus-at-san-carlo/", "Risotto-Zucca-Tartufo-AP.png"),
}
# looked at on contact sheets and left without a photo; a rerun must not bring them back (none so far)
DROP_ITEMS: dict[str, str] = {}

CARD = re.compile(r'<div class="offer-card">\s*<div class="offer-image">\s*<img([^>]*)>\s*</div>\s*<div class="offer-content">\s*<h4>(.*?)</h4>', re.S)


def text(fragment: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def attr(attrs: str, name: str) -> str:
    m = re.search(rf'\s{name}="([^"]*)"', " " + attrs)
    return htmllib.unescape(m.group(1)) if m else ""


def parse_cards(page: str) -> list[dict]:
    return [{"src": attr(a, "src"), "alt": attr(a, "alt"), "title": text(h4)} for a, h4 in CARD.findall(page)]


def section_photo(page: str, file_name: str, dish: str, names: dict[str, list[str]]) -> str | None:
    """Match rule 2: the URL of `file_name` when the text block directly above its image group names `dish`, and no other published
    dish, as a line of its own; otherwise None."""
    m = re.search(r'<img src="(' + re.escape(MEDIA_PREFIX) + r'[^"]*/' + re.escape(file_name) + r')"', page)
    if not m:
        return None
    start = page.rfind('<div class="wysiwyg_block"', 0, m.start())
    if start < 0:
        return None
    between = page[start:m.start()]
    if between.count('<div class="wysiwyg_block"') != 1 or '<div class="combo-fantastico"' not in between or "offer-card" in between:
        return None
    block = between.split('<div class="combo-fantastico"', 1)[0]
    lines = [text(x) for x in re.findall(r"<(?:p|h[1-6])[^>]*>(.*?)</(?:p|h[1-6])>", block, re.S)]
    dishes = [ln for ln in lines if norm_name(ln) in names]
    if [norm_name(d) for d in dishes] != [norm_name(dish)]:
        return None
    return htmllib.unescape(m.group(1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it["id"])
    by_id = {it["id"]: it for it in items}
    skipped: list[str] = []
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    rows: dict[str, tuple[str, str]] = {}
    try:
        pages = {url: polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace") for url in PAGES}
        for url, page in pages.items():
            cards = parse_cards(page)
            if not cards:
                raise SystemExit(f"{url}: no offer cards found: the page has changed shape, look at it again")
            for card in cards:
                key = norm_name(card["title"])
                ids = by_name.get(key)
                if not ids:
                    continue
                if len(ids) > 1:
                    skipped.append(f"{card['title']!r} on {url}: the name belongs to {len(ids)} published items ({', '.join(ids)}): not attached")
                    continue
                item_id = ids[0]
                if norm_name(card["alt"]) != key:
                    skipped.append(f"{item_id}: card {card['title']!r} has the picture alt {card['alt']!r}: not the same name")
                    continue
                if not card["src"].startswith(MEDIA_PREFIX):
                    skipped.append(f"{item_id}: picture {card['src']!r} is not on San Carlo's own media host")
                    continue
                if item_id in matched and matched[item_id][0] != card["src"]:
                    skipped.append(f"{item_id}: two different pictures name it ({matched[item_id][0]} and {card['src']}): not attached")
                    matched.pop(item_id)
                    continue
                matched.setdefault(item_id, (card["src"], url))
        for item_id, (url, file_name) in SECTION_PHOTOS.items():
            it = by_id.get(item_id)
            if not it:
                skipped.append(f"{item_id}: no longer a published item")
                continue
            if len(by_name[norm_name(it["name"])]) > 1:
                skipped.append(f"{item_id}: its name belongs to more than one published item")
                continue
            src = section_photo(pages[url], file_name, it["name"], by_name)
            if not src:
                skipped.append(f"{item_id}: {file_name} is no longer under a text block naming only {it['name']!r} on {url}")
                continue
            if item_id in matched and matched[item_id][0] != src:
                skipped.append(f"{item_id}: a card also names it with another picture: not attached")
                matched.pop(item_id)
                continue
            matched[item_id] = (src, url)
        for item_id in list(matched):
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
                matched.pop(item_id)

        for item_id, (src, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {src.rsplit('/', 1)[-1]:40} <- {page_url}")
                continue
            raw = polite_get(src, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {src}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {src.rsplit('/', 1)[-1]}")
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
