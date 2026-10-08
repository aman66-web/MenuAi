#!/usr/bin/env python3
"""Item photos for Franco Manca (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_franco_manca.py --cache <dir> [--dry-run]

Source: Franco Manca's own menu page, https://www.francomanca.co.uk/menu/ (the page data/source/franco-manca/chain.csv names as the
source of the calories). One request for the page, one per photo; the photos are the files that page shows
(https://www.francomanca.co.uk/wp-content/uploads/...), same host. robots.txt (checked 2026-10-08) only disallows /wp-json/ and
/?rest_route=. No Ten Kites / delivery-app / third-party host is involved.

Match rule (exact, nothing fuzzy): the menu page lays the larger dishes out as <div class="menu-grid__item"> holding one photo
(div.menu-grid__media > img) and one dish (div.menu-dish.menu-grid__copy > h3). The smaller lines (dips, ice creams, sorbet, wines,
cocktails, beers, coffees, soft drinks) are listed as text under "sub-category" headings WITHOUT a photo; they get none. A photo is
attached to a published item only when
  - the grid item names exactly one dish (its h3), and
  - that h3 equals (images_common.norm_name) the name the dish was published from: items.csv records it in `notes` as
    "Printed '<name>' [<kcal>kcal] ..." (the extractor franco_manca.py reads the same div.menu-dish), and
  - exactly one published item has that printed name and exactly one grid item prints it.
Nothing else is attached: the buffalo-mozzarella swap, variants and anything the page does not photograph have none.

Left out after looking at the photos (SKIP, with the reason):
  - Chocolate Mousse Cake: its file on the page is named "ChatGPT-Image-Jun-5-2026-...png", i.e. an AI-generated picture, not a photo.
  - Kids pizza with butternut squash: its grid item shows "Franco-Manca-Kids-New-Kids-Menu-Lifestyle-June-2026...jpg", a table scene (a white
    pizza with green and orange blobs, a drink, parts of two other pizzas) in which that pizza cannot be confirmed (see SKIP_FILES).
Photos are stored unmodified except for the downsizing to 640 px WebP done by images_common.store_image.
"""
from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import images_common as ic  # noqa: E402

CHAIN = "franco-manca"
PAGE = "https://www.francomanca.co.uk/menu/"
UPLOADS = "https://www.francomanca.co.uk/wp-content/uploads/"
# Page file (basename) -> why it is not used. Filled in after looking at the photos on a contact sheet.
SKIP_FILES: dict[str, str] = {
    "ChatGPT-Image-Jun-5-2026-11_43_17-AM-1.png": "AI-generated picture (file name says so), not a photo of the dish",
    "Franco-Manca-Kids-New-Kids-Menu-Lifestyle-June-202610222_WebRes.jpg": "table scene with several pizzas and a drink; the butternut squash pizza cannot be confirmed in it",
}


class GridReader(HTMLParser):
    """Collects (dish h3, photo src) for each div.menu-grid__item, with the number of dishes (div.menu-dish) inside it."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.items: list[dict] = []
        self._cur: dict | None = None
        self._depth = 0
        self._copy_depth: int | None = None
        self._in_h3 = False
        self._h3 = ""

    def handle_starttag(self, tag: str, attrs: list) -> None:
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        if tag == "div":
            if self._cur is None and "menu-grid__item" in cls:
                self._cur = {"names": [], "imgs": [], "dishes": 0}
                self.items.append(self._cur)
                self._depth = 0
            if self._cur is not None:
                self._depth += 1
                if "menu-dish" in cls:
                    self._cur["dishes"] += 1
                    if "menu-grid__copy" in cls:
                        self._copy_depth = self._depth
        elif self._cur is not None:
            if tag == "img" and a.get("src"):
                self._cur["imgs"].append(a["src"])
            elif tag == "h3" and self._copy_depth is not None:
                self._in_h3, self._h3 = True, ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "h3" and self._in_h3:
            self._in_h3 = False
            if self._cur is not None:
                self._cur["names"].append(" ".join(self._h3.split()))
        elif tag == "div" and self._cur is not None:
            if self._copy_depth == self._depth:
                self._copy_depth = None
            self._depth -= 1
            if self._depth == 0:
                self._cur = None

    def handle_data(self, data: str) -> None:
        if self._in_h3:
            self._h3 += data


def printed_name(notes: str) -> str | None:
    m = re.match(r"Printed '(.+?)' \[", notes or "")
    return m.group(1) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; download and store nothing except the menu page")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_printed: dict[str, list[dict]] = {}
    for it in items:
        p = printed_name(it.get("notes", ""))
        if p:
            by_printed.setdefault(ic.norm_name(p), []).append(it)

    html = ic.polite_get(PAGE, args.cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
    reader = GridReader()
    reader.feed(html)

    grid: dict[str, list[tuple[str, str]]] = {}
    for g in reader.items:
        if g["dishes"] != 1 or len(g["names"]) != 1 or len(g["imgs"]) != 1:
            print(f"skip grid item (dishes={g['dishes']}, names={g['names']}, imgs={len(g['imgs'])})")
            continue
        grid.setdefault(ic.norm_name(g["names"][0]), []).append((g["names"][0], g["imgs"][0]))

    rows: dict[str, tuple[str, str]] = {}
    for key, entries in sorted(grid.items()):
        name, src = entries[0]
        base = src.rsplit("/", 1)[-1]
        if len(entries) != 1:
            print(f"AMBIGUOUS page entries for {name!r}: no photo")
            continue
        if not src.startswith(UPLOADS):
            print(f"not a Franco Manca upload, skipped: {name!r} {src}")
            continue
        if base in SKIP_FILES:
            print(f"SKIP {name!r}: {SKIP_FILES[base]}")
            continue
        cands = by_printed.get(key, [])
        if len(cands) != 1:
            print(f"no single published item prints {name!r} ({len(cands)}): no photo")
            continue
        it = cands[0]
        if args.dry_run:
            print(f"MATCH {it['id']:60s} <- {name!r}  {base}")
            rows[it["id"]] = ("dry-run", PAGE)
            continue
        try:
            raw = ic.polite_get(src, args.cache, referer=PAGE)
            fname = ic.store_image(CHAIN, raw)
        except ic.Blocked as e:
            print(f"BLOCKED, stopping: {e}")
            return 2
        except ValueError as e:
            print(f"not stored {it['id']}: {e}")
            continue
        rows[it["id"]] = (fname, PAGE)
        print(f"{it['id']:60s} <- {name!r}  {base} -> {fname}")

    shared = ic.suspected_placeholders(rows)
    if args.dry_run:
        print(f"\n{len(rows)} of {len(items)} published items match (dry run: nothing stored)")
        return 0
    ic.write_images_csv(CHAIN, rows)
    total = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN).glob("*.webp")) if (ic.IMAGES_ROOT / CHAIN).is_dir() else 0
    print(f"\n{len(rows)} of {len(items)} published items have a photo; {total / 1024:.0f} KB stored")
    for f, ids in shared.items():
        print(f"SHARED by {len(ids)} items: {f} {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
