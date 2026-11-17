#!/usr/bin/env python3
"""Item photos for PizzaExpress from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_pizza_express.py --cache DIR [--dry-run]

TWO ROUTES. Only route B is used today (2026-11-17); route A is checked on every run and stays closed while its photo host's robots.txt disallows it.

Route A, the menu (NOT USED: robots.txt). https://www.pizzaexpress.com/restaurant-menu (the chain's "Menu" page, server-rendered) shows every dish as a card
`<div ... data-product-key="<name>-<n>"> <img src="/_next/image?url=<photo url>&w=..."> <h4>NAME</h4> <p>NNN kcal</p>`, and the JSON its ordering page
draws from (https://mobile-pay.pizzaexpress.com/api/Menu/GetGlobalMenu, read with pizza_express_html.records(), the reader the dishes were extracted with)
gives every dish record its own `image`. Both point at files on https://izoneapps-cdn.zonalconnect.com/uploads/... (Zonal, the chain's ordering platform).
136 of the 176 published dishes have such a photo by an exact name and their own record (the rule below). BUT that host's robots.txt answers HTTP 308 to
https://izoneapps.zonalconnect.com/robots.txt, which reads "User-Agent: * / Disallow: /". RFC 9309 section 2.3.1.2: a robots.txt reached through up to
five redirects "MUST be fetched, parsed, and its rules followed in the context of the initial authority", so the photo host disallows everything and
nothing is fetched from it. (images_common._robots_allow reads a 308 on robots.txt as "no rules", because Python 3.9's urllib does not follow 308: this
script checks every host itself with redirects followed, see robots_with_redirects, before polite_get is called. On the first run, before this check
existed, one photo request reached izoneapps-cdn and failed with HTTP 504; nothing was received or stored.) The www page also serves the same photos
through its own resizer (https://www.pizzaexpress.com/_next/image?url=..., which www's robots.txt does not disallow); that is the same photo fetched
by another host, so it is NOT used without the founder's say-so. Route A runs in "count only" mode and prints what it would match.

Route B, the chain's own content pages (USED). Pages on www.pizzaexpress.com whose photos sit on the chain's own image CDN content-cdn.pizzaexpress.com:
  https://www.pizzaexpress.com/festive-lunch/menu  (the festive set-lunch menu: a card per dish, `<div style="background-image:url(PHOTO)..."></div>
                                                    <div ...><h3>NAME</h3>`, under section headings <h2>Classic Pizzas</h2>, <h2>Salads</h2>, <h2>Drinks</h2>...)
  https://www.pizzaexpress.com/whats-cooking/the-ultimate-pizzaexpress-protein-guide  (an article: one <section> per dish, the photo then <h2>NAME</h2>)
The other pages in https://www.pizzaexpress.com/sitemap.xml (all but the terms-and-conditions, careers, investors, partnerships, press, booking, wifi
and help pages) were read once (2026-11-17) for headings naming a published dish: the only other hits were /make-your-own/recipes (a make-it-at-home
recipe) and /cook-at-home/full-range (supermarket products), which are not the restaurant's dishes.
A card's photo URL is the original file on content-cdn (the Sanity image CDN): any ?rect=...&w=...&fit=crop transform the page adds is dropped, so the
file is the uncropped original; store_image only resizes it.

Match rule (exact, nothing fuzzy). A photo is attached to a published item (items.csv minus holdback.csv) only when
  1. a card's heading, with a drink's " - NNNml" ending removed as pizza_express_html.py does, has the same norm_name as the item
     ("Romana Pollo ad Astra" is not "Pollo ad Astra"; "Warm Roasted Veg & Chicken Bowl (GF)" is not "Warm Roasted Veg & Chicken Bowl"),
  2. the photo and the heading are in the same card (the photo block is immediately followed by the block whose first element is that heading),
  3. for a pizza, the page's section heading does not name a different pizza range than the item's own category (the festive menu's "Smoky BBQ
     Chicken" under "Classic Pizzas" is a Classic, our dish is the Romana; its "Giardiniera" and "Pollo ad Astra" under "Leggera Pizzas" are the
     Leggera versions, ours of that name are Romanas),
  4. no other card on these pages names the item with a different photo,
  5. the item is not in DROP_ITEMS (photos left out after looking at them).
The source_url of a row is the page that shows that card.

robots.txt (read 2026-11-17, redirects followed): https://www.pizzaexpress.com/robots.txt, one group `User-Agent: *`, Disallow /book/, /offers/*/claim,
/offers/*/ready, /enquiry/confirmed/ only (the pages above are allowed); https://content-cdn.pizzaexpress.com/robots.txt, `User-agent: *`, Allow
/files/cgnmnbqj/, Disallow /*.pdf and /*.PDF (the /images/ photos are allowed); https://mobile-pay.pizzaexpress.com/robots.txt does not exist (the host
answers with its HTML app shell, which holds no rules); izoneapps-cdn.zonalconnect.com: 308 to izoneapps.zonalconnect.com/robots.txt, Disallow: / (above).
Terms (https://www.pizzaexpress.com/terms-of-use, section 7 "Intellectual Property", read 2026-11-17): 7.1 "You may access, view and print out one copy of
this Website and all information, images, and other content displayed on the Website ("Materials") strictly in accordance with these Terms of Use."
7.2 "You may only view, print out, use, quote from and cite the Website and the Materials for your own personal, non-commercial use ... You must not: ...
c) reproduce, modify, display, perform, publish, distribute, disseminate, broadcast, frame, communicate to the public or circulate to any third party or
exploit this Website and/or the Materials for any commercial purpose, without our prior written consent." An express restriction; installed on the
founder's decision of 2026-10-06 (his accepted risk). A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Not on the chain's menu any more on 2026-11-17 (no page shows a photo for them): Dough Balls Al Forno, Buttermilk Ranch Slaw, Meatball Italiano,
Moroccan Chicken, Diavolo XX Hot and their gluten-free versions, The Mossy Bottom Meltdown (checked at all 7 restaurants pizza_express_html.py reads).
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pizza_express_html  # noqa: E402  (records(): the same reader the dishes came from)
import robots_rfc  # noqa: E402
from images_common import (  # noqa: E402
    UA, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "pizza-express"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
JSON_ACCEPT = "application/json, text/plain, */*"
DEFAULT_CACHE = Path("/tmp/menumacros-images-pizza-express")
ML_SUFFIX = re.compile(r"\s+-\s+(\d+\s?ml)$")

# route A (count only while its photo host disallows us)
WWW_MENU = "https://www.pizzaexpress.com/restaurant-menu"
JSON_MENU = "https://mobile-pay.pizzaexpress.com/api/Menu/GetGlobalMenu"
ZONAL_PREFIX = "https://izoneapps-cdn.zonalconnect.com/uploads/"

# route B
PAGES = [
    "https://www.pizzaexpress.com/festive-lunch/menu",
    "https://www.pizzaexpress.com/whats-cooking/the-ultimate-pizzaexpress-protein-guide",
]
PHOTO_PREFIX = "https://content-cdn.pizzaexpress.com/images/"
PIZZA_RANGES = {"classic pizzas", "romana pizzas", "leggera pizzas", "gluten free pizzas"}

# Looked at on contact sheets after the first run (2026-11-17) and left without a photo; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {
    # a third-party brand's can is the subject of the picture (the same kind as the Pepsi Max picture left out on 2026-10-07)
    "diet-coke": "a Diet Coke can stands beside the glass: a third-party brand's pack, not a plain photo of the drink",
    "fanta": "a Fanta can stands beside the glass: a third-party brand's pack, not a plain photo of the drink",
    "peroni-0-0-sicilian-lemon-abv-0": "a Peroni 0.0 can stands beside the glass: a third-party brand's pack, not a plain photo of the drink",
    # probably another dish: the protein guide's picture shows white cheese crumbles and a creamy dressing pot, like the chain's own photo of the
    # Goat's Cheese & Beetroot Buddha Bowl (festive-lunch/menu); the Vegan Buddha Bowl's description has houmous and no cheese
    "vegan-buddha-bowl": "the picture shows cheese crumbles and a dressing pot like the Goat's Cheese & Beetroot Buddha Bowl: probably not the vegan dish",
}

CARD = re.compile(r'background-image:url\(([^)]+)\);background-position:center"></div><div[^>]*><h([23])[^>]*>(.*?)</h\2>', re.S)
H2 = re.compile(r"<h2[^>]*>(.*?)</h2>", re.S)


# ---------------------------------------------------------------- robots.txt with redirects followed (RFC 9309 2.3.1.2)
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None   # hand every 3xx back as an HTTPError so the loop below follows it (Python 3.9 does not follow 308 at all)


_opener = urllib.request.build_opener(_NoRedirect)
_verdicts: dict[str, list] = {}


def robots_with_redirects(url: str) -> None:
    """Raise Blocked unless the robots.txt of `url`'s host, reached through at most five redirects, allows `url`. 4xx = no rules; 401/429/5xx and an
    unreadable file = do not fetch (the same reading as images_common, plus the redirects it cannot follow). One request a second."""
    u = urllib.parse.urlsplit(url)
    origin = f"{u.scheme}://{u.netloc}"
    if origin not in _verdicts:
        target, rules = f"{origin}/robots.txt", None
        for _ in range(6):
            time.sleep(1.1)
            try:
                with _opener.open(urllib.request.Request(target, headers={"User-Agent": UA}), timeout=20) as r:
                    rules = robots_rfc.parse(r.read().decode("utf-8", "replace"))
                break
            except urllib.error.HTTPError as e:
                if 300 <= e.code < 400 and e.headers.get("Location"):
                    target = urllib.parse.urljoin(target, e.headers["Location"])
                    continue
                rules = [("disallow", "/")] if e.code in (401, 429) or e.code >= 500 else []
                break
            except Exception as e:  # unreadable: RFC 9309 2.3.1.4, assume complete disallow
                raise Blocked(f"robots.txt of {origin} could not be read ({type(e).__name__}: {e}): not fetched") from e
        if rules is None:
            raise Blocked(f"robots.txt of {origin}: more than five redirects: treated as unavailable, not fetched")
        if target != f"{origin}/robots.txt":
            print(f"  robots.txt of {origin} redirects to {target}: its rules apply to {origin} (RFC 9309 2.3.1.2)")
        _verdicts[origin] = rules
    if not robots_rfc.allowed(_verdicts[origin], u.path + ("?" + u.query if u.query else "")):
        raise Blocked(f"robots.txt (redirects followed) disallows {url}")


def get(url: str, cache: Path, **kw) -> bytes:
    robots_with_redirects(url)
    return polite_get(url, cache, **kw)


# ---------------------------------------------------------------- route A: count only
def route_a_count(items: list[dict], cache: Path) -> None:
    page = get(WWW_MENU, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    shown: dict[str, set[str]] = {}
    for m in re.finditer(r'data-product-key="[^"]*"(.*?)(?=data-product-key="|\Z)', page, re.S):
        name = re.search(r"<h4[^>]*>(.*?)</h4>", m.group(1), re.S)
        img = re.search(r'src="/_next/image\?url=([^&"]+)', m.group(1))
        if name and img:
            key = norm_name(ML_SUFFIX.sub("", htmllib.unescape(re.sub(r"<[^>]+>", "", name.group(1))).strip()))
            shown.setdefault(key, set()).add(urllib.parse.unquote(htmllib.unescape(img.group(1))))
    menu = json.loads(get(JSON_MENU, cache, accept=JSON_ACCEPT))

    def walk(cats):
        for c in cats:
            yield from c.get("menuItems") or []
            yield from walk(c.get("menuCategories") or [])
    by_id = {it["id"]: it for it in walk(menu["data"]["menuCategories"])}
    dish: dict[str, set[str]] = {}
    for (kind, rid, _), r in pizza_express_html.records(menu)["recs"].items():
        if kind == "dish":
            dish.setdefault(norm_name(r["name"]), set()).add(rid)
    would = []
    for it in items:
        ids = dish.get(norm_name(it["name"]), set())
        src = (by_id[next(iter(ids))].get("image") or "") if len(ids) == 1 else ""
        if src.startswith(ZONAL_PREFIX) and shown.get(norm_name(it["name"])) == {src}:
            would.append((it["id"], src))
    try:
        robots_with_redirects(would[0][1] if would else ZONAL_PREFIX)
    except Blocked as e:
        print(f"route A (the menu page's photos on {ZONAL_PREFIX}): {len(would)} items would match, NOT fetched: {e}")
        return
    print(f"route A: the photo host now allows fetching ({len(would)} items would match): re-read its robots.txt and terms, then extend this script")


# ---------------------------------------------------------------- route B
def page_cards(url: str, page: str) -> list[dict]:
    cards = []
    spans = []
    for m in CARD.finditer(page):
        spans.append((m.start(3), m.end(3)))
        photo = htmllib.unescape(m.group(1)).strip("'\"")
        cards.append({"pos": m.start(), "name": htmllib.unescape(re.sub(r"<[^>]+>", "", m.group(3))).strip(),
                      "src": photo.split("?", 1)[0], "page": url})
    sections = [(m.start(), htmllib.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip()) for m in H2.finditer(page)
                if not any(a <= m.start(1) <= b for a, b in spans)]
    for c in cards:
        before = [s for p, s in sections if p < c["pos"]]
        c["section"] = before[-1] if before else ""
    if not cards:
        raise SystemExit(f"no photo cards on {url}: the page has changed shape, re-check the script")
    return cards


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, dict] = {}
    try:
        route_a_count(items, args.cache)

        by_name: dict[str, list[dict]] = {}
        for url in PAGES:
            cards = page_cards(url, get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace"))
            print(f"{len(cards)} photo cards on {url}")
            for c in cards:
                by_name.setdefault(norm_name(ML_SUFFIX.sub("", c["name"])), []).append(c)

        for it in items:
            found = by_name.get(norm_name(it["name"]))
            if not found:
                continue
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            if it["category"].lower().endswith("pizzas"):
                wrong = [c for c in found if norm_name(c["section"]) in PIZZA_RANGES and norm_name(c["section"]) != norm_name(it["category"])]
                if wrong:
                    skipped.append(f"{it['id']}: the card {wrong[0]['name']!r} on {wrong[0]['page']} sits under {wrong[0]['section']!r}, "
                                   f"a different range from this {it['category']!r} dish")
                    continue
            if len({c["src"] for c in found}) != 1:
                skipped.append(f"{it['id']}: the pages show {len({c['src'] for c in found})} different photos under this name")
                continue
            if not found[0]["src"].startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: the card's photo {found[0]['src']!r} is not on the chain's image CDN")
                continue
            matched[it["id"]] = found[0]

        for item_id, c in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:45} {c['src'].rsplit('/', 1)[-1]}  <- {c['name']!r} on {c['page']}")
                continue
            raw = get(c["src"], args.cache, referer=c["page"])
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {c['src']}: {e}")
                continue
            rows[item_id] = (fname, c["page"])
            print(f"  {item_id:45} {fname}  <- {c['src'].rsplit('/', 1)[-1]}")
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
