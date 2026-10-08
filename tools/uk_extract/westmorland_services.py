#!/usr/bin/env python3
"""Build data/source/westmorland-services/ from the Westmorland Family's own food data portals (Civica Food Data Hub / "Saffron").

    python3 tools/uk_extract/westmorland_services.py --cache DIR --products DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Sources (one portal per site, all the same platform as english_heritage.py; robots.txt answers 404 = no rules; no login):
    https://tebayservices.mysaffronportal.com/Menus      Tebay Services (15 menus)
    https://gloucesterservices.mysaffronportal.com/Menus Gloucester Services (13 menus)
    https://cairnlodgeservices.mysaffronportal.com/Menus Cairn Lodge Services (12 menus)
    https://rheged.mysaffronportal.com/Menus             Rheged (5 menus)
Every menu page is server-rendered HTML (westmorland_services_pages.py) and shows each dish TWICE (a narrow list and a wide table); both
renderings are parsed with different code and must agree on every figure and every allergen mark. --fetch downloads the list pages and
every menu once into --cache, and every needed dish page (/Products/<id>) once into --products (browser User-Agent, one request per second);
without it the script reads the two folders only.

WHAT IS PUBLISHED. The portals list 45 menus. Only the menus of food and drink prepared and sold for eating at the sites are published
(PUBLISH_MENUS: each site's Hot Food, Cold Food and Deli, Bakery, Children's Items, Drinks, Made Without Gluten menus, Tebay's/Gloucester's
Bakery and Desserts, Cairn Lodge's Quick Kitchen, Rheged Cafe and Rheged Create). Left out of the published list but still READ for the
"identical wherever printed" test below: the farm shops (bought-in products from dozens of producers, most with zero placeholders for fat,
saturates, sugars and salt), the filling stations, Tebay's Butchery (raw meat: no nutrition printed), the Deli and the Rheged Meeting Room
(a pre-booked catering menu). A dish published from a kitchen menu that is ALSO printed in one of those menus with different figures is left out.

WHAT THE PORTAL PRINTS PER DISH ("Each portion contains"): energy as "583kcal (2439kJ)", Fat, Saturates, Sugars, Salts (grams) and the
allergen marks of the 14 UK allergens ("Contains X" / "May Contain X" / "Does not contain X", with the named cereals and tree nuts nested
under them). The dish's own page (/Products/<id>) repeats those figures and ALSO prints the per-portion Carbohydrate, Fibre and Protein
columns (the menu pages never show them), so this is a FULL-nutrition chain: protein_g, carbs_g and fiber_g are copied from the dish page's
"Per <portion>" column, exactly as printed. A dish page that disagrees with the menu page about any of the six menu figures or about any
allergen word stops the run. The portal fills fat, saturates, sugars, salt (and often carbohydrate/protein) with 0.0 where a supplier never
supplied the data (a 341 kcal cake with 0.0 for everything else): those dishes are not data and are left out (listed in the run's output).
A dish with no nutrition at all (cocktails, three juices) is left out as well.

THE MENUS DIFFER BY SITE: the same dish name often has different figures at different sites. Founder's rule: publish a dish ONLY when every
one of its printed figures (kcal, kJ, fat, saturates, sugars, salt, and from the dish pages protein, carbohydrate, fibre) and its allergen
marks (contains / may contain, with the named cereals and nuts) are identical in EVERY menu that prints that dish name (all 45 menus; a
printed row with no nutrition or only placeholders is not data and is ignored); differing figures are never merged, picked from or
averaged, the dish is left out (and listed in the run's output). Names are compared exactly as printed except for capitalisation, spaces,
"&" / "and" and punctuation. A dish printed in one menu only is published from that menu. The same dish listed twice in one menu with
identical figures counts once.

Allergens (docs/DATA.md "Allergens") are complete: every published dish has its marks from the same portal page. The portal never prints a
"not known" state, so a dish with no allergen line at all is a dish the portal lists as free of all 14 (the dish page's ingredient list is
used only as a tripwire: a dish whose ingredient text names an allergen in capitals that its allergen marks do not contain stops the run).
The named cereals and tree nuts printed under a "Contains" line are published; named ones printed only as "May Contain" cannot be expressed,
so a dish that contains one nut or cereal and MAY contain others shows only the generic allergen (gluten / nuts, "contains"): the named
kinds are dropped by common.write_allergens (the script lists the key in may_contain too) so the may-contain of the others is not hidden.

Tags: the portal prints no diet flags, so `vegetarian` is only set when the dish NAME says vegan/vegetarian (and no fish, crustacean or
mollusc allergen contradicts it). contains_pork / contains_beef only when the dish NAME says so (ingredients are not read).

The portal prints "0.0" for a figure nobody entered as well as for a true zero (one 341 kcal cake prints 0.0 for everything but its energy), so a
saturates, sugars, salt or fibre value printed exactly "0.0" is left blank ("not published"); protein, carbohydrate and fat are kept because the
energy check validates them. A dish with neither an allergen line nor an ingredient list has unknown allergens (not "none") and is held back.

Sanity (docs/UK_DATA_PLAYBOOK.md): HOLDBACK names dishes whose OWN figures are impossible or absurd for one portion; they stay in items.csv
and are listed in holdback.csv (never corrected). The script stops if a sanity detector finds anything not in HOLDBACK.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import westmorland_services_pages as pages  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "westmorland-services"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
PORTALS = [  # (portal host name, site label)
    ("tebayservices", "Tebay Services"),
    ("gloucesterservices", "Gloucester Services"),
    ("cairnlodgeservices", "Cairn Lodge Services"),
    ("rheged", "Rheged"),
]
SITE = dict(PORTALS)
EXPECTED_MENUS = {"tebayservices": 15, "gloucesterservices": 13, "cairnlodgeservices": 12, "rheged": 5}
SOURCE_URL = "https://tebayservices.mysaffronportal.com/Menus"
SOURCE_TITLE = ("Westmorland Family food data portals (Tebay Services, Gloucester Services, Cairn Lodge Services, Rheged): allergen and nutritional "
                "information, Civica Food Data Hub (accessed {checked_on}, no date shown)")
ALLERGEN_GUIDE_TITLE = ("Westmorland Family allergen and nutritional information, Civica Food Data Hub portals: tebayservices.mysaffronportal.com, "
                        "gloucesterservices.mysaffronportal.com, cairnlodgeservices.mysaffronportal.com, rheged.mysaffronportal.com "
                        "(accessed {checked_on}, no date shown)")
ALLERGEN_GUIDE_URL = SOURCE_URL
MAY_CONTAIN_PUBLISHED = True
NAME = "Westmorland Services"
CUISINE = "British cafe"
ALIASES = ["westmorland services", "westmorland family", "tebay services", "tebay motorway services", "tebay services north",
           "tebay services south", "gloucester services", "gloucester services north", "gloucester services south",
           "gloucester services m5", "cairn lodge services", "cairn lodge", "rheged", "rheged centre", "rheged cafe"]

# Menus whose dishes are published (path as the portal links it). Every other menu is read only for the identical-wherever-printed test.
PUBLISH_MENUS = {
    "tebayservices": ["/Menus/Details/TSHTFOOD", "/Menus/Details/TSCLDFOOD", "/Menus/Details/TSCAKE", "/Menus/Details/TSCHILD",
                      "/Menus/Details/TSDNKS", "/Menus/Details/MWGTEBKIT"],
    "gloucesterservices": ["/Menus/Details/GLHTFOOD", "/Menus/Details/GSCOLDFD", "/Menus/Details/GLSBAK", "/Menus/Details/GSCHILD",
                           "/Menus/Details/GLSDRNKS", "/Menus/Details/MWGGLOKIT"],
    "cairnlodgeservices": ["/Menus/Details/CLSHTFOOD", "/Menus/Details/CLSCOLDFD", "/Menus/Details/CLSBAK", "/Menus/Details/CLSCHD",
                           "/Menus/Details/CLSDRNK", "/Menus/Details/CAIRNQK", "/Menus/Details/MWGCAIKIT"],
    "rheged": ["/Menus/Details/RHEGcafe", "/Menus/Details/RHEGcreate"],
}
EXPECTED = dict(  # counts over the whole portal set; the run stops when the portals change
    menus=45, menu_rows=3262, publish_rows=847, distinct_names=1431, candidates=318, conflicts=83, products=559, published=318)

NOTE = ("Read from the Tebay, Gloucester, Cairn Lodge and Rheged food portals (kitchens and cafes only, not shops or filling stations). "
        "Menus differ by site, so a dish is listed only if its figures and allergens are identical wherever the portals print it (dishes "
        "that differ are left out); it may not be sold at every site. Named nuts and cereals a dish only may contain aren't listed.")

CATEGORY = {  # portal course name -> (category shown, rankable); display order = order of first appearance below
    "Breakfast": ("Breakfast", True), "Brunch": ("Breakfast", True), "Deli Breakfast": ("Breakfast", True),
    "Deli Breakfast-Tebay North": ("Breakfast", True), "QK Breakfast Baps": ("Breakfast", True),
    "Porridge and Toppings": ("Porridge & Toppings", False),
    "Lunch": ("Lunch", True), "Hot Food": ("Hot Food", True), "Individual Pies and Sausage Rolls": ("Pies & Sausage Rolls", True),
    "Hotdogs": ("Hotdogs", True), "Soups": ("Soups", True),
    "Sandwiches": ("Sandwiches", True), "Hot Sandwiches": ("Sandwiches", True),
    "Salad Main Items": ("Wraps & Salad Mains", True), "Salads": ("Salads", True), "Salad Boxes": ("Salads", True),
    "Food To Go": ("Food to Go", True), "Planet Kuku": ("Savoury Bites", False),
    "Sides": ("Sides", True), "Extras": ("Extras", False), "Add Ons": ("Extras", False), "Condiments": ("Condiments", False),
    "Children's Cold Food": ("Children's", False), "Children's Hot Food": ("Children's", False), "Children's Dishes": ("Children's", False),
    "Hot Pudding": ("Desserts", False), "Desserts": ("Desserts", False), "Desserts Cold Production": ("Desserts", False),
    "Ice Cream": ("Ice Cream", False),
    "Biscuits": ("Cakes & Bakes", False), "Cakes": ("Cakes & Bakes", False), "Scones": ("Cakes & Bakes", False), "Tray bakes": ("Cakes & Bakes", False),
    "Cold Drinks": ("Cold Drinks", False), "Hot Drinks": ("Hot Drinks", False),
}
CATEGORY_ORDER = ["Breakfast", "Porridge & Toppings", "Lunch", "Hot Food", "Pies & Sausage Rolls", "Hotdogs", "Soups", "Sandwiches",
                  "Wraps & Salad Mains", "Salads", "Food to Go", "Savoury Bites", "Sides", "Extras", "Condiments", "Children's", "Desserts",
                  "Ice Cream", "Cakes & Bakes", "Cold Drinks", "Hot Drinks"]
# Dishes whose course says "meal" but which are an accompaniment or a part (editorial, name -> rankable); everything else follows CATEGORY.
NOT_A_MEAL = {  # accompaniments, parts and snacks filed under a meal course (editorial: they are never suggested by "Best for you")
    "White Milk Roll", "Fresh Fruit - Apple", "Banana", "Oranges", "White Bread", "Farmhouse White Bread", "Harvester Seeded Bread",
    "Pain De Campagne", "Scottish Blossom Honey", "Cornflakes", "Rice Krispies", "Weetabix", "Bran Flakes", "Luxury Museli", "Homemade Granola",
    "Chips", "Mashed Potato", "Garden Peas", "Cauliflower Cheese (Sunday Lunch)", "Yorkshire Pudding", "Red Onion Marmalade", "Gravy",
    "Roast Potatoes", "Wilted Greens", "Roasted Beetroot & Dukkah Seed", "Garlic & Thyme Roasties", "Braised Red Cabbage",
    "Thyme Roasted Carrots", "Cauliflower Cheese", "Dry Cure Streaky Bacon", "Sourdough Bloomer", "Small Soup Roll", "Focaccia", "Milk Roll",
    "Made without Gluten Tortilla", "Money Shot Sauce", "Sweet Chilli & Tomato Relish", "British Strawberries and Melon",
    "Crudites & Hummus Snack Pot",
}
SALT_INGREDIENT = re.compile(r"(?<![A-Za-z-])salt\b(?! free)", re.I)  # "Salt", "Sea Salt" as an ingredient (not "unsalted", "salt-free")
KIDS_NAME = re.compile(r"^(kids?|child|childs|children's)\b|\b(kids?|child)$", re.I)  # children's portions are never suggested

PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausage|sausages|pepperoni|salami|chorizo|pancetta|prosciutto|chipolatas|pigs in blankets)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
VEGGIE_NAME = re.compile(r"\b(vegan|vegetarian)\b", re.I)
MEATISH = re.compile(r"\b(pie|lasagne|kofta|hotdog|scotch egg|haggis|black pudding|breakfast|burger|meatball|mince|carvery)\b", re.I)  # meat dishes whose name does not say which meat

# Dishes held back: (name as printed) -> why. Figures are quoted exactly as printed (identical wherever the dish is printed).
HOLDBACK = {  # dishes whose own printed figures contradict each other (the reason text is generated from the figures and the detector that flags them)
    "Cauliflower & Smoked Wensleydale Soup", "Chocolate & Caramel Cookie", "Falafel & Tahini Grains Salad",
    "Green Tea, Lemon,Ginger & Honey Iced Tea", "Single Origin Hot Chocolate", "Mocha", "Regular Masala Chai", "English Wildflower Honey",
    "Seeded Sourdough Toast", "White Sourdough Toast", "Peach and Raspberry Compote", "Gloucester Butchers Breakfast",
    "Cumberland Sausage Meal", "Sausage & Bacon Bap", "Brie & Cranberry Focaccia", "Harissa Chickpea & Sweet Potato Salad",
    "Granola Breakfast Glass", "Masala Chai Regular", "Regular Dark Hot Chocolate", "Large Dark Hot Chocolate", "Regular Milk Hot Chocolate",
    "Large Milk Hot Chocolate", "Vanilla Syrup", "Flavouring Syrup", "Pumpkin Spice Syrup",
}
# Dishes held back because their ALLERGEN marks contradict the dish itself (the audit's name-implies-* flags, re-read by a second
# reader on 2026-10-08): name -> why. Never corrected; restoring one is deleting its line here once the portal confirms.
HOLDBACK_ALLERGEN = {
    "Strawberry & Pistachio Polenta Cake": ("The portal prints no gluten mark (neither contains nor may contain) for a cake and prints no ingredient "
                                            "list for it to confirm that it is made without wheat (it names Almonds and Pistachio Nuts only); "
                                            "allergens are safety information, so it is left out until the portal confirms"),
}
EXPLORE = False  # set by --explore: print the sanity flags instead of stopping


def norm(name: str) -> str:
    """Dish-name key: capitalisation, spacing, '&'/'and' and punctuation ignored."""
    s = name.casefold().replace("&", " and ").replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "", s)


def num(s: str) -> float:
    return float(s.lstrip("<"))


# ---------------------------------------------------------------------------------------------------------- fetching
def _get(url: str, delay_state: dict) -> bytes:
    wait = 1.0 - (time.time() - delay_state.get("last", 0.0))
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(3):
        try:
            data = urllib.request.urlopen(req, timeout=60).read()
            break
        except urllib.error.HTTPError as e:
            raise SystemExit(f"STOP: {url} answered HTTP {e.code}. A refusal is never worked round: download the page in a browser and put it in the cache folder instead.")
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:  # a dropped connection is not a refusal: wait and retry twice
            if attempt == 2:
                raise SystemExit(f"STOP: {url} failed three times ({e!r})")
            time.sleep(10)
    delay_state["last"] = time.time()
    return data


def check_robots(host_url: str, delay_state: dict) -> str:
    """Each portal's robots.txt answers 404 (no rules). If one ever has rules, obey them."""
    url = host_url + "/robots.txt"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    wait = 1.0 - (time.time() - delay_state.get("last", 0.0))
    if wait > 0:
        time.sleep(wait)
    try:
        body = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        delay_state["last"] = time.time()
        if e.code == 404:
            return f"{host_url}/robots.txt: HTTP 404 (no rules)"
        raise SystemExit(f"STOP: {url} answered HTTP {e.code}")
    delay_state["last"] = time.time()
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(body.splitlines())
    for path in ("/Menus", "/Menus/Details/x", "/Products/1"):
        if not rp.can_fetch(USER_AGENT, host_url + path):
            raise SystemExit(f"STOP: {url} disallows {path}:\n{body}")
    return f"{host_url}/robots.txt allows /Menus"


