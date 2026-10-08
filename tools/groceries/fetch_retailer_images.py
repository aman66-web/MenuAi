#!/usr/bin/env python3
"""Stored copies of the supermarket's own product photos (Option D, founder's decision 2026-10-09; photo rules docs/UK_DATA_PLAYBOOK.md Phase 4).

The app shows, in this order: our stored 400 px copy -> the shop's own picture hotlinked -> the Open Food Facts picture -> "no photo".
This module holds the shared pieces for the first step; the entry point that CHOOSES which products get a stored copy is
tools/groceries/select_stored_photos.py. The older pilot flow still works:

    # add the photo addresses read from the product pages (lines `gtin|host/path|ALT` written during the price pass, `gtin|NOIMG|` = none):
    python3 tools/groceries/fetch_retailer_images.py sainsburys --ingest results/*.images.txt
    # download the ones not fetched yet (1 request a second, robots.txt honoured, never works round a block):
    python3 tools/groceries/fetch_retailer_images.py sainsburys

State is data/groceries/images/<retailer>.csv: `gtin,image_url,page_url,checked_on,file`.
  * image_url  the shop's own image address (no query string stored); page_url + checked_on say which of the shop's pages showed it (a price row's page
               when we priced the product, else the shop's listing page the address was read from): a photo is never matched on its own.
  * file       the stored copy, web/public/grocery-images/<retailer>/<hash>.webp: only resized (longest side 400 px, never enlarged) and converted to WebP,
               never cropped, recoloured or retouched (tools/uk_extract/images_common.py:store_image). Empty until downloaded.
tools/groceries/build_groceries.py then adds `photo: <file>` to the product, and the app captions it "Photo from the {shop} website".

Hosts: Sainsbury's assets.sainsburys-groceries.co.uk (no robots.txt: no rules). Tesco's digitalcontent.api.tesco.com answers 403 to its robots.txt, which the shared
helper treats as "do not fetch" (playbook: a 403 stops us), and Tesco's terms ban automated tools, so Tesco is NEVER stored: its pictures are hotlinked only.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
import images_common as ic  # noqa: E402

ic.IMAGES_ROOT = ROOT / "web" / "public" / "grocery-images"  # the shared helper writes menu photos by default
ic.MAX_SIDE = 400  # a stored copy is small: about 9 KB each, so ~3,000 of them are ~30 MB and the repo stays light
HEADER = ["gtin", "image_url", "page_url", "checked_on", "file"]
# Only the shop's own image hosts are accepted as a source (never a third party), and only these path shapes. STORE lists the shops whose pictures
# we may keep a copy of (see the module docstring); download_url() gives the address form we fetch.
HOSTS = {
    "sainsburys": (r"assets\.sainsburys-groceries\.co\.uk", r"/gol/\d+/(?:1/\d+x\d+|image)\.jpg", ""),
    "tesco": (r"digitalcontent\.api\.tesco\.com", r"/v2/media/ghs/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpe?g", "?h=640&w=640"),
}
STORE = ("sainsburys",)


def download_url(retailer: str, image_url: str) -> str:
    """The address we fetch for a stored copy: for Sainsbury's the 640 px form of the same picture id (the address on a product page is a 300 px thumbnail)."""
    if retailer == "sainsburys":
        m = re.match(r"https://assets\.sainsburys-groceries\.co\.uk/gol/(\d+)/", image_url)
        if m:
            return f"https://assets.sainsburys-groceries.co.uk/gol/{m.group(1)}/1/640x640.jpg"
    return image_url


def csv_path(retailer: str) -> Path:
    return ROOT / "data" / "groceries" / "images" / f"{retailer}.csv"


def read_rows(retailer: str) -> dict[str, dict]:
    p = csv_path(retailer)
    if not p.exists():
        return {}
    with open(p, newline="", encoding="utf-8") as f:
        return {r["gtin"]: r for r in csv.DictReader(f)}


