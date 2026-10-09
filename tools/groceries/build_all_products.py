#!/usr/bin/env python3
"""Build the "every product" files for the web app from the store listing crawls (docs/GROCERIES_PLAN.md, founder 2026-10-09).

    python3 tools/groceries/build_all_products.py          # writes web/public/groceries/all/<shop>.json + all-manifest.json

Input: data/groceries/listing/<shop>.csv (tools/groceries/ingest_listing.py): one row per product as the shop's own category pages printed it
(name, price, unit price, card price, categories, photo address). These products have NO barcode and NO nutrition unless the shop's page was read
(data/groceries/discovery/<shop>*.csv or details/): the app shows them as "price only" and links to the shop's own page. Nothing is estimated.

Only shops in PUBLISH are written. Add a shop there only after the founder has seen its terms (see data/groceries/listing/raw/<shop>_terms.txt).
Output per shop (compact, one array per product so 17,000 products stay about 3 MB before compression):
  {"v":1,"retailer","name","checkedOn","pageBase","photoBase","categories":[top-level names],"schemes":[card names],
   "nutritionCheckedOn","products":[[id, name, price, unitPrice|null, unit, memberPrice|null, schemeIndex|null, categoryIndex, photoId|"", gtin|"", nutrition|null]]}
`nutrition` is [kcal, protein, carbs, fat, saturates|null, sugars|null, fibre|null, salt|null, kJ|null, "g"|"ml", state] per 100 g/ml, state "" or the word the page's own heading adds ("grilled", "cooked bacon", "prepared"), copied from the product's own page by
tools/groceries/t2_sainsburys.py (data/groceries/nutrition/<shop>.csv); a "<0.5" row counts as 0 (docs/DATA.md); null when that page has not been read.
`id` is the shop's own product slug: the shop's page is pageBase + id. `photoId` is the number in the shop's picture address (photoBase + id + "/image.jpg").
`gtin` is set only where the shop's own product page was read and showed a barcode (data/groceries/discovery/<shop>-barcodes.csv), so the app can link to the full page.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "groceries" / "all"
NAMES = {"sainsburys": "Sainsbury's"}
PUBLISH = ("sainsburys",)  # shops whose lists may be shown in the app; every other crawl stays in data/ only
PAGE_BASE = {"sainsburys": "https://www.sainsburys.co.uk/groceries/product/"}
PHOTO_BASE = {"sainsburys": "https://assets.sainsburys-groceries.co.uk/gol/"}
SLUG = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-_.%]{0,119}")


def num(s: str):
    s = (s or "").strip()
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return round(v, 4) if v >= 0 else None


def gtins_by_slug(shop: str) -> dict:
    """slug -> barcode, from the discovery lists (product page read: product_id, page_url and gtin)."""
    base = ROOT / "data" / "groceries" / "discovery"
    disc, codes = base / f"{shop}.csv", base / f"{shop}-barcodes.csv"
    if not disc.exists() or not codes.exists():
        return {}
    with open(codes, newline="", encoding="utf-8-sig") as f:
        by_id = {(r.get("product_id") or "").strip(): (r.get("gtin") or "").strip() for r in csv.DictReader(f)}
    out = {}
    with open(disc, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            slug = (r.get("page_url") or "").rstrip("/").rsplit("/", 1)[-1].lower()
            g = by_id.get((r.get("product_id") or "").strip(), "")
            if slug and g.isdigit() and 8 <= len(g) <= 14:
                out[slug] = g
    return out


def read_nutrition(shop: str, problems: list, path: Path | None = None) -> dict:
    """slug -> ([kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kJ, per], checked_on), from the shop's own product pages."""
    path = path or ROOT / "data" / "groceries" / "nutrition" / f"{shop}.csv"
    out: dict = {}
    if not path.exists():
        return out
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_groceries as bg  # noqa: E402  (the same number reading and plausibility rules as the catalogue)

    with open(path, newline="", encoding="utf-8-sig") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            slug, per = (r.get("product_id") or "").strip(), (r.get("per") or "").strip()
            main = [bg.printed_num(r.get(k)) for k in ("kcal", "protein_g", "carbs_g", "fat_g")]
            if not SLUG.fullmatch(slug) or per not in ("g", "ml") or None in main or bg.implausible(main[0], main[1], main[2], main[3]):
                problems.append(f"nutrition/{path.name} line {line}: not usable ({slug!r})")
                continue

            def opt(k):
                v = bg.printed_num(r.get(k))
                return None if v is None or v < 0 else round(v, 2)

            state = " ".join((r.get("state") or "").lower().split())[:24]
            out[slug] = ([round(main[0], 1), round(main[1], 1), round(main[2], 1), round(main[3], 1), opt("saturates_g"), opt("sugars_g"), opt("fibre_g"), opt("salt_g"),
                          opt("kj"), per, state], (r.get("checked_on") or "").strip())
    return out


