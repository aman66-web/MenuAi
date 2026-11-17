#!/usr/bin/env python3
"""Item photos for Pizza Hut (UK restaurants): data/source/pizza-hut/images.csv + web/public/menu-images/pizza-hut/.

    python3 tools/uk_extract/images_pizza_hut.py --cache <dir> [--dry-run]

Source: Pizza Hut Restaurants UK's own dine-in menu pages, one per hut, https://www.pizzahut.co.uk/restaurants/find/menu/<hut>.
Since 2026-11-17 the script reads every hut listed in the restaurants' own sitemap (https://www.pizzahut.co.uk/restaurants/sitemap.xml,
the /restaurants/find/details/<hut> entries: 55 huts on 2026-11-17), Aberdeen Beach first, because not every hut lists every product
(e.g. White Chocolate & Caramel Cookie Dough was on 37 of 55 huts and no longer on Aberdeen Beach). Every hut's page carries the same
product records and photo files: a name that two huts showed with different photo files would get no photo (none did on 2026-11-17).
Each product card on a page names the product and carries its photo (`data-src`); a pizza card also lists its size/crust options,
each with its own `data-product-image` (the chain's record; on 2026-11-17 every option of a pizza carried that pizza's photo).
A row's source_url is the first hut page (in that order) that shows the photo for that dish.

Matching (docs/UK_DATA_PLAYBOOK.md Phase 4), nothing fuzzy:
  * a published item gets a photo when a page's product has exactly the same normalised name as the item (one photo
    only for that name across all huts); or
  * a published pizza item "<Product> - <Size> <Crust> (<N>")[ WITHOUT Garlic Sprinkle]" gets the photo of that same
    product record's option with the same product name (exact), size, crust, diameter and garlic variant.
Items the pages do not name exactly get no photo. On 2026-11-17 that was: every "Hot Honey Sriracha Chicken & Pepperoni" item (the
pages call the pizza "Hot Honey Chicken & Pepperoni"), every "- Cheesy Bites (14")" item (no hut lists a Cheesy Bites option), Lasagne and
Classic Mac 'N' Cheese (not on any hut's page), the kids' menu (only the two kids' meal-deal cards, whose picture shows a whole kids' meal,
and kids' drinks under other names such as "Kids Milk"), the buffet pizzas and sides, the salad station, sauces, dips and finishers under
the booklet's names ("Sweet Chilli Dip (50ml)" vs the page's "Sweet Chilli Dip"), "Loaded Bacon Cheesy Bite Bites" (page: "Loaded Cheesy
Bite Bites with Bacon"), "Hot Chocolate Brownie (served with ice cream & sauce)" (page: "Hot Chocolate Brownie & Ice Cream"), "Mini Donuts with
Chocolate Sauce" (page: "Mini Donuts"), and the takeaway desserts. Photos are only downsized to 640 px and converted to WebP by
images_common.store_image.

Left out after looking at the contact sheet (2026-10-08, still true 2026-11-17): every "<Product> - Gluten Free (9" Square)" item. The chain's record
gives the gluten-free option the same photo as the round pan pizza, so the picture would not show the square pizza the item name describes.
DROP_ITEMS below lists anything else left out after looking.

Terms (read 2026-11-17, https://www.pizzahut.co.uk/restaurants/about/terms-and-conditions, clause 3.1, unchanged since 2026-10-08): "These
trademarks and other intellectual property rights in the Sites, and images and text on them, are protected under copyright and other intellectual
property laws around the world. They must not be copied or used without the express written permission of Pizza Hut Restaurants (except for personal
use)." and clause 3.3: "You may print one copy and download extracts of any pages from the Sites for your personal use only. You do not have the right
to make any further copies of information on the Sites or to modify, adapt or reproduce that information." Installed anyway on the founder's decision
of 2026-10-06 (accepted risk, CLAUDE.md rule 2); take the folder and images.csv down the day Pizza Hut asks.
robots.txt (www.pizzahut.co.uk, read 2026-11-17): "User-agent: * / Allow: / / Disallow: /confirmation/" plus two Sitemap lines: the sitemap, the
hut menu pages and the image paths are allowed; no group names an AI crawler. polite_get checks robots.txt on every URL (RFC 9309).
A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "pizza-hut"
SITE = "https://www.pizzahut.co.uk"
MENU_URL = SITE + "/restaurants/find/menu/aberdeenbeach"
SITEMAP_URL = SITE + "/restaurants/sitemap.xml"
HTML_ACCEPT = "text/html,application/xhtml+xml"
# Looked at on contact sheets and left without a photo; a rerun must not bring them back ({item id: why}).
DROP_ITEMS: dict[str, str] = {}

# "Individual Handcrafted (Garlic) 11"" / "Sharing Pan 13''" / "Individual Gluten Free 9''" ...
OPTION_RE = re.compile(r"""^(Individual|Sharing)\s+(Pan|Handcrafted|Gluten Free|Stuffed Crust)\s*(?:\((Garlic|No Garlic)\))?\s*(\d+)\s*(?:''|")\s*$""")
# our item names: 'Pepperoni - Individual Pan (9")', '... Handcrafted (11") WITHOUT Garlic Sprinkle', '... Gluten Free (9" Square)'
ITEM_RE = re.compile(r"""^(?P<base>.+?) - (?P<size>Individual|Sharing) (?P<crust>Pan|Handcrafted|Stuffed Crust) \((?P<dia>\d+)"\)(?P<nog> WITHOUT Garlic Sprinkle)?$""")
ITEM_GF_RE = re.compile(r"""^(?P<base>.+?) - Gluten Free \((?P<dia>\d+)" Square\)$""")


