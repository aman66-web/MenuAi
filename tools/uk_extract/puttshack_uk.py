#!/usr/bin/env python3
"""Build data/source/puttshack-uk/ from Puttshack UK's own food menu page, menu PDF, kids menu PDF and allergen guides (a CALORIES-ONLY chain).

    python3 tools/uk_extract/puttshack_uk.py --dir DIR --checked-on 2026-10-09 [--fetch] [--out DIR]

DIR holds food.html, menu.pdf, allergens.pdf, kids_menu.pdf and kids_allergens.pdf; --fetch downloads them first (one request each, one per
second). Needs `pdftotext`, `pdftoppm` and `pdfinfo` (poppler). Python 3.9.

Sources (all on www.puttshack.com, robots.txt allows them):
  food.html      https://www.puttshack.com/uk/food-and-drink/   "N kcal" beside each dish (38 values), no date shown. THE source of
                 the published calories. It says "Viewing content for Puttshack UK" and lists Bank, Lakeside, Watford and White City.
  menu.pdf       https://www.puttshack.com/wp-content/uploads/2026/06/Puttshack-Food-Menu-Bank.pdf  (the page's "Download menu";
                 PDF created 29 May 2026, 3 pages, "B 05/26"). Used to CHECK every calorie value (any difference holds that dish
                 back) and for the V / VG marks: the page's own mark text is not usable (it prints V VG gf n on the pepperoni flatbread
                 and the bacon burger), the PDF's marks are.
  allergens.pdf  https://www.puttshack.com/wp-content/uploads/2026/07/PUTTSHACK_ALLERGENS-DIETARY_JULY-26_v8.pdf  (linked from
                 https://www.puttshack.com/uk/allergens/ as "food allergens"; JULY 2026, 8 pages). Read by puttshack_uk_pages.py.
  kids_menu.pdf  https://www.puttshack.com/wp-content/uploads/2026/09/Puttshack-Kids-Menu_Sept26.pdf  (linked from the food page; printed
                 "08.2026", 2 pages): "NNN kcal" beside each of 13 kid-size dishes (added 2026-10-09, see below).
  kids_allergens.pdf  https://www.puttshack.com/wp-content/uploads/2026/09/KidsMenu_Allergens_v1.pdf  (linked from the allergens page as the
                 kids menu allergens; v1, August 2026, 2 pages): same grid as the food guide (same reader), sections MAINS, SIDES, DESSERTS.

The page prints calories ONLY ("962 kcal"): protein, carbs and fat are not printed anywhere, so they stay blank (docs/DATA.md
"Calories-only chains"). No other nutrient, weight or kJ is printed. Only item NAMES, categories and meat tags are typed below; the
script stops if the page's dishes, the PDF's values or the guide's rows are not what ITEMS expects.

Decisions (each is checked by the script on every run):
- "HALLOUMI FRIES" is printed twice on the page (Shareables and Sides) with the same 708 kcal, and twice in the guide with the same
  marks: one item, kept under Shareables.
- A dish whose page calories differ from the menu PDF's is HELD BACK (never chosen between). Today: Onion Rings, 664 on the page,
  644 in the PDF (the PDF's own "Onion rings (2)" add-on prints 180).
- Allergens: all 37 dishes have a row in the guide, so allergens.csv is written. The guide's row names equal the page's names except
  where the page adds a generic word (the page says "FRANK'S FIERY WINGS", "KOREAN KICK WINGS", "AVOCADO CAESAR SALAD", "OG CHEESE
  BURGER"; the guide and the chain's own menu PDF print "FRANK'S FIERY", "KOREAN KICK", "AVOCADO CAESAR", "OG CHEESEBURGER" with the same
  description and calories) or the sauce rows say "SAUCE". GUIDE below names each row explicitly, and the script checks that every
  such name is also printed in the menu PDF (or is the page name plus "SAUCE" inside the guide's SAUCES block). To publish only the guide
  link instead, delete allergens.csv from the chain's folder.
- Add-ons printed only in the menu PDF (American cheese, streaky bacon, onion rings (2), piri piri chicken, BBQ chicken, pulled pork) and
  the Drinks, Group, Christmas and Trejo's Tacos menus are not listed.
- KIDS MENU (added 2026-10-09): 14 items under "Kids mains / sides / desserts", named "Kids ..." because the portions differ from the adult
  dishes (kids House Seasoned Fries 92 kcal, adult 490). Every kcal comes from the kids menu PDF and every allergen row from the kids guide, tied by
  KIDS below: the names are equal except the guide's "(V)" / "(VG)" suffixes (the menu prints "MARGHERITA PIZZA* V 416 kcal" and a second line
  "VG version available 416 kcal") and "DOUBLE CHOCOLATE BROWNIE, CARAMEL SAUCE" (the menu: "DOUBLE CHOCOLATE BROWNIE ... with caramel sauce", which the
  script checks). "Vanilla ice cream: VG version available" prints no calories, so its guide row (VANILLA ICE CREAM (VG)) is not used. A kids side or
  dessert whose allergens differ from the same-named adult dish in the food guide is held back (the chain's two guides disagree; never chosen between).
  Not listed: the Drinks menu (its soft-drink calories look implausible, e.g. Coca-Cola 396 kcal per 250 ml, and its 19-page guide needs its own
  reader) and Trejo's Tacos (its guide prints no calories).
- Tags: vegetarian = the PDF marks the dish V or VG. contains_pork / contains_beef when the name or description says so.
"""
from __future__ import annotations
import argparse
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import puttshack_uk_pages as pg  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "puttshack-uk"
PAGE_URL = "https://www.puttshack.com/uk/food-and-drink/"
MENU_URL = "https://www.puttshack.com/wp-content/uploads/2026/06/Puttshack-Food-Menu-Bank.pdf"
ALLERGEN_URL = "https://www.puttshack.com/wp-content/uploads/2026/07/PUTTSHACK_ALLERGENS-DIETARY_JULY-26_v8.pdf"
KIDS_MENU_URL = "https://www.puttshack.com/wp-content/uploads/2026/09/Puttshack-Kids-Menu_Sept26.pdf"
KIDS_ALLERGEN_URL = "https://www.puttshack.com/wp-content/uploads/2026/09/KidsMenu_Allergens_v1.pdf"
ALLERGEN_PAGE_URL = "https://www.puttshack.com/uk/allergens/"
FILES = {"food.html": PAGE_URL, "menu.pdf": MENU_URL, "allergens.pdf": ALLERGEN_URL, "kids_menu.pdf": KIDS_MENU_URL,
         "kids_allergens.pdf": KIDS_ALLERGEN_URL}
