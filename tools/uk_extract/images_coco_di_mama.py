#!/usr/bin/env python3
"""Coco di Mama item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4) from Coco di Mama's own menu pages.

    python3 tools/uk_extract/images_coco_di_mama.py --cache /tmp/coco-di-mama-photos [--dry-run]

Source, two kinds of page on www.cocodimama.co.uk (the same two kinds of menu coco_di_mama_html.py reads the dishes from):
  1. the restaurant menu: https://www.cocodimama.co.uk/menus and the /menus/<section> pages it links to (each page renders the whole menu
     with a photo per dish, plus a schema.org Menu in JSON-LD where every MenuItem carries its `name` and `image`);
  2. the delivery kitchens' own menu: every https://www.cocodimama.co.uk/locations/delivery-kitchen/<kitchen>/menus page the site's
     sitemap.xml lists (added 2026-11-17). Each carries the same kind of JSON-LD Menu for that kitchen's shorter menu. Only the dishes
     published under "Delivery kitchen menu - ..." (the delivery kitchens' own dishes) are matched against these pages; every other dish is
     matched against the restaurant menu only, so a photo always comes from the menu its dish was read from.
The photos are served from images.weareopenr.com/<tenant>/..., the image host the site's own pages load them from (the site's /_next/image proxy
is disallowed by robots.txt, so we fetch the original the proxy points at).

Match rule: a photo is attached to a published item (data/source/coco-di-mama/items.csv minus holdback.csv) only when a MenuItem on a page of
the item's own menu kind (restaurant or delivery kitchen) names it exactly under norm_name(), after the site's promo marker ("NEW", "NEW⭐") and
emoji decorations are taken off the site's name with azzurri_html.clean_name(): the same cleaning coco_di_mama_html.py applies when it reads the
dish names, so "NEW⭐ Loaded Chicken Caesar Dip with Basil Crostini" names the published "Loaded Chicken Caesar Dip with Basil Crostini" and
"Coco Fries 🌱" names "Coco Fries"; nothing else is changed. A site name that carries two different photos on that menu kind (e.g. two delivery
kitchens showing different pictures), or a name shared by two published items of one menu kind, gets no photo. Nothing fuzzy: "Calamari" is
not "Small Calamari"; a name the site spells differently does not match.

robots.txt is honoured and any 401/403/429 stops the run (images_common.polite_get raises Blocked).
robots.txt of www.cocodimama.co.uk (read 2026-11-17): `User-agent: * Allow: / Disallow: /api/ /studio/ /bookings/share/ /_next/`, so /menus,
/locations/.../menus and /sitemap.xml are allowed. images.weareopenr.com/robots.txt answers HTTP 400 "Invalid path format. Expected:
/{tenant}/{image-path}" (read 2026-11-17; RFC 9309: a 4xx means no rules) and serves the photos.
Terms: the site has no website-terms page (https://www.cocodimama.co.uk/legal lists only a privacy policy and a cookie policy; /legal/terms,
/legal/terms-and-conditions and /legal/website-terms show "Page Not Found", read 2026-11-17). Its footer says "© Coco di Mama Ltd 2026. All
rights reserved." (read 2026-11-17). Its sister sites Zizzi and ASK (same platform and group) say: "This website contains material which is owned
by or licensed to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
prohibited other than in accordance with the copyright notice" (read 2026-10-11). Installed on the founder's decision of 2026-10-06.
STATUS 2026-11-17: 149 pages read (21 restaurant-menu pages, 128 delivery kitchens), nothing blocked; 165 of 194 published items have a photo (170 before an independent check took out 5)
(every one looked at on a contact sheet). Left without one: the REJECT list below, and three delivery dishes whose kitchens show two different
pictures (Chocolate Brownie Bites (V); San Pellegrino - Blood Orange and - Lemon, where one kitchen shows a differently framed file).
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import tempfile
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)
from azzurri_html import clean_name  # noqa: E402  (the extraction's own name cleaning: promo marker and emoji off, nothing else)

CHAIN_ID = "coco-di-mama"
BASE = "https://www.cocodimama.co.uk"
HUB = f"{BASE}/menus"
SITEMAP = f"{BASE}/sitemap.xml"
KITCHEN_MENU = re.compile(r"^/locations/delivery-kitchen/[a-z0-9_-]+/menus$")
DELIVERY_PREFIX = "Delivery kitchen menu - "   # the category coco_di_mama_html.py gives the delivery kitchens' own dishes
RESTAURANT, DELIVERY = "restaurant menu", "delivery kitchen menu"
IMAGE_HOST = "https://images.weareopenr.com/"
# Photos looked at on contact sheets (2026-10-11, again 2026-11-17: every kept photo) and left out (item id -> why). A rerun must not bring
# them back. Kept on purpose: a packaged drink or snack (Coca Cola, Belu, Pipers, Tony's...) whose photo is that very can, bottle or bag,
# as the chain's own menu shows it (the product itself, not a logo in place of food).
_SHARED = ("the site shows one and the same photo for different drinks/fillings ({}): it cannot be a photo of each, so none gets it")
_STICKER = "the picture carries a 'Served Hot' sticker printed on the photo (a stamped label, not part of the dish)"
_BADGE = ("the picture carries a stamped 'Well Grounded: Transforming lives through coffee' badge in its corner (a third-party logo and "
          "promotional lettering, not part of the dish)")
REJECT: dict[str, str] = {
    **{i: _SHARED.format("iced caramel latte / iced coconut vanilla latte") for i in (
        "caramel-iced-latte-large", "caramel-iced-latte-small", "coconut-vanilla-iced-latte-large", "coconut-vanilla-iced-latte-small")},
    **{i: _SHARED.format("iced coconut vanilla matcha / iced matcha latte") for i in (
        "iced-coconut-vanilla-matcha-large", "iced-coconut-vanilla-matcha-small", "iced-matcha-latte-large", "iced-matcha-latte-small")},
    **{i: _SHARED.format("latte / pistachio latte / white chocolate and hazelnut latte") for i in (
        "latte-large", "latte-small", "pistachio-latte-large", "pistachio-latte-small",
        "white-chocolate-and-hazelnut-latte-large", "white-chocolate-and-hazelnut-latte-small")},
    "pork-and-sage-sausage-on-multigrain-sourdough-small": _SHARED.format("pork & sage sausage / crispy bacon on multigrain sourdough: the picture shows bacon"),
    "calabrian-hot-honey-glazed-salmon-power-bowl": _STICKER,
    "lemon-and-herb-chicken-power-bowl": _STICKER,
    # looked at 2026-11-17
    "pesto-and-sunblush-tomato-chickpea-power-bowl-ve": _STICKER,
    **{i: _BADGE for i in ("toasted-gingerbread-latte-large", "toasted-gingerbread-latte-small",
                           "smoked-chicken-mozzarella-and-festive-slaw-on-sourdough")},
    # independent check 2026-11-17
    **{i: ("the picture is a 110 g bag, but the published 201-202 kcal is a smaller bag (Eat Real hummus chips are about 450 kcal per 100 g): "
           "the pack shown prints a size that contradicts our figure") for i in (
        "eat-real-hummus-chips-caramelised-onion-and-balsamic-ve", "eat-real-hummus-chips-italian-cheese-and-black-pepper-ve")},
    "sprite-zero": "the can carries a printed 'New Irresistible Taste' promotional sticker",
    **{i: "the picture shows coffee with milk swirled through it, but the published Iced Americano is black (0 kcal)" for i in (
        "iced-americano-large", "iced-americano-small")},
}


def page_html(url: str, cache: Path) -> str:
    return polite_get(url, cache, accept="text/html,application/xhtml+xml").decode("utf-8", "replace")


def menu_pages(cache: Path) -> list[str]:
    """/menus plus every /menus/<slug> page it links to, in link order (duplicates removed)."""
    hub = page_html(HUB, cache)
    slugs: list[str] = []
    for slug in re.findall(r'href="/menus/([a-z0-9-]+)"', hub):
        if slug not in slugs:
            slugs.append(slug)
    return [HUB] + [f"{HUB}/{s}" for s in slugs]


def kitchen_pages(cache: Path) -> list[str]:
    """Every delivery kitchen's own menu page the site's sitemap.xml lists, sorted."""
    sm = polite_get(SITEMAP, cache, accept="application/xml,text/xml,*/*").decode("utf-8", "replace")
    return sorted({u for u in re.findall(r"<loc>([^<]+)</loc>", sm) if KITCHEN_MENU.match(urllib.parse.urlsplit(u).path)})


def one_photo(urls: set[str], cache: Path) -> str | None:
    """The photo a name carries, or None. Several addresses for one name count as one photo only when every file is byte for byte the
    same (the site uploads the same picture again for some delivery kitchens); then the first address in sorted order is taken (store_image
    names a stored file by the source bytes, so any of them gives the same file). Two files that differ at all are two photos: no photo."""
    if len(urls) == 1:
        return next(iter(urls))
    digests = {hashlib.sha256(polite_get(u, cache, referer=HUB)).hexdigest() for u in sorted(urls)}
    return sorted(urls)[0] if len(digests) == 1 else None


def menu_kind(item: dict) -> str:
    return DELIVERY if item["category"].startswith(DELIVERY_PREFIX) else RESTAURANT


def ld_items(doc: str) -> list[tuple[str, str, str | None]]:
    """(top-level section, item name, image url or None) for every schema.org MenuItem in the page's JSON-LD."""
    out: list[tuple[str, str, str | None]] = []

    def walk(o, section: str | None) -> None:
        if isinstance(o, dict):
            if o.get("@type") == "MenuSection" and section is None:
                section = o.get("name") or ""
            if o.get("@type") == "MenuItem" and o.get("name"):
                img = o.get("image")
                if isinstance(img, list):
                    img = img[0] if len(img) == 1 else None
                if isinstance(img, dict):
                    img = img.get("url")
                out.append((section or "", html.unescape(o["name"]), img if isinstance(img, str) else None))
            for v in o.values():
                walk(v, section)
        elif isinstance(o, list):
            for v in o:
                walk(v, section)

    for block in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', doc, flags=re.S):
        try:
            walk(json.loads(block), None)
        except json.JSONDecodeError:
            continue
    return out


