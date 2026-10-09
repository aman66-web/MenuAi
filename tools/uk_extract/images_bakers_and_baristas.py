#!/usr/bin/env python3
"""Item photos for Bakers & Baristas from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_bakers_and_baristas.py --cache DIR [--dry-run]

Source: https://www.bakersbaristas.com/pages/whats-new (the chain's own site, the same site that serves the allergen PDF
data/source/bakers-and-baristas/chain.csv cites). The page is a Shopify theme page; every entry is one block holding a photo
and, directly after it, the dish's name as plain text:
    <a href="#" class="image-block ..."><img src="//www.bakersbaristas.com/cdn/shop/files/<file>?v=..&width=3840" alt="" ...></a>
    <div class="... text-block ... h4"><p>Tiramisu Muffin</p></div>
The photo URLs are taken from the page's own `srcset` (width=1200 variant, a size the page itself serves).

The chain's online-ordering shop (/collections/all, Irish menu, euro prices) was checked too: none of its product names equals a
published UK item name, and several of its products share one photo between different products (e.g. "Vegan Mango & Passionfruit
Muffin" shows the Pear & Almond muffin; "Tuna Mayonnaise Salad Bloomer" shows the Egg Mayo one), so it is not used.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the block's caption has the same norm_name as the item's name, or as the item's name without the trailing
     "(<milk>, <size>)" that the UK guide appends to every drink (the page entry is the drink; the milk and the size are its variants), and
  2. exactly one block on the page carries that caption, and
  3. the photo file is not used by a block with another caption.
Blocks that name something we do not publish under that name get nothing (Caramel Apple Muffin: published as "Caramel Apple Vegan
Muffin"; Blackberry & Apple Crumble Muffin: published as "Blackberry & Apple Clamshell Muffin"; Banana Bread Matcha Cold Foam Iced
Latte: published as "Banana Bread (Cold Foam) Iced Matcha Latte") - the names differ, so we do not guess.

Terms (https://www.bakersbaristas.com/pages/terms-conditions and /policies/terms-of-service, read 2026-10-10): the terms page only
covers the free birthday muffin offer and the Shopify terms page is a link to Shopify's terms; neither says anything about
images. The footer reads "Copyright 2026 Bakers + Baristas UK Ltd, Bakers + Baristas Ireland. All rights reserved" (a generic
notice, not an express prohibition). robots.txt (https://www.bakersbaristas.com/robots.txt, read 2026-10-10): `User-agent: *
Allow: /` with Disallow only for /admin, /cart, /checkout, /orders, /account, /services, sort/filter URLs; /pages/ and
/cdn/shop/files/ are allowed (polite_get checks every URL anyway). Installed on the founder's decision of 2026-10-06
(CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "bakers-and-baristas"
PAGE_URL = "https://www.bakersbaristas.com/pages/whats-new"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-bakers-and-baristas")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it is left without a photo after looking (a rerun must not bring it back)
SKIP_FILES: dict[str, str] = {}   # photo file name -> why it is not used

BLOCK = re.compile(
    r'<img src="(?P<src>//www\.bakersbaristas\.com/cdn/shop/files/(?P<file>[^"?]+)\?[^"]*)"[^>]*?srcset="(?P<srcset>[^"]*)"[^>]*>\s*</a>\s*'
    r'<div[^>]*text-block[^>]*>\s*<p>(?P<cap>.*?)</p>', re.S)
VARIANT = re.compile(r"\s*\((?:[a-z ]+ milk|no milk), (?:regular|medium|large|small)\)\s*$", re.I)


def clean(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def blocks(page: str) -> list[dict]:
    """Every photo + caption block of the page: caption, photo file, URL of the width=1200 variant from the page's own srcset."""
    out = []
    for m in BLOCK.finditer(page):
        cap = clean(m.group("cap"))
        if not cap:
            continue
        srcset = html.unescape(m.group("srcset"))
        pick = None
        for part in srcset.split(","):
            url = part.strip().split(" ")[0]
            if "width=1200" in url:
                pick = url
        if pick is None:
            pick = html.unescape(m.group("src"))
        out.append({"caption": cap, "file": m.group("file"), "url": "https:" + pick if pick.startswith("//") else pick})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        bs = blocks(page)
        print(f"{len(bs)} photo + caption blocks on {PAGE_URL}")
        by_cap: dict[str, list[dict]] = {}
        for b in bs:
            by_cap.setdefault(norm_name(b["caption"]), []).append(b)
        files_caps: dict[str, set[str]] = {}
        for b in bs:
            files_caps.setdefault(b["file"], set()).add(norm_name(b["caption"]))

        matched: dict[str, dict] = {}
        for it in items:
            key = norm_name(VARIANT.sub("", it["name"]))
            cands = by_cap.get(key)
            if not cands:
                continue
            if len(cands) != 1:
                skipped.append(f"{it['id']}: {len(cands)} blocks named {cands[0]['caption']!r}")
                continue
            b = cands[0]
            if len(files_caps[b["file"]]) != 1:
                skipped.append(f"{it['id']}: photo {b['file']} is shared by blocks with different captions")
                continue
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if b["file"] in SKIP_FILES:
                skipped.append(f"{it['id']}: {b['file']} skipped: {SKIP_FILES[b['file']]}")
                continue
            matched[it["id"]] = b
        for b in bs:
            if not any(m is b for m in matched.values()):
                skipped.append(f"block {b['caption']!r} names no published item")

        rows: dict[str, tuple[str, str]] = {}
        for item_id, b in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:60} {b['url']}")
                continue
            raw = polite_get(b["url"], args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {b['url']}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
            print(f"  {item_id:60} {fname}  <- {b['caption']}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
