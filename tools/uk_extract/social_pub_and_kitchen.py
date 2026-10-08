#!/usr/bin/env python3
"""Build data/source/social-pub-and-kitchen/ from Social Pub & Kitchen's official allergen and nutritional data.

    python3 tools/uk_extract/social_pub_and_kitchen.py --checked-on 2026-10-08 [--pages DIR] [--out DIR]

Source: https://tkmenus.com/socialpubkitchen (Stonegate's "Allergen & Nutritional Data", one page per menu, chosen with
?mguid=<menu id>; the same Ten Kites platform as Slug & Lettuce, so tenkites_b.py reads it). Pages are saved once into --pages
(default: a temp folder; delete it to refresh) at one request per second; numbers are copied exactly as printed. Only names,
categories and the choice of menus are typed here. The script stops if a page changes layout, a nutrient column or section appears
that is not mapped, or the row count no longer matches EXPECTED_ROWS.

Pubs differ by menu. The page says "not all menu items displayed on this website are available at all of our sites", the chain's own
site says not every pub serves food and a few have no pizza, and Scottish pubs have their own breakfast and bottomless-brunch menus.
So the rule is: a dish is published only if every place the page prints it agrees. Concretely:
  * the Scottish breakfast and Scottish bottomless brunch menus are read for comparison only. A dish on both a regular menu and its
    Scottish twin must have identical figures and allergens (otherwise it is left out and listed); Scottish-only dishes (the Big
    Scottish Breakfast, Lorne sausage, black pudding ...) are regional and are not published;
  * the same dish name printed on two menus with different figures is published once per menu, each named after its menu, so a
    person can pick the one that matches the menu they are ordering from (tenkites_b.unique_names).

Some dishes are printed as a "core" plus choices: "Crispy Chicken (Excluding Bread Option, see below)" with Flatbread or Wrap, each
with its own numbers. The core is published as the chain prints it (its name keeps the "Excluding" wording, and it is never suggested
as a meal on its own) and each choice is its own item under "Options & add-ons", so a person can add them up; nothing is summed here.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "social-pub-and-kitchen"
BASE_URL = "https://tkmenus.com/socialpubkitchen"

# label, menu id, short name, long name (order = which version of a clashing dish keeps the plain name)
MENUS = [
    ("main", "7a97db16-cd4e-44ff-b1aa-d4e55ee9b341", "main menu", "main menu"),
    ("lunch", "dd71ad64-5ba8-4f8f-b898-8abaa29db270", "lunch menu", "lunch menu"),
    ("vegan", "c12defc8-0d39-477c-af58-88d5f3a26315", "vegan menu", "vegan menu"),
    ("nogluten", "b65787af-91b1-4031-ac67-0ba4a144eb41", "no-gluten menu", "no-gluten containing menu"),
    ("kids", "04c5fdf4-c3d9-4a50-b1d3-1c39f0b67757", "kids' mini menu", "kids' mini menu"),
    ("breakfast", "1c11390b-e48f-41b4-8ec2-d2890377b398", "breakfast menu", "breakfast menu"),
    ("bottomless", "04f1abca-877b-4bca-a875-9c1de83fdd1d", "bottomless brunch", "bottomless brunch menu"),
    ("drinks", "30c3215c-a049-477f-bda0-9133d6754cbd", "drinks menu", "drinks menu"),
]
# Scotland's own breakfast and bottomless brunch menus: read to compare with their regular twin, never published.
SCOTTISH = [
    ("scottish_breakfast", "18da7b21-e289-47f3-9353-3da38018f711"),
    ("scottish_bottomless", "cf477e95-47c6-42bb-9c56-e176d415bdde"),
]
TWINS = {"breakfast": "scottish_breakfast", "bottomless": "scottish_bottomless"}
# Left out on purpose: the festive set / bottomless / pizza party / buffet / Christmas Day menus and Festive Sips (not on sale yet),
# the August 2026 Spicy Specials, Golden Hour Sips and Cosmic Drinks and the October 2026 Spooktober Sips (short seasonal runs),
# Six Nations Sips, Sauce Shop Dishes (February 2026), MIXR Bakewell Specials and MIXR Paddy's drinks (one venue / past),
# Set Menu, The Social Feast and Pizza Party Feast (group bookings), the 2025 Sunday Roasts menu and every January/March 2025,
# 2023 and 2022 menu (superseded guides).

SECTIONS = {
    "Bring on the Wings": "Wings", "Wings": "Wings", "Nibbles": "Nibbles", "Bar Snack": "Nibbles",
    "Sharers": "Sharers", "Sharer": "Sharers", "Chicken Wing Sharer": "Sharers", "Mix & Match Amongst the Table": "Sharers",
    "Wraps & Flatbreads": "Wraps & flatbreads", "Fancy A Wrap or Flatbread?": "Wraps & flatbreads",
    "Pizza Your Way": "Pizza", "Stone-Baked Pizzas": "Pizza", "Stone-Baked Pizza": "Pizza",
    "Spice Up Your Pizza": "Pizza extras", "Pizza Additional Toppers": "Pizza extras",
    "Dip Flight": "Dips", "Dips": "Dips", "Topped Fries": "Topped fries", "Loaded Fries": "Topped fries",
    "The Classics": "Classics", "Mains": "Mains", "Bowls": "Bowls",
    "Smash Beef Burgers": "Burgers", "Crispy Coated Chicken Burgers": "Burgers", "Plant-Based Burgers": "Burgers",
    "Smashing Burgers": "Burgers", "Smashing Burger": "Burgers", "Grilled Chicken Burgers": "Burgers",
    "Burger Additional Toppings": "Burger extras",
    "Sides": "Sides", "Fancy an Extra Side?": "Sides", "Roll With It": "Rolls",
    "Something Sweet": "Desserts", "Finish with Something Sweet!": "Desserts",
    "Full English": "Breakfast", "Breakfast": "Breakfast", "Brunch Dishes": "Brunch", "Extra Bits": "Breakfast extras",
    "Sandwiches": "Breakfast sandwiches",
    # drinks: every section of the Drinks menu, and the drinks lists on the other menus
    "Add a Drink": "Drinks", "Pick a Sip": "Drinks", "Fancy Something Saucy? Upgrade Your Drink;": "Drinks",
    "Cocktails & Fizz": "Drinks", "Pints": "Drinks", "Low & No": "Drinks", "Staple Spirits": "Drinks", "Softs & Mixers": "Drinks",
}
KIDS_SECTIONS = {"Mains": "Kids: mains", "Sides": "Kids: sides", "Veg": "Kids: veg", "Fancy Something Sweet?": "Kids: dessert"}
# A section that is only served in Scotland (printed on the no-gluten menu): regional, so not published.
SCOTLAND_ONLY_SECTIONS = {"Scottish Breakfast"}
# Not suggested as an order: parts of a dish, sauces and toppings, desserts, drinks, starters to share and children's portions.
UNRANKABLE = {"Pizza extras", "Burger extras", "Dips", "Options & add-ons", "Drinks", "Desserts", "Sharers", "Nibbles",
              "Breakfast extras", "Kids: mains", "Kids: sides", "Kids: veg", "Kids: dessert"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
# Names are the final published names (after tenkites_b.unique_names). All six: the energy the page prints in kcal contradicts its
# own kJ figure and its own macros (kJ / 4.184 and 4P + 4C + 9F agree with each other, not with the kcal), or the kJ is impossible.
_CAROLINA = "the page prints {k} kcal but {kj} kJ (about {kjk} kcal) and macros worth about {m} kcal: its own figures contradict each other"
HOLDBACK: dict[str, str] = {
    "Carolina Reaper Hot (VG) (with Small Plate Classic Chicken Wings +3 more)": _CAROLINA.format(k=32, kj=67, kjk=16, m=14),
    "Carolina Reaper Hot (VG) (with 1KG Classic Chicken Wings +2 more)": _CAROLINA.format(k=57, kj=176, kjk=42, m=38),
    "Carolina Reaper Hot": _CAROLINA.format(k=27, kj=49, kjk=12, m=11),
    "Red chillies and Inferno hot sauce (VG)": _CAROLINA.format(k=66, kj=148, kjk=35, m=32),
    "Red Chillies (VG)": _CAROLINA.format(k=34, kj=13, kjk=3, m=2),
    "Crodino Italian Spritz 0%": "the page prints 1,330 kJ for 41 kcal (41 kcal would be about 172 kJ): its own figures contradict each other",
}
# Notes for rows the check report flags or that look odd: entered as printed, explained here
NOTES: dict[str, str] = {}

# Each dish's info box prints "Contains:" / "Dish ingredients may also contain:" (naming the cereals and nuts) and the dish carries
# label ids; tenkites_b.allergens_from_rec checks they agree.
ALLERGEN_TITLE = ("Social Pub & Kitchen allergen & nutritional data (tkmenus.com/socialpubkitchen, April 2026 menus, "
                  "data correct as of 8 October 2026)")
ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # as printed on these pages

NOTE = ("Not every pub serves every menu or dish; Scottish pubs have their own breakfast and brunch dishes (not included). A dish with "
        "different figures on two menus appears once per menu, named after it. Values are per dish as served; dishes marked "
        "'Excluding ...' leave out the part named (see Options & add-ons). Most alcoholic drinks have no published figures.")
assert len(NOTE) < 400

EXPECTED_ROWS = 595  # dish records on the eight published menus (main 151, lunch 53, vegan 49, no-gluten 53, kids 17, breakfast 27, bottomless 76, drinks 169)


def fix_records(recs: list[dict]) -> list[dict]:
    """The page marks a few 'choose your ...' dishes (Spiced Frillie Fries) as options without a core block around them. Their
    data-search-name lists the dish first and then its choices (separated by ';*;'): the first row is the dish, the others are
    its choices. Nothing is changed except which row counts as the dish and which as its choices."""
    for r in recs:
        search = r["check"]["search"]
        if r["kind"] == "option" and not r["group"] and ";*;" in search:
            first = search.split(";*;")[0]
            if first.startswith(re.sub(r"\s+", "", r["name"]).lower()):
                r["kind"] = "item"
            else:
                core = next((x for x in recs if x["kind"] == "item" and x["check"]["search"] == search), None)
                if core is None:
                    raise SystemExit(f"choice {r['name']!r} has no dish before it: the page changed")
                r["group"] = core["name"]
    return recs


_read_menu = tk.read_menu


def read_menu_fixed(path):
    layout, recs = _read_menu(path)
    return layout, fix_records(recs)


tk.read_menu = read_menu_fixed  # tenkites_b.collect_rows reads the pages through this name


def is_option(rec: dict) -> bool:
    """A choice offered with a core dish (not a stand-alone dish that the page happens to mark as an option)."""
    return rec["kind"] == "option" and bool(rec["group"])


def base_of(group: str) -> str:
    return re.sub(r"\s*\((excluding|see below)[^)]*\)", "", group, flags=re.I).strip()


def category(label: str, rec: dict, name: str) -> str:
    top = rec["course"][0]
    if label == "kids":
        if top not in KIDS_SECTIONS:
            raise SystemExit(f"unmapped kids section {rec['course']!r}: add it to KIDS_SECTIONS after checking the page")
        return KIDS_SECTIONS[top]
    if label == "drinks" and top != "Bar Snack":
        return "Drinks"
    if top not in SECTIONS:
        raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to SECTIONS after checking the page")
    if is_option(rec):
        return "Options & add-ons"
    return SECTIONS[top]


def veg_marked(rec: dict) -> bool:
    """The chain marks vegetarian and vegan dishes with (V) or (VG) in the name. '(V-M)' / '(VG-M)' are not explained on the
    page, so they are not treated as a vegetarian claim."""
    return bool(re.search(r"\((V|VG)\)", rec["name"]))


def diet_text(rec: dict) -> str:
    """Name and description used to find pork / beef (tenkites_b.diet_tags). The Veggie and Vegan Breakfast read 'Plant-based
    sausages and bacon': the page itself says the bacon is plant-based, so that phrase is not a meat claim."""
    return re.sub(r"plant-based sausages and bacon", "", " ".join([rec["name"], rec.get("ingredients") or rec["desc"]]), flags=re.I)


