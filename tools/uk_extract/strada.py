#!/usr/bin/env python3
"""Build data/source/strada/ from Strada's official menu with calories (January 2025) and Kids menu (January 2025): a CALORIES-ONLY chain.

    python3 tools/uk_extract/strada.py path/to/menu.pdf --kids-image path/to/kids.jpg --checked-on 2026-10-07 [--out DIR]

Sources (all on strada.co.uk, read 2026-10-07, one download each):
  menu   https://strada.co.uk/wp-content/uploads/2018/05/Southbank-Core-Jan-2025-A4-Calories-WEB.pdf
         "Southbank Core, Jan 2025, A4, Calories": 1 A4 page with a text layer, PDF created 2025-01-28.
  kids   https://strada.co.uk/wp-content/uploads/2025/01/Strada-Jan-2025_Kids-Menu-WEB.jpg
         the "KIDS" menu the chain's own https://strada.co.uk/our-menus/ page still links: an image (no text layer), so it is read by
         OCR (strada_kids.py: needs `tesseract` and Pillow).
Why January 2025: the chain's CURRENT menus (https://strada.co.uk/our-menus/ -> Food and Drink, Desserts, Gluten Free, Group
bookings, Festive, all dated September/October 2026) print NO calories, and no nutrition page exists. The only calorie figures
Strada publishes are on these two January 2025 files, so that is the edition used and the chain's source_title says so. Several
dishes have changed since (e.g. Risotto Funghi e Tartufo, Burrata and Truffle Arancini are on the 2026 menu, Risotto alla Pescatora and
Caprese Salad are not), so the note under the chain tells users to check a dish is still served.

The menus print calories ONLY: protein, carbs, fat, salt etc. are never printed, so they stay blank (docs/DATA.md "Calories-only
chains"; every item is then not rankable). Calories are copied from the files as printed. No basis is printed anywhere on either file
("KCAL" after the dish description): read as per dish as served. Only the item NAMES, categories and tags are written by hand, in
ITEMS and KIDS below: the script stops if the dishes printed on the page differ from those tables (a new, renamed or removed dish, a
moved heading, another number of calorie values), so a human re-checks the tables when Strada publishes a new menu.

How the menu's own wording is read:
- "ANTIPASTI 11.5 / 21 ... 1056 / 1648 KCAL" (and Vegetable Antipasti 11 / 20, 1090 / 1829): two sizes with two prices and two values,
  paired in the order printed. The menu does not label the sizes, so the two items are named by their printed price.
- "Add truffle cream 30 KCAL or peppercorn sauce 154 KCAL 2.5" (under the 8oz sirloin), "ADD CHICKEN 6.5 241 KCAL OR GOAT'S CHEESE 4
  50 KCAL" (under SALADS) and "Add buffalo mozzarella 2 179 KCAL" (under the Margherita): each value is far smaller than the dish, so
  it is the extra's own calories, listed as an item of its own (never a total).
- "Add mozzarella 1 686 KCAL" under the Aglio Flatbread (652 KCAL) is NOT listed: 686 is about the flatbread's own value, so the menu does
  not make clear whether it is the flatbread with mozzarella or the mozzarella alone.
- Not listed, because no calories are printed: APERITIVI (three cocktails), "Add a glass of Prosecco", pizza TOPPINGS. Water (kids drinks)
  prints none. Kids "ICE CREAM (V) 97.5-125kcal" is a range over three flavours with no value per flavour: not listed.
- Marks: "( VG) suitable for vegetarians, ( VE ) suitable for vegans" (menu legend) -> vegetarian. Kids: (V) suitable for vegetarians
  -> vegetarian; (VO) "this dish can be made vegetarian" is NOT vegetarian as served -> no tag.
- Tags contains_pork / contains_beef only where the dish name or description says so (pancetta, prosciutto, ham, 'nduja, pepperoni,
  pork sausage, pork ragu; beef, steak). "Cured meats" (Antipasti), the filling of Arancini Diavola and "spianata piccante" (Strada
  Burger) do not say which meat: no pork tag (listed as "meat type not stated" in the run's report).

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. Strada's allergen guides are dot matrices of a different edition from these
calorie files (SS25 v1.2, June 2025; SS26 full matrix, May 2026), and neither has a row for every January 2025 dish under the same
name (no Risotto alla Pescatora, Rigatoni Ragu Pugliese, Sicilian Tomato & Onion Salad, Supergreen Salad or Pan Fried Sea Bass; the
fish dish is "Seabass"/"Salmon Chickpeas..."). Allergens are safety information: no name matching, no guessing, so only the guide's
link (the current May 2026 matrix, as linked from the chain's menus page) is published.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import strada_pdf as pdf_reader  # noqa: E402
import strada_kids as kids_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "strada"
SOURCE_URL = "https://strada.co.uk/wp-content/uploads/2018/05/Southbank-Core-Jan-2025-A4-Calories-WEB.pdf"
KIDS_URL = "https://strada.co.uk/wp-content/uploads/2025/01/Strada-Jan-2025_Kids-Menu-WEB.jpg"
SOURCE_TITLE = ("Strada Southbank Core menu with calories, January 2025 edition (PDF created 28 January 2025) and Kids menu, January 2025 "
                "(image); Strada's current October 2026 menu prints no calories")
ALIASES = ["strada", "strada restaurant", "strada restaurants", "strada italian"]
ALLERGEN_GUIDE_TITLE = "Strada SS26 full allergen matrix, May 2026 (covers the current menu, not the January 2025 dishes)"
ALLERGEN_GUIDE_URL = "https://strada.co.uk/wp-content/uploads/2026/06/Strada-allergen-Matrix-May-26-1.pdf"
# The matrix legend prints "M = May contain (traces)": traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Calories only (Strada's January 2025 menu and kids menu; its current menu prints none), so some dishes may have changed or gone: "
        "check a dish is still served. No basis is printed: read as per dish. Strada's website now lists one restaurant (Southbank).")

BN, ANT, PAS, MAI, PIZ, SAL, SID, KID = ("Bread & Nibbles", "Antipasti", "Pasta and Risotto", "Mains & Grills", "Pizza", "Salads",
                                         "Sides", "Kids menu")
SECTION_CATEGORY = {"BREAD & NIBBLES": BN, "ANTIPASTI": ANT, "PASTA AND RISOTTO": PAS, "MAINS & GRILLS": MAI, "PIZZA": PIZ,
                    "SALADS": SAL, "SIDES": SID}
CATEGORY_ORDER = [BN, ANT, PAS, MAI, PIZ, SAL, SID, KID]
PORK = re.compile(r"\b(pork|ham|bacon|sausages?|salami|chorizo|pepperoni|pancetta|prosciutto|'?nduja|‘nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
VEG_MARKS = ("VG", "VE")  # the menu's legend: ( VG) suitable for vegetarians, ( VE ) suitable for vegans

# (section heading, printed dish name) -> one slot per KCAL value the dish line prints, in the order printed.
# A slot is (item name, text that must be printed just before its value, note); item name None = value printed but not listed.
# "extra" slots are add-ons: their tags come from their own name, not from the dish's description.
MAIN_SLOT, EXTRA_SLOT, SPLIT_SLOT = "main", "extra", "split"


def S(kind, name, before, note="", split=None):
    return dict(kind=kind, name=name, before=before, note=note, split=split)


ITEMS = {
    ("BREAD & NIBBLES", "LARGE GREEN OLIVES"): [S(MAIN_SLOT, "Large Green Olives", "LARGE GREEN OLIVES")],
    ("BREAD & NIBBLES", "ITALIAN BREADS"): [S(MAIN_SLOT, "Italian Breads", "ITALIAN BREADS")],
    ("BREAD & NIBBLES", "AGLIO FLATBREAD"): [
        S(MAIN_SLOT, "Aglio Flatbread", "AGLIO FLATBREAD"),
        S(EXTRA_SLOT, None, "Add mozzarella", "not listed: 686 is close to the flatbread's own 652, so the menu does not show whether it is "
          "the flatbread with mozzarella or the mozzarella alone")],
    ("BREAD & NIBBLES", "GENOVESE FLATBREAD"): [S(MAIN_SLOT, "Genovese Flatbread", "GENOVESE FLATBREAD")],
    ("ANTIPASTI", "ANTIPASTI"): [
        S(SPLIT_SLOT, "Antipasti (£11.50)", "ANTIPASTI", "two sizes, printed 'ANTIPASTI 11.5 / 21 ... 1056 / 1648 KCAL', paired in the order "
          "printed; the menu does not label the sizes; description: 'Cured meats' (meat type not stated)", split=(0, "11.5 / 21")),
        S(SPLIT_SLOT, "Antipasti (£21)", "ANTIPASTI", "second size: see the £11.50 row", split=(1, "11.5 / 21"))],
    ("ANTIPASTI", "VEGETABLE ANTIPASTI"): [
        S(SPLIT_SLOT, "Vegetable Antipasti (£11)", "VEGETABLE ANTIPASTI", "two sizes, printed 'VEGETABLE ANTIPASTI ( VG) 11 / 20 ... 1090 / 1829 "
          "KCAL', paired in the order printed; the menu does not label the sizes", split=(0, "11 / 20")),
        S(SPLIT_SLOT, "Vegetable Antipasti (£20)", "VEGETABLE ANTIPASTI", "second size: see the £11 row", split=(1, "11 / 20"))],
    ("ANTIPASTI", "SEARED KING PRAWNS"): [S(MAIN_SLOT, "Seared King Prawns", "SEARED KING PRAWNS")],
    ("ANTIPASTI", "BRUSCHETTA"): [S(MAIN_SLOT, "Bruschetta", "BRUSCHETTA")],
    ("ANTIPASTI", "CRISPY SQUID"): [S(MAIN_SLOT, "Crispy Squid", "CRISPY SQUID")],
    ("ANTIPASTI", "ARANCINI DIAVOLA"): [S(MAIN_SLOT, "Arancini Diavola", "ARANCINI DIAVOLA", "description gives only 'Garlic mayo': filling not stated")],
    ("ANTIPASTI", "CAPRESE SALAD"): [S(MAIN_SLOT, "Caprese Salad", "CAPRESE SALAD")],
    ("PASTA AND RISOTTO", "PAPPARDELLE BOLOGNESE"): [S(MAIN_SLOT, "Pappardelle Bolognese", "PAPPARDELLE BOLOGNESE")],
    ("PASTA AND RISOTTO", "CHICKEN & MUSHROOM STROZZAPRETI"): [S(MAIN_SLOT, "Chicken & Mushroom Strozzapreti", "CHICKEN & MUSHROOM STROZZAPRETI")],
    ("PASTA AND RISOTTO", "PENNE POMODORO"): [S(MAIN_SLOT, "Penne Pomodoro", "PENNE POMODORO")],
    ("PASTA AND RISOTTO", "RISOTTO ALLA PESCATORA"): [S(MAIN_SLOT, "Risotto alla Pescatora", "RISOTTO ALLA PESCATORA")],
    ("PASTA AND RISOTTO", "RISOTTO PRIMAVERA"): [S(MAIN_SLOT, "Risotto Primavera", "RISOTTO PRIMAVERA")],
    ("PASTA AND RISOTTO", "SEAFOOD LINGUINE"): [S(MAIN_SLOT, "Seafood Linguine", "SEAFOOD LINGUINE")],
    ("PASTA AND RISOTTO", "RIGATONI RAGU PUGLIESE"): [S(MAIN_SLOT, "Rigatoni Ragu Pugliese", "RIGATONI RAGU PUGLIESE")],
    ("PASTA AND RISOTTO", "BUCATINI CARBONARA"): [S(MAIN_SLOT, "Bucatini Carbonara", "BUCATINI CARBONARA")],
    ("PASTA AND RISOTTO", "SPINACH & RICOTTA RAVIOLI"): [S(MAIN_SLOT, "Spinach & Ricotta Ravioli", "SPINACH & RICOTTA RAVIOLI")],
    ("MAINS & GRILLS", "STRADA BURGER"): [S(MAIN_SLOT, "Strada Burger", "STRADA BURGER", "'spianata piccante' in the description: meat type not stated")],
    ("MAINS & GRILLS", "POLLO FUNGHI"): [S(MAIN_SLOT, "Pollo Funghi", "POLLO FUNGHI")],
    ("MAINS & GRILLS", "CHICKEN MILANESE"): [S(MAIN_SLOT, "Chicken Milanese", "CHICKEN MILANESE")],
    ("MAINS & GRILLS", "ITALIAN STEAK FRITES"): [S(MAIN_SLOT, "Italian Steak Frites", "ITALIAN STEAK FRITES")],
    ("MAINS & GRILLS", "PAN FRIED SEA BASS"): [S(MAIN_SLOT, "Pan Fried Sea Bass", "PAN FRIED SEA BASS")],
    ("MAINS & GRILLS", "8oz BRITISH SIRLOIN STEAK"): [
        S(MAIN_SLOT, "8oz British Sirloin Steak", "8oz BRITISH SIRLOIN STEAK"),
        S(EXTRA_SLOT, "Add truffle cream", "Add truffle cream", "printed under the sirloin steak: 'Add truffle cream 30 KCAL or peppercorn sauce 154 KCAL 2.5'; "
          "the extra's own calories"),
        S(EXTRA_SLOT, "Add peppercorn sauce", "or peppercorn sauce", "see 'Add truffle cream': the extra's own calories")],
    ("PIZZA", "MARGHERITA"): [
        S(MAIN_SLOT, "Margherita", "MARGHERITA"),
        S(EXTRA_SLOT, "Add buffalo mozzarella (to Margherita)", "Add buffalo mozzarella", "printed 'Add buffalo mozzarella 2 179 KCAL' under the Margherita "
          "(873 KCAL): the extra's own calories")],
    ("PIZZA", "PROSCIUTTO COTTO HAM & FUNGHI"): [S(MAIN_SLOT, "Prosciutto Cotto Ham & Funghi", "PROSCIUTTO COTTO HAM & FUNGHI")],
    ("PIZZA", "SALSICCIA & FRIARIELLI"): [S(MAIN_SLOT, "Salsiccia & Friarielli", "SALSICCIA & FRIARIELLI")],
    ("PIZZA", "PARMA"): [S(MAIN_SLOT, "Parma", "PARMA")],
    ("PIZZA", "VESUVIO"): [S(MAIN_SLOT, "Vesuvio", "VESUVIO")],
    ("PIZZA", "CAMPAGNOLA"): [S(MAIN_SLOT, "Campagnola", "CAMPAGNOLA")],
    ("SALADS", "ADD CHICKEN"): [
        S(EXTRA_SLOT, "Add chicken (salads)", "ADD CHICKEN", "printed under the SALADS heading: 'ADD CHICKEN 6.5 241 KCAL OR GOAT'S CHEESE 4 50 KCAL'; "
          "the extra's own calories"),
        S(EXTRA_SLOT, "Add goat’s cheese (salads)", "GOAT’S CHEESE", "see 'Add chicken': the extra's own calories")],
    ("SALADS", "CAESAR SALAD"): [S(MAIN_SLOT, "Caesar Salad", "CAESAR SALAD")],
    ("SALADS", "SUPERGREEN SALAD"): [S(MAIN_SLOT, "Supergreen Salad", "SUPERGREEN SALAD")],
    ("SIDES", "SKINNY FRIES"): [S(MAIN_SLOT, "Skinny Fries", "SKINNY FRIES")],
    ("SIDES", "TRUFFLE FRIES"): [S(MAIN_SLOT, "Truffle Fries", "TRUFFLE FRIES")],
    ("SIDES", "ROASTED NEW POTATOES"): [S(MAIN_SLOT, "Roasted New Potatoes", "ROASTED NEW POTATOES")],
    ("SIDES", "TENDERSTEM BROCCOLI"): [S(MAIN_SLOT, "Tenderstem Broccoli", "TENDERSTEM BROCCOLI")],
    ("SIDES", "GREEN BEANS"): [S(MAIN_SLOT, "Green Beans", "GREEN BEANS", "no description line printed")],
    ("SIDES", "HOUSE SALAD"): [S(MAIN_SLOT, "House Salad", "HOUSE SALAD")],
    ("SIDES", "SICILIAN TOMATO & ONION SALAD"): [S(MAIN_SLOT, "Sicilian Tomato & Onion Salad", "SICILIAN TOMATO & ONION SALAD")],
}
# Dish lines on the page that print a price but no calories (checked on every run; anything else stops the script).
EXPECTED_WITHOUT_KCAL = sorted(["APEROL SPRITZ", "ESPRESSO MARTINI", "PASSION FRUIT MARTINI", "ADD A GLASS OF PROSECCO", "TOPPINGS", "TOPPINGS"])
# Items whose meat the chain's own words do not state (reported, never tagged).
MEAT_NOT_STATED = ["Antipasti (£11.50)", "Antipasti (£21)", "Arancini Diavola", "Strada Burger"]

# Kids menu (OCR): printed name -> (item name, tags it carries because the words are printed, word the OCR block text must show, note)
KIDS = {
    "VEGGIE STICKS": ("Veggie Sticks (kids)", [], "", "Starters"),
    "GRISSINI": ("Grissini (kids)", [], "", "Starters"),
    "MARGHERITA PIZZA": ("Margherita Pizza (kids)", [], "", "Mains: 'all served with a fresh side salad'; the menu does not say whether the value includes it"),
    "PENNE POMODORO": ("Penne Pomodoro (kids)", [], "", "Mains; marked (VO) 'can be made vegetarian', so not tagged vegetarian; see the Margherita note about the side salad"),
    "CHARGRILLED CHICKEN": ("Chargrilled Chicken (kids)", [], "", "Mains; see the Margherita note about the side salad"),
    "LINGUINE BOLOGNESE": ("Linguine Bolognese (kids)", ["contains_beef"], "beef", "Mains: 'Slow cooked beef ragù with Parmesan'; see the Margherita note about the side salad"),
    "PASTA CARBONARA": ("Pasta Carbonara (kids)", ["contains_pork"], "Ham", "Mains: 'Ham, egg & Parmesan'; see the Margherita note about the side salad"),
    "FRESH FRUIT": ("Fresh Fruit (kids)", [], "", "Desserts"),
    "CHOCOLATE & HAZELNUT PIZZETTA": ("Chocolate & Hazelnut Pizzetta (kids)", [], "", "Desserts"),
    "ICE CREAM": (None, [], "", "printed as a range '97.5-125kcal' for a choice of three flavours: not listed"),
    "ICE LOLLY": ("Ice Lolly (kids)", [], "", "Desserts: 'A choice of Pip Organic lollies in apple, berry or tropical'; one value for the choice"),
    "MILK": ("Milk (kids)", [], "", "Drinks; no size printed"),
    "APPLE & PEAR": ("Cawston Press Apple & Pear (kids)", [], "", "Drinks; no size printed"),
    "APPLE & MANGO": ("Cawston Press Apple & Mango (kids)", [], "", "Drinks; no size printed"),
    "APPLE & SUMMER BERRIES": ("Cawston Press Apple & Summer Berries (kids)", [], "", "Drinks; no size printed"),
}


def build_main_items(dishes: list[dict], silent: list[dict]) -> tuple[list[dict], list[str]]:
    found = {}
    for d in dishes:
        k = (d["section"], d["name"])
        if k in found:
            raise SystemExit(f"Dish {k} is printed twice in the same section: check the layout")
        found[k] = d
    new, gone = sorted(set(found) - set(ITEMS)), sorted(set(ITEMS) - set(found))
    if new or gone:
        raise SystemExit(f"The menu changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. "
                         "Update ITEMS (names, categories) after reading the new menu.")
    if sorted(d["name"] for d in silent) != EXPECTED_WITHOUT_KCAL:
        raise SystemExit(f"Dish lines without calories changed: now {sorted(d['name'] for d in silent)}, expected {EXPECTED_WITHOUT_KCAL}")
    items, report = [], []
    for (section, printed), slots in ITEMS.items():
        d = found[(section, printed)]
        values = []  # (value as printed, text before it)
        for raw, before in d["tokens"]:
            parts = [p.strip() for p in raw.split("/")]
            values.append((parts, before))
        if len(values) != len(slots) and not any(s["kind"] == SPLIT_SLOT for s in slots):
            raise SystemExit(f"{printed}: {len(values)} calorie values printed, expected {len(slots)}")
        main_text = d["text"]
        for n, slot in enumerate(slots):
            if slot["kind"] == SPLIT_SLOT:
                index, price = slot["split"]
                parts, before = values[0]
                if d["price"] != price or len(parts) != 2 or len(values) != 1:
                    raise SystemExit(f"{printed}: expected two sizes priced {price} with one 'a / b KCAL' value, got price {d['price']!r}, {values}")
                value = parts[index]
            else:
                parts, before = values[n]
                if len(parts) != 1:
                    raise SystemExit(f"{printed}: value {parts} has two numbers, expected one")
                value = parts[0]
            if slot["before"].lower() not in before.lower():
                raise SystemExit(f"{printed}: the value {value} is printed after {before!r}, expected it to follow {slot['before']!r}")
            if slot["name"] is None:
                report.append(f"not listed: {printed} value {value}: {slot['note']}")
                continue
            tags = []
            if slot["kind"] != EXTRA_SLOT:
                if d["marks"] in VEG_MARKS:
                    tags.append("vegetarian")
                text = printed + " " + main_text
                if PORK.search(text):
                    tags.append("contains_pork")
                if BEEF.search(text):
                    tags.append("contains_beef")
            note = "; ".join(x for x in (f"printed '{printed}{(' (' + d['marks'] + ')') if d['marks'] else ''} {d['price']}'", slot["note"]) if x)
            items.append(dict(name=slot["name"], category=SECTION_CATEGORY[section], calories=value, tags="|".join(tags), rankable=False, notes=note))
    return items, report


def build_kids_items(rows: list[dict]) -> tuple[list[dict], list[str]]:
    if [r["key"] for r in rows] != list(KIDS):
        raise SystemExit(f"Kids menu dishes changed: read {[r['key'] for r in rows]}, expected {list(KIDS)}")
    items, report = [], []
    for r in rows:
        name, tags, needs, note = KIDS[r["key"]]
        if needs and needs not in r["block_text"]:
            raise SystemExit(f"Kids menu: {r['key']} is tagged {tags} because the menu says {needs!r}, but the OCR text of its block does not show it")
        if name is None:
            report.append(f"not listed: kids {r['key']} value {r['value']}: {note}")
            continue
        if not re.fullmatch(r"\d+", r["value"]):
            raise SystemExit(f"Kids menu: {r['key']} value {r['value']!r} is not a single number")
        tags = list(tags)
        if r["mark"] == "V":
            tags.insert(0, "vegetarian")
        mark = f" ({r['mark']})" if r["mark"] else ""
        items.append(dict(name=name, category=KID, calories=r["value"], tags="|".join(tags), rankable=False,
                          notes=f"Kids menu (image, read by OCR), printed '{r['key']}{mark} {r['value']}kcal'; {note}"))
    return items, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL)")
    ap.add_argument("--kids-image", type=Path, required=True, help="the kids menu JPG (KIDS_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the files were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    print(f"kids image sha256 {sha256_file(args.kids_image)}  {args.kids_image}")
    dishes, silent = pdf_reader.read_dishes(args.pdf)
    items, report = build_main_items(dishes, silent)
    kids, kids_report = build_kids_items(kids_reader.read_kids(args.kids_image))
    items += kids
    report += kids_report + kids_reader.DISSENT
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    unstated = [n for n in MEAT_NOT_STATED if n not in names]
    if unstated:
        raise SystemExit(f"MEAT_NOT_STATED names an item that is not built: {unstated}")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Strada", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("\n".join(report))
    print("printed without calories (not listed): " + ", ".join(sorted(set(EXPECTED_WITHOUT_KCAL))))
    print("meat type not stated: " + ", ".join(MEAT_NOT_STATED))


if __name__ == "__main__":
    main()
