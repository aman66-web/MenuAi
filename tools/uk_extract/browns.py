#!/usr/bin/env python3
"""Build data/source/browns/ from Browns' official allergen & nutrition guide (Mitchells & Butlers).

    python3 tools/uk_extract/browns.py AllergenGuideBrownsEstate.html --checked-on 2026-10-06

Source: https://allergens.mbplc.io/AllergenGuideBrownsEstate.html. Numbers are copied by tools/uk_extract/mb_guide.py exactly as
printed (per portion; kJ is not used). If Browns adds a menu, the script stops until it is listed below as included or excluded.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_guide  # noqa: E402

SOURCE_URL = "https://allergens.mbplc.io/AllergenGuideBrownsEstate.html"

MENUS = {
    "À La Carte": {"primary": True},
    "Lunch & Early Evening": {"label": "Lunch menu"},
    "Sunday Set Menu": {"label": "Sunday set menu"},
    "Classics Menu": {"label": "Classics menu"},
    "Brunch": {},
    "Bottomless Brunch": {},
    "Afternoon Tea": {"label": "Afternoon Tea"},
    "Children's": {"category": "Children's", "label": "Children's"},
    "Bar Snacks": {"label": "Bar Snacks"},
    "Cakes & Pastries": {},
    "Full Hot Drinks Range": {},
    "Taste Of Summer": {"limited": True},
}
EXCLUDED_MENUS = {
    "GF Celebration Menu": "pre-booked celebration/group menu",
    "Celebration Graduation Menu": "pre-booked celebration/group menu",
    "Classic Graduation Menu": "pre-booked celebration/group menu",
    "Celebrations Menu": "pre-booked celebration/group menu",
    "Canapes": "event canapes",
    "Buffet": "pre-booked party buffet",
    "Gluten Free Menu": "gluten-free versions printed separately",
    "Gluten Free Lunch Menu": "gluten-free versions printed separately",
    "Gluten Free Classics": "gluten-free versions printed separately",
    "Gluten Free Breakfast Menu": "gluten-free versions printed separately",
    "Gluten Free Bottomless Brunch": "gluten-free versions printed separately",
    "Gluten Free Afternoon Tea": "gluten-free versions printed separately",
    "Tour Menu - All Sites": "pre-booked tour-group menu",
    "Trafalgar Tours (Butlers Wharf & Bath)(Butlers Wharf Only)": "tour-group menu, selected sites only",
    "Tour Menu Abbey(Edinburgh Only)": "tour-group menu, selected sites only",
    "Tour Menu Edinburgh(Edinburgh Only)": "tour-group menu, selected sites only",
    "Tour Menu - Trafalgar": "pre-booked tour-group menu",
    "Tour Menu - Hospitality": "pre-booked tour-group menu",
    "Weddings": "wedding packages",
}


# The guide files steak sauces and extras under "From The Butcher" beside the steaks; they are not meals.
NAME_CATEGORIES = {
    "Bone Marrow Béarnaise": "Add-ons", "Jersey Cream Peppercorn": "Add-ons", "Red Wine & Shallot Jus": "Add-ons",
    "Pan-seared Scallops": "Add-ons", "Onion Rings": "Add-ons",
}


def row_exclusions(name, card):
    if name.lower().startswith("fryer segmentation"):
        return "kitchen note about separate fryers printed as a row, not food"
    return mb_guide.default_row_exclusions(name, card)


NOTE = ("Gluten-free versions of dishes and the pre-booked group, tour, wedding and celebration menus are not included. A dish on the lunch, "
        "Sunday, Classics, bar snacks or children's menu is listed separately only where its numbers differ. Cocktails and Champagne have no nutrition table.")


if __name__ == "__main__":
    sys.exit(mb_guide.main_for(
        chain_id="browns", chain_name="Browns", cuisine="British", aliases=["browns", "browns brasserie", "browns restaurant"],
        source_url=SOURCE_URL, brand_label="Browns", menus=MENUS, excluded_menus=EXCLUDED_MENUS, note=NOTE, row_exclusions=row_exclusions, name_categories=NAME_CATEGORIES, expected_brand_stamp="Browns"))
