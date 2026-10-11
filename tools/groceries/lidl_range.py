#!/usr/bin/env python3
"""Every Lidl food product, read from each product's own page (founder 2026-10-11: "Lidl only has 193 products you need all of them"; answer:
"Add all, say 'Price in store'").

    python3 tools/groceries/lidl_range.py read     # reads every /p/ page in Lidl's own product sitemap -> data/groceries/listing/raw/lidl_pages.jsonl
    python3 tools/groceries/lidl_range.py write    # keeps the food on sale -> data/groceries/listing/lidl-range.csv (+ a summary)

Why: Lidl's website lists only its weekly offers and special buys in its "Food & Drink" pages (about 270 products, data/groceries/listing/lidl.csv).
Its product sitemap (saved as data/groceries/listing/raw/lidl_product_sitemap.xml) has a page for the everyday range too. Those pages carry the brand,
the name, Lidl's own aisle, Lidl's own photo and "Available in store now", but **no price** (the page's offer has no price and its own data says
`price: null`), no barcode and no nutrition. So a product is written with the price Lidl's page prints, or none; nothing is ever estimated, and the
app says "Price in store" where there is none.

Pages are fetched with tools/uk_extract/images_common.polite_get (robots.txt honoured: Lidl allows /p/; 1 request a second; a 401/403/429 stops the
run and is never worked round). Only what we need from each page is kept (one JSON line per page); the page itself is not stored, and a rerun skips
pages already read. Lidl's terms have no clause against this (docs/IMAGE_TERMS.md).
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402
from lidl_photos import og_image  # noqa: E402

LISTING = ROOT / "data" / "groceries" / "listing"
SITEMAP = LISTING / "raw" / "lidl_product_sitemap.xml"
PAGES = LISTING / "raw" / "lidl_pages.jsonl"
OUT = LISTING / "lidl-range.csv"
SUMMARY = LISTING / "raw" / "lidl_range_summary.txt"
LOC = re.compile(r"<loc>(https://www\.lidl\.co\.uk/p/[a-z0-9-]+/(p\d+))</loc>")

OG_TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')
BRAND = re.compile(r'class="heading__brand"[^>]*>([^<]*)<')
TITLE = re.compile(r'data-qa-label="keyfacts-title"[^>]*>([^<]*)<')
CATEGORY = re.compile(r'"categoryPrimary":"([^"]*)"')
WON = re.compile(r'"wonCategoryPrimary":"([^"]*)"')
# the schema.org offer: a price only when the page prints one ("offers":[{"@type":"Offer","price":1.49,"priceCurrency":"GBP",...)
OFFER = re.compile(r'"offers":\[\{"@type":"Offer",(?:"price":([0-9]+(?:\.[0-9]+)?),)?"priceCurrency":"GBP"')
# the availability badge in the page's data: {"text":90,"type":91},"Available in store now","IN_STORE_TODAY_DATE_RANGE"
BADGE = re.compile(r'\{"text":\d+,"type":\d+\},"([^"]{3,80})","([A-Z][A-Z_]{3,60})"')

# Lidl's own aisles ("Worlds of need/Food and near food/<aisle>/...") -> the "Food & Drink" aisle names its category pages use (one Aisle menu in
# the app). An aisle not named here is not food (pet food, drugstore, household) and is left out; the summary lists every value seen.
AISLES = {
    "Bread & bakery products": "Bakery",
    "Bakery": "Bakery",
    "Fruit & vegetables": "Fruit & veg",
    "Fruit & Vegetables": "Fruit & veg",
    "Meat, sausage & poultry": "Meat & Poultry",
    "Meat & poultry": "Meat & Poultry",
    "Fish & seafood": "Fish & Seafood",
    "Cheese, dairy products & eggs": "Cheese, Dairy & Eggs",
    "Frozen food (Frozen food)": "Frozen",
    "Frozen food": "Frozen",
    "Chilled food": "Ready meals (Chilled Food)",
    "Ready meals": "Ready meals (Chilled Food)",
    "Food Cupboard": "Food Cupboard",
    "Oils, condiments & sauces": "Oils, Condiments & Sauces",
    "Sweets & snacks": "Confectionery & Snacks",
    "Confectionery & snacks": "Confectionery & Snacks",
    "Coffee, tea & cocoa": "Coffee, Tea & Hot Chocolate",
    "Hot drinks": "Coffee, Tea & Hot Chocolate",
    "Non-alcoholic drinks": "Drinks",
    "Drinks": "Drinks",
    "Alcoholic drinks": "Wine, Beer & Spirits",
}


def text(s: str) -> str:
    return " ".join(html.unescape(s).split())


def parse(url: str, pid: str, page: str) -> dict:
    """What one product page says (empty strings where it says nothing)."""
    brand = text(m.group(1)) if (m := BRAND.search(page)) else ""
    name = text(m.group(1)) if (m := TITLE.search(page)) else ""
    if not name and (m := OG_TITLE.search(page)):
        t = re.sub(r"\s*-\s*Lidl$", "", text(m.group(1)))
        brand, _, name = t.rpartition(" | ") if " | " in t else ("", "", t)
    offer = OFFER.search(page)
    badge = BADGE.search(page)
    return {
        "product_id": pid,
        "page_url": url,
        "brand": brand,
        "name": name,
        "category": m.group(1) if (m := CATEGORY.search(page)) else "",
        "won": text(m.group(1)) if (m := WON.search(page)) else "",
        "price": offer.group(1) if offer and offer.group(1) else "",
        "availability": text(badge.group(1)) if badge else "",
        "availability_type": badge.group(2) if badge else "",
        "image_url": og_image(page),
        "checked_on": date.today().isoformat(),
    }


def sitemap_pages() -> list[tuple[str, str]]:
    seen: dict[str, str] = {}
    for m in LOC.finditer(SITEMAP.read_text(encoding="utf-8")):
        seen.setdefault(m.group(2), m.group(1))
    return [(pid, url) for pid, url in seen.items()]


def read_done() -> dict[str, dict]:
    if not PAGES.exists():
        return {}
    out = {}
    for line in PAGES.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            out[r["product_id"]] = r
    return out


def cmd_read(cache: Path) -> int:
    done = read_done()
    todo = [(pid, url) for pid, url in sitemap_pages() if pid not in done]
    print(f"{len(todo)} pages to read ({len(done)} already read)", flush=True)
    with open(PAGES, "a", encoding="utf-8") as f:
        for i, (pid, url) in enumerate(todo, 1):
            try:
                raw = ic.polite_get(url, cache, accept="text/html,*/*;q=0.8")
            except ic.Blocked as e:
                print(f"STOPPED (never worked round): {e}. {i - 1} pages read this run.", flush=True)
                return 2
            except OSError as e:
                print(f"{pid}: not read ({e})", flush=True)
                continue
            f.write(json.dumps(parse(url, pid, raw.decode("utf-8", "replace")), ensure_ascii=False) + "\n")
            f.flush()
            # only the few fields above are kept: drop the cached page
            cached = Path(cache) / __import__("hashlib").sha1(url.encode()).hexdigest()
            cached.unlink(missing_ok=True)
            if i % 100 == 0:
                print(f"{i} of {len(todo)} read", flush=True)
    print("done", flush=True)
    return 0


def aisle_of(won: str) -> str | None:
    parts = [p.strip() for p in won.split("/")]
    if len(parts) < 3 or parts[1] != "Food and near food":
        return None
    return AISLES.get(parts[2])


def on_sale(r: dict) -> bool:
    a = r.get("availability", "")
    return a == "Available in store now" or a.startswith("In store from")


def cmd_write() -> int:
    from build_groceries import is_alcohol  # noqa: E402

    pages = read_done()
    why: Counter[str] = Counter()
    wons: Counter[str] = Counter()
    badges: Counter[str] = Counter()
    rows = []
    for pid, r in sorted(pages.items(), key=lambda kv: int(kv[0][1:])):
        wons[" / ".join(r["won"].split("/")[1:3]) or "(none)"] += 1
        badges[r.get("availability") or "(none)"] += 1
        aisle = aisle_of(r["won"]) if r.get("category") == "Food" else None
        name = " ".join(x for x in (r["brand"], r["name"]) if x)
        if not r["name"]:
            why["no name on the page"] += 1
        elif aisle is None:
            why["not food (Lidl's own aisle)"] += 1
        elif not on_sale(r):
            why[f"not on sale ({r.get('availability') or 'no availability shown'})"] += 1
        elif aisle == "Wine, Beer & Spirits" or is_alcohol(name, f"Food & Drink / {aisle}"):
            why["alcohol"] += 1
        else:
            rows.append([pid, name, r["price"], "", "", "", "", f"Food & Drink / {aisle}", r["page_url"], r["image_url"], r["checked_on"], r["availability"]])
            why["kept, price printed" if r["price"] else "kept, no price printed (Price in store)"] += 1
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["product_id", "name", "price_gbp", "unit_price_gbp", "unit", "member_price_gbp", "member_scheme", "category_path", "page_url", "image_url", "checked_on", "availability"])
        w.writerows(rows)
    lines = [f"Lidl product pages read: {len(pages)} (sitemap {SITEMAP.name})", "", "Result:"]
    lines += [f"  {n:5d}  {k}" for k, n in why.most_common()]
    lines += ["", "Lidl's own aisles seen (world / aisle):"] + [f"  {n:5d}  {k}" for k, n in wons.most_common()]
    lines += ["", "Availability shown:"] + [f"  {n:5d}  {k}" for k, n in badges.most_common()]
    SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"-> {OUT.relative_to(ROOT)} ({len(rows)} products)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["read", "write"])
    ap.add_argument("--cache", type=Path, default=Path("/tmp/lidl-range-cache"))
    a = ap.parse_args()
    return cmd_read(a.cache) if a.step == "read" else cmd_write()


if __name__ == "__main__":
    sys.exit(main())
