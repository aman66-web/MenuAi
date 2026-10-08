#!/usr/bin/env python3
"""Item photos for Esquires Coffee (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_esquires.py --cache <dir> --dry-run   # fetch the two menu pages only, list matches
    python3 tools/uk_extract/images_esquires.py --cache <dir>             # download, store, write images.csv

Source: the chain's own menu pages https://esquirescoffee.co.uk/food-drink/ ("Our Menu": fresh food and drinks) and
https://esquirescoffee.co.uk/current-offers/ (Seasonal Specials), the two pages data/source/esquires was built from. Each dish is a
<div class="... offer"> holding an <offer-image> with one <img> (or two: a desktop and a mobile rendition of the same dish, same file name apart
from the folder; the first is used) and an <h3> title. Photos are the chain's own uploads (wp-content/uploads/...jpg); store_image only downsizes to
640 px and converts to WebP, nothing else is changed.

Matching (exact only): the h3 title, minus the chain's own trailing diet marker "(V)" / "(VE)" (a legend marker, not part of the name, and not part
of our item names), must be a published item's name (norm_name). Page dishes we do not publish (Espresso, Americano, Latte, Cappuccino, Mocha, Hot
Chocolate, Iced Latte, Iced Americano, Vanilla Matcha Latte, Chai Latte: their calorie figures are not printed as one clear number) get no entry
because there is no published item to attach to.

Politeness / robots: https://esquirescoffee.co.uk/robots.txt (read 2026-10-08) is a Yoast block "User-agent: *  Disallow:" (nothing disallowed). Photos
are on the same host (wp-content/uploads), so the same rule applies.
Terms (read 2026-10-08, https://esquirescoffee.co.uk/terms-and-conditions/): 3.2 "You are allowed to access, download and print the materials on this
site for your own personal, non commercial use only and internal business purposes only." 3.3 "You must not: 3.3.1 copy (including storing and
downloading), distribute, publish, alter, adapt, create derivative works from, or otherwise use the material on this website, either in whole or in
part except as expressly permitted by these terms" and 7.1 "We are the owner or licensee of all intellectual property rights in the website and in the
materials which appear on this website. This includes but is not limited to the text, photographs, images ... all our rights are reserved." This is an
express restriction. Installed anyway on the founder's decision of 2026-10-06 (accepted risk, CLAUDE.md rule 2); take the folder and images.csv
down the day Esquires asks.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "esquires"
HOST = "https://esquirescoffee.co.uk"
PAGES = ["food-drink", "current-offers"]
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_CARD = re.compile(r'<div class="col-md-\d+ offer[^"]*">(.*?)</h3>', re.S)
_MARKER = re.compile(r"\s*\((?:v|ve|vg)\)\s*$", re.I)


def read_entries(page: str) -> list[dict]:
    """[{raw title, title (marker removed), photo URL}] for each dish card on a menu page."""
    out = []
    for m in _CARD.finditer(page):
        blk = m.group(1)
        imgs = re.findall(r'<img[^>]*\bsrc="([^"]+)"', blk)
        t = re.search(r"<h3[^>]*>(.*)$", blk, re.S)
        if not imgs or not t:
            continue
        raw = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", t.group(1))).split())
        out.append({"raw": raw, "title": _MARKER.sub("", raw), "photo": htmllib.unescape(imgs[0])})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="cache dir (each page and photo is fetched at most once)")
    ap.add_argument("--dry-run", action="store_true", help="list the matches; fetch only the menu pages (never a photo)")
    ap.add_argument("--retrieved-on", default=None)
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    wanted: dict[str, tuple[str, str]] = {}          # item_id -> (photo url, page url)
    notes: list[str] = []
    n_entries = 0
    for p in PAGES:
        page_url = f"{HOST}/{p}/"
        text = ic.polite_get(page_url, args.cache, accept="text/html,application/xhtml+xml;q=0.9,*/*;q=0.8").decode("utf-8", "replace")
        entries = read_entries(text)
        if not entries:
            raise SystemExit(f"{page_url}: no dishes found: the layout changed")
        n_entries += len(entries)
        for e in entries:
            hits = by_name.get(ic.norm_name(e["title"]), [])
            if len(hits) != 1:
                notes.append(f"{e['raw']} ({p}): {'no published item with exactly this name' if not hits else 'several published items share this name'} -> none")
                continue
            it = hits[0]
            if it["id"] in EXCLUDE:
                notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
                continue
            if it["id"] in wanted:
                notes.append(f"{it['name']}: listed twice -> kept the first")
                continue
            wanted[it["id"]] = (e["photo"], page_url)

    by_id = {i["id"]: i for i in items}
    order = [i["id"] for i in items]
    print(f"{len(items)} published items; {n_entries} dishes on {len(PAGES)} menu pages; {len(wanted)} items matched to a photo")
    for item_id in sorted(wanted, key=order.index):
        print(f"  {by_id[item_id]['category']:<18} {by_id[item_id]['name']:<44} {wanted[item_id][0].rsplit('/', 1)[-1]}")
    print("Page entries without a published item:")
    for n in notes:
        print("  -", n)
    print(f"  ({len(items) - len(wanted)} published items without a photo in total)")
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, (url, page_url) in wanted.items():
            if url not in stored:
                raw = ic.polite_get(url, args.cache, referer=page_url)
                try:
                    stored[url] = ic.store_image(CHAIN_ID, raw)
                except ValueError as e:
                    print(f"  skipped {by_id[item_id]['name']}: {e}")
                    stored[url] = ""
            if stored[url]:
                rows[item_id] = (stored[url], page_url)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing was written to images.csv. We never work round a block.")
        raise SystemExit(2)
    ic.write_images_csv(CHAIN_ID, rows, args.retrieved_on)
    print(f"{len(rows)} of {len(items)} published items now have a photo; {len(set(f for f, _ in rows.values()))} files")
    for fname, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")


if __name__ == "__main__":
    main()
