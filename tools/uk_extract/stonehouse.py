#!/usr/bin/env python3
"""Build data/source/stonehouse/ from the online menu of ONE Stonehouse restaurant (Mitchells & Butlers menu platform).

    python3 tools/uk_extract/stonehouse.py --fetch /tmp/stonehouse --checked-on 2026-11-17     # one download + build
    python3 tools/uk_extract/stonehouse.py path/to/stonehouse.json --checked-on 2026-11-17

Source: the JSON that the Stonehouse menu page (<mab-menu>) loads for TradingEntity 1001496 (on 2026-11-17 the menu
"177. Stonehouse DN26 ( REMODEL ) Main Menu *LIVE*", last modified 2026-11-17; before that "067. Stonehouse LN26 ( REMODEL )
Main Menu (Mon-Sat)"):
https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001496&websitePageUrlPath=main-menu1&idType=TradingEntity&salesChannel=DynamicWebMenus
This feed is for ONE restaurant; the brand-level menu id was not found, so the venue's menu is used as published and says so in
note.txt. Numbers are copied as the feed prints them; see mb_feed.py. Only categories, the lines that are not menu items, the
held-back rows and the notes are written by hand below. Not read: the feed's other menus (kids, drinks, Sunday...).
api-production.mbplc.io answers 404 for robots.txt (no rules).
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402
from mb_feed import Place  # noqa: E402

SMALL, SANDW, BURG, CARV, PIZZA, CLASSICS, SIDES, ADDON, SAUCE, BAPS, DESS, SUNDAE, DRINKS = (
    "Small plates", "Sandwiches", "Burgers", "Carvery", "Handmade pizza", "Pub classics", "Sides", "Add-ons", "Sauces & dips",
    "Hot roast meat baps", "Desserts", "Ice cream sundaes", "Hot drinks")
SWAP = ("a choice line for the chicken burgers that prints 0 for every value (a swap, not a menu item with its own values)")
BUILD = ("build-your-own sundae part: the base lines print 0, and the menu does not say how much ice cream, sauce or topping "
         "the option values describe")

CHAIN = mb.Chain(
    chain_id="stonehouse",
    name="Stonehouse",
    cuisine="Pub",
    aliases=["stonehouse", "stonehouse pizza & carvery", "stonehouse pizza and carvery", "stonehouse restaurant"],
    source_url="https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001496&websitePageUrlPath=main-menu1&idType=TradingEntity&salesChannel=DynamicWebMenus",
    source_title_prefix="Stonehouse online main menu with nutrition, one restaurant (live menu feed)",
    expected_entries=117,
    places={
        ("Small Plates", None): Place(SMALL, "Small plate"),
        ("Sandwiches", None): Place(SANDW, "Sandwich"),
        ("Sandwiches", "Hot Roast Meat Baps"): Place(BAPS, "Bap"),
        ("Pub Classics", None): Place(CLASSICS, "Pub classic"),
        ("Sides", None): Place(SIDES, "Side"),
        ("Sides", "Load up your fries or potato tots for 2.00"): Place(ADDON, "Add-on", rankable=False),
        ("Sides", "Dipping Sauces 49p"): Place(SAUCE, "Sauce", rankable=False, meat=False),
        ("Handmade Pizza", None): Place(PIZZA, "Pizza"),
        ("Handmade Pizza", "Vegan Pizzas"): Place(PIZZA, "Pizza"),
        ("Handmade Pizza", "Make It Mega"): Place(PIZZA, "Mega pizza"),
        ("The Carvery", None): Place(CARV, "Carvery", rankable=False),
        ("Burgers", None): Place(BURG, "Burger"),
        ("Desserts", None): Place(DESS, "Dessert", rankable=False, meat=False),
        ("Desserts", "Home Baked"): Place(DESS, "Dessert", rankable=False, meat=False),
        ("Ice Cream Sundaes", None): Place(SUNDAE, "Sundae", rankable=False, meat=False),
        ("Hot Drinks", None): Place(DRINKS, "Drink", rankable=False, meat=False),
        ("Hot Drinks", "Add a shot of syrup for 99p"): Place(ADDON, "Add-on", rankable=False, meat=False),
        ("Hot Drinks", "Mini chocolate brownie and a hot drink"): Place(DESS, "Mini dessert", rankable=False, meat=False),
    },
    not_items={
        ("Burgers", "Chicken Burger Choice"): SWAP,
        ("Ice Cream Sundaes", "Build your own Sundae"): BUILD,
        ("Ice Cream Sundaes", "Choose your ice cream:"): BUILD,
        ("Ice Cream Sundaes", "Choose your sauce:"): BUILD,
        ("Ice Cream Sundaes", "Choose you topping:"): BUILD,
    },
    # Printed under three headings (hot roast meat baps, sides, the carvery) with the same numbers and allergens: one item,
    # kept where it was before the November menu.
    moves={
        "Three Pigs in Blankets": Place(CARV, "Carvery", rankable=False),
    },
    # Same name as the pub classic, smaller numbers, printed under Sides; and the loaded-fries toppings, which the menu prints
    # under the heading "Load up your fries or potato tots for 2.00".
    rename={
        "Sides|Mac 'n' Cheese": "Mac 'n' Cheese (side)",
        "Add-ons|Crispy Chicken": "Crispy Chicken (fries topping)",
        "Add-ons|Cheeseburger Melt": "Cheeseburger Melt (fries topping)",
        "Add-ons|Chilli Cheese Sauce with FRANK's RedHot": "Chilli Cheese Sauce with FRANK's RedHot (fries topping)",
        "Add-ons|BBQ Pulled Pork": "BBQ Pulled Pork (fries topping)",
    },
    skip={
        "Loaded Fries": ("its values are the plain fries' (556.7 against 556.2 kcal for Fries): the topping that makes it loaded is a "
                         "choice whose values are not added in, so the row would describe something the menu doesn't serve"),
    },
    # A whole dish under "The Carvery" (not carved meat); and the dish the menu offers for the carvery's meat-free plate.
    rankable={"Mushroom Suet Pudding": True},
    # The description lists the toppings you can choose (roast beef, roast gammon...); the salad's own values include none of them.
    tag_fixes={"House Salad": []},
    notes={"Meat Free Carvery": "Much larger than the carved-meat carvery rows (1,460 kcal against 175-350): not comparable with them"},
    holdback={
        "Wholetail Scampi": "The feed prints 951 kcal; its own macros add up to about 770 kcal (and its kJ to about 679 kcal).",
        "Crispy Calamari": "The feed prints 354 kcal; its own macros add up to about 219 kcal (and its kJ, 1046.75, to about 250 kcal).",
        "Chocolate Fudge Cake": ("allergen row contradicts the dish name/ingredients: the feed marks eggs, milk and soya (tree nut may "
                                 "be present) but no gluten or cereal for a cake, and the item carries no gluten-free claim "
                                 "(noGlutenContainingIngs is false)."),
    },
    note_txt=("From the menu of one Stonehouse restaurant, used as published: other restaurants' menus and values may differ. Main menu "
              "only. A side, sauce or topping you choose isn't added in, to the numbers or to the allergens. Carvery meat "
              "rows cover the carved meat only (vegetables and gravy are served at the carvery), so the Meat Free Carvery figure "
              "isn't comparable with them."),
)

if __name__ == "__main__":
    sys.exit(mb.run(CHAIN))
