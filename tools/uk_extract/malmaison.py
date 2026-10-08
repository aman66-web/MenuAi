#!/usr/bin/env python3
"""Build data/source/malmaison/ from Malmaison's own allergen and calorie pages (hosted by Ten Kites). A CALORIES-ONLY chain.

    python3 tools/uk_extract/malmaison.py --pages DIR --pdfs DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR (--pages) holds the saved pages (--fetch downloads them first, one request per second):
    main.html       https://menus.tenkites.com/mhdv/malmaison                      Chez Mal Autumn/Winter 2026 (the page malmaison.com links
                                                                                    as "Click here to view allergens")
    bar.html        ...?mguid=c8fca735-e9a1-4fb1-986f-d5eb0e3ccda3                 Chez Mal Bar Menu Autumn/Winter 2026
    sunday.html     ...?mguid=3b4589d6-7fa7-45ad-b06a-ecf737aa45df                 Chez Mal Sunday Roast Autumn/Winter 2026
    drinks.html     ...?mguid=1efb0d0f-cdf6-47e1-9217-5a2ad1f8c9a8                 Malmaison Beverage (only the hot drinks are used)
    breakfast.html, kids.html, tea.html   fetched only to check they have not changed; NOT published (see below).
--pdfs holds the chain's two printed menus on malmaison.com, used ONLY to cross-check calories (--fetch downloads them too):
    alc.pdf   https://www.malmaison.com/media/w4oh51ac/32039_mal_autumn_alc_grill_uk_v4.pdf   (PDF created 2 September 2026)
    bar.pdf   https://www.malmaison.com/media/e4hjenda/32039_mal_autumn_bar_uk.pdf             (PDF created 3 September 2026)
robots.txt: menus.tenkites.com disallows only /fonts/ /views/ /*.less$; malmaison.com disallows only /book/*.

What the page prints. ONE number per dish: "(488 kcal)" beside the dish name. The page is configured ShowNutrients = false
(ShowPrimaryNutrients = true): its HTML has no protein, carbohydrate, fat, kJ or any other nutrient, hidden or visible, and no control
reveals one, so this is a calories-only chain (docs/DATA.md "Calories-only chains"). Calories are copied as printed ("1,469 kcal"
-> 1469); every dish carries the 14-allergen Contains / May contain matrix, which is read in full (malmaison_pages.allergens: the
column marks, the pop-up text and the dish's label ids must agree, or the run stops). Serving: none stated ("per dish as served").

The page contradicts the chain's own printed menus. The A/W 2026 menus on malmaison.com print kcal for every dish too, and for most
dishes the two sources differ (Fried pickles 308 vs 283; Mal burger 1552 vs 1,469; Chateaubriand 2257 vs 1,599; even the bar menu's own
Fries 667 vs its own "Add fries" 489). A dish whose calories differ between the page and the printed menu is HELD BACK (holdback.csv
names both figures), whichever is right: PDF_CHECKS lists which page dish is which printed dish (names only; the numbers are read from
the PDF by pdf_kcal). Dishes with no printed counterpart are published as the page prints them.

Left out entirely (not in items.csv):
- Chez Mal Breakfast 2025, Kids Menu 2026, Afternoon Tea A/W 2026 menus: compared by eye with the printed breakfast (April 2025), kids
  and afternoon tea PDFs, nearly every dish differs (kids: all 19 differ from the printed kids menu's matching dish, a few matches
  approximate; afternoon tea: all 4 with a printed counterpart; breakfast: all but orange juice, 71 kcal, of about 18, e.g. Full cooked
  breakfast 792 vs 951, Eggs benedict 490 vs 859), and the tea page contradicts itself (Cream tea 146 kcal while its own Sticky toffee
  scone is 230). Page rows such as Omelette 2 kcal, Toast 6 kcal and Add spinach 2,029 kcal show those menus are unreliable.
- The "818 Tacos" section of the main menu (and the 818 menus): a limited collaboration, 14-74 kcal per taco with no stated filling basis.
- Belfast menus (Northern Ireland), Christmas, celebration, private dining, meetings, wedding, tour party menus (not the brasserie menu).
- Beverage menu: all cocktails (menu named 2024; values such as 7,591 kcal for a virgin cocktail), Sora (single-venue) and promo
  cocktails ("not available in all hotels"), and the Sora hot drinks. Kept: the "MAL" hot drinks.
- The Sunday "chefs table autumn.." row (name cut off by the page; not a dish).
- Exact duplicates (same name, same calories) of a dish already listed from another menu or section ("Dish of the day", Sunday
  desserts / mains / burgers, the bar menu's night room service).

Names: the page's kitchen prefix "MAL DISH -" is dropped; ALL-CAPS words are lower-cased; the Sunday roast names the page cuts off with
".." (e.g. "yorkie aw..") are given without the cut-off fragment (NAME_OVERRIDES). Tags: vegetarian only where the name carries the chain's
own "(VGI)" (vegan) mark or ends in "vegan"; contains_pork / contains_beef from the dish name or its sub-recipe names; nothing else.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import malmaison_pages as mp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "malmaison"
BASE = "https://menus.tenkites.com/mhdv/malmaison"
G_BAR, G_SUN, G_DRINKS = "c8fca735-e9a1-4fb1-986f-d5eb0e3ccda3", "3b4589d6-7fa7-45ad-b06a-ecf737aa45df", "1efb0d0f-cdf6-47e1-9217-5a2ad1f8c9a8"
G_BREAKFAST, G_KIDS, G_TEA = "163457f9-a282-438a-9729-d228aa7fb696", "5fb3e551-991d-475b-a1b2-d1f9561da91a", "02c9a1e8-4c7b-44ff-8b56-fd82c108afd9"
# file -> (url, menu name the page must carry, number of dishes it must have)
PAGES = {
    "main.html": (BASE, "Chez Mal Autumn/Winter 2026", 78),
    "bar.html": (f"{BASE}?mguid={G_BAR}", "Chez Mal Bar Menu Autumn/Winter 2026", 15),
    "sunday.html": (f"{BASE}?mguid={G_SUN}", "Chez Mal Sunday Roast Autumn/Winter 2026", 21),
    "drinks.html": (f"{BASE}?mguid={G_DRINKS}", "Malmaison Beverage", 273),
}
EXCLUDED_PAGES = {
    "breakfast.html": (f"{BASE}?mguid={G_BREAKFAST}", "Chez Mal Breakfast 2025", 78),
    "kids.html": (f"{BASE}?mguid={G_KIDS}", "Chez Mal Kids Menu 2026", 19),
    "tea.html": (f"{BASE}?mguid={G_TEA}", "Chez Mal Afternoon Tea Autumn/Winter 2026", 21),
}
PDFS = {
    "alc": "https://www.malmaison.com/media/w4oh51ac/32039_mal_autumn_alc_grill_uk_v4.pdf",
    "bar": "https://www.malmaison.com/media/e4hjenda/32039_mal_autumn_bar_uk.pdf",
}
SOURCE_TITLE = ("Malmaison allergen and calorie pages on Ten Kites: Chez Mal Autumn/Winter 2026, Bar, Sunday Roast and Beverage menus "
                "(accessed 2026-10-08, no date shown)")
ALLERGEN_TITLE = "Malmaison allergen matrix on Ten Kites (Contains / May contain, Chez Mal Autumn/Winter 2026 and related menus)"
NOTE = ("Calories only, per dish as served, from Malmaison's allergen page; protein, carbs and fat are not published. A dish is left "
        "out where the page and Malmaison's printed menu give different calories. Breakfast, kids, afternoon tea and cocktails are not listed.")

# main-menu section -> category (None = not published)
MAIN_SECTIONS = {
    "little kick start": "Little kick start", "Starters": "Starters", "Burgers": "Burgers", "protein salads": "Protein salads",
    "mains grill": "Mains", "Steak grass fed": "Grass-fed steak", "Bone in steak": "Bone-in steak", "More meat": "More meat",
    "sauces": "Sauces", "Josper add ons": "Josper add-ons", "sides": "Sides", "desserts": "Desserts",
    "Dish of the day": "Mains",  # the same dishes as "mains grill" (exact duplicates are dropped)
    "Room Service + Night bites": "Room service & night bites",
    "818 Tacos": None,
}
BAR_SECTIONS = {"bar": "Bar menu", "Nights room service": "Room service & night bites"}
SUNDAY_SECTIONS = {"chefs table autumn 25": None, "Roasts": "Sunday roasts", "Desserts": "Desserts", "mains grill": "Mains", "Burgers": "Burgers"}
DRINK_SECTIONS = {"Hot Beverages": "Hot drinks", "Mal Cocktails 2024": None,
                  "Sora Promo cocktails - ONLY AVAILABLE IN SORA": None, "Mal promo cocktails - NOT AVAILABLE IN ALL HOTELS": None,
                  "Sora Cocktails 2025 - ONLY AVAILABLE IN SORA": None}
MENU_SECTIONS = {"main.html": MAIN_SECTIONS, "bar.html": BAR_SECTIONS, "sunday.html": SUNDAY_SECTIONS, "drinks.html": DRINK_SECTIONS}

# page names the page cuts off ("..") or that need a clearer name; value = the name shown
NAME_OVERRIDES = {
    "MAL DISH - Sunday roast beef, thyme rosemary yorkie aw..": "Sunday roast beef, thyme rosemary yorkie",
    "MAL DISH - Sunday roast pork tomahawk, thyme rosemary yorkie aw..": "Sunday roast pork tomahawk, thyme rosemary yorkie",
    "MAL DISH - Sunday roast chicken breast , Hampshire pork stuffing, thyme rosemary yorkie aw..":
        "Sunday roast chicken breast, Hampshire pork stuffing, thyme rosemary yorkie",
    "MAL DISH salmon, charred lemon, watercress salad..": "Salmon, charred lemon, watercress salad",
    "MAL DISH - NGCI Sunday roast beef aw..": "NGCI Sunday roast beef",
    "MAL DISH - NGCI Sunday roast chicken breast am..": "NGCI Sunday roast chicken breast",
    "MAL DISH - Protein salads - flat iron steak, 2 fried eggs, sliced avocado, watercress, olive oil":
        "Flat iron steak, 2 fried eggs, sliced avocado, watercress, olive oil",
}
# 0 kcal is held back (a dish with ingredients cannot be 0 kcal) except these plain coffees
ZERO_OK = {"MAL Americano (Black)", "MAL Espresso"}
# implausible figures judged from the same page (never corrected; restoring one = deleting its line in holdback.csv)
IMPLAUSIBLE = {
    "MAL DISH - CHICKEN MAKHANI CURRY & PILAU RICE":
        "215 kcal is far below the same page's other curry-and-rice dishes (880 and 1,233 kcal); not published until Malmaison confirms",
    "MAL DISH Two fried eggs": "79 kcal for two fried eggs is implausibly low; not published until Malmaison confirms",
}

# dishes whose allergen row contradicts the dish's own name (verified 2026-10-08 against a fresh read of the page): never corrected,
# held back (restoring one = deleting its line in holdback.csv). The page's plain "Ice Cream" scoops mark soya only (no milk, no egg),
# but its sub-recipe is a nameless "x1 ball of icecream", the dessert menu names its other ice cream "milk ice cream" (milk, eggs) and
# the printed menu lists "ICE CREAM & SORBET" as [VGIA] (= vegan alternative available) at 70 kcal per scoop (the page: 66): the page
# does not say this scoop is the vegan one, so a milk-free "Ice Cream" is not published.
_ICE = ("allergen row contradicts the dish name: 'Ice Cream' is marked soya only (no milk, no eggs) but the page does not say it is "
        "the vegan ice cream (its other ice cream is called 'milk ice cream'; Malmaison's printed menu marks 'ICE CREAM & SORBET' "
        "[VGIA], vegan alternative available); not published until Malmaison confirms")
ALLERGEN_CONTRADICTS = {
    "MAL DISH - Ice Cream 1 scoop": _ICE,
    "MAL DISH - Ice Cream 2 Scoop": _ICE,
    "MAL DISH - Ice Cream 3 Scoop": _ICE,
}

# page dish (exact name on the page) -> printed-menu checks [(pdf, heading text, option number)]. Names only: the calories
# are read from the PDF by malmaison_pages.pdf_kcal, which stops if a heading is missing or not unique.
A, B = "alc", "bar"
PDF_CHECKS = {
    "MAL DISH - Gordal olives": [(A, "GORDAL OLIVES", 0)],
    "MAL DISH - frickles & harissa mayo": [(A, "FRIED PICKLES", 0)],
    "MAL DISH - Baked rosemary focaccia, arbequina oil": [(A, "ROSEMARY SEA SALT FOCACCIA", 0), (B, "ROSEMARY SEA SALT FOCACCIA", 0)],
    "MAL DISH - roasted butternut squash soup, chilli cream, crispy sage": [(A, "ROASTED BUTTERNUT SQUASH SOUP", 0), (B, "ROASTED BUTTERNUT SQUASH SOUP", 0)],
    "MAL DISH - mug of soup roasted butternut squash soup, chilli cream, crispy sage": [(B, "ROASTED BUTTERNUT SQUASH SOUP", 0)],
    "MAL DISH - Buffalo chicken, padron peppers, blue cheese, ranch dressing": [(A, "CRISPY BUTTERMILK FRIED CHICKEN THIGHS", 0)],
    "MAL DISH Argentinian Konro roasted prawns, chilli & lime butter": [(A, "GRILLED ARGENTINIAN RED PRAWNS", 0)],
    "MAL DISH - Beetroot carpaccio, vegan stracciatella, pine nut & cranberry dressing": [(A, "BEETROOT CARPACCIO, STRACCIATELLA", 0)],
    "MAL DISH - Winter panzanella salad, taleggio cheese, sourdough croutons": [(A, "WARM WINTER PANZANELLA SALAD", 0)],
    "MAL DISH - citrus cured salmon, winter slaw, capers, creme fraiche, rye bread": [(A, "CITRUS CURED LOCH DUART SALMON", 0)],
    "MAL DISH - Seared scallops, cauliflower puree, blaggis": [(A, "PAN-FRIED SCALLOPS, BLAGGIS PUDDING", 0)],
    "MAL DISH - Chez mal Burger, gruyere, Ayrshire bacon, fries, relish": [(A, "MAL BURGER", 0)],
    "MAL DISH the stack": [(A, "STACK IT UP", 0)],
    "MAL DISH - Falafel & spinach burger (VGI)": [(A, "FALAFEL & SPINACH BURGER", 0)],
    "MAL DISH chicken protein bowl - sliced avocado, roasted pumpkin, pickled red onion, toasted seeds":
        [(A, "GRILLED SALMON FILLET / GRILLED CHICKEN BREAST / GRILLED HALLOUMI", 1)],
    "MAL DISH halloumi protein bowl - sliced avocado, roasted pumpkin, pickled red onion, toasted seeds":
        [(A, "GRILLED SALMON FILLET / GRILLED CHICKEN BREAST / GRILLED HALLOUMI", 2)],
    "MAL DISH salmon protein bowl - sliced avocado, roasted pumpkin, pickled red onion, toasted seeds":
        [(A, "GRILLED SALMON FILLET / GRILLED CHICKEN BREAST / GRILLED HALLOUMI", 0)],
    "MAL DISH - Protein salads - flat iron steak, 2 fried eggs, sliced avocado, watercress, olive oil": [(A, "GRILLED FLAT IRON, TWO FRIED EGGS", 0)],
    "MAL DISH - Pork tomahawk forestiere, sherry jus": [(A, "GRILLED PORK TOMAHAWK FORESTIÈRE", 0)],
    "MAL DISH - Roast chicken breast, cream of haricot blanc, gribiche": [(A, "CORN-FED CHICKEN BREAST, CREAM OF HARICOT BLANC", 0)],
    "MAL DISH - Venison stew, buttermilk herb dumplings": [(A, "BRAISED VENISON STEW", 0)],
    "MAL DISH Black truffle potato gnocchi, cauliflower puree, oyster mushrooms": [(A, "TRUFFLE POTATO GNOCCHI", 0)],
    "MAL DISH - Roasted Halibut, crispy sprouts, cider beurre blanc": [(A, "GRILLED HALIBUT TRONÇON", 0)],
    "MAL DISH smoked haddock fish cake": [(A, "SMOKED HADDOCK FISHCAKE", 0)],
    "MAL DISH chicken breast masala, pilaf rice": [(A, "MASALA CURRY", 1)],
    "MAL DISH mixed mushroom masala, pilaf rice": [(A, "MASALA CURRY", 0)],
    "MAL DISH - Strip Steak 250g": [(A, "NEW YORK STRIP 250g (", 0)],
    "MAL DISH fillet steak ff": [(A, "FILLET 200g", 0)],
    "MAL DISH flat iron steak frites ff": [(A, "FLAT IRON 220g frites", 0)],
    "MAL DISH - Chateaubriand, fries, peppercorn & cowboy butter": [(A, "CHÂTEAU MALMAISON", 0)],
    "MAL DISH - Bearnaise": [(A, "BÉARNAISE SAUCE", 0)],
    "MAL DISH - Cowboy butter": [(A, "COWBOY BUTTER", 0)],
    "MAL DISH - Peppercorn": [(A, "PEPPERCORN SAUCE", 0)],
    "MAL DISH - Fries": [(A, "FRIES (VGI)", 0), (B, "SIDES FRIES (VGI)", 0), (B, "ADD FRIES (VGI)", 0)],
    "MAL DISH -Truffle & Parmesan Fries": [(A, "BLACK TRUFFLE & PARMESAN FRIES", 0), (B, "BLACK TRUFFLE & PARMESAN FRIES", 0)],
    "MAL DISH - Onion Rings": [(A, "BEER-BATTERED ONION RINGS", 0)],
    "MAL DISH - truffle Mash": [(A, "TRUFFLE MASH", 0)],
    "MAL DISH - French onion mac & cheese": [(A, "FRENCH ONION MAC & CHEESE", 0)],
    "MAL DISH - Garlic Flat cap mushrooms": [(A, "GARLIC FLAT CAP MUSHROOMS", 0)],
    "MAL DISH - Buttered greens": [(A, "BUTTERED GREENS", 0)],
    "MAL DISH - mixed leaf salad": [(A, "HOUSE SALAD", 0)],
    "MAL DISH - Classic creme brulee": [(A, "CRÈME BRÛLÉE", 0)],
    "MAL DISH - Pear & almond tart, Vanilla ice cream": [(A, "POACHED PEAR & ALMOND TART", 0)],
    "MAL DISH - spiced plum crumble, vanilla custard": [(A, "SPICED PLUM, CASSIS CRUMBLE", 0)],
    "MAL DISH - Sticky toffee pudding, milk ice cream": [(A, "STICKY TOFFEE PUDDING", 0)],
    "MAL DISH Mal hot chocolate": [(A, "MAL HOT CHOCOLATE, MARSHMALLOWS", 0), (B, "MAL HOT CHOCOLATE,", 0)],
    "MAL DISH - Cheese plate, westcombe cheddar, valencay, Blue murder quince, chutney, crackers": [(A, "CHEESE PLATE", 0), (B, "CHEESE PLATE", 0)],
    # bar menu
    "MAL DISH - bacon Muffins": [(B, "BREAKFAST MUFFINS", 0)],
    "MAL DISH - sausage Muffins": [(B, "BREAKFAST MUFFINS", 2)],
    "MAL DISH - Brunch pastries": [(B, "MORNING PASTRIES", 0)],
    "MAL DISH - falafel wrap, tomato hummus, cucumber, sesame seeds": [(B, "SPINACH FALAFEL WRAP", 0)],
    "MAL DISH - fillet o fish burger ME": [(B, "CHEZ MAL FILLET OF FISH BURGER", 0)],
    "MAL DISH - Sourdough BLT Baguette": [(B, "B.L.T BAGUETTE", 0)],
    "MAL DISH - Sourdough Club Baguette, coleslaw and veg crisps": [(B, "CLUB SANDWICH", 0)],
    "MAL DISH - Sourdough, brisket pastrami toastie, relish, swiss cheese": [(B, "SOURDOUGH BRISKET", 0)],
}
KEEP_UPPER = {"NGCI", "NCGI", "VGI", "VGIA", "GF", "BLT", "ME", "NY", "AFT"}


def display_name(raw: str) -> str:
    """The page's kitchen name -> the name shown (see the docstring)."""
    if raw in NAME_OVERRIDES:
        return NAME_OVERRIDES[raw]
    name = raw
    if name.startswith("MAL JOSPER"):
        name = "Josper " + re.sub(r"^MAL JOSPER\s*-?\s*", "", name)
    else:
        name = re.sub(r"^(?:MAL DISH|MAL Kids|MAL)\s*-?\s*", "", name)
    name = re.sub(r"^(NGCI|NCGI)\s*-\s*", r"\1 ", name)
    name = re.sub(r"[A-Z]{2,}", lambda m: m.group(0) if m.group(0) in KEEP_UPPER else m.group(0).lower(), name)
    name = " ".join(name.split())
    return name[:1].upper() + name[1:]


