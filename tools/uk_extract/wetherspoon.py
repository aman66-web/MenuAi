#!/usr/bin/env python3
"""Build data/source/wetherspoon/ from JD Wetherspoon's own allergen and nutrition guide (the page www.jdwetherspoon.com/food-drink/
sends visitors to: https://allergens.jdwetherspoon.com/?pubId=<pub>).

    python3 tools/uk_extract/wetherspoon.py --cache DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds what the guide's own page loads for a visitor (see wetherspoon_pages.py): one food menu per pub, the category tree, the list of
allergens and the drinks list. --fetch captures them first (one page per pub, 10 seconds apart: the site's robots.txt says Crawl-delay 10;
needs node + playwright-core + Chromium, see wetherspoon_pages.py). Without --fetch the script only reads DIR.

What the guide prints, per dish as served (whole numbers, copied as the page prints them): Calories, Carbohydrates, Fat, Saturated Fat,
Sugar, Protein, Salt, Fibre, then 14 allergens each "Yes" or "No" and "Suitable for Vegetarians / Vegans". Salt is `salt_g` (printed in
grams), never converted. No kJ, weight, sodium or "may contain" is printed. The guide covers a pub's own menu, so there is no single
national file: every pub has its own list. The lists are nearly identical (the same dish id has identical content in every pub, checked
on all 677 distinct dishes) and differ in which dishes a pub sells. This script reads a sample of pubs (PUBS below: 51 pubs across
England, Wales and Scotland, a random draw of 36 plus 15 chosen for spread; Inverness' Kings Highway has no menu in the guide, so 50
menus) and publishes the national menu:

  * a dish is published when at least half of the sampled pubs sell it (MIN_PUBS = 25). The counts have a clear gap: 393 dishes are sold
    in 49 pubs, 22 in 46 and so on down to 42; then nothing between 9 and 41; the rest are sold in 8 or fewer. Left out (238 dishes): The
    Beehive, Crawley's whole alternative menu (188 dishes, different recipes: its Large breakfast prints 1288 kcal, the national one 1312),
    a Scottish regional menu (haggis, Scottish breakfasts, breakfast rolls: 4 of the 5 Scottish pubs read), newer recipes of burgers, panini,
    wraps and a jacket potato sold in 3 pubs (Manchester, Leeds, Birmingham), and a few dishes of Hamilton Hall and The New Crown;
  * never two different figures for what the guide shows as the same dish: if two dishes in the same section have the same printed name and
    the same description line but different numbers, both would be held back (holdback.csv). Among the published dishes there are none;
  * one row per distinct dish: the same dish listed in several sections with identical figures (Side salad, Garlic butter, Baked beans)
    is published once, in the first of its sections in the guide's own order (the sides list is preferred for a side);
  * held back: the two dishes whose own figures contradict the guide (MANUAL_HOLD, and a dish printed as 0 kcal with 0 g of everything).

Known gap in the guide itself, published as printed: 43 published dishes have SULPHUR DIOXIDE / SULPHITES in capitals in an ingredient line
(bread improvers, lemon juice, a metabisulphite in a sausage or chip coating) while the allergen table says "No" for sulphur dioxide and
sulphites (probably under the 10 mg/kg labelling threshold; the table marks it where it is above). No other allergen differs between the
capitalised ingredient words and the table on any published dish (checked all 14). The chain page note says so.

Not published: drinks (3,224 of them: the drinks list prints only an alcohol percentage, every other field is 0 and the page shows no
calories for a drink: checked below, the run stops if any drink gains calories or a volume).

Allergens (docs/DATA.md "Allergens"): complete. Every published dish carries the guide's own list of the allergens it contains (its
`allergens` ids 1-14 = Gluten, Crustaceans, Egg, Fish, Peanuts, Soybeans, Milk (Lactose), Nuts, Celery, Mustard, Sesame Seed, Sulphur dioxide
and sulphites, Lupin, Molluscs, as the guide's own allergen list names them). The ids 15 and 16 that dishes also carry are the guide's
Vegetarian and Vegan marks (checked: they equal the vegetarians / vegans fields on every dish in every pub), not allergens. The guide names
no cereal or tree nut and prints no "may contain" per dish (only general statements: shared fryer oil filtration, shared grills, many
ingredients made in factories handling other allergens), so cereals/nuts stay blank and may_contain_published is "no". The page's
"Ingredients" text is never used for allergens.

Tags: `vegetarian` where the guide marks the dish Suitable for Vegetarians (every vegan dish is also vegetarian in the data). `contains_pork`
/ `contains_beef` where the dish name, its description line or its printed ingredients name pork, bacon, ham, sausage, pepperoni, salami,
chorizo, pancetta, gammon, lardons, black pudding / beef, steak, brisket (a vegan, vegetarian or Quorn sausage, bacon or ham is not pork). Beef
collagen casings in an ingredient list count as beef; "beef flavoured" powders and the like do not. Nothing else is inferred. Dishes the guide marks neither
vegetarian nor names a meat type for are listed in the run's report ("meat type not stated").
"""
from __future__ import annotations
import argparse
import re
import sys
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wetherspoon_pages as pages  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "wetherspoon"
SOURCE_URL = "https://allergens.jdwetherspoon.com/"
ALIASES = ["wetherspoon", "wetherspoons", "jd wetherspoon", "j d wetherspoon", "j.d. wetherspoon", "spoons"]
ALLERGEN_GUIDE_TITLE = ("J D Wetherspoon allergen guide in its nutritional and allergen information pages "
                        "(allergens.jdwetherspoon.com, data version 184, accessed 2026-10-08, no date shown)")
