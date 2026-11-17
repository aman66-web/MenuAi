#!/usr/bin/env python3
"""Item photos for British Garden Centres (the Gardener's Retreat restaurants) from the chain's own menu (docs/UK_DATA_PLAYBOOK.md, Phase 4;
helpers: images_common.py).

    python3 tools/uk_extract/images_british_garden_centres.py --cache DIR [--dry-run]

Needs poppler (`pdfimages`, `pdftohtml`), like british_garden_centres_pdf.py.

Source: the restaurant page https://www.britishgardencentres.com/departments/the-gardeners-retreat-restaurant/ links the menu as a PDF ("The menu is
in PDF format"). On 2026-11-17 that link is https://www.britishgardencentres.com/wp-content/uploads/2026/10/21-x-21cm-GR-Menu-Online-October-2026.pdf
(12 pages, created 9 October 2026, InDesign). The menu our items were read from (GR-Menu-Online-March2026.pdf, see british_garden_centres.py) now
answers 404. The script reads the page, takes the menu PDF it links (any /wp-content/uploads/... .pdf whose name contains "GR-Menu"), and stops if
there is none or more than one. Nothing else on the site is used: the restaurant page's own pictures are section squares ("GR-Breakfast-Web-Square",
"GR-Salad-Web-Square", "restaurant-gr-carvery", "Big-breakfast-GR-landscape-edited") that the page does not name after one dish.

The menu prints a dish photo in a circle with the dish's name set beside it as a caption ("The Big Breakfast", "Breakfast Muffin", "Scrambled Eggs &
Smoked Salmon", ...), in the menu's 14 pt caption type (not the 17 pt type of the dish headings). The PDF holds each photo as an embedded JPEG
(`pdfimages -j` writes that stream unchanged; store_image then only resizes and converts to WebP). The PDF does not say in machine-readable form
which caption belongs to which circle (the circles are clipping paths, and the image rectangles overlap the neighbouring captions), so which photo
sits beside which caption was read by eye from the rendered pages on 2026-11-17 and is written in CAPTIONED below, keyed by the SHA-256 of the
embedded JPEG. A changed or new picture therefore never gets a photo until someone looks again (the run lists it).

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. its SHA-256 is in CAPTIONED and the picture is on the page CAPTIONED says,
  2. the caption CAPTIONED gives is printed on that page in 14 pt type (lines of one caption joined: "Scrambled Eggs &" + "Smoked Salmon";
     compared with norm_name, so the menu's curly apostrophe in "Ploughman’s Platter" counts), and
  3. that caption has the same norm_name as exactly one published item's name.
So "Gammon Steak" (our item is "8oz Gammon Steak"), "Ham and Melted Cheese Ciabatta" (our item is "Ham, Melted Cheese Ciabatta"), "Shredded Crispy
Chicken Wrap" (two published wraps carry those words) and "Tomato Linguine" (no published item; the March menu had none) get no photo. The October
menu's captions name dishes of the March menu our figures come from (the caption "Shredded Crispy Chicken Salad with a Ranch Dressing" is printed
beside the salad photo although the October salad list itself names a katsu version): the caption, not the dish list, ties the photo.

robots.txt (https://www.britishgardencentres.com/robots.txt, read 2026-11-17, Yoast block): `User-agent: *` disallows /wp-admin/, /wp-login.php,
/wp-includes/, shop search and quick-checkout pages, /?s=, /search/*, /*.js and /*.css: the restaurant page and /wp-content/uploads/ are allowed; no
group names an AI crawler (the script stops if one ever does). polite_get checks robots.txt on every URL (RFC 9309).

Terms: none found. The site has no general website terms page (its page sitemap lists only "mobile-terms-of-service", the Family Card terms and the
social media competition terms; /terms-and-conditions/, /terms-of-use/ and /website-terms-of-use/ answer 404, read 2026-11-17), and the mobile terms
have no clause about copying content. The menu itself says (page 3): "Photography is for illustration purposes only. We reserve the right to alter
items from time to time." Installed on the founder's decision of 2026-10-06 (his accepted risk); the chain's photos come down the day it asks
(delete web/public/menu-images/british-garden-centres/ and data/source/british-garden-centres/images.csv).

A 401/403/429, a robots refusal or an unreadable robots.txt stops the script (exit 1) before anything is written. With no match the real run writes
nothing.

Run of 2026-11-17: 10 captioned photos in the October 2026 menu, 6 attached (The Big Breakfast, Breakfast Muffin, Scrambled Eggs & Smoked Salmon,
Classic Cheeseburger, Ploughman's Platter, Shredded Crispy Chicken Salad with a Ranch Dressing), each looked at on a contact sheet: real photos of the
dish named, no lettering or figures.
"""
from __future__ import annotations

