#!/usr/bin/env python3
"""Item photos for Buy & Bite from its own Nutrition Guide (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_buy_and_bite.py --cache DIR --dry-run   # read the guide, list the matches (nothing stored)
    python3 tools/uk_extract/images_buy_and_bite.py --cache DIR             # also store the photos and write images.csv

Needs poppler (`pdftohtml`, `pdfimages`), like buy_and_bite.py (which needs `pdftotext`).

Source: the chain's own "Nutrition Guide" PDF, https://www.buyandbite.co.uk/_files/ugd/88035e_3b02e06dfeee4c43a4902f6be64b120c.pdf, the file the
chain's Menu page (https://www.buyandbite.co.uk/menu) links as "Nutrition Guide" and the very file our figures are copied from (buy_and_bite.py; the
script stops unless the downloaded file has buy_and_bite.EXPECTED_SHA256, so the photos always come from the same document as the items). The guide
(7 A2 pages, made in Canva) prints each dish as a block: a round photo frame on the left, the dish's name in orange to its right, then its kcal, fat,
carbs and protein. Pages 1-3 (Omurice, Rice bowls, Noodle bowls), 6 and 7 (Bao buns & snacks, Sweet treats) give every dish its own photo this way.
Page 4 (Crunchy wraps: twelve sauce/protein rows, three wrap photos along the foot of the page, none beside a dish) and page 5 (Loaded waffle fries:
three names, one photo of a box of fries) tie no photo to one dish, so those 15 items get none.

How a photo is tied to a dish (read from the PDF itself, nothing guessed):
  * `pdftohtml -xml` gives every picture with the box it is drawn in (in drawing order) and every line of text with its box and font. A dish block
    is a run of lines in the guide's orange name font (#e25000) at one left edge ("Katsu Crispy Shrimp" + "Curry" -> "Katsu Crispy Shrimp Curry"),
    down to its "... protein" line; its section is the last big heading above it (OMURICE, RICE BOWLS, ...), on that page or an earlier one.
  * A picture is in a block's photo frame when the centre of its drawn box lies left of the block's text (at most SLOT_W to the left) and within
    SLOT_DY of the block's middle. Every picture whose centre is in a frame must be in exactly one frame. Where a frame holds several pictures
    (on pages 6 and 7 Canva puts a cut-out of the dish over a plain grey studio photo used as the backdrop), the dish's photo is the LAST one drawn,
    the one on top. The pictures are the guide's own image objects, taken whole: `pdfimages -j` writes a JPEG stream unchanged; a Flate-coded picture
    is written as PNG with its own soft mask (/SMask, part of the same PDF image object) as its alpha channel, i.e. the cut-out exactly as the
    guide defines it. Canva shows each picture through a round frame (and mirrors two of them); we take the image object as embedded, so nothing is
    cropped or flipped by us; store_image only downsizes to <= 640 px and writes WebP.
  * Every picture used was looked at by eye on 2026-11-17 against the rendered page and is listed in REVIEWED (SHA-256, first 16 hex, of the JPEG
    stream, or of the decoded pixels plus mask for a Flate picture -> page and the name printed beside it). A picture that is new or changed is
    never attached: the run lists it so someone looks first.
  * The item: buy_and_bite.py wrote "Printed '<name as printed>' under <HEADING>" in each item's notes. A photo is attached only to the one
    published item whose notes name exactly that block (norm_name of the printed name and the same heading). Held-back items (holdback.csv) get
    none; DROP_ITEMS (looked at and left out) get none.
source_url = the guide's own URL (the document that shows the photo beside the dish).

Also looked at (nothing taken): the Menu page and the section pages /ricebowl, /noodlebowl, /snackpots, /breakfast show a few photos whose alt
text names a dish; only two names are exactly one of our items ('spicy korean chicken rice bowl', 'sweet potato balls') and the guide has its own
photo for both, so the guide's is used; the others ('Teriyaki tofu noodles', 'green coconut curry with roasted chicken rice bowl', 'tempura prawn
bao bun', 'octopus ball with mayo', breakfast buns) do not name one of our items exactly. The ordering site the home page links ("Order Now":
order.kurvekiosks.com/688-farringdon, /1962-soho-noel-street, /2078-wembley-park) shows its menu only after a dining-option form is submitted;
we submit no forms, so it was not used.

Robots (read 2026-11-17, RFC 9309 via images_common): https://www.buyandbite.co.uk/robots.txt is Wix's: `User-agent: * / Allow: / / Disallow:
*?lightbox=`, plus groups for AdsBot-Google (Disallow /_partials*, /pro-gallery-webapp/v1/galleries/*), PetalBot (Disallow: /), dotbot and
AhrefsBot (Crawl-delay 10); no group names an AI crawler; the Menu page and /_files/ugd/ are allowed. (order.kurvekiosks.com/robots.txt answers
an empty file: no rules; only its store and terms pages were read, no photo is taken from it.) Any 401/403/429 or a robots refusal stops the run
before anything is written; we never work round a block.

Terms (read 2026-11-17): www.buyandbite.co.uk publishes no terms of use: none is linked from its pages (home, menu, section pages, catering,
newsletter page: the only "terms & conditions" is the newsletter tick box, with no link) and none is listed in its sitemap (pages-sitemap.xml). The
ordering site's terms for the restaurant (https://order.kurvekiosks.com/2078-wembley-park/terms, linked from that store's ordering page) say: "The
content referring to specific products (e.g. food items), arrangement and texts layout of the online ordering application and/or process, the
trademarks, and any other content, are proprietary and are protected according with the legal regulations in force and cannot be used in any way
without the express written permission of the Restaurant." (That clause covers the ordering application's content; no photo is taken from there.)
Photos are installed on the founder's decision of 2026-10-06 whatever a chain's terms say (his accepted risk, CLAUDE.md rule 2).

Run of 2026-11-17 (first run): the Menu page still links the guide; the guide's SHA-256 is EXPECTED_SHA256. 49 dish blocks, 53 pictures. 27 published
items have a picture in their frame (pages 1-3, 6, 7); every one was looked at full size against the rendered page and matches the dish printed
beside it, with no printed figure, price, sticker, logo or lettering (the gyoza and karaage trays are plain kraft card with greaseproof paper).
1 left out (DROP_ITEMS: Sweet Potato Balls, the dish tiny in a large frame). Mochi is kept although it is a white cut-out that is faint on a
white tile. 26 of 42 published items have a photo (548 KB). No photo: the 12 crunchy wraps and 3 loaded fries (no per-dish photo in the guide),
Sweet Potato Balls (above). The 7 held-back dishes have pictures in the guide but are not published.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import buy_and_bite  # noqa: E402  (SOURCE_URL, EXPECTED_SHA256: the guide our items were read from)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "buy-and-bite"
MENU_URL = "https://www.buyandbite.co.uk/menu"
PDF_URL = buy_and_bite.SOURCE_URL
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-buy-and-bite")
NAME_COLOUR = "#e25000"      # the guide's orange dish-name font
HEADING_SIZE = 100           # pdftohtml font size of the section headings (106) and the page banner (skipped by its text)
SLOT_W = 500                 # pdftohtml units (1.5 per pt): a photo frame's centre lies at most this far left of its dish's text
SLOT_DY = 150                # ... and at most this far above or below the middle of the dish's block
MIN_SIDE = 200

# Looked at by eye on 2026-11-17 (each picture full size, next to the rendered guide page):
# picture key -> (page, name printed beside it, what the picture shows)
REVIEWED: dict[str, tuple[int, str, str]] = {
    "dbaad327e6be8a92": (1, "Green Curry Tofu", "omurice: omelette on rice, green curry, crispy tofu, lime, edamame, carrot; lilac backdrop"),
    "da193b2adac86e8d": (1, "Katsu Chicken Curry", "omurice: chicken katsu, curry sauce, omelette, pickled ginger, edamame, carrot; lilac backdrop"),
    "c5eb6f8011eba324": (1, "Green Curry Chicken", "omurice: omelette, green curry with roasted chicken pieces, lime, edamame, carrot; lilac backdrop"),
    "f7fdc4f3be83dedb": (2, "Green Curry Chicken", "rice bowl (cut-out): mixed-grain rice, green curry with chicken, carrot, lime"),
    "e15e61d1cc22a698": (2, "Katsu Chicken Curry", "rice bowl: sliced chicken katsu on curry, rice, carrot, spring onion, ginger; yellow backdrop"),
    "ff13ad137db6c950": (2, "Green Curry Tofu", "rice bowl: three crispy tofu pieces in green curry, rice, carrot, lime; green backdrop"),
    "0b5d8ec4a5a0beb3": (2, "Spicy Korean Chicken", "rice bowl: spicy Korean chicken, rice, spring onion, carrot, chilli; green backdrop"),
    "8c1207b2f5685d6d": (2, "Sweet & Sour Chicken", "rice bowl (cut-out): chicken in red sweet & sour sauce, rice, spring onion, carrot"),
    "8cd7c94f85c03ac9": (2, "Sweet & Sour Tofu", "rice bowl (cut-out): tofu in red sweet & sour sauce, rice, spring onion, carrot"),
    "06cf91de0b656a80": (2, "Katsu Tofu Curry", "rice bowl (cut-out): three crispy tofu pieces on curry, rice, spring onion, carrot, ginger"),
    "e30b272862b8cfdd": (3, "Korean Spicy Chicken", "noodle bowl: spicy chicken, noodles, red pepper, edamame, carrot, herbs; pink backdrop"),
    "851af63ed9606835": (3, "Teriyaki Tofu", "noodle bowl: teriyaki-glazed tofu, noodles, red pepper, edamame, carrot, herbs; blue backdrop"),
    "3d6064dc50c17fe1": (3, "Korean Spicy Tofu", "noodle bowl: tofu in red sauce, noodles, red pepper, edamame, carrot, herbs; orange backdrop"),
    "4d61656b5c7f492e": (3, "Crispy Chicken Noodle Salad", "noodle salad (cut-out): breaded chicken strips, cucumber, chilli, lime, herbs"),
    "6eef7d149bb2c244": (3, "Crispy Tofu Noodle Salad", "noodle salad (cut-out): crispy tofu, cucumber, chilli, lime, herbs"),
    "3456873cd49d616c": (3, "Miso Chicken Noodle Salad", "noodle salad (cut-out): roasted chicken pieces, cucumber, chilli, lime, herbs"),
    "99b0ae5fd7ad352d": (6, "Spicy Korean Bao", "bao bun with chicken in red spicy sauce, cucumber, carrot; grey studio backdrop"),
    "0c49b4c665d89ba6": (6, "Crispy Shrimp Bao", "bao bun with a breaded shrimp, sriracha mayo, carrot, cucumber, chives; grey studio backdrop"),
    "3ad8c5c05539a660": (6, "Roasted Chicken Bao", "bao bun with glazed roasted chicken, carrot, cucumber; grey studio backdrop"),
    "10a9c129b541715c": (6, "Gyozas (Chicken & Veg)", "cut-out: six fried gyozas and a dark dip pot in a paper-lined kraft tray (no printing)"),
    "22f59901b9878c27": (6, "Chicken Karaage", "cut-out: five pieces of fried chicken and a red sauce pot in a paper-lined kraft tray (no printing)"),
    "089293bcc565f5c9": (6, "Teriyaki Octopus Balls", "cut-out: octopus balls with teriyaki sauce, mayo and seaweed flakes in a white pot"),
    "8618577a19639e26": (6, "Miso Mushroom", "cut-out: miso mushrooms with greens in a white pot"),
    "0a31b9b7cfeb4789": (7, "Asian Slaw", "cut-out: slaw with herbs in a white pot"),
    "8565e44eb3e14247": (7, "Edamame Pot", "cut-out: edamame pods with chilli powder in a small white pot"),
    "bea702adc4775911": (7, "Mochi", "cut-out: one white mochi (faint on a white tile, but it is the guide's photo of the item)"),
    "71fec71daa5ac99f": (7, "Sweet Potato Balls", "four sweet potato balls in a clear pot, very small in a large grey frame (see DROP_ITEMS)"),
}
# item id -> why it was looked at and left without a photo (a rerun must not bring it back)
DROP_ITEMS: dict[str, str] = {
    "sweet-potato-balls": "the guide's picture is a large grey studio frame with the pot of four balls tiny in its middle (about 5% of its area; the "
                          "guide shows it enlarged through its round frame, and we never crop): at the app's sizes the dish would be a dot",
}

NOTE_RE = re.compile(r"^Printed '(.+?)' under ([A-Z &]+?)(?:;|$)")


def read_list(pdf: Path) -> dict[int, list[dict]]:
    """`pdfimages -list`: per page, the image objects in drawing order, each with the soft mask that follows it (if any)."""
    out = subprocess.run(["pdfimages", "-list", str(pdf)], capture_output=True, text=True, check=True).stdout.splitlines()
    pages: dict[int, list[dict]] = {}
    for line in out[2:]:
        f = line.split()
        page, num, kind, w, h, enc = int(f[0]), int(f[1]), f[2], int(f[3]), int(f[4]), f[8]
        if kind == "image":
            pages.setdefault(page, []).append({"num": num, "w": w, "h": h, "enc": enc, "smask": None})
        elif kind == "smask":
            last = pages[page][-1]
            if (last["w"], last["h"]) != (w, h) or last["smask"] is not None:
                raise SystemExit(f"page {page}: soft mask {num} does not belong to the picture before it: the layout changed")
            last["smask"] = num
        else:
            raise SystemExit(f"page {page}: unexpected image kind {kind!r}")
    return pages


def picture(work: Path, page: int, entry: dict) -> tuple[str, bytes]:
    """(key, bytes to store) for one image object written by `pdfimages -j -png -p`: a JPEG stream unchanged, or a PNG with the object's own
    soft mask as alpha."""
    from PIL import Image

    stem = work / f"im-{page:03d}-{entry['num']:03d}"
    if entry["enc"] == "jpeg":
        raw = stem.with_suffix(".jpg").read_bytes()
        if entry["smask"] is not None:
            raise SystemExit(f"page {page}: a JPEG with a soft mask: not expected in this guide")
        return hashlib.sha256(raw).hexdigest()[:16], raw
    with Image.open(stem.with_suffix(".png")) as im:
        rgb = im.convert("RGB")
    h = hashlib.sha256(rgb.tobytes())
    if entry["smask"] is not None:
        with Image.open(work / f"im-{page:03d}-{entry['smask']:03d}.png") as m:
            mask = m.convert("L")
        if mask.size != rgb.size:
            raise SystemExit(f"page {page}: soft mask size {mask.size} differs from its picture {rgb.size}")
        h.update(mask.tobytes())
        rgb.putalpha(mask)
    buf = io.BytesIO()
    rgb.save(buf, "PNG")
    return h.hexdigest()[:16], buf.getvalue()


def layout(pdf: Path, work: Path) -> dict[int, dict]:
    """Per page: {"images": [(key, bytes, (cx, cy), (w, h))] in drawing order, "texts": [(text, top, left, height, font)]}, and the fonts."""
    for old in work.iterdir():
        old.unlink()
    subprocess.run(["pdftohtml", "-xml", "-q", str(pdf), str(work / "m")], capture_output=True, check=True)
    xml = (work / "m.xml").read_text("utf-8", "replace")
    for old in work.iterdir():          # keep only the XML: the pictures are taken from pdfimages below
        if old.name != "m.xml":
            old.unlink()
    subprocess.run(["pdfimages", "-j", "-png", "-p", str(pdf), str(work / "im")], capture_output=True, check=True)
    objects = read_list(pdf)
    fonts = {m.group(1): {"size": int(m.group(2)), "color": m.group(3).lower()}
             for m in re.finditer(r'<fontspec id="(\d+)" size="(\d+)" family="[^"]*" color="([^"]+)"/>', xml)}
    pages: dict[int, dict] = {}
    for pm in re.finditer(r'<page number="(\d+)"(.*?)</page>', xml, re.S):
        n = int(pm.group(1))
        boxes = [tuple(int(im.group(i)) for i in range(1, 5))
                 for im in re.finditer(r'<image top="(-?\d+)" left="(-?\d+)" width="(-?\d+)" height="(-?\d+)"', pm.group(2))]
        objs = objects.get(n, [])
        if len(boxes) != len(objs):
            raise SystemExit(f"page {n}: pdftohtml draws {len(boxes)} pictures but pdfimages lists {len(objs)}: cannot pair them")
        images = []
        for (top, left, w, h), entry in zip(boxes, objs):
            key, data = picture(work, n, entry)
            images.append({"key": key, "data": data, "cx": left + w / 2, "cy": top + h / 2, "size": (entry["w"], entry["h"])})
        texts = []
        for t in re.finditer(r'<text top="(-?\d+)" left="(-?\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)</text>', pm.group(2), re.S):
            words = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", t.group(6))).split())
            if words:
                texts.append({"text": words, "top": int(t.group(1)), "left": int(t.group(2)), "width": int(t.group(3)),
                              "height": int(t.group(4)), "font": fonts[t.group(5)]})
        pages[n] = {"images": images, "texts": texts}
    return pages


def dish_blocks(pages: dict[int, dict]) -> list[dict]:
    """Every dish block of the guide: {page, heading, printed, left, mid}."""
    blocks, heading = [], None
    for n in sorted(pages):
        texts = pages[n]["texts"]
        heads = sorted((t["top"], t["text"]) for t in texts
                       if t["font"]["size"] >= HEADING_SIZE and t["text"].upper() != "NUTRITION GUIDE")
        # name lines: pieces of the orange name fonts on one line joined ("Korean Sauce" in bold + " Tofu Wrap")
        lines: list[dict] = []
        for t in sorted((t for t in texts if t["font"]["color"] == NAME_COLOUR), key=lambda t: (t["top"], t["left"])):
            if lines and lines[-1]["top"] == t["top"] and abs(t["left"] - lines[-1]["right"]) <= 15:
                lines[-1]["text"] += " " + t["text"]
                lines[-1]["right"] = t["left"] + t["width"]
            else:
                lines.append({**t, "right": t["left"] + t["width"]})
        runs: list[list[dict]] = []
        for t in sorted(lines, key=lambda t: (t["left"], t["top"])):
            if runs and runs[-1][-1]["left"] == t["left"] and 0 < t["top"] - runs[-1][-1]["top"] <= 70:
                runs[-1].append(t)
            else:
                runs.append([t])
        page_blocks = []
        for run in runs:
            top, left, right = run[0]["top"], run[0]["left"], max(t["right"] for t in run)
            protein = sorted((t for t in texts if t["top"] > run[-1]["top"] and t["left"] < right and t["left"] + t["width"] > left
                              and re.fullmatch(r"\d+(?:\.\d+)?g protein", t["text"])), key=lambda t: t["top"])
            if not protein:
                raise SystemExit(f"page {n}: dish name {' '.join(t['text'] for t in run)!r} has no protein line under it: the layout changed")
            bottom = protein[0]["top"] + protein[0]["height"]
            above = [h for h_top, h in heads if h_top < top]
            page_blocks.append({"page": n, "heading": above[-1] if above else heading, "printed": " ".join(" ".join(t["text"] for t in run).split()),
                                "left": left, "top": top, "mid": (top + bottom) / 2})
        blocks.extend(sorted(page_blocks, key=lambda b: (b["top"], b["left"])))
        if heads:
            heading = heads[-1][1]
    return blocks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_block: dict[tuple[str, str], list[dict]] = {}
    for it in items:
        m = NOTE_RE.match(it.get("notes", ""))
        if m:
            by_block.setdefault((norm_name(m.group(1)), m.group(2).strip()), []).append(it)

    try:
        menu = polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        if PDF_URL not in menu:
            print(f"STOP: {MENU_URL} no longer links {PDF_URL}: find the current guide, rerun buy_and_bite.py, then this script", file=sys.stderr)
            return 1
        raw_pdf = polite_get(PDF_URL, args.cache, referer=MENU_URL, accept="application/pdf,*/*;q=0.8")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    sha = hashlib.sha256(raw_pdf).hexdigest()
    if sha != buy_and_bite.EXPECTED_SHA256:
        print(f"STOP: the guide's SHA-256 is {sha}, not the one our items were read from ({buy_and_bite.EXPECTED_SHA256}): rerun "
              "buy_and_bite.py on the new guide first, then look at its photos again", file=sys.stderr)
        return 1
    work = args.cache / "pdf-work"
    work.mkdir(parents=True, exist_ok=True)
    pdf = work.parent / "nutrition-guide.pdf"
    pdf.write_bytes(raw_pdf)
    pages = layout(pdf, work)
    blocks = dish_blocks(pages)
    print(f"{len(blocks)} dish blocks in the guide; {sum(len(p['images']) for p in pages.values())} pictures drawn")

    # which pictures sit in which block's photo frame
    in_slot: dict[int, list[dict]] = {}
    for n, p in pages.items():
        for idx, im in enumerate(p["images"]):
            homes = [i for i, b in enumerate(blocks) if b["page"] == n and b["left"] - SLOT_W <= im["cx"] < b["left"]
                     and abs(im["cy"] - b["mid"]) <= SLOT_DY]
            if len(homes) > 1:
                raise SystemExit(f"page {n}: picture {im['key']} sits in {len(homes)} dish frames: the layout changed")
            if homes and min(im["size"]) >= MIN_SIDE:
                in_slot.setdefault(homes[0], []).append({**im, "order": idx})

    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    to_review: list[str] = []
    matched: dict[str, dict] = {}
    for i, b in enumerate(blocks):
        label = f"p{b['page']} {b['heading']} / {b['printed']}"
        cands = by_block.get((norm_name(b["printed"]), b["heading"]), [])
        if len(cands) != 1:
            skipped.append(f"{label}: {'no published item (held back or not published)' if not cands else f'{len(cands)} items name this block'}")
            continue
        it = cands[0]
        if norm_name(b["printed"]) not in norm_name(it["name"]):
            skipped.append(f"{label}: item {it['name']!r} does not carry the printed name")
            continue
        if it["id"] in DROP_ITEMS:
            skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
            continue
        pics = sorted(in_slot.get(i, []), key=lambda im: im["order"])
        if not pics:
            skipped.append(f"{it['id']}: no picture in its photo frame ({label})")
            continue
        top = pics[-1]
        rev = REVIEWED.get(top["key"])
        if rev is None or rev[0] != b["page"] or norm_name(rev[1]) != norm_name(b["printed"]):
            to_review.append(f"{it['id']}: picture {top['key']} {top['size'][0]}x{top['size'][1]} on top in the frame of {label}"
                             + (f" (REVIEWED says page {rev[0]} {rev[1]!r})" if rev else ""))
            matched[it["id"]] = {**top, "label": label}
            continue
        matched[it["id"]] = {**top, "label": label}
        if args.dry_run:
            print(f"  {it['id']:42} {top['key']}  <- {label}")
            continue
        try:
            fname = store_image(CHAIN_ID, top["data"])
        except ValueError as e:
            skipped.append(f"{it['id']}: {e}")
            continue
        rows[it["id"]] = (fname, PDF_URL)
        print(f"  {it['id']:42} {fname}  <- {label}")

    for s in skipped:
        print(f"  no photo: {s}")
    for s in to_review:
        print(f"  NOT ATTACHED, look at it first (add to REVIEWED): {s}")
    if args.dry_run:
        dump = args.cache / "review"
        dump.mkdir(exist_ok=True)
        for item_id, im in matched.items():
            ext = "jpg" if im["data"][:3] == b"\xff\xd8\xff" else "png"
            (dump / f"{item_id}__{im['key']}.{ext}").write_bytes(im["data"])
        print(f"{len(matched)} of {len(items)} published items have a picture in their frame; copies for looking at: {dump}")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
