#!/usr/bin/env python3
"""List the catalogue products that have no photo from their supermarket's own website yet.

Writes data/groceries/wanted-images/<retailer>.csv (gtin, name, size) for every product in web/public/groceries/<retailer>.json
without `retailerImage`, own-brand and high-protein products first (the order of data/groceries/wanted/<retailer>.csv when it exists).
Also writes data/groceries/wanted-images/<shop>-listing.csv (product_id, name, page_url) for every product in a shop's full list
(web/public/groceries/all/<shop>.json) that has no photo address yet; the photo read from that page goes in
data/groceries/images/<shop>-listing.csv (read by build_all_products.py).
The Chrome session of docs/NEXT_GROCERIES_IMAGES_PROMPT.md works through these lists. Usage: python3 tools/groceries/missing_images.py
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "web" / "public" / "groceries"
OUT = ROOT / "data" / "groceries" / "wanted-images"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((SRC / "groceries-manifest.json").read_text())
    for entry in manifest["retailers"]:
        rid = entry["id"]
        products = json.loads((SRC / entry["file"]).read_text())["products"]
        todo = [p for p in products if not p.get("retailerImage")]
        priority: dict = {}
        wanted = ROOT / "data" / "groceries" / "wanted" / f"{rid}.csv"
        if wanted.exists():
            with open(wanted, newline="", encoding="utf-8-sig") as f:
                for i, r in enumerate(csv.DictReader(f)):
                    priority[(r.get("gtin") or r.get("code") or "").strip()] = i
        todo.sort(key=lambda p: (priority.get(p["gtin"], 10**9), p["name"].lower()))
        with open(OUT / f"{rid}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["gtin", "name", "size"])
            for p in todo:
                w.writerow([p["gtin"], p["name"], p.get("size", "")])
        print(f"{rid}: {len(todo)} of {len(products)} products still need their shop's own photo")
    return 0


def listing_gaps() -> None:
    all_manifest = SRC / "all" / "all-manifest.json"
    if not all_manifest.exists():
        return
    for entry in json.loads(all_manifest.read_text())["retailers"]:
        f = json.loads((SRC / "all" / entry["file"]).read_text())
        todo = [r for r in f["products"] if not r[8]]
        with open(OUT / f"{entry['id']}-listing.csv", "w", newline="", encoding="utf-8") as out:
            w = csv.writer(out)
            w.writerow(["product_id", "name", "page_url"])
            for r in todo:
                w.writerow([r[0], r[1], f["pageBase"] + r[0]])
        print(f"{entry['id']} full list: {len(todo)} of {len(f['products'])} products still need their shop's own photo")


if __name__ == "__main__":
    listing_gaps()
    raise SystemExit(main())