def host_of(portal: str) -> str:
    return f"https://{portal}.mysaffronportal.com"


def load_pages(cache: Path, do_fetch: bool) -> tuple:
    """-> ([(portal, slug_path, menu title, html, sha256)], log lines). Reads (and with do_fetch downloads) the list pages and menus."""
    state: dict = {}
    log = []
    out = []
    for portal, _ in PORTALS:
        folder = cache / portal
        folder.mkdir(parents=True, exist_ok=True)
        if do_fetch:
            log.append(check_robots(host_of(portal), state))

        def read(fname: str, url: str) -> bytes:
            path = folder / fname
            if not path.exists():
                if not do_fetch:
                    raise SystemExit(f"{path} is missing: run with --fetch (one polite download of each page)")
                path.write_bytes(_get(url, state))
            return path.read_bytes()

        menus = []
        total = None
        page = 1
        while True:
            data = read(f"menus-page{page}.html", f"{host_of(portal)}/Menus" + (f"?page={page}" if page > 1 else ""))
            text = data.decode("utf-8")
            first, last, tot = pages.list_summary(text)
            total = tot if total is None else total
            found = pages.parse_menu_list(text)
            if len(found) != last - first + 1:
                raise SystemExit(f"{portal} Menus page {page}: {len(found)} menus linked but the page says items {first} to {last}")
            menus.extend(found)
            if last >= tot:
                break
            page += 1
        if len(menus) != total or total != EXPECTED_MENUS[portal]:
            raise SystemExit(f"{portal} lists {total} menus ({len(menus)} read); expected {EXPECTED_MENUS[portal]}. Menus were added or removed: re-check PUBLISH_MENUS and the script's counts")
        if len({m[0] for m in menus}) != len(menus):
            raise SystemExit(f"{portal}: a menu is linked twice")
        for slug_path, title in menus:
            fname = "menu-" + re.sub(r"[^a-z0-9]+", "-", slug_path.split("/Menus/Details/")[1].lower()).strip("-") + ".html"
            data = read(fname, host_of(portal) + urllib.parse.quote(slug_path))
            out.append((portal, slug_path, title, data.decode("utf-8"), hashlib.sha256(data).hexdigest()))
    missing = [(p, s) for p, ss in PUBLISH_MENUS.items() for s in ss if (p, s) not in {(o[0], o[1]) for o in out}]
    if missing:
        raise SystemExit(f"PUBLISH_MENUS names menus the portals no longer list: {missing}")
    return out, log


