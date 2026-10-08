#!/usr/bin/env python3
"""Build data/source/fishworks/ from Fishworks' own "dietary information" page (hosted by Ten Kites). A CALORIES-ONLY chain.

    python3 -I tools/uk_extract/fishworks.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://menus.tenkites.com/brg/fishworks. Both Fishworks restaurants (Covent Garden and Marylebone, the only two on
www.fishworks.co.uk) link this one page as "View our dietary information", and both link the same "A La Carte Menu" PDF (September
2025), so the page is the chain's one allergen and calorie page for both: there is no per-restaurant difference to reconcile. The page
holds one menu, "A La Carte Menu" (49 dishes in 8 sections), and shows no date (the file name it gives itself,
FishworksEATIN-ALaCarteMenu_<day of the request>.pdf, is just the day it was served), so the source title says
"accessed <date>, no date shown". robots.txt of menus.tenkites.com disallows only /fonts/, /views/ and /*.less$ (read with
robots_rfc.py before the download). The page is saved once into --pages as fishworks.html (--fetch; one request).

WHAT IS PRINTED. Each dish prints its calories beside the name ("718 kcal") and nothing else numeric: the page's own notice says
"Nutritional information including calories is calculated using typical weights and measures". The nutrient block inside every
dish's pop-over is empty (the reader stops if it ever has content). There is no protein, carbohydrate, fat, salt, sugar, fibre,
kJ or weight, so those columns stay blank (never 0) and the chain is calories-only (docs/DATA.md). `serving` is blank: the page states no
basis beyond "as served". A thousands comma is dropped ("1,003" -> 1003); nothing else is changed.

NOT ON THE PAGE (so not in the app): the dessert, small plates, set, weekend/lunch, gluten-free and kids' menus and the drinks list,
which the restaurants publish only as PDFs without calories.

ALLERGENS are complete for every published dish and are read from the same page: the pop-over's "Contains" icons (cereals and tree nuts
named in brackets) and its "Dish ingredients may also contain" line, checked against the label ids the page's own allergen filter reads
and against the page's Dietary Needs dialog (fishworks_pages.py); the run stops if they ever disagree. A dish with no allergen icon is
accepted only because the page marks it Vegan (olives, tenderstem broccoli, chips). Named cereals/nuts are published for "Contains" only;
where a key is both contained and "may also contain" (wheat contained, oats possible) the generic allergen is shown as contained and
the named kinds are dropped (common.write_allergens), so the may-contain of the other kinds is not hidden.

CHOICES (all logged in the report; none touches a number):
- Names: as printed, except that dishes the page prints under one name twice are told apart by the page's own description (the oysters
  "Served with Shallot vinegar" / "Served with pickled cucumber", the two sourdough breads, the two Dover soles), "(Large)" -> "(large)"
  and the page's typo "Lindidfarne" -> "Lindisfarne" (a name, not a number; the sibling rows spell it correctly).
- Tags: vegetarian when the page's own icon says Vegetarian or Vegan. contains_pork / contains_beef only when the dish's name or
  description says so (the ribeye and sirloin steak are beef).
- Held back (HOLDBACK, holdback.csv): rows the page contradicts with its own figures or marks. Never corrected; restoring one is
  deleting its line in holdback.csv.
"""
from __future__ import annotations
import argparse
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fishworks_pages as fp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "fishworks"
URL = "https://menus.tenkites.com/brg/fishworks"
PAGE_FILE = "fishworks.html"
EXPECTED_DISHES = 49
SOURCE_TITLE = "Fishworks dietary information: A La Carte Menu on Ten Kites (accessed {checked}, no date shown)"
ALLERGEN_TITLE = "Fishworks allergy and dietary information: A La Carte Menu on Ten Kites (accessed {checked}, no date shown)"
NOTE = ("Calories only, per dish as served, worked out by Fishworks from typical weights and measures; no protein, carbs or fat are "
        "published. The page both restaurants link has only the A La Carte menu (no desserts, set, lunch, kids' or drinks). Five dishes "
        "whose figures contradict each other are left out.")
