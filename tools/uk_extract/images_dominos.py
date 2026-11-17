#!/usr/bin/env python3
"""Item photos for Domino's UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_dominos.py --cache DIR [--dry-run]

Where Domino's shows its dishes with photos, and what we may use (read 2026-11-17):
  * The menu itself (every pizza, side, dip and dessert with its picture) is only shown after a store is picked, at
    https://www.dominos.co.uk/store/<store id>/menu. robots.txt for www.dominos.co.uk says "Disallow:/store/" (and /storefinder/,
    /storefulfilment/, /menu without a store redirects to the home page), so the menu is NOT read, and neither is the JSON behind it:
    taking the disallowed pages' content by another path would be working round robots.txt.
  * Pages we do read (all allowed by robots.txt, nothing else is requested besides the photo files):
      1. Three posts of the chain's own blog, https://www.dominos.co.uk/blog/<slug>/, laid out as a heading naming a product followed
         by its photo (dominos-pizza-sides, ultimate-lasagne-carbonara-pizza, dominos-wraps), or as a photo followed by a paragraph
         whose bold words name it (chick-n-dip: the nine CHICK 'N' DIP dips). Photos are files in the blog's own media library
         https://www.dominos.co.uk/blog/wp-content/uploads/... All 101 posts (the blog's own WordPress feed /blog/wp-json/wp/v2/posts)
         were read once on 2026-11-17 to find these: no other post gives a photo the exact name of a published non-pizza item.
      2. One page of the chain's own corporate site, https://corporate.dominos.co.uk/news/balanced-menu-new (the launch of Loaded Veg,
         23 January 2025): its one picture carries alt="Loaded Veg" (the page's own name for it), a file on the chain's image CDN
         https://cdn.dominosmedia.co.uk/i/dominos/LoadedVeg (we take the 640 px rendition the page's own srcset lists). The other 88
         news pages in https://corporate.dominos.co.uk/sitemap.xml were read once on 2026-11-17: no other picture's alt names a
         published item (they show staff, stores, pizzas or placeholders).
      3. One store landing page, https://www.dominos.co.uk/pizza-near-me/abbots-langley/21-school-mead (the first store in the chain's
         own sitemap https://www.dominos.co.uk/pizza-near-me/sitemap.xml). Its "Featured" cards each name a product (`itemprop="name"`)
         and show its photo (`data-bg="url(//dynl.mktgcdn.com/p/...)"`, the image CDN the chain's own page loads; that host's
         robots.txt answers 404 = no rules). The non-pizza cards are the same on every store page sampled (68 of 1,337); only the
         featured pizzas differ by store.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when the name the page gives the photo has the same
norm_name as the item's KEY, the item's category is one the source may speak for (SOURCES below: e.g. the sides post only for
"Sides", the dips captions only for "Chick 'N' Dip", a dessert card only for "Desserts"), and no other published item in that
category has the same key. The KEY is the item's name with only these annotations of the nutrition guide taken off, nothing else:
  (a) a trailing pot weight in brackets, "(40g)": the guide prints each CHICK 'N' DIP dip as one 40 g pot ("Garlic Aioli (40g)");
      the blog names the same dip "Garlic Aioli" inside the CHICK 'N' DIP range;
  (b) a trailing market marker " UK": the guide covers the UK and Ireland and names the UK row "Potato Wedges UK";
  (c) an item the guide lists under its "Wraps" heading without the word gets " Wrap" ("Pepperoni Passion" under Wraps is the
      blog's "Pepperoni Passion Wrap"; the same name under the pizzas is a pizza, and pizza photos are never used for wraps).
The uniqueness check means one photo is never spread over a family of sizes or counts ("Chicken Wings (4)/(7)/(14)", "Domino's
Cookies (2)/(4)", "BBQ Dip 25g/100g", "Tenders x 3/5/8" stay without a photo: the page names the family, not each size).

Pizzas get no photo. Every pizza the guide prints is one crust and size ("Pepperoni Passion, Classic Crust - Large", 28 rows per pizza
with the reduced-fat cheese rows), the guide's gluten-free rows are "GF <pizza> - Small" and the Italianos are "<pizza> - Large" etc.;
the chain's readable pages name only the pizza ("Pepperoni Passion®"), never a crust and size, so no page names those exact dishes.

Terms (https://www.dominos.co.uk/legal/content/termsofuse, the page the corporate site's footer also links as its "Terms of Use", "Intellectual property rights", read 2026-11-17): "Our Sites, and their
content, functionality and design, are protected in the UK and elsewhere in the world by copyright laws and treaties, trademarks and
other intellectual property rights which are either used by us under licence or owned by us. All such rights are reserved. You may not
distribute, reproduce, modify, transmit, reuse, re-post or use our Sites, or the content, functionality or design of our Sites (or any
part of each) in any manner whatsoever, except as provided in these terms of use or the text on our Sites or within the terms of any
written permission granted by us in advance of such use". And https://www.dominos.co.uk/legal/content/copyrightandlegal: "You may
download and print extracts from this website and you can provide extracts to others - but you must not sell our content or republish
it." An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk). Take the folder and images.csv
down the day Domino's asks.
robots.txt (https://www.dominos.co.uk/robots.txt, read 2026-11-17): one group, "User-agent: *", Disallow: /basketdetails/, /fulfilment/,
/paymentoptions/, /orderconfirmation/, /storefinder/, /Content/menu/IE/, /marketingpreferences/thankyou/, /paymentvco/,
/storefulfilment/, /user/login, /paymentcard/fulfilmentfailure, /checkout/login, /unsupportedbrowser, /welcome, /mydominos/,
/dominos.services/, /error/, /store/, /info/: /blog/ and /pizza-near-me/ are allowed, the store menu (/store/) is not.
https://corporate.dominos.co.uk/robots.txt (read 2026-11-17): "User-agent: * / Disallow: /cms" (the news pages are allowed).
https://dynl.mktgcdn.com/robots.txt and https://cdn.dominosmedia.co.uk/robots.txt answer 404 (no rules). polite_get checks robots.txt on every URL (RFC 9309).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "dominos"
SITE = "https://www.dominos.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-dominos")
BLOG_MEDIA = SITE + "/blog/wp-content/uploads/"
FEATURED_MEDIA = "https://dynl.mktgcdn.com/p/"
CORPORATE_MEDIA = "https://cdn.dominosmedia.co.uk/i/dominos/"
STORE_PAGE = SITE + "/pizza-near-me/abbots-langley/21-school-mead"

# (page, layout, the categories of items.csv this page's names may be matched to). Earlier sources win if two name one item.
SOURCES = [
    (SITE + "/blog/dominos-pizza-sides/", "heading-then-photo", {"Sides"}),
    (SITE + "/blog/ultimate-lasagne-carbonara-pizza/", "heading-then-photo", {"Sides"}),
    (SITE + "/blog/dominos-wraps/", "heading-then-photo", {"Wraps"}),
    (SITE + "/blog/chick-n-dip/", "photo-then-bold-caption", {"Chick 'N' Dip"}),
    ("https://corporate.dominos.co.uk/news/balanced-menu-new", "alt-text", {"Sides"}),
]
# A Featured card's section is in its link (utm_campaign=pizza / CND / desserts). Pizza cards speak for no category (see docstring).
FEATURED_CATEGORIES = {"desserts": {"Desserts"}, "cnd": {"Chick 'N' Dip"}, "sides": {"Sides"}, "pizza": set()}

# Looked at on contact sheets (2026-11-17) and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {}
# (a) the CHICK 'N' DIP dip photos are a chicken tender being dunked into the pot, the tender filling much of the picture: the item is
#     the 40 g pot of dip alone (84-252 kcal), so the picture would show more than the figures cover
DROP_ITEMS.update({i: "the picture is a chicken tender dunked into the dip: the tender is not part of the 40 g dip the figures are for"
                   for i in ("garlic-aioli-40g", "hot-honey-40g", "mexicana-mayo-40g", "ranch-dip-40g")})
# (b) the wedges are shown with a BBQ Dip pot (its printed lid label and logo) that the item's figures may not include
DROP_ITEMS["potato-wedges-uk"] = "the picture adds a BBQ Dip pot with a printed lid label, a separate menu item the figures may not include"

WEIGHT_SUFFIX = re.compile(r"\s*\(\d+\s?g\)\s*$", re.I)       # rule (a)
UK_SUFFIX = re.compile(r"\s+UK\s*$")                           # rule (b)


def item_key(it: dict) -> str:
    name = UK_SUFFIX.sub("", WEIGHT_SUFFIX.sub("", it["name"]))
    key = norm_name(name)
    if it["category"] == "Wraps" and not key.endswith(" wrap"):   # rule (c)
        key += " wrap"
    return key


def text(s: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def article(page: str) -> str:
    """The blog post's own body: from <div class="singleArticle"> to the related-posts block (sidebars and related posts left out)."""
    i = page.find('<div class="singleArticle"')
    j = page.find('<div class="yarpp', i)
    if i < 0 or j < 0:
        raise SystemExit("a blog post no longer has its singleArticle / related-posts blocks: the page changed shape")
    return page[i:j]


