#!/usr/bin/env python3
"""Build data/source/toby-carvery/ from Toby Carvery's own online menu feed (Mitchells & Butlers menu platform).

    python3 tools/uk_extract/toby_carvery.py --fetch /tmp/toby --checked-on 2026-10-06     # one download + build
    python3 tools/uk_extract/toby_carvery.py path/to/toby-carvery.json --checked-on 2026-10-06

Source: the JSON that https://www.tobycarvery.co.uk's menu page (<mab-menu>) loads, brand-level, "Main Menu & Puddings":
https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic?id=199623e5-6688-5fb7-986b-961c2902d162&websitePageUrlPath=main-menu1&idType=Brand&salesChannel=DynamicWebMenus
Numbers are copied as the feed prints them; see mb_feed.py for how the feed is read. Only categories, the lines that are not
menu items, the held-back rows and the notes are written by hand below. Not read: the feed's other menus (breakfast,
children's, set menu, drinks), which use other websitePageUrlPath values.
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402
from mb_feed import Place  # noqa: E402

STARTERS, TASTERS, WRAPS, CARVERY, VEG, PUDS, DRINKS, ADDONS = (
    "Starters", "Toby tasters", "Yorkie wraps & sandwiches", "Carvery", "Vegetarian, vegan & fish", "Puddings", "Hot drinks", "Add-ons")

CHAIN = mb.Chain(
    chain_id="toby-carvery",
    name="Toby Carvery",
    cuisine="Carvery",
    aliases=["toby carvery", "toby", "tobys carvery"],
    source_url="https://api-production.mbplc.io/webappbff/api/v1/menus/dynamic?id=199623e5-6688-5fb7-986b-961c2902d162&websitePageUrlPath=main-menu1&idType=Brand&salesChannel=DynamicWebMenus",
    source_title_prefix="Toby Carvery online main menu and puddings with nutrition (live menu feed)",
    expected_entries=53,
    places={
        ("Starters", None): Place(STARTERS, "Starter"),
        ("Toby Tasters", None): Place(TASTERS, "Taster"),
        ("Toby Tasters", "Loaded tasters"): Place(TASTERS, "Taster"),
        ("Yorkie Wraps & Sandwiches", None): Place(WRAPS, "Sandwich", rankable=False),
        ("Yorkie Wraps & Sandwiches", "Add the finishing touches"): Place(ADDONS, "Add-on", rankable=False),
        ("Our Famous Carvery", None): Place(CARVERY, "Carvery", rankable=False),
        ("Vegetarian, Vegan & Fish", None): Place(VEG, "Main"),
        ("Toby Pudding Co", "Classics"): Place(PUDS, "Pudding", rankable=False, meat=False),
        ("Toby Pudding Co", "Sundaes"): Place(PUDS, "Sundae", rankable=False, meat=False),
        ("Toby Pudding Co", "Homebaked"): Place(PUDS, "Pudding", rankable=False, meat=False),
        ("Toby Pudding Co", "Mini Pudding & Hot Drink"): Place(PUDS, "Mini pudding", rankable=False, meat=False),
        ("Hot Drinks", None): Place(DRINKS, "Drink", rankable=False, meat=False),
    },
    skip={
        "Vegetarian": "the meat-free carvery option prints 0 for every nutrient (there is no meat portion to show)",
    },
    # The wrap is a whole dish (it includes the Yorkshire pudding); the other lines are fillings whose bread is a separate choice.
    rankable={"Mac & Cheese Yorkie Wrap": True},
    notes={
        "Liqueur Hot Chocolate": "Printed values are identical to the Hot Chocolate row",
    },
    holdback={},
    note_txt=("Main menu and puddings only. Carvery meats and sandwich fillings are listed without the bread, roast potatoes, "
              "vegetables, Yorkshire pudding and gravy that come with them (Toby publishes those at the carvery deck), so a plate is "
              "higher and their allergens aren't included. A sauce, custard or topping you choose isn't added in either."),
)

if __name__ == "__main__":
    sys.exit(mb.run(CHAIN))
