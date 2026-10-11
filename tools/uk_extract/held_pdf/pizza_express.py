#!/usr/bin/env python3
"""Build data/source/pizza-express/ from PizzaExpress UK's official "Nutritional Information: England, Wales & Scotland" PDF.

    python3 tools/uk_extract/pizza_express.py path/to/nutritionals.pdf --checked-on 2026-10-06

Numbers are copied from the PDF exactly as printed (per portion: kcal, fat, saturates, carbohydrates, sugars, fibre,
protein, salt; kJ and the per-100g columns are not used; a blank cell stays blank). Only names, categories and the notes
below are written by hand. EXPECTED_ROWS lists every row of the PDF (table title | name as printed); if PizzaExpress adds,
removes, renames or reorders a row this script stops and shows the difference, so a human re-checks names, categories
and the holdback list before running again.

Source (a new PDF is published about monthly; the link on the page changes with it):
  page  https://www.pizzaexpress.com/allergens-and-nutritionals  ("England, Wales & Scotland" > Nutritionals)
  file  https://content-cdn.pizzaexpress.com/files/lj3txstz/production/b72a05d52e0a11e8b6c37620bbf93cc170595598.pdf

Left out on purpose (Great Britain menu only): the Northern Ireland, Mac & Wings and Brixton / Finsbury Park / Earl's Court
PDFs (separate files, never read), and the "Breakfast: Airport Sites Only (Edinburgh & Gatwick)" section at the end of this
PDF (pages 21-24, 77 rows). Per-100g columns are ignored: only per-portion values are published.
"""
import argparse
import difflib
import csv
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pizza_express_pdf as pdf_reader  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "pizza-express"
SOURCE_URL = "https://content-cdn.pizzaexpress.com/files/lj3txstz/production/b72a05d52e0a11e8b6c37620bbf93cc170595598.pdf"
SOURCE_TITLE = "PizzaExpress Nutritional Information: England, Wales & Scotland (September 2026)"
BREAKFAST_BANNER = "Breakfast: Airport Sites Only"
# rows in the excluded breakfast section, by table title (checked so a change there is noticed too)
BREAKFAST_COUNTS = {"Breakfast eggs": 8, "Cooked Breakfast": 12, "Extras": 19, "Preserves & Dips": 6, "Pancakes & Pastries": 8,
                    "Pizzas": 7, "Smoothies & Juices": 5, "Piccolo": 12}

NOTE = ("Per portion as printed in PizzaExpress's guide (no slice sizes or weights are given). Rows marked Dine Out are the "
        "guide's separate figures for that recipe. Excludes the airport breakfast menu and a few restaurants with their own guide.")

# PDF table title -> how its rows become items. Pizza tables repeat the same dish names, so the name gets the table's size or
# base as a suffix ("American - Romana"); Piccolo (the children's menu) rows get a "Piccolo " prefix unless the PDF already has it.
TABLES = {
    "Dough Balls": dict(category="Starters"),
    "Starters": dict(category="Starters"),
    "Sides": dict(category="Sides"),
    "Pizzas- Classic": dict(category="Classic pizzas", suffix=" - Classic"),
    "Pizzas- Romana": dict(category="Romana pizzas", suffix=" - Romana"),
    "Pizzas- Large Classic": dict(category="Large Classic pizzas", suffix=" - Large Classic"),
    "Al Forno": dict(category="Al Forno"),
    "Leggera": dict(category="Leggera pizzas", suffix=" - Leggera"),
    "Salads": dict(category="Salads"),
    "Dips": dict(category="Dips & dressings", rankable=False),
    "Extra Toppings": dict(category="Extra toppings", suffix=" (extra topping)", rankable=False),
    "Desserts": dict(category="Desserts", rankable=False),
    "Drinks": dict(category="Drinks", rankable=False),
    "Hot Drinks": dict(category="Hot drinks", rankable=False),
    "Piccolo": dict(category="Piccolo", prefix="Piccolo "),
    "Piccolo – Pasta & Salad": dict(category="Piccolo", prefix="Piccolo "),
    "Piccolo - Pizzas": dict(category="Piccolo", prefix="Piccolo "),
    "Piccolo – Extra Toppings": dict(category="Piccolo", prefix="Piccolo ", suffix=" (extra topping)", rankable=False),
    "Piccolo - Drinks": dict(category="Piccolo", prefix="Piccolo ", rankable=False),
    "Piccolo - Desserts": dict(category="Piccolo", prefix="Piccolo ", rankable=False),
}

