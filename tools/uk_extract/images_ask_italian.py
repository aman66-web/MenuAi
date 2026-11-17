#!/usr/bin/env python3
"""ASK Italian item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4) from ASK's own menu pages.

    python3 tools/uk_extract/images_ask_italian.py --cache /tmp/ask-italian-photos [--dry-run]

Source pages (all on www.askitalian.co.uk; each renders its menu with a photo per dish, plus a schema.org Menu in JSON-LD where every
MenuItem carries its `name`, `image` and `nutrition.calories`):
  - the full menu: https://www.askitalian.co.uk/menus and the /menus/<section> pages it links to (each is the full menu again; an item's
    row names the page of its own section);
  - the Kids set menu: https://www.askitalian.co.uk/menus/kids-set-menu;
  - the Grande set menu: the central /menus/grande-set-menu redirects (308) to the full menu, so it is read from each restaurant's own
    tab, the /italian-restaurants/<region>/<town>/menus/grande-set-menu pages listed in https://www.askitalian.co.uk/sitemap.xml
    (52 restaurants on 2026-11-17; the same pages ask_italian_html.py extracted the set-menu dishes from). Two versions of the set
    menu are live (50 restaurants and 2), with different calories and photos for some names, so a set-menu dish is matched by name AND
    calories (below);
  - the Christmas set menu (https://www.askitalian.co.uk/menus/christmas-set-menu, new in November): none of our dishes comes from it,
    it is only a fallback for a dish with the same name and the same calories (see 3).
The photos are served from images.weareopenr.com/azzurri/..., the image host ASK's own pages load them from (the site's /_next/image
proxy is disallowed by robots.txt, so we fetch the original the proxy points at).

Match rule (published items = data/source/ask-italian/items.csv minus holdback.csv; page names are cleaned of the "NEW" promo marker
with azzurri_html.clean_name, exactly as the extraction did, then compared with norm_name()):
  1. An item's own menu is the one its category names: "Grande Set Menu - ..." -> the Grande set menu, "Kids Set Menu - ..." -> the
     Kids set menu, anything else -> the full menu. A dish whose set-menu calories differ from the full menu was published as
     "Dish (Grande Set Menu)"; that suffix is ours, so it is removed before comparing with the set menu's own record "Dish".
  2. Full menu and Kids menu: a record on the item's own menu whose name equals the item's name. Grande set menu: a record whose name
     equals AND whose printed calories equal the item's (the same record the item was extracted from; the 50- and 2-restaurant versions
     differ). Nothing fuzzy: "Calamari" is not "Large Calamari", "Kids Happy Face Pizza" is not "Happy Face Pizza", and a misspelt name
     ("Sicillian Lemon Tart") matches only the page that spells it so.
  3. If the item's own menu shows no photo for it, a record on another ASK menu with the same name AND the same calories (which the
     extraction would have merged into this very item) may give the photo.
  4. If the matching records carry two different photo addresses, both are downloaded: identical bytes count as one photo, different
     photos give no photo.
  5. An item already in images.csv whose name no ASK menu shows any more keeps the photo it was given (e.g. "Crodino", shown on the
     mocktails page on 2026-10-11 and since renamed "Crodino Spritz"); images.csv then carries this run's date for it too.
  6. With --cached-photos-only nothing is requested from the image host: a photo not already in --cache is not fetched, the item keeps
     the photo an earlier run gave it (if any) and a new match waits for a later run. For use after the host refused a request.

robots.txt is honoured and any 401/403/429 stops the run (images_common.polite_get raises Blocked). Read 2026-11-17:
www.askitalian.co.uk/robots.txt is `User-Agent: *  Allow: /  Disallow: /api/ /studio/ /bookings/share/ /_next/` (menus, restaurant pages
and the sitemap are allowed); images.weareopenr.com/robots.txt answers HTTP 400 "Invalid path format" (RFC 9309: a 4xx means no rules).
Terms (https://www.askitalian.co.uk/legal/terms-and-conditions, read 2026-11-17, unchanged since 2026-10-11): "This website contains
material which is owned by or licensed to us. This material includes, but is not limited to, the design, layout, look, appearance and
graphics. Reproduction is prohibited other than in accordance with the copyright notice, which forms part of these terms and conditions."
Installed on the founder's decisions of 2026-10-06 (his accepted risk). Left out after looking: see REJECT.

STATUS 2026-11-17: the pages above were all read (robots allowed, 71 pages); images.weareopenr.com then answered HTTP 403 to one photo
(the Kids Happy Face Pizza photo azzurri/53e5a9ac-...) after about 70 others had downloaded normally. polite_get treats 403 as a block,
so nothing more was asked of that host: the run was finished with --cached-photos-only (every photo already fetched, every earlier photo
kept). 15 dishes matched by this script still wait for their photo (the Grande set menu's Linguine con Frutti di Mare, Pesto
Stracciatella, Pesto Stracciatella Tagliatelle, Pollo Milanese with Potatoes, Pollo Millanese, Sicillian Lemon Tart, Slow-Cooked Beef
Pappardelle, Tiramisu, Vegan Bruschetta Pizzetta, Vegan Margherita, Vegan Primavera, Vegan Sticky Coffee Pudding, and the full menu's
Vegan Bruschetta Pizzetta, Vegan Margherita, Vegan Primavera): a later plain run fetches them if the host answers normally again.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import sys
import tempfile
import urllib.error
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from azzurri_html import clean_name  # noqa: E402  (the extraction's own promo-marker rule)
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "ask-italian"
BASE = "https://www.askitalian.co.uk"
HUB = f"{BASE}/menus"
SITEMAP = f"{BASE}/sitemap.xml"
IMAGE_HOST = "https://images.weareopenr.com/azzurri/"
FULL = "menu"
GRANDE = "grande-set-menu"
KIDS = "kids-set-menu"
# category prefix -> (menu kind, the menu title the extraction appends to a dish whose calories differ from the full menu)
SET_MENUS = {"Grande Set Menu - ": (GRANDE, "Grande Set Menu"), "Kids Set Menu - ": (KIDS, "Kids Set Menu")}
NEEDS_CALORIES = {GRANDE}   # menus with versions that differ by restaurant: match on name and calories

# Photos looked at on a contact sheet and left out (item id -> why). A rerun must not bring them back.
_PLACEHOLDER = ("the page's picture is ASK's placeholder, not a photo of the item (2026-10-11: a 'heart hands' line drawing on 9 drinks; "
                "2026-11-17: the same drawing on Coke Zero and one plain dark-green shape shared by Apple, Orange and Pineapple Juice, "
                "Ginger Beer, Latte and Babyccino)")
_MACCHIATO = ("2026-10-11: the 'heart hands' placeholder; 2026-11-17: a coffee-table scene whose main cup is a large foamed-milk coffee "
              "(a 2 kcal macchiato cannot be that) beside an espresso at the edge and a printed ASK napkin: it does not show the macchiato")
_SUNDAE = ("one photo (vanilla ice cream, sauce) is shown for all four 'Build Your Own Sundae' flavours (still byte-identical under four "
           "addresses on 2026-11-17): it cannot show the berry sorbet, chocolate or salted caramel version")
_CHILLY = ("one photo of a Chilly Billy pouch (a third-party brand's pack, its label naming raspberry and apple) is shown for two "
           "different flavours (apple and raspberry / orange and apple)")
_PACK = ("the photo is a third-party brand's can or bottle on its own (its maker's label and logo), not ASK's food or a served drink "
         "(left out on 2026-11-17 under the playbook rule 'a third-party brand's pack instead of the food')")
REJECT: dict[str, str] = {
    **{i: _PACK for i in ("appletiser", "belu-sparkling-water-330ml", "belu-sparkling-water-750ml", "belu-still-water-330ml",
                          "belu-still-water-750ml", "coca-cola-330ml", "diet-coke", "ginger-and-yuzu-kombucha",
                          "raspberry-and-pomegranate-prebiotic-soda", "san-pellegrino-aranciata-rosso", "san-pellegrino-limonata",
                          "sprite-zero")},
    **{i: _PLACEHOLDER for i in ("apple-juice", "babyccino", "ginger-beer", "latte-large", "orange-juice", "pineapple-juice", "coke-zero")},
    **{i: _MACCHIATO for i in ("macchiato", "macchiato-large")},
    **{i: _SUNDAE for i in ("build-your-own-sundae-berry-sorbet", "build-your-own-sundae-chocolate-ice-cream",
                            "build-your-own-sundae-salted-caramel-gelato", "build-your-own-sundae-vanilla-ice-cream")},
    # 2026-11-17 checker: the photo's main subject is Crodino's own labelled bottle (third-party brand pack and logo); the item's name is no longer on any ASK menu either
    "crodino": "the photo's main subject is a labelled Crodino bottle (a third-party brand's pack and logo) beside the served glass",
    **{i: _CHILLY for i in ("chilly-billy-pure-fruit-apple-and-raspberry", "chilly-billy-pure-fruit-orange-and-apple")},
}


@dataclass(frozen=True)
class Rec:
    kind: str           # menu kind: FULL, GRANDE, KIDS or another /menus/<x>-set-menu slug
    url: str            # the page that shows it
    section: str
    key: str            # norm_name of the page's name, promo marker removed
    kcal: int | None    # calories the record prints (JSON-LD nutrition)
    img: str | None


def page_html(url: str, cache: Path) -> str:
    return polite_get(url, cache, accept="text/html,application/xhtml+xml").decode("utf-8", "replace")


def ld_records(doc: str, kind: str, url: str) -> list[Rec]:
    """Every schema.org MenuItem in the page's JSON-LD: (top-level section, name, calories, image)."""
    out: list[Rec] = []

    def walk(o, section: str | None) -> None:
        if isinstance(o, dict):
            if o.get("@type") == "MenuSection" and section is None:
                section = o.get("name") or ""
            if o.get("@type") == "MenuItem" and o.get("name"):
                img = o.get("image")
                if isinstance(img, list):
                    img = img[0] if len(img) == 1 else None
                if isinstance(img, dict):
                    img = img.get("url")
                cal = (o.get("nutrition") or {}).get("calories") if isinstance(o.get("nutrition"), dict) else None
                m = re.fullmatch(r"\s*(\d+)\s*(?:k?cal(?:ories)?)?\s*", str(cal)) if cal is not None else None
                name = clean_name(html.unescape(o["name"]))
                out.append(Rec(kind, url, section or "", norm_name(name), int(m.group(1)) if m else None,
                               img if isinstance(img, str) and img else None))
            for v in o.values():
                walk(v, section)
        elif isinstance(o, list):
            for v in o:
                walk(v, section)

    for block in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', doc, flags=re.S):
        try:
            walk(json.loads(block), None)
        except json.JSONDecodeError:
            continue
    return out


