#!/usr/bin/env python3
"""Remove wrongly matched photos from a chain: python3 tools/uk_extract/remove_photos.py <chain-id> <item-id> [<item-id> ...]

Deletes those rows from data/source/<chain>/images.csv and any stored file nothing else uses. (A re-run of the chain's own
images script would bring them back: add the item to that script's exclusion list too, with a comment saying why.)"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    chain, drop = sys.argv[1], set(sys.argv[2:])
    path = ROOT / "data" / "source" / chain / "images.csv"
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8")))
    keep = [r for r in rows if r["item_id"] not in drop]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["item_id", "file", "source_url", "retrieved_on"])
        w.writeheader()
        w.writerows(keep)
    used = {r["file"] for r in keep}
    for r in rows:
        f = ROOT / "web" / "public" / "menu-images" / chain / r["file"]
        if r["item_id"] in drop and r["file"] not in used and f.exists():
            f.unlink()
    print(f"removed {len(rows) - len(keep)} rows; {len(keep)} left")
    return 0


if __name__ == "__main__":
    sys.exit(main())
