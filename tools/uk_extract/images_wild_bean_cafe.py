#!/usr/bin/env python3
"""Item photos for Wild Bean Cafe from bp's own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wild_bean_cafe.py --cache DIR [--dry-run]

Source (since bp's new website, read 2026-11-17): ONE page,
https://www.bp.com/en-GB/products-and-services/fuel-and-rewards/offers/wildbean-cafe/food ("Food" on bp's own Wild Bean Cafe pages; the old
address .../en_gb/united-kingdom/home/products-and-services/our-offer/wild-bean-cafe/our-food.html, used on 2026-10-11, now redirects there).
The page is a Next.js page built from bp's content system: every product on it is one card record in the data the page carries
(`self.__next_f.push(...)`), e.g. {"cardType":"CardImageOnTop", "heading":"Steak Slice", "bodyCopy":"433kcal", "alt":"Steak Slice 433kcal",
"imageUrl":"https://assets.bp.com/rendition/6cqieuqhq4no/master/<asset>/<hash>/Wild_Bean_Cafe_Steak_Slice.jpg?w=1200&h=1200&fp_x=0.5&fp_y=0.5"},
and the same card is shown on the page as a picture with an <h3> (the product name) and the calories. The photo is fetched from the record's
own imageUrl exactly as the record gives it: its w and h are the picture's own size in bp's asset store (1200 x 1200 for the "-1200x1200"
files, 1254 x 1254, 1500 x 1500), so bp's image service returns the whole picture, not the 3:2 crops the page's <img> srcset asks for (checked
2026-11-17: the same picture asked for with a width only comes back square, e.g. egg-cheddar-bap.jpg?w=1200 -> 1200 x 1200). store_image does
the only change (downsize to <= 640 px, WebP). The deal banners at the top and bottom of the page have no heading and are ignored.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the card record's heading, less a leading "NEW", has the same norm_name as the item's name ("Ham and Cheese Toastie" = "Ham & Cheese
     Toastie"), and that heading is shown on the page as a card title (<h3>). Words are never dropped or reordered, so "Chicken Goujons"
     does not match "Crispy Chicken Goujons", "Mini Sausage Rolls" does not match "Mini Sausage Roll", "Maple Pecan" does not match "Maple
     Pecan Plait", "Barbecue Sauce" does not match "BBQ Sauce", and a pack of five cookies is not matched to one cookie, and
  2. the calories at the start of the card's text equal the item's calories (the card says 287kcal, the PDF row says 287), so the page and
     the table we publish are talking about the same product and portion ("Bacon & Cheese Turnover" 540kcal on the card against 537 in the
     guide we publish: no photo), and
  3. the card's picture is in bp's own asset store (https://assets.bp.com/rendition/6cqieuqhq4no/master/...), the name is on one card only
     (a name on two cards gives no photo), and the same picture file is not shown on cards with different names (a file shared by two names
     is a page mistake: no photo for either).
Picture file names are never used to match. (The Big Smoke's card names its file "egg-cheddar-bap.jpg"; the picture is the same Big Smoke
bap, brioche bun with egg, bacon and sausage, that the old page showed for The Big Smoke on 2026-10-11, looked at side by side on 2026-11-17.)
Drinks are not in our published items, so only the food page is read.

Looked at on contact sheets 2026-11-17 (all 23 kept rows): six of today's pictures (Cheese & Caramelised Onion Toastie, Cheese & Onion Slice,
Chicken Slice, Cornish Pasty, Sausage Roll, Steak Slice) are the same photographs as on 2026-10-11 with the chain's own small "WILD BEAN cafe"
roundel added in the bottom corner by bp. Kept: it is the chain's own name mark, beside the food, not a sticker, offer, "NEW" flash or a
figure. Nothing else is printed on any kept picture.

Photos kept from an earlier run (CARRY_OVER). A row already in images.csv whose item is still published but which today's page no longer
shows at all (the product is gone from the page, not renamed or re-photographed) is kept: it was matched by the same rule and looked at on the
day of that run. On 2026-11-17 that is Egg & Cheese Bap, Ham & Cheese Croissant and Hot Honey Chicken Flatbread (retrieved and looked at
2026-10-11 from the old our-food.html page, which then showed each one under its exact name with the guide's calories). Their source_url is the
page that showed them; write_images_csv gives every row the run's date, so the true retrieval date is printed by the run. Set CARRY_OVER = False
to drop them instead.

Terms (https://www.bp.com/en-GB/legal-notice, "Ownership of the copyright of this site", read 2026-11-17, the same words as on 2026-10-11):
"You are responsible for obeying all applicable copyright laws. We permit you to make copies of this website as necessary incidental
acts during your viewing of it; and you may take a print for your personal use of so much of the site as is reasonable for private
purposes. All other use is strictly prohibited." That is an express restriction; installed on the founder's decision of 2026-10-06
(his accepted risk). robots.txt (https://www.bp.com/robots.txt, read 2026-11-17): "User-agent: *", an empty "Disallow:", then
"Disallow: /*.html?*" and a list of named bp pages (air bp myinvoice pages, /bp-global-hub/, ...): the Food page is allowed (RFC 9309
matcher). https://assets.bp.com/robots.txt answers 403, which RFC 9309 (and the founder's decision of 2026-10-12) reads as "no rules";
the pictures themselves answer 200.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wild-bean-cafe"
PAGE_URL = "https://www.bp.com/en-GB/products-and-services/fuel-and-rewards/offers/wildbean-cafe/food"
PHOTO_PREFIX = "https://assets.bp.com/rendition/6cqieuqhq4no/master/"   # bp's own asset store, as named by the card records
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wild-bean-cafe")
CARRY_OVER = True
DROP_ITEMS: dict[str, str] = {   # item id -> why it was looked at and left without a photo (applies to today's matches and to carried rows)
    "all-day-breakfast-wrap": "the card's file is 'veggie-breakfast-wrap-wbc-1200x1200.jpg' and the picture shows a wrap of beans and cheese with no "
                              "meat, while the guide says this wrap contains pork: the page has put a different product's photo on this card "
                              "(looked at 2026-10-11 and again 2026-11-17: the same picture)",
    "garlic-sauce": "packaging shot of a third party's (Heinz) branded dip pot with its own printed weights: not a photo of our row's food",
    "sweet-chilli-sauce": "packaging shot of a third party's (Heinz) branded dip pot with its own printed weights: not a photo of our row's food",
}

PUSH = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', re.S)
H3 = re.compile(r"<h3[^>]*>(.*?)</h3>", re.S)
KCAL = re.compile(r"^(\d+(?:\.\d+)?)\s*kcal\b", re.I)
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)


def clean(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("\xa0", " ")
    return " ".join(s.split())


def cards(page_html: str) -> list[dict]:
    """Every product card record the page is built from: {name, kcal, image_url}. A card needs a heading that the page shows as an <h3>,
    calories at the start of its text and a picture; the deal banners (no heading) are not cards."""
    payload = "".join(json.loads(c) for c in PUSH.findall(page_html))
    shown = {clean(h) for h in H3.findall(page_html)}
    dec = json.JSONDecoder()
    out = []
    for m in re.finditer(r'\{"cardType":', payload):
        try:
            rec, _ = dec.raw_decode(payload, m.start())
        except ValueError:
            continue
        heading = clean(rec.get("heading") or "")
        if not heading or heading not in shown:
            continue
        km = KCAL.match(clean(rec.get("bodyCopy") or ""))
        img = rec.get("imageUrl") or ""
        if not km or not img:
            continue
        out.append({"name": re.sub(r"^NEW\s+", "", heading), "kcal": float(km.group(1)), "image_url": img})
    return out


def file_key(image_url: str) -> str:
    """The picture's identity in bp's asset store: the path without the rendition's size query."""
    return urllib.parse.urlsplit(image_url).path