SOURCE_TITLE = ("J D Wetherspoon allergen and nutrition guide (allergens.jdwetherspoon.com, food menus of 50 pubs, data version 184, "
                "accessed 2026-10-08, no date shown)")
NOTE = ("Whole-number figures per dish as served, from Wetherspoon's own guide, read in 50 pubs: only dishes most pubs sell are listed. "
        "A few pubs trial other recipes (different figures) and Scotland has extra dishes. Drinks print no calories. Some ingredient "
        "lists name sulphur dioxide where the allergen table says no sulphites.")
FEED_VERSION = 184  # "meta": {"version": 184} in every answer of the guide's feed on 2026-10-08
MIN_PUBS = 25  # a dish is published when at least half of the sampled pubs sell it (the counts have a gap: nothing is sold in 9 to 41 pubs)

# The sampled pubs (pubId as in the guide's address). A random draw of 36 GB pubs from the site's own pub sitemap (seed 20261008, Irish pubs
# left out) plus 15 chosen for spread: Cardiff, Caernarfon, Edinburgh, Glasgow (the guide's example), Manchester, Newcastle, Plymouth, ...
PUBS = ["42", "82", "101", "176", "183", "193", "202", "206", "207", "246", "289", "312", "446", "546", "662", "664", "777", "896", "953",
        "1014", "1044", "1090", "1195", "1233", "1715", "1739", "1795", "1856", "1883", "2080", "2341", "2700", "2930", "3789", "4312",
        "5279", "5340", "5363", "5571", "5713", "5834", "5837", "5955", "6206", "6486", "6583", "7102", "7286", "7528", "7700", "7952"]
EXPECTED = {"pubs_with_menu": 50, "ids": 677, "ids_published_candidates": 439, "conflict_dishes": 0, "held_rows": 2}

# Dishes whose own figures contradict the guide's other rows (feed dish id -> reason). Never corrected, only held back.
MANUAL_HOLD = {
    187724: ("Mini American-style pancakes (two pancakes) print 556 kcal under the same product reference and with the same figures as the "
             "four-pancake American-style pancakes (556 kcal), while the same mini portion with ice cream prints 364 kcal and the small "
             "breakfast pancakes 278 kcal: the guide's two rows cannot both be right, so this one is not published"),
}

# The guide's own allergen list (id -> printed name); anything else stops the run.
ALLERGEN_IDS = {1: "Gluten", 2: "Crustaceans", 3: "Egg", 4: "Fish", 5: "Peanuts", 6: "Soybeans", 7: "Milk (Lactose)", 8: "Nuts",
                9: "Celery", 10: "Mustard", 11: "Sesame Seed", 12: "Sulphur dioxide and sulphites", 13: "Lupin", 14: "Molluscs"}
