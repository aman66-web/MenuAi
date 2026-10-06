#!/usr/bin/env python3
"""Build data/source/ikea/ from IKEA UK's own food pages (ikea.com/gb/en/food/salesareas/...): the Swedish Restaurant,
Bistro, Swedish Cafe, Swedish Bite and Swedish Deli menus. The packaged "Swedish Food Market" items are not published.

    python3 tools/uk_extract/ikea.py --cache /tmp/ikea-cache --checked-on 2026-10-06

The pages are live (no version stamp). Each sales-area listing carries only item ids; each item page carries a
__NEXT_DATA__ JSON with a Nutrients tab (energy kcal/kJ, fat, saturates, carbohydrate, sugars, protein, salt, per 100 g and
per portion, with the portion weight stated). Only the PER-PORTION values (`unitPerServingValue`) are used, copied as
strings exactly as IKEA prints them: nothing is converted, rounded or recomputed, and kJ is not used.

Every page is fetched once and its raw __NEXT_DATA__ JSON is kept in the --cache folder, so re-running (and spot checks)
make no further requests; a missing file is fetched at most one request per second with a normal browser user-agent. A 403,
429 or challenge page stops the script immediately (a block is never worked around). Only names, categories, rankable flags
and the tag word lists below are written by hand (SPEC). The script stops with a clear message if the structure of the pages
changes (check_structure), if the menu gains or loses an item so the published ids no longer match SPEC, if an item's title
changed, or if the set of held-back items differs from EXPECTED_HELDBACK, so a human re-checks before anything is rewritten.

What is left out (each run prints every exclusion with its reason): the packaged Swedish Food Market items (never fetched);
items for Northern Ireland only (the page says "Belfast only" or every Great Britain store is in its excluded-stores list);
items sold in fewer than MIN_GB_STORES Great Britain stores ("selected stores only"); items whose page hides nutrition.
Items whose printed numbers are impossible stay in items.csv but are listed in holdback.csv (see impossible_energy).
The per-portion kJ (energy_kj) and the stated portion weight (weight_g) are copied as printed too.

Allergens come from the same item pages: IKEA prints each item's allergens ("allergens") and what it "may contain traces of"
("allergensTracesOf") by name. The names are mapped with common.allergen_words (an unknown name stops the script). IKEA names
no cereal or nut there, so none is named here. Each item's list is cross-checked with the allergens IKEA marks in bold in the
same item's ingredient statement (BOLD_EXTRA maps IKEA's bold words); if the two printed forms disagree, or IKEA hides an
item's allergens, the script stops so a human decides.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import Counter, OrderedDict
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "ikea"
BASE = "https://www.ikea.com/gb/en/food/salesareas/"
SOURCE_URL = BASE + "restaurant/"
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/130.0.0.0 Safari/537.36")
# Listing order = the order in which an item that is on several menus is attributed to a page (first listing wins).
AREAS = ["restaurant", "bistro", "swedish-cafe", "swedish-bite", "swedish-deli"]
NOT_PUBLISHED_AREAS = {"swedish-food-market"}  # packaged goods sold in the shop, not food served in the restaurants
SOURCE_TITLE = ("IKEA UK food pages: Swedish Restaurant, Bistro, Swedish Cafe, Swedish Bite and Swedish Deli, nutrition per "
                "portion (live pages, accessed {checked_on})")
NOTE = ("Menus differ by store: IKEA lists the stores that do not sell each item, so check what your store has. Items sold only in "
        "Northern Ireland or in just a few stores are left out. Values are per portion, as stated on IKEA's pages.")

# IKEA's own nutrient codes -> our columns (per portion). A code that is in neither dict stops the script (check_structure).
NUTRIENT_CODES = {
    "NUT_NRG_KCAL_EU": "calories", "NUT_PROTEIN_TOT": "protein_g", "NUT_CARB_TOT": "carbs_g", "NUT_FAT_TOT": "fat_g",
    "NUT_FAT_SAT": "sat_fat_g", "NUT_SALT": "salt_g", "NUT_CARB_SUG": "sugar_g",
}
IGNORED_CODES = {"NUT_NRG_KJ_EU"}  # kJ: published as energy_kj (per portion, as printed), never used as calories


# Display categories (IKEA's own category names), in display order.
MAIN, BREAKFAST, HOT, KIDS, SOUP, SALAD, COLD, SAND, SIDE, PASTRY, ADD, COLDDRINK, HOTDRINK = (
    "Main Courses", "Breakfast", "Hot Snacks", "Children's Menu", "Soups", "Salads", "Cold Plates and Starters",
    "Sandwiches and Wraps", "Side Dishes", "Pastries, Desserts and Cookies", "Add-ons", "Cold Beverages", "Hot Beverages")

# One entry per published item: (IKEA item id, the item's title exactly as IKEA's page prints it, our display name, category,
# rankable). IKEA gives many different dishes the same title ("Meatballs", "Hot Beverage"), so the id is the key and the title
# is only a guard: if a page's title no longer matches, the script stops. Drinks, sweet things, sauces, add-ons and
# per-piece extras are not "orders", so rankable is False for them.
SPEC: list[tuple[str, str, str, str, bool]] = [
    ('PRF13766227', 'Fish & Chips', 'Fish & Chips', MAIN, True),
    ('PRF13821230', 'Chicken Schnitzel', 'Chicken Schnitzel', MAIN, True),
    ('PRF13543988', 'Meatballs', '8 Meatballs with Mashed Potatoes', MAIN, True),
    ('PRF13807127', 'Meatballs', '8 Meatballs with Chips', MAIN, True),
    ('PRF13807130', 'Meatballs', '12 Meatballs with Mashed Potatoes', MAIN, True),
    ('PRF13807203', 'Meatballs', '12 Meatballs with Chips', MAIN, True),
    ('PRF13832959', 'Chicken Meatballs', '8 Chicken Meatballs with Mashed Potatoes', MAIN, True),
    ('PRF13832961', 'Chicken Meatballs', '8 Chicken Meatballs with Chips', MAIN, True),
    ('PRF13832940', 'Chicken Meatballs', '8 Chicken Meatballs with Rice & Peshwari Sauce', MAIN, True),
    ('PRF13832960', 'Chicken Meatballs', '12 Chicken Meatballs with Mashed Potatoes', MAIN, True),
    ('PRF13832962', 'Chicken Meatballs', '12 Chicken Meatballs with Chips', MAIN, True),
    ('PRF13832941', 'Chicken Meatballs', '12 Chicken Meatballs with Rice & Peshwari Sauce', MAIN, True),
    ('PRF12139665', 'Plant Balls', '8 Plant Balls with Mashed Potatoes', MAIN, True),
    ('PRF13807209', 'Plant Balls', '8 Plant Balls with Chips', MAIN, True),
    ('PRF13832942', 'Plant balls', '8 Plant Balls with Rice & Peshwari Sauce', MAIN, True),
    ('PRF13807192', 'Plant Balls', '12 Plant Balls with Mashed Potatoes', MAIN, True),
    ('PRF13807211', 'Plant balls', '12 Plant Balls with Chips', MAIN, True),
    ('PRF13832943', 'Plant balls', '12 Plant Balls with Rice & Peshwari Sauce', MAIN, True),
    ('PRF13818309', 'Falafel', 'Falafel with Couscous', MAIN, True),
    ('PRF13839009', 'Salmon Fillet', 'Salmon Fillet', MAIN, True),
    ('PRF13764150', 'Pasta with tomato sauce', 'Pasta with Tomato Sauce', MAIN, True),
    ('PRF13837608', 'Vegetable Lasagne', 'Vegetable Lasagne', MAIN, True),
    ('PRF13803136', 'Rice mix with vegetables', 'Rice Mix with Vegetables', MAIN, True),
    ('PRF13751074', 'Small Cooked Breakfast', 'Small Cooked Breakfast', BREAKFAST, True),
    ('PRF13774547', 'SMALL VEGETARIAN BREAKFAST', 'Small Vegetarian Breakfast', BREAKFAST, True),
    ('PRF13808492', 'Regular Cooked Breakfast', 'Regular Cooked Breakfast', BREAKFAST, True),
    ('PRF13808495', 'Regular Vegetarian Breakfast', 'Regular Vegetarian Breakfast', BREAKFAST, True),
    ('PRF13808496', "Children's breakfast", "Children's Breakfast", BREAKFAST, True),
    ('PRF13808833', 'Breakfast Roll', 'Breakfast Roll with Bacon', BREAKFAST, True),
    ('PRF13808834', 'Breakfast Roll', 'Breakfast Roll with Sausages', BREAKFAST, True),
    ('PRF13808836', 'Breakfast Roll Vegetarian', 'Breakfast Roll (Vegetarian)', BREAKFAST, True),
    ('PRF13784988', 'Toast with butter', 'Toast with Butter', BREAKFAST, True),
    ('PRF12140706', 'Hash Brown', 'Hash Brown', BREAKFAST, False),
    ('PRF12140692', 'Mushrooms', 'Mushrooms', BREAKFAST, False),
    ('PRF12140696', 'Baked Beans', 'Baked Beans', BREAKFAST, False),
    ('PRF12140765', 'Black pudding', 'Black Pudding', BREAKFAST, False),
    ('PRF12140767', 'Potato scone', 'Potato Scone', BREAKFAST, False),
    ('PRF13806452', 'Hot Dog', 'Hot Dog', HOT, True),
    ('PRF13808838', 'Double Hot Dog', 'Double Hot Dog', HOT, True),
    ('PRF13798043', 'Swedish Special', 'Swedish Special Hot Dog', HOT, True),
    ('PRF13757513', 'Veggie hot dog', 'Veggie Hot Dog', HOT, True),
    ('PRF13839064', 'Fish Dog', 'Fish Dog', HOT, True),
    ('PRF13833081', 'Meatballs', '4 Meatballs with Mashed Potatoes', HOT, True),
    ('PRF13833082', 'Plant balls', '4 Plant Balls with Mashed Potatoes', HOT, True),
    ('PRF13789423', 'Pizza', 'Pizza', HOT, True),
    ('PRF12609050', 'Fries', 'Fries', HOT, True),
    ('PRF13751545', "Children's meatballs", "Children's Meatballs", KIDS, True),
    ('PRF13832954', "Children's Chicken Meatballs", "Children's Chicken Meatballs", KIDS, True),
    ('PRF12139676', "Children's plant balls", "Children's Plant Balls", KIDS, True),
    ('PRF13782263', "Children's Fish Finger", "Children's Fish Finger", KIDS, True),
    ('PRF13771286', "Children's Pasta & Tomato Sauce", "Children's Pasta & Tomato Sauce", KIDS, True),
    ('PRF13824697', 'Soup', 'Mushroom Soup', SOUP, True),
    ('PRF13731383', 'Salad Bowl', 'Salad Bowl', SALAD, True),
    ('PRF13821351', 'Pasta Salad', 'Pasta Salad', SALAD, True),
    ('PRF13727879', 'Fruit Salad', 'Fruit Salad', SALAD, True),
    ('PRF13751409', 'Gravadlax Plate', 'Gravadlax Plate', COLD, True),
    ('PRF13782220', 'Tomato & Mozzarella', 'Tomato & Mozzarella', COLD, True),
    ('PRF13760754', 'Marinated Salmon Wrap', 'Marinated Salmon Wrap', SAND, True),
    ('PRF12608909', 'Shrimp & Egg Sandwich', 'Shrimp & Egg Sandwich', SAND, True),
    ('PRF13821248', 'Chips', 'Chips', SIDE, True),
    ('PRF13833084', 'Mashed potatoes', 'Mashed Potatoes (plant based)', SIDE, True),
    ('PRF13821245', 'Cous Cous', 'Cous Cous with Vegetables', SIDE, True),
    ('PRF13837612', 'Vegetable Medallion', 'Vegetable Medallion', SIDE, True),
    ('PRF12140743', 'Cinnamon bun', 'Cinnamon Bun', PASTRY, False),
    ('PRF13837220', 'Chocolate Bun', 'Chocolate Bun', PASTRY, False),
    ('PRF13790543', 'Doughnut', 'Sugar Ring Doughnut', PASTRY, False),
    ('PRF13790499', 'Doughnut', 'Chocolate Ring Doughnut', PASTRY, False),
    ('PRF13789428', 'Muffin', 'Blueberry Muffin', PASTRY, False),
    ('PRF13789429', 'Muffin', 'Chocolate Muffin', PASTRY, False),
    ('PRF13789427', 'Muffin', 'Vanilla Muffin', PASTRY, False),
    ('PRF13821425', 'Croissant', 'Croissant (plant based)', PASTRY, False),
    ('PRF13777804', 'Danish pastry', 'Danish Pastry', PASTRY, False),
    ('PRF13821426', 'Brownie', 'Chocolate Brownie', PASTRY, False),
    ('PRF13750379', 'Daim cake', 'Daim Cake', PASTRY, False),
    ('PRF13761519', 'Gooey chocolate cake', 'Gooey Chocolate Cake', PASTRY, False),
    ('PRF13832927', 'Lemon Almond Cake', 'Lemon Almond Cake', PASTRY, False),
    ('PRF13777803', 'Mazarin', 'Mazarin', PASTRY, False),
    ('PRF13777882', 'Princess Cake', 'Princess Cake', PASTRY, False),
    ('PRF13821431', 'Swedish apple cake', 'Swedish Apple Cake', PASTRY, False),
    ('PRF13777802', 'Apple Pie', 'Apple Pie', PASTRY, False),
    ('PRF13809042', 'Tiramisu', 'Tiramisu', PASTRY, False),
    ('PRF13833126', 'Cheesecake', 'Cheesecake with Berries & Meringue Pieces', PASTRY, False),
    ('PRF12139800', 'Cheesecake', 'Cheesecake with Blueberries & Raspberries', PASTRY, False),
    ('PRF13792438', 'Cheesecake', 'Cheesecake with Strawberries', PASTRY, False),
    ('PRF13751780', 'Ice cream', 'Soft Ice Cream', PASTRY, False),
    ('PRF13836847', 'Ice Cream with KEXCHOKLAD', 'Soft Ice Cream with KEXCHOKLAD', PASTRY, False),
    ('PRF13837613', 'Cinnamon Bun Soft Ice', 'Cinnamon Bun Soft Ice (plant based)', PASTRY, False),
    ('PRF13737804', 'Strawberry soft ice', 'Strawberry Soft Ice (plant based)', PASTRY, False),
    ('PRF13729374', 'Meatballs', '4 Extra Meatballs', ADD, False),
    ('PRF13832945', 'Chicken Meatballs', '4 Extra Chicken Meatballs', ADD, False),
    ('PRF13729370', 'Plant Balls', '4 Extra Plant Balls', ADD, False),
    ('PRF13821142', 'Falafel', '4 Extra Falafel', ADD, False),
    ('PRF13832992', 'Samosa', 'Vegetable Samosa', ADD, False),
    ('PRF13834728', 'Naan Bread', 'Garlic & Coriander Naan Bread', ADD, False),
    ('PRF13782135', 'Bread Roll', 'Bread Roll with Seeds', ADD, False),
    ('PRF13782136', 'Bread Roll', 'Kaiser Bread Roll', ADD, False),
    ('PRF12139802', 'Garlic bread', 'Garlic Bread', ADD, False),
    ('PRF12915761', 'Onion Rings', 'Onion Rings (3)', ADD, False),
    ('PRF12127156', 'Peas', 'Peas', ADD, False),
    ('PRF12140682', 'Butter Portion', 'Butter Portion', ADD, False),
    ('PRF13760847', 'Sunflower Spread Portion', 'Sunflower Spread Portion', ADD, False),
    ('PRF12138611', 'Whipped cream', 'Whipped Cream', ADD, False),
    ('PRF12140741', 'Chocolate flake', 'Chocolate Flake', ADD, False),
    ('PRF13833540', 'Mango Chutney', 'Mango Chutney', ADD, False),
    ('PRF13761922', 'Cream sauce portion & Condiments', 'Cream Sauce Portion & Condiments', ADD, False),
    ('PRF13834870', 'Curry Topping', 'Curry Topping for Hot Dog', ADD, False),
    ('PRF13757452', 'Crispy Onions', 'Crispy Onions (hot dog topping)', ADD, False),
    ('PRF13757453', 'Pickled red cabbage', 'Pickled Red Cabbage (hot dog topping)', ADD, False),
    ('PRF13806669', 'Gherkins', 'Gherkins (hot dog topping)', ADD, False),
    ('PRF13766295', 'LÄSKANDE', 'Läskande Apple Sparkling Drink', COLDDRINK, False),
    ('PRF13766291', 'LÄSKANDE', 'Läskande Blackcurrant Soft Drink', COLDDRINK, False),
    ('PRF13751153', 'LÄSKANDE', 'Läskande Cola Sugar Free Sparkling Drink', COLDDRINK, False),
    ('PRF13766294', 'LÄSKANDE', 'Läskande Lemonade Sparkling Drink', COLDDRINK, False),
    ('PRF13766293', 'LÄSKANDE', 'Läskande Lingonberry Soft Drink', COLDDRINK, False),
    ('PRF13766296', 'LÄSKANDE', 'Läskande Raspberry Sparkling Drink', COLDDRINK, False),
    ('PRF13751756', 'Milkshake', 'Milkshake with Chocolate Syrup', COLDDRINK, False),
    ('PRF12127127', 'Milkshake', 'Milkshake with Strawberry Syrup', COLDDRINK, False),
    ('PRF13751757', 'Milkshake', 'Milkshake with Banana Syrup', COLDDRINK, False),
    ('PRF13758184', 'Hot Beverage', 'Black Coffee', HOTDRINK, False),
    ('PRF13811579', 'Hot Beverage', 'Black Coffee with Oat Milk', HOTDRINK, False),
    ('PRF13764612', 'Hot Beverage', 'Latte', HOTDRINK, False),
    ('PRF13764613', 'Hot Beverage', 'Cappuccino', HOTDRINK, False),
    ('PRF13764614', 'Hot Beverage', 'Espresso', HOTDRINK, False),
    ('PRF13764615', 'Hot Beverage', 'Hot Chocolate', HOTDRINK, False),
    ('PRF13758188', 'Hot Beverage', 'Tea with Milk', HOTDRINK, False),
    ('PRF13811562', 'Hot Beverage', 'Tea with Oat Milk', HOTDRINK, False),
]
SPEC_BY_ID = {row[0]: row for row in SPEC}

# Items whose own printed numbers cannot all be right (see impossible_energy): not published, listed in holdback.csv.
# The script computes the set itself and stops if it differs from this one, so a human re-reads any change.
EXPECTED_HELDBACK = {
    "PRF12139665", "PRF13807192", "PRF12139676", "PRF13832942", "PRF13832943", "PRF13833082",  # plant-ball dishes: kcal below minimum
    "PRF13808833", "PRF13832992",  # bacon roll, samosa: kcal far above what the printed protein/carbs/fat can supply
}

MIN_GB_STORES = 10  # an item sold in fewer Great Britain stores than this is "selected stores only" (the data has a gap: 0-4 or 18-26)
BELFAST_CODE = "113"


class Blocked(Exception):
    pass


class StructureChanged(Exception):
    pass


# ---------------------------------------------------------------------------------------------------------------- fetching

_last_request = [0.0]


def http_get(url: str) -> str:
    """One polite GET: at most 1 request/second, browser user-agent, no tricks. A block stops everything."""
    wait = 1.05 - (time.time() - _last_request[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-GB,en;q=0.9",
                                               "Accept": "text/html,application/xhtml+xml"})
    for attempt in (1, 2):
        try:
            _last_request[0] = time.time()
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as err:
            if err.code in (401, 403, 429, 451):
                raise Blocked(f"{url} answered HTTP {err.code}: IKEA is blocking this connection. Stop; the founder should "
                              "download the item pages from a normal browser instead.") from err
            if err.code >= 500 and attempt == 1:
                time.sleep(5)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 1:
                time.sleep(5)
                continue
            raise
    raise AssertionError("unreachable")


def next_data_text(html: str) -> str:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        raise Blocked("a page came back without its __NEXT_DATA__ JSON (a challenge page or a changed site): stop and look "
                      "at it in a normal browser")
    return m.group(1)


def cached_json(cache: Path, name: str, url: str, offline: bool, stats: Counter) -> dict:
    """The page's __NEXT_DATA__ JSON, from the cache or (once) from the site; the raw text is what is stored."""
    path = cache / name
    if not path.exists():
        if offline:
            raise StructureChanged(f"{name} is not in the cache and --offline was given")
        text = next_data_text(http_get(url))
        path.write_text(text, encoding="utf-8")
        stats["fetched"] += 1
    else:
        stats["from cache"] += 1
    return json.loads(path.read_text(encoding="utf-8"))


