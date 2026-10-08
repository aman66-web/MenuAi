#!/usr/bin/env python3
"""Build data/source/the-botanist/ from The Botanist's own "Allergen Matrix" menus (hosted by Ten Kites), a CALORIES-ONLY chain
with a complete allergen matrix.

    python3 tools/uk_extract/the_botanist.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the 18 saved pages botanist_00.html ... botanist_17.html (one per menu in the page's own menu list); --fetch downloads
them first (one request per second, normal browser User-Agent; robots.txt of menus.tenkites.com only disallows /fonts/ and /views/).

Source: https://menus.tenkites.com/nwtc/thebotanist (unit view "Allergen Matrix"), the page https://thebotanist.uk.com/menus links as
"Allergen Matrix" in its footer. The page prints no date. The other 15 menus are the same URL with ?mguid=<menu id>.

What the pages print: one kcal figure beside each dish name (the platform's nutrient table is switched off: protein, carbohydrate
and fat are never printed, so they stay BLANK: docs/DATA.md "Calories-only chains"), and for each dish the 14 allergen columns
(a tick = contains, "M" = may contain) plus "Suitable for" (Vegan / Vegetarian) columns, repeated as a "Contains: ... May contain: ..."
line. Allergens are read from the columns and cross-checked against that line and against the label ids of the page's own allergen
filter (tenkites_c.allergens_from_columns); any disagreement stops the run. The mobile copy of each page (the same menu printed a
second time) must list the same dishes with the same calories, or the run stops.

How the page's structure is read (nothing is converted, estimated or filled in):
- Every dish node on the page is one printed row: a plain dish, a dish that has choices (a "build your own" parent, kind "byo"), or a
  choice/add-on listed under it (kind "sub"), each with its own kcal and its own allergen columns. Choices and add-ons are published as
  items too, in a category "<section> options" (or "<section>: <choice group>" for the Hanging Kebabs, whose Kebab / Sauce / Side groups
  have no parent dish). Their names are exactly as printed ("Add Herby Mash"), so the same name can appear with different calories;
  the category tells them apart. The page does not say whether a dish's kcal already includes the side offered with it.
- The same dish (same name and same kcal) printed in several menus or as a choice is one item; a dish occurrence wins over a choice
  group without a parent dish, which wins over a choice/add-on under a dish; ties go to the first in page order. Different kcal under the same name stay separate items.
- Dishes with no kcal ("-" on the page) are not published: all cocktails, draught and bottled drinks, wines, and the kids' drinks.
- Categories: A La Carte sections as printed; other menus as "<menu>: <section>" (just the menu name if its only section repeats it).
  A dish printed outside any section (Popcorn) goes under the menu's name.
- Left out as event/venue specific: the "Race Days Only" section of Botanista Brunch (Full English).
- Held back (not corrected): "Moet et Chandon 20CL" prints "0 kcal", impossible for champagne.
- limited_time: dishes that appear only in the Christmas Menu, Christmas Nibbles, Festive Finger Food, Beaujolais Day Set Menu or
  "Group Dining Celebration Menu - From November 18th" menus.
- Tags: vegetarian when the page ticks Vegan or Vegetarian for the dish; contains_pork / contains_beef only when the dish's name or
  printed description says so (tenkites_c.meat_tags).
"""
from __future__ import annotations
import argparse
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "the-botanist"
BASE = "https://menus.tenkites.com/nwtc/thebotanist"
# file, menu name as printed (also the page <title>), menu id (None = the page's default menu), dish rows expected on the page
MENUS = [
    ("botanist_00.html", "A La Carte", "3e01afa9-f624-4d0e-81b8-cdb00a6c3083", 91),
    ("botanist_01.html", "Sunday Roast", "51a6646b-984f-41f1-8763-a345ccfb2f01", 19),
    ("botanist_02.html", "£8.95 Lunch Menu", "77e4cb08-f989-43d3-840e-b602f1555113", 6),
    ("botanist_03.html", "Kids Menu", "82ac48dc-45a2-4437-a563-f7f63326f35a", 21),
    ("botanist_04.html", "Botanista Brunch", "ef9886d3-9e37-40b9-aa06-160f293cb3cf", 24),
    ("botanist_05.html", "Group Dining Celebration Menu", "a536f02a-befb-40b0-838c-fcbdb2e7ba70", 39),
    ("botanist_06.html", "Group Dining Celebration Menu - From November 18th", "9f9ad524-a85e-4cf4-a103-4c97aa25317a", 38),
    ("botanist_07.html", "Gardener's Table Finger Food", "286b47c4-e4bc-491f-9cff-8e2b282e0917", 16),
    ("botanist_08.html", "Midnight Menu", "5d189dec-aecf-4c0c-9130-3da6df83a205", 3),
    ("botanist_09.html", "Pizza", "be312523-a669-458b-ace0-1b4a993102d3", 10),
    ("botanist_10.html", "Condiments", "22b08608-14ba-4e38-b9fd-4bd16cff3417", 2),
    ("botanist_11.html", "Cocktails", "ea8224c7-120a-4e25-8f1a-db64fb9924c3", 37),
    ("botanist_12.html", "Draught & Bottled", "593fb2d5-eb0d-4706-9875-5e51c806fd19", 18),
    ("botanist_13.html", "Wine & Sparkling", "6725f342-7ea0-4bd7-8ed4-7fdf81b71d8d", 22),
    ("botanist_14.html", "Beaujolais Day Set Menu", "38da41eb-2675-4653-aa1e-c348df871ef2", 38),
    ("botanist_15.html", "Christmas Menu", "f2179f6c-0a97-41a4-9a36-fe29c3b5cb13", 13),
    ("botanist_16.html", "Christmas Nibbles", "04043cdd-910d-49cb-8314-6b6321905161", 4),
    ("botanist_17.html", "Festive Finger Food", "91fa9750-50be-476a-b8b2-45e87ebaccd2", 17),
]
FIRST_MENU = "A La Carte"
SEASONAL_MENUS = {"Christmas Menu", "Christmas Nibbles", "Festive Finger Food", "Beaujolais Day Set Menu",
                  "Group Dining Celebration Menu - From November 18th"}
