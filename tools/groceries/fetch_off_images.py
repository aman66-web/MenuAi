#!/usr/bin/env python3
"""Fetch the Open Food Facts front photo for barcodes no supermarket's website gave us a photo of (founder 2026-10-11: "use the EAN number to search up and
match that exact product and find an image of it ... if you can't find it on the supermarket's website").

    python3 tools/groceries/fetch_off_images.py        # reads data/groceries/wanted-images/off.csv and off-catalogue.csv, appends to data/groceries/images/off-front.csv

Why Open Food Facts and not a web image search: it is looked up by the exact barcode (so it is that product), its photos are licensed for reuse (CC BY-SA,
credited in the app), and it allows this kind of reading (about 100 product reads a minute; we do one every 1.5 s). Only its own image server's front
photo is kept. Barcodes already answered (photo or none) are not asked again; delete a line to ask again.
"""
from __future__ import annotations

import csv
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_groceries import OFF_IMAGE, norm_code, restricted_code  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WANTED = [ROOT / "data" / "groceries" / "wanted-images" / "off.csv", ROOT / "data" / "groceries" / "wanted-images" / "off-catalogue.csv"]
OUT = ROOT / "data" / "groceries" / "images" / "off-front.csv"
UA = "NumbiteCatalogue/1.0 (UK nutrition app; https://numbite.com)"
API = "https://world.openfoodfacts.org/api/v2/product/{code}?fields=code,image_front_url"


def wanted() -> list[str]:
    codes: list[str] = []
    for path in WANTED:
        if path.exists():
            with open(path, newline="", encoding="utf-8") as f:
                codes += [(r.get("gtin") or "").strip() for r in csv.DictReader(f)]
    return sorted({c for c in codes if c.isdigit() and not restricted_code(c)})


def done() -> set[str]:
    if not OUT.exists():
        return set()
    with open(OUT, newline="", encoding="utf-8") as f:
        return {norm_code(r["gtin"]) for r in csv.DictReader(f) if r.get("gtin")}


def front(code: str) -> str:
    """The product's front photo on Open Food Facts' own image server, or "" (no product, no photo, or an address we don't accept)."""
    req = urllib.request.Request(API.format(code=code), headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return ""
        raise
    url = ((data.get("product") or {}).get("image_front_url") or "").strip()
    return url if OFF_IMAGE.match(url) else ""


def main() -> int:
    have = done()
    todo = [c for c in wanted() if norm_code(c) not in have]
    print(f"{len(todo)} barcodes to look up ({len(have)} already answered)")
    new = not OUT.exists()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["gtin", "image_url", "checked_on"])
        found = 0
        for i, code in enumerate(todo):
            try:
                url = front(code)
            except urllib.error.HTTPError as e:
                print(f"stopped: HTTP {e.code} from Open Food Facts after {i} reads (not retried)")
                break
            except (urllib.error.URLError, TimeoutError) as e:
                print(f"stopped: {e} after {i} reads")
                break
            w.writerow([code, url, date.today().isoformat()])
            f.flush()
            found += bool(url)
            time.sleep(1.5)
    print(f"done: {found} front photos found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
