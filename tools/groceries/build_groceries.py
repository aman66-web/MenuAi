#!/usr/bin/env python3
"""Build web/public/groceries/ (one JSON per retailer + a manifest) from the Open Food Facts cache and the price files.

    python3 tools/groceries/build_groceries.py [--cache /private/tmp/off-cache] [--out web/public/groceries]

Inputs
  * the cache written by tools/groceries/fetch_off.py (barcode, name, brand, size, per-100 g nutrition, allergens, photo): COMMUNITY data
  * data/groceries/prices/<retailer>.csv (optional): `gtin,price_gbp,unit_price_gbp,unit,page_url,checked_on` from the retailer's own
    website (collected in the founder's own Chrome: docs/NEXT_GROCERIES_PROMPT.md). Never estimated; a product without a row has no price.

Rules (docs/GROCERIES_PLAN.md, CLAUDE.md rule 1): numbers are copied, never invented or converted; a product is published only with a valid
barcode (GS1 check digit), a name, and kcal, protein, carbs and fat per 100 g/ml all present and plausible. Allergens are the open
database's tags mapped to the 14 UK allergens; "unknown" (no ingredients and no allergen tags) is kept as unknown, never as "none".
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RETAILERS = {"tesco": "Tesco", "sainsburys": "Sainsbury's", "asda": "Asda", "waitrose": "Waitrose", "lidl": "Lidl", "aldi": "Aldi",
             "morrisons": "Morrisons", "coop": "Co-op", "marks-and-spencer": "M&S", "iceland": "Iceland", "ocado": "Ocado"}
IMAGE_HOST = "https://images.openfoodfacts.org/images/products/"

ALLERGEN_TAGS = {
    "en:celery": "celery", "en:gluten": "gluten", "en:crustaceans": "crustaceans", "en:eggs": "eggs", "en:fish": "fish", "en:lupin": "lupin",
    "en:milk": "milk", "en:molluscs": "molluscs", "en:mustard": "mustard", "en:nuts": "nuts", "en:peanuts": "peanuts",
    "en:sesame-seeds": "sesame", "en:soybeans": "soya", "en:sulphur-dioxide-and-sulphites": "sulphites",
}
ALLERGEN_ORDER = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts", "sesame", "soya", "sulphites"]

# First matching group wins (checked in this order against the product's category tags).
CATEGORY_RULES = [
    ("frozen", ["frozen"]),
    ("drinks", ["beverages", "drinks", "waters", "juices", "sodas", "teas", "coffees", "beers", "wines", "spirits", "milkshakes", "smoothies"]),
    ("ready-meals", ["meals", "pizzas", "pies", "sandwiches", "soups", "ready-meals", "lasagnes", "curries", "salads-prepared", "wraps"]),
    ("breakfast", ["breakfast-cereals", "cereals-and-their-products", "granolas", "mueslis", "porridges", "oat-flakes", "breakfasts"]),
    ("bakery", ["breads", "bakery", "pastries", "cakes", "biscuits", "croissants", "bagels", "muffins", "buns", "crackers", "rolls"]),
    ("dairy-eggs", ["dairies", "milks", "yogurts", "cheeses", "butters", "creams", "eggs", "dairy-substitutes", "plant-based-milks"]),
    ("meat", ["meats", "poultries", "sausages", "bacons", "hams", "beef", "pork", "chicken", "turkey", "lamb", "meat-based-products"]),
    ("fish", ["fishes", "seafood", "salmons", "tunas", "prawns", "fish-and-seafood", "fishes-and-their-products"]),
    ("fruit-veg", ["fruits", "vegetables", "salads", "potatoes", "fruits-and-vegetables-based-foods", "fresh-foods-of-plant-origin"]),
    ("snacks-sweets", ["snacks", "crisps", "chocolates", "confectioneries", "sweets", "candies", "popcorn", "bars", "nuts", "chewing-gum", "desserts"]),
    ("cupboard", ["sauces", "condiments", "oils", "spices", "vinegars", "dressings", "spreads", "jams", "honeys", "pastas", "rices", "flours", "canned-foods", "pulses", "grains", "noodles", "groceries", "seasonings", "stocks"]),
]
CATEGORY_LABELS = {
    "dairy-eggs": "Dairy and eggs", "meat": "Meat", "fish": "Fish and seafood", "bakery": "Bakery", "breakfast": "Breakfast", "fruit-veg": "Fruit and veg",
    "snacks-sweets": "Snacks and sweets", "drinks": "Drinks", "ready-meals": "Ready meals", "cupboard": "Cupboard", "frozen": "Frozen", "other": "Other",
}


def gtin_ok(code: str) -> bool:
    """GS1 check digit for GTIN-8/12/13/14."""
    if not re.fullmatch(r"\d{8}|\d{12}|\d{13}|\d{14}", code):
        return False
    digits = [int(c) for c in code]
    body, check = digits[:-1], digits[-1]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def category_for(tags: list[str]) -> str:
    """Open Food Facts lists category tags from general to specific; the most specific tag that matches a rule decides
    (so 'sandwich pickle' is a condiment even though a general tag higher up says 'beverages and foods')."""
    if any("frozen" in t.split(":", 1)[-1].split("-") for t in tags or []):
        return "frozen"  # frozen is a state, not a type: a frozen pizza is filed under Frozen
    for t in reversed(tags or []):
        slug = t.split(":", 1)[-1]
        words = {slug, *slug.split("-")}
        for group, keys in CATEGORY_RULES:
            if any(k in words for k in keys):
                return group
    return "other"


def tidy(text: str) -> str:
    """SHOUTED community entries ("TESCO CHICKEN BREAST SLICES") become ordinary capitals; mixed-case text is left as entered."""
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 4 or not all(c.isupper() for c in letters):
        return text
    out = re.sub(r"[A-Za-z]+(?:'[A-Za-z]+)?", lambda m: m.group(0).capitalize(), text)
    return re.sub(r"\b(And|Of|With|In|On|The|A|Or|For|To)\b", lambda m: m.group(0).lower(), out).replace("'S", "'s")[:1].upper() + re.sub(r"\b(And|Of|With|In|On|The|A|Or|For|To)\b", lambda m: m.group(0).lower(), out).replace("'S", "'s")[1:]


def name_ok(name: str) -> bool:
    """Community entries sometimes hold scanned-text junk ('t out 1016 TESCO CHICKEN PASTE QUICK & TASTY of th'): leave those out."""
    words = name.split()
    if len(words) > 14 or not re.search(r"[A-Za-z]{3}", name):
        return False
    if len(words[0]) == 1 and words[0].islower() and words[0] not in {"a"}:  # a fragment that starts mid-word
        return False
    if re.search(r"\b\d{3,}\b", name) and sum(1 for w in words if w.isupper() and len(w) > 2) >= 2:  # numbers mixed with SHOUTED words
        return False
    return True


def num(x):
    if x is None or x == "":
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v and v not in (float("inf"), float("-inf")) else None


def r1(v: float) -> float:
    out = round(v + 1e-9, 1)
    return int(out) if out == int(out) else out


def r2(v: float) -> float:
    out = round(v + 1e-9, 2)
    return int(out) if out == int(out) else out


def allergens_from(p: dict):
    """(contains, mayContain) as our 14 keys, or None when the database has neither ingredients nor allergen tags (unknown, NOT 'none')."""
    tags, traces = p.get("allergens_tags") or [], p.get("traces_tags") or []
    if not tags and not traces and not (p.get("ingredients_text_en") or p.get("ingredients_text") or "").strip():
        return None
    contains = {ALLERGEN_TAGS[t] for t in tags if t in ALLERGEN_TAGS}
    may = {ALLERGEN_TAGS[t] for t in traces if t in ALLERGEN_TAGS} - contains
    order = ALLERGEN_ORDER.index
    return {"contains": sorted(contains, key=order), "mayContain": sorted(may, key=order)}


def image_base(p: dict):
    """'500/016/816/4012/front_en.123' from the front photo's address (sizes .100/.200/.400/.full are added by the app)."""
    for key in ("image_front_url", "image_front_small_url"):
        m = re.search(r"/images/products/(.+?)\.(?:\d+|full)\.jpg", p.get(key) or "")
        if m:
            return m.group(1)
    return None


