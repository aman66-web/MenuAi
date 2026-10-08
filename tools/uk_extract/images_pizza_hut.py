#!/usr/bin/env python3
"""Item photos for Pizza Hut (UK restaurants): data/source/pizza-hut/images.csv + web/public/menu-images/pizza-hut/.

    python3 tools/uk_extract/images_pizza_hut.py --cache <dir>

Source: Pizza Hut Restaurants UK's own dine-in menu page for one hut (every hut's page carries the same product records,
checked on three huts: Aberdeen Beach, Leicester Square, Trafford Centre; Aberdeen Beach is a superset):
    https://www.pizzahut.co.uk/restaurants/find/menu/aberdeenbeach
Each product card on that page names the product and carries its photo (`data-src`); a pizza card also lists its
size/crust options, each with its own `data-product-image` (the chain's record, the same photo for every option of that
pizza). robots.txt for www.pizzahut.co.uk: "User-agent: * Allow: / Disallow: /confirmation/" (menu and image paths allowed).

Matching (docs/UK_DATA_PLAYBOOK.md Phase 4), nothing fuzzy:
  * a published item gets a photo when the page's product has exactly the same normalised name as the item (one photo
    only for that name); or
  * a published pizza item "<Product> - <Size> <Crust> (<N>")[ WITHOUT Garlic Sprinkle]" gets the photo of that same
    product record's option with the same product name (exact), size, crust, diameter and garlic variant.
Items the page does not name exactly (Hot Honey Sriracha..., Cheesy Bites, Buffet, salad station, sauces, takeaway ...)
get no photo. Photos are only downsized to 640 px and converted to WebP by images_common.store_image.

Left out after looking at the contact sheet (2026-10-08): every "<Product> - Gluten Free (9" Square)" item. The chain's record gives the
gluten-free option the same photo as the round pan pizza, so the picture would not show the square pizza the item name describes.

Terms (read 2026-10-08, https://www.pizzahut.co.uk/restaurants/about/terms-and-conditions, clause 3.1): "Intellectual property rights in the
Sites, and images and text on them, are protected under copyright and other intellectual property laws around the world. They must not be
copied or used without the express written permission of Pizza Hut Restaurants (except for personal use)." Installed anyway on the founder's
decision of 2026-10-06 (accepted risk, CLAUDE.md rule 2); take the folder and images.csv down the day Pizza Hut asks.
robots.txt (www.pizzahut.co.uk, 2026-10-08): "User-agent: * / Allow: / / Disallow: /confirmation/": the menu page and image paths are allowed.
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


def photo_for(item: dict, cards: list[dict]) -> tuple[str | None, str]:
    """(site image path or None, why) for one published item. Exact matches only."""
    name = item["name"]
    ik = item_key(name)
    if ik and ik[1][1] == "Gluten Free":
        return None, "gluten-free square: the chain's record shows the round pan pizza"
    if ik:
        base, key = ik
        recs = [c for c in cards if norm_name(c["name"]) == norm_name(base) and c["options"]]
        imgs_by_rec = []
        for rec in recs:
            hits = [o for o in rec["options"] if option_key(o["label"]) == key]
            if len(hits) == 1 and hits[0]["image"] and not hits[0]["hidden"] and not hits[0]["disabled"]:
                imgs_by_rec.append(hits[0]["image"])
        if len({urllib.parse.urlsplit(i).path.lower() for i in imgs_by_rec}) == 1:
            return imgs_by_rec[0], "product record option"
        return None, "no exact product/variant on the page"
    recs = [c for c in cards if norm_name(c["name"]) == norm_name(name) and c["image"]]
    paths = {urllib.parse.urlsplit(c["image"]).path.lower() for c in recs}
    if len(paths) == 1:
        return recs[0]["image"], "exact name"
    return None, "ambiguous name" if len(paths) > 1 else "name not on the page"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="directory for cached downloads")
    args = ap.parse_args()
    cache = Path(args.cache)

    try:
        page = polite_get(MENU_URL, cache, accept="text/html,application/xhtml+xml").decode("utf-8", "replace")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping: nothing was stored.")
        return 2
    cards = parse_menu(page)
    print(f"menu page: {len(cards)} product cards")

    items = load_items(CHAIN_ID)
    wanted: dict[str, str] = {}
    reasons: dict[str, str] = {}
    for it in items:
        path, why = photo_for(it, cards)
        reasons[it["id"]] = why
        if path:
            wanted[it["id"]] = path

    # one fetch per distinct photo (paths are case-insensitive on this site)
    by_path: dict[str, str] = {}
    for p in wanted.values():
        by_path.setdefault(urllib.parse.urlsplit(p).path.lower(), p)
    stored: dict[str, str | None] = {}
    for key, p in sorted(by_path.items()):
        url = urllib.parse.urljoin(SITE, p)
        try:
            raw = polite_get(url, cache, referer=MENU_URL)
            stored[key] = store_image(CHAIN_ID, raw)
        except Blocked as e:
            print(f"BLOCKED: {e}. Stopping.")
            return 2
        except (ValueError, OSError) as e:
            print(f"skip photo {url}: {e}")
            stored[key] = None
        except Exception as e:  # network error / 404 on one photo: leave those items without one
            print(f"skip photo {url}: {e}")
            stored[key] = None

    rows: dict[str, tuple[str, str]] = {}
    for item_id, p in wanted.items():
        fname = stored.get(urllib.parse.urlsplit(p).path.lower())
        if fname:
            rows[item_id] = (fname, MENU_URL)
    write_images_csv(CHAIN_ID, rows)

    names = {it["id"]: it["name"] for it in items}
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
