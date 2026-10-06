#!/usr/bin/env python3
"""Build data/source/aunties-anne/ from Auntie Anne's UK website menu (https://www.auntieannes.co.uk/menu/).

    python3 tools/uk_extract/aunties_anne.py --fetch /tmp/aa-raw --checked-on 2026-10-06   # download once (1 request/second), then extract
    python3 tools/uk_extract/aunties_anne.py --raw /tmp/aa-raw --checked-on 2026-10-06     # re-extract from the saved pages

Auntie Anne's UK has no nutrition PDF. Every menu item has its own page (/menu/<slug>/, listed in the site's menu sitemap and on
/menu/) with a "Nutrition" tab: kcal, fat, saturates, carbohydrate, fibre, sugars, protein and salt, one value set per item or, for
items with a size / count / recipe selector, one set per option (the page embeds all of them as `variantData`). The pages never
say what the values are "per". What establishes that they are for the item (or selected size) as sold, not per 100 g:
  * values scale with the selected option: 8" vs 14" pizza, one/two/three scoops (exact multiples), 3 vs 6 Stix (exact halves),
    regular vs large drinks; a per-100 g column would not change;
  * for the baked items the fat + carbohydrate + protein + fibre + salt printed would add up to 94-99 g "per 100 g" for the
    pretzels and nuggets, which cannot be right for a bread product that contains water;
  * carbohydrate / fibre / sugars add up like whole items (the bacon bun and sausage bun print the same 44.7 g carbohydrate, the
    pretzel dogs the same 26.7 g, because the bun / dough is the same; the egg and cheese additions change it by 1.0 g).
The page does not give weights, nor how many nuggets or mini dogs are in a portion; `serving` is therefore only filled from the
option label the page itself prints ("8"", "One Scoop", "Regular", "6 Stix").

Numbers are copied exactly as printed (the trailing "g" is the unit and is dropped; salt is salt, in grams, never converted).
Only names, categories, rankable flags, the exclusion list and the held-back list below are typed by hand. The script stops, so a
human re-checks, if the set of menu pages changes, an option label changes, a nutrition label appears that is not known here, the
panel shown on the page disagrees with the embedded data, an excluded page starts printing the numbers, or a published page loses
one.

Page dates: the pages carry none. The menu sitemap's latest lastmod date (it is rewritten for every page at once, e.g. 2026-10-06T10:50)
is quoted in source_title.

Allergens (docs/DATA.md "Allergens"): the same pages have an "Allergens" tab, one set per option like the numbers (variantData[i]
.allergens; the tab shown is the default option's, checked). It prints an icon and a label for each allergen the item contains
("Contains Gluten" / "Gluten"), or the word "None". It prints no "may contain" information and names no cereal or nut. An option
whose allergen data is empty or missing (e.g. two and three scoops of gelato, some dips) has NO allergens published: nothing is
copied from another option or page, so the chain then gets only the guide link (allergen_guide.csv, no allergens.csv) and the
script lists every such item.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "aunties-anne"
BASE = "https://www.auntieannes.co.uk"
SOURCE_URL = BASE + "/menu/"
SOURCE_TITLE = ("Auntie Anne's UK website: menu item pages, Nutrition tab (auntieannes.co.uk/menu/, retrieved {checked_on}; the pages "
                "carry no version date, the menu sitemap was last modified {sitemap_date})")
ALLERGEN_TITLE = "Auntie Anne's UK website: menu item pages, Allergens tab (no date printed)"
ALLERGEN_ICON = re.compile(r'<div><div><img class="aamm-allergen-icon" src="/wp-content/themes/auntie-annes-uk/img/allergens-icons/'
                           r'([A-Za-z]+)\.png" alt="([^"]*)" title="([^"]*)" /></div><div class="aamm-allergen-label">([^<]*)</div></div>')
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

PZ, DG, PI, BB, GE, MS, HD, DP = ("Pretzels, nuggets & stix", "Pretzel dogs", "Pizza", "Breakfast buns", "Gelato", "Milkshakes",
                                  "Hot drinks", "Dips")
CATEGORY_ORDER = [PZ, DG, PI, BB, GE, MS, HD, DP]

# Option labels the pages print -> (name suffix, serving text the page itself gives).
OPT = {
    "": ("", ""),
    '8"': (" (8 inch)", "8 inch"), '14"': (" (14 inch)", "14 inch"),
    "One Scoop": (" (one scoop)", "One scoop"), "Two Scoops": (" (two scoops)", "Two scoops"), "Three Scoops": (" (three scoops)", "Three scoops"),
    "Regular": (" (regular)", "Regular"), "Large": (" (large)", "Large"),
    "6 Stix": (" (6 stix)", "6 stix"), "3 Stix": (" (3 stix)", "3 stix"),
    "Original": (" (original)", ""), "Halal Beef": (" (halal beef)", ""), "Halal Chicken": (" (halal chicken)", ""),
}
SIZES, SCOOPS, DRINK, STIX, DOGS = ('8"', '14"'), ("One Scoop", "Two Scoops", "Three Scoops"), ("Regular", "Large"), ("6 Stix", "3 Stix"), ("Original", "Halal Beef", "Halal Chicken")
NONE = ("",)

# slug -> (display name, category, rankable, expected option labels). Names are the page's own title, tidied ("And" -> "and");
# rankable is false for sweet treats, gelato, milkshakes, hot drinks and dips (as in the KFC / itsu data).
SPEC: dict[str, tuple] = {
    "cheese-jalapeno-pretzel": ("Cheese & Jalapeno Pretzel", PZ, True, NONE),
    "cheese-pepperoni-pretzel": ("Cheese & Pepperoni Pretzel", PZ, True, NONE),
    "original-nuggets": ("Original Nuggets", PZ, True, NONE),
    "pepperoni-nuggets": ("Pepperoni Nuggets", PZ, True, NONE),
    "cheese-stuffed-nuggets": ("Cheese Stuffed Nuggets", PZ, True, NONE),
    "original-stix": ("Original Stix", PZ, True, STIX),
    "cinnamon-nuggets": ("Cinnamon Nuggets", PZ, False, NONE),
    "vanilla-nuggets": ("Vanilla Nuggets", PZ, False, NONE),
    "choco-nuggets": ("Choco Nuggets", PZ, False, NONE),
    "cinnamon-stix": ("Cinnamon Stix", PZ, False, STIX),
    "vanilla-stix": ("Vanilla Stix", PZ, False, STIX),
    "nutella-pull-apart": ("Nutella Pull Apart", PZ, False, NONE),
    "original-pretzel-dog": ("Original Pretzel Dog", DG, True, DOGS),
    "cheese-pretzel-dog": ("Cheese Pretzel Dog", DG, True, DOGS),
    "cheese-jalapeno-pretzel-dog": ("Cheese & Jalapeno Pretzel Dog", DG, True, DOGS),
    "cheese-pepperoni-pretzel-dog": ("Cheese & Pepperoni Pretzel Dog", DG, True, DOGS),
    "mini-pretzel-dogs": ("Mini Pretzel Dogs", DG, True, DOGS),
    "american-hot-pizza": ("American Hot Pizza", PI, True, SIZES),
    "bbq-chicken-pizza": ("BBQ Chicken Pizza", PI, True, SIZES),
    "bbq-meat-feast-pizza": ("BBQ Meat Feast Pizza", PI, True, SIZES),
    "chicken-pizza": ("Chicken Pizza", PI, True, SIZES),
    "farmhouse-pizza": ("Farmhouse Pizza", PI, True, SIZES),
    "hawaiian-pizza": ("Hawaiian Pizza", PI, True, SIZES),
    "margherita-pizza": ("Margherita Pizza", PI, True, SIZES),
    "meat-feast-pizza": ("Meat Feast Pizza", PI, True, SIZES),
    "pepperoni-pizza": ("Pepperoni Pizza", PI, True, SIZES),
    "spicy-chicken-pizza": ("Spicy Chicken Pizza", PI, True, SIZES),
    "vegetarian-pizza": ("Vegetarian Pizza", PI, True, SIZES),
    "american-hot-pizza-bake": ("American Hot Pizza Bake", PI, True, NONE),
    "margherita-pizza-bake": ("Margherita Pizza Bake", PI, True, NONE),
    "pepperoni-pizza-bake": ("Pepperoni Pizza Bake", PI, True, NONE),
    "bacon-bun": ("Bacon Bun", BB, True, NONE),
    "bacon-egg-and-cheese-bun": ("Bacon, Egg and Cheese Bun", BB, True, NONE),
    "egg-and-cheese-bun": ("Egg and Cheese Bun", BB, True, NONE),
    "sausage-bun": ("Sausage Bun", BB, True, NONE),
    "sausage-egg-and-cheese-bun": ("Sausage, Egg and Cheese Bun", BB, True, NONE),
    "the-big-bun": ("The Big Bun", BB, True, NONE),
    "ambassador-gelato-2": ("Ambassador Gelato", GE, False, SCOOPS),
    "banoffee-gelato-2": ("Banoffee Gelato", GE, False, SCOOPS),
    "bubblegum-gelato-2": ("Bubblegum Gelato", GE, False, SCOOPS),
    "cheesecake-passion-fruit-gelato-2": ("Cheesecake Passion Fruit Gelato", GE, False, SCOOPS),
    "cheesecake-strawberry-gelato-2": ("Cheesecake Strawberry Gelato", GE, False, SCOOPS),
    "chocolate-gelato-2": ("Chocolate Gelato", GE, False, SCOOPS),
    "coconut-gelato-2": ("Coconut Gelato", GE, False, SCOOPS),
    "eton-mess-gelato-2": ("Eton Mess Gelato", GE, False, SCOOPS),
    "honeycomb-gelato-2": ("Honeycomb Gelato", GE, False, SCOOPS),
    "mango-sorbet-gelato": ("Mango Sorbet Gelato", GE, False, SCOOPS),
    "mint-choc-chip-gelato-2": ("Mint Choc Chip Gelato", GE, False, SCOOPS),
    "oreo-gelato-2": ("Oreo Gelato", GE, False, SCOOPS),
    "peanutella-gelato-2": ("Peanutella Gelato", GE, False, SCOOPS),
    "raspberry-sorbet-gelato-2": ("Raspberry Sorbet Gelato", GE, False, SCOOPS),
    "salted-caramel-2": ("Salted Caramel Gelato", GE, False, SCOOPS),  # the page's title is just "Salted Caramel" (group: gelato)
    "stracciatella-gelato-2": ("Stracciatella Gelato", GE, False, SCOOPS),
    "strawberry-milkshake-gelato-2": ("Strawberry Milkshake Gelato", GE, False, SCOOPS),
    "tiramisu-gelato-2": ("Tiramisu Gelato", GE, False, SCOOPS),
    "vanilla-gelato-2": ("Vanilla Gelato", GE, False, SCOOPS),
    "white-chocolate-gelato-2": ("White Chocolate Gelato", GE, False, SCOOPS),
    "ambassador-milkshake": ("Ambassador Milkshake", MS, False, DRINK),
    "banoffee-milkshake": ("Banoffee Milkshake", MS, False, DRINK),
    "bubblegum-milkshake": ("Bubblegum Milkshake", MS, False, DRINK),
    "cheesecake-passion-fruit-milkshake": ("Cheesecake Passion Fruit Milkshake", MS, False, DRINK),
    "cheesecake-strawberry-milkshake": ("Cheesecake Strawberry Milkshake", MS, False, DRINK),
    "chocolate-milkshake": ("Chocolate Milkshake", MS, False, DRINK),
    "coconut-milkshake": ("Coconut Milkshake", MS, False, DRINK),
    "dulce-de-leche-milkshake": ("Dulce de Leche Milkshake", MS, False, DRINK),
    "eton-mess-milkshake": ("Eton Mess Milkshake", MS, False, DRINK),
    "honeycomb-milkshake": ("Honeycomb Milkshake", MS, False, DRINK),
    "mango-milkshake": ("Mango Milkshake", MS, False, DRINK),
    "mint-choc-chip-milkshake": ("Mint Choc Chip Milkshake", MS, False, DRINK),
    "oreo-milkshake": ("Oreo Milkshake", MS, False, DRINK),
    "peanutella-milkshake": ("Peanutella Milkshake", MS, False, DRINK),
    "pistachio-milkshake": ("Pistachio Milkshake", MS, False, DRINK),
    "raspberry-sorbet-milkshake": ("Raspberry Sorbet Milkshake", MS, False, DRINK),
    "rum-raisin-milkshake": ("Rum & Raisin Milkshake", MS, False, DRINK),
    "salted-caramel-milkshake": ("Salted Caramel Milkshake", MS, False, DRINK),
    "stracciatella-milkshake": ("Stracciatella Milkshake", MS, False, DRINK),
    "strawberry-milkshake": ("Strawberry Milkshake", MS, False, DRINK),
    "strawberry-sorbet-milkshake": ("Strawberry Sorbet Milkshake", MS, False, NONE),
    "tiramisu-milkshake": ("Tiramisu Milkshake", MS, False, DRINK),
    "vanilla-milkshake": ("Vanilla Milkshake", MS, False, DRINK),
    "white-chocolate-milkshake": ("White Chocolate Milkshake", MS, False, DRINK),
    "cappucino": ("Cappuccino", HD, False, DRINK),
    "hot-chocolate": ("Hot Chocolate", HD, False, DRINK),
    "mocha": ("Mocha", HD, False, DRINK),
    "bbq-dip": ("BBQ Dip", DP, False, NONE),
    "caramel-dip": ("Caramel Dip", DP, False, NONE),
    "chocolate-dip": ("Chocolate Dip", DP, False, NONE),
    "firecracker-dip": ("Firecracker Dip", DP, False, NONE),
    "marinara-dip": ("Marinara Dip", DP, False, NONE),
    "nutella-dip": ("Nutella Dip", DP, False, NONE),
    "sweet-chilli-dip": ("Sweet Chilli Dip", DP, False, NONE),
    "vanilla-dip": ("Vanilla Dip", DP, False, NONE),
    "honey-and-mustard-dip-pot-harrisons": ("Honey and Mustard Dip Pot (Harrisons)", DP, False, NONE),
}
# the pretzel dog whose own name is "Original": its default recipe needs no suffix
NAME_SUFFIX_OVERRIDE = {("original-pretzel-dog", "Original"): ""}

# Pages left out, with the reason (verified on every run: each must still lack a required number, so the script stops if one is
# fixed). Required = calories, fat, carbs, protein; a gap is never filled.
NEEDS = ("kcal", "fat", "carbs", "protein")
NOT_PRINTED: dict[str, str] = {
    "americano": "no nutrition values printed", "cheese-dip": "no nutrition values printed",
    "chocolate-orange-dip": "no nutrition values printed", "coca-cola": "no nutrition values printed",
    "coke-zero": "no nutrition values printed", "diet-coke": "no nutrition values printed", "dr-pepper": "no nutrition values printed",
    "english-breakfast-tea": "no nutrition values printed", "espresso": "no nutrition values printed",
    "fanta-orange": "no nutrition values printed", "flat-white": "no nutrition values printed",
    "mixed-milkshake": "no nutrition values printed", "potato-wedges": "no nutrition values printed",
    "red-bull": "no nutrition values printed", "rum-and-raisin-gelato": "no nutrition values printed",
    "sprite": "no nutrition values printed", "sweet-honey-mustard": "no nutrition values printed",
    "water-sparkling": "only salt and potassium printed, no calories, fat, carbs or protein",
    "water-still": "only salt and potassium printed, no calories, fat, carbs or protein",
    "macphie-nacho-cheese-sauce-bako": "a supplier product page (no calories printed, serving not stated)",
    "dutch-ice-blue-raspberry": "fat and protein not printed", "dutch-ice-mango": "fat and protein not printed",
    "dutch-ice-mixed": "fat and protein not printed", "dutch-ice-sour-apple": "fat and protein not printed",
    "dutch-ice-strawberry": "fat and protein not printed", "dutch-ice-tropical": "fat and protein not printed",
    "lemonade-mixer-regular": "fat not printed", "lemonade-original-regular": "fat not printed",
    "fruit-shoot-apple-blackcurrant": "fat, carbs and protein not printed", "fruit-shoot-orange": "fat and protein not printed",
    "strawberry-sorbet-gelato-2": "fat not printed", "tomato-ketchup-sachet": "fat not printed",
}
# Pages with all four numbers that are still not published as items.
NOT_AN_ITEM: dict[str, str] = {
    "diy-pretzel-kit": "an at-home kit (2,780 kcal): not a ready-to-eat item and the number of pretzels it makes is not stated",
    "create-your-own-pizza": "a pick-your-toppings pizza: the page's values (identical to Margherita) cannot describe the order",
}

# Items the page prints impossibly (reason goes to holdback.csv and the check report). Keys are item ids; nothing is corrected.
HOLDBACK: dict[str, str] = {
    "chocolate-milkshake-regular": "The page prints 31,043 kcal and 1,120 g of fat for one milkshake: not a real value (the other milkshakes print 273-529 kcal).",
    "chocolate-milkshake-large": "The page prints 41,379 kcal and 1,493 g of fat for one milkshake: not a real value (the other milkshakes print 273-529 kcal).",
    "rum-and-raisin-milkshake-regular": "The page prints 83 kcal and 5.9 g sugar for a regular milkshake, about a fifth of every other milkshake (273-529 kcal, 47-60 g sugar): the ice-cream part looks missing.",
    "rum-and-raisin-milkshake-large": "The page prints 99 kcal and 7.1 g sugar for a large milkshake, about a fifth of every other milkshake (350-640 kcal, 62-83 g sugar): the ice-cream part looks missing.",
    "honey-and-mustard-dip-pot-harrisons": "The page prints 43 kcal with 8.7 g of fat (8.7 g of fat alone is about 78 kcal).",
    "sausage-bun": "The page prints 238 kcal, 3.7 g fat, 5.8 g protein: exactly the bun on its own (the Bacon Bun 362 + Egg and Cheese Bun 325 - Bacon, Egg and Cheese Bun 449 = 238 kcal, same fat and protein), so the sausage adds nothing.",
    "sausage-egg-and-cheese-bun": "The page prints the same values as the Egg and Cheese Bun (325 kcal, 10.6 g fat, 10.9 g protein) although the name adds sausage.",
    "cheese-and-pepperoni-pretzel-dog-halal-chicken": "The page prints 3,094 kcal, 200.8 g fat and 134.3 g protein for one pretzel dog, with 3.7 g saturates: not possible (the same dog prints 413 kcal with halal beef).",
    "cheese-pretzel-dog-halal-chicken": "The page prints 80.6 g carbohydrate and 42.4 g protein; the same dough prints 26.6 g carbohydrate and 18.9 g protein in the other two versions of this dog.",
    "cheese-and-jalapeno-pretzel-dog-halal-chicken": "The page prints 80.8 g carbohydrate and 42.4 g protein; the same dough prints 26.7 g carbohydrate and 19.0 g protein in the other two versions of this dog.",
    "original-pretzel-dog-halal-chicken": "The page prints 80.6 g carbohydrate and 40.4 g protein; the same dough prints 26.6 g carbohydrate and 16.9 g protein in the other two versions of this dog.",
    "mini-pretzel-dogs-halal-chicken": "The page prints 5.7 g protein and 4.7 g fat (same protein-to-carbohydrate ratio as the plain nuggets, so dough only) against 19.2 g and 22.7 g with halal beef: the chicken sausage adds nothing.",
    "mini-pretzel-dogs-original": "The page prints 545 kcal but its own protein, carbs, fat and fibre add up to about 644 kcal, and 43.2 g protein / 31.1 g fat against 19.2 g / 22.7 g for the halal beef version.",
}

# Odd values worth a human look (notes are not exported). Nothing here changes a number.
ITEM_NOTES = {
    "farmhouse-pizza-8-inch": "identical to Margherita, Vegetarian and Create Your Own pizza (702 kcal): possibly copied on the page",
    "farmhouse-pizza-14-inch": "identical to Margherita, Vegetarian and Create Your Own pizza (1554 kcal): possibly copied on the page",
    "vegetarian-pizza-8-inch": "identical to Margherita, Farmhouse and Create Your Own pizza (702 kcal): possibly copied on the page",
    "vegetarian-pizza-14-inch": "identical to Margherita, Farmhouse and Create Your Own pizza (1554 kcal): possibly copied on the page",
    "the-big-bun": "identical to the Bacon, Egg and Cheese Bun (449 kcal): contents not stated",
    "mocha-regular": "identical to Hot Chocolate regular", "mocha-large": "identical to Hot Chocolate large",
    "cheese-stuffed-nuggets": "fewer kcal, carbs and protein than Original Nuggets: the number of nuggets per portion is not stated",
    "dulce-de-leche-milkshake-regular": "salt not printed", "dulce-de-leche-milkshake-large": "salt not printed",
    "mango-sorbet-gelato-one-scoop": "fat is 0.1 g and saturates not printed; the page marks it vegan",
}
PIZZA_KCAL_NOTE = "kcal is about 120 kcal (8 inch) / 240 kcal (14 inch) higher than its protein/carbs/fat/fibre add up to, on all three chicken pizzas: protein may be understated on the page"

PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pork|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_UNSTATED = re.compile(r"\b(pretzel dogs?|hot dogs?|meat feast|hawaiian|farmhouse|american hot|big bun)\b", re.I)

KNOWN_LABELS = {
    "Calories KCal": "kcal", "Total Fat": "fat", "Saturated Fat": "sat", "Polyunsaturated Fat": None, "Monounsaturated Fat": None,
    "Trans Fat": None, "Cholesterol": None, "Salt": "salt", "Total Carbohydrate": "carbs", "Dietary Fibre": "fibre", "Sugars": "sugars",
    "Protein": "protein", "Potassium": None, "Vegan": "vegan", "Vegetarian": "vegetarian", "Gluten Free": None,
}
# The page labels cholesterol / mono / poly / trans / potassium in grams and several look shifted (23.3 g "cholesterol" in a pretzel);
# none of them is used, so mono_fat_g / poly_fat_g / trans_fat_g stay blank: every pizza prints "Monounsaturated Fat 0g" (21-73 g
# fat), items from 3.7 to 33 g fat print the same 0.9 / 0.1 / 0.2 g, and two dips print saturates + mono + poly above total fat
# (checked 2026-10-06). The pages print no kJ, weight or caffeine. The labels that are used were cross-checked: kcal = 4P + 4C + 9F + 2 fibre on nearly every row, saturates <= fat,
# sugars <= carbohydrate, and salt values are plausible (0.1-3.3 g); the salt label itself cannot be verified independently.
NUM = re.compile(r"^\d+(?:\.\d+)?$")
# pages whose own title differs from the name used here (tidied or completed): salted-caramel-2 is titled "Salted Caramel"
# (menu group: gelato); the Harrisons dip's title has no brackets.
TITLE_DIFFERS = {"salted-caramel-2", "honey-and-mustard-dip-pot-harrisons"}


def norm(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", title.lower().replace("&", "and"))


def get(url: str, must: bytes, tries: int = 4) -> bytes:
    """One polite request (callers keep 1 per second); a page lacking `must`, or a transient failure, is retried after a pause."""
    last: Exception | None = None
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if must not in data:
                raise urllib.error.URLError(f"{url} did not contain {must!r}")
            return data
        except (urllib.error.URLError, OSError) as e:
            last = e
            time.sleep(3 * (n + 1))
    raise SystemExit(f"Could not fetch {url}: {last}")


def sitemap_slugs(text: str) -> list[str]:
    return [u.rstrip("/").rsplit("/", 1)[1] for u in re.findall(r"<loc>([^<]+)</loc>", text) if re.search(r"/menu/[^/]+/?$", u)]


def list_page_slugs(text: str) -> list[str]:
    found: list[str] = []
    for s in re.findall(r'href="https://www\.auntieannes\.co\.uk/menu/([^"#?/]+)/"', text):
        if s not in ("page", "feed") and s not in found:
            found.append(s)
    return found


def fetch_all(raw: Path) -> None:
    """Download the menu sitemap, the menu list page and every item page once (a saved, valid page is not fetched again)."""
    (raw / "items").mkdir(parents=True, exist_ok=True)
    sm = get(BASE + "/menu-sitemap.xml", b"<urlset")
    (raw / "menu-sitemap.xml").write_bytes(sm)
    time.sleep(1.0)
    (raw / "menu.html").write_bytes(get(SOURCE_URL, b"menu_group"))
    for s in sitemap_slugs(sm.decode("utf-8", "replace")):
        dest = raw / "items" / f"{s}.html"
        if dest.exists() and b"aamm-tab-nutrition-C" in dest.read_bytes():
            continue
        time.sleep(1.0)
        dest.write_bytes(get(f"{BASE}/menu/{s}/", b"aamm-tab-nutrition-C"))


def read_allergens(panel, where: str) -> dict | None:
    """One option's Allergens tab -> {contains, may_contain, cereals, nuts}, or None when nothing is published for it (missing,
    empty). "None" printed = contains none of the 14. Each icon's alt/title must say "Contains <label>"; any other text stops."""
    if not isinstance(panel, str) or not panel.strip():
        return None
    if panel.strip() == "None":
        return {"contains": set(), "may_contain": set(), "cereals": set(), "nuts": set()}
    icons = ALLERGEN_ICON.findall(panel)
    rest = ALLERGEN_ICON.sub("", panel).strip()
    if rest or not icons:
        raise SystemExit(f"{where}: unexpected text in the Allergens tab: {rest[:200] or panel[:200]!r}")
    for icon, alt, title, label in icons:
        if alt != f"Contains {label}" or title != alt or re.sub(r"\s", "", label).lower() != icon.lower():
            raise SystemExit(f"{where}: allergen icon {icon!r} / {alt!r} / {title!r} does not match its label {label!r}")
    contains, cereals, nuts = allergen_words([html.unescape(lbl) for *_, lbl in icons], where)
    return {"contains": contains, "may_contain": set(), "cereals": cereals, "nuts": nuts}


