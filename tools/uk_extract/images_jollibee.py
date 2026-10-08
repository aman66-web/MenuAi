#!/usr/bin/env python3
"""Item photos for Jollibee UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_jollibee.py [--cache DIR] [--dry-run]

Source: https://www.jollibee.uk/menu (the chain's own Squarespace site; the nutrition data came from the calorie chart PDF
the site links from /nutritional-info). The menu page is one list of image blocks. Each block is a <figure> with the
item's photo (<img data-image="https://images.squarespace-cdn.com/content/v1/.../<file>">), its title (<h4>) and a caption
that starts with the item's calories ("324 kcal*"). We read only that HTML page (never the ?format=json view, which
robots.txt disallows) and download each photo once from the CDN host the page itself loads it from.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when ALL of these hold:
  1. the block's title equals the item's name after images_common.norm_name, with ONE spelling rule applied to both
     sides: a count written "<n>pc" is read as "<n> piece" (the chart prints "1pc Chickenjoy", the page "1 Piece
     Chickenjoy"). Nothing else is rewritten: "2pc Chickenjoy" (chart) is NOT matched to "2 Piece Chickenjoy with Gravy"
     (page), "3pc Chicken Strips" is NOT matched to "3 Piece Jolli Tenders", the Spicy Chickenjoy items are NOT matched
     to the page's "Available with Original or Spicy Chickenjoy" block (its photo shows one kind of chicken);
  2. exactly one block and exactly one published item carry that name;
  3. the calories printed in the block's caption equal the item's published calories (the chart is dated March 2023, so a
     page whose number has moved on is a different version of the dish and gets no photo);
  4. the photo file is not used by another item (a shared picture is dropped for all of them);
  5. EXCLUDE (below) lists photos I looked at on a contact sheet and removed because the picture does not show the named
     item. The script never brings them back.

Terms and robots (read 2026-10-08):
  * jollibee.uk has no website terms of use or copyright notice: the privacy notice, website privacy policy, cookie policy,
    FAQs, nutritional-info and menu pages were searched for copyright, intellectual property, reproduce, photograph, all
    rights and terms of use (nothing). /termsandconditions is only the Instagram competition rules (2021); the sitemap's other
    "terms" pages are competitions, coupons and gift cards. A generic restriction therefore could not be quoted.
  * robots.txt of www.jollibee.uk (Squarespace default, "User-agent: *") disallows /config, /search, /account, /api/,
    /static/ and the ?format=json style views; /menu is allowed. The photos are on images.squarespace-cdn.com, which answers
    404 for /robots.txt (RFC 9309: no rules). One request per second; polite_get checks robots on every URL.
Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "jollibee"
PAGE_URL = "https://www.jollibee.uk/menu"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-jollibee")
CDN = re.compile(r"^https://images\.squarespace-cdn\.com/content/v1/[^\s?#]+\.(?:jpe?g|png|webp)$", re.I)

# Items whose matched photo was removed after looking at it (item id -> why). Filled in from the contact sheet.
EXCLUDE: dict[str, str] = {
    # the page's "2 Piece Chickenjoy Meal" block shows 2 pieces of chicken with a bowl of spaghetti and a drink (the file
    # is named "2pc Chickenjoy with Spaghetti Meal"), but the item is the fries meal: "served with your choice of fries,
    # drink, and a side of gravy" (the page's own text). The picture does not show the named item.
    "2pc-chickenjoy-meal": "photo shows the spaghetti meal, not the fries meal",
}

FIGURE = re.compile(r"<figure.*?</figure>", re.S)
IMG = re.compile(r'<img[^>]*\bdata-image="([^"]+)"')
TITLE = re.compile(r"<h4[^>]*>(.*?)</h4>", re.S)
SUBTITLE = re.compile(r"data-sqsp-image-classic-block-subtitle>(.*)</div></div>", re.S)
KCAL = re.compile(r"(\d[\d,]*)\s*kcal", re.I)


def key(name: str) -> str:
    """norm_name, plus '<n>pc' read as '<n> piece' (the only spelling rule; see the module docstring)."""
    return re.sub(r"\b(\d+)\s*pc\b", r"\1 piece", norm_name(name))


def parse_blocks(page: str) -> list[dict]:
    blocks = []
    for fig in FIGURE.findall(page):
        img, title = IMG.search(fig), TITLE.search(fig)
        if not img or not title:
            continue
        name = html.unescape(re.sub(r"<[^>]+>", "", title.group(1))).strip()
        sub = SUBTITLE.search(fig)
        text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", sub.group(1)))) if sub else ""
        k = KCAL.search(text)
        blocks.append({
            "name": name,
            "kcal": int(k.group(1).replace(",", "")) if k else None,
            "photo": html.unescape(img.group(1)),
        })
    return blocks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(key(it["name"]), []).append(it)

    skipped: list[str] = []
    matched: dict[str, dict] = {}
    try:
        page = polite_get(PAGE_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8")
        blocks = parse_blocks(page)
        print(f"{len(blocks)} photo blocks on {PAGE_URL}")
        blocks_by_key: dict[str, list[dict]] = {}
        for b in blocks:
            blocks_by_key.setdefault(key(b["name"]), []).append(b)

        for k, its in sorted(by_key.items()):
            found = blocks_by_key.get(k, [])
            if not found:
                continue                      # the page has no block of exactly this name
            if len(its) != 1:
                skipped.append(f"{k}: {len(its)} published items share this name")
                continue
            item = its[0]
            if len(found) != 1:
                skipped.append(f"{item['id']}: {len(found)} page blocks are titled {item['name']!r}")
                continue
            b = found[0]
            if b["kcal"] is None or str(b["kcal"]) != str(item["calories"]).strip():
                skipped.append(f"{item['id']}: page says {b['kcal']} kcal, the published item {item['calories']}")
                continue
            if not CDN.match(b["photo"]):
                skipped.append(f"{item['id']}: photo URL not on the site's image host: {b['photo']}")
                continue
            if item["id"] in EXCLUDE:
                skipped.append(f"{item['id']}: {EXCLUDE[item['id']]}")
                continue
            matched[item["id"]] = {"item": item, "photo": b["photo"], "title": b["name"]}

        users: dict[str, list[str]] = {}
        for iid, m in matched.items():
            users.setdefault(m["photo"], []).append(iid)
        for photo, ids in users.items():
            if len(ids) > 1:
                for iid in ids:
                    skipped.append(f"{iid}: photo {photo} is also used by {', '.join(i for i in ids if i != iid)}")
                    del matched[iid]

        rows: dict[str, tuple[str, str]] = {}
        for iid, m in sorted(matched.items()):
            if args.dry_run:
                print(f"  {iid:40} {m['item']['name']:44} <- {m['title']!r}  {m['photo'][-60:]}")
                continue
            raw = polite_get(m["photo"], args.cache, referer=PAGE_URL)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{iid}: {m['photo']}: {e}")
                continue
            rows[iid] = (fname, PAGE_URL)
            print(f"  {iid:40} {fname}  <- {m['title']!r}")
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
