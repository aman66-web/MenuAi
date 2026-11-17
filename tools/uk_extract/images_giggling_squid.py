#!/usr/bin/env python3
"""Item photos for Giggling Squid (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_giggling_squid.py --cache DIR [--dry-run]

Source: Giggling Squid's own click-and-collect ordering site, https://gigglingsquid.orderswift.com/<restaurant> (a white-label
Orderswift storefront, titled and themed "Giggling Squid"). www.gigglingsquid.com links it as its "Click & Collect" / "Order" button
on https://www.gigglingsquid.com/order-for-home/ ("Order & Collect Thai takeaway, at a click of a button ... our popular lunch and kids'
menu"). The storefront is a JavaScript page (route /:restaurant_id) that reads its menu from the Orderswift API; this script makes the
same calls the page makes, nothing else:
    https://api.orderswift.com/operator?handle=gigglingsquid                    -> a "flow" token the page passes on
    https://api.orderswift.com/sites?handle=gigglingsquid&flow=                 -> the restaurants (52 handles on 2026-11-17)
    https://api.orderswift.com/menu?site_handle=<h>&channel=collection&flow=<flow>&handle=gigglingsquid&distinct_id=unused
Each menu record has its own "name" and "image" (a file in the storefront's asset store,
https://s3.eu-west-2.amazonaws.com/orderswift-production/assets/...). Every restaurant's menu is read (on 2026-11-17 all 52 served the
same "Collection Menu June 26", with one photo per name). Hidden categories and items (is_hidden) are not used, because the page does
not show them (the storefront's own code renders `e.is_hidden ? null : ...`); a record counts when at least one restaurant shows it,
and the row's source_url is the storefront page of the first restaurant, in handle order, that shows it. The storefront's prices,
calories and descriptions are not used (the numbers come only from the allergen guide, tools/uk_extract/giggling_squid.py).

Not used: the menu embedded on https://www.gigglingsquid.com/menu/ (Ten Kites, https://viewthe.menu/kaxv) names a photo for many
dishes, but every one is a file on images.tenkites.com, whose robots.txt says "User-agent: * / Allow: /tenkitestest/menus.html /
Disallow: /" (read 2026-11-17): not fetched. The other pictures on www.gigglingsquid.com/menu/ (food1-5-544x544...jpg in an image ticker)
carry no dish name. The Deliveroo-hosted ordering pages (deliveroo.co.uk, gigglingsquid.order.deliveroo.co.uk) are a third party: not used.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when a storefront record's own name equals the item's
name (images_common.norm_name: case, accents, punctuation, emoji, '&'/'and' ignored; no word added, dropped or reordered). So "Live Long
Noodles (VG)" is not "Live Long Noodles", "Khao Mok Pla | Curried Fish" is not "Khao Mok Pla", "Chilli Chickepeas" (the storefront's
spelling) is not "Chilli Chickpeas", "Thai Apple Pie Spring Roll" is not "Thai Apple Pie Spring Rolls", and the curries, Pad Thai, Drunken
Noodles, Gra Pao and Cashew stir-fry (one storefront record with a choice of chicken/prawn/beef/vegetable) are not any of our per-filling
items. A name two published items share gets no photo; a name the storefront shows with two different photos gets none either.

robots.txt (read 2026-11-17):
  * https://www.gigglingsquid.com/robots.txt: "User-agent: * / Disallow: /wp-admin/ / Allow: /wp-admin/admin-ajax.php": the order page is allowed.
  * https://gigglingsquid.orderswift.com/robots.txt: "User-agent: * / Disallow:" (everything allowed).
  * https://api.orderswift.com/robots.txt: "User-agent: * / Disallow: /agent/pay/ / Allow: /": operator, sites and menu allowed.
  * https://s3.eu-west-2.amazonaws.com/robots.txt answers 403 AccessDenied (S3 has no such file): no rules (RFC 9309, a 4xx means no
    rules; images_common treats an S3 403 for robots.txt as a missing file).
  images_common.polite_get honours each of them (RFC 9309), 1 request/second per host; 401/403/429 stop the run.

Terms:
  * Giggling Squid's website terms, https://www.gigglingsquid.com/terms-conditions/ (read 2026-11-17), "Intellectual property": "The
    copyright and other intellectual property rights published on our 'website' are owned by us." (an ownership statement; no clause
    found that expressly forbids copying or reusing images), and "Linking": "You may link to any page of the Website, for
    non-commercial purposes provided that you do so in a way that is fair and legal and which does not damage our reputation or take
    advantage of it."
  * The Orderswift storefront's own "Terms and Conditions" (shown in the storefront, text in its app bundle, "last updated on 27th April
    2020", read 2026-11-17): "You may only use the Service for non-commercial use and only in accordance with these terms and conditions.",
    among the things you may not do "create an electronic database by systematically downloading and storing all of the pages of the
    Service", and "All intellectual property rights in any content of the Service (including text, graphics, software, photographs and
    other images, videos, sound, trade marks and logos) are owned by us or our licensors."
  The storefront's terms are an express restriction; photos are installed on the founder's decision of 2026-10-06 (his accepted risk,
  CLAUDE.md rule 2).

Run of 2026-11-17: 52 storefronts, 3,540 shown records with a photo under 82 different names; 40 names are a published item's name
exactly (3 of them in the "Thai Lunch Boxes" category, which one restaurant, Leeds, showed at the time of reading). 3 were left out
(DROP_ITEMS: the children's Spring Rolls, and two drinks shown as another brand's can), so 37 of 204 published items have a photo. Every
kept photo was looked at on contact sheets and at full size: plain studio photos of the dish on Giggling Squid's own plates, baskets and
printed paper liners (a decorative squid pattern, no words, figures, prices or stickers). The lunch-set photos were checked against the
storefront's own list of each set's four dishes. Some storefront calorie figures (menu dated June 2026) differ from the October 2026 guide
for the same name (e.g. Golden Money Bags 345 vs 215 kcal): the photo is of the dish the chain names; the numbers shown are the guide's.
The other 167 items have no storefront record of their exact name: drinks and desserts of the restaurant menus, the kids' set picks, the
Big Squids menu, the seafood specials and sharing platters (not sold for collection), the per-filling curries, Pad Thai, Drunken Noodles,
Gra Pao and Cashew stir-fries (one record with a choice of filling), and dishes the storefront spells differently (see the match rule).
After every run, look at every photo kept on contact sheets (photo_sheet.py) and add any that must not be used to DROP_ITEMS.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "giggling-squid"
OS_STORE = "https://gigglingsquid.orderswift.com"
OS_API = "https://api.orderswift.com"
OS_HANDLE = "gigglingsquid"
OS_IMAGE_PREFIX = "https://s3.eu-west-2.amazonaws.com/orderswift-production/assets/"
JSON_ACCEPT = "application/json, text/plain, */*"
DEFAULT_CACHE = Path("/tmp/menumacros-images-giggling-squid")

# item id -> why it gets no photo (checked by hand; a rerun must not bring these back)
DROP_ITEMS: dict[str, str] = {
    # The storefront's "Spring Rolls" (Small Plates & Sharers: "Crispy veggie spring rolls served with homemade sweet chilli sauce",
    # 285 kcal) is the dish the allergen guide calls "Veg Spring Rolls" (285 kcal). Our item named "Spring Rolls" is the Big Squids
    # (children's) side, 176 kcal: the same name, but a different serving, so the sharer's photo would show another portion.
    # (The menu embedded on www.gigglingsquid.com/menu/ also gives "Veg Spring Rolls" the picture file spring_rolls.png.)
    "spring-rolls": "the storefront's 'Spring Rolls' record is the sharer the guide calls 'Veg Spring Rolls' (285 kcal); our 'Spring Rolls' "
                    "is the Big Squids children's side (176 kcal), a different serving",
    # Looked at on contact sheets 2026-11-17: the picture is another company's branded can, not Giggling Squid's own food.
    "cloudy-lemonade": "the picture is a Ben Shaw's Cloudy Lemonade can (a third-party brand's pack, not the chain's food)",
    "ginger-beer": "the picture is an Old Jamaica Ginger Beer can (a third-party brand's pack, not the chain's food)",
}


def get_json(url: str, cache: Path) -> dict:
    return json.loads(ic.polite_get(url, cache, accept=JSON_ACCEPT).decode("utf-8"))


def storefront_records(cache: Path, report: list[str]) -> list[tuple[str, str, str]]:
    """[(photo url, record name, storefront page url)] for every shown record with a photo, on every Giggling Squid storefront."""
    flow = get_json(f"{OS_API}/operator?handle={OS_HANDLE}", cache).get("flow") or ""
    sites = get_json(f"{OS_API}/sites?handle={OS_HANDLE}&flow=", cache).get("data") or []
    handles = sorted({s["handle"] for s in sites if s.get("handle")})
    if not handles:
        raise SystemExit("the Orderswift site list is empty: the API has changed shape")
    print(f"{OS_STORE}: {len(handles)} restaurants")
    out: list[tuple[str, str, str]] = []
    menus: dict[str, int] = {}
    for h in handles:
        url = f"{OS_API}/menu?site_handle={h}&channel=collection&flow={flow}&handle={OS_HANDLE}&distinct_id=unused"
        try:
            menu = (get_json(url, cache).get("data") or {}).get("menu") or {}
        except urllib.error.HTTPError as e:   # 401/403/429 raise Blocked inside polite_get and stop the run
            report.append(f"storefront {h}: the menu call answered HTTP {e.code}: skipped")
            continue
        if not menu.get("categories"):
            report.append(f"storefront {h}: no menu returned: skipped")
            continue
        menus[menu.get("name") or "?"] = menus.get(menu.get("name") or "?", 0) + 1
        for cat in menu.get("categories") or []:
            if cat.get("is_hidden"):
                continue
            for it in cat.get("items") or []:
                img = it.get("image") or ""
                name = (it.get("name") or "").strip()
                if it.get("is_hidden") or not img or not name:
                    continue
                if not img.startswith(OS_IMAGE_PREFIX):
                    report.append(f"storefront {h}: {name!r}: picture {img!r} is not in the storefront's asset store: skipped")
                    continue
                out.append((img, name, f"{OS_STORE}/{h}"))
    print(f"  menus served: {menus}")
    return out


def match(found: list[tuple[str, str, str]], by_name: dict[str, list[dict]], content, report: list[str]) -> dict[str, tuple[str, str]]:
    """{item id: (photo url, page url)} for every published item whose name one storefront record carries exactly.

    A name two published items share gets nothing. If a name comes with several photo URLs, they are compared by their bytes
    (`content(url, page)` = sha256 of the file): byte-identical uploads count as one photo; two different photos under one name get nothing."""
    photos: dict[str, dict[str, list[str]]] = {}    # norm name -> {photo url: [page urls, in handle order]}
    for url, name, page in found:
        pages = photos.setdefault(ic.norm_name(name), {}).setdefault(url, [])
        if page not in pages:
            pages.append(page)
    out: dict[str, tuple[str, str]] = {}
    for key, urls in sorted(photos.items()):
        items = by_name.get(key, [])
        if not items:
            continue
        if len(items) > 1:
            report.append(f"{key!r}: {len(items)} published items share this name: no photo")
            continue
        if len(urls) > 1 and len({content(u, urls[u][0]) for u in urls}) > 1:
            report.append(f"{items[0]['id']}: the storefront shows {len(urls)} different photos under this name: no photo")
            continue
        url = sorted(urls)[0]
        out[items[0]["id"]] = (url, sorted({p for v in urls.values() for p in v})[0])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true",
                    help="match and report only; store nothing, write no CSV (photos are downloaded only to compare several uploads of one name)")
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    def content(url: str, page: str) -> str:
        return hashlib.sha256(ic.polite_get(url, args.cache, referer=page)).hexdigest()

    report: list[str] = []
    try:
        found = storefront_records(args.cache, report)
        print(f"  {len(found)} shown menu records with a photo, {len({ic.norm_name(n) for _, n, _ in found})} different names")
        matched = match(found, by_name, content, report)
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    rows: dict[str, tuple[str, str]] = {}
    kept = 0
    for item_id, (url, page) in sorted(matched.items()):
        if item_id in DROP_ITEMS:
            report.append(f"{item_id}: left out: {DROP_ITEMS[item_id]}")
            continue
        kept += 1
        if args.dry_run:
            print(f"  match {item_id:45} <- {page}  {url.rsplit('/', 1)[-1]}")
            continue
        try:
            fname = ic.store_image(CHAIN_ID, ic.polite_get(url, args.cache, referer=page))
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 1
        except ValueError as e:
            report.append(f"{item_id}: {url}: {e}: skipped")
            continue
        rows[item_id] = (fname, page)
        print(f"  {item_id:45} <- {url.rsplit('/', 1)[-1]} -> {fname}")

    for line in report:
        print(f"  no photo: {line}")
    if args.dry_run:
        print(f"{kept} of {len(items)} published items matched")
        return 0
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
