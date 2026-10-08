#!/usr/bin/env python3
"""Build data/source/heartwood-inns/ from Heartwood Inns' own menus with nutrition and allergens (hosted by Ten Kites).

    python3 tools/uk_extract/heartwood_inns.py --pages DIR --checked-on 2026-10-08 [--fetch] [--report]

DIR holds the seven saved menu pages (see MENUS); --fetch downloads them first (one request per page, one second apart, robots.txt of
menus.tenkites.com disallows only /fonts/, /views/ and *.less). The pages are the menus heartwoodinns.com/menu/* embeds:
    https://menus.tenkites.com/hwc/hwialacarte         (opens on the "Weekday Lunch" tab; the same URL with ?mguid=... is "à la carte")
    https://menus.tenkites.com/hwc/hwisaturday | hwisundaynew | hwikids | hwibarmenu | hwidrinks
Every dish, and every choice inside a "build your own" block (bun, egg or no egg, add-ons, dressings, ice-cream flavours...), has an info
pop-up (a visible info icon beside the dish) with "Nutrition (per serving)": Energy (kCal), Protein, Carb, of which Sugars, Fat, Sat Fat,
Salt, all in grams, plus "Suitable for:", "Contains:" and "May contain:". The page prints no kJ, weight, fibre, mono/poly/trans fat or caffeine,
so none of those columns exist for this chain. heartwood_inns_pages.py reads the pop-ups; numbers are copied exactly as printed ("1,633" ->
"1633"). The reading is cross-checked against the schema.org menu the same page embeds (same names, same calories; "0" is printed as an
empty calorie field there) and against the kcal shown on each dish line.

Nutrition is published behind the page's own visible "Hide Nutrition" switch (toolbar, set to "Yes" = hidden when the page opens; the
pages hide it with CSS class k10-recipe_nutrition_no until a visitor switches it to "No"). With it off, each dish line shows its kcal and each
info pop-up shows the table; this was checked by rendering the pages in a browser and reading the visible text (see the report). So it counts as
published. Availability printed on the pages: Weekday Lunch "Monday to Friday 12pm-5pm"; à la carte and Saturday "Monday to Friday from 5pm
and Saturday All Day".

Allergens (docs/DATA.md "Allergens"): complete. Each pop-up prints "Contains: ..." (cereals and tree nuts named in brackets) or "This dish
contains none of the listed allergens", and optionally "May contain: ..."; the dish also carries the label ids the page's own allergen
filter reads, and tenkites_c.allergens_checked stops the run if the two disagree for any dish. Only the vegetarian tag comes from the
pop-up's own "Suitable for:" line (Vegetarian or Vegan).

What is left out, and why (each is counted in the run's report):
- Wines (hwiwines, 56 wines): 50 print 0 for every nutrient and the other six print figures with no glass or bottle size.
- Group dining / canapes (hwiprivatedining, five tabs, two of them single-venue menus for Berkhamsted and Teddington) and the Christmas
  party / Christmas Day menus (hwichristmas): pre-booked group or seasonal menus, not the everyday menu.
- Rows whose own numbers are impossible or contradict each other are HELD BACK (holdback.csv), never corrected; the rules are in HOLD_RULES.
- "Three scoops" rows of the ice-cream block (see HOLD_NAMES): 46 kcal and 0 kcal for three scoops, when one scoop is 88-104 kcal on the same page.
"""
from __future__ import annotations
import argparse
import re
import sys
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import heartwood_inns_pages as hp  # noqa: E402
import tenkites_a as ta  # noqa: E402  (meat words, tidy_name)
import tenkites_c as tk  # noqa: E402
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "heartwood-inns"
BASE = "https://menus.tenkites.com/hwc/"
ALACARTE_ID = "17b9f382-1a43-465b-aedf-97790cae887d"
# (file, url, label, pop-ups the page holds). Order matters: the first page that has a dish decides its category.
MENUS = [
    ("hwialacarte_a_la_carte.html", BASE + "hwialacarte?mguid=" + ALACARTE_ID, "À la carte", 74),
    ("hwialacarte_weekday_lunch.html", BASE + "hwialacarte", "Weekday Lunch", 75),
    ("hwisaturday.html", BASE + "hwisaturday", "Saturday", 74),
    ("hwisundaynew.html", BASE + "hwisundaynew", "Sunday", 66),
    ("hwibarmenu.html", BASE + "hwibarmenu", "Bar menu", 26),
    ("hwikids.html", BASE + "hwikids", "Kids", 23),
    ("hwidrinks.html", BASE + "hwidrinks", "Drinks", 140),
]
SOURCE_URL = BASE + "hwialacarte"
SOURCE_TITLE = ("Heartwood Inns menus with nutrition and allergens (Ten Kites pages embedded on heartwoodinns.com/menu): "
                "à la carte, Weekday Lunch, Saturday, Sunday, Bar, Kids and Drinks (accessed 2026-10-08, no date shown)")
