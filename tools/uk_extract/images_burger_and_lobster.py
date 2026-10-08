#!/usr/bin/env python3
"""Item photos for Burger & Lobster from its own menu page (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_burger_and_lobster.py [--cache DIR] --dry-run   # read the page, list matches, download nothing
    python3 tools/uk_extract/images_burger_and_lobster.py [--cache DIR]             # download, store, write images.csv

Source: the chain's own menu page for Bond Street, https://www.burgerandlobster.com/locations/london/bond-street/menu/ (the
same page the calories came from: data/source/burger-and-lobster/chain.csv). The page is server-rendered; each dish is a
<div class="dish-item"> with an <h3|h4 class="dish-title">, an optional <div class="dish-image-wrapper"> holding ONE photo
(wp-content/uploads/... on burgerandlobster.com itself, the 1280x854 file the page loads) and the kcal figure(s) printed beside
the dish or beside each of its size/option lines (<span class="size-name"> + <span class="size-variation-calories">).

Match rule (no fuzzy matching): a photo is attached to a published item only when
  1. the dish's printed title equals the item's name letter for letter (case and spacing ignored; this also settles
     "Grilled Greens & Stracciatella" (main menu) against the set menu's "Grilled Greens and Stracciatella", which carry two
     different photos), AND the dish prints the same kcal figure as the item, or
  2. the item is "<option> (<dish title>)" and that dish prints the option line with the item's kcal (the combos: one dish
     record carries the photo and both of its size lines), or
  3. the item is "Beyond Meat Burger (set menu)": the set-menu dish of that title (1211 kcal) carries the photo; the main
     menu's "Beyond-Meat Burger" (998 kcal) is another record without a photo and gets none.
Dishes that print no photo (7oz/5oz/Oklahoma burgers, Connecticut Lobster Roll, croquettes, caviar, sauces, butters, kids' sides)
get none. If two dish records match one item with different photos the item gets none. Every photo URL must be on
www.burgerandlobster.com under /wp-content/uploads/.

robots.txt (read 2026-10-08): disallows /wp-content/uploads/wc-logs/, /woocommerce_transient_files/, /woocommerce_uploads/,
/wp-admin/ (not admin-ajax.php), cart URLs, and (its text runs "Crawl-delay: 10Disallow: /dish/" on one line) clearly means to
disallow /dish/, /dietary-option/ and /product/: this script never requests those. "Crawl-delay: 10": every request here waits
11 seconds. The menu page and /wp-content/uploads/YYYY/MM/ files are not disallowed.
Terms: the site has no terms-of-use page (/terms-and-conditions/, /terms-of-use/, /terms/ answer 404; the sitemap lists only the
privacy and cookie policies). The only notice is the footer line "© Copyright 2026 Burger & Lobster. All rights reserved." (a
generic notice, not an express prohibition). Photos are installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "burger-and-lobster"
PAGE_URL = "https://www.burgerandlobster.com/locations/london/bond-street/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DELAY = 11.0  # robots.txt: Crawl-delay: 10
DEFAULT_CACHE = Path("/tmp/menumacros-images-burger-and-lobster")
PHOTO_URL = re.compile(r"^https://www\.burgerandlobster\.com/wp-content/uploads/\d{4}/\d{2}/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$")

TOKEN = re.compile(
    r'<h2 class="section-title">\s*(?P<section>.*?)\s*</h2>'
    r'|<h3 class="subsection-title">\s*(?P<sub>.*?)\s*</h3>'
    r'|<div class="dish-item"(?P<dish>.*?)(?=<div class="dish-item"|<h2 class="section-title">|<h3 class="subsection-title">|$)',
    re.S,
)
TITLE = re.compile(r'class="dish-title">\s*(?P<t>.*?)\s*</h[34]>', re.S)
IMAGE = re.compile(r'<div class="dish-image-wrapper">\s*<img src="(?P<src>[^"]+)"\s+alt="(?P<alt>[^"]*)"', re.S)
KCAL_HEAD = re.compile(r'class="dish-dietary-calories">(?P<b>.*?)</div>', re.S)  # "588kcal" or "V | 1012 kcal"
SIZE = re.compile(
    r'<span class="size-name">\s*(?P<n>.*?)\s*</span>\s*<span class="size-details">(?P<d>.*?)</span>\s*</div>', re.S)


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def key(s: str) -> str:
    """Letter-for-letter comparison key: case and spacing ignored, nothing else."""
    return clean(s).casefold()


def parse_page(page: str) -> list[dict]:
    dishes, section, sub = [], "", ""
    for m in TOKEN.finditer(page):
        if m.group("section") is not None:
            section, sub = clean(m.group("section")), ""
        elif m.group("sub") is not None:
            sub = clean(m.group("sub"))
        else:
            body = m.group("dish")
            t = TITLE.search(body)
            if not t:
                continue
            img = IMAGE.search(body)
            kcals = {int(k.replace(",", "")) for b in KCAL_HEAD.findall(body) for k in re.findall(r"([\d,]+)\s*kcal", clean(b), re.I)}
            sizes = {}
            for s in SIZE.finditer(body):
                kc = re.search(r"([\d,]+)\s*kcal", s.group("d"), re.I)
                if kc:
                    sizes[key(s.group("n"))] = int(kc.group(1).replace(",", ""))
                    kcals.add(int(kc.group(1).replace(",", "")))
            dishes.append({
                "title": clean(t.group("t")), "section": section, "sub": sub, "kcals": kcals, "sizes": sizes,
                "photo": html.unescape(img.group("src")) if img else None,
                "alt": clean(img.group("alt")) if img else None,
            })
    return dishes


def to_int(s: str) -> int | None:
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def match_item(item: dict, dishes: list[dict]) -> tuple[str | None, str]:
    """(photo URL or None, reason) for one published item."""
    name, kcal = item["name"], to_int(item["calories"])
    title, option = name, None
    if name == "Beyond Meat Burger (set menu)":
        title = "Beyond Meat Burger"  # rule 3: only the set-menu dish (1211 kcal) matches; the kcal check enforces it
    else:
        m = re.fullmatch(r"(?P<opt>.+) \((?P<dish>[^()]+)\)", name)
        if m and any(key(d["title"]) == key(m.group("dish")) and key(m.group("opt")) in d["sizes"] for d in dishes):
            option, title = m.group("opt"), m.group("dish")
    found = []
    for d in dishes:
        if key(d["title"]) != key(title):
            continue
        if option is not None:
            ok = d["sizes"].get(key(option)) == kcal
        else:
            ok = kcal in d["kcals"]
        if ok:
            found.append(d)
    if not found:
        return None, "no dish prints this name with this kcal"
    photos = {d["photo"] for d in found}
    if len(photos) > 1:
        return None, "several dish records match with different photos"
    photo = photos.pop()
    if photo is None:
        return None, "the page shows no photo for this dish"
    if not PHOTO_URL.match(photo):
        return None, f"photo not on the chain's own uploads: {photo}"
    return photo, "ok"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="read the menu page and list matches; download no photo, write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    try:
        page = polite_get(PAGE_URL, args.cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except Blocked as e:
        print(f"BLOCKED: {e}", file=sys.stderr)
        return 1
    dishes = parse_page(page)
    print(f"{len(dishes)} dish records on the page, {sum(1 for d in dishes if d['photo'])} with a photo; {len(items)} published items")

    matches: dict[str, str] = {}
    for it in items:
        photo, why = match_item(it, dishes)
        print(f"  {'PHOTO' if photo else 'none '}  {it['id']:<70} {photo.rsplit('/', 1)[-1] if photo else why}")
        if photo:
            matches[it["id"]] = photo
    print(f"{len(matches)} of {len(items)} published items match a photo ({len(set(matches.values()))} distinct files)")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, url in matches.items():
            if url not in stored:
                try:
                    stored[url] = store_image(CHAIN_ID, polite_get(url, args.cache, delay=DELAY, referer=PAGE_URL))
                except ValueError as e:
                    print(f"  skipped {url}: {e}")
                    stored[url] = ""
            if stored[url]:
                rows[item_id] = (stored[url], PAGE_URL)
    except Blocked as e:
        print(f"BLOCKED: {e}: stopping, nothing written", file=sys.stderr)
        return 1
    write_images_csv(CHAIN_ID, rows)
    total = sum(p.stat().st_size for p in (Path(__file__).resolve().parents[2] / "web" / "public" / "menu-images" / CHAIN_ID).glob("*.webp"))
    print(f"{len(rows)} of {len(items)} published items have a photo; {len(set(f for f, _ in rows.values()))} files, {total / 1024:.0f} KB")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
