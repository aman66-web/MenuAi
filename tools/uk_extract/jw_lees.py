#!/usr/bin/env python3
"""Build data/source/jw-lees/ from JW Lees' four official "Allergen & Calorie" pub menu PDFs, Autumn 2026 (a CALORIES-ONLY chain with
complete allergens).

    python3 tools/uk_extract/jw_lees.py DIR --checked-on 2026-10-08 [--out DIR]

DIR holds the four PDFs under the names the chain's own page links (one download each, robots.txt of jwlees.co.uk: `Disallow:` empty):
    https://www.jwlees.co.uk/pubs-main-spring-26  (page title "Pubs Menus - Autumn 26", heading "Autumn 2026 Allergen and Calorie Menu";
    buttons "Main Menu", "Pub Lunch", "Cosy Menu", "Children's Menu")
    Pubs-main-menu-AKs-7-10-26.pdf      https://www.jwlees.co.uk/wp-content/uploads/2026/10/Pubs-main-menu-AKs-7-10-26.pdf   (7 pages, created 2026-10-07)
    Pub-Lunch-AKs-7-10-26.pdf           https://www.jwlees.co.uk/wp-content/uploads/2026/10/Pub-Lunch-AKs-7-10-26.pdf        (2 pages, served 2026-10-07)
    Pubs-Cosy-menu-AKs-110926-b.pdf     https://www.jwlees.co.uk/wp-content/uploads/2026/09/Pubs-Cosy-menu-AKs-110926-b.pdf  (2 pages, created 2026-09-11)
    Pubs-Childrens-AKs-Autumn-26.pdf    https://www.jwlees.co.uk/wp-content/uploads/2026/09/Pubs-Childrens-AKs-Autumn-26.pdf (2 pages, created 2026-09-15)
Needs `pdftotext` (poppler). The PDFs are read as blocks of text lines: see jw_lees_pdf.py.

The guides print ONE energy figure per dish ("Energy: 175 kcal") and, below it, "YES:" (contains) and "MAY CONTAIN:" allergen lists. No
protein, carbs, fat, salt, kJ or weight are printed, so every item is calories-only (docs/DATA.md "Calories-only chains"). Calories are
copied as printed ("1,041" is a thousands comma and becomes 1041). Only the dish NAMES (the PDFs run the name and the description into one
line), categories and tags are written by hand, in the tables below: the script stops if the dishes or headings printed in a PDF differ
from the tables (a dish added, removed, renamed or moved, a block with no or two energy values), so a human re-checks them when JW Lees
publishes a new menu (the menus change every season, with new file names).

What is published, what is not (each exclusion is written down here and counted in the run's output):
- NOT listed: "Soup of the day" on the Main menu (the PDF prints "Energy: Energy not supplied" and "ALLERGENS: See server for details").
- Options printed as "WITH ..." / "With children's ..." / "On White bread" carry their OWN figure and no price or total: each is an item of its
  own named "<option> (with <dish>)" or "(side option)" (the PDF does not say whether the dish's figure already includes it, so nothing is added).
- The same dish printed on two menus (Chicken Caesar salad on Pub Lunch and Cosy; the apple crumble and the three scoops of ice cream on Main
  and Cosy) with identical energy and allergens is listed once, under the first menu it appears on (the script stops if the two prints differ).
- HELD BACK (listed in items.csv and holdback.csv, never published): both portions of John Willies beer battered fish (the guide prints the same
  1316 kcal for "small" and "large"), and Cosy "Two scoops of ice cream" (44 kcal, while the same page prints 206 to 233 kcal for ONE scoop).
- NOT held back although they look odd (we never judge a number, only contradictions inside the guide): Main "Chilli cheese nachos" 175 kcal and
  "WITH Fried Eggs" 4 kcal. Both are in the report for the founder.
- Names: the guide's name and description are one run-in line, so the name is the part before the description where the guide's own comma or
  wording marks it, otherwise the whole phrase; the diet codes and asterisks are dropped from the name (the printed line stays in `notes`).
  "RFALO" is printed for the "Room for a little one" smaller puddings (the Main menu's own section title).
- Tags: `vegetarian` when the dish text ENDS with a code V or VG, or the dish says Vegan / Plant based. The PDFs do not define the codes; VGA is
  not tagged (the dishes it marks, e.g. "Farmhouse sausage rings (VGA)", contain meat or dairy as printed). A code in the middle of the text
  ("... cheese & chive sauce (V) or gravy") may refer to one part of the dish: not tagged. `contains_pork` / `contains_beef` only when the
  printed text names pork, bacon, ham, gammon, sausage, chipolata, "pigs in blankets" / beef, steak, sirloin, rump ("Vegan/Plant based sausage"
  excepted). "Meat type not stated": see MEAT_NOT_STATED.

Allergens (docs/DATA.md "Allergens"): every published dish has its allergens read from the same PDF ("YES:" = contains, "MAY CONTAIN:" =
possible cross-contact, as the Main menu's legend says). A dish with NO "YES:" or "MAY CONTAIN:" line has none marked: the guide's format
prints a line only when there is something to say (peas carry "YES: Milk", baked beans and gravy carry nothing), and docs/DATA.md defines an
empty `contains` as "the guide marks none of the 14". The words are looked up in common._A: an unknown word stops the run.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import jw_lees_pdf as pdf_reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "jw-lees"
SOURCE_URL = "https://www.jwlees.co.uk/pubs-main-spring-26"
SOURCE_TITLE = ("JW Lees Pubs Menus Autumn 2026, allergen and calorie guides (PDFs: Main and Pub Lunch 7 Oct 2026, Cosy 11 Sep 2026, "
                "Children's 15 Sep 2026)")
ALIASES = ["jw lees", "j w lees", "j.w. lees", "jw lees pubs", "j w lees pubs"]
GUIDE_TITLE = "JW Lees Pubs Menus Autumn 2026: allergen and calorie guides (Main, Pub Lunch, Cosy and Children's menus)"
MAY_CONTAIN_PUBLISHED = True  # every menu prints "MAY CONTAIN:" lists; the Main legend: "MAY CONTAIN = possible cross-contact"
NOTE = ("Calories only: one figure per dish, from JW Lees' Autumn 2026 pub menu guides; protein, carbs and fat are not published. Items shown "
        "as options (with ..., bread) carry their own figure. A dish with no allergen line there has none marked. The Main menu's soup of the "
        "day has no figure and is not listed.")
FILES = {
    "main": "Pubs-main-menu-AKs-7-10-26.pdf",
    "lunch": "Pub-Lunch-AKs-7-10-26.pdf",
    "cosy": "Pubs-Cosy-menu-AKs-110926-b.pdf",
    "kids": "Pubs-Childrens-AKs-Autumn-26.pdf",
}
MENU_LABEL = {"main": "Main menu", "lunch": "Pub lunch", "cosy": "Cosy menu", "kids": "Children's menu"}

PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausages?|chipolatas?|pigs)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|sirloin|rump)\b", re.I)
VEGAN_SAUSAGE = re.compile(r"\b(vegan|plant based) sausages?\b", re.I)
GAMMON_STEAK = re.compile(r"\bgammon steak\b", re.I)
# Dishes with meat that the printed text does not name (no pork / beef tag possible): reported as "meat type not stated".
MEAT_NOT_STATED = {"Chilli cheese nachos", "Hot roast bap of the day", "Black pudding fritters"}

HELD_FISH = ("The guide prints the same energy (1316 kcal) for the small and the large portion of John Willies beer battered fish, so at "
             "least one of the two figures is wrong: not published")
HELD_SCOOPS = ("The Cosy menu prints 44 kcal for 'Two scoops of ice cream' but 206 to 233 kcal for ONE scoop of each flavour on the same page: "
               "the guide contradicts itself, not published")

# ----------------------------------------------------------------------------------------------- the tables
# ("T", exact line)             title lines at the top of a PDF
# ("H", exact heading, category) a section heading; the dishes below it get that category
# ("D", text the first line starts with, name, options)
#    options: serving, note, hold (reason), dup (the dish is printed on an earlier menu: the two prints must be identical), exclude (reason)


class Table:
    def __init__(self) -> None:
        self.rows: list = []
        self.cat = ""

    def t(self, text: str) -> None:
        self.rows.append(("T", text))

    def h(self, text: str, cat: str) -> None:
        self.cat = cat
        self.rows.append(("H", text, cat))

    def d(self, prefix: str, name: str, **opts) -> None:
        self.rows.append(("D", prefix, name, dict(opts, cat=self.cat)))


def main_table() -> list:
    T = Table()
    T.t("PUBS MAIN MENU | ALLERGENS & ENERGY")
    T.t("Autumn 2026 • Compact reference menu")
    T.t("YES = contains allergen | MAY CONTAIN = possible cross-contact")
    T.h("STARTERS", "Main menu: Starters")
    T.d("Chilli cheese nachos Chilli con carne", "Chilli cheese nachos", note="Printed 175 kcal: looks low for the dish, copied as printed; the same figure is printed for the garlic prawns add-on")
    T.d("Warm pork pie, pickles", "Warm pork pie, pickles and apple & ale chutney")
    T.d("Crispy fried whitebait", "Crispy fried whitebait, lemon & dill aioli")
    T.d("Sticky pork belly bites", "Sticky pork belly bites with stout BBQ glaze")
    T.d("Thai honey halloumi fries", "Thai honey halloumi fries")
    T.d("Button mushrooms in a creamy Stilton sauce", "Button mushrooms in a creamy Stilton sauce")
    T.d("Salt & pepper chicken fries", "Salt & pepper chicken fries")
    T.d("Spiced cauliflower fritters", "Spiced cauliflower fritters")
    T.d("Soup of the day", "Soup of the day", exclude="the guide prints 'Energy not supplied' and 'See server for allergens'")
    T.d("Honey baked camembert", "Honey baked camembert")
    T.d("Warm breads, houmous, beetroot relish", "Warm breads, houmous, beetroot relish, gooey cheese dipping sauce, pressed rapeseed and balsamic glaze")
    T.h("PUB CLASSICS", "Main menu: Pub classics")
    T.d("Our legendary cheese & onion pie", "Cheese & onion pie")
    T.d("WITH Baked Beans", "Baked beans (with cheese & onion pie)", note="Option printed under the pie with its own figure")
    T.d("With Garden peas", "Garden peas (with cheese & onion pie)", note="Option printed under the pie with its own figure")
    T.d("WITH Mushy peas", "Mushy peas (with cheese & onion pie)", note="Option printed under the pie with its own figure")
    T.d("WITH Gravy", "Gravy (with cheese & onion pie)", note="Option printed under the pie with its own figure")
    T.d("With Cheese and chive sauce", "Cheese & chive sauce (with cheese & onion pie)", note="Option printed under the pie with its own figure")
    T.d("Slow braised steak & JW Lees ale pie", "Slow braised steak & JW Lees ale pie")
    T.d("Fish pie with cheesy mash topping", "Fish pie with cheesy mash topping")
    T.d("John Willies beer battered Fish, thick cut chips and mushy peas * (small)", "John Willies beer battered fish (small)", serving="Small", hold=HELD_FISH)
    T.d("John Willies beer battered Fish, thick cut chips and mushy peas * (large)", "John Willies beer battered fish (large)", serving="Large", hold=HELD_FISH)
    T.d("Northern Upgrade", "Northern Upgrade")
    T.d("Chicken tikka curry", "Chicken tikka curry")
    T.d("Grilled fillet of seabass & garlic prawns", "Grilled fillet of seabass & garlic prawns")
    T.d("Philly cheesesteak sandwich", "Philly cheesesteak sandwich")
    T.d("Spiced Moroccan sweet potato", "Spiced Moroccan sweet potato & chick pea stew")
    T.d("Nourish bowl", "Nourish bowl")
    T.h("COMFORT FOOD", "Main menu: Comfort food")
    T.d("Farmhouse sausage rings", "Farmhouse sausage rings")
    T.d("Vegan sausage & mash", "Vegan sausage & mash")
    T.d("Slow braised minted lamb Henry", "Slow braised minted lamb Henry")
    T.d("Honey glazed braised ham hock", "Honey glazed braised ham hock")
    T.d("Half roast chicken dinner", "Half roast chicken dinner")
    T.h("BURGERS", "Main menu: Burgers")
    T.d("Brewery Tower burger", "Brewery Tower burger")
    T.d("Buttermilk chicken burger", "Buttermilk chicken burger")
    T.d("Garden burger", "Garden burger")
    T.h("GRILLS", "Main menu: Grills")
    T.d("Brewers mixed grill", "Brewers mixed grill")
    T.d("Grilled 10oz half moon gammon steak", "Grilled 10oz half moon gammon steak")
    T.d("WITH Fried Eggs", "Fried eggs (with gammon steak)", note="Option printed under the gammon steak with its own figure; 4 kcal looks low for fried eggs, copied as printed")
    T.d("WITH Grilled pineapple", "Grilled pineapple (with gammon steak)", note="Option printed under the gammon steak with its own figure")
    T.d("Grilled 8oz Black Angus Sirloin steak", "Grilled 8oz Black Angus Sirloin steak")
    T.d("Peppercorn sauce", "Peppercorn sauce")
    T.d("Surf your turf add garlic prawns", "Surf your turf add garlic prawns", note="Same printed figure (175) as the Chilli cheese nachos")
    T.d("Mushroom & Stilton cream sauce", "Mushroom & Stilton cream sauce")
    T.h("SIDES", "Main menu: Sides")
    T.d("Ale battered onion rings", "Ale battered onion rings with BBQ dipping sauce")
    T.d("Buttered seasonal greens", "Buttered seasonal greens")
    T.d("Honey roasted root vegetables", "Honey roasted root vegetables")
    T.d("Cheesy Garlic & Herb Ciabatta", "Cheesy Garlic & Herb Ciabatta")
    T.d("Garden salad with classic vinaigrette", "Garden salad with classic vinaigrette")
    T.d("Our famous Messy chips", "Messy chips")
    T.d("Skinny Fries with Garlic Mayo", "Skinny fries with garlic mayo")
    T.d("Baked Cauliflower, three cheese sauce", "Baked cauliflower, three cheese sauce")
    T.d("Thick cut chips with garlic mayo", "Thick cut chips with garlic mayo")
    T.d("Pigs in Blankets", "Pigs in blankets")
    T.d("Ruffled roasties", "Ruffled roasties")
    T.d("Sage & onion stuffing", "Sage & onion stuffing")
    T.h("PUDDINGS", "Main menu: Puddings")
    T.d("Salted caramel & dark chocolate tart with clotted", "Salted caramel & dark chocolate tart with clotted cream ice cream")
    T.d("Vegan Salted caramel & dark chocolate tart", "Vegan salted caramel & dark chocolate tart with dairy free vanilla ice cream")
    T.d("Baked apple crumble", "Baked apple crumble with hot custard or pouring cream")
    T.d("Warm chocolate brownie", "Warm chocolate brownie, dark chocolate sauce and vanilla ice cream")
    T.d("Burnt Basque cheesecake, mulled berries", "Burnt Basque cheesecake, mulled berries and cream")
    T.d("Ginger & black pepper sponge pudding", "Ginger & black pepper sponge pudding with custard and raspberry sauce")
    T.d("Selection of ice creams", "Selection of ice creams with warm toffee sauce, wafer & marshmallows")
    T.d("Scoop of chocolate ice cream", "Scoop of chocolate ice cream")
    T.d("Scoop of vanilla Ice cream", "Scoop of vanilla ice cream")
    T.d("Scoop of strawberry ice cream", "Scoop of strawberry ice cream")
    T.h("ROOM FOR A LITTLE ONE", "Main menu: Room for a little one")
    T.d("RFALO Burnt Basque cheesecake", "Burnt Basque cheesecake (Room for a little one)")
    T.d("RFALO Chocolate brownie", "Chocolate brownie with chocolate sauce (Room for a little one)")
    T.d("RFALO Salted caramel & chocolate tart", "Salted caramel & chocolate tart with pouring cream (Room for a little one)")
    return T.rows


def lunch_table() -> list:
    T = Table()
    T.t("Pubs Lunch Menu | Allergen & Calorie Guide")
    T.t("Energy is displayed beside each dish, with YES and MAY CONTAIN allergens immediately below.")
    T.h("MAINS", "Pub lunch: Mains")
    T.d("Chicken New Yorker", "Chicken New Yorker")
    T.d("Honey baked ham, fried eggs", "Honey baked ham, fried eggs, thick cut chips & garden peas")
    T.d("Smoked haddock, mozzarella", "Smoked haddock, mozzarella & spring onion fishcakes")
    T.d("Chicken Caesar salad", "Chicken Caesar salad")
    T.d("Simple cheeseburger", "Simple cheeseburger")
    T.d("Spicy bean burger", "Spicy bean burger")
    T.h("HOT SANDWICHES", "Pub lunch: Hot sandwiches")
    T.d("Ale battered fish goujon bap", "Ale battered fish goujon bap")
    T.d("Ham, three cheese & apple chutney toastie", "Ham, three cheese & apple chutney toastie")
    T.d("Hot chicken tika wrap", "Hot chicken tika wrap")
    T.d("Hot roast bap of the day", "Hot roast bap of the day", note="The roast changes daily ('See server for todays roast')")
    T.h("SANDWICHES", "Pub lunch: Sandwiches")
    T.d("Cheese & red onion chutney sandwich", "Cheese & red onion chutney sandwich")
    T.d("Honey baked ham & mustard", "Honey baked ham & mustard sandwich", note="Printed 'Honey baked ham & mustard' under SANDWICHES; 'sandwich' added from the section title")
    T.d("Tuna Mayonnaise", "Tuna mayonnaise sandwich", note="Printed 'Tuna Mayonnaise' under SANDWICHES; 'sandwich' added from the section title")
    T.d("On White bread", "White bread (sandwich option)", note="Printed 'On White bread' under SANDWICHES with its own figure; the guide does not say whether the sandwich figures include bread")
    T.d("On Brown bread", "Brown bread (sandwich option)", note="Printed 'On Brown bread' under SANDWICHES with its own figure; the guide does not say whether the sandwich figures include bread")
    return T.rows


def cosy_table() -> list:
    T = Table()
    T.t("PUBS COSY MENU")
    T.t("Autumn 2026 • Starters, Mains and Puddings")
    T.h("STARTERS", "Cosy menu: Starters")
    T.d("Chefs soup of the day", "Chefs soup of the day with warm bread & butter", note="Printed '(See server for soup details)': the soup changes, one figure is printed")
    T.d("Bubble & squeak potato cake", "Bubble & squeak potato cake, poached egg and streaky bacon")
    T.d("Black pudding fritters", "Black pudding fritters with English mustard mayonnaise")
    T.d("Crispy breaded garlic mushrooms", "Crispy breaded garlic mushrooms with roast garlic mayonnaise")
    T.d("Gambas Pil Pil", "Gambas Pil Pil")
    T.h("MAINS", "Cosy menu: Mains")
    T.d("Grilled fillet of seabass, saute potatoes", "Grilled fillet of seabass, saute potatoes and buttered greens")
    T.d("Grilled 6oz sirloin steak", "Grilled 6oz sirloin steak, peppercorn sauce, onion rings and skinny fries")
    T.d("Wexford chicken", "Wexford chicken")
    T.d("Plant based sausage & mash", "Plant based sausage & mash")
    T.d("Chicken Caesar salad", "Chicken Caesar salad", dup="Chicken Caesar salad")
    T.h("PUDDINGS", "Cosy menu: Puddings")
    T.d("Baked apple crumble", "Baked apple crumble with hot custard or pouring cream", dup="Baked apple crumble with hot custard or pouring cream")
    T.d("Sticky toffee pudding", "Sticky toffee pudding with custard and toffee sauce")
    T.d("Melting chocolate Fudge Cake", "Melting chocolate fudge cake, vanilla ice cream & pouring cream")
    T.d("Lotus biscoff cheesecake", "Lotus Biscoff cheesecake & pouring cream")
    T.d("Two scoops of ice cream Choose from", "Two scoops of ice cream", hold=HELD_SCOOPS)
    T.d("Scoop of strawberry ice cream", "Scoop of strawberry ice cream", dup="Scoop of strawberry ice cream")
    T.d("Scoop of Vanilla ice cream", "Scoop of vanilla ice cream", dup="Scoop of vanilla ice cream")
    T.d("Scoop of chocolate ice cream", "Scoop of chocolate ice cream", dup="Scoop of chocolate ice cream")
    return T.rows


def kids_table() -> list:
    T = Table()
    T.t("CHILDREN’S MENU — ALLERGEN & ENERGY GUIDE")
    T.t("Pubs Children’s Menu | Autumn 2026")
    T.h("STARTERS", "Children's menu: Starters")
    T.d("Crunchy carrot sticks & apple with houmous", "Crunchy carrot sticks & apple with houmous dip")
    T.d("Cheesy garlic bread fingers", "Cheesy garlic bread fingers")
    T.h("MAINS", "Children's menu: Mains")
    T.d("Children's grilled beef burger", "Children's grilled beef burger and cheddar melt")
    T.d("Children's crispy battered fish goujons", "Children's crispy battered fish goujons")
    T.d("Children's chicken dippers", "Children's chicken dippers with ketchup")
    T.d("Children's pork chipolatas", "Children's pork chipolatas with gravy")
    T.d("Children's Penne pasta", "Children's penne pasta in tomato sauce with vegan mozzarella")
    T.d("Children's Mini tomato & mozzarella pizzas", "Children's mini tomato & mozzarella pizzas")
    T.d("Children's Little Sunday Roast", "Children's Little Sunday Roast (beef)")
    side = "Option printed under the children's mains with its own figure and no allergen line"
    T.d("With children's skinny fries", "Children's skinny fries (side option)", note=side)
    T.d("With children's thick cut chips", "Children's thick cut chips (side option)", note=side)
    T.d("With children's garden peas", "Children's garden peas (side option)", note=side)
    T.d("With children's seasonal vegetables", "Children's seasonal vegetables (side option)", note=side)
    T.d("With children's baked Beans", "Children's baked beans (side option)", note=side)
    T.d("With children's garden salad", "Children's garden salad (side option)", note=side)
    T.h("PUDDINGS", "Children's menu: Puddings")
    T.d("Warm Chocolate Fudge Cake", "Children's warm chocolate fudge cake & vanilla ice cream")
    T.d("Ice cream (Chocolate)", "Children's ice cream (chocolate)")
    T.d("Ice cream (Strawberry)", "Children's ice cream (strawberry)")
    T.d("Ice cream (Vanilla)", "Children's ice cream (vanilla)")
    return T.rows


TABLES = [("main", main_table), ("lunch", lunch_table), ("cosy", cosy_table), ("kids", kids_table)]
EXPECTED = {"main": 68, "lunch": 15, "cosy": 18, "kids": 19}  # "D" entries per PDF (the dishes the PDF prints)


def tags_for(printed: str) -> list:
    tags = []
    at_end, _inside = pdf_reader.diet_marks(printed)
    if "V" in at_end or "VG" in at_end or re.match(r"(Vegan|Plant based)\b", printed):
        tags.append("vegetarian")
    # Only the printed text counts (the name of an option such as "Fried eggs (with gammon steak)" names its parent dish, not the option).
    text = GAMMON_STEAK.sub("gammon", VEGAN_SAUSAGE.sub("", printed))  # a gammon steak is pork, not beef
    if PORK.search(text):
        tags.append("contains_pork")
    if BEEF.search(text):
        tags.append("contains_beef")
    return tags


def build(folder: Path) -> tuple:
    """-> (items, held list, excluded list, report lines)."""
    items, excluded, report, by_name = [], [], [], {}
    for key, make in TABLES:
        table = make()
        n_dishes = sum(1 for r in table if r[0] == "D")
        if n_dishes != EXPECTED[key]:
            raise SystemExit(f"{key}: the table lists {n_dishes} dishes, expected {EXPECTED[key]}")
        pdf = folder / FILES[key]
        for entry, p in pdf_reader.read_menu(pdf, table, key):
            _kind, _prefix, name, opts = entry
            where = f"{MENU_LABEL[key]}, {name}"
            if opts.get("exclude"):
                if p["kcal"] is not None or not p["server"]:
                    raise SystemExit(f"{where}: expected 'Energy not supplied' + 'See server', the PDF now prints more: update the table")
                excluded.append((where, opts["exclude"]))
                continue
            if p["kcal"] is None:
                raise SystemExit(f"{where}: no energy value printed: decide (exclude it in the table) after reading the PDF")
            if p["server"]:
                raise SystemExit(f"{where}: allergens say 'See server': the allergen guide is not complete for this dish")
            contains, cereals, nuts = allergen_words(p["yes"], f"{where} YES")
            may = allergen_words(p["may"], f"{where} MAY CONTAIN")[0]
            allergens = dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts)
            if opts.get("dup"):
                first = by_name.get(opts["dup"])
                if first is None or first["name"] != name:
                    raise SystemExit(f"{where}: marked as a repeat of {opts['dup']!r} but that dish was not listed earlier")
                if first["calories"] != p["kcal"] or first["allergens"] != allergens:
                    raise SystemExit(f"{where}: printed twice with different energy or allergens ({first['calories']} vs {p['kcal']}): decide and update the table")
                first["notes"] += f"; also printed on the {MENU_LABEL[key]} with the same energy and allergens"
                report.append(f"REPEAT not listed again: {where}")
                continue
            if name in by_name:
                raise SystemExit(f"{where}: name already used by another dish")
            at_end, inside = pdf_reader.diet_marks(p["printed"])
            note = [f"{where.split(',')[0]}, section {entry[3]['cat'].split(': ', 1)[1]}", f"printed {p['printed']!r}"]
            if at_end or inside:
                note.append("diet codes " + ("/".join(at_end) if at_end else "none at the end") + (f"; code inside the text: {'/'.join(inside)} (not used for tags)" if inside else ""))
            if not p["yes"] and not p["may"]:
                note.append("no allergen line printed: none marked")
            if name in MEAT_NOT_STATED:
                note.append("meat type not stated")
            if opts.get("note"):
                note.append(opts["note"])
            item = dict(name=name, category=opts["cat"], calories=p["kcal"], serving=opts.get("serving", ""), rankable=False,
                        tags="|".join(tags_for(p["printed"])), notes="; ".join(note), allergens=allergens, hold=opts.get("hold", ""))
            by_name[name] = item
            items.append(item)
    ids = [slug(i["name"]) for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"Item ids are not unique: {sorted({i for i in ids if ids.count(i) > 1})}")
    return items, excluded, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path, help="folder holding the four menu PDFs (names as in FILES)")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for key, fname in FILES.items():
        print(f"{key}: sha256 {sha256_file(args.folder / fname)}  {fname}")
    items, excluded, report = build(args.folder)
    guide = {"title": GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    holdback = [(slug(i["name"]), i["hold"]) for i in items if i["hold"]]
    out = write_chain_folder(chain_id=CHAIN_ID, name="JW Lees", cuisine="Pub", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES,
                             items=[{k: v for k, v in i.items() if k != "hold"} for i in items],
                             out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    if not holdback:
        (out / "holdback.csv").unlink(missing_ok=True)
    for where, why in excluded:
        report.append(f"NOT LISTED {where}: {why}")
    for h in holdback:
        report.append(f"HELD BACK {h[0]}: {h[1]}")
    cats = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print("meat type not stated: " + ", ".join(sorted(MEAT_NOT_STATED)))


if __name__ == "__main__":
    main()