ALLERGEN_TITLE = ("Heartwood Inns menus with allergens (Ten Kites): per-dish 'Contains' and 'May contain' on the same pages "
                  "(accessed 2026-10-08, no date shown)")
NOTE = ("Figures are per serving from Heartwood Inns' own menu pages (no fibre, kJ or weights printed). Weekday Lunch dishes are served "
        "Monday to Friday 12pm-5pm; the à la carte Monday to Friday from 5pm and all day Saturday. Wine, group dining and Christmas menus "
        "are not included. Alcoholic drinks print calories that include the alcohol.")
assert len(NOTE) < 400
ALIASES = ["heartwood inns", "heartwood inn", "coat & bear", "meadow lark", "potter's heron", "ragged robin", "ropemaker", "royal forest"]

LABELS = OrderedDict([  # printed row name -> items.csv column
    ("Energy (kCal)", "calories"), ("Protein (g)", "protein_g"), ("Carb (g)", "carbs_g"), ("of which Sugars (g)", "sugar_g"),
    ("Fat (g)", "fat_g"), ("Sat Fat (g)", "sat_fat_g"), ("Salt (g)", "salt_g")])
CAPTION = "Nutrition (per serving)"

# ---------------------------------------------------------------- categories
ADDONS = "Add-ons & extras"
FOOD_CATEGORY = {   # printed course -> (category, rankable)
    "Nibbles": ("Nibbles", False), "Small plates": ("Small plates", True), "Nibbles & small plates": ("Small plates", True),
    "Sharing plates": ("Sharing plates", False), "Seasonal set starters": ("Seasonal set starters", True),
    "Starters": ("Starters", True), "Seasonal set mains": ("Seasonal set mains", True), "Mains": ("Mains", True),
    "Feeling extra peckish?": ("Mains", True),
    "Chargrilled grass-fed, dry-aged steaks": ("Steaks", True), "Our Roasts": ("Sunday roasts", True),
    "Sides": ("Sides", False), "Seasonal set desserts": ("Seasonal set desserts", False),
    "Puddings and cheese": ("Puddings and cheese", False),
    "Scrummy starters": ("Kids: Starters", False), "Marvellous mains": ("Kids: Mains", False),
    "Sweet tweets": ("Kids: Desserts", False), "Delightful drinks": ("Kids: Drinks", False),
}
DRINK_CATEGORY = {   # first printed course of the drinks page -> category
    "Our seasonal favourites": "Drinks: Cocktails", "Classic cocktails": "Drinks: Cocktails", "The Spritz list": "Drinks: Cocktails",
    "Gin menu": "Drinks: Gin", "Beers & Ciders": "Drinks: Beer & cider", "Low and no-alcohol": "Drinks: Low & no alcohol",
    "Fruit juices & soft drinks": "Drinks: Soft drinks & mixers",
    "Fever-Tree Refreshingly Light Mixers 200ml": "Drinks: Soft drinks & mixers",
    "Spirits": "Drinks: Spirits & liqueurs", "Liqueur coffees": "Drinks: Liqueur coffees",
}
CATEGORY_ORDER = ["Nibbles", "Small plates", "Sharing plates", "Starters", "Seasonal set starters", "Mains", "Seasonal set mains", "Steaks",
                  "Sunday roasts", "Sides", "Puddings and cheese", "Seasonal set desserts", ADDONS,
                  "Kids: Starters", "Kids: Mains", "Kids: Desserts", "Kids: Drinks",
                  "Drinks: Cocktails", "Drinks: Gin", "Drinks: Beer & cider", "Drinks: Low & no alcohol", "Drinks: Soft drinks & mixers",
                  "Drinks: Spirits & liqueurs", "Drinks: Liqueur coffees"]
