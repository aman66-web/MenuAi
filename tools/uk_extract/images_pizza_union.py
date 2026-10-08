#!/usr/bin/env python3
"""Item photos for Pizza Union (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_pizza_union.py --cache <dir> --dry-run   # fetch the menu pages only, list matches
    python3 tools/uk_extract/images_pizza_union.py --cache <dir>             # download, store, write images.csv

Source: the chain's own menu pages https://www.pizzaunion.com/food_menu/<category>/ (superfast-pizza, salads, savoury, sweet, drinks). Each
dish is a <div class="food-item"> holding an <img class="food-item-image">, an <h3> title and a price (the page repeats the list in a second
copy without the class, ignored). The photo is the rendition the page itself serves (e.g. 1.-Marinara-768x432.jpg, 768 px wide); store_image
then downsizes it to 640 px and converts to WebP, nothing else is changed. The chain's own full-size originals (5 MB each) are not fetched.

Matching (exact only): the h3 title, minus the chain's own trailing diet/heat marker "(v)", "(vg)", "(s)", "(n)" (legend markers, not part of
the name), must be the published item's name (norm_name). Not matched, on purpose:
- group tiles that show ONE photo for several published items: "Dips" (3 dips), "Gelato" (5 gelati/sorbetti), "Sicilian Cannoli (n)" (chocolate and
  pistachio), "Wine", "Prosecco", "Beer", "Soft Drinks", "Coffee & Tea" (the tile names a group, not an item);
- "Verdura (v)" and "Campagna": the page's photo files are swapped against the headings (the Verdura entry carries 3.-Campagna-768x512.jpg and the
  Campagna entry 2.-Verdura-768x512.jpg), so the page contradicts itself about which photo is which: neither gets one (file_agrees below);
- items the page does not list with a photo (toppings, Moretti beers, hot-drink items...).

Politeness / robots: www.pizzaunion.com/robots.txt (read 2026-10-08) is a Yoast block: "User-agent: *  Disallow: /?s=  Disallow: /page/*/?s=
Disallow: /search/" (nothing used here). Terms (https://www.pizzaunion.com/privacy-terms/): a privacy policy only; it says nothing about images,
copyright or reuse (no express restriction found). Photo credits in file names: "Credit_Charlie-McKay" appears on the section banners, not on dish photos.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "pizza-union"
HOST = "https://www.pizzaunion.com"
PAGES = ["superfast-pizza", "salads", "savoury", "sweet"]
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_ITEM = re.compile(r'<div class="food-item">(.*?)</h3>', re.S)
_MARKER = re.compile(r"\s*\((?:v|vg|s|n)\)\s*$", re.I)


def read_entries(page: str) -> list[dict]:
    """[{title (marker removed), raw title, photo URL, alt}] for each dish on a category page."""
    out = []
    for m in _ITEM.finditer(page):
        blk = m.group(1)
        im = re.search(r'<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"', blk)
        t = re.search(r"<h3>(.*)$", blk, re.S)
        if not im or not t:
            continue
        raw = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", t.group(1))).split())
        out.append({"raw": raw, "title": _MARKER.sub("", raw), "photo": htmllib.unescape(im.group(1)), "alt": htmllib.unescape(im.group(2))})
    return out


def file_agrees(fname: str, title: str) -> bool:
    """The page's photo file name (e.g. '15.-Napoli-1-768x432.jpg') must contain the heading it sits under, letters only: if the file is named
    after another dish the page contradicts itself about which photo is which (Verdura/Campagna) and neither is used."""
    stem = re.sub(r"-\d+x\d+(?=\.\w+$)", "", fname.rsplit("/", 1)[-1])
    stem = re.sub(r"\.\w+$", "", stem)
    return re.sub(r"[^a-z]", "", ic.norm_name(title)) in re.sub(r"[^a-z]", "", ic.norm_name(stem))


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
        page_url = f"{HOST}/food_menu/{p}/"
        text = ic.polite_get(page_url, args.cache, accept="text/html,application/xhtml+xml;q=0.9,*/*;q=0.8").decode("utf-8", "replace")
        entries = read_entries(text)
        if not entries:
            raise SystemExit(f"{page_url}: no dishes found: the layout changed")
        n_entries += len(entries)
        for e in entries:
            key = ic.norm_name(e["title"])
            fname = e["photo"].rsplit("/", 1)[-1]
            if not file_agrees(fname, e["title"]):
                notes.append(f"{e['raw']} ({p}): the photo file {fname} names a different dish than the heading -> none")
                continue
            hits = by_name.get(key, [])
            if len(hits) != 1:
                notes.append(f"{e['raw']} ({p}): {'a group tile, no published item with exactly this name' if not hits else 'several published items share this name'} -> none")
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
        print(f"  {by_id[item_id]['category']:<10} {by_id[item_id]['name']:<28} {wanted[item_id][0].rsplit('/', 1)[-1]}")
    print("Left without a photo (page entries):")
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
