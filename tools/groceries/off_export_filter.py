#!/usr/bin/env python3
"""Keep, from Open Food Facts' daily export, only the barcodes tools/groceries/fetch_off_codes.py wants, as one file per barcode in the same form.

    curl -sL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | python3 tools/groceries/off_export_filter.py --cache DIR

Why: Open Food Facts asks anyone who needs many products to use its export instead of the product API (which answered 429 after about 200 reads).
The export (about 1.3 GB, gzip, tab-separated) is read as a stream and never saved; only the rows whose barcode is wanted are written, mapped to the
fields tools/groceries/build_groceries.convert reads. The export has no per-serving figures, so those are left out (never worked out). Community data.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_groceries as bg  # noqa: E402
import fetch_off_codes as foc  # noqa: E402

NUTRIMENTS = ("energy-kcal_100g", "energy-kj_100g", "proteins_100g", "carbohydrates_100g", "fat_100g", "saturated-fat_100g", "sugars_100g", "fiber_100g", "salt_100g")
TAGS = ("categories_tags", "allergens_tags", "traces_tags")


def product(row: dict) -> dict:
    """One export row as the product record convert() reads (tag lists split on commas; an empty number left out)."""
    p: dict = {k: (row.get(k) or "").strip() for k in ("code", "product_name", "brands", "quantity", "serving_size", "ingredients_text", "last_modified_t")}
    for k in TAGS:
        p[k] = [t for t in (row.get(k) or "").split(",") if t]
    if not p["allergens_tags"] and (row.get("allergens") or "").strip():
        p["allergens_tags"] = [t for t in row["allergens"].split(",") if t.startswith("en:")]
    n = {}
    for k in NUTRIMENTS:
        v = (row.get(k) or "").strip()
        if v:
            n[k] = v
    p["nutriments"] = n
    return {k: v for k, v in p.items() if v not in ("", [], {}) or k in ("nutriments",)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    a = ap.parse_args()
    a.cache.mkdir(parents=True, exist_ok=True)
    want = {bg.norm_code(c): c for c in foc.wanted()}
    print(f"looking for {len(want)} barcodes in the export", flush=True)
    csv.field_size_limit(1 << 30)
    text = io.TextIOWrapper(gzip.GzipFile(fileobj=sys.stdin.buffer), encoding="utf-8", errors="replace", newline="")
    reader = csv.DictReader(text, delimiter="\t", quoting=csv.QUOTE_NONE)
    found = rows = 0
    for row in reader:
        rows += 1
        code = (row.get("code") or "").strip()
        key = bg.norm_code(code)
        if key in want:
            (a.cache / f"{want[key]}.json").write_text(json.dumps({"status": 1, "product": product(row)}, ensure_ascii=False, separators=(",", ":")))
            found += 1
        if rows % 500000 == 0:
            print(f"  {rows} rows read, {found} wanted barcodes found", flush=True)
    print(f"done: {rows} rows read, {found} of {len(want)} wanted barcodes found", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