DIET_IDS = {15: "vegetarians", 16: "vegans"}
PRINTED_WORDS = {"milk (lactose)": ("milk", None)}  # the guide's own spelling (common._A has the other 13)
NUTRIENTS = [("calories", "calories"), ("protein", "protein_g"), ("carbohydrates", "carbs_g"), ("fat", "fat_g"),
             ("saturated_fat", "sat_fat_g"), ("sugar", "sugar_g"), ("fibre", "fiber_g"), ("salt", "salt_g")]

# ---- sections: the guide's own headings, in the guide's own words; a few add-on lists are their own section.
MAIN_LABELS = {
    "BREAKFAST": "Breakfast", "SMALL PLATES": "Small plates", "Deli Deals®": "Deli deals", "JACKET POTATOES": "Jacket potatoes",
    "GOURMET JACKETS": "Gourmet jackets", "PIZZA": "Pizza", "BURGERS": "Burgers", "SALADS, PASTAS AND NOODLES": "Salads, pastas and noodles",
    "GOURMET BURGERS": "Gourmet burgers", "CHICKEN DEALS": "Chicken deals", "CHICKEN": "Chicken",
    "WINGS, BITES AND STRIPS": "Wings, bites and strips", "SIDES": "Sides", "SMALL PUB CLASSICS": "Small pub classics",
    "PUB CLASSICS": "Pub classics", "CURRIES": "Curries", "DESSERTS": "Desserts", "CHILDREN’S MENU": "Children’s menu",
    "CURRY CLUB": "Curry club", "SPECIALS": "Specials", "BAR SNACKS": "Bar snacks",
}
EXTRA_SECTIONS = {  # (heading, sub-heading) -> section shown: lists of add-ons, sauces and sides
    ("BREAKFAST", "Breakfast extras"): "Breakfast extras",
    ("BURGERS", "Additional toppings and burger patties"): "Burger toppings and extras",
    ("JACKET POTATOES", "Extra fillings"): "Jacket potato extra fillings",
    ("PIZZA", "Toppings (bases are not gluten free)"): "Pizza toppings",
    ("WINGS, BITES AND STRIPS", "Sauces and dips"): "Sauces and dips",
    ("CURRIES", "Sides"): "Curry sides",
    ("Deli Deals®", "Sides"): "Deli deal sides",
}
SUBS_THAT_ARE_PLAIN = {  # sub-headings that need no section of their own (checked: anything new stops the run)
    "BREAKFAST": {"American", "Benedicts", "Breakfast muffin deal", "Breakfast muffin", "Breakfast", "Butties and wraps", "Lite bite", "Traditional"},
    "SMALL PLATES": {"8'' Pizza"}, "Deli Deals®": {"12\" Wraps", "Paninis"}, "PIZZA": {"11\" Pizza"}, "SIDES": {"Side and extras"},
    "CHICKEN": {"Chicken baskets"}, "CURRIES": {"Classic curries", "Katsu curries", "Simple curries"},
    "CURRY CLUB": {"Classic curries", "Katsu curries"}, "BAR SNACKS": {"Biscuits", "Crisps & Nuts"},
    "CHILDREN’S MENU": {"BREAKFAST", "Smaller appetites", "Step 1", "Step 2", "Step 3", "Children's pizza", "Dessert"},
}
PIZZA_SIZES = {"8'' Pizza": "8\" pizza", "11\" Pizza": "11\" pizza"}

# ---- which dishes are an order of their own (rankable). Sections that are parts, sauces, extras, snacks, desserts, kids' meals: no.
NOT_RANKABLE_SECTIONS = {"Breakfast extras", "Burger toppings and extras", "Jacket potato extra fillings", "Pizza toppings", "Sauces and dips",
                         "Curry sides", "Deli deal sides", "Wings, bites and strips", "Sides", "Desserts", "Children’s menu", "Bar snacks"}