SOURCE_TITLE = ("Puttshack UK food menu page (accessed 9 October 2026, no date shown; its menu PDF was created 29 May 2026) and Kids Menu PDF "
                "(08.2026)")
ALLERGEN_TITLE = "Puttshack allergen & dietary information: food (July 2026, v8) and kids menu (August 2026, v1)"
NOTE = ("Puttshack prints calories only, per dish as served, so protein, carbs and fat are not published. Food and kids menus for Puttshack UK "
        "(puttshack.com/uk/locations lists 4 venues: Bank, Lakeside, Watford, White City); add-ons, drinks, group, Christmas and Trejo's Tacos "
        "menus are not listed.")
EXPECTED_PAGE_DISHES = 38
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

SHARE, FLAT, SALAD, HAND, SIDE, SAUCE, DESS = "Shareables", "Flatbreads", "Salads & bowls", "Handhelds", "Sides", "Sauces", "Desserts"
PAGE_SECTION_TO_CATEGORY = {"Shareables": SHARE, "Flatbreads": FLAT, "Salads & Bowls": SALAD, "Handhelds": HAND, "Sides": SIDE,
                            "SAUCES": SAUCE, "Desserts": DESS}
G_WINGS, G_SHARE, G_FLAT, G_HAND, G_SIG, G_SAUCE, G_SALAD, G_SIDE, G_DESS = (
    "GAME NIGHT WINGS", "SHAREABLES", "SOURDOUGH FLATBREADS", "HANDHELDS", "SIGNATURES", "SAUCES", "SALADS", "SIDES", "DESSERTS")
