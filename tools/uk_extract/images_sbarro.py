#!/usr/bin/env python3
"""Item photos for Sbarro UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_sbarro.py --cache DIR [--dry-run]

Source: the chain's own menu page https://www.sbarro.co.uk/menu (a Wix site using Wix's restaurant-menus widget; the page is served with every
section and dish already in the HTML). Each section is `<span data-hook="section.name">Stromboli</span>` followed by its dishes, and each dish tile is
`<span data-hook="item.name">Chicken and Cheese</span>` with `<img alt="Chicken and Cheese">` served from static.wixstatic.com/media/<id>~mv2.<ext>
(the chain's own Wix media folder, prefix 3da10b_). The page shows blurred 147x98 renditions (".../v1/fill/w_147,h_98,...blur_2"); we fetch the
ORIGINAL media file (https://static.wixstatic.com/media/<id>, no fill/crop parameters), so nothing is cropped in the file; store_image then only
downsizes to <= 640 px and converts to WebP. Nothing else is requested besides the menu page and those photo files.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when
  1. the tile's name (its alt text) has the same norm_name as the item's name, or
  2. the tile sits in a section whose heading names the product type (only "Stromboli": the menu lists "Chicken and Cheese" under the
     heading "Stromboli", and the chain's nutrition guide names that product "Chicken & Cheese Stromboli"), and "<tile name> <section heading>"
     has the same norm_name as the item's name (the way images_subway.py completes "Sub"/"Wrap" from the card's own text), and
  3. that name (plain or completed) appears on one tile only, and exactly one published item has it.
Nothing else is matched. The pizza tiles ("Cheese", "Pepperoni", "BBQ Chicken", "Firecracker", "Ham and Mushroom", "Meat Feast" under "Pizzas &
Slices") are not matched: our items are "<name> 12in / 14in / 17in (slice)" and the page names no size, so one photo would stand for a family of
sizes. "Pepperoni" under Stromboli completes to "Pepperoni Stromboli", not our "Pepperoni & Cheese Stromboli": not matched. Sides, desserts and dips
are named differently on the page ("Wedges" vs Potato Wedges, "Chicken Nuggets" vs Halal Chicken Nuggets (4), "Mozzarella Sticks" vs Breaded
Mozzarella Sticks, "Cheesy Garlic Breadstick" vs Cheesy Garlic Breadsticks, "Hot 'n' Spicy Chicken Wings" vs Hot & Kickin' Chicken Wings,
"Milk Chocolate Cookie Dough" vs Cookie Dough - Milk Chocolate, "Garlic & Herb" vs Dip Pot - Garlic & Herb, "7up Zero Sugar" vs 7Up ...): not matched.
The other pages of the site (home, /copy-of-in-store-deals = the same menu, /menu?menu=promos-menu = meal deals only, /delivery) show no other dish
tiles; the meal-deal tiles are whole deals, never one item.

Not used: the "Click and Collect" ordering site the menu links (https://order.withqikserve.com/Sbarro-Como, QikServe, Cloudflare Turnstile switched
on in its page settings). Its robots.txt answers 404 (no rules) and its page HTML answered 200 to a plain request, but its menu is drawn by
JavaScript modules with no readable feed in the page, and when the page was opened once in a headless browser (2026-11-17) the page itself answered
HTTP 403 ("Venue not found"). That is a refusal: we stopped there and did not try again in any other way.

Robots (read 2026-11-17): https://www.sbarro.co.uk/robots.txt: "User-agent: * / Allow: / / Disallow: *?lightbox=" (plus AdsBot, PetalBot, dotbot and
AhrefsBot groups): the menu page is allowed; no group names an AI crawler. https://static.wixstatic.com/robots.txt answers HTTP 403 ("Forbidden",
Wix's media router has no robots.txt): RFC 9309 reads a 4xx as "no rules" (founder's decision of 2026-10-12, images_common._robots_allow). polite_get
checks robots.txt on every URL; this script waits 5 s between requests to one host. A 401/403/429 or a robots refusal stops the run before anything is
written (no retry, no other route).

Terms (read 2026-11-17): the site's footer lists Cookie Policy, Privacy Policy, Modern Slavery Act and Loyalty Card T&C's; there is no website
terms-of-use page (the sitemap /pages-sitemap.xml lists none) and none of those pages or the FAQ says anything about copying or reusing the site's
content or images. No restrictive clause found.

Run of 2026-11-17: 6 items matched (Chicken & Cheese Stromboli and Spinach & Ricotta Stromboli by rule 2; Ice Cream, Pepsi Max, Pepsi Max Cherry
and Tango Orange by rule 1). Every photo was looked at on a contact sheet and full size: the two strombolis are photos of the dish on Sbarro's own
printed wrapper paper (its decorative "NYC 1956" / "100%" lettering, no nutrition figure, price or sticker) and are kept; the other four are a
third-party brand's tub or bottle instead of the food and are left out (EXCLUDE), so 2 of 91 published items have a photo.
"""
from __future__ import annotations