def listing_items(cache: Path, area: str, offline: bool, stats: Counter) -> list[dict]:
    data = cached_json(cache, f"listing-{area}.json", f"{BASE}{area}/", offline, stats)
    try:
        page = data["props"]["pageProps"]
        slug = page["salesArea"]["slug"]
        items = [p["item"] for p in page["reducedProducts"]]
    except (KeyError, TypeError) as err:
        raise StructureChanged(f"listing {area}: the page no longer has salesArea/reducedProducts ({err!r})") from err
    if slug != area:
        raise StructureChanged(f"listing {area} reports sales area {slug!r}")
    return items


def item_page(cache: Path, item_id: str, area: str, offline: bool, stats: Counter) -> dict:
    data = cached_json(cache, f"item-{item_id}.json", f"{BASE}{area}/{item_id}/", offline, stats)
    try:
        item = data["props"]["pageProps"]["product"]["item"]
    except (KeyError, TypeError) as err:
        raise StructureChanged(f"item {item_id}: no props.pageProps.product.item ({err!r})") from err
    if item.get("id") != item_id:
        raise StructureChanged(f"item page {item_id} describes {item.get('id')!r}")
    return item


# ---------------------------------------------------------------------------------------------------------------- reading

def check_structure(item: dict) -> None:
    """Stop if an item page no longer looks the way this script expects (a human must re-check the new layout)."""
    for key in ("id", "title", "shortDescription", "servingSizeDisplayValue", "hideNutrient", "nutrients", "excludedStores",
                "salesAreas", "ingredientStatement", "allergens", "allergensTracesOf", "hideAllergen", "hideAllergenTracesOf"):
        if key not in item:
            raise StructureChanged(f"item {item.get('id')}: the page has no {key!r} any more")
    for n in item["nutrients"] or []:
        code = n.get("paramCode")
        if code not in NUTRIENT_CODES and code not in IGNORED_CODES:
            raise StructureChanged(f"item {item['id']}: unknown nutrient code {code!r} ({n.get('description')!r}): decide "
                                   "whether it is a column (NUTRIENT_CODES) or ignored (IGNORED_CODES)")
        text = "kcal" if code == "NUT_NRG_KCAL_EU" else "kJ" if code == "NUT_NRG_KJ_EU" else "g"
        if n.get("unitPerServingText") != text or n.get("unitPerServing") != f"{n.get('unitPerServingValue')} {text}":
            raise StructureChanged(f"item {item['id']}: {code} per-portion value is not '<number> {text}' ({n!r})")
        if not re.fullmatch(r"\d+(\.\d+)?", str(n.get("unitPerServingValue"))):
            raise StructureChanged(f"item {item['id']}: {code} per-portion value {n.get('unitPerServingValue')!r} is not a plain number")
    if not re.fullmatch(r"\d+(\.\d+)? g", str(item["servingSizeDisplayValue"])):
        raise StructureChanged(f"item {item['id']}: portion size {item['servingSizeDisplayValue']!r} is not '<number> g'")