def clean(s: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html.unescape(s)).split())


def parse_menu(page: str) -> list[dict]:
    """[{name, image, options:[{label, image, hidden, disabled}]}] for every product card on the page."""
    cards = []
    for chunk in re.split(r'(?=<div class="menu-item )', page)[1:]:
        m = re.search(r'data-item-name="([^"]*)"', chunk)
        if not m:
            continue
        src = re.search(r'main-menu-product[^>]*?data-src="([^"]*)"', chunk, re.S)
        opts = []
        for om in re.finditer(r'<option value="(\d+)"(.*?)>\s*([^<]*?)\s*</option>', chunk, re.S):
            attrs = om.group(2)
            img = re.search(r'data-product-image="([^"]*)"', attrs)
            opts.append({
                "label": clean(om.group(3)),
                "image": img.group(1) if img and img.group(1) else None,
                "hidden": (re.search(r'data-hide-image="([^"]*)"', attrs) or [None, "false"])[1] == "true",
                "disabled": (re.search(r'data-is-disabled="([^"]*)"', attrs) or [None, "false"])[1] == "true",
            })
        cards.append({"name": clean(m.group(1)), "image": src.group(1) if src else None, "options": opts})
    return cards


def option_key(label: str):
    m = OPTION_RE.match(label)
    if not m:
        return None
    size, crust, garlic, dia = m.groups()
    if crust == "Gluten Free":
        return ("Individual", "Gluten Free", None, dia)
    return (size, crust, (garlic or "").lower() or None, dia)


def item_key(name: str):
    """(product name, variant key) for a pizza item, or None when the name is not a pizza-variant name."""
    m = ITEM_GF_RE.match(name)
    if m:
        return m["base"], ("Individual", "Gluten Free", None, m["dia"])
    m = ITEM_RE.match(name)
    if not m:
        return None
    garlic = None
    if m["crust"] == "Handcrafted":
        garlic = "no garlic" if m["nog"] else "garlic"
    return m["base"], (m["size"], m["crust"], garlic, m["dia"])


def photo_for(item: dict, cards: list[dict]) -> tuple[str | None, str | None, str]:
    """(site image path or None, the hut page that shows it, why) for one published item. Exact matches only; the photo must be the
    same file on every hut page that names the item (`cards` holds every hut's cards, each with its page `url`, in hut order)."""
    name = item["name"]
    if item["id"] in DROP_ITEMS:
        return None, None, "left out after looking: " + DROP_ITEMS[item["id"]]
    ik = item_key(name)
    if ik and ik[1][1] == "Gluten Free":
        return None, None, "gluten-free square: the chain's record shows the round pan pizza"
    if ik:
        base, key = ik
        recs = [c for c in cards if norm_name(c["name"]) == norm_name(base) and c["options"]]
        hits_by_rec = []
        for rec in recs:
            hits = [o for o in rec["options"] if option_key(o["label"]) == key]
            if len(hits) == 1 and hits[0]["image"] and not hits[0]["hidden"] and not hits[0]["disabled"]:
                hits_by_rec.append((hits[0]["image"], rec["url"]))
        paths = {urllib.parse.urlsplit(i).path.lower() for i, _ in hits_by_rec}
        if len(paths) == 1:
            return hits_by_rec[0][0], hits_by_rec[0][1], "product record option"
        return None, None, "ambiguous variant photo" if len(paths) > 1 else "no exact product/variant on the pages"
    recs = [c for c in cards if norm_name(c["name"]) == norm_name(name) and c["image"]]
    paths = {urllib.parse.urlsplit(c["image"]).path.lower() for c in recs}
    if len(paths) == 1:
        return recs[0]["image"], recs[0]["url"], "exact name"
    return None, None, "ambiguous name" if len(paths) > 1 else "name not on the pages"


