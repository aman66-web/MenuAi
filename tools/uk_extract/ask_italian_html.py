#!/usr/bin/env python3
"""Build data/source/ask-italian/ from ASK Italian's own HTML menu pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/ask_italian_html.py CACHE_DIR --fetch                      # download the pages politely (about 55 restaurants x 3 menus)
    python3 tools/uk_extract/ask_italian_html.py CACHE_DIR --checked-on 2026-10-10 [--out DIR] [--no-write]

Replaces the old nutrition-PDF route (ASK's PDFs are on cdn.sanity.io, which disallows /*.pdf in robots.txt: data/held-robots/README.md).
This script never reads those PDFs. Everything comes from https://www.askitalian.co.uk/menus (the central page), each restaurant's own page,
e.g. https://www.askitalian.co.uk/italian-restaurants/wales/cardiff/menus, and the menu tabs the page itself lists (/menus/grande-set-menu,
/menus/kids-set-menu). robots.txt of www.askitalian.co.uk (checked with robots_rfc.py): `User-agent: *  Allow: /  Disallow: /api/ /studio/
/bookings/share/ /_next/`. The menu pages are allowed; no other host is contacted (the page's data is inline in the HTML; /_next/ and /api/ are
never requested).

How the pages are read, how a dish qualifies and what is left out: see azzurri_html.py (shared with zizzi_html.py and coco_di_mama_html.py).
ASK specifics:
- Calories only: a dish's card prints "NNN kcal" and nothing else, so protein, carbs and fat stay blank and every item is not rankable. The pages
  say, in their "Allergen information" panel: "Figures are approximate as all our ingredients are measured by hand ... a mixture of theoretical
  calculations and laboratory testing ... all core menu dishes and does not include substitutions or extra ingredients."
- Alcoholic drinks print no calories on the page (the page's script data holds a number for them): not published, that number is never used.
- The restaurants: the 55 open restaurants whose menu pages the sitemap lists (the site's data also holds closed and test venues, left out).
- Allergens: none published here. The site's allergen source is the "Allergen guide" PDF (disallowed by robots.txt); the per-dish allergen list in
  the page's script data is not shown on the page and is not used.
- Tags: vegetarian only when every record of the dish carries the page's own Vegetarian or Vegan chip; contains_pork / contains_beef only from the
  printed name or description. Everything else is "meat type not stated".
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import azzurri_html as A  # noqa: E402

M = "menu"
VARIANTS = {M: "Menu", "grande-set-menu": "Grande Set Menu", "kids-set-menu": "Kids Set Menu"}
CATEGORIES = {
    (M, ("Bread & Nibbles",)): "Bread & Nibbles",
    (M, ("Starters",)): "Starters",
    (M, ("Pizza",)): "Pizza",
    (M, ("Pasta Fresca",)): "Pasta Fresca",
    (M, ("Al Forno & Lasagne",)): "Al Forno & Lasagne",
    (M, ("Classic Pasta & Risotto",)): "Classic Pasta & Risotto",
    (M, ("Speciality Mains & Salads",)): "Speciality Mains & Salads",
    (M, ("Sides",)): "Sides",
    (M, ("Non-Gluten Dishes",)): "Non-Gluten Dishes",
    (M, ("Desserts", "Desserts - Signatures")): "Desserts",
    (M, ("Desserts", "Desserts - Classics")): "Desserts",
    (M, ("Cocktails", "Spritz")): "Spritz",
    (M, ("Mocktails", "Mocktails - Signatures")): "Mocktails",
    (M, ("Mocktails", "Mocktails - Classics")): "Mocktails",
    (M, ("Soft Drinks",)): "Soft Drinks",
    (M, ("Hot Drinks",)): "Hot Drinks",
}
SET_MENU_SECTIONS = {"Starter": "Starters", "Starters": "Starters", "Mains": "Mains", "Desserts": "Desserts",
                     "Finish with a Babyccino": "Babyccino"}  # the sections the Grande and Kids set menus print -> category word
for _v, _label in VARIANTS.items():
    if _v != M:
        for _s, _word in SET_MENU_SECTIONS.items():
            CATEGORIES[(_v, (_s,))] = f"{_label} - {_word}"

NOTE = ("Calories only, as printed on ASK Italian's menu pages (approximate, core dishes without substitutions); protein, carbs, fat and allergens "
        "are not published. Alcoholic drinks print no calories. A dish on a set menu with different calories carries that menu's name.")

ASK = A.Chain(
    id="ask-italian", name="ASK Italian", host="www.askitalian.co.uk", cuisine="Italian", aliases=["ask italian", "ask italian restaurant"],
    source_title="ASK Italian menu pages with calories (askitalian.co.uk/menus and each restaurant's menu pages: full menu, Grande and Kids set menus), read 10 October 2026",
    venue_re=r"^/italian-restaurants/.+/menus$", venue_path=lambda fp: f"/italian-restaurants/{fp}/menus",
    variants=VARIANTS, categories=CATEGORIES, excluded_sections={}, note=NOTE, expected_items=178, min_sites=5,
)

if __name__ == "__main__":
    sys.exit(A.run(ASK))
