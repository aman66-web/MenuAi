#!/usr/bin/env python3
"""Build data/source/zizzi/ from Zizzi's own HTML menu pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/zizzi_html.py CACHE_DIR --fetch                      # download the pages politely (about 130 restaurants x 5 menus)
    python3 tools/uk_extract/zizzi_html.py CACHE_DIR --checked-on 2026-10-10 [--out DIR] [--no-write]

Replaces the old nutrition-PDF route (Zizzi's PDFs are on cdn.sanity.io, which disallows /*.pdf in robots.txt: data/held-robots/README.md).
This script never reads those PDFs. Everything below comes from the pages https://www.zizzi.co.uk/menus (the central page) and each
restaurant's own pages, e.g. https://www.zizzi.co.uk/italian-restaurants/south-east/canterbury/menus, plus the menu tabs the page itself
lists (/menus/set-menu = "3 Course Menu", /menus/2-course-lunch-menu, /menus/set-menu-bambini = "Bambini Menu", /menus/festive-set-menu).
robots.txt of www.zizzi.co.uk (checked with robots_rfc.py): `User-agent: *  Allow: /  Disallow: /api/ /studio/ /bookings/share/ /_next/`.
The menu pages are allowed; no other host is contacted (the page's data is inline in the HTML; /_next/ and /api/ are never requested).

How the pages are read, how a dish qualifies and what is left out: see azzurri_html.py (shared with ask_italian_html.py and
coco_di_mama_html.py). Zizzi specifics:
- Calories only: a dish's card prints "NNN kcal" and nothing else (no protein, carbs or fat, no portion size), so those stay blank and every item
  is not rankable. The pages say, in their "Allergen information" panel: "Figures are approximate as all our ingredients are measured by hand ...
  a mixture of theoretical calculations and laboratory testing ... all core menu dishes and does not include substitutions or extra ingredients."
- Alcoholic drinks (cocktails, wine, beer, spirits, liqueurs, 107 of the 299 dishes) print no calories on the page, although the page's script data
  holds a number for them: they are not published and that number is never used. One dessert (Gelato & Sorbet) prints none either.
- The restaurants: only restaurants in Great Britain (the site also lists three in Dublin and two in Belfast, which the site gives their own ROI &
  Belfast guides: left out); the sitemap lists 132 menu pages, 127 of them GB.
- Allergens: none published here. The site's only allergen source is the "Allergen Guide (UK)" PDF (disallowed by robots.txt); the per-dish allergen
  list that sits in the page's script data is not shown on the page and is not used.
- Tags: vegetarian only when every record of the dish carries the page's own Vegetarian or Vegan chip; contains_pork / contains_beef only from the
  printed name or description (e.g. pancetta, pepperoni, 'nduja; beef). Everything else is "meat type not stated".
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import azzurri_html as A  # noqa: E402

M = "menu"
VARIANTS = {M: "Menu", "set-menu": "3 Course Menu", "2-course-lunch-menu": "2 Course Lunch Menu", "set-menu-bambini": "Bambini Menu",
            "festive-set-menu": "Festive Set Menu", "two-feast-for-50": "Two Feast for \u00a350"}  # the last one is a tab only some restaurants list
CATEGORIES = {
    (M, ("Starters", "Aperitivo")): "Starters",
    (M, ("Starters", "Starters")): "Starters",
    (M, ("Starters", "To Share")): "To Share",
    (M, ("The Rustica", "The Rustica")): "The Rustica",
    (M, ("Pizza", "Calzone")): "Pizza",
    (M, ("Pizza", "Classico")): "Pizza",
    (M, ("Pizza", "Fresca")): "Pizza",
    (M, ("Superiore Pasta", "Superiore Pasta")): "Superiore Pasta",
    (M, ("Pasta", "Classico")): "Pasta",
    (M, ("Pasta", "Al Forno")): "Pasta",
    (M, ("Signature Dishes & Salads", "SIGNATURE DISHES")): "Signature Dishes",
    (M, ("Signature Dishes & Salads", "Salads")): "Salads",
    (M, ("On The Side", "On The Side")): "On The Side",
    (M, ("Desserts", "Desserts")): "Desserts",
    (M, ("Non-Gluten Pizzas",)): "Non-Gluten Pizzas",
    (M, ("Non-Gluten Pastas",)): "Non-Gluten Pastas",
    (M, ("Drinks", "Mocktails & Softs")): "Soft Drinks & Mocktails",
    (M, ("Drinks", "Beer & Cider")): "Soft Drinks & Mocktails",  # only the alcohol-free beer prints calories
    (M, ("Drinks", "Coffee")): "Coffee & Tea",
    (M, ("Drinks", "Ice Coffee")): "Coffee & Tea",
    (M, ("Drinks", "Tea")): "Coffee & Tea",
    (M, ("Drinks", "Feeling a little extra?")): "Coffee & Tea",
    (M, ("Bambini", "Drinks")): "Bambini - Drinks",
    (M, ("Bambini", "Sides")): "Bambini - Sides",
}
for _v, _label in VARIANTS.items():
    if _v != M:
        for _s in ("Starters", "Mains", "Desserts"):
            CATEGORIES[(_v, (_s,))] = f"{_label} - {_s}"

NOTE = ("Calories only, as printed on Zizzi's menu pages (approximate, core dishes without substitutions); protein, carbs, fat and allergens are not "
        "published. Alcoholic drinks print no calories. A dish whose calories differ on another menu (such as Two Feast for \u00a350) carries that menu's name.")

ZIZZI = A.Chain(
    id="zizzi", name="Zizzi", host="www.zizzi.co.uk", cuisine="Italian", aliases=["zizzi", "zizzi italian"],
    source_title="Zizzi menu pages with calories (zizzi.co.uk/menus and each restaurant's menu pages: full menu, 3 course, 2 course lunch, Bambini and festive set menus), read 10-11 October 2026",
    venue_re=r"^/italian-restaurants/.+/menus$", venue_path=lambda fp: f"/italian-restaurants/{fp}/menus",
    variants=VARIANTS, categories=CATEGORIES, excluded_sections={}, note=NOTE, limited=("festive-set-menu",),
    non_gb_cta="ROI & Belfast", expected_items=237, min_sites=5,
)

if __name__ == "__main__":
    sys.exit(A.run(ZIZZI))