# Spelling and capitalisation tidy-ups of names (never numbers): (table title, name as printed) -> name shown.
NAME_FIXES = {
    ("Sides", "Halloumi bites"): "Halloumi Bites",
    ("Pizzas- Classic", "Double American cheese (Dine Out)"): "Double American Cheese (Dine Out)",
    ("Pizzas- Classic", "Double American cheese GF (Dine Out)"): "Double American Cheese GF (Dine Out)",
    ("Pizzas- Large Classic", "Double American cheese (Dine Out)"): "Double American Cheese (Dine Out)",
    ("Pizzas- Large Classic", "vegan Harissa Melanzane"): "Vegan Harissa Melanzane",
    ("Desserts", "Chocolate Fudge cake (Dine Out)"): "Chocolate Fudge Cake (Dine Out)",
    ("Desserts", "Lemon & Raspberry Cheesecake (Dine Out"): "Lemon & Raspberry Cheesecake (Dine Out)",
    ("Piccolo - Pizzas", "Margherita Light Mozz Altnerative"): "Margherita Light Mozz Alternative",
    ("Piccolo - Pizzas", "Ham & Mushorroms Light Mozz"): "Ham & Mushrooms Light Mozz",
}

# Sharing dishes are not one person's order, so "Best for you" never suggests them.
NOT_RANKABLE_NAME = re.compile(r"\bSharer\b|\bSharing\b", re.I)

# Tags come only from the item's name (the PDF has no ingredient lists or vegetarian marks).
PORK_WORDS = re.compile(r"\b(pepperoni|ham|bacon|sausage|pork|salami|chorizo|pancetta|nduja)\b", re.I)
BEEF_WORDS = re.compile(r"\b(beef|steak)\b", re.I)
# "Vegan" counts only when it describes the dish, not just the cheese ("Pollo Vegan Mozz Alternative" is a chicken pizza).
VEGAN_DISH = re.compile(r"\bvegan\b(?!\s+mozz)", re.I)

# Things worth knowing about a row as printed (kept in items.csv `notes`, not exported). (table title, name as printed) -> text.
NOTES = {
    ("Dough Balls", "GF Dough Balls with Garlic Butter"): "Same numbers as the Dine Out row of the same dish",
    ("Dough Balls", "GF Dough Balls with Garlic Butter (Dine Out)"): "Same numbers as the dine-in row of the same dish",
    ("Extra Toppings", "Mushrooms"): "Printed kJ (39) and kcal (3) do not agree; entered as printed",
    ("Extra Toppings", "Baby plum tomatoes"): "Printed kcal (11) and kJ (33, about 8 kcal) do not quite agree",
    ("Extra Toppings", "Artichokes"): "Printed macros add up to about 44 kcal; kcal and kJ agree with each other (fibre 4.8 g is not in that sum)",
    ("Extra Toppings", "Grilled Aubergine"): "Printed macros add up to about 37 kcal; kcal and kJ agree with each other (fibre 3.8 g is not in that sum)",
    ("Drinks", "Strawberry Sicilian Lemonade PE"): "Printed macros add up to about 52 kcal; kcal and kJ agree with each other",
    ("Drinks", "San Pellegrino Limonata"): "Printed macros add up to about 60 kcal; kcal and kJ agree with each other",
    ("Drinks", "Living Things Watermelon & Lime"): "Fibre (6.6 g) is more than carbohydrate (5.6 g); printed macros add up to about 22 kcal; kcal and kJ agree",
    ("Drinks", "Oasis Summer Fruits"): "Fibre cell is blank in the guide",
    ("Drinks", "Orange Juice"): "Held back: printed kcal 86 but kJ 198 (about 47 kcal)",
    ("Drinks", "Passion Fruit Still Lemonade"): "Held back: sugars 11.2 g are more than carbohydrate 9.4 g",
    ("Dips", "Garlic & Herbs dip"): "Held back: 112 kcal with only 1.1 g fat",
    ("Desserts", "Sicilian Lemon Delight"): "Held back: saturates 0.2 g with 0 g fat",
    ("Piccolo - Desserts", "Chocolate Brownie"): "Held back: 24.7 g fat for 251 kcal",
}