def write_rows(retailer: str, rows: dict[str, dict]) -> None:
    p = csv_path(retailer)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        for g in sorted(rows):
            w.writerow({k: rows[g].get(k, "") for k in HEADER})


def price_rows(retailer: str) -> dict[str, dict]:
    p = ROOT / "data" / "groceries" / "prices" / f"{retailer}.csv"
    with open(p, newline="", encoding="utf-8-sig") as f:
        return {r["gtin"]: r for r in csv.DictReader(f)}


def ingest(retailer: str, files: list[str]) -> None:
    host_re, path_re, _ = HOSTS[retailer]
    prices = price_rows(retailer)
    rows = read_rows(retailer)
    added = skipped = 0
    for fn in files:
        for line in Path(fn).read_text(encoding="utf-8").splitlines():
            parts = [x.strip() for x in line.split("|")]
            if len(parts) < 2 or not parts[0]:
                continue
            gtin, addr = parts[0], parts[1]
            if addr in ("", "NOIMG") or gtin not in prices:
                skipped += 1
                continue
            m = re.fullmatch(rf"({host_re})({path_re})", addr)
            if not m:
                print(f"  not a {retailer} product-photo address, skipped: {gtin} {addr[:80]}")
                skipped += 1
                continue
            url = "https://" + addr + HOSTS[retailer][2]
            pr = prices[gtin]
            old = rows.get(gtin)
            if old and old["image_url"] == url and old.get("file"):
                continue  # already fetched from the same address
            rows[gtin] = {"gtin": gtin, "image_url": url, "page_url": pr["page_url"], "checked_on": pr["checked_on"], "file": "" if not old or old["image_url"] != url else old.get("file", "")}
            added += 1
    write_rows(retailer, rows)
    print(f"{retailer}: {added} photo addresses added or changed, {skipped} lines skipped, {len(rows)} rows in {csv_path(retailer).relative_to(ROOT)}")


def download(retailer: str, cache: Path) -> int:
    rows = read_rows(retailer)
    todo = [r for r in rows.values() if not r.get("file")]
    done = failed = 0
    for r in sorted(todo, key=lambda r: r["gtin"]):
        try:
            raw = ic.polite_get(download_url(retailer, r["image_url"]), cache, referer=r["page_url"])
            r["file"] = ic.store_image(retailer, raw)
            done += 1
        except ic.Blocked as e:
            write_rows(retailer, rows)
            print(f"STOPPED (never worked round): {e}\nStored {done} before stopping; the rest stay un-downloaded.")
            return 2
        except (ValueError, OSError) as e:
            failed += 1
            print(f"  skipped {r['gtin']}: {e}")
    write_rows(retailer, rows)
    # Files nothing uses any more are removed, so a rerun never leaves junk behind.
    used = {r["file"] for r in rows.values() if r.get("file")}
    folder = ic.IMAGES_ROOT / retailer
    if folder.is_dir():
        for p in folder.iterdir():
            if p.suffix == ".webp" and p.name not in used:
                p.unlink()
    shared = ic.suspected_placeholders({g: (r["file"], r["page_url"]) for g, r in rows.items() if r.get("file")}, threshold=3)
    print(f"{retailer}: {done} downloaded, {failed} skipped, {sum(1 for r in rows.values() if r.get('file'))} of {len(rows)} rows have a stored photo")
    for f, ids in shared.items():
        print(f"  LOOK AT {f}: used by {len(ids)} products ({', '.join(ids[:5])}...): a placeholder? drop those rows if it is not a real photo")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("retailer", choices=sorted(STORE))
    ap.add_argument("--ingest", nargs="+", metavar="FILE", help="lines `gtin|host/path|ALT` to add (no download)")
    ap.add_argument("--cache", type=Path, default=Path("/private/tmp/grocery-image-cache"))
    args = ap.parse_args()
    if args.ingest:
        ingest(args.retailer, args.ingest)
        return 0
    return download(args.retailer, args.cache)


if __name__ == "__main__":
    sys.exit(main())
