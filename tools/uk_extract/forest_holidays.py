#!/usr/bin/env python3
"""Build data/source/forest-holidays/ from Forest Holidays' own autumn/winter 2026 menu PDFs (a CALORIES-ONLY chain).

    python3 tools/uk_extract/forest_holidays.py --dir DIR --checked-on 2026-10-08 [--fetch] [--out FOLDER]

DIR holds england.pdf, scotland.pdf and beddgelert.pdf (--fetch downloads them: one request per file, a normal browser User-Agent).
Source: https://www.forestholidays.co.uk/food-and-drink/ links three A4 menus (robots.txt there only disallows *?title=*;
assets.forestholidays.co.uk answers 403 for /robots.txt, i.e. publishes none):
    England ("Generic") Autumn Winter menu   .../damprodblob/assets/A4_Generic_Autumn_Winter_Menu_DIG_3bc196ebe7.pdf   (8 pages, created 2026-09-17)
    Scotland Autumn Winter menu              .../A4_Scotland_Autumn_Winter_Menu_DIG_7313821cd1.pdf                    (8 pages, created 2026-09-17)
    Beddgelert takeaway "Bakehouse" menu     .../A4_Beddgelert_Autumn_Winter_Menu_DIG_1_d18a2beaa9.pdf                (2 pages, created 2026-09-17)
Needs `pdftotext` (poppler); the page is read by cell: see forest_holidays_pdf.py.

The menus print calories ONLY, in small type after each dish name ("The woodland breakfast 730kcal GFo, DFo"): protein, carbs, fat and
salt are never printed, so protein/carbs/fat stay blank (docs/DATA.md "Calories-only chains"). Calories are copied from the England PDF
as printed. Only the item names, categories and tags are written by hand, in ITEMS below: the script stops if a printed dish or the
number of printed calorie figures changes, so a person re-checks the table when Forest Holidays publishes new menus.

What is published, and why (the menus differ by site, so a dish is only published when every place that prints it agrees):
- The England PDF is the base. The Scotland PDF must print the same figure wherever it prints the dish under the same name (it prints
  its own "Scottish woodland breakfast" and "big Scottish forest breakfast", which are different dishes and are not published), and
  the Beddgelert PDF too: Beddgelert is one site, so its own dishes are never published, but its figures catch dishes that differ from
  site to site (its 12-inch pizzas print 1,366 to 1,567 kcal where the England menu prints 714 to 1,036).
- A dish that fails a check stays in items.csv and is listed in holdback.csv; neither figure is chosen.
- `hold=ALLERGEN_MENU`: dishes for which Forest Holidays' own Ingredifind allergen menu (igfd.menu, linked from the same page) printed a
  different calorie figure when it was read on 2026-10-08. Nothing from that menu is copied (see below); these dishes are held because
  the chain's two official publications disagree.
- Hot drinks that print two figures with two prices but never name the sizes (Americano, Cappuccino, Latte, Mocha, Hazelnut cappuccino,
  Caramel latte, both hot chocolates) are not listed: a figure without its serving is not published.
- Marks: vegetarian only where the dish carries the menu's own V or VE mark (or says vegan); contains_pork / contains_beef where the
  printed name or description says so (bacon, ham, sausage, pork, pepperoni, chorizo; beef, steak). The "Sausage" and "Black pudding"
  breakfast extras, and the "Pulled pork" in a topping, are described without a meat type or as pork only where stated: see ITEMS.

Allergens (docs/DATA.md "Allergens") are LINK ONLY. The menus print no allergens beyond V/VE/GF/DF marks. Forest Holidays' per-dish
allergen lists live on Ingredifind (igfd.menu), whose User Terms (https://ingredifind.com/terms, 18 Oct 2023) forbid "use of the
Platform by automated means or otherwise for scraping or extracting material", so no list is copied from it. The optional
forest_holidays_ingredifind.py (not used here) shows what a complete-allergen build would look like if the founder accepts that risk.
"""
from __future__ import annotations
import argparse
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402
from forest_holidays_pdf import fmt, kcal_tokens, marks, pdf_value, read_pdf  # noqa: E402

CHAIN_ID = "forest-holidays"
PAGE_URL = "https://www.forestholidays.co.uk/food-and-drink/"
ASSET = "https://assets.forestholidays.co.uk/damprodblob/assets/"
PDF_URLS = {
    "england": ASSET + "A4_Generic_Autumn_Winter_Menu_DIG_3bc196ebe7.pdf",
    "scotland": ASSET + "A4_Scotland_Autumn_Winter_Menu_DIG_7313821cd1.pdf",
    "beddgelert": ASSET + "A4_Beddgelert_Autumn_Winter_Menu_DIG_1_d18a2beaa9.pdf",
}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# 'NNNkcal' figures printed in each PDF (the layout text): a change means the menu changed under this script.
EXPECTED_TOKENS = {"england": 115, "scotland": 115, "beddgelert": 22}
SOURCE_TITLE = ("Forest Holidays Autumn Winter 2026 menus with calories: England (generic) and Scotland A4 PDFs and the Beddgelert "
                "takeaway menu (all PDFs created 17 September 2026)")
