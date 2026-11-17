#!/usr/bin/env python3
"""Item photos for Comptoir Libanais (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_comptoir_libanais.py --cache DIR [--dry-run]

Source: Comptoir Libanais's own click-and-collect ordering site. The "Click and Collect" link on https://www.comptoirlibanais.com/
goes to https://order.storekit.com/stores/comptoir-libanais, which lists the chain's restaurants (the page loads
https://order.storekit.com/api/store-group/comptoir-libanais and then
https://order.storekit.com/api/store-group/<group id>/stores?fulfillmentMethod=Pickup: 18 venues on 2026-11-17). Each restaurant opens its
own branded menu page, https://order.storekit.com/<venue slug> (the chain's name, logo and colours, its allergen PDF linked), which loads
the venue record https://order.storekit.com/api/venues/<venue slug> and then the menu feed of the FIRST menu that record lists,
    https://order.storekit.com/api/categories/<menu id>?showAll=false&lang=en
(the page's own code: `getMenuCategories({id: venue.menu[0].id})`), whose `categories[].products[]` hold each dish's printed `name` and
`image` (the file the chain uploaded to its Uploadcare store, ucarecdn.com). Each tile on the page is that photo next to that name.
The venue record lists two to four further menus of the same venue (same chain account, same Uploadcare store) that the page does not
open by default; their feeds are read too, as a second source, after every venue's opening menu.

Order (the first source that names a dish with a photo wins, so reruns are stable and the photos kept from 2026-10-08 stay):
  1. each venue's opening menu, Gloucester Road first (the source of the 2026-10-08 run), then the other venues by slug;
     source_url = the venue's page, which shows that photo for that dish;
  2. each venue's other listed menus, same venue order, in the order the venue record lists them; source_url = that menu's feed URL
     (the chain's own ordering-site record that carries the dish's name and photo; the page does not open that menu by default).
www.comptoirlibanais.com's own menus page (re-read 2026-11-17) shows an allergen PDF (now Comptoir_AllergenMenu_Autumn2026_v01.pdf) and
four lifestyle photos, no per-dish photos.

Match rule (exact, nothing fuzzy): a photo is attached to a published item (data/source/comptoir-libanais/items.csv minus holdback.csv)
only when the feed's product `name` and the item's name are equal under images_common.norm_name (case, accents, punctuation, '&'/'and'
and spacing ignored, so Shepherd's Bush's "Mixed Grill-" is "Mixed Grill"; words are never dropped, reordered or approximated, so
"Chicken Shawarma Bowl" does NOT match "Chicken Shawarma Rice Bowl", "Marinated Mixed Olives" does NOT match "Marinated Olives",
"Baklawa Selection" does NOT match "Selection of Baklawa" and "Strawberry Lemonade" does NOT match the item "Strawberry"). Further
guards: within one menu, a name listed twice with DIFFERENT photos gives that menu no photo for it (Fattoush, Tabbouleh and Batata
Harra are listed under Mezze and under Sides with the same file: one photo, kept); a name shared by two published items, a product
without a photo, a photo that is not on ucarecdn.com, and anything in DROP get none. The ordering site has no kids' menu, so a kids'
dish (category "Kids menu") never takes a photo from it: its same-named product is the adult dish (DROP lists the two that collide).

Terms (read 2026-11-17): www.comptoirlibanais.com publishes a privacy policy and gift-card T&Cs but NO website terms of use; its footer says
"© 2026 Comptoir. All rights reserved." (a generic notice, not an express prohibition on copying images). https://comptoirgroup.com/policies
lists a Privacy and Cookie Policy and corporate policy PDFs, no terms of use. The ordering site's venue records say
`customPolicies: {hasPrivacyPolicy: false, hasTermsAndConditions: false}`. Installed on the founder's decision of 2026-10-06
(CLAUDE.md rule 2: the founder's accepted risk). robots.txt (read 2026-11-17): www.comptoirlibanais.com `User-agent: * / Disallow:`
(nothing); order.storekit.com `User-agent: * / Allow: /` (a second group names GPTBot, ClaudeBot and other AI crawlers, also `Allow: /`);
ucarecdn.com has no robots.txt (404 = no rules). polite_get checks robots.txt for every URL (RFC 9309) and stops on 401/403/429.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "comptoir-libanais"
HOST = "https://order.storekit.com"
GROUP_PAGE = f"{HOST}/stores/comptoir-libanais"
GROUP_URL = f"{HOST}/api/store-group/comptoir-libanais"
STORES_URL = HOST + "/api/store-group/{id}/stores?fulfillmentMethod=Pickup"
VENUE_URL = HOST + "/api/venues/{slug}"
MENU_URL = HOST + "/api/categories/{id}?showAll=false&lang=en"
FIRST_VENUE = "comptoir-libanais-gloucester-rd"
PHOTO_HOST = "https://ucarecdn.com/"
JSON_ACCEPT = "application/json"

# Looked at and left out so a rerun can't bring them back.
DROP: dict[str, str] = {
    # 2026-10-08: the chain's photo under this exact name does not clearly show that dish.
    "quinoa": "the photo shows fine, uniform, pale-yellow grains that look like couscous (the feed's 'Steamed Couscous' has its own file)",
    # 2026-10-08 / 2026-11-17: kids' dishes whose names collide with the ordering site's adult wraps.
    "halloumi-wrap": "kids' dish (152 kcal); the ordering site's 'Halloumi Wrap' is the adult wrap (793 kcal), and its photo shows two wraps "
                     "filled with dark sliced meat and red pepper",
    "chicken-wrap": "kids' dish (375 kcal); the ordering site's 'Chicken Wrap' is the adult wrap (532-843 kcal, 'marinated grilled chicken "
                    "breast with garlic sauce, pickled cucumber & tomato')",
}
# 2026-11-17 check: rows for aubergine-tagine, lamb-kofta-burger, mama-zohra-salad, spinach-and-feta-borek and warm-olive-oil-bread were
# removed from images.csv because those items are no longer in items.csv after the Autumn 2026 v01 re-extraction (not wrong photos, so
# not in DROP: load_items() only offers published items, so a rerun cannot bring them back unless the guide names them again).
NO_PHOTO_CATEGORIES = {"Kids menu"}   # the ordering site lists no kids' dishes: any same-named product there is an adult dish


def get_json(url: str, cache: Path, referer: str) -> object:
    return json.loads(ic.polite_get(url, cache, referer=referer, accept=JSON_ACCEPT).decode("utf-8"))


def menu_photos(feed: dict) -> dict[str, set[str]]:
    """norm_name -> the set of photo URLs one menu feed gives that name (more than one = ambiguous in that menu)."""
    out: dict[str, set[str]] = {}
    for c in feed.get("categories", []):
        for p in c.get("products", []):
            out.setdefault(ic.norm_name(p.get("name") or ""), set()).add((p.get("image") or "").strip())
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_norm: dict[str, list[dict]] = {}
    for it in items:
        by_norm.setdefault(ic.norm_name(it["name"]), []).append(it)

    # ---- the sources, in priority order: (label, source_url, feed)
    try:
        group = get_json(GROUP_URL, args.cache, GROUP_PAGE)
        stores = get_json(STORES_URL.format(id=group["id"]), args.cache, GROUP_PAGE)
        slugs = sorted({s["slug"] for s in stores if s.get("slug") and s.get("enabled", True)},
                       key=lambda s: (s != FIRST_VENUE, s))
        venues: list[tuple[str, list[str]]] = []
        for slug in slugs:
            v = get_json(VENUE_URL.format(slug=slug), args.cache, f"{HOST}/{slug}")["venue"]
            venues.append((slug, [m["id"] for m in v.get("menu") or [] if m.get("id")]))
        sources: list[tuple[str, str, str, dict]] = []   # (label, source_url, the venue's page, feed)
        for slug, menus in venues:                       # 1. the menu each venue's page opens with
            if menus:
                feed = get_json(MENU_URL.format(id=menus[0]), args.cache, f"{HOST}/{slug}")
                sources.append((f"{slug} (page)", f"{HOST}/{slug}", f"{HOST}/{slug}", feed))
        seen_menus = {m[0] for _, m in venues if m}
        for slug, menus in venues:                       # 2. the venue's other listed menus
            for mid in menus[1:]:
                if mid in seen_menus:
                    continue
                seen_menus.add(mid)
                url = MENU_URL.format(id=mid)
                sources.append((f"{slug} (menu {mid[:8]})", url, f"{HOST}/{slug}", get_json(url, args.cache, f"{HOST}/{slug}")))
    except ic.Blocked as e:
        print(f"BLOCKED: {e}")
        return 2

    # ---- choose one photo per item: the first source that names it with exactly one ucarecdn photo
    chosen: dict[str, tuple[str, str, str, str]] = {}  # item_id -> (photo url, source_url, venue page, label)
    notes: list[str] = []
    for label, src_url, page, feed in sources:
        for key, photos in menu_photos(feed).items():
            cands = by_norm.get(key, [])
            if not cands:
                continue
            if len(cands) > 1:
                notes.append(f"name shared by {len(cands)} published items, no photo: {key!r}")
                continue
            it = cands[0]
            if it["id"] in chosen or it["id"] in DROP or it["category"] in NO_PHOTO_CATEGORIES:
                continue
            photos = {p for p in photos if p}
            if len(photos) != 1:
                if len(photos) > 1:
                    notes.append(f"{label}: {it['id']} listed with {len(photos)} different photos, skipped in this menu")
                continue
            photo = next(iter(photos))
            if not photo.startswith(PHOTO_HOST):
                continue
            chosen[it["id"]] = (photo, src_url, page, label)

    rows: dict[str, tuple[str, str]] = {}
    for item_id in sorted(chosen):
        photo, src_url, page, label = chosen[item_id]
        if args.dry_run:
            print(f"  {item_id:40s} {label}")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=page)
        except ic.Blocked as e:
            print(f"BLOCKED: {e}")
            return 2
        try:
            fname = ic.store_image(CHAIN, raw)
        except ValueError as e:
            print(f"  skipped {item_id}: {e}")
            continue
        rows[item_id] = (fname, src_url)
        print(f"  {item_id:40s} {fname}  {label}")

    for n in sorted(set(notes)):
        print("  note:", n)
    for item_id, why in DROP.items():
        print(f"  dropped {item_id}: {why}")
    n_products = sum(len(c.get("products", [])) for _, _, _, f in sources for c in f.get("categories", []))
    print(f"sources: {len(sources)} menus ({n_products} product rows); published items: {len(items)}; "
          f"photos {'matched' if args.dry_run else 'attached'}: {len(chosen) if args.dry_run else len(rows)}")
    if not args.dry_run:
        ic.write_images_csv(CHAIN, rows)
        for f, ids in ic.suspected_placeholders(rows, 2).items():
            print(f"  shared file {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