def per_portion(item: dict) -> dict[str, str]:
    """IKEA's per-PORTION values, as the strings it prints (never per 100 g, never recomputed)."""
    got = {n["paramCode"]: n["unitPerServingValue"] for n in item["nutrients"]}
    return {col: got[code] for code, col in NUTRIENT_CODES.items() if code in got} | (
        {"_kj": got["NUT_NRG_KJ_EU"]} if "NUT_NRG_KJ_EU" in got else {})


def impossible_energy(n: dict[str, str], grams: Decimal) -> str | None:
    """Printed energy that the printed protein, carbohydrate and fat (and the portion weight) cannot produce.
    Lowest possible = 4P + 2C + 9F (every gram of carbohydrate counted as fibre, 2 kcal/g, less than any real food).
    Highest possible = 4P + 4C + 9F + 2 kcal for every gram of fibre, and fibre is not printed, so it is allowed up to 10%
    of the portion's weight (more than baked beans); no item here contains alcohol. Outside that range at least one of the
    printed numbers is wrong, and which one cannot be known, so the item is held back rather than corrected."""
    kcal, p, c, f = (Decimal(n[k]) for k in ("calories", "protein_g", "carbs_g", "fat_g"))
    low = 4 * p + 2 * c + 9 * f
    high = 4 * p + 4 * c + 9 * f + 2 * (grams / 10)
    if kcal < low * Decimal("0.98") - 1:
        return (f"IKEA prints {kcal} kcal per portion, but its own protein {p} g, carbohydrate {c} g and fat {f} g need at least "
                f"{low:.0f} kcal, even if all the carbohydrate were fibre")
    if kcal > high + 1:
        return (f"IKEA prints {kcal} kcal per portion, but its own protein {p} g, carbohydrate {c} g and fat {f} g give at most "
                f"{high:.0f} kcal, even with fibre at 10% of the {grams} g portion")
    return None


