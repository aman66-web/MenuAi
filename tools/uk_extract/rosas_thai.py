#!/usr/bin/env python3
"""Build data/source/rosas-thai/ from Rosa's Thai's own allergen and calorie page (a CALORIES-ONLY chain with complete allergens).

    python3 tools/uk_extract/rosas_thai.py --checked-on 2026-10-07 [--pages DIR] [--fetch] [--out DIR]

Source: https://viewthe.menu/dy2v  (the "Rosa's Thai Nutritional Info" link on https://rosasthai.com/nutrition, which says the data
"has been compiled by a third-party health & safety company, Surefoot Solutions"). It is a 10kites page ("Digital Output London",
"Allergen Page"); each menu is the same URL with ?mguid=<menu id>. --fetch saves the three published menus into --pages
(All Day, Desserts, Drinks), one request per second with a browser User-Agent (robots.txt of viewthe.menu disallows only /fonts/,
/views/ and /*.less); without --fetch the saved pages are read. The page has no date: "accessed <checked-on>, no date shown".
Python 3.9 compatible; standard library only.

What the page prints, per dish row: the dish name with "(N kcal)", the 14 allergen columns (a tick = contains, M = may contain),
spice / diet / "new" flags, and (in a hidden info card) "Contains:" / "May contain:" lines naming the cereals and tree nuts, a
"Suitable for:" line, a description and the ingredient text. No protein, carbs, fat, kJ, salt or weights are printed anywhere
(the page's own setting is ShowNutrients=false), so this is a calories-only chain (docs/DATA.md "Calories-only chains"): only
`calories` is copied, copied as printed ("1,195 kcal" -> 1195). The page does not state a portion basis: the number is for the
dish as it is listed (a platter for 2 is the whole platter); the chain's note says so.

Allergens are read in three printed forms that must agree for every dish (tenkites_b.allergens_from_rec): the 14 columns, the card's
Contains / May contain lines, and the dish's label ids; as a fourth check the number of cereal / tree-nut label ids equals the number
of kinds the lines name. Any disagreement or unknown label stops the run.

Scope (what is published and what is not; the run stops if a menu list, a row count or a section changes):
  published   All Day Menu, Desserts, Drinks: the single dishes and drinks sold on their own.
  left out    Saiphin's Set Lunch, Thai Feast Menu, Unlimited Classic curries (set menus and an offer: dishes are choices inside a
              set price; several print a base row with its own calories above "Choose from:" options, so it can't be told whether an
              option's calories include the base: nothing is guessed), Little Rosa's (kids set meals: "Pick one / Pick two",
              "All meals served with pumpkin crackers 37 kcal" is a note, not a dish) and Condiments (prints no calories).
  Names      as printed, with the dish type added only where the page nests an option under a main row ("Green Curry" -> "Green Curry -
             Chicken"; "Tom Yum Noodle Soup" -> "... - Veg & Tofu"; the Ice Cream Bun's flavours; a wine's 175ml / carafe / bottle).
  not listed  rows the page prints no calories for (Home-Brewed Thai Tea with Tapioca, Singha Bottle, Rosa's G&T, Cintila's three sizes).
  held back   Singha (half pint) and Singha (pint): printed 0 kcal for a lager while the same page prints 66 and 132 kcal for two other
              330 ml beers (holdback.csv; nothing is corrected).
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tb  # noqa: E402
import rosas_thai_pages as rp  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "rosas-thai"
BASE_URL = "https://viewthe.menu/dy2v"
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")

# The menu drop-down on every page, in its own order: guid -> printed name. A different list stops the run.
MENU_LIST = [
    ("cf40f4bc-e882-4a90-bf97-009deed70fae", "All Day Menu เมนูอาหาร"),
    ("5f79280c-f2e3-4d98-8e60-65f7da65be13", "Desserts ของหวาน"),
    ("82f6504c-4e6f-42fe-b299-15e1288ad9b6", "Drinks ดื่มเย็นๆ"),
    ("18a725fa-1b21-48a0-9186-bd1022a9c513", "Saiphin's Set Lunch มื้อเที่ยงของสายพิญ"),
    ("f4d7915f-3d27-4b4c-a8b2-17e7ecafe0a3", "Little Rosa's"),
    ("19b8bb58-047e-4e76-931c-8d4b4fc869e5", "Thai Feast Menu"),
    ("af7fe8d5-5b63-43d2-8236-b83a4fa3de3c", "Unlimited Classic curries"),
    ("c0c79af2-f216-40e3-8b8b-2166bb770c0f", "Condiments"),
]
# label -> (menu guid, rows expected on the page: every dish row incl. the main rows that print no calories)
PUBLISHED = {
    "allday": (MENU_LIST[0][0], 91),
    "desserts": (MENU_LIST[1][0], 9),
    "drinks": (MENU_LIST[2][0], 83),
}

# printed section path (outermost first; the innermost named section wins when there are two) -> category shown
CATEGORY = {
    "allday": {
        "Sharing Platters & Crackers": "Sharing platters & crackers", "Small Plates": "Small plates", "Salads": "Salads",
        "One Plate 'Jarn Diew'": "One plate 'Jarn Diew'", "Signature Curries": "Signature curries", "Classic Curries": "Classic curries",
        "Noodle Soups": "Noodle soups", "Stir-Fries": "Stir-fries", "Noodles": "Noodles", "Rice": "Rice", "Sides": "Sides",
    },
    "desserts": {"Thai-inspired desserts": "Thai-inspired desserts"},
    "drinks": {
        "Thai Iced Drinks": "Thai iced drinks", "Bubble Tea": "Bubble tea", "Hot Drinks": "Hot drinks", "Beers": "Beers",
        "Softs": "Softs", "Thai-Inspired Cocktails": "Thai-inspired cocktails", "Rose": "Wines: Rose", "White": "Wines: White",
        "Red": "Wines: Red", "Bubbly": "Wines: Bubbly",
    },
}
# Rows the page itself prints impossibly: left out of the published menu (never corrected), listed in the check report.
HOLDBACK = {
    "Singha (half pint)": "Printed 0 kcal for a lager, while the same page prints 66 and 132 kcal for two other 330 ml beers",
    "Singha (pint)": "Printed 0 kcal for a lager, while the same page prints 66 and 132 kcal for two other 330 ml beers",
    "Pad Thai - Veg & Tofu": "The page's own data contradict each other: the dish is flagged Vegetarian, but its allergen columns (and its Pad Thai "
                             "sauce sub-recipe, which is also flagged Suitable for Vegetarian) say it contains Molluscs. Not chosen between.",
}
NOTE = ("Rosa's Thai prints calories only, per dish as listed (no portion basis, protein, carbs or fat), on its London menu page. "
        "Drinks with no calories printed, set menus (set lunch, Thai Feast, unlimited curries), the Little Rosa's kids menu and "
        "condiments are not listed.")
ALLERGEN_TITLE = "Rosa's Thai allergen guide, London menus (viewthe.menu/dy2v, accessed {d}, no date shown)"
SOURCE_TITLE = ("Rosa's Thai Nutritional Info and allergen guide, London: All Day, Desserts and Drinks menus "
                "(viewthe.menu/dy2v, accessed {d}, no date shown)")
SIZE_WORDS = {"175ml", "125ml", "Carafe", "Bottle"}


# ---------------------------------------------------------------- fetching
def fetch_pages(dest: Path) -> None:
    """Save the three published menu pages once each (one request per second). The default page is the All Day menu."""
    dest.mkdir(parents=True, exist_ok=True)
    for label, (guid, _) in PUBLISHED.items():
        path = dest / f"{label}.html"
        url = BASE_URL if label == "allday" else f"{BASE_URL}?mguid={guid}"
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(3):  # a dropped connection is retried, still one request at a time
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    path.write_bytes(resp.read())
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(5)
        time.sleep(1.1)


# ---------------------------------------------------------------- building
def tidy(name: str) -> str:
    """Printed name with only typographic tidying: spaces collapsed, a stray trailing full stop dropped ('Cashew Stir-Fry.')."""
    return re.sub(r"\s+", " ", name).strip().rstrip(".").strip()


def wine_base(name: str) -> str:
    """'Provence Rosé Chateau de l’Aumerade | France 12.5%' -> 'Provence Rosé Chateau de l’Aumerade (France 12.5%)'."""
    m = re.fullmatch(r"(.+?) \| (.+)", name)
    return f"{m.group(1)} ({m.group(2)})" if m else name


def category_of(label: str, rec: dict) -> str:
    table = CATEGORY[label]
    for sec in reversed(rec["course"]):
        if sec in table:
            return table[sec]
    raise SystemExit(f"{label}: section {rec['course']!r} of {rec['name']!r} is not mapped: add it to CATEGORY after checking the page")


def build(pages: Dict[str, Path]) -> Tuple[List[dict], List[str], List[str]]:
    """(items, rows not listed, report lines)."""
    items: List[dict] = []
    unlisted: List[str] = []
    report: List[str] = []
    for label, (_, expected) in PUBLISHED.items():
        recs = rp.read_page(pages[label], label)
        if len(recs) != expected:
            raise SystemExit(f"{label}: the page has {len(recs)} dish rows but this script expects {expected}: the menu changed, "
                             "re-check CATEGORY, HOLDBACK and the wine handling before running again.")
        last_root: Dict[tuple, dict] = {}
        children: Dict[str, int] = {}
        for r in recs:
            if r["kind"] == "heading":
                children[r["name"]] = 0
            elif r["parent"] and r["kind"] in ("option", "root"):
                children[r["parent"]] = children.get(r["parent"], 0) + 1
        for name, n in children.items():
            if n == 0:
                raise SystemExit(f"{label}: the main row {name!r} prints no calories and has no choices under it")
        for r in recs:
            where = f"{label} {r['name']}"
            kind, name = r["kind"], tidy(r["name"])
            if kind == "root":
                last_root[tuple(r["course"])] = r  # the main row a wine's size rows follow
            if kind == "heading":
                continue  # a main row with no calories of its own: its choices carry the calories
            cat = category_of(label, r)
            serving = ""
            if label == "drinks" and sec_is_wine(r):
                if kind == "root":
                    continue  # a wine's own row repeats its Bottle calories (checked below); the sizes are the items
                root = last_root.get(tuple(r["course"]))
                if root is None:
                    raise SystemExit(f"{where}: a wine size without a wine row before it")
                if r["name"] not in SIZE_WORDS:
                    raise SystemExit(f"{where}: unknown wine size {r['name']!r}")
                name, serving = f"{wine_base(root['name'])} - {r['name']}", r["name"]
                if r["name"] == "Bottle" and r["kcal"] and root["kcal"] != r["kcal"]:
                    raise SystemExit(f"{where}: the wine row prints {root['kcal']} kcal but its Bottle prints {r['kcal']}")
            elif kind in ("option", "root") and r["parent"]:
                name = f"{tidy(r['parent'])} - {name}"
            if not r["kcal"]:
                unlisted.append(name)
                continue
            allergens = tb.allergens_from_rec(r, where)
            if allergens is None:
                raise SystemExit(f"{where}: does not carry all 14 allergen columns")
            check_kinds(r, where)
            text = " ".join([r["name"], r["parent"], r["ingredients"]])
            tags, conflict = tb.diet_tags(text, r["vegetarian"] or r["vegan"])
            note = "; ".join(x for x in (
                f"{label}: {' > '.join(r['course'])}", f"printed '{r['name']} ({r['kcal']} kcal)'" if kind != "item" else "", conflict,
                "no ingredient text on the page" if not r["ingredients"] else "") if x)
            items.append({"id": slug(tb.fold(name)), "name": name, "category": cat, "serving": serving, "calories": r["kcal"],
                          "tags": tags, "rankable": False, "notes": note, "allergens": allergens,
                          "_veg": r["vegetarian"] or r["vegan"], "_has_ingredients": bool(r["ingredients"])})
    # Cintila's three sizes print no calories: its own row (563) is then a figure with no stated size, so the wine is not listed.
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("two items share a name: extend the naming rules")
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two items share an id")
    held = [n for n in HOLDBACK if n not in names]
    if held:
        raise SystemExit(f"HOLDBACK names not on the menu any more (the pages changed): {held}")
    return items, unlisted, report


def sec_is_wine(rec: dict) -> bool:
    return bool(rec["course"]) and rec["course"][0] == "Wines"


def check_kinds(rec: dict, where: str) -> None:
    """The number of cereal / tree-nut label ids the dish carries equals the number of kinds its Contains / May contain lines name."""
    top = {i for i, n in rec["label_map"].items() if n in rp.ALLERGEN_COLUMNS}
    skip = {"50", "52", "1007", "1008", "1009", "1010", "1011", "1012"}  # diet and flag labels
    every, no_may = set(rec["ids_all"]) - skip, set(rec["ids_no_may"]) - skip

    def named(line: str) -> int:
        n = 0
        for part in tb._split_top(line):
            _, _, inner = part.partition("(")
            if inner and "other" not in inner.lower():
                n += len([x for x in inner.rstrip(")").split(",") if x.strip()])
        return n
    if len([i for i in no_may if i not in top]) != named(rec["contains"]) or len([i for i in every - no_may if i not in top]) != named(rec["may"]):
        raise SystemExit(f"{where}: the kinds of cereal / tree nut in the label ids and in the Contains / May contain lines differ")


def check_menu_list(path: Path) -> None:
    got = rp.menus_on_page(Path(path).read_text(encoding="utf-8", errors="replace"))
    if got != MENU_LIST:
        raise SystemExit(f"the page's menu drop-down changed: {got!r}\nexpected {MENU_LIST!r}\nre-read the new menus before publishing")


def content_hash(items: List[dict]) -> str:
    keep = [{k: v for k, v in i.items() if not k.startswith("_")} for i in items]
    for k in keep:
        a = k.get("allergens") or {}
        k["allergens"] = {x: sorted(a.get(x, ())) for x in ("contains", "may_contain", "cereals", "nuts")}
    return hashlib.sha256(json.dumps(keep, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path("/tmp/rosas-thai-pages"))
    ap.add_argument("--fetch", action="store_true", help="download the three menu pages into --pages first")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch:
        fetch_pages(args.pages)
    pages = {label: args.pages / f"{label}.html" for label in PUBLISHED}
    for p in pages.values():
        if not p.exists():
            print(f"{p} is missing: run with --fetch", file=sys.stderr)
            return 1
    check_menu_list(pages["allday"])
    items, unlisted, _ = build(pages)
    for it in items:
        it.pop("_veg")
        it.pop("_has_ingredients")
    guide = {"title": ALLERGEN_TITLE.format(d=args.checked_on), "url": BASE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Rosa's Thai", cuisine="Thai", source_title=SOURCE_TITLE.format(d=args.checked_on), source_url=BASE_URL,
        checked_on=args.checked_on, aliases=["rosa's thai", "rosas thai", "rosa's thai cafe", "rosas thai cafe"], items=items, out=args.out,
        note=NOTE, holdback=[(slug(tb.fold(n)), why) for n, why in HOLDBACK.items()], allergen_guide=guide, nutrition_level="calories")
    for label, p in pages.items():
        print(f"{label:9} sha256 {sha256_file(p)}  {tb.page_title(p)}")
    print(f"extracted content sha256 {content_hash(items)}")
    print("not listed (no calories printed): " + ", ".join(unlisted))
    print("\n".join(tb.ALLERGEN_NOTES))
    by_cat: Dict[str, int] = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {folder}: " + ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
