#!/usr/bin/env python3
"""Item photos for Benugo from its own online ordering menus (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_benugo.py [--cache DIR] [--pages DIR] [--dry-run]

Source: the three ordering pages the nutrition data came from (https://api.getspoonfed.com/262/benugo/menus/?c=1310 Lunch,
?c=1309 Breakfast, ?c=1315 Cakes & Snacks; linked from benugo.com/order-online "Order now"). Each product record on those
pages carries ONE photo of itself: <img src="https://spoonimg.imgix.net/262/images/menuitem/<file>?auto=format&w=180&h=180&fit=crop..."
alt="<product name>"> inside the same record as the product's name, price and kcal line. The page's URL asks the image host for a
180 px CROPPED thumbnail; we drop those query parameters and fetch the ORIGINAL upload (same path), because we never use a crop,
and let store_image do the only change (downsize to <= 640 px, WebP).

Match rule: a photo is attached to a published item only when the SAME product record carries the photo, the item's name (the
record's printed name after benugo.py's own tidy-up: "(v)"/"(vg)" marker removed, RENAMES applied: norm_name equality with the
item's name in the CURRENT items.csv), a kcal line equal to the item's calories, and an <img alt> equal to the printed name. If
one published name has records with different photos, or the same photo file belongs to records of different names, the item gets
no photo (ambiguous). Nothing is matched by file name, section or similarity.

Pages: read from --pages (the saved copies benugo.py was built from) when given; otherwise each page is fetched ONCE (robots.txt
of api.getspoonfed.com prints "Crawl-delay: 2": we wait 5 s). The photos come from spoonimg.imgix.net (robots.txt: "Disallow:"
nothing), one per second, cached.

Terms (https://www.benugo.com/terms-conditions/, "Intellectual Property", read 2026-10-08): "All rights, including copyright and
intellectual property rights, in and to this website including all graphics, photographs, text, artwork, logos, trademarks ... are
owned by or licensed to Benugo ... you can use the content from this website for your own personal use, but you may not use any
content on your own website or in any other public or commercial manner. If you want to do this, you must get our prior written
consent." Installed on the founder's decision of 2026-10-06 (CLAUDE.md rule 2; the founder's accepted risk).
robots.txt: www.benugo.com disallows only /wp/wp-admin/; api.getspoonfed.com "Crawl-delay: 2" and no Disallow; spoonimg.imgix.net
"Disallow:" (nothing).

A 401/403/429 or a robots refusal stops the script (exit 1) before anything is written.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import benugo as bg  # noqa: E402  (the page reader and the naming rules the data was built with)
import tenkites_c as tk  # noqa: E402
from images_common import (  # noqa: E402
    Blocked, load_items, norm_name, polite_get, store_image, suspected_placeholders, write_images_csv,
)

CHAIN_ID = "benugo"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
DEFAULT_CACHE = Path("/tmp/menumacros-images-benugo")
IMG_HOST = "spoonimg.imgix.net"
KCAL_NUM = re.compile(r"^(\d+)\s*kcal", re.I)

# Looked at on a contact sheet (2026-10-08) and left out: the photo does not clearly show the ONE named item. A rerun must not bring them back.
_SNACK_RANGE = ("one banner of all six Benugo snack packs (jelly beans, fruit & nut, mango chunks, peanuts & cashews, yoghurt cranberries, "
                "BBQ corn & almonds), not a photo of this snack")
_BLOOMER_GENERIC = "one generic photo of two bloomer sandwiches that the page gives to five different fillings, so it does not show this one"
_TWO_DISHES = "one photo that the page gives to two different dishes, so it does not show either one"
_POT_BOARD = "one board of several different pots that the page gives to two different pots, so it does not show this one"
EXCLUDE = {
    "bio-and-me-nice-and-nutty-porridge": "the chain's photo is a multi-pack of several porridge flavours, not this pot",
    "bio-and-me-spiced-apple-porridge-pot": "the chain's photo is a multi-pack of several porridge flavours, not this pot",
    "benugo-bbq-corn-and-smoky-almonds": _SNACK_RANGE, "benugo-dried-mango-chunks": _SNACK_RANGE, "benugo-fruit-and-nut-mix": _SNACK_RANGE,
    "benugo-honey-roast-peanuts-and-cashews": _SNACK_RANGE, "benugo-jelly-beans": _SNACK_RANGE, "benugo-yoghurt-cranberries": _SNACK_RANGE,
    "cheddar-cheese-salad-bloomer": _BLOOMER_GENERIC, "chicken-and-avocado-bloomer": _BLOOMER_GENERIC,
    "free-range-egg-mayonnaise-and-sunblush-tomato-bloomer": _BLOOMER_GENERIC, "honey-ham-hock-cheese-and-salad-bloomer": _BLOOMER_GENERIC,
    "tuna-mayonnaise-capers-and-rocket-bloomer": _BLOOMER_GENERIC,
    # one photo that the page gives to two DIFFERENT dishes (not a with/without-chicken or size pair of one dish): it cannot show both
    "harissa-chicken-wrap": _TWO_DISHES, "spiced-chicken-and-chickpea-wrap": _TWO_DISHES,
    "hot-smoked-salmon-salad-bowl": _TWO_DISHES, "plant-power-salad-bowl": _TWO_DISHES,
    "smoked-salmon-and-creme-fraiche-quiche-box": _TWO_DISHES, "west-country-cheddar-and-smoked-bacon-quiche-box": _TWO_DISHES,
    "vegan-box": _TWO_DISHES, "veggie-box": _TWO_DISHES,
    "blueberry-and-pistachio-yoghurt-pot": _POT_BOARD, "vegan-raspberry-and-almond-bircher-pot": _POT_BOARD,
}


def product_records(fname: str, page_html: str) -> list[dict]:
    """Every product record on one ordering page with its name, kcal line, photo and the photo's alt text."""
    root = tk.parse_html(page_html)
    out = []
    for menu in root.find_all(cls="menu-item-wapper"):
        for sec in menu.find_all(cls="menusection"):
            for it in sec.find_all(cls="mod-item"):
                name_node = it.find(cls="product-name")
                if name_node is None:
                    continue
                printed = name_node.text()
                desc = it.find(cls="desc")
                lis = desc.find_all(tag="li") if desc else []
                energy = [li.text() for li in lis if li.has("energy-info")]
                imgs = it.find_all(tag="img")
                if len(imgs) > 1:
                    raise SystemExit(f"{fname}: {printed!r} has several images in one product record: read the page")
                photo = alt = ""
                if imgs:
                    src = urllib.parse.urlsplit(imgs[0].attrs.get("src", ""))
                    if src.netloc != IMG_HOST or "/images/menuitem/" not in src.path:
                        raise SystemExit(f"{fname}: {printed!r}: unexpected image {imgs[0].attrs.get('src')!r}")
                    # the ORIGINAL upload: no crop/size parameters
                    photo = urllib.parse.urlunsplit((src.scheme, src.netloc, src.path, "", ""))
                    alt = imgs[0].attrs.get("alt", "")
                m = KCAL_NUM.match(energy[0]) if energy else None
                out.append({"file": fname, "printed": printed, "kcal": m.group(1) if m else "", "photo": photo, "alt": alt})
    return out


