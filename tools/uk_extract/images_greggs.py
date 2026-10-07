#!/usr/bin/env python3
"""Item photos for Greggs (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_greggs.py --cache <dir> [--dry-run]

Source: Greggs' own website. The menu page https://www.greggs.com/menu loads its products from the chain's own JSON feed
    https://production-digital.greggs.co.uk/api/v1.0/articles/masters?ExcludeUnpublished=true&ExcludeDuplicates=true&ExcludeHiddenFromMenu=true
(one record per product: articleCode, articleName, imageUri ...). Each product has its own page,
https://www.greggs.com/menu/product/<slug of name>-<articleCode> (the slug is built exactly as the site's own code builds it),
which shows that record's `imageUri` photo (hosted on articles.greggs.co.uk, the asset host the pages use) under an <h1>
with the product name.

robots.txt (read 2026-10-07): www.greggs.com disallows only /404, /app-content/* and /click-and-collect/*; the feed host
production-digital.greggs.co.uk and the photo host articles.greggs.co.uk serve no robots.txt (HTTP 404 = no rules, RFC 9309).
Nothing here touches a disallowed path, and none of the pages/feeds answered 401/403/429.

Terms (https://www.greggs.com/legals/terms-and-conditions, "Intellectual property rights", read 2026-10-07): "All copyright and
other intellectual property rights in the Website and the App and its content belong exclusively to us or our licensors. By
accessing the Website and the App, you agree that you will access the content for your personal non-commercial use only.
None of the content may be downloaded, copied, reproduced, transmitted, stored, sold or distributed without our consent."
The terms restrict copying of images/content. The founder decided (2026-10-06, CLAUDE.md rule 2) to install photos anyway
and accepts that risk; Greggs' photos come down the day it asks (delete web/public/menu-images/greggs + images.csv).

Match rule (exact, nothing fuzzy). A feed record's photo is attached to a published item only when
  (a) norm_name(record.articleName) equals norm_name(item name), or
  (b) the record names a size and the item is that same product in that size: "Regular Latte" / "Large Latte" (the feed's
      way of writing it) is the item "Latte (regular)" / "Latte (large)" (the PDF guide's way). The words are identical, only
      the size word moves; no other word is added, dropped or approximated. Decaf and other variants the feed has no record
      for get no photo. Set SIZE_RULE = False to use rule (a) only.
and, on top of that,
  - the record is published, not hidden from the menu, not a customisation and not a meal deal (a record flagged
    isCustomisation, e.g. "Pepperoni Pizza" 1001171, has no product page: it returns 404, so it is not used);
  - the record's own product page exists and its <h1> and og:title name the same product (norm_name equal) and its og:image
    is the record's imageUri: so the page the CSV points to really shows this photo for this item;
  - the record name is unique in the feed, the item name is unique in items.csv, and no two records map to one item
    (ambiguous: no photo).
Not matched: items the feed names differently ("Chicken Rolls" vs "Chicken Roll", "Hash Browns" vs "Hash Brown 2 Pack",
pizza boxes "2 Pack" vs "2 Slice"...), and everything the feed does not list (add-ons, sauces, bread, decaf, iced drinks).
Photos that print nutrition numbers or claims are not used (list them in SKIP_CODES after looking at them).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import unicodedata
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "greggs"
SITE = "https://www.greggs.com"
FEED = ("https://production-digital.greggs.co.uk/api/v1.0/articles/masters"
        "?ExcludeUnpublished=true&ExcludeDuplicates=true&ExcludeHiddenFromMenu=true")
PHOTO_HOST = "https://articles.greggs.co.uk/"
SIZE_RULE = True
SIZES = ("regular", "large", "small")
SKIP_CODES: dict[str, str] = {}   # articleCode -> why its photo is not used (nutrition text, placeholder...)


def product_slug(name: str) -> str:
    """The site's own slug for a product name (greggs.com's K$/zp functions): ascii-fold, '-', '&', '/' become spaces,
    other punctuation is dropped, lower case, words joined by '-'."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[-&/]", " ", s)
    s = re.sub(r"[^\w\s]", "", s).lower().strip()
    return "-".join(s.split())


def product_url(rec: dict) -> str:
    return f"{SITE}/menu/product/{product_slug(rec['articleName'])}-{rec['articleCode']}"


def size_key(name: str) -> str | None:
    """'Regular Latte' -> norm_name('Latte (regular)'); None when the name does not start with a size word."""
    first, _, rest = name.strip().partition(" ")
    if first.lower() in SIZES and rest.strip():
        return ic.norm_name(f"{rest.strip()} ({first.lower()})")
    return None


