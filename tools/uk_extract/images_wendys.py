#!/usr/bin/env python3
"""Item photos for Wendy's UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_wendys.py --cache <dir> [--dry-run] [--exact-only]

Source: https://www.wendys.com/en-gb (Drupal). Every menu category page lists the products as tiles (name in <h3>,
kcal, link to the product page). Each product page (/en-gb/menu-items/<slug> or /en-gb/<slug>) shows ONE photo of
the product (<article class="media media--view-mode-food-menu-header"> ... <img alt data-src=".../styles/max_650x650/..">),
its name (<div class="food-menu--menu-item--summary"><h3>) and its nutrition table. The photo we take is the 650 px
image the product page itself serves (the chain's own resize of its upload); store_image only downsizes to <= 640 px
and converts to WebP.

Match rule (nothing fuzzy; an item with no unambiguous match gets no photo). The chain's product page must
  1. name the product with the published item's name (images_common.norm_name equality of the page's <h3> with the item name
     in the CURRENT items.csv) -- tier "exact" -- or, in the few cases where the chain words the same product slightly
     differently from its own nutrition PDF, the page's <h3> must equal the title written next to that item in ALIASES /
     drink_title() below (reviewed by hand, one line per item) -- tier "alias" (turn these off with --exact-only);
  2. show the same energy as the published item (the product page's own nutrition table): |page kcal - items.csv calories|
     <= 10 kcal or 5% for "exact", identical for "alias" (the PDF and the website sometimes describe different portions: e.g.
     the website's "Caesar Salad" has the chicken that the PDF lists as "Caesar Salad w/ Classic Chicken"; those are NOT matched);
  3. be unambiguous: one item with that name and one product page with that title. The photo is the one the product page
     shows; when a page shows none, the one on the category tile for that product (same <h3> title, alt text) is used;
  4. not contradict itself: the photo's own caption/alt text and its file name must not name another count, size, flavour,
     sauce or drink than the page title (e.g. the "12 Pc Boneless Bites" page shows a photo captioned "10 Pc Chicken
     Nuggets", the "Junior Vanilla Frosty" page one captioned "Junior Chocolate Frosty": both skipped).
Promotional images (Biggie Bag / Halloween / app banners) are never used: they are not on product pages of published items.
Reviewed exclusions are in SKIP (with the reason). After downloading, items whose photo file is byte-identical to the photo of
a different variant (e.g. Coke vs Diet Coke) are dropped, and a "CHECK BY EYE" line names families of variants whose uploads
share a file name (the chain clones product records, so a copy may still show the original product).

Terms (https://www.wendys.com/en-gb/terms-and-conditions, text served through OneTrust, read 2026-10-07): "You may access
and display Material and all other content displayed on this Site for non-commercial, personal, entertainment use on a
single computer only. You may not use, copy, distribute, publish, disclose, upload, post or transmit the Materials in any
commercial manner. The Material and all other content on this Site may not otherwise be copied, reproduced, republished,
uploaded, posted, transmitted, distributed, or used in any way unless specifically authorized by Wendy's." Also: "Using any
Material on any other web site or networked computer environment is prohibited." and (acceptable use) "You may not ...
(m) Copies any other pages or images on this Site except with appropriate authority". Installed on the founder's decision
of 2026-10-06 (the founder's accepted risk); a chain's photos come down the day it asks.
robots.txt (read 2026-10-07): User-agent * disallows /core/, /profiles/, /storybook/, /admin/, /search/, /taxonomy/term/,
/brand-assets/ and user/comment paths; the menu, product pages and /sites/default/files/ are allowed (polite_get checks
every URL anyway).

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "wendys"
SITE = "https://www.wendys.com"
MENU_PAGE = "/en-gb/menu/our-menu"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
# Category pages linked from the UK menu page (and the "what's new" page); one request each, cached.
CATEGORY_PAGES = [
    "/en-gb/menu-categories/hamburgers", "/en-gb/menu-categories/chicken-sandwiches-nuggets",
    "/en-gb/boneless-bites-tenders", "/en-gb/wraps", "/en-gb/menu-categories/veggie-options",
    "/en-gb/menu-categories/fresh-made-salads", "/en-gb/menu-categories/fries-sides", "/en-gb/menu-categories/frosty",
    "/en-gb/menu-categories/wendys-kids-meal", "/en-gb/menu-categories/coffee-beverages",
    "/en-gb/menu-categories/breakfast-sandwiches", "/en-gb/breakfast-wraps", "/en-gb/menu-categories/breakfast-sides",
    "/en-gb/menu-categories/breakfast-combos", "/en-gb/menu-categories/combos", "/en-gb/biggie-deals-0", "/en-gb/whats-new",
]
CATEGORY_LINK = re.compile(r"^/en-gb/(menu-categories/[a-z0-9-]+|wraps|boneless-bites-tenders|breakfast-wraps|biggie-deals-\d+|whats-new)$")

# item id -> the title the chain's product page gives the same product (reviewed by hand against the page and the kcal;
# the script re-checks title and energy on every run). Only wording differs: sauce names, "Sandwich", sizes, spelling.
ALIASES: dict[str, str] = {
    "bbq-bacon-melt-single-cheeseburger": "BBQ Bacon Melt Cheeseburger",
    "bbq-bacon-melt-classic-chicken": "BBQ Bacon Melt Classic Chicken Sandwich",
    "bbq-bacon-melt-spicy-chicken": "BBQ Bacon Melt Spicy Chicken Sandwich",
    "avocado-wrap-w-halloumi-fries": "Avocado Wrap, Halloumi Fries",
    "signature-wrap-w-halloumi-fries": "Signature Wrap, Halloumi Fries",
    "bbq-wrap-w-halloumi-fries": "BBQ Wrap, Halloumi Fries",
    "caesar-salad-w-halloumi-fries": "Caesar Salad, Halloumi Fries",
    "avocado-salad-w-halloumi-fries": "Avocado Salad, Halloumi Fries",
    "chili": "Chili con Carne",
    "cheesy-topped-fries": "Cheese Fries",
    "small-hashbrown": "Small Hash Brown Bites",
    "regular-hashbrown": "Medium Hash Brown Bites",
    "large-hashbrown": "Large Hash Brown Bites",
    "apple-slices": "Apple Bites",
    "6-pc-mini-donuts": "Mini Doughnuts - 6pc",
    "classic-egg-and-cheese-muffin": "Classic Egg & Cheese Sandwich",
    "breakfast-baconator-w-brown-sauce": "Breakfast Baconator, HP Brown Sauce",
    "breakfast-baconator-w-red-sauce": "Breakfast Baconator, Heinz Ketchup",
    "sausage-breakfast-butty-w-brown-sauce": "Sausage butty, HP Brown Sauce",
    "bacon-breakfast-butty-w-brown-sauce": "Bacon butty, HP Brown Sauce",
    "sausage-breakfast-butty-w-red-sauce": "Sausage butty, Heinz Ketchup",
    "bacon-breakfast-butty-w-red-sauce": "Bacon butty, Heinz Ketchup",
    "breakfast-wrap-bacon-w-red-sauce": "Bacon Breakfast Wrap, Heinz Ketchup",
    "breakfast-wrap-bacon-w-brown-sauce": "Bacon Breakfast Wrap, HP Brown Sauce",
    "breakfast-wrap-sausage-w-red-sauce": "Sausage Breakfast Wrap, Heinz Ketchup",
    "breakfast-wrap-sausage-w-brown-sauce": "Sausage Breakfast Wrap, HP Brown Sauce",
    "breakfast-wrap-egg-and-cheese-w-red-sauce": "Egg & Cheese Breakfast Wrap, Heinz Ketchup",
    "breakfast-wrap-egg-and-cheese-w-brown-sauce": "Egg & Cheese Breakfast Wrap, HP Brown Sauce",
    "jr-vanilla-frosty": "Junior Vanilla Frosty® 6oz",
    "regular-vanilla-frosty": "Regular Vanilla Frosty® 9oz",
    "large-vanilla-frosty": "Large Vanilla Frosty® 12oz",
    "x-large-vanilla-frosty": "Extra Large Vanilla Frosty® 16oz",
    "jr-chocolate-frosty": "Junior Chocolate Frosty® 6oz",
    "regular-chocolate-frosty": "Regular Chocolate Frosty® 9oz",
    "large-chocolate-frosty": "Large Chocolate Frosty® 12oz",
    "x-large-chocolate-frosty": "Extra Large Chocolate Frosty® 16oz",
    "regular-vanilla-strawberries-and-cream-frosty": "Regular Strawberries and Cream Frosty® - Vanilla",
    "large-vanilla-strawberries-and-cream-frosty": "Large Strawberries and Cream Frosty® - Vanilla",
    "regular-chocolate-strawberries-and-cream-frosty": "Regular Strawberries and Cream Frosty® - Chocolate",
    "large-chocolate-strawberries-and-cream-frosty": "Large Strawberries and Cream Frosty® - Chocolate",
}
DRINK = re.compile(r"^(?P<base>.+) \((?P<size>small|regular|large), (?P<oz>\d+) oz\)$")
DRINK_SIZE = {"small": "Small", "regular": "Medium", "large": "Large"}   # the chain calls the 16 oz cup "Medium"
# Items whose page matches but whose photo is not used (reviewed by hand, with the reason).
SKIP: dict[str, str] = {
    "kids-cheeseburger": "looked at after the first run: the photo is the whole kids' meal (milk and apple slices too), not the item",
    "kids-hamburger": "looked at after the first run: the photo is the whole kids' meal (milk and apple slices too), not the item",
    "avocado-salad-w-halloumi-fries": "its photo is a copy of the base salad's upload (same file name, 1920x1080_Delivery-3b850e0e...), "
                                      "and the base Avocado Salad page is the chicken version (574 kcal = the guide's 'w/ Classic Chicken')",
    "caesar-salad-w-halloumi-fries": "its photo is a copy of the base salad's upload (same file name, 1920x1080_Delivery-9522e58e...), "
                                     "and the base Caesar Salad page is the chicken version (493 kcal = the guide's 'w/ Classic Chicken')",
}


def drink_title(item_name: str) -> str | None:
    """'Coke Zero (small, 12 oz)' -> 'Coke Zero Small Drink 12 oz' (how the chain's product page titles a cup)."""
    m = DRINK.match(item_name)
    return f"{m['base']} {DRINK_SIZE[m['size']]} Drink {m['oz']} oz" if m else None


# ---------------------------------------------------------------- page parsing

def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def upload_stem(src: str) -> str:
    """Identity of an upload: file name without extension and Drupal's '_0', '_1' re-upload suffixes."""
    name = urllib.parse.unquote(urllib.parse.urlsplit(html.unescape(src)).path.rsplit("/", 1)[-1])
    name = re.sub(r"\.[A-Za-z0-9]+$", "", name)
    return re.sub(r"(_\d+)+$", "", name)


def upload_path(src: str) -> str:
    """The exact upload (folder and file name, no image-style or token): two items with the same value show the same file."""
    path = urllib.parse.unquote(urllib.parse.urlsplit(html.unescape(src)).path)
    return path.split("/public/", 1)[-1]


def parse_tiles(page: str) -> list[dict]:
    """Product tiles of a category page: href, <h3> title, kcal text, photo (alt, src)."""
    out = []
    for part in re.split(r"(?=<article[^>]*node--food-menu-item[^>]*node--view-mode-teaser)", page)[1:]:
        href = re.search(r'<a href="(/en-gb/[^"]+)"', part)
        h3 = re.search(r"<h3>(.*?)</h3>", part, re.S)
        img = re.search(r'<img alt="([^"]*)"[^>]*data-src="([^"]+)"', part)
        kc = re.search(r"field--name-calorie[^>]*>\s*(\d+)", part)
        if href and h3 and img:
            out.append({"href": href.group(1), "title": clean(h3.group(1)), "kcal": int(kc.group(1)) if kc else None,
                        "alt": html.unescape(img.group(1)), "src": html.unescape(img.group(2))})
    return out


def parse_product(page: str) -> dict | None:
    """The product page's own title, energy and header photo (alt, caption, src; src None when the page shows no photo)."""
    name = re.search(r'food-menu--menu-item--summary">\s*<h3>(.*?)</h3>', page, re.S)
    kc = re.search(r"field--name-nutrition-energy.*?field__item\">\s*([0-9.]+)", page, re.S)
    if not (name and kc):
        return None
    hdr = re.search(r'media--view-mode-food-menu-header">(.*?)</article>', page, re.S)
    img = re.search(r'<img alt="([^"]*)"[^>]*data-src="([^"]+)"', hdr.group(1)) if hdr else None
    cap = re.search(r'blazy__caption--description">(.*?)</div>', hdr.group(1), re.S) if hdr else None
    return {"title": clean(name.group(1)), "kcal": float(kc.group(1)),
            "alt": html.unescape(img.group(1)) if img else "", "caption": clean(cap.group(1)) if cap else "",
            "src": html.unescape(img.group(2)) if img else None}


# ---------------------------------------------------------------- "does the photo's own text contradict the title?"

CATEGORIES = {   # words that say WHICH variant a photo/title is about; two texts contradict when one category disagrees
    "size": {"small", "medium", "large", "xlarge", "junior", "kids"},
    "stack": {"single", "double", "triple"},
    "base": {"vanilla", "chocolate"},
    "mix": {"strawberries", "kitkat"},
    "heat": {"spicy", "classic"},
    "style": {"bbq", "buffalo"},
    "sauce": {"ketchup", "brown"},
    "protein": {"sausage", "bacon", "egg", "chicken", "beef", "halloumi"},
    "variant": {"avocado", "signature", "caesar"},
    "brand": {"coke", "sprite", "fanta"},
    "zero": {"zero", "diet"},
}


def keys(text: str, file_name: bool = False) -> dict[str, set[str]]:
    t = ic.norm_name(text)
    t = re.sub(r"\b(extra large|x large|xl)\b", "xlarge", t)
    t = re.sub(r"\bjr\b", "junior", t)
    t = re.sub(r"\bregular\b", "medium", t)
    t = re.sub(r"\b(heinz|red)\b", "ketchup", t)
    t = re.sub(r"\bhp\b", "brown", t)
    words = set(t.split())
    out = {cat: words & vocab for cat, vocab in CATEGORIES.items()}
    if file_name:   # file names carry hashes and sizes ("600x400"): only counts written as "10 Nuggets" / "3 PC Tenders"
        out["count"] = set(re.findall(r"(\d+)\s*(?:pc|pcs|piece|nugget|nuggets|tender|tenders)\b", t))
    else:
        out["count"] = set(re.findall(r"\d+", t))
    return out


def contradicts(title: str, other: str, file_name: bool = False) -> bool:
    """True when, in some category (count, size, flavour, sauce, drink...), both texts name something and they name
    different things ('12 Pc' vs '10 Pc', 'Vanilla' vs 'Chocolate'). One side merely saying less ('Hash Brown Bites' vs
    'Medium Hash Brown Bites') is not a contradiction."""
    a, b = keys(title), keys(other, file_name)
    return any(a[c] and b[c] and not (a[c] & b[c]) for c in a)


def variant_sig(title: str) -> tuple:
    """Which variant a title is (flavour, sauce, protein, drink...) with sizes and counts left out."""
    k = keys(title)
    return tuple(sorted((c, tuple(sorted(v))) for c, v in k.items() if v and c not in ("size", "stack", "count")))


def mixed_families(groups: dict[str, list[str]], titles: dict[str, str]) -> list[list[str]]:
    """Item ids that share one photo (or one upload name) although their titles are different variants."""
    out = []
    for ids in groups.values():
        if len(ids) > 1 and len({variant_sig(titles[i]) for i in ids}) > 1:
            out.append(sorted(ids))
    return out


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch pages only, print the matches, write nothing")
    ap.add_argument("--exact-only", action="store_true", help="only items whose product page has exactly the item's name")
    args = ap.parse_args()

    csv_rows = {r["id"]: r for r in ic.load_items(CHAIN)}
    items = list(csv_rows.values())
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    try:
        menu = ic.polite_get(SITE + MENU_PAGE, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        linked = {h for h in re.findall(r'href="(/en-gb/[^"#?]*)"', menu) if CATEGORY_LINK.match(h)}
        for extra in sorted(linked - set(CATEGORY_PAGES)):
            skipped.append(f"category page {extra} is linked from the menu page but not in CATEGORY_PAGES")

        tiles: dict[str, dict] = {}                      # product href -> tile (first one seen)
        for path in CATEGORY_PAGES:
            page = ic.polite_get(SITE + path, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            found = parse_tiles(page)
            if not found:
                skipped.append(f"{path}: no product tiles found")
            for t in found:
                tiles.setdefault(t["href"], t)
        by_title: dict[str, list[str]] = {}               # norm title -> product hrefs
        for href, t in tiles.items():
            by_title.setdefault(ic.norm_name(t["title"]), []).append(href)
        print(f"{len(tiles)} product tiles on {len(CATEGORY_PAGES)} category pages")

        matches: dict[str, dict] = {}
        for it in sorted(items, key=lambda r: r["id"]):
            iid, name = it["id"], it["name"]
            if iid in SKIP:
                skipped.append(f"{iid}: {SKIP[iid]}")
                continue
            key = ic.norm_name(name)
            tier = "exact"
            want = key
            if key not in by_title:
                alias = ALIASES.get(iid) or drink_title(name)
                if not alias or args.exact_only:
                    continue
                tier, want = "alias", ic.norm_name(alias)
            hrefs = by_title.get(want, [])
            if len(by_name[key]) != 1:
                skipped.append(f"{iid}: {len(by_name[key])} published items share the name {name!r}")
                continue
            if len(hrefs) != 1:
                if tier == "alias" and not hrefs:
                    continue          # the page the alias expects is not on the site (any more)
                skipped.append(f"{iid}: {len(hrefs)} product pages titled {want!r}")
                continue
            href = hrefs[0]
            tile = tiles[href]
            ours = float(it["calories"]) if it.get("calories") else None
            product = ic.polite_get(SITE + href, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            p = parse_product(product)
            if p is None:
                skipped.append(f"{iid}: cannot read the product page {href}")
                continue
            if ic.norm_name(p["title"]) != want:
                skipped.append(f"{iid}: page {href} is titled {p['title']!r}, not {name!r}")
                continue
            if ours is None:
                skipped.append(f"{iid}: our calories are missing")
                continue
            diff = abs(p["kcal"] - ours)
            if (diff > 0) if tier == "alias" else (diff > max(10, 0.05 * ours)):
                skipped.append(f"{iid}: page {href} says {p['kcal']:g} kcal, our published row {ours:g}: not the same portion, no photo")
                continue
            notes = []
            if p["src"]:
                src, alt, cap, shown_on = p["src"], p["alt"], p["caption"], "page"
                if upload_stem(src) != upload_stem(tile["src"]):
                    notes.append(f"the category tile shows another upload ({upload_stem(tile['src'])!r}); the page's own photo is used")
            else:
                src, alt, cap, shown_on = tile["src"], tile["alt"], "", "tile"
                notes.append("the product page shows no photo; the one on its category tile is used")
            if tile["kcal"] is not None and tile["kcal"] != p["kcal"]:
                notes.append(f"the tile says {tile['kcal']} kcal, the page's nutrition table {p['kcal']:g}")
            bad = [what for what, other, fn in (("alt text", alt, False), ("caption", cap, False),
                                                ("file name", upload_stem(src), True))
                   if other and contradicts(p["title"], other, fn)]
            if bad:
                skipped.append(f"{iid}: the photo's own {' and '.join(bad)} ({alt!r}, file {upload_stem(src)!r}) "
                               f"names another size/count/flavour than the title {p['title']!r}, no photo")
                continue
            matches[iid] = {"photo": urllib.parse.urljoin(SITE, src), "page": SITE + href, "tier": tier, "stem": upload_path(src), "family": upload_stem(src),
                            "title": p["title"], "kcal": p["kcal"], "ours": ours, "alt": alt, "notes": notes, "on": shown_on}
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    by_stem: dict[str, list[str]] = {}
    for iid, m in matches.items():
        by_stem.setdefault(m["stem"], []).append(iid)
    for iid, m in matches.items():
        print(f"  {iid:52} [{m['tier']}] page title {m['title']!r}  {m['kcal']:g} kcal (ours {m['ours']:g})")
        print(f"      photo {m['photo']}  (on the {m['on']}, alt {m['alt']!r})")
        print(f"      page  {m['page']}")
        for n in m["notes"]:
            print(f"      note: {n}")
        if len(by_stem[m["stem"]]) > 1:
            print(f"      note: the same upload is used by {', '.join(i for i in by_stem[m['stem']] if i != iid)}")
    titles = {i: m["title"] for i, m in matches.items()}
    stems: dict[str, list[str]] = {}
    for iid, m in matches.items():
        stems.setdefault(m["family"], []).append(iid)
    for fam in mixed_families(stems, titles):
        print(f"  CHECK BY EYE: the chain gave these different variants uploads with the same file name: {', '.join(fam)}")
    exact = sum(1 for m in matches.values() if m["tier"] == "exact")
    mentioned = {s.split(":", 1)[0] for s in skipped}
    unnamed = [it["id"] for it in items if it["id"] not in matches and it["id"] not in mentioned]
    if args.dry_run:
        for s in skipped:
            print("  no photo:", s)
        print(f"  no product page on the site is titled like these {len(unnamed)} items: {', '.join(unnamed)}")
        print(f"{len(matches)} of {len(items)} published items matched ({exact} exact, {len(matches) - exact} alias)")
        return 0

    rows: dict[str, tuple[str, str]] = {}
    try:
        for iid, m in matches.items():
            try:
                raw = ic.polite_get(m["photo"], args.cache, referer=m["page"])
                rows[iid] = (ic.store_image(CHAIN, raw), m["page"])
            except ValueError as e:
                skipped.append(f"{iid}: {m['photo']}: {e}")
            except urllib.error.HTTPError as e:
                skipped.append(f"{iid}: {m['photo']}: HTTP {e.code}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2
    by_file: dict[str, list[str]] = {}
    for iid, (fname, _) in rows.items():
        by_file.setdefault(fname, []).append(iid)
    for fam in mixed_families(by_file, titles):   # byte-identical photo on different variants: we cannot tell which it shows
        for iid in fam:
            rows.pop(iid, None)
            skipped.append(f"{iid}: its photo is byte-identical to the photo of a different variant ({', '.join(fam)}), no photo")
    for s in skipped:
        print("  no photo:", s)
    print(f"  no product page on the site is titled like these {len(unnamed)} items: {', '.join(unnamed)}")
    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # nothing matched: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for f in d.iterdir():
                f.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
