#!/usr/bin/env python3
"""Item photos for The Sushi Co from its own ordering website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_the_sushi_co.py --cache DIR [--dry-run]

Source: the chain's own online ordering site https://orders.thesushico.com/, which the chain's home page https://thesushico.com/ links as
"Order online" (header and footer). Its sitemap https://orders.thesushico.com/sitemap.xml lists
https://orders.thesushico.com/sitemap-products.xml: one URL per product, https://orders.thesushico.com/menu/<category>/<product> (128 on
2026-11-17). Each product page is served as HTML with a schema.org JSON-LD block (`"@type":"Product"`) that names the product, gives its
description and its one photo ("image": ["https://assets.andromedapos.com/<id>/<n>/default?format=webp&height=1200"]); the page's own
og:image is the same file. assets.andromedapos.com is the image host of the ordering platform the chain uses (Andromeda: the
footers of both sites read "Powered by" beside the Andromeda logo); the file is the chain's own picture of that product as its own page shows it. Nothing else is
requested besides the sitemap, the product pages and those photo files. (The marketing site thesushico.com shows promotional banners only,
and the counter-menu PDF that items.csv was read from has no per-dish photos.)

Match rule (exact, nothing fuzzy). A photo goes on a published item only when its product page's JSON-LD Product name
  1. has the same norm_name as the item's name ("KAPPA MAKI" -> Kappa Maki), or
  2. ends in a piece count ("SALMON TATAKI (5 Pcs)", "FAMILY PLATTER (54 pcs)") and, without that count, has the same norm_name as the
     item's name, AND the count equals the pieces of the item's serving in items.csv ("5 pieces"); the count is the serving, not a word of
     the name, and a different count is a different product size,
and exactly one product page carries that name, the page has a photo in its JSON-LD, and, where the page's description states a piece count
("5 pieces of ..."), that count also equals the item's serving. Words are never dropped, added or reordered beyond the trailing piece count:
the ordering site calls several dishes differently from the counter menu ("CHICKEN KATSU CURRY WITH RICE" for the menu's Katsu Curry
(chicken), "CHICKEN KATSU BAO" for Chicken Katsu Bao Buns, "CHICKEN KATSU SANDO" for Chicken Katsu Sandos, "EGG STIR FRIED RICE" for Stir
Fried Rice (egg)), and those items get no photo. The row's source_url is the product page.

robots.txt (read 2026-11-17): https://orders.thesushico.com/robots.txt is `User-agent: *` `Allow: /` (and the same Allow: / for named AI
crawlers, ClaudeBot included); https://assets.andromedapos.com/robots.txt answers 404 (no rules, RFC 9309); https://thesushico.com/robots.txt
disallows only /wp-admin/. polite_get checks robots.txt on every URL (RFC 9309).

Terms (https://thesushico.com/terms-of-service/, undated, read 2026-11-17), SECTION 2 - GENERAL CONDITIONS: "You agree not to reproduce,
duplicate, copy, sell, resell or exploit any portion of the Service, use of the Service, or access to the Service or any contact on the website
through which the Service is provided, without express written permission by us." and SECTION 12 - PROHIBITED USES: "you are prohibited from
using the site or its content: ... (i) to spam, phish, pharm, pretext, spider, crawl, or scrape". An express restriction; installed on the
founder's decision of 2026-10-06 (his accepted risk). The ordering site's own page https://orders.thesushico.com/terms-and-conditions draws its
text with a script (the HTML holds only "Getting things ready..."), so it was not read.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: 128 of 128 product pages answered with a JSON-LD Product and a photo; 69 of the 89 published items matched (rule 1 or 2),
four of those were dropped after looking (DROP_ITEMS), so 65 have a photo. The other 20 items get no photo because the ordering site names
them differently from the counter menu: "SMOKED SALMON FUTUMAKI" (Smoked Salmon Futomaki), the four "... BAO" (Bao Buns), the three "... SANDO"
(Sandos), the katsu curries, stir-fried rice, yakisoba and yaki udon written "<filling> <dish>" ("CHICKEN - YAKISOBA NOODLES" for Yakisoba
Noodles (chicken)), "EDAMAME SALAD" (Edamame), "SEAWEED" (Seaweed Salad), "EDAMAME SPRING ROLL" (Edamame Spring Rolls).
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "the-sushi-co"
HOST = "https://orders.thesushico.com"
SITEMAP = f"{HOST}/sitemap-products.xml"
PHOTO_HOST = "https://assets.andromedapos.com/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-the-sushi-co")
# item id -> why it was looked at on the contact sheets and left without a photo (a rerun must not bring it back)
# Looked at 2026-11-17 (contact sheets of all 69 matched photos, plus crops of every corner): four pictures carry a promotional sticker in the
# top-left corner, a red-and-black "fight" badge from a campaign, not part of the food. Left out like any other sticker.
DROP_ITEMS: dict[str, str] = {
    "crispy-crunch": "the picture carries a promotional badge (black octagon with the kanji '戦' in a red ring) in its top-left corner",
    "maki-mix": "the picture carries a promotional badge (black circle with 'VS' in a red ring) in its top-left corner",
    "nigiri-and-sashimi-super-box": "the picture carries a promotional badge (red brush-stroke 'SF' lettering) in its top-left corner",
    "shake-yaki-salmon-nigiri": "the picture carries a promotional badge (red round fist emblem) in its top-left corner",
}

LOC = re.compile(r"<loc>\s*(https://orders\.thesushico\.com/menu/[^<\s]+)\s*</loc>")
LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
TRAILING_COUNT = re.compile(r"^(?P<name>.*?)\s*\(?\s*(?P<n>\d+)\s*(?:pcs?|pieces?)\s*\)?\s*$", re.I)
SERVING_PIECES = re.compile(r"^(\d+) pieces$")
DESC_COUNT = re.compile(r"\b(\d+)\s*(?:pcs?|pieces?)\b", re.I)


def product_record(page: str, url: str) -> dict | None:
    """The page's JSON-LD Product (name, image, description), or None when the page carries none."""
    for block in LD.findall(page):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        for node in data.get("@graph", [data]) if isinstance(data, dict) else []:
            if isinstance(node, dict) and node.get("@type") == "Product":
                imgs = node.get("image") or []
                if isinstance(imgs, str):
                    imgs = [imgs]
                return {
                    "url": url,
                    "name": htmllib.unescape(str(node.get("name", ""))).strip(),
                    "desc": htmllib.unescape(str(node.get("description", ""))).strip(),
                    "images": [htmllib.unescape(i) for i in imgs if isinstance(i, str)],
                }
    return None


