#!/usr/bin/env python3
"""Build data/source/morrisons-cafe/ from Morrisons Café's own menu (a CALORIES-ONLY chain).

    python3 -I tools/uk_extract/morrisons_cafe.py --pdf-ew FILE --pdf-scot FILE --checked-on 2026-11-17 [--out DIR]
    python3 -I tools/uk_extract/morrisons_cafe.py --fetch DIR --checked-on 2026-11-17      (downloads both PDFs into DIR first)

Source: the "View Menu" and "View Scottish Menu" links on Morrisons' café page (https://www.morrisons.com/inspiration/shopping-at-morrisons/cafe):
https://www.morrisons.com/terms/cafe-menu and https://www.morrisons.com/terms/scottish-cafe-menu redirect to the menus on Morrisons' own
Contentful asset host (assets.ctfassets.net/um1yk6827v6c/...). robots.txt of www.morrisons.com allows /terms/ (only /draft/ and one media page
are disallowed); assets.ctfassets.net has no robots.txt (404 = no rules). One download of each file.

Menu read on 2026-11-17 (this version of the script): "E&W Menu Fish & Chips Table Folded Menu" (MM-10008723, file name cafe-menu-2-11-2026.pdf,
PDF created 19 October 2026, two spreads: pages 1-2 and 3-4) and its Scottish twin (MM-10008726, cafe-menu-scot-2-11-2026.pdf). It replaced the
"Cafe Reset Menu E&W" poster dated 5-5-26 (read 2026-10-11, sha256 42bb1db7...), so every anchor below was rewritten for the new layout.

The menu prints CALORIES ONLY ("NNNkcal" beside each dish): no protein, carbs or fat, so those stay blank (docs/DATA.md "Calories-only chains").
Prices are not used. The menu has a real text layer; it is read by position (pdftotext -bbox-layout), page by page, never by counting:
  * a calorie token is one word "NNNkcal"; a word "NNNkcal/NNNkcal" is TWO tokens (the menu's "Roll or Wrap ... 957kcal/1076kcal": the first is
    the roll, the second the wrap, in the order the name prints them); any other word containing "kcal" stops the run, except the footer's
    "Adults need around 2000kcal a day";
  * DISHES below names, for each dish, the page, the printed line that carries it (an anchor) and how its calories sit: "in" = on the anchor's own
    line ("nth" picks the 1st or 2nd token where a line prints two, e.g. "Served with cream 1120kcal or custard 605kcal"), "right" = a separate
    word on the same baseline to the anchor's right, "below" = the nearest calorie line under the anchor;
  * where the same name is printed more than once on a page, "after" names a line above it (a heading): the copy nearest below that heading
    (vertical gap + horizontal offset, same page, at most 240 pt below and 250 pt to the side) is used;
  * every token must be claimed by exactly one dish and every dish must claim exactly one token, otherwise the run stops.
Only names, categories and the anchors are typed here; every number comes from the PDF.

Repeats: the "Build Your Own CHICKEN COMBO" lists sides and sauces that are also sold on their own. Those repeats are CHECK rows: not published,
but their printed figure must equal the published one, otherwise BOTH are left out (never chosen between). On 2026-11-17 two disagree and are
left out: "Mayo" (287kcal in Sides & Sauces, 278kcal in the combo) and "Beer Battered Onion Rings" (326kcal as a side, 204kcal as a combo side).
Also read but not published: "Gluten free roll available 245kcal" under the soup (no stated basis: soup with that roll, or the roll alone).
The "Fish & Chip Afternoon Tea For Two" figure (1374kcal, "Serves 2") is published as printed for the whole tea, named so, not ranked.

Two menus: England & Wales (published) and Scotland (read for comparison only). A dish printed on both must print the same calories, otherwise it
is left out (never chosen between); Scotland-only dishes (regional: Lorne sausage, tattie scones, haggis, "Fish Supper") are not published.
Allergens: link only. The café's allergen guide ("TS01K Cafe Allergen Information Guide", V52, 09/11/2026, linked as "View Allergen Info") uses its
own dish names, which differ from the menu's ("Full Breakfast" vs "Full English Breakfast"), so it is not matched here; it is the guide link.
Morrisons says its food is prepared in a busy kitchen and may contain other allergens; the vegan dishes are "vegan recipe" only.

Read on 2026-11-17: E&W menu sha256 9c1796e980f3a98689cb877245e33c6b7f88c19248cee466717ed2e385916908; Scottish menu sha256
4b887a7fda4ac1f0f7b0f2f9f382653b9b90945884638fa21ade87ce108c149e. Independent check: data/audit/verified/morrisons-cafe.json (2026-10-11 poster).
"""
from __future__ import annotations
import argparse
import hashlib
import html
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402  (meat_tags)
from common import ROOT, write_chain_folder  # noqa: E402

