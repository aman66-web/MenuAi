#!/usr/bin/env python3
"""Build data/source/mildreds/ from the menu pages of Mildreds' five London restaurants (a CALORIES-ONLY chain).

    python3 tools/uk_extract/mildreds.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the five saved pages (soho.html, camden.html, covent-garden.html, kings-cross.html, victoria.html); --fetch downloads
them first from https://www.mildreds.com/<site>/ (one request per page, 1.2 s apart; robots.txt allows everything).
Python 3.9 compatible. The pages are read by mildreds_pages.py (HTML structure, nothing by position).

What the pages print: the menu tabs are labelled autumn-winter 2025/26 (anchors "aw25_26-..."), the pages themselves show no date.
After the price, most food dishes print "(444 kcal)": calories ONLY, per dish as sold, with no kJ, protein, carbs, fat or serving
size, so this is a calories-only chain (protein, carbs and fat stay blank: docs/DATA.md "Calories-only chains").

The five restaurants do not have the same menus (breakfast is Soho / Covent Garden / King's Cross / Victoria, Camden has weekend
brunch only; the Taste of Mildreds and pre-theatre menus differ; King's Cross calls the starters "small plates" and the mains
"plates & bowls"), and a dish's calories are not printed on every restaurant's page. Founder's rule for this chain: a dish is
published only if EVERY calorie value printed for it, at any restaurant and on any menu, is the same number. Today that holds for
every dish. (If a dish ever printed two different numbers it would be left out and the run stops, so a human reads this again.)

Names are the chain's own, in capitals. Where one dish is printed under two names (the weekend-brunch "banana biscoff caramel" under
a PANCAKES heading and the breakfast "banana biscoff caramel pancakes"), both lines are the same dish with the same number and are
published once. Prices (the pages show them with a "$" sign) are not used.

Not published although a calorie value is printed (each is printed again by the script):
- "olive pickle mix / pita / paratha (141 kcal/551 kcal/224 kcal)": three values for three names with no labels, so which number
  belongs to which is only an inference from the order; not guessed.
- "load 'em up" (954 kcal), the burger upgrade "swap your fries for spice riot fries": an upgrade, not a dish, and the number is
  the loaded fries, which is already published as the Spice Riot Loaded Fries side.
- "churro waffle" (757 kcal) and "berries waffle" (566 kcal), breakfast sweet plates at Covent Garden and Victoria: each prints a
  Single and a Double price but a single calorie value, and does not say which size it is for.
- the three "good morning mildreds" options (croissant / sourdough / croissant toastie, 680 / 671 / 887 kcal): they are the choices of
  a set breakfast (granola yogurt bowl, orange juice and a hot drink) and the page does not say what the number covers.
Drinks, wine, cocktails, add-on offers ("add rashers $ 4") and every dish without a "(N kcal)" are simply not listed. An item's
calories sit in the last addon paragraph, after any add-on offers ("add paratha $ 3.90", then "(976 kcal)"); the reader takes all of them.

Tags: vegetarian on every item: the chain says "All our dishes & drinks are plant-based" on the Soho, Covent Garden and Victoria pages
and describes itself as a vegan restaurant on all five (checked on every run). Because everything is plant-based, a name such as
"chorizo arancini", "sausage" or "rashers" is not a meat product, so no contains_pork / contains_beef tag is given.

Allergens (docs/DATA.md "Allergens") are link-only. Each restaurant's page has an "Allergens" button to its own interactive menu on
Ingredifind (igfd.menu), a third-party platform, and each location has a different menu there. The guide shows ingredient lists
(some differ from the website's, e.g. "focaccia" instead of "sourdough toast" in the full english) rather than one allergen mark
per dish, so dishes cannot be matched exactly. All or nothing: only the Soho guide's link is published.

Re-checked 2026-10-09 (allergen pass), decision unchanged: link-only. What was found by loading all five guides in a browser as a visitor (igfd.menu
serves its app page for every path, so there is no robots.txt to read; one page load per restaurant plus one click per menu): the guide is an
INGREDIENT-LEVEL guest menu (the restaurant's feature flag is menuFilteringLevel "ingredient-with-drawer"): visitors pick their allergies and the app
filters dishes and shows each dish's ingredients; a per-dish allergen list exists only as a roll-up the app computes from its ingredient database
(shown when "Show allergen details" is switched on) and arrives from the platform's own gateway API, and the page says it "shows what is in each dish,
so you know what to ask about". It is not a printed per-dish allergen row. Of the 48 published dishes 35 have a dish of exactly the same name (accents
and punctuation ignored) in the guides of every restaurant that lists them, and those 35 agree on every allergen and may-contain across the five guides
(no optional ingredients); 13 have no exact row (Chick+n Caesar Burger, Beetroot Carrot Vada, Korean Fried Chick+n, Smoky Mushroom Prime Patty: the
guide names them "... with fries"; Coconut Mango Pickle Slaw, Rocket Pomegranate Side Salad, Spice Riot Loaded Fries; Berries & Cream Pancakes, Banana
Biscoff Caramel Pancakes, Porridge, Granola Bowls, Croissant with plant butter & jam, Sourdough with plant butter & jam: named by flavour under a
section, or not listed). The guide's recipes are known to differ from the website's (focaccia instead of sourdough toast in the full english). So
per-dish allergens could be published for 35 dishes and 13 held back (27 percent, under the one-third limit) if the founder accepts an ingredient-level
third-party guide as the chain's allergen guide; until then nothing is published. Capture recipe: Playwright (Chromium), open each guide URL, click
Continue and View menu, open every food menu from the menu switcher and keep the get-menu-by-menu-url responses (dish name, allergens, mayContainAllergens).
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mildreds_pages as reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "mildreds"
SOURCE_URL = "https://www.mildreds.com/soho/"
SOURCE_TITLE = ("Mildreds menus with calories: the Soho, Camden, Covent Garden, King's Cross and Victoria pages on mildreds.com, "
                "menus labelled autumn-winter 2025/26 (accessed 2026-10-08, no date shown)")
ALIASES = ["mildreds", "mildred's", "mildreds soho", "mildreds camden", "mildreds covent garden", "mildreds kings cross", "mildreds victoria"]
ALLERGEN_TITLE = ("Mildreds allergen menu for Soho on Ingredifind (the 'Allergens' button on mildreds.com/soho; each Mildreds restaurant "
                  "has its own, linked from its page)")
ALLERGEN_URL = "https://igfd.menu/london/mildreds-gy2w"
NOTE = ("Calories only, as printed beside each dish on the five London restaurants' pages (no serving sizes, no protein, carbs or fat). Menus "
        "differ by restaurant: a dish is listed only if every restaurant that prints its calories prints the same number. Mildreds say traces "
        "of allergens may be present.")
STATEMENT = "All our dishes &amp; drinks are plant-based"
EXPECTED_STATEMENT_ON = {"soho", "covent-garden", "victoria"}
EXPECTED_DISHES = 48
EXPECTED_CONFLICTS = set()
# Calorie lines per page (a three-value line counts once): a different number means the menu changed.
EXPECTED_KCAL_LINES = {"soho": 59, "camden": 47, "covent-garden": 67, "kings-cross": 58, "victoria": 70}

SNK, STA, BUR, MAI, SID, DES, BRK, KID = ("Snacks & dips", "Starters", "Burgers", "Mains", "Sides", "Desserts", "Breakfast & brunch", "Kids menu")


def D(name, cat, *aliases, note="", id=None):
    """A published dish: `name` as shown, its category, and the printed names that are this dish. An alias is a name, or
    (heading, name) when the name only means this dish under that heading. Names are compared with reader.norm()."""
    return dict(name=name, cat=cat, aliases=[(None, reader.norm(a)) if isinstance(a, str) else (reader.norm(a[0]), reader.norm(a[1])) for a in aliases], note=note, id=id)


# One entry per published dish, in menu order (main menu, breakfast and brunch, kids).
DISHES = [
    D("Sourdough Flatbread", SNK, "sourdough flatbread"),
    D("Padrón Peppers", SNK, "padrón peppers", id="padron-peppers"),  # slug() would turn the o-acute into a hyphen
    D("Pimento Butterbean Dip", SNK, "pimento butterbean dip"),
    D("Turmeric Carrot Hummus", SNK, "turmeric carrot hummus"),
    D("Guacamole Verde", SNK, "guacamole verde"),
    D("Harissa Patatas Bravas", SNK, "harissa patatas bravas"),
    D("Kimchi Gyoza Dumplings", STA, "kimchi gyoza dumplings"),
    D("Chorizo Arancini", STA, "chorizo arancini", note="Plant-based, like every dish on the menu"),
    D("Coconut Corn Ribs", STA, "coconut corn ribs"),
    D("Tamarind Teriyaki Cauliflower Cups", STA, "tamarind teriyaki cauliflower cups"),
    D("Chipotle Chick+n Tinga Tacos", STA, "chipotle chick+n tinga tacos"),
    D("Chick+n Caesar Burger", BUR, "chick+n caesar", note="Printed 'chick+n caesar' under the burgers heading; the pre-theatre menu prints 'chick+n caesar burger'. Served with lemon pepper fries"),
    D("Beetroot Carrot Vada", BUR, "beetroot carrot vada", note="Burger; served with lemon pepper fries"),
    D("Korean Fried Chick+n", BUR, "korean fried chick+n", note="Burger; served with lemon pepper fries"),
    D("Smoky Mushroom Prime Patty", BUR, "smoky mushroom prime patty", note="Burger; served with lemon pepper fries"),
    D("Kiri Hodi Pilau", MAI, "kiri hodi pilau", note="Printed after the 'add paratha' offer; the Victoria lunch (Taste of Mildreds) menu prints the same number"),
    D("Shawarma Kebab", MAI, "shawarma kebab", note="Printed after the 'add pita' offer; not on the Camden page"),
    D("Shiitake Peanut Laksa", MAI, "shiitake peanut laksa"),
    D("Artichoke Caesar Salad", MAI, "artichoke caesar salad", note="Printed after the 'Southern Fried Plant Chick+n' add-on offer"),
    D("Kimchi Bokkeumbap", MAI, "kimchi bokkeumbap"),
    D("Lemon Pepper Fries", SID, "lemon pepper fries"),
    D("Guacamole-Pea Avo Smash", SID, "guacamole-pea avo smash"),
    D("Coconut Mango Pickle Slaw", SID, "coconut mango pickle slaw"),
    D("Kimchi", SID, ("sides", "kimchi")),
    D("Rocket Pomegranate Side Salad", SID, "rocket pomegranate side salad"),
    D("Spice Riot Loaded Fries", SID, "spice riot loaded fries"),
    D("Sausage", SID, ("sides", "sausage"), note="Calories are printed in the weekend-brunch sides only; the breakfast sides print the same side without them"),
    D("Pistachio Cheesecake", DES, "pistachio cheesecake"),
    D("Sticky Toffee Pudding", DES, "sticky toffee pudding"),
    D("Warm Cookie Dough Blondie", DES, "warm cookie dough blondie"),
    D("White Chocolate Tiramisu", DES, "white chocolate tiramisu", note="Printed after the 'add scoop of ice cream' offer on the main menu and alone on the dessert menu"),
    D("Avocado Pea Smash", BRK, "avocado pea smash"),
    D("Kimchi Grilled Cheese", BRK, "kimchi grilled cheese"),
    D("The Full English", BRK, "the full english"),
    D("The Meze Brunch", BRK, "the meze brunch"),
    D("Berries & Cream Pancakes", BRK, "berries & cream pancakes", ("pancakes", "berries & cream"), note="Two pancakes ('double stack'); printed as 'berries & cream' under the PANCAKES heading and as 'berries & cream pancakes' on the breakfast sweet plates"),
    D("Banana Biscoff Caramel Pancakes", BRK, "banana biscoff caramel pancakes", ("pancakes", "banana biscoff caramel"), note="Printed as 'banana biscoff caramel' under the PANCAKES heading and as 'banana biscoff caramel pancakes' on the breakfast sweet plates"),
    D("Porridge", BRK, ("morning oats", "porridge"), ("porridge", "berries & peanut butter / banana & biscoff"),
      note="One value for the dish with either topping (berries & peanut butter, or banana & biscoff): printed as 'porridge' with the choice in its description, and as the two toppings on one line under the PORRIDGE heading"),
    D("Granola Bowls", BRK, "granola bowls"),
    D("Croissant with plant butter & jam", BRK, ("continental", "croissant"), note="Printed 'croissant' with the description 'plant butter & jam' under CONTINENTAL"),
    D("Sourdough with plant butter & jam", BRK, ("continental", "sourdough"), note="Printed 'sourdough' with the description 'plant butter & jam' under CONTINENTAL"),
    D("Croissant Toastie", BRK, ("continental", "croissant toastie"), note="Filled with roast mushroom, cheez, red onion chutney"),
    D("Hummus Dip Daps", KID, "hummus dip daps"),
    D("Nuggies, Peas & Fries", KID, "nuggies, peas & fries"),
    D("Banger, Fries & Beans", KID, "banger, fries & beans"),
    D("Scrambled Tofu Rainbow Rice", KID, "scrambled tofu rainbow rice"),
    D("Dumplings & Veggies", KID, "dumplings & veggies"),
    D("Biscoff Ice Cream", KID, "biscoff ice cream"),
]
# Calorie values printed but deliberately not published: (heading or None, printed name) -> why.
SKIPPED = {
    (None, reader.norm("olive pickle mix / pita / paratha")): "three unlabelled values (141 / 551 / 224 kcal) for three names: which belongs to which is not stated",
    ("burgers", reader.norm("load \u2018em up")): "an upgrade (swap your fries for spice riot fries, 954 kcal): the number is the loaded fries, the same as the Spice Riot Loaded Fries side, not a dish",
    ("sweet plates", reader.norm("churro waffle")): "printed with a Single and a Double price but one value (757 kcal): which size it is for is not stated",
    ("sweet plates", reader.norm("berries waffle")): "printed with a Single and a Double price but one value (566 kcal): which size it is for is not stated",
    ("good morning mildreds", reader.norm("croissant, plant butter & jam")): "option of a set breakfast (680 kcal): what the value covers is not stated",
    ("good morning mildreds", reader.norm("sourdough, plant butter & jam")): "option of a set breakfast (671 kcal): what the value covers is not stated",
    ("good morning mildreds", reader.norm("croissant toastie filled with roast mushroom, cheez, red onion chutney")): "option of a set breakfast (887 kcal): what the value covers is not stated",
}


def find_dish(section: str, name: str):
    """The DISHES entry for a printed (heading, name), the SKIPPED key, or None."""
    sec, nm = reader.norm(section), reader.norm(name)
    hits = [d for d in DISHES if any(a == nm and (s is None or s == sec) for (s, a) in d["aliases"])]
    skip = [k for k in SKIPPED if k[1] == nm and (k[0] is None or k[0] == sec)]
    if len(hits) + len(skip) > 1:
        raise SystemExit(f"{name!r} under {section!r} matches more than one entry: fix DISHES / SKIPPED")
    return hits[0] if hits else (skip[0] if skip else None)


def read_all(pages_dir: Path):
    records = []  # one dict per calorie-bearing line, with the restaurant added
    for site, label in reader.SITES:
        text = (pages_dir / f"{site}.html").read_text(encoding="utf-8")
        rows = reader.read_page(text, f"{site}.html")
        statement = STATEMENT in text
        if statement != (site in EXPECTED_STATEMENT_ON):
            raise SystemExit(f"{site}.html: the plant-based statement is {'now' if statement else 'no longer'} on the page: re-read how the vegetarian tag is justified")
        if "vegan restaurant" not in text:
            raise SystemExit(f"{site}.html no longer calls Mildreds a vegan restaurant: the vegetarian tag needs re-checking")
        lines = [r for r in rows if r["kcal"]]
        if len(lines) != EXPECTED_KCAL_LINES[site]:
            raise SystemExit(f"{site}.html has {len(lines)} calorie lines, expected {EXPECTED_KCAL_LINES[site]}: the menu changed, re-check DISHES / SKIPPED")
        for r in lines:
            records.append(dict(r, site=site, label=label))
    return records


def build_items(records: list[dict]):
    values = {id(d): [] for d in DISHES}       # dish -> [(label, menu, section, kcal)]
    skipped_seen = {}
    for r in records:
        hit = find_dish(r["section"], r["name"])
        if hit is None:
            raise SystemExit(f"{r['label']}: {r['name']!r} (under {r['section']!r}) prints calories {r['kcal']} but is in neither DISHES nor SKIPPED: "
                             "a new or renamed dish, a human decides")
        if isinstance(hit, tuple):
            skipped_seen.setdefault(hit, []).append(r)
            continue
        if len(r["kcal"]) != 1:
            raise SystemExit(f"{r['label']}: {r['name']!r} prints {len(r['kcal'])} calorie values but is published as one dish")
        values[id(hit)].append((r["label"], r["menu"], r["section"], r["kcal"][0]))
    if set(skipped_seen) != set(SKIPPED):
        raise SystemExit(f"SKIPPED lines seen {sorted(map(str, skipped_seen))} differ from SKIPPED {sorted(map(str, SKIPPED))}")
    items, conflicts = [], set()
    for d in DISHES:
        seen = values[id(d)]
        if not seen:
            raise SystemExit(f"{d['name']}: no restaurant prints calories for it any more: the menu changed")
        numbers = sorted({v[3] for v in seen})
        if len(numbers) > 1:
            conflicts.add(d["name"])
            print(f"NOT PUBLISHED, restaurants print different calories: {d['name']}: " + "; ".join(f"{v[0]} {v[1]}/{v[2]} {v[3]}" for v in seen))
            continue
        where = [lbl for _, lbl in reader.SITES if any(v[0] == lbl for v in seen)]
        notes = f"{numbers[0]} kcal printed at {', '.join(where)} ({len(seen)} lines); " + "; ".join(sorted({f'{v[1]} / {v[2]}' for v in seen}))
        if d["note"]:
            notes += "; " + d["note"]
        items.append(dict(name=d["name"], id=d["id"], category=d["cat"], calories=numbers[0], tags="vegetarian", rankable=False, notes=notes))
    if conflicts != EXPECTED_CONFLICTS:
        raise SystemExit(f"Dishes with conflicting calories are now {sorted(conflicts)}, expected {sorted(EXPECTED_CONFLICTS)}: read the pages again")
    if len(items) != EXPECTED_DISHES:
        raise SystemExit(f"Built {len(items)} items, expected {EXPECTED_DISHES}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items, skipped_seen


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder with soho.html, camden.html, covent-garden.html, kings-cross.html, victoria.html")
    ap.add_argument("--checked-on", required=True, help="the day the pages were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the five pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    args.pages.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        for site, _ in reader.SITES:
            reader.fetch(site, args.pages / f"{site}.html")
    for site, _ in reader.SITES:
        print(f"{site}.html sha256 {sha256_file(args.pages / f'{site}.html')}")
    records = read_all(args.pages)
    items, skipped_seen = build_items(records)
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Mildreds", cuisine="World food", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    for key, rows in sorted(skipped_seen.items(), key=lambda kv: str(kv[0])):
        print(f"calories printed but NOT published ({len(rows)} lines): {key[1]!r}: {SKIPPED[key]}")


if __name__ == "__main__":
    main()
