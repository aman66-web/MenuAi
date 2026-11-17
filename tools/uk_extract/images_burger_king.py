#!/usr/bin/env python3
"""Item photos for Burger King UK from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_burger_king.py --cache DIR [--dry-run]

Source (rewritten 2026-11-17; the first version, 2026-10-11, matched the tiles of the rendered /menu page by name and found 18 photos; the
page no longer prints those tiles, and many products are read from their own pages, not the menu page). www.burgerking.co.uk is a JavaScript
app whose menu and product pages load every product record from the chain's own content store, Sanity project czqk28jt, dataset prod_bk_gb,
through the public GraphQL endpoint https://czqk28jt.apicdn.sanity.io/v2023-08-01/graphql/prod_bk_gb/gen3 (seen in the network requests of
https://www.burgerking.co.uk/menu and of a product page such as https://www.burgerking.co.uk/menu/picker-0a497976-a6f3-478f-a77c-68dd7877d356,
read 2026-11-17: the menu page runs the operations "featureMenu" and "GetMenuSections", a product page runs "GetPicker" / an item page the item's
own query). This script asks the same endpoint, by plain GET, for the same records with only the fields it needs, using the field names of the
pages' own queries: a record's _id, type, name (locale en) and image (asset url), and for a "picker" (a product page that offers sizes or a
meal) its options (Item and Combo records; a Combo's main item and the items in its slots). No browser is used; nothing else is requested
besides the photo files (cdn.sanity.io/images/czqk28jt/..., the original asset without resize parameters).

What is read:
  1. FeatureMenu "feature-menu-singleton" -> defaultMenu._id, then that Menu's sections (all records on https://www.burgerking.co.uk/menu);
  2. every published item's OWN record: items.csv notes say "Read from https://www.burgerking.co.uk/menu/picker-<id>" (or item-<id>), the page
     its nutrition panel was read from; that Picker or Item record is read with its options;
  3. every Picker on the menu, with its options (the size/meal choices, e.g. "Chilli Cheese Bites" -> "6 Chilli Cheese Bites*", "9 Chilli
     Cheese Bites", each an Item record with its own photo).

Match rule (exact, nothing fuzzy). A photo is attached to a published item (data/source/burger-king/items.csv) only when the record that carries
it has the same norm_name as the item's whole name ("WHOPPER(R)" = "Whopper", "6 Chilli Cheese Bites*" = "6 Chilli Cheese Bites"), the photo is a
PNG/JPEG on cdn.sanity.io/images/czqk28jt/ (the chain's own media store), and, in this order:
  a. the item's own page record (step 2) has that name: its photo, source = the item's own page; else
  b. an option on the item's own page (an Item of that Picker, or the main item / a slot item of one of its Combos) has that name and all such
     options carry one photo: that photo, source = that Item's own page (/menu/item-<id>); else
  c. every record anywhere above with that name carries one single photo: that photo, source = that record's page (picker-<id> / item-<id>); else
  d. of the Item records with that name (different photos), exactly one prints the item's own published figures (kcal, protein, carbohydrate and
     fat in its "nutrition", to 1 decimal as in items.csv): the record the item was read from, its photo (e.g. "Large Fries": item_57362 prints
     337 kcal / 6.9 / 42 / 16 g like items.csv; an older item_1862 prints 377 kcal).
Records with that name but different photos (no single record as in d), and items no record names, get no photo (reported). Never a meal's or
a box's photo for one of its parts (a meal record never has the part's name). An item's page (/menu/item-<id>) shows the record's name as its
heading and the record's photo as its main picture (checked 2026-11-17 on item-item_57362 "Large Fries" and item-item_12926 "Kids Hamburger").

Terms (https://www.burgerking.co.uk/terms-of-use, BKUK Group Limited, read 2026-11-17, no date printed): "Unless expressly permitted by an
authorised person in writing or as permitted by applicable law, you may not copy, reproduce, distribute, publish, enter into a database, display,
perform, modify, create derivative works from, transmit, or in any way use or exploit any part of the BKUK Content." (BKUK Content includes
"photographs and other images"), and among prohibited activities "Engage in unauthorised spidering, scraping, or harvesting of content". An
express restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).
robots.txt (read 2026-11-17): https://www.burgerking.co.uk/robots.txt "User-agent: * / Disallow: /bcc,Disallow: /rewards/details" (one line;
the menu and product pages are allowed); https://czqk28jt.apicdn.sanity.io/robots.txt answers 404 (no rules); https://cdn.sanity.io/robots.txt
"User-agent: * / Allow: /files/cgnmnbqj/ / Disallow: /*.pdf / Disallow: /*.PDF" (/images/ is allowed; no PDF is fetched). polite_get checks robots.txt
for every URL (RFC 9309) and keeps 1 request a second per host.

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "burger-king"
SITE = "https://www.burgerking.co.uk"
API = "https://czqk28jt.apicdn.sanity.io/v2023-08-01/graphql/prod_bk_gb/gen3"
PHOTO = re.compile(r"^https://cdn\.sanity\.io/images/czqk28jt/[a-z0-9_]+/[0-9a-f]{40}-\d+x\d+\.(png|jpe?g)$")
DEFAULT_CACHE = Path("/tmp/menumacros-images-burger-king")
OWN_PAGE = re.compile(r"https://www\.burgerking\.co\.uk/menu/(picker|item)-([A-Za-z0-9_-]+)")

# Looked at on contact sheets (2026-11-17) and left out; a rerun must not bring them back.
# item id -> why this item gets no photo although a record names it
DROP_ITEMS: dict[str, str] = {
    "4-chilli-cheese-bites": "its record (item_2187) carries the same picture as '3 Chilli Cheese Bites' (item_10883), which shows three bites",
    # checker, 2026-11-17: a printed 'Vegan' badge sits beside the fries; a diet claim our data doesn't carry (the dish's name doesn't say it)
    "small-fries": "a printed 'Vegan' badge on the picture: a diet claim beyond the dish's name that our data doesn't carry",
    "regular-fries": "a printed 'Vegan' badge on the picture: a diet claim beyond the dish's name that our data doesn't carry",
    "large-fries": "a printed 'Vegan' badge on the picture: a diet claim beyond the dish's name that our data doesn't carry",
}
# photo asset (the 40-hex file name on cdn.sanity.io) -> why it is never used, for any item (if the chain swaps the picture, a rerun takes the new one)
DROP_PHOTOS: dict[str, str] = {
    "f229b553a1a2cda388505d31c37ac7eaa3f92d9b": "an orange 'Add 5 Golden Rings' offer badge printed on the picture (Big King)",
    "2500789c11b4e177253b0ed2da1d5883c23cb43c": "an orange 'Add 5 Golden Rings' offer badge printed on the picture (Big King Royale)",
    "82a5b92fa0c92bd00f06e1ebf07b9c2a6ae10c30": "an orange 'Add 5 Golden Rings' offer badge printed on the picture (Big King Double Royale)",
}

# GraphQL selections (field names as in the pages' own GetMenuSections / GetPicker queries)
IMG = "image{asset{_id url}}"
ITEM = f"_id _type name{{locale:en}} {IMG}"
COMBO = (f"_id _type name{{locale:en}} {IMG} mainItem{{{ITEM}}} "
         f"options{{name{{locale:en}} options{{option{{__typename ...on Item{{{ITEM}}}}}}}}}")
PICKER = f"_id _type name{{locale:en}} {IMG} options{{option{{__typename ...on Item{{{ITEM}}} ...on Combo{{{COMBO}}}}}}}"
PICKER_SHALLOW = f"...on Picker{{_id _type name{{locale:en}} {IMG}}}"
LEAF = f"...on Item{{{ITEM}}} {PICKER_SHALLOW} ...on Combo{{_id _type name{{locale:en}} {IMG}}}"
SUBSECTION = f"...on Section{{_id name{{locale:en}} options{{__typename {LEAF}}}}}"
Q_FEATURE = "query F($id:ID!){FeatureMenu(id:$id){defaultMenu{_id}}}"
# Menu.options holds Sections (and Pickers); a Section holds Sections, Items, Pickers and Combos (as in the page's GetMenuSections)
Q_MENU = (f"query M($id:ID!){{Menu(id:$id){{options{{__typename ...on Section{{_id name{{locale:en}} options{{__typename {SUBSECTION} {LEAF}}}}} "
          f"{PICKER_SHALLOW}}}}}}}")
Q_PICKER = f"query P($id:ID!){{Picker(id:$id){{{PICKER}}}}}"
Q_ITEM = f"query I($id:ID!){{Item(id:$id){{{ITEM}}}}}"
Q_NUTRITION = "query N($id:ID!){Item(id:$id){_id nutrition{calories proteins carbohydrates fat}}}"


@dataclass
class Rec:
    id: str
    type: str                     # item / picker / combo
    name: str
    photo: str | None
    page: str                     # the chain's own page that shows this record
    options: list["Rec"] = field(default_factory=list)   # a picker's options, a combo's main and slot items (flattened)


def gql(query: str, variables: dict, cache: Path) -> dict:
    url = API + "?" + urllib.parse.urlencode({"query": query, "variables": json.dumps(variables, separators=(",", ":"))})
    d = json.loads(polite_get(url, cache, accept="application/json"))
    if d.get("errors"):
        raise RuntimeError(f"the content store answered with errors: {json.dumps(d['errors'])[:400]}")
    return d["data"]


def page_of(rtype: str, rid: str) -> str:
    return f"{SITE}/menu/{'item' if rtype == 'item' else 'picker'}-{rid}"


def rec_from(o: dict, parent_page: str | None = None) -> Rec | None:
    if not isinstance(o, dict) or not o.get("_id"):
        return None
    t = o.get("_type") or (o.get("__typename") or "").lower()
    url = (((o.get("image") or {}).get("asset") or {}).get("url"))
    r = Rec(id=o["_id"], type=t, name=((o.get("name") or {}).get("locale") or "").strip(), photo=url,
            page=parent_page if t == "combo" and parent_page else page_of(t, o["_id"]))
    for opt in o.get("options") or []:
        sub = opt.get("option") if isinstance(opt, dict) and "option" in opt else None
        if sub is not None:                                # a picker's option: an Item or a Combo
            c = rec_from(sub, r.page)
            if c:
                r.options.append(c)
                r.options.extend(c.options)
        elif isinstance(opt, dict):                        # a combo's slot: {name, options:[{option:Item}]}
            for so in opt.get("options") or []:
                c = rec_from((so or {}).get("option"), r.page)
                if c:
                    r.options.append(c)
    if t == "combo" and o.get("mainItem"):
        c = rec_from(o["mainItem"])
        if c:
            r.options.append(c)
    return r


def asset(url: str | None) -> str:
    m = re.search(r"/([0-9a-f]{40})-", url or "")
    return m.group(1) if m else ""


def usable(url: str | None) -> bool:
    return bool(url and PHOTO.match(url) and asset(url) not in DROP_PHOTOS)


def collect(cache: Path, items: list[dict]) -> tuple[dict[str, Rec], dict[str, Rec], list[str]]:
    """(every record seen, by id), (each item's own page record, by item id), the menu's picker ids."""
    seen: dict[str, Rec] = {}

    def add(r: Rec | None) -> None:
        if not r:
            return
        prev = seen.get(r.id)
        if prev is None or (not prev.options and r.options):
            seen[r.id] = r
        for c in r.options:
            if c.id not in seen:
                seen[c.id] = c

    menu_id = gql(Q_FEATURE, {"id": "feature-menu-singleton"}, cache)["FeatureMenu"]["defaultMenu"]["_id"]
    menu = gql(Q_MENU, {"id": menu_id}, cache)["Menu"]
    pickers: list[str] = []

    def walk(opts: list) -> None:
        for o in opts or []:
            if not isinstance(o, dict):
                continue
            if o.get("__typename") == "Section":
                walk(o.get("options"))
                continue
            r = rec_from(o)
            add(r)
            if r and r.type == "picker":
                pickers.append(r.id)
    walk(menu.get("options"))
    print(f"menu {menu_id}: {len(seen)} records, {len(pickers)} pickers")

    own: dict[str, Rec] = {}
    for it in items:
        m = OWN_PAGE.search(it.get("notes") or "")
        if not m:
            continue
        kind, rid = m.groups()
        if kind == "picker":
            d = gql(Q_PICKER, {"id": rid}, cache).get("Picker")
        else:
            d = gql(Q_ITEM, {"id": rid}, cache).get("Item")
        r = rec_from(d) if d else None
        if r:
            add(r)
            own[it["id"]] = seen[r.id]
    for pid in dict.fromkeys(pickers):
        if seen.get(pid) and seen[pid].options:
            continue
        d = gql(Q_PICKER, {"id": pid}, cache).get("Picker")
        add(rec_from(d) if d else None)
    return seen, own, pickers


def same_figures(recs: list[Rec], it: dict, cache: Path) -> list[Rec]:
    """Of several Item records with the item's name but different photos, those whose own nutrition (kcal, protein, carbohydrate, fat, as the
    record prints them, to 1 decimal like items.csv) is exactly the item's published figures: the record the item was read from."""
    want = [it.get(k) for k in ("calories", "protein_g", "carbs_g", "fat_g")]
    if any(v in (None, "") for v in want):
        return []
    want_f = [round(float(v), 1) for v in want]
    out = []
    for r in recs:
        if r.type != "item":
            continue
        n = (gql(Q_NUTRITION, {"id": r.id}, cache).get("Item") or {}).get("nutrition") or {}
        got = [n.get(k) for k in ("calories", "proteins", "carbohydrates", "fat")]
        if all(isinstance(v, (int, float)) for v in got) and [round(float(v), 1) for v in got] == want_f:
            out.append(r)
    return out