assert len(NOTE) < 400, len(NOTE)
# printed section -> category shown in the app. A new section stops the run so a human places it.
CATEGORIES = {
    "ON ARRIVAL": "On arrival", "ROCK OYSTERS": "Rock oysters", "STARTERS": "Starters",
    "SEAFOOD PLATTERS TO SHARE": "Seafood platters to share", "SIDES": "Sides", "LOBSTER AND CRAB": "Lobster and crab",
    "FISH & CHIPS": "Fish & chips", "MAINS": "Mains",
}
# Names the page prints for two different dishes: told apart by the page's own description (printed name, description) -> name shown.
SAME_NAME = {
    ("Oven-baked sourdough breads", "With freshly made aioli and salsa verde"): "Oven-baked sourdough breads (with freshly made aioli and salsa verde)",
    ("Oven-baked sourdough breads", "With our homemade taramasalata"): "Oven-baked sourdough breads (with our homemade taramasalata)",
    ("6 Jersey Oysters", "Served with Shallot vinegar"): "6 Jersey Oysters (with shallot vinegar)",
    ("12 Jersey Oysters", "Served with Shallot vinegar"): "12 Jersey Oysters (with shallot vinegar)",
    ("6 Carlingford Oysters", "Served with Shallot vinegar"): "6 Carlingford Oysters (with shallot vinegar)",
    ("12 Carlingford Oysters", "Served with Shallot vinegar"): "12 Carlingford Oysters (with shallot vinegar)",
    ("6 Lindisfarne Oysters", "Served with Shallot vinegar"): "6 Lindisfarne Oysters (with shallot vinegar)",
    ("12 Lindisfarne Oysters", "Served with Shallot vinegar"): "12 Lindisfarne Oysters (with shallot vinegar)",
    ("6 Jersey Oysters", "Served with pickled cucumber"): "6 Jersey Oysters (with pickled cucumber)",
    ("12 Jersey Oysters", "Served with pickled cucumber"): "12 Jersey Oysters (with pickled cucumber)",
    ("6 Carlingford Oysters", "Served with pickled cucumber"): "6 Carlingford Oysters (with pickled cucumber)",
    ("12 Carlingford Oysters", "Served with pickled cucumber"): "12 Carlingford Oysters (with pickled cucumber)",
    ("6 Lindisfarne Oysters", "Served with pickled cucumber"): "6 Lindisfarne Oysters (with pickled cucumber)",
    ("12 Lindisfarne Oysters", "Served with pickled cucumber"): "12 Lindisfarne Oysters (with pickled cucumber)",
    ("Day-boat Dover sole", "Served on the bone, simply grilled with lemon and parsley butterMarket Price"):
        "Day-boat Dover sole (simply grilled with lemon and parsley butter)",
    ("Day-boat Dover sole", "Served on the bone, pan-fried à la MeunièreMarket Price"): "Day-boat Dover sole (pan-fried à la Meunière)",
}
NAME_FIXES = {"12 Lindidfarne Oysters": "12 Lindisfarne Oysters"}   # the page's own typo; the five sibling rows spell it Lindisfarne
OYSTER_PAIR = ("the page prints {six} kcal for 6 and {twelve} kcal for 12 of the same oyster with the same dressing, and twelve oysters cannot have "
               "about the same calories as six (the Carlingford and Lindisfarne sets print 309 for 6 and 598 for 12); the page does not say which "
               "figure is wrong, so neither is published")
HOLDBACK = {   # display name -> reason
    "6 Jersey Oysters (with shallot vinegar)": OYSTER_PAIR.format(six=240, twelve=243),
    "12 Jersey Oysters (with shallot vinegar)": OYSTER_PAIR.format(six=240, twelve=243),
    "6 Jersey Oysters (with pickled cucumber)": OYSTER_PAIR.format(six=252, twelve=249),
    "12 Jersey Oysters (with pickled cucumber)": OYSTER_PAIR.format(six=252, twelve=249),
    "Fruits de Mer with half a fresh lobster": (
        "193 kcal is printed for the platter 'with half a fresh lobster' but 961 kcal for the same Fruits de Mer without it (the A La Carte "
        "menu sells the lobster as an add-on), and a platter plus a lobster cannot have fewer calories; its allergen row also lists only "
        "crustaceans (no molluscs, though the description names mussels, clams and oysters, which the plain platter's row marks)"),
}
# Kept as printed but worth a look (notes column only, never exported).
ODD = {
    "Whole lobster thermidor": "408 kcal printed, fewer than the 834 printed for the Whole Lobster steamed or grilled with garlic butter; nothing on the page contradicts it",
    "Fishworks Tasting Platter for Two": "the figure is for a platter for two, as the name says",
    "Fruits de Mer": "the page prints 193 kcal for the same platter 'with half a fresh lobster' (held back); this row is not contradicted by anything else",
}
NOT_VEGETARIAN = {"fish", "crustaceans", "molluscs"}
NOT_VEGAN = NOT_VEGETARIAN | {"milk", "eggs"}
UNSTATED = re.compile(r"\b(meat|mince|minced|meatballs?|burgers?|patty|sausages?|bacon|ham|kebabs?)\b", re.I)


def item_id(name: str) -> str:
    """'Moules Marinières (large)' -> 'moules-marinieres-large' (accents folded, as caravan.py does)."""
    return slug("".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c)))


