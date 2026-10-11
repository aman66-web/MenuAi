#!/usr/bin/env python3
"""Item photos for Chopstix from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_chopstix.py --cache DIR [--dry-run]

Source: the chain's own product pages https://chopstixnoodles.co.uk/menu/<slug>/ (the pages linked from https://chopstixnoodles.co.uk/menu/). Each page is ONE product:
`<h1>NAME</h1>`, ONE product photo (the first image of the page's first column, `<img ... src="https://chopstixnoodles.co.uk/wp-content/uploads/...">` with the product's name as its
title), and a "Topping Size" table whose header row lists the sizes the product comes in ("5 | 10 | 15 | Sharer", "3 | 5 | 10"). The photo is a file on the chain's own site, so
store_image only downsizes it to <= 640 px and converts to WebP. `source_url` = the product page.

Match rule (exact, nothing fuzzy). The published items (data/source/chopstix/items.csv, built from the chain's nutrition PDF) that can be tied to a page are the side, snack and
sauce rows "<Name> (<n>)", "<Name> (small|large ...)", "<Name> Sharer" and "<Name>". A photo is attached to such an item only when
  1. the page's <h1> has the same norm_name as the item's name without its trailing "(...)" size part (or without a trailing " Sharer"), and
  2. the item's size label (the "n" of "(n)", "small"/"large", "sharer") is one of the page's own size header cells, so that the same page names the product, carries its photo and lists the
     item's size, and
  3. the page has exactly one product photo, on chopstixnoodles.co.uk.
Not given a photo, on purpose: the noodle/rice bases and the toppings (the chain's picture there is a whole bowl, the item one part of it), the meal deals, drinks, the "Flavour Savour
... + dip" rows (a different product from the page's), names the page words differently ("Fortune Cookie (6 g)" vs "Fortune Cookies"), and any page where two items would share it ambiguously.

Terms: the site links no website terms-of-use page (only "App offer terms" and "Privacy Policy", neither mentions images or content); every page's footer says "(c) Copyright 2026
Chopstix Group, All Rights Reserved | The Legal Stuff: Chopstix, Chopstix Noodle Bar, the Chopstix Noodle Bar Logo and Noodles are trademarks and tradenames of Chopstix Restaurant
Limited. They may not be copied or reproduced without the consent in writing of the owner." (read 2026-10-11): an all-rights-reserved notice; installed on the founder's decision of
2026-10-06 (his accepted risk). robots.txt (https://chopstixnoodles.co.uk/robots.txt, read 2026-10-11): polite_get checks it on every URL (RFC 9309).

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

CHAIN_ID = "chopstix"
SITE = "https://chopstixnoodles.co.uk"
MENU_URL = f"{SITE}/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-chopstix")
ONLY_CATEGORIES = {"Sides and snacks", "Dips and sauces", "Desserts and treats"}
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {}

PRODUCT_LINK = re.compile(r'href="(https://chopstixnoodles\.co\.uk/menu/([a-z0-9-]+)/)"')
H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
TABLE_ROW = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
CELL = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S)
UPLOAD_IMG = re.compile(r'<img[^>]*?\ssrc="(https://chopstixnoodles\.co\.uk/wp-content/uploads/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>', re.S)
ITEM_SIZE = re.compile(r"^(?P<base>.+?)\s*\((?P<size>[^)]*)\)\s*$")


def text(s: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def parse_product(page: str) -> dict | None:
    h1 = H1.search(page)
    row = TABLE_ROW.search(page)
    if not h1 or not row:
        return None
    sizes = [text(c).lower() for c in CELL.findall(row.group(1))][1:]
    # the product photo: the first uploaded image inside the page's first image module (before the h1)
    head = page[: h1.start()]
    imgs = [m for m in UPLOAD_IMG.findall(head) if "logo" not in m.lower() and "favicon" not in m.lower() and "delivery" not in m.lower()]
    return {"name": text(h1.group(1)), "sizes": sizes, "photos": imgs[-1:] if imgs else []}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = [i for i in load_items(CHAIN_ID) if i["category"] in ONLY_CATEGORIES]
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        index = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        slugs = sorted({s for _, s in PRODUCT_LINK.findall(index)})
        pages: dict[str, tuple[str, dict]] = {}
        by_name: dict[str, list[str]] = {}
        for slug in slugs:
            url = f"{SITE}/menu/{slug}/"
            prod = parse_product(polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
            if prod:
                pages[slug] = (url, prod)
                by_name.setdefault(norm_name(prod["name"]), []).append(slug)
        print(f"{len(pages)} product pages read from {len(slugs)} links on {MENU_URL}")

        matched: dict[str, tuple[str, str]] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            name = it["name"]
            m = ITEM_SIZE.match(name)
            if name.endswith(" Sharer"):
                base, size = name[: -len(" Sharer")], "sharer"
            elif m:
                base, size = m.group("base"), m.group("size").strip().lower()
            else:
                base, size = name, ""
            slugs_for = by_name.get(norm_name(base), [])
            if len(slugs_for) != 1:
                skipped.append(f"{it['id']}: {len(slugs_for)} product pages are named {base!r}")
                continue
            url, prod = pages[slugs_for[0]]
            cells = prod["sizes"]
            size_ok = (not size) or any(c == size or c.startswith(size + " ") or size.startswith(c + " ") for c in cells) or size in cells
            if size and not size_ok:
                skipped.append(f"{it['id']}: the page's sizes {cells} do not list {size!r}")
                continue
            if len(prod["photos"]) != 1:
                skipped.append(f"{it['id']}: the page has {len(prod['photos'])} product photos")
                continue
            matched[it["id"]] = (prod["photos"][0], url)

        for item_id, (photo, url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {photo.rsplit('/', 1)[-1]}  <- {url}")
                continue
            raw = polite_get(photo, args.cache, referer=url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, url)
            print(f"  {item_id:50} {fname}  <- {photo.rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} candidate items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(load_items(CHAIN_ID))} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
