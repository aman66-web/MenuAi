#!/usr/bin/env python3
"""Item photos for Afrikana Kitchen (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_afrikana.py --cache <dir> --dry-run     # list matches, download nothing but the menu page
    python3 tools/uk_extract/images_afrikana.py --cache <dir>               # download, store, write images.csv

Source: the chain's own menu page https://www.afrikanakitchen.com/menu (a Framer site; the menu, including each dish card's <img>, is
server-rendered into the HTML). In the page's markup a dish card is: its "Dish Name" block, then (usually) one <img> before the next
dish card or section heading; the repeated "Fried Chicken Club" copies agree on which photo belongs to which dish (checked: the same
dish has the same photo file in all three copies, though the dishes are in a different order in each copy).

Matching (exact only): a card's photo goes to the published item whose category is the card's section and whose name is the card's
dish name, or "<dish name> (<section>)" for the two names printed in two sections ("Five Wings", "Ten Wings"). Not matched, on purpose:
- cards with no <img> (Prawn To Be Wild, Steak It On Me, All At Steak, Afrikana Salad, Halloumi Fries);
- "Loaded Fries" and "Loaded Mac 'N Cheese": one card with two toppings, one photo; the published items are one per topping, and the
  page does not say which topping the photo shows, so neither item gets it;
- a card whose copies disagree on the photo, or with more than one distinct photo.

Photo URL: the page's own srcset entry nearest 1024 px wide (a rendition the page serves to browsers), else its src. store_image then
downsizes to 640 px and converts to WebP; nothing else is changed.

Politeness / robots: afrikanakitchen.com/robots.txt is "User-agent: *  Allow: /" (2026-10-08). The photos are on framerusercontent.com,
whose /robots.txt answers HTTP 403 (a CloudFront "MissingKey" XML error page: the CDN simply has no robots.txt at its root). polite_get
treats a 403 on robots.txt as "do not fetch", so a real (non-dry) run stops with Blocked at the first photo. This script does NOT work
round that: it is up to the founder/main session whether a 403 on a CDN's robots.txt counts like the S3 case images_common already
exempts. Terms (https://www.afrikanakitchen.com/terms, City Restaurants Operations Limited): "You must not otherwise reproduce, modify,
copy, distribute or use for commercial purposes any Content without the written permission of City Restaurants Operations Limited"
(Content includes images); founder's decision 2026-10-06: installed anyway, his accepted risk.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
from afrikana import SECTIONS  # noqa: E402

CHAIN_ID = "afrikana"
MENU_URL = "https://www.afrikanakitchen.com/menu"
TARGET_WIDTH = 1024
# Item ids never given a photo (checked by eye after a download: see the report), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_MARK = re.compile(r'data-framer-name="(Heading|Dish Name)"|<img\b[^>]*>')


def _first_text(fragment: str) -> str:
    m = re.search(r"<(?:p|h[1-6])\b[^>]*>(.*?)</(?:p|h[1-6])>", fragment, flags=re.S)
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", m.group(1))).split()) if m else ""


def _photo_url(tag: str) -> str | None:
    """The page's own URL for this <img>: the srcset entry closest to TARGET_WIDTH (never above the largest offered), else src."""
    best = None
    ms = re.search(r'srcset="([^"]+)"', tag)
    if ms:
        for part in ms.group(1).split(","):
            bits = part.strip().split()
            if len(bits) == 2 and bits[1].endswith("w") and bits[1][:-1].isdigit():
                w = int(bits[1][:-1])
                if best is None or abs(w - TARGET_WIDTH) < abs(best[0] - TARGET_WIDTH):
                    best = (w, bits[0])
    if best:
        return htmllib.unescape(best[1])
    mr = re.search(r'\ssrc="([^"]+)"', tag)
    return htmllib.unescape(mr.group(1)) if mr else None


def read_cards(page: str) -> list[dict]:
    """Dish cards in page order: section, name, photos (distinct photo URLs found in the card, in order)."""
    cards, section = [], None
    for m in _MARK.finditer(page):
        if m.group(1) == "Heading":
            section = _first_text(page[m.end():m.end() + 2000]) or section
        elif m.group(1) == "Dish Name":
            name = _first_text(page[m.end():m.end() + 2000])
            if section is None or not name:
                raise SystemExit("Dish card without a section or a name: the page layout changed")
            cards.append({"section": section, "name": name, "photos": []})
        elif cards:                                   # an <img>
            url = _photo_url(m.group(0))
            if url and url not in cards[-1]["photos"]:
                cards[-1]["photos"].append(url)
    return cards


