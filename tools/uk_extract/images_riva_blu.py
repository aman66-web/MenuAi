#!/usr/bin/env python3
"""Item photos for Riva Blu from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_riva_blu.py --cache DIR [--dry-run]

Source: the chain's own menu pages, https://www.rivablu.co.uk/menus/riva-blu-manchester?menu=<menu id> (Main Menu, Dessert Menu, Sunday Roasts,
Canapé Menu; the ids are in MENUS below). Manchester is used because the items came from the guide its own allergen address serves
(tools/uk_extract/riva_blu.py); on 2026-11-17 the Hull, Leeds and Liverpool pages carried the same menus, the same dishes and the same photo for
every dish (all four venues compared, every dish and photo identical). Each page is a Next.js page whose own data (the `self.__next_f` payload in
the HTML, rendered by the chain's own menu component) holds `{"menu": {"id", "name", "sections": [{"name", "items": [{"id", "name", "description",
"image", "allergens", "plu", "menuItemId", ...}]}]}}`: one record per dish, its printed name and its photo. The photo files are hosted by the
chain's menu and nutrition provider, Nutritics, in the chain's own account folder (https://www.nutritics.com/images-user/food/558188/500x500x<n>.jpg);
nothing else is requested besides the four pages and those files.
NOTE FOR THE MAIN SESSION: the page's own setting `"showItemImages": false` (the same on all four venues) means the menu component does not draw these
photos for visitors (its item sheet draws `item.image` only when showImage is true). The photo is the one the chain's own record for that dish points at
in the data the page loads; it is not drawn on the page. The other pages of the site (home, Sunday roast, bottomless tiramisu, Christmas, New Year,
private dining, about, location pages) show only lifestyle and promotion pictures, none of them named as a dish.

Match rule (exact, nothing fuzzy). A photo is attached to a published item (images_common.load_items: holdback.csv rows are left out) only when
  1. the item's category maps to one section of one menu on the page (SECTIONS below: e.g. "Pizza" -> Main Menu > "PIZZA NAPOLETANA"; the Venti
     Sapori tables, gelati, celebration cakes, dips, steak sauces and extras have no section on the website, so they get no photo), and
  2. the item's name, with the bracket riva_blu.py adds to tell apart dishes the guide prints under the same name in different tables removed (exactly
     " (" + the item's category, lower case, as riva_blu.py writes it + ")": "Diavola (pizza)" -> "Diavola", "Merluzzo (secondi piatti, metro only)"
     -> "Merluzzo"), has the same norm_name as exactly one dish record in that section, and
  3. that record has an "image" that is a file under https://www.nutritics.com/images-user/food/558188/ (the chain's account folder), and
  4. the photo is not used by a record of a different dish name anywhere on the four menus (a shared file would be a placeholder), and the item is not in
     DROP_ITEMS (looked at by eye and left out).
Names the website spells differently from the guide get no photo (never "close enough"): e.g. guide "Linguine Triglie" / site "LINGUINE TRIGLIA",
"Rigatoni Arrabiata" / "RIGATONI ARRABBIATA", "Gnocchi Sorrentina" / "GNOCCHI ALLA SORRENTINA", "Gnocchi al Ragu" / "GNOCCHI AL RAGU DI SALSICCA AW23",
"Risotto ai Gamberoni" / "RISOTTO GAMBERONI", "Patatine Fritte con Tartufo" / "PATATINE CON TARTUFO", "Polpette" / "POLPETTE DELLA NONNA",
"Sharing Roast" / "SHARING FEAST", "Pane Fino All'Aglio - Garlic & Rosemary Focaccia" / "FOCACCIA STYLE - ROSEMARY & SEA SALT",
"Pane Fino All'Aglio - Tomato & Basil" / "TOMATO & FRESH BASIL", "Pane Fino All'Aglio - Smoked Provola & Mozzarella" / "MOZZARELLA & SMOKED PROVOLA CHEESE".

robots.txt (read 2026-11-17): https://www.rivablu.co.uk/robots.txt has one group, `User-agent: *`, `Allow: /` and Disallow: /order/, /api/, /healthz,
/sign-in, /sign-up, /account, /bookings, /cms-preview: /menus/ is allowed; no group names an AI crawler. https://www.nutritics.com/robots.txt has one
group, `User-agent: *`, Disallow: /app/ only: /images-user/ is allowed. polite_get checks robots.txt on every URL (RFC 9309).

Terms (https://www.rivablu.co.uk/terms-conditions, read 2026-11-17): "All content, including text, photography, and design, is the property of Riva Blu
and may not be reproduced without written permission." An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk,
CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-11-17: 4 page requests on www.rivablu.co.uk and 65 photo files on www.nutritics.com, nothing refused. 65 of 129 published items matched;
every photo was looked at on contact sheets (photo_sheet.py --per 36 --cols 6) and full size where in doubt: real photos of the dish named, no printed
figures, prices or "new" stickers, no placeholders (every file is used by one dish only). Kept as the chain served them: the Focaccia sits on the chain's
own "RIVA blu" printed paper and the two pizzette canapés and the fries on newspaper-print paper (serving paper, not lettering over the photo).
Left out after looking: Lasagne Contadina (DROP_ITEMS). So 64 items have a photo.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "riva-blu"
HOST = "https://www.rivablu.co.uk"
VENUE = "riva-blu-manchester"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-riva-blu")
PHOTO_PREFIX = "https://www.nutritics.com/images-user/food/558188/"
MENUS = {
    "Main Menu": "85059761-1c4a-4c5e-8adb-3d974c8d52c8",
    "Dessert Menu": "950d6b6f-c805-4bbc-8d96-642080fa2fcc",
    "Sunday Roasts": "8785b5ed-3d5f-4e97-bebc-4f8c11bee312",
    "Canapé Menu": "e4416231-a583-4692-baed-e8481b00d101",
}
# the item's category (items.csv, from the guide's table) -> (menu, section name as the website prints it)
SECTIONS = {
    "Sharing": ("Main Menu", "DA DIVIDERE - Sharing Appetisers"),
    "Sharing (metro only)": ("Main Menu", "DA DIVIDERE - Sharing Appetisers"),
    "Bruschetta & antipasti": ("Main Menu", "ANTIPASTO - Starters"),
    "Pasta & risotto": ("Main Menu", "PASTA & RISOTTO"),
    "Pizza": ("Main Menu", "PIZZA NAPOLETANA"),
    "Secondi piatti (metro only)": ("Main Menu", "SECONDI - Mains"),
    "Sides": ("Main Menu", "CONTORNI"),
    "Desserts": ("Dessert Menu", "DOLCI - Desserts"),
    "Sunday roast": ("Sunday Roasts", "Sunday Roast"),   # the guide's main Sunday roast table (not the Venti Sapori one: no Venti menu on the site)
    "Canapés: bruschetta": ("Canapé Menu", "BRUSCHETTINI"),
    "Canapés: pizzette": ("Canapé Menu", "PIZZETTE"),
    "Canapés: fritti": ("Canapé Menu", "FRITTI"),
    "Canapés: cicchetti": ("Canapé Menu", "CICCHETTI"),
}
# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {
    # Its record's photo (500x500x18073769.jpg) and LASAGNE's (500x500x18073913.jpg) are two shots of one and the same baked dish (same dish, same
    # cheese crust, burn marks and drips, seen side by side at the same scale). LASAGNE CONTADINA is the plant-based one ("vegetable ragù, soya
    # béchamel, plant-based cheese"); the dish photographed has a browned dairy-looking crust over a meat-looking ragù, so the photo is taken to be
    # the beef Lasagne's and is not shown on the plant-based dish (a vegan seeing the beef dish is the worse mistake). Lasagne keeps its photo.
    "lasagne-contadina": "its photo is a second shot of the same baked dish as LASAGNE's photo (the beef lasagne), not a photo of the plant-based dish",
}

NEXT_CHUNK = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', re.S)


def page_url(menu: str) -> str:
    return f"{HOST}/menus/{VENUE}?menu={MENUS[menu]}"


def read_menu(html: str, menu: str) -> dict:
    """The {"menu": {...}} record the page's own menu component is given."""
    payload = "".join(json.loads('"' + c + '"') for c in NEXT_CHUNK.findall(html))
    at = payload.find('{"menu":{"id"')
    if at < 0:
        raise SystemExit(f"{menu}: no menu record in the page: the page has changed shape")
    obj, _ = json.JSONDecoder().raw_decode(payload[at:])
    m = obj["menu"]
    if m.get("id") != MENUS[menu]:
        raise SystemExit(f"{menu}: the page returned menu {m.get('id')!r} ({m.get('name')!r}), not {MENUS[menu]}")
    m["_showItemImages"] = re.findall(r'"showItemImages":(\w+)', payload)
    return m


