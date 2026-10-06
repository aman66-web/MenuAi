#!/usr/bin/env python3
"""Build data/source/hickorys/ from Hickory's own menu page with nutrition (hosted by Ten Kites).

    python3 tools/uk_extract/hickorys.py --pages DIR --checked-on 2026-10-06 [--fetch]

DIR holds the six saved tabs of https://menus.tenkites.com/hickorys/hickorys03 (the page the official hickorys.co.uk
menus page loads): Food, Brunch, Desserts, Kids, Drinks and Non-Gluten. --fetch downloads them first (one request per
second). Numbers are copied from each dish's "Nutrition (per portion)" table exactly as printed (kcal, protein, carb,
sugars, fat, saturates, salt; fibre is not printed). A dish with choices ("with Fries" / "with Salad", sauces, sizes) has
one printed table per choice; each choice is one item. Only names, categories and the choices below are typed by hand.
If a tab gains or loses dishes, or a new section appears, the run stops so a human re-checks.

Left out on purpose: the "Smokin' Deals" tab (bundles with drinks, wine and sharing trays), alcoholic drinks (the serve
size is not stated and the printed kcal includes alcohol energy that is not in the macro columns), and drinks whose
table is printed as "-".
"""
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "hickorys"
BASE = "https://menus.tenkites.com/hickorys/hickorys03"
PAGES = {  # tab -> (file, url, dishes/choices expected on the tab)
    "food": ("hickorys.html", BASE, 88),
    "brunch": ("hickorys_brunch.html", BASE + "?mguid=2e489b83-106e-454b-95b3-6d6acc6bf03c", 21),
    "desserts": ("hickorys_desserts.html", BASE + "?mguid=0748a2f7-bc8f-4a9f-b098-e9081083ca77", 11),
    "drinks": ("hickorys_drinks.html", BASE + "?mguid=b9bace70-7eff-40f5-a56a-6191d5bb0db1", 106),
    "kids": ("hickorys_kids.html", BASE + "?mguid=38b7c19e-6c9e-47a5-915c-064080b2df5a", 42),
    "nongluten": ("hickorys_nongluten.html", BASE + "?mguid=d9baafab-60f3-4f97-94aa-f1e4bd156222", 67),
}
# (tab, first printed section) -> category shown
CATEGORY = {
    ("food", "Appetisers"): "Appetisers", ("food", "The Smokehouse"): "The Smokehouse", ("food", "Steaks"): "Steaks",
    ("food", "Burgers"): "Burgers", ("food", "Mains"): "Mains", ("food", "Lighter & Loaded"): "Lighter & loaded",
    ("food", "On The Side"): "On the side",
    ("brunch", "Food"): "Brunch", ("brunch", "Drinks"): "Drinks",
    ("desserts", "Desserts"): "Desserts",
    ("nongluten", "Brunch"): "Brunch", ("nongluten", "Appetisers"): "Appetisers", ("nongluten", "The SmokeHouse"): "The Smokehouse",
    ("nongluten", "Burgers & Mains"): "Mains", ("nongluten", "Lighter & Loaded"): "Lighter & loaded",
    ("nongluten", "On The Side"): "On the side", ("nongluten", "Desserts"): "Desserts",
}
KIDS_FIRST = {"Brunch", "Appetisers", "Mains", "Sides", "Desserts", "Drinks"}
ALCOHOL_SECTIONS = {"Cocktails", "Wine", "Beer and Cider", "Spirits"}
ALCOHOL_NAMES = {"Boozy Root Beer Float", "Bloody Mary"}
DRINK_KIND = {"Classic Shakes": "classic shake", "Freakshakes": "freakshake", "Slushie": "slushie"}
GENERIC_GROUPS = {"Enjoy:", "Choose from:", "Enjoy with:"}
# not an order on their own
NOT_RANKABLE = {"Pot of Tennessee Bourbon Gravy": "a sauce", "The Southern Sharer": "a sharing tray",
                "The Smokehouse Platter": "a sharing platter"}
NOTES = {"The Southern Sharer": "Described as a loaded tray to share",
         "The Smokehouse Platter": "Described as 'Ideal for 2 to share'",
         "Classic Corn Dogs": "Described as 'Minimum serve of 2'; chosen by number"}
SOURCE_TITLE = "Hickory's Smokehouse menu with nutrition: Food, Brunch, Desserts, Kids, Drinks and Non-Gluten (live page, no date printed; read 2026-10-06)"
NOTE = ("Figures are per portion from Hickory's own menu page (hosted by Ten Kites), which prints no date. Alcoholic drinks and "
        "the Smokin' Deals bundles are not included; the Non-Gluten menu only adds dishes whose numbers differ.")


def compose(dish: str, group: str, choice: str) -> str:
    """Item name from the printed dish, the choice group and the choice ('Texas Style Brisket' + 'with Fries')."""
    if not choice:
        return dish
    if dish.endswith("?"):  # 'Pan Cake or Waffle?' > 'The Chicken Coop' > 'Pan Cake'
        return f"{group} ({choice})"
    if not group:  # a dish whose choices have no heading ('Pan Cakes' > 'Maple')
        return f"{dish} ({choice})"
    if group in GENERIC_GROUPS:
        if group == "Enjoy with:":
            return f"{dish} with {choice}"
        return f"{dish} {choice}" if choice.startswith("with ") else f"{dish} ({choice})"
    return f"{dish} ({group}) {choice}" if choice.startswith("with ") else f"{dish} ({group}, {choice})"


