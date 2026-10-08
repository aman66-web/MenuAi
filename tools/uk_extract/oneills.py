#!/usr/bin/env python3
"""Build data/source/oneills/ from the allergen & nutrition guide that oneills.co.uk links to (Mitchells & Butlers).

    python3 tools/uk_extract/oneills.py AllergenGuideHighSteetEstate.html --checked-on 2026-10-06

Source: https://allergens.mbplc.io/AllergenGuideHighSteetEstate.html (the "smart-chef-url" on oneills.co.uk/mainmenu, /lunchanddrink,
/breakfastmenu, /buffetmenu and /bottomless). IMPORTANT: this is M&B's "High Street" estate guide. It also holds menus of sister brands
(Arrowsmiths, Brass Haus, ...) and does not label most menus with a brand. Only the menus whose titles match the menus O'Neill's lists on
its own site (oneills.co.uk: Meal & A Drink, Breakfast Menu, Bottomless Brunch) are used. The site's own "Main Menu" has no menu of that
name in this guide, so the main-menu burgers, pizzas and waffle fries are only covered where they reappear in the menus below.
Numbers are copied by tools/uk_extract/mb_guide.py exactly as printed (per portion; kJ is not used). If the guide gains a menu the
script stops until the new menu is listed below as included or excluded.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_guide  # noqa: E402

SOURCE_URL = "https://allergens.mbplc.io/AllergenGuideHighSteetEstate.html"

MENUS = {
    "Meal & A Drink": {"primary": True},
    "Breakfast Menu": {},
}
SAMPLE = "festive/Christmas sample menu: the guide says full menu and availability are confirmed closer to the season"
OTHER_BRAND = "menu of a sister brand in the High Street estate, not O'Neill's"
EXCLUDED_MENUS = {
    "Bottomless Brunch": "the O'Neill's menu name, but its dishes are printed without their dish type ('Pepperoni', 'Pulled Jerk Chicken' are "
                         "pizza and waffle-fries toppings), so they would be meaningless as items",
    "Kids Menu": "not tied to O'Neill's by the guide or by oneills.co.uk's own menu list",
    "Buffet Menu": "pre-booked party buffet",
    "Tour Group Menu": "pre-booked tour-group menu",
    "Specials": "not tied to O'Neill's by the guide or by oneills.co.uk's own menu list",
    "Arrowsmiths Darts Food & Drinks": OTHER_BRAND + " (Arrowsmiths)",
    "Arrowsmiths Lunch & 60 Minutes Of Darts": OTHER_BRAND + " (Arrowsmiths)",
    "Arrowsmiths Food Party Packages Menu": OTHER_BRAND + " (Arrowsmiths)",
    "Arrowsmiths Bottomless": OTHER_BRAND + " (Arrowsmiths)",
    "Brass Haus(Brass Haus Only)": OTHER_BRAND + " (Brass Haus)",
    "Hot Drinks (Beans)": "coffee-machine variant, not tied to O'Neill's by the guide or its site",
    "Hot Drinks (Pods)": "coffee-machine variant, not tied to O'Neill's by the guide or its site",
    "HotelIKC SITES": "hotel-site breakfast menu",
    "Haggis Add OnScottish Sites Only": "selected (Scottish) sites only",
    "Scotch Pies(HORSESHOE BAR GLASGOW ONLY)": "one venue only",
    "Christmas DayRocket, Carnaby St, Wardour St Only": "selected sites only; " + SAMPLE,
    "Festive Walk-in Menu 2026": SAMPLE,
    "Festive Walk-In Menu 2026 At O'Neill's O'Neills Sites Only": SAMPLE,
    "2-Course Festive Set Menu 2026 At O'Neill's O'Neills Sites Only": SAMPLE,
    "2-COURSE FESTIVE SET MENU 2026": SAMPLE,
    "2-Course Festive Set Menu 2026 At O'Neill's O'Neills Sites only": SAMPLE,
    "CHRISTMAS BUFFET MENU 2026": SAMPLE,
    "Festive Bottomless Brunch": SAMPLE,
}
# Rows printed with only a bare topping or patty as their name (the dish's own name is not printed), so they mean nothing on their own
BARE_CHOICES = {"beef", "chicken fillet", "grilled chicken", "shiitake mushroom", "bbq", "blue cheese", "buffalo hot", "hot honey"}
NAME_CATEGORIES = {"BBQ Guinness sauce": "Add-ons", "Burger Sauce": "Add-ons", "Buttermilk Ranch Dip": "Add-ons",
                   "Seasoned Chunky Chips": "Sides & snacks", "Dressed Side Salad": "Sides & snacks"}
CATEGORY_OVERRIDES = {"drink": "Drinks", "mains": "Mains"}

NOTE = ("The guide covers the whole High Street estate, not only O'Neill's, and has no menu named Main Menu. Only the menus O'Neill's names on "
        "its own site (weekday lunch deal and breakfast) are included, so the burgers, pizzas and waffle fries of the main menu are missing.")


# Accuracy audit 2026-10-08. The guide prints kJ and kcal for every dish and for many they disagree (kJ is the odd one out and we
# publish no kJ, so a dish whose kcal agrees with its own protein, carbohydrate and fat stays). What holds a dish back (never corrected,
# never chosen between) is the kcal we publish being contradicted twice: its own protein + carbohydrate + fat give a figure more than
# 15% away (more than 20% on its own) AND the printed kJ does not corroborate the kcal either (more than 15% away), as for Scampi &
# Chips (2939 kJ = 702 kcal, printed 952 kcal, macros 780 kcal). The wrapper replaces mb_guide's check for this chain's run only (the
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
    if macro_gap > 0.20 or (macro_gap > 0.15 and kj_gap > 0.15):
        return (f"the guide prints {n['kcal']} kcal, but its own protein, carbohydrate and fat add up to about {round(macro)} kcal"
                f" and its {n['kj']} kJ is about {round(kj / 4.184)} kcal")
    return ""


mb_guide._impossible = _impossible_audited


def row_exclusions(name, card):
    if name.lower() in BARE_CHOICES:
        return "choice row printed with only a bare topping or patty as its name (the dish's own name is not printed)"
    return mb_guide.default_row_exclusions(name, card)


if __name__ == "__main__":
    sys.exit(mb_guide.main_for(
        chain_id="oneills", chain_name="O'Neill's", cuisine="Pub", aliases=["o'neill's", "oneills", "o'neills", "oneill's"],
        source_url=SOURCE_URL, brand_label="O'Neill's (High Street estate)", menus=MENUS, excluded_menus=EXCLUDED_MENUS,
        category_overrides=CATEGORY_OVERRIDES, name_categories=NAME_CATEGORIES, row_exclusions=row_exclusions, note=NOTE,
        expected_brand_stamp="High Street"))
