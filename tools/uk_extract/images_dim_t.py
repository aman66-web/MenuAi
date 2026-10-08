#!/usr/bin/env python3
"""Item photos for Dim T (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_dim_t.py --cache DIR [--dry-run]

Source: Dim T's own online-ordering storefront, https://dim-t.deliverectdirect.com/pickup/hampstead (the "Takeaway" page of
https://dimt.co.uk/take-away/ links to it as the chain's own "order direct" pickup page; it is branded "dim t", shows the
chain's logo and "©2026 dim t"). The page loads ONE JSON menu feed for the restaurant
    https://dim-t.deliverectdirect.com/api/dbe-proxy/outlets/<outlet id>/menu?slug=<menu id>&salesChannel=webordering
whose `categories[].items[]` hold, for each dish, its printed `name`, `calories` and `photo`. The page shows exactly these:
each tile is the dish's photo (a CSS background) above its name, and the dish's pop-up shows the same photo at full size.
The photo URLs are on deliverect-resizer.imgix.net (the storefront's own image host; the file is the one the chain uploaded
to its Deliverect account). dimt.co.uk's own menu pages are PDFs and a few seasonal banners, not per-dish photos.

Match rule (exact, nothing fuzzy): a photo is attached to a published item (data/source/dim-t/items.csv minus
holdback.csv) only when the feed's `name` and the item's name are equal under images_common.norm_name (case, accents,
punctuation, '&'/'and' and spacing ignored; words are never dropped, reordered or approximated). So the feed's promotional
or section prefixes ("NEW - Thai Prawn crackers", "FISH - Prawn dim sum", "MEAT - Korean beef dim sum") are NOT removed:
those dishes get no photo here. Further guards: a name printed twice in the feed, a name shared by two published items, a
dish without a photo, "variant" entries (choice-of-protein dishes) and anything in EXCLUDE get none. Calories are printed for information only (a sanity check that the
storefront's dish is the one our guide lists) and are never used to match.

Terms (https://dimt.co.uk/terms-conditions/, read 2026-10-08): "This website contains material which is owned by or licensed
to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
prohibited other than in accordance with the copyright notice, which forms part of these terms and conditions." (No separate
copyright notice is published; images are not named.) The ordering storefront shows no terms of its own. Installed on the
founder's decision of 2026-10-06 (CLAUDE.md rule 2: the founder's accepted risk).
robots.txt (read 2026-10-08): dimt.co.uk disallows only /wp-admin/ and a few old offer pages; dim-t.deliverectdirect.com
disallows only /my-account, /orders and checkout-order-id query strings; deliverect-resizer.imgix.net allows everything.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "dim-t"
PAGE_URL = "https://dim-t.deliverectdirect.com/pickup/hampstead"
FEED_URL = ("https://dim-t.deliverectdirect.com/api/dbe-proxy/outlets/9afeeb78-6793-4c1f-9195-cfefa188d9fb/menu"
            "?slug=68e4f394828a37ba9dfc691b&salesChannel=webordering")
PHOTO_HOST = "https://deliverect-resizer.imgix.net/"
# Left out so a rerun can't bring them back: the storefront's dish has the same name but its calories differ from the August
# guide's (storefront 490 vs guide 439 kcal; 799 vs 617 kcal), so it may be a reworked recipe, not shown to be the same dish.
EXCLUDE = {"crispy-duck-bao", "tofu-miso-ramen"}


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
        feed = json.loads(ic.polite_get(FEED_URL, args.cache, referer=PAGE_URL, accept="application/json").decode("utf-8"))
    except ic.Blocked as e:
        print(f"BLOCKED: {e}")
        return 2
    # type "variant" entries (Korean fried chicken, Chicken katsu curry) are choice-of-protein dishes whose storefront calories
    # (877, 574) are those of another variant than our row (519, 577): not used. Only plain "product" entries count.
    products = [p for c in feed.get("categories", []) for p in c.get("items", []) if p.get("type") == "product"]
    count: dict[str, int] = {}
    for p in products:
        count[ic.norm_name(p["name"])] = count.get(ic.norm_name(p["name"]), 0) + 1

    rows: dict[str, tuple[str, str]] = {}
    matched: list[tuple[str, str, object, object]] = []
    for p in products:
        key = ic.norm_name(p["name"])
        photo = p.get("photo") or ""
        cands = by_norm.get(key, [])
        if not cands:
            continue
        if count[key] > 1 or len(cands) > 1:
            print(f"  ambiguous name, no photo: {p['name']!r}")
            continue
        it = cands[0]
        if it["id"] in EXCLUDE or not photo.startswith(PHOTO_HOST):
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=PAGE_URL)
        except ic.Blocked as e:
            print(f"BLOCKED: {e}")
            return 2
        if args.dry_run:
            matched.append((it["id"], p["name"], it.get("calories"), p.get("calories")))
            continue
        try:
            fname = ic.store_image(CHAIN, raw)
        except ValueError as e:
            print(f"  skipped {it['id']}: {e}")
            continue
        rows[it["id"]] = (fname, PAGE_URL)
        matched.append((it["id"], p["name"], it.get("calories"), p.get("calories")))

    for item_id, name, ours, theirs in matched:
        flag = "" if str(ours) == str(theirs) else "   <-- calories differ"
        print(f"  {item_id:40s} {name:35s} ours {ours} / storefront {theirs}{flag}")
    print(f"feed: {len(products)} products; published items: {len(items)}; photos attached: {len(matched)}")
    if not args.dry_run:
        ic.write_images_csv(CHAIN, rows)
        for f, ids in ic.suspected_placeholders(rows, 2).items():
            print(f"  shared file {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
