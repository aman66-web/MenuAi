#!/usr/bin/env python3
"""Build the "every product" files for the web app from the store listing crawls (docs/GROCERIES_PLAN.md, founder 2026-10-09).

    python3 tools/groceries/build_all_products.py          # writes web/public/groceries/all/<shop>.json + all-manifest.json
    python3 tools/groceries/build_all_products.py --only marks-and-spencer   # rewrites just that shop's file and its entry in all-manifest.json

Input: data/groceries/listing/<shop>.csv (tools/groceries/ingest_listing.py): one row per product as the shop's own category pages printed it
(name, price, unit price, card price, categories, photo address). These products have NO barcode and NO nutrition unless the shop's page was read
(data/groceries/discovery/<shop>*.csv or details/): the app shows them as "price only" and links to the shop's own page. Nothing is estimated.

Only shops in PUBLISH are written. Add a shop there only after the founder has seen its terms (see data/groceries/listing/raw/<shop>_terms.txt).
Founder 2026-10-11: Asda, Aldi and Lidl published (their accepted risk where the terms restrict it), then "all the grocery stores, all the items": Tesco,
Waitrose, Morrisons, Iceland and M&S too, each the founder's accepted risk against its terms (docs/IMAGE_TERMS.md). Groceries only: a product whose name
says it isn't food or drink (candles, sparklers, flower bouquets, M&S flower gifts) is left out.
Output per shop (compact, one array per product so 17,000 products stay about 3 MB before compression):
  {"v":1,"retailer","name","checkedOn","pageBase","photoBase","categories":[top-level names],"schemes":[card names],
   "nutritionCheckedOn","nutritionCheckedTo","products":[[id, name, price|null, unitPrice|null, unit, memberPrice|null, schemeIndex|null, categoryIndex, photoId|"", gtin|"", nutrition|null]]}
`price` is null only for a Lidl product whose own page prints no price (PRICE_IN_STORE: Lidl prices online only its weekly offers) and for M&S's everyday food
range (tools/groceries/mns_food_listing.py: M&S's aisle pages list no price for it); the app says "Price in store".
`nutrition` is [kcal, protein, carbs, fat, saturates|null, sugars|null, fibre|null, salt|null, kJ|null, "g"|"ml", state] per 100 g/ml, state "" or the word the page's own heading adds ("grilled", "cooked bacon", "prepared"), copied from the product's own page by
tools/groceries/t2_sainsburys.py (data/groceries/nutrition/<shop>.csv); a "<0.5" row counts as 0 (docs/DATA.md); null when that page has not been read.
Where the page hasn't been read but the row's barcode is in the barcode catalogue, it is those COMMUNITY numbers (Open Food Facts contributors) with a 12th
element "off" (catalogue_nutrition), so the app names their source; the manifest's `community` counts them.
`id` is the shop's own product id (Sainsbury's: its page slug, so the page is pageBase + id). `photoId` is the shop's own picture id: for Sainsbury's the number
in photoBase + id + "/image.jpg"; a shop with "photoTemplate" has it put in place of "{photo}". Shops whose page address isn't pageBase + id carry it as a 12th
element (the path after pageBase, from the shop's own sitemap: tools/groceries/shop_pages.py); "pageSearch": true means pageBase + the product's name is the
shop's own search for it (Asda: its site refuses this environment, so no page addresses). A shop whose product pages sit under a different root than its search
(M&S: pageBase is its search, its range's pages are https://www.marksandspencer.com/food/<name>/p/fdp<digits>) says so with "pageRoot": a row's page path is then
read against pageRoot, and shopPageUrl puts pageRoot in front of it. "priceNote": "stores" tells the app to explain "Price in store" as the shop listing no price
for the product, where the default ("offers") is Lidl's "only for its weekly offers".
`gtin` is set only where the shop's own product page was read and showed a barcode (data/groceries/discovery/<shop>-barcodes.csv), so the app can link to the full page.
A product the shop's own listing showed no picture for may carry a 13th element, [source, photo address] (founder 2026-10-11: "every item should have a photo";
"use the EAN number ... find an image of it ... if you can't find it on the supermarket's website"): the same product's photo from another supermarket's own
website (same barcode, or the same branded name and pack size, never a shop's own brand), else the Open Food Facts front photo of that exact barcode
(data/groceries/images/off-front.csv, tools/groceries/fetch_off_images.py). The 12th element is then "" when the row has no page path.
No alcoholic drinks (founder 2026-10-11, build_groceries.is_alcohol) and no advert tiles ("Sponsored", "Occasions").
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_groceries import implausible, is_alcohol, name_key, norm_code, restricted_code  # noqa: E402  (shared with the barcode catalogue)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "groceries" / "all"
PUBLISHED_OUT = OUT  # the real output folder: reports into data/ are written only when the build writes there (not when a test points OUT elsewhere)
PUBLISH = ("sainsburys", "tesco", "asda", "aldi", "lidl", "morrisons", "waitrose", "iceland", "marks-and-spencer")  # shops whose lists the app shows
# Per shop: the name shown, the page address base, the picture host (and the template the app fills), how to read the picture id from the listing's
# address, whether pages come from data/groceries/listing/<shop>-pages.csv, and how the shop's own category path becomes the type shown.
ALDI_AISLES = {"fresh-food": "Fresh Food", "chilled-food": "Chilled Food", "food-cupboard": "Food Cupboard", "frozen-food": "Frozen Food", "bakery": "Bakery",
               "drinks": "Drinks", "alcohol": "Alcohol", "baby-toddler": "Baby & Toddler"}
ALDI_OTHER = {"vegetarian-plant-based": "Vegetarian & Plant Based", "higher-protein-food-drink": "Higher Protein", "christmas-new-year": "Christmas & New Year",
              "autumn-range": "Autumn Range", "halloween": "Halloween", "specialbuys": "Specialbuys"}
# Top-level aisles as the shops name them (their own words, in their own order of words), from the crawl's category slugs.
WAITROSE_AISLES = {"fresh_and_chilled": "Fresh & Chilled", "food_cupboard": "Food Cupboard", "beer_wine_and_spirits": "Beer, Wine & Spirits",
                   "tea_coffee_and_soft_drinks": "Tea, Coffee & Soft Drinks", "bakery": "Bakery", "frozen": "Frozen", "baby_and_toddler": "Baby & Toddler"}
MORRISONS_AISLES = {"fruit-veg": "Fruit & Veg", "meat-fish": "Meat & Fish", "fresh-foods": "Fresh", "bakery-cakes": "Bakery & Cakes", "food-cupboard": "Food Cupboard",
                    "frozen-food": "Frozen", "drinks": "Drinks", "beer-wines-spirits": "Beer, Wine & Spirits", "world-foods": "World Foods",
                    "treats-snacks": "Treats & Snacks", "food-to-order": "Food to Order", "dietary-lifestyle-foods": "Dietary & Lifestyle"}
TESCO_AISLES = {"fresh-food": "Fresh Food", "bakery": "Bakery", "frozen-food": "Frozen Food"}
# Not food or drink, going by the product's own name (groceries only, founder 2026-10-11); "bouquet" alone is also a wine word, so it needs a flower word.
# A cake named after its decoration ("Candles Celebration Cake", "Balloon & Stars Cake", "Rose Bouquet Madeira Cake") is food: a food word after the match keeps it.
NON_FOOD = re.compile(r"\b(?:\d+\s?cm (?:\w+ )?roasters?|roasting (?:tins?|trays?)|foil (?:trays?|containers?)|candles?|sparklers?|cake toppers?|balloons?|napkins?|paper plates?|bin bags?|kitchen rolls?|toilet rolls?|batter(?:y|ies)|"
                      r"light bulbs?|firelighters|charcoal briquettes|lumpwood charcoal|gift cards?|carrier bags?|bags? for life|"
                      r"(?:cupcake|muffin|cake|baking) cases|filter papers|piping bags?|cake boards?|cocktail sticks|cling film|baking parchment|baking paper|"
                      r"foil trays?|kitchen foil|tin foil|freezer bags?|food bags?|dog toys?|dog treats?|dog chews?|cat treats?|pet treats?|for dogs|for cats)\b"
                      r"|\b(?:roses?|lil(?:y|ies)|tulips?|chrysanthemums?|carnations?|flowers?|alstroemeria|stems)\b.*\bbouquet\b|\bbouquet\b.*\b(?:roses?|lil(?:y|ies)|tulips?|flowers?|stems)\b"
                      r"|^tesco \w+ bouquet$"
                      # kitchenware sold among the food (founder 2026-11-18: "every food product"): Asda's George Home range, Waitrose's John Lewis tools, shakers
                      r"|^george home\b|^(?:john lewis|jl) stainless steel\b|\bprotein shaker\b|\bnut ?crackers?\b(?!.*\b(?:chocolate|biscuits?)\b)|\bwater filter\b|\bfilter cartridges?\b|\bmaxtra\b"
                      r"|\bpaper cases\b|\b(?:cake|loaf) liners\b|\bbaking trays?\b|\b(?:cupcake|cake) boxes\b", re.I)
FOOD_AFTER = re.compile(r"\b(?:cakes?|crackers|kebabs?|biscuits?|cupcakes?)\b", re.I)


FLOWERS = re.compile(r"\b(?:alstroemeria|carnations|chrysanthemums?|gerberas?|freesias?|lilies|tulips|sunflowers|orchids?|hydrangeas?|peonies|daffodils)\b"
                     r"|^simply roses$|^seasonal show$|\broses? bunch\b|\bbunch of roses\b", re.I)
NOT_FLOWER = re.compile(r"\b(?:chocolates?|cadbury|cakes?|tea|syrup|honey|jam|seeds|oil|water|cordial|lemonade|milk)\b", re.I)
ADVERT = {"sponsored", "occasions", "advert", "advertisement", "promoted"}  # tiles on the category pages that aren't products


def not_food(name: str) -> bool:
    m = NON_FOOD.search(name)
    if m and not FOOD_AFTER.search(name, m.end()):
        return True
    return bool(FLOWERS.search(name)) and not NOT_FLOWER.search(name)  # flowers and plants, not "Cadbury Roses" or "Sunflower Seeds"


NOT_FOOD_IDS = {"marks-and-spencer": re.compile(r"^flp")}  # M&S "flowers with a treat" gifts
SHOPS = {
    "sainsburys": {"name": "Sainsbury's", "pageBase": "https://www.sainsburys.co.uk/groceries/product/", "photoBase": "https://assets.sainsburys-groceries.co.uk/gol/",
                   "photo": re.compile(r"/gol/(\d+)/")},
    "asda": {"name": "Asda", "pageBase": "https://www.asda.com/groceries/search/", "pageSearch": True,
             "photoBase": "https://asdagroceries.scene7.com/is/image/asdagroceries/",
             "photoTemplate": "https://asdagroceries.scene7.com/is/image/asdagroceries/{photo}?wid=400&hei=400&fit=constrain&fmt=jpg",
             "photo": re.compile(r"^https://asdagroceries\.scene7\.com/is/image/asdagroceries/([0-9A-Za-z_-]{4,40})$")},
    "aldi": {"name": "Aldi", "pageBase": "https://www.aldi.co.uk/product/", "pages": True,
             "photoBase": "https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/",
             "photoTemplate": "https://dm.emea.cms.aldi.cx/is/image/aldiprodeu/product/jpg/scaleWidth/400/{photo}/image",
             "photo": re.compile(r"^https://dm\.emea\.cms\.aldi\.cx/is/image/aldiprodeu/product/jpg/scaleWidth/\d+/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/")},
    "lidl": {"name": "Lidl", "pageBase": "https://www.lidl.co.uk/p/", "pages": True, "photoBase": "https://imgproxy-retcat.assets.schwarz/",
             "photoTemplate": "https://imgproxy-retcat.assets.schwarz/{photo}",
             "photo": re.compile(r"^https://imgproxy-retcat\.assets\.schwarz/([A-Za-z0-9_\-./:=]{10,400})$")},
    # Tesco's image server refuses this environment (403) but serves browsers: its pictures are loaded from Tesco, never stored.
    "tesco": {"name": "Tesco", "pageBase": "https://www.tesco.com/groceries/en-GB/products/", "photoBase": "https://digitalcontent.api.tesco.com/v2/media/",
              "photoTemplate": "https://digitalcontent.api.tesco.com/v2/media/{photo}.jpeg?h=225&w=225",
              "photo": re.compile(r"^https://digitalcontent\.api\.tesco\.com/v2/media/(ghs/[0-9a-f-]{36}/[0-9a-f-]{36}(?:_\d+)?)\.jpeg")},
    # Waitrose, Morrisons and M&S: the crawl kept no page addresses (they carry a name slug), so the app opens the shop's own search for the name.
    "waitrose": {"name": "Waitrose", "pageBase": "https://www.waitrose.com/ecom/shop/search?searchTerm=", "pageSearch": True,
                 "photoBase": "https://ecom-su-static-prod.wtrecom.com/images/products/",
                 "photoTemplate": "https://ecom-su-static-prod.wtrecom.com/images/products/11/LN_{photo}_BP_11.jpg",
                 "photo": re.compile(r"^https://ecom-su-static-prod\.wtrecom\.com/images/products/\d+/LN_(\d{6})_BP_\d+\.jpg$")},
    "morrisons": {"name": "Morrisons", "pageBase": "https://groceries.morrisons.com/search?entry=", "pageSearch": True,
                  "photoBase": "https://groceries.morrisons.com/images-v3/",
                  "photoTemplate": "https://groceries.morrisons.com/images-v3/{photo}/300x300.jpg",
                  "photo": re.compile(r"^https://groceries\.morrisons\.com/images-v3/([0-9a-f-]{36}/[0-9a-f-]{36})/300x300\.jpg$")},
    # Iceland's page opens from /p/x/<id>.html (its site ignores the slug): written as each product's page path.
    "iceland": {"name": "Iceland", "pageBase": "https://www.iceland.co.uk/p/x/", "pagePath": "{id}.html", "photoBase": "https://assets.iceland.co.uk/i/",
                "photoTemplate": "https://assets.iceland.co.uk/i/{photo}?w=400&h=400",
                "photo": re.compile(r"^https://assets\.iceland\.co\.uk/i/(iceland/[A-Za-z0-9_\-.%]{3,220})$")},
    # M&S: the 194 food-to-order, gift and Christmas products carry a price and open M&S's search; its everyday food range (mns_food_listing.py, product ids
    # fdp<digits>) has no price in its aisle lists and opens each product's own page under pageRoot. A picture id is the old "SD_FD_..." name or "<32 hex>.jpg".
    "marks-and-spencer": {"name": "M&S", "pageBase": "https://www.marksandspencer.com/search?searchTerm=", "pageSearch": True,
                          "pageRoot": "https://www.marksandspencer.com/food/", "priceNote": "stores",
                          "photoBase": "https://assets.digitalcontent.marksandspencer.app/image/upload/",
                          "photoTemplate": "https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/{photo}",
                          "photo": re.compile(r"^https://assets\.digitalcontent\.marksandspencer\.app/image/upload/w_400,q_auto,f_jpg/([A-Za-z0-9_]{6,80}(?:\.jpg)?)$")},
}
NAMES = {k: v["name"] for k, v in SHOPS.items()}
PAGE_BASE = {k: v["pageBase"] for k, v in SHOPS.items()}
PHOTO_BASE = {k: v["photoBase"] for k, v in SHOPS.items()}
SLUG = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-_.%]{0,119}")
PAGE_PATH = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-_.%/]{0,199}")


def category_for(shop: str, paths: list[str]) -> str | None:
    """The type a product is listed under, from the shop's own category paths (None = leave the product out: Lidl's offer-page-only products,
    some of them next week's deals). Sainsbury's and Asda: the top level of the first path. Aldi: its main aisle when the product sits in one,
    else the first. Lidl: the aisle under "Food & Drink"."""
    paths = [p.strip() for p in paths if p.strip()]
    if not paths:
        return "Other"
    if shop == "aldi":
        tops = [p.split("/")[0].strip() for p in paths]
        top = next((t for t in tops if t in ALDI_AISLES), tops[0])
        return ALDI_AISLES.get(top) or ALDI_OTHER.get(top) or top.replace("-", " ").capitalize()
    if shop == "lidl":
        food = next((p for p in paths if p.split(" / ")[0].strip() == "Food & Drink" and " / " in p), None)
        return food.split(" / ")[1].strip() if food else None
    if shop in ("waitrose", "morrisons"):
        top = paths[0].split("/")[0].strip()
        aisles = WAITROSE_AISLES if shop == "waitrose" else MORRISONS_AISLES
        return aisles.get(top) or top.replace("_", " ").replace("-", " ").capitalize()
    top = re.sub(r"\s*\(.*$", "", paths[0].split(" > ")[0]).strip()  # "Food & drink gifts (all)" -> "Food & drink gifts"
    if shop == "tesco":
        return TESCO_AISLES.get(top) or top.replace("-", " ").capitalize()
    return top if top and top != "?" else "Other"


def read_pages(shop: str, problems: list[str]) -> dict[str, str]:
    """product id -> page path after the shop's pageBase, from data/groceries/listing/<shop>-pages.csv (the shop's own sitemap)."""
    path = ROOT / "data" / "groceries" / "listing" / f"{shop}-pages.csv"
    out: dict[str, str] = {}
    if not SHOPS[shop].get("pages") or not path.exists():
        return out
    base = SHOPS[shop]["pageBase"]
    with open(path, newline="", encoding="utf-8") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            pid, url = (r.get("product_id") or "").strip(), (r.get("page_url") or "").strip()
            rest = url[len(base):] if url.startswith(base) else ""
            if not (pid and PAGE_PATH.fullmatch(rest) and ".." not in rest and rest.endswith(pid if shop == "lidl" else pid.zfill(18))):
                problems.append(f"{shop}-pages.csv line {line}: not that product's page on the shop's site ({pid!r})")
                continue
            out[pid] = rest
    return out


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


def held_back(shop: str) -> set[str]:
    """The product ids of the shop's labels in data/groceries/nutrition/holdback.csv (shop,id,reason)."""
    hb = ROOT / "data" / "groceries" / "nutrition" / "holdback.csv"
    if not hb.exists():
        return set()
    with open(hb, newline="", encoding="utf-8") as f:
        return {row[1].strip() for row in csv.reader(f) if len(row) >= 2 and row[0].strip() == shop}


