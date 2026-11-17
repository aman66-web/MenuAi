#!/usr/bin/env python3
"""Item photos for Popeyes UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_popeyes.py --cache <dir> [--dry-run]

Sources (all the chain's own; nothing else is requested besides the photo files):

1. https://popeyesuk.com/menu (the chain's own menu page). The page is a single-page app: it loads the menu from the
   chain's ordering API and shows each product's photo next to its name (<img src=imageUrl alt=productName>). The JSON
   the page loads is

       https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net/en/restaurants/generic/menus/generic

   (`data.categories[].items[]` and `.subcategories[].items[]`, each with `productName`, `imageUrl`, `calories`,
   `externalId`).
2. The restaurant pages https://popeyesuk.com/restaurants/<slug> (listed in https://popeyesuk.com/sitemap.xml). A
   restaurant that serves breakfast shows a "Breakfast menu" section: each product's photo next to its name. The page
   loads its data from the same API, https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net/api/v2/restaurants/<slug>
   (`data.breakfastMenu.items[]`, each with `productName`, `image`, `shortDescription`). Which restaurants serve
   breakfast comes from the chain's own restaurant finder list (/api/v2/restaurants?latitude=&longitude=&radius=&top=,
   the call https://popeyesuk.com/restaurants makes; one call centred on Great Britain lists every UK restaurant with
   its `hasBreakfastMenu` flag), so only those restaurants' records are requested. The breakfast entries carry no
   calories. A photo found this way is credited to the first such restaurant page (by slug, case ignored).

Photos are on https://cdn-pe-uk-ordering.azureedge.net/media/..., the media host those pages use. The nutrition data
(https://allergensandnutritions.popeyesuk.com/nutritional-information, the feed our items were built from by popeyes.py)
carries no photos, and it names many products differently from the ordering menu ("Fries (regular)" there, "Regular
Fries" here, "Chicken Sandwich Classic" there, "The Classic Chicken Sandwich" here), so only products whose names are the
same in both are matched. The ordering API's per-product nutrition record (/en/ordering/menu/allergensandnutritions?
menuItemRefs=<externalId>) was checked on 2026-11-17: it carries the menu's own name and figures, not the nutrition
feed's row id, so there is no product-record link between the two either.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when a page entry's productName equals
the item name (images_common.norm_name: case, accents, punctuation, '&'/'and' and spacing ignored; no word dropped or
reordered) and every entry of that name (a product is often listed under several categories, and a breakfast product on
many restaurant pages) carries the same photo. A name shared by two published items, an entry with no photo, or a name
whose entries carry different photos gets no photo. On the menu page, an entry whose calories are far from the item's
(more than 25 kcal and 5 percent apart: a different product with the same name) gets no photo, UNLESS the chain's own
nutrition feed today shows that the item's own row (the feed row id popeyes.py built the item from, still printed under
the same name) now has the menu's figure: then the menu entry is that very product and only our copy of its figures is
out of date (the run prints "STALE" so the data can be re-extracted). Sizes and variants the pages name differently
("Large fries", "Original Biscuit", "The Classic Chicken Sandwich") are NOT mapped by hand or by calories: they get no
photo. A product the pages no longer list (it left the menu) gets no photo: a row is written only for what a page
shows today.

Terms and robots (read 2026-11-17):
- https://popeyesuk.com/terms-conditions (the page renders the text of the chain's CMS feed
  https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net/cms/en/content-pages/terms-conditions) has no clause about
  copying or reusing the site's content or images, licences or intellectual property (it is about orders, rewards and
  promotions). The nearest sentences: "We strive to ensure that the information on our website and app is accurate,
  but we cannot guarantee it will always be correct. We may update content at any time without notice." The site footer
  reads "(c) PLK Chicken UK Ltd".
- https://popeyesuk.com/robots.txt: "User-agent: * / Allow: / / Disallow: /menu-board" (/menu and /restaurants/... are
  not covered by /menu-board). The API host's /robots.txt answers 404 and the media host's /robots.txt a 400 error page:
  neither has any rules (RFC 9309). The nutrition feed host
  (app-allergenplatform-prod-westeurope-001.azurewebsites.net) serves a robots.txt whose only lines are comments: no
  rules. polite_get checks robots.txt before every fetch anyway.
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 2) before any photo is stored. Feeds are cached under --cache by
URL: delete the cache folder to fetch fresh copies.
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
import popeyes as popeyes_rows  # noqa: E402  (ROWS: which nutrition-feed row each published item was built from)

CHAIN = "popeyes"
PAGE_URL = "https://popeyesuk.com/menu"
API = "https://pe-uk-ordering-api-fd-eecsdkg6btfeg0cc.z01.azurefd.net"
FEED_URL = f"{API}/en/restaurants/generic/menus/generic"
# The restaurant finder's own list call, centred on Great Britain with a radius (metres) that covers every UK restaurant.
RESTAURANTS_URL = f"{API}/api/v2/restaurants?latitude=53.5&longitude=-2&radius=1500000&top=1000"
RESTAURANT_URL = API + "/api/v2/restaurants/{slug}"
RESTAURANT_PAGE = "https://popeyesuk.com/restaurants/{slug}"
NUTRITION_PAGE = "https://allergensandnutritions.popeyesuk.com/nutritional-information"
NUTRITION_URL = ("https://app-allergenplatform-prod-westeurope-001.azurewebsites.net/api/recipes/get-information"
                 "?pagination[page]=0&pagination[pageSize]=500&allergens=false&nutrition=true")
PHOTO_HOST = "cdn-pe-uk-ordering.azureedge.net"
# Items looked at after a run and left without a photo (a rerun must not bring them back).
DROP_ITEMS: dict[str, str] = {
    "white-americano": "the menu reuses the Black Americano photo, which shows a black coffee",
    "chocolate-shake": "the photo carries an 'Allergen Update' badge that could contradict our own allergen table",
    "large-chocolate-shake": "same photo and badge as the Chocolate Shake",
    "the-chicken-cruncher": "the photo carries a 'Recipe Update' badge",
    # looked at on 2026-11-17:
    "6-hot-wings": "the menu reuses the 5-piece photo (hot-wings-5-piece-solo), which shows 5 wings, not 6",
    "jimmys-iced-coffee": "the photo is a third-party brand's can (Jimmy's), not a Popeyes-served dish",
}
SKIP_FILES: dict[str, str] = {}   # photo file name -> why it is not used (nutrition text, placeholder...), after looking
MIN_PRODUCTS = 150                # the feed had 265 entries on 2026-10-07 and 262 on 2026-11-17; far fewer means it changed
MIN_RESTAURANTS = 80              # the finder listed 136 UK restaurants on 2026-11-17
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


def get_json(url: str, cache: Path, referer: str) -> dict:
    doc = json.loads(ic.polite_get(url, cache, referer=referer, accept="application/json").decode("utf-8"))
    if not isinstance(doc, dict):
        raise ValueError(f"{url}: not a JSON object")
    if doc.get("hasErrors"):
        raise ValueError(f"{url}: the API reports errors {doc.get('errors')}")
    return doc


def photo_ok(photo: str) -> bool:
    parts = urllib.parse.urlsplit(photo)
    return parts.scheme == "https" and parts.netloc == PHOTO_HOST


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for the feeds and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)
    feed_id = {ic.norm_name(r["name"]): r["id"] for r in popeyes_rows.ROWS if "skip" not in r}

    try:
        doc = get_json(FEED_URL, args.cache, PAGE_URL)
        categories = doc["data"]["categories"]
        if not isinstance(categories, list):
            raise ValueError("the menu feed has no categories")
        nutrition = json.loads(ic.polite_get(NUTRITION_URL, args.cache, referer=NUTRITION_PAGE, accept="application/json").decode("utf-8"))
        nutrition_rows = {int(r["id"]): r for r in nutrition["data"]}
        restaurants = get_json(RESTAURANTS_URL, args.cache, "https://popeyesuk.com/restaurants")["data"]
        if not isinstance(restaurants, list) or len(restaurants) < MIN_RESTAURANTS:
            raise ValueError(f"the restaurant finder listed {len(restaurants) if isinstance(restaurants, list) else '?'} restaurants "
                             f"(expected {MIN_RESTAURANTS}+); the call changed")
        breakfast: list[dict] = []           # breakfast menu entries, each with the restaurant page that shows it
        for r in sorted((r for r in restaurants if r.get("hasBreakfastMenu")), key=lambda r: str(r.get("slug", "")).lower()):
            slug = str(r["slug"])
            page = RESTAURANT_PAGE.format(slug=slug)
            details = get_json(RESTAURANT_URL.format(slug=urllib.parse.quote(slug)), args.cache, page)["data"]
            for it in (details.get("breakfastMenu") or {}).get("items") or []:
                breakfast.append({"productName": it.get("productName") or "", "imageUrl": it.get("image") or "", "_page": page})
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2
    except (urllib.error.URLError, OSError) as e:
        print(f"Could not fetch a feed ({e}); nothing written.", file=sys.stderr)
        return 1
    except (ValueError, KeyError, TypeError) as e:
        print(f"A feed has an unexpected shape ({e}); nothing written.", file=sys.stderr)
        return 1

    products: list[dict] = []
    for c in categories:
        walk(c, c.get("categoryShortName", "?"), products)
    if len(products) < MIN_PRODUCTS:
        print(f"Only {len(products)} products in the menu feed (expected {MIN_PRODUCTS}+); the feed changed, stopping.", file=sys.stderr)
        return 1

    menu_entries: dict[str, list[dict]] = {}
    for p in products:
        menu_entries.setdefault(ic.norm_name(p.get("productName") or ""), []).append(p)
    breakfast_entries: dict[str, list[dict]] = {}
    for p in breakfast:
        breakfast_entries.setdefault(ic.norm_name(p["productName"]), []).append(p)

    skipped: list[str] = []
    stale: list[str] = []
    chosen: dict[str, tuple[str, str]] = {}      # item id -> (photo url, page that shows it for this item)
    for key, its in sorted(by_name.items()):
        on_menu, on_breakfast = menu_entries.get(key), breakfast_entries.get(key)
        if not on_menu and not on_breakfast:
            continue                              # no page of the chain lists this name today: no photo, not worth a line
        if len(its) > 1:
            skipped.append(f"'{key}': {len(its)} published items share this name")
            continue
        item = its[0]
        if item["id"] in DROP_ITEMS:
            skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
            continue
        found = (on_menu or []) + (on_breakfast or [])
        photos = {(p.get("imageUrl") or "").strip() for p in found}
        if "" in photos:
            skipped.append(f"{item['id']}: a page entry named {item['name']!r} has no photo")
            continue
        if len(photos) != 1:
            skipped.append(f"{item['id']}: {len(photos)} different photos for the name {item['name']!r}; ambiguous")
            continue
        photo = photos.pop()
        if not photo_ok(photo):
            skipped.append(f"{item['id']}: photo is not on {PHOTO_HOST}: {photo}")
            continue
        fname = urllib.parse.urlsplit(photo).path.rsplit("/", 1)[-1]
        if fname in SKIP_FILES:
            skipped.append(f"{item['id']}: {fname} skipped: {SKIP_FILES[fname]}")
            continue
        mine = to_float(item.get("calories"))
        theirs = {to_float(p.get("calories")) for p in (on_menu or [])}
        if any(far_apart(mine, t) for t in theirs):
            # Is the menu entry the very product our item was built from, whose figures the chain has since changed?
            row = nutrition_rows.get(feed_id.get(key, -1))
            now = to_float((row or {}).get("nutrition", {}).get("kcal"))
            if row and ic.norm_name(row["name"]) == key and now is not None and not any(far_apart(now, t) for t in theirs):
                stale.append(f"{item['id']}: published {mine} kcal, the chain's nutrition row {row['id']} now prints {now} "
                             f"and its menu {sorted(x for x in theirs if x is not None)}: re-extract popeyes")
            else:
                skipped.append(f"{item['id']}: menu calories {sorted(x for x in theirs if x is not None)} vs published {mine}; "
                               "not the same product, no photo")
                continue
        page = PAGE_URL if on_menu else min((p["_page"] for p in on_breakfast), key=str.lower)
        chosen[item["id"]] = (photo, page)

    names = {it["id"]: it["name"] for it in items}
    if args.dry_run:
        for item_id, (photo, page) in sorted(chosen.items()):
            print(f"{item_id} | {names[item_id]} | {photo} | {page}")
        for s in skipped:
            print("skip:", s)
        for s in stale:
            print("STALE:", s)
        print(f"{len(chosen)} of {len(items)} published items matched")
        return 0

    # Download every photo first, so a block stops the run before anything is stored.
    raws: dict[str, bytes] = {}
    try:
        for photo, page in sorted({(p, pg) for p, pg in chosen.values()}):
            if photo in raws:
                continue
            try:
                raws[photo] = ic.polite_get(photo, args.cache, referer=page)
            except urllib.error.HTTPError as e:
                skipped.append(f"{photo}: HTTP {e.code}")
            except (urllib.error.URLError, OSError) as e:
                skipped.append(f"{photo}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    for item_id, (photo, page) in sorted(chosen.items()):
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
            rows[item_id] = (stored[photo], page)
            print(f"{item_id}: {stored[photo]}  <- {photo}  ({page})")

    for s in skipped:
        print("skip:", s)
    for s in stale:
        print("STALE:", s)
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
