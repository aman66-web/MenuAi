#!/usr/bin/env python3
"""Item photos for Parsons Bakery from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_parsons_bakery.py --cache DIR [--dry-run]

STATUS 2026-11-17: run (dry run and real run): 1 of 84 published items has a photo (Mince Pie). Parsons Bakery's own website publishes
almost no per-product photos, so this is the whole yield; the script is kept so a rerun picks up any picture the site later names after
a product.

What the chain's own site shows (www.parsonsbakery.co.uk, Squarespace; every page in its sitemap.xml read 2026-11-17 with polite_get):
  * /allergens (the page the menu data comes from, tools/uk_extract/parsons_bakery.py) is a TEXT list of product names, each a link to
    the product's one-page nutrition PDF. Its only pictures are one banner per section (a bread shelf, a baguette, "Collection of
    pasties", a coffee): none is named after a product, so none is used.
  * /order-online says "Currently Unavailable" (no online menu or shop with product cards).
  * The home, shops, gallery, news, the-family and join-the-family pages show shop, staff and general bakery photographs, named by
    their camera file names ("MA2_8283.jpg", "06-02-18_MAB2647.jpg"): not named after a product.
  * The blog posts (one page each) show a few product photographs whose alt text names them: "Parsons Bakery Mince Pie" (the
    December 2022 post /blog/festivemenu, under the heading "The Classic Mince Pie"), and others that are not on our menu ("Parsons
    Bakery Peppermint Crunch", "Caramel Apple & Cinnamon Bun", "Easter Biscuits", "Parsons Bakery Hot Cross Buns", "Heart Biscuit from
    Parsons Bakery", "Parsons Bakery Sourdough bread": our rows are "Large White Sourdough" and "Small Seeded Sourdough", so nothing is
    guessed). The spring 2025 post shows one collage of five new products ("new products.png", alt "") for which no name is given.
  * Not read: /who-we-are (its pictures are an embedded Instagram feed whose alt texts are Instagram captions: social media is never a
    source) and /allergen-category-2-copy-back-up-aug-22nd-2023 (an unlinked back-up copy of the allergens page from August 2023, not the
    current list; its pictures are section banners with alt ""). The /blog/tag/... pages list posts only (all were empty on 2026-11-17).
  * There is no product page, product feed or JSON on the site (the Squarespace ?format=json views are disallowed by robots.txt and
    are not used).

Match rule (exact, nothing fuzzy): a picture whose alt text, the name the page gives it, has the same images_common.norm_name as exactly
one published item, either as it stands or once one of the site's own fixed caption forms is taken off (CAPTION_FORMS): the chain's own
name in front ("Parsons Bakery Mince Pie", "Parsons Mince Pie": the PDF of the same product is titled "Parsons Mince Pie") or behind
("... from Parsons Bakery", "... at Parsons Bakery"). What is left must be a published item's whole name; no other word is dropped,
reordered or approximated. The picture must be a file in the site's own Squarespace content store
(images.squarespace-cdn.com/content/v1/5bf6cdfbe749407fea3ad7b6/..., the site id every page of www.parsonsbakery.co.uk carries); the
original upload the page names (data-image) is fetched once. An item that two different pictures are named after gets none
(ambiguous). Photos looked at on contact sheets and left out go in DROP_ITEMS so a rerun can't bring them back (empty: the one photo kept
shows mince pies in their foil cases, a plain photograph with no lettering, looked at 2026-11-17).

The Mince Pie photo is from the December 2022 post; our figures are from the chain's report dated 11/08/2026 for the same-named product
("Parsons Mince Pie", 101 g). The post describes the same product (Viennese pastry, mince of sultanas, apples, mixed peel and spices).
The picture shows a tray of the pies, not one serving.

robots.txt (https://www.parsonsbakery.co.uk/robots.txt, read 2026-11-17): Squarespace's file, which names AI crawlers (ClaudeBot,
anthropic-ai, GPTBot, ...) in the SAME group as `User-agent: *`; that group disallows only /config, /search, /account, /commerce/digital-
download/, /api/ (except /api/ui-extensions/), /static/ and query strings such as ?format=json, ?tag=, ?author=, ?view=: the sitemap,
the pages and blog posts read here are allowed. images.squarespace-cdn.com answers 404 for robots.txt (no rules). polite_get checks
robots.txt on every URL (RFC 9309), paces 1 request a second per host and stops on 401/403/429.

Terms: none found. The site has no website terms of use, legal or copyright page and no copyright notice in its footer; its only
"T&C's" page (https://www.parsonsbakery.co.uk/tcs, read 2026-11-17) is "Parsons Bakery Monthly £50 Prize Draw – Terms and Conditions",
which says nothing about copying the site's content or pictures. Photos are installed on the founder's decisions of 2026-10-06 (his
accepted risk; taken down the day the chain asks).

A 401/403/429, a robots refusal or an unreadable robots.txt stops the script (exit 2) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "parsons-bakery"
HOST = "https://www.parsonsbakery.co.uk"
SITEMAP = f"{HOST}/sitemap.xml"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-parsons-bakery")
# the site's own Squarespace content store (site id 5bf6cdfbe749407fea3ad7b6, in every page of www.parsonsbakery.co.uk)
CONTENT_STORE = "https://images.squarespace-cdn.com/content/v1/5bf6cdfbe749407fea3ad7b6/"
# sitemap pages not read, and why
SKIP_PAGES = {
    f"{HOST}/who-we-are": "its pictures are an embedded Instagram feed (social media is never a source)",
    f"{HOST}/allergen-category-2-copy-back-up-aug-22nd-2023": "an unlinked back-up copy of the allergens page from August 2023",
}
SKIP_PREFIXES = (f"{HOST}/blog/tag/",)   # lists of posts only
# the site's own fixed ways of naming a picture: the chain's name in front or behind (norm_name forms)
CAPTION_PREFIXES = ("parsons bakery ", "parsons bakerys ", "parsons ")
CAPTION_SUFFIXES = (" from parsons bakery", " at parsons bakery")
# Looked at on contact sheets and left without a photo; a rerun must not bring them back. (Empty: the one photo kept is a plain photograph.)
DROP_ITEMS: dict[str, str] = {}

IMG = re.compile(r"<img\b[^>]*>", re.I)
ATTR = re.compile(r'([\w-]+)\s*=\s*"([^"]*)"')
LOC = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")


def name_keys(alt: str) -> list[str]:
    """The alt text as it stands, then with one of the site's caption forms taken off (norm_name keys)."""
    key = norm_name(alt)
    out = [key]
    for p in CAPTION_PREFIXES:
        if key.startswith(p):
            out.append(key[len(p):])
    for s in CAPTION_SUFFIXES:
        if key.endswith(s):
            out.append(key[: -len(s)])
    return [k for k in out if k]


