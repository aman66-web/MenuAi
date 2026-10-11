#!/usr/bin/env python3
"""Item photos for atis from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_atis.py --cache DIR --dry-run                    # reads two atis.life pages only; lists matches
    python3 tools/uk_extract/images_atis.py --cache DIR --allow-s3-403               # downloads the photos (read STATUS first)

STATUS (2026-10-11): NOT RUN FOR REAL. The dry run works. The photos are in the chain's own Amazon S3 bucket
(https://atis-life.s3.eu-west-1.amazonaws.com/products/<uuid>.webp, the host the chain's own page data names), and that bucket's
/robots.txt answers HTTP 403 "AccessDenied" (S3's answer for any key that does not exist in a bucket that cannot be listed: there is no
robots.txt file). images_common.polite_get reads a 403 on an `*.s3.<region>.amazonaws.com` host as "no rules" (the exemption added for
Wimpy), so it would not stop here; but the brief for this run says a 403 on a robots.txt stops the chain, so the real run is switched off
unless `--allow-s3-403` is passed. atis.life's own robots.txt ("User-agent: * / Allow: / / Disallow: /admin") allows everything we read.
The main session decides: run with --allow-s3-403 (the S3 exemption already used for Wimpy), or leave atis without photos.

Source: the chain's two menu pages https://atis.life/bowls-plates-sides and https://atis.life/wraps, the same pages tools/uk_extract/atis.py
reads the nutrition from. Each carries a Vue prop `:preloaded-collections="[...]"`: the sections (Essentials Edit, Power Plates, Salad Bowls,
Side Pots, Wraps) with one product record per dish: `title` (e.g. "SATAY TOFU SLAW"), `nutrients` (the four figures the card prints) and
`image` (the dish photo: `url` = the original file in the bucket above; `thumbnail_url` / `medium_url` / `large_url` are atis.life/curator/...
re-crops or re-encodes made by the site: NOT used, we take the original and let store_image do the only change: downsize to <= 640 px, WebP).

Match rule (exact, nothing fuzzy): a published item gets the photo of the product record whose title has the same norm_name as the item's
name. The photo, the name and the nutrition numbers sit in one product record. Duplicate names or a record with no image give no photo.

Terms (https://atis.life/terms-conditions, "Intellectual Property Rights" and "Acceptable Use", read 2026-10-11): "3.2 ... You may print extracts
from the Website for your own personal and non-commercial use only ... You may not use any content available from or through the Website for any
other purpose without our prior written approval. 3.3. You are not allowed to create a database in electronic or paper form comprising all or part
of the material appearing or underlying the Website." An express restriction; the founder's decision of 2026-10-06 covers installing photos where
terms restrict reuse (his accepted risk); a robots refusal is different and is not covered, hence the switch above.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "atis"
PAGES = ["https://atis.life/bowls-plates-sides", "https://atis.life/wraps"]
PHOTO_PREFIX = "https://atis-life.s3.eu-west-1.amazonaws.com/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-atis")
DROP_ITEMS: dict[str, str] = {}   # item id -> why it was looked at after the first run and left without a photo (a rerun must not bring it back)
GENERATED = re.compile(r"chatgpt|dall-?e|midjourney|gemini|firefly|stable.?diffusion", re.I)


def preloaded(page: str) -> list[dict]:
    start = page.find(' :preloaded-collections="')
    if start < 0:
        raise SystemExit("the page no longer has the preloaded-collections prop: the site has changed shape")
    start += len(' :preloaded-collections="')
    return json.loads(html.unescape(page[start:page.index('"', start)]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    ap.add_argument("--allow-s3-403", action="store_true",
                    help="download from the chain's S3 bucket although its robots.txt answers 403 (see STATUS); needs the main session's say-so")
    args = ap.parse_args()
    if not args.dry_run and not args.allow_s3_403:
        print("Not downloading: the photo host's robots.txt answers 403 (see STATUS in the docstring). Use --dry-run, or --allow-s3-403 once decided.",
              file=sys.stderr)
        return 3

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        records: dict[str, list[tuple[dict, str]]] = {}   # norm title -> [(record, page url)]
        for url in PAGES:
            page = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for coll in preloaded(page):
                for p in coll["products"]:
                    records.setdefault(norm_name(p["title"]), []).append((p, url))
        print(f"{sum(len(v) for v in records.values())} dish records on {len(PAGES)} pages")

        matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            recs = records.get(norm_name(it["name"]), [])
            if len(recs) != 1:
                skipped.append(f"{it['id']}: {len(recs)} records on the pages with this name")
                continue
            rec, page_url = recs[0]
            img = rec.get("image") or {}
            url = img.get("url") or ""
            if not url:
                skipped.append(f"{it['id']}: the chain's record has no photo")
            elif not url.startswith(PHOTO_PREFIX):
                skipped.append(f"{it['id']}: photo {url} is not in the chain's bucket")
            elif GENERATED.search(f"{img.get('title') or ''} {url}"):
                skipped.append(f"{it['id']}: the chain's file name says it is an AI-generated image")
            else:
                matched[it["id"]] = (url, page_url)

        for item_id, (url, page_url) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:40} {url[len(PHOTO_PREFIX):]}  <- {page_url}")
                continue
            raw = polite_get(url, args.cache, referer=page_url)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page_url)
            print(f"  {item_id:40} {fname}  <- {url[len(PHOTO_PREFIX):]}")
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
