#!/usr/bin/env python3
"""Build data/source/franco-manca/ from Franco Manca's own menu page (a CALORIES-ONLY chain).

    python3 tools/uk_extract/franco_manca.py --page menu.html --checked-on 2026-10-07 [--fetch] [--allergen-pdf allergens.pdf] [--out DIR]

Source (the chain's own menu page, the one its website links as "Our Menu"):
    https://www.francomanca.co.uk/menu/        (robots.txt only disallows /wp-json/ and /?rest_route=)
The page prints no date; it prints each dish's calories in square brackets after its name ("Mixed Olives [190kcal]"), and nothing else
nutritional: no protein, carbs, fat, salt, kJ or weights. So this is a CALORIES-ONLY chain (docs/DATA.md "Calories-only chains"):
protein, carbs and fat stay BLANK and no other nutrient column can be filled. Calories are copied from the page exactly as printed.
`--fetch` downloads the page (one request) to --page first.

The page is read by structure (html.parser): the menu's top categories (div.menu__category), the sub-category titles, and each
div.menu-dish (name, description, pizza number, calories, v / vg marks). Only the item NAMES, categories, servings and tags are decided
in ITEMS below; the script stops if the dishes printed on the page differ from that table (a new, renamed or removed dish, a dish that
gained or lost its calories, a moved heading), so a human re-reads the menu when Franco Manca changes it.

How the page is read:
- Dishes the page prints WITHOUT calories (wines, most cocktails and beers, Limoncello, still and sparkling water) are not listed;
  EXPECTED_WITHOUT_KCAL is checked on every run.
- Margherita also prints "Choose buffalo mozzarella instead [268kcal]". That is not a whole pizza (the allergen guide's FAQ gives the
  sourdough base alone as 518 kcal) and the page does not say what 268 is, so it is not published as an item and not guessed.
- `serving` only where the page states a size (drinks print "250ml" / "330ml" in the name; that size becomes the serving).
- The page does not say how many people a pizza, platter or dip serves, so those have no serving.
- Kids menu: the pizzas print only their toppings ("100% Italian tomato & mozzarella"), so the item name is "Kids pizza: " + that text.
  The kids drinks and scoops are separate lines from the adult ones with different calories ("Apple juice" 56 kcal vs "Apple juice 250ml"
  80 kcal), so they are named "Kids ...".
- Tags: `vegetarian` when the dish carries the page's own v or vg mark, except where the chain's own allergen list contradicts the mark
  (Charcuterie Platter: page "v", allergen list "Veggie? no": no tag, noted). `contains_pork` / `contains_beef` only when the dish's name
  or description names the meat (ham, chorizo, salami, sausage, pancetta, prosciutto, speck, 'nduja, pork, beef ...). Nothing else is
  inferred; "Italian cured meats" does not say which meat, so the Charcuterie Platter has no meat tag.
- The page does not explain its marks (v, vg, os, bn). Only v and vg are used (the allergen list's legend defines VEGGIE and VEGAN).

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. Franco Manca's own allergen list (July 2026 v2, 18 pages, an Excel sheet printed to
PDF) is a tick matrix, but its row names are not the menu's names: pizzas 11 and 12 are PARMIGIANA and PULLED LAMB there but POTATO AND
GORGONZOLA and RAGU GENOVESE on the menu, specials are coded (MEAT 101, VEG 201, VEGAN 601), the kids pizzas are KIDS MARGHERITA / KIDS HAM,
and several menu dishes (Goat's Cheese Bread, Bruschetta Speck & Whipped Goat's Cheese, Four Cheese Fonduta, Cheesecake, Hot honey dip ...)
have no row of that name. Allergens are safety information: no name matching, no guessing, so only the guide's link is published (all or
nothing). With --allergen-pdf the script prints how many menu items have no row of the same name anywhere in the guide.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "franco-manca"
SOURCE_URL = "https://www.francomanca.co.uk/menu/"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
ALIASES = ["franco manca", "franco manca pizza", "francomanca"]
ALLERGEN_GUIDE_TITLE = "Franco Manca allergen list, July 2026 v2 (FM-ALLERGEN-LIST-JULY-2026-v2.pdf, 18 pages)"
ALLERGEN_GUIDE_URL = "https://www.francomanca.co.uk/wp-content/uploads/2026/08/FM-ALLERGEN-LIST-JULY-2026-v2.pdf"
# The guide says dishes "may contain traces of other allergens not included on the main ingredients list" and that nuts are handled in
# every pizzeria: traces information is published (as a general statement, not per dish).
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Franco Manca prints calories only, beside each dish, so protein, carbs and fat are not published. Drinks without calories "
        "(wine, most cocktails and beers) are not listed. Pizzerias can differ slightly. Its allergen-list FAQ says swapping to a gluten-free base adds 53 kcal.")
EXPECTED_ITEMS = 76
# Dishes the page prints with no calories (checked on every run; anything else stops the script).
EXPECTED_WITHOUT_KCAL = {
    ("drinks", "WINES", "Nero d’Avola Tenute Normanno (Rosso)"), ("drinks", "WINES", "Sangiovese: Nativo (Rosso)"),
    ("drinks", "WINES", "Montepulciano Francesco Cirelli (Rosso)"), ("drinks", "WINES", "Nero d’Avola Tenute Normanno (Rosato)"),
    ("drinks", "WINES", "Extra dry Prosecco: ƎRA (Bubbles)"),
    ("drinks", "WINES", "Insolia Tenute Normanno (Bianco)"), ("drinks", "WINES", "Pinot Grigio: Nativo (Bianco)"),
    ("drinks", "WINES", "Trebbiano Francesco Cirelli (Bianco)"), ("drinks", "WINES", "ORANGE Cirelli La Collina Biologica (Orange)"),
    ("drinks", "COCKTAILS", "Aperol Spritz"), ("drinks", "COCKTAILS", "Negroni"), ("drinks", "COCKTAILS", "Negroni Sbagliato"),
    ("drinks", "COCKTAILS", "Hugo Spritz"), ("drinks", "COCKTAILS", "Campari Spritz"), ("drinks", "COCKTAILS", "Gin & Tonic"),
    ("drinks", "COCKTAILS", "Limoncello Spritz"), ("drinks", "COCKTAILS", "Nojito"), ("drinks", "COCKTAILS", "Sarti Spritz"),
    ("drinks", "Beer", "No Logo Lager 330ml"), ("drinks", "Beer", "No Logo Pale Ale 330ml"), ("drinks", "Beer", "Galipette Cider 330ml"),
    ("drinks", "Soft drinks", "San Pellegrino sparkling water 500ml"), ("drinks", "Soft drinks", "Acqua Panna still water 500ml"),
    ("post-pizza", "Digestifs", "Limoncello"),
}

PIZ, APE, BIT, DIP, SAL, SID, DES, ICE, SOR, DRK, KID = ("Sourdough pizza", "Aperitivo", "Bites", "Dips", "Salads", "Sides", "Desserts",
                                                         "Ice cream", "Sorbet", "Drinks", "Kids")
PORK = re.compile(r"\b(pork|ham|bacon|sausages?|salami|chorizo|pancetta|prosciutto|speck|'?nduja|pepperoni|coppa|mortadella)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
# A page mark that Franco Manca's own allergen list contradicts: the tag is left off and the reason kept in the row's notes.
MARK_CONTRADICTED = {"Charcuterie Platter": "page marks it v, but the allergen list says 'Veggie? no' (cured meats)"}


# ----------------------------------------------------------------------------------------------- reading the page
def _norm(s: str) -> str:
    return " ".join(s.split())


class MenuReader(HTMLParser):
    """Collects every div.menu-dish between the first div.menu__category and the "Where's Franco" footer, with its place in the menu."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.dishes: list[dict] = []
        self.category = ""
        self.section = ""
        self._dish: dict | None = None
        self._dish_depth = 0
        self._cur: str | None = None  # what the open text belongs to: name / desc / subtitle / num / kcal / mark / section
        self._buf: list[str] = []
        self._h2_class = ""

    def handle_starttag(self, tag: str, attrs: list) -> None:
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        if tag == "div" and "menu__category" in cls:
            self.category, self.section = a.get("id") or "", ""
        if self._dish is not None:
            if tag == "div":
                self._dish_depth += 1
            if tag == "h3":
                self._start("name")
            elif tag == "p" and "menu-dish__subtitle" in cls:
                self._start("subtitle")
            elif tag == "p":
                self._start("desc")
            elif tag == "span" and "pizza-number" in cls:
                self._start("num")
            elif tag == "span" and "menu-dish__vg-v" in cls:
                self._start("mark")
            elif tag == "span" and "body-sm" in cls:
                self._start("kcal")
            return
        if tag == "div" and "menu-dish" in cls and self.category:
            self._dish = {"category": self.category, "section": self.section, "name": "", "desc": "", "subtitle": "", "num": "",
                          "kcal_text": [], "marks": [], "dietary": a.get("data-dietary") or ""}
            self._dish_depth = 1
        elif tag == "h2" and self.category:
            self._h2_class = " ".join(cls)
            self._start("section")

    def handle_endtag(self, tag: str) -> None:
        if self._cur and tag in ("h2", "h3", "p", "span"):
            self._finish()
        if self._dish is not None and tag == "div":
            self._dish_depth -= 1
            if self._dish_depth == 0:
                self.dishes.append(self._dish)
                self._dish = None

    def handle_data(self, data: str) -> None:
        if self._cur:
            self._buf.append(data)

    def _start(self, what: str) -> None:
        self._cur, self._buf = what, []

    def _finish(self) -> None:
        text, what = _norm("".join(self._buf)), self._cur
        self._cur = None
        if what == "section":
            if "sub-category__title" in self._h2_class:
                self.section = text
            return
        d = self._dish
        if d is None:
            return
        if what == "kcal":
            d["kcal_text"].append(text)
        elif what == "mark":
            d["marks"].append(text)
        elif what == "desc":
            d["desc"] = (d["desc"] + " " + text).strip()
        else:
            d[what] = text


