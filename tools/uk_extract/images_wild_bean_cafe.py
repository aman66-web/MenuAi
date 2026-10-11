#!/usr/bin/env python3
"""Item photos for Wild Bean Cafe from bp's own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wild_bean_cafe.py --cache DIR [--dry-run]

Source: ONE page, https://www.bp.com/en_gb/united-kingdom/home/products-and-services/our-offer/wild-bean-cafe/our-food.html
("Our Food" on bp's own Wild Bean Cafe pages; the ingredient and nutrition PDF tools/uk_extract/wild_bean_cafe_pdf.py reads is linked
from the same section). Every product on it is one card: a picture `<img data-fileref="/content/dam/bp/.../wbc-offers/<file>.jpg"
title="<name> <kcal>kcal">` followed by two headings, the product name and its calories ("Hash Browns" / "287kcal"). The photo is
the original file in bp's own asset store (www.bp.com/content/dam/...), the file the page's data-fileref names; we fetch that
file directly (not the ".img.50.medium.jpg" re-encode) and let store_image do the only change (downsize to <= 640 px, WebP).
The three wide banners at the top of the page (deals) have no product heading and are ignored.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the card's product heading, less a leading "NEW", has the same norm_name as the item's name ("The big smoke" = "The Big Smoke",
     "Egg and Cheese bap" = "Egg & Cheese Bap"). Words are never dropped or reordered, so "Chicken Goujons (Pack of 5)" does not
     match "Crispy Chicken Goujons", "Mini Sausage Rolls" does not match "Mini Sausage Roll", "Maple Pecan" does not match "Maple
     Pecan Plait", and a pack of five cookies is not matched to one cookie, and
  2. the calories printed on the card equal the item's calories (the card says 287kcal, the PDF row says 287), so the page and
     the table we publish are talking about the same product and portion, and
  3. the card's picture is in bp's own asset store (host check) and the name is unique on the page (a name that appears on two
     cards gives no photo), and the same picture file is not shown on cards with different names (a file shared by two names is a
     page mistake: see DROP below).
Drinks are not in our published items, so only the food page is read.

Terms (https://www.bp.com/en_gb/united-kingdom/home/legal-notice.html, "Ownership of the copyright of this site", read 2026-10-11):
"You are responsible for obeying all applicable copyright laws. We permit you to make copies of this website as necessary incidental
acts during your viewing of it; and you may take a print for your personal use of so much of the site as is reasonable for private
purposes. All other use is strictly prohibited." That is an express restriction; installed on the founder's decision of 2026-10-06
(his accepted risk). robots.txt (https://www.bp.com/robots.txt, read 2026-10-11): "User-agent: * / Disallow: / Disallow: /*.html?* /
...a list of named bp pages (fleet, Air bp, ...)": the Wild Bean Cafe page and /content/dam/ are allowed (RFC 9309 matcher).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wild-bean-cafe"
SITE = "https://www.bp.com"
PAGE_URL = SITE + "/en_gb/united-kingdom/home/products-and-services/our-offer/wild-bean-cafe/our-food.html"
PHOTO_PREFIX = "/content/dam/bp/country-sites/en_gb/united-kingdom/home/images/"   # bp's own asset store, as named by data-fileref
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wild-bean-cafe")
DROP_ITEMS: dict[str, str] = {   # item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
    "all-day-breakfast-wrap": "the card's file is 'veggie-breakfast-wrap-wbc1200x1200.jpg' and the picture shows a wrap of beans and cheese with no "
                              "meat, while the guide says this wrap contains pork: the page has put a different product's photo on this card",
    "garlic-sauce": "packaging shot of a third party's (Heinz) branded dip pot with its own printed weights: not a photo of our row's food",
    "sweet-chilli-sauce": "packaging shot of a third party's (Heinz) branded dip pot with its own printed weights: not a photo of our row's food",
}

IMG = re.compile(r'<img[^>]*?data-fileref="([^"]+)"[^>]*?>(.*?)(?=<img[^>]*?data-fileref=|\Z)', re.S)
H5 = re.compile(r"<h5[^>]*>(.*?)</h5>", re.S)
KCAL = re.compile(r"^(\d+(?:\.\d+)?)\s*kcal\b", re.I)
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)


def clean(s: str) -> str:
    s = html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ")
    return " ".join(s.split())


def cards(page_html: str) -> list[dict]:
    """Every product card: {fileref, name, kcal}. A card is a picture followed (before the next picture) by an h5 with the
    product name and an h5 that starts with the calories. Pictures without both (the deal banners) are not cards."""
    out = []
    for fileref, rest in IMG.findall(page_html):
        heads = [clean(h) for h in H5.findall(rest[:3000])]
        heads = [h for h in heads if h]
        if not heads:
            continue
        name = re.sub(r"^NEW\s+", "", heads[0])
        kcal = None
        for h in heads[1:3]:
            m = KCAL.match(h)
            if m:
                kcal = float(m.group(1))
                break
        if kcal is None:
            continue
        out.append({"fileref": html.unescape(fileref), "name": name, "kcal": kcal})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
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
            files_names.setdefault(c["fileref"], set()).add(norm_name(c["name"]))

        matched: dict[str, str] = {}   # item id -> fileref
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            hits = by_name.get(norm_name(it["name"]), [])
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
            if not c["fileref"].startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: photo {c['fileref']} is not in bp's asset store")
                continue
            if GENERATED.search(urllib.parse.unquote(c["fileref"])):
                skipped.append(f"{it['id']}: file name says AI-generated")
                continue
            if len(files_names[c["fileref"]]) > 1:
                skipped.append(f"{it['id']}: the picture {c['fileref'].rsplit('/', 1)[-1]} is shown on cards with different names "
                               f"{sorted(files_names[c['fileref']])}: ambiguous")
                continue
            matched[it["id"]] = c["fileref"]

        for item_id, fileref in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:45} {fileref.rsplit('/', 1)[-1]}")
                continue
            raw = polite_get(SITE + urllib.parse.quote(fileref), args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {fileref.rsplit('/', 1)[-1]}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
    except Blocked as e:
        print(f"STOP (blocked, nothing written): {e}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"{len(matched)} of {len(items)} items would get a photo")
    else:
        if not rows:
            print("no photo matched; nothing written")
            return 0
        write_images_csv(CHAIN_ID, rows)
        for f, ids in suspected_placeholders(rows).items():
            print(f"LOOK: {f} is used by {len(ids)} items: {ids}")
        print(f"{len(rows)} of {len(items)} items have a photo; wrote data/source/{CHAIN_ID}/images.csv")
    for s in skipped:
        print("  skipped:", s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
