#!/usr/bin/env python3
"""Build data/source/megans/ from Megan's own allergen and nutrition guide (a Ten Kites page).

    python3 tools/uk_extract/megans.py --checked-on 2026-10-08 [--pages DIR] [--fetch] [--out DIR]

Source: https://menus.tenkites.com/megans/megans, the "Allergen Guide" that https://megans.co.uk/allergy-information/ links to.
The page's default tab, "All", lists the standard dishes (321 printed rows, 24 MB of HTML); the same site also has one page per
section (?mguid=<menu id>, listed in the tab bar). --fetch saves the All page and the 21 standard section pages into --pages
(default: a temp folder), one request at a time, 1.2 s apart; delete a file to refresh it. robots.txt: megans.co.uk disallows
only /wp-json/ and ?rest_route=; menus.tenkites.com disallows only /fonts/, /views/ and /*.less, so neither blocks these pages.

Numbers are copied exactly as printed in each dish's "Nutrition values per serving" cells (Energy kCal, Protein, Carb, of which
Sugars, Fat, Sat Fat, Salt; the page prints no kJ, fibre or weights). A thousands comma is dropped ("1,037" -> "1037"); "-" means
the chain does not publish the dish's nutrition (cocktails, beer, wine...) and the dish is left out. Allergens are read from three
places the page prints them (the 14 yes/may/no columns, the card's "Contains:" / "May contain:" lines, the dish's label ids) and
the run stops if they disagree (tenkites_b.allergens_from_rec).

The All page and the section pages are not in step: on 2026-10-08, 237 of the 247 numbered All rows were printed identically
(name, numbers, allergens) on a section page, 10 were on no section page (2 of those are single-site dishes, left out), and 2 food
dishes (Mixed Skewer Grill, Kids Chicken Bites (Protein Only)) plus a few drinks in the alcohol sections were on a section page
only. Following the repo rule that conflicting sources are held back and never chosen between, a dish is published only when both
agree; the others are written to items.csv and listed in holdback.csv (deleting a line restores one). Alcohol-section dishes
found only on a section page are not extracted.

The script stops if the number of printed rows or tabs changes, a nutrient column or section is not mapped, or a dish name is
printed twice with different numbers. The shared tenkites_b.py "table" reader cannot be used as it is (Megan's cards repeat the 14
allergen columns once per sub-recipe), so read_dishes() below reads the dish's own row and its card separately.
"""
from __future__ import annotations
import argparse
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as ta  # noqa: E402
import tenkites_b as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "megans"
URL = "https://menus.tenkites.com/megans/megans"
EXPECTED_ROWS = 321
EXPECTED_TABS = 26   # tabs other than "All"
KEY_COLS = tk.KEY_COLS
FOURTEEN_LABELS = 14
# Tabs that are not the chain's standard menu: two sites' own lists and three party menus. Not fetched or published.
EXCLUDED_TABS = {"Dulwich & Parson's Green Pastries", "High Street Kensington Specials Menu", "Party Menu - Canapes",
                 "Party Menu - Feasting", "Party Menu - Set Menu"}
ALCOHOL_TOPS = {"Cocktails", "Beer & Cider", "Spirits, Shots & Mixers", "Wine"}