# IKEA's own spellings of allergen words in bold in its ingredient statements (beyond common.allergen_words). Only words seen
# in IKEA's statements belong here; an unknown bold word stops the script.
BOLD_EXTRA: dict[str, tuple[str, str | None]] = {}


class Contradiction(StructureChanged):
    pass


def item_allergens(item: dict) -> dict:
    """IKEA's printed allergens for the item, cross-checked with the bold words of its ingredient statement."""
    where = f"IKEA item {item['id']} ({item['title']})"
    if item["hideAllergen"] or item["hideAllergenTracesOf"]:
        raise StructureChanged(f"{where}: IKEA hides this item's allergens on its page")
    if any(a.get("isTrace") for a in item["allergens"]) or any(not a.get("isTrace") for a in item["allergensTracesOf"]):
        raise StructureChanged(f"{where}: an allergen and trace list are mixed up ({item['allergens']!r} / {item['allergensTracesOf']!r})")
    contains, cereals, nuts = allergen_words([a["description"] for a in item["allergens"]], where)
    may, _, _ = allergen_words([a["description"] for a in item["allergensTracesOf"]], where)
    bold_words = []
    for b in re.findall(r"<strong>(.*?)</strong>", item["ingredientStatement"] or "", re.S):
        bold_words += [w for w in re.split(r",|\band\b|&", re.sub(r"<[^>]+>", "", b)) if w.strip()]
    bold, _, _ = allergen_words(bold_words, f"{where} (bold in the ingredients)", extra=BOLD_EXTRA)
    if bold != contains:
        raise Contradiction(f"{where}: allergens {sorted(contains)} but the ingredients put {sorted(bold)} in bold")
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


