#!/usr/bin/env python3
"""Item photos for Banana Tree from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_banana_tree.py --cache DIR [--dry-run]

Source: the pages of bananatree.co.uk listed in its own sitemap (https://bananatree.co.uk/sitemap.xml: 118 addresses on 2026-11-17;
policy, contact and careers pages are not read, see SKIP_PATHS; one request each, cached). www.bananatree.co.uk answers with a 301 to
bananatree.co.uk. The site is a Nuxt 2 page whose pictures are files in the Big Table Group's Contentful space
(images.ctfassets.net/hhagtzhy2px1, the asset host the pages use; nothing else is accepted). Each picture is rendered as an
<img data-src="..."> (and <source data-srcset="..."> for the desktop file) with the asset's title or a caption as its alt/title
attribute: that is how the page names a photo.

Where the photos are NOT taken from:
* the dish photos of the Ten Kites menu that /menu embeds (menus.tenkites.com/thebigtg/bananatree04, the menu banana_tree.py reads the
  nutrition from) are files on images.tenkites.com, whose robots.txt (read 2026-11-17) says "User-agent: * / Allow:
  /tenkitestest/menus.html / Disallow: /". We honour that and do not fetch them, and we do not look for "the same file" elsewhere
  (that would be working round the rule). (An earlier version of this script matched those Ten Kites photos by their dish records;
  it was never run, because every photo request is refused by that robots.txt.)
* ordering and delivery: the site sends people to Deliveroo, Just Eat and Uber Eats (third parties: never used); the restaurant
  pages (/restaurants/<town> and /restaurants/<town>/menu) carry only the same Ten Kites menu, banners and delivery logos.

Match rule (exact, nothing fuzzy): a picture whose alt or title, the name the page gives it, has the same images_common.norm_name as
exactly one published item, either as it stands or once one of the page's own fixed caption forms is taken off (CAPTION_FORMS):
the chain's own name in front ("Banana Tree Banana Fudge Cake", "Banana Tree's Bang Bang Broccoli ..."), optionally followed by
" from the Bottomless Bowls Menu" or " - a limited-time special for Christmas 2026". What is left must be a published item's whole name;
no other word is dropped, reordered or approximated ("A delicious bowl of creamy Singapore Laksa", "Banana Tree's Firecracker Wings"
(the item is "Wings - Firecracker"), "Banana Tree's Pad Thai" (our rows are "Pad Thai - Chicken" etc.) and "Sweetcorn Fritters" give
nothing). A picture whose names point at two different published items gives no photo; an item that two different Contentful assets
picture gets none (ambiguous). Photos looked at on contact sheets and left out go in DROP_ITEMS / SKIP_ASSETS so a rerun can't bring
them back.

robots.txt (https://bananatree.co.uk/robots.txt, read 2026-11-17): "User-agent: * / Allow: /" plus the sitemap line; no group names an
AI crawler. images.ctfassets.net is checked by polite_get like every host (RFC 9309). A 401/403/429, a robots refusal or an unreadable
robots.txt stops the script (exit 2) before anything is written.

Terms (read 2026-11-17): https://bananatree.co.uk/terms-and-conditions, "Intellectual Property": "The contents of this site are protected
by copyright however you may print off, link to or quote content for non-commercial use providing you do not remove any copyright and
proprietary notices. Content for commercial use must be cleared by Banana Tree." The same page says "Photography used is indicative & may
not show the current menu dishes & drinks." Photos are installed on the founder's decisions of 2026-10-06 (his accepted risk; taken
down the day the chain asks).

Run of 2026-11-17: 107 sitemap pages read (197 picture names). Exact names: "Sriracha Coconut Seabass" and "Korean Crispy Chicken
Noodles" (/christmas, the "Golden Specials" tiles, each under a heading with the same name and a description that matches the photo:
the seabass "served with Blistered Dragon Peppers", the noodles "Served with prawn crackers"); by the caption forms: "Banana Tree's Virgin
Chai Colada - a limited-time special for Christmas 2026" (/christmas, the Virgin Chai Colada tile's own desktop file
BT_VirginChaiColada_WebsiteDesktop.jpg; the Chai Colada tile beside it has its own desktop file), "Banana Tree's Bang Bang Broccoli from
the Bottomless Bowls Menu" (/bottomless-bowls, battered broccoli florets; the same page's sweetcorn-fritter photo is a different picture)
and "Banana Tree Banana Fudge Cake" (/travel-groups). 5 of 144 published items, every photo looked at on a contact sheet: real food
photos, no lettering, figures, logos or stickers (two show a hand holding the fork or the glass); none left out, so DROP_ITEMS and
SKIP_ASSETS are empty. The rest of the menu has no photo named after it on the chain's own pages (its per-dish photos are the Ten Kites
ones above).
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "banana-tree"
SITE = "https://bananatree.co.uk"
SITEMAP = SITE + "/sitemap.xml"
ASSET_PREFIX = "https://images.ctfassets.net/hhagtzhy2px1/"   # the Contentful space the chain's pages use
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# Sitemap pages not read: policies, forms and job pages carry no food pictures.
SKIP_PATHS = {"/cookie-policy", "/privacy-policy", "/modern-slavery-act-statement", "/ethical-trading-policy",
              "/service-charge-policy", "/sign-up/thanks", "/feedback", "/get-in-touch", "/contact", "/careers", "/careers/benefits"}
# The page's own fixed caption forms: the chain's name in front and, optionally, one of two fixed endings. The dish group must then be
# a published item's whole name (norm_name equality); nothing else is taken off.
CAPTION_FORMS = [
    re.compile(r"Banana Tree(?:'s|’s)? (?P<dish>.+?)(?: from the Bottomless Bowls Menu| - a limited-time special for Christmas 2026)?"),
]
# Looked at on contact sheets and left without a photo (item id -> why); a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {}
# Contentful asset ids never used (asset id -> why), e.g. a picture with promotional lettering.
SKIP_ASSETS: dict[str, str] = {}


def asset_url(url: str) -> str | None:
    """https URL of a Contentful file in the chain's space, without resize parameters; None for anything else."""
    url = htmllib.unescape(url).split("?", 1)[0]
    if url.startswith("//"):
        url = "https:" + url
    return url if url.startswith(ASSET_PREFIX) else None


