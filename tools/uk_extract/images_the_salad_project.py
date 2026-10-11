#!/usr/bin/env python3
"""Item photos for The Salad Project from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_the_salad_project.py --cache DIR [--dry-run]

Source: ONE page, https://www.saladproject.co.uk/pages/food (the same page tools/uk_extract/the_salad_project.py reads the macros from).
The page is a Shopify "menu showcase": for every dish there is a tile (`data-menu-item="item-N"`: the dish photo and its name as the
image's alt text), a stage picture (`data-menu-stage-image="item-N"`, the same file at width=1600) and a detail stack
(`data-menu-stack="item-N"`: the dish name, its ingredient list, and "Macros & allergens"; a dish sold with two proteins prints the
two sets of figures as "a / b" with a caption naming the two versions, e.g. "Sesame Chilli Tofu / Honey Mustard Chicken").
The photo is a file in the chain's own Shopify file store on the same host as the page
(https://www.saladproject.co.uk/cdn/shop/files/<file>). We fetch the 1600 px stage URL the page itself names and let
store_image do the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). The tile, the stage picture and the detail stack of one `item-N` must name the same dish (norm_name)
and the tile and stage picture must be the same file. Then
  1. a published item whose name equals the dish name (norm_name) gets the photo (BBQ Protein Bowl, Big Feta Energy, ...);
  2. a published item "<dish name> - <protein>" gets it when the dish's detail stack prints that protein in its [ PREMIUM ] line and
     the dish has no second version (The SP Caesar - Black Pepper Prawns: "[ PREMIUM ] Black pepper prawns, Crumbled parmesan");
  3. a dish printed in two versions ("a / b" figures, caption naming them) has ONE photo of one version. The photo goes only to the
     version the chain's own file name for it names (VARIANT_PHOTO below: Mex_Chicken..., Thai_Me_Up_Bold_Bean_Salad...,
     Satay_Tofu_PB...), after the picture was looked at; the other version gets none.
Anything else (an item the page does not show, a dish on the page we do not publish) gets no photo.

Terms: the chain's site (www.saladproject.co.uk) has no terms-of-use page (/policies/terms-of-service, /pages/terms,
/pages/terms-and-conditions answer 404; the footer shows only "(c)2026 The Salad Project"); its privacy policy (/policies/privacy-policy)
and /pages/faqs, read 2026-10-11, say nothing about images, photography or reuse of content. Nothing to quote.
robots.txt (https://www.saladproject.co.uk/robots.txt, read 2026-10-11): "User-agent: * / Allow: / ... Disallow: /admin, /cart/, /checkout,
/orders, /account, /cdn/wpm/*.js, /services, /sf_*, /cart.js, /recommendations/products, /collections/*sort_by*..., /*?*preview_theme_id=*"
(/pages/food and /cdn/shop/files/ are allowed; polite_get checks every URL, RFC 9309). Product pages carry Shopify's agent note
("Agents should use UCP/MCP for catalog, cart, and checkout") for the shop catalogue; we read the public food page only.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
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

CHAIN_ID = "the-salad-project"
PAGE_URL = "https://www.saladproject.co.uk/pages/food"
PHOTO_PREFIX = "https://www.saladproject.co.uk/cdn/shop/files/"   # the chain's own Shopify file store, as named by the page's img src
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-the-salad-project")
DROP_ITEMS: dict[str, str] = {   # item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
    "the-sp-caesar-black-pepper-prawns": "looked at 2026-10-11: the card's photo (SP_Caesar_Updated_Large_...jpg) shows sliced grilled chicken on the "
                                         "salad, not black pepper prawns, so it is a different version of the dish (the chain's live guide also lists "
                                         "a chicken SP Caesar, which we do not publish)",
}

# Two-version dishes: dish name -> (the version the chain's file name for the one photo names, a word that must be in that file name).
VARIANT_PHOTO = {
    "Mex on the Beach": ("Honey Mustard Chicken", "chicken"),            # Mex_Chicken_Large_<id>.jpg
    "Thai Me Up": ("Bold Bean Satay", "bean"),                           # Thai_Me_Up_Bold_Bean_Salad_Large_<id>.jpg
    "Satay Protein Bowl": ("Sesame-Chilli Tofu", "tofu"),                # Satay_Tofu_PB-2_Large_<id>.jpg
}
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)

TILE = re.compile(r'<li\s+class="menu-showcase__item[^"]*"\s+data-menu-item="(item-\d+)"(.*?)</li>', re.S)
STAGE = re.compile(r'data-menu-stage-image="(item-\d+)"[^>]*>\s*<img\s+src="([^"]+)"[^>]*?\balt="([^"]*)"', re.S)
STACK = re.compile(r'data-menu-stack="(item-\d+)"(.*?)(?=data-menu-stack="item-\d+"|$)', re.S)


def text_of(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def photo_file(url: str) -> str:
    """The file's path under the file store, without Shopify's ?v= and &width= parameters."""
    u = urllib.parse.urlsplit(html.unescape(url if not url.startswith("//") else "https:" + url))
    return u.path


def read_dishes(page: str) -> dict[str, dict]:
    """item-N -> {name, photo (stage url), file, variants[], premium[]}; raises if tile, stage and stack disagree."""
    tiles = {}
    for key, body in TILE.findall(page):
        img = re.search(r'<img\s+src="([^"]+)"[^>]*?\balt="([^"]*)"', body, re.S)
        label = re.search(r'menu-showcase__tile-label">([^<]*)<', body)
        if img:
            tiles[key] = {"src": html.unescape(img.group(1)), "alt": html.unescape(img.group(2)),
                          "label": html.unescape(label.group(1)).strip() if label else ""}
    stages = {k: (html.unescape(u), html.unescape(a)) for k, u, a in STAGE.findall(page)}
    stacks = {}
    for key, body in STACK.findall(page):
        cta = re.search(r'menu-showcase__cta-name">([^<]*)<', body)
        cap = re.search(r'menu-showcase__macros-disclaimer">([^<]*)<', body)
        premium = re.search(r"\[ PREMIUM \](.*?)(?:\[ DRESSING \]|</article>)", text_of_keep(body), re.S)
        stacks[key] = {
            "name": html.unescape(cta.group(1)).strip() if cta else "",
            "variants": [v.strip() for v in html.unescape(cap.group(1)).split(" / ")] if cap else [],
            "premium": text_of(premium.group(1)) if premium else "",
        }
    dishes: dict[str, dict] = {}
    for key, tile in tiles.items():
        stage = stages.get(key)
        stack = stacks.get(key)
        if not stage or not stack:
            continue
        names = {norm_name(tile["alt"]), norm_name(stage[1]), norm_name(stack["name"])}   # the tile label abbreviates ("BBQ PB")
        if len(names) != 1 or photo_file(tile["src"]) != photo_file(stage[0]):
            continue   # the page's own pieces disagree about this dish: no photo
        dishes[key] = {"name": stack["name"], "photo": stage[0] if not stage[0].startswith("//") else "https:" + stage[0],
                       "file": photo_file(stage[0]), "variants": stack["variants"], "premium": stack["premium"]}
    return dishes


def text_of_keep(fragment: str) -> str:
    """Like text_of but keeps the [ LABEL ] markers' brackets (they are text already) and collapses whitespace."""
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        dishes = read_dishes(page)
        if len(dishes) < 10:
            print(f"STOP: only {len(dishes)} dishes could be read from {PAGE_URL}; the page changed shape (nothing written)", file=sys.stderr)
            return 2
        print(f"{len(dishes)} dishes with a tile, a stage picture and a detail card on {PAGE_URL}")

        by_item: dict[str, tuple[str, str]] = {}   # item id -> (photo url, why)
        for key, d in sorted(dishes.items(), key=lambda kv: int(kv[0].split("-")[1])):
            file_name = urllib.parse.unquote(d["file"].rsplit("/", 1)[-1])
            if not d["photo"].startswith(PHOTO_PREFIX):
                skipped.append(f"{d['name']}: photo {d['photo']} is not in the chain's file store")
                continue
            if GENERATED.search(file_name):
                skipped.append(f"{d['name']}: file name {file_name!r} says it is an AI-generated image")
                continue
            dish_key = norm_name(d["name"])
            exact = [it for it in items if norm_name(it["name"]) == dish_key]
            prefixed = [it for it in items if norm_name(it["name"]).startswith(dish_key + " ")]
            if len(d["variants"]) == 2:
                version, word = VARIANT_PHOTO.get(d["name"], (None, None))
                if version is None or version not in d["variants"] or word not in file_name.lower():
                    skipped.append(f"{d['name']}: two versions {d['variants']} and no checked version for photo {file_name!r}")
                    continue
                want = norm_name(f"{d['name']} - {version}")
                hit = [it for it in prefixed if norm_name(it["name"]) == want]
                for it in prefixed:
                    if it not in hit:
                        skipped.append(f"{it['id']}: {d['name']} has one photo, which shows {version}; this is the other version")
                if len(hit) == 1:
                    by_item[hit[0]["id"]] = (d["photo"], f"{d['name']}: file {file_name!r} names {version}")
                else:
                    skipped.append(f"{d['name']}: no single published item {want!r}")
            elif len(exact) == 1 and not d["variants"]:
                by_item[exact[0]["id"]] = (d["photo"], f"{d['name']}: exact name")
            elif len(prefixed) == 1 and not d["variants"] and not exact:
                # "The SP Caesar - Black Pepper Prawns": item name = dish name + " - " + the card's premium protein words
                tail = norm_name(prefixed[0]["name"])[len(dish_key):].strip()
                if tail and tail in norm_name(d["premium"]):
                    by_item[prefixed[0]["id"]] = (d["photo"], f"{d['name']}: the card's premium line names {tail!r}")
                else:
                    skipped.append(f"{prefixed[0]['id']}: {d['name']} card does not name {tail!r}")
            else:
                skipped.append(f"{d['name']}: no single published item with this name ({len(exact)} exact, {len(prefixed)} longer)")

        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                by_item.pop(it["id"], None)

        for item_id, (url, why) in sorted(by_item.items()):
            if args.dry_run:
                print(f"  {item_id:50} {urllib.parse.unquote(url[len(PHOTO_PREFIX):])[:70]}  <- {why}")
                continue
            raw = polite_get(url, args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, PAGE_URL)
            print(f"  {item_id:50} {fname}  <- {why}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(by_item)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