KCAL = re.compile(r"^\[(\d+)\s*kcal\]$")
BUFFALO = re.compile(r"Choose buffalo mozzarella instead \[(\d+)kcal\]")


def read_dishes(html_text: str) -> list[dict]:
    """Dishes in page order. `kcal` is the value printed in the dish's own bracket (None when it prints none)."""
    start, end = html_text.find("menu__categories"), html_text.find("Where’s Franco")
    if start < 0 or end < 0:
        raise SystemExit("The menu markers (menu__categories / the FAQ heading) are not on the page: the layout changed, re-check the reader")
    reader = MenuReader()
    reader.feed(html_text[start:end])
    for d in reader.dishes:
        values = [m.group(1) for m in (KCAL.match(t) for t in d["kcal_text"]) if m]
        if len(values) > 1 or len(d["kcal_text"]) != len(values):
            raise SystemExit(f"{d['name']!r}: unexpected calorie text {d['kcal_text']!r}")
        d["kcal"] = values[0] if values else None
        d["buffalo"] = BUFFALO.search(d["desc"]).group(1) if BUFFALO.search(d["desc"]) else None
    return reader.dishes


# ----------------------------------------------------------------------------------------------- what we publish
def E(category, printed, name, cat, serving="", rankable=False, note="", section="", id=None):
    return dict(category=category, section=section, printed=printed, name=name, cat=cat, serving=serving, rankable=rankable, note=note, id=id)


