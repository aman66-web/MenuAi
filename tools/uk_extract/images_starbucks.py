#!/usr/bin/env python3
"""Item photos for Starbucks UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_starbucks.py --cache DIR [--dry-run]

Source: https://www.starbucks.co.uk/menu (the chain's own order menu; the nutrition data came from
https://www.starbucks.co.uk/quick-links/nutrition-info). The menu page carries, as Next.js page data, one tile per product
(name, product id, photo). Each product has its own page, https://www.starbucks.co.uk/menu/product/<id>, whose page data is
ONE product record holding the product's title, its photo (`imageUrl`, also the page's og:image) and its sizes (`sizes`:
Short / Tall / Grande / Venti ...). Photos are the originals on www.digitalassets.starbucks.eu (the chain's own media host
those pages use; typically 1500x1500), so store_image only downsizes them to <= 640 px and converts to WebP.

Match rule (exact, nothing fuzzy; images_common.norm_name equality against the CURRENT data/source/starbucks/items.csv):
  * A photo is attached to a published item only when the menu tile AND the product page's own record name the same
    product (same product id, same title, same photo URL, and the page's og:image agrees), and
      (a) the item's whole name equals that product title (food, snacks, single-size drinks), or
      (b) the item's name is "<title> (<size>)" where <size> is one of the sizes that SAME product record lists
          (the photo and the size/variant come from one record).
  * Everything else gets no photo: items whose name the chain's page words differently (our "Americano" vs its "Caffe
    Americano", "Caramel Frappuccino" vs "Caramel Frappuccino Blended Beverage", "Chai Tea" vs "Teavana Chai ..."), variants the
    page does not list ("(Freshly Baked)"), and any name that two different products share. No match by slug, file name,
    colour, category or similarity.
  * Products on the menu page that are not published items (coffee beans, merchandise, bottled drinks...) are ignored.

Terms and robots (read 2026-10-07):
  * https://www.starbucks.co.uk/terms-of-use: "Starbucks grants the User a personal, non-exclusive, non-transferable, limited,
    and revocable license to use the Sites for personal use only ... Any use of the Sites in any other manner, including,
    without limitation, resale, transfer, modification or distribution of the Sites or text, pictures, music, barcodes, video,
    data, hyperlinks, displays, and other content associated with the Sites ("Content") is prohibited." and "you may not use,
    frame or utilize framing techniques to enclose any Starbucks trademark, logo or other proprietary information, including
    the images found at the Sites, the content of any text or the layout/design of any page ... without our express written
    consent." and "All rights not expressly granted are reserved." Installed on the founder's decision of 2026-10-06 (the
    founder's accepted risk; docs/IMAGE_TERMS.md).
  * robots.txt of www.starbucks.co.uk: "User-agent: * / Allow: / / Disallow: /api/ / Disallow: /refer-a-friend* /
    Disallow: /*.pdf"; this script fetches only /menu and /menu/product/<id>. robots.txt of www.digitalassets.starbucks.eu
    disallows only /core/, /profiles/, /admin/ ... and similar CMS paths; the photos live under /sites/starbucks-medialibrary/files/.
    polite_get checks robots.txt for every URL, at 1 request/second per host.

A 401/403/429 or a robots refusal stops the script (exit 1) and removes any photo files this run had already written.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "starbucks"
SITE = "https://www.starbucks.co.uk"
MENU_URL = f"{SITE}/menu"
PRODUCT_URL = SITE + "/menu/product/{id}"
MEDIA_HOST = "www.digitalassets.starbucks.eu"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# Photo file name (last URL segment) -> why it is not used (prints nutrition numbers/claims, placeholder ...). Fill in after
# looking at the stored photos.
SKIP_FILES: dict[str, str] = {}


# ---------------------------------------------------------------- page data

def rsc_text(page: str) -> str:
    """The Next.js flight data of a page (self.__next_f.push([1,"..."]) chunks) as one string."""
    out = []
    for c in re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', page, re.S):
        try:
            out.append(json.loads('"' + c + '"'))
        except ValueError:
            continue
    return "".join(out)


def clean_name(s: str) -> str:
    """Product title as shown: the page marks (R)/TM with <sup> and uses no-break spaces."""
    s = re.sub(r"</?(?:sup|sub|b|i|em|strong)>", "", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return " ".join(html.unescape(s).replace("\xa0", " ").split())


def menu_tiles(page: str) -> dict[str, dict]:
    """Every product tile in the menu page's data: {product id: {name, image}}."""
    text = rsc_text(page)
    dec = json.JSONDecoder()
    tiles: dict[str, dict] = {}
    for m in re.finditer(r'\{"type":"product","outOfStock":(?:true|false),"name":', text):
        try:
            obj, _ = dec.raw_decode(text, m.start())
        except ValueError:
            continue
        img = obj.get("image") or {}
        if obj.get("id") and obj.get("name") and isinstance(img, dict):
            tiles.setdefault(str(obj["id"]), {"name": clean_name(obj["name"]), "image": img.get("normal") or img.get("small")})
    return tiles


