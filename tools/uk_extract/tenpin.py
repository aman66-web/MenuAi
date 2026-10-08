#!/usr/bin/env python3
"""Build data/source/tenpin/ from Tenpin's own menu data (a MIXED chain: full nutrition for some dishes, calories only for others).

    python3 tools/uk_extract/tenpin.py --feeds DIR --checked-on 2026-10-08 [--fetch] [--out DIR] [--report]

DIR holds the five JSON files main.json, halal.json, fountain.json, printworks.json, clydebank.json; --fetch downloads them first
(one request each, 1.2 s apart, a normal browser User-Agent; robots.txt of app.catercloud.com is checked, see fetch_feeds).

SOURCE. https://www.tenpin.co.uk/our-company/allergen-and-risk-forms/ ("Download risk forms and allergen information below") links five
CaterCloud QR-menu pages https://app.catercloud.com/menu/<id>. Each page's own script (reactapp/qrmenumealplan/main.js) loads ONE JSON
document, https://app.catercloud.com/Menu/Qr/Get/<id>, and draws it. The allergen QR code on Tenpin's printed "Food & Drinks Menu" PDF
(https://www.tenpin.co.uk/media/7647/tenpin-food-menu.pdf, PDF created 2026-06-29, served Last-Modified 2026-07-23, SHA-256
fec86d9b294a4af7cd1ea7c139b8df70c5e4da7c555b2dd9316c57bdf9be876f) decodes to the FIRST of them, "Menu Allergen Information"
(780DA69A-...): that is Tenpin's standard menu. The other four are "Halal Menu", "Fountain Park & Leeds", "Printworks" and "Clydebank".
catercloud.com has no robots.txt (the path redirects to its 404 page); tenpin.co.uk's robots.txt only disallows /booking/.

WHAT IS DISPLAYED. The page draws the nutrition table only when the menu's own display setting "Nutrition" is on (settings[] in the JSON):
    main (standard menu)  OFF    halal OFF    Fountain Park & Leeds ON    Printworks ON    Clydebank ON
so on the standard menu's page a visitor sees allergens ("Contains" / "May contain") but no nutrition, while the three centre pages show,
per dish, Energy (kcal), Salt, Fat, Saturated Fat, Carbohydrate, Sugar, Protein and Fibre per portion and per 100g, each to 2 decimals
(`Number(x).toFixed(2)`). The portion weight is shown only on Clydebank's page, so weight_g is NOT published. Tenpin's printed menu
prints calories (kcal) for most food and soft drinks.

RULE (docs/UK_DATA_STATUS.md, 8 Oct 2026: "nutrition switched off by the chain = not published"): a figure is published only where Tenpin
shows it on one of its own pages. For a dish on the standard menu's feed this means:
  FULL   all eight nutrients, when a centre page (nutrition display ON) lists a dish of the same name with identical figures and allergens
         (copied as that page prints them: 2 decimals);
  KCAL   calories only, when Tenpin's printed menu prints the dish's kcal and it equals the feed's energy rounded (the printed integer is
         what is published, the feed's other nutrients are not);
  nothing otherwise (the dish is left out).
A dish is HELD BACK (holdback.csv, never corrected) when: any other menu lists it with different figures or allergens ("publish only dishes
whose figures agree across the venues"); the printed menu prints a different kcal; the same name appears twice on the standard menu with
different figures; the figures are not a serving (a 1 g or 100 g portion) or are all zero; its allergen list contradicts the bold allergen
words of the feed's own ingredient text or the feed's own "May contain" line; or a component of its ingredient text has no ingredients
recorded (the allergen list may be incomplete). Whole section 577140 is left out: it is titled SAUCES but holds Clydebank's pizzas, hot dogs
and Tenpin specials (two names clash with the standard PIZZA section at different figures).

THE PRINTED MENU TABLE (PDF below) is TYPED from the rendered pages (110 dpi, read by eye twice and with OCR); it is only a gate that a
feed value must equal, and the published KCAL value is that printed integer. A wrong typed value can only hold a dish back (the feed
value would not match) or, for a dish that is not FULL, pass a feed value within half a calorie of it.

ALLERGENS (docs/DATA.md "Allergens"): every published dish gets the standard menu's own lists (`allergensDoesContain`, `allergensMayContain`,
shown on all five pages). All or nothing: any word outside common._A + ALLERGEN_WORDS stops the run. "SO2" is sulphur dioxide and sulphites,
"Gluten (Undefined)" is gluten without a named cereal, "Nuts (Unspecified)" is tree nuts without a named kind, "Brazil" is Brazil nut. The
page prints "Please refer to any sauce sachets for allergens. These are not stated below." and "Please note that peanuts are sold in our
Tenpin centres. We cannot guarantee that allergy sufferers will not be exposed to peanuts": both are in note.txt.

TAGS: vegetarian only where the printed menu carries its (V) mark (the feed's own dietary tags are not displayed on any page and are not
used); contains_beef / contains_pork where the dish's name, the printed description or the feed's ingredient text says beef/steak or
pork/bacon/ham/gammon/pepperoni/salami/chorizo. Hot dogs: the sausage's ingredients are empty in the feed, so the meat is not stated.

Needs Python 3.9+. Stops if a feed's item count, a section or a name changes (EXPECTED_*, SECTIONS, the classification counts).
"""
from __future__ import annotations
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import _A as _A_TABLE, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "tenpin"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
HOST = "app.catercloud.com"
PAGE = "https://app.catercloud.com/menu/{}"
API = "https://app.catercloud.com/Menu/Qr/Get/{}"
FEEDS = {
    "main": ("780DA69A-2F7F-4D47-A156-477D40CBF049", "Menu Allergen Information"),
    "halal": ("6D91D11E-3C10-4837-ABA4-00527330EBC1", "Halal Menu Allergen Information"),
    "fountain": ("9B922779-1B02-4163-8A97-B352E6A64C0A", "Fountain Park & Leeds Menu Allergen Information"),
    "printworks": ("8F6705EE-2734-4E52-A868-3A8143B28762", "Printworks Menu Allergen Information"),
    "clydebank": ("5772A134-8ED0-42DF-A549-950195DBF603", "Clydebank Menu Allergen Information"),
}
EXPECTED_ITEMS = {"main": 140, "halal": 96, "fountain": 95, "printworks": 74, "clydebank": 79}
EXPECTED_NUTRITION_DISPLAY = {"main": False, "halal": False, "fountain": True, "printworks": True, "clydebank": True}
NUTRIENTS = ["Energy", "Salt", "Fat", "Saturated Fat", "Carbohydrate", "Sugar", "Protein", "Fibre"]
COLUMN = {"Energy": "calories", "Salt": "salt_g", "Fat": "fat_g", "Saturated Fat": "sat_fat_g", "Carbohydrate": "carbs_g",
          "Sugar": "sugar_g", "Protein": "protein_g", "Fibre": "fiber_g"}

