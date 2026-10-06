#!/usr/bin/env python3
"""Banana Tree item photos (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_banana_tree.py --cache DIR [--list]

Source: the chain's own menu, https://menus.tenkites.com/thebigtg/bananatree04 (the menu bananatree.co.uk/menu embeds; the
same seven pages the nutrition numbers come from, see banana_tree.py). Each dish on those pages shows its photo from
images.tenkites.com, the menu's own image host, with the dish's name as the photo's alt text.

Match rule (no guessing):
* The script rebuilds the published rows exactly as banana_tree.py does (same pages, same naming), but remembers which
  printed dish record(s) each row came from, so a row is tied to its own record on the page, never matched by a similar name.
* A record gets a photo only from the dish container it sits in, and only when the photo's alt text names it:
  - a dish card (k10-recipe / k10-byo-item) whose photo's alt equals the dish's printed name;
  - a "build your own" block (k10-byo: one dish with its options, e.g. Pad Thai with Chicken / Prawns / Tofu) whose photo's
    alt equals the block's printed name: the photo goes only to the block's own options ("Pad Thai - Tofu"), never to the
    side options offered on top of it (rice, sauces, extra protein: level "sub"), which keep their own name and get no photo.
* The row's item id must be in the CURRENT data/source/banana-tree/items.csv with the same name, or nothing is attached.
* Photos listed in DROP were looked at and are not used (see the reason given there).

Pages and photos are fetched once each with images_common.polite_get (1 request/second, robots.txt honoured, cached in
--cache); a 401/403/429 stops the run. Rerunning maps to the current items.csv and prunes files no row uses.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import banana_tree as bt  # noqa: E402
import tenkites_b as tk  # noqa: E402
from common import slug  # noqa: E402
from images_common import (Blocked, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN_ID = "banana-tree"
IMAGE_HOST = "https://images.tenkites.com/"

# photo URL -> why it is not used (filled in after looking at every photo; see the module docstring)
DROP: dict[str, str] = {}

# image class -> the class of the dish container that owns it
OWNER = {"k10-recipe__image": "k10-recipe", "k10-byo-item__image": "k10-byo-item", "k10-byo__image": "k10-byo"}


def page_url(guid: str) -> str:
    return f"{bt.BASE_URL}?mguid={guid}"


def fetch_pages(cache: Path) -> dict[str, Path]:
    pages = cache / "pages"
    pages.mkdir(parents=True, exist_ok=True)
    out = {}
    for label, guid, _, _ in bt.MENUS:
        raw = polite_get(page_url(guid), cache, accept="text/html")
        p = pages / f"{label}.html"
        p.write_bytes(raw)
        out[label] = p
    return out


def photos_by_record(path: Path) -> list[tuple[str, str, str] | None]:
    """For each dish pop-up on the page (in tk.read_menu order): (photo url, kind, alt) or None."""
    root = tk.parse_html(path.read_text(encoding="utf-8", errors="replace"))
    owners: dict[int, tuple[str, str, str]] = {}   # id(container) -> (src, kind, alt)
    for img in root.find_all(tag="img"):
        src = img.attrs.get("src", "")
        kind = next((c for c in OWNER if img.has(c)), None)
        if not kind or not src.startswith(IMAGE_HOST):
            continue
        cont = next((a for a in img.ancestors() if a.tag == "div" and a.has(OWNER[kind])), None)
        if cont is None:
            raise SystemExit(f"{path.name}: photo {src} outside its dish container: the page layout changed")
        if id(cont) in owners and owners[id(cont)][0] != src:
            raise SystemExit(f"{path.name}: two different photos in one dish container ({src}): the page layout changed")
        owners[id(cont)] = (src, kind, tk._clean(img.attrs.get("alt", "")))
    out = []
    for m in root.find_all("k10-recipe-modal", tag="section"):
        hit = None
        for a in m.ancestors():
            if id(a) in owners:
                hit = owners[id(a)]
                break
            if a.tag == "div" and a.has("k10-byo"):   # the block has no photo of its own: stop here
                break
        out.append(hit)
    return out


NUMBER_COLS = ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "salt_g")


def same_numbers(item: dict, vals: dict) -> bool:
    """The published row and the printed dish carry the same numbers (as banana_tree.py copies them)."""
    for col in NUMBER_COLS:
        a, b = (item.get(col) or "").strip(), (vals.get(col) or "").strip()
        if a == b:
            continue
        try:
            if float(a) != float(b):
                return False
        except ValueError:
            return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder for downloaded pages and photos (reused on rerun)")
    ap.add_argument("--list", action="store_true", help="print the mapping only; download no photos, write nothing")
    args = ap.parse_args()

    try:
        paths = fetch_pages(args.cache)
    except Blocked as e:
        print(f"BLOCKED: {e}", file=sys.stderr)
        return 2
    guid = {m[0]: m[1] for m in bt.MENUS}
    labels = [m[0] for m in bt.MENUS]
    rank = {m[0]: i for i, m in enumerate(bt.MENUS)}
    short = {m[0]: m[2] for m in bt.MENUS}
    long = {m[0]: m[3] for m in bt.MENUS}

    # Rebuild banana_tree.py's rows (tk.collect_rows) while keeping each row's source records.
    rows: dict[tuple, dict] = {}
    total = 0
    for label in labels:
        lay, recs = tk.read_menu(paths[label])
        if lay != "modal":
            raise SystemExit(f"{label}: layout {lay!r}, expected 'modal'")
        photos = photos_by_record(paths[label])
        if len(photos) != len(recs):
            raise SystemExit(f"{label}: {len(recs)} dishes but {len(photos)} pop-ups")
        total += len(recs)
        for rec, photo in zip(recs, photos):
            if bt.skip(label, rec):
                continue
            vals = tk.printed_values(rec)
            if not tk.has_required(vals):
                continue
            name = bt.name_of(label, rec)
            key = (tk.norm_name(bt.same_dish(label, rec, name)), tuple(vals.get(k, "") for k in tk.KEY_COLS))
            src = {"label": label, "rec": rec, "name": name, "photo": photo}
            if key in rows:
                rows[key]["menus"].append(label)
                rows[key]["srcs"].append(src)
                continue
            rows[key] = {"name": name, "menus": [label], "vals": vals, "where": rec["course"][-1] if rec["course"] else "", "wheres": [],
                         "srcs": [src]}
    if total != bt.EXPECTED_ROWS:
        print(f"pages hold {total} dishes, banana_tree.py expects {bt.EXPECTED_ROWS}: rerun the nutrition script first",
              file=sys.stderr)
        return 1
    rowlist = list(rows.values())
    for r in rowlist:
        r["base"] = r["name"]
    tk.unique_names(rowlist, rank, short, long)

    items = {i["id"]: i for i in load_items(CHAIN_ID)}
    chosen: dict[str, tuple[str, str]] = {}   # item_id -> (photo url, page url)
    report: list[str] = []
    for r in rowlist:
        item_id = slug(tk.fold(r["name"]))
        item = items.get(item_id)
        if item is None or norm_name(item["name"]) != norm_name(r["name"]):
            report.append(f"  not in items.csv: {r['name']!r}")
            continue
        if not same_numbers(item, r["vals"]):   # the page changed since items.csv was written: not the same row
            report.append(f"  numbers differ from items.csv, no photo: {item_id}")
            continue
        picks = []
        for s in r["srcs"]:
            if s["photo"] is None:
                continue
            url, kind, alt = s["photo"]
            rec = s["rec"]
            named = norm_name(s["name"]) == norm_name(r["base"])
            if kind == "k10-byo__image":
                # the block's photo shows the block's dish: only for the dish's own options (never an add-on), and only
                # when this record is named after that block (a record merged in from another block gets nothing)
                ok = named and not bt.is_option_of_dish(rec) and norm_name(alt) == norm_name(bt.clean_group(rec["group"]))
            else:
                # a dish card's own photo, captioned with this record's printed name; the record is this row (same name
                # and identical numbers, merged by banana_tree.py), e.g. "Korean BBQ" on the bottomless bowls menu
                ok = norm_name(alt) == norm_name(rec["name"])
            if ok:
                picks.append((not named, url, page_url(guid[s["label"]]), kind, alt))
        if not picks:
            report.append(f"  no photo: {item_id}")
            continue
        picks = [p[1:] for p in sorted(picks, key=lambda p: p[0])]   # stable: records that named the row first
        url, page, kind, alt = picks[0]
        others = sorted({p[0] for p in picks[1:]} - {url})
        if url in DROP:
            report.append(f"  dropped: {item_id} ({DROP[url]})")
            continue
        chosen[item_id] = (url, page)
        report.append(f"  {item_id:55} <- {kind[4:-7]:9} alt={alt!r} {url[len(IMAGE_HOST):]}"
                      + (f"  [other menus show {others}]" if others else ""))
    print("\n".join(report))
    print(f"{len(chosen)} of {len(items)} published items have a photo; {len({u for u, _ in chosen.values()})} distinct photos")
    if args.list:
        return 0

    stored: dict[str, str] = {}
    out: dict[str, tuple[str, str]] = {}
    for item_id, (url, page) in sorted(chosen.items()):
        if url not in stored:
            try:
                stored[url] = store_image(CHAIN_ID, polite_get(url, args.cache, referer=page))
            except Blocked as e:
                print(f"BLOCKED: {e}", file=sys.stderr)
                return 2
            except ValueError as e:
                print(f"  skipped photo {url}: {e}")
                stored[url] = ""
        if stored[url]:
            out[item_id] = (stored[url], page)
    path = write_images_csv(CHAIN_ID, out)
    print(f"wrote {path} ({len(out)} rows, {len(set(f for f, _ in out.values()))} files)")
    for f, ids in suspected_placeholders(out).items():
        print(f"  shared by {len(ids)} items, look at it: {f}: {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