MENU_SAUCES_AFTER = "Add your favourite to any dish"
KIDS_SECTION_ROWS = {"MAINS", "SIDES", "DESSERTS"}
K_MAINS, K_SIDES, K_DESS = "Kids mains", "Kids sides", "Kids desserts"


def K(printed, name, category, guide, after="", then="", twin=None):
    """A kids menu dish. printed: its name in the kids menu PDF (exact case); name: shown; guide: (kids guide section, row label);
    after/then: see pg.kids_menu_dish; twin: the same-named adult dish's row in the food guide, whose allergens must be equal."""
    return dict(printed=printed, name=name, category=category, guide=guide, after=after, then=then, twin=twin)


KIDS = [
    K("PENNE PASTA BOLOGNESE", "Kids Penne Pasta Bolognese", K_MAINS, ("MAINS", "PENNE PASTA BOLOGNESE")),
    K("HOT DOG, KETCHUP & MAYO", "Kids Hot Dog, Ketchup & Mayo", K_MAINS, ("MAINS", "HOT DOG, KETCHUP & MAYO")),
    K("CHICKEN & WAFFLE", "Kids Chicken & Waffle", K_MAINS, ("MAINS", "CHICKEN & WAFFLE")),
    K("CHEESEBURGER WITH SALTED CRISPS", "Kids Cheeseburger with Salted Crisps", K_MAINS, ("MAINS", "CHEESEBURGER WITH SALTED CRISPS")),
    K("MARGHERITA PIZZA", "Kids Margherita Pizza (V)", K_MAINS, ("MAINS", "MARGHERITA PIZZA (V)")),
    K("VG version available", "Kids Margherita Pizza (VG)", K_MAINS, ("MAINS", "MARGHERITA PIZZA (VG)"), after="MARGHERITA PIZZA"),
    K("PEPPERONI PIZZA", "Kids Pepperoni Pizza", K_MAINS, ("MAINS", "PEPPERONI PIZZA")),
    K("HOUSE SEASONED FRIES", "Kids House Seasoned Fries", K_SIDES, ("SIDES", "HOUSE SEASONED FRIES"), twin=(G_SIDE, "HOUSE SEASONED FRIES")),
    K("CURLY FRIES", "Kids Curly Fries", K_SIDES, ("SIDES", "CURLY FRIES")),
    K("ONION RINGS", "Kids Onion Rings", K_SIDES, ("SIDES", "ONION RINGS"), twin=(G_SIDE, "ONION RINGS")),
    K("RAINBOW SLAW", "Kids Rainbow Slaw", K_SIDES, ("SIDES", "RAINBOW SLAW"), twin=(G_SIDE, "RAINBOW SLAW")),
    K("VANILLA ICE CREAM", "Kids Vanilla Ice Cream", K_DESS, ("DESSERTS", "VANILLA ICE CREAM (V)")),
    K("DOUBLE CHOCOLATE BROWNIE", "Kids Double Chocolate Brownie", K_DESS, ("DESSERTS", "DOUBLE CHOCOLATE BROWNIE, CARAMEL SAUCE"),
      then="with caramel sauce", twin=(G_DESS, "DOUBLE CHOCOLATE BROWNIE")),
    K("OREO DOUGHNUT", "Kids Oreo Doughnut", K_DESS, ("DESSERTS", "OREO DOUGHNUT")),
]
KIDS_GUIDE_UNUSED = {("DESSERTS", "VANILLA ICE CREAM (VG)")}  # "VG version available" under the ice cream prints no calories


