#!/usr/bin/env python3
"""Attach KFC UK's own item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4; CLAUDE.md rule 2).

    python3 tools/uk_extract/images_kfc.py --cache <dir>

Source: https://www.kfc.co.uk/our-menu/<category> (KFC's own menu pages; each entry is a heading + a photo hosted on
brand-uk.assets.kfc.co.uk, the same host family as the nutrition PDF) and, for a few items, KFC's own product page.
robots.txt of www.kfc.co.uk says "User-agent: * / Allow: / / Disallow: /wingzapp/".

A photo is attached to a published item ONLY when KFC's own entry for that photo carries the item's name:
  1. the entry's heading or image alt text equals the item name (norm_name), or the item's size/"per piece" form of it
     ("Popcorn Chicken (small)" = "Small Popcorn Chicken"; "Tender (per piece)" = "1 Tender");
  2. else KFC's product page for that item has the same name as its H1 (e.g. "Kentucky Mayo Twister" is "... Twister
     Wrap" on the menu page but "Kentucky Mayo Twister" on its own page; "Regular Coleslaw" = "Coleslaw (regular)");
  3. else, for "(regular)" items only: the entry's name is the item's base name AND the photo's own file name says it
     is the REGULAR size (e.g. "..._REGULAR_PEPSI_MAX_..."). Large sizes never borrow a regular photo.
Anything else (different wording, "Pot" dips, a different pack size, two entries with different photos) gets no photo.
Nothing is cropped, recoloured or retouched: store_image() only downsizes to 640 px and converts to WebP.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "kfc"
SITE = "https://www.kfc.co.uk"
CATEGORIES = ["burgers", "twisters", "rice-bowls", "just-chicken", "sides-dips", "desserts", "drinks", "vegan",
              "snacking", "kwench-by-kfc"]
# Which of KFC's own product pages to open for items whose menu-page heading is worded differently. The page is only
# *used* if its H1 equals the item's name (or its size form); the hint just says where to look.
PRODUCT_PAGES = {
    "kentucky-mayo-twister": "/our-menu/twisters/kfc-kentucky-mayo-twister",
    "sweet-chilli-twister": "/our-menu/twisters/kfc-sweet-chilli-twister",
    "smokey-bbq-twister": "/our-menu/twisters/kfc-smokey-bbq-twister",
    "coleslaw-regular": "/our-menu/sides-dips/kfc-regular-coleslaw",
    "gravy-regular": "/our-menu/sides-dips/kfc-regular-gravy",
    "creamy-mash-regular": "/our-menu/sides-dips/kfc-regular-creamy-mash",
}
HTML = "text/html,application/xhtml+xml"


def next_data(raw: bytes) -> list[dict]:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw.decode("utf-8", "replace"), re.S)
    if not m:
        raise ValueError("page has no __NEXT_DATA__")
    return json.loads(m.group(1))["props"]["pageProps"]["data"]["mainContent"]


def photo_id(url: str) -> str:
    """The photo's identity without the CMS version query, so one photo seen twice counts once."""
    return urlsplit(url)._replace(query="", fragment="").geturl()


def category_records(cache: Path, category: str) -> list[dict]:
    """Every menu entry on one category page: {names: [heading, alt], img, page}."""
    page = f"{SITE}/our-menu/{category}"
    out = []
    for block in next_data(polite_get(page, cache, accept=HTML)):
        if block.get("id") != "hero_2_column_image_with_copy":
            continue
        for side in ("left", "right"):
            s = block["data"]["children"].get(side)
            if not s or not s.get("heading"):
                continue
            o = (s.get("image") or {}).get("original") or {}
            if not o.get("url"):
                continue
            out.append({"names": [s["heading"], o.get("alt") or ""], "img": o["url"], "page": page})
    return out


