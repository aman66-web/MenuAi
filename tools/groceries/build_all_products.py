#!/usr/bin/env python3
"""Build the "every product" files for the web app from the store listing crawls (docs/GROCERIES_PLAN.md, founder 2026-10-09).

    python3 tools/groceries/build_all_products.py          # writes web/public/groceries/all/<shop>.json + all-manifest.json

Input: data/groceries/listing/<shop>.csv (tools/groceries/ingest_listing.py): one row per product as the shop's own category pages printed it
(name, price, unit price, card price, categories, photo address). These products have NO barcode and NO nutrition unless the shop's page was read
(data/groceries/discovery/<shop>*.csv or details/): the app shows them as "price only" and links to the shop's own page. Nothing is estimated.

Only shops in PUBLISH are written. Add a shop there only after the founder has seen its terms (see data/groceries/listing/raw/<shop>_terms.txt).
Founder 2026-10-11: Asda, Aldi and Lidl published (their accepted risk where the terms restrict it), then "all the grocery stores, all the items": Tesco,
Waitrose, Morrisons, Iceland and M&S too, each the founder's accepted risk against its terms (docs/IMAGE_TERMS.md). Groceries only: a product whose name
says it isn't food or drink (candles, sparklers, flower bouquets, M&S flower gifts) is left out.
Output per shop (compact, one array per product so 17,000 products stay about 3 MB before compression):
  {"v":1,"retailer","name","checkedOn","pageBase","photoBase","categories":[top-level names],"schemes":[card names],
   "nutritionCheckedOn","products":[[id, name, price|null, unitPrice|null, unit, memberPrice|null, schemeIndex|null, categoryIndex, photoId|"", gtin|"", nutrition|null]]}
`price` is null only for a Lidl product whose own page prints no price (PRICE_IN_STORE: Lidl prices online only its weekly offers; the app says "Price in store").
`nutrition` is [kcal, protein, carbs, fat, saturates|null, sugars|null, fibre|null, salt|null, kJ|null, "g"|"ml", state] per 100 g/ml, state "" or the word the page's own heading adds ("grilled", "cooked bacon", "prepared"), copied from the product's own page by
tools/groceries/t2_sainsburys.py (data/groceries/nutrition/<shop>.csv); a "<0.5" row counts as 0 (docs/DATA.md); null when that page has not been read.
`id` is the shop's own product id (Sainsbury's: its page slug, so the page is pageBase + id). `photoId` is the shop's own picture id: for Sainsbury's the number
in photoBase + id + "/image.jpg"; a shop with "photoTemplate" has it put in place of "{photo}". Shops whose page address isn't pageBase + id carry it as a 12th
element (the path after pageBase, from the shop's own sitemap: tools/groceries/shop_pages.py); "pageSearch": true means pageBase + the product's name is the
shop's own search for it (Asda: its site refuses this environment, so no page addresses).
`gtin` is set only where the shop's own product page was read and showed a barcode (data/groceries/discovery/<shop>-barcodes.csv), so the app can link to the full page.
A product the shop's own listing showed no picture for may carry a 13th element, [source, photo address] (founder 2026-10-11: "every item should have a photo";
"use the EAN number ... find an image of it ... if you can't find it on the supermarket's website"): the same product's photo from another supermarket's own
website (same barcode, or the same branded name and pack size, never a shop's own brand), else the Open Food Facts front photo of that exact barcode
(data/groceries/images/off-front.csv, tools/groceries/fetch_off_images.py). The 12th element is then "" when the row has no page path.
No alcoholic drinks (founder 2026-10-11, build_groceries.is_alcohol) and no advert tiles ("Sponsored", "Occasions").
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_groceries import is_alcohol, name_key, norm_code  # noqa: E402  (shared with the barcode catalogue)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "groceries" / "all"
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
NON_FOOD = re.compile(r"\b(?:candles?|sparklers?|cake toppers?|balloons?|napkins?|paper plates?|bin bags?|kitchen rolls?|toilet rolls?|batter(?:y|ies)|"
                      r"light bulbs?|firelighters|charcoal briquettes|lumpwood charcoal|gift cards?|carrier bags?|bags? for life|"
                      r"(?:cupcake|muffin|cake|baking) cases|filter papers|piping bags?|cake boards?|cocktail sticks|cling film|baking parchment|"
                      r"foil trays?|kitchen foil|tin foil|freezer bags?|food bags?|dog toys?|dog treats?|dog chews?|cat treats?|pet treats?|for dogs|for cats)\b"
                      r"|\b(?:roses?|lil(?:y|ies)|tulips?|chrysanthemums?|carnations?|flowers?|alstroemeria|stems)\b.*\bbouquet\b|\bbouquet\b.*\b(?:roses?|lil(?:y|ies)|tulips?|flowers?|stems)\b"
                      r"|^tesco \w+ bouquet$", re.I)
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
    "marks-and-spencer": {"name": "M&S", "pageBase": "https://www.marksandspencer.com/search?searchTerm=", "pageSearch": True,
                          "photoBase": "https://assets.digitalcontent.marksandspencer.app/image/upload/",
                          "photoTemplate": "https://assets.digitalcontent.marksandspencer.app/image/upload/w_400,q_auto,f_jpg/{photo}",
                          "photo": re.compile(r"^https://assets\.digitalcontent\.marksandspencer\.app/image/upload/w_400,q_auto,f_jpg/([A-Za-z0-9_]{6,80})$")},
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


def read_listing_photos(shop: str, problems: list[str]) -> dict[str, str]:
    """Photos read later from a product's own page for listing rows that had none (founder 2026-10-11: every product should show its shop's own
    photo): data/groceries/images/<shop>-listing.csv, columns product_id,image_url,page_url,checked_on, written by the Chrome run in
    docs/NEXT_GROCERIES_IMAGES_PROMPT.md. Only the shop's own image host, and only when page_url is that product's own page, are accepted."""
    path = ROOT / "data" / "groceries" / "images" / f"{shop}-listing.csv"
    out: dict[str, str] = {}
    if not path.exists():
        return out
    base = PHOTO_BASE.get(shop, "")
    with open(path, newline="", encoding="utf-8") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            pid, url, page = (r.get("product_id") or "").strip(), (r.get("image_url") or "").strip(), (r.get("page_url") or "").strip()
            if not (SLUG.fullmatch(pid) and base and url.startswith(base) and page.rstrip("/").endswith("/" + pid)):
                problems.append(f"{shop}-listing.csv line {line}: not the shop's own photo of that product's page ({pid!r})")
                continue
            out[pid] = url
    return out


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
# "Add all, say 'Price in store'"). Rows from MORE_ROWS (tools/groceries/lidl_range.py, Lidl's own product pages) may therefore have no price: the app
# says "Price in store". Every other shop, and Lidl's own category-page rows, keep "no price printed -> not listed".
PRICE_IN_STORE = {"lidl"}
MORE_ROWS = {"lidl": ROOT / "data" / "groceries" / "listing" / "lidl-range.csv"}


def listing_rows(path: Path, more: Path | None = None):
    """(line, row, from_more) for the shop's listing, then the rows of `more` (MORE_ROWS) whose id the listing doesn't have (the listing row wins: it
    carries the offer and card price)."""
    seen: set[str] = set()
    with open(path, newline="", encoding="utf-8") as f:
        for line, r in enumerate(csv.DictReader(f), start=2):
            seen.add((r.get("product_id") or "").strip())
            yield line, r, False
    if more and more.exists():
        with open(more, newline="", encoding="utf-8") as f:
            for line, r in enumerate(csv.DictReader(f), start=2):
                if (r.get("product_id") or "").strip() not in seen:
                    yield line, r, True


def build_shop(shop: str, problems: list, path: Path | None = None, gtins: dict | None = None, nutrition: dict | None = None,
               pages: dict | None = None, photos: dict | None = None, more: Path | None = None) -> dict | None:
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
    for line, r, from_more in listing_rows(path, more):
        pid, name = (r.get("product_id") or "").strip(), " ".join((r.get("name") or "").split())
        if not SLUG.fullmatch(pid) or len(name) < 2 or name == "?":
            problems.append(f"{shop} line {line}: bad id or name ({pid!r})")
            continue
        price, unit_price = num(r.get("price_gbp")), num(r.get("unit_price_gbp"))
        if price is not None and price <= 0:
            price = None
        if price is None and not (from_more and shop in PRICE_IN_STORE):
            continue  # no price printed (out of stock or a placeholder): not listed
        if from_more and pid not in pages:
            url = (r.get("page_url") or "").strip()
            rest = url[len(SHOPS[shop]["pageBase"]):] if url.startswith(SHOPS[shop]["pageBase"]) else ""
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
        days.add((r.get("checked_on") or "").strip())
        n = nut.get(pid) or nut.get(pid.lower())
        if n:
            nut_days.add(n[1])
        gtin = gt.get(pid.lower(), "")
        if not gtin and shop == "asda" and photo and asda_barcode(photo.group(1)):
            gtin = photo.group(1)  # Asda names its product pictures by barcode: the app links it to the full product page where the catalogue has it
        if not gtin:
            gtin = barcode_by_name(name)  # founder 2026-10-11: the same branded name and pack size as a barcoded product at another shop
        row = [pid, name, price, unit_price if unit_price and unit_price > 0 else None, (r.get("unit") or "").strip(),
               member, schemes.index(scheme) if member is not None else None, cats.index(cat), photo.group(1) if photo else "", gtin,
               n[0] if n else None]
        if pid in pages:
            row.append(pages[pid])
        elif SHOPS[shop].get("pagePath"):
            row.append(SHOPS[shop]["pagePath"].format(id=pid))
        products.append(row)
    days.discard("")
    cfg = SHOPS[shop]
    head = {"v": 1, "retailer": shop, "name": cfg["name"], "checkedOn": min(days) if days else "", "pageBase": cfg["pageBase"], "photoBase": cfg["photoBase"]}
    head.update({k: cfg[k] for k in ("photoTemplate", "pageSearch") if k in cfg})
    return {**head, "categories": cats, "schemes": schemes, "nutritionCheckedOn": min(d for d in nut_days if d) if any(nut_days) else "", "products": products}


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
            if key:
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
            if not hit:
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


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"v": 1, "retailers": []}
    problems: list = []
    docs = {shop: doc for shop in PUBLISH if (doc := build_shop(shop, problems))}
    filled = fill_photos(docs, catalogue_photos(), read_off_images())
    print(f"rows still without any photo whose barcode Open Food Facts may have: {write_wanted_off(docs)} (data/groceries/wanted-images/off.csv)")
    for shop, doc in docs.items():
        c = filled[shop]
        print(f"{shop}: photos from elsewhere for rows the shop showed none: {c['barcode']} by barcode, {c['name']} by name and size, {c['off']} Open Food Facts, {c['none']} still none")
        text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
        (OUT / f"{shop}.json").write_text(text)
        with_nutrition = sum(1 for p in doc["products"] if p[10])
        priced = sum(1 for p in doc["products"] if p[2] is not None)
        manifest["retailers"].append({"id": shop, "name": doc["name"], "file": f"{shop}.json", "count": len(doc["products"]), "checkedOn": doc["checkedOn"],
                                      "nutrition": with_nutrition, "priced": priced, "sha256": hashlib.sha256(text.encode()).hexdigest()})
        print(f"{shop}: {len(doc['products'])} products ({priced} with a price), {len(text) / 1e6:.1f} MB, {sum(1 for p in doc['products'] if p[8])} with the shop's photo, "
              f"{sum(1 for p in doc['products'] if len(p) > 11 and p[11])} with a page address, {sum(1 for p in doc['products'] if p[9])} with a barcode, {with_nutrition} with nutrition, {len(doc['categories'])} categories")
    (OUT / "all-manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    for p in problems[:20]:
        print("problem:", p)
    if len(problems) > 20:
        print(f"... and {len(problems) - 20} more problems")
    return 0


if __name__ == "__main__":
    sys.exit(main())