# Printed section path -> (category shown, rankable). Parts of a meal (extras, sides, breads, sauces, dips), starters, treats,
# drinks and everything on the kids' menu are never suggested as an order on their own.
SECTIONS = {
    ("Brunch", "Light Breakfast"): ("Light breakfast", True),
    ("Brunch", "Shakshouka"): ("Shakshouka", True),
    ("Brunch", "Brunch Plates"): ("Brunch plates", True),
    ("Brunch", "Turkish Brunch Feast"): ("Turkish brunch feast", False),
    ("Brunch", "On Toast"): ("On toast", True),
    ("Brunch", "Pancakes"): ("Pancakes", True),
    ("Brunch", "Hashbrowns"): ("Hashbrowns", False),
    ("Brunch Extras",): ("Brunch extras", False),
    ("Cakes & Pastries",): ("Cakes & pastries", False),
    ("To Start & Share", "Bread & Dips"): ("Bread & dips", False),
    ("To Start & Share",): ("To start & share", False),
    ("Arayes, Pitas & Grills",): ("Arayes, pitas & grills", True),
    ("Classic & Posh Kebabs",): ("Kebabs", True),
    ("Bowls",): ("Bowls", True),
    ("Protein Extras",): ("Protein extras", False),
    ("Sharing Mains",): ("Sharing mains", False),
    ("The Best of Megan's Set Menu",): ("Set menu", False),
    ("Little Grills & Little Arayes",): ("Little grills & little arayes", False),
    ("Sides",): ("Sides", False),
    ("Breads",): ("Breads", False),
    ("Sauces",): ("Sauces", False),
    ("Desserts",): ("Desserts", False),
    ("Kids Food", "Kids Breakfast"): ("Kids breakfast", False),
    ("Kids Food", "Kids Breakfast Protein Choices"): ("Kids breakfast protein choices", False),
    ("Kids Food", "Kids Mains"): ("Kids mains", False),
    ("Kids Food", "Kids Drinks"): ("Kids drinks", False),
    ("Kids Food", "Kids Desserts"): ("Kids desserts", False),
    ("Hot Drinks", "Milks & Syrups"): ("Milks & syrups", False),
    ("Hot Drinks", "Signature - Milk Choice Not Included, See 'Milk & Syrups' Section Above"): ("Signature hot drinks", False),
    ("Hot Drinks", "Coffees & Hotties - Milk Choice Not Included, See 'Milk & Syrups' Section Above"): ("Coffees & hotties", False),
    ("Hot Drinks", "Iced - Milk Choice Not Included, See 'Milk & Syrups' Section Above"): ("Iced drinks", False),
    ("Smoothies, Juices & House Sodas",): ("Smoothies, juices & sodas", False),
    ("Cocktails", "Signature"): ("Cocktails", False),
    ("Cocktails", "Classics"): ("Cocktails", False),
    ("Cocktails", "Frozen"): ("Cocktails", False),
    ("Cocktails", "Spritzes & Bellinis"): ("Cocktails", False),
    ("Low & No",): ("Low & no", False),
    ("Beer & Cider",): ("Beer & cider", False),
    ("Spirits, Shots & Mixers", "Shots"): ("Spirits, shots & mixers", False),
    ("Spirits, Shots & Mixers", "Spirits"): ("Spirits, shots & mixers", False),
    ("Spirits, Shots & Mixers", "Mixers"): ("Spirits, shots & mixers", False),
    ("Wine", "Bubbles"): ("Wine", False),
    ("Wine", "Red Wine"): ("Wine", False),
    ("Wine", "White Wine"): ("Wine", False),
    ("Wine", "Rose Wine"): ("Wine", False),
}
# The section pages name a few sections differently; only used for the dishes printed on a section page alone.
TAB_SECTIONS = {
    ("Smoothies, Juices & Softs",): ("Smoothies, juices & sodas", False),
    ("Kids Food", "Mains"): ("Kids mains", False),
    ("Kids Food", "Mains Protein Choices"): ("Kids mains", False),
    ("Sharing Mains",): ("Sharing mains", False),
}


def venue_only(name: str, desc: str) -> "str | None":
    """Dishes the guide itself marks as served at one or two sites only: the printed description is "DUL cafe" (Dulwich cafe),
    or the name says "DUL & PGL only" / "Dulwich ... Only". Left out: the app lists the chain's menu, not a branch's."""
    if desc.strip().lower() == "dul cafe":
        return "marked 'DUL cafe' (Dulwich cafe only)"
    if re.search(r"\b(DUL|Dulwich)\b.*\bonly\b", name, re.I):
        return "named as available at Dulwich and Parson's Green only"
    return None


