#!/usr/bin/env python3
"""Item photos for Tim Hortons UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_tim_hortons.py --cache <dir> [--dry-run]

Source: https://timhortons.co.uk/information/<id>, the same product pages the nutrition data came from. Every product page
has its name as <h1> and, directly under it in the same <div class="detail">, ONE photo of that product:
    <div class="detail"><h1>Bagel with Cream Cheese</h1>
        <img src="https://timhortons.co.uk/assets/img/products/<file>.jpg" alet="Bagel with Cream Cheese"> ...
(the page's own markup spells the attribute "alet", so there is no usable alt text: the <h1> next to the photo is the
name). The photos are served by timhortons.co.uk itself (/assets/img/products/). The menu index in the sidebar of every
page lists every product id; the index is read from page 56, as the nutrition extraction does (tim_hortons_page.py).

Sized drinks: a drink has a size switch (/information/<id>/small, /information/<id> = Medium, /information/<id>/large).
All three pages are one product record: same <h1>, same photo. The published items are "<name> (small|medium|large)", so
each size page is read and its photo goes to the item of that size (source_url = that size's page).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when a product page's <h1> (plus
" (small|medium|large)" on a page of a size switch, with the active size checked against the page's own switch) is equal
to the item name in the CURRENT data/source/tim-hortons/items.csv under images_common.norm_name, and the page has exactly
one photo under that <h1> in the product's own folder /assets/img/products/. No matching by file name, slug, similarity or
position. Two items with the same name, a name on two pages with different photos, a page with no photo, and the
"NI Only" / "selected stores only" products (their names differ from every published name) get no photo.
A photo that two or more different products share (the chain's own pages decide that) is attached to each of them only
because each page names its product; the run prints those groups ("SHARED PHOTO ACROSS PRODUCTS") so they are looked at by
eye. (Sizes of one drink share their product's photo by design and are not reported.)

Terms (https://timhortons.co.uk/legal, "Terms of Use" of Tim Hortons UK & Ireland, read 2026-10-07): "You may use the
Services and print copies of THUKI Content only for noncommercial, informational, personal use, without modification, and
only so long as you comply with these Terms." and "Unless expressly permitted by an authorized person in writing or as
permitted by applicable law, you may not copy, reproduce, distribute, publish, enter into a database, display, perform,
modify, create derivative works from, transmit, or in any way use or exploit any part of the THUKI Content." and "All of the
materials contained on the Websites are copyrighted except where explicitly noted otherwise." Installed on the founder's
decision of 2026-10-06 (CLAUDE.md rule 2; the founder's accepted risk). robots.txt (read 2026-10-07) is
"User-agent: * / Disallow:" (nothing disallowed); polite_get checks it on every URL anyway.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "tim-hortons"
SITE = "https://timhortons.co.uk"
INFO = f"{SITE}/information/"
INDEX_ID = "56"   # any product page carries the whole menu index
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PHOTO_PREFIX = f"{SITE}/assets/img/products/"
PHOTO_EXT = (".jpg", ".jpeg", ".png", ".webp")

INDEX_LINK = re.compile(r'href="https://timhortons\.co\.uk/information/(\d+)\s*">(.*?)</a>', re.S)
H1 = re.compile(r"<h1>(.*?)</h1>", re.S)
# <h1> then, as the next element in the same detail block, the product photo.
DETAIL = re.compile(r'<div class="detail">\s*<h1>(?P<h1>.*?)</h1>\s*<img src="(?P<src>[^"]*)"', re.S)
SIZE_LINK = re.compile(
    r'<a href="https://timhortons\.co\.uk/information/(?P<id>\d+)(?:/(?P<suffix>\w+))?\s*"(?P<active>\s+class="active")?\s*>'
    r'(?P<letter>[SML])</a><br/>(?P<label>\w+)')
SIZE_LABELS = {"Small": "small", "Medium": "", "Large": "large"}   # label -> URL suffix ('' = the page without a suffix)


def clean(text: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", text)).replace("\xa0", " ").split())


def strip_comments(page: str) -> str:
    # The page keeps an old, switched-off copy of the photo inside an HTML comment: only live markup counts.
    return re.sub(r"<!--.*?-->", "", page, flags=re.S)


def read_index(page: str) -> list[tuple[str, str]]:
    """[(product id, name as the menu index lists it)] in page order, each id once."""
    start = page.find('<div id="accordion">')
    end = page.find('<div class="photo_detail_area', start)
    if start < 0 or end < 0:
        raise SystemExit("No menu index found in the page: the layout changed, re-check the source.")
    out, seen = [], set()
    for pid, name in INDEX_LINK.findall(page[start:end]):
        if pid not in seen:
            seen.add(pid)
            out.append((pid, clean(name)))
    return out


def read_product_page(page: str) -> dict:
    """h1, photo URL (or None) and the size switch [(label, suffix, is_this_page)] of one product page."""
    live = strip_comments(page)
    a = live.find('<div class="photo_detail_area')
    b = live.find('<div class="information_detail">')
    area = live[a:b] if a >= 0 and b > a else ""
    h1s = H1.findall(area)
    details = list(DETAIL.finditer(area))
    photo = None
    if len(h1s) == 1 and len(details) == 1:
        src = html.unescape(details[0].group("src")).strip()
        path = urllib.parse.urlsplit(src).path.lower()
        if src.startswith(PHOTO_PREFIX) and path.endswith(PHOTO_EXT) and "?" not in src and "#" not in src:
            photo = src
    sizes = [(m.group("label"), m.group("suffix") or "", bool(m.group("active"))) for m in SIZE_LINK.finditer(area)]
    return {"h1": clean(h1s[0]) if len(h1s) == 1 else None, "photo": photo, "sizes": sizes, "n_h1": len(h1s),
            "n_photo_blocks": len(details)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch pages only, print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)

    found: dict[str, set[tuple[str, str]]] = {}   # item id -> {(photo url, page url)}
    product_of: dict[str, str] = {}               # item id -> the product page id it was read from
    skipped: list[str] = []

    def record(item_name: str, photo: str | None, page_url: str, what: str) -> None:
        key = ic.norm_name(item_name)
        its = by_key.get(key)
        if not its:
            return                                   # not a published item (NI only, boxes, ...): nothing to say
        if len(its) > 1:
            skipped.append(f"{what}: {item_name!r} is the name of {len(its)} published items")
            return
        if not photo:
            skipped.append(f"{what}: page {page_url} has no usable photo under its title")
            return
        found.setdefault(its[0]["id"], set()).add((photo, page_url))
        product_of[its[0]["id"]] = what.split("/")[0]

    try:
        index = read_index(ic.polite_get(INFO + INDEX_ID, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
        print(f"{len(index)} products in the menu index ({INFO}{INDEX_ID})")
        for pid, index_name in index:
            base_url = INFO + pid
            base = read_product_page(ic.polite_get(base_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
            if base["h1"] is None:
                skipped.append(f"{pid} {index_name!r}: {base['n_h1']} titles on {base_url}")
                continue
            if base["h1"] != index_name:
                skipped.append(f"{pid} {index_name!r}: the page is titled {base['h1']!r}, not the index name")
                continue
            if not base["sizes"]:
                record(base["h1"], base["photo"], base_url, f"{pid}")
                continue
            # Sized drink: one product record, three pages. Read each size page and check it is the size it claims.
            # (Fountain drinks have only Medium and Large; every drink has the Medium page, which is the one without a suffix.)
            labels = [s[0] for s in base["sizes"]]
            actives = [s for s in base["sizes"] if s[2]]
            if len(set(labels)) != len(labels) or "Medium" not in labels or actives != [("Medium", "", True)] \
                    or any(lab not in SIZE_LABELS or SIZE_LABELS[lab] != suffix for lab, suffix, _ in base["sizes"]):
                skipped.append(f"{pid} {index_name!r}: unexpected size switch {base['sizes']}")
                continue
            for label, suffix, _ in base["sizes"]:
                page_url = base_url + (f"/{suffix}" if suffix else "")
                pg = base if not suffix else read_product_page(
                    ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
                this = [s for s in pg["sizes"] if s[2]]
                if pg["h1"] != base["h1"] or this != [(label, suffix, True)]:
                    skipped.append(f"{pid} {index_name!r}: {page_url} is not the {label} page of this product")
                    continue
                record(f"{base['h1']} ({label.lower()})", pg["photo"], page_url, f"{pid}/{label.lower()}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    # One photo per item: an item that two pages give different photos has none.
    chosen: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    # Items looked at after the first run and left without a photo (a rerun must not bring them back).
    drop = {"coconut-milk": "the photo is the Alpro logo", "oat-milk": "the photo is the Alpro logo",
            "breakfast-tea-large": "the photo shows a pale yellow drink, not tea", "breakfast-tea-medium": "same photo as the large",
            "breakfast-tea-small": "same photo as the large"}
    for item_id, pairs in sorted(found.items()):
        if item_id in drop:
            skipped.append(f"{item_id}: dropped after looking: {drop[item_id]}")
            continue
        photos = {p for p, _ in pairs}
        if len(photos) > 1:
            skipped.append(f"{item_id}: {len(photos)} different photos on the site; ambiguous, no photo")
            continue
        chosen[item_id] = (photos.pop(), sorted(pg for _, pg in pairs)[0])

    names = {it["id"]: it["name"] for it in items}
    for item_id, (photo, page_url) in sorted(chosen.items()):
        print(f"  {item_id:58} {names[item_id]!r}\n      photo {photo}\n      page  {page_url}")

    by_photo: dict[str, list[str]] = {}
    for item_id, (photo, _) in chosen.items():
        by_photo.setdefault(photo, []).append(item_id)

    rows: dict[str, tuple[str, str]] = {}
    if not args.dry_run:
        try:
            for item_id, (photo, page_url) in sorted(chosen.items()):
                try:
                    raw = ic.polite_get(photo, args.cache, referer=page_url)
                    rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
                except urllib.error.HTTPError as e:
                    skipped.append(f"{item_id}: {photo}: HTTP {e.code}")
                except ValueError as e:
                    skipped.append(f"{item_id}: {photo}: {e}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 1

    for item in items:
        if item["id"] not in chosen:
            skipped.append(f"{item['id']}: no product page names it with a photo")
    for s in skipped:
        print("  no photo:", s)
    for photo, ids in sorted(by_photo.items()):
        if len({product_of[i] for i in ids}) > 1:   # sizes of one drink share a photo by design; two products sharing one do not
            print(f"  SHARED PHOTO ACROSS PRODUCTS (look by eye): {photo}: {', '.join(sorted(ids))}")

    if args.dry_run:
        print(f"{len(chosen)} of {len(items)} published items matched (dry run: nothing downloaded or written)")
        return 0
    if rows:
        ic.write_images_csv(CHAIN, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  suspected_placeholders: {f} is used by {len(ids)} items: {', '.join(sorted(ids))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