# accompaniments to a dish, not an order: never suggested by "Best for you"
NOT_RANKABLE_DISHES = {"Rustica olives"}
ALCOHOL_COURSES = {"Our seasonal favourites", "Classic cocktails", "The Spritz list", "Gin menu", "Beers & Ciders", "Spirits", "Liqueur coffees"}
NOT_ALCOHOL_PARTS = {"Alcohol Free", "Low/No Alcohol"}
# typing slips in the names the pages print (names only; no number is ever touched)
NAME_FIXES = [("classice", "classic"), ("Grapefuit", "Grapefruit"), ("Margarita(on", "Margarita (on"),
              ("Lyre's Agave Blanco 9non-alcoholic)", "Lyre's Agave Blanco (non-alcoholic)"), ("Free range", "Free-range")]

# ---------------------------------------------------------------- held back (checked on every run)
HOLD_ENERGY = 0.35      # the row's kcal and its own 4P+4C+9F differ by more than this share of the kcal
HOLD_SALT_G = 15.0      # grams of salt in one portion
HOLD_NAMES = {          # (name as printed on the page, block) -> reason: contradicted by other figures on the same page
    ("three scoops & biscuit", "Jude's ice creams and sorbets"):
        "46 kcal for three scoops of ice cream and a biscuit is less than half of any single flavour listed beside it (88-104 kcal each), so the figure cannot be right.",
}


def hold_reasons(nums: dict, alcohol: bool) -> list:
    """Reasons a row's own numbers cannot all be right (the row is held back, never corrected)."""
    f = {k: float(v) for k, v in nums.items() if v != ""}
    out = []
    if f["calories"] == 0 and f["protein_g"] == 0 and f["carbs_g"] == 0 and f["fat_g"] == 0:
        out.append("every nutrient is printed as 0: a placeholder, not a measurement.")
    if f["sat_fat_g"] > f["fat_g"] + 0.05:
        out.append(f"saturates {nums['sat_fat_g']} g exceed total fat {nums['fat_g']} g.")
    if f["sugar_g"] > f["carbs_g"] + 0.05:
        out.append(f"sugars {nums['sugar_g']} g exceed carbohydrate {nums['carbs_g']} g.")
    if f["salt_g"] > HOLD_SALT_G:
        out.append(f"salt {nums['salt_g']} g in one portion is not credible (no other dish on the pages prints more than 13.4 g, and that one is for two).")
    est = 4 * f["protein_g"] + 4 * f["carbs_g"] + 9 * f["fat_g"]
    cal = f["calories"]
    if cal >= 50:
        gap = (est - cal) if alcohol else abs(est - cal)       # alcohol adds energy the three macros don't show
        if gap / cal > HOLD_ENERGY:
            out.append(f"the table prints {nums['calories']} kcal, but its own macros ({nums['protein_g']} g protein, {nums['carbs_g']} g carbs, "
                       f"{nums['fat_g']} g fat) add up to about {est:.0f} kcal.")
    elif est > cal + 50:
        out.append(f"the table prints {nums['calories']} kcal, but its own macros add up to about {est:.0f} kcal.")
    return out