# Rows kept in items.csv but not published (holdback.csv): reason per printed name. Nothing is corrected or estimated.
ZERO = "every value is printed as 0"
ALLERGEN_ROW = "the chain's allergen row contradicts the dish, so it is not published"
HOLDBACK = {
    "Gluten Free Flatbread": f"{ZERO}: a flatbread cannot have no energy, so the row is a placeholder",
    "Latte | Flat White | Cappuccino | Macchiato": f"{ZERO} and its section says the milk choice is not included, so it does not describe the drink as sold",
    "Megan's Iced Latte": f"{ZERO} and its section says the milk choice is not included, so it does not describe the drink as sold",
    "Megan's Turkish Brunch Feast - For The Table (4ppl)": "sold for 4 people but the page's column says only 'per serving'; its own card lists parts "
                                                           "(e.g. Original Baked Eggs 1,420 kcal, Bread Basket 1,745 kcal) that add up to far more than the 2,070 kcal "
                                                           "printed, so the figure is probably per person and the page does not say",
    "Megan's Mezze Feast (For 2)": "sold for 2 people but the page's column says only 'per serving'; unclear whether the figures are per person or "
                                   "for the whole feast",
    "Carrot Cake": "salt is printed as 12.1 g for a cake (the other cakes and loaves print 0.1 to 0.9 g) and the cake's own ingredient list "
                   "names salt last, as its smallest ingredient",
    "Hugo Spritz": "alcoholic drink whose kcal (56) is exactly the carbohydrate energy (14 g x 4): the alcohol's energy is not counted",
    "Efes": "beer whose kcal (42) is only its protein and carbohydrate energy: the alcohol's energy is not counted",
    "Corona": "beer printed as 6 kcal: the figure cannot include the alcohol's energy",
    "Olmeca Gold": f"tequila: {ZERO}, which cannot include the alcohol's energy",
    "Baileys": "cream liqueur printed as 4 kcal: the figure cannot include the alcohol's energy",
    "Round Stone Sauvignon Blanc": f"listed under Wine: {ZERO}; not clear whether it is alcohol-free, so not published",
    # Allergen rows that contradict the dish (independent accuracy check, 8 October 2026). The guide marks eggs, milk and soya for the
    # one "Brownie" recipe but never gluten (not even as "may contain"), and gives no ingredient text or gluten-free wording; a
    # hazelnut syrup is listed with no tree nut mark. Not corrected, not guessed: held back so nobody is shown "no gluten" / "no nuts"
    # for them on the strength of an unexplained row.
    "Baileys Tiramisu Brownie": ALLERGEN_ROW + " (a brownie with no gluten marked and no gluten-free wording)",
    "Brownie & Ice Cream": ALLERGEN_ROW + " (a brownie with no gluten marked and no gluten-free wording)",
    "Chocolate Brownie": ALLERGEN_ROW + " (a brownie with no gluten marked and no gluten-free wording)",
    "Ice Cream Topping - Brownie Pieces": ALLERGEN_ROW + " (brownie with no gluten marked and no gluten-free wording)",
    "Kids Chocolate Brownie Bite & Ice Cream": ALLERGEN_ROW + " (a brownie with no gluten marked and no gluten-free wording)",
    "Hazelnut Syrup": ALLERGEN_ROW + " (a hazelnut syrup with no tree nut marked and no ingredient text)",
}
ALL_ONLY = ("printed on the 'All' page but on none of the chain's own section pages (read the same day), so the chain's pages "
            "disagree on whether it is on the menu")
TAB_ONLY = ("printed on its own section page but not on the 'All' page (read the same day), so the chain's pages disagree on "
            "whether it is on the menu")

DIET = re.compile(r"\b(vegan|veggie|vegetarian)\b", re.I)
NDUJA = re.compile(r"\bn?'?duja\b", re.I)  # a Calabrian pork salami: tenkites_b.PORK does not know the word
SERVING = re.compile(r"\s*(?:-\s*)?\((1 serving)\)\s*$", re.I)

ALLERGEN_TITLE = "Megan's Allergen Guide (menus.tenkites.com/megans/megans, linked from megans.co.uk/allergy-information; accessed %s, no date shown)"
SOURCE_TITLE = "Megan's Allergen Guide: 'All' menu and section pages, nutrition values per serving (menus.tenkites.com/megans/megans; accessed %s, no date shown)"
NOTE = ("Figures are per serving from Megan's own allergen guide. Hot drinks in the Signature, Coffees & hotties and Iced sections are "
        "printed without the milk choice (milks and syrups are listed separately). Alcoholic drinks and a few extras have no figures.")


# ---------------------------------------------------------------- download

def fetch(url: str, dest: Path) -> None:
    """One GET of the page (a dropped connection is retried, 5 s apart; an HTTP error status is not)."""
    req = urllib.request.Request(url, headers={"User-Agent": tk.USER_AGENT, "Accept": "text/html"})
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                dest.write_bytes(resp.read())
            return
        except OSError as exc:
            if isinstance(exc, urllib.error.HTTPError) or attempt == 2:
                raise
            time.sleep(5)


