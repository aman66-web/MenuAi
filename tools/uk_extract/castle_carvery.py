#!/usr/bin/env python3
"""Build data/source/castle-carvery/ from Castle Carvery's own nutrition and allergen menu pages (hosted by Ten Kites).

    python3 tools/uk_extract/castle_carvery.py --checked-on 2026-10-08 [--cache DIR] [--report]

https://menus.tenkites.com/redcat/castlecarvery is the Ten Kites page for the brand (robots.txt allows /; the page is
"noindex"). Five tabs: SS25 Main Menu, SS25 Light Bites, a desserts menu headed "Caister Castle Carvery", Kid's Menu and
"Wherry Extra Dishes". Each dish has an info pop-over with "Suitable for", "Contains" (the allergens) and a
"Nutrition (per portion)" table (kcal, protein, carb, sugars, fat, sat fat, salt). Numbers are copied as printed;
only names, categories and the rules below are typed by hand.

This page uses a third Ten Kites layout (a pop-over like Cafe Rouge's, but with the modal template's wording and comma-
separated allergens), which tenkites_a.py cannot read, so `parse_page` below reads it into the same record shape and the
rest (tab bar, downloads, name/tag rules, row building) is tenkites_a's. tenkites_a.py is not modified.

Allergens: each dish prints only "Contains: ..." (never "May contain"). The page's own allergen filter data (the label ids
on every dish) is cross-checked against that line. For 16 dishes the filter data classes some of the listed allergens
(peanuts, sesame, celery, soya, eggs...) as "may contain" while the printed line lists them under Contains. The printed line
is what a diner reads and is the stronger statement, so it is used and the dishes are counted in the report. Any other
disagreement (an allergen in the filter data but not in the printed line, or an allergen the filter data does not know) stops
the run.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as t  # noqa: E402
import tenkites_c as dom  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "castle-carvery"
URL = "https://menus.tenkites.com/redcat/castlecarvery"
MAIN = "Castle Carvery SS25 Main Menu 03.25 Final"
LIGHT = "Castle Carvery SS25 Light Bites Final 03.25"
KIDS = "Castle Carvery Kid's Menu"
TABS = {
    MAIN: "use",
    LIGHT: "use",
    "Caister Castle Carvery Deserts Final 01.25": "named for one site (\"Caister\"): single-venue menus are left out until the chain confirms it is chain-wide",
    KIDS: "use",
    "Wherry Extra Dishes 03.25": "named for one site (\"Wherry\"), 'extra dishes' beside the main menu: single-venue menus are left out",
}
EXPECTED = {MAIN: 50, LIGHT: 18, KIDS: 21}

ADDONS = "Add-ons & extras"
CATEGORY_ORDER = ["Starters & sharers", "Salads & pasta", "Traditional favourites", "Gourmet burgers", "Fish dishes", "Grills",
                  "Sides", "Nibbles & sharers", "Wraps, baguettes & cobs", "Jackets", ADDONS,
                  "Kids: Starters", "Kids: Burgers & hot dogs", "Kids: Pasta", "Kids: Fish", "Kids: Traditional favourites",
                  "Kids: Carvery", "Kids: Desserts", "Kids: Smaller plates under 7s"]
# printed section -> (category, rankable). Starters, sharers and nibbles are not a meal on their own; kids' portions are not
# suggested to adults.
MAIN_SECTIONS = {
    "Starters & Sharers": ("Starters & sharers", False), "Salads & Pasta": ("Salads & pasta", True),
    "Traditional Favourites": ("Traditional favourites", True), "Gourmet Burgers": ("Gourmet burgers", True),
    "Fish Dishes": ("Fish dishes", True), "Grills": ("Grills", True), "Sides": ("Sides", True),
    "Upgrade your Burger": (ADDONS, False), "Upgrade Your Steak": (ADDONS, False),
}
LIGHT_SECTIONS = {
    "Nibbles & Sharers": ("Nibbles & sharers", False), "Wraps, baguettes & Cobs": ("Wraps, baguettes & cobs", True),
    "Jackets": ("Jackets", True),
}
KIDS_SECTIONS = {
    "Starters & Sharers": "Kids: Starters", "Burgers & Hotdogs": "Kids: Burgers & hot dogs", "Pasta": "Kids: Pasta",
    "Fish": "Kids: Fish", "Traditional Favourites": "Kids: Traditional favourites", "Kid's Carvery": "Kids: Carvery",
    "Desserts": "Kids: Desserts", "Smaller Plates Under 7s": "Kids: Smaller plates under 7s",
}
EXPECTED_SECTIONS = {MAIN: set(MAIN_SECTIONS), LIGHT: set(LIGHT_SECTIONS), KIDS: set(KIDS_SECTIONS)}

# The page's own spelling of a word that is not in common._A ("Sulphur Dioxide/ Sulphites", with a space after the slash).
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None)}
ALLERGEN_TITLE = ("Castle Carvery allergen information (the \"Contains\" line printed with each dish) on its Ten Kites menu pages: "
                  "SS25 Main Menu 03.25, SS25 Light Bites 03.25 and Kid's Menu (page generated 2026-10-08)")
SOURCE_TITLE = ("Castle Carvery nutrition and allergen menu pages on Ten Kites: SS25 Main Menu 03.25, SS25 Light Bites 03.25 and "
                "Kid's Menu 01.25 (spring/summer 2025 menus; page generated 2026-10-08)")
NOTE = ("From Castle Carvery's SS25 (spring/summer 2025) menu pages: the chain's current menu is unverified. No carvery, "
        "Sunday roast or adult desserts are listed. Weights are approximate uncooked weights; the chain says its figures come "
        "from suppliers and are spot-checked in a laboratory. Allergens list what each dish contains; no per-dish \"may contain\".")

# Rows the page prints impossibly or contradicts itself on (final item name -> reason). Nothing is corrected.
HOLDBACK = {
    "Chocolate Brownie": "Kids' menu row prints 223.5 g of fat for 499 kcal (223.5 g of fat alone would be about 2,000 kcal).",
    "Halloumi Fries": ("Printed 461 kcal, but its own protein, carbohydrate and fat (21.5 g, 28.6 g, 19.0 g) add up to about 371 kcal "
                       "(19% less). The page repeats the same numbers in its structured data, so it is not a display slip."),
    "Fish & Chips": ("Printed 1,658 kcal / 72.3 g protein, but 'Large Fish & Chips' (an extra large fillet) prints fewer: 1,237 kcal / "
                     "43.7 g protein. The two rows contradict each other and the page does not say which is wrong."),
    "Large Fish & Chips": ("Printed 1,237 kcal / 43.7 g protein, fewer than the regular 'Fish & Chips' (1,658 kcal / 72.3 g protein) "
                           "although it has the larger fillet. The page does not say which row is wrong."),
}


# ----------------------------------------------------------------------------------------------------------- parsing

def _label_ids(recipe: "dom.Node") -> tuple:
    def ids(key: str) -> list:
        return [x.strip() for x in recipe.attrs.get(key, "").split(",") if x.strip()]
    return (ids("data-all-labels"), ids("data-no-may-labels"), recipe.attrs.get("data-recipe-id", ""))


def parse_page(page: str, menu_name: str | None = None) -> dict:
    """One saved tab -> {"menu", "menu_desc", "file_name", "records", "names_without_table", "filter_labels"} in tenkites_a's
    record shape. Stops on anything unexpected (a new layout, a missing or extra nutrient row, a new label line)."""
    root = dom.parse_html(page)
    filter_labels = {}
    for n in root.iter():
        if n.attrs.get("data-label-id") and n.attrs.get("data-label-name"):
            name = t._clean(n.attrs["data-label-name"])
            # "Sulphur Dioxide/ Sulphites" -> the spelling common._A knows; this is the filter's label name only
            filter_labels[n.attrs["data-label-id"]] = (name.replace("/ ", "/"), n.attrs.get("data-label-isext") == "True")
    file_name = next((n.attrs["data-file-name"] for n in root.iter() if n.attrs.get("data-file-name")), "")
    all_dishes = [r for r in root.find_all("k10-recipe") if r.has("k10-recipe_menu-item")]
    if len(all_dishes) != len(root.find_all("k10-recipe")):
        raise SystemExit("a dish of another kind (build-your-own, sub-recipe) is on the page: the layout changed")
    records, seen = [], 0
    for course in root.find_all("k10-course"):
        if course.find_all("k10-course") or not course.has("k10-course_level_1"):
            raise SystemExit("nested or unexpected course levels: the layout changed")
        course_name = t._clean(course.find("k10-course__name-text").text())
        for r in course.find_all("k10-recipe"):
            seen += 1
            name = t._clean(r.find("k10-recipe__name").text())
            desc_node = r.find("k10-recipe__desc")
            popover = r.find("k10-popover")
            if not name or popover is None:
                raise SystemExit(f"a dish without a name or info pop-over in {course_name!r}: the layout changed")
            lines = {"Suitable for:": [], "Contains:": [], "May contain:": []}
            texts = {}
            wrapper = popover.find("k10-popover__label-names-wrapper")
            for div in (wrapper.find_all("k10-popover__labels", "div") if wrapper else []):
                head = t._clean(div.find(None, "b").text())
                if head not in lines:
                    raise SystemExit(f"{name!r}: unknown label line {head!r}")
                rest = t._clean(div.text())[len(head):].strip()
                if head in texts:
                    raise SystemExit(f"{name!r}: two {head!r} lines")
                texts[head] = rest
                lines[head] = [p for p in t._split_top(rest, ", ")]
            nutrients = popover.find("k10-popover__nutrients-wrapper")
            caption = t._clean(nutrients.find(None, "b").text())
            if caption != "Nutrition (per portion)":
                raise SystemExit(f"{name!r}: table is labelled {caption!r}, not 'Nutrition (per portion)'")
            nutrition = {}
            for tr in nutrients.find_all(None, "tr"):
                cells = tr.find_all(None, "td")
                if len(cells) != 2:
                    raise SystemExit(f"{name!r}: malformed nutrition row")
                key = t._clean(cells[0].text())
                if key in nutrition:
                    raise SystemExit(f"{name!r}: nutrient {key!r} listed twice")
                nutrition[key] = t._clean(cells[1].text())
            if sorted(nutrition) != sorted(t.NUTRIENT_ROWS):
                raise SystemExit(f"{name!r}: nutrient rows are {list(nutrition)}, expected {list(t.NUTRIENT_ROWS)}")
            records.append({
                "kind": "modal",   # allergens are comma-separated, as in the modal template (tenkites_a._sep)
                "menu": menu_name or "", "course": course_name, "course2": "", "byo": "", "byo_section": "",
                "name": name, "desc": t._clean(desc_node.text()) if desc_node else "",
                "suitable": lines["Suitable for:"], "contains": lines["Contains:"], "may": lines["May contain:"],
                "contains_text": texts.get("Contains:"), "may_text": texts.get("May contain:"),
                "label_ids": _label_ids(r), "nutrition": nutrition, "caption": caption,
            })
    if seen != len(all_dishes):
        raise SystemExit("some dishes sit outside a course: the layout changed")
    return {"menu": menu_name or dom.page_title(page), "menu_desc": "", "file_name": file_name, "records": records,
            "names_without_table": 0, "filter_labels": filter_labels}


def read_tabs(used: list) -> list:
    out = []
    for name, path in used:
        page = parse_page(Path(path).read_text(encoding="utf-8"), name)
        for rec in page["records"]:
            rec["menu"], rec["menu_desc"], rec["filter_labels"] = name, page["menu_desc"], page["filter_labels"]
            out.append(rec)
    return out


# ------------------------------------------------------------------------------------------------------------- names

def cname(raw: str) -> str:
    """The page's own name with internal recipe codes dropped: a leading "CC " (Castle Carvery) and a trailing
    version code such as "01.25( New Chicken)" or "11.24"; ALL CAPS tamed. Nothing else changes (typos stay)."""
    n = t.tidy_name(raw)
    n = re.sub(r"^CC\s+", "", n)
    n = re.sub(r"\s*\d{2}\.\d{2}\s*(\(.*)?$", "", n)
    return n[:1].upper() + n[1:]


def classify(rec: dict):
    menu, sec, raw = rec["menu"], rec["course"], rec["name"]
    nm = cname(raw)
    if nm == "Mixed Grill":
        return ("skip", "two different rows are both named 'Mixed Grill' (2,360 and 3,975 kcal) in the same section, with no size "
                        "to tell them apart: not published (naming them would be a guess)")
    if menu == MAIN:
        cat, rankable = MAIN_SECTIONS[sec]
        if nm.startswith("Chicken Wings"):
            return {"category": cat, "rankable": rankable, "name": nm,
                    "note": "protein looks implausibly low for this weight of wings (the recipe may omit the chicken); printed as is, not corrected"}
        if sec == "Upgrade your Burger" and not nm.lower().startswith("add"):
            nm += " (burger upgrade)"
        if nm == "Add Cup of Soup":
            cat, rankable = ADDONS, False
        return {"category": cat, "rankable": rankable, "name": nm}
    if menu == LIGHT:
        cat, rankable = LIGHT_SECTIONS[sec]
        if sec == "Jackets":
            if nm == "Grated Cheddar":
                return {"category": ADDONS, "rankable": False, "name": "Grated Cheddar (jacket topping)"}
            if nm == "Prawn & Marie Ros":   # the chain's own spelling, kept
                return {"category": cat, "rankable": rankable, "name": nm + " (jacket)", "note": "name printed as 'Prawn & Marie Ros' (sic)"}
            nm += " (jacket)"
        return {"category": cat, "rankable": rankable, "name": nm}
    if menu == KIDS:
        return {"category": KIDS_SECTIONS[sec], "rankable": False, "name": nm}
    raise SystemExit(f"unexpected tab {menu!r}")


# ---------------------------------------------------------------------------------------------------------- allergens

def dish_allergens(rec: dict, sub_where: str) -> dict:
    """{"contains", "may_contain", "cereals", "nuts"} from the printed "Contains:" line, cross-checked against the label
    ids the page's own allergen filter uses for the same dish (see the module docstring for the one accepted pattern: the printed line is the stronger statement)."""
    filt = t._filter_keys(rec, sub_where)
    contains, cereals, nuts, _ = t._printed_allergens(rec.get("contains_text"), ", ", sub_where, ALLERGEN_EXTRA)
    may, _, _, _ = t._printed_allergens(rec.get("may_text"), ", ", sub_where, ALLERGEN_EXTRA)
    diet = {i for i, (_, isext) in rec["filter_labels"].items() if not isext}   # "Vegan" / "Vegetarian" ids ride along
    all_ids, no_may, _ = [[i for i in ids if i not in diet] if isinstance(ids, list) else ids for ids in rec["label_ids"]]
    # an id that is neither an allergen nor Vegan/Vegetarian is a further "Suitable for" label (id 100 = "Gluten Free", carried by
    # the skin-on fries only): accepted only when the dish prints such a label, and it is then not an allergen id
    other_suitable = [s for s in rec["suitable"] if s not in ("Vegan", "Vegetarian")]
    unknown = [i for i in all_ids if i not in filt]
    if len(unknown) > len(other_suitable):
        raise SystemExit(f"{sub_where}: label id(s) {unknown} are not allergens and the dish prints no matching 'Suitable for' label")
    all_ids = [i for i in all_ids if i in filt]
    no_may = [i for i in no_may if i in filt]
    id_contains = set().union(*[filt[i] for i in no_may]) if no_may else set()
    id_may = set().union(*[filt[i] for i in all_ids if i not in no_may]) if all_ids else set()
    if id_contains - contains:
        raise SystemExit(f"{sub_where}: the filter data says it contains {sorted(id_contains - contains)}, the printed line does not")
    if contains - id_contains - id_may:
        raise SystemExit(f"{sub_where}: 'Contains: {rec.get('contains_text')}' names {sorted(contains - id_contains - id_may)} "
                         "that the filter data has nowhere")
    if id_may - contains:
        raise SystemExit(f"{sub_where}: the filter data lists {sorted(id_may - contains)} as 'may contain' but the printed line "
                         "does not mention it")
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts,
            "_text_stronger": sorted(contains & id_may)}


