#!/usr/bin/env python3
"""Attach Pret A Manger UK's own product photos to the published items of data/source/pret/ (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_pret.py --cache /tmp/img-pret

Where the photos come from: the data Pret's own category pages load (the same feed tools/uk_extract/pret_feed.py reads for the
nutrition numbers): https://www.pret.co.uk/_next/data/<buildId>/en-GB/products/categories/<slug>.json. Each product record there
carries its name, its SKU and one `image` (a 1080 px photo on Pret's own Contentful asset host, images.ctfassets.net, which the
product pages themselves load). robots.txt of www.pret.co.uk only disallows /fr-FR, /zh-HK, /en-HK and /en-US; images.ctfassets.net
has no robots.txt (404). Fetching goes through images_common.polite_get (one request per second per host, browser User-Agent).

Matching is exact, never fuzzy:
  * a published item gets a photo only when the product record's name, written the way pret.py writes item names, is the same as
    the item's name under norm_name (case, accents, punctuation and "&"/"and" ignored; no word dropped or reordered);
  * a drink item such as "Latte (oat milk)" is a variant of ONE product record that carries both the photo and the variant, so it
    uses that record's photo (variants have no photo of their own in the feed);
  * if two product records give the same item name, or two published items share a name, nobody gets a photo;
  * a product record without an image gets none.
Nothing is cropped, recoloured or retouched: images_common.store_image only downsizes to 640 px and converts to WebP.
`source_url` is the product's own page on pret.co.uk (https://www.pret.co.uk/en-GB/products/<SKU>/<name-slug>).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
import pret  # noqa: E402  (item naming rules: tidy(), slug(), variant_label())
import pret_feed  # noqa: E402

CHAIN = "pret"
BASE = pret_feed.BASE

# Product records whose photo was looked at (2026-10-06) and judged not to be a true photo of that item, so they get none:
#  * the photo carries a "New recipe than ever" promo badge (a stale claim we must not keep showing): Pret's own file names start
#    "New_recipe" (the script also refuses any image file named that way, for the next run);
#  * the record reuses the photo of a different drink (its file is named for another product).
# Soup / side-soup pairs sharing one photo are kept: same soup in a different size.
DROP_SKUS = {
    "UK006220": "photo has a 'New recipe' badge and is named 'Cream of Tomato Half Half'",     # Souper Tomato
    "UK006550": "photo has a 'New recipe' badge and is named 'Cream of Tomato Half Half'",     # Souper Tomato Side Soup
    "UK020979": "photo has a 'New recipe' badge",                                               # Chicken & Edamame Protein Pot
    "UK021543": "photo has a 'New recipe' badge",                                               # Raspberry & White Chocolate Cookie
    "UK000602": "photo file is Pret's Hazelnut Frappe picture, reused for this flavour",         # Caramel Frappe
    "UK005804": "photo file is Pret's Mocha Frappe picture, reused for this drink",              # Frozen Hot Chocolate
}
ENTRY = pret_feed.ENTRY_PAGE


def product_slug(name: str) -> str:
    """The URL slug Pret's own links use after the SKU: lower-case, words joined by hyphens, "&" written as "and"
    (checked against every product link on the hot-food and sandwiches category pages)."""
    return pret.slug(name.replace("&", " and "))


def feed_products(cache: Path) -> list[dict]:
    """Unique product records (by id) from the category feeds, fetched politely and cached."""
    html = ic.polite_get(ENTRY, cache, accept="text/html,application/xhtml+xml").decode("utf-8", "replace")
    m = re.search(r'"buildId":"([^"]+)"', html)
    if not m:
        raise SystemExit("Could not find the site's buildId: the site changed, re-check by hand.")
    build_id = m.group(1)
    found: dict[str, dict] = {}
    for slug in pret_feed.CATEGORY_SLUGS:
        raw = ic.polite_get(f"{BASE}/_next/data/{build_id}/en-GB/products/categories/{slug}.json", cache, accept="application/json")
        pp = json.loads(raw)["pageProps"]
        sc = pp["selectedCategory"]
        groups = [sc.get("products") or []] + [s.get("products") or [] for s in sc.get("subcategories") or []]
        for prods in groups:
            for p in prods:
                found.setdefault(p["id"], p)
    return list(found.values())


def item_names(p: dict) -> list[str]:
    """The item names pret.py would write for this product record (one, or one per drink variant)."""
    name = pret.tidy(p["name"])
    variants = p.get("variants") or []
    if not variants:
        return [name]
    default = [v for v in variants if v.get("defaultVariant")]
    if len(default) != 1:
        return []
    out = []
    for v in variants:
        try:
            milk, caf = pret.variant_label(name, v)
        except SystemExit:
            continue
        default_row = v is default[0]
        if milk is None and not default_row:
            continue
        parts = [x for x in ((None if milk in (None, "black") and default_row else milk), caf) if x]
        out.append(f"{name} ({', '.join(parts)})" if parts else name)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="directory for cached downloads")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_norm: dict[str, list[dict]] = {}
    for it in items:
        by_norm.setdefault(ic.norm_name(it["name"]), []).append(it)

    # norm name -> list of (product record, item name); more than one record for a name means ambiguous.
    owners: dict[str, list[dict]] = {}
    for p in feed_products(args.cache):
        for iname in item_names(p):
            owners.setdefault(ic.norm_name(iname), []).append(p)

    matched: dict[str, tuple[dict, str]] = {}  # item id -> (product, source page)
    skipped: list[tuple[str, str]] = []
    for key, its in by_norm.items():
        if len(its) != 1:
            skipped.extend((i["name"], "two published items share this name") for i in its)
            continue
        it = its[0]
        ps = owners.get(key, [])
        if not ps:
            skipped.append((it["name"], "no product record with this name in Pret's feed"))
            continue
        if len({p["id"] for p in ps}) != 1:
            skipped.append((it["name"], "several product records share this name"))
            continue
        p = ps[0]
        if p["sku"] in DROP_SKUS:
            skipped.append((it["name"], "dropped after looking at the photo: " + DROP_SKUS[p["sku"]]))
            continue
        img = p.get("image") or {}
        src = img.get("src")
        if src and src.rsplit("/", 1)[-1].lower().startswith("new_recipe"):
            skipped.append((it["name"], "photo file is a 'New recipe' promo image"))
            continue
        if not src or min(img.get("width") or 0, img.get("height") or 0) < ic.MIN_SIDE:
            skipped.append((it["name"], "product record has no usable image"))
            continue
        page = f"{BASE}/en-GB/products/{p['sku']}/{product_slug(pret.tidy(p['name']))}"
        matched[it["id"]] = (p, page)

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}  # image url -> stored file name
    for item_id in sorted(matched):
        p, page = matched[item_id]
        url = "https:" + p["image"]["src"] if p["image"]["src"].startswith("//") else p["image"]["src"]
        if url not in stored:
            try:
                raw = ic.polite_get(url, args.cache / "photos", referer=BASE + "/")
                stored[url] = ic.store_image(CHAIN, raw)
            except ic.Blocked as e:
                print(f"BLOCKED: {e}: stopping, reporting, not working round it.", file=sys.stderr)
                return 2
            except ValueError as e:
                skipped.append((item_id, f"image rejected: {e}"))
                stored[url] = ""
        if stored[url]:
            rows[item_id] = (stored[url], page)

    ic.write_images_csv(CHAIN, rows)
    print(f"items with a photo: {len(rows)} / {len(items)} published")
    print(f"distinct photo files: {len({f for f, _ in rows.values()})}")
    for fname, ids in sorted(ic.suspected_placeholders(rows).items()):
        print(f"  shared by {len(ids)} items: {fname}: {', '.join(ids[:6])}{' ...' if len(ids) > 6 else ''}")
    if skipped:
        print(f"without a photo ({len(skipped)}):")
        for n, why in skipped:
            print(f"  {n}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
