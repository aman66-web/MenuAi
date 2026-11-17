#!/usr/bin/env python3
"""Item photos for Wildwood from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wildwood.py --cache DIR [--dry-run]

Source: the chain's own menu pages on wildwoodrestaurants.co.uk, opened for one restaurant (LOCATION, the first in the site's own
"Choose a Location" list):
  https://wildwoodrestaurants.co.uk/menus/?location=billericay                   the Alla Carta (main) menu
  https://wildwoodrestaurants.co.uk/menus/specials-menu/?location=billericay     specials
  https://wildwoodrestaurants.co.uk/menus/lunch-set-menu/?location=billericay    lunch set menu
  https://wildwoodrestaurants.co.uk/menus/evening-set-menu/?location=billericay  evening set menu
  https://wildwoodrestaurants.co.uk/menus/10-menu/?location=billericay           the £10 Club menu
(Read 2026-11-17 for all 24 restaurants in the list: the 22 that show a menu print byte-for-byte the same dishes and photos, Braintree and
Rushden Lakes show none, so one restaurant is enough. The kids' menu is not used: its dishes are children's portions.)
Every dish on these pages is one record: a grid row `<div class="menu-item ..."> ... <a data-target="#modal_menu_<id>">` under a section
header `<div class="box-menu-header"><h3>Pizza</h3>`, and its own pop-up `<div class="modal modal-menu-item fade" id="modal_menu_<id>">`
that holds the dish's name (`<h6 class="h4">`), its picture (`<div class="modal-menu-item-image"><img src="...-1000x563.jpg">`, a file in
the chain's own /wp-content/uploads/ on the same host), the description and the kcal. Only the pop-up's own picture is used: it is the
record that names the dish. store_image reads the bytes, resizes to <= 640 px and writes WebP, nothing else.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the pop-up's name has the same norm_name as the item's name ("Seafood linguine" = "Seafood linguine"), or
  2. on the main menu's "Pizza" section only, the section header followed by the pop-up's name, in the page's own order, has the same
     norm_name as the item's name ("Pizza" + "Margherita" = "Pizza Margherita"). This is how the chain's own calorie sheets print the
     dishes ("PIZZA MARGHERITA"), and how wildwood.py already named "Pizza spicy chicken" (printed 'SPICY CHICKEN' under Pizza). The same
     titles under other headers are other dishes ("Margherita" under "Pizzetta & mixed salad" is the light pizzetta), so no other header is
     prefixed, and a header is never put after a name ("Chicken & chorizo" under "Risotto" is not matched to "Chicken & chorizo risotto").
     Set PIZZA_HEADER_RULE to False to drop the six pizzas this rule matches;
  3. the picture is a file under https://wildwoodrestaurants.co.uk/wp-content/uploads/;
  4. where the same name carries different pictures on different pages, the first page in MENU_PAGES order wins (the main menu) and the
     conflict is printed (none for a published item on 2026-11-17).
Near names that are NOT matched (words differ): "Traditional spaghetti Bolognese" (published: "Traditional Bolognese"), "Tuscan mussel & prawn
casserole" ("Tuscan mussels & prawns casserole"), "Chicken & chorizo calzone" ("Calzone chicken & chorizo"), "Peri-Peri mayo dip" ("Peri-Peri
mayo"), "Basil aioli dip" ("Basil aioli"), "Fries" ("Rosemary fries"), "Salted caramel profiteroles" ("(single)" / "(to share)"), "Sorbet" and
"Ice-cream" (the flavours), the lighter pasta and pizzetta dishes ("Carbonara" vs "Light spaghetti carbonara"), and the large pizzas (another
serving). Held-back items (holdback.csv: minute steak, rib-eye, half chicken, burgers with two calorie figures...) are never given a photo.
The website's menu is newer than the calorie sheets for a few dishes (it prints 595 kcal for the mozzarella garlic bread, the sheets 698): the
photo still shows the dish of that exact name; the calories we publish are not changed by this script.

Terms (https://wildwoodrestaurants.co.uk/terms-conditions/, read 2026-11-17): "This website contains material which is owned by or licensed to
us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is prohibited other than in
accordance with the copyright notice, which forms part of these terms and conditions." (no separate copyright notice is published on the
site). An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk). robots.txt
(https://wildwoodrestaurants.co.uk/robots.txt, read 2026-11-17): one group, `User-agent: *` with an empty `Disallow:` (everything allowed);
no group names an AI crawler. polite_get checks robots.txt on every URL (RFC 9309) and keeps 1 request a second.

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
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wildwood"
HOST = "https://wildwoodrestaurants.co.uk"
UPLOADS = HOST + "/wp-content/uploads/"
LOCATION = "billericay"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wildwood")
# (path under /menus/, label). Order matters: the first page that pictures a name wins.
MENU_PAGES = [
    ("", "Alla Carta (main menu)"),
    ("specials-menu/", "Specials"),
    ("lunch-set-menu/", "Lunch set menu"),
    ("evening-set-menu/", "Evening set menu"),
    ("10-menu/", "£10 Club menu"),
]
PIZZA_HEADER_RULE = True
PIZZA_HEADER = "Pizza"          # only this header of the main menu is put before a dish name (rule 2)
# Looked at on contact sheets after the first run (2026-11-17) and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {
    # The pop-up describes "breaded chicken breast, topped with tomato sauce, melted mozzarella" and offers "+ With spaghetti arrabbiata
    # + 692 kcal" as an extra; the picture shows the chicken WITH that spaghetti, so it shows more food than the published 877 kcal
    # covers (the side is its own published item, add-spaghetti-arrabbiata-chicken-milanese).
    "chicken-milanese": "the picture shows the dish with the spaghetti arrabbiata side, an extra the published calories do not include",
}
# Looked at and kept (2026-11-17): the chain's own branded greaseproof paper ("WILDWOOD") under several starters and sides is how the
# dish is served, not promotional lettering, and prints no figures; no picture carries a price, a sticker, a number or a nutrition claim.

SECTION = re.compile(r'<div class="box-menu-header">\s*<h3>(.*?)</h3>(.*?)(?=<div class="box-menu-header">|\Z)', re.S)
MODAL = re.compile(r'<div class="modal modal-menu-item fade" id="(modal_menu_\d+)"(.*?)(?=<div class="modal modal-menu-item fade"|\Z)', re.S)
MODAL_NAME = re.compile(r'<h6 class="h4">(.*?)</h6>', re.S)
MODAL_IMG = re.compile(r'<div class="modal-menu-item-image">\s*<img[^>]*?\ssrc="([^"]+)"')


def clean(s: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def menu_url(path: str) -> str:
    return f"{HOST}/menus/{path}?location={LOCATION}"


def parse_page(page: str) -> list[dict]:
    """Every dish pop-up on one menu page: {modal, section, name, src}."""
    section_of: dict[str, str] = {}
    for header, chunk in SECTION.findall(page):
        for mid in re.findall(r'data-target="#(modal_menu_\d+)"', chunk):
            section_of.setdefault(mid, clean(header))
    out = []
    for mid, body in MODAL.findall(page):
        name = MODAL_NAME.search(body)
        img = MODAL_IMG.search(body)
        out.append({"modal": mid, "section": section_of.get(mid, ""), "name": clean(name.group(1)) if name else "",
                    "src": htmllib.unescape(img.group(1)) if img else ""})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key = {norm_name(it["name"]): it for it in items}
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, how)
    try:
        for path, label in MENU_PAGES:
            url = menu_url(path)
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            dishes = parse_page(page)
            if not dishes:
                raise SystemExit(f"{url}: no dish pop-ups found: the page has changed shape")
            print(f"{label}: {len(dishes)} dishes, {sum(1 for d in dishes if d['src'])} with a picture  ({url})")
            for d in dishes:
                keys = [(norm_name(d["name"]), "name")]
                if PIZZA_HEADER_RULE and path == "" and d["section"] == PIZZA_HEADER:
                    keys.append((norm_name(f"{PIZZA_HEADER} {d['name']}"), f"header {PIZZA_HEADER!r} + name"))
                for key, how in keys:
                    it = by_key.get(key)
                    if not it:
                        continue
                    if not d["src"]:
                        continue
                    if not d["src"].startswith(UPLOADS):
                        skipped.append(f"{it['id']}: {label} pictures it with {d['src']!r}, not a file in the chain's /wp-content/uploads/")
                        continue
                    prev = matched.get(it["id"])
                    if prev:
                        if prev[0] != d["src"]:
                            print(f"  CONFLICT {it['id']}: {label} pictures it with {d['src'].rsplit('/', 1)[-1]}; "
                                  f"kept {prev[0].rsplit('/', 1)[-1]} from {prev[1]}")
                        continue
                    matched[it["id"]] = (d["src"], url, f"{how}: {d['section']} / {d['name']!r}")

        for it in items:
            if it["id"] in DROP_ITEMS:
                matched.pop(it["id"], None)
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
            elif it["id"] not in matched:
                skipped.append(f"{it['id']}: no pop-up on the menu pages names {it['name']!r} with a picture")

        for item_id, (src, page_url, how) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {src.rsplit('/', 1)[-1]}  <- {how}")
                continue
            raw = polite_get(src, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {src}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {src.rsplit('/', 1)[-1]}  ({how})")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
