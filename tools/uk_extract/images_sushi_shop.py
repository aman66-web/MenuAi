#!/usr/bin/env python3
"""Item photos for Sushi Shop UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_sushi_shop.py --cache DIR [--dry-run]

Source: the site's own menu data, https://www.mysushishop.co.uk/rollingstart/page-data/en/delivery/maki/page-data.json, the file every
category page of mysushishop.co.uk loads (Gatsby page-data). It carries `listingProducts`: ONE record per product on the site (279 on
2026-11-17), with the product id, its name, its page address (`uri`) and its `pictures`. Then each matched product's own page,
https://www.mysushishop.co.uk/en/delivery/<category>/<slug>-<id>, is read once: its <h1> is the product's name and its FIRST <img> is the
product's main photo (the page shows the record's pictures typed "rollingstart", in the record's order; checked 2026-11-17 on
cheesecake-1284, tuna-sushi-1176, mango-mochi-2481, mochi-glace-ichigo-piment-4260). The photo files live on the chain's own image host
cf.mysushishop.co.uk (/img2/<picture id>/<w>/<h>/cover/center/auto/auto/<picture id>.jpg); we fetch the site's own 750 x 750 rendition
(the page's srcset offers 750/1080/1366/1920 of the same square picture) and store_image only downsizes it to <= 640 px WebP.

Run of 2026-11-17 (the first run was 2026-10-11, when the product pages' main photo was each record's `cover` picture): the site had
moved to a new set of pictures (72 of the matched products show a different picture than the 2026-10-11 cover), renamed 23 products
(dropping "Roll" from the name: see RENAMED_ON_SITE) and taken 19 products off the menu. Photos now follow what each product page
shows today; the 2026-10-11 photos of the products no longer on the site are kept (CARRY-OVER below).

Match rule (exact, nothing fuzzy). A photo goes on a published item only when
  1. the item's notes in items.csv say "Read from <product page URL>" and that URL ends in the product id, the record with that id is
     still in the site's menu data, and the record's name has the same norm_name as the item's name, or is the name listed for that item
     in RENAMED_ON_SITE (the same product record, renamed by the chain since we read it; each one looked at), or
  2. (the five hot dishes whose notes name only the category page) exactly ONE record on the whole site has the item's norm_name;
and the product page (the record's `uri`) prints that record's name in its <h1>, and its first <img> is one of that record's pictures.
Names printed by two records, records without a picture, and anything else get no photo.
CARRY-OVER: an item whose product (by the id in its notes) is no longer in the site's menu data keeps the photo it was given on
2026-10-11 by the rule above (then: the record's single cover picture, the record's name equal to the item's), if images.csv has one and
its file is still there; the row's source_url is the product page as it was then (it now answers 404). write_images_csv stamps every row
with the date of the run, so for these rows retrieved_on is the date of the rerun, not the 2026-10-11 download; the script lists them.

Terms (https://www.mysushishop.co.uk/en/terms-of-use, read 2026-10-11 and again 2026-11-17, unchanged): "No Materials from the site may be copied, reproduced,
republished, uploaded, posted, transmitted or distributed in any way, except that you may download one copy of the Materials on any single
computer for your non-commercial use only". Legal notice (/en/legal-notice): content "such as data, text, still or animated images, logos
... are the exclusive property of the publisher ... Any total or partial representation by any person whatsoever without the express
authorisation of the publisher is prohibited". Express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).
robots.txt of www.mysushishop.co.uk and of cf.mysushishop.co.uk (identical, read 2026-11-17): "User-Agent: *", Disallow: /admin_sushi,
/admin_sushi_new, /fr/, /es/, /de/, /en/stores/s/* and "/*?" (any URL with a query string; we use none); /rollingstart/, /en/delivery/ and
/img2/ are allowed.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "sushi-shop"
HOST = "https://www.mysushishop.co.uk"
FEED_URL = f"{HOST}/rollingstart/page-data/en/delivery/maki/page-data.json"
PHOTO_URL = "https://cf.mysushishop.co.uk/img2/{pic}/750/750/cover/center/auto/auto/{pic}.jpg"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-sushi-shop")
# item id -> why it was looked at after a run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    "happy-sushi-box": "picture 15813 is a promotional graphic: large 'HAPPY SUSHI BOX' lettering over the box (looked at 2026-11-17; the 2026-10-11 cover was left out for the same reason)",
    "box-le-petit-prince": "the 2026-10-11 photo is the box composited on a drawn Le Petit Prince scene (stars, planets) with lettering on the lid: "
                           "an illustration, not a plain photo (looked at 2026-11-17)",
    "bear-yo-yos-strawberry-20gr": "the picture is a third-party brand's pack (BEAR Fruit Rolls wrapper), not the food (looked at 2026-11-17)",
    "crispy-nori-hot-chilli": "the picture is a third-party brand's pack (bibigo Seaweed Snack bag), not the food (looked at 2026-11-17)",
    "crispy-nori-korean-bbq": "the picture is a third-party brand's pack (bibigo Seaweed Snack bag), not the food (looked at 2026-11-17)",
    "crispy-nori-sea-salt": "the picture is a third-party brand's pack (bibigo Seaweed Snack bag), not the food (looked at 2026-11-17)",
    "kids-menu-cooked-tuna": "the picture shows the whole kids' meal with an Innocent smoothie carton and a BEAR fruit pack (third-party packs with lettering); "
                             "the item is the 12 pieces of sushi (independent check 2026-11-17)",
    "kids-menu-salmon": "the picture shows the whole kids' meal with an Innocent smoothie carton and a BEAR fruit pack (third-party packs with lettering); "
                        "the item is the 12 pieces of sushi (independent check 2026-11-17)",
}
# picture id -> why that picture is never used (looked at on a contact sheet)
DROP_PICTURES: dict[str, str] = {}
# 2026-10-11 note, kept for the record: the cover picture then shown for "sashimi-salmon-5-pieces" was a grey rice-bowl pictogram and was
# left out; on 2026-11-17 its page shows a real photo of the plate (picture 13929), looked at and kept.
# The same product record (same product id, same reference) renamed by the chain after we read it: item id -> the record's name now.
RENAMED_ON_SITE = {
    "kenko-cajun-chicken-roll": "Kenko Cajun Chicken",
    "veggie-roll": "Veggie",
    "salmon-and-crispy-onion-roll": "Salmon & Crispy Onion",
    "kenko-salmon-avocado-roll": "Kenko Salmon Avocado",
    "chicken-curry-roll": "Chicken Curry",
    "salmon-avocado-roll": "Salmon Avocado",
    "salmon-aburi-roll": "Salmon Aburi",
    "tuna-avocado-roll": "Tuna Avocado",
    "cooked-tuna-avocado-roll": "Cooked Tuna Avocado",
    "prawn-tempura-roll": "Prawn Tempura",
    "chicken-katsu-roll": "Chicken Katsu",
    "cucumber-maki-roll": "Cucumber Maki",
    "avocado-cheese-maki-roll": "Avocado Cheese Maki",
    "salmon-maki-roll": "Salmon Maki",
    "spicy-tuna-maki-roll": "Spicy Tuna Maki",
    "caesar-style-chicken-spring-roll": "Caesar Style Chicken Spring",
    "cucumber-cheese-spring-roll": "Cucumber Cheese Spring",
    "avocado-cheese-spring-roll": "Avocado Cheese Spring",
    "salmon-avocado-spring-roll": "Salmon Avocado Spring",
    "salmon-tataki-spring-roll": "Salmon Tataki Spring",
    "tuna-avocado-spring-roll": "Tuna Avocado Spring",
    "cooked-tuna-avocado-spring-roll": "Cooked Tuna Avocado Spring",
    "fried-chicken-avocado-spring-roll": "Fried Chicken Avocado Spring",
}

NOTE_URL = re.compile(r"Read from (https://www\.mysushishop\.co\.uk/\S+)")
PRODUCT_ID = re.compile(r"-(\d+)/?$")
PAGE_IMG = re.compile(r'<img\b[^>]*\ssrc="https://cf\.mysushishop\.co\.uk/img2/(\d+)/')


def existing_rows() -> dict[str, tuple[str, str]]:
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(f)
                if (IMAGES_ROOT / CHAIN_ID / r["file"]).exists()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    before = existing_rows()
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    carried: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (picture id, product page)
    try:
        feed = json.loads(polite_get(FEED_URL, args.cache, accept="application/json,*/*"))
        records = feed["result"]["data"]["listingProducts"]["nodes"]
        by_id = {r["id_product"]: r for r in records}
        by_name: dict[str, list[dict]] = {}
        for r in records:
            by_name.setdefault(norm_name(r.get("name") or ""), []).append(r)
        print(f"{len(records)} product records in the site's own menu data")

        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            m = NOTE_URL.search(it.get("notes", ""))
            if not m:
                skipped.append(f"{it['id']}: notes name no page")
                continue
            notes_page = m.group(1).rstrip(".;,")
            pid = PRODUCT_ID.search(notes_page)
            if pid:
                rec = by_id.get(pid.group(1))
                if not rec:
                    if it["id"] in before:
                        carried[it["id"]] = before[it["id"]]
                        skipped.append(f"{it['id']}: product {pid.group(1)} is no longer on the site: its 2026-10-11 photo is kept")
                    else:
                        skipped.append(f"{it['id']}: product {pid.group(1)} is no longer in the site's menu data")
                    continue
                if norm_name(rec["name"]) not in {norm_name(it["name"]), norm_name(RENAMED_ON_SITE.get(it["id"], it["name"]))}:
                    skipped.append(f"{it['id']}: record {rec['name']!r} does not carry the name {it['name']!r}")
                    continue
            else:
                cands = by_name.get(norm_name(it["name"]), [])
                if len(cands) != 1:
                    skipped.append(f"{it['id']}: {len(cands)} records on the site have the name {it['name']!r}")
                    continue
                rec = cands[0]
            pics = [p.get("id_object_picture") for p in rec.get("pictures") or [] if p.get("id_object_picture")]
            if not pics:
                skipped.append(f"{it['id']}: the chain's record has no picture")
                continue
            page_url = HOST + rec["uri"] if rec.get("uri") else notes_page
            try:
                page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:   # 401/403/429 are Blocked (raised by polite_get); anything else is just a missing page
                skipped.append(f"{it['id']}: {page_url}: HTTP {e.code}")
                continue
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
            h1_name = html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else ""
            if norm_name(h1_name) != norm_name(rec["name"]):
                skipped.append(f"{it['id']}: the page {page_url} prints {h1_name!r}, not the record's name {rec['name']!r}")
                continue
            shown = [p for p in PAGE_IMG.findall(page) if p in pics]
            if not shown:
                skipped.append(f"{it['id']}: the page {page_url} shows none of the record's pictures")
                continue
            pic = shown[0]
            if pic in DROP_PICTURES:
                skipped.append(f"{it['id']}: picture {pic} dropped after looking: {DROP_PICTURES[pic]}")
                continue
            matched[it["id"]] = (pic, page_url)

        for item_id, (pic, page_url) in sorted(matched.items()):
            url = PHOTO_URL.format(pic=pic)
            if args.dry_run:
                print(f"  {item_id:50} picture {pic}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- picture {pic}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}" if "is kept" not in s else f"  kept: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched on today's pages; {len(carried)} more keep their 2026-10-11 photo")
        return 0
    rows.update(carried)
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo ({len(carried)} carried over from 2026-10-11: "
          f"{', '.join(sorted(carried))})")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