# ---------------------------------------------------------------------------------------------------------- reading
def table_matches_list(a: dict, b: dict) -> bool:
    same = (a["product_id"], a["name"], a["kcal"], a["kj"], a["fat"], a["sat_fat"], a["sugar"], a["salt"]) == \
           (b["product_id"], b["name"], b["kcal"], b["kj"], b["fat"], b["sat_fat"], b["sugar"], b["salt"])
    same = same and {w for w, s in a["states"].items() if s == "contains"} == {h for h, v in b["marks"].items() if v == "contains"}
    same = same and {w for w, s in a["states"].items() if s == "may"} == {h for h, v in b["marks"].items() if v == "may"}
    same = same and {w for (_, w), s in a["sub_states"].items() if s == "contains"} == set(b["sub_contains"])
    same = same and {w for (_, w), s in a["sub_states"].items() if s == "may"} == set(b["sub_may"])
    return same


def read_menus(loaded: list) -> tuple:
    """Parse every menu with both readers and require them to agree on every dish. Returns (menus, log)."""
    menus, log = [], []
    for portal, slug_path, list_title, text, sha in loaded:
        where = f"{portal}{slug_path}"
        menu = pages.parse_menu(text, where)
        if menu["title"] != list_title:
            raise SystemExit(f"{where}: page heading {menu['title']!r} differs from the menu list's {list_title!r}")
        if all(d["kcal"] is None for d in menu["items"]):
            log.append(f"{where} ({list_title}): none of its {len(menu['items'])} dishes has nutrition: read for names only")
        else:
            rows = pages.parse_menu_table(text, where)
            if len(rows) != len(menu["items"]):
                raise SystemExit(f"{where}: the list view has {len(menu['items'])} dishes, the table view {len(rows)}")
            for a, b in zip(menu["items"], rows):
                if not table_matches_list(a, b):
                    raise SystemExit(f"{where}: dish {a['name']!r}: the list view and the table view disagree: {a} / {b}")
        menu.update(portal=portal, slug=slug_path, sha=sha, publish=slug_path in PUBLISH_MENUS[portal])
        for d in menu["items"]:
            d["menu"] = menu
        menus.append(menu)
    return menus, log