def earlier_rows() -> list[dict]:
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    published = {it["id"] for it in items}
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page_html = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        cs = cards(page_html)
        if len(cs) < 30:
            print(f"STOP: only {len(cs)} product cards found on {PAGE_URL}; the page has changed shape", file=sys.stderr)
            return 1
        print(f"{len(cs)} product cards on {PAGE_URL}")

        by_name: dict[str, list[dict]] = {}
        files_names: dict[str, set[str]] = {}
        for c in cs:
            by_name.setdefault(norm_name(c["name"]), []).append(c)
            files_names.setdefault(file_key(c["image_url"]), set()).add(norm_name(c["name"]))

        matched: dict[str, str] = {}   # item id -> image url
        on_page: set[str] = set()      # items whose name is on a card today (matched or not): an earlier photo is not carried for them
        for it in items:
            hits = by_name.get(norm_name(it["name"]), [])
            if hits:
                on_page.add(it["id"])
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if not hits:
                skipped.append(f"{it['id']}: no card on the page with the name {it['name']!r}")
                continue
            if len(hits) > 1:
                skipped.append(f"{it['id']}: {len(hits)} cards carry the name {it['name']!r} (ambiguous)")
                continue
            c = hits[0]
            try:
                same_kcal = float(it["calories"]) == c["kcal"]
            except ValueError:
                same_kcal = False
            if not same_kcal:
                skipped.append(f"{it['id']}: the card says {c['kcal']:g} kcal, the published row {it['calories']}")
                continue
            if not c["image_url"].startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: photo {c['image_url']} is not in bp's asset store")
                continue
            if GENERATED.search(urllib.parse.unquote(c["image_url"])):
                skipped.append(f"{it['id']}: file name says AI-generated")
                continue
            if len(files_names[file_key(c["image_url"])]) > 1:
                skipped.append(f"{it['id']}: the picture {file_key(c['image_url']).rsplit('/', 1)[-1]} is shown on cards with different names "
                               f"{sorted(files_names[file_key(c['image_url'])])}: ambiguous")
                continue
            matched[it["id"]] = c["image_url"]

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:45} {file_key(url).rsplit('/', 1)[-1]}")
                continue
            raw = polite_get(url, args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {file_key(url).rsplit('/', 1)[-1]}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
    except Blocked as e:
        print(f"STOP (blocked, nothing written): {e}", file=sys.stderr)
        return 1

    # rows of an earlier run whose product today's page no longer shows at all (see the docstring): kept as they were verified
    carried: list[str] = []
    if CARRY_OVER:
        for r in earlier_rows():
            iid = r["item_id"]
            if iid in matched or iid in on_page or iid not in published:
                continue
            if iid in DROP_ITEMS:
                continue
            if not (IMAGES_ROOT / CHAIN_ID / r["file"]).is_file():
                skipped.append(f"{iid}: earlier photo file {r['file']} is missing; not carried")
                continue
            if not args.dry_run:
                rows[iid] = (r["file"], r["source_url"])
            carried.append(f"{iid}: {r['file']} from {r['source_url']} (retrieved {r['retrieved_on']})")

    for s in skipped:
        print("  skipped:", s)
    for c in carried:
        print("  carried from an earlier run:", c)
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} items matched today, {len(carried)} more carried from an earlier run")
        return 0
    if not rows:
        print("no photo matched; nothing written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    for f, ids in suspected_placeholders(rows).items():
        print(f"LOOK: {f} is used by {len(ids)} items: {ids}")
    print(f"{len(rows)} of {len(items)} items have a photo ({len(rows) - len(carried)} matched today, {len(carried)} carried); "
          f"wrote data/source/{CHAIN_ID}/images.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