def one_photo(recs: list[Rec]) -> tuple[str, Rec] | None:
    photos = {r.photo for r in recs}
    if len(photos) != 1:
        return None
    best = sorted(recs, key=lambda r: (r.type != "item", r.page))[0]
    return best.photo, best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--dry-run", action="store_true", help="match and report only; download no photo, store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    skipped: list[str] = []
    rows: dict[str, tuple[str, str]] = {}
    try:
        seen, own, _ = collect(args.cache, items)
        by_name: dict[str, list[Rec]] = {}
        dropped_by_name: dict[str, str] = {}
        for r in seen.values():
            if usable(r.photo):
                by_name.setdefault(norm_name(r.name), []).append(r)
            elif r.photo and asset(r.photo) in DROP_PHOTOS:
                dropped_by_name.setdefault(norm_name(r.name), DROP_PHOTOS[asset(r.photo)])
        matched: dict[str, tuple[str, str, str]] = {}
        for it in items:
            if it["id"] in DROP_ITEMS:
                skipped.append(f"{it['id']}: dropped after looking: {DROP_ITEMS[it['id']]}")
                continue
            key = norm_name(it["name"])
            mine = own.get(it["id"])
            got: tuple[str, str, str] | None = None
            if mine and norm_name(mine.name) == key and usable(mine.photo):
                got = (mine.photo, mine.page, f"own page record {mine.type} {mine.id}")
            elif mine:
                opts = [c for c in mine.options if norm_name(c.name) == key and usable(c.photo)]
                hit = one_photo(opts) if opts else None
                if hit:
                    got = (hit[0], hit[1].page, f"option {hit[1].type} {hit[1].id} on its own page ({mine.name!r})")
                elif opts:
                    skipped.append(f"{it['id']}: options named {it['name']!r} on its own page carry {len({c.photo for c in opts})} different photos")
                    continue
            if got is None:
                recs = by_name.get(key, [])
                hit = one_photo(recs) if recs else None
                same = same_figures(recs, it, args.cache) if recs and not hit else []
                if hit:
                    got = (hit[0], hit[1].page, f"{len(recs)} record(s) named so, one photo ({hit[1].type} {hit[1].id})")
                elif len(same) == 1:
                    got = (same[0].photo, same[0].page, f"{len(recs)} records named so; only {same[0].type} {same[0].id} prints the item's own figures")
                elif recs:
                    skipped.append(f"{it['id']}: {len(recs)} records named {it['name']!r} carry {len({r.photo for r in recs})} different photos "
                                   f"({', '.join(sorted(r.type + ' ' + r.id for r in recs))})")
                    continue
                elif key in dropped_by_name:
                    skipped.append(f"{it['id']}: the only picture of {it['name']!r} was dropped after looking: {dropped_by_name[key]}")
                    continue
                else:
                    page = f"its own page is {mine.type} {mine.name!r}" if mine else "no own page in its notes"
                    skipped.append(f"{it['id']}: no record is named {it['name']!r} ({page})")
                    continue
            matched[it["id"]] = got
        for item_id, (url, page, why) in sorted(matched.items()):
            if args.dry_run:
                print(f"  {item_id:42} {url.rsplit('/', 2)[-2][-6:]}/{url.rsplit('/', 1)[-1][:16]}  {why}  <- {page}")
                continue
            raw = polite_get(url, args.cache, referer=page)
            try:
                fname = store_image(CHAIN_ID, raw)
            except ValueError as e:
                skipped.append(f"{item_id}: {url}: {e}")
                continue
            rows[item_id] = (fname, page)
            print(f"  {item_id:42} {fname}  {why}")
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
