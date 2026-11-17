#!/usr/bin/env python3
"""Read Starbucks UK's FOOD menu from its own web pages into a chrome-inbox style folder, for tools/uk_extract/chrome_import.py.

    python3 tools/uk_extract/starbucks_pages.py --cache DIR --inbox DIR --checked-on 2026-11-17 [--fetch]
    python3 tools/uk_extract/chrome_import.py starbucks --inbox DIR [--out DIR]

Why this exists: the 10 October 2026 data was read from the same pages in the founder's Chrome (data/chrome-inbox/starbucks/). The
pages are rendered on the server, so a plain request gets the same figures the browser shows: this script re-reads them so a new
season's menu can be refreshed without a browser. (The PDF guides read by starbucks.py are disallowed by robots.txt, see
data/held-robots/; never used.)

Source pages (robots.txt of www.starbucks.co.uk disallows only /api/, /refer-a-friend* and any .pdf):
  - the four food category pages the site's own menu links (also in https://www.starbucks.co.uk/sitemap.xml):
        /menu/food/sandwiches  /menu/food/breakfast-pastries  /menu/food/snacks-treats  /menu/food/bakery-
    each lists its products as links to /menu/product/<id> (the product grid of the page, read in page order). If a category
    page comes back without its grid because the site failed to render it (the page carries a server error, E{digest}), the run
    stops: a menu with a category missing is never written. First used 2026-11-17: Sandwiches (11) and Breakfast & Pastries (17)
    read, but Snacks & Treats and Bakery came back as server errors cached by the site's CDN, so nothing was written that day;
  - each product's own page /menu/product/<id>, whose server-rendered data holds the product object the page shows:
        "nutritionalData": {"energy2": {"wholeAmount": "436kcal", "amountPer100": null}, "energy1": {"wholeAmount": "1829kJ"},
                            "fat", "saturatedFat", "carbohydrates", "sugar", "fiber"/"fibre", "protein", "salt": {"wholeAmount": "19.0g"}}
        (some pages add "servingSize": {"wholeAmount": "2 Pieces"}, copied as the serving text, never converted)
        "allergens": ["EGG", "BARLEY", "WHEAT", "MUSTARD"], "title": "Free-Range Egg, Cress & Mayo Sandwich", "sizes": null
Only the whole-serving amounts ("wholeAmount") are used; the unit is checked and removed, the number is kept exactly as printed
(nothing converted or rounded). A product with a per-100 g amount, sizes, a missing kcal, or a unit other than the expected one
stops the run. An empty allergen list is written as blank (unknown), never as "none". Drinks, Starbucks at Home and merchandise
are not read. Fetching: one request at a time, at least 1.1 s apart, a normal browser User-Agent; any 401/403/429, a challenge
page or a robots.txt refusal stops the run (never worked round).
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402

SITE = "https://www.starbucks.co.uk"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
DELAY = 1.1
CATEGORIES = [  # page path -> category name used in the app (the names the 10 October read used)
    ("/menu/food/sandwiches", "Sandwiches"),
    ("/menu/food/breakfast-pastries", "Breakfast & Pastries"),
    ("/menu/food/snacks-treats", "Snacks & Treats"),
    ("/menu/food/bakery-", "Bakery"),
]
UNITS = {"energy2": "kcal", "energy1": "kJ", "protein": "g", "carbohydrates": "g", "fat": "g", "saturatedFat": "g", "sugar": "g",
         "fiber": "g", "fibre": "g", "salt": "g"}
COLUMNS = {"energy2": "calories", "protein": "protein_g", "carbohydrates": "carbs_g", "fat": "fat_g", "saturatedFat": "sat_fat_g",
           "sugar": "sugar_g", "fiber": "fiber_g", "salt": "salt_g", "energy1": "energy_kj"}
ITEM_COLS = ["name", "category", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "salt_g", "energy_kj",
             "weight_g", "serving", "page_url", "contains", "may_contain"]

_last = [0.0]
_rules: list | None = None


def get(path: str, dest: Path, fetch: bool) -> str:
    global _rules
    if dest.exists() and dest.stat().st_size:
        return dest.read_text(encoding="utf-8")
    if not fetch:
        raise SystemExit(f"{dest} is not in the cache: run with --fetch")
    if _rules is None:
        _rules = robots_rfc.parse(_request("/robots.txt"))
    if not robots_rfc.allowed(_rules, path):
        raise SystemExit(f"robots.txt disallows {path}: stopped")
    text = _request(path)
    if re.search(r"(?i)captcha|cf-chl|challenge-platform|Access Denied", text[:5000]):
        raise SystemExit(f"{path}: the answer looks like a challenge or block page: stopped (never worked round)")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(text, encoding="utf-8")
    return text


def _request(path: str) -> str:
    wait = _last[0] + DELAY - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    try:
        with urllib.request.urlopen(urllib.request.Request(SITE + path, headers={"User-Agent": UA}), timeout=60) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} from {SITE + path}: stopped (never worked round)") from e
    finally:
        _last[0] = time.monotonic()


def category_products(page: str) -> list[str]:
    """Product ids in the order the category page's grid lists them."""
    ids = re.findall(r'<li class="O23OrderMenuCategory_item[^"]*"><a [^>]*href="/menu/product/(\d+)"', page)
    if not ids and re.search(r'E\{\\?"digest\\?":', page):
        raise SystemExit("a category page lists no products and carries a server error (E{digest}): the site could not render it; "
                         "try again later (the run stops rather than publish a menu with a category missing)")
    if not ids:
        raise SystemExit("a category page lists no products: the page layout changed, re-check the reader")
    return list(dict.fromkeys(ids))


