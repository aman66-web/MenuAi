#!/usr/bin/env python3
"""Item photos for itsu from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_itsu.py --cache <dir> [--dry-run]

Source: https://www.itsu.com/menu/ (the page the nutrition data came from). Every dish card on it links to the dish's own
page (/menu/<category>/<dish>/), which is also where tools/uk_extract/itsu.py read the dish's name and numbers. Each dish
page shows ONE product photo of that dish: <img src="<photo>" ... class="lazy-image main-image"> inside its
"product-hero" block (the page's other images, such as the small "Dr Emma" GIF button, do not carry that class). The photos
are served from itsu's own asset bucket, itsu-production-assets.s3.eu-west-2.amazonaws.com, the host the site's pages load
them from (there is no copy of them on www.itsu.com). The files are the originals (about 2068 x 2160 px JPEG); store_image
only downsizes to <= 640 px WebP.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the item's own dish page names it
(the page's <h1>, tidied the way itsu.py tidied it: itsu's joining apostrophe in "egg'pot" becomes a space and the one known
typo "Cappucino" is spelt "Cappuccino", exactly as the published names were made), that name equals the published item
name (images_common.norm_name), and the menu card that links to that page carries the same title. A name that two dish
pages share, or a published item that no page (or two pages) names, gets no photo. The photo is the dish page's own main
photo. If that file is a "protein blobby" shot (itsu's product shots with a claim sticker; its "no blobby" versions are
plain) the same dish's menu-card photo is used instead (source page = the menu page that shows it); a file name saying
placeholder/logo/banner/GIF is never used (BADGE, PLACEHOLDER_WORDS). Nothing is matched by slug, file name or similarity.

Terms and robots, read 2026-10-07:
- https://www.itsu.com/robots.txt is "User-agent: * / Disallow:" (nothing is disallowed on www.itsu.com).
- https://www.itsu.com/itsutermsandconditions/ (the only "terms & conditions" page the site links) is the terms of the
  vouchers, gift cards, loyalty and offers; it says nothing about images or reuse of content. The privacy policy, cookie
  policy, e-mail terms and the other terms pages (/cateringterms/, /giftcardterms/, /moneyterms/) have no image clause
  either. The only statement about content is the footer of every page: "Copyright (c) 2026. itsu - All rights reserved."
  Installed on the founder's decision of 2026-10-06 (the founder's accepted risk).
- OPEN POINT, needs a decision before the photos can be stored: the photo host's robots.txt
  (https://itsu-production-assets.s3.eu-west-2.amazonaws.com/robots.txt) answers HTTP 403 AccessDenied. That is what Amazon S3
  says for ANY object that does not exist in a bucket that cannot be listed, i.e. the bucket has no robots.txt file, not a
  Disallow rule; RFC 9309 treats an unavailable robots.txt as "no restrictions". But images_common._robots_allow
  deliberately treats 401/403/429 as "do not fetch", so polite_get raises Blocked for every photo URL and this script stops
  (exit 1, nothing written) at the first download. The dry run needs no photo request (it only reads the URLs from the
  chain's own pages), so it works. This script does not work round that rule.

A 401/403/429 or a robots refusal stops the script before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import hashlib
import sys
import time
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "itsu"
BASE = "https://www.itsu.com"
MENU_URL = f"{BASE}/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-itsu")
PHOTO_HOST = "itsu-production-assets.s3.eu-west-2.amazonaws.com"

# itsu.py spells this one itsu typo correctly in the published name (only the name changes).
NAME_FIXES = {"cappucino": "cappuccino"}
# Items looked at after the first run and left without a photo (a rerun must not bring them back): the photo carries a baked-in
# "allergen update" or "tastier recipe" sticker, which could contradict our own allergen table or numbers.
DROP_ITEMS = {"the-veggie-selection", "the-salmon-dragon", "the-spicy-tuna-dragon", "the-salmon-full-house", "the-super-salmon-light",
              "the-best-of-itsu", "the-california-rolls"}
# File-name words that mean "not a photo of this dish" (logo, placeholder, banner...).
PLACEHOLDER_WORDS = re.compile(r"placeholder|coming[-_ ]?soon|default|no[-_ ]?image|logo|banner|dr[-_ ]?emma|\.gif", re.I)
# itsu's "blobby" product shots carry a sticker (e.g. a protein claim): not used. Its own "no blobby" versions are plain photos.
BADGE = re.compile(r"(?<!no)(?<!no_)(?<!no-)(?<!no )blobby", re.I)

CARD = re.compile(r'<a href="(?P<path>/menu/[^"]*)" class="base-lined-card product-listing-card"[^>]*>(?P<body>.*?)</a>', re.S)
CARD_IMG = re.compile(r'<img\b[^>]*?\bsrc="(?P<src>https://[^"]+)"', re.S)
CARD_TITLE = re.compile(r'<strong class="title"[^>]*>(?P<t>.*?)</strong>', re.S)
H1 = re.compile(r'<h1\b[^>]*class="[^"]*\bsecondary-name\b[^"]*"[^>]*>(?P<t>.*?)</h1>', re.S)
MAIN_IMG = re.compile(r'<img\b[^>]*\bclass="[^"]*\bmain-image\b[^"]*"[^>]*>', re.S)
SRC = re.compile(r'\bsrc="(https://[^"]+)"')


def text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def get_page(url: str, cache: Path, must: str, tries: int = 3) -> str:
    """One polite page fetch. itsu sometimes serves an error page (itsu.py saw 200/500 error pages): a page that lacks `must`
    is dropped from the cache and fetched again after a pause (each try is still one request, one second apart at least)."""
    page = ""
    for n in range(tries):
        try:
            page = ic.polite_get(url, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code < 500 or n == tries - 1:
                raise
        else:
            if must in page:
                return page
            (cache / hashlib.sha1(url.encode()).hexdigest()).unlink(missing_ok=True)
        time.sleep(3 * (n + 1))
    return page


def tidy(raw: str) -> str:
    """The page's name as itsu.py tidied it for the published item: the joining apostrophe becomes a space."""
    return re.sub(r"(?<=[A-Za-z])['’](?=[a-z])", " ", text(raw))


