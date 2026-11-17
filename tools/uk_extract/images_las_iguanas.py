#!/usr/bin/env python3
"""Item photos for Las Iguanas (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_las_iguanas.py --cache DIR [--dry-run]

Source: Las Iguanas' own website pages (www.iguanas.co.uk, a Big Table Group site built like www.bellaitalia.co.uk). Each page carries
its content as Nuxt page data (<script id="__NUXT_DATA__">) with Contentful "tiles"; the photos are on images.ctfassets.net, the asset
host those pages use. The pages read are every content page in https://www.iguanas.co.uk/sitemap.xml, less the per-restaurant pages
(their menu is the Ten Kites embed), careers, legal and sign-up pages, and the per-town copies ("kids-eat-free-<town>",
"bottomless-brunch-<town>", "students-<town>": SITEMAP_SKIP). One request each, cached.

Read on 2026-11-17 (47 pages). The only tiles that name one published dish next to its photo are:
  - /alcohol-free-bottomless-brunch: a grid of drink tiles, each `<img alt="Name"> <h4>Name</h4> description`: "Coconut Cooler" and
    "Popstar Martini" are published items (Drinks: Mocktails); the other seven drinks (Hugo Tripz, Mindful Mule, Passionfruit No-jito,
    Tropical Cooler, Margarit-eh, Poco Picante, Pink Strawberry Lemonade) are not on the menu we publish.
  - /bottomless-brunch (and the same tiles on /new-years-eve): the brunch-dish gallery, tiles keyed "LI-BB-dish-<n>" holding one picture
    each, named only by the picture's alt text: "Mac N Cheese" and "Grilled Chicken Salad" are published Bottomless brunch items. The
    others name no single published item ("Classic Burgers", "Quesadillas", "Chilli", "Bahian Katsu Curry" [the item is "Bahian Chicken
    Katsu"], "Crimbo Burger" [a Christmas special, not published]).
  Looked at 2026-11-17 (contact sheet and full size): the two drink photos are plain photographs of the drink named (a frozen pineapple
  drink with a pineapple leaf; a passionfruit "martini" with its side shot), no writing, figures or stickers: kept. The two brunch gallery
  pictures are designed cards with the dish's name in large lettering above the plate: left out (DROP_ITEMS). Result: 2 of 195 items.
  Everything else is a category or offer picture: /delivery "### Fajitas", "### Burritos", "### Enchiladas", "### Quesadillas", "### Churros"
  (the items are "Sizzling Fajitas", "Burrito: Smoky Chipotle Chicken"..., "Four Churros": not exact, and one picture for several variants),
  /student-discount Fajitas.png / Burritos.png (described, not named), the Sunday Sharer, Doritos Loaded, Christmas specials and drinks
  that are not published items. None of those is used.

Where the photos are NOT taken from (checked 2026-11-17):
  - the Ten Kites menu that /our-menu, /lunch-menu, /kids and every /restaurants/<town> page embed (menus.tenkites.com/thebigtg/lasiguanas202507,
    the source of our nutrition data) shows 145 dish pictures, all on images.tenkites.com, whose robots.txt says "User-agent: * / Disallow: /"
    (re-read 2026-11-17). We honour that and do not fetch them, and we do not look for "the same file" elsewhere either (that would be
    working round the rule and matching by file name). The delivery menu (menus.tenkites.com/thebigtg/lasiguanasdelivery) has no pictures.
  - delivery: /delivery sends people to Deliveroo, Just Eat and Uber Eats, all third parties: never used.
  - Order & Pay is reached only by the QR code on a restaurant table (/order-pay-faqs): no public address, not guessed.
  - the My Iguanas app (Trifft, perks.iguanas.co.uk) and shop.iguanas.co.uk (gift cards): no public menu feed; not used.
  - Contentful asset titles and file names (e.g. "MAC_N_CHEESE.png") are never used to match: only what the page says.

Match rule (exact, nothing fuzzy): a photo is attached to an item only when one tile names exactly one dish and that name equals the
published item name (images_common.norm_name). A tile's names are:
  (a) a tile whose text holds exactly one inline picture (`<img src="https://images.ctfassets.net/..." alt="...">`): the picture's alt
      text and the tile's headings (<h1>-<h6>, markdown "#"). Alt text and heading must agree when both are there.
  (b) a tile with a background photo and its own text, or a two-tile section (one photo-only tile + one text tile): the text's bold names
      (__X__, **X**, <b>X</b>) and its first heading when that heading is a published item name (as images_bella_italia.py).
A tile naming two or more different things is skipped, so a shared picture is never pinned on one of several dishes. A name shared by
two published items, or an item that two tiles give different photos, gets no photo. Only pictures on images.ctfassets.net are used.
The alt-only gallery (/bottomless-brunch) is accepted because the alt text is the name the page itself gives that picture; since this
site's alt texts are sometimes stale elsewhere (on /bottomless-brunch the "Christmas Collins" drink picture carries the alt "Jingle Juice"),
every photo kept was looked at to confirm it shows the dish named (DROP_ITEMS lists those left out after looking).

robots.txt (read 2026-11-17): www.iguanas.co.uk "User-agent: * / Allow: /" (Sitemap: /sitemap.xml); images.ctfassets.net answers 404 (no
rules, RFC 9309); images.tenkites.com "Disallow: /" (not used). polite_get checks every URL.

Terms (read 2026-11-17): no clause about copying or reusing website content or images was found. https://www.iguanas.co.uk/terms-and-conditions
covers bookings, offers, competitions, vouchers, the My Iguanas App / Latin Perks and the gift-card shop; its only intellectual-property
sentences are the app-store clause ("In the event that a third-party claims that the My Iguanas App infringes its intellectual property
rights, we (and not the Appstore Provider) shall be solely responsible ...") and the competition clause about photographs entrants submit.
/policies, /our-policy and /privacy-policy have none either. Photos are installed on the founder's decision of 2026-10-06 in any case.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "las-iguanas"
SITE = "https://www.iguanas.co.uk"
PHOTO_HOST = "https://images.ctfassets.net/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# Always read; the rest of the content pages come from the sitemap (site_pages()).
PAGES = ["/our-menu", "/delivery", "/bottomless-brunch", "/alcohol-free-bottomless-brunch", "/bottomless-tapas", "/lunch-menu",
         "/kids", "/offers"]
# Sitemap pages not read: per-restaurant pages (their menu is the Ten Kites embed), jobs, legal and sign-up pages, and the per-town
# copies of the kids, brunch and student pages (the same group pictures as the main page).
SITEMAP_SKIP = ("restaurants/", "careers", "kids-eat-free-", "bottomless-brunch-", "students-", "cookie-policy", "privacy-policy",
                "terms-and-conditions", "offer-terms", "competition-terms", "modernslavery", "ethicaltrading", "policies", "our-policy",
                "sign-up", "contact")
LABELS = {"featured dish"}   # bold words that label a tile and are not a dish name
# Looked at on contact sheets / full size and left without a photo; a rerun must not bring them back. {item id: why}
# 2026-11-17: the /bottomless-brunch gallery pictures are designed cards, the dish on a plate under the dish's name in large red lettering
# ("GRILLED CHICKEN SALAD", "MAC & CHEESE"): a promotional graphic with lettering, not a plain photograph (as happy-sushi-box and Subway's
# "SAVER SUBS" pictures were left out).
DROP_ITEMS: dict[str, str] = {
    "grilled-chicken-salad": "the brunch gallery picture is a designed card with 'GRILLED CHICKEN SALAD' in large lettering, not a plain photograph",
    "mac-n-cheese": "the brunch gallery picture is a designed card with 'MAC & CHEESE' in large lettering, not a plain photograph",
}


# ---------------------------------------------------------------- Nuxt page data (same decoder as images_bella_italia.py)

def nuxt_data(html: str):
    """Decode the devalue-encoded __NUXT_DATA__ array into plain Python objects."""
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    arr = json.loads(m.group(1))
    wrappers = {"ShallowReactive", "Reactive", "Ref", "ShallowRef"}

    def r(i, depth=0):
        if depth > 80:
            return None
        v = arr[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in wrappers:
                return r(v[1], depth + 1) if len(v) > 1 else None
            if v and isinstance(v[0], str) and v[0] in {"EmptyRef", "EmptyShallowRef", "Set", "Map", "Date", "RegExp",
                                                         "BigInt", "NuxtError"}:
                return None
            return [r(x, depth + 1) if isinstance(x, int) else x for x in v]
        if isinstance(v, dict):
            return {k: (r(x, depth + 1) if isinstance(x, int) else x) for k, x in v.items()}
        return v
    return r(0)


def tile_image(t: dict) -> str | None:
    """The background photo URL a tile shows (desktop, else mobile), https, without resize parameters."""
    for k in ("backgroundImageDesktop", "backgroundImageMobile", "image"):
        v = t.get(k)
        if isinstance(v, dict) and isinstance(v.get("file"), dict) and v["file"].get("url"):
            if not v["file"].get("contentType", "").startswith("image/"):
                continue
            url = v["file"]["url"]
            return ("https:" + url) if url.startswith("//") else url
    return None


def tile_text(t: dict) -> str:
    c = t.get("content")
    return c if isinstance(c, str) else ""


def strip_tags(s: str) -> str:
    return htmllib.unescape(re.sub(r"<[^>]+>", " ", s)).strip()


def headings(text: str) -> list[str]:
    out = [strip_tags(h) for h in re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", text, re.S | re.I)]
    out += [strip_tags(h) for h in re.findall(r"^\s*#{1,6}\s+(.+?)\s*$", text, re.M)]
    return [h for h in out if h]


def first_heading(text: str) -> str:
    """First markdown/HTML heading line of a tile's text ('### Fajitas' -> 'Fajitas'), '' if the text starts otherwise."""
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^#{1,4}\s+(.+)$", line)
        if m:
            return m.group(1).strip()
        m = re.match(r"^<h[1-4][^>]*>(.*?)</h[1-4]>", line, re.I)
        if m:
            return strip_tags(m.group(1))
        if line:
            return ""
    return ""


