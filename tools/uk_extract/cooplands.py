#!/usr/bin/env python3
"""Build data/source/cooplands/ from Cooplands' official "Allergen and Nutrition Information" PDF.

    python3 tools/uk_extract/cooplands.py path/to/Cooplands-Allergen-Nutrition-March-2026.pdf --checked-on 2026-10-06 [--out DIR]

Numbers are copied from the PDF's "Per Product" columns exactly as printed (kJ, kcal, fat, saturates, carbohydrate, sugars,
protein, salt; kJ also checks the guide against itself). Per-100g columns are never used. weight_g is the printed Weight
only where the per-product values are for that weight (see weight_for). Only the NAMES,
categories, rankable/seasonal flags, the held-back rows and the notes below are typed by hand. Every printed row is matched, in
the PDF's order, with one entry in SECTIONS: the script stops if a section, a printed name or the number of rows differs, so a
human re-checks the entries when Cooplands publishes a new guide.

Source: https://cooplands-bakery.co.uk/wp-content/uploads/2026/03/Cooplands-Allergen-Nutrition-March-2026.pdf
(the one file linked from https://cooplands-bakery.co.uk/nutrition-and-allergen-information/; PDF created 2026-03-19).
Needs `pdftotext` (poppler). The PDF is one A4 page of about 3 pt type read by word position: see cooplands_pdf.py.

What "per product" means: the guide prints a Weight column and per-100g and per-product values. A few rows add a KCAL_Per
note ("per cake", "Per Scone", "Per 1/6 Slice"): the per-product values are then for that unit, not the whole weight (e.g.
"EASTER BUN - 4 PACK", 280 g, is per cake). Rows with a pack weight but no such note are left out (basis not stated).

Allergens (docs/DATA.md "Allergens") come from the same row of the same PDF: its "Contains" column ("Contains Barley, Egg,
Wheat", sometimes followed by a meat/cheese percentage such as ", 18% Pork", which is not an allergen and is dropped) and its
"May Contain" column ("Not suitable for someone with a celery, egg allergy."). Every allergen this guide prints is one word,
so each cell is split on commas and spaces (two cells miss a comma: "Celery Soya", "celery egg"); every word must be a known
allergen word or the run stops. An empty Contains cell means the guide lists none of the 14 for that item; an empty May
Contain cell means no may-contain line is printed for it. The guide names cereals (wheat, barley, oats) but never which tree
nut ("Nuts").
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cooplands_pdf as pdf_reader  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "cooplands"
SOURCE_URL = "https://cooplands-bakery.co.uk/wp-content/uploads/2026/03/Cooplands-Allergen-Nutrition-March-2026.pdf"
SOURCE_TITLE = "Cooplands 2026 March Allergen and Nutrition Information (PDF created 19 March 2026)"
ALIASES = ["cooplands", "cooplands bakery"]
ALLERGEN_GUIDE_TITLE = "Cooplands 2026 March Allergen and Nutrition Information (PDF created 19 March 2026): Contains and May Contain columns"
NOTE = ("Per product from Cooplands' March 2026 guide, the latest on its website: its seasonal (Easter) lines may no longer be sold. "
        "Bread, rolls and a few multipack rows aren't listed, and eight items whose printed numbers or allergens contradict themselves are held back.")

PORK, BEEF, VEG = "contains_pork", "contains_beef", "vegetarian"
SAND, SAV, PIZ, SAL = "Sandwiches", "Savouries", "Pizzas", "Salads"
SWEET, CREAM = "Cakes & sweet treats", "Cream cakes"
CATEGORY_ORDER = [SAND, SAV, PIZ, SAL, SWEET, CREAM]

# What the KCAL_Per note on a row means for the serving label (the guide's own words).
PER_SERVING = {"per cake": "1 cake", "Per Cake": "1 cake", "Per 1/6 Slice": "1/6 slice", "1/4 Slice of Tart": "1/4 slice of tart",
               "Per Scone": "1 scone", "Per Flapjack": "1 flapjack", "Per Biscuit": "1 biscuit"}
# Items whose printed name means pork even though the guide lists no ingredient (BLT = bacon, lettuce, tomato).
NAME_MEANS_PORK = {"BLT SUB", "BLT WHITE SUB"}
PORK_WORDS = re.compile(r"\b(bacon|ham|pork|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF_WORDS = re.compile(r"\b(beef|steak|mince)\b", re.I)


# ---------------------------------------------------------------------------------------------------------------------
# One entry per printed row, in the PDF's order, grouped under the guide's own section lines.
#   R(printed name, our name, category, rank=True, limited=False, note="", serving=None)   a row we publish
#       serving=None -> the guide's note (PER_SERVING) or its Weight column; "" = leave blank (see note)
#   X(printed name, reason)                      a printed row we leave out
#   D(printed name, single's printed name)       a pack row that repeats a single item's values exactly (checked)
# ---------------------------------------------------------------------------------------------------------------------
def R(label, name, cat, rank=True, limited=False, note="", serving=None):
    return dict(label=label, name=name, cat=cat, rank=rank, limited=limited, note=note, serving=serving)


def X(label, reason):
    return dict(label=label, name=None, reason=reason)


def D(label, single):
    return dict(label=label, name=None, dup_of=single, reason=f"same per-product values as {single}, which is listed")


T, F = True, False  # rankable flags read better as T/F in the table below
RETAIL_LOAF = "sliced loaf, values per slice (retail bread, not a menu item)"
RETAIL_ROLLS = "pack of rolls whose per-product basis is not stated (retail bread, not a menu item)"
UNSTATED = "pack weight printed but the per-product values are for one item and the guide does not say so"
SAME = "Printed numbers are identical to "

SECTIONS = [
    ("SEASONAL", [
        R("ALMOND TART", "Almond Tart", SWEET, F, T),
        R("CHICKEN & JALAPENO PIZZA", "Chicken & Jalapeno Pizza", PIZ, T, T),
        R("CORNFLAKE NEST WITH CHOCOLATE EGGS", "Cornflake Nest with Chocolate Eggs", SWEET, F, T),
        R("CORONATION CHICKEN SUB", "Coronation Chicken Sub", SAND, T, T),
        R("EASTER BROWNIE", "Easter Brownie", SWEET, F, T),
        R("EASTER BUN - 4 PACK", "Easter Bun (from 4 pack)", SWEET, F, T, "Printed 'EASTER BUN - 4 PACK' (280 g); the guide says the values are per cake"),
        R("EASTER BUN - CHOCOLATE", "Easter Bun (Chocolate)", SWEET, F, T,
          SAME + "Easter Bun (Vanilla). Saturates per product (4.7 g) is lower than per 100 g x 75 g (about 5.8 g)"),
        R("EASTER BUN - VANILLA", "Easter Bun (Vanilla)", SWEET, F, T,
          SAME + "Easter Bun (Chocolate). Saturates per product (4.7 g) is lower than per 100 g x 75 g (about 5.8 g)"),
        R("EASTER BUNNY BISCUIT", "Easter Bunny Biscuit", SWEET, F, T),
        R("EASTER CHICK BISCUIT", "Easter Chick Biscuit", SWEET, F, T),
        R("EASTER CORNFLAKE NEST", "Easter Cornflake Nest", SWEET, F, T,
          "kJ per product is printed 14049 (impossible next to 1908 kJ per 100 g); kcal and macros agree with each other, so published as printed"),
        X("EASTER SHARING CAKE SLICE", "only per-100g values are printed (no per-product values); per-100g is never used as a serving"),
        R("FUN GINGERBREAD BISCUIT", "Fun Gingerbread Biscuit", SWEET, F, T, SAME + "Gingerbread"),
        X("HOT CROSS BUN - 4 PACK", UNSTATED + " (300 g pack, values equal 75 g)"),
        R("LAMB & MINT PASTY", "Lamb & Mint Pasty", SAV, T, T),
        R("LARGE CHOCOLATE CREAM SPONGE", "Large Chocolate Cream Sponge", CREAM, F, T),
        R("LARGE CREAM SPONGE", "Large Cream Sponge", CREAM, F, T),
        R("LEMON MUFFIN", "Lemon Muffin", SWEET, F, T, "Held back: see holdback.csv. Weight printed 110 g but per-product values are for about 120 g"),
        R("LEMON PIE", "Lemon Pie", SWEET, F, T),
        R("LOADED CHICKEN FILLET SANDWICH", "Loaded Chicken Fillet Sandwich", SAND, T, T),
        R("PORK & CIDER PIE", "Pork & Cider Pie", SAV, T, T),
        R("RAINBOW COOKIE", "Rainbow Cookie", SWEET, F, T),
        R("RASPBERRY TOPPED DOUGHNUT", "Raspberry Topped Doughnut", SWEET, F, T),
        R("RUSSIAN SLICE", "Russian Slice", SWEET, F, T),
        R("STEAK & STILTON PIE", "Steak & Stilton Pie", SAV, T, T),
        R("SUMMER FRUIT FLAN", "Summer Fruit Flan", SWEET, F, T),
        R("VANILLA SUNDAE", "Vanilla Sundae", SWEET, F, T),
        R("VICTORIA SPONGE MUFFIN", "Victoria Sponge Muffin", SWEET, F, T),
        R("WILD MUSHROOM & GARLIC PIE", "Wild Mushroom & Garlic Pie", SAV, T, T),
    ]),
    ("SANDWICH", [
        R("BLT SUB", "BLT Sub", SAND, note="Tagged contains_pork from the name (BLT = bacon); the guide lists no ingredients"),
        R("BLT WHITE SUB", "BLT White Sub", SAND, note="Tagged contains_pork from the name (BLT = bacon); the guide lists no ingredients"),
        R("CHEESE & HAM BAGUETTE", "Cheese & Ham Baguette", SAND, note=SAME + "Cheese & Ham"),
        R("CHEESE SAVOURY SUB", "Cheese Savoury Sub", SAND),
        R("CHICKEN MAYONNAISE & BACON SUB", "Chicken Mayonnaise & Bacon Sub", SAND),
        R("CORNED BEEF SUB", "Corned Beef Sub", SAND),
        R("EGG MAYONNAISE SUB", "Egg Mayonnaise Sub", SAND),
        R("EGG MAYONNAISE WHITE SUB", "Egg Mayonnaise White Sub", SAND),
        R("HAM & PEASE PUDDING SUB", "Ham & Pease Pudding Sub", SAND),
        R("HAM SALAD SUB", "Ham Salad Sub", SAND),
        R("JUST HAM SUB", "Just Ham Sub", SAND),
        R("PLOUGHMAN'S SUB", "Ploughman's Sub", SAND),
        R("ROAST CHICKEN SALAD SUB", "Roast Chicken Salad Sub", SAND),
        R("SEAFOOD COCKTAIL SUB", "Seafood Cocktail Sub", SAND),
        R("TUNA MAYONNAISE SUB", "Tuna Mayonnaise Sub", SAND),
        R("BBQ CHICKEN & CHEESE", "BBQ Chicken & Cheese", SAND, note="Weight printed 225 g; per-product values are for about 235 g"),
        R("BACON, BRIE & RED ONION CHUTNEY", "Bacon, Brie & Red Onion Chutney", SAND),
        R("CHEESE & HAM", "Cheese & Ham", SAND, note=SAME + "Cheese & Ham Baguette"),
        R("MEATBALL & CHEESE", "Meatball & Cheese", SAND, note="Meat type not stated"),
        R("SOUTHERN FRIED CHICKEN FILLET SANDWICH", "Southern Fried Chicken Fillet Sandwich", SAND),
        R("TUNA MELT", "Tuna Melt", SAND),
    ]),
    ("SALAD", [
        R("HAM SALAD", "Ham Salad", SAL),
        R("HAM & EGG SALAD", "Ham & Egg Salad", SAL),
        R("CHICKEN SALAD", "Chicken Salad", SAL, serving="",
          note="Fat per 100 g is printed 43 (kcal per 100 g is 77), looks like 4.3; the per-product values agree with each other. "
               "Weight printed 250 g but the per-product values are for about 264 g, so no serving is shown"),
        R("PLAIN SALAD", "Plain Salad", SAL),
    ]),
    ("SAVOURIES", [
        R("BACON & CHEESE WRAP", "Bacon & Cheese Wrap", SAV),
        R("BACON AND TOMATO QUICHE", "Bacon and Tomato Quiche", SAV),
        R("CHEESE & ONION PASTY", "Cheese & Onion Pasty", SAV),
        R("CHEESE AND ONION QUICHE", "Cheese and Onion Quiche", SAV),
        R("CHEESE STRAWS", "Cheese Straws", SAV, F, note="One straw (the 5 pack row prints the same values per straw)"),
        R("CHICKEN BAKE", "Chicken Bake", SAV),
        R("CORNED BEEF & POTATO PASTY", "Corned Beef & Potato Pasty", SAV),
        R("MINCE AND ONION PIE", "Mince and Onion Pie", SAV),
        R("MUSHROOM & CHEESE WRAP", "Mushroom & Cheese Wrap", SAV),
        R("SAUSAGE ROLL", "Sausage Roll", SAV),
        R("SAUSAGE, CHEESE & BEANS PASTY", "Sausage, Cheese & Beans Pasty", SAV),
        R("STEAK & ALE PIE", "Steak & Ale Pie", SAV, note="Held back: see holdback.csv"),
        R("STEAK BAKE", "Steak Bake", SAV),
        R("SUPER SAUSAGE ROLL", "Super Sausage Roll", SAV, note="Held back: see holdback.csv"),
        R("TRADITIONAL PASTY", "Traditional Pasty", SAV),
        R("VEGAN SAUSAGE ROLL", "Vegan Sausage Roll", SAV, note="Held back: see holdback.csv"),
        R("MARGHERITA PIZZA", "Margherita Pizza", PIZ),
        R("PEPPERONI PIZZA", "Pepperoni Pizza", PIZ),
        R("BBQ CHICKEN PIZZA", "BBQ Chicken Pizza", PIZ),
    ]),
    ("BREAD", [
        X("COUNTRY GRAIN LOAF MEDIUM SLICED 800G", RETAIL_LOAF),
        X("SOFT WHITE LOAF MEDIUM SLICED 400G", RETAIL_LOAF),
        X("SOFT WHITE LOAF MEDIUM SLICED 800G", RETAIL_LOAF),
        X("SOFT WHITE LOAF THICK SLICED 800G", RETAIL_LOAF),
        X("WHOLEMEAL LOAF MEDIUM SLICED 400G", RETAIL_LOAF),
        X("WHOLEMEAL LOAF MEDIUM SLICED 800G", RETAIL_LOAF),
        X("4 FRUITED TEACAKES", UNSTATED + " (320 g pack, values equal 80 g)"),
        X("4 LARGE WHITE ROLLS", RETAIL_ROLLS),
        X("4 LARGE WHOLEMEAL ROLLS", RETAIL_ROLLS),
        X("6 COUNTRY GRAIN ROLLS", RETAIL_ROLLS),
        X("6 WHITE DINNER ROLLS", RETAIL_ROLLS),
        X("6 WHITE SCOTCH ROLLS", RETAIL_ROLLS),
        X("6 WHOLEMEAL DINNER ROLLS", RETAIL_ROLLS),
        X("6 WHOLEMEAL SCOTCH ROLLS", RETAIL_ROLLS),
    ]),
    ("CONFECTIONERY", [
        R("BAKEWELL SLICE", "Bakewell Slice", SWEET, F),
        R("BROWNIE", "Brownie", SWEET, F),
        R("CARAMEL CRISPIE", "Caramel Crispie", SWEET, F),
        R("CARAMEL SHORTBREAD", "Caramel Shortbread", SWEET, F),
        R("CHOCOLATE FLAPJACK", "Chocolate Flapjack", SWEET, F),
        R("CHOCOLATE TOFFEE DANISH", "Chocolate Toffee Danish", SWEET, F),
        R("COOKIE MONSTER", "Cookie Monster", SWEET, F),
        R("CORNFLAKE TREACLE TART", "Cornflake Treacle Tart", SWEET, F),
        X("CURRANT SQUARE - 2PACK", UNSTATED + " (200 g pack, values equal 100 g)"),
        R("DANISH PASTRY", "Danish Pastry", SWEET, F),
        R("DOUBLE CHOCOLATE CHIP COOKIE", "Double Chocolate Chip Cookie", SWEET, F),
        R("GINGERBREAD", "Gingerbread", SWEET, F, note=SAME + "Fun Gingerbread Biscuit"),
        R("ICED FINGER", "Iced Finger", SWEET, F),
        R("JAM DOUGHNUT", "Jam Doughnut", SWEET, F),
        R("JAM TART", "Jam Tart", SWEET, F),
        R("JUMBO JAMMY BISCUIT", "Jumbo Jammy Biscuit", SWEET, F),
        R("LARGE CURD TART", "Large Curd Tart", SWEET, F),
        R("LARGE CUSTARD TART", "Large Custard Tart", SWEET, F),
        R("LEMON TART", "Lemon Tart", SWEET, F),
        R("MAID OF HONOUR", "Maid of Honour", SWEET, F),
        R("SMALL CURD TART", "Small Curd Tart", SWEET, F),
        R("SMALL CUSTARD TART", "Small Custard Tart", SWEET, F),
        R("TOFFEE DOUGHNUT", "Toffee Doughnut", SWEET, F),
        R("TRIPLE CHOCOLATE MUFFIN", "Triple Chocolate Muffin", SWEET, F),
        R("YUM YUM", "Yum Yum", SWEET, F, note="Held back: see holdback.csv"),
    ]),
    ("PACKS", [
        R("CHEESE SCONES - 4 PACK", "Cheese Scone (from 4 pack)", SAV, T, note="Printed 'CHEESE SCONES - 4 PACK' (320 g); the guide says the values are per scone"),
        D("CHEESE STRAWS - 5 PACK", "CHEESE STRAWS"),
        D("CHOCOLATE FLAPJACK - 2 PACK", "CHOCOLATE FLAPJACK"),
        R("FLAPJACK - 4 PACK", "Flapjack (from 4 pack)", SWEET, F, note="Printed 'FLAPJACK - 4 PACK' (200 g); the guide says the values are per flapjack"),
        R("GINGER SQUARES - 4 PACK", "Ginger Square (from 4 pack)", SWEET, F, note="Printed 'GINGER SQUARES - 4 PACK' (280 g); the guide says the values are per cake"),
        R("BRIGHT ICED BUNS - 4 PACK", "Bright Iced Bun (from 4 pack)", SWEET, F, note="Printed 'BRIGHT ICED BUNS - 4 PACK' (260 g); the guide says the values are per cake"),
        R("MELTING MOMENTS BISCUITS - 6 PACK", "Melting Moments Biscuit (from 6 pack)", SWEET, F, note="Printed 'MELTING MOMENTS BISCUITS - 6 PACK' (240 g); the guide says the values are per biscuit"),
        R("PARKIN BISCUITS - 6 PACK", "Parkin Biscuit (from 6 pack)", SWEET, F, note="Printed 'PARKIN BISCUITS - 6 PACK' (210 g); the guide says the values are per biscuit"),
        D("SAUSAGE ROLL - 4 PACK", "SAUSAGE ROLL"),
        R("SCHOOL CAKE - 4 PACK", "School Cake (from 4 pack)", SWEET, F, note="Printed 'SCHOOL CAKE - 4 PACK' (380 g); the guide says the values are per cake"),
        R("SULTANA SCONES - 4 PACK", "Sultana Scone (from 4 pack)", SWEET, F, note="Printed 'SULTANA SCONES - 4 PACK' (320 g); the guide says the values are per scone"),
        D("SUPER SAUSAGE ROLL - 2 PACK", "SUPER SAUSAGE ROLL"),
        D("YUM YUM - 4 PACK", "YUM YUM"),
    ]),
    ("CREAMS", [
        R("CREAM DOUGHNUT", "Cream Doughnut", CREAM, F),
        R("CREAM SLICE", "Cream Slice", CREAM, F),
        R("ECLAIR", "Eclair", CREAM, F),
        R("MINI CHOCOLATE CREAM SPONGE", "Mini Chocolate Cream Sponge", CREAM, F),
        R("MINI CREAM SPONGE", "Mini Cream Sponge", CREAM, F),
        R("PEACH MELBA", "Peach Melba", CREAM, F),
        R("STRAWBERRY TART", "Strawberry Tart", CREAM, F),
        R("VANILLA SLICE", "Vanilla Slice", CREAM, F, serving="",
          note="Weight printed 105 g but the per-product values are for about 140 g, so no serving is shown"),
        R("DEVONSHIRE SPLIT", "Devonshire Split", CREAM, F),
    ]),
]

# Items the guide's own numbers make impossible (never corrected). {names} are filled from the printed row.
HOLDBACK = {
    "LEMON MUFFIN": ("The guide prints {carbs} g of carbohydrate per muffin but {sugars} g of sugars (sugars are part of carbohydrate), "
                     "and {kcal} kcal against about {macro:.0f} kcal from its own macros."),
    "VEGAN SAUSAGE ROLL": ("The guide prints {kcal} kcal per roll but its own protein, carbohydrate and fat add up to about {macro:.0f} kcal "
                           "(the per 100 g columns show the same gap)."),
    "STEAK & ALE PIE": "The guide prints {kcal} kcal per pie but {kj} kJ (about {kjkcal:.0f} kcal), and its own macros add up to about {macro:.0f} kcal.",
    "SUPER SAUSAGE ROLL": "The guide prints {kcal} kcal per roll but {kj} kJ (about {kjkcal:.0f} kcal), and its own macros add up to about {macro:.0f} kcal.",
    "YUM YUM": "The guide prints {kcal} kcal but {kj} kJ (about {kjkcal:.0f} kcal), and its own macros add up to about {macro:.0f} kcal.",
    # Added after the independent re-read of 2026-10-08:
    "GINGERBREAD": ("The guide prints {fat100} g of fat, {carbs100} g of carbohydrate and {protein100} g of protein per 100 g, which add up to "
                    "more than 100 g, and {fat} g + {carbs} g + {protein} g per 45 g product, which outweighs the product."),
    "FUN GINGERBREAD BISCUIT": ("The guide prints {fat100} g of fat, {carbs100} g of carbohydrate and {protein100} g of protein per 100 g, which "
                                "add up to more than 100 g, and {fat} g + {carbs} g + {protein} g per 45 g product, which outweighs the product."),
    "ALMOND TART": ("The guide marks no nuts (not even may contain) for a tart named for almonds (the Bakewell Slice marks nuts): "
                    "allergen row contradicts the dish name."),
}
EXPLAINED_FLAGS = {"Easter Cornflake Nest"}  # kJ typo; explained in the entry's note, and its kJ is not published (below)
# Printed kJ per product left blank (never corrected): the number is impossible next to the row's own kJ per 100 g and kcal.
KJ_NOT_PUBLISHED = {"EASTER CORNFLAKE NEST": "kJ per product printed 14049 for a 55 g item (1908 kJ per 100 g, 251 kcal)"}
PER_PRODUCT = ("kj", "kcal", "fat", "sat", "carbs", "sugars", "protein", "salt")


# The guide's own spellings of the word that opens the Contains cell ("ContainsEgg, ..." has no space).
CONTAINS_OPENING = re.compile(r"^(?:Contains|Contians|Contans|Contain)\s*")
# A percentage after the allergens names the meat or cheese content ("Wheat, 18% Pork"): it is not an allergen word.
QUID = re.compile(r"\s*,?\s*(\d+)%\s+([A-Za-z][A-Za-z ]*)$")
QUID_WORDS = {"Lamb", "Pork", "Beef", "Corned Beef", "Bacon", "Chicken", "Cheese"}
MAY_SENTENCE = re.compile(r"^Not suitable for someone with (?:an? )+(.+?) allergy\.?$", re.I)


def _allergen_cell(text: str, where: str) -> tuple[set[str], set[str], set[str]]:
    words = [w for w in re.split(r"[,\s]+", text) if w]
    return allergen_words(words, where)


def allergens_for(row: dict) -> dict:
    """The item's allergens exactly as its row prints them (see the module docstring). Stops on anything unexpected."""
    where = f"Cooplands {row['name']}"
    contains_text = row["contains"].strip()
    contains, cereals, nuts = set(), set(), set()
    if contains_text:
        m = CONTAINS_OPENING.match(contains_text)
        if not m:
            raise SystemExit(f"{where}: Contains cell {contains_text!r} does not start with 'Contains'")
        body = contains_text[m.end():]
        q = QUID.search(body)
        if q:
            if q.group(2).strip() not in QUID_WORDS:
                raise SystemExit(f"{where}: unexpected percentage ingredient {q.group(0)!r} in the Contains cell")
            body = body[:q.start()]
        contains, cereals, nuts = _allergen_cell(body, where)
        if q and q.group(2).strip() == "Cheese" and "milk" not in contains:
            raise SystemExit(f"{where}: the Contains cell names cheese but not milk: re-read the guide")
    may: set[str] = set()
    may_text = row["may_contain"].strip()
    if may_text:
        m = MAY_SENTENCE.match(may_text)
        if not m:
            raise SystemExit(f"{where}: May Contain cell {may_text!r} is not 'Not suitable for someone with a ... allergy'")
        may, _, _ = _allergen_cell(m.group(1), where)
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


