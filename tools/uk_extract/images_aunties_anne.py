#!/usr/bin/env python3
"""Item photos for Auntie Anne's UK (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_aunties_anne.py --cache <dir>            # fetch (cached), store photos, write images.csv
    python3 tools/uk_extract/images_aunties_anne.py --cache <dir> --survey   # only print what each page shows; writes nothing

Source: the chain's own menu item pages, https://www.auntieannes.co.uk/menu/<slug>/ (listed in its menu sitemap). They are the
same pages the nutrition data came from (tools/uk_extract/aunties_anne.py). Each page is one product record: its featured photo
(the <img> straight after the breadcrumb, also the page's og:image), its <h1> title and, for items sold in sizes / scoops / meat
options, the `variantData` options (8" / 14", One / Two / Three Scoops, Regular / Large, 3 / 6 Stix, Original / Halal Beef /
Halal Chicken). The page has one photo for all its options (no per-option photos).

Match rule (nothing fuzzy): the page -> item-name table is the nutrition extractor's own (SPEC / OPT, imported read-only), the
page's <h1> must still be that name (norm_name equality; the extractor's TITLE_DIFFERS pages are the only exception, and they are
the very record the item's numbers came from), and for each option the page prints, the item id the extractor would make must
be a published row of the CURRENT items.csv whose name is that name + option suffix (norm_name equality). A photo URL that more
than one page uses is treated as a generic picture and attached to none of them. Photos checked by eye and found not to show the
item (placeholders, logos, a different product, printed nutrition claims) are listed in DROP with the reason.

robots.txt (2026-10-06): "User-agent: * / Disallow:" (everything allowed). The site has no terms-of-use page; its footer reads
"(c) Copyright 2008 - 2026 Freshly Baked Limited, trading as Auntie Anne's UK" and the privacy policy says nothing about images.
Founder's decision 2026-10-06: the chain's own photos are installed (CLAUDE.md rule 2). A 401/403/429 or robots refusal stops
the run (images_common.Blocked): never worked round.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (Blocked, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)
from common import slug  # noqa: E402
import aunties_anne as AA  # noqa: E402  (read only: the page -> item-name table the nutrition data was built with)

CHAIN_ID = "aunties-anne"
BASE = "https://www.auntieannes.co.uk"
HTML = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

# Photos looked at by eye and not used (by the photo URL's file name), with the reason. Filled after the visual check.
DROP: dict[str, str] = {}


def page_record(text: str) -> dict:
    """-> {title, photo, og, labels}. `photo` is the featured image inside the item's <article> (right after the breadcrumb)."""
    t = re.search(r'<h1 class="entry-title">(.*?)</h1>', text, re.S)
    art = re.search(r'<article id="post-\d+" class="([^"]*)"', text)
    photo = ""
    if art and "has-post-thumbnail" in art.group(1):
        start = text.find("breadcrumb_last", art.end())
        stop = text.find('class="title-content-wrap"', art.end())
        if 0 <= start < stop:
            m = re.search(r'<img src="([^"]+)"', text[start:stop])
            if m:
                photo = html.unescape(m.group(1))
    og = re.search(r'<meta property="og:image" content="([^"]+)"', text)
    labels = [""]
    v = re.search(r"var variantData = (\[.*?\]);\s*\n", text, re.S)
    if v:
        labels = [o.get("label", "") for o in json.loads(v.group(1))]
    return {"title": html.unescape(t.group(1)).strip() if t else "", "photo": photo,
            "og": html.unescape(og.group(1)) if og else "", "labels": labels}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="cache directory (pages and photos are fetched once)")
    ap.add_argument("--survey", action="store_true", help="print what each page shows and stop (writes nothing)")
    args = ap.parse_args()
    cache: Path = args.cache

    items = {r["id"]: r for r in load_items(CHAIN_ID)}
    try:
        sm = polite_get(BASE + "/menu-sitemap.xml", cache, accept=HTML).decode("utf-8", "replace")
        slugs = [u.rstrip("/").rsplit("/", 1)[1] for u in re.findall(r"<loc>([^<]+)</loc>", sm) if re.search(r"/menu/[^/]+/?$", u)]
        pages: dict[str, dict] = {}
        for s in slugs:
            if s not in AA.SPEC:
                continue  # pages the nutrition data does not publish (no numbers printed, kits): no item to attach to
            url = f"{BASE}/menu/{s}/"
            pages[s] = dict(page_record(polite_get(url, cache, accept=HTML).decode("utf-8", "replace")), url=url)
    except Blocked as e:
        print(f"STOPPED, blocked: {e}", file=sys.stderr)
        return 3

    photo_pages: dict[str, list[str]] = defaultdict(list)
    for s, p in pages.items():
        if p["photo"]:
            photo_pages[p["photo"]].append(s)

    planned: dict[str, tuple[str, str]] = {}  # item_id -> (photo_url, page_url)
    skipped: list[str] = []
    for s, p in pages.items():
        name = AA.SPEC[s][0]
        why = ""
        if not p["photo"]:
            why = "no featured photo on the page"
        elif p["og"] and p["og"] != p["photo"]:
            why = f"page photo and og:image differ ({p['photo']} / {p['og']})"
        elif norm_name(p["title"]) != norm_name(name) and s not in AA.TITLE_DIFFERS:
            why = f"page title {p['title']!r} is not {name!r}"
        elif len(photo_pages[p["photo"]]) > 1:
            why = f"same photo on {len(photo_pages[p['photo']])} pages: {', '.join(photo_pages[p['photo']])}"
        elif p["photo"].rsplit("/", 1)[-1] in DROP:
            why = "dropped after looking: " + DROP[p["photo"].rsplit("/", 1)[-1]]
        if why:
            skipped.append(f"{s}: {why}")
            continue
        for label in p["labels"]:
            if label not in AA.OPT:
                skipped.append(f"{s} ({label}): option not known to the nutrition extractor")
                continue
            full = name + AA.NAME_SUFFIX_OVERRIDE.get((s, label), AA.OPT[label][0])
            item_id = slug(full)
            row = items.get(item_id)
            if row is None:
                skipped.append(f"{s} ({label or 'single'}): {item_id} is not published")
                continue
            if norm_name(row["name"]) != norm_name(full):
                skipped.append(f"{s} ({label or 'single'}): items.csv names {item_id} {row['name']!r}, not {full!r}")
                continue
            planned[item_id] = (p["photo"], p["url"])

    if args.survey:
        for s, p in pages.items():
            print(f"{s:40} | {p['title'][:34]:34} | {p['photo'].rsplit('/', 1)[-1] or '-':55} | {'/'.join(p['labels'])}")
        print(f"\n{len(planned)} of {len(items)} published items would get a photo.\nSkipped:")
        for line in skipped:
            print("  " + line)
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, (photo, page_url) in sorted(planned.items()):
            if photo not in stored:
                try:
                    stored[photo] = store_image(CHAIN_ID, polite_get(photo, cache, referer=page_url))
                except ValueError as e:
                    stored[photo] = ""
                    skipped.append(f"{photo}: not stored ({e})")
            if stored[photo]:
                rows[item_id] = (stored[photo], page_url)
    except Blocked as e:
        print(f"STOPPED, blocked: {e}", file=sys.stderr)
        return 3

    if rows:
        path = write_images_csv(CHAIN_ID, rows)
        print(f"wrote {path} ({len(rows)} of {len(items)} published items, {len(set(f for f, _ in rows.values()))} files)")
    else:
        stale = Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID / "images.csv"
        if stale.exists():
            stale.unlink()
        print("no photos matched: nothing written")
    for f, ids in suspected_placeholders(rows).items():
        print(f"used by {len(ids)} items (look at it): {f}: {', '.join(sorted(ids))}")
    for line in skipped:
        print("skipped " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
