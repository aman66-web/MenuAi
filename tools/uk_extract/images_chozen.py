#!/usr/bin/env python3
"""Item photos for Chozen from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_chozen.py --cache DIR [--dry-run]

RESULT OF THE RUN OF 2026-11-17: NO PHOTO CAN BE ATTACHED. Nothing was downloaded beyond two pictures looked at (one to confirm the dish
photos' size, one category tile), and no images.csv is written while nothing matches.

Source: the "WHAT'S ON OFFER?" menu section of the home page https://chozen.co.uk/ (anchor /#menu; the site's own menu, linked as "Our Menu"
from https://chozen.co.uk/nutrition/, the page the items came from: tools/uk_extract/chozen.py). Each dish there is one Visual Composer
column: `<img ... width="113" src="https://chozen.co.uk/wp-content/uploads/2021/08/black-circle-<name>.png" srcset="... 113w, ...-100x100.png 100w">`
followed by `<p ...><span ...>Dish name</span></p>` (mains, sushi boxes, sides, udon and salads). The page says "Price dependent on location.
Images represent a general appearance, actual presentation may vary." The other WordPress pages (wp-json/wp/v2/pages: Christmas opening
hours 2023, Home, Nutrition, Blog, About) show no dish photos; the nutrition page shows one decorative katsu picture tied to no dish name.

Why nothing is attached (2026-11-17):
  1. Every dish photo on the menu is a 113 x 113 px circle (the uploaded original itself: srcset lists only 113w and a 100 px copy; one file,
     black-circle-sweet-and-sour-chicken.png, was downloaded and is 113 x 113 RGBA). That is below store_image's 200 px minimum (an icon, not
     a photo), so this script skips any picture whose largest srcset width is under 200 px before downloading it.
  2. No menu name is the name of a published item. Our 65 items come from the 2018 nutrition PDF, which names each main with its base
     ("Sweet & Sour with White Rice", "Thai Red Chicken with Noodles"), the soups with a size ("Seafood Udon (large)") and the sides with a count
     ("Chicken Gyozas (x3)", "Duck Spring Rolls (x3)", "Vegetable Spring Rolls (x2)"). The website names the dish alone ("Sweet & Sour Chicken",
     "Red Thai Chicken", "Seafood Udon", "Chicken Gyoza (3)", "Duck Spring Rolls (3)", "Veg Spring rolls (3) (V)": three rolls, not two). Under
     norm_name equality 0 of 65 items match; a dish photo is never shared across the white rice / brown rice / noodle versions (the rule is
     one exact name per photo), and "Veg Spring rolls (3)" is a different portion from our "(x2)". The sushi boxes, panko prawns, prawn
     crackers, seaweed salad and edamame on the website are not in the 2018 file, so they are not published items.
  3. The one exact name is "Noodles": the section's header tiles "Noodles", "Gyoza" and "Sushi" (noodle-circle.png, gyoza-circle-1.png,
     sushi-circle.png, 346 px) are category tiles, not dishes. noodle-circle.png was downloaded and looked at: a bowl of chicken and red pepper
     noodles in broth on a large red ring graphic, i.e. a noodle dish standing for the category, while our item "Noodles" is the plain noodle
     base from the PDF. A different product, so it is left out (DROP_ITEMS, CATEGORY_TILES).
If the site later uploads larger photos under the PDF's exact names, rerun this script: it attaches only exact norm_name matches with a
source picture of 200 px or more, and skips the shared placeholder temp-product-image-placement-1.png.

robots.txt (https://chozen.co.uk/robots.txt, read 2026-11-17): a single empty Disallow (everything allowed); polite_get checks it on every URL.
Chozen's server answered 429 Too Many Requests on 2026-10-10 after three requests in about five seconds (web/public/logos/chozen.source.txt), so
this script waits 5 s between requests (DELAY), stricter than the usual 1 s.

Terms: none found (2026-11-17). chozen.co.uk has no terms-of-use page (the WordPress page list above is complete); the only notice is the footer
line "© 2026 Chozen." and the cookie banner's "Privacy Overview".

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    MIN_SIDE, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "chozen"
MENU_URL = "https://chozen.co.uk/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-chozen")
DELAY = 5.0   # seconds between requests to chozen.co.uk (it answered 429 at ~1 request a second on 2026-10-10)
PLACEHOLDER_NAMES = ("temp-product-image-placement",)   # the menu's "no photo yet" tile (Omega Box, Chicken Katsu Crunchy Rolls, Spicy Tofu Rolls)
# the menu section's three header tiles: each stands for a category ("Noodles", "Gyoza", "Sushi"), not for one dish
CATEGORY_TILES = ("noodle-circle", "gyoza-circle", "sushi-circle")
# Looked at and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {
    "noodles": ("the only menu picture named 'Noodles' is the category tile noodle-circle.png (looked at 2026-11-17): a chicken and pepper "
                "noodle dish in broth on a red ring graphic, not the plain noodle base this item is"),
}

ENTRY = re.compile(
    r'<img[^>]*?\ssrc="(https://chozen\.co\.uk/wp-content/uploads/[^"]+)"[^>]*?>'   # the dish photo
    r'(?:(?!<img).)*?<div class="wpb_text_column[^"]*"\s*>\s*<p[^>]*>(.*?)</p>',     # the text block right after it: the dish name
    re.S)


def largest_width(img_tag_src: str, page: str) -> int:
    """The widest copy the page's srcset offers for this file (the original upload's width), 0 if unknown."""
    i = page.find(f'src="{img_tag_src}"')
    tag = page[page.rfind("<img", 0, i):page.find(">", i) + 1]
    widths = [int(w) for w in re.findall(r"\s(\d+)w(?:,|\")", tag)]
    m = re.search(r'\swidth="(\d+)"', tag)
    if m:
        widths.append(int(m.group(1)))
    return max(widths, default=0)


def parse_menu(page: str) -> list[dict]:
    start = page.find("WHAT&#8217;S ON OFFER") if "WHAT&#8217;S ON OFFER" in page else page.find("WHAT'S ON OFFER")
    end = page.find("locations UK wide", start)
    if start < 0 or end < 0:
        raise SystemExit("the home page's menu section ('WHAT'S ON OFFER?' ... 'locations UK wide') was not found: the page has changed shape")
    section = page[start:end]
    out = []
    for src, text in ENTRY.findall(section):
        name = htmllib.unescape(re.sub(r"<[^>]+>", "\n", text)).strip().split("\n")[0].strip()
        if name:
            out.append({"name": name, "src": src, "width": largest_width(src, page)})
    if not out:
        raise SystemExit("no dish entries found in the menu section: the page has changed shape")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(MENU_URL, args.cache, delay=DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
        entries = parse_menu(page)
        print(f"{len(entries)} dish entries in the menu section of {MENU_URL}")
        by_name: dict[str, dict] = {}
        for e in entries:
            print(f"  site: {e['name']!r:45} {e['src'].rsplit('/', 1)[-1]} ({e['width']} px)")
            by_name.setdefault(norm_name(e["name"]), e)

        matched: dict[str, dict] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            e = by_name.get(norm_name(it["name"]))
            if not e:
                skipped.append(f"{it['id']}: no menu entry is named {it['name']!r}")
                continue
            if any(t in e["src"] for t in CATEGORY_TILES):
                skipped.append(f"{it['id']}: the menu's picture named {e['name']!r} is a category tile, not a photo of this dish")
                continue
            if any(p in e["src"] for p in PLACEHOLDER_NAMES):
                skipped.append(f"{it['id']}: the menu shows the 'no photo yet' placeholder")
                continue
            if e["width"] < MIN_SIDE:
                skipped.append(f"{it['id']}: the menu's picture is only {e['width']} px (an icon, under {MIN_SIDE} px)")
                continue
            matched[it["id"]] = e

        for item_id, e in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {e['src'].rsplit('/', 1)[-1]}  <- {e['name']!r}")
                continue
            raw = polite_get(e["src"], args.cache, delay=DELAY, referer=MENU_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as err:
                skipped.append(f"{item_id}: {e['src']}: {err}")
                continue
            rows[item_id] = (fname, MENU_URL)
            print(f"  {item_id:50} {fname}  <- {e['src'].rsplit('/', 1)[-1]}")
    except Blocked as err:
        print(f"BLOCKED, stopping (nothing written): {err}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows:
        print(f"0 of {len(items)} published items have a photo: images.csv not written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