NOT_AN_ORDER = {  # exact printed names that are add-ons or single components inside an otherwise main section
    "Breakfast": {"Maple-flavoured syrup", "Apple", "Banana", "Honey", "Strawberries", "Blueberries", "Yoghurt pot", "Fresh fruit",
                  "Potato scone", "Haggis"},
    "Small plates": {"Garlic pizza bread", "Garlic pizza bread with cheese", "Chilli bean non-carne", "BBQ beef brisket",
                     "Spicy pulled chicken thigh", "Salt & chilli seasoning"},
    "Pizza": {"11\" Garlic pizza bread"},
    "Jacket potatoes": {"Side salad"},
    "Gourmet jackets": {"Side salad", "Garlic butter"},
    "Salads, pastas and noodles": {"Grilled chicken breast", "Chilli bean non-carne", "Chicken breast", "Maple-cured bacon",
                                   "Spicy pulled chicken thigh", "Poached egg", "Spicy coated king prawns"},
    "Pub classics": {"Chip shop-style curry sauce"}, "Small pub classics": {"Chip shop-style curry sauce"},
    "Curries": {"Garlic naan"},
    "Curry club": {"Plain naan", "Garlic naan", "Two onion bhajis", "Two vegetable samosas", "Poppadum's and dips", "Sliced chilli"},
    "Specials": {"Haggis"},
}

PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausages?|bangers|pepperoni|salami|chorizo|pancetta|lardons?|black pudding|prosciutto|nduja|’nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|brisket)\b", re.I)
FLAVOUR_ONLY = re.compile(r"\b(pork|bacon|ham|beef|sausage)[- ](?:flavou?red|flavou?rs?|flavouring|style)\b", re.I)  # "Beef Flavoured Gravy Powder" has no beef
MEATLESS_PREFIX = re.compile(r"\b(vegan|vegetarian|veggie|plant[- ]based|quorn(?:™)?)\b[^,.;:\n]{0,40}?\b(sausages?|bacon|ham|bangers|nuggets?)\b", re.I)
OTHER_TYPE = re.compile(r"\b(chicken|turkey|lamb|duck|fish|cod|haddock|salmon|tuna|prawns?|king prawns?|scampi|mussels?|crab|squid|calamari|"
                        r"anchov(?:y|ies)|sardines?|mackerel|haggis)\b", re.I)


def fail(msg: str) -> None:
    raise SystemExit("wetherspoon: " + msg)


def printed_number(v, where: str) -> str:
    if isinstance(v, bool) or not isinstance(v, int) or v < 0:
        fail(f"{where}: {v!r} is not a whole number (the page prints whole numbers); the guide changed, re-read it")
    return str(v)


def section_of(heading: str, sub: str, where: str) -> str:
    if (heading, sub) in EXTRA_SECTIONS:
        return EXTRA_SECTIONS[(heading, sub)]
    if heading not in MAIN_LABELS:
        fail(f"{where}: new heading {heading!r}: add it to MAIN_LABELS (and decide whether it is rankable)")
    if sub and sub not in SUBS_THAT_ARE_PLAIN.get(heading, set()):
        fail(f"{where}: new sub-heading {sub!r} under {heading!r}: add it to EXTRA_SECTIONS or SUBS_THAT_ARE_PLAIN")
    return MAIN_LABELS[heading]


def is_rankable(section: str, name: str) -> bool:
    if section in NOT_RANKABLE_SECTIONS:
        return False
    if name.startswith("Add ") or name in NOT_AN_ORDER.get(section, set()):
        return False
    return True


def meat_tags(dish: dict) -> tuple[bool, bool, bool]:
    """(pork, beef, another named meat or fish) from the dish name, its description line and its printed ingredient lists."""
    parts = [dish["name"], dish["summary"] or ""]
    ing = dish["ingredients"] or ""
    blocks = [b for b in ing.split("\n\n") if b.strip()]
    for b in blocks:
        lines = b.strip().split("\n")
        header, rest = lines[0], " ".join(lines[1:])
        if not MEATLESS_PREFIX.search(header) and not re.search(r"\b(vegan|vegetarian|veggie|plant[- ]based|quorn)\b", header, re.I):
            parts.append(header)
        parts.append(rest)
    text = FLAVOUR_ONLY.sub(" ", MEATLESS_PREFIX.sub(" ", " ".join(parts)))
    return bool(PORK.search(text)), bool(BEEF.search(text)), bool(OTHER_TYPE.search(text))


