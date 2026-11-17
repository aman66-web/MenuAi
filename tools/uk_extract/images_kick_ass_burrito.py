#!/usr/bin/env python3
"""Item photos for Kick Ass Burrito (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py): none can be taken today.

    python3 tools/uk_extract/images_kick_ass_burrito.py --cache DIR [--dry-run]

Kick Ass Burrito is a delivery-only brand cooked in Big Table Group restaurant kitchens (kick_ass_burrito.py). Where its dishes could
be pictured, checked 2026-11-17:
  - its own website: there is none. kickassburrito.co.uk, kickassburrito.com, kickassburritos.co.uk and kickass-burrito.co.uk (with and
    without www) have no DNS record.
  - the Big Table Group's site (https://www.bigtablegroup.com/, /our-brands, /latest-news; robots.txt "User-Agent: * / allow: / /
    disallow: /head-office/"): brand pages for Amalfi, Banana Tree, Bella Italia, Café Rouge, Chiquito, Coast to Coast, EST Italian,
    Filling Station, Frankie & Benny's and Las Iguanas, none for Kick Ass Burrito; the name appears nowhere on those pages.
    (www.bigtablegroup.co.uk could not be reached: its robots.txt failed with a TLS error, so RFC 9309 says not to fetch it.)
  - the chain's menu, https://menus.tenkites.com/thebigtg/kickassburrito (the Big Table Group's Ten Kites page that the nutrition comes
    from; robots.txt of menus.tenkites.com disallows only /fonts/, /views/ and /*.less): its two tabs (food and Drinks) show no picture of
    any dish. The only pictures on the page are the brand's logos (/thebigtg/unitsitelogo/...), the site favicon and a template default.
    Every one of them is on images.tenkites.com, whose robots.txt disallows everything ("Disallow: /", re-read 2026-11-17), so even a
    dish photo there could not be fetched; we do not look for "the same file" anywhere else.
  - ordering: only through Deliveroo, Just Eat and Uber Eats (third parties: never used, CLAUDE.md rule 2).

Match rule, if a dish picture ever appears on the menu page: none is attached by this script. It lists every picture the page shows
that is not a logo, favicon or template default, says whether robots.txt lets us fetch it, and exits 3 so whoever runs it writes a
proper matcher (one dish per picture, exact images_common.norm_name of the dish the picture sits beside, as images_subway.py).

Terms (read 2026-11-17): none found. The brand has no website of its own; the Ten Kites page links no terms; www.bigtablegroup.com's
footer links only a Privacy Policy, Careers, Corporate Governance, The Restaurant Card, Property and Franchise ("© The Big Table Group
2026"), no terms of use.

Run of 2026-11-17: 0 of 52 published items have a photo; no images.csv is written. A 401/403/429 or a robots refusal stops the script.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "kick-ass-burrito"
MENU = "https://menus.tenkites.com/thebigtg/kickassburrito"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-kick-ass-burrito")
# pictures on the page that are not dishes: the brand's logos, the favicon, the template's default image folder
NOT_DISHES = re.compile(r"/unitsitelogo/|/favicon\.ico$|/images/stdcasual-def/|^https://images\.tenkites\.com/?$")
PICTURE = re.compile(r"""(?:src|data-src|data-bg|srcset)=["']([^"']+)["']|url\(["']?([^"')]+\.(?:jpe?g|png|webp)[^"')]*)["']?\)""", re.I)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="report only (this script never downloads a photo or writes a CSV)")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    try:
        page = ic.polite_get(MENU, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    pictures = set()
    for a, b in PICTURE.findall(page):
        for u in (a or b).split(","):
            u = htmllib.unescape(u.strip().split(" ")[0])
            if u.startswith("http") and re.search(r"\.(jpe?g|png|webp)(\?|$)", u, re.I):
                pictures.add(u)
    dishes = sorted(u for u in pictures if not NOT_DISHES.search(u))
    print(f"{MENU}: {len(pictures)} picture(s), of which {len(dishes)} could be dish photos")
    for u in dishes:
        print(f"  {u}  (robots.txt {'allows' if ic._robots_allow(u) else 'disallows'} it)")
    if dishes:
        print("The menu page now shows dish pictures: write a matcher (see the docstring) before attaching any.")
        return 3
    print(f"0 of {len(items)} published items have a photo: the chain shows none on its own pages (see the docstring). No images.csv written.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