SOURCE_TITLE = ("Tenpin menu allergen & nutrition data (CaterCloud QR menu 'Menu Allergen Information', no date shown, read 8 October 2026) "
                "and Tenpin Food & Drinks menu (PDF created 29 June 2026)")
SOURCE_URL = PAGE.format(FEEDS["main"][0])
GUIDE_TITLE = ("Tenpin Menu Allergen Information (CaterCloud QR menu; the allergen QR code on Tenpin's printed Food & Drinks menu opens it; "
               "no date shown)")
NOTE = ("Standard Tenpin menu: centres' menus differ and not every dish is sold everywhere; dishes whose figures differ between centres or "
        "from Tenpin's printed menu are left out. Full nutrition is as Tenpin's Fountain Park, Leeds, Printworks and Clydebank menu pages "
        "show it; other dishes show the calories on its printed menu. Allergens exclude sauce sachets; peanuts are sold in centres.")

# Extra printed allergen spellings (lower-case word -> (key, specific kind or None)); anything else not in common._A stops the run.
ALLERGEN_WORDS = {
    "so2": ("sulphites", None),
    "gluten (undefined)": ("gluten", None),
    "nuts (unspecified)": ("nuts", None),
    "brazil": ("nuts", "brazil nut"),
}
# Bold words in the feed's ingredient text that mean an allergen but are not in common._A (lower-case word -> (key, specific kind or None)).
BOLD_EXTRA = {"metabisulphite": ("sulphites", None), "soybean": ("soya", None)}
# Component words printed with empty brackets ("Lactic Cultures ()") that were looked at and are not a missing recipe.
EMPTY_BRACKETS_OK = {"lactic cultures"}

