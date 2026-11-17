#!/usr/bin/env python3
"""Item photos for Greene King from its own pub menu pages (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_greene_king.py --cache DIR [--dry-run]

This file also holds the reader of Greene King's pub platform that the group's other brands use for their photos
(images_hungry_horse.py, images_chef_and_brewer.py, images_farmhouse_inns.py, images_belhaven_pubs.py import `run_brand`).

THE PLATFORM. Every Greene King brand site (www.greeneking.co.uk, www.hungryhorse.co.uk, www.chefandbrewer.com, www.farmhouseinns.co.uk,
www.belhaven.co.uk) prints a menu PER PUB at
    https://<site>/pubs/<county>/<pub>/menu
The page carries the pub's venue id (`"rawVenueId":"NNNN"`, or the `siteid=NNNN` of its "View Allergen Info" link) and loads the brand's own
JSON endpoints on the same site:
    https://<site>/api/menus/getmenus/<venue id>                       every menu of the pub (id, name), some with their categories filled in
    https://<site>/api/menus/getmenudetails/<venue id>/<menu id>       one menu's categories, when getmenus leaves them empty
(checked 2026-11-17: where getmenus fills a menu's categories they are identical to getmenudetails, product for product and photo for photo).
Each product is one record: `id` (the brand's own product id, the same at every pub), `name`, `description`, `dietaryOptions`, `portions[]`
(`portionName`, `calories`) and `image`, the URL of the dish's photo or "" when the dish has none. Most dishes have none: on 2026-11-17 a Chef &
Brewer main menu showed 10 photos for 60 dishes. Photos are fetched exactly as the feed gives them (no `t=` resize transform), so store_image
makes the only change.

Photo hosts. Only photos on Greene King's own content hub are used:
    https://gkbr-p-001.sitecorecontenthub.cloud/api/public/content/<32 hex>?v=<version>
Its robots.txt (read 2026-11-17) is "User-Agent: * / Disallow: / / Allow: /api/public/": the photos are under /api/public/content/, allowed.
Some products instead point at izoneapps-cdn.zonalconnect.com (the order-and-pay app's image store). Its /robots.txt answers 308 to
https://izoneapps.zonalconnect.com/robots.txt, which says "User-Agent: * / Disallow: /". RFC 9309 says a robots.txt redirect is followed, so that
host disallows everything: those photos are NOT fetched (counted in the run's output). Note for images_common.py: on this Mac's Python 3.9,
urllib does not follow a 308, and `_robots_allow` then reads the 308 as "no rules"; this script refuses that host itself rather than rely on it.

Match rule (exact, nothing fuzzy). A photo is attached to a published item only when a product record of the brand's own feed
  1. has the item's name: norm_name(product name) == norm_name(item name); or the item's name is the product's name followed by the
     bracketed labels our extraction script added to tell two versions apart ("(no-gluten)", "(vegan)", "(kids' menu)", "(small plates)",
     "(Scotland)", "(with custard)", a portion name such as "(8oz Rump)"...), and every word of each label is said by the record itself:
     its menu's name, its section's name, its portion's name, its own description, "vegan" in its dietary options ("little ones", "kids",
     "children" all count as kids; "Scot" in a menu name as Scotland; a plural as its singular). The label words "menu", "with", "the",
     "and", "no", "containing" and "ingredients" are not looked for;
  2. prints exactly the item's calories for one of its portions (the same dish and portion, not a kids', side or lunch version); and
  3. carries a photo on the content hub above.
The records found for an item may come from several pubs and product ids; if they carry more than one photo, the photo with the most records
wins and a tie gives no photo. Items in DROP_ITEMS and photos in SKIP_PHOTOS (looked at by eye on contact sheets) never get a photo.
A photo an earlier run matched by this rule (looked at then) is kept when today's feed no longer shows it, unless its item is in DROP_ITEMS;
when nothing new is found, images.csv is not rewritten (its retrieval dates stay). Everything else gets no photo.

GREENE KING ITSELF. The guide behind our data is the spring/summer 2024 Pub & Social core menu; the pubs' menus have moved on (same name,
different calories, or a side with the main's name: "Mac & Cheese" is 745 kcal as a main in our guide and 315 kcal as a side on a pub menu), so
the calorie rule above leaves most items without a photo. Every pub prints its own menu and the chain has 748 pub menu pages; reading them all
would be crawling. This reads a fixed list of 35 pubs (every 25th pub menu page of the chain's sitemap, plus 5 pubs looked at while scoping),
every menu of each (getmenus, then getmenudetails for the menus it leaves empty), at 1 request/second. The set is a sample, so coverage is partial
by design.

Terms (https://www.greeneking.co.uk/terms-conditions, "Website Terms of Use", Intellectual property, read 2026-10-08 and again 2026-11-17, unchanged):
"The content and design of these website pages are subject to copyright owned by us. You are welcome to print pages for your personal use but no
part of this website, our logos or trademarks may be reproduced or transmitted in any way for any other purpose." Installed on the founder's
decision of 2026-10-06 (the founder's accepted risk); a chain's photos come down the day it asks.
robots.txt: https://www.greeneking.co.uk/robots.txt (read 2026-10-08 and 2026-11-17) disallows /App_Data/, /masterpages/, /bin/, /config/, /css/,
/data/, /js/, /images/, /includes/, /media/, /Properties/, /scripts/, /sitecore/, /usercontrols/, /xslt/ and a few booking queries; it says
nothing about /pubs/ or /api/menus/ (and names no AI crawler; only "Screaming Frog SEO Spider" is refused everything). polite_get checks
robots.txt on every URL.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.

Run of 2026-10-08 (getmenus only): 2 photos, Chips and Rosemary Salted Skin on Fries, printed then at our guide's 428 and 381 kcal.
Run of 2026-11-17 (every menu read): 35 pubs, 914 distinct products, 97 with a photo (50 on the content hub, the rest on the robots-refused Zonal
host, e.g. Garlic Bread); 0 items matched: the pubs now print other calories than the 2024 guide (Chips 466/433/422/408 kcal, the fries 402),
so the two photos of 2026-10-08 are kept (see above) and images.csv is unchanged.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.error
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    IMAGES_ROOT, ROOT, Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "greene-king"
BASE = "https://www.greeneking.co.uk"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
JSON_ACCEPT = "application/json"
DEFAULT_CACHE = Path("/tmp/menumacros-images-greene-king")
PUBS = [
    "middlesex/middlesex-arms", "west-yorkshire/new-inn", "lancashire/lane-ends", "lancashire/counting-house", "east-sussex/chequers",
    "west-glamorgan/pub-on-the-pond", "devon/dartbridge-inn", "greater-london/golden-lion", "buckinghamshire/white-hart",
    "hampshire/bold-forester", "hampshire/red-lion-stubbington", "kent/oak", "gloucestershire/bishops-tavern", "west-sussex/star",
    "hertfordshire/old-red-lion", "cambridgeshire/george-hotel", "greater-london/masons-arms", "greater-london/rose-and-crown",
    "greater-london/travellers-tavern", "greater-manchester/royal-oak", "northamptonshire/abington", "avon/wackum-inn",
    "south-yorkshire/tut-n-shive", "oxfordshire/black-horse", "essex/town-crier", "essex/duke-of-wellington", "berkshire/white-swan",
    "west-midlands/nickelodeon", "nottinghamshire/tap-and-tumbler", "merseyside/shrewsbury-arms",
    # looked at while scoping
    "greater-london/rutland-arms", "middlesex/crown-and-horseshoes", "greater-manchester/kings-ransom", "wiltshire/royal-oak",
    "lancashire/washington",
]
DROP_ITEMS: dict[str, str] = {}   # items looked at on contact sheets and left without a photo (a rerun must not bring them back)
SKIP_PHOTOS: dict[str, str] = {}  # content-hub photo id -> why it is not used

VENUE_ID = (re.compile(r'"rawVenueId":"(\d+)"'), re.compile(r"siteid=(\d+)"))
PHOTO = re.compile(r"^https://gkbr-p-001\.sitecorecontenthub\.cloud/api/public/content/(?P<id>[0-9a-f]{32})(?:\?v=[0-9a-f]+)?$")
ROBOTS_REFUSED_HOSTS = {"izoneapps-cdn.zonalconnect.com": "its robots.txt redirects (308) to izoneapps.zonalconnect.com/robots.txt: Disallow: /"}

# ------------------------------------------------------------------------------------------------ the shared platform reader

LABEL_STOP = {"menu", "with", "the", "and", "no", "containing", "ingredients", "a", "of"}
KIDS_WORDS = {"little", "ones", "kids", "kid", "children", "childrens", "child"}
KIDS = re.compile(r"little ones|younger guests|kid|child", re.I)


def _singular(w: str) -> str:
    return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w


def _words(*texts: str) -> set[str]:
    out = set()
    for t in texts:
        for w in norm_name(t or "").split():
            out.add("kids" if w in KIDS_WORDS else _singular(w))
    return out


def sitemap_pubs(base: str, cache: Path) -> list[str]:
    """Every /pubs/<area>/<pub>/menu page the brand's own sitemap.xml lists, sorted."""
    xml = polite_get(base + "/sitemap.xml", cache, accept="application/xml,text/xml;q=0.9,*/*;q=0.8").decode("utf-8", "replace")
    return sorted(set(re.findall(r"<loc>" + re.escape(base) + r"/pubs/([^/<]+/[^/<]+)/menu</loc>", xml)))


