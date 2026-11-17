#!/usr/bin/env python3
"""Item photos for Rudy's Pizza Napoletana (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_rudys_pizza_napoletana.py --cache DIR [--dry-run]

Source: Rudy's own click-and-collect ordering site, https://collect.rudyspizza.co.uk (the "Order Click + Collect" / "Click + Collect"
links on every page of https://www.rudyspizza.co.uk point to it; it is branded "Rudy's Pizza Napoletana", its footer reads
"©2026 Rudy's Pizza Napoletana. All Rights Reserved." and its only legal link is rudyspizza.co.uk's own privacy policy). It is a
Deliverect storefront, like Dim T's (images_dim_t.py). Its pages load the chain's menu as JSON from the site itself:
    https://collect.rudyspizza.co.uk/api/dbe-proxy/businesses/<business id>/pickup-outlets?salesChannel=webordering     (the pizzerias)
    https://collect.rudyspizza.co.uk/api/dbe-proxy/outlets/<outlet id>/menus?businessId=<id>&orderingMode=pickup&salesChannel=webordering
    https://collect.rudyspizza.co.uk/api/dbe-proxy/outlets/<outlet id>/menu?slug=<menu slug>&salesChannel=webordering
and the outlet's menu page https://collect.rudyspizza.co.uk/pickup/<outlet url> shows each product's `name` above its `photo` (and the
same photo full size in the product's pop-up). The photos are on deliverect-resizer.imgix.net (the storefront's own image host; the file
is the one the chain uploaded to its Deliverect account; the resizer serves it at its original size, 1920 x 1280, checked against the
uploaded original on 2026-11-17). rudyspizza.co.uk's own menu pages are the Ten Kites allergen menu (no dish photos: only Rudy's logo)
and a "Monthly specials" page whose three photos show the same three specials the storefront has.

Every pizzeria's menu is read (the "Rudy's - TEST" outlet is skipped). A product name that carries more than one photo across the
pizzerias, or two different products with the same name (more than one PLU, the chain's own product code), gets no photo. Only `type == "product"` entries count (the "Select 3 Dips"
combos are not used). The meal deals, bundles and drinks are not items of ours.

Match rule (exact, nothing fuzzy). A photo is attached to a published item (data/source/rudys-pizza-napoletana/items.csv minus
holdback.csv) only when the storefront product's name, after the two tidy steps below and nothing else, has the same
images_common.norm_name as the item's name:
  1. A trailing diet marker in brackets, exactly "(V)", "(VE)" or "(VG)", is dropped: "Marinara (VE)" is the Marinara (the Ten Kites
     page prints suitability in its own Vegan / Vegetarian columns, not in the name). Nothing else in brackets is dropped, so
     "Halal Double Pepperoni (No G.Padano)" stays as it is (and matches nothing).
  2. Dips only: an item of ours in the category "Dips" (the Ten Kites page lists "Chilli Honey", "Garlic Aioli"... under the heading DIPS)
     matches a storefront product listed in the storefront's own Dips category whose name is exactly the item's name followed by the
     word "Dip" ("Chilli Honey Dip"). Set DIP_SUFFIX = False to switch this off. "N'Duja Dip" is not our "'Nduja Aioli" (other words),
     "Garlic Bread with Mozzarella" is not our "Garlic Bread" (more words): neither gets a photo.
Everything else needs norm_name equality as it stands. Matches made by step 1 or 2 are printed as such.

Terms: rudyspizza.co.uk publishes no website terms of use (read 2026-11-17: its sitemap https://www.rudyspizza.co.uk/page-sitemap.xml lists
no terms page; the footer links only Privacy Policy, Modern Slavery Statement and Allergen Info; https://www.rudyspizza.co.uk/privacy-policy/,
"VERSION 1.20 - LAST UPDATED 01.11.25", Mission Mars Limited, has no clause on copying content or images). The only notices are the
footers: "© RUDY'S PIZZA LIMITED 2026." (www.rudyspizza.co.uk) and "©2026 Rudy's Pizza Napoletana. All Rights Reserved."
(collect.rudyspizza.co.uk): a copyright notice, no licence. Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2, his
accepted risk).
robots.txt (read 2026-11-17): www.rudyspizza.co.uk disallows only /cms/wp-admin/ (allows admin-ajax.php); collect.rudyspizza.co.uk
disallows only /my-account, /orders and checkout-order-id query strings; deliverect-resizer.imgix.net "allow all" (empty Disallow);
no group names an AI crawler. polite_get checks robots.txt on every URL (RFC 9309) and stops on 401/403/429.

Run of 2026-11-17: 42 pizzerias (Worcester lists no menu), 41 menus, 43 product names, every one with a single photo and a single PLU
across the pizzerias. 23 published items matched (19 by plain norm_name equality, Marinara by step 1, Chilli Honey, Garlic Aioli and
Spicy Alla Vodka by step 2); 2 dropped after looking (DROP_ITEMS); "Truffle + Parmesan Dip" has no photo on the storefront. 21 photos
kept, every one looked at on a contact sheet and at full size: 16 pizzas, the 3 monthly specials, olives, fries, tiramisu and the
Spicy Alla Vodka dip pot; no lettering, figures or stickers on any of them. Not matched (names differ, or held back in holdback.csv):
Calabrese, Caesar Salad and "Goat's Cheese + Walnut Salad" (held back), "Garlic Bread with Mozzarella", "N'Duja Dip",
"Halal Double Pepperoni (No G.Padano)", meal deals and drinks (not items of ours).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402

CHAIN = "rudys-pizza-napoletana"
SITE = "https://collect.rudyspizza.co.uk"
API = SITE + "/api/dbe-proxy"
BUSINESS_ID = "9e6debaf-aeed-4e8c-a62d-9a35202da4da"   # the storefront's own business id (in its page data and image paths)
PHOTO_HOST = "https://deliverect-resizer.imgix.net/"
JSON_ACCEPT = "application/json"
DIET_MARKER = re.compile(r"\s*\((?:V|VE|VG)\)\s*$")
DIP_SUFFIX = True
# Looked at on contact sheets (2026-11-17) and left without a photo, so a rerun can't bring them back: {item id: why}.
DROP_ITEMS: dict[str, str] = {
    # the dip pot's lid prints an ingredients list and a "MAY CONTAIN" allergen list (readable at full size) that differs from the
    # allergen page we publish (lid: may contain celery, mustard, sulphites, eggs, sesame, milk, soya, nuts, cereals containing gluten;
    # page: contains sulphites, may contain eggs, milk, soya / contains eggs, may contain celery, mustard): it could contradict our table
    "chilli-honey": "the pot's lid prints an ingredients and 'MAY CONTAIN' allergen list that differs from the allergen page we publish",
    "garlic-aioli": "the pot's lid prints an ingredients and 'MAY CONTAIN' allergen list that differs from the allergen page we publish",
}


def storefront_products(cache: Path) -> dict[str, dict]:
    """{storefront name: {"photos": set of photo URLs, "outlet": first outlet url listing it, "photo": that outlet's photo URL,
    "cats": set of category names}} over every pizzeria's every menu. Raises ic.Blocked on a refusal."""
    outlets = json.loads(ic.polite_get(f"{API}/businesses/{BUSINESS_ID}/pickup-outlets?salesChannel=webordering&page=1&limit=100",
                                       cache, referer=SITE + "/locations", accept=JSON_ACCEPT))["data"]
    outlets = sorted((o for o in outlets if "test" not in (o.get("name", "") + o.get("url", "")).lower()), key=lambda o: o["url"])
    if len(outlets) < 30:
        raise SystemExit(f"only {len(outlets)} pizzerias listed: the storefront has changed shape, re-check by hand")
    products: dict[str, dict] = {}
    n_menus = 0
    for o in outlets:
        page = f"{SITE}/pickup/{o['url']}"
        menus = json.loads(ic.polite_get(f"{API}/outlets/{o['outletId']}/menus?businessId={BUSINESS_ID}&orderingMode=pickup"
                                         f"&salesChannel=webordering", cache, referer=page, accept=JSON_ACCEPT))["data"]
        for m in menus:
            menu = json.loads(ic.polite_get(f"{API}/outlets/{o['outletId']}/menu?slug={m['slug']}&salesChannel=webordering",
                                            cache, referer=page, accept=JSON_ACCEPT))
            n_menus += 1
            for cat in menu.get("categories", []):
                for p in cat.get("items", []):
                    if p.get("type") != "product":
                        continue
                    rec = products.setdefault(p["name"], {"photos": set(), "outlet": o["url"], "photo": p.get("photo") or "",
                                                          "cats": set(), "plus": set()})
                    rec["photos"].add(_photo_key(p.get("photo") or ""))
                    rec["cats"].add(cat.get("name", ""))
                    rec["plus"].add(p.get("plu"))
    print(f"{len(outlets)} pizzerias, {n_menus} menus, {len(products)} product names on {SITE}")
    return products