# section id -> (name as the feed prints it, category name, or None = whole section left out)
SECTIONS = {
    416040: ("BURGERS & DOGS", "Burgers & Dogs"), 416041: ("FOR OUR YOUNGER PLAYERS", "For Our Younger Players"), 416042: ("PIZZA", "Pizza"),
    416043: ("SHARERS", "Sharers"), 416048: ("Paninis", "Paninis"), 416049: ("COMBOS", "Combos"), 511334: ("Hot drinks", "Hot Drinks"),
    511360: ("Iced Drinks", "Iced Drinks"), 511361: ("Syrups", "Syrups"), 511461: ("Bar Snacks", "Bar Snacks"),
    511492: ("Non-alcoholic Drinks", "Non-alcoholic Drinks"), 577138: ("PICK N DIP", "Pick 'n' Dip"), 577139: ("SAUCES", "Sauces"),
    577140: ("SAUCES", None), 577141: ("Sharers", "Sharers"), 577142: ("Kids", "Kids"), 586479: ("Shakes", "Shakes"),
    592650: ("Christmas", "Christmas"),
}
SECTION_LEFT_OUT = {577140: "titled SAUCES but holds Clydebank's pizzas, hot dogs and specials; its MARGHERITA and PEPPERONI clash with the "
                            "standard PIZZA section at different figures"}

