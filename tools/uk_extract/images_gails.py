#!/usr/bin/env python3
"""Item photos for GAIL's Bakery from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_gails.py [--cache DIR] [--dry-run]

Source: https://gails.com/ (the chain's own Shopify shop). Its drink collections list one product per drink, and every
product record (https://gails.com/products/<handle>, also served as JSON by the collection's products.json) carries the
product's title and its photos; the first is the featured photo the product page and its og:image show. Collections read
(each one request): drinks, hot-drinks, autumn26, plant-based, full-menu.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when ALL of these hold:
  1. exactly one product record is titled with the item's name (images_common.norm_name equality) and exactly one
     published item has that name;
  2. the product's own page (https://gails.com/products/<handle>) agrees: its og:title starts with the same title and its
     og:image is the featured photo of the record (same file name);
  3. the featured photo downloads as a real photo (store_image: >= 200 px, a still JPEG/PNG/WebP).
The published items are the drinks of GAIL's drinks guide, and the guide names almost every drink "<drink>, <milk>" ("Flat
White, oat drink", "Small Latte, decaf cow's milk"). The shop's products carry no milk or decaf variant (every product has one
"Default Title" variant; the Flat White page only says that the price excludes "alternative milk add-ons"), so those items
are NOT matched to the plain "Flat White" photo: the product record does not carry their variant. Likewise "Cold Brew" vs the
guide's "Cold Brew - Black", "Hot Chocolate 70%, Dark" vs "70% Dark Hot Chocolate", "Matcha Tea" vs "Small/Regular Matcha Tea"
(held back anyway) and the Sproud drinks get no photo. Only drinks whose guide name is the shop's product title qualify.
A photo file used by two different items is reported (a shared picture is normal only for variants of one product).

Terms and robots (read 2026-10-08):
  * https://gails.com/pages/terms-and-conditions (the "Order T&Cs" / competition terms, also /pages/terms-conditions) has no
    clause about images, photos, copyright or reuse of the site's content (searched: copyright, intellectual property, all
    rights, photograph, photos, trademark, reproduce). Its only related sentence is about a design competition: "participants
    agree that GAIL's Bakery may reproduce, print, and use their design". The order terms say "By accessing our site and
    placing an order you have agreed to be bound by these terms and conditions and our terms of use policy", but no separate
    terms-of-use page is linked or in the sitemap (Shopify's /policies/ pages are disallowed by robots.txt, so not read). The
    footer says "(c) 2026, GAIL's Bakery" (a generic notice, not an express prohibition).
  * robots.txt of gails.com (Shopify default): disallows /admin, /cart, /checkout, /orders, /account, /search,
    /policies/, collection URLs with sort_by or "+" filters and similar; product pages, collection pages, products.json and
    /pages/ are allowed. The photo host cdn.shopify.com disallows only "*/blog-article-remove-faq-utms-*.js" and "/wpm/*.js".
    polite_get checks both with the RFC 9309 matcher on every URL.
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

CHAIN_ID = "gails"
BASE = "https://gails.com"
COLLECTIONS = ["drinks", "hot-drinks", "autumn26", "plant-based", "full-menu"]
JSON_ACCEPT = "application/json,*/*;q=0.8"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-gails")
OG_IMAGE = re.compile(r'<meta property="og:image" content="([^"]+)"')
OG_TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')
FILE_NAME = re.compile(r"/([^/?#]+)(?:\?|#|$)")   # last path segment: the og:image is /cdn/shop/files/<name>, the record /s/files/.../files/<name>


def products(cache: Path) -> dict[str, dict]:
    """{handle: record} from the collections' products.json (one request per collection)."""
    out: dict[str, dict] = {}
    for c in COLLECTIONS:
        raw = polite_get(f"{BASE}/collections/{c}/products.json?limit=250", cache, accept=JSON_ACCEPT)
        for p in json.loads(raw)["products"]:
            out.setdefault(p["handle"], p)
    return out


def featured(rec: dict) -> str:
    """The record's first (featured) photo URL, or ''. products.json lists images as {position, src, ...}."""
    imgs = sorted(rec.get("images") or [], key=lambda i: i.get("position", 0))
    return imgs[0]["src"] if imgs else ""


def file_name(url: str) -> str:
    m = FILE_NAME.search(html.unescape(url))
    return m.group(1) if m else ""


def page_agrees(handle: str, rec: dict, cache: Path) -> str | None:
    """None when the product page agrees with the record, else why it does not."""
    page = polite_get(f"{BASE}/products/{handle}", cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    t = OG_TITLE.search(page)
    img = OG_IMAGE.search(page)
    if not t or norm_name(html.unescape(t.group(1)).split("|")[0]) != norm_name(rec["title"]):
        return f"page title {t.group(1) if t else None!r} differs from the record title {rec['title']!r}"
    if not img or file_name(img.group(1)) != file_name(featured(rec)):
        return "page og:image is not the record's featured photo"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="list the matches; fetch no product page and no photo")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)

    try:
        prods = products(args.cache)
    except Blocked as e:
        print(f"STOP: {e}", file=sys.stderr)
        return 1
    by_title: dict[str, list[str]] = {}
    for h, p in prods.items():
        by_title.setdefault(norm_name(p["title"]), []).append(h)

    matches: dict[str, str] = {}   # item_id -> product handle
    for key, handles in sorted(by_title.items()):
        its = by_name.get(key)
        if not its:
            continue
        if len(handles) != 1 or len(its) != 1:
            print(f"no photo (ambiguous name {key!r}): products {handles}, items {[i['id'] for i in its]}")
            continue
        rec = prods[handles[0]]
        if not featured(rec):
            print(f"no photo (the record has none): {its[0]['id']}")
            continue
        matches[its[0]["id"]] = handles[0]

    print(f"{len(prods)} products read from {len(COLLECTIONS)} collections; {len(matches)} of {len(items)} published items match a product title exactly")
    for item_id, h in matches.items():
        print(f"  match: {item_id} <- {BASE}/products/{h}")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, h in matches.items():
            rec = prods[h]
            why = page_agrees(h, rec, args.cache)
            if why:
                print(f"no photo: {item_id}: {why}")
                continue
            photo_url = featured(rec)
            if photo_url.startswith("//"):
                photo_url = "https:" + photo_url
            try:
                fname = store_image(CHAIN_ID, polite_get(photo_url, args.cache, referer=f"{BASE}/products/{h}"))
            except ValueError as e:
                print(f"no photo: {item_id}: {e}")
                continue
            rows[item_id] = (fname, f"{BASE}/products/{h}")
    except Blocked as e:
        print(f"STOP: {e} (nothing written)", file=sys.stderr)
        return 1

    for f, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"shared photo {f}: {ids}")
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    return 0


if __name__ == "__main__":
    sys.exit(main())
