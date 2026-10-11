#!/usr/bin/env python3
"""Item photos for Sushi Shop UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_sushi_shop.py --cache DIR [--dry-run]

Source: the site's own menu data, https://www.mysushishop.co.uk/rollingstart/page-data/en/delivery/maki/page-data.json, the file every
category page of mysushishop.co.uk loads (Gatsby page-data). It carries `listingProducts`: ONE record per product on the site (304), with
the product id, its name and its `pictures` (the one marked `cover: true` is the product's main photo). The product pages themselves
(https://www.mysushishop.co.uk/en/delivery/<category>/<slug>-<id>) are drawn from the same records and name the same picture file
(checked on handroll-mexico-city-4203: picture 15124 in the record and in the page's <img>). The photo files live on the chain's own
image host cf.mysushishop.co.uk (/img2/<picture id>/<w>/<h>/cover/center/auto/auto/<picture id>.jpg); we fetch the site's own 750 x 750
rendition (the stored pictures are square as the chain publishes them; 1920 x 1920 is the same picture larger) and store_image only
downsizes it to <= 640 px WebP.

Match rule (exact, nothing fuzzy). A photo goes on a published item only when
  1. the item's notes in items.csv say "Read from <product page URL>" and that URL ends in the product id, the record with that id
     carries a name whose norm_name equals the item's name, and the record has a cover picture, or
  2. (the five hot dishes whose notes name only the category page) exactly ONE record on the whole site has that norm_name and it has a
     cover picture.
Names printed by two records, records without a cover picture, and anything else get no photo.

Terms (https://www.mysushishop.co.uk/en/terms-of-use, read 2026-10-11): "No Materials from the site may be copied, reproduced,
republished, uploaded, posted, transmitted or distributed in any way, except that you may download one copy of the Materials on any single
computer for your non-commercial use only". Legal notice (/en/legal-notice): content "such as data, text, still or animated images, logos
... are the exclusive property of the publisher ... Any total or partial representation by any person whatsoever without the express
authorisation of the publisher is prohibited". Express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).
robots.txt of www.mysushishop.co.uk and of cf.mysushishop.co.uk (identical, read 2026-10-11): disallows /fr/, /es/, /de/, /en/stores/s/*,
/admin_sushi and any URL with a query string (we use none); /rollingstart/ and /img2/ are allowed.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "sushi-shop"
FEED_URL = "https://www.mysushishop.co.uk/rollingstart/page-data/en/delivery/maki/page-data.json"
PHOTO_URL = "https://cf.mysushishop.co.uk/img2/{pic}/750/750/cover/center/auto/auto/{pic}.jpg"
DEFAULT_CACHE = Path("/tmp/menumacros-images-sushi-shop")
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    "sashimi-salmon-5-pieces": "the cover file is a grey pictogram (a rice-bowl icon), not a photograph of the dish",
    "happy-sushi-box": "the cover file is a promotional graphic with large lettering over the box, not a plain photograph (looked at 2026-10-11)",
}

NOTE_URL = re.compile(r"Read from (https://www\.mysushishop\.co\.uk/\S+)")
PRODUCT_ID = re.compile(r"-(\d+)/?$")


def cover_picture(rec: dict) -> str | None:
    pics = [p for p in rec.get("pictures") or [] if p.get("cover") and p.get("id_object_picture")]
    return pics[0]["id_object_picture"] if len(pics) == 1 else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        feed = json.loads(polite_get(FEED_URL, args.cache, accept="application/json,*/*"))
        records = feed["result"]["data"]["listingProducts"]["nodes"]
        by_id = {r["id_product"]: r for r in records}
        by_name: dict[str, list[dict]] = {}
        for r in records:
            by_name.setdefault(norm_name(r.get("name") or ""), []).append(r)
        print(f"{len(records)} product records in the site's own menu data; {sum(1 for r in records if cover_picture(r))} have one cover photo")

        matched: dict[str, tuple[str, str]] = {}   # item id -> (picture id, product page)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            m = NOTE_URL.search(it.get("notes", ""))
            if not m:
                skipped.append(f"{it['id']}: notes name no page")
                continue
            page = m.group(1).rstrip(".;,")
            pid = PRODUCT_ID.search(page)
            if pid:
                rec = by_id.get(pid.group(1))
                if not rec:
                    skipped.append(f"{it['id']}: product {pid.group(1)} is no longer in the site's menu data")
                    continue
                if norm_name(rec["name"]) != norm_name(it["name"]):
                    skipped.append(f"{it['id']}: record {rec['name']!r} does not carry the name {it['name']!r}")
                    continue
            else:
                cands = by_name.get(norm_name(it["name"]), [])
                if len(cands) != 1:
                    skipped.append(f"{it['id']}: {len(cands)} records on the site have the name {it['name']!r}")
                    continue
                rec = cands[0]
            pic = cover_picture(rec)
            if not pic:
                skipped.append(f"{it['id']}: the chain's record has no cover photo")
                continue
            matched[it["id"]] = (pic, page)

        for item_id, (pic, page) in sorted(matched.items()):
            url = PHOTO_URL.format(pic=pic)
            if args.dry_run:
                print(f"  {item_id:50} picture {pic}  <- {page}")
                continue
            raw = polite_get(url, args.cache, referer=page)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page)
            print(f"  {item_id:50} {fname}  <- picture {pic}")
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
