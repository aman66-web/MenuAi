#!/usr/bin/env python3
"""Item photos for Farmer J from its own ordering site and website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_farmer_j.py --cache DIR [--dry-run]

Where the photos come from
* A (first choice): order.farmerj.com, the chain's own online ordering site (a white-label Storekit shop on the chain's own domain).
  www.farmerj.com links it as its menu: the "Order Now" buttons on https://www.farmerj.com/fieldbowls/ and /all-locations/ go to
  https://order.farmerj.com/stores, and /all-locations/ links https://order.farmerj.com/farmer-j-tottenham-court-road/menu?service=Pickup.
  The menu page is a script app; it loads JSON from the same host, and only those requests are made here:
    /api/venues/farmer-j-tottenham-court-road           -> venue.menu[0].id (on 2026-11-17 the only one of the 18 venues listed by
                                                           /api/store-group/<id>/stores that has an online menu; the other 17 have none)
    /api/categories/<menu id>?showAll=false&time=<day>T08:30:00 and ...T12:30:00
                                                        -> the breakfast and the lunch menus, exactly the request the page makes when a
                                                           customer picks a pickup time (<day> = today, or the next weekday at a weekend)
  Each product record is {"id", "name", "image": "https://ucarecdn.com/<uuid>/", ...} under categories[].products[]; each option a
  customer can add (bases, sides, toppings, sauces, dips) is a record under modifierGroups{}.products[] with its picture in
  "modifierImage". The photo is fetched as the page's own product card asks for it: image + "-/format/auto/-/resize/800x/" (the 800w
  entry of the card's srcset; Uploadcare's resize keeps the whole picture, nothing is cut off). store_image then resizes to <= 640 px
  and writes WebP; nothing else is changed.
* B (only for a dish A gives no photo): https://www.farmerj.com/fieldtrays/, the "Build Your Own Fieldtray" cards. Each card is one
  WordPress menu-item record: <div class="item"><div class="img"><img src="...-300x300.png" srcset="... <original>.png 500w"></div>
  <h3 class="brand-font h4">Name</h3>...</div>. The photo is the card's largest srcset entry (the uploaded original, not the
  300x300 thumbnail WordPress cuts square). Not used: /breakfast/ and /seasonal-drinks/ (one picture per group of dishes, or
  background pictures beside two drink names: the page does not tie a picture to one dish), the "Set Fieldtrays" slideshow on
  /fieldtrays/ (pictures with no names at all), /fieldbowls/ (pictures paired with a bowl only by the page's left/right layout),
  the recipe posts (home recipes, not menu items) and the Instagram feed on the home page (social media).
  Never used: delivery apps, Google, review sites, orders.farmerj.com (an older ordering host).

Match rule (exact, nothing fuzzy). A published item gets a photo only when a record's own name has the same images_common.norm_name
as the item's name:
  1. a product record on the ordering menu (the dish sold on its own); if records with that name carry different pictures, the
     item gets none (ambiguous);
  2. otherwise an option record on the ordering menu (e.g. the "Choose Your Base" option "Brown Rice"), same rule;
  3. otherwise a card on /fieldtrays/ (B), same rule.
Names that differ by any word give nothing: e.g. the ordering site's "Egg + Bacon Roll" (ours "Farmer's Egg + Bacon Roll"),
"Butter Croissant" ("Croissant"), "Butter Beans, Avo' + Feta" ("Butter Beans, Avo + Feta Pot"), "Smoky Ancho Harissa Chicken"
("Harissa Chicken"), "Lime Leaf Tofu" ("Lime Leaf Tofu + Roasted Hispi"), "Seasonal Mac 'N' Cheese (With Truffle + Shrooms)"
("Seasonal Mac 'N' Cheese"), "Pickled Ginger Cucumbers" ("Pickled Ginger Cucumber"), "Doughlicious Chocolate Chip Cookie"
("Chocolate Chip Cookie"), "Iced Banana Miso Matcha" ("Iced Miso Banana Matcha Latte"), "Extra Salmon" ("Extra Smoked Salmon").
The "<main> Fieldtray" products (a whole tray built around that main) are never used for the main on its own: their names differ.
Photos looked at on contact sheets and left out are listed in DROP_ITEMS (no photo for that item) or SKIP_IMAGES (that picture is
never used, so the next source is tried), so a rerun can't bring them back.

robots.txt (read 2026-11-17): https://order.farmerj.com/robots.txt: "User-agent: *  Allow: /", and a second group naming GPTBot,
OAI-SearchBot, ChatGPT-User, Google-Extended, ClaudeBot, Applebot-Extended and CCBot with "Allow: /.well-known/ucp  Allow: /": every
path used here is allowed. https://www.farmerj.com/robots.txt: "User-agent: *" disallows only /wp-content/uploads/wc-logs/,
/wp-content/uploads/woocommerce_transient_files/, /wp-content/uploads/woocommerce_uploads/, /*?add-to-cart=, /*?*add-to-cart= and
/wp-admin/ (a second Yoast group has an empty Disallow): /fieldtrays/ and the /wp-content/uploads/<year>/<month>/ photos are allowed.
https://ucarecdn.com/robots.txt answers 404 (no rules). polite_get checks robots.txt on every URL (RFC 9309). A 401/403/429, a robots
refusal or an unreadable robots.txt stops the script (exit 1) before anything is written.

Terms (https://www.farmerj.com/terms/, "Website terms of use" dated 20 January 2021, read 2026-11-17), "How you may use material on
our site": "You must not modify the paper or digital copies of any materials you have printed off or downloaded in any way, and you
must not use any illustrations, photographs, video or audio sequences or any graphics separately from any accompanying text." and
"You must not use any part of the content on our site for commercial purposes without obtaining a licence to do so from us or our
licensors." An express restriction; installed on the founder's decisions of 2026-10-06 (his accepted risk; taken down the day the
chain asks). The ordering site's venue record says it has no terms or privacy policy of its own (customPolicies: false).

Run of 2026-11-17: 169 product records (breakfast and lunch menus of 2026-11-17) and 56 option names with a picture on the ordering
site, 28 cards on /fieldtrays/. 46 of 76 published items have a photo: 41 from product records, 5 from option records (Brown Rice,
Farmer's Grains, Sesame Cabbage: "Choose Your Base"; Pickled Cucumber, Pickled Red Onion: "Add Toppings"); /fieldtrays/ was not needed
(every name it carries already has an ordering photo). Extra Egg and Free Range Egg are two records whose pictures are the same file
(two halved eggs), so they share one WebP. Every photo was looked at on contact sheets and at full size: studio shots of the dish on
plain marble, no lettering, figures, stickers, placeholders or other brands' packs; the Yew Pickle + Yuzu Spritz cup carries the chain's
own name "FARMER J" printed down its side (the drink is in view, so it is kept). The pain au chocolat picture was set beside the ordering
site's own "Butter Croissant" picture to be sure the two are different pastries (they are: chocolate shows at one end). Nothing was
left out, so DROP_ITEMS and SKIP_IMAGES are empty. 30 items have no record of the same name on the chain's pages (listed by a run as
"no photo"): mostly dishes whose name differs from the ordering site's (see the examples above) or that are no longer on it (The Med,
Steak Bowl, Amba + Harissa Bowl, J's Greek Salad, The Everything Sauce, Chilli Ginger Aubergine, the three cookies under these names,
Reemie's Date and Walnut, three of the four seasonal drinks).
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "farmer-j"
ORDER = "https://order.farmerj.com"
VENUE = "farmer-j-tottenham-court-road"
MENU_PAGE = f"{ORDER}/{VENUE}/menu"                      # the page that shows the ordering photos (source_url of A rows)
SITE_PAGE = "https://www.farmerj.com/fieldtrays/"       # the page that shows the B photos
UPLOADCARE = re.compile(r"^https://ucarecdn\.com/[0-9a-f-]{36}/$")
SITE_UPLOADS = re.compile(r"^https://www\.farmerj\.com/wp-content/uploads/\d{4}/\d{2}/[^/?#]+\.(?:png|jpe?g|webp)$", re.I)
CARD_SIZE = "-/format/auto/-/resize/800x/"              # the ordering page's own product-card srcset entry (800w)
TIMES = ("08:30:00", "12:30:00")                         # breakfast menu, lunch menu
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
JSON_ACCEPT = "application/json, text/plain, */*"
DEFAULT_CACHE = Path("/tmp/menumacros-images-farmer-j")

# Looked at on contact sheets (2026-11-17). An item here gets no photo from any source.
DROP_ITEMS: dict[str, str] = {}
# A picture listed here (Uploadcare uuid, or a farmerj.com upload file name) is never used; the item falls through to the next source.
SKIP_IMAGES: dict[str, str] = {}


def menu_day(today: date) -> date:
    """The day whose pickup times are asked for: today on a weekday, else the next Monday (the farms trade Monday to Friday)."""
    d = today
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def ordering_records(cache: Path) -> tuple[dict[str, set[str]], dict[str, set[str]], int]:
    """{norm name: {photo urls}} for product records and for option records, and how many product records were read."""
    venue = json.loads(polite_get(f"{ORDER}/api/venues/{VENUE}", cache, accept=JSON_ACCEPT, referer=MENU_PAGE))["venue"]
    if not venue.get("menu"):
        raise SystemExit(f"{VENUE} has no online menu any more: re-check which venue the chain links")
    menu_id = venue["menu"][0]["id"]
    day = menu_day(date.today()).isoformat()
    products: dict[str, set[str]] = {}
    options: dict[str, set[str]] = {}
    n = 0
    for t in TIMES:
        url = f"{ORDER}/api/categories/{menu_id}?showAll=false&time={day}T{t}"
        data = json.loads(polite_get(url, cache, accept=JSON_ACCEPT, referer=MENU_PAGE))
        for cat in data.get("categories", []):
            if not cat.get("active", True) or cat.get("hiddenInMenu"):
                continue
            for p in cat.get("products", []):
                n += 1
                if p.get("image"):
                    products.setdefault(norm_name(p["name"]), set()).add(p["image"])
        for group in (data.get("modifierGroups") or {}).values():
            for o in group.get("products", []):
                img = o.get("modifierImage") or o.get("image")
                if img:
                    options.setdefault(norm_name(o["name"]), set()).add(img)
    if n == 0:
        raise SystemExit("the ordering menu returned no products: the API has changed shape")
    return products, options, n


def site_cards(cache: Path) -> dict[str, set[str]]:
    """{norm name: {original photo url}} from the menu-item cards on /fieldtrays/."""
    page = polite_get(SITE_PAGE, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    page = re.sub(r"<script\b[^>]*>.*?</script>", "", page, flags=re.S)
    out: dict[str, set[str]] = {}
    cards = re.findall(r'<div class="item"><div class="img">(<img[^>]*>)</div><h3 class="brand-font h4">(.*?)</h3>', page, re.S)
    if not cards:
        raise SystemExit(f"{SITE_PAGE}: no menu-item cards found: the page has changed shape")
    for img, name in cards:
        srcset = re.search(r'\ssrcset="([^"]+)"', img)
        best, best_w = "", -1
        for part in (srcset.group(1).split(",") if srcset else []):
            bits = part.strip().split()
            if len(bits) == 2 and bits[1].endswith("w") and bits[1][:-1].isdigit() and int(bits[1][:-1]) > best_w:
                best, best_w = bits[0], int(bits[1][:-1])
        if not best:
            src = re.search(r'\ssrc="([^"]+)"', img)
            best = src.group(1) if src else ""
        best = htmllib.unescape(best)
        if SITE_UPLOADS.match(best):
            out.setdefault(norm_name(htmllib.unescape(re.sub(r"<[^>]+>", "", name))), set()).add(best)
    return out


def image_key(url: str) -> str:
    m = re.match(r"^https://ucarecdn\.com/([0-9a-f-]{36})/$", url)
    return m.group(1) if m else url.rsplit("/", 1)[-1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        products, options, n = ordering_records(args.cache)
        cards = site_cards(args.cache)
        print(f"{n} product records and {len(options)} option names with a picture on {MENU_PAGE}; {len(cards)} cards on {SITE_PAGE}")

        matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url to fetch, page url, how it matched)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            key = norm_name(it["name"])
            found = None
            for label, table in (("ordering product", products), ("ordering option", options), ("fieldtrays card", cards)):
                pics = {u for u in table.get(key, set()) if image_key(u) not in SKIP_IMAGES}
                if not pics:
                    continue
                if len(pics) > 1:
                    skipped.append(f"{it['id']}: {len(pics)} different {label} pictures carry this name (ambiguous)")
                    found = "ambiguous"
                    break
                pic = pics.pop()
                if label.startswith("ordering"):
                    if not UPLOADCARE.match(pic):
                        skipped.append(f"{it['id']}: the {label} picture {pic!r} is not an Uploadcare file of the ordering site")
                        found = "bad"
                        break
                    found = (pic + CARD_SIZE, MENU_PAGE, label)
                else:
                    found = (pic, SITE_PAGE, label)
                break
            if found is None:
                skipped.append(f"{it['id']}: no record on the chain's pages carries the name {it['name']!r}")
            elif isinstance(found, tuple):
                matched[it["id"]] = found

        for item_id, (url, page_url, label) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:45} {label:16} {image_key(url.removesuffix(CARD_SIZE))}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:45} {fname}  <- {label} {image_key(url.removesuffix(CARD_SIZE))}")
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
