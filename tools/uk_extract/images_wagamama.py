#!/usr/bin/env python3
"""Item photos for Wagamama UK from its own menu page (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_wagamama.py --cache DIR [--dry-run]

Source: https://www.wagamama.com/menu, the same page tools/uk_extract/wagamama.py reads the items, numbers and allergens from (the
Great Britain menu, "07/10/2026 - UK - main website"). Nothing else on the site is requested besides the photo files.

How the page shows a dish's photo (read 2026-11-17 from the page and its own script, /_nuxt/CIzCsxiF.js):
  * every dish ("recipe") in the page's embedded menu data (<script id="__NUXT_DATA__">, read with wagamama_page) carries a list
    "Picts" of {"IsDef": bool, "Img": "wagamamauk/..."};
  * the menu's meal card shows ONE of them: `me = t => { const l = t.find(p => p.IsDef); return l ? l.Img : t[0]?.Img }`, i.e. the
    photo marked as the default, else the first one (PICKED_PHOTO below does exactly this);
  * the card's <img> loads that photo through the site's own image service on www.wagamama.com:
        <img ... alt="katsu chicken wrap" data-testid="meal-card-image"
             src="/_ipx/q_70&s_400x400/https://images.tenkites.com/wagamamauk/imported/Asset_8ad31c9d-..._1.png">
    The script fetches exactly that src (the size the page itself shows, 400 x 400), from www.wagamama.com, and stops if the page's
    server-rendered meal cards no longer use this pattern. store_image only resizes (it is already under 640 px) and writes WebP.

robots.txt (read 2026-11-17):
  * https://www.wagamama.com/robots.txt: one group, `User-agent: *`, Disallow: /digital-menu-1 ... /digital-menu-12, `Allow: /`.
    /menu, /_nuxt/ and /_ipx/ are allowed; no group names an AI crawler. polite_get checks it on every URL (RFC 9309).
  * https://images.tenkites.com/robots.txt (Ten Kites, the menu software vendor whose host stores the original files):
    `User-agent: *`, `Allow: /tenkitestest/menus.html`, `Disallow: /`. That host is NEVER requested by this script: the photos are
    taken only from the URL the chain's own page uses on the chain's own host (www.wagamama.com/_ipx/...), whose robots.txt allows it.
    JUDGEMENT CALL for the main session / founder: the bytes Wagamama's image service returns are its own resized copy of a file it
    keeps on images.tenkites.com. If that is read as working round Ten Kites' rule, delete web/public/menu-images/wagamama/ and
    data/source/wagamama/images.csv (nothing else depends on them).

Match rule (exact, nothing fuzzy). A photo is attached to a published item (items.csv minus holdback.csv) only when
  1. a recipe on the current page, named the way wagamama.py names it (wagamama.RULES gives the section's prefix and suffix,
     wagamama.display_name applies NAME_OVERRIDE and the same tidying), has the same norm_name as the item's name;
  2. every recipe on the page with that name shows the same photo (a name shared by recipes with different photos gets none);
  3. the photo is the one the page's meal card shows for that recipe (PICKED_PHOTO), under wagamamauk/ on the vendor's store.
A gluten free menu item ("... (gluten free menu)") therefore gets the photo of its own gluten free record, never the standard dish's.
Items listed in DROP_ITEMS were looked at on contact sheets and left without a photo (reasons there); a rerun can't bring them back.
Two pairs of records (grilled chicken ramen, lollipop prawn kushiyaki and their gluten free menu versions) name different files that
hold the same bytes, so each pair shares one stored file. One photo (iced latte) is only 200 x 200 px: the page's image service
returns the original's size when it is smaller than 400 px; it passes store_image's 200 px floor and is kept.
The page's image service is asked for 400 x 400 (q_70&s_400x400), the size its card uses; the originals are square (most are named
"..._750x750px"), so nothing visible is cut off (checked on the contact sheets).

Terms (https://www.wagamama.com/terms-and-conditions, read 2026-11-17), section 1: "You must not use any part of our website (or the
content published on our website) for commercial purposes without obtaining a licence from us (or our licensors) to do so. You shall not
conduct, facilitate, authorise or permit any text or data mining or web scraping in relation to our website or any services provided via
(or in relation to) our website for any purpose, including the development, training, fine-tuning or validation of AI systems or models."
and "Our website may not be used, reproduced or stored in any other website or included in any public or private electronic retrieval
system or service, without our express written permission."; section 2: "All intellectual property rights in our website and the content
published on our website belongs to us (or our licensors)". An express restriction; installed on the founder's decisions of 2026-10-06
(his accepted risk; a chain's photos come down the day it asks).

A 401/403/429, a robots refusal or a changed page stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wagamama  # noqa: E402  (RULES, display_name: the same naming the items came from)
import wagamama_page  # noqa: E402  (NUXT_RE, _resolve, _walk, MENU_KEY: the same reader)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "wagamama"
HOST = "https://www.wagamama.com"
MENU_URL = HOST + "/menu"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-wagamama")
VENDOR_PREFIX = "https://images.tenkites.com/"          # the page's image-path prefix (part of the src it builds; never requested)
IPX_SIZE = "q_70&s_400x400"                            # the size the page's meal card loads
CARD_IMG = re.compile(r'<img[^>]*data-testid="meal-card-image"[^>]*>')

# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back. item id -> reason.
# Every other photo (125) shows the dish or drink named, on a plain background, with no writing, figures or stickers.
DROP_ITEMS: dict[str, str] = {}
DROP_ITEMS.update({i: "the photo is another company's branded can (Coca-Cola / Sprite lettering, Coke zero also prints '330ml'), "
                      "not Wagamama's food" for i in ("coke", "diet-coke", "coke-zero", "sprite-zero")})
DROP_ITEMS.update({
    "double-dutch-ginger-beer": "the photo is another company's branded bottle (Double Dutch label)",
    "ginger-kombucha": "the photo is another company's branded can (Equinox kombucha lettering)",
    "kids-cawston-press-apple-pear-juice-drink": "the photo is another company's branded carton (Cawston Press lettering)",
    "kids-cawston-press-apple-summer-berries-juice-drink": "the photo is another company's branded carton (Cawston Press lettering)",
    "still-water": "the photo is another company's branded bottle (TAU label printing '75cl')",
    "sparkling-water": "the photo is another company's branded bottle (TAU label printing '75cl')",
    "kids-tropical-fruit-ice-lolly": "most of the photo is another company's printed wrapper ('pip organic tropical' lettering)",
})


def card_src(img: str) -> str:
    """The <img src> the page's meal card uses for a photo path from the menu data."""
    return f"{HOST}/_ipx/{IPX_SIZE}/{VENDOR_PREFIX}{img}"


