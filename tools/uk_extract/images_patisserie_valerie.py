#!/usr/bin/env python3
"""Item photos for Patisserie Valerie from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_patisserie_valerie.py [--cache DIR] [--dry-run]

Source: https://patisserie-valerie.co.uk/ (the chain's own Shopify cake shop; the nutrition data came from the five PDFs it
links from /pages/nutritional-and-allergen-information). The site sells whole cakes, gifts and macarons for delivery, not
its cafe menu, so only a handful of published items correspond to a product. The product list is the site's own
sitemap (robots.txt lists it: https://patisserie-valerie.co.uk/sitemap.xml -> sitemap_products_1.xml, whose <image:title> is
the product title); a product's record is https://patisserie-valerie.co.uk/products/<handle>.json (its title, its "Size"
option, its variants and the photo each variant points at).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when ALL of these hold:
  1. the item's name is a size prefix plus a product title: `8" Carrot Cake` = `8"` + the product titled `Carrot Cake`
     (images_common.norm_name equality of the rest of the name with the product's title in the sitemap, and exactly one
     product with that title);
  2. that product's record has a "Size" variant that starts with the same number of inches (`8" (14 Portions)`), so the
     same product record carries both the photo and the item's size;
  3. the photo is the one the record ties to that variant (variant -> image) or, when the variant has no photo of its own,
     the product's first (featured) photo.
Items whose names the site spells differently ("6" Blackforest Gateau" vs the site's "Black Forest Gateau", "8" Raspberry
Ripple" vs "Ultimate Raspberry Ripple Cake", "6" Pistachio & Raspberry Cake" vs "Pistachio and Raspberry Delight Cake",
"6" Lotus Cake" vs "Vegan Biscoff Cake", "8" Oreo Cake" vs "Cookies & Cream Cake", "Dubai 6-inch" vs "Dubai-Style Chocolate
Cake", "8" Strawberry Gateau (with nuts)" vs "Classic Strawberry Gateau") get no photo, and neither do the cafe
slices, macarons (the shop's "Individual Macarons" is one product with a flavour variant, not an item with the cafe's
name), tarts, eclairs, pastries, brunch, main dishes and drinks: the shop does not sell them under those names.
A photo that is a staged lifestyle scene or looks generated rather than photographed is checked by eye and listed in
SKIP_IMAGE_IDS below (the Carrot Cake's only candidate is one, so `8" Carrot Cake` gets no photo).

Terms and robots (read 2026-10-08):
  * Terms of service: https://patisserie-valerie.co.uk/policies/terms-of-service. robots.txt ("User-agent: *") says
    "Disallow: /policies/" so it was NOT fetched (we never work round robots.txt); the site's footer reads "(c) 2026
    Patisserie Valerie" only, and the /pages/ pages searched (faqs, cookie-policy, customer-enquiries, cake club terms)
    have no clause about images or content reuse.
  * robots.txt of patisserie-valerie.co.uk: disallows /policies/, /search, /cart, /checkout, /account, /collections/*sort_by*
    and filter combinations, /*?page=, /cdn/wpm/*.js and a few others; /products/, /sitemap*.xml and /cdn/shop/ are allowed.
    cdn.shopify.com (where the photos are hosted) disallows only */blog-article-remove-faq-utms-*.js and /wpm/*.js.
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "patisserie-valerie"
BASE = "https://patisserie-valerie.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-patisserie-valerie")
SIZE_PREFIX = re.compile(r'^\s*(\d+)\s*(?:"|”|″)\s*(.+)$')
# Photo ids (Shopify image ids) looked at by eye (2026-10-08) and left out. 82450319016314 is the Carrot Cake's featured photo: a
# glossy staged kitchen scene (carrot-shaped sweets in a gold dish, cinnamon sticks) with the hallmarks of a generated image
# (renamed file "carrot-cake-3539654.jpg", 1536x2048, uploaded 2026-01), so it is not used; the other three Carrot Cake photos
# are lifestyle/overhead shots of the same kind. The chocolate cake's variant photo (uploaded 2024-05) looks like a real photo.
SKIP_IMAGE_IDS: set[int] = {82450319016314}


def product_titles(cache: Path) -> dict[str, list[tuple[str, str]]]:
    """norm_name(title) -> [(handle, title)] from the site's own product sitemap."""
    index = polite_get(f"{BASE}/sitemap.xml", cache, accept=HTML_ACCEPT).decode("utf-8")
    m = re.search(r"<loc>(https://patisserie-valerie\.co\.uk/sitemap_products_1\.xml[^<]*)</loc>", index)
    if not m:
        raise SystemExit("product sitemap not found in sitemap.xml")
    xml = polite_get(html.unescape(m.group(1)), cache, accept=HTML_ACCEPT).decode("utf-8")
    out: dict[str, list[tuple[str, str]]] = {}
    for block in re.findall(r"<url>(.*?)</url>", xml, re.S):
        loc = re.search(r"<loc>https://patisserie-valerie\.co\.uk/products/([a-z0-9-]+)</loc>", block)
        title = re.search(r"<image:title>(.*?)</image:title>", block, re.S)
        if loc and title:
            t = html.unescape(title.group(1))
            out.setdefault(norm_name(t), []).append((loc.group(1), t))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    cache: Path = args.cache

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)
    try:
        titles = product_titles(cache)
        rows: dict[str, tuple[str, str]] = {}
        for it in items:
            m = SIZE_PREFIX.match(it["name"])
            if not m or len(by_name[norm_name(it["name"])]) != 1:
                continue
            inches, rest = m.group(1), m.group(2)
            hits = titles.get(norm_name(rest), [])
            if len(hits) != 1:
                continue
            handle, title = hits[0]
            rec = json.loads(polite_get(f"{BASE}/products/{handle}.json", cache, accept="application/json").decode("utf-8"))["product"]
            if norm_name(rec["title"]) != norm_name(rest):
                continue
            size_opt = next((i for i, o in enumerate(rec["options"], 1) if o["name"].lower() == "size"), None)
            if size_opt is None:
                continue
            variants = [v for v in rec["variants"] if re.match(rf'^{inches}\s*"', v[f"option{size_opt}"] or "")
                        and "old" not in (v[f"option{size_opt}"] or "").lower()]
            if len(variants) != 1:
                print(f"  skip {it['name']!r}: {len(variants)} {inches}\" variants on {handle}")
                continue
            var = variants[0]
            images = sorted(rec["images"], key=lambda i: i["position"])
            img = next((i for i in images if i["id"] == var.get("image_id")), None)
            how = "variant photo"
            if img is None:
                img = images[0]
                how = "featured photo"
            if img["id"] in SKIP_IMAGE_IDS:
                print(f"  skip {it['name']!r}: photo {img['id']} is not the cake itself")
                continue
            print(f"  MATCH {it['id']}: {it['name']!r} = {inches}\" + product {title!r} ({handle}); {how} {img['id']}: {img.get('alt')}")
            if args.dry_run:
                continue
            fname = store_image(CHAIN_ID, polite_get(img["src"], cache))
            rows[it["id"]] = (fname, f"{BASE}/products/{handle}")
    except Blocked as e:
        print(f"BLOCKED: {e}")
        return 1
    print(f"{len(rows)} of {len(items)} published items have a photo")
    if args.dry_run:
        return 0
    write_images_csv(CHAIN_ID, rows)
    for f, ids in suspected_placeholders(rows).items():
        print(f"  shared photo {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
