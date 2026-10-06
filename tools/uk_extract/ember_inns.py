#!/usr/bin/env python3
"""Build data/source/ember-inns/ from Ember Inns' official allergen & nutrition guide (Mitchells & Butlers).

    python3 tools/uk_extract/ember_inns.py AllergenGuideEmberEstate.html --checked-on 2026-10-06

Source: https://allergens.mbplc.io/AllergenGuideEmberEstate.html (linked from emberinns.co.uk/menus/mainmenu). Numbers are copied by
tools/uk_extract/mb_guide.py exactly as printed (per portion; kJ is not used). If Ember adds a menu, the script stops until the new
menu is listed below as included or excluded.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_guide  # noqa: E402

SOURCE_URL = "https://allergens.mbplc.io/AllergenGuideEmberEstate.html"

MENUS = {
    "Main Menu": {"primary": True},
    "Roasts & Classics": {"label": "Roasts & Classics menu"},
    "Seasonal Specials": {"limited": True},
    "Pub Specials": {},
    "Brunch Menu": {},
    "Bottomless Brunch": {},
    "Little Ones": {"category": "Little Ones", "label": "Little Ones"},
    "Hot Drinks": {},
}
EXCLUDED_MENUS = {
    "HotelIKC": "hotel-site menu, not the pub menu",
    "Sports Menu": "sports-event menu; the sites it applies to are not stated",
    "Tour Group Menu": "pre-booked tour-group menu",
    "Wedding Menu": "wedding packages",
    "Buffet Menu": "pre-booked party buffet, group portions",
}
# "~" = a weak category: the set-menu sections mix starters, mains and desserts, so a dish also printed in its own section takes that
# section's category
CATEGORY_OVERRIDES = {"little one's": "Mains", "little one's breakfasts": "Little Ones", "fixed price set menu": "~Mains",
                      "set menu": "~Mains"}
# sauces, toppings and roast accompaniments are printed beside the dishes; none of them is a meal
NAME_CATEGORIES = {
    "Hot Sauce & Fiery Tzatziki": "Add-ons", "BBQ & Ranch Sauce": "Add-ons", "BBQ & Ranch Sauce (Large)": "Add-ons",
    "Hot Sauce & Tzatziki (Large)": "Add-ons", "Beef Dripping Gravy": "Add-ons", "Stilton & Port Sauce": "Add-ons",
    "Peppercorn Sauce": "Add-ons", "Whipped Cream": "Add-ons", "Poppadoms & Chutney": "Add-ons",
    "Yorkshire Puddings": "Sides & snacks", "Pork, Leek & Apple Stuffing": "Sides & snacks", "Cauliflower Cheese": "Sides & snacks",
    "Braised Red Cabbage": "Sides & snacks", "Roast Potatoes & Gravy": "Sides & snacks",
}


def row_exclusions(name, card):
    if name.lower().startswith("canine"):
        return "dog treat, not a human menu item"
    return mb_guide.default_row_exclusions(name, card)


NOTE = ("Where the guide flags a dish as having choices (a side, sauce or topping), its numbers may not include them. Hotel, sports, group, "
        "wedding and buffet menus are not included. Seasonal Specials are marked limited time.")


if __name__ == "__main__":
    sys.exit(mb_guide.main_for(
        chain_id="ember-inns", chain_name="Ember Inns", cuisine="Pub", aliases=["ember inns", "ember inn", "emberinns"],
        source_url=SOURCE_URL, brand_label="Ember Inns", menus=MENUS, excluded_menus=EXCLUDED_MENUS, note=NOTE,
        category_overrides=CATEGORY_OVERRIDES, name_categories=NAME_CATEGORIES, row_exclusions=row_exclusions, expected_brand_stamp="Ember"))
