#!/usr/bin/env python3
"""Item photos for Côte Brasserie from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_cote_brasserie.py --cache DIR [--dry-run]

Where Côte shows dish photos. The menu data (tools/uk_extract/cote_brasserie.py) comes from Côte's Ten Kites menus, and the same Ten Kites
data is embedded in every https://www.cote.co.uk/menus/<menu> page: of its ~200 dishes only four carry a picture ("Picts", all drinks:
Passionfruit Martini, Boogie Woogie, Jubel Peach, Chocolat Chaud, none of them a published item here), and those pictures sit on
images.tenkites.com, whose robots.txt says `Disallow: /` (not fetched). The other dish photos on www.cote.co.uk are the site's own
content blocks, whose files live in Côte's own CMS upload folder https://cote-renaissance-be.azurewebsites.net/wp-content/uploads/...
(the address the pages' own data names as `mediaURL`; www.cote.co.uk shows them through its /_next/image resizer). Most of those
blocks are carousels or banners with no dish name at all (e.g. /occasions/lunch, /breakfast, /app-download/icons, /kids): those are
never used, because nothing on the page says which dish a picture shows (a file name is not the page naming the dish).

Pages read: every page listed in https://www.cote.co.uk/sitemap.xml except the per-restaurant pages (/restaurant/..., /restaurants/...:
venue photos) and the per-restaurant copies of the Valentine's and Mother's Day pages (valentines-<town>, occasions/mothers-day-<town>:
one of each was read and names no dish next to a picture). On 2026-11-17 that was 112 pages.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when one of these, on a www.cote.co.uk page, names it:
  (a) a rendered picture `<img alt="<name>" src="/_next/image?url=<file>...">` whose alt text, read with norm_name, equals the item's name
      (the tiles of /restaurant-offers/happiest-menu and /occasions/summer-specials print the same name as a caption under the picture), or
  (b) one content block or scroller tile in the page's own data, `{"id":..., "title":"<name>", ..., "image":{"node":{"mediaURL":"<file>"}}}`
      or `{"title":"<name>", ..., "scrollerItemImage":{"node":{"mediaURL":"<file>"}}}`, whose title, read with norm_name, equals the item's
      name (no other object may start between the title and the picture; section headings over a side picture, "sideImage", are not used);
and the file is under https://cote-renaissance-be.azurewebsites.net/wp-content/uploads/. If two different pictures carry the same name the
item gets none. Variants we publish under a longer name ("Potted Crab (weekday gluten free menu)", "Free-Flow Frites (gluten free)",
"Petit Steak Frites") are not matched: the page names only the plain dish.
Found on 2026-11-17 (every named dish picture on the 112 pages was listed; only these carry a published dish's name): Potted Crab and
Steak Frites (/restaurant-offers/happiest-menu, Côte's January 2026 set menu: "Potted Crab: Lobster butter, seeded sourdough", "Steak Frites:
Prepared in our Côte butchery, 30-day-aged, grass-fed"), Fougasse and Tarte au Citron (/occasions/summer-specials, the 2025 summer specials
page), Free-Flow Frites (the "Free-Flow Frites" block on every /menus/ page). These pages are older than the June 2026 menus the numbers come
from, so each picture was compared with the dish as the current menu describes it (DROP_ITEMS: two of the five show another version).

robots.txt (read 2026-11-17): https://www.cote.co.uk/robots.txt is `User-Agent: * / Allow: /` with the sitemap; cote-renaissance-be.azurewebsites.net
answers no robots.txt rules (polite_get reads it as "no rules"); images.tenkites.com says `Disallow: /` and is never asked for a file.
polite_get checks robots.txt on every URL (RFC 9309) and stops on 401/403/429.

Terms (read 2026-11-17): Côte's site has no website terms of use. https://www.cote.co.uk/cote-policies/terms-conditions covers only offers,
the app, bookings and gift vouchers, and no page found says anything about copying content or images; the only notice is the footer on every
page, "© 2026 Cote. All rights Reserved". Photos are installed on the founder's decision of 2026-10-06 (his accepted risk).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "cote-brasserie"
HOST = "https://www.cote.co.uk"
SITEMAP = f"{HOST}/sitemap.xml"
UPLOADS = "https://cote-renaissance-be.azurewebsites.net/wp-content/uploads/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-cote-brasserie")
# Pages read first, so that a picture shown on several pages is credited to the page listed first (the menu pages before the rest).
FIRST = ["/menus/main-menu", "/menus/prix-fixe", "/menus/breakfast", "/menus/brunch", "/menus/kids", "/menus/drinks"]
SKIP_PAGE = re.compile(r"^/(restaurant|restaurants)/|^/valentines-|^/occasions/mothers-day-")
# Looked at on contact sheets and at full size (2026-11-17); a rerun must not bring them back. {item id: reason}
DROP_ITEMS: dict[str, str] = {
    "fougasse": "the 2025 summer-specials picture shows a fougasse baked with grated cheese on top (and a branded rosé bottle being poured); "
                "the published Fougasse is the plain garlic fougasse, whose own ingredient list on Côte's menu names no cheese "
                "(we publish 'Cheesy French Onion Fougasse' as a separate dish): another version, not this dish",
    "tarte-au-citron": "the 2025 summer-specials picture shows the tart topped with a granita and cherries; the published Tarte au Citron "
                       "(June 2026 menu) is served 'With raspberries & crème Chantilly': another version, not this dish",
}

IMG = re.compile(r"<img\b[^>]*>")
BLOCK = re.compile(r'\{(?:"id":"[^"]*",)?"title":"((?:[^"\\]|\\.)*)",(?:(?!\{").)*?"(?:image|scrollerItemImage)":\{"node":\{"mediaURL":"([^"]+)"\}\}', re.S)
PUSH = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', re.S)


def page_list(cache: Path) -> list[str]:
    xml = polite_get(SITEMAP, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    paths = []
    for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
        u = urllib.parse.urlsplit(loc.strip())
        if u.netloc != "www.cote.co.uk":
            continue
        p = u.path or "/"
        if SKIP_PAGE.search(p) or p in paths:
            continue
        paths.append(p)
    if not paths:
        raise SystemExit("the sitemap lists no pages: it has changed shape")
    return [p for p in FIRST if p in paths] + [p for p in paths if p not in FIRST]


def pairs_on_page(raw: str) -> list[tuple[str, str, str]]:
    """(name as the page prints it, photo URL, how it was found) for every named picture on one page."""
    out = []
    for tag in IMG.findall(raw):
        alt = re.search(r'\salt="([^"]*)"', tag)
        src = re.search(r'\ssrc="([^"]*)"', tag)
        if not alt or not src:
            continue
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(htmllib.unescape(src.group(1))).query)
        if "url" not in q:
            continue
        out.append((htmllib.unescape(alt.group(1)), q["url"][0], "alt"))
    # the page's own data: the React Server Components chunks, each a JSON string literal
    data = []
    for lit in PUSH.findall(raw):
        try:
            data.append(json.loads(lit))
        except json.JSONDecodeError:
            continue
    blob = "".join(data)
    for title, url in BLOCK.findall(blob):
        try:
            title = json.loads(f'"{title}"')
        except json.JSONDecodeError:
            pass
        out.append((title, url, "block"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        found: dict[str, dict[str, str]] = {}   # name key -> {photo url: first page that shows it with that name}
        pages = page_list(args.cache)
        for p in pages:
            url = HOST + p if p != "/" else HOST
            raw = polite_get(url, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
            for name, photo, how in pairs_on_page(raw):
                k = norm_name(name)
                if k in by_key:
                    found.setdefault(k, {}).setdefault(photo, url)
        print(f"{len(pages)} pages of {HOST} read; {len(found)} published dish names appear next to a picture")

        matched: dict[str, tuple[str, str]] = {}   # item id -> (photo url, page url)
        for k, photos in sorted(found.items()):
            for it in by_key[k]:
                if it["id"] in DROP_ITEMS:
                    skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                    continue
                if len(photos) > 1:
                    skipped.append(f"{it['id']}: {len(photos)} different pictures carry this name ({', '.join(u.rsplit('/', 1)[-1] for u in photos)})")
                    continue
                (photo, page), = photos.items()
                if not photo.startswith(UPLOADS):
                    skipped.append(f"{it['id']}: the picture {photo} is not in Côte's own upload folder")
                    continue
                matched[it["id"]] = (photo, page)

        for item_id, (photo, page) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:30} {photo.rsplit('/', 1)[-1]}  <- {page}")
                continue
            raw = polite_get(photo, args.cache, referer=page)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {photo}: {e}")
                continue
            rows[item_id] = (fname, page)
            print(f"  {item_id:30} {fname}  <- {photo.rsplit('/', 1)[-1]}  ({page})")
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