ALLERGEN_TITLE = ("Forest Holidays allergen menus on Ingredifind (igfd.menu: per-dish allergens, England menu; accessed 2026-10-08, "
                  "no date shown)")
ALLERGEN_URL = "https://igfd.menu/forest-holidays-england-menu-skio"
NOTE = ("Calories only, per dish as printed (no protein, carbs, fat or salt). Menus differ by site, so a dish is listed only if the "
        "England, Scotland and Beddgelert menus agree on it; it may not be served at every site. Hot drinks that print two unnamed "
        "sizes are left out. Allergens are in Forest Holidays' own allergen menu (linked).")
ALIASES = ["forest holidays", "forest holidays cabins", "forest holidays restaurant", "forest holidays cafe", "forest holidays café",
           "forest holidays dining", "forest holidays bar and restaurant"]
ALLERGEN_MENU = ("Forest Holidays' own Ingredifind allergen menu (igfd.menu, read 2026-10-08) printed a different calorie figure for "
                 "this dish, so the chain's two official publications disagree")

TRAD, WAFF, BAPS, BRUNCH, EXTRAS, SMOOTH, POCKET, MAC, CLASSIC, SOUP, BURG, CURRY, PIZZA, SMALL, FRIES, SIDES = (
    "Traditional cooked breakfast", "Waffles and pancakes", "Breakfast baps", "Light brunch", "Breakfast extras", "Smoothies",
    "Sourdough sandwich pockets", "Loaded mac and cheese", "British classics", "Soup of the day", "Burgers", "Curries", "Pizza",
    "Small plates", "Topped fries", "Sides")
KBREAK, KIDS, SHAKES, DESS, DRINKS = "Children's breakfast", "Children's meals", "Milkshakes", "Desserts", "Drinks"
CATEGORY_ORDER = [TRAD, WAFF, BAPS, BRUNCH, EXTRAS, SMOOTH, POCKET, MAC, CLASSIC, SOUP, BURG, CURRY, PIZZA, SMALL, FRIES, SIDES, KBREAK,
                  KIDS, SHAKES, DESS, DRINKS]


def E(name, cat, pdf, **opt):
    """One dish as the England PDF prints it. `pdf` is the printed name; mode 'next' = the figure is on a line below the name; nth/count =
    which of `count` same-named printed figures; idx = which figure of 'a | b'; scot = the Scotland PDF's name for it (None = it prints
    something else there); bedd/bedd_nth/bedd_count/bedd_note = the Beddgelert PDF's printed name for the same menu line; pork/beef/veg =
    tags read off the printed name and description; hold = a reason to hold it back."""
    return dict(name=name, cat=cat, pdf=pdf, **opt)


