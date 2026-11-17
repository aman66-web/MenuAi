#!/usr/bin/env python3
"""Item photos for Franco Manca (docs/UK_DATA_PLAYBOOK.md, Phase 4; helpers in images_common.py).

    python3 tools/uk_extract/images_franco_manca.py --cache <dir> [--dry-run]

Two sources, both Franco Manca's own, used in this order (a dish photographed by source 1 never takes a photo from source 2):

1. Franco Manca's own menu page, https://www.francomanca.co.uk/menu/ (the page data/source/franco-manca/chain.csv names as the source
   of the calories; the extractor franco_manca.py reads the same page). One request for the page, one per photo; the photos are the files
   that page shows (https://www.francomanca.co.uk/wp-content/uploads/...), same host.
2. Franco Manca's own order-and-collect site, https://order.francomanca.co.uk/click-and-collect (linked from the menu page's header as
   the chain's own ordering; its terms below say the order site at order.francomanca.co.uk is part of "The Franco Manca Application
   Services"). That page is a single-page app: it loads its menu as JSON from the address its own script names as REACT_APP_BASE_URL
   (https://franco-manca-react.5loyalty.com, the app's developer 5Loyalty, read from the page's main.<hash>.js together with the API
   version it sends, `rE:"1.6.2"` on 2026-11-17):
     GET /restaurants/all?version=V                     the restaurants and their business_location_id
     GET /ikentoo_menus/location/<id>?version=V         the menu id(s) for one restaurant (517 for every restaurant checked, 2026-11-17)
     GET /ikentoo_menu/<menu>/location/<id>?version=V   the menu: groups of products, each with productName, sku and
                                                        itemRichData.rawImageUrl = https://franco-manca.s3.amazonaws.com/<sku>.jpg
   One restaurant's menu is read (ORDER_LOCATION, Soho). The photo files are in the "franco-manca" S3 bucket, each named by its product's
   SKU. Delivery apps (Deliveroo, Just Eat, Uber Eats), which the menu page also links, are never used.

robots.txt, read 2026-11-17 (polite_get checks every URL against it, RFC 9309):
  - https://www.francomanca.co.uk/robots.txt: one group, `User-agent: *`, Disallow: /wp-json/ and /?rest_route= only; /menu/, /legals/
    and /wp-content/uploads/ are allowed.
  - https://order.francomanca.co.uk/robots.txt and https://franco-manca-react.5loyalty.com/robots.txt answer 200 with an HTML page (the
    app's own page and the API's sign-in page), i.e. no robots.txt rules at all: nothing is disallowed.
  - https://franco-manca.s3.amazonaws.com/robots.txt answers 403 AccessDenied (S3's answer for a file the bucket doesn't have): no rules
    (RFC 9309: a 4xx means no rules; images_common treats an S3 bucket's 403 that way). Every page, JSON and photo answered 200.

Terms (https://www.francomanca.co.uk/legals/, "Terms & Conditions", read 2026-11-17). They govern "(i) our website, located at:
www.francomanca.co.uk ... (ii) the desktop and mobile web application software, developed, owned and operated by 5Loyalty for an on-line
order and collect and payment solution at order.francomanca.co.uk ..." (together "The Franco Manca Application Services"), and under
"Intellectual Property – Terms of permitted use": "You are permitted to use The Franco Manca Application Services for your own personal use
and can print and download for your own personal non-commercial use. ... You may not reproduce, modify, copy or distribute or use for
commercial purposes any of the materials or content on The Franco Manca Application Services without our permission." An express
restriction; installed on the founder's decision of 2026-10-06 (his accepted risk).

Match rule (exact, nothing fuzzy).
Source 1: the menu page lays the larger dishes out as <div class="menu-grid__item"> holding one photo (div.menu-grid__media > img) and one
dish (div.menu-dish.menu-grid__copy > h3). The smaller lines (dips, ice creams, sorbet, wines, cocktails, beers, coffees, soft drinks, kids'
drinks and scoops) are listed as text under "sub-category" headings WITHOUT a photo. The photos above each category (div.menu-intro) are
category pictures naming no dish (e.g. the dips heading shows a Marinara pizza) and are never used. A photo is attached only when
  - the grid item names exactly one dish (its h3), and
  - that h3 equals (images_common.norm_name) the name the dish was published from: items.csv records it in `notes` as
    "Printed '<name>' [<kcal>kcal] ..." (franco_manca.py reads the same div.menu-dish), and
  - exactly one published item has that printed name and exactly one grid item prints it.
Source 2 (only for published items source 1 left without a photo): a product listed at the top level of an ordering menu group (never the
options inside a bundle or a deal) is attached only when
  - its productName, after removing a leading "* NEW *" / "*NEW*" label (ORDER_LABEL; the site's own sticker text, not part of the
    name), equals (norm_name) the item's printed name or the item's published name, and exactly one published item has that name, and
  - exactly one product SKU in the menu carries that name (the same product listed in two groups counts once), and
  - its photo is https://franco-manca.s3.amazonaws.com/<that product's own sku>.jpg.
  So "Garlic dip", "Hot Honey Dip", "Orange Juice 250ml" (printed 'Orange juice 250ml') match; "Chilli Dip" (our 'Scotch bonnet chilli
  dip'), "Semi-dried Tomato Pesto Dip" (our 'Semi-dried tomato dip'), "Lucky Saint 330ml", "Coca Cola 330ml" (our 'Coke 330ml'),
  "San Pellegrino Aranciata Can 330ml", "Dish of Olives" and the kids' lines (printed 'Apple juice' etc. without a size) do not.
Nothing else is attached: the buffalo-mozzarella swap, variants and anything neither source photographs have none.

Left out after looking at the photos on contact sheets (with the reason):
  SKIP_FILES (source 1, by file name):
  - Chocolate Mousse Cake: its file on the page is named "ChatGPT-Image-Jun-5-2026-...png", i.e. an AI-generated picture, not a photo.
  - Kids pizza with butternut squash: its grid item shows "Franco-Manca-Kids-New-Kids-Menu-Lifestyle-June-2026...jpg", a table scene (a white
    pizza with green and orange blobs, a drink, parts of two other pizzas) in which that pizza cannot be confirmed.
  DROP_SKUS (source 2, by product SKU):
  - Diet Coke 330ml (18013): the photo is a Coca-Cola glass bottle with the brand's logo, a third-party brand's pack.
  Looked at and kept: the two juices are bottles with Franco Manca's own label ("Cloudy pressed apple juice", "Freshly squeezed orange
  juice"; no figures), the three dips are ramekins of the dip (the Hot Honey Dip photo, a clear honey with chilli flakes, is a different
  file from the Chilli Dip's thick orange sauce).
Photos are stored unmodified except for the downsizing to 640 px WebP done by images_common.store_image.

Run of 2026-11-17: source 1 gave the same 40 dishes and the same 40 files as on 2026-10-08; source 2 matched 6 more dishes, of which 5 were
kept (Garlic dip, Hot honey dip, Franco's grana and truffle dip, Orange juice, Apple juice) and Diet Coke was left out: 45 of 76.
Still without a photo: the AI picture and the table scene above (Chocolate mousse cake, the butternut squash kids' pizza), and every line
neither source photographs or names exactly (Scotch bonnet chilli dip, Semi-dried tomato dip, the ice creams and sorbet, coffees, teas,
lemonade, Crodino, Lucky Saint, Coke, Coke Zero, the two San Pellegrino cans, the kids' drinks and scoops).
"""
from __future__ import annotations