def num(row: dict, key: str) -> float:
    return float(row[key])


def serving_for(row: dict, entry: dict) -> str:
    if entry["serving"] is not None:
        return entry["serving"]
    if row["per"]:
        if row["per"] not in PER_SERVING:
            raise SystemExit(f"{row['name']}: unknown 'per' note {row['per']!r}: add it to PER_SERVING after reading what it means.")
        return PER_SERVING[row["per"]]
    m = re.fullmatch(r"(\d+(?:\.\d+)?)g", row["weight"])
    if not m:
        raise SystemExit(f"{row['name']}: weight {row['weight']!r} is not a plain number of grams.")
    return f"{m.group(1)} g"


def weight_for(row: dict, entry: dict) -> str:
    """weight_g: the printed Weight, only when the per-product values are for that weight, i.e. the row has no KCAL_Per note
    ("per cake", "Per 1/6 Slice" ...) and its serving is not set by hand (the same rows whose serving is '<Weight> g')."""
    if entry["serving"] is not None or row["per"]:
        return ""
    return serving_for(row, entry)[:-2]  # '<n> g' -> '<n>' (serving_for checks the cell is a plain number of grams)


def tags_for(row: dict, name: str) -> tuple[list[str], str]:
    """(tags, extra note). The guide's vegetarian mark is necessary but not enough: if the item's own name or ingredients
    name a meat, the item is not tagged vegetarian (a wrong 'vegetarian' tag is the dangerous mistake) and the note says so."""
    text = f"{row['name']} {row['contains']}"
    vegan = row["vegan"].upper() == "YES"
    vegetarian = vegan or row["veg"].upper() == "YES"  # a vegan item is vegetarian too
    pork = bool(PORK_WORDS.search(text)) or row["name"] in NAME_MEANS_PORK
    beef = bool(BEEF_WORDS.search(text))
    if vegan:  # "VEGAN SAUSAGE ROLL": the word sausage here does not mean pork
        pork = beef = False
    extra = ""
    if vegetarian and not vegan and (pork or beef):
        vegetarian = False
        extra = "The guide marks this vegetarian but its own name/ingredients list meat, so it is not tagged vegetarian"
    return sorted(([VEG] if vegetarian else []) + ([PORK] if pork else []) + ([BEEF] if beef else [])), extra


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=None, help="default: data/source/cooplands")
    args = ap.parse_args()

    printed = pdf_reader.read_rows(args.pdf)
    spec = [(section, e) for section, entries in SECTIONS for e in entries]
    if len(printed) != len(spec):
        print(f"The PDF has {len(printed)} product rows but this script names {len(spec)}. The layout or menu changed: "
              "re-check SECTIONS against the PDF before running again.", file=sys.stderr)
        return 1
    by_label = {}
    for n, (row, (section, e)) in enumerate(zip(printed, spec), start=1):
        if row["section"] != section or row["name"] != e["label"]:
            print(f"Row {n}: the PDF prints {row['name']!r} under {row['section']!r} but this script expects {e['label']!r} under "
                  f"{section!r}. The menu changed: re-check SECTIONS.", file=sys.stderr)
            return 1
        by_label[row["name"]] = row

    items, excluded, flags = [], [], []
    for row, (section, e) in zip(printed, spec):
        if e["name"] is None:
            if "dup_of" in e:  # a pack row must repeat the single item's printed numbers exactly, else a human decides
                single = by_label[e["dup_of"]]
                keys = [k for k, _ in pdf_reader.NUM_COLUMNS]
                if [row.get(k) for k in keys] != [single.get(k) for k in keys]:
                    print(f"{row['name']!r} no longer repeats {e['dup_of']!r}: decide whether to publish it.", file=sys.stderr)
                    return 1
            excluded.append((section, row["name"], e["reason"]))
            continue
        if "kcal" not in row or any(k not in row for k in PER_PRODUCT):
            print(f"{row['name']!r} has missing per-product numbers: add an X() entry (per-100g values are never used).", file=sys.stderr)
            return 1
        tags, extra_note = tags_for(row, e["name"])
        items.append({
            "name": e["name"], "category": e["cat"], "serving": serving_for(row, e),
            "calories": row["kcal"], "protein_g": row["protein"], "carbs_g": row["carbs"], "fat_g": row["fat"],
            "sat_fat_g": row["sat"], "sodium_mg": "", "salt_g": row["salt"], "sugar_g": row["sugars"], "fiber_g": "",
            "energy_kj": "" if row["name"] in KJ_NOT_PUBLISHED else row.get("kj", ""), "weight_g": weight_for(row, e),
            "tags": "|".join(tags), "limited_time": e["limited"], "rankable": e["rank"],
            "notes": "; ".join(n for n in (e["note"], extra_note) if n),
            "allergens": allergens_for(row),
            "_printed": row["name"],
        })
    for it in items:
        it["id"] = slug(it["name"])
    ids = [i["id"] for i in items]
    clashes = sorted({i for i in ids if ids.count(i) > 1})
    if clashes:
        print(f"Duplicate item names: {clashes}. Give each product its own name.", file=sys.stderr)
        return 1
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: reading order inside a category

    # Consistency review of what is PRINTED (never corrected): flags go to the report, impossible rows to HOLDBACK.
    holdback = []
    for it in items:
        row = by_label[it["_printed"]]
        macro = 4 * num(row, "protein") + 4 * num(row, "carbs") + 9 * num(row, "fat")
        kjkcal = num(row, "kj") / 4.184
        problems = []
        if num(row, "kj") and abs(num(row, "kcal") - kjkcal) > 0.05 * kjkcal:
            problems.append(f"kcal {row['kcal']} vs kJ {row['kj']} (about {kjkcal:.0f} kcal)")
        if abs(macro - num(row, "kcal")) > 0.08 * num(row, "kcal"):
            problems.append(f"kcal {row['kcal']} vs macros about {macro:.0f} kcal")
        if num(row, "fat100") + num(row, "carbs100") + num(row, "protein100") > 100.5:
            problems.append("fat + carbohydrate + protein per 100 g add up to more than 100 g")
        if num(row, "sat") > num(row, "fat"):
            problems.append("saturates exceed fat")
        if num(row, "sugars") > num(row, "carbs"):
            problems.append(f"sugars {row['sugars']} exceed carbs {row['carbs']}")
        if problems:
            flags.append((it["name"], "; ".join(problems)))
        if it["_printed"] in HOLDBACK:
            reason = HOLDBACK[it["_printed"]].format(**row, macro=macro, kjkcal=kjkcal)
            holdback.append((it["id"], reason))
    unlisted = [n for n, why in flags if slug(n) not in {h for h, _ in holdback} and n not in EXPLAINED_FLAGS]
    if unlisted:
        print("Printed numbers disagree for items not in HOLDBACK (decide: hold back, or explain in the entry's note): "
              + ", ".join(unlisted), file=sys.stderr)
        return 1
    missing = [p for p in list(HOLDBACK) + list(KJ_NOT_PUBLISHED) if p not in {i["_printed"] for i in items}]
    if missing:
        print(f"HOLDBACK or KJ_NOT_PUBLISHED names rows that are not published: {missing}", file=sys.stderr)
        return 1
    for it in items:
        it.pop("_printed")

    out = write_chain_folder(chain_id=CHAIN_ID, name="Cooplands", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    by_cat: dict[str, int] = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    print("by category:", ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    print(f"left out {len(excluded)} printed rows:")
    for section, label, why in excluded:
        print(f"  - [{section}] {label}: {why}")
    print(f"held back {len(holdback)} items:")
    for item_id, why in holdback:
        print(f"  - {item_id}: {why}")
    print(f"consistency flags on printed numbers ({len(flags)}):")
    for name, why in flags:
        print(f"  - {name}: {why}")
    meat_unsaid = [i["name"] for i in items if i["category"] in (SAND, SAV, PIZ, SAL) and "Meat type not stated" in i["notes"]]
    print("meat type not stated:", ", ".join(meat_unsaid) or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
