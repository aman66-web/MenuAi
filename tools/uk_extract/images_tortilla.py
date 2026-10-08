#!/usr/bin/env python3
"""Item photos for Tortilla from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_tortilla.py --cache DIR [--dry-run]

STATUS 2026-10-08: BLOCKED at the photo host, so no photo is installed. Run without --dry-run it reads the two pages, finds the matches below,
asks polite_get for the first photo and stops (exit 1, nothing written). --dry-run prints what it would attach.

Source: https://www.tortilla.co.uk/menu/ingredients and https://www.tortilla.co.uk/menu/nutrition-calculator. Both pages embed the chain's
CMS (Storyblok) records as JSON in the page: for each ingredient a record with `heading`, per-100 g `kcal`/`protein`/`carbs`/`fat` and a `cover`
photo (`https://a.storyblok.com/f/158888/<w>x<h>/<hash>/<file>`; the grid shows a separate square `thumbnail`, not used). The cover is
fetched as the CMS gives it, so store_image makes the only change.

Why blocked: every Tortilla photo is on https://a.storyblok.com (the site's pages load them from there directly; there is no copy on
www.tortilla.co.uk). https://a.storyblok.com/robots.txt answers HTTP 403 (a CloudFront/S3 "AccessDenied" XML body: not a "MissingKey"/"NoSuchKey"
body and not an amazonaws.com host), which images_common.polite_get treats as "do not fetch" and raises Blocked, exactly as for The Breakfast
Club (assets.slerp.com) and Caffe Nero's bucket. Whether a 403 on a CDN's robots.txt counts as "no rules" (RFC 9309 2.3.1.3) is for the
founder / main session to decide; this script does not work round it. www.tortilla.co.uk/robots.txt (read 2026-10-08) is "User-Agent: * / Allow: /".

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  A. the CMS record's heading has the same name as the item (norm_name equality): "Dessert Quesadilla"; or
  B. the item is the guide's Medium or Large portion of one ingredient record: the item's name is "Medium <heading>" or "Large <heading>"
     AND the record's own per-100 g kcal, protein, carbohydrate and fat, scaled by ONE portion weight (derived from the kcal), reproduce the
     item's printed kcal, protein, carbohydrate and fat to within a rounding unit. So it is the same recipe, only the portion differs.
Not matched on purpose: items whose name differs from the record's ("Medium Salsa Ranchera (mild)" vs "Salsa Ranchera"; "3 Churros & Chocolate
Sauce" vs "3 Churros & Chocolate", whose numbers also differ; "Tortilla Chips (bag)" vs the product "Tortilla Chips", whose photo shows chips with
salsa), the breakfast items (the site's Breakfast Burrito/Bowl/Roll are chorizo recipes, our rows are Bacon and Veggie ones), Queso Fundido (no
photo on its record), Hibiscus Lemonade and the hot sauces (no record). "Dessert Quesadilla": the record says 255 kcal, the guide 283 kcal (the
guide's later portion, same ratio on every nutrient); rule A uses the name only.

Terms (https://www.tortilla.co.uk/terms-and-conditions, tab "Trademarks & Copyright", read 2026-10-08): "All content included on this service is
the property of Tortilla Mexican Grill PLC and is protected by UK and European copyright laws. The reproduction, modification, distribution,
transmission, republication, or display of the content on this service is strictly prohibited. If you wish to use any of our intellectual
property, please complete our feedback form." That is an express prohibition; the founder decided on 2026-10-06 (the founder's accepted risk)
that photos are installed anyway, so only robots.txt stops this chain.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "tortilla"
PAGES = ["https://www.tortilla.co.uk/menu/ingredients", "https://www.tortilla.co.uk/menu/nutrition-calculator"]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-tortilla")
DROP_ITEMS: dict[str, str] = {}   # items looked at after a run and left without a photo (a rerun must not bring them back)

STORY = re.compile(r'\{"name":"[^"]+","created_at":"[^"]+","published_at":"[^"]*","updated_at":"[^"]+","id":\d+,"uuid":"[^"]+","content":\{')


def num(seg: str, key: str) -> float | None:
    m = re.search(r'"%s":"([0-9.]+)"' % key, seg)
    return float(m.group(1)) if m else None


def records(html: str) -> list[dict]:
    """Ingredient records of one page: heading, per-100 g numbers and the cover photo URL."""
    text = html.replace('\\"', '"').replace("\\\\", "\\").replace("\\u0026", "&")
    out = []
    for m in STORY.finditer(text):
        seg = text[m.end(): m.end() + 6000]
        if '"component":"ingredient"' not in seg:
            continue
        head, cover = re.search(r'"heading":"([^"]*)"', seg), re.search(r'"cover":\{[^}]*?"filename":"([^"]*)"', seg)
        if not head or not cover or not cover.group(1):
            continue
        rec = {"heading": head.group(1).strip(), "cover": cover.group(1)}
        for k in ("kcal", "protein", "carbs", "fat"):
            rec[k] = num(seg, k)
        out.append(rec)
    return out


def same_recipe(item: dict, rec: dict) -> bool:
    """The record's per-100 g numbers, scaled by one portion weight, give the item's printed numbers (to a rounding unit)."""
    if not rec["kcal"] or any(rec[k] is None for k in ("protein", "carbs", "fat")):
        return False
    scale = float(item["calories"]) / rec["kcal"]
    for ours, theirs in (("protein_g", "protein"), ("carbs_g", "carbs"), ("fat_g", "fat")):
        if ours not in item or item[ours] == "" or abs(float(item[ours]) - rec[theirs] * scale) > 1.0:
            return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the pages and print the matches; download and write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    recs: dict[str, tuple[dict, str]] = {}      # norm heading -> (record, page that carries it); the ingredients page wins
    try:
        for page in PAGES:
            for r in records(polite_get(page, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")):
                recs.setdefault(norm_name(r["heading"]), (r, page))
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1

    chosen: dict[str, tuple[str, str]] = {}
    for item in items:
        if item["id"] in DROP_ITEMS:
            continue
        key = norm_name(item["name"])
        hit = recs.get(key)
        if hit is None:
            m = re.match(r"(medium|large) (.+)", key)
            hit = recs.get(m.group(2)) if m else None
            if hit is not None and not same_recipe(item, hit[0]):
                hit = None
        if hit is not None:
            chosen[item["id"]] = (hit[0]["cover"], hit[1])
            print(f"  {item['id']}: {hit[0]['cover']}")
    print(f"{len(chosen)} of {len(items)} published items match a record with a photo")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (url, page) in sorted(chosen.items()):
            try:
                rows[item_id] = (store_image(CHAIN_ID, polite_get(url, args.cache)), page)
            except ValueError as e:
                print(f"  {item_id}: {e}, no photo")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    write_images_csv(CHAIN_ID, rows)
    shared = suspected_placeholders(rows)
    print(f"wrote {len(rows)} photos; shared by 4+ items: {shared or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