def label_held_back(shop: str) -> set[str]:
    """The held-back products whose hold-back says it "takes no numbers from elsewhere": the wrong figures are the maker's own, seen in the community data
    or other shops' labels too (2026-11-19: Nesquik powders, an Alpro drink). Every other hold-back still lets the product borrow the same product's label
    from another shop or take community numbers (most are about one shop's page: a misread, another product's table, one item of a mixed pack)."""
    hb = ROOT / "data" / "groceries" / "nutrition" / "holdback.csv"
    if not hb.exists():
        return set()
    with open(hb, newline="", encoding="utf-8") as f:
        return {row[1].strip() for row in csv.reader(f) if len(row) >= 3 and row[0].strip() == shop and "no numbers from elsewhere" in row[2]}


def drop_held_back(docs: dict[str, dict]) -> dict[str, int]:
    """Clear the numbers (borrowed from another shop, community or government data) of every product whose hold-back says it takes none (label_held_back):
    it shows none. Returns how many per shop."""
    out: dict[str, int] = {}
    for shop, doc in docs.items():
        held = label_held_back(shop)
        n = 0
        for p in doc["products"]:
            if p[10] and str(p[0]) in held:
                p[10] = None
                n += 1
        out[shop] = n
    return out


def read_nutrition(shop: str, problems: list, path: Path | None = None) -> dict:
    """slug -> ([kcal, protein, carbs, fat, saturates, sugars, fibre, salt, kJ, per], checked_on), from the shop's own product pages."""
    path = path or ROOT / "data" / "groceries" / "nutrition" / f"{shop}.csv"
    out: dict = {}
    if not path.exists():
        return out
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_groceries as bg  # noqa: E402  (the same number reading and plausibility rules as the catalogue)

    # a label held back (data/groceries/nutrition/holdback.csv: it can't be right, or the shop's page shows another product's) is never used, whichever of the
    # shop's label files it comes from (2026-11-19: labels_chrome_ingest.py left it out of <shop>-chrome.csv, but an older <shop>.csv row still showed it)
    held = held_back(shop)
    with open(path, newline="", encoding="utf-8-sig") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            slug, per = (r.get("product_id") or "").strip(), (r.get("per") or "").strip()
            if slug in held:
                continue
            main = [bg.printed_num(r.get(k)) for k in ("kcal", "protein_g", "carbs_g", "fat_g")]
            if not SLUG.fullmatch(slug) or per not in ("g", "ml") or None in main or bg.implausible(main[0], main[1], main[2], main[3], fibre=bg.printed_num(r.get("fibre_g"))):
                problems.append(f"nutrition/{path.name} line {line}: not usable ({slug!r})")
                continue

            def opt(k):
                v = bg.printed_num(r.get(k))
                return None if v is None or v < 0 else round(v, 2)

            state = " ".join((r.get("state") or "").lower().split())[:24]
            out[slug] = ([round(main[0], 1), round(main[1], 1), round(main[2], 1), round(main[3], 1), opt("saturates_g"), opt("sugars_g"), opt("fibre_g"), opt("salt_g"),
                          opt("kj"), per, state], (r.get("checked_on") or "").strip())
    # a shop whose main file comes from another reader (Sainsbury's: t2_sainsburys.py) keeps its Chrome reads in <shop>-chrome.csv: they fill only products the
    # main file has no row for, never replace one
    extra = ROOT / "data" / "groceries" / "nutrition" / f"{shop}-chrome.csv"
    if path.name == f"{shop}.csv" and extra.exists():
        for slug, v in read_nutrition(shop, problems, extra).items():
            out.setdefault(slug, v)
    return out


