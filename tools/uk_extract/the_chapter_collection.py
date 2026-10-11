#!/usr/bin/env python3
"""Build data/source/the-chapter-collection/ from The Chapter Collection's official allergen and nutritional data.

    python3 -I tools/uk_extract/the_chapter_collection.py --checked-on 2026-10-11 [--pages DIR] [--out DIR]

Source: https://tkmenus.com/thechaptercollection (Stonegate's "Allergen & Nutritional Data" for The Chapter Collection, one page per
menu, chosen with ?mguid=<menu id>). The chain's own menus page (https://www.thechaptercollection.co.uk/menus, "View Allergens")
links it. The Chapter Collection is Stonegate's premium-pub brand: six London pubs on its own sites page on 2026-10-11 (Blue Anchor
Hammersmith, Bonds Mayfair, Rocket Canary Wharf, The Duchess of Duke Street, Marquis of Westminster, Lillie Langtry), one brand-wide
menu set for all of them. It is the same Ten Kites platform as Pubsmiths, Great Local Pubs and Slug & Lettuce, so tenkites_b.py reads it.
robots.txt of tkmenus.com disallows only /fonts/, /views/ and /*.less$ (images.tenkites.com, disallowed in full, is never fetched).
Pages are saved once into --pages at one request per second; numbers are copied exactly as printed. Only names, categories and the
choice of menus are typed here. The script stops if a page changes layout, a section appears that is not mapped, or the row count no
longer matches EXPECTED_ROWS.

Full chain (calories, protein, carbs and fat for every published dish; the founder's 3-site minimum for full-nutrition chains is met).

Left out on purpose (counted in the run's output):
- every alcoholic drink (founder, 11 Oct 2026: "You don't need to add alcohol drinks"): the cocktail, wine, champagne, spirit, shot,
  beer and cider sections and the dessert menu's fortified wine are skipped by section, whatever they print (on these pages they print
  "-" for every figure anyway). The 0% / 0.0% drinks in "Low/No Alcohol" and "0% Cocktails" are alcohol-free and stay;
- every "Hot Drinks" row: the page prints the coffee or tea alone (a latte is 1 kcal) and each milk as a separate choice, so a row cannot
  describe the drink as served (same decision as Fuller's);
- the Festive, Christmas Day and Boxing Day menus (seasonal), the Set Menu and Meeting Package Menu (group catering), the Bites & Buns
  menu and the no-gluten menu's "Bites & Buns" section (sharing platters for groups: Chicken Wings 3,341 kcal, Beef Sliders 3,152 kcal,
  no portion count given), every June 2026 menu (superseded by September
  2026) and MIXR Bakewell Specials (one venue of another brand).

Some dishes are printed as a "core" plus choices: "Ribeye Steak (Excluding Your Potato & Sauce Option, See Below)" with a list of
potatoes and sauces, each with its own numbers. The core is published as the chain prints it (its name keeps the "Excluding" wording,
and it is never suggested as a meal on its own) and each choice is its own item under "Options & add-ons", so a person can add them up;
nothing is summed here. A dish printed on two menus with different figures is published once per menu, each named after its menu
(tenkites_b.unique_names).

Independent check: data/audit/verified/the-chapter-collection.json.
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

CHAIN_ID = "the-chapter-collection"
BASE_URL = "https://tkmenus.com/thechaptercollection"
MENUS_PAGE = "https://www.thechaptercollection.co.uk/menus"

# label, menu id, short name, long name (order = which version of a clashing dish keeps the plain name)
MENUS = [
    ("main", "cf066fac-d52c-4241-b70c-ed4be67c9f1f", "main menu", "main menu"),
    ("barsnacks", "29a606a5-3433-4f76-8ca5-e76485b5fffc", "bar snacks", "bar snacks menu"),
    ("steak", "3eb6e1c3-2741-4fc3-a7de-d148428497fd", "steak menu", "steak menu"),
    ("lunch", "b7f6ba44-6a11-4ffa-95ad-282cb324ad64", "lunch menu", "lunch menu"),
    ("sunday", "ce38b246-b628-460d-9ec6-1e8f49311b10", "Sunday menu", "Sunday menu"),
    ("brunch", "57e4e2e2-0f52-4389-83a3-3650dcc69958", "brunch menu", "brunch menu"),
    ("dessert", "b1b076b4-7b2f-4a67-a218-8e01f5281ce7", "dessert menu", "dessert menu"),
    ("nogluten", "b836d327-b251-4a98-8c39-96170f90035a", "no-gluten menu", "non gluten containing ingredients menu"),
    ("kids", "d1d20403-4f49-4602-94f4-b52a2f72fd4e", "kids' menu", "kids' menu"),
    ("kidssunday", "bfaaa142-7614-41aa-948d-26cd39f1d58b", "kids' Sunday menu", "kids' Sunday menu"),
    ("drinks", "d29d2a5e-400c-46fc-aafa-2caf266946e2", "drinks menu", "drinks menu"),
]

# Alcoholic sections: skipped whatever they print (founder, 11 Oct 2026).
ALCOHOL_SECTIONS = {
    "Signature Sharer", "Signature Cocktails", "Classic Cocktails", "Spritz Cocktails", "Perfect Serve", "Champagne & Sparkling Wine",
    "White Wine", "Rose Wine", "Red Wine", "Dessert & Fortified Wine", "Spirits - Vodka", "Spirits - Gin", "Spirits - Tequila",
    "Spirits - Whiskey", "Spirits - Rum", "Shots & Bombs", "Spirits - Cognac", "Draught Beer & Cider", "Bottled Beer & Cider",
}
# An alcohol-free row printed inside an alcoholic section (the 0% cocktails are printed again under "0% Cocktails"): kept only if it
# says 0% / 0.0% in its own name.
ALCOHOL_FREE = re.compile(r"\b0(?:\.0)?%")
HOT_DRINKS = {"Hot Drinks"}

SECTIONS = {
    "Bar Snacks": "Small plates", "To Start": "Starters", "The Middle": "Mains", "Side Notes": "Sides", "Side Note": "Sides",
    "Steaks": "Steaks", "Non Gluten Containing Ingredients Steaks": "Steaks", "Lunch": "Lunch", "Sunday Roasts": "Sunday roast",
    "Sundays": "Sunday roast", "Brunch Menu": "Brunch", "Desserts": "Desserts", "Ice Cream & Sorbet Selection": "Desserts",
    "Harry Specters Chocolates": "Desserts", "Starters": "Starters", "Mains": "Mains",
    "Low/No Alcohol": "Drinks", "0% Cocktails": "Drinks", "Soft Drinks": "Drinks",
}
KIDS_SECTIONS = {
    "Starters": "Kids: mains", "Mains": "Kids: mains", "Mini Roast Dinner": "Kids: Sunday roast", "Desserts": "Kids: dessert",
    "Desserts - Ice Cream & Sorbets": "Kids: dessert",
}
# Not suggested as an order: parts of a dish, sauces and toppings, desserts, drinks, shared platters, children's portions.
UNRANKABLE = {"Options & add-ons", "Drinks", "Desserts", "Small plates", "Kids: mains", "Kids: dessert", "Kids: Sunday roast"}

# Rows the menu itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
# Names are the final published names (after tenkites_b.unique_names). From the accuracy check of 2026-10-11.
_BOTH = ("the page prints {k} kcal, but its own {kj:,} kJ (about {kjk} kcal) and its protein, carbs and fat (about {m} kcal) agree with "
         "each other and not with the kcal: its own figures contradict each other. Restore by deleting this line once the chain corrects "
         "the page.")
_KJ = ("the page prints {k} kcal but {kj:,} kJ (about {kjk} kcal): its own figures contradict each other. Restore by deleting this line "
       "once the chain corrects the page.")
_NAME = ("Allergen row contradicts the dish: {why}. Restore by deleting this line once the chain confirms the allergens.")
HOLDBACK: dict[str, str] = {
    "Chicken Wings": "the page prints 759 kcal, but 1,836 kJ (about 439 kcal) and protein, carbs and fat worth about 493 kcal: its own "
                     "figures contradict each other. Restore by deleting this line once the chain corrects the page.",
    "N'duja & Pork Sausage Roll": _BOTH.format(k=781, kj=2729, kjk=652, m=679),
    "Ultimate Cheese Toastie (V)": _BOTH.format(k=1683, kj=5939, kjk=1419, m=1478),
    "Spicy Coated Chicken Burger": _BOTH.format(k=1348, kj=4847, kjk=1158, m=1188),
    "Crodino Spritz 0%": _KJ.format(k=31, kj=1289, kjk=308),
    "Hartridges Apple & Mango - 275ml": _KJ.format(k=52, kj=2332, kjk=557),
    "Mini Fish & Chips": _NAME.format(why="fish and chips marked with fish only and no gluten, and it is not on the chain's no-gluten "
                                          "menu (the adult Beer-Battered Fish & Chips is marked with gluten)"),
    "Chickpea Hummus (VG)": _NAME.format(why="a hummus marked with celery only and no sesame (the chain's other houmous is marked with "
                                             "sesame)"),
    "Chocolate Brownie (VG-M)": _NAME.format(why="a brownie with 41.6 g of carbohydrate marked with soya only and no gluten, and it is "
                                                 "not on the chain's no-gluten menu"),
}
NOTES: dict[str, str] = {
    "Beef Brisket & Oyster Mushroom Pie": "Oyster mushrooms are a mushroom, not a mollusc: the page marks no molluscs. Entered as printed.",
    "Chocolate Brownie (V)": "No gluten marked; this brownie is also on the chain's non gluten containing ingredients menu. Entered as printed.",
}

ALLERGEN_TITLE = ("The Chapter Collection allergen & nutritional data (tkmenus.com/thechaptercollection, September 2026 menus, "
                  "read 11 October 2026)")
ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}  # as printed on these pages

NOTE = ("One menu set for the six Chapter Collection pubs (London); not every pub serves every menu. A dish with different figures on two "
        "menus appears once per menu, named after it. Values are per dish as served; dishes marked 'Excluding ...' leave out the part "
        "named (see Options & add-ons). Alcoholic drinks and hot drinks are not listed.")
assert len(NOTE) < 400


def fix_records(recs: list[dict]) -> list[dict]:
    """The page marks a few 'choose your ...' dishes as options without a core block around them (the crumble with its custard, the
    flat white with its milks). Their data-search-name lists the dish first and then its choices (separated by ';*;'): the first row is
    the dish, the others are its choices. Nothing is changed except which row counts as the dish and which as its choices. Same fix as
    pubsmiths.py and great_local_pubs.py."""
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

EXPECTED_ROWS = 846  # dish records on the eleven menus read (main 58, bar snacks 9, steak 79, lunch 6, Sunday 117, brunch 6, dessert 89, no-gluten 128, kids 22, kids Sunday 70, drinks 262)


def is_option(rec: dict) -> bool:
    """A choice offered with a core dish (not a stand-alone dish that the page happens to mark as an option)."""
    return rec["kind"] == "option" and bool(rec["group"])


def base_of(group: str) -> str:
    return re.sub(r"\s*\((excluding|see below)[^)]*\)", "", group, flags=re.I).strip()


def skip(label: str, rec: dict) -> str | None:
    top = rec["course"][0] if rec["course"] else ""
    if top in ALCOHOL_SECTIONS and not ALCOHOL_FREE.search(rec["name"]):
        return "alcoholic drink (not listed: founder's rule of 11 Oct 2026)"
    if top in HOT_DRINKS:
        return "hot drink: printed without its milk, which is a separate choice"
    if top == "Bites & Buns":
        return "sharing platter for groups (the Bites & Buns platters print no number of portions)"
    return None


def category(label: str, rec: dict, name: str) -> str:
    top = rec["course"][0]
    if label in ("kids", "kidssunday"):
        if top not in KIDS_SECTIONS:
            raise SystemExit(f"unmapped kids section {rec['course']!r}: add it to KIDS_SECTIONS after checking the page")
        return KIDS_SECTIONS[top]
    if top in ALCOHOL_SECTIONS:   # an alcohol-free twin printed among the cocktails
        return "Drinks"
    if top not in SECTIONS:
        raise SystemExit(f"unmapped section {rec['course']!r} on menu {label!r}: add it to SECTIONS after checking the page")
    if is_option(rec):
        return "Options & add-ons"
    return SECTIONS[top]


def tag_text(rec: dict) -> str:
    """The words the pork/beef tags are read from (name and printed description). 'Lamb Pave Steak' is lamb: the word 'steak' in it
    must not make it a beef dish, so only that phrase is shortened before the tag patterns run (nothing shown changes)."""
    text = " ".join([rec["name"], rec.get("ingredients") or rec["desc"]])
    return re.sub(r"\blamb\s+pave\s+steak\b", "lamb pave", text, flags=re.I)


def veg_marked(rec: dict) -> bool:
    """The chain marks vegetarian and vegan dishes with (V) or (VG) in the name. '(VG-M)' is not explained on the page, so it is not
    treated as a vegetarian claim (same reading as Pubsmiths and Great Local Pubs)."""
    return bool(re.search(r"\((V|VG)\)", rec["name"]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "the-chapter-collection-pages")
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
        title = tk.page_title(paths[label])
        if "September 2026" not in title:
            raise SystemExit(f"{label}: page title {title!r} is not a September 2026 menu: the menu list changed")
        for rec in tk.read_menu(paths[label])[1]:
            head = re.sub(r"[^0-9]", "", rec["check"]["header_energy"])
            table = rec["nutrients"].get("Energy (kcal)", "-")
            if table not in ("-", "") and head != tk.number(table):
                raise SystemExit(f"{label}: {rec['name']!r} header says {rec['check']['header_energy']!r}, table says {table!r}")
            if rec["kind"] == "option" and not rec["group"]:
                raise SystemExit(f"{label}: choice {rec['name']!r} has no dish: the page changed")

    rows, excluded, skipped, total = tk.collect_rows(
        labels, paths, "items", lambda label, rec: rec["name"], category, skip_fn=skip, veg_fn=veg_marked, text_fn=tag_text,
        where_fn=lambda label, rec: f"with {base_of(rec['group'])}" if is_option(rec) else rec["course"][-1],
        allergen_fn=lambda label, rec: tk.allergens_from_rec(rec, f"{label} {rec['name']}", ALLERGEN_WORDS))
    if EXPECTED_ROWS and total != EXPECTED_ROWS:
        print(f"The pages hold {total} rows but this script was written for {EXPECTED_ROWS}: re-check the menu list "
              "and the mappings against the pages, then update EXPECTED_ROWS.", file=sys.stderr)
        return 1
    for r in rows:
        r["prefer_where"] = r["category"] == "Options & add-ons"
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
        chain_id=CHAIN_ID, name="The Chapter Collection", cuisine="Pub",
        source_title="The Chapter Collection allergen & nutritional data (tkmenus.com/thechaptercollection: Main, Bar Snacks, Steak, "
                     "Lunch, Sunday, Brunch, Dessert, Non Gluten Containing Ingredient, Kids, Kids Sunday and Drinks menus, all dated "
                     "September 2026; read 11 October 2026)",
        source_url=BASE_URL, checked_on=args.checked_on,
        aliases=["the chapter collection", "chapter collection", "blue anchor hammersmith", "bonds mayfair", "rocket canary wharf",
                 "the duchess of duke street", "marquis of westminster", "lillie langtry"],
        items=items, out=args.out, holdback=[(slug(tk.fold(n)), why) for n, why in HOLDBACK.items()],
        note=NOTE,
        allergen_guide={"title": ALLERGEN_TITLE, "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    for label in guids:
        print(f"{label:12} sha256 {sha256_file(paths[label])[:16]}  {tk.page_title(paths[label])}")
    by_menu: dict[str, int] = {}
    for label, _, _ in excluded:
        by_menu[label] = by_menu.get(label, 0) + 1
    alcohol = [s for s in skipped if s[2].startswith("alcoholic")]
    hot = [s for s in skipped if s[2].startswith("hot drink")]
    print("rows without calories/protein/carbs/fat (left out), by menu:", by_menu, [e[1] for e in excluded])
    print(f"alcoholic drink rows left out: {len(alcohol)}; hot-drink rows left out: {len(hot)}")
    print("\n".join(tk.ALLERGEN_NOTES))
    print(f"wrote {len(items)} items to {folder}; read {total} rows; {len(excluded)} rows without the four required numbers; "
          f"{len(skipped)} skipped; {total - len(excluded) - len(skipped) - len(items)} duplicate rows dropped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