def read_page(text: str, slug_: str) -> dict:
    """-> {title, group, options: [(label, is_default, printed dict, flags set, allergens dict or None)]}. Raises SystemExit on
    anything unexpected."""
    t = re.search(r'<h1 class="entry-title">(.*?)</h1>', text, re.S)
    g = re.search(r"hentry menu_group-([a-z\-]+)", text)
    if not t:
        raise SystemExit(f"{slug_}: no title found: re-check the page layout.")
    panel_at = text.find('id="aamm-tab-nutrition-C"')
    if panel_at < 0:
        raise SystemExit(f"{slug_}: no nutrition tab found: re-check the page layout.")
    panel = text[panel_at:text.find("<!-- .entry-content -->", panel_at)]
    m = re.search(r"var variantData = (\[.*?\]);\s*\n", text, re.S)
    a_at = text.find('id="aamm-tab-allergens-C"')
    a_panel = text[text.find(">", a_at) + 1:text.find('<div class="aamm-tab-container" id="aamm-tab-nutrition-C"', a_at)] if a_at >= 0 else None
    if a_panel is not None:
        a_panel = re.sub(r"</div>\s*$", "", a_panel.strip())
    raw_options = []
    if m:
        for v in json.loads(m.group(1)):
            raw_options.append((v.get("label", ""), bool(v.get("isDefault")), v.get("nutrition") or "", v.get("allergens")))
    else:
        raw_options.append(("", True, panel, a_panel))
    options = []
    for label, is_default, nut, alg in raw_options:
        printed: dict[str, str] = {}
        flags: set[str] = set()
        pairs = re.findall(r'aamm-nutrition-value">([^<]*)</div><div class="aamm-nutrition-label">([^<]*)<', nut)
        seen = set()
        for value, lab in pairs:
            lab = html.unescape(lab).strip()
            if lab not in KNOWN_LABELS:
                raise SystemExit(f"{slug_}: unknown nutrition label {lab!r}: add it to KNOWN_LABELS only after reading what it means.")
            if lab in seen:
                raise SystemExit(f"{slug_} ({label}): label {lab!r} appears twice.")
            seen.add(lab)
            key = KNOWN_LABELS[lab]
            value = html.unescape(value).strip()
            if key in ("vegan", "vegetarian"):
                if value != "Yes":
                    raise SystemExit(f"{slug_}: {lab} is printed as {value!r}, expected 'Yes'.")
                flags.add(key)
            elif key:
                number = value[:-1] if (key != "kcal" and value.endswith("g")) else value
                if not NUM.match(number):
                    raise SystemExit(f"{slug_} ({label}): {lab} is printed as {value!r}, not a number.")
                printed[key] = number
        options.append((label, is_default, printed, flags, read_allergens(alg, f"{slug_} ({label or 'single'})")))
    # the panel shown on the page must be the default option's data
    shown = dict((KNOWN_LABELS[html.unescape(lab).strip()], v) for v, lab in re.findall(
        r'aamm-nutrition-value">([^<]*)</div><div class="aamm-nutrition-label">([^<]*)<', panel) if KNOWN_LABELS.get(html.unescape(lab).strip()))
    default = next(o for o in options if o[1])
    for k, v in default[2].items():
        if shown.get(k) not in (v, v + "g"):
            raise SystemExit(f"{slug_}: the panel shows {k}={shown.get(k)!r} but the page's own option data says {v!r}.")
    if m and read_allergens(a_panel, f"{slug_} (allergens tab)") != default[4]:
        raise SystemExit(f"{slug_}: the Allergens tab shown disagrees with the page's own data for the default option.")
    return {"title": html.unescape(t.group(1)).strip(), "group": g.group(1) if g else "", "options": options}