# Items the guide prints impossibly: not published, never corrected (id = the id this script gives the row).
HOLDBACK = {
    "garlic-and-herbs-dip": "The guide prints 112 kcal for this dip but only 1.1 g fat, 3.3 g carbohydrate and 0.4 g protein (about 25 kcal).",
    "orange-juice": "The guide prints 86 kcal but 198 kJ (about 47 kcal), and its own macros add up to about 41 kcal.",
    "passion-fruit-still-lemonade": "The guide prints 11.2 g of sugars with only 9.4 g of carbohydrate (sugars are part of carbohydrate).",
    "sicilian-lemon-delight": "The guide prints 0.2 g of saturates with 0 g of fat.",
    "piccolo-chocolate-brownie": "The guide prints 24.7 g of fat for 251 kcal (its macros add up to about 340 kcal).",
    "garlic-prawn-classic-2": "The Classic pizza table has a second 'Garlic Prawn' row (600 kcal, 18.5 g protein) that matches neither the first "
                              "(769 kcal, 42.6 g protein) nor the other sizes; it looks mislabelled.",
}

EXPECTED_ROWS = """
Dough Balls | Dough Balls Al Forno
Dough Balls | Dough Balls Al Forno GF
Dough Balls | Loaded Pesto Dough Balls
Dough Balls | Loaded Pesto Dough Balls (Dine Out)
Dough Balls | Loaded Pesto Dough Balls GF
Dough Balls | Loaded Pesto Dough Balls GF (Dine Out)
Dough Balls | Dough Balls with Garlic Butter
Dough Balls | Dough Balls with Garlic Butter (Dine Out)
Dough Balls | GF Dough Balls with Garlic Butter
Dough Balls | GF Dough Balls with Garlic Butter (Dine Out)
Dough Balls | Vegan Dough Balls with Garlic & Parsley spread
Dough Balls | GF Vegan Dough Balls with Garlic & Parsley spread
Dough Balls | Dough Balls Sharer
Dough Balls | Dough Balls Sharer (Dine Out)
Dough Balls | GF Dough Balls Sharer
Dough Balls | GF Dough Balls Sharer (Dine Out)
Dough Balls | Dough Balls Sharer Vegan
Dough Balls | Dough Balls Sharer Vegan (Dine Out)
Dough Balls | Dough Balls Sharer Vegan GF
Dough Balls | Dough Balls Sharer Vegan GF (Dine Out)
Dough Balls | Dynamite Dough Balls
Dough Balls | Dynamite Dough Balls GF
Dough Balls | Dynamite Dough Balls (Dine out)
Dough Balls | Dynamite Dough Balls GF (Dine out)
Starters | Olives Marinate
Starters | Roasted Tomatoes
Starters | Garlic Bread with Mozzarella
Starters | Garlic Bread with Mozzarella Sharer
Starters | Garlic Bread with Vegan Mozzarella Alternative
Starters | Garlic Bread with Vegan Mozzarella Alternative Sharer
Starters | Bruschetta Originale
Starters | Calamari
Starters | Calamari (Dine Out)
Starters | Lemon & Herbs Chicken Wings
Starters | Lemon & Herbs Chicken Wings (Dine Out)
Starters | Mozzarella Sticks
Starters | Mozzarella Sticks (Dine Out)
Starters | Sharing Trio
Starters | Sharing Trio (Dine Out)
Starters | Buttermilk Chicken Goujons
Starters | Cajun Prawns
Starters | Cajun Prawns GF
Starters | Caprese Salad
Starters | Truffle Cacio e Pepe Bites
Starters | Truffle Cacio e Pepe Bites (Dine Out)
Starters | Pepperoni Bites
Starters | Firecracker Chicken Wings
Starters | Firecracker Chicken Wings (Dine out)
Starters | Meatballs Al Forno
Sides | Polenta Chips
Sides | Polenta Chips (Dine Out)
Sides | Mixed Leaf Salad
Sides | Dough Sticks
Sides | Mac & Cheese
Sides | Mac & Cheese GF
Sides | Halloumi bites
Sides | Halloumi Bites (Dine Out)
Sides | Buttermilk Ranch Slaw
Pizzas- Classic | American
Pizzas- Classic | American GF
Pizzas- Classic | American Hot
Pizzas- Classic | American Hot GF
Pizzas- Classic | La Reine
Pizzas- Classic | La Reine GF
Pizzas- Classic | Sloppy Giuseppe
Pizzas- Classic | Sloppy Giuseppe GF
Pizzas- Classic | Fiorentina
Pizzas- Classic | Fiorentina GF
Pizzas- Classic | Padana
Pizzas- Classic | Padana GF
Pizzas- Classic | Padana Vegan
Pizzas- Classic | Padana Vegan GF
Pizzas- Classic | Pollo ad Astra
Pizzas- Classic | Pollo ad Astra GF
Pizzas- Classic | BBQ Burnt Ends
Pizzas- Classic | BBQ Burnt Ends GF
Pizzas- Classic | Smoky BBQ Chicken
Pizzas- Classic | Smoky BBQ Chicken GF
Pizzas- Classic | Double American cheese (Dine Out)
Pizzas- Classic | Double American cheese GF (Dine Out)
Pizzas- Classic | Garlic Prawn
Pizzas- Classic | Garlic Prawn GF
Pizzas- Classic | Funghi di Bosco
Pizzas- Classic | Funghi di Bosco GF
Pizzas- Classic | Vegan Funghi di Bosco
Pizzas- Classic | Vegan Funghi di Bosco GF
Pizzas- Classic | Margherita
Pizzas- Classic | Margherita GF
Pizzas- Classic | Garlic Prawn
Pizzas- Classic | Margherita Vegan
Pizzas- Classic | Margherita Vegan GF
Pizzas- Classic | Calabrian Feast
Pizzas- Classic | Calabrian Feast GF
Pizzas- Classic | Giardiniera
Pizzas- Classic | Giardiniera GF
Pizzas- Classic | Vegan Harissa Melanzane
Pizzas- Classic | Vegan Harissa Melanzane GF
Pizzas- Classic | Vegan Giardiniera
Pizzas- Classic | Vegan Giardiniera GF
Pizzas- Classic | Calabrese
Pizzas- Classic | Calabrese GF
Pizzas- Classic | Moroccan Chicken
Pizzas- Classic | Moroccan Chicken GF
Pizzas- Classic | Meatball Italiano
Pizzas- Classic | Meatball Italiano GF
Pizzas- Romana | American
Pizzas- Romana | American GF
Pizzas- Romana | American Hot
Pizzas- Romana | American Hot GF
Pizzas- Romana | Padana
Pizzas- Romana | Padana GF
Pizzas- Romana | Padana Vegan
Pizzas- Romana | Padana Vegan GF
Pizzas- Romana | La Reine
Pizzas- Romana | La Reine GF
Pizzas- Romana | Fiorentina
Pizzas- Romana | Fiorentina GF
Pizzas- Romana | Pollo ad Astra
Pizzas- Romana | Pollo ad Astra GF
Pizzas- Romana | Sloppy Giuseppe
Pizzas- Romana | Sloppy Giuseppe GF
Pizzas- Romana | BBQ Burnt Ends
Pizzas- Romana | BBQ Burnt Ends GF
Pizzas- Romana | Smoky BBQ Chicken
Pizzas- Romana | Smoky BBQ Chicken GF
Pizzas- Romana | Double American Cheese (Dine Out)
Pizzas- Romana | Double American Cheese GF (Dine Out)
Pizzas- Romana | Garlic Prawn
Pizzas- Romana | Garlic Prawn GF
Pizzas- Romana | Funghi di Bosco
Pizzas- Romana | Funghi di Bosco GF
Pizzas- Romana | Vegan Funghi di Bosco
Pizzas- Romana | Vegan Funghi di Bosco GF
Pizzas- Romana | Margherita
Pizzas- Romana | Margherita GF
Pizzas- Romana | Margherita Vegan
Pizzas- Romana | Margherita Vegan GF
Pizzas- Romana | Calabrian Feast
Pizzas- Romana | Calabrian Feast GF
Pizzas- Romana | Giardiniera
Pizzas- Romana | Giardiniera GF
Pizzas- Romana | Vegan Harissa Melanzane
Pizzas- Romana | Vegan Harissa Melanzane GF
Pizzas- Romana | Vegan Giardiniera
Pizzas- Romana | Vegan Giardiniera GF
Pizzas- Romana | Calabrese
Pizzas- Romana | Calabrese GF
Pizzas- Romana | Moroccan Chicken
Pizzas- Romana | Moroccan Chicken GF
Pizzas- Romana | Meatball Italiano
Pizzas- Romana | Meatball Italiano GF
Pizzas- Large Classic | American
Pizzas- Large Classic | American Hot
Pizzas- Large Classic | La Reine
Pizzas- Large Classic | Sloppy Giuseppe
Pizzas- Large Classic | Fiorentina
Pizzas- Large Classic | Padana
Pizzas- Large Classic | Padana Vegan
Pizzas- Large Classic | Pollo ad Astra
Pizzas- Large Classic | BBQ Burnt Ends
Pizzas- Large Classic | Smoky BBQ Chicken
Pizzas- Large Classic | Double American cheese (Dine Out)
Pizzas- Large Classic | Garlic Prawn
Pizzas- Large Classic | Funghi di Bosco
Pizzas- Large Classic | Vegan Funghi di Bosco
Pizzas- Large Classic | Margherita
Pizzas- Large Classic | Margherita Vegan
Pizzas- Large Classic | Calabrian Feast
Pizzas- Large Classic | Giardiniera
Pizzas- Large Classic | vegan Harissa Melanzane
Pizzas- Large Classic | Vegan Giardiniera
Pizzas- Large Classic | Calabrese
Pizzas- Large Classic | Moroccan Chicken
Pizzas- Large Classic | Meatball Italiano
Al Forno | Lasagna Classica
Al Forno | Cannelloni
Al Forno | Pollo Pesto
Al Forno | Pollo Pesto GF
Al Forno | Peperonata
Al Forno | Peperonata GF
Al Forno | Mushroom & Truffle Pappardelle
Leggera | Pomodoro
Leggera | Pollo ad Astra
Leggera | Padana
Leggera | American Hot
Leggera | Giardiniera
Leggera | Vegan Giardiniera
Salads | Niçoise
Salads | Niçoise with dough sticks
Salads | Niçoise with GF Dough Balls
Salads | Goats Cheese Beetroot Buddha Bowl
Salads | Goats Cheese Beetroot Buddha Bowl with dough sticks
Salads | Goats Cheese Beetroot Buddha Bowl with GF Dough Balls
Salads | Vegan Buddha Bowl
Salads | Vegan Buddha Bowl with dough sticks
Salads | Vegan Buddha Bowl with GF dough balls
Salads | Warm Roasted Veg & Chicken Bowl
Salads | Grand Chicken Caesar Salad
Salads | Grand Chicken Caesar Salad With Dough Sticks
Salads | Grand Chicken Caesar Salad With GF Dough Balls
Dips | House dressing
Dips | Caesar dressing
Dips | Honey mustard dressing
Dips | Basil & Pine Kernel Pesto
Dips | Houmous
Dips | Sweet & Smoky BBQ (Dine in)
Dips | Garlic Butter
Dips | Vegan Garlic & Parsley Spread
Dips | Smoky Tomato Harissa
Dips | Garlic & Herbs dip
Dips | Italian Tomato Dip
Dips | Garlic Butter Dip Pot (Dine Out)
Dips | Vegan Garlic & Parsley Spread (Dine Out)
Dips | Blue cheese dip
Dips | Pizzanaise
Dips | Pizzanaise (Dine Out)
Dips | Sweet & Smoky BBQ Dip Pot (Dine Out)
Dips | Garlic & herb Dip (Dine Out)
Dips | Spicy Tomato & Chilli
Extra Toppings | Black Olives
Extra Toppings | Red Onion
Extra Toppings | Red Chillies
Extra Toppings | Anchovies - Brown
Extra Toppings | Tuna
Extra Toppings | Mushrooms
Extra Toppings | Artichokes
Extra Toppings | Jalapeño Peppers
Extra Toppings | Chicken
Extra Toppings | Pepperoni
Extra Toppings | Goats Cheese
Extra Toppings | Ham
Extra Toppings | Green Peppers
Extra Toppings | Nduja
Extra Toppings | Cow's Milk Mozzarella
Extra Toppings | Red Onion Chutney
Extra Toppings | Baby plum tomatoes
Extra Toppings | Roasted Mixed Peppers
Extra Toppings | Spinach
Extra Toppings | Sweet Red Peppers
Extra Toppings | Mozzarella
Extra Toppings | Egg
Extra Toppings | Rocket
Extra Toppings | Pancetta Sliced
Extra Toppings | Slow Roasted Tomatoes
Extra Toppings | Grilled Aubergine
Extra Toppings | Hot Green Peppers
Extra Toppings | Light Mozzarella
Extra Toppings | Vegan Mozzarella Alternative
Extra Toppings | Crispy Pancetta
Desserts | Tiramisu
Desserts | Biscoff Billionaire's Sundae
Desserts | Dolcetti - Caffe Reale Excluding Hot Drink
Desserts | Dolcetti - Biscoff Cheesecake Excluding Hot Drink
Desserts | Dolcetti - Stem Ginger Cake Excluding Hot Drink
Desserts | Stem Ginger Cake (Dine Out)
Desserts | Raspberry Sorbet - 1 Scoop
Desserts | Lime and Basil Sorbet - 1 Scoop
Desserts | Vanilla Gelato - 1 Scoop
Desserts | Salted Caramel Gelato – 1 Scoop
Desserts | Stracciatella Gelato - 1 Scoop
Desserts | Frangelico Affogato
Desserts | Double Belgium Chocolate Brownie
Desserts | Chocolate Fudge Cake
Desserts | Chocolate Fudge cake (Dine Out)
Desserts | Lemon & Raspberry Cheesecake
Desserts | Lemon & Raspberry Cheesecake (Dine Out
Desserts | Honeycomb & Caramel Cream Slice
Desserts | Honeycomb & Caramel Cream Slice (Dine Out)
Desserts | Baked Vanilla Cheesecake
Desserts | Baked Vanilla Cheesecake (Dine Out)
Desserts | Biscoff Cheesecake (Dine Out)
Desserts | Double Chocolate Brownie Bites (Dine Out)
Desserts | White Chocolate Blondie
Desserts | White Chocolate Blondie Bites
Desserts | Sicilian Lemon Delight
Desserts | Dolcetti Choc Ice Bites Excluding hot drink option
Drinks | Strawberry Sicilian Lemonade PE
Drinks | Peroni Nastro Azzurro 0.0
Drinks | Coca-Cola Classic
Drinks | Diet Coke
Drinks | Coca-Cola Zero Sugar
Drinks | Fanta
Drinks | Sprite No Sugar
Drinks | San Pellegrino Limonata
Drinks | Aqua Panna Still Water 500ml
Drinks | Aqua Panna Still Water 1Lt
Drinks | Sicilian Still Lemonade
Drinks | San Pellegrino Sparkling Water 500ml
Drinks | San Pellegrino Sparkling Water 1Lt
Drinks | Schweppes Mixer - Soda Water
Drinks | Schweppes Mixer - Lemonade
Drinks | Fever Tree Light Tonic Rhubarb & Raspberry
Drinks | Fever Tree Light Tonic Mediterranean
Drinks | Irn Bru
Drinks | Irn Bru Sugar Free
Drinks | No. 1 Living Ginger Kombucha
Drinks | Oasis Summer Fruits
Drinks | Apple Juice
Drinks | Passion Fruit Still Lemonade
Drinks | San Pellegrino Aranciata Rossa
Drinks | Appletiser
Drinks | Raspberry Sparkle
Drinks | Elderflower & Mint Sparkle
Drinks | Peach Sparkle
Drinks | Lipton Iced tea peach
Drinks | Lime & Ginger Sparkle Can
Drinks | Orange Juice
Drinks | Cordino Spritz
Drinks | Living Things Watermelon & Lime
Drinks | Dr Pepper
Hot Drinks | Espresso
Hot Drinks | Dbl Espresso
Hot Drinks | Americano
Hot Drinks | Latte
Hot Drinks | Latte – Oat Drink
Hot Drinks | Flat White
Hot Drinks | Flat White – Oat Drink
Hot Drinks | Cappuccino
Hot Drinks | Cappuccino – Oat Drink
Hot Drinks | Macchiato
Hot Drinks | Macchiato – Oat Drink
Hot Drinks | The full English: English Breakfast
Hot Drinks | The full English: English Breakfast - With Semi-skimmed Milk (5cl)
Hot Drinks | The full English: English Breakfast - With Oat Drink (5cl)
Hot Drinks | The Earl: Earl Grey
Hot Drinks | The Earl: Earl Grey - With Semi-skimmed Milk (5cl)
Hot Drinks | The Earl: Earl Grey - With Oat Drink (5cl)
Hot Drinks | Simply Sencha: Green Tea
Hot Drinks | Refresh: Double Mint
Hot Drinks | Iced Latte
Hot Drinks | Iced Latte Oat Drink
Hot Drinks | Salted Caramel Iced Latte
Hot Drinks | Salted Caramel Iced Latte Oat Drink
Hot Drinks | Hot Chocolate
Hot Drinks | Hot Chocolate – Oat Drink
Hot Drinks | Mocha
Hot Drinks | Mocha – Oat Drink
Piccolo | Piccolo dough balls with houmous - with salad
Piccolo | Piccolo dough balls with houmous - no salad (Dine Out)
Piccolo | Piccolo dough balls GF with houmous - with salad
Piccolo | Piccolo dough balls GF with houmous - no salad (Dine Out)
Piccolo | Piccolo dough balls with garlic butter - with salad
Piccolo | Piccolo dough balls with garlic butter - no salad (Dine Out)
Piccolo | Piccolo dough balls GF with garlic butter - with salad
Piccolo | Piccolo dough balls GF with garlic butter - no salad (Dine Out)
Piccolo – Pasta & Salad | Bolognese Pasta Maccheroni
Piccolo – Pasta & Salad | Bolognese Pasta Fusilli
Piccolo – Pasta & Salad | Napoletana Pasta Maccheroni
Piccolo – Pasta & Salad | Napoletana Pasta Fusilli
Piccolo – Pasta & Salad | Creamy Pesto Maccheroni
Piccolo – Pasta & Salad | Creamy Pesto Pasta Fusilli
Piccolo – Pasta & Salad | Buttermilk Chicken Goujons
Piccolo - Pizzas | Margherita
Piccolo - Pizzas | Margherita Gluten Free
Piccolo - Pizzas | Margherita Vegan Mozz Alternative
Piccolo - Pizzas | Margherita Vegan Mozz Alternative Gluten Free
Piccolo - Pizzas | Margherita Light Mozz Altnerative
Piccolo - Pizzas | Margherita Light Mozz Alternative Gluten Free
Piccolo - Pizzas | American
Piccolo - Pizzas | American Gluten Free
Piccolo - Pizzas | American vegan Mozz Alternative
Piccolo - Pizzas | American vegan Mozz Alternative Gluten Free
Piccolo - Pizzas | American light Mozz Alternative
Piccolo - Pizzas | American light Mozz Alternative Gluten Free
Piccolo - Pizzas | Ham & Mushrooms
Piccolo - Pizzas | Ham & Mushrooms Gluten Free
Piccolo - Pizzas | Ham & Mushrooms Vegan Mozz Alternative
Piccolo - Pizzas | Ham & Mushrooms Vegan Mozz Alternative Gluten Free
Piccolo - Pizzas | Ham & Mushorroms Light Mozz
Piccolo - Pizzas | Ham & Mushrooms Light Mozz Gluten Free
Piccolo - Pizzas | Pollo
Piccolo - Pizzas | Pollo Gluten Free
Piccolo - Pizzas | Pollo vegan Mozz Alternative
Piccolo - Pizzas | Pollo vegan Mozz Alternative Gluten Free
Piccolo - Pizzas | Pollo Light Mozz Alternative
Piccolo – Extra Toppings | Mushrooms
Piccolo – Extra Toppings | Tomatoes
Piccolo – Extra Toppings | Strawberries
Piccolo - Drinks | Bambinoccino
Piccolo - Drinks | Bambinoccino - Oat Drink
Piccolo - Drinks | Milk
Piccolo - Drinks | Oat Drink
Piccolo - Drinks | Innocent Apple & Strawberry Carton
Piccolo - Drinks | Innocent Apple & Mango Carton
Piccolo - Drinks | Arla Big Milk
Piccolo - Desserts | Sundae with chocolate sauce
Piccolo - Desserts | Sundae with fruit sauce
Piccolo - Desserts | Pip Organic Fruity Ice Lolly
Piccolo - Desserts | Pip Organic Rainbow Ice Lolly
Piccolo - Desserts | Chocolate Brownie
Piccolo - Desserts | Strawberries & Cream
Piccolo - Desserts | Mossy Bottom Meltdown
"""