def read_listing_photos(shop: str, problems: list[str]) -> dict[str, str]:
    """Photos read later from a product's own page for listing rows that had none (founder 2026-10-11: every product should show its shop's own
    photo): data/groceries/images/<shop>-listing.csv, columns product_id,image_url,page_url,checked_on, written by the Chrome run in
    docs/NEXT_GROCERIES_IMAGES_PROMPT.md. Only the shop's own image host, and only when page_url is that product's own page, are accepted (a page ending
    in the id, or in the shop's own page form: Iceland's "<id>.html")."""
    path = ROOT / "data" / "groceries" / "images" / f"{shop}-listing.csv"
    out: dict[str, str] = {}
    if not path.exists():
        return out
    base = PHOTO_BASE.get(shop, "")
    page_form = SHOPS.get(shop, {}).get("pagePath") or "{id}"
    with open(path, newline="", encoding="utf-8") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            pid, url, page = (r.get("product_id") or "").strip(), (r.get("image_url") or "").strip(), (r.get("page_url") or "").strip()
            if not (SLUG.fullmatch(pid) and base and url.startswith(base) and page.startswith("https://")
                    and page.rstrip("/").endswith("/" + page_form.format(id=pid))):
                problems.append(f"{shop}-listing.csv line {line}: not the shop's own photo of that product's page ({pid!r})")
                continue
            out[pid] = url
    return out


