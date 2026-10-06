#!/usr/bin/env python3
"""Build data/source/prezzo/ from Prezzo's official allergen and nutrition page (prezzo.co.uk/allergens).

    python3 -I tools/uk_extract/prezzo.py --fetch /path/to/raw --checked-on 2026-10-06     # download once, then extract
    python3 -I tools/uk_extract/prezzo.py --html /path/to/raw/allergens.html --checked-on 2026-10-06

Where the data comes from: https://www.prezzo.co.uk/allergens/ (linked from Prezzo's "Allergies and nutrition" help
page) carries the whole menu as a JSON array inside the page's script (`this.menuCategoryData = [...]`): categories,
each with menuItems that have title, description, calories, fat, saturatedFat, carbohydrates, sugars, protein, salt,
fibre and the chain's own vegetarian / vegan marks. The page's "Nutritional info" panel shows exactly these fields
(calories in kcal, the rest in g). The page does not say what the figures are per and carries no date; they match
one whole dish as served (a Mango Sorbet of "two scoops" is 180 kcal, the "one scoop" kids' one is 90). The three
Deliveroo rows say "per 100g" in their own description, so they are left out (we never use per-100g values).

Numbers are copied as printed (whitespace trimmed, nothing converted, rounded or filled in). Only the display
categories, rankable flags and meat-word lists below are written by hand. The script STOPS (and says why) when the
page's item set, categories or anomalies differ from the reviewed run of 2026-10-06: a human then re-checks the page
and updates HOLDBACK / EXPLAINED / EXPECTED_* below. Held-back items are listed in holdback.csv beside items.csv,
so a refresh never brings them back by accident.
"""
import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "prezzo"
SOURCE_URL = "https://www.prezzo.co.uk/allergens/"
SOURCE_TITLE = ("Prezzo Allergen Guide: allergens and nutrition page on prezzo.co.uk "
                "(retrieved {checked_on}; the page carries no version date)")
DATA_KEY = "this.menuCategoryData = "
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")

EXPECTED_ROWS = 531
EXPECTED_BY_PAGE_CATEGORY = {
    "Nibbles": 3, "Starters": 28, "Pasta": 28, "Pizza": 76, "Grills": 13, "Salads": 3, "Sides": 10, "Desserts": 17,
    "Specials": 49, "Afternoon Tea": 8, "Lunch": 11, "Family sharers": 11, "Extras and Build Your Own": 37, "Dips": 7,
    "Soft Drinks": 20, "Sicilian Lemonades & Coolers": 6, "Hot Drinks": 16, "Kids Starters": 12, "Kids Mains": 50,
    "Kids Desserts": 24, "Kids Drinks": 12, "Gin & Tonics": 5, "Spirits": 14, "Cocktails": 15, "Beer and Cider": 11,
    "Wine": 11, "Breakfast": 14, "No/Low Alcohol": 9, "Delivery Specials": 11,
}
EXPECTED_ITEM_KEYS = {
    "calories", "carbohydrates", "celery", "crustaceans", "description", "eggs", "fat", "fibre", "fish", "gluten",
    "glutenFreeOption", "id", "image", "itemId", "itemOptions", "lupin", "mayContainCelery", "mayContainCerealsGluten",
    "mayContainCrustaceans", "mayContainEggs", "mayContainFish", "mayContainLupin", "mayContainMilkDairy",
    "mayContainMolluscs", "mayContainMustard", "mayContainNutsTreeNuts", "mayContainPeanuts", "mayContainSesame",
    "mayContainSoya", "mayContainSulphurDioxideSulphites", "milk", "molluscs", "mustard", "newDishes", "nuts",
    "options", "peanuts", "prezzoFavourites", "price1", "price2", "price3", "price4", "price5", "protein", "salt",
    "saturatedFat", "sesame", "soya", "spicy", "sugars", "sulphites", "title", "vegan", "veganOption", "vegetarian",
    "vegetarianOption",
}
NUTRIENT_FIELDS = {"calories": "calories", "protein": "protein_g", "carbohydrates": "carbs_g", "fat": "fat_g",
                   "saturatedFat": "sat_fat_g", "sugars": "sugar_g", "salt": "salt_g", "fibre": "fiber_g"}
