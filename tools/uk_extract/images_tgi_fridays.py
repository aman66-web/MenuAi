#!/usr/bin/env python3
"""Item photos for TGI Fridays UK (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_tgi_fridays.py --cache <dir> --dry-run   # list matches, download nothing but the page
    python3 tools/uk_extract/images_tgi_fridays.py --cache <dir>             # download, store, write images.csv

Source: the chain's own "new menu" page https://www.tgifridays.co.uk/new-menu. The chain's menu itself is PDF downloads only
(/menu), and the per-item photos of the online menu (images.tenkites.com/tgifridayuk/menuitem/...) are on a host whose robots.txt
says "Disallow: /", so they are not used. /new-menu shows a small set of dish cards: a photo, then an <h3> with the dish name
(the photo's alt text is the same name). A card's photo goes to the published item whose name is exactly the card's heading
(norm_name equality). Not matched, on purpose: cards whose name is not a published item's exact name ("Big AF Burger" vs
"Loaded Cheese Fry Big AF Burger", "Chicken Quesadillas" vs "Chicken Quesadilla", "Fridays Whiskey Glaze Ribs", "Three For All",
"Blackened Shrimp Mexi Bowl", "Chicken & Steak Fajita Combo"), and "Cajun Shrimp & Chicken Pasta" (the item is held back).

Photo URL: the page serves a Drupal image style ("desktop_landscape", which may crop); the original upload sits at the same file
name without "/styles/<style>/public" and without the ".webp" suffix, so that file is fetched instead and store_image only
downsizes it to 640 px and converts it to WebP.

Politeness / robots: www.tgifridays.co.uk/robots.txt (2026-10-08) disallows only admin/core/user paths; /new-menu and
/sites/default/files/ are allowed. Terms (https://www.tgifridays.co.uk/terms-of-use): "You must not: copy (including storing and
downloading), distribute, publish, alter, adapt, create derivative works from, or otherwise use the material on this site ... without
first obtaining express written consent from us" and "We are the owner or licensee of all intellectual property rights in the site and
in the materials ... This includes ... photographs, images". Founder's decision 2026-10-06: installed anyway, his accepted risk.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "tgi-fridays"
PAGE_URL = "https://www.tgifridays.co.uk/new-menu"
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}


def read_cards(page: str) -> list[dict]:
    """Dish cards in page order: {name, src} for every <img> that is followed (before the next <img>) by an <h3> dish name."""
    cards = []
    imgs = list(re.finditer(r'<img\b[^>]*>', page))
    for i, m in enumerate(imgs):
        end = imgs[i + 1].start() if i + 1 < len(imgs) else len(page)
        h = re.search(r'<h3\b[^>]*>(.*?)</h3>', page[m.end():end], flags=re.S)
        src = re.search(r'\ssrc="([^"]+)"', m.group(0))
        if not h or not src or "/sites/default/files/" not in src.group(1):
            continue
        name = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", h.group(1))).split())
        cards.append({"name": name, "src": htmllib.unescape(src.group(1))})
    return cards


def original_url(src: str) -> str:
    """The un-styled upload behind a Drupal image-style URL (no crop): /sites/default/files/styles/<s>/public/<path>.webp?itok=.. -> /sites/default/files/<path>"""
    path = src.split("?")[0]
    m = re.match(r"(.*?/sites/default/files)/styles/[^/]+/public/(.+?)(\.webp)?$", path)
    base = f"{m.group(1)}/{m.group(2)}" if m else path
    if base.startswith("/"):
        base = "https://www.tgifridays.co.uk" + base
    return base


def match(cards: list[dict], items: list[dict]) -> tuple[dict, list[str]]:
    notes: list[str] = []
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)
    out: dict[str, str] = {}
    for c in cards:
        hits = by_name.get(ic.norm_name(c["name"]), [])
        if len(hits) != 1:
            notes.append(f"{c['name']}: " + ("no published item with exactly this name" if not hits else f"{len(hits)} items share this name -> none"))
            continue
        it = hits[0]
        if it["id"] in EXCLUDE:
            notes.append(f"{c['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        out[it["id"]] = original_url(c["src"])
    return out, notes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    cache = Path(args.cache)
    items = ic.load_items(CHAIN_ID)
    page = ic.polite_get(PAGE_URL, cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
    cards = read_cards(page)
    wanted, notes = match(cards, items)
    print(f"{len(items)} published items; {len(cards)} dish cards on {PAGE_URL}; {len(wanted)} exact matches")
    for iid, url in sorted(wanted.items()):
        print(f"  {iid}  <-  {url}")
    for n in notes:
        print("  not matched:", n)
    if args.dry_run:
        return
    rows: dict[str, tuple[str, str]] = {}
    for iid, url in sorted(wanted.items()):
        try:
            raw = ic.polite_get(url, cache, referer=PAGE_URL)
            rows[iid] = (ic.store_image(CHAIN_ID, raw), PAGE_URL)
        except ic.Blocked as e:
            print("STOP, blocked:", e)
            sys.exit(2)
        except ValueError as e:
            print(f"  skipped {iid}: {e}")
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"stored {len(rows)} photos in web/public/menu-images/{CHAIN_ID}/ and wrote data/source/{CHAIN_ID}/images.csv")
    for f, ids in ic.suspected_placeholders(rows).items():
        print("  shared by 4+ items, look at it:", f, ids)


if __name__ == "__main__":
    main()