def signature(d: dict) -> tuple:
    return (d["kcal"], d["kj"], d["fat"], d["sat_fat"], d["sugar"], d["salt"], tuple(sorted(d["states"].items())), tuple(sorted(d["sub_states"].items())))


def row_kind(d: dict) -> str:
    """'nodata' (no nutrition printed), 'placeholder' (the portal's 0.0 fill-ins) or 'ok'."""
    if d["kcal"] is None:
        return "nodata"
    vals = {k: d[k] for k in ("kcal", "kj", "fat", "sat_fat", "sugar", "salt")}
    if num(vals["kcal"]) >= 20 and all(num(vals[k]) == 0 for k in ("fat", "sat_fat", "sugar", "salt")):
        return "placeholder"      # a 20+ kcal dish with nothing in fat, saturates, sugars and salt
    if all(num(v) == 0 and not v.startswith("<") for v in vals.values()):
        return "placeholder"      # kcal, kJ, fat, saturates, sugars and salt all printed 0.0
    return "ok"


# ---------------------------------------------------------------------------------------------------------- allergens
def allergen_row(d: dict, where: str) -> dict:
    """Printed words -> the 14 keys (+ named cereals / nuts that the dish CONTAINS)."""
    heads = set(pages.TABLE_ALLERGEN_HEADS)
    for word in d["states"]:
        if word not in heads:
            raise SystemExit(f"{where}: top-level allergen {word!r} is not one of the 14 printed heads: add it to the script before publishing")
    contains_words = sorted(w for w, s in d["states"].items() if s == "contains")
    may_words = sorted(w for w, s in d["states"].items() if s == "may")
    not_words = {w for w, s in d["states"].items() if s == "not"}
    for (parent, word), s in d["sub_states"].items():
        if parent not in d["states"]:
            raise SystemExit(f"{where}: sub-allergen {s!r} {word!r} under {parent!r}, which the dish does not print")
        if parent not in ("Cereals containing Gluten", "Nuts"):
            raise SystemExit(f"{where}: named sub-allergens under {parent!r}: add them to the script before publishing")
        if s == "contains" and d["states"][parent] != "contains":
            raise SystemExit(f"{where}: sub-allergen 'Contains {word}' under {parent!r}, which the dish does not 'Contain'")
        if s == "not":
            raise SystemExit(f"{where}: 'Does not contain {word}' under {parent!r}: not understood")
    contains, _, _ = allergen_words(contains_words, where)
    may, _, _ = allergen_words(may_words, where)
    # 'Does not contain Cereals containing Gluten' + 'May Contain Barley' = the dish may contain gluten (barley is a gluten cereal)
    for (parent, word), s in d["sub_states"].items():
        if s == "may" and parent in not_words:
            may |= allergen_words([parent], where)[0]
    _, cereals, _ = allergen_words(sorted(w for (p, w), s in d["sub_states"].items() if p == "Cereals containing Gluten" and s == "contains"), where)
    _, _, nuts = allergen_words(sorted(w for (p, w), s in d["sub_states"].items() if p == "Nuts" and s == "contains"), where)
    return dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts)