# One entry per dish the page prints WITH calories, keyed by (top category id, sub-category title, printed name).
# rankable follows the playbook (pizzas, salads, platters, mains true; drinks, dips, sides, desserts, bites parts false); the pipeline forces
# every item of a calories-only chain to false anyway.
ITEMS = [
    E("pre-pizza", "Mixed Olives", "Mixed olives", APE),
    E("pre-pizza", "Tarallini", "Tarallini", APE),
    E("pre-pizza", "Smoked Almonds", "Smoked almonds", APE),
    E("pre-pizza", "Nibbles Trio", "Nibbles trio", APE),
    E("pre-pizza", "Antipasti Platter", "Antipasti platter", APE, rankable=True),
    E("pre-pizza", "Charcuterie Platter", "Charcuterie platter", APE, rankable=True),
    E("bites", "Sourdough Pizza Bread", "Sourdough pizza bread", BIT),
    E("bites", "Garlic bread", "Garlic bread", BIT),
    E("bites", "Goat's Cheese Bread", "Goat's cheese bread", BIT),
    E("bites", "Burrata", "Burrata", BIT),
    E("bites", "Bruschetta Marinara", "Bruschetta marinara", BIT),
    E("bites", "Bruschetta Speck & Whipped Goat's Cheese", "Bruschetta speck & whipped goat's cheese", BIT),
    E("bites", "Oven-baked Tuscan Sausage", "Oven-baked Tuscan sausage", BIT),
    E("bites", "Four Cheese Fonduta", "Four cheese fonduta", BIT),
    E("sourdough-pizza", "MARINARA", "Marinara", PIZ, rankable=True),
    E("sourdough-pizza", "MARGHERITA", "Margherita", PIZ, rankable=True),
    E("sourdough-pizza", "FRANCO'S OG MARGHERITA", "Franco's OG Margherita", PIZ, rankable=True),
    E("sourdough-pizza", "PROSCIUTTO & FUNGHI", "Prosciutto & Funghi", PIZ, rankable=True),
    E("sourdough-pizza", "NAPOLI", "Napoli", PIZ, rankable=True),
    E("sourdough-pizza", "CHORIZO", "Chorizo", PIZ, rankable=True),
    E("sourdough-pizza", "SPICY SALAMI", "Spicy Salami", PIZ, rankable=True),
    E("sourdough-pizza", "MEZZALUNA", "Mezzaluna", PIZ, rankable=True),
    E("sourdough-pizza", "TRE PORCELLINI", "Tre Porcellini", PIZ, rankable=True),
    E("sourdough-pizza", "TRUFFLE & BURRATA", "Truffle & Burrata", PIZ, rankable=True),
    E("sourdough-pizza", "POTATO AND GORGONZOLA", "Potato and Gorgonzola", PIZ, rankable=True),
    E("sourdough-pizza", "RAGÙ GENOVESE", "Ragù Genovese", PIZ, rankable=True, id="ragu-genovese"),
    E("sourdough-pizza", "Garlic dip", "Garlic dip", DIP, section="Mind your manners. Do double-dip."),
    E("sourdough-pizza", "Scotch bonnet chilli dip", "Scotch bonnet chilli dip", DIP, section="Mind your manners. Do double-dip."),
    E("sourdough-pizza", "Hot honey dip", "Hot honey dip", DIP, section="Mind your manners. Do double-dip."),
    E("sourdough-pizza", "Semi-dried tomato", "Semi-dried tomato dip", DIP, section="Mind your manners. Do double-dip."),
    E("sourdough-pizza", "Franco's grana and truffle", "Franco's grana and truffle dip", DIP, section="Mind your manners. Do double-dip."),
    E("salads", "MEDITERRANEAN CHICKEN SALAD", "Mediterranean chicken salad", SAL, rankable=True),
    E("salads", "MEDITERRANEAN ARTICHOKE SALAD", "Mediterranean artichoke salad", SAL, rankable=True),
    E("salads", "CAPRESE SALAD", "Caprese salad", SAL, rankable=True),
    E("salads", "YELLOWFIN TUNA", "Yellowfin tuna salad", SAL, rankable=True),
    E("salads", "ROCKET", "Rocket side salad", SID, section="Sides"),
    E("salads", "FRANCO’S", "Franco's side salad", SID, section="Sides", id="francos-side-salad"),
    E("salads", "BAKED POTATOES", "Baked potatoes", SID, section="Sides"),
    E("post-pizza", "Affogato", "Affogato", DES),
    E("post-pizza", "Cheesecake", "Cheesecake", DES),
    E("post-pizza", "Chocolate Mousse Cake", "Chocolate mousse cake", DES),
    E("post-pizza", "Tiramisu", "Tiramisu", DES),
    E("post-pizza", "Cannolo", "Cannolo", DES),
    E("post-pizza", "Madagascan vanilla", "Madagascan vanilla ice cream", ICE, section="Ice Cream"),
    E("post-pizza", "Chocolate", "Chocolate ice cream", ICE, section="Ice Cream"),
    E("post-pizza", "Raspberry", "Raspberry sorbet", SOR, section="Sorbet"),
    E("drinks", "Crodino Non-Alcoholic Spritz", "Crodino non-alcoholic spritz", DRK, section="COCKTAILS"),
    E("drinks", "Lucky Saint Unfiltered No Alcohol Lager 0.5% 330ml", "Lucky Saint unfiltered no alcohol lager 0.5%", DRK, "330ml", section="Beer"),
    E("drinks", "Espresso", "Espresso", DRK, section="HOT DRINKS"),
    E("drinks", "Double Espresso", "Double espresso", DRK, section="HOT DRINKS"),
    E("drinks", "Macchiato", "Macchiato", DRK, section="HOT DRINKS"),
    E("drinks", "Double Macchiato", "Double macchiato", DRK, section="HOT DRINKS"),
    E("drinks", "Cappuccino", "Cappuccino", DRK, section="HOT DRINKS"),
    E("drinks", "Latte", "Latte", DRK, section="HOT DRINKS"),
    E("drinks", "Flat white", "Flat white", DRK, section="HOT DRINKS"),
    E("drinks", "Americano", "Americano", DRK, section="HOT DRINKS"),
    E("drinks", "English breakfast tea", "English breakfast tea", DRK, section="HOT DRINKS"),
    E("drinks", "Fresh mint tea", "Fresh mint tea", DRK, section="HOT DRINKS"),
    E("drinks", "Homemade organic lemonade 250ml", "Homemade organic lemonade", DRK, "250ml", section="Soft drinks"),
    E("drinks", "Orange juice 250ml", "Orange juice", DRK, "250ml", section="Soft drinks"),
    E("drinks", "Apple juice 250ml", "Apple juice", DRK, "250ml", section="Soft drinks"),
    E("drinks", "San Pellegrino Limonata 330ml", "San Pellegrino Limonata", DRK, "330ml", section="Soft drinks"),
    E("drinks", "San Pellegrino Aranciata 330ml", "San Pellegrino Aranciata", DRK, "330ml", section="Soft drinks"),
    E("drinks", "Coke 330ml", "Coke", DRK, "330ml", section="Soft drinks"),
    E("drinks", "Diet Coke 330ml", "Diet Coke", DRK, "330ml", section="Soft drinks"),
    E("drinks", "Coke Zero 330ml", "Coke Zero", DRK, "330ml", section="Soft drinks"),
    E("kids", "100% Italian tomato & mozzarella", "Kids pizza: 100% Italian tomato & mozzarella", KID, rankable=True),
    E("kids", "Roasted cured ham, 100% Italian tomato & mozzarella", "Kids pizza: Roasted cured ham, 100% Italian tomato & mozzarella", KID, rankable=True),
    E("kids", "Cured chorizo, 100% Italian tomato & mozzarella", "Kids pizza: Cured chorizo, 100% Italian tomato & mozzarella", KID, rankable=True),
    E("kids", "Roasted butternut squash, 100% Italian tomato, mixed peppers, mozzarella, Kalamata olives",
      "Kids pizza: Roasted butternut squash, 100% Italian tomato, mixed peppers, mozzarella, Kalamata olives", KID, rankable=True),
    E("kids", "Apple juice", "Kids apple juice", KID, section="Drinks"),
    E("kids", "Orange juice", "Kids orange juice", KID, section="Drinks"),
    E("kids", "Homemade lemonade", "Kids homemade lemonade", KID, section="Drinks"),
    E("kids", "Madagascan vanilla ice cream", "Kids Madagascan vanilla ice cream", KID, section="A scoop of ice cream or sorbet, choose from"),
    E("kids", "Chocolate ice cream", "Kids chocolate ice cream", KID, section="A scoop of ice cream or sorbet, choose from"),
    E("kids", "Raspberry sorbet", "Kids raspberry sorbet", KID, section="A scoop of ice cream or sorbet, choose from"),
]
CATEGORY_ORDER = [APE, BIT, PIZ, DIP, SAL, SID, DES, ICE, SOR, DRK, KID]
EXTRA_NOTES = {
    "Margherita": "Page also prints 'Choose buffalo mozzarella instead [268kcal]': not a whole pizza (the allergen list FAQ gives the "
                  "sourdough base alone as 518 kcal) and not explained, so not published as an item",
    "Charcuterie platter": "Same printed value (268) as the Margherita's buffalo option; lower than the vegetarian Antipasti platter (481)",
    "Cannolo": "Page marks it vg although the description says ricotta and the allergen list says 'Vegan? no' (its 'Veggie? yes' agrees "
               "with the vegetarian tag)",
}


