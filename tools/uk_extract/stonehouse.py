#!/usr/bin/env python3
"""Build data/source/stonehouse/ from the online menu of ONE Stonehouse restaurant (Mitchells & Butlers menu platform).

    python3 tools/uk_extract/stonehouse.py --fetch /tmp/stonehouse --checked-on 2026-10-06     # one download + build
    python3 tools/uk_extract/stonehouse.py path/to/stonehouse.json --checked-on 2026-10-06

Source: the JSON that the Stonehouse menu page (<mab-menu>) loads for TradingEntity 1001496 (menu "067. Stonehouse LN26
( REMODEL ) Main Menu (Mon-Sat)"):
https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001496&websitePageUrlPath=main-menu1&idType=TradingEntity&salesChannel=DynamicWebMenus
This feed is for ONE restaurant; the brand-level menu id was not found, so the venue's menu is used as published and says so in
note.txt. Numbers are copied as the feed prints them; see mb_feed.py. Only categories, the lines that are not menu items, the
held-back rows and the notes are written by hand below. Not read: the feed's other menus (kids, drinks, Sunday...).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402
from mb_feed import Place  # noqa: E402

SMALL, BURG, CARV, PIZZA, CLASSICS, SIDES, ADDON, SAUCE, BAPS, DESS, WAFFLE, DRINKS = (
    "Small plates", "Burger bar", "Carvery", "Handmade pizza", "Pub classics", "Sides", "Add-ons", "Sauces & dips",
    "Hot roast meat baps", "Desserts", "Waffles & sundaes", "Hot drinks")
SWAP = ("the swap line gives a difference from the default chicken (one value is negative) and the other line prints 0; "
        "neither is a menu item with its own values")
BUILD = ("build-your-own sundae part: the build lines print 0 and the menu does not say what amount of scoops, sauce "
         "or topping these values describe")

CHAIN = mb.Chain(
    chain_id="stonehouse",
    name="Stonehouse",
    cuisine="Pub",
    aliases=["stonehouse", "stonehouse pizza & carvery", "stonehouse pizza and carvery", "stonehouse restaurant"],
    source_url="https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001496&websitePageUrlPath=main-menu1&idType=TradingEntity&salesChannel=DynamicWebMenus",
    source_title_prefix="Stonehouse online main menu (Mon-Sat) with nutrition, one restaurant (live menu feed)",
    expected_entries=104,
    places={
        ("Small Plates", None): Place(SMALL, "Small plate"),
        ("The Burger Bar", None): Place(BURG, "Burger"),
        ("The Carvery", None): Place(CARV, "Carvery", rankable=False),
        ("Handmade Pizza", None): Place(PIZZA, "Pizza"),
        ("Pub Classics", None): Place(CLASSICS, "Pub classic"),
        ("Bit on the Side", None): Place(SIDES, "Side"),
        ("Bit on the Side", "Load up your fries or potato pops for 2.00"): Place(ADDON, "Add-on", rankable=False),
        ("Bit on the Side", "Dipping Sauces 49p"): Place(SAUCE, "Sauce", rankable=False, meat=False),
        ("Hot Roast Meat Baps", None): Place(BAPS, "Bap"),
        ("Hot Roast Meat Baps", "Hot Roast Meat Baps"): Place(BAPS, "Bap"),
        ("Desserts", None): Place(DESS, "Dessert", rankable=False, meat=False),
        ("Desserts", "Home Baked Range"): Place(DESS, "Dessert", rankable=False, meat=False),
        ("Waffles & Sundaes", None): Place(WAFFLE, "Sundae", rankable=False, meat=False),
        ("Hot Drinks", None): Place(DRINKS, "Drink", rankable=False, meat=False),
        ("Hot Drinks", "Add a shot of syrup for 99p"): Place(ADDON, "Add-on", rankable=False, meat=False),
        ("Hot Drinks", "Mini chocolate brownie and a hot drink"): Place(DESS, "Mini dessert", rankable=False, meat=False),
    },
    not_items={
        ("The Burger Bar", "Chicken Burger Choice"): SWAP,
        ("Waffles & Sundaes", "Build your own Sundae"): BUILD,
        ("Waffles & Sundaes", "Choose your ice cream:"): BUILD,
        ("Waffles & Sundaes", "Choose your sauce:"): BUILD,
        ("Waffles & Sundaes", "Choose you topping:"): BUILD,
    },
    # These sit under a heading that is not theirs.
    moves={
        "Stuff your Crust": Place(ADDON, "Add-on", rankable=False),
        "Ranch": Place(SAUCE, "Sauce", rankable=False, meat=False),
    },
    # A whole dish under "The Carvery" (not carved meat); and the dish the menu offers for the carvery's meat-free plate.
    rankable={"Mushroom Suet Pudding": True},
    # The description lists the toppings you can choose (roast beef, roast gammon...); the salad's own values include none of them.
    tag_fixes={"House Salad": []},
    notes={"Meat Free Carvery": "Much larger than the carved-meat carvery rows (1,458 kcal against 175-350): not comparable with them"},
    holdback={
        "Wholetail Scampi": "The feed prints 951 kcal; its own macros add up to about 774 kcal (and its kJ to about 679 kcal).",
    },
    note_txt=("From the menu of one Stonehouse restaurant, used as published: other restaurants' menus and values may differ. Main menu "
              "(Mon-Sat) only. Carvery meat rows cover the carved meat only (vegetables and gravy are served at the carvery), so the "
              "Meat Free Carvery figure isn't comparable with them."),
)

if __name__ == "__main__":
    sys.exit(mb.run(CHAIN))