def tags_for(raw: str, name: str, ingredient_names: str) -> tuple[list[str], bool]:
    vegetarian = bool(re.search(r"\(VGI\)", raw)) or bool(re.search(r"\bvegan$", raw.strip(), re.I))
    tags = ["vegetarian"] if vegetarian else []
    meat, unspecified = tk.meat_tags(name, ingredient_names, vegetarian=vegetarian)
    return tags + meat, unspecified


def build(pages_dir: Path, pdfs_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    # 1. the pages must still be what this script was checked against
    menus = {}
    for fname, (_, menu_name, expected) in {**PAGES, **EXCLUDED_PAGES}.items():
        m = mp.read_menu((pages_dir / fname).read_text(encoding="utf-8"))
        if m["menu"] != menu_name:
            raise SystemExit(f"{fname} is the menu {m['menu']!r}, expected {menu_name!r}")
        if len(m["dishes"]) != expected:
            raise SystemExit(f"{fname} has {len(m['dishes'])} dishes, this script expects {expected}: the menu changed, re-check it")
        if m["flags"] != {"ShowNutrients": False, "ShowPrimaryNutrients": True}:
            raise SystemExit(f"{fname}: the page's nutrient settings changed to {m['flags']}: it may now print more than calories, re-read the page")
        menus[fname] = m
    pdf = {k: mp.pdf_text(pdfs_dir / f"{k}.pdf") for k in PDFS}
    items, hold, report, raw_names = [], [], [], {}
    checked = agreed = 0
    used_checks = set()
    for fname, sections in MENU_SECTIONS.items():
        for d in menus[fname]["dishes"]:
            raw = d["name"]
            if d["section"] not in sections:
                raise SystemExit(f"{fname}: new section {d['section']!r}: add it to the sections table (category or None)")
            category = sections[d["section"]]
            if category is None:
                continue
            if fname == "drinks.html" and not raw.startswith("MAL "):
                report.append(f"left out (not a MAL hot drink): {raw}")
                continue
            kcal = mp.printed_kcal(d["kcal_text"])
            where = f"{fname} {raw!r}"
            if not kcal:
                raise SystemExit(f"{where}: calories {d['kcal_text']!r} are not of the form 'N kcal'")
            reasons = []
            if mp.printed_kcal(d["kcal_copy"]) != kcal or d["kcal_attr"].replace(",", "") != kcal:
                reasons.append(f"the page prints {d['kcal_text']!r} beside the dish but {d['kcal_attr']!r} / {d['kcal_copy']!r} in its own data")
            try:
                allergens = mp.allergens(d, where)
            except ValueError as e:
                raise SystemExit(str(e))
            reasons += [f"the page contradicts itself: {c}" for c in mp.ingredient_conflicts(d)]
            if kcal == "0" and raw not in ZERO_OK:
                reasons.append("0 kcal printed for a dish" + ("" if d["ingredients"] else " that has no ingredients listed") + " (impossible)")
            if raw in IMPLAUSIBLE:
                reasons.append(IMPLAUSIBLE[raw])
            if raw in ALLERGEN_CONTRADICTS:
                reasons.append(ALLERGEN_CONTRADICTS[raw])
            for pdf_name, heading, idx in PDF_CHECKS.get(raw, []):
                used_checks.add(raw)
                printed = mp.pdf_kcal(pdf[pdf_name], heading, idx, where)
                checked += 1
                if str(printed) == kcal:
                    agreed += 1
                else:
                    reasons.append(f"Malmaison's printed menu ({pdf_name}.pdf, {heading!r}) prints {printed} kcal, its allergen page {kcal} kcal")
            name = display_name(raw)
            ingredient_names = " ; ".join(i["name"] for i in d["ingredients"])
            tags, unspecified = tags_for(raw, name, ingredient_names)
            if unspecified:
                report.append(f"meat type not stated: {name}")
            item = {"name": name, "category": category, "serving": "", "calories": kcal, "tags": "|".join(tags), "rankable": False,
                    "allergens": allergens, "notes": f"page name: {raw}; section: {d['section']}" + ("; name shortened (cut off by the page)" if raw in NAME_OVERRIDES else "")}
            items.append(item)
            raw_names[id(item)] = (raw, reasons)
    # 2. exact duplicates (same name and calories) listed from another menu or section are dropped once, allergens must match
    kept, seen = [], {}
    for it in items:
        key = (it["name"], it["calories"])
        if key in seen:
            if seen[key]["allergens"] != it["allergens"]:
                raise SystemExit(f"{it['name']!r} is printed twice with the same calories but different allergens")
            report.append(f"dropped exact duplicate: {it['name']} ({it['category']})")
            continue
        seen[key] = it
        kept.append(it)
    names = [i["name"] for i in kept]
    clash = sorted({n for n in names if names.count(n) > 1})
    if clash:
        report.append(f"same name, different calories (both kept, ids get a number): {clash}")
    # 3. hold-backs, keyed by the id write_chain_folder will give
    from common import slug
    used: dict = {}
    for it in kept:
        base = slug(it["name"])
        n = used.get(base, 0)
        used[base] = n + 1
        item_id = base if n == 0 else f"{base}-{n + 1}"
        raw, reasons = raw_names[id(it)]
        if reasons:
            hold.append((item_id, "; ".join(reasons)))
    unused = sorted(set(PDF_CHECKS) - used_checks)
    if unused:
        raise SystemExit(f"PDF_CHECKS names dishes that are not on the pages any more: {unused}")
    report.append(f"printed-menu cross-check: {checked} comparisons, {agreed} agree, {checked - agreed} differ")
    return kept, hold, report


def fetch_all(pages_dir: Path, pdfs_dir: Path) -> None:
    for fname, (url, _, _) in {**PAGES, **EXCLUDED_PAGES}.items():
        tk.fetch(url, pages_dir / fname)
    pdfs_dir.mkdir(parents=True, exist_ok=True)
    for k, url in PDFS.items():
        subprocess.run(["curl", "-sS", "--fail", "-A", tk.USER_AGENT, "-o", str(pdfs_dir / f"{k}.pdf"), url], check=True)
        import time
        time.sleep(1.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--pdfs", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were compared with the live site")
    ap.add_argument("--fetch", action="store_true", help="download the pages and PDFs first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages, args.pdfs)
    items, hold, report = build(args.pages, args.pdfs)
    guide = {"title": ALLERGEN_TITLE, "url": BASE, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Malmaison", cuisine="Brasserie", source_title=SOURCE_TITLE, source_url=BASE,
                             checked_on=args.checked_on, aliases=["malmaison", "malmaison hotel", "chez mal", "chez mal brasserie",
                                                                  "chez mal brasserie & bar", "mal brasserie"],
                             items=items, out=args.out, note=NOTE, holdback=hold, allergen_guide=guide, nutrition_level="calories")
    for fname in list(PAGES) + list(EXCLUDED_PAGES):
        print(f"{fname} sha256 {sha256_file(args.pages / fname)}")
    for k in PDFS:
        print(f"{k}.pdf sha256 {sha256_file(args.pdfs / (k + '.pdf'))}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(hold)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