def section_slug(section: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", section.lower().replace("&", " ")).strip("-")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "menu-images-cache" / CHAIN_ID)
    ap.add_argument("--dry-run", action="store_true",
                    help="match and report only; write nothing (it still fetches, into the cache, the few photos it must compare)")
    args = ap.parse_args()
    cache: Path = args.cache

    # (menu kind, norm name) -> {image url}, and -> {image url: {page url: section}}
    photos: dict[tuple[str, str], set[str]] = {}
    shown_on: dict[tuple[str, str], dict[str, dict[str, str]]] = {}
    try:
        pages = [(RESTAURANT, u) for u in menu_pages(cache)] + [(DELIVERY, u) for u in kitchen_pages(cache)]
        for n, (kind, url) in enumerate(pages, 1):
            if n % 25 == 0:
                print(f"  {n}/{len(pages)} pages", flush=True)
            try:
                doc = page_html(url, cache)
            except urllib.error.HTTPError as e:
                if e.code in (301, 302, 307, 308, 404, 410):  # e.g. /menus/grande-set-menu -> /menus/set-menu, or a kitchen that has closed
                    print(f"  {url} answers {e.code}{' to ' + str(e.headers.get('Location')) if e.code < 400 else ''}: not followed")
                    continue
                raise
            for section, name, img in ld_items(doc):
                key = (kind, norm_name(clean_name(name)))
                if img:
                    if not img.startswith(IMAGE_HOST):
                        print(f"  ! {name!r}: photo on an unexpected host {img}, skipped")
                        continue
                    photos.setdefault(key, set()).add(img)
                    shown_on.setdefault(key, {}).setdefault(img, {}).setdefault(url, section)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 2

    items = load_items(CHAIN_ID)
    by_key: dict[tuple[str, str], list[dict]] = {}
    for it in items:
        by_key.setdefault((menu_kind(it), norm_name(it["name"])), []).append(it)

    rows: dict[str, tuple[str, str]] = {}
    urls: dict[str, str] = {}
    skipped: list[str] = []
    for key, its in sorted(by_key.items()):
        if key not in photos:
            continue
        if len(its) > 1:
            skipped.append(f"{its[0]['name']}: name shared by {len(its)} published items of the {key[0]}")
            continue
        it = its[0]
        if it["id"] in REJECT:
            skipped.append(f"{it['name']}: left out after looking: {REJECT[it['id']]}")
            continue
        try:
            img = one_photo(photos[key], cache)
        except Blocked as e:
            print(f"BLOCKED: {e}. Stopping; nothing written.")
            return 2
        if img is None:
            skipped.append(f"{it['name']}: the {key[0]} pages show {len(photos[key])} different photos for this name")
            continue
        pages_for = shown_on[key][img]
        # the page for the item's own menu section when there is one, else the first page that shows it
        source = next((u for u, sec in pages_for.items() if u.endswith("/" + section_slug(sec))), next(iter(pages_for)))
        urls[it["id"]] = img
        if args.dry_run:
            rows[it["id"]] = ("(dry run)", source)
            continue
        try:
            raw = polite_get(img, cache, referer=source)
            fname = store_image(CHAIN_ID, raw)
        except Blocked as e:
            print(f"BLOCKED: {e}. Stopping; nothing written.")
            return 2
        except ValueError as e:
            skipped.append(f"{it['name']}: {e}")
            continue
        rows[it["id"]] = (fname, source)

    print(f"{len(pages)} menu pages ({sum(k == DELIVERY for k, _ in pages)} delivery kitchens), {len(photos)} named photos, {len(items)} published items")
    print(f"items with a photo: {len(rows)}")
    for s in skipped:
        print("  skipped:", s)
    # one picture on items that are not sizes of one dish: look at these by eye (a shared picture may show only one of them). Compared by
    # address in a dry run, and by the stored file (named by the source bytes, so it catches the same picture under two addresses) otherwise.
    shared: dict[str, list[str]] = {}
    for item_id, u in urls.items():
        if item_id not in rows:
            continue
        shared.setdefault(u if args.dry_run else rows[item_id][0], []).append(item_id)
    for u, ids in sorted(shared.items()):
        if len({re.sub(r"-(large|small|single|double)(-v|-ve)?$", "", i) for i in ids}) > 1:
            print(f"  SHARED PHOTO, check by eye: {u} on {', '.join(sorted(ids))}")
    if args.dry_run:
        for item_id, (_, src) in sorted(rows.items()):
            print(f"  {item_id} <- {src}")
        return 0
    path = write_images_csv(CHAIN_ID, rows)
    print(f"wrote {path}")
    for fname, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE: {fname} used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