# What Tenpin's printed Food & Drinks menu prints (food_menu.pdf pages 2, 3 and 4): (section, feed name) -> (printed kcal values, (V) mark).
# "+N kcal" beside an add-on is that add-on's own calories. Two printed values (Slush regular/large) are both accepted.
PDF_PAGES = {2: "Burgers & Dogs, For Our Younger Players, Ice cream", 3: "Pizza, Sharers, Paninis, Combos", 4: "Hot drinks, Iced coffee, Syrups, Slush"}
PDF = {
    ("BURGERS & DOGS", "CLASSIC BURGER"): ((856,), False),
    ("BURGERS & DOGS", "CLASSIC BURGER WITH CHEESE"): ((897,), False),
    ("BURGERS & DOGS", "ULTIMATE BURGER"): ((1147,), False),
    ("BURGERS & DOGS", "SOUTHERN FRIED CHICKEN BURGER"): ((799,), False),
    ("BURGERS & DOGS", "SPICY BEAN BURGER"): ((850,), True),
    ("BURGERS & DOGS", "THE BIG DOG"): ((957,), False),
    ("BURGERS & DOGS", "UPGRADE FRIES TO CURLY FRIES"): ((71,), True),          # printed "+ 71 kcal (per meal)"
    ("BURGERS & DOGS", "ADD A SIDE OF ONION RINGS"): ((371,), True),
    ("BURGERS & DOGS", "ADD AN EXTRA CHEESE SLICE"): ((41,), True),
    ("BURGERS & DOGS", "Make it a superstack - beef burger"): ((364,), False),   # "Make it a superstack for 2.50 + 364 kcal"
    ("BURGERS & DOGS", "Double up your burger - southern fried chicken"): ((293,), False),
    ("BURGERS & DOGS", "Double up your burger - spicy bean"): ((359,), False),
    ("BURGERS & DOGS", "ADD A SAUCE - BBQ Sauce"): ((49,), True),
    ("BURGERS & DOGS", "ADD A SAUCE - Garlic Mayonnaise"): ((141,), True),
    ("BURGERS & DOGS", "ADD A SAUCE - Sriracha Hot Chilli Sauce"): ((53,), True),
    ("FOR OUR YOUNGER PLAYERS", "CHAMPION BURGER"): ((536,), False),
    ("FOR OUR YOUNGER PLAYERS", "CHAMPION BURGER WITH CHEESE"): ((576,), False),
    ("FOR OUR YOUNGER PLAYERS", "VEGGIE BURGER"): ((557,), True),                # printed "VEGETABLE BURGER"
    ("FOR OUR YOUNGER PLAYERS", "CHICKEN NUGGETS"): ((470,), False),
    ("FOR OUR YOUNGER PLAYERS", "QUORN NUGGETS"): ((469,), True),
    ("FOR OUR YOUNGER PLAYERS", "KIDS HOT DOG"): ((507,), False),                # printed "HOT DOG"
    ("FOR OUR YOUNGER PLAYERS", "UPGRADE FRIES TO CURLY FRIES"): ((65,), True),  # printed "+ 65 kcal (per meal)"
    ("FOR OUR YOUNGER PLAYERS", "ICE CREAM TUBS - CHOCOLATE"): ((120,), True),
    ("FOR OUR YOUNGER PLAYERS", "ICE CREAM TUBS - VANILLA"): ((119,), True),
    ("PIZZA", "MARGHERITA"): ((946,), True),
    ("PIZZA", "PEPPERONI"): ((1162,), False),
    ("PIZZA", "MEAT FEAST"): ((1266,), False),
    ("PIZZA", "Switch from tomato sauce base to BBQ Sauce"): ((124,), False),
    ("PIZZA", "PIZZA ADD A SAUCE - BBQ Sauce"): ((24,), True),
    ("PIZZA", "PIZZA ADD A SAUCE - Garlic Mayonnaise"): ((71,), True),
    ("PIZZA", "PIZZA ADD A SAUCE - Sriracha Hot Chilli Sauce"): ((27,), True),
    ("PIZZA", "Top your pizza with jalapenos"): ((6,), False),
    ("SHARERS", "ULTIMATE NACHOS WITH NACHO CHEESE"): ((1003,), True),           # printed "ULTIMATE NACHOS" (topped with nacho cheese)
    ("SHARERS", "HOT 'N' KICKIN CHICKEN WINGS & FRIES"): ((983,), False),
    ("SHARERS", "ONION RINGS"): ((803,), True),
    ("SHARERS", "LARGE FRIES"): ((607,), True),
    ("SHARERS", "LARGE CURLY FRIES"): ((749,), True),
    ("Paninis", "MOZZARELLA, PESTO & SUN-DRIED TOMATO"): ((517,), True),
    ("Paninis", "SMOKED HAM & CHEESE"): ((481,), False),
    ("COMBOS", "SMALL COMBO WITH FRIES"): ((1573,), False),
    ("COMBOS", "LARGE COMBO WITH FRIES"): ((2195,), False),
    ("COMBOS", "SMALL VEGGIE COMBO WITH FRIES"): ((1482,), True),
    ("COMBOS", "LARGE VEGGIE COMBO WITH FRIES"): ((2024,), True),
    # hot drinks (printed STANDARD / LARGE kcal columns; "Double Espresso" = the printed LARGE espresso)
    ("Hot drinks", "Standard Cappuccino"): ((103,), False), ("Hot drinks", "Large Cappuccino"): ((126,), False),
    ("Hot drinks", "Standard Latte"): ((119,), False), ("Hot drinks", "Large Latte"): ((149,), False),
    ("Hot drinks", "Flat white"): ((65,), False),
    ("Hot drinks", "Standard white Americano"): ((39,), False), ("Hot drinks", "Large white Americano"): ((46,), False),
    ("Hot drinks", "Standard Americano"): ((11,), False), ("Hot drinks", "Large Americano"): ((12,), False),
    ("Hot drinks", "Standard Mocha"): ((172,), False), ("Hot drinks", "Large Mocha"): ((219,), False),
    ("Hot drinks", "Espresso"): ((8,), False), ("Hot drinks", "Double Espresso"): ((12,), False),
    ("Hot drinks", "Standard Hot Chocolate"): ((167,), False), ("Hot drinks", "Large Hot Chocolate"): ((219,), False),
    ("Hot drinks", "Tea"): ((14,), False),
    ("Iced Drinks", "Iced Latte"): ((119,), False), ("Iced Drinks", "Iced Americano"): ((11,), False), ("Iced Drinks", "Iced Espresso"): ((12,), False),
    ("Syrups", "Caramel Syrup"): ((48,), False), ("Syrups", "Gingerbread Syrup"): ((51,), False),
    ("Syrups", "Hazelnut Syrup"): ((47,), False), ("Syrups", "Vanilla Syrup"): ((51,), False),
    ("Non-alcoholic Drinks", "Slush"): ((70, 91), False),                        # Slush (regular) 70, Slush (large) 91
}

