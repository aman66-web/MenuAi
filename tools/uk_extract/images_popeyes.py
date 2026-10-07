#!/usr/bin/env python3
"""Item photos for Popeyes UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_popeyes.py --cache <dir> [--dry-run]

Source: https://popeyesuk.com/menu (the chain's own menu page). The page is a single-page app: it loads the menu from the
chain's ordering API and shows each product's photo next to its name (<img src=imageUrl alt=productName>). The JSON the
page loads is

    https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net/en/restaurants/generic/menus/generic

(`data.categories[].items[]` and `.subcategories[].items[]`, each with `productName`, `imageUrl`, `calories`, `externalId`).
Photos are on https://cdn-pe-uk-ordering.azureedge.net/media/..., the media host those pages use. The nutrition data
(https://allergensandnutritions.popeyesuk.com/nutritional-information) carries no photos, and it names many products
differently from the ordering menu ("Fries (regular)" there, "Regular Fries" here), so only products whose names are the
same in both are matched.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when a menu entry's productName equals the
item name (images_common.norm_name: case, accents, punctuation, '&'/'and' and spacing ignored; no word dropped or
reordered) and every entry of that name (a product is often listed under several categories) carries the same photo. A
name shared by two published items, an entry with no photo, a name whose entries carry different photos, or an entry whose
calories are far from the published item's (more than 25 kcal and 5 percent apart: a different product with the same
name) gets no photo. Sizes and variants the menu names differently ("Large fries", "Original Biscuit", "The Classic
Chicken Sandwich") are NOT mapped by hand or by calories: they get no photo.

Terms and robots (read 2026-10-07):
- https://popeyesuk.com/terms-conditions (the page renders the text of the chain's CMS feed
  https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net/cms/en/content-pages/terms-conditions) has no clause about
  images, copying, reuse, licences or intellectual property. The nearest sentences: "We strive to ensure that the information
  on our website and app is accurate, but we cannot guarantee it will always be correct. We may update content at any
  time without notice." The site footer reads "(c) PLK Chicken UK Ltd".
- https://popeyesuk.com/robots.txt: "User-agent: * / Allow: / / Disallow: /menu-board" (the /menu page is not covered by
  /menu-board). The API host's /robots.txt is 404 and the media host's /robots.txt is a 400 error page: neither has
  any rules (RFC 9309), and polite_get checks robots.txt before every fetch anyway.
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 2) before any photo is stored. The menu feed is cached under
--cache by URL: delete the cache folder to fetch a fresh copy.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "popeyes"
PAGE_URL = "https://popeyesuk.com/menu"
FEED_URL = "https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net/en/restaurants/generic/menus/generic"
PHOTO_HOST = "cdn-pe-uk-ordering.azureedge.net"
SKIP_FILES: dict[str, str] = {}   # photo file name -> why it is not used (nutrition text, placeholder...), after looking
MIN_PRODUCTS = 150                # the feed had 265 entries on 2026-10-07; far fewer means the feed changed
KCAL_TOLERANCE = (25.0, 0.05)     # calories may differ by up to max(25 kcal, 5 percent) between nutrition table and menu


def walk(category: dict, path: str, out: list[dict]) -> None:
    for it in category.get("items") or []:
        out.append({**it, "_category": path})
    for sub in category.get("subcategories") or []:
        walk(sub, f"{path}/{sub.get('categoryShortName', '?')}", out)


def to_float(v) -> float | None:
    try:
        return float(str(v).strip())
    except ValueError:
        return None


def far_apart(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return False
    return abs(a - b) > max(KCAL_TOLERANCE[0], KCAL_TOLERANCE[1] * max(a, b))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for the feed and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    try:
        raw_feed = ic.polite_get(FEED_URL, args.cache, referer=PAGE_URL, accept="application/json")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2
    except (urllib.error.URLError, OSError) as e:
        print(f"Could not fetch the menu feed ({e}); nothing written.", file=sys.stderr)
        return 1
    try:
        doc = json.loads(raw_feed.decode("utf-8"))
        categories = doc["data"]["categories"]
        if doc.get("hasErrors") or not isinstance(categories, list):
            raise ValueError("feed reports errors or has no categories")
    except (ValueError, KeyError, TypeError) as e:
        print(f"The menu feed has an unexpected shape ({e}); nothing written.", file=sys.stderr)
        return 1
    products: list[dict] = []
    for c in categories:
        walk(c, c.get("categoryShortName", "?"), products)
    if len(products) < MIN_PRODUCTS:
        print(f"Only {len(products)} products in the menu feed (expected 150+); the feed changed, stopping.", file=sys.stderr)
        return 1

    entries: dict[str, list[dict]] = {}
    for p in products:
        entries.setdefault(ic.norm_name(p.get("productName") or ""), []).append(p)

    skipped: list[str] = []
    chosen: dict[str, tuple[str, str]] = {}      # item id -> (photo url, product name on the page)
    for key, its in sorted(by_name.items()):
        found = entries.get(key)
        if not found:
            continue                              # the chain's menu does not list this name: no photo, not worth a line
        if len(its) > 1:
            skipped.append(f"'{key}': {len(its)} published items share this name")
            continue
        item = its[0]
        photos = {(p.get("imageUrl") or "").strip() for p in found}
        if "" in photos:
            skipped.append(f"{item['id']}: a menu entry named {item['name']!r} has no photo")
            continue
        if len(photos) != 1:
            skipped.append(f"{item['id']}: {len(photos)} different photos for the name {item['name']!r}; ambiguous")
            continue
        photo = photos.pop()
        parts = urllib.parse.urlsplit(photo)
        if parts.scheme != "https" or parts.netloc != PHOTO_HOST:
            skipped.append(f"{item['id']}: photo is not on {PHOTO_HOST}: {photo}")
            continue
        fname = parts.path.rsplit("/", 1)[-1]
        if fname in SKIP_FILES:
            skipped.append(f"{item['id']}: {fname} skipped: {SKIP_FILES[fname]}")
            continue
        mine = to_float(item.get("calories"))
        theirs = {to_float(p.get("calories")) for p in found}
        if any(far_apart(mine, t) for t in theirs):
            skipped.append(f"{item['id']}: menu calories {sorted(x for x in theirs if x is not None)} vs published {mine}; "
                           "not the same product, no photo")
            continue
        chosen[item["id"]] = (photo, found[0]["productName"].strip())

    names = {it["id"]: it["name"] for it in items}
    if args.dry_run:
        for item_id, (photo, page_name) in sorted(chosen.items()):
            print(f"{item_id} | {names[item_id]} | {photo} | {PAGE_URL}")
        for s in skipped:
            print("skip:", s)
        print(f"{len(chosen)} of {len(items)} published items matched")
        return 0

    # Download every photo first, so a block stops the run before anything is stored.
    raws: dict[str, bytes] = {}
    try:
        for photo in sorted({p for p, _ in chosen.values()}):
            try:
                raws[photo] = ic.polite_get(photo, args.cache, referer=PAGE_URL)
            except urllib.error.HTTPError as e:
                skipped.append(f"{photo}: HTTP {e.code}")
            except (urllib.error.URLError, OSError) as e:
                skipped.append(f"{photo}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    for item_id, (photo, _) in sorted(chosen.items()):
        if photo not in raws:
            skipped.append(f"{item_id}: photo could not be downloaded")
            continue
        if photo not in stored:
            try:
                stored[photo] = ic.store_image(CHAIN, raws[photo])
            except ValueError as e:
                stored[photo] = ""
                skipped.append(f"{photo}: {e}")
        if stored[photo]:
            rows[item_id] = (stored[photo], PAGE_URL)
            print(f"{item_id}: {stored[photo]}  <- {photo}")

    for s in skipped:
        print("skip:", s)
    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"LOOK: {f} is used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
