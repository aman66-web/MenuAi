#!/usr/bin/env python3
"""Item photos for Simmons Bakers (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_simmons_bakers.py --cache <dir> --dry-run     # list matches, download only the two pages
    python3 tools/uk_extract/images_simmons_bakers.py --cache <dir>               # download, store, write images.csv

Where the photos are (checked again 2026-11-17):
* The nutrition pages (simmonsbakers.com/nutritional-information and /nutritional-information[-rm]/<id>, which every published item was read from by
  simmons_bakers.py) carry NO photo of any product, only the ticket graphics and small drawn "ing_*.png" illustrations (not photos, not used). The home,
  story and FAQ pages carry only drawn illustrations. So the ~1,100 made-in-store items (baguettes, baps, rolls, doorsteps, sandwiches, toasted,
  ciabatta, jacket potatoes, soups, salads, drinks) have no photo anywhere on the chain's own sites, and get none.
* The Click & Collect shop page, https://www.simmonsbakers.com/clickandcollect (delivery.simmonsbakers.com redirects there): one card per online-order
  product, each `<li id="<slug>" class="Product candc ..."> <a ... data-ingredient-code="<nutrition page id>"> <img data-lazyload="/server/files/<hash>.jpeg"
  alt="<product name>">`. The data-ingredient-code is the id of the product's own nutrition page (/nutritional-information-rm/<id>): the bakery's own
  record tying the shop product to the nutrition record our item was built from (items.csv notes "page nutritional-information-rm/<id>; per Slice").
* The sourdough microsite https://sourdough.simmonsbakers.com/ (the bakery's own subdomain, linked from its home page): one section per loaf,
  `<h1>hertfordshire <br/>sourdough</h1>` followed in the same row by the loaf's photo (a Webflow file on cdn.prod.website-files.com).

Matching (exact only; a photo is attached when ONE of these holds):
  1. Same record: the card's data-ingredient-code equals the id of the bakery ("-rm") nutrition page exactly one published item was read from. So
     "Bakewell Tart" (code 10689) -> "Tart, Bakewell" (page nutritional-information-rm/10689), "Flapjack" (10651) -> "Tray - Flapjack (12)",
     "Chocolate Fudge Cake" (11690) -> "Choc Fudge (*)". Only bakery pages (one item per page) are used, never a made-in-store page (one page, many
     option combinations). A code no published item was read from gives nothing (Brownie 10657 and Milk Chocolate Caramel Shortbread 10654: their
     tray items are held back; Lemon Drizzle Cake 10777 and Victoria Sandwich 10773: our Lemon Drizzle (14) and Victoria Sponge Tall (12) were read from
     other pages, 10788 and 10780, so they are different records and get no photo).
  2. Same name: the card's (or the microsite section's) name equals the published item's name after norm_name, or equals it once the bakery's trailing
     "(<number>)" / "(*)" marker is removed ("Bueno Cake" = "Bueno Cake (14)": the number is how many slices the whole cake is cut into). Nothing else:
     no reordered or added words, no abbreviations by name (those only match through rule 1's shared record).
  A shop card's photo shows the whole cake, tart or tray (the shop sells it whole: "Serves 12", "Serves 14-16"); the item is one slice of that same
  product, as the nutrition page's "per Slice" column says.
  Not used: the shop's coffee bags, granola, "Naked" cakes and gift cards (no published item); a name the page lists twice; the San Francisco Sourdough
  photo (that item is held back: its page prints 0 for every figure).

Politeness / robots (read 2026-11-17): www.simmonsbakers.com publishes no robots.txt (/robots.txt redirects to the home page: no rules);
sourdough.simmonsbakers.com/robots.txt is empty (no rules); cdn.prod.website-files.com answers HTTP 403 for /robots.txt, which RFC 9309 reads as
"no rules" (founder's decision 2026-10-12); the photo files themselves answer normally. One GET per page and per photo, 1 request/second per host,
polite_get from images_common (a 401/403/429 or a robots refusal stops the run: never worked round).

Terms (https://www.simmonsbakers.com/tandcs, "Content & Intellectual Property Rights", read 2026-11-17): "The products and content on
www.simmonsbakers.com and delivery.simmonsbakers.com are protected by national intellectual property. You are only allowed to use content found on
this Website as expressly agreed by Simmons (Bakers) Ltd. Any reproduction or redistribution of our content may result in civil and criminal
penalties." (content is "graphics, photographs, image rights, sounds, music, audio or text"). The sourdough microsite has no terms page of its own.
An express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "simmons-bakers"
BASE = "https://www.simmonsbakers.com"
PAGE_URL = BASE + "/clickandcollect"
SOURDOUGH_URL = "https://sourdough.simmonsbakers.com/"
HTML_ACCEPT = "text/html,application/xhtml+xml,*/*;q=0.8"
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}

_CARD = re.compile(r'<li id="([^"]+)" class="Product\b[^"]*">(.*?)</li>', re.S)
_PACK = re.compile(r"\s*\((?:\*|\d+)\)\s*$")
_RM_PAGE = re.compile(r"^page nutritional-information-rm/(\d+);")
_SECTION_H1 = re.compile(r"<h1\b[^>]*>(.*?)</h1>", re.S)
_PHOTO_SRC = re.compile(r'<img\b[^>]*\ssrc="(https://cdn\.prod\.website-files\.com/[^"]+\.(?:png|jpe?g|webp))"', re.I)


def _text(fragment: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def read_products(page: str) -> list[tuple[str, str, str]]:
    """[(product name, photo URL, ingredient code or '')] from the Click & Collect page's cards, in page order."""
    out = []
    for _slug, body in _CARD.findall(page):
        img = re.search(r'<img\b[^>]*\sdata-lazyload="([^"]+)"[^>]*\salt="([^"]*)"', body)
        if not img:
            continue
        code = re.search(r'data-ingredient-code="(\d*)"', body)
        out.append((" ".join(htmllib.unescape(img.group(2)).split()), BASE + htmllib.unescape(img.group(1)), code.group(1) if code else ""))
    return out


