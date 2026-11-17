#!/usr/bin/env python3
"""Item photos for TGI Fridays UK (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_tgi_fridays.py --cache DIR --dry-run   # list matches; downloads only pages and the menu PDF
    python3 tools/uk_extract/images_tgi_fridays.py --cache DIR             # download, store, write images.csv

Every photo comes from the chain's own website, www.tgifridays.co.uk, and is attached to a published item (items.csv minus holdback.csv)
only when the chain's own page or menu names that exact dish (images_common.norm_name equality, with the trademark signs (TM) and (R) taken out
first on both sides: see key(); nothing fuzzy). Three sources, in this
order (an item takes the first photo found for it):

  A. Dish cards on the chain's own web pages (PAGES below; /new-menu first). A card is an <img> followed, before the next <img>, by an <h3>
     with the dish name; the card's photo goes to the item whose name is exactly that heading. Also, on the same pages, a food photo whose
     own alt text is exactly a published dish name (e.g. /promotions/everyday-trio: alt="Maple-Glazed Corn Ribs").
     The pages serve a Drupal image style (which may crop); the original upload sits at the same file name without
     "/styles/<style>/public" and without the ".webp" suffix, so that file is fetched instead (see original_url).
  B. Captions printed on the photos of the chain's own food menu PDF, the file the chain's /menu page links as "Food Menu"
     (https://www.tgifridays.co.uk/sites/default/files/2026-05/TGI_web26_menu.pdf on 2026-11-17). On the photos of that menu the chain prints
     the dish's name as a caption ("TGI COMBO", "NEW TRIPLE CHICKEN PLATTER", "FRIDAYS(TM) SIGNATURE / WHISKEY-GLAZED STEAK"...). Rule:
       1. every text line of the PDF and its box are read with `pdftotext -bbox-layout`; a caption is one line, or two lines stacked directly
          under each other with the same left edge and the same height; a line that carries a price ("|") is a menu listing, never a caption;
          (a dish's name in the menu's listings, beside a price, is never tied to a photo by position: only captions are)
       2. the caption's words must be exactly a published item's name (norm_name), after dropping a leading "NEW" badge only when the full
          words match nothing ("NEW KING PRAWN MEXI BOWL" -> "King Prawn Mexi Bowl"; "NEW CHICKEN QUESADILLAS" is NOT "Chicken Quesadilla");
       3. the caption's box must lie wholly inside (EDGE = 3 pt of slack for the font's ascent/descent) the box where the PDF draws one photo (an image of 200 px or more, placed by the page's own
          content stream, read with pypdf), and that photo must carry no other dish caption: a photo that shows two captioned dishes
          (the Salads & Bowls photo: "NEW KING PRAWN MEXI BOWL" and "CRISPY CHICKEN SALAD" on one picture) is skipped, never cut up;
       4. the photo is the image exactly as embedded in the PDF: its JPEG bytes (the PDF wraps them in Flate compression, which is undone;
          the JPEG itself is not decoded or re-encoded before store_image). Images stored any other way are skipped.
     The rows' source_url is the PDF's address (linked from https://www.tgifridays.co.uk/menu).
  (The PDF is read only with pdftotext and pypdf; images smaller than 200 px, such as the 406 x 182 Dirt and Worm Pie picture, are icons
  or too small for store_image and are never used.)

Not used, and why:
  * images.tenkites.com (the per-item photos of the chain's online allergen menu, viewthe.menu/2alz): its robots.txt has
    `Disallow: /` for every agent (re-read 2026-11-17).
  * https://tgifuk.toast.site/ (the chain's Click & Collect ordering site, linked from /takeaway): its robots.txt (read 2026-11-17)
    disallows only /admin, /account, /checkout, /cart and /confirm, but the site's own home page answered HTTP 403 to our first request
    on 2026-11-17, so nothing more was asked of it or of Toast's other hosts (never worked round).
  * Deliveroo, Just Eat and Uber Eats (linked from /takeaway/delivered): third parties, never used.
  * The kids menu PDF (2026-09/kids menu_web.pdf): its only images are 93 px or smaller (icons).

Not matched, on purpose (names that are not a published item's exact name): web cards "Big AF Burger" (item: "Loaded Cheese Fry Big AF
Burger"), "Chicken Quesadillas" (item: "Chicken Quesadilla"), "Fridays Whiskey Glaze Ribs", "Three For All", "Blackened Shrimp Mexi Bowl",
"Chicken & Steak Fajita Combo", "Mozzarella sticks", "Cheese quesadillas", "Loaded potato skins"; menu PDF captions
"NEW CHICKEN QUESADILLAS", "FRIDAYS(TM) SIGNATURE WHISKEY-GLAZED RIBS" (the items are "... Half Rack ..." and "Full Rack ..."), "Sizzling
FAJITA COMBO"; and "Cajun Shrimp & Chicken Pasta" (held back in holdback.csv).

Left out after looking (EXCLUDE_PHOTOS, by the photo's own file, so a rerun can't bring them back): see the dict below.

Politeness / robots: www.tgifridays.co.uk/robots.txt (re-read 2026-11-17): one group, `User-agent: *`, disallowing only /core/, /profiles/,
admin, user, search and oembed paths; the pages above, /sites/default/files/ (photos and PDFs) are allowed. polite_get checks robots.txt on
every URL (RFC 9309), keeps 1 request a second per host and stops on 401/403/429.

Terms (https://www.tgifridays.co.uk/terms-of-use, re-read 2026-11-17): "You are allowed to access, download and print the materials on this site
for your own personal, non-commercial use only ... You must not: copy (including storing and downloading), distribute, publish, alter, adapt,
create derivative works from, or otherwise use the material on this site, either in whole or in part except as expressly permitted above; ...
frame, embed, harvest or link to this site or its content ..." and "We are the owner or licensee of all intellectual property rights in the site
and in the materials ... This includes but is not limited to the text, photographs, images ...". An express restriction; installed on the
founder's decisions of 2026-10-06 (his accepted risk).

A 401/403/429 or a robots refusal on www.tgifridays.co.uk stops the script (exit 2) before images.csv is written.

Run of 2026-11-17: 10 photos (was 4). Web: Brownie Obsession, Chips & Guacamole, Dirt and Worm Pie, Ribeye Steak (the site's Ribeye.jpg is a
new upload since 2026-10-08, so its file name changed), Maple Glazed Corn Ribs (new). Menu PDF captions (new): TGI Combo, Triple Chicken Platter,
Fridays(TM) Signature Whiskey-Glazed Chicken, Fridays(TM) Signature Whiskey-Glazed Steak, Wicked Chicken. All ten looked at on a contact sheet:
each shows the dish named, with no printed words, numbers, badges or logos. The Wicked Chicken JPEG is stored as embedded: the PDF hides
two black wedges at its top and bottom with its own soft mask, which is not applied here (applying it would change the picture), so the
stored photo shows them.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import subprocess
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "tgi-fridays"
SITE = "https://www.tgifridays.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,*/*;q=0.8"
MENU_PAGE = SITE + "/menu"
MENU_PDF_FALLBACK = SITE + "/sites/default/files/2026-05/TGI_web26_menu.pdf"
# The chain's own pages that show dish photos, in priority order (source A).
PAGES = [
    SITE + "/new-menu",
    SITE + "/vegetarian-and-vegan-menu",
    SITE + "/promotions/everyday-trio",
    SITE + "/our-60th-birthday/fridays-favourites",
    SITE + "/promotions/sharing-platters",
    SITE + "/promotions/teen-takeover",
    SITE + "/kids",
]
MIN_PDF_IMAGE = 200   # px: smaller PDF images are icons and badges
EDGE = 3.0            # points: a text line's box (pdftotext adds the font's ascent and descent) may reach this far past the photo's edge

# Photos left out after looking at them, keyed by the photo's own file path on the site, or "<pdf file>#<page>:<image name>" for a PDF image.
EXCLUDE_PHOTOS: dict[str, str] = {
    "/sites/default/files/2025-03/Onion%20Rings.jpg":
        "card 'Cajun Spiced Onion Rings' (/our-60th-birthday/fridays-favourites): the picture is two onion rings on a steak plate (steak, "
        "lettuce wedge, tomatoes): part of another dish, not the side order",
    "/sites/default/files/2026-07/BBQ.jpg":
        "alt 'BBQ sauce' (/promotions/teen-takeover): a 'CLASSIC BBQ SAUCE' label graphic, not food",
}
# Item ids never given a photo (checked by eye after a download), e.g. {"item-id": "why"}
EXCLUDE: dict[str, str] = {}


# ---------------------------------------------------------------- source A: web pages

def key(name: str) -> str:
    """images_common.norm_name, with the trademark signs taken out first: norm_name's Unicode folding turns "\u2122" into the letters "tm",
    so "Fridays\u2122 Signature" (items.csv) and "FRIDAYS \u2122 SIGNATURE" (the PDF's text layer) would otherwise differ. No word is dropped."""
    return ic.norm_name(name.replace("\u2122", " ").replace("\u00ae", " "))


def _text(fragment: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def read_cards(page: str) -> list[dict]:
    """Photos on a page with the names the page gives them: {name, src, how}. For every <img> under /sites/default/files/: the <h3> that
    follows it before the next <img> (how="heading"), and its own alt text (how="alt")."""
    out = []
    imgs = list(re.finditer(r"<img\b[^>]*>", page))
    for i, m in enumerate(imgs):
        src = re.search(r'\ssrc="([^"]+)"', m.group(0))
        if not src or "/sites/default/files/" not in src.group(1):
            continue
        src_url = htmllib.unescape(src.group(1))
        end = imgs[i + 1].start() if i + 1 < len(imgs) else len(page)
        h = re.search(r"<h3\b[^>]*>(.*?)</h3>", page[m.end():end], flags=re.S)
        if h:
            out.append({"name": _text(h.group(1)), "src": src_url, "how": "heading"})
        alt = re.search(r'\salt="([^"]*)"', m.group(0))
        if alt and alt.group(1).strip():
            out.append({"name": _text(alt.group(1)), "src": src_url, "how": "alt"})
    return out


def original_url(src: str) -> str:
    """The un-styled upload behind a Drupal image-style URL (no crop): /sites/default/files/styles/<s>/public/<path>.webp?itok=.. -> /sites/default/files/<path>"""
    path = src.split("?")[0]
    m = re.match(r"(.*?/sites/default/files)/styles/[^/]+/public/(.+?)(\.webp)?$", path)
    base = f"{m.group(1)}/{m.group(2)}" if m else path
    if base.startswith("/"):
        base = SITE + base
    return base


def site_path(url: str) -> str:
    return re.sub(r"^https?://[^/]+", "", url)


# ---------------------------------------------------------------- source B: the menu PDF

def menu_pdf_url(menu_page: str) -> str:
    """The PDF the /menu page lists under its "Food Menu" heading."""
    i = menu_page.find(">Food Menu<")
    m = re.search(r'href="([^"]+\.pdf)"', menu_page[i:]) if i >= 0 else None
    if not m:
        print(f"  note: no 'Food Menu' PDF found on {MENU_PAGE}; using {MENU_PDF_FALLBACK}")
        return MENU_PDF_FALLBACK
    u = htmllib.unescape(m.group(1))
    return u if u.startswith("http") else SITE + u


def pdf_lines(pdf: Path) -> dict[int, list[dict]]:
    """Text lines per page (1-based) with their boxes in points from the top-left: {x0, y0, x1, y1, text}."""
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    pages: dict[int, list[dict]] = {}
    for pno, pg in enumerate(re.split(r"<page ", out)[1:], 1):
        rows = []
        for ln in re.finditer(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', pg, flags=re.S):
            words = [htmllib.unescape(w) for w in re.findall(r">([^<]*)</word>", ln.group(5))]
            x0, y0, x1, y1 = (float(v) for v in ln.groups()[:4])
            rows.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "text": " ".join(words)})
        pages[pno] = rows
    return pages


def captions(lines: list[dict]) -> list[dict]:
    """Single lines, and pairs of lines stacked directly under each other (same left edge, same height): never a line with a price ('|')."""
    lines = [ln for ln in lines if "|" not in ln["text"]]
    out = [dict(ln) for ln in lines]
    for a in lines:
        for b in lines:
            if b is a:
                continue
            ha, hb = a["y1"] - a["y0"], b["y1"] - b["y0"]
            if abs(a["x0"] - b["x0"]) <= 3 and abs(ha - hb) <= 1.5 and 0 < b["y0"] - a["y0"] <= ha and b["y0"] - a["y1"] <= 2:
                out.append({"x0": min(a["x0"], b["x0"]), "y0": a["y0"], "x1": max(a["x1"], b["x1"]), "y1": b["y1"],
                            "text": a["text"] + " " + b["text"]})
    return out


def pdf_images(pdf: Path) -> dict[int, list[dict]]:
    """Image XObjects drawn on each page: {name, w, h, box (x0, y0, x1, y1 from the top-left, points), obj}."""
    import pypdf  # dev tool only

    reader = pypdf.PdfReader(str(pdf))
    pages: dict[int, list[dict]] = {}
    for pno, page in enumerate(reader.pages, 1):
        height = float(page.mediabox.height)
        res = page.get("/Resources") or {}
        xobjs = res.get("/XObject") or {}
        found: list[dict] = []

        def visit(op, args, cm, tm, xobjs=xobjs, found=found, height=height):
            if op != b"Do" or not args:
                return
            ref = xobjs.get(args[0])
            if ref is None:
                return
            obj = ref.get_object()
            if obj.get("/Subtype") != "/Image":
                return
            a, b, c, d, e, f = (float(v) for v in cm)
            xs = (e, e + a, e + c, e + a + c)
            ys = (f, f + b, f + d, f + b + d)
            found.append({"name": str(args[0]), "w": int(obj["/Width"]), "h": int(obj["/Height"]),
                          "box": (min(xs), height - max(ys), max(xs), height - min(ys)), "obj": obj})

        page.extract_text(visitor_operand_before=visit)
        pages[pno] = found
    return pages


def jpeg_bytes(obj) -> bytes | None:
    """The image's JPEG exactly as embedded: DCTDecode data, with a Flate wrapper undone. Anything else -> None (not re-encoded)."""
    filt = obj.get("/Filter")
    filters = [str(x) for x in filt] if isinstance(filt, list) else [str(filt)]
    raw = obj._data
    if filters == ["/DCTDecode"]:
        data = raw
    elif filters == ["/FlateDecode", "/DCTDecode"]:
        data = zlib.decompress(raw)
    else:
        return None
    return data if data[:2] == b"\xff\xd8" else None


def pdf_matches(pdf: Path, pdf_name: str, by_name: dict[str, list[dict]], notes: list[str]) -> dict[str, tuple[bytes, str]]:
    """{item_id: (jpeg bytes, photo key)} from captions printed on the menu PDF's photos (rule B in the docstring)."""
    lines = pdf_lines(pdf)
    images = pdf_images(pdf)
    out: dict[str, tuple[bytes, str]] = {}
    for pno in sorted(images):
        big = [im for im in images[pno] if im["w"] >= MIN_PDF_IMAGE and im["h"] >= MIN_PDF_IMAGE]
        hits: dict[str, list[tuple[str, dict]]] = {}   # image name -> [(caption text, item)]
        for cap in captions(lines.get(pno, [])):
            k = key(cap["text"])
            items = by_name.get(k)
            if not items and k.startswith("new "):
                items = by_name.get(k[4:])
            if not items:
                continue
            inside = [im for im in big if im["box"][0] - EDGE <= cap["x0"] and cap["x1"] <= im["box"][2] + EDGE
                      and im["box"][1] - EDGE <= cap["y0"] and cap["y1"] <= im["box"][3] + EDGE]
            if len(inside) != 1:
                notes.append(f"PDF p{pno} caption {cap['text']!r}: on {len(inside)} photos -> none")
                continue
            if len(items) != 1:
                notes.append(f"PDF p{pno} caption {cap['text']!r}: {len(items)} items share this name -> none")
                continue
            hits.setdefault(inside[0]["name"], []).append((cap["text"], items[0]))
        for im in big:
            caps = hits.get(im["name"], [])
            ids = {it["id"] for _, it in caps}
            if not caps:
                continue
            if len(ids) > 1:
                notes.append(f"PDF p{pno} {im['name']}: one photo carries {len(ids)} dish captions ({', '.join(sorted(t for t, _ in caps))}) -> none")
                continue
            it = caps[0][1]
            photo_key = f"{pdf_name}#{pno}:{im['name']}"
            if photo_key in EXCLUDE_PHOTOS:
                notes.append(f"PDF p{pno} {im['name']} ({it['name']}): excluded ({EXCLUDE_PHOTOS[photo_key]})")
                continue
            data = jpeg_bytes(im["obj"])
            if data is None:
                notes.append(f"PDF p{pno} {im['name']} ({it['name']}): not a plain embedded JPEG -> none")
                continue
            if it["id"] not in out:
                out[it["id"]] = (data, photo_key)
    return out


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    cache = Path(args.cache)
    items = ic.load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(key(it["name"]), []).append(it)
    notes: list[str] = []

    try:
        # source A: web pages
        web: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, how)
        for page_url in PAGES:
            page = ic.polite_get(page_url, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for c in read_cards(page):
                hits = by_name.get(key(c["name"]), [])
                if not hits:
                    continue
                if len(hits) != 1:
                    notes.append(f"{page_url} {c['name']!r}: {len(hits)} items share this name -> none")
                    continue
                it = hits[0]
                url = original_url(c["src"])
                if it["id"] in EXCLUDE:
                    notes.append(f"{c['name']}: item excluded ({EXCLUDE[it['id']]})")
                    continue
                if site_path(url) in EXCLUDE_PHOTOS:
                    notes.append(f"{page_url} {c['how']} {c['name']!r}: excluded ({EXCLUDE_PHOTOS[site_path(url)]})")
                    continue
                web.setdefault(it["id"], (url, page_url, c["how"]))

        # source B: the menu PDF
        menu_page = ic.polite_get(MENU_PAGE, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        pdf_url = menu_pdf_url(menu_page)
        pdf_raw = ic.polite_get(pdf_url, cache, accept="application/pdf,*/*;q=0.8", referer=MENU_PAGE)
    except ic.Blocked as e:
        print("STOP, blocked:", e)
        sys.exit(2)
    pdf_path = cache / "menu.pdf"
    pdf_path.write_bytes(pdf_raw)
    pdf_name = site_path(pdf_url)
    from_pdf = {iid: v for iid, v in pdf_matches(pdf_path, pdf_name, by_name, notes).items() if iid not in web and iid not in EXCLUDE}

    print(f"{len(items)} published items; {len(web)} matched on web pages, {len(from_pdf)} more from captions in {pdf_url}")
    for iid, (url, page_url, how) in sorted(web.items()):
        print(f"  {iid}  <-  {url}  ({how} on {page_url})")
    for iid, (_, photo_key) in sorted(from_pdf.items()):
        print(f"  {iid}  <-  {photo_key}  (menu PDF caption)")
    for n in notes:
        print("  not matched:", n)
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    try:
        for iid, (url, page_url, _) in sorted(web.items()):
            try:
                raw = ic.polite_get(url, cache, referer=page_url)
                rows[iid] = (ic.store_image(CHAIN_ID, raw), page_url)
            except ValueError as e:
                print(f"  skipped {iid}: {e}")
    except ic.Blocked as e:
        print("STOP, blocked:", e)
        sys.exit(2)
    for iid, (data, photo_key) in sorted(from_pdf.items()):
        try:
            rows[iid] = (ic.store_image(CHAIN_ID, data), pdf_url)
        except ValueError as e:
            print(f"  skipped {iid} ({photo_key}): {e}")
    ic.write_images_csv(CHAIN_ID, rows)
    print(f"stored {len(rows)} photos in web/public/menu-images/{CHAIN_ID}/ and wrote data/source/{CHAIN_ID}/images.csv")
    for f, ids in ic.suspected_placeholders(rows).items():
        print("  shared by 4+ items, look at it:", f, ids)


if __name__ == "__main__":
    main()