def build_items(dishes: list[dict]) -> tuple[list[dict], list[str]]:
    # a wine's colour (Rosso / Rosato ...) is part of its identity: "Nero d'Avola Tenute Normanno" is listed as a red and as a rosé
    key = lambda d: (d["category"], d["section"], d["name"] + (f" ({d['subtitle']})" if d["subtitle"] else ""))  # noqa: E731
    seen: dict = {}
    for d in dishes:
        k = key(d)
        if k in seen:
            raise SystemExit(f"Dish {k} is printed twice in the same section: check the layout")
        seen[k] = d
    with_kcal = {k for k, d in seen.items() if d["kcal"] is not None}
    table = {(e["category"], e["section"], e["printed"]): e for e in ITEMS}
    if len(table) != len(ITEMS):
        raise SystemExit("ITEMS has a duplicate (category, section, printed name)")
    new, gone = sorted(with_kcal - set(table)), sorted(set(table) - with_kcal)
    if new or gone:
        raise SystemExit(f"The menu changed. Printed with calories but not in ITEMS: {new}. In ITEMS but no longer printed with calories: {gone}. "
                         "Update ITEMS (names, categories) after reading the new menu.")
    silent = {k for k, d in seen.items() if d["kcal"] is None}
    if silent != EXPECTED_WITHOUT_KCAL:
        raise SystemExit(f"Dishes without calories changed: now {sorted(silent - EXPECTED_WITHOUT_KCAL)} extra, "
                         f"{sorted(EXPECTED_WITHOUT_KCAL - silent)} missing")
    buffalo = [d for d in dishes if d["buffalo"]]
    if [d["name"] for d in buffalo] != ["MARGHERITA"] or buffalo[0]["buffalo"] != "268":
        raise SystemExit("The 'buffalo mozzarella instead' option changed: re-read it (it is deliberately not published)")
    items, report = [], []
    by_value: dict = {}
    for e in ITEMS:
        by_value.setdefault(seen[(e["category"], e["section"], e["printed"])]["kcal"], []).append(e["name"])
    for e in ITEMS:
        d = seen[(e["category"], e["section"], e["printed"])]
        tags = []
        contradicted = MARK_CONTRADICTED.get(d["name"].title()) or MARK_CONTRADICTED.get(e["printed"])
        if any(m in ("v", "vg") for m in d["marks"]) and not contradicted:
            tags.append("vegetarian")
        text = e["name"] + " " + d["desc"]
        is_veg = "vegetarian" in tags
        if not is_veg and PORK.search(text):
            tags.append("contains_pork")
        if not is_veg and BEEF.search(text):
            tags.append("contains_beef")
        printed = f"Printed '{d['name']}' [{d['kcal']}kcal]" + (f", pizza no. {d['num']}" if d["num"] else "") + (f", marks: {' '.join(d['marks'])}" if d["marks"] else "")
        notes = [printed]
        if contradicted:
            notes.append(f"vegetarian tag left off: {contradicted}")
            report.append(f"mark contradicted: {e['name']}: {contradicted}")
        same = [n for n in by_value[d["kcal"]] if n != e["name"]]
        if same:
            notes.append(f"same printed value ({d['kcal']}) as: " + "; ".join(same))
        if e["name"] in EXTRA_NOTES:
            notes.append(EXTRA_NOTES[e["name"]])
        if not tags and any(w in text.lower() for w in ("cured meats",)):
            report.append(f"meat type not stated: {e['name']} ('Italian cured meats')")
        items.append(dict(name=e["name"], id=e["id"], category=e["cat"], serving=e["serving"], calories=d["kcal"], tags="|".join(tags),
                          rankable=e["rankable"], notes="; ".join(notes)))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check ITEMS")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items, report


