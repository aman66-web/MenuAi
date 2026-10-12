#!/usr/bin/env python3
"""Look up, by exact barcode, the Open Food Facts record of each product a supermarket's own list shows but the catalogue doesn't have yet
(founder 2026-10-11: products sold at several shops share one listing, with every shop's price and photo, and all the nutrition we can give).

    python3 tools/groceries/fetch_off_codes.py --cache DIR [--limit N]     # one file per barcode in DIR (resumes; never asks twice)

Barcodes come from the published "every product" lists (web/public/groceries/all/): Asda's picture id where it is a valid barcode (GS1 check digit),
and the barcode Sainsbury's and Tesco product pages showed (data/groceries/discovery). Barcodes already in the catalogue are skipped. Nothing is matched
by name, and shop-internal numbers (bg.restricted_code) are never looked up: they can mean a different product at another shop. Each answer is saved as <code>.json: the product record, or {"status": 0} when Open Food Facts doesn't know the barcode.

Politeness: Open Food Facts allows 100 product reads a minute; this asks one at a time, about 75 a minute, with a User-Agent naming the app and its
site, and backs off on 429/503 (a run that keeps being refused stops). Community data, labelled as such in the app (tools/groceries/build_groceries.py
--add-codes uses the same checks as the rest of the catalogue).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_groceries as bg  # noqa: E402

UA = "NumbiteCatalogue/1.0 (UK nutrition app; https://numbite.com)"
API = "https://world.openfoodfacts.org/api/v2/product/{code}.json?fields={fields}"
FIELDS = ",".join([
    "code", "product_name", "product_name_en", "brands", "quantity", "serving_size", "serving_quantity", "categories_tags", "nutriments",
    "allergens_tags", "traces_tags", "ingredients_text_en", "ingredients_text", "last_modified_t",
])
# Which list each barcode comes from, in the order they are asked (the smaller, page-read lists first).
SOURCES = (("sainsburys", 9), ("tesco", 9), ("asda", 8))


def wanted(root: Path = ROOT) -> list[str]:
    """Barcodes the lists show that the catalogue lacks (first spelling of each; leading zeros don't make a new product)."""
    out = root / "web" / "public" / "groceries"
    have: set[str] = set()
    for entry in json.loads((out / "groceries-manifest.json").read_text())["retailers"]:
        have |= {bg.norm_code(p["gtin"]) for p in json.loads((out / entry["file"]).read_text())["products"]}
    codes: dict[str, str] = {}
    for shop, col in SOURCES:
        path = out / "all" / f"{shop}.json"
        if not path.exists():
            continue
        for row in json.loads(path.read_text())["products"]:
            c = row[col] if len(row) > col else ""
            if isinstance(c, str) and bg.gtin_ok(c) and not bg.restricted_code(c) and bg.norm_code(c) not in have:
                codes.setdefault(bg.norm_code(c), c)
    return list(codes.values())


def fetch(code: str) -> dict:
    req = urllib.request.Request(API.format(code=code, fields=FIELDS), headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"status": 0}
        raise
    return {"status": 1, "product": data["product"]} if data.get("status") == 1 and isinstance(data.get("product"), dict) else {"status": 0}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--delay", type=float, default=0.8)
    a = ap.parse_args()
    a.cache.mkdir(parents=True, exist_ok=True)
    codes = [c for c in wanted() if not (a.cache / f"{c}.json").exists()]
    if a.limit:
        codes = codes[: a.limit]
    print(f"{len(codes)} barcodes to look up", flush=True)
    found = refused = 0
    for i, code in enumerate(codes, 1):
        for attempt in range(5):
            try:
                ans = fetch(code)
                break
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as e:
                wait = 60 * (attempt + 1)
                print(f"  {code}: {getattr(e, 'code', type(e).__name__)}; waiting {wait}s", flush=True)
                time.sleep(wait)
        else:
            refused += 1
            if refused >= 3:
                print("Open Food Facts keeps refusing: stopped (rerun later; finished barcodes are kept).", flush=True)
                return 2
            continue
        (a.cache / f"{code}.json").write_text(json.dumps(ans, ensure_ascii=False, separators=(",", ":")))
        found += ans["status"] == 1
        if i % 250 == 0:
            print(f"  {i}/{len(codes)} asked, {found} known to Open Food Facts", flush=True)
        time.sleep(a.delay)
    print(f"done: {len(codes)} asked, {found} known to Open Food Facts", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
