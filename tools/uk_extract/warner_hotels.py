#!/usr/bin/env python3
"""Build data/source/warner-hotels/ from Warner Hotels' own menu pages with calories and allergens (hosted by Ten Kites).

    python3 tools/uk_extract/warner_hotels.py --pages DIR --checked-on 2026-10-08 [--fetch]

DIR holds the saved pages named <page>.html (page = the last part of the URL, e.g. alvastonhall02). --fetch downloads the menus index
and the 37 menu pages this script uses, one request per second, into DIR first.

Source: the menus index https://www.warnerhotels.co.uk/discover-warner-breaks/menus links one Ten Kites page per menu per hotel
(https://menus.tenkites.com/warnerhotels/<hotel><nn>): 16 hotels, 55 pages. Each dish has a pop-up with "Dietary Information"
(Suitable for / Contains / May contain) and a "Nutritional information" drawer that is open by default and has a visible chevron
control: "Nutrition (per portion)" with ONE row, "Energy (kCal)". Nothing else is printed (no protein, carbs, fat, kJ or weight), so
this is a CALORIES-ONLY chain (docs/DATA.md). The same figure also sits beside the dish name on the list; the script checks that the
list figure, the pop-up figure and the table agree for every dish (a dish where they differ goes to holdback.csv).

Which menus are published (every hotel has its own menus, so the shared ones are used; nothing from one hotel is published under
another's name):
  Breakfast  "Market Kitchen" (page title "MK Breakfast"): the same 93 dishes at 13 hotels (every hotel except the three Reserve ones).
             The script stops if any of the 13 pages differs from the others in a dish, figure or allergen.
  Lunch      "Lunch Favourites": printed as "Small Plates & Classics" at 8 hotels and "Daytime Classics" at the 4 Comfort hotels (Corton,
             Gunton Hall, Lakeside, Norton Grange). Only the dishes that BOTH printings give with the same description, calories and
             allergens are published (62); dishes on one printing only are left out. Section names are the Small Plates & Classics ones.
  Tea        "Afternoon Tea" (page title "Classic Afternoon Tea Summer"): the same 29 dishes at 12 hotels.
Left out (hotel-specific menus; written down in the report): the three Reserve hotels' menus (Heythrop Park, The Runnymede on Thames,
Thoresby Hall: Market Kitchen, Brasserie32, All-day dining, Afternoon tea, Reserve Coffee), Brasserie32 at Holme Lacy, Nidd Hall and
Studley Castle (each different), The Cheshire Barn (Alvaston Hall only), The Travelling Duke (Heythrop only), The Blue Room (Thoresby
only; different page layout), Boddelwyddan Castle's afternoon tea (a different, non-gluten containing ingredients menu), and the
lunch dishes printed by one lunch printing only.

How names are written: exactly as the page prints them (whitespace tidied, a trailing comma dropped); the portion the chain puts in
brackets ("(per spoon)", "(per each)") stays in the name; where the portion is printed as the description instead ("(per slice)",
"(serves two)") it is copied into `serving`. Where one menu prints the same name twice with
different figures (a sandwich "on malted" / "on white") the description's bread is added in brackets; where a name is printed in two
menus with different figures (the cauliflower sandwich is a lunch sandwich and an afternoon-tea finger sandwich) the afternoon-tea one
gets "afternoon tea" in brackets; the dishes under "Non-Gluten Containing Ingredients Menu. Not Suitable For Coeliacs." say so in their
name and category; the tea "Full English Breakfast" becomes "Full English Breakfast (tea)" so it is not read as a cooked breakfast.
The same dish printed on two menus with the same figure and allergens is published once.

Tags: vegetarian when the page's own "Suitable for" says Vegetarian or Vegan; contains_pork / contains_beef only from the dish name or
description (tenkites_c.meat_tags). Allergens are the page's own Contains / May contain lines, cross-checked against the label ids the
page's allergen filter uses (tenkites_c.allergens_checked); a disagreement stops the run.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import write_chain_folder  # noqa: E402

CHAIN_ID = "warner-hotels"
INDEX_URL = "https://www.warnerhotels.co.uk/discover-warner-breaks/menus"
PAGE_BASE = "https://menus.tenkites.com/warnerhotels/"

# The index as read on 2026-10-08: hotel -> {page number: label the index prints}. The run stops if the index changes.
INDEX = {
    "alvastonhall": {"02": "Market Kitchen", "03": "The Cheshire Barn", "04": "Lunch Favourites", "05": "Afternoon Tea"},
    "bembridge": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "boddelwyddancastle": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "corton": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "cricketstthomas": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "guntonhall": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "heythroppark": {"02": "Market Kitchen", "03": "Brasserie32", "04": "The Travelling Duke", "05": "All-day dining", "06": "Afternoon tea"},
    "holmelacy": {"02": "Market Kitchen", "03": "Brasserie32", "04": "Lunch Favourites", "05": "Afternoon Tea"},
    "lakeside": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "littlecote": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "niddhall": {"02": "Market Kitchen", "03": "Brasserie32", "04": "Lunch Favourites", "05": "Afternoon Tea"},
    "nortongrange": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "sinahwarren": {"02": "Market Kitchen", "03": "Lunch Favourites", "04": "Afternoon Tea"},
    "studleycastle": {"02": "Market Kitchen", "03": "Brasserie32", "05": "Afternoon Tea"},
    "runnymedeonthames": {"02": "Market Kitchen", "03": "Brasserie32", "04": "All-day dining", "05": "Afternoon tea"},
    "thorsebyhall": {"02": "Market Kitchen", "03": "The Blue Room", "04": "All-day dining", "05": "Afternoon tea"},
}
HOTEL_NAMES = {
    "alvastonhall": "Alvaston Hall", "bembridge": "Bembridge Coast", "boddelwyddancastle": "Bodelwyddan Castle", "corton": "Corton",
    "cricketstthomas": "Cricket St. Thomas", "guntonhall": "Gunton Hall", "holmelacy": "Holme Lacy", "lakeside": "Lakeside",
    "littlecote": "Littlecote House", "niddhall": "Nidd Hall", "nortongrange": "Norton Grange", "sinahwarren": "Sinah Warren",
    "studleycastle": "Studley Castle",
}

# The pages used, with the page title each must still have (a different title means a different menu).
BREAKFAST = [f"{h}02" for h in ("alvastonhall", "bembridge", "boddelwyddancastle", "corton", "cricketstthomas", "guntonhall", "holmelacy",
                                 "lakeside", "littlecote", "niddhall", "nortongrange", "sinahwarren", "studleycastle")]
LUNCH_SMALL = ["alvastonhall04", "bembridge03", "boddelwyddancastle03", "cricketstthomas03", "holmelacy04", "littlecote03", "niddhall04",
               "sinahwarren03"]
LUNCH_DAYTIME = ["corton03", "guntonhall03", "lakeside03", "nortongrange03"]
TEA = ["alvastonhall05", "bembridge04", "corton04", "cricketstthomas04", "guntonhall04", "holmelacy05", "lakeside04", "littlecote04",
       "niddhall05", "nortongrange04", "sinahwarren04", "studleycastle05"]
TITLES = {"breakfast": "MK Breakfast", "small": "Small Plates & Classics", "daytime": "Daytime Classics",
          "tea": "Classic Afternoon Tea Summer"}
EXPECTED = {"breakfast": 93, "small": 69, "daytime": 68, "tea": 29}   # dishes per page
SHARED_LUNCH = 62       # dishes both lunch printings give identically
PUBLISHED_PAGES = BREAKFAST + LUNCH_SMALL + LUNCH_DAYTIME + TEA

PER = "Nutrition (per portion)"
ENERGY = "Energy (kCal)"
# printed allergen spellings not in common._A (kept here, per chain): the sulphites label has a space after the slash, and the
# page names two cereals with their grain in brackets.
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None), "kamut (wheat)": ("gluten", "kamut"),
                  "spelt (wheat)": ("gluten", "spelt")}
# Two labels in the page's allergen filter that are not allergens ("Gluten Free ..." options); no published dish carries them
# (checked on every run) so they are dropped from the filter before the cross-check.
NOT_ALLERGEN_LABELS = {"1009": "Gluten Free Barley", "1010": "Gluten Free Oats"}

HOT = "Hot drinks"
NG = "Non-Gluten Containing Ingredients Menu. Not Suitable For Coeliacs."
# (menu, printed section) -> category shown. Hot drinks, coffees and teas from all three menus share one category.
CATEGORY = {
    ("breakfast", "To Start"): "Breakfast - To start",
    ("breakfast", "Hot Drinks"): HOT,
    ("breakfast", "Continental Table"): "Breakfast - Continental table",
    ("breakfast", "Full English Breakfast"): "Breakfast - Full English",
    ("breakfast", "Freshly Made - Omelette"): "Breakfast - Omelettes",
    ("breakfast", "Freshly Made - Porridge"): "Breakfast - Porridge and toppings",
    ("breakfast", "Freshly Made - Pancakes"): "Breakfast - Pancakes",
    ("breakfast", "Vegetarian Full Breakfast"): "Breakfast - Vegetarian full breakfast",
    ("breakfast", "Chef's Special"): "Breakfast - Chef's specials",
    ("breakfast", NG): "Breakfast - Non-gluten containing ingredients (not suitable for coeliacs)",
    ("lunch", "Sandwiches, Wraps & Toasties"): "Lunch - Sandwiches, wraps and toasties",
    ("lunch", "Soups & Sides"): "Lunch - Soups and sides",
    ("lunch", "Small Plates"): "Lunch - Small plates",
    ("lunch", "Salads"): "Lunch - Salads",
    ("lunch", "Cakes"): "Lunch - Cakes",
    ("lunch", "Scones"): "Lunch - Scones",
    ("lunch", "Pastries"): "Lunch - Pastries",
    ("lunch", "Hot Drinks"): HOT,
    ("tea", "Sandwich"): "Afternoon tea - Sandwiches",
    ("tea", "Sweet treats"): "Afternoon tea - Sweet treats",
    ("tea", "Smiths teas"): HOT,
}
CATEGORY_ORDER = [
    "Breakfast - To start", "Breakfast - Continental table", "Breakfast - Full English", "Breakfast - Omelettes",
    "Breakfast - Porridge and toppings", "Breakfast - Pancakes", "Breakfast - Vegetarian full breakfast", "Breakfast - Chef's specials",
    "Breakfast - Non-gluten containing ingredients (not suitable for coeliacs)",
    "Lunch - Sandwiches, wraps and toasties", "Lunch - Soups and sides", "Lunch - Small plates", "Lunch - Salads",
    "Lunch - Cakes", "Lunch - Scones", "Lunch - Pastries", "Afternoon tea - Sandwiches", "Afternoon tea - Sweet treats", HOT,
]
MENU_LABEL = {"breakfast": "breakfast", "lunch": "lunch", "tea": "afternoon tea"}
# A name that would be misread (a tea called "Full English Breakfast"): (printed name, start of the printed description) -> shown name.
RENAME = {("Full English Breakfast", "A classic combination"): "Full English Breakfast (tea)"}

SOURCE_TITLE = ("Warner Hotels menus with calories and allergens: Market Kitchen breakfast, Lunch Favourites and Afternoon Tea "
                "(Ten Kites pages linked from warnerhotels.co.uk/discover-warner-breaks/menus; no date shown; read 2026-10-08)")
ALLERGEN_TITLE = ("Warner Hotels menu pages, Dietary Information per dish (Contains / May contain; Ten Kites pages linked from "
                  "warnerhotels.co.uk/discover-warner-breaks/menus; no date shown; read 2026-10-08)")
NOTE = ("Calories only, per portion as each Warner Hotels menu page prints it (many items are per spoon, slice or each). Shows the "
        "Market Kitchen breakfast, Lunch Favourites and Afternoon Tea (Summer) dishes the hotels share; Reserve hotels and single-hotel "
        "menus differ and are not included. Not every hotel serves every dish.")
ALIASES = ["warner hotels", "warner", "warner leisure hotels", "warner breaks"]


def fetch_pages(pages_dir: Path) -> None:
    pages_dir.mkdir(parents=True, exist_ok=True)
    tk.fetch(INDEX_URL, pages_dir / "index.html")
    for slug_ in PUBLISHED_PAGES:
        tk.fetch(PAGE_BASE + slug_, pages_dir / f"{slug_}.html")


def sha(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_index(pages_dir: Path) -> None:
    """The index must still link exactly the 55 pages with the labels above."""
    root = tk.parse_html((pages_dir / "index.html").read_text(encoding="utf-8"))
    found = {}
    for n in root.iter():
        href = n.attrs.get("href", "") if n.tag == "a" else ""
        if href.startswith(PAGE_BASE):
            found[href[len(PAGE_BASE):].rstrip("/")] = n.text()
    expected = {f"{h}{num}": label for h, menus in INDEX.items() for num, label in menus.items()}
    if found != expected:
        new = sorted(set(found) - set(expected))
        gone = sorted(set(expected) - set(found))
        changed = sorted(k for k in set(found) & set(expected) if found[k] != expected[k])
        raise SystemExit(f"The menus index changed. New pages: {new}. Pages gone: {gone}. Relabelled: {changed}. "
                         "Re-read the menus (which hotels share which menu) and update INDEX and the page lists.")
    for slug_ in BREAKFAST:
        assert expected[slug_] == "Market Kitchen", slug_
    for slug_ in LUNCH_SMALL + LUNCH_DAYTIME:
        assert expected[slug_] == "Lunch Favourites", slug_
    for slug_ in TEA:
        assert expected[slug_] == "Afternoon Tea", slug_


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().rstrip(",").strip()


def list_level(text: str) -> list[tuple]:
    """(name, energy text) as printed on the list itself, beside each dish, in the same order read_modal_layout reads the dishes."""
    root = tk.parse_html(text)
    body = root.find("k10-all-courses")
    out = []
    for top in body.iter():
        if top.has("k10-recipe") and top.has("k10-recipe_menu-item") and not top.has("k10-byo") and top.find("k10-recipe-modal") is not None:
            nm, en = top.find("k10-recipe__name"), top.find("k10-recipe__nutrient_energy")
            out.append((nm.text() if nm is not None else None, en.text() if en is not None else None))
    return out


def read_page(pages_dir: Path, slug_: str, kind: str) -> list[dict]:
    text = (pages_dir / f"{slug_}.html").read_text(encoding="utf-8")
    if tk.page_title(text) != TITLES[kind]:
        raise SystemExit(f"{slug_}: page title is {tk.page_title(text)!r}, expected {TITLES[kind]!r}: the menu changed")
    rows = tk.read_modal_layout(text)
    if len(rows) != EXPECTED[kind]:
        raise SystemExit(f"{slug_} has {len(rows)} dishes but this script expects {EXPECTED[kind]}: the menu changed")
    listed = list_level(text)
    if len(listed) != len(rows):
        raise SystemExit(f"{slug_}: {len(listed)} dishes on the list but {len(rows)} pop-ups")
    for r, (lname, lenergy) in zip(rows, listed):
        if r["per"] != PER or set(r["nutrients"]) != {ENERGY}:
            raise SystemExit(f"{slug_}: {r['dish']!r} prints {sorted(r['nutrients'])} under {r['per']!r}; this script knows only "
                             f"{ENERGY!r} under {PER!r}")
        r["name"] = clean(r["dish"])
        r["list_name"], r["list_energy"] = lname, lenergy
        r["filter"] = {i: n for i, n in r["filter"].items() if NOT_ALLERGEN_LABELS.get(i) != n}
        if r["label_ids"] and set(NOT_ALLERGEN_LABELS) & set(r["label_ids"][0]):
            raise SystemExit(f"{slug_}: {r['dish']!r} carries a 'Gluten Free ...' label: check how to read it before publishing")
    return rows


def signature(r: dict) -> tuple:
    """Everything that makes a dish the same dish at another hotel (section excluded: sections are named differently by menu)."""
    return (r["name"], clean(r["desc"]), r["nutrients"][ENERGY], repr(r["contains"]), repr(r["may"]), clean(r["suitable"]))


def identical(pages: dict[str, list[dict]], label: str) -> list[dict]:
    """All pages must carry the same dishes, figures and allergens in the same order: returns the first page's rows."""
    first_slug = next(iter(pages))
    first = [(r["section"],) + signature(r) for r in pages[first_slug]]
    for slug_, rows in pages.items():
        if [(r["section"],) + signature(r) for r in rows] != first:
            raise SystemExit(f"{label}: {slug_} differs from {first_slug} (a dish, figure, allergen or section): the hotels no "
                             "longer share this menu, re-read them before publishing")
    return pages[first_slug]


