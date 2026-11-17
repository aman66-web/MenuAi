#!/usr/bin/env python3
"""Item photos for Notcutts (restaurants in the garden centres) (docs/UK_DATA_PLAYBOOK.md, Phase 4).

    python3 tools/uk_extract/images_notcutts.py --cache DIR [--dry-run]

Source: https://www.notcutts.co.uk/restaurants/sample-menu (robots.txt read 2026-10-08: "User-agent: *" disallows /*?, /skin/,
/catalog/..., /checkout/ and similar shop paths; neither this page nor /media/wysiwyg/ is disallowed).
The page shows a few "new on the menu" cards. Each card is one page-builder column holding the dish photo and, in the same column, the
dish's name, price and "NNN kcal". A photo is attached to a published item only when the card's name equals the item's name
(norm_name) AND the card's calories equal the item's calories (a second check that it is the same dish). Nothing else on the site is used:
the /restaurants page and the breakfast-for-two banner carry photos whose text does not name one dish ("Choose from a Gardener's
Breakfast Platter, Vegetarian Breakfast Platter or Vegan Breakfast Platter"), the Flatbreads picture is the page banner, so those are
left out. Held-back rows (holdback.csv) are never published, so they get no photo.

Terms (https://www.notcutts.co.uk/terms-and-conditions/, section 23, read 2026-10-08): "23.4 ... no part of the Website may be reproduced
or stored in any other website or included in any public or private electronic retrieval system or service without our prior written
permission." and "23.3 Unless otherwise stated, the copyright and other intellectual property rights in all material on the Website
(including without limitation photographs and graphical images) are owned by us or our licensors." Installed under the founder's
decision of 2026-10-06 (accepted risk); the chain's photos come down the day it asks (delete the folder + images.csv). Re-read 2026-11-17:
clauses 23.3 and 23.4 unchanged.

Run of 2026-11-17: the page has moved to the Autumn/Winter 2026 menu and its card layout changed (the dish name is now an <h2>, read
below; a card without one falls back to its first text line). Its three cards: "Homemade pie of the day" ("From 1008kcal": a lowest
figure, so not a card), "Cumberland sausages & mash" 1065 kcal (no published item: our figures are the SS26 menus) and "Crispy chicken &
bacon salad" 648 kcal (our item, from SS26, prints 650 kcal: a different version of the dish, so no photo). 0 new matches. The AW26 menu
PDFs the page now links (breakfast, lunch, children's, drinks, festive) were looked at too: their photos carry no caption naming a dish
(the breakfast photo is a "2 for £18.95" offer panel), so none is used. The three photos of 2026-10-08 (bacon-and-cheese-burger,
oriental-rice-noodle-salad, welsh-rarebit-and-poached-egg) show those SS26 dishes, which are still the published ones, so they are KEPT
although the page no longer shows them: a run with no new match leaves images.csv and the files exactly as they are. (If a later run does
match new cards, the kept rows are written again with the new rows; write_images_csv gives every row that run's date.)
robots.txt re-read 2026-11-17: no group names an AI crawler (the script stops if one ever does); /restaurants/ and /media/ are allowed.
"""
from __future__ import annotations

import argparse
import csv
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from images_common import (Blocked, ROOT, load_items, norm_name, polite_get, store_image,  # noqa: E402
                           suspected_placeholders, write_images_csv)

CHAIN_ID = "notcutts"
PAGE_URL = "https://www.notcutts.co.uk/restaurants/sample-menu"
PHOTO_PREFIX = "https://www.notcutts.co.uk/media/wysiwyg/cms-page/sample-menu/"

_COLUMN = re.compile(r'<div class="pagebuilder-column[ "]')
_IMG = re.compile(r'<img[^>]+src="([^"]+)"')
_P = re.compile(r"<p[^>]*>(.*?)</p>", re.S)
_H2 = re.compile(r"<h2[^>]*>(.*?)</h2>", re.S)
_KCAL = re.compile(r"^(\d+)\s*kcal$", re.I)


