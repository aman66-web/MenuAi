#!/usr/bin/env python3
"""Build data/source/greene-king/ from Greene King's official "Pub & Social Core Menu Nutritional Information" PDF.

    curl -L -A "Mozilla/5.0" -o greene-king.pdf "https://gkbr-p-001.sitecorecontenthub.cloud/api/public/content/b538641dcd674078a9ed2355770d6eb6?v=c6782b60"
    python3 tools/uk_extract/greene_king.py greene-king.pdf --checked-on 2026-10-06

Source: the file linked as "Main Menu - Nutritional Information" from the Pub & Social pub pages on greeneking.co.uk (for
example https://www.greeneking.co.uk/pubs/west-yorkshire/new-inn/menu). The file read on 2026-10-06 was "Pub & Social Core Menu
Nutritional Information - Spring Summer 2024, Version 1" (HTTP Last-Modified 25 Jul 2024, PDF created 16 May 2024). Only Pub &
Social pubs publish it; other Greene King pubs offer an allergen tool only. The menu may have changed since 2024.

Numbers are copied from the PDF exactly as printed, per serving (kcal, fat, saturates, carbohydrates, sugars, protein, salt;
kJ and the %RI columns are not used). Only names, categories and flags are decided by hand in ROWS below, one entry per printed
row in the PDF's order, together with the row's printed category and name. If Greene King adds, removes, renames or reorders a
row the printed text no longer matches ROWS and this script stops, so a human re-checks the structure.

How the guide is laid out. The key says: "Where there are options available, these will appear underneath the corresponding
dish, please add the nutrition for the choice to the total dish." So a row followed by "choices" is printed WITHOUT its choice:
  parent  a dish whose row says "Please select your choice from the following:". Published as an item (not rankable, because
          its numbers leave out a choice) and the rows under it are published as `add` modifiers on it, values as printed.
  option  a row printed under a parent (sauce, peas, chips or mash, bread...). Becomes a modifier of that parent only.
  held    a parent printed as 0 kcal, 0 protein, 0 carbohydrate and 0 fat (Trio of Fries, Ice Cream Choice, Mini Pudding): a
          placeholder, not a dish. Listed in holdback.csv. Its choices are published as items when each is a whole item with its
          own numbers (ice creams and sauces, mini puddings) and left out when the serving of one choice is not stated (Trio of
          Fries: each choice has different numbers from the same loaded fries sold on their own).
  skip    left out of the data (reason in the entry): selected sites only, one pub only, unclear serving, a repeated name
          with different numbers.

In the PDF the choices (options) are printed in red text and everything else in black; the entries below agree with that for
every row (checked by rendering the pages and testing the colour of each row's name on 2026-10-06).
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import greene_king_pdf as gk  # noqa: E402
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "greene-king"
SOURCE_URL = "https://gkbr-p-001.sitecorecontenthub.cloud/api/public/content/b538641dcd674078a9ed2355770d6eb6?v=c6782b60"
SOURCE_TITLE = "Greene King Pub & Social Core Menu Nutritional Information, Spring Summer 2024 (Version 1)"
NOTE = ("Pub & Social menu only, from Greene King's spring/summer 2024 guide. Where the guide asks you to choose a sauce, side or "
        "bread, the dish is listed without it and the choice is an add-on, so those dishes are not suggested as orders.")
HELD_REASON = ("Printed as 0 kcal and 0 g of protein, carbohydrate and fat: a placeholder for the choices listed under it, "
               "not a dish")
CHOICE_SUFFIX = re.compile(r"\s*-\s*Please select your choice from the following:?\s*$")

# printed category -> (category shown, rankable by default). Add-ons, sauces, desserts and sharing dishes are not suggested as orders.
CATEGORIES = {
    "Small Plates": ("Small plates", True),
    "Get Sharing": ("Get sharing", False),
    "Loaded Fries": ("Loaded fries", True),
    "Mains": ("Mains", True),
    "Burgers": ("Burgers", True),
    "From the Grill": ("From the grill", True),
    "Pies": ("Pies", True),
    "Goulash Sites": ("Goulash", True),
    "The Ship Only": ("The Ship", True),
    "Sides": ("Sides", True),
    "Extras": ("Extras", False),
    "Toppers & Sauces": ("Toppers & sauces", False),
    "Traditional Roasts": ("Sunday roasts", True),
    "Ciabattas, Wraps & Lunch Burger": ("Ciabattas, wraps & lunch burger", True),
    "Scottish Dishes": ("Scottish dishes", True),
    "Desserts": ("Desserts", False),
}

# (printed category, printed name, code[, overrides]) in the PDF's reading order; the number after # is the row's position.
ROWS: list[tuple] = [
    ('Small Plates', 'Salt & Pepper Chili Chicken', 'item'),  # 0
    ('Small Plates', 'Pulled Pork Tacos', 'item', dict(tags='contains_pork')),  # 1
    ('Small Plates', 'Chicken Shawarma Tacos', 'item'),  # 2
    ('Small Plates', 'Chicken Wings x8 - Please select your choice from the following:', 'parent', dict(serving='8 pieces')),  # 3
    ('Small Plates', 'Texan BBQ Sauce', 'option'),  # 4
    ('Small Plates', 'Eastcoast IPA Hotsauce', 'option'),  # 5
    ('Small Plates', 'Hot Honey', 'option'),  # 6
    ('Small Plates', 'Garlic and Rosemary Mayo', 'option'),  # 7
    ('Small Plates', 'Halloumi Fries', 'item'),  # 8
    ('Small Plates', 'Corn Ribs', 'item'),  # 9
    ('Small Plates', 'Chicken Strips x8 - Please select your choice from the following:', 'parent', dict(serving='8 pieces')),  # 10
    ('Small Plates', 'Texan BBQ Sauce', 'option'),  # 11
    ('Small Plates', 'Eastcoast IPA Hotsauce', 'option'),  # 12
    ('Small Plates', 'Hot Honey', 'option'),  # 13
    ('Small Plates', 'Garlic and Rosemary Mayo', 'option'),  # 14
    ('Get Sharing', 'Kilo Chicken Wings', 'item', dict(rankable=False, notes='Sharing dish: the values are for the whole dish')),  # 15
    ('Get Sharing', 'Nachos Sharer', 'item', dict(rankable=False, notes='Sharing dish: the values are for the whole dish. Meat type not stated')),  # 16
    ('Get Sharing', 'Tex Mex Sharer', 'item', dict(rankable=False, notes='Sharing dish: the values are for the whole dish. Meat type not stated')),  # 17
    ('Get Sharing', 'Ulitmate Sharer', 'item', dict(name='Ultimate Sharer', rankable=False, notes='Printed "Ulitmate Sharer" (spelling tidied in the name only). Sharing dish: the values are for the whole dish. Meat type not stated')),  # 18
    ('Loaded Fries', 'Katsu Chicken Fries', 'item'),  # 19
    ('Loaded Fries', 'BBQ Cheese Fries', 'item'),  # 20
    ('Loaded Fries', 'Cheese Burger Fries', 'item', dict(notes='Meat type not stated')),  # 21
    ('Loaded Fries', 'Buffalo Fries', 'item'),  # 22
    ('Loaded Fries', 'Trio of Fries - Please select your choice from the following:', 'held', dict(name='Trio of Fries')),  # 23
    ('Loaded Fries', 'Katsu Chicken Fries', 'skip', dict(why='a choice listed under the Trio of Fries placeholder (printed 0 kcal) with no stated serving per choice; the numbers differ from the same loaded fries sold on their own')),  # 24
    ('Loaded Fries', 'BBQ Cheese Fries', 'skip', dict(why='a choice listed under the Trio of Fries placeholder (printed 0 kcal) with no stated serving per choice; the numbers differ from the same loaded fries sold on their own')),  # 25
    ('Loaded Fries', 'Smash Burger Fries', 'skip', dict(why='a choice listed under the Trio of Fries placeholder (printed 0 kcal) with no stated serving per choice; the numbers differ from the same loaded fries sold on their own')),  # 26
    ('Loaded Fries', 'Buffalo Fries', 'skip', dict(why='a choice listed under the Trio of Fries placeholder (printed 0 kcal) with no stated serving per choice; the numbers differ from the same loaded fries sold on their own')),  # 27
    ('Mains', 'Fish & Chips - Please select your choice from the following:', 'parent'),  # 28
    ('Mains', 'Garden Peas', 'option'),  # 29
    ('Mains', 'Mushy Peas', 'option'),  # 30
    ('Mains', 'Grilled Gammon', 'item', dict(tags='contains_pork', notes='Tagged by the cut name (gammon is pork); the guide does not say "pork"')),  # 31
    ('Mains', "Hunter's Chicken", 'item', dict(notes='Meat type not stated')),  # 32
    ('Mains', 'Lasagne', 'item', dict(notes='Meat type not stated')),  # 33
    ('Mains', 'Lasagne - with Large Salad', 'item', dict(name='Lasagne with Large Salad', notes='Printed calories are about 18% above what its printed protein, carbohydrate and fat add up to (kJ and kcal agree with each other); entered as printed. Meat type not stated')),  # 34
    ('Mains', 'Scampi & Chips - Please select your choice from the following:', 'parent'),  # 35
    ('Mains', 'Garden Peas', 'option'),  # 36
    ('Mains', 'Mushy Peas', 'option'),  # 37
    ('Mains', 'Pulled Mushroom Chili', 'item'),  # 38
    ('Mains', 'Katsu Chicken', 'item'),  # 39
    ('Mains', 'Crispy Salt N Pepper Chili Chicken', 'item'),  # 40
    ('Mains', 'Mac & Cheese', 'item'),  # 41
    ('Mains', 'Mac & Cheese - with Large Salad', 'item', dict(name='Mac & Cheese with Large Salad')),  # 42
    ('Mains', 'Hot Honey Halloumi Flatbread', 'item'),  # 43
    ('Mains', 'Chicken Shawarma Flatbread', 'item'),  # 44
    ('Burgers', 'Classic Beef Burger', 'item', dict(tags='contains_beef')),  # 45
    ('Burgers', 'Cheese & Bacon Smash Burger', 'item', dict(tags='contains_pork', notes='Meat type not stated')),  # 46
    ('Burgers', 'Bacon & Blue Smash Burger', 'item', dict(tags='contains_pork', notes='Meat type not stated')),  # 47
    ('Burgers', 'Beyond Meat Burger', 'item'),  # 48
    ('Burgers', 'Vegan Beyond Meat Burger', 'item', dict(tags='vegetarian', notes='Marked vegan in its name')),  # 49
    ('Burgers', 'Buttermilk Chicken Burger', 'item'),  # 50
    ('Burgers', 'Hot Honey Chicken Burger', 'item'),  # 51
    ('From the Grill', '8oz Rump', 'item', dict(serving='8 oz', tags='contains_beef', notes='Tagged by the cut name (rump); the guide does not say "beef" or "steak"')),  # 52
    ('From the Grill', '8oz Sirloin', 'item', dict(serving='8 oz', tags='contains_beef', notes='Tagged by the cut name (sirloin); the guide does not say "beef" or "steak"')),  # 53
    ('From the Grill', 'Mixed Grill', 'item', dict(notes='Meat type not stated')),  # 54
    ('Pies', 'Beef & Ale Pie - Please select your choice from the following:', 'parent', dict(tags='contains_beef')),  # 55
    ('Pies', 'Chips', 'option'),  # 56
    ('Pies', 'Mash', 'option'),  # 57
    ('Pies', 'Chicken & Ham Pie - Please select your choice from the following:', 'parent', dict(tags='contains_pork')),  # 58
    ('Pies', 'Chips', 'option'),  # 59
    ('Pies', 'Mash', 'option'),  # 60
    ('Goulash Sites', 'Hungarian Goulash 400g', 'skip', dict(why='"Goulash Sites": a menu category for selected sites only')),  # 61
    ('Goulash Sites', 'Hungarian Goulash 800g', 'skip', dict(why='"Goulash Sites": a menu category for selected sites only')),  # 62
    ('Goulash Sites', 'Veggie Hungarian Goulash 400g', 'skip', dict(why='"Goulash Sites": a menu category for selected sites only')),  # 63
    ('Goulash Sites', 'Veggie Hungarian Goulash 800g', 'skip', dict(why='"Goulash Sites": a menu category for selected sites only')),  # 64
    ('The Ship Only', 'Chicken Parmo', 'skip', dict(why='"The Ship Only": one pub only')),  # 65
    ('Sides', 'Chips', 'item'),  # 66
    ('Sides', 'Rosemary Salted Skin on Fries', 'item'),  # 67
    ('Sides', 'Buttered Mashed Potato', 'item'),  # 68
    ('Sides', 'Buttered Baby Potatoes', 'item'),  # 69
    ('Sides', 'Jacket Potato & Butter', 'item'),  # 70
    ('Sides', 'Onion Rings', 'item'),  # 71
    ('Sides', 'Garlic Bread', 'item'),  # 72
    ('Sides', 'Cheesy Garlic Bread', 'item'),  # 73
    ('Sides', 'Dressed Mixed Salad', 'item'),  # 74
    ('Sides', 'Cauliflower Cheese', 'item'),  # 75
    ('Sides', 'Seasonal Vegetables', 'item'),  # 76
    ('Sides', 'Vegan Chips', 'item', dict(tags='vegetarian', notes='Marked vegan in its name')),  # 77
    ('Extras', 'Lunch Chips', 'item'),  # 78
    ('Extras', 'Bloomer Bread & Butter - Please select your choice from the following:', 'parent'),  # 79
    ('Extras', 'White Bloomer', 'option'),  # 80
    ('Extras', 'Malted Bloomer', 'option'),  # 81
    ('Extras', 'Extra Custard', 'item'),  # 82
    ('Extras', 'Steak Double Up (8oz Rump)', 'item'),  # 83
    ('Extras', 'Steak Double Up (8oz Sirloin)', 'item', dict(tags='contains_beef', notes='Tagged because the name says steak')),  # 84
    ('Extras', 'Extra Grated Cheese', 'item', dict(tags='contains_beef', notes='Tagged because the name says steak')),  # 85
    ('Extras', 'Extra Burger Cheese Slice', 'item'),  # 86
    ('Extras', 'Extra Vegan Cheese Slice', 'item', dict(tags='vegetarian', notes='Marked vegan in its name')),  # 87
    ('Extras', 'Extra Yorkshire Pudding', 'item'),  # 88
    ('Extras', 'Extra Sausage', 'item', dict(tags='contains_pork')),  # 89
    ('Extras', 'Extra BBQ Sauce', 'item', dict(notes='Printed calories are about 20% above what its printed protein, carbohydrate and fat add up to (kJ and kcal agree; grams are printed in whole or half units); entered as printed')),  # 90
    ('Extras', 'Extra East Coast IPA', 'item'),  # 91
    ('Extras', 'Extra Garlic Mayo', 'item'),  # 92
    ('Extras', 'Extra Napolitana Sauce', 'item'),  # 93
    ('Extras', 'Extra Smoked Streaky Bacon', 'item', dict(tags='contains_pork')),  # 94
    ('Extras', 'Extra Baked Beans', 'item'),  # 95
    ('Extras', 'Extra Gravy', 'item'),  # 96
    ('Extras', 'Extra Pineapple', 'item'),  # 97
    ('Extras', 'Extra Clotted Cream Ice Cream', 'item'),  # 98
    ('Extras', 'Extra Sunday Roast Potatoes', 'item'),  # 99
    ('Extras', 'Extra Pig In Blanket', 'item', dict(tags='contains_pork', notes='Tagged because the name says pig (pig in blanket)')),  # 100
    ('Extras', 'Extra Scampi †', 'item', dict(name='Extra Scampi', notes='Printed "Extra Scampi †"; the guide does not explain the dagger')),  # 101
    ('Extras', 'Extra Chicken Breast', 'item'),  # 102
    ('Extras', 'Extra Tortillas', 'item'),  # 103
    ('Extras', 'Extra Buttered Seasonal Vegetables', 'item'),  # 104
    ('Extras', 'Extra Peas', 'item'),  # 105
    ('Extras', 'Extra Curry Sauce', 'item'),  # 106
    ('Extras', 'Extra Rich Gravy', 'item'),  # 107
    ('Toppers & Sauces', 'Burger Topper - Extra Buttermilk Chicken Burger', 'item'),  # 108
    ('Toppers & Sauces', 'Burger Topper - Extra 3oz Smash Beef Burger', 'item', dict(tags='contains_beef')),  # 109
    ('Toppers & Sauces', 'Burger Topper - Extra Beyond Burger', 'item'),  # 110
    ('Toppers & Sauces', 'Nachos Sharer Topper - BBQ Pulled Pork', 'item', dict(tags='contains_pork')),  # 111
    ('Toppers & Sauces', 'Burger Topper - Smoked Streaky Bacon', 'item', dict(tags='contains_pork')),  # 112
    ('Toppers & Sauces', 'Burger Topper - BBQ Pulled Pork', 'item', dict(tags='contains_pork')),  # 113
    ('Toppers & Sauces', 'Burger Topper - Cheese Slice', 'item'),  # 114
    ('Toppers & Sauces', 'Burger Topper - Vegan Cheese Slice', 'item', dict(tags='vegetarian', notes='Marked vegan in its name')),  # 115
    ('Toppers & Sauces', 'Burger Topper - Free Range Fried Egg', 'item'),  # 116
    ('Toppers & Sauces', 'Steak Sauce - Creamy Peppercorn & Brandy', 'item', dict(notes='Printed calories are about 18% above what its printed protein, carbohydrate and fat add up to (kJ and kcal agree; the guide does not say why); entered as printed')),  # 117
    ('Toppers & Sauces', 'Extra Sauce - Merlot & Beef Dripping Gravy', 'item', dict(tags='contains_beef', notes='Tagged because the name says beef dripping. Printed calories are about 25% above what its printed protein, carbohydrate and fat add up to (kJ and kcal agree; the guide does not say why); entered as printed')),  # 118
    ('Toppers & Sauces', 'Steak Sauce - Garlic & Mushroom', 'item'),  # 119
    ('Toppers & Sauces', 'Steak Topper - Free Range Fried Egg', 'item'),  # 120
    ('Toppers & Sauces', 'Steak Topper - Whitby Scampi', 'item'),  # 121
    ('Traditional Roasts', 'Sunday Roast - Roasted Turkey Breast', 'item'),  # 122
    ('Traditional Roasts', 'Sunday Roast - Sirloin Of Roast Beef', 'item', dict(tags='contains_beef')),  # 123
    ('Traditional Roasts', 'Sunday Roast - Turkey & Beef Duo', 'item', dict(tags='contains_beef')),  # 124
    ('Traditional Roasts', 'Sunday Roast - Beetroot, Sweet Potato & Butternut Squash Tart', 'item'),  # 125
    ('Traditional Roasts', 'Sunday Roast Kids - Sirloin of Roast Beef', 'item', dict(tags='contains_beef', notes='Every printed number is identical to the Seniors version')),  # 126
    ('Traditional Roasts', 'Sunday Roast Kids - Turkey', 'item', dict(notes='Every printed number is identical to the Seniors version')),  # 127
    ('Traditional Roasts', 'Sunday Roast Kids - Mac Cheese', 'item'),  # 128
    ('Traditional Roasts', 'Sunday Roast Seniors - Roast Turkey', 'item', dict(notes='Every printed number is identical to the Kids version')),  # 129
    ('Traditional Roasts', 'Sunday Roast Seniors - Sirloin of Roast Beef', 'item', dict(tags='contains_beef', notes='Every printed number is identical to the Kids version')),  # 130
    ('Traditional Roasts', 'Sunday Roast Seniors - Beetroot, Sweet Potato & Butternut Squash Tart', 'item'),  # 131
    ('Ciabattas, Wraps & Lunch Burger', 'Sweet Chili Chicken - Please select your choice from the following:', 'parent'),  # 132
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 133
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 134
    ('Ciabattas, Wraps & Lunch Burger', 'Steak & Cheese - Please select your choice from the following:', 'parent', dict(tags='contains_beef')),  # 135
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 136
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 137
    ('Ciabattas, Wraps & Lunch Burger', 'Buttermilk Chicken, Bacon & Mayo - Please select your choice from the following:', 'parent', dict(tags='contains_pork')),  # 138
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 139
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 140
    ('Ciabattas, Wraps & Lunch Burger', 'Plant Based Meatball Marinara - Please select your choice from the following:', 'parent'),  # 141
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 142
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 143
    ('Ciabattas, Wraps & Lunch Burger', '3oz Cheese Smash Burger (Lunch)', 'item', dict(notes='Meat type not stated')),  # 144
    ('Ciabattas, Wraps & Lunch Burger', 'Sunday Beef - Please select your choice from the following:', 'parent', dict(tags='contains_beef')),  # 145
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 146
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 147
    ('Ciabattas, Wraps & Lunch Burger', 'Sunday Turkey - Please select your choice from the following:', 'parent'),  # 148
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 149
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 150
    ('Ciabattas, Wraps & Lunch Burger', 'Fish Finger - Please select your choice from the following:', 'parent'),  # 151
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 152
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 153
    ('Ciabattas, Wraps & Lunch Burger', 'Hot Honey Halloumi - Please select your choice from the following:', 'parent'),  # 154
    ('Ciabattas, Wraps & Lunch Burger', 'Ciabatta', 'option'),  # 155
    ('Ciabattas, Wraps & Lunch Burger', 'Tortilla', 'option'),  # 156
    ('Scottish Dishes', 'Lentil Soup', 'item'),  # 157
    ('Scottish Dishes', 'Haggis Fritters (Scotland)', 'item', dict(notes='Meat type not stated')),  # 158
    ('Scottish Dishes', 'Fish & Chips (Scotland) - Please select your choice from the following:', 'parent'),  # 159
    ('Scottish Dishes', 'Garden Peas', 'option'),  # 160
    ('Scottish Dishes', 'Mushy Peas', 'option'),  # 161
    ('Scottish Dishes', 'Peppered Mushroom Pie (Scotland) - Please select your choice from the following:', 'parent'),  # 162
    ('Scottish Dishes', 'Chips', 'option'),  # 163
    ('Scottish Dishes', 'Mash', 'option'),  # 164
    ('Scottish Dishes', 'Belhaven Steak & Ale Pie (Scotland) - Please select your choice from the following:', 'parent', dict(tags='contains_beef')),  # 165
    ('Scottish Dishes', 'Chips', 'option'),  # 166
    ('Scottish Dishes', 'Mash', 'option'),  # 167
    ('Scottish Dishes', 'Chicken, Bacon & Leek Pie (Scotland) - Please select your choice from the following:', 'parent', dict(tags='contains_pork')),  # 168
    ('Scottish Dishes', 'Chips', 'option'),  # 169
    ('Scottish Dishes', 'Mash', 'option'),  # 170
    ('Scottish Dishes', 'Balmoral Smash Burger (Scotland)', 'item', dict(notes='Meat type not stated')),  # 171
    ('Scottish Dishes', 'Mac & Cheese (Scotland)', 'item'),  # 172
    ('Scottish Dishes', 'Mac & Cheese - with Large Salad', 'item', dict(name='Mac & Cheese with Large Salad (Scotland)', notes='Printed without "(Scotland)"; it is in the guide\'s Scottish Dishes section and its numbers differ from the Mains version')),  # 173
    ('Scottish Dishes', 'Sunday Roast Kids - Mac Cheese (Scotland)', 'item'),  # 174
    ('Scottish Dishes', 'Steak Topper - Haggis (Scotland)', 'item', dict(rankable=False, notes='Meat type not stated')),  # 175
    ('Scottish Dishes', 'Haggis, Neeps & Tatties Small', 'item', dict(name='Haggis, Neeps & Tatties (small)', serving='Small', notes='Meat type not stated')),  # 176
    ('Scottish Dishes', 'Haggis, Neeps & Tatties', 'item', dict(notes='Meat type not stated')),  # 177
    ('Scottish Dishes', 'Balmoral Chicken', 'item', dict(notes='Meat type not stated')),  # 178
    ('Scottish Dishes', '8oz Balmoral Rump Steak', 'item', dict(tags='contains_beef', serving='8 oz', notes='Tagged because the name says steak')),  # 179
    ('Desserts', 'Jam Roly Poly Pudding', 'item'),  # 180
    ('Desserts', 'Chocolate Lava Cookie', 'item'),  # 181
    ('Desserts', 'Caramalised Biscuit Cheesecake', 'item', dict(name='Caramelised Biscuit Cheesecake', notes='Printed "Caramalised" (spelling tidied in the name only)')),  # 182
    ('Desserts', 'White Chocolate and Raspberry Blondie', 'item'),  # 183
    ('Desserts', 'Triple Chocolate Brownie', 'item'),  # 184
    ('Desserts', 'Ice Cream Choice - Please select your choice from the following:', 'held', dict(name='Ice Cream Choice')),  # 185
    ('Desserts', 'Chocolate Ice Cream', 'item', dict(notes='A choice under Ice Cream Choice (printed 0 kcal), which is the whole item')),  # 186
    ('Desserts', 'Classic Jersey Clotted Cream Ice Cream', 'item', dict(notes='A choice under Ice Cream Choice (printed 0 kcal), which is the whole item')),  # 187
    ('Desserts', 'Lemon Sorbet', 'item', dict(notes='A choice under Ice Cream Choice (printed 0 kcal), which is the whole item')),  # 188
    ('Desserts', 'Yoghurt Strawberry', 'item', dict(notes='A choice under Ice Cream Choice (printed 0 kcal), which is the whole item')),  # 189
    ('Desserts', 'Ice Cream - Vegan', 'item', dict(name='Vegan Ice Cream', tags='vegetarian', notes='A choice under Ice Cream Choice (printed 0 kcal); printed "Ice Cream - Vegan"')),  # 190
    ('Desserts', 'Chocolate Sauce', 'item', dict(notes='A choice under Ice Cream Choice (printed 0 kcal), which is the whole item')),  # 191
    ('Desserts', 'Strawberry Sauce', 'item', dict(notes='A choice under Ice Cream Choice (printed 0 kcal), which is the whole item')),  # 192
    ('Desserts', 'Raspberry Coulis', 'item', dict(notes='A choice under Ice Cream Choice (printed 0 kcal), which is the whole item')),  # 193
    ('Desserts', 'Mini Pudding - Please select your choice from the following:', 'held', dict(name='Mini Pudding')),  # 194
    ('Desserts', 'Mini Triple Chocolate Brownie', 'item', dict(notes='A choice under Mini Pudding (printed 0 kcal), which is the whole mini pudding')),  # 195
    ('Desserts', 'Mini Blondie', 'item', dict(notes='A choice under Mini Pudding (printed 0 kcal), which is the whole mini pudding')),  # 196
    ('Desserts', 'Chocolate Lava Cookie', 'skip', dict(why='printed again after the Mini Pudding choices, but not marked as a choice (the choices are in red), under the same name as a dessert listed above with different numbers; the guide does not say what it is, so only the first listing is published')),  # 197
    ('Desserts', 'Caramalised Biscuit Cheesecake', 'skip', dict(why='printed again after the Mini Pudding choices, but not marked as a choice (the choices are in red), under the same name as a dessert listed above with different numbers; the guide does not say what it is, so only the first listing is published')),  # 198
]

PARENT_NOTE = ("Printed without the choice listed under it ({choices}); the guide says to add the choice's values to the dish "
               "(they are this item's add-ons). Not rankable because its numbers are incomplete.")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def nutrients(printed: dict) -> dict:
    v = printed["values"]
    return {"calories": v["kcal"], "protein_g": v["protein"], "carbs_g": v["carbs"], "fat_g": v["fat"], "sat_fat_g": v["sat"],
            "sodium_mg": "", "salt_g": v["salt"], "sugar_g": v["sugars"], "fiber_g": ""}


def build(pdf_rows: list[dict]) -> tuple[list[dict], list[dict], list[tuple[str, str]], list[str]]:
    items: list[dict] = []
    mods: list[dict] = []
    held: list[tuple[str, str]] = []
    skipped: list[str] = []
    parent: dict | None = None
    choices: dict[int, list[str]] = {}
    for spec, printed in zip(ROWS, pdf_rows):
        cat, name, code, *rest = spec
        o = rest[0] if rest else {}
        cat_name, rank_default = CATEGORIES[cat]
        label = o.get("name") or CHOICE_SUFFIX.sub("", name)
        if code == "skip":
            skipped.append(f"{cat} | {name} ({o['why']})")
            parent = None
            continue
        if code == "option":
            if parent is None:
                raise ValueError(f"option {name!r} has no parent above it")
            mods.append({"item_id": parent["id"], "id": slug(label), "label": label, "kind": "add", **nutrients(printed), "tags": ""})
            choices.setdefault(id(parent), []).append(label)
            continue
        item = {"name": label, "category": cat_name, "serving": o.get("serving", ""), **nutrients(printed),
                "tags": o.get("tags", ""), "limited_time": False,
                "rankable": o.get("rankable", rank_default) and code == "item", "notes": o.get("notes", "")}
        item["id"] = slug(label)
        if code == "held":
            held.append((item["id"], HELD_REASON))
            item["rankable"] = False
            parent = None
        elif code == "parent":
            parent = item
        else:
            parent = None
        items.append(item)
    for it in items:
        if id(it) in choices:
            it["notes"] = norm(PARENT_NOTE.format(choices=" / ".join(choices[id(it)])) + " " + it["notes"])
    return items, mods, held, skipped


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    pdf_rows = gk.read_rows(args.pdf)
    if len(pdf_rows) != len(ROWS):
        print(f"The PDF has {len(pdf_rows)} nutrition rows but this script names {len(ROWS)}. The guide changed: re-check ROWS "
              "against the PDF before running again.", file=sys.stderr)
        return 1
    for i, (spec, printed) in enumerate(zip(ROWS, pdf_rows)):
        if norm(printed["cat"]) != spec[0] or norm(printed["name"]) != spec[1]:
            print(f"Row {i} (PDF page {printed['page']}) is printed as {printed['cat']!r} / {printed['name']!r} but ROWS expects "
                  f"{spec[0]!r} / {spec[1]!r}. The guide changed: re-check ROWS.", file=sys.stderr)
            return 1

    items, mods, held, skipped = build(pdf_rows)
    ids = [i["id"] for i in items]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        print(f"Duplicate item ids {dupes}: give the entries different names in ROWS.", file=sys.stderr)
        return 1

    out = write_chain_folder(chain_id=CHAIN_ID, name="Greene King", cuisine="Pub", source_title=SOURCE_TITLE,
                             source_url=SOURCE_URL, checked_on=args.checked_on,
                             aliases=["greene king", "greene king pub", "pub & social"], items=items, out=args.out,
                             note=NOTE, holdback=held)
    fields = ["item_id", "id", "label", "kind", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", "tags"]
    with open(out / "modifiers.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(mods)
    print(f"wrote {len(items)} items ({len(held)} held back) and {len(mods)} add-on modifiers to {out} "
          f"(PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    for s in skipped:
        print("left out:", s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