# ----------------------------------------------------------------------------------------------- allergen guide (information only)
def _letters(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", s.upper().replace("&", "").replace(" AND ", "").replace("’", "").replace("'", ""))


def allergen_name_report(items: list[dict], pdf: Path) -> list[str]:
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    haystack = _letters(text)
    missing = [i["name"] for i in items if _letters(i["name"].replace("Kids pizza: ", "")) not in haystack]
    return [f"{len(missing)} of {len(items)} items have no row of the same name anywhere in the allergen guide (so allergens are link-only): "
            + "; ".join(missing)]


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310 (fixed https URL)
        dest.write_bytes(r.read())
    time.sleep(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved menu page (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the page was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the page into --page first (one request)")
    ap.add_argument("--allergen-pdf", type=Path, help="the allergen guide PDF (only to print its SHA-256 and the name-match report)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(SOURCE_URL, args.page)
    print(f"menu page sha256 {sha256_file(args.page)}  {args.page}")
    dishes = read_dishes(args.page.read_text(encoding="utf-8"))
    items, report = build_items(dishes)
    if args.allergen_pdf:
        print(f"allergen PDF sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
        report += allergen_name_report(items, args.allergen_pdf)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    source_title = f"Franco Manca menu with calories, francomanca.co.uk/menu (accessed {args.checked_on}, no date shown)"
    out = write_chain_folder(chain_id=CHAIN_ID, name="Franco Manca", cuisine="Pizza", source_title=source_title, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"printed without calories (not listed): {len(EXPECTED_WITHOUT_KCAL)} dishes (wines, most cocktails and beers, Limoncello, waters)")
    print("\n".join(report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