def name_keys(name: str) -> list[tuple[str, int | None]]:
    """(norm_name, piece count) keys a product name can match under rules 1 and 2."""
    keys = [(norm_name(name), None)]
    m = TRAILING_COUNT.match(name)
    if m and m.group("name").strip():
        keys.append((norm_name(m.group("name")), int(m.group("n"))))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, dict] = {}
    try:
        sitemap = polite_get(SITEMAP, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        urls = sorted(set(LOC.findall(sitemap)))
        if not urls:
            raise SystemExit("sitemap-products.xml lists no product pages: the site has changed shape")
        records: list[dict] = []
        for url in urls:
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            rec = product_record(page, url)
            if rec is None or not rec["name"]:
                skipped.append(f"(page) {url}: no JSON-LD Product on the page")
                continue
            records.append(rec)
        print(f"{len(records)} product pages with a JSON-LD Product (of {len(urls)} in {SITEMAP})")

        by_key: dict[str, list[tuple[dict, int | None]]] = {}
        for rec in records:
            for key, count in name_keys(rec["name"]):
                by_key.setdefault(key, []).append((rec, count))

        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            sp = SERVING_PIECES.match(it.get("serving", "").strip())
            pieces = int(sp.group(1)) if sp else None
            cands = by_key.get(norm_name(it["name"]), [])
            ok = [(rec, c) for rec, c in cands if c is None or (pieces is not None and c == pieces)]
            pages = {rec["url"] for rec, _ in ok}
            if not cands:
                skipped.append(f"{it['id']}: no product page carries the name {it['name']!r}")
                continue
            if not ok:
                skipped.append(f"{it['id']}: the page's piece count {[c for _, c in cands]} is not the item's serving {it.get('serving')!r}")
                continue
            if len(pages) != 1:
                skipped.append(f"{it['id']}: {len(pages)} product pages carry the name {it['name']!r}: {sorted(pages)}")
                continue
            rec = ok[0][0]
            desc_counts = {int(n) for n in DESC_COUNT.findall(rec["desc"])}
            if desc_counts and (pieces is None or desc_counts != {pieces}):
                skipped.append(f"{it['id']}: the page's description states {sorted(desc_counts)} pieces, the item's serving is {it.get('serving')!r}")
                continue
            photos = [u for u in rec["images"] if u.startswith(PHOTO_HOST)]
            if not photos:
                skipped.append(f"{it['id']}: the page {rec['url']} has no photo on {PHOTO_HOST}")
                continue
            matched[it["id"]] = {**rec, "photo": photos[0]}

        for item_id, rec in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:36} <- {rec['name']!r}  {rec['photo'].split('?')[0].rsplit('/', 3)[-3]}  {rec['url']}")
                continue
            raw = polite_get(rec["photo"], args.cache, referer=rec["url"])
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {rec['photo']}: {e}")
                continue
            rows[item_id] = (fname, rec["url"])
            print(f"  {item_id:36} {fname}  <- {rec['name']!r}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