ITEMS = [
    # --- Breakfast | brunch (page 2)
    E("Woodland breakfast", TRAD, "The woodland breakfast", scot=None, pork=True),  # bacon, British pork sausage
    E("Big forest breakfast", TRAD, "The big forest breakfast", scot=None, pork=True, hold=ALLERGEN_MENU),  # bacon, pork sausages, black pudding
    E("Plant forest breakfast", TRAD, "The plant forest breakfast"),
    E("Pancakes or waffles with smoked streaky bacon and hot honey", WAFF, "Smoked streaky bacon and hot honey", pork=True),
    E("Pancakes or waffles with fresh berries, coconut yoghurt, granola and maple drizzle", WAFF, "and maple drizzle*"),
    E("Bacon bap", BAPS, "Bacon", pork=True),
    E("Sausage bap", BAPS, "Sausage", count=2, nth=0, pork=True),  # "Two British gluten-free pork sausages"
    E("Vegetable bap", BAPS, "Vegetable"),
    E("Apple orchard porridge", BRUNCH, "Apple orchard porridge"),
    E("Avocado and poached eggs on toast", BRUNCH, "Avocado and poached eggs on toast", mode="next"),
    E("Eggs on toast", BRUNCH, "Eggs on toast - your way"),
    E("Forest breakfast flatbread", BRUNCH, "Forest breakfast flatbread", pork=True),  # British pork sausage
    E("Wild garlic mushrooms on toast", BRUNCH, "Wild garlic mushrooms on toast", mode="next", idx=0, hold=ALLERGEN_MENU),
    E("Wild garlic mushrooms on toast with eggs", BRUNCH, "Wild garlic mushrooms on toast", mode="next", idx=1, hold=ALLERGEN_MENU),
    E("Campfire breakfast hash", BRUNCH, "Campfire breakfast hash", mode="next", idx=0),
    E("Campfire breakfast hash with bacon", BRUNCH, "Campfire breakfast hash", mode="next", idx=1, pork=True),
    E("Streaky bacon", EXTRAS, "Streaky bacon", pork=True),
    E("Sausage", EXTRAS, "Sausage", count=2, nth=1),  # no meat type printed
    E("Vegan sausage", EXTRAS, "Vegan sausage", count=2, nth=0, veg=True),
    E("Beans", EXTRAS, "Beans"),
    E("Toast (white, harvester or sourdough)", EXTRAS, "Toast – White, Harvester or Sourdough"),
    E("Egg (scrambled, poached or fried)", EXTRAS, "Egg – Scrambled, poached or fried"),
    E("Hash brown", EXTRAS, "Hash brown"),
    E("Black pudding", EXTRAS, "Black pudding"),  # no meat type printed
    E("Mushroom", EXTRAS, "Mushroom"),
    E("Tomato", EXTRAS, "Tomato"),
    E("Avocado", EXTRAS, "Avocado"),
    E("Garlic wild mushrooms", EXTRAS, "Garlic wild mushrooms"),
    E("Tropical Sunrise smoothie", SMOOTH, "Tropical Sunrise"),
    E("Forest Berry smoothie", SMOOTH, "Forest Berry"),
    E("Cherry Medley smoothie", SMOOTH, "Cherry Medley"),
    E("Coconut Cooler smoothie", SMOOTH, "Coconut Cooler"),
    # --- All-day dining (page 3)
    E("Cheese and ham sourdough pocket", POCKET, "Cheese and ham", pork=True),
    E("Mediterranean vegetable sourdough pocket", POCKET, "Mediterranean vegetable"),
    E("Forest mushroom loaded mac and cheese", MAC, "Forest mushroom"),
    E("Campfire BBQ loaded mac and cheese", MAC, "Campfire BBQ", pork=True),  # pulled pork
    E("Maple meatballs loaded mac and cheese", MAC, "Maple meatballs", pork=True),  # pork meatballs
    E("Fish and chips", CLASSIC, "Fish and chips"),
    E("Steak and ale pie", CLASSIC, "Steak and ale pie", beef=True),
    E("Ham, egg and chips", CLASSIC, "Ham, egg and chips", pork=True, hold=ALLERGEN_MENU),
    E("Carrot and coriander soup", SOUP, "Carrot & coriander"),
    E("Leek and potato soup", SOUP, "Leek & potato"),
    E("Classic burger", BURG, "The classic", beef=True, bedd="The classic", hold=ALLERGEN_MENU),
    E("Double cheese and bacon burger", BURG, "Double cheese and bacon", pork=True, beef=True, bedd="Double cheese and bacon"),
    E("Pulled pork burger", BURG, "Pulled pork", pork=True, beef=True, bedd="BBQ pulled pork burger",
      bedd_note="the Beddgelert PDF prints a 'BBQ pulled pork burger' at {b} kcal against {e} here (a different description, so it may be "
                "a different dish, but it is the same menu line)"),
    E("BBQ chicken burger", BURG, "BBQ chicken", bedd="BBQ chicken", bedd_nth=1, bedd_count=2, hold=ALLERGEN_MENU),
    E("Vegan BBQ burger", BURG, "Vegan BBQ", bedd="Vegan BBQ"),
    E("Chicken jalfrezi curry", CURRY, "Chicken Jalfrezi", bedd="Chicken Jalfrezi"),
    E("Chicken tikka masala curry", CURRY, "Chicken Tikka Masala", bedd="Chicken Tikka Masala"),
    E("Chicken korma curry", CURRY, "Chicken Korma", bedd="Chicken Korma"),
    E("Vegetable balti curry", CURRY, "Vegetable Balti", count=2, nth=0, bedd="Vegetable Balti"),
    E("Naan and dips", CURRY, "Naan and dips", bedd="Naan and pickles"),
    # --- Pizza | small plates (page 4)
    E("Spicy Italian pizza", PIZZA, "Spicy Italian", pork=True, bedd="Spicy meats",
      bedd_note="the Beddgelert PDF prints 'Spicy meats' at {b} kcal against {e} here (a different name and description, so it may be a "
                "different dish, but it is the same menu line)"),
    E("Mediterranean pizza", PIZZA, "Mediterranean", bedd="Mediterranean"),
    E("Margherita pizza", PIZZA, "Margherita", bedd="Margherita"),
    E("Ham and spicy pineapple pizza", PIZZA, "Ham and spicy pineapple", pork=True, bedd="Ham and spicy pineapple"),
    E("Meatball pizza", PIZZA, "Meatball", pork=True),
    E("BBQ southern-fried chicken strips", SMALL, "BBQ southern-fried chicken strips"),
    E("Meatballs", SMALL, "Meatballs", pork=True),  # pork meatballs
    E("Crispy spinach and ricotta ravioli", SMALL, "Crispy spinach and ricotta ravioli", hold=ALLERGEN_MENU),
    E("BBQ smash browns", SMALL, "BBQ smash browns"),
    E("Charred corn ribs", SMALL, "Charred corn ribs", hold=ALLERGEN_MENU),
    E("BBQ pulled pork loaded fries", FRIES, "BBQ pulled pork loaded fries", pork=True),
    E("Vegetable balti loaded fries", FRIES, "Vegetable Balti", count=2, nth=1),
    E("Garlic and rosemary salted skin-on fries", SIDES, "Garlic and rosemary salted skin-on fries", bedd="Garlic and rosemary salted skin-on fries"),
    E("Sweet potato wedges", SIDES, "Sweet potato wedges", bedd="Sweet potato wedges"),
    E("Waffle fries", SIDES, "Waffle fries", bedd="Waffle fries"),
    E("Battered onion rings", SIDES, "Battered onion rings", bedd="Battered onion rings"),
    E("Garlic and herb flatbread", SIDES, "Garlic and herb flatbread", bedd="Garlic and herb flatbread", hold=ALLERGEN_MENU),
    E("Garlic, herb and mozzarella flatbread", SIDES, "Garlic, herb and mozzarella flatbread", bedd="Garlic, herb and mozzarella flatbread",
      hold=ALLERGEN_MENU),
    # --- Children's menu | desserts (page 5)
    E("Little forest breakfast", KBREAK, "The little forest breakfast", pork=True),
    E("Kids beans on toast", KBREAK, "Beans on toast"),
    E("Kids pancakes with Nutella", KBREAK, "Nutella"),
    E("Kids pancakes with syrup", KBREAK, "Syrup"),
    E("Kids cheese and tomato pizza", KIDS, "Cheese and tomato"),
    E("Kids pepperoni pizza", KIDS, "Pepperoni", pork=True),  # the children's pizza; Beddgelert's 'Pepperoni' is a 12-inch main pizza
    E("Kids ham sandwich", KIDS, "Houghton British ham", pork=True),
    E("Kids jam sandwich", KIDS, "Jam"),
    E("Kids cheese sandwich", KIDS, "Cheese"),
    E("Kids pork sausages", KIDS, "British pork sausage", pork=True),
    E("Kids vegan sausages", KIDS, "Vegan sausage", count=2, nth=1),
    E("Kids southern-fried chicken tenders", KIDS, "Southern-fried chicken tenders"),
    E("Kids mini beef burger", KIDS, "Mini beef burger", beef=True),
    E("Kids mac and cheese", KIDS, "Mac and cheese", hold=ALLERGEN_MENU),
    E("Chocolate milkshake", SHAKES, "Chocolate", count=2),
    E("Strawberry milkshake", SHAKES, "Strawberry", count=2),
    E("Vanilla milkshake", SHAKES, "Vanilla", count=2),
    E("Panettone bread and butter pudding", DESS, "Panettone bread and butter pudding"),
    E("Banana sticky toffee", DESS, "Banana sticky toffee"),
    E("Lemon and raspberry cheesecake", DESS, "Lemon and raspberry cheesecake", mode="next"),
    E("Apple and blackberry crumble", DESS, "Apple and blackberry crumble"),
    E("Kids ice cream", DESS, "Kids ice cream"),
    # --- Drinks (page 6): only the drinks that print ONE figure
    E("Espresso", DRINKS, "Espresso"),
    E("Flat white", DRINKS, "Flat white"),
    E("Babyccino", DRINKS, "Babyccino"),
    E("Tea (Earl Grey, English Breakfast or herbal)", DRINKS, "Tea"),
    E("Iced latte", DRINKS, "Iced latte"),
    E("Iced americano", DRINKS, "Iced americano"),
]


