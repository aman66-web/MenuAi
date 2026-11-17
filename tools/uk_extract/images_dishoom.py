#!/usr/bin/env python3
"""Item photos for Dishoom from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_dishoom.py --cache DIR [--dry-run]

RESULT OF THE RUN OF 2026-11-17: 0 photos. Dishoom's own website publishes NO photo of any single dish, so nothing is matched and
data/source/dishoom/images.csv is not written. Kept so a rerun picks photos up the day Dishoom adds them to its dish records.

Where we looked (2026-11-17):
  * www.dishoom.com/menu/<menu>/ (the chain's own menus; robots.txt allows /menu/ except /menu/diwali-feast-menus/). Each page is a
    Next.js page whose own data (the `self.__next_f.push` payload) carries every dish as a Sanity record
    {"_type": "dish", "_id", "name", "description", "price", "image", ...}. On the six menus read here (all-day-main, breakfast, drinks,
    desserts, vegan-main, children-main: 321 dish records) and seven more looked at by hand (group-feast, lunch-set-menu,
    christmas-feast-menu, collection, delivery, iftar-feast, breakfast-group-feast: 386 more), EVERY dish record has "image": null and the
    page draws dishes as text only. The other pictures on those pages (a header slideshow, promotions, the shop) carry no alt text, no
    caption and no dish name, so they cannot be tied to a dish and are never used. The location landing pages (breakfast / vegan / halal /
    lunch restaurant pages) and /food-drink/ are the same: no dish-named pictures. /store/products/... pages that the sitemap lists under
    dish-like names (fresh-orange-juice, mango-fennel-lassi, cbd-bhang-lassi, chicken-kathi-roll, limca, thums-up,
    ruby-red-grapefruit-juice) answer 404. Journal recipe pages are not menu, product or nutrition pages and are not used.
  * https://app.served-app.com/website/dishoom (Dishoom's allergen-and-calorie menu, the page our figures come from, linked from
    dishoom.com): opened once in headless Chromium (2026-11-17) with every dish panel on the ALL DAY, BREAKFAST and DRINKS tabs
    expanded: the only image on the page is the Dishoom logo; no dish has a photo.
  * https://delivery.dishoom.com (the "Order delivery" link): a storefront run by Deliveroo (its pictures and social image are on
    Deliveroo's own CDN, roocdn.com; its robots.txt is Deliveroo's; the page loads a PerimeterX bot-detection script). Photos from
    Deliveroo are never used (CLAUDE.md rule 2 / the photo playbook), and its dishes are delivery portions that print other calories
    than the restaurant menu (dishoom.py), so it was not read.

Match rule (exact, nothing fuzzy), for the day a dish record carries a picture: a photo is attached to a published item only when
  1. a dish record on one of MENUS has the same norm_name as the item's name,
  2. every dish record with that name that carries a picture carries the SAME picture (one asset), and
  3. the picture is an image asset of Dishoom's own Sanity project (cdn.sanity.io/images/daku84np/production/...), fetched as the
     original file (never Sanity's crop/resize parameters; store_image only downsizes to <= 640 px WebP).
Our item names come from the Served allergen menu and sometimes differ from dishoom.com's ("Mix Seafood Fry" / "Mixed Seafood Fry",
"New Keema Pau" / "Keema Pau"): those get no photo; we never match by similarity. DROP_ITEMS lists photos left out after looking.

robots.txt (read 2026-11-17): www.dishoom.com: `User-agent: *` disallows only promotion terms, gifting, test pages, /glossary/,
/menu/diwali-feast-menus/ and a few /store/ and /journal/ paths (a separate group allows everything for "freddyAibot"; no group
names an Anthropic crawler): the menus read here are allowed. cdn.sanity.io: `User-agent: *` disallows only PDFs. app.served-app.com:
`User-agent: *` Allow: /, Disallow: /account, /login. polite_get checks robots.txt on every URL (RFC 9309).

Terms (https://www.dishoom.com/policies/terms-of-service/, read 2026-11-17): the page says only "Please review our (i) Privacy Policy;
(ii) Cookie Policy; and (iii) Shipping Policy." No clause about copying or reusing the site's content or images was found. Photos would be
installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

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
    ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "dishoom"
HOST = "https://www.dishoom.com"
MENUS = ["all-day-main", "breakfast", "drinks", "desserts", "vegan-main", "children-main"]
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
SANITY = "https://cdn.sanity.io/images/daku84np/production/"
DEFAULT_CACHE = Path("/tmp/menumacros-images-dishoom")
# Photos looked at on contact sheets and left out (none yet: no photo has been found). A rerun must not bring these back.
DROP_ITEMS: dict[str, str] = {}

PUSH = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', re.S)
REF = re.compile(r"image-([0-9a-f]+)-(\d+x\d+)-(jpg|jpeg|png|webp)")


def dish_records(page: str) -> list[dict]:
    """Every {"_type": "dish"} record in the page's own Next.js payload (the data the page is drawn from)."""
    stream = "".join(json.loads('"' + c + '"') for c in PUSH.findall(page))
    out: list[dict] = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("_type") == "dish":
                out.append(o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for line in stream.split("\n"):
        key, sep, rest = line.partition(":")
        if sep and re.fullmatch(r"[0-9a-f]+", key) and rest[:1] in "[{":
            try:
                walk(json.loads(rest))
            except json.JSONDecodeError:
                continue
    if not out:
        raise SystemExit("no dish records found on the menu page: the page has changed shape, re-check before running")
    return out


def picture_url(image) -> str | None:
    """The original file of a dish record's picture, only when it is an asset of Dishoom's own Sanity project."""
    if not isinstance(image, dict):
        return None
    url = image.get("url")
    if isinstance(url, str) and url.startswith(SANITY):
        return url.split("?", 1)[0]
    ref = ((image.get("asset") or {}).get("_ref")) or ""
    m = REF.fullmatch(ref)
    return f"{SANITY}{m.group(1)}-{m.group(2)}.{m.group(3)}" if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, menu page)
    try:
        by_name: dict[str, dict[str, str]] = {}   # norm name -> {photo url: menu page}
        names: set[str] = set()
        total = with_picture = 0
        for menu in MENUS:
            page_url = f"{HOST}/menu/{menu}/"
            page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for rec in dish_records(page):
                total += 1
                name = norm_name(str(rec.get("name") or ""))
                names.add(name)
                url = picture_url(rec.get("image"))
                if rec.get("image") is not None:
                    with_picture += 1
                if url:
                    by_name.setdefault(name, {}).setdefault(url, page_url)
        print(f"{total} dish records on {len(MENUS)} menus of {HOST}; {with_picture} carry a picture")

        for it in items:
            key = norm_name(it["name"])
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if key not in names:
                skipped.append(f"{it['id']}: no dish on the menus is named {it['name']!r}")
                continue
            pics = by_name.get(key, {})
            if not pics:
                skipped.append(f"{it['id']}: the dish record has no picture")
                continue
            if len(pics) > 1:
                skipped.append(f"{it['id']}: dish records named {it['name']!r} carry {len(pics)} different pictures: never chosen between")
                continue
            matched[it["id"]] = next(iter(pics.items()))

        for item_id, (url, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {url.rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows and not (ROOT / "data" / "source" / CHAIN_ID / "images.csv").exists():
        print(f"0 of {len(items)} published items have a photo: images.csv not written (Dishoom's pages publish no dish photo)")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