TOKEN = re.compile(r"<h[1-6][^>]*>(?P<h>.*?)</h[1-6]>|(?P<img><img\b[^>]*>)|<p\b[^>]*>(?P<p>.*?)</p>", re.S)


def alt_photos(page: str) -> list[tuple[str, str]]:
    """[(alt text, photo url)] of every picture on a corporate page; the url is the page's own 640w srcset rendition when it has one."""
    out = []
    for m in re.finditer(r"<img\b[^>]*>", page):
        tag = m.group(0)
        alt = re.search(r'\salt="([^"]*)"', tag)
        src = re.search(r'\ssrc="([^"]+)"', tag)
        if not alt or not src:
            continue
        url = htmllib.unescape(src.group(1))
        srcset = re.search(r'\ssrcSet="([^"]+)"', tag, re.I)
        if srcset:
            for cand in htmllib.unescape(srcset.group(1)).split(","):
                parts = cand.split()
                if len(parts) == 2 and parts[1] == "640w":
                    url = parts[0]
        out.append((text(alt.group(1)), url))
    return out


def blog_photos(page: str, layout: str) -> list[tuple[str, str]]:
    """[(name the page gives the photo, photo url)] in page order."""
    if layout == "alt-text":
        return alt_photos(page)
    out: list[tuple[str, str]] = []
    toks: list[tuple[str, str]] = []
    for m in TOKEN.finditer(article(page)):
        if m.group("h") is not None:
            toks.append(("h", text(m.group("h"))))
        elif m.group("img"):
            src = re.search(r'\ssrc="([^"]+)"', m.group("img"))
            toks.append(("img", htmllib.unescape(src.group(1)) if src else ""))
        else:
            strong = re.match(r"\s*<strong>(.*?)</strong>", m.group("p") or "", re.S)
            if strong or text(m.group("p") or ""):
                toks.append(("bold" if strong else "p", text(strong.group(1)) if strong else ""))
    for i, (kind, val) in enumerate(toks):
        if kind != "img" or not val:
            continue
        if layout == "heading-then-photo":
            # the heading directly above, with no other photo between them (the first photo under a heading)
            j = i - 1
            while j >= 0 and toks[j][0] == "p":
                j -= 1
            if j >= 0 and toks[j][0] == "h":
                out.append((toks[j][1], val))
        elif layout == "photo-then-bold-caption":
            if i + 1 < len(toks) and toks[i + 1][0] == "bold":
                out.append((toks[i + 1][1].rstrip(" :"), val))
        else:
            raise ValueError(layout)
    return out


