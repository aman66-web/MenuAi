#!/usr/bin/env python3
"""Each listed product's own page address, from the shop's own product sitemap (founder 2026-10-11: Asda, Aldi and Lidl lists with photos).

    python3 tools/groceries/shop_pages.py aldi lidl          # writes data/groceries/listing/<shop>-pages.csv  (product_id,page_url)

The category crawls (data/groceries/listing/<shop>.csv) kept each product's id but not its page address, which carries a name slug the app can't
make up. The shops publish every product page in a sitemap that robots.txt points to and allows, so one request per shop gives the exact addresses:
  * Aldi  https://www.aldi.co.uk/sitemap_products.xml        .../product/<slug>-<18-digit id>   (our id = the number without leading zeros)
  * Lidl  https://www.lidl.co.uk/p/export/GB/en/product_sitemap.xml.gz   .../p/<slug>/p<digits>  (our id = p<digits>)
Asda refuses this environment (403), so Asda gets no page addresses: the app links to the shop's own search for the product name instead.
Fetched with tools/uk_extract/images_common.polite_get (robots.txt honoured, never works round a block). Only ids in the listing are written.
Aldi answers that client 403 (even for robots.txt), so it is never asked again from here: its sitemap was read once on 2026-10-11 with a plain request
that its robots.txt allowed, and is passed in with `--from aldi=FILE` (a copy saved from the founder's browser works the same way).
"""
from __future__ import annotations

import argparse
import csv
import gzip
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "uk_extract"))
import images_common as ic  # noqa: E402

SITEMAPS = {
    "aldi": "https://www.aldi.co.uk/sitemap_products.xml",
    "lidl": "https://www.lidl.co.uk/p/export/GB/en/product_sitemap.xml.gz",
}
PATTERNS = {
    # group 1 = the page path after the shop's product base, group 2 = our product id
    "aldi": re.compile(r"<loc>https://www\.aldi\.co\.uk/product/([a-z0-9-]+-(\d{18}))</loc>"),
    "lidl": re.compile(r"<loc>https://www\.lidl\.co\.uk/p/([a-z0-9-]+/(p\d+))</loc>"),
}
BASES = {"aldi": "https://www.aldi.co.uk/product/", "lidl": "https://www.lidl.co.uk/p/"}


def page_paths(shop: str, xml: str) -> dict[str, str]:
    """{product id: page path} from a sitemap's text (Aldi ids lose their leading zeros, as in the listing)."""
    out: dict[str, str] = {}
    for m in PATTERNS[shop].finditer(xml):
        pid = str(int(m.group(2))) if shop == "aldi" else m.group(2)
        out.setdefault(pid, m.group(1))
    return out


def listing_ids(shop: str) -> list[str]:
    with open(ROOT / "data" / "groceries" / "listing" / f"{shop}.csv", newline="", encoding="utf-8") as f:
        return [r["product_id"] for r in csv.DictReader(f)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("shops", nargs="+", choices=sorted(SITEMAPS))
    ap.add_argument("--cache", type=Path, default=Path("/tmp/shop-sitemap-cache"))
    ap.add_argument("--from", dest="saved", action="append", default=[], metavar="SHOP=FILE", help="a sitemap already saved (no request is made for that shop)")
    a = ap.parse_args()
    saved = dict(x.split("=", 1) for x in a.saved)
    for shop in a.shops:
        if shop in saved:
            raw = Path(saved[shop]).read_bytes()
        else:
            try:
                raw = ic.polite_get(SITEMAPS[shop], a.cache, accept="application/xml,text/xml,*/*;q=0.8")
            except ic.Blocked as e:
                print(f"{shop}: STOPPED (never worked round): {e}")
                return 2
        text = (gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw).decode("utf-8", "replace")
        paths = page_paths(shop, text)
        ids = listing_ids(shop)
        out = ROOT / "data" / "groceries" / "listing" / f"{shop}-pages.csv"
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(["product_id", "page_url"])
            for pid in ids:
                if pid in paths:
                    w.writerow([pid, BASES[shop] + paths[pid]])
        print(f"{shop}: {len(paths)} products in the sitemap, {sum(1 for i in ids if i in paths)} of {len(ids)} listed products have a page address -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
