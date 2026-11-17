#!/usr/bin/env python3
"""Item photos for Burger & Lobster from its own menu page (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_burger_and_lobster.py [--cache DIR] --dry-run   # read the pages, list matches, download nothing
    python3 tools/uk_extract/images_burger_and_lobster.py [--cache DIR]             # download, store, write images.csv

Source: the chain's own restaurant menu pages, https://www.burgerandlobster.com/locations/<city>/<site>/menu/, the ten UK pages
tools/uk_extract/burger_and_lobster.py reads (burger_and_lobster.LOCATIONS; the calories came from them: the Bond Street page as the
reference, compared with the other nine). Each page is server-rendered; each dish is a <div class="dish-item"> with an
<h3|h4 class="dish-title">, an optional <div class="dish-image-wrapper"> holding ONE photo (wp-content/uploads/... on
burgerandlobster.com itself, the 1280x854 file the page loads) and the kcal figure(s) printed beside the dish or beside each of its
size/option lines (<span class="size-name"> + <span class="size-variation-calories">).
Why all ten pages (changed 2026-11-17): until then only the Bond Street page was read. On 2026-11-17 Bond Street, Bread Street,
Knightsbridge, Oxford Circus, Threadneedle Street and West India Quay show a NEW menu ("The B&L burger" 1307 kcal, "Sirloin steak",
"Tres leches"..., only two dishes with a photo), while Leicester Square, Mayfair, High Street Kensington and Brighton still show the
menu our items were read from, with the same 33 photos. Reading Bond Street alone would have dropped 30 of the 31 photos on a rerun.
Our published items are still the October menu's (the chain's data is not this script's business: re-extracting the chain is
tools/uk_extract/burger_and_lobster.py's job, reported to the main session).

Match rule (no fuzzy matching): a photo is attached to a published item only when
  1. the dish's printed title equals the item's name letter for letter (case and spacing ignored; this also settles
     "Grilled Greens & Stracciatella" (main menu) against the set menu's "Grilled Greens and Stracciatella", which carry two
     different photos), AND the dish prints the same kcal figure as the item, or
  2. the item is "<option> (<dish title>)" and that dish prints the option line with the item's kcal (the combos: one dish
     record carries the photo and both of its size lines), or
  3. the item is "Beyond Meat Burger (set menu)": the set-menu dish of that title (1211 kcal) carries the photo; the main
     menu's "Beyond-Meat Burger" (998 kcal) is another record without a photo and gets none.
Every page is read and matched separately with these rules; an item gets a photo only when every page that matches it gives the SAME
photo file (otherwise none), and source_url is the first page (LOCATIONS order) that shows it for that item.
Dishes that print no photo on any page (7oz/5oz/Oklahoma burgers, Beyond-Meat Burger on the main menu, Connecticut Lobster Roll, croquettes,
caviar, add bacon, sauces, butters, kids' sides) get none. If two dish records match one item with different photos the item gets none.
Every photo URL must be on www.burgerandlobster.com under /wp-content/uploads/. EXCLUDE (below) lists the items left out after looking.

robots.txt (read 2026-10-08): disallows /wp-content/uploads/wc-logs/, /woocommerce_transient_files/, /woocommerce_uploads/,
/wp-admin/ (not admin-ajax.php), cart URLs, and (its text runs "Crawl-delay: 10Disallow: /dish/" on one line) clearly means to
disallow /dish/, /dietary-option/ and /product/: this script never requests those. "Crawl-delay: 10": every request here waits
11 seconds. The menu page and /wp-content/uploads/YYYY/MM/ files are not disallowed.
Terms: the site has no terms-of-use page (/terms-and-conditions/, /terms-of-use/, /terms/ answer 404; the sitemap lists only the
privacy and cookie policies). The only notice is the footer line "© Copyright 2026 Burger & Lobster. All rights reserved." (a
generic notice, not an express prohibition). Photos are installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).
(robots.txt and the absence of a terms page as read 2026-10-08; robots.txt re-read 2026-11-17, unchanged.)

Run of 2026-11-17: 31 items matched (the same 31 photos as on 2026-10-08, now shown on Leicester Square, Mayfair, High Street
Kensington and Brighton); 4 left out after looking (EXCLUDE); 27 kept, every one looked at on a contact sheet.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import burger_and_lobster as bl  # noqa: E402  (BASE, LOCATIONS: the ten restaurant pages the items were read from)
from images_common import (  # noqa: E402
    Blocked, load_items, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "burger-and-lobster"
PAGES = [bl.BASE + path for path in bl.LOCATIONS.values()]   # Bond Street first, as before
# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back: {item id: why}
EXCLUDE: dict[str, str] = {
    # the combo dish records carry one photo for both sizes, and the chain's own file names say which size it shows
    "half-lobster-and-beef-burger-b-and-l-combo": "the B&L Combo's one photo (BLComboFull) shows a whole lobster: the Full size, not the half "
                                                  "lobster this item is",
    "half-lobster-and-small-roll-lobster-combo": "the Lobster Combo's one photo (LoboComboFull) shows a whole lobster with the original roll: the "
                                                 "Full size, not the half lobster and small roll this item is",
    "small-lobster-roll-and-beef-burger-roll-combo": "the Roll Combo's one photo (RollComboBig) shows the original (big) lobster roll, not the "
                                                     "small roll this item is",
    # the kids' main is printed on its own ('Crispy chicken strips', 395 kcal); the kids' sides are separate items (B&L Fries 426 kcal)
    "panko-chicken-strips": "the photo shows the strips with a bowl of fries (the kids' meal with its side); the item is the strips alone "
                            "('Crispy chicken strips', 395 kcal; the fries are a separate kids' side)",
}
# Kept after looking (2026-11-17): The Beef Burger (kids) shows the burger with fries, and the chain's own text for the dish says it is
# "served in a brioche bun, a side and your choice of toppings"; Half Lobster (kids) shows half a lobster with fries and butter, as its text
# says ("lemon and garlic butter, fries and salad"); the adult dishes shown with fries all name fries in their text or come with them.
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
    ap.add_argument("--dry-run", action="store_true", help="read the menu pages and list matches; download no photo, write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    per_page: list[tuple[str, list[dict]]] = []
    try:
        for url in PAGES:
            page = polite_get(url, args.cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
            dishes = parse_page(page)
            per_page.append((url, dishes))
            print(f"{len(dishes):4} dish records, {sum(1 for d in dishes if d['photo']):3} with a photo: {url}")
    except Blocked as e:
        print(f"BLOCKED: {e}", file=sys.stderr)
        return 1
    print(f"{len(items)} published items")

    matches: dict[str, tuple[str, str]] = {}   # item id -> (photo URL, first page showing it)
    for it in items:
        found = [(url, match_item(it, dishes)) for url, dishes in per_page]
        photos = {photo for _, (photo, _) in found if photo}
        if it["id"] in EXCLUDE:
            print(f"  none   {it['id']:<70} left out after looking: {EXCLUDE[it['id']]}")
            continue
        if not photos:
            print(f"  none   {it['id']:<70} {found[0][1][1]} (on every page)")
            continue
        if len(photos) > 1:
            print(f"  none   {it['id']:<70} the pages show different photos for it: {sorted(photos)}")
            continue
        photo = photos.pop()
        page_url = next(url for url, (p, _) in found if p == photo)
        matches[it["id"]] = (photo, page_url)
        print(f"  PHOTO  {it['id']:<70} {photo.rsplit('/', 1)[-1]}  ({page_url.split('/locations/')[1]})")
    print(f"{len(matches)} of {len(items)} published items match a photo ({len({u for u, _ in matches.values()})} distinct files)")
    if args.dry_run:
        return 0

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, (url, page_url) in matches.items():
            if url not in stored:
                try:
                    stored[url] = store_image(CHAIN_ID, polite_get(url, args.cache, delay=DELAY, referer=page_url))
                except ValueError as e:
                    print(f"  skipped {url}: {e}")
                    stored[url] = ""
            if stored[url]:
                rows[item_id] = (stored[url], page_url)
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