def read_sourdough(page: str) -> list[tuple[str, str]]:
    """[(loaf name, photo URL)]: each <h1> section's first raster photo before the next <h1>."""
    heads = list(_SECTION_H1.finditer(page))
    out = []
    for n, h in enumerate(heads):
        end = heads[n + 1].start() if n + 1 < len(heads) else len(page)
        photo = _PHOTO_SRC.search(page, h.end(), end)
        if photo:
            out.append((_text(h.group(1)), htmllib.unescape(photo.group(1))))
    return out


def item_key(name: str) -> str:
    """The item's name with the bakery's trailing slice-count / '(*)' marker removed, normalised."""
    return ic.norm_name(_PACK.sub("", name))


def match(products: list[tuple[str, str, str]], loaves: list[tuple[str, str]], items: list[dict]
          ) -> tuple[dict[str, tuple[str, str, str]], list[str]]:
    """{item_id: (photo_url, page_url, how)} and notes on what was left out and why."""
    notes: list[str] = []
    by_key: dict[str, list[dict]] = {}
    by_page: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(item_key(it["name"]), []).append(it)
        m = _RM_PAGE.match(it.get("notes", ""))
        if m:
            by_page.setdefault(m.group(1), []).append(it)
    out: dict[str, tuple[str, str, str]] = {}

    def attach(it: dict, url: str, page_url: str, how: str) -> None:
        if it["id"] in EXCLUDE:
            notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
        elif it["id"] in out and out[it["id"]][0] != url:
            notes.append(f"{it['name']}: two different photos claim it -> none")
            out[it["id"]] = ("", "", "conflict")
        else:
            out.setdefault(it["id"], (url, page_url, how))

    names = [ic.norm_name(n) for n, _, _ in products]
    codes = [c for _, _, c in products if c]
    for (name, url, code), nn in zip(products, names):
        if names.count(nn) > 1:
            notes.append(f"{name}: the page lists this name more than once -> none")
            continue
        if code and codes.count(code) > 1:
            notes.append(f"{name}: the page gives ingredient code {code} to more than one card -> none")
            continue
        hit = False
        if code and len(by_page.get(code, [])) == 1:
            attach(by_page[code][0], url, PAGE_URL, f"same record (ingredient code {code})")
            hit = True
        for it in by_key.get(nn, []):
            attach(it, url, PAGE_URL, "same name")
            hit = True
        if not hit:
            notes.append(f"{name}: no published item read from page -rm/{code or '?'} or with exactly this name")
    for name, url in loaves:
        hits = [it for it in items if ic.norm_name(it["name"]) == ic.norm_name(name)]
        if not hits:
            notes.append(f"sourdough microsite '{name}': no published item with exactly this name")
        for it in hits:
            attach(it, url, SOURDOUGH_URL, "same name (sourdough microsite section heading)")
    return {k: v for k, v in out.items() if v[2] != "conflict"}, notes


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", type=Path, required=True, help="directory for the cached pages and photo bytes")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; download no photos")
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    try:
        page = ic.polite_get(PAGE_URL, args.cache / "page", accept=HTML_ACCEPT).decode("utf-8", "replace")
        sour = ic.polite_get(SOURDOUGH_URL, args.cache / "sourdough", accept=HTML_ACCEPT).decode("utf-8", "replace")
    except ic.Blocked as e:
        raise SystemExit(f"BLOCKED: {e}: stop and report; do not work round it")
    products = read_products(page)
    loaves = read_sourdough(sour)
    matches, notes = match(products, loaves, items)
    names = {i["id"]: i["name"] for i in items}
    print(f"{len(products)} products with a photo on {PAGE_URL}; {len(loaves)} loaves on {SOURDOUGH_URL}; "
          f"{len(items)} published items; {len(matches)} matched")
    for item_id, (url, _page, how) in sorted(matches.items()):
        print(f"  MATCH {item_id}  ({names[item_id]})  <-  {url}  [{how}]")
    for n in notes:
        print("  skip:", n)
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    for item_id, (url, page_url, _how) in sorted(matches.items()):
        try:
            raw = ic.polite_get(url, args.cache / "photos", referer=page_url)
            fname = ic.store_image(CHAIN_ID, raw)
        except ic.Blocked as e:
            raise SystemExit(f"BLOCKED: {e}: stop and report; do not work round it")
        except (ValueError, OSError) as e:
            print(f"  skip photo for {item_id}: {e}")
            continue
        rows[item_id] = (fname, page_url)
    path = ic.write_images_csv(CHAIN_ID, rows)
    shared = ic.suspected_placeholders(rows)
    total = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN_ID).glob("*.webp"))
    print(f"wrote {path.relative_to(ic.ROOT)}: {len(rows)} of {len(items)} items have a photo; {len(set(f for f, _ in rows.values()))} files, {total} bytes")
    if shared:
        print("files used by 4+ items (look at them):", shared)


if __name__ == "__main__":
    main()