def tab_files(pages: Path) -> list:
    """[(tab name, path)] for the standard section pages, in tab-bar order, from the saved All page."""
    tabs = ta.menu_tabs((pages / "megans_all.html").read_text(encoding="utf-8", errors="replace"))
    if len(tabs) != EXPECTED_TABS + 1 or tabs[0][0] != "All":
        raise SystemExit(f"the tab bar lists {len(tabs)} menus (expected All + {EXPECTED_TABS}): a menu was added or removed, "
                         "decide whether it belongs and update EXCLUDED_TABS / EXPECTED_TABS")
    out = []
    for name, mid, _ in tabs[1:]:
        if name not in EXCLUDED_TABS:
            out.append((name, mid, pages / f"tab-{slug(name)}.html"))
    return out


def fetch_all(pages: Path) -> None:
    allp = pages / "megans_all.html"
    if not allp.exists():
        fetch(URL, allp)
        time.sleep(1.2)
    for name, mid, path in tab_files(pages):
        if not path.exists():
            fetch(f"{URL}?mguid={mid}", path)
            time.sleep(1.2)


# ---------------------------------------------------------------- reading the page

def _marks(row: "tk.Node", name: str) -> dict:
    """The dish's own 14 yes/may/no allergen columns, from its row only (the card repeats the columns per sub-recipe)."""
    marks: dict = {}
    for col in row.find_all("k10-recipe__label", attr="data-label-id"):
        state = [c for c in col.iter() if c is not col and "data-label-name" in c.attrs]
        if len(state) != 1:
            raise SystemExit(f"{name}: allergen column {col.attrs.get('data-label-name')!r} without exactly one state")
        label = tk._clean(col.attrs.get("data-label-name", ""))
        if label in marks:
            raise SystemExit(f"{name}: allergen column {label!r} printed twice in the row")
        marks[label] = {"LabelValueYes": "yes", "LabelValueMay": "may", "LabelValueNo": "no"}[state[0].attrs["data-label-name"]]
    if len(marks) != FOURTEEN_LABELS:
        raise SystemExit(f"{name}: {len(marks)} allergen columns instead of {FOURTEEN_LABELS}")
    return marks


def read_dishes(text: str) -> list:
    """One record per printed dish row: {section, name, desc, nutrients, ingredients, allergen_src, has_card}."""
    root = tk.parse_html(text)
    labels = tk.page_labels(root)
    recs = []
    for w in root.find_all("k10-recipe__wrapper"):
        kids = [c for c in w.children if isinstance(c, tk.Node)]
        if len(kids) != 2 or not kids[0].has("k10-recipe_desktop") or not kids[1].has("k10-recipe-card"):
            raise SystemExit("a dish block is not (desktop row, card): the page layout changed")
        row, card = kids
        namenode = row.find("k10-w-recipe__name")
        if namenode is None:
            raise SystemExit("a dish row without a name")
        name = tk._clean(namenode.text())
        nutrients = {d.attrs["data-nutrient-name"]: tk._clean(d.text()) for d in row.find_all(attr="data-nutrient-name")}
        # the card prints the same numbers a second time: they must agree with the row
        table = card.find("k10-recipe__nutrients-table")
        has_card = table is not None
        if has_card:
            trs = table.find_all("k10-recipe__nutrients-table-row")
            if len(trs) != 2:
                raise SystemExit(f"{name}: nutrition card without a header row and a value row")
            heads = [tk._clean(s.text()) for s in trs[0].find_all("k10-recipe__nutrient-name")]
            vals = [tk._clean(s.text()) for s in trs[1].find_all("k10-recipe__nutrient-value")]
            if dict(zip(heads, vals)) != nutrients or len(heads) != len(vals):
                raise SystemExit(f"{name}: row {nutrients} and card {dict(zip(heads, vals))} disagree")
        desc = card.find("k10-recipe__desc")
        ingredients = [tk._clean(n.text()) for n in card.find_all("k10-recipe__ingredient-name")]
        lines = tk._dietary_lines(card.find("k10-recipe__label-names-wrapper"))
        recs.append({
            "section": tuple(tk.course_path(w)), "name": name, "desc": tk._clean(desc.text()) if desc else "",
            "nutrients": nutrients, "ingredients": ingredients, "has_card": has_card,
            "allergen_src": {"marks": _marks(row, name), "marks_all": True, **lines, **tk._label_ids(row)},
            "label_map": labels,
        })
    return recs