# The page's own menu list calls the Christmas menu "Christmas Set Menu" (it was "Christmas Menu" until 8 Oct 2026); its page <title>
# still says "Christmas Menu", and that name is kept here so the items' categories and ids do not change.
LIST_NAMES = {"Christmas Menu": "Christmas Set Menu"}
# sections left out of the published menu (reason in the report)
EXCLUDED_SECTIONS = {("Botanista Brunch", "Race Days Only"): "event/venue-specific section (race days only)"}
# rows whose printed calories are impossible: published nowhere (holdback.csv); any other 0 kcal row stops the run
_NO_MARKS = "The page marks no allergen at all for this add-on (not even for a meat or dairy product), so 'none' would be a guess. Not published."
# Allergen rows that contradict the dish (never corrected, held back): a key is the printed name (every kcal) or (name, kcal).
_NO_GLUTEN = ("allergen row contradicts the dish name/ingredients: the page marks no gluten at all for {what}, with no non-gluten label "
              "(the Botanist labels its gluten-free dishes 'NG' / 'Non Gluten').")
_PANKO = ("The page marks gluten only as 'may contain' for a panko-breaded dish, while the same page marks gluten as contained for the "
          "breaded Crispy Panko Halloumi in its £8.95 Lunch Menu: the allergen rows contradict each other, so neither is chosen.")