def display_name(title: str, printed: str, rule: dict) -> str:
    name = NAME_FIXES.get((title, printed), printed)
    name = re.sub(r"\(Dine out\)", "(Dine Out)", name)
    if title == "Piccolo - Pizzas":
        name = re.sub(r"\b(vegan|light)\b", lambda m: m.group(1).capitalize(), name)
    prefix = rule.get("prefix", "")
    if prefix and name.lower().startswith(prefix.strip().lower()):
        prefix = ""
    return f"{prefix}{name}{rule.get('suffix', '')}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    try:
        tables = pdf_reader.read_tables(args.pdf)
        breakfast_page = pdf_reader.first_page_containing(args.pdf, BREAKFAST_BANNER, start=3)  # page 2 is the contents list
    except pdf_reader.PdfLayoutError as e:
        print(f"The PDF's layout is not what this script expects: {e}", file=sys.stderr)
        return 1
    if breakfast_page is None:
        print(f"Could not find the '{BREAKFAST_BANNER}' heading: the PDF changed, re-check which pages are breakfast.", file=sys.stderr)
        return 1
    menu = [t for t in tables if t["page"] < breakfast_page]
    breakfast = [t for t in tables if t["page"] >= breakfast_page]

    printed_rows = [f"{t['title']} | {r['name']}" for t in menu for r in t["rows"]]
    expected = EXPECTED_ROWS.strip().split("\n")
    if printed_rows != expected:
        diff = "\n".join(difflib.unified_diff(expected, printed_rows, "expected (this script)", "printed (the PDF)", lineterm="", n=1))
        print("The PDF's rows are not the rows this script knows (a dish was added, removed, renamed or moved). "
              "Re-check names, categories, NOTES and HOLDBACK against the PDF, update EXPECTED_ROWS, then run again.\n" + diff, file=sys.stderr)
        return 1
    counts: dict[str, int] = {}
    for t in breakfast:
        counts[t["title"]] = counts.get(t["title"], 0) + len(t["rows"])
    if counts != BREAKFAST_COUNTS:
        print(f"The excluded breakfast section changed: expected {BREAKFAST_COUNTS}, found {counts}. Check it is still airport-only.", file=sys.stderr)
        return 1

    items = []
    for t in menu:
        rule = TABLES.get(t["title"])
        if rule is None:
            print(f"No rule for the table '{t['title']}' (page {t['page']}): add it to TABLES.", file=sys.stderr)
            return 1
        for r in t["rows"]:
            c = r["cells"]
            name = display_name(t["title"], r["name"], rule)
            tags = []
            if not PORK_WORDS.search(name) and not BEEF_WORDS.search(name) and VEGAN_DISH.search(name):
                tags.append("vegetarian")
            if PORK_WORDS.search(name):
                tags.append("contains_pork")
            if BEEF_WORDS.search(name):
                tags.append("contains_beef")
            note = [NOTES.get((t["title"], r["name"]), "")]
            if r["name"] != name and (t["title"], r["name"]) in NAME_FIXES:
                note.append(f"Printed as: {r['name']}")
            items.append({
                "id": slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()),  # Niçoise -> nicoise
                "name": name, "category": rule["category"], "serving": "1 portion",
                "calories": c["kcal"], "protein_g": c["protein"], "carbs_g": c["carbs"], "fat_g": c["fat"],
                "sat_fat_g": c["sat"], "sodium_mg": "", "salt_g": c["salt"], "sugar_g": c["sugars"], "fiber_g": c["fibre"],
                "tags": "|".join(tags), "limited_time": False,
                "rankable": rule.get("rankable", True) and not NOT_RANKABLE_NAME.search(name),
                "notes": "; ".join(n for n in note if n),
            })

    names = [i["name"] for i in items]
    # two rows may share a name only where the PDF itself repeats it (the extra "Garlic Prawn" in the Classic table)
    repeated = {n for n in names if names.count(n) > 1}
    if repeated != {"Garlic Prawn - Classic"}:
        print(f"Unexpected repeated names: {sorted(repeated)}", file=sys.stderr)
        return 1
    first = True
    for i in items:
        if i["name"] == "Garlic Prawn - Classic":
            i["notes"] = "First of two rows with this name in the Classic table" if first else "Second row with this name in the Classic table; held back"
            first = False

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="PizzaExpress", cuisine="Pizza", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["pizza express", "pizzaexpress"], items=items, out=args.out, note=NOTE,
        holdback=sorted(HOLDBACK.items()))
    with open(out / "items.csv", newline="", encoding="utf-8") as f:
        ids = {row["id"] for row in csv.DictReader(f)}
    missing = [h for h in HOLDBACK if h not in ids]
    if missing:
        print(f"HOLDBACK names ids that no longer exist: {missing}. The guide changed: update HOLDBACK.", file=sys.stderr)
        return 1
    sha = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {out} (PDF sha256 {sha})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
