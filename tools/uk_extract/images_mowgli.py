#!/usr/bin/env python3
"""Item photos for Mowgli Street Food (docs/UK_DATA_PLAYBOOK.md, Phase 4).

Source: the chain's own Food menu page, https://mowglistreetfood.com/menus/food/ (the same page the calories come from).
Every dish on it has a photo set as the CSS background of its own tile: the four "Light Kitchen" featured dishes
(`div.featured-dish__details` holding `div.featured-dish__image` + `h2.featured-dish__title`) and the slider tiles of every other
section (`div.menu-item` with an inline `background-image` and the dish's printed name in its `<p>`). Photos are served from the
chain's own site, https://mowglistreetfood.com/wp-content/uploads/... robots.txt of that host (RFC 9309 matcher in
images_common.polite_get) disallows only wc-logs, woocommerce_*, wp-admin and `?add-to-cart=` URLs: this page and these uploads are allowed.

A photo is attached to a published item (data/source/mowgli/items.csv minus holdback.csv) only when the tile that carries the photo
prints the item's exact name (norm_name equality). A name printed with two different photos, or two published items with the
same name, gets no photo. The page prints the Kids ice cream cones and brownie again under "Sweet"; the repeats carry the same photo file.

    python3 tools/uk_extract/images_mowgli.py --cache <dir> [--dry-run]
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "mowgli"
PAGE = "https://mowglistreetfood.com/menus/food/"
UPLOADS = "https://mowglistreetfood.com/wp-content/uploads/"
# Looked at after the first run and left out so a rerun can't bring them back (item id -> reason). Filled in below if needed.
EXCLUDE: dict[str, str] = {}


def _text(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def parse_page(doc: str) -> list[tuple[str, str]]:
    """[(printed name, photo url)] for every tile that carries exactly one background photo and one printed name."""
    start = doc.find('<div class="menu-sections row">')
    end = doc.find("</main>", start)
    if start < 0 or end < 0:
        raise SystemExit("menu-sections block not found: the page layout changed")
    body = doc[start:end]
    out: list[tuple[str, str]] = []
    # featured dishes: image div and title h2 sit in the same featured-dish__details block
    for blk in re.split(r'<div class="featured-dish__details"', body)[1:]:
        blk = blk.split('<div class="featured-dish__details"')[0]
        imgs = re.findall(r'class="featured-dish__image"[^>]*background-image:\s*url\(([^)]+)\)', blk)
        names = re.findall(r'<h2 class="featured-dish__title">(.*?)<span', blk, flags=re.S)
        if len(imgs) == 1 and len(names) == 1:
            out.append((_text(names[0]), imgs[0].strip("'\" ")))
    # slider tiles: one div.menu-item per dish with an inline background-image and the printed name in its <p>
    for m in re.finditer(r'<div class="swiper-slide menu-item[^"]*"[^>]*?background-image:\s*url\(([^)]+)\)[^>]*>(.*?)</div>\s*</div>', body, flags=re.S):
        names = re.findall(r"<p[^>]*>(.*?)</p>", m.group(2), flags=re.S)
        names = [_text(n) for n in names if _text(n)]
        if len(names) == 1:
            out.append((names[0], m.group(1).strip("'\" ")))
    return [(n, u) for n, u in out if u.startswith(UPLOADS)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; store nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_norm: dict[str, list[dict]] = {}
    for it in items:
        by_norm.setdefault(ic.norm_name(it["name"]), []).append(it)

    try:
        raw = ic.polite_get(PAGE, args.cache, accept="text/html,*/*;q=0.8")
    except ic.Blocked as e:
        print(f"BLOCKED: {e}")
        return 2
    entries = parse_page(raw.decode("utf-8", "replace"))
    print(f"{len(entries)} tiles with a photo and a printed name on {PAGE}")

    photos_by_name: dict[str, set[str]] = {}
    for n, p in entries:
        photos_by_name.setdefault(ic.norm_name(n), set()).add(p)

    matches: dict[str, tuple[str, str]] = {}  # item_id -> (photo url, printed name)
    ambiguous = []
    for n, p in entries:
        key = ic.norm_name(n)
        if key not in by_norm:
            continue
        if len(photos_by_name[key]) > 1 or len(by_norm[key]) != 1:
            ambiguous.append(n)
            continue
        it = by_norm[key][0]
        if it["id"] in EXCLUDE:
            continue
        matches.setdefault(it["id"], (p, n))

    print(f"{len(matches)} of {len(items)} published items match by exact name")
    if ambiguous:
        print("ambiguous (no photo):", sorted(set(ambiguous)))
    for iid, (p, n) in sorted(matches.items()):
        print(f"  {iid:36s} <- '{n}'  {p.rsplit('/', 1)[-1]}")
    print("published items with no photo:", sorted(it["id"] for it in items if it["id"] not in matches))
    print("printed names with no exact published item:", sorted({n for n, _ in entries if ic.norm_name(n) not in by_norm}))
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    for iid, (p, n) in sorted(matches.items()):
        if p not in stored:
            try:
                data = ic.polite_get(p, args.cache, referer=PAGE)
                stored[p] = ic.store_image(CHAIN, data)
            except ic.Blocked as e:
                print(f"BLOCKED: {e}")
                return 2
            except Exception as e:
                print(f"skip {iid}: {e}")
                stored[p] = ""
        if stored[p]:
            rows[iid] = (stored[p], PAGE)
    ic.write_images_csv(CHAIN, rows)
    d = ic.IMAGES_ROOT / CHAIN
    total = sum(f.stat().st_size for f in d.glob("*.webp")) if d.is_dir() else 0
    print(f"\nstored {len(rows)} items with a photo, {len({f for f, _ in rows.values()})} files, {total / 1024:.0f} KB")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"shared by {len(ids)} items: {f} -> {ids}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