HOLD_ALLERGEN = {
    ("Crispy Panko Halloumi", "690"): _PANKO,
    ("Crispy Panko Halloumi", "945"): _PANKO,
    ("Panko Halloumi Kebab", "1268"): _PANKO,
    "Chocolate Chip Cookie Dough": _NO_GLUTEN.format(what="a cookie dough dessert"),
    "Sticky Toffee Pudding": _NO_GLUTEN.format(what="a sticky toffee pudding (a flour sponge)"),
}
HOLD = {"Moët et Chandon 20CL": "The page prints 0 kcal for a 20 cl bottle of champagne, which is impossible; the other wines print no calories. Not published.",
        "Add Maple Bacon": _NO_MARKS, "Add Grilled Chicken": _NO_MARKS, "Add Smoked Streaky Bacon": _NO_MARKS}
# choice groups whose names say nothing more than "options"
GENERIC_GROUPS = {"choose from:", "add ons", "add-ons:", "add-ons"}

# The 14 allergen columns as the page prints them (tick = contains, M = may contain), in the page's order.
ALLERGEN_COLUMNS = ["Celery", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Sesame Seeds", "Soya",
                    "Sulphur Dioxide/Sulphites", "Peanuts", "Tree Nuts", "Cereals with Gluten"]
SUITABLE_COLUMNS = ["Vegan", "Vegetarian"]

SOURCE_TITLE = "The Botanist Allergen Matrix with calories, 18 menus (Ten Kites page; no date printed, read {day})"
ALLERGEN_TITLE = "The Botanist Allergen Matrix (Ten Kites page; no date printed, read {day})"
NOTE = ("Calories only (kcal beside each dish); the page prints no protein, carbs or fat. Choices and add-ons are listed as their "
        "own items; the page does not say whether a dish's kcal includes the side offered with it. Drinks are left out: the page "
        "prints no calories for them.")


# ---------------------------------------------------------------- reading one page

def menu_options(text: str) -> list[tuple[str, str]]:
    """The page's own menu list: [(menu id, name)]."""
    root = tk.parse_html(text)
    return [(n.attrs["data-menu-identifier"], n.text()) for n in root.iter()
            if n.has("k10-menu-selector__option-name") and n.attrs.get("data-menu-identifier")]


