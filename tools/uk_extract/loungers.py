#!/usr/bin/env python3
"""Build data/source/loungers/ from the Lounge menus on Ten Kites. A CALORIES-ONLY chain.

    python3 tools/uk_extract/loungers.py --pages DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: https://menus.tenkites.com/loungers/lounges09, the Ten Kites page thelounges.co.uk/<venue>/menus embeds (Arco, Alto ...; Bardo
embeds lounges10: checked 2026-10-07, its menu selector has the same ids except CHRISTMAS, and its STANDARD page (88 plain dishes) and
its CHRISTMAS menu have the same dishes, calories and allergens as lounges09's). The page holds eight menus (STANDARD, CHRISTMAS, GLUTEN FREE, VEGAN, KIDS, DRINKS, EGG FREE,
MILK FREE): the first at that URL, the others at ?mguid=<menu id> (the ids are listed in the page's own menu selector). The page
shows no date, so the source title says "(accessed <date>, no date shown)". --fetch downloads the eight pages (one request per
second); without it DIR must hold loungers_standard.html, loungers_christmas.html, loungers_glutenfree.html, loungers_vegan.html,
loungers_kids.html, loungers_drinks.html, loungers_eggfree.html and loungers_milkfree.html. Reader: loungers_pages.py (+ tenkites_c.py).
robots.txt of menus.tenkites.com (checked 2026-10-07) disallows only /fonts/, /views/ and /*.less$. The "Download Menu" PDF is on
images.tenkites.com, whose robots.txt says "Disallow: /": it is NOT used.

CALORIES ARE HIDDEN BY DEFAULT behind a visible switch (decision of the founder's delegate: a nutrition block the chain's own page lets
any visitor reveal with a visible control counts as published). The toolbar shows "Hide Calories" with a Yes / No switch, set to Yes
when the page opens. Checked in Chromium on 2026-10-07 on each of the eight menus: on opening the switch reads Yes and 0 calorie
figures are visible beside the dishes; after clicking it to No, every dish that has a figure shows "<n> kcal" beside its name
(standard 106 of 107 dishes, christmas 24 of 25, gluten free 82 of 83, vegan 35 of 36, kids 36 of 36, drinks 45 of 73, egg free 58
of 59, milk free 41 of 42). On the STANDARD menu the dish pop-up (the "i" icon) shows only the allergen lines until the switch is
flipped and then adds "Nutrition (per portion) Energy (kCal)". The figures are in the page's HTML all along; they are read from
there, and they are the same ones the switch shows (the rendered page with the switch on No was compared with the output: all 461
dishes' names and calories, and 102 pop-ups' allergens, vegetarian marks and calories, 0 differences). toggle_info() checks
that the switch is still there and still starts on "Yes" and the run stops if it is not: re-check note.txt then.

WHAT IS PRINTED. Each dish prints its calories ("963 kcal", the pop-up table says "Nutrition (per portion) / Energy (kCal) / 963")
and nothing else numeric: no protein, carbohydrate, fat, salt, sugar, fibre, kJ or weight anywhere, so protein_g, carbs_g, fat_g and
every other nutrient column stay blank (never 0) and the chain is calories-only (docs/DATA.md). A thousands comma is dropped
("1,689" -> 1689); nothing else is changed. Dishes with no figure (the pop-up table says "-", or nothing) are not listed: Baileys
Cheesecake (Christmas), Tapas Board Deal (a choice of three tapas), and every cocktail and shot (the script prints them).

ALLERGENS are complete. Every dish's pop-up prints "Contains: ..." (cereals and tree nuts named in brackets), "May contain: ..." and
"Suitable for: ..." lines; a dish with none prints "This dish contains none of the listed allergens", and a dish with only a "May
contain" line has no "Contains" line (the page leaves empty sections out). The page's allergen filter reads data-all-labels /
data-no-may-labels on each dish; tenkites_c.allergens_checked() compares the printed lines with those ids and the run stops if they
ever disagree. The Vegetarian / Vegan marks are checked against the same ids.

CHOICES (all logged in the report; none touches a number):
- The eight menus overlap. A repeat with the same name, calories AND allergens is dropped (the first menu in PRIORITY order is kept:
  e.g. "Add Fries" is printed on five menus, Sticky Toffee Pudding on STANDARD and CHRISTMAS). The same name with other numbers (the
  Kids menu's Fries 253 vs the Sides' 628, kids and adult Warm Chocolate Brownie) is kept under the name plus the category in
  brackets. Dishes the chain prefixes "GF", "EF" and "MF" (gluten, egg and milk free versions) have their own names and rows.
- Categories: the STANDARD menu's sections as printed; every other menu's dishes go in one category named after that menu
  ("Gluten free menu", "Vegan menu", "Egg free menu", "Milk free menu", "Christmas menu"); the Kids menu keeps its four parts and the
  DRINKS menu its sections. Christmas dishes are limited_time.
- Add-ons and choices inside a dish block ("Add: STREAKY BACON" under Smashed Avocado Brunch, "Side Options: ADD FRIES", the burgers'
  "with fries / with side salad / upgrade to sweet potato fries") are rows of their own with their own printed calories: "Add" ones
  become "Add <name>", the burgers' ones get " (burger side)". Each figure is the add-on's own, not a dish total, and the page does
  not say whether a dish's figure includes the side served with it.
- Names: as printed, in title case ("LOUNGE BREAKFAST" -> "Lounge Breakfast"; GF, EF, MF, BLT stay as they are), "WTH" fixed to "WITH".
- Tags: vegetarian when the page says "Suitable for: Vegetarian" (or Vegan). contains_pork / contains_beef only from the dish name and
  the page's own description line under it (bacon, sausage, pork belly, pig-in-blanket; beef, brisket); other meat dishes would be
  listed as "meat type not stated" (none are: the six smash burgers say "smashed patties" without naming the meat, and carry
  contains_pork / contains_beef from the bacon or brisket named beside them).
- Held back (HOLDBACK, holdback.csv): none needed; nothing on the page contradicts another figure.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import loungers_pages as lp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "loungers"
BASE = "https://menus.tenkites.com/loungers/lounges09"
SOURCE_TITLE = ("Loungers (Lounge) nutrition and allergen menus on Ten Kites: Standard, Christmas, Gluten Free, Vegan, Kids, Drinks, "
                "Egg Free and Milk Free (accessed {checked}, no date shown)")
ALLERGEN_TITLE = "Loungers (Lounge) allergen information on the Ten Kites menus (accessed {checked}, no date shown)"
NOTE = ("The Lounge menu page hides calories by default behind a \"Hide Calories\" switch (set it to No to show them). Calories only: "
        "protein, carbs and fat are not published. GF, EF and MF are the chain's gluten, egg and milk free dishes. Cocktails, shots and a "
        "few dishes show no calories and are not listed. Not Cosy Club or Brightside.")
# menu name -> (saved file name, dishes/add-ons the page must print)
MENUS = {
    "STANDARD": ("loungers_standard.html", 107),
    "CHRISTMAS": ("loungers_christmas.html", 25),
    "GLUTEN FREE": ("loungers_glutenfree.html", 83),
    "VEGAN": ("loungers_vegan.html", 36),
    "KIDS": ("loungers_kids.html", 36),
    "DRINKS": ("loungers_drinks.html", 73),
    "EGG FREE": ("loungers_eggfree.html", 59),
    "MILK FREE": ("loungers_milkfree.html", 42),
}
# Which row survives when the same dish is printed on several menus.
PRIORITY = ["STANDARD", "KIDS", "DRINKS", "CHRISTMAS", "GLUTEN FREE", "VEGAN", "EGG FREE", "MILK FREE"]
STANDARD_SECTIONS = {
    "Brunch": "Brunch", "Toasties & Sarnies": "Toasties & sarnies", "Folded Flatbreads": "Folded flatbreads", "Burgers": "Burgers",
    "Mains": "Mains", "Mezze Bowls": "Mezze bowls", "Tapas": "Tapas", "Sides": "Sides", "Puds": "Puds", "Cakes + Bakes": "Cakes + bakes",
}
KIDS_SECTIONS = {"SNACK POT": "Kids snack pot", "CLASSIC DISHES": "Kids classic dishes", "BUILD YOUR OWN DISH": "Kids build your own",
                 "PUDDINGS": "Kids puddings"}
DRINKS_SECTIONS = {
    "COFFEE": "Coffee", "NOT COFFEE": "Not coffee", "TEA": "Tea", "ICED LATTES": "Iced lattes", "MILKSHAKES": "Milkshakes",
    "HOMEMADE DRINKS": "Homemade drinks", "SMOOTHIES & JUICES": "Smoothies & juices", "COCKTAILS": "Cocktails", "SHOTS": "Shots",
    "MOCKTAILS": "Mocktails",
}
# One category for every dish of these menus (their printed sections are listed so a new one stops the run).
ONE_CATEGORY = {
    "CHRISTMAS": ("Christmas menu", {"Starters", "Mains", "Puddings"}),
    "GLUTEN FREE": ("Gluten free menu", {"Brunch", "Toasties + Sarnies", "Burgers", "Mains", "Mezze Bowls", "Tapas", "Sides", "Puds", "Cakes"}),
    "VEGAN": ("Vegan menu", {"Brunch", "Mains", "Tapas", "Sides", "Puddings + Cakes"}),
    "EGG FREE": ("Egg free menu", {"Brunch", "Toasties", "Folded Flatbreads", "Burgers", "Mains", "Mezze Bowls", "Tapas", "Sides", "Puds"}),
    "MILK FREE": ("Milk free menu", {"Brunch", "Sarnies + Folded Flatbreads", "Burgers", "Mains", "Tapas", "Sides", "Puds"}),
}
LIMITED = {"CHRISTMAS"}
NAME_FIXES = {"DAN DAN NOODLES WTH CRISPY CAULIFLOWER & SOY MUSHROOM": "DAN DAN NOODLES WITH CRISPY CAULIFLOWER & SOY MUSHROOM"}
ACRONYMS = {"GF", "EF", "MF", "BLT", "PB&J", "AF", "BBQ", "UK"}
SMALL = {"a", "an", "and", "of", "the", "with", "in", "on", "to", "for", "or"}
EXTRA_ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # the page's own spelling of the label
PIG = re.compile(r"\bpigs?[- ]in[- ]blankets?\b", re.I)
BURGER_SIDE = "Our burgers are served in a"
# Figures that look odd but nothing on the page contradicts: kept as printed, noted in the notes column.
ODD = {
    ("KIDS", "TENDERSTEM BROCCOLI"): "3 kcal for a kids' side of tenderstem broccoli (the Sides menu prints 152 for its own portion); entered as printed",
    ("EGG FREE", "EF MACARONI CHEESE SMALL"): "printed 520 kcal, the same as the (regular) Macaroni Cheese on the Standard menu; entered as printed",
}
NOT_VEGETARIAN = {"fish", "crustaceans", "molluscs"}
NOT_VEGAN = NOT_VEGETARIAN | {"milk", "eggs"}


def title_name(printed: str) -> str:
    """'BUTTERMILK PANCAKES WITH SMOKED STREAKY BACON & MAPLE SYRUP' -> 'Buttermilk Pancakes with Smoked Streaky Bacon & Maple Syrup'.
    Words that already carry lower-case letters (e.g. '(Made with Gluten Free Oats)') are left alone."""
    printed = NAME_FIXES.get(" ".join(printed.split()), " ".join(printed.split()))
    out = []
    for i, tok in enumerate(printed.split()):
        letters = re.sub(r"[^A-Za-zÀ-ÿ]", "", tok)
        if not letters or letters != letters.upper():
            out.append(tok)
        elif tok.strip("()") in ACRONYMS:
            out.append(tok)
        elif i and tok.lower() in SMALL:
            out.append(tok.lower())
        else:
            out.append(re.sub(r"[A-Za-zÀ-ÿ]+(?:['’][A-Za-zÀ-ÿ]+)*", lambda m: m.group(0).capitalize(), tok))
    return " ".join(out)


def fetch_pages(dest: Path) -> None:
    first = dest / MENUS["STANDARD"][0]
    tk.fetch(BASE, first)
    tabs = lp.menu_tabs(first.read_text(encoding="utf-8"))
    if [t[0] for t in tabs] != list(MENUS):
        raise SystemExit(f"The page's menu selector changed: {[t[0] for t in tabs]}, expected {list(MENUS)}")
    for name, mid in tabs[1:]:
        tk.fetch(f"{BASE}?mguid={mid}", dest / MENUS[name][0])


def category(menu: str, section: str, subsection: str) -> str:
    if menu == "STANDARD":
        if section in STANDARD_SECTIONS:
            return STANDARD_SECTIONS[section]
    elif menu == "KIDS":
        if section in KIDS_SECTIONS:
            return KIDS_SECTIONS[section]
    elif menu == "DRINKS":
        if section in DRINKS_SECTIONS:
            return DRINKS_SECTIONS[section]
    elif menu in ONE_CATEGORY and section in ONE_CATEGORY[menu][1]:
        return ONE_CATEGORY[menu][0]
    raise SystemExit(f"New section {section!r} (sub-section {subsection!r}) on the {menu} menu: add it to the category tables.")


def read_all(pages: Path) -> list[dict]:
    rows = []
    for menu, (fname, expected) in MENUS.items():
        text = (pages / fname).read_text(encoding="utf-8")
        if lp.page_title(text) != menu:
            raise SystemExit(f"{fname} is the page {lp.page_title(text)!r}, expected {menu!r}")
        info = lp.toggle_info(text)
        if info != {"label": "Hide Calories", "default_hides": True, "on": "Yes", "off": "No"}:
            raise SystemExit(f"{fname}: the calorie switch changed ({info}): re-check how the page shows calories, then update this script and note.txt")
        dishes = lp.read_dishes(text, menu)
        if len(dishes) != expected:
            raise SystemExit(f"{fname} prints {len(dishes)} dishes but this script expects {expected}: the menu changed, re-check the "
                             "category tables and the expected counts before running again.")
        rows += dishes
    return rows


def item_name(r: dict) -> str:
    name = title_name(r["name"])
    if r["role"] == "option":
        if r["group"] == "Add":
            name = f"Add {name}"
        elif r["group"].startswith(BURGER_SIDE):
            name = f"{name} (burger side)"
        elif r["group"] not in ("Or", "Side Options", "Side Option"):
            raise SystemExit(f"{r['name']}: an option under the new heading {r['group']!r}: decide how it is named")
    return name


def build(pages: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    rows = read_all(pages)
    entries = []
    for r in rows:
        where = f"{r['menu']} > {r['name']}"
        kcal, problem = lp.calories(r)
        if problem:
            raise SystemExit(f"{r['menu']}: {problem}")
        if bool(kcal) != bool(r["energy"]):
            raise SystemExit(f"{where}: the figure beside the dish ({r['energy']!r}) and the pop-up ({r['table']}) disagree about whether there is a figure")
        cat = category(r["menu"], r["section"], r["subsection"])
        if not kcal:
            report.append(f"not listed (no calories printed): {r['menu']} > {r['section']} > {r['name']}")
            continue
        al = lp.allergens(r, where, EXTRA_ALLERGEN_WORDS)
        if al is None:
            raise SystemExit(f"{where}: no allergen data to check against; the page layout changed")
        suitable = {s.lower() for s in r["suitable"]}
        if suitable - {"vegan", "vegetarian"}:
            raise SystemExit(f"{where}: unknown 'Suitable for' value(s) {sorted(suitable)}")
        all_ids = set(r["label_ids"][0])
        if ("52" in all_ids) != ("vegan" in suitable) or ("50" in all_ids) != ("vegetarian" in suitable):
            raise SystemExit(f"{where}: 'Suitable for' {sorted(suitable)} disagrees with the label ids {sorted(all_ids & {'50', '52'})}")
        entries.append({**r, "kcal": kcal, "tidy": item_name(r), "category": cat, "al": al, "vegan": "vegan" in suitable,
                        "vegetarian": "vegetarian" in suitable or "vegan" in suitable})

    # the same dish printed on several menus: keep the first in PRIORITY order, only when name, calories and allergens all agree
    def sig(e):
        a = e["al"]
        return (e["tidy"], e["kcal"], tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])),
                tuple(sorted(a["nuts"])), e["vegetarian"], e["vegan"])

    kept: dict = {}
    for e in sorted(entries, key=lambda e: PRIORITY.index(e["menu"])):
        k = sig(e)
        if k in kept:
            first = kept[k]
            report.append(f"dropped repeat: {e['menu']} > {e['tidy']} ({e['kcal']} kcal) is the same dish, calories and allergens as "
                          f"{first['menu']} > {first['tidy']}")
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
            suffixes = [e["category"].lower() for e in group]
            if len(set(suffixes)) < len(suffixes):  # one-category menus: the printed section tells them apart (tapas / mains)
                suffixes = [f"{e['category'].lower()}, {e['section'].lower()}" for e in group]
            for e, suffix in zip(group, suffixes):
                e["tidy"] = f"{e['tidy']} ({suffix})"
                report.append(f"same name on different dishes, renamed: {e['tidy']!r} ({e['kcal']} kcal)")
    names = [e["tidy"] for e in entries]
    if len({slug(n) for n in names}) != len(names):
        slugs = [slug(n) for n in names]
        dup = sorted({n for n in names if slugs.count(slug(n)) > 1})
        raise SystemExit(f"names (or their ids) still not unique: {dup}")

    items, holdback = [], []
    for e in entries:
        tags = ["vegetarian"] if e["vegetarian"] else []
        notes = [f"Printed {e['name']!r} under {e['menu']} > {e['section']}{' > ' + e['subsection'] if e['subsection'] else ''}"
                 f"{' > ' + e['group'] if e['group'] else ''}, '{e['energy']}'"]
        meat, unspecified = tk.meat_tags(e["name"], e["desc"], vegetarian=e["vegetarian"])
        if not e["vegetarian"] and "contains_pork" not in meat and PIG.search(f"{e['name']} {e['desc']}"):
            meat.append("contains_pork")  # the dish's own words say "pig" ("pig-in-blanket", "pigs-in-blankets")
        tags += meat
        if unspecified and not e["vegetarian"]:
            report.append(f"meat type not stated: {e['tidy']}")
        if e["role"] == "option":
            notes.append("an add-on / choice with its own figure, not a dish total")
        key = (e["menu"], e["name"])
        if key in ODD:
            notes.append(ODD[key])
            report.append(f"odd (kept as printed): {e['tidy']}: {ODD[key]}")
        bad = NOT_VEGAN if e["vegan"] else NOT_VEGETARIAN
        if e["vegetarian"] and (set(e["al"]["contains"]) & bad):
            msg = f"{'Vegan' if e['vegan'] else 'Vegetarian'} mark but contains {sorted(set(e['al']['contains']) & bad)}"
            notes.append(msg)
            report.append(f"{e['tidy']}: {msg}")
        items.append({"id": slug(e["tidy"]), "name": e["tidy"], "category": e["category"], "serving": "", "calories": e["kcal"],
                      "tags": "|".join(tags), "rankable": False, "limited_time": e["menu"] in LIMITED, "notes": "; ".join(notes),
                      "allergens": e["al"]})
    missing = [k for k in ODD if not any((r["menu"], r["name"]) == k for r in rows)]
    if missing:
        raise SystemExit(f"ODD names dishes that are no longer on the pages: {missing}")
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or to receive, with --fetch) the eight saved pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were downloaded")
    ap.add_argument("--fetch", action="store_true", help="download the eight pages into --pages first (one request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.pages.mkdir(parents=True, exist_ok=True)
        fetch_pages(args.pages)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Loungers", cuisine="Cafe", source_title=SOURCE_TITLE.format(checked=args.checked_on),
        source_url=BASE, checked_on=args.checked_on, aliases=["loungers", "lounge", "the lounge", "lounges", "the lounges"], items=items,
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
