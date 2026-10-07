#!/usr/bin/env python3
"""Item photos for Pure from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_pure.py --cache DIR [--dry-run]

Source: the nine menu pages the nutrition data came from (https://www.pure.co.uk/menus/<page>/, the pages listed in
tools/uk_extract/pure_pages.py). Each page is server-rendered and shows every item as a schema.org MenuItem twice:
  * a tile in the visible grid:  <meta itemprop="name" content="Banana &amp; Honey"> <meta itemprop="image" content="/wp-content/uploads/<file>">
    <a href="/menu-item/<slug>/" title="..."><img data-src="/wp-content/uploads/<file>"> <h4>name</h4>
  * a hidden details article (<div hidden>) for the same /menu-item/<slug>/ with the item's own full-size photo
    (<img data-src="/wp-content/uploads/<file>" width="1080"...>), its name (<h2 itemprop="name">) and its nutrition table(s),
    each labelled with an <h5> when the item has several (Regular / Large, Dressed / Undressed, Organic Dairy Milk / Oat Milk).
The photos are on pure.co.uk itself (/wp-content/uploads/, the site's own upload folder); no other host is used.
We fetch the photo file the page names (store_image does the only change: downsize to <= 640 px, WebP). Where the tile and
the details article name two WordPress sizes of the SAME upload (".../Cortado-1024x928.jpg" and ".../Cortado.jpg", or "-scaled")
the unsuffixed original is used, else the "-scaled" one, else the largest sized copy; references to different uploads are
a disagreement and the tile is not used.

Match rule (exact, nothing fuzzy): a tile gives a photo to a published item only when
  (1) the tile's name (meta name, link title and <h4>), the details article's <h2> name and both photo references
      (tile meta + tile <img>, article meta + article <img>) all agree (norm_name equality / the same file); and
  (2) the published item's name (CURRENT items.csv) equals the tile's name, or equals the tile's name plus ONE OF THE
      LABELS OF THAT SAME ARTICLE'S OWN NUTRITION TABLES ("Banana & Honey" + "Organic Dairy Milk" = "Banana & Honey
      (organic dairy milk)"): the same product record carries the photo and that item's variant. Size words that are part of
      the tile's own name ("Berry Berry Good Large") are matched by the same name equality.
If two tiles carry the same name (e.g. "Ham & Cheese" is both a Protein Egg Muffin and a Gatwick special) the tile whose
section heading on the page equals the item's category in items.csv is the one used; if that does not leave exactly one
product, the item gets no photo. An item whose name is carried by tiles with different products or different photos, or that
shares its name with another published item, gets no photo. Nothing is matched by slug, file name or similarity. Photo file names that look like a
placeholder, banner, logo or icon are not used, and SKIP_FILES lists any photo looked at and rejected (nutrition claims on
the photo, wrong subject). A photo that two or more DIFFERENT products show is not used either (it cannot be that item's photo).

Terms (https://www.pure.co.uk/terms-conditions/, heading "Copyright", read 2026-10-07): "All copyright, trademarks and all
other intellectual property rights in the Website and its content (including without limitation the Website design, text,
graphics and all software and source codes connected with the Website) are owned by or licensed to Pure or otherwise used by
Pure as permitted by law." and "None of the content may be downloaded, copied, reproduced, transmitted, stored, sold or
distributed without the prior written consent of the copyright holder. This excludes the downloading, copying and/or printing
of pages of the Website for personal, non-commercial home use only." Installed on the founder's decision of 2026-10-06
(the founder's accepted risk; CLAUDE.md rule 2).
robots.txt (https://www.pure.co.uk/robots.txt, read 2026-10-07): "User-agent: *  Disallow:" (nothing disallowed) and
"Crawl-delay: 10". We honour the crawl delay on EVERY request to the host (pages and photos): one request every 10 seconds,
so a full run takes about 10 s x (9 pages + number of photos), roughly 20 minutes. polite_get also checks robots.txt.

A 401/403/429 or a robots refusal stops the script (exit 2) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "pure"
SITE = "https://www.pure.co.uk"
PAGES = ["hot-lunch", "hot-drinks", "salads-grain-bowls", "cold-breakfast", "hot-breakfast", "breads", "sides-desserts",
         "snacks-treats", "cold-drinks"]          # the pages pure.py reads; Catering / Events / New this Season are not used
CRAWL_DELAY = 10.0                                # robots.txt: "Crawl-delay: 10"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
SKIP_FILES: dict[str, str] = {                    # upload file name -> why it is not used
    "2017-09-06_SH64_Hotchocolate-208-2.jpg": "the Latte tile shows a file that Pure itself names 'Hotchocolate' (its Hot "
                                              "Chocolate tile uses another file): not confirmed to show a latte, so no photo",
}
# Items looked at after the first run and left without a photo (a rerun must not bring them back): the photo carries a
# baked-in "NEW RECIPE" sticker, which could contradict our own numbers or allergens.
DROP_ITEMS = {"high-protein-chilli-and-cheese", "prime-protein", "salmon-lovin"}
# Files to look at by eye after the run (text overlays, design exports, odd names): printed, not excluded.
LOOK_AT = re.compile(r"overlay|untitled|ezgif|credit|3rdparty|gif", re.I)
SIZE_SUFFIX = re.compile(r"-(?:\d+x\d+|scaled)(?=\.[A-Za-z]+$)")
BAD_FILE_WORDS = re.compile(r"placeholder|coming[-_ ]?soon|no[-_ ]?image|default|logo|banner|icon|header|hero", re.I)

TILE = re.compile(r'<div class="[^"]*\bmenu-item\b[^"]*"[^>]*itemprop="hasMenuItem"[^>]*>(?P<body>.*?)</a>', re.S)
ARTICLE = re.compile(r'<article class="menu-item-details".*?</article>', re.S)
META = r'<meta itemprop="%s" content="([^"]*)"'


def txt(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def upload_path(p: str) -> str | None:
    """'/wp-content/uploads/<file>' (the site's own upload folder) from a page reference, else None."""
    p = html.unescape(p).strip()
    if p.startswith(SITE):
        p = p[len(SITE):]
    return p if re.fullmatch(r"/wp-content/uploads/[^\s?#]+\.(?:jpe?g|png|webp)", p, re.I) else None


def best_reference(paths: set[str]) -> str | None:
    """One path from the page's own references to a photo, or None if they name different uploads. WordPress writes
    '<upload>-<w>x<h>.<ext>' and '<upload>-scaled.<ext>' next to the original '<upload>.<ext>': the same picture."""
    if len(paths) == 1:
        return next(iter(paths))
    if len({SIZE_SUFFIX.sub("", p) for p in paths}) != 1:
        return None

    def rank(p: str):
        m = SIZE_SUFFIX.search(p)
        if m is None:
            return (0, 0)
        if m.group(0) == "-scaled":
            return (1, 0)
        return (2, -int(m.group(0)[1:].split("x")[0]))
    return min(paths, key=rank)


def read_page(page: str, h: str) -> tuple[list[dict], list[str]]:
    """Tiles of one menu page that have a usable, consistent photo. Returns (tiles, problems)."""
    cut = h.find("<div hidden>")
    if cut == -1:
        raise ValueError(f"{page}: no hidden item-details block: the layout changed")
    grid = h[:cut]
    articles: dict[str, str] = {}
    for a in ARTICLE.findall(h[cut:]):
        um = re.search(META % "url", a)
        if um:
            articles.setdefault(um.group(1).strip("/").rsplit("/", 1)[-1], a)
    headings = [(hm.start(), txt(hm.group(1))) for hm in re.finditer(r"<h3[^>]*>(.*?)</h3>", grid, re.S)]
    tiles, problems = [], []
    for m in TILE.finditer(grid):
        b = m.group("body")
        name_m, img_m = re.search(META % "name", b), re.search(META % "image", b)
        link = re.search(r'<a href="/menu-item/([^"/]+)/" title="([^"]*)"', b)
        img = re.search(r'<img[^>]*?\bdata-src="([^"]+)"', b)
        h4 = re.search(r"<h4[^>]*>(.*?)</h4>", b, re.S)
        if not (name_m and img_m and link and img and h4):
            problems.append(f"{page}: a tile lacks name/photo/link ({txt(b)[:40]!r})")
            continue
        slug, name = link.group(1), txt(name_m.group(1))
        names = {ic.norm_name(name), ic.norm_name(txt(link.group(2))), ic.norm_name(txt(h4.group(1)))}
        a = articles.get(slug)
        if a is None:
            problems.append(f"{page}: {name!r} has no details article")
            continue
        a_name = re.search(r'<h2 itemprop="name">(.*?)</h2>', a, re.S)
        a_img_meta, a_img = re.search(META % "image", a), re.search(r'<img[^>]*?\bdata-src="([^"]+)"', a)
        if not (a_name and a_img_meta and a_img):
            problems.append(f"{page}: {name!r} details article lacks name/photo")
            continue
        names.add(ic.norm_name(txt(a_name.group(1))))
        photos = {upload_path(x) for x in (img_m.group(1), img.group(1), a_img_meta.group(1), a_img.group(1))}
        photo = None if None in photos else best_reference(photos)
        if len(names) != 1 or photo is None:
            problems.append(f"{page}: {name!r}: name or photo references disagree ({sorted(names)}, {sorted(map(str, photos))})")
            continue
        section = ([t for pos, t in headings if pos < m.start()] or [""])[-1]
        nut = re.search(r'<div itemprop="nutrition".*?</table>\s*</div>|<div itemprop="nutrition"[^>]*>\s*</div>', a, re.S)
        labels = [txt(x) for x in re.findall(r"<h5>(.*?)</h5>\s*<table", nut.group(0) if nut else "", re.S)]
        labels = [x for x in labels if x and x != "Nutritional Information"]
        tiles.append({"page": page, "slug": slug, "name": name, "photo": photo, "labels": labels, "section": section,
                      "url": f"{SITE}/menus/{page}/"})
    return tiles, problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for pages and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="fetch the pages, print the matches; download no photo, write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(ic.norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    tiles: list[dict] = []
    try:
        for page in PAGES:
            h = ic.polite_get(f"{SITE}/menus/{page}/", args.cache, delay=CRAWL_DELAY, accept=HTML_ACCEPT).decode("utf-8", "replace")
            t, problems = read_page(page, h)
            tiles.extend(t)
            skipped.extend(problems)
            print(f"{page}: {len(t)} tiles with a consistent photo")

        # candidate (tile) for each name an item could have
        cands: dict[str, list[dict]] = {}
        for t in tiles:
            for key in {ic.norm_name(t["name"]), *(ic.norm_name(f"{t['name']} {lab}") for lab in t["labels"])}:
                cands.setdefault(key, []).append(t)

        chosen: dict[str, dict] = {}
        for key, its in sorted(by_key.items()):
            found = cands.get(key, [])
            if len(its) != 1:
                if found:
                    skipped.append(f"'{key}': the name of {len(its)} published items")
                continue
            if not found:
                continue
            item = its[0]
            if len({(t["slug"], t["page"]) for t in found}) > 1:   # same name on several products: the page's own grouping decides
                found = [t for t in found if ic.norm_name(t["section"]) == ic.norm_name(item["category"])] or found
            if len({(t["slug"], t["page"]) for t in found}) != 1 or len({t["photo"] for t in found}) != 1:
                skipped.append(f"{item['id']}: {len(found)} tiles carry this name with different products/photos: ambiguous")
                continue
            t = found[0]
            fname = t["photo"].rsplit("/", 1)[-1]
            if item["id"] in DROP_ITEMS:
                skipped.append(f"{item['id']}: dropped after looking: photo carries a 'NEW RECIPE' sticker")
                continue
            if fname in SKIP_FILES:
                skipped.append(f"{item['id']}: {fname} skipped: {SKIP_FILES[fname]}")
                continue
            if BAD_FILE_WORDS.search(urllib.parse.unquote(fname)):
                skipped.append(f"{item['id']}: {fname} looks like a placeholder/banner/logo file name")
                continue
            chosen[item["id"]] = t

        # a photo shown for two or more different products is not "this item's photo"
        users: dict[str, set[str]] = {}
        for t in tiles:
            users.setdefault(t["photo"], set()).add(t["slug"] + "@" + t["page"])
        for item_id in sorted(chosen):
            t = chosen[item_id]
            if len(users[t["photo"]]) > 1:
                skipped.append(f"{item_id}: photo {t['photo'].rsplit('/', 1)[-1]} is shown for {len(users[t['photo']])} different products "
                               f"({', '.join(sorted(users[t['photo']]))})")
                del chosen[item_id]

        for it in items:
            if it["id"] not in chosen and not any(x.startswith(it["id"] + ":") for x in skipped):
                skipped.append(f"{it['id']}: no tile on the menu pages carries this name")
        rows: dict[str, tuple[str, str]] = {}
        by_id = {it["id"]: it for it in items}
        for item_id in sorted(chosen):
            t = chosen[item_id]
            photo_url = SITE + urllib.parse.quote(t["photo"], safe="/%._-~")
            if args.dry_run:
                print(f"{item_id}: {by_id[item_id]['name']!r} = tile {t['name']!r} [{', '.join(t['labels']) or '-'}]  {photo_url}  <- {t['url']}")
                continue
            try:
                raw = ic.polite_get(photo_url, args.cache, delay=CRAWL_DELAY, referer=t["url"])
                rows[item_id] = (ic.store_image(CHAIN, raw), t["url"])
                print(f"  {item_id}: {rows[item_id][0]} <- {photo_url}")
            except ValueError as e:
                skipped.append(f"{item_id}: {photo_url}: {e}")
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:   # 401/403/429 are Blocked, above
                skipped.append(f"{item_id}: {photo_url}: could not fetch ({e})")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 2

    for s in skipped:
        print("skip:", s)
    look = sorted({chosen[i]["photo"].rsplit("/", 1)[-1] + " (" + i + ")" for i in (chosen if args.dry_run else rows)
                   if LOOK_AT.search(chosen[i]["photo"].rsplit("/", 1)[-1])})
    for x in look:
        print("LOOK BY EYE (design export / overlay / odd name):", x)
    if args.dry_run:
        print(f"{len(chosen)} of {len(items)} published items matched")
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
