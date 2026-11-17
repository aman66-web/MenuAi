#!/usr/bin/env python3
"""Item photos for Fireaway from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_fireaway.py --cache DIR [--dry-run]

DIR is the folder tools/uk_extract/fireaway.py already filled (`fireaway.py DIR --fetch`: the eight shops' menu pages and the product feed each loaded
from https://www.fireaway.co.uk/menuV2/getMenuByCategory, one `store<ID>_<category>_feed<N>.json` per category). Nothing is requested for the data; the only
requests this script makes are for the photo files and the robots.txt of their host, through polite_get.

Source: every product record of that feed carries `id`, `name` and `imageSrc` (e.g. https://cdn.prd01firuk.solutions4delivery.com/images/Products/Original/<file>.jpg,
the chain's own media host, named by its own menu page). store_image only downsizes to <= 640 px and converts to WebP. `source_url` = https://www.fireaway.co.uk/menu.

Match rule (exact, nothing fuzzy). fireaway.py wrote "product id <N>" into each published item's notes. A photo is attached to an item only when
  1. the feed record with that id has the same name as the item (norm_name of the tidied feed name equals that of the item's name), and
  2. every shop's feed that lists the record gives the same imageSrc, and
  3. the photo is on cdn.prd01firuk.solutions4delivery.com.
Pictures that carry a "NEW RECIPE" sticker are left out (DROP_ITEMS). Many pizza pictures carry the site's small "CUSTOMISE" label (kept: it states nothing about the product).
Pizza sizes and crusts are not items here (only the default 12" regular crust is published), so the record's photo is the item's own photo.

Terms: https://www.fireaway.co.uk/terms-of-use (rendered with a browser, read 2026-10-11) is "Terms and conditions for all Fireaway offers"; it has no clause about images, photographs of
the products or copying content from the website (the only mention of photographs is the competition rules' "photographs ... submitted by entrants"). No other terms page is linked
from the menu page's footer. robots.txt (https://www.fireaway.co.uk/robots.txt): "User-agent: * / Disallow: /_contentediting/, /checkout/, /secure/, /login/, /register/, /Error/,
/RouteEditing/, /ContentEditing/, /elmah/, /forgot-password/, /Account/ExternalLogin/" (the menu is allowed). The photo host cdn.prd01firuk.solutions4delivery.com is an Azure blob
store whose /robots.txt answers HTTP 400 "OutOfRangeInput" (an Azure error, not a robots.txt): images_common.polite_get reads a 4xx other than 401/403/429 as "no rules" (RFC 9309 section 2.3.1.3).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: the eight shops' pages were rendered again (fireaway.py's CAPTURE_JS, run with a local Chromium, one page at a time, 3 s apart; no 403/429 and no
challenge page) into a scratch folder and this script was rerun on it. The four pasta pictures (252, 253, 255, 257) still carry the "NEW RECIPE" sticker and Vegan
Supreme's file is still byte-identical to Veggie Supreme's, so those five stay without a photo. Sprite 330ml was dropped after looking at a full-size crop (see DROP_ITEMS).
S'mores Pizza (product 249) and Crunchy Goblin (product 215) are no longer in any shop's feed (withdrawn from the menu; both items are still published), so their photos matched on
2026-10-11 are carried forward from the previous images.csv (see `carried` in main; write_images_csv gives every row the run's date, so those two rows now read
2026-11-17 although their files were retrieved on 2026-10-11). Every other photo downloaded again was byte-identical to the stored file except Lotus Biscoff Milkshake's,
which the chain re-saved (same picture, new bytes, looked at side by side with the old one): 56 of 62 published items have a photo.
robots.txt of www.fireaway.co.uk read again the same day: unchanged (the menu, /menuV2/ and /locations are allowed). The terms page (rendered once) was re-read the
same day: still only "Terms and conditions for all Fireaway offers", with no clause about copying content, images or photographs.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fireaway  # noqa: E402  (STORES, CATEGORIES, tidy: the same naming the items were built with)
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "fireaway"
SOURCE_PAGE = "https://www.fireaway.co.uk/menu"
PHOTO_HOST = "https://cdn.prd01firuk.solutions4delivery.com/"
DEFAULT_CACHE = Path("/tmp/menumacros-images-fireaway")
# item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    # looked at on the contact sheet (2026-10-11): the chain's picture carries a "NEW RECIPE" sticker (could contradict our figures, CLAUDE.md rule 2 brief)
    "chicken-pesto": "the picture carries a 'NEW RECIPE' sticker",
    "mac-and-cheese": "the picture carries a 'NEW RECIPE' sticker",
    "pasta-diavola": "the picture carries a 'NEW RECIPE' sticker",
    "pasta-rose": "the picture carries a 'NEW RECIPE' sticker",
    # the chain uses ONE picture file for both Veggie Supreme and Vegan Supreme: it may show dairy cheese, so it is not put on the vegan item
    # (2026-11-17: the feed now names two files, 20-5053.jpg and 22-5059.jpg, but their bytes are identical: still the one picture)
    "vegan-supreme-pizza": "the chain's picture is the same file as Veggie Supreme's (may show dairy cheese): not shown on the vegan item",
    # looked at again 2026-11-17 on a full-size crop: the can prints "LOW CALORIES", a nutrition claim (as Subway's packs printing kcal or "less fat")
    "sprite-330ml": "the can prints 'LOW CALORIES', a nutrition claim",
}

NOTE_PID = re.compile(r"product id (\d+)")


def feed_records(feed_cache: Path) -> dict[int, list[tuple[str, str]]]:
    """product id -> [(name, imageSrc), ...] over every shop and category the data script captured."""
    out: dict[int, list[tuple[str, str]]] = {}
    for sid, _, _ in fireaway.STORES:
        for cat, _label in fireaway.CATEGORIES:
            for pid, p in fireaway.feed_products(feed_cache, sid, cat).items():
                out.setdefault(int(pid), []).append((fireaway.tidy(p["name"]), p.get("imageSrc") or ""))
    return out


def previous_rows() -> dict[str, dict]:
    """The rows of the images.csv an earlier run wrote (item id -> row), or {}."""
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: r for r in csv.DictReader(f)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--feeds", type=Path, required=True, help="the cache folder fireaway.py --fetch filled (store<ID>_<category>_feed<N>.json)")
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help="where downloaded photos are kept")
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    before = previous_rows()
    carried: dict[str, tuple[str, str]] = {}
    recs = feed_records(args.feeds)
    print(f"{len(recs)} product records in the feeds of {len(fireaway.STORES)} shops")
    matched: dict[str, str] = {}
    for it in items:
        if it["id"] in DROP_ITEMS:
            skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
            continue
        m = NOTE_PID.search(it.get("notes", ""))
        got = recs.get(int(m.group(1))) if m else None
        if not got:
            prev = before.get(it["id"])
            if prev and (IMAGES_ROOT / CHAIN_ID / prev["file"]).exists():
                # The product was withdrawn from the website (no shop's feed holds its record any more) but the item is still published: the
                # photo an earlier run matched to that exact record (same id, same name) and that was looked at stays, with the page it came from.
                carried[it["id"]] = (prev["file"], prev["source_url"])
                skipped.append(f"{it['id']}: no shop's feed holds product {m.group(1) if m else '?'} any more: kept the photo matched on {prev['retrieved_on']}")
            else:
                skipped.append(f"{it['id']}: notes name no product record the feeds hold")
            continue
        if any(norm_name(n) != norm_name(it["name"]) for n, _ in got):
            skipped.append(f"{it['id']}: the feed names product {m.group(1)} {sorted({n for n, _ in got})}, not {it['name']!r}")
            continue
        urls = {u for _, u in got}
        if len(urls) != 1 or "" in urls:
            skipped.append(f"{it['id']}: shops give {len(urls)} different photo addresses (or none)")
            continue
        (url,) = urls
        if not url.startswith(PHOTO_HOST):
            skipped.append(f"{it['id']}: photo {url} is not on the chain's media host")
            continue
        matched[it["id"]] = url
    try:
        for item_id, url in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url[len(PHOTO_HOST):]}")
                continue
            raw = polite_get(url, args.cache, referer=SOURCE_PAGE)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, SOURCE_PAGE)
            print(f"  {item_id:50} {fname}  <- {url[len(PHOTO_HOST):]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched, {len(carried)} more keep an earlier run's photo")
        return 0
    rows.update(carried)
    # A run that only confirms what an earlier run stored (every row the same file and page as before, rows only removed) keeps that run's date: the files were
    # retrieved then and are byte for byte the same (store_image names a file by the hash of the source bytes). Anything new or changed: today's date.
    dates = {r["retrieved_on"] for r in before.values()}
    same = bool(before) and all(i in before and (before[i]["file"], before[i]["source_url"]) == v for i, v in rows.items()) and len(dates) == 1
    write_images_csv(CHAIN_ID, rows, retrieved_on=dates.pop() if same else None)
    if same:
        print("every photo is the same file as the earlier run's: its date is kept")
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
