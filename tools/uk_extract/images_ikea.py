#!/usr/bin/env python3
"""Item photos for IKEA UK food from IKEA's own food pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_ikea.py --cache DIR [--pages DIR] [--dry-run]

Source: the five sales-area listing pages https://www.ikea.com/gb/en/food/salesareas/<area>/ (restaurant, bistro, swedish-cafe,
swedish-bite, swedish-deli: ikea.AREAS) and each item's own page https://www.ikea.com/gb/en/food/salesareas/<area>/<PRF id>/ (the pages
tools/uk_extract/ikea.py read the numbers from). Both carry a __NEXT_DATA__ JSON with the item record and its `mainImage.url`, a file on
IKEA's own product image store: in October 2026 https://storage.googleapis.com/fpi_product_images_prod/<uuid>, since November 2026
https://iff-prd.aws.inter.ikea.net/api/<uuid>/<uuid>/full (inter.ikea.net is Inter IKEA Systems' own domain; the pages load their
pictures from it). The published item was built from exactly that record (ikea.SPEC maps IKEA item id -> our name), so the photo and the
numbers are tied by the same product record, which is the rule's "same product record carries both the photo and the item's size/variant".
IKEA gives several dishes the same title ("Meatballs", "Hot Beverage"), so the id from SPEC is the key, never the title; the title is only
checked against SPEC (a changed title gives no photo).

Which page: the item's own page under the first area whose listing lists the item id (IKEA moved some items between menus after October,
and an item page opens only under an area that lists it). If IKEA lists the item but its own page answers 404 (seen 2026-11-17 for the
8 and 12 Chicken Meatballs with Chips), the record on the listing page itself is used (same item id; the listing card shows the photo with
the dish's description) and the listing page is the row's source.

Keeping what is still right:
  * a photo already in images.csv whose stored file is the same picture as the one IKEA's record carries now (compared at 48 x 48 grey on
    white, mean difference under SAME_PICTURE; same photos measured 0.1-0.5, re-shot or re-framed ones 15+) keeps its file, so a rerun
    after IKEA moved its image store does not replace 100+ files with re-encoded copies of the same photos; only the source page is updated;
  * an item IKEA no longer lists at all (a dish taken off the menu; our items.csv still publishes it from the October record) keeps the
    photo stored from its own record on 2026-10-09 and that record's page as the source, and is printed as "kept"; nothing new is fetched
    for it. 10 such items on 2026-11-17 (the chicken curry dishes and their sides, Rice Mix with Vegetables, Shrimp & Egg Sandwich,
    Cheesecake with Berries & Meringue Pieces, Soft Ice Cream with KEXCHOKLAD): when ikea.py is next rerun they leave items.csv and
    their photos go with them.
write_images_csv stamps every row with the day of the run.

`--pages DIR` is where ikea.py's item-<PRF>.json / listing-<area>.json files are looked for first (default: the --cache folder); a
missing page is fetched once with polite_get (robots.txt honoured, 1 request/second). The photo is the `mainImage.url` original, one
fetch each. A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: 112 photos, none added (102 from records IKEA lists today, 97 of them the same picture as stored, so their files
were kept; 10 kept for items IKEA no longer lists). The six items without a photo are the ones in DROP_ITEMS; their records still carry
the same pictures (looked at again). IKEA's record now carries a re-shot photo for five items, stored and looked at on a contact sheet:
12 Chicken Meatballs with Chips, 12 Chicken Meatballs with Mashed Potatoes, 4 Meatballs with Mashed Potatoes and Cous Cous with
Vegetables (the same dish re-framed) and Vegetable Lasagne (now a styled table shot of the lasagne with cutlery and a glass beside it).
The October source pages of 14 rows answer 404: the 5 IKEA still lists now point at the page that opens (the 8 and 12 Chicken Meatballs
with Chips at their listing page, whose own item pages 404); the 9 it no longer lists keep their October page.

Terms (https://www.ikea.com/gb/en/customer-service/terms-conditions/terms-of-use-pub8262e11a/, "Terms of use", read 2026-10-08 and
again 2026-11-17, unchanged): "The content of all parts of the website belongs to IKEA. This includes copyright in all of the text,
descriptions and images." / "Reproduction of part or all of the contents in any form is prohibited unless for personal use." / "None of
the content of our website may be copied or otherwise incorporated into or stored in any other web site, electronic retrieval system,
publication or other work in any form". Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2, the founder's accepted
risk); the chain's photos come down the day it asks.
robots.txt: https://www.ikea.com/robots.txt (read 2026-10-08 and 2026-11-17) disallows search, filter, sorting, cart/checkout, compare
and similar paths for "*"; nothing about /gb/en/food/. https://storage.googleapis.com/robots.txt answers 404 and
https://iff-prd.aws.inter.ikea.net/robots.txt answers 403 (AccessDenied): both "no rules" under RFC 9309 (founder 2026-10-12).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ikea  # noqa: E402  (SPEC: IKEA item id -> title, our name; BASE; AREAS)
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "ikea"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-ikea")
IMAGE_HOSTS = ("https://storage.googleapis.com/fpi_product_images_prod/", "https://iff-prd.aws.inter.ikea.net/api/")
SAME_PICTURE = 2.0    # mean grey difference (0-255) at 48 x 48 below which a stored file is the same photo as IKEA's current one
# item ids looked at on the contact sheets and left without a photo (a rerun must not bring them back); looked at again 2026-11-17:
# IKEA's records still carry the same pictures
DROP_ITEMS: dict[str, str] = {
    "cream-sauce-portion-and-condiments": "the photo is a kitchen scene with a ketchup bottle, not a cream sauce portion",
    "sunflower-spread-portion": "the photo is a third party's branded tub (Flora): a brand pack shot, not the chain's own food",
    "hot-chocolate": "IKEA's record reuses the photo of a milky coffee (shared with Cappuccino and Latte): not recognisably hot chocolate",
    "black-coffee-with-oat-milk": "IKEA's record reuses the black coffee photo: no milk shown",
    "tea-with-milk": "the photo shows tea with no visible milk (shared with Tea with Oat Milk)",
    "tea-with-oat-milk": "the photo shows tea with no visible milk (shared with Tea with Milk)",
}
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


class Gone(Exception):
    """IKEA's page for this item answers 404 (the item left that menu or the site)."""


