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

Photos kept from an earlier run (CARRY_OVER). A row already in images.csv whose item is still published, but whose product page
(the id in its source_url) is no longer in the menu index and answers 404, keeps its photo and its source page as they were verified
on the day of that run: the photo was that exact item's own photo on its own product page, under the same name as our figures (which
were extracted from the same pages on 2026-10-08). The row's source_url then records where the photo was shown, not a live page. A
product id that is off the index but whose page still opens is read like any other product page (today's page decides). Checked
2026-11-17: Tim Hortons has taken its autumn limited-time range off the site (the nacho range, fajita tenders, matcha, pumpkin spice
and maple caramel s'mores drinks and donuts, Monty the Moose, Breakfast Burrito, the double muffin stacks, Breakfast Tea, Oat and
Coconut Milk: 40 published items, their pages answer 404). Carried on 2026-11-17 (retrieved and looked at 2026-10-07, looked at
again 2026-11-17): breakfast-burrito, double-bacon-and-egg-muffin-stack-streaky-bacon, double-sausage-and-egg-with-cheese-muffin-stack,
nacho-double-cheeseburger, nacho-chilli-cheese-bites-8pc, maple-caramel-smores-latte, -frapp and -iced-capp (small, medium, large).
When re-extraction removes such an item from items.csv, load_items no longer returns it and the rerun drops its photo. write_images_csv
stamps one date on every row, so the file keeps its earlier retrieved_on date when every row the run writes is exactly as it was (same
photo file, byte for byte, same source page; rows may only have been left out), and is dated today otherwise; the run prints every
carried row with the date it was really retrieved.

Left out after looking at every photo on contact sheets (2026-11-17), by the stored file (the sha256 of the chain's own bytes, so the
same picture cannot come back under another address; a new, clean picture of the same item would be used after a look): DROP_FILES.
26 items whose photo carries a red "NEW!" sticker (promotional lettering: the fajita tenders, the nacho range except the Double
Cheeseburger and the 8-piece bites, Monty the Moose, the s'mores and pumpkin spice donuts, every matcha and pumpkin spice drink), and
the 5 dip pots (Chipotle Mayonnaise, Maple BBQ Sauce, Sweet Chilli Sauce, Tomato Ketchup, Vegan Mayo), whose photo is the sealed pot
with its printed label: a weight ("25g") and an ingredients list with the allergens in bold, which can contradict our allergen table
(the Chipotle Mayonnaise pot shows only EGG in bold, our table, from the chain's product page, has eggs and mustard). DROP_ITEMS keeps
the earlier run's item-level decisions (Oat and Coconut Milk: the photo is the Alpro logo; Breakfast Tea: a pale yellow drink).
Kept after looking: the soft drinks in a glass printed with the drink's own brand (Coca-Cola, Diet Coke, Dr Pepper Zero, Fanta Orange
Zero, Sprite Zero: the drink itself is in the glass, the brand is the item's own name), the coffees in the chain's own red cup, and the
BLT Chicken Wrap, whose photo has the line "Contains bacon" under it (not promotional, no figure, and it agrees with our contains_pork tag).

Terms (https://timhortons.co.uk/legal, "Terms of Use" of Tim Hortons UK & Ireland, read 2026-10-07 and again 2026-11-17, unchanged): "You may use the
Services and print copies of THUKI Content only for noncommercial, informational, personal use, without modification, and
only so long as you comply with these Terms." and "Unless expressly permitted by an authorized person in writing or as
permitted by applicable law, you may not copy, reproduce, distribute, publish, enter into a database, display, perform,
modify, create derivative works from, transmit, or in any way use or exploit any part of the THUKI Content." and "All of the
materials contained on the Websites are copyrighted except where explicitly noted otherwise." Installed on the founder's
decision of 2026-10-06 (CLAUDE.md rule 2; the founder's accepted risk). robots.txt (read 2026-10-07 and again 2026-11-17,
unchanged) is "User-agent: * / Disallow:" (nothing disallowed); polite_get checks it on every URL anyway.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
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
PAGE_ID = re.compile(r"^https://timhortons\.co\.uk/information/(\d+)(?:/\w+)?$")

CARRY_OVER = True   # keep an earlier run's row when its product page has been withdrawn (404): see the docstring

# Items looked at after the first run (2026-10-07) and left without a photo (a rerun must not bring them back).
DROP_ITEMS = {"coconut-milk": "the photo is the Alpro logo", "oat-milk": "the photo is the Alpro logo",
              "breakfast-tea-large": "the photo shows a pale yellow drink, not tea", "breakfast-tea-medium": "same photo as the large",
              "breakfast-tea-small": "same photo as the large"}

# Stored photo files left out after looking (2026-11-17): the file name is the sha256 of the chain's own bytes (store_image).
_NEW = "the photo carries a red 'NEW!' sticker (promotional lettering)"
_POT = ("the photo is the sealed dip pot with its printed label: a weight ('25g') and an ingredients list with allergens in bold, "
        "which can contradict our allergen table")
DROP_FILES = {
    "7485f453f607.webp": _NEW,   # 3 Fajita Spiced Chicken Tenders
    "68d4cf9a3c7f.webp": _NEW,   # 5 Fajita Spiced Chicken Tenders
    "b1a9280123fd.webp": _NEW,   # Maple Caramel S'mores Deluxe Donut
    "8234c06da5a6.webp": _NEW,   # Monty the Moose Deluxe Donut
    "12abec554e76.webp": _NEW,   # Nacho Cheese Melt
    "feea2b4fdad9.webp": _NEW,   # Nacho Chicken Loaded Fries
    "8ea697b89b85.webp": _NEW,   # Nacho Chicken Sandwich
    "c760490097a1.webp": _NEW,   # Nacho Chicken Stack
    "9fc0ed02b555.webp": _NEW,   # Nacho Chicken Wrap
    "aa370f7698b6.webp": _NEW,   # Nacho Chilli Cheese Bites 4pc
    "8ee4f2eb53fd.webp": _NEW,   # Pumpkin Spice Deluxe Donut
    "c5a55302fba3.webp": _NEW,   # Matcha Frappé (small, medium, large)
    "412095275275.webp": _NEW,   # Matcha Iced Latte (small, medium, large)
    "d626cdc070fb.webp": _NEW,   # Matcha Latte (small, medium, large)
    "77a6f47182e0.webp": _NEW,   # Pumpkin Spice French Vanilla (small, medium, large)
    "744b97a18939.webp": _NEW,   # Pumpkin Spice Latte (small, medium, large)
    "6d2048780788.webp": _POT,   # Chipotle Mayonnaise (the pot shows only EGG in bold; our table has eggs and mustard)
    "491bbebdbf05.webp": _POT,   # Maple BBQ Sauce
    "15d594b9b247.webp": _POT,   # Sweet Chilli Sauce
    "f637cb354502.webp": _POT,   # Tomato Ketchup
    "2499cd9f3e5c.webp": _POT,   # Vegan Mayo
}


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


def read_prior() -> tuple[dict[str, tuple[str, str]], dict[str, str]]:
    """The rows images.csv holds now: ({item_id: (file, source_url)}, {item_id: retrieved_on})."""
    path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if not path.exists():
        return {}, {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        got = list(csv.DictReader(f))
    return {r["item_id"]: (r["file"], r["source_url"]) for r in got}, {r["item_id"]: r["retrieved_on"] for r in got}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch pages only, print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    names = {it["id"]: it["name"] for it in items}
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)
    prior, prior_date = read_prior()

    found: dict[str, set[tuple[str, str]]] = {}   # item id -> {(photo url, page url)}
    product_of: dict[str, str] = {}               # item id -> the product page id it was read from
    skipped: list[str] = []
    gone: set[str] = set()                        # product ids whose page answers 404 (withdrawn from the site)

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

    def read_product(pid: str, index_name: str | None) -> None:
        """One product (all its size pages). index_name None = a product id off the menu index (from an earlier run's row)."""
        base_url = INFO + pid
        base = read_product_page(ic.polite_get(base_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
        label_ = index_name if index_name is not None else "(off the menu index)"
        if base["h1"] is None:
            skipped.append(f"{pid} {label_!r}: {base['n_h1']} titles on {base_url}")
            return
        if index_name is not None and base["h1"] != index_name:
            skipped.append(f"{pid} {index_name!r}: the page is titled {base['h1']!r}, not the index name")
            return
        if not base["sizes"]:
            record(base["h1"], base["photo"], base_url, f"{pid}")
            return
        # Sized drink: one product record, three pages. Read each size page and check it is the size it claims.
        # (Fountain drinks have only Medium and Large; every drink has the Medium page, which is the one without a suffix.)
        labels = [s[0] for s in base["sizes"]]
        actives = [s for s in base["sizes"] if s[2]]
        if len(set(labels)) != len(labels) or "Medium" not in labels or actives != [("Medium", "", True)] \
                or any(lab not in SIZE_LABELS or SIZE_LABELS[lab] != suffix for lab, suffix, _ in base["sizes"]):
            skipped.append(f"{pid} {label_!r}: unexpected size switch {base['sizes']}")
            return
        for label, suffix, _ in base["sizes"]:
            page_url = base_url + (f"/{suffix}" if suffix else "")
            pg = base if not suffix else read_product_page(
                ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
            this = [s for s in pg["sizes"] if s[2]]
            if pg["h1"] != base["h1"] or this != [(label, suffix, True)]:
                skipped.append(f"{pid} {label_!r}: {page_url} is not the {label} page of this product")
                continue
            record(f"{base['h1']} ({label.lower()})", pg["photo"], page_url, f"{pid}/{label.lower()}")

    try:
        index = read_index(ic.polite_get(INFO + INDEX_ID, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
        print(f"{len(index)} products in the menu index ({INFO}{INDEX_ID})")
        for pid, index_name in index:
            read_product(pid, index_name)
        # Product ids of an earlier run's rows (published items only) that are no longer in the menu index: a page that still
        # opens is read like any other; a page that answers 404 has been withdrawn (its rows may be carried, see the docstring).
        in_index = {pid for pid, _ in index}
        off_index = sorted({m.group(1) for iid, (_, src) in prior.items() if iid in names
                            for m in [PAGE_ID.match(src)] if m and m.group(1) not in in_index}, key=int)
        for pid in off_index:
            try:
                read_product(pid, None)
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    gone.add(pid)
                else:
                    skipped.append(f"{pid}: {INFO}{pid} answered HTTP {e.code}; its earlier rows are not carried")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    # One photo per item: an item that two pages give different photos has none.
    chosen: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    for item_id, pairs in sorted(found.items()):
        if item_id in DROP_ITEMS:
            skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
            continue
        photos = {p for p, _ in pairs}
        if len(photos) > 1:
            skipped.append(f"{item_id}: {len(photos)} different photos on the site; ambiguous, no photo")
            continue
        chosen[item_id] = (photos.pop(), sorted(pg for _, pg in pairs)[0])

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
                    fname = hashlib.sha256(raw).hexdigest()[:12] + ".webp"   # the name store_image gives these bytes
                    if fname in DROP_FILES:
                        skipped.append(f"{item_id}: dropped after looking ({fname}): {DROP_FILES[fname]}")
                        continue
                    rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
                except urllib.error.HTTPError as e:
                    skipped.append(f"{item_id}: {photo}: HTTP {e.code}")
                except ValueError as e:
                    skipped.append(f"{item_id}: {photo}: {e}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 1

    # Rows of an earlier run whose product page has been withdrawn (404): kept as they were verified (see the docstring).
    carried: list[str] = []
    if CARRY_OVER:
        for item_id, (fname, src) in sorted(prior.items()):
            m = PAGE_ID.match(src)
            if item_id not in names or item_id in chosen or not m or m.group(1) not in gone:
                continue
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: earlier photo dropped: {DROP_ITEMS[item_id]}")
                continue
            if fname in DROP_FILES:
                skipped.append(f"{item_id}: earlier photo dropped after looking ({fname}): {DROP_FILES[fname]}")
                continue
            if not (ic.IMAGES_ROOT / CHAIN / fname).is_file():
                skipped.append(f"{item_id}: earlier photo file {fname} is missing; not carried")
                continue
            if not args.dry_run:
                rows[item_id] = (fname, src)
            carried.append(f"{item_id}: {fname} from {src} (retrieved {prior_date[item_id]}; that page now answers 404)")

    for item in items:
        if item["id"] not in chosen and not any(c.startswith(item["id"] + ":") for c in carried):
            skipped.append(f"{item['id']}: no product page names it with a photo")
    for s in skipped:
        print("  no photo:", s)
    for c in carried:
        print("  carried from an earlier run:", c)
    for photo, ids in sorted(by_photo.items()):
        if len({product_of[i] for i in ids}) > 1:   # sizes of one drink share a photo by design; two products sharing one do not
            print(f"  SHARED PHOTO ACROSS PRODUCTS (look by eye): {photo}: {', '.join(sorted(ids))}")

    if args.dry_run:
        print(f"{len(chosen)} of {len(items)} published items matched today, {len(carried)} more carried from an earlier run "
              f"(dry run: nothing downloaded or written; DROP_FILES is applied to downloaded photos only)")
        return 0
    if rows:
        # write_images_csv dates every row; when every row is exactly as before (same photo file, byte for byte, same page; rows
        # may only have been left out), the earlier date is kept, since nothing in the file was retrieved anew.
        dates = {prior_date[i] for i in rows if i in prior_date}
        unchanged = len(dates) == 1 and all(prior.get(i) == v for i, v in rows.items())
        ic.write_images_csv(CHAIN, rows, retrieved_on=next(iter(dates)) if unchanged else None)
        if unchanged:
            print(f"every row is exactly as before (same photos, byte for byte, same pages): the earlier date {next(iter(dates))} is kept")
        elif carried:
            print(f"NOTE: write_images_csv dated every row today; the {len(carried)} carried rows were retrieved on the dates printed above")
    print(f"{len(rows)} of {len(items)} published items have a photo ({len(carried)} carried from an earlier run)")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  suspected_placeholders: {f} is used by {len(ids)} items: {', '.join(sorted(ids))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