def convert(p: dict, reasons: dict) -> dict | None:
    def skip(why: str):
        reasons[why] = reasons.get(why, 0) + 1
        return None

    code = str(p.get("code") or "").strip()
    if not gtin_ok(code):
        return skip("invalid barcode")
    name = tidy(" ".join((p.get("product_name_en") or p.get("product_name") or "").split()))
    if not name or len(name) > 100 or not name_ok(name):
        return skip("no usable name")
    n = p.get("nutriments") or {}
    kcal, protein, carbs, fat = (num(n.get(k)) for k in ("energy-kcal_100g", "proteins_100g", "carbohydrates_100g", "fat_100g"))
    if None in (kcal, protein, carbs, fat):
        return skip("kcal, protein, carbs or fat missing")
    if min(kcal, protein, carbs, fat) < 0 or max(protein, carbs, fat) > 100 or protein + carbs + fat > 101 or kcal > 950:
        return skip("implausible numbers")
    est = 4 * protein + 4 * carbs + 9 * fat
    if kcal >= 40 and abs(kcal - est) / kcal > 0.4 and abs(kcal - est) > 50:
        return skip("energy doesn't match macros (check)")
    qty = " ".join((p.get("quantity") or "").split())
    per = "ml" if re.search(r"\b\d+(\.\d+)?\s*(ml|cl|l|litres?)\b", qty, re.I) else "g"
    out: dict = {"gtin": code, "name": name, "brand": tidy(" ".join((p.get("brands") or "").split())), "size": qty, "per": per,
                 "kcal": r1(kcal), "protein": r1(protein), "carbs": r1(carbs), "fat": r1(fat)}
    for key, field, dec in (("saturates", "saturated-fat_100g", r1), ("sugars", "sugars_100g", r1), ("fibre", "fiber_100g", r1), ("salt", "salt_100g", r2), ("kj", "energy-kj_100g", lambda v: int(round(v)))):
        v = num(n.get(field))
        if v is not None and v >= 0:
            out[key] = dec(v)
    sq = num(p.get("serving_quantity"))
    sk, sp, sc, sf = (num(n.get(k)) for k in ("energy-kcal_serving", "proteins_serving", "carbohydrates_serving", "fat_serving"))
    if sq and sq > 0 and None not in (sk, sp, sc, sf) and (p.get("serving_size") or "").strip():
        out["serving"] = {"size": " ".join(p["serving_size"].split()), "kcal": r1(sk), "protein": r1(sp), "carbs": r1(sc), "fat": r1(sf)}
    al = allergens_from(p)
    out["allergens"] = al
    img = image_base(p)
    if img:
        out["image"] = img
    out["category"] = category_for(p.get("categories_tags") or [])
    t = num(p.get("last_modified_t"))
    if t:
        out["updated"] = datetime.fromtimestamp(t, timezone.utc).date().isoformat()
    return out