def page_json(url: str, cache: Path, pages: Path, name: str) -> dict:
    """The page's __NEXT_DATA__ JSON: ikea.py's cached file `name` in --pages if present, else the page fetched once."""
    f = pages / name
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    try:
        html = polite_get(url, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            raise Gone(url) from e
        raise
    m = NEXT_DATA.search(html)
    if not m:
        raise Blocked(f"{url}: the page came back without its __NEXT_DATA__ JSON (a challenge page or a changed site)")
    return json.loads(m.group(1))


def listings(cache: Path, pages: Path) -> dict[str, list[tuple[str, dict]]]:
    """{item id: [(area, the listing's record), ...]} in ikea.AREAS order, from the five sales-area listing pages."""
    out: dict[str, list[tuple[str, dict]]] = {}
    for area in ikea.AREAS:
        data = page_json(f"{ikea.BASE}{area}/", cache, pages, f"listing-{area}.json")
        page = data["props"]["pageProps"]
        if page["salesArea"]["slug"] != area:
            raise SystemExit(f"listing {area} reports sales area {page['salesArea']['slug']!r}: the site changed, re-check this script")
        for p in page["reducedProducts"]:
            out.setdefault(p["item"]["id"], []).append((area, p["item"]))
    return out


def item_record(prf: str, listed: list[tuple[str, dict]], cache: Path, pages: Path) -> tuple[dict, str]:
    """(record, page url): the item's own page under the first listing area where it opens, else the listing's own record."""
    for area, _ in listed:
        url = f"{ikea.BASE}{area}/{prf}/"
        try:
            return page_json(url, cache, pages, f"item-{prf}.json")["props"]["pageProps"]["product"]["item"], url
        except Gone:
            continue
    area, rec = listed[0]
    return rec, f"{ikea.BASE}{area}/"


def earlier_rows() -> dict[str, tuple[str, str]]:
    """{item id: (file, source url)} of the current images.csv rows whose file is still on disk."""
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(f)
                if (IMAGES_ROOT / CHAIN_ID / r["file"]).exists()}