import argparse
import json
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

ORDER_SITE = "https://order.francomanca.co.uk/"
ORDER_PAGE = "https://order.francomanca.co.uk/click-and-collect"   # the address the menu page links; the source_url of source-2 photos
ORDER_LOCATION = "0016"   # Soho (business_location_id in /restaurants/all); every restaurant checked on 2026-11-17 had menu 517
IMAGE_HOST = "https://franco-manca.s3.amazonaws.com/"
ORDER_LABEL = re.compile(r"^\*\s*NEW\s*\*\s*")
JSON_ACCEPT = "application/json, text/plain, */*"
# Ordering-site product SKU -> why its photo is not used. Filled in after looking at the photos on a contact sheet.
DROP_SKUS: dict[str, str] = {
    "18013": "Diet Coke 330ml: a Coca-Cola glass bottle with its brand's logo (a third-party brand's pack), not a photo of the chain's food",
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


def order_api(cache: Path) -> tuple[str, str]:
    """(API base URL, API version) as the order site's own script names them."""
    index = ic.polite_get(ORDER_SITE, cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
    m = re.search(r'src="(/static/js/main\.[0-9a-f]+\.js)"', index)
    if not m:
        raise SystemExit("order site: main script not found; read the page again before changing this script")
    js = ic.polite_get(ORDER_SITE.rstrip("/") + m.group(1), cache, accept="*/*").decode("utf-8", "replace")
    base = re.search(r'REACT_APP_BASE_URL:"(https://[^"]+)"', js)
    ver = re.search(r'\{rE:"([0-9.]+)"\}', js)
    if not base or not ver:
        raise SystemExit("order site: API address or version not found in its script")
    return base.group(1).rstrip("/"), ver.group(1)


def order_products(cache: Path) -> list[dict]:
    """The top-level products of the ordering menu for ORDER_LOCATION: {name, sku, image}."""
    base, ver = order_api(cache)
    kw = {"accept": JSON_ACCEPT, "referer": ORDER_SITE}
    rest = json.loads(ic.polite_get(f"{base}/restaurants/all?version={ver}", cache, **kw))
    if not any(r.get("business_location_id") == ORDER_LOCATION and r.get("is_published") for r in rest):
        raise SystemExit(f"order site: restaurant {ORDER_LOCATION} is not listed any more; choose another")
    menus = json.loads(ic.polite_get(f"{base}/ikentoo_menus/location/{ORDER_LOCATION}?version={ver}", cache, **kw))["data"]
    out: list[dict] = []
    for menu in menus:
        data = json.loads(ic.polite_get(f"{base}/ikentoo_menu/{menu['ikentooMenuId']}/location/{ORDER_LOCATION}?version={ver}",
                                        cache, **kw))["data"]

        def entries(group: dict):
            for e in group.get("menuEntry") or []:
                if e.get("@type") == "group" or e.get("type") == "group":
                    yield from entries(e)
                else:
                    yield e

        for g in data.get("menuEntryGroups") or []:
            for e in entries(g):
                rich = e.get("itemRichData") or {}
                out.append({"name": e.get("productName") or "", "sku": str(e.get("sku") or ""),
                            "image": rich.get("rawImageUrl") or rich.get("squareImageUrl") or "", "hidden": bool(e.get("isHidden"))})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true", help="list matches only; download and store nothing except the pages and menu JSON")
    args = ap.parse_args()

    items = ic.load_items(CHAIN)
    by_printed: dict[str, list[dict]] = {}
    for it in items:
        p = printed_name(it.get("notes", ""))
        if p:
            by_printed.setdefault(ic.norm_name(p), []).append(it)

    # ------------------------------------------------------------ source 1: the menu page
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
    from_page = len(rows)

    # ------------------------------------------------------------ source 2: the order-and-collect site's menu
    try:
        products = order_products(args.cache)
    except ic.Blocked as e:
        print(f"BLOCKED, stopping: {e}")
        return 2
    by_name: dict[str, list[dict]] = {}
    for it in items:
        if it["id"] in rows:
            continue
        keys = {ic.norm_name(it["name"])}
        p = printed_name(it.get("notes", ""))
        if p:
            keys.add(ic.norm_name(p))
        for k in keys:
            by_name.setdefault(k, []).append(it)
    skus_by_key: dict[str, dict[str, dict]] = {}
    for prod in products:
        key = ic.norm_name(ORDER_LABEL.sub("", prod["name"]))
        skus_by_key.setdefault(key, {})[prod["sku"]] = prod
    for key, skus in sorted(skus_by_key.items()):
        cands = by_name.get(key, [])
        if not cands:
            continue
        names = sorted({p["name"] for p in skus.values()})
        if len(cands) != 1 or len(skus) != 1:
            print(f"AMBIGUOUS order product {names} ({len(skus)} SKUs, {len(cands)} items): no photo")
            continue
        it, prod = cands[0], next(iter(skus.values()))
        if prod["image"] != f"{IMAGE_HOST}{prod['sku']}.jpg":
            print(f"order product {prod['name']!r} has no photo of its own SKU ({prod['image']!r}): no photo")
            continue
        if prod["sku"] in DROP_SKUS:
            print(f"DROP {prod['name']!r} (sku {prod['sku']}): {DROP_SKUS[prod['sku']]}")
            continue
        if args.dry_run:
            print(f"ORDER MATCH {it['id']:54s} <- {prod['name']!r} sku {prod['sku']}{'  (hidden)' if prod['hidden'] else ''}")
            rows[it["id"]] = ("dry-run", ORDER_PAGE)
            continue
        try:
            raw = ic.polite_get(prod["image"], args.cache, referer=ORDER_SITE)
            fname = ic.store_image(CHAIN, raw)
        except ic.Blocked as e:
            print(f"BLOCKED, stopping: {e}")
            return 2
        except ValueError as e:
            print(f"not stored {it['id']}: {e}")
            continue
        rows[it["id"]] = (fname, ORDER_PAGE)
        print(f"{it['id']:60s} <- order {prod['name']!r} sku {prod['sku']} -> {fname}")

    shared = ic.suspected_placeholders(rows)
    if args.dry_run:
        print(f"\n{len(rows)} of {len(items)} published items match ({from_page} from the menu page; dry run: nothing stored)")
        return 0
    ic.write_images_csv(CHAIN, rows)
    total = sum(p.stat().st_size for p in (ic.IMAGES_ROOT / CHAIN).glob("*.webp")) if (ic.IMAGES_ROOT / CHAIN).is_dir() else 0
    print(f"\n{len(rows)} of {len(items)} published items have a photo ({from_page} from the menu page); {total / 1024:.0f} KB stored")
    for f, ids in shared.items():
        print(f"SHARED by {len(ids)} items: {f} {ids}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