def published_name(fname: str, printed: str) -> str:
    return bg.RENAMES.get((fname, printed)) or tk.tidy_case(bg.MARKER.sub("", printed).strip())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--pages", type=Path, default=None, help="folder with the saved ordering pages (names as in benugo.PAGES); otherwise they are fetched once")
    ap.add_argument("--dry-run", action="store_true", help="match and report only; store nothing, write no CSV")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    by_key: dict[str, list[dict]] = {}
    for it in items:
        by_key.setdefault(norm_name(it["name"]), []).append(it)

    try:
        records = []
        for fname, url in bg.PAGES.items():
            if args.pages:
                page = (args.pages / fname).read_text(encoding="utf-8", errors="replace")
            else:
                page = polite_get(url, args.cache, delay=5.0, accept=HTML_ACCEPT).decode("utf-8", "replace")
            records += [dict(r, page_url=url) for r in product_records(fname, page)]
        print(f"{len(records)} product records on {len(bg.PAGES)} pages; "
              f"{sum(1 for r in records if r['photo'])} carry a photo, {sum(1 for r in records if r['kcal'])} print a kcal line")

        # item -> candidate (photo, page) from records that carry name + kcal + photo
        cands: dict[str, set[tuple[str, str]]] = {}
        file_names: dict[str, set[str]] = {}
        for r in records:
            if not (r["photo"] and r["kcal"]):
                continue
            if norm_name(r["alt"]) != norm_name(r["printed"]):
                print(f"  alt differs from the printed name, skipped: {r['printed']!r} / {r['alt']!r}")
                continue
            name = published_name(r["file"], r["printed"])
            hits = [it for it in by_key.get(norm_name(name), []) if it["calories"] == r["kcal"]]
            if len(hits) != 1:
                continue
            cands.setdefault(hits[0]["id"], set()).add((r["photo"], r["page_url"]))
            file_names.setdefault(r["photo"], set()).add(hits[0]["id"])

        chosen: dict[str, tuple[str, str]] = {}
        for item_id, opts in cands.items():
            photos = {p for p, _ in opts}
            if len(photos) != 1:
                print(f"  ambiguous (several photos for one item), no photo: {item_id}")
                continue
            if item_id in EXCLUDE:
                print(f"  excluded after looking ({EXCLUDE[item_id]}): {item_id}")
                continue
            chosen[item_id] = sorted(opts)[0]
        # A photo file that several different published items share is allowed only when the records are variants of one product;
        # we cannot tell that from the page, so such files are listed for the eyes-on check below (suspected_placeholders).

        rows: dict[str, tuple[str, str]] = {}
        skipped: list[str] = []
        for item_id, (photo, page_url) in sorted(chosen.items()):
            try:
                raw = polite_get(photo, args.cache, referer=page_url)
                if args.dry_run:
                    rows[item_id] = (hashlib.sha256(raw).hexdigest()[:12] + ".webp", page_url)
                else:
                    rows[item_id] = (store_image(CHAIN_ID, raw), page_url)
            except ValueError as e:
                skipped.append(f"{item_id}: {e}")
            except Blocked:
                raise
    except Blocked as e:
        print(f"BLOCKED: {e}. Stopping without writing anything.", file=sys.stderr)
        return 1
    except Exception as e:  # a plain HTTP error (404 on one photo is not a block, but we stop to look)
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    print(f"{len(rows)} of {len(items)} published items matched a photo from their own product record")
    for s in skipped:
        print("  not stored:", s)
    for fname, ids in suspected_placeholders(rows).items():
        print(f"  CHECK by eye: {fname} used by {len(ids)} items: {ids}")
    without = [it["name"] for it in items if it["id"] not in rows]
    print(f"{len(without)} items without a photo: {without}")
    if args.dry_run:
        return 0
    write_images_csv(CHAIN_ID, rows)
    total = sum(p.stat().st_size for p in (Path(__file__).resolve().parents[2] / "web/public/menu-images" / CHAIN_ID).glob("*.webp"))
    print(f"stored {len(set(f for f, _ in rows.values()))} files, {total/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