def read_listing_exclude(path: Path | None = None) -> set[tuple[str, str]]:
    """(shop, product id) whose listing photo must not be shown, from data/groceries/images/listing-exclude.csv (`shop,product_id,reason`): a placeholder
    ("MISSING IMAGE", a blank picture) or a picture of another variety, found by looking at contact sheets. The row then shows another supermarket's photo of
    the same product where one exists, else "no photo"."""
    path = path or ROOT / "data" / "groceries" / "images" / "listing-exclude.csv"
    if not path.exists():
        return set()
    with open(path, newline="", encoding="utf-8") as f:
        return {((r.get("shop") or "").strip(), (r.get("product_id") or "").strip()) for r in csv.DictReader(f)}


def barcode_by_name(name: str) -> str:
    """The barcode of the one branded product with exactly this name and pack size in the barcoded lists (build_groceries.name_barcodes), else ""."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_groceries as bg  # noqa: E402

    key = bg.name_key(name)
    code = bg.name_barcodes().get(key, "") if key else ""
    return code if code and not bg.restricted_code(code) else ""


def asda_barcode(photo_id: str) -> bool:
    """An Asda picture id that is a real barcode (GS1 check digit, not a shop-internal number)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_groceries as bg  # noqa: E402

    return photo_id.isdigit() and bg.gtin_ok(photo_id) and not bg.restricted_code(photo_id)


# Lidl prints a price on its website only for its weekly offers and special buys; its everyday range has a page with no price (founder 2026-10-11:
# "Add all, say 'Price in store'"). M&S's aisle pages list no price for its everyday food range (founder 2026-10-16: "M&S definetly has
# more products add the rest of them please"). Rows from MORE_ROWS (tools/groceries/lidl_range.py, Lidl's own product pages; tools/groceries/mns_food_listing.py,
# M&S's own aisle pages) may therefore have no price: the app says "Price in store". Every other shop, and these shops' own category-page rows, keep
# "no price printed -> not listed".
# The unit a shop prints its unit price in, as the app shows it: "per kg", "per litre", "each" (or "" when it printed none). M&S's aisle pages print a bare "kg"
# or "litre" (2026-11-20: "£16.80 kg" read wrong, and Compare and Cheapest protein couldn't use M&S's prices at all). Anything else (Sainsbury's baking paper
# "mtr") has no unit the app can use: its unit price is left out.
UNIT_WORDS = {"per kg": "per kg", "kg": "per kg", "per kilo": "per kg", "per litre": "per litre", "litre": "per litre", "per l": "per litre", "l": "per litre",
              "ltr": "per litre", "per ltr": "per litre", "each": "each", "": ""}


def unit_word(raw: str) -> str | None:
    """The app's word for a printed unit, or None when it isn't one the app can use (the unit price is then left out)."""
    return UNIT_WORDS.get(" ".join((raw or "").lower().split()))


PRICE_IN_STORE = {"lidl", "marks-and-spencer"}
MORE_ROWS = {"lidl": ROOT / "data" / "groceries" / "listing" / "lidl-range.csv",
             "marks-and-spencer": ROOT / "data" / "groceries" / "listing" / "marks-and-spencer-food.csv"}
# M&S's everyday-range titles are mostly its own label ("Baby Rainbow Carrots 200 g", no "M&S" in the name), so a name shared with another shop's product is no
# proof that it is the same product: such rows take no barcode and lend or borrow no photo by name. (shop, product id) of every such row built.
NO_NAME_MATCH = {"marks-and-spencer"}
NAME_SKIP: set[tuple[str, str]] = set()


def listing_rows(path: Path, more: Path | None = None):
    """(line, row, from_more) for the shop's listing, then every row of `more` (MORE_ROWS). The caller lists a `more` row only when the listing didn't
    list that product (the listing row wins: it carries the offer and card price; a listing row left out, e.g. one seen only on an offer page, gives
    way to the product's own page)."""
    with open(path, newline="", encoding="utf-8") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            yield line, r, False
    if more and more.exists():
        with open(more, newline="", encoding="utf-8") as f:
            for line, r in enumerate(csv.DictReader(f), start=2):
                yield line, r, True


def build_shop(shop: str, problems: list, path: Path | None = None, gtins: dict | None = None, nutrition: dict | None = None,
               pages: dict | None = None, photos: dict | None = None, more: Path | None = None, exclude: set | None = None) -> dict | None:
    if path is None:
        path, more = ROOT / "data" / "groceries" / "listing" / f"{shop}.csv", more or MORE_ROWS.get(shop)
    if not path.exists():
        return None
    gt = gtins if gtins is not None else gtins_by_slug(shop)
    nut = nutrition if nutrition is not None else read_nutrition(shop, problems)
    nut_days = set()
    cats: list[str] = []
    schemes: list[str] = []
    products = []
    days = set()
    extra_photos = photos if photos is not None else read_listing_photos(shop, problems)
    pages = pages if pages is not None else read_pages(shop, problems)
    exclude = exclude if exclude is not None else read_listing_exclude()
    listed: set[str] = set()
    for line, r, from_more in listing_rows(path, more):
        pid, name = (r.get("product_id") or "").strip(), " ".join((r.get("name") or "").split())
        if not SLUG.fullmatch(pid) or len(name) < 2 or name == "?":
            problems.append(f"{shop} line {line}: bad id or name ({pid!r})")
            continue
        price, unit_price = num(r.get("price_gbp")), num(r.get("unit_price_gbp"))
        if price is not None and price <= 0:
            price = None
        if from_more and pid in listed:
            continue
        if price is None and not (from_more and shop in PRICE_IN_STORE):
            continue  # no price printed (out of stock or a placeholder): not listed
        if from_more and pid not in pages:
            url = (r.get("page_url") or "").strip()
            root = SHOPS[shop].get("pageRoot") or SHOPS[shop]["pageBase"]   # M&S: its product pages are not under its search address
            rest = url[len(root):] if url.startswith(root) else ""
            if PAGE_PATH.fullmatch(rest) and ".." not in rest and rest.endswith("/" + pid):
                pages[pid] = rest
        member = num(r.get("member_price_gbp"))
        scheme = (r.get("member_scheme") or "").strip()
        if member is not None and (price is None or member >= price or not scheme):
            member = None  # a card price counts only when it is lower and named
        if not_food(name) or (shop in NOT_FOOD_IDS and NOT_FOOD_IDS[shop].search(pid)) or name.strip().lower() in ADVERT:
            continue  # groceries only, and no advert tiles
        if is_alcohol(name, r.get("category_path") or ""):
            continue  # no alcoholic drinks (founder 2026-10-11)
        cat = category_for(shop, (r.get("category_path") or "").split(" | "))
        if cat is None:
            continue
        if cat not in cats:
            cats.append(cat)
        if member is not None and scheme not in schemes:
            schemes.append(scheme)
        photo_re = SHOPS[shop]["photo"]
        photo = photo_re.search(r.get("image_url") or "") or photo_re.search(extra_photos.get(pid, ""))
        if (shop, pid) in exclude:
            photo = None  # a placeholder or another variety's picture (listing-exclude.csv)
        days.add((r.get("checked_on") or "").strip())
        n = nut.get(pid) or nut.get(pid.lower())
        if n:
            nut_days.add(n[1])
        gtin = gt.get(pid.lower(), "")
        if not gtin and shop == "asda" and photo and asda_barcode(photo.group(1)):
            gtin = photo.group(1)  # Asda names its product pictures by barcode: the app links it to the full product page where the catalogue has it
        if from_more and shop in NO_NAME_MATCH:
            NAME_SKIP.add((shop, pid))    # M&S's everyday range: no barcode, and no photo, from another shop's product that merely has the same name
        elif not gtin:
            gtin = barcode_by_name(name)  # founder 2026-10-11: the same branded name and pack size as a barcoded product at another shop
        unit = unit_word(r.get("unit") or "")
        if unit is None:
            unit, unit_price = "", None
        row = [pid, name, price, unit_price if unit_price and unit_price > 0 else None, unit,
               member, schemes.index(scheme) if member is not None else None, cats.index(cat), photo.group(1) if photo else "", gtin,
               n[0] if n else None]
        if pid in pages:
            row.append(pages[pid])
        elif SHOPS[shop].get("pagePath"):
            row.append(SHOPS[shop]["pagePath"].format(id=pid))
        products.append(row)
        listed.add(pid)
    days.discard("")
    cfg = SHOPS[shop]
    head = {"v": 1, "retailer": shop, "name": cfg["name"], "checkedOn": min(days) if days else "", "pageBase": cfg["pageBase"], "photoBase": cfg["photoBase"]}
    head.update({k: cfg[k] for k in ("photoTemplate", "pageSearch", "pageRoot", "priceNote") if k in cfg})
    return {**head, "categories": cats, "schemes": schemes, "nutritionCheckedOn": min(d for d in nut_days if d) if any(nut_days) else "",
            "nutritionCheckedTo": max(d for d in nut_days if d) if any(nut_days) else "", "products": products}