# ---------------------------------------------------------------- names
def fix(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    for old, new in NAME_FIXES:
        text = text.replace(old, new)
    return text


def cap(text: str) -> str:
    text = fix(text)
    return text[:1].upper() + text[1:]


def ascii_slug(name: str) -> str:
    """slug() for ids, with accents dropped first ('Provençale' -> 'provencale', not 'proven-ale')."""
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii"))


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("&", "and"))


SIZE = re.compile(r"\((\d+\s?ml(?: can)?)\)$|\b(\d+\s?ml)$", re.I)


def serving_for(row: dict, name: str, alcohol: bool) -> str:
    course = row["path"][0] if row["path"] else ""
    m = SIZE.search(name)
    if m:
        return re.sub(r"\s+(?=ml)", "", m.group(1) or m.group(2))
    if "for two" in name.lower():
        return "for two"
    if row["path"][:2] == ["Spirits", "Blended Scotch"]:   # the page heads the whole whisky group "Whiskies - 25ml" (checked in read_pages)
        return "25ml"
    for part in row["path"]:     # "Vodkas - 25ml", "Ports - 50ml", "Liqueurs & vermouths - 25ml unless stated"
        m = re.search(r"- (\d+ml)", part)
        if m:
            return m.group(1)
    if course.endswith("Mixers 200ml"):
        return "200ml"
    if course == "Beers & Ciders" and "(can)" not in name and "ml" not in name:   # the course says "330ml bottle unless stated"
        return "330ml bottle"
    return ""


def item_name(row: dict) -> str:
    nm, block, sec = cap(row["name"]), cap(row["block"]), row["section"]
    if row["kind"] == "dish":
        return nm
    if sec in ("Add:", "Add"):
        kind = "burger add-on" if block else "steak add-on" if row["path"] and row["path"][0].startswith("Chargrilled") else ""
        if not kind:
            raise SystemExit(f"unexpected 'Add:' list under {row['path']}: add a rule")
        return f"{nm} ({kind})"
    if sec == "choose two:":
        return f"{nm} (burger add-on)"      # the kids' burger's free toppings are the same foods as the adult add-ons
    if sec == "Choice of dressing":
        return nm if "dressing" in nm.lower() else f"{nm} (salad dressing)"
    if sec in ("Ice cream:", "Sorbet:"):
        return f"{sec[:-1]}: {nm}"
    if sec:
        raise SystemExit(f"unknown choice heading {sec!r} under {block!r}: add a rule")
    if block.startswith("Jude's ice cream") and row["path"] and row["path"][0] == "Sweet tweets":
        return f"Ice cream: {nm}"
    if block:
        return f"{block} ({fix(row['name'])})"
    return nm


def classify(row: dict, menu: str):
    """-> (category, rankable). Raises on a course it doesn't know, so a new section can't slip in unseen."""
    path = row["path"]
    course = path[0] if path else ""
    if menu == "Drinks":
        if course not in DRINK_CATEGORY:
            raise SystemExit(f"Drinks: new section {course!r}: add it to DRINK_CATEGORY")
        return DRINK_CATEGORY[course], False
    if course not in FOOD_CATEGORY:
        raise SystemExit(f"{menu}: new section {course!r}: add it to FOOD_CATEGORY")
    cat, rank = FOOD_CATEGORY[course]
    if row["kind"] == "choice" and row["section"] in ("Add:", "Add", "Choice of dressing", "choose two:"):
        return ADDONS, False
    if row["name"] in NOT_RANKABLE_DISHES or "for two" in row["name"].lower() or ta.SHARING.search(row["name"]):
        rank = False
    return cat, rank


def is_alcohol(row: dict, name: str) -> bool:
    if not row["path"] or row["path"][0] not in ALCOHOL_COURSES:
        return False
    if any(p in NOT_ALCOHOL_PARTS for p in row["path"]) or re.search(r"non-alcoholic|\b0\.0%", name, re.I):
        return False
    return True


ANIMALS = re.compile(r"\b(trout|bream|monkfish|haddock|hake|crab|scallops?|lobster|mussels?|prawns?|duck|venison|chicken)\b", re.I)


