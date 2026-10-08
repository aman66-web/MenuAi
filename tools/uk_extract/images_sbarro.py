#!/usr/bin/env python3
"""Item photos for Sbarro UK (docs/UK_DATA_PLAYBOOK.md, Phase 4). NOT RUN FOR REAL: the photo host's robots.txt answers HTTP 403 (see below).

    python3 tools/uk_extract/images_sbarro.py --cache <dir> --dry-run   # fetch the menu page only, list the matches (never a photo)
    python3 tools/uk_extract/images_sbarro.py --cache <dir> --wix-media-has-no-robots   # a real run: only after the founder/main session decides

Source: the chain's own menu page https://www.sbarro.co.uk/menu (a Wix site). Each dish tile is an <img alt="<dish name>"> served from
static.wixstatic.com/media/<id>~mv2.<ext>. The page shows blurred 147x98 renditions (".../v1/fill/w_147,h_98,...blur_2"); we would fetch the
ORIGINAL media file (https://static.wixstatic.com/media/<id>, no fill/crop parameters) so nothing is cropped in the file; store_image then only
downsizes to 640 px and converts to WebP.

Matching (exact only): the tile's alt text must equal a published item's name (norm_name) and appear once on the page. That gives only the drinks and
ice cream. The pizza tiles are named "Cheese", "Pepperoni", "BBQ Chicken", "Firecracker", "Ham and Mushroom", "Meat Feast" while our items are
"<name> 12in / 14in / 17in (slice)" (the page does not list sizes), and "Pepperoni" appears twice (pizza and stromboli tile): not matched, per the rule
"ambiguous or not-the-same name -> no photo". The tiles "Wedges", "Chicken Nuggets", "Garlic Breadstick", "Mozzarella Sticks", "Southern Chicken Strips",
"Hot 'n' Spicy Chicken Wings", "Chicken and Cheese", "Spinach & Ricotta", "Milk Chocolate Cookie Dough", "7up Zero Sugar", "Bottled Water", dips ... differ from
our published names (Potato Wedges, Halal Chicken Nuggets (4), ...), so they are not matched either (the --dry-run list says which).

Robots / terms (read 2026-10-08):
- https://www.sbarro.co.uk/robots.txt: "User-agent: * Allow: / Disallow: *?lightbox=" (+ Ads/Pet bots groups): the menu page is allowed.
- https://static.wixstatic.com/robots.txt answers HTTP 403 with the 9-byte body "Forbidden" (Wix's media router answers 403 to every non-media path). images_common
  reads a 403 on robots.txt as "do not fetch", so a real run stops at the first photo with Blocked unless --wix-media-has-no-robots is passed (RFC 9309 reads a 4xx
  as "no rules"; same decision as tools/uk_extract/images_amigos_burgers_and_shakes.py). It is left to the founder / main session; this agent did not pass it.
- Terms: Sbarro's footer pages are Cookie Policy, Privacy Policy, Modern Slavery Act and Loyalty Card T&C's; there is no website terms-of-use page and nothing
  about images, copyright or reuse (a guessed /terms-and-conditions answered HTTP 429, Wix throttling our shared address, so it was not pursued).
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "sbarro"
MENU_URL = "https://www.sbarro.co.uk/menu"
MEDIA = "https://static.wixstatic.com/media/"
MIN_RENDERED = 100          # tiles are rendered >= 147 px wide; smaller images (49 px, 64 px) are not dish tiles we can vouch for
# Item ids never given a photo (checked by eye after a download), e.g. EXCLUDE = {"item-id": "why"}
EXCLUDE: dict[str, str] = {}
_IMG = re.compile(r"<img\b[^>]*>", re.S)


def get(url: str, cache: Path, **kw) -> bytes:
    """polite_get that waits and asks again after an HTTP 429 (Wix throttles our shared address). 403 and robots refusals still stop the run."""
    for attempt in range(5):
        try:
            return ic.polite_get(url, cache, delay=5.0, **kw)
        except ic.Blocked as e:
            if "HTTP 429" not in str(e) or attempt == 4:
                raise
            time.sleep(20 * (attempt + 1))
    raise AssertionError("unreachable")


def tiles(page: str) -> list[dict]:
    """[{alt, media id, rendered width}] for every dish tile (<img alt=name> from the chain's own media folder) on the menu page."""
    out = []
    for m in _IMG.finditer(page):
        tag = m.group(0)
        mid = re.search(r"static\.wixstatic\.com/media/(3da10b_[0-9a-f]{32}(?:~|%7E)mv2\.\w+)", tag)
        alt = re.search(r'\balt="([^"]*)"', tag)
        w = re.search(r"/fill/w_(\d+),h_(\d+)", tag)
        if mid and alt and alt.group(1).strip() and w:
            out.append({"alt": " ".join(htmllib.unescape(alt.group(1)).split()), "id": mid.group(1).replace("%7E", "~"), "w": int(w.group(1))})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="cache dir (each page and photo is fetched at most once)")
    ap.add_argument("--dry-run", action="store_true", help="list the matches; fetch only the menu page (never a photo)")
    ap.add_argument("--retrieved-on", default=None)
    ap.add_argument("--wix-media-has-no-robots", action="store_true",
                    help="DECISION FOR THE FOUNDER/MAIN SESSION, off by default: static.wixstatic.com/robots.txt answers HTTP 403 'Forbidden' (the media router has "
                         "no robots.txt), which images_common reads as 'do not fetch'. With this flag the photo host is treated as having no robots.txt (RFC 9309: a 4xx "
                         "means no rules). The chain's own site robots.txt (Allow: /) is always honoured.")
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    page = get(MENU_URL, args.cache, accept="text/html,application/xhtml+xml;q=0.9,*/*;q=0.8").decode("utf-8", "replace")
    ts = tiles(page)
    if not ts:
        raise SystemExit("menu page: no dish tiles found: the layout changed")
    count: dict[str, int] = {}
    for t in ts:
        count[ic.norm_name(t["alt"])] = count.get(ic.norm_name(t["alt"]), 0) + 1

    wanted: dict[str, tuple[str, str]] = {}          # item_id -> (original media URL, page URL)
    notes: list[str] = []
    for t in ts:
        key = ic.norm_name(t["alt"])
        hits = by_name.get(key, [])
        if count[key] > 1:
            notes.append(f"{t['alt']}: appears {count[key]} times on the page -> none")
        elif t["w"] < MIN_RENDERED:
            notes.append(f"{t['alt']}: rendered only {t['w']} px wide -> none")
        elif len(hits) != 1:
            notes.append(f"{t['alt']}: {'no published item with exactly this name' if not hits else 'several published items share this name'} -> none")
        elif hits[0]["id"] in EXCLUDE:
            notes.append(f"{hits[0]['name']}: excluded ({EXCLUDE[hits[0]['id']]})")
        else:
            wanted[hits[0]["id"]] = (MEDIA + t["id"], MENU_URL)

    by_id = {i["id"]: i for i in items}
    order = [i["id"] for i in items]
    print(f"{len(items)} published items; {len(ts)} dish tiles on the menu page; {len(wanted)} items matched to a photo")
    for item_id in sorted(wanted, key=order.index):
        print(f"  {by_id[item_id]['category']:<12} {by_id[item_id]['name']:<24} {wanted[item_id][0].rsplit('/', 1)[-1]}")
    print("Tiles not matched:")
    for n in notes:
        print("  -", n)
    print(f"  ({len(items) - len(wanted)} published items without a photo in total)")
    if args.dry_run:
        return
    if not args.wix_media_has_no_robots:
        print("static.wixstatic.com/robots.txt answers 403: not downloading (pass --wix-media-has-no-robots only on the founder's/main session's decision).")
        raise SystemExit(2)
    ic._robots["https://static.wixstatic.com"] = []      # the decision above: the media host has no robots.txt

    rows: dict[str, tuple[str, str]] = {}
    stored: dict[str, str] = {}
    try:
        for item_id, (url, page_url) in wanted.items():
            if url not in stored:
                raw = get(url, args.cache, referer=page_url)
                try:
                    stored[url] = ic.store_image(CHAIN_ID, raw)
                except ValueError as e:
                    print(f"  skipped {by_id[item_id]['name']}: {e}")
                    stored[url] = ""
            if stored[url]:
                rows[item_id] = (stored[url], page_url)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing was written to images.csv. We never work round a block.")
        raise SystemExit(2)
    ic.write_images_csv(CHAIN_ID, rows, args.retrieved_on)
    print(f"{len(rows)} of {len(items)} published items now have a photo; {len(set(f for f, _ in rows.values()))} files")
    for fname, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")


if __name__ == "__main__":
    main()
