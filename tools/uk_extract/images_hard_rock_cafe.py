#!/usr/bin/env python3
"""Item photos for Hard Rock Cafe from the chain's own menu page and its London menu (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_hard_rock_cafe.py --cache DIR [--dry-run]

Needs poppler (`pdftohtml`) for source B, like hard_rock_cafe.py (which needs `pdftotext`).

SOURCE A: https://cafe.hardrock.com/menu.aspx (the chain's one menu page; https://cafe.hardrock.com/london/menu.aspx redirects to it,
the sitemap lists only this menu page; the London cafe page links PDF menus instead: see SOURCE B). The page is the chain's GLOBAL menu ("Item and Availability may vary by location."); the London cafe's printed PDF menu
is our nutrition source. Each tab shows up to two "featured items": a photo plus the dish's name,
    <div class="featuredItem TabFeaturedItem1"> <img alt="..." title="<dish>" data-originalsrc="https://cafe.hardrock.com/files/5282/<file>.jpg"> ...
    <div class=featuredItemContent><h3><DISH NAME></h3><div>ingredients</div></div></div>
The page loads `data-originalsrc` into `src` when the tab is opened; that is the chain's own full-size file, which we fetch (one
request each) and let store_image do the only change (downsize to <= 640 px, WebP). The menu page itself is read as plain HTML
(it is served in the raw response, no browser needed).

Match rule for source A (exact, nothing fuzzy). A photo is attached to a published item only when, in the same featured-item record,
  1. the <h3> dish name has the same norm_name as the item's name in the CURRENT items.csv, and
  2. the photo's own title attribute (the name the chain gave the photo) has that same norm_name, and
  3. exactly one published item has that name.
That matches 6 items; after looking at the photos 5 are kept: Original Legendary Burger, One Night in Bangkok Spicy Shrimp,
BBQ Pulled Pork Sandwich, Cobb Salad, Baby Back Ribs (Hot Fudge Brownie is dropped: see DROP_ITEMS). Everything else on the page is left alone on purpose: "Legendary Nachos" (our guide's dish is
"Classic Nachos": a different name), "Messi's X Burger" (a photo of Lionel Messi with children, not food; our kids' item is
"Kids Messi's Burger"), the "Hurricane" cocktail (not in our guide) and the lifestyle photo with no dish name. The names in
our guide that do not appear on the page get no photo, however similar the dish may look.

SOURCE B (added 2026-11-17): the London cafe's own "HARD ROCK CAFE MENU" (Drinks & Eats, footer "2/26 - London - ENG", 28 pages, created
13 Mar 2026), the very PDF our calories are copied from (hard_rock_cafe.py), linked from https://cafe.hardrock.com/london/ as
https://cafe.hardrock.com/london/files/5330/USJ219878_-_HRC_EU_-DRINKS_&_EATS_MENU_-_FEB_26_-_B_-_LONDON_OPL_-_ENG.pdf . The script reads the London
page, takes the one link whose file name contains "DRINKS_&_EATS_MENU", and stops if there is none or more than one. Page 11 of that menu is six
burger photos, each with the dish's name printed over its bottom-left corner as a separate line of text (white Gotham, not part of the picture), and page 26
is one drink photo captioned "Strawberry Basil Lemonade". `pdftohtml -xml` gives every embedded picture with the box it is drawn in (the picture
file it writes is the embedded JPEG stream unchanged: same SHA-256 as `pdfimages -j`) and every line of text with its box, so which caption sits on
which picture is read from the PDF itself: a caption belongs to a picture when its text box lies inside that picture's box and inside no other
picture of at least MIN_SIDE px on the page. On top of that, every picture used was looked at by eye on 2026-11-17 and is listed in REVIEWED (SHA-256
of the embedded JPEG -> page and caption); a changed or new picture never gets attached until someone looks again (the run lists it).
The kids' menu (Kids.pdf and the October 2026 "Messi Kids Menu") prints all the kids' dishes in ONE composite photo with labels round it: a dish
could only be had by cropping, which we never do, so it is not used. The "Legendary Menus" set-menu PDF, the gluten-free, brunch, beverage-package
and sales PDFs on the same page carry no picture captioned with one of our dishes (looked at on 2026-11-17). The London page's own pictures are
section banners (events, Thanksgiving, gluten-free, delivery), not named after a dish.

Match rule for source B (exact, nothing fuzzy). A PDF photo is attached to a published item only when
  1. its SHA-256 is in REVIEWED and it is on the page REVIEWED says,
  2. a line of text whose box lies inside that picture's box (and no other picture's) is printed on that page with the caption REVIEWED gives,
     and that caption is the only line inside the picture that names a published item,
  3. the caption has the same norm_name as exactly one published item's name, and
  4. source A gave that item no photo (the menu-page photo is kept where both have one: Original Legendary Burger).
That adds 6 items: The Classic Smashed Burger, Messi Chicken Sandwich, BBQ Bacon Burger, Spicy Diablo Smashed Burger, Legendary Smashed Burger
(page 11) and Strawberry Basil Lemonade (page 26: the drink in the cafe's own branded glass, a hand squeezing a lemon over it; the "£14.30 INCLUDES
YOUR OWN COLLECTIBLE GLASS" line is page text, not in the picture). Other pictures in the menu (cocktails, beer, a sharing platter, wings with three
sauces, a dessert spread, people) carry no caption that names one published dish and are left alone.

Run of 2026-11-17: menu.aspx unchanged since 2026-10-08 (the same 5 photos, same files); 6 photos added from the London menu; 11 of 113 published
items have a photo, each looked at on a contact sheet. robots.txt and the terms re-read the same day (unchanged; quoted below).
The London page now also links newer documents (Legendary_menu_2026.pdf, a "Messi Kids Menu ... OCT 26" and "Hard_Rock_Cafe_London__allergen_sheet_
November_2026.pdf"); the Drinks & Eats menu above is still the one linked.

Terms (https://www.hardrock.com/terms-conditions, "Terms and Conditions", linked as TERMS in the cafe site's footer, read 2026-10-08 and again 2026-11-17):
"Except as provided in the next sentence, the Materials may not be copied, reproduced, modified, published, uploaded, downloaded,
posted, transmitted, or distributed in any way, without hardrock.com's prior written permission. You may download one (1) copy of
the Materials on a single computer only for your personal, non-commercial, internal use." ("Materials" = "the text, information,
material, software and graphics contained on this web site".) Installed on the founder's decision of 2026-10-06 (the founder's
accepted risk). robots.txt (https://cafe.hardrock.com/robots.txt, read 2026-10-08 and 2026-11-17) allows everything (only Allow lines for js/css
and sitemap lines, no Disallow, no group naming an AI crawler); polite_get checks it on every URL anyway.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "hard-rock-cafe"
PAGE_URL = "https://cafe.hardrock.com/menu.aspx"
PHOTO_PREFIX = "https://cafe.hardrock.com/files/5282/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-hard-rock-cafe")
LONDON_URL = "https://cafe.hardrock.com/london/"
MENU_PDF_LINK = re.compile(r'href=["\']?(https://cafe\.hardrock\.com/london/files/5330/[^"\'\s>]*DRINKS_(?:&amp;|&)_EATS_MENU[^"\'\s>]*\.pdf)', re.I)
MIN_SIDE = 200
# Source B, read by eye from the rendered pages of the London Drinks & Eats menu (FEB 26) on 2026-11-17:
# SHA-256 (first 16 hex) of the embedded JPEG -> (page, the caption printed on that photo, as printed, what the photo shows).
REVIEWED: dict[str, tuple[int, str, str]] = {
    "c03df8967304cd46": (11, "The Classic Smashed Burger", "double smashed patties, American cheese, pickles, onions, lettuce, tomato, sauce"),
    "20c91c5b9cc3877f": (11, "Messi Chicken Sandwich", "two crispy chicken fillets, white sauce, tomato, lettuce in a bun"),
    "23a44616f3faf4ae": (11, "BBQ Bacon Burger", "beef patty, barbecue sauce, cheddar, bacon, crispy onion strings, lettuce, tomato"),
    "26e6527894c2fdbb": (11, "Spicy Diablo Smashed Burger", "double smashed patties, pepper jack cheese, jalapenos, lettuce, tomato"),
    "30a1d51a2636986c": (11, "Original Legendary® Burger", "beef patty, cheddar, bacon, onion ring, lettuce, tomato (menu-page photo kept)"),
    "6c124cf752038eb7": (11, "Legendary® Smashed Burger", "double smashed patties, cheddar, bacon, pickles, fried onions"),
    "8e0c5e80410ae915": (26, "Strawberry Basil Lemonade", "the drink in the cafe's branded glass with strawberry and basil, a hand squeezing a lemon"),
}
DROP_ITEMS: dict[str, str] = {     # item id -> why it was looked at and left without a photo (a rerun must not bring it back)
    "hot-fudge-brownie": "the chain's photo for this dish shows an ice-cream sundae in a glass (whipped cream, hot fudge, cherry); "
                         "no brownie is visible, so it does not clearly show the named item",
}

RECORD = re.compile(r'<div class="featuredItem [^"]*">(?P<body>.*?)</script>', re.S)
IMG = re.compile(r"<img\b(?P<attrs>[^>]*)>", re.S)
ATTR = re.compile(r"""([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))""")
H3 = re.compile(r"<h3>(?P<t>.*?)</h3>", re.S)


def clean(fragment: str) -> str:
    s = re.sub(r"<br\s*/?>", " ", fragment)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("®", "").replace("™", "")
    return " ".join(s.split())


def pdf_layout(pdf: Path, workdir: Path) -> dict[int, dict]:
    """Per page: {"images": [(sha16, raw JPEG, (top, left, width, height))], "texts": [(words, (top, left, width, height))]} from
    `pdftohtml -xml` (which writes each embedded JPEG stream unchanged). Pictures smaller than MIN_SIDE on a side are left out."""
    workdir.mkdir(parents=True, exist_ok=True)
    for old in workdir.iterdir():
        old.unlink()
    subprocess.run(["pdftohtml", "-xml", "-q", str(pdf), str(workdir / "m")], capture_output=True, check=True)
    xml = (workdir / "m.xml").read_text("utf-8", "replace")
    from PIL import Image
    out: dict[int, dict] = {}
    for pm in re.finditer(r'<page number="(\d+)"(.*?)</page>', xml, re.S):
        page = {"images": [], "texts": []}
        for im in re.finditer(r'<image top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" src="([^"]+)"', pm.group(2)):
            f = Path(im.group(5))
            f = f if f.is_absolute() else workdir / f.name
            if f.suffix.lower() not in (".jpg", ".jpeg") or not f.exists():
                continue
            raw = f.read_bytes()
            with Image.open(f) as pic:
                if min(pic.size) < MIN_SIDE:
                    continue
            page["images"].append((hashlib.sha256(raw).hexdigest()[:16], raw, tuple(int(im.group(i)) for i in range(1, 5))))
        for t in re.finditer(r'<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="\d+">(.*?)</text>', pm.group(2), re.S):
            words = clean(t.group(5))
            if words:
                page["texts"].append((words, tuple(int(t.group(i)) for i in range(1, 5))))
        out[int(pm.group(1))] = page
    return out


def inside(inner: tuple, outer: tuple, slack: int = 2) -> bool:
    it, il, iw, ih = inner
    ot, ol, ow, oh = outer
    return it >= ot - slack and il >= ol - slack and it + ih <= ot + oh + slack and il + iw <= ol + ow + slack


def records(page: str) -> list[dict]:
    """Every featured-item record that has a photo file and a dish name: {name, title, alt, photo}."""
    out = []
    for m in RECORD.finditer(page):
        body = m.group("body")
        im, h3 = IMG.search(body), H3.search(body)
        if not im or not h3:
            continue
        attrs = {a.lower(): (b or c or d) for a, b, c, d in ATTR.findall(im.group("attrs"))}
        photo = html.unescape(attrs.get("data-originalsrc", ""))
        if not photo.startswith(PHOTO_PREFIX):
            continue
        out.append({"name": clean(h3.group("t")), "title": html.unescape(attrs.get("title", "")),
                    "alt": html.unescape(attrs.get("alt", "")), "photo": photo})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    matches: dict[str, str] = {}      # item id -> original photo URL
    skipped: list[str] = []
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        recs = records(page)
        print(f"{len(recs)} featured items with a photo and a dish name on {PAGE_URL}")
        for r in recs:
            key = norm_name(r["name"])
            its = by_key.get(key)
            if not its:
                skipped.append(f"{r['name']!r}: no published item with this name (photo title {r['title']!r})")
                continue
            if norm_name(r["title"]) != key:
                skipped.append(f"{r['name']!r}: the photo's own title is {r['title']!r}, not the dish name")
                continue
            if len(its) != 1:
                skipped.append(f"{r['name']!r} is the name of {len(its)} published items")
                continue
            item = its[0]
            if item["id"] in DROP_ITEMS:
                skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                continue
            matches[item["id"]] = r["photo"]
            print(f"MATCH {item['id']}: {r['name']!r} -> {r['photo']}")

        rows: dict[str, tuple[str, str]] = {}
        stored: dict[str, str] = {}       # photo url -> stored file name
        for item_id, photo in sorted(matches.items()):
            raw = polite_get(photo, args.cache, referer=PAGE_URL)
            if photo not in stored:
                try:
                    stored[photo] = "" if args.dry_run else store_image(CHAIN_ID, raw)
                except ValueError as e:
                    skipped.append(f"{item_id}: {photo}: {e}")
                    stored[photo] = ""
                    continue
            if stored[photo] or args.dry_run:
                rows[item_id] = (stored[photo] or "dry-run", PAGE_URL)

        # ---- source B: the London Drinks & Eats menu PDF (captioned photos)
        london = polite_get(LONDON_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        links = sorted({html.unescape(u) for u in MENU_PDF_LINK.findall(london)})
        if len(links) != 1:
            print(f"the London page links {len(links)} Drinks & Eats menus ({links}): look at the page and update the script", file=sys.stderr)
            return 1
        pdf_url = links[0]
        pdf_bytes = polite_get(pdf_url, args.cache, accept="application/pdf,*/*;q=0.8", referer=LONDON_URL)
    except Blocked as e:
        print(f"BLOCKED: {e}", file=sys.stderr)
        return 1

    if not pdf_bytes.startswith(b"%PDF"):
        print(f"{pdf_url} is not a PDF: stopped", file=sys.stderr)
        return 1
    pdf_dir = args.cache / "london-menu-pdf"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf = pdf_dir / "menu.pdf"
    pdf.write_bytes(pdf_bytes)
    print(f"London menu: {pdf_url} ({len(pdf_bytes):,} bytes)")
    layout = pdf_layout(pdf, args.cache / "london-menu-xml")
    seen: set[str] = set()
    for pg, page in sorted(layout.items()):
        for sha, raw, box in page["images"]:
            seen.add(sha)
            # the lines printed over this picture and over no other picture of the page
            own = [w for w, tb in page["texts"] if inside(tb, box) and sum(inside(tb, b2) for _, _, b2 in page["images"]) == 1]
            naming = [w for w in own if len(by_key.get(norm_name(w), [])) >= 1]
            if sha not in REVIEWED:
                if naming:
                    print(f"  NOT REVIEWED: photo {sha} on page {pg} carries {naming}: render the page, look, and add it to REVIEWED if it shows that dish")
                continue
            want_page, caption, _ = REVIEWED[sha]
            if pg != want_page:
                skipped.append(f"PDF caption {caption!r}: photo {sha} moved from page {want_page} to {pg}: look again")
                continue
            if norm_name(caption) not in {norm_name(w) for w in own}:
                skipped.append(f"PDF caption {caption!r} is no longer printed on photo {sha} (page {pg})")
                continue
            if len(naming) != 1:
                skipped.append(f"PDF photo {sha} (page {pg}) carries {len(naming)} lines naming published items ({naming}): ambiguous")
                continue
            its = by_key.get(norm_name(caption), [])
            if len(its) != 1:
                skipped.append(f"PDF caption {caption!r}: {len(its)} published items carry that exact name")
                continue
            item = its[0]
            if item["id"] in DROP_ITEMS:
                skipped.append(f"{item['id']}: dropped after looking: {DROP_ITEMS[item['id']]}")
                continue
            if item["id"] in rows:
                skipped.append(f"{item['id']}: also captioned in the London menu (page {pg}); the menu-page photo is kept")
                continue
            if args.dry_run:
                rows[item["id"]] = ("dry-run", pdf_url)
                print(f"MATCH {item['id']}: PDF page {pg} photo {sha} {caption!r}")
                continue
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item['id']}: PDF photo {sha}: {e}")
                continue
            rows[item["id"]] = (fname, pdf_url)
            print(f"MATCH {item['id']}: PDF page {pg} photo {sha} {caption!r} -> {fname}")
    for sha, (pg, caption, _) in sorted(REVIEWED.items()):
        if sha not in seen:
            skipped.append(f"PDF caption {caption!r}: its photo {sha} (page {pg}) is no longer in the menu")

    for s in skipped:
        print("skipped:", s)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for fname, ids in suspected_placeholders(rows, threshold=2).items():
        print(f"shared photo {fname}: {ids}")
    if not args.dry_run:
        write_images_csv(CHAIN_ID, rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