def bread(desc: str) -> str:
    m = re.search(r"\bon (malted|white|brown)\s*$", clean(desc), re.I)
    return m.group(1).lower() if m else ""


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    menus: dict[str, list[dict]] = {}
    menus["breakfast"] = identical({s: read_page(pages_dir, s, "breakfast") for s in BREAKFAST}, "Breakfast")
    small = identical({s: read_page(pages_dir, s, "small") for s in LUNCH_SMALL}, "Lunch (Small Plates & Classics)")
    daytime = identical({s: read_page(pages_dir, s, "daytime") for s in LUNCH_DAYTIME}, "Lunch (Daytime Classics)")
    menus["tea"] = identical({s: read_page(pages_dir, s, "tea") for s in TEA}, "Afternoon tea")
    # lunch: only the dishes both printings give identically
    in_daytime = {signature(r) for r in daytime}
    in_small = {signature(r) for r in small}
    menus["lunch"] = [r for r in small if signature(r) in in_daytime]
    keys = [(r["name"], clean(r["desc"])) for r in menus["lunch"]]
    if len(set(keys)) != len(keys):
        raise SystemExit("two shared lunch dishes have the same name and description")
    if len(menus["lunch"]) != SHARED_LUNCH:
        raise SystemExit(f"{len(menus['lunch'])} lunch dishes are shared, expected {SHARED_LUNCH}: the menus changed")
    report.append("lunch dishes on Small Plates & Classics only (left out): " + "; ".join(
        f"{r['name']}" + (f" [{clean(r['desc'])}]" if clean(r['desc']).lower().startswith("on ") else "") + f" {r['nutrients'][ENERGY]}"
        for r in small if signature(r) not in in_daytime))
    report.append("lunch dishes on Daytime Classics only (left out): " + "; ".join(
        f"{r['name']}" + (f" [{clean(r['desc'])}]" if clean(r['desc']).lower().startswith("on ") else "") + f" {r['nutrients'][ENERGY]}"
        for r in daytime if signature(r) not in in_small))

    items: list[dict] = []
    holdback: list[tuple[str, str]] = []
    for menu in ("breakfast", "lunch", "tea"):
        rows = menus[menu]
        same_name = {}
        for r in rows:
            same_name.setdefault(r["name"], []).append(r)
        for r in rows:
            where = f"{menu} {r['name']!r}"
            if (menu, r["section"]) not in CATEGORY:
                raise SystemExit(f"{where}: new section {r['section']!r}: add ({menu!r}, section) to CATEGORY")
            name, qualifiers = r["name"], []
            desc = clean(r["desc"])
            for (printed, start), shown in RENAME.items():
                if name == printed and desc.startswith(start):
                    name = shown
            if len(same_name[r["name"]]) > 1:   # the same name printed twice in one menu: the bread tells them apart
                b = bread(r["desc"])
                if not b:
                    raise SystemExit(f"{where}: printed twice in one menu and the description gives no bread: {r['desc']!r}")
                qualifiers.append("on " + b)
            if r["section"] == NG:
                qualifiers.append("non-gluten containing ingredients")
            nums, _missing = tk.numbers(r["nutrients"], where)
            if not nums["calories"]:
                raise SystemExit(f"{where}: no calories")
            listed = re.sub(r"[^\d.]", "", r["list_energy"] or "")
            popup = re.sub(r"[^\d.]", "", r["energy_shown"])
            item_notes = [f"{MENU_LABEL[menu]} menu, section '{r['section']}'"]
            hold = []
            if listed != nums["calories"] or popup != nums["calories"]:
                hold.append(f"the page shows {r['list_energy']!r} beside the dish and {r['energy_shown']!r} in its pop-up but "
                            f"{nums['calories']} kcal in its nutrition table")
            if r["list_name"] is None or clean(r["list_name"]) != r["name"]:
                hold.append(f"the list prints the dish as {r['list_name']!r} but its pop-up as {r['name']!r}")
            vegetarian = bool(re.search(r"vegetarian|vegan", r["suitable"], re.I))
            meat, unspecified = tk.meat_tags(name, desc, vegetarian=vegetarian)
            if unspecified:
                report.append(f"meat type not stated: {name}")
            try:
                allergens = tk.allergens_checked(r, where, ALLERGEN_EXTRA)
            except SystemExit as e:
                report.append(f"allergens not used for the chain: {e}")
                allergens = None
            if desc:
                item_notes.append(f"description: {desc[:120]}")
            # a description that is only a bracketed portion note ("(per slice)", "(serves two)") is the stated serving
            m = re.fullmatch(r"\((per [^()]+|serves [^()]+)\)", desc, re.I)
            serving = m.group(1) if m else ""
            items.append({"name": name, "category": CATEGORY[(menu, r["section"])], "serving": serving, **nums,
                          "tags": "|".join((["vegetarian"] if vegetarian else []) + meat), "rankable": False,
                          "notes": "; ".join(item_notes), "allergens": allergens, "_menu": menu, "_qual": qualifiers, "_hold": hold,
                          "_desc": desc, "_base": name})
    # qualified names
    for it in items:
        if it["_qual"]:
            it["name"] = f"{it['_base']} ({', '.join(it['_qual'])})"
    # exact duplicates across menus (the coffees, teas, milks, syrups and scones appear on more than one menu)
    kept, dropped = tk.dedupe_items(items)
    report.append(f"dropped {len(dropped)} exact duplicates (same name, calories and allergens printed on another menu): {'; '.join(dropped)}")
    conflicts = tk.allergen_conflicts(items)
    if conflicts:
        report.append(f"allergens differ between two printings of: {conflicts}: allergens not published for the chain")
    # a dish name printed in two menus with different figures: the afternoon-tea one says so (anything else stops the run)
    by_base: dict[str, list[dict]] = {}
    for it in kept:
        by_base.setdefault(it["_base"].lower(), []).append(it)
    for group in by_base.values():
        menus_in = {it["_menu"] for it in group}
        if len(menus_in) > 1:
            for it in group:
                if it["_menu"] != "tea":
                    continue
                b = bread(it["_desc"])
                it["_qual"] = ["afternoon tea"] + (["on " + b] if b else [])
                it["name"] = f"{it['_base']} ({', '.join(it['_qual'])})"
                report.append(f"renamed (same dish name, different figure on another menu): {it['name']}")
            if any(it["_menu"] != "tea" for it in group) and len({it["_menu"] for it in group if it["_menu"] != "tea"}) > 1:
                raise SystemExit(f"dish {group[0]['_base']!r} is printed with different figures on two non-tea menus: handle it by hand")
    names = [it["name"].lower() for it in kept]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique: " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    kept.sort(key=lambda it: CATEGORY_ORDER.index(it["category"]))
    from common import slug
    for it in kept:
        it["id"] = slug(it["name"])
        for reason in it["_hold"]:
            holdback.append((it["id"], reason))
            report.append(f"held back {it['name']}: {reason}")
        for k in ("_menu", "_qual", "_hold", "_desc", "_base"):
            it.pop(k)
    return kept, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the index and the 37 menu pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_pages(args.pages)
    check_index(args.pages)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Warner Hotels", cuisine="Hotel restaurant", source_title=SOURCE_TITLE, source_url=INDEX_URL,
        checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
        allergen_guide={"title": ALLERGEN_TITLE, "url": INDEX_URL, "checked_on": args.checked_on, "may_contain_published": True},
        nutrition_level="calories")
    print(f"index.html sha256 {sha(args.pages / 'index.html')}")
    digest = hashlib.sha256()
    for slug_ in PUBLISHED_PAGES:
        h = sha(args.pages / f"{slug_}.html")
        digest.update(f"{slug_} {h}\n".encode())
        print(f"{slug_}.html sha256 {h}")
    print(f"all {len(PUBLISHED_PAGES)} pages (name + sha256 lines) sha256 {digest.hexdigest()}")
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