CHAIN_ID = "morrisons-cafe"
EW_URL = "https://www.morrisons.com/terms/cafe-menu"
SCOT_URL = "https://www.morrisons.com/terms/scottish-cafe-menu"
ALLERGEN_URL = "https://www.morrisons.com/terms/cafe-allergen-information"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"

PAGE = re.compile(r"<page [^>]*>(.*?)</page>", re.S)
LINE = re.compile(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', re.S)
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', re.S)
TOKEN = re.compile(r"^(\d{1,4})kcal$")
PAIR = re.compile(r"^(\d{1,4})kcal/(\d{1,4})kcal$")

B, BR, BB, BY, MA, CH, BU, SO, SI, DE, KB, KM = (
    "Breakfast", "Breakfast rolls & wraps", "Build your own breakfast (per item)", "Breakfast extras", "Mains",
    "Chicken combo (per item)", "Burgers", "Soup & salads", "Sides & sauces", "Hot desserts", "Kids: breakfast (per item)",
    "Kids: mix & match (per item)")
CHECK = None  # category of a repeat that is read and compared, never published
SKIP = "skip"  # a figure that is read (so every token stays claimed) but not published: its basis is not stated


def D(name, cat, page, anchor, mode, after=None, rank=False, nth=0, same_as=None):
    """One printed calorie figure. same_as: a CHECK row whose figure must equal that published dish's figure."""
    return dict(name=name, cat=cat, page=page, anchor=anchor, mode=mode, after=after, rank=rank, nth=nth, same_as=same_as)


DISHES = [
    # page 1 (spread "1-2"): soup, salads, baked potato, sides & sauces, hot desserts, kids
    D("Heinz Tomato Soup (with a bread roll and butter)", SO, 1, "Heinz Tomato Soup £4", "right", rank=True),
    # "Gluten free roll available 245kcal" under the soup: the menu does not say whether 245 is the soup with that roll or the roll alone
    # (Dr Schär Gluten Free Roll is 193kcal on the breakfast list, the bread roll with butter 229kcal), so it is not published
    D("Gluten free roll (with Heinz Tomato Soup)", SKIP, 1, "Gluten free roll available", "in"),
    D("Ham & Egg Salad", SO, 1, "Ham & Egg Salad", "in", rank=True),
    D("Tuna & Egg Salad", SO, 1, "Tuna & Egg Salad", "in", rank=True),
    D("Vegan ChiQin Buttermilk Burger Strip Salad (with mayo)", SO, 1, "Vegan ChiQin Buttermilk Burger Strip Salad", "right", rank=True),
    D("Loaded Baked Potato (with butter or vegan spread and side salad, before toppings)", MA, 1, "Loaded Baked Potato", "in"),
    D("Heinz Baked Beanz (baked potato topping)", MA, 1, "Heinz Baked Beanz", "in", after="and a choice of two toppings"),
    D("Tuna Mayo (baked potato topping)", MA, 1, "Tuna Mayo", "in"),
    D("Grated Cheddar Cheese (baked potato topping)", MA, 1, "Grated Cheddar Cheese", "in"),
    D("Veggie Chilli (baked potato topping)", MA, 1, "Veggie Chilli", "in"),
    D("Coleslaw (baked potato topping)", MA, 1, "Coleslaw", "in", after="Veggie Chilli"),
    D("Side Salad", SI, 1, "Side Salad", "in", after="£2.50 per item"),
    D("Beer Battered Onion Rings", SI, 1, "Beer Battered Onion Rings", "in"),
    D("Mini Cheesy Hash Brown Bites", SI, 1, "Mini Cheesy Hash Brown Bites", "in"),
    D("Chips", SI, 1, "Chips", "in", after="£2.50 per item"),
    D("White or Brown Slice of Bread & Butter", SI, 1, "White or Brown Slice of Bread & Butter", "right"),
    D("Bread Roll (with butter)", SI, 1, "Bread Roll with butter", "in"),
    D("Two Garlic Bread Slices", SI, 1, "Two Garlic Bread Slices", "in"),
    D("Curry Sauce", SI, 1, "Curry Sauce", "in"),
    D("Gravy", SI, 1, "Gravy", "in"),
    D("Coleslaw", SI, 1, "Coleslaw", "in", after="Gravy"),
    D("Hot Honey Sauce", SI, 1, "Hot Honey Sauce", "right"),
    D("Buffalo Sauce", SI, 1, "Buffalo Sauce", "right"),
    D("Mayo", SI, 1, "Mayo", "right"),
    D("BBQ Sauce", SI, 1, "BBQ Sauce", "right"),
    D("Sweet Chilli Sauce", SI, 1, "Sweet Chilli Sauce", "right"),
    D("Garlic & Herb Sauce", SI, 1, "Garlic & Herb Sauce", "right"),
    D("Sticky Toffee Pudding (with cream)", DE, 1, "Served with cream", "in", after="Sticky Toffee Pudding", nth=0),
    D("Sticky Toffee Pudding (with custard)", DE, 1, "Served with cream", "in", after="Sticky Toffee Pudding", nth=1),
    D("Chocolate Sponge Pudding (with cream)", DE, 1, "Served with cream", "in", after="Chocolate Sponge Pudding", nth=0),
    D("Chocolate Sponge Pudding (with custard)", DE, 1, "Served with cream", "in", after="Chocolate Sponge Pudding", nth=1),
    D("Kids' Breakfast on Toast (before toppings)", KB, 1, "On toast", "in"),
    D("Heinz Baked Beanz (kids' breakfast topping)", KB, 1, "Heinz Baked Beanz", "below", after="toppings:"),
    D("Veggie Sausage (kids' breakfast topping)", KB, 1, "Veggie Sausage", "in", after="toppings:"),
    D("Scrambled Egg (kids' breakfast topping)", KB, 1, "Scrambled Egg", "in", after="toppings:"),
    D("Fried Egg (kids' breakfast topping)", KB, 1, "Fried Egg", "in", after="toppings:"),
    D("Sausage (kids' breakfast topping)", KB, 1, "Sausage", "in", after="toppings:"),
    D("Bacon (kids' breakfast topping)", KB, 1, "Bacon", "in", after="toppings:"),
    D("Four Birds Eye Chicken Dippers (kids)", KM, 1, "Dippers", "in"),
    D("Three Birds Eye Fish Fingers (kids)", KM, 1, "Three Birds Eye® Fish Fingers", "below"),
    D("Goodfella's Mini Margherita Pizza (kids)", KM, 1, "Pizza", "in"),
    D("Two Sausages (kids)", KM, 1, "Two Sausages", "in"),
    D("Two Veggie Sausages (kids)", KM, 1, "Two Veggie Sausages", "below"),
    D("Birds Eye Crispy Chips (kids)", KM, 1, "Birds Eye® Crispy Chips", "below"),
    D("Aunt Bessie's Mash Potato (kids)", KM, 1, "Aunt Bessie’s® Mash Potato", "below"),
    D("Aunt Bessie's Yorkshire Pudding (kids)", KM, 1, "Pudding", "in"),
    D("Birds Eye Garden Peas (kids)", KM, 1, "Birds Eye® Garden Peas", "below"),
    D("Birds Eye Steamfresh Veg (kids)", KM, 1, "Birds Eye® Steamfresh® Veg", "below"),
    D("Heinz Baked Beanz (kids)", KM, 1, "Heinz Baked Beanz", "in", after="Birds Eye® Steamfresh® Veg"),
    D("Goodfella's Mac & Cheese & Garlic Bread (kids)", KM, 1, "Goodfella’s ® Mac & Cheese & Garlic Bread", "in"),
    # page 2 (spread "3-4"): breakfast, mains, burgers, build your own breakfast, chicken combo
    D("Chips (add)", SI, 2, "Add chips £2.50", "right"),
    D("The Belly Buster", B, 2, "toast and butter", "in", after="The Belly Buster", rank=True),
    D("Big Breakfast", B, 2, "butter", "in", after="Big Breakfast £8.95", rank=True),
    D("Full English Breakfast", B, 2, "brown, Heinz Baked Beanz, toast and butter", "in", rank=True),
    D("Full Veggie Breakfast", B, 2, "Beanz, toast and butter", "in", rank=True),
    D("Full Vegan Breakfast", B, 2, "vegan spread", "in", rank=True),
    D("Small Breakfast", B, 2, "toast and butter", "in", after="Small Breakfast £5.75", rank=True),
    D("Stacked Pancakes (with Nutella)", B, 2, "Three pancakes with Nutella", "in"),
    D("Creamy Porridge", B, 2, "Creamy Porridge £2.50", "right", rank=True),
    D("Toasted Fruit Teacake", B, 2, "With butter", "right", after="Toasted Fruit Teacake"),
    D("White or Brown Toast (with butter or vegan spread)", BY, 2, "With butter or vegan spread", "right", after="White or Brown Toast 75p"),
    D("Strawberry Jam (add)", BY, 2, "Strawberry Jam", "in"),
    D("Marmalade (add)", BY, 2, "Marmalade", "in"),
    D("Honey (add)", BY, 2, "Honey", "in"),
    D("Nutella (add)", BY, 2, "Nutella", "in"),
    D("Heinz Baked Beanz on Toast", B, 2, "With butter", "right", after="Heinz Baked Beanz on Toast", rank=True),
    D("Fried Eggs on Toast", B, 2, "Fried Eggs", "in", after="Two slices of buttered", rank=True),
    D("Poached Eggs on Toast", B, 2, "Poached Eggs", "in", after="Two slices of buttered", rank=True),
    D("Scrambled Eggs on Toast", B, 2, "Scrambled Eggs", "in", after="Two slices of buttered", rank=True),
    D("Smashed Avocado (add to eggs on toast)", BY, 2, "Add smashed avocado", "right"),
    D("Bacon Breakfast Roll", BR, 2, "Bacon", "in", after="Breakfast Rolls", rank=True),
    D("Sausage Breakfast Roll", BR, 2, "Sausage", "in", after="Breakfast Rolls", rank=True),
    D("Veggie Sausage Breakfast Roll", BR, 2, "Veggie Sausage", "in", after="Breakfast Rolls", rank=True),
    D("Fried Eggs Breakfast Roll", BR, 2, "Fried Eggs", "in", after="Breakfast Rolls", rank=True),
    D("Cheesy Slice (add to a breakfast roll)", BY, 2, "Add a cheesy slice", "right"),
    D("Big Breakfast Roll", BR, 2, "two hash browns and a cheesy slice", "below", after="Big Breakfast Roll", rank=True, nth=0),
    D("Big Breakfast Wrap", BR, 2, "two hash browns and a cheesy slice", "below", after="Big Breakfast Roll", rank=True, nth=1),
    D("Big Breakfast Veggie Roll", BR, 2, "two hash browns and a cheesy slice", "below", after="Big Breakfast Veggie Roll", rank=True, nth=0),
    D("Big Breakfast Veggie Wrap", BR, 2, "two hash browns and a cheesy slice", "below", after="Big Breakfast Veggie Roll", rank=True, nth=1),
    D("Big Breakfast Vegan Roll", BR, 2, "hash browns", "in", after="Big Breakfast Vegan Roll", rank=True, nth=0),
    D("Big Breakfast Vegan Wrap", BR, 2, "hash browns", "in", after="Big Breakfast Vegan Roll", rank=True, nth=1),
    D("Classic Hand Battered Fish, Chips & Mushy Peas", MA, 2, "Mushy Peas* £8.95", "in", rank=True),
    D("Classic Fish, Chips & Mushy Peas (steam cooked fish option)", MA, 2, "Steam cooked fish option available", "in",
      after="Classic Hand Battered Fish", rank=True),
    D("Small Hand Battered Fish, Chips & Mushy Peas", MA, 2, "Chips & Mushy Peas* £6.75", "in", rank=True),
    D("Small Fish, Chips & Mushy Peas (steam cooked fish option)", MA, 2, "Steam cooked fish option available", "in",
      after="Small Hand Battered Fish,", rank=True),
    D("Wholetail Whitby Scampi, Chips & Mushy Peas", MA, 2, "Chips & Mushy Peas £7.50", "in", rank=True),
    D("British Beef Steak Pie, Mash, Garden Peas & Gravy", MA, 2, "Garden Peas & Gravy £7.50", "in", rank=True),
    D("Steak & Kidney Suet Pudding, Chips, Garden Peas & Gravy", MA, 2, "Garden Peas & Gravy £8", "in", rank=True),
    D("Sausage, Egg, Chips & Beans", MA, 2, "& Beans £7", "in", rank=True),
    D("Sausage, Egg, Chips & Beans (vegetarian option)", MA, 2, "Veggie option available", "in", after="Sausage, Egg, Chips", rank=True),
    D("Bangers, Mash, Garden Peas & Gravy", MA, 2, "& Gravy £6.50", "in", rank=True),
    D("Bangers, Mash, Garden Peas & Gravy (vegetarian option)", MA, 2, "Veggie option available", "right", after="Bangers, Mash, Garden Peas",
      rank=True),
    D("Half Roast Chicken & Coleslaw with Chips", MA, 2, "With chips", "in", rank=True, nth=0),
    D("Half Roast Chicken & Coleslaw with Salad", MA, 2, "With chips", "in", rank=True, nth=1),
    D("Ham, Egg & Chips", MA, 2, "Ham, Egg & Chips", "below", rank=True),
    D("Fish & Chip Afternoon Tea For Two (whole tea, serves 2)", MA, 2, "£15", "in", after="Fish & Chip Afternoon Tea For Two"),
    D("Lasagne, Garlic Bread & Side Salad", MA, 2, "Side Salad £7.50", "in", rank=True),
    D("Goodfella's Mac & Cheese, Garlic Bread & Side Salad", MA, 2, "Garlic Bread & Side Salad £7.50", "in", rank=True),
    D("Chicken Tikka Masala, Rice & Naan Bread", MA, 2, "Rice & Naan Bread", "in", rank=True),
    D("Katsu Chicken Curry & Rice", MA, 2, "& Rice £7.50", "in", rank=True),
    D("Quarter Pounder Cheese Burger", BU, 2, "Burger £7.50", "in", after="Quarter Pounder Cheese", rank=True),
    D("Birds Eye Chicken Shop Burger", BU, 2, "Burger £7.50", "in", after="Birds Eye® Chicken Shop®", rank=True),
    D("Vegan ChiQin Buttermilk Burger", BU, 2, "Buttermilk Burger £7.50", "in", rank=True),
    D("Bacon (add to a burger)", BU, 2, "Add bacon", "in"),
    D("Extra Burger (add)", BU, 2, "Add extra burger", "in"),
    D("Extra Chicken Burger (add)", BU, 2, "Add extra chicken burger", "in"),
    D("Bacon (build your own breakfast)", BB, 2, "Bacon", "in", after="£1.25 per item"),
    D("Sausage (build your own breakfast)", BB, 2, "Sausage", "in", after="£1.25 per item"),
    D("Veggie Sausage (build your own breakfast)", BB, 2, "Veggie Sausage", "in", after="£1.25 per item"),
    D("Fried Egg (build your own breakfast)", BB, 2, "Fried Egg", "in", after="£1.25 per item"),
    D("Poached Egg (build your own breakfast)", BB, 2, "Poached Egg", "in", after="£1.25 per item"),
    D("Scrambled Egg (build your own breakfast)", BB, 2, "Scrambled Egg", "in", after="£1.25 per item"),
    D("Black Pudding (build your own breakfast)", BB, 2, "Black Pudding", "in", after="£1.25 per item"),
    D("Smashed Avocado (build your own breakfast)", BB, 2, "Smashed Avocado", "in", after="£1.25 per item"),
    D("Dr Schär Gluten Free Roll (build your own breakfast)", BB, 2, "Dr Schär Gluten Free Roll", "in", after="£1.25 per item"),
    D("Heinz Baked Beanz (build your own breakfast)", BB, 2, "Heinz Baked Beanz", "in", after="75p per item"),
    D("Hash Brown (build your own breakfast)", BB, 2, "Hash Brown", "in", after="75p per item"),
    D("Sliced Mushrooms (build your own breakfast)", BB, 2, "Sliced Mushrooms", "in", after="75p per item"),
    D("Chopped Tomatoes (build your own breakfast)", BB, 2, "Chopped Tomatoes", "in", after="75p per item"),
    D("Fried Bread (build your own breakfast)", BB, 2, "Fried Bread", "in", after="75p per item"),
    D("White/Brown Toast (build your own breakfast)", BB, 2, "White/Brown Toast", "in", after="75p per item"),
    D("White/Brown Bread (build your own breakfast)", BB, 2, "White/Brown Bread", "in", after="75p per item"),
    D("3 Southern Fried Chicken Tenders (chicken combo main)", CH, 2, "3 Southern Fried Chicken Tenders", "in", after="Choose one main"),
    D("5 Chicken Wings (chicken combo main)", CH, 2, "5 Chicken Wings", "in", after="Choose one main"),
    D("5 Boneless Chicken Bites (chicken combo main)", CH, 2, "5 Boneless Chicken Bites", "in", after="Choose one main"),
    D("Vegan ChiQin Buttermilk Burger (chicken combo main)", CH, 2, "Vegan ChiQin Buttermilk Burger", "in", after="Choose one main"),
    D("Rice (chicken combo side)", CH, 2, "Rice", "in", after="Choose two sides"),
    D("Tortilla Wrap (chicken combo side)", CH, 2, "Tortilla Wrap", "in", after="Choose two sides"),
    D("Garden Peas (chicken combo side)", CH, 2, "Garden Peas", "in", after="Choose two sides"),
    D("Heinz Baked Beanz (chicken combo side)", CH, 2, "Heinz Baked Beanz", "in", after="Choose two sides"),
    D("combo side: Chips", CHECK, 2, "Chips", "in", after="Choose two sides", same_as="Chips"),
    D("combo side: Side Salad", CHECK, 2, "Side Salad", "in", after="Choose two sides", same_as="Side Salad"),
    D("combo side: Beer Battered Onion Rings", CHECK, 2, "Beer Battered Onion Rings", "in", after="Choose two sides",
      same_as="Beer Battered Onion Rings"),
    D("combo side: Mini Cheesy Hash Brown Bites", CHECK, 2, "Mini Cheesy Hash Brown Bites", "in", after="Choose two sides",
      same_as="Mini Cheesy Hash Brown Bites"),
    D("combo side: Coleslaw", CHECK, 2, "Coleslaw", "in", after="Choose two sides", same_as="Coleslaw"),
    D("combo sauce: Buffalo Sauce", CHECK, 2, "Buffalo Sauce", "in", after="Choose one sauce", same_as="Buffalo Sauce"),
    D("combo sauce: BBQ Sauce", CHECK, 2, "BBQ Sauce", "in", after="Choose one sauce", same_as="BBQ Sauce"),
    D("combo sauce: Hot Honey Sauce", CHECK, 2, "Hot Honey Sauce", "in", after="Choose one sauce", same_as="Hot Honey Sauce"),
    D("combo sauce: Sweet Chilli Sauce", CHECK, 2, "Sweet Chilli Sauce", "in", after="Choose one sauce", same_as="Sweet Chilli Sauce"),
    D("combo sauce: Garlic & Herb Sauce", CHECK, 2, "Garlic & Herb Sauce", "in", after="Choose one sauce", same_as="Garlic & Herb Sauce"),
    D("combo sauce: Mayo", CHECK, 2, "Mayo", "in", after="Choose one sauce", same_as="Mayo"),
    D("combo sauce: Curry Sauce", CHECK, 2, "Curry Sauce", "in", after="Choose one sauce", same_as="Curry Sauce"),
    D("combo sauce: Gravy", CHECK, 2, "Gravy", "in", after="Choose one sauce", same_as="Gravy"),
]
VEGETARIAN = re.compile(r"\b(veggie|vegan|vegetarian)\b", re.I)
# A dish is tagged vegetarian only when the menu's own name for it says veggie, vegan or vegetarian; nothing else is tagged vegetarian (the
# menu's Vegetarian / Vegan Recipe symbols are pictures with no text, so they are not read).

NOTE = ("Calories only, as printed on Morrisons Café's own menu (England & Wales, October 2026); protein, carbs and fat are not published. "
        "Build-your-own breakfast, chicken combo and kids' items are per item: add them up. Scottish cafés print their own menu; dishes it "
        "prints differently are not listed.")
assert len(NOTE) < 400


class Line:
    def __init__(self, page, x0, y0, x1, y1, words):
        self.page, self.x0, self.y0, self.x1, self.y1, self.words = page, x0, y0, x1, y1, words
        self.text = " ".join(w[2] for w in words)


def read_lines(pdf: Path) -> list[Line]:
    out = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = []
    for pno, pm in enumerate(PAGE.finditer(out), start=1):
        for m in LINE.finditer(pm.group(1)):
            x0, y0, x1, y1, inner = m.groups()
            words = [(float(a), float(c), " ".join(html.unescape(t).split())) for a, _, c, _, t in WORD.findall(inner)]
            words = [w for w in words if w[2]]
            if words:
                lines.append(Line(pno, float(x0), float(y0), float(x1), float(y1), words))
    return lines


def tokens_of(line: Line) -> list[tuple[str, float, int]]:
    """[(kcal, x of the word, sub-index)] on this line. A 'NNNkcal/NNNkcal' word gives two tokens (sub-index 0 and 1)."""
    out = []
    for i, w in enumerate(line.words):
        t = w[2]
        if "kcal" not in t:
            continue
        if t == "2000kcal" and i > 0 and line.words[i - 1][2] == "around":  # footer "Adults need around 2000kcal a day."
            continue
        m, p = TOKEN.match(t), PAIR.match(t)
        if m:
            out.append((m.group(1), w[0], 0))
        elif p:
            out += [(p.group(1), w[0], 0), (p.group(2), w[0], 1)]
        else:
            raise SystemExit(f"unexpected calorie word {t!r} on line {line.text!r}: read it explicitly")
    return out


def key(line: Line, tok) -> tuple:
    return (line.page, round(line.y1, 1), round(tok[1], 1), tok[2])


def starts(l: Line, text: str) -> bool:
    return l.text == text or l.text.startswith(text + " ")


def find_anchor(lines: list[Line], page: int, anchor: str, after: str | None) -> Line | None:
    cands = [l for l in lines if l.page == page and starts(l, anchor)]
    if after:
        heads = [l for l in lines if l.page == page and l.text.startswith(after)]
        best = None
        for h in heads:
            for c in cands:
                if c is h:
                    continue
                dy, dx = c.y1 - h.y1, abs(c.x0 - h.x0)
                if 0 < dy <= 240 and dx <= 250 and (best is None or dy + dx < best[0]):
                    best = (dy + dx, c)
        return best[1] if best else None
    if len(cands) > 1:
        raise SystemExit(f"anchor {anchor!r} matches {len(cands)} lines on page {page}: give it an 'after' line")
    return cands[0] if cands else None


def read_menu(pdf: Path, strict: bool) -> tuple[dict, list]:
    """{dish name: kcal string} for every dish found, and the unclaimed tokens. strict: every dish must be found (E&W)."""
    lines = read_lines(pdf)
    claimed: dict[tuple, str] = {}
    found: dict[str, str] = {}
    standalone = [l for l in lines if len(l.words) == 1 and TOKEN.match(l.text)]
    for mode in ("in", "right", "below"):
        for d in DISHES:
            if d["mode"] != mode:
                continue
            a = find_anchor(lines, d["page"], d["anchor"], d["after"])
            if a is None:
                if strict:
                    raise SystemExit(f"{d['name']}: anchor {d['anchor']!r} (after {d['after']!r}) not found on page {d['page']}: the menu changed")
                continue
            hit = None
            if mode == "in":
                toks = tokens_of(a)
                if len(toks) <= d["nth"]:
                    raise SystemExit(f"{d['name']}: line {a.text!r} has {len(toks)} calorie tokens")
                hit = (a, toks[d["nth"]])
            elif mode == "right":
                c = [l for l in standalone if l.page == a.page and abs(l.y1 - a.y1) <= 6 and l.x0 > a.x1 - 1]
                c.sort(key=lambda l: l.x0 - a.x1)
                if c:
                    hit = (c[0], tokens_of(c[0])[0])
            else:
                c = [l for l in lines if l.page == a.page and tokens_of(l) and 0 < l.y1 - a.y1 <= 40 and a.x0 - 160 <= l.x0 <= a.x1 + 60]
                c.sort(key=lambda l: (l.y1 - a.y1, abs(l.x0 - a.x0)))
                for l in c:
                    toks = tokens_of(l)
                    if len(toks) > d["nth"] and key(l, toks[d["nth"]]) not in claimed:
                        hit = (l, toks[d["nth"]])
                        break
            if hit is None:
                if strict:
                    raise SystemExit(f"{d['name']}: no calorie token found ({mode} of {a.text!r})")
                continue
            k = key(*hit)
            if k in claimed:
                raise SystemExit(f"{d['name']}: token {k} already claimed by {claimed[k]!r}")
            claimed[k] = d["name"]
            found[d["name"]] = hit[1][0]
    all_tokens = [(l, t) for l in lines for t in tokens_of(l)]
    unclaimed = [(l.text, key(l, t)) for l, t in all_tokens if key(l, t) not in claimed]
    return found, unclaimed


def fetch(dest: Path) -> tuple[Path, Path]:
    dest.mkdir(parents=True, exist_ok=True)
    out = []
    for url, fn in ((EW_URL, "cafe-menu-ew.pdf"), (SCOT_URL, "cafe-menu-scot.pdf")):
        p = dest / fn
        if not p.exists():
            proc = subprocess.run(["curl", "-sS", "--fail", "-L", "-A", UA, "-o", str(p), url])
            time.sleep(1.2)
            if proc.returncode != 0:
                raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}): stop, do not work round it")
        out.append(p)
    return out[0], out[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-ew", type=Path)
    ap.add_argument("--pdf-scot", type=Path)
    ap.add_argument("--fetch", type=Path, help="download both menus into this folder (one request each) and read them")
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch:
        args.pdf_ew, args.pdf_scot = fetch(args.fetch)
    if not (args.pdf_ew and args.pdf_scot):
        ap.error("give --pdf-ew and --pdf-scot, or --fetch DIR")
    names = [d["name"] for d in DISHES]
    if len(set(names)) != len(names):
        raise SystemExit("two DISHES rows share a name")
    sha = hashlib.sha256(args.pdf_ew.read_bytes()).hexdigest()
    ew, unclaimed = read_menu(args.pdf_ew, strict=True)
    if unclaimed:
        raise SystemExit(f"E&W tokens not claimed by any dish (the menu changed?): {unclaimed}")
    scot, scot_unclaimed = read_menu(args.pdf_scot, strict=False)
    left_out = []
    # a repeat (CHECK row) printing another figure than the dish it repeats: both are left out, never chosen between
    drop = set()
    for d in DISHES:
        if d["same_as"]:
            if ew[d["name"]] != ew[d["same_as"]]:
                drop.add(d["same_as"])
                left_out.append(f"{d['same_as']}: {ew[d['same_as']]} kcal, but the chicken combo prints {ew[d['name']]} kcal "
                                f"({d['name']})")
    published = [d for d in DISHES if d["cat"] is not CHECK and d["cat"] != SKIP]
    for d in DISHES:
        if d["cat"] == SKIP:
            left_out.append(f"{d['name']}: {ew[d['name']]} kcal printed with no stated basis")
    differ = {d["name"]: (ew[d["name"]], scot[d["name"]]) for d in published if d["name"] in scot and ew[d["name"]] != scot[d["name"]]}
    items = []
    for d in published:
        name = d["name"]
        if name in drop:
            continue
        if name in differ:
            left_out.append(f"{name}: E&W {differ[name][0]} kcal, Scotland {differ[name][1]} kcal")
            continue
        veg = bool(VEGETARIAN.search(name.replace("butter or vegan spread", "")))  # "with butter or vegan spread" is a choice, not a mark
        tags, _ = tk.meat_tags(name, vegetarian=veg)
        if veg:
            tags = ["vegetarian"]
        items.append({"name": name, "category": d["cat"], "calories": ew[name], "protein_g": "", "carbs_g": "", "fat_g": "",
                      "tags": "|".join(tags), "rankable": d["rank"],
                      "notes": "On the England & Wales menu" + (" and the Scottish menu with the same calories" if name in scot else
                                                                "; not printed under this name on the Scottish menu")})
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Morrisons Café", cuisine="Cafe",
        source_title="Morrisons Café menu with calories, England & Wales (E&W Menu Fish & Chips Table Folded Menu MM-10008723, file dated "
                     "2-11-2026, PDF created 19 October 2026), compared with the Scottish menu of the same date",
        source_url=EW_URL, checked_on=args.checked_on,
        aliases=["morrisons cafe", "morrisons café", "morrisons", "morrisons restaurant"],
        items=items, out=args.out, note=NOTE, nutrition_level="calories",
        allergen_guide={"title": "Morrisons TS01K Cafe Allergen Information Guide (V52, 09/11/2026)", "url": ALLERGEN_URL,
                        "checked_on": args.checked_on, "may_contain_published": False},
    )
    print(f"E&W menu sha256 {sha}")
    print(f"E&W figures {len(ew)} ({sum(1 for d in DISHES if d['cat'] is CHECK)} of them combo repeats checked, not published); "
          f"Scottish menu: {len(scot)} of them found, {len(scot_unclaimed)} Scottish-only tokens (not published)")
    print("left out:", left_out)
    print(f"wrote {len(items)} items to {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