def own_photo_url(shop: str, photo_id: str) -> str:
    cfg = SHOPS[shop]
    return cfg["photoTemplate"].replace("{photo}", photo_id) if cfg.get("photoTemplate") else f"{cfg['photoBase']}{photo_id}/image.jpg"


OFF_IMAGE = re.compile(r"^https://images\.openfoodfacts\.org/images/products/[0-9/]{8,40}/front_[a-z]{2}\.\d+\.(?:400|full)\.jpg$")


def read_off_images(path: Path | None = None) -> dict[str, str]:
    """Barcode -> Open Food Facts front photo of exactly that barcode (data/groceries/images/off-front.csv, tools/groceries/fetch_off_images.py)."""
    path = path or ROOT / "data" / "groceries" / "images" / "off-front.csv"
    out: dict[str, str] = {}
    if path.exists():
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                url = (r.get("image_url") or "").strip()
                if OFF_IMAGE.match(url) and (r.get("gtin") or "").strip().isdigit():
                    out[norm_code(r["gtin"].strip())] = url
    return out


def catalogue_photos(base: Path | None = None) -> dict[str, tuple[str, str]]:
    """Barcode -> (shop, the shop's own photo) from the barcode catalogue (web/public/groceries/<shop>.json): photos read from the shops' own product pages."""
    base = base or ROOT / "web" / "public" / "groceries"
    out: dict[str, tuple[str, str]] = {}
    for shop in SHOPS:
        path = base / f"{shop}.json"
        if not path.exists():
            continue
        for p in json.loads(path.read_text()).get("products", []):
            url = p.get("retailerImage") or ""
            if url.startswith("https://") and p.get("gtin") and norm_code(p["gtin"]) not in out:
                out[norm_code(p["gtin"])] = (shop, url)
    return out


def catalogue_nutrition(base: Path | None = None, details: Path | None = None, looked_up: Path | None = None) -> dict[str, tuple[list, str | None]]:
    """Barcode -> the barcode catalogue's per-100 g or ml numbers (web/public/groceries/<shop>.json: Open Food Facts contributors, community data, already
    through the catalogue's checks), as a nutrition row ending "off" so every screen can say where they come from (founder 2026-11-17: recipes for every
    supermarket in the app, with community numbers where we haven't read the shop's own label). Shop-internal numbers (restricted_code) are never used,
    nor the few records whose numbers came from Tesco's own product pages (data/groceries/details: they aren't community data).
    Also the records looked up by exact barcode for products recipes could use (tools/groceries/fetch_off_codes.py --codes, saved in
    data/groceries/nutrition/raw-off/<barcode>.json), through the catalogue's own checks (build_groceries.convert); for those the record's name comes back
    too, and fill_community_nutrition uses one only when it shares a word with the shop's own name for the product."""
    base = base or ROOT / "web" / "public" / "groceries"
    details = details or ROOT / "data" / "groceries" / "details"
    own: set[str] = set()
    for path in sorted(details.glob("*.csv")) if details.exists() else []:
        with open(path, newline="", encoding="utf-8-sig") as f:
            own |= {norm_code(r.get("gtin") or "") for r in csv.DictReader(f)}
    out: dict[str, tuple[list, str | None]] = {}
    for shop in SHOPS:
        path = base / f"{shop}.json"
        if not path.exists():
            continue
        for c in json.loads(path.read_text()).get("products", []):
            code = norm_code(c.get("gtin") or "")
            if not code or code in out or code in own or restricted_code(code) or c.get("per") not in ("g", "ml"):
                continue
            main = [c.get(k) for k in ("kcal", "protein", "carbs", "fat")]
            if not all(isinstance(v, (int, float)) for v in main) or implausible(*main, c.get("kj") if isinstance(c.get("kj"), (int, float)) else None,
                                                                                 c.get("fibre") if isinstance(c.get("fibre"), (int, float)) else None):
                continue
            out[code] = (community_row(c), None)
    looked_up = looked_up or ROOT / "data" / "groceries" / "nutrition" / "raw-off"
    import build_groceries as bg  # noqa: E402  (the catalogue's own checks for an Open Food Facts record)

    for path in sorted(looked_up.glob("*.json")) if looked_up.exists() else []:
        try:
            ans = json.loads(path.read_text())
        except ValueError:
            continue
        rec = bg.convert(ans["product"], {}) if ans.get("status") == 1 and isinstance(ans.get("product"), dict) else None
        code = norm_code(rec["gtin"]) if rec else ""
        if rec and code and code not in out and code not in own and not restricted_code(code):
            out[code] = (community_row(rec), rec["name"])
    return out


def community_row(c: dict) -> list:
    """A catalogue record's numbers as a list row's nutrition, marked "off" (community data)."""
    def opt(k):
        v = c.get(k)
        return round(v, 2) if isinstance(v, (int, float)) and v >= 0 else None

    return [round(c["kcal"], 1), round(c["protein"], 1), round(c["carbs"], 1), round(c["fat"], 1), opt("saturates"), opt("sugars"), opt("fibre"), opt("salt"),
            opt("kj"), c["per"], "", "off"]


# Plain raw meat and fish whose calories per 100 g as sold lie in a known band (the same bands as the recipes' pantry kinds, web/lib/mm/pantry.ts): community
# numbers outside it are for something else (2026-11-20: "Chicken Breast Fillets 1.2kg" at 11 kcal and 2.2 g protein) and are left out. Only a name with no
# processing word in it.
KIND_BANDS = [
    (re.compile(r"\bchicken (?:breast|breasts|breast fillets?|mini fillets?)\b", re.I), 90, 200, 18),
    (re.compile(r"\bchicken thighs?\b", re.I), 100, 280, 14),
    (re.compile(r"\b(?:beef|steak) mince\b", re.I), 100, 330, 14),
    (re.compile(r"\bturkey (?:breast|mince)\b", re.I), 90, 220, 16),
    (re.compile(r"\bsalmon fillets?\b", re.I), 110, 280, 16),
    (re.compile(r"\b(?:cod|haddock|pollock|hake) (?:fillets?|loins?)\b", re.I), 55, 130, 13),
]
PROCESSED = re.compile(r"\b(?:breaded|coated|battered|crumb|kievs?|sauce|with|marinated|glazed|stuffed|wrapped|pie|nuggets?|goujons?|dippers|fingers|"
                       r"bites|tikka|kebabs?|skewers?|sandwich|wrap|slices?|sliced|cooked|roast|smoked|pate|soup|meal|curry|in |fishcakes?|burgers?|meatballs?)\b", re.I)


def outside_kind(name: str, row: list) -> bool:
    """Community numbers that can't be this plain raw meat or fish (KIND_BANDS)."""
    if PROCESSED.search(name):
        return False
    for pattern, low, high, protein in KIND_BANDS:
        if pattern.search(name):
            return not (low <= row[0] <= high) or row[1] < protein
    return False


