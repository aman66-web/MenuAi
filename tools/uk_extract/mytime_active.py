#!/usr/bin/env python3
"""Build data/source/mytime-active/ from Mytime Active's "Eatwell" menu PDFs (a CALORIES-ONLY chain).

    python3 tools/uk_extract/mytime_active.py DIR --fetch                     # download the 5 PDFs politely (skips files already in DIR)
    python3 tools/uk_extract/mytime_active.py DIR --checked-on 2026-10-09 [--out DIR2]

Source: https://www.mytimeactive.co.uk/our-menu ("Our Menu"; the page says "For full allergen and calorie information, download our
information pack below") links five PDFs under https://www.mytimeactive.co.uk/sites/default/files/2026-09/ (created 2026-09-25):
    Golf Menu Website.pdf            2 pages, page 2 is the menu       -> "Golf menu"      (golf courses and golf centres)
    The Pavilion Menu Website.pdf    2 pages, page 2 is the menu       -> "Pavilion menu"  (leisure centres)
    HIGH ELMS BROMLEY MENU Web.pdf   1 page (a folded menu)           -> "High Elms menu" (High Elms Golf Course, Bromley)
    Golf Menu Allergens.pdf, Leisure Menu Allergens.pdf               -> the allergen matrices (link only, see below)
robots.txt (checked with robots_rfc.py): disallows only /core/, /profiles/, /admin/, /search/, /user/... and similar CMS paths; /sites/default/files/
and /our-menu are allowed. Needs `pdftotext` and `pdfinfo` (poppler).

Each menu prints calories ONLY ("£5.95 | 571kcal" per dish, per dish as served): protein, carbs and fat are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published"). Calories are copied from the PDF by
position (mytime_active_pdf.py); only the item NAMES, categories and tags are written by hand, in the tables below, and the script stops if the
number of calorie values on a page, or the line a dish's name sits on, no longer matches the table.

Why three sets of categories ("Golf menu: ...", "Pavilion menu: ...", "High Elms menu: ..."): the menus belong to different kinds of venue and
the same dish prints different calories on different menus (Egg mayonnaise sandwich 726 on the golf menu, 612 on the Pavilion menu; Margherita
pizza 905 Pavilion, 906 High Elms). Each figure is what that menu prints, so each dish stays under its own menu and is never merged or averaged.
Not every venue serves every menu (the page lists 10 venues under "Full Menu" and "Grab 'n' Go!"), so the chain note says so.

Left out on purpose (written down, not published):
- "Golfers Breakfast Rolls & Baps" (Golf menu): six figures (Bacon 540, Sausage 820, Fried egg 846, Hash brown 679, Vegan sausage 470, Avocado 610)
  are printed once for "a bap, baguette or sandwich ... with one, two or three fillings" priced £5.25 / £6.50 / £7.50. The menu does not say
  whether a figure is for one filling or any number, nor for which bread, so there is no stated basis (the script checks this list is unchanged).
- Nothing else: every other line with a price and calories is published. Drinks, kids' snacks and smoothies appear on the allergen guides but
  print no calories on these menus, so they are not listed.

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. The two allergen matrices list recipes per bread variant ("Bacon bap", "Bacon on brown bread",
"Bacon on white bread", "Breakfast Baguette with bacon", "Cheese & ham wrap"), with different marks for brown and white bread, and they name jacket
potatoes "Baked jacket potato with cheese". The menu prints one dish for a "choice of white bread, brown bread, wrap or baguette", so no single row
is that dish. Counted 2026-10-09 (names compared ignoring case, "&" and punctuation): only 5 of the 31 golf-menu dishes (against the Golf matrix's
82 rows) and 13 of the 40 Pavilion dishes (against the Leisure matrix's 73 rows) have a row with exactly their name, and the 9 High Elms dishes
have no matrix at all. Allergens are safety information: no name matching, no guessing, no inferring, so only the guide link is published
(all or nothing). The link is the Our Menu page, which carries both matrices.

Tags: vegetarian when the dish's own line carries the menu's printed "(V)" / "(Ve)" or the word Vegan / Vegetarian in its name. contains_pork /
contains_beef when the printed name or description says pork, bacon, ham, sausage, pepperoni, salami (pork) or beef, steak (beef). "Full English
Breakfast" is not tagged: the menu does not list what is on it (meat type not stated).
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mytime_active_pdf as P  # noqa: E402
import robots_rfc  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "mytime-active"
HOST = "www.mytimeactive.co.uk"
BASE = f"https://{HOST}/sites/default/files/2026-09/"
PAGE_URL = f"https://{HOST}/our-menu"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
FILES = {  # local name -> published name
    "Golf_Menu_Website.pdf": "Golf%20Menu%20Website.pdf",
    "The_Pavilion_Menu_Website.pdf": "The%20Pavilion%20Menu%20Website.pdf",
    "HIGH_ELMS_BROMLEY_MENU_Web.pdf": "HIGH%20ELMS%20BROMLEY%20MENU%20Web.pdf",
    "Golf_Menu_Allergens.pdf": "Golf%20Menu%20Allergens.pdf",
    "Leisure_Menu_Allergens.pdf": "Leisure%20Menu%20Allergens.pdf",
}
SOURCE_TITLE = "Mytime Active Eatwell menus with calories: Golf Menu, The Pavilion Menu and High Elms | Bromley Menu (PDFs created 25 September 2026)"
ALLERGEN_GUIDE_TITLE = "Mytime Active allergen information: Golf Menu Allergens and Leisure Menu Allergens (PDFs linked from the Our Menu page, September 2026)"
# The matrices mark "Product may contain allergen" with an open circle: traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Calories only, per dish as printed on Mytime Active's golf, Pavilion (leisure centre) and High Elms menus; protein, carbs and fat are not "
        "published. Not every venue serves every menu and one dish can print different calories on different menus. Golfers' breakfast rolls are not listed.")
EXPECTED_ITEMS = 80
EXPECTED_ROLL_FIGURES = [("Bacon", "540"), ("Sausage", "820"), ("Fried egg", "846"), ("Hash brown", "679"), ("Vegan sausage", "470"), ("Avocado", "610")]

PORK = re.compile(r"\b(pork|bacon|ham|sausages?|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
VEG = re.compile(r"\((?:V|Ve)\)|\bvegan\b|\bvegetarian\b", re.I)


def E(anchor, name, cat, desc="", id=None):
    """One dish: `anchor` = how its name line starts as printed; `name` = display name; `desc` = printed description words used for tags only."""
    return dict(anchor=anchor, name=name, cat=cat, desc=desc, id=id)


# ---------------------------------------------------------------- Golf menu (page 2). Reading order: left column, then right column.
G = "Golf menu: "
GOLF = [
    E("Two slices of toast with jam or marmalade", "Two slices of toast with jam or marmalade", G + "Breakfast"),
    E("Toast with baked beans", "Toast with baked beans", G + "Breakfast"),
    E("Toast with cheese", "Toast with cheese", G + "Breakfast"),
    E("Toast with two eggs cooked your way", "Toast with two eggs cooked your way", G + "Breakfast"),
    E("Toast with avocado", "Toast with avocado", G + "Breakfast"),
    E("Full English Breakfast with a hot drink", "Full English Breakfast with a hot drink", G + "Breakfast"),
    E("Vegan Breakfast (Ve) with a hot drink", "Vegan Breakfast with a hot drink", G + "Breakfast"),
    # Breakfast Extras: a grid, read row by row (name, price | calories, name, price | calories)
    E("Cumberland sausage", "Cumberland sausage (breakfast extra)", G + "Breakfast extras", desc="Cumberland sausage"),
    E("Vegan sausage", "Vegan sausage (breakfast extra)", G + "Breakfast extras"),
    E("Bacon", "Bacon (breakfast extra)", G + "Breakfast extras"),
    E("Avocado", "Avocado (breakfast extra)", G + "Breakfast extras"),
    E("Two eggs", "Two eggs (breakfast extra)", G + "Breakfast extras"),
    E("Baked beans", "Baked beans (breakfast extra)", G + "Breakfast extras"),
    E("1 toast", "1 toast (breakfast extra)", G + "Breakfast extras"),
    E("1 hash brown", "1 hash brown (breakfast extra)", G + "Breakfast extras"),
    E("Half tomato", "Half tomato (breakfast extra)", G + "Breakfast extras"),
    E("Cheese", "Jacket potato with cheese", G + "Jacket potatoes"),
    E("Beans", "Jacket potato with beans", G + "Jacket potatoes"),
    E("Tuna mayonnaise", "Jacket potato with tuna mayonnaise", G + "Jacket potatoes"),
    E("Prawns with Marie Rose dressing", "Jacket potato with prawns & Marie Rose dressing", G + "Jacket potatoes"),
    E("Fries", "Fries", G + "Sides"),
    E("Loaded fries with cheese & bacon", "Loaded fries with cheese & bacon", G + "Sides"),
    # right column
    E("Tuna mayonnaise", "Tuna mayonnaise sandwich or baguette", G + "Sandwiches & baguettes"),
    E("Prawns with Marie Rose dressing", "Prawns with Marie Rose dressing sandwich or baguette", G + "Sandwiches & baguettes"),
    E("Cheese & ham", "Cheese & ham sandwich or baguette", G + "Sandwiches & baguettes"),
    E("Egg mayonnaise", "Egg mayonnaise sandwich or baguette", G + "Sandwiches & baguettes"),
    E("Clubhouse baguette", "Clubhouse baguette", G + "Clubhouse favourites", desc="Chicken goujons, bacon, lettuce, tomato & mayonnaise"),
    E("Bacon & Brie melt", "Bacon & Brie melt", G + "Clubhouse favourites"),
    E("Tuna & cheese melt", "Tuna & cheese melt", G + "Clubhouse favourites"),
    E("Ham & cheese melt", "Ham & cheese melt", G + "Clubhouse favourites"),
    E("Sausage & onion baguette", "Sausage & onion baguette", G + "Clubhouse favourites"),
]

# ---------------------------------------------------------------- Pavilion menu (page 2). Four columns, left to right.
V = "Pavilion menu: "
PAV = [
    E("Bacon & maple", "Pancake stack with bacon & maple flavoured syrup", V + "Breakfast", desc="bacon"),
    E("Mixed berries & maple", "Pancake stack with mixed berries & maple flavoured syrup", V + "Breakfast"),
    E("Greek style yoghurt,", "Greek style yoghurt, mixed berries & granola", V + "Lighter breakfast choices"),
    E("Porridge pot", "Porridge pot", V + "Lighter breakfast choices"),
    E("Toast with butter &", "Toast with butter & jam or marmalade", V + "Lighter breakfast choices"),
    E("Chicken pesto pasta salad", "Chicken pesto pasta salad", V + "Fresh & healthy salads"),
    E("Falafel & harissa grain salad (V)", "Falafel & harissa grain salad", V + "Fresh & healthy salads"),
    E("Cheese", "Jacket potato with cheese", V + "Jacket potatoes"),
    E("Beans", "Jacket potato with beans", V + "Jacket potatoes"),
    E("Cheese & beans", "Jacket potato with cheese & beans", V + "Jacket potatoes"),
    E("Tuna mayonnaise", "Jacket potato with tuna mayonnaise", V + "Jacket potatoes"),
    E("Prawns & Marie Rose", "Jacket potato with prawns & Marie Rose", V + "Jacket potatoes"),
    E("Tuna mayonnaise", "Tuna mayonnaise sandwich, wrap or baguette", V + "Sandwiches, wraps & baguettes"),
    E("Egg mayonnaise", "Egg mayonnaise sandwich, wrap or baguette", V + "Sandwiches, wraps & baguettes"),
    E("Prawns & Marie Rose", "Prawns & Marie Rose sandwich, wrap or baguette", V + "Sandwiches, wraps & baguettes"),
    E("Cheese & ham", "Cheese & ham sandwich, wrap or baguette", V + "Sandwiches, wraps & baguettes"),
    E("Falafel wrap (V)", "Falafel wrap", V + "Sandwiches, wraps & baguettes"),
    E("Toasted club sandwich", "Toasted club sandwich", V + "Hot favourites", desc="Chicken, bacon, tomato, lettuce and mayonnaise."),
    E("Fish goujon baguette", "Fish goujon baguette", V + "Hot favourites"),
    E("Bacon baguette", "Bacon baguette", V + "Hot favourites"),
    E("Sausage baguette", "Sausage baguette", V + "Hot favourites"),
    E("Cheese toastie", "Cheese toastie", V + "Hot favourites"),
    E("Ham & cheese toastie", "Ham & cheese toastie", V + "Hot favourites"),
    E("Chicken sharer platter", "Chicken sharer platter", V + "Sharing platters"),
    E("Vegetarian sharer platter (V)", "Vegetarian sharer platter", V + "Sharing platters"),
    E("Fries", "Fries", V + "Sides"),
    E("Loaded fries with", "Loaded fries with cheese & bacon", V + "Sides", desc="bacon"),
    E("Onion rings", "Onion rings", V + "Sides"),
    E("Garlic bread", "Garlic bread", V + "Sides"),
    E("Cheesy garlic bread", "Cheesy garlic bread", V + "Sides"),
    E("Kids lunch deal", "Kids lunch deal", V + "Active kids"),  # "Half cheese or ham sandwich, fruit, crisps and fruit juice": a choice, so no pork tag
    E("Chicken goujons", "Kids chicken goujons & fries", V + "Active kids"),
    E("Cod goujons & fries", "Kids cod goujons & fries", V + "Active kids"),
    E("Pasta bows in tomato", "Kids pasta bows in tomato sauce & garlic bread", V + "Active kids"),
    E("Sausages & fries", "Kids sausages & fries", V + "Active kids"),
    E("Crudités & hummus", "Kids crudités & hummus", V + "Active kids"),
    E("Margherita pizza (V)", "Margherita pizza", V + "Stone baked pizzas"),
    E("Vegetarian pizza (V)", "Vegetarian pizza", V + "Stone baked pizzas"),
    E("BBQ Chicken pizza", "BBQ chicken pizza", V + "Stone baked pizzas"),
    E("Pepperoni pizza", "Pepperoni pizza", V + "Stone baked pizzas"),
]

# ---------------------------------------------------------------- High Elms | Bromley menu (page 1). Three panels, left to right.
H = "High Elms menu: "
ELMS = [
    E("All day breakfast wrap", "All day breakfast wrap", H + "Rolls & wraps", desc="Sausage, egg mayo & bacon with ketchup in a white tortilla wrap."),
    E("Sausage sourdough ciabatta", "Sausage sourdough ciabatta", H + "Rolls & wraps", desc="Pork sausage in a stone baked roll with sourdough."),
    E("Bacon sourdough ciabatta", "Bacon sourdough ciabatta", H + "Rolls & wraps", desc="Back bacon in a stone baked roll with sourdough."),
    E("Ham & cheese toastie", "Ham & cheese toastie", H + "Toasties & melts", desc="Smoked deli ham, cheddar & mozzarella cheese on toasted white bread."),
    E("Cheese & slow roasted", "Cheese & slow roasted tomato toastie", H + "Toasties & melts"),
    E("Cheese & onion toastie", "Cheese & onion toastie", H + "Toasties & melts"),
    E("Tuna melt panini", "Tuna melt panini", H + "Toasties & melts"),
    E("Margherita pizza", "Margherita pizza", H + "Pizzas"),
    E("BBQ chicken pizza", "BBQ chicken pizza", H + "Pizzas"),
]

# Each menu: (file, page, column starts (x of the 2nd, 3rd... column), entries, label)
MENUS = [
    ("Golf_Menu_Website.pdf", 2, [420.0], GOLF, "golf menu"),
    ("The_Pavilion_Menu_Website.pdf", 2, [210.0, 440.0, 630.0], PAV, "Pavilion menu"),
    ("HIGH_ELMS_BROMLEY_MENU_Web.pdf", 1, [300.0, 600.0], ELMS, "High Elms menu"),
]


# ---------------------------------------------------------------------------------------------- fetching (polite, robots-checked)
def curl(url: str, out: Path) -> int:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    return int(res.stdout.strip() or 0)


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    robots = cache / "robots.txt"
    if not robots.exists():
        if curl(f"https://{HOST}/robots.txt", robots) != 200:
            raise SystemExit(f"cannot read https://{HOST}/robots.txt: stop (never work round it)")
        time.sleep(1.1)
    rules = robots_rfc.parse(robots.read_text(encoding="utf-8-sig"))
    for local, published in FILES.items():
        out = cache / local
        if out.exists() and out.stat().st_size > 500:
            continue
        if not robots_rfc.allowed(rules, "/sites/default/files/2026-09/" + published):
            raise SystemExit(f"robots.txt disallows {published}: stop (never work round it)")
        code = curl(BASE + published, out)
        if code != 200 or out.read_bytes()[:5] != b"%PDF-":
            out.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code} for {BASE + published}: stop and ask the founder to download the file")
        time.sleep(1.1)


def created(path: Path) -> str:
    info = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True).stdout
    for line in info.splitlines():
        if line.startswith("CreationDate:"):
            return datetime.strptime(line.split(":", 1)[1].strip().replace(" UTC", ""), "%a %b %d %H:%M:%S %Y").strftime("%Y-%m-%d")
    return ""


# ---------------------------------------------------------------------------------------------- reading
def check_unlisted(cache: Path) -> None:
    """Cover pages carry no calories; the golf menu's roll figures are exactly the six we leave out."""
    for fname in ("Golf_Menu_Website.pdf", "The_Pavilion_Menu_Website.pdf"):
        if P.read_pages(cache / fname)[0]["tuples"]:
            raise SystemExit(f"{fname}: page 1 now prints calories: re-check the menu")
    golf = P.read_pages(cache / "Golf_Menu_Website.pdf")[1]
    text = P.page_text(golf)
    figures = re.findall(r"([A-Z][A-Za-z ]+?) - (\d+)kcal", text)
    if figures != EXPECTED_ROLL_FIGURES:
        raise SystemExit(f"The golf menu's breakfast roll figures changed: {figures}")
    # every kcal word on the golf page is either in a tuple or one of the six
    if len(re.findall(r"\d+ ?kcal", text)) != len(golf["tuples"]) + len(EXPECTED_ROLL_FIGURES):
        raise SystemExit("The golf menu prints a calorie value that is neither in a '£ | kcal' group nor a roll figure")
    for fname, page_no, _b, entries, label in MENUS:
        t = P.page_text(P.read_pages(cache / fname)[page_no - 1])
        for e in entries:
            if e["desc"] and P.norm(e["desc"]).lower() not in t.lower():
                raise SystemExit(f"{label}: description {e['desc']!r} is no longer printed")


