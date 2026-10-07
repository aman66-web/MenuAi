#!/usr/bin/env python3
"""Item photos for Taco Bell UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_taco_bell.py --cache <dir> [--dry-run] [--exact-only]

Source: https://www.tacobell.co.uk/category/<category>/ (the chain's own menu pages; the nutrition data came from
https://www.tacobell.co.uk/nutrition-information/). Every product on a category page is ONE record:
    <li class="product-item"> <a href=".../products/<slug>/?category=<c>"><img class="product-image-photo" src="...jpg"></a>
        ... <a class="product-item-link" href=".../products/<slug>/?category=<c>">Product name</a> </li>
The photo is the 475x430 tile image served from www.tacobell.co.uk/wp-content/uploads/ (the original upload: its file name
carries the size, it is not a WordPress-generated resized copy), the same host as the pages. store_image only downsizes
(never enlarges: 475 px stays 475 px) and re-encodes to WebP. The product page's own 1370x650 hero banner is NOT used.

Match rule (exact, nothing fuzzy; a wrong photo is worse than none):
  1. exact: the tile's printed name equals a published item's name (images_common.norm_name: case, punctuation, "(R)" and
     the like ignored, so "Crunchwrap Supreme(R)" = "Crunchwrap Supreme" and "7 Layer Burrito" = "7-Layer Burrito"; words are
     never dropped, reordered or approximated), the item name is unique among published items, and exactly one product
     record on the site has that name.
  2. filling variant: the nutrition table prints "<product> - <filling>" ("Crunchy Taco - Black Beans"). The item gets the
     product's photo only when (a) <product> equals the tile's name exactly, and (b) the PRODUCT'S OWN PAGE (same record,
     <h1> equal to the tile name) lists that filling in its "Fillings" list. The page says "Seasoned Beef" where the table
     says "Beef", and "Black Beans" where the chalupa row says "Black Bean": FILLINGS below is the whole alias table (page
     wording -> table wordings); nothing else is equated. This is the "same record carries photo and variant" case: the
     photo shows ONE filling, so a variant shares the product's picture (dry-run lines say "variant"; --exact-only turns
     rule 2 off). Variants the page does not list get no photo.
  3. Nothing else: the site names some products differently from the table ("2 Crispy Chicken Tenders" vs "Crispy Chicken
     Tenders (2)", "Mini Quesadilla" vs "Baby Quesadilla", "Seasoned Nachos" vs "Nacho Chips"), sells the sizes of one
     product with one photo and no size list on the page ("Seasoned Fries", "Chicken Bites", "Salted Caramel Churro Bites"),
     and shows meals/boxes where the table has single items ("Grilled Cheese Volcano Burrito Box"). Those items get no
     photo; they are printed as "no photo". A product that shows different photos on different category pages, or whose
     name two different products share, gets none.
Tiles whose product page is not needed (rule 1) are not fetched; product pages are fetched only for rule 2.

Not taken: the delivery apps and third-party sites linked from the pages, and the Instagram images on the home page.

Terms (https://www.tacobell.co.uk/website-terms/, read 2026-10-07): "The graphic images, buttons and text contained in this
Site (and the Site's 'look and feel') are the exclusive property of Taco Bell and, except for personal use, may not be
copied, distributed, or reproduced or transmitted in any form or by any mean, electronic, mechanical, photocopying,
recording or otherwise, without the prior written permission of Taco Bell." and "By visiting the Site the User does not
acquire or obtain by implication or otherwise, any license or right to use or make additional copies of any materials or
information displayed on the Site." Installed on the founder's decision of 2026-10-06 (the founder's accepted risk);
the photos come down the day the chain asks.

robots.txt (https://www.tacobell.co.uk/robots.txt, read 2026-10-07): "User-agent: * / Disallow: /wp-admin/ / Allow:
/wp-admin/admin-ajax.php / Crawl-delay: 10". Category pages, product pages and /wp-content/uploads/ are allowed. We honour
the Crawl-delay: every request to the host waits 10 seconds (CRAWL_DELAY), so a full first run takes about 8-10 minutes
(10 category pages, 9 product pages, then each of the ~29 distinct photos once); reruns with the same --cache fetch nothing
twice. The dry run (2026-10-07) matched 45 of 102 published items: 22 by exact name, 23 filling variants, 29 photos. The
photos themselves were NOT looked at when this script was written (dry run fetches pages only): the checker must look for
banner-style text/claims (the "CategoryImage" files: Loaded Protein Bowl) and for filling-variant pictures that show a
different filling (tacos, chalupa, gordita), and drop them with SKIP_FILES or --exact-only.

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "taco-bell"
SITE = "https://www.tacobell.co.uk"
CRAWL_DELAY = 10.0   # robots.txt: Crawl-delay: 10
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# Category pages that list products we publish (single dishes, sides, sauces, desserts). Meals/boxes/groups/drinks/Taco
# Tuesday pages hold no published item (meals and boxes are not in the data; every drink is held back).
CATEGORIES = ["tacos", "burritos", "specialities", "crispy-chicken", "sides", "fries", "dessert", "fan-favourites",
              "vegetarian-cravings", "value-menu"]
# The product page's wording for a filling -> the wordings the nutrition table uses for it (normalised by norm_name).
FILLINGS = {
    "seasoned beef": {"beef"},
    "black beans": {"black beans", "black bean"},
    "grilled chicken": {"grilled chicken"},
}
SKIP_FILES: dict[str, str] = {}   # photo file name -> why it is not used (nutrition text, claims, placeholder...)

TILE = re.compile(r'<li class="product-item">(.*?)</li>', re.S)
TILE_IMG = re.compile(r'<a href="(?P<href>[^"]+)"[^>]*>\s*<img class="product-image-photo" src="(?P<src>[^"]+)"', re.S)
TILE_NAME = re.compile(r'<a class="product-item-link" href="(?P<href>[^"]+)"[^>]*>\s*(?P<name>.*?)\s*</a>', re.S)
PHOTO_OK = re.compile(r"^https://www\.tacobell\.co\.uk/wp-content/uploads/[^\s\"'?]+\.(?:jpe?g|png|webp)$", re.I)


def strip_comments(page: str) -> str:
    # The pages keep switched-off markup (e.g. "Order Now" buttons) inside HTML comments: only live markup counts.
    return re.sub(r"<!--.*?-->", "", page, flags=re.S)


def product_key(href: str) -> str:
    """https://www.tacobell.co.uk/products/volcano-burrito/?category=burritos -> /products/volcano-burrito/"""
    href = html.unescape(href).split("?", 1)[0].split("#", 1)[0]
    return href.replace(SITE, "")


