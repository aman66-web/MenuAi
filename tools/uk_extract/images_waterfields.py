#!/usr/bin/env python3
"""Item photos for Waterfields from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_waterfields.py --cache DIR [--dry-run]

Source: https://www.waterfields-bakers.co.uk/ is the chain's own Shopify shop, the same shop the items were read from
(tools/uk_extract/waterfields.py). Its public product feed https://www.waterfields-bakers.co.uk/products.json?limit=250 carries, for
every product, the same record its product page /products/<handle> shows: "handle", "title" and "images" (the product page's own
photos, on the shop's Shopify file store cdn.shopify.com/s/files/... or www.waterfields-bakers.co.uk/cdn/shop/...). One request for the
feed, then one per photo, cached in --cache so a rerun never fetches twice.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the item's id is the shop's own product handle (waterfields.py uses the handle as the id, so this is the very product record the
     item's figures came from) and that handle is still in the feed,
  2. the product's title has the same norm_name as the item's name (a renamed product gets no photo until the items are re-read),
  3. the photo is the product's featured photo (images[0], position 1: the one its page opens on) and is a file on the shop's own
     Shopify file store (cdn.shopify.com/s/files/ or /cdn/shop/ on the shop's own host), and
  4. it is not listed in DROP_ITEMS (photos looked at on a contact sheet and left out) and is not used by any other matched item
     (one picture on several products is a placeholder or a range shot, not a photo of this product).
source_url is the product's own page, https://www.waterfields-bakers.co.uk/products/<handle>.

robots.txt (https://www.waterfields-bakers.co.uk/robots.txt, read 2026-11-17): a Shopify storefront file with two groups, `User-agent: *` and
`User-agent: adsbot-google`; the `*` group has `Allow: /` and disallows only /admin, cart, checkout(s), orders, account, /62463082750,
/cdn/wpm/*.js, /services, /sf_*, /.well-known/shopify/monorail, /cart.js, /recommendations/products, collection sort/filter traps and a few
query parameters (ls=, oseid=, preview_theme_id=, preview_script_id=). /products.json, /products/<handle> and /cdn/shop/ are allowed. No
group names an AI crawler. Its comment block points shopping agents to agents.md and a UCP endpoint; this script buys nothing and uses
neither. polite_get checks robots.txt on every URL (RFC 9309), including cdn.shopify.com's.

Terms: NOT read on 2026-11-17 (see the run note below). The shop's terms live at /policies/terms-of-service; the logo record
(web/public/logos/waterfields.source.txt, 2026-10-12) says its terms were not read in full either. Photos are installed on the founder's
decision of 2026-10-06 (CLAUDE.md rule 2: accepted risk) whatever the terms say, but the next run must read the terms and quote the clause.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: robots.txt answered (rules above), then the first request for /products.json?limit=250 answered HTTP 429 ("Too Many
Requests"). The run stopped there and the host was not asked again (not worked round: no retry loop, no other path, user agent or headers).
The same happened the same day to the Cornish Bakery photo run on another Shopify shop (images_cornish_bakery.py), so Shopify was most
likely throttling this computer's address while several photo runs fetched Shopify shops at once. Nothing was downloaded, matched or
written. DROP_ITEMS is empty because no photo has been looked at yet: after the first real run, make contact sheets
(tools/uk_extract/photo_sheet.py waterfields --per 36 --cols 6), look at EVERY photo and add each bad one below with the reason
(numbers or nutrition printed on it, "NEW"/offer lettering, a box or multipack instead of the single item, a placeholder, a drawing,
another product), then rerun so images.csv holds only the photos kept.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "waterfields"
HOST = "https://www.waterfields-bakers.co.uk"
FEED = HOST + "/products.json?limit=250"
JSON_ACCEPT = "application/json,text/plain;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-waterfields")
EXPECTED_MIN_PRODUCTS = 20   # 50 on 2026-10-12; far fewer means the feed changed shape or is paged: stop and look
# Looked at on contact sheets and left without a photo; a rerun must not bring them back. {item id: reason}
DROP_ITEMS: dict[str, str] = {}


def photo_ok(src: str) -> bool:
    """The shop's own Shopify file store only (the files its product pages show)."""
    u = urllib.parse.urlsplit(src)
    if u.scheme != "https":
        return False
    if u.netloc == "cdn.shopify.com":
        return u.path.startswith("/s/files/")
    return u.netloc == urllib.parse.urlsplit(HOST).netloc and u.path.startswith("/cdn/shop/")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        feed = json.loads(polite_get(FEED, args.cache, accept=JSON_ACCEPT).decode("utf-8"))
        products = {p["handle"]: p for p in feed.get("products", [])}
        if len(products) < EXPECTED_MIN_PRODUCTS:
            raise SystemExit(f"only {len(products)} products in {FEED}: the feed has changed shape, stop and look")
        print(f"{len(products)} products in {FEED}")

        matched: dict[str, tuple[str, dict]] = {}   # item id -> (photo url, product)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            p = products.get(it["id"])
            if p is None:
                skipped.append(f"{it['id']}: no product with this handle in the feed any more")
                continue
            title = " ".join((p.get("title") or "").split())
            if norm_name(title) != norm_name(it["name"]):
                skipped.append(f"{it['id']}: the product is titled {title!r}, not {it['name']!r}")
                continue
            images = sorted(p.get("images") or [], key=lambda im: im.get("position") or 0)
            if not images:
                skipped.append(f"{it['id']}: the product has no photo")
                continue
            src = images[0].get("src") or ""
            if src.startswith("//"):
                src = "https:" + src
            if not photo_ok(src):
                skipped.append(f"{it['id']}: the featured photo {src!r} is not on the shop's own Shopify file store")
                continue
            matched[it["id"]] = (src, p)

        by_photo: dict[str, list[str]] = {}
        for item_id, (src, _) in matched.items():
            by_photo.setdefault(urllib.parse.urlsplit(src).path, []).append(item_id)
        for path, ids in by_photo.items():
            if len(ids) > 1:
                for item_id in ids:
                    skipped.append(f"{item_id}: its featured photo {path.rsplit('/', 1)[-1]} is also the photo of {', '.join(i for i in ids if i != item_id)}")
                    matched.pop(item_id)

        for item_id, (src, p) in sorted(matched.items()):
            page_url = f"{HOST}/products/{p['handle']}"
            if args.dry_run:
                print(f"  {item_id:32} {urllib.parse.urlsplit(src).path.rsplit('/', 1)[-1]}  <- {p['title']!r}")
                continue
            raw = polite_get(src, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {src}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:32} {fname}  <- {urllib.parse.urlsplit(src).path.rsplit('/', 1)[-1]}")
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
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
