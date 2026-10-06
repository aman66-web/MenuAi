#!/usr/bin/env python3
"""Build data/source/starbucks/ from Starbucks UK's official Nutrition & Allergen Guides (two PDFs: beverages and food).

    python3 tools/uk_extract/starbucks.py beverages.pdf food.pdf --checked-on 2026-10-05

Numbers are copied from the PDFs as printed (kcal, fat, saturates, carbs, sugars, fibre, protein, salt; kJ and caffeine are
not used). Names are read from the PDFs too (only ®, ™ and stray symbols are removed); categories, "rankable" and the
exclusions below are the only things typed by hand. If Starbucks adds, removes or renames a row the lists EXPECTED_DRINKS and
EXPECTED_FOOD no longer match and this script stops, so a human re-checks the new rows (see --print-baseline).

Source page: https://www.starbucks.co.uk/quick-links/nutrition-info, which links both PDFs (the Autumn guides used on
2026-10-05; Starbucks publishes a new beverage and food guide every season, with updates in between):
  beverages  https://www.starbucks.co.uk/sites/starbucks-uk-pwa/files/2026-09/AUT_26_UK_AllergenBook_CORE_BEVERAGE_v04.pdf
  food       https://www.starbucks.co.uk/sites/starbucks-uk-pwa/files/2026-08/AUT%2026_UK_AllergenBook_CORE_FOOD_v03-2.pdf

Which drink row is "the" drink
-------------------------------
The beverage guide prints every milk-based drink once per milk (skimmed, semi-skimmed, whole, almond, soya, oat, coconut), each
with its own sizes. We keep ONE recipe per drink and every size the guide prints for it, with the printed values; we never
work out a milk alternative or an add-on. The recipe is:
  1. the row the guide itself marks "(Standard Build)" (seasonal and protein drinks);
  2. the only row, for drinks without milk choices (Americano, teas, Refresha, Cold Brew ...);
  3. otherwise (core milk drinks: the guide marks no standard build) the milk that the guide's own Standard Build rows use for
     the same kind of drink: whole milk for Frappuccino, oat drink where the drink's name says Oat, else semi-skimmed milk.
     These rows are flagged in `notes` and named in `serving`, so the app never presents them as anything else. Starbucks'
     website says nutrition "will only show the standard recipe using the default milk" but its product pages could not be read
     from here, so rule 3 has to be confirmed in the Starbucks UK app by the founder.

Monthly refresh: download both PDFs from the source page (one request each), run this script with today's date. If it stops
with "differ from the checked baseline", compare the listed rows with the PDFs, then paste `--print-baseline` output below.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import starbucks_pdf as sp  # noqa: E402

CHAIN_ID = "starbucks"
SOURCE_PAGE = "https://www.starbucks.co.uk/quick-links/nutrition-info"

# ---- beverages ---------------------------------------------------------------------------------------------------------
# guide section -> (category, limited_time)
BEV_SECTIONS = {
    "Seasonal": ("Seasonal drinks", True),
    "Espresso": ("Espresso & coffee", False),
    "Mocha & Chocolate": ("Mocha & hot chocolate", False),
    "Hot Teas": ("Tea & matcha", False),
    "Iced Teas & Starbucks Refresha® Drink": ("Iced tea, matcha & Refresha", False),
    "Cold Brew": ("Iced coffee", False),
    "Iced Coffee": ("Iced coffee", False),
    "Protein Beverages": ("Protein drinks", False),
    "Frappuccino® Blended Beverage": ("Frappuccino", False),
}
BEV_EXCLUDED_SECTIONS = {
    "Syrups, Drizzles & Cream Cold Foams": "add-ons for drinks (syrup pumps, sauces, foams), not orders",
    "Reserve": "Starbucks Reserve drinks: not in the website's menu categories, so not on the standard menu in every store",
}
# Milk-alternative rows printed under another name for a drink whose Standard Build is the Oat version.
MILK_ALTERNATIVES_OF = {("Iced Coffee", "Iced Brown Sugar Shaken Espresso"): ("Iced Coffee", "Iced Brown Sugar Oat Shaken Espresso")}
# Drinks whose ingredient lines are swapped between two milks in the guide itself (checked by eye on the page image).
INGREDIENT_MISMATCH_OK = {"Cortado"}
FAMILY_NOTES = {
    "Cortado": "The guide prints this drink's skimmed and semi-skimmed ingredient lines the wrong way round; the numbers follow the milk named in the product column (Short fat 1.6 g semi-skimmed vs 0.3 g skimmed)",
    "Flat White": "The guide prints only one size (Short) for this drink",
    "Ristretto Bianco": "The guide prints only one size per milk for this drink (oat Tall, coconut Venti); only the semi-skimmed Short is used here",
}
CATEGORY_ORDER_DRINKS = ["Espresso & coffee", "Mocha & hot chocolate", "Tea & matcha", "Iced coffee", "Iced tea, matcha & Refresha",
                         "Frappuccino", "Protein drinks", "Seasonal drinks"]

# ---- food --------------------------------------------------------------------------------------------------------------
# guide band heading -> category. The guide's bands print "per portion" except the last two, which print no basis at all:
# their rows are left out unless --include-unstated-basis is given (playbook rule 4: no stated serving, no row).
FOOD_BANDS = {
    "Bakery": "Bakery",
    "Croissants and Morning Pastries": "Bakery",
    "Cakes & Cake Pop": "Bakery",
    "Cookies": "Bakery",
    "Muffins": "Bakery",
    "Bars & Traybakes": "Bakery",
    "Scrolls & Doughnuts": "Bakery",
    "Breakfast Sandwiches": "Breakfast",
    "Porridge, Fruit & Yogurt": "Breakfast",
    "Egg Bites": "Breakfast",
    "Wraps & Focaccia": "Sandwiches, wraps & toasties",
    "Cold Sandwiches and Wraps": "Sandwiches, wraps & toasties",
    "Hot Sandwiches": "Sandwiches, wraps & toasties",
    "Chocolate & Snacks": "Snacks & treats",
    "Bottled Drinks": "Bottled drinks",
}
CATEGORY_ORDER_FOOD = ["Breakfast", "Sandwiches, wraps & toasties", "Bakery", "Snacks & treats", "Bottled drinks"]
RANKABLE_FOOD = {"Breakfast": True, "Sandwiches, wraps & toasties": True, "Bakery": False, "Snacks & treats": False, "Bottled drinks": False}
NOT_RANKABLE_NAMES = {"Fruit & Seed Porridge Topper": "a topping for porridge, not an order"}
FOOD_SEASONAL_SECTION = "Seasonal Menu"   # the guide's own label for limited seasonal food

# Hand-checked baseline of what the Autumn 2026 guides contain (regenerate with --print-baseline after re-checking a new guide).
EXPECTED_DRINKS: list[str] = [
    'Seasonal | Pumpkin Spice Latte | semi-skimmed milk | marked | Short,Tall,Grande,Venti',
    'Seasonal | Iced Pumpkin Spice Latte | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Seasonal | Pumpkin Spice Caramel Macchiato | semi-skimmed milk | marked | Short,Tall,Grande,Venti',
    'Seasonal | Iced Pumpkin Spice Caramel Macchiato | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Seasonal | Maple Pecan Macchiato | semi-skimmed milk | marked | Short,Tall,Grande,Venti',
    'Seasonal | Iced Maple Pecan Macchiato | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Seasonal | Iced Apple Crumble Matcha Latte | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Seasonal | Pumpkin Spice Cream Frappuccino | whole milk | marked | Tall,Grande,Venti',
    'Seasonal | Pumpkin Spice Coffee Frappuccino | whole milk | marked | Tall,Grande,Venti',
    'Seasonal | Apple Crisp Inspired Macchiato | oat drink | marked | Tall,Grande,Venti',
    'Seasonal | Iced Apple Crisp Inspired Macchiato | oat drink | marked | Tall,Grande,Venti',
    'Seasonal | Iced Oat Shaken Apple Espresso | oat drink | marked | Tall,Grande,Venti',
    'Seasonal | Aerocano | - | single | Tall,Grande,Venti',
    'Seasonal | Caramel Aerocano | - | single | Tall,Grande,Venti',
    'Seasonal | Mummy Frappuccino | whole milk | marked | Tall,Grande,Venti',
    'Espresso | Americano | - | single | Short,Tall,Grande,Venti',
    'Espresso | Caffe Latte | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Espresso | Cappuccino | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Espresso | Caramel Macchiato | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Espresso | Cortado | semi-skimmed milk | inferred | Short',
    'Espresso | Espresso | - | single | Single,Doppio',
    'Espresso | Espresso Macchiato | semi-skimmed milk | inferred | Single,Double',
    'Espresso | Flat White | semi-skimmed milk | inferred | Short',
    'Espresso | Freshly Brewed Coffee | - | single | Short,Tall,Grande,Venti',
    'Espresso | Latte Macchiato | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Espresso | Ristretto Bianco | semi-skimmed milk | inferred | Short',
    'Mocha & Chocolate | Classic Hot Chocolate | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Mocha & Chocolate | Iced Chocolate | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Mocha & Chocolate | Iced Mocha | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Mocha & Chocolate | Iced White Mocha | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Mocha & Chocolate | Mocha | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Mocha & Chocolate | White Mocha | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Hot Teas | Chai Tea | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Chamomile | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Earl Grey Tea | - | single | Short,Tall,Grande,Venti',
    "Hot Teas | Emperor's Clouds & Mist Tea | - | single | Short,Tall,Grande,Venti",
    'Hot Teas | English Breakfast Tea | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Hibiscus Tea | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Jasmine Pearls Tea | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Mint Citrus Green Tea | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Mint Herbal Blend | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Youthberry Tea | - | single | Short,Tall,Grande,Venti',
    'Hot Teas | Chai Tea Latte | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Hot Teas | Matcha Green Tea Latte | semi-skimmed milk | inferred | Short,Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Classic Shaken Iced Black Tea | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Classic Shaken Iced Black Tea Lemonade | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Classic Shaken Iced Green Tea | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Classic Shaken Iced Green Tea Lemonade | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Classic Shaken Hibiscus Tea | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Classic Shaken Hibiscus Tea Lemonade | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Lemon Iced Tea | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Peach Iced Tea | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Strawberry Acai Starbucks Refresha Drink | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Cool Lime Starbucks Refresha Drink | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Mango Dragonfruit Starbucks Refresha Drink | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Dragon Coconut Starbucks Refresha Drink | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Pink Coconut Starbucks Refresha | - | single | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Iced Chai Tea Latte | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Iced Teas & Starbucks Refresha® Drink | Iced Matcha Green Tea Latte | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Cold Brew | Cold Brew | - | single | Tall,Grande,Venti',
    'Iced Coffee | Classic Iced Cappuccino | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Iced Coffee | Iced Americano | - | single | Tall,Grande,Venti',
    'Iced Coffee | Iced Brown Sugar Oat Shaken Espresso | oat drink | name | Tall,Grande,Venti',
    'Iced Coffee | Iced Caramel Macchiato | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Iced Coffee | Iced Latte | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Iced Coffee | Iced Latte Macchiato | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Iced Coffee | Starbucks Doubleshot Iced Coffee | - | single | Mini',
    'Iced Coffee | Starbucks Doubleshot Vanilla Iced Coffee | - | single | Mini',
    'Iced Coffee | Vanilla Iced Latte | semi-skimmed milk | inferred | Tall,Grande,Venti',
    'Iced Coffee | Iced Carmaelised Macadamia Oat Shaken Espresso | oat drink | inferred | Tall,Grande,Venti',
    'Iced Coffee | Iced Toasted Vanilla Oat Shaken Espresso | oat drink | inferred | Tall,Grande,Venti',
    'Protein Beverages | Caramel Protein Americano | - | single | Tall,Grande,Venti',
    'Protein Beverages | Caramel Protein Latte | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Protein Beverages | Vanilla Protein Matcha Latte | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Protein Beverages | Iced Caramel Protein Americano | - | single | Tall,Grande,Venti',
    'Protein Beverages | Iced Caramel Protein Latte | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Protein Beverages | Iced Vanilla Protein Matcha Latte | semi-skimmed milk | marked | Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Caramel Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Caramel Cream Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Chocolate Cream Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Coffee Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Cookies & Cream Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Double Chocolatey Chip Cream Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Java Chip Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Matcha Cream Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Mocha Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Strawberries & Cream Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | Vanilla Cream Frappuccino | whole milk | inferred | Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | White Chocolate Cream Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
    'Frappuccino® Blended Beverage | White Mocha Frappuccino | whole milk | inferred | Mini,Tall,Grande,Venti',
]
EXPECTED_FOOD: list[str] = [
    'Pumpkin Marble Loaf Cake',
    'Apple Crumble Muffin',
    'Loaded Double Chocolate Chunk Cookie',
    'Loaded Triple Chocolate & Hazelnut Cookie',
    'Pumpkin Spice Cake Pop',
    'Mummy Cake Pop',
    'Charred Chickpea & Chimichurri Wrap',
    'Chicken & Chorizo Focaccia',
    'All-Butter Croissant (Freshly Baked)',
    'Almond Croissant',
    'Almond Croissant (Freshly Baked)',
    'Butter Croissant',
    'Cheese Twist',
    'Chocolate Twist',
    'Cinnamon Bun',
    'Danish-Style Apple Cinnamon Swirl (Freshly Baked)',
    'Luxury Fruit Toast',
    'Pain au Chocolat',
    'Blackberry & Vanilla Cream Danish (Freshly Baked)',
    'Pain au Chocolat (Freshly Baked)',
    'Banana Nut Loaf Cake',
    'Birthday Cake Pop',
    'Carrot Cake',
    'Lemon Loaf Cake',
    'Victoria Sponge',
    'Loaded Double Chocolate Chunk Cookie (Freshly Baked)',
    'Loaded Triple Chocolate & Hazelnut Cookie (Freshly Baked)',
    'Belgian Chocolate Chunk Cookie',
    'Blueberry Muffin',
    'Chocolate Muffin',
    'Belgian Chocolate Caramel Shortbread',
    'Triple Chocolate Brownie',
    'Pistachio Scroll',
    'Raspberry Jam & Custard Doughnut',
    'All Day Breakfast Wrap',
    'Beyond Meat Breakfast Sandwich',
    'Ham & Cheese Croissant',
    'Smoked Bacon Roll',
    'Traditional Sausage Sandwich',
    'Classic Porridge',
    'Fruit & Seed Porridge Topper',
    'Greek Style Yogurt with Berries & Granola',
    'Mango & Passionfruit Overnight Oats',
    'Egg White Bites with Three Cheese and Red Pepper',
    'Egg Bites with Three Cheese & Ham',
    'Chicken & Bacon Caesar Wrap',
    'Free Range Egg and Mayo Sandwich',
    'Smoked Ham and Cheddar Sandwich',
    'Cheese & Marmite Mini Ciabatta',
    'Signature Grilled Cheese Toastie',
    'Signature Smoked Ham & Cheese Toastie',
    'Signature Tomato & Mozzarella Panini',
    'Signature Tuna Melt Panini',
    'Acorn Gingerbread Biscuit',
    'Caramelised Biscuit Chocolate Bar',
    'Caramel Waffle Duos',
    'Cookie Straw',
    'Ginger Biscuit',
    'Granola Bar (Gluten Free & Plant Based)',
    'Propercorn Sweet & Salty Popcorn',
    'Propercorn Sea Salt Popcorn',
    'Mini Caramel Waffles',
    'Shortbread Biscuits',
    'Snacking Cheese',
    'Starbucks Chocolate Gold Coin',
    'Starbucks Iced Gingerbread Cookie - Bearista or Latte',
    'Acerola and Berries Vitamin D Shot',
    'Apple & Mango Juice',
    'Berries Juice Drink',
    'Cloudy Apple Juice',
    'Ginger shot',
    'Mango & Passionfruit Smoothie',
    'One Water (Still/ Sparkling)',
    'Peach Iced Tea',
    'Pip Organic Blackcurrant, Raspberry and Apple Juice',
    'Raspberry Lemonade',
    'Smooth Orange Juice',
    'Still Lemonade',
    'Strawberry and Watermelon Vitwater',
    'Turmeric Shot',
]

MEAT_PORK = re.compile(r"\b(pork|bacon|ham|sausages?|chorizo|pepperoni|salami)\b", re.I)
MEAT_BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MILK_RE = re.compile(r"^(?P<base>.*?)\s*[-–]\s*(?P<milk>(?:skimmed|semi-?\s*skimmed|whole|almond|soya|oat|coconut)\b[^()]*?)\s*(?P<std>\(Standard Build\))?\s*$", re.I)


def clean(text: str) -> str:
    text = text.replace("®", " ").replace("™", " ").replace("�", " ")
    return re.sub(r"\s+", " ", text).strip()


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", "").replace("’", ""))
    return "-".join(p for p in out.split("-") if p)


def num(s: str) -> float:
    return float(s.lstrip("<"))


def row_notes(v: dict) -> list[str]:
    """Things in the printed numbers a human should know about (the numbers themselves are never changed)."""
    out = []
    kcal = num(v["kcal"])
    if "kj" in v:
        kj = num(v["kj"])
        if (kcal > 0 and abs(kj / 4.184 - kcal) > max(4, 0.04 * kcal)) or (kcal == 0 and kj > 8):
            out.append("Printed kJ and kcal do not agree")
    if num(v["sat"]) > num(v["fat"]) + 1e-9:
        out.append("Saturates printed higher than fat")
    if num(v["sugars"]) > num(v["carbs"]) + 1e-9:
        out.append("Sugars printed higher than carbohydrate")
    if num(v["fat"]) >= 1 and num(v["sat"]) >= 0.9 * num(v["fat"]) and num(v["sat"]) <= num(v["fat"]):
        out.append(f"Saturates ({v['sat']} g) printed almost equal to total fat ({v['fat']} g); entered as printed")
    return out


def size_notes(prev: dict | None, cur: dict) -> list[str]:
    """A larger size should not print less than the next smaller size (the numbers are entered as printed either way)."""
    if prev is None:
        return []
    lower = [label for key, label in (("kcal", "calories"), ("fat", "fat"), ("carbs", "carbohydrate"), ("protein", "protein"))
             if num(cur[key]) < num(prev[key])]
    out = [f"{cur['size']} prints less {', '.join(lower)} than {prev['size']}"] if lower else []
    if num(cur["kcal"]) == num(prev["kcal"]) >= 20:
        out.append(f"{cur['size']} prints the same calories as {prev['size']}")
    return out


def milk_label(raw: str) -> str:
    return re.sub(r"semi-\s+", "semi-", clean(raw).lower())


def default_milk(base: str) -> str:
    if "frappuccino" in base.lower():
        return "whole milk"
    if re.search(r"\boat\b", base, re.I):
        return "oat drink"
    return "semi-skimmed milk"


def pick_drinks(blocks: list[dict]) -> list[dict]:
    """One chosen block per drink, in guide order: {'section','base','milk','how','rows'}."""
    families: dict[tuple, list[dict]] = {}
    for b in blocks:
        m = MILK_RE.match(b["name"])
        base, milk, std = (clean(m["base"]), milk_label(m["milk"]), bool(m["std"])) if m else (clean(b["name"].replace("(Standard Build)", "")), "", "Standard Build" in b["name"])
        if milk and base not in INGREDIENT_MISMATCH_OK:   # the ingredient text printed in the same ruled block must name the same milk: proves name and numbers belong together
            key = {"skimmed milk": r"(?<!semi-)skimmed milk"}.get(milk, re.escape(milk))
            if not re.search(key + r"[\s,]*\[", re.sub(r"semi-\s+", "semi-", b["ingredients"].lower())):
                raise sp.GuideError(f"page {b['page']}: block named {b['name']!r} has no '{milk} [' in its ingredients: {b['ingredients'][:80]!r}")
        families.setdefault((b["section"], base), []).append({**b, "base": base, "milk": milk, "std": std})
    chosen = []
    for (section, base), fam in families.items():
        if (section, base) in MILK_ALTERNATIVES_OF:
            if MILK_ALTERNATIVES_OF[(section, base)] not in families:
                raise sp.GuideError(f"{base!r} is listed as milk alternatives of a drink that is no longer in the guide")
            continue
        marked = [f for f in fam if f["std"]]
        if len(marked) > 1:
            raise sp.GuideError(f"{base!r}: more than one row marked Standard Build")
        if marked:
            pick, how = marked[0], "marked"
        elif len(fam) == 1:
            pick, how = fam[0], ("name" if fam[0]["milk"] else "single")
        else:
            want = default_milk(base)
            match = [f for f in fam if f["milk"] == want]
            if len(match) != 1:
                raise sp.GuideError(f"{base!r}: expected exactly one {want!r} row, found {len(match)}")
            pick, how = match[0], "inferred"
        chosen.append({"section": section, "base": base, "milk": pick["milk"], "how": how, "rows": pick["rows"], "page": pick["page"]})
    return chosen


def drink_line(d: dict) -> str:
    return f"{d['section']} | {d['base']} | {d['milk'] or '-'} | {d['how']} | {','.join(r['size'] for r in d['rows'])}"


def food_rows(items: list[dict]) -> tuple[list[dict], list[tuple[str, str]]]:
    """Food products with their category (from the band above them) and the rows we leave out with the reason."""
    kept, excluded, band = [], [], None
    for it in items:
        if "band" in it:
            if it["band"] not in FOOD_BANDS:
                raise sp.GuideError(f"new food band {it['band']!r} on page {it['page']}: add it to FOOD_BANDS")
            band = it
            continue
        if band is None:
            raise sp.GuideError(f"food row {it['name']!r} before any band heading")
        name = clean(it["name"])
        if "selected stores" in name.lower():
            excluded.append((name, "printed 'at selected stores' only"))
            continue
        kept.append({**it, "name": name, "category": FOOD_BANDS[band["band"]], "per_portion": band["per_portion"]})
    return kept, excluded


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("beverages", type=Path)
    ap.add_argument("food", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDFs with the official page")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    ap.add_argument("--include-unstated-basis", action="store_true",
                    help="also include the food rows whose band prints no 'per portion' (snacks, bottled drinks). Only after the "
                         "founder has confirmed the basis of those numbers; their serving stays blank")
    ap.add_argument("--print-baseline", action="store_true", help="print EXPECTED_DRINKS / EXPECTED_FOOD for pasting here, then exit")
    args = ap.parse_args()

    try:
        bev_pages, food_pages = sp.bbox_pages(args.beverages), sp.bbox_pages(args.food)
        bev_ver, food_ver = sp.guide_version(bev_pages), sp.guide_version(food_pages)
        cover_b, cover_f = " ".join(w[4] for w in bev_pages[0]), " ".join(w[4] for w in food_pages[0])
        season = re.search(r"(Autumn|Winter|Spring|Summer)\s+Beverages", cover_b)
        food_season = re.search(r"(Autumn|Winter|Spring|Summer)\s+Food", cover_f)
        if not season or not food_season or season[1] != food_season[1]:
            raise sp.GuideError("could not read the same season from both covers")
        blocks, seen_sections = sp.read_beverages(args.beverages, set(BEV_SECTIONS))
        food, seen_bands = sp.read_food(args.food)
    except sp.GuideError as e:
        print(f"The guide no longer looks as this script expects: {e}", file=sys.stderr)
        return 1

    unknown = [s for s in seen_sections if s not in BEV_SECTIONS and s not in BEV_EXCLUDED_SECTIONS]
    if unknown:
        print(f"New beverage section(s) {unknown}: decide whether they belong in BEV_SECTIONS or BEV_EXCLUDED_SECTIONS.", file=sys.stderr)
        return 1
    try:
        drinks = pick_drinks(blocks)
        foods, excluded = food_rows(food)
    except sp.GuideError as e:
        print(f"The guide no longer looks as this script expects: {e}", file=sys.stderr)
        return 1

    drink_lines = [drink_line(d) for d in drinks]
    food_names = [f["name"] for f in foods]
    if args.print_baseline:
        print("EXPECTED_DRINKS = [")
        print("".join(f"    {l!r},\n" for l in drink_lines) + "]")
        print("EXPECTED_FOOD = [")
        print("".join(f"    {n!r},\n" for n in food_names) + "]")
        return 0
    for label, got, want in (("drinks", drink_lines, EXPECTED_DRINKS), ("food", food_names, EXPECTED_FOOD)):
        if got != want:
            print(f"The {label} in the PDF differ from the checked baseline in this script (got {len(got)}, expected {len(want)}):", file=sys.stderr)
            for x in [x for x in got if x not in want][:15]:
                print(f"  new or changed: {x}", file=sys.stderr)
            for x in [x for x in want if x not in got][:15]:
                print(f"  missing or changed: {x}", file=sys.stderr)
            print("Re-check these rows against the PDF, then paste the output of --print-baseline into this script.", file=sys.stderr)
            return 1

    items = []
    for d in drinks:
        category, limited = BEV_SECTIONS[d["section"]]
        base_note = {"marked": "Recipe marked '(Standard Build)' in the guide", "single": "",
                     "name": f"Only {d['milk']} version printed (the drink's name says Oat); other milks are printed under a different name",
                     "inferred": f"Default milk is not marked in the guide: {d['milk']} used (the guide's Standard Build for comparable drinks); confirm in the Starbucks UK app"}[d["how"]]
        for k, r in enumerate(d["rows"]):
            notes = [n for n in [base_note, FAMILY_NOTES.get(d["base"], ""), *row_notes(r), *size_notes(d["rows"][k - 1] if k else None, r)] if n]
            items.append({
                "id": slug(f"{d['base']} {r['size']}"), "name": f"{d['base']} ({r['size']})", "category": category,
                "serving": r["size"] + (f", {d['milk']}" if d["milk"] else ""),
                "calories": r["kcal"], "protein_g": r["protein"], "carbs_g": r["carbs"], "fat_g": r["fat"], "sat_fat_g": r["sat"],
                "sodium_mg": "", "salt_g": r["salt"], "sugar_g": r["sugars"], "fiber_g": r["fiber"], "tags": "",
                "limited_time": str(limited).lower(), "rankable": "false", "components": "", "added_on": "", "notes": "; ".join(notes),
            })
    for f in foods:
        if not f["per_portion"] and not args.include_unstated_basis:
            excluded.append((f["name"], "its band prints no 'per portion' or other basis, so the serving is not stated"))
            continue
        v = f["values"]
        missing = [k for k in ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fiber", "protein", "salt") if k not in v]
        if missing:
            print(f"The guide no longer looks as this script expects: {f['name']!r} has no printed value for {missing}", file=sys.stderr)
            return 1
        tags = []
        if "Y" in (f["veg"], f["vegan"]):
            tags.append("vegetarian")
        text = f["name"] + " " + f["ingredients"]
        notes = []
        if MEAT_PORK.search(text):
            tags.append("contains_pork")
        if MEAT_BEEF.search(text):
            tags.append("contains_beef")
            notes.append("contains_beef because the ingredients say: " + re.search(r"[^.]*\bbeef\b[^.]*\.", f["ingredients"], re.I)[0].strip())
        if f["vegan"] == "Y" and f["veg"] != "Y":
            notes.append("Marked vegan but not vegetarian in the guide")
        if "(Freshly Baked)" in f["name"]:
            notes.append("Printed as its own row, separate from the standard version of this item")
        notes += row_notes(v)
        items.append({
            "id": slug(f["name"]), "name": f["name"], "category": f["category"], "serving": "",
            "calories": v["kcal"], "protein_g": v["protein"], "carbs_g": v["carbs"], "fat_g": v["fat"], "sat_fat_g": v["sat"],
            "sodium_mg": "", "salt_g": v["salt"], "sugar_g": v["sugars"], "fiber_g": v["fiber"], "tags": "|".join(tags),
            "limited_time": str(f["section"] == FOOD_SEASONAL_SECTION).lower(),
            "rankable": str(RANKABLE_FOOD[f["category"]] and f["name"] not in NOT_RANKABLE_NAMES).lower(),
            "components": "", "added_on": "", "notes": "; ".join(notes),
        })

    ids = [i["id"] for i in items]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        print(f"duplicate ids: {dupes}", file=sys.stderr)
        return 1
    order = CATEGORY_ORDER_DRINKS + CATEGORY_ORDER_FOOD
    items.sort(key=lambda i: order.index(i["category"]))   # stable: guide order inside each category

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(items)
    period = re.search(r"([A-Z][a-z]+ - [A-Z][a-z]+ \d{4})", cover_b)
    title = (f"Starbucks UK Nutrition & Allergen Guides, {season[1]} {period[1].split()[-1] if period else ''}: "
             f"Beverages (version {bev_ver}) and Food (version {food_ver})").replace("  ", " ")
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Starbucks", "Coffee", "standard", title, SOURCE_PAGE, args.checked_on, "starbucks|starbucks coffee|starbucks uk", ""])
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")

    counts: dict[str, int] = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {args.out}")
    print(f"  title: {title}")
    for c in order:
        if c in counts:
            print(f"  {c}: {counts[c]}")
    for label, path in (("beverages", args.beverages), ("food", args.food)):
        print(f"  {label} PDF sha256 {hashlib.sha256(path.read_bytes()).hexdigest()}")
    print(f"  beverage sections left out: {', '.join(f'{k} ({v})' for k, v in BEV_EXCLUDED_SECTIONS.items())}")
    print(f"  food rows left out: {len(excluded)}")
    for name, why in excluded:
        print(f"    {name}: {why}")
    inferred = [d for d in drinks if d["how"] == "inferred"]
    print(f"  drinks whose default milk is inferred (not marked in the guide): {len(inferred)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