def common_prefix_words(texts: list[str]) -> int:
    split = [t.split() for t in texts]
    n = 0
    while all(len(s) > n for s in split) and len({s[n] for s in split}) == 1:
        n += 1
    return n


def build(cache: Path):
    data = pages.load(cache, PUBS)
    if data["versions"] != {FEED_VERSION}:
        fail(f"the guide's data version is {sorted(data['versions'])}, this script was written for {FEED_VERSION}: re-check, then update "
             "FEED_VERSION and the titles")
    # the guide's allergen list is exactly the one this script maps
    got = {i: n for i, (n, _prop) in data["allergens"].items()}
    if got != ALLERGEN_IDS:
        fail(f"the guide's allergen list changed: {got}")
    # drinks print no calories (checked, not assumed)
    drinks = data["drinks"]
    if drinks is not None:
        lit = [d["name"] for d in drinks if d["calories"] or d["volume"] or d["fat"] or d["carbohydrates"] or d["protein"] or d["sugar"]
               or d["salt"] or d["fibre"] or d["saturated_fat"]]
        if lit:
            fail(f"{len(lit)} drinks now print calories or other figures (first: {lit[:3]}): drinks must be added to this script")
    menus = {p: v["dishes"] for p, v in data["pubs"].items() if v["dishes"]}
    if len(menus) != EXPECTED["pubs_with_menu"]:
        fail(f"{len(menus)} sampled pubs have a menu, expected {EXPECTED['pubs_with_menu']}")
    # one dish id = one content, in every pub
    by_id: dict[int, dict] = {}
    pubs_of: dict[int, set] = defaultdict(set)
    for pub, dishes in menus.items():
        for d in dishes:
            pubs_of[d["id"]].add(pub)
            if d["id"] in by_id:
                a, b = dict(by_id[d["id"]]), dict(d)
                for k in ("menu_sort_order",):
                    a.pop(k, None), b.pop(k, None)
                if a != b:
                    fail(f"dish {d['id']} ({d['name']}) differs between pubs: the guide's feed no longer works as this script assumes")
            else:
                by_id[d["id"]] = d
    if len(by_id) != EXPECTED["ids"]:
        fail(f"{len(by_id)} distinct dishes in the sample, expected {EXPECTED['ids']}")
    for d in by_id.values():
        for key, _col in NUTRIENTS:
            printed_number(d[key], f"{d['name']} ({d['id']}) {key}")
        a = set(d["allergens"])
        if not a <= set(ALLERGEN_IDS) | set(DIET_IDS):
            fail(f"dish {d['id']} has an allergen id the guide's list does not define: {sorted(a - set(ALLERGEN_IDS) - set(DIET_IDS))}")
        if (15 in a) != bool(d["vegetarians"]) or (16 in a) != bool(d["vegans"]) or (d["vegans"] and not d["vegetarians"]):
            fail(f"dish {d['id']} ({d['name']}): vegetarian/vegan marks disagree with the 15/16 ids")

    # ---- which dishes are in
    sold = {i: d for i, d in by_id.items() if len(pubs_of[i]) >= MIN_PUBS}
    left_out = {i: d for i, d in by_id.items() if len(pubs_of[i]) < MIN_PUBS}
    if len(sold) != EXPECTED["ids_published_candidates"]:
        fail(f"{len(sold)} dishes are sold in {MIN_PUBS}+ sampled pubs, expected {EXPECTED['ids_published_candidates']}")

    cat_name = data["categories"]
    sub_name = data["subcategories"]
    order = data["order"]
    suborder = data["suborder"]

    def key_of(d):
        return (order[d["category"]], d["category"], suborder.get(d["sub_category"], 0), d["menu_sort_order"] or 0, d["id"])

    rows = []
    for d in sorted(sold.values(), key=key_of):
        heading, sub = cat_name[d["category"]], sub_name.get(d["sub_category"], "")
        rows.append({"d": d, "heading": heading, "sub": sub, "section": section_of(heading, sub, f"{d['name']} ({d['id']})")})

    vec = lambda d: tuple(d[k] for k, _ in NUTRIENTS)  # noqa: E731
    # ---- two figures for one dish: held back
    held: dict[int, str] = {}
    groups: dict[tuple, list] = defaultdict(list)
    for r in rows:
        d = r["d"]
        groups[(d["name"], r["heading"], r["sub"], (d["summary"] or "").strip())].append(r)
    for g in groups.values():
        if len({vec(r["d"]) for r in g}) > 1:
            for r in g:
                d = r["d"]
                held[d["id"]] = ("the guide prints different figures for this dish in different pubs (same name, same description, %s kcal here "
                                 "and %s kcal elsewhere): not chosen between" % (d["calories"], "/".join(str(x["d"]["calories"]) for x in g if x is not r)))
    if len(held) != EXPECTED["conflict_dishes"]:
        fail(f"{len(held)} dishes with conflicting figures, expected {EXPECTED['conflict_dishes']}")
    for r in rows:
        d = r["d"]
        if d["id"] in MANUAL_HOLD:
            held[d["id"]] = MANUAL_HOLD[d["id"]]
        if not d["calories"] and not any(d[k] for k, _ in NUTRIENTS):
            held[d["id"]] = "the guide prints 0 kcal and 0 g of every nutrient for this dish (the same dish shows 188 kcal on the menu of The Beehive, Crawley)"

    if len(held) != EXPECTED["held_rows"]:
        fail(f"{len(held)} dishes held back, expected {EXPECTED['held_rows']}")

    # ---- one row per distinct dish (same name apart from case, & and 'and'; same product reference, figures, allergens, marks), kept in the first section
    keep: list[dict] = []
    seen: dict[tuple, dict] = {}
    for r in rows:
        d = r["d"]
        if d["id"] in held:
            continue
        key = (slug(d["name"]), vec(d), tuple(sorted(d["allergens"])), d["dish_ref"], bool(d["vegetarians"]), bool(d["vegans"]))
        if key in seen:
            other = seen[key]
            if r["section"] == "Sides" and other["section"] != "Sides":  # the sides list is the natural home of a side
                other["also"].append(other["section"])
                other.update(d=r["d"], heading=r["heading"], sub=r["sub"], section=r["section"])
            else:
                other["also"].append(r["section"])
            continue
        r["also"] = []
        seen[key] = r
        keep.append(r)
    keep.sort(key=lambda r: key_of(r["d"]))

    # ---- names: the printed name; a dish whose name is shared by another dish gets what tells them apart, from the guide's own words
    by_name: dict[str, list] = defaultdict(list)
    for r in keep:
        by_name[r["d"]["name"]].append(r)
    for name, g in by_name.items():
        if len(g) == 1:
            g[0]["name"] = name
            continue
        sections = Counter(r["section"] for r in g)
        for r in g:
            if sections[r["section"]] == 1:
                r["qual"] = PIZZA_SIZES.get(r["sub"], r["section"]) if r["sub"] in PIZZA_SIZES else r["section"]
        same = defaultdict(list)
        for r in g:
            if "qual" not in r:
                same[r["section"]].append(r)
        for sec, rs in same.items():
            sums = [(r["d"]["summary"] or "").strip() for r in rs]
            filled = [(r, t) for r, t in zip(rs, sums) if t]
            if len(sums) - len(filled) > 1 or len({t for _, t in filled}) != len(filled):
                fail(f"cannot tell {name!r} apart in section {sec!r} from its description lines: {sums}")
            for r, t in zip(rs, sums):
                if not t:
                    r["qual"] = None  # the one dish with no description line keeps the bare printed name
            n = common_prefix_words([t for _, t in filled]) if len(filled) > 1 else 0
            quals = {}
            for r, t in filled:
                words = t.split()
                rest = " ".join(words[n:])
                if n and words[n - 1].lower() == "with":
                    rest = "with " + rest
                quals[id(r)] = rest if n else t
            if any(len(q) > 45 for q in quals.values()):  # a long description: its first clause tells them apart if it can
                short = {id(r): t.split(", ")[0] for r, t in filled}
                if len(set(short.values())) == len(short):
                    quals = short
            for r, t in filled:
                r["qual"] = quals[id(r)]
                if r["section"] == "Children’s menu":
                    r["qual"] = "Children’s menu, " + r["qual"]
        quals = [r["qual"] for r in g]
        if len(set(quals)) != len(quals):
            fail(f"cannot tell {name!r} apart: {quals}")
        for r in g:
            r["name"] = name if r["qual"] is None else f"{name} ({r['qual']})"
    ids = Counter(slug(r["name"]) for r in keep)
    for r in keep:
        if ids[slug(r["name"])] > 1:  # two different dishes whose names differ only in punctuation or case: the section tells them apart
            r["id"] = slug(f"{r['name']} {r['section']}")
    final = Counter(r.get("id") or slug(r["name"]) for r in keep)
    if any(v > 1 for v in final.values()):
        fail(f"two dishes get the same id: {[k for k, v in final.items() if v > 1]}")

    held_rows = [r for r in rows if r["d"]["id"] in held]
    for r in held_rows:  # held-back rows stay in items.csv (the pipeline drops them and lists them) under an id that cannot clash
        r["name"] = r["d"]["name"]
        r["also"] = []
        r["id"] = f"{slug(r['d']['name'])}-{r['d']['id']}"
    items, allergen_rows, report = [], [], []
    for r in sorted(keep + held_rows, key=lambda r: key_of(r["d"])):
        d = r["d"]
        row = {"id": r.get("id") or slug(r["name"]), "name": r["name"], "category": r["section"], "rankable": is_rankable(r["section"], d["name"])}
        for key, col in NUTRIENTS:
            row[col] = printed_number(d[key], "")
        if r["sub"] in PIZZA_SIZES and "pizza bread" not in d["name"].lower():  # the sub-heading states the size of a pizza
            row["serving"] = PIZZA_SIZES[r["sub"]]
        pork, beef, meat = meat_tags(d)
        tags = []
        if d["vegetarians"] or d["vegans"]:
            tags.append("vegetarian")
            # a dish the guide marks vegetarian carries no meat tag (its ingredient lists can name a "beef flavoured" powder in a vegan gravy);
            # its name and description line must not name a meat either
            text = MEATLESS_PREFIX.sub(" ", f"{d['name']} {d['summary'] or ''}")
            if PORK.search(text) or BEEF.search(text):
                fail(f"{d['name']} ({d['id']}) is marked vegetarian but its name or description names pork or beef")
            pork = beef = False
        if pork:
            tags.append("contains_pork")
        if beef:
            tags.append("contains_beef")
        row["tags"] = "|".join(tags)
        if not meat and not (d["vegetarians"] or d["vegans"]) and not pork and not beef and d["id"] not in held:
            report.append(f"meat type not stated: {row['name']}")
        also = f"; also listed under {', '.join(sorted(set(r['also'])))}" if r["also"] else ""
        row["notes"] = f"feed dish id {d['id']}, dish_ref {d['dish_ref']}, sold in {len(pubs_of[d['id']])} of {len(menus)} sampled pubs{also}"
        a_ids = set(d["allergens"]) & set(ALLERGEN_IDS)
        keys, cereals, nuts = allergen_words([ALLERGEN_IDS[i] for i in sorted(a_ids)], f"{d['name']} ({d['id']})", PRINTED_WORDS)
        row["allergens"] = {"contains": keys, "may_contain": set(), "cereals": set(), "nuts": set()}
        items.append(row)
    holdback = [(r["id"], f"{r['name']} ({r['section']}): {held[r['d']['id']]}") for r in held_rows]
    return items, holdback, report, left_out, pubs_of, held, menus


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--fetch", action="store_true", help="capture the guide's pages into --cache first (10 s apart)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        pages.capture(PUBS, args.cache)
    items, holdback, report, left_out, pubs_of, held, menus = build(args.cache)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="JD Wetherspoon", cuisine="Pub", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
        allergen_guide={"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": False})
    print(f"wrote {out}: {len(items)} items, {len(holdback)} held back, {len(left_out)} dishes left out (sold in fewer than {MIN_PUBS} of "
          f"{len(menus)} sampled pubs)")
    for line in report:
        print("  " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
