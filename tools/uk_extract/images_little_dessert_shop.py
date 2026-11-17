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
  2. the card states the item's own calories: data-prodkcal on its "Add to Bag" button, or, on a card the store shows as "out of
     stock" (no button), the card's own "N kcal" label; where both are printed they must agree. The figure must equal the item's
     calories in items.csv, and
  3. every card of that name shows the same photo. The menu lists some dishes twice (in "Kunafa Kollection" and again under
     Waffles, Crepes or Cookie Dough) and the site uploaded the same picture twice under two file names (8796/8798 for "Pistachio
     Kunafa Waffle", 8797/8799 for "Kunafa Sushi Crepe", 8795/8802 for "Kunafa Cookie Dough"): photos are compared by their bytes
     (sha256), so byte-identical uploads count as one photo; two different pictures for one name still give no photo.
Cards without a kcal figure, names that are not published (drinks, boxes, CYO builders ...) are ignored.
The site's footer says "All images are for visual purposes only."

History: on 2026-10-08 "Double Chocolate Sea Salt Cookie Dough" was left out because its photo (upload 8657) shows a green pistachio
topping and a strawberry. Re-read 2026-11-17: the dish's own product page (/product/6166/double-chocolate-sea-salt-cookie-dough) describes
it as "Warm double chocolate chip cookie dough topped with crunchy pistachio kunafa, fresh strawberries & Vanilla Ice Cream, finished
with a touch of sea salt", which is what the photo shows, so it is no longer dropped. Since November 2026 the page's minified HTML
writes attribute values without spaces unquoted; both spellings are read.

Terms (https://www.littledessertshop.co.uk/terms, read 2026-11-17, section 3): "The website's branding, text, images and other content
belong to us or our licensors. You may browse the website and save or print information for personal use. Other copying or commercial
use requires permission unless the law allows it." (The version read 2026-10-08 said "YOU must not make any copies of material used on
OUR Website for any business associated use.") Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2: the founder's
accepted risk). robots.txt (https://www.littledessertshop.co.uk/robots.txt, read 2026-11-17, unchanged since 2026-10-08) disallows
/admin/*, /auth/*, /login, /shoppingcart, /checkout, /website/updatecart, filtered /shop and /product*shop*cat=* URLs, /blog/tag|search/*,
/*myid=*; neither /menu/..., /product/<id>/<slug> nor /site/assets/images/uploads/... is disallowed (polite_get checks every URL anyway).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import hashlib
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
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at and left without a photo (a rerun must not bring it back); see History
SKIP_FILES: dict[str, str] = {}   # upload file name -> why it is not used (nutrition text, placeholder...)

CARD_START = re.compile(r'<div class="col-md-4 col-xs-6 menuitem allprods prodid(\d+)\s+cat\d+\s*"')
# The page's HTML is minified: since November 2026 attribute values without spaces are written unquoted (href=/product/...,
# src=/thumbs/..., class=menuimage); values with spaces keep their quotes. Both spellings are accepted.
IMG = re.compile(r'<a href="?(?P<href>/product/\d+/[^"\s>]*)"? title="(?P<title>[^"]*)">\s*<img src="?/thumbs/400px/(?P<file>[A-Za-z0-9_]+\.(?:png|jpe?g|webp))"? class="?menuimage"? alt="(?P<alt>[^"]*)"', re.S)
CAPTION = re.compile(r'<a class="color-type-2 caption" href="?[^"\s>]*"?[^>]*>(?P<t>.*?)</a>', re.S)
DATA_IMAGE = re.compile(r"data-prodimage=([A-Za-z0-9_.]+)")
DATA_KCAL = re.compile(r"data-prodkcal=(\d+(?:\.\d+)?)")
LABEL_KCAL = re.compile(r'<span class="?label label-primary label-nutrition"?>\s*(\d+(?:\.\d+)?) kcal\s*</span>')


def clean(fragment: str) -> str:
    s = re.sub(r"<[^>]+>", " ", fragment)
    return " ".join(html.unescape(s).split())


def cards(page: str) -> list[dict]:
    """Every product card WITH a photo and a kcal figure: id, title, original photo file, kcal, product href."""
    starts = [m.start() for m in CARD_START.finditer(page)] + [len(page)]
    out = []
    for a, b in zip(starts, starts[1:]):
        body = page[a:b]
        im, cap = IMG.search(body), CAPTION.search(body)
        di, kc, lk = DATA_IMAGE.search(body), DATA_KCAL.search(body), LABEL_KCAL.search(body)
        if not (im and cap and (kc or lk)):
            continue
        if di and di.group(1) != im.group("file"):
            continue                       # the card's two image references disagree: not trusted
        if kc and lk and float(kc.group(1)) != float(lk.group(1)):
            continue                       # the card's two calorie figures disagree: not trusted
        if not kc and "btn-outofstock" not in body:
            continue                       # a label without the basket button is used only on an "out of stock" card
        title, alt, caption = clean(im.group("title")), clean(im.group("alt")), clean(cap.group("t"))
        if not (norm_name(title) == norm_name(alt) == norm_name(caption)):
            continue
        out.append({"pid": CARD_START.match(body).group(1), "title": title, "file": im.group("file"),
                    "kcal": float((kc or lk).group(1)), "href": html.unescape(im.group("href"))})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV (downloads only photos it must compare)")
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
        matched = 0
        for item_id, files in sorted(found.items()):
            # Byte-identical uploads under two file names are one photo; two different pictures for one name are not used.
            # (A dry run downloads only the photos of names shown with more than one file name, to compare them.)
            raws = {} if args.dry_run and len(files) == 1 else \
                {f: polite_get(UPLOADS + f, args.cache, referer=PAGE_URL) for f in sorted(files)}
            digests = {hashlib.sha256(r).hexdigest() for r in raws.values()} or {"one file"}
            if len(digests) != 1:
                skipped.append(f"{item_id}: {len(digests)} different photos on the menu page ({', '.join(sorted(files))}); ambiguous")
                continue
            file = sorted(files)[0]
            photo = UPLOADS + file
            matched += 1
            if args.dry_run:
                note = f"  (same bytes as {', '.join(sorted(files)[1:])})" if len(files) > 1 else ""
                print(f"  {item_id:40} {photo}{note}")
                continue
            try:
                fname = store_image(CHAIN_ID, raws[file])
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
        print(f"{matched} of {len(items)} published items matched")
        return 0
    if rows:
        write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
