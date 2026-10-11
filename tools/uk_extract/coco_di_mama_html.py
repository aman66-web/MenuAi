#!/usr/bin/env python3
"""Build data/source/coco-di-mama/ from Coco di Mama's own HTML menu pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/coco_di_mama_html.py CACHE_DIR --fetch                     # download the pages politely (12 restaurants + 136 delivery kitchens)
    python3 tools/uk_extract/coco_di_mama_html.py CACHE_DIR --checked-on 2026-10-10 [--out DIR] [--no-write]

Replaces the old nutrition-PDF route (Coco di Mama's PDFs are on cdn.sanity.io, which disallows /*.pdf in robots.txt: data/held-robots/README.md).
This script never reads those PDFs. Everything comes from https://www.cocodimama.co.uk/menus (the central page) and the menu page of every
restaurant and delivery kitchen the site's sitemap lists, e.g. https://www.cocodimama.co.uk/locations/restaurant/london-bankside/menus and
https://www.cocodimama.co.uk/locations/delivery-kitchen/canterbury/menus. robots.txt of www.cocodimama.co.uk (checked with robots_rfc.py):
`User-agent: *  Allow: /  Disallow: /api/ /studio/ /bookings/share/ /_next/`. The menu pages are allowed; no other host is contacted (the page's data
is inline in the HTML; /_next/ and /api/ are never requested).

How the pages are read, how a dish qualifies and what is left out: see azzurri_html.py (shared with zizzi_html.py and ask_italian_html.py).
Coco di Mama specifics:
- Two kinds of site have their own menu: the 12 restaurants (their pages are identical to the central /menus page) and the 136 delivery kitchens
  (a shorter menu of its own). Each kind is a separate menu: the same dish name on both with different calories becomes two items, the delivery
  one named "Dish (Delivery kitchen menu)"; the same name and calories on both is one item.
- PASTA is NOT published. The restaurant menu's PASTA heading says "Kcals shown are for sauce only - please see our Nutritional Guide on our
  website for full details": the number is not the dish. The delivery menu's pasta sections (PASTA - GRANDE / PASTA - MIDI) print no such line but
  list the same sauces with sauce-sized numbers (e.g. a Bolognese pot at 252 kcal), so they are left out too. The Nutritional Guide it points to is
  the PDF (disallowed by robots.txt) and is not used.
- Hot and iced coffees, matcha, tea and hot chocolate: the page says "Kcals based on Whole Dairy Milk where applicable"; printed as is.
- Calories only: a dish prints "NNN kcal" and nothing else. Meal deals, "Build your own Power Bowl" and one pastry print none: not published.
- "NEW⭐" is a menu marker, not part of the name (removed); names otherwise as printed, including "(V)" / "(VE)".
- Allergens: none published here. The site's allergen source is a PDF (disallowed by robots.txt); the per-dish allergen list in the page's script
  data is not shown on the page and is not used.
- Tags: vegetarian only when every record of the dish carries the page's own Vegetarian or Vegan chip; contains_pork / contains_beef only from the
  printed name or description. Everything else is "meat type not stated".
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import azzurri_html as A  # noqa: E402

R, D = "restaurant", "delivery-kitchen"
VARIANTS = {R: "Menu", D: "Delivery kitchen menu"}
SAUCE_ONLY = "calories for the sauce only (the page says so); not the dish"
CATEGORIES = {
    (R, ("MEDITERRANEAN POWER BOWLS",)): "Mediterranean Power Bowls",
    (R, ("SOURDOUGH PINSAS",)): "Sourdough Pinsas",
    (R, ("SALADS",)): "Salads",
    (R, ("SANDWICHES",)): "Sandwiches",
    (R, ("HOT & HEARTY",)): "Hot & Hearty",
    (R, ("SIDES",)): "Sides",
    (R, ("SWEET TREATS",)): "Sweet Treats",
    (R, ("BREAKFAST - SOURDOUGH BAGUETTES",)): "Breakfast",
    (R, ("BREAKFAST - PUCCIA",)): "Breakfast",
    (R, ("BREAKFAST - EGG BOXES",)): "Breakfast",
    (R, ("BREAKFAST - PORRIDGE",)): "Breakfast",
    (R, ("BREAKFAST - ON THE SIDE",)): "Breakfast",
    (R, ("PASTRIES",)): "Pastries",
    (R, ("YOGHURTS & FRUIT",)): "Yoghurts & Fruit",
    (R, ("COLD DRINKS",)): "Cold Drinks",
    (R, ("COFFEES - HOT",)): "Hot Coffees",
    (R, ("COFFEES - ICED",)): "Iced Coffees",
    (R, ("MATCHA",)): "Matcha",
    (R, ("TEA & HOT CHOCOLATE",)): "Tea & Hot Chocolate",
    (D, ("SOURDOUGH PINSA",)): "Delivery kitchen menu - Sourdough Pinsas",
    (D, ("SIDES",)): "Delivery kitchen menu - Sides",
    (D, ("SWEET TREATS",)): "Delivery kitchen menu - Sweet Treats",
    (D, ("DRINKS",)): "Delivery kitchen menu - Drinks",
}
EXCLUDED = {
    (R, ("PASTA",)): SAUCE_ONLY,
    (D, ("PASTA - GRANDE",)): "pasta dish calories not stated as dish or sauce; see the module note",
    (D, ("PASTA - MIDI",)): "pasta dish calories not stated as dish or sauce; see the module note",
}

NOTE = ("Calories only, as printed on Coco di Mama's menu pages; protein, carbs, fat and allergens are not published. Pasta is not listed because the "
        "page prints calories for the sauce only. Drinks with milk are based on whole dairy milk. Dishes under Delivery kitchen menu are on the delivery kitchens' menus only.")


def variant_fn(site: str, tab: str) -> str:
    if site == "central" or "locations__restaurant__" in site:
        return R
    if "locations__delivery-kitchen__" in site:
        return D
    raise SystemExit(f"{site}: not a restaurant or delivery kitchen page")


COCO = A.Chain(
    id="coco-di-mama", name="Coco di Mama", host="www.cocodimama.co.uk", cuisine="Italian", aliases=["coco di mama", "cocodimama", "coco di mama italian"],
    source_title="Coco di Mama menu pages with calories (cocodimama.co.uk/menus and each restaurant's and delivery kitchen's menu page), read 10 October 2026",
    venue_re=r"^/locations/(restaurant|delivery-kitchen)/.+/menus$", venue_path=lambda fp: f"/locations/{fp}/menus",
    variants=VARIANTS, categories=CATEGORIES, excluded_sections=EXCLUDED, note=NOTE, variant_fn=variant_fn, tab_titles=False,
    expected_items=185, min_sites=5,
)

if __name__ == "__main__":
    sys.exit(A.run(COCO))
