#!/usr/bin/env python3
"""Item photos for Caffe Nero from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_caffe_nero.py --cache <dir> [--dry-run]

Source: the eight GB menu pages the nutrition data came from (https://www.caffenero.com/uk/menu/...: food/breakfast,
food/panini-tostati-nero-deli, food/salads-soups-hot-pots, food/snacks, food/sweet-treats, coffee, drinks/hot-drinks,
drinks/iced-drinks). Every product on those pages is ONE record that carries its photo, its name and every milk/size
variant with its nutrition table:
    <button class="menu__product" popovertarget="menu__product-details--<pid>"><img class="menu__product-image" src=...>
        <h4>name</h4> ...</button>
    <div id="menu__product-details--<pid>" popover><img class="menu__product-image" src=...> <h2>name</h2> ...
        one nutrition table per milk option and size ...</div>
The photos are served from the asset bucket those pages themselves load: caffenero-webassets-production.s3.eu-west-2
.amazonaws.com/products/... (no resize parameters, so the file is the original).

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the SAME product record (card and
detail popover agree on the photo and on the name) carries that item's variant: the item name is rebuilt from the
record's printed name + milk + size exactly the way tools/uk_extract/caffe_nero.py built it, and its norm_name must
equal the published item's. So "Porridge (oat milk)" gets the Porridge photo and "Flat White (oat milk, grande)" the
Flat White photo, and nothing is matched by file name or similarity. Northern-Ireland-only products ("(NI)") are not
published and get nothing. An item name that two published items share, that matches no record, or that records on
different pages show with different photos, gets no photo. A page that does not list exactly the expected products
is reported, never guessed at.
Photos in SKIP_FILES (looked at by eye: nutrition text, claims, third-party packs, generic or "coming soon" pictures) and
items in DROP_ITEMS are not used.

Photos kept from an earlier run (CARRY_OVER). A row already in images.csv whose item is still published but which no product
record on today's eight pages names any more (a seasonal or withdrawn product: the menu data still holds it from the pages it
was extracted from) keeps its photo and source page as verified on the day of that run: the photo was then that exact item's own
product record's photo, under the same name. An item that today's pages still list never keeps an old photo: today's record
decides (its current photo, or none if it has none or its photo is in SKIP_FILES). write_images_csv gives every row the run's
date; the carried rows and their true retrieval date are printed by the run, and when every row written is exactly as before the
earlier date is kept. Carried on 2026-11-17 (all retrieved and looked at 2026-10-07; their products are no longer on the pages):
arrabbiata-meatball-pasta, blt-sandwich, brie-and-bacon-panini, butternut-squash-and-pesto-seeded-panini, carrot-cake,
cinnamon-roll-latte-* (7 milks), granola-flapjack, italian-prosciutto-and-yellow-datterini-tomato-flatbread,
lemon-and-blueberry-cake, nero-deli-italian-mozzarella-pesto-and-tomato-pizzetta, sicilian-lemon-meringue-cheesecake,
spiced-pecan-latte-almond-milk. Set CARRY_OVER = False to drop them instead.

Run of 2026-11-17: 311 items matched on today's pages + 18 carried = 329 of 354 published items. The Banoffee Matcha Latte and
Iced Banoffee Matcha Latte records now show new (festive-cup) photos, and their printed figures are unchanged, so the new photos
replaced the October ones. Every kept photo (109 files) was looked at on contact sheets that day; 13 snack pack shots were taken
out (SKIP_FILES: The Protein Ball Co, Deliciously Ella, Forest Feast, Lindt Lindor and Proper popcorn packs, most of them printing
figures or claims). No photo on the chain's own records (checked 2026-11-17): Fruit Salad (the GB record has no image; the "(NI)"
record's photo is a different product), the three Kettle Chips, and the extras (Honey, Raspberry/Strawberry Conserve, Clotted
Cream, Whipped Cream, Plant Based Creamy Topping, Marshmallows). Feta & Grain Salad is no longer on the pages and had no photo
before. The /uk/menu/festive page repeats products from the eight pages (none of the 25 items without a photo) and is not used.

Terms (https://www.caffenero.com/uk/terms-and-conditions, "COPYRIGHT AND TRADE MARKS" and "PERSONAL USE", read
2026-10-06 and again 2026-11-17, unchanged): "Unless otherwise noted, all materials on this site are protected as the copyrights,
trademarks and/or other intellectual properties owned by Caffè Nero ... All rights not expressly granted are reserved." and "Your
use of the materials included on this Site is for informational and shopping purposes only. You agree you will not distribute,
publish, transmit, modify, display or create derivative works from or exploit the contents of this Site in any way save as
expressly permitted in these terms & conditions." Installed on the founder's decision of 2026-10-06 (the founder's accepted risk);
the photos come down the day the chain asks.

robots.txt, www.caffenero.com (read 2026-10-06 and again 2026-11-17, unchanged): "User-agent: * / Disallow: /cp / Disallow: /docs"
(menu pages allowed). The photo host's robots.txt (https://caffenero-webassets-production.s3.eu-west-2.amazonaws.com/robots.txt)
answers HTTP 403 AccessDenied, which is what Amazon S3 returns for any missing object of a bucket whose listing is private. Since the
founder's decision of 2026-10-12 ("follow the standard", RFC 9309: a 4xx for robots.txt means no rules) images_common reads that 403
as no rules; the photos themselves answered 200. Nothing here works round a block: a page or photo answering 401/403/429 stops the run.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
import caffe_nero as cn     # noqa: E402  (naming: clean_name, item_name, MILKS, DEFAULT_MILK; the data script's own rules)

CHAIN = "caffe-nero"
BASE = "https://www.caffenero.com/uk/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PHOTO_HOST = "https://caffenero-webassets-production.s3.eu-west-2.amazonaws.com/"
# photo file name (last URL segment) -> why it is not used. Looked at on contact sheets on 2026-11-17: each of these is a
# third-party brand's wrapped pack (the product as another company sells it) rather than the food, and most packs print figures
# or claims that could contradict our tables or read as calling the food good (CLAUDE.md rules 1-3). A rerun must not bring them back.
_PACK = "a third-party brand's pack, not the food"
SKIP_FILES: dict[str, str] = {
    "the-protein-ball-co-blueberry-oat-muffin.png": f"{_PACK}; prints '7g plant protein' and 'no added sugar or sweeteners'",
    "the-protein-ball-co-lemon-pistachio.png": f"{_PACK}; prints '7g plant protein' and 'no added sugar or sweeteners'",
    "deliciously-ella-apple-&-rasin-oat-bar.png": f"{_PACK}; prints 'source of fibre'",
    "deliciously-ella-cacao-&-almond-oat-bar.png": f"{_PACK}; prints 'source of fibre'",
    "forest-feast-cherries.png": f"{_PACK}; prints '60% cocoa' and 'fully covered in chocolate'",
    "forest-feast-mango.png": f"{_PACK}; prints a 'no added sugar' badge",
    "matcha-chocolate-almonds.png": f"{_PACK} (Forest Feast)",
    "forest-feast-almond.png": f"{_PACK}; prints a 'Great Taste' award badge",
    "pistachio-lindor-bar.png": f"{_PACK} (Lindt's wrapper)",
    "lindor-milk-chocolate.png": f"{_PACK} (Lindt's wrapper)",
    "lindor-salted-caramel.png": f"{_PACK} (Lindt's wrapper)",
    "poporn-sea-salt.png": f"{_PACK} (Proper); prints a kcal figure, 'high in fibre', 'only 3 ingredients' and a 'new recipe' flash",
    "poporn-sweet-&-salty.png": f"{_PACK} (Proper); prints a kcal figure",
}
DROP_ITEMS: dict[str, str] = {}   # item id -> why it gets no photo at all (applies to today's matches and to carried rows)
CARRY_OVER = True                 # keep earlier rows whose product today's pages no longer list (see the docstring)


def product_photos(page: str, path: Path) -> dict[str, dict]:
    """pid -> {'name': h2 text, 'photos': {src of the card image, src of the popover image}, 'card_name': h4 text}."""
    root = cn.parse_html(path)
    out: dict[str, dict] = {}
    for n in root.walk():
        pop = n.attrs.get("popovertarget", "")
        if n.tag == "button" and pop.startswith("menu__product-details--") and "menu__product" in n.classes():
            pid = pop[len("menu__product-details--"):]
            e = out.setdefault(pid, {"name": None, "photos": set(), "card_name": None})
            e["photos"] |= {i.attrs.get("src", "") for i in n.walk() if i.tag == "img" and "menu__product-image" in i.classes()}
            h4 = [h.text() for h in n.walk() if h.tag == "h4"]
            e["card_name"] = h4[0] if h4 else None
        elif n.attrs.get("id", "").startswith("menu__product-details--"):
            pid = n.attrs["id"][len("menu__product-details--"):]
            e = out.setdefault(pid, {"name": None, "photos": set(), "card_name": None})
            e["photos"] |= {i.attrs.get("src", "") for i in n.walk() if i.tag == "img" and "menu__product-image" in i.classes()}
            h2 = [h.text() for h in n.walk() if h.tag == "h2"]
            e["name"] = h2[0] if h2 else None
    return out


def read_rows(path: Path) -> tuple[dict[str, tuple[str, str]], set[str]]:
    """The rows images.csv holds now ({item_id: (file, source_url)}) and the retrieved_on dates in it."""
    if not path.exists():
        return {}, set()
    with open(path, newline="", encoding="utf-8-sig") as f:
        got = list(csv.DictReader(f))
    return {r["item_id"]: (r["file"], r["source_url"]) for r in got}, {r["retrieved_on"] for r in got}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; fetch only the menu pages; write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)

    found: dict[str, set[tuple[str, str]]] = {}   # item id -> {(photo url, page url)}
    listed: set[str] = set()                      # published items some product record on today's pages names
    skipped: list[str] = []
    pages_dir = args.cache / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    try:
        for page, rel in cn.PAGES.items():
            page_url = BASE + rel
            raw = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT)
            saved = pages_dir / f"{page}.html"
            saved.write_bytes(raw)
            photos = product_photos(page, saved)
            for r in cn.read_page(page, saved):
                if r["name"].rstrip().endswith("(NI)"):
                    continue                       # Northern Ireland only: not published
                milk = r["milk"] or cn.DEFAULT_MILK.get(r["pid"], "")
                name = cn.item_name(cn.clean_name(r["name"]), milk, r["size"])
                ids = by_key.get(ic.norm_name(name))
                if ids and len(ids) == 1:
                    listed.add(ids[0]["id"])       # the product is still on today's pages (with or without a usable photo)
                rec = photos.get(r["pid"])
                if not rec or not rec["name"] or not rec["photos"]:
                    skipped.append(f"{page}/{r['pid']}: no photo on the product record")
                    continue
                if len(rec["photos"]) != 1:
                    skipped.append(f"{page}/{r['pid']}: card and detail show different photos {sorted(rec['photos'])}")
                    continue
                if rec["card_name"] is not None and ic.norm_name(rec["card_name"]) != ic.norm_name(rec["name"]):
                    skipped.append(f"{page}/{r['pid']}: card says {rec['card_name']!r}, detail says {rec['name']!r}")
                    continue
                photo = next(iter(rec["photos"]))
                if not photo.startswith(PHOTO_HOST):
                    skipped.append(f"{page}/{r['pid']}: photo {photo} is not on the chain's asset bucket")
                    continue
                fname = photo.rsplit("/", 1)[-1]
                if fname in SKIP_FILES:
                    skipped.append(f"{page}/{r['pid']}: {fname} skipped: {SKIP_FILES[fname]}")
                    continue
                if not ids:
                    continue                       # variant not published (e.g. held back or left out)
                if len(ids) > 1:
                    skipped.append(f"{page}/{r['pid']}: {name!r} is the name of {len(ids)} published items")
                    continue
                found.setdefault(ids[0]["id"], set()).add((photo, page_url))
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    matched: dict[str, tuple[str, str]] = {}      # item id -> (photo url, page url)
    for item_id, pairs in sorted(found.items()):
        if item_id in DROP_ITEMS:
            skipped.append(f"{item_id}: no photo: {DROP_ITEMS[item_id]}")
            continue
        urls = {p for p, _ in pairs}
        if len(urls) > 1:
            skipped.append(f"{item_id}: {len(urls)} different photos on the site; ambiguous, no photo")
            continue
        matched[item_id] = (urls.pop(), sorted(pg for _, pg in pairs)[0])
    names = {it["id"]: it["name"] for it in items}

    # Rows of an earlier run whose item is still published but whose product no record on today's pages names any more (a
    # seasonal or withdrawn product): kept as they were verified (see the docstring). An item still listed today never keeps
    # an old photo: today's record decides (its photo, or none).
    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    before, before_dates = read_rows(csv_path)
    carried: dict[str, tuple[str, str]] = {}
    for item_id, (fname, src) in sorted(before.items()):
        if not CARRY_OVER or item_id in matched or item_id in listed or item_id not in names:
            continue
        if item_id in DROP_ITEMS:
            skipped.append(f"{item_id}: earlier photo dropped: {DROP_ITEMS[item_id]}")
            continue
        if not (ic.IMAGES_ROOT / CHAIN / fname).is_file():
            skipped.append(f"{item_id}: earlier photo file {fname} is missing; not carried")
            continue
        carried[item_id] = (fname, src)

    if args.dry_run:
        for item_id, (photo, page_url) in sorted(matched.items()):
            print(f"{item_id} | {names[item_id]} | {photo} | {page_url}")
        for item_id, (fname, src) in carried.items():
            print(f"carried from an earlier run: {item_id} | {names[item_id]} | {fname} | {src}")
        shared: dict[str, list[str]] = {}
        for item_id, (photo, _) in matched.items():
            shared.setdefault(photo, []).append(item_id)
        for photo, ids in sorted(shared.items()):
            if len(ids) >= 4:
                print(f"LOOK (one photo on {len(ids)} items): {photo}: {', '.join(sorted(ids))}")
        for s in skipped:
            print("skip:", s)
        print(f"{len(matched)} of {len(items)} published items matched today, {len(carried)} more carried from an earlier run")
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}                   # photo url -> stored file name (one download per photo)
    try:
        for item_id, (photo, page_url) in sorted(matched.items()):
            if photo not in stored:
                try:
                    stored[photo] = ic.store_image(CHAIN, ic.polite_get(photo, args.cache, referer=BASE))
                except ValueError as e:
                    stored[photo] = ""
                    skipped.append(f"{photo}: {e}")
            if stored[photo]:
                rows[item_id] = (stored[photo], page_url)
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows.update(carried)
    for s in skipped:
        print("skip:", s)
    for item_id, (fname, src) in carried.items():
        print(f"carried from an earlier run: {item_id}: {fname} from {src} (retrieved {', '.join(sorted(before_dates))})")
    unchanged = bool(rows) and rows == before and len(before_dates) == 1
    if rows:
        # write_images_csv dates every row; when every row is exactly as before (same photo files, byte for byte, same pages)
        # the earlier date is kept, so the carried rows are not re-dated
        ic.write_images_csv(CHAIN, rows, retrieved_on=next(iter(before_dates)) if unchanged else None)
        if unchanged:
            print("every row is exactly as before (same photos, byte for byte, same pages): the earlier retrieved_on date is kept")
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
