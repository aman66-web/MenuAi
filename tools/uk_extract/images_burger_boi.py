#!/usr/bin/env python3
"""Item photos for Burger Boi from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_burger_boi.py --cache DIR [--dry-run]

Source: the chain's own category pages https://burgerboi.co.uk/menu/<section>/ (the same pages tools/uk_extract/burger_boi.py reads the dish cards
from to cross-check its allergen and nutrition table; the section -> page table is that script's SECTIONS, imported here so the two can't drift).
Every dish on them is one card:
    <article class="mcard ..."> <div class="mcard__media"><picture><source srcset=".../assets/images/menu/<file>.webp">
    <img src="https://burgerboi.co.uk/wp-content/themes/burger-boi/assets/images/menu/<file>.jpg" alt="<DISH>"></picture></div>
    <h3 class="mcard__title"> <DISH> [<span class="mcard__tag">NEW</span>] </h3> ...
The photo is a file on burgerboi.co.uk itself (the WordPress theme's /assets/images/menu/ folder); the <img src> (JPEG) is taken, and store_image
resizes it to <= 640 px WebP, nothing else. No other host is asked for anything. Drinks have no category page (SECTIONS: None), so the ten drinks
get no photo.

Match rule (exact, nothing fuzzy). A card's photo is attached to a published item (load_items: items.csv minus holdback.csv) only when
  1. the item's category is the category burger_boi.SECTIONS gives a section, and the card sits on THAT section's page (/menu/<slug>/);
  2. the card's title, with the launch tag <span class="mcard__tag">NEW</span> left out, has the same norm_name as the item's name, or, for a name the
     table prints in more than one section, as the item's name without the section suffix burger_boi.SUFFIX adds ("Hot Honey (dip)" <- card "Hot Honey"
     on /menu/sauces/, "Korean Seoul (chicken sandwich)" <- card "Korean Seoul" on /menu/buttermilk-fried-chicken-sandwiches/);
  3. exactly one card on that page has that title, its <img> alt names the same dish (norm_name), and the photo is a JPEG/PNG/WebP under
     https://burgerboi.co.uk/wp-content/ (the site's own files);
  4. no other card anywhere on the category pages shows the same photo file under another name (a shared picture would be a placeholder or a
     family shot, not this dish's own photo).
Nothing is matched by file name, slug or similarity. (The sauce page's "Korean Seoul" card repeats the sandwich card's description and "33g protein"
text, but its photo is its own file, dip-korean-seoul.jpg, a different picture from the sandwich's chick-korean-seoul.jpg: it was looked at and
shows the dip.)

Terms (https://burgerboi.co.uk/terms-conditions, "Last updated August 14, 2026", read 2026-11-17): section 5.3 "Acceptable use. You must not: ...
scrape, data-mine, crawl or systematically extract content from the Website, except by well-behaved search engine crawlers obeying our robots.txt;
reproduce, resell or commercially exploit any part of the Website; use our menu, prices or images to create a competing product, price-comparison
service or franchise offering"; section 15 "Intellectual property": all intellectual property "belongs to us or our licensors. That includes ... our
food photography ... You may print or download extracts of the Website for your own personal, non-commercial use, provided you do not alter them and
you keep our notices intact. Any other use requires our written permission." An express restriction; installed on the founder's decision of
2026-10-06 (photos are installed even where a chain's terms restrict reuse: his accepted risk; CLAUDE.md rule 2).
robots.txt (https://burgerboi.co.uk/robots.txt, read 2026-11-17): "User-agent: * / Allow: /" and a Sitemap line: every page and file is allowed;
no group names an AI crawler. polite_get checks robots.txt on every URL (RFC 9309) and paces one request a second.

DROP_ITEMS lists the photos left out after looking at every one on a contact sheet (2026-11-17), so a rerun can't bring them back.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from burger_boi import SECTIONS, SUFFIX  # noqa: E402  (section -> (category, rankable, page slug, n); duplicate-name suffixes)
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "burger-boi"
SITE = "https://burgerboi.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-burger-boi")
PHOTO = re.compile(r"^https://burgerboi\.co\.uk/wp-content/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp)$", re.I)
# item id -> why it has no photo although its card has one (decided by looking at the photo; see the docstring)
DROP_ITEMS: dict[str, str] = {}

CARD = re.compile(r'<article[^>]*class="mcard[^"]*"[^>]*>(.*?)</article>', re.S)


def text_of(fragment: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def parse_cards(page: str, url: str) -> list[dict]:
    """One dict per dish card: title (launch tag removed), tag text, img src(s) and alt(s)."""
    out = []
    for body in CARD.findall(page):
        t = re.search(r'<h3 class="mcard__title">(.*?)</h3>', body, re.S)
        raw_title = t.group(1) if t else ""
        tags = [text_of(x) for x in re.findall(r'<span class="mcard__tag">(.*?)</span>', raw_title, re.S)]
        title = text_of(re.sub(r'<span class="mcard__tag">.*?</span>', " ", raw_title, flags=re.S))
        imgs = []
        for tag in re.findall(r"<img\b[^>]*>", body):
            src = re.search(r'\ssrc="([^"]*)"', tag)
            alt = re.search(r'\salt="([^"]*)"', tag)
            imgs.append((htmllib.unescape(src.group(1)) if src else "", htmllib.unescape(alt.group(1)) if alt else ""))
        out.append({"title": title, "tags": tags, "imgs": imgs, "page": url})
    if not out:
        raise SystemExit(f"{url}: no dish cards found: the page has changed shape")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_category = {cat: (sec, slug) for sec, (cat, _rk, slug, _n) in SECTIONS.items()}
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    matched: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, card title)
    try:
        cards_by_page: dict[str, list[dict]] = {}
        for sec, (_cat, _rk, slug, _n) in SECTIONS.items():
            if not slug:
                continue
            url = f"{SITE}/menu/{slug}/"
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            cards_by_page[url] = parse_cards(page, url)
        all_cards = [c for cs in cards_by_page.values() for c in cs]
        print(f"{len(all_cards)} dish cards on {len(cards_by_page)} category pages of {SITE}/menu/")
        # photo file -> the distinct dish names whose cards show it
        names_by_photo: dict[str, set[str]] = {}
        for c in all_cards:
            for src, _alt in c["imgs"]:
                names_by_photo.setdefault(src, set()).add(norm_name(c["title"]))

        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            sec_slug = by_category.get(it["category"])
            if not sec_slug:
                skipped.append(f"{it['id']}: category {it['category']!r} is not a section of burger_boi.SECTIONS")
                continue
            sec, slug = sec_slug
            if not slug:
                skipped.append(f"{it['id']}: section {sec!r} has no category page (no photo on the site)")
                continue
            url = f"{SITE}/menu/{slug}/"
            name = it["name"]
            suffix = SUFFIX.get(sec)
            if suffix and name.endswith(f" ({suffix})"):
                name = name[: -len(f" ({suffix})")]
            same = [c for c in cards_by_page[url] if norm_name(c["title"]) == norm_name(name)]
            if not same:
                skipped.append(f"{it['id']}: no card named {name!r} on {url}")
                continue
            if len(same) > 1:
                skipped.append(f"{it['id']}: {len(same)} cards named {name!r} on {url}: ambiguous")
                continue
            card = same[0]
            if len(card["imgs"]) != 1:
                skipped.append(f"{it['id']}: the card shows {len(card['imgs'])} images")
                continue
            src, alt = card["imgs"][0]
            if norm_name(alt) != norm_name(card["title"]):
                skipped.append(f"{it['id']}: the photo's alt {alt!r} does not name the card's dish {card['title']!r}")
                continue
            if not PHOTO.match(src):
                skipped.append(f"{it['id']}: the photo {src!r} is not a file on {SITE}/wp-content/")
                continue
            if len(names_by_photo.get(src, set())) > 1:
                skipped.append(f"{it['id']}: the photo {src.rsplit('/', 1)[-1]} is shown on cards for other dishes too "
                               f"({sorted(names_by_photo[src])}): not this dish's own photo")
                continue
            matched[it["id"]] = (src, url, card["title"] + (f" [{', '.join(card['tags'])}]" if card["tags"] else ""))

        for item_id, (src, page_url, title) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {src.rsplit('/', 1)[-1]:40} <- card {title!r} on {page_url}")
                continue
            raw = polite_get(src, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {src}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {src.rsplit('/', 1)[-1]}")
    except Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"could not fetch a page, stopping (nothing written): {e}", file=sys.stderr)
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
