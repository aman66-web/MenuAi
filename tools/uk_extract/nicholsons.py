#!/usr/bin/env python3
"""Build data/source/nicholsons/ from Nicholson's official allergen & nutrition guide (Mitchells & Butlers).

    python3 tools/uk_extract/nicholsons.py AllergenGuideNicholsonsEstate.html --checked-on 2026-10-06

Source: https://allergens.mbplc.io/AllergenGuideNicholsonsEstate.html (linked from the venue menu pages on nicholsonspubs.co.uk).
Numbers are copied by tools/uk_extract/mb_guide.py exactly as printed (per portion; kJ is not used). If Nicholson's adds a menu,
the script stops until the new menu is listed below as included or excluded.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_guide  # noqa: E402

SOURCE_URL = "https://allergens.mbplc.io/AllergenGuideNicholsonsEstate.html"

MENUS = {
    "Main Menu": {"primary": True},
    "Sunday Menu": {"label": "Sunday menu"},
    "Sandwich Menu": {},
    "Bar Snacks": {},
    "Breakfast Menu": {},
    "Childrens Menu": {"category": "Childrens", "label": "Childrens"},
    "Lavazza Coffee": {},
    "Specials": {"limited": True},
}
EXCLUDED_MENUS = {
    "Buffet Menu": "pre-booked party buffet, group portions",
    "Celebration Menu": "pre-booked celebration/group menu",
    "BBQ Menu": "event BBQ packages",
    "Canapes": "event canapes",
}
CATEGORY_OVERRIDES = {"prior food": "Mains", "ddr": "Drinks"}
# sauces, toppings and roast accompaniments are printed beside the dishes; none of them is a meal
NAME_CATEGORIES = {
    "Add On Curry Sauce": "Add-ons", "Bone Marrow Béarnaise Sauce": "Add-ons", "Chimichurri Sauce": "Add-ons",
    "Peppercorn Sauce": "Add-ons", "Smoked Back Bacon": "Add-ons", "Smoked Cheddar Cheese": "Add-ons",
    "Pulled Beef Brisket": "Add-ons", "Long-Stem Broccoli": "Sides & snacks", "Cauliflower Cheese": "Sides & snacks",
    "Pigs In Blankets": "Sides & snacks", "Yorkshire Puddings": "Sides & snacks", "Roast Potatoes": "Sides & snacks",
}

NOTE = ("Specials are seasonal and change often. Pre-booked buffet, celebration, BBQ and canape menus are not included. Where the guide flags a "
        "dish as having choices of sides or sauces, its numbers may not include them.")


if __name__ == "__main__":
    sys.exit(mb_guide.main_for(
        chain_id="nicholsons", chain_name="Nicholson's", cuisine="Pub", aliases=["nicholsons", "nicholson's", "nicholsons pubs"],
        source_url=SOURCE_URL, brand_label="Nicholson's", menus=MENUS, excluded_menus=EXCLUDED_MENUS, note=NOTE,
        category_overrides=CATEGORY_OVERRIDES, name_categories=NAME_CATEGORIES, expected_brand_stamp="Nicholsons"))