PORK_RE = re.compile(r"\b(pork|bacon|ham|gammon|salami|chorizo|pepperoni)\b", re.I)
BEEF_RE = re.compile(r"\b(beef|steak)\b", re.I)
VEG_TITLE_RE = re.compile(r"\b(vegetarian|vegan)\b", re.I)
MEAT_WORD_RE = re.compile(r"\b(sausages?|bacon|ham|hot ?dogs?|meat ?balls?|haggis|steak|mince[d]?|burgers?|lamb|gammon|salami|pepperoni|"
                          r"chorizo|meat)\b", re.I)
MEAT_STATED_RE = re.compile(r"\b(pork|beef|chicken|turkey|lamb|fish|haddock|salmon|cod|prawns?|shrimps?)\b", re.I)
PLANT_RE = re.compile(r"\b(veggie|vegetable|vegetarian|vegan|plant)\b", re.I)


def clean(text: str | None) -> str:
    return re.sub(r"\s+", " ", re.sub(r"</?[a-z]+>", "", text or "")).strip()


def tags_for(item: dict) -> list[str]:
    """vegetarian only if the item's own title says vegetarian/vegan; pork/beef only if the title or IKEA's ingredient
    statement names pork/bacon/ham/... or beef (beef gelatine and beef casings count: the statement says beef)."""
    statement = clean(item["ingredientStatement"]) + " " + item["title"]
    tags = []
    if VEG_TITLE_RE.search(item["title"]):
        tags.append("vegetarian")
    if PORK_RE.search(statement):
        tags.append("contains_pork")
    if BEEF_RE.search(statement):
        tags.append("contains_beef")
    if "vegetarian" in tags and len(tags) > 1:
        raise StructureChanged(f"item {item['id']} ({item['title']}) is titled vegetarian but its ingredients name meat")
    return tags


