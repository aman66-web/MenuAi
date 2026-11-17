#!/usr/bin/env python3
"""Item photos for Great Local Pubs from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_great_local_pubs.py --cache DIR [--dry-run]

Source: the brand pages of https://www.greatlocalpubs.co.uk (Stonegate's brand-site platform, the same one Slug & Lettuce, Pubsmiths,
The Chapter Collection, Social Pub & Kitchen, Heritage Pubs and Be At One use), listed in the site's own sitemap
(https://www.greatlocalpubs.co.uk/sitemap.xml -> /sitemaps/brand.xml). The food pages (e.g. /menus/good-pub-food) carry a slider and
picture columns whose <img alt="..."> names the dish shown ("Steak & Ale Pie", "All-Day Breakfast"...). The pictures are served by the
site's own image host 24-social.com through a resizer (https://24-social.com/cdn-cgi/image/<options>/images/<asset>/public); the
untransformed asset (https://24-social.com/images/<asset>/public) is fetched and store_image only downsizes it. The pub pages
(/pubs/<pub>/...) repeat the same brand assets, so only brand pages are read. Blog, sign-up, gift-card, booking, careers, sport and
events pages are not requested.

Match rule (exact; nothing fuzzy). A picture's label is its alt text minus a site-wide " at Great Local Pubs" suffix; an alt written
"<name> | <more>" also offers each part on its own. A published item gets the picture when
  1. a label equals the item's name under norm_name, and no other published item has that name; or, failing that,
  2. a label equals the item's name with only the nutrition guide's annotations removed: the diet markers "(V)", "(VG)",
     "(V-M)", "(VG-M)" (legend marks, as images_pizza_union.py and images_benugo.py already treat them) and the guide's footnote
     "(Excluding … Option, see below)" (the dish is printed as a core and its choice is a separate item); and exactly ONE published item
     reduces to that name (two recipes of one dish, e.g. a (V) and a (VG-M) crumble, share no picture), and no item matched it under 1.
Generic labels ("Burger", "Breakfast", "Sunday Roast Dinner", offer banners) match no item. When one label sits on two different
pictures, the first in page order on the first page (pages sorted by address) is used and the others are printed for checking.
source_url is the brand page that shows that picture with that label.
Run of 2026-11-17: 9 of 344 published items (49 brand pages). Every picture was looked at by eye at full size: plain food photographs,
no lettering, figures, stickers or logos; all 9 kept. Two are cores matched under rule 2 whose picture shows the dish as served, with
the choice the guide prints separately: "Hand-Battered Fish & Chips (Excluding Pea Option, see below)" (the plate has peas) and
"Steak & Ale Pie (Excluding Potato Option, see below)" (the plate has mash). An independent check the same day left both out
(REJECT_ITEMS): the picture shows the choice the item's figures exclude, so 7 photos are kept.

Not used (checked 2026-11-17):
- The nutrition source tkmenus.com/greattraditionalpubs shows no item photos (its only image host, images.tenkites.com, has
  robots.txt `Disallow: /` anyway).
- The "Order & Pay" ordering site the brand links (order.withqikserve.com/Great-Local-Pubs, QikServe; JSON at
  /api/menus?...&outletId=<n>) gives item pictures, but every one is a file on izoneapps-cdn.zonalconnect.com, whose robots.txt
  redirects (HTTP 308) to https://izoneapps.zonalconnect.com/robots.txt: `User-Agent: *` / `Disallow: /`. RFC 9309 says to follow
  the redirect, so those pictures are not fetched. (images_common's urllib on Python 3.9 does not follow a 308 and would read "no
  rules": this script refuses that host itself, below.)

robots.txt (https://www.greatlocalpubs.co.uk/robots.txt, read 2026-11-17): `User-Agent: *`, `Allow: /`, `Disallow: /home$`: the brand
pages are allowed. https://24-social.com/robots.txt (read 2026-11-17) holds only comments (Cloudflare's "content signals" preamble with
no signal and no Disallow line): no rules. polite_get checks robots.txt on every URL (RFC 9309) and stops on 401/403/429.

Terms (the site's footer links https://www.stonegategroup.co.uk/terms-conditions/, read 2026-11-17): "We are the owner or the licensee
of all intellectual property rights in our Websites and Apps, and in the material published on it. ... All such rights are reserved."
"You must not modify the paper or digital copies of any materials you have printed off or downloaded in any way, and you must not use
any illustrations, photographs, video or audio sequences or any graphics separately from any accompanying text." and "No text or data
mining, or web scraping: You shall not conduct, facilitate, authorise or permit any text or data mining or web scraping in relation to
our Websites and Apps ..." An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from images_common import (Blocked, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN = "great-local-pubs"
SITE = "https://www.greatlocalpubs.co.uk"
BRAND = "Great Local Pubs"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
SKIP_PAGES = re.compile(r"/(blog|sign-up|gift-cards?|privacy|terms|make-a-booking|careers|sport|events|where-to-watch)")
RESIZER = re.compile(r"^(https://24-social\.com)/cdn-cgi/image/[^/]+(/images/[^?#]+)$")
REFUSED_HOSTS = ("zonalconnect.com", "images.tenkites.com")   # robots.txt disallows all (see the docstring)
# Looked at by eye on contact sheets (asset name -> why it is left out). A rerun can't bring these back.
REJECT: dict[str, str] = {}
# Items left out by an independent check (item id -> why). A rerun can't bring these back.
REJECT_ITEMS: dict[str, str] = {
    # 2026-11-17: the item's figures exclude the pea choice, but the picture shows the plate with peas
    "hand-battered-fish-and-chips-excluding-pea-option-see-below": "picture shows the peas the item excludes",
    # 2026-11-17: the item's figures exclude the potato choice, but the picture shows the pie with mash
    "steak-and-ale-pie-excluding-potato-option-see-below": "picture shows the mash the item excludes",
}

_MARK = re.compile(r"\s*\((?:v|vg|v-m|vg-m)\)", re.I)
_EXCL = re.compile(r"\s*\(excluding [^)]*\)", re.I)
_SUFFIX = re.compile(r"\s+at\s+" + re.escape(BRAND) + r"\s*$", re.I)


def asset_name(url: str) -> str:
    """https://24-social.com/images/<asset>/public -> <asset>"""
    return url.rsplit("/", 2)[-2]