def fill_community_nutrition(docs: dict[str, dict], by_code: dict[str, tuple[list, str | None]]) -> dict[str, int]:
    """A row with no numbers from its own page takes the community numbers of exactly its barcode (catalogue_nutrition); a record looked up by barcode
    only when its name shares a word with the shop's own name (build_groceries.names_agree), as for the catalogue. Returns how many per shop."""
    from build_groceries import names_agree  # noqa: E402

    # the calories a shop's own label prints for the same product (same barcode, or the same branded name and pack size): community numbers more than 30% away
    # from every one of them are wrong for this product and are left out (2026-11-20: a chicken breast at 11 kcal)
    labelled: dict[str, list[float]] = {}
    for shop, doc in docs.items():
        for r in doc["products"]:
            if not own_label(r[10]) or not isinstance(r[10][0], (int, float)):
                continue
            code = norm_code(r[9]) if r[9] else ""
            for key in ([f"b:{code}"] if code and not restricted_code(code) else []) + ([f"n:{k}"] if (k := name_key(r[1])) and (shop, r[0]) not in NAME_SKIP else []):
                labelled.setdefault(key, []).append(float(r[10][0]))

    def far_from_labels(r, row) -> bool:
        code = norm_code(r[9]) if r[9] else ""
        kcals = labelled.get(f"b:{code}", []) + (labelled.get(f"n:{k}", []) if (k := name_key(r[1])) else [])
        return bool(kcals) and all(abs(row[0] - k) > 0.3 * max(k, 1.0) for k in kcals)

    counts: dict[str, int] = {}
    for shop, doc in docs.items():
        n = 0
        for r in doc["products"]:
            code = norm_code(r[9]) if r[9] else ""
            if r[10] is not None or not code or restricted_code(code) or code not in by_code:
                continue
            row, their_name = by_code[code]
            if their_name is not None and names_agree(r[1], their_name) is not True:
                continue
            if far_from_labels(r, row) or outside_kind(r[1], row):
                continue
            r[10] = list(row)
            n += 1
        counts[shop] = n
    return counts


def write_recheck(docs: dict[str, dict], path: Path | None = None) -> int:
    """data/groceries/nutrition/recheck.csv: the shops' own labels whose calories disagree by more than 40% with what their protein, carbohydrate and fat (and
    fibre, at 2 kcal a gram) add up to, for a person to read the page again (a founder item; nothing is changed or guessed). From 20 kcal per 100 g or ml."""
    path = path or ROOT / "data" / "groceries" / "nutrition" / "recheck.csv"
    rows = []
    for shop, doc in docs.items():
        for r in doc["products"]:
            n = r[10]
            if not own_label(n) or not all(isinstance(v, (int, float)) for v in n[:4]) or n[0] < 20:
                continue
            est = 4 * n[1] + 4 * n[2] + 9 * n[3]
            ests = [est] + ([est + 2 * n[6]] if isinstance(n[6], (int, float)) and n[6] > 0 else [])
            if all(abs(n[0] - e) > 0.4 * n[0] for e in ests):
                rows.append([shop, r[0], r[1], n[0], n[1], n[2], n[3], n[6] if isinstance(n[6], (int, float)) else "", round(est)])
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["shop", "product_id", "name", "kcal", "protein_g", "carbs_g", "fat_g", "fibre_g", "kcal_from_macros"])
        w.writerows(sorted(rows))
    return len(rows)


# A dry staple's label that is really for the cooked or prepared food (founder 2026-11-18, the label review): some pages and community records print figures
# for the boiled pasta or the made-up couscous while the heading says only "per 100g" (M&S pearl barley 107 kcal; Asda penne 157 kcal from Open Food Facts).
# Dried pasta, rice, grains, flour, oats and dried lentils are about 330-380 kcal per 100 g as sold, so under 250 can't be the food as sold: those numbers are
# left out (nothing is guessed; the product shows no nutrition, and a recipe uses another product). Only a plain dry staple counts: every word of its name is a
# staple, a shop or range word or a plain describing word, so ready meals ("spaghetti bolognese"), pouches ("microwave", "steamed"), fresh pasta and anything
# "with" something are never touched, and nor is a pack under 400 g or a multipack (pouches come in those), rice pudding (a tinned dessert: "pudding rice" is
# the dry one) or a lasagne that isn't "lasagne sheets" (a ready meal).
STAPLE_CORE = {
    "spaghetti", "spaghettini", "penne", "fusilli", "farfalle", "linguine", "tagliatelle", "pappardelle", "rigatoni", "macaroni", "conchiglie", "orzo",
    "lasagne", "lasagna", "gemelli", "tortiglioni", "casarecce", "orecchiette", "pasta", "rice", "couscous", "bulgur", "bulghur", "bulgar", "barley",
    "quinoa", "freekeh", "semolina", "polenta", "flour", "oats",
}
STAPLE_WORDS = STAPLE_CORE | {
    # what the staple is
    "sheets", "shells", "twists", "tubes", "elbows", "spirals", "bows", "pearl", "wheat", "durum", "whole", "wholewheat", "wholemeal", "wholegrain",
    "white", "brown", "long", "grain", "easy", "cook", "basmati", "jasmine", "arborio", "risotto", "paella", "sticky", "sushi", "red", "green",
    "split", "dried", "giant", "fine", "medium", "coarse", "plain", "self", "raising", "strong", "bread", "spelt", "porridge", "rolled", "jumbo", "scottish",
    "tricolore", "tricolour", "mini", "quick", "italian", "organic", "free", "from", "gluten", "british", "lentils", "lentil", "pearled", "cracked",
    # shops, their ranges and the big dry-goods brands
    "asda", "tesco", "sainsbury", "sainsburys", "by", "ms", "waitrose", "morrisons", "iceland", "aldi", "lidl", "coop", "essential", "essentials",
    "just", "everyday", "specially", "selected", "exceptional", "extra", "special", "taste", "the", "difference", "finest", "savers", "best", "value",
    "inspired", "cucina", "duchy", "collection", "cooks", "ingredients", "stamford", "street", "hubbards", "napolina", "barilla", "de", "cecco", "garofalo",
    "quaker", "flahavans", "mornflake", "homepride", "allinson", "allinsons", "tilda", "food", "foods",
}


def cooked_staple(name: str, nut) -> bool:
    """A plain dry staple whose 'as sold' label is under 250 kcal per 100 g: the figures must be for the cooked or prepared food (see above)."""
    if not nut or not isinstance(nut[0], (int, float)) or nut[0] >= 250 or (len(nut) > 10 and nut[10]):
        return False
    low = name.lower().replace("&", " ").replace("’", "'").replace("'s", "s")
    if re.search(r"\d\s*x\s*\d|\bx\s*\d", low):
        return False  # a multipack: pouches come in those
    size = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g)\b", low)
    if size and float(size.group(1)) * (1000 if size.group(2) == "kg" else 1) < 400:
        return False  # under 400 g: often a ready-to-heat pouch
    words = [w for w in re.split(r"[^a-z]+", re.sub(r"\d+(?:\.\d+)?\s*(kg|g|ml|l)\b", " ", low)) if w]
    if (("lentils" in words or "lentil" in words) and not {"red", "split", "dried"} & set(words)):
        return False  # plain lentils may be a ready-to-eat pouch
    if "pudding" in words:
        at = words.index("pudding")
        if at + 1 >= len(words) or words[at + 1] != "rice":
            return False  # rice pudding is a dessert; only "pudding rice" is dry
        words = words[:at] + words[at + 1:]
    if ({"lasagne", "lasagna"} & set(words)) and "sheets" not in words:
        return False  # a lasagne is a ready meal; the dry one is "lasagne sheets"
    return bool(words) and all(w in STAPLE_WORDS for w in words) and any(w in STAPLE_CORE or w in ("lentils", "lentil") for w in words)


