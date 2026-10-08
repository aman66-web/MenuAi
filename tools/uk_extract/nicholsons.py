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

# Accuracy audit 2026-10-08. The guide prints kJ and kcal for every dish and for many they disagree (kJ is the odd one out and we
# publish no kJ, so a dish whose kcal agrees with its own protein, carbohydrate and fat stays). What holds a dish back (never corrected,
# never chosen between) is the kcal we publish being contradicted twice: its own protein + carbohydrate + fat give a figure more than
# 15% away (more than 30% on its own) AND the printed kJ does not corroborate the kcal either (more than 15% away), as for Add Beef
# Patty (1950 kJ = 466 kcal, printed 271 kcal, macros 191 kcal). The wrapper replaces mb_guide's check for this chain's run only (the
# module is shared with the other M&B chains).
_impossible_mb = mb_guide._impossible


def _impossible_audited(n: dict, category: str = "") -> str:
    why = _impossible_mb(n, category)
    if why:
        return why
    try:
        kcal = float(n["kcal"])
        prot, carb, fat = (float(str(n[k]).lstrip("<")) for k in ("protein", "carbs", "fat"))
        kj = float(n["kj"])
    except (KeyError, ValueError):
        return ""
    macro = 4 * prot + 4 * carb + 9 * fat
    if category == "Drinks" or kcal < 50:
        return ""
    macro_gap = abs(kcal - macro) / kcal
    kj_gap = abs(kcal - kj / 4.184) / kcal
    if macro_gap > 0.30 or (macro_gap > 0.15 and kj_gap > 0.15):
        return (f"the guide prints {n['kcal']} kcal, but its own protein, carbohydrate and fat add up to about {round(macro)} kcal"
                f" and its {n['kj']} kJ is about {round(kj / 4.184)} kcal")
    return ""


mb_guide._impossible = _impossible_audited

NOTE = ("Specials are seasonal and change often. Pre-booked buffet, celebration, BBQ and canape menus are not included. Where the guide flags a "
        "dish as having choices of sides or sauces, its numbers may not include them.")


if __name__ == "__main__":
    sys.exit(mb_guide.main_for(
        chain_id="nicholsons", chain_name="Nicholson's", cuisine="Pub", aliases=["nicholsons", "nicholson's", "nicholsons pubs"],
        source_url=SOURCE_URL, brand_label="Nicholson's", menus=MENUS, excluded_menus=EXCLUDED_MENUS, note=NOTE,
        category_overrides=CATEGORY_OVERRIDES, name_categories=NAME_CATEGORIES, expected_brand_stamp="Nicholsons"))