REQUIRED = ("calories", "protein", "carbohydrates", "fat")
NUM = re.compile(r"^\d+(?:\.\d+)?$")

# Page category -> (display category, rankable). "Extras and Build Your Own" is split by RULES below.
CATEGORIES: dict[str, tuple[str, bool]] = {
    "Nibbles": ("Nibbles", True), "Starters": ("Starters", True), "Pasta": ("Pasta", True), "Pizza": ("Pizza", True),
    "Grills": ("Grills", True), "Salads": ("Salads", True), "Sides": ("Sides", True), "Desserts": ("Desserts", False),
    "Specials": ("Specials", True), "Lunch": ("Lunch", True), "Breakfast": ("Breakfast", True),
    "Afternoon Tea": ("Afternoon tea", False),               # one part of a tea stand, not an order
    "Family sharers": ("Family sharers", False),             # whole dish for 3-4 people
    "Delivery Specials": ("Delivery specials", True),
    "Dips": ("Dips", False),
    "Kids Starters": ("Kids starters", False), "Kids Mains": ("Kids mains", False),   # children's portions: not suggested
    "Kids Desserts": ("Kids desserts", False), "Kids Drinks": ("Kids drinks", False),
    "Soft Drinks": ("Soft drinks", False), "Sicilian Lemonades & Coolers": ("Lemonades and coolers", False),
    "Hot Drinks": ("Hot drinks", False), "Beer and Cider": ("Beer and cider", False),
    "No/Low Alcohol": ("No and low alcohol", False),
    "Gin & Tonics": ("Gin and tonics", False), "Spirits": ("Spirits", False), "Cocktails": ("Cocktails", False),
    "Wine": ("Wine", False),
}
BYO, EXTRAS = "Build your own", "Extras and toppings"
CATEGORY_ORDER = ["Nibbles", "Starters", "Pasta", "Pizza", "Grills", "Salads", "Sides", "Desserts", "Specials", "Lunch",
                  "Breakfast", "Afternoon tea", "Family sharers", BYO, EXTRAS, "Dips", "Kids starters", "Kids mains",
                  "Kids desserts", "Kids drinks", "Soft drinks", "Lemonades and coolers", "Hot drinks", "Beer and cider",
                  "No and low alcohol", "Delivery specials", "Gin and tonics", "Spirits", "Cocktails", "Wine"]
# Items that are not an order of their own even though their category is rankable (hand-judged from name/category).
NOT_RANKABLE = {
    "Prezzo's Sharing Board": "meant for sharing",
    "Pizzetta Salad - Served with your choice of Pizzetta": "an accompaniment to a pizzetta",
    "Custard Cream Tiramisu": "dessert", "Giant Profiterole": "dessert", "Forest Berry Cream Cake and Custard": "dessert",
    "Kinder Bueno Calzone": "dessert-style calzone (name only; the page gives no description)",
    "Avocado": "breakfast add-on", "Baked Beans": "breakfast add-on", "Cooked Sausage": "breakfast add-on",
    "Crispy Bacon": "breakfast add-on", "Egg": "breakfast add-on", "Toasted Ciabatta": "breakfast add-on",
}

# --- Rows the page prints that we do not publish (reason shown in the report) ---------------------------------------
PER_100G = re.compile(r"per\s*100\s*g", re.I)