def _photo_key(url: str) -> str:
    """The uploaded file a resizer URL serves (its last path part, base64 of the original address): the same photo gets the same key
    at every pizzeria even though each page signs its resizer URL differently."""
    return url.split("?")[0].rsplit("/", 1)[-1] if url else ""


def match_keys(name: str, cats: set[str]) -> list[tuple[str, str]]:
    """(norm_name key, how) pairs a storefront product may match under the rule in the docstring."""
    keys = [(ic.norm_name(name), "exact")]
    tidy = DIET_MARKER.sub("", name)
    if tidy != name:
        keys.append((ic.norm_name(tidy), f"diet marker dropped from {name!r}"))
    if DIP_SUFFIX and any("dips" in ic.norm_name(c).split() for c in cats) and ic.norm_name(tidy).endswith(" dip"):
        keys.append(("DIPS:" + ic.norm_name(tidy)[: -len(" dip")], f"dip: {name!r}"))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)
        if it["category"] == "Dips":
            by_key.setdefault("DIPS:" + ic.norm_name(it["name"]), []).append(it)

    try:
        products = storefront_products(args.cache)
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    # item id -> list of (storefront name, how, record)
    found: dict[str, list[tuple[str, str, dict]]] = {}
    for name, rec in products.items():
        for key, how in match_keys(name, rec["cats"]):
            for it in by_key.get(key, []):
                found.setdefault(it["id"], []).append((name, how, rec))

    skipped: list[str] = []
    chosen: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, note)
    for it in items:
        iid = it["id"]
        cands = found.get(iid, [])
        if not cands:
            continue
        if len(by_key.get(ic.norm_name(it["name"]), [])) > 1:
            skipped.append(f"{iid}: two published items share this name")
            continue
        if iid in DROP_ITEMS:
            skipped.append(f"{iid}: dropped after looking: {DROP_ITEMS[iid]}")
            continue
        if len({id(r) for _, _, r in cands}) > 1:
            skipped.append(f"{iid}: more than one storefront product matches ({', '.join(n for n, _, _ in cands)})")
            continue
        name, how, rec = cands[0]
        if len(rec["photos"]) > 1 or len(rec["plus"]) > 1:
            skipped.append(f"{iid}: {name!r} carries {len(rec['photos'])} photos / {len(rec['plus'])} PLU codes across the pizzerias")
            continue
        if not rec["photo"].startswith(PHOTO_HOST):
            skipped.append(f"{iid}: {name!r} has no photo on the storefront's image host")
            continue
        chosen[iid] = (rec["photo"], f"{SITE}/pickup/{rec['outlet']}", "" if how == "exact" else f"   [{how}]")

    rows: dict[str, tuple[str, str]] = {}
    try:
        for iid, (url, page, note) in sorted(chosen.items()):
            if args.dry_run:
                print(f"  {iid:32} <- {page}{note}")
                continue
            raw = ic.polite_get(url, args.cache, referer=page)
            try:
                fname = ic.store_image(CHAIN, raw)
            except ValueError as e:
                skipped.append(f"{iid}: {e}")
                continue
            rows[iid] = (fname, page)
            print(f"  {iid:32} {fname}  <- {page}{note}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(chosen)} of {len(items)} published items matched")
        return 0
    ic.write_images_csv(CHAIN, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows, 2).items():
        print(f"  CHECK BY EYE (shared by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