def E(section, page, name, pdf, guide, after="", drop=False):
    """section/page: as the food page prints them; name: shown; pdf: the dish's name in the menu PDF (exact case); guide: (the guide's
    section, its row label). drop: an exact repeat of another item (see the docstring)."""
    return dict(section=section, page=page, name=name, pdf=pdf, guide=guide, after=after, drop=drop)


ITEMS = [
    E("Shareables", "MAC 'N' CHEESE BITES", "Mac 'n' Cheese Bites", "MAC 'N' CHEESE BITES", (G_SHARE, "MAC 'N' CHEESE BITES")),
    E("Shareables", "BUTTERMILK CHICKEN TENDERS", "Buttermilk Chicken Tenders", "BUTTERMILK CHICKEN TENDERS", (G_SHARE, "BUTTERMILK CHICKEN TENDERS")),
    E("Shareables", "SMOKEY CORN RIBLETS", "Smokey Corn Riblets", "SMOKEY CORN RIBLETS", (G_SHARE, "SMOKEY CORN RIBLETS")),
    E("Shareables", "LOADED NACHOS", "Loaded Nachos", "LOADED NACHOS", (G_SHARE, "LOADED NACHOS")),
    E("Shareables", "HALLOUMI FRIES", "Halloumi Fries", "HALLOUMI FRIES", (G_SHARE, "HALLOUMI FRIES")),
    E("Shareables", "FRANK'S FIERY WINGS", "Frank's Fiery Wings", "FRANK'S FIERY", (G_WINGS, "FRANK'S FIERY")),
    E("Shareables", "KOREAN KICK WINGS", "Korean Kick Wings", "KOREAN KICK", (G_WINGS, "KOREAN KICK")),
    E("Shareables", "SKEWER TOWER", "Skewer Tower", "SKEWER TOWER", (G_SHARE, "SKEWER TOWER")),
    E("Flatbreads", "PEPPERONI", "Pepperoni Flatbread", "PEPPERONI", (G_FLAT, "PEPPERONI")),
    E("Flatbreads", "THE VEGGIE", "The Veggie Flatbread", "THE VEGGIE", (G_FLAT, "THE VEGGIE")),
    E("Flatbreads", "MARGHERITA", "Margherita Flatbread", "MARGHERITA", (G_FLAT, "MARGHERITA")),
    E("Flatbreads", "TEXAS BBQ", "Texas BBQ Flatbread", "TEXAS BBQ", (G_FLAT, "TEXAS BBQ")),
    E("Flatbreads", "WILD MUSHROOM", "Wild Mushroom Flatbread", "WILD MUSHROOM", (G_FLAT, "WILD MUSHROOM")),
    E("Salads & Bowls", "AVOCADO CAESAR SALAD", "Avocado Caesar Salad", "AVOCADO CAESAR", (G_SALAD, "AVOCADO CAESAR")),
    E("Salads & Bowls", "SUPER FOOD GRAIN BOWL", "Super Food Grain Bowl", "SUPERFOOD GRAIN BOWL", (G_SALAD, "SUPER FOOD GRAIN BOWL")),
    E("Handhelds", "OG CHEESE BURGER", "OG Cheese Burger", "OG CHEESEBURGER", (G_SIG, "OG CHEESEBURGER")),
    E("Handhelds", "NASHVILLE HOT HONEY CHICKEN BURGER", "Nashville Hot Honey Chicken Burger", "NASHVILLE HOT HONEY CHICKEN BURGER",
      (G_SIG, "NASHVILLE HOT HONEY CHICKEN BURGER")),
    E("Handhelds", "BBQ BACON JALAPEÑO CHEESEBURGER", "BBQ Bacon Jalapeño Cheeseburger", "BBQ BACON JALAPEÑO CHEESEBURGER",
      (G_SIG, "BBQ BACON JALAPEÑO CHEESEBURGER")),
    E("Handhelds", "PLANT POWER BURGER", "Plant Power Burger", "PLANT POWER BURGER", (G_SIG, "PLANT POWER BURGER")),
    E("Handhelds", "CHICKEN TINGA TACOS", "Chicken Tinga Tacos", "CHICKEN TINGA", (G_HAND, "CHICKEN TINGA TACOS")),
    E("Handhelds", "MANGO HABANERO SHRIMP TACOS", "Mango Habanero Shrimp Tacos", "MANGO HABANERO SHRIMP", (G_HAND, "MANGO HABANERO SHRIMP TACOS")),
    E("Handhelds", "POLISH BOY STREET DOG", "Polish Boy Street Dog", "POLISH BOY", (G_HAND, "POLISH BOY STREET DOG")),
    E("Handhelds", "BUFFALO CHICKEN STREET DOG", "Buffalo Chicken Street Dog", "BUFFALO CHICKEN", (G_HAND, "BUFFALO CHICKEN STREET DOG")),
    E("Sides", "HOUSE SEASONED FRIES", "House Seasoned Fries", "House Seasoned Fries", (G_SIDE, "HOUSE SEASONED FRIES")),
    E("Sides", "SWEET POTATO FRIES", "Sweet Potato Fries", "Sweet Potato Fries", (G_SIDE, "SWEET POTATO FRIES")),
    E("Sides", "POTATO TOTS", "Potato Tots", "Potato Tots", (G_SIDE, "POTATO TOTS")),
    E("Sides", "ONION RINGS", "Onion Rings", "Onion Rings", (G_SIDE, "ONION RINGS")),
    E("Sides", "RAINBOW SLAW", "Rainbow Slaw", "Rainbow Slaw", (G_SIDE, "RAINBOW SLAW")),
    E("Sides", "HALLOUMI FRIES", "Halloumi Fries", "Halloumi Fries", (G_SIDE, "HALLOUMI FRIES"), drop=True),
    E("SAUCES", "BBQ", "BBQ Sauce", "BBQ", (G_SAUCE, "BBQ SAUCE"), after=MENU_SAUCES_AFTER),
    E("SAUCES", "Peri Peri", "Peri Peri Sauce", "Peri Peri", (G_SAUCE, "PERI PERI SAUCE"), after=MENU_SAUCES_AFTER),
    E("SAUCES", "Tzatziki", "Tzatziki", "Tzatziki", (G_SAUCE, "TZATZIKI"), after=MENU_SAUCES_AFTER),
    E("SAUCES", "Aioli", "Aioli", "Aioli", (G_SAUCE, "AIOLI"), after=MENU_SAUCES_AFTER),
    E("SAUCES", "Chipotle Mayo", "Chipotle Mayo", "Chipotle Mayo", (G_SAUCE, "CHIPOTLE MAYO"), after=MENU_SAUCES_AFTER),
    E("SAUCES", "Ranch", "Ranch Sauce", "Ranch", (G_SAUCE, "RANCH SAUCE"), after=MENU_SAUCES_AFTER),
    E("Desserts", "STRAWBERRIES & CREAM, COOKIE DOUGH SUNDAE", "Strawberries & Cream, Cookie Dough Sundae",
      "STRAWBERRIES & CREAM, COOKIE DOUGH SUNDAE", (G_DESS, "STRAWBERRIES & CREAM, COOKIE DOUGH SUNDAE")),
    E("Desserts", "NEW YORK CHEESECAKE", "New York Cheesecake", "NEW YORK CHEESECAKE", (G_DESS, "NEW YORK CHEESECAKE")),
    E("Desserts", "DOUBLE CHOCOLATE BROWNIE", "Double Chocolate Brownie", "DOUBLE CHOCOLATE BROWNIE", (G_DESS, "DOUBLE CHOCOLATE BROWNIE")),
]
# Dishes held back because their allergen row contradicts the dish's own listed ingredient (never guessed at; independent re-read 2026-10-08).
# Each dish lists a sauce whose own row in the same guide marks MUSTARD (and egg) as contained, but the dish's row marks mustard only as
# "may contain" (and, for the flatbread, egg only as "may contain"): the guide's allergen row understates it.
ALLERGEN_HOLDBACK = {
    "mac-n-cheese-bites": "Allergen row contradicts the dish's ingredients: the dish is served with aioli, whose own row in the guide marks egg and "
                          "mustard as contained, but this row marks mustard only as 'may contain'.",
    "texas-bbq-flatbread": "Allergen row contradicts the dish's ingredients: the dish is topped with ranch, whose own row in the guide marks egg, dairy "
                           "and mustard as contained, but this row marks egg and mustard only as 'may contain' (the same generic caption as the other "
                           "four flatbreads).",
}
# Rows the guide prints that are not dishes on the page (add-ons): allowed, not published.
ADDON_ROWS = {"RANCH SAUCE", "BBQ SAUCE", "CHIPOTLE MAYO", "BBQ CHICKEN", "PULLED PORK", "AIOLI", "DRY CURED STREAKY BACON", "AMERICAN CHEESE",
              "ONION RINGS (2 UNITS)", "PIRI PIRI CHICKEN"}
