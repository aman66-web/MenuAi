#!/usr/bin/env python3
"""Build data/source/booths-cafe/ from the Booths Café menus (a CALORIES-ONLY chain).

    python3 tools/uk_extract/booths_cafe.py menu1.pdf --menu2 menu2.pdf --menu3 menu3.pdf --checked-on 2026-10-11 [--out DIR]

Source: https://www.booths.co.uk/dining-by-booths/booths-cafe/ (robots.txt: `User-agent: *  Disallow:` plus one plugin file) links three
FlippingBook menus, one per tier of café ("Some of our cafés don't have the space required or the equipment needed to offer our full
menu, so we offer a tiered system of menus"), read 2026-10-11:
    Menu 1  https://online.flippingbook.com/view/875606587/  8 cafés: Lytham, Kendal, Ulverston, Penrith, Garstang, Fulwood, Ilkley, Windermere
    Menu 2  https://online.flippingbook.com/view/862101189/  4 cafés: Longton, Penwortham, Carnforth, Barrowford
    Menu 3  https://online.flippingbook.com/view/862275379/  3 cafés: Poulton, St Annes, Burscough
(a fourth flipbook, the Seasonal Specials insert "until 03.11.26", is not read.) Each PDF is the publisher's own "Download" of the
flipbook (the viewer's Download button, "Full Flipbook", enabled by Booths): 8 A5 pages with a text layer, InDesign, created 2 Sept 2026,
footer code FAut26. online.flippingbook.com robots.txt allows everything; the PDFs are served from the viewer's CloudFront host
(d17lvj5xn8sco6.cloudfront.net), whose /robots.txt answers 403 <MissingKey> (every unsigned path does: signed-URL delivery, not a rule;
images_common.py reads this as "no rules"). The pages carry <meta name="robots" content="noindex,nofollow">, a search-engine directive.
Needs `pdftotext` (poppler); the reading is in booths_cafe_pdf.py.

Cross-check of the three menus (done on every run): Menu 2 and Menu 3 are subsets of Menu 1 with identical figures, so no dish is printed
with two different values. Menu 2 leaves out the hot-food items (chips, fries, cottage pie, sausage / fish fingers & chips, ham egg & chips),
Menu 3 those and the breakfasts and the fish finger sandwich. The script stops if a dish on Menu 2 or 3 is not on Menu 1 or prints another
figure. Every dish below is on Menu 1, i.e. at 8 cafés (12 or 15 for the dishes the smaller menus keep).

The menu prints calories ONLY ("503kcal" beside each dish): protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"). Calories
are copied from the PDF as printed. Names, categories and tags are written by hand in ITEMS, keyed by the printed name: the script stops if the
kcal figures printed differ from this table (a new, removed or renamed dish, another figure count, a moved column).

How the menu's own wording is read:
- Names: the printed capitals are tidied, and the menu section's dish type is added where the name is only a filling (BACON under Breakfast
  Sandwiches -> "Bacon Breakfast Sandwich"; PRAWN & MARIE ROSE SAUCE appears as a sandwich, a jacket potato and a salad). Every dish in a "Little ..."
  section is named "Little ..." because the same names are printed again for adults with other values (Three Cheese on Toast 752 / 352,
  Fruit Salad 110 / 55, French Fries 346 / 115, Scrambled Egg on Toast, Hot Chocolate 361 / 267 / 441 with cream and marshmallows).
- The toast breads and the two preserves are printed as option lines under one heading ("2 SLICES OF TOAST: Thick cut white bread 390kcal, wholemeal
  336kcal, sourdough 341kcal"; "THURSDAY COTTAGE PRESERVES: Strawberry jam 99kcal, Blood orange marmalade 100kcal"): one item per option.
  "Flavoured tea 2kcal" and "Pot of tea 39kcal" name two flavours each with one value: one item each. "Add flavoured syrup 46kcal" is the syrup's own value.
- Printed without calories, so not listed: Pastries and the counter cakes ("see our counter"), Yogurt Pouches, Pip Organic, Frobishers, Coca-Cola, Franklin & Sons,
  Harrogate Water, Prosecco, the Afternoon Tea and its set price, the seasonal specials insert.
- Serving is not stated (tea/coffee cup size is not given), so `serving` stays blank. 0 kcal (Gunpowder Green and Moroccan Mint teas) is printed as "0kcal".
- Tags: pork when the dish's name or the printed ingredient text says bacon, sausage ("pork sausage"), ham, chorizo or black pudding; vegetarian only
  where the dish's own name says so (Booths Vegetarian Breakfast, Little Vegetarian Breakfast). The menu's Vegetarian*/Vegan* icons are pictures with
  no text, so they are not read. Meat type not stated: Booths Butchers Chilli Con Carne, Cottage Pie.
- Allergens: the menu prints only "traces of gluten, nuts, seeds and other allergens may be present, ask a colleague" and the booths.co.uk café page links
  no allergen matrix, so none are published.
"""
from __future__ import annotations
import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import booths_cafe_pdf as reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "booths-cafe"
SOURCE_URL = "https://online.flippingbook.com/view/875606587/"
SOURCE_TITLE = "Booths Café Menu 1 (autumn 2026, FAut26; PDF created 2 September 2026), with Menus 2 and 3 for the smaller cafés"
ALIASES = ["booths cafe", "booths café", "booths", "booths supermarket cafe", "booths supermarket café"]
NOTE = ("Booths prints calories only. These are the full Menu 1 dishes, served at 8 of its 15 cafés: the smaller cafés offer a shorter menu with "
        "the same calories (check your café). The seasonal specials insert is not listed.")
