#!/usr/bin/env python3
"""Item photos for Simmons Bakers (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_simmons_bakers.py --cache <dir> --dry-run     # list matches, download only the Click & Collect page
    python3 tools/uk_extract/images_simmons_bakers.py --cache <dir>               # download, store, write images.csv

Where the photos are: the nutrition pages (simmonsbakers.com/nutritional-information and /nutritional-information[-rm]/<id>) carry NO photo of
any product (only the ticket graphics and the small drawn "ing_*.png" illustrations of a roll or a jacket potato, which are not photos and
are not used). The only per-product photos on the chain's own site are on its Click & Collect shop page, https://www.simmonsbakers.com/clickandcollect
(delivery.simmonsbakers.com redirects there): a card per online-order product, each an <img data-lazyload="/server/files/<hash>.jpeg" alt="<product name>">.
The "Hertfordshire Sourdough" / "San Francisco Sourdough" loaf pictures on sourdough.simmonsbakers.com are served from cdn.prod.website-files.com,
whose robots.txt answers HTTP 403 AccessDenied: polite_get treats that as "do not fetch" and this script does not work round it.

Matching (exact only): a Click & Collect product name equals the published item's name after norm_name (so "Rainbow Cake" = "Rainbow Cake (*)",
the "(*)" being the bakery's own marker), or equals it once a trailing "(<number>)" is removed: the number is how many slices the bakery cuts the
whole cake into ("Bueno Cake (14)" is one slice of the Bueno Cake; the pack count is part of the nutrition page's title, not of the cake's name).
Nothing else: no reordered words ("Tart, Bakewell" vs "Bakewell Tart"), no added words ("Lemon Drizzle (14)" vs "Lemon Drizzle Cake"), no "Tray -" / "Sharing Tub -"
prefixes (a flapjack bar is not a tray slice), no abbreviations ("Choc Fudge" vs "Chocolate Fudge Cake"). The photo shows the whole cake with a slice cut out;
the item is one slice of that cake.

Politeness / robots: www.simmonsbakers.com publishes no robots.txt (/robots.txt redirects to the home page: no rules apply), one GET for the page and one per photo,
1 request/second, normal browser User-Agent. Terms (https://www.simmonsbakers.com/tandcs, "Content & Intellectual Property Rights"): "You are only allowed to use
content found on this Website as expressly agreed by Simmons (Bakers) Ltd. Any reproduction or redistribution of our content may result in civil and criminal
penalties." (content includes "graphics, photographs, image rights"); founder's decision 2026-10-06: installed anyway, his accepted risk.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "simmons-bakers"
BASE = "https://www.simmonsbakers.com"
PAGE_URL = BASE + "/clickandcollect"
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_IMG = re.compile(r'<img\b[^>]*\sdata-lazyload="([^"]+)"[^>]*\salt="([^"]*)"[^>]*>')
_PACK = re.compile(r"\s*\((?:\*|\d+)\)\s*$")


def read_products(page: str) -> list[tuple[str, str]]:
    """[(product name, photo URL)] from the Click & Collect page, in page order."""
    return [(" ".join(htmllib.unescape(m.group(2)).split()), BASE + htmllib.unescape(m.group(1))) for m in _IMG.finditer(page)]


def item_key(name: str) -> str:
    """The item's name with the bakery's trailing slice-count / '(*)' marker removed, normalised."""
    return ic.norm_name(_PACK.sub("", name))


def match(products: list[tuple[str, str]], items: list[dict]) -> tuple[dict[str, str], list[str]]:
    """{item_id: photo_url} and notes on what was left out and why."""
    notes: list[str] = []
    names = [ic.norm_name(n) for n, _ in products]
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(item_key(it["name"]), []).append(it)
    out: dict[str, str] = {}
    for (name, url), nn in zip(products, names):
        if names.count(nn) > 1:
            notes.append(f"{name}: the page lists this name more than once -> none")
            continue
        hits = by_key.get(nn, [])
        if not hits:
            near = [i["name"] for i in items if nn in ic.norm_name(i["name"])]
            notes.append(f"{name}: no published item with exactly this name" + (f" (not matched: {near})" if near else ""))
            continue
        for it in hits:
            if it["id"] in EXCLUDE:
                notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            else:
                out[it["id"]] = url
    return out, notes


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", type=Path, required=True, help="directory for the cached page and photo bytes")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; download no photos")
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    try:
        page = ic.polite_get(PAGE_URL, args.cache / "page", accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
    except ic.Blocked as e:
        raise SystemExit(f"BLOCKED: {e}: stop and report; do not work round it")
    products = read_products(page)
    matches, notes = match(products, items)
    names = {i["id"]: i["name"] for i in items}
    print(f"{len(products)} products with a photo on {PAGE_URL}; {len(items)} published items; {len(matches)} matched")
    for item_id, url in sorted(matches.items()):
        print(f"  MATCH {item_id}  ({names[item_id]})  <-  {url}")
    for n in notes:
        print("  skip:", n)
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    for item_id, url in sorted(matches.items()):
        try:
            raw = ic.polite_get(url, args.cache / "photos", referer=PAGE_URL)
            fname = ic.store_image(CHAIN_ID, raw)
        except ic.Blocked as e:
            raise SystemExit(f"BLOCKED: {e}: stop and report; do not work round it")
        except (ValueError, OSError) as e:
            print(f"  skip photo for {item_id}: {e}")
            continue
        rows[item_id] = (fname, PAGE_URL)
    path = ic.write_images_csv(CHAIN_ID, rows)
    shared = ic.suspected_placeholders(rows)
    total = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN_ID).glob("*.webp"))
    print(f"wrote {path.relative_to(ic.ROOT)}: {len(rows)} of {len(items)} items have a photo; {len(set(f for f, _ in rows.values()))} files, {total} bytes")
    if shared:
        print("files used by 4+ items (look at them):", shared)


if __name__ == "__main__":
    main()