PORK = re.compile(r"\b(pork|bacon|ham|pepperoni|salami|chorizo|sausages?)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|short-rib)\b", re.I)


def norm(s: str) -> str:
    return " ".join(s.replace("‘", "'").replace("’", "'").upper().split())


def fetch_all(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for i, (fname, url) in enumerate(FILES.items()):
        if i:
            time.sleep(1.2)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            (folder / fname).write_bytes(r.read())


def meat_tags(name: str, desc: str) -> list[str]:
    desc = desc.split(" ADD ")[0]  # "ADD BBQ Chicken or Pulled Pork" on the nachos is an add-on line, not the dish
    text = re.sub(r"chicken sausage", " ", f"{name} {desc}", flags=re.I)  # a chicken sausage is not pork
    tags = []
    if PORK.search(text):
        tags.append("contains_pork")
    if BEEF.search(text):
        tags.append("contains_beef")
    return tags


def build_kids(folder: Path, adult_guide: dict):
    """The kids menu: (items, holdback, report). kcal from the kids menu PDF, allergens from the kids guide (same grid reader as the food guide)."""
    text = pg.kids_menu_text(folder / "kids_menu.pdf")
    kguide = pg.read_allergen_pdf(folder / "kids_allergens.pdf", section_rows=KIDS_SECTION_ROWS)
    used, items, holdback, report = set(), [], [], []
    names = set()
    for k in KIDS:
        kcal, marks = pg.kids_menu_dish(text, k["printed"], k["after"], k["then"])
        if k["printed"].startswith("VG "):
            marks = ["VG"]  # the menu's second Margherita line reads "VG version available 416 kcal"
        if k["guide"] not in kguide:
            raise SystemExit(f"{k['name']}: the kids allergen guide has no row {k['guide']}")
        label, base = k["guide"][1], norm(k["after"] or k["printed"])
        allowed = {base}
        if label.endswith(" (V)"):
            allowed.add(base + " (V)") if "V" in marks or "VG" in marks else None
        if label.endswith(" (VG)"):
            allowed.add(base + " (VG)") if "VG" in marks else None
        if k["then"]:
            allowed.add(base + ", " + k["then"].replace("with ", "").upper())
        if label not in allowed:
            raise SystemExit(f"{k['name']}: kids guide row {label!r} is not the menu's name ({sorted(allowed)}): the tie is not exact")
        if k["name"] in names:
            raise SystemExit(f"KIDS gives two dishes the name {k['name']!r}")
        names.add(k["name"])
        used.add(k["guide"])
        row = kguide[k["guide"]]
        a_contains, a_cereals, a_nuts = allergen_words(sorted(row["contains"]) + sorted(row["cereals"]), f"{k['name']} contains")
        a_may, _, _ = allergen_words(sorted(row["may"]), f"{k['name']} may contain")
        tags = ["vegetarian"] if any(m in ("V", "VG") for m in marks) else []
        tags += meat_tags(k["name"], "")
        it = {"name": k["name"], "id": slug(k["name"]), "category": k["category"], "serving": "Kid-size portion", "calories": kcal,
              "tags": "|".join(tags), "rankable": False,
              "notes": f"Kids menu PDF (08.2026): {kcal} kcal, marks: {' '.join(marks) or 'none'}; kids guide row {label}",
              "allergens": {"contains": a_contains, "may_contain": a_may, "cereals": a_cereals, "nuts": a_nuts}}
        if k["twin"]:
            if k["twin"] not in adult_guide:
                raise SystemExit(f"{k['name']}: the food guide has no row {k['twin']} to compare with")
            theirs = adult_guide[k["twin"]]
            if (row["contains"], row["may"], row["cereals"]) != (theirs["contains"], theirs["may"], theirs["cereals"]):
                holdback.append((it["id"], f"The chain's kids guide and food guide list different allergens for the same dish ({k['twin'][1].title()}): "
                                 f"kids contains {sorted(row['contains'])}, may contain {sorted(row['may'])}; food guide contains {sorted(theirs['contains'])}, "
                                 f"may contain {sorted(theirs['may'])}. Not chosen between."))
                report.append(f"HELD BACK {k['name']}: kids and food guides disagree on its allergens")
        items.append(it)
    extra = sorted(r for r in kguide if r not in used and r not in KIDS_GUIDE_UNUSED)
    if extra:
        raise SystemExit(f"The kids allergen guide has rows nobody uses: {extra}. New dish? Update KIDS / KIDS_GUIDE_UNUSED.")
    unused_missing = sorted(KIDS_GUIDE_UNUSED - set(kguide))
    if unused_missing:
        raise SystemExit(f"KIDS_GUIDE_UNUSED names rows the kids guide no longer has: {unused_missing}")
    for it in items:
        if meat_unspecified(it["name"]):
            report.append(f"meat type not stated: {it['name']}")
    return items, holdback, report


def meat_unspecified(name: str) -> bool:
    return bool(re.search(r"\b(hot dog|cheeseburger|burger|bolognese)\b", name, re.I)) and not meat_tags(name, "")


def build(folder: Path):
    page = pg.read_menu_page((folder / "food.html").read_text(encoding="utf-8"))
    if len(page) != EXPECTED_PAGE_DISHES:
        raise SystemExit(f"The food page prints {len(page)} calorie values, this script expects {EXPECTED_PAGE_DISHES}: re-check ITEMS.")
    by_key = {}
    for d in page:
        k = (d["section"], norm(d["name"]))
        if k in by_key:
            raise SystemExit(f"The page prints {k} twice in one section")
        by_key[k] = d
    table = {(e["section"], norm(e["page"])): e for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (section, page name)")
    new, gone = sorted(set(by_key) - set(table)), sorted(set(table) - set(by_key))
    if new or gone:
        raise SystemExit(f"The page changed. Printed but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. Update ITEMS.")
    if [(d["section"], norm(d["name"])) for d in page] != [(e["section"], norm(e["page"])) for e in ITEMS]:
        raise SystemExit("The page lists the dishes in a different order from ITEMS: re-check ITEMS")

    pdf_text = pg.menu_pdf_text(folder / "menu.pdf")
    guide = pg.read_allergen_pdf(folder / "allergens.pdf")
    used_rows = set()
    items, holdback, report = [], [], []
    first_halloumi = None
    for e in ITEMS:
        d = by_key[(e["section"], norm(e["page"]))]
        pdf_kcal, pdf_marks = pg.menu_pdf_dish(pdf_text, e["pdf"], e["after"])
        if e["drop"]:
            twin = first_halloumi
            if not twin or twin["calories"] != d["kcal"] or pdf_kcal != d["kcal"] or guide[e["guide"]] != guide[twin["_guide"]]:
                raise SystemExit("The second Halloumi Fries is no longer an exact repeat of the first (page, PDF or guide differ)")
            report.append("dropped exact repeat: Halloumi Fries under Sides (same 708 kcal, same marks in the PDF and guide)")
            used_rows.add(e["guide"])
            continue
        # guide row: must exist; its name must be explained (equal to the page name, the menu PDF's name, or page name + SAUCE)
        if e["guide"] not in guide:
            raise SystemExit(f"{e['name']}: the allergen guide has no row {e['guide']}")
        label = e["guide"][1]
        if label not in (norm(e["page"]), norm(e["pdf"])) and not (e["guide"][0] == G_SAUCE and label == norm(e["page"]) + " SAUCE"):
            raise SystemExit(f"{e['name']}: guide row {label!r} is not the page's name, the menu PDF's name or the page name + SAUCE")
        used_rows.add(e["guide"])
        row = guide[e["guide"]]
        a_contains, a_cereals, a_nuts = allergen_words(sorted(row["contains"]) + sorted(row["cereals"]), f"{e['name']} contains")
        a_may, _, _ = allergen_words(sorted(row["may"]), f"{e['name']} may contain")
        tags = []
        if any(m in ("V", "VG") for m in pdf_marks):
            tags.append("vegetarian")
        tags += meat_tags(e["name"], d["desc"])
        it = {"name": e["name"], "id": slug(e["name"].replace("ñ", "n")), "category": PAGE_SECTION_TO_CATEGORY[e["section"]], "serving": "", "calories": d["kcal"],
              "tags": "|".join(tags), "rankable": False,
              "notes": f"Page: {d['name']} {d['kcal']} kcal; menu PDF marks: {' '.join(pdf_marks) or 'none'}; page marks (not used): {' '.join(d['marks']) or 'none'}",
              "allergens": {"contains": a_contains, "may_contain": a_may, "cereals": a_cereals, "nuts": a_nuts}, "_guide": e["guide"]}
        if pdf_kcal != d["kcal"]:
            holdback.append((it["id"], f"The page prints {d['kcal']} kcal but the chain's own menu PDF prints {pdf_kcal} kcal for the same dish; not chosen between"))
            report.append(f"HELD BACK {e['name']}: page {d['kcal']} kcal, menu PDF {pdf_kcal} kcal")
        if e["name"] == "Halloumi Fries":
            first_halloumi = it
        items.append(it)
    ids = {it["id"] for it in items}
    if set(ALLERGEN_HOLDBACK) - ids:
        raise SystemExit(f"ALLERGEN_HOLDBACK names dishes that no longer exist: {sorted(set(ALLERGEN_HOLDBACK) - ids)}")
    held = {h[0] for h in holdback}
    for item_id, why in ALLERGEN_HOLDBACK.items():
        if item_id not in held:
            holdback.append((item_id, why))
            report.append(f"HELD BACK {item_id}: allergen row contradicts the dish's own sauce")
    extra = sorted(r for r in guide if r not in used_rows and not (r[0] == "ADD ON'S" and r[1] in ADDON_ROWS))
    if extra:
        raise SystemExit(f"The allergen guide has rows nobody uses: {extra}. New dish? Update ITEMS / ADDON_ROWS.")
    for it in items:
        it.pop("_guide", None)
    kitems, kholdback, kreport = build_kids(folder, guide)
    return items + kitems, holdback + kholdback, report + kreport


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, required=True, help="folder with food.html, menu.pdf, allergens.pdf, kids_menu.pdf, kids_allergens.pdf")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the files were downloaded / read")
    ap.add_argument("--fetch", action="store_true", help="download the five files into --dir first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.dir)
    for fname in FILES:
        print(f"{fname} sha256 {sha256_file(args.dir / fname)}")
    items, holdback, report = build(args.dir)
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_PAGE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Puttshack", cuisine="Mini golf diner", source_title=SOURCE_TITLE, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=["puttshack", "puttshack uk", "putt shack"], items=items, out=args.out,
                             note=NOTE, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    cats = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
