#!/usr/bin/env python3
"""Choose which products get a stored copy of the shop's own photo (Option D, founder's decision 2026-10-09), and fetch them.

    python3 tools/groceries/select_stored_photos.py              # choose + download (1 request a second per host)
    python3 tools/groceries/select_stored_photos.py --dry-run    # choose only, print the numbers
    python3 tools/groceries/select_stored_photos.py --cap 3000   # the most products to store a copy for (default 3000, about 30 MB)

Order of preference (the products people see first): products with a price from any shop, then the app's default ranking, "Most protein per 100 kcal"
(ties by barcode). Only products whose shop lets us keep a copy (fetch_retailer_images.STORE; never Tesco) and whose built record already has the shop's
own picture address (`retailerImage`, written by build_groceries.py from the shop's own pages) are considered. Each row records the shop page that showed the
picture (a price row's page, else the page of its listing row), so a photo is never matched on its own.

Run `python3 tools/groceries/build_groceries.py --images-only` afterwards (adds `photo` to the products) and look at `photo_sheet.py` before committing.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_groceries as bg  # noqa: E402
import fetch_retailer_images as fri  # noqa: E402

GROCERIES = ROOT / "web" / "public" / "groceries"
DEFAULT_CAP = 3000


def density(p: dict) -> float:
    return p["protein"] / p["kcal"] * 100 if p.get("kcal", 0) > 0 else 0.0


def load_built(retailers) -> dict[str, list[dict]]:
    out = {}
    for rid in retailers:
        path = GROCERIES / f"{rid}.json"
        out[rid] = json.loads(path.read_text())["products"] if path.exists() else []
    return out


def provenance(rid: str) -> dict[str, tuple[str, str]]:
    """norm barcode -> (shop page, date) from the shop's price rows, then from its listing rows (product ids joined to barcodes)."""
    found: dict[str, tuple[str, str]] = {}
    base = ROOT / "data" / "groceries"
    disc, codes = base / "discovery" / f"{rid}.csv", base / "discovery" / f"{rid}-barcodes.csv"
    if disc.exists() and codes.exists():
        with open(codes, newline="", encoding="utf-8-sig") as f:
            by_id = {(r.get("product_id") or "").strip(): bg.norm_code(r.get("gtin") or "") for r in csv.DictReader(f)}
        with open(disc, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                code, url, day = by_id.get((r.get("product_id") or "").strip()), (r.get("page_url") or "").strip(), (r.get("checked_on") or "").strip()
                if code and url.startswith("https://") and day:
                    found[code] = (url, day)
    prices = base / "prices" / f"{rid}.csv"
    if prices.exists():
        with open(prices, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                code, url, day = bg.norm_code(r.get("gtin") or ""), (r.get("page_url") or "").strip(), (r.get("checked_on") or "").strip()
                if code and url.startswith("https://") and day:
                    found[code] = (url, day)  # a price row's page wins
    return found


def accepted(rid: str, url: str) -> bool:
    host_re, path_re, _ = fri.HOSTS[rid]
    return bool(re.fullmatch(rf"https://({host_re})({path_re})", url or ""))


def choose(built: dict[str, list[dict]], prov: dict[str, dict[str, tuple[str, str]]], cap: int) -> tuple[dict[str, dict[str, dict]], dict]:
    """Pure part of the selection: `built` = each shop's built products, `prov` = each shop's {norm barcode: (page, date)}."""
    priced = {bg.norm_code(p["gtin"]) for products in built.values() for p in products if p.get("price")}
    cands = []  # (rank key, shop, product)
    for rid in fri.STORE:
        excluded = bg.read_excludes(rid)  # pictures left out after looking (docs/GROCERIES_PLAN.md): a rerun must not bring them back
        for p in built.get(rid, []):
            if bg.norm_code(p["gtin"]) not in excluded and accepted(rid, p.get("retailerImage", "")):
                code = bg.norm_code(p["gtin"])
                cands.append(((code not in priced, -density(p), p["gtin"]), rid, p))
    cands.sort(key=lambda c: c[0])
    chosen: dict[str, dict[str, dict]] = {rid: {} for rid in fri.STORE}
    stats = {"considered": len(cands), "no_page": 0, "priced": 0}
    for key, rid, p in cands:
        if sum(len(v) for v in chosen.values()) >= cap:
            break
        page = prov.get(rid, {}).get(bg.norm_code(p["gtin"]))
        if not page:
            stats["no_page"] += 1
            continue
        chosen[rid][p["gtin"]] = {"gtin": p["gtin"], "image_url": p["retailerImage"], "page_url": page[0], "checked_on": page[1]}
        stats["priced"] += 0 if key[0] else 1
    return chosen, stats


def select(cap: int) -> tuple[dict[str, dict[str, dict]], dict]:
    built = load_built(fri.HOSTS)  # every shop, to know which barcodes are priced anywhere
    return choose(built, {rid: provenance(rid) for rid in fri.STORE}, cap)


def too_big(retailer: str, fname: str) -> bool:
    """A copy stored at the old 640 px size is stored again at 400."""
    from PIL import Image
    path = fri.ic.IMAGES_ROOT / retailer / fname
    try:
        with Image.open(path) as im:
            return max(im.size) > fri.ic.MAX_SIDE
    except OSError:
        return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cap", type=int, default=DEFAULT_CAP)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--cache", type=Path, default=Path("/private/tmp/grocery-image-cache"))
    args = ap.parse_args()
    chosen, stats = select(args.cap)
    for rid, rows in chosen.items():
        old = fri.read_rows(rid)
        merged = {}
        for g, r in rows.items():
            prev = old.get(g)
            if prev and prev.get("file") and prev["image_url"] == r["image_url"] and not too_big(rid, prev["file"]):
                r["file"] = prev["file"]  # already stored at the right size
            else:
                r["file"] = ""
            merged[g] = r
        print(f"{rid}: {len(merged)} chosen of {stats['considered']} with a photo address ({stats['priced']} priced, {stats['no_page']} skipped for lack of a shop page); "
              f"{sum(1 for r in merged.values() if not r['file'])} to download")
        if not args.dry_run:
            fri.write_rows(rid, merged)
    if args.dry_run:
        return 0
    code = 0
    for rid in fri.STORE:
        code = max(code, fri.download(rid, args.cache))
    return code


if __name__ == "__main__":
    sys.exit(main())