def lost_may_specifics(d: dict) -> list:
    """Named cereals / nuts printed only as 'May Contain' under a key the dish contains (not expressible in allergens.csv)."""
    return sorted(w for (p, w), s in d["sub_states"].items() if s == "may" and d["states"].get(p) == "contains"
                  and d["sub_states"].get((p, w)) == "may" and not any(s2 == "contains" and w2 == w for (_, w2), s2 in d["sub_states"].items()))


def page_allergen_words(d: dict) -> tuple:
    """(contains words, may words, not words) the list view prints, top-level and named alike, as the dish page lists them."""
    c = {w for w, s in d["states"].items() if s == "contains"} | {w for (_, w), s in d["sub_states"].items() if s == "contains"}
    m = {w for w, s in d["states"].items() if s == "may"} | {w for (_, w), s in d["sub_states"].items() if s == "may"}
    n = {w for w, s in d["states"].items() if s == "not"} | {w for (_, w), s in d["sub_states"].items() if s == "not"}
    return c, m, n


# ---------------------------------------------------------------------------------------------------------- build
def build(menus: list) -> dict:
    all_rows = [d for m in menus for d in m["items"]]
    publish_rows = [d for d in all_rows if d["menu"]["publish"]]
    # ok rows of every menu, grouped by dish name
    groups: dict = collections.OrderedDict()
    for d in all_rows:
        d["kind"] = row_kind(d)
        groups.setdefault(norm(d["name"]), []).append(d)
    candidates, conflicts, no_data = [], [], []
    for key, rows in groups.items():
        if not any(r["menu"]["publish"] for r in rows):
            continue
        ok = [r for r in rows if r["kind"] == "ok"]
        pub_ok = [r for r in ok if r["menu"]["publish"]]
        if not pub_ok:
            no_data.append((key, rows))
            continue
        if len({signature(r) for r in ok}) > 1:
            conflicts.append((key, ok))
        else:
            candidates.append((key, ok))
    stats = dict(menu_rows=len(all_rows), publish_rows=len(publish_rows), distinct_names=len(groups), candidates=len(candidates),
                 conflicts=len(conflicts))
    return dict(candidates=candidates, conflicts=conflicts, no_data=no_data, stats=stats)


def check_expected(stats: dict, extra: dict) -> None:
    got = {**stats, **extra}
    bad = {k: (v, got[k]) for k, v in EXPECTED.items() if k in got and v != got[k]}
    if bad:
        raise SystemExit("The portals' counts changed (key: (expected, found)); re-check the script's constants and note.txt:\n  " + "\n  ".join(f"{k}: {v}" for k, v in bad.items()))


# ---------------------------------------------------------------------------------------------------------- dish pages
def product_ids(candidates: list) -> list:
    out = []
    for key, ok in candidates:
        for r in ok:
            if r["menu"]["publish"]:
                pair = (r["menu"]["portal"], r["product_id"])
                if pair not in out:
                    out.append(pair)
    return out


def load_products(ids: list, folder: Path, do_fetch: bool) -> dict:
    """{(portal, product id): html} for every dish page needed, from --products (downloaded politely when --fetch is given)."""
    state: dict = {}
    out = {}
    for portal, pid in ids:
        sub = folder / portal
        sub.mkdir(parents=True, exist_ok=True)
        path = sub / (re.sub(r"[^A-Za-z0-9._-]", "_", pid) + ".html")
        if not path.exists():
            if not do_fetch:
                raise SystemExit(f"{path} is missing: run with --fetch (one polite download of each dish page)")
            path.write_bytes(_get(f"{host_of(portal)}/Products/{urllib.parse.quote(pid)}", state))
        out[(portal, pid)] = path.read_text(encoding="utf-8")
    return out


CAPS_ALLERGEN = {  # ingredient words printed in capitals -> the portal's allergen head they must appear under (tripwire only)
    "MILK": "Milk", "EGG": "Eggs", "EGGS": "Eggs", "WHEAT": "Cereals containing Gluten", "BARLEY": "Cereals containing Gluten",
    "RYE": "Cereals containing Gluten", "OATS": "Cereals containing Gluten", "OAT": "Cereals containing Gluten", "SOYA": "Soya", "SOY": "Soya",
    "MUSTARD": "Mustard", "CELERY": "Celery", "SESAME": "Sesame", "FISH": "Fish", "PEANUT": "Peanuts", "PEANUTS": "Peanuts",
    "LUPIN": "Lupin", "CRUSTACEANS": "Crustaceans", "MOLLUSCS": "Molluscs", "ALMONDS": "Nuts", "HAZELNUTS": "Nuts", "WALNUTS": "Nuts",
    "CASHEW": "Nuts", "CASHEWS": "Nuts", "PISTACHIO": "Nuts", "PISTACHIOS": "Nuts", "PECANS": "Nuts",
}