def match(cards: list[dict], items: list[dict]) -> tuple[dict, list[str]]:
    """{item_id: photo_url}, and a list of human-readable notes on what was left out and why."""
    notes: list[str] = []
    # one verdict per (section, dish): all copies must agree
    verdict: dict[tuple, set] = {}
    for c in cards:
        verdict.setdefault((c["section"], c["name"]), []).append(tuple(c["photos"]))
    photo_of: dict[tuple, str] = {}
    for key, copies in verdict.items():
        distinct = set(copies)
        if len(distinct) != 1:
            notes.append(f"{key[1]} ({key[0]}): copies of the card disagree on the photo -> none")
        elif len(copies[0]) == 0:
            notes.append(f"{key[1]} ({key[0]}): the card has no photo")
        elif len(copies[0]) > 1:
            notes.append(f"{key[1]} ({key[0]}): more than one photo in the card -> none")
        else:
            photo_of[key] = copies[0][0]
    by_key: dict[tuple, dict] = {}
    for it in items:
        by_key[(it["category"], ic.norm_name(it["name"]))] = it
    out: dict[str, str] = {}
    for (section, dish), url in photo_of.items():
        it = by_key.get((section, ic.norm_name(dish))) or by_key.get((section, ic.norm_name(f"{dish} ({section})")))
        if it is None:
            variants = [i["name"] for i in items if i["category"] == section and ic.norm_name(i["name"]).startswith(ic.norm_name(dish) + " ")]
            notes.append(f"{dish} ({section}): has a photo but no item with exactly this name"
                         + (f"; one card, several published variants {variants}: the page doesn't say which one the photo shows -> none" if variants else ""))
            continue
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        out[it["id"]] = url
    return out, notes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="cache dir (the menu page and each photo are fetched at most once)")
    ap.add_argument("--dry-run", action="store_true", help="list the matches; fetch only the menu page (never a photo)")
    ap.add_argument("--retrieved-on", default=None)
    args = ap.parse_args()

    page = ic.polite_get(MENU_URL, args.cache, accept="text/html,application/xhtml+xml;q=0.9,*/*;q=0.8").decode("utf-8", "replace")
    cards = read_cards(page)
    items = ic.load_items(CHAIN_ID)
    sections_seen = list(dict.fromkeys(c["section"] for c in cards))
    if sections_seen != SECTIONS:
        raise SystemExit(f"Sections changed: {sections_seen}")
    wanted, notes = match(cards, items)
    by_id = {i["id"]: i for i in items}
    print(f"{len(cards)} dish cards on the page; {len(items)} published items; {len(wanted)} items matched to a photo "
          f"({len(set(wanted.values()))} distinct photo URLs)")
    for item_id in sorted(wanted, key=lambda k: [i["id"] for i in items].index(k)):
        print(f"  {by_id[item_id]['category']:<22} {by_id[item_id]['name']:<45} {wanted[item_id].split('/images/')[-1][:40]}")
    print("Left without a photo:")
    for n in notes:
        print("  -", n)
    no_card = [i["name"] for i in items if i["id"] not in wanted]
    print(f"  ({len(no_card)} published items without a photo in total)")
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, url in wanted.items():
            if url not in stored:
                raw = ic.polite_get(url, args.cache, referer=MENU_URL)
                try:
                    stored[url] = ic.store_image(CHAIN_ID, raw)
                except ValueError as e:
                    print(f"  skipped {by_id[item_id]['name']}: {e}")
                    stored[url] = ""
            if stored[url]:
                rows[item_id] = (stored[url], MENU_URL)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing was written to images.csv. We never work round a block.")
        raise SystemExit(2)
    ic.write_images_csv(CHAIN_ID, rows, args.retrieved_on)
    print(f"{len(rows)} of {len(items)} published items now have a photo; {len(set(f for f, _ in rows.values()))} files")
    for fname, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")


if __name__ == "__main__":
    main()