def product_record(page: str) -> dict | None:
    """The product record of a /menu/product/<id> page (id, title, imageUrl, sizes ...)."""
    text = rsc_text(page)
    m = re.search(r'\{"product":\{"type":"product","id":"', text)
    if not m:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(text, m.start())
    except ValueError:
        return None
    rec = obj.get("product")
    return rec if isinstance(rec, dict) else None


def og_image(page: str) -> str | None:
    m = re.search(r'<meta property="og:image" content="([^"]+)"', page)
    return html.unescape(m.group(1)) if m else None


# ---------------------------------------------------------------- matching

SIZED = re.compile(r"^(?P<base>.+?)\s*\((?P<size>[^()]+)\)$")


def candidate_titles(name: str) -> set[str]:
    """Normalised product titles a published item name could belong to: the whole name, or the name before a trailing
    '(variant)'."""
    keys = {ic.norm_name(name)}
    m = SIZED.match(name)
    if m:
        keys.add(ic.norm_name(m.group("base")))
    return keys


def match_item(item: dict, title_key: str, sizes: set[str]) -> bool:
    """Does this item name this product (whole name, or '<title> (<size>)' with a size the product record lists)?"""
    name = item["name"]
    if ic.norm_name(name) == title_key:
        return True
    m = SIZED.match(name)
    return bool(m and ic.norm_name(m.group("base")) == title_key and ic.norm_name(m.group("size")) in sizes)


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the pages and print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    out_dir = ic.IMAGES_ROOT / CHAIN
    before = {p.name for p in out_dir.iterdir()} if out_dir.is_dir() else set()
    skipped: list[str] = []
    # item id -> (photo url, product page url)
    matches: dict[str, tuple[str, str]] = {}

    try:
        menu = ic.polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        tiles = menu_tiles(menu)
        if not tiles:
            print(f"no product tiles found on {MENU_URL}: the page layout changed", file=sys.stderr)
            return 1
        print(f"{len(tiles)} product tiles on {MENU_URL}")

        by_title: dict[str, list[str]] = {}
        for pid, t in tiles.items():
            by_title.setdefault(ic.norm_name(t["name"]), []).append(pid)

        wanted: set[str] = set()
        for it in items:
            wanted |= candidate_titles(it["name"])
        # products whose title could name a published item: one product page each (the page holds the sizes)
        records: dict[str, dict] = {}
        for key in sorted(by_title):
            if key not in wanted:
                continue
            pids = by_title[key]
            if len(pids) != 1:
                skipped.append(f"title {key!r} belongs to {len(pids)} different products ({', '.join(pids)}): ambiguous")
                continue
            pid = pids[0]
            page_url = PRODUCT_URL.format(id=pid)
            try:
                page = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            except (urllib.error.URLError, OSError) as e:   # 401/403/429 are raised as Blocked, not caught here
                skipped.append(f"{page_url}: {e}")
                continue
            rec = product_record(page)
            if rec is None:
                skipped.append(f"{page_url}: no product record in the page data")
                continue
            tile = tiles[pid]
            photo = rec.get("imageUrl") or ""
            problems = []
            if str(rec.get("id")) != pid:
                problems.append(f"page record id {rec.get('id')}")
            if ic.norm_name(clean_name(str(rec.get("title", "")))) != key:
                problems.append(f"page title {rec.get('title')!r} differs from tile {tile['name']!r}")
            if photo != tile["image"]:
                problems.append("page photo differs from the menu tile's photo")
            if og_image(page) != photo:
                problems.append("og:image differs from the product photo")
            host = urllib.parse.urlsplit(photo)
            if host.scheme != "https" or host.netloc != MEDIA_HOST:
                problems.append(f"photo is not on {MEDIA_HOST}: {photo!r}")
            if problems:
                skipped.append(f"{page_url} ({tile['name']}): " + "; ".join(problems))
                continue
            records[pid] = rec

        # per item: which product record names it?
        for it in items:
            found: list[str] = []
            for pid, rec in records.items():
                sizes = {ic.norm_name(s.get("label", "")) for s in rec.get("sizes") or [] if isinstance(s, dict)}
                if match_item(it, ic.norm_name(clean_name(rec["title"])), sizes):
                    found.append(pid)
            if len(found) != 1:
                if len(found) > 1:
                    skipped.append(f"{it['id']}: named by {len(found)} products: ambiguous")
                continue
            rec = records[found[0]]
            fname = rec["imageUrl"].rsplit("/", 1)[-1]
            if fname in SKIP_FILES:
                skipped.append(f"{it['id']}: {fname} skipped: {SKIP_FILES[fname]}")
                continue
            matches[it["id"]] = (rec["imageUrl"], PRODUCT_URL.format(id=found[0]))

        # ---- report (dry run) or download
        rows: dict[str, tuple[str, str]] = {}
        names = {it["id"]: it["name"] for it in items}
        if args.dry_run:
            for item_id in sorted(matches):
                photo, page_url = matches[item_id]
                print(f"{item_id} | {names[item_id]} | {photo} | {page_url}")
        else:
            for item_id in sorted(matches):
                photo, page_url = matches[item_id]
                try:
                    raw = ic.polite_get(photo, args.cache, referer=page_url)
                    rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
                except (urllib.error.URLError, OSError, ValueError) as e:   # Blocked is raised and handled below
                    skipped.append(f"{item_id}: {photo}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        if out_dir.is_dir():   # remove photo files this run had already stored; the CSV was not touched
            for p in out_dir.iterdir():
                if p.name not in before:
                    p.unlink()
            if not any(out_dir.iterdir()):
                out_dir.rmdir()
        return 1

    unmatched = [it for it in items if it["id"] not in matches]
    if unmatched:
        groups: dict[str, int] = {}
        for it in unmatched:
            m = SIZED.match(it["name"])
            base = m.group("base") if m else it["name"]
            groups[base] = groups.get(base, 0) + 1
        print(f"no photo for {len(unmatched)} items (the chain's page words the name differently, names the product "
              f"ambiguously, or does not list the variant); by product: "
              + "; ".join(f"{b} x{n}" for b, n in groups.items()))
    for s in skipped:
        print("skip:", s)
    if args.dry_run:
        print(f"{len(matches)} of {len(items)} published items matched ({len({u for u, _ in matches.values()})} distinct photos)")
        return 0

    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        if out_dir.is_dir():
            for p in out_dir.iterdir():
                p.unlink()
            out_dir.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    # sizes of one drink share a photo (up to 4 items): only flag a photo used by more than that
    for f, ids in ic.suspected_placeholders(rows, threshold=5).items():
        print(f"CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
