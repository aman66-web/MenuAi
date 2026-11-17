#!/usr/bin/env python3
"""Zizzi item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4) from Zizzi's own menu pages.

    python3 tools/uk_extract/images_zizzi.py --cache /tmp/zizzi-photos [--dry-run]

Source: Zizzi's own menu pages, the same pages and the same per-dish records the menu data was read from (zizzi_html.py, through
azzurri_html.py). Every menu page carries its dishes in its own script data (self.__next_f chunks, `menuSections`): each dish record has
its `name`, `code`, `kcal` and `image` (the photo the page draws next to the dish). The pages read:
  - https://www.zizzi.co.uk/menus (the full menu) and the /menus/<section> pages it links to (the same full menu opened at a section:
    /menus/starters, /menus/pasta ...; used as the photo's source page when they show the same photo);
  - each other menu tab the page itself lists in its tab bar (`menuTabs`): /menus/set-menu ("3 Course Menu"), /menus/2-course-lunch-menu,
    /menus/set-menu-bambini ("Bambini Menu"), /menus/festive-set-menu;
  - the "Two Feast for £50" tab, which only some restaurants have: every /italian-restaurants/.../menus/two-feast-for-50 page that Zizzi's
    own sitemap.xml lists (the central /menus/two-feast-for-50 redirects and is not followed).
The photos are served from images.weareopenr.com/azzurri/..., the image host the site's own pages load them from (the site's /_next/image
proxy is disallowed by robots.txt, so we fetch the original the proxy points at).

Match rule (exact; nothing fuzzy). Each published item (data/source/zizzi/items.csv minus holdback.csv) belongs to one menu kind: the kind
its category comes from (zizzi_html.CATEGORIES, e.g. "Pasta" = the full menu, "2 Course Lunch Menu - Mains", "Two Feast for £50 - Starters").
The menu data names a dish "Dish (Menu title)" when the same dish prints different calories on an earlier menu; that suffix is ours, so it is
taken off before matching. A photo is attached only when:
  1. a dish record on that menu kind's own page(s) has a name equal to the item's name under norm_name() (after the same "NEW"/emoji
     cleaning the menu data applies, azzurri_html.clean_name), and those records carry exactly one photo between them; or, only for an
     item without our menu suffix whose own menu's record carries no photo, a record of the same name on another menu kind that prints the
     same calories (the menu data treats a dish with the same name and calories on two menus as one item, so that record is this item's);
  2. every record used carries the same photo (a name with two different photos on its own menu gets none; on the restaurant-only Two
     Feast tab, every restaurant's page must show the same photo);
  3. the item is not in REJECT below (looked at by eye and left out), and no other published item has the same name and menu kind.
Why per menu: Zizzi photographs some dishes twice (the full-menu photo and a different set-menu/lunch photo of the same dish). Up to
2026-10-11 any name with two photos anywhere was skipped; since 2026-11-17 the photo is the one the item's own menu shows for it.

robots.txt is honoured and any 401/403/429 stops the run (images_common.polite_get raises Blocked).
robots.txt (read 2026-11-17): www.zizzi.co.uk says "User-Agent: * / Allow: / / Disallow: /api/ /studio/ /bookings/share/ /_next/" (menu pages,
restaurant pages and sitemap.xml allowed); images.weareopenr.com/robots.txt answers HTTP 400 "Invalid path format. Expected: /{tenant}/{image-path}"
(RFC 9309: a 4xx means no rules) and serves the photos.
Terms (https://www.zizzi.co.uk/legal/terms-and-conditions, read 2026-10-11 and again 2026-11-17, unchanged): "This website contains material which
is owned by or licensed to us. This material includes, but is not limited to, the design, layout, look, appearance and graphics. Reproduction is
prohibited other than in accordance with the copyright notice, which forms part of these terms and conditions." Installed on the founder's
decision of 2026-10-06 (photos installed even where terms restrict reuse: the founder's accepted risk).

A refusal of a photo (401/403/429) stops all further requests to the image host for the rest of the run; the run still finishes with the
photos already downloaded (in --cache) and keeps, unchanged, the images.csv row of any matched item whose photo it can no longer fetch.
--cached-only starts in that state (no photo request at all).
STATUS 2026-11-17: the per-menu rule matches 175 of 237 items (was 134). Mid-run, images.weareopenr.com answered HTTP 403 for
https://images.weareopenr.com/azzurri/791a4aea-bcb6-4931-9142-7e851bb15fc9 (the full menu's photo of Chicken Spiedini with Calabrese Dip; that item
keeps its 2026-10-11 photo). Nothing further was requested from the host; the run was finished with --cached-only, so 7 of the 41 new matches
(the photos already downloaded) were added and the other 34 wait for a rerun if the founder decides the host may be asked again. The contact
sheet of all kept photos led to 3 more being left out (two Flawsome! cartons, a Chilly Billy lolly wrapper): 138 items have a photo.
write_images_csv stamps every row with the run's date: of the 138, 24 photos were downloaded on 2026-11-17 (7 new, 17 re-fetched byte-identical
to 2026-10-11's) and 114 are 2026-10-11 downloads kept as they were, their dish match re-confirmed against the live pages on 2026-11-17.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sys
import tempfile
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import azzurri_html as A  # noqa: E402  (page reader shared with the menu extraction: same records)
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)
from zizzi_html import CATEGORIES, VARIANTS  # noqa: E402

CHAIN_ID = "zizzi"
BASE = "https://www.zizzi.co.uk"
HUB = f"{BASE}/menus"
SITEMAP = f"{BASE}/sitemap.xml"
VENUE_ONLY_TAB = "two-feast-for-50"   # a tab only some restaurants list; read from every restaurant page the sitemap gives for it
IMAGE_HOST = "https://images.weareopenr.com/"
# Photos looked at on a contact sheet and left out (item id -> why). A rerun must not bring them back.
_ILLUSTRATION = ("the site's picture is a drawn illustration (flat vector artwork on a plain background: the chain's drink artwork, the "
                 "Pegasus mascot, the Pinocchio puppet), not a photograph of the item")
_STAFF = "the site's picture is a group photo of the restaurant's staff, not food"
REJECT: dict[str, str] = {
    # 2026-10-11 contact sheet; still drawn artwork / staff photos when looked at again on 2026-11-17
    **{i: _ILLUSTRATION for i in (
        "americano", "apple-juice", "appletiser", "belu-sparkling-water-large", "belu-sparkling-water-small",
        "belu-still-water-large", "belu-water-still-small", "blood-orange-and-elderflower-tonic", "cappuccino", "coke-large",
        "coke-small", "coke-zero-large", "coke-zero-small", "diet-coke-large", "diet-coke-small", "double-espresso", "earl-grey",
        "english-breakfast", "flat-white", "fresh-mint-tea", "hip-pop-berries-and-cherries",
        "hip-pop-kombucha-blueberry-and-ginger", "hip-pop-strawberry-and-pineapple", "hot-chocolate", "hot-cioccolata",
        "ice-americano", "iced-latte", "latte", "lime-and-mint-cooler", "macchiato", "mini-non-gluten-vegan-margherita", "mocha",
        "morello-cherry-refresher", "oat-americano", "oat-cappuccino", "oat-flat-white", "oat-latte", "oat-macchiato",
        "oat-mocha", "orange-juice", "original-tonic", "passion-fruit-sparkler", "peppermint", "peroni-0-0",
        "pineapple-and-citrus-refresher", "pure-green", "raspberry-and-mint-cooler", "san-pellegrino-blood-orange",
        "san-pellegrino-lemon", "single-espresso", "sprite-zero-large", "sprite-zero-small", "strawberry-sparkler",
        "trip-cbd-blend", "trip-mindful-blend", "zesty-still-lemonade"
    )},
    "kids-non-gluten-pomodoro-pasta": _STAFF,
    "kids-non-gluten-vegan-lentil-ragu": _STAFF,
    # 2026-11-17 contact sheet
    **{i: ("the site's picture is another brand's pack (a Flawsome! juice carton printing 'No added sugar' and vitamin claims), "
           "not Zizzi's food") for i in ("flawsome-apple-and-blackcurrant", "flawsome-sweet-apple")},
    "chilly-billy-ice-lolly": "the site's picture is another brand's wrapped product (a 'Chilly Billy by Bensons' lolly wrapper), not the food",
}


class Rec:
    """One dish record on one menu page: what the page's own script data says."""
    __slots__ = ("url", "section", "name", "image", "kcal", "code")

    def __init__(self, url: str, section: str, name: str, image: str | None, kcal, code):
        self.url, self.section, self.name, self.image, self.kcal, self.code = url, section, name, image, kcal, code