# --- Anomalies reviewed on 2026-10-06 -------------------------------------------------------------------------------
# Held back: the page's own numbers are impossible, or two different rows share one name with no size label.
# (title, nth occurrence among the published candidates with that title) -> reason. Nothing is corrected.
HOLDBACK: dict[tuple[str, int], str] = {
    ("Ham & Mushroom - Large", 1): "printed salt 65 g is impossible, and 4P+4C+9F (834 kcal) is 22% below the printed 1070 kcal: "
                                   "the protein and salt cells look swapped; not corrected",
    ("Tuscan BBQ Chicken - Large", 1): "printed salt 96 g is impossible, and 4P+4C+9F (1083 kcal) is 25% below the printed 1450 kcal: "
                                       "the protein and salt cells look swapped; not corrected",
    ("Pepperoni, spicy sausage & chilli pizza", 1): "saturates (110 g) printed higher than fat (18 g) and the macros add up to about 222 kcal, "
                                                    "not the printed 995: the columns look shifted; not corrected",
    ("Pepperoni, spicy sausage & chilli pizza Gluten Free", 1): "saturates (117 g) printed higher than fat (19 g) and the macros add up to about 225 kcal, "
                                                               "not the printed 1000: the columns look shifted; not corrected",
    ("Butternut & mushroom spaghetti", 1): "saturates (97 g) printed higher than fat (5.1 g) and the macros add up to about 97 kcal, "
                                           "not the printed 750: the columns look shifted; not corrected",
    ("Nduja, charred corn & carbonara pizza", 1): "sugars (637 g) printed higher than carbohydrate (11 g), saturates higher than fat, and the "
                                                  "macros add up to about 299 kcal, not the printed 1135: the columns look shifted; not corrected",
    ("Innocent - Apple and Mango Juicy water", 1): "sugars (12 g) printed higher than carbohydrate (2 g) and the macros add up to about 14 kcal, "
                                                   "not the printed 55; not corrected",
    ("Margherita", 2): "the page lists two different rows named exactly 'Margherita' (985 kcal and 1145 kcal) with no size on either; "
                       "which size this one is is not stated, so it is not published (the first row is)",
    ("Meat Lovers", 2): "the page lists two different rows named exactly 'Meat Lovers' (1240 kcal and 740 kcal) with no size on either; "
                        "which size this one is is not stated, so it is not published (the first row is)",
}
# Warnings the pipeline will raise (or that a mechanical check raises) which the source itself explains. title -> note.
EXPLAINED: dict[str, str] = {
    "Stonewall Inn IPA": "kcal (122) is above 4P+4C+9F (44) because this is an alcoholic beer: alcohol energy is not in protein, carbs or fat; entered as printed",
    "Peas (Extra)": "saturates printed as 0.1 g but fat as 0 g (a rounding-level inconsistency in the source); entered as printed",
}
# Cells that are not numbers on the page: (title, field) -> printed text. The cell is left blank (not published), never fixed.
ODD_CELLS: dict[tuple[str, str], str] = {
    ("Lasagne", "salt"): "4..5",
    ("Selection of Teas", "calories"): "25 or less",   # calories only, so the row is left out anyway
}
# Duplicate titles that are different products and get a distinct name (page title, page category) -> shown name.
RENAME = {("Vegan Pepperoni", "Extras and Build Your Own"): "Vegan Pepperoni (extra)"}

PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pork|salami|chorizo|prosciutto|gammon|pancetta|n[’']?duja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_UNSTATED = re.compile(r"\b(meatballs?|bolognese|ragu|ragù|mince|minced|carbonara|meat|meaty)\b", re.I)


def tidy(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def num(s: str) -> float:
    return float(s)


def serving_from(desc: str) -> str:
    """A serving only when the page's own description states it."""
    d = tidy(desc)
    if re.fullmatch(r"\d+\s?ml", d, re.I) or re.fullmatch(r"Serves \d+-\d+ people", d):
        return d
    m = re.match(r"^(One|Two) scoops? of ", d)
    if m:
        return "1 scoop" if m.group(1) == "One" else "2 scoops"
    return ""


def read_page(path: Path) -> list[dict]:
    html = Path(path).read_text(encoding="utf-8")
    if html.count(DATA_KEY) != 1:
        raise SystemExit(f"The page no longer has exactly one '{DATA_KEY.strip()}' block ({html.count(DATA_KEY)}): "
                         "the page layout changed, re-check how the data is embedded before running again.")
    dec = json.JSONDecoder(parse_float=str, parse_int=str)  # keep every number exactly as written
    data, _ = dec.raw_decode(html, html.index(DATA_KEY) + len(DATA_KEY))
    if not isinstance(data, list):
        raise SystemExit("menuCategoryData is not a list any more.")
    rows = []
    counts: dict[str, int] = {}
    for cat in data:
        name = cat["name"]
        counts[name] = len(cat["menuItems"])
        for it in cat["menuItems"]:
            extra = set(it) - EXPECTED_ITEM_KEYS
            missing = EXPECTED_ITEM_KEYS - set(it)
            if extra or missing:
                raise SystemExit(f"{name} / {it.get('title')!r}: item fields changed (new {sorted(extra)}, missing {sorted(missing)}): "
                                 "re-check what they mean (e.g. a sodium field) before running again.")
            if it["itemOptions"]:
                raise SystemExit(f"{name} / {it['title']!r} now has itemOptions (size options): extend prezzo.py to read them.")
            rows.append({"page_category": name, **it})
    if counts != EXPECTED_BY_PAGE_CATEGORY or len(rows) != EXPECTED_ROWS:
        diff = {k: (EXPECTED_BY_PAGE_CATEGORY.get(k), counts.get(k)) for k in set(counts) | set(EXPECTED_BY_PAGE_CATEGORY)
                if counts.get(k) != EXPECTED_BY_PAGE_CATEGORY.get(k)}
        raise SystemExit(f"The page has {len(rows)} rows (expected {EXPECTED_ROWS}); categories that changed "
                         f"(expected, now): {diff}. The menu changed: re-check the new/removed rows, then update EXPECTED_* in prezzo.py.")
    return rows


def classify(rows: list[dict]):
    """-> (candidates in page order, excluded [(page_category, title, reason)], duplicates [(page_category, title)])."""
    candidates: list[dict] = []
    excluded: list[tuple[str, str, str]] = []
    duplicates: list[tuple[str, str]] = []
    unknown_odd: list[str] = []
    for r in rows:
        title, cat = tidy(r["title"]), r["page_category"]
        if cat not in CATEGORIES and cat != "Extras and Build Your Own":
            raise SystemExit(f"Unknown page category {cat!r}: add it to CATEGORIES in prezzo.py.")
        if PER_100G.search(r["description"]):
            excluded.append((cat, title, "the row's own description says its figures are per 100g (we never use per-100g values)"))
            continue
        vals = {k: r[k].strip() for k in NUTRIENT_FIELDS}
        odd = {k for k, v in vals.items() if v != "" and not NUM.match(v)}
        for k in sorted(odd):
            if ODD_CELLS.get((title, k)) != vals[k]:
                unknown_odd.append(f"{cat} / {title}: {k}={vals[k]!r}")
        if all(v == "" for v in vals.values()):
            excluded.append((cat, title, "no nutrition printed"))
            continue
        missing_req = [k for k in REQUIRED if vals[k] == "" or k in odd]
        if missing_req:
            printed = [k for k, v in vals.items() if v != "" and k not in odd]
            excluded.append((cat, title, f"required nutrition not printed (missing {', '.join(missing_req)}; "
                                         f"prints {', '.join(printed) or 'no usable number'})"))
            continue
        candidates.append({"row": r, "title": title, "cat": cat, "vals": {k: ("" if k in odd else v) for k, v in vals.items()},
                           "odd": {k: vals[k] for k in odd}})
    if unknown_odd:
        raise SystemExit("Unreadable nutrition cells that were not reviewed: " + "; ".join(unknown_odd))

    # Duplicate titles: identical rows (same menu item listed in several categories) keep the first; different rows are
    # either a known different product (renamed) or the known unlabelled pairs, otherwise stop.
    seen: dict[str, list[dict]] = {}
    out: list[dict] = []
    for c in candidates:
        c["name"] = RENAME.get((c["title"], c["cat"]), c["title"])
        prior = seen.setdefault(c["name"].lower(), [])
        if any(p["vals"] == c["vals"] for p in prior):
            duplicates.append((c["cat"], c["title"]))
            continue
        if prior and (c["title"], len(prior) + 1) not in HOLDBACK:
            raise SystemExit(f"Two different rows are both named {c['title']!r} ({prior[0]['cat']} and {c['cat']}): re-check by hand.")
        c["occurrence"] = len(prior) + 1
        prior.append(c)
        out.append(c)
    return out, excluded, duplicates


def flags(c: dict) -> list[str]:
    """Mechanical anomaly checks (the first three mirror the pipeline's energy warning)."""
    v = {k: (float(x) if x != "" else None) for k, x in c["vals"].items()}
    kcal, p, cb, f = v["calories"], v["protein"], v["carbohydrates"], v["fat"]
    est = 4 * p + 4 * cb + 9 * f
    out = []
    if (kcal >= 50 and abs(est - kcal) > 0.15 * kcal) or (kcal < 50 and est - kcal > 25):
        out.append(f"energy check: 4P+4C+9F = {est:.0f} vs printed {kcal:.0f} kcal")
    if v["saturatedFat"] is not None and v["saturatedFat"] > f:
        out.append(f"saturates {c['vals']['saturatedFat']} > fat {c['vals']['fat']}")
    if v["sugars"] is not None and v["sugars"] > cb:
        out.append(f"sugars {c['vals']['sugars']} > carbs {c['vals']['carbohydrates']}")
    if v["salt"] is not None and v["salt"] > 13:
        out.append(f"salt {c['vals']['salt']} g")
    return out


def build_items(cands: list[dict]):
    items, held, notes_log = [], [], []
    seen_holdback: set[tuple[str, int]] = set()
    unreviewed = []
    for c in cands:
        r, name = c["row"], c["name"]
        key = (c["title"], c["occurrence"])
        fl = flags(c)
        notes = []
        if key in HOLDBACK:
            seen_holdback.add(key)
        elif fl and name not in EXPLAINED:
            unreviewed.append(f"{name}: {'; '.join(fl)}")
        if name in EXPLAINED and fl:
            notes.append(EXPLAINED[name])
        elif name in EXPLAINED:
            raise SystemExit(f"{name!r} is listed in EXPLAINED but no longer raises a flag: remove it from prezzo.py.")
        if c["cat"] == "Extras and Build Your Own":
            display, rankable = (BYO, True) if c["title"].endswith(" - BYO") else (EXTRAS, False)
        else:
            display, rankable = CATEGORIES[c["cat"]]
        if c["title"] in NOT_RANKABLE:
            rankable = False
        for k, printed in c["odd"].items():
            notes.append(f"{k} printed as {printed!r} (not a number): left blank, not corrected")
        if c["vals"]["salt"] == "" and "salt" not in c["odd"]:
            notes.append("salt not printed")
        if (c["title"], 2) in HOLDBACK and c["occurrence"] == 1:
            notes.append("the page lists a second, different row with this exact name; that one is held back (see holdback.csv)")
        veg = bool(r["vegetarian"] or r["vegan"])
        text = f"{name} {r['description']}"
        pork, beef = PORK.search(text), BEEF.search(text)
        tags = []
        if veg:
            tags.append("vegetarian")
            if pork or beef:
                notes.append(f"marked vegetarian/vegan by Prezzo but the text mentions {(pork or beef).group(0)!r}: not given a meat tag")
                notes_log.append(("veg mark vs meat word", name, (pork or beef).group(0)))
        else:
            if pork:
                tags.append("contains_pork")
            if beef:
                tags.append("contains_beef")
            if not pork and not beef and MEAT_UNSTATED.search(text):
                notes_log.append(("meat type not stated", name, MEAT_UNSTATED.search(text).group(0)))
        it = {
            "id": slug(name) if c["occurrence"] == 1 else f"{slug(name)}-{c['occurrence']}", "name": name, "category": display,
            "serving": serving_from(r["description"]), "rankable": rankable, "limited_time": False,
            "tags": "|".join(tags), "notes": "; ".join(notes),
        }
        for src, dst in NUTRIENT_FIELDS.items():
            it[dst] = c["vals"][src]
        items.append(it)
        if key in HOLDBACK:
            held.append((it["id"], HOLDBACK[key]))
    if unreviewed:
        raise SystemExit("New anomalies that were not reviewed (hold the item back or explain it in prezzo.py):\n  " + "\n  ".join(unreviewed))
    gone = sorted(set(HOLDBACK) - seen_holdback)
    if gone:
        raise SystemExit(f"HOLDBACK names rows that are no longer on the page or no longer match: {gone}. Re-check, then update prezzo.py.")
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    ids = [i["id"] for i in items]
    if len(ids) != len(set(ids)):
        raise SystemExit(f"Duplicate item ids {sorted({i for i in ids if ids.count(i) > 1})}: re-check by hand.")
    if any(i.startswith(("var-", "combo-")) for i in ids):
        raise SystemExit("Reserved id prefix in an item id.")
    return items, held, notes_log


def fetch(dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
        print(f"HTTP {resp.status}; Last-Modified: {resp.headers.get('Last-Modified', '(none)')}; Date: {resp.headers.get('Date')}")
    path = dest / "allergens.html"
    path.write_bytes(body)
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--fetch", type=Path, help="download the page once into this folder, then extract")
    g.add_argument("--html", type=Path, help="extract from a page saved earlier")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was read")
    ap.add_argument("--out", type=Path, default=None, help="default: data/source/prezzo")
    ap.add_argument("--verbose", action="store_true", help="also list every excluded row")
    args = ap.parse_args()

    path = fetch(args.fetch) if args.fetch else args.html
    rows = read_page(path)
    cands, excluded, duplicates = classify(rows)
    items, held, notes_log = build_items(cands)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Prezzo", cuisine="Italian", source_title=SOURCE_TITLE.format(checked_on=args.checked_on),
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["prezzo", "prezzo italian", "prezzo italian restaurant"],
        items=items, out=args.out, holdback=held,
        note=("Prezzo's allergen page does not say what its figures are per; they look like one whole dish as served. "
              "Dishes the page gives no full nutrition for, and a few whose figures cannot be right, are not shown."),
    )
    by_cat: dict[str, int] = {}
    for i in items:
        by_cat[i["category"]] = by_cat.get(i["category"], 0) + 1
    print(f"page rows {len(rows)}; wrote {len(items)} items ({len(held)} of them held back, so {len(items) - len(held)} published) to {out}")
    print(f"source sha256 {sha256_file(path)}")
    print("by category:", ", ".join(f"{k} {v}" for k, v in by_cat.items()))
    print(f"duplicates dropped (same menu item listed in more than one category): {len(duplicates)}")
    reasons: dict[str, int] = {}
    for _, _, why in excluded:
        reasons[why.split(" (")[0].split(";")[0]] = reasons.get(why.split(" (")[0].split(";")[0], 0) + 1
    print("excluded:", len(excluded), reasons)
    for kind in ("meat type not stated", "veg mark vs meat word"):
        names = [f"{n} [{w}]" for k, n, w in notes_log if k == kind]
        print(f"{kind}: {len(names)}")
    if args.verbose:
        for e in excluded:
            print("  excluded:", e)
        for kind, name, word in notes_log:
            print(f"  {kind}: {name} [{word}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
