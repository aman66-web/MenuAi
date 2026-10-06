"""Item photos for Baskin-Robbins UK (docs/UK_DATA_PLAYBOOK.md, Phase 4).

Source: each flavour's own page on the chain's site, https://baskinrobbins.co.uk/flavours/<slug>/, as listed in the site's
own flavours sitemap (https://baskinrobbins.co.uk/flavours-sitemap.xml). Each page is about one flavour: its breadcrumb
(JSON-LD BreadcrumbList, last item = this page) and its WordPress post title ("<Flavour> - Baskin Robbins") name it, and the
scoop photo shown at the top of the page is the page's declared main image (JSON-LD WebPage "#mainImage", the same URL as
the post's featuredImage). The photo is the file the site itself serves from /wp-content/uploads/ (never a resized copy).

Match rule: a page's photo is attached only when the breadcrumb name and the post title agree, that name equals a
published item's name under norm_name, and the main image is the post's featured image and is shown on the page. A name
that appears on two pages, or a page whose two names disagree, gives no photo. The "More Flavours" strip at the foot of
each page (other flavours' pictures) is never used.

Terms (read 2026-10-06, https://baskinrobbins.co.uk/terms-conditions/, "Last updated: June, 2024"): "you must not: frame,
scrape, or extract data from the Site ...; change any paper or digital copies of any materials sourced from the Site, or use
any illustrations, photographs, video or audio sequences, or any graphics separately from any accompanying text; use any of
the content on the Site for commercial purposes without our written permission". robots.txt is empty (no rules).
CLAUDE.md (HEAD, rule 2): a chain whose terms say this gets no photos until the founder confirms for that chain. So run
with --plan (fetches only the HTML pages, writes nothing) until then; without --plan the photos are downloaded and
installed (web/public/menu-images/baskin-robbins/ + data/source/baskin-robbins/images.csv). After installing, look at
every stored file: drop (add to REJECT) any that is not a photo of that flavour or that prints nutrition claims.

Usage: python3 tools/uk_extract/images_baskin_robbins.py --cache <dir> [--plan]
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from images_common import (Blocked, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN = "baskin-robbins"
SITEMAP = "https://baskinrobbins.co.uk/flavours-sitemap.xml"
PAGE_RE = re.compile(r"^https://baskinrobbins\.co\.uk/flavours/[^/]+/$")
UPLOAD_RE = re.compile(r"^https://baskinrobbins\.co\.uk/wp-content/uploads/[^\"'<>\s]+\.(?:webp|png|jpe?g)$", re.I)
TITLE_SUFFIX = re.compile(r"\s+-\s+Baskin[\s-]Robbins\s*$", re.I)
# Photos looked at by eye and dropped (upload file names); none so far.
REJECT: set[str] = set()
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"


def flavour_pages(sitemap_xml: str) -> list[str]:
    urls = re.findall(r"<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*</loc>", sitemap_xml)
    out: list[str] = []
    for u in urls:
        u = html.unescape(u)
        if PAGE_RE.match(u) and u not in out:
            out.append(u)
    return out


def page_entry(page_url: str, page_html: str) -> tuple[str, str] | None:
    """(flavour name, photo URL) from one flavour page, or None when the page does not tie one photo to one name."""
    crumb = main_image = None
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', page_html, re.S):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for node in data.get("@graph", []) if isinstance(data, dict) else []:
            if node.get("@type") == "BreadcrumbList":
                for li in node.get("itemListElement", []):
                    if li.get("@id") == page_url + "#listItem":
                        crumb = li.get("name")
            if node.get("@type") == "WebPage" and node.get("url") == page_url:
                img = node.get("image") or {}
                if isinstance(img, dict) and img.get("@id") == page_url + "#mainImage":
                    main_image = img.get("url")
    post = re.search(r'"post":\{"id":\d+,"title":"([^"]*)","excerpt":"[^"]*","featuredImage":"([^"]*)"\}', page_html)
    if not (crumb and main_image and post):
        return None
    title = TITLE_SUFFIX.sub("", html.unescape(urllib.parse.unquote(post.group(1))))
    featured = post.group(2).replace("\\/", "/")
    crumb = html.unescape(crumb).strip()
    if norm_name(title) != norm_name(crumb):
        print(f"skip (page names disagree: {crumb!r} / {title!r}): {page_url}")
        return None
    if featured != main_image or not UPLOAD_RE.match(main_image):
        print(f"skip (main image is not the featured upload): {page_url}")
        return None
    if f'data-src="{main_image}"' not in page_html and f'src="{main_image}"' not in page_html:
        print(f"skip (main image not shown on the page): {page_url}")
        return None
    return crumb, main_image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--plan", action="store_true", help="fetch the pages only and print the matches; write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it["id"])

    try:
        pages = flavour_pages(polite_get(SITEMAP, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
        entries: list[tuple[str, str, str]] = []
        for url in pages:
            got = page_entry(url, polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
            if got:
                entries.append((got[0], got[1], url))
    except Blocked as e:
        print(f"STOP: {e}")
        return 2

    name_count: dict[str, int] = {}
    for name, _, _ in entries:
        name_count[norm_name(name)] = name_count.get(norm_name(name), 0) + 1

    planned: dict[str, tuple[str, str]] = {}
    for name, photo, page in entries:
        key = norm_name(name)
        ids = by_name.get(key, [])
        if name_count[key] > 1 or len(ids) > 1:
            print(f"skip (name not unique): {name}")
            continue
        if not ids:
            print(f"no published item named {name!r} ({page})")
            continue
        if photo.rsplit("/", 1)[-1] in REJECT:
            print(f"skip (rejected by eye): {name}")
            continue
        planned[ids[0]] = (photo, page)

    if args.plan:
        for item_id in sorted(planned):
            print(f"PLAN {item_id} <- {planned[item_id][0]} ({planned[item_id][1]})")
        print(f"{len(planned)} of {len(items)} published items would get a photo (--plan: nothing downloaded or written)")
        return 0

    rows: dict[str, tuple[str, str]] = {}
    for item_id, (photo, page) in sorted(planned.items()):
        try:
            raw = polite_get(photo, args.cache, referer=page)
        except Blocked as e:
            print(f"STOP: {e}")
            return 2
        try:
            fname = store_image(CHAIN, raw)
        except ValueError as e:
            print(f"skip ({e}): {item_id}")
            continue
        rows[item_id] = (fname, page)
        print(f"{item_id} <- {photo} -> {fname}")

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