def drop_cooked_staples(docs: dict[str, dict]) -> dict[str, int]:
    """Leaves out the numbers cooked_staple finds (from any source), per shop."""
    dropped: dict[str, int] = {}
    for shop, doc in docs.items():
        for row in doc["products"]:
            if cooked_staple(row[1], row[10]):
                row[10] = None
                dropped[shop] = dropped.get(shop, 0) + 1
    return dropped


def own_label(nut) -> bool:
    """A row's numbers were read from that shop's own product page (not community numbers, not borrowed from another shop)."""
    return bool(nut) and not (len(nut) > 11 and isinstance(nut[11], str) and (nut[11] == "off" or nut[11].startswith("same:")))


def fill_same_product_nutrition(docs: dict[str, dict]) -> dict[str, int]:
    """A row with no label of its own takes the label read from ANOTHER supermarket's page for exactly the same product (founder 2026-11-17: "if it's the same
    exact product on another supermarket ... you can literally just duplicate it"): the same barcode (never a shop-internal number), else the same branded name
    and pack size (build_groceries.name_key: never a shop's own brand, whose recipe differs from shop to shop; exact, not the any-order match photos use). A
    product two shops' labels disagree on lends nothing. Marked "same:<shop>" so the app says whose page the numbers are from. Runs before the community step,
    so a shop's label always beats community numbers. Returns how many rows per shop."""
    by_code: dict[str, tuple[str, list] | None] = {}
    by_name: dict[str, tuple[str, list] | None] = {}

    def put(table: dict, key: str, shop: str, nut: list) -> None:
        if key in table:
            seen = table[key]
            if seen is not None and seen[1][:4] != nut[:4]:
                table[key] = None  # two shops print different numbers for it: lend neither
            return
        table[key] = (shop, nut)

    for shop, doc in docs.items():
        for r in doc["products"]:
            if not own_label(r[10]):
                continue
            nut = list(r[10][:11]) + [""] * (11 - len(r[10][:11]))
            code = norm_code(r[9]) if r[9] else ""
            if code and not restricted_code(code):
                put(by_code, code, shop, nut)
            key = name_key(r[1])
            if key and (shop, r[0]) not in NAME_SKIP:
                put(by_name, key, shop, nut)
    counts: dict[str, int] = {}
    for shop, doc in docs.items():
        n = 0
        for r in doc["products"]:
            if r[10] is not None:
                continue
            code = norm_code(r[9]) if r[9] else ""
            hit = by_code.get(code) if code and not restricted_code(code) else None
            if not hit and (shop, r[0]) not in NAME_SKIP:
                key = name_key(r[1])
                hit = by_name.get(key) if key else None
            if hit and hit[0] != shop:
                r[10] = list(hit[1]) + ["same:" + hit[0]]
                n += 1
        counts[shop] = n
    return counts


# Each shop's fresh fruit and vegetable aisle (its own name for it): only a product listed there can be loose fresh produce. A tin, a frozen bag or a jar (chopped
# tomatoes, frozen sliced mushrooms, chopped garlic) is in another aisle and carries a label of its own (2026-11-20: they had been given raw produce figures).
FRESH_AISLES = {"sainsburys": {"Fruit & vegetables"}, "tesco": {"Fresh Food"}, "asda": {"Fresh Fruit, Vegetables & Flowers"}, "aldi": {"Fresh Food"},
                "lidl": {"Fruit & veg"}, "morrisons": {"Fruit & Veg"}, "waitrose": {"Fresh & Chilled"}, "iceland": {"Fresh"}, "marks-and-spencer": {"Fruit & Vegetables"}}
# Shops whose product pages print no nutrition at all (Lidl publishes none online): their pages need no reading to know that.
NO_LABELS_ONLINE = {"lidl"}


def fill_produce_nutrition(docs: dict[str, dict], status: dict[str, dict[str, str]] | None = None) -> dict[str, int]:
    """Loose fresh fruit and vegetables with no label of any kind take the UK government's figures for that food, raw (McCance and Widdowson's Composition of Foods
    Integrated Dataset 2021, Open Government Licence; tools/groceries/cofid.py; founder 2026-11-17: "you can use the government food data for loose fruits and
    vegetables. If it doesn't, of course, have it on the website of the supermarket"). Only a product in the shop's fresh fruit and vegetable aisle (FRESH_AISLES)
    whose own page was read and printed no nutrition table (labels_chrome_ingest.read_status; every product of a shop in NO_LABELS_ONLINE): a page not read yet
    may have a label, so that product stays without numbers and the app says it hasn't read them (2026-11-20). Marked "cofid" with the food's own name, so the
    app says so. Runs last."""
    import cofid  # noqa: E402
    from labels_chrome_ingest import read_status  # noqa: E402

    try:
        table = cofid.cofid_rows()
    except (OSError, KeyError, StopIteration):
        return {}
    counts: dict[str, int] = {}
    for shop, doc in docs.items():
        seen = status[shop] if status is not None and shop in status else ({} if shop in NO_LABELS_ONLINE else read_status(shop))
        fresh = FRESH_AISLES.get(shop, set())
        n = 0
        for r in doc["products"]:
            cats = doc.get("categories") or []
            aisle = cats[r[7]] if isinstance(r[7], int) and 0 <= r[7] < len(cats) else ""
            if r[10] is not None or aisle not in fresh:
                continue
            if shop not in NO_LABELS_ONLINE and seen.get(r[0]) != "no table":
                continue
            code = cofid.produce_code(r[1])
            if code and code in table:
                r[10] = list(table[code])
                n += 1
        counts[shop] = n
    return counts


def word_set(key: str) -> str:
    """The same words in any order ("hovis soft medium sliced white bread 800g" = "hovis soft white medium sliced bread 800g"): for photos only."""
    return "words:" + " ".join(sorted(set(key.split())))


def fill_photos(docs: dict[str, dict], extra_by_code: dict[str, tuple[str, str]] | None = None, off: dict[str, str] | None = None) -> dict[str, dict[str, int]]:
    """Give each row without the shop's own photo the same product's photo from another supermarket's own website (same barcode first, then the same
    branded name and pack size: build_groceries.name_key, never a shop's own brand), else the Open Food Facts front photo of its exact barcode.
    Adds [source, address] as the row's 13th element. Returns counts per shop."""
    by_code: dict[str, tuple[str, str]] = {}
    by_name: dict[str, tuple[str, str]] = {}
    for shop, doc in docs.items():
        for r in doc["products"]:
            if not r[8]:
                continue
            url = own_photo_url(shop, r[8])
            if r[9]:
                by_code.setdefault(norm_code(r[9]), (shop, url))
            key = name_key(r[1])
            if key and (shop, r[0]) not in NAME_SKIP:   # a row whose name proves nothing (M&S's everyday range) lends no photo by name
                by_name.setdefault(key, (shop, url))
                by_name.setdefault(word_set(key), (shop, url))
    for code, hit in (extra_by_code or {}).items():
        by_code.setdefault(code, hit)
    off = off or {}
    counts: dict[str, dict[str, int]] = {}
    for shop, doc in docs.items():
        c = counts.setdefault(shop, {"barcode": 0, "name": 0, "off": 0, "none": 0})
        for r in doc["products"]:
            if r[8]:
                continue
            code = norm_code(r[9]) if r[9] else ""
            hit = by_code.get(code) if code else None
            hit = hit if hit and hit[0] != shop else None
            how = "barcode"
            if not hit and (shop, r[0]) not in NAME_SKIP:   # ... and borrows none by name either
                key = name_key(r[1])
                hit = (by_name.get(key) or by_name.get(word_set(key))) if key else None
                hit = hit if hit and hit[0] != shop else None
                how = "name"
            if not hit and code in off:
                hit, how = ("off", off[code]), "off"
            if not hit:
                c["none"] += 1
                continue
            while len(r) < 12:
                r.append(None if len(r) == 10 else "")
            r.append([hit[0], hit[1]])
            c[how] += 1
    return counts