def asset_id(url: str) -> str:
    return url[len(ASSET_PREFIX):].split("/", 1)[0]


def _tags(fragment: str) -> list[tuple[str, set[str], bool]]:
    """(file url, {alt, title}, is a desktop <source media=...>) of each <img>/<source> in the fragment whose file is in the
    chain's Contentful space."""
    out = []
    for tag in re.findall(r"<(?:img|source)\b[^>]*>", fragment, re.I):
        src = re.search(r'\s(?:data-src|src|data-srcset|srcset)\s*=\s*"([^"\s,]+)', tag)
        url = asset_url(src.group(1)) if src else None
        if not url:
            continue
        names = set()
        for attr in ("alt", "title"):
            m = re.search(r"\s" + attr + r'\s*=\s*"([^"]*)"', tag)
            if m and m.group(1).strip():
                names.add(htmllib.unescape(m.group(1)).strip())
        out.append((url, names, re.search(r"\smedia\s*=", tag) is not None))
    return out


def page_pictures(page: str) -> list[tuple[str, set[str]]]:
    """(photo url, names) for every picture on the page. A <picture> element is ONE picture: its file is the desktop <source>'s
    file (else the <img>'s), and it is named only by the alt/title of the elements that carry that same file (the phone <img> of a
    tile can be another tile's file: /christmas shows its Chai Colada tile with the Virgin Chai Colada phone picture). An <img>
    outside a <picture> is a picture of its own."""
    out = []
    for pic in re.findall(r"<picture\b.*?</picture>", page, re.I | re.S):
        tags = _tags(pic)
        if not tags:
            continue
        desktop = [t for t in tags if t[2]]
        url = (desktop or tags)[0][0]
        names = set().union(*(n for u, n, _ in tags if u == url))
        out.append((url, names))
    for url, names, _ in _tags(re.sub(r"<picture\b.*?</picture>", "", page, flags=re.I | re.S)):
        out.append((url, names))
    return out


def name_keys(name: str) -> set[str]:
    """The norm_name keys a picture name can stand for: the name itself, and the dish group of a fixed caption form."""
    keys = {ic.norm_name(name)}
    for form in CAPTION_FORMS:
        m = form.fullmatch(name)
        if m:
            keys.add(ic.norm_name(m.group("dish")))
    return keys


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
    seen_titles: set[str] = set()
    try:
        sm = ic.polite_get(SITEMAP, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        paths = []
        for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", sm):
            if loc.startswith(SITE):
                path = loc[len(SITE):] or "/"
                if path not in SKIP_PATHS and path not in paths:
                    paths.append(path)
        if "/" not in paths:
            paths.insert(0, "/")
        if len(paths) < 2:
            raise SystemExit("the sitemap lists no pages: it has changed shape")
        print(f"{len(paths)} pages from {SITEMAP} (and the home page)")
        for path in paths:
            page_url = SITE + path
            page = ic.polite_get(page_url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for url, names in page_pictures(page):
                seen_titles |= names
                keys = set().union(*(name_keys(n) for n in names)) & by_name.keys() if names else set()
                if len(keys) > 1:
                    skipped.append(f"{path}: picture {url.rsplit('/', 1)[-1]} is named as two different dishes ({', '.join(sorted(keys))})")
                elif keys:
                    key = keys.pop()
                    if asset_id(url) not in found.get(key, {}):
                        print(f"  match {key!r} on {path}: {url.rsplit('/', 1)[-1]}  (named {sorted(names)})")
                    found.setdefault(key, {}).setdefault(asset_id(url), (url, page_url))
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2
    print(f"{len(seen_titles)} different picture names on the pages")

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
        print(f"{sum(1 for k in found if len(by_name[k]) == 1)} published items matched (before drop and ambiguity rules)")
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