import argparse
import hashlib
import html as htmllib
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "british-garden-centres"
HOST = "https://www.britishgardencentres.com"
PAGE_URL = HOST + "/departments/the-gardeners-retreat-restaurant/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PDF_LINK = re.compile(r'href="(https://www\.britishgardencentres\.com/wp-content/uploads/\d{4}/\d{2}/[^"]*GR-Menu[^"]*\.pdf)"', re.I)
CAPTION_SIZE = 14          # pdftohtml's size for the menu's caption type (dish headings are 17)
MIN_SIDE = 200

# Read by eye from the rendered pages of 21-x-21cm-GR-Menu-Online-October-2026.pdf on 2026-11-17:
# SHA-256 of the embedded JPEG -> (page number, the caption printed beside that photo, as printed).
CAPTIONED: dict[str, tuple[int, str]] = {
    "2a4584adcae0b25b": (4, "The Big Breakfast"),                                    # plate: sausages, bacon, eggs, beans, hash browns, toast
    "7d4e44ef7a734ddd": (5, "Breakfast Muffin"),                                     # muffin with bacon, sausage, cheese
    "f8092204e4e8c25e": (5, "Scrambled Eggs & Smoked Salmon"),                       # two muffin halves, scrambled egg, salmon, watercress
    "3a5267508eb6ea9c": (6, "Tomato Linguine"),                                      # pasta with meatballs (no published item of that name)
    "e7ebf9456f6030c4": (7, "Gammon Steak"),                                         # gammon, egg, pineapple, chips (our item: "8oz Gammon Steak")
    "fce76191c0bea761": (7, "Classic Cheeseburger"),                                 # cheeseburger, onion rings, chips, coleslaw
    "51752a138993f420": (8, "Ploughman's Platter"),                                  # ploughman's board
    "8e88afae1da1b2db": (8, "Shredded Crispy Chicken Salad with a Ranch Dressing"),  # salad bowl with crispy chicken and white dressing
    "fa2163e49235a528": (9, "Shredded Crispy Chicken Wrap"),                         # wrap (two published wraps carry these words)
    "366db31e21d4c963": (10, "Ham and Melted Cheese Ciabatta"),                      # ciabatta (our item: "Ham, Melted Cheese Ciabatta")
}
# Looked at on contact sheets and left without a photo; a rerun must not bring them back. (None on 2026-11-17.)
DROP_ITEMS: dict[str, str] = {}


def check_robots(cache: Path) -> None:
    """Stops if robots.txt names an Anthropic agent (the owner's refusal); polite_get applies the `*` rules to every URL."""
    text = polite_get(HOST + "/robots.txt", cache, accept="text/plain,*/*;q=0.8").decode("utf-8", "replace")
    for line in text.splitlines():
        if line.split("#", 1)[0].strip().lower().startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip().lower()
            if any(w in agent for w in ("claude", "anthropic")):
                raise Blocked(f"robots.txt has a group for {agent!r}: the owner refuses Anthropic's agents; stopped")


def captions_by_page(pdf: Path) -> dict[int, set[str]]:
    """Every run of 14 pt text lines that sit under one another at the same left edge, joined, per page (pdftohtml -xml)."""
    xml = subprocess.run(["pdftohtml", "-xml", "-i", "-q", "-stdout", str(pdf)], capture_output=True, check=True).stdout.decode("utf-8", "replace")
    sizes = {m.group(1): int(m.group(2)) for m in re.finditer(r'<fontspec id="(\d+)" size="(\d+)"', xml)}
    out: dict[int, set[str]] = {}
    for pm in re.finditer(r'<page number="(\d+)"(.*?)</page>', xml, re.S):
        lines = []
        for t in re.finditer(r'<text top="(-?\d+)" left="(-?\d+)" width="\d+" height="(\d+)" font="(\d+)">(.*?)</text>', pm.group(2), re.S):
            if sizes.get(t.group(4)) != CAPTION_SIZE:
                continue
            words = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", t.group(5))).split())
            if words:
                lines.append((int(t.group(1)), int(t.group(2)), int(t.group(3)), words))
        groups: list[list] = []
        for top, left, height, words in sorted(lines, key=lambda x: (x[1], x[0])):
            g = groups[-1] if groups else None
            if g and abs(g[0] - left) <= 3 and 0 < top - g[1] <= 1.5 * height:
                g[1], g[2] = top, g[2] + " " + words
            else:
                groups.append([left, top, words])
        out[int(pm.group(1))] = {g[2] for g in groups}
    return out


def photos_by_page(pdf: Path, workdir: Path) -> dict[str, tuple[int, bytes]]:
    """{sha256[:16]: (page, the embedded JPEG stream as stored)} for every JPEG of at least MIN_SIDE x MIN_SIDE (pdfimages -j -p)."""
    workdir.mkdir(parents=True, exist_ok=True)
    for old in workdir.iterdir():
        old.unlink()
    subprocess.run(["pdfimages", "-j", "-p", str(pdf), str(workdir / "im")], capture_output=True, check=True)
    from PIL import Image
    out: dict[str, tuple[int, bytes]] = {}
    for f in sorted(workdir.glob("im-*.jpg")):
        raw = f.read_bytes()
        with Image.open(f) as im:
            if min(im.size) < MIN_SIDE:
                continue
        page = int(f.name.split("-")[1])
        out[hashlib.sha256(raw).hexdigest()[:16]] = (page, raw)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(norm_name(it["name"]), []).append(it)
    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    try:
        check_robots(args.cache)
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        links = sorted(set(PDF_LINK.findall(page)))
        if len(links) != 1:
            print(f"the restaurant page links {len(links)} menu PDFs ({links}): look at the page and update the script", file=sys.stderr)
            return 1
        pdf_url = htmllib.unescape(links[0])
        pdf_bytes = polite_get(pdf_url, args.cache, accept="application/pdf,*/*;q=0.8", referer=PAGE_URL)
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    if not pdf_bytes.startswith(b"%PDF"):
        print(f"{pdf_url} is not a PDF: stopped", file=sys.stderr)
        return 1
    pdf_dir = args.cache / "menu-pdf"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf = pdf_dir / "menu.pdf"
    pdf.write_bytes(pdf_bytes)
    print(f"menu: {pdf_url} ({len(pdf_bytes):,} bytes)")

    captions = captions_by_page(pdf)
    photos = photos_by_page(pdf, args.cache / "menu-pdf-images")
    print(f"{len(photos)} photos of at least {MIN_SIDE} px in the menu, {len(CAPTIONED)} of them in CAPTIONED")
    for sha, (pg, _) in sorted(photos.items(), key=lambda kv: kv[1][0]):
        if sha not in CAPTIONED:
            print(f"  NOT REVIEWED: photo {sha} on page {pg}: render the page, look, and add it to CAPTIONED if a caption names it")

    for sha, (want_page, caption) in sorted(CAPTIONED.items(), key=lambda kv: kv[1]):
        if sha not in photos:
            skipped.append(f"caption {caption!r}: its photo {sha} is no longer in the menu")
            continue
        pg, raw = photos[sha]
        if pg != want_page:
            skipped.append(f"caption {caption!r}: photo {sha} moved from page {want_page} to {pg}: look again")
            continue
        if norm_name(caption) not in {norm_name(c) for c in captions.get(pg, set())}:
            skipped.append(f"caption {caption!r} is no longer printed on page {pg}")
            continue
        found = by_name.get(norm_name(caption), [])
        if len(found) != 1:
            skipped.append(f"caption {caption!r}: {len(found)} published items carry that exact name")
            continue
        it = found[0]
        if it["id"] in DROP_ITEMS:
            skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
            continue
        if args.dry_run:
            print(f"  {it['id']:60} <- page {pg} photo {sha} {caption!r}")
            rows[it["id"]] = ("", pdf_url)
            continue
        try:
            fname = store_image(CHAIN_ID, raw)
        except ValueError as e:
            skipped.append(f"{it['id']}: photo {sha}: {e}")
            continue
        rows[it["id"]] = (fname, pdf_url)
        print(f"  {it['id']:60} {fname}  <- page {pg} photo {sha} {caption!r}")

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"dry run: {len(rows)} of {len(items)} published items matched; nothing stored")
        return 0
    if not rows:
        print("no match: nothing written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    total = sum(p.stat().st_size for p in (ROOT / "web" / "public" / "menu-images" / CHAIN_ID).glob("*.webp"))
    print(f"{len(rows)} of {len(items)} published items have a photo; {total / 1024:.0f} KB")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
