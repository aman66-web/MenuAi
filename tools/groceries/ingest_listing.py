#!/usr/bin/env python3
"""Turn the raw category-listing crawl of one supermarket into data/groceries/listing/<retailer>.csv (+ -coverage.csv).

    python3 tools/groceries/ingest_listing.py sainsburys results/sainsburys_listing.txt [more raw files] [--checked-on 2026-10-08] [--out data/groceries/listing]

Raw input (written by the crawling agents, docs/NEXT_GROCERIES_DISCOVERY_PROMPT.md "Tier 1"): a header line per listing page
`#CAT <category path> | <category url> | Page k of N | tiles T`, then one line per product, copied exactly as the extractor printed it:
`product_id|name|price|unit_price|unit|price2|unit_price2|card|photo` (9 fields; the first pilot used 8: no photo, and `N` = Nectar; Morrisons adds a 10th,
the tile's size line, which is put after the name when the name doesn't already carry it, as the tile prints the two together).
When `card` is set the FIRST price pair is the loyalty-card price and the SECOND is the regular price; otherwise the first pair is the regular price.
A card value that is a note or a multi-buy (Aldi "note: ...", Morrisons' "... Meal Deal ...") is not a card price; M&S "MULTI"/"FROM" tiles (two prices
without "was", or a "From" price) have no single price, so they are left out. Waitrose loose items ("Typical weight ...") print an estimated price, so
they are left out too (never shown as if it were the shelf price).

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
    "iceland": "https://www.iceland.co.uk/p/x/{id}.html",  # the slug is ignored by Iceland's site (checked once by the crawl)
}
ALDI_MEDIA = "https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/400/"  # + <uuid>/<any file name>: the address the tile uses
ASDA_MEDIA = "https://asdagroceries.scene7.com/is/image/asdagroceries/"  # + the tile's image id (the barcode for branded items)
WAITROSE_MEDIA = "https://ecom-su-static-prod.wtrecom.com/images/products/"  # "D" = 9/LN_<first 6 digits of the product id>_BP_9.jpg (the crawl's note)
MORRISONS_MEDIA = "https://groceries.morrisons.com/images-v3/"  # + <uuid1>/<uuid2>/300x300.jpg; a lone uuid is uuid2 under the crawl's fixed uuid1
MORRISONS_UUID1 = "4b85987b-1398-4173-a0c1-3546047c9d74"
ICELAND_MEDIA = "https://assets.iceland.co.uk/i/"  # + the tile's picture path
MS_MEDIA = "https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/"  # "a:<id>" = this host's image id
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
HEADER = ["product_id", "name", "price_gbp", "unit_price_gbp", "unit", "member_price_gbp", "member_scheme", "category_path", "page_url", "image_url", "checked_on"]
UNITS = {"kg": "per kg", "litre": "per litre", "l": "per litre", "ltr": "per litre", "ea": "each", "each": "each", "unit": "each", "item": "each", "mtr": "per metre"}
# The quantity a unit price is printed per, as (multiplier to per kg / per litre / each, unit): Aldi prints "100 G" or "75 CL", Asda "per 10g", Lidl "kg".
# Only exact conversions of the printed figure (per 100 g x 10 = per kg); a unit we can't read leaves the unit price out (never guessed).
UNIT_QTY = {"g": (1000, "per kg"), "kg": (1, "per kg"), "ml": (1000, "per litre"), "cl": (100, "per litre"), "l": (1, "per litre"), "litre": (1, "per litre"),
            "ltr": (1, "per litre"), "lt": (1, "per litre"), "each": (1, "each"), "ea": (1, "each"), "unit": (1, "each"),
            "gram": (1000, "per kg"), "kilogram": (1, "per kg"), "millilitre": (1000, "per litre")}


def unit_basis(unit: str) -> tuple[float, str] | None:
    """'1 KG' -> (1, 'per kg'), '100 G' -> (10, 'per kg'), '75 CL' -> (1.333.., 'per litre'), 'per litre' -> (1, 'per litre'), 'pomegranate' -> None."""
    u = " ".join((unit or "").lower().replace("per ", "").split())
    if u in UNITS:
        return 1, UNITS[u]
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([a-z]+)", u)
    if not m or m.group(2) not in UNIT_QTY or float(m.group(1)) <= 0:
        return None
    per, label = UNIT_QTY[m.group(2)]
    return per / float(m.group(1)), label


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
    if retailer == "aldi" and not photo.startswith("https://"):
        return f"{ALDI_MEDIA}{photo}/image" if re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", photo) else ""
    if retailer == "asda" and not photo.startswith("https://"):
        return f"{ASDA_MEDIA}{photo}" if re.fullmatch(r"[0-9A-Za-z_-]{4,40}", photo) else ""
    if retailer == "waitrose":
        return ""  # handled in waitrose_image (needs the product id)
    if retailer == "morrisons":
        if re.fullmatch(UUID, photo):
            return f"{MORRISONS_MEDIA}{MORRISONS_UUID1}/{photo}/300x300.jpg"
        return f"{MORRISONS_MEDIA}{photo}/300x300.jpg" if re.fullmatch(f"{UUID}/{UUID}", photo) else ""
    if retailer == "iceland":
        path = photo.split("?")[0].lstrip("/")  # Iceland's image service serves the path with or without a file ending; "&" is sent encoded
        ok = re.fullmatch(r"iceland/[A-Za-z0-9_\-.&]{3,200}", path) and ".." not in path and "loading" not in path
        return f"{ICELAND_MEDIA}{path.replace('&', '%26')}" if ok else ""
    if retailer == "marks-and-spencer":
        return f"{MS_MEDIA}{photo[2:]}" if re.fullmatch(r"a:[A-Za-z0-9_]{6,80}", photo) else ""  # "x:" (another host) is never used
    if retailer == "lidl":
        return photo if photo.startswith("https://imgproxy-retcat.assets.schwarz/") else ""  # the listing kept only a storage key: the address comes from the product page
    if retailer == "tesco" and not photo.startswith("https://"):
        path = photo.lstrip("/")
        if re.fullmatch(r"ghs/[0-9a-f-]{36}/[0-9a-f-]{36}(?:_\d+)?", path):
            return f"{TESCO_MEDIA}{path}.jpeg{TESCO_TILE}"
        return ""  # Tesco's "no image" tile (ghs-mktg/.../no-image) or anything else: no picture
    if photo.startswith("https://"):
        return photo
    return "https://" + photo.lstrip("/") if "/" in photo else ""


def waitrose_image(pid: str, photo: str) -> str:
    """Waitrose's "D" = the shop's own picture of the product line (the first 6 digits of the id); anything else is left without a picture."""
    m = re.match(r"(\d{6})-", pid)
    return f"{WAITROSE_MEDIA}9/LN_{m.group(1)}_BP_9.jpg" if photo.strip() == "D" and m else ""


SIZE = re.compile(r"[\w .,%/x-]{1,30}")
# A name that already carries a quantity ("1664 Blanc ... 4x330ml", "Hot Dogs ... 260g") keeps it as it is: the size line would only repeat it.
HAS_QTY = re.compile(r"\d+(?:\.\d+)?\s*(?:g|kg|ml|cl|l|ltr|litres?)\b|\d+\s*(?:pack|pk|per pack)\b|\bx\s*\d+|\d+\s*x\b", re.I)


def with_size(name: str, size: str) -> str:
    """Morrisons prints the size on its own line under the name: the two together are what the tile shows ("Explore Sable Seedless Grapes 400g")."""
    size = " ".join((size or "").split())
    if not size or not SIZE.fullmatch(size) or HAS_QTY.search(name) or size.replace(" ", "").lower() in name.replace(" ", "").lower():
        return name
    return f"{name} {size}"


def pic(retailer: str, pid: str, photo: str) -> str:
    return waitrose_image(pid, photo) if retailer == "waitrose" else image_url(retailer, photo)


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
            known = re.fullmatch(r"K\|(\S+)", line)
            if known:  # M&S: a tile already printed in full above (only adds this category to it)
                row = rows.get(known.group(1))
                if row is not None and cat and cat not in row["category_path"] and len(row["category_path"]) < 3:
                    row["category_path"].append(cat)
                continue
            f = [x.strip() for x in line.split("|")]
            if len(f) < 8:
                problems.append(f"{Path(fn).name}:{ln}: too few fields ({len(f)})")
                continue
            f += [""] * (10 - len(f))
            pid, name, p1, u1, unit, p2, u2, card, photo, size = f[:10]
            if retailer == "iceland":
                m = re.fullmatch(r"/?p/[^/]*/([A-Za-z0-9]+)\.html", pid)  # a few lines kept the page path instead of its id
                pid = m.group(1) if m else pid
            if len(f) > 10 or not pid or " " in pid or not name:
                problems.append(f"{Path(fn).name}:{ln}: bad id or name")
                continue
            if card in ("MULTI", "FROM"):
                problems.append(f"{Path(fn).name}:{ln}: no single price on the tile ({card}, {pid})")
                continue
            if retailer == "waitrose" and "typical weight" in name.lower():
                problems.append(f"{Path(fn).name}:{ln}: estimated price for a loose item ({pid})")
                continue
            name = with_size(name, size)
            is_nectar_flag = card == "N"
            if card.lower().startswith("note:") or "meal deal" in card.lower():
                card = ""  # Aldi prints a note ("While Stock Lasts", "Save 40%"), Morrisons a meal deal: not a single-item card price, so the first price is the shelf price
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
            basis = unit_basis(unit) if unit else None
            if basis and unit_price is not None:
                unit_price, unit_txt = round(unit_price * basis[0], 2), basis[1]
            else:
                unit_price, unit_txt = None, ""
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
                    "image_url": pic(retailer, pid, photo), "checked_on": checked_on,
                }
            elif not row["image_url"]:
                row["image_url"] = pic(retailer, pid, photo)
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