def page_html(url: str, cache: Path) -> str:
    return polite_get(url, cache, accept="text/html,application/xhtml+xml").decode("utf-8", "replace")


def page_records(url: str, cache: Path) -> tuple[list[Rec], list[dict]] | None:
    """(dish records, menu tabs) from the page's own script data (`menuSections`), or None when the page has none / redirects."""
    try:
        doc = page_html(url, cache)
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 307, 308):  # e.g. /menus/two-feast-for-50 -> /menus: not followed
            print(f"  {url} redirects ({e.code}) to {e.headers.get('Location')}: not followed")
            return None
        raise
    if "__next_f" not in doc:
        raise Blocked(f"{url}: not a menu page (no page data): a challenge page? stopped")
    props = A._rows(doc, "menuSections")
    if props is None:
        print(f"  {url}: no menu data on the page")
        return None
    out: list[Rec] = []

    def walk(sec: dict, top: str) -> None:
        for it in sec.get("items", []):
            img = it.get("image")
            out.append(Rec(url, top, A.clean_name(A.norm_ws(it.get("name", ""))), img if isinstance(img, str) and img else None,
                           it.get("kcal"), it.get("code")))
        for ch in sec.get("children", []):
            walk(ch, top)

    for s in props["menuSections"]:
        walk(s, A.norm_ws(s.get("title", "")))
    return out, props.get("menuTabs", []) or []


