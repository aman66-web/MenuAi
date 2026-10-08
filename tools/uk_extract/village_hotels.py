#!/usr/bin/env python3
"""Build data/source/village-hotels/ from Village Hotels' official "Main Pub & Grill Menu" PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/village_hotels.py path/to/menus_cms-document.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own page https://www.village-hotels.co.uk/menus links as "Main Pub & Grill Menu"):
    https://document-tc.galaxy.tf/wdpdf-dfdlwz0h7qnp088413oz3ecl4/menus_cms-document.pdf
    7 pages, Adobe InDesign, PDF created 2026-09-18, served Last-Modified 2026-10-02. Real text layer. Needs `pdftotext` (poppler).
    robots.txt of village-hotels.co.uk only disallows booking paths; the galaxy.tf file host has no robots.txt.

The menu prints calories ONLY, in small type inside each dish's description ("(493 Kcals)"): protein, carbs, fat, salt and every other
nutrient are never printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows
"not published"). Calories are copied from the PDF by script (village_hotels_pdf.py addresses each value by the line that carries it);
only the item NAMES, categories, tags and the anchor line of each value are written by hand in ITEMS below. The script stops when:
a calorie number printed in the PDF is not used by an item or a documented exclusion, an anchor matches no line or several lines, or a
tag's printed words are not on the page. So a new, renamed or moved dish makes a human re-check ITEMS when the menu is reissued.

How the menu's own wording is read:
- "Small x Kcals / Large y Kcals" (Tenders, Wings): one item per size, serving "Small" / "Large".
- Sharing dishes print calories per person for 2 or for 3 people sharing ("2 people sharing - 945 Kcals per person"): one item per
  basis, serving "Per person". Under "Add Chicken ... or Chilli Beef for £4" the same two-line pattern is printed with larger
  numbers (1027, 1018 vs 945): the dish with that extra, per person. Named "Garbage Can Nachos with Chicken (2 sharing)".
- Sides, sauces and upgrades have their own printed calories and are their own items (the wraps, burgers and stacks print their
  calories WITHOUT the "served with" side). Values printed in several places (skin on fries 573, slaw 42, green salad 147, sweet
  potato fries 573, cry fry 932) are one item and must be identical everywhere.
- Spuddy fillings print "(Kcals per serving)" for the filling; the menu does not say whether the potato is included, so the items
  are named "Spuddy filling: ..." and no serving is stated.
- "Upgrade to sweet potato fries (1086 Kcals) for £2" under Loaded Fries prints the same number as Loaded Fries itself: kept as
  printed (it can only be the whole dish, since sweet potato fries alone are 573 elsewhere on the menu).
- "Add Chilli Beef (244 Kcals) for £2" under Loaded Fries is far smaller than the dish: the extra's own calories.
- NOT listed (excluded, written down): "Add Roast Chicken (866 Kcals) for £2.50" under Pasta Primavera (866 is larger than the
  dish's own 696, but the same wording "Add Chilli Beef (244 Kcals)" means the extra's own value on page 2: the basis is unclear, so
  nothing is published); drinks, wines and beers (no calories printed); Spuddy "(OR SPLIT THIS AND ADD A SECOND!)" is not a dish.
- "Get Stuffed This Sunday!" (page 7): roast turkey in a giant Yorkshire pudding, Adults 920 Kcals / Kids 460 Kcals, from 12 noon:
  a printed promotion, so limited_time is true.
- Prices are regional ("PLEASE CHECK AN INDIVIDUAL VILLAGE HOTEL CLUB LOCATION FOR THE CORRECT FOOD PRICING") and are not recorded.

Tags (each is backed by words printed on the item's page, checked on every run): vegetarian only where the menu marks the dish (V);
contains_pork / contains_beef where the dish's name or description says so (bacon, pork, pepperoni, chorizo, sausage, pigs in blankets,
gammon; beef, steak, Wagyu). Gammon (cured pork), Wagyu (a breed of beef cattle) and "pigs in blankets" (pork sausages in bacon) are
names for the meat, not guesses. The four Burger Stacks that print "Red Tractor Certified beef" in the section's introduction are
tagged contains_beef from it; The Village Big Stack ("Three burger patties") says no meat type, so it has no beef tag.

Allergens (docs/DATA.md "Allergens"): none published. The menu says "For full allergen information please see inside the main menu",
but the main menu has no allergen table, and the only allergen table on the site is a one-page matrix for Spuddies fillings
(spuddies_cms-document.pdf), which covers none of the other dishes. All or nothing, so no allergens.csv and no allergen guide link.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import village_hotels_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "village-hotels"
SOURCE_URL = "https://document-tc.galaxy.tf/wdpdf-dfdlwz0h7qnp088413oz3ecl4/menus_cms-document.pdf"
SOURCE_TITLE = "Village Hotels Main Pub & Grill Menu with calories (PDF created 18 September 2026; served last modified 2 October 2026)"
ALIASES = ["village hotels", "village hotel", "village hotels pub & grill", "village pub & grill", "village pub and grill"]
NOTE = ("Calories only, as printed in each dish's description (no protein, carbs, fat or salt). Sharing dishes are per person. "
        "Sides, sauces and upgrades have their own calories and are listed separately. Drinks print none. Prices vary by hotel and "
        "are not shown. Spuddy fillings are 'per serving'; the menu doesn't say whether that includes the potato.")
EXPECTED_ITEMS = 89
EXPECTED_FOOTERS = 4          # "Adults need around 2000 Kcals per day" on the four food pages (2 to 5): not dish values
EXPECTED_VALUES = 99          # calorie numbers printed on the pages (footers excluded); each is used by an item or excluded below

APP, SHA, WRA, SPU, BOW, BUR, STA, PIZ, PAS, PUB, GRI, SID, INC, DES, SUN = (
    "Appetisers & bar snacks", "Sharing", "Wraps", "Spuddies", "Bowls & salads", "Burgers", "Burger stacks", "Pizza", "Pasta",
    "Pub classics", "From the grill", "Sides", "Sides with wraps & burgers", "Desserts", "Sunday lunch")
CATEGORY_ORDER = [APP, SHA, WRA, SPU, BOW, BUR, STA, PIZ, PAS, PUB, GRI, SID, INC, DES, SUN]
BEEF_INTRO = "Red Tractor Certified beef"


def A(page, find, pick=0, y=None):
    """Anchor: the calorie number `pick` (0-based) on the one line of `page` that contains `find` (and sits at height y)."""
    return (page, find, pick, y)


def I(name, cat, src, serving="", pork="", beef="", veg="", note="", limited=False):  # noqa: E741
    """One item: `src` = anchors that must all give the SAME calorie value; pork/beef/veg = the printed words that justify the tag."""
    return dict(name=name, cat=cat, src=src if isinstance(src, list) else [src], serving=serving, pork=pork, beef=beef, veg=veg,
                note=note, limited=limited)


FRIES = [A(2, "Served with a choice of skin on fries", 0), A(4, "Served with skin on fries (573 Kcals) & freshly", 0),
         A(4, "with freshly made slaw (42 Kcals) & a choice of skin on fries", 1), A(4, "fries (573 Kcals) or a green salad", 0, y=387)]
SALAD = [A(2, "Served with a choice of skin on fries", 1), A(4, "with freshly made slaw (42 Kcals) & a choice of skin on fries", 2),
         A(4, "fries (573 Kcals) or a green salad", 1, y=387)]
SLAW = [A(4, "Served with skin on fries (573 Kcals) & freshly", 1), A(4, "with freshly made slaw (42 Kcals) & a choice of skin on fries", 0),
        A(4, "house slaw (42 Kcals) & a choice of skin on", 0)]
SWEET_UP = [A(2, "Upgrade to sweet potato fries (573 Kcals) or cry fry", 0), A(4, "UPGRADE TO SWEET POTATO FRIES (573 Kcals) OR CRY FRY", 0)]
CRY_UP = [A(2, "Upgrade to sweet potato fries (573 Kcals) or cry fry", 1), A(4, "UPGRADE TO SWEET POTATO FRIES (573 Kcals) OR CRY FRY", 1)]
WITH_SIDE = "Served with a choice of side printed separately"

# Printed calorie numbers that are deliberately NOT published (see the docstring): they must still resolve, so a change stops the run.
EXCLUDED = [A(4, "Add Roast Chicken (866 Kcals)", 0)]

ITEMS = [
    # ---- page 2: Appetisers & bar snacks
    I("Tenders (small)", APP, A(2, "recipe. (Small 368 Kcals / Large 730 Kcals)", 0), serving="Small"),
    I("Tenders (large)", APP, A(2, "recipe. (Small 368 Kcals / Large 730 Kcals)", 1), serving="Large"),
    I("Buffalo sauce (dip for Tenders)", APP, A(2, "Buffalo (14 Kcals)")),
    I("Sweet Chilli sauce (dip for Tenders)", APP, A(2, "Sweet Chilli (109 Kcals)")),
    I("Light Garlic Mayo (dip for Tenders)", APP, A(2, "Light Garlic Mayo (117 Kcals)")),
    I("Wings with BBQ sauce (small)", APP, A(2, "BBQ (Small 922 Kcals / Large 1844 Kcals)", 0), serving="Small"),
    I("Wings with BBQ sauce (large)", APP, A(2, "BBQ (Small 922 Kcals / Large 1844 Kcals)", 1), serving="Large"),
    I("Wings with Buffalo sauce (small)", APP, A(2, "Buffalo (Small 872 Kcals / Large 1744 Kcals)", 0), serving="Small"),
    I("Wings with Buffalo sauce (large)", APP, A(2, "Buffalo (Small 872 Kcals / Large 1744 Kcals)", 1), serving="Large"),
    I("Loaded Fries", APP, A(2, "tomato salsa & jalapeños (1086 Kcals)"), veg="LOADED FRIES (V)"),
    I("Loaded Fries upgraded to sweet potato fries", APP, A(2, "potato fries (1086 Kcals) for £2"),
      note="Printed 'Upgrade to sweet potato fries (1086 Kcals) for £2': the same number as Loaded Fries itself"),
    I("Add Chilli Beef (to Loaded Fries)", APP, A(2, "Add Chilli Beef (244 Kcals) for £2"), beef="Add Chilli Beef",
      note="The extra's own calories (far smaller than the dish)"),
    I("Prawn Appetiser Basket", APP, A(2, "dipping sauce (523 Kcals)")),
    I("Burrata & Tomato Salad", APP, A(2, "olive oil & sea salt (302 Kcals)"), veg="TOMATO SALAD (V)"),
    I("Asian Mixed Appetisers", APP, A(2, "chilli dipping sauce (689 Kcals)"), note="A Feast from the East: spring rolls, karaage, popcorn chicken, prawn dumplings"),
    I("Duck Bao Bun Basket", APP, A(2, "chilli & coriander (773 Kcals)")),
    # ---- page 2: Sharing
    I("Garbage Can Nachos (2 sharing)", SHA, A(2, "(2 people sharing - 945 Kcals per person)", 0), serving="Per person", veg="GARBAGE CAN NACHOS (V)"),
    I("Garbage Can Nachos (3 sharing)", SHA, A(2, "(2 people sharing - 945 Kcals per person)", 1), serving="Per person", veg="GARBAGE CAN NACHOS (V)"),
    I("Garbage Can Nachos with Chicken (2 sharing)", SHA, A(2, "(2 people sharing - 1027 Kcals per person)"), serving="Per person",
      note="Printed under 'Add Chicken'; larger than the nachos alone (945), read as the dish with the extra, per person"),
    I("Garbage Can Nachos with Chicken (3 sharing)", SHA, A(2, "(3 people sharing - 684 Kcals per person)"), serving="Per person",
      note="Printed under 'Add Chicken'; larger than the nachos alone (630), read as the dish with the extra, per person"),
    I("Garbage Can Nachos with Chilli Beef (2 sharing)", SHA, A(2, "(2 people sharing - 1018 Kcals per person)"), serving="Per person",
      beef="Chilli Beef", note="Printed under 'or Chilli Beef for £4'; larger than the nachos alone (945), read as the dish with the extra, per person"),
    I("Garbage Can Nachos with Chilli Beef (3 sharing)", SHA, A(2, "(3 people sharing - 679 Kcals per person)"), serving="Per person",
      beef="Chilli Beef", note="Printed under 'or Chilli Beef for £4'; larger than the nachos alone (630), read as the dish with the extra, per person"),
    # ---- page 2: It's a WRAP (the wrap alone; its sides are printed separately)
    I("Grilled Chicken Wrap", WRA, A(2, "in a wholemeal wrap (493 Kcals)"), note=WITH_SIDE),
    I("Buffalo Chicken Wrap", WRA, A(2, "blue cheese sauce, in a wholemeal wrap (541 Kcals)"), note=WITH_SIDE),
    I("Roast Salmon Wrap", WRA, A(2, "Sriracha mayonnaise, in a wholemeal wrap (634 Kcals)"), note=WITH_SIDE),
    # ---- page 3: Spuddies (over stuffed jackets: base filling, sauce, topping)
    I("Spuddy filling: Chicken Tikka", SPU, A(3, "(675 Kcals)"), note="Printed under '(Kcals per serving)'; unclear whether the potato is included"),
    I("Spuddy filling: Beef Chilli with cheese", SPU, A(3, "with cheese (914 Kcals)"), beef="BEEF CHILLI", note="Printed under '(Kcals per serving)'"),
    I("Spuddy filling: Coleslaw", SPU, A(3, "(634 Kcals)"), veg="COLESLAW (V)", note="Printed under '(Kcals per serving)'"),
    I("Spuddy filling: Tuna Mayo", SPU, A(3, "(589 Kcals)"), note="Printed under '(Kcals per serving)'"),
    I("Spuddy filling: Baked Beans & Sausage", SPU, A(3, "(1001 Kcals)"), pork="beans with pork", note="Printed under '(Kcals per serving)'"),
    I("Spuddy filling: Baked Beans with cheese", SPU, A(3, "with cheese (920 Kcals)"), veg="BAKED BEANS (V)", note="Printed under '(Kcals per serving)'"),
    I("Spuddy filling: Coronation Chicken", SPU, A(3, "coriander & fresh lemon (571 Kcals)"), note="Printed under '(Kcals per serving)'"),
    I("Spuddy filling: Egg Mayonnaise", SPU, A(3, "(562 Kcals)"), veg="MAYONNAISE (V)", note="Printed under '(Kcals per serving)'"),
    I("Spuddy sauce: Sour Cream", SPU, A(3, "(19 Kcals)", 0, y=641), note="'Choose a sauce'"),
    I("Spuddy sauce: BBQ Sauce", SPU, A(3, "(13 Kcals)"), note="'Choose a sauce'"),
    I("Spuddy sauce: Hot Sauce", SPU, A(3, "(3 Kcals)"), note="'Choose a sauce'"),
    I("Spuddy sauce: Yoghurt", SPU, A(3, "(19 Kcals)", 0, y=671), note="'Choose a sauce'"),
    I("Spuddy sauce: Garlic Ranch", SPU, A(3, "(36 Kcals)"), note="'Choose a sauce'"),
    I("Spuddy topping: Bacon Bits", SPU, A(3, "(20 Kcals)"), pork="BACON BITS", note="'And pick a topping'"),
    I("Spuddy topping: Parmesan", SPU, A(3, "(39 Kcals)"), note="'And pick a topping'"),
    I("Spuddy topping: Crispy Onion", SPU, A(3, "(60 Kcals)"), note="'And pick a topping'"),
    # ---- page 3: Healthy bowls and salads
    I("Get Shredded! Bowl", BOW, A(3, "cream & salsa (828 Kcals)")),
    I("King Prawn Noodle Bowl", BOW, A(3, "seeds & coriander (612 Kcals)")),
    I("Salmon Mediterranean Bowl", BOW, A(3, "olive oil dressing (883 Kcals)")),
    I("Asian Duck Salad", BOW, A(3, "cashew nuts (747 Kcals)")),
    # ---- page 4: Juicy burgers (the burger alone; sides printed separately)
    I("Gourmet Wagyu Cheese & Bacon Burger", BUR, A(4, "smoked streaky bacon, tomato & lettuce (1246 Kcals)"), pork="CHEESE & BACON BURGER",
      beef="Grilled 6oz Wagyu Burger", note=WITH_SIDE + " (skin on fries and slaw)"),
    I("Hot Honey Chicken Burger", BUR, A(4, "lettuce & tomato (834 Kcals)"), note=WITH_SIDE + " (slaw, fries or salad)"),
    # ---- page 4: Burger stacks (the stack alone; slaw and fries or salad printed separately)
    I("The Chilli Cheese Stack", STA, A(4, "lettuce & tomato (1213 Kcals)"), beef=BEEF_INTRO, note=WITH_SIDE + " (slaw, fries or salad)"),
    I("The Cheese & Bacon Stack", STA, A(4, "& tomato (1099 Kcals)"), pork="& BACON STACK", beef=BEEF_INTRO, note=WITH_SIDE),
    I("The Cheeseburger Stack", STA, A(4, "burger relish & lettuce (1117 Kcals)"), beef=BEEF_INTRO, note=WITH_SIDE),
    I("The BBQ Burger Stack", STA, A(4, "tomato, lettuce & melted cheese (1162 Kcals)"), pork="smoked streaky bacon", beef=BEEF_INTRO, note=WITH_SIDE),
    I("The Peri Peri Stack", STA, A(4, "peri peri sauce, lettuce & tomato (698 Kcals)"), note=WITH_SIDE),
    I("Veggie Stack", STA, A(4, "lettuce & tomato (689 Kcals)"), veg="VEGGIE STACK (V)", note=WITH_SIDE),
    I("The Village Big Stack", STA, A(4, "with beer-battered onion rings (1656 Kcals)"), pork="smoked streaky bacon",
      note="Three burger patties: no meat type is printed"),
    # ---- page 4: Flatbread pizza and pasta
    I("Margherita Pizza", PIZ, A(4, "Italian herbs (787 Kcals)"), veg="MARGHERITA (V)"),
    I("Pepperoni Pizza", PIZ, A(4, "sliced pepperoni (1023 Kcals)"), pork="sliced pepperoni"),
    I("Pepperoni Hot Pizza", PIZ, A(4, "drizzled with hot honey sauce (1105 Kcals)"), pork="sliced pepperoni"),
    I("BBQ Chicken Pizza", PIZ, A(4, "drizzled with BBQ sauce (1109 Kcals)")),
    I("Pasta Primavera", PAS, A(4, "pesto, served with Parmesan cheese (696 Kcals)")),
    # ---- page 5: Pub classics
    I("Fish & Chips", PUB, A(5, "mushy peas & tartar sauce (1308 Kcals)")),
    I("Chicken Katsu Curry", PUB, A(5, "katsu curry sauce, served with fluffy rice (684 Kcals)")),
    I("Chicken Tikka Curry", PUB, A(5, "poppadoms & a mint yoghurt (676 Kcals)")),
    I("Steak Frites", PUB, A(5, "garlic & herb butter (1352 Kcals)"), beef="full-face beef rump"),
    I("Chicken & Chorizo Skewers", PUB, A(5, "basil & lemon dressing (842 Kcals)"), pork="CHICKEN & CHORIZO SKEWERS"),
    # ---- page 5: From the grill
    I("Gammon, Egg & Chips", GRI, A(5, "2 fried eggs (1291 Kcals)"), pork="GAMMON, EGG & CHIPS"),
    I("Tomahawk Pork Chop", GRI, A(5, "chips & peppercorn sauce (1203 Kcals)"), pork="TOMAHAWK PORK CHOP"),
    I("8oz Black Angus Sirloin Steak", GRI, A(5, "& chunky chips (1026 Kcals)"), beef="SIRLOIN STEAK"),
    I("Mixed Grill", GRI, A(5, "tomato & chunky chips (1778 Kcals)"), pork="gammon steak, lamb chop & pork sausage", beef="with a rump steak"),
    I("Peppercorn sauce (add to a grill dish)", GRI, A(5, "(252 Kcals) or bearnaise (309 Kcals)", 0), note="Printed 'Add your choice of peppercorn or bearnaise sauce for £1.50'"),
    I("Bearnaise sauce (add to a grill dish)", GRI, A(5, "(252 Kcals) or bearnaise (309 Kcals)", 1), note="Printed 'Add your choice of peppercorn or bearnaise sauce for £1.50'"),
    # ---- page 5: Sides (cones)
    I("Cone of Onion Rings", SID, A(5, "onion rings (970 Kcals)"), veg="Cone of Onion Rings (V)"),
    I("Cone of Cry Fry", SID, A(5, "onion rings (932 Kcals)"), veg="Cone of Cry Fry (V)", note="Skin on fries and giant beer battered onion rings"),
    I("Cone of Fries", SID, A(5, "Skin on fries (573 Kcals)"), veg="Cone of Fries (V)", note="Same printed value as the skin on fries served with wraps and burgers"),
    I("Cone of Sweet Potato Fries", SID, A(5, "(573 Kcals)", 0, y=420), veg="Cone of Sweet Potato Fries (V)"),
    I("Wedge Salad", SID, A(5, "red onion & tomato (276 Kcals)"), pork="smoked streaky bacon"),
    I("Tenderstem Broccoli", SID, A(5, "citrus dressing (102 Kcals)"), veg="Tenderstem Broccoli (V)"),
    I("Baked Potato", SID, A(5, "Served with butter (571 Kcals)"), veg="Baked Potato (V)"),
    # ---- pages 2 and 4: what the wraps, burgers and stacks are served with (printed in each section's text)
    I("Skin on fries (served with wraps, burgers and stacks)", INC, FRIES, note="Printed in four places, identical"),
    I("Green salad (served with wraps, burgers and stacks)", INC, SALAD, note="Printed in three places, identical"),
    I("Freshly made slaw (served with burgers and stacks)", INC, SLAW, note="Printed in three places, identical"),
    I("Sweet potato fries (upgrade for wraps, burgers and stacks)", INC, SWEET_UP, note="Printed 'for £2', in two places, identical"),
    I("Cry fry (upgrade for wraps, burgers and stacks)", INC, CRY_UP, note="Printed 'for £2', in two places, identical"),
    # ---- page 5: Desserts
    I("Warm Chocolate Fudge Cake", DES, A(5, "(819 Kcals)")),
    I("Sticky Toffee Pudding", DES, A(5, "ice cream & toffee sauce (717 Kcals)")),
    I("Cookie Skillet", DES, A(5, "ice cream (654 Kcals)")),
    I("Blackberry & Apple Crumble with custard", DES, A(5, "crumble, served with custard (504 Kcals)")),
    I("Blackberry & Apple Crumble with vanilla ice cream", DES, A(5, "or vanilla ice cream (521 Kcals)")),
    # ---- page 7: Get Stuffed This Sunday
    I("Roast Turkey in a Giant Yorkshire Pudding (adult)", SUN, A(7, "(920 Kcals)"), serving="Adult", pork="pigs in blankets", limited=True,
      note="'Get stuffed this Sunday!', adults 15 pounds, available from 12 noon, subject to availability"),
    I("Roast Turkey in a Giant Yorkshire Pudding (kids)", SUN, A(7, "(460 Kcals)"), serving="Kids", pork="pigs in blankets", limited=True,
      note="'Get stuffed this Sunday!', kids 10 pounds, available from 12 noon, subject to availability"),
]


def build_items(rd: "pdf_reader.Reader") -> list:
    if rd.footers != EXPECTED_FOOTERS:
        raise SystemExit(f"Expected {EXPECTED_FOOTERS} 'Adults need around 2000 Kcals per day' footers, found {rd.footers}: the pages changed")
    if len(rd.pages) != 7:
        raise SystemExit(f"Expected 7 pages, found {len(rd.pages)}")
    items = []
    for it in ITEMS:
        values = {rd.value(page, find, pick, y) for page, find, pick, y in it["src"]}
        if len(values) != 1:
            raise SystemExit(f"{it['name']}: the places that print its calories disagree: {sorted(values)}")
        page = it["src"][0][0]
        tags = []
        for tag, why in (("vegetarian", it["veg"]), ("contains_pork", it["pork"]), ("contains_beef", it["beef"])):
            if not why:
                continue
            if not rd.printed(page, why):
                raise SystemExit(f"{it['name']}: tag {tag} is justified by {why!r}, which is no longer printed on page {page}")
            tags.append(tag)
        row = dict(name=it["name"], category=it["cat"], calories=values.pop(), tags="|".join(tags), rankable=False, limited_time=it["limited"],
                   notes=it["note"])
        if it["serving"]:
            row["serving"] = it["serving"]
        items.append(row)
    for page, find, pick, y in EXCLUDED:
        rd.value(page, find, pick, y)  # must still resolve; the value is deliberately not published
    left = rd.unaccounted()
    # the excluded values were counted as used above: report them separately so the exclusion stays visible
    if left:
        raise SystemExit("Calorie numbers printed in the PDF that no item uses (new or changed dishes?):\n" + "\n".join(f"  page {p}: {t!r} -> {v}" for p, t, v in left))
    if rd.total_values() != EXPECTED_VALUES:
        raise SystemExit(f"Expected {EXPECTED_VALUES} calorie numbers in the PDF, found {rd.total_values()}: the menu changed")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check ITEMS")
    if [c for c in CATEGORY_ORDER if not any(i["category"] == c for i in items)]:
        raise SystemExit("A category has no items")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    items = build_items(pdf_reader.Reader(args.pdf))
    out = write_chain_folder(chain_id=CHAIN_ID, name="Village Hotels", cuisine="Pub & grill", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("excluded (basis unclear): Add Roast Chicken (866 Kcals) for £2.50 under Pasta Primavera; no allergen files (no complete guide)")


if __name__ == "__main__":
    main()