def _text(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def page_cards(page: str) -> list[dict]:
    """The cards of the page: {name, kcal, photo}. A card = one column with a sample-menu photo, a first text line (the dish name) and
    a line that is exactly 'NNN kcal'."""
    cards = []
    for col in _COLUMN.split(page)[1:]:
        col = col[:8000]
        photos = {u for u in _IMG.findall(col) if u.startswith(PHOTO_PREFIX)}
        lines = [t for t in (_text(p) for p in _P.findall(col)) if t]
        kcal = [int(m.group(1)) for t in lines if (m := _KCAL.match(t))]
        h2 = [t for t in (_text(h) for h in _H2.findall(col)) if t]
        name = h2[0] if h2 else (lines[0] if lines else "")
        if len(photos) == 1 and kcal and name:
            cards.append({"name": name, "kcal": kcal[0], "photo": next(iter(photos))})
    return cards


def check_robots(cache: Path) -> None:
    """Stops if robots.txt names an Anthropic agent (the owner's refusal); polite_get applies the `*` rules to every URL."""
    text = polite_get("https://www.notcutts.co.uk/robots.txt", cache, accept="text/plain,*/*;q=0.8").decode("utf-8", "replace")
    for line in text.splitlines():
        if line.split("#", 1)[0].strip().lower().startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip().lower()
            if any(w in agent for w in ("claude", "anthropic")):
                raise Blocked(f"robots.txt has a group for {agent!r}: the owner refuses Anthropic's agents; stopped")


def kept_rows(published: set[str]) -> dict[str, tuple[str, str]]:
    """The rows of the current images.csv whose item is still published and whose file is still there (photos kept from earlier runs)."""
    path = ROOT / "data" / "source" / CHAIN_ID / "images.csv"
    if not path.exists():
        return {}
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["item_id"] in published and (ROOT / "web" / "public" / "menu-images" / CHAIN_ID / r["file"]).exists():
                out[r["item_id"]] = (r["file"], r["source_url"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--dry-run", action="store_true", help="list the matches and stop: no photo is downloaded or stored")
    args = ap.parse_args()

    items = load_items(CHAIN_ID)
    try:
        check_robots(args.cache)
        page = polite_get(PAGE_URL, args.cache, accept="text/html").decode("utf-8", "replace")
    except Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing is written.")
        return 2
    kept = kept_rows({i["id"] for i in items})
    print(f"{len(kept)} photos kept from earlier runs: {', '.join(sorted(kept))}")
    cards = page_cards(page)
    print(f"{len(cards)} dish cards with a photo on {PAGE_URL}")
    by_name: dict[str, list[dict]] = {}
    for c in cards:
        by_name.setdefault(norm_name(c["name"]), []).append(c)

    matches: dict[str, str] = {}
    for it in items:
        found = by_name.get(norm_name(it["name"]), [])
        if len(found) != 1:
            continue
        card = found[0]
        if str(card["kcal"]) != str(it["calories"]).strip():
            print(f"  SKIPPED {it['id']}: card says {card['kcal']} kcal, item has {it['calories']}")
            continue
        matches[it["id"]] = card["photo"]
    unmatched = [c["name"] for c in cards if norm_name(c["name"]) not in {norm_name(i["name"]) for i in items}]
    print(f"{len(matches)} of {len(items)} published items match a card")
    for item_id, url in matches.items():
        print(f"  {item_id}  <-  {url}")
    for name in unmatched:
        print(f"  card with no published item of that name: {name}")
    new = {k: v for k, v in matches.items() if k not in kept}
    if args.dry_run:
        print(f"dry run: nothing downloaded ({len(new)} new)")
        return 0
    if not new:
        print("no new match: images.csv and the stored photos are left exactly as they are")
        return 0

    rows: dict[str, tuple[str, str]] = dict(kept)
    try:
        for item_id, url in new.items():
            try:
                raw = polite_get(url, args.cache, referer=PAGE_URL)
                rows[item_id] = (store_image(CHAIN_ID, raw), PAGE_URL)
            except ValueError as e:
                print(f"  not stored {item_id}: {e}")
    except Blocked as e:
        print(f"BLOCKED: {e}\nStopped: nothing is written and no photo is installed.")
        return 2
    write_images_csv(CHAIN_ID, rows)
    total = sum(p.stat().st_size for p in (ROOT / "web" / "public" / "menu-images" / CHAIN_ID).glob("*.webp"))
    print(f"stored {len(rows)} of {len(items)} items; {len({f for f, _ in rows.values()})} files, {total / 1024:.0f} KB")
    for f, ids in suspected_placeholders(rows).items():
        print(f"  SHARED by {len(ids)} items: {f} {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
