#!/usr/bin/env python3
"""Item photos for Amalfi (Amalfi Ristorante, The Big Table Group) (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_amalfi.py --cache DIR [--dry-run]

Result of 2026-11-17: NO photo can be installed. The only place Amalfi's own pages tie a photo to a named dish is its Ten Kites menu, and
those photos sit on a host whose robots.txt disallows everything; Amalfi's own website (www.amalfi.co.uk) shows only mood and campaign
pictures, none of which the page ties to exactly one published dish. Details:

1. The menu pages (the source of the items, linked from https://www.amalfi.co.uk/our-menus): https://menus.tenkites.com/thebigtg/amalfi02
   (Oxford Circus; St Paul's amalfi10 and Woburn amalfi07 are the same menu) and its tabs (?mguid=<menu id>: Main Menu, Brunch, Desserts,
   Kids, DRINKS). Each tab embeds a schema.org Menu (<script type="application/ld+json">) whose MenuItem entries carry "name" and, for some
   dishes, "image". On 2026-11-17, 49 named entries (counted across tabs) had a photo, giving 33 of the 168 published items a photo by
   exact name (Burrata, Bruschetta, Carne, Verdure, Amalfi Burger, Rib-Eye Steak, Christmas Pizza, Festive Pasta, Margherita, Pepperoni
   'Nduja, Linguine Bolognese, ...; --dry-run lists them).
   Every one of those photos is a file on images.tenkites.com (/thebigtg/menuitem/... and /thebigtg/imported/Asset_<uuid>.jpg|png), whose
   robots.txt (read 2026-11-17) is "User-agent: *", "Allow: /tenkitestest/menus.html", "Disallow: /". We honour it: polite_get refuses
   the first photo and the script stops for that host (no photo is fetched; we do not look for "the same file" anywhere else). The
   matches are listed by --dry-run so that, if that host ever allows them, a rerun installs them with no change to this script.
2. www.amalfi.co.uk (Nuxt pages, photos on images.ctfassets.net, the Contentful asset host they use): every content page of
   https://www.amalfi.co.uk/sitemap.xml except legal, jobs, contact and sign-up pages (SITEMAP_SKIP). A page section is used only if it holds
   exactly one photo and its text names exactly one dish that is a published item name (images_common.norm_name), the names being the
   section's bold text plus its headings that are published item names (the rule of images_bella_italia.py, the sister chain's script).
   On 2026-11-17 no section qualified:
     - /christmas "Celebration Set Menu": one picture for three bold dishes (Wild Mushroom Fondue, Linguine Al Gamberoni, Salted Caramel
       Chocolate Pot): several dishes, skipped.
     - /afternoon-tea: headings "bruschetta", "finger bites", "scones", "Amaretti panna cotta", "espresso-soaked tiramisu" under one picture
       of the afternoon tea: the parts of a shared set (not published: see amalfi.py), not the Antipasti Bruschetta.
     - /st-katharine-docks "Add A Tiramisù To Your Table" (picture "Sharing Tiramisu at Amalfi"): a whole tiramisu pre-booked for 6 or 12
       guests, a different product from the menu's Tiramisu, and the heading is not the dish name.
     - /bottomless-brunch "Our Brunch Menu": names seven dishes beside one picture; the other pictures ("Negroni Cocktail Oxford Circus",
       "amalfi-marg-pizza-pc", "am-gamberoni-pc", "prawns desk", "Steak Mobile"...) sit beside text that names no single dish.
       Contentful asset titles and file names are never used to match: only what the page's text says.
3. shop.amalfi.co.uk sells gift cards only. No delivery or ordering site of the chain's own was found (third-party delivery is never used).

robots.txt (read 2026-11-17): www.amalfi.co.uk "User-agent: * / Allow: /"; menus.tenkites.com disallows only /fonts/, /views/ and *.less;
images.tenkites.com "Disallow: /" (above); shop.amalfi.co.uk "Disallow:" (nothing). polite_get checks robots.txt on every URL (RFC 9309).

Terms (read 2026-11-17): no clause about copying or reusing website content or images was found. https://www.amalfi.co.uk/terms-and-conditions
covers bookings, deposits, pre-orders and the St Katharine Docks opening offer only; the footer's https://bigtablegroup.com/terms is The
Restaurant Card (gift card) page. Photos would be installed on the founder's decision of 2026-10-06 in any case.

A 401/403/429 or a robots refusal on a page stops the script (exit 1) before anything is written; a refusal on a photo host stops the
fetching for that host only. With no photo matched, images.csv is not written (no empty file is created).
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402
import tenkites_a as ta  # noqa: E402  (menu_tabs: the tab bar the items were read from)

CHAIN_ID = "amalfi"
SITE = "https://www.amalfi.co.uk"
TK_PAGE = "https://menus.tenkites.com/thebigtg/amalfi02"   # Oxford Circus, the page chain.csv cites (the other venues print the same menu)
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
SITEMAP_SKIP = ("careers", "cookie", "privacy-policy", "terms-and-conditions", "offer-terms", "tipping-policy", "sign-up", "contact")
# Looked at and left without a photo (a rerun must not bring them back): item id -> why
DROP_ITEMS: dict[str, str] = {}
# Contentful/Ten Kites file names never used (placeholder, printed figures, stickers...): file name -> why
SKIP_FILES: dict[str, str] = {}


# ---------------------------------------------------------------- Ten Kites schema.org menu

def schema_photos(page: str) -> list[tuple[str, str]]:
    """(name, image url) of every schema.org MenuItem that carries an image, from the page's JSON-LD."""
    out: list[tuple[str, str]] = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("@type") == "MenuItem" and isinstance(o.get("name"), str) and isinstance(o.get("image"), str) and o["image"]:
                out.append((htmllib.unescape(o["name"]), o["image"]))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S):
        try:
            walk(json.loads(m.group(1)))
        except json.JSONDecodeError:
            continue
    return out


