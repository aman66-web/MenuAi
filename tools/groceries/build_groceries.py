#!/usr/bin/env python3
"""Build web/public/groceries/ (one JSON per retailer + a manifest) from the Open Food Facts cache and the price files.

    python3 tools/groceries/build_groceries.py [--cache /private/tmp/off-cache] [--out web/public/groceries]
    python3 tools/groceries/build_groceries.py --patch        # redo every step after the download on the files already built (no cache needed)
    python3 tools/groceries/build_groceries.py --images-only  # only re-apply the shops' own photos to the files already built

Inputs
  * the cache written by tools/groceries/fetch_off.py (barcode, name, brand, size, per-100 g nutrition, allergens): COMMUNITY data. Its photos are
    NOT used (founder 2026-10-10: every picture comes from the supermarket's own website)
  * data/groceries/images/<retailer>.csv (optional): the shop's own photo of a product; rows with a `file` are stored copies (see read_photos), written by tools/groceries/select_stored_photos.py
  * data/groceries/prices/<retailer>.csv (optional): `gtin,price_gbp,unit_price_gbp,unit,page_url,checked_on` (+ optional `member_price_gbp,member_scheme,member_offer_ends`: the loyalty-card price beside the regular one) from the retailer's own
    website (collected in the founder's own Chrome: docs/NEXT_GROCERIES_PROMPT.md). Never estimated; a product without a row has no price.
  * data/groceries/discovery/, details/, listing/ (optional): what the shops' own pages printed, used for the shop's photo (exact identifiers only) and as proof
    that a shop sells a barcode (see assign_shops)

Rules (docs/GROCERIES_PLAN.md, CLAUDE.md rule 1): numbers are copied, never invented or converted; a product is published only with a valid
barcode (GS1 check digit), a name, and kcal, protein, carbs and fat per 100 g/ml all present and plausible. Allergens are the open
database's tags mapped to the 14 UK allergens; "unknown" (no ingredients and no allergen tags) is kept as unknown, never as "none".
A supermarket's own-brand product is listed only under that supermarket (assign_shops), whatever the open database's "stores" field says.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RETAILERS = {"tesco": "Tesco", "sainsburys": "Sainsbury's", "asda": "Asda", "waitrose": "Waitrose", "lidl": "Lidl", "aldi": "Aldi",
             "morrisons": "Morrisons", "coop": "Co-op", "marks-and-spencer": "M&S", "iceland": "Iceland", "ocado": "Ocado"}
SOURCE = "Open Food Facts contributors (ODbL)"

ALLERGEN_TAGS = {
    "en:celery": "celery", "en:gluten": "gluten", "en:crustaceans": "crustaceans", "en:eggs": "eggs", "en:fish": "fish", "en:lupin": "lupin",
    "en:milk": "milk", "en:molluscs": "molluscs", "en:mustard": "mustard", "en:nuts": "nuts", "en:peanuts": "peanuts",
    "en:sesame-seeds": "sesame", "en:soybeans": "soya", "en:sulphur-dioxide-and-sulphites": "sulphites",
}
ALLERGEN_ORDER = ["celery", "gluten", "crustaceans", "eggs", "fish", "lupin", "milk", "molluscs", "mustard", "nuts", "peanuts", "sesame", "soya", "sulphites"]

# Umbrella tags the open database puts above whole families of foods. They say nothing about the aisle, and their words mislead: under
# "plant-based-foods-and-beverages" olives, tofu and seeds were filed as Drinks, under "cereals-and-their-products" pastry and couscous as Breakfast.
UMBRELLA_TAGS = {"plant-based-foods-and-beverages", "plant-based-foods", "cereals-and-their-products", "cereals-and-potatoes", "foods-and-beverages", "food", "foods"}

# Clear cases the word rules below got wrong (found by sampling each type chip, 2026-10-10). Each pattern must match a WHOLE tag; they are tried on a tag
# before the word rules, in this order. A product is moved by its tag, never by hand.
SPECIFIC_RULES = [(group, re.compile(pattern)) for group, pattern in (
    # nut and seed butters are spreads, not dairy ("butters")
    ("cupboard", r"(?:[a-z]+-){0,2}(?:peanut|nut|almond|cashew|hazelnut|pistachio|seed|mixed-nut|cereal)-butters?"),
    # chocolate eggs are sweets and Scotch eggs picnic food, not "eggs"; salad cream is a condiment, not cream
    ("snacks-sweets", r"(?:[a-z]+-)?(?:easter|chocolate|creme|caramel)-eggs?"),
    ("ready-meals", r"scotch-eggs?"),
    ("cupboard", r"salad-creams?"),
    # spring rolls aren't bread rolls; prawn crackers and rice cakes are snacks, not bakery; fish cakes are fish
    ("ready-meals", r"(?:vegetable-|duck-|chicken-|mini-)?spring-rolls?"),
    ("snacks-sweets", r"prawn-crackers?|(?:puffed-)?(?:rice|corn)-cakes?(?:-with-[a-z-]+)?"),
    ("fish", r"(?:thai-)?(?:fish|crab|salmon|cod|haddock|tuna|prawn)-?cakes?"),
    # sweet pies, tarts, cheesecakes, doughnuts and viennoiseries are bakery, not ready meals ("pies") or fruit
    ("bakery", r"(?:apple|mince|fruit|sweet|cherry|lemon-meringue|pecan|pumpkin|custard|bakewell|treacle|shelf-stable-sweet|chocolate)-pies?"
               r"|(?:fruit-|custard-|bakewell-|lemon-|treacle-)?tarts?|(?:[a-z]+-)?turnovers?|framboisiers"
               r"|(?:[a-z]+-){0,2}cheesecakes?|(?:jam-|glazed-)?doughnuts?|shortbreads?|snack-biscuit-with-[a-z-]+"),
    ("bakery", r"brioches?(?:-[a-z-]+)?|panettones?|(?:chocolate-|butter-|almond-)?croissants?|pains?-au-chocolat|viennoiseries|(?:filled-)?focaccias?"
               r"|(?:[a-z]+-)*crepes?-filled-with-[a-z-]+|blinis?"),
    ("ready-meals", r"quiches?(?:-[a-z-]+)?|arancini|(?:refrigerated-)?falafels?|moussakas?|burritos?|(?:[a-z]+-)?lasagnes?|potato-dishes|canned-raviolis?|curry|curries"
                    r"|(?:[a-z]+-)+(?:with|without)-side-dishes"),
    # pastry and dough are baking and couscous, bulgur and starch are cupboard foods, not breakfast
    ("bakery", r"(?:(?:puff|shortcrust|filo|pizza|pie|sweet|choux|flaky|pure-butter|butter|raw|cooked|ready-rolled)-){0,3}(?:pastry|doughs?)(?:-sheets?|-blocks?)?"),
    ("cupboard", r"(?:durum-wheat-)?(?:wheat-)?semolinas?(?:-for-couscous)?|couscous|bulgur|(?:corn-)?starch(?:es)?|polenta|quinoa"),
    ("breakfast", r"cereal-flakes(?:-with-[a-z-]+)?|(?:[a-z]+-)?cereals?-with-fruits|(?:[a-z]+-)?breakfast-cereals(?:-[a-z-]+)?|cereal-clusters(?:-with-[a-z-]+)?|extruded-flakes"),
    # olives, pickles, seeds, miso, beans, stock and sauces named after a dish are cupboard foods, not drinks, meat or fruit
    ("cupboard", r"(?:(?!in-|with-)[a-z]+-){0,3}olives(?:-(?:in|stuffed|with)-[a-z-]+)?|olive-tree-products|(?:(?!in-|with-)[a-z]+-){0,3}pickle[sd]?(?:-[a-z]+){0,3}"
                 r"|(?:pickled-)?capers|(?:pickled-)?gherkins?|misos?|miso-pastes?|(?:[a-z]+-)?seeds|legumes|beans|pulses|fats"
                 r"|(?:[a-z]+-)?bouillon(?:-[a-z]+)?|(?:[a-z]+-)?chutneys?|(?:[a-z]+-)?preserves|(?:[a-z]+-)?powders?|(?:[a-z]+-)*tomato-(?:pastes?|purees?)"
                 r"|(?:(?!in-|with-)[a-z]+-){0,3}sauces?|grav(?:y|ies)"),
    ("snacks-sweets", r"chocolate-covered-(?:raisins|fruits|nuts|peanuts|almonds|cranberries|ginger)|barres-aux-[a-z]+|(?:[a-z]+-)*cereal-bars?|rice-puddings?"),
    ("dairy-eggs", r"petit-suisse(?:-[a-z-]+)?"),
    ("drinks", r"juice"),
    # meat alternatives are not meat (vegetarian sausages were under Meat) and not drinks
    ("meat-alternatives", r"tofu|tempeh|seitan|textured-vegetable-protein|meat-analogues(?:-[a-z-]+)?|meat-alternatives?|meat-substitutes?|fish-analogues"
                          r"|(?:[a-z]+-){0,2}(?:chicken|beef|pork|meat|sausage|burger|nugget|kiev|bacon|fish|kefta|lardons|cutlets|prepared-meat-cuts)s?-substitutes|substituts-des-lardons"
                          r"|(?:vegetarian|vegan|plant-based|meat-free)-(?:[a-z]+-){0,2}(?:sausages?|patties|burgers?|hamburgers|nuggets?|grounds?|mince|balls|meatballs|bacon|rashers|chicken|pieces|fillets?|kievs?|schnitzels?)"
                          r"|nuggets-from-soy-and-wheat-proteins"),
    # dishes are ready meals even when they are named after their meat (chicken tikka masala was under Meat)
    ("ready-meals", r"(?:chicken|beef|pork|lamb|turkey|duck|prawn|vegetable)-(?:tikka-masala|curry|curries|korma|jalfrezi|bhuna|madras|balti|biryani|risottos?|soups?|pizzas?|ravioli|lasagnes?|stews?|casseroles?|pakoras?|chow-mein|fried-rice|dishes)"
                    r"|butter-chicken|chicken-and-vegetables-soup|instant-pasta-with-[a-z-]+|pasta-salad-with-[a-z-]+|chil[il]i-con-carne"),
    # baking and cooking basics were "Other"
    ("cupboard", r"(?:(?!in-|with-)[a-z]+-){0,2}(?:sugars?|syrups?|sweeteners?|cocoa-powders?|baking-powders?|baking-mixes|frostings?|sprinkles|icings?|thickeners|lards?|broths?|broth-stock"
                 r"|stuffings?|cooking-helpers|meal-kits|fajitas?-kits?|yeasts?)"),
    ("bakery", r"(?:[a-z]+-)?(?:pancakes?|crepes?|crepes-and-pancakes|flapjacks?|waffles?)(?:-with-[a-z-]+)?"),
)]

# Then the first matching group wins (checked in this order against the words of the tag).
CATEGORY_RULES = [
    ("frozen", ["frozen"]),
    ("drinks", ["beverages", "drinks", "waters", "juices", "sodas", "teas", "coffees", "beers", "wines", "spirits", "milkshakes", "smoothies"]),
    ("ready-meals", ["meals", "pizzas", "pies", "sandwiches", "soups", "ready-meals", "lasagnes", "curries", "salads-prepared", "wraps"]),
    ("breakfast", ["breakfast-cereals", "granolas", "mueslis", "porridges", "porridge", "oat-flakes", "rolled-oats", "breakfasts"]),
    ("bakery", ["breads", "bakery", "pastries", "cakes", "biscuits", "croissants", "bagels", "muffins", "buns", "crackers", "rolls"]),
    ("dairy-eggs", ["dairies", "milks", "yogurts", "cheeses", "butters", "creams", "eggs", "dairy-substitutes", "plant-based-milks"]),
    ("meat", ["meats", "poultries", "sausages", "bacons", "hams", "beef", "pork", "chicken", "turkey", "lamb", "meat-based-products"]),
    ("fish", ["fishes", "seafood", "salmons", "tunas", "prawns", "fish-and-seafood", "fishes-and-their-products"]),
    ("fruit-veg", ["fruits", "vegetables", "salads", "potatoes", "fruits-and-vegetables-based-foods", "fresh-foods-of-plant-origin"]),
    ("snacks-sweets", ["snacks", "crisps", "chocolates", "confectioneries", "sweets", "candies", "popcorn", "bars", "nuts", "chewing-gum", "desserts"]),
    ("cupboard", ["sauces", "condiments", "oils", "spices", "vinegars", "dressings", "spreads", "jams", "honeys", "pastas", "rices", "flours", "canned-foods", "pulses", "grains", "noodles", "groceries", "seasonings", "stocks"]),
]
CATEGORY_LABELS = {
    "dairy-eggs": "Dairy and eggs", "meat": "Meat", "meat-alternatives": "Meat alternatives", "fish": "Fish and seafood", "bakery": "Bakery", "breakfast": "Breakfast",
    "fruit-veg": "Fruit and veg", "snacks-sweets": "Snacks and sweets", "drinks": "Drinks", "ready-meals": "Ready meals", "cupboard": "Cupboard", "frozen": "Frozen", "other": "Other",
}


def gtin_ok(code: str) -> bool:
    """GS1 check digit for GTIN-8/12/13/14."""
    if not re.fullmatch(r"\d{8}|\d{12}|\d{13}|\d{14}", code):
        return False
    digits = [int(c) for c in code]
    body, check = digits[:-1], digits[-1]
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def tag_group(slug: str) -> str | None:
    """The group one category tag points to, or None when it points nowhere (an umbrella tag, or no rule matches)."""
    if slug in UMBRELLA_TAGS:
        return None
    for group, pattern in SPECIFIC_RULES:
        if pattern.fullmatch(slug):
            return group
    words = {slug, *slug.split("-")}
    for group, keys in CATEGORY_RULES:
        if any(k in words for k in keys):
            return group
    return None


def category_for(tags: list[str]) -> str:
    """Open Food Facts lists category tags from general to specific; the most specific tag that matches a rule decides
    (so 'sandwich pickle' is a condiment even though a general tag higher up says 'beverages and foods')."""
    if any("frozen" in t.split(":", 1)[-1].split("-") for t in tags or []):
        return "frozen"  # frozen is a state, not a type: a frozen pizza is filed under Frozen
    for t in reversed(tags or []):
        group = tag_group(t.split(":", 1)[-1])
        if group:
            return group
    return "other"


def recategorise(item: dict) -> str:
    """The group for a product already built, whose full tag list is not kept (only `type`, its most specific tag): when one of SPECIFIC_RULES matches
    the type it decides, exactly as category_for would; an umbrella type says nothing, so Other; a product under Frozen stays there (that came from a tag
    we no longer have); otherwise the group it already has is kept (the word rules are unchanged, and the full tag list may have had a tag they matched)."""
    current, kind = item.get("category") or "other", item.get("type") or ""
    if current == "frozen" or not kind:
        return current
    if kind in UMBRELLA_TAGS:
        return "other"
    return next((group for group, pattern in SPECIFIC_RULES if pattern.fullmatch(kind)), current)


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


def implausible(kcal: float, protein: float, carbs: float, fat: float) -> str | None:
    """Why four per-100 g numbers can't be right (None when they can): used for community data and for the shops' own pages alike."""
    if min(kcal, protein, carbs, fat) < 0 or max(protein, carbs, fat) > 100 or protein + carbs + fat > 101 or kcal > 950:
        return "implausible numbers"
    est = 4 * protein + 4 * carbs + 9 * fat
    if kcal >= 40 and abs(kcal - est) / kcal > 0.4 and abs(kcal - est) > 50:
        return "energy doesn't match macros (check)"
    return None


def type_for(tags: list[str]) -> str | None:
    """The most specific category tag ('semi-skimmed-milks'): what 'similar products' means for the price rating."""
    for t in reversed(tags or []):
        slug = t.split(":", 1)[-1].strip()
        if slug in UMBRELLA_TAGS:
            continue  # "plant-based foods" is not a kind of product to compare prices with
        if re.fullmatch(r"[a-z0-9-]{3,60}", slug):
            return slug
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
    bad = implausible(kcal, protein, carbs, fat)
    if bad:
        return skip(bad)
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
    # No picture from the open database (founder 2026-10-10): the shop's own photo is added later (apply_retailer_images), else the app shows "no photo".
    out["category"] = category_for(p.get("categories_tags") or [])
    kind = type_for(p.get("categories_tags") or [])
    if kind:
        out["type"] = kind
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
            # The loyalty-card price (Clubcard, Nectar, ...) shown beside the regular one: kept next to it, never instead of it.
            member, scheme = num(r.get("member_price_gbp")), " ".join((r.get("member_scheme") or "").split())[:40]
            if member is not None:
                if 0 < member < price and scheme:
                    entry["member"] = {"amount": r2(member), "scheme": scheme}
                    ends = " ".join((r.get("member_offer_ends") or "").split())[:40]
                    if ends:
                        entry["member"]["ends"] = ends
                else:
                    problems.append(f"{path.name} line {line}: member price ignored (it must be above 0, below the regular price, and name the card)")
            prices[code] = entry
    return prices


PHOTO_FILE = re.compile(r"[0-9a-f]{12}\.webp")


def read_photos(retailer: str, problems: list, folder: Path | None = None, path: Path | None = None) -> dict:
    """Our stored copy of the shop's own photo: data/groceries/images/<retailer>.csv (`gtin,image_url,page_url,checked_on,file`), written by
    tools/groceries/select_stored_photos.py. A row counts only when its file is really in web/public/grocery-images/<retailer>/, so a product
    never points at a missing photo. Returns {gtin: file}; the app builds /grocery-images/<retailer>/<file> from it (docs/GROCERIES_PLAN.md)."""
    path = path or ROOT / "data" / "groceries" / "images" / f"{retailer}.csv"
    folder = folder or ROOT / "web" / "public" / "grocery-images" / retailer
    photos: dict = {}
    if not path.exists():
        return photos
    with open(path, newline="", encoding="utf-8-sig") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            code, fname = (r.get("gtin") or "").strip(), (r.get("file") or "").strip()
            if not fname:
                continue  # a hotlink address only (read_image_list), no stored copy
            url, checked = (r.get("page_url") or "").strip(), (r.get("checked_on") or "").strip()
            if not gtin_ok(code) or not PHOTO_FILE.fullmatch(fname) or not url.startswith("https://") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", checked):
                problems.append(f"images/{path.name} line {line}: bad photo row (gtin, file, https page_url and checked_on are required)")
                continue
            if not (folder / fname).is_file():
                problems.append(f"images/{path.name} line {line}: photo file {fname} is missing from {folder.name}/")
                continue
            photos[code] = fname
    return photos


def printed_num(x):
    """A number as a shop's page prints it ("365kJ", "87 kcal", "0.5g", "1,982", "<0.1g") -> float; None when it isn't one. A "<" value counts as 0:
    the same rule as the restaurant pipeline (docs/DATA.md), so a trace is never turned into an invented figure."""
    t = str(x or "").strip().lower().replace(",", "").replace("\u00b5", "u")
    if not t:
        return None
    if t.startswith("<"):
        return 0.0 if re.fullmatch(r"<\s*\d+(\.\d+)?\s*(kj|kcal|g|mg|ug|ml)?", t) else None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(kj|kcal|g|mg|ug|ml)?", t)
    return float(m.group(1)) if m else None


def clean_text(x, limit: int) -> str:
    """Whitespace collapsed, nothing else changed (the shop's words are shown as printed); too long = left out, never cut mid-sentence."""
    t = " ".join(str(x or "").split())
    return t if len(t) <= limit else ""


def read_details(retailer: str, problems: list) -> dict:
    """data/groceries/details/<retailer>.csv: what the shop's own product page prints (copied as printed in the founder's Chrome)."""
    path = ROOT / "data" / "groceries" / "details" / f"{retailer}.csv"
    out: dict = {}
    if not path.exists():
        return out
    with open(path, newline="", encoding="utf-8-sig") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            code = (r.get("gtin") or "").strip()
            url, checked = (r.get("page_url") or "").strip(), (r.get("checked_on") or "").strip()
            if not gtin_ok(code) or not url.startswith("https://") or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", checked):
                problems.append(f"details/{path.name} line {line}: bad row (gtin, https page_url and checked_on are required)")
                continue
            out[code] = r
    return out


# The shop's own product photo (founder's decision 2026-10-08: "use the official images from Sainsbury's, Tesco etc from their website").
# Hotlinked from the shop's own image host, never copied or altered; shown with "Photo from the {shop} website". Only hosts listed here are
# accepted (a host is added after looking at where that shop's product pages load their photos from); anything else is counted in the report.
IMAGE_HOSTS = {
    "tesco": ("digitalcontent.api.tesco.com",),
    "sainsburys": ("assets.sainsburys-groceries.co.uk",),
}


def norm_code(code: str) -> str:
    """A barcode with leading zeros removed, so EAN-13 5063250552526 and its GTIN-14 form 05063250552526 are the same product."""
    return (code or "").strip().lstrip("0")


def clean_image_url(rid: str, url: str, skipped: dict):
    """The URL as the shop's page printed it if it is https, plain and on one of the shop's own image hosts; else None."""
    url = (url or "").strip()
    if not url:
        return None
    if not url.startswith("https://") or len(url) > 400 or re.search(r"[\s\"'<>]", url):
        skipped["malformed"] = skipped.get("malformed", 0) + 1
        return None
    host = url.split("/", 3)[2].lower()
    if host not in IMAGE_HOSTS.get(rid, ()):
        skipped[host] = skipped.get(host, 0) + 1
        return None
    return url


def page_key(rid: str, url: str) -> str:
    """The shop's own id of a product page, from its address: Tesco's number (/products/<n>), Sainsbury's slug (the last part of the address)."""
    url = (url or "").strip().split("?")[0]
    if rid == "tesco":
        m = re.search(r"/products/(\d+)", url)
        return m.group(1) if m else ""
    tail = url.rstrip("/").rsplit("/", 1)[-1].lower()
    return tail if re.fullmatch(r"[a-z0-9][a-z0-9\-_.%]{0,119}", tail) else ""


def _rows(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def shop_pages(rid: str, base: Path | None = None) -> dict[str, dict]:
    """What the shop's own pages say about each barcode, joined ONLY through exact identifiers (never by name):
    norm barcode -> {"photos": [(image url, name the shop printed beside it)], "keys": {the shop's page ids}}.

    Barcode -> page: a product page we read that gave the barcode (discovery/<rid>.csv + <rid>-barcodes.csv; details/<rid>.csv), a photo row
    (images/<rid>.csv) and a price row (prices/<rid>.csv: the product page the price was read from). Page -> picture: that row's own picture, then the
    shop's listing row with the same page id (listing/<rid>.csv). Order of preference: image rows, product-page details, discovery lists, listing rows."""
    base = base or ROOT / "data" / "groceries"
    out: dict[str, dict] = {}

    def entry(code: str) -> dict:
        return out.setdefault(code, {"photos": [], "keys": set()})

    def ok(code: str) -> str:
        code = (code or "").strip()
        return norm_code(code) if gtin_ok(code) else ""

    for r in _rows(base / "images" / f"{rid}.csv"):
        code = ok(r.get("gtin"))
        if code:
            e = entry(code)
            e["keys"].add(page_key(rid, r.get("page_url")))
            if (r.get("image_url") or "").strip():
                e["photos"].append(((r.get("image_url") or "").strip(), ""))
    for r in _rows(base / "details" / f"{rid}.csv"):
        code = ok(r.get("gtin"))
        if code:
            e = entry(code)
            e["keys"] |= {page_key(rid, r.get("page_url")), (r.get("product_id") or "").strip() if rid == "tesco" else ""}
            if (r.get("image_url") or "").strip():
                e["photos"].append(((r.get("image_url") or "").strip(), " ".join((r.get("name_on_page") or "").split())))
    by_id = {(r.get("product_id") or "").strip(): ok(r.get("gtin")) for r in _rows(base / "discovery" / f"{rid}-barcodes.csv")}
    for r in _rows(base / "discovery" / f"{rid}.csv"):
        code = by_id.get((r.get("product_id") or "").strip())
        if code:
            e = entry(code)
            e["keys"] |= {page_key(rid, r.get("page_url")), (r.get("product_id") or "").strip() if rid == "tesco" else ""}
            if (r.get("image_url") or "").strip():
                e["photos"].append(((r.get("image_url") or "").strip(), " ".join((r.get("name_on_page") or "").split())))
    for r in _rows(base / "prices" / f"{rid}.csv"):
        code = ok(r.get("gtin"))
        if code:
            entry(code)["keys"].add(page_key(rid, r.get("page_url")))
    listing = {(r.get("product_id") or "").strip().lower(): r for r in _rows(base / "listing" / f"{rid}.csv")}
    for e in out.values():
        e["keys"].discard("")
        for key in sorted(e["keys"]):
            r = listing.get(key.lower())
            if r and (r.get("image_url") or "").strip():
                e["photos"].append(((r.get("image_url") or "").strip(), " ".join((r.get("name") or "").split())))
    return out


# A picture is never matched by name, but a name can stop one: when the name the shop printed for that page shares no word with the product's own name,
# the open database's record for the barcode is probably a different product ("Coockies" for the shop's Cherry Tomatoes), so the photo would contradict
# the name shown. Words that say nothing about what the product is are ignored.
NAME_STOP = {"the", "and", "with", "for", "from", "our", "new", "free", "range", "british", "organic", "fresh", "pack", "large", "small", "mini", "medium",
             "style", "classic", "original", "natural", "reduced", "fat", "low", "light", "extra", "finest", "taste", "difference", "tesco", "tescos",
             "sainsburys", "sainsbury", "essential", "selection", "flavour", "flavoured", "made", "recipe", "plus", "each", "approx", "per", "sliced",
             "whole", "family", "value", "everyday", "premium", "luxury", "deluxe", "only", "ready", "eat", "inspired", "multipack", "loose"}


def name_words(text: str) -> set[str]:
    t = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower().replace("'", "")
    t = re.sub(r"\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:kg|g|ml|cl|l|ltr|litres?|pk|pack)?\b", " ", t)
    words = {w for w in re.findall(r"[a-z]+", t) if len(w) >= 3 and w not in NAME_STOP}
    return words | {w[:-1] for w in words if w.endswith("s") and len(w) > 3}  # "eggs" also as "egg"


def names_agree(ours: str, theirs: str) -> bool | None:
    """True when the two names share a word (or the start of one: "chedder"/"cheddar"), False when they share none, None when either says nothing."""
    a, b = name_words(ours), name_words(theirs)
    if not a or not b:
        return None

    def same(x: str, y: str) -> bool:
        return x == y or (min(len(x), len(y)) >= 4 and (x.startswith(y) or y.startswith(x))) or (len(x) >= 5 and len(y) >= 5 and x[:5] == y[:5])

    return any(same(x, y) for x in a for y in b)


def read_excludes(rid: str, path: Path | None = None) -> set:
    """Barcodes (normalised) whose shop picture must not be shown, from data/groceries/images/exclude.csv (`shop,gtin,reason`): a picture that shows a different
    product from the one named, or prints an "allergy update" / "new recipe" sticker that could contradict our own numbers. A rerun never brings them back."""
    path = path or ROOT / "data" / "groceries" / "images" / "exclude.csv"
    out: set = set()
    if path.exists():
        with open(path, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                if (r.get("shop") or "").strip() == rid and (r.get("gtin") or "").strip():
                    out.add(norm_code(r["gtin"]))
    return out


def apply_retailer_images(rid: str, products: list, details: dict, skipped: dict, pages: dict | None = None, rejected: set | None = None) -> int:
    """Set `retailerImage` on every product the shop's own pages gave a photo for (shop_pages, joined by exact identifiers only); remove it from the rest.
    A photo whose page name shares no word with the product's name is not used: its barcode goes into `rejected` (and the report), so no stored copy is shown either."""
    pages = shop_pages(rid) if pages is None else pages
    excluded = read_excludes(rid)
    rejected = set() if rejected is None else rejected
    n = 0
    for it in products:
        code = norm_code(it["gtin"])
        it.pop("retailerImage", None)
        if code in excluded:
            continue
        d = details.get(it["gtin"]) or {}
        cands = ([((d.get("image_url") or "").strip(), " ".join((d.get("name_on_page") or "").split()))] if (d.get("image_url") or "").strip() else []) + pages.get(code, {}).get("photos", [])
        disagree = False
        for url, shop_name in cands:
            u = clean_image_url(rid, url, skipped)
            if not u:
                continue
            if shop_name and names_agree(it.get("name", ""), shop_name) is False:
                disagree = True
                continue
            it["retailerImage"] = u
            n += 1
            break
        if disagree and "retailerImage" not in it:
            rejected.add(code)
            skipped.setdefault("names disagree", []).append(f"{it['gtin']} {it.get('name', '')!r} vs the shop's {cands[0][1]!r}")
    return n


def apply_stored_photos(rid: str, products: list, problems: list, rejected: set | frozenset = frozenset(), **where) -> int:
    """Set `photo` (the file name of our stored copy of the shop's own photo) on every product that has one; remove it from the rest."""
    photos = read_photos(rid, problems, **where)
    excluded = read_excludes(rid) | set(rejected)
    n = 0
    for it in products:
        f = None if norm_code(it["gtin"]) in excluded else photos.get(it["gtin"])
        if f:
            it["photo"] = f
            n += 1
        else:
            it.pop("photo", None)
    return n


# ---------------------------------------------------------------- which supermarket sells a product (founder 2026-10-10: "some brands are just mixed up")
# The open database's "stores" field is typed in by volunteers and is often wrong (a Co-op orange juice filed under Sainsbury's). One firm rule decides:
# a supermarket's OWN-BRAND product is sold only by that supermarket. A brand entry names a shop when it contains the shop's name, or when the whole
# entry is one of the shop's own labels. Every label below was checked against the catalogue (REPORT.md "Own-brand labels": the files it appears in,
# how often it sits beside the shop's name, how often its barcodes carry the shop's company prefix). Labels other firms also use are left out (Lidl's "Deluxe").
SHOP_NAMES = {
    "tesco": r"tesco'?s?|tescos", "sainsburys": r"sainsbury'?s?|sainsburys", "coop": r"co-?op|co op|co-operative|cooperative",
    "marks-and-spencer": r"m ?& ?s|marks (?:&|and) spencers?", "waitrose": r"waitrose", "asda": r"asda", "morrisons": r"morrisons",
    "aldi": r"aldi", "lidl": r"lidl", "ocado": r"ocado",
}
OWN_LABELS = {
    "tesco": r"(?:tesco'?s? )?finest|stockwell(?: (?:& )?co\.?)?|t\. ?e\. stockwell|ms molly'?s|creamfields|eastman'?s(?: deli foods)?|(?:the )?growers?'? harvest"
             r"|hearty food(?: co\.?)?|wicked kitchen|plant chef|h\.? ?w\.? nevill'?s?|nevill'?s|rosedene farms|nightingale farms|redmere farms|woodside farms"
             r"|willow farms|bay fishmongers|fire pit|everyday value|root & soul",
    "sainsburys": r"(?:by )?taste[ -]the[ -]difference|so organic|stamford street(?: co\.?)?|hubbard'?s foodstore|be good to yourself|plant pioneers",
    "coop": r"irresistible|the co-operative",
    "asda": r"extra special|just essentials|smart price|chosen by you",
    "morrisons": r"the best|m? ?savers|market street",
    "marks-and-spencer": r"percy pig",
    "waitrose": r"no\.? ?1|duchy organic|duchy originals",
    "lidl": r"milbona|dulano",
    "iceland": r"iceland(?: luxury)?",
}
OTHER_SHOPS = {"eurospin": r"eurospin", "trader-joes": r"trader joe'?s"}  # supermarkets abroad: their own brands are sold by none of ours
_NAME_RE = {rid: re.compile(rf"(?<![a-z])(?:{pat})(?![a-z])") for rid, pat in SHOP_NAMES.items()}
_LABEL_RE = {rid: re.compile(pat) for rid, pat in OWN_LABELS.items()}
_OTHER_RE = {oid: re.compile(rf"(?<![a-z])(?:{pat})(?![a-z])") for oid, pat in OTHER_SHOPS.items()}
SHOP_FIELDS = ("price", "retailerImage", "photo", "pageUrl", "checkedOn", "ingredients", "advice", "other", "portion", "inStock", "source")


def _plain(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text or "").lower().replace("’", "'").replace("‘", "'").split()).strip(" .,*-")


def shop_claims(brand: str, name: str) -> tuple[set, set]:
    """(shops the brand field names as the product's own brand, shops the product's name starts with). "other:<id>" = a supermarket abroad."""
    claims: set = set()
    for entry in (brand or "").split(","):
        e = _plain(entry)
        if not e:
            continue
        bare = _plain(re.sub(r"\([^)]*\)", " ", e))  # "fire pit (tesco)": the label without the bracket (the bracket still names the shop)
        claims |= {rid for rid, rx in _NAME_RE.items() if rx.search(e)}
        claims |= {rid for rid, rx in _LABEL_RE.items() if rx.fullmatch(bare)}
        claims |= {f"other:{oid}" for oid, rx in _OTHER_RE.items() if rx.search(e)}
    n = _plain(name)
    named = {rid for rid, rx in _NAME_RE.items() if rid != "ocado" and rx.match(n) and rx.match(n).start() == 0}
    return claims | named, named


def code13(code: str) -> str:
    """A barcode as 13 digits (or 8 for EAN-8): GTIN-14 and UPC-12 written the EAN-13 way."""
    c = (code or "").strip()
    if len(c) == 14 and c.startswith("0"):
        c = c[1:]
    if len(c) == 12:
        c = "0" + c
    return c


def company_prefix(code: str) -> str | None:
    """The part of a barcode that names the company that issued it: the first 7 digits of an EAN-13, the first 2 of an EAN-8 (for a shop's own short
    codes). None for in-store numbers (EAN-13 starting 2 or 02, EAN-8 starting 2), which every shop reuses for weighed goods."""
    c = code13(code)
    if len(c) == 8:
        return None if c[0] == "2" else f"8:{c[:2]}"
    if len(c) != 13 or c[0] == "2" or c[:2] == "02":
        return None
    return c[:7]


def issued_where_shop_issues(rid: str, code: str) -> bool:
    """A UK supermarket's own brand carries a UK barcode (GS1 UK, 50...), Aldi's and Lidl's also German ones (40-44), or a shop's own short or in-store
    number. A claim on a barcode from elsewhere (a Swiss "Coop" yogurt, a French chocolate bar typed in as "Tesco") is not believed."""
    c = code13(code)
    if len(c) == 8 or (len(c) == 13 and (c[0] == "2" or c[:2] == "02")):
        return True
    return c[:2] in ({"40", "41", "42", "43", "44", "50"} if rid in ("aldi", "lidl") else {"50"})


def believed_claims(code: str, brand: str, name: str) -> tuple[set, set]:
    claims, named = shop_claims(brand, name)
    keep = {c for c in claims if c.startswith("other:") or issued_where_shop_issues(c, code)}
    return keep, named & keep


def learn_prefixes(claims_by_code: dict[str, set], min_n: int = 3, purity: float = 0.9) -> dict[str, tuple[str, int]]:
    """`claims_by_code`: barcode AS WRITTEN (not stripped of leading zeros: an EAN-8 must stay 8 digits) -> shops its brand names.
    Company prefix -> (shop, how many barcodes) when at least `min_n` barcodes with that prefix name the shop and at least `purity` of ALL barcodes
    with it do (branded products with the prefix count against it). Learned from the catalogue itself, so it follows the data."""
    seen: dict[str, list[set]] = {}
    for code, claims in claims_by_code.items():
        p = company_prefix(code)
        if p:
            seen.setdefault(p, []).append(claims)
    out: dict[str, tuple[str, int]] = {}
    for p, lists in seen.items():
        counts: dict[str, int] = {}
        for claims in lists:
            for c in claims:
                counts[c] = counts.get(c, 0) + 1
        best = [(c, k) for c, k in counts.items() if k >= min_n and k >= purity * len(lists)]
        if len(best) == 1:
            out[p] = best[0]
    return out


PREFIX_ALONE_MIN = 20  # a barcode with no brand typed in follows its company prefix only when that prefix is well proven


def decide_shops(listed: set, claims: set, named: set, prefix: tuple[str, int] | None, confirmed: set) -> tuple[set, str]:
    """Which shops list one barcode, and why. `listed` = the shops whose files have it now, `claims` = shops its brand or name says it belongs to,
    `prefix` = (shop, n) when its barcode prefix is a shop's, `confirmed` = shops whose own website showed this barcode (the strongest proof)."""
    cands = set(claims)
    if prefix:
        owner, n = prefix
        if not cands:
            if n >= PREFIX_ALONE_MIN:
                cands = {owner}
        elif owner in cands:
            cands = {owner}
        else:
            cands.add(owner)
    if len(cands) > 1 and len(named & cands) == 1:
        cands = named & cands  # the name starts with one of them ("Co-op Cherryade" typed in as "Co Op, Tesco")
    if confirmed:
        agree = cands & confirmed
        if agree:
            return agree, "own brand"
        if cands:
            return listed | confirmed, "brand says another shop but a shop's own website lists it"
        return listed | confirmed, "on the shop's own website"
    if not cands:
        return set(listed), "branded"
    if len(cands) == 1:
        owner = next(iter(cands))
        return ({owner} if owner in RETAILERS else set()), ("own brand" if owner in RETAILERS else "own brand of a supermarket abroad")
    return set(), "held back: its brand and barcode name different supermarkets"


def read_shop_evidence(base: Path | None = None) -> dict[str, set]:
    """norm barcode -> shops whose own website showed it (a price row, a product page read, a discovery list's barcode, a photo row)."""
    base = base or ROOT / "data" / "groceries"
    out: dict[str, set] = {}
    for rid in RETAILERS:
        for path in (base / "prices" / f"{rid}.csv", base / "details" / f"{rid}.csv", base / "images" / f"{rid}.csv", base / "discovery" / f"{rid}-barcodes.csv"):
            for r in _rows(path):
                code = (r.get("gtin") or "").strip()
                if gtin_ok(code):
                    out.setdefault(norm_code(code), set()).add(rid)
    return out


def assign_shops(by_rid: dict[str, list[dict]], evidence: dict[str, set], log: dict | None = None) -> dict[str, list[dict]]:
    """Put each barcode under the shops decide_shops picks. A product added to a shop starts as a copy of its record in another file without that file's
    shop-only fields (price, photo, the shop page's details); one whose record carries another shop's own page numbers is not copied. `log` collects counts."""
    log = {} if log is None else log
    per: dict[str, dict[str, dict]] = {}
    for rid, items in by_rid.items():
        for it in items:
            per.setdefault(norm_code(it["gtin"]), {})[rid] = it
    believed: dict[str, tuple[set, set]] = {}
    for code, recs in per.items():
        claims, named = set(), set()
        for it in recs.values():
            c, n = believed_claims(it["gtin"], it.get("brand", ""), it.get("name", ""))
            claims |= c
            named |= n
        believed[code] = (claims, named)
    prefixes = learn_prefixes({next(iter(per[code].values()))["gtin"]: c for code, (c, _) in believed.items()})  # keyed by a barcode as written: its length matters
    log["prefixes"] = prefixes
    out: dict[str, list[dict]] = {rid: [] for rid in by_rid}
    moves: dict = log.setdefault("moves", {})
    examples: dict = log.setdefault("examples", {})
    for rid, items in by_rid.items():
        for it in items:
            code = norm_code(it["gtin"])
            recs = per[code]
            if next(iter(recs)) != rid:
                continue  # each barcode is decided once, at its first file
            claims, named = believed[code]
            shops, why = decide_shops(set(recs), claims, named, prefixes.get(company_prefix(it["gtin"]) or ""), evidence.get(code, set()) & set(by_rid))
            shops &= set(by_rid)
            for r in recs:
                if r not in shops:
                    moves[(r, "removed", why)] = moves.get((r, "removed", why), 0) + 1
                    examples.setdefault((r, "removed", why), []).append(f"{it['gtin']} {it.get('brand', '')} | {it.get('name', '')}")
            template = next((x for x in recs.values() if not x.get("pageUrl") and x.get("source") != "retailer"), None)
            for s in shops:
                if s in recs:
                    continue
                if template is None:
                    moves[(s, "not added (only another shop's own page numbers)", why)] = moves.get((s, "not added (only another shop's own page numbers)", why), 0) + 1
                    continue
                copy = {k: v for k, v in json.loads(json.dumps(template)).items() if k not in SHOP_FIELDS}
                recs[s] = copy
                moves[(s, "added", why)] = moves.get((s, "added", why), 0) + 1
                examples.setdefault((s, "added", why), []).append(f"{it['gtin']} {it.get('brand', '')} | {it.get('name', '')}")
            for s in shops:
                if s in recs:
                    recs[s]["_keep"] = True
    for rid, items in by_rid.items():
        out[rid] = [it for it in items if it.pop("_keep", False)]
    for code, recs in per.items():
        for s, it in recs.items():
            if it.pop("_keep", False):
                out[s].append(it)  # added to a shop it wasn't in
    return out


def apply_details(item: dict, d: dict, notes: dict) -> None:
    """Put one product's own-page details on it. The shop's numbers replace Open Food Facts' only when they are per 100 g/ml in the same
    unit as the listing and pass the same plausibility checks; they are never mixed with the community numbers."""
    name = " ".join((d.get("name_on_page") or "").split())
    if 2 <= len(name) <= 140:
        item["name"] = name  # exactly as the website prints it
    size = clean_text(d.get("pack_size"), 40)
    if size:
        item["size"] = size
    for key, field, limit in (("ingredients", "ingredients", 2500), ("advice", "allergy_advice", 700), ("other", "other_nutrients", 1500), ("portion", "per_portion_text", 800)):
        t = clean_text(d.get(field), limit)
        if key == "ingredients":
            t = re.sub(r"^ingredients\s*:\s*", "", t, flags=re.I)  # the page heading, not part of the list (the app has its own heading)
        if t:
            item[key] = t
    stock = (d.get("in_stock") or "").strip().lower()
    if stock in ("yes", "no"):
        item["inStock"] = stock == "yes"
    item["pageUrl"], item["checkedOn"] = d["page_url"].strip(), d["checked_on"].strip()
    basis = " ".join((d.get("nutrition_basis") or "").lower().split()).replace("per 100 g", "per 100g").replace("per 100 ml", "per 100ml")
    if basis != f"per 100{item['per']}":
        if basis:
            notes["basis"] = notes.get("basis", 0) + 1
        return
    kcal, protein, carbs, fat = (printed_num(d.get(k)) for k in ("energy_kcal", "protein_g", "carbs_g", "fat_g"))
    if carbs is None:
        # Some labels print the row as "Available Carbohydrate" (the same figure UK labels call carbohydrate): it lands in other_nutrients
        m = re.search(r"available carbohydrates?\s*:\s*([^;]+)", d.get("other_nutrients") or "", re.I)
        carbs = printed_num(m.group(1)) if m else None
    if None in (kcal, protein, carbs, fat):
        notes["incomplete"] = notes.get("incomplete", 0) + 1
        return
    if implausible(kcal, protein, carbs, fat):
        notes["implausible"] = notes.get("implausible", 0) + 1
        return
    if item["kcal"] and abs(kcal - item["kcal"]) / max(item["kcal"], 1) > 0.2 and abs(kcal - item["kcal"]) > 15:
        notes["differs"] = notes.get("differs", 0) + 1  # the shop's own number wins; counted so the report shows how often the community data was off
    item.update({"kcal": r1(kcal), "protein": r1(protein), "carbs": r1(carbs), "fat": r1(fat)})
    for key in ("saturates", "sugars", "fibre", "salt", "kj"):
        item.pop(key, None)
    item.pop("serving", None)
    for key, field, dec in (("saturates", "saturates_g", r1), ("sugars", "sugars_g", r1), ("fibre", "fibre_g", r1), ("salt", "salt_g", r2), ("kj", "energy_kj", lambda v: int(round(v)))):
        v = printed_num(d.get(field))
        if v is not None and v >= 0:
            item[key] = dec(v)
    item["source"] = "retailer"
    notes["own"] = notes.get("own", 0) + 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=Path("/private/tmp/off-cache"))
    ap.add_argument("--out", type=Path, default=ROOT / "web" / "public" / "groceries")
    ap.add_argument("--patch", action="store_true", help="redo every step after the download (shops, types, prices, details, photos) on the files already in --out; needs no Open Food Facts cache")
    ap.add_argument("--images-only", action="store_true", help="only (re)apply the shops' own photos to the files already in --out; needs no Open Food Facts cache")
    args = ap.parse_args()
    if args.images_only:
        return patch_images(args.out)
    if args.patch:
        return patch(args.out)
    today = date.today().isoformat()
    args.out.mkdir(parents=True, exist_ok=True)
    reasons_total: dict = {}
    by_rid: dict[str, list[dict]] = {}
    for rid in RETAILERS:
        seen: dict = {}
        reasons: dict = {}
        for page in sorted(args.cache.glob(f"{rid}-*.json")):
            for p in json.loads(page.read_text()).get("products", []):
                code = str(p.get("code") or "").strip()
                if code in seen:
                    continue
                item = convert(p, reasons)
                if item:
                    seen[code] = item
        by_rid[rid] = list(seen.values())
        for k, v in reasons.items():
            reasons_total[(rid, k)] = v
    left_out = [f"- {rid}: {why}: {n}" for (rid, why), n in sorted(reasons_total.items())]
    return finish(by_rid, args.out, today, f"Built {today} from the Open Food Facts cache ({args.cache}).", left_out, {})


def finish(by_rid: dict[str, list[dict]], out: Path, today: str, head: str, left_out: list, recat: dict) -> int:
    """Everything after the download, shared by a full build and --patch: which shops list each product, prices, the shops' own page details and photos;
    then the files, the manifest and data/groceries/REPORT.md."""
    problems: list = []
    shop_log: dict = {}
    labels = own_label_evidence(by_rid)
    by_rid = assign_shops(by_rid, read_shop_evidence(), shop_log)
    manifest = {"v": 1, "generatedOn": today, "source": SOURCE, "retailers": [], "categories": [{"id": k, "label": v} for k, v in CATEGORY_LABELS.items()]}
    table = ["| retailer | products | with the shop's own photo | of those, a stored copy | allergens known | with price |", "|---|---|---|---|---|---|"]
    detail_notes: dict = {}
    image_skipped: dict = {}
    for rid, label in RETAILERS.items():
        products = by_rid.get(rid, [])
        prices, details = read_prices(rid, problems), read_details(rid, problems)
        notes: dict = {}
        for it in products:
            it.pop("price", None)
            if it["gtin"] in prices:
                it["price"] = prices[it["gtin"]]
            if it["gtin"] in details:
                apply_details(it, details[it["gtin"]], notes)
        detail_notes[rid] = (sum(1 for it in products if "pageUrl" in it), notes)
        rejected: set = set()
        apply_retailer_images(rid, products, details, image_skipped.setdefault(rid, {}), rejected=rejected)
        apply_stored_photos(rid, products, problems, rejected=rejected)
        doc = {"v": 1, "retailer": rid, "name": label, "generatedOn": today, "source": SOURCE, "products": products}
        file = f"{rid}.json"
        text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
        (out / file).write_text(text)
        manifest["retailers"].append({"id": rid, "name": label, "file": file, "count": len(products), "sha256": hashlib.sha256(text.encode()).hexdigest()})
        table.append(f"| {label} | {len(products)} | {sum(1 for p in products if p.get('retailerImage'))} | {sum(1 for p in products if p.get('photo'))} | "
                     f"{sum(1 for p in products if p['allergens'] is not None)} | {sum(1 for p in products if 'price' in p)} |")
        print(f"{rid}: {len(products)} products, {sum(1 for p in products if p.get('retailerImage'))} with the shop's own photo ({sum(1 for p in products if p.get('photo'))} stored)")
    (out / "groceries-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    report = ["# Groceries build report", "", head, "", "Pictures come only from the supermarkets' own websites (founder 2026-10-10); a product without one shows \"no photo\".", ""] + table
    if any(n for n, _ in detail_notes.values()):
        report += ["", "## Details read from the supermarkets' own pages", ""]
        for rid, (n, notes) in detail_notes.items():
            if n:
                extra = {"own": "use the shop's own numbers", "differs": "of those, kcal differs from Open Food Facts by over 20%", "basis": "numbers not per 100 g/ml in our unit (kept Open Food Facts')", "incomplete": "own numbers incomplete (kept Open Food Facts')", "implausible": "own numbers failed the checks (kept Open Food Facts')"}
                report.append(f"- {RETAILERS[rid]}: {n} products with details; " + "; ".join(f"{notes[k]} {v}" for k, v in extra.items() if notes.get(k)))
    report += shop_report(shop_log, labels)
    report += photo_report(out, image_skipped)
    report += category_report(by_rid, recat)
    report += ["", "## Left out (and why)", ""] + left_out + (["", "## Problems with price and photo files", ""] + [f"- {p}" for p in problems] if problems else [])
    (ROOT / "data" / "groceries" / "REPORT.md").write_text("\n".join(report) + "\n")
    return 0


def own_label_evidence(by_rid: dict[str, list[dict]]) -> list[str]:
    """For REPORT.md: each own label found in the brand fields (an entry that is a shop's label without the shop's name in it), with the files it appears in,
    how often the same brand field also names the shop, and how many of its barcodes carry a company prefix the catalogue ties to that shop."""
    claims_by_code: dict[str, set] = {}
    for items in by_rid.values():
        for it in items:
            claims_by_code.setdefault(it["gtin"], set()).update(believed_claims(it["gtin"], it.get("brand", ""), it.get("name", ""))[0])
    prefixes = learn_prefixes(claims_by_code)
    seen: dict = {}
    for rid, items in by_rid.items():
        for it in items:
            entries = [_plain(e) for e in (it.get("brand") or "").split(",") if _plain(e)]
            for e in entries:
                bare = _plain(re.sub(r"\([^)]*\)", " ", e))
                for shop, rx in _LABEL_RE.items():
                    name_rx = _NAME_RE.get(shop)
                    if rx.fullmatch(bare) and not (name_rx and name_rx.search(e)):
                        row = seen.setdefault((shop, bare), {"n": 0, "files": {}, "with_name": 0, "prefix": 0})
                        row["n"] += 1
                        row["files"][rid] = row["files"].get(rid, 0) + 1
                        row["with_name"] += bool(name_rx) and any(name_rx.search(x) for x in entries)
                        row["prefix"] += (prefixes.get(company_prefix(it["gtin"]) or "") or ("",))[0] == shop
    lines = ["", "## Own-brand labels (checked against the catalogue)", "", "| shop | label | products | in files | brand field also names the shop | barcode prefix is the shop's |", "|---|---|---|---|---|---|"]
    for (shop, label), row in sorted(seen.items()):
        lines.append(f"| {RETAILERS.get(shop, shop)} | {label} | {row['n']} | {', '.join(f'{RETAILERS[r]} {k}' for r, k in row['files'].items())} | {row['with_name']} | {row['prefix']} |")
    return lines


def shop_report(log: dict, labels: list) -> list:
    lines = ["", "## Which supermarket lists a product", "",
             "Rule: a supermarket's own-brand product is listed only under that supermarket (brand field, a name starting with the shop's name, or a barcode",
             "company prefix the catalogue ties to one shop); a shop whose own website showed the barcode always lists it. Changes this build:", ""]
    moves = log.get("moves", {})
    if not moves:
        lines.append("- none")
    for (rid, what, why), n in sorted(moves.items()):
        ex = log.get("examples", {}).get((rid, what, why), [])
        lines.append(f"- {RETAILERS.get(rid, rid)}: {what} {n} ({why})" + (": " + "; ".join(ex[:6]) + (" ..." if len(ex) > 6 else "") if ex else ""))
    pre = log.get("prefixes", {})
    if pre:
        by_shop: dict = {}
        for p, (shop, n) in pre.items():
            by_shop.setdefault(shop, []).append(f"{p} ({n})")
        lines += ["", "Barcode company prefixes the catalogue ties to one shop (barcodes naming it):", ""]
        lines += [f"- {RETAILERS.get(shop, shop)}: " + ", ".join(sorted(v)) for shop, v in sorted(by_shop.items())]
    return lines + labels


def category_report(by_rid: dict[str, list[dict]], recat: dict) -> list:
    counts: dict = {}
    for items in by_rid.values():
        for it in items:
            counts[it.get("category", "other")] = counts.get(it.get("category", "other"), 0) + 1
    lines = ["", "## Types", "", "- " + ", ".join(f"{CATEGORY_LABELS.get(k, k)} {v}" for k, v in sorted(counts.items(), key=lambda x: -x[1]))]
    if recat:
        lines += ["", "Moved to another type by the rules (from -> to: products):", ""]
        lines += [f"- {CATEGORY_LABELS.get(a, a)} -> {CATEGORY_LABELS.get(b, b)}: {n} ({', '.join(sorted(kinds)[:8])}{' ...' if len(kinds) > 8 else ''})" for (a, b), (n, kinds) in sorted(recat.items(), key=lambda x: -x[1][0])]
    return lines


def photo_report(out: Path, skipped: dict) -> list:
    lines = ["", "## Photos from the supermarkets' own websites (a stored copy where we hold one, else hotlinked)", ""]
    for rid, label in RETAILERS.items():
        path = out / f"{rid}.json"
        if not path.exists():
            continue
        products = json.loads(path.read_text()).get("products", [])
        n = sum(1 for p in products if p.get("retailerImage"))
        stored = sum(1 for p in products if p.get("photo"))
        extra = {k: v for k, v in (skipped.get(rid) or {}).items() if k != "names disagree"}
        disagree = (skipped.get(rid) or {}).get("names disagree", [])
        if n or stored or extra or disagree:
            lines.append(f"- {label}: {n} of {len(products)} products have the shop's own photo, {stored} also have a stored copy; {len(products) - n} show \"no photo\""
                         + (f"; ignored (host not on the list in IMAGE_HOSTS): {extra}" if extra else ""))
            if disagree:
                lines.append(f"  - not used because the shop's page names a different product ({len(disagree)}): " + "; ".join(disagree))
    return lines


def patch(out: Path) -> int:
    """--patch: the files already built are the input (their per-shop records), so the shop rule, the type rules, prices, details and photos can be redone
    without the Open Food Facts cache. The open database's picture field is dropped. The old report's "Left out" section is carried over."""
    manifest = json.loads((out / "groceries-manifest.json").read_text())
    by_rid: dict[str, list[dict]] = {}
    recat: dict = {}
    for entry in manifest["retailers"]:
        items = json.loads((out / entry["file"]).read_text())["products"]
        for it in items:
            it.pop("image", None)  # Open Food Facts' picture: never shown (founder 2026-10-10)
            if it.get("type") in UMBRELLA_TAGS:
                it.pop("type")
            new = recategorise(it)
            if new != it.get("category"):
                key = (it.get("category"), new)
                n, kinds = recat.get(key, (0, set()))
                recat[key] = (n + 1, kinds | {it.get("type", "")})
                it["category"] = new
        by_rid[entry["id"]] = items
    for rid in RETAILERS:
        by_rid.setdefault(rid, [])
    old = (ROOT / "data" / "groceries" / "REPORT.md")
    text = old.read_text() if old.exists() else ""
    left = text.split("## Left out (and why)", 1)[1].split("\n## ", 1)[0].strip().splitlines() if "## Left out (and why)" in text else []
    today = date.today().isoformat()
    return finish(by_rid, out, today, f"Patched {today} from the files built on {manifest.get('generatedOn', '?')} (python3 tools/groceries/build_groceries.py --patch; no Open Food Facts download).", left, recat)


def patch_images(out: Path) -> int:
    """Re-apply the shops' own photos to the files already built in `out` and refresh their hashes in the manifest."""
    manifest_path = out / "groceries-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    skipped: dict = {}
    problems: list = []
    for entry in manifest["retailers"]:
        rid = entry["id"]
        path = out / entry["file"]
        doc = json.loads(path.read_text())
        for it in doc["products"]:
            it.pop("image", None)  # Open Food Facts' picture: never shown (founder 2026-10-10)
        details = read_details(rid, [])
        rejected: set = set()
        n = apply_retailer_images(rid, doc["products"], details, skipped.setdefault(rid, {}), rejected=rejected)
        stored = apply_stored_photos(rid, doc["products"], problems, rejected=rejected)
        doc["source"] = SOURCE
        text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
        path.write_text(text)
        entry["sha256"] = hashlib.sha256(text.encode()).hexdigest()
        print(f"{rid}: {n} of {len(doc['products'])} products have the shop's own photo ({stored} of them stored on our site)")
    manifest["source"] = SOURCE
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    for p in problems:
        print(f"problem: {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
