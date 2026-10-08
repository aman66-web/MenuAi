#!/usr/bin/env python3
"""Item photos for Creams Cafe (docs/UK_DATA_PLAYBOOK.md, Phase 4).

Source: the chain's own menu pages (https://www.creamscafe.com/menu/<category>/). Each dish on those pages is one
column holding its photo (served from the chain's own image bucket, storage.googleapis.com/creams-website-media, which the
site's WordPress "Stateless" plugin points at) and its printed name in the same column. robots.txt of www.creamscafe.com
(`Disallow: /*?`, `Crawl-delay: 3`) is honoured: no URL here has a query string and pages are fetched 3 seconds apart.

A photo is attached to a published item (data/source/creams-cafe/items.csv minus holdback.csv) only when the column that
holds the photo prints the item's exact name (norm_name equality). Nothing is guessed: names the site prints that differ
from the allergen matrix's names (the nutrition source) get no photo.

    python3 tools/uk_extract/images_creams_cafe.py --cache <dir> [--dry-run]
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "creams-cafe"
BASE = "https://www.creamscafe.com/menu/"
PAGES = ["specials", "value-menu", "froffles", "under-5", "savoury", "gelato-sorbet-2", "kids", "sundaes", "waffles",
         "crepes", "hot-pockets", "cookie-dough-hot-puddings", "cakes-pastries", "milkshakes", "drinks", "hot-drinks",
         "bubble-tea-ice-cream-floats", "doughnuts", "vegan", "healthy"]
IMG_HOST = "https://storage.googleapis.com/creams-website-media/"
# same dish printed with two different spellings across the site: only the printed name counts, so nothing to alias here
ALIASES: dict[str, str] = {}
# Looked at after the first run and left out so a rerun can't bring them back: the name matches, but the page that prints it
# is a different menu from the item's own (the Kids menu's "Stuffed Pancake bites", 720 kcal, matched the Value menu's 3-bite
# "Stuffed pancake bites" with hazelnut filling and toffee sauce, 415 kcal in the matrix: not shown to be the same dish).
EXCLUDE = {"stuffed-pancake-bites"}


def page_url(slug: str) -> str:
    return f"{BASE}{slug}/"


def _text(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def parse_page(doc: str) -> list[tuple[str, str]]:
    """[(printed name, photo url)] for each column of the page that holds exactly one photo and exactly one heading."""
    start = doc.find('id="Content"')
    end = doc.find("Quick Links", start)
    body = doc[start:end if end > 0 else len(doc)]
    cols = re.split(r'<div class="wpb_column vc_column_container', body)[1:]
    out = []
    for col in cols:
        imgs = [m for m in re.findall(r"<img\b[^>]*>", col) if 'src="' + IMG_HOST in m]
        heads = re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", col, flags=re.S)
        heads = [_text(h) for h in heads if _text(h)]
        if len(imgs) != 1 or len(heads) != 1:
            continue
        src = re.search(r'src="([^"]+)"', imgs[0]).group(1)
        out.append((heads[0], src))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; store nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_norm: dict[str, list[dict]] = {}
    for it in items:
        by_norm.setdefault(ic.norm_name(it["name"]), []).append(it)

    entries: list[tuple[str, str, str]] = []  # (printed name, photo url, page url)
    for slug in PAGES:
        url = page_url(slug)
        try:
            raw = ic.polite_get(url, args.cache, delay=3.0, accept="text/html,*/*;q=0.8")
        except ic.Blocked as e:
            print(f"BLOCKED: {e}")
            return 2
        except Exception as e:  # a missing page is not fatal
            print(f"skip {url}: {e}")
            continue
        found = parse_page(raw.decode("utf-8", "replace"))
        print(f"{slug}: {len(found)} dishes with a photo")
        entries += [(n, p, url) for n, p in found]

    # one dish name must map to one photo; a name that appears with different photos is ambiguous: no photo
    photos_by_name: dict[str, set[str]] = {}
    for n, p, _ in entries:
        photos_by_name.setdefault(ic.norm_name(ALIASES.get(n, n)), set()).add(p)

    matches: dict[str, tuple[str, str, str]] = {}  # item_id -> (photo url, page url, printed name)
    ambiguous = []
    for n, p, page in entries:
        key = ic.norm_name(ALIASES.get(n, n))
        if key not in by_norm:
            continue
        if len(photos_by_name[key]) > 1:
            ambiguous.append(n)
            continue
        if len(by_norm[key]) != 1:
            ambiguous.append(n)  # two published items share the name: cannot tell which the photo shows
            continue
        it = by_norm[key][0]
        if it["id"] in EXCLUDE:
            continue
        matches.setdefault(it["id"], (p, page, n))

    print(f"\n{len(entries)} dish entries on {len(PAGES)} pages; {len(matches)} of {len(items)} published items match by exact name")
    if ambiguous:
        print("ambiguous (no photo):", sorted(set(ambiguous)))
    for iid, (p, page, n) in sorted(matches.items()):
        print(f"  {iid:55s} <- '{n}'  {p.rsplit('/', 1)[-1]}")
    unmatched = sorted({n for n, _, _ in entries if ic.norm_name(ALIASES.get(n, n)) not in by_norm})
    print(f"\nprinted names on the site with no exact published item ({len(unmatched)}):")
    for n in unmatched:
        print("  ", n)
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    for iid, (p, page, n) in sorted(matches.items()):
        if p not in stored:
            try:
                raw = ic.polite_get(p, args.cache, delay=1.0, referer=page)
                stored[p] = ic.store_image(CHAIN, raw)
            except ic.Blocked as e:
                print(f"BLOCKED: {e}")
                return 2
            except Exception as e:
                print(f"skip {iid}: {e}")
                stored[p] = ""
        if stored[p]:
            rows[iid] = (stored[p], page)
    ic.write_images_csv(CHAIN, rows)
    total = sum(f.stat().st_size for f in (ic.IMAGES_ROOT / CHAIN).glob("*.webp")) if (ic.IMAGES_ROOT / CHAIN).is_dir() else 0
    print(f"\nstored {len(rows)} items with a photo, {len(set(f for f, _ in rows.values()))} files, {total/1024:.0f} KB")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"shared by {len(ids)} items: {f} -> {ids}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
