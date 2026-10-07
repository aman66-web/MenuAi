#!/usr/bin/env python3
"""Build data/source/esquires/ from Esquires Coffee's own menu pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/esquires.py --pages DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

DIR holds the two saved pages (esquires_food_drink.html, esquires_seasonal.html); --fetch downloads them first with curl
(one request each, one second apart, normal browser User-Agent; robots.txt on the site is "Disallow:" with nothing after it).

Sources (both are Esquires' own pages, linked from / listed by its own site; neither shows a date or version):
    https://esquirescoffee.co.uk/food-drink/      the "Our Menu" page: FRESH FOOD and DRINKS
    https://esquirescoffee.co.uk/current-offers/  "Seasonal Specials - Autumn looks good on our seasonal favourites" (in the site's
                                                  page sitemap, same layout; not linked from the navigation, so it may go away)

What the pages print: a name, a description and "514kcal" for each food item; for drinks only "72kcal". Nothing else: no protein,
carbs, fat, sugar, salt, kJ, weights or sizes, and no allergen information anywhere on the site (no allergen page in the site's
sitemaps or navigation; the menu page, Contact, Our Story, Our Ethos and Terms pages contain no allergen text). So:
- nutrition_level = "calories": protein, carbs and fat stay BLANK (docs/DATA.md "Calories-only chains"); no extra columns exist.
- allergens: none (no guide to link, so no allergens.csv and no allergen_guide.csv).

How the wording is read:
- One printed figure = the item as sold. `serving` stays blank (the pages state none, and no drink size).
- TWO printed figures ("178kcal / 249kcal", "227/252kcal"): the pages never say what the two figures are (sizes? shots?), so there
  is no stated serving or basis for either. Such drinks are NOT listed (TWO_VALUES below lists them; the run stops if that set
  changes, e.g. when the chain starts labelling the sizes). Nothing is guessed from the order of the figures.
- "(V)" and "(VE)" after a name are the chain's own vegetarian / vegan marks: they become the `vegetarian` tag and are removed from the
  name. Items without a mark get no tag. contains_pork / contains_beef only from the item name or description (bacon, ham, sausage,
  pork, ...; beef): a dish the chain marks vegetarian gets neither (the Full Vegetarian has "vegan sausages"). 'nduja' is added to the
  pork words because it is a pork salume (same judgement as chorizo in wahaca.py).
- Categories are the chain's own page headings: "Fresh food", "Drinks", "Seasonal specials". Seasonal items are limited_time.
- Every item is rankable=false (calories-only chains have no suggestions).
Names are copied from the pages; if the pages gain, lose or rename an item, or print a figure in another shape, the run stops.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "esquires"
BASE = "https://esquirescoffee.co.uk"
PAGES = {  # file name -> url
    "esquires_food_drink.html": BASE + "/food-drink/",
    "esquires_seasonal.html": BASE + "/current-offers/",
}
SOURCE_URL = BASE + "/food-drink/"
SOURCE_TITLE = ("Esquires Coffee Food & Drink menu page and Seasonal Specials page (accessed {checked}, no date shown)")
ALIASES = ["esquires", "esquires coffee", "esquires coffee uk"]
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
NOTE = ("Esquires prints calories only, as one figure per item; protein, carbs and fat are not published. Coffees, hot chocolates and "
        "lattes that print two unlabelled figures (no sizes stated) are not listed. Autumn specials come from its Seasonal Specials "
        "page. Its website publishes no allergen guide, so none is shown.")

# Section heading on the page -> category shown. The seasonal page has no h2: its headline is "SEASONAL SPECIALS".
CATEGORY = {"FRESH FOOD": "Fresh food", "DRINKS": "Drinks", "SEASONAL SPECIALS": "Seasonal specials"}
PAGE_DEFAULT_SECTION = {"esquires_seasonal.html": "SEASONAL SPECIALS"}

# The names the pages print (marks like "(V)" included), in page order: the guard that stops the run when the menu changes.
ONE_VALUE = {
    "FRESH FOOD": [
        "Bacon Bap", "Cumberland Sausage Bap", "Ultimate Avo with egg & bacon", "Smashed Avo (VE)",
        "Ultimate Avo with egg & halloumi (VE)", "Eggs Benedict", "Eggs Royale", "Eggs Florentine (V)",
        "Poached Eggs on Sourdough (V)", "Scrambled Eggs On Sourdough (V)", "Beans On Sourdough (V)", "Esquires Full English",
        "Esquires Full Vegetarian (V)", "Mixed Berry Porridge (V)", "Maple Bacon Pancakes", "Very Berry Pancakes (VE)",
        "Chicken BLT Bagel", "Smoked Salmon Bagel", "Halloumi & Avocado Sourdough (V)", "Pesto Chicken & Nduja Sourdough",
        "Ham & Cheese Sourdough", "Avocado & Halloumi Jacket Potato (V)", "Pesto Chicken Jacket Potato",
        "Tuna Mayonnaise Jacket Potato", "Chicken Tikka Jacket Potato", "Ham & Cheese Melt", "Mushroom Melt (V)",
    ],
    "DRINKS": [
        "Cortado", "Flat White", "Latte Frappé", "Mocha Frappé", "Mango & Dragon Fruit Smoothie",
        "Pineapple, Mango & Passion Fruit Smoothie", "Strawberry & Banana Smoothie", "Super Green Smoothie", "Super Berry Smoothie",
        "Mug of English Breakfast Tea", "Pot of Peppermint Tea", "Pot of Red Berry Tea", "Pot of Apple Loves Mint Tea",
        "Pot of Chamomile Tea", "Pot of Earl Grey Tea", "Pot of Breakfast Tea", "Pot of Green Sencha Tea", "Vanilla Milkshake",
        "Chocolate Milkshake", "Strawberry Milkshake", "Vanilla Matcha Protein Shake", "Mixed Berry Protein Shake",
        "Chocolate & Peanut Butter Protein Shake",
    ],
    "SEASONAL SPECIALS": ["Buffalo Chicken Brioche", "Caramelised Beef Brioche", "Brie & Chilli Jam Brioche", "Cinnamon Swirl Shake"],
}
# Printed with two unlabelled figures: not listed (see the docstring).
TWO_VALUES = {
    "DRINKS": ["Espresso", "Americano", "Latte", "Cappuccino", "Mocha", "Hot Chocolate", "Iced Latte", "Iced Americano",
               "Vanilla Matcha Latte", "Chai Latte"],
    "SEASONAL SPECIALS": ["Cinnamon & Vanilla Latte", "Cinnamon & Orange Hot Chocolate"],
}
# slug() turns the accented e of "Frappé" into a hyphen, so these two ids are given.
IDS = {"Latte Frappé": "latte-frappe", "Mocha Frappé": "mocha-frappe"}

MARK = re.compile(r"\s*\((VE|V)\)\s*$")
ONE = re.compile(r"(?:^|[ .])(\d+)\s*kcal\s*$")
TWO = re.compile(r"(?:^|[ .])(\d+)\s*(?:kcal)?\s*/\s*(\d+)\s*kcal\s*$")
# nduja: a pork salume (see docstring). Words are the chain's own, so nothing is inferred beyond the word list.
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|pepperoni|salami|chorizo|nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)


class OfferParser(HTMLParser):
    """Reads the page's own structure: <h2> section headings, then <div class="... offer"> blocks holding an <h3> name and a
    <div class="paragraph"> text. (The page header also has an h3 and a paragraph, but outside any offer block.)"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.section = None
        self.offers = []  # (section, name, text)
        self._stack = []  # (tag, kind) for div nesting inside an offer
        self._offer = None
        self._capture = None  # "h2" | "h3" | "para"
        self._buf = []

    def handle_starttag(self, tag, attrs):
        classes = (dict(attrs).get("class") or "").split()
        if tag == "h2":
            self._capture, self._buf = "h2", []
        elif tag == "div":
            if self._offer is None and "offer" in classes:
                self._offer = {"name": None, "text": None, "depth": 0}
            if self._offer is not None:
                self._offer["depth"] += 1
                if "paragraph" in classes:
                    self._capture, self._buf = "para", []
        elif tag == "h3" and self._offer is not None:
            self._capture, self._buf = "h3", []

    def handle_endtag(self, tag):
        if tag in ("h2", "h3") and self._capture in ("h2", "h3"):
            text = " ".join("".join(self._buf).split())
            if self._capture == "h2":
                self.section = text
            else:
                self._offer["name"] = text
            self._capture = None
        elif tag == "div" and self._offer is not None:
            if self._capture == "para":
                self._offer["text"] = " ".join("".join(self._buf).split())
                self._capture = None
            self._offer["depth"] -= 1
            if self._offer["depth"] == 0:
                o, self._offer = self._offer, None
                if o["name"] is None or o["text"] is None:
                    raise SystemExit(f"offer block without a name or text: {o}: the page layout changed")
                self.offers.append((self.section, o["name"], o["text"]))

    def handle_data(self, data):
        if self._capture:
            self._buf.append(data)