def reduced(name: str) -> str:
    return norm_name(_EXCL.sub(" ", _MARK.sub(" ", name)))


def labels(alt: str) -> list[str]:
    parts = [alt] + ([p for p in alt.split(" | ")] if " | " in alt else [])
    return [_SUFFIX.sub("", p).strip() for p in parts if p.strip()]


def page_photos(page: str) -> list[tuple[str, str]]:
    """(alt text, original asset URL) for each picture on a page, in page order, deduplicated."""
    out, seen = [], set()
    for tag in re.findall(r"<img\b[^>]*>", page):
        alt = re.search(r'\balt="([^"]*)"', tag)
        src = re.search(r'\ssrc="([^"]*)"', tag)
        if not alt or not src or not alt.group(1).strip():
            continue
        m = RESIZER.match(htmllib.unescape(src.group(1)))
        if not m:
            continue
        url = m.group(1) + m.group(2)
        if (alt.group(1), url) in seen:
            continue
        seen.add((alt.group(1), url))
        out.append((htmllib.unescape(alt.group(1)).strip(), url))
    return out


def brand_pages(cache: Path) -> list[str]:
    index = polite_get(f"{SITE}/sitemap.xml", cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    urls: list[str] = []
    for sm in re.findall(r"<loc>([^<]+)</loc>", index):
        if sm.endswith("/brand.xml"):
            urls += re.findall(r"<loc>([^<]+)</loc>", polite_get(sm, cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
    if not urls:
        raise SystemExit("no brand pages in the sitemap: the site has changed shape")
    return sorted(u for u in set(urls) if u.startswith(SITE) and not SKIP_PAGES.search(u))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN)
    exact: dict[str, list[str]] = {}
    loose: dict[str, list[str]] = {}
    for it in items:
        exact.setdefault(norm_name(it["name"]), []).append(it["id"])
        loose.setdefault(reduced(it["name"]), []).append(it["id"])

    try:
        pages = brand_pages(args.cache)
        found: dict[str, list[tuple[str, str, str]]] = {}   # item id -> [(asset url, page, label)] in page order
        how: dict[str, str] = {}
        for page_url in pages:
            page = polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for alt, url in page_photos(page):
                for label in labels(alt):
                    ids, rule = exact.get(norm_name(label), []), "exact"
                    if not ids:
                        ids, rule = loose.get(reduced(label), []), "annotations removed"
                    if len(ids) != 1:
                        continue
                    found.setdefault(ids[0], []).append((url, page_url, label))
                    how[ids[0]] = rule
        print(f"{len(pages)} brand pages read; {len(found)} of {len(items)} published items are named by a picture's label")

        rows: dict[str, tuple[str, str]] = {}
        for item_id in sorted(found):
            if item_id in REJECT_ITEMS:
                print(f"  no photo for {item_id}: {REJECT_ITEMS[item_id]}")
                continue
            cands = [c for c in found[item_id] if not any(h in c[0] for h in REFUSED_HOSTS)]
            for asset in sorted({asset_name(c[0]) for c in cands} & set(REJECT)):
                print(f"  no photo from {asset} for {item_id}: {REJECT[asset]}")
            usable = [c for c in cands if asset_name(c[0]) not in REJECT]
            if not usable:
                continue
            url, page_url, label = usable[0]
            others = sorted({asset_name(c[0]) for c in usable} - {asset_name(url)})
            note = f" (also labelled so: {', '.join(others)})" if others else ""
            if args.dry_run:
                print(f"  {item_id:55} <- {label!r} [{how[item_id]}] {url.rsplit('/', 2)[-2]} on {page_url}{note}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN, raw)
            except ValueError as e:
                print(f"  no photo for {item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:55} {fname} <- {label!r} [{how[item_id]}] {url.rsplit('/', 2)[-2]}{note}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    if args.dry_run:
        return 0
    if rows:
        write_images_csv(CHAIN, rows)
    else:
        stale = Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN / "images.csv"
        if stale.exists():
            stale.unlink()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
