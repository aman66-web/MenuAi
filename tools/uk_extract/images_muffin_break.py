#!/usr/bin/env python3
"""Item photos for Muffin Break UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_muffin_break.py --cache DIR [--dry-run]

Result of 2026-11-17: 0 of 491 published items can be given a photo. Nothing is written (no images.csv) while nothing matches.

Where the items come from: tools/uk_extract/muffin_break.py reads the chain's allergen app (https://allergens-muffinbreak.co.uk/allergens/mbuk,
data file /csv/allergens_MBUK.csv). That app shows names and tables only: its page and its JavaScript (assets/index-*.js,
AllergensRoute-*.js, RecipesContext-*.js, read 2026-11-17) load no product picture at all (the only image is the Muffin Break logo).

Where the chain shows food pictures (https://muffinbreak.co.uk, a WordPress site; it answered normally on 2026-11-17, no Cloudflare page):
  * /our-menu/ and its seven pages (muffins, coffee, cakes-slices, breakfast, lunch, low-gluten, cold-drinks): category headings and text
    ("Premium Delight Muffins", "Toasties", "Smoothies"...), no product photo, except /our-menu/coffee/, whose pictures are drawn cup icons
    (*-icon-300x267.png: drawings, never used: CLAUDE.md rule 2) under generic names ("Latte", "Mocha") that are not our sized items, and
    /our-menu/cakes-slices/, whose two pictures are unnamed shop-counter shots.
  * /order-online/: 13 photos, each above an h3 naming a product to order whole through delivery platforms: "Red Velvet", "Mud Cake",
    "Carrot Cake", "Biscoff Cheesecake", "Coffee Cake", "Victoria Sponge", "Banana Cake", "Apple Cake", "Mars Bar Slice",
    "Raspberry Coconut Slice", "Cookies", "Strawberry Tarts", "Packs of Muffins". None has the norm_name of a published item (ours are
    the data file's names, e.g. "Cake Victoria Sponge", "Slice - Mars Bar", "Dessert - Biscoff Cheesecake", "Cake Carrot"): words would
    have to be dropped or reordered, which the match rule never does, and the page sells whole cakes and packs, not the per-serving
    slice our figures are for. Not attached.
  * /christmas-menu/ and the 29 other news posts (REST /wp-json/wp/v2/posts, 2016-2022): each has one featured picture for a whole article;
    no title or heading names a published item exactly (Christmas 2022 paninis and muffins, Muffin Lab flavours, Duffin flavours of 2017...).
  * The Muffin Break UK app (App Store id1493520844, Google Play com.muffinbreak) and Just Eat are not the chain's website: not used.

Match rule (exact, nothing fuzzy): a photo would be attached only when an h3 on /order-online/ that comes directly after its <img> (the page's
own layout, nothing between them) has the same norm_name as a published item's name, and the picture is a file under /wp-content/uploads/
on muffinbreak.co.uk that is not a drawn icon. Headings and post titles elsewhere that name an item exactly are only reported ("look by
hand"), never attached automatically, because those pages do not tie one picture to one heading. This script re-checks all of that, so a
rerun picks up photos the day the chain publishes them under the dishes' own names.

robots.txt (read 2026-11-17): https://muffinbreak.co.uk/robots.txt is Yoast's block, `User-agent: *` with an empty `Disallow:` (everything
allowed) and the sitemap; https://allergens-muffinbreak.co.uk/robots.txt answers 404 (no rules). No group names an AI crawler.

Terms (read 2026-11-17): https://muffinbreak.co.uk/terms-conditions/ is an empty page (no text). The only terms with text,
https://muffinbreak.co.uk/click-collect-terms-and-conditions/, say "The images of the goods on our Website are for illustrative purposes only."
and contain no clause about copying or reusing the site's content or images; the privacy and cookie pages have none either. No restrictive
clause was found.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "muffin-break"
HOST = "https://muffinbreak.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-muffin-break")
ORDER_PAGE = HOST + "/order-online/"
OTHER_PAGES = [HOST + p for p in ("/our-menu/muffins/", "/our-menu/coffee/", "/our-menu/cakes-slices/", "/our-menu/breakfast/",
                                  "/our-menu/lunch/", "/our-menu/low-gluten/", "/our-menu/cold-drinks/", "/christmas-menu/")]
POSTS_API = HOST + "/wp-json/wp/v2/posts?per_page=100&_fields=link,title,content"
# Looked at by eye; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {}
ICON = re.compile(r"-icon(-\d+x\d+)?\.(png|jpe?g|webp)$", re.I)   # the coffee page's drawn cup icons: drawings, not photos

TOKENS = re.compile(r'<img[^>]*?\ssrc="([^"]+)"[^>]*>|<h([1-4])[^>]*>(.*?)</h\2>', re.S)


def text(s: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def entry_content(page: str, url: str) -> str:
    start, end = page.find('<div class="entry-content">'), page.find("<!-- .entry-content -->")
    if start < 0 or end < 0:
        raise SystemExit(f"{url}: no entry-content block: the page has changed shape")
    return re.sub(r"<style.*?</style>", "", page[start:end], flags=re.S)


def order_pairs(content: str) -> list[tuple[str, str]]:
    """(heading, picture) where an <img> is followed directly by an h3 (the order page's own layout: picture, then its name)."""
    toks = [("img", m.group(1)) if m.group(1) else (f"h{m.group(2)}", text(m.group(3))) for m in TOKENS.finditer(content)]
    out = []
    for (k1, v1), (k2, v2) in zip(toks, toks[1:]):
        if k1 == "img" and k2 == "h3":
            out.append((v2, htmllib.unescape(v1)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, str] = {}       # item id -> photo url (order page)
    notes: list[str] = []
    try:
        order = entry_content(polite_get(ORDER_PAGE, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"), ORDER_PAGE)
        pairs = order_pairs(order)
        print(f"{len(pairs)} named pictures on {ORDER_PAGE}")
        for heading, src in pairs:
            hits = by_name.get(norm_name(heading), [])
            if not hits:
                notes.append(f"{heading!r} on /order-online/ names no published item exactly")
                continue
            if not src.startswith(HOST + "/wp-content/uploads/") or ICON.search(src):
                notes.append(f"{heading!r}: picture {src} is not a photo file in the site's uploads")
                continue
            for it in hits:
                if it["id"] in DROP_ITEMS:
                    notes.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                else:
                    matched[it["id"]] = src

        # elsewhere: report exact names only (those pages do not tie one picture to one heading)
        for url in OTHER_PAGES:
            content = entry_content(polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"), url)
            for m in TOKENS.finditer(content):
                if m.group(1) is None and norm_name(text(m.group(3))) in by_name:
                    notes.append(f"LOOK BY HAND: {url} has a heading naming {text(m.group(3))!r} exactly")
        posts = json.loads(polite_get(POSTS_API, args.cache, accept="application/json"))
        print(f"{len(posts)} news posts read from {HOST}/wp-json/wp/v2/posts")
        for p in posts:
            names = [text(p["title"]["rendered"])] + [text(h) for h in re.findall(r"<h[1-4][^>]*>(.*?)</h[1-4]>", p["content"]["rendered"], re.S)]
            for n in names:
                if norm_name(n) in by_name:
                    notes.append(f"LOOK BY HAND: post {p['link']} names {n!r} exactly")

        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}")
                continue
            raw = polite_get(url, args.cache, referer=ORDER_PAGE)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                notes.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, ORDER_PAGE)
            print(f"  {item_id:50} {fname}  <- {url.rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for n in notes:
        print(f"  {n}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows:
        print(f"0 of {len(items)} published items have a photo on the chain's own pages: nothing written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
