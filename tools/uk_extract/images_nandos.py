#!/usr/bin/env python3
"""Attach Nando's own item photos to the published items of data/source/nandos/ (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_nandos.py --cache /path/to/cache            # fetch (page + feed + one request per photo) and write
    python3 tools/uk_extract/images_nandos.py --cache /path/to/cache --dry-run  # print the matches only

Where the photos come from: the same data feed that tools/uk_extract/nandos.py reads for the numbers. The public menu page
https://www.nandos.co.uk/food/menu loads `page-data/index/page-data.<N>.json`; every product record in it carries `image`
(`aspectRatio_16_9.res640x360`, a JPEG on Nando's own image host images.menu.nandos.dev), and the page shows exactly that
file as the hero photo of the product panel that opens for that record. So the photo and the item are tied by the chain's own
record, not by us.

A photo is attached to a published item only when ALL of these hold (otherwise the item stays without one):
  * the record is one of the entries the public page shows to all of Great Britain (no `restaurantGroup`, not a trial) and is
    the only such entry with that `plu` (so no ambiguity);
  * the published item's name equals the record's `displayName` (norm_name equality), allowing only the suffixes nandos.py
    itself appends: " (regular)" / " (large)" when one record carries both sizes, and " (Nandinos)" where nandos.py tagged a
    Nandinos set-menu entry whose printed name clashes with a main-menu dish;
  * the photo's own file name carries the record's slug (e.g. `sol-bowl-Image-16-9.208793.jpg` for `sol-bowl`) and the
    folder of its section (a check that the feed did not attach another dish's picture to the record).
Spice levels and the Nandino side options have no record or photo of their own in the feed, so they get none.

Politeness: robots.txt is honoured for both hosts (polite_get), one request per second per host, a normal browser User-Agent,
one fetch per photo (cached in --cache so reruns fetch nothing). Never crops, recolours or retouches: store_image only
downsizes (never enlarges) to at most 640 px and converts to WebP.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
import nandos  # noqa: E402  (names exactly as nandos.py writes them)
import nandos_feed as nf  # noqa: E402

CHAIN_ID = "nandos"
PAGE_URL = "https://www.nandos.co.uk/food/menu/index.html"
SOURCE_PAGE = "https://www.nandos.co.uk/food/menu"   # the page whose product panels show the photos
NANDINOS_SECTION = "nandinos-kids"
FILE_RE = re.compile(r"^(?P<stem>.+?)(?:-\d+)?[.-]Image-16-9\.\d+\.jpg$")


def feed_entries(menu: dict) -> dict[str, tuple[str, dict]]:
    """plu -> (section id, entry) for entries the public page shows to all of GB. A plu seen twice is dropped (ambiguous)."""
    found: dict[str, tuple[str, dict]] = {}
    dup: set[str] = set()
    for sec in menu["result"]["data"]["nandos"]["menu"]["sections"]:
        for it in sec["items"]:
            if it.get("restaurantGroup") or "IS_TRIAL" in (it.get("flags") or []):
                continue
            if it["plu"] in found:
                dup.add(it["plu"])
            found[it["plu"]] = (sec["id"], it)
    return {k: v for k, v in found.items() if k not in dup}


def published_name(row: nf.Row) -> str:
    """The name nandos.py writes for this feed row (kept in step with nandos.py main())."""
    name = nandos.NAME_OVERRIDE.get(row.key, row.name)
    return f"{name} ({row.portion.lower()})" if row.portion else name


def photo_url(entry: dict, section: str) -> str | None:
    """The 640x360 file the page shows for this record, only if its file name belongs to this record and section."""
    url = ((entry.get("image") or {}).get("aspectRatio_16_9") or {}).get("res640x360")
    if not url:
        return None
    folder, fname = url.split("/uk/", 1)[1].split("/640x360/")
    m = FILE_RE.match(fname)
    if not m or m.group("stem") != entry["slug"] or folder != section.removeprefix("section:"):
        return None
    return url


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder for downloaded bytes (reruns fetch nothing)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches, store nothing")
    args = ap.parse_args()

    try:
        html = ic.polite_get(PAGE_URL, args.cache, accept="text/html,application/xhtml+xml").decode("utf-8")
        feed_url = nf.feed_url_from_html(html)
        menu = json.loads(ic.polite_get(feed_url, args.cache, accept="application/json,*/*;q=0.8"))
    except ic.Blocked as e:
        print(f"BLOCKED: {e}. Not working round it.", file=sys.stderr)
        return 2
    if menu["result"]["pageContext"].get("market") != "UK":
        raise SystemExit("Feed market is not UK.")

    entries = feed_entries(menu)
    rows, _ = nf.read_menu(menu)
    by_id = {nandos.slug(published_name(r)): r for r in rows if r.kind == "item"}
    items = ic.load_items(CHAIN_ID)

    matched: dict[str, tuple[str, str]] = {}   # item_id -> (file, source page)
    skipped: list[str] = []
    stored: dict[str, str] = {}                # photo URL -> stored file name
    for item in items:
        row = by_id.get(item["id"])
        if row is None or row.key not in entries:
            skipped.append(f"{item['name']}: no product record with a photo (spice level / Nandino side option)")
            continue
        section, entry = entries[row.key]
        expected = published_name(row)
        suffix_ok = ic.norm_name(item["name"]) in {
            ic.norm_name(entry["displayName"]),
            ic.norm_name(f"{entry['displayName']} ({row.portion})") if row.portion else "",
            ic.norm_name(f"{entry['displayName']} (Nandinos)") if section == f"section:{NANDINOS_SECTION}" else "",
        }
        if ic.norm_name(item["name"]) != ic.norm_name(expected) or not suffix_ok:
            skipped.append(f"{item['name']}: name differs from the record '{entry['displayName']}'")
            continue
        url = photo_url(entry, section)
        if url is None:
            skipped.append(f"{item['name']}: the record's photo file does not carry its own slug/section")
            continue
        if args.dry_run:
            matched[item["id"]] = (url.rsplit("/", 1)[1], SOURCE_PAGE)
            continue
        if url not in stored:
            try:
                stored[url] = ic.store_image(CHAIN_ID, ic.polite_get(url, args.cache, referer=SOURCE_PAGE))
            except ic.Blocked as e:
                print(f"BLOCKED: {e}. Stopping; not working round it.", file=sys.stderr)
                return 2
            except ValueError as e:
                stored[url] = ""
                skipped.append(f"{item['name']}: photo unusable ({e})")
        if stored[url]:
            matched[item["id"]] = (stored[url], SOURCE_PAGE)

    for item_id, (fname, _) in sorted(matched.items()):
        print(f"  {item_id:50s} {fname}")
    for line in skipped:
        print(f"  skipped: {line}")
    print(f"{len(matched)} of {len(items)} published items have a photo ({len(set(f for f, _ in matched.values()))} distinct files)")
    if args.dry_run:
        return 0
    ic.write_images_csv(CHAIN_ID, matched)
    shared = ic.suspected_placeholders(matched)
    for fname, ids in shared.items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")
    total = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN_ID).glob("*.webp"))
    print(f"stored {len(list((ic.IMAGES_ROOT / CHAIN_ID).glob('*.webp')))} files, {total / 1024:.0f} KB total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