def tiles_of(page: str) -> list[dict]:
    out = []
    for m in TILE.finditer(strip_comments(page)):
        block = m.group(1)
        img, name = TILE_IMG.search(block), TILE_NAME.search(block)
        if not img or not name:
            continue                      # no photo (e.g. "Build Your Own Deluxe Box") or no name
        if product_key(img.group("href")) != product_key(name.group("href")):
            continue                      # photo and name must be one record
        src = html.unescape(img.group("src"))
        if not PHOTO_OK.match(src):
            continue
        out.append({"name": re.sub(r"<[^>]+>", "", html.unescape(name.group("name"))).strip(),
                    "product": product_key(name.group("href")), "href": html.unescape(name.group("href")), "photo": src})
    return out


def product_page_info(page: str) -> tuple[str, set[str]]:
    """(the <h1> name, the set of norm_name'd entries of the page's 'Fillings' list)."""
    page = strip_comments(page)
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    title = re.sub(r"<[^>]+>", "", html.unescape(h1.group(1))).strip() if h1 else ""
    fillings: set[str] = set()
    head = re.search(r"<h4[^>]*>(?:\s*<span[^>]*>)?\s*Fillings\s*(?:</span>)?\s*</h4>", page, re.S)
    if head:
        ul = re.search(r"<ul[^>]*>(.*?)</ul>", page[head.end():], re.S)
        if ul:
            for li in re.findall(r"<li[^>]*>(.*?)</li>", ul.group(1), re.S):
                text = re.sub(r"<[^>]+>", " ", html.unescape(li))
                fillings.add(ic.norm_name(text))
    return title, fillings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch pages only; print the matches; download and write nothing")
    ap.add_argument("--exact-only", action="store_true", help="only rule 1 (exact name); no filling variants")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    matches: dict[str, dict] = {}   # item id -> {kind, photo, page, tile}
    try:
        # ---- the category pages: one record per product (photo + name + product link)
        products: dict[str, dict] = {}          # product path -> {name, photos {url: first category page}, href}
        for cat in CATEGORIES:
            page_url = f"{SITE}/category/{cat}/"
            page = ic.polite_get(page_url, args.cache, delay=CRAWL_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
            found = tiles_of(page)
            print(f"{len(found):3d} product tiles with a photo on {page_url}")
            for t in found:
                p = products.setdefault(t["product"], {"name": t["name"], "photos": {}, "href": t["href"]})
                if ic.norm_name(p["name"]) != ic.norm_name(t["name"]):
                    p.setdefault("conflict", []).append(f"named {t['name']!r} on {page_url}")
                p["photos"].setdefault(t["photo"], page_url)
        by_name: dict[str, list[str]] = {}      # norm product name -> product paths
        for path, p in products.items():
            by_name.setdefault(ic.norm_name(p["name"]), []).append(path)
        print(f"{len(products)} products with a photo on the category pages")

        def usable(path: str) -> dict | None:
            p = products[path]
            if len(p["photos"]) != 1 or p.get("conflict"):
                skipped.append(f"{p['name']!r} ({path}): {len(p['photos'])} different photos / names across categories; no photo")
                return None
            photo, page_url = next(iter(p["photos"].items()))
            if photo.rsplit("/", 1)[-1] in SKIP_FILES:
                skipped.append(f"{p['name']!r}: {photo.rsplit('/', 1)[-1]} skipped: {SKIP_FILES[photo.rsplit('/', 1)[-1]]}")
                return None
            return {"photo": photo, "page": page_url, "tile": p["name"]}

        # ---- rule 1: exact names
        for key, its in sorted(by_key.items()):
            paths = by_name.get(key, [])
            if not paths:
                continue
            if len(its) != 1:
                skipped.append(f"{key}: {len(its)} published items share this name; no photo")
                continue
            if len(paths) != 1:
                skipped.append(f"{its[0]['id']}: {len(paths)} different products are named {its[0]['name']!r}; no photo")
                continue
            u = usable(paths[0])
            if u:
                matches[its[0]["id"]] = dict(u, kind="exact", product=paths[0])

        # ---- rule 2: "<product> - <filling>" where the product's own page lists the filling
        if not args.exact_only:
            page_cache: dict[str, tuple[str, set[str]]] = {}
            for it in items:
                if it["id"] in matches or " - " not in it["name"]:
                    continue
                base, filling = it["name"].rsplit(" - ", 1)
                paths = by_name.get(ic.norm_name(base), [])
                if len(paths) != 1:
                    continue
                if len(by_key.get(ic.norm_name(it["name"]), [])) != 1:
                    skipped.append(f"{it['id']}: another published item has the same name; no photo")
                    continue
                path = paths[0]
                if path not in page_cache:
                    purl = products[path]["href"]
                    page_cache[path] = product_page_info(
                        ic.polite_get(purl, args.cache, delay=CRAWL_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace"))
                title, listed = page_cache[path]
                if ic.norm_name(title) != ic.norm_name(products[path]["name"]):
                    skipped.append(f"{it['id']}: product page is headed {title!r}, not {products[path]['name']!r}; no photo")
                    continue
                want = ic.norm_name(filling)
                page_words = [w for w, table_words in FILLINGS.items() if want in table_words]
                if not any(w in listed for w in page_words):
                    skipped.append(f"{it['id']}: the {title!r} page does not list the filling {filling!r}; no photo")
                    continue
                u = usable(path)
                if u:
                    matches[it["id"]] = dict(u, kind=f"variant ({filling} is listed on the {title} page)", product=path)
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows: dict[str, tuple[str, str]] = {}
    by_id = {it["id"]: it for it in items}
    for item_id in [it["id"] for it in items if it["id"] in matches]:
        m = matches[item_id]
        if args.dry_run:
            print(f"  {item_id:50} {by_id[item_id]['name']!r} <- tile {m['tile']!r} [{m['kind']}]\n"
                  f"  {'':50} photo {m['photo']}\n  {'':50} page  {m['page']}")
            continue
        try:
            raw = ic.polite_get(m["photo"], args.cache, delay=CRAWL_DELAY, referer=m["page"])
            rows[item_id] = (ic.store_image(CHAIN, raw), m["page"])
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            skipped.append(f"{item_id}: {m['photo']}: {e}")

    for it in items:
        if it["id"] not in matches:
            print(f"  no photo: {it['id']} ({it['name']})")
    for s in skipped:
        print("skip:", s)
    if args.dry_run:
        n_exact = sum(1 for m in matches.values() if m["kind"] == "exact")
        print(f"{len(matches)} of {len(items)} published items matched ({n_exact} by exact name, {len(matches) - n_exact} filling variants)")
        files = {}
        for item_id, m in matches.items():
            files.setdefault(m["photo"], []).append(item_id)
        print(f"{len(files)} distinct photos would be downloaded")
        return 0
    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"LOOK: {f} is used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
