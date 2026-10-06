#!/usr/bin/env python3
"""Build data/source/birds-bakery/ from Birds Bakery's own "Nutrition and allergen data" pages.

    python3 tools/uk_extract/birds_bakery.py --cache DIR --fetch --checked-on 2026-10-06   # download, then build
    python3 tools/uk_extract/birds_bakery.py --cache DIR --checked-on 2026-10-06            # rebuild from saved pages
    add --out DIR to write somewhere other than data/source/birds-bakery (e.g. a scratch tree)

Source: https://birdsbakery.com/pages/nutrition-and-allergen-data (Birds (Derby) Ltd). The index is built in the browser from a
public Shopify Storefront feed that the page's own script (nutrition-and-allergen-data.js) loads; that is the list of items
used here (the access token is read from that script, not kept in this file). Each item has its own server-rendered page,
/pages/nutrition-and-allergen-data/<handle>, with ONE table headed "Typical values | Per <basis>" and kJ, kcal, fat,
saturates, carbohydrate, sugars, fibre, protein, salt. No date or version is printed on the pages (footer: (c) 2026).
The printed kJ goes to energy_kj (as printed, also where it disagrees with the kcal: the row's notes say so), and a basis that
states a weight ("Per 77g", "Per Slice (75g)") to weight_g. The pages print no mono/poly/trans fat or caffeine.

The basis varies by item: "Per Product", "Per roll", "Per Portion", "Per 77g" ... or "Per 100g". Only rows that are per ITEM
(or a stated weight) are published. "Per 100g" rows are left out (a per-100g value is never converted), and so is "Per 80"
(no unit). Numbers are copied exactly as printed (kJ is not used); the table is checked cell by cell, so a changed layout stops
the script. Only names, categories, rankable and the groupings below are typed by hand.

The script STOPS (listing the differences) if the site's item list, an item's name or an item's basis no longer matches the
tables below, so a human re-checks before anything is published. Politeness: one request per second.

Allergens (docs/DATA.md "Allergens"), from the same item pages: an "Allergens" section printing one line of the 14 allergens
the item contains ("Eggs, Gluten, Milk, Soya"), and in the Ingredients section a sentence "May contain traces of Oats, Rye,
... & Nuts (Almonds, Pistachios, Peanuts)." Contains = the Allergens line only, which every used page prints. The ingredients
are not read for allergens: most pages bold or capitalise some words without saying what that means (only ten say "for allergens
see ingredients in BOLD and CAPITALS"; on those the capitals named the same allergens as the Allergens line on 2026-10-06). The
Allergens line only says "Gluten" / "Nuts", so no cereal or nut is named. May contain = the sentence(s), word by word (a cereal
there counts as gluten; words that are not one of the 14 are listed in NOT_ALLERGENS). A page without an Allergens section gives
the item no allergens (none and missing cannot be told apart), so the chain falls back to the guide link only. A repeat page
(DUPLICATES) that prints different allergens from the page kept is reported and its allergens are added to the item's.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "birds-bakery"
SITE = "https://birdsbakery.com"
INDEX_URL = f"{SITE}/pages/nutrition-and-allergen-data"
GRAPHQL_URL = f"{SITE}/api/2023-07/graphql.json"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

RS, CB, SV, SB, PS, CK, CH = ("Rolls & sandwiches", "Cobs", "Savouries & bakes", "Salad bowls", "Pots & snacks",
                              "Cakes & pastries", "Chocolate")

# --- items that are published: (handle, name shown, category, rankable, basis the page must print) -------------------------
# Handles are the site's own page names. The name must match the site's name apart from capitalisation and stray spaces.
# rankable=false: cakes, pastries, chocolate and bite-sized pieces. Categories are our own grouping (the site's "Platters"
# group repeats items listed elsewhere, so those rows are filed with what they are).
INCLUDE: list[tuple[str, str, str, bool, str]] = [
    ("cheese-salad-filled-roll-white", "Cheese salad filled roll (white)", RS, True, "Per roll"),
    ("egg-mayo-filled-roll-white", "Egg mayo filled roll (white)", RS, True, "Per roll"),
    ("ham-cheese-filled-roll-white", "Ham & cheese filled roll (white)", RS, True, "Per Product"),
    ("ham-salad-filled-roll-white", "Ham salad filled roll (white)", RS, True, "Per roll"),
    ("tuna-mayo-cucumber-filled-roll-white", "Tuna mayo & cucumber filled roll (white)", RS, True, "Per roll"),
    ("blt-chia-roll", "BLT chia roll", RS, True, "Per roll"),
    ("chicken-caesar-chia-roll", "Chicken Caesar chia roll", RS, True, "Per roll"),
    ("mixed-cheese-onion-sandwich-with-jalapeno-relish-on-chia-bread",
     "Mixed cheese & onion sandwich with jalapeno relish on chia bread", RS, True, "Per roll"),
    ("cheese-tomato-chia-sandwich", "Cheese & tomato chia sandwich", RS, True, "Per roll"),
    ("chicken-mayo-bacon-chia-sandwich", "Chicken mayo & bacon chia sandwich", RS, True, "Per portion"),
    ("egg-mayo-chia-sandwich", "Egg mayo chia sandwich", RS, True, "Per roll"),
    ("ham-and-cheese-chia-sandwich", "Ham & cheese chia sandwich", RS, True, "Per 186g"),
    ("mixed-cheese-onion-chia-sandwich", "Mixed cheese & onion chia sandwich", RS, True, "Per roll"),
    ("prawn-mayo-chia-sandwich", "Prawn mayo chia sandwich", RS, True, "Per roll"),
    ("tuna-mayo-cucumber-chia-sandwich", "Tuna mayo & cucumber chia sandwich", RS, True, "Per Product"),
    ("cheese-little-bites", "Cheese little bites", RS, False, "Per Roll"),
    ("egg-mayo-little-bites", "Egg mayo little bites", RS, False, "Per roll"),
    ("ham-little-bites", "Ham little bites", RS, False, "Per Product"),
    ("tuna-mayo-little-bites", "Tuna mayo little bites", RS, False, "Per Product"),
    # cobs
    ("bacon-cob-white", "Bacon cob (white)", CB, True, "Per Product"),
    ("sausage-cob-white", "Sausage cob (white)", CB, True, "Per Product"),
    ("roast-pork-cob-white", "Roast pork cob (white)", CB, True, "Per Portion"),
    ("sausage-bacon-cob-white", "Sausage & bacon cob (white)", CB, True, "Per Product"),
    ("egg-cob-white", "Egg cob (white)", CB, True, "Per Product"),
    ("sausage-egg-cob-white", "Sausage & egg cob (white)", CB, True, "Per Product"),
    ("hash-brown-cob-white", "Hash brown cob (white)", CB, True, "Per Product"),
    ("bacon-egg-cob-white", "Bacon & egg cob (white)", CB, True, "Per Product"),
    ("roast-turkey-cob-white", "Roast turkey cob (white)", CB, True, "Per Product"),
    ("bacon-cob-chia", "Bacon cob (chia)", CB, True, "Per Product"),
    ("sausage-cob-chia", "Sausage cob (chia)", CB, True, "Per Product"),
    ("roast-pork-cob-chia", "Roast pork cob (chia)", CB, True, "Per Product"),
    ("sausage-bacon-cob-chia", "Sausage & bacon cob (chia)", CB, True, "Per Product"),
    ("copy-of-egg-cob-chia-1", "Egg cob (chia)", CB, True, "Per Product"),
    ("sausage-egg-cob-chia", "Sausage & egg cob (chia)", CB, True, "Per Product"),
    ("hash-brown-cob-chia", "Hash brown cob (chia)", CB, True, "Per Product"),
    ("bacon-egg-cob-chia", "Bacon & egg cob (chia)", CB, True, "Per Product"),
    ("roast-turkey-cob-chia", "Roast turkey cob (chia)", CB, True, "Per Product"),
    # savouries and bakes
    ("sausage-rolls", "Sausage roll", SV, True, "Per 77g"),
    ("traditional-pasty", "Traditional pasty", SV, True, "Per roll"),
    ("lamb-mint-slice", "Lamb & mint slice", SV, True, "Per roll"),
    ("chicken-ham-leek-slice", "Chicken, ham & leek slice", SV, True, "Per Portion"),
    ("cheese-onion-roll-xl", "Cheese & onion roll XL", SV, True, "Per serving"),
    ("small-pork-pies", "Small pork pie", SV, True, "Per Product"),
    ("quiche-lorraine", "Quiche lorraine", SV, True, "Per Product"),
    ("cheese-pizza", "Cheese pizza", SV, True, "Per Product"),
    ("cheese-straws", "Cheese straws", SV, False, "Per Product"),
    # salad bowls, pots
    ("chicken-caesar-salad-bowl", "Chicken Caesar salad bowl", SB, True, "Per Product"),
    ("mixed-cheese-onion-salad-with-jalapeno-relish", "Mixed cheese & onion salad with jalapeno relish", SB, True, "Per Product"),
    ("apple-blackcurrant-overnight-oats", "Apple & blackcurrant overnight oats", PS, True, "Per Product"),
    ("egg-pot", "Egg pot", PS, True, "Per Product"),
    # cakes and pastries
    ("apple-and-blackcurrant-crumble", "Apple & blackcurrant crumble", CK, False, "Per Product"),
    ("swiss-tart", "Swiss tart", CK, False, "Per Product"),
    ("baby-elephants-foot", "Baby elephants foot", CK, False, "Per portion"),
    ("blackcurrant-cream", "Blackcurrant cream", CK, False, "Per portion"),
    ("caramel-doughnut", "Caramel doughnut", CK, False, "Per Product"),
    ("salted-caramel-doughnut", "Salted caramel doughnut", CK, False, "Per Product"),
    ("lemon-crumble-ring-doughnut", "Lemon crumble ring doughnut", CK, False, "Per Product"),
    ("cream-swiss-bun", "Cream swiss bun", CK, False, "Per Product"),
    ("cinnamon-bun", "Cinnamon bun", CK, False, "Per Product"),
    ("chocolate-twist", "Chocolate twist", CK, False, "Per Per Twist"),
    ("apple-crumble-danish", "Apple crumble danish", CK, False, "Per Product"),
    ("pink-elephants-foot-1", "Pink elephants foot", CK, False, "Per Product"),
    ("strawberry-weekend-special", "Strawberry weekend special", CK, False, "Per Product"),
    ("mini-strawberry-sponge", "Mini strawberry sponge", CK, False, "Per Portion"),
    ("summer-cupcake", "Summer cupcake", CK, False, "Per portion"),
    ("chocolate-nest-cupcake", "Chocolate nest cupcake", CK, False, "Per Product"),
    ("paw-cupcake", "Paw cupcake", CK, False, "Per Per Cupcake"),
    ("large-honeycomb-brownie", "Honeycomb brownie slice", CK, False, "Per Portion"),
    ("cookie-cream-brownie", "Cookie & cream brownie", CK, False, "Per Portion"),
    ("apricot-pumpkin-seed-flapjack", "Apricot & pumpkin seed flapjack", CK, False, "Per Portion"),
    ("mrs-bs-rocky-road-tray", "Mrs B's rocky road tray", CK, False, "Per Slice (75g)"),
    ("mince-pie-1", "Mince pie", CK, False, "Per Product"),
    ("summer-gingerbread-person", "Summer gingerbread person", CK, False, "Per Product"),
    ("birds-gingerbread-person", "Birds gingerbread person", CK, False, "Per Portion"),
    # chocolate
    ("chocolate-mouse", "Milk chocolate mouse", CH, False, "Per Product"),
    ("birds-chocolate-lolly", "Birds chocolate lolly", CH, False, "Per Product"),
    ("boy-girl-football-lolly", "Boy/girl football lolly", CH, False, "Per Product"),
    ("canine-partners-chunky-lolly", "Canine Partners chunky lolly", CH, False, "Per product"),
    ("small-milk-chocolate-animals", "Small milk chocolate animals", CH, False, "Per 14g"),
    ("small-white-chocolate-animals", "Small white chocolate animals", CH, False, "Per 14g"),
]

# --- items whose printed numbers cannot be relied on: written to items.csv AND holdback.csv (never published, never corrected) --
# (handle, name, category, basis the page must print, reason shown in the check report)
HOLD: list[tuple[str, str, str, str, str]] = [
    ("chocolate-mice-pack-of-3", "Chocolate mice box", CH, "Per Product",
     "The guide prints exactly the same numbers (130 kcal) for the 'Chocolate mice box' as for a single 'Milk chocolate mouse', "
     "so the serving is unclear"),
    ("cheese-onion-bites-pack-of-6", "Cheese & onion bites (pack of 6)", SV, "Per Product",
     "Printed 'Per Product' for a pack of 6 at only 85 kcal in total (about 14 kcal a bite), which does not look like six "
     "bites: the serving is unclear"),
    ("sausage-bites-pack-of-6", "Sausage bites (pack of 6)", SV, "Per Product",
     "Printed 'Per Product' for a pack of 6 at only 93 kcal in total (about 15 kcal a bite) and identical to the "
     "'Sausage roll bites' row: the serving is unclear"),
    ("sausage-roll-bites", "Sausage roll bites", SV, "Per Product",
     "Same numbers (93 kcal) as 'Sausage bites (pack of 6)', so it is unclear whether they are for one bite or for a pack"),
    ("sundried-tomato-feta-basil-quiche", "Sundried tomato, feta, & basil quiche", SV, "Per Product",
     "The guide lists this quiche twice with the same ingredients but different numbers (338 kcal here, 356 kcal in the "
     "Platters list): neither can be checked"),
    ("sundried-tomato-feta-basil-quiche-1", "Sundried tomato, feta, & basil quiche", SV, "Per Product",
     "The guide lists this quiche twice with the same ingredients but different numbers (356 kcal here, 338 kcal in the "
     "other list): neither can be checked"),
    ("raspberry-pistachio-danish", "Raspberry & pistachio danish", CK, "Per Product",
     "Protein is printed as 0.08 g for a pastry made with flour, egg, milk and nuts, which is not credible: not published "
     "until the chain fixes its guide"),
]

# --- identical (or nearly identical) repeats of an item listed elsewhere on the site: dropped, after checking ---------------
# duplicate handle -> the handle that is kept. Every printed number must match; the one allowed exception is sugars, in which
# case the sugar value is left blank (the guide contradicts itself) and the item says so in its notes.
DUPLICATES: dict[str, str] = {
    "cheese-little-bites-1": "cheese-little-bites",
    "copy-of-egg-mayo-little-bites": "egg-mayo-little-bites",
    "ham-little-bites-1": "ham-little-bites",
    "tuna-mayo-little-bites-1": "tuna-mayo-little-bites",
    "tuna-mayo-cucumber-chia-sandwich-1": "tuna-mayo-cucumber-chia-sandwich",
    "small-pork-pie": "small-pork-pies",
    "quiche-lorraine-1": "quiche-lorraine",
    "cheese-straws-1": "cheese-straws",
    "cinnamon-bun-1": "cinnamon-bun",
    "chicken-mayo-bacon-chia-sandwich-1": "chicken-mayo-bacon-chia-sandwich",
    "copy-of-prawn-mayo-chia-sandwich": "prawn-mayo-chia-sandwich",
    "copy-of-mrs-bs-rocky-road-tray": "mrs-bs-rocky-road-tray",
    "copy-of-honeycomb-brownie-slice": "large-honeycomb-brownie",
    "copy-of-apricot-pumpkin-seed-flapjack": "apricot-pumpkin-seed-flapjack",
    "chicken-ham-leek-slice-1": "chicken-ham-leek-slice",
    "mixed-cheese-onion-chia-sandwich-1": "mixed-cheese-onion-chia-sandwich",
    "copy-of-cheese-onion-bites-pack-of-6": "cheese-onion-bites-pack-of-6",
    "sausage-roll-bites-1": "sausage-roll-bites",
}

# --- left out, not items at all --------------------------------------------------------------------------------------------
PER_100G = """
nutrition-allergens-and-ingredients chia-loaf bloomer-loaf wholemeal-loaf crusty-cobs large-dinner-rolls multiseed-cobs
sandwich-rolls white-baps wholemeal-cob chia-seed-rolls animal-friends-chocolate-lolly cheese-scone custard-tart jam-doughnut
large-florentine jam-tart large-teacakes lemon-tart swiss-bun chocolate-cherry-sponge cream-doughnut cream-scone cream-slice
elephants-foot large-cooked-sausage hash-browns-2-pieces white-sandwich-rolls-xl sliced-ham pork-sausages-pack-of-6 beef-paste
standard-pork-pies cheese-onion-pasty steak-slice sausage-roll-xl stuffing-puck apple-sauce white-chocolate-mouse
shortbread-dog-and-bone iced-slice seeded-multiseed-loaf sourdough-700-g-loaf large-farmhouse-loaf coconut-raspberry-cake
lemon-tart-ice-cream caramel-doughnut-ice-cream cinnamon-bun-with-cream-cheese
""".split()
# handle -> basis the page must print (the unit is missing, so the serving cannot be stated: not published)
NO_UNIT = {"choc-chip-cookie": "Per 80", "copy-of-choc-chip-cookie": "Per 80"}

# --- the table on every item page ------------------------------------------------------------------------------------------
FIELDS = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt")
LABELS = (("Energy (kJ)", "kJ"), ("Energy (kcal)", "kcal"), ("Fat", "g"), ("of which saturates", "g"), ("Carbohydrate", "g"),
          ("of which sugars", "g"), ("Fibre", "g"), ("Protein", "g"), ("Salt", "g"))
VALUE = re.compile(r"^(<?\d+(?:\.\d+)?)(kJ|kcal|g)$")
DIET = {"Suitable for vegans and vegetarians": True, "Suitable for vegetarians": True,
        "Not suitable for vegans or vegetarians": False}
ALLERGEN_TITLE = "Birds Bakery Nutrition and allergen data, birdsbakery.com (website pages, no date printed)"
# The site's own spellings that common.allergen_words doesn't know: "Nuts (Tree & Almonds, Pistachios, Peanuts)".
ALLERGEN_EXTRA = {"tree": ("nuts", None)}
# Printed in a "may contain" sentence but not one of the 14 UK allergens, so not shown.
NOT_ALLERGENS = {"sunflower seeds", "pine kernel"}
# Two allergen words printed without the comma between them (summer-gingerbread-person: "Barley, Milk Soya, Sulphites").
RUN_TOGETHER = {"milk soya": ("Milk", "Soya")}
# Each "May contain traces of ..." sentence in the Ingredients section (some pages print two: both are read). Notes the site
# prints after one are cut off; anything else that is not an allergen word stops the run.
MAY_CONTAIN = re.compile(r"May contain traces of (.*?)(?=May contain traces of|$)", re.I)
MAY_NOTE = re.compile(r"\s*\*May have an adverse effect on activity (?:and|&) attention in children\.*\s*$")  # colours warning
PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausages?|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)

# Hand-written notes (not exported) for values that look odd; printed values are never changed.
ODD = {
    "quiche-lorraine": "Carbohydrate 62.51 g, fat 9.03 g and salt 0.19 g look unusual for a quiche made with ham and cheese; "
                       "copied as printed",
    "chicken-caesar-chia-roll": "Carbohydrate 16.0 g is low for a roll and the calories are about 15 percent above 4 x protein + "
                                "4 x carbohydrate + 9 x fat; copied as printed",
    "cheese-straws": "Plural name and the guide prints 'Per Product' without saying how many straws; shown as printed",
    "mrs-bs-rocky-road-tray": "Named as a tray, but the guide's numbers are per slice (75 g); shown as printed",
    "mixed-cheese-onion-chia-sandwich": "The guide lists this sandwich twice with identical numbers except sugars (2.4 g and "
                                        "22.4 g); sugars left blank",
}


def clean(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def norm_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


# --- download (only with --fetch) ------------------------------------------------------------------------------------------
_last_request = [0.0]


def http(url: str, data: bytes | None = None, headers: dict | None = None) -> bytes:
    wait = 1.05 - (time.monotonic() - _last_request[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            _last_request[0] = time.monotonic()
            return body
        except Exception as e:  # noqa: BLE001 - retry a couple of times, then say what failed
            _last_request[0] = time.monotonic()
            if attempt == 2:
                raise SystemExit(f"Could not download {url}: {e}")
            time.sleep(3)
    raise AssertionError


def fetch_all(cache: Path, refresh: bool) -> None:
    (cache / "pages").mkdir(parents=True, exist_ok=True)
    index = http(INDEX_URL).decode("utf-8", "replace")
    m = re.search(r'src="(//birdsbakery\.com/cdn/shop/t/\d+/assets/nutrition-and-allergen-data\.js[^"]*)"', index)
    if not m:
        raise SystemExit("The index page no longer loads nutrition-and-allergen-data.js: the site changed, re-check the source.")
    js = http("https:" + m.group(1)).decode("utf-8", "replace")
    tok = re.search(r'"X-Shopify-Storefront-Access-Token":"([0-9a-f]{32})"', js)
    if not tok or "nutrition_and_allergen_data" not in js:
        raise SystemExit("The page's script no longer queries nutrition_and_allergen_data: the site changed, re-check the source.")
    headers = {"Content-Type": "application/json", "X-Shopify-Storefront-Access-Token": tok.group(1)}

    def gql(query: str) -> dict:
        out = json.loads(http(GRAPHQL_URL, json.dumps({"query": query}).encode(), headers))
        if "errors" in out:
            raise SystemExit(f"The feed returned errors: {out['errors']}")
        return out["data"]["metaobjects"]

    cats = gql('{ metaobjects(type: "nutrition_and_allergen_data_categories", first: 50) { nodes { handle id '
               'name: field(key: "name") { value } } } }')["nodes"]
    items, after = [], None
    while True:
        part = gql('{ metaobjects(type: "nutrition_and_allergen_data", first: 100%s) { nodes { handle name: field(key: "name") '
                   '{ value } category: field(key: "category") { value } } pageInfo { hasNextPage endCursor } } }'
                   % (f', after: "{after}"' if after else ""))
        items += part["nodes"]
        if not part["pageInfo"]["hasNextPage"]:
            break
        after = part["pageInfo"]["endCursor"]
    (cache / "feed.json").write_text(json.dumps({"categories": cats, "items": items}, indent=1), encoding="utf-8")
    for it in items:
        path = cache / "pages" / f"{it['handle']}.html"
        if refresh or not path.exists():
            path.write_bytes(http(f"{INDEX_URL}/{it['handle']}"))


# --- read the saved pages --------------------------------------------------------------------------------------------------
def read_page(handle: str, text: str) -> dict:
    tables = re.findall(r'<table class="c-nutrition__table">(.*?)</table>', text, re.S)
    if len(tables) != 1:
        raise SystemExit(f"{handle}: expected one nutrition table, found {len(tables)}: the layout changed.")
    heads = [clean(x) for x in re.findall(r"<th[^>]*>(.*?)</th>", tables[0], re.S)]
    rows = [(clean(a), clean(b)) for a, b in re.findall(r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>", tables[0], re.S)]
    if len(heads) != 2 or heads[0] != "Typical values" or not heads[1].lower().startswith("per"):
        raise SystemExit(f"{handle}: table header is {heads}, expected ['Typical values', 'Per ...'].")
    if [r[0] for r in rows] != [lab for lab, _ in LABELS]:
        raise SystemExit(f"{handle}: table rows are {[r[0] for r in rows]}, expected {[lab for lab, _ in LABELS]}.")
    out: dict = {"basis": heads[1], "handle": handle}
    for field, (label, unit), (_, printed) in zip(FIELDS, LABELS, rows):
        m = VALUE.match(printed)
        if not m or m.group(2) != unit:
            raise SystemExit(f"{handle}: {label} is printed as {printed!r}, expected a number in {unit}.")
        out[field] = m.group(1)
    ing = re.search(r"Ingredients</h3>(.*?)</div>", text, re.S)
    out["ingredients"] = clean(ing.group(1)) if ing else ""
    diet = re.search(r"Dietry advice</h3>\s*<p[^>]*>(.*?)</p>", text, re.S)
    out["diet"] = clean(diet.group(1)) if diet else ""
    i, j = text.find('<div class="c-nutrition">'), text.find("c-our-food-item__index-link")
    out["block"] = re.sub(r"\s+", " ", text[i:j]) if 0 <= i < j else ""
    out["raw_block"] = text[i:j] if 0 <= i < j else ""
    return out


def split_words(text: str) -> list[str]:
    """'Oats, Rye, & Nuts (Almonds, Peanuts)' -> ['Oats', 'Rye', 'Nuts', 'Almonds', 'Peanuts']: the words of a printed list,
    split at commas, '&' and 'and' (a word in brackets is a part of the word before it, and is listed too)."""
    words, cur, depth = [], "", 0
    for ch in text + ",":
        if ch in "()":
            depth += 1 if ch == "(" else -1
            if depth < 0 or depth > 1:
                raise SystemExit(f"Unbalanced brackets in {text!r}")
            ch = ","
        if ch in ",&":
            words += [w for w in re.split(r"\band\b", cur) if w.strip()]
            cur = ""
        else:
            cur += ch
    if depth:
        raise SystemExit(f"Unbalanced brackets in {text!r}")
    return [w.strip() for w in words]


def read_allergens(handle: str, block: str) -> dict | None:
    """The item's allergens as its page prints them, or None when the page has no Allergens section."""
    sections = dict((clean(h), body) for h, body in re.findall(
        r'<h3 class="c-nutrition__heading">(.*?)</h3>(.*?)</div>', block, re.S))
    if "Allergens" not in sections:
        return None
    line = [clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", sections["Allergens"], re.S)]
    if len(line) != 1 or not line[0]:
        raise SystemExit(f"{handle}: the Allergens section is {line}, expected one line: the layout changed.")
    contains, cereals, nuts = allergen_words(split_words(line[0]), f"{handle} Allergens", ALLERGEN_EXTRA)
    paras = [clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", sections.get("Ingredients", ""), re.S)]
    found = sum(len(MAY_CONTAIN.findall(p)) for p in paras)
    if any(sum(len(re.findall(w, p, re.I)) for p in paras) != found for w in (r"may contain", r"traces")):
        raise SystemExit(f"{handle}: a 'may contain' / 'traces' wording that is not 'May contain traces of ...': {paras}")
    sentences = [m.group(1) for p in paras for m in MAY_CONTAIN.finditer(p)]
    if not sentences:
        raise SystemExit(f"{handle}: no 'May contain traces of ...' sentence in the ingredients: re-check the page.")
    may: set[str] = set()
    for sentence in sentences:
        sentence = MAY_NOTE.sub("", sentence)
        words = [x for w in split_words(sentence.strip().rstrip(".").strip()) if w.lower() not in NOT_ALLERGENS
                 for x in RUN_TOGETHER.get(w.lower(), (w,))]
        may |= allergen_words(words, f"{handle} may contain", ALLERGEN_EXTRA)[0]
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts,
            "printed": (line[0], tuple(sentences))}


def weight_for(basis: str) -> str:
    """The serving weight in grams when the basis prints one ("Per 77g" -> "77", "Per Slice (75g)" -> "75"), else ""."""
    m = re.fullmatch(r"per (?:per )?(?:slice \()?(\d+(?:\.\d+)?)g\)?", basis.strip().lower())
    if m and m.group(1) == "100":
        raise SystemExit(f"weight_for({basis!r}): a per-100 g basis is never published")
    return m.group(1) if m else ""


def serving_for(basis: str) -> str:
    b = re.sub(r"^per (per )?", "", basis.strip().lower())
    fixed = {"product": "", "roll": "1 roll", "portion": "1 portion", "serving": "1 serving", "twist": "1 twist",
             "cupcake": "1 cupcake", "slice (75g)": "1 slice (75 g)"}
    if b in fixed:
        return fixed[b]
    m = re.fullmatch(r"(\d+)g", b)
    if m and m.group(1) != "100":
        return f"{m.group(1)} g"
    raise SystemExit(f"Unknown basis {basis!r}: decide what it means before publishing it.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder holding feed.json and pages/<handle>.html")
    ap.add_argument("--fetch", action="store_true", help="download the feed and any missing pages first (1 request/second)")
    ap.add_argument("--refresh", action="store_true", help="with --fetch: download every page again")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    if args.fetch:
        fetch_all(args.cache, args.refresh)
    feed_path = args.cache / "feed.json"
    if not feed_path.exists():
        raise SystemExit(f"{feed_path} not found: run with --fetch first.")
    feed = json.loads(feed_path.read_text(encoding="utf-8"))["items"]
    names = {it["handle"]: norm_name(it["name"]["value"]) for it in feed}
    if len(names) != len(feed):
        raise SystemExit("The feed has duplicate handles.")

    # 1. every handle the site lists must be accounted for, and nothing we expect may have gone
    known: dict[str, str] = {}
    for table, kind in ((INCLUDE, "published"), (HOLD, "held back"), ([(h,) for h in DUPLICATES], "duplicate"),
                        ([(h,) for h in PER_100G], "per 100 g"), ([(h,) for h in NO_UNIT], "no unit")):
        for row in table:
            if row[0] in known:
                raise SystemExit(f"Script error: {row[0]} is listed as both {known[row[0]]} and {kind}.")
            known[row[0]] = kind
    problems = [f"new on the site, not in this script: {h} ({names[h]!r})" for h in names if h not in known]
    problems += [f"in this script but no longer on the site: {h} ({k})" for h, k in known.items() if h not in names]
    for h, name, *_ in [*INCLUDE, *HOLD]:
        if h in names and norm_name(name).lower() != names[h].lower():
            problems.append(f"{h}: the site now calls it {names[h]!r}, this script says {name!r}")
    if problems:
        print("The site's item list no longer matches this script. Re-check the names and groupings, then edit the tables:",
              file=sys.stderr)
        print("\n".join("  - " + p for p in problems), file=sys.stderr)
        return 1

    # 2. read every page, check each basis is what we expect
    pages = {h: read_page(h, (args.cache / "pages" / f"{h}.html").read_text(encoding="utf-8")) for h in names}
    for h, expected in [*((s[0], s[4]) for s in INCLUDE), *((s[0], s[3]) for s in HOLD), *NO_UNIT.items(),
                        *((h, "Per 100g") for h in PER_100G)]:
        if pages[h]["basis"] != expected:
            problems.append(f"{h}: basis is now {pages[h]['basis']!r}, this script expects {expected!r}")
    for h in DUPLICATES:
        if pages[h]["basis"] == "Per 100g":
            problems.append(f"{h}: a repeat that is now per 100 g")
    if problems:
        print("An item's basis changed (per item vs per 100 g): re-check before publishing.", file=sys.stderr)
        print("\n".join("  - " + p for p in problems), file=sys.stderr)
        return 1

    # 3. repeats: same name and same numbers as the item we keep (only sugars may differ: then sugars are left blank)
    blank_sugar: set[str] = set()
    dup_of: dict[str, list[str]] = {}
    for dup, keep in DUPLICATES.items():
        if slug(names[dup]) != slug(names[keep]):
            problems.append(f"{dup} ({names[dup]!r}) is not named like {keep} ({names[keep]!r})")
        diff = [f for f in FIELDS if pages[dup][f] != pages[keep][f]]
        if diff == ["sugars"]:
            blank_sugar.add(keep)
            if keep not in ODD:
                problems.append(f"{keep}: its repeat {dup} disagrees on sugars; add a note to ODD")
        elif diff:
            problems.append(f"{dup} differs from {keep} in {diff}: it is not an identical repeat")
        dup_of.setdefault(keep, []).append(dup)
    if problems:
        print("\n".join("  - " + p for p in problems), file=sys.stderr)
        return 1
    # a repeat that prints different allergens: the item gets both pages' allergens (the guide contradicts itself; reported)
    allergen_report: list[str] = []
    used_pages = [s[0] for s in INCLUDE] + [s[0] for s in HOLD] + list(DUPLICATES)
    allergens: dict[str, dict | None] = {h: read_allergens(h, pages[h]["raw_block"]) for h in used_pages}
    for keep, dups in dup_of.items():
        for dup in dups:
            a, b = allergens[keep], allergens[dup]
            if a is None or b is None:
                allergens[keep] = None
                allergen_report.append(f"{keep} / repeat {dup}: a page has no Allergens section")
                continue
            if a["printed"] != b["printed"]:
                allergen_report.append(f"{keep} prints {a['printed']}; its repeat {dup} prints {b['printed']}: both are used")
                contains = a["contains"] | b["contains"]
                allergens[keep] = {"contains": contains, "may_contain": (a["may_contain"] | b["may_contain"]) - contains,
                                   "cereals": a["cereals"] | b["cereals"], "nuts": a["nuts"] | b["nuts"],
                                   "printed": a["printed"]}

    # 4. build the rows (published first, then the held-back ones, which are written to items.csv AND holdback.csv)
    specs = [(h, n, c, r, b, None) for h, n, c, r, b in INCLUDE] + [(h, n, c, False, b, why) for h, n, c, b, why in HOLD]
    items: list[dict] = []
    holdback: list[tuple[str, str]] = []
    impossible: list[str] = []
    used: set[str] = set()
    for handle, name, category, rankable, basis, hold_reason in specs:
        p = pages[handle]
        veg = DIET.get(p["diet"])
        if veg is None:
            raise SystemExit(f"{handle}: unexpected dietary wording {p['diet']!r}: decide what it means.")
        text = f"{name} {p['ingredients']}"
        tags = ["vegetarian"] if veg else []
        if veg and (PORK.search(text) or BEEF.search(text)):
            raise SystemExit(f"{handle}: marked suitable for vegetarians but names a meat: re-check.")
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        notes = [f"Basis printed: '{p['basis']}'"]
        if handle in dup_of:
            notes.append("listed more than once on the site with the same numbers")
        if handle in ODD:
            notes.append(ODD[handle])
        if allergens[handle] is None:
            allergen_report.append(f"{handle}: no Allergens section on its page, so the chain gets the guide link only")
        if not 4.02 <= float(p["kj"]) / float(p["kcal"]) <= 4.35:
            notes.append(f"printed kJ ({p['kj']}) and kcal ({p['kcal']}) differ by more than 4 percent")
        if float(p["protein"]) > 50:
            notes.append(f"protein {p['protein']} g is very high for one item; copied as printed")
        if hold_reason is None and (float(p["sat"]) > float(p["fat"]) or float(p["sugars"]) > float(p["carbs"])):
            impossible.append(handle)
        item_id = slug(name)
        if item_id in used:
            if hold_reason is None:
                raise SystemExit(f"Two published rows share the id {item_id}: they are different products, name them apart.")
            n = 2
            while f"{item_id}-{n}" in used:
                n += 1
            item_id = f"{item_id}-{n}"
        used.add(item_id)
        items.append({
            "id": item_id, "name": name, "category": category, "serving": serving_for(p["basis"]),
            "calories": p["kcal"], "protein_g": p["protein"], "carbs_g": p["carbs"], "fat_g": p["fat"],
            "sat_fat_g": p["sat"], "sodium_mg": "", "salt_g": p["salt"],
            "sugar_g": "" if handle in blank_sugar else p["sugars"], "fiber_g": p["fibre"],
            "energy_kj": p["kj"], "weight_g": weight_for(p["basis"]),
            "tags": "|".join(tags), "limited_time": False, "rankable": rankable, "notes": "; ".join(notes),
            "allergens": None if allergens[handle] is None else
            {k: v for k, v in allergens[handle].items() if k in ("contains", "may_contain", "cereals", "nuts")},
        })
        if hold_reason:
            holdback.append((item_id, hold_reason))
    if impossible:
        print("These published rows have saturates > fat or sugars > carbohydrate: add them to HOLD or ask the founder:\n  "
              + "\n  ".join(impossible), file=sys.stderr)
        return 1

    digest = hashlib.sha256()
    for it in feed:
        digest.update(it["handle"].encode() + b"\n" + pages[it["handle"]]["block"].encode() + b"\n")

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Birds Bakery", cuisine="Bakery",
        source_title="Birds Bakery (Birds (Derby) Ltd) Nutrition and allergen data, birdsbakery.com (website pages, no date printed; "
                     f"read {args.checked_on})",
        source_url=INDEX_URL, checked_on=args.checked_on, aliases=["birds bakery", "birds of derby"],
        items=items, holdback=holdback, out=args.out,
        note="Values are per item as the bakery's website prints them (per roll, product, portion or stated weight). Items it "
             "lists only per 100 g are left out, because we never convert. The website carries no date.",
        allergen_guide={"title": ALLERGEN_TITLE, "url": INDEX_URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"wrote {len(items)} rows to {out}: {len(items) - len(holdback)} published, {len(holdback)} held back; dropped {len(DUPLICATES)} repeats, "
          f"left out {len(PER_100G)} per-100g and {len(NO_UNIT)} no-unit rows (site lists {len(names)} items)")
    print(f"source digest (sha256 of every item page's nutrition block, in feed order): {digest.hexdigest()}")
    complete = all(it["allergens"] is not None for it in items)
    print(f"allergens: {'every row has them (allergens.csv written)' if complete else 'INCOMPLETE: guide link only'}")
    for line in allergen_report:
        print("  allergens:", line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