# ---------------------------------------------------------------- building items

def tags_and_text(name: str, desc: str, ingredients: list) -> tuple:
    """(tags, conflict): vegetarian only when the dish's own name says Vegan/Veggie/Vegetarian; contains_pork / contains_beef
    only when the name, description or ingredient names say so."""
    text = " ".join([name, desc] + ingredients)
    veg = bool(DIET.search(name))
    tags, conflict = tk.diet_tags(text, veg)
    if NDUJA.search(text) and "contains_pork" not in tags.split("|"):
        if veg:
            return "", "named vegetarian but its own text names n'duja: no diet tags given"
        tags = "|".join(x for x in [tags, "contains_pork"] if x)
    return tags, conflict


def dish_key(rec: dict, vals: dict, allergens: "dict | None") -> tuple:
    return (tk.norm_name(rec["name"]), tuple(vals.get(k, "") for k in KEY_COLS), tk._allergen_key(allergens))


def make_item(rec: dict, vals: dict, allergens: dict, category: str, rankable: bool) -> dict:
    name = rec["name"]
    shown, serving = name, ""
    m = SERVING.search(name)
    if m:
        shown, serving = name[:m.start()].strip(), m.group(1)
    tags, conflict = tags_and_text(name, rec["desc"], rec["ingredients"])
    return {
        "id": slug(tk.fold(shown)), "name": shown, "printed": name, "category": category, "serving": serving,
        **{k: vals.get(k, "") for k in KEY_COLS}, "tags": tags, "rankable": rankable,
        "allergens": allergens, "_where": [" > ".join(rec["section"])], "_conflict": conflict, "_desc": rec["desc"],
    }