def hut_pages(cache: Path) -> list[str]:
    """Every hut menu page: Aberdeen Beach first, then the huts of the restaurants' sitemap in its order."""
    sm = polite_get(SITEMAP_URL, cache, accept="application/xml,text/xml").decode("utf-8", "replace")
    slugs = [loc.rstrip("/").rsplit("/", 1)[-1] for loc in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", sm)
             if "/restaurants/find/details/" in loc]
    urls = [MENU_URL]
    for slug in slugs:
        u = f"{SITE}/restaurants/find/menu/{slug}"
        if re.fullmatch(r"[a-z0-9-]+", slug) and u not in urls:
            urls.append(u)
    return urls


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="directory for cached downloads")
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()
    cache = Path(args.cache)

    cards: list[dict] = []
    try:
        pages = hut_pages(cache)
        for url in pages:
            page = polite_get(url, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            hut_cards = parse_menu(page)
            if not hut_cards:
                print(f"{url}: no product cards (page changed shape?): skipped")
                continue
            for c in hut_cards:
                c["url"] = url
            cards.extend(hut_cards)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping: nothing was stored.")
        return 2
    print(f"{len(pages)} hut menu pages, {len(cards)} product cards, {len({norm_name(c['name']) for c in cards})} distinct names")

    items = load_items(CHAIN_ID)
    wanted: dict[str, tuple[str, str]] = {}
    reasons: dict[str, str] = {}
    for it in items:
        path, page_url, why = photo_for(it, cards)
        reasons[it["id"]] = why
        if path and page_url:
            wanted[it["id"]] = (path, page_url)

    names = {it["id"]: it["name"] for it in items}
    if args.dry_run:
        for item_id, (p, page_url) in sorted(wanted.items()):
            print(f"  {names[item_id]:70} {urllib.parse.urlsplit(p).path.rsplit('/', 1)[-1]}  <- {page_url.rsplit('/', 1)[-1]}")
        missing = [i for i in names if i not in wanted]
        print(f"\n{len(wanted)} of {len(items)} published items matched; without a photo ({len(missing)}):")
        for i in missing:
            print(f"  {names[i]}  [{reasons[i]}]")
        return 0

    # one fetch per distinct photo (paths are case-insensitive on this site)
    by_path: dict[str, tuple[str, str]] = {}
    for p, page_url in wanted.values():
        by_path.setdefault(urllib.parse.urlsplit(p).path.lower(), (p, page_url))
    stored: dict[str, str | None] = {}
    for key, (p, page_url) in sorted(by_path.items()):
        url = urllib.parse.urljoin(SITE, p)
        try:
            raw = polite_get(url, cache, referer=page_url)
            stored[key] = store_image(CHAIN_ID, raw)
        except Blocked as e:
            print(f"BLOCKED: {e}. Stopping: images.csv was not written.")
            return 2
        except (ValueError, OSError) as e:
            print(f"skip photo {url}: {e}")
            stored[key] = None
        except Exception as e:  # network error / 404 on one photo: leave those items without one
            print(f"skip photo {url}: {e}")
            stored[key] = None

    rows: dict[str, tuple[str, str]] = {}
    for item_id, (p, page_url) in wanted.items():
        fname = stored.get(urllib.parse.urlsplit(p).path.lower())
        if fname:
            rows[item_id] = (fname, page_url)
    write_images_csv(CHAIN_ID, rows)

    print(f"\n{len(rows)} of {len(items)} published items have a photo; {len(set(f for f, _ in rows.values()))} distinct files")
    by_file: dict[str, list[str]] = {}
    for item_id, (fname, _) in rows.items():
        by_file.setdefault(fname, []).append(item_id)
    for fname, ids in sorted(by_file.items()):
        print(f"  {fname}: {len(ids)} items, e.g. {names[ids[0]]}")
    sp = suspected_placeholders(rows)
    print("suspected placeholders (4+ items):", {f: len(v) for f, v in sp.items()})
    missing = [i for i in names if i not in rows]
    print(f"\nwithout a photo ({len(missing)}):")
    for i in missing:
        print(f"  {names[i]}  [{reasons[i]}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