def page_images(page: str) -> list[tuple[str, str]]:
    """(original upload url, alt) of every <img> in the page that is a file in the site's own content store, scripts left out."""
    body = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", page, flags=re.S | re.I)
    out = []
    for tag in IMG.findall(body):
        attrs: dict[str, str] = {}
        for k, v in ATTR.findall(tag):
            attrs.setdefault(k.lower(), htmllib.unescape(v))   # the first alt is the page's own (Squarespace repeats alt="" after it)
        src = (attrs.get("data-image") or attrs.get("data-src") or attrs.get("src") or "").strip()
        alt = attrs.get("alt", "").strip()
        if not src or not alt:
            continue
        if src.startswith("//"):
            src = "https:" + src
        src = src.split("?", 1)[0]
        if not src.startswith(CONTENT_STORE):
            continue
        out.append((src, alt))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it["id"])

    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, alt)
    ambiguous: set[str] = set()
    seen_alts: list[str] = []
    try:
        sitemap = polite_get(SITEMAP, args.cache, accept="application/xml,text/xml,*/*").decode("utf-8", "replace")
        pages = [u for u in dict.fromkeys(LOC.findall(sitemap))
                 if u.startswith(HOST + "/") or u == HOST]
        if not pages:
            raise SystemExit("the sitemap lists no pages: it has changed shape")
        read = 0
        for page_url in pages:
            if page_url in SKIP_PAGES:
                print(f"  not read: {page_url}: {SKIP_PAGES[page_url]}")
                continue
            if page_url.startswith(SKIP_PREFIXES):
                continue
            try:
                page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                print(f"  not read: {page_url}: HTTP {e.code}")
                continue
            read += 1
            for src, alt in page_images(page):
                ids: list[str] = []
                for key in name_keys(alt):
                    for i in by_name.get(key, []):
                        if i not in ids:
                            ids.append(i)
                seen_alts.append(f"{page_url} {alt!r} -> {src.rsplit('/', 1)[-1]}" + (f"  = {ids}" if ids else ""))
                if len(ids) != 1:
                    continue        # no published item has this exact name (or the name fits two: nothing is guessed)
                item_id = ids[0]
                prev = matched.get(item_id)
                if prev and prev[0] != src:
                    ambiguous.add(item_id)
                    continue
                matched.setdefault(item_id, (src, page_url, alt))

        print(f"{len(seen_alts)} named pictures in the site's content store on {read} pages:")
        for s in seen_alts:
            print(f"  {s}")
        for item_id in sorted(ambiguous):
            print(f"  no photo: {item_id}: two different pictures are named after it")
            matched.pop(item_id, None)
        for item_id in sorted(set(matched) & set(DROP_ITEMS)):
            print(f"  no photo: {item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
            matched.pop(item_id)
        for item_id, (url, page_url, alt) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}  <- alt {alt!r} on {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                print(f"  no photo: {item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {url.rsplit('/', 1)[-1]} (alt {alt!r} on {page_url})")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
