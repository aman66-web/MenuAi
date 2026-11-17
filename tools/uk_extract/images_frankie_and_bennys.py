#!/usr/bin/env python3
"""Item photos for Frankie & Benny's from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_frankie_and_bennys.py --cache DIR [--dry-run]

Source: the pages of www.frankieandbennys.com listed in its own sitemap (https://www.frankieandbennys.com/sitemap.xml: offers, menus,
seasonal and location pages; one request each, cached). Each page carries its content as Nuxt page data (<script id="__NUXT_DATA__">)
with Contentful "tiles"; the photos are files in the chain's own Contentful space on images.ctfassets.net/hhagtzhy2px1, the asset host
those pages use (nothing else is accepted). The site renders every tile picture with the asset's own title as the <img> alt/title (or
<source> title) attribute, and dish cards as content HTML with an <img alt="..."> and a heading: that is how the page names a photo.

Where the photos are NOT taken from: the dish photos of the Ten Kites menu that /our-menu and the location menu pages embed
(menus.tenkites.com/thebigtg/frankiebennys02, the menu tools/uk_extract/frankie_and_bennys.py reads the nutrition from) live on
images.tenkites.com, whose robots.txt (read 2026-11-17) says "User-agent: * / Allow: /tenkitestest/menus.html / Disallow: /". We honour
that and do not fetch them, and we do not look for "the same file" elsewhere either (that would be working round the rule). Delivery goes
through Deliveroo, Just Eat and Uber Eats (third parties: never used). So only the few dishes the chain's own pages picture by name can
have a photo.

Match rule (exact, nothing fuzzy). Every tile on every page is looked at on its own:
  (a) a tile picture (backgroundImageDesktop / backgroundImageMobile / image) whose asset title, the text the page shows as the picture's
      alt/title, has the same images_common.norm_name as exactly one published item; when the desktop and the phone picture of one tile
      both carry that name, the desktop picture is used (the phone one is the same shot cut for a small screen);
  (b) an <img> in a tile's content HTML (a dish card) whose alt names exactly one published item, or, when the card holds exactly one
      <img>, whose heading does; if the alt and the heading name two different published items the card is skipped.
A tile that names two different published items (desktop vs phone picture, alt vs heading) gives no photo. An item that two tiles
picture with two different photos (different Contentful assets) gets none: ambiguous. Near names are never matched: "Double Stack Burger"
is not "Double Stack", "Meat Medley Pizza" is not "Meat Medley", "Mac Daddy" is not "Mac Daddy Burger", "Central Park Burger" is not
"Central Park", "Frankie's Classic Meatballs" is not "Classic Meatballs", "THE CALIZZA" is not "Calizza" (that tile's pictures are titled
"Calizza", which is). Gluten-free, vegan and other variants the page doesn't name get no photo.
Photos looked at on contact sheets and left out are listed in DROP_ITEMS / SKIP_ASSETS so a rerun can't bring them back.

robots.txt (https://www.frankieandbennys.com/robots.txt, read 2026-11-17): "User-Agent: * / Disallow:" (everything allowed) plus the
sitemap line; no group names an AI crawler. images.ctfassets.net is checked by polite_get like every host (RFC 9309). A 401/403/429, a
robots refusal or an unreadable robots.txt stops the script (exit 2) before anything is written.

Terms (read 2026-11-17): https://www.frankieandbennys.com/terms-and-conditions (the only terms the site links, footer "Terms &
Conditions") covers offers, gift cards, tips and trade-union enquiries; no clause about copying or reusing the website's content or images
was found. The footer reads "© 2026 Frankie & Benny's Part of The Big Table Group Limited." Installed on the founder's decision of
2026-10-06 (photos from the chain's own pages; his accepted risk; taken down the day the chain asks).

Run of 2026-11-17: the sitemap's 149 pages (less SKIP_PATHS) were read, the 40 location pages and 40 location menu pages included; 6
published items matched: Calizza (/delivery, desktop picture "Calizza"), Classic Beef Burger (/cheeseburger-day, picture "Classic Beef
Burger"; the photo shows a beef patty with mayo and lettuce and no cheese, as the menu describes the dish), and Meat Medley, Crispy BBQ
Chicken, BBQ Chicken Pizza and The Blanco Pizza (/five-pound-faves dish cards). All 6 were looked at full size and on a contact sheet:
plain photographs of the dish named, no lettering, prices, figures, stickers or logos; all kept (DROP_ITEMS and SKIP_ASSETS are empty).
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

CHAIN = "frankie-and-bennys"
SITE = "https://www.frankieandbennys.com"
SITEMAP = SITE + "/sitemap.xml"
ASSET_PREFIX = "https://images.ctfassets.net/hhagtzhy2px1/"   # the chain's own Contentful space (the asset host its pages use)
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# Sitemap pages not read: policies, forms and job pages carry no food pictures.
SKIP_PATHS = {"/careers", "/careers/benefits", "/cookie-policy", "/privacy-policy", "/contact", "/sign-up", "/sign-up-wifi",
              "/thanksforsigningup", "/faqs"}
# Looked at on contact sheets and left without a photo (item id -> why); a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {}
# Contentful asset ids never used (asset id -> why), e.g. a picture with promotional lettering.
SKIP_ASSETS: dict[str, str] = {}


# ---------------------------------------------------------------- Nuxt page data

def nuxt_data(page: str):
    """Decode the devalue-encoded __NUXT_DATA__ array into plain Python objects."""
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
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


def asset_url(url: str) -> str | None:
    """https URL of a Contentful file in the chain's own space, without resize parameters; None for anything else."""
    url = htmllib.unescape(url).split("?", 1)[0]
    if url.startswith("//"):
        url = "https:" + url
    return url if url.startswith(ASSET_PREFIX) else None


