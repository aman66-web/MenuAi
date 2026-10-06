#!/usr/bin/env python3
"""Subway UK item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4) -> web/public/menu-images/subway/ + data/source/subway/images.csv.

Source: the chain's own UK menu pages, https://www.subway.com/en-gb/menu/category/<id> (one page per menu category, server-
rendered; each product tile carries a title, a short description and the product photo). 8 category pages + one request per
photo, 1 request/second, robots.txt honoured (it disallows only /sitecore/ and the delivery locators), normal browser UA.

A photo is attached to a published item only when the tile's own text names that item exactly (norm_name equality):
  (a) the tile title                                  "Oat & Raisin Cookie"        = item "Oat and Raisin Cookie"
  (b) tile title + the page's format word, when the   tile "Ham" on the Subs page, description "Create your own Ham Sub"
      description confirms that format                = item "Ham Sub"   (the Wraps page's "Ham" tile is a separate
      record with its own photo and only ever matches "Ham Wrap")
  (c) the product name the description itself gives   "Create your own Beef Chilli Sub" (tile title "Chilli Beef Sub")
Small, listed normalisations on BOTH sides, nothing else: the tile's "NEW " badge, a trailing (V)/(VE) dietary badge and the
(R) mark are dropped from the tile title; a trailing "(...)" note that is not a size or count is dropped from the item name
("(Pork & Beef Meatballs)"); on the Spuds page Subway's own PDF word "Spud" is read as the site's "Jacket Potato" (the chain's
own photo files call these products "Spud": SUB143023_Chicken_Bacon_Spud_menu_product_tiles). Never fuzzy, never reordered:
"Turkey Sub" does not take "Turkey Breast", "Italian B.M.T Sub" does not take "Classic B.M.T.", "Mozzarella & Cheddar Bites x 5"
does not take "5x Mozzarella & Cheddar Bites". An item that matches two different tiles gets no photo.

    python3 tools/uk_extract/images_subway.py --cache <dir>        # download (cached), store, write images.csv
    python3 tools/uk_extract/images_subway.py --cache <dir> --dry-run   # matches only, nothing stored
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from images_common import (Blocked, IMAGES_ROOT, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN = "subway"
BASE = "https://www.subway.com"
PAGE_URL = BASE + "/en-gb/menu/category/{}"
DEFAULT_CACHE = Path("/tmp/claude-0/-home-user-MenuAi/a431c667-67f2-527e-bd7d-6a276d3d71be/scratchpad/uk/img-subway")

# category page id -> the format word the products on it are called (None: titles already carry the full name)
PAGES = {436: "Sub", 1099: None, 663: "Wrap", 437: "Salad", 1405: None, 1102: None, 1105: None}
# which pages may supply a photo for an item of each of our categories (a Sub photo never goes on a Wrap)
ALLOWED = {
    "Subs": [436], "Toasties": [436], "Saver Subs": [1099, 436], "Wraps": [663], "Salads": [437], "Spuds": [1405],
    "Sides": [1102], "Protein Pots": [1102], "Cookies": [1105], "Extras": [1102], "Sauces": [1102], "Dunk pots": [1102],
}
# Photos that are the right product but carry a baked-in "FOOTLONG nn g OF PROTEIN" badge (we cannot crop or retouch it): our
# item is the 6-inch sub with about half that protein, so the picture would contradict the numbers beside it. Left without a photo.
# (The "SALAD/WRAP nn g OF PROTEIN" badges on the salad and wrap photos equal our per-serving protein exactly, so those stay.)
FOOTLONG_BADGE = {"chicken-breast-sub", "chicken-tikka-sub", "rotisserie-style-chicken-sub", "philly-steak-sub", "ham-sub"}
TILE = re.compile(r'<button data-testid="card-list-(\d+)" data-testauto-id="[^"]*" class="card__list".*?'
                  r'<img[^>]*src="([^"]*)".*?<h2 class="card__title">(.*?)</h2></div>'
                  r'<p class="card__description">(.*?)</p>', re.S)


def clean_title(t: str) -> str:
    t = html.unescape(t).replace("®", "").strip()
    t = re.sub(r"^NEW\s+", "", t)                       # the site's "NEW" badge is not part of the name
    t = re.sub(r"\s*\((?:V|VE|Ve)\)\s*$", "", t)        # trailing vegetarian/vegan badge
    return " ".join(t.split())


def parse_tiles(page: int, text: str) -> list[dict]:
    noun = PAGES[page]
    tiles = []
    for m in TILE.finditer(text):
        tid, src, raw_title, raw_desc = m.groups()
        title = clean_title(raw_title)
        desc = " ".join(html.unescape(raw_desc).replace("®", "").split())
        keys = {norm_name(title)}
        if noun:
            has_noun_already = re.search(r"\b(sub|wrap|salad|toastie)\b", title, re.I)
            if not has_noun_already and re.search(rf"\b{noun}\b", desc):          # (b): description confirms the format
                keys.add(norm_name(f"{title} {noun}"))
            pm = re.search(rf"Create your own (.+?) {noun}\b", desc)              # (c): the page's own name for it
            if pm:
                keys.add(norm_name(f"{pm.group(1)} {noun}"))
        tiles.append({"id": tid, "page": page, "title": title, "src": src, "keys": keys})
    return tiles


def item_keys(item: dict) -> set[str]:
    name = item["name"]
    keys = {norm_name(name)}
    m = re.match(r"^(.*\S)\s*\(([^)]*)\)\s*$", name)
    if m and not re.search(r"\d|regular|large", m.group(2), re.I):               # "(Pork & Beef Meatballs)": a note, not a size
        keys.add(norm_name(m.group(1)))
    if item["category"] == "Spuds" and re.search(r"\bSpud$", name):
        keys.add(norm_name(re.sub(r"\bSpud$", "Jacket Potato", name)))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help="download cache (one fetch per URL)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches, store nothing")
    args = ap.parse_args()

    items = load_items(CHAIN)
    tiles: list[dict] = []
    try:
        for page in PAGES:
            text = polite_get(PAGE_URL.format(page), args.cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
            got = parse_tiles(page, text)
            if not got:
                print(f"STOP: no product tiles found on {PAGE_URL.format(page)}: the page layout has changed", file=sys.stderr)
                return 2
            tiles += got
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping: we do not work round a block.", file=sys.stderr)
        return 3

    # tile key -> distinct tiles (by product id) per page; the same product listed on two pages is one tile
    index: dict[tuple[int, str], dict[str, dict]] = defaultdict(dict)
    for t in tiles:
        for k in t["keys"]:
            index[(t["page"], k)][t["id"]] = t

    matches: dict[str, tuple[dict, str]] = {}   # item id -> (tile, key)
    unmatched, ambiguous = [], []
    for it in items:
        found: dict[str, tuple[dict, str]] = {}
        for page in ALLOWED.get(it["category"], []):
            for k in item_keys(it):
                for tid, t in index.get((page, k), {}).items():
                    found.setdefault(tid, (t, k))
        if len(found) == 1:
            matches[it["id"]] = next(iter(found.values()))
        elif found:
            ambiguous.append(it["name"])
        else:
            unmatched.append(it)

    by_id = {i["id"]: i for i in items}
    for iid in sorted(FOOTLONG_BADGE & set(matches)):
        del matches[iid]
        print(f"  DROPPED (footlong protein badge baked into the photo): {by_id[iid]['name']}")
    print(f"{len(tiles)} product tiles on {len(PAGES)} category pages; {len(items)} published items")
    for iid, (t, k) in sorted(matches.items(), key=lambda kv: list(by_id).index(kv[0])):
        print(f"  MATCH  {by_id[iid]['name']!r:55} <- tile {t['id']:>5} {t['title']!r} [{k}]")
    for n in ambiguous:
        print(f"  AMBIGUOUS (no photo): {n}")
    if args.dry_run:
        print(f"dry run: {len(matches)} matches, nothing stored")
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored_for_src: dict[str, str] = {}
    try:
        for iid, (t, _) in matches.items():
            url = t["src"] if t["src"].startswith("http") else BASE + t["src"]
            page_url = PAGE_URL.format(t["page"])
            if url not in stored_for_src:
                try:
                    raw = polite_get(url, args.cache, referer=page_url)
                    stored_for_src[url] = store_image(CHAIN, raw)
                except ValueError as e:
                    stored_for_src[url] = ""
                    print(f"  SKIP   {by_id[iid]['name']}: {e}")
            if stored_for_src[url]:
                rows[iid] = (stored_for_src[url], page_url)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping: we do not work round a block.", file=sys.stderr)
        return 3

    write_images_csv(CHAIN, rows)
    size = sum(p.stat().st_size for p in (IMAGES_ROOT / CHAIN).glob("*.webp")) if (IMAGES_ROOT / CHAIN).is_dir() else 0
    print(f"\nCOVERAGE: {len(rows)} of {len(items)} published items have a photo; "
          f"{len(set(f for f, _ in rows.values()))} files, {size / 1024:.0f} KB total")
    print("by category:", {c: sum(1 for i in rows if by_id[i]["category"] == c) for c in sorted({i['category'] for i in items})})
    sp = suspected_placeholders(rows)
    print("files used by 4+ items:", {f: [by_id[i]["name"] for i in ids] for f, ids in sp.items()} or "none")
    print("no photo:", "; ".join(i["name"] for i in unmatched if i["id"] not in rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
