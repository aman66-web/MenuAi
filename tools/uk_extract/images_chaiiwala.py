#!/usr/bin/env python3
"""Item photos for Chaiiwala from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_chaiiwala.py --cache DIR [--dry-run]

Source: ONE page, https://www.chaiiwala.co.uk/menu (the same page tools/uk_extract/chaiiwala.py reads the calories from). Every
dish card on it is `<a href="/menu/<slug>"> <img alt="..." src="/_next/image?url=<photo>&w=3840&q=75"> <h3>name</h3> ... kcal`,
and the page embeds the dish record each card is drawn from (id, slug, name, kcal, kcalLarge, image.url ...).
The photo URL is a file in the chain's own media store (https://mj61re9kudtuw16h.public.blob.vercel-storage.com/<file>, the host
the chain's own page names in the card's src). We fetch that original file directly (not the /_next/image re-encode, not the
smaller "card"/"thumbnail" sizes) and let store_image do the only change (downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the item's notes in items.csv name the dish card it was built from ("menu card /menu/<slug>"), and the dish record with that
     slug has a name whose norm_name equals the item's name (less a trailing "(Regular)" / "(Large)" for a drink printed in two
     sizes), and the record's kcal (Regular or single size) / kcalLarge (Large) equals the item's calories, and
  2. the card on /menu with href /menu/<slug> carries the same name in its <h3> and shows, as its picture, exactly the photo
     the record names (the card's src url= parameter equals record.image.url): the photo, name and size sit in one product
     record and one card on the chain's page, and
  3. the photo is in the chain's own media store (host check).
  Second route (added 2026-11-17), only for a dish whose record names no image (19 of 143 records on 2026-11-17): the card on /menu for
  that slug, carrying the dish's name in its <h3>, shows exactly one picture, and that picture is the chain's own per-dish file
  /images/menu/<the card's slug>.png on www.chaiiwala.co.uk (the file the dish's own page /menu/<slug> also gives as its og:image and
  hero picture, alt = the dish's name). The file name is the card's own slug, so it is that dish's file, not a shared fallback. Records
  with no image and a card with no picture (Arabic tea) give no photo.
Regular and Large of one drink share the record's single photo (the same product record carries both); the photo is not a
statement about the size. A photo whose file name or embedded metadata (XMP / C2PA) says it was made by an image generator is left out
(CLAUDE.md rule 2: no generated food images); on 2026-11-17 no file carried such metadata (four carry Adobe Photoshop XMP only).

Terms (https://www.chaiiwala.co.uk/terms, "last updated 14 May 2026", section "content & ip", read 2026-10-08 and again 2026-11-17,
unchanged): "All content on this site, including the
Chaiiwala name and wordmark, the teapot mark, the "chaiiwala" script wordmark, photography, illustrations, recipe descriptions and
layout, is (c) Rowda Group Ltd or used under licence. You can share individual pages and screenshots in personal social posts.
Anything beyond that (commercial reuse, framing, scraping, republication) needs written permission." and, under "acceptable use",
"Don't harvest data from the site for any commercial purpose without our written permission." That is an express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk). robots.txt (https://www.chaiiwala.co.uk/
robots.txt, read 2026-10-08 and 2026-11-17): "User-Agent: * / Allow: / / Allow: /api/allergen-matrix.pdf / Disallow: /admin / Disallow: /api";
on 2026-11-17 the same rules are repeated in named groups for GPTBot, ClaudeBot, Claude-Web, anthropic-ai and other AI crawlers (all allowed
outside /admin and /api) (/menu and /images/menu/ are allowed; the photo host's robots.txt answers 404 = no rules; polite_get checks both on every URL, RFC 9309).

Run of 2026-11-17: 124 of 132 published items have a photo: 107 of the 112 kept from 2026-10-08 (Rasher & Egg Breakfast Wrap now with the
chain's newer file) and 17 added by the second route above, all looked at by eye on contact sheets and full-size views. No photo: Arabic tea
(no picture anywhere), Chicken Tikka Salad (the chain's file is named "ChatGPT Image ..."), and the five Red Bull cans (DROP_ITEMS).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import chaiiwala  # noqa: E402  (read_records / strip_scripts / tidy: the same reader the calories came from)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "chaiiwala"
MENU_URL = "https://www.chaiiwala.co.uk/menu"
PHOTO_HOST = "https://mj61re9kudtuw16h.public.blob.vercel-storage.com/"   # the chain's own media store, as named by the card's src
SITE = "https://www.chaiiwala.co.uk"
CARD_FILE = re.compile(r"^/images/menu/([a-z0-9-]+)\.png$")   # the chain's own per-dish file, shown by a card whose record names no image
# Embedded marks of an image generator (XMP DigitalSourceType "trainedAlgorithmicMedia", a C2PA manifest chunk, tool names in metadata)
GENERATED_META = re.compile(rb"trainedAlgorithmicMedia|c2pa\.|caBX|openai|chatgpt|dall-?e|midjourney|adobe firefly|stable.?diffusion")
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-chaiiwala")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
# Looked at 2026-11-17 on contact sheets and a full-size crop: the five Red Bull records show Red Bull's own can artwork (a third-party
# brand's pack and logo, not a photo of food) printing "Vitalizes body and mind" (a health-style slogan) and, on the Sugarfree can,
# "SUGARFREE" (a nutrition claim that could sit beside our own figures).
DROP_ITEMS.update({i: "Red Bull's own can artwork (third-party brand pack/logo) printing 'Vitalizes body and mind' / 'SUGARFREE'" for i in (
    "red-bull-energy-drink", "red-bull-sugarfree", "red-bull-summer-edition-citrus-zest", "red-bull-apple-edition",
    "red-bull-coconut-edition")})
# Looked at 2026-11-17 by an independent check: the five Wala kids photos are box shots (kids' box, crayons, a colouring sheet and a
# third-party Simply Fruity bottle printing "NO ADDED SUGAR", a nutrition claim on another brand's pack that is not part of the dish
# named); the Mini Veggie card's file shows the same chicken wrap as the Mini Chicken one (a different product).
DROP_ITEMS["mini-veggie-wala-wrap-and-chips"] = "its file shows a chicken wrap (same scene as Mini Chicken), plus a Simply Fruity 'NO ADDED SUGAR' bottle"
DROP_ITEMS.update({i: "kids' box shot with crayons and a third-party Simply Fruity bottle printing 'NO ADDED SUGAR' (not the dish named)" for i in (
    "mini-chicken-wala-wrap-and-chips", "chicken-nuggets-and-chips", "veg-nuggets-and-chips", "cheese-and-masala-beans-toastie-and-chips")})

NOTE_SLUG = re.compile(r"menu card /menu/([a-z0-9-]+)")
CARD = re.compile(r'<a class="group block" href="/menu/([^"]+)">(.*?)</a>', re.S)
SIZE_SUFFIX = re.compile(r"\s*\((Regular|Large)\)\s*$")
# The chain's file names for two salads read "ChatGPT Image Aug 5, 2026 ...": generated pictures, not photographs of the dish.
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)


def cards(menu_html: str) -> dict[str, dict]:
    """slug -> {name, photo}: the card as drawn (its <h3> and the url= of its picture)."""
    out: dict[str, dict] = {}
    for slug, card in CARD.findall(chaiiwala.strip_scripts(menu_html)):
        h3 = re.search(r"<h3[^>]*>(.*?)</h3>", card, re.S)
        photos = []
        for src in re.findall(r'<img[^>]*?\ssrc="(/_next/image\?[^"]+)"', card):
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(html.unescape(src)).query)
            photos += q.get("url", [])
        out[slug] = {
            "name": html.unescape(re.sub(r"<[^>]+>", "", h3.group(1))) if h3 else "",
            "photos": photos,
        }
    return out


def same_url(a: str, b: str) -> bool:
    """The card's url= and the record's image.url name one file (percent-encoding of spaces may differ)."""
    return urllib.parse.unquote(a) == urllib.parse.unquote(b)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        menu_html = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        records = {r["slug"]: r for r in chaiiwala.read_records(menu_html)}
        card_by_slug = cards(menu_html)
        print(f"{len(records)} dish records, {len(card_by_slug)} cards on {MENU_URL}; "
              f"{sum(1 for r in records.values() if r.get('image'))} records carry a photo")

        matched: dict[str, str] = {}   # item id -> photo url
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            m = NOTE_SLUG.search(it.get("notes", ""))
            if not m:
                skipped.append(f"{it['id']}: notes name no menu card")
                continue
            slug = m.group(1)
            rec, card = records.get(slug), card_by_slug.get(slug)
            if not rec or not card:
                skipped.append(f"{it['id']}: /menu/{slug} is no longer on the menu page")
                continue
            size = SIZE_SUFFIX.search(it["name"])
            base = SIZE_SUFFIX.sub("", it["name"])
            if norm_name(chaiiwala.tidy(rec["name"])) != norm_name(base) or norm_name(card["name"]) != norm_name(base):
                skipped.append(f"{it['id']}: record {rec['name']!r} / card {card['name']!r} do not carry the name {base!r}")
                continue
            want = rec.get("kcalLarge") if size and size.group(1) == "Large" else rec.get("kcal")
            try:
                ok = want is not None and float(it["calories"]) == float(want)
            except ValueError:
                ok = False
            if not ok:
                skipped.append(f"{it['id']}: calories {it['calories']} are not the record's {want}")
                continue
            img = rec.get("image")
            url = (img or {}).get("url")
            if not url:
                # second route: the card's own per-dish file /images/menu/<slug>.png (see the docstring)
                shown = card["photos"]
                f = CARD_FILE.match(urllib.parse.unquote(shown[0])) if len(shown) == 1 else None
                if not f:
                    skipped.append(f"{it['id']}: the chain's record has no photo and the card shows {shown or 'no picture'}")
                    continue
                if f.group(1) != slug:
                    skipped.append(f"{it['id']}: the card's picture {shown[0]} is named for another dish, not /menu/{slug}")
                    continue
                matched[it["id"]] = SITE + urllib.parse.unquote(shown[0])
                continue
            if not url.startswith(PHOTO_HOST):
                skipped.append(f"{it['id']}: photo {url} is not in the chain's media store")
                continue
            if GENERATED.search(urllib.parse.unquote(url[len(PHOTO_HOST):])):
                skipped.append(f"{it['id']}: the chain's file name {urllib.parse.unquote(url[len(PHOTO_HOST):])!r} says it is an AI-generated "
                               "image, not a photograph (CLAUDE.md rule 2: no generated food images)")
                continue
            if not any(same_url(p, url) for p in card["photos"]):
                skipped.append(f"{it['id']}: the card shows {card['photos']}, not the record's {url}")
                continue
            matched[it["id"]] = url

        for item_id, url in sorted(matched.items()):
            slug = NOTE_SLUG.search(next(i for i in items if i["id"] == item_id)["notes"]).group(1)
            shown = url[len(PHOTO_HOST):] if url.startswith(PHOTO_HOST) else url[len(SITE):]
            if args.dry_run:
                print(f"  {item_id:50} {shown}  <- /menu/{slug}")
                continue
            raw = polite_get(url, args.cache, referer=MENU_URL)
            if GENERATED_META.search(raw):
                skipped.append(f"{item_id}: {url}: the file's own metadata names an image generator (CLAUDE.md rule 2)")
                continue
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, MENU_URL)
            print(f"  {item_id:50} {fname}  <- {shown}")
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