def check_products(cands: list, products: dict) -> dict:
    """Compare every candidate dish with its dish page(s). Returns dict(result={key: dict(pr, ids, row)}, conflict=[...], tripwire=[...]).
    A dish whose several pages (one per portal id) disagree about protein / carbohydrate / fibre / portion weight is a conflict."""
    result, conflict, tripwire = {}, [], []
    for key, ok in cands:
        per_id = {}
        for r in ok:
            if not r["menu"]["publish"]:
                continue
            pid = (r["menu"]["portal"], r["product_id"])
            if pid in per_id:
                continue
            pr = pages.parse_product(products[pid], f"{pid[0]} {pid[1]}")
            where = f"{r['name']!r} ({pid[0]} product {pid[1]})"
            if pr["name"] != r["name"] and not pr["name"].startswith(r["name"]):
                raise SystemExit(f"{where}: dish page heading {pr['name']!r} differs from the menu's {r['name']!r}")
            for k in ("kcal", "kj", "fat", "sat_fat", "sugar", "salt"):
                if pr[k] != r[k]:
                    raise SystemExit(f"{where}: {k} is {r[k]} on the menu but {pr[k]} on the dish page")
            for k in ("kcal", "fat", "sat_fat", "sugar", "salt"):
                if pr["portion_table"][k] != r[k]:
                    raise SystemExit(f"{where}: {k} is {r[k]} on the menu but {pr['portion_table'][k]} in the dish page's nutrition table")
            c, m, n = page_allergen_words(r)
            if pr["contains"] != c or pr["may"] != m or pr["not_contains"] != n:
                raise SystemExit(f"{where}: allergens differ: menu {sorted(c)} / {sorted(m)} / {sorted(n)}, dish page {sorted(pr['contains'])} / {sorted(pr['may'])} / {sorted(pr['not_contains'])}")
            for tok in sorted(set(re.findall(r"\b[A-Z]{3,}\b", pr["ingredients"]))):
                head = CAPS_ALLERGEN.get(tok)
                if head and head not in pr["contains"] and not (head == "Nuts" and "Nuts" in pr["contains"]):
                    tripwire.append((r["name"], pid, tok, head, sorted(pr["contains"]), sorted(pr["may"])))
            per_id[pid] = (pr, r)

        def figures(pr: dict) -> tuple:
            pt = pr["portion_table"]
            return (pt["protein"], pt["carb"], pt["fibre"], pr["label"] if re.match(r"^\d+(\.\d+)?g$", pr["label"]) else "")
        if len({figures(pr) for pr, _ in per_id.values()}) > 1:
            conflict.append((key, ok, sorted({figures(pr) for pr, _ in per_id.values()})))
            continue
        pid0 = sorted(per_id)[0]
        pr, r = per_id[pid0]
        result[key] = dict(pr=pr, row=r, ids=sorted(per_id), has_ingredients=any(p_["ingredients"] for p_, _ in per_id.values()))
    return dict(result=result, conflict=conflict, tripwire=tripwire)


def numz(s: str) -> float:
    """A printed '<0.5' counts as 0, as the pipeline stores it (docs/DATA.md)."""
    return 0.0 if s.startswith("<") else float(s)


def energy_off(kc: float, est: float) -> bool:
    """The pipeline's energy check (tools/build_menus.py energy_problem): 15% off, or for under 50 kcal more than 25 above."""
    if kc >= 50:
        return abs(kc - est) / kc > 0.15
    return est > kc + 25


def sanity_flags(r: dict, pr: dict) -> list:
    """Reasons a dish's own figures cannot all be right (docs/UK_DATA_PLAYBOOK.md). Rounding is allowed for: the dish page prints
    protein and carbohydrate as whole grams, so sugars may exceed carbohydrate by up to 0.5 g, and the energy check is also passed when it
    holds with fibre counted at 2 kcal/g (the UK labelling convention, fibre being listed apart from carbohydrate)."""
    pt = pr["portion_table"]
    kc, kj = num(r["kcal"]), num(r["kj"])
    fat, sat, sug, salt = numz(r["fat"]), numz(r["sat_fat"]), numz(r["sugar"]), numz(r["salt"])
    prot, carb, fibre = numz(pt["protein"]), numz(pt["carb"]), numz(pt["fibre"])
    out = []
    if sat > fat and not r["fat"].startswith("<"):
        out.append("saturates > fat")
    elif sat > 0.5 and r["fat"].startswith("<"):
        out.append("saturates %s with fat %s" % (r["sat_fat"], r["fat"]))
    if sug > carb + 0.5:
        out.append("sugars %s > carbohydrate %s" % (r["sugar"], pt["carb"]))
    if kc >= 20 and not 3.9 < kj / kc < 4.5:
        out.append("kJ/kcal = %.2f" % (kj / kc))
    if 9 * fat > kc * 1.12 + 5:
        out.append("fat alone exceeds the calories")
    est = 4 * prot + 4 * carb + 9 * fat
    if energy_off(kc, est) and energy_off(kc, est + 2 * fibre):
        out.append("calories %s vs 4P+4C+9F = %.0f (with fibre %.0f)" % (r["kcal"], est, est + 2 * fibre))
    if kc >= 2500 or salt >= 15 or sug > 300 or fat > 200:
        out.append("absurd for one portion")
    if prot == 0 and carb == 0 and fat == 0 and kc >= 20:
        out.append("protein, carbohydrate and fat all 0 for %s kcal" % r["kcal"])
    weights = implied_weights(pr)
    if (len(weights) >= 2 and max(weights) / min(weights) > 2.0) or (weights and max(weights) > 1500):
        out.append("per-100 g column implies portions of %s g" % "/".join("%.0f" % w for w in sorted(weights)))
    if " x " in pr["label"]:
        out.append("portion label %r" % pr["label"])
    return out


def pipeline_energy_warning(r: dict, pr: dict) -> bool:
    """True when tools/build_menus.py will warn about this dish (4P+4C+9F against the calories): explained by fibre when sanity_flags is empty."""
    pt = pr["portion_table"]
    est = 4 * numz(pt["protein"]) + 4 * numz(pt["carb"]) + 9 * numz(r["fat"])
    return energy_off(num(r["kcal"]), est)


def implied_weights(pr: dict) -> list:
    """Portion weights implied by the per-100 g column, from the figures with enough resolution (whole-gram columns need 5 g or more)."""
    p100, ptn = pr["per100"], pr["portion_table"]
    implied = []
    if num(p100["kcal"]) >= 20 and num(ptn["kcal"]) >= 20:
        implied.append(num(ptn["kcal"]) / num(p100["kcal"]) * 100)
    for key, p_min, c_min in (("fat", 2, 1), ("protein", 5, 2), ("carb", 5, 2), ("salt", 0.2, 0.2)):
        if not p100[key].startswith("<") and not ptn[key].startswith("<") and num(p100[key]) >= c_min and num(ptn[key]) >= p_min:
            implied.append(num(ptn[key]) / num(p100[key]) * 100)
    return implied