def asset_id(url: str) -> str:
    return url[len(ASSET_PREFIX):].split("/", 1)[0]


def tile_picture(t: dict, key: str) -> tuple[str, str] | None:
    """(url, title) of a tile's picture field, images only."""
    v = t.get(key)
    if not (isinstance(v, dict) and isinstance(v.get("file"), dict) and v["file"].get("url")):
        return None
    if not str(v["file"].get("contentType", "")).startswith("image/"):
        return None
    url = asset_url(v["file"]["url"])
    return (url, str(v.get("title") or "")) if url else None


def strip_tags(s: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def content_heading(content: str) -> str:
    """First HTML or markdown heading of a tile's content ('<h2><span>Meat Medley</span></h2>' -> 'Meat Medley')."""
    m = re.search(r"<h[1-4][^>]*>(.*?)</h[1-4]>", content, re.S | re.I)
    if m:
        return strip_tags(m.group(1))
    m = re.search(r"^\s*#{1,4}\s+(.+)$", content, re.M)
    return strip_tags(m.group(1)) if m else ""


def content_images(content: str) -> list[tuple[str, str]]:
    """(url, alt) of every <img> in a tile's content HTML that is a file in the chain's own Contentful space."""
    out = []
    for tag in re.findall(r"<img\b[^>]*>", content, re.I):
        src = re.search(r'\ssrc\s*=\s*"([^"]+)"', tag)
        alt = re.search(r'\salt\s*=\s*"([^"]*)"', tag)
        url = asset_url(src.group(1)) if src else None
        if url:
            out.append((url, htmllib.unescape(alt.group(1)) if alt else ""))
    return out


def walk_tiles(o):
    """Every dict in the page data that has a picture field or content text (a Contentful tile)."""
    if isinstance(o, dict):
        if any(k in o for k in ("backgroundImageDesktop", "backgroundImageMobile", "content")):
            yield o
        for v in o.values():
            yield from walk_tiles(v)
    elif isinstance(o, list):
        for x in o:
            yield from walk_tiles(x)


def tile_matches(t: dict, by_name: dict[str, list[str]]) -> tuple[list[tuple[str, str, str]], list[str]]:
    """[(item key, photo url, how)] for one tile, and notes on what was skipped."""
    out: list[tuple[str, str, str]] = []
    notes: list[str] = []
    # (a) the tile's own pictures, named by their asset title
    pics = {}
    for key in ("backgroundImageDesktop", "backgroundImageMobile", "image"):
        p = tile_picture(t, key)
        if p:
            pics[key] = p
    named = {k: ic.norm_name(title) for k, (_, title) in pics.items() if ic.norm_name(title) in by_name}
    if len(set(named.values())) > 1:
        notes.append(f"tile {t.get('key')!r}: its pictures are titled with two different dishes ({', '.join(sorted(set(named.values())))})")
    elif named:
        name = next(iter(named.values()))
        for key in ("backgroundImageDesktop", "image", "backgroundImageMobile"):   # desktop picture first
            if key in named:
                out.append((name, pics[key][0], f"picture titled {pics[key][1]!r}"))
                break
    # (b) dish cards in the content HTML
    content = t.get("content") if isinstance(t.get("content"), str) else ""
    imgs = content_images(content)
    head = ic.norm_name(content_heading(content)) if content else ""
    for url, alt in imgs:
        names = set()
        if ic.norm_name(alt) in by_name:
            names.add(ic.norm_name(alt))
        if len(imgs) == 1 and head in by_name:
            names.add(head)
        if len(names) > 1:
            notes.append(f"tile {t.get('key')!r}: card names two different dishes ({', '.join(sorted(names))})")
        elif names:
            out.append((names.pop(), url, f"card <img alt={alt!r}> heading {content_heading(content)!r}"))
    return out, notes


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

    found: dict[str, dict[str, tuple[str, str]]] = {}   # item key -> {asset id: (photo url, page url)}
    skipped: list[str] = []
    try:
        sm = ic.polite_get(SITEMAP, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        paths = []
        for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", sm):
            if loc.startswith(SITE):
                path = loc[len(SITE):] or "/"
                if path not in SKIP_PATHS and path not in paths:
                    paths.append(path)
        if not paths:
            raise SystemExit("the sitemap lists no pages: it has changed shape")
        print(f"{len(paths)} pages from {SITEMAP}")
        for path in paths:
            page_url = SITE + path if path != "/" else SITE + "/"
            page = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            data = nuxt_data(page)
            if not data or not isinstance(data.get("data"), dict):
                skipped.append(f"{path}: no page data")
                continue
            for t in walk_tiles(data["data"]):
                matches, notes = tile_matches(t, by_name)
                skipped += [f"{path}: {n}" for n in notes]
                for key, url, how in matches:
                    found.setdefault(key, {}).setdefault(asset_id(url), (url, page_url))
                    print(f"  match {key!r} on {path}: {how} -> {url.rsplit('/', 1)[-1]}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows: dict[str, tuple[str, str]] = {}
    for key, by_asset in sorted(found.items()):
        ids = by_name[key]
        if len(ids) > 1:
            skipped.append(f"'{key}' is the name of {len(ids)} published items ({', '.join(ids)}): no photo")
            continue
        item_id = ids[0]
        if item_id in DROP_ITEMS:
            skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
            continue
        usable = {a: v for a, v in by_asset.items() if a not in SKIP_ASSETS}
        for a in by_asset.keys() - usable.keys():
            skipped.append(f"{item_id}: asset {a} not used: {SKIP_ASSETS[a]}")
        if len(usable) > 1:
            skipped.append(f"{item_id}: {len(usable)} different photos on the site ({', '.join(sorted(usable))}): ambiguous, no photo")
            continue
        if not usable:
            continue
        photo, page_url = next(iter(usable.values()))
        if args.dry_run:
            print(f"{item_id}: {photo}  <- {page_url}")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=page_url)
            rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            print(f"{item_id}: {rows[item_id][0]}  <- {photo.rsplit('/', 1)[-1]} on {page_url}")
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")

    for s in skipped:
        print("skip:", s)
    if args.dry_run:
        print(f"{sum(1 for k, v in found.items() if len(by_name[k]) == 1)} published items matched (before drop and ambiguity rules)")
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