def tidy_name(printed: str) -> str:
    n = " ".join(printed.replace("ㅤ", " ").split())
    return re.sub(r"\(Large\)$", "(large)", n)


def build(pages: Path):
    text = (pages / PAGE_FILE).read_text(encoding="utf-8")
    if fp.page_title(text) != "A La Carte Menu":
        raise SystemExit(f"the page is titled {fp.page_title(text)!r}, expected 'A La Carte Menu': the menu changed, re-check before running again")
    rows = fp.read_dishes(text)
    if len(rows) != EXPECTED_DISHES:
        raise SystemExit(f"the page prints {len(rows)} dishes but this script expects {EXPECTED_DISHES}: the menu changed, re-check "
                         "SAME_NAME, HOLDBACK, ODD and the count before running again.")
    report, items, shown = [], [], {}
    for r in rows:
        if r["name"] in NAME_FIXES:
            report.append(f"typo in the page's name corrected: {r['name']!r} -> {NAME_FIXES[r['name']]!r}")
            r["printed_name"] = r["name"]
            r["name"] = NAME_FIXES[r["name"]]
    counts: dict = {}
    for r in rows:
        counts[r["name"]] = counts.get(r["name"], 0) + 1
    for r in rows:
        if r["section"] not in CATEGORIES:
            raise SystemExit(f"New section {r['section']!r}: add it to CATEGORIES.")
        key = (r["name"], r["desc"])
        if counts[r["name"]] > 1:
            if key not in SAME_NAME:
                raise SystemExit(f"{r['name']!r} is printed for more than one dish and {key!r} is not in SAME_NAME: add it after reading the page")
            name = SAME_NAME[key]
            report.append(f"same printed name on different dishes, told apart by the description: {r['name']!r} -> {name!r} ({r['kcal']} kcal)")
        else:
            name = tidy_name(r["name"])
        shown[name] = r
        al = fp.allergens(r, f"{r['section']} > {r['name']}")
        veg = r["vegetarian"] or r["vegan"]
        tags = ["vegetarian"] if veg else []
        meat, _ = tk.meat_tags(r["name"], r["desc"], vegetarian=veg)
        tags += meat
        if not veg and not meat and UNSTATED.search(r["name"] + " " + r["desc"]):
            report.append(f"meat type not stated: {name}")
        notes = [f"Printed {r.get('printed_name', r['name'])!r} under {r['section']}, '{r['energy']}'" + (f", described '{r['desc']}'" if r["desc"] else "")]
        bad = NOT_VEGAN if r["vegan"] else NOT_VEGETARIAN
        if veg and (set(al["contains"]) & bad):
            msg = f"{'Vegan' if r['vegan'] else 'Vegetarian'} icon but contains {sorted(set(al['contains']) & bad)}"
            notes.append(msg)
            report.append(f"{name}: {msg}")
        if name in ODD:
            notes.append(ODD[name])
            report.append(f"odd (kept as printed): {name}: {ODD[name]}")
        items.append({"id": item_id(name), "name": name, "category": CATEGORIES[r["section"]], "serving": "", "calories": r["kcal"],
                      "tags": "|".join(tags), "rankable": False, "notes": "; ".join(notes), "allergens": al})
    slugs = [i["id"] for i in items]
    if len(set(slugs)) != len(slugs):
        raise SystemExit(f"item ids still not unique: {sorted({s for s in slugs if slugs.count(s) > 1})}")
    gone = sorted(set(HOLDBACK) - set(shown))
    gone += sorted(set(ODD) - set(shown))
    if gone:
        raise SystemExit(f"HOLDBACK / ODD name dishes that are no longer on the page: {gone}. The menu changed: re-check the tables.")
    holdback = [(item_id(n), why) for n, why in HOLDBACK.items()]
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or to receive, with --fetch) fishworks.html")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was downloaded")
    ap.add_argument("--fetch", action="store_true", help="download the page into --pages first (one request, after reading robots.txt)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.pages.mkdir(parents=True, exist_ok=True)
        fp.fetch(URL, args.pages / PAGE_FILE)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Fishworks", cuisine="Seafood", source_title=SOURCE_TITLE.format(checked=args.checked_on),
        source_url=URL, checked_on=args.checked_on, aliases=["fishworks", "fishworks restaurant", "fishworks restaurants"],
        items=items, out=args.out, note=NOTE, holdback=holdback, nutrition_level="calories",
        allergen_guide={"title": ALLERGEN_TITLE.format(checked=args.checked_on), "url": URL, "checked_on": args.checked_on,
                        "may_contain_published": True})
    print(f"{PAGE_FILE} sha256 {tk.sha256_text_file(args.pages / PAGE_FILE)}")
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"wrote {len(items)} items ({len(holdback)} held back, {len(items) - len(holdback)} published) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
