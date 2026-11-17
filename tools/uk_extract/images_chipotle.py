#!/usr/bin/env python3
"""Item photos for Chipotle UK from its own ingredients page (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_chipotle.py --cache DIR --dry-run   # read the page, list matches, download no photo
    python3 tools/uk_extract/images_chipotle.py --cache DIR             # download, store, write images.csv

What our items are: Chipotle UK publishes figures for single ingredients only (tools/uk_extract/chipotle.py, the "UK Restaurants
Nutrition Guide" PDF of 3 November 2026), so every item is an ingredient: a protein, a rice, a bean, a salsa, a topping, a drink.

Source: https://www.chipotle.co.uk/ingredients ("INGREDIENT STATEMENT", listed in the site's own sitemap.xml). The page is server-rendered;
each ingredient is one card: `<div class="aem-card__background ..."> <img data-src="/content/dam/chipotle/pages/ingredients/uk/2019/<file>">
... <h5>NAME</h5> <p>the ingredient list</p>`. The photo is a file on www.chipotle.co.uk itself, in the chain's own UK ingredients folder
(/content/dam/chipotle/pages/ingredients/uk/). store_image reads it, resizes to <= 640 px and writes WebP, nothing else.
Other pages looked at and not used (2026-11-17): /nutrition-calculator (answers with a PDF, no photos), /order2 (links the ordering site
chipotle.alohaorderonline.co.uk, whose menu opens only after a restaurant is picked in a session: not used), the home page and /honey-chicken
(campaign pictures of whole burritos and bowls with lettering, not a photo of one ingredient).

Match rule (exact, nothing fuzzy). A card's photo is attached to a published item only when the card's name has the same norm_name as
  (a) the item's name, or
  (b) the guide's own label for that item, as chipotle.py recorded it in the item's notes ("p1 '<label>'"): the chain's own name for the
      very product the item was extracted from (this is how "Sofritas (braised tofu)" meets the card SOFRITAS: the guide prints 'Sofritas').
and only one card has that name, and the photo is under /content/dam/chipotle/pages/ingredients/uk/.
Cards whose name is not exactly an item's (so no photo): FLOUR TORTILLA (BURRITO & TACO) (one card for two products), CRISPY CORN TORTILLA
(the guide: 'Crispy corn taco shells (3)'), CHIPS (one card for three sizes), WHITE RICE / BROWN RICE (the guide: 'Coriander-lime white
rice' / '... brown rice'), TOMATO SALSA, CORN SALSA, MEDIUM SALSA, Hot Salsa (the guide's salsa names differ), GUACAMOLE (one card for two
sizes), LETTUCE (two sizes), CHIPOTLE VINAIGRETTE (the guide: 'Chipotle-honey vinaigrette'), ADOBO PASTE (not an item). The limited-time
chickens and the drinks have no card.

robots.txt (https://www.chipotle.co.uk/robots.txt, "Last updated: August 6, 2026", read 2026-11-17): one group, `User-agent: *`,
`Disallow: /error-page`; the ingredients page and /content/dam/ files are allowed; no group names an AI crawler. polite_get checks
robots.txt on every URL (RFC 9309).

Terms (https://www.chipotle.co.uk/terms-of-use, "TERMS OF USE LAST UPDATED: March 15, 2024", read 2026-11-17), clause 12: "The text,
graphics, and html code contained on a Channel are the exclusive property of Chipotle ("Chipotle Content"). Chipotle Content is protected
from reproduction and simulation under national and international laws and, except where otherwise noted, is not to be copied, distributed,
displayed, reproduced, or transmitted in any form, by any means, without the prior express written content of Chipotle." and clause 22
("NO TEXT OR DATA MINING, OR WEB SCRAPING"): "You shall not conduct, facilitate, authorise or permit any text or data mining or web
scraping in relation to a Channel ... This includes using ... any "robot", "bot", "spider", "scraper" or other automated device, program,
tool, algorithm, code, process or methodology to access, obtain, copy, monitor or republish any portion of a Channel". An express
restriction; installed on the founder's decision of 2026-10-06 (his accepted risk, CLAUDE.md rule 2).

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

CHAIN_ID = "chipotle"
HOST = "https://www.chipotle.co.uk"
PAGE_URL = HOST + "/ingredients"
PHOTO_PATH = "/content/dam/chipotle/pages/ingredients/uk/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-chipotle")
CARD = re.compile(r'<div class="aem-card__background[^"]*">(?P<bg>.*?)</div>\s*<div class="aem-card__copy[^"]*">(?P<copy>.*?)<h5>(?P<t>.*?)</h5>',
                  re.S)
IMG = re.compile(r'<img data-src="(?P<src>[^"]+)"')
NOTE_LABEL = re.compile(r"\bp1 '(?P<label>[^']+)'")
# Looked at on the contact sheet (2026-11-17) and left without a photo; a rerun must not bring them back: {item id: why}
EXCLUDE: dict[str, str] = {}


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def parse_cards(page: str) -> list[dict]:
    out = []
    for m in CARD.finditer(page):
        img = IMG.search(m.group("bg"))
        out.append({"title": clean(m.group("t")), "src": html.unescape(img.group("src")) if img else ""})
    if not out:
        raise SystemExit("no ingredient cards found on the page: it has changed shape, look before changing the parser")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the page and list matches; download no photo, write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    cards = parse_cards(page)
    by_name: dict[str, list[dict]] = {}
    for c in cards:
        by_name.setdefault(norm_name(c["title"]), []).append(c)
    print(f"{len(cards)} ingredient cards on {PAGE_URL}; {len(items)} published items")

    matched: dict[str, dict] = {}
    used: set[str] = set()
    skipped: list[str] = []
    for it in items:
        if it["id"] in EXCLUDE:
            skipped.append(f"{it['id']}: left out after looking: {EXCLUDE[it['id']]}")
            continue
        keys = [norm_name(it["name"])]
        m = NOTE_LABEL.search(it.get("notes", ""))
        if m:
            keys.append(norm_name(m.group("label")))
        hits = [c for k in dict.fromkeys(keys) for c in by_name.get(k, [])]
        if not hits:
            skipped.append(f"{it['id']}: no card is named {it['name']!r}" + (f" or {m.group('label')!r}" if m else ""))
            continue
        if len(hits) != 1:
            skipped.append(f"{it['id']}: {len(hits)} cards carry that name -> none")
            continue
        card = hits[0]
        if not card["src"].startswith(PHOTO_PATH):
            skipped.append(f"{it['id']}: the card's picture {card['src']!r} is not in the chain's UK ingredients folder")
            continue
        matched[it["id"]] = card
        used.add(card["title"])
    for c in cards:
        if c["title"] not in used:
            print(f"  card not used: {c['title']!r} ({c['src'].rsplit('/', 1)[-1]})")

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, card in sorted(matched.items()):
            url = HOST + card["src"]
            if args.dry_run:
                print(f"  MATCH {item_id:34} <- {card['title']!r} {url.rsplit('/', 1)[-1]}")
                continue
            raw = polite_get(url, args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
            print(f"  {item_id:34} {fname}  <- {card['title']!r} {url.rsplit('/', 1)[-1]}")
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