def build(cache: Path) -> tuple:
    check_unlisted(cache)
    items, report, seen = [], [], {}
    for fname, page_no, bounds, entries, label in MENUS:
        pages = P.read_pages(cache / fname)
        for d in P.dishes(pages, page_no, bounds, entries):
            text = f"{d['anchor']} {d['name']} {d['desc']}"
            tags = []
            if VEG.search(d["anchor"]) or VEG.search(d["name"]):
                tags.append("vegetarian")
            if PORK.search(text) and "vegetarian" not in tags:
                tags.append("contains_pork")
            if BEEF.search(text):
                tags.append("contains_beef")
            note = f"{label}: printed '£{d['price']} | {d['kcal']}kcal' on the row of '{d['line'][:60]}'"
            items.append(dict(name=d["name"], category=d["cat"], calories=d["kcal"], tags="|".join(tags), rankable=False, notes=note,
                              id=None))
            seen.setdefault(d["name"].lower(), []).append((label, d["kcal"]))
    # same name on more than one menu: report whether the figures agree (they stay separate items under their own menu)
    for name, rows in sorted(seen.items()):
        if len(rows) > 1:
            same = len({k for _, k in rows}) == 1
            report.append(f"same name on {len(rows)} menus, {'same' if same else 'DIFFERENT'} calories: {name} " + ", ".join(f"{m} {k}" for m, k in rows))
    # unique ids: the same dish name on two menus needs a menu prefix
    prefix = {"Golf menu": "golf", "Pavilion menu": "pavilion", "High Elms menu": "high-elms"}
    for it in items:
        key = it["category"].split(":")[0]
        it["id"] = prefix[key] + "-" + re.sub(r"[^a-z0-9]+", "-", it["name"].lower().replace("&", " and ").replace("'", "")).strip("-")
    if len({i["id"] for i in items}) != len(items):
        raise SystemExit("item ids are not unique")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check the tables")
    return items, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path, help="folder holding the PDFs (see FILES)")
    ap.add_argument("--fetch", action="store_true", help="download the PDFs into the folder first (skips files already there)")
    ap.add_argument("--checked-on", help="the day the PDFs were read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
        if not args.checked_on:
            return 0
    if not args.checked_on:
        ap.error("--checked-on is required")
    for local in FILES:
        print(f"{local} created {created(args.cache / local)} sha256 {sha256_file(args.cache / local)}")
    items, report = build(args.cache)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": PAGE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Mytime Active", cuisine="Leisure centre & golf cafe", source_title=SOURCE_TITLE,
                             source_url=PAGE_URL, checked_on=args.checked_on,
                             aliases=["mytime active", "mytimeactive", "mytime", "eatwell by mytime active", "mytime active golf"],
                             items=items, out=args.out, note=NOTE, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    counts = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("not listed (no stated basis): Golfers Breakfast Rolls & Baps: " + ", ".join(f"{a} {b}kcal" for a, b in EXPECTED_ROLL_FIGURES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