def build(pages: Path):
    recs = read_dishes((pages / "megans_all.html").read_text(encoding="utf-8", errors="replace"))
    if len(recs) != EXPECTED_ROWS:
        raise SystemExit(f"The All page holds {len(recs)} dish rows but this script was written for {EXPECTED_ROWS}: the menu changed, "
                         "re-check SECTIONS, HOLDBACK and the exclusions, then update EXPECTED_ROWS.")
    # what the section pages print: normalised name -> {(name, numbers, allergens)} and the page it came from
    tab_keys: dict = {}
    tab_dishes: dict = {}
    for tabname, _, path in tab_files(pages):
        for r in read_dishes(path.read_text(encoding="utf-8", errors="replace")):
            vals = tk.printed_values(r)
            if not tk.has_required(vals):
                continue
            a = tk.allergens_from_rec(r, f"{tabname} {r['name']}")
            if a is None:
                raise SystemExit(f"{tabname} {r['name']}: allergen columns incomplete")
            k = dish_key(r, vals, a)
            tab_keys.setdefault(k[0], set()).add(k)
            tab_dishes.setdefault(k[0], (r, vals, a, tabname))

    kept: dict = {}          # normalised name -> item
    unpublished: list = []   # dishes printed with '-' for nutrition
    venue: list = []
    for r in recs:
        name, section = r["name"], r["section"]
        if section not in SECTIONS:
            raise SystemExit(f"unmapped section {' > '.join(section)!r}: add it to SECTIONS after checking the page")
        why = venue_only(name, r["desc"])
        if why:
            venue.append((name, why))
            continue
        vals = tk.printed_values(r)
        if not tk.has_required(vals):
            if any(vals.get(k, "") != "" for k in KEY_COLS):
                raise SystemExit(f"{name}: some but not all of calories/protein/carbs/fat printed: {vals}")
            unpublished.append((name, " > ".join(section)))
            continue
        if not r["has_card"]:
            raise SystemExit(f"{name}: numbers printed in the row but the dish has no nutrition card to compare them with")
        allergens = tk.allergens_from_rec(r, name)
        if allergens is None:
            raise SystemExit(f"{name}: allergen columns incomplete")
        category, rankable = SECTIONS[section]
        item = make_item(r, vals, allergens, category, rankable)
        key = dish_key(r, vals, allergens)
        item["_key"] = key
        norm = key[0]
        if norm in kept:
            first = kept[norm]
            if first["_key"] != key:
                raise SystemExit(f"{item['name']!r} is printed twice with different numbers or allergens ({' / '.join(first['_where'])} "
                                 f"and {' > '.join(section)}): decide how to name them, then extend this script")
            first["_where"].append(" > ".join(section))
            continue
        kept[norm] = item
    items = list(kept.values())

    # Dishes printed on a section page only (food and soft drinks; alcohol is not extracted): held back too.
    tab_only = []
    for norm, (r, vals, a, tabname) in tab_dishes.items():
        if norm in kept or venue_only(r["name"], r["desc"]) or r["section"][0] in ALCOHOL_TOPS:
            continue
        if any(norm == tk.norm_name(n) for n, _ in venue):
            continue
        section = r["section"]
        category, rankable = TAB_SECTIONS.get(section) or SECTIONS.get(section) or (None, None)
        if category is None:
            raise SystemExit(f"{tabname}: section {' > '.join(section)!r} of {r['name']!r} (printed only on that page) is not mapped: "
                             "add it to TAB_SECTIONS")
        item = make_item(r, vals, a, category, rankable)
        item["_key"] = dish_key(r, vals, a)
        item["_where"] = [f"section page {tabname}"]
        tab_only.append(item)
    items += tab_only

    holdback = []
    printed = {r["name"] for r in recs}
    stale = [n for n in HOLDBACK if n not in printed]
    if stale:
        raise SystemExit(f"HOLDBACK names no longer on the All page (it changed): {stale}")
    by_printed = {i["printed"]: i for i in items}
    for n, why in HOLDBACK.items():
        if n in by_printed:
            holdback.append((by_printed[n]["id"], why))
    held_ids = {i for i, _ in holdback}
    disagree = []
    for it in items:
        if it["id"] in held_ids:
            continue
        keys = tab_keys.get(it["_key"][0], set())
        if it in tab_only:
            holdback.append((it["id"], TAB_ONLY))
            disagree.append(it["name"])
        elif it["_key"] in keys:
            continue
        elif keys:
            theirs = sorted(k[1] for k in keys)
            holdback.append((it["id"], f"the All page and the section page print different numbers or allergens for it (All: {it['_key'][1]}; section: {theirs[0]})"))
            disagree.append(it["name"])
        else:
            holdback.append((it["id"], ALL_ONLY))
            disagree.append(it["name"])

    for it in items:
        notes = []
        if it["_conflict"]:
            notes.append(it["_conflict"])
        if len(it["_where"]) > 1:
            notes.append("also printed under: " + "; ".join(it["_where"][1:]))
        if it["_desc"] and not it["_desc"].isupper() and len(it["_desc"]) < 40:
            notes.append("page note: " + it["_desc"])
        it["notes"] = "; ".join(notes)
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two items share an id: extend the naming")
    return items, holdback, unpublished, venue, disagree


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path(tempfile.gettempdir()) / "megans-pages")
    ap.add_argument("--fetch", action="store_true", help="download missing pages into --pages (All + 21 section pages)")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    items, holdback, unpublished, venue, disagree = build(args.pages)
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Megan's", cuisine="Middle Eastern", source_title=SOURCE_TITLE % args.checked_on,
        source_url=URL, checked_on=args.checked_on, aliases=["megans", "megan's", "megans restaurant", "megan's restaurant"],
        items=items, out=args.out, note=NOTE, holdback=holdback,
        allergen_guide={"title": ALLERGEN_TITLE % args.checked_on, "url": URL, "checked_on": args.checked_on, "may_contain_published": True},
    )
    print(f"sha256 {sha256_file(args.pages / 'megans_all.html')}  megans_all.html")
    for name, _, path in tab_files(args.pages):
        print(f"sha256 {sha256_file(path)[:16]}  {name}")
    held = {i for i, _ in holdback}
    print(f"All page: {EXPECTED_ROWS} printed rows; {len(unpublished)} printed with '-' (nutrition not published); "
          f"{len(venue)} single-venue rows left out")
    for n, why in venue:
        print(f"  venue-only: {n} ({why})")
    print(f"items written {len(items)}; held back {len(held)}; published {len(items) - len(held)}")
    print("where the All page and the section pages disagree:", disagree)
    print("held back for other reasons:", sorted(i for i, why in holdback if why not in (ALL_ONLY, TAB_ONLY)))
    by_section: dict = {}
    for n, s in unpublished:
        top = s.split(" > ")[0]
        by_section[top] = by_section.get(top, 0) + 1
    print("not published (no figures), by section:", by_section)
    print(f"wrote {len(items)} items to {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