def spread(paths: list[str], n: int) -> list[str]:
    """n pubs spread evenly over the sorted list (all of them when n >= the list's length): a fixed, repeatable sample."""
    if n >= len(paths):
        return list(paths)
    return [paths[(i * len(paths)) // n] for i in range(n)]


def read_pub(base: str, pub: str, cache: Path) -> tuple[str, list[dict]]:
    """(menu page URL, records) for one pub: one record per product per menu section, as the brand's own feed prints it."""
    page = f"{base}/pubs/{pub}/menu"
    html = polite_get(page, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    vid = next((m.group(1) for rx in VENUE_ID for m in [rx.search(html)] if m), None)
    if vid is None:
        print(f"  {pub}: no venue id on the page, skipped")
        return page, []
    try:
        menus = json.loads(polite_get(f"{base}/api/menus/getmenus/{vid}", cache, accept=JSON_ACCEPT))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"  {pub}: getmenus answered 404 (no online menu), skipped")
            return page, []
        raise
    records = []
    for menu in menus or []:
        cats = menu.get("categories") or []
        if not cats:
            try:
                cats = json.loads(polite_get(f"{base}/api/menus/getmenudetails/{vid}/{menu['id']}", cache, accept=JSON_ACCEPT)) or []
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    continue
                raise
        for cat in cats:
            for prod in cat.get("products") or []:
                records.append({"pid": str(prod.get("id")), "name": " ".join((prod.get("name") or "").split()),
                                "desc": prod.get("description") or "", "diet": prod.get("dietaryOptions") or [],
                                "menu": " ".join((menu.get("name") or "").split()), "cat": " ".join((cat.get("name") or "").split()),
                                "portions": [(po.get("portionName") or po.get("name") or "", po.get("calories")) for po in prod.get("portions") or []],
                                "image": (prod.get("image") or "").strip(), "page": page})
    return page, records


SUFFIX = re.compile(r"\s*\(([^()]*)\)\s*$")


def split_labels(name: str) -> tuple[str, list[str]]:
    labels = []
    while (m := SUFFIX.search(name)) and m.start() > 0:
        labels.insert(0, m.group(1))
        name = name[:m.start()]
    return name, labels


def _same_kcal(a, b) -> bool:
    try:
        return a is not None and float(a) == float(b)
    except (TypeError, ValueError):
        return False


def record_matches(item: dict, rec: dict) -> bool:
    """Rule 1 and 2 of the docstring for one product record."""
    portions = [p for p in rec["portions"] if _same_kcal(p[1], item["calories"])]
    if not portions:
        return False
    if norm_name(rec["name"]) == norm_name(item["name"]):
        return True
    base, labels = split_labels(item["name"])
    if not labels or norm_name(rec["name"]) != norm_name(base):
        return False
    for portion_name, _ in portions:
        ctx = _words(rec["menu"], rec["cat"], portion_name, rec["desc"])
        if "Vegan" in rec["diet"]:
            ctx.add("vegan")
        if KIDS.search(rec["menu"]) or KIDS.search(rec["cat"]):
            ctx.add("kids")
        if re.search(r"\bscot", rec["menu"], re.I):
            ctx.add("scotland")
        needed = [w for label in labels for part in label.split(",") for w in _words(part) if w not in LABEL_STOP]
        if needed and all(w in ctx for w in needed):
            return True
    return False


def choose_photos(items: list[dict], records: list[dict], drop_items: dict, skip_photos: dict) -> tuple[dict, Counter]:
    """{item id: (photo id, photo url, pub page)} by the rule of the docstring, and counts of why records were not used."""
    why = Counter()
    by_base: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_base[norm_name(r["name"])].append(r)
    chosen = {}
    for it in items:
        if it["id"] in drop_items:
            why["items dropped after looking (DROP_ITEMS)"] += 1
            continue
        keys = {norm_name(it["name"]), norm_name(split_labels(it["name"])[0])}
        cands = [r for k in keys for r in by_base.get(k, [])]
        votes: Counter = Counter()
        first: dict[str, tuple[str, str]] = {}
        for r in cands:
            if not record_matches(it, r):
                continue
            img = r["image"]
            if not img:
                continue
            host = re.sub(r"^https?://([^/]+).*$", r"\1", img)
            if host in ROBOTS_REFUSED_HOSTS:
                why[f"matching records whose photo is on {host} (robots.txt refuses it)"] += 1
                continue
            pm = PHOTO.match(img)
            if not pm:
                why["matching records whose photo is not a content-hub file"] += 1
                continue
            if pm["id"] in skip_photos:
                why["matching records whose photo is in SKIP_PHOTOS"] += 1
                continue
            votes[pm["id"]] += 1
            key = (r["page"], img)
            if pm["id"] not in first or key < first[pm["id"]]:
                first[pm["id"]] = key
        if not votes:
            continue
        top = votes.most_common()
        if len(top) > 1 and top[0][1] == top[1][1]:
            print(f"  {it['id']}: {len(top)} different photos with equal support, none used")
            why["items with a tie between photos"] += 1
            continue
        pid = top[0][0]
        page, url = first[pid]
        chosen[it["id"]] = (pid, url, page)
        print(f"  {it['id']:55} photo {pid} on {top[0][1]} record(s), other photos {len(top) - 1}")
    return chosen, why


def earlier_rows(chain_id: str, published: set[str], drop_items: dict) -> dict[str, tuple[str, str, str]]:
    """Rows of the chain's current images.csv that are still usable: the item is published, not in DROP_ITEMS, and its file exists. A photo
    matched by an earlier run (by this same rule, on the day in its retrieved_on column) stays when today's feed no longer shows it: the menus
    move on (Greene King's own "Chips" photo was printed at our guide's 428 kcal on 2026-10-08; on 2026-11-17 the pubs print 466 kcal)."""
    path = ROOT / "data" / "source" / chain_id / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: (r["file"], r["source_url"], r["retrieved_on"]) for r in csv.DictReader(f)
                if r["item_id"] in published and r["item_id"] not in drop_items and (IMAGES_ROOT / chain_id / r["file"]).exists()}


def current_rows(chain_id: str) -> dict[str, tuple[str, str]]:
    path = ROOT / "data" / "source" / chain_id / "images.csv"
    if not path.exists():
        return {}
    with open(path, newline="", encoding="utf-8") as f:
        return {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(f)}


def run_brand(chain_id: str, base: str, pubs: list[str], cache: Path, dry_run: bool, drop_items: dict, skip_photos: dict) -> int:
    """Read the pubs, match, download, write images.csv. Returns the exit code."""
    items = load_items(chain_id)
    records: list[dict] = []
    seen_pids: list[int] = []
    pids: set[str] = set()
    try:
        for n, pub in enumerate(pubs, 1):
            _, recs = read_pub(base, pub, cache)
            records += recs
            pids |= {r["pid"] for r in recs}
            seen_pids.append(len(pids))
            if n % 10 == 0:
                print(f"  ... {n} pubs read, {len(pids)} distinct products so far")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    with_photo = {r["pid"] for r in records if r["image"]}
    hub = {r["pid"] for r in records if PHOTO.match(r["image"])}
    print(f"{len(pubs)} pubs read: {len(records)} product records, {len(pids)} distinct products, {len(with_photo)} with a photo "
          f"({len(hub)} on the content hub); distinct products after each 10 pubs: {seen_pids[9::10]}")
    chosen, why = choose_photos(items, records, drop_items, skip_photos)
    print(f"{len(chosen)} of {len(items)} published items have a matching photo; not used: {dict(why)}")
    earlier = earlier_rows(chain_id, {it["id"] for it in items}, drop_items)
    carried = sorted(set(earlier) - set(chosen))
    if carried:
        print(f"kept from an earlier run (no match in today's feed, photo looked at then and not dropped since): {carried}")
    if dry_run:
        return 0
    rows: dict[str, tuple[str, str]] = {}
    try:
        for item_id, (photo_id, url, page) in sorted(chosen.items()):
            try:
                rows[item_id] = (store_image(chain_id, polite_get(url, cache, referer=page)), page)
            except ValueError as e:
                print(f"  {item_id}: {e}, no photo")
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping; nothing written.")
        return 1
    for item_id in carried:
        rows[item_id] = earlier[item_id][:2]
    path = ROOT / "data" / "source" / chain_id / "images.csv"
    if rows and rows == current_rows(chain_id):
        print(f"no change: images.csv left as it is ({len(rows)} photos, their retrieval dates kept)")
        return 0
    write_images_csv(chain_id, rows)        # with no rows this removes the chain's photo folder too
    if not rows:
        path.unlink()                       # images.csv is optional: a chain with no photo has none
        print("no photo kept: images.csv and the photo folder removed")
        return 0
    shared = suspected_placeholders(rows)
    print(f"wrote {len(rows)} photos; shared by 4+ items: {shared or 'none'}")
    return 0


def brand_args(default_cache: Path) -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=default_cache)
    ap.add_argument("--dry-run", action="store_true", help="read the menus and print the matches; download no photo, write nothing")
    return ap.parse_args()


def main() -> int:
    args = brand_args(DEFAULT_CACHE)
    return run_brand(CHAIN_ID, BASE, PUBS, args.cache, args.dry_run, DROP_ITEMS, SKIP_PHOTOS)


if __name__ == "__main__":
    sys.exit(main())