def tenkites_entries(cache: Path) -> list[tuple[str, str, str]]:
    """(name, photo url, menu page url) from every tab of TK_PAGE."""
    first = ic.polite_get(TK_PAGE, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    tabs = ta.menu_tabs(first)
    if not tabs:
        raise SystemExit(f"{TK_PAGE}: no tab bar found: the page has changed shape")
    out = [(n, img, TK_PAGE) for n, img in schema_photos(first)]
    for _name, mid, _active in tabs[1:]:
        url = f"{TK_PAGE}?mguid={mid}"
        page = ic.polite_get(url, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        out += [(n, img, url) for n, img in schema_photos(page)]
    return out


# ---------------------------------------------------------------- www.amalfi.co.uk sections

def text_of(s: str) -> str:
    return htmllib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def section_entries(page: str) -> list[tuple[list[str], list[str], list[str]]]:
    """(photo urls, bold texts, headings) per page section of a rendered Nuxt page."""
    body = page.split("window.__NUXT__")[0]
    body = re.sub(r"<style.*?</style>|<script.*?</script>", "", body, flags=re.S)
    out = []
    for m in re.finditer(r'<section\b[^>]*class="page-section"[^>]*>(.*?)</section>', body, re.S):
        sec = m.group(1)
        photos = []
        for pic in re.findall(r"<picture>.*?</picture>", sec, re.S):
            src = re.search(r'<img[^>]*?\s(?:data-src|src)="([^"]+)"', pic)
            if src:
                u = htmllib.unescape(src.group(1)).split("?")[0]
                u = ("https:" + u) if u.startswith("//") else u
                if u not in photos:
                    photos.append(u)
        bold = [text_of(x) for x in re.findall(r"<(?:b|strong)\b[^>]*>(.*?)</(?:b|strong)>", sec, re.S)]
        heads = [text_of(x) for x in re.findall(r"<h[1-4]\b[^>]*>(.*?)</h[1-4]>", sec, re.S)]
        out.append((photos, [b for b in bold if b], [h for h in heads if h]))
    return out


def site_pages(cache: Path) -> list[str]:
    xml = ic.polite_get(SITE + "/sitemap.xml", cache, accept="application/xml").decode("utf-8", "replace")
    out = []
    for loc in re.findall(r"<loc>\s*(.*?)\s*</loc>", xml):
        path = loc[len(SITE):] if loc.startswith(SITE) else None
        if path is None or any(s in path for s in SITEMAP_SKIP) or loc in out:
            continue
        out.append(loc)
    return out


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it["id"])
    skipped: list[str] = []
    matched: dict[str, set[tuple[str, str]]] = {}   # item id -> {(photo url, page url)}

    try:
        # 1. Ten Kites menu (schema.org MenuItem name + image)
        for name, img, page_url in tenkites_entries(args.cache):
            ids = by_name.get(ic.norm_name(name), [])
            if len(ids) != 1:
                skipped.append(f"Ten Kites {name!r}: {'no published item of that name' if not ids else 'name shared by ' + ', '.join(ids)}")
                continue
            matched.setdefault(ids[0], set()).add((img, page_url))
        # 2. Amalfi's own pages: a section with one photo whose text names exactly one published dish
        for url in site_pages(args.cache):
            page = ic.polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for photos, bold, heads in section_entries(page):
                if not photos:
                    continue
                names = {ic.norm_name(b) for b in bold} | {ic.norm_name(h) for h in heads if ic.norm_name(h) in by_name}
                dish = [n for n in names if n in by_name]
                if not dish:
                    continue
                where = f"{url} section with {', '.join(repr(b) for b in (bold + heads)[:6])}"
                if len(photos) != 1 or len(names) != 1:
                    skipped.append(f"{where}: {len(photos)} photo(s) and {len(names)} name(s): not one photo of one dish")
                    continue
                ids = by_name[dish[0]]
                if len(ids) != 1:
                    skipped.append(f"{where}: name shared by {', '.join(ids)}")
                    continue
                matched.setdefault(ids[0], set()).add((photos[0], url))
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    plan: dict[str, tuple[str, str]] = {}
    for item_id, found in sorted(matched.items()):
        if item_id in DROP_ITEMS:
            skipped.append(f"{item_id}: dropped after looking: {DROP_ITEMS[item_id]}")
            continue
        photos = {p for p, _ in found}
        if len(photos) != 1:
            skipped.append(f"{item_id}: the pages give {len(photos)} different photos: none used")
            continue
        photo, page_url = sorted(found)[0]
        fname = urllib.parse.unquote(photo.rsplit("/", 1)[-1])
        if fname in SKIP_FILES:
            skipped.append(f"{item_id}: {fname}: {SKIP_FILES[fname]}")
            continue
        plan[item_id] = (photo, page_url)

    rows: dict[str, tuple[str, str]] = {}
    refused_hosts: dict[str, str] = {}
    for item_id, (photo, page_url) in plan.items():
        host = urllib.parse.urlsplit(photo).netloc
        if args.dry_run:
            ok = ic._robots_allow(photo)
            print(f"  {item_id:50} {photo.rsplit('/', 1)[-1]}  {'(robots allows)' if ok else '(robots.txt DISALLOWS: will not be fetched)'}")
            continue
        if host in refused_hosts:
            skipped.append(f"{item_id}: photo host {host} refused us ({refused_hosts[host]}): not fetched")
            continue
        try:
            raw = ic.polite_get(photo, args.cache, referer=page_url)
        except ic.Blocked as e:
            refused_hosts[host] = str(e)
            skipped.append(f"{item_id}: {e}: stopping for host {host}")
            continue
        try:
            fname = ic.store_image(CHAIN_ID, raw)
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")
            continue
        rows[item_id] = (fname, page_url)
        print(f"  {item_id:50} {fname}  <- {photo.rsplit('/', 1)[-1]}")

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(plan)} of {len(items)} published items matched a photo by name")
        return 0
    for host, why in refused_hosts.items():
        print(f"REFUSED (not worked round): {host}: {why}")
    if not rows:
        print(f"0 of {len(items)} published items have a photo: images.csv not written")
        return 0
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
