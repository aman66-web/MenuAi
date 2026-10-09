#!/usr/bin/env python3
"""Item photos for Yo! Sushi (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_yo_sushi.py --cache <dir> --dry-run     # fetch the menu pages only, list matches
    python3 tools/uk_extract/images_yo_sushi.py --cache <dir>               # download, store, write images.csv

Source: the chain's own menu pages https://yosushi.com/menu (and ?page=2, ?page=3, the pages its own pagination lists). Each dish
card is `<a href="/menu/<slug>" class="product-item ..."> <img ...> <h3>dish name</h3> <li class="product-dietary-calories">N kcal`.
Photos are served from cdn.yosushi.com (`/r/w-1000/...`, the page's own 1000 px rendition); store_image downsizes to 640 px and
converts to WebP, nothing else is changed.

Matching (exact only):
- a card's photo goes to the published item whose norm_name equals the card's dish name;
- the card "chicken katsu curry" / "pumpkin katsu curry" (one product record, one kcal figure) goes to the "(large)" or "(regular)"
  item of that name only when the card's kcal figure equals that item's calories (the record carries both photo and variant);
- any dish name that two cards print with different photos gets no photo; cards without an <img> get none.
A card kcal figure that differs from our table (the website and the PDF/allergen guide disagree for a few dishes) does not stop the
photo (the photo shows the dish, not the number) but is printed in the run output.

Politeness / robots: yosushi.com/robots.txt (read 2026-10-09) allows /menu and /r/ for `User-agent: *`; cdn.yosushi.com serves the same
file. Terms (https://yosushi.com terms of use): "All rights, including copyright, in this website are owned by or licensed to YO! Sushi UK
Ltd. Any use of this website or its contents, including copying or storing it or them in whole or part, other than for your own personal,
non-commercial use is prohibited without the permission of YO! Sushi UK Ltd." Founder's decision 2026-10-06 (CLAUDE.md rule 2):
installed anyway, his accepted risk.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "yo-sushi"
BASE = "https://yosushi.com"
MENU_URL = BASE + "/menu"
# Item ids never given a photo (checked by eye after a download), e.g. {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_CARD = re.compile(r'<a href="(/menu/[^"]+)" class="product-item[^"]*">(.*?)</a>', re.S)


def read_cards(page: str) -> list[dict]:
    cards = []
    for href, body in _CARD.findall(page):
        mh = re.search(r"<h3>(.*?)</h3>", body, re.S)
        if not mh:
            continue
        name = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", mh.group(1))).split())
        mk = re.search(r"(-?[\d,]+)\s*kcal", body)
        kcal = int(mk.group(1).replace(",", "")) if mk and not mk.group(1).startswith("-") else None   # "-1 kcal" = not published on the site
        # the page's own 1000 px rendition: <noscript><img src=...> (same URL as data-src)
        ms = re.search(r'<img\b[^>]*?\bsrc="(https://cdn\.yosushi\.com/r/w-1000/[^"]+)"', body)
        cards.append({"href": href, "name": name, "kcal": kcal, "photo": htmllib.unescape(ms.group(1)) if ms else None})
    return cards


def page_urls(first_page: str) -> list[str]:
    nums = sorted({int(n) for n in re.findall(r'href="/menu\?page=(\d+)"', first_page)})
    return [f"{MENU_URL}?page={n}" for n in nums]


def match(cards: list[dict], items: list[dict]) -> tuple[dict, list[str]]:
    """{item_id: (photo_url, page_url)}, plus notes on what was left out."""
    notes: list[str] = []
    by_name: dict[str, list[dict]] = {}
    for c in cards:
        by_name.setdefault(ic.norm_name(c["name"]), []).append(c)
    out: dict[str, tuple[str, str]] = {}
    for it in items:
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
            continue
        key = ic.norm_name(it["name"])
        cs = by_name.get(key)
        sized = False
        if not cs:
            base = re.sub(r"\s*\((large|regular)\)\s*$", "", it["name"], flags=re.I)
            if base != it["name"]:
                cs = [c for c in by_name.get(ic.norm_name(base), []) if c["kcal"] is not None and str(c["kcal"]) == it["calories"]]
                sized = True
        if not cs:
            continue
        photos = {c["photo"] for c in cs}
        if None in photos or len(photos) != 1:
            notes.append(f"{it['name']}: card has no photo or cards disagree -> none")
            continue
        c = cs[0]
        if c["kcal"] is not None and str(c["kcal"]) != it["calories"] and not sized:
            notes.append(f"{it['name']}: website says {c['kcal']} kcal, our table {it['calories']} (photo kept: same dish name)")
        out[it["id"]] = (c["photo"], BASE + c["href"])
    return out, notes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    first = ic.polite_get(MENU_URL, a.cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
    pages = {MENU_URL: first}
    for u in page_urls(first):
        if u.endswith("page=1"):
            continue
        pages[u] = ic.polite_get(u, a.cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
    cards: list[dict] = []
    for u, p in pages.items():
        cs = read_cards(p)
        print(f"{u}: {len(cs)} dish cards, {sum(1 for c in cs if c['photo'])} with a photo")
        cards += cs
    matches, notes = match(cards, items)
    print(f"{len(matches)} of {len(items)} published items match a card with a photo")
    for n in notes:
        print("  note:", n)
    names = {i["id"]: i["name"] for i in items}
    for iid, (photo, page) in sorted(matches.items()):
        print(f"  {iid:40s} {names[iid]:40s} {page}")
    if a.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    for iid, (photo, page) in sorted(matches.items()):
        try:
            raw = ic.polite_get(photo, a.cache, referer=page)
            rows[iid] = (ic.store_image(CHAIN_ID, raw), page)
        except ic.Blocked as e:
            sys.exit(f"STOP: {e}")
        except (ValueError, urllib.error.HTTPError) as e:
            print(f"  skipped {iid}: {e} ({photo})")
    ic.write_images_csv(CHAIN_ID, rows)
    sus = ic.suspected_placeholders(rows)
    print(f"stored {len(rows)} photos; files used by 4+ items: {sus}")


if __name__ == "__main__":
    main()