def twin_key(rec: dict) -> tuple:
    return (rec["course"][0], tk.norm_name(rec["name"]), tk.norm_name(rec["group"]))


def compare_scottish(paths: dict[str, Path], report: list[str]) -> dict[str, set]:
    """Compare each regular menu with its Scottish twin. Returns {regular label: keys whose figures or allergens differ}."""
    conflicts: dict[str, set] = {}
    for regular, scottish in TWINS.items():
        a = {twin_key(r): r for r in tk.read_menu(paths[regular])[1]}
        b = {twin_key(r): r for r in tk.read_menu(paths[scottish])[1]}
        conflicts[regular] = set()
        for k, ra in a.items():
            rb = b.get(k)
            if rb is None:
                report.append(f"on the {regular} menu only (not on its Scottish twin), published: {ra['name']}")
                continue
            aa = tk.allergens_from_rec(ra, f"{regular} {ra['name']}", ALLERGEN_WORDS)
            ab = tk.allergens_from_rec(rb, f"{scottish} {rb['name']}", ALLERGEN_WORDS)
            if ra["nutrients"] != rb["nutrients"] or tk._allergen_key(aa) != tk._allergen_key(ab):
                conflicts[regular].add(k)
                report.append(f"DIFFERS between {regular} and {scottish}, not published: {ra['name']}")
        for k, rb in b.items():
            if k not in a:
                report.append(f"Scotland only, not published ({scottish}): {rb['name']}")
    return conflicts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "social-pub-and-kitchen-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    guids = {m[0]: m[1] for m in MENUS}
    guids.update(dict(SCOTTISH))
    paths = tk.fetch_pages(BASE_URL, guids, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    # the kcal printed beside each dish's name must equal the kcal in its table (a built-in check on the reader)
    for label in list(guids):
        for rec in tk.read_menu(paths[label])[1]:
            head = re.sub(r"[^0-9]", "", rec["check"]["header_energy"])
            table = rec["nutrients"].get("Energy (kcal)", "-")
            if table not in ("-", "") and head != tk.number(table):
                raise SystemExit(f"{label}: {rec['name']!r} header says {rec['check']['header_energy']!r}, table says {table!r}")
    for label in guids:
        for rec in tk.read_menu(paths[label])[1]:
            if rec["kind"] == "option" and not rec["group"]:
                raise SystemExit(f"{label}: choice {rec['name']!r} still has no dish: the page changed")

    scot_report: list[str] = []
    conflicts = compare_scottish(paths, scot_report)

    def skip(label: str, rec: dict):
        if rec["course"][0] in SCOTLAND_ONLY_SECTIONS:
            return "Scotland-only section"
        if twin_key(rec) in conflicts.get(label, ()):
            return "figures differ from the Scottish menu"
        return None

    rows, excluded, skipped, total = tk.collect_rows(
        labels, paths, "items", lambda label, rec: rec["name"], category, skip_fn=skip, veg_fn=veg_marked,
        where_fn=lambda label, rec: f"with {base_of(rec['group'])}" if is_option(rec) else rec["course"][-1],
        allergen_fn=lambda label, rec: tk.allergens_from_rec(rec, f"{label} {rec['name']}", ALLERGEN_WORDS), text_fn=diet_text)
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    for r in rows:  # two toppings with the same name in different sections (jalapeños on pizza and on burgers) are told apart by section
        r["prefer_where"] = r["category"] in ("Options & add-ons", "Pizza extras", "Burger extras")
    tk.unique_names(rows, rank, short, long)
    for r in rows:
        if r["name"] in NOTES:
            r["note"] = NOTES[r["name"]]
    items = tk.make_items(rows, long, UNRANKABLE)
    for it in items:
        if re.search(r"\(excluding ", it["name"], re.I):  # the chain prints the dish without a part named in its title
            it["rankable"] = False
            it["notes"] = ("Printed without the part named in its title (see Options & add-ons), so it is not suggested as a meal. "
                           + it["notes"])
        elif it["category"] == "Wings" and not it["name"].startswith("1KG"):
            it["notes"] = ("The page lists the sauce choices separately and does not say whether this figure includes a sauce. "
                           + it["notes"])
        if it["name"].startswith("1KG"):  # a kilo of wings or riblets is a sharing portion
            it["rankable"] = False
    names = [i["name"] for i in items]
    missing = [n for n in list(HOLDBACK) + list(NOTES) if n not in names]
    if missing:
        print(f"HOLDBACK/NOTES names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Social Pub & Kitchen", cuisine="Pub",
        source_title="Social Pub & Kitchen allergen & nutritional data (tkmenus.com/socialpubkitchen: Main Menu April 2026 and the April 2026 "
                     "lunch, vegan, no-gluten containing, kids mini, breakfast, bottomless brunch and drinks menus; data correct as of "
                     "8 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["social pub and kitchen", "social pub & kitchen", "the social pub and kitchen", "social pub kitchen"],
        items=items, out=args.out, holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note=NOTE,
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    for label in guids:
        print(f"{label:20} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat, by menu:", by_menu)
    print("rows skipped:", [(s[0], s[1], s[2]) for s in skipped])
    print("\n".join(scot_report))
    print("\n".join(tk.ALLERGEN_NOTES))
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{len(skipped)} skipped; {total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