import argparse
import html as htmllib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "sbarro"
MENU_URL = "https://www.sbarro.co.uk/menu"
MEDIA = "https://static.wixstatic.com/media/"
HTML_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
DELAY = 5.0                 # seconds between two requests to one host (Wix throttles shared addresses)
# Section headings that name the product type of every dish in them (rule 2): the dish is "<tile name> <heading>".
PRODUCT_TYPE_SECTIONS = {"stromboli"}
# Item ids never given a photo (checked by eye on the contact sheet, 2026-11-17).
EXCLUDE: dict[str, str] = {
    "ice-cream": "the picture is a third-party brand's tub (Yarde Farm 'Clotted Cream Vanilla'), a pack, not the food",
    "pepsi-max": "the picture is a third-party brand's bottle (Pepsi), a pack, not the food",
    "pepsi-max-cherry": "the picture is a third-party brand's bottle (Pepsi), a pack, not the food",
    "tango-orange": "the picture is a third-party brand's bottle (Tango), a pack, not the food",
}
_TOKEN = re.compile(r'<span\b[^>]*data-hook="section\.name"[^>]*>(.*?)</span>|<img\b[^>]*>', re.S)


def get(url: str, cache: Path, **kw) -> bytes:
    return ic.polite_get(url, cache, delay=DELAY, **kw)


def tiles(page: str) -> list[dict]:
    """[{alt, section, media id}] for every dish tile (<img alt=name> from the chain's own media folder) on the menu page, in page order, each with
    the heading of the section it sits in."""
    out, section = [], ""
    for m in _TOKEN.finditer(page):
        if m.group(1) is not None:
            section = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", m.group(1))).split())
            continue
        tag = m.group(0)
        mid = re.search(r"static\.wixstatic\.com/media/(3da10b_[0-9a-f]{32}(?:~|%7E)mv2\.\w+)", tag)
        alt = re.search(r'\balt="([^"]*)"', tag)
        if mid and alt and alt.group(1).strip() and section:
            out.append({"alt": " ".join(htmllib.unescape(alt.group(1)).split()), "section": section, "id": mid.group(1).replace("%7E", "~")})
    return out


def keys(t: dict) -> list[str]:
    """The names this tile gives on the page: its own name, and (rule 2) its name completed with a product-type section heading."""
    out = [ic.norm_name(t["alt"])]
    if ic.norm_name(t["section"]) in PRODUCT_TYPE_SECTIONS:
        out.append(ic.norm_name(f"{t['alt']} {t['section']}"))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="cache dir (each page and photo is fetched at most once)")
    ap.add_argument("--dry-run", action="store_true", help="list the matches; fetch only the menu page (never a photo)")
    ap.add_argument("--retrieved-on", default=None)
    args = ap.parse_args()

    items = ic.load_items(CHAIN_ID)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    try:
        page = get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing was written. We never work round a block.")
        raise SystemExit(2)
    ts = tiles(page)
    if not ts:
        raise SystemExit("menu page: no dish tiles found: the layout changed")
    count: dict[str, int] = {}
    for t in ts:
        for k in set(keys(t)):
            count[k] = count.get(k, 0) + 1

    wanted: dict[str, tuple[str, str]] = {}          # item_id -> (original media URL, page URL)
    notes: list[str] = []
    for t in ts:
        label = f"{t['section']} / {t['alt']}"
        hit = [(k, by_name[k]) for k in keys(t) if k in by_name]
        if not hit:
            notes.append(f"{label}: no published item with this name -> none")
            continue
        k, its = hit[0]
        if count[k] > 1:
            notes.append(f"{label}: the name appears on {count[k]} tiles -> none")
        elif len(its) != 1:
            notes.append(f"{label}: several published items share this name -> none")
        elif its[0]["id"] in EXCLUDE:
            notes.append(f"{label}: {its[0]['name']} excluded ({EXCLUDE[its[0]['id']]})")
        elif its[0]["id"] in wanted:
            notes.append(f"{label}: {its[0]['name']} already matched to another tile -> none")
            wanted.pop(its[0]["id"])
        else:
            wanted[its[0]["id"]] = (MEDIA + t["id"], MENU_URL)

    by_id = {i["id"]: i for i in items}
    order = [i["id"] for i in items]
    print(f"{len(items)} published items; {len(ts)} dish tiles on the menu page; {len(wanted)} items matched to a photo")
    for item_id in sorted(wanted, key=order.index):
        print(f"  {by_id[item_id]['category']:<12} {by_id[item_id]['name']:<30} {wanted[item_id][0].rsplit('/', 1)[-1]}")
    print("Tiles not matched:")
    for n in notes:
        print("  -", n)
    print(f"  ({len(items) - len(wanted)} published items without a photo in total)")
    if args.dry_run:
        return

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
    if rows:
        ic.write_images_csv(CHAIN_ID, rows, args.retrieved_on)
    else:
        print("no photo kept: images.csv not written")
    print(f"{len(rows)} of {len(items)} published items now have a photo; {len(set(f for f, _ in rows.values()))} files")
    for fname, ids in ic.suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")


if __name__ == "__main__":
    main()
