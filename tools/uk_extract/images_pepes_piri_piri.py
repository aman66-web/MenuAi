#!/usr/bin/env python3
"""Item photos for Pepe's Piri Piri from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_pepes_piri_piri.py --cache DIR [--dry-run]

Source: https://pepes.co.uk/menu/ (the chain's own menu page; the nutrition data came from /nutrition-allergens-uk/, which
has no photos). Every menu entry is a block
    <div class="item" data-id="N"><div class="item-image"><img src="https://pepes.co.uk/wp-content/webp-express/..."></div>
      <div class="item-content"><h3 class="menu-item-title">NAME</h3> ... <div class="kcal"><strong>NNNkcal</strong></div>
i.e. one photo and one name per entry, on pepes.co.uk's own upload folder (the page's own <img src>, fetched as served).
The per-product pages (/menu/<slug>/ in the sitemap) answer 301 -> /menu, so they carry nothing more.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the menu entry's title and the item's
name in the CURRENT items.csv are equal under images_common.norm_name, the entry has exactly ONE photo, the title is used
by exactly one menu entry, and exactly one published item has that name. The chain's menu names many dishes differently
from its nutrition page ("Fajita Wrap" vs "Chicken Fajita Wrap", "Gourmet Beef" vs "Gourmet Beef Burger - Single/Double",
"Pepe's Fries" vs "Fries - Regular/Large", "Chick'n'Rice" vs "Chick n Rice"): those get NO photo, as do sizes the menu entry
doesn't name (one "Tender Strips" photo is never pinned on the 3-piece or the 5-piece). The two dessert tiles ("Pepe's
Cakes", "Ben & Jerry's Ice Cream") are group title graphics and name no single published item.
A sanity check prints "CHECK" when the entry's kcal on the menu page differs from the item's published calories.

Terms (read 2026-10-07): the site has no general website-terms page. The footer on every page says "(c) Copyright Pepe's
Piri Piri"; /terms-and-conditions-promotions-competitions-and-loyalty-programs/ only covers promotions and entry material
("The participant transfers all current and future intellectual property rights ... to the entry material ... to Pepe's");
/privacy-policy/ and /customer-services/ say nothing about images. No express ban on copying images. Installed on the
founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (read 2026-10-07): "User-agent: * / Disallow: /wp-admin/ / Allow: /wp-admin/admin-ajax.php"; nothing else.
polite_get checks it on every URL, at 1 request/second.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "pepes-piri-piri"
SITE = "https://pepes.co.uk"
MENU_URL = f"{SITE}/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PHOTO_PREFIX = f"{SITE}/wp-content/"      # the chain's own upload folder: nothing else is accepted as a photo
SKIP_FILES: dict[str, str] = {}           # photo file name -> why it is not used (nutrition text, placeholder...)

SECTION = re.compile(r'<section id="([^"]+)"[^>]*class="[^"]*\bcollection\b[^"]*"[^>]*>(.*?)</section>', re.S)
ITEM = re.compile(r'<div class="item" data-id="(\d+)">(.*?)(?=<div class="item" data-id="|\Z)', re.S)
ITEM_IMAGE = re.compile(r'<div class="item-image">(.*?)</div>', re.S)
IMG_SRC = re.compile(r'<img\b[^>]*?\bsrc="([^"]+)"', re.S)
TITLE = re.compile(r'<h3 class="menu-item-title">(.*?)</h3>', re.S)
KCAL = re.compile(r'<div class="kcal">\s*<strong>\s*([0-9]+)\s*kcal', re.S)
WXH = re.compile(r"-(\d+)x(\d+)\.[a-z.]+$", re.I)   # WordPress size suffix, e.g. ...-300x133.png.webp


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ").split())


def menu_entries(page: str) -> list[dict]:
    """Every entry of the menu page's collections: data-id, section, title, photos (all <img> in the entry's photo box), kcal."""
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)      # only live markup counts
    out: list[dict] = []
    for sec_id, body in SECTION.findall(page):
        for data_id, blk in ITEM.findall(body):
            t = TITLE.search(blk)
            box = ITEM_IMAGE.search(blk)
            kc = KCAL.search(blk)
            out.append({
                "id": data_id, "section": sec_id,
                "title": clean(t.group(1)) if t else "",
                "photos": [html.unescape(u) for u in IMG_SRC.findall(box.group(1))] if box else [],
                "kcal": kc.group(1) if kc else None,
            })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for the page and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; fetch only the menu page, write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    try:
        page = ic.polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    entries = menu_entries(page)
    if not entries:
        print(f"no menu entries found on {MENU_URL}: the page layout changed; nothing written", file=sys.stderr)
        return 1
    print(f"{len(entries)} menu entries on {MENU_URL}")

    title_count: dict[str, int] = {}
    for e in entries:
        title_count[ic.norm_name(e["title"])] = title_count.get(ic.norm_name(e["title"]), 0) + 1

    # item id -> (photo url, entry); one entry per item after the checks below
    found: dict[str, tuple[str, dict]] = {}
    for e in entries:
        key = ic.norm_name(e["title"])
        its = by_name.get(key)
        if not its:
            skipped.append(f"menu entry {e['title']!r} ({e['section']}, data-id {e['id']}) names no published item exactly")
            continue
        if len(its) > 1:
            skipped.append(f"menu entry {e['title']!r}: {len(its)} published items have this name")
            continue
        if title_count[key] > 1:
            skipped.append(f"{its[0]['id']}: {title_count[key]} menu entries are titled {e['title']!r}; ambiguous")
            continue
        if len(e["photos"]) != 1:
            skipped.append(f"{its[0]['id']}: menu entry {e['title']!r} has {len(e['photos'])} photos")
            continue
        photo = e["photos"][0]
        if not photo.startswith(PHOTO_PREFIX):
            skipped.append(f"{its[0]['id']}: photo {photo} is not on the chain's own upload folder")
            continue
        fname = photo.rsplit("/", 1)[-1]
        if fname in SKIP_FILES:
            skipped.append(f"{its[0]['id']}: {fname} skipped: {SKIP_FILES[fname]}")
            continue
        found[its[0]["id"]] = (photo, e)

    by_id = {it["id"]: it for it in items}
    rows: dict[str, tuple[str, str]] = {}
    for item_id, (photo, e) in sorted(found.items()):
        item = by_id[item_id]
        notes = []
        if e["kcal"] is not None and str(item.get("calories", "")).strip() != e["kcal"]:
            notes.append(f"CHECK menu page says {e['kcal']} kcal, nutrition page {item.get('calories')} kcal")
        m = WXH.search(photo)
        if m and min(int(m.group(1)), int(m.group(2))) < ic.MIN_SIDE:
            notes.append(f"small file ({m.group(1)}x{m.group(2)}): store_image may reject it as too small")
        if args.dry_run:
            print(f"{item_id}: {item['name']!r} <- menu entry {e['title']!r}\n    photo {photo}\n    page  {MENU_URL}"
                  + "".join(f"\n    {n}" for n in notes))
            continue
        for n in notes:
            print(f"  {item_id}: {n}")
        try:
            raw = ic.polite_get(photo, args.cache, referer=MENU_URL)
            rows[item_id] = (ic.store_image(CHAIN, raw), MENU_URL)
        except ic.Blocked as ex:
            print(f"BLOCKED, stopping (nothing written): {ex}", file=sys.stderr)
            return 1
        except (ValueError, urllib.error.URLError) as ex:
            skipped.append(f"{item_id}: {photo}: {ex}")

    for s in skipped:
        print("no photo:", s)
    if args.dry_run:
        print(f"{len(found)} of {len(items)} published items matched")
        return 0
    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
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
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
