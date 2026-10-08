#!/usr/bin/env python3
"""Build data/source/pure/ from Pure's official menu pages (https://www.pure.co.uk/menus/).

    python3 tools/uk_extract/pure.py PAGES_DIR --checked-on 2026-10-06
    python3 tools/uk_extract/pure.py PAGES_DIR --checked-on 2026-10-06 --download   # fetch the pages into PAGES_DIR first

PAGES_DIR holds each menu page saved once as <page>.html (names in pure_pages.PAGES plus new-this-season). `--download` fetches
them politely: one request per page, one every 10 seconds (the site's robots.txt asks for `Crawl-delay: 10`), a normal browser
User-Agent, and it stops at the first answer that is not 200 (never work round a block).

Numbers are copied from the "Per portion" column exactly as printed (kcal, kJ, fat, saturates, carbohydrate, sugars, fibre,
protein, salt; kJ written without its thousands comma, "1,096" -> 1096, and left blank where the page prints it as "1.707",
which as printed reads 1.707 kJ). No portion weights, mono/poly/trans fat or caffeine are printed. The "Per 100g" column is never used (it has glitches on this site, see notes in items.csv).
Only NAMES, categories and grouping are written by hand below. If Pure adds, removes or renames items the page counts or the
name lists no longer match and this script stops, so a human re-checks.

What is left out, and why (all reported on every run):
  * Gatwick Specials (airport-only) and the breads page's "Only available at selected stores" rows (rule: Great Britain menu only).
  * Catering and Events Packages (not on the café menu): the catering pages are not read at all.
  * Items with no nutrition table, or a table where protein, carbohydrate or fat (or kcal) is printed as "-": the app needs
    all four, and a dash is never read as zero.
Held back (holdback.csv): rows whose own printed numbers contradict each other; they stay in items.csv as printed.

Allergens (docs/DATA.md "Allergens"): each item's page prints a bold "Contains ..." line (naming the cereals and nuts) and its
ingredients with the allergens in bold ("For allergens, including cereals containing gluten, see ingredients in bold."). An
item gets allergens only when the two printed forms name exactly the same allergens, cereals and nuts (allergens_for); the
"No X" tags under "Allergen Info" are not used (many items carry an incomplete set). No "may contain" is printed. All or
nothing: allergens.csv is written only when every item has them, otherwise only allergen_guide.csv (the app then links the
menu pages). As of 2026-10-06 Pure is link-only: for about a fifth of the items the two printed forms disagree or the
"Contains" line is missing, and the "Undressed" rows of the salads have no allergen statement of their own (the page prints
one list for the salad as sold, with its dressing on the side). Every blocked item is printed with its reason on each run.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pure_pages  # noqa: E402
from common import ROOT, allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "pure"
SOURCE_URL = "https://www.pure.co.uk/menus/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

# tiles (= items with a details block) each page must show
EXPECTED_TILES = {"hot-lunch": 21, "hot-drinks": 16, "salads-grain-bowls": 8, "cold-breakfast": 22, "hot-breakfast": 25,
                  "breads": 24, "sides-desserts": 8, "snacks-treats": 30, "cold-drinks": 23}
OUTPUT_PAGE_ORDER = ["hot-breakfast", "cold-breakfast", "breads", "hot-lunch", "salads-grain-bowls", "sides-desserts",
                     "snacks-treats", "hot-drinks", "cold-drinks"]

# (page, the page's own section heading) -> our category; None = left out (reason in SECTION_SKIP_REASON)
CATEGORY: dict[tuple[str, str], str | None] = {
    ("hot-lunch", "Soups"): "Soups",
    ("hot-lunch", "Wrap Toasties"): "Wrap toasties",
    ("hot-lunch", "Pure Bowls"): "Pure bowls",
    ("hot-lunch", "Gatwick Specials"): None,
    ("hot-drinks", "Coffee"): "Coffee",
    ("hot-drinks", "Speciality"): "Speciality drinks",
    ("hot-drinks", "Leaf Tea"): "Tea",
    ("salads-grain-bowls", "Salads"): "Salads",
    ("salads-grain-bowls", "Grain Bowls"): "Grain bowls",
    ("cold-breakfast", "Birchers & Yoghurts"): "Birchers & yoghurts",
    ("cold-breakfast", "Bakery"): "Bakery",
    ("hot-breakfast", "Porridge"): "Porridge",
    ("hot-breakfast", "Super Eggs"): "Super Eggs",
    ("hot-breakfast", "Protein Egg Muffins"): "Protein egg muffins",
    ("hot-breakfast", "Wrap Toasties"): "Wrap toasties",
    ("breads", "Wraps"): "Wraps",
    ("breads", "Pretzel Subs"): "Pretzel subs",
    ("breads", "Only available at selected stores"): None,
    ("sides-desserts", "Sides"): "Sides",
    ("sides-desserts", "Desserts"): "Desserts",
    ("sides-desserts", "Bread"): "Bread",
    ("snacks-treats", "Fruit salad"): "Fruit pots",
    ("snacks-treats", "Sweet things"): "Sweet treats",
    ("snacks-treats", "Nuts, Dried Fruit & Treats"): "Snacks",
    ("cold-drinks", "Iced Drinks"): "Iced drinks",
    ("cold-drinks", "Iced Coffee"): "Iced drinks",
    ("cold-drinks", "Smoothies"): "Smoothies",
    ("cold-drinks", "Juices and Shots"): "Juices & shots",
    ("cold-drinks", "Branded Drinks"): "Branded drinks",
}
SECTION_SKIP_REASON = {
    ("hot-lunch", "Gatwick Specials"): "Gatwick (airport) only",
    ("breads", "Only available at selected stores"): "selected stores only",
}
SECTION_SKIP_COUNT = {("hot-lunch", "Gatwick Specials"): 7, ("breads", "Only available at selected stores"): 14}

# Categories whose items are an order on their own (everything else, such as drinks, bakery, snacks, desserts, is not).
RANKABLE = {"Soups", "Wrap toasties", "Pure bowls", "Salads", "Grain bowls", "Birchers & yoghurts", "Porridge", "Super Eggs",
            "Protein egg muffins", "Wraps", "Pretzel subs", "Sides"}

# Printed names tidied (spacing and case only).
NAME_FIX = {
    "Apple Juice 250ML": "Apple Juice 250ml",
    "Brown Bag Crisps- Sea Salt & Malt Vinegar": "Brown Bag Crisps – Sea Salt & Malt Vinegar",
    "Brown Crisps-Smoked Chilli": "Brown Crisps – Smoked Chilli",
}
FIXED_SERVING = {"Apple Juice 250ml": "250 ml", "Orange Juice 250ml": "250 ml"}  # the item's own printed name states it
TABLE_LABELS = {  # the page's own <h5> label above a table -> (name suffix, serving)
    "Regular": ("regular", "Regular"), "Large": ("large", "Large"),
    "Dressed": ("dressed", "Dressed"), "Undressed": ("undressed", "Undressed"),
    "Organic Dairy Milk": ("organic dairy milk", "With organic dairy milk"), "Oat Milk": ("oat milk", "With oat milk"),
}

# Items left out of items.csv because the table can't give kcal, protein, carbs and fat (page, printed name) -> why
NO_MACROS = {
    ("hot-drinks", "Americano"): "protein, carbohydrate and fat printed as '-'",
    ("hot-drinks", "Espresso"): "kcal and every other value printed as '-'",
    ("hot-drinks", "Long Black"): "no nutrition table",
    ("hot-drinks", "Earl Grey Tea"): "protein, carbohydrate and fat printed as '-'",
    ("hot-drinks", "English Breakfast Tea"): "protein, carbohydrate and fat printed as '-'",
    ("hot-drinks", "Green Tea"): "protein, carbohydrate and fat printed as '-'",
    ("hot-drinks", "Peppermint Tea"): "fat printed as '-'",
    ("cold-drinks", "Iced Americano"): "kcal and every other value printed as '-'",
    ("cold-drinks", "Wild Berry Kombucha"): "no nutrition table",
    ("cold-drinks", "Ginger Shot"): "fat printed as '-'",
    ("snacks-treats", "Slow Dried Mango"): "no nutrition table",
    ("snacks-treats", "Propercorn Sweet & Salty"): "no nutrition table",
    ("snacks-treats", "Propercorn Lightly Sea Salted"): "no nutrition table",
}

# Items whose page prints no ingredients list (so the pork/beef tags cannot be checked): kept, with this note (checked by hand 2026-10-08).
NO_INGREDIENTS_OK = {
    "Forest Feast Salted Dark Chocolate Almonds": "The page prints no ingredients list for this item, so its pork/beef tags could not be checked",
}

# A printed value that is not a plain number but whose digits are unambiguous: (page, name, table label, key) -> (printed, used, why).
PRINTED_FIXES = {
    ("salads-grain-bowls", "Pure Bibimbap", "Undressed", "fat"): (
        "`14.0", "14.0", "the page prints a stray backtick before the number; the digits are used as printed"),
}

# item id -> why it is not published (rows whose own numbers contradict each other). They stay in items.csv as printed.
HOLDBACK = {
    "autumn-minestrone-regular": "The page prints 275 kcal (1,150 kJ) but its own protein, carbohydrate and fat (12.5 g, 29.3 g, 24.6 g) add up to about 389 kcal.",
    "autumn-minestrone-large": "The page prints 372 kcal (1,555 kJ) but its own protein, carbohydrate and fat (16.9 g, 39.6 g, 33.3 g) add up to about 526 kcal.",
    "naked-chicken-burrito-undressed": "The page prints 329 kcal but 1,639 kJ (about 392 kcal), and its own macros add up to about 397 kcal.",
    "apple-bran-and-cinnamon-muffin": "The page prints 308 kcal (1,294 kJ) but its own protein, carbohydrate and fat (6.1 g, 31.0 g, 7.7 g) add up to about 218 kcal; the per 100 g column shows the same gap.",
    "maple-flapjack": "The page prints 239 kcal (1,010 kJ) but its own protein, carbohydrate and fat (6.0 g, 62.2 g, 18.7 g) add up to about 441 kcal.",
    "ginger-lemon-kombucha": "The page prints 5 kcal (18 kJ) but its own protein, carbohydrate and fat (1.3 g, 3.8 g, 1.3 g) add up to about 32 kcal.",
    "iced-latte": "The page prints 228 kcal but 729 kJ (about 174 kcal), and its own macros add up to about 180 kcal.",
    "trip-peach-and-ginger": "The page prints 50.0 g of saturates with 0.0 g of fat.",
    "hot-chocolate": "The page prints 273 kcal (1,140 kJ) but its own protein, carbohydrate and fat (10 g, 19.1 g, 20.3 g) add up to about 299 kcal, and the per 100 g column (81 kcal) is far below its own macros (about 119 kcal).",
    "berry-delightful": "The page prints values that do not fit one portion size: 287 kcal and 15.8 g fat imply about 191 g, but 35.6 g carbohydrate implies about 292 g (per 100 g column); its macros add up to about 314 kcal.",
    "so-cluckin-good": "The page prints 9.7 g protein per portion, identical to its per 100 g figure, while its fat and carbohydrate are 2.7 times their per 100 g figures; with 9.7 g its macros add up to about 449 kcal against the 503 kcal printed.",
    "pure-and-pip-organic-dairy-milk": "The page prints salt as 073 g (the oat milk version of the same porridge prints 0.73 g), which cannot be right for a 397 kcal porridge.",
    "british-sausage-and-egg": "The page prints identical numbers (564 kcal, 19.4 g protein, 51.5 g carbohydrate, 29.9 g fat) for this and for Smoked Salmon & Spinach, which have different fillings, so neither can be checked.",
    "smoked-salmon-and-spinach": "The page prints identical numbers (564 kcal, 19.4 g protein, 51.5 g carbohydrate, 29.9 g fat) for this and for British Sausage & Egg, which have different fillings, so neither can be checked.",
    "tenzing-raspberry-and-yuzu": "The page prints exactly the same numbers as Tenzing Pineapple & Passion Fruit (48 kcal, 11.3 g sugars) although its own ingredients list sweeteners and no sugar.",
    "macchiato": "The Per portion column is identical to the Per 100g column in every nutrient and no portion weight is printed, so it is unclear whether it is a real portion.",
    "cinnamon-bun": "The Per portion column is identical to the Per 100g column in every nutrient and no portion weight is printed, so it is unclear whether it is a real portion.",
    "peanut-butter-choc-pot": "The Per portion column is identical to the Per 100g column in every nutrient and no portion weight is printed, so it is unclear whether it is a real portion.",
    "double-chocolate-and-vanilla-cookie": "The Per portion column is identical to the Per 100g column in every nutrient and no portion weight is printed (the other cookies print 246-272 kcal per portion against 468 kcal here), so it is unclear whether it is a real portion.",
    "the-immunity-shot": "The Per portion column is identical to the Per 100g column in every nutrient and no portion weight is printed, so it is unclear whether it is a real portion.",
}

NOTE = ("Values are per portion as printed on Pure's own menu pages (an average, as food is made by hand in store); "
        "no portion weights are printed. Airport and selected-store items are left out.")
SEASON_NOTE = "Listed under 'New this Season' on the menus page"

# ---------------------------------------------------------------- allergens
ALLERGEN_TITLE = ('Pure menu pages: allergens per item (the bold "Contains" line and the ingredients in bold; '
                  "pure.co.uk/menus, no date shown)")
ALLERGEN_EXTRA = {  # Pure's own printed words that common._A does not list
    "hzelnut": ("nuts", "hazelnut"),                 # "Contains Oats, Almonds, Hzelnut, Cashew, Soya" (a misspelling as printed)
    "sodium metabisulphite": ("sulphites", None),    # printed in bold in ingredient lists
}
NONE_OF_14 = "Does not contain any of the 14 common allergens"
MILK_IF_DAIRY = "Milk (when made with organic dairy milk)"   # the porridges' own condition on milk
MILK_TABLES = {"Organic Dairy Milk": True, "Oat Milk": False}  # table label -> made with dairy milk
# The porridges print their ingredients once per milk, each part headed "<label>:".
MILK_PART = re.compile(r"(Organic Dairy (?:<strong>)?Milk(?:</strong>)?|Oat Milk)\s*:")
# Founder's decision (not taken): the salads print one allergen list for the salad as sold (dressing on the side). True would
# give the "Undressed" rows that same list (it can only over-state: e.g. Pure Bibimbap's soya and sesame are in its dressing).
UNDRESSED_GETS_SALAD_ALLERGENS = False


def _bold_part(ingredients_html: str, label: str) -> str | None:
    """The ingredients (HTML) that describe this table: a porridge's part for its milk, otherwise the whole list.
    None when the list is split by milk but the item has no milk tables (it would not say which part applies)."""
    marks = list(MILK_PART.finditer(ingredients_html))
    if label not in MILK_TABLES:
        return None if marks else ingredients_html
    names = [re.sub(r"<[^>]+>", "", m.group(1)) for m in marks]
    if sorted(names) != sorted(MILK_TABLES):
        return None
    i = names.index(label)
    return ingredients_html[marks[i].end():marks[i + 1].start() if i + 1 < len(marks) else len(ingredients_html)]


def allergens_for(it: dict, label: str, where: str) -> tuple[dict | None, str]:
    """(allergens, "") for one table of an item, read from its "Contains" line and cross-checked with the ingredients in
    bold, or (None, why) when they don't describe this table exactly."""
    lines = it["contains_lines"]
    if len(lines) != 1:
        return None, "no 'Contains' line printed" if not lines else "several 'Contains' lines printed"
    line = lines[0].rstrip(". ")
    if_dairy = MILK_IF_DAIRY in line
    if (label in MILK_TABLES) != if_dairy:
        return None, f"table {label!r} but the 'Contains' line is {lines[0]!r}"
    if label == "Undressed" and not UNDRESSED_GETS_SALAD_ALLERGENS:
        return None, "'Undressed' row: the page prints allergens for the salad as sold (dressing on the side) only"
    if line == NONE_OF_14:
        words = []
    elif line.startswith("Contains "):
        words = [w for w in line[len("Contains "):].replace(MILK_IF_DAIRY, "").split(",") if w.strip(" .")]
    else:
        raise SystemExit(f"{where}: allergen line not understood: {lines[0]!r}")
    keys, cereals, nuts = allergen_words(words, where, ALLERGEN_EXTRA)
    if if_dairy and MILK_TABLES[label]:
        keys.add("milk")
    part = _bold_part(it["ingredients_html"], label)
    if part is None:
        return None, "the ingredients are printed per milk but the item has one table"
    bold = [pure_pages.text(b) for b in re.findall(r"<strong>(.*?)</strong>", part, re.S)]
    bkeys, bcereals, bnuts = allergen_words(bold, where, ALLERGEN_EXTRA)
    if (keys, cereals, nuts) != (bkeys, bcereals, bnuts):
        def show(k, c, n):
            return "|".join(sorted(k)) + (f" cereals {'|'.join(sorted(c))}" if c else "") + (f" nuts {'|'.join(sorted(n))}" if n else "")
        return None, f"'Contains' line says {show(keys, cereals, nuts) or 'none'}; ingredients in bold say {show(bkeys, bcereals, bnuts) or 'none'}"
    return {"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts}, ""


KEYS = {"calories": "kcal", "protein_g": "protein", "carbs_g": "carbs", "fat_g": "fat", "sat_fat_g": "sat",
        "salt_g": "salt", "sugar_g": "sugars", "fiber_g": "fibre"}
REQUIRED = ("calories", "protein_g", "carbs_g", "fat_g")
NUMBER = re.compile(r"^\d+(?:\.\d+)?$")
LESS_THAN = re.compile(r"^<\d+(?:\.\d+)?$")


def download(folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    pages = [*pure_pages.PAGES, pure_pages.SEASON_PAGE]
    for i, page in enumerate(pages):
        if i:
            time.sleep(10)
        url = pure_pages.URL.format(page)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()
        except Exception as exc:  # a block or an error: stop, never work round it
            sys.exit(f"Could not fetch {url}: {exc}. Stop here and download the page by hand.")
        (folder / f"{page}.html").write_bytes(body)
        print(f"fetched {url} ({len(body):,} bytes)")


def printed_number(raw: str, key: str, ctx: tuple) -> str:
    """The cell as a CSV value: plain numbers and '<x' pass through; '-' on an optional nutrient is blank; anything else needs a listed fix."""
    if NUMBER.match(raw) or LESS_THAN.match(raw):
        return raw
    if raw == "-" and key not in ("kcal", "protein", "carbs", "fat"):
        return ""
    fix = PRINTED_FIXES.get((*ctx, key))
    if fix and fix[0] == raw:
        return fix[1]
    raise ValueError(f"{ctx}: {key} is printed as {raw!r}: check the page, then add it to PRINTED_FIXES or NO_MACROS")


def printed_kj(raw: str) -> tuple[str, str]:
    """(energy_kj CSV value, note) for the printed kJ cell: digits as printed (a thousands comma dropped); blank for '-' and
    for 'd.ddd' (the site's way of writing e.g. 1,707 that, as printed, reads 1.707 kJ: never re-read as another number)."""
    if re.fullmatch(r"\d+(?:\.\d)?", raw):
        return raw, ""
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+", raw):
        return raw.replace(",", ""), ""
    if raw == "-":
        return "", ""
    if re.fullmatch(r"\d\.\d{3}", raw):
        return "", f"kJ printed as {raw!r}: left blank"
    raise ValueError(f"kJ printed as {raw!r}: check the page and extend printed_kj()")


def make_id(name: str) -> str:
    """Item id from the name, accents folded ('Sautéed' -> 'sauteed')."""
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode())


def as_float(value: str) -> float:
    """A CSV value as a number for checks only ('<0.5' counts as 0, as the pipeline reads it)."""
    return 0.0 if LESS_THAN.match(value) else float(value)


def kj_value(raw: str) -> float | None:
    s = raw.replace(",", "")
    if re.match(r"^\d\.\d{3}$", s):  # the site sometimes writes 1,707 as 1.707
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def per100_disagrees(rows: dict) -> bool:
    """True when the Per 100g column implies clearly different portion weights for kcal, fat, carbohydrate and protein."""
    weights = []
    for k in ("kcal", "fat", "carbs", "protein"):
        try:
            a, b = float(rows[k][0]), float(rows[k][1])
        except ValueError:
            continue
        if a >= 2 and b >= 2:
            weights.append(a / b * 100)
    return len(weights) >= 2 and max(weights) > 1.25 * min(weights)


def build_items(folder: Path):
    pages: dict[str, list[dict]] = {}
    for page in pure_pages.PAGES:
        pages[page] = pure_pages.read_page(folder / f"{page}.html")
        if len(pages[page]) != EXPECTED_TILES[page]:
            sys.exit(f"{page} shows {len(pages[page])} items but this script expects {EXPECTED_TILES[page]}. The menu changed: "
                     "re-check the lists in pure.py (CATEGORY, NO_MACROS, HOLDBACK) against the page before running again.")
    # the "New this Season" page re-lists items that are on the pages above: used for limited_time and as a cross-check
    season = pure_pages.read_season(folder)
    by_slug = {it["slug"]: it for items in pages.values() for it in items}
    season_slugs: set[str] = set()
    for it in season:
        if it["section"] == "Catering":
            continue
        if it["section"] != "In-store":
            sys.exit(f"New this Season page has an unknown section {it['section']!r}")
        other = by_slug.get(it["slug"])
        if other is None:
            sys.exit(f"New this Season lists {it['name']!r}, which is on none of the menu pages: add that page's items by hand")
        if other["tables"] != it["tables"] or other["name"] != it["name"]:
            sys.exit(f"{it['name']!r} reads differently on New this Season than on its own page")
        season_slugs.add(it["slug"])

    skipped: dict[str, list[str]] = {}
    unpublished: list[tuple[str, str]] = []
    items: list[dict] = []
    seen_skips: dict[tuple, int] = {}
    for page in OUTPUT_PAGE_ORDER:
        for it in pages[page]:
            key = (page, it["section"])
            if key not in CATEGORY:
                sys.exit(f"{page}: unknown section {it['section']!r} (item {it['name']!r}): add it to CATEGORY")
            category = CATEGORY[key]
            if category is None:
                seen_skips[key] = seen_skips.get(key, 0) + 1
                skipped.setdefault(SECTION_SKIP_REASON[key], []).append(it["name"])
                continue
            if (page, it["name"]) in NO_MACROS:
                unpublished.append((it["name"], NO_MACROS[(page, it["name"])]))
                continue
            if not it["tables"]:
                sys.exit(f"{it['name']!r} has no nutrition table: add it to NO_MACROS")
            printed_name = it["name"]
            base = NAME_FIX.get(printed_name, printed_name)
            size = None
            m = re.match(r"^(.*\S) (Large|Regular)$", base)
            if m and len(it["tables"]) == 1:
                base, size = m.group(1), m.group(2)
            for label, rows in it["tables"]:
                if label and size and label != size:
                    sys.exit(f"{printed_name!r}: table label {label!r} does not match its name")
                if len(it["tables"]) > 1 and not label:
                    sys.exit(f"{printed_name!r}: several tables but one has no label")
                name, serving = base, FIXED_SERVING.get(base, "")
                if size:
                    name, serving = f"{base} ({size.lower()})", size
                elif label:
                    if label not in TABLE_LABELS:
                        sys.exit(f"{printed_name!r}: unknown table label {label!r}: add it to TABLE_LABELS")
                    name, serving = f"{base} ({TABLE_LABELS[label][0]})", TABLE_LABELS[label][1]
                ctx = (page, printed_name, label)
                vals = {}
                missing_required = [KEYS[c] for c in REQUIRED if rows[KEYS[c]][0] == "-"]
                if missing_required:
                    sys.exit(f"{ctx}: {missing_required} printed as '-': add the item to NO_MACROS")
                notes = []
                for col, k in KEYS.items():
                    vals[col] = printed_number(rows[k][0], k, ctx)
                    fix = PRINTED_FIXES.get((*ctx, k))
                    if fix and fix[0] == rows[k][0]:
                        notes.append(f"{k} printed as {fix[0]!r}: {fix[2]}")
                vals["energy_kj"], kj_note = printed_kj(rows["kj"][0])
                if kj_note:
                    notes.append(kj_note)
                kcal_v = as_float(vals["calories"])
                est = 4 * as_float(vals["protein_g"]) + 4 * as_float(vals["carbs_g"]) + 9 * as_float(vals["fat_g"])
                if kcal_v >= 50 and abs(est - kcal_v) / kcal_v > 0.10:
                    notes.append(f"kcal {kcal_v:.0f} differs from its macros (4P+4C+9F = {est:.0f}) by {abs(est - kcal_v) / kcal_v:.0%}; printed as is")
                if per100_disagrees(rows):
                    notes.append("The Per 100g column does not fit the Per portion column here; per portion is used")
                if it["slug"] in season_slugs:
                    notes.append(SEASON_NOTE)
                tags = []
                if it["marks"] & {"Vegetarian", "Vegan"}:
                    tags.append("vegetarian")
                ing = it["ingredients"]
                # "Smoky Bacon Flavour Seasoning" is a flavouring, not meat (the page marks such a snack Vegetarian): only real meat words count
                ing = re.sub(r"\b(?:bacon|ham|pork|beef|sausage|chorizo)\s+flavou?r(?:ed|ing)?\b", " ", ing, flags=re.I)
                if re.search(r"\b(bacon|ham|pork|sausage|salami|chorizo|pepperoni|gammon|pancetta)\b", ing, re.I):
                    tags.append("contains_pork")
                if re.search(r"\b(beef|steak|brisket|veal)\b", ing, re.I):
                    tags.append("contains_beef")
                if "vegetarian" in tags and len(tags) > 1:
                    sys.exit(f"{printed_name!r} is marked vegetarian but its ingredients name meat: check by hand")
                if not ing:
                    if printed_name not in NO_INGREDIENTS_OK:
                        sys.exit(f"{printed_name!r} has no ingredients text, so its meat tags can't be checked")
                    notes.append(NO_INGREDIENTS_OK[printed_name])
                allergens, why = allergens_for(it, label, f"{page} {printed_name!r} {label}".strip())
                items.append({
                    "id": make_id(name), "name": name, "category": category, "serving": serving, **vals, "tags": "|".join(tags),
                    "limited_time": it["slug"] in season_slugs, "rankable": category in RANKABLE,
                    "notes": "; ".join(notes), "_kj": rows["kj"][0], "_page": page, "allergens": allergens, "_allergen_why": why,
                })
    for key, want in SECTION_SKIP_COUNT.items():
        if seen_skips.get(key, 0) != want:
            sys.exit(f"{key} has {seen_skips.get(key, 0)} items but this script expects {want}: re-check the page")
    ids = [i["id"] for i in items]
    if len(ids) != len(set(ids)):
        sys.exit(f"duplicate item ids: {sorted({i for i in ids if ids.count(i) > 1})}")
    unknown = [h for h in HOLDBACK if h not in ids]
    if unknown:
        sys.exit(f"HOLDBACK names items that no longer exist: {unknown}")
    return items, skipped, unpublished, season_slugs


def diagnostics(items: list[dict]) -> list[str]:
    """Own-number checks on every published row; each line printed here must be explained by the source."""
    out = []
    for it in items:
        item_id = it["id"]
        if item_id in HOLDBACK:
            continue
        kcal, kj = as_float(it["calories"]), kj_value(it["_kj"])
        est = 4 * as_float(it["protein_g"]) + 4 * as_float(it["carbs_g"]) + 9 * as_float(it["fat_g"])
        if kj and abs(kj / 4.184 - kcal) > max(10, 0.10 * kcal):
            out.append(f"{item_id}: kcal {kcal:.0f} vs kJ {kj:.0f} (= {kj / 4.184:.0f} kcal)")
        if kcal >= 50 and abs(est - kcal) / kcal > 0.10:
            out.append(f"{item_id}: kcal {kcal:.0f} vs 4P+4C+9F = {est:.0f}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", type=Path, help="folder with the saved menu pages (<page>.html)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--download", action="store_true", help="fetch the pages into the folder first (10 seconds between requests)")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.download:
        download(args.pages)

    try:
        items, skipped, unpublished, season = build_items(args.pages)
    except ValueError as exc:
        sys.exit(f"Stopped: {exc}")
    for line in diagnostics(items):
        print("check:", line)

    write_chain_folder(
        chain_id=CHAIN_ID, name="Pure", cuisine="Cafe",
        source_title=f"Pure menu pages: nutrition per portion (pure.co.uk/menus; accessed {args.checked_on}, no date shown)",
        source_url=SOURCE_URL, checked_on=args.checked_on,
        aliases=["pure", "pure cafe", "pure café", "pure uk"],
        items=items, out=args.out, note=NOTE,
        holdback=[(i, r) for i, r in HOLDBACK.items()],
        allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": False},
    )
    digests = {p: hashlib.sha256((args.pages / f"{p}.html").read_bytes()).hexdigest()
               for p in [*pure_pages.PAGES, pure_pages.SEASON_PAGE]}
    combined = hashlib.sha256("".join(digests[p] for p in digests).encode()).hexdigest()
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {args.out}")
    for reason, names in skipped.items():
        print(f"left out ({reason}): {len(names)}: {', '.join(names)}")
    print(f"not in items.csv (no usable macros): {len(unpublished)}: " + "; ".join(f"{n} ({r})" for n, r in unpublished))
    print(f"limited_time (New this Season, in-store): {len(season)}")
    blocked = [(i["id"], i["_allergen_why"]) for i in items if i["allergens"] is None]
    print(f"allergens: {len(items) - len(blocked)} items read, {len(blocked)} blocked"
          + (" -> allergens.csv NOT written (all or nothing); allergen_guide.csv links the menu pages" if blocked else ""))
    for item_id, why in blocked:
        print(f"  {item_id}: {why}")
    for p, d in digests.items():
        print(f"sha256 {p}.html {d}")
    print(f"combined sha256 (page hashes joined in order) {combined}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