def main() -> int:
    ap = argparse.ArgumentParser()
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--fetch", type=Path, metavar="DIR", help="download the sitemap, menu page and item pages once into DIR, then extract")
    grp.add_argument("--raw", type=Path, metavar="DIR", help="extract from pages already saved in DIR")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    raw = args.fetch or args.raw
    if args.fetch:
        fetch_all(raw)
    for need in ("menu-sitemap.xml", "menu.html"):
        if not (raw / need).exists():
            raise SystemExit(f"{raw / need} is missing: run with --fetch first.")

    site = sitemap_slugs((raw / "menu-sitemap.xml").read_text(encoding="utf-8", errors="replace"))
    listed = list_page_slugs((raw / "menu.html").read_text(encoding="utf-8", errors="replace"))
    known = set(SPEC) | set(NOT_PRINTED) | set(NOT_AN_ITEM)
    if len(set(site)) != len(site) or set(site) != set(listed):
        print(f"The sitemap ({len(site)} pages) and the menu page ({len(listed)} pages) disagree: "
              f"{sorted(set(site) ^ set(listed))}. Re-check the source.", file=sys.stderr)
        return 1
    if set(site) != known:
        print(f"The menu's pages changed (expected {len(known)}, found {len(site)}).\n  new: {sorted(set(site) - known)}\n"
              f"  gone: {sorted(known - set(site))}\nReview the new pages (category, rankable, exclusion) and update SPEC / NOT_PRINTED "
              "before running again.", file=sys.stderr)
        return 1
    overlap = (set(SPEC) & set(NOT_PRINTED)) | (set(SPEC) & set(NOT_AN_ITEM)) | (set(NOT_PRINTED) & set(NOT_AN_ITEM))
    if overlap:
        raise SystemExit(f"Pages listed twice in the script's tables: {sorted(overlap)}")

    items: list[dict] = []
    excluded: list[tuple[str, str]] = []
    meat_log: list[str] = []
    seen_ids: dict[str, str] = {}
    sums = [("menu-sitemap.xml", hashlib.sha256((raw / "menu-sitemap.xml").read_bytes()).hexdigest()),
            ("menu.html", hashlib.sha256((raw / "menu.html").read_bytes()).hexdigest())]
    for s in sorted(site):
        f = raw / "items" / f"{s}.html"
        if not f.exists():
            raise SystemExit(f"{f} is missing: run with --fetch.")
        sums.append((f"items/{s}.html", hashlib.sha256(f.read_bytes()).hexdigest()))
    for s in site:
        page = read_page((raw / "items" / f"{s}.html").read_text(encoding="utf-8", errors="replace"), s)
        if s in NOT_PRINTED or s in NOT_AN_ITEM:
            if s in NOT_PRINTED:
                if all(all(k in o[2] for k in NEEDS) for o in page["options"]):
                    raise SystemExit(f"{s} now prints every required number: review it and remove it from NOT_PRINTED.")
                excluded.append((page["title"], NOT_PRINTED[s]))
            else:
                if not all(all(k in o[2] for k in NEEDS) for o in page["options"]):
                    raise SystemExit(f"{s} no longer prints every required number: move it to NOT_PRINTED.")
                excluded.append((page["title"], NOT_AN_ITEM[s]))
            continue
        name, category, rankable, expected = SPEC[s]
        labels = tuple(o[0] for o in page["options"])
        if labels != expected:
            raise SystemExit(f"{s}: the page's options are {labels} but the script expects {expected}: re-check.")
        if norm(page["title"]) != norm(name) and s not in TITLE_DIFFERS:
            raise SystemExit(f"{s}: the page title is {page['title']!r} but the script names it {name!r}: re-check.")
        for label, _is_default, printed, flags, allergens in page["options"]:
            missing = [k for k in NEEDS if k not in printed]
            if missing:
                raise SystemExit(f"{s} ({label or 'single'}): required number(s) not printed: {missing}. Move it to NOT_PRINTED.")
            suffix, serving = OPT[label]
            suffix = NAME_SUFFIX_OVERRIDE.get((s, label), suffix)
            full_name = name + suffix
            item_id = slug(full_name)
            if item_id in seen_ids:
                raise SystemExit(f"Two items get the id {item_id!r} ({seen_ids[item_id]} and {s}).")
            seen_ids[item_id] = s
            halal = label.startswith("Halal")
            tag_text = f"{name} {label}"
            tags = []
            if "vegetarian" in flags or "vegan" in flags or re.search(r"\bvegetarian\b", name, re.I):
                tags.append("vegetarian")
            else:
                if PORK.search(tag_text) and not halal:  # a halal version is not tagged pork even when the name says pepperoni
                    tags.append("contains_pork")
                if BEEF.search(tag_text):
                    tags.append("contains_beef")
            if item_id not in HOLDBACK and ((not tags and not halal and MEAT_UNSTATED.search(full_name)) or (halal and PORK.search(name))):
                meat_log.append(full_name)
            notes = []
            calc = 4 * float(printed["protein"]) + 4 * float(printed["carbs"]) + 9 * float(printed["fat"]) + 2 * float(printed.get("fibre") or 0)
            kcal = float(printed["kcal"])
            if item_id in HOLDBACK:
                notes.append("held back: see holdback.csv")
            elif kcal and abs(calc - kcal) / kcal > 0.10:
                notes.append(f"printed {printed['kcal']} kcal but its own protein/carbs/fat/fibre add up to about {calc:.0f} kcal")
            if item_id in ITEM_NOTES:
                notes.append(ITEM_NOTES[item_id])
            if s in ("bbq-chicken-pizza", "chicken-pizza", "spicy-chicken-pizza") and not any("add up" in n for n in notes):
                notes.append(PIZZA_KCAL_NOTE)
            items.append({
                "id": item_id, "name": full_name, "category": category, "serving": serving,
                "calories": printed["kcal"], "protein_g": printed["protein"], "carbs_g": printed["carbs"], "fat_g": printed["fat"],
                "sat_fat_g": printed.get("sat", ""), "sodium_mg": "", "salt_g": printed.get("salt", ""), "sugar_g": printed.get("sugars", ""),
                "fiber_g": printed.get("fibre", ""), "tags": "|".join(tags), "limited_time": False, "rankable": rankable,
                "notes": "; ".join(notes), "allergens": allergens,
            })
    ids = [i["id"] for i in items]
    stale = [h for h in HOLDBACK if h not in ids]
    if stale:
        raise SystemExit(f"HOLDBACK names items that are not in the menu any more: {stale}")
    # identical value sets on different pages (possible copy-and-paste on the site): listed so a human sees them
    twins: dict[tuple, list[str]] = {}
    for i in items:
        twins.setdefault(tuple(i[k] for k in ("serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "salt_g", "sugar_g", "fiber_g")),
                         []).append(i["id"])
    twin_groups = [v for v in twins.values() if len(v) > 1]
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    note = ("Values are for the item or size each page shows (pizza 8 or 14 inch, one to three scoops, regular or large). The pages give no weights "
            "and don't say how many nuggets or mini dogs are in a portion, nor which milk is used. Some items print identical values "
            "(e.g. Margherita, Farmhouse and Vegetarian pizza).")
    lastmods = re.findall(r"<lastmod>(\d{4}-\d\d-\d\d)T", (raw / "menu-sitemap.xml").read_text(encoding="utf-8", errors="replace"))
    if not lastmods:
        raise SystemExit("The menu sitemap carries no lastmod dates: re-check how source_title dates the pages.")
    no_allergens = [i["name"] for i in items if i["allergens"] is None]
    write_chain_folder(
        chain_id=CHAIN_ID, name="Auntie Anne's", cuisine="Bakery",
        source_title=SOURCE_TITLE.format(checked_on=args.checked_on, sitemap_date=max(lastmods)),
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["auntie annes", "auntie anne's", "auntie annes pretzels"],
        items=items, out=args.out, note=note, holdback=[(i, HOLDBACK[i]) for i in ids if i in HOLDBACK],
        allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": False})
    combined = hashlib.sha256("".join(f"{h}  {n}\n" for n, h in sums).encode()).hexdigest()
    (raw / "SHA256SUMS").write_text("".join(f"{h}  {n}\n" for n, h in sums), encoding="utf-8")
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back, {len(excluded)} pages left out) to {args.out}; combined SHA-256 of the "
          f"{len(site)} item pages, the sitemap and the menu page: {combined}")
    print("Pages left out:")
    for n, why in excluded:
        print(f"  {n}: {why}")
    print("Identical value sets on different items:", "; ".join(", ".join(g) for g in twin_groups))
    print("Meat type not stated:", "; ".join(meat_log))
    if no_allergens:
        print(f"Allergens: INCOMPLETE, guide link only (no allergens.csv). {len(no_allergens)} of {len(items)} items have no allergens "
              f"published for their option: {'; '.join(no_allergens)}")
    else:
        print(f"Allergens: all {len(items)} items have them (allergens.csv written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
