#!/usr/bin/env python3
"""Item photos for Bella Italia (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_bella_italia.py --cache <dir> [--dry-run]

Source: Bella Italia's own website pages (www.bellaitalia.co.uk). Each page carries its content as Nuxt page data
(<script id="__NUXT_DATA__">) with Contentful "tiles"; photos are on images.ctfassets.net, the asset host those pages use.

Where the photos are NOT taken from: the Ten Kites menu that bellaitalia.co.uk/menu embeds
(menus.tenkites.com/thebigtg/...) names every dish next to its photo, but those photos live on images.tenkites.com, whose
robots.txt says "User-agent: * / Disallow: /". We honour that and do not fetch them, and we do not look for "the same file"
elsewhere either (that would be working round the rule and matching by file name).

Match rule (exact, nothing fuzzy): a photo is attached to an item only when the page entry that shows the photo names
exactly one dish and that name equals the published item name (images_common.norm_name). An entry is either
  (a) a section of exactly two tiles: one tile with only a photo and one text tile whose markdown heading is the dish
      (the "Most ordered dishes" blocks on /delivery), or
  (b) one tile with a photo and text.
The dish names an entry gives are its bold names (__X__ or <b>X</b>) plus its heading when the heading is a published
item name; an entry naming two or more dishes ("Go classic with a Margherita or Pepperoni") is skipped, so a shared photo
is never pinned on one of several dishes. A name shared by two published items, or an item that two entries give
different photos, gets no photo. Variants the page doesn't name ("(Gluten-Free)", "(Protein Enriched Pasta)") get none.
Photos that print nutrition numbers or claims are not used (listed in SKIP_FILES after looking at them).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "bella-italia"
SITE = "https://www.bellaitalia.co.uk"
# The chain's own pages that show dishes with photos (menu, delivery, offers and food pages); one request each, cached.
PAGES = ["/menu", "/delivery", "/lunch-deal", "/italian-pasta", "/must-try-italian-dishes", "/best-pizza-restaurant",
         "/best-pasta-restaurant", "/vegan", "/vegetarian", "/christmas", "/offers"]
SKIP_FILES: dict[str, str] = {}   # Contentful file name -> why it is not used (nutrition text, placeholder...)


# ---------------------------------------------------------------- Nuxt page data

def nuxt_data(html: str):
    """Decode the devalue-encoded __NUXT_DATA__ array into plain Python objects."""
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    arr = json.loads(m.group(1))
    wrappers = {"ShallowReactive", "Reactive", "Ref", "ShallowRef"}

    def r(i, depth=0):
        if depth > 80:
            return None
        v = arr[i]
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in wrappers:
                return r(v[1], depth + 1) if len(v) > 1 else None
            if v and isinstance(v[0], str) and v[0] in {"EmptyRef", "EmptyShallowRef", "Set", "Map", "Date", "RegExp",
                                                         "BigInt", "NuxtError"}:
                return None
            return [r(x, depth + 1) if isinstance(x, int) else x for x in v]
        if isinstance(v, dict):
            return {k: (r(x, depth + 1) if isinstance(x, int) else x) for k, x in v.items()}
        return v
    return r(0)


def tile_image(t: dict) -> str | None:
    """The photo URL a tile shows (desktop, else mobile), https, without resize parameters."""
    for k in ("backgroundImageDesktop", "backgroundImageMobile", "image"):
        v = t.get(k)
        if isinstance(v, dict) and isinstance(v.get("file"), dict) and v["file"].get("url"):
            ctype = v["file"].get("contentType", "")
            if not ctype.startswith("image/"):
                continue
            url = v["file"]["url"]
            return ("https:" + url) if url.startswith("//") else url
    return None


def tile_text(t: dict) -> str:
    c = t.get("content")
    return c if isinstance(c, str) else ""


def heading(text: str) -> str:
    """First markdown/HTML heading line of a tile's text ('### Carbonara' -> 'Carbonara')."""
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^#{1,4}\s+(.+)$", line)
        if m:
            return m.group(1).strip()
        m = re.match(r"^<h[1-4][^>]*>(.*?)</h[1-4]>", line, re.I)
        if m:
            return re.sub(r"<[^>]+>", "", m.group(1)).strip()
        if line:
            return ""
    return ""


