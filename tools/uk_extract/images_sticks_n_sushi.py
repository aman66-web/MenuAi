#!/usr/bin/env python3
"""Item photos for Sticks'n'Sushi UK (docs/UK_DATA_PLAYBOOK.md, Phase 4).

Source: the chain's own UK dine-in menu page, https://www.sticksnsushi.com/gb/en/dine-in-menu/ . The page is rendered by the browser
from the chain's own menu feed, https://www.sticksnsushi.com/api/umbraco/get-menucard/?country=GB&locale=en&dateTime=null&restaurantId=null
(JSON: category tree -> products with Name, SubTitle, Image, DineInImage ...). The page shows each dish with its `DineInImage`, a photo
served from the chain's own media host https://tataki.sticksnsushi.com/media/... (the page asks for a cropped 384x480 rendition; we fetch
the original file without any crop parameter, and store_image only downsizes it to 640 px and converts to WebP).
robots.txt of www.sticksnsushi.com disallows only /dk/de, /de/da, /gb/da, /gb/de paths (RFC 9309 matcher in images_common.polite_get),
so /gb/en/ and /api/ are allowed; tataki.sticksnsushi.com/robots.txt answers 404 (no rules).

A photo is attached to a published item (data/source/sticks-n-sushi/items.csv minus holdback.csv) only when the product record that carries
the photo names the item exactly (norm_name equality) in one of these ways:
  * the record's Name alone                         "Gyoza"                       -> item "Gyoza"
  * the record's Name + SubTitle                    "Tsukune" + "2 pcs"           -> item "Tsukune (2 pcs)"
  * Nigiri category: Name + SubTitle                "Maguro" + "2 pcs"            -> item "Maguro Nigiri (2 pcs)"
  * House Rolls category: Name                      "Wagyu"                       -> item "Wagyu House Roll"
  * explicit alias, same product record carrying the printed weight: "Exmoor Caviar 10g tin" -> item "Exmoor Caviar" (10 g)
A name on several records with different photos, or an item reached by two different photos, gets no photo. Nothing is matched when the
record states a different quantity than the item (the "1 pc" items have no record of their own, so they get no photo).

    python3 tools/uk_extract/images_sticks_n_sushi.py --cache <dir> [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "sticks-n-sushi"
PAGE = "https://www.sticksnsushi.com/gb/en/dine-in-menu/"
FEED = "https://www.sticksnsushi.com/api/umbraco/get-menucard/?country=GB&locale=en&dateTime=null&restaurantId=null"
MEDIA = "https://tataki.sticksnsushi.com"
# same product record carries the photo and the item's printed size (record name -> item id)
ALIASES = {"exmoor caviar 10g tin": "exmoor-caviar"}
# Looked at on the contact sheet and left out so a rerun can't bring them back (item id -> reason).
EXCLUDE: dict[str, str] = {
    "as-good-as-it-gets": "the chain's photo shows the whole set for two; our item is per person",
    "perfect-day": "the chain's photo shows the whole set for two; our item is per person",
    "set-for-success": "the chain's photo shows the whole set for two; our item is per person",
}


def walk(cats: list[dict], path: tuple[str, ...] = ()):
    for c in cats:
        for p in c.get("Products") or []:
            yield path + (c["Name"].strip(),), p
        yield from walk(c.get("SubCategories") or [], path + (c["Name"].strip(),))


def keys_for(path: tuple[str, ...], p: dict) -> set[str]:
    name = (p.get("Name") or "").strip()
    sub = (p.get("SubTitle") or "").strip()
    keys = {ic.norm_name(name)}
    if sub:
        keys.add(ic.norm_name(f"{name} ({sub})"))
    top = path[-1] if path else ""
    if top == "Nigiri" and sub:
        keys.add(ic.norm_name(f"{name} Nigiri ({sub})"))
    if top == "House Rolls":
        keys.add(ic.norm_name(f"{name} House Roll"))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; store nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_norm = {ic.norm_name(it["name"]): it for it in items}
    by_id = {it["id"]: it for it in items}

    try:
        raw = ic.polite_get(FEED, args.cache, accept="application/json,*/*;q=0.8", referer=PAGE)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}")
        return 2
    tree = json.loads(raw.decode("utf-8"))
    records = list(walk(tree))
    print(f"{len(records)} product records in the UK menu feed")

    photos: dict[str, set[str]] = {}  # item id -> set of photo paths offered by records that name it
    printed: dict[str, str] = {}
    for path, p in records:
        photo = p.get("DineInImage")
        if not photo:
            continue
        name = (p.get("Name") or "").strip()
        for k in keys_for(path, p):
            it = by_norm.get(k)
            if it:
                photos.setdefault(it["id"], set()).add(photo)
                printed.setdefault(it["id"], f"{' > '.join(path)} | {name} | {p.get('SubTitle') or ''}")
        alias = ALIASES.get(ic.norm_name(name))
        if alias in by_id:
            photos.setdefault(alias, set()).add(photo)
            printed.setdefault(alias, f"{' > '.join(path)} | {name} | alias")

    matches: dict[str, str] = {}
    ambiguous = []
    for iid, ps in photos.items():
        if len(ps) != 1:
            ambiguous.append(iid)
        elif iid not in EXCLUDE:
            matches[iid] = next(iter(ps))
    print(f"{len(matches)} of {len(items)} published items match by exact name")
    if ambiguous:
        print("ambiguous (no photo):", sorted(ambiguous))
    for iid, ph in sorted(matches.items()):
        print(f"  {iid:36s} <- {printed[iid]}  {ph.rsplit('/', 1)[-1]}")
    print("published items with no photo:", sorted(it["id"] for it in items if it["id"] not in matches))
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    for iid, ph in sorted(matches.items()):
        if ph not in stored:
            try:
                data = ic.polite_get(MEDIA + urllib.parse.quote(ph, safe="/%"), args.cache, referer=PAGE)
                stored[ph] = ic.store_image(CHAIN, data)
            except ic.Blocked as e:
                print(f"BLOCKED: {e}")
                return 2
            except Exception as e:
                print(f"  skipped {iid}: {e}")
                stored[ph] = ""
        if stored[ph]:
            rows[iid] = (stored[ph], PAGE)
    ic.write_images_csv(CHAIN, rows)
    total = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN).glob("*.webp")) if (ic.IMAGES_ROOT / CHAIN).is_dir() else 0
    print(f"stored {len(rows)} item photos ({len(set(f for f, _ in rows.values()))} files, {total/1024:.0f} KB) under web/public/menu-images/{CHAIN}/")
    shared = ic.suspected_placeholders(rows)
    for f, ids in shared.items():
        print(f"  shared by {len(ids)} items: {f}: {sorted(ids)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
