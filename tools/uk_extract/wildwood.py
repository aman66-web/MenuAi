#!/usr/bin/env python3
"""Build data/source/wildwood/ from Wildwood's official calorie sheets (a CALORIES-ONLY chain, 24 restaurants).

    python3 tools/uk_extract/wildwood.py --pdfs DIR --checked-on 2026-10-08 [--fetch] [--august-menu] [--out DIR]

DIR holds the five calorie PDFs listed in SHEETS (`--fetch` downloads them, and with `--august-menu` the printed menu, one request per
second, normal browser User-Agent; wildwoodrestaurants.co.uk/robots.txt allows everything). Needs `pdftotext` (poppler).

Where the files come from: https://wildwoodrestaurants.co.uk/allergens/?location=<site> (24 sites, one page each; read once each on
2026-10-08) links one calories PDF per menu (Excel exports with a text layer). All 24 pages link the same Main Menu calories PDF; the
other sheets differ by site:
  M  Main Menu Calories (printed date 13.05.2026): all 24 sites.
  L  Lunch Set Menu Calories (13.05.2026) and E  Evening Set Menu Calories (13.05.2026): 21 sites (not Braintree, Llandudno, Rushden Lakes).
  S  Specials Sept calories (file 24.07.26 V1, Last-Modified 22 Sep 2026, no date printed): 23 sites; Northwich links J instead.
  J  Specials calories 30.06.26: Northwich only (its eight dishes are page 2 of S, with the same calories).
Camberley, Liverpool and Wantage also link a Breakfast allergen sheet (27.03.2025, no calories): breakfast dishes are not listed.
Peterborough and Rushden Lakes link a newer main-menu ALLERGEN sheet (07.09.2026); the calorie sheets are the same everywhere.

WHAT IS PUBLISHED. The sheets print calories ONLY: protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"), so every item
is not rankable. A dish is published only when every sheet that prints it prints the same calories (founder's rule for a chain whose
menus differ by site). A dish whose calories differ between sheets, or that the chain's own August 2026 menu (the printed menu, which
also prints kcal; `Wildwood-Restaurants-Alla-carta-August-2026-v1-1.pdf`) prints differently, is listed in holdback.csv (never
corrected, never averaged). The sheets do not say why two menus print different calories for one dish, so the reason recorded is
only the printed numbers.

NAMES. Each dish is keyed by its printed name (case, spaces and a "(F)" fryer mark ignored). PLAN below gives the display name,
category and stated serving; the script stops if a sheet prints a dish that PLAN does not know, if PLAN lists a dish no sheet prints,
or if a sheet's row count changes, so a human re-checks after the chain publishes a new menu. ALIASES lists the four dishes printed
under two names on different sheets (three with the same calories; the half chicken prints 761 and 1,083 and is held back). Typos in a printed name (PEPEPRONI, PASAT, CHCIKEN, BANOFFE) are fixed in the display name only; the printed
name is kept in `notes`.

ALLERGENS are link-only (docs/DATA.md "Allergens", all or nothing). The allergen sheets (main menu allergen data V1 10/08/2026, lunch set,
evening set, specials) are grids of the 14 allergens, but their row names are not the calorie sheets' names for many dishes
("PIZZA AMALFI" vs "PIZZA THE AMALFI", "SORBET LEMON" vs "LEMON SORBET (1 SCOOP)", "MEAT, PEPPERONI" vs "EXTRA PEPPERONI (15 SLICES)",
"OVEN BAKED CHICKEN & MUSHROOM PENNE" vs "...RIGATONI"), the large garlic breads and large pizzas have no row, and the
set-menu sheets are separate allergen documents (about 50 of the 114 published dishes have no row with exactly their name). Allergens are
safety information: no name matching, no guessing.

Tags: contains_pork / contains_beef only when the dish's printed name says so (see PORK, BEEF); the sheets carry no vegetarian marks, so
no `vegetarian` tag. "(F)" marks mean the item is fried in oil shared with other allergens (kept in `notes`).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wildwood_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "wildwood"
UPLOADS = "https://wildwoodrestaurants.co.uk/wp-content/uploads/"
# menu key -> (file, label, rows expected). Order = the order sheets are read (and the order dishes are first seen).
SHEETS = {
    "M": ("Wildwood-Spring-Main-Menu-Calories-27.04.2026.pdf", "Main Menu", 113),
    "L": ("Wildwood-Lunch-Set-Menu-Calories-27.04.2026.pdf", "Lunch Set", 36),
    "E": ("Wildwood-Spring-Evening-Menu-Calories-27.04.2026.pdf", "Evening Set", 25),
    "S": ("Wildwood-Restaurants-Specials-Sept-Calories-Data.-24.07.26.V1.pdf", "Specials (Sept)", 13),
    "J": ("WW-Specials-Calories.-30.06.26.pdf", "Specials (30.06.26, Northwich)", 8),
}
AUGUST_MENU = "Wildwood-Restaurants-Alla-carta-August-2026-v1-1.pdf"
SOURCE_URL = UPLOADS + SHEETS["M"][0]
SOURCE_TITLE = ("Wildwood calorie sheets: Main Menu, Lunch Set Menu and Evening Set Menu (each dated 13.05.2026), Specials "
                "(24.07.26 V1, and 30.06.26 at Northwich); checked against the August 2026 menu")
ALLERGEN_GUIDE_TITLE = ("Wildwood Allergen & Calorie Information page (main menu allergen data V1 10/08/2026; lunch set and evening set "
                        "27.04.2026; specials 24.07.26)")
ALLERGEN_GUIDE_URL = "https://wildwoodrestaurants.co.uk/allergens/"
# The guide says there is a chance items contain a trace of other ingredients and that fryer oil carries traces of allergens: traces
# information is published (in general terms).
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Wildwood prints calories only, so protein, carbs and fat are not published. Read from its Main, Lunch Set, Evening Set and "
        "Specials calorie sheets (Apr-Sep 2026): a dish is listed only if every sheet that prints it agrees. Menus differ by "
        "restaurant, and specials change often. Drinks are not on those sheets, so none are listed.")
EXPECTED_ITEMS = 125

SPECIALS = "Specials"
CATEGORY_ORDER = ["Bread and olives", "Starters", "Soup of the day", "Pizza", "Large pizza", "Light options", "Salad", "Pasta",
                  "Risotto", "Grill", "Burgers", "Sides", "Dips", "Extra toppings", "Dessert", SPECIALS]
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo|pancetta|speck|prosciutto|nduja)\b", re.I)
BEEF = re.compile(r"(beef|steak)", re.I)  # "cheesesteak" counts: the printed name says steak


def D(key, display, category, serving="", weight="", note="", id=""):
    return dict(key=key, display=display, category=category, serving=serving, weight=weight, note=note, id=id or slug(display))


# One entry per dish the sheets print, keyed by the printed name (upper case, "(F)" removed, spaces in brackets closed).
PLAN = [
    D("MIXED OLIVES", "Mixed olives", "Bread and olives"),
    D("FOCACCIA", "Focaccia", "Bread and olives"),
    D("ROSEMARY GARLIC BREAD", "Rosemary garlic bread", "Starters"),
    D("ROSEMARY GARLIC BREAD(LARGE)", "Rosemary garlic bread (large)", "Starters"),
    D("MOZZARELLA & CARAMELISED ONION GARLIC BREAD", "Mozzarella & caramelised onion garlic bread", "Starters"),
    D("MOZZARELLA & CARAMELISED ONION GARLIC BREAD(LARGE)", "Mozzarella & caramelised onion garlic bread (large)", "Starters"),
    D("CALAMARI", "Calamari", "Starters"),
    D("TIGER PRAWNS", "Tiger prawns", "Starters"),
    D("TRUFFLE MUSHROOM ARANCINI", "Truffle mushroom arancini", "Starters"),
    D("TOMATO & RICOTTA BRUSCHETTA", "Tomato & ricotta bruschetta", "Starters"),
    D("BURRATA & RED PEPPER TAPENADE", "Burrata & red pepper tapenade", "Starters"),
    D("TUNA PATE", "Tuna & avocado pâté", "Starters", id="tuna-and-avocado-pate"),
    D("COURGETTE PEA & MINT SOUP", "Courgette pea & mint soup", "Soup of the day", note="Printed under 'Soup of the day (ask your server for today's flavour)'"),
    D("TOMATO & RED PEPPER SOUP", "Tomato & red pepper soup", "Soup of the day"),
    D("BUTTERNUT SQUASH& GINGER SOUP", "Butternut squash & ginger soup", "Soup of the day"),
    D("MINESTRONE SOUP", "Minestrone soup", "Soup of the day"),
    D("CAULIFLOWER SOUP", "Cauliflower soup", "Soup of the day"),
    D("PIZZA MARGHERITA", "Pizza Margherita", "Pizza"),
    D("PIZZA FUNGHI", "Pizza Funghi", "Pizza"),
    D("PIZZA PICCANTE CARNE", "Pizza Piccante carne", "Pizza"),
    D("PIZZA DOUBLE PEPPERONI", "Pizza double pepperoni", "Pizza"),
    D("PIZZA NDUJA & PEPEPRONI", "Pizza 'Nduja & pepperoni", "Pizza", note="Printed 'PEPEPRONI'"),
    D("PIZZA THE AMALFI", "Pizza The Amalfi", "Pizza"),
    D("SPICY CHICKEN", "Pizza spicy chicken", "Pizza", note="Printed 'SPICY CHICKEN' under Pizza"),
    D("CALZONE CHICKEN & CHORIZO", "Calzone chicken & chorizo", "Pizza"),
    D("GLUTEN FREE CASARECCE PASTA AVAILABLE", "Gluten free casarecce pasta", "Pizza"),
    D("GLUTEN AND DAIRY FREE PIZZA DOUGH BASE(240G)", "Gluten and dairy free pizza dough base", "Pizza", weight="240"),
    D("LARGE PIZZA MARGHERITA", "Large pizza Margherita", "Large pizza"),
    D("LARGE PIZZA FUNGHI", "Large pizza Funghi", "Large pizza"),
    D("LARGE PIZZA PICCANTE CARNE", "Large pizza Piccante carne", "Large pizza"),
    D("LARGE PIZZA DOUBLE PEPPERONI", "Large pizza double pepperoni", "Large pizza"),
    D("LARGE PIZZA NDUJA & PEPEPRONI", "Large pizza 'Nduja & pepperoni", "Large pizza", note="Printed 'PEPEPRONI'"),
    D("LARGE THE AMALFI", "Large pizza The Amalfi", "Large pizza"),
    D("LARGE SPICY CHICKEN", "Large pizza spicy chicken", "Large pizza"),
    D("LIGHT PEPPERONI", "Light pepperoni", "Light options"),
    D("LIGHT MARGHERITA", "Light Margherita", "Light options"),
    D("LIGHT PIZZA CARNE NOV23", "Light pizza carne", "Light options", note="Printed with a menu-date tag 'NOV23'"),
    D("LIGHT SPAGHETTI POMODORO", "Light spaghetti pomodoro", "Light options"),
    D("LIGHT SPAGHETTI CARBONARA", "Light spaghetti carbonara", "Light options"),
    D("LIGHT SPAGHETTI BOLOGNESE", "Light spaghetti Bolognese", "Light options"),
    D("ADD SALAD DRESSING", "Add salad dressing", "Light options"),
    D("COBB SALAD", "Cobb salad", "Salad"),
    D("CHICKEN CAESAR SALAD", "Chicken Caesar salad", "Salad"),
    D("EXTRA CRISPY BACON", "Extra crispy bacon", "Extra toppings"),
    D("EXTRA GRILLED CHICKEN", "Extra grilled chicken", "Salad", note="Same printed value (309) as Extra crispy bacon"),
    D("EXTRA PRAWNS", "Extra prawns", "Salad"),
    D("RIGATONI ARRABBIATA", "Rigatoni arrabbiata", "Pasta"),
    D("SPAGHETTI POMODORO", "Spaghetti pomodoro", "Pasta"),
    D("TRADITIONAL BOLOGNESE", "Traditional Bolognese", "Pasta"),
    D("PERI-PERI CHICKEN RIGATONI", "Peri-Peri chicken rigatoni", "Pasta"),
    D("VEGAN LASAGNE", "Vegan lasagne", "Pasta"),
    D("CLASSIC LASAGNE", "Classic lasagne", "Pasta"),
    D("SPAGHETTI CARBONARA", "Spaghetti carbonara", "Pasta"),
    D("SEAFOOD LINGUINE", "Seafood linguine", "Pasta"),
    D("OVEN BAKED CHICKEN & MUSHROOM RIGATONI", "Oven baked chicken & mushroom rigatoni", "Pasta"),
    D("NDUJA & BURRATA RIGATONI", "'Nduja & burrata rigatoni", "Pasta"),
    D("CHICKEN & CHORIZO RISOTTO", "Chicken & chorizo risotto", "Risotto"),
    D("RISOTTO PRIMAVERA", "Risotto primavera", "Risotto"),
    D("MINUTE STEAK", "Minute steak", "Grill"),
    D("BRITISH 10OZ RIB-EYE STEAK", "British 10oz rib-eye steak", "Grill"),
    D("ADD PEPPERCORN SAUCE", "Add peppercorn sauce", "Grill"),
    D("ADD GARLIC BUTTER", "Add garlic butter", "Grill"),
    D("PHILLY CHEESESTEAK SANDWICH", "Philly cheesesteak sandwich", "Grill"),
    D("PERI PERI HALF CHICKEN", "Peri-Peri half chicken", "Grill"),
    D("CHICKEN MILANESE", "Chicken Milanese", "Grill"),
    D("ADD SPAGHETTI ARRABBIATA(CHCIKEN MILANESE)", "Add spaghetti arrabbiata (Chicken Milanese)", "Grill", note="Printed 'CHCIKEN'"),
    D("ADD FRIES(CHICKEN MILANESE)", "Add fries (Chicken Milanese)", "Grill"),
    D("CLASSIC CHEESE BURGER", "Classic cheese burger", "Burgers"),
    D("WAGYU BEEF BURGER", "Wagyu beef burger", "Burgers"),
    D("BUTTERMILK CHICKEN BURGER", "Buttermilk chicken burger", "Burgers"),
    D("THE ULTIMATE DOUBLE CHEESE BURGER", "The Ultimate double cheese burger", "Burgers"),
    D("ROSEMARY FRIES", "Rosemary fries", "Sides"),
    D("TRUFFLE & CHEESE FRIES", "Truffle & cheese fries", "Sides"),
    D("SWEET POTATO FRIES", "Sweet potato fries", "Sides"),
    D("GREEN BEANS", "Green beans", "Sides"),
    D("ZUCCHINI FRITTI", "Zucchini fritti", "Sides"),
    D("PERI-PERI MAYO", "Peri-Peri mayo", "Dips"),
    D("HOT HONEY & MUSTARD", "Hot honey & mustard", "Dips"),
    D("BASIL AIOLI", "Basil aioli", "Dips"),
    D("EXTRA CHICKEN(6 PIECES - FOR PASAT & PIZZA)", "Extra chicken (for pasta & pizza)", "Extra toppings", serving="6 pieces",
      note="Printed 'PASAT'"),
    D("EXTRA PEPPERONI(15 SLICES)", "Extra pepperoni", "Extra toppings", serving="15 slices"),
    D("EXTRA SPECK(2 SLICES)", "Extra speck", "Extra toppings", serving="2 slices"),
    D("EXTRA CHORIZO", "Extra chorizo", "Extra toppings"),
    D("EXTRA MILANO SALAMI(3 SLICES)", "Extra Milano salami", "Extra toppings", serving="3 slices"),
    D("EXTRA NDUJA", "Extra 'nduja", "Extra toppings"),
    D("EXTRA PANCETTA", "Extra pancetta", "Extra toppings"),
    D("EXTRA BOLOGNAISE", "Extra bolognaise", "Extra toppings"),
    D("EXTRA MUSHROOMS", "Extra mushrooms", "Extra toppings"),
    D("EXTRA OLIVES", "Extra olives", "Extra toppings"),
    D("EXTRA CHILLI", "Extra chilli", "Extra toppings"),
    D("EXTRA CHERRY TOMATO", "Extra cherry tomato", "Extra toppings"),
    D("EXTRA MOZZARELLA", "Extra mozzarella", "Extra toppings"),
    D("EXTRA VEGAN CHEESE", "Extra vegan cheese", "Extra toppings"),
    D("EXTRA TRIPLE BLEND CHEESE", "Extra triple blend cheese", "Extra toppings"),
    D("EXTRA MONTEREY JACK CHEESE", "Extra Monterey Jack cheese", "Extra toppings"),
    D("EXTRA STRACCIATELLA(70G)", "Extra stracciatella", "Extra toppings", weight="70"),
    D("EXTRA GOAT'S CHEESE", "Extra goat's cheese", "Extra toppings"),
    D("CHOCOLATE FONDANT", "Chocolate fondant", "Dessert"),
    D("STICKY TOFFEE PUDDING", "Sticky toffee pudding", "Dessert"),
    D("TORTA DELLA NONNA", "Torta della nonna", "Dessert"),
    D("TIRAMISU", "Tiramisu", "Dessert"),
    D("COOKIES & CREAM CHEESECAKE", "Cookies & cream cheesecake", "Dessert"),
    D("CHOCOLATE BROWNIE", "Chocolate brownie", "Dessert"),
    D("SALTED CARAMEL PROFITEROLS SINGLE", "Salted caramel profiteroles (single)", "Dessert"),
    D("SALTED CARAMEL PROFITEROLS TO SHARE", "Salted caramel profiteroles (to share)", "Dessert"),
    D("ICE CREAM VANILLA(1 SCOOP)", "Vanilla ice cream", "Dessert", serving="1 scoop"),
    D("ICE CREAM CHOCOLATE(1 SCOOP)", "Chocolate ice cream", "Dessert", serving="1 scoop"),
    D("ICE CREAM STRAWBERRY(1 SCOOP)", "Strawberry ice cream", "Dessert", serving="1 scoop"),
    D("ICE CREAM MINT(1 SCOOP)", "Mint ice cream", "Dessert", serving="1 scoop"),
    D("LEMON SORBET(1 SCOOP)", "Lemon sorbet", "Dessert", serving="1 scoop"),
    D("MANGO SORBET(1 SCOOP)", "Mango sorbet", "Dessert", serving="1 scoop"),
    D("RASPBERRY SORBET(1 SCOOP)", "Raspberry sorbet", "Dessert", serving="1 scoop"),
    D("CRISPY WHITEBAIT", "Crispy whitebait", SPECIALS),
    D("ROASTED SALMON", "Roasted salmon", SPECIALS),
    D("SPINACH,RICOTTA & MASCARPONE RAVIOLI", "Spinach, ricotta & mascarpone ravioli", SPECIALS),
    D("TUSCAN MUSSELS & PRAWNS CASSEROLE", "Tuscan mussels & prawns casserole", SPECIALS),
    D("BANOFFE MESS", "Banoffee mess", SPECIALS, note="Printed 'BANOFFE'"),
    D("ANTIPASTO", "Antipasto", SPECIALS),
    D("PIZZA PROSCIUTTO CAPRESE", "Pizza prosciutto caprese", SPECIALS),
    D("GRILLED TUNA", "Grilled tuna", SPECIALS),
    D("SUPPER GREEN & GRAINS", "Supper green & grains", SPECIALS),
    D("ADD CHICKEN", "Add chicken (specials)", SPECIALS),
    D("ADD GOAT CHEESE", "Add goat cheese (specials)", SPECIALS),
    D("ADD HALLOUMI CHEESE", "Add halloumi cheese (specials)", SPECIALS),
    D("RASPBERRY ETON MESS - SUNDAE", "Raspberry Eton mess sundae", SPECIALS),
]
# One dish printed under two names on different sheets (same calories; different calories would be held back as a conflict).
ALIASES = {
    "TUNA & AVOCADO PÂTÉ": "TUNA PATE",
    "GLUTEN AND DAIRY FREE PIZZA DOUGH BASE AVAILABLE": "GLUTEN AND DAIRY FREE PIZZA DOUGH BASE(240G)",
    "ROASTED PERI PERI HALF CHICKEN": "PERI PERI HALF CHICKEN",
    "ADD HALLOUMI": "ADD HALLOUMI CHEESE",
}
# Held back for a reason other than two sheets disagreeing with each other (key -> reason).
HELD = {
    "GLUTEN FREE CASARECCE PASTA AVAILABLE": ("printed as 'available' under Pizza (Main Menu) and Mains (Lunch Set) with no dish or portion it "
                                              "belongs to, so what the calories cover is not stated"),
    "ADD CHICKEN": ("printed as an add-on with no dish or portion on the specials sheet; the August 2026 menu prints 'Add chicken' "
                    "at 90kcal"),
    "ADD GOAT CHEESE": ("printed as an add-on with no dish or portion on the specials sheet; the August 2026 menu prints "
                        "'add goat's cheese' at 145kcal (and 152kcal on pizzas)"),
}
# The chain's printed August 2026 menu contradicts the calorie sheet for these dishes: key -> (text on that menu, kcal it prints).
AUGUST_DIFFS = {
    "TIGER PRAWNS": ("Tiger prawns", "367"),
    "TOMATO & RICOTTA BRUSCHETTA": ("Tomato & ricotta bruschetta", "572"),
}


def norm(name: str) -> str:
    n = name.upper().replace("’", "'")
    n = re.sub(r"\s*\(\s*", "(", n)
    n = re.sub(r"\s*\)\s*", ")", n)
    return " ".join(n.split())


def dish_key(printed: str) -> str:
    k = re.sub(r"\(F\)$", "", norm(printed)).strip()
    return ALIASES.get(k, k)


def fetch(dest: Path, files: list) -> None:
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    dest.mkdir(parents=True, exist_ok=True)
    for name in files:
        req = urllib.request.Request(UPLOADS + name, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (https, fixed host)
            (dest / name).write_bytes(r.read())
        time.sleep(1)


def august_values(pdf: Path) -> dict:
    """{dish key: kcal printed on the August menu} for AUGUST_DIFFS, read from the printed menu; stops if the dish is not found."""
    text = subprocess.run(["pdftotext", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    out = {}
    for key, (label, _) in AUGUST_DIFFS.items():
        m = re.search(re.escape(label) + r"[^\n]*?(\d+)kcal", text)
        if not m:
            raise SystemExit(f"August menu: '{label}' with its kcal was not found: the menu changed, re-check AUGUST_DIFFS")
        out[key] = m.group(1)
    return out


def build(pdfs: Path, august: "Path | None") -> tuple:
    plan = {p["key"]: p for p in PLAN}
    if len(plan) != len(PLAN):
        raise SystemExit("PLAN has a duplicate key")
    dishes: dict = {}  # key -> {"printed": [(menu, section, name, kcal)], "first": index}
    n = 0
    for menu, (fname, label, expected) in SHEETS.items():
        rows = pdf_reader.calorie_rows(pdfs / fname)
        if len(rows) != expected:
            raise SystemExit(f"{fname} has {len(rows)} rows but this script expects {expected}: the sheet changed, re-check PLAN")
        for r in rows:
            key = dish_key(r["name"])
            if key not in plan:
                raise SystemExit(f"{fname}: {r['name']!r} (section {r['section']!r}, {r['kcal']} kcal) is not in PLAN: add it (display name, category)")
            d = dishes.setdefault(key, {"printed": [], "first": n})
            d["printed"].append((menu, r["section"], r["name"], r["kcal"]))
            n += 1
    missing = sorted(set(plan) - set(dishes))
    if missing:
        raise SystemExit(f"PLAN lists dishes no sheet prints any more: {missing}")
    for key in list(HELD) + list(AUGUST_DIFFS):
        if key not in plan:
            raise SystemExit(f"HELD / AUGUST_DIFFS names {key!r}, which is not in PLAN")
    printed_august = august_values(august) if august else {}

    items, holdback, report = [], [], []
    for key in sorted(dishes, key=lambda k: (CATEGORY_ORDER.index(plan[k]["category"]), dishes[k]["first"])):
        p, d = plan[key], dishes[key]
        by_menu: dict = {}
        for menu, _, _, kcal in d["printed"]:
            by_menu.setdefault(menu, set()).add(kcal)
        for menu, vals in by_menu.items():
            if len(vals) > 1:
                raise SystemExit(f"{p['display']}: sheet {menu} prints two different values {sorted(vals)} for the same dish")
        values = {menu: next(iter(v)) for menu, v in by_menu.items()}
        first_menu = d["printed"][0][0]
        calories = values[first_menu]
        reasons = []
        if len(set(values.values())) > 1:
            reasons.append("sheets print different calories for this dish: " +
                           ", ".join(f"{SHEETS[m][1]} {v}" for m, v in values.items()))
        if key in AUGUST_DIFFS:
            label, expected = AUGUST_DIFFS[key]
            if printed_august and printed_august[key] != expected:
                raise SystemExit(f"August menu now prints {printed_august[key]} for {label!r}, the script records {expected}: re-check AUGUST_DIFFS")
            if printed_august and printed_august[key] in values.values() and len(set(values.values())) == 1:
                raise SystemExit(f"The calorie sheets now agree with the August menu for {label!r}: remove it from AUGUST_DIFFS")
            reasons.append(f"the calorie sheets print {'/'.join(sorted(set(values.values())))} but the chain's August 2026 menu prints {expected} for '{label}'")
        if key in HELD:
            reasons.append(HELD[key])
        printed = "; ".join(f"{SHEETS[m][1]} '{nm}' ({sec}) {kc}" for m, sec, nm, kc in d["printed"])
        fried = any("(F)" in nm.upper() for _, _, nm, _ in d["printed"])
        notes = "; ".join(x for x in ["Printed: " + printed, p["note"], "(F) = fried in oil shared with other allergens" if fried else ""] if x)
        text = p["display"] + " " + " ".join(nm for _, _, nm, _ in d["printed"])
        tags = (["contains_pork"] if PORK.search(text) else []) + (["contains_beef"] if BEEF.search(text) else [])
        item = dict(id=p["id"], name=p["display"], category=p["category"], serving=p["serving"], calories=calories, weight_g=p["weight"],
                    tags="|".join(tags), limited_time=p["category"] == SPECIALS, rankable=False, notes=notes)
        items.append(item)
        if reasons:
            holdback.append((p["id"], "; ".join(reasons)))
            report.append(f"held back: {p['display']}: " + "; ".join(reasons))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} dishes, built {len(items)}: the menu changed, re-check PLAN")
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Two dishes share an id: make their display names different")
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdfs", type=Path, required=True, help="folder holding the calorie PDFs (SHEETS)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the sheets were read")
    ap.add_argument("--fetch", action="store_true", help="download the PDFs into --pdfs first (and the August menu with --august-menu)")
    ap.add_argument("--august-menu", action="store_true", help="also check AUGUST_DIFFS against the printed August 2026 menu in --pdfs")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    files = [f for f, _, _ in SHEETS.values()] + ([AUGUST_MENU] if args.august_menu else [])
    if args.fetch:
        fetch(args.pdfs, files)
    for f in files:
        print(f"sha256 {sha256_file(args.pdfs / f)}  {f}")
    items, holdback, report = build(args.pdfs, args.pdfs / AUGUST_MENU if args.august_menu else None)
    if not args.august_menu:
        report.append("August menu cross-check NOT re-run (pass --august-menu); AUGUST_DIFFS hold-backs applied as recorded")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Wildwood", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["wildwood", "wildwood restaurant", "wildwood restaurants"], items=items,
                             out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} dishes ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
