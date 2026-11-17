#!/usr/bin/env python3
"""Item photos for The Salad Project from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_the_salad_project.py --cache DIR [--dry-run]

Source: ONE page, https://www.saladproject.co.uk/pages/food (the same page tools/uk_extract/the_salad_project.py reads the macros from).
The page is a Shopify "menu showcase". Layout read 2026-11-17 (the chain's new menu; the October layout is described under History):
for every dish `item-N` there is
  - a tile (`<li class="menu-showcase__item" data-menu-item="item-N">`: a photo whose alt text is the dish name),
  - a stage picture (`data-menu-stage-image="item-N"`): ONE <img> for a dish sold one way, or, for a dish sold in two versions, one
    `<span data-menu-protein-image="<version key>">` per version, each holding that version's own photo (e.g. Mex on the Beach:
    Mex_Chicken_UK_uber_eats.jpg for "Honey Mustard Chicken", Mex_Tofu_UK_uber_eats.jpg for "Sesame Chilli Tofu"),
  - a detail stack (`data-menu-stack="item-N"`): the dish name (`menu-showcase__nutrition-title`), for a two-version dish one button per
    version (`data-menu-protein="<version key>"`, the version's printed name, e.g. "Sesame Chilli Tofu") and one pane per version
    (`data-menu-protein-pane="<version key>"`) with that version's ingredient list; a one-way dish has one ingredient list.
Photos are files in the chain's own Shopify file store on the same host as the page (https://www.saladproject.co.uk/cdn/shop/files/<file>;
the names end "_uber_eats.jpg", but they are served by and shown on the chain's own page). We fetch the 1600 px stage URL the page itself
names and let store_image do the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). The tile, the stage picture(s) and the detail stack of one `item-N` must name the same dish (norm_name),
and every version key with a photo must have a button in the stack. Then, for a published item (data/source/the-salad-project/items.csv
minus holdback.csv):
  1. an item whose name equals the dish name of a one-way dish gets that dish's photo (Caesar Protein Bowl, Miso Salmon, The GOAT);
  2. an item named "<dish name> - <X>" gets the photo of the ONE version (of a two-version dish) whose button prints X (Mex on the Beach
     - Sesame Chilli Tofu, Thai Me Up - Honey Mustard Chicken), or, when no button prints X, of the one version whose own ingredient list
     has an ingredient equal to X (Satay Protein Bowl - Sesame-Chilli Tofu: the "Tofu" version lists "sesame chilli tofu"; the "Chicken"
     version lists "2x shawarma-spiced chicken thighs", so Satay Protein Bowl - Cajun Chicken Thighs gets nothing);
  3. an item named "<dish name> - <X>" of a one-way dish gets its photo when the dish's ingredient list has an ingredient equal to X
     (The SP Caesar - Black Pepper Prawns: "Black pepper prawns").
Anything else gets no photo from today's page. An item matched by a rule today is "listed today" and never keeps an older photo.

Photos kept from an earlier run (CARRY_OVER). A row already in images.csv whose item is still published but which today's page no longer
lists under any rule above (the chain changed its menu on its food page; the menu data still holds the October dishes) keeps its photo
and source page as verified on the day of that run: the photo was then that exact dish's photo on this page under the same name.
write_images_csv gives every row the run's date; the carried rows and their true retrieval date are printed by the run. Carried on
2026-11-17 (all retrieved and looked at 2026-10-11; these dishes are no longer on the page): bbq-protein-bowl, big-feta-energy,
middle-feast-protein-bowl, the-farm-table-by-julius-roberts, surf-turf-protein-bowl. Set CARRY_OVER = False to drop them instead.

History. Until November 2026 the page printed one photo per dish, with the two versions' figures as "a / b" and a caption naming them; a
photo then went only to the version its file name named (Mex_Chicken..., Thai_Me_Up_Bold_Bean_Salad..., Satay_Tofu_PB-2...), and "The SP
Caesar - Black Pepper Prawns" was left out because that photo (SP_Caesar_Updated_Large_...jpg) showed sliced grilled chicken. That file is
in SKIP_FILES. On 2026-11-17 the page shows a photo per version and a new SP Caesar photo (The_SP_Caesar_Prawns_uber_eats.jpg), which
was looked at that day and shows prawns. The page's figures for the dishes still listed differ from the October menu data (e.g. Miso Salmon
761 kcal today, 700 in items.csv): the photos follow the dish names; the menu data needs a refresh by the chain's extraction script.

Terms: the chain's site (www.saladproject.co.uk) has no terms-of-use page (re-checked 2026-11-17: /policies/terms-of-service, /pages/terms,
/pages/terms-and-conditions and /policies/legal-notice answer 404; the footer shows only "(c)2026 The Salad Project"); its privacy policy
(/policies/privacy-policy) and /pages/faqs, read 2026-10-11, say nothing about images, photography or reuse of content. Nothing to quote.
robots.txt (https://www.saladproject.co.uk/robots.txt, read 2026-11-17): "User-agent: * / Allow: /" with Disallow lines for /admin, /cart/,
/checkout(s), /orders, /account, /cdn/wpm/*.js, /services, /sf_*, /cart.js, /recommendations/products, filtered /collections and /blogs
URLs, /*?*preview_theme_id=* and similar (/pages/food and /cdn/shop/files/ are allowed; polite_get checks every URL, RFC 9309). Its
comment lines carry Shopify's notes for shopping agents (UCP/MCP for catalogue, cart and checkout); we read the public food page only.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import csv
import html
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "the-salad-project"
PAGE_URL = "https://www.saladproject.co.uk/pages/food"
PHOTO_PREFIX = "https://www.saladproject.co.uk/cdn/shop/files/"   # the chain's own Shopify file store, as named by the page's img src
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-the-salad-project")
CARRY_OVER = True
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at and left without a photo (a rerun must not bring it back)
SKIP_FILES: dict[str, str] = {    # file-name start (in the chain's file store) -> why that photo is never used
    "SP_Caesar_Updated_Large": "looked at 2026-10-11: shows sliced grilled chicken on the salad, not the black pepper prawns version",
}
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)

TILE = re.compile(r'<li\s+class="menu-showcase__item[^"]*"\s+data-menu-item="(item-\d+)"(.*?)</li>', re.S)
IMG = re.compile(r'<img\s+src="([^"]+)"[^>]*?\balt="([^"]*)"', re.S)


def text_of(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def full_url(src: str) -> str:
    src = html.unescape(src)
    return "https:" + src if src.startswith("//") else src


def photo_file(url: str) -> str:
    """The file's path under the file store, without Shopify's ?v= and &width= parameters."""
    return urllib.parse.urlsplit(full_url(url)).path


def block(page: str, attr: str, key: str, end_attr: str) -> str:
    """The page text from `attr="key"` up to the next `end_attr="item-..."` (or the end of the page)."""
    i = page.find(f'{attr}="{key}"')
    if i < 0:
        return ""
    j = page.find(f'{end_attr}="item-', i + len(attr) + 4)
    return page[i:j if j > 0 else len(page)]


def ingredients(fragment: str) -> list[str]:
    return [text_of(x) for x in re.findall(r"<li>(.*?)</li>", fragment, re.S)]


def read_dishes(page: str, skipped: list[str]) -> dict[str, dict]:
    """item-N -> {name, photo (one-way dish), versions {key: {label, photo, ingredients}}, ingredients (one-way dish)}.
    A dish whose tile, stage picture and detail stack disagree is left out (and reported)."""
    dishes: dict[str, dict] = {}
    for key, tile_body in TILE.findall(page):
        tile = IMG.search(tile_body)
        stage = block(page, "data-menu-stage-image", key, "data-menu-stage-image")
        stage = stage[:stage.find("</div>")] if "</div>" in stage else stage
        stack = block(page, "data-menu-stack", key, "data-menu-stack")
        title = re.search(r'menu-showcase__nutrition-title">(.*?)</h3>', stack, re.S)
        if not (tile and stage and title):
            skipped.append(f"{key}: tile, stage picture or detail card missing")
            continue
        name = text_of(title.group(1))
        version_imgs = re.findall(r'data-menu-protein-image="([^"]+)"[^>]*>\s*<img\s+src="([^"]+)"[^>]*?\balt="([^"]*)"', stage, re.S)
        one_img = IMG.search(stage) if not version_imgs else None
        alts = {norm_name(html.unescape(tile.group(2)))} | {norm_name(html.unescape(a)) for _, _, a in version_imgs}
        if one_img:
            alts.add(norm_name(html.unescape(one_img.group(2))))
        if alts != {norm_name(name)}:
            skipped.append(f"{key}: {name!r}: the tile, stage picture and detail card name different dishes ({sorted(alts)})")
            continue
        d = {"name": name, "photo": None, "versions": {}, "ingredients": []}
        if one_img:
            if photo_file(tile.group(1)) != photo_file(one_img.group(1)):
                skipped.append(f"{name}: the tile and the stage picture are different files")
                continue
            d["photo"] = full_url(one_img.group(1))
            d["ingredients"] = ingredients(stack)
        else:
            buttons = {k: text_of(t) for k, t in re.findall(r'data-menu-protein="([^"]+)"[^>]*>(.*?)</button>', stack, re.S)}
            panes = dict(re.findall(r'data-menu-protein-pane="([^"]+)"(.*?)(?=data-menu-protein-pane="|$)', stack, re.S))
            if set(buttons) != {k for k, _, _ in version_imgs}:
                skipped.append(f"{name}: the versions with a photo and the versions with a button differ")
                continue
            for k, src, _ in version_imgs:
                d["versions"][k] = {"label": buttons[k], "photo": full_url(src), "ingredients": ingredients(panes.get(k, ""))}
        dishes[key] = d
    return dishes


def match(dishes: dict[str, dict], items: list[dict], skipped: list[str]) -> tuple[dict[str, tuple[str, str]], set[str]]:
    """item id -> (photo url, why) for items matched today; and the set of item ids today's page lists under the rules."""
    by_item: dict[str, tuple[str, str]] = {}
    listed: set[str] = set()
    for d in dishes.values():
        dish_key = norm_name(d["name"])
        for it in items:
            iname = norm_name(it["name"])
            if d["photo"] and iname == dish_key:
                listed.add(it["id"])
                by_item[it["id"]] = (d["photo"], f"{d['name']}: exact name")
                continue
            if not iname.startswith(dish_key + " "):
                continue
            # "<dish> - <X>": the part after the dish name, with the separator's punctuation removed by norm_name
            tail = iname[len(dish_key):].strip()
            if d["photo"]:
                if tail in {norm_name(x) for x in d["ingredients"]}:
                    listed.add(it["id"])
                    by_item[it["id"]] = (d["photo"], f"{d['name']}: the dish's ingredient list names {tail!r}")
                continue
            by_label = [k for k, v in d["versions"].items() if norm_name(v["label"]) == tail]
            by_ingredient = [k for k, v in d["versions"].items() if tail in {norm_name(x) for x in v["ingredients"]}]
            pick = by_label if by_label else by_ingredient
            if len(pick) == 1:
                v = d["versions"][pick[0]]
                listed.add(it["id"])
                how = "its button" if by_label else "its ingredient list"
                by_item[it["id"]] = (v["photo"], f"{d['name']}: version {v['label']!r} ({how} names {tail!r})")
            elif len(pick) > 1:
                listed.add(it["id"])
                skipped.append(f"{it['id']}: {len(pick)} versions of {d['name']} name {tail!r}; ambiguous")
            else:
                skipped.append(f"{it['id']}: no version of {d['name']} ({', '.join(v['label'] for v in d['versions'].values())}) "
                               f"is or lists {tail!r}")
    for item_id, (url, _) in list(by_item.items()):
        file_name = urllib.parse.unquote(photo_file(url).rsplit("/", 1)[-1])
        why = next((w for stem, w in SKIP_FILES.items() if file_name.startswith(stem)), None)
        if not url.startswith(PHOTO_PREFIX):
            skipped.append(f"{item_id}: photo {url} is not in the chain's file store")
        elif GENERATED.search(file_name):
            skipped.append(f"{item_id}: file name {file_name!r} says it is an AI-generated image")
        elif why:
            skipped.append(f"{item_id}: {file_name} skipped: {why}")
        elif item_id in DROP_ITEMS:
            skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
        else:
            continue
        del by_item[item_id]
    return by_item, listed


