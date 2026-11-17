#!/usr/bin/env python3
"""Item photos for Blacklock from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_blacklock.py --cache DIR [--dry-run]

Source: the pages of theblacklock.com listed in its own Yoast sitemaps (https://theblacklock.com/sitemap_index.xml ->
page-sitemap.xml, menus-sitemap.xml, news-sitemap.xml, restaurants-sitemap.xml: 179 different addresses on 2026-11-17; policy, newsletter,
contact, people, sitemap and table-booking pages are not read, see SKIP_PATHS; one request each, cached). The site is WordPress; its
pictures are files under https://theblacklock.com/wp-content/uploads/ (nothing else is accepted), each rendered as an <img> whose alt
attribute is the name the page gives the picture. Most of the site's pictures have an empty alt, or a description that names no dish
("Plate of Philip Warren steak on table with chips and sides"), or are lettered title cards on the news posts: those give nothing.

Where the photos are NOT taken from:
* the chain's menus at /menus/<name>/ are text only (no dish pictures).
* the allergy and nutrition page the dishes were read from (https://viewthe.menu/by8v, a Ten Kites page linked from /menus/, read by
  tools/uk_extract/blacklock.py) shows no dish photos at all (checked 2026-11-17: its only pictures are the chain's logo and a page
  background, both on images.tenkites.com, whose robots.txt says "User-agent: * / Allow: /tenkitestest/menus.html / Disallow: /"; we do
  not fetch from it and do not look for "the same file" elsewhere).
* ordering, delivery and booking sites (never used), and the WordPress media library (/wp-json/wp/v2/media): a picture is only taken from
  a page that shows it to visitors.

Match rule (exact, nothing fuzzy): a picture whose alt (or title) has the same images_common.norm_name as exactly one published item,
either as it stands or once the chain's own name in front is taken off (CAPTION_FORMS: "Blacklock ..." / "Blacklock's ...", the same fixed
caption form images_banana_tree.py accepts). What is left must be a published item's whole name; no other word is dropped, reordered or
approximated ("Lamb rump on a busy table of food", "PORTERHOUSE STEAK WITH CHILLI HOLLANDAISE" and "Two girls passing Chilli Hollandaise
over the top of the new Blacklock Pork Rib Eye ..." give nothing; Lamb Rump and Porterhouse are held back anyway). A picture whose names
point at two different published items gives no photo; an item that two different pictures name gets none (ambiguous). Renditions of one
upload ("...-683x1024.jpg", "...-1024x1536.jpg") count as one picture; the rendition the page's <img src> serves is the one stored.
Photos looked at on contact sheets and left out go in DROP_ITEMS / SKIP_FILES so a rerun can't bring them back.

robots.txt (https://theblacklock.com/robots.txt, read 2026-11-17): "User-agent: *" with Disallow: /wp-content/uploads/wc-logs/,
/wp-content/uploads/woocommerce_transient_files/, /wp-content/uploads/woocommerce_uploads/, /*?add-to-cart=, /*?*add-to-cart=,
/wp-admin/ (Allow: /wp-admin/admin-ajax.php), then a Yoast block "User-agent: * / Disallow:" and the sitemap line: the pages and the
/wp-content/uploads/<year>/ pictures are allowed; no group names an AI crawler (the script stops if one does). polite_get checks robots.txt
on every URL (RFC 9309). A 401/403/429, a robots refusal or an unreadable robots.txt stops the script (exit 2) before anything is written.

Terms (read 2026-11-17): https://theblacklock.com/terms-conditions/ (linked from nowhere on the home page; reached from the sitemap) is
placeholder text: its four headings ("Terms and Conditions Steak Boxes & Drinks Products", "T&Cs Drinks Products", "Lost & Damaged items",
"Returns") are followed only by "Lorem ipsum dolor sit amet, ..." paragraphs. No clause on copying or reusing content or images was found;
the footer reads "© Blacklock 2026". Photos are installed on the founder's decision of 2026-10-06 (taken down the day the chain asks).

Run of 2026-11-17: 165 pages read (the sitemaps' 179 pages less the 14 under SKIP_PATHS); 47 pictures with a name. Two pictures name a published dish: "Steak sarnie"
(/restaurants/blacklock-soho/, wp-content/uploads/2025/12/Copy-of-Aug25-Blacklock-01877-683x1024.jpg: a steak sandwich held up at the
table) and "blacklock-cheesecake" (/sunday-roast/, by the chain-name caption form -> "Cheesecake"; wp-content/uploads/2026/09/file-1-1024x683.jpg:
the white chocolate cheesecake being spooned out of its tray at the table, as Blacklock serves it). 2 of 68 published items, both looked
at on a contact sheet: real food photos, no lettering, figures, logos or stickers (hands with spoons in one, a diner holding the sandwich in
the other); none left out, so DROP_ITEMS and SKIP_FILES are empty. The rest of the menu has no picture named after it on the chain's own
pages.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "blacklock"
HOST = "https://theblacklock.com"
SITEMAPS = ("page", "menus", "news", "restaurants")   # the Yoast sitemap index also lists question_category (FAQ terms, no pages of dishes)
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-blacklock")
# pages not read: policies, forms and table-booking widgets (no dishes on them)
SKIP_PATHS = ("/cookies-policy/", "/privacy-policy/", "/terms-conditions/", "/newsletter/", "/contact/", "/sitemap/", "/people/",
              "-reservations/")
# the chain's own name in front of a dish name is a caption form, not part of the dish's name ("blacklock-cheesecake")
CAPTION_FORMS = (re.compile(r"^blacklocks? (?P<name>.+)$"),)
AI_CRAWLERS = re.compile(r"claude|anthropic", re.I)
# looked at on contact sheets and left without a photo (item id -> why); a rerun must not bring them back. None so far (2026-11-17).
DROP_ITEMS: dict[str, str] = {}
# uploads (path under /wp-content/uploads/ without the size suffix) never used, whatever their alt says. None so far.
SKIP_FILES: dict[str, str] = {}

IMG = re.compile(r"<img\b[^>]*>", re.I)
SIZE_SUFFIX = re.compile(r"-\d+x\d+(?=\.[A-Za-z]+$)")


def attr(tag: str, name: str) -> str:
    m = re.search(r"\s" + name + r"\s*=\s*\"([^\"]*)\"", tag) or re.search(r"\s" + name + r"\s*=\s*'([^']*)'", tag)
    return htmllib.unescape(m.group(1)).strip() if m else ""


def upload_key(src: str) -> str | None:
    """The upload a picture URL is a rendition of ('2025/12/Copy-of-...-01877.jpg'), or None when it is not a raster picture in the
    chain's own uploads folder."""
    u = urllib.parse.urlsplit(urllib.parse.urljoin(HOST + "/", src))
    if u.netloc != "theblacklock.com" or not u.path.startswith("/wp-content/uploads/"):
        return None
    path = u.path[len("/wp-content/uploads/"):]
    if not re.search(r"\.(jpe?g|png|webp)$", path, re.I):
        return None
    return SIZE_SUFFIX.sub("", path)


