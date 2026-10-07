#!/usr/bin/env python3
"""Download UK supermarket products from Open Food Facts (open data) into a local cache for tools/groceries/build_groceries.py.

    python3 tools/groceries/fetch_off.py [--only tesco,aldi] [--cache DIR]

Why Open Food Facts: Tesco, Sainsbury's, Asda and Aldi refuse automated visits to their sites (never worked round), and OFF is the open
source of barcodes (GTIN/EAN), nutrition per 100 g, allergens and product photos. It is community data, NOT an official source: the app
labels it as such. Licence: the data is ODbL, the photos CC BY-SA: credited in the app. Prices are not in OFF (see docs/GROCERIES_PLAN.md).

Politeness (OFF asks for at most 10 search requests a minute and a descriptive User-Agent): one request at a time, 7 s apart, each page
cached so reruns are free. Products come most-scanned first, so a partial run still has the popular ones.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = "MenuMathCatalogue/1.0 (UK nutrition app; contact aman66@hotmail.co.uk)"
API = "https://world.openfoodfacts.org/api/v2/search"
# retailer id -> (OFF brand tags of its own brands, OFF store tag for branded products sold there)
# Own-brand ranges are separate brand tags; a tag that doesn't exist just returns nothing (one cheap request).
RETAILERS = {
    "tesco": (["tesco", "tesco-finest", "tesco-free-from", "tesco-organic", "tesco-plant-chef"], "tesco"),
    "sainsburys": (["sainsburys", "taste-the-difference", "by-sainsbury-s", "sainsbury-s-deliciously-free-from", "sainsbury-s-be-good-to-yourself"], "sainsburys"),
    "asda": (["asda", "asda-extra-special", "just-essentials", "asda-good-for-you", "smart-price", "chosen-by-you"], "asda"),
    "waitrose": (["waitrose", "waitrose-partners", "essential-waitrose", "waitrose-1", "duchy-organic", "waitrose-love-life"], "waitrose"),
    "lidl": (["lidl", "milbona", "deluxe", "vemondo", "sondey", "cien"], "lidl"),
    "aldi": (["aldi", "specially-selected", "mamia", "the-fishmonger", "everyday-essentials", "brooklea", "nature-s-pick", "harvest-morn"], "aldi"),
}
FIELDS = ",".join([
    "code", "product_name", "product_name_en", "brands", "brands_tags", "quantity", "product_quantity", "serving_size", "serving_quantity",
    "categories_tags", "stores_tags", "countries_tags", "nutriments", "allergens_tags", "traces_tags", "ingredients_text_en", "ingredients_text",
    "image_front_url", "image_front_small_url", "selected_images", "images", "last_modified_t", "nutrition_data_per", "lang",
])
PAGE_SIZE = 100


def get(url: str, delay: float) -> dict:
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read().decode("utf-8")
            data = json.loads(body)  # an HTML "temporarily unavailable" page raises ValueError: retried below
            time.sleep(delay)
            return data
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as e:
            code = getattr(e, "code", None)
            wait = 30 * (attempt + 1)
            print(f"  retry in {wait}s ({code or type(e).__name__})", flush=True)
            time.sleep(wait)
    raise SystemExit("Open Food Facts kept refusing; try again later (never loop faster).")


GRADE_SLICES = ["a", "b", "c", "d", "e", "unknown"]
# The search API stops at 1,000 results per query (page 11 errors). A query with more than that is split by the nutrition-grade tag, an
# internal field of the database that the app never shows: every product has exactly one value, so the slices don't overlap.
CAP_PAGES = 10


def run_query(rid: str, qname: str, filt: dict, args) -> int:
    """Fetch all pages (up to the 1,000 cap) of one query; returns the reported total."""
    page, total = 1, 0
    while page <= CAP_PAGES:
        f = args.cache / f"{rid}-{qname}-{page:03d}.json"
        if f.exists():
            data = json.loads(f.read_text())
        else:
            params = {**filt, "countries_tags": "en:united-kingdom", "page": page, "page_size": PAGE_SIZE, "fields": FIELDS, "sort_by": "unique_scans_n", "json": 1}
            data = get(f"{API}?{urllib.parse.urlencode(params)}", args.delay)
            f.write_text(json.dumps(data))
        n = len(data.get("products", []))
        total = data.get("count", 0)
        print(f"{rid} {qname} page {page}: {n} products (of {total})", flush=True)
        if n < PAGE_SIZE or page * PAGE_SIZE >= total:
            break
        page += 1
    return total


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--cache", type=Path, default=Path("/private/tmp/off-cache"))
    ap.add_argument("--delay", type=float, default=7.0)
    args = ap.parse_args()
    only = {x for x in args.only.split(",") if x}
    args.cache.mkdir(parents=True, exist_ok=True)
    for rid, (brands, store) in RETAILERS.items():
        if only and rid not in only:
            continue
        queries = [(f"brand-{b}", {"brands_tags": b}) for b in brands] + [(f"store-{store}", {"stores_tags": store})]
        for qname, filt in queries:
            total = run_query(rid, qname, filt, args)
            if total > CAP_PAGES * PAGE_SIZE:
                for g in GRADE_SLICES:
                    run_query(rid, f"{qname}-grade-{g}", {**filt, "nutrition_grades_tags": g}, args)
    print("done; cache:", args.cache)
    return 0


if __name__ == "__main__":
    sys.exit(main())
