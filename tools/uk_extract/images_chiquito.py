#!/usr/bin/env python3
"""Item photos for Chiquito from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_chiquito.py --cache DIR [--dry-run]

Source: the pages of www.chiquito.co.uk listed in its own sitemap (https://www.chiquito.co.uk/sitemap.xml: menu, kids, cocktails,
offers, Christmas, takeaway and the seven restaurant pages; one request each, cached). The site is a Nuxt 2 page whose pictures are
files in the Big Table Group's Contentful space (images.ctfassets.net/hhagtzhy2px1, the asset host the pages use; nothing else is
accepted). Each picture is rendered as an <img data-src="..."> with the asset's own title as its alt/title attribute: that is how the
page names a photo.

Where the photos are NOT taken from: the dish photos of the Ten Kites menu that /menu embeds (menus.tenkites.com/thebigtg/chiquito02, the
menu tools/uk_extract/chiquito.py reads the nutrition from; the site's own content entry for the menu holds only that address) are files
on images.tenkites.com, whose robots.txt (read 2026-11-17) says "User-agent: * / Allow: /tenkitestest/menus.html / Disallow: /". We
honour that and do not fetch them, and we do not look for "the same file" elsewhere (that would be working round the rule). Takeaway and
delivery go through Deliveroo, Just Eat and Uber Eats (third parties: never used); the restaurant pages carry no menu of their own.

Match rule (exact, nothing fuzzy): a picture whose alt or title, the name the page shows for it, has the same images_common.norm_name as
exactly one published item. A picture whose alt and title name two different published items gives no photo; an item that two different
Contentful assets picture gets none (ambiguous). Near names are never matched: "Festive Burger at Chiquito" is not a dish name.
Photos looked at on contact sheets and left out go in DROP_ITEMS / SKIP_ASSETS so a rerun can't bring them back.

robots.txt (https://www.chiquito.co.uk/robots.txt, read 2026-11-17): "User-agent: * / Allow: /" plus the sitemap line; no group names an
AI crawler. images.ctfassets.net is checked by polite_get like every host (RFC 9309). A 401/403/429, a robots refusal or an unreadable
robots.txt stops the script (exit 2) before anything is written.

Terms (read 2026-11-17): https://www.chiquito.co.uk/terms-and-conditions (the only terms the footer links; sections General terms /
Booking policy, Offers, Partner offers, Local offers, Gift cards) covers bookings, offers and gift cards; no clause about copying or
reusing the website's content or images was found. The footer reads "© 2026 Chiquito Part of The Big Table Group Limited."
A photo, if one ever matches, is installed on the founder's decision of 2026-10-06 (his accepted risk; taken down the day the chain asks).

Run of 2026-11-17: the sitemap's 21 pages less SKIP_PATHS, plus the home page (18 pages, 40 picture names), were read. Every picture on them is a banner or hero titled generically
("CHQ Menu Hero", "homepage asset 3", "Chqs-kids-fajita-pc", "CHQ Offers Image 1", "menupage_asset_hero_desktop", ...) or with a
caption that is not a dish name ("Festive Burger at Chiquito", "Festive Cocktails at Chiquito": the Christmas menu, not in our data).
No heading or string on any page names a published item. 0 of 192 published items matched, so no images.csv is written. The only
per-dish photos the chain shows are the Ten Kites ones above, which robots.txt forbids us to fetch.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "chiquito"
SITE = "https://www.chiquito.co.uk"
SITEMAP = SITE + "/sitemap.xml"
ASSET_PREFIX = "https://images.ctfassets.net/hhagtzhy2px1/"   # the Contentful space the chain's pages use
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# Sitemap pages not read: policies and forms carry no food pictures.
SKIP_PATHS = {"/cookie-policy", "/privacy-policy", "/contact", "/sign-up"}
# Looked at on contact sheets and left without a photo (item id -> why); a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {}
# Contentful asset ids never used (asset id -> why), e.g. a picture with promotional lettering.
SKIP_ASSETS: dict[str, str] = {}


def asset_url(url: str) -> str | None:
    """https URL of a Contentful file in the chain's space, without resize parameters; None for anything else."""
    url = htmllib.unescape(url).split("?", 1)[0]
    if url.startswith("//"):
        url = "https:" + url
    return url if url.startswith(ASSET_PREFIX) else None


