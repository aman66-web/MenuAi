#!/usr/bin/env python3
"""Item photos for Dunkin' UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_dunkin.py [--cache DIR] [--dry-run]

Source: the seven allergen pages the nutrition data came from (https://dunkin.co.uk/allergens-donuts, -munchkins, -cookies, -bakery,
-lto-donuts, -hot-drinks, -cold-drinks) link every product to its own product page (https://dunkin.co.uk/<slug>). A product page shows
ONE photo of the product: <img alt="main product photo" title="<product name>" src="https://dunkin.co.uk/media/catalog/product/cache/<hash>/<file>"
width="700" height="700">, the photo the page itself displays (700 x 700; store_image makes the only change: downsize to <= 640 px, WebP).

Match rule (nothing is matched by slug, file name or similarity): a record on an allergen page (its link text is the product name) gives
a photo to a published item only when
  - the item is that record's own item: same category, same normalised name (drinks: "<name> (Small|Medium|Large)"; the products listed
    on both drink pages carry ", hot" / ", cold" exactly as dunkin.py names them), and
  - the product page's main photo is captioned with the product's name (norm_name equality), OR the allergen page's own link for that
    product holds the same image file (the link then carries the name and the photo together; this is the only case for "Original
    Glazed (OG)", whose product page is titled "The OG").
Photos whose own sticker makes a claim our tables don't (EXCLUDE) are left out. Sizes of a drink share the product's photo (the same product record carries the photo and the size). Held-back items are not published, so
they get none. A record with no published item is not fetched at all.

Terms: dunkin.co.uk/robots.txt Disallows /terms-conditions, so the terms page was NOT fetched (we never go round robots.txt); the pages'
footer reads "(c)2026 DD IP Holder LLC". Installed on the founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (read 2026-10-08): "Crawl-delay: 30", "Disallow: /*?", /catalog/, /index.php/ ...; /media/catalog/product/... and the product
pages are allowed. We wait 31 s between requests to dunkin.co.uk (a full run with an empty cache is about 80 requests: the 7 allergen
pages, the product pages and the photos, so it takes more than an hour; reruns use the cache).

A 401/403/429, a robots refusal or a URL with a query string stops the script (exit 1) before anything is written.

Review of 2026-11-17: every stored photo was looked at again (contact sheets, each distinct picture at about 300 px). 18 pictures (41 rows: Apple, Cherry and
Orange Sours, Banoffee Pie, Chocolate Pistachio, Drac, Frank, Sid, S'mores, Maple Praline, both Dubai Chocolate Mochas, Pumpkin Matcha Oat Latte, Pumpkin Patch
Cloud Latte, both Pumpkin Spiced Lattes, Toasted Marshmallow and Toffee Apple Iced Matcha) carry the chain's round "NEW" badge: refused by file (NEW_BADGE_FILES).
The four EXCLUDE products' pages were read again: Cookie Kreme Blast and Speculoos Sensation still show "NEW RECIPE", Strawberry Jelly and Cinnamon Roll still show
the "Vegan Friendly" leaf. The green "Vegan Friendly" leaf on Chocolate Monster and Smiley is kept: the chain's own allergen page names those products
"- Vegan Friendly" (dunkin.clean_name), so the leaf repeats the chain's own statement. The script was then rerun on the live pages the same day.
Meanwhile the menu data had been re-extracted (data/source/dunkin/items.csv of 2026-11-17: the Christmas range; the Halloween, pumpkin and "Sours" products are gone
from the allergen pages and no longer published), so the rerun found a photo for 35 records on the current pages: the 7 new Christmas products (Crème Brûlée, Custard &
Almond Bretzel, Elf Belly, Rudolf, Santa Belly, Tiramisu, Wreath) all show the "NEW" badge and were added to NEW_BADGE_FILES after looking, as was Banoffee Pie's
picture (unchanged bytes, still badged). Result: 53 of the 65 published items have a photo; every kept photo was looked at on a contact sheet. robots.txt was read
again the same day (Crawl-delay 30, /terms-conditions still disallowed, so the terms were again not read).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dunkin as dk  # noqa: E402  (page list, name rules, SLUG_FIX)
import dunkin_pages as dp  # noqa: E402
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, _robots_allow, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "dunkin"
HOST = dp.HOST
DELAY = float(dp.CRAWL_DELAY)  # robots.txt: Crawl-delay 30
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-dunkin")
SIZES = ("Small", "Medium", "Large")
# Left out after looking at the photo (a rerun must not bring them back). The chain's photo carries a sticker that is a claim of its own,
# which our tables (copied from the chain's allergen pages) do not make or could contradict.
EXCLUDE = {
    "Cookie Kreme Blast": "photo carries a 'NEW RECIPE' sticker",
    "Speculoos Sensation": "photo carries a 'NEW RECIPE' sticker",
    "Cinnamon Roll": "photo carries a 'Vegan Friendly' leaf, but the chain's allergen page does not call it Vegan Friendly",
    "Strawberry Jelly": "photo carries a 'Vegan Friendly' leaf, but the chain's allergen page does not call it Vegan Friendly",
}
# Looked at again 2026-11-17 on contact sheets (every stored photo at about 300 px): these pictures carry the chain's round "NEW" badge, a promotional sticker
# that goes stale (CLAUDE.md rule 2 brief: no "NEW" stickers). Listed by the stored file's name, i.e. the first 12 hex digits of the SHA-256 of the photo's
# bytes (store_image's naming), so exactly these pictures are refused and a later, sticker-free photo of the same product is not (look at it before keeping it).
NEW_BADGE_FILES = {
    "6939f5043082.webp": "Apple Sours", "a29625f3214e.webp": "Banoffee Pie", "daf3e41de504.webp": "Cherry Sours",
    "079fdb52d469.webp": "Chocolate Pistachio", "c61f5e5e6de9.webp": "Drac", "813e44743909.webp": "Dubai Chocolate Mocha, cold",
    "700d6b39c314.webp": "Dubai Chocolate Mocha, hot", "eae5f69a3337.webp": "Frank", "de77630d5b30.webp": "Maple Praline",
    "da61f483e3b6.webp": "Orange Sours", "46573c5f2b2f.webp": "Pumpkin Matcha Oat Latte", "934983c0879a.webp": "Pumpkin Patch Cloud Latte",
    "d580afdfe745.webp": "Pumpkin Spiced Latte, cold", "b2b1e583c8da.webp": "Pumpkin Spiced Latte, hot", "b52fa611e55f.webp": "Sid",
    "7e3996038b85.webp": "S'mores", "1e32f15cbfa9.webp": "Toasted Marshmallow Iced Matcha", "61df77f5fbac.webp": "Toffee Apple Iced Matcha",
    # the Christmas range on the pages of 2026-11-17, looked at the same day: every one carries the "NEW" badge
    "8b48a0ced869.webp": "Crème Brûlée", "12d730edb950.webp": "Custard & Almond Bretzel", "cf71dc0b693a.webp": "Elf Belly",
    "d93a8f19d948.webp": "Rudolf", "0056c41b435b.webp": "Santa Belly", "b1354b0e351e.webp": "Tiramisu", "73e4ec57cfb6.webp": "Wreath",
}

MAIN_PHOTO = re.compile(r'<img\s+alt="main product photo"\s+title="(?P<title>[^"]*)"[^>]*?\ssrc="(?P<src>[^"]+)"', re.S)
PHOTO_URL = re.compile(r"^https://dunkin\.co\.uk/media/catalog/product/(?:cache/[0-9a-f]{32}/)?(?P<file>[A-Za-z0-9_./%-]+\.(?:png|jpe?g|webp))$")


def anchor_images(text: str) -> dict[str, list[str]]:
    """product URL -> the image file(s) inside that product's own link on an allergen page (same region as dp.read_allergen_page)."""
    region = text[text.find("COLD DRINKS"):text.find('<div class="newsletter')]
    out: dict[str, list[str]] = {}
    for m in re.finditer(r'<a\b[^>]*href="(https://dunkin\.co\.uk/[^"#]+)"[^>]*>(.*?)</a>', region, flags=re.S):
        if dp._clean(re.sub(r"<[^>]+>", "", m.group(2))):
            out[m.group(1)] = [PHOTO_URL.match(s).group("file") for s in re.findall(r'<img[^>]*\ssrc="([^"]+)"', m.group(2)) if PHOTO_URL.match(s)]
    return out


