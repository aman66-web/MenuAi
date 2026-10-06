#!/usr/bin/env python3
"""ASK Italian item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4) from ASK's own menu pages.

    python3 tools/uk_extract/images_ask_italian.py --cache /tmp/ask-italian-photos [--dry-run]

Source: https://www.askitalian.co.uk/menus and the /menus/<section> pages it links to (each page renders the whole menu
with a photo per dish, plus a schema.org Menu in JSON-LD where every MenuItem carries its `name` and `image`); the kids
menu is its own page (/menus/kids-set-menu). The photos are served from images.weareopenr.com/azzurri/..., the image
host ASK's own pages load them from (the site's /_next/image proxy is disallowed by robots.txt, so we fetch the
original the proxy points at).

Match rule: a photo is attached to a published item (data/source/ask-italian/items.csv minus holdback.csv) only when the
page's MenuItem name equals the item's name under norm_name(). A site name that carries two different photos, or a name
shared by two published items, gets no photo. Nothing fuzzy: "Calamari" is not "Small Calamari", "Kids Happy Face Pizza"
is not "Happy Face Pizza", a misspelt name in ASK's guide ("Sicillian Lemon Tart") does not match the site's spelling.

robots.txt is honoured and any 401/403/429 stops the run (images_common.polite_get raises Blocked).
Terms (askitalian.co.uk/legal/terms-and-conditions): "This website contains material which is owned by or licensed to
us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
prohibited other than in accordance with the copyright notice". Installed on the founder's decision of 2026-10-06.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import tempfile
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "ask-italian"
BASE = "https://www.askitalian.co.uk"
HUB = f"{BASE}/menus"
IMAGE_HOST = "https://images.weareopenr.com/azzurri/"
# Photos looked at and found unsuitable (not a photo of the dish, or printing nutrition claims): item ids. Empty = none.
REJECT: set[str] = set()


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
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photos, write nothing")
    args = ap.parse_args()
    cache: Path = args.cache

    try:
        pages = menu_pages(cache)
        # norm name -> {image url}, and -> {page url: section}
        photos: dict[str, set[str]] = {}
        shown_on: dict[str, dict[str, str]] = {}
        site_names: dict[str, str] = {}
        for url in pages:
            try:
                doc = page_html(url, cache)
            except urllib.error.HTTPError as e:
                if e.code in (301, 302, 307, 308):  # e.g. /menus/grande-set-menu -> /menus/set-menu (the main menu again)
                    print(f"  {url} redirects ({e.code}) to {e.headers.get('Location')}: not followed, the hub lists the menus")
                    continue
                raise
            for section, name, img in ld_items(doc):
                key = norm_name(name)
                site_names.setdefault(key, name)
                if img:
                    if not img.startswith(IMAGE_HOST):
                        print(f"  ! {name!r}: photo on an unexpected host {img}, skipped")
                        continue
                    photos.setdefault(key, set()).add(img)
                    shown_on.setdefault(key, {}).setdefault(url, section)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 2

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    for key, its in sorted(by_key.items()):
        if key not in photos:
            continue
        if len(its) > 1:
            skipped.append(f"{its[0]['name']}: name shared by {len(its)} published items")
            continue
        it = its[0]
        if it["id"] in REJECT:
            skipped.append(f"{it['name']}: photo rejected on inspection")
            continue
        if len(photos[key]) > 1:
            skipped.append(f"{it['name']}: the site shows {len(photos[key])} different photos for this name")
            continue
        img = next(iter(photos[key]))
        pages_for = shown_on[key]
        # the page for the item's own menu section when there is one, else the first page that shows it
        source = next((u for u, sec in pages_for.items() if u.endswith("/" + section_slug(sec))), next(iter(pages_for)))
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

    print(f"{len(pages)} menu pages, {len(photos)} named photos on the site, {len(items)} published items")
    print(f"items with a photo: {len(rows)}")
    for s in skipped:
        print("  skipped:", s)
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
