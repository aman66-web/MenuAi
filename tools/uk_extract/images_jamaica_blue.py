#!/usr/bin/env python3
"""Item photos for Jamaica Blue UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_jamaica_blue.py --cache DIR [--dry-run]

Result of 2026-11-17: 0 of 359 published items can be given a photo. Nothing is written (no images.csv) while nothing matches.

Where the items come from: tools/uk_extract/jamaica_blue.py reads the chain's allergen app (https://allergens-jamaicablue.co.uk/allergens/jbuk,
data file /csv/allergens_JBUK.csv). That app shows names and tables only: its page and its JavaScript (assets/index-*.js, AllergensRoute-*.js,
RecipesContext-*.js, read 2026-11-17) load no product picture at all (the only image is the Jamaica Blue logo, JB-logo-white-*.svg). It is the same
app as Muffin Break's (tools/uk_extract/images_muffin_break.py found the same).

Where the chain shows food pictures (https://www.jamaicablue.co.uk, a WordPress site; it answered normally on 2026-11-17, no bot check):
  * /our-menu/: a carousel and two picture blocks (Turkish-Eggs-2.jpg, JamaicaBlue28-05-12-132712_Capp2.jpeg, Open-Flatbreads-1024x682.jpg,
    Jamaica-Blue-Photoshoot-Nov-19-Emma-47-1024x768.jpg), every one with the same generic alt text "Jamaica Blue Menu Our Menu Jamaica Blue" and
    no heading or caption naming a dish; the menu itself is seven PDF files (JAM_8294 ... Menus A3L 2026: Bristol, Chelmsford, Cibo, NI,
    Richmond, Vector, Halal) whose only embedded picture is the logo (one image + its mask each): text only, no dish photo.
  * / (home), /takeaway-only-service/, /prepare-to-be-rewarded/, the 34 /store/<site>/ pages and the 3 news posts (post-sitemap.xml, 2020):
    the same kind of unnamed mood pictures (Eggs-Benny-3.jpg, a flat white, shop fronts, app-store badges), never above a heading or
    caption that names a published item.
  * The WordPress media library (/wp-json/wp/v2/media, 330 records read 2026-11-17): titles, alt texts and captions are the upload file
    names ("Turkish Eggs 2", "Eggs Benny 3", "Peri Peri Burger scaled", "LD-Classic-eggs-benny", "Red-velvet-cake"...); none has the
    norm_name of a published item, and a file name is not a page that shows a picture for a dish, so this is only reported ("look by hand").
  * The Jamaica Blue rewards app (App Store / Google Play badges on /prepare-to-be-rewarded/) is not a web page or feed the site links as its
    menu: not used. Delivery platforms are never used.

Match rule (exact, nothing fuzzy): a photo is attached only when, on one of the chain's own pages listed in PAGES, an <img> whose file is under
/wp-content/uploads/ on www.jamaicablue.co.uk is followed directly (nothing between them) by a heading (h2-h4) or a <figcaption>, or carries
alt text, whose norm_name equals a published item's name, and the file is not a logo, badge or drawn icon. Media-library titles that name an
item exactly are only reported ("LOOK BY HAND"), never attached, because no page ties that picture to that dish. The menu PDFs are re-checked
for embedded pictures beyond the logo (reported, never attached: a PDF page does not tie one picture to one name in a way this script can
prove). A rerun picks up photos the day the chain publishes them under the dishes' own names.

robots.txt (read 2026-11-17): https://www.jamaicablue.co.uk/robots.txt is one group, `User-agent: *`, Disallow: /wp-admin/ (Allow:
/wp-admin/admin-ajax.php) and the sitemap: every page, PDF, upload and /wp-json/ path used here is allowed; no group names an AI crawler.
https://allergens-jamaicablue.co.uk/robots.txt answers 404 (no rules).

Terms (https://www.jamaicablue.co.uk/terms-and-conditions/, read 2026-11-17), section 16 "Intellectual Property": "All intellectual property
rights in the App, Website, Rewards Programme and their content, including trademarks, logos, graphics, text, software and other materials,
are owned by or licensed to Jamaica Blue UK. You may use the App for your personal, non-commercial use only. You must not copy, reproduce,
modify, distribute, reverse engineer or otherwise use any part of the App except where permitted by law or with our prior written permission."
An express restriction (photos would be installed on the founder's decision of 2026-10-06, his accepted risk; none can be today).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "jamaica-blue"
HOST = "https://www.jamaicablue.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-jamaica-blue")
MENU_PAGE = HOST + "/our-menu/"
PAGES = [MENU_PAGE, HOST + "/", HOST + "/takeaway-only-service/", HOST + "/prepare-to-be-rewarded/"]
POST_SITEMAP = HOST + "/post-sitemap.xml"
MEDIA_API = HOST + "/wp-json/wp/v2/media?per_page=100&page={page}&_fields=id,title,alt_text,caption,source_url"
UPLOADS = HOST + "/wp-content/uploads/"
# Looked at by eye; a rerun must not bring them back.
DROP_ITEMS: dict[str, str] = {}
NOT_A_PHOTO = re.compile(r"(logo|badge|icon|Stacked-Centre-Aligned|cropped-JB-next)", re.I)
GENERIC_ALT = re.compile(r"^jamaica blue\b.*\bjamaica blue$", re.I)   # "Jamaica Blue Menu Our Menu Jamaica Blue": the site's page-title alt
PDF_LINK = re.compile(r'href="(https://www\.jamaicablue\.co\.uk/wp-content/uploads/[^"]+\.pdf)"')
TOKENS = re.compile(r'<img\b[^>]*>|<h([2-4])[^>]*>(.*?)</h\1>|<figcaption[^>]*>(.*?)</figcaption>', re.S)


def text(s: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def attr(tag: str, name: str) -> str:
    m = re.search(rf'\s{name}="([^"]*)"', tag)
    return htmllib.unescape(m.group(1)) if m else ""


def body_of(page: str) -> str:
    i = page.find("<body")
    if i < 0:
        raise SystemExit("no <body>: the page has changed shape")
    return re.sub(r"<(script|style|noscript)\b.*?</\1>", "", page[i:], flags=re.S)


def named_pictures(body: str) -> list[tuple[str, str]]:
    """(name, picture) where the page itself names the picture: its own alt text (not the generic page-title alt), or a heading or
    figcaption that comes directly after the <img>."""
    toks = []
    for m in TOKENS.finditer(body):
        if m.group(0).startswith("<img"):
            toks.append(("img", m.group(0)))
        else:
            toks.append(("name", text(m.group(2) or m.group(3) or "")))
    out = []
    for i, (kind, val) in enumerate(toks):
        if kind != "img":
            continue
        src = attr(val, "src")
        alt = attr(val, "alt")
        if alt and not GENERIC_ALT.match(alt):
            out.append((alt, src))
        if i + 1 < len(toks) and toks[i + 1][0] == "name":
            out.append((toks[i + 1][1], src))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
    notes: list[str] = []
    try:
        sitemap = polite_get(POST_SITEMAP, args.cache, accept="application/xml,*/*").decode("utf-8", "replace")
        pages = PAGES + re.findall(r"<loc>(.*?)</loc>", sitemap)
        pdfs: set[str] = set()
        n_named = 0
        for url in pages:
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            pdfs.update(PDF_LINK.findall(page))
            for name, src in named_pictures(body_of(page)):
                n_named += 1
                hits = by_name.get(norm_name(name), [])
                if not hits:
                    continue
                if not src.startswith(UPLOADS) or NOT_A_PHOTO.search(src):
                    notes.append(f"{name!r} on {url}: picture {src} is not a photo file in the site's uploads")
                    continue
                for it in hits:
                    if it["id"] in DROP_ITEMS:
                        notes.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                    else:
                        matched.setdefault(it["id"], (src, url))
        print(f"{len(pages)} pages read, {n_named} pictures named on them (alt text, heading or caption), "
              f"{len(matched)} naming a published item exactly")

        # the menu PDFs: report any embedded picture beyond the logo (an image + its soft mask)
        for pdf in sorted(pdfs):
            raw = polite_get(pdf, args.cache, accept="application/pdf,*/*")
            n = len(re.findall(rb"/Subtype\s*/Image", raw))
            if n > 2:
                notes.append(f"LOOK BY HAND: {pdf} holds {n} embedded images (more than the logo and its mask)")
        print(f"{len(pdfs)} menu PDFs checked for embedded pictures")

        # the media library: report exact names only (no page ties those pictures to a dish)
        media: list[dict] = []
        for p in range(1, 20):
            try:
                chunk = json.loads(polite_get(MEDIA_API.format(page=p), args.cache, accept="application/json"))
            except Blocked:
                raise
            except Exception:   # WordPress answers 400 past the last page
                break
            if not isinstance(chunk, list) or not chunk:
                break
            media += chunk
        for m in media:
            for label in (text(m["title"]["rendered"]), m.get("alt_text") or "", text(m["caption"]["rendered"])):
                if label and norm_name(label) in by_name:
                    notes.append(f"LOOK BY HAND: media record {m['id']} ({m['source_url']}) is labelled {label!r}")
        print(f"{len(media)} media-library records checked")

        for item_id, (url, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:50} {url.rsplit('/', 1)[-1]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                notes.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:50} {fname}  <- {url.rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    for n in notes:
        print(f"  {n}")
    if args.dry_run:
        print(f"{len(matched)} of {len(items)} published items matched")
        return 0
    if not rows:
        print(f"0 of {len(items)} published items have a photo on the chain's own pages: nothing written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
