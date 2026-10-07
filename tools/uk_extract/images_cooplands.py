#!/usr/bin/env python3
"""Item photos for Cooplands from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_cooplands.py [--cache DIR] [--dry-run]

Source: https://cooplands-bakery.co.uk/ (the chain's own WooCommerce shop; the nutrition data came from the PDF it links
from /nutrition-and-allergen-information/). Each "Our Food" category page (/our-food/<category>/) lists product cards:
<a href="/our-products/<slug>/" class="card-product__link"> ... <img alt="<name>"> ... <h3 class="card-product__title"><name></h3>.
Each product page (/our-products/<slug>/) carries a schema.org Product record (JSON-LD) with the product's "name" and its
"image" (the ORIGINAL upload under /wp-content/uploads/, the same file the page's og:image names). The cards show only
WordPress's pre-cropped thumbnails (<name>-440x440.png), so we fetch the original upload named by the product page, and
store_image does the only change (downsize to <= 640 px, WebP). Nothing is cropped by us.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when ALL of these hold:
  1. exactly one product card on the category pages is titled with the item's name (images_common.norm_name equality
     with the item's name in the CURRENT items.csv) and the card's own photo alt text says the same;
  2. that product page's visible title (<h1>) equals the item's name too, and so does its schema.org Product "name" when
     the page has one (some pages have none);
  3. the page's og:image is the featured photo, the card's thumbnail is a size of that same upload, and so is the page's
     schema.org Product "image" when present;
  4. when the product page prints a "Nutritional summary", its numbers (kcal, protein, carbohydrate, fat: every one that
     can be read) agree with the item's published numbers (grams within 0.7, kcal within 2). The site sometimes gives
     two different products the same name (its "Ham Salad" is a sandwich with 437 kcal; the published "Ham Salad" is a
     192 kcal salad), so a name alone is not enough where the page lets us check. A page with no nutritional summary is
     matched on its name alone and is printed as such. (The pages' hidden SEO titles are free text and not used.)
The site often names a product differently from the nutrition guide ("Cheese Savoury" vs "Cheese Savoury Sub",
"Cheese Straw" vs "Cheese Straws", "Chocolate Brownie" vs "Brownie", "Parkin Biscuits (4 Pk)" vs "Parkin Biscuit (from 6
pack)"): those get no photo, we never match by slug, file name, plural/singular or similarity. A name shared by two
published items or by two cards gets no photo; a photo file used by two different items (a shared/generic picture) is
dropped for all of them. The card titled "Small Curd Tart" links to the "Small Custard Tart" page, so it gets no photo.
Seasonal Christmas lines, bread, platters and celebration cakes have no published item.

Terms and robots (read 2026-10-07):
  * https://cooplands-bakery.co.uk/termsandconditions/ is the online-ordering terms; it has no clause about images, photos,
    copyright or reuse of the site's content (searched for image, photo, copyright, intellectual, reproduc, licen, copy,
    material, content). The privacy policy is not about content either.
  * robots.txt: "User-agent: *" disallows only /wp-content/uploads/wc-logs/, /woocommerce_transient_files/,
    /woocommerce_uploads/, add-to-cart URLs and /wp-admin/ (except admin-ajax.php), and sets "Crawl-delay: 10". We
    honour the crawl delay: ONE request per 10 seconds to the host (CRAWL_DELAY below), and polite_get checks robots.txt
    on every URL. The photos are on the same host (/wp-content/uploads/), which robots.txt allows.
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "cooplands"
BASE = "https://cooplands-bakery.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
CRAWL_DELAY = 10.0   # robots.txt: "Crawl-delay: 10"
DEFAULT_CACHE = Path("/tmp/menumacros-images-cooplands")
# The nine "Our Food" categories of the shop menu (each is one page of product cards, no pagination).
CATEGORIES = ["sandwiches-salads", "savoury-bakes", "breakfast", "autumn", "sweet-treats",
              "bread-rolls", "celebration-cakes", "sandwich-platters", "personalised-cakes"]

CARD = re.compile(
    r'<a href="(?P<href>https://cooplands-bakery\.co\.uk/our-products/[a-z0-9-]+/)" class="card-product__link">'
    r'(?P<body>.*?)</a>', re.S)
CARD_TITLE = re.compile(r'<h3 class="card-product__title">\s*(?P<t>.*?)\s*</h3>', re.S)
CARD_IMG = re.compile(r'<img[^>]*\bclass="attachment-card[^"]*"[^>]*\balt="(?P<alt>[^"]*)"[^>]*>', re.S)
CARD_THUMB = re.compile(r'<noscript><img[^>]*\bsrc="(?P<src>[^"]+)"', re.S)
OG_IMAGE = re.compile(r'<meta property="og:image" content="([^"]+)"')
OG_TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')
H1 = re.compile(r'<h1 class="product_title entry-title">(.*?)</h1>', re.S)
GALLERY = re.compile(r'<noscript><img[^>]*\bsrc="([^"]+)"[^>]*\bclass="wp-post-image"', re.S)
JSON_LD = re.compile(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
UPLOADS = re.compile(r"^https://cooplands-bakery\.co\.uk/wp-content/uploads/[^\s?#]+\.(?:png|jpe?g|webp)$", re.I)
SIZE_SUFFIX = re.compile(r"-\d+x\d+(?=\.[A-Za-z]+$)")


def full_size(url: str) -> str:
    """The upload a WordPress thumbnail URL is a size of: ...-440x440.png -> ....png (the same file, unsized)."""
    return SIZE_SUFFIX.sub("", html.unescape(url))


def parse_cards(page: str, category: str) -> list[dict]:
    cards = []
    for m in CARD.finditer(page):
        body = m.group("body")
        t = CARD_TITLE.search(body)
        img = CARD_IMG.search(body)
        thumb = CARD_THUMB.search(body)
        if not t or not img or not thumb:
            continue
        cards.append({
            "url": m.group("href"),
            "title": html.unescape(t.group("t")).strip(),
            "alt": html.unescape(img.group("alt")).strip(),
            "thumb": full_size(thumb.group("src")),
            "category": category,
        })
    return cards


def clean(text: str) -> str:
    """HTML-unescape until stable (the site double-escapes some names: "Cheese &amp;amp; Onion Pasty") and trim."""
    prev = None
    while prev != text:
        prev, text = text, html.unescape(text)
    return text.strip()


def product_record(page: str) -> dict | None:
    """What a product page says about itself: its visible <h1> title, og:image / og:title, the gallery's photos, the
    schema.org Product record when there is one ('ld_name', 'ld_image'), and its nutritional summary (or None)."""
    h1 = H1.search(page)
    if not h1:
        return None
    og, ogt = OG_IMAGE.search(page), OG_TITLE.search(page)
    rec = {
        "h1": clean(h1.group(1)),
        "og": clean(og.group(1)) if og else None,
        "og_title": re.sub(r"\s+-\s+Cooplands Bakery$", "", clean(ogt.group(1))) if ogt else None,
        "gallery": sorted({full_size(g) for g in GALLERY.findall(page)}),
        "ld_name": None, "ld_image": None,
        "nutrition": page_nutrition(page),
    }
    for m in JSON_LD.finditer(page):
        try:
            data = json.loads(m.group(1))
        except ValueError:
            continue
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else data
        for n in nodes if isinstance(nodes, list) else []:
            if isinstance(n, dict) and n.get("@type") == "Product":
                img = n.get("image")
                if isinstance(img, list):
                    img = img[0] if len(img) == 1 else None
                if isinstance(img, dict):
                    img = img.get("url")
                rec["ld_name"] = re.sub(r"\s+-\s+Cooplands Bakery$", "", clean(str(n.get("name", ""))))
                rec["ld_image"] = clean(img) if isinstance(img, str) else None
    return rec


NUM = r"(\d+(?:\.\d+)?)"


def page_nutrition(page: str) -> dict | None:
    """The numbers of the page's "Nutritional summary" tab: {'calories', 'protein_g', 'carbs_g', 'fat_g'} (only those that
    can be read; the site prints "Energy Array" for one product), or None when the page has no such tab."""
    i = page.find("Nutritional summary")
    if i < 0:
        return None
    j = page.find("We have numerous control measures", i)
    text = clean(re.sub(r"<[^>]+>", " ", page[i: j if j > 0 else i + 4000]))
    text = re.sub(r"\s+", " ", text)
    out: dict[str, float] = {}
    for key, pat in (("calories", NUM + r"\s*kcals?\b"),
                     ("protein_g", r"\bProtein(?:\s*/\s*portion)?\s+" + NUM + r"\s*g\b"),
                     ("carbs_g", r"\bCarbohydrates?(?:\s*/\s*portion)?\s+" + NUM + r"\s*g\b"),
                     ("fat_g", r"(?<![\w-])Fat(?:\s*/\s*portion)?\s+" + NUM + r"\s*g\b")):
        m = re.search(pat, text, re.I)
        if m:
            out[key] = float(m.group(1))
    return out


def nutrition_disagreements(page_nut: dict, item: dict) -> tuple[list[str], int]:
    """(names of the numbers that differ, how many numbers could be compared) between the page's summary and the item."""
    bad, compared = [], 0
    for key, tol in (("calories", 2.0), ("protein_g", 0.7), ("carbs_g", 0.7), ("fat_g", 0.7)):
        if key not in page_nut or not str(item.get(key, "")).strip():
            continue
        compared += 1
        if abs(page_nut[key] - float(item[key])) > tol:
            bad.append(f"{key} page {page_nut[key]:g} vs item {float(item[key]):g}")
    return bad, compared


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    def get(url: str, **kw) -> bytes:
        return polite_get(url, args.cache, delay=CRAWL_DELAY, **kw)

    skipped: list[str] = []
    matched: dict[str, dict] = {}   # item id -> {item, page_url, photo}
    try:
        cards_by_key: dict[str, list[dict]] = {}
        for cat in CATEGORIES:
            page = get(f"{BASE}/our-food/{cat}/", accept=HTML_ACCEPT).decode("utf-8")
            for c in parse_cards(page, cat):
                cards_by_key.setdefault(norm_name(c["title"]), []).append(c)
        n_cards = sum(len(v) for v in cards_by_key.values())
        print(f"{n_cards} product cards on {len(CATEGORIES)} category pages")

        for key, its in sorted(by_key.items()):
            found = cards_by_key.get(key, [])
            if not found:
                continue            # the site has no product of exactly this name: nothing to report per item
            if len(its) != 1:
                skipped.append(f"{key}: {len(its)} items share this name")
                continue
            item = its[0]
            if len({c["url"] for c in found}) != 1:
                skipped.append(f"{item['id']}: {len(found)} product pages titled {item['name']!r}")
                continue
            card = found[0]
            if norm_name(card["alt"]) != key:
                skipped.append(f"{item['id']}: card photo is captioned {card['alt']!r}, not {item['name']!r}")
                continue
            page = get(card["url"], accept=HTML_ACCEPT).decode("utf-8")
            rec = product_record(page)
            if rec is None:
                skipped.append(f"{item['id']}: no product title on {card['url']}")
                continue
            if norm_name(rec["h1"]) != key:
                skipped.append(f"{item['id']}: card {card['title']!r} links to the page of {rec['h1']!r}")
                continue
            if rec["ld_name"] is not None and norm_name(rec["ld_name"]) != key:
                skipped.append(f"{item['id']}: page schema.org name is {rec['ld_name']!r}, not {item['name']!r}")
                continue
            photo = rec["og"]
            if not photo or not UPLOADS.match(photo):
                skipped.append(f"{item['id']}: product page has no usable featured photo ({photo!r})")
                continue
            if card["thumb"] != photo:
                skipped.append(f"{item['id']}: card photo {card['thumb']} differs from the page photo {photo}")
                continue
            if rec["ld_image"] is not None and rec["ld_image"] != photo:
                skipped.append(f"{item['id']}: schema.org image {rec['ld_image']} differs from og:image {photo}")
                continue
            if rec["gallery"] and photo not in rec["gallery"]:
                skipped.append(f"{item['id']}: og:image {photo} is not the page's gallery photo {rec['gallery']}")
                continue
            notes: list[str] = []
            compared = 0
            if rec["nutrition"] is None:
                notes.append("no nutritional summary on the page: matched on name only")
            else:
                bad, compared = nutrition_disagreements(rec["nutrition"], item)
                if bad:
                    skipped.append(f"{item['id']}: the page's own nutrition differs from the published item ({'; '.join(bad)}): "
                                   f"a different product with the same name")
                    continue
                if compared < 2:
                    skipped.append(f"{item['id']}: the page's nutritional summary can't be read well enough to check ({rec['nutrition']})")
                    continue
                notes.append(f"nutrition agrees on {compared} numbers")
            if rec["og_title"] and not set(key.split()) & set(norm_name(rec["og_title"]).split()):
                # the page's hidden SEO title is free text (often a variant like "Chocolate Muffin"): not used for matching,
                # but one that shares no word with the item is worth a look at the photo
                notes.append(f"CHECK BY EYE: the page's hidden SEO title is unrelated ({rec['og_title']!r})")
            matched[item["id"]] = {"item": item, "page_url": card["url"], "photo": photo, "notes": notes}

        # a photo file used by two or more different items is a shared/generic picture: attach it to none of them
        users: dict[str, list[str]] = {}
        for iid, m in matched.items():
            users.setdefault(m["photo"], []).append(iid)
        for photo, ids in users.items():
            if len(ids) > 1:
                for iid in ids:
                    skipped.append(f"{iid}: photo {photo} is also used by {', '.join(i for i in ids if i != iid)}")
                    del matched[iid]

        rows: dict[str, tuple[str, str]] = {}
        for iid, m in sorted(matched.items()):
            if args.dry_run:
                print(f"  {iid:36} {m['item']['name']:32} {m['photo']}  <- {m['page_url']}  [{'; '.join(m['notes'])}]")
                continue
            raw = get(m["photo"], referer=m["page_url"])
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{iid}: {m['photo']}: {e}")
                continue
            rows[iid] = (fname, m["page_url"])
            print(f"  {iid:36} {fname}  <- {m['photo']}")
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
