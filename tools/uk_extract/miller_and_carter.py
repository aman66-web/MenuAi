#!/usr/bin/env python3
"""Build data/source/miller-and-carter/ from Miller & Carter's own online menu feed (Mitchells & Butlers menu platform).

    python3 tools/uk_extract/miller_and_carter.py --fetch /tmp/mc --checked-on 2026-10-06     # one download + build
    python3 tools/uk_extract/miller_and_carter.py path/to/miller-and-carter.json --checked-on 2026-10-06

Source: the JSON that https://www.millerandcarter.co.uk's menu page (<mab-menu>) loads, brand-level, "A la carte" main menu:
https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic?id=34879ecd-629a-5b27-8072-c2097a9fa610&websitePageUrlPath=main-menu1&idType=Brand&salesChannel=DynamicWebMenus
Numbers are copied as the feed prints them; see mb_feed.py for how the feed is read. Only categories, the lines that are not
menu items, the held-back rows and the notes are written by hand below. Not read: the feed's other menus (Sunday set, dates and
steaks, drinks), which use other websitePageUrlPath values. The older printed menu differs from the feed for some items
(Cheesy Garlic Bread 575 vs 596 kcal): the feed, which is what the site shows now, is the only source used.
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402
from mb_feed import Place  # noqa: E402

WAIT, STARTERS, STEAKS, SHARE, ADDONS, SAUCES, SIDES, BURGERS, MAINS, SALADS, DESSERTS = (
    "While you wait", "Starters", "Steaks", "Sharing steaks", "Add-ons", "Sauces, dressings & butters", "Sides", "Burgers",
    "Mains", "Salads", "Desserts")
STEAK_SECTION = "THE STEAK EXPERIENCE by the Masters of Steak"

CHAIN = mb.Chain(
    chain_id="miller-and-carter",
    name="Miller & Carter",
    cuisine="Steakhouse",
    aliases=["miller & carter", "miller and carter", "miller & carter steakhouse", "miller and carter steakhouse"],
    source_url="https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic?id=34879ecd-629a-5b27-8072-c2097a9fa610&websitePageUrlPath=main-menu1&idType=Brand&salesChannel=DynamicWebMenus",
    source_title_prefix="Miller & Carter online a la carte menu with nutrition (live menu feed)",
    expected_entries=128,
    places={
        ("WHILE YOU WAIT", None): Place(WAIT, "Starter"),
        ("STARTERS", None): Place(STARTERS, "Starter"),
        (STEAK_SECTION, "30 Day Aged British & Irish Prime Steak"): Place(STEAKS, "Steak"),
        (STEAK_SECTION, "50 Day Aged"): Place(STEAKS, "Steak"),
        (STEAK_SECTION, "Wagyu"): Place(STEAKS, "Steak"),
        (STEAK_SECTION, "Our Ultimate Sharing Steak Experiences"): Place(SHARE, "Sharing steak", rankable=False),
        (STEAK_SECTION, "Add a little luxury"): Place(ADDONS, "Add-on", rankable=False),
        ("CHOOSE A STEAK SAUCE", None): Place(SAUCES, "Sauce", rankable=False, meat=False),
        ("CHOOSE A WEDGE DRESSING", None): Place(SAUCES, "Dressing", rankable=False, meat=False),
        ("CHOOSE YOUR SIDE", None): Place(SIDES, "Side"),
        ("CHOOSE YOUR BUTTER", None): Place(SAUCES, "Butter", rankable=False, meat=False),
        ("SIGNATURE SIDES", None): Place(SIDES, "Side"),
        ("SIGNATURE SIDES", "ANY 3 FOR £12"): Place(SIDES, "Side"),
        ("PRIME BURGERS", None): Place(BURGERS, "Burger"),
        ("PRIME BURGERS", "Top Your Burger"): Place(ADDONS, "Add-on", rankable=False),
        ("MAINS", None): Place(MAINS, "Main"),
        ("SALAD", None): Place(SALADS, "Salad"),
        ("SALAD", "TOP YOUR SALAD"): Place(ADDONS, "Add-on", rankable=False),
        ("SOMETHING ON THE SIDE", None): Place(SIDES, "Side"),
        ("SOMETHING ON THE SIDE", "ANY 3 FOR £12"): Place(SIDES, "Side"),
        ("DESSERTS", None): Place(DESSERTS, "Dessert", rankable=False, meat=False),
        ("DESSERTS", "PERFECT FOR SHARING"): Place(DESSERTS, "Dessert", rankable=False, meat=False),
        ("MINI DESSERT & COFFEE OR COCKTAIL", None): Place(DESSERTS, "Mini dessert", rankable=False, meat=False),
    },
    # Dishes the menu itself says serve two, or share, are not one person's order.
    rankable={"Baked Camembert": False, "Cheesy Garlic Bread To Share": False},
    serving={
        "Cheesy Garlic Bread": "For one",                       # the menu's own words under the dish
        "Cheesy Garlic Bread To Share": "To share",
        "Baked Camembert": "Serves two",                        # "Serves two" in the menu description
        "Butcher's Block 25oz": "Serves two",
        "Chateaubriand 16oz": "Serves two",
    },
    # The description only says what the butter is served with (steak); it names no beef ingredient.
    tag_fixes={"Signature Butter": []},
    holdback={
        "Salt & Pepper Calamari": "The feed prints 340 kcal; its own macros add up to about 241 kcal (and its kJ to about 290 kcal).",
        "Maple-Cured Streaky Bacon": "The feed prints 80 kcal; its own macros add up to about 51 kcal (and its kJ to about 139 kcal).",
        "Ice Cream & Sorbet": "The feed prints 40 kcal for a dessert of three scoops and a chocolate twirl; the scoops are chosen separately and their values aren't added in.",
        # Independent re-read 2026-10-08 (the feed was edited that evening, last modified 2026-10-08T19:03). Neither is chosen, nothing is corrected.
        "Porterhouse 35oz": "The feed prints 31.82 g of salt for one steak (an earlier copy of the same feed, 2026-10-06, printed 24.83 g): several days' worth of salt, not possible, so none of its numbers is trusted.",
        "Butternut Squash & Goat's Cheese Arancini": "Allergen row contradicts the dish description: 'crispy arancini ... served with smoked garlic and lemon aioli' but the feed marks neither gluten nor egg (it lists milk and mustard only).",
    },
    note_txt=("A la carte menu only (the Sunday, set and drinks menus aren't included). Where you choose a side, sauce, butter or "
              "dressing it is listed separately and isn't added in, to the numbers or to the allergens. Weights in names (oz) are approximate uncooked weights."),
)

if __name__ == "__main__":
    sys.exit(mb.run(CHAIN))
