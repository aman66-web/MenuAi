#!/usr/bin/env python3
"""Build data/source/british-garden-centres/ from the Gardener's Retreat restaurant menu with calories (a CALORIES-ONLY chain).

    python3 tools/uk_extract/british_garden_centres.py path/to/GR-Menu-Online-March2026.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own page links as "The menu is in PDF format"):
    https://www.britishgardencentres.com/departments/the-gardeners-retreat-restaurant/
    -> https://www.britishgardencentres.com/wp-content/uploads/2026/03/GR-Menu-Online-March2026.pdf
    PDF created 2026-03-17 (Adobe InDesign), served Last-Modified 2026-03-17; 12 pages, a text layer, 7.5 MB. robots.txt does not
    disallow /wp-content/uploads. Needs `pdftotext` and `pdfinfo` (poppler). The pages are read by position: see
    british_garden_centres_pdf.py.

The menu prints calories ONLY ("1593 kcal" in or after a dish's description, or beside its name): protein, carbs, fat, salt and the
rest are never printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows
"not published"). Calories are copied from the PDF as printed, 97 figures on pages 4 to 10. Only the item NAMES, categories and
vegetarian tags are written by hand, in ITEMS below: the script stops if a figure is not found where the table says (a new,
renamed or removed dish, a moved heading, another number of figures, other words before a figure), so a human re-checks the table
when the chain publishes a new menu.

How the menu's own wording is read:
- One item per printed figure. A dish served two ways ("With chips: 802 kcal, with salad: 544 kcal") is two items, "(with chips)"
  and "(with salad)". An add-on printed under a dish with its own figure ("Add Chips 337 kcal.", "Add Black Pudding 167kcal") is an
  item of its own, named "Add X (to <dish>)", placed after its dish: the figure is the add-on's own calories, not a dish total.
  The same add-on is printed more than once with different values (chips 337, 338 or 250 kcal; black pudding 167 kcal under three
  dishes and in the Breakfast Add Ons box), so each printed figure is kept as printed.
- "Served with Egg 122 kcal or Pineapple 40 kcal. Add both" sits under the 8oz Gammon Steak (which is topped with "your choice of
  fried egg or grilled pineapple"): the menu does not say whether 949 kcal includes the topping, so both are listed as add-ons with
  the printed line in the notes. The Chicken Combo's "Choose your sauce BBQ 83 kcal Ranch 158 kcal or Indian Sweet Chilli 60 kcal"
  is read the same way.
- Names get the dish type added where the section title carries it ("Ham" under SANDWICHES -> "Ham Sandwich"); jacket potato fillings
  are "<filling> Jacket Potato" so that "Cheese" and "Baked Beans" stay unique next to their add-on twins.
- The three vegetarian mains on page 7's left-hand column have no heading of their own: they sit on the page after "Main Meals" (served
  from 11.30am) and are filed there.
- Not listed, because the menu prints no calories for them: Carvery, Afternoon Tea, Soup of the Day ("see specials boards"), the
  specials board, loyalty offers and every drink (page 3 and 9 text).
- "NEW" before a dish name is a menu marker, not a limited-time flag, so limited_time stays false. "Gluten free option available"
  lines are not data and are not used.
- Tags: vegetarian only where the menu's own green V mark is drawn beside the dish (the marks are vector drawings, not text, so they
  are read from the rendered pages and written in ITEMS as veg=True; Sausage Sandwich is marked V because vegetarian sausages are
  available, but its default is "2 pork sausages", so it is NOT tagged). contains_pork / contains_beef when the dish's name or its
  description says so (pork, bacon, ham, gammon, sausage; beef). "Black Pudding" names no meat: untagged, listed in the report as
  "meat type not stated".

Allergens (docs/DATA.md "Allergens"): none. The chain publishes no allergen guide (its restaurant page and the menu say only to speak
to a member of the team; the menu says all food is prepared in a kitchen where nuts, gluten and other allergens could be present), so
there is nothing to copy and no allergen_guide.csv: the app then shows no allergen section for this chain.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import british_garden_centres_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "british-garden-centres"
SOURCE_URL = "https://www.britishgardencentres.com/wp-content/uploads/2026/03/GR-Menu-Online-March2026.pdf"
SOURCE_TITLE = "Gardener's Retreat Restaurant menu with calories, March 2026 (GR-Menu-Online-March2026.pdf; PDF created 17 March 2026)"
ALIASES = ["british garden centres", "gardener's retreat", "gardeners retreat", "the gardener's retreat", "the gardeners retreat restaurant"]
NOTE = ("Calories only, as printed beside each dish in the Gardener's Retreat restaurant menu (March 2026): protein, carbs, fat and salt "
        "are not published. Add-ons are listed separately. Carvery, afternoon tea, soup, specials and drinks print no calories and are "
        "not listed. Menus can vary by centre. No allergen guide is published (ask a team member).")
EXPECTED_ITEMS = 97
EXPECTED_TITLES = {
    4: ["Breakfast"], 5: ["BreakfastAddOns"], 6: ["MainMeals"], 7: ["Burgers"], 8: ["LightBites", "Salads"],
    9: ["JacketPotatoes", "JacketPotatoAddOns", "Wraps", "SoupoftheDay"], 10: ["Sandwiches", "Ciabattas", "Sides"],
}
# Name lines on the menu pages that print no calories (checked on every run; anything else stops the script).
EXPECTED_WITHOUT_KCAL = set()

BRK, BAO, MAIN, BUR, LB, SAL, JAC, JAO, WRP, SAN, CIA, SID = (
    "Breakfast", "Breakfast Add Ons", "Main Meals", "Burgers", "Light Bites", "Salads", "Jacket Potatoes", "Jacket Potato Add Ons",
    "Wraps", "Sandwiches", "Ciabattas", "Sides")
PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausages?|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
VEG_SAUSAGE = re.compile(r"vegetarian sausages?", re.I)


def K(page, heading, idx, ends, name, cat, veg=False, meat=True, note="", nth=0):
    """One printed figure: the idx-th figure (0-based, reading order) of the nth name line `heading` on `page`, which must be printed
    right after the words `ends`. meat=False for add-ons (the dish's description is not theirs)."""
    return dict(page=page, heading=heading, nth=nth, idx=idx, ends=ends, name=name, cat=cat, veg=veg, meat=meat, note=note)


BP = "Add Black Pudding"
ADD_CHIPS = "Add Chips"
ITEMS = [
    # ---- page 4: Breakfast (served 9am to 11:00am)
    K(4, "The Big Breakfast", 0, "toast", "The Big Breakfast", BRK, note="Includes choice of tea or filter coffee (printed)"),
    K(4, "The Big Breakfast", 1, BP, "Add Black Pudding (to The Big Breakfast)", BRK, meat=False),
    K(4, "Full English Breakfast", 0, "toast", "Full English Breakfast", BRK),
    K(4, "Full English Breakfast", 1, BP, "Add Black Pudding (to Full English Breakfast)", BRK, meat=False),
    K(4, "Loaded Breakfast Omelette", 0, "cheese", "Loaded Breakfast Omelette", BRK),
    K(4, "Loaded Breakfast Omelette", 1, BP, "Add Black Pudding (to Loaded Breakfast Omelette)", BRK, meat=False),
    K(4, "The Big Veggie", 0, "toast", "The Big Veggie", BRK, veg=True, note="Includes choice of tea or filter coffee (printed)"),
    K(4, "Vegetarian Breakfast", 0, "toast", "Vegetarian Breakfast", BRK, veg=True),
    K(4, "Loaded Vegetarian Omelette", 0, "cheese", "Loaded Vegetarian Omelette", BRK, veg=True),
    # ---- page 5: Breakfast (continued) and Breakfast Add Ons
    K(5, "Eggs Benedict", 0, "watercress", "Eggs Benedict", BRK),
    K(5, "Scrambled Eggs & Smoked Salmon", 0, "watercress", "Scrambled Eggs & Smoked Salmon", BRK),
    K(5, "Breakfast Muffin", 0, "egg", "Breakfast Muffin", BRK),
    K(5, "Bacon Sandwich", 0, "bacon", "Bacon Sandwich", BRK),
    K(5, "Sausage Sandwich", 0, "sausages", "Sausage Sandwich", BRK,
      note="Printed with a V mark and 'Vegetarian sausages available', but the dish as described is '2 pork sausages': not tagged vegetarian"),
    K(5, "Toast & Preserves", 0, "preserve", "Toast & Preserves", BRK, veg=True),
    K(5, "Fried Egg", 0, "", "Fried Egg", BAO, veg=True, meat=False),
    K(5, "1 Rasher of Bacon", 0, "1 Rasher of Bacon", "1 Rasher of Bacon", BAO),
    K(5, "2 Hash Browns", 0, "2 Hash Browns", "2 Hash Browns", BAO, meat=False),
    K(5, "1 Slice of Black Pudding", 0, "1 Slice of Black Pudding", "1 Slice of Black Pudding", BAO, meat=False,
      note="Meat type not stated"),
    K(5, "A Slice of Toasted White or Brown Bread", 0, "", "A Slice of Toasted White or Brown Bread", BAO, veg=True, meat=False),
    K(5, "1 Vegetarian Sausage", 0, "", "1 Vegetarian Sausage", BAO, veg=True, meat=False),
    # ---- page 6: Main Meals (served from 11.30am)
    K(6, "8oz Gammon Steak", 0, "peas", "8oz Gammon Steak", MAIN, note="Topped with 'your choice of fried egg or grilled pineapple' (printed)"),
    K(6, "8oz Gammon Steak", 1, "Served with Egg", "Add Egg (to 8oz Gammon Steak)", MAIN, meat=False,
      note="Printed 'Served with Egg 122 kcal or Pineapple 40 kcal. Add both'; the menu does not say whether 949 kcal includes the topping"),
    K(6, "8oz Gammon Steak", 2, "or Pineapple", "Add Pineapple (to 8oz Gammon Steak)", MAIN, meat=False,
      note="Printed 'Served with Egg 122 kcal or Pineapple 40 kcal. Add both'; the menu does not say whether 949 kcal includes the topping"),
    K(6, "Traditional Beef Lasagne", 0, "ciabatta", "Traditional Beef Lasagne", MAIN),
    K(6, "Traditional Beef Lasagne", 1, ADD_CHIPS, "Add Chips (to Traditional Beef Lasagne)", MAIN, meat=False, note="Printed 337 kcal (chips are 338 kcal elsewhere)"),
    K(6, "Breaded Scampi", 0, "sauce", "Breaded Scampi", MAIN),
    K(6, "Italian Chicken", 0, "garnish", "Italian Chicken", MAIN),
    K(6, "Smothered BBQ Chicken", 0, "garnish", "Smothered BBQ Chicken", MAIN),
    K(6, "Loaded Brunch Omelette", 0, "garnish", "Loaded Brunch Omelette", MAIN),
    K(6, "Loaded Brunch Omelette", 1, ADD_CHIPS, "Add Chips (to Loaded Brunch Omelette)", MAIN, meat=False, note="Printed 337 kcal (chips are 338 kcal elsewhere)"),
    K(6, "NEW Chicken Combo", 0, "chips", "Chicken Combo", MAIN, note="Marked NEW on the menu"),
    K(6, "NEW Chicken Combo", 1, "Choose your sauce BBQ", "Add BBQ sauce (to Chicken Combo)", MAIN, meat=False,
      note="Printed 'Choose your sauce BBQ 83 kcal Ranch 158 kcal or Indian Sweet Chilli 60 kcal'"),
    K(6, "NEW Chicken Combo", 2, "Ranch", "Add Ranch sauce (to Chicken Combo)", MAIN, meat=False,
      note="Printed 'Choose your sauce BBQ 83 kcal Ranch 158 kcal or Indian Sweet Chilli 60 kcal'"),
    K(6, "NEW Chicken Combo", 3, "or Indian Sweet Chilli", "Add Indian Sweet Chilli sauce (to Chicken Combo)", MAIN, meat=False,
      note="Printed 'Choose your sauce BBQ 83 kcal Ranch 158 kcal or Indian Sweet Chilli 60 kcal'"),
    K(6, "Chicken Tikka Masala", 0, "bread", "Chicken Tikka Masala", MAIN),
    K(6, "Sausage, Egg and Chips", 0, "beans", "Sausage, Egg and Chips", MAIN),
    # ---- page 7: the vegetarian mains (no heading of their own, filed under Main Meals) and Burgers
    K(7, "Cream Cheese & Broccoli Bake", 0, "ciabatta", "Cream Cheese & Broccoli Bake", MAIN, veg=True,
      note="No section heading printed; sits on the page after Main Meals"),
    K(7, "Cream Cheese & Broccoli Bake", 1, ADD_CHIPS, "Add Chips (to Cream Cheese & Broccoli Bake)", MAIN, meat=False),
    K(7, "Red Thai Vegetable Curry", 0, "bread", "Red Thai Vegetable Curry", MAIN, veg=True,
      note="No section heading printed; sits on the page after Main Meals. Described as 'A vegan mix of vegetables'"),
    K(7, "Red Thai Vegetable Curry", 1, ADD_CHIPS, "Add Chips (to Red Thai Vegetable Curry)", MAIN, meat=False),
    K(7, "Vegetarian Loaded Omelette", 0, "garnish", "Vegetarian Loaded Omelette", MAIN, veg=True,
      note="No section heading printed; sits on the page after Main Meals"),
    K(7, "Vegetarian Loaded Omelette", 1, ADD_CHIPS, "Add Chips (to Vegetarian Loaded Omelette)", MAIN, meat=False),
    K(7, "Classic Cheeseburger", 0, "cheese", "Classic Cheeseburger", BUR),
    K(7, "Brie & Bacon Burger", 0, "chutney", "Brie & Bacon Burger", BUR),
    K(7, "Ranch Chicken Burger", 0, "cheese", "Ranch Chicken Burger", BUR),
    K(7, "Beetroot, Red Pepper & Quinoa Burger", 0, "chutney", "Beetroot, Red Pepper & Quinoa Burger", BUR, veg=True,
      note="Printed 'Vegan without coleslaw'"),
    # ---- page 8: Light Bites (served from 11.30am; small chips and salad garnish) and Salads
    K(8, "Battered Chicken Bites", 0, "Battered Chicken Bites", "Battered Chicken Bites (Light Bite)", LB),
    K(8, "Breaded Scampi", 0, "Breaded Scampi", "Breaded Scampi (Light Bite)", LB),
    K(8, "4oz Gammon Steak", 0, "4oz Gammon Steak", "4oz Gammon Steak (Light Bite)", LB),
    K(8, "Ploughman’s Platter", 0, "bread", "Ploughman's Platter", SAL),
    K(8, "Ploughman’s Platter", 1, ADD_CHIPS, "Add Chips (to Ploughman's Platter)", SAL, meat=False),
    K(8, "Shredded Crispy Chicken with a Ranch Dressing", 0, "croutons", "Shredded Crispy Chicken Salad with a Ranch Dressing", SAL,
      note="Printed under Salads; the photo caption calls it 'Shredded Crispy Chicken Salad with a Ranch Dressing'"),
    K(8, "Shredded Crispy Chicken with a Ranch Dressing", 1, ADD_CHIPS, "Add Chips (to Shredded Crispy Chicken Salad with a Ranch Dressing)", SAL, meat=False),
    K(8, "Prawns, Smoked Salmon and Marie Rose Sauce", 0, "sauce", "Prawns, Smoked Salmon and Marie Rose Sauce Salad", SAL,
      note="Printed under Salads. Same printed value (341) as the Beetroot, Red Pepper and Quinoa Burger Salad"),
    K(8, "Prawns, Smoked Salmon and Marie Rose Sauce", 1, ADD_CHIPS, "Add Chips (to Prawns, Smoked Salmon and Marie Rose Sauce Salad)", SAL, meat=False,
      note="Printed 250 kcal; the other salads print 338 kcal for chips"),
    K(8, "Beetroot, Red Pepper and Quinoa Burger Salad", 0, "chutney", "Beetroot, Red Pepper and Quinoa Burger Salad", SAL,
      note="Same printed value (341) as the Prawns, Smoked Salmon and Marie Rose Sauce Salad"),
    K(8, "Beetroot, Red Pepper and Quinoa Burger Salad", 1, ADD_CHIPS, "Add Chips (to Beetroot, Red Pepper and Quinoa Burger Salad)", SAL, meat=False),
    # ---- page 9: Jacket Potatoes (butter, salad garnish and a filling), Add Ons and Wraps
    K(9, "Cheese", 0, "", "Cheese Jacket Potato", JAC, veg=True, nth=0),
    K(9, "Baked Beans", 0, "", "Baked Beans Jacket Potato", JAC, veg=True, nth=0),
    K(9, "Tuna Mayonnaise", 0, "Tuna Mayonnaise", "Tuna Mayonnaise Jacket Potato", JAC),
    K(9, "Sticky BBQ pulled pork", 0, "Sticky BBQ pulled pork", "Sticky BBQ Pulled Pork Jacket Potato", JAC),
    K(9, "Prawns & Smoked Salmon in a Marie Rose Sauce", 0, "Marie Rose Sauce", "Prawns & Smoked Salmon in a Marie Rose Sauce Jacket Potato", JAC),
    K(9, "Homemade Coleslaw", 0, "", "Homemade Coleslaw (jacket potato add-on)", JAO, veg=True, meat=False),
    K(9, "Cheese", 0, "", "Cheese (jacket potato add-on)", JAO, veg=True, meat=False, nth=1),
    K(9, "Baked Beans", 0, "", "Baked Beans (jacket potato add-on)", JAO, veg=True, meat=False, nth=1),
    K(9, "BBQ Pulled Pork and Mixed Leaves", 0, "With chips", "BBQ Pulled Pork and Mixed Leaves Wrap (with chips)", WRP),
    K(9, "BBQ Pulled Pork and Mixed Leaves", 1, "with salad", "BBQ Pulled Pork and Mixed Leaves Wrap (with salad)", WRP),
    K(9, "Cauliflower Wings, Indian Sweet Chilli Sauce and Mixed Leaves", 0, "With chips",
      "Cauliflower Wings, Indian Sweet Chilli Sauce and Mixed Leaves Wrap (with chips)", WRP, veg=True),
    K(9, "Cauliflower Wings, Indian Sweet Chilli Sauce and Mixed Leaves", 1, "with salad",
      "Cauliflower Wings, Indian Sweet Chilli Sauce and Mixed Leaves Wrap (with salad)", WRP, veg=True),
    K(9, "Shredded Crispy Chicken, Sticky BBQ Sauce & Mixed Leaves", 0, "With chips",
      "Shredded Crispy Chicken, Sticky BBQ Sauce & Mixed Leaves Wrap (with chips)", WRP),
    K(9, "Shredded Crispy Chicken, Sticky BBQ Sauce & Mixed Leaves", 1, "with salad",
      "Shredded Crispy Chicken, Sticky BBQ Sauce & Mixed Leaves Wrap (with salad)", WRP),
    K(9, "Shredded Crispy Chicken, Ranch Dressing & Mixed Leaves", 0, "With chips",
      "Shredded Crispy Chicken, Ranch Dressing & Mixed Leaves Wrap (with chips)", WRP),
    K(9, "Shredded Crispy Chicken, Ranch Dressing & Mixed Leaves", 1, "with salad",
      "Shredded Crispy Chicken, Ranch Dressing & Mixed Leaves Wrap (with salad)", WRP),
    # ---- page 10: Sandwiches (white or brown bloomer, chips or salad), Ciabattas, Sides
    K(10, "Egg Mayonnaise & Mixed Leaves", 0, "With chips", "Egg Mayonnaise & Mixed Leaves Sandwich (with chips)", SAN, veg=True),
    K(10, "Egg Mayonnaise & Mixed Leaves", 1, "with salad", "Egg Mayonnaise & Mixed Leaves Sandwich (with salad)", SAN, veg=True),
    K(10, "Bacon, Lettuce and Tomato (BLT)", 0, "With chips", "Bacon, Lettuce and Tomato (BLT) Sandwich (with chips)", SAN),
    K(10, "Bacon, Lettuce and Tomato (BLT)", 1, "with salad", "Bacon, Lettuce and Tomato (BLT) Sandwich (with salad)", SAN),
    K(10, "Ham", 0, "With chips", "Ham Sandwich (with chips)", SAN),
    K(10, "Ham", 1, "with salad", "Ham Sandwich (with salad)", SAN),
    K(10, "Mature Grated Cheddar Cheese, Mixed leaves & Caramelised Onion Chutney.", 0, "With chips",
      "Mature Grated Cheddar Cheese, Mixed Leaves & Caramelised Onion Chutney Sandwich (with chips)", SAN, veg=True),
    K(10, "Mature Grated Cheddar Cheese, Mixed leaves & Caramelised Onion Chutney.", 1, "with salad",
      "Mature Grated Cheddar Cheese, Mixed Leaves & Caramelised Onion Chutney Sandwich (with salad)", SAN, veg=True),
    K(10, "Tuna Mayonnaise & Mixed Leaves", 0, "With chips", "Tuna Mayonnaise & Mixed Leaves Sandwich (with chips)", SAN),
    K(10, "Tuna Mayonnaise & Mixed Leaves", 1, "with salad", "Tuna Mayonnaise & Mixed Leaves Sandwich (with salad)", SAN),
    K(10, "Prawns, Smoked Salmon in a Marie Rose Sauce, Mixed Leaves & Cucumber", 0, "With chips",
      "Prawns, Smoked Salmon in a Marie Rose Sauce, Mixed Leaves & Cucumber Sandwich (with chips)", SAN),
    K(10, "Prawns, Smoked Salmon in a Marie Rose Sauce, Mixed Leaves & Cucumber", 1, "with salad",
      "Prawns, Smoked Salmon in a Marie Rose Sauce, Mixed Leaves & Cucumber Sandwich (with salad)", SAN),
    K(10, "Ham, melted Cheese", 0, "Ham, melted Cheese", "Ham, Melted Cheese Ciabatta", CIA),
    K(10, "Tuna Mayonnaise, melted Cheese", 0, "", "Tuna Mayonnaise, Melted Cheese Ciabatta", CIA),
    K(10, "Cheddar Cheese and Caramelised Onion Chutney", 0, "Chutney", "Cheddar Cheese and Caramelised Onion Chutney Ciabatta", CIA, veg=True),
    K(10, "Brie, Bacon & Caramelised Onion Chutney", 0, "", "Brie, Bacon & Caramelised Onion Chutney Ciabatta", CIA),
    K(10, "Sticky BBQ Pulled Pork, melted Cheese", 0, "", "Sticky BBQ Pulled Pork, Melted Cheese Ciabatta", CIA),
    K(10, "Portion of Chips", 0, "", "Portion of Chips", SID, veg=True, meat=False),
    K(10, "Homemade Toasted Garlic Ciabatta", 0, "", "Homemade Toasted Garlic Ciabatta", SID, veg=True, meat=False),
    K(10, "Beer Battered Onion Rings", 0, "", "Beer Battered Onion Rings", SID, veg=True, meat=False),
    K(10, "Homemade Coleslaw", 0, "", "Homemade Coleslaw", SID, veg=True, meat=False),
    K(10, "Bread & Butter", 0, "", "Bread & Butter", SID, veg=True, meat=False),
    K(10, "House Salad", 0, "", "House Salad", SID, veg=True, meat=False),
]


def build_items(menu: dict) -> list:
    for page, expected in EXPECTED_TITLES.items():
        if menu[page]["titles"] != expected:
            raise SystemExit(f"Page {page}: section titles are {menu[page]['titles']}, expected {expected}: the layout changed, re-read the page")
    claimed = set()
    items = []
    for e in ITEMS:
        heads = [h for h in menu[e["page"]]["headings"] if h["text"] == e["heading"]]
        if len(heads) <= e["nth"]:
            raise SystemExit(f"p.{e['page']}: name line {e['heading']!r} (number {e['nth'] + 1}) is not printed any more: the menu changed, update ITEMS")
        h = heads[e["nth"]]
        if e["idx"] >= len(h["figures"]):
            raise SystemExit(f"p.{e['page']} {e['heading']!r}: figure {e['idx'] + 1} is missing ({len(h['figures'])} printed): the menu changed")
        f = h["figures"][e["idx"]]
        if not f["before"].endswith(e["ends"]):
            raise SystemExit(f"p.{e['page']} {e['heading']!r} figure {e['idx'] + 1} ({f['value']}): printed after {f['before'][-40:]!r}, "
                             f"expected {e['ends']!r}: the menu changed")
        key = (e["page"], id(f))
        if key in claimed:
            raise SystemExit(f"p.{e['page']} {e['heading']!r}: figure {e['idx'] + 1} is used twice in ITEMS")
        claimed.add(key)
        tags = []
        if e["veg"]:
            tags.append("vegetarian")
        if e["meat"]:
            text = VEG_SAUSAGE.sub(" ", e["name"] + " " + " ".join(l["text"] for l in h["desc"]))
            if PORK.search(text):
                tags.append("contains_pork")
            if BEEF.search(text):
                tags.append("contains_beef")
        value = f["value"].replace(",", "")
        printed = f"p.{e['page']}; under '{h['text']}', printed '{(f['before'][-30:] + ' ' + f['value']).strip()} kcal'"
        items.append(dict(name=e["name"], category=e["cat"], calories=value, tags="|".join(tags), rankable=False,
                          notes="; ".join(x for x in (printed, e["note"]) if x)))
    every = {(p, id(f)) for p, d in menu.items() for f in d["figures"]}
    if claimed != every:
        left = sorted((p, f["value"], f["owner"]["text"]) for p, d in menu.items() for f in d["figures"] if (p, id(f)) not in claimed)
        raise SystemExit(f"Printed with calories but not in ITEMS: {left}")
    silent = {(p, h["text"]) for p, d in menu.items() for h in d["headings"] if not h["figures"]}
    if silent != EXPECTED_WITHOUT_KCAL:
        raise SystemExit(f"Dish name lines without calories changed: now {sorted(silent)}, expected {sorted(EXPECTED_WITHOUT_KCAL)}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique: " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check ITEMS")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the menu PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"menu PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    menu = pdf_reader.read_menu(args.pdf)
    items = build_items(menu)
    out = write_chain_folder(chain_id=CHAIN_ID, name="British Garden Centres", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
                             nutrition_level="calories")
    cats = []
    for i in items:
        if i["category"] not in cats:
            cats.append(i["category"])
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {sum(1 for i in items if i['category'] == c)}" for c in cats))


if __name__ == "__main__":
    main()