def download(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for site, url in PDF_URLS.items():
        time.sleep(1.1)
        (folder / f"{site}.pdf").write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers={"user-agent": UA}), timeout=300).read())


def build(folder: Path):
    pdfs = {site: read_pdf(folder / f"{site}.pdf") for site in PDF_URLS}
    for site, lines in pdfs.items():
        if kcal_tokens(lines) != EXPECTED_TOKENS[site]:
            raise SystemExit(f"{site} PDF now prints {kcal_tokens(lines)} calorie figures, this script expects {EXPECTED_TOKENS[site]}: the menu "
                             "changed. Re-read it and update ITEMS (and the expected counts) before running again.")
    items, notes_out = [], []
    for spec in ITEMS:
        mode, idx, nth, count = spec.get("mode", "same"), spec.get("idx", 0), spec.get("nth", 0), spec.get("count", 1)
        e_val, e_rest, e_all = pdf_value(pdfs["england"], spec["pdf"], "England", mode, nth, count, idx)
        if count > 1 and spec["name"].endswith("milkshake") and len({tuple(v) for v, _ in e_all}) != 1:
            raise SystemExit(f"{spec['pdf']!r}: the two printed milkshake figures differ: {e_all}")
        problems, facts = [], [f"England PDF {spec['pdf']!r} {fmt(e_val)}"]
        if e_val <= 0 and spec["name"] not in ("Tea (Earl Grey, English Breakfast or herbal)",):
            raise SystemExit(f"{spec['name']}: calories {e_val} is not positive")
        # the Scotland PDF must print the same figure for the same name
        s_name = spec.get("scot", spec["pdf"])
        if s_name is not None:
            s_val, _, _ = pdf_value(pdfs["scotland"], s_name, "Scotland", mode, nth, count, idx)
            facts.append(f"Scotland PDF {fmt(s_val)}")
            if s_val != e_val:
                problems.append(f"the Scotland PDF prints {fmt(s_val)} kcal for '{s_name}' against {fmt(e_val)} in the England PDF")
        else:
            facts.append("the Scotland PDF prints a different dish (a 'Scottish' version) instead")
        # the Beddgelert PDF must print the same figure for the same menu line
        if spec.get("bedd"):
            b_val, _, _ = pdf_value(pdfs["beddgelert"], spec["bedd"], "Beddgelert", "same", spec.get("bedd_nth", 0), spec.get("bedd_count", 1))
            facts.append(f"Beddgelert PDF {spec['bedd']!r} {fmt(b_val)}")
            if b_val != e_val:
                problems.append(spec.get("bedd_note", "the Beddgelert PDF prints '{n}' at {b} kcal against {e} in the England PDF").format(
                    n=spec["bedd"], b=fmt(b_val), e=fmt(e_val)))
        if spec.get("hold"):
            problems.append(spec["hold"])
        # tags: vegetarian only from the menu's own V / VE mark on the dish's figure (or the name saying vegan)
        m = marks(e_rest) if idx == 0 else set()
        veg = bool(m & {"v", "ve"}) or bool(spec.get("veg"))
        if veg and (spec.get("pork") or spec.get("beef")):
            raise SystemExit(f"{spec['name']}: marked vegetarian but also tagged with meat: check ITEMS")
        tags = (["vegetarian"] if veg else []) + (["contains_pork"] if spec.get("pork") else []) + (["contains_beef"] if spec.get("beef") else [])
        items.append(dict(id=slug(spec["name"]), name=spec["name"], category=spec["cat"], calories=fmt(e_val), tags="|".join(tags),
                          rankable=False, problems=problems,
                          notes="; ".join([*facts, f"marks {sorted(m)}" if m else "no marks"])))
    if len({i["id"] for i in items}) != len(items):
        raise SystemExit("two items share a name: give them distinct names in ITEMS")
    return items, notes_out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, required=True, help="folder with england.pdf, scotland.pdf, beddgelert.pdf")
    ap.add_argument("--checked-on", required=True, help="the day the menus were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the three PDFs into --dir first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        download(args.dir)
    for site in PDF_URLS:
        print(f"{site}.pdf sha256 {sha256_file(args.dir / (site + '.pdf'))}")
    items, _ = build(args.dir)
    holdback = []
    for it in items:
        problems = it.pop("problems")
        if problems:
            reason = "; ".join(problems)
            holdback.append((it["id"], reason[0].upper() + reason[1:] + ". Neither is chosen: restore by deleting this line once "
                                       "Forest Holidays' menus agree."))
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Forest Holidays", cuisine="Holiday cabin restaurant", source_title=SOURCE_TITLE,
                             source_url=PAGE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items ({len(holdback)} held back, {len(items) - len(holdback)} published) to {out}: "
          + ", ".join(f"{c} {n}" for c, n in counts.items() if n))


if __name__ == "__main__":
    main()
