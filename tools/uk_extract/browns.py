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
        "Sunday, Classics, bar snacks or children's menu is listed separately only where its numbers differ. Cocktails and Champagne have no nutrition table. "
        "From the guide as of 5 Oct 2026: it no longer lists these menus (8 Oct), so figures may be out of date.")


# Accuracy audit 2026-10-08 (independent re-read of the 2026-10-05 page: all 230 rows match the page cell for cell). The guide prints kJ
# and kcal for every dish and they often disagree; we publish no kJ, so a kJ that disagrees with a kcal that its own protein,
# carbohydrate and fat support (4P+4C+9F within 15%) does not touch any number we show and the dish stays. A dish is held back (never
# corrected, never chosen between) only when a number we publish is contradicted and nothing supports it:
#   - the kcal is more than 30% away from its own protein/carbohydrate/fat energy (food, 50 kcal or more), or
#   - the kcal is more than 15% away from that AND the kJ printed beside it (kJ / 4.184) is more than 10% away too, or
#   - one portion prints more than 10 g of salt and more than a quarter of the weight of its own protein + carbohydrate + fat
#     (Baked Scallops print 46.4 g of salt beside 77 g of macros: not a possible figure; the same dish in the gluten-free and
#     celebration menus prints 46 g).
# The wrapper replaces mb_guide's check for this chain's run only (the module is shared with the other M&B chains).
_impossible_mb = mb_guide._impossible


def _impossible_audited(n: dict, category: str = "") -> str:
    why = _impossible_mb(n, category)
    if why:
        return why
    try:
        kcal, kj = float(n["kcal"]), float(n["kj"])
        prot, carb, fat, salt = (float(str(n[k]).lstrip("<")) for k in ("protein", "carbs", "fat", "salt"))
    except (KeyError, ValueError):
        return ""
    if salt > 10 and salt > 0.25 * (prot + carb + fat):
        return (f"the guide prints {n['salt']} g of salt in one portion, more than a quarter of the weight of its own protein, "
                f"carbohydrate and fat ({round(prot + carb + fat)} g): not a possible figure")
    if category == "Drinks" or kcal < 50:
        return ""
    macro = 4 * prot + 4 * carb + 9 * fat
    gap_macro, gap_kj = abs(kcal - macro) / kcal, abs(kj / 4.184 - kcal) / kcal
    if gap_macro > 0.30 or (gap_macro > 0.15 and gap_kj > 0.10):
        return (f"the guide prints {n['kcal']} kcal and {n['kj']} kJ (about {round(kj / 4.184)} kcal); its own protein, carbohydrate and fat "
                f"add up to about {round(macro)} kcal: no figure supports the {n['kcal']}")
    return ""


mb_guide._impossible = _impossible_audited

# The allergen link points at the live page (regenerated every morning), not at the stamped copy the numbers were read from.
_write_chain_folder = mb_guide.write_chain_folder


def _write_with_live_link(**kw):
    guide = kw.get("allergen_guide")
    if guide:
        kw["allergen_guide"] = dict(guide, title="Browns Allergen & Nutrition Guide, Mitchells & Butlers (live page)")
    return _write_chain_folder(**kw)


mb_guide.write_chain_folder = _write_with_live_link


if __name__ == "__main__":
    sys.exit(mb_guide.main_for(
        chain_id="browns", chain_name="Browns", cuisine="British", aliases=["browns", "browns brasserie", "browns restaurant"],
        source_url=SOURCE_URL, brand_label="Browns", menus=MENUS, excluded_menus=EXCLUDED_MENUS, note=NOTE, row_exclusions=row_exclusions, name_categories=NAME_CATEGORIES, expected_brand_stamp="Browns"))
