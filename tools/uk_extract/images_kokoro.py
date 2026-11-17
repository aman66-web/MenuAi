#!/usr/bin/env python3
"""Item photos for Kokoro from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_kokoro.py --cache DIR [--dry-run]

Source: https://www.kokorouk.com/menu, the same page tools/uk_extract/kokoro.py reads the items from (nothing else is requested besides the
photo files). Every dish is one card on that page: `<div role="listitem" class="collection-item-3 ..."> <div category=...
class="div-block-87"> <img class="item-img" src=PHOTO> ... <div class="body-4">NAME</div> ... <div class="item-allergen">ENERGY</div>`.
The photos are files on Kokoro's own Webflow asset store, https://cdn.prod.website-files.com/67aa1c32f9dc03dc1e886408/ (the site's
"data-wf-site" collection assets; the same host serves Kokoro's allergen chart and logo).

Match rule (same record, exact, nothing fuzzy). Each card is read with kokoro.py's own functions (parse_energy, tidy) and turned into the
item ids kokoro.build() made from THAT card (common.slug of the same names): a one-figure card gives one item ("Veggie Kimbap"), a
"Regular N Kcal / Large M Kcal" card gives "<name> (regular)" and "<name> (large)" (one card, one photo, both sizes: the card's own
record holds both figures). A photo is attached only when
  1. the item id comes from that card and the item is published (not in holdback.csv),
  2. the item's calories equal the figure that card prints for that row (so a menu change can't move a photo onto stale data), and
  3. the card's name is unique on the page and its photo is a file on cdn.prod.website-files.com.
Not given the card's photo, by rule (LEFT_OUT_KINDS):
  - the bowl toppings ("Korean Galbi Jjim topping (regular)" ...): the card prints the topping's calories and a list of bases, and our
    item is the topping only; the card's photo shows the whole bowl (topping on a base), so the item would be one part of the dish
    pictured (playbook: never the whole meal when the item is one part of it).
  - "Curry Sauce (large)": its figure is printed inside the katsu curry bowls, not on the Curry Sauce card, so no card names it.
Left out after looking (EXCLUDE, below), with the reason on each line.

robots.txt (read 2026-11-17): https://www.kokorouk.com/robots.txt answers 200 with an empty file (no rules).
https://cdn.prod.website-files.com/robots.txt answers 403 "AccessDenied" (an object store with no such file): RFC 9309 reads a 4xx for
robots.txt as "no rules", the founder's decision of 2026-10-12 ("Yes, follow the standard"); images_common treats it so. Every photo file
itself answered 200. polite_get keeps 1 request a second per host and stops on any 401/403/429.

Terms: https://www.kokorouk.com/terms, read 2026-10-08, listed as prohibited use "using any automated means to monitor or copy the
website or its content" and said "A wide range of intellectual property rights are used in and relating to this website, including: ...
the design, text, graphics and other content of the web pages on this website". Re-read 2026-11-17: the /terms page now shows only the
site's navigation (no terms text; the page source holds nothing else), and the site links no other terms (only a privacy policy PDF).
An express restriction as last published; installed on the founder's decision of 2026-10-06 (his accepted risk). Kokoro's menu page says
nothing about its photos being illustrative.

History: written 2026-10-08 and not run then (the CDN's 403 on robots.txt was read as a refusal); run 2026-11-17 after that decision:
66 cards, all with a photo (285 x 285 px each); 42 published items come from a card with a photo, 9 left out after looking (EXCLUDE),
33 installed (31 files: Egg Fried Rice and Kimchi Fried Rice share one per card), every one looked at on a contact sheet.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import kokoro  # noqa: E402  (parse_energy, tidy, text_of: the same reader the items came from)
from common import slug  # noqa: E402  (the ids kokoro.build() gives its rows)
from images_common import (Blocked, ROOT, load_items, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN_ID = "kokoro"
PAGE_URL = kokoro.PAGE_URL
PHOTO_HOST = "https://cdn.prod.website-files.com/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
CARD_SPLIT = '<div role="listitem" class="collection-item-3 w-dyn-item w-col w-col-3">'   # as kokoro.read_page
_IMG = re.compile(r'<img[^>]*\bsrc="([^"]+)"[^>]*class="item-img"')
_NAME = re.compile(r'<div class="body-4">(.*?)</div>', re.S)
_ENERGY = re.compile(r'class="item-allergen(?: w-richtext)?">(.*?)</div>', re.S)

# Left out after looking at every photo on a contact sheet (2026-11-17). item id -> why. A rerun can't bring them back.
EXCLUDE = {
    # The card's photo FILE is named "TUNA, TOBIKO & MAYO ONIGIRI (2)": the picture may be the tuna onigiri's (a filling can't be told
    # apart by eye inside a wrapped rice ball), so it is not certain it shows this item.
    "crabstick-tobiko-and-mayo-onigiri": "photo file named after a different dish (Tuna, Tobiko & Mayo Onigiri)",
    # An orange "NEW" sticker printed on the picture (promotional lettering).
    "veggie-kimbap": "'NEW' sticker on the picture",
    "tuna-mayo-kimbap": "'NEW' sticker on the picture",
    "kimchi-kimbap": "'NEW' sticker on the picture",
    "bulgogi-kimbap": "'NEW' sticker on the picture",
    # A third-party maker's sealed pack with its own brand and printed text, not the food itself.
    "cheese-cake": "Samlip 'Cafe Snow Soft Cheese' pack (a third-party brand's wrapper), the cake barely visible",
    "chocolate-dorayaki": "a maker's sealed pack with its label, company details and printed weight",
    "custard-dorayaki": "a maker's sealed pack with its label, company details and printed weight",
    "mochi": "a 'Shiro Daifuku' maker's pack with its brand lettering, the mochi not visible",
}


def page_cards(page: str) -> list[dict]:
    """One dict per dish card, in page order: page name, photo URL (or None) and the item rows kokoro.build() makes from it."""
    body = re.sub(r"<script.*?</script>", "", page, flags=re.S)
    cards = []
    for chunk in body.split(CARD_SPLIT)[1:]:
        name_m, img_m, energy_m = _NAME.search(chunk), _IMG.search(chunk), _ENERGY.search(chunk)
        if not (name_m and energy_m):
            raise SystemExit("a dish card has no name or energy field: the page layout changed, re-check kokoro.py first")
        page_name = kokoro.text_of(name_m.group(1))
        url = html.unescape(img_m.group(1)) if img_m else ""
        e = kokoro.parse_energy({"energy": kokoro.paragraphs(energy_m.group(1)), "page_name": page_name})
        name = kokoro.tidy(page_name)
        rows, left_out = [], []          # rows: (item id, calories this card prints for it)
        if e["kind"] == "single":
            rows.append((slug(name), e["kcal"]))
        elif e["kind"] == "regular_large":
            rows += [(slug(f"{name} (regular)"), e["regular"]), (slug(f"{name} (large)"), e["large"])]
        elif e["kind"] == "parts":
            top = e["parts"][0]
            left_out += [slug(f"{name} topping (regular)"), slug(f"{name} topping (large)")]
            assert top[0] == "Topping"
        cards.append({"page_name": page_name, "photo": url if url.startswith(PHOTO_HOST) else None, "rows": rows,
                      "kind": e["kind"], "left_out": left_out})
    return cards


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true", help="list the matches and stop: no photo is downloaded or stored")
    args = ap.parse_args()

    items = {it["id"]: it for it in load_items(CHAIN_ID)}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing is written.")
        return 2
    cards = page_cards(page)
    names = [c["page_name"] for c in cards]
    dupes = {n for n in names if names.count(n) > 1}
    print(f"{len(cards)} dish cards on {PAGE_URL}, {sum(1 for c in cards if c['photo'])} with a photo")

    matches: dict[str, tuple[str, str]] = {}      # item id -> (photo url, card name)
    claimed: set[str] = set()
    for c in cards:
        for item_id in c["left_out"]:
            if item_id in items:
                print(f"  LEFT OUT {item_id}: bowl topping, the card's photo shows the whole bowl on a base")
        if c["page_name"] in dupes or not c["photo"]:
            if c["rows"]:
                print(f"  SKIPPED card {c['page_name']}: {'name not unique' if c['page_name'] in dupes else 'no photo on our asset host'}")
            continue
        for item_id, kcal in c["rows"]:
            if item_id in claimed:
                raise SystemExit(f"{item_id} comes from two cards: the page changed, re-check kokoro.py")
            claimed.add(item_id)
            it = items.get(item_id)
            if it is None:
                continue                       # held back, or not published
            if item_id in EXCLUDE:
                print(f"  EXCLUDED {item_id}: {EXCLUDE[item_id]}")
                continue
            if str(it["calories"]).strip() != kcal:
                print(f"  SKIPPED {item_id}: the card now prints {kcal} kcal, the item has {it['calories']} (rerun kokoro.py first)")
                continue
            matches[item_id] = (c["photo"], c["page_name"])
    print(f"{len(matches)} of {len(items)} published items match their own card's photo")
    for item_id, (url, card) in sorted(matches.items()):
        print(f"  {item_id}  <-  [{card}] {url}")
    no_photo = sorted(set(items) - set(matches))
    print(f"{len(no_photo)} published items without a photo: {', '.join(no_photo)}")
    if args.dry_run:
        print("dry run: nothing downloaded")
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (url, _card) in sorted(matches.items()):
            try:
                raw = polite_get(url, args.cache, referer=PAGE_URL)
                rows[item_id] = (store_image(CHAIN_ID, raw), PAGE_URL)
            except ValueError as e:
                print(f"  not stored {item_id}: {e}")
    except Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing is written and no photo is installed.")
        return 2
    write_images_csv(CHAIN_ID, rows)
    total = sum(p.stat().st_size for p in (ROOT / "web" / "public" / "menu-images" / CHAIN_ID).glob("*.webp"))
    print(f"stored {len(rows)} of {len(items)} items; {len({f for f, _ in rows.values()})} files, {total / 1024:.0f} KB")
    for f, ids in suspected_placeholders(rows, threshold=3).items():
        print(f"  SHARED by {len(ids)} items: {f} {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