def section_slug(section: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", section.lower().replace("&", " ")).strip("-")


def read_menus(cache: Path) -> tuple[list[Rec], list[str]]:
    """All records from the full menu (hub + section pages), each central set-menu page, and, where the central set-menu page
    redirects, that set menu's per-restaurant pages from the sitemap. Returns (records, pages read)."""
    hub = page_html(HUB, cache)
    slugs: list[str] = []
    for slug in re.findall(r'href="/menus/([a-z0-9-]+)"', hub):
        if slug not in slugs:
            slugs.append(slug)
    recs = ld_records(hub, FULL, HUB)
    pages = [HUB]
    venue_pages: list[str] | None = None
    for slug in slugs:
        kind = slug if slug.endswith("-set-menu") else FULL
        url = f"{HUB}/{slug}"
        try:
            doc = page_html(url, cache)
        except urllib.error.HTTPError as e:
            if e.code not in (301, 302, 307, 308):
                raise
            if kind == FULL:
                print(f"  {url} redirects ({e.code}) to {e.headers.get('Location')}: not followed")
                continue
            # the central set-menu page sends people to the full menu: read every restaurant's own tab instead
            if venue_pages is None:
                sm = polite_get(SITEMAP, cache, accept="application/xml,text/xml").decode("utf-8", "replace")
                venue_pages = re.findall(r"<loc>\s*(\S+?)\s*</loc>", sm)
            tabs = sorted(u for u in venue_pages if re.fullmatch(re.escape(BASE) + r"/italian-restaurants/[a-z0-9/-]+/menus/" + slug, u))
            print(f"  {url} redirects ({e.code}) to {e.headers.get('Location')}: reading the {len(tabs)} restaurant pages of {slug} instead")
            for t in tabs:
                recs += ld_records(page_html(t, cache), kind, t)
                pages.append(t)
            continue
        recs += ld_records(doc, kind, url)
        pages.append(url)
    return recs, pages


def own_menu(item: dict) -> tuple[str, str]:
    """(menu kind, the name to compare) for a published item (our '(Grande Set Menu)' suffix removed)."""
    for prefix, (kind, title) in SET_MENUS.items():
        if item["category"].startswith(prefix):
            suffix = f" ({title})"
            name = item["name"][: -len(suffix)] if item["name"].endswith(suffix) else item["name"]
            return kind, name
    return FULL, item["name"]


def kcal_of(item: dict) -> int | None:
    try:
        return int(float(item["calories"]))
    except (TypeError, ValueError):
        return None


def source_page(recs: list[Rec], img: str) -> str:
    """The page that shows this photo for the dish: the page of the dish's own section when there is one, else the first."""
    with_img = [r for r in recs if r.img == img]
    return next((r.url for r in with_img if r.url.endswith("/" + section_slug(r.section))), sorted(r.url for r in with_img)[0])


def current_rows() -> dict[str, tuple[str, str]]:
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(f)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "menu-images-cache" / CHAIN_ID)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photos, write nothing")
    ap.add_argument("--cached-photos-only", action="store_true",
                    help="take photos only from --cache and request nothing from the image host (after it refused a request)")
    args = ap.parse_args()
    cache: Path = args.cache

    try:
        recs, pages = read_menus(cache)
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 2
    for r in recs:
        if r.img and not r.img.startswith(IMAGE_HOST):
            print(f"  ! {r.key!r} on {r.url}: photo on an unexpected host {r.img}, not used")
    recs = [r if not r.img or r.img.startswith(IMAGE_HOST) else Rec(r.kind, r.url, r.section, r.key, r.kcal, None) for r in recs]
    by_key: dict[str, list[Rec]] = {}
    for r in recs:
        by_key.setdefault(r.key, []).append(r)

    items = load_items(CHAIN_ID)
    before = current_rows()
    rows: dict[str, tuple[str, str]] = {}
    skipped: list[str] = []
    notes: list[str] = []
    sha_of: dict[str, str] = {}
    stored_now: set[str] = set()

    def in_cache(url: str) -> bool:
        return (cache / hashlib.sha1(url.encode()).hexdigest()).exists()   # images_common.polite_get's cache naming

    def photo(img: str, referer: str) -> bytes | None:
        """The photo's bytes, or None when --cached-photos-only and it is not in the cache (nothing is requested)."""
        if args.cached_photos_only and not in_cache(img):
            return None
        return polite_get(img, cache, referer=referer)

    def keep_earlier(it: dict, why: str) -> bool:
        if it["id"] in before and (IMAGES_ROOT / CHAIN_ID / before[it["id"]][0]).exists():
            rows[it["id"]] = before[it["id"]]
            notes.append(f"{it['name']}: {why}; kept the photo an earlier run gave it")
            return True
        skipped.append(f"{it['name']}: {why}")
        return False

    try:
        for it in sorted(items, key=lambda i: i["id"]):
            kind, name = own_menu(it)
            key, kcal = norm_name(name), kcal_of(it)
            named = by_key.get(key, [])
            home = [r for r in named if r.kind == kind and (kind not in NEEDS_CALORIES or r.kcal == kcal)]
            chosen = [r for r in home if r.img]
            how = "own menu"
            if not chosen:
                chosen = [r for r in named if r.kind != kind and r.img and kcal is not None and r.kcal == kcal]
                how = "same name and calories on another ASK menu"
            if it["id"] in REJECT:
                if chosen:
                    skipped.append(f"{it['name']}: left out after looking: {REJECT[it['id']]}")
                continue
            if not chosen:
                if not named and it["id"] in before:
                    keep_earlier(it, f"no ASK menu shows this name now (earlier source {before[it['id']][1]})")
                continue
            imgs = sorted({r.img for r in chosen})
            if len(imgs) > 1:
                if args.dry_run:
                    notes.append(f"{it['name']}: {len(imgs)} photo addresses ({how}); compared byte for byte on a real run")
                    rows[it["id"]] = ("(dry run)", source_page(chosen, imgs[0]))
                    continue
                raws = {i: photo(i, source_page(chosen, i)) for i in imgs}
                if any(v is None for v in raws.values()):
                    keep_earlier(it, f"{len(imgs)} photo addresses not all in the cache, so not compared (--cached-photos-only)")
                    continue
                shas = {hashlib.sha256(v).hexdigest() for v in raws.values()}
                if len(shas) > 1:
                    skipped.append(f"{it['name']}: the site shows {len(shas)} different photos for this dish ({how})")
                    continue
                notes.append(f"{it['name']}: {len(imgs)} photo addresses, identical bytes")
            # the photo most pages show (e.g. the 50-restaurant version of the set menu), ties by address
            img = max(imgs, key=lambda i: (sum(1 for r in chosen if r.img == i), i))
            source = source_page(chosen, img)
            if how != "own menu":
                notes.append(f"{it['name']}: {how} ({source})")
            if args.dry_run:
                rows[it["id"]] = ("(dry run)", source)
                continue
            raw = photo(img, source)
            if raw is None:
                keep_earlier(it, "photo not in the cache, not fetched (--cached-photos-only)")
                continue
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{it['name']}: {e}")
                continue
            stored_now.add(fname)
            rows[it["id"]] = (fname, source)
    except Blocked as e:
        # nothing is written; photo files this run added and no earlier row uses are removed again
        earlier = {f for f, _ in before.values()}
        for fname in stored_now - earlier:
            (IMAGES_ROOT / CHAIN_ID / fname).unlink(missing_ok=True)
        print(f"BLOCKED: {e}. Stopping; nothing written (rerun later, or with --cached-photos-only to use what the cache holds).")
        return 2

    print(f"{len(pages)} menu pages, {len(by_key)} dish names on them, {len(items)} published items")
    print(f"items with a photo: {len(rows)} (images.csv had {len(before)})")
    for n in notes:
        print("  note:", n)
    for s in skipped:
        print("  skipped:", s)
    lost = sorted(set(before) - set(rows))
    if lost:
        print("  no longer given a photo:", ", ".join(lost))
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