def page_facts(page_html: str) -> tuple[str, str, str]:
    """(<h1> text, og:title, og:image) of a product page, each '' when missing."""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", page_html, re.S)
    h1 = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""
    m = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]*)"', page_html)
    og_title = html.unescape(m.group(1)).strip() if m else ""
    m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]*)"', page_html)
    og_image = html.unescape(m.group(1)).strip() if m else ""
    return h1, og_title, og_image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for the feed, pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the feed and pages, print the matches; download and write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it["id"])
    item_name = {it["id"]: it["name"] for it in items}

    skipped: list[str] = []
    try:
        feed = json.loads(ic.polite_get(FEED, args.cache, accept="application/json").decode("utf-8"))
        if not isinstance(feed, list) or not feed:
            print("error: the product feed is empty or has an unexpected shape; nothing written", file=sys.stderr)
            return 1

        feed_names: dict[str, int] = {}
        for rec in feed:
            feed_names[ic.norm_name(rec.get("articleName", ""))] = feed_names.get(ic.norm_name(rec.get("articleName", "")), 0) + 1

        # 1. candidates: record -> item id, by the exact rules (a) and (b)
        cand: dict[str, list[dict]] = {}   # item id -> records that map to it
        for rec in feed:
            name = rec.get("articleName") or ""
            code = str(rec.get("articleCode") or "")
            key = ic.norm_name(name)
            if feed_names.get(key, 0) > 1:
                if key in by_name:
                    skipped.append(f"{code} '{name}': the feed lists this name {feed_names[key]} times; ambiguous")
                continue
            ids = by_name.get(key)
            how = "name"
            if not ids and SIZE_RULE:
                sk = size_key(name)
                ids = by_name.get(sk) if sk else None
                how = "size"
            if not ids:
                continue
            if len(ids) > 1:
                skipped.append(f"{code} '{name}': the name of {len(ids)} published items; ambiguous")
                continue
            if not rec.get("isPublished") or rec.get("isHiddenInMenu") or rec.get("isMealDeal"):
                skipped.append(f"{code} '{name}': not a published menu product")
                continue
            if rec.get("isCustomisation"):
                skipped.append(f"{code} '{name}': flagged isCustomisation (no product page); not used")
                continue
            if code in SKIP_CODES:
                skipped.append(f"{code} '{name}': skipped: {SKIP_CODES[code]}")
                continue
            photo = rec.get("imageUri") or ""
            if not photo.startswith(PHOTO_HOST):
                skipped.append(f"{code} '{name}': no photo on the Greggs photo host ({photo or 'none'})")
                continue
            rec = dict(rec, _how=how)
            cand.setdefault(ids[0], []).append(rec)

        # 2. verify each candidate on its own product page, then keep it
        matches: dict[str, tuple[str, str, str]] = {}   # item id -> (photo url, page url, record name)
        for item_id, recs in sorted(cand.items()):
            if len(recs) > 1:
                skipped.append(f"{item_id}: {len(recs)} feed records map to it ({', '.join(r['articleName'] for r in recs)}); ambiguous")
                continue
            rec = recs[0]
            page = product_url(rec)
            try:
                page_html = ic.polite_get(page, args.cache, accept="text/html").decode("utf-8", "replace")
            except urllib.error.HTTPError as e:
                skipped.append(f"{item_id}: product page {page} answered HTTP {e.code}; no photo")
                continue
            h1, og_title, og_image = page_facts(page_html)
            want = ic.norm_name(rec["articleName"])
            if ic.norm_name(h1) != want or ic.norm_name(og_title) != want:
                skipped.append(f"{item_id}: product page {page} is headed '{h1}' / '{og_title}', not '{rec['articleName']}'; no photo")
                continue
            if og_image.split("?")[0] != rec["imageUri"].split("?")[0]:
                skipped.append(f"{item_id}: product page {page} shows {og_image or 'no photo'}, not the feed photo; no photo")
                continue
            matches[item_id] = (rec["imageUri"], page, rec["articleName"])

        if args.dry_run:
            for item_id, (photo, page, rname) in sorted(matches.items()):
                note = "" if ic.norm_name(rname) == ic.norm_name(item_name[item_id]) else f"   [size rule: feed name '{rname}']"
                print(f"{item_id}: '{item_name[item_id]}'  {photo}  <- {page}{note}")

        rows: dict[str, tuple[str, str]] = {}
        if not args.dry_run:
            for item_id, (photo, page, _) in sorted(matches.items()):
                try:
                    raw = ic.polite_get(photo, args.cache, referer=page)
                    rows[item_id] = (ic.store_image(CHAIN, raw), page)
                except urllib.error.HTTPError as e:
                    skipped.append(f"{item_id}: {photo} answered HTTP {e.code}")
                except ValueError as e:
                    skipped.append(f"{item_id}: {photo}: {e}")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2
    except urllib.error.URLError as e:
        print(f"error: could not fetch the Greggs feed/pages ({e}); nothing written", file=sys.stderr)
        return 1

    for s in skipped:
        print("skip:", s)
    if args.dry_run:
        print(f"{len(matches)} of {len(items)} published items matched")
        return 0

    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"LOOK: {f} is used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
