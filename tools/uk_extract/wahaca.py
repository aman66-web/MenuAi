#!/usr/bin/env python3
"""Build data/source/wahaca/ from Wahaca's official table menu with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/wahaca.py path/to/menu.pdf --checked-on 2026-10-07 [--allergen-pdf path/to/allergens.pdf] [--out DIR]

Source (the file the chain's own page links as "Menu with Calories"):
    https://www.wahaca.co.uk/mexican-menu-full/  ->  button "Menu with Calories" -> https://www.wahaca.co.uk/full-menu
    (HTTP 301) -> https://www.wahaca.co.uk/wp-content/uploads/2026/03/0304_WAH_Main_Estate_Table_Menu_KCAL_Summer_050326.pdf
    The page prints "WAH-Summer-050326"; PDF created 2026-03-23, served Last-Modified 2026-03-25. One A3 page with a text layer.
Needs `pdftotext` (poppler). The page is read by position: see wahaca_pdf.py.

The menu prints calories ONLY ("542kcal" after a dish's description): protein, carbs and fat are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published"). Calories are copied from
the PDF as printed. Only the item NAMES, categories and tags are written by hand, in SECTION_ITEMS below: the script stops if the
dishes printed on the page differ from this table (a new, renamed or removed dish, a moved heading, another number of calorie
values), so a human re-checks the table when Wahaca publishes a new menu.

How the menu's own wording is read:
- A dish with a choice of two options, each with its own price, is one item per option; its calories are the value printed with the
  option. "Butter Bean & Confit Garlic Dip ... Topped with: Jalapeno oil 6.75 574kcal / Trealy Farm sobrasada chorizo 7.25 634kcal":
  the dip alone has no price or calories (the options carry the full dish price and value). The Sunshine Bowl's "With:" lines
  are read the same way: they print the dish's full price (14.95, 13.95), so the value beside each is the whole bowl, not an extra.
  Churros print two values, one per sauce ("a rich chocolate sauce 642kcal or dulce de leche caramel 584kcal").
- "Add chilli oil +25p 49kcal" sits under Guacamole (542kcal) and is far smaller than the dish: it is the oil's own calories, so it
  is an item of its own ("Add chilli oil (to Guacamole)"), not a Guacamole total.
- Names get the dish type added where the menu's section title carries it ("Pork Pibil" under TACOS -> "Pork Pibil Tacos"), which also
  keeps names unique (Pork Pibil, Grilled Chicken and Roast Ancho Mushroom each appear as tacos, bowls or burritos). The Wahaca for One
  and Feasting menus use the same names ("Buttermilk Chicken Tacos", "Grilled Brindisa Chorizo Quesadilla").
- No serving is stated per dish (tacos are described as two soft tortillas in some columns only), so `serving` stays blank.
- Not listed, because the menu prints no calories for them: MINI MARG TRIO (cocktails), WAHACA FOR ONE and FEASTING MENUS (set
  menus of dishes already listed), The Frozen Flight (alcoholic ice cream and sorbet scoops), drinks (not on this menu).
- "NEW" before a dish name is a menu marker, not a limited-time flag, so limited_time stays false.
- Tags: vegetarian when the dish line carries the menu's own v or vg mark. contains_pork / contains_beef when the dish's name or
  description says so (pork, chorizo, sobrasada, bacon, ham, sausage; beef). Nothing else is inferred.

Allergens (docs/DATA.md "Allergens") are link-only. Wahaca's own allergen guide (WAH.SUM2026.V3, back of house guide, 7 pages) is a
dot matrix whose row names are the kitchen's names, not the menu's ("House nachos with chorizo" for Chorizo Nachos, "Salsa trio" for
Trio of Fresh Salsas, "Grilled chorizo", "Mushroom burrito", "Frijoles", "Chocolate mole cake" for Warm Chocolate & Pecan Cake,
"Grilled achiote seabass" for the taco board, "Guacamole with chilli oil" for the 49 kcal add-on), several cells hold ingredient text
instead of a dot, and some menu dishes have no row under any name. Allergens are safety information: no name matching, no guessing,
so only the guide's link is published (all or nothing).

Re-checked 2026-10-09 (allergen pass, with a reader for the guide's grid, wahaca_allergen_pdf.py, which reads all 7 pages: 87 dish rows with a PLU number):
same answer, link-only stays. Of the 44 published dishes only 29 have a guide row whose name has the same words (case, punctuation, "&",
plural, the menu's dish type); 15 have none (Butter Bean dip with Trealy Farm sobrasada chorizo is "...with sobrasada", Add chilli oil
(to Guacamole) is only "Guacamole with chilli oil" for the whole dish, Chorizo Nachos is "House nachos with chorizo", Grilled Seabass
Taco Board is "Grilled achiote seabass", Grilled Brindisa Chorizo Quesadilla is "Grilled chorizo", the four Sunshine Bowls are "Sunshine bowl
base" and "With grilled chicken / halloumi / sweet potato", Frijoles Crema is "Frijoles", Frijoles Chorizo is "Frijoles with sobrasada",
Trio of Fresh Salsas is "Salsa trio", the two Churros are "Churros y chocolate" and "Churros and cajeta caramel" (cajeta is not dulce de
leche), Warm Chocolate & Pecan Cake is "Chocolate mole cake"): 34% of the menu would have to be held back, more than the about one third
that leaves the contract (docs/DATA.md "all or nothing") worth publishing. The guide also marks many cells with ingredient text instead
of a dot (read as "present", as its key says). wahaca_allergen_pdf.py is kept but NOT used; if the owner approves the 15 row names
(or accepts the loss of those dishes) it can be wired in the way dim_t.py wires dim_t_allergen_pdf.py.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wahaca_pdf as pdf_reader  # noqa: E402
from common import ROOT, sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "wahaca"
SOURCE_URL = "https://www.wahaca.co.uk/wp-content/uploads/2026/03/0304_WAH_Main_Estate_Table_Menu_KCAL_Summer_050326.pdf"
SOURCE_TITLE = "Wahaca table menu with calories, Summer 2026 (WAH-Summer-050326; PDF created 23 March 2026)"
ALIASES = ["wahaca"]
ALLERGEN_GUIDE_TITLE = "Wahaca back of house allergen & dietary requirements guide, Summer menu 2026 (WAH.SUM2026.V3, 7 pages)"
ALLERGEN_GUIDE_URL = "https://www.wahaca.co.uk/wp-content/uploads/2026/07/BOH-allergy-guides-Summer-Menu-2026-V3-Summer-specials-1.pdf"
# The guide prints that the kitchen cooks in an open kitchen with nuts and other allergens throughout, cannot guarantee against cross
# contamination, and marks deep-fried dishes with an asterisk for possible traces: traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Wahaca prints calories only, beside each dish, so protein, carbs and fat are not published. Cocktails, drinks, the Frozen Flight "
        "and the set menus print no calories and are not listed.")
EXPECTED_ITEMS = 44
# Dish lines on the page that print a price but no calories (checked on every run; anything else stops the script).
EXPECTED_WITHOUT_KCAL = {"MINI MARG TRIO", "For when sharing’s not on the table", "The Frozen Flight"}

ENT, TAC, QUE, PLA, SUN, BUR, SID, SAL, DES = ("Entradas", "Tacos", "Quesadillas", "Platitos", "Sunshine Bowls", "Burritos", "Sides",
                                                "Salsas", "Desserts")
PORK = re.compile(r"\b(pork|chorizo|sobrasada|bacon|ham|sausage|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)


def E(section, printed, name, cat, note="", id=None):
    return dict(section=section, printed=printed, name=name, cat=cat, note=note, id=id)


# One entry per dish line the PDF prints with calories, grouped as the menu is read (left to right, top to bottom), keyed by the
# section's heading as printed and the dish's printed name. The Churros entry is expanded below (two printed values).
OPTION = "Printed as an option with its own full price; the dip alone has no price or calories"
BOWL = "Printed under 'With:' with the bowl's full price, so the value is for the whole bowl"
ITEMS = [
    E("ENTRADAS", "Jalapeño oil", "Butter Bean & Confit Garlic Dip with Jalapeño oil", ENT, OPTION,
      id="butter-bean-and-confit-garlic-dip-with-jalapeno-oil"),  # slug() would turn the n-tilde into a hyphen
    E("ENTRADAS", "Trealy Farm sobrasada chorizo", "Butter Bean & Confit Garlic Dip with Trealy Farm sobrasada chorizo", ENT, OPTION),
    E("ENTRADAS", "Guacamole", "Guacamole", ENT),
    E("ENTRADAS", "Add chilli oil", "Add chilli oil (to Guacamole)", ENT, "Printed +25p under Guacamole: the oil's own calories, not a Guacamole total"),
    E("ENTRADAS", "Chorizo Nachos", "Chorizo Nachos", ENT),
    E("ENTRADAS", "House Nachos", "House Nachos", ENT),
    E("TACOS", "Pork Pibil", "Pork Pibil Tacos", TAC, "Printed 'Pork Pibil 7.95'; the same dish name is also a burrito"),
    E("TACOS", "Roast Ancho Mushroom", "Roast Ancho Mushroom Tacos", TAC, "Same printed value (310) as the Sweet Potato side"),
    E("TACOS", "Beef Gringa", "Beef Gringa Tacos", TAC),
    E("TACOS", "Plantain", "Plantain Tacos", TAC),
    E("TACOS", "‘Halloumi’ Al Pastor", "‘Halloumi’ Al Pastor Tacos", TAC),
    E("TACOS", "Grilled Chicken & Avocado", "Grilled Chicken & Avocado Tacos", TAC),
    E("TACOS", "Buttermilk Chicken", "Buttermilk Chicken Tacos", TAC),
    E("TACOS", "Baja Fish", "Baja Fish Tacos", TAC),
    E("GRILLED SEABASS TACO BOARD", "Fillet of Achiote Marinated Seabass", "Grilled Seabass Taco Board", TAC,
      "Printed 'Ideal for one, or to share 793kcal'; same printed value as the Warm Chocolate & Pecan Cake"),
    E("QUESADILLAS", "Grilled Ajillo Chicken Club", "Grilled Ajillo Chicken Club Quesadilla", QUE),
    E("QUESADILLAS", "Black Bean & Three Cheese", "Black Bean & Three Cheese Quesadilla", QUE),
    E("QUESADILLAS", "Grilled Brindisa Chorizo", "Grilled Brindisa Chorizo Quesadilla", QUE),
    E("PLATITOS", "Sweet Potato & Feta Taquito", "Sweet Potato & Feta Taquito", PLA),
    E("PLATITOS", "Crispy Cauliflower Bites", "Crispy Cauliflower Bites", PLA, "Same printed value (642) as the Churros with chocolate sauce and the Sweet Potato 'Bravas'"),
    E("PLATITOS", "Smoky Pork Belly Skewer", "Smoky Pork Belly Skewer", PLA),
    E("PLATITOS", "Yellowfin Tuna Tostadas", "Yellowfin Tuna Tostadas", PLA, "Marked NEW on the menu"),
    E("PLATITOS", "Chipotle Glazed Aubergine", "Chipotle Glazed Aubergine", PLA, "Marked NEW on the menu"),
    E("PLATITOS", "Corn, Bean & Feta Tostadas", "Corn, Bean & Feta Tostadas", PLA),
    E("SUNSHINE BOWLS", "Sunshine Bowl", "Sunshine Bowl", SUN, "Marked NEW on the menu"),
    E("SUNSHINE BOWLS", "‘Halloumi’ Al Pastor", "Sunshine Bowl with ‘Halloumi’ Al Pastor", SUN, BOWL),
    E("SUNSHINE BOWLS", "Garlic Sweet Potato", "Sunshine Bowl with Garlic Sweet Potato", SUN, BOWL),
    E("SUNSHINE BOWLS", "Grilled Chicken", "Sunshine Bowl with Grilled Chicken", SUN, BOWL),
    E("BURRITOS", "Roast Ancho Mushroom", "Roast Ancho Mushroom Burrito", BUR),
    E("BURRITOS", "Grilled Chicken", "Grilled Chicken Burrito", BUR),
    E("BURRITOS", "Pork Pibil", "Pork Pibil Burrito", BUR),
    E("BURRITOS", "Slow-Cooked Beef", "Slow-Cooked Beef Burrito", BUR),
    E("SIDES", "Sweet Potato", "Sweet Potato", SID, "Same printed value (310) as the Roast Ancho Mushroom Tacos"),
    E("SIDES", "Sweet Potato ‘Bravas’", "Sweet Potato ‘Bravas’", SID, "Same printed value (642) as the Crispy Cauliflower Bites"),
    E("SIDES", "Frijoles Crema", "Frijoles Crema", SID),
    E("SIDES", "Frijoles Chorizo", "Frijoles Chorizo", SID),
    E("SIDES", "Grilled Tenderstem Broccoli", "Grilled Tenderstem Broccoli", SID),
    E("SIDES", "Avocado, Cos & Rocket Salad", "Avocado, Cos & Rocket Salad", SID),
    E("SALSAS", "Trio of Fresh Salsas", "Trio of Fresh Salsas", SAL, "One value for the trio (Tomatillo, Habanero, Macha)"),
    E("SALSAS", "House Hot Sauce", "House Hot Sauce", SAL),
    E("DESSERTS", "Churros", None, DES),  # two printed values: see CHURROS
    E("DESSERTS", "Ice Cream Sundae", "Ice Cream Sundae", DES),
    E("DESSERTS", "Warm Chocolate & Pecan Cake", "Warm Chocolate & Pecan Cake", DES, "Same printed value (793) as the Grilled Seabass Taco Board"),
]
# The Churros dish line prints two values on two description lines: (text the value's line must contain, item name).
CHURROS = [("chocolate sauce", "Churros with chocolate sauce"), ("dulce de leche caramel", "Churros with dulce de leche caramel")]
CATEGORY_ORDER = [ENT, TAC, QUE, PLA, SUN, BUR, SID, SAL, DES]


def build_items(dishes: list[dict], without_kcal: list[dict]) -> list[dict]:
    key = lambda section, printed: (section, printed)  # noqa: E731
    found = {}
    for d in dishes:
        k = key(d["section"], d["name"])
        if k in found:
            raise SystemExit(f"Dish {k} is printed twice in the same section: check the layout")
        found[k] = d
    table = {key(e["section"], e["printed"]): e for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (section, printed name)")
    new, gone = sorted(set(found) - set(table)), sorted(set(table) - set(found))
    if new or gone:
        raise SystemExit(f"The menu changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. "
                         "Update ITEMS (names, categories) after reading the new menu.")
    silent = {d["name"] for d in without_kcal}
    if silent != EXPECTED_WITHOUT_KCAL:
        raise SystemExit(f"Dish lines without calories changed: now {sorted(silent)}, expected {sorted(EXPECTED_WITHOUT_KCAL)}")
    items = []
    for e in ITEMS:
        d = found[key(e["section"], e["printed"])]
        text = " ".join(d["desc"])
        tags = []
        if any(m in ("v", "vg") for m in d["marks"]):
            tags.append("vegetarian")
        if PORK.search((e["name"] or e["printed"]) + " " + text):
            tags.append("contains_pork")
        if BEEF.search((e["name"] or e["printed"]) + " " + text):
            tags.append("contains_beef")
        printed_note = f"Printed '{d['name']} {d['price']}'" + (" NEW" if d["new"] else "") + (f", marks: {' '.join(d['marks'])}" if d["marks"] else "")
        if e["name"] is None:  # Churros
            if len(d["kcal"]) != len(CHURROS):
                raise SystemExit(f"Churros print {len(d['kcal'])} calorie values, expected {len(CHURROS)}")
            for (value, line_text), (phrase, name) in zip(sorted(d["kcal"], key=lambda kv: text.index(kv[1])), CHURROS):
                if phrase not in line_text:
                    raise SystemExit(f"Churros value {value} is on the line {line_text!r}, expected it to mention {phrase!r}")
                items.append(dict(name=name, category=e["cat"], calories=value, tags="|".join(tags), rankable=False,
                                  notes=f"{printed_note}; two sauces, two printed values (line: {line_text!r})"))
            continue
        if len(d["kcal"]) != 1:
            raise SystemExit(f"{e['name']}: {len(d['kcal'])} calorie values found, expected 1")
        items.append(dict(name=e["name"], id=e["id"], category=e["cat"], calories=d["kcal"][0][0], tags="|".join(tags), rankable=False,
                          notes="; ".join(x for x in (printed_note, e["note"]) if x)))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check ITEMS")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--allergen-pdf", type=Path, help="Wahaca's allergen guide PDF (only to print its SHA-256)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    if args.allergen_pdf:
        print(f"allergen PDF sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    dishes, without_kcal = pdf_reader.read_dishes(args.pdf)
    items = build_items(dishes, without_kcal)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Wahaca", cuisine="Mexican", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("printed without calories (not listed): " + ", ".join(sorted(EXPECTED_WITHOUT_KCAL)))


if __name__ == "__main__":
    main()