def same_picture(stored: Path, raw: bytes) -> bool:
    from PIL import Image, ImageChops, ImageStat

    def grey(im):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.getchannel("A"))
        return bg.resize((48, 48), Image.LANCZOS).convert("L")

    a, b = Image.open(stored), Image.open(io.BytesIO(raw))
    if abs(a.size[0] / a.size[1] - b.size[0] / b.size[1]) > 0.02:
        return False
    return ImageStat.Stat(ImageChops.difference(grey(a), grey(b))).mean[0] < SAME_PICTURE


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--pages", type=Path, default=None, help="folder with ikea.py's item-<PRF>.json / listing-<area>.json files (default: --cache)")
    ap.add_argument("--dry-run", action="store_true", help="read the records and print the matches; download no photo and write nothing")
    args = ap.parse_args()
    pages = args.pages or args.cache

    published = {i["id"]: i for i in load_items(CHAIN_ID)}
    earlier = earlier_rows()
    chosen: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    kept: dict[str, tuple[str, str]] = {}     # item id -> earlier row, for items IKEA no longer lists
    try:
        listed = listings(args.cache, pages)
        for prf, title, name, _category, _rankable in ikea.SPEC:
            item_id = ikea.ascii_slug(name)
            if item_id not in published:
                continue
            if item_id in DROP_ITEMS:
                print(f"  {item_id}: dropped ({DROP_ITEMS[item_id]})")
                continue
            if prf not in listed:
                if item_id in earlier:
                    kept[item_id] = earlier[item_id]
                    print(f"  {item_id}: IKEA no longer lists {prf}: kept the photo stored from its own record ({earlier[item_id][0]})")
                else:
                    print(f"  {item_id}: IKEA no longer lists {prf}: no photo")
                continue
            rec, page = item_record(prf, listed[prf], args.cache, pages)
            if rec.get("id") != prf or rec.get("title") != title:
                print(f"  {item_id}: IKEA's record {prf} is now {rec.get('id')!r} / {rec.get('title')!r}, expected {title!r}: no photo")
                continue
            img = (rec.get("mainImage") or {}).get("url") or ""
            if not img.startswith(IMAGE_HOSTS):
                print(f"  {item_id}: no photo on IKEA's record ({img!r})")
                continue
            chosen[item_id] = (img, page)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    print(f"{len(chosen)} of {len(published)} published items have a photo on their own IKEA record; {len(kept)} kept from records IKEA no longer lists")
    if args.dry_run:
        for item_id, (url, page) in sorted(chosen.items()):
            print(f"  {item_id:55} {'(has a photo: compared on a real run) ' if item_id in earlier else 'NEW '}{url}  <- {page}")
        return 0

    rows: dict[str, tuple[str, str]] = dict(kept)
    same = changed = new = 0
    try:
        for item_id, (url, page) in sorted(chosen.items()):
            raw = polite_get(url, args.cache, referer=page)
            if item_id in earlier and same_picture(IMAGES_ROOT / CHAIN_ID / earlier[item_id][0], raw):
                rows[item_id] = (earlier[item_id][0], page)
                same += 1
                continue
            try:
                rows[item_id] = (store_image(CHAIN_ID, raw), page)
            except ValueError as e:
                print(f"  {item_id}: {e}, no photo")
                continue
            if item_id in earlier:
                changed += 1
                print(f"  {item_id}: IKEA's record now carries a different photo: {earlier[item_id][0]} -> {rows[item_id][0]} (look at it)")
            else:
                new += 1
                print(f"  {item_id}: NEW {rows[item_id][0]} (look at it)")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    write_images_csv(CHAIN_ID, rows)
    print(f"wrote {len(rows)} photos: {same} unchanged, {changed} changed, {new} new, {len(kept)} kept for items IKEA no longer lists")
    print(f"shared by 4+ items: {suspected_placeholders(rows) or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