def rsc_text(page: str) -> str:
    """The server-rendered data of a Next.js page: the JSON string literals pushed with self.__next_f.push([1, "..."])."""
    parts = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', page):
        parts.append(json.loads(m.group(1)))
    return "".join(parts)


def product_object(page: str, pid: str) -> dict:
    data = rsc_text(page)
    found = []
    for m in re.finditer(r'"product":\{"type":"product","id":"(\d+)"', data):
        obj, _ = json.JSONDecoder().raw_decode(data[m.start() + len('"product":'):])
        found.append(obj)
    mine = [o for o in found if o.get("id") == pid]
    if len(mine) != 1:
        raise SystemExit(f"product {pid}: found {len(mine)} product objects with that id on its own page: re-check the reader")
    return mine[0]


def number(field: str, value: dict | None, pid: str) -> str:
    if value is None:
        return ""
    if value.get("amountPer100") not in (None, ""):
        raise SystemExit(f"product {pid}: {field} has a per-100 amount ({value.get('amountPer100')!r}); this reader expects per serving only")
    text = str(value.get("wholeAmount") or "").strip()
    if text == "":
        return ""
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*" + re.escape(UNITS[field]), text, re.I)
    if not m:
        raise SystemExit(f"product {pid}: {field} is printed {text!r}, not a plain number in {UNITS[field]}: re-check the page")
    return m.group(1)


def read_product(page: str, pid: str, category: str) -> dict:
    p = product_object(page, pid)
    if p.get("sizes"):
        raise SystemExit(f"product {pid}: it has sizes {p.get('sizes')!r}; this reader handles single-serving food only")
    nd = p.get("nutritionalData") or {}
    unknown = set(nd) - set(UNITS) - {"servingSize"}
    if unknown:
        raise SystemExit(f"product {pid}: unknown nutrition fields {sorted(unknown)}: re-check the page")
    row = {c: "" for c in ITEM_COLS}
    title = re.sub(r"<[^>]+>", "", html.unescape(p.get("title") or ""))   # "Cheese & Marmite<sup>®</sup> Mini Ciabatta"
    row.update(name=" ".join(title.split()), category=category, page_url=f"{SITE}/menu/product/{pid}")
    for field, col in COLUMNS.items():
        row[col] = number(field, nd.get(field), pid)
    fibre = number("fibre", nd.get("fibre"), pid)
    if row["fiber_g"] and fibre and fibre != row["fiber_g"]:
        raise SystemExit(f"product {pid}: its two fibre fields disagree ({row['fiber_g']} / {fibre}): re-check the page")
    row["fiber_g"] = row["fiber_g"] or fibre
    serving = nd.get("servingSize") or {}
    if serving.get("amountPer100") not in (None, ""):
        raise SystemExit(f"product {pid}: servingSize has a per-100 amount: re-check the page")
    row["serving"] = " ".join(str(serving.get("wholeAmount") or "").split())   # copied as printed ("2 Pieces"), never converted
    if not row["name"]:
        raise SystemExit(f"product {pid}: no title")
    allergens = [str(a).strip() for a in (p.get("allergens") or []) if str(a).strip()]
    row["contains"] = ";".join(a.lower() for a in allergens)   # blank = the page lists none (unknown, not "none")
    return row


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--inbox", type=Path, required=True, help="writes <inbox>/starbucks/meta.json and items.csv")
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--meta", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "chrome-inbox" / "starbucks" / "meta.json",
                    help="the meta.json to start from (chain name, sites and their evidence)")
    args = ap.parse_args()
    rows, seen = [], set()
    for path, category in CATEGORIES:
        page = get(path, args.cache / ("cat-" + path.strip("/").split("/")[-1].strip("-") + ".html"), args.fetch)
        ids = category_products(page)
        print(f"{path}: {len(ids)} products")
        for pid in ids:
            if pid in seen:
                print(f"  {pid} is also listed under {category}: kept under its first category")
                continue
            seen.add(pid)
            prod = get(f"/menu/product/{pid}", args.cache / f"p{pid}.html", args.fetch)
            rows.append(read_product(prod, pid, category))
    meta = json.loads(args.meta.read_text(encoding="utf-8"))
    meta["source_title"] = f"Starbucks UK menu: food product pages (nutrition and allergens per serving, read {args.checked_on}, no date shown)"
    meta["checked_on"] = args.checked_on
    out = args.inbox / "starbucks"
    out.mkdir(parents=True, exist_ok=True)
    (out / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with open(out / "items.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=ITEM_COLS)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} products to {out / 'items.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
