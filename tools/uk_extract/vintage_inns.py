#!/usr/bin/env python3
"""Build data/source/vintage-inns/ from Vintage Inns' own online menu (Mitchells & Butlers menu platform).

    curl -A "<a normal browser user agent>" -o /tmp/vintage-inns.html https://www.vintageinn.co.uk/mainmenu    # one request
    python3 tools/uk_extract/vintage_inns.py /tmp/vintage-inns.html --checked-on 2026-10-06
(--fetch also exists, but this site answered Python's own HTTP client with 403 on 2026-10-06 while a plain curl request with a
normal browser user agent got the page; the 403 is not worked around, so download the page with curl or a browser.)

Source: https://www.vintageinn.co.uk/mainmenu (brand-level "Main Menu", Mon-Sat). The page embeds the same menu document the
other M&B sites load from their menu API, as window.__REACT_QUERY_STATE__; mb_feed.load_menu reads it from the HTML.
Numbers are copied as the feed prints them; see mb_feed.py for how the feed is read. Only categories, the lines that are not
menu items, the held-back rows and the notes are written by hand below. Not read: /sunday-menu (menu "202"), which is a
separate page with its own embedded document.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mb_feed as mb  # noqa: E402
from mb_feed import Place  # noqa: E402

WHILST, STARTERS, MAINS, STEAKS, BURGERS, PIZZAS, SALADS, SIDES, ADDONS, PUDS = (
    "Whilst you decide", "Starters", "Mains", "Steaks", "Burgers", "Stone-baked pizzas", "Salads", "Sides", "Add-ons", "Puddings")

CHAIN = mb.Chain(
    chain_id="vintage-inns",
    name="Vintage Inns",
    cuisine="Pub",
    aliases=["vintage inns", "vintage inn", "vintage inns pub"],
    source_url="https://www.vintageinn.co.uk/mainmenu",
    source_title_prefix="Vintage Inns online main menu with nutrition (Mon-Sat)",
    expected_entries=66,
    places={
        ("WHILST YOU DECIDE", None): Place(WHILST, "Whilst you decide"),
        ("STARTERS", None): Place(STARTERS, "Starter"),
        ("MAINS", None): Place(MAINS, "Main"),
        ("STEAKS", None): Place(STEAKS, "Steak"),
        ("STEAKS", "IRRESISTIBLE EXTRAS:"): Place(SIDES, "Side"),
        ("BURGERS", None): Place(BURGERS, "Burger"),
        ("BURGERS", "ADD EXTRA TOPPINGS:"): Place(ADDONS, "Add-on", rankable=False),
        ("STONE-BAKED PIZZAS", None): Place(PIZZAS, "Pizza"),
        ("STONE-BAKED PIZZAS", "ADD EXTRA TOPPINGS TO ANY PIZZA:"): Place(ADDONS, "Add-on", rankable=False),
        ("SALADS", None): Place(SALADS, "Salad"),
        ("SIDES", None): Place(SIDES, "Side"),
        ("PUDDINGS", None): Place(PUDS, "Pudding", rankable=False, meat=False),
        ("MINI PUDDING & HOT DRINK (V)", None): Place(PUDS, "Mini pudding", rankable=False, meat=False),
    },
    skip={
        # One nutrition record cannot describe an item whose flavour changes every day.
        "Today's Soup": "the soup changes daily, so one set of values cannot describe it",
        "Home-Baked Pie of the Day": "the pie changes daily and the menu says to ask for the day's flavour and its calories",
    },
    rankable={"Honey & Truffle Baked Camembert": False},   # "for two to share"
    holdback={
        "Salt & Pepper Calamari": "The feed prints 479 kcal; its own macros add up to about 386 kcal (and its kJ to about 430 kcal).",
        "Trio of Ice Cream & Sorbet": "The feed prints 0.9 kcal for three scoops of ice cream or sorbet; the scoops are chosen separately and their values aren't added in.",
    },
    note_txt=("Main menu (Mon-Sat) only; the Sunday menu isn't included. A steak sauce or other choice you add isn't included. "
              "Today's Soup and the Pie of the Day aren't listed because they change daily. Weights in names (oz) are approximate uncooked weights."),
)

if __name__ == "__main__":
    sys.exit(mb.run(CHAIN))