def meat_not_stated(item: dict) -> bool:
    """The item names a meat product but IKEA's ingredient statement names no meat species: reported, never guessed."""
    text = item["title"] + " " + clean(item["shortDescription"])
    if re.search(r"\btopping\b", text, re.I):  # "add this topping to any of our hot dogs": a topping, not a meat product
        return False
    return bool(MEAT_WORD_RE.search(text)) and not MEAT_STATED_RE.search(clean(item["ingredientStatement"])) \
        and not PLANT_RE.search(text)


def ascii_slug(name: str) -> str:
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode())


# ---------------------------------------------------------------------------------------------------------------- build

def classify(listed: "OrderedDict[str, dict]", items: dict[str, dict]) -> tuple[dict[str, dict], list[tuple[str, str, str]]]:
    """Split the distinct listed items into published candidates and exclusions [(id, title, reason)]."""
    codes: dict[str, str] = {}
    for rec in listed.values():
        for s in rec["list"]["excludedStores"]:
            codes[s["code"]] = s["name"]
    for it in items.values():
        for s in it["excludedStores"]:
            codes[s["code"]] = s["name"]
    if "Belfast" not in codes.get(BELFAST_CODE, ""):
        raise StructureChanged(f"store code {BELFAST_CODE} is no longer IKEA Belfast ({codes.get(BELFAST_CODE)!r})")
    gb_stores = set(codes) - {BELFAST_CODE}

    keep: dict[str, dict] = {}
    excluded: list[tuple[str, str, str]] = []
    for item_id, it in items.items():
        areas = {a["slug"] for a in it["salesAreas"]}
        if areas & NOT_PUBLISHED_AREAS:
            raise StructureChanged(f"item {item_id} is in a packaged-goods sales area: {sorted(areas)}")
        text = it["title"] + " " + (it["shortDescription"] or "") + " " + (it["longDescription"] or "")
        sold_in = gb_stores - {s["code"] for s in it["excludedStores"]}
        rec = listed[item_id]
        extra = {"gb_stores": len(sold_in), "gb_store_names": sorted(codes[c] for c in sold_in), "of": len(gb_stores),
                 "areas": rec["areas"]}
        it["_x"] = extra
        if it["hideNutrient"] or not it["nutrients"]:
            excluded.append((item_id, it["title"], "nutrition hidden on the page"))
        elif re.search(r"belfast\s+only", text, re.I) or not sold_in:
            excluded.append((item_id, it["title"], "Northern Ireland (Belfast) only, not sold in Great Britain"))
        elif len(sold_in) < MIN_GB_STORES:
            excluded.append((item_id, it["title"], f"selected stores only ({len(sold_in)} of {len(gb_stores)} Great Britain stores: "
                             + ", ".join(extra["gb_store_names"]) + ")"))
        else:
            keep[item_id] = it
    return keep, excluded


