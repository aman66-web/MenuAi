#!/usr/bin/env python3
"""Item photos for Pho from its own click-and-collect menu (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_pho.py --cache DIR [--dry-run] [--vietnamese-names]

Source: Pho's own ordering site, https://pho2go.phocafe.co.uk (the "Order Click & Collect" button on
https://www.phocafe.co.uk/pho-to-go/). Its menu page for one restaurant,
    https://pho2go.phocafe.co.uk/order/?type=collection&loc_id=80115          (Pho Baker Street)
is ONE plain GET (no cookies, no POST, no basket action) whose HTML embeds the whole menu as a JSON object
(`var Food_Online_Items = {"products":[...]}`): for each dish its title, calories_text and the <img> of its photo
(`image.src`, the 800 px version the dish's pop-up shows; for most dishes this is the file the chain uploaded). The page
shows exactly these tiles (title + photo). A second restaurant (Balham, loc_id=955) returned the identical 136 products,
so one location is enough. The www.phocafe.co.uk pages (menus, nutrition) carry only lifestyle photos and PDF menus, and
shop.phocafe.co.uk is a gift-card shop on a third-party platform: neither is used.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the feed's product title and the
item's name in the CURRENT data/source/pho/items.csv are equal under images_common.norm_name (case, accents, punctuation,
'&'/'and' and spacing ignored; words are never dropped, reordered or approximated, so "Crispy pork spring rolls" does NOT
match "Spring rolls - Pork (Chả giò)"). Further guards: a title shared by two products, a name shared by two items, a
product wanted by two items, a photo alt text that names something else, a photo that is not a wp-content upload, or a
photo listed in SKIP_FILES gets no photo. Dishes the ordering site does not list (the Vietnamese-named starters, summer
rolls, pho soups, ...) have none, and drinks/extras are not published items.

--vietnamese-names (OFF by default, a decision for the main session): the nutrition guide prints many dish names with a
Vietnamese name in brackets ("Chicken wings (Cánh gà)") while the ordering site prints only the English part ("Chicken
wings"). With this flag an item that has NO exact match is also tried with a trailing bracket removed, but only a bracket
that contains non-ASCII letters (a Vietnamese name such as "(Gỏi gà)"; "(with Green papaya salad)" is never removed). It
adds 18 items in the 2026-10-07 dry run, and for 17 of them the ordering site's calories equal our published calories to the kcal
(the 18th, Mango salad, 175 vs 160), which is independent evidence they are the same dishes.

Calories are printed for information only and are never used to match. For curries and rice bowls the ordering site's
figure is higher than ours because its dish includes the rice, which the guide lists separately (see data/source/pho/note.txt);
the photo is of the same dish as served.

Terms (https://www.phocafe.co.uk/terms-conditions/, read 2026-10-07; the ordering site shows no terms of its own, only "© Pho To Go 2022"):
"Intellectual Property: All content published and made available on our Site is the property of Pho Cafe and the Site's
creators. This includes, but is not limited to images, text, logos, documents, downloadable files and anything that contributes
to the composition of our Site." It claims ownership and does not use the words "permission" or "licence". Installed on the
founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (read 2026-10-07): www.phocafe.co.uk allows everything; pho2go.phocafe.co.uk disallows only /wp-content/uploads/wc-logs/,
/wp-content/uploads/woocommerce_transient_files/, /wp-content/uploads/woocommerce_uploads/, /wp-admin/ (except admin-ajax.php) and
?add-to-cart= URLs, and sets "Crawl-delay: 10", which this script honours (one request per 10 seconds to that host, so a full run
of N photos takes about 10 x (N + 1) seconds). The ordering pages carry <meta name="robots" content="noindex, nofollow">, which asks
search engines not to index them; it is not a robots.txt rule and the founder's decision covers the use.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "pho"
SITE = "https://pho2go.phocafe.co.uk"
PAGE_URL = f"{SITE}/order/?type=collection&loc_id=80115"   # Pho Baker Street's click-and-collect menu
CRAWL_DELAY = 10.0       # the host's robots.txt: "Crawl-delay: 10"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
UPLOADS = f"{SITE}/wp-content/uploads/"
SKIP_FILES: dict[str, str] = {}   # photo file name -> why it is not used (nutrition text, wrong dish, ...)


# ---------------------------------------------------------------- the menu feed

def feed_products(page: str) -> list[dict]:
    """The products of `var Food_Online_Items = {"products":[...]}` embedded in the order page."""
    i = page.find("var Food_Online_Items =")
    if i < 0:
        return []
    j = page.find("{", i)
    obj, _ = json.JSONDecoder().raw_decode(page[j:])
    prods = obj.get("products")
    return prods if isinstance(prods, list) else []


def product_photo(p: dict) -> tuple[str | None, str | None]:
    """(photo url, alt text) of the <img> the product's pop-up shows; url only if it is one of the chain's uploads."""
    tag = ((p.get("image") or {}).get("src")) or ""
    m = re.search(r'\ssrc="([^"]+)"', tag)
    if not m:
        return None, None
    url = html.unescape(m.group(1))
    alt = re.search(r'\salt="([^"]*)"', tag)
    if not (url.startswith(UPLOADS) and re.search(r"\.(?:png|jpe?g|webp)$", url, re.I)) or "placeholder" in url.lower():
        return None, None
    return url, (html.unescape(alt.group(1)) if alt else None)


def strip_vietnamese_bracket(name: str) -> str:
    """'Chicken wings (Cánh gà)' -> 'Chicken wings'; only a trailing bracket containing non-ASCII letters is removed."""
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", name)
    if m and any(ord(c) > 127 for c in m.group(2)):
        return m.group(1)
    return name


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for the page and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the menu page only; print the matches; store nothing")
    ap.add_argument("--vietnamese-names", action="store_true",
                    help="also match an item whose name has a trailing Vietnamese bracket to the product named without it")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    exact_count: dict[str, int] = {}
    for it in items:
        k = ic.norm_name(it["name"])
        exact_count[k] = exact_count.get(k, 0) + 1

    skipped: list[str] = []
    try:
        page = ic.polite_get(PAGE_URL, args.cache, delay=CRAWL_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
        products = feed_products(page)
        if not products:
            print(f"ERROR: no menu data (Food_Online_Items) on {PAGE_URL}: the site changed; nothing written", file=sys.stderr)
            return 1
        print(f"{len(products)} products in the menu feed on {PAGE_URL}")

        by_title: dict[str, list[dict]] = {}
        for p in products:
            by_title.setdefault(ic.norm_name(html.unescape(str(p.get("title", "")))), []).append(p)

        # item -> (product, how matched)
        wanted: dict[str, tuple[dict, str]] = {}
        for it in items:
            name = it["name"]
            key = ic.norm_name(name)
            how = "exact"
            if key not in by_title and args.vietnamese_names:
                stripped = strip_vietnamese_bracket(name)
                skey = ic.norm_name(stripped)
                if skey != key and skey in by_title:
                    if exact_count.get(skey):
                        skipped.append(f"{it['id']}: '{stripped}' is also the exact name of another published item")
                        continue
                    key, how = skey, "vietnamese-name bracket removed"
            if key not in by_title:
                continue
            if exact_count.get(ic.norm_name(name), 0) > 1:
                skipped.append(f"{it['id']}: {exact_count[ic.norm_name(name)]} published items share this name")
                continue
            prods = by_title[key]
            if len(prods) != 1:
                skipped.append(f"{it['id']}: {len(prods)} products titled {prods[0]['title']!r}")
                continue
            wanted[it["id"]] = (prods[0], how)

        # a product wanted by two items is ambiguous
        claims: dict[str, list[str]] = {}
        for item_id, (p, _) in wanted.items():
            claims.setdefault(str(p["id"]), []).append(item_id)

        found: dict[str, tuple[str, str, dict, str]] = {}   # item id -> (photo url, how, product, item name)
        by_id = {it["id"]: it for it in items}
        for item_id, (p, how) in sorted(wanted.items()):
            if len(claims[str(p["id"])]) > 1:
                skipped.append(f"{item_id}: product {p['title']!r} is wanted by {len(claims[str(p['id'])])} items")
                continue
            photo, alt = product_photo(p)
            if not photo:
                skipped.append(f"{item_id}: product {p['title']!r} has no usable photo")
                continue
            if alt and ic.norm_name(alt) != ic.norm_name(html.unescape(p["title"])):
                skipped.append(f"{item_id}: photo is captioned {alt!r}, not {p['title']!r}")
                continue
            fname = photo.rsplit("/", 1)[-1]
            if fname in SKIP_FILES:
                skipped.append(f"{item_id}: {fname} skipped: {SKIP_FILES[fname]}")
                continue
            found[item_id] = (photo, how, p, by_id[item_id]["name"])

        rows: dict[str, tuple[str, str]] = {}
        for item_id, (photo, how, p, item_name) in sorted(found.items()):
            kcal = f"item {by_id[item_id]['calories']} kcal / feed {p.get('calories_text') or 'none'}"
            if args.dry_run:
                print(f"{item_id}\n    item:    {item_name}\n    product: {html.unescape(p['title'])}  [{how}]  ({kcal})\n"
                      f"    photo:   {photo}\n    page:    {PAGE_URL}")
                continue
            try:
                raw = ic.polite_get(photo, args.cache, delay=CRAWL_DELAY, referer=PAGE_URL)
                rows[item_id] = (ic.store_image(CHAIN, raw), PAGE_URL)
                print(f"  {item_id:58} {rows[item_id][0]}  <- {photo}")
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for s in skipped:
        print("skip:", s)
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
        print(f"CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