def picked_photo(picts: list[dict]) -> str:
    """The page's own choice (`me` in its script): the photo marked IsDef, else the first; '' when there is none."""
    for p in picts:
        if p.get("IsDef"):
            return p.get("Img") or ""
    return (picts[0].get("Img") or "") if picts else ""


def read_page(page: str) -> tuple[str, list[tuple[tuple, dict]]]:
    m = wagamama_page.NUXT_RE.search(page)
    if not m:
        raise SystemExit("No __NUXT_DATA__ payload in the page: the site changed, so this script needs updating.")
    flat = json.loads(m.group(1))
    data = wagamama_page._resolve(flat)(flat[1]["data"])
    if wagamama_page.MENU_KEY not in data:
        raise SystemExit(f"The page has no '{wagamama_page.MENU_KEY}' entry: the site changed, so this script needs updating.")
    menus = data[wagamama_page.MENU_KEY]["Menus"]
    if len(menus) != 1:
        raise SystemExit(f"Expected one menu in the page, found {len(menus)}.")
    out = []
    for top in menus[0]["Sections"]:
        out.extend(wagamama_page._walk(top, ()))
    return menus[0]["Name"], out


def check_card_pattern(page: str, recipes: list[tuple[tuple, dict]]) -> int:
    """The server-rendered meal cards must load exactly card_src(PICKED_PHOTO) for the recipe their alt names; otherwise stop."""
    by_alt: dict[str, set[str]] = {}
    for _, r in recipes:
        by_alt.setdefault(r["Name"], set()).add(card_src(picked_photo(r.get("Picts") or [])))
    cards = CARD_IMG.findall(page)
    if not cards:
        raise SystemExit("No server-rendered meal card on the page: can't confirm how it shows photos, so nothing is fetched.")
    for tag in cards:
        alt = re.search(r'\salt="([^"]*)"', tag)
        src = re.search(r'\ssrc="([^"]*)"', tag)
        if not alt or not src:
            raise SystemExit(f"A meal card's <img> has no alt or src: {tag[:200]}")
        want = by_alt.get(htmllib.unescape(alt.group(1)), set())
        if HOST + htmllib.unescape(src.group(1)) not in want:
            raise SystemExit(f"The meal card for {alt.group(1)!r} loads {src.group(1)!r}, not the photo this script would pick: "
                             "the page changed how it shows photos.")
    return len(cards)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        menu_name, recipes = read_page(page)
        if "UK" not in menu_name:
            raise SystemExit(f"The menu is now called {menu_name!r}, not a UK menu: check the page.")
        n_cards = check_card_pattern(page, recipes)
        print(f"menu {menu_name!r}: {len(recipes)} recipes; {n_cards} server-rendered meal cards checked against the photo rule")

        photos_by_name: dict[str, set[str]] = {}
        for path, r in recipes:
            rule = wagamama.RULES.get(path)
            if rule is None:
                print(f"  section {path} is not one wagamama.py knows: its recipes are not used")
                continue
            prefix, suffix = rule[4], rule[5]
            shown = wagamama.display_name({"ident": r["Ident"], "name": r["Name"]}, prefix, suffix)
            photos_by_name.setdefault(norm_name(shown), set()).add(picked_photo(r.get("Picts") or []))

        matched: dict[str, str] = {}   # item id -> photo path
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            found = photos_by_name.get(norm_name(it["name"]))
            if not found:
                skipped.append(f"{it['id']}: no recipe on the page carries the name {it['name']!r}")
                continue
            if len(found) > 1:
                skipped.append(f"{it['id']}: recipes named {it['name']!r} show different photos {sorted(found)}")
                continue
            img = next(iter(found))
            if not img:
                skipped.append(f"{it['id']}: the page shows no photo for {it['name']!r}")
                continue
            if not img.startswith("wagamamauk/") or not re.fullmatch(r"[A-Za-z0-9_./-]+\.(png|jpe?g|webp)", img, re.I):
                skipped.append(f"{it['id']}: photo path {img!r} is not one of the chain's own files")
                continue
            matched[it["id"]] = img

        for item_id, img in sorted(matched.items()):
            url = card_src(img)
            if args.dry_run:
                print(f"  {item_id:55} {img}")
                continue
            raw = polite_get(url, args.cache, referer=MENU_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, MENU_URL)
            print(f"  {item_id:55} {fname}  <- {img}")
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