def bold_names(text: str) -> list[str]:
    names = re.findall(r"__([^_]+?)__", text) + re.findall(r"<b>(.*?)</b>", text, re.I) + \
        re.findall(r"\*\*([^*]+?)\*\*", text)
    return [re.sub(r"<[^>]+>", "", n).strip() for n in names if n.strip()]


def entries(page_obj) -> list[tuple[str, str]]:
    """(text, photo url) pairs: a photo tile with its own text, or a two-tile section (photo tile + text tile)."""
    out: list[tuple[str, str]] = []

    def walk(o):
        if isinstance(o, dict):
            tiles = o.get("tiles")
            if isinstance(tiles, list) and len(tiles) == 2 and all(isinstance(x, dict) for x in tiles):
                a, b = tiles
                for img_t, txt_t in ((a, b), (b, a)):
                    if (tile_image(img_t) and not tile_text(img_t).strip() and tile_text(txt_t).strip()
                            and not tile_image(txt_t) and not txt_t.get("tiles")):
                        out.append((tile_text(txt_t), tile_image(img_t)))
            if "content" in o and tile_image(o) and tile_text(o).strip():
                out.append((tile_text(o), tile_image(o)))
            for k in ("sections", "tiles"):
                if isinstance(o.get(k), list):
                    for x in o[k]:
                        walk(x)
    walk(page_obj)
    return out


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[str]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it["id"])

    found: dict[str, set[tuple[str, str]]] = {}   # item id -> {(photo url, page url)}
    skipped: list[str] = []
    try:
        for path in PAGES:
            page_url = SITE + path
            html = ic.polite_get(page_url, args.cache, accept="text/html").decode("utf-8", "replace")
            data = nuxt_data(html)
            if not data:
                skipped.append(f"{path}: no page data")
                continue
            pages = [v for k, v in (data.get("data") or {}).items() if isinstance(v, dict) and "sections" in v]
            for pg in pages:
                for text, photo in entries(pg):
                    head = heading(text)
                    names = bold_names(text)
                    if head and ic.norm_name(head) in by_name:
                        names.append(head)
                    distinct = {ic.norm_name(n) for n in names}
                    if len(distinct) != 1:
                        if distinct & set(by_name):
                            skipped.append(f"{path}: entry names {len(distinct)} dishes ({', '.join(sorted(distinct))})")
                        continue
                    key = distinct.pop()
                    ids = by_name.get(key)
                    if not ids:
                        continue
                    if len(ids) > 1:
                        skipped.append(f"{path}: '{key}' is the name of {len(ids)} items")
                        continue
                    fname = photo.rsplit("/", 1)[-1]
                    if fname in SKIP_FILES:
                        skipped.append(f"{path}: {fname} skipped: {SKIP_FILES[fname]}")
                        continue
                    found.setdefault(ids[0], set()).add((photo, page_url))
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    rows: dict[str, tuple[str, str]] = {}
    for item_id, pairs in sorted(found.items()):
        photos = {p for p, _ in pairs}
        if len(photos) > 1:
            skipped.append(f"{item_id}: {len(photos)} different photos on the site; ambiguous, no photo")
            continue
        photo = photos.pop()
        page_url = sorted(pg for p, pg in pairs)[0]
        if args.dry_run:
            print(f"{item_id}: {photo}  <- {page_url}")
            continue
        try:
            raw = ic.polite_get(photo, args.cache)
            rows[item_id] = (ic.store_image(CHAIN, raw), page_url)
        except ic.Blocked as e:
            print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
            return 2
        except ValueError as e:
            skipped.append(f"{item_id}: {photo}: {e}")

    for s in skipped:
        print("skip:", s)
    if args.dry_run:
        return 0
    csv_path = ic.ROOT / "data" / "source" / CHAIN / "images.csv"
    if rows:
        ic.write_images_csv(CHAIN, rows)
    else:   # no matches: leave no stale CSV or files behind
        if csv_path.exists():
            csv_path.unlink()
        d = ic.IMAGES_ROOT / CHAIN
        if d.is_dir():
            for p in d.iterdir():
                p.unlink()
            d.rmdir()
    print(f"{len(rows)} of {len(items)} published items have a photo")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"LOOK: {f} is used by {len(ids)} items: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