def read_menu(text: str, where: str) -> list[dict]:
    """One row per dish node of the desktop copy of the page, in page order."""
    root = tk.parse_html("<div>" + tk._desktop_part(text) + "</div></div>")
    filt = tk.filter_labels(tk.parse_html(text))
    if not filt:
        raise SystemExit(f"{where}: the page no longer carries its allergen filter")
    rows = []
    for node in root.iter():
        if not (node.has("k10-w-recipe__info") and node.attrs.get("data-recipe-id")):
            continue
        rid = node.attrs["data-recipe-id"]
        if node.has("k10-recipe_sub-byo"):
            kind = "sub"
        elif node.has("k10-recipe_byo"):
            kind = "byo"
        elif node.has("k10-recipe_not-byo"):
            kind = "plain"
        else:
            raise SystemExit(f"{where}: dish node {rid} has an unknown kind {sorted(node.classes)}")
        name_node = node.find("k10-w-recipe__name") or node.find("k10-w-byo-sub-item__name")
        if name_node is None:
            raise SystemExit(f"{where}: dish node {rid} has no name")
        name = name_node.text()
        # calories: the "(N kcal)" beside the name, which must equal the node's data-calories ("-" = none printed)
        item = node.find("k10-primary-nutrient__item")
        attr = node.attrs.get("data-calories", "")
        if item is None:
            if attr != "-":
                raise SystemExit(f"{where}: {name!r} prints no kcal but data-calories is {attr!r}")
            calories = ""
        else:
            m = re.fullmatch(r"(\d[\d,]*) kcal", item.text())
            if not m or tk.printed(m.group(1)) != tk.printed(attr) or not tk.is_number(tk.printed(m.group(1))):
                raise SystemExit(f"{where}: {name!r}: calories {item.text()!r} do not match data-calories {attr!r}")
            calories = tk.printed(m.group(1))
        # the dish's card: description and the "Suitable for / Contains / May contain" lines
        wrapper = node.parent
        names = wrapper.find("k10-recipe__label-names-wrapper") if wrapper is not None else None
        desc = wrapper.find("k10-recipe__desc") if wrapper is not None else None
        label_names = names.text() if names is not None else ""
        states = {c.attrs["data-label-name"]: tk._state(c) for c in node.find_all("k10-recipe__label") if c.attrs.get("data-label-name")}
        if set(states) != set(ALLERGEN_COLUMNS) | set(SUITABLE_COLUMNS):
            raise SystemExit(f"{where}: {name!r} has columns {sorted(states)}, not the expected 14 allergens + Vegan/Vegetarian")
        if any(v is None for v in states.values()):
            raise SystemExit(f"{where}: {name!r} has a column with no mark at all")
        # suitable-for: the columns and the printed line must agree
        m = re.search(r"Suitable for:\s*(.*?)\s*(?=Contains:|May contain:|$)", label_names)
        line_suitable = {x.strip() for x in m.group(1).split(",") if x.strip()} if m else set()
        col_suitable = {c for c in SUITABLE_COLUMNS if states[c] == "yes"}
        if line_suitable != col_suitable or any(states[c] == "may" for c in SUITABLE_COLUMNS):
            raise SystemExit(f"{where}: {name!r}: Suitable-for columns {sorted(col_suitable)} disagree with the printed line {sorted(line_suitable)}")
        row = {"label_states": states, "label_names": label_names, "label_ids": tk._label_ids(node, rid), "filter": filt}
        allergens = tk.allergens_from_columns(row, f"{where} {name}", ALLERGEN_COLUMNS)
        if allergens is None:
            raise SystemExit(f"{where}: {name!r}: allergens could not be read")
        # which choice group a 'sub' row sits in (the group's printed heading)
        group = ""
        for a in tk._ancestors(node):
            if a.has("k10-byo_sub_l1"):
                h = a.find("k10-byo__section-name")
                group = h.text() if h is not None else ""
                break
        rows.append({"section": tk._course_section(node), "kind": kind, "name": name, "calories": calories, "recipe_id": rid,
                     "byo_id": node.attrs.get("data-byo-id", "0"), "group": group, "desc": desc.text() if desc is not None else "",
                     "vegetarian": bool(col_suitable), "allergens": allergens, "no_marks": not names and not any(
                         v != "no" for v in states.values())})
    return rows


def mobile_sequence(text: str) -> list[tuple[str, str]]:
    """(recipe id, calories) of every dish in the page's mobile copy, to compare with the desktop copy."""
    start = text.find("k10-all-courses k10-all-courses_mobile")
    if start < 0:
        raise SystemExit("the page has no mobile copy of the menu any more")
    root = tk.parse_html("<div>" + text[start - 12:])
    return [(n.attrs["data-recipe-id"], tk.printed(n.attrs.get("data-calories", ""))) for n in root.iter()
            if n.attrs.get("data-recipe-id") and (n.has("k10-w-recipe_mobile") or n.has("k10-w-byo-item_mobile"))
            and not n.has("k10-recipe-card") and not n.has("k10-recipe_hidden")]


# ---------------------------------------------------------------- turning rows into items

def ascii_slug(name: str) -> str:
    return slug(unicodedata.normalize("NFKD", name.replace("™", "")).encode("ascii", "ignore").decode())


def category_for(menu: str, row: dict, has_parent: bool) -> str:
    base = row["section"] or menu
    if row["kind"] == "sub":
        if has_parent or row["group"].strip().lower() in GENERIC_GROUPS or not row["group"].strip():
            label = f"{base} options"
        else:
            label = f"{base}: {row['group'].strip().rstrip(':')}"
    else:
        label = base
    if menu == FIRST_MENU or label.lower() == menu.lower():
        return label
    return f"{menu}: {label}"