def item_notes(it: dict, n: dict[str, str], held: bool) -> str:
    x = it["_x"]
    notes = [f"On IKEA's {', '.join(x['areas'])} menu(s); sold in {x['gb_stores']} of {x['of']} Great Britain stores"]
    kcal, kj = Decimal(n["calories"]), Decimal(n["_kj"])
    if kcal > 0 and not Decimal("4.0") <= kj / kcal <= Decimal("4.35"):
        notes.append(f"printed kJ ({kj}) and kcal ({kcal}) do not agree (kJ/kcal = {kj / kcal:.2f}); kcal is the number used")
    if kcal == 0 and kj > 0:
        notes.append(f"printed as 0 kcal but {kj} kJ")
    p, c, f = (Decimal(n[k]) for k in ("protein_g", "carbs_g", "fat_g"))
    est = 4 * p + 4 * c + 9 * f
    if kcal >= 50 and abs(kcal - est) / kcal > Decimal("0.10"):
        notes.append(f"printed kcal ({kcal}) is {abs(kcal - est) / kcal:.0%} {'above' if kcal > est else 'below'} 4P+4C+9F ({est:.0f})"
                     + ("; held back (see holdback.csv)" if held else "; within what fibre can explain, so published"))
    if it["showPerIngredient"]:
        notes.append("IKEA's page can show a per-ingredient table; the whole-portion values are used")
    if it["id"] == "PRF13761922":
        notes.append("IKEA's portion is the cream sauce plus its free self-serve condiments (curry sauce, mayonnaise, lingonberry "
                     "jam, mustards, ketchup) added together, not one sauce: not suggested as an order")
    return "; ".join(notes)


def build(items_by_id: dict[str, dict], keep: dict[str, dict], checked_on: str, out: Path):
    published_ids, spec_ids = set(keep), set(SPEC_BY_ID)
    if published_ids != spec_ids:
        lines = [f"  NEW  {i}: {keep[i]['title']!r} | {clean(keep[i]['shortDescription'])[:70]!r}" for i in sorted(published_ids - spec_ids)]
        lines += [f"  GONE {i}: {SPEC_BY_ID[i][2]!r}" for i in sorted(spec_ids - published_ids)]
        raise StructureChanged("the menu changed: the published items no longer match SPEC. Add a name/category line for each NEW item "
                               "and delete each GONE one, then run again:\n" + "\n".join(lines))
    rows, holdback, not_stated, unflagged_veg = [], [], [], []
    for item_id, title, name, category, rankable in SPEC:
        it = keep[item_id]
        if it["title"] != title:
            raise StructureChanged(f"item {item_id}: IKEA's title is now {it['title']!r}, SPEC expects {title!r}: re-check the name")
        lead = re.match(r"(\d+) ", name)
        if lead and not re.search(rf"\b{lead.group(1)}\b", clean(it["shortDescription"])):
            raise StructureChanged(f"item {item_id}: name {name!r} says {lead.group(1)} but IKEA's description is {clean(it['shortDescription'])!r}")
        n = per_portion(it)
        for k in ("calories", "protein_g", "carbs_g", "fat_g"):
            if k not in n:
                raise StructureChanged(f"item {item_id} ({name}) has no per-portion {k}")
        tags = tags_for(it)
        if meat_not_stated(it):
            not_stated.append(f"{name} ({item_id})")
        if "vegetarian" not in tags and re.search(r"\bvegetarian\b", clean(it["shortDescription"]), re.I):
            unflagged_veg.append(name)
        item_id_out = ascii_slug(name)
        problem = impossible_energy(n, Decimal(it["servingSizeDisplayValue"].split()[0]))
        if problem:
            holdback.append((item_id, item_id_out, name, problem))
        rows.append({
            "id": item_id_out, "name": name, "category": category, "serving": it["servingSizeDisplayValue"],
            **{k: n.get(k, "") for k in ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "salt_g", "sugar_g")},
            "energy_kj": n.get("_kj", ""), "weight_g": it["servingSizeDisplayValue"].split()[0],
            "allergens": item_allergens(it),
            "tags": "|".join(tags), "rankable": rankable, "notes": item_notes(it, n, bool(problem)),
        })
    if {h[0] for h in holdback} != EXPECTED_HELDBACK:
        raise StructureChanged("the set of items whose printed numbers are impossible changed.\n  now: "
                               + ", ".join(sorted(h[0] for h in holdback)) + "\n  expected: " + ", ".join(sorted(EXPECTED_HELDBACK))
                               + "\nRe-read those pages, then update EXPECTED_HELDBACK.")
    order = {c: i for i, c in enumerate([MAIN, BREAKFAST, HOT, KIDS, SOUP, SALAD, COLD, SAND, SIDE, PASTRY, ADD, COLDDRINK, HOTDRINK])}
    rows.sort(key=lambda r: order[r["category"]])  # stable: keeps SPEC order inside a category
    write_chain_folder(
        chain_id=CHAIN_ID, name="IKEA", cuisine="Swedish", source_title=SOURCE_TITLE.format(checked_on=checked_on),
        source_url=SOURCE_URL, checked_on=checked_on, aliases=["ikea", "ikea restaurant", "ikea swedish restaurant", "ikea bistro",
                                                              "ikea swedish bistro", "ikea cafe", "ikea swedish cafe"],
        items=rows, out=out, note=NOTE, holdback=[(h[1], h[3]) for h in holdback],
        allergen_guide={"title": f"IKEA UK food pages: allergens and traces on each item page (live pages, accessed {checked_on})",
                        "url": SOURCE_URL, "checked_on": checked_on, "may_contain_published": True})
    return rows, holdback, not_stated, unflagged_veg


