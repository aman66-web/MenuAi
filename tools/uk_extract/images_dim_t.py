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
holdback.csv) only when the feed's `name` and the item's whole name are equal under images_common.norm_name (case, accents,
punctuation, '&'/'and' and spacing ignored; words are never dropped, reordered or approximated), either as printed or after
taking off ONE of the storefront's own fixed labels at the very start of the name, exactly as printed with its " - ":
"NEW - ", "NEW SPECIALITY - " (promotional tags) and "FISH - ", "VEG - ", "MEAT - " (the dim sum menu's filling groups). These
labels are the storefront's section and "new" markers, not part of the dish's name: "FISH - Prawn dim sum" is the record of
"Prawn dim sum". Nothing else is taken off ("BUNS - Char siu pork" is not "Char siu pork buns": a reorder, so no photo), and
"Yakisoba chicken" / "Bibimbap beef" / "Passion fruit ... cheesecake" / "Panang chicken curry" / "Rendang curry" /
"Chicken teriyaki dim sum" are spelt, split or ordered differently from our dishes ("Yaki soba chicken", "Bi bim bap - beef",
"Passionfruit ...", "Penang curry chicken", "Rendang beef", "Teriyaki chicken dim sum"), so they get none.
Further guards: the storefront's printed `calories` must equal ours exactly (a veto only, never a way to match: a same-name dish
whose calories differ may be a reworked recipe), a name printed twice in the feed (as printed or after the label), a name
shared by two published items, a dish without a photo, "variant" entries (choice-of-protein dishes) and anything in EXCLUDE get
none. Variants were checked on 2026-11-17: the page's own item record (GET /api/dbe-proxy/items/<id>, loaded when a variant
dish is opened) lists its options ("Tom yum with rice noodles - Chicken", "- Prawn", "- Tofu") each with its own calories and
NO photo of its own, so the family's one photo is never spread over our per-protein rows.
Every kept photo is looked at on a contact sheet (photo_sheet.py); a bad one goes in EXCLUDE so a rerun can't bring it back.

Terms (https://dimt.co.uk/terms-conditions/, read 2026-10-08 and again 2026-11-17, unchanged): "This website contains material which is owned by or licensed
to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
prohibited other than in accordance with the copyright notice, which forms part of these terms and conditions." (No separate
copyright notice is published; images are not named.) The ordering storefront shows no terms of its own. Installed on the
founder's decision of 2026-10-06 (CLAUDE.md rule 2: the founder's accepted risk).
robots.txt (read 2026-10-08 and again 2026-11-17, unchanged): dimt.co.uk disallows only /wp-admin/ and a few old offer pages; dim-t.deliverectdirect.com
disallows only /my-account, /orders and checkout-order-id query strings; deliverect-resizer.imgix.net allows everything
("User-agent: * / Disallow:"). No group names an AI crawler. https://dimt.co.uk/take-away/ still links the three pickup storefronts
(hampstead, whiteley, winchester) on 2026-11-17.

Runs: 2026-10-08, 20 photos (exact names only). 2026-11-17, with the fixed labels above: see images.csv.
"""
from __future__ import annotations

import argparse
import base64
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
# The storefront's own fixed labels at the start of a name (see the docstring). Longest first, so "NEW SPECIALITY - " wins over "NEW - ".
LABELS = ("NEW SPECIALITY - ", "NEW - ", "FISH - ", "VEG - ", "MEAT - ")


def keys_for(feed_name: str) -> list[str]:
    """The name as printed, and (if it starts with one of LABELS, exactly) the name with that one label taken off."""
    out = [ic.norm_name(feed_name)]
    for label in LABELS:
        if feed_name.startswith(label):
            out.append(ic.norm_name(feed_name[len(label):]))
            break
    return out


def source_file(photo: str) -> str:
    """The file name the chain uploaded (the imgix path's last part is the original address, base64): printed for a look."""
    try:
        tail = photo.rsplit("/", 1)[1]
        return base64.urlsafe_b64decode(tail + "=" * (-len(tail) % 4)).decode("utf-8", "replace").rsplit("/", 1)[-1]
    except Exception:
        return "?"


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
        for k in set(keys_for(p["name"])):
            count[k] = count.get(k, 0) + 1

    rows: dict[str, tuple[str, str]] = {}
    matched: list[tuple[str, str, object, object, str]] = []
    for p in products:
        hits = [(k, by_norm[k]) for k in keys_for(p["name"]) if k in by_norm]
        if not hits:
            continue
        if len(hits) > 1:
            print(f"  name matches two of our dishes, no photo: {p['name']!r}")
            continue
        key, cands = hits[0]
        photo = p.get("photo") or ""
        if count[key] > 1 or len(cands) > 1:
            print(f"  ambiguous name, no photo: {p['name']!r}")
            continue
        it = cands[0]
        if it["id"] in EXCLUDE or not photo.startswith(PHOTO_HOST):
            continue
        if str(it.get("calories")) != str(p.get("calories")):
            print(f"  calories differ, no photo: {it['id']} ours {it.get('calories')} / storefront {p.get('calories')} ({p['name']!r})")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=PAGE_URL)
        except ic.Blocked as e:
            print(f"BLOCKED: {e}")
            return 2
        if args.dry_run:
            matched.append((it["id"], p["name"], it.get("calories"), p.get("calories"), source_file(photo)))
            continue
        try:
            fname = ic.store_image(CHAIN, raw)
        except ValueError as e:
            print(f"  skipped {it['id']}: {e}")
            continue
        rows[it["id"]] = (fname, PAGE_URL)
        matched.append((it["id"], p["name"], it.get("calories"), p.get("calories"), source_file(photo)))

    for item_id, name, ours, theirs, src in matched:
        print(f"  {item_id:38s} {name:45s} {ours}/{theirs} kcal  {src}")
    print(f"feed: {len(products)} products; published items: {len(items)}; photos attached: {len(matched)}")
    if not args.dry_run:
        ic.write_images_csv(CHAIN, rows)
        for f, ids in ic.suspected_placeholders(rows, 2).items():
            print(f"  shared file {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