FEATURED = re.compile(r'class="Featured-item"><a href="(?P<href>[^"]*)".*?data-bg="url\((?P<img>//[^)]+)\)".*?'
                      r'itemprop="name">(?P<name>.*?)</h3>', re.S)


def featured_cards(page: str) -> list[tuple[str, str, str]]:
    """[(name, photo url, section)] of the store page's Featured cards."""
    out = []
    for m in FEATURED.finditer(page):
        camp = re.search(r"utm_campaign=([A-Za-z]+)", htmllib.unescape(m.group("href")))
        out.append((text(m.group("name")), "https:" + htmllib.unescape(m.group("img")), (camp.group(1) if camp else "").lower()))
    if not out:
        raise SystemExit("the store page has no Featured cards: the page changed shape")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[tuple[str, str], list[dict]] = {}
    for it in items:
        by_key.setdefault((it["category"], item_key(it)), []).append(it)

    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str, str]] = {}      # item id -> (photo url, page url, the page's name for it)
    try:
        named: list[tuple[str, str, str, set]] = []    # (name, photo url, page url, categories)
        for url, layout, cats in SOURCES:
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for name, src in blog_photos(page, layout):
                named.append((name, src, url, cats))
        page = polite_get(STORE_PAGE, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        for name, src, section in featured_cards(page):
            named.append((name, src, STORE_PAGE, FEATURED_CATEGORIES.get(section, set())))
        print(f"{len(named)} named photos on {len(SOURCES)} pages and one store page")

        for name, src, page_url, cats in named:
            key = norm_name(name)
            hits = [(c, by_key[(c, key)]) for c in sorted(cats) if (c, key) in by_key]
            if not hits:
                continue
            for cat, its in hits:
                if len(its) > 1:
                    skipped.append(f"{name!r} on {page_url}: names {len(its)} items in {cat} ({', '.join(i['id'] for i in its)}): a family, no photo")
                    continue
                it = its[0]
                if it["id"] in matched:
                    continue
                if it["id"] in DROP_ITEMS:
                    skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                    continue
                if not src.startswith((BLOG_MEDIA, FEATURED_MEDIA, CORPORATE_MEDIA)):
                    skipped.append(f"{it['id']}: the photo {src} is not in the chain's blog media library or one of its own image CDNs")
                    continue
                matched[it["id"]] = (src, page_url, name)

        for item_id, (src, page_url, name) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:45} <- {name!r}  {src.rsplit('/', 1)[-1]}  ({page_url})")
                continue
            raw = polite_get(src, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {src}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:45} {fname}  <- {name!r} {src.rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
