#!/usr/bin/env python3
"""Item photos for Little Dessert Shop from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_little_dessert_shop.py --cache DIR [--dry-run]

Source: the store menu page https://www.littledessertshop.co.uk/menu/1/city-centre-wolverhampton (the same page
data/source/little-dessert-shop/chain.csv cites; plain server-rendered HTML). Each product is one card:
    <div class="col-md-4 col-xs-6 menuitem allprods prodid6049 cat160 ">
      <div class=img><a href="/product/6049/kinder-bueno-french-toast" title="Kinder Bueno(R) French Toast">
        <img src="/thumbs/400px/8606_10951_df4cabeabcf9_o.png" class=menuimage alt="Kinder Bueno(R) French Toast"/></a> ...
      <a class="color-type-2 caption" href="/product/6049/...">Kinder Bueno(R) French Toast ...</a>
      <a class="... addtobasket" data-prodid=6049 data-prodimage=8606_10951_df4cabeabcf9_o.png data-prodkcal=553 ...>
The menu shows a 400 px thumbnail (/thumbs/400px/<file>); the product page's own main image (and og:image) is the same upload
at full size, /site/assets/images/uploads/<file>. We fetch that original (checked on /product/6049/...) and let store_image do
the only change (downsize to <= 640 px, WebP). Nothing is cropped.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. a card's title (link title, image alt text and caption text all) has the same norm_name as the item's name in the CURRENT
     items.csv, exactly one published item has that name, and
  2. the card states the item's own calories (data-prodkcal equals the item's calories), and
  3. every card of that name shows the same photo file. A name the menu uses twice with two different photos (e.g. "Kunafa
     Sushi Crepe", "Pistachio Kunafa Waffle", "Kunafa Cookie Dough") gets no photo.
Cards without a kcal figure, names that are not published (drinks, boxes, CYO builders ...) are ignored.
The site's footer says "All images are for visual purposes only."

Terms (https://www.littledessertshop.co.uk/terms, read 2026-10-08): "Copyright and Intellectual Property Rights on OUR Website and
its content are owned by US. This includes; logos, trade names, graphics/images, software, written information and any other
material. YOU must not YOURSELF or give permission to anyone else to publish, copy, distribute or change any of the content on
OUR Website. YOU must not make any copies of material used on OUR Website for any business associated use. (c) 2016 LITTLE
DESSERT SHOP Holdings LTD. ... All Rights Reserved". Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2: the
founder's accepted risk). robots.txt (https://www.littledessertshop.co.uk/robots.txt, read 2026-10-08) disallows /admin/*, /auth/*,
/login, /shoppingcart, /checkout, /website/updatecart, filtered /shop and /product*shop*cat=* URLs, /blog/tag|search/*, /*myid=*;
neither /menu/... nor /site/assets/images/uploads/... is disallowed (polite_get checks every URL anyway).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "little-dessert-shop"
BASE = "https://www.littledessertshop.co.uk"
PAGE_URL = BASE + "/menu/1/city-centre-wolverhampton"
UPLOADS = BASE + "/site/assets/images/uploads/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-little-dessert-shop")
DROP_ITEMS: dict[str, str] = {   # items looked at after the first run and left without a photo (a rerun must not bring them back)
    "double-chocolate-sea-salt-cookie-dough": "the site's photo (upload 8657) shows a pistachio-spread topping and a strawberry, not what the name says",
}
SKIP_FILES: dict[str, str] = {}   # upload file name -> why it is not used (nutrition text, placeholder...)

CARD_START = re.compile(r'<div class="col-md-4 col-xs-6 menuitem allprods prodid(\d+)\s+cat\d+\s*"')
IMG = re.compile(r'<a href="(?P<href>/product/\d+/[^"]*)" title="(?P<title>[^"]*)">\s*<img src="/thumbs/400px/(?P<file>[A-Za-z0-9_]+\.(?:png|jpe?g|webp))" class=menuimage alt="(?P<alt>[^"]*)"', re.S)
CAPTION = re.compile(r'<a class="color-type-2 caption" href="[^"]*"[^>]*>(?P<t>.*?)</a>', re.S)
DATA_IMAGE = re.compile(r"data-prodimage=([A-Za-z0-9_.]+)")
DATA_KCAL = re.compile(r"data-prodkcal=(\d+(?:\.\d+)?)")


def clean(fragment: str) -> str:
    s = re.sub(r"<[^>]+>", " ", fragment)
    return " ".join(html.unescape(s).split())


def cards(page: str) -> list[dict]:
    """Every product card WITH a photo and a kcal figure: id, title, original photo file, kcal, product href."""
    starts = [m.start() for m in CARD_START.finditer(page)] + [len(page)]
    out = []
    for a, b in zip(starts, starts[1:]):
        body = page[a:b]
        im, cap, di, kc = IMG.search(body), CAPTION.search(body), DATA_IMAGE.search(body), DATA_KCAL.search(body)
        if not (im and cap and di and kc):
            continue
        if di.group(1) != im.group("file"):
            continue                       # the card's two image references disagree: not trusted
        title, alt, caption = clean(im.group("title")), clean(im.group("alt")), clean(cap.group("t"))
        if not (norm_name(title) == norm_name(alt) == norm_name(caption)):
            continue
        out.append({"pid": CARD_START.match(body).group(1), "title": title, "file": im.group("file"),
                    "kcal": float(kc.group(1)), "href": html.unescape(im.group("href"))})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    found: dict[str, dict[str, str]] = {}      # item id -> {upload file: product href}
    skipped: list[str] = []
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        cs = cards(page)
        print(f"{len(cs)} cards with a photo and calories on {PAGE_URL}")
        for c in cs:
            its = by_key.get(norm_name(c["title"]))
            if not its:
                continue
            if len(its) != 1:
                skipped.append(f"{c['title']!r} is the name of {len(its)} published items")
                continue
            item = its[0]
            if item["id"] in DROP_ITEMS:
                skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                continue
            if c["file"] in SKIP_FILES:
                skipped.append(f"{item['id']}: {c['file']} skipped: {SKIP_FILES[c['file']]}")
                continue
            try:
                cal = float(item["calories"])
            except ValueError:
                skipped.append(f"{item['id']}: no calories in items.csv to check the card against")
                continue
            if cal != c["kcal"]:
                skipped.append(f"{item['id']}: card {c['title']!r} states {c['kcal']:g} kcal, not {cal:g}")
                continue
            found.setdefault(item["id"], {})[c["file"]] = c["href"]

        rows: dict[str, tuple[str, str]] = {}
        for item_id, files in sorted(found.items()):
            if len(files) != 1:
                skipped.append(f"{item_id}: {len(files)} different photos on the menu page ({', '.join(sorted(files))}); ambiguous")
                continue
            (file, _href), = files.items()
            photo = UPLOADS + file
            if args.dry_run:
                print(f"  {item_id:40} {photo}")
                continue
            raw = polite_get(photo, args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
            print(f"  {item_id:40} {fname}  <- {photo}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        n = sum(1 for p in found.values() if len(p) == 1)
        print(f"{n} of {len(items)} published items matched")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
