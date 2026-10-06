#!/usr/bin/env python3
"""Build data/source/harvester/ from Harvester's own online menu feed (Mitchells & Butlers menu platform).

    python3 tools/uk_extract/harvester.py --fetch /tmp/harvester --checked-on 2026-10-06     # one download + build
    python3 tools/uk_extract/harvester.py path/to/harvester.json --checked-on 2026-10-06

Source: the JSON that https://www.harvester.co.uk's menu page (<mab-menu>) loads, brand-level, main menu:
https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic?id=8d410232-9d61-500c-8e48-40e3e6d449c7&websitePageUrlPath=main-menu1&idType=Brand&salesChannel=DynamicWebMenus
Numbers are copied as the feed prints them; see mb_feed.py for how the feed is read. Only categories, the lines that are not
menu items, the held-back rows and the notes are written by hand below. Not read: the feed's other menus (breakfast, salad
bar, kids, lunch, evening set, Sunday, buffet, drinks), which use other websitePageUrlPath values.
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402
from mb_feed import Place  # noqa: E402

STARTERS, ROTI, STEAKS, GRILLS, SIDES, SAUCES, BURGERS, CLASSICS = (
    "Starters & small plates", "Rotisserie, skewers & ribs", "Chargrilled steaks", "Grills & combos", "Sides", "Sauces & dips",
    "Burgers", "The classics")
FLAT, BOWLS, SANDS, DESSERTS, SUNDAES, ADDONS, SHARE = (
    "Flatbreads", "Rice bowls", "Sandwiches", "Desserts", "Sundaes", "Add-ons", "Sharing platters")

CHAIN = mb.Chain(
    chain_id="harvester",
    name="Harvester",
    cuisine="Grill",
    aliases=["harvester", "harvester restaurant", "the harvester"],
    source_url="https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic?id=8d410232-9d61-500c-8e48-40e3e6d449c7&websitePageUrlPath=main-menu1&idType=Brand&salesChannel=DynamicWebMenus",
    source_title_prefix="Harvester online main menu with nutrition (live menu feed)",
    expected_entries=134,
    places={
        ("Starters & Small Plates", None): Place(STARTERS, "Starter"),
        ("Starters & Small Plates", "Shareables"): Place(SHARE, "Sharing platter", rankable=False),
        ("Rotisserie, Skewers & Ribs", "1. Choose your protein"): Place(ROTI),
        ("Rotisserie, Skewers & Ribs", "2. Choose Your Glaze"): Place(SAUCES, "Sauce", rankable=False, meat=False),
        ("Rotisserie, Skewers & Ribs", "3. Choose Your Side"): Place(SIDES, "Side"),
        ("Rotisserie, Skewers & Ribs", "4. Choose Your Dip"): Place(SAUCES, "Sauce", rankable=False, meat=False),
        ("Rotisserie, Skewers & Ribs", "ADD A TASTY EXTRA TO YOUR MEAL"): Place(ADDONS, "Add-on", rankable=False),
        ("Chargrilled Steaks", "1. Choose your protein:"): Place(STEAKS),
        ("Chargrilled Steaks", "2. Choose your sauce:"): Place(SAUCES, "Sauce", rankable=False, meat=False),
        ("Chargrilled Steaks", "3. Choose your side"): Place(SIDES, "Side"),
        ("Grills & Combos", None): Place(GRILLS),
        ("Sides", None): Place(SIDES, "Side"),
        ("UP YOUR SAUCE GAME", None): Place(SAUCES, "Sauce", rankable=False, meat=False),
        ("Burger Bar", "Beef"): Place(BURGERS, "Burger"),
        ("Burger Bar", "Chicken"): Place(BURGERS, "Burger"),
        ("Burger Bar", "Veggie 'N' Vegan"): Place(BURGERS, "Burger"),
        ("Burger Bar", "ADD AN EXTRA BURGER PATTY"): Place(ADDONS, "Add-on", rankable=False),
        ("Burger Bar", "UPGRADE YOUR CHIPS"): Place(SIDES, "Side", meat=False),
        ("The Classics", None): Place(CLASSICS, "Classics"),
        ("The Classics", "Simply Classics"): Place(CLASSICS, "Simply Classics"),
        ("Flatbreads", None): Place(FLAT, "Flatbread"),
        ("Rice Bowls", None): Place(BOWLS, "Rice bowl"),
        ("Sandwiches", None): Place(SANDS, "Sandwich"),
        ("Desserts", None): Place(DESSERTS, "Dessert", rankable=False, meat=False),
        ("Desserts", "Mini Dessert & Hot Drink (V)"): Place(DESSERTS, "Mini dessert", rankable=False, meat=False),
        ("Sundaes", None): Place(SUNDAES, "Sundae", rankable=False, meat=False),
    },
    # The three chargrilled skewer dishes are listed under the heading "Chargrilled Skewers" with only their protein as the name.
    rename={
        "Chicken": "Chargrilled Chicken Skewers",
        "Chicken & Chorizo": "Chicken & Chorizo Skewers",
        "Halloumi & Padrón Pepper": "Halloumi & Padrón Pepper Skewers",
    },
    serving={
        "Our Favourites": "Platter for 2-3 people",   # the menu's own caption: "Platters for 2-3 people."
        "The Classics": "Platter for 2-3 people",
    },
    holdback={
        "Crispy Calamari": "The feed prints 354 kcal; its own macros add up to about 237 kcal (and its kJ to about 261 kcal).",
        "Wholetail Whitby Scampi": "The feed prints 1,052 kcal; its own macros add up to about 854 kcal (and its kJ to about 761 kcal).",
    },
    note_txt=("Main menu only (kids, breakfast, salad bar and set menus aren't included). Each dish is listed as the menu publishes it: "
              "a side, sauce, swap or topping you choose isn't added in, to the numbers or to the allergens. Weights in names (oz) are approximate uncooked weights."),
)

if __name__ == "__main__":
    sys.exit(mb.run(CHAIN))