def fetch(url: str, dest: Path, delay: float = 1.0) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", USER_AGENT, "-o", str(dest), url], check=True)
    time.sleep(delay)


def read_page(path: Path, default_section) -> list:
    p = OfferParser()
    if default_section:
        p.section = default_section
    p.feed(path.read_text(encoding="utf-8"))
    return p.offers


def build(pages_dir: Path, checked_on: str):
    printed = []
    for fname in PAGES:
        printed += read_page(pages_dir / fname, PAGE_DEFAULT_SECTION.get(fname))
    for section, name, text in printed:
        if section not in CATEGORY:
            raise SystemExit(f"{name!r}: unknown section {section!r}: add it to CATEGORY after reading the page")
    expected = {(s, n): "one" for s, names in ONE_VALUE.items() for n in names}
    expected.update({(s, n): "two" for s, names in TWO_VALUES.items() for n in names})
    seen = {}
    for section, name, text in printed:
        if (section, name) in seen:
            raise SystemExit(f"{section} / {name!r} is printed twice: check the layout")
        seen[(section, name)] = text
    new, gone = sorted(set(seen) - set(expected)), sorted(set(expected) - set(seen))
    if new or gone:
        raise SystemExit(f"The menu changed. Printed but not in the script's lists: {new}. In the lists but no longer printed: {gone}. "
                         "Re-read both pages, then update ONE_VALUE / TWO_VALUES.")
    order = [(s, n) for s, names in ONE_VALUE.items() for n in names]
    printed_order = [(s, n) for s, n, _ in printed if expected[(s, n)] == "one"]
    if printed_order != order:
        raise SystemExit("The order of the printed items changed: re-check the pages and the lists in this script.")
    items, report, excluded = [], [], []
    for section, name, text in printed:
        shape = expected[(section, name)]
        two, one = TWO.search(text), ONE.search(text)
        if shape == "two":
            if not two:
                raise SystemExit(f"{name!r}: expected two printed figures, got {text!r}: the page changed, re-check TWO_VALUES")
            excluded.append(f"{name} ({section.title()}): printed {two.group(1)} / {two.group(2)} kcal with no sizes")
            continue
        if two or not one:
            raise SystemExit(f"{name!r}: expected one kcal figure, got {text!r}: the page changed, re-check ONE_VALUE")
        mark = MARK.search(name)
        clean = MARK.sub("", name)
        vegetarian = bool(mark)
        tags = ["vegetarian"] if vegetarian else []
        if not vegetarian:
            if PORK.search(clean + " " + text):
                tags.append("contains_pork")
            if BEEF.search(clean + " " + text):
                tags.append("contains_beef")
        notes = []
        if mark:
            notes.append(f"Printed with the mark ({mark.group(1)})")
        if name == "Ultimate Avo with egg & halloumi (VE)":
            notes.append("Printed (VE) although the description lists a poached egg and halloumi; tagged vegetarian only, as the chain marks it")
        items.append({"id": IDS.get(clean) or slug(clean), "name": clean, "category": CATEGORY[section], "serving": "",
                      "calories": one.group(1), "tags": "|".join(tags), "limited_time": section == "SEASONAL SPECIALS",
                      "rankable": False, "notes": "; ".join(notes)})
        # A meat named only generically (no species) would be listed for the report; chicken, salmon, tuna are stated species.
        if re.search(r"\b(meat|mince|patty|patties)\b", clean + " " + text, re.I) and not tags:
            report.append(f"meat type not stated: {clean}")
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids are not unique")
    if len(items) != sum(len(v) for v in ONE_VALUE.values()):
        raise SystemExit("Item count does not match the lists")
    if len(NOTE) >= 400:
        raise SystemExit("note.txt must stay under 400 characters")
    return items, report, excluded


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding the two saved pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for fname, url in PAGES.items():
            fetch(url, args.pages / fname)
    for fname, url in PAGES.items():
        print(f"{fname} sha256 {sha256_file(args.pages / fname)}  {url}")
    items, report, excluded = build(args.pages, args.checked_on)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Esquires Coffee", cuisine="Coffee", source_title=SOURCE_TITLE.format(checked=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             allergen_guide=None, nutrition_level="calories")
    print("\n".join(report))
    print("not listed (two unlabelled figures): " + "; ".join(excluded))
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