def write_wanted_off(docs: dict[str, dict], path: Path | None = None) -> int:
    """Barcodes of listed products that still have no photo from any supermarket: the Open Food Facts photo fetcher's input."""
    path = path or ROOT / "data" / "groceries" / "wanted-images" / "off.csv"
    codes = sorted({norm_code(r[9]) for doc in docs.values() for r in doc["products"] if not r[8] and r[9] and len(r) < 13})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("gtin\n" + "".join(f"{c}\n" for c in codes))
    return len(codes)


def label_kind(nut) -> int:
    """How a row's numbers were come by, for barcodes.json: 0 none, 1 the shop's own label, 2 the same product's label read at another shop, 3 community
    numbers (Open Food Facts) for its barcode, 4 the government's figures for loose produce."""
    if not nut:
        return 0
    src = nut[11] if len(nut) > 11 and isinstance(nut[11], str) else ""
    return 3 if src == "off" else 4 if src == "cofid" else 2 if src.startswith("same:") else 1


def write_barcodes(docs: dict[str, dict], catalogue: Path | None = None, path: Path | None = None) -> dict:
    """web/public/groceries/all/barcodes.json (founder 2026-11-20: "when they scan a barcode of a product, it needs to come up with the product"): every barcode in
    every shop list, leading zeros stripped (norm_code: EAN-13, its GTIN-14 form and a 12-digit UPC-A are one number), to where it is: [[shop index, the shop's
    product id, label kind], ...] (label_kind), shops in PUBLISH order; and every barcode in the older barcode catalogue (web/public/groceries/<shop>.json) to the
    indexes of the catalogue files that hold it, so a scan opens the product's page loading only those files. Keys sorted so a rebuild changes only what changed."""
    catalogue = catalogue or ROOT / "web" / "public" / "groceries"
    path = path or OUT / "barcodes.json"
    shops = [s for s in PUBLISH if s in docs]
    codes: dict[str, list] = {}
    for i, shop in enumerate(shops):
        for r in docs[shop]["products"]:
            code = norm_code(r[9]) if r[9] else ""
            if code.isdigit() and not any(x[0] == i and x[1] == r[0] for x in codes.get(code, [])):
                codes.setdefault(code, []).append([i, r[0], label_kind(r[10])])
    cat_shops: list[str] = []
    cat_codes: dict[str, list[int]] = {}
    try:
        manifest = json.loads((catalogue / "groceries-manifest.json").read_text())
    except (OSError, ValueError):
        manifest = {"retailers": []}
    for entry in manifest.get("retailers", []):
        f = catalogue / str(entry.get("file") or "")
        if not entry.get("count") or not f.is_file():
            continue
        idx = len(cat_shops)
        cat_shops.append(entry["id"])
        for c in json.loads(f.read_text()).get("products", []):
            code = norm_code(c.get("gtin") or "")
            if code.isdigit() and idx not in cat_codes.setdefault(code, []):
                cat_codes[code].append(idx)
    doc = {"v": 1, "shops": shops, "codes": dict(sorted(codes.items())), "catalogue": {"shops": cat_shops, "codes": dict(sorted(cat_codes.items()))}}
    path.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    return doc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", choices=PUBLISH, help="write only this shop's file and replace only its entry in all-manifest.json (every shop is still built, so the photos "
                    "borrowed across shops stay identical); the other shops' files and the barcodes-wanted list are left alone")
    a = ap.parse_args(argv)
    manifest_path = OUT / "all-manifest.json"
    manifest = {"v": 1, "retailers": []}
    if a.only:
        try:
            manifest = json.loads(manifest_path.read_text())
        except (OSError, ValueError):
            print(f"--only needs the existing {manifest_path}; run without --only first")
            return 1
    OUT.mkdir(parents=True, exist_ok=True)
    problems: list = []
    NAME_SKIP.clear()
    docs = {shop: doc for shop in PUBLISH if (doc := build_shop(shop, problems))}
    if a.only and a.only not in docs:
        print(f"{a.only}: no listing to build from")
        return 1
    filled = fill_photos(docs, catalogue_photos(), read_off_images())
    cooked = drop_cooked_staples(docs)  # before borrowing, so another shop's label for the same branded product can fill in
    same = fill_same_product_nutrition(docs)
    community = fill_community_nutrition(docs, catalogue_nutrition())
    produce = fill_produce_nutrition(docs)
    for shop, n in drop_cooked_staples(docs).items():  # and after, for numbers borrowed from elsewhere
        cooked[shop] = cooked.get(shop, 0) + n
    # a product held back because its maker's figures are wrong takes no numbers from anywhere else either (2026-11-19: Nesquik powders' community numbers
    # and an Alpro drink's borrowed label carried the very error its own label was held back for); it says so in its hold-back
    for shop, n in drop_held_back(docs).items():
        if n:
            print(f"{shop}: {n} held-back products given no numbers from elsewhere")
    print("dry staples whose 'as sold' label is a cooked figure, left out: " + (", ".join(f"{k} {v}" for k, v in sorted(cooked.items())) or "none"))
    if not a.only:
        print(f"rows still without any photo whose barcode Open Food Facts may have: {write_wanted_off(docs)} (data/groceries/wanted-images/off.csv)")
    for shop, doc in docs.items():
        if a.only and shop != a.only:
            continue
        c = filled[shop]
        print(f"{shop}: photos from elsewhere for rows the shop showed none: {c['barcode']} by barcode, {c['name']} by name and size, {c['off']} Open Food Facts, {c['none']} still none")
        text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
        (OUT / f"{shop}.json").write_text(text)
        with_nutrition = sum(1 for p in doc["products"] if p[10])
        with_community = sum(1 for p in doc["products"] if p[10] and len(p[10]) > 11 and p[10][11] == "off")
        with_same = sum(1 for p in doc["products"] if p[10] and len(p[10]) > 11 and str(p[10][11]).startswith("same:"))
        priced = sum(1 for p in doc["products"] if p[2] is not None)
        entry = {"id": shop, "name": doc["name"], "file": f"{shop}.json", "count": len(doc["products"]), "checkedOn": doc["checkedOn"],
                 "nutrition": with_nutrition, **({"community": with_community} if with_community else {}), **({"sameProduct": with_same} if with_same else {}), "priced": priced, "sha256": hashlib.sha256(text.encode()).hexdigest()}
        if a.only:  # replace this shop's entry where it stands (or add it at the end), leave every other entry as it is
            at = next((i for i, r in enumerate(manifest["retailers"]) if r.get("id") == shop), None)
            if at is None:
                manifest["retailers"].append(entry)
            else:
                manifest["retailers"][at] = entry
        else:
            manifest["retailers"].append(entry)
        print(f"{shop}: {len(doc['products'])} products ({priced} with a price), {len(text) / 1e6:.1f} MB, {sum(1 for p in doc['products'] if p[8])} with the shop's photo, "
              f"{sum(1 for p in doc['products'] if len(p) > 11 and p[11])} with a page address, {sum(1 for p in doc['products'] if p[9])} with a barcode, {with_nutrition} with nutrition ({same.get(shop, 0)} same product at another shop, {community.get(shop, 0)} community, {produce.get(shop, 0)} government produce data), {len(doc['categories'])} categories")
    manifest_path.write_text(json.dumps(manifest, indent=1) + "\n")
    recheck = None if OUT == PUBLISHED_OUT else OUT / "recheck.csv"
    print(f"own labels whose calories don't add up, for a re-read: {write_recheck(docs, recheck)} ({recheck or 'data/groceries/nutrition/recheck.csv'})")
    bc = write_barcodes(docs)
    print(f"barcodes.json: {len(bc['codes'])} barcodes in the shop lists, {len(bc['catalogue']['codes'])} in the catalogue")
    for p in problems[:20]:
        print("problem:", p)
    if len(problems) > 20:
        print(f"... and {len(problems) - 20} more problems")
    return 0


if __name__ == "__main__":
    sys.exit(main())