def tags_for(row: dict) -> tuple:
    """(tags, meat type not stated). vegetarian only from the pop-up's own 'Suitable for'; pork/beef from the dish's printed name
    or description (a choice inside a dish also counts the dish's name; an add-on does not), or the steaks course, whose heading and
    text say British beef."""
    suitable = {s.lower() for s in row["suitable"]}
    if "vegetarian" in suitable or "vegan" in suitable:
        return "vegetarian", False
    parts = [fix(row["name"]), row["desc"]]
    if not row["section"]:
        parts += [row["block"], row["block_desc"]]
    text = " ".join(parts)
    tags = []
    if ta._PORK.search(text):
        tags.append("contains_pork")
    if ta._BEEF.search(text) or (row["kind"] == "dish" and row["path"][:1] == ["Chargrilled grass-fed, dry-aged steaks"]):
        tags.append("contains_beef")
    meaty = bool(ta._MEATY.search(text) or re.search(r"charcuterie|scotch egg", text, re.I))
    unstated = meaty and not ta._ANIMAL.search(text) and not ANIMALS.search(text) and not tags
    return "|".join(tags), unstated


# ---------------------------------------------------------------- reading
def read_pages(pages_dir: Path) -> tuple:
    rows, report, hashes = [], [], []
    for fname, _, label, expected in MENUS:
        text = (pages_dir / fname).read_text(encoding="utf-8")
        got = hp.read_menu(text)
        if len(got) != expected:
            raise SystemExit(f"{fname} ({label}) has {len(got)} pop-ups but this script expects {expected}: the menu changed, re-check the rules.")
        if len(hp.menu_tabs(text)) not in (0, 2):
            raise SystemExit(f"{fname}: the tab bar changed: {hp.menu_tabs(text)}")
        # the embedded schema.org menu must agree with the pop-ups (names and calories); a zero is an empty field there
        html_side = Counter((r["name"], r["nutrients"]["Energy (kCal)"]) for r in got)
        ld_side = Counter((n, c.replace(",", "") or "0") for _, n, c in hp.json_ld_items(text))
        diff = (html_side - ld_side, ld_side - html_side)
        if diff != (Counter(), Counter()) and diff != (Counter({("Glenfiddich 15 year dram", "56"): 1}), Counter({("Glenfiddich 15yr", "56"): 1})):
            raise SystemExit(f"{fname}: pop-ups and the embedded menu disagree: {diff}")
        if diff[0]:
            report.append(f"{label}: the page's embedded data names 'Glenfiddich 15yr' where the dish line says 'Glenfiddich 15 year dram' (same 56 kcal)")
        if label == "Drinks" and "Whiskies - 25ml" not in tk.parse_html(text).text():
            raise SystemExit("the Drinks page no longer has the 'Whiskies - 25ml' heading that serving_for relies on")
        for r in got:
            if r["caption"] != CAPTION:
                raise SystemExit(f"{label} > {r['name']}: table is headed {r['caption']!r}, not {CAPTION!r}")
            if list(r["nutrients"]) != list(LABELS):
                raise SystemExit(f"{label} > {r['name']}: nutrient rows are {list(r['nutrients'])}, expected {list(LABELS)}")
            if r["shown_kcal"].replace(",", "") != f"{r['nutrients']['Energy (kCal)']} kcal":
                raise SystemExit(f"{label} > {r['name']}: the dish line shows {r['shown_kcal']!r} but the pop-up says {r['nutrients']['Energy (kCal)']}")
            r["menu"] = label
            rows.append(r)
        hashes.append((fname, tk.sha256_text_file(pages_dir / fname) if hasattr(tk, "sha256_text_file") else ""))
    return rows, report, hashes