def in_cache(url: str, cache: Path) -> bool:
    """True when polite_get already holds this URL's bytes in `cache` (it keys the file by the SHA-1 of the URL): no request needed."""
    return (cache / hashlib.sha1(url.encode()).hexdigest()).exists()


def existing_rows() -> dict[str, tuple[str, str]]:
    """The rows images.csv has now, whose photo file is on disk: kept unchanged for a matched item whose photo can't be fetched after a block."""
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(f)
                if (IMAGES_ROOT / CHAIN_ID / r["file"]).exists()}


def section_slug(section: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", section.lower().replace("&", " ")).strip("-")


def kind_of_category() -> dict[str, str]:
    """category -> menu kind, from the menu extraction's own settings (each category belongs to exactly one menu kind)."""
    kinds: dict[str, set[str]] = {}
    for (v, _path), cat in CATEGORIES.items():
        kinds.setdefault(cat, set()).add(v)
    bad = {c: k for c, k in kinds.items() if len(k) > 1}
    if bad:
        raise SystemExit(f"categories used by more than one menu kind: {bad}")
    return {c: next(iter(k)) for c, k in kinds.items()}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "menu-images-cache" / CHAIN_ID)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photos, write nothing")
    ap.add_argument("--cached-only", action="store_true",
                    help="request no photo from the image host (e.g. after it refused us): use photos already in --cache, else keep images.csv's row")
    args = ap.parse_args()
    cache: Path = args.cache

    # menu kind -> norm name -> [records]
    recs: dict[str, dict[str, list[Rec]]] = {v: {} for v in VARIANTS}
    section_pages: dict[str, dict[str, list[Rec]]] = {}   # /menus/<section> url -> norm name -> records (same full menu)
    pages_read = 0
    try:
        hub = page_records(HUB, cache)
        if hub is None:
            raise SystemExit(f"{HUB} has no menu data: re-check the site")
        hub_recs, tabs = hub
        pages_read += 1
        for r in hub_recs:
            recs["menu"].setdefault(norm_name(r.name), []).append(r)
        for t in tabs:
            full = t.get("fullPath", "")
            if full == "menus":
                continue
            kind = full[len("menus/"):]
            if kind not in VARIANTS:
                print(f"  ! the page lists a menu tab {full!r} ({t.get('title')!r}) the menu data does not know: not read")
                continue
            got = page_records(f"{BASE}/{full}", cache)
            pages_read += 1
            if got:
                for r in got[0]:
                    recs[kind].setdefault(norm_name(r.name), []).append(r)
        # the full menu opened at a section: only to name the section page as the photo's source
        hub_doc = page_html(HUB, cache)
        tab_paths = {t.get("fullPath", "") for t in tabs}
        for slug in dict.fromkeys(re.findall(r'href="/menus/([a-z0-9-]+)"', hub_doc)):
            if f"menus/{slug}" in tab_paths:
                continue
            got = page_records(f"{HUB}/{slug}", cache)
            pages_read += 1
            if got:
                d: dict[str, list[Rec]] = {}
                for r in got[0]:
                    d.setdefault(norm_name(r.name), []).append(r)
                section_pages[f"{HUB}/{slug}"] = d
        # restaurant-only tab: every restaurant page for it in the sitemap
        sm = polite_get(SITEMAP, cache, accept="application/xml,text/xml,*/*").decode("utf-8", "replace")
        venue_tab = sorted({u for u in re.findall(r"<loc>([^<]+)</loc>", sm)
                            if re.fullmatch(rf"/italian-restaurants/.+/menus/{VENUE_ONLY_TAB}", urllib.parse.urlsplit(u).path)})
        for u in venue_tab:
            got = page_records(u, cache)
            pages_read += 1
            if got:
                for r in got[0]:
                    recs[VENUE_ONLY_TAB].setdefault(norm_name(r.name), []).append(r)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 2

    kinds = kind_of_category()
    items = load_items(CHAIN_ID)
    seen: dict[tuple[str, str], list[str]] = {}
    plan: list[tuple[dict, str, str, str]] = []   # (item, kind, key, suffixed?)
    for it in items:
        kind = kinds.get(it["category"])
        if kind is None:
            raise SystemExit(f"{it['id']}: category {it['category']!r} is not in zizzi_html.CATEGORIES")
        name, suffix = it["name"], f" ({VARIANTS[kind]})"
        suffixed = name.endswith(suffix) and kind != "menu"
        base = name[: -len(suffix)] if suffixed else name
        key = norm_name(base)
        seen.setdefault((kind, key), []).append(it["id"])
        plan.append((it, kind, key, suffixed))

    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    no_record: list[str] = []
    existing = existing_rows()
    # set when the image host refuses us (or --cached-only): from then on, cached bytes or the existing row only, no request to the host
    stopped: str | None = "--cached-only: no photo requested from the image host" if args.cached_only else None
    kept_unfetched: list[str] = []
    not_fetched: list[str] = []
    for it, kind, key, suffixed in plan:
        if len(seen[(kind, key)]) > 1:
            skipped.append(f"{it['name']}: name shared by {len(seen[(kind, key)])} published items on one menu")
            continue
        own = recs[kind].get(key, [])
        used = [r for r in own if r.image]
        how = "own menu"
        if not used and not suffixed:
            kcal = int(it["calories"]) if it["calories"] else None
            used = [r for v, d in recs.items() if v != kind for r in d.get(key, []) if r.image and r.kcal == kcal and kcal is not None]
            how = "same name and calories on another menu"
        if not used:
            if not own:
                no_record.append(it["name"])
            continue
        if it["id"] in REJECT:
            skipped.append(f"{it['name']}: left out after looking: {REJECT[it['id']]}")
            continue
        imgs = {r.image for r in used}
        if len(imgs) > 1:
            skipped.append(f"{it['name']}: its records ({how}) show {len(imgs)} different photos")
            continue
        img = next(iter(imgs))
        if not img.startswith(IMAGE_HOST):
            skipped.append(f"{it['name']}: photo on an unexpected host {img}")
            continue
        first = used[0]
        source = first.url
        if first.url == HUB:
            sec_url = f"{HUB}/{section_slug(first.section)}"
            if any(r.image == img for r in section_pages.get(sec_url, {}).get(key, [])):
                source = sec_url
        if args.dry_run:
            rows[it["id"]] = ("(dry run)", source)
            if how != "own menu":
                print(f"  {it['id']}: matched by {how} ({source})")
            continue
        if stopped and not in_cache(img, cache):
            # the image host refused us earlier in this run: no further request is made to it
            if it["id"] in existing:
                rows[it["id"]] = existing[it["id"]]
                kept_unfetched.append(it["id"])
            else:
                not_fetched.append(it["name"])
            continue
        try:
            raw = polite_get(img, cache, referer=source)
            fname = store_image(CHAIN_ID, raw)
        except Blocked as e:
            stopped = str(e)
            print(f"BLOCKED: {e}. No further request goes to {IMAGE_HOST} in this run.")
            if it["id"] in existing:
                rows[it["id"]] = existing[it["id"]]
                kept_unfetched.append(it["id"])
            else:
                not_fetched.append(it["name"])
            continue
        except ValueError as e:
            skipped.append(f"{it['name']}: {e}")
            continue
        rows[it["id"]] = (fname, source)

    print(f"{pages_read} menu pages read ({len(venue_tab)} restaurant {VENUE_ONLY_TAB} pages), {len(items)} published items")
    print(f"items with a photo: {len(rows)}")
    for s in skipped:
        print("  skipped:", s)
    for n in no_record:
        print("  no record of this name on its menu now:", n)
    if stopped:
        print(f"STOPPED AT A BLOCK ({stopped}): {len(kept_unfetched)} items keep the photo images.csv already had (not re-fetched), "
              f"{len(not_fetched)} new matches were not fetched: {', '.join(not_fetched)}")
    if args.dry_run:
        for item_id, (_, src) in sorted(rows.items()):
            print(f"  {item_id} <- {src}")
        return 0
    path = write_images_csv(CHAIN_ID, rows)
    print(f"wrote {path}")
    for fname, ids in suspected_placeholders(rows).items():
        print(f"  CHECK BY EYE: {fname} used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