def key_of(raw: str) -> str:
    k = ic.norm_name(tidy(raw))
    return NAME_FIXES.get(k, k)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch pages only, print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    pages: dict[str, dict] = {}   # dish path -> {key, page_photo, card_photo, page_url}
    try:
        menu = get_page(MENU_URL, args.cache, "product-listing-card")
        cards: dict[str, tuple[str | None, str]] = {}   # dish path -> (photo the menu card shows, the card's title)
        for m in CARD.finditer(menu):
            img, title = CARD_IMG.search(m.group("body")), CARD_TITLE.search(m.group("body"))
            if m.group("path") in cards:
                skipped.append(f"{m.group('path')}: listed twice on the menu page")
            cards[m.group("path")] = (html.unescape(img.group("src")) if img else None, title.group("t") if title else "")
        print(f"{len(cards)} dish cards on {MENU_URL}")

        for path, (card_photo, card_title) in cards.items():
            page_url = BASE + path
            try:
                page = get_page(page_url, args.cache, "secondary-name")
            except urllib.error.HTTPError as e:   # itsu's page for one dish answers HTTP 500 (see itsu.py UNREADABLE)
                skipped.append(f"{path}: page returned HTTP {e.code}")
                continue
            h1, tags = H1.findall(page), MAIN_IMG.findall(page)
            if len(h1) != 1 or len(tags) > 1:
                skipped.append(f"{path}: {len(h1)} titles and {len(tags)} main photos on the page")
                continue
            key = key_of(h1[0])
            if key_of(card_title) != key:
                skipped.append(f"{path}: menu card is titled {tidy(card_title)!r} but the page {tidy(h1[0])!r}")
                continue
            src = SRC.search(tags[0]) if tags else None
            pages[path] = {"key": key, "page_photo": html.unescape(src.group(1)) if src else None,
                           "card_photo": card_photo, "page_url": page_url}
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1

    by_page_key: dict[str, list[str]] = {}
    for path, pg in pages.items():
        by_page_key.setdefault(pg["key"], []).append(path)

    found: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, item name)
    for k, its in sorted(by_key.items()):
        if len(its) != 1:
            skipped.append(f"{k}: {len(its)} published items share this name")
            continue
        item = its[0]
        if item["id"] in DROP_ITEMS:
            skipped.append(f"{item['id']}: dropped after looking: photo carries an allergen/recipe-update sticker")
            continue
        paths = by_page_key.get(k, [])
        if len(paths) != 1:
            skipped.append(f"{item['id']}: {len(paths)} dish pages named {item['name']!r}")
            continue
        pg = pages[paths[0]]
        # The dish page's own photo first; the menu card's photo (same dish, linked to that page) only when the page's is
        # missing or unusable. The card photo's source page is the menu page that shows it.
        candidates = [(pg["page_photo"], pg["page_url"]), (pg["card_photo"], MENU_URL)]
        usable, why = None, []
        for photo, src_url in candidates:
            if not photo:
                continue
            fname = urllib.parse.unquote(photo.rsplit("/", 1)[-1])
            if PLACEHOLDER_WORDS.search(fname) or BADGE.search(fname):
                why.append(f"{fname} is a placeholder, logo or claim-sticker shot")
            elif usable is None:
                usable = (photo, src_url, item["name"])
        if usable is None:
            skipped.append(f"{item['id']}: no usable photo ({'; '.join(why) or 'none on its page or card'})")
            continue
        found[item["id"]] = usable

    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (photo, page_url, name) in sorted(found.items()):
            if args.dry_run:
                print(f"  {item_id:46} {name:42} {photo}  <- {page_url}")
                continue
            raw = ic.polite_get(photo, args.cache, referer=page_url)
            try:
                rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}\n"
              f"  photo host {PHOTO_HOST}: see the OPEN POINT in this script's docstring.", file=sys.stderr)
        return 1

    for s in skipped:
        print(f"  no photo: {s}")
    if args.dry_run:
        print(f"{len(found)} of {len(items)} published items matched")
        shared: dict[str, list[str]] = {}
        for item_id, (photo, _, _) in found.items():
            shared.setdefault(photo, []).append(item_id)
        for photo, ids in sorted(shared.items()):
            if len(ids) > 1:
                print(f"  SHARED PHOTO ({len(ids)} items): {photo}: {', '.join(sorted(ids))}")
        return 0
    if rows:
        ic.write_images_csv(CHAIN, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
