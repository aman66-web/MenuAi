#!/usr/bin/env python3
"""List the catalogue products that have no photo from their supermarket's own website yet.

Writes data/groceries/wanted-images/<retailer>.csv (gtin, name, size) for every product in web/public/groceries/<retailer>.json
without `retailerImage`, own-brand and high-protein products first (the order of data/groceries/wanted/<retailer>.csv when it exists).
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


if __name__ == "__main__":
    raise SystemExit(main())