def make_items(result: dict, info: dict) -> tuple:
    items, stats = [], collections.Counter()
    flagged_unexpected, held_names, held_allergen = [], set(), set()
    for key, ok in result["candidates"]:
        if key not in info["result"]:
            continue
        got = info["result"][key]
        pr, r = got["pr"], got["row"]
        pub = [x for x in ok if x["menu"]["publish"]]
        name_counts = collections.Counter(x["name"] for x in pub)
        name = sorted(name_counts, key=lambda n: (-name_counts[n], [x["name"] for x in pub].index(n)))[0]
        where = f"{name!r}"
        cats = collections.Counter()
        first_seen = []
        for x in pub:
            if x["course"] not in CATEGORY:
                raise SystemExit(f"{where}: new course name {x['course']!r}: add it to CATEGORY")
            c = CATEGORY[x["course"]][0]
            cats[c] += 1
            if c not in first_seen:
                first_seen.append(c)
        category = sorted(cats, key=lambda c: (-cats[c], first_seen.index(c)))[0]
        rankable = [v[1] for v in CATEGORY.values() if v[0] == category][0]
        if name in NOT_A_MEAL or KIDS_NAME.search(name):
            rankable = False
        allergens = allergen_row(r, where)
        lost = lost_may_specifics(r)
        if lost:
            stats["dishes with 'may contain' nuts/cereals not expressible"] += 1
            # The portal prints a CONTAINS and a MAY CONTAIN of the same allergen ("Contains Wheat" with "May Contain Barley", "Contains
            # Almonds" with "May Contain Hazelnuts"): list the key in may_contain too, so common.write_allergens drops the named kinds
            # and publishes the generic allergen (named kinds alone would hide the may-contain of the others).
            may_keys = {("gluten" if parent == "Cereals containing Gluten" else "nuts") for (parent, word), st in r["sub_states"].items()
                        if st == "may" and r["states"].get(parent) == "contains" and word in lost}
            allergens["may_contain"] = set(allergens["may_contain"]) | may_keys
        tags = []
        if VEGGIE_NAME.search(name):
            if allergens["contains"] & {"fish", "crustaceans", "molluscs"}:
                stats["vegan/vegetarian name contradicted by fish/crustacean/mollusc allergen (not tagged)"] += 1
            else:
                tags.append("vegetarian")
        if PORK.search(name) and "vegetarian" not in tags:
            tags.append("contains_pork")
        if BEEF.search(name) and "vegetarian" not in tags:
            tags.append("contains_beef")
        sites = collections.OrderedDict()
        for x in ok:
            sites.setdefault(SITE[x["menu"]["portal"]], []).append(x["menu"]["title"] + ("" if x["menu"]["publish"] else " [not published]"))
        notes = ["Printed in: " + "; ".join(f"{s}: {', '.join(sorted(set(t)))}" for s, t in sites.items()),
                 "portal ids " + ", ".join(f"{p}:{i}" for p, i in got["ids"])]
        if lost:
            notes.append("may-contain only (not in allergens.csv): " + ", ".join(lost))
        if len(got["ids"]) > 1:
            stats["same figures, several portal ids"] += 1
        if len(name_counts) > 1:
            stats["printed with different capitalisation (same figures)"] += 1
        pt = pr["portion_table"]
        salt_blank = r["salt"].startswith("<") and bool(SALT_INGREDIENT.search(pr["ingredients"]))
        if salt_blank:
            # "Salt <0.01 g" for a dish whose OWN ingredient list names salt (cornflakes, bread, halloumi, chorizo, mayonnaise ...): the
            # figure is contradicted by the portal's own ingredient text, so it is not published (the other figures are unaffected).
            notes.append(f"salt printed {r['salt']} g but the dish's own ingredient list names salt: salt not published")
            stats["salt printed '<0.01' although the ingredient list names salt (salt left blank)"] += 1
        if pt["fibre"] == "0.0":
            stats["fibre printed 0.0 (the portal's fill-in; left blank)"] += 1
        for key_, col in (("sat_fat", "sat_fat_g"), ("sugar", "sugar_g"), ("salt", "salt_g")):
            if r[key_] == "0.0":
                stats[f"{col} printed 0.0 (the portal's fill-in; left blank)"] += 1
        item = dict(_pr=pr, _row=r, name=name, category=category, calories=r["kcal"], protein_g=pt["protein"], carbs_g=pt["carb"], fat_g=r["fat"],
                    sat_fat_g=("" if r["sat_fat"] == "0.0" else r["sat_fat"]), sugar_g=("" if r["sugar"] == "0.0" else r["sugar"]), fiber_g=("" if pt["fibre"] == "0.0" else pt["fibre"]), salt_g=("" if (r["salt"] == "0.0" or salt_blank) else r["salt"]), energy_kj=r["kj"], tags="|".join(tags),
                    rankable=rankable, allergens=allergens, notes="; ".join(notes))
        w = re.match(r"^(\d+(?:\.\d+)?)g$", pr["label"])
        if w:
            item["weight_g"] = w.group(1)
        if pr["label"] == "Slice":
            item["serving"] = "1 slice"  # the page says "Each Slice contains"
        sf = sanity_flags(r, pr)
        unknown_allergens = not allergens["contains"] and not allergens["may_contain"] and not got["has_ingredients"]
        if unknown_allergens:
            sf = ["no allergen line and no ingredient text"] + sf
        if name in HOLDBACK:
            if not sf:
                raise SystemExit(f"{name!r} is in HOLDBACK but no sanity detector flags it any more: re-check")
            held_names.add(name)
            printed = (f"printed per portion: {r['kcal']} kcal, {r['kj']} kJ, protein {pt['protein']} g, carbohydrate {pt['carb']} g, "
                       f"sugars {r['sugar']} g, fat {r['fat']} g, saturates {r['sat_fat']} g, fibre {pt['fibre']} g, salt {r['salt']} g")
            if unknown_allergens:
                item["_hold_reason"] = ("The portal prints no allergen line and no ingredient list for it, so its allergens are not known (which is not the same as none); "
                                        + printed + "; left out until the portal is corrected")
            else:
                item["_hold_reason"] = "Its own figures contradict each other (" + "; ".join(sf) + "); " + printed + "; left out until the portal is corrected"
        elif name in HOLDBACK_ALLERGEN:
            item["_hold_reason"] = HOLDBACK_ALLERGEN[name] + (f"; printed per portion: {r['kcal']} kcal, {r['kj']} kJ, protein {pt['protein']} g, carbohydrate {pt['carb']} g, "
                                                              f"sugars {r['sugar']} g, fat {r['fat']} g, saturates {r['sat_fat']} g, fibre {pt['fibre']} g, salt {r['salt']} g")
            held_allergen.add(name)
        elif sf:
            flagged_unexpected.append((name, sf))
        elif pipeline_energy_warning(r, pr):
            stats["pipeline energy warnings explained by fibre (4P+4C+9F plus 2 kcal per g fibre is within 15%)"] += 1
        items.append(item)
    if flagged_unexpected and EXPLORE:
        print("SANITY FLAGS (not yet in HOLDBACK):")
        for n, f in flagged_unexpected:
            print("  ", n, f)
        flagged_unexpected = []
    if flagged_unexpected:
        raise SystemExit("Sanity detectors flag dishes that are not in HOLDBACK (decide: hold back, or explain in a comment):\n"
                         + "\n".join(f"  {n}: {f}" for n, f in flagged_unexpected))
    if held_names != set(HOLDBACK) and not EXPLORE:
        raise SystemExit(f"HOLDBACK names not found among the published dishes: {sorted(set(HOLDBACK) - held_names)}")
    if set(HOLDBACK_ALLERGEN) - held_allergen:
        raise SystemExit(f"HOLDBACK_ALLERGEN names not found among the published dishes: {sorted(set(HOLDBACK_ALLERGEN) - held_allergen)}")
    stale = sorted(NOT_A_MEAL - {it["name"] for it in items})
    if stale:
        raise SystemExit(f"NOT_A_MEAL names no published dish: {stale}")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    items.sort(key=lambda it: order[it["category"]])  # stable: dishes keep first-seen order inside a category
    return items, stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder holding (or receiving) the downloaded portal menu pages")
    ap.add_argument("--products", type=Path, required=True, help="folder holding (or receiving) the downloaded dish pages")
    ap.add_argument("--fetch", action="store_true", help="download missing pages (one request per second)")
    ap.add_argument("--checked-on", required=True, help="the day the pages were read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--explore", action="store_true", help="print what was found and stop before writing")
    args = ap.parse_args()
    global EXPLORE
    EXPLORE = args.explore
    loaded, log = load_pages(args.cache, args.fetch)
    for line in log:
        print(line)
    manifest = "".join(f"{p}{s}  {sha}\n" for p, s, _, _, sha in sorted(loaded))
    print(f"{len(loaded)} menu pages read; sha256 of the sorted '<portal><menu path>  <sha256>' list: {hashlib.sha256(manifest.encode()).hexdigest()}")
    menus, mlog = read_menus(loaded)
    for line in mlog:
        print(line)
    result = build(menus)
    ids = product_ids(result["candidates"])
    check_expected(result["stats"], dict(menus=len(menus), products=len(ids)))
    products = load_products(ids, args.products, args.fetch)
    info = check_products(result["candidates"], products)
    print(f"dish pages read: {len(products)}; dishes whose pages disagree with each other: {len(info['conflict'])}")
    if info["tripwire"]:
        print("INGREDIENT TRIPWIRE (an allergen word in capitals in the ingredient text that the dish page does not list under 'Contains'):")
        for t in info["tripwire"]:
            print("  ", t)
    items, stats = make_items(result, info)
    left_out_no_data = [(rows[0]["name"], sorted({r["kind"] for r in rows if r["menu"]["publish"]})) for key, rows in result["no_data"]]
    print(f"left out, no usable nutrition in any published menu: {len(left_out_no_data)}: "
          + "; ".join(f"{n} ({'/'.join(k)})" for n, k in left_out_no_data))
    print(f"left out because the menus (or portal ids) differ: {len(result['conflicts']) + len(info['conflict'])}")
    for key, ok in result["conflicts"]:
        values = sorted({r["kcal"] for r in ok}, key=num)
        sites = sorted({SITE[r["menu"]["portal"]] for r in ok})
        print(f"  differs: {ok[0]['name']!r} in {len(ok)} menu rows ({', '.join(sites)}), {len(values)} different kcal values ({values[0]} to {values[-1]})")
    for key, ok, sig in info["conflict"]:
        print(f"  differs (dish pages): {ok[0]['name']!r} {sig}")
    if args.explore:
        return
    check_expected({}, dict(published=len(items)))
    ids2 = [slug(it["name"]) for it in items]
    if len(set(ids2)) != len(ids2):
        dup = sorted(i for i, c in collections.Counter(ids2).items() if c > 1)
        raise SystemExit(f"Two dishes share the item id(s) {dup}: give them explicit ids")
    holdback = [(slug(it['name']), it['_hold_reason']) for it in items if "_hold_reason" in it]
    guide = {"title": ALLERGEN_GUIDE_TITLE.format(checked_on=args.checked_on), "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on,
             "may_contain_published": MAY_CONTAIN_PUBLISHED}
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt is {len(NOTE)} characters; the limit is 400")
    out = write_chain_folder(chain_id=CHAIN_ID, name=NAME, cuisine=CUISINE, source_title=SOURCE_TITLE.format(checked_on=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback, allergen_guide=guide, nutrition_level="full")
    counts = collections.Counter(it["category"] for it in items)
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {counts[c]}" for c in CATEGORY_ORDER if counts[c]))
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")
    print("tagged vegetarian:", sum("vegetarian" in it["tags"] for it in items), " pork:", sum("contains_pork" in it["tags"] for it in items),
          " beef:", sum("contains_beef" in it["tags"] for it in items), " rankable:", sum(bool(it["rankable"]) for it in items))
    not_stated = [it["name"] for it in items if MEATISH.search(it["name"]) and "contains_pork" not in it["tags"] and "contains_beef" not in it["tags"]
                  and "vegetarian" not in it["tags"]]
    print(f"meat type not stated (approximate, by name): {len(not_stated)}")


if __name__ == "__main__":
    main()