EXPECTED_ITEMS = 79
PORK, VEG = ["contains_pork"], ["vegetarian"]

BS, SB, OT, FB, BK = "Breakfast sandwiches", "Speciality breakfasts", "On toast", "Fruit bowls", "From our bakery"
SW, HS, SI, PZ, JP, MM, SA, SO = "Sandwiches & wraps", "Hot sandwiches", "Sides", "Pizzas", "Jacket potatoes", "Main meals", "Salads", "Soups"
LB, LM, LS, LW, LD = "Little breakfasts", "Little meals", "Little snacks", "Little sandwiches", "Little drinks"
TE, CO, HC, MA, SD = "Tea", "Coffee", "Hot chocolate", "Matcha", "Soft drinks"


def E(page, column, label, name, category, tags=(), note="", id=None):
    return dict(key=(page, column, label), name=name, category=category, tags=list(tags), note=note, id=id)


# One entry per kcal figure on Menu 1: (page, column 0 = left / 1 = right, printed name) -> name, category, tags.
ITEMS = [
    E(3, 0, "BACON", "Bacon Breakfast Sandwich", BS, PORK, "Served on a white or brown roll"),
    E(3, 0, "SAUSAGE", "Sausage Breakfast Sandwich", BS, PORK, "Served on a white or brown roll"),
    E(3, 0, "SAUTÉED MUSHROOMS, SMASHED AVOCADO & TOMATO", "Sautéed Mushrooms, Smashed Avocado & Tomato Breakfast Sandwich", BS,
      id="sauteed-mushrooms-smashed-avocado-and-tomato-breakfast-sandwich"),  # slug() would turn the e-acute into a hyphen
    E(3, 1, "BOOTHS SIGNATURE BREAKFAST", "Booths Signature Breakfast", SB, PORK, "Two rashers of bacon, pork sausage, black pudding..."),
    E(3, 1, "BOOTHS VEGETARIAN BREAKFAST", "Booths Vegetarian Breakfast", SB, VEG),
    E(3, 0, "HALLOUMI, AVOCADO & POACHED EGGS", "Halloumi, Avocado & Poached Eggs on Toast", OT),
    E(3, 0, "SCRAMBLED EGG", "Scrambled Egg on Toast", OT, (), "Printed 'SCRAMBLED EGG 912kcal' with no description, under On Toast; 912 is much higher than the smashed avocado on toast beside it (431) and the Little Scrambled Egg on Toast (455), as printed"),
    E(3, 0, "SMASHED AVOCADO & VINE TOMATOES", "Smashed Avocado & Vine Tomatoes on Toast", OT),
    E(3, 1, "FRUIT TEACAKE", "Fruit Teacake", BK),
    E(3, 1, "2 CRUMPETS", "2 Crumpets", BK),
    E(3, 1, "Thick cut white bread", "2 Slices of Toast (thick cut white bread)", BK, (), "Printed under '2 SLICES OF TOAST'"),
    E(3, 1, "Thick cut wholemeal bread", "2 Slices of Toast (thick cut wholemeal bread)", BK, (), "Printed under '2 SLICES OF TOAST'"),
    E(3, 1, "Thick cut sourdough bread", "2 Slices of Toast (thick cut sourdough bread)", BK, (), "Printed under '2 SLICES OF TOAST'"),
    E(3, 1, "Strawberry jam", "Thursday Cottage Strawberry Jam", BK, (), "Printed under 'THURSDAY COTTAGE PRESERVES' (60p)"),
    E(3, 1, "Blood orange marmalade", "Thursday Cottage Blood Orange Marmalade", BK, (), "Printed under 'THURSDAY COTTAGE PRESERVES' (60p)"),
    E(3, 0, "GRANOLA WITH SEASONAL FRUITS", "Granola with Seasonal Fruits", FB),
    E(3, 0, "FRUIT SALAD", "Fruit Salad", FB),
    E(4, 0, "CHICKEN CAESAR", "Chicken Caesar Wrap", SW, PORK, "British chicken breast, bacon, Caesar mayonnaise and lettuce, on a soft wrap"),
    E(4, 0, "HOT SMOKED SALMON", "Hot Smoked Salmon Sandwich", SW, (), "On soft rye bread"),
    E(4, 0, "PRAWN & MARIE ROSE SAUCE", "Prawn & Marie Rose Sauce Sandwich", SW, (), "On harvester bread"),
    E(4, 0, "EGG MAYONNAISE", "Egg Mayonnaise Sandwich", SW, (), "On harvester bread"),
    E(4, 1, "FISH FINGER SANDWICH", "Fish Finger Sandwich", HS),
    E(4, 1, "HAM & LANCASHIRE CHEESE", "Ham & Lancashire Cheese", HS, PORK, "Roast ham; on toasted thick cut white bread"),
    E(4, 1, "SAUSAGE & LANCASHIRE CHEESE TOASTIE", "Sausage & Lancashire Cheese Toastie", HS, PORK, "Booths pork sausage"),
    E(4, 1, "THREE CHEESE ON TOAST", "Three Cheese on Toast", HS),
    E(4, 1, "BOOTHS FRENCH FRIES", "Booths French Fries", SI),
    E(4, 1, "BOOTHS CHUNKY CHIPS", "Booths Chunky Chips", SI),
    E(5, 0, "MARGHERITA", "Margherita Pizza", PZ),
    E(5, 0, "CHORIZO, ‘NDUJA & HOT HONEY", "Chorizo, ‘Nduja & Hot Honey Pizza", PZ, PORK, "Smoky chorizo and spicy 'Nduja"),
    E(5, 0, "BOOTHS BUTCHERS CHILLI CON CARNE", "Booths Butchers Chilli Con Carne Jacket Potato", JP, (), "Meat type not stated"),
    E(5, 0, "PRAWN & MARIE ROSE SAUCE", "Prawn & Marie Rose Sauce Jacket Potato", JP),
    E(5, 0, "BOOTHS SPECIAL RESERVE TASTY LANCASHIRE CHEESE", "Booths Special Reserve Tasty Lancashire Cheese Jacket Potato", JP),
    E(5, 0, "BAKED BEANS", "Baked Beans Jacket Potato", JP),
    E(5, 1, "HAM, EGG & CHIPS", "Ham, Egg & Chips", MM, PORK, "British roast ham"),
    E(5, 1, "COTTAGE PIE", "Cottage Pie", MM, (), "Meat type not stated"),
    E(5, 1, "PRAWN & MARIE ROSE SAUCE", "Prawn & Marie Rose Sauce Salad", SA),
    E(5, 1, "GOAT'S CHEESE", "Goat's Cheese Salad", SA),
    E(5, 1, "WOODLAND MUSHROOM", "Woodland Mushroom Soup", SO),
    E(5, 1, "FRAGRANT SPICED LENTIL", "Fragrant Spiced Lentil Soup", SO),
    E(6, 0, "LITTLE BREAKFAST", "Little Breakfast", LB, PORK, "Bacon, pork sausage, scrambled egg, hash brown and baked beans, with toast"),
    E(6, 0, "LITTLE VEGETARIAN BREAKFAST", "Little Vegetarian Breakfast", LB, VEG),
    E(6, 0, "SCRAMBLED EGG ON TOAST", "Little Scrambled Egg on Toast", LB),
    E(6, 0, "CHEESY BEANS ON TOAST", "Little Cheesy Beans on Toast", LB),
    E(6, 0, "SMASHED AVOCADO ON TOAST", "Little Smashed Avocado on Toast", LB),
    E(6, 0, "SAUSAGE & CHIPS", "Little Sausage & Chips", LM, PORK, "2 pork sausages and French fries, with baked beans"),
    E(6, 0, "FISH FINGERS & CHIPS", "Little Fish Fingers & Chips", LM, (), "2 fish fingers and French fries, with baked beans"),
    E(6, 0, "HOUMOUS, CARROT & CUCUMBER STICKS", "Little Houmous, Carrot & Cucumber Sticks", LS),
    E(6, 0, "FRUIT SALAD", "Little Fruit Salad", LS),
    E(6, 0, "FRENCH FRIES", "Little French Fries", LS),
    E(6, 1, "THREE CHEESE ON TOAST", "Little Three Cheese on Toast", LW),
    E(6, 1, "HAM & LANCASHIRE CHEESE TOASTIE", "Little Ham & Lancashire Cheese Toastie", LW, PORK, "Ham"),
    E(6, 1, "LANCASHIRE CHEESE SANDWICH", "Little Lancashire Cheese Sandwich", LW),
    E(6, 1, "ROAST HAM SANDWICH", "Little Roast Ham Sandwich", LW, PORK, "Ham"),
    E(6, 1, "EGG MAYONNAISE SANDWICH", "Little Egg Mayonnaise Sandwich", LW),
    E(6, 1, "HOT CHOCOLATE", "Little Hot Chocolate", LD, (), "With cream and marshmallows"),
    E(6, 1, "GLASS OF MILK", "Little Glass of Milk", LD),
    E(6, 1, "BABYCCINO", "Little Babyccino", LD),
    E(8, 0, "POT OF TEA", "Pot of Tea", TE, (), "Breakfast or decaf, one printed value"),
    E(8, 0, "FLAVOURED TEA", "Flavoured Tea", TE, (), "Two flavours (lemon ginger & turmeric; hibiscous rose & sweet berries), one printed value"),
    E(8, 0, "BOOTHS ASSAM", "Booths Assam Tea", TE, (), "Loose leaf"),
    E(8, 0, "BOOTHS EARL GREY", "Booths Earl Grey Tea", TE, (), "Loose leaf"),
    E(8, 0, "BOOTHS GUNPOWDER GREEN", "Booths Gunpowder Green Tea", TE, (), "Loose leaf; printed 0kcal"),
    E(8, 0, "BOOTHS MOROCCAN MINT", "Booths Moroccan Mint Tea", TE, (), "Loose leaf; printed 0kcal"),
    E(8, 0, "CAPPUCCINO", "Cappuccino", CO),
    E(8, 0, "LATTE", "Latte", CO),
    E(8, 0, "ICED LATTE", "Iced Latte", CO),
    E(8, 0, "FLAT WHITE", "Flat White", CO),
    E(8, 0, "WHITE AMERICANO", "White Americano", CO),
    E(8, 0, "BLACK AMERICANO", "Black Americano", CO),
    E(8, 0, "ESPRESSO", "Espresso", CO),
    E(8, 0, "MOCHA", "Mocha", CO),
    E(8, 0, "Add flavoured syrup", "Add flavoured syrup (vanilla, caramel or cinnamon)", CO, (), "The syrup's own value (50p), not a coffee total"),
    E(8, 1, "BOOTHS COLOMBIAN", "Booths Colombian Coffee", CO, (), "Roast & Ground"),
    E(8, 1, "BOOTHS MONSOON MALABAR", "Booths Monsoon Malabar Coffee", CO, (), "Roast & Ground"),
    E(8, 1, "BOOTHS SWISS DECAFF", "Booths Swiss Decaff Coffee", CO, (), "Roast & Ground"),
    E(8, 1, "HOT CHOCOLATE WITH CREAM & MARSHMALLOWS", "Hot Chocolate with Cream & Marshmallows", HC),
    E(8, 1, "HOT CHOCOLATE", "Hot Chocolate", HC),
    E(8, 1, "ICED VANILLA OAT MATCHA", "Iced Vanilla Oat Matcha", MA),
    E(8, 1, "FRESHLY SQUEEZED ORANGE JUICE", "Freshly Squeezed Orange Juice", SD),
]