def picture_names(name: str) -> set[str]:
    """The norm_name keys a picture's alt/title can stand for: as it stands, and with the chain's own name in front taken off."""
    key = norm_name(name)
    out = {key} if key else set()
    for form in CAPTION_FORMS:
        m = form.match(key)
        if m:
            out.add(m.group("name"))
    return out


def page_pictures(page: str) -> list[dict]:
    page = re.sub(r"<script\b.*?</script>|<style\b.*?</style>|<noscript\b.*?</noscript>", "", page, flags=re.S | re.I)
    out = []
    for m in IMG.finditer(page):
        tag = m.group(0)
        src = attr(tag, "data-lazy-src") or attr(tag, "data-src") or attr(tag, "src")
        key = upload_key(src) if src else None
        if not key:
            continue
        names = [n for n in (attr(tag, "alt"), attr(tag, "title")) if n]
        if names:
            out.append({"key": key, "src": urllib.parse.urljoin(HOST + "/", src), "names": names})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        robots = polite_get(f"{HOST}/robots.txt", args.cache, accept="text/plain,*/*").decode("utf-8", "replace")
        if AI_CRAWLERS.search(robots):
            print(f"{HOST}/robots.txt now names an AI crawler: read it before running this script", file=sys.stderr)
            return 2
        pages: list[str] = []
        for sm in SITEMAPS:
            xml = polite_get(f"{HOST}/{sm}-sitemap.xml", args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for loc in re.findall(r"<loc>\s*(.*?)\s*</loc>", xml):
                loc = htmllib.unescape(loc)
                if loc.startswith(HOST + "/") and not any(s in loc for s in SKIP_PATHS) and loc not in pages:
                    pages.append(loc)
        if not pages:
            raise SystemExit("the sitemaps list no pages: the site has changed shape")

        # item id -> {upload key: (photo url, page url, picture name)}
        found: dict[str, dict[str, tuple[str, str, str]]] = {}
        n_named = 0
        for url in pages:
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for pic in page_pictures(page):
                n_named += 1
                hits: dict[str, dict] = {}
                for name in pic["names"]:
                    for k in picture_names(name):
                        for it in by_key.get(k, []):
                            hits[it["id"]] = it
                if len(hits) > 1:
                    skipped.append(f"{pic['key']} on {url}: its names {pic['names']} point at {sorted(hits)} (ambiguous)")
                    continue
                for item_id in hits:
                    found.setdefault(item_id, {}).setdefault(pic["key"], (pic["src"], url, pic["names"][0]))
        print(f"{len(pages)} pages read on {HOST}; {n_named} named pictures from /wp-content/uploads/")

        for it in items:
            pics = found.get(it["id"])
            if not pics:
                continue
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            pics = {k: v for k, v in pics.items() if k not in SKIP_FILES}
            if len(pics) != 1:
                skipped.append(f"{it['id']}: {len(pics)} different pictures name it ({sorted(pics)}): ambiguous, no photo"
                               if pics else f"{it['id']}: its only picture is in SKIP_FILES")
                continue
            (key, (src, page_url, name)), = pics.items()
            print(f"  {it['id']:<22} <- {name!r} on {page_url} ({src})")
            if args.dry_run:
                continue
            raw = polite_get(src, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{it['id']}: {src}: {e}")
                continue
            rows[it["id"]] = (fname, page_url)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping: we never work round a block; nothing was written.", file=sys.stderr)
        return 2

    for line in skipped:
        print("  skipped", line)
    if args.dry_run:
        print("dry run: nothing downloaded or written")
        return 0
    write_images_csv(CHAIN_ID, rows)
    print(f"{len(rows)} of {len(items)} published items have a photo; data/source/{CHAIN_ID}/images.csv written")
    for fname, ids in suspected_placeholders(rows).items():
        print(f"  CHECK {fname}: used by {len(ids)} items: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