def strip_suffix(name: str, category: str) -> str:
    """Remove the bracket riva_blu.py appends to tell apart same-named dishes in different tables, and nothing else."""
    suffix = f" ({category.lower().replace(' (', ', ').rstrip(')')})"
    return name[: -len(suffix)] if name.endswith(suffix) else name


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        sections: dict[tuple[str, str], list[dict]] = {}
        names_by_photo: dict[str, set[str]] = {}
        for menu in MENUS:
            m = read_menu(polite_get(page_url(menu), args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"), menu)
            print(f"{menu}: {sum(len(s['items']) for s in m['sections'])} records in {len(m['sections'])} sections (showItemImages {m['_showItemImages']})")
            for s in m["sections"]:
                sections[(menu, s["name"])] = s["items"]
                for rec in s["items"]:
                    img = rec.get("image")
                    if isinstance(img, str) and img.startswith("http"):
                        names_by_photo.setdefault(img, set()).add(norm_name(rec["name"]))
        for key in set(SECTIONS.values()):
            if key not in sections:
                raise SystemExit(f"section {key} is no longer on the page: check SECTIONS")

        matched: dict[str, tuple[str, str, dict]] = {}   # item id -> (photo url, page url, record)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            where = SECTIONS.get(it["category"])
            if where is None:
                skipped.append(f"{it['id']}: the website has no section for the guide's table {it['category']!r}")
                continue
            want = norm_name(strip_suffix(it["name"], it["category"]))
            recs = [r for r in sections[where] if norm_name(r["name"]) == want]
            if len(recs) != 1:
                skipped.append(f"{it['id']}: {len(recs)} records named {want!r} in {where[0]} > {where[1]}")
                continue
            rec = recs[0]
            img = rec.get("image")
            if not (isinstance(img, str) and img.startswith(PHOTO_PREFIX) and img.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))):
                skipped.append(f"{it['id']}: the record {rec['name']!r} has no photo in the chain's account folder ({img!r})")
                continue
            if len(names_by_photo.get(img, ())) > 1:
                skipped.append(f"{it['id']}: the photo {img} is used by records of other dishes too: {sorted(names_by_photo[img])}")
                continue
            matched[it["id"]] = (img, page_url(where[0]), rec)

        for item_id, (url, src, rec) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:52} {url.rsplit('/', 1)[-1]}  <- {rec['name']!r}")
                continue
            raw = polite_get(url, args.cache, referer=src)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, src)
            print(f"  {item_id:52} {fname}  <- {url.rsplit('/', 1)[-1]} {rec['name']!r}")
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
    for f, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