# Dishes held back for a reason the automatic rules cannot see: (section, feed name) -> reason.
MANUAL_HOLD = {
    ("Iced Drinks", "Iced Cappuccino"): "same figures as the Large Cappuccino, which Tenpin's printed menu contradicts (126 kcal printed)",
    ("Iced Drinks", "Iced Mocha"): "same figures as the Large Mocha, which Tenpin's printed menu contradicts (219 kcal printed)",
    ("Syrups", "Galaxy Caramel Syrup"): "every nutrient is 0 although the dish lists milk: no figures recorded",
    ("Syrups", "Twix Syrup"): "every nutrient is 0 although the dish lists milk: no figures recorded",
    ("Non-alcoholic Drinks", "Squash Drinks"): "every nutrient is 0, portion 0 g and no ingredients recorded: no figures",
    ("Bar Snacks", "Chilli Coated Peanuts"): "the figures are for a 1 g portion, not a serving as sold",
    ("Bar Snacks", "Smoked Paprika Coated Peanuts"): "the figures are for a 1 g portion, not a serving as sold",
    ("Bar Snacks", "Tikka Masala Coated Peanuts"): "the figures are for a 100 g portion (a per-100 g basis), not a serving as sold",
}
# Display names where the feed's wording is not a good title (everything else is title-cased by tidy()).
DISPLAY = {
    ("FOR OUR YOUNGER PLAYERS", "UPGRADE FRIES TO CURLY FRIES"): "Upgrade Fries to Curly Fries (kids)",
    ("BURGERS & DOGS", "UPGRADE FRIES TO CURLY FRIES"): "Upgrade Fries to Curly Fries",
    ("PICK N DIP", "ONION RINGS"): "Onion Rings (Pick 'n' Dip)",
    ("PIZZA", "KIDS'S 5\" PIZZA - Fries"): "Kids' 5\" Pizza - Fries",
    ("PIZZA", "KIDS'S 5\" PEPPERONI PIZZA - Fries"): "Kids' 5\" Pepperoni Pizza - Fries",
    ("Christmas", "Turkey burger"): "Turkey Burger",
    ("Christmas", "Loaded turkey fries hot mayo"): "Loaded Turkey Fries with Hot Mayo",
    ("Christmas", "Loaded turkey fries BBQ"): "Loaded Turkey Fries with BBQ Sauce",
}
ADD_ON = re.compile(r"^(add\b|make it|double up|pizza add|top your|switch from|upgrade|ice cream)", re.I)
SMALL_WORDS = {"a", "an", "and", "of", "the", "to", "with", "your", "up", "in", "on", "from", "for", "or", "it"}
KEEP_UPPER = {"BBQ"}
PORK = re.compile(r"\b(pork|bacon|ham|gammon|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
LIMITED = {"Christmas"}


# ---------------------------------------------------------------- reading the feeds

def fetch_feeds(dest: Path) -> None:
    """One GET per feed, 1.2 s apart. catercloud.com has no robots.txt (/robots.txt redirects to its 404 page); if it ever gets one,
    RFC 9309 matching decides and a Disallow stops the run."""
    dest.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(f"https://{HOST}/robots.txt", headers={"User-Agent": USER_AGENT})
    rules = []
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.geturl().endswith("/robots.txt") and "text/plain" in (resp.headers.get("Content-Type") or ""):
                rules = robots_rfc.parse(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError:
        rules = []
    for key, (fid, _label) in FEEDS.items():
        path = f"/Menu/Qr/Get/{fid}"
        if not robots_rfc.allowed(rules, path):
            raise SystemExit(f"robots.txt of {HOST} disallows {path}: not downloading. Save the file yourself and pass --feeds.")
        time.sleep(1.2)
        req = urllib.request.Request(API.format(fid), headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                (dest / f"{key}.json").write_bytes(resp.read())
        except urllib.error.HTTPError as err:
            raise SystemExit(f"{API.format(fid)} answered HTTP {err.code}. Not trying to get round it: save the file yourself.")


def shown(value: float) -> str:
    """The number as the QR page prints it: Number(x).toFixed(2) (round half up on the exact binary value)."""
    return str(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def load_feed(feeds_dir: Path, key: str) -> dict:
    doc = json.loads((feeds_dir / f"{key}.json").read_text(encoding="utf-8"))
    if doc.get("errorMsg"):
        raise SystemExit(f"{key}.json: errorMsg {doc['errorMsg']!r}")
    data = doc["data"]
    shows = [s["selected"] for s in data["settings"] if s["name"] == "Nutrition"]
    if len(shows) != 1:
        raise SystemExit(f"{key}.json: no single 'Nutrition' display setting")
    items = []
    for sec in data["data"]["sections"]:
        for it in sec["items"]:
            nut = {n["name"]: n for n in it["nutrientsModelPortion"]}
            if list(nut) != NUTRIENTS or any(nut[n]["unitName"] != ("kcal" if n == "Energy" else "g") for n in NUTRIENTS):
                raise SystemExit(f"{key}.json: {it['name']!r}: nutrient list or units changed: {[(n['name'], n['unitName']) for n in it['nutrientsModelPortion']]}")
            items.append({"section_id": sec["id"], "section": sec["name"].strip(), "raw": it, "name": it["name"].strip(),
                          "key": " ".join(it["name"].lower().split()),
                          "figs": tuple(shown(nut[n]["quantity"]) for n in NUTRIENTS),
                          "energy": nut["Energy"]["quantity"], "weight": it["quantityPerPortion"],
                          "contains": frozenset(w.strip().lower() for w in (it["allergensDoesContain"] or "").split(",") if w.strip()),
                          "may": frozenset(w.strip().lower() for w in (it["allergensMayContain"] or "").split(",") if w.strip())})
    if len(items) != EXPECTED_ITEMS[key]:
        raise SystemExit(f"{key}.json has {len(items)} items, expected {EXPECTED_ITEMS[key]}: the menu changed, re-check this script")
    if shows[0] != EXPECTED_NUTRITION_DISPLAY[key]:
        raise SystemExit(f"{key}: the page's Nutrition display setting is now {shows[0]}, was {EXPECTED_NUTRITION_DISPLAY[key]}: "
                         "re-read the 'WHAT IS DISPLAYED' rule and update this script")
    return {"key": key, "shows_nutrition": shows[0], "items": items}


# ---------------------------------------------------------------- checks on one dish

def plain(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", text or "")).strip()


def allergen_problems(it: dict) -> list:
    """Disagreements between the allergen lists and the feed's own ingredient text (bold = allergen words, 'May contain:' tail).
    Compared as allergen KEYS ("Egg" in the text is the listed "Eggs"; "SULPHUR DIOXIDE" is the listed "SO2")."""
    ing = it["raw"]["ingredients"] or ""
    listed, _, _ = allergen_words(sorted(it["contains"] | it["may"]), it["name"], ALLERGEN_WORDS)
    out = []
    words = set()
    for b in re.findall(r"<b>(.*?)</b>", ing, re.S):
        b = b.strip()
        if b.startswith("(") and b.endswith(")"):      # the feed's own per-ingredient summary "(Wheat, Gluten (Undefined))"
            b = b[1:-1]
        for w in re.split(r",\s*(?![^()]*\))", b):
            w = w.strip(" ,.")
            while w.startswith("(") and w.count("(") > w.count(")"):    # stray brackets from the feed's markup
                w = w[1:].strip()
            while w.endswith(")") and w.count(")") > w.count("("):
                w = w[:-1].strip()
            words.add(w)
    table = {**_A_TABLE, **ALLERGEN_WORDS, **BOLD_EXTRA}
    for w in sorted(words):
        lw = " ".join(w.lower().split())
        if len(re.sub(r"[^a-z]", "", lw)) < 3:
            continue                                   # stray fragments of the feed's markup, not words
        if lw == "soybean" and re.search(r"refined\s*<b>\s*soybean\s*</b>\s*oil", ing, re.I):
            continue                                   # fully refined soybean oil is exempt from allergen labelling
        if lw not in table:
            out.append(f"the ingredient text has a bold word '{w}' this script does not know: check it")
        elif table[lw][0] not in listed:
            out.append(f"the ingredient text marks '{w}' but the allergen lists do not")
    m = re.search(r"May contain:(.*)$", plain(ing), re.I)
    tail = frozenset(x.strip().lower() for x in m.group(1).split(",") if x.strip()) if m else frozenset()
    tail_keys, _, _ = allergen_words(sorted(tail), it["name"], ALLERGEN_WORDS)
    may_keys, _, _ = allergen_words(sorted(it["may"]), it["name"], ALLERGEN_WORDS)
    if tail_keys != may_keys:
        out.append(f"the ingredient text's 'May contain' ({sorted(tail)}) differs from the 'May contain' list ({sorted(it['may'])})")
    for m in re.finditer(r"([A-Za-z0-9][A-Za-z0-9 ,.%'-]{0,40}?)\s*\(\s*\)", plain(ing)):
        if m.group(1).strip().lower() not in EMPTY_BRACKETS_OK and not re.match(r"^[,.\s]*$", m.group(1)):
            out.append(f"a component has no ingredients recorded ('{m.group(1).strip()[-40:]} ()'), so the allergen list may be incomplete")
            break
    return out


def tidy(name: str) -> str:
    out = []
    for i, tok in enumerate(name.split()):
        letters = re.sub(r"[^A-Za-z]", "", tok)
        if letters and letters.isupper() and letters not in KEEP_UPPER:
            tok = re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), tok)
            if i and tok.lower() in SMALL_WORDS:
                tok = tok.lower()
        out.append(tok)
    s = " ".join(out)
    return s[0].upper() + s[1:]


def tags_for(display: str, it: dict, vegetarian: bool) -> list:
    text = display + " " + plain(it["raw"]["ingredients"])
    tags = []
    if vegetarian:
        tags.append("vegetarian")
    if PORK.search(text):
        tags.append("contains_pork")
    if BEEF.search(text):
        tags.append("contains_beef")
    return tags


# ---------------------------------------------------------------- classification

def shortname(key: str) -> str:
    return FEEDS[key][1].replace(" Menu Allergen Information", "")


def classify(feeds: dict) -> list:
    main = feeds["main"]["items"]
    others = {}
    for k, f in feeds.items():
        if k != "main":
            for it in f["items"]:
                others.setdefault(it["key"], []).append((k, f["shows_nutrition"], it))
    twins = {}
    for i, it in enumerate(main):
        twins.setdefault(it["key"], []).append(i)
    rows = []
    for i, it in enumerate(main):
        sid = it["section_id"]
        if sid not in SECTIONS or SECTIONS[sid][0] != it["section"]:
            raise SystemExit(f"main.json: section {sid} {it['section']!r} is new or renamed: add it to SECTIONS after reading it")
        row = {"i": i, "it": it, "cat": SECTIONS[sid][1], "holds": [], "mode": None, "evidence": [], "skip": None}
        rows.append(row)
        if SECTIONS[sid][1] is None:
            row["skip"] = "section left out: " + SECTION_LEFT_OUT[sid]
            continue
        same = [main[j] for j in twins[it["key"]] if j != i]
        if any(j["figs"] != it["figs"] or j["contains"] != it["contains"] or j["may"] != it["may"] for j in same
               if SECTIONS[j["section_id"]][1] is not None):
            row["holds"].append("the standard menu lists this name twice with different figures or allergens")
        elif same and twins[it["key"]][0] != i:
            row["skip"] = "identical repeat of an earlier row"
            continue
        agree, differ = [], []
        for k, shows, o in others.get(it["key"], []):
            if o["figs"] == it["figs"] and o["contains"] == it["contains"] and o["may"] == it["may"]:
                agree.append((k, shows))
            else:
                differ.append((k, shortname(k) + (" %s kcal" % o["figs"][0] if o["figs"] != it["figs"] else " allergens")))
        if differ:
            row["holds"].append("figures or allergens differ on other Tenpin menus (the standard menu: %s kcal; %s)" % (it["figs"][0], "; ".join(sorted({d for _, d in differ}))))
        shown_on = sorted({shortname(k) for k, s in agree if s})
        pdf = PDF.get((it["section"], it["name"]))
        pdf_ok = None
        if pdf:
            pdf_ok = int(Decimal(it["energy"]).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) in pdf[0]
            if not pdf_ok:
                row["holds"].append("Tenpin's printed menu shows %s kcal; the menu data shows %s" % (" / ".join(map(str, pdf[0])), shown(it["energy"])))
        manual = MANUAL_HOLD.get((it["section"], it["name"]))
        if manual:
            row["holds"].append(manual)
        row["shown_on"], row["pdf"], row["pdf_ok"] = shown_on, pdf, pdf_ok
        row["problems"] = allergen_problems(it)
        for p in row["problems"]:
            row["holds"].append(p)
        if shown_on:
            row["mode"] = "full"
            row["evidence"].append("shown on " + ", ".join(shown_on))
        elif pdf_ok:
            row["mode"] = "kcal"
        if pdf_ok:
            row["evidence"].append("printed menu %s kcal" % pdf[0][0])
        if row["mode"] is None and not row["holds"]:
            row["skip"] = "no Tenpin page shows its nutrition and the printed menu does not print it"
    return rows


def build(feeds_dir: Path, checked_on: str, out: Path = None, report: bool = False) -> None:
    feeds = {k: load_feed(feeds_dir, k) for k in FEEDS}
    rows = classify(feeds)
    items, holdback, allergen_rows = [], [], []
    used = set()
    counts = {"full": 0, "kcal": 0, "held": 0, "skip": 0}
    for r in rows:
        it = r["it"]
        if r["skip"] is not None:
            counts["skip"] += 1
            if report:
                print(f"SKIP  {r['cat'] or '-':22} {it['name']!r}: {r['skip']}")
            continue
        display = DISPLAY.get((it["section"], it["name"])) or tidy(it["name"])
        base = slug(display)
        item_id, n = base, 1
        while item_id in used:
            n += 1
            item_id = f"{base}-{n}"
        used.add(item_id)
        mode = r["mode"]
        held = bool(r["holds"])
        figs = dict(zip(NUTRIENTS, it["figs"]))
        d = {"id": item_id, "name": display, "category": r["cat"], "serving": "", "tags": "|".join(tags_for(display, it, bool(r["pdf"] and r["pdf"][1]))),
             "limited_time": r["cat"] in LIMITED, "rankable": mode == "full" and not ADD_ON.match(it["name"]) and r["cat"] not in ("Sauces", "Syrups"),
             "notes": "; ".join(r["evidence"] + [f"portion {it['weight']:g} g in the feed (not published)"] + (["HELD: " + "; ".join(r["holds"])] if held else []))}
        if mode == "full" or (held and r["shown_on"]):
            for n_, col in COLUMN.items():
                d[col] = figs[n_]
        else:
            d["calories"] = str(r["pdf"][0][0]) if (r["pdf"] and r["pdf_ok"]) else figs["Energy"]
        if held:
            holdback.append((item_id, "; ".join(r["holds"])))
            counts["held"] += 1
        else:
            counts[mode] += 1
        items.append(d)
        c, m = it["contains"], it["may"]
        kc, cereals, nuts = allergen_words(sorted(c), f"{it['name']} contains", ALLERGEN_WORDS)
        km, _, _ = allergen_words(sorted(m), f"{it['name']} may contain", ALLERGEN_WORDS)
        d["allergens"] = {"contains": kc, "may_contain": km, "cereals": cereals, "nuts": nuts}
        if report:
            print(f"{'HELD' if held else mode.upper():5} {r['cat']:22} {display!r:52} {d.get('calories', '')!s:>8} {'|'.join(r['evidence'])}" + (f"  !! {'; '.join(r['holds'])}" if held else ""))
    guide = {"title": GUIDE_TITLE, "url": SOURCE_URL, "checked_on": checked_on, "may_contain_published": True}
    if len(NOTE) >= 400:
        raise SystemExit(f"NOTE is {len(NOTE)} characters: shorten it (limit 400)")
    out_dir = write_chain_folder(chain_id=CHAIN_ID, name="Tenpin", cuisine="Bowling diner", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                                 checked_on=checked_on, aliases=["tenpin", "tenpin bowling", "tenpin ltd"], items=items, out=out, note=NOTE,
                                 holdback=holdback, allergen_guide=guide, nutrition_level="mixed")
    print(f"wrote {len(items)} rows to {out_dir}: {counts['full']} full + {counts['kcal']} calories-only published, {counts['held']} held back, "
          f"{counts['skip']} of {len(rows)} standard-menu items left out")
    if (counts["full"], counts["kcal"], counts["held"], counts["skip"]) != EXPECTED_COUNTS:
        raise SystemExit(f"the classification changed: got {(counts['full'], counts['kcal'], counts['held'], counts['skip'])}, expected {EXPECTED_COUNTS}: "
                         "read the --report output, then update EXPECTED_COUNTS")


EXPECTED_COUNTS = (33, 20, 46, 41)  # (full, calories only, held back, left out): reviewed 2026-10-08


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--feeds", type=Path, required=True, help="folder with main.json, halal.json, fountain.json, printworks.json, clydebank.json")
    ap.add_argument("--checked-on", required=True, help="the day the feeds were read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the five feeds into --feeds first")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--report", action="store_true", help="print one line per standard-menu item")
    args = ap.parse_args()
    if args.fetch:
        fetch_feeds(args.feeds)
    for k in FEEDS:
        print(f"{k}.json sha256 {sha256_file(args.feeds / (k + '.json'))}")
    build(args.feeds, args.checked_on, args.out, args.report)


if __name__ == "__main__":
    main()