def asset_id(url: str) -> str:
    return url[len(ASSET_PREFIX):].split("/", 1)[0]


def page_pictures(page: str) -> list[tuple[str, set[str]]]:
    """(photo url, {alt, title}) of every rendered <img> or <picture> <source> whose file is in the chain's Contentful space
    (the desktop picture of a tile is a <source> with its own title; the phone picture is the <img>)."""
    out = []
    for tag in re.findall(r"<(?:img|source)\b[^>]*>", page, re.I):
        src = re.search(r'\s(?:data-src|src|data-srcset|srcset)\s*=\s*"([^"\s,]+)', tag)
        url = asset_url(src.group(1)) if src else None
        if not url:
            continue
        names = set()
        for attr in ("alt", "title"):
            m = re.search(r"\s" + attr + r'\s*=\s*"([^"]*)"', tag)
            if m and m.group(1).strip():
                names.add(htmllib.unescape(m.group(1)))
        out.append((url, names))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; download no photo, write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it["id"])

    found: dict[str, dict[str, tuple[str, str]]] = {}   # item key -> {asset id: (photo url, page url)}
    skipped: list[str] = []
    seen_titles: set[str] = set()
    try:
        sm = ic.polite_get(SITEMAP, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        paths = []
        for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", sm):
            if loc.startswith(SITE):
                path = loc[len(SITE):] or "/"
                if path not in SKIP_PATHS and path not in paths:
                    paths.append(path)
        if "/" not in paths:
            paths.insert(0, "/")
        if len(paths) < 2:
            raise SystemExit("the sitemap lists no pages: it has changed shape")
        print(f"{len(paths)} pages from {SITEMAP} (and the home page)")
        for path in paths:
            page_url = SITE + path
            page = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for url, names in page_pictures(page):
                seen_titles |= names
                keys = {ic.norm_name(n) for n in names} & by_name.keys()
                if len(keys) > 1:
                    skipped.append(f"{path}: picture {url.rsplit('/', 1)[-1]} is named as two different dishes ({', '.join(sorted(keys))})")
                elif keys:
                    key = keys.pop()
                    found.setdefault(key, {}).setdefault(asset_id(url), (url, page_url))
                    print(f"  match {key!r} on {path}: {url.rsplit('/', 1)[-1]}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2
    print(f"{len(seen_titles)} different picture names on the pages: {', '.join(sorted(seen_titles))}")

    rows: dict[str, tuple[str, str]] = {}
    for key, by_asset in sorted(found.items()):
        ids = by_name[key]
        if len(ids) > 1:
            skipped.append(f"'{key}' is the name of {len(ids)} published items ({', '.join(ids)}): no photo")
            continue
        item_id = ids[0]
        if item_id in DROP_ITEMS:
            skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
            continue
        usable = {a: v for a, v in by_asset.items() if a not in SKIP_ASSETS}
        for a in by_asset.keys() - usable.keys():
            skipped.append(f"{item_id}: asset {a} not used: {SKIP_ASSETS[a]}")
        if len(usable) > 1:
            skipped.append(f"{item_id}: {len(usable)} different photos on the site ({', '.join(sorted(usable))}): ambiguous, no photo")
            continue
        if not usable:
            continue
        photo, page_url = next(iter(usable.values()))
        if args.dry_run:
            print(f"{item_id}: {photo}  <- {page_url}")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=page_url)
            rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            print(f"{item_id}: {rows[item_id][0]}  <- {photo.rsplit('/', 1)[-1]} on {page_url}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")

    for s in skipped:
        print("skip:", s)
    if args.dry_run:
        print(f"{sum(1 for k in found if len(by_name[k]) == 1)} published items matched (before drop and ambiguity rules)")
        return 0
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
