#!/usr/bin/env python3
"""Turn the raw category-listing crawl of one supermarket into data/groceries/listing/<retailer>.csv (+ -coverage.csv).

    python3 tools/groceries/ingest_listing.py sainsburys results/sainsburys_listing.txt [more raw files] [--checked-on 2026-10-08] [--out data/groceries/listing]

Raw input (written by the crawling agents, docs/NEXT_GROCERIES_DISCOVERY_PROMPT.md "Tier 1"): a header line per listing page
`#CAT <category path> | <category url> | Page k of N | tiles T`, then one line per product, copied exactly as the extractor printed it:
`product_id|name|price|unit_price|unit|price2|unit_price2|card|photo` (9 fields; the first pilot used 8: no photo, and `N` = Nectar).
When `card` is set the FIRST price pair is the loyalty-card price and the SECOND is the regular price; otherwise the first pair is the regular price.

Nothing is invented: a field the line doesn't have stays blank, numbers are copied, a line that doesn't parse is reported and left out.
One row per product id (a product listed in several categories keeps every category path, " | "-separated).
Output columns: product_id,name,price_gbp,unit_price_gbp,unit,member_price_gbp,member_scheme,category_path,page_url,image_url,checked_on
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import OrderedDict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRODUCT_URL = {
    "sainsburys": "https://www.sainsburys.co.uk/groceries/product/{id}",
    "tesco": "https://www.tesco.com/groceries/en-GB/products/{id}",
}
HEADER = ["product_id", "name", "price_gbp", "unit_price_gbp", "unit", "member_price_gbp", "member_scheme", "category_path", "page_url", "image_url", "checked_on"]
UNITS = {"kg": "per kg", "litre": "per litre", "l": "per litre", "ltr": "per litre", "ea": "each", "each": "each", "unit": "each"}


def num(s: str):
    s = (s or "").strip()
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return v if 0 <= v < 5000 else None


# Tesco's crawl printed the picture as the path after this address with the ".jpeg" ending and the query string taken off (raw/tesco_listing.txt, first
# line: "add both back to rebuild the address"); the query put back is the tile size the listing showed (the same as the discovery lists' addresses).
TESCO_MEDIA = "https://digitalcontent.api.tesco.com/v2/media/"
TESCO_TILE = "?h=225&w=225"


def image_url(retailer: str, photo: str) -> str:
    photo = (photo or "").strip()
    if not photo or photo.upper() == "NOIMG":
        return ""
    if re.fullmatch(r"\d+", photo) and retailer == "sainsburys":
        return f"https://assets.sainsburys-groceries.co.uk/gol/{photo}/1/640x640.jpg"
    if retailer == "tesco" and not photo.startswith("https://"):
        path = photo.lstrip("/")
        if re.fullmatch(r"ghs/[0-9a-f-]{36}/[0-9a-f-]{36}(?:_\d+)?", path):
            return f"{TESCO_MEDIA}{path}.jpeg{TESCO_TILE}"
        return ""  # Tesco's "no image" tile (ghs-mktg/.../no-image) or anything else: no picture
    if photo.startswith("https://"):
        return photo
    return "https://" + photo.lstrip("/") if "/" in photo else ""


def parse(retailer: str, files: list[str], checked_on: str, url_template: str | None):
    rows: "OrderedDict[str, dict]" = OrderedDict()
    cov: "OrderedDict[tuple, dict]" = OrderedDict()
    problems: list[str] = []
    cat, cat_url = "", ""
    template = url_template or PRODUCT_URL.get(retailer, "")
    for fn in files:
        for ln, raw in enumerate(Path(fn).read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            if not line:
                continue
            if line.startswith("#CAT"):
                parts = [p.strip() for p in line[4:].split("|")]
                cat = parts[0] if parts else ""
                cat_url = parts[1] if len(parts) > 1 else ""
                key = (cat, re.sub(r"/opt/page:\d+$", "", cat_url))
                c = cov.setdefault(key, {"pages": 0, "tiles": 0, "pageinfo": ""})
                c["pages"] += 1
                m = re.search(r"tiles\s+(\d+)", line)
                c["tiles"] += int(m.group(1)) if m else 0
                c["pageinfo"] = next((p for p in parts if p.startswith("Page ")), c["pageinfo"])
                continue
            if line.startswith("#") or line.startswith("Page ") or re.match(r"^N \d+", line):
                continue
            f = [x.strip() for x in line.split("|")]
            if len(f) < 8:
                problems.append(f"{Path(fn).name}:{ln}: too few fields ({len(f)})")
                continue
            f += [""] * (9 - len(f))
            pid, name, p1, u1, unit, p2, u2, card, photo = f[:9]
            if len(f) > 9 or not pid or " " in pid or not name:
                problems.append(f"{Path(fn).name}:{ln}: bad id or name")
                continue
            is_nectar_flag = card == "N"
            scheme = "Nectar price" if is_nectar_flag else card
            first, second = num(p1), num(p2)
            if scheme and second is None:
                problems.append(f"{Path(fn).name}:{ln}: card price without a regular price ({pid})")
                continue
            if scheme:
                member, regular, unit_price = first, second, num(u2)
                if member is None or regular is None or not member < regular:
                    problems.append(f"{Path(fn).name}:{ln}: card price not below regular ({pid})")
                    continue
            else:
                member, regular, unit_price = None, first, num(u1)
            unit_txt = UNITS.get(unit.lower(), unit) if unit else ""
            row = rows.get(pid)
            if row is None:
                row = rows[pid] = {
                    "product_id": pid, "name": name,
                    "price_gbp": f"{regular:.2f}" if regular is not None else "",
                    "unit_price_gbp": f"{unit_price:g}" if unit_price is not None else "",
                    "unit": unit_txt if unit_price is not None else "",
                    "member_price_gbp": f"{member:.2f}" if member is not None else "",
                    "member_scheme": scheme if member is not None else "",
                    "category_path": [], "page_url": template.format(id=pid) if template else "",
                    "image_url": image_url(retailer, photo), "checked_on": checked_on,
                }
            elif not row["image_url"]:
                row["image_url"] = image_url(retailer, photo)
            if cat and cat not in row["category_path"] and len(row["category_path"]) < 3:
                row["category_path"].append(cat)
    return rows, cov, problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("retailer")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--checked-on", default=date.today().isoformat())
    ap.add_argument("--url-template", help="product page address with {id}, for shops not built in")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "groceries" / "listing")
    a = ap.parse_args()
    rows, cov, problems = parse(a.retailer, a.files, a.checked_on, a.url_template)
    a.out.mkdir(parents=True, exist_ok=True)
    with open(a.out / f"{a.retailer}.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        for r in rows.values():
            w.writerow({**r, "category_path": " | ".join(r["category_path"])})
    with open(a.out / f"{a.retailer}-coverage.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(["category_path", "category_url", "pages_loaded", "tiles_seen", "last_page_info", "checked_on"])
        for (c, u), v in cov.items():
            w.writerow([c, u, v["pages"], v["tiles"], v["pageinfo"], a.checked_on])
    n = len(rows)
    priced = sum(1 for r in rows.values() if r["price_gbp"])
    card = sum(1 for r in rows.values() if r["member_price_gbp"])
    pics = sum(1 for r in rows.values() if r["image_url"])
    print(f"{a.retailer}: {n} unique products from {len(cov)} category pages | priced {priced} | card price {card} | photo address {pics} | skipped lines {len(problems)}")
    for p in problems[:15]:
        print("  ", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
