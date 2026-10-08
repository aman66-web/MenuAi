#!/usr/bin/env python3
"""Item photos for Comptoir Libanais (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_comptoir_libanais.py --cache DIR [--dry-run]

Source: Comptoir Libanais's own click-and-collect ordering site, https://order.storekit.com/comptoir-libanais-gloucester-rd
(the "Click and Collect" link on https://www.comptoirlibanais.com/ goes to https://order.storekit.com/stores/comptoir-libanais,
which lists the chain's restaurants; each one opens its own branded menu page: the chain's name, logo and colours, its allergen
PDF linked). The menu page loads ONE JSON feed per menu,
    https://order.storekit.com/api/categories/<menu id>?showAll=false&lang=en
(the menu id comes from https://order.storekit.com/api/venues/comptoir-libanais-gloucester-rd, which the page loads too), whose
`categories[].products[]` hold each dish's printed `name` and `image` (the file the chain uploaded to its Uploadcare store,
ucarecdn.com). The page shows exactly these: each tile is the dish's photo next to its name. Only the venue's first menu (the one
the page opens with) is used; the venue's other three menus list the same dishes. www.comptoirlibanais.com's own menu pages are an
allergen PDF plus a few lifestyle photos, not per-dish photos.

Match rule (exact, nothing fuzzy): a photo is attached to a published item (data/source/comptoir-libanais/items.csv minus
holdback.csv) only when the feed's product `name` and the item's name are equal under images_common.norm_name (case, accents,
punctuation, '&'/'and' and spacing ignored; words are never dropped, reordered or approximated, so "Chicken Shawarma Bowl" does NOT
match "Chicken Shawarma Rice Bowl" and "Marinated Mixed Olives" does NOT match "Marinated Olives"). Further guards: a name that the
feed lists twice with DIFFERENT photos, a name shared by two published items, a product without a photo, a photo that is not on
ucarecdn.com, and anything in EXCLUDE get none. (Fattoush, Tabbouleh and Batata Harra are listed twice, under Mezze and under Sides,
with the same file: that is one photo, so they are kept.)

Terms: https://www.comptoirlibanais.com and https://comptoirgroup.com publish a privacy policy, a gift-card T&Cs PDF and a policies page
but NO website terms of use (read 2026-10-08); the only notice about content is the footer "© 2026 Comptoir. All rights reserved."
(a generic notice, not an express prohibition on copying images). The ordering site links only a Privacy page (customPolicies:
hasTermsAndConditions false). Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2: the founder's accepted risk).
robots.txt (read 2026-10-08): www.comptoirlibanais.com `User-agent: * / Disallow:` (nothing); order.storekit.com `Allow: /`;
ucarecdn.com has no robots.txt (404 = no rules).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "comptoir-libanais"
PAGE_URL = "https://order.storekit.com/comptoir-libanais-gloucester-rd"
VENUE_URL = "https://order.storekit.com/api/venues/comptoir-libanais-gloucester-rd"
MENU_URL = "https://order.storekit.com/api/categories/{id}?showAll=false&lang=en"
PHOTO_HOST = "https://ucarecdn.com/"
# Looked at after the first run and left out so a rerun can't bring them back: the chain's photo under this exact name does not
# clearly show that dish. "Halloumi Wrap" shows two wraps filled with dark sliced meat and red pepper (no halloumi to be seen);
# "Quinoa" shows fine, uniform, pale-yellow grains that look like couscous (the feed's separate "Steamed Couscous" has its own file).
EXCLUDE = {"halloumi-wrap", "quinoa"}


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
        venue = json.loads(ic.polite_get(VENUE_URL, args.cache, referer=PAGE_URL, accept="application/json").decode("utf-8"))["venue"]
        menu_id = venue["menu"][0]["id"]
        feed = json.loads(ic.polite_get(MENU_URL.format(id=menu_id), args.cache, referer=PAGE_URL, accept="application/json").decode("utf-8"))
    except ic.Blocked as e:
        print(f"BLOCKED: {e}")
        return 2
    products = [p for c in feed.get("categories", []) for p in c.get("products", [])]
    photos_by_name: dict[str, set[str]] = {}
    for p in products:
        photos_by_name.setdefault(ic.norm_name(p["name"]), set()).add(p.get("image") or "")

    rows: dict[str, tuple[str, str]] = {}
    matched: list[tuple[str, str]] = []
    seen: set[str] = set()
    for p in products:
        key = ic.norm_name(p["name"])
        cands = by_norm.get(key, [])
        photo = p.get("image") or ""
        if not cands or key in seen:
            continue
        seen.add(key)
        if len(photos_by_name[key]) > 1 or len(cands) > 1:
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
            matched.append((it["id"], p["name"]))
            continue
        try:
            fname = ic.store_image(CHAIN, raw)
        except ValueError as e:
            print(f"  skipped {it['id']}: {e}")
            continue
        rows[it["id"]] = (fname, PAGE_URL)
        matched.append((it["id"], p["name"]))

    for item_id, name in matched:
        print(f"  {item_id:40s} {name}")
    print(f"feed: {len(products)} products; published items: {len(items)}; photos attached: {len(matched)}")
    if not args.dry_run:
        ic.write_images_csv(CHAIN, rows)
        for f, ids in ic.suspected_placeholders(rows, 2).items():
            print(f"  shared file {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