def qualify(name: str, word: str) -> str:
    """'Muffins (Bacon)' + 'gluten free' -> 'Muffins (Bacon, gluten free)'."""
    return f"{name[:-1]}, {word})" if name.endswith(")") else f"{name} ({word})"


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report, items, left_out = [], [], {"alcoholic drinks": 0, "printed '-'": 0}
    ng_dropped: list[str] = []
    by_numbers: dict[tuple, str] = {}
    for tab, (fname, _, expected) in PAGES.items():
        rows = tk.read_modal_layout((pages_dir / fname).read_text(encoding="utf-8"))
        if len(rows) != expected:
            raise SystemExit(f"{fname} has {len(rows)} dishes/choices but this script expects {expected}: the menu changed, "
                             "re-check CATEGORY and the expected counts before running again.")
        for r in rows:
            first = r["section"].split(" > ")[0]
            sub = r["section"].split(" > ")[-1]
            if tab == "kids":
                if first not in KIDS_FIRST:
                    raise SystemExit(f"{fname}: new section {first!r}: add it to KIDS_FIRST.")
                category = "Kids"
            elif tab == "drinks":
                category = "Drinks"
            elif (tab, first) in CATEGORY:
                category = CATEGORY[(tab, first)]
            else:
                raise SystemExit(f"{fname}: new section {r['section']!r}: add ({tab!r}, {first!r}) to CATEGORY.")
            name = compose(r["dish"], r["group"], r["choice"])
            if sub in DRINK_KIND and tab in ("drinks", "kids", "brunch"):
                name = f"{name} ({DRINK_KIND[sub]})"
            if first in ALCOHOL_SECTIONS or name in ALCOHOL_NAMES or r["dish"] in ALCOHOL_NAMES:
                left_out["alcoholic drinks"] += 1
                continue
            nums, missing = tk.numbers(r["nutrients"], f"{fname} {name}")
            if missing:
                left_out["printed '-'"] += 1
                report.append(f"left out {name!r}: {missing} not printed")
                continue
            shown = re.sub(r"[^\d.]", "", r["energy_shown"])
            if shown and shown != nums["calories"]:
                report.append(f"{name}: kcal shown beside the dish ({r['energy_shown']}) differs from the table ({nums['calories']})")
            vegetarian = bool(re.search(r"vegetarian|vegan", r["suitable"], re.I))
            meat, unspecified = tk.meat_tags(name, r["desc"], vegetarian=vegetarian)
            if unspecified:
                report.append(f"meat type not stated: {name}")
            key = tuple(nums[k] for k in tk.LABELS)
            if tab == "nongluten":
                if key in by_numbers:
                    ng_dropped.append(f"{name!r} = {by_numbers[key]!r}")
                    continue
                name = qualify(name, "gluten free")
            elif key in by_numbers and by_numbers[key] == name:
                report.append(f"dropped exact duplicate: {name} ({tab})")
                continue
            if any(i["name"] == name for i in items) and tab == "kids":
                name = qualify(name, "kids")
            by_numbers.setdefault(key, name)
            rankable = (r["dish"] not in NOT_RANKABLE and category not in ("Desserts", "Drinks")
                        and not (tab == "kids" and first in ("Desserts", "Drinks")))
            items.append({"id": slug(name), "name": name, "category": category, "serving": "", **nums,
                          "tags": "|".join((["vegetarian"] if vegetarian else []) + meat), "rankable": rankable,
                          "notes": NOTES.get(r["dish"], "")})
    report.append(f"dropped {len(ng_dropped)} Non-Gluten rows whose numbers equal a row already kept (e.g. {'; '.join(ng_dropped[:3])})")
    report += [f"left out {n} {why}" for why, n in left_out.items() if n]
    report.append("left out the Smokin' Deals tab (6 bundles with drinks, wine and sharing trays)")
    names = [i["name"] for i in items]
    for it in items:
        extra = tk.annotate(it)
        if names.count(it["name"]) > 1:
            extra.append("Another row has this name with different numbers; both are kept")
        if extra:
            it["notes"] = "; ".join(filter(None, [it["notes"], *extra]))
            report += [f"{it['name']}: {n}" for n in extra]
    return items, impossible_rows(items), report


def impossible_rows(items: list[dict]) -> list[tuple[str, str]]:
    """Rows whose own numbers cannot be right (as Burger King's 'Big King' in that chain's holdback): the printed calories
    are far from what the printed protein, carbohydrate and fat add up to (4/4/9 kcal per gram). They are not corrected:
    they are held back (holdback.csv) until the chain fixes its page. Alcohol is not in this chain's list, so a large gap
    cannot be alcohol energy."""
    out = []
    for it in items:
        kcal, protein, carbs, fat = (float(it[k]) for k in ("calories", "protein_g", "carbs_g", "fat_g"))
        est = 4 * protein + 4 * carbs + 9 * fat
        if est > 2 * kcal + 25 or kcal > 1.4 * est + 25:
            out.append((it["id"], f"The page prints {it['calories']} kcal; its own protein, carbohydrate and fat add up to about {est:.0f} kcal."))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the pages with the live menu")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for fname, url, _ in PAGES.values():
            tk.fetch(url, args.pages / fname)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Hickory's Smokehouse", cuisine="Barbecue", source_title=SOURCE_TITLE,
                             source_url=BASE, checked_on=args.checked_on, aliases=["hickorys", "hickory's", "hickorys smokehouse",
                                                                                   "hickory's smokehouse"],
                             items=items, out=args.out, note=NOTE, holdback=holdback)
    for fname, _, _ in PAGES.values():
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