def bold_names(text: str) -> list[str]:
    names = re.findall(r"__([^_]+?)__", text) + re.findall(r"<b>(.*?)</b>", text, re.I) + re.findall(r"\*\*([^*]+?)\*\*", text)
    return [strip_tags(n) for n in names if strip_tags(n)]


def site_pages(cache: Path) -> list[str]:
    """PAGES plus every content page the sitemap lists (SITEMAP_SKIP left out), in a stable order."""
    xml = ic.polite_get(SITE + "/sitemap.xml", cache, accept="application/xml").decode("utf-8", "replace")
    out = list(PAGES)
    for loc in re.findall(r"<loc>\s*(.*?)\s*</loc>", xml):
        if not loc.startswith(SITE):
            continue
        path = loc[len(SITE):].rstrip("/") or "/"
        if path.lstrip("/").startswith(SITEMAP_SKIP) or path in out:
            continue
        out.append(path)
    return out


def entries(page_obj, by_name: set[str]) -> list[tuple[list[str], str, str]]:
    """(names, photo url, kind) for every tile that shows a photo with words naming it (see the module docstring)."""
    out: list[tuple[list[str], str, str]] = []

    def text_names(text: str) -> list[str]:
        names = [n for n in bold_names(text) if ic.norm_name(n) not in LABELS]
        head = first_heading(text)
        if head and ic.norm_name(head) in by_name:
            names.append(head)
        return names

    def walk(o):
        if isinstance(o, dict):
            text = tile_text(o)
            imgs = re.findall(r"<img\b[^>]*>", text, re.I)
            if imgs:                                                    # (a) an inline picture inside the tile's text
                if len(imgs) == 1:
                    src = re.search(r'\ssrc="([^"]+)"', imgs[0])
                    alt = re.search(r'\salt="([^"]*)"', imgs[0])
                    names = headings(text) + ([strip_tags(alt.group(1))] if alt and strip_tags(alt.group(1)) else [])
                    if src and names:
                        out.append((names, htmllib.unescape(src.group(1)), "inline"))
            elif tile_image(o) and text.strip():                        # (b) a background photo with its own text
                out.append((text_names(text), tile_image(o), "tile"))
            tiles = o.get("tiles")
            if isinstance(tiles, list) and len(tiles) == 2 and all(isinstance(x, dict) for x in tiles):
                a, b = tiles                                            # (b) photo-only tile + text tile
                for img_t, txt_t in ((a, b), (b, a)):
                    if (tile_image(img_t) and not tile_text(img_t).strip() and tile_text(txt_t).strip()
                            and not tile_image(txt_t) and not txt_t.get("tiles") and "<img" not in tile_text(txt_t)):
                        out.append((text_names(tile_text(txt_t)), tile_image(img_t), "section"))
            for k in ("sections", "tiles"):
                if isinstance(o.get(k), list):
                    for x in o[k]:
                        walk(x)
    walk(page_obj)
    return out


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; download no photo, write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it["id"])

    found: dict[str, set[tuple[str, str]]] = {}   # item id -> {(photo url, page url)}
    skipped: list[str] = []
    try:
        for path in site_pages(args.cache):
            page_url = SITE + (path if path != "/" else "/")
            html = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            data = nuxt_data(html)
            if not data:
                skipped.append(f"{path}: no page data")
                continue
            pages = [v for v in (data.get("data") or {}).values() if isinstance(v, dict) and "sections" in v]
            for pg in pages:
                for names, photo, kind in entries(pg, set(by_name)):
                    distinct = {ic.norm_name(n) for n in names if ic.norm_name(n)}
                    if len(distinct) != 1:
                        if distinct & set(by_name):
                            skipped.append(f"{path}: {kind} tile names {len(distinct)} things ({', '.join(sorted(distinct))})")
                        continue
                    key = distinct.pop()
                    ids = by_name.get(key)
                    if not ids:
                        continue
                    if len(ids) > 1:
                        skipped.append(f"{path}: '{key}' is the name of {len(ids)} items")
                        continue
                    if not photo.startswith(PHOTO_HOST):
                        skipped.append(f"{path}: {ids[0]}: picture {photo} is not on the site's asset host")
                        continue
                    if ids[0] in DROP_ITEMS:
                        skipped.append(f"{ids[0]}: dropped after looking: {DROP_ITEMS[ids[0]]}")
                        continue
                    found.setdefault(ids[0], set()).add((photo.split("?")[0], page_url))
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows: dict[str, tuple[str, str]] = {}
    for item_id, pairs in sorted(found.items()):
        photos = {p for p, _ in pairs}
        if len(photos) > 1:
            skipped.append(f"{item_id}: {len(photos)} different photos on the site; ambiguous, no photo")
            continue
        photo = photos.pop()
        page_url = sorted(pg for _, pg in pairs)[0]
        if args.dry_run:
            print(f"  {item_id:30} {photo.rsplit('/', 1)[-1]}  <- {page_url}")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=page_url)
            rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            print(f"  {item_id:30} {rows[item_id][0]}  <- {photo.rsplit('/', 1)[-1]}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")

    for s in sorted(set(skipped)):
        print("  no photo:", s)
    if args.dry_run:
        print(f"{len(found)} of {len(items)} published items matched")
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
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