# ------------------------------------------------------------------------------------------------------------- driver

def main(argv: list | None = None) -> int:
    ap = argparse.ArgumentParser(description=f"Build data/source/{CHAIN_ID}/ from {URL}")
    ap.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "tenkites" / CHAIN_ID,
                    help="folder for the downloaded pages (downloaded once, 1 request/second, reused on later runs)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--report", action="store_true", help="print every skipped, unpublished, duplicate and renamed row")
    args = ap.parse_args(argv)

    cache = t.fetch_menus(URL, args.cache)
    unknown = [n for n, _ in cache if n not in TABS]
    missing = [n for n in TABS if n not in [c[0] for c in cache]]
    if unknown or missing:
        print(f"The tab bar changed (new: {unknown}, gone: {missing}). Decide for each tab in TABS whether it is used.", file=sys.stderr)
        return 1
    records = read_tabs([(n, p) for n, p in cache if TABS[n] == "use"])
    for tab, want in EXPECTED.items():
        got = sum(1 for r in records if r["menu"] == tab)
        if got != want:
            print(f"Tab {tab!r} has {got} nutrition tables but this script expects {want}: the menu changed, re-check the rules.", file=sys.stderr)
            return 1
    for tab, sections in EXPECTED_SECTIONS.items():
        found = {r["course"] for r in records if r["menu"] == tab}
        if found != sections:
            print(f"Tab {tab!r} sections changed: new {sorted(found - sections)}, gone {sorted(sections - found)}.", file=sys.stderr)
            return 1

    built = t.build_items(records, classify, CATEGORY_ORDER)
    items = built["items"]
    report = []
    stronger = []
    for it in items:
        r = it["_rec"]
        a = dish_allergens(r, f"{r['menu']} > {r['course']} > {r['name']}")
        if a.pop("_text_stronger"):
            stronger.append(it["name"])
        it["allergens"] = a
    for dup in built["duplicates"]:   # the same dish printed on two tabs must carry the same allergens
        r = dup["_rec"]
        a = dish_allergens(r, f"{r['menu']} > {r['course']} > {r['name']}")
        a.pop("_text_stronger")
        if a != dup["_dup_of"]["allergens"]:
            raise SystemExit(f"{dup['name']!r} is printed twice with the same numbers but different allergens")
    ids = {it["name"]: slug(it["name"]) for it in items}
    holds = []
    for item_name, reason in HOLDBACK.items():
        if item_name not in ids:
            print(f"HOLDBACK names {item_name!r}, which is not an item any more", file=sys.stderr)
            return 1
        holds.append((ids[item_name], reason))
    assert len(set(ids.values())) == len(ids), "two items would get the same id"
    if not holds:
        (Path(args.out) / "holdback.csv").unlink(missing_ok=True)

    guide = {"title": ALLERGEN_TITLE, "url": URL, "checked_on": args.checked_on, "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Castle Carvery", cuisine="Carvery", source_title=SOURCE_TITLE, source_url=URL,
                             checked_on=args.checked_on, aliases=["castle carvery", "the castle carvery"],
                             items=t.public_items(items), out=args.out, note=NOTE, holdback=holds, allergen_guide=guide)
    by_tab = {}
    for r in records:
        by_tab[r["menu"]] = by_tab.get(r["menu"], 0) + 1
    print(f"tables read per used tab: {by_tab}")
    print(f"tabs left out: { {n: TABS[n] for n in TABS if TABS[n] != 'use'} }")
    print(f"wrote {len(items)} items to {out} ({len(holds)} held back); unpublished (a '-' in kcal/protein/carbs/fat): "
          f"{len(built['unpublished'])}; skipped by rule: {len(built['skipped'])}; exact duplicates dropped: "
          f"{len(built['duplicates'])}; renamed to tell apart: {len(built['renamed'])}; "
          f"meat type not stated: {sum(1 for i in items if i['_meat_unstated'])}")
    for n, p in cache:
        print(f"  {n}: sha256 {sha256_file(p)}")
    print(f"allergens: every item has its allergens; {len(stronger)} dish(es) print allergens under 'Contains:' that the page's filter "
          f"data lists as 'may contain' (printed line used): {stronger}")
    print("self-contradicting rows to review (not changed):", [(i["name"], p) for i in items for p in t.sanity_problems(i)])
    if args.report:
        print("-- unpublished:")
        for r in built["unpublished"]:
            print("  ", r["menu"], ">", r["course"], ">", r["name"])
        print("-- skipped by rule:")
        for r, why in built["skipped"]:
            print("  ", r["menu"], ">", r["course"], ">", r["name"], "::", why)
        print("-- duplicates dropped:")
        for it in built["duplicates"]:
            print("  ", it["name"], "<-", it["_rec"]["menu"], ">", it["_rec"]["course"])
        print("-- renamed:", built["renamed"])
        print("-- meat type not stated:", [i["name"] for i in items if i["_meat_unstated"]])
    return 0


if __name__ == "__main__":
    sys.exit(main())
