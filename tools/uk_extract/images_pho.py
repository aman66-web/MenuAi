#!/usr/bin/env python3
"""Item photos for Pho from its own click-and-collect menu (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_pho.py --cache DIR [--dry-run] [--exact-only]

Source: Pho's own ordering site, https://pho2go.phocafe.co.uk (the "Order Click & Collect" button on
https://www.phocafe.co.uk/pho-to-go/). Its menu page for one restaurant,
    https://pho2go.phocafe.co.uk/order/?type=collection&loc_id=80115          (Pho Baker Street)
is ONE plain GET (no cookies, no POST, no basket action) whose HTML embeds the whole menu as a JSON object
(`var Food_Online_Items = {"products":[...]}`): for each dish its title, calories_text and the <img> of its photo
(`image.src`, the 800 px version the dish's pop-up shows; for most dishes this is the file the chain uploaded). The page
shows exactly these tiles (title + photo). A second restaurant (Balham, loc_id=955) returned the identical 136 products,
so one location is enough. The www.phocafe.co.uk pages carry only lifestyle photos and PDF menus (re-checked 2026-11-17:
/menus/ shows people, tables and interiors, no photo named for a dish, and links the PDF menus and guides), and
shop.phocafe.co.uk is a gift-card shop on a third-party platform: neither is used.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the feed's product title and the
item's name in the CURRENT data/source/pho/items.csv are equal under images_common.norm_name (case, accents, punctuation,
'&'/'and' and spacing ignored; words are never dropped, reordered or approximated, so "Crispy pork spring rolls" does NOT
match "Spring rolls - Pork (Chả giò)", "Chicken summer rolls" does NOT match "Summer rolls - Chicken (Gỏi cuốn)" and "Pho king
prawn" does NOT match "King prawns (Phở tôm)"). Before comparing, a trademark sign in the feed's title is removed ("THIS™ isn't
chicken" -> "THIS isn't chicken"; norm_name would otherwise read the sign as the letters "tm"): a symbol, not a word. Two
narrow, deterministic readings of the guide's own names are also used (on by default since 2026-11-17; --exact-only turns
both off):
  (a) Vietnamese name in brackets. The nutrition guide prints many dish names with the dish's Vietnamese name in brackets
      ("Chicken wings (Cánh gà)") while the ordering site prints only the English part ("Chicken wings"). An item with NO
      exact match is tried with a trailing bracket removed, but only a bracket that contains non-ASCII letters (a Vietnamese
      name such as "(Gỏi gà)"; "(with Green papaya salad)" is never removed), and only if the English part is not itself the
      exact name of another published item. The English words must then be equal; nothing else is dropped.
  (b) The "Phở" section heading. Every other section of the guide is named heading-then-row in our items ("Classic curry -
      Chicken", "Rice bowl - Tofu & veg"); the phở rows were kept as the bare row ("Chicken (Phở gà)") because the
      Vietnamese name already says phở. For an item in the category "Phở" only, the heading is put in front in that same
      order ("Phở" + "Chicken" -> "Pho chicken") and must equal the feed's title exactly, AND the ordering site's calories
      must equal our published calories to the kcal (a guard that can only remove a match, never make one).
Further guards: a title shared by two products, a name shared by two items, a product wanted by two items, a photo alt
text that names something else, a photo that is not a wp-content upload, or a photo listed in SKIP_FILES gets no photo.
Dishes the ordering site names differently (the starters, summer rolls, curry noodle soups, green papaya salads, Spicy
Green, the bún dishes, ...) have none, and drinks/extras are not published items.

Run of 2026-11-17: 136 products in the feed, 42 of 96 published items have a photo (was 15): 17 exact (the 15 of 2026-10-07 plus
Classic curry and Spicy curry "THIS isn't chicken", equal once the trademark sign is removed), 21 by (a) (3 of them also needed the
trademark sign removed: the "THIS isn't chicken" hot & spicy soup, wok fried noodles and wok fried rice) and 4 by (b) (Beef brisket,
Chicken, Tofu & button mushrooms, 3 Mushrooms phở; calories equal to the kcal). For 38 of the 42 the ordering site's calories equal
ours or are exactly 370 kcal higher (the rice the curries and rice bowls are served with, which the guide lists separately: see
below); the 4 others are the same names with other figures: Classic curry - King prawn (969 vs 464), Mango salad (175 vs 160),
Super Green (381 vs 399) and Grilled bún - 3 meat combo (512 vs 550). All 42 photos were looked at on contact sheets (studio
cut-outs of the dish named, on white; no writing, sticker, logo or placeholder; no two items share a file): none left out, so
SKIP_FILES is empty. Not matched because the ordering site words them differently (left without a photo on purpose; the
calories of most are equal, but the rule is the name): the spring and summer rolls ("Crispy pork spring rolls", "Chicken summer
rolls"...), King prawns phở ("Pho king prawn", singular), Steak with garlic ("Pho garlic steak (Hanoi style)"), the curry noodle
soups ("Chicken curry noodle soup"...), Spicy curry - Chicken / King prawn ("Spicy chicken curry", "Spicy curry prawn"), the
green papaya salads ("Chicken green papaya salad"...), Prawn & pomelo salad ("Prawn Pomelo Salad"), THIS isn't chicken salad
("THIS isn't Chicken veggie salad"), Spicy Green ("'Spicy Green' with chicken"), Rice bowl - Beef in betel leaf ("Rice bowl
crispy beef in betel leaf"), the bún dishes ("Vermicelli noodles beef", "Grilled bun chicken"...), the crackers (the guide's
rows include the sweet chilli sauce) and the sauces ("Extra peanut sauce"...). Not on the ordering site at all: baby squid,
beef betel, the Vietnamese pancakes, steak / beef combo phở, brisket & mushroom, crab noodle soup, broken rice, add-ons.

Calories are printed for information and used only as the guard in (b), never to make a match. For curries and rice bowls
the ordering site's figure is higher than ours because its dish includes the rice, which the guide lists separately (see
data/source/pho/note.txt); the photo is of the same dish as served.

Terms (https://www.phocafe.co.uk/terms-conditions/, read 2026-10-07 and again 2026-11-17, unchanged; the ordering site shows no terms of its own, only "© Pho To Go 2022"):
"Intellectual Property: All content published and made available on our Site is the property of Pho Cafe and the Site's
creators. This includes, but is not limited to images, text, logos, documents, downloadable files and anything that contributes
to the composition of our Site." It claims ownership and does not use the words "permission" or "licence". Installed on the
founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (read 2026-10-07 and again 2026-11-17, unchanged): www.phocafe.co.uk allows everything; pho2go.phocafe.co.uk disallows only /wp-content/uploads/wc-logs/,
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
PHO_SECTION = "Phở"      # the guide's section heading whose rows are kept without it in items.csv (rule (b))
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


def clean_title(title: str) -> str:
    """The feed's title with HTML entities decoded and a trademark sign removed ("THIS™ isn't" -> "THIS isn't"):
    norm_name would read "™" (NFKD "TM") or "(tm)" as letters. A symbol, not a word: nothing else is changed."""
    t = html.unescape(str(title))
    t = re.sub(r"\((?:tm|TM|Tm)\)", " ", t)
    return t.replace("\u2122", " ").replace("\u00ae", " ")


def kcal_number(text: str | None) -> float | None:
    """'397kcal' -> 397.0; anything else -> None."""
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*kcal\s*", str(text or ""), re.I)
    return float(m.group(1)) if m else None


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
    ap.add_argument("--exact-only", action="store_true",
                    help="turn off rules (a) and (b): match only names that are equal as printed (trademark sign removed)")
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
            by_title.setdefault(ic.norm_name(clean_title(p.get("title", ""))), []).append(p)

        # item -> (product, how matched)
        wanted: dict[str, tuple[dict, str]] = {}
        for it in items:
            name = it["name"]
            key = ic.norm_name(name)
            how = "exact"
            stripped = strip_vietnamese_bracket(name)
            if key not in by_title and not args.exact_only:
                skey = ic.norm_name(stripped)
                if skey != key and skey in by_title:   # rule (a)
                    if exact_count.get(skey):
                        skipped.append(f"{it['id']}: '{stripped}' is also the exact name of another published item")
                        continue
                    key, how = skey, "(a) vietnamese-name bracket removed"
            if key not in by_title and not args.exact_only and it.get("category") == PHO_SECTION:
                ckey = ic.norm_name(f"{PHO_SECTION} {stripped}")   # rule (b): heading then row, as in every other section
                if ckey in by_title:
                    if exact_count.get(ckey):
                        skipped.append(f"{it['id']}: '{PHO_SECTION} {stripped}' is also the exact name of another published item")
                        continue
                    prods_b = by_title[ckey]
                    feed_kcal = kcal_number(prods_b[0].get("calories_text")) if len(prods_b) == 1 else None
                    try:
                        ours = float(it["calories"])
                    except (TypeError, ValueError):
                        ours = None
                    if feed_kcal is None or ours is None or feed_kcal != ours:
                        skipped.append(f"{it['id']}: '{PHO_SECTION} {stripped}' = {prods_b[0]['title']!r} by name, but the calories "
                                       f"differ ({it['calories']} vs {prods_b[0].get('calories_text')}): rule (b) needs them equal")
                        continue
                    key, how = ckey, "(b) section heading 'Phở' in front, calories equal"
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
            if alt and ic.norm_name(clean_title(alt)) != ic.norm_name(clean_title(p["title"])):
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
