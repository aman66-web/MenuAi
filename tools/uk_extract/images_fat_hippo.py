#!/usr/bin/env python3
"""Item photos for Fat Hippo from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_fat_hippo.py --cache <dir> [--dry-run]

Source: the four menu pages on https://fathippo.co.uk that the nutrition data came from (fat_hippo.py): /menus/food/,
/menus/kids/, /menus/drinks/ and /menus/special-menu/. Every dish card there is
    <article class="menu-item"> <div class="menu-item__thumbnail"><img data-src="/images/<folder>/<file>" alt="<DISH>">
    <h4 class="menu-item__title"><DISH></h4> ... and its modal repeats the same photo (alt "Preview of <DISH>").
Photos are served from the same host (fathippo.co.uk/images/...), so no other host is used. Cards with no <img> (sauces,
toppings, Fast Hippo, cordials, most soft drinks) show no photo and get none. The lazy-load placeholder
(/images/menu-placeholder.jpg) is never used.

Match rule (exact, nothing fuzzy). A card is tied to a published item the same way fat_hippo.py tied it when it built
items.csv: by (page, section heading, card title) through that script's ROWS table. The item's name must then equal the
card title (images_common.norm_name) or, for the few items whose name carries the section label as a suffix ("Hand Cut
Fries (upgrade)", "Big Poppa (special menu)", "Bacon (kids burger topping)", "Homer (shot)"...), the card title plus that
suffix; the item's category must be the category ROWS gives; and the item must still be published in the CURRENT
items.csv with a name that no other published item shares. The card's thumbnail alt text must name the same dish as its
title and the modal photo must be the same file, otherwise the card is skipped. An item that two cards give DIFFERENT
photos (the Tater Tots upgrade and the Tater Tots side share a title but sit in different sections, so they are different
items) gets no photo; a dish listed twice with the same photo (Trash Browns, Cheeseballs under Veggie / Vegan Starters) is
fine. Nothing is matched by file name, slug or similarity, and no photo is borrowed from a similar dish (Little American
does not get the American's photo).

Terms (https://fathippo.co.uk/terms-of-use/, read 2026-10-07), INTELLECTUAL PROPERTY: "You may only view, print out, use,
quote from and cite the Website and the Materials for your own personal, non-commercial use and on the condition that you
give appropriate acknowledgement ... You must not: ... reproduce, modify, display, perform, publish, distribute,
disseminate, broadcast, frame, communicate to the public or circulate to any third party or exploit this Website and/or the
Materials for any commercial purpose, without our prior written consent." ("Materials" = "all information, images, and other
content displayed on the Website".) Installed on the founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (read 2026-10-07): "User-agent: * / Allow: /" (polite_get checks it on every URL anyway).

Run of 2026-11-17: robots.txt still "User-agent: * / Allow: /"; the terms' INTELLECTUAL PROPERTY clause reads as quoted above (re-read
2026-11-17; the page says "These terms were last updated on 16/06/2026"). The food, kids and drinks pages give 51 matches; 5x Onion Rings is
new (its card now shows its own photo, onion-rings-5-323.png). /menus/special-menu/ now serves the general "Our Menu" landing page with no dish
cards (the Special menu has ended), so Big Poppa (special menu) and Hypnotize Fries (special menu) can no longer be matched: their photos from
the 2026-10-07 run are kept through CARRIED_OVER (see there). Every photo was looked at again on contact sheets; ten are left out through
SKIP_FILES: the five kids' mains (the photo is the kids' meal with fries, the item is the main alone) and five drinks shown as a third-party
brand's bottle or can (Coca Cola, Diet Coke and the three San Pellegrino flavours). Cards that show no photo (the Fast Hippo "Little" burgers,
the meat and chicken upgrades, every sauce, the kids' toppings, sauces and drinks, draught pints, juices and cordials) get none. Lamar's Bar was
first kept, then left out by the independent check the same day (SKIP_FILES (c): a wrapped Mars bar with its logo fills the front of the photo).

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written.
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
from fat_hippo import ROWS  # noqa: E402  (the card -> item table the nutrition data was built from)

CHAIN = "fat-hippo"
SITE = "https://fathippo.co.uk"
PAGES = {"food": "/menus/food/", "kids": "/menus/kids/", "drinks": "/menus/drinks/", "special": "/menus/special-menu/"}
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PHOTO_PATH = re.compile(r"^/images/[A-Za-z0-9_./()&'+,;=@~ -]+\.(?:jpe?g|png|webp)$", re.I)
SKIP_FILES: dict[str, str] = {}   # photo path -> why it is not used (prints nutrition text, placeholder...), after looking at it
# Looked at on contact sheets on 2026-11-17 and left out (a rerun must not bring them back):
# (a) the kids' mains: each photo shows the burger (or the three chicken fingers) served WITH fries in the kids' basket, i.e. the kids' meal,
#     while the item is the burger or fingers alone (the kids page has the side as its own "Pick Your Side" card with its own figures)
_KIDS_MEAL = "the photo shows the kids' meal (the main served with fries); the item is the main alone, its side is a separate item"
SKIP_FILES.update({p: _KIDS_MEAL for p in (
    "/images/kids_menu_item/menuitem_601d72db08984.jpg",   # Kids Beef Burger
    "/images/kids_menu_item/menuitem_601d72f1baeed.jpg",   # Kids Chicken Burger
    "/images/kids_menu_item/menuitem_601d724413d87.jpg",   # Kids Chicken Fingers
    "/images/menu_item/kids-vegan-beef-1-1.jpg",           # Kids Vegan Burger
    "/images/menu_item/kids-vegan-chkn-1-1.jpg",           # Kids VFC Burger
)})
# (b) a third-party brand's bottle or can (its logo and label) instead of a photo of the drink served
_BRAND_PACK = "the photo is a third-party brand's bottle or can (Coca-Cola / San Pellegrino label and logo), not the drink served"
SKIP_FILES.update({p: _BRAND_PACK for p in (
    "/images/menu_item/coke.jpg", "/images/menu_item/cokediet.jpg", "/images/menu_item/san-pel-rossa-1-1.jpg",
    "/images/menu_item/san-pel-lemon-1-1.jpg", "/images/menu_item/san-pel-o&p-1-1.jpg",
)})
# (c) independent check of 2026-11-17: Lamar's Bar's photo has a wrapped Mars bar with its full logo across the front of the dish; a third-party
#     brand's pack and logo is left out even when the food is also in the picture (CLAUDE.md rule 2; the checker overruled the earlier "prop" call)
SKIP_FILES["/images/menu_item/img_7540-(1)(3).jpg"] = "Lamar's Bar: a wrapped Mars bar (third-party brand's pack and logo) fills the front of the photo"

# Rows kept from the run of 2026-10-07 whose page no longer lists the dish. On 2026-11-17 https://fathippo.co.uk/menus/special-menu/ served the
# general "Our Menu" landing page with no dish cards (the Special menu has ended), so these two published items can no longer be matched. Their
# photos were the chain's own photos on that page, tied to these exact dishes by the card title and alt text when they were taken (2026-10-07), and
# were looked at again on 2026-11-17: they are kept as they were (same file, same source page) while the items stay published. Delete an entry
# (and rerun) to drop it. item id -> (stored file, the page that showed it, the date it was taken there)
CARRIED_OVER: dict[str, tuple[str, str, str]] = {
    "big-poppa-special-menu": ("8e77924b7efe.webp", "https://fathippo.co.uk/menus/special-menu/", "2026-10-07"),
    "hypnotize-fries-special-menu": ("ab24b00a992e.webp", "https://fathippo.co.uk/menus/special-menu/", "2026-10-07"),
}

TOKEN = re.compile(r'<h3 class="menu-section__title">(?P<section>.*?)</h3>|<article class="menu-item"[^>]*>', re.S)


def text_of(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def img_photo(tag: str) -> tuple[str | None, str]:
    """(photo path the <img> shows, alt text). data-src is the real photo when the page lazy-loads it."""
    alt = re.search(r'\balt="([^"]*)"', tag)
    real = re.search(r'\bdata-src="([^"]*)"', tag) or re.search(r'\bsrc="([^"]*)"', tag)
    path = html.unescape(real.group(1)) if real else None
    return path, html.unescape(alt.group(1)) if alt else ""


def cards(doc: str) -> list[dict]:
    """One dict per dish card in reading order: section, title, thumbnail photo/alt, modal photo/alt."""
    out = []
    marks = list(TOKEN.finditer(doc))
    section = ""
    for i, m in enumerate(marks):
        if m.group("section") is not None:
            section = text_of(m.group("section"))
            continue
        end = marks[i + 1].start() if i + 1 < len(marks) else len(doc)
        blk = doc[m.start():end]
        t = re.search(r'menu-item__title">(.*?)</h4>', blk, re.S)
        thumb = re.search(r'<div class="menu-item__thumbnail[^>]*>(.*?)</div>', blk, re.S)
        modal = re.search(r'<div class="modal__dialogue__image">(.*?)</div>', blk, re.S)
        timgs = re.findall(r"<img\b[^>]*>", thumb.group(1)) if thumb else []
        mimgs = re.findall(r"<img\b[^>]*>", modal.group(1)) if modal else []
        out.append({
            "section": section,
            "title": text_of(t.group(1)) if t else "",
            "thumb": [img_photo(x) for x in timgs],
            "modal": [img_photo(x) for x in mimgs],
        })
    return out


def photo_url(path: str) -> str:
    # the page's own path, with only characters that cannot appear raw in a URL percent-encoded
    return SITE + urllib.parse.quote(path, safe="/()&'!*+,;=:@~-._")


def spec_for(page: str, section: str, title: str) -> dict | None:
    for spec in ROWS[page]:
        if spec["section"] == section and spec["title"] == title:
            return spec
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the pages only; print the matches; write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    found: dict[str, dict[str, tuple[str, str, str]]] = {}   # item id -> {photo path: (page url, card title, how)}
    skipped: list[str] = []
    try:
        for page, path in PAGES.items():
            page_url = SITE + path
            doc = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            seen_keys: set[tuple[str, str]] = set()
            for c in cards(doc):
                section, title = c["section"], c["title"]
                where = f"{page} page / {section or '-'} / {title}"
                key = (section, title)
                spec = spec_for(page, section, title)
                if spec is None:
                    skipped.append(f"{where}: not a card fat_hippo.py knows (the page changed?)")
                    continue
                if spec["kind"] == "skip":
                    continue                      # no nutrition panel: not a published item
                if key in seen_keys:
                    skipped.append(f"{where}: the card appears twice in the same section")
                    continue
                seen_keys.add(key)
                if spec["kind"] == "dup":
                    of_section, of_title = spec["of"]
                    spec = spec_for(page, of_section, of_title)
                if not c["thumb"]:
                    continue                      # the page shows no photo for this dish
                if len(c["thumb"]) != 1:
                    skipped.append(f"{where}: {len(c['thumb'])} images in the thumbnail")
                    continue
                photo, alt = c["thumb"][0]
                if not photo or "menu-placeholder" in photo or not PHOTO_PATH.match(photo):
                    skipped.append(f"{where}: thumbnail is not a dish photo ({photo!r})")
                    continue
                if ic.norm_name(alt) != ic.norm_name(title):
                    skipped.append(f"{where}: thumbnail alt {alt!r} does not name the card's dish")
                    continue
                if c["modal"]:
                    if len(c["modal"]) != 1 or c["modal"][0][0] != photo \
                            or ic.norm_name(c["modal"][0][1]) != ic.norm_name("Preview of " + title):
                        skipped.append(f"{where}: the modal shows a different photo or name ({c['modal']})")
                        continue
                if photo in SKIP_FILES:
                    skipped.append(f"{where}: {photo} skipped: {SKIP_FILES[photo]}")
                    continue
                name = spec["name"]
                cand = by_name.get(ic.norm_name(name), [])
                if not cand:
                    continue                      # the dish is not a published item (held back or not in items.csv)
                if len(cand) != 1:
                    skipped.append(f"{where}: {len(cand)} published items are named {name!r}")
                    continue
                item = cand[0]
                if item["category"] != spec["category"]:
                    skipped.append(f"{where}: item {item['id']} is in category {item['category']!r}, not {spec['category']!r}")
                    continue
                how = "exact name" if ic.norm_name(title) == ic.norm_name(name) else "name + section label"
                found.setdefault(item["id"], {})[photo] = (page_url, title, how)
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    names = {it["id"]: it["name"] for it in items}
    todo: dict[str, tuple[str, str]] = {}            # item id -> (photo path, page url)
    for item_id, photos in sorted(found.items()):
        if len(photos) > 1:
            skipped.append(f"{item_id}: {len(photos)} different photos on the site; ambiguous, no photo")
            continue
        (photo, (page_url, title, how)), = photos.items()
        todo[item_id] = (photo, page_url)
        if args.dry_run:
            print(f"{item_id}: {names[item_id]!r}  card {title!r} ({how})\n    photo {photo_url(photo)}\n    page  {page_url}")

    rows: dict[str, tuple[str, str]] = {}
    if not args.dry_run:
        try:
            for item_id, (photo, page_url) in todo.items():
                url = photo_url(photo)
                try:
                    raw = ic.polite_get(url, args.cache, referer=page_url)
                    rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
                except ic.Blocked:
                    raise
                except (ValueError, urllib.error.URLError) as e:
                    skipped.append(f"{item_id}: {url}: {e}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 2

    # rows kept from an earlier run (see CARRIED_OVER): only for an item still published, not matched today, whose stored file is still there
    carried: list[str] = []
    for item_id, (fname, page_url, taken) in sorted(CARRIED_OVER.items()):
        if item_id not in names:
            skipped.append(f"{item_id}: carried-over row dropped: the item is no longer published")
        elif item_id in todo:
            continue                              # matched again on the site today: today's match wins
        elif not (ic.IMAGES_ROOT / CHAIN / fname).is_file():
            skipped.append(f"{item_id}: carried-over row dropped: {fname} is no longer stored")
        else:
            carried.append(item_id)
            if args.dry_run:
                print(f"{item_id}: {names[item_id]!r}  kept from the run of {taken}: {fname} (page {page_url} no longer lists it)")
            else:
                rows[item_id] = (fname, page_url)

    for s in skipped:
        print("skip:", s)
    unmatched = [it for it in items if it["id"] not in todo and it["id"] not in carried]
    if args.dry_run:
        print(f"{len(todo)} of {len(items)} published items matched, {len(carried)} more kept from an earlier run")
        for it in unmatched:
            print(f"  no photo: {it['id']} ({it['category']})")
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
        print(f"LOOK: {f} is used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