def build(pages_dir: Path, day: str) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    occurrences = []   # every printed dish: (menu, row, category, parent name)
    first_text = (pages_dir / MENUS[0][0]).read_text(encoding="utf-8")
    listed = menu_options(first_text)
    if listed != [(g, LIST_NAMES.get(n, n)) for _, n, g, _ in MENUS]:
        raise SystemExit(f"The page's menu list changed: {listed} is not the 18 menus this script was checked against. "
                         "Fetch and check the new menus, then update MENUS.")
    for fname, menu, guid, expected in MENUS:
        text = first_text if fname == MENUS[0][0] else (pages_dir / fname).read_text(encoding="utf-8")
        if tk.page_title(text) != menu:
            raise SystemExit(f"{fname}: page title {tk.page_title(text)!r} is not {menu!r}")
        rows = read_menu(text, fname)
        if len(rows) != expected:
            raise SystemExit(f"{fname} ({menu}) has {len(rows)} dishes but this script expects {expected}: the menu changed, "
                             "re-check MENUS, EXCLUDED_SECTIONS and HOLD before running again.")
        desktop = [(r["recipe_id"], r["calories"] or "-") for r in rows]
        if desktop != mobile_sequence(text):
            raise SystemExit(f"{fname} ({menu}): the mobile copy of the page lists different dishes or calories than the desktop copy")
        parents = {r["byo_id"]: r["name"] for r in rows if r["kind"] == "byo"}
        for r in rows:
            parent = parents.get(r["byo_id"], "") if r["kind"] == "sub" else ""
            occurrences.append((menu, r, category_for(menu, r, bool(parent)), parent))

    left_out: dict[str, int] = {}
    no_kcal: dict[str, int] = {}
    held: list[tuple[str, str]] = []
    usable = []
    for menu, r, cat, parent in occurrences:
        reason = EXCLUDED_SECTIONS.get((menu, r["section"]))
        if reason:
            left_out[f"{menu}: {r['section']} ({reason})"] = left_out.get(f"{menu}: {r['section']} ({reason})", 0) + 1
            continue
        if r["calories"] == "":
            no_kcal[menu] = no_kcal.get(menu, 0) + 1
            continue
        if r["calories"] == "0" and r["name"] not in HOLD:
            raise SystemExit(f"{menu}: {r['name']!r} prints 0 kcal: decide whether to hold it back (HOLD) before running again.")
        usable.append((menu, r, cat, parent))

    # one item per (name, kcal): a dish/choice-parent occurrence beats a choice occurrence, then the first in page order
    def rank(i: int) -> int:   # 0 dish, 1 choice group without a parent dish (Hanging Kebabs), 2 choice/add-on under a dish
        _, r, _, parent = usable[i]
        return 0 if r["kind"] != "sub" else (2 if parent else 1)

    chosen: dict[tuple[str, str], int] = {}
    for i, (menu, r, cat, parent) in enumerate(usable):
        key = (r["name"], r["calories"])
        if key not in chosen or rank(i) < rank(chosen[key]):
            chosen[key] = i
    where_listed: dict[tuple[str, str], list[str]] = {}
    conflicts = []
    for i, (menu, r, cat, parent) in enumerate(usable):
        key = (r["name"], r["calories"])
        where_listed.setdefault(key, []).append(menu if not parent else f"{menu} (with {parent})")
        kept = usable[chosen[key]][1]
        if r["allergens"] != kept["allergens"] or r["vegetarian"] != kept["vegetarian"]:
            conflicts.append(f"{r['name']} ({r['calories']} kcal) in {menu}")
    if conflicts:
        raise SystemExit("The same dish and calories are printed with different allergens or diet marks: " + "; ".join(conflicts))
    emitted = [usable[i] for i in sorted(chosen.values())]
    name_count: dict[str, int] = {}   # by id-slug, so "Pan Fried Salmon" and "Pan-Fried Salmon" count as the same name
    for _, r, _, _ in emitted:
        name_count[ascii_slug(r["name"])] = name_count.get(ascii_slug(r["name"]), 0) + 1

    items = []
    used_ids: set[str] = set()
    used_allergen_holds: set = set()
    for menu, r, cat, parent in emitted:
        key = (r["name"], r["calories"])
        listed_in = sorted(set(where_listed[key]))
        menus_all = {m.split(" (with")[0] for m in listed_in}
        meat, unspecified = tk.meat_tags(r["name"], r["desc"], vegetarian=r["vegetarian"])
        if unspecified:
            report.append(f"meat type not stated: {r['name']}")
        # id: the name; if another item has the same name, name + category; if that clashes too, + the dish it is offered with
        tries = [ascii_slug(r["name"]), ascii_slug(f"{r['name']} {cat}"), ascii_slug(f"{r['name']} {cat} {parent}")]
        item_id = tries[0] if name_count[ascii_slug(r["name"])] == 1 else next((t for t in tries[1:] if t not in used_ids), "")
        if not item_id or item_id in used_ids:
            raise SystemExit(f"cannot make a unique id for {r['name']!r} in {cat!r} (with {parent!r})")
        used_ids.add(item_id)
        notes = []
        if parent:
            notes.append(f"Choice/add-on printed under {parent}")
        if len(listed_in) > 1:
            notes.append("Also printed in: " + ", ".join(x for x in listed_in if x != (menu if not parent else f"{menu} (with {parent})")))
        if r["no_marks"]:
            notes.append("The page marks none of the 14 allergens and prints no Suitable-for or May-contain line for this item")
            report.append(f"no allergen marks at all printed: {r['name']} ({menu})")
        if name_count[ascii_slug(r["name"])] > 1:
            notes.append("The same name is printed with different calories elsewhere; both are kept")
        item = {"id": item_id, "name": r["name"], "category": cat, "serving": "", "calories": r["calories"],
                "tags": "|".join((["vegetarian"] if r["vegetarian"] else []) + meat),
                "limited_time": all(m in SEASONAL_MENUS for m in menus_all), "rankable": False,
                "notes": "; ".join(notes), "allergens": r["allergens"]}
        items.append(item)
        if r["name"] in HOLD:
            held.append((item_id, HOLD[r["name"]]))
        else:
            why = HOLD_ALLERGEN.get((r["name"], r["calories"])) or HOLD_ALLERGEN.get(r["name"])
            if why:
                held.append((item_id, why))
                used_allergen_holds.add((r["name"], r["calories"]) if (r["name"], r["calories"]) in HOLD_ALLERGEN else r["name"])
    unused = [k for k in HOLD_ALLERGEN if k not in used_allergen_holds]
    if unused:
        raise SystemExit(f"HOLD_ALLERGEN names dishes that are not on the pages any more (renamed, recalculated?): {unused}")
    report += [f"left out {n} dish(es): {s}" for s, n in left_out.items()]
    report += [f"no kcal printed, not published: {n} dishes in {m}" for m, n in no_kcal.items()]
    report += [f"held back: {i} ({why})" for i, why in held]
    return items, held, report


# ---------------------------------------------------------------- fetch and main

def fetch_all(pages_dir: Path) -> None:
    for fname, menu, guid, _ in MENUS:
        url = BASE if fname == MENUS[0][0] else f"{BASE}?mguid={guid}"
        tk.fetch(url, pages_dir / fname)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the pages with the live menus")
    ap.add_argument("--fetch", action="store_true", help="download the 18 pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    items, holdback, report = build(args.pages, args.checked_on)
    out = write_chain_folder(chain_id=CHAIN_ID, name="The Botanist", cuisine="Bar",
                             source_title=SOURCE_TITLE.format(day=args.checked_on), source_url=BASE,
                             checked_on=args.checked_on, aliases=["the botanist", "botanist"], items=items, out=args.out,
                             note=NOTE, holdback=holdback, nutrition_level="calories",
                             allergen_guide={"title": ALLERGEN_TITLE.format(day=args.checked_on), "url": BASE,
                                             "checked_on": args.checked_on, "may_contain_published": True})
    for fname, menu, _, _ in MENUS:
        print(f"{fname} ({menu}) sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
