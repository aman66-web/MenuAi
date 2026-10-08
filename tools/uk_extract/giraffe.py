#!/usr/bin/env python3
"""Build data/source/giraffe/ from Giraffe's own "Dietary Information" menus (hosted by Ten Kites). A CALORIES-ONLY chain.

    python3 tools/uk_extract/giraffe.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://menus.tenkites.com/brg/giraffeadults, the page www.giraffe.net links as "Dietary Information". It holds six menus
(Breakfast, Main, Dessert, Gluten Free, Kid's, Drinks), the first at that URL and the others at ?mguid=<menu id> (the ids are
listed in the page's own menu selector). The pages show no date ("GiraffeEATIN-<Menu>_<day of the request>.pdf" is just the
day they were served), so the source title says "(accessed <date>, no date shown)". --fetch downloads the six pages (one request
per second); without it DIR must already hold giraffe_breakfast.html, giraffe_main.html, giraffe_dessert.html,
giraffe_glutenfree.html, giraffe_kids.html and giraffe_drinks.html. Reader: giraffe_pages.py (+ tenkites_c.py).

WHAT IS PRINTED. Each dish prints its calories in brackets ("(574 kcal)") and nothing else numeric: the page's own notice says
"Nutritional information including calories is calculated using typical weights and measures". There is no protein, carbohydrate,
fat, salt, sugar, fibre, kJ or weight anywhere, so protein_g, carbs_g, fat_g and every other nutrient column stay blank (never 0)
and the chain is calories-only (docs/DATA.md). A thousands comma is dropped ("1,150" -> 1150); nothing else is changed.
Dishes with no calorie figure (most wines, several cocktails and beers) are not listed; their names are printed by the script.

ALLERGENS are complete. Every listed dish prints a "Contains" line (a "none of the listed allergens" message, or an empty box when
the dish has only a "could also include" line) and optionally "This dish could also include ..." (the page's "may contain": its
disclaimer explains it is supplier cross-contact information). The page's allergen filter reads data-all-labels /
data-no-may-labels on each dish; tenkites_c.allergens_checked() compares the printed lines with those ids and the run stops if
they ever disagree. Cereals and tree nuts are the ones the "Contains" line names in brackets. The Vegetarian / Vegan icons are
checked against the same ids too.

CHOICES (all logged in the report; none touches a number):
- Duplicates. The Gluten Free and Kid's menus and the Drinks menu repeat some dishes. A repeat with the same name, calories AND
  allergens is dropped (the standard-menu copy is kept). The same name with other numbers or allergens (Kid's portions, the gluten
  free recipes, a breakfast side vs a starter) is kept under the name plus the category in brackets, e.g. "Halloumi (small plates)".
- Gluten Free menu dishes that are not repeats go in one category, "Gluten free menu".
- Names: as printed, in sentence-style capitals, "(v)" dropped (the icon carries it), "Lg" -> "(large)", "Btl" -> "(bottle)", the
  doubled "and and" in one drink name fixed. A volume at the end of a name ("175ml") is also the serving.
- Tags: vegetarian when the page's own icon says Vegetarian or Vegan. contains_pork / contains_beef only from the dish NAME (the page
  prints no ingredients); other meat dishes are listed as "meat type not stated".
- Left out (EXCLUDED): table-top bottles, whose figure is for the container (Sriracha 1,455 kcal, ketchup 349) and not a portion;
  the sachets are listed.
- Held back (HOLDBACK, holdback.csv): rows whose figure the same page contradicts, e.g. a brunch "with a poached egg" at 137 kcal
  when the same brunch with no egg is 665. Never corrected; restoring one is deleting its line in holdback.csv.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import giraffe_pages as gp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "giraffe"
BASE = "https://menus.tenkites.com/brg/giraffeadults"
SOURCE_TITLE = ("Giraffe Dietary Information: Breakfast, Main, Dessert, Gluten Free, Kid's and Drinks menus on Ten Kites "
                "(accessed {checked}, no date shown)")
ALLERGEN_TITLE = "Giraffe Dietary Information: allergens on the Ten Kites menus (accessed {checked}, no date shown)"
NOTE = ("Giraffe prints calories only, so protein, carbs and fat are not published. Figures use \"typical weights and measures\" and can "
        "vary a little. Drinks with no calorie figure on the page (most wines, some cocktails) are not listed, and a few rows that "
        "contradict the same page are held back.")
# menu name -> (saved file name, dishes the page must print)
MENUS = {
    "Breakfast Menu": ("giraffe_breakfast.html", 43),
    "Main Menu": ("giraffe_main.html", 68),
    "Dessert Menu": ("giraffe_dessert.html", 9),
    "Gluten Free Menu": ("giraffe_glutenfree.html", 36),
    "Kid's Menu": ("giraffe_kids.html", 37),
    "Drinks Menu": ("giraffe_drinks.html", 122),
}
# Which row survives when the same dish is printed on several menus (standard menus first, the gluten free list last).
PRIORITY = ["Breakfast Menu", "Main Menu", "Dessert Menu", "Kid's Menu", "Drinks Menu", "Gluten Free Menu"]
GF = "Gluten free menu"
# (menu, printed section) -> category shown. Every section on every page must be listed: a new one stops the run.
CATEGORIES = {
    ("Breakfast Menu", "BREAKFAST"): "Breakfast", ("Breakfast Menu", "BREAKFAST SIDES"): "Breakfast sides",
    ("Main Menu", "NIBBLES"): "Nibbles", ("Main Menu", "SMALL PLATES"): "Small plates", ("Main Menu", "Mains"): "Mains",
    ("Main Menu", "Burgers"): "Burgers", ("Main Menu", "Burger Extras"): "Burger extras", ("Main Menu", "Sides"): "Sides",
    ("Main Menu", "Condiments"): "Condiments",
    ("Dessert Menu", "DESSERTS"): "Desserts",
    **{("Gluten Free Menu", s): GF for s in ("Breakfast", "Kids Breakfast", "Starters", "Burgers", "Mains", "Sides", "Desserts",
                                              "Kids Main", "Kids Sides", "Kids Dessert")},
    ("Kid's Menu", "KIDS BREAKFAST"): "Kids breakfast", ("Kid's Menu", "KIDS MAINS"): "Kids mains",
    ("Kid's Menu", "KIDS SIDES"): "Kids sides", ("Kid's Menu", "KIDS DESSERTS"): "Kids desserts",
    ("Kid's Menu", "KIDS DRINKS"): "Kids drinks",
    ("Drinks Menu", "COCKTAILS"): "Cocktails", ("Drinks Menu", "ALCOHOL FREE"): "Alcohol free",
    ("Drinks Menu", "SPIRITS"): "Spirits", ("Drinks Menu", "WHITE WINE"): "White wine", ("Drinks Menu", "RED WINE"): "Red wine",
    ("Drinks Menu", "ROSE WINE"): "Rose wine", ("Drinks Menu", "SPARKLING WINE"): "Sparkling wine",
    ("Drinks Menu", "BEER & CIDER"): "Beer & cider", ("Drinks Menu", "G&T"): "Gin & tonic", ("Drinks Menu", "MIXERS"): "Mixers",
    ("Drinks Menu", "SOFT DRINKS"): "Soft drinks", ("Drinks Menu", "SMOOTHIES"): "Smoothies",
    ("Drinks Menu", "HOT DRINKS"): "Hot drinks", ("Drinks Menu", "KIDS DRINKS"): "Kids drinks",
}
DRINK_MENUS = {"Drinks Menu"}
NAME_FIXES = {"Malfy Con Arancia Gin and and Slimline Tonic": "Malfy Con Arancia Gin and Slimline Tonic"}  # doubled word in the source

# Left out: (menu, section, printed name) -> why. All must still be on the page.
EXCLUDED = {
    ("Main Menu", "Condiments", "Ketchup"): "table-top bottle: 349 kcal is for the container (the sachet is 10 kcal), no portion stated",
    ("Main Menu", "Condiments", "Mayonnaise"): "table-top jar: figure is for the container (the sachet is 66 kcal), no portion stated",
    ("Main Menu", "Condiments", "Malt Vinegar"): "table-top bottle, no portion stated",
    ("Main Menu", "Condiments", "Table Top Sriracha - 29814"): "table-top bottle: 1,455 kcal is for the container, no portion stated",
    ("Main Menu", "Condiments", "HP Sauce - 0075246"): "table-top bottle: 549 kcal is for the container, no portion stated",
}
BRUNCH = "the same page prints {other} kcal for the same dish with no egg and more for the fried and scrambled egg versions"
NACHOS = "the same page prints 982 kcal for Fully Loaded Nachos, and a dish 'with {meat}' cannot be fewer calories"
SALAD = "the same menu prints 459 kcal for Moroccan Caesar Salad; a salad 'with {add}' cannot be fewer calories (looks like the add-on's own figure)"
JUICE = "{kcal} kcal printed for a juice; every other juice on the page prints 71-123"
CAESAR = ("allergen row contradicts the dish name/ingredients: the page marks no fish (in 'Contains' or 'could also include') for a Caesar "
          "salad and prints no ingredients; Giraffe's own site says only 'smoked Caesar dressing'")
HOLDBACK = {
    ("Breakfast Menu", "BREAKFAST", "Giraffe Brunch (Poached Egg)"): BRUNCH.format(other=665),
    ("Breakfast Menu", "BREAKFAST", "Bigger Giraffe Brunch (Poached Egg)"): BRUNCH.format(other="1,150"),
    ("Breakfast Menu", "BREAKFAST", "Veggie Brunch (Poached Egg)"): BRUNCH.format(other=515),
    ("Main Menu", "NIBBLES", "Fully Loaded Nachos with Pork"): NACHOS.format(meat="Pork"),
    ("Main Menu", "NIBBLES", "Fully Loaded Nachos with Beef"): NACHOS.format(meat="Beef"),
    ("Gluten Free Menu", "Starters", "Fully Loaded Nachos with Pork"): NACHOS.format(meat="Pork"),
    ("Gluten Free Menu", "Mains", "Moroccan Caesar Salad with Chicken"): SALAD.format(add="Chicken"),
    ("Gluten Free Menu", "Mains", "Moroccan Caesar Salad with Halloumi"): SALAD.format(add="Halloumi"),
    ("Drinks Menu", "RED WINE", "Merlot 125ml"): "0 kcal printed for a red wine, which contains alcohol (other wines print 120 kcal per 175ml)",
    ("Drinks Menu", "RED WINE", "Merlot 175ml"): "0 kcal printed for a red wine, which contains alcohol (other wines print 120 kcal per 175ml)",
    ("Drinks Menu", "RED WINE", "Merlot 250ml"): "0 kcal printed for a red wine, which contains alcohol (other wines print 171 kcal per 250ml)",
    ("Drinks Menu", "RED WINE", "Merlot Btl"): "0 kcal printed for a red wine, which contains alcohol (the white bottle prints 513 kcal)",
    ("Drinks Menu", "SOFT DRINKS", "Cranberry Juice"): JUICE.format(kcal=720),
    ("Drinks Menu", "KIDS DRINKS", "Cranberry Juice"): JUICE.format(kcal=360),
    ("Drinks Menu", "SPIRITS", "Havana 3 Year Old rum 25ml"): "16 kcal per 25ml printed; the other spirits on the page print 55-63 kcal per 25ml",
    ("Drinks Menu", "SPIRITS", "Havana 3 Year Old rum 50ml"): "32 kcal per 50ml printed; the other spirits on the page print 110-126 kcal per 50ml",
    # added after the independent allergen re-read of 2026-10-08 (data/audit/verified/giraffe.json): the allergen row contradicts the
    # dish's own name and the page prints no ingredients to say which is right, so neither is published (nothing is corrected)
    ("Main Menu", "Mains", "Moroccan Caesar Salad"): CAESAR,
    ("Gluten Free Menu", "Mains", "Moroccan Caesar Salad"): CAESAR,
    ("Drinks Menu", "COCKTAILS", "Hazelnut Espresso Martini"): ("allergen row contradicts the dish name/ingredients: the page prints 'This dish contains none of the "
                                                               "listed allergens' (no tree nuts) for a hazelnut-named cocktail and prints no ingredients"),
}
# Listed in the notes column (not exported) because the figure looks odd, but nothing on the page contradicts it.
ODD = {
    ("Kid's Menu", "KIDS MAINS", "Bangers"): "1,010 kcal for a Kid's main is higher than most adult mains; entered as printed",
    ("Main Menu", "Mains", "Fish & Chips add Tartare Sauce"): "the figure is the sauce's own calories, not the whole dish",
    ("Main Menu", "Mains", "Fish & Chips add Curry Sauce"): "the figure is the sauce's own calories, not the whole dish",
    ("Main Menu", "Mains", "Fish & Chips add Gravy"): "the figure is the sauce's own calories, not the whole dish",
}
EXTRA_ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # the page's own spelling of the label
UNSPECIFIED_MEAT = re.compile(r"\b(bangers?|brunch)\b", re.I)  # more dishes that name no meat (tk.MEAT_UNSPECIFIED has the rest)
UNSPECIFIED_SECTIONS = {("Gluten Free Menu", "Burgers")}  # burgers whose names say neither burger nor meat ("California")
VOLUME = re.compile(r"\b(\d+ml)$")
# Allergen keys a Vegetarian / Vegan icon should not sit beside (reported, never changed).
NOT_VEGETARIAN = {"fish", "crustaceans", "molluscs"}
NOT_VEGAN = NOT_VEGETARIAN | {"milk", "eggs"}


def tidy_name(printed: str) -> str:
    n = " ".join(printed.replace("ㅤ", " ").split())
    n = re.sub(r"\s*\(v\)$", "", n, flags=re.I)
    n = re.sub(r"\s+Lg$", " (large)", n)
    n = re.sub(r"\s+Btl$", " (bottle)", n)
    n = NAME_FIXES.get(n, n)
    return tk.tidy_case(n)


def fetch_pages(dest: Path) -> None:
    first = dest / MENUS["Breakfast Menu"][0]
    tk.fetch(BASE, first)
    tabs = gp.menu_tabs(first.read_text(encoding="utf-8"))
    if [t[0] for t in tabs] != list(MENUS):
        raise SystemExit(f"The page's menu selector changed: {[t[0] for t in tabs]}, expected {list(MENUS)}")
    for name, mid in tabs[1:]:
        tk.fetch(f"{BASE}?mguid={mid}", dest / MENUS[name][0])


def read_all(pages: Path) -> list[dict]:
    rows = []
    for menu, (fname, expected) in MENUS.items():
        text = (pages / fname).read_text(encoding="utf-8")
        title, _file = gp.page_menu(text)
        if title != menu:
            raise SystemExit(f"{fname} is the page {title!r}, expected {menu!r}")
        dishes = gp.read_dishes(text, menu)
        if len(dishes) != expected:
            raise SystemExit(f"{fname} prints {len(dishes)} dishes but this script expects {expected}: the menu changed, re-check "
                             "CATEGORIES, EXCLUDED, HOLDBACK and the expected counts before running again.")
        rows += dishes
    return rows


def check_keys(rows: list[dict]) -> None:
    keys = {(r["menu"], r["section"], r["name"]) for r in rows}
    for label, table in (("EXCLUDED", EXCLUDED), ("HOLDBACK", HOLDBACK), ("ODD", ODD)):
        gone = sorted(k for k in table if k not in keys)
        if gone:
            raise SystemExit(f"{label} names dishes that are no longer on the pages: {gone}. The menu changed: re-check the table.")
    for r in rows:
        if (r["menu"], r["section"]) not in CATEGORIES:
            raise SystemExit(f"New section {r['section']!r} on the {r['menu']}: add it to CATEGORIES.")


def check_icons(r: dict) -> None:
    """The Vegetarian / Vegan icons must agree with the label ids (50 = Vegetarian, 52 = Vegan) the page itself reads."""
    all_ids = set(r["label_ids"][0])
    if ("52" in all_ids) != r["vegan"] or ("50" in all_ids) != r["vegetarian"]:
        raise SystemExit(f"{r['name']}: dietary icons (vegan {r['vegan']}, vegetarian {r['vegetarian']}) disagree with label ids "
                         f"{sorted(all_ids & {'50', '52'})}")


def build(pages: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    rows = read_all(pages)
    check_keys(rows)
    entries = []
    for r in rows:
        key = (r["menu"], r["section"], r["name"])
        check_icons(r)
        kcal = gp.calories(r["energy"])
        if key in EXCLUDED:
            report.append(f"left out {key[0]} > {key[2]!r} {r['energy']}: {EXCLUDED[key]}")
            continue
        if not kcal:
            report.append(f"not listed (no calories printed): {key[0]} > {r['section']} > {r['name']}")
            continue
        al = gp.allergens(r, f"{r['menu']} > {r['name']}", EXTRA_ALLERGEN_WORDS)
        if al is None:
            raise SystemExit(f"{r['name']}: no allergen data to check against; the page layout changed")
        entries.append({**r, "key": key, "kcal": kcal, "tidy": tidy_name(r["name"]), "category": CATEGORIES[(r["menu"], r["section"])],
                        "al": al, "held": HOLDBACK.get(key)})

    # same dish printed on several menus: keep the first in PRIORITY order, only when name, calories and allergens all agree
    def sig(e):
        a = e["al"]
        return (e["tidy"], e["kcal"], tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])),
                tuple(sorted(a["nuts"])), e["vegetarian"], e["vegan"])

    kept: dict = {}
    for e in sorted(entries, key=lambda e: PRIORITY.index(e["menu"])):
        k = sig(e)
        if k in kept:
            first = kept[k]
            if bool(first["held"]) != bool(e["held"]):
                raise SystemExit(f"{e['name']} is held back on one menu but not on the other: decide both")
            report.append(f"dropped repeat: {e['menu']} > {e['name']} ({e['kcal']} kcal) is the same dish, calories and allergens as "
                          f"{first['menu']} > {first['name']}")
            continue
        kept[k] = e
    keep_ids = {id(e) for e in kept.values()}
    entries = [e for e in entries if id(e) in keep_ids]

    # the same name left on different dishes: add the category
    by_name: dict = {}
    for e in entries:  # compared as ids are ("&" and "and" are the same name)
        by_name.setdefault(slug(e["tidy"]), []).append(e)
    for group in by_name.values():
        if len(group) > 1:
            for e in group:
                e["tidy"] = f"{e['tidy']} ({e['category'].lower()})"
                report.append(f"same name on different dishes, renamed: {e['tidy']!r} ({e['kcal']} kcal)")
    names = [e["tidy"] for e in entries]
    if len(set(names)) != len(names) or len({slug(n) for n in names}) != len(names):
        slugs = [slug(n) for n in names]
        dup = sorted({n for n in names if names.count(n) > 1} | {n for n in names if slugs.count(slug(n)) > 1})
        raise SystemExit(f"names (or their ids) still not unique: {dup}")

    items, holdback = [], []
    for e in entries:
        veg = e["vegetarian"] or e["vegan"]
        tags = ["vegetarian"] if veg else []
        notes = [f"Printed {e['name']!r} under {e['menu']} > {e['section']}, '{e['energy']}'"]
        if e["menu"] not in DRINK_MENUS:
            meat, unspecified = tk.meat_tags(e["name"], vegetarian=veg)
            tags += meat
            named_nothing = UNSPECIFIED_MEAT.search(e["name"]) or (e["menu"], e["section"]) in UNSPECIFIED_SECTIONS
            if (unspecified or (named_nothing and not meat)) and not veg:
                report.append(f"meat type not stated: {e['tidy']}")
        if tidy_name(e["name"]) != e["tidy"]:
            notes.append(f"renamed from {tidy_name(e['name'])!r} because the name is used for another dish")
        if e["key"] in ODD:
            notes.append(ODD[e["key"]])
            report.append(f"odd (kept as printed): {e['tidy']}: {ODD[e['key']]}")
        bad = NOT_VEGAN if e["vegan"] else NOT_VEGETARIAN
        if veg and (set(e["al"]["contains"]) & bad):
            msg = (f"{'Vegan' if e['vegan'] else 'Vegetarian'} icon but contains {sorted(set(e['al']['contains']) & bad)}")
            notes.append(msg)
            report.append(f"{e['tidy']}: {msg}")
        if e["held"]:
            holdback.append((slug(e["tidy"]), e["held"]))
        m = VOLUME.search(e["tidy"])
        items.append({"id": slug(e["tidy"]), "name": e["tidy"], "category": e["category"], "serving": m.group(1) if m else "",
                      "calories": e["kcal"], "tags": "|".join(tags), "rankable": False, "notes": "; ".join(notes),
                      "allergens": e["al"]})
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or to receive, with --fetch) the six saved pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were downloaded")
    ap.add_argument("--fetch", action="store_true", help="download the six pages into --pages first (one request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.pages.mkdir(parents=True, exist_ok=True)
        fetch_pages(args.pages)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Giraffe", cuisine="World food", source_title=SOURCE_TITLE.format(checked=args.checked_on),
        source_url=BASE, checked_on=args.checked_on, aliases=["giraffe", "giraffe restaurant", "giraffe restaurants"], items=items,
        out=args.out, note=NOTE, holdback=holdback, nutrition_level="calories",
        allergen_guide={"title": ALLERGEN_TITLE.format(checked=args.checked_on), "url": BASE, "checked_on": args.checked_on,
                        "may_contain_published": True})
    for menu, (fname, _) in MENUS.items():
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
