#!/usr/bin/env python3
"""Item photos for Blank Street (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers: images_common.py).

    python3 tools/uk_extract/images_blank_street_coffee.py --cache DIR --dry-run   # read the menu, list matches, download no photo
    python3 tools/uk_extract/images_blank_street_coffee.py --cache DIR             # download, store, write images.csv

Source: the chain's own UK menu page https://www.blankstreet.com/en-GB/menu (the page whose "Allergens" link is the allergen-guide PDF
data/source/blank-street-coffee is built from). The page is a Next.js page: its embedded __NEXT_DATA__ names the menu it shows
(section type "menu", props.dataFile "menu-uk"), and the menu itself is a JSON object in one of the page's own script files
(/_next/static/chunks/<n>-<hash>.js, the `"menu-uk":JSON.parse('...')` entry), read here with plain HTTP (no browser). Each product of
that menu is one card on the page: {"name": "Toasted s’mores hojicha", "imageSrc": ..., "temps": ["Iced", "Hot"], "tempImages":
{"Iced": <photo>, "Hot": <photo>}}; the card's Iced / Hot switch shows the photo of that temperature. The photo address is the one the
page's <img src> uses: https://res.cloudinary.com/blank-street/f_auto,w_750,q_auto/<imageSrc> (the chain's own Cloudinary account; never
the larger w_1440 rendition, because Cloudinary's `w_` alone scales UP when the original is smaller). On 2026-11-17 the page had 16 cards,
14 of them with an Iced / Hot switch (30 photos). The US menu in the same script file is a different menu and is never used.

Match rule (a card's photo goes only to items that are the same product and the same variant; nothing fuzzy):
- the item's name, with a trailing size "(small)" / "(large)" and the temperature ("Iced X", "Hot X" or "X (hot, small)") taken off, must
  equal the card's name (norm_name equality);
- for a card with an Iced / Hot switch the item's temperature must be the photo's variant; for a card without a switch the item must carry
  no temperature in its name;
- small and large of one drink share the card's photo (the page shows one photo per drink and temperature; it names no size);
- a photo the page shows for two different cards or temperatures (the same bytes) goes to none of them: one of them is not that drink and
  the page does not say which. On 2026-11-17: the hot Blondie latte and the hot Cinnamon bun latte (as on 2026-10-08), the hot Toasted
  s’mores matcha and the hot Sticky toffee pudding matcha, the hot Toasted s’mores latte and the hot Sticky toffee pudding latte. The same
  photograph re-cut or re-graded counts too (found by eye on the contact sheets, so listed in EXCLUDE): the hot Blondie matcha, hot Cinnamon
  bun matcha and (2026-10-08) hot Harvest chai matcha share one photograph, and the 2026-10-08 hot Harvest chai latte photo is the photograph
  the hot Blondie latte and hot Cinnamon bun latte share.
Not matched, on purpose: "Shaken vanilla bean cold brew" (our guide's item is "Shaken Vanilla Bean Cold Brew Latte"), "Sticky toffee pudding
matcha" / "Sticky toffee pudding latte" (the guide's items are "Sticky Toffee Matcha" / "Sticky Toffee Latte": not the same name), items
whose names carry more than a size or temperature in brackets ("(signature ice cream)", "(dark chocolate sauce, hot)"), and every pastry,
tea, ice cream and plain coffee (the page shows no photo for them).

Earlier rows: a row of images.csv matched by an earlier run of this same rule (the photo looked at then) stays when today's page shows no
card for that product and temperature (the seasonal menu moves on: on 2026-10-08 the page had Harvest chai latte, Harvest chai matcha and
Strawberry shortcake matcha cards, gone on 2026-11-17 while the Winter 2026 guide still lists the drinks). It is dropped when the item is
no longer published, is in EXCLUDE, its file is missing, today's page has a card for that product and temperature (today's page decides),
or today's page shows the same photo for a different card. write_images_csv stamps one retrieved_on date on every row.

robots.txt (read 2026-11-17): https://www.blankstreet.com/robots.txt answers 404 (no rules); https://res.cloudinary.com/robots.txt has no
rule (every line is a comment). polite_get checks robots.txt on every URL (RFC 9309) and stops on 401/403/429.
Terms (https://www.blankstreet.com/en-GB/tos, "Last Updated: June 23, 2022", read 2026-11-17), section 11 "Limitations on Platform Use":
"The Platform and Platform Content may not be used, modified, reproduced, duplicated, copied, published, distributed, downloaded, sold,
resold, transformed, redesigned, reconfigured, retransmitted, or otherwise exploited by you for any purpose except either (a) in accordance
with the features and functionality generally made available by us to users of the Platform, or (b) with the express prior written consent
of Blank Street or the applicable third-party owner"; "Platform Content" includes "images, photos"; and a user may not "Use a robot, spider,
manual and/or automatic processes, or devices to data-mine, data-crawl, scrape or index the Platform in any manner." An express
restriction; photos installed on the founder's decision of 2026-10-06 (his accepted risk).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN_ID = "blank-street-coffee"
HOST = "https://www.blankstreet.com"
MENU_URL = f"{HOST}/en-GB/menu"
IMG_BASE = "https://res.cloudinary.com/blank-street/f_auto,w_750,q_auto/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

# Item ids never given a photo (each reason was checked by eye or in the bytes), e.g. {"item-id": "why"}. A rerun can't bring them back.
_SAME_PHOTO = ("the page serves byte-identical photo files for the hot Blondie latte and the hot Cinnamon bun latte (2026-10-08 and again "
               "2026-11-17): one of the two is not that drink and the page does not say which, so neither gets it")
_SAME_LATTE = ("looked at 2026-11-17: the photo the page showed for the hot Harvest chai latte on 2026-10-08 is the same photograph (same "
               "latte art, same dusting; only the cut-out differs) as the file shared by the hot Blondie latte and hot Cinnamon bun latte: "
               "one photo for three different drinks, so none of them gets it")
_SAME_MATCHA = ("looked at 2026-11-17: the hot Blondie matcha, the hot Cinnamon bun matcha (its file is named 'Cinnamon_Bun_Harvest_Matcha') "
                "and the hot Harvest chai matcha of 2026-10-08 are one photograph (identical latte art and dusting; only the colour grading "
                "and the cut-out differ): one photo for three different drinks, so none of them gets it")
EXCLUDE: dict[str, str] = {
    "hot-blondie-latte-small": _SAME_PHOTO, "hot-blondie-latte-large": _SAME_PHOTO,
    "hot-cinnamon-bun-latte-small": _SAME_PHOTO, "hot-cinnamon-bun-latte-large": _SAME_PHOTO,
    "hot-harvest-chai-latte-small": _SAME_LATTE, "hot-harvest-chai-latte-large": _SAME_LATTE,
    "hot-blondie-matcha-small": _SAME_MATCHA, "hot-blondie-matcha-large": _SAME_MATCHA,
    "hot-cinnamon-bun-matcha-small": _SAME_MATCHA, "hot-cinnamon-bun-matcha-large": _SAME_MATCHA,
    "hot-harvest-chai-matcha-small": _SAME_MATCHA, "hot-harvest-chai-matcha-large": _SAME_MATCHA,
}


# ---------------------------------------------------------------- reading the page

def _js_string(s: str) -> str:
    """The text of a single-quoted JavaScript string literal's body (the page's JSON.parse('...') argument)."""
    def rep(m: re.Match) -> str:
        e = m.group(1)
        if e[0] == "u":
            return chr(int(e[1:], 16))
        if e[0] == "x":
            return chr(int(e[1:], 16))
        return {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}.get(e, e)
    return re.sub(r"\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)", rep, s, flags=re.S)


def read_menu(cache: Path) -> list[dict]:
    """The cards of the UK menu page: [{name, variant ('iced'/'hot'/None), src, url}] in page order."""
    page = ic.polite_get(MENU_URL, cache, accept=HTML_ACCEPT).decode("utf-8", "replace")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not m:
        raise SystemExit("menu page: no __NEXT_DATA__ (the page has changed: read it again by hand)")
    sections = json.loads(m.group(1))["props"]["pageProps"]["page"]["sections"]
    files = [s["props"]["dataFile"] for s in sections if s.get("type") == "menu"]
    if files != ["menu-uk"]:
        raise SystemExit(f"menu page: expected one menu section showing 'menu-uk', found {files} (read the page again by hand)")
    marker = '"menu-uk":JSON.parse(\''
    data = None
    for src in re.findall(r'<script src="(/_next/static/chunks/[^"]+)"', page):
        if re.search(r"/(polyfills|webpack|framework|main)-|/pages/_app-", src):
            continue
        js = ic.polite_get(HOST + src, cache, accept="*/*", referer=MENU_URL).decode("utf-8", "replace")
        i = js.find(marker)
        if i < 0:
            continue
        j = js.find("')", i + len(marker))
        data = json.loads(_js_string(js[i + len(marker):j]))
        break
    if data is None:
        raise SystemExit("menu page: no script file holds the 'menu-uk' menu (the site has changed: read it again by hand)")
    cards = []
    for p in data["products"]:
        temps = p.get("temps") or []
        timgs = p.get("tempImages") or {}
        if temps and timgs:
            for t in temps:
                cards.append({"name": p["name"], "variant": t.lower(), "src": timgs[t], "url": IMG_BASE + timgs[t]})
        else:
            cards.append({"name": p["name"], "variant": None, "src": p["imageSrc"], "url": IMG_BASE + p["imageSrc"]})
    return cards


# ---------------------------------------------------------------- matching

_SIZE = re.compile(r"\s*\((?:(hot|iced),\s*)?(small|large)\)\s*$", re.I)
_TEMP_PREFIX = re.compile(r"^(hot|iced)\s+", re.I)


def split_name(name: str) -> tuple[str, str | None, str] | None:
    """(base name, temperature or None, size) for items named like 'Iced X (small)', 'X (hot, large)', 'X (small)'; else None."""
    m = _SIZE.search(name)
    if not m:
        return None
    temp = m.group(1).lower() if m.group(1) else None
    size = m.group(2).lower()
    base = name[:m.start()]
    p = _TEMP_PREFIX.match(base)
    if p:
        if temp and temp != p.group(1).lower():
            return None
        temp = p.group(1).lower()
        base = base[p.end():]
    if "(" in base or ")" in base:
        return None
    return base, temp, size


def card_key(c: dict) -> tuple[str, str | None]:
    return ic.norm_name(c["name"]), c["variant"]


def match(cards: list[dict], items: list[dict], shared: set[tuple[str, str | None]]) -> tuple[dict[str, dict], list[str]]:
    """{item_id: card}, notes. `shared`: card keys whose photo the page also shows for another card or temperature."""
    notes: list[str] = []
    out: dict[str, dict] = {}
    parsed = {}
    for it in items:
        sp = split_name(it["name"])
        if sp:
            parsed[it["id"]] = (ic.norm_name(sp[0]), sp[1])
    for c in cards:
        key = card_key(c)
        label = f'{c["name"]} [{c["variant"] or "no switch"}]'
        hits = [it for it in items if parsed.get(it["id"]) == key]
        if not hits:
            notes.append(f"{label}: no published item with this name and variant")
            continue
        if key in shared:
            notes.append(f"{label}: the page shows the same photo for another card or temperature -> none of "
                         + ", ".join(it["id"] for it in hits))
            continue
        for it in hits:
            if it["id"] in EXCLUDE:
                notes.append(f"{it['name']}: excluded ({EXCLUDE[it['id']]})")
                continue
            if it["id"] in out:
                notes.append(f"{it['name']}: two cards claim it -> none")
                out.pop(it["id"])
                EXCLUDE[it["id"]] = "ambiguous"
                continue
            out[it["id"]] = c
    return out, notes


def earlier_rows(items: list[dict]) -> dict[str, tuple[str, str]]:
    """Rows of the current images.csv whose item is still published, not in EXCLUDE, and whose file exists: {item_id: (file, source_url)}."""
    path = ic.ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    published = {it["id"] for it in items}
    with open(path, newline="", encoding="utf-8-sig") as f:
        return {r["item_id"]: (r["file"], r["source_url"]) for r in csv.DictReader(f)
                if r["item_id"] in published and r["item_id"] not in EXCLUDE and (ic.IMAGES_ROOT / CHAIN_ID / r["file"]).is_file()}


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    items = ic.load_items(CHAIN_ID)
    names = {i["id"]: i["name"] for i in items}
    try:
        cards = read_menu(args.cache)
    except ic.Blocked as e:
        print(f"BLOCKED: {e}\nStopping: not worked round. Nothing was written.")
        return 3
    on_page = {card_key(c) for c in cards}
    print(f"{len(items)} published items; {len(cards)} card photos on the menu page ({len({c['name'] for c in cards})} cards)")

    # photos the page shows for more than one card or temperature: by address now, by bytes after downloading
    by_url: dict[str, set] = {}
    for c in cards:
        by_url.setdefault(c["url"], set()).add(card_key(c))
    shared = {k for ks in by_url.values() if len(ks) > 1 for k in ks}
    raw_by_key: dict[tuple, bytes] = {}
    if not args.dry_run:
        try:
            for c in cards:   # every card, matched or not: a photo shared with an unmatched card is still shared
                raw_by_key[card_key(c)] = ic.polite_get(c["url"], args.cache, referer=MENU_URL)
        except ic.Blocked as e:
            print(f"BLOCKED: {e}\nStopping: not worked round. Nothing was written to images.csv.")
            return 3
        by_hash: dict[str, set] = {}
        for k, raw in raw_by_key.items():
            by_hash.setdefault(hashlib.sha256(raw).hexdigest()[:12], set()).add(k)
        shared |= {k for ks in by_hash.values() if len(ks) > 1 for k in ks}
    matches, notes = match(cards, items, shared)
    for iid, c in sorted(matches.items()):
        print(f"  MATCH {names[iid]}  <-  {c['name']} [{c['variant'] or 'no switch'}]")
    for n in notes:
        print("  skip:", n)

    # earlier rows kept (see the docstring)
    parsed = {it["id"]: split_name(it["name"]) for it in items}
    page_files = {hashlib.sha256(raw).hexdigest()[:12] + ".webp": k for k, raw in raw_by_key.items()}
    carried: dict[str, tuple[str, str]] = {}
    for iid, (fname, src) in sorted(earlier_rows(items).items()):
        if iid in matches:
            continue
        sp = parsed.get(iid)
        if sp and (ic.norm_name(sp[0]), sp[1]) in on_page:
            print(f"  not carried: {iid}: today's page has a card for it (today's page decides)")
            continue
        if fname in page_files:
            print(f"  not carried: {iid}: today's page shows its photo {fname} for a different card {page_files[fname]}")
            continue
        carried[iid] = (fname, src)
        print(f"  carried from an earlier run: {names[iid]}  ({fname}, no card on today's page)")
    print(f"{len(matches)} items matched today, {len(carried)} carried from an earlier run")
    if args.dry_run:
        print("(dry run: no photo downloaded; photos shared by bytes are found on the real run)")
        return 0

    rows: dict[str, tuple[str, str]] = {}
    for iid, c in sorted(matches.items()):
        try:
            rows[iid] = (ic.store_image(CHAIN_ID, raw_by_key[card_key(c)]), MENU_URL)
        except ValueError as e:
            print(f"  {iid}: {e}, no photo")
    rows.update(carried)
    ic.write_images_csv(CHAIN_ID, rows)
    files = {f for f, _ in rows.values()}
    d = ic.IMAGES_ROOT / CHAIN_ID
    size = sum(p.stat().st_size for p in d.iterdir()) if d.is_dir() else 0
    print(f"stored {len(rows)} item photos in {len(files)} files, {size} bytes")
    for f, ids in ic.suspected_placeholders(rows).items():
        print(f"  shared by {len(ids)} items: {f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
