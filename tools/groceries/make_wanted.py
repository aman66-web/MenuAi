#!/usr/bin/env python3
"""Write data/groceries/wanted/<retailer>.csv: the products a Claude Code session with Chrome should find prices for.

    python3 tools/groceries/make_wanted.py [--top 300]

Products come most-scanned first (the order the catalogue is built in), skipping ones that already have a price. Columns:
gtin,name,brand,size. The session writes data/groceries/prices/<retailer>.csv (see docs/NEXT_GROCERIES_PROMPT.md).
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=300)
    args = ap.parse_args()
    out = ROOT / "data" / "groceries" / "wanted"
    out.mkdir(parents=True, exist_ok=True)
    for f in sorted((ROOT / "web" / "public" / "groceries").glob("*.json")):
        if f.name == "groceries-manifest.json":
            continue
        doc = json.loads(f.read_text())
        rows = [p for p in doc["products"] if "price" not in p][: args.top]
        with open(out / f"{doc['retailer']}.csv", "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["gtin", "name", "brand", "size"])
            w.writerows([[p["gtin"], p["name"], p["brand"], p["size"]] for p in rows])
        print(f"{doc['retailer']}: {len(rows)} wanted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
