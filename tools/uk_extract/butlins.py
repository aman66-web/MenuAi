#!/usr/bin/env python3
"""Build data/source/butlins/ from Butlin's own allergen and nutrition pages (hosted by Ten Kites on viewthe.menu).

    python3 -I tools/uk_extract/butlins.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://www.butlins.com/discover-butlins/food-and-drink/restaurants lists each restaurant's menu with an "Allergen
information" link to one viewthe.menu page per restaurant (robots.txt on viewthe.menu disallows only /fonts/, /views/ and *.less;
butlins.com allows the page). Each page holds several menus, one at a time, chosen with ?mguid=<menu id>. Every dish has a pop-up
"Nutrition (per portion)" (energy kcal and kJ, fat, saturates, carbohydrate, sugars, fibre, protein, salt), a "Suitable for" line and
"Contains:" / "May contain:" lines naming the allergens (cereals and tree nuts by kind), or the statement "This dish contains none of
the listed allergens". The pages print no date and no weights; butlins.com names the menus "Summer Menu 2026".

Menus read (14 distinct menus on five pages; --fetch saves each once, 1 request per second; DIR/<label>.html):
    nzsv Firehouse Grill        fh_main (Main menu), fh_kids (Children's meal deal), drinks (shared "Drinks" menu)
    nzwv The Beachcomber Inn    bc_main, bc_kids (Children's meal deal), bc_light (Light bites), bc_carvery, buffet ("Restaurants -
                                Buffet breakfast", shared with the Papa Johns page)
    nzpv The Diner              diner_main, diner_kids (Kiddos), diner_brunch (Bottomless brunch), diner_breakfast (read, NOT published)
    nzev Fish & Chips           fish
    nz7a Papa Johns at Butlin's papa (the resort's own menu: salad bar, pasta bar, ice cream factory; not the Papa Johns chain)
The shared "Drinks" menu was also saved through each of the other four pages and the "Buffet breakfast" through the Papa Johns page on
2026-10-08: names, sections, numbers, allergens and recipe ids were identical in every copy, so each is read once. Rock & Sole
(Skegness) links to the Fish & Chips page and has no page of its own; Burger King and Chopstix have none either: not listed.

"Menus differ per resort" (founder's note): the pages are per restaurant, not per resort, and butlins.com says where each is open
(Firehouse Grill, The Diner and Papa Johns at all three resorts; Fish & Chips at Minehead and Bognor Regis only; The Diner's breakfast at
Minehead only). A dish is a recipe: every recipe id on the 14 menus prints identical numbers and allergens wherever it appears (checked on
every run: the script stops otherwise), so each published figure is the same wherever it is printed. Left out because one resort only:
The Diner's breakfast menu and the Beachcomber Inn's "SWEET TREATS - MH ONLY" section (Minehead). Different recipes that share a name
(for example the adult and the kids' Cheesy Garlic Bread, or the same side at two restaurants) are told apart in the name by restaurant, kids
and section; recipes with the same name, numbers, serving and allergens are one item.

Numbers are copied exactly as printed by tenkites_b (thousands comma dropped); a dish with a "-" for calories, protein, carbs or fat is not
an item (the chain did not publish it). Allergens: the "Contains:/May contain:" lines are compared with the label ids the page's own
allergen filter reads (tenkites_b.allergens_from_rec); any disagreement stops the run; "Vegetarian" comes from the "Suitable for" line and
must agree with the page's label ids. Rows whose own numbers contradict each other are held back (see hold_reason), never corrected.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tb  # noqa: E402
import tenkites_c as tc  # noqa: E402
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "butlins"
SOURCE_URL = "https://www.butlins.com/discover-butlins/food-and-drink/restaurants"
SOURCE_TITLE = ("Butlin's allergen and nutrition information, \"Nutrition (per portion)\" (viewthe.menu pages linked from butlins.com: "
                "Firehouse Grill, Beachcomber Inn, The Diner, Fish & Chips, Papa Johns, buffet breakfast and drinks menus, "
                "Summer 2026 menus; accessed {checked}, no date shown)")
ALLERGEN_TITLE = "Butlin's allergen information (viewthe.menu pages linked from butlins.com: Contains / May contain per dish)"
ALIASES = ["butlins", "butlin's", "butlins bognor regis", "butlin's bognor regis", "butlins minehead", "butlin's minehead",
           "butlins skegness", "butlin's skegness", "butlins resort", "butlin's resort"]
NOTE = ("Per portion from Butlin's allergen pages for Firehouse Grill, Beachcomber Inn, The Diner (not its Minehead-only breakfast), "
        "Fish & Chips, Papa Johns, buffet breakfast and drinks. Each dish has the same figures wherever printed; not every venue is at "
        "every resort. Rock & Sole, Burger King and Chopstix are not listed. Dishes without protein, carbs and fat are left out.")

# The pages (viewthe.menu code -> base url) and the menus read. (label, page, menu id or "" for the page's first menu, restaurant, the
# menu's printed title, rows expected, published?). Order = priority: a dish printed on several menus is filed under the first of them.
PAGES = {"nzsv": "https://viewthe.menu/nzsv", "nzwv": "https://viewthe.menu/nzwv", "nzpv": "https://viewthe.menu/nzpv",
         "nzev": "https://viewthe.menu/nzev", "nz7a": "https://viewthe.menu/nz7a"}
MENUS = [
    ("fh_main", "nzsv", "", "Firehouse Grill", "FIREHOUSE GRILL - MAIN MENU", 125, True),
    ("fh_kids", "nzsv", "a5f6376b-2057-4b2e-9d62-4df544a0a240", "Firehouse Grill", "FIREHOUSE GRILL - CHILDREN'S MEAL DEAL", 42, True),
    ("bc_main", "nzwv", "", "Beachcomber Inn", "THE BEACHCOMBER INN - MAIN MENU", 113, True),
    ("bc_kids", "nzwv", "39896c25-d09a-46f4-909d-e55dca22d154", "Beachcomber Inn", "THE BEACHCOMBER INN - CHILDREN'S MEAL DEAL", 42, True),
    ("bc_light", "nzwv", "5cd11fd4-1f72-46b9-b7c3-67c0624fd0d0", "Beachcomber Inn", "THE BEACHCOMBER INN - LIGHT BITES", 30, True),
    ("bc_carvery", "nzwv", "3fcd3bad-5aa2-4bd9-b149-1526d3f2b753", "Beachcomber Inn", "THE BEACHCOMBER INN - CARVERY", 26, True),
    ("buffet", "nzwv", "aab84b22-279c-43b0-b41a-814b2b739ac6", "Buffet breakfast", "RESTAURANTS - BUFFET BREAKFAST", 73, True),
    ("diner_main", "nzpv", "0414f22c-057b-4d29-b837-660e2741488f", "The Diner", "THE DINER - MAIN MENU", 121, True),
    ("diner_kids", "nzpv", "9f09779b-58e0-4797-a162-f7fc8faeef72", "The Diner", "THE DINER - KIDDOS", 46, True),
    ("diner_brunch", "nzpv", "6637b79c-e315-41c4-b9b2-c32fb0bd8e1b", "The Diner", "THE DINER - BOTTOMLESS BRUNCH", 15, True),
    ("fish", "nzev", "", "Fish & Chips", "Fish & Chips", 46, True),
    ("papa", "nz7a", "", "Papa Johns", "Papa Johns - Main Menu", 33, True),
    ("drinks", "nzsv", "c5f31bfb-fd38-4a6a-8712-ab0e0705bbbf", "Drinks", "Drinks", 289, True),
    ("diner_breakfast", "nzpv", "bb2e1b93-9815-4d48-8b8d-7dc661f957ef", "The Diner", "THE DINER - BREAKFAST", 72, False),
]
NOT_PUBLISHED = {"diner_breakfast": "The Diner's breakfast menu: butlins.com says breakfast is served at The Diner at Minehead only"}
MENU_NAME = {m[0]: m[4] for m in MENUS}
OUTLET = {m[0]: m[3] for m in MENUS}
RANK = {m[0]: i for i, m in enumerate(MENUS)}

# Printed names tidied: the chain's marketing flags "- NEW" / "- WE LOVE" are not part of a dish's name; a stray full stop before a
# bracket or at either end is dropped ("Peas.", ".Broccoli", "Micro Marshmallows. (NGCI)"). Everything else is kept as printed,
# including the dietary codes in brackets ("(VE NGCI)").
FLAGS = re.compile(r"\s+-\s+(?:NEW|WE LOVE)\s*$")


def tidy(name: str) -> str:
    n = " ".join(name.split())
    n = FLAGS.sub("", n)
    n = re.sub(r"\.(?=\s*\(|\s*$)", "", n)
    n = n.lstrip(". ").strip()
    return n


# ----------------------------------------------------------------------------------------------------------- classification
# (menu label) -> {printed section path -> spec}; a spec is (category, rankable) or {level: (category, rankable)} where level is the
# page's own "" / "root" / "sub" (a "sub" row is a choice offered under a dish). Categories are shown as "<restaurant>: <category>".
# Whole meals and mains are rankable; parts of a meal, sides, sauces, add-ons, desserts, drinks, shared platters and kids' portions are not.
KIDS = "Kids' "
BYO = "Build your own and add-ons"
S = {
    "fh_main": {
        "GRAZERS": ("Grazers", False),
        "KEEP IT LIGHT - RICE BOWL": {"root": ("Rice bowls", True), "sub": (BYO, False)},
        "CHICKEN FROM THE GRILL": ("Chicken from the grill", True),
        "FIREHOUSE SPECIALS": ("Firehouse specials", True),
        "SHARING PLATTERS": ("Sharing platters", False),
        "CHOOSE YOUR BASTE": ("Bastes", False),
        "BYO BURGER, PITTA OR WRAP": (BYO, False),
        "EYES ON THE SIDES": ("Sides", False),
        "LUNCH WRAPS": ("Lunch wraps", True),
        "DESSERTS": ("Desserts", False),
        "DESSERTS - ICE CREAM FACTORY": ("Ice cream factory", False),
        "KIDS - TOTS MAINS": (KIDS + "mains", False),
        "KIDS - JUNIOR MAINS": (KIDS + "mains", False),
        "KIDS - SIDES": (KIDS + "sides", False),
        "KIDS - DESSERTS": (KIDS + "desserts", False),
        "KIDS - ICE CREAM FACTORY": ("Ice cream factory", False),
        "BABYFOOD": "skip",
    },
    "fh_kids": {
        "TOTS MAINS": (KIDS + "mains", False), "JUNIOR MAINS": (KIDS + "mains", False), "BASTES": ("Bastes", False),
        "SIDES": (KIDS + "sides", False), "DESSERTS": (KIDS + "desserts", False), "ICE CREAM FACTORY": ("Ice cream factory", False),
    },
    "bc_main": {
        "STARTERS": ("Starters", False),
        "SALAD": {"root": ("Salads", True), "sub": (BYO, False)},
        "PUB CLASSICS": {"": ("Pub classics", True), "root": ("Pub classics", True), "sub": (BYO, False)},
        "HOT OFF THE GRILL": {"": ("Hot off the grill", True), "root": ("Sides", False)},
        "BUILD YOUR OWN SUPER BOWL": ("Super bowl options", False),
        "BURGERS": ("Burgers", True),   # the page marks every row "sub"; the extras are moved by EXTRAS below
        "SIDES": ("Sides", False),
        "DESSERTS": ("Desserts", False),
        "BABYFOOD": "skip",
        "SAUCE PUMPS": ("Sauces", False),
        "MILK ALTERNATIVES": ("Milk alternatives", False),
        "SWEET TREATS - MH ONLY": "skip: Minehead only",
    },
    "bc_kids": {
        "TOTS MAIN COURSES": (KIDS + "mains", False), "JUNIOR MAIN COURSES": (KIDS + "mains", False), "SIDES": (KIDS + "sides", False),
        "TOTS AND JUNIORS DESSERTS": (KIDS + "desserts", False), "SUNDAES": (KIDS + "desserts", False), "BABYFOOD": "skip",
        "SAUCE PUMPS": ("Sauces", False), "MILK ALTERNATIVES": ("Milk alternatives", False),
    },
    "bc_light": {
        "JACKET POTATOES": {"root": ("Jacket potatoes", True), "sub": ("Jacket potato toppings", False)},
        "SANDWICHES": ("Light bites", True), "BAGUETTES": ("Light bites", True), "FLATBREADS": ("Light bites", True),
        "BABYFOOD": "skip", "SAUCE PUMPS": ("Sauces", False), "MILK ALTERNATIVES": ("Milk alternatives", False),
    },
    "bc_carvery": {"BUFFET - CARVERY": ("Carvery", False)},
    "buffet": {
        "HOT COUNTER": ("Hot counter", False), "REFRIGERATED COUNTER": ("Refrigerated counter", False),
        "CEREAL COUNTER": ("Cereal counter", False), "MILK & ALTERNATIVES": ("Milk and alternatives", False),
        "BAKERY": ("Bakery", False), "DRINKS": ("Drinks", False), "BABY FOOD": "skip", "CONDIMENTS": ("Condiments", False),
    },
    "diner_main": {
        "GRAZERS": ("Grazers", False),
        "LOADED NACHOS OR DIRTY FRIES": ("Loaded nachos or dirty fries", False),
        "CLASSICS > Mac 'n' Cheese": {"": ("Classics", True), "root": ("Classics", True), "sub": (BYO, False)},
        "BURGERS > CHOICE OF FILLING": ("Burger fillings", False),
        "BURGERS > SIGNATURE BURGERS": ("Signature burgers", False),
        "BURGERS > ULTIMATE BURGERS": ("Burgers", True),
        "BURGERS > SIMPLY BURGERS": ("Burgers", True),
        "FROM THE GRILL": {"": ("From the grill", True), "sub": ("Sides", False)},
        "BUILD YOUR OWN COMBO > CHOOSE YOUR MAIN": (BYO, False),
        "SIDES": ("Sides", False),
        "LUNCH - SANDWICHES": ("Lunch", True),
        "CLASSIC SHAKES": ("Shakes", False),
        "SUPER SHAKES": {"root": ("Shakes", False), "sub": ("Shake toppings", False)},
        "SUPER SHAKES > ULTIMATE SHAKES": ("Shakes", False),
        "DESSERTS": ("Desserts", False),
        "MILK ALTERNATIVES": ("Milk alternatives", False),
        "SAUCE PUMPS": ("Sauces", False),
        "BABYFOOD": "skip",
    },
    "diner_kids": {
        "KIDDOS - TOTS": (KIDS + "mains", False), "KIDDOS - JUNIORS": (KIDS + "mains", False), "SIDES": (KIDS + "sides", False),
        "DESSERTS": (KIDS + "desserts", False), "SHAKES": (KIDS + "shakes", False), "MILK ALTERNATIVES": ("Milk alternatives", False),
        "SAUCE PUMPS": ("Sauces", False), "BABYFOOD": "skip",
    },
    "diner_brunch": {s: ("Bottomless brunch", True) for s in ("PANCAKES", "BREAKFAST SANDWICHES", "CLASSICS", "BURGERS", "NGCI OPTIONS")},
    "fish": {
        "MAINS": ("Mains", True), "SIDES": ("Sides", False), "LOADED CHIPS": ("Loaded chips", False),
        "CHILDREN": (KIDS + "meals", False), "CONDIMENTS": ("Condiments", False), "HOT DOGS": ("Hot dogs", True),
    },
    "papa": {"SALAD BAR": ("Salad bar", False), "PASTA BAR": ("Pasta bar", False), "SIDES": ("Sides", False),
             "ICE CREAM FACTORY": ("Ice cream factory", False)},
    "drinks": {
        "Draught Beer & Cider": ("Draught beer and cider", False), "Spirits": ("Spirits", False), "Wine": ("Wine", False),
        "Soft Drinks - Draught": ("Soft drinks (draught)", False), "Bottled Beer": ("Bottled beer and cider", False),
        "Cocktails": ("Cocktails", False), "Soft Drinks - Bottled": ("Soft drinks (bottled)", False),
        "Soft Drinks - Slush": ("Slush", False), "Hot Drinks": ("Hot drinks", False), "Hot Chocolate": ("Hot drinks", False),
    },
    "diner_breakfast": {},   # read, not published
}
# Rows inside a section that are not what the section's category says (printed name -> (category, rankable)); everything else in the
# section keeps the section's category. The Beachcomber Inn's "BURGERS" lists its eight burgers first, then the extras for them.
BURGER_DISHES = {"Ultimate Mega Stack Burger", "Cheesy Bacon Beef Burger", "Korean BBQ Chicken Burger", "Korean BBQ Quorn™ ChiQin Burger",
                 "BBQ Brisket Beef Burger", "Classic Beef Burger", "Classic Chicken Burger", "The Classic Vegan Burger (Ve)"}
EXTRAS = {
    ("fh_main", "GRAZERS"): ("Add 1 Boneless Chicken Thighs", (BYO, False)),
    ("diner_main", "BURGERS > SIMPLY BURGERS"): ("Monterey Jack Cheese|Violife Slice", ("Burger extras", False)),
    ("bc_light", "SANDWICHES"): ("White Bread & Spread|Malted Brown Bread & Spread", ("Light bites", False)),
    ("fish", "HOT DOGS"): ("Kids Hot Dog|Add Crispy Onions|Add Cheese", ("Hot dogs", False)),
}
# Signature burgers: the page describes each as "Your favourite filling topped with ...", so the figures may not be a whole burger.
SIGNATURE_NOTE = "described as 'Your favourite filling topped with ...': the printed figures may not include the filling, so not suggested as an order"
# Accuracy audit 2026-10-08: dishes whose allergen row cannot be reconciled with the dish itself and where nothing on the page says why
# (the chain labels its gluten-free dishes "NGCI" or "Non-Gluten Containing"; these carry no such label and no cereal mark).
# Held back, never corrected: the page prints no gluten mark for a brownie / a bun.
ALLERGEN_HOLD = {
    "vegan-brownie": "allergen row contradicts the dish name: a brownie with no cereal (gluten) marked and no NGCI / non-gluten-containing label",
    "vegan-warm-chocolate-brownie-beachcomber-inn": "allergen row contradicts the dish name: a brownie with no cereal (gluten) marked and no NGCI / non-gluten-containing label",
    "vegan-warm-chocolate-brownie-firehouse-grill-the-diner": "allergen row contradicts the dish name: a brownie with no cereal (gluten) marked and no NGCI / non-gluten-containing label",
    "poppy-seed-bun": "allergen row contradicts the dish name: a bun with no cereal (gluten) marked and no NGCI / non-gluten-containing label",
}
ENERGY_TOLERANCE = 0.15   # the pipeline's own tolerance (tools/build_menus.py) between kcal and 4P+4C+9F
ALCOHOL_SECTIONS = {"Draught Beer & Cider", "Spirits", "Wine", "Bottled Beer", "Cocktails"}


def classify(label: str, rec: dict) -> tuple:
    """(category suffix, rankable) for a row, or ("skip", reason). Stops on a section this script has not been checked against."""
    section = " > ".join(rec["course"])
    table = S[label]
    if section not in table:
        raise SystemExit(f"{label}: new section {section!r}: add it to S (category, rankable) after checking the page.")
    spec = table[section]
    if isinstance(spec, str):
        return ("skip", "baby food: generic product, no portion stated" if spec == "skip" else spec[6:].strip())
    if isinstance(spec, dict):
        level = rec["level"]
        if level not in spec:
            raise SystemExit(f"{label} / {section}: a {level!r} row ({rec['name']}) has no entry in S: add it after checking the page.")
        spec = spec[level]
    name = rec["name"]
    if label == "bc_main" and section == "BURGERS" and name not in BURGER_DISHES:
        return ("Burger extras", False)
    extra = EXTRAS.get((label, section))
    if extra and name in extra[0].split("|"):
        return extra[1]
    return spec


# ----------------------------------------------------------------------------------------------------------- reading
def check_page(label: str, path: Path) -> None:
    """The saved page must hold the menu this script expects for `label` (title and the page's own menu identifier)."""
    text = path.read_text(encoding="utf-8")
    want_title = " ".join(MENU_NAME[label].split())
    got_title = " ".join(tb.page_title(path).split())
    if got_title != want_title:
        raise SystemExit(f"{path.name} holds the menu {got_title!r}, not {want_title!r}: the pages changed, re-check MENUS.")
    m = re.search(r'<section class="k10-menus[^>]*data-menu-identifier="([^"]+)"', text)
    guid = next(x[2] for x in MENUS if x[0] == label)
    if guid and (not m or m.group(1) != guid):
        raise SystemExit(f"{path.name} shows menu id {m.group(1) if m else None}, not {guid}")


def suitable_by_recipe(path: Path) -> dict:
    """{recipe id: set of 'vegetarian' / 'vegan'} from each pop-up's 'Suitable for:' line (the chain's own marking)."""
    root = tb.parse_html(path.read_text(encoding="utf-8"))
    out = {}
    for sec in root.find_all("k10-recipe-modal", tag="section"):
        rid = sec.attrs.get("data-recipe-id", "")
        words = set()
        for s in sec.find_all("k10-recipe-modal__section_suitable"):
            head, vals = s.find("k10-recipe-modal__section-header"), s.find("k10-recipe-modal__section-values")
            if head is None or vals is None or tb._clean(head.text()).rstrip(":").lower() != "suitable for":
                raise SystemExit(f"{path.name}: an unknown 'suitable' section for recipe {rid}")
            words |= {w.strip().lower() for w in tb._clean(vals.text()).split(",") if w.strip()}
        if not words <= {"vegetarian", "vegan"}:
            raise SystemExit(f"{path.name}: 'Suitable for' names {sorted(words - {'vegetarian', 'vegan'})} for recipe {rid}")
        out[rid] = words
    return out


def number(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def hold_reason(label: str, rec: dict, vals: dict):
    """A reason when the row's own numbers contradict each other (never corrected): saturates above fat, sugars above carbohydrate,
    printed kcal 25% or more away from the printed kJ (kJ / 4.184, difference of 8 kcal or more) or, outside alcoholic drinks, from
    4 x protein + 4 x carbs + 9 x fat (50 kcal or more)."""
    cal, p, c, f = (number(vals[k]) for k in ("calories", "protein_g", "carbs_g", "fat_g"))
    sat, sug, kj = number(vals.get("sat_fat_g")), number(vals.get("sugar_g")), number(vals.get("energy_kj"))
    if sat is not None and sat > f + 0.05:
        return f"saturates ({vals['sat_fat_g']} g) are printed higher than total fat ({vals['fat_g']} g)"
    if sug is not None and sug > c + 0.05:
        return f"sugars ({vals['sugar_g']} g) are printed higher than carbohydrate ({vals['carbs_g']} g)"
    if kj is not None:
        from_kj = kj / 4.184
        # 25% apart (kJ/4.184 against kcal) or, from kcal >= 20, a kJ figure outside 0.85-1.15 x (kcal x 4.184): the accuracy audit's
        # "high" band (tools/audit/accuracy_audit.py), found 2026-10-08 on Cranberry Juice (203 kJ, 60 kcal) and Mushy Peas (440 kJ, 125 kcal)
        if abs(from_kj - cal) >= 8 and (abs(from_kj - cal) / max(cal, from_kj) >= 0.25
                                        or (cal >= 20 and not 0.85 <= kj / (cal * 4.184) <= 1.15)):
            return f"the page prints {vals['calories']} kcal but {vals['energy_kj']} kJ (about {from_kj:.0f} kcal)"
    est = 4 * p + 4 * c + 9 * f
    if not (label == "drinks" and rec["course"][0] in ALCOHOL_SECTIONS) and cal >= 50:
        gap = abs(cal - est) / cal
        sums = (f"its own protein, carbohydrate and fat ({vals['protein_g']} g, {vals['carbs_g']} g, {vals['fat_g']} g) "
                f"add up to about {est:.0f} kcal")
        if gap >= 0.25:
            return f"the page prints {vals['calories']} kcal; {sums}"
        if gap > ENERGY_TOLERANCE and (kj is None or abs(kj / 4.184 - cal) / cal > 0.10):
            return (f"the page prints {vals['calories']} kcal; {sums}" +
                    (f", and its {vals['energy_kj']} kJ is about {kj / 4.184:.0f} kcal" if kj is not None else ""))
    return None


def kj_agrees(vals: dict) -> bool:
    """True when the printed kJ (kJ / 4.184) is within 10% of the printed kcal."""
    cal, kj = number(vals["calories"]), number(vals.get("energy_kj"))
    return bool(cal) and kj is not None and abs(kj / 4.184 - cal) / cal <= 0.10


def sentence(s: str) -> str:
    """A printed section name for use inside a bracket: 'KIDS - TOTS MAINS' -> 'Tots mains' ('Kids' is said by the kids flag)."""
    s = re.sub(r"^(kids|kiddos)\s*-\s*", "", " ".join(s.split()), flags=re.I).lower()
    return s[:1].upper() + s[1:]


def read_everything(pages: Path) -> tuple:
    """-> (rows, excluded, skipped, held-in-rows counted, totals). A row is one distinct dish: same normalised name, serving, numbers and
    allergens (it lists every place it is printed)."""
    tb.COLUMNS.update({"of which saturates (g)": "sat_fat_g", "carbohydrate (g)": "carbs_g"})   # this page's spellings
    extra = {"sulphur dioxide/ sulphites": ("sulphites", None)}                                  # printed with a space
    rows = {}
    excluded, skipped, notpub = [], [], []
    total = 0
    recipe_seen = {}
    for label, _, _, outlet, _, expected, published in MENUS:
        path = pages / f"{label}.html"
        if not path.exists():
            raise SystemExit(f"{path} is missing: run with --fetch")
        check_page(label, path)
        layout, recs = tb.read_menu(path)
        if layout != "modal":
            raise SystemExit(f"{path.name}: expected the pop-up layout, found {layout!r}")
        if len(recs) != expected:
            raise SystemExit(f"{path.name} has {len(recs)} dishes but this script expects {expected}: the menu changed, re-check S and EXTRAS.")
        total += len(recs)
        suit = suitable_by_recipe(path)
        for pos, rec in enumerate(recs):
            where = f"{label} / {' > '.join(rec['course'])} / {rec['name']}"
            if rec["check"]["basis"] != "Nutrition (per portion)":
                raise SystemExit(f"{where}: basis is {rec['check']['basis']!r}, not 'Nutrition (per portion)'")
            vals = tb.printed_values(rec)
            allergens = tb.allergens_from_rec(rec, where, extra)
            labels = rec["label_map"]
            ids = set(rec["allergen_src"]["ids_all"] or [])
            diet = {labels[i].lower() for i in ids if i in labels and labels[i] in ("Vegetarian", "Vegan")}
            if diet != suit.get(rec["recipe_id"], None):
                raise SystemExit(f"{where}: 'Suitable for' {sorted(suit.get(rec['recipe_id'], []))} disagrees with the label ids {sorted(diet)}")
            # one recipe, one set of numbers and allergens wherever it is printed
            ident = (tuple(vals.get(k, "") for k in tb.KEY_COLS), tb._allergen_key(allergens), rec["name"])
            if recipe_seen.setdefault(rec["recipe_id"], ident) != ident:
                raise SystemExit(f"{where}: recipe {rec['recipe_id']} is printed with different numbers, allergens or name elsewhere")
            if not published:
                notpub.append((label, rec["name"]))
                continue
            spec = classify(label, rec)
            if spec[0] == "skip":
                skipped.append((label, rec["name"], spec[1]))
                continue
            if not tb.has_required(vals):
                excluded.append((label, rec["name"], "calories, protein, carbs or fat not published"))
                continue
            name = tidy(rec["name"])
            desc = rec["desc"]
            serving = desc if re.match(r"^per\b", desc, re.I) else ""
            key = (tb.norm_name(name), serving.lower(), tuple(vals.get(k, "") for k in tb.KEY_COLS), tb._allergen_key(allergens))
            place = {"label": label, "section": " > ".join(rec["course"]), "level": rec["level"], "pos": pos, "rid": rec["recipe_id"],
                     "category": spec[0], "rankable": spec[1], "printed": rec["name"], "hint": sentence(rec["course"][-1])}
            if key in rows:
                rows[key]["places"].append(place)
                continue
            rows[key] = {"name": name, "vals": vals, "serving": serving, "allergens": allergens, "veg": bool(suit[rec["recipe_id"]]),
                         "text": f"{name} {'' if serving else desc}", "desc": desc, "places": [place], "rec": rec}
    return list(rows.values()), excluded, skipped, notpub, total


# ----------------------------------------------------------------------------------------------------------- naming
QUALIFIER = {"Drinks": "Drinks menu"}   # how a restaurant is named inside a bracket (the others are named as they are)


def outlets_of(row: dict) -> list:
    places = sorted(row["places"], key=lambda p: (RANK[p["label"]], p["pos"]))
    return list(dict.fromkeys(QUALIFIER.get(OUTLET[p["label"]], OUTLET[p["label"]]) for p in places))


def is_kids(row: dict) -> bool:
    return all(p["category"].startswith(KIDS) for p in row["places"])


def unique_names(rows: list) -> None:
    """Rows (distinct recipes) that print the same name get a bracket naming where: the restaurant(s); then 'kids' if every place is a
    kids' section; then the printed section. Every row of a clash is renamed, so no plain name is ambiguous."""
    groups = {}
    for r in rows:
        groups.setdefault(tb.norm_name(r["name"]), []).append(r)
    for grp in groups.values():
        if len(grp) == 1:
            continue
        chosen = None
        for level in (1, 2, 3):
            labels = []
            for r in grp:
                parts = [" / ".join(outlets_of(r))]
                if level >= 2 and is_kids(r):
                    parts.append("kids")
                if level >= 3:
                    parts.append(sorted(r["places"], key=lambda p: (RANK[p["label"]], p["pos"]))[0]["hint"])
                labels.append(", ".join(parts))
            disjoint = level > 1 or sum(len(outlets_of(r)) for r in grp) == len({o for r in grp for o in outlets_of(r)})
            if len(set(labels)) == len(grp) and disjoint:
                chosen = labels
                break
        if chosen is None:
            raise SystemExit(f"cannot tell apart {[r['name'] for r in grp]}: extend unique_names")
        for r, lab in zip(grp, chosen):
            r["name"] = f"{r['name']} ({lab})"
    names = [tb.norm_name(r["name"]) for r in rows]
    dup = sorted({n for n in names if names.count(n) > 1})
    if dup:
        raise SystemExit(f"two items would share a name: {dup}")


def build(pages: Path):
    rows, excluded, skipped, notpub, total = read_everything(pages)
    unique_names(rows)
    items, holdback, report, unspecified = [], [], [], []
    for r in sorted(rows, key=lambda r: min((RANK[p["label"]], p["pos"]) for p in r["places"])):
        places = sorted(r["places"], key=lambda p: (RANK[p["label"]], p["pos"]))
        primary = places[0]
        category = f"{OUTLET[primary['label']]}: {primary['category']}"
        tags, conflict = tb.diet_tags(r["text"], r["veg"])
        meat_tags, vague = tc.meat_tags(r["name"], vegetarian=r["veg"])
        if vague and not tags:
            unspecified.append(r["name"])
        on = []
        for p in places:
            menu = MENU_NAME[p["label"]].title().replace("'S", "'s")
            on.append(f"{menu} > {p['section']}")
        note_bits = [f"Printed '{primary['printed']}'" if primary["printed"] != r["name"] else "", conflict,
                     ("Signature burger: " + SIGNATURE_NOTE) if primary["category"] == "Signature burgers" else "",
                     "On: " + "; ".join(dict.fromkeys(on))]
        it = {"id": slug(tb.fold(r["name"])), "name": r["name"], "category": category, "serving": r["serving"],
              **{k: r["vals"].get(k, "") for k in tb.KEY_COLS}, "tags": tags, "limited_time": False,
              "rankable": primary["rankable"], "notes": "", "allergens": r["allergens"]}
        if primary["label"] == "drinks" and primary["section"] in ALCOHOL_SECTIONS:
            gap = tc.annotate(it)
            if any("Printed calories" in g for g in gap):
                note_bits.append("energy includes alcohol (kcal is higher than protein, carbs and fat explain)")
                gap = [g for g in gap if "Printed calories" not in g]
        else:
            gap = tc.annotate(it)
            if any("Printed calories" in g for g in gap) and kj_agrees(r["vals"]):
                gap = [g + " (the printed kJ agrees with the printed kcal)" if "Printed calories" in g else g for g in gap]
        note_bits += gap
        it["notes"] = "; ".join(b for b in note_bits if b)
        why = hold_reason(primary["label"], r["rec"], r["vals"]) or ALLERGEN_HOLD.get(it["id"])
        if why:
            holdback.append((it["id"], why))
        report += [f"{r['name']}: {g}" for g in gap]
        items.append(it)
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two dishes would get the same id: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    return items, holdback, report, unspecified, excluded, skipped, notpub, total


def fetch(pages: Path, dry: bool = False) -> None:
    """Save every menu once (1 request per second; a page already saved is kept: delete it to refresh)."""
    for code, base in PAGES.items():
        guids = {m[0]: m[2] for m in MENUS if m[1] == code}
        if dry:
            for lab, g in guids.items():
                print(f"{lab}: {base}{'?mguid=' + g if g else ''}")
        else:
            tb.fetch_pages(base, guids, pages)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "butlins-pages", help="folder holding <label>.html for every menu")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the 14 menus into --pages first (one request per second)")
    ap.add_argument("--list-urls", action="store_true", help="print the 14 addresses and stop")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt text is {len(NOTE)} characters; the limit is under 400")
    if args.list_urls:
        fetch(args.pages, dry=True)
        return 0
    if args.fetch:
        fetch(args.pages)
    items, holdback, report, unspecified, excluded, skipped, notpub, total = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Butlin's", cuisine="Holiday resort restaurant", source_title=SOURCE_TITLE.format(checked=args.checked_on),
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
        allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    for label, *_ in MENUS:
        print(f"{label:16} sha256 {tc.sha256_text_file(args.pages / (label + '.html'))}  {MENU_NAME[label]}")
    by_reason = {}
    for label, name, why in skipped:
        by_reason[why] = by_reason.get(why, 0) + 1
    print(f"dish pop-ups read on 14 menus: {total}; not published menu {sorted(NOT_PUBLISHED)}: {len(notpub)}")
    print("left out:", by_reason)
    print(f"rows without calories/protein/carbs/fat: {len(excluded)}")
    print("held back:\n" + "\n".join(f"  {i}: {why}" for i, why in holdback))
    print("meat type not stated: " + str(len(unspecified)))
    print("\n".join(tb.ALLERGEN_NOTES))
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