# ---------------------------------------------------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder for the raw page JSON (fetched once, then reused)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--offline", action="store_true", help="never touch the network: every page must be in the cache")
    ap.add_argument("--fetch-only", action="store_true", help="fill the cache and stop (no CSV written)")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    stats: Counter = Counter()

    try:
        listed: "OrderedDict[str, dict]" = OrderedDict()  # id -> {"area": first listing, "areas": [...], "list": listing item}
        rows_seen = 0
        for area in AREAS:
            for it in listing_items(args.cache, area, args.offline, stats):
                rows_seen += 1
                rec = listed.setdefault(it["id"], {"area": area, "areas": [], "list": it})
                if area not in rec["areas"]:
                    rec["areas"].append(area)
        print(f"listings: {rows_seen} rows, {len(listed)} distinct item ids ({dict(stats)})", file=sys.stderr)
        items: dict[str, dict] = {}
        for n, (item_id, rec) in enumerate(listed.items(), 1):
            items[item_id] = item_page(args.cache, item_id, rec["area"], args.offline, stats)
            check_structure(items[item_id])
            if n % 50 == 0:
                print(f"  {n}/{len(listed)} items ({dict(stats)})", file=sys.stderr)
        print(f"cache complete: {dict(stats)}", file=sys.stderr)
        if args.fetch_only:
            return 0
        market = json.loads((args.cache / "listing-restaurant.json").read_text(encoding="utf-8"))["props"]["pageProps"]["products"]
        packaged = sum(1 for p in market if {a["slug"] for a in p["item"]["salesAreas"]} <= NOT_PUBLISHED_AREAS)
        keep, excluded = classify(listed, items)
        rows, holdback, not_stated, unflagged_veg = build(items, keep, args.checked_on, args.out)
    except (Blocked, StructureChanged) as err:
        print(f"STOPPED: {err}", file=sys.stderr)
        return 1

    by_reason: Counter = Counter()
    for _, _, reason in excluded:
        by_reason[re.sub(r" \(.*", "", reason)] += 1
    digest = hashlib.sha256()
    for p in sorted(args.cache.glob("*.json")):
        digest.update(p.name.encode() + p.read_bytes())
    print(f"listing rows {rows_seen} -> {len(listed)} distinct item ids ({rows_seen - len(listed)} repeats across sales areas); "
          f"{packaged} packaged Swedish Food Market items on the restaurant page are not published (and never fetched)")
    print(f"excluded {len(excluded)}: {dict(by_reason)}")
    for item_id, title, reason in sorted(excluded, key=lambda e: (e[2], e[1])):
        print(f"  EXCLUDED {item_id} {title!r}: {reason}")
    print(f"items.csv: {len(rows)} rows, {len(holdback)} held back, {len(rows) - len(holdback)} published; "
          f"{sum('contains_pork' in r['tags'] for r in rows)} pork, {sum('contains_beef' in r['tags'] for r in rows)} beef, "
          f"{sum('vegetarian' in r['tags'] for r in rows)} vegetarian")
    for _, out_id, name, problem in holdback:
        print(f"  HELD BACK {out_id}: {problem}")
    print(f"meat type not stated ({len(not_stated)}): {not_stated}")
    print(f"description says 'vegetarian' but the title does not, so not tagged: {unflagged_veg}")
    print(f"cache digest (sha256 over the raw page JSON files, name+bytes, sorted): {digest.hexdigest()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
