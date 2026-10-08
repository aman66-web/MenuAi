#!/usr/bin/env python3
"""Build data/source/hotel-du-vin/ from Hotel du Vin's own allergen + calorie pages (hosted by Ten Kites). A CALORIES-ONLY chain.

    python3 tools/uk_extract/hotel_du_vin.py --work DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://menus.tenkites.com/mhdv/hotelduvin, the page hotelduvin.com links as "Click here to view allergens"
(https://www.hotelduvin.com/locations/york/bistro/menus/). It holds 20 menu tabs (the first at that URL, the others at
?mguid=<menu id>, the ids being listed in the page's own menu selector). The pages show no date ("HdVCore-<Menu>_<day>.pdf" is the
day they were served), so the source title says "(accessed <date>, no date shown)". --fetch downloads the 20 pages and the 8 PDF
menus used for the cross-check below, one request per second, into DIR/pages and DIR/pdf; without it DIR must already hold them.
Readers: hotel_du_vin_pages.py (+ tenkites_c.py).

WHAT IS PRINTED. Each dish prints ONE number, its calories in brackets beside the name ("(437 kcal)"). There is no nutrition table
anywhere on the pages, not even a hidden one (the row's expander arrow reveals only the ingredient list and the "Dietary Information"
allergen lines; the words protein, carbohydrate, saturates, sugars, fibre and kJ occur only inside ingredient text). So protein, carbs,
fat and every other nutrient stay blank (never 0) and the chain is calories-only (docs/DATA.md). A thousands comma is dropped.

ALLERGENS are complete for every published dish. The page prints each dish's allergens four ways and the run stops if they disagree:
the 14-column matrix (Contains / May contain / none), the two "Dietary Information" lines (which also name the gluten cereals and
tree nuts), the short mobile lines, and the label ids the page's own allergen filter reads. A dish with neither ingredients nor
allergen marks would be indistinguishable from "not entered", so such a dish would be held back (none are in the published tabs).

WHICH TABS (the chain's public, Great Britain, current-season menus; hotelduvin.com's bistro page prints the same dishes as PDFs):
- Read: Autumn Menu 2026, Autumn Offers & NGCI Menus, Breakfast Menu 2026, NGCI Breakfast Options, Beverages (hot drinks and
  cocktails), Kids Menu, HDV Autumn Afternoon Tea 2026 (NGCI = "no gluten containing ingredients"). Most of their rows are held
  back (below): the whole Kids, Afternoon Tea and cocktail lists, and every dish the chain's printed menus contradict.
- Left out (EXCLUDED_TABS, with the reason each): private dining, meetings, weddings, Christmas Day / festive / canapes menus, single
  hotels (Birmingham White Lion, Bristol, the Birmingham / Tunbridge Wells / Stratford specials), Spring Summer Specials (a past season),
  Wood Fire and Vine (not on the bistro menus page, a cover record at 0 kcal, nonsense values).
- Left out inside the published tabs (EXCLUDED_SECTIONS / the Market Table rule): the breakfast "Country Table" buffet lines (internal
  category records such as "SOP" with no portion), cocktails "NOT AVAILABLE IN ALL HOTELS", a complimentary 2022 bar snack, and the
  Sunday-lunch "Market Table" buffet components (no portion; the 'for tills' line is not the sum of its parts).

HELD BACK (holdback.csv), never corrected. A published tab's row is held back when
1. the chain's own printed menu (PDF on hotelduvin.com) prints a DIFFERENT calorie figure for the same dish (CROSS_CHECK below; the
   script reads the PDF text and compares, any difference counts, however small). Most dishes that exist in both differ: e.g.
   Treacle sourdough 437 here vs 188 in the PDFs; the PDFs also disagree with each other for Pan con tomat (195 / 297);
2. the same dish is printed twice on the pages with two different figures;
3. a figure is impossible on its face: 0 kcal for a biscuit; the whole Afternoon Tea tab (its parts print more calories than the whole
   tea: a sandwich at 4,416 kcal, a sweet plate at 19,824, against 2,161 for the whole Afternoon Tea, and the PDF prints 959 for the
   cream tea against 795 here and 305 for the scones against 1,588); the whole cocktail section (the same cocktail prints different
   figures, a mocktail prints 8,308 kcal, a Bellini 6).
Restoring a row is deleting its line in holdback.csv.

OTHER CHOICES: names are the printed names, recased from ALL CAPS, the internal prefix "HDV" and the kitchen markers "(A)", "(C)",
"New", "Bar/Room" dropped (kept in the notes column); "NGCI" is kept. Tags: vegetarian only where the page's own wording says so
("(V)", a vegan/plant-based dish name, the Taste du Vin Vegan section); contains_pork / contains_beef only from the printed name.
The same dish printed on several tabs with the same figure and allergens is kept once; with other allergens it is kept under the
name plus its category.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import hotel_du_vin_pages as hp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "hotel-du-vin"
BASE = "https://menus.tenkites.com/mhdv/hotelduvin"
SITE_PAGE = "https://www.hotelduvin.com/locations/york/bistro/menus/"
SOURCE_TITLE = ("Hotel du Vin allergen and calorie information on Ten Kites: Autumn, Offers, Breakfast, Beverages, Kids and Afternoon Tea "
                "menus (accessed {checked}, no date shown)")
ALLERGEN_TITLE = "Hotel du Vin allergen matrix on Ten Kites, all menu tabs (accessed {checked}, no date shown)"
NOTE = ("Hotel du Vin prints calories only, per dish as served, with no portion sizes, so protein, carbs and fat are not published. "
        "Its allergen page often disagrees with its own printed menus, so every dish where they differ is held back, as are the "
        "cocktails and afternoon tea. Menus vary a little by hotel.")

# (tab position, name, dishes the page must print, file, published?)
TABS = [
    (0, "Autumn Menu 2026", 88, True), (1, "Autumn Offers & NGCI Menus", 24, True), (2, "Breakfast Menu 2026", 44, True),
    (3, "NGCI Breakfast Options", 12, True), (4, "Spring Summer Specials", 53, False), (5, "Autumn/Winter Local Specials", 27, False),
    (6, "Beverages - Including Cocktails", 215, True), (7, "Kids Menu", 14, True), (8, "Wood Fire and Vine Menus", 17, False),
    (9, "HDV Autumn Afternoon Tea 2026", 29, True), (10, "Christmas Day Menu 2026", 21, False),
    (11, "Festive Celebrations Menu 2026", 15, False), (12, "Festive Canapes Menu 2026", 8, False),
    (13, "Private Dining 2026", 89, False), (14, "Meetings & Events 2026", 54, False), (15, "Wedding Menus 2026", 30, False),
    (16, "Birmingham White Lion Menu", 24, False), (17, "HdV Bristol Specials", 9, False), (18, "Private Dining 2026", 89, False),
    (19, "M&E 2026", 53, False),
]
EXCLUDED_TABS = {
    "Spring Summer Specials": "a past season's chef specials (53 dishes), not on the current bistro menus page",
    "Autumn/Winter Local Specials": "specials of single hotels (Birmingham, Tunbridge Wells, Stratford)",
    "Wood Fire and Vine Menus": "not on the bistro menus page; a 0 kcal cover record and values such as a whole roast sea bass at 76 kcal and a cake at 4,268",
    "Christmas Day Menu 2026": "one-day event set menu", "Festive Celebrations Menu 2026": "Christmas set menu, withdrawn before the 4 January 2027 launch",
    "Festive Canapes Menu 2026": "Christmas party canapes", "Private Dining 2026": "private dining", "Meetings & Events 2026": "meetings and events buffets",
    "Wedding Menus 2026": "weddings", "Birmingham White Lion Menu": "a single venue", "HdV Bristol Specials": "a single hotel",
    "M&E 2026": "meetings and events buffets",
}
PAGE_FILE = "hdv_{:02d}.html"
# the chain's own printed bistro menus (linked from SITE_PAGE); used only to compare calorie figures
PDFS = {
    "A": ("32038_hdv_autumn26_alc_t1_web_v5.pdf", "https://www.hotelduvin.com/media/envnrtxo/32038_hdv_autumn26_alc_t1_web_v5.pdf"),
    "B": ("32038_hdv_autumn_bar_t1_v2.pdf", "https://www.hotelduvin.com/media/zgmn551f/32038_hdv_autumn_bar_t1_v2.pdf"),
    "R": ("32038_hdv_autumn26_roomservice_web.pdf", "https://www.hotelduvin.com/media/332e04ac/32038_hdv_autumn26_roomservice_web.pdf"),
    "S": ("32038_hdv_autumn26_sl_t1_web_v2.pdf", "https://www.hotelduvin.com/media/h4ni3ruf/32038_hdv_autumn26_sl_t1_web_v2.pdf"),
    "PF": ("32038_hdv_autumn26_prixfixe_web.pdf", "https://www.hotelduvin.com/media/buofsyvr/32038_hdv_autumn26_prixfixe_web.pdf"),
    "BK": ("32038_hdv_autumn_breakfast_a5_4pp_web.pdf", "https://www.hotelduvin.com/media/pk2aftgl/32038_hdv_autumn_breakfast_a5_4pp_web.pdf"),
    "K": ("31885_hdv_lesenfants_a5_4pp_no_price.pdf", "https://www.hotelduvin.com/media/54uchnkn/31885_hdv_lesenfants_a5_4pp_no_price.pdf"),
    "AT": ("32038_hdv_autumn26_afternoontea_web.pdf", "https://www.hotelduvin.com/media/byihous3/32038_hdv_autumn26_afternoontea_web.pdf"),
}

# (tab, printed section) -> category shown. Every section of a published tab must be listed: a new one stops the run.
AM, OF, BF, NB, BV, KD, AT = ("Autumn Menu 2026", "Autumn Offers & NGCI Menus", "Breakfast Menu 2026", "NGCI Breakfast Options",
                              "Beverages - Including Cocktails", "Kids Menu", "HDV Autumn Afternoon Tea 2026")
CATEGORIES = {
    (AM, "Amuse-gueule/nibbles"): "Nibbles", (AM, "Hors d'oeures/starters"): "Starters", (AM, "Plats principaux/mains"): "Mains",
    (AM, "Legumes et les sauces/sides & sauces"): "Sides & sauces", (AM, "Patisseries et desserts"): "Desserts",
    (AM, "Bar & Room Service"): "Bar & room service", (AM, "Sunday Lunch"): "Sunday lunch", (AM, "Night Bites"): "Night bites",
    (OF, "NGCI options"): "NGCI options", (OF, "Plats de Jour"): "Plats de jour", (OF, "Taste du Vin Menu"): "Taste du Vin menu",
    (OF, "Taste du Vin Vegan"): "Taste du Vin vegan",
    (BF, "The Country Table Breakfast Items"): "Country Table breakfast", (BF, "Hot Breakfast Dishes from the Kitchen"): "Breakfast",
    (BF, "breakfast ad ons"): "Breakfast add-ons",
    (NB, "Hot NGCI Breakfast Dishes from the Kitchen"): "Breakfast (NGCI)",
    (BV, "Hot Beverages"): "Hot drinks", (BV, "HDV Cocktails"): "Cocktails",
    (BV, "HdV Specials cocktails - NOT AVAILABLE IN ALL HOTELS"): "Cocktails (selected hotels)", (BV, "BAR SNACK"): "Bar snack",
    (KD, "starters"): "Kids starters", (KD, "mains"): "Kids mains", (KD, "desserts"): "Kids desserts",
    (AT, "Cream Tea"): "Afternoon tea", (AT, "Afternoon Tea Standard"): "Afternoon tea", (AT, "Afternoon Tea Gluten Free Ingredients"): "Afternoon tea",
    (AT, "Afternoon Tea Vegan"): "Afternoon tea", (AT, "Afternoon Tea Vegetarian"): "Afternoon tea",
    (AT, "Individual Savouries"): "Afternoon tea parts", (AT, "Individual Sweets"): "Afternoon tea parts",
    (AT, "Individual Scones"): "Afternoon tea parts",
}
EXCLUDED_SECTIONS = {
    (BF, "The Country Table Breakfast Items"): "internal buffet category records (\"SOP\", \"Juices & Milk\", \"Tea & Coffee\"...) with no portion or "
                                               "dish a guest orders; the printed breakfast menu gives different per-item figures (toast 241 / 233 vs 196 here)",
    (BV, "HdV Specials cocktails - NOT AVAILABLE IN ALL HOTELS"): "the page itself says these cocktails are not available in all hotels",
    (BV, "BAR SNACK"): "a complimentary bar snack dated autumn 2022, not a menu item",
}
MARKET_TABLE = re.compile(r"^(French )?Market Table\b", re.I)   # Sunday lunch buffet components (and the 'for tills' line)
MARKET_TABLE_WHY = ("Sunday-lunch buffet component with no stated portion; the page's own 'French Market Table (for tills)' line (676 kcal) "
                    "is not the sum of its parts")

# Dishes of the chain's printed menus: printed name (as the page prints it, or a regex) -> [(PDF key, anchor, value index)].
# The anchor is the END of the PDF text just before "(NNNkcal)" (case-insensitive). The value is read by this script from the PDF;
# any difference from the page's figure holds the row back. A name listed here must exist on the pages, an anchor must be found
# in its PDF: otherwise the run stops (the menu changed).
SAL = "Baby kale, edamame beans, quinoa and alfalfa sprouts"
CHECKS = [
    ("TREACLE SOURDOUGH BREAD Beillevaire Salted Butter", [("A", "Treacle sourdough with Beillevaire salted butter"), ("B", "Treacle sourdough with Beillevaire salted butter"), ("R", "Treacle sourdough with Beillevaire salted butter")]),
    ("PETITES OLIVES LUCQUES", [("A", "PETITES OLIVES LUCQUES [VGI]"), ("B", "PETITES OLIVES LUCQUES"), ("R", "PETIT LUCQUES OLIVES")]),
    ("AMANDES FUMÉES, Smoked Almonds", [("A", "Smoked almonds"), ("B", "Smoked almonds"), ("R", "Smoked almonds")]),
    ("HUÎTRES ROCK NATIVES, Maldon Rock Oysters, Half a dozen", [("A", "Half a dozen"), ("B", "Half a dozen"), ("R", "Half a dozen")]),
    ("HUÎTRES ROCK NATIVES, Maldon Rock Oysters, Single", [("A", "Native rock oysters – single"), ("B", "Single"), ("R", "Native rock oysters - Single")]),
    ("PAN CON TOMAT Calabrian anchovies", [("A", "Calabrian anchovies"), ("B", "Calabrian anchovies"), ("R", "Calabrian anchovies")]),
    ("SAUCISSON SEC Cornichons", [("A", "SAUCISSON SEC"), ("B", "SAUCISSON SEC Cornichons"), ("R", "SAUCISSON SEC")]),
    ("TINNED MOUNTS BAY SARDINES Toasted Sourdough & Watercress", [("A", "Tinned Mount’s Bay sardines, toasted sourdough and watercress"), ("B", "Tinned Mount’s Bay sardines, toasted sourdough and watercress"), ("R", "Tinned Mount’s Bay sardines, toasted sourdough and watercress")]),
    ("TINNED CANTABRIAN TUNA Cantabrian tuna in olive oil, toasted sourdough & watercress", [("B", "Cantabrian tuna in olive oil, toasted sourdough and watercress")]),
    (re.compile(r"^LA GRANDE SOUPE À L’OIGNON French onion soup"), [("A", "French onion soup"), ("R", "French onion soup")]),
    (re.compile(r"^TARTIFLETTE DE SAVOIE"), [("A", "Alsacienne pancetta baked with creamy potatoes and onions, under Yarlington cheese")]),
    ("CHICKEN LIVER PARFAIT Brioche toast", [("A", "Chicken liver parfait, raisin chutney, toasted brioche"), ("R", "Chicken liver parfait, raisin chutney, toasted brioche"), ("PF", "Chicken liver parfait, raisin chutney, toasted brioche")]),
    ("OAK SMOKED SALMON Treacle Soda bread & Fromage Blanc", [("A", "Oak smoked salmon, treacle soda bread and fromage blanc"), ("R", "Oak smoked salmon, treacle soda bread and fromage blanc"), ("PF", "Oak smoked salmon, treacle soda bread and fromage blanc")]),
    ("SAUTÉED WILD MUSHROOMS Madeira Sauce, Toasted Sourdough", [("A", "Sautéed wild mushrooms, Madeira sauce, toasted sourdough"), ("PF", "Sautéed wild mushrooms, Madeira sauce, toasted sourdough")]),
    ("GRILLED RED PRAWNS Garlic Butter", [("A", "Grilled red prawns, toasted sourdough and garlic butter")]),
    ("ROASTED SCALLOPS Gremolata & Herb Crust", [("A", "Roasted scallops, gremolata and herb crust")]),
    (re.compile(r"^ASSIETTE OF STARTERS"), [("A", "Pain au Levain à la Mélasse & Petites Lucques Olives")]),
    ("SALADE MAISON STARTER", [("A", "SALADE MAISON [VGI]", 0), ("R", SAL, 0), ("S", "SALADE MAISON [VGI]", 0)]),
    ("SALADE MAISON - main course", [("A", "SALADE MAISON [VGI]", 1), ("R", SAL, 1), ("S", "SALADE MAISON [VGI]", 1)]),
    ("RIB-EYE STEAK BORDELAISE 280G Roasted Bone Marrow", [("A", "280g rib-eye steak, bordelaise sauce, roasted bone marrow")]),
    (re.compile(r"^BLANC DE POULET NOURRI AU MAÏS"), [("A", "Corn-fed chicken breast, wild mushrooms, burnt leeks, chicken velouté"), ("R", "Corn-fed chicken breast, wild mushrooms, burnt leeks, chicken velouté"), ("PF", "Corn-fed chicken breast, wild mushrooms, burnt leeks, chicken velouté")]),
    ("ROASTED PORK BELLY Braised Butter Beans and Wild Mushrooms", [("A", "Roasted pork belly, braised butter beans and wild mushrooms"), ("R", "Roasted pork belly, braised butter beans and wild mushrooms")]),
    (re.compile(r"^PAVÉ OF COD"), [("A", "Pavé of cod, curried cauliflower purée, vinaigrette of pomegranate, golden raisins, red onion and lime"), ("S", "Pavé of cod, curried cauliflower purée, vinaigrette of pomegranate, golden raisins, red onion and lime"), ("PF", "Pavé of cod, curried cauliflower purée, vinaigrette of pomegranate, golden raisins, red onion and lime")]),
    ("FISH PIE Topped with Whole Grain Mustard Pommes Purée", [("A", "Traditional fish pie topped with mashed potato")]),
    (re.compile(r"^CARAMELISED ONION, SQUASH & SPINACH PITHIVIER"), [(k, "Caramelised onion, squash and spinach pithivier, celeriac purée, vegan jus") for k in ("A", "R", "S", "PF")]),
    ("Additonal chicken", [("A", "Chicken"), ("R", "Additions £6.00: Chicken"), ("S", "Chicken")]),
    ("Add Tiger Prawns (Salade Maison)", [("A", "Tiger prawns"), ("R", "Tiger prawns"), ("S", "Tiger prawns")]),
    ("Additional halloumi", [("A", "Plant-based halloumi [VGI]"), ("R", "Plant based halloumi [VGI]"), ("S", "Plant-based halloumi [VGI]")]),
    ("POMMES FRITES", [("A", "POMMES FRITES [V]"), ("R", "POMMES FRITES [V]")]),
    ("CAMEMBERT POMMES PURÉE", [("A", "CAMEMBERT POMME PURÉE [V]")]),
    ("HARICOT VERTS", [("A", "HARICOTS VERTS [V]")]),
    ("RATATOUILLE PROVENÇAL", [("A", "RATATOUILLE PROVENÇALE [VGI]")]),
    ("BRAISED SPICED RED CABBAGE", [("A", "Braised spiced red cabbage")]),
    ("MIXED LEAF SALAD", [("A", "Mixed leaf salad"), ("R", "Mixed leaf salad")]),
    ("PEPPERCORN SAUCE", [("A", "Peppercorn sauce")]),
    ("BEURRE D'AIL, Garlic Butter", [("A", "Garlic butter")]),
    ("CAFE DE PARIS", [("A", "Café de Paris butter")]),
    ("CRÈME BRÛLÉE", [("A", "CRÈME BRÛLÉE [V]"), ("S", "CRÈME BRÛLÉE [V]"), ("PF", "CRÈME BRÛLÉE [V]")]),
    ("VALRHONA POT DE CHOCOLAT, Chantilly cream", [("A", "Chantilly cream"), ("S", "Chantilly cream"), ("PF", "Chantilly cream")]),
    (re.compile(r"^LE VRAI FLAN PARISIAN"), [("A", "Brandy soaked Agen prunes"), ("S", "Brandy soaked Agen prunes")]),
    (re.compile(r"^FONDANT AU CHOCOLAT"), [("A", "Oriado chocolate, Kirsch cherries and vanilla ice cream"), ("S", "Oriado chocolate, Kirsch cherries and vanilla ice cream")]),
    ("GLACES ET SORBETS", [("A", "GLACES ET SORBETS [VGIA]"), ("R", "A selection of ice cream and sorbets"), ("S", "GLACES ET SORBETS [VGIA]")]),
    (re.compile(r"^ASSIETTE DE FROMAGE Artisan cheese"), [(k, "Artisan cheese, biscuits and chutney") for k in ("A", "B", "R", "S", "PF")]),
    (re.compile(r"^ASSIETTE DE FROMAGES, French artisan cheese"), [("A", "Artisan cheese, biscuits and chutney")]),
    (re.compile(r"^FRIED EGG CRISPS"), [("B", "Torres fried egg crisps, Serrano ham and Manchego cheese")]),
    (re.compile(r"^BLACK TRUFFLE CRISPS"), [("B", "Torres black truffle crisps and Brie")]),
    (re.compile(r"^OLIVE OIL CRISPS"), [("B", "Torres extra virgin olive oil crisps, anchovies and pimento stuffed olives")]),
    (re.compile(r"^CHEESE AND CHARCUTERIE PLATTER"), [("B", "A selection of artisan cheeses, saucisson sec, duck rillettes, pickles and chutney")]),
    (re.compile(r"^New JAMBON BEURRE"), [("B", "Thick cut ham, cornichons, French butter in a baguette style crusty roll with Dijonnaise"), ("R", "Thick cut ham, cornichons, French butter in a baguette style crusty roll with Dijonnaise")]),
    (re.compile(r"^SAUCISSON & CORNICHON BRIOCHE ROLL"), [("B", "Sliced French saucisson, cornichons in a soft brioche roll with Dijonnaise"), ("R", "Sliced French saucisson, cornichons in a soft brioche roll with Dijonnaise")]),
    (re.compile(r"^Bar/Room AVOCADO ON TOAST .*sourdough \(C\)$"), [("B", "Avocado on toast, chunky cherry tomato salsa and toasted sourdough"), ("R", "Avocado on toast, chunky cherry tomato salsa and toasted sourdough")]),
    (re.compile(r"^Bar/Room AVOCADO ON TOAST .*poached eggs \(C\)$"), [("B", "Served with poached eggs"), ("R", "Served with poached eggs (optional)")]),
    (re.compile(r"^CROQUE MONSIEUR baked ham"), [("B", "Baked ham, Emmental cheese, Vedett IPA rarebit"), ("R", "Baked ham, Emmental cheese, Vedett IPA rarebit")]),
    (re.compile(r"^CROQUE MADAME"), [("B", "Baked ham, Emmental cheese, Vedett IPA rarebit and fried egg"), ("R", "Baked ham, Emmental cheese, Vedett IPA rarebit and fried egg")]),
    (re.compile(r"^New PAN BAGNAT .*\(without Tuna\)$"), [("B", "red onion and peppers"), ("R", "red onion and peppers")]),
    (re.compile(r"^HDV CLASSIC BURGERS & FRITES 200g"), [(k, "200g burger patty, relish, bacon, grilled cheese, brioche bun, served with pommes frites") for k in ("B", "R", "S")]),
    (re.compile(r"^HDV CLASSIC BURGERS & FRITES Plant based"), [(k, "plant based brioche bun, served with pommes frites") for k in ("B", "R", "S")]),
    (re.compile(r"^WAGYU STEAK HACHÉ"), [("B", "Coarsely ground wagyu beef patty. Served with pommes frites, petit salad and peppercorn sauce")]),
    (re.compile(r"^ROAST SIRLOIN OF BEEF Served"), [("S", "ROAST SIRLOIN OF BEEF")]),
    ("ROAST CHICKEN and STUFFING", [("S", "ROAST CHICKEN & STUFFING")]),
    (re.compile(r"^SPAGHETTI BOLOGNESE"), [("R", "Rich beef ragu, grated Parmesan")]),
    ("MUSHROOM AND DOLCELATTE RISOTTO", [("R", "Mushroom risotto, grated Parmesan")]),
    (re.compile(r"^CROQUE MONSIEUR Baked ham Emmental"), [("R", "Baked ham, Emmental, béchamel sauce")]),
    ("CHEESE & CHARCUTERIE", [("R", "FROMAGE & CHARCUTERIE")]),
    # breakfast
    ("HDV Breakfast Toast", [("BK", "TOAST [V] White"), ("BK", "and granary")]),
    ("CLASSIC FULL COOKED BREAKFAST (A)", [("BK", "mushroom and eggs (cooked to your liking)")]),
    (re.compile(r"^EGGS BENEDICT .* HAM \(A\)$"), [("BK", "With your choice of: ham")]),
    (re.compile(r"^EGGS BENEDICT .* SMOKED SALMON \(A\)$"), [("BK", "oak smoked salmon")]),
    (re.compile(r"^EGGS BENEDICT .* MUSHROOMS \(A\)$"), [("BK", "or flat cap mushroom")]),
    ("OAK SMOKED SALMON (A)", [("BK", "With scrambled eggs")]),
    (re.compile(r"^AVOCADO ON TOAST Chunky cherry tomato salsa and toasted Altamura bread \(A\)$"), [("BK", "Chunky cherry tomato salsa and toasted Altamura bread")]),
    (re.compile(r"^AVOCADO ON TOAST .*Served with poached eggs \(A\)$"), [("BK", "Served with poached eggs (optional)")]),
    ("GRILLED KIPPER (A)", [("BK", "A whole grilled kipper served with lemon parsley butter")]),
    ("PORRIDGE (served from the kitchen) (V) (A)", [("BK", "Served hot from the kitchen")]),
    ("BOILED EGGS (A)", [("BK", "Boiled as you like them, with toasted soldiers")]),
    ("French Toast & Streaky Bacon, Canadian Maple Syrup (A)", [("BK", "Streaky bacon and Canadian maple syrup")]),
    ("French Toast, Granola, Mixed Berries & Natural Yoghurt (A)", [("BK", "OR berry compote, natural yoghurt and toasted granola")]),
    (re.compile(r"^CHARCUTERIE & CHEESE - slices"), [("BK", "Slices of cooked ham and salami, Emmental and Croxton Manor Cheddar")]),
    ("FULL COOKED VEGAN BREAKFAST (A)", [("BK", "mushroom and scrambled tofu")]),
    # kids
    (re.compile(r"^GARLIC BREAD & DIPPERS"), [("K", "Homemade garlicky sourdough with houmous, carrot and cucumber sticks")]),
    ("Les Enfants Melon & Berries", [("K", "Mixed sweet berries and melon")]),
    ("HDV Les Enfant Prawn Cocktail", [("K", "with lettuce leaves")]),
    ("Les Enfant Tomato & Cheddar Soup", [("K", "Classic tangy soup with grated cheddar to sprinkle")]),
    ("HDV Les Enfants Mac n' Cheese", [("K", "Classic cheesy pasta with a crunchy salad")]),
    (re.compile(r"^Sausage, Chips and Beans"), [("K", "Cumberland sausages with fries and baked beans")]),
    ("Les Enfant Roast Beef SL", [("K", "Served with all the trimmings, including a proper Yorkshire pud", 0)]),
    ("Les Enfant Roast Chicken SL", [("K", "Served with all the trimmings, including a proper Yorkshire pud", 1)]),
    ("Les Enfants Ribeye Steak & Pommes Frites", [("K", "Rib-eye steak with fries and watercress")]),
    (re.compile(r"^Les Enfants Breaded Plaice Goujons"), [("K", "Thick cut breaded plaice goujons with fries and garden peas")]),
    (re.compile(r"^Les Enfants Chocolate & Banana Brownie"), [("K", "A gooey, chocolatey banana brownie with vanilla ice cream")]),
    ("Les Enfants Freshly Cut Fruit Salad", [("K", "A fruit salad for stuffed tummies")]),
    (re.compile(r"^Les Enfants a Scoop of Vanilla"), [("K", "A selection of all the favourite flavours of yummy ice cream")]),
    ("Les Enfants Ice Cream Sundae", [("K", "with a cherry on the top")]),
    # hot drinks (the PDFs print one figure per drink without naming the milk: every milk variant must equal it)
    ("HDV Americano", [(k, "rx:Americano") for k in ("A", "B", "S")]),
    ("HDV Espresso", [(k, "rx:(?<!Double )Espresso") for k in ("A", "B", "S")]),
    (re.compile(r"^HDV Macchiato "), [(k, r"rx:\| Macchiato") for k in ("A", "B", "S")]),
    (re.compile(r"^HDV Latte "), [(k, "rx:Latte") for k in ("A", "B", "S")]),
    (re.compile(r"^HDV Cappuccino "), [(k, "rx:Cappuccino") for k in ("A", "B", "S")]),
    (re.compile(r"^HDV Flat White "), [(k, "rx:Flat White") for k in ("A", "B", "S")]),
    (re.compile(r"^HDV Hot Chocolate "), [(k, "rx:HOT CHOCOLATE") for k in ("A", "B", "S")]),
    (re.compile(r"^HDV Mocha "), [(k, "rx:MOCHA") for k in ("A", "B", "S")]),
]
# rows held back because they are built on a held-back row's recipe
ALSO_HELD = {
    "New PAN BAGNAT A crusty baguette roll stuffed with tomatoes, soft boiled egg, black niçoise olives, red onion and peppers. (with Tuna)":
        "the same dish without tuna is held back (the chain's printed menu prints 248 kcal against 516 here), and the printed menu's tuna "
        "add-on (453 kcal) does not fit the 748 printed here",
}
ZERO_KCAL_HELD = {"Hot Beverage Biscuit": "0 kcal printed for a biscuit"}
AFTERNOON_TEA_WHY = ("Afternoon Tea tab held back: its parts print more calories than the whole tea (sandwich 4,416 and sweet plate 19,824 kcal against "
                     "2,161 for the whole tea) and the printed menu gives 959 kcal for the cream tea (795 here) and 305 for the scones (1,588 / 1,610 here)")
COCKTAIL_WHY = ("cocktail section held back: the page prints different figures for the same cocktail (Bloody Mary 1,523 and 1,411; Cosmopolitan "
                "1,862 and 2,310) and up to 8,308 kcal for one drink")

# ------------------------------------------------------------------------------------------------ names, tags
KEEP_UPPER = {"NGCI", "SL", "IPA", "GF", "GFI", "NA", "PX", "BBQ", "XO"}
SMALL = {"a", "à", "au", "aux", "de", "du", "des", "d", "la", "le", "les", "et", "en", "and", "of", "with", "on", "in", "the", "or", "un", "une",
         "to", "for", "&", "-"}
VEGETARIAN = re.compile(r"\(V\)|VEGAN BREAKFAST|Plant based burger|Afternoon Tea Vegan|Afternoon Tea Vegetarian", re.I)
UNSPECIFIED = re.compile(r"\b(burgers?|patty|steak haché|bolognese|ragu)\b", re.I)
NAME_FIXES = {"Additonal chicken": "Additional chicken"}      # a typo in the page's name
# Meat words beyond tk.PORK / tk.BEEF: French words the names use, and cuts. The dish's own ingredient list (the page prints one per dish)
# is read too; "beef tomato" and the "Beef : 82/102 mm" tomato grade are not meat.
PORK_MORE = re.compile(r"\b(jambon|porc|saucisson|rillettes de porc|black pudding)\b", re.I)
BEEF_MORE = re.compile(r"\b(boeuf|bœuf|wagyu|chateaubriand|bone marrow)\b", re.I)
BEEF_NOT = re.compile(r"\bbeef(?:\s*:|\s+tomato)", re.I)


def _unaccent(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def _recase_word(w: str, first: bool) -> str:
    m = re.match(r"^([^A-Za-zÀ-ÿ0-9]*)(.*?)([^A-Za-zÀ-ÿ0-9]*)$", w)
    pre, core, post = m.group(1), m.group(2), m.group(3)
    if not core or not any(c.isalpha() for c in core) or any(c.isdigit() for c in core) or core != core.upper() or core in KEEP_UPPER:
        return w
    mm = re.match(r"^([A-ZÀ-Ý]{1,2})(['’])(.+)$", core)       # L’OIGNON, D’AIL
    if mm:
        head = mm.group(1).capitalize() if first else mm.group(1).lower()
        return pre + head + mm.group(2) + mm.group(3).capitalize() + post
    low = core.lower()
    if not first and low in SMALL:
        return pre + low + post
    if len(core) < 2:
        return w
    return pre + low.capitalize() + post


def tidy_name(printed: str) -> str:
    n = " ".join(printed.replace("ㅤ", " ").split())
    n = re.sub(r"^(New|NEW)\s+", "", n)
    n = re.sub(r"^Bar/Room\s+", "", n)
    n = re.sub(r"^(GFI\s+)?(HDV|HdV)\s+", "", n)
    n = re.sub(r"\s*\((A|C|V)\)", "", n)                       # kitchen markers: (A) (C); (V) becomes the vegetarian tag
    n = re.sub(r"[\s.]*\(?NGCI\)?$", " (NGCI)", n)
    words = n.split(" ")
    out = []
    for i, w in enumerate(words):
        out.append(_recase_word(w, i == 0))
    n = " ".join(out)
    n = re.sub(r"\s+,", ",", n)
    return NAME_FIXES.get(n.strip(" ,."), n.strip(" ,."))


# ------------------------------------------------------------------------------------------------ fetching and reading
def fetch_all(work: Path) -> None:
    (work / "pages").mkdir(parents=True, exist_ok=True)
    (work / "pdf").mkdir(parents=True, exist_ok=True)
    first = work / "pages" / PAGE_FILE.format(0)
    tk.fetch(BASE, first)
    tabs = hp.menu_tabs(first.read_text(encoding="utf-8"))
    if [t[0] for t in tabs] != [t[1] for t in TABS]:
        raise SystemExit(f"The page's menu selector changed: {[t[0] for t in tabs]}, expected {[t[1] for t in TABS]}")
    for i, (name, mid) in enumerate(tabs):
        if i:
            tk.fetch(f"{BASE}?mguid={mid}", work / "pages" / PAGE_FILE.format(i))
    for fname, url in PDFS.values():
        tk.fetch(url, work / "pdf" / fname)


def read_pages(work: Path) -> list[dict]:
    rows = []
    for pos, name, expected, _pub in TABS:
        f = work / "pages" / PAGE_FILE.format(pos)
        text = f.read_text(encoding="utf-8")
        title, _file = hp.page_menu(text)
        if title != name:
            raise SystemExit(f"{f.name} is the page {title!r}, expected {name!r}")
        dishes = hp.read_dishes(text, name)
        if len(dishes) != expected:
            raise SystemExit(f"{f.name} prints {len(dishes)} dishes but this script expects {expected}: the menu changed; re-check "
                             "TABS, CATEGORIES, CHECKS and the exclusions before running again.")
        for d in dishes:
            d["pos"] = pos
        rows += dishes
    return rows


TOKEN = re.compile(r"\(\s*(\d[\d,]*)\s*kcal(?:\s*[|/]\s*(\d[\d,]*)\s*kcal)?\s*\)")


def pdf_tokens(path: Path) -> list[tuple[list[int], str]]:
    text = subprocess.run(["pdftotext", str(path), "-"], check=True, capture_output=True, text=True).stdout
    text = re.sub(r"\s+", " ", text)
    out, prev = [], 0
    for m in TOKEN.finditer(text):
        out.append(([int(v.replace(",", "")) for v in m.groups() if v], text[max(prev, m.start() - 200):m.start()]))
        prev = m.end()
    return out


def pdf_value(tokens: dict, key: str, anchor: str, idx: int, where: str) -> int:
    pat = re.compile((anchor[3:] if anchor.startswith("rx:") else re.escape(anchor)) + r"\s*$", re.I)
    found = {tuple(v) for v, w in tokens[key] if pat.search(w.rstrip())}
    if not found:
        raise SystemExit(f"{where}: no calorie figure after {anchor!r} in PDF {key}: the printed menu changed, re-check CHECKS")
    if len(found) > 1:
        raise SystemExit(f"{where}: {anchor!r} matches several different figures {sorted(found)} in PDF {key}: make the anchor longer")
    vals = next(iter(found))
    if idx >= len(vals):
        raise SystemExit(f"{where}: PDF {key} prints {len(vals)} figure(s) after {anchor!r}, wanted number {idx + 1}")
    return vals[idx]


def cross_check(rows: list[dict], work: Path, report: list[str], close: list[str]) -> dict:
    """{(tab, section, printed name): [reason, ...]} for every published row whose figure the printed menus contradict."""
    tokens = {k: pdf_tokens(work / "pdf" / fname) for k, (fname, _u) in PDFS.items()}
    held: dict = {}
    used = set()
    for spec, refs in CHECKS:
        match = (lambda n, s=spec: n == s) if isinstance(spec, str) else (lambda n, s=spec: bool(s.search(n)))
        hit = [r for r in rows if r["menu"] in {t[1] for t in TABS if t[3]} and match(r["name"])]
        if not hit:
            raise SystemExit(f"CHECKS names a dish that is no longer on the pages: {spec!r}")
        for r in hit:
            used.add(id(r))
            where = f"{r['menu']} > {r['name']}"
            vals = []
            for ref in refs:
                key, anchor, idx = (ref + (0,))[:3] if len(ref) == 2 else ref
                vals.append((key, pdf_value(tokens, key, anchor, idx, where)))
            mine = int(r["kcal"])
            diffs = [(k, v) for k, v in vals if v != mine]
            if diffs:
                if all(abs(v - mine) <= 0.05 * mine for _k, v in diffs):
                    close.append(r["name"])
                pdfs = ", ".join(f"{v:,} kcal in PDF {k}" for k, v in vals)
                held.setdefault(key_of(r), []).append(f"the chain's own printed menu prints a different figure ({r['kcal']} kcal on the allergen page; {pdfs})")
            else:
                report.append(f"agrees with the printed menu ({', '.join(k for k, _ in vals)}): {r['menu']} > {r['name'][:60]} = {mine}")
    return held


def key_of(r: dict) -> tuple:
    return (r["menu"], r["section"], r["name"])


# ------------------------------------------------------------------------------------------------ allergens
def allergens_for(r: dict, filt: dict) -> dict:
    where = f"{r['menu']} > {r['name']}"
    st = r["states"]
    ck, _, _ = allergen_words([c for c in hp.COLUMNS if st[c] == "yes"], where)
    mk, _, _ = allergen_words([c for c in hp.COLUMNS if st[c] == "may"], where)
    all_ids, no_may = r["ids"]
    row = {"contains": r["contains"] or [], "may": r["may"] or [], "filter": filt,
           "label_ids": ([x for x in all_ids.split(",") if x], [x for x in no_may.split(",") if x])}
    out = tk.allergens_checked(row, where)
    if out is None:
        raise SystemExit(f"{where}: no allergen data to check against; the page layout changed")
    if out["contains"] != ck or out["may_contain"] != mk - ck:
        raise SystemExit(f"{where}: the matrix (contains {sorted(ck)}, may {sorted(mk)}) disagrees with the printed lines "
                         f"(contains {sorted(out['contains'])}, may {sorted(out['may_contain'])})")
    # the short mobile lines: heads only
    mob = {"contains": set(), "may": set()}
    for line in r["mobile_lines"]:
        m = re.match(r"^(Contains|May contain)\s+(.*)$", line)
        if not m:
            raise SystemExit(f"{where}: unknown mobile allergen line {line!r}")
        keys, _, _ = allergen_words([w for w in re.split(r",\s*", m.group(2))], where)
        mob["contains" if m.group(1) == "Contains" else "may"] |= keys
    if mob["contains"] != ck or mob["may"] - ck != mk - ck:
        raise SystemExit(f"{where}: mobile lines {mob} disagree with the matrix")
    for col in hp.COLUMNS:    # the pop-ups say the same as the cells
        pop = r["popup"].get(col)
        if st[col] == "yes" and not (pop or "").startswith("Contains "):
            raise SystemExit(f"{where}: {col} is Contains but its pop-up says {pop!r}")
        if st[col] == "may" and not (pop or "").startswith("May contain "):
            raise SystemExit(f"{where}: {col} is May contain but its pop-up says {pop!r}")
        if st[col] == "no" and pop:
            raise SystemExit(f"{where}: {col} is marked none but has a pop-up {pop!r}")
    return out


# ------------------------------------------------------------------------------------------------ build
def build(work: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    rows = read_pages(work)
    published = {t[1] for t in TABS if t[3]}
    root = tk.parse_html((work / "pages" / PAGE_FILE.format(0)).read_text(encoding="utf-8"))
    filt = tk.filter_labels(root)
    for tab in {t[1] for t in TABS if not t[3]}:
        if tab not in EXCLUDED_TABS:
            raise SystemExit(f"tab {tab!r} is neither published nor excluded with a reason")
        n = sum(1 for r in rows if r["menu"] == tab)
        report.append(f"left out tab {tab!r} ({n} dishes): {EXCLUDED_TABS[tab]}")
    rows = [r for r in rows if r["menu"] in published]
    for r in rows:
        if (r["menu"], r["section"]) not in CATEGORIES:
            raise SystemExit(f"New section {r['section']!r} on {r['menu']!r}: add it to CATEGORIES.")
    close: list = []
    held = cross_check(rows, work, report, close)
    report.append(f"held back for a figure that differs from the printed menu by 5% or less: {len(set(close))} dishes (every difference counts)")

    entries = []
    left_out: dict = {}
    for r in rows:
        k = key_of(r)
        sec = (r["menu"], r["section"])
        if sec in EXCLUDED_SECTIONS:
            left_out.setdefault(f"{r['menu']} > {r['section']}: {EXCLUDED_SECTIONS[sec]}", []).append(r["name"])
            continue
        if r["menu"] == AM and r["section"] == "Sunday Lunch" and MARKET_TABLE.search(r["name"]):
            left_out.setdefault(f"{r['menu']} > Sunday Lunch Market Table rows: {MARKET_TABLE_WHY}", []).append(r["name"])
            continue
        if not r["ingredients"] and not any(v != "no" for v in r["states"].values()):
            held.setdefault(k, []).append("no ingredients and no allergen mark printed, so 'no allergens' cannot be told from 'not entered'")
        reasons = list(held.get(k, []))
        if r["menu"] == AT:
            reasons.append(AFTERNOON_TEA_WHY)
        if r["menu"] == BV and r["section"] == "HDV Cocktails":
            reasons.append(COCKTAIL_WHY)
        if r["name"] in ALSO_HELD:
            reasons.append(ALSO_HELD[r["name"]])
        if r["name"] in ZERO_KCAL_HELD:
            reasons.append(ZERO_KCAL_HELD[r["name"]])
        al = allergens_for(r, filt)
        entries.append({**r, "category": CATEGORIES[sec], "tidy": tidy_name(r["name"]), "al": al, "reasons": reasons})

    for why, names in left_out.items():
        report.append(f"left out {len(names)} rows, {why}")
    # the same dish printed more than once
    def sig(e):
        a = e["al"]
        return (e["tidy"], e["kcal"], tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])))
    kept, seen = [], {}
    for e in entries:
        s = sig(e)
        if s in seen:
            first = seen[s]
            first["reasons"] = first["reasons"] or e["reasons"]
            first["vegan_section"] = first.get("vegan_section") or e["section"] == "Taste du Vin Vegan"
            report.append(f"dropped repeat: {e['menu']} > {e['section']} > {e['tidy']!r} ({e['kcal']} kcal) is the same dish, calories and allergens as "
                          f"{first['menu']} > {first['section']}")
            continue
        seen[s] = e
        kept.append(e)
    entries = kept
    by_name: dict = {}
    for e in entries:
        by_name.setdefault(slug(_unaccent(e["tidy"])), []).append(e)
    for group in by_name.values():
        if len(group) > 1:
            figures = {e["kcal"] for e in group}
            for e in group:
                if len(figures) > 1:
                    e["reasons"].append("the same dish name is printed elsewhere on the pages with a different calorie figure ("
                                        + " / ".join(sorted(figures)) + ")")
                e["tidy"] = f"{e['tidy']} ({e['category'].lower()})"
                report.append(f"same name on different dishes, renamed: {e['tidy']!r} ({e['kcal']} kcal)")
    names = [e["tidy"] for e in entries]
    ids = [slug(_unaccent(n)) for n in names]
    if len(set(names)) != len(names) or len(set(ids)) != len(ids):
        dup = sorted({n for n, i in zip(names, ids) if names.count(n) > 1 or ids.count(i) > 1})
        raise SystemExit(f"names (or their ids) still not unique: {dup}")

    items, holdback = [], []
    for e in entries:
        iid = slug(_unaccent(e["tidy"]))
        veg = bool(VEGETARIAN.search(e["name"])) or e["section"] == "Taste du Vin Vegan" or bool(e.get("vegan_section"))
        tags = ["vegetarian"] if veg else []
        if e["menu"] != BV:
            meat, unspecified = tk.meat_tags(e["name"], vegetarian=veg)
            text = e["name"] + " " + BEEF_NOT.sub(" ", e["ingredients"])
            if not veg:
                if "contains_pork" not in meat and (tk.PORK.search(text) or PORK_MORE.search(text)):
                    meat.append("contains_pork")
                if "contains_beef" not in meat and (tk.BEEF.search(text) or BEEF_MORE.search(text)):
                    meat.append("contains_beef")
            tags += meat
            if (unspecified or (UNSPECIFIED.search(e["name"]) and not meat)) and not veg and not e["reasons"]:
                report.append(f"meat type not stated: {e['tidy']}")
            if meat and not e["reasons"]:
                report.append(f"tags {meat}: {e['tidy'][:70]} (name: {bool(tk.PORK.search(e['name']) or tk.BEEF.search(e['name']) or PORK_MORE.search(e['name']) or BEEF_MORE.search(e['name']))})")
        notes = [f"Printed {e['name']!r} under {e['menu']} > {e['section']}, {e['kcal']} kcal"]
        bad = {"fish", "crustaceans", "molluscs"} | ({"milk", "eggs"} if (e["section"] == "Taste du Vin Vegan" or "vegan" in e["name"].lower()) else set())
        if veg and (set(e["al"]["contains"]) & bad):
            notes.append(f"marked vegetarian/vegan by the page but its matrix says it contains {sorted(set(e['al']['contains']) & bad)}")
            report.append(f"{e['tidy']}: {notes[-1]}")
        if e["reasons"]:
            holdback.append((iid, "; ".join(dict.fromkeys(e["reasons"]))))
        items.append({"id": iid, "name": e["tidy"], "category": e["category"], "calories": e["kcal"], "tags": "|".join(tags),
                      "rankable": False, "notes": "; ".join(notes), "allergens": e["al"]})
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", type=Path, required=True, help="folder holding (or to receive, with --fetch) pages/ and pdf/")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were downloaded")
    ap.add_argument("--fetch", action="store_true", help="download the 20 pages and 8 PDFs first (one request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.work)
    items, holdback, report = build(args.work)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Hotel du Vin", cuisine="French bistro", source_title=SOURCE_TITLE.format(checked=args.checked_on),
        source_url=BASE, checked_on=args.checked_on, aliases=["hotel du vin", "hotel du vin & bistro", "hotel du vin and bistro", "hotel du vin bistro", "bistro du vin"],
        items=items, out=args.out, note=NOTE, holdback=holdback, nutrition_level="calories",
        allergen_guide={"title": ALLERGEN_TITLE.format(checked=args.checked_on), "url": BASE, "checked_on": args.checked_on,
                        "may_contain_published": True})
    for pos, name, _n, _p in TABS:
        print(f"{PAGE_FILE.format(pos)} ({name}) sha256 {tk.sha256_text_file(args.work / 'pages' / PAGE_FILE.format(pos))}")
    for key, (fname, _u) in PDFS.items():
        print(f"PDF {key} {fname} sha256 {tk.sha256_text_file(args.work / 'pdf' / fname)}")
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"wrote {len(items)} items ({len(holdback)} held back, {len(items) - len(holdback)} published) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