def display_name(page: str, rec_name: str, is_drink: bool) -> tuple[str, str]:
    """(product name as printed without 'Vegan Friendly', the name dunkin.py gives its items)."""
    base, _ = dk.clean_name(rec_name)
    if is_drink and rec_name in dk.BOTH_PAGES:
        return base, f"{base}, {'hot' if page == 'allergens-hot-drinks' else 'cold'}"
    return base, base


def fetch_html(url: str, cache: Path) -> str:
    if "?" in url:
        raise Blocked(f"robots.txt disallows URLs with a query string: {url}")
    if not _robots_allow(url):   # also for cached pages: the rule is about the URL, not about whether we hold a copy
        raise Blocked(f"robots.txt disallows {url}")
    return polite_get(url, cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")


def previous_rows() -> dict[str, dict]:
    """The rows of the images.csv an earlier run wrote (item id -> row), or {}."""
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: r for r in csv.DictReader(f)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and list only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[tuple[str, str], list[dict]] = {}
    for it in items:
        by_key.setdefault((it["category"], norm_name(it["name"])), []).append(it)

    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    claimed: set[str] = set()
    covered: set[str] = set()   # published items that a record on today's allergen pages names (whatever the outcome for its photo)
    before = previous_rows()
    try:
        for page, (category, _limited, _expected, is_drink) in dk.PAGES.items():
            text = fetch_html(f"{HOST}/{page}", args.cache)
            records = dp.read_allergen_page(text, page)       # stops the run if the layout changed
            in_link = anchor_images(text)
            for rec in records:
                base, shown = display_name(page, rec["name"], is_drink)
                if base in EXCLUDE:
                    skipped.append(f"{rec['name']}: left out by choice, {EXCLUDE[base]}")
                    continue
                keys = [norm_name(f"{shown} ({s})") for s in SIZES] if is_drink else [norm_name(shown)]
                mine = [it for k in keys for it in by_key.get((category, k), [])]
                covered.update(it["id"] for it in mine)
                if not mine:
                    skipped.append(f"{rec['name']} ({category}): no published item (held back or not listed): not fetched")
                    continue
                dup = [it["id"] for it in mine if it["id"] in claimed]
                if dup:
                    skipped.append(f"{rec['name']} ({category}): items {dup} already matched by another record: no photo")
                    continue
                slug = dk.product_slug(rec["url"])
                product_url = f"{HOST}/{slug}"
                try:
                    product = fetch_html(product_url, args.cache)
                except urllib.error.HTTPError as e:
                    skipped.append(f"{rec['name']}: product page {product_url} answered {e.code}: no photo")
                    continue
                mains = MAIN_PHOTO.findall(product)
                if len(mains) != 1:
                    skipped.append(f"{rec['name']}: {len(mains)} main product photos on {product_url}: no photo")
                    continue
                title, src = mains[0]
                pm = PHOTO_URL.match(html.unescape(src))
                if not pm or "placeholder" in src.lower():
                    skipped.append(f"{rec['name']}: main photo {src!r} is not a catalogue photo: no photo")
                    continue
                if slug != rec["url"].rsplit("/", 1)[1] and norm_name(html.unescape(dp.page_title(product))) != norm_name(rec["name"]):
                    skipped.append(f"{rec['name']}: replacement page {product_url} is titled {dp.page_title(product)!r}: no photo")
                    continue
                name_agrees = norm_name(html.unescape(title)) == norm_name(base)
                link_agrees = pm.group("file") in in_link.get(rec["url"], [])
                if not (name_agrees or link_agrees):
                    skipped.append(f"{rec['name']}: photo captioned {html.unescape(title)!r} and not the allergen page's own link image: no photo")
                    continue
                photo_url = html.unescape(src)
                why = "caption" if name_agrees else "link"
                if args.dry_run:
                    print(f"  {shown:44} [{why}] {len(mine)} item(s)  {photo_url.split('/media/catalog/product/')[1]}")
                    claimed.update(it["id"] for it in mine)
                    continue
                raw = polite_get(photo_url, args.cache, delay=DELAY, referer=product_url)
                badge = NEW_BADGE_FILES.get(hashlib.sha256(raw).hexdigest()[:12] + ".webp")
                if badge:
                    skipped.append(f"{rec['name']}: the photo carries a 'NEW' badge (looked at 2026-11-17, {badge}): no photo")
                    continue
                try:
                    fname = store_image(CHAIN_ID, raw)
                except ValueError as e:
                    skipped.append(f"{rec['name']}: {photo_url}: {e}")
                    continue
                for it in mine:
                    rows[it["id"]] = (fname, product_url)
                    claimed.add(it["id"])
                print(f"  {shown:44} [{why}] {fname}  {len(mine)} item(s) <- {photo_url.split('/media/catalog/product/')[1]}", flush=True)
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"dry run: {len(claimed)} of {len(items)} published items would get a photo")
        return 0
    # A product no longer on today's allergen pages (withdrawn) whose item is still published keeps the photo an earlier run matched to it on the
    # chain's own product page (same name, looked at), with that page as its source, unless that photo is one of the NEW_BADGE_FILES.
    for item_id, prev in sorted(before.items()):
        if item_id in covered or item_id in rows or item_id not in {it["id"] for it in items}:
            continue
        if prev["file"] in NEW_BADGE_FILES or not (IMAGES_ROOT / CHAIN_ID / prev["file"]).exists():
            print(f"  no photo: {item_id}: no longer on the allergen pages and its earlier photo carries a 'NEW' badge (or is gone)")
            continue
        rows[item_id] = (prev["file"], prev["source_url"])
        print(f"  kept: {item_id}: no longer on the allergen pages: kept the photo matched on {prev['retrieved_on']} ({prev['file']})")
    # A run that only confirms what an earlier run stored (every row the same file and page as before, rows only removed) keeps that run's date: the
    # files are byte for byte the ones retrieved then (store_image names a file by the hash of the source bytes). Anything new or changed: today's date.
    dates = {r["retrieved_on"] for r in before.values()}
    same = bool(before) and len(dates) == 1 and all(i in before and (before[i]["file"], before[i]["source_url"]) == v for i, v in rows.items())
    if rows:
        write_images_csv(CHAIN_ID, rows, retrieved_on=dates.pop() if same else None)
    if same:
        print("every photo is the same file as the earlier run's: its date is kept")
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