def product_page(cache: Path, path: str) -> dict | None:
    """KFC's own product page: {names: [H1], img, page}."""
    url = SITE + path
    try:
        blocks = next_data(polite_get(url, cache, accept=HTML))
    except (OSError, ValueError) as e:  # 404/500 etc: no photo from this page (a 401/403/429 raises Blocked: we stop)
        print(f"  (product page {path} not usable: {e})")
        return None
    for b in blocks:
        if b.get("id") == "two_column_cta":
            ch = b["data"]["children"]
            o = ch[0]["image"]["original"]
            return {"names": [ch[1].get("heading") or ""], "img": o["url"], "page": url}
    return None


def exact_keys(name: str) -> set[str]:
    """Names KFC's entry may carry for this item: the name itself, or its size/'per piece' form. Nothing looser."""
    keys = {norm_name(name)}
    m = re.match(r"^(.*?) \((small|regular|large)\)$", name)
    if m:
        keys.add(norm_name(f"{m.group(2)} {m.group(1)}"))
    m = re.match(r"^(.*?) \(per piece\)$", name)
    if m:
        keys |= {norm_name(f"{m.group(1)}: 1pc"), norm_name(f"1 {m.group(1)}")}
    return keys


def regular_base(name: str) -> str | None:
    m = re.match(r"^(.*?) \(regular\)$", name)
    return norm_name(m.group(1)) if m else None


def is_labelled_regular(img_url: str) -> bool:
    fname = urlsplit(img_url).path.rsplit("/", 1)[-1].upper()
    return re.search(r"(^|[_\-])(REG|REGULAR)([_\-])", fname) is not None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", required=True, help="directory for cached downloads (pages and photos are fetched once)")
    args = ap.parse_args()
    cache = Path(args.cache)

    items = load_items(CHAIN_ID)
    records: list[dict] = []
    try:
        for cat in CATEGORIES:
            recs = category_records(cache, cat)
            print(f"{cat}: {len(recs)} entries")
            records += recs
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping: nothing is fetched round a block.")
        return 2

    chosen: dict[str, dict] = {}   # item_id -> {img, page, how, entry}
    skipped: list[tuple[str, str]] = []
    try:
        for it in items:
            name, iid = it["name"], it["id"]
            keys = exact_keys(name)
            hits = [(r, "name") for r in records if any(norm_name(n) in keys for n in r["names"] if n)]
            if not hits and iid in PRODUCT_PAGES:
                p = product_page(cache, PRODUCT_PAGES[iid])
                if p and any(norm_name(n) in keys for n in p["names"] if n):
                    hits = [(p, "product page")]
            if not hits:
                base = regular_base(name)
                if base:
                    hits = [(r, "regular-labelled photo") for r in records
                            if any(norm_name(n) == base for n in r["names"] if n) and is_labelled_regular(r["img"])]
            if not hits:
                skipped.append((iid, "no entry on KFC's pages carries this name"))
                continue
            if len({photo_id(r["img"]) for r, _ in hits}) > 1:
                skipped.append((iid, "ambiguous: several different photos carry this name"))
                continue
            r, how = hits[0]
            chosen[iid] = {"img": r["img"], "page": r["page"], "how": how, "entry": r["names"][0]}
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping.")
        return 2

    rows: dict[str, tuple[str, str]] = {}
    try:
        for iid, c in chosen.items():
            try:
                fname = store_image(CHAIN_ID, polite_get(c["img"], cache, referer=SITE + "/"))
            except ValueError as e:
                skipped.append((iid, f"photo rejected: {e}"))
                continue
            rows[iid] = (fname, c["page"])
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping.")
        return 2

    write_images_csv(CHAIN_ID, rows)
    names = {it["id"]: it["name"] for it in items}
    order = list(names)
    print(f"\n{len(rows)} of {len(items)} published items have a photo\n")
    for iid in sorted(rows, key=order.index):
        c = chosen[iid]
        print(f"  {names[iid]:42s} <- {c['entry']!r:45s} [{c['how']}] {rows[iid][0]}  {rows[iid][1].replace(SITE, '')}")
    print(f"\nskipped ({len(skipped)}):")
    for iid, why in sorted(skipped, key=lambda s: order.index(s[0])):
        print(f"  {names[iid]:42s} {why}")
    shared = suspected_placeholders(rows)
    print("\nfiles used by 4+ items (look at each):", shared or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
