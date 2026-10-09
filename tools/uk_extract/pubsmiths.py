#!/usr/bin/env python3
"""Build data/source/pubsmiths/ from Pubsmiths' official allergen and nutritional data.

    python3 tools/uk_extract/pubsmiths.py --checked-on 2026-10-09 [--pages DIR] [--out DIR]

Source: https://tkmenus.com/pubsmiths (Stonegate's "Allergen & Nutritional Data" for Pubsmiths, one page per menu, chosen with
?mguid=<menu id>). Every Pubsmiths pub page on pubsmiths.co.uk links it from its Menus page ("View Allergens" button, checked on the
Lord Clyde, Southwark page). It is the same Ten Kites platform as Slug & Lettuce, Social Pub & Kitchen and Great Local Pubs, so
tenkites_b.py reads it. Pages are saved once into --pages (default: a temp folder; delete it to refresh) at one request per second;
numbers are copied exactly as printed. Only names, categories and the choice of menus are typed here. The script stops if a page
changes layout, a nutrient column or section appears that is not mapped, or the row count no longer matches EXPECTED_ROWS.

Founder's rule (9 Oct 2026): only dishes with COMPLETE nutrition (calories, protein, carbs and fat) are published, so the chain is a
"full" chain and every row that lacks any of the four (most spirits, wines, soft drinks and the two October seasonal-serves menus,
which print calories only) is left out and counted in the output. Nothing is estimated.

The page says "not all menu items displayed on this website are available at all of our sites" (17 pubs): the figures are the chain's
own for the standard recipe. A dish printed on two menus with different figures is published once per menu, each named after its menu
(tenkites_b.unique_names).

Some dishes are printed as a "core" plus choices: "Fish & Chips (Excluding Your Pea Option, see below)" with a list of choices, each
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

CHAIN_ID = "pubsmiths"
BASE_URL = "https://tkmenus.com/pubsmiths"

# label, menu id, short name, long name (order = which version of a clashing dish keeps the plain name)
MENUS = [
    ("main", "9d6dc3b2-68eb-402f-bfcc-7e69742f2e2d", "main menu", "main menu"),
    ("lunch", "83ab571f-d698-4cee-8321-d6cbf8837322", "lunch menu", "lunch & drink menu"),
    ("nogluten", "4acbc975-2e04-4f99-8314-781624553537", "no-gluten menu", "non gluten containing ingredients menu"),
    ("pizza", "0769dcaa-dccf-424b-acd4-175b7132f578", "pizza menu", "pizza menu"),
    ("dessert", "c95c0873-6215-42fc-8dc5-b939b8c9bafc", "dessert menu", "dessert menu"),
    ("kids", "223cdc1e-c01c-43b8-a7f5-d91788f6c9be", "young guests' menu", "young guests' menu"),
    ("breakfast", "09e797fa-8c71-450c-8ba0-6613b67a1530", "breakfast menu", "breakfast menu"),
    ("sunday", "77ddb758-00d3-4a7c-ac63-1f761092f761", "Sunday menu", "Sunday menu"),
    ("bottomless", "e86a0f2a-1f1a-411d-9a3c-18b8a710046a", "bottomless brunch", "bottomless brunch menu"),
    ("afternoontea", "87fac486-9698-4cdf-91e9-8f0ae48d5a52", "afternoon tea", "afternoon tea menu"),
    ("drinks", "3772d2fe-cec4-42ca-a43a-523175ea8558", "drinks menu", "main drinks menu"),
]
# Left out on purpose: the Christmas set, Christmas Day, festive kids', buffet, canapes & bowl food and festive afternoon tea menus
# (seasonal), Matchday Food & Drink (event menu), Seasonal Serves and The Autumn Collection (October 2026 drinks that print calories
# only), Summer Serves and Spring Spritz (past seasonal drinks), Set, Day Delegate, Buffet, Canapes & Bowl Food and Wake menus (group
# catering), Metropolitan Pizza, BBQ, Tattershall Castle, Corn Exchange, MIXR and Travel menus (one venue or another brand), and every
# January 2025 to February 2025 and November 2024 menu (superseded guides).

SECTIONS = {
    "Small Plates": "Small plates", "Sharers": "Sharers", "Burger": "Burgers", "Burger Add-Ons": "Burger add-ons", "Classics": "Classics",
    "Lunch": "Lunch", "Salads": "Salads", "Sides": "Sides", "Sandwitches": "Sandwiches", "Sandwitchs": "Sandwiches",
    "Sandwich Selection": "Afternoon tea", "Flatbreads": "Flatbreads", "Brunch": "Brunch", "Scones": "Afternoon tea",
    "Breakfast Menu": "Breakfast", "Extras": "Breakfast extras", "Hot Drinks": "Drinks",
    "Desserts": "Desserts", "Add Ice Cream": "Dessert extras", "Pizzas": "Pizza", "Salad": "Salads", "Main": "Classics",
    "Sunday Roasts": "Sunday roast",
    # the drinks sections printed on the bottomless brunch and lunch menus
    "Drinks": "Drinks", "Spritz": "Drinks", "Signature Serves": "Drinks", "Sparkling": "Drinks", "Draught": "Drinks",
    "Signature Softs": "Drinks", "0% Cocktails": "Drinks",
}
KIDS_SECTIONS = {
    "Super Starter": "Kids: mains", "Step 1: Pick Your Main - Little Monsters": "Kids: mains", "Step 1 : Pick Your Main - Big Scares": "Kids: mains",
    "Step 2 : Pick Your Veg": "Kids: sides", "Step 3: Pick Your Side": "Kids: sides", "Dreamy Desserts": "Kids: dessert",
    "Breakfast": "Kids: breakfast",
}
# Not suggested as an order: parts of a dish, sauces and toppings, desserts, drinks, shared platters, children's portions.
UNRANKABLE = {"Burger add-ons", "Dessert extras", "Options & add-ons", "Drinks", "Desserts", "Sharers", "Breakfast extras", "Afternoon tea",
              "Kids: mains", "Kids: sides", "Kids: dessert", "Kids: breakfast"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
# Names are the final published names (after tenkites_b.unique_names).
_KJ = ("the page prints {k} kcal but {kj:,} kJ (about {kjk} kcal){more}: its own figures contradict each other. Restore by deleting this "
       "line once the chain corrects the page.")
_SUGAR = ("the page prints {s} g of sugars but only {c} g of carbohydrate: sugars cannot exceed carbohydrate, so its own figures "
          "contradict each other. Restore by deleting this line once the chain corrects the page.")
_NOGLUTEN = ("Allergen row contradicts the dish name: {why}, but the guide marks {marks}. Restore by deleting this line once the chain "
             "confirms the allergens.")
HOLDBACK: dict[str, str] = {
    # accuracy check 2026-10-09: kJ and kcal that cannot both be right (kJ / 4.184 is far from the kcal printed beside it)
    "Crodino Italian Spritz 0% - 175ml": _KJ.format(k=30, kj=1285, kjk=307, more=""),
    "Hartridges Apple & Mango - 275ml": _KJ.format(k=52, kj=2332, kjk=557, more=""),
    "Italian Spritz 0%": _KJ.format(k=51, kj=1376, kjk=329, more=""),
    "Yorkshire Wagyu Burger": _KJ.format(k=1421, kj=4720, kjk=1128, more=" while its protein, carbs and fat add up to about 1,405 kcal"),
    # sugars greater than carbohydrate
    "Peach Fizz 0%": _SUGAR.format(s="24.9", c="23.2"),
    "Peach Lemonade 0%": _SUGAR.format(s="28.0", c="26.3"),
    # dishes whose allergen row contradicts the dish's own name (breaded fish, stuffing, a brownie with no corroboration)
    "Baked Fish Fingers": _NOGLUTEN.format(why="baked fish fingers are breaded and carry 20.5 g of carbohydrate", marks="only fish (no gluten)"),
    "Pork Stuffing": _NOGLUTEN.format(why="a stuffing, with 11.4 g of carbohydrate", marks="no allergen at all, not even gluten"),
    "Chocolate Brownie (VG) (afternoon tea)": _NOGLUTEN.format(
        why="a brownie with 33.6 g of carbohydrate (the other brownie, on the chain's no-gluten menu, is a different row)",
        marks="no allergen as contained"),
    # 24.4 g of salt in one dish is four times the day's limit and above the 15 g line used for every chain (Social Pub & Kitchen)
    "1KG Corn Ribs (VG)": "the page prints 24.4 g of salt for this dish (four times the day's limit), too high to publish as read; the "
                          "regular Corn Ribs print 10.4 g. Restore by deleting this line once the chain confirms the figure.",
}
# Notes for rows the check report flags or that look odd: entered as printed, explained here
_CRUMBLE = "The page prints exactly the same figures for its three crumbles (mixed fruit, rhubarb & ginger, salted caramel apple). Entered as printed."
NOTES: dict[str, str] = {
    "Mixed Fruit Crumble (V)": _CRUMBLE, "Rhubarb & Ginger Crumble (V)": _CRUMBLE, "Salted Caramel Apple Crumble (V)": _CRUMBLE,
}

# Each dish's info box prints "Contains:" / "Dish ingredients may also contain:" (naming the cereals and nuts) and the dish carries
# label ids; tenkites_b.allergens_from_rec checks they agree.
ALLERGEN_TITLE = ("Pubsmiths allergen & nutritional data (tkmenus.com/pubsmiths, June 2026 menus, "
                  "data correct as of 9 October 2026)")
ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # as printed on these pages

NOTE = ("Not every pub serves every menu or dish. A dish with different figures on two menus appears once per menu, named after it. "
        "Values are per dish as served; dishes marked 'Excluding ...' leave out the part named (see Options & add-ons). Drinks that "
        "print no protein, carbs and fat are not listed.")
assert len(NOTE) < 400

def fix_records(recs: list[dict]) -> list[dict]:
    """The page marks a few 'choose your ...' dishes (the Sunday roasts with a seasonal veg choice) as options without a core block
    around them. Their data-search-name lists the dish first and then its choices (separated by ';*;'): the first row is the dish, the
    others are its choices. Nothing is changed except which row counts as the dish and which as its choices."""
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

EXPECTED_ROWS = 564  # dish records on the eleven published menus (main 96, lunch 37, no-gluten 24, pizza 9, dessert 30, young guests 32, breakfast 43, Sunday 87, bottomless brunch 58, afternoon tea 8, drinks 140)


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
    if label == "drinks":
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "pubsmiths-pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    guids = {m[0]: m[1] for m in MENUS}
    paths = tk.fetch_pages(BASE_URL, guids, args.pages)
    labels = [m[0] for m in MENUS]
    rank = {m[0]: i for i, m in enumerate(MENUS)}
    short = {m[0]: m[2] for m in MENUS}
    long = {m[0]: m[3] for m in MENUS}

    # the kcal printed beside each dish's name must equal the kcal in its table (a built-in check on the reader)
    for label in labels:
        for rec in tk.read_menu(paths[label])[1]:
            head = re.sub(r"[^0-9]", "", rec["check"]["header_energy"])
            table = rec["nutrients"].get("Energy (kcal)", "-")
            if table not in ("-", "") and head != tk.number(table):
                raise SystemExit(f"{label}: {rec['name']!r} header says {rec['check']['header_energy']!r}, table says {table!r}")
            if rec["kind"] == "option" and not rec["group"]:
                raise SystemExit(f"{label}: choice {rec['name']!r} has no dish: the page changed")

    rows, excluded, skipped, total = tk.collect_rows(
        labels, paths, "items", lambda label, rec: rec["name"], category, veg_fn=veg_marked,
        where_fn=lambda label, rec: f"with {base_of(rec['group'])}" if is_option(rec) else rec["course"][-1],
        allergen_fn=lambda label, rec: tk.allergens_from_rec(rec, f"{label} {rec['name']}", ALLERGEN_WORDS))
    if total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    for r in rows:
        r["prefer_where"] = r["category"] in ("Options & add-ons", "Burger add-ons", "Dessert extras")
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
    names = [i["name"] for i in items]
    missing = [n for n in list(HOLDBACK) + list(NOTES) if n not in names]
    if missing:
        print(f"HOLDBACK/NOTES names no longer on the menu (the pages changed): {missing}", file=sys.stderr)
        return 1
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Pubsmiths", cuisine="Pub",
        source_title="Pubsmiths allergen & nutritional data (tkmenus.com/pubsmiths: Main Menu June 2026 and the June 2026 lunch & drink, "
                     "no-gluten containing, pizza, dessert, young guests', breakfast, Sunday, bottomless brunch, afternoon tea and main "
                     "drinks menus; data correct as of 9 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["pubsmiths", "pubsmith", "the pubsmith", "pub smiths"],
        items=items, out=args.out, holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note=NOTE,
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    for label in guids:
        print(f"{label:20} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    print("rows without calories/protein/carbs/fat (left out), by menu:", by_menu)
    print("rows skipped:", [(s[0], s[1], s[2]) for s in skipped])
    print("\n".join(tk.ALLERGEN_NOTES))
    print(f"wrote {len(items)} items to {folder}; {len(excluded)} rows without the four required numbers; "
          f"{len(skipped)} skipped; {total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