def earlier_rows() -> tuple[dict[str, tuple[str, str]], dict[str, str]]:
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}, {}
    with open(path, newline="", encoding="utf-8") as f:
        rs = list(csv.DictReader(f))
    return {r["item_id"]: (r["file"], r["source_url"]) for r in rs}, {r["item_id"]: r["retrieved_on"] for r in rs}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    names = {it["id"]: it["name"] for it in items}
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        dishes = read_dishes(page, skipped)
        if len(dishes) < 8:
            print(f"STOP: only {len(dishes)} dishes could be read from {PAGE_URL}; the page changed shape (nothing written)", file=sys.stderr)
            return 2
        print(f"{len(dishes)} dishes with a tile, a stage picture and a detail card on {PAGE_URL}")
        by_item, listed = match(dishes, items, skipped)

        before, before_dates = earlier_rows()
        carried: dict[str, tuple[str, str]] = {}
        for item_id, (fname, src) in sorted(before.items()):
            if not CARRY_OVER or item_id in by_item or item_id in listed or item_id not in names:
                continue
            if item_id in DROP_ITEMS:
                skipped.append(f"{item_id}: earlier photo dropped: {DROP_ITEMS[item_id]}")
                continue
            if not (IMAGES_ROOT / CHAIN_ID / fname).is_file():
                skipped.append(f"{item_id}: earlier photo file {fname} is missing; not carried")
                continue
            carried[item_id] = (fname, src)

        for item_id, (url, why) in sorted(by_item.items()):
            if args.dry_run:
                print(f"  {item_id:50} {urllib.parse.unquote(photo_file(url).rsplit('/', 1)[-1])[:60]}  <- {why}")
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

    for item_id, (fname, src) in carried.items():
        print(f"  carried from an earlier run: {item_id:40} {fname} from {src} (retrieved {before_dates.get(item_id, '?')}, "
              f"not on today's page)")
    for s in skipped:
        print(f"  no photo: {s}")
    print("  published items with no photo:", sorted(set(names) - set(by_item) - set(carried)))
    if args.dry_run:
        print(f"{len(by_item)} of {len(items)} published items matched today, {len(carried)} more carried from an earlier run")
        return 0
    rows.update(carried)
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo ({len(carried)} carried from an earlier run)")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
