#!/usr/bin/env python3
"""Build data/source/sizzling-pubs/ from the online menu of ONE Sizzling Pubs venue (Mitchells & Butlers menu platform).

    python3 tools/uk_extract/sizzling_pubs.py --fetch /tmp/sizzling --checked-on 2026-10-06     # one download + build
    python3 tools/uk_extract/sizzling_pubs.py path/to/sizzling-pubs.json --checked-on 2026-10-06

Source: the JSON that the Sizzling Pubs menu page (<mab-menu>) loads for TradingEntity 1001316 (menu "11. Suburban DN26 Main"):
https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001316&websitePageUrlPath=main-menu1&idType=TradingEntity&salesChannel=DynamicWebMenus
This feed is for ONE venue; the brand-level menu id was not found, so the venue's menu is used as published and says so in
note.txt. Numbers are copied as the feed prints them; see mb_feed.py. Only categories, the lines that are not menu items, the
held-back rows and the notes are written by hand below. Not read: the feed's other menus (kids, drinks, Sunday...).
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402
from mb_feed import Place  # noqa: E402

MAINS, FAV, FLAT, SKILL, SAUCE, BURG, ADDON, SIDES, SNACKS, DESS, DRINKS = (
    "Sizzle 'N' Save mains", "Pub favourites", "Flatbreads", "Sizzling skillets", "Sauces", "Burger bar", "Add-ons", "Sides",
    "Snacks & starters", "Desserts", "Hot drinks")
SWAP = ("the upgrade lines give the difference from the default fries (one even has negative carbohydrate), "
        "not the item's own values")

CHAIN = mb.Chain(
    chain_id="sizzling-pubs",
    name="Sizzling Pubs",
    cuisine="Pub",
    aliases=["sizzling pubs", "sizzling pub", "the sizzling pub"],
    source_url="https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic/?id=1001316&websitePageUrlPath=main-menu1&idType=TradingEntity&salesChannel=DynamicWebMenus",
    source_title_prefix="Sizzling Pubs online main menu with nutrition, one venue (live menu feed)",
    expected_entries=106,
    places={
        ("Sizzle ‘N’ Save", None): Place(MAINS, "Sizzle 'N' Save mains"),
        ("Sizzle ‘N’ Save", "Veggie & Vegan Mains"): Place(MAINS, "Sizzle 'N' Save mains"),
        ("Pub Favourites", None): Place(FAV, "Pub favourite"),
        ("Flatbreads", None): Place(FLAT, "Flatbread"),
        ("Sizzling Skillets", None): Place(SKILL, "Skillet"),
        ("Sizzling Skillets", "Sizzling Steaks"): Place(SKILL, "Skillet"),
        ("Sizzling Skillets", "Ooh Saucy"): Place(SAUCE, "Sauce", rankable=False, meat=False),
        ("Burger Bar", None): Place(BURG, "Burger"),
        ("Burger Bar", "Top it off. Why not add an extra topper to your fries?"): Place(ADDON, "Add-on", rankable=False),
        ("A Bit On The Side", None): Place(SIDES, "Side"),
        ("A Bit On The Side", "Make 'Em Dirty!"): Place(SIDES, "Side"),
        ("Snacks & Starters", "Sizzle 'N' Save"): Place(SNACKS, "Snack"),
        ("Snacks & Starters", "Sharers"): Place(SNACKS, "Sharer", rankable=False),
        ("Desserts", None): Place(DESS, "Dessert", rankable=False, meat=False),
        ("Desserts", "Mini Dessert and Hot Drink"): Place(DESS, "Mini dessert", rankable=False, meat=False),
        ("Desserts", "Sundaes"): Place(DESS, "Sundae", rankable=False, meat=False),
        ("Hot Drinks", None): Place(DRINKS, "Drink", rankable=False, meat=False),
    },
    not_items={("Burger Bar", "Upgrade Your Fries"): SWAP},
    # The live feed spelt this "Cappuccino" on 6 October and "Cappucino" on 8 October (a typo on the venue's menu); the id stays "cappuccino".
    rename={"Cappucino": "Cappuccino"},
    holdback={
        "Scampi and Chips": "The feed prints 826 kcal; its own macros add up to about 672 kcal (and its kJ to about 607 kcal).",
    },
    note_txt=("From the menu of one Sizzling Pubs venue, used as published: other venues' menus and values may differ. Main menu only. "
              "A side, sauce, swap or topping you choose isn't added in, to the numbers or to the allergens. Weights in names (oz) are approximate uncooked weights."),
)

if __name__ == "__main__":
    sys.exit(mb.run(CHAIN))
