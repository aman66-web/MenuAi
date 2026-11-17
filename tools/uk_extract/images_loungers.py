#!/usr/bin/env python3
"""Item photos for Loungers (the Lounge brand) from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_loungers.py --cache DIR [--dry-run]

WHERE THE CHAIN SHOWS ITS DISHES WITH PHOTOS (checked 2026-11-17). The menu itself (calories, allergens) is the Ten Kites embed
menus.tenkites.com/loungers/lounges09 that loungers.py reads; that page carries no dish photos (its only pictures are the brand logo and the
allergen/diet label icons, all on images.tenkites.com, whose robots.txt says "Disallow: /": nothing is fetched from it). The chain's own
site thelounges.co.uk does show dishes with photos in one place that ties a photo to a dish NAME: the "content-media" two-part slider
(an image slider beside a text slider) used on each venue's page (https://thelounges.co.uk/<venue>/, e.g. /zorro/ "Our Favourites") and
on some other pages. Each text slide has the dish's name as its <h2> (e.g. "Smokehouse Smash Burger"); the image slide at the same
position is the photo shown with it. The site's own script (/_astro/ContentMedia.astro_astro_type_script_index_0_lang.*.js, read
2026-11-17) builds two looped Swiper sliders, one per part, both starting on slide 1, and its prev/next buttons call slidePrev()/slideNext()
on both together, so image slide i is always on screen with text slide i. The photo files are the site's own WordPress uploads on its own
media CDN (https://bunny-wp-pullzone-lgrcnjwfpd.b-cdn.net/wp-content/uploads/..., the address thelounges.co.uk's pages use for every picture).

Every page in the site's own sitemap (https://thelounges.co.uk/sitemap-index.xml -> sitemap-0.xml) is read once, except the
/<venue>/menus pages (they only embed the Ten Kites menu: no sliders, no dish photos) and the search-results pages.

Other routes looked at and NOT used:
- The "What's on" menu pages (/whats-on/autumn-winter-2026-menu/ ...) show galleries of food photos beside prose that names several
  dishes; no photo is tied to one name (the pictures' alt text describes the scene, e.g. "A person holding a large cheeseburger ..."), so
  none is attached from them. They are still read, in case a two-part slider on them names a dish.
- Click & Collect (https://orders.thelounges.co.uk/#/venue/<n>/..., Zonal's ordering site the venue data links to): its robots.txt
  (read 2026-11-17) has `User-agent: anthropic-ai`, `User-agent: Claude-Web` and `User-agent: ClaudeBot` groups each with `Disallow: /`
  (also CCBot, Google-Extended, PerplexityBot ...). It is not used, and nothing behind it (its menu API) is asked for either.
- content.thelounges.co.uk/wp-content/uploads/... (the venues' interior photos in the venue data): no dish names.

MATCH RULE (exact, nothing fuzzy). In one content-media section, the image slides and the text slides are counted; the section is used
only when the counts are equal, every image slide holds exactly one photo (the Christmas jumper overlay, `...item-xmas-jumper`, is a
decoration and is ignored) and every text slide has one <h2>. Then the <h2> of text slide i, under norm_name(), must be equal to
  (a) the name of one published item in items.csv, or else
  (b) the name the menu printed for it (items.csv notes: "Printed 'LOUNGE BREAKFAST' under STANDARD > Brunch ..."; our names add a
      bracket such as "(brunch)" only to tell apart same-named dishes on different menus). Where (b) gives more than one item, only the
      item printed on the STANDARD menu is taken (the kids' menu and the GF/EF/MF/vegan menus' dishes are other servings or recipes;
      their printed names start "GF"/"EF"/"MF" or sit under KIDS), and if that is not exactly one item, nothing is attached.
The trade mark signs ™ ® © are removed before norm_name (norm_name's Unicode folding would otherwise turn "Biscoff™" into "biscofftm", a word
the heading "Double Biscoff Cheesecake" does not have); nothing else is changed. A heading that names no item exactly gets nothing, e.g.
"Crispy Squid Tapas" (the menu prints "Salt & Pepper Squid"), "Cheesy Garlic Hash Brown Bites" (the menu: "Cheesy Garlic Hash Bites") and
"Orange & Passionfruit Cooler" (the menu: "Orange & Passion Fruit Cooler"). Where the same
dish is shown with different photos on different pages, the photo shown with it on most pages is kept (ties: the photo URL that sorts first);
source_url is the first page (sorted) that shows that photo with that name.

robots.txt (read 2026-11-17): https://thelounges.co.uk/robots.txt is `User-agent: *` / `Allow: /` (no group names an AI crawler);
https://bunny-wp-pullzone-lgrcnjwfpd.b-cdn.net/robots.txt is Yoast's `User-agent: *` / `Disallow:` (nothing disallowed). polite_get checks
robots.txt on every URL (RFC 9309) and paces one request per second per host; a 401/403/429 or a robots refusal stops the run (exit 1)
before anything is written.

Terms (https://thelounges.co.uk/terms-conditions/, read 2026-11-17): the page says only "This website is the property of Loungers Ltd." and
links the chain's policies (privacy, modern slavery, supplier payment, gender pay, vouchers, animal welfare, sustainability, responsible
food and drink retailing, bookings); no clause about copying or reusing the site's content or images was found. Installed under the
founder's decision of 2026-10-06 (CLAUDE.md rule 2).

DROP_ITEMS / DROP_PHOTOS below hold anything left out after looking at every photo on a contact sheet (photo_sheet.py), so a rerun can't
bring it back.

Run of 2026-11-17: 362 sitemap pages read, nothing refused. The venue pages' "Our Favourites" sliders name 10 published dishes exactly:
Apple & Blackberry Crumble, Double Biscoff(TM) Cheesecake, French Dip Toastie, Marry Me Chicken, Scandi Smoked Salmon, Smokehouse Smash Burger,
Sour Cherryade, Sticky Toffee Pudding, Triple Cheese & Bacon Hash Bites, Ube Latte. All 10 photos were looked at on a contact sheet and at full
size: each shows the dish its slide names and describes (e.g. Marry Me Chicken's slide lists the rosti bites, pesto and cheese the photo shows;
the Ube Latte is a frothy purple latte, no ice, not the Iced Ube Latte), none prints text, a price, a sticker or a logo: none left out. The other
headings were left out because no published item has that exact name: "Crispy Squid Tapas", "Cheesy Garlic Hash Brown Bites" and
"Orange & Passionfruit Cooler" (near misses, above), "Wild Berry Spritz", "Pink Cloud" and "The Key Lime Pie Cocktail" (cocktails print no
calories, so they are not published), and section titles ("Our Lounge", "Cakes + Bakes", "Tapas Tuesdays" ...). The 688 other slider sections
hold one gallery slide of several photos (or no dish heading) and tie no photo to one name.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "loungers"
SITE = "https://thelounges.co.uk"
SITEMAP = SITE + "/sitemap-index.xml"
MEDIA_HOSTS = {"bunny-wp-pullzone-lgrcnjwfpd.b-cdn.net"}   # the site's own WordPress media CDN
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-loungers")

# item id -> why it is left out after looking at its photo (filled in after the contact sheets)
DROP_ITEMS: dict[str, str] = {}
# photo URL -> why it is never used for any item
DROP_PHOTOS: dict[str, str] = {}


def page_urls(cache: Path) -> list[str]:
    """Every page in the site's own sitemap, minus the Ten Kites menu embeds (/<venue>/menus) and search-results pages."""
    index = polite_get(SITEMAP, cache, accept="application/xml").decode("utf-8", "replace")
    urls: list[str] = []
    for sm in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", index):
        body = polite_get(htmllib.unescape(sm), cache, accept="application/xml").decode("utf-8", "replace")
        urls += [htmllib.unescape(u) for u in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", body)]
    keep = []
    for u in urls:
        path = urllib.parse.urlsplit(u).path.rstrip("/")
        if not u.startswith(SITE + "/") and u.rstrip("/") != SITE:
            continue
        if path.endswith("/menus") or path.endswith("/search-results"):
            continue
        keep.append(u)
    return sorted(set(keep))


def _items_between(seg: str, marker: str) -> list[str]:
    """Split `seg` at each element whose class starts with `marker |` and return the pieces (one per slide)."""
    starts = [m.start() for m in re.finditer(r'class="' + re.escape(marker) + r' \|', seg)]
    return [seg[a:b] for a, b in zip(starts, starts[1:] + [len(seg)])]


def slider_pairs(page: str) -> tuple[list[tuple[str, str]], list[str]]:
    """(heading, photo URL) for every slide of every content-media section that passes the rule in the docstring, and notes on
    sections that were skipped."""
    pairs: list[tuple[str, str]] = []
    notes: list[str] = []
    for m in re.finditer(r'<section class="content-media[ "]', page):
        end = page.find("</section>", m.start())
        seg = page[m.start():end if end > 0 else len(page)]
        img_part_at = seg.find('class="content-media__image-slider ')
        txt_part_at = seg.find('class="content-media__content-slider ')
        if img_part_at < 0 or txt_part_at < 0:
            continue
        img_part = seg[img_part_at:txt_part_at] if img_part_at < txt_part_at else seg[img_part_at:]
        txt_part = seg[txt_part_at:]
        img_slides = _items_between(img_part, "content-media__image-slider__item")
        txt_slides = _items_between(txt_part, "content-media__content-slider__item")
        heads = []
        for t in txt_slides:
            h = re.findall(r'<h2 class="content-media__content-slider__item-heading[^"]*"[^>]*>(.*?)</h2>', t, re.S)
            heads.append(re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", h[0]))).strip() if len(h) == 1 else None)
        photos = []
        for s in img_slides:
            s = re.sub(r'<div class="content-media__image-slider__item-xmas-jumper.*?</div>', "", s, flags=re.S)
            srcs = [htmllib.unescape(x) for x in re.findall(r'<img[^>]*\ssrc="([^"]+)"', s)]
            srcs = [x for x in srcs if "xmas-jumper" not in x]
            photos.append(srcs[0] if len(srcs) == 1 else None)
        if not img_slides or len(img_slides) != len(txt_slides) or None in heads or None in photos:
            notes.append(f"skipped a section: {len(img_slides)} image slides, {len(txt_slides)} text slides, headings {heads}")
            continue
        pairs += list(zip(heads, photos))
    return pairs, notes


def key(s: str) -> str:
    """norm_name() after removing the trade mark signs (see the docstring)."""
    return norm_name(re.sub(r"[\u2122\u00ae\u00a9]", " ", s))


def item_index(items: list[dict]) -> tuple[dict[str, list[str]], dict[str, list[tuple[str, str]]]]:
    """norm(name) -> ids, and norm(printed name) -> [(id, menu)] from the notes."""
    by_name: dict[str, list[str]] = defaultdict(list)
    by_printed: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for r in items:
        by_name[key(r["name"])].append(r["id"])
        m = re.match(r"Printed '(.+?)' under ([A-Z][A-Z ]*?) >", r.get("notes", ""))
        if m:
            by_printed[key(m.group(1))].append((r["id"], m.group(2).strip()))
    return by_name, by_printed


def match(heading: str, by_name, by_printed) -> tuple[str | None, str]:
    k = key(heading)
    ids = by_name.get(k, [])
    if len(ids) == 1:
        return ids[0], "name"
    if len(ids) > 1:
        return None, f"{len(ids)} items are named '{heading}'"
    cands = by_printed.get(k, [])
    if len(cands) == 1:
        return cands[0][0], "printed name"
    std = [i for i, menu in cands if menu == "STANDARD"]
    if len(std) == 1:
        return std[0], "printed name, STANDARD menu"
    return None, ("no item has this name" if not cands else f"printed name on {len(cands)} items, {len(std)} on STANDARD")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report, download no photos, write nothing")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    names = {r["id"]: r["name"] for r in items}
    by_name, by_printed = item_index(items)

    try:
        urls = page_urls(args.cache)
        print(f"{len(urls)} pages from the sitemap")
        seen: dict[str, Counter] = defaultdict(Counter)        # item id -> Counter(photo URL)
        first_page: dict[tuple[str, str], str] = {}            # (item id, photo) -> first page (sorted) showing it
        unmatched: Counter = Counter()
        skipped_sections = 0
        for u in urls:
            page = polite_get(u, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            pairs, notes = slider_pairs(page)
            skipped_sections += len(notes)
            for heading, photo in pairs:
                host = urllib.parse.urlsplit(photo).netloc
                if host not in MEDIA_HOSTS:
                    unmatched[f"{heading} (photo on {host})"] += 1
                    continue
                item_id, how = match(heading, by_name, by_printed)
                if item_id is None:
                    unmatched[f"{heading}: {how}"] += 1
                    continue
                seen[item_id][photo] += 1
                first_page.setdefault((item_id, photo), u)
    except Blocked as e:
        print(f"BLOCKED: {e}\nNothing written. Do not work round it: report it.")
        sys.exit(1)

    print(f"{skipped_sections} slider sections skipped (counts differ or a slide has no heading/photo)")
    if unmatched:
        print("Headings that name no published item exactly (left out):")
        for k, n in sorted(unmatched.items()):
            print(f"  {k}  [{n} pages]")

    chosen: dict[str, tuple[str, str]] = {}
    for item_id, counts in sorted(seen.items()):
        if item_id in DROP_ITEMS:
            print(f"  drop {item_id}: {DROP_ITEMS[item_id]}")
            continue
        ranked = sorted((p for p in counts if p not in DROP_PHOTOS), key=lambda p: (-counts[p], p))
        if not ranked:
            continue
        photo = ranked[0]
        chosen[item_id] = (photo, first_page[(item_id, photo)])
        alt = f" (also {len(counts) - 1} other photo(s) on fewer pages)" if len(counts) > 1 else ""
        print(f"  {item_id} = {names[item_id]!r}: {photo.rsplit('/', 1)[-1]} on {counts[photo]} pages{alt}")

    print(f"{len(chosen)} of {len(items)} published items matched")
    if args.dry_run:
        return

    rows: dict[str, tuple[str, str]] = {}
    for item_id, (photo, page_url) in sorted(chosen.items()):
        try:
            raw = polite_get(photo, args.cache, referer=page_url)
            rows[item_id] = (store_image(CHAIN_ID, raw), page_url)
        except Blocked as e:
            print(f"BLOCKED: {e}\nNothing written. Do not work round it: report it.")
            sys.exit(1)
        except ValueError as e:
            print(f"  skip {item_id}: {e}")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  CHECK: {f} is used by {len(ids)} items: {ids}")
    path = write_images_csv(CHAIN_ID, rows)
    print(f"wrote {path} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
