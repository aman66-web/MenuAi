"""Item photos for Be At One (docs/UK_DATA_PLAYBOOK.md, Phase 4).

Source: the chain's own "Bar With Food" page, https://www.beatone.co.uk/menus/bar-with-food. Its photo gallery labels
each photo in the alt text as "<item name> at Be At One" (the same suffix on every image of the site); the photos are
served from the asset host that page uses (24-social.com, the site's own image CDN). We fetch the untransformed asset
(the URL the page's resizer wraps) and store_image only downsizes it.

Match rule: a photo is attached only when its alt text, minus the site-wide " at Be At One" suffix, equals a published
item's name under norm_name. Generic labels ("Bar Bites at Be At One", "Popcorn at Be At One") match no item and are
skipped. When the page labels two photos with the same item name, the first in page order is used.

The nutrition source (menus.tenkites.com/beatone) shows no item photos; the other menu pages (cocktails, alcohol-free
cocktails, new menu, offers) label their photos with names that are not our published items (e.g. "Alcohol Free
Margarita", "Verdita Margarita" vs "Verdita Margarita 0%"), so nothing is taken from them.

Checked again 2026-11-17 (all 55 brand pages of www.beatone.co.uk listed in its sitemap, /sitemaps/brand.xml): the only labels that
name a published item are still the two above. "Double Chocolate Brownie & Marshmallows at Be At One" names an item that is held back
(holdback.csv), "Bit Of Me" and "Verdita Margarita" name the alcoholic cocktails, not the published "... 0%" drinks, so nothing more is
taken. The "Order & Pay" ordering site of Stonegate's bars (order.withqikserve.com, QikServe) serves its item pictures only from
izoneapps-cdn.zonalconnect.com, whose robots.txt redirects (HTTP 308) to https://izoneapps.zonalconnect.com/robots.txt: `User-Agent: *`
/ `Disallow: /`, so they are not fetched.

robots.txt (https://www.beatone.co.uk/robots.txt, read 2026-11-17): `User-Agent: *`, `Allow: /`, `Disallow: /home$`: the page is
allowed. https://24-social.com/robots.txt (read 2026-11-17) holds only comments (Cloudflare's "content signals" preamble, no signal and
no Disallow line): no rules. polite_get checks robots.txt on every URL (RFC 9309) and stops on 401/403/429.

Terms (the site's footer links https://www.stonegategroup.co.uk/terms-conditions/, read 2026-11-17): "You must not modify the paper or
digital copies of any materials you have printed off or downloaded in any way, and you must not use any illustrations, photographs,
video or audio sequences or any graphics separately from any accompanying text." and "You shall not conduct, facilitate, authorise or
permit any text or data mining or web scraping in relation to our Websites and Apps ..." An express restriction; installed on the
founder's decision of 2026-10-06 (his accepted risk). Both photos were looked at again by eye on 2026-11-17.

Usage: python3 tools/uk_extract/images_be_at_one.py --cache <dir> [--dry-run]
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from images_common import (Blocked, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN = "be-at-one"
PAGE = "https://www.beatone.co.uk/menus/bar-with-food"
SUFFIX = re.compile(r"\s+at\s+Be\s+At\s+One\s*$", re.I)
# The page's resizer prefix: https://24-social.com/cdn-cgi/image/<options>/images/<asset>/public
RESIZER = re.compile(r"^(https://24-social\.com)/cdn-cgi/image/[^/]+(/images/.+)$")
# Photos looked at by eye and dropped (asset file names); none so far.
REJECT: set[str] = set()


def page_photos(page_html: str) -> list[tuple[str, str]]:
    """(label, original asset URL) for each <img> on the page, in page order, deduplicated."""
    out, seen = [], set()
    for tag in re.findall(r"<img\b[^>]*>", page_html):
        alt = re.search(r'\balt="([^"]*)"', tag)
        src = re.search(r'\ssrc="([^"]*)"', tag)
        if not alt or not src:
            continue
        m = RESIZER.match(html.unescape(src.group(1)))
        if not m:
            continue
        url = m.group(1) + m.group(2)
        if url in seen:
            continue
        seen.add(url)
        out.append((html.unescape(alt.group(1)).strip(), url))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it["id"])

    try:
        page = polite_get(PAGE, args.cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
    except Blocked as e:
        print(f"STOP: {e}")
        return 2

    rows: dict[str, tuple[str, str]] = {}
    for label, url in page_photos(page):
        key = norm_name(SUFFIX.sub("", label))
        ids = by_name.get(key, [])
        if len(ids) != 1:
            if ids:
                print(f"skip (duplicate item name): {label}")
            continue
        item_id = ids[0]
        if item_id in rows:
            print(f"skip (second photo for {item_id}): {url.rsplit('/', 2)[-2]}")
            continue
        if url.rsplit("/", 2)[-2] in REJECT:
            print(f"skip (rejected by eye): {label}")
            continue
        if args.dry_run:
            rows[item_id] = ("", PAGE)
            print(f"{item_id} <- {label} ({url})")
            continue
        try:
            raw = polite_get(url, args.cache, referer=PAGE)
        except Blocked as e:
            print(f"STOP: {e}")
            return 2
        try:
            fname = store_image(CHAIN, raw)
        except ValueError as e:
            print(f"skip ({e}): {label}")
            continue
        rows[item_id] = (fname, PAGE)
        print(f"{item_id} <- {label} -> {fname}")

    if args.dry_run:
        print(f"{len(rows)} of {len(items)} published items matched (dry run: nothing downloaded or written)")
        return 0
    if rows:
        write_images_csv(CHAIN, rows)
    else:
        stale = Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN / "images.csv"
        if stale.exists():
            stale.unlink()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"LOOK: {f} used by {len(ids)} items: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
