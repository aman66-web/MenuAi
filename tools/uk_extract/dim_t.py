#!/usr/bin/env python3
"""Build data/source/dim-t/ from dim t's official main-menu calorie list (a CALORIES-ONLY chain).

    python3 tools/uk_extract/dim_t.py CALORIES.pdf MENU.pdf --checked-on 2026-10-07 [--allergen-pdf ALLERGENS.pdf] [--out DIR]

Source (the chain's own page https://dimt.co.uk/allergens/ , robots.txt allows it; all four links on it are visible to visitors,
checked with Chromium on 2026-10-07: nothing is hidden by CSS):
    CALORIES.pdf  "Main Menu CALORIE INFORMATION: Detailed calorie information for all dish variations"
        https://dimt.co.uk/wp-content/uploads/dim-t-main-menu-calories-14.08.2026-v1.pdf   (file name: 14.08.2026 v1; 3 pages, text layer;
        served Last-Modified 2026-08-18; PDF created 2026-08-14)
    MENU.pdf      "DOWNLOAD OUR MENU", the printed main menu, which prints "NNNkcal" after each dish and the chain's own dietary marks
        https://dimt.co.uk/wp-content/uploads/dim-t-main-menu-August-2026.pdf   (2 pages; Last-Modified 2026-08-14)
    ALLERGENS.pdf  "Main menu ALLERGEN INFORMATION" (V1, 14.08.2026, 25 pages): only its link and SHA-256 are used, see below.
        https://dimt.co.uk/wp-content/uploads/dim-t-main-menu-allergens-14.08.2026-v1.pdf
Needs `pdftotext` (poppler). See dim_t_pdf.py.

The list prints calories ONLY: one "kcal" column per dish, as sold, with no portion size, no kJ, no protein, carbs, fat, salt or sugar. So
protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable). Calories are copied from the
PDF as printed. Only item NAMES, categories, serving words and tags are typed in ENTRIES below, and each is checked against the printed
menu: the script stops if the calorie list's dishes differ from ENTRIES (a new, renamed or removed dish, another heading, another number
of rows), if a value is not printed on the menu next to the dish, or if a phrase a tag/serving relies on is no longer printed.

Cross-check (the "one figure contradicted by another from the same source" rule): every one of the 100 dishes is looked up on the main menu
by its printed label + the calorie value, and every variant line ("chicken h 820kcal") is also bound to the dish heading it sits under on the
menu (the menu is read one column at a time, see dim_t_pdf.column_lines). 90 agree. 8 are CONTRADICTED and held back: the calorie list gives
Thai spicy basil fried rice chicken 820 / prawn 725 / beef 775 / tofu 769 and Pad kee Mao chicken 805 / beef 734 / prawn 627 / tofu 756, but
the menu prints 820 / 725 / 775 / 769 under "Pad kee mao" and 805 / 627 / 734 / 756 under "Thai spicy basil fried rice" (checked on the
rendered page and in the text): the two dishes' values are swapped between the two documents and nothing says which is right, so none of the
eight is published (holdback.csv; the script stops if this set of rows ever changes). Two dishes are not on the menu at all (so nothing
contradicts them), allowed only for these two: "Crispy Thai fish" (691) and "Bao buns with Plant-based Chicken (as an option)" (236); the
script stops if either value ever shows up on the menu, so a human re-reads the labels. Crispy Thai fish is also in the allergen guide, but
on neither the August 2026 menu nor the no-calories menu, so users are told in note.txt.

How the printed lists are read:
- Names: the calorie list's own name, tidied (sentence case; the dish type added where the list's bare name would be ambiguous or
  meaningless: "Prawn" under Handmade Dim sum -> "Prawn dim sum", "Crispy duck" under Bao buns -> "Crispy duck bao"), or the menu's own
  fuller name where the list truncates it ("Char siu pork" -> "Char siu pork buns"; "Truffle Edamame" under the dim sum 'Speciality'
  table -> "Truffle edamame dim sum", as the allergen guide calls it). The calorie list's own wording is kept in each row's notes.
- Categories: the calorie list's headings, with its three "Speciality" rows folded into Handmade dim sum (the menu prints them as the
  fourth column of that section), "Bau Buns" spelt as the menu does ("Bao buns"), "Specialties" as the menu ("specialities").
- serving: stated only where the menu states it: "Each basket contains 3 of the same delicious, steamed dumplings" (every dim sum row
  except the Char siu pork buns, which print "(Basket of 2)"), and "two scoops, hot chocolate sauce" / "two scoops" for the ice creams
  and sorbet. Nothing else prints a portion.
- Tags. vegetarian: only where the menu prints the dish's own (v) or (ve) mark next to its calories (or the dish is called vegetarian /
  vegan / plant-based by the chain: the Bibimbap "vegetarian" line, the plant-based bao, the Ice-cream heading's "v, ng"). The (vo) /
  (veo) "option available" marks do NOT count. contains_pork / contains_beef: only where the name or the menu's own description says so
  (pork, bacon, ham..., beef, steak, wagyu): Special fried rice ("pork, shrimp, chicken") and Wonton soup ("wontons filled with Wagyu
  beef") rely on the menu's description; the script also counts every pork/beef word on the menu's food pages and stops if the counts
  change. Nothing else is inferred (so e.g. gyoza and spring rolls carry no pork tag: their fillings are not stated).
- Not listed: drinks (the menu prints calories for tea, coffee, soft drinks and iced teas, but there is no allergen information for them,
  and a menu line without a stated size is not a serving), the kids menu and kids desserts (in the allergen guide, no calories printed),
  the lunch menu (not read: a different PDF, not part of the main-menu calorie list), wine, cocktails, beer, spirits (no calories), the
  Fortune cookies and the Vegan Thai red curry (in the allergen guide only, no calories).

Allergens (docs/DATA.md "Allergens") are LINK-ONLY, all or nothing. The guide's matrix (pages 2-7, 14 allergens as columns) uses
different dish names from the calorie list for about a third of the dishes, e.g. "SPICE SQUID (F)" for Five Spice Squid, "WONTON SOUP
WAGYU BEEF", "KOREAN CHICKEN BAO (F)", "KOREAN PLANT-BASED CHICKE BAO (F)", "SHREDDED CRISPY DUCK BAO (F)", "TRUFFLE EDAMAME DIM SUM",
"DRUNKEN NOODLES WITH CHICKEN" for Pad kee Mao, "THAI BASIL & CHILLI FRIED RICE ...", "STIR FRIED CASHEW NUT BEEF (F)" for Thai Cashew
stir fry, "BEEF RENDANG", "PLANT BASED CHICKEN KATSU CURRY (F)" for Vegetarian katsu curry, "BENTO CHOCOLATE BROWNIE", "GINGER TOFFEE
PUDDING", "VANILLA ICE CREAM WITH CHOCOLATE SAUCE" for "ice cream vanilla", and the matrix has the rows split over two or three lines
with the cereal and nut names inside the cells. Allergens are safety information: no matching by similar names, so only the guide's
link is published. The guide prints no per-dish "may contain", but it does print (F) = fried marks, that the fryer oil carries traces of
gluten, nuts, peanuts, dairy, soya, sesame, fish, mollusc, crustacean, lupin, egg, mustard, sulphates and celery, and that dishes may
contain a trace of other ingredients: so may_contain_published is yes (as for Wahaca).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dim_t_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "dim-t"
SOURCE_URL = "https://dimt.co.uk/wp-content/uploads/dim-t-main-menu-calories-14.08.2026-v1.pdf"
SOURCE_TITLE = "dim t main menu calorie information (14.08.2026 v1), checked against the August 2026 menu"
ALIASES = ["dim t", "dim-t", "dimt"]
ALLERGEN_GUIDE_TITLE = "dim t main menu allergen information (V1, 14.08.2026, 25 pages)"
ALLERGEN_GUIDE_URL = "https://dimt.co.uk/wp-content/uploads/dim-t-main-menu-allergens-14.08.2026-v1.pdf"
MAY_CONTAIN_PUBLISHED = True
NOTE = ("dim t prints calories only, one value per dish as served: no protein, carbs, fat or portion sizes (dim sum baskets and ice cream "
        "scoops excepted). Not listed: drinks, kids and lunch menus, and Thai spicy basil fried rice and Pad kee mao (values differ between "
        "its calorie list and its menu). Crispy Thai fish is not on the August 2026 menu.")
EXPECTED_ITEMS = 100
EXPECTED_SECTIONS = [("Small Eats", 12), ("Bau Buns", 4), ("Handmade Dim sum", 11), ("Speciality", 3), ("Curries", 6), ("Specialities", 11),
                     ("Plant-based Chicken Specialties", 3), ("Noodles & Rice", 26), ("Ramen & Soups", 6), ("Salads", 2), ("Sides", 6),
                     ("Desserts", 10)]
CATEGORY = {"Small Eats": "Small eats", "Bau Buns": "Bao buns", "Handmade Dim sum": "Handmade dim sum", "Speciality": "Handmade dim sum",
            "Curries": "Curries", "Specialities": "Specialities", "Plant-based Chicken Specialties": "Plant-based chicken specialities",
            "Noodles & Rice": "Noodles & rice", "Ramen & Soups": "Ramen & soups", "Salads": "Salads", "Sides": "Sides", "Desserts": "Desserts"}
# Dishes on the calorie list that are not printed on the August 2026 menu (value and why); stop if they appear there.
NOT_ON_MENU = {"Crispy Thai fish": "not on the August 2026 menu or the no-calories menu (it is in the allergen guide)",
               "Bao buns with Plant-based Chicken (as an option)": "an option of the Korean fried chicken bao (menu mark 'veo'); no own line"}
# Marks the menu prints after a dish name: (v) vegetarian, (vo) vegetarian option, (ve) vegan, (veo) vegan option, (ng) non gluten, (ngo) option,
# (h) halal, (ho) halal option. 'g' is printed after the beef variants ("beef g 775kcal"); the key does not explain it and it is ignored.
MARKS = {"v", "ve", "vo", "veo", "ng", "ngo", "h", "ho", "g"}
PORK = re.compile(r"\b(pork|bacon|ham|sausage|chorizo|salami|pepperoni)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|wagyu)\b", re.I)
EXPECTED_PORK_WORDS, EXPECTED_BEEF_WORDS = 9, 14   # on the menu's food pages (before the TEAS heading)

DIM_SUM_BASKET = ("Basket of 3", "Each basket contains 3 of the same delicious, steamed dumplings")
SCOOPS_SAUCE = ("2 scoops with hot chocolate sauce", "two scoops, hot chocolate sauce")
SCOOPS = ("2 scoops", "two scoops")


def E(section, printed, name, label, serving=None, veg=None, desc=None, parent=None):
    """section/printed = the calorie list's heading and dish name; name = ours; label = what the menu prints right before 'NNNkcal'
    (dish name and marks; '' when the value stands alone on its line; None when the menu does not print the dish); serving = (text, phrase
    the menu must print); veg = a snippet proving a vegetarian/vegan claim that the label's own marks don't carry; desc = a menu phrase that
    states the meat (used for the pork/beef tags); parent = for a variant line ("chicken h 820kcal") the printed heading it sits under on the
    menu (HEADINGS), because a bare variant label is the same under every dish."""
    return dict(section=section, printed=printed, name=name, label=label, serving=serving, veg=veg, desc=desc, parent=parent)


SE, BB, DS, SP, CU, SC, PB, NR, RS, SA, SI, DE = ("Small Eats", "Bau Buns", "Handmade Dim sum", "Speciality", "Curries", "Specialities",
                                                  "Plant-based Chicken Specialties", "Noodles & Rice", "Ramen & Soups", "Salads", "Sides", "Desserts")
ENTRIES = [
    E(SE, "Thai Prawn crackers", "Thai prawn crackers", "Thai prawn crackers"),
    E(SE, "Edamame", "Edamame", "Edamame ve, ng"),
    E(SE, "Spicy Edamame", "Spicy edamame", "Spicy edamame ve"),
    E(SE, "Vegetable spring rolls", "Vegetable spring rolls", "Spring rolls vegetable v"),
    E(SE, "Duck Spring Rolls", "Duck spring rolls", "Duck spring rolls"),
    E(SE, "Vegetable Gyoza", "Vegetable gyoza", "Gyoza vegetable v"),
    E(SE, "Chicken Gyoza", "Chicken gyoza", "Gyoza chicken h"),
    E(SE, "Chicken Satay", "Chicken satay", "Chicken satay h"),
    E(SE, "Five Spice Squid", "Five spice squid", "Five spice squid"),
    E(SE, "Crispy pork belly bites", "Crispy pork belly bites", "Crispy pork belly bites"),
    E(SE, "Crispy salt & pepper tofu", "Crispy salt & pepper tofu", "Crispy salt & pepper tofu ve"),
    E(SE, "Wonton soup", "Wonton soup", "Wagyu wonton soup", desc="wontons filled with Wagyu beef"),
    E(BB, "Korean fried chicken", "Korean fried chicken bao", "Korean fried chicken h, veo"),
    E(BB, "Bao buns with Plant-based Chicken (as an option)", "Bao buns with plant-based chicken (as an option)", None,
      veg="Korean fried chicken h, veo 258kcal"),
    E(BB, "Crispy duck", "Crispy duck bao", "Crispy duck"),
    E(BB, "Crispy pork belly", "Crispy pork belly bao", "Crispy pork belly"),
    E(DS, "Prawn", "Prawn dim sum", "Prawn", DIM_SUM_BASKET),
    E(DS, "Prawn, Peanut & Coriander", "Prawn, peanut & coriander dim sum", "Prawn, peanut & coriander", DIM_SUM_BASKET),
    E(DS, "Spicy Prawn", "Spicy prawn dim sum", "Spicy prawn", DIM_SUM_BASKET),
    E(DS, "Scallop & Prawn", "Scallop & prawn dim sum", "Scallop & prawn", DIM_SUM_BASKET),
    E(DS, "Pork & Prawn", "Pork & prawn dim sum", "Pork & prawn", DIM_SUM_BASKET),
    E(DS, "Spinach & Mushroom", "Spinach & mushroom dim sum", "Spinach & mushroom ve", DIM_SUM_BASKET),
    E(DS, "Spicy Vegetable", "Spicy vegetable dim sum", "Spicy vegetable ve", DIM_SUM_BASKET),
    E(DS, "Korean beef", "Korean beef dim sum", "Korean beef", DIM_SUM_BASKET),
    E(DS, "Duck & Ginger", "Duck & ginger dim sum", "Duck & ginger", DIM_SUM_BASKET),
    E(DS, "Chicken, Cashew & Coriander", "Chicken, cashew & coriander dim sum", "Chicken, cashew & coriander h", DIM_SUM_BASKET),
    E(DS, "Teriyaki chicken", "Teriyaki chicken dim sum", "Chicken teriyaki h", DIM_SUM_BASKET),
    E(SP, "Truffle Edamame", "Truffle edamame dim sum", "Truffle edamame v", DIM_SUM_BASKET),
    E(SP, "Spicy wagyu beef", "Spicy wagyu beef dim sum", "Spicy Wagyu beef", DIM_SUM_BASKET),
    E(SP, "Char siu pork", "Char siu pork buns", "Char siu pork buns (Basket of 2)", ("Basket of 2", "Char siu pork buns (Basket of 2)")),
    E(CU, "Chicken Katsu Curry", "Chicken katsu curry", "Chicken katsu curry h"),
    E(CU, "Thai green curry chicken", "Thai green curry chicken", "chicken h", parent="Thai green curry"),
    E(CU, "Thai green curry prawn", "Thai green curry prawn", "prawn", parent="Thai green curry"),
    E(CU, "Penang curry Chicken", "Penang curry chicken", "chicken h", parent="Panang curry"),
    E(CU, "Penang curry Prawn", "Penang curry prawn", "prawn", parent="Panang curry"),
    E(CU, "Rendang Beef", "Rendang beef", "Rendang curry"),
    E(SC, "Thai Cashew stir fry - Chicken", "Thai cashew stir fry - Chicken", "chicken h", parent="Thai cashew stir-fry"),
    E(SC, "Thai Cashew stir fry - Beef", "Thai cashew stir fry - Beef", "beef g", parent="Thai cashew stir-fry"),
    E(SC, "Thai Cashew stir fry - Prawn", "Thai cashew stir fry - Prawn", "prawn", parent="Thai cashew stir-fry"),
    E(SC, "Thai Cashew stir fry - Tofu", "Thai cashew stir fry - Tofu", "tofu ve", parent="Thai cashew stir-fry"),
    E(SC, "Crispy Thai fish", "Crispy Thai fish", None),
    E(SC, "Crispy aromatic duck", "Crispy aromatic duck", "Crispy aromatic duck"),
    E(SC, "Korean fried chicken", "Korean fried chicken", "Korean fried chicken h, veo"),
    E(SC, "Korean fried Tofu", "Korean fried tofu", "Korean fried tofu ve"),
    E(SC, "Sweet & sour Chicken", "Sweet & sour chicken", "Sweet & sour chicken h, veo"),
    E(SC, "Spicy aubergine & cashew", "Spicy aubergine & cashew", "Spicy aubergine & cashew v"),
    E(SC, "Crispy shredded beef", "Crispy shredded beef", ""),
    E(PB, "Vegan Korean", "Vegan Korean", "Vegan Korean ve"),
    E(PB, "Vegan sweet & sour", "Vegan sweet & sour", "Vegan sweet & sour ve"),
    E(PB, "Vegetarian katsu curry", "Vegetarian katsu curry", "Vegetarian katsu curry v"),
    E(NR, "Phad Thai - Chicken", "Phad Thai - Chicken", "chicken h", parent="Phad Thai"),
    E(NR, "Phad Thai - Prawn", "Phad Thai - Prawn", "prawn", parent="Phad Thai"),
    E(NR, "Phad Thai - Chicken & Prawn", "Phad Thai - Chicken & Prawn", "chicken & prawn", parent="Phad Thai"),
    E(NR, "Phad Thai - Tofu", "Phad Thai - Tofu", "tofu", parent="Phad Thai"),
    E(NR, "Nasi goreng", "Nasi goreng", "Nasi Goreng h"),
    E(NR, "Thai spicy basil fried rice - Chicken", "Thai spicy basil fried rice - Chicken", "chicken h", parent="Thai spicy basil fried rice"),
    E(NR, "Thai spicy basil fried rice - Prawn", "Thai spicy basil fried rice - Prawn", "prawn", parent="Thai spicy basil fried rice"),
    E(NR, "Thai spicy basil fried rice - Beef", "Thai spicy basil fried rice - Beef", "beef g", parent="Thai spicy basil fried rice"),
    E(NR, "Thai spicy basil fried rice - Tofu", "Thai spicy basil fried rice - Tofu", "tofu ve", parent="Thai spicy basil fried rice"),
    E(NR, "Singapore fried noodles", "Singapore fried noodles", "Singapore fried noodles h, ng"),
    E(NR, "Pad kee Mao - Chicken (Thai drunken noodles)", "Pad kee Mao - Chicken (Thai drunken noodles)", "chicken h", parent="Pad kee mao"),
    E(NR, "Pad kee Mao - Beef (Thai drunken noodles)", "Pad kee Mao - Beef (Thai drunken noodles)", "beef g", parent="Pad kee mao"),
    E(NR, "Pad kee Mao - Prawn (Thai drunken noodles)", "Pad kee Mao - Prawn (Thai drunken noodles)", "prawn", parent="Pad kee mao"),
    E(NR, "Pad kee Mao - Tofu (Thai drunken noodles)", "Pad kee Mao - Tofu (Thai drunken noodles)", "tofu veo", parent="Pad kee mao"),
    E(NR, "Chow mien - Chicken", "Chow mien - Chicken", "chicken h", parent="Chow mein"),
    E(NR, "Chow mien - Prawn", "Chow mien - Prawn", "prawn", parent="Chow mein"),
    E(NR, "Chow mien - Beef", "Chow mien - Beef", "beef g", parent="Chow mein"),
    E(NR, "Chow mien - Tofu", "Chow mien - Tofu", "tofu ve", parent="Chow mein"),
    E(NR, "Yaki Soba Chicken", "Yaki soba chicken", "chicken h", parent="Yakisoba"),
    E(NR, "Yaki Soba Beef", "Yaki soba beef", "beef g", parent="Yakisoba"),
    E(NR, "Yaki Soba Prawn", "Yaki soba prawn", "prawn", parent="Yakisoba"),
    E(NR, "Yaki Soba Tofu", "Yaki soba tofu", "tofu v", parent="Yakisoba"),
    E(NR, "Bi Bim bap - veg", "Bi bim bap - veg", "vegetarian", parent="Bibimbap"),
    E(NR, "Bi Bim bap - chicken", "Bi bim bap - chicken", "chicken h", parent="Bibimbap"),
    E(NR, "Bi Bim bap - beef", "Bi bim bap - beef", "beef g", parent="Bibimbap"),
    E(NR, "Bi Bim bap - prawns", "Bi bim bap - prawns", "prawn", parent="Bibimbap"),
    E(RS, "BBQ roasted pork ramen", "BBQ roasted pork ramen", "BBQ roasted pork ramen"),
    E(RS, "Tom yum - Chicken", "Tom yum - Chicken", "chicken h", parent="Tom yum with rice noodles"),
    E(RS, "Tom yum - Prawn", "Tom yum - Prawn", "prawn", parent="Tom yum with rice noodles"),
    E(RS, "Tom yum - Tofu", "Tom yum - Tofu", "tofu", parent="Tom yum with rice noodles"),
    E(RS, "Tofu miso ramen", "Tofu miso ramen", "Tofu miso ramen ve"),
    E(RS, "Seafood Laksa", "Seafood laksa", "Seafood laksa"),
    E(SA, "Bang bang chicken salad", "Bang bang chicken salad", "Bang bang chicken salad h"),
    E(SA, "Mango & chicken salad", "Mango & chicken salad", "Mango & chicken salad h"),
    E(SI, "Spicy cucumber salad", "Spicy cucumber salad", "Spicy cucumber salad ve"),
    E(SI, "Stir fried egg noodles", "Stir-fried egg noodles", "Stir-fried egg noodles ve"),
    E(SI, "Coconut rice", "Coconut rice", "Coconut rice ve, ng"),
    E(SI, "Egg fried rice", "Egg fried rice", "Egg fried rice ve, ng"),
    E(SI, "Special fried rice", "Special fried rice", "Special fried rice", desc="pork, shrimp, chicken"),
    E(SI, "Steamed rice", "Steamed rice", "Steamed rice ve, ng"),
    E(DE, "Chocolate bento box", "Chocolate bento box", "Chocolate bento box v"),
    E(DE, "Fried ice cream", "Fried ice cream", "Fried ice-cream v"),
    E(DE, "Passionfruit & white chocolate cheesecake", "Passionfruit & white chocolate cheesecake", "cheesecake v"),
    E(DE, "Toffee Peanut sundae", "Toffee peanut sundae", "Toffee peanut sundae v"),
    E(DE, "Raspberry sorbet", "Raspberry sorbet", "Raspberry sorbet ve, ng", SCOOPS),
    E(DE, "ice cream vanilla", "Ice cream vanilla", "vanilla", SCOOPS_SAUCE, veg="Ice-cream v, ng", parent="Ice-cream v, ng"),
    E(DE, "Ice cream coconut", "Ice cream coconut", "coconut", SCOOPS_SAUCE, veg="Ice-cream v, ng", parent="Ice-cream v, ng"),
    E(DE, "Ice cream chocolate", "Ice cream chocolate", "chocolate", SCOOPS_SAUCE, veg="Ice-cream v, ng", parent="Ice-cream v, ng"),
    E(DE, "Chocolate torte, coconut ice cream", "Chocolate torte, coconut ice cream", "ice-cream ng"),
    E(DE, "Salted caramel ginger pudding", "Salted caramel ginger pudding", "pudding ve, ng"),
]
BOUNDARY = r"(?:^|\s{2,}|\d\.\d\d\s)"
# Dish headings the menu prints above variant lines (chicken / prawn / beef / tofu ...), longest first where one starts another.
HEADINGS = ["Thai spicy basil fried rice", "Pad kee mao", "Thai green curry", "Panang curry", "Thai cashew stir-fry", "Phad Thai", "Chow mein",
            "Yakisoba", "Bibimbap", "Tom yum with rice noodles", "Ice-cream v, ng"]
# Variant rows where the calorie list and the menu give the same values to two DIFFERENT dishes (found 2026-10-07): the calorie list has
# Thai spicy basil fried rice = chicken 820, prawn 725, beef 775, tofu 769 and Pad kee Mao = chicken 805, beef 734, prawn 627, tofu 756;
# the menu prints exactly the other way round (basil fried rice 805 / 627 / 734 / 756, Pad kee mao 820 / 725 / 775 / 769). The chain's
# own documents contradict each other and nothing says which is right, so all eight rows are held back (holdback.csv), never corrected.
EXPECTED_CONFLICTS = {"Thai spicy basil fried rice - Chicken", "Thai spicy basil fried rice - Prawn", "Thai spicy basil fried rice - Beef",
                      "Thai spicy basil fried rice - Tofu", "Pad kee Mao - Chicken (Thai drunken noodles)", "Pad kee Mao - Beef (Thai drunken noodles)",
                      "Pad kee Mao - Prawn (Thai drunken noodles)", "Pad kee Mao - Tofu (Thai drunken noodles)"}


def menu_count(lines: list[str], snippet: str) -> int:
    """How many menu lines print `snippet` (whitespace-flexible) at the start of a printed segment: line start, 2+ spaces or after a price."""
    pat = re.compile(BOUNDARY + r"\s+".join(re.escape(w) for w in snippet.split()) + r"(?!\w)")
    return sum(1 for ln in lines if pat.search(ln))


def marks_of(label: str) -> set:
    marks = set()
    for tok in reversed(label.split()):
        t = tok.rstrip(",")
        if t in MARKS and len(label.split()) > 1:
            marks.add(t)
        else:
            break
    return marks


def build_items(sections: list, menu_text: str, columns: list) -> tuple:
    got = [(s, len(rows)) for s, rows in sections]
    if got != EXPECTED_SECTIONS:
        raise SystemExit(f"The calorie list's headings or row counts changed: now {got}, expected {EXPECTED_SECTIONS}")
    printed = {}
    for sec, rows in sections:
        for name, kcal in rows:
            if (sec, name) in printed:
                raise SystemExit(f"{name!r} is printed twice under {sec!r}")
            printed[(sec, name)] = kcal
    table = {(e["section"], e["printed"]): e for e in ENTRIES}
    if len(table) != len(ENTRIES):
        raise SystemExit("ENTRIES has a duplicate (section, printed name)")
    new, gone = sorted(set(printed) - set(table)), sorted(set(table) - set(printed))
    if new or gone:
        raise SystemExit(f"The calorie list changed. Printed but not in ENTRIES: {new}. In ENTRIES but no longer printed: {gone}.")
    if [(e["section"], e["printed"]) for e in ENTRIES] != [(s, n) for s, rows in sections for n, _ in rows]:
        raise SystemExit("ENTRIES is not in the calorie list's printed order")
    lines = [ln.replace("\t", "    ") for ln in menu_text.splitlines()]
    flat = " ".join(menu_text.split())
    food_end = menu_text.index("TE AS")  # the menu's drinks start at the TEAS heading
    food = menu_text[:food_end]
    pork_n, beef_n = len(PORK.findall(food)), len(BEEF.findall(food))
    if (pork_n, beef_n) != (EXPECTED_PORK_WORDS, EXPECTED_BEEF_WORDS):
        raise SystemExit(f"The menu's pork/beef wording changed (pork {pork_n}, beef {beef_n}): re-check the contains_pork/contains_beef tags")
    items = []
    conflicts = {}
    for e in ENTRIES:
        kcal = printed[(e["section"], e["printed"])]
        label = e["label"]
        notes = [f"Calorie list: {e['printed']!r} under {e['section']!r} = {kcal}"]
        marks = set()
        if label is None:
            if f"{kcal}kcal" in flat.replace(" kcal", "kcal"):
                raise SystemExit(f"{e['printed']}: {kcal}kcal is now printed on the menu: add its label to ENTRIES and re-check")
            notes.append(f"Not on the menu PDF: {NOT_ON_MENU[e['printed']]}")
        else:
            snippet = (label + " " if label else "") + f"{kcal}kcal"
            n = menu_count(lines, snippet)
            if n != 1:
                raise SystemExit(f"{e['printed']}: the menu prints {snippet!r} {n} times (expected once): the menu and the calorie list disagree or changed")
            marks = marks_of(label)
            notes.append(f"Menu prints {snippet!r}")
            if e["parent"]:
                pat = re.compile(BOUNDARY + r"\s+".join(re.escape(w) for w in snippet.split()) + r"(?!\w)")
                under = pdf_reader.variant_hits(columns, HEADINGS, pat)
                if len(under) != 1 or not under[0]:
                    raise SystemExit(f"{e['printed']}: cannot tell which dish heading {snippet!r} sits under on the menu (found under {under})")
                if under[0] != e["parent"]:
                    conflicts[e["printed"]] = (slug(e["name"]), f"dim t's calorie list gives {kcal} kcal to this dish, but its August 2026 menu prints "
                                               f"{snippet!r} under '{under[0]}', not under '{e['parent']}': the chain's own documents contradict each other")
                    notes.append(f"CONFLICT: menu prints it under {under[0]!r}")
                else:
                    notes.append(f"under {under[0]!r} on the menu")
        tags = []
        is_veg = bool(marks & {"v", "ve"}) or label == "vegetarian"
        if e["veg"]:
            if menu_count(lines, e["veg"]) != 1:
                raise SystemExit(f"{e['printed']}: the menu no longer prints {e['veg']!r}")
            is_veg = True
            notes.append(f"Vegetarian from the printed {e['veg']!r}")
        if is_veg:
            tags.append("vegetarian")
        text = e["name"] + " " + (e["desc"] or "")
        if e["desc"] and " ".join(e["desc"].split()) not in flat:
            raise SystemExit(f"{e['printed']}: the menu no longer prints {e['desc']!r}")
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        serving = ""
        if e["serving"]:
            serving, phrase = e["serving"]
            if " ".join(phrase.split()) not in flat:
                raise SystemExit(f"{e['printed']}: the menu no longer prints {phrase!r} (the serving)")
        items.append(dict(name=e["name"], category=CATEGORY[e["section"]], serving=serving, calories=kcal, tags="|".join(tags),
                          rankable=False, notes="; ".join(notes)))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    if set(conflicts) != EXPECTED_CONFLICTS:
        raise SystemExit(f"Rows where the menu and the calorie list disagree changed: now {sorted(conflicts)}, expected {sorted(EXPECTED_CONFLICTS)}. "
                         "Re-read both PDFs and update EXPECTED_CONFLICTS (never publish a row the two documents contradict).")
    return items, [conflicts[k] for k in sorted(conflicts)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("calories_pdf", type=Path, help="the calorie list (SOURCE_URL)")
    ap.add_argument("menu_pdf", type=Path, help="the printed main menu with calories (dim-t-main-menu-August-2026.pdf)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--allergen-pdf", type=Path, help="the allergen guide PDF (only to print its SHA-256)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for label, p in (("calorie PDF", args.calories_pdf), ("menu PDF", args.menu_pdf), ("allergen PDF", args.allergen_pdf)):
        if p:
            print(f"{label} sha256 {sha256_file(p)}  {p}")
    sections = pdf_reader.read_calories(args.calories_pdf)
    items, holdback = build_items(sections, pdf_reader.layout_text(args.menu_pdf), pdf_reader.column_lines(args.menu_pdf))
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Dim T", cuisine="Asian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories", holdback=holdback)
    cats = []
    for i in items:
        if i["category"] not in cats:
            cats.append(i["category"])
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {sum(1 for i in items if i['category'] == c)}" for c in cats))
    print(f"held back {len(holdback)}: " + ", ".join(h[0] for h in holdback))
    print(f"vegetarian {sum('vegetarian' in i['tags'] for i in items)}, pork {sum('contains_pork' in i['tags'] for i in items)}, "
          f"beef {sum('contains_beef' in i['tags'] for i in items)}")


if __name__ == "__main__":
    main()