def read_prices(retailer: str, problems: list) -> dict:
    path = ROOT / "data" / "groceries" / "prices" / f"{retailer}.csv"
    prices: dict = {}
    if not path.exists():
        return prices
    with open(path, newline="", encoding="utf-8-sig") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            code, price = (r.get("gtin") or "").strip(), num(r.get("price_gbp"))
            url, checked = (r.get("page_url") or "").strip(), (r.get("checked_on") or "").strip()
            if not gtin_ok(code) or price is None or not (0 < price < 500) or not url.startswith("https://") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", checked):
                problems.append(f"{path.name} line {line}: bad row (gtin, price_gbp, https page_url and checked_on are required)")
                continue
            entry = {"amount": r2(price), "url": url, "checkedOn": checked}
            unit_price, unit = num(r.get("unit_price_gbp")), (r.get("unit") or "").strip()
            if unit_price is not None and unit_price > 0 and unit:
                entry["perUnit"] = {"amount": r2(unit_price), "unit": unit}
            prices[code] = entry
    return prices


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path("/private/tmp/off-cache"))
    ap.add_argument("--out", type=Path, default=ROOT / "web" / "public" / "groceries")
    args = ap.parse_args()
    today = date.today().isoformat()
    args.out.mkdir(parents=True, exist_ok=True)
    manifest = {"v": 1, "generatedOn": today, "source": "Open Food Facts contributors (ODbL); photos CC BY-SA", "retailers": [], "categories": [{"id": k, "label": v} for k, v in CATEGORY_LABELS.items()]}
    report = ["# Groceries build report", "", f"Built {today} from the Open Food Facts cache ({args.cache}).", "", "| retailer | products | with photo | allergens known | with price |", "|---|---|---|---|---|"]
    reasons_total: dict = {}
    problems: list = []
    for rid, label in RETAILERS.items():
        pages = sorted(args.cache.glob(f"{rid}-*.json"))
        seen: dict = {}
        reasons: dict = {}
        for page in pages:
            for p in json.loads(page.read_text()).get("products", []):
                code = str(p.get("code") or "").strip()
                if code in seen:
                    continue
                item = convert(p, reasons)
                if item:
                    seen[code] = item
        prices = read_prices(rid, problems)
        products = list(seen.values())
        for it in products:
            if it["gtin"] in prices:
                it["price"] = prices[it["gtin"]]
        for k, v in reasons.items():
            reasons_total[(rid, k)] = v
        doc = {"v": 1, "retailer": rid, "name": label, "generatedOn": today, "source": manifest["source"], "products": products}
        file = f"{rid}.json"
        text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
        (args.out / file).write_text(text)
        manifest["retailers"].append({"id": rid, "name": label, "file": file, "count": len(products), "sha256": hashlib.sha256(text.encode()).hexdigest()})
        report.append(f"| {label} | {len(products)} | {sum(1 for p in products if 'image' in p)} | {sum(1 for p in products if p['allergens'] is not None)} | {sum(1 for p in products if 'price' in p)} |")
        print(f"{rid}: {len(products)} products")
    (args.out / "groceries-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    report += ["", "## Left out (and why)", ""] + [f"- {rid}: {why}: {n}" for (rid, why), n in sorted(reasons_total.items())] + (["", "## Problems with price files", ""] + [f"- {p}" for p in problems] if problems else [])
    (ROOT / "data" / "groceries" / "REPORT.md").write_text("\n".join(report) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
