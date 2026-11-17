#!/usr/bin/env python3
"""Item photos for Pepe's Piri Piri from its own website (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_pepes_piri_piri.py --cache DIR [--dry-run]

Source: https://pepes.co.uk/menu/ (the chain's own menu page; the nutrition data came from /nutrition-allergens-uk/, which
has no photos). Every menu entry is a block
    <div class="item" data-id="N"><div class="item-image"><img src="https://pepes.co.uk/wp-content/webp-express/..."></div>
      <div class="item-content"><h3 class="menu-item-title">NAME</h3> ... <div class="kcal"><strong>NNNkcal</strong></div>
i.e. one photo and one name per entry, on pepes.co.uk's own upload folder (the page's own <img src>, fetched as served).
The per-product pages (/menu/<slug>/ in the sitemap) answer 301 -> /menu, so they carry nothing more.

Match rule (exact, nothing fuzzy): a photo is attached to a published item only when the menu entry's title and the item's
name in the CURRENT items.csv are equal under images_common.norm_name, the entry has exactly ONE photo, the title is used
by exactly one menu entry, and exactly one published item has that name. The chain's menu names many dishes differently
from its nutrition page ("Fajita Wrap" vs "Chicken Fajita Wrap", "Gourmet Beef" vs "Gourmet Beef Burger - Single/Double",
"Pepe's Fries" vs "Fries - Regular/Large", "Chick'n'Rice" vs "Chick n Rice"): those get NO photo, as do sizes the menu entry
doesn't name (one "Tender Strips" photo is never pinned on the 3-piece or the 5-piece). The two dessert tiles ("Pepe's
Cakes", "Ben & Jerry's Ice Cream") are group title graphics and name no single published item.
A sanity check prints "CHECK" when the entry's kcal on the menu page differs from the item's published calories.

Full-size file (added 2026-11-17). Some entries show WordPress's 300 px "medium" copy of an upload (file name ends -300x133.png,
-300x177.png ...); two of them (Corn on the Cob 300x133, Mozzarella Sticks 300x177) were too small for store_image and got no photo.
For such a file the script asks the site's own WordPress media records, https://pepes.co.uk/wp-json/wp/v2/media?search=<file stem>
(the REST API the site itself serves; robots.txt allows it), and uses the record's original upload (source_url, e.g. .../2024/12/
595642072511cd93976b6a4e9a9efc3d.png, 800x354) ONLY when exactly one record lists the page's exact file name among its own sizes and
the original sits in the same upload folder on pepes.co.uk. That is the same photo the menu page shows (WordPress's "medium" size is
a proportional resize of the original, no crop), just not shrunk; otherwise the page's own file is used as before. images.csv still
records the menu page as the source.

Looked at and NOT used (2026-11-17):
- https://pepes.co.uk/our-food/ shows one dish-named picture, alt "Pepe's Garlic Mayo" (themes/pepes-2026/images/pepes-garlic-mayo.webp):
  a drawn pot lid printed "PEPE'S GARLIC MAYO" next to a yellow Pepe's logo heart, not a photo of the dip: left out. Its other pictures
  ("Chick'n'Rice Fan Favourite", "Hot Honey Rice Box", "Flamingly Good Chicken") name no published item or are promo graphics.
- The home page banner (2026/10/PepeOCOs-Melts-...-Banners-Static.jpg) is a promotional banner with lettering and no name: not used.
- The WordPress "menu" posts (/wp-json/wp/v2/menu, 55 records) are the same entries as the menu page plus five platter posts titled
  just "Solo", "Combo", "Family", "Mega" and "Wings" (not the nutrition page's "Solo (Serves 1)" etc.): no exact name, no photo.
- News posts (post-sitemap.xml) carry no dish-named photos.
- The chain's "Order Now" site https://pepes.3s-pos.com/ (its POS vendor's ordering app): its robots.txt (Cloudflare managed content,
  read 2026-11-17) has groups "User-agent: ClaudeBot / Disallow: /", "User-agent: anthropic-ai / Disallow: /" and "User-agent: Claude-Web /
  Disallow: /" and "Content-Signal: search=yes,ai-train=no,use=reference" for *: an operator that names Anthropic's crawlers with
  Disallow: / is not used by us (as for other sources). Never fetched by this script.

Terms (re-read 2026-11-17, unchanged since 2026-10-07): the site has no general website-terms page (page-sitemap.xml lists none). The
footer on every page says "(c) Copyright Pepe's Piri Piri"; /terms-and-conditions-promotions-competitions-and-loyalty-programs/ only
covers promotions and entry material ("The participant transfers all current and future intellectual property rights and other rights to
the entry material explicitly and unconditionally to Pepe's"); /privacy-policy/ and /customer-services/ say nothing about images or
content. No express ban on copying images was found. Installed on the founder's decision of 2026-10-06 (the founder's accepted risk).
robots.txt (re-read 2026-11-17): "User-agent: * / Disallow: /wp-admin/ / Allow: /wp-admin/admin-ajax.php / Sitemap: .../sitemap_index.xml";
no group names an AI crawler. polite_get checks it on every URL, at 1 request/second.

--dry-run fetches the menu page and the media records (JSON), never a photo, and writes nothing.
A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "pepes-piri-piri"
SITE = "https://pepes.co.uk"
MENU_URL = f"{SITE}/menu/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
PHOTO_PREFIX = f"{SITE}/wp-content/"      # the chain's own upload folder: nothing else is accepted as a photo
SKIP_FILES: dict[str, str] = {}           # photo file name -> why it is not used (nutrition text, placeholder...)

SECTION = re.compile(r'<section id="([^"]+)"[^>]*class="[^"]*\bcollection\b[^"]*"[^>]*>(.*?)</section>', re.S)
ITEM = re.compile(r'<div class="item" data-id="(\d+)">(.*?)(?=<div class="item" data-id="|\Z)', re.S)
ITEM_IMAGE = re.compile(r'<div class="item-image">(.*?)</div>', re.S)
IMG_SRC = re.compile(r'<img\b[^>]*?\bsrc="([^"]+)"', re.S)
TITLE = re.compile(r'<h3 class="menu-item-title">(.*?)</h3>', re.S)
KCAL = re.compile(r'<div class="kcal">\s*<strong>\s*([0-9]+)\s*kcal', re.S)
WXH = re.compile(r"-(\d+)x(\d+)\.[a-z.]+$", re.I)   # WordPress size suffix, e.g. ...-300x133.png.webp
UPLOADS = f"{SITE}/wp-content/uploads/"
WEBP_EXPRESS = f"{SITE}/wp-content/webp-express/webp-images/doc-root/wp-content/uploads/"
SIZED = re.compile(r"^(?P<dir>\d{4}/\d{2})/(?P<stem>[^/]+?)-(?P<w>\d+)x(?P<h>\d+)\.(?P<ext>png|jpe?g|webp)$", re.I)
MEDIA_SEARCH = f"{SITE}/wp-json/wp/v2/media?search={{stem}}&per_page=100"


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ").split())


def upload_path(photo: str) -> str | None:
    """'2024/12/<file>-300x133.png' for a page photo on the uploads folder (served as is, or as webp-express's .webp copy)."""
    if photo.startswith(WEBP_EXPRESS) and photo.endswith(".webp"):
        rest = photo[len(WEBP_EXPRESS):-len(".webp")]
        return rest if re.search(r"\.(png|jpe?g)$", rest, re.I) else None
    if photo.startswith(UPLOADS):
        return photo[len(UPLOADS):]
    return None


def full_size(photo: str, cache) -> tuple[str, str]:
    """(url to download, note). For a WordPress sized copy, the original upload of the SAME media record, found through the site's
    own media API: exactly one record must list the page's exact file name among its sizes, and its original must be in the same
    upload folder on pepes.co.uk. Anything else: the page's own file, unchanged."""
    path = upload_path(photo)
    m = SIZED.match(path or "")
    if not m:
        return photo, ""
    page_file = path.rsplit("/", 1)[-1]
    records = json.loads(ic.polite_get(MEDIA_SEARCH.format(stem=m.group("stem")), cache, accept="application/json"))
    hits = [r for r in records if isinstance(r, dict)
            and any(s.get("file") == page_file for s in ((r.get("media_details") or {}).get("sizes") or {}).values())]
    if len(hits) != 1:
        return photo, f"media API: {len(hits)} records list {page_file}; page file used"
    src = hits[0].get("source_url") or ""
    if not (src.startswith(UPLOADS + m.group("dir") + "/") and src.rsplit("/", 1)[-1].startswith(m.group("stem") + ".")):
        return photo, f"media API original {src!r} is not {m.group('dir')}/{m.group('stem')}.*; page file used"
    md = hits[0].get("media_details") or {}
    return src, f"original of media record {hits[0].get('id')} ({md.get('width')}x{md.get('height')}) instead of {page_file}"


def menu_entries(page: str) -> list[dict]:
    """Every entry of the menu page's collections: data-id, section, title, photos (all <img> in the entry's photo box), kcal."""
    page = re.sub(r"<!--.*?-->", "", page, flags=re.S)      # only live markup counts
    out: list[dict] = []
    for sec_id, body in SECTION.findall(page):
        for data_id, blk in ITEM.findall(body):
            t = TITLE.search(blk)
            box = ITEM_IMAGE.search(blk)
            kc = KCAL.search(blk)
            out.append({
                "id": data_id, "section": sec_id,
                "title": clean(t.group(1)) if t else "",
                "photos": [html.unescape(u) for u in IMG_SRC.findall(box.group(1))] if box else [],
                "kcal": kc.group(1) if kc else None,
            })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path, help="cache dir for the page and photos (reruns fetch nothing twice)")
    ap.add_argument("--dry-run", action="store_true", help="print the matches; fetch only the menu page, write nothing")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_name: dict[str, list[dict]] = {}
    for it in items:
        by_name.setdefault(ic.norm_name(it["name"]), []).append(it)

    skipped: list[str] = []
    try:
        page = ic.polite_get(MENU_URL, args.cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    except ic.Blocked as e:
        print(f"BLOCKED, stopping (nothing written): {e}", file=sys.stderr)
        return 1
    entries = menu_entries(page)
    if not entries:
        print(f"no menu entries found on {MENU_URL}: the page layout changed; nothing written", file=sys.stderr)
        return 1
    print(f"{len(entries)} menu entries on {MENU_URL}")

    title_count: dict[str, int] = {}
    for e in entries:
        title_count[ic.norm_name(e["title"])] = title_count.get(ic.norm_name(e["title"]), 0) + 1

    # item id -> (photo url, entry); one entry per item after the checks below
    found: dict[str, tuple[str, dict]] = {}
    for e in entries:
        key = ic.norm_name(e["title"])
        its = by_name.get(key)
        if not its:
            skipped.append(f"menu entry {e['title']!r} ({e['section']}, data-id {e['id']}) names no published item exactly")
            continue
        if len(its) > 1:
            skipped.append(f"menu entry {e['title']!r}: {len(its)} published items have this name")
            continue
        if title_count[key] > 1:
            skipped.append(f"{its[0]['id']}: {title_count[key]} menu entries are titled {e['title']!r}; ambiguous")
            continue
        if len(e["photos"]) != 1:
            skipped.append(f"{its[0]['id']}: menu entry {e['title']!r} has {len(e['photos'])} photos")
            continue
        photo = e["photos"][0]
        if not photo.startswith(PHOTO_PREFIX):
            skipped.append(f"{its[0]['id']}: photo {photo} is not on the chain's own upload folder")
            continue
        fname = photo.rsplit("/", 1)[-1]
        if fname in SKIP_FILES:
            skipped.append(f"{its[0]['id']}: {fname} skipped: {SKIP_FILES[fname]}")
            continue
        found[its[0]["id"]] = (photo, e)

    by_id = {it["id"]: it for it in items}
    rows: dict[str, tuple[str, str]] = {}
    for item_id, (photo, e) in sorted(found.items()):
        item = by_id[item_id]
        notes = []
        if e["kcal"] is not None and str(item.get("calories", "")).strip() != e["kcal"]:
            notes.append(f"CHECK menu page says {e['kcal']} kcal, nutrition page {item.get('calories')} kcal")
        try:
            url, why = full_size(photo, args.cache)
        except ic.Blocked as ex:
            print(f"BLOCKED, stopping (nothing written): {ex}", file=sys.stderr)
            return 1
        except (ValueError, urllib.error.URLError) as ex:   # unreadable media record: keep the page's own file
            url, why = photo, f"media API lookup failed ({ex}); page file used"
        if why:
            notes.append(why)
        m = WXH.search(url)
        if m and min(int(m.group(1)), int(m.group(2))) < ic.MIN_SIDE:
            notes.append(f"small file ({m.group(1)}x{m.group(2)}): store_image may reject it as too small")
        if args.dry_run:
            print(f"{item_id}: {item['name']!r} <- menu entry {e['title']!r}\n    photo {url}\n    page  {MENU_URL}"
                  + "".join(f"\n    {n}" for n in notes))
            continue
        for n in notes:
            print(f"  {item_id}: {n}")
        try:
            raw = ic.polite_get(url, args.cache, referer=MENU_URL)
            rows[item_id] = (ic.store_image(CHAIN, raw), MENU_URL)
        except ic.Blocked as ex:
            print(f"BLOCKED, stopping (nothing written): {ex}", file=sys.stderr)
            return 1
        except (ValueError, urllib.error.URLError) as ex:
            skipped.append(f"{item_id}: {photo}: {ex}")

    for s in skipped:
        print("no photo:", s)
    if args.dry_run:
        print(f"{len(found)} of {len(items)} published items matched")
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
        print(f"  CHECK BY EYE (used by {len(ids)} items): {f}: {', '.join(ids)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