def build_items(printed: list[dict]) -> list[dict]:
    table = {e["key"]: e for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (page, column, printed name)")
    found = {}
    for p in printed:
        key = (p["page"], p["column"], p["label"])
        if key in found:
            raise SystemExit(f"{key} is printed twice on the same page and column: check the layout")
        found[key] = p
    new, gone = sorted(set(found) - set(table)), sorted(set(table) - set(found))
    if new or gone:
        raise SystemExit(f"The menu changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. "
                         "Update ITEMS (names, categories) after reading the new menu.")
    items = []
    for e in ITEMS:
        p = found[e["key"]]
        page, column, label = e["key"]
        note = f"Printed '{label}' {p['kcal']}kcal on page {page}" + (f"; {e['note']}" if e["note"] else "")
        items.append(dict(name=e["name"], id=e["id"], category=e["category"], calories=p["kcal"], tags="|".join(e["tags"]), rankable=False, notes=note))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check ITEMS")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        dup = sorted(n for n, c in Counter(names).items() if c > 1)
        raise SystemExit(f"Item names are not unique: {dup}")
    return items


def cross_check(menu1: list[dict], other: list[dict], name: str) -> int:
    """Menu 2 / 3 may only hold dishes Menu 1 holds, with the same figure. Returns how many dishes it shares with Menu 1."""
    c1 = Counter((p["label"], p["kcal"]) for p in menu1)
    cx = Counter((p["label"], p["kcal"]) for p in other)
    extra = cx - c1
    if extra:
        raise SystemExit(f"{name} prints dishes or figures that Menu 1 does not: {sorted(extra.elements())}. Two menus printing different calories for "
                         "one dish must be left out (never choose): decide by hand.")
    return sum(cx.values())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("menu1", type=Path, help="Menu 1 PDF (SOURCE_URL's flipbook 'Download')")
    ap.add_argument("--menu2", type=Path, required=True)
    ap.add_argument("--menu3", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for n, p in (("menu 1", args.menu1), ("menu 2", args.menu2), ("menu 3", args.menu3)):
        print(f"{n} sha256 {sha256_file(p)}  {p}")
    m1, m2, m3 = (reader.read_kcal(p) for p in (args.menu1, args.menu2, args.menu3))
    n2, n3 = cross_check(m1, m2, "Menu 2"), cross_check(m1, m3, "Menu 3")
    print(f"kcal figures: Menu 1 {len(m1)}, Menu 2 {n2} (all on Menu 1, same values), Menu 3 {n3} (all on Menu 1, same values)")
    items = build_items(m1)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Booths Café", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories")
    cats = Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))


if __name__ == "__main__":
    main()