def build(pages_dir: Path) -> tuple:
    rows, report, hashes = read_pages(pages_dir)
    items, seen = [], {}
    stats = Counter()
    for r in rows:
        name = item_name(r)
        alcohol = is_alcohol(r, name)
        if r["path"] and r["path"][0] == "Low and no-alcohol" and "Non-alcoholic cocktails" in r["path"] and "non-alcoholic" not in name.lower():
            name += " (non-alcoholic)"
        if r["path"] and r["path"][0] == "Liqueur coffees":
            name = f"{name} (liqueur coffee)" if "coffee" not in name.lower() else name
        nums = {col: r["nutrients"][lab] for lab, col in LABELS.items()}
        for col, v in nums.items():
            if not re.match(r"^\d+(\.\d+)?$", v):
                raise SystemExit(f"{r['menu']} > {name}: {col} is {v!r}, not a plain number: decide how to read it")
        allergens = tk.allergens_checked(r, f"{r['menu']} > {name}")
        if allergens is None:
            raise SystemExit(f"{r['menu']} > {name}: no allergen information to read")
        key = (norm(name), tuple(nums.values()))
        if key in seen:
            first = seen[key]
            if first["allergens"] != allergens:
                raise SystemExit(f"{name!r} is printed twice with the same numbers but different allergens ({first['menu']} / {r['menu']})")
            first["_also"].append(r["menu"])
            stats["duplicates dropped"] += 1
            continue
        category, rankable = classify(r, r["menu"])
        tags, unstated = tags_for(r)
        item = {"id": ascii_slug(name), "name": name, "category": category, "serving": serving_for(r, name, alcohol), **nums, "tags": tags,
                "rankable": rankable, "allergens": allergens, "menu": r["menu"], "_also": [], "_row": r, "_alcohol": alcohol,
                "_unstated": unstated}
        seen[key] = item
        items.append(item)
    by_name = {}
    for it in items:
        by_name.setdefault(norm(it["name"]), []).append(it)
    for group in by_name.values():
        if len(group) > 1:
            raise SystemExit(f"two different rows share the name {group[0]['name']!r} ({[g['menu'] for g in group]}): add a naming rule")
    holds = []
    for it in items:
        r = it["_row"]
        reasons = hold_reasons({c: it[c] for c in LABELS.values()}, it["_alcohol"])
        special = HOLD_NAMES.get((r["name"], r["block"]))
        if special:
            reasons.append(special)
        if reasons:
            holds.append((it["id"], " ".join(reasons)))
            it["_held"] = True
    notes_by = []
    for it in items:
        r = it["_row"]
        bits = [f"Source: {it['menu']} > {' > '.join(r['path'])}" + (f" > {r['block']}" if r["block"] else "")]
        if it["_also"]:
            bits.append("also on " + ", ".join(sorted(set(it["_also"]))))
        if it["_alcohol"]:
            bits.append("energy includes alcohol")
        it["notes"] = "; ".join(bits)
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    for it in items:
        if it["category"] not in order:
            raise SystemExit(f"category {it['category']!r} is not in CATEGORY_ORDER")
    items.sort(key=lambda it: order[it["category"]])
    return items, holds, report, hashes, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    if args.fetch:
        for fname, url, _, _ in MENUS:
            tk.fetch(url, args.pages / fname)
    items, holds, report, hashes, stats = build(args.pages)
    public = []
    for it in items:
        public.append({k: v for k, v in it.items() if not k.startswith("_") and k != "menu"})
    if not holds:
        (Path(args.out) / "holdback.csv").unlink(missing_ok=True)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Heartwood Inns", cuisine="Pub", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=public, out=args.out, note=NOTE, holdback=holds,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    print(f"wrote {len(items)} items to {out} ({len(holds)} held back); {dict(stats)}")
    print("by category:", dict(Counter(i["category"] for i in items)))
    for fname, digest in hashes:
        print(f"{fname} sha256 {digest}")
    print("meat type not stated:", sum(1 for i in items if i["_unstated"]), [i["name"] for i in items if i["_unstated"]])
    for line in report:
        print("note:", line)
    if args.report:
        print("-- held back:")
        for hid, why in holds:
            print("  ", hid, "::", why)
    return 0


if __name__ == "__main__":
    sys.exit(main())