def build_shop(shop: str, problems: list, path: Path | None = None, gtins: dict | None = None, nutrition: dict | None = None) -> dict | None:
    path = path or ROOT / "data" / "groceries" / "listing" / f"{shop}.csv"
    if not path.exists():
        return None
    gt = gtins if gtins is not None else gtins_by_slug(shop)
    nut = nutrition if nutrition is not None else read_nutrition(shop, problems)
    nut_days = set()
    cats: list[str] = []
    schemes: list[str] = []
    products = []
    days = set()
    with open(path, newline="", encoding="utf-8") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            pid, name = (r.get("product_id") or "").strip(), " ".join((r.get("name") or "").split())
            if not SLUG.fullmatch(pid) or len(name) < 2 or name == "?":
                problems.append(f"{shop} line {line}: bad id or name ({pid!r})")
                continue
            price, unit_price = num(r.get("price_gbp")), num(r.get("unit_price_gbp"))
            if price is None or price <= 0:
                continue  # no price printed (out of stock or a placeholder): not listed
            member = num(r.get("member_price_gbp"))
            scheme = (r.get("member_scheme") or "").strip()
            if member is not None and (member >= price or not scheme):
                member = None  # a card price counts only when it is lower and named
            cat = (r.get("category_path") or "").split(" | ")[0].split(" > ")[0].strip()
            if not cat:
                cat = "Other"
            if cat not in cats:
                cats.append(cat)
            if member is not None and scheme not in schemes:
                schemes.append(scheme)
            photo = re.search(r"/gol/(\d+)/", r.get("image_url") or "")
            days.add((r.get("checked_on") or "").strip())
            n = nut.get(pid) or nut.get(pid.lower())
            if n:
                nut_days.add(n[1])
            products.append([pid, name, price, unit_price if unit_price and unit_price > 0 else None, (r.get("unit") or "").strip(),
                             member, schemes.index(scheme) if member is not None else None, cats.index(cat), photo.group(1) if photo else "", gt.get(pid.lower(), ""),
                             n[0] if n else None])
    days.discard("")
    return {"v": 1, "retailer": shop, "name": NAMES[shop], "checkedOn": min(days) if days else "", "pageBase": PAGE_BASE[shop], "photoBase": PHOTO_BASE[shop],
            "categories": cats, "schemes": schemes, "nutritionCheckedOn": min(d for d in nut_days if d) if any(nut_days) else "", "products": products}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"v": 1, "retailers": []}
    problems: list = []
    for shop in PUBLISH:
        doc = build_shop(shop, problems)
        if not doc:
            continue
        text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
        (OUT / f"{shop}.json").write_text(text)
        manifest["retailers"].append({"id": shop, "name": doc["name"], "file": f"{shop}.json", "count": len(doc["products"]), "checkedOn": doc["checkedOn"],
                                      "sha256": hashlib.sha256(text.encode()).hexdigest()})
        print(f"{shop}: {len(doc['products'])} products, {len(text) / 1e6:.1f} MB, {sum(1 for p in doc['products'] if p[9])} with a barcode, {sum(1 for p in doc['products'] if p[10])} with nutrition, {len(doc['categories'])} categories")
    (OUT / "all-manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in problems[:20]:
        print("problem:", p)
    if len(problems) > 20:
        print(f"... and {len(problems) - 20} more problems")
    return 0


if __name__ == "__main__":
    sys.exit(main())
