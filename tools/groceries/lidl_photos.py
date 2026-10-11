#!/usr/bin/env python3
"""Lidl's own photo of each listed product, read from the product's own page (founder 2026-10-11: every shop's products with the shop's own photos).

    python3 tools/groceries/lidl_photos.py [--cache DIR]      # writes data/groceries/images/lidl-listing.csv

Lidl's category tiles gave only a storage key for each picture; the address the shop actually serves (a signed imgproxy-retcat.assets.schwarz URL) is
the og:image of the product's own page. Pages come from data/groceries/listing/lidl-pages.csv (tools/groceries/shop_pages.py, from Lidl's own sitemap);
each is fetched once with tools/uk_extract/images_common.polite_get (robots.txt honoured: Lidl allows /p/; 1 request a second; a 401/403/429 stops the
run and is never worked round). Only an og:image on Lidl's own image host is accepted. Output columns: product_id,image_url,page_url,checked_on, the
format tools/groceries/build_all_products.py reads (read_listing_photos).
"""
from __future__ import annotations

import argparse
import csv
import html
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
import images_common as ic  # noqa: E402

HOST = "https://imgproxy-retcat.assets.schwarz/"
OG = re.compile(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"|<meta[^>]+content="([^"]+)"[^>]+property="og:image"')


def og_image(page: str) -> str:
    """The page's og:image when it is on Lidl's own image host (else "")."""
    m = OG.search(page)
    url = html.unescape((m.group(1) or m.group(2)) if m else "")
    return url if url.startswith(HOST) and re.fullmatch(r"https://imgproxy-retcat\.assets\.schwarz/[A-Za-z0-9_\-./:=]{10,400}", url) else ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path("/tmp/lidl-page-cache"))
    a = ap.parse_args()
    with open(ROOT / "data" / "groceries" / "listing" / "lidl-pages.csv", newline="", encoding="utf-8") as f:
        pages = [(r["product_id"], r["page_url"]) for r in csv.DictReader(f)]
    out = ROOT / "data" / "groceries" / "images" / "lidl-listing.csv"
    rows, missing, today = [], [], date.today().isoformat()
    for pid, url in pages:
        if not url.startswith("https://www.lidl.co.uk/p/") or not url.endswith("/" + pid):
            continue
        try:
            text = ic.polite_get(url, a.cache, accept="text/html,*/*;q=0.8").decode("utf-8", "replace")
        except ic.Blocked as e:
            print(f"STOPPED (never worked round): {e}. Kept the {len(rows)} read so far.")
            break
        except OSError as e:
            missing.append(f"{pid} ({e})")
            continue
        img = og_image(text)
        if img:
            rows.append([pid, img, url, today])
        else:
            missing.append(pid)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["product_id", "image_url", "page_url", "checked_on"])
        w.writerows(rows)
    print(f"lidl: {len(rows)} of {len(pages)} product pages give the shop's own photo -> {out.relative_to(ROOT)}; none on: {', '.join(missing[:10])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
