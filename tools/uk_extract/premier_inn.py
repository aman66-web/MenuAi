#!/usr/bin/env python3
"""Build data/source/premier-inn/ from Premier Inn's three official "Allergy and dietary information" PDFs.

    python3 tools/uk_extract/premier_inn.py --restaurant pi-2.pdf --breakfast breakfast.pdf --hub hub.pdf --checked-on 2026-11-17
    (add --list to print every row the script reads, with the decision taken, and write nothing)

Sources (Great Britain editions, linked from https://www.premierinn.com/gb/en/why/food.html and .../why/food/breakfast.html; the
breakfast-ireland.pdf guide is not used), all under https://www.premierinn.com/content/dam/global/restaurants/allergy-nutrition-info/ :
  pi-2.pdf        restaurant menu of the Thyme and The Social restaurants (one menu block), published 15 September 2026
  breakfast.pdf   Unlimited Continental and Unlimited Cooked Breakfast items, published 23 October 2026
  hub.pdf         Hub by Premier Inn (breakfast pages published 23 October 2026, dinner pages 20 May 2026)
(Until November 2026 the guides were allergy-nutrition-thyme-2.pdf, -breakfast.pdf and -hub.pdf of April 2026; those addresses now
answer 404.)

Numbers are copied from the PDFs as printed (kcal, fat, saturates, carbs, sugars, protein, salt; kJ is not used and the
guides print no fibre or sodium). Everything is "Per Portion"; where the printed name gives the portion ("(per piece)",
"(per 30g)") that is the serving, otherwise the one its section heading gives ("Unlimited Continental - Drinks (per 150ml)").
Only names (tidied capitalisation), categories, tags and the exclusions below are decided here. The script stops with a
clear message if the guides' rows, headings or names change, so a human re-checks.

Rules applied when the same dish is printed more than once:
  * same name, same numbers  -> one item (the repeats are dropped);
  * same name, different numbers:
      - a version found only on the "Non Gluten Containing Ingredients" menus -> its own item, named "... (non-gluten
        containing ingredients)";
      - a version found only in the Hub guide -> its own item in "Hub by Premier Inn", named "... (Hub)";
      - two or more versions on the standard menus -> NONE is published (the guide does not say which applies): all are
        written to items.csv and listed in holdback.csv.

Allergens come from the same guides: every table prints "Contains: ..." (naming the cereals and tree nuts in brackets) and
"May Contain: ..." ("No major allergens" when none). A dish printed more than once must carry the same allergens every time;
if two prints of one published dish disagree, the script stops (nothing is merged or chosen). energy_kj is the printed
per-portion kJ.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import premier_inn_pdf  # noqa: E402
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "premier-inn"
SOURCE_URL = "https://www.premierinn.com/content/dam/global/restaurants/allergy-nutrition-info/pi-2.pdf"
SOURCE_TITLE = ("Premier Inn allergy and nutrition guides: Thyme and The Social restaurant menu (published 15 September 2026), "
                "Unlimited Breakfast (23 October 2026) and Hub by Premier Inn (20 May and 23 October 2026)")
ALLERGEN_TITLE = ("Premier Inn Allergy Information Guides: Thyme and The Social restaurant menu (published 15 September 2026), "
                  "Unlimited Breakfast (23 October 2026) and Hub by Premier Inn (20 May and 23 October 2026)")
# Premier Inn's own printed spellings (common.allergen_words knows the rest). "Other Cereals containing (Oats)" is printed in the
# May Contain column; "Brazil" inside "Tree Nuts (...)".
ALLERGEN_EXTRA = {"other cereals containing": ("gluten", None), "brazil": ("nuts", "brazil nut")}
NO_ALLERGENS = "No major allergens"
ALIASES = ["premier inn", "premier inn hotel", "premier inn restaurant", "hub by premier inn"]
NOTE = ("Values are per portion from Premier Inn's own guides for its restaurants, breakfast buffet and Hub by Premier Inn "
        "(its drinks menu lists allergens only). Menus differ by hotel, so not every item is served everywhere. Dishes the "
        "guide prints twice with different numbers are not shown.")

# Things a human noticed in the guides (kept out of the numbers, which are always entered as printed). Keyed by item id.
KCAL_NOTE = "Printed kcal {dir} than the printed fat, carbs and protein add up to (about {approx}); kJ agrees with kcal; entered as printed"
EXTRA_NOTES = {
    "add-corn-ribs": KCAL_NOTE.format(dir="is lower", approx="90"),
    "house-caesar-salad-ngci": KCAL_NOTE.format(dir="is lower", approx="620"),
    "gluten-free-museli-per-50g": "Name spelled as printed",
    "museli-fruit-per-45g": "Name spelled as printed",
}

# ---- categories (display order) -------------------------------------------------------------------------------------
STARTERS, SOUP, SALADS, SAND, PIZZA, JACKET = "Starters & light bites", "Soup", "Salads & bowls", "Sandwiches & toasties", "Pizza", "Jacket potatoes"
BURGERS, GRILLS, CLASSICS, PASTA, SIDES = "Burgers", "Grills", "Classics & curries", "Pasta", "Sides"
DESSERTS, TREATS = "Desserts", "Sweet treats"
KIDSM, KIDSS, KIDSD = "Kids mains", "Kids starters & sides", "Kids desserts"
CONDI, ADDON = "Condiments", "Add-ons"
B_COOK, B_BAKE, B_FRUIT, B_CEREAL, B_PORR, B_SPREAD, B_DRINK, B_SUGAR = (
    "Cooked breakfast", "Breakfast bakery", "Breakfast fruit", "Cereals & yoghurts", "Porridge", "Spreads & preserves",
    "Breakfast drinks", "Sugar & sweetener")
HUB = "Hub by Premier Inn"
CATEGORY_ORDER = [STARTERS, SOUP, SALADS, SAND, PIZZA, JACKET, BURGERS, GRILLS, CLASSICS, PASTA, SIDES, DESSERTS, TREATS,
                  KIDSM, KIDSS, KIDSD, CONDI, ADDON, B_COOK, B_BAKE, B_FRUIT, B_CEREAL, B_PORR, B_SPREAD, B_DRINK, B_SUGAR, HUB]

# printed heading -> (category, rankable). Every heading the script meets must be listed here or in HUB_EXCLUDED.
RESTAURANT_SECTIONS = {
    "Nibbles": (STARTERS, True), "Light Bites": (STARTERS, True), "Starters": (STARTERS, True),
    "Salads": (SALADS, True), "Mains - Salads": (SALADS, True),
    "House Toasties": (SAND, True), "Sandwiches": (SAND, True),
    "Pizza": (PIZZA, True), "Mains - Pizza": (PIZZA, True),
    "Jacket Potatoes": (JACKET, True), "Mains - Burgers": (BURGERS, True), "Mains - Grills": (GRILLS, True),
    "Mains - Classics": (CLASSICS, True), "Mains - Pasta": (PASTA, True), "Sides": (SIDES, True),
    "Desserts": (DESSERTS, False), "Sweet Treats": (TREATS, False),
    "Kids - Mains": (KIDSM, True), "Kids Mains - Smaller Appetites": (KIDSM, True), "Kids Mains - Larger Appetites": (KIDSM, True),
    "Kids - Starters": (KIDSS, True), "Kids Starters": (KIDSS, True), "Kids Sides": (KIDSS, True),
    "Kids - Desserts": (KIDSD, False), "Kids Desserts": (KIDSD, False),
    "Condiments": (CONDI, False), "Condiments - V": (CONDI, False),
    "Upgrade": (ADDON, False), "Add Bun or Salad": (ADDON, False), "Add NGCI Bun or Salad": (ADDON, False),
    "Special Prep": (ADDON, False),
}
BREAKFAST_SECTIONS = {
    "Unlimited Cooked Breakfast": (B_COOK, False), "Bakery": (B_BAKE, False), "Fruits": (B_FRUIT, False),
    "Cereals & Yoghurts": (B_CEREAL, False), "Porridge": (B_PORR, False), "Preserves, Spreads & Jam": (B_SPREAD, False),
    "Cold Drinks": (B_DRINK, False), "Milk": (B_DRINK, False), "Sugar": (B_SUGAR, False),
    # the October 2026 guide's headings (a "(per ...)" in a heading is the serving of the rows under it)
    "Unlimited Continental - Bakery (per item)": (B_BAKE, False), "Unlimited Continental - Cereals & Yoghurts": (B_CEREAL, False),
    "Unlimited Continental - Drinks (per 150ml)": (B_DRINK, False), "Unlimited Continental - Fruits": (B_FRUIT, False),
    "Unlimited Continental - Milk (per 100ml)": (B_DRINK, False), "Unlimited Continental - Porridge": (B_PORR, False),
    "Unlimited Continental - Preserves, Spread & Jam": (B_SPREAD, False), "Unlimited Continental - Sugar (per sachet)": (B_SUGAR, False),
    "Condiments": (CONDI, False), "Condiments - V": (CONDI, False),
}
HUB_SECTIONS = {  # the Hub guide's restaurant dishes (pages 15-16)
    "Hub Large - Light Bites": (HUB, True), "Hub Small - Light Bites": (HUB, True),
    "Hub Large - Mains": (HUB, True), "Hub Small - Mains": (HUB, True), "Desserts": (HUB, False),
}
HUB_BREAKFAST_REASON = ("Hub breakfast tables (guide pages 3-7) are not used: 39 of their 44 rows repeat the Unlimited Breakfast "
                        "guide's items with the same figures and allergens (published from that guide), the other 5 are Hub Lounge "
                        "versions (porridge per 40 g, two bloomer breads per slice, HP sauce and ketchup per 30 ml)")
HUB_EXCLUDED = {h: HUB_BREAKFAST_REASON for h in (
    "Breakfast", "Hub Lounge and Proven Dough Breakfast", "HUB LOUNGE CONT BREAKFAST SS25", "HUB CONTINENTAL BREAKFAST- PRESERVES, SPREADS AND JAM (per item) - V",
    "HUB LOUNGE CONT - BAKERY (per item/ slice) - V", "HUB LOUNGE CONT - SUGAR - VE",
    "HUB LOUNGE CONTINENTAL - DRINKS (per serving) - VE", "HUB LOUNGE HOT BREAKFAST", "UNLIMITED CONTINENTAL - FRUITS",
    "Hub Lounge Continental - Cereal & Yoghurts", "Hub Lounge Continental - Fruits", "Unlimited Continental - Bakery",
    "Hub Lounge Continental - Preserve and Spreads", "Hub Lounge Continental - Sugar (per sachet)",
    "Hub Lounge Continental - Drinks", "Hub Lounge Hot Breakfast (per item)", "Hub Lounge Hot Breakfast Selected Sites Only (per item)")}

# Restaurant guide page ranges: menu label, first page, last page. The September 2026 guide (pi-2.pdf) is one menu on pages 1-7
# (no introduction or drinks pages).
RESTAURANT_MENUS = [("menu", 1, 7)]
NGCI_MENUS: set[str] = set()  # the September 2026 guide has no separate non-gluten menu: it prints "NGCI" in the dish names
NGCI_SUFFIX = " (non-gluten containing ingredients)"

# What the three PDFs contained when this script was last checked (guides of 15 September, 23 October and 20 May/23 October 2026;
# written for the April 2026 guides). Counts are rows per source/menu; the hash covers every printed heading and item name in
# order (not the numbers, which may change month to month).
EXPECTED_ROWS = {"restaurant/menu": 58, "breakfast/all": 63, "hub/all": 59}
EXPECTED_NAMES_SHA256 = "bbe66c1ad1d62125a9980789242f19256f2a1643908db2e9269deb90add96e07"

# ---- item rules -----------------------------------------------------------------------------------------------------
KEEP_UPPER = {"BBQ", "BLT", "HP", "BID", "NGCI"}
SMALL = {"with", "and", "of", "in", "the", "a", "on"}
PORK = re.compile(r"\b(bacon|ham|gammon|pepperoni|sausages?|pork|salami|chorizo|blt)\b", re.I)
BEEF = re.compile(r"\b(beef|sirloin)\b", re.I)
RED_MEAT_UNSTATED = re.compile(r"\b(burger|bolognese|bologense|mixed grill|black pudding|mince)\b", re.I)
UNIT_WORDS = {"piece": "1 piece", "spoon": "1 spoon", "slice": "1 slice", "half": "1 half", "fruit": "1 fruit", "each": "1 each",
              "sachet": "1 sachet", "person": "1 person", "portion": "1 portion", "item": "1 item"}


def tidy_name(raw: str) -> str:
    """Tidy capitalisation only: 'BIG STACK BURGER WITH CHIPS' -> 'Big Stack Burger with Chips'. Words already in lower or
    mixed case, and spelling (typos included), are kept exactly as printed."""
    out = []
    for i, word in enumerate(re.sub(r"\(\s+", "(", raw).split()):
        core = word.strip("()")
        if not core.isupper() or core in KEEP_UPPER or not re.search(r"[A-Z]", core):
            out.append(word)
            continue
        if re.fullmatch(r"\d+(OZ|G|ML)", core):
            new = core.lower()
        elif core.lower() in SMALL and i > 0:
            new = core.lower()
        else:
            new = "-".join(p.capitalize() for p in core.split("-"))
        out.append(word.replace(core, new))
    return " ".join(out)


def split_diet(printed: str) -> tuple[str, str]:
    """('SKIN-ON CHIPS - VE') -> ('SKIN-ON CHIPS', 'VE'). The guide's own V / VE mark; '' when unmarked."""
    m = re.match(r"^(.*?)\s*-\s*(VE|V)$", printed)
    return (m.group(1).strip(), m.group(2)) if m else (printed.strip(), "")


def norm_key(base: str) -> str:
    """Name key for spotting repeats: case, '&'/'and', the word 'a' and the guide's BOLOGENSE typo don't matter."""
    toks = re.findall(r"[a-z0-9]+", base.lower().replace("&", " and "))
    return " ".join("bolognese" if t == "bologense" else t for t in toks if t != "a")


def serving_of(base: str, heading: str = "") -> str:
    """The serving the printed name gives ("(per 30g)"), else the one its section heading gives ("Drinks (per 150ml)")."""
    m = re.search(r"\(per ([^)]+)\)", base) or re.search(r"\(per ([^)]+)\)", heading)
    if not m:
        return "1 portion"  # the guides print "Per Portion" for every table
    unit = m.group(1).strip()
    if unit in UNIT_WORDS:
        return UNIT_WORDS[unit]
    m2 = re.fullmatch(r"(\d+)\s*(g|ml)", unit)
    return f"{m2.group(1)} {m2.group(2)}" if m2 else unit


def meat_tags(base: str, diet: str) -> list[str]:
    if diet or re.search(r"\bvegan\b|\bvegetable\b|\bveggie\b", base, re.I):
        return []
    tags = []
    if PORK.search(base):
        tags.append("contains_pork")
    if BEEF.search(base):
        tags.append("contains_beef")
    return tags


def _split_top(text: str) -> list[str]:
    """'Cereals containing Gluten (Barley, Wheat), Milk' -> ['Cereals containing Gluten (Barley, Wheat)', 'Milk']."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        depth += (ch == "(") - (ch == ")")
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if depth != 0:
        raise SystemExit(f"unbalanced brackets in the printed allergens {text!r}")
    return [p.strip() for p in parts + [cur]]


def _allergen_column(text: str, where: str) -> tuple[set, set, set]:
    """One printed column ("Cereals containing Gluten (Wheat), Milk" or "No major allergens") -> (keys, cereals, nuts)."""
    if text == NO_ALLERGENS:
        return set(), set(), set()
    keys, cereals, nuts = set(), set(), set()
    for part in _split_top(text):
        head, _, inner = part.partition("(")
        k, _, _ = allergen_words([head], where, ALLERGEN_EXTRA)
        if not head.strip() or len(k) != 1:
            raise SystemExit(f"{where}: cannot read the printed allergen {part!r} in {text!r}")
        if inner:
            ki, ci, ni = allergen_words(inner.rstrip().rstrip(")").split(","), where, ALLERGEN_EXTRA)
            if ki != k:
                raise SystemExit(f"{where}: {part!r}: the bracketed words are not {sorted(k)}")
            cereals |= ci
            nuts |= ni
        keys |= k
    return keys, cereals, nuts


def allergens_of(r: dict) -> dict:
    """The printed Contains / May Contain columns of one table -> the allergens dict common.write_chain_folder expects.
    Cereals and nuts are kept only from the Contains column (the May Contain brackets name cereals/nuts of a trace)."""
    where = f"{r['source_label']} page {r['page']} {r['printed_name']!r}"
    contains, cereals, nuts = _allergen_column(r["contains_text"], where + " Contains")
    may, _, _ = _allergen_column(r["may_text"], where + " May Contain")
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


# ---- reading ---------------------------------------------------------------------------------------------------------
def collect(restaurant: Path, breakfast: Path, hub: Path):
    """Read the three PDFs. Returns (rows, row counts per source/menu, hash of the printed headings and names).
    Stops on a heading or page it does not know."""
    cands, counts, sig = [], Counter(), []
    sources = [("restaurant", "Restaurant guide", restaurant), ("breakfast", "Breakfast guide", breakfast), ("hub", "Hub guide", hub)]
    for key, label, pdf in sources:
        for r in premier_inn_pdf.read_rows(pdf):
            page, headings = r["page"], r["headings"]
            if key == "restaurant":
                menu = next((m for m, a, b in RESTAURANT_MENUS if a <= page <= b), None)
                if menu is None:
                    raise SystemExit(f"Restaurant guide page {page} has a nutrition table outside the known menu pages {RESTAURANT_MENUS}: "
                                     "the guide's layout changed. Re-check RESTAURANT_MENUS in premier_inn.py.")
                counts[f"restaurant/{menu}"] += 1
            else:
                menu = "all"
                counts[f"{key}/all"] += 1
            sig.append(f"{key}|{menu}|{'/'.join(headings)}|{r['printed_name']}")
            r.update(source=key, source_label=label, menu=menu)
            r["_headings"] = headings
            cands.append(r)
    # sections are sticky: a heading applies to the rows after it until the next heading
    section = {}
    for r in cands:
        cur = section.get(r["source"])
        sec_map = {"restaurant": RESTAURANT_SECTIONS, "breakfast": BREAKFAST_SECTIONS, "hub": {**HUB_SECTIONS, **HUB_EXCLUDED}}[r["source"]]
        for h in r["_headings"]:
            if h not in sec_map:
                raise SystemExit(f"{r['source_label']} page {r['page']}: unknown section heading {h!r}. The guide changed: decide its "
                                 "category in premier_inn.py (RESTAURANT_SECTIONS / BREAKFAST_SECTIONS / HUB_SECTIONS / HUB_EXCLUDED).")
            cur = h
        if cur is None:
            # A hub block starts with a heading on its own; a missing heading means the name line itself is the group header
            raise SystemExit(f"{r['source_label']} page {r['page']}: no section heading before {r['printed_name']!r}")
        section[r["source"]] = cur
        r["section"] = cur
    digest = hashlib.sha256("\n".join(sig).encode()).hexdigest()
    return cands, dict(counts), digest


def problems(counts: dict, digest: str) -> list[str]:
    """Differences between the PDFs and what this script was written for (empty = identical item set)."""
    out = []
    if counts != EXPECTED_ROWS:
        diff = {k: (counts.get(k, 0), EXPECTED_ROWS.get(k, 0)) for k in sorted(set(counts) | set(EXPECTED_ROWS))
                if counts.get(k, 0) != EXPECTED_ROWS.get(k, 0)}
        out.append("row counts changed (found, expected): " + repr(diff))
    if digest != EXPECTED_NAMES_SHA256:
        out.append(f"the printed headings or item names changed (names hash {digest})")
    return out


# Items whose own printed figures contradict each other, found by the accuracy audit on 2026-10-08 (the PDFs were re-read in full: every
# published row matched the guide). Not corrected: the kJ agrees with the kcal, but the printed protein, carbohydrate and fat add up to
# about 90 kcal, 53% more than the printed 59 kcal. Restoring one is deleting its entry here.
AUDIT_HELD = {
    "add-corn-ribs": ("The guide prints 59 kcal (246 kJ) but its own protein, carbohydrate and fat (2.7 g, 16.7 g, 1.4 g) add up to about "
                      "90 kcal, so we can't tell which figure is right"),
}


# Items whose printed allergen row contradicts the dish's own name (found when the September 2026 guide was read on 2026-11-17).
# Not corrected and not guessed: held back. Restoring one is deleting its entry here once the chain confirms its allergens.
ALLERGEN_HELD = {
    "paprika-cauliflower-and-butterbean-houmous": ("The guide marks this houmous as containing egg and milk but not sesame (houmous is usually "
                                                   "made with tahini, a sesame paste), and names no other ingredients, so we can't tell "
                                                   "whether sesame is missing from its allergen row"),
}


def build(cands):
    """Turn raw rows into (items, held_back, exclusions)."""
    exclusions: Counter = Counter()
    rows = []
    for r in cands:
        sec = r["section"]
        base, diet = split_diet(r["printed_name"])
        if r["source"] == "hub":
            if sec in HUB_EXCLUDED:
                exclusions[HUB_EXCLUDED[sec]] += 1
                continue
            cat, rank = HUB_SECTIONS[sec]
            origin = "hub"
        elif r["source"] == "breakfast":
            cat, rank = BREAKFAST_SECTIONS[sec]
            origin = "std"
        else:
            cat, rank = RESTAURANT_SECTIONS[sec]
            origin = "ngci" if r["menu"] in NGCI_MENUS else "std"
        if r["source"] != "hub":
            if re.match(r"^add\b", base, re.I):
                cat, rank = ADDON, False
            elif re.search(r"\bsoup\b", base, re.I):
                cat, rank = SOUP, True
            if base.upper() == "PIZZA BASE":
                rank = False
            if r["source"] == "breakfast" and base.upper().startswith("PORRIDGE WITH"):
                rank = True
        nums = tuple(r[k] for k in ("kcal", "protein", "carbs", "fat", "sat", "sugars", "salt"))
        rows.append(dict(r, base=base, diet=diet, cat=cat, rank=rank, origin=origin, nums=nums, key=norm_key(base)))

    groups: "OrderedDict[str, OrderedDict[tuple, list]]" = OrderedDict()
    for r in rows:
        groups.setdefault(r["key"], OrderedDict()).setdefault(r["nums"], []).append(r)

    items, held = [], []
    for key, variants in groups.items():
        def origin_of(v):
            os_ = {c["origin"] for c in v}
            return "std" if "std" in os_ else ("ngci" if "ngci" in os_ else "hub")
        tagged = [(origin_of(v), v) for v in variants.values()]
        std_v = [v for o, v in tagged if o == "std"]
        ngci_v = [v for o, v in tagged if o == "ngci"]
        hub_v = [v for o, v in tagged if o == "hub"]
        if len(ngci_v) > 1 or len(hub_v) > 1:
            raise SystemExit(f"{key!r}: several different versions on the non-gluten or Hub menus only: decide how to name them.")
        plan = [(v, "") for v in std_v]
        if ngci_v:
            plan.append((ngci_v[0], "ngci"))
        if hub_v:
            plan.append((hub_v[0], "hub"))
        holdback_all = len(std_v) > 1
        std_seen = 0
        for v, kind in plan:
            cs = v
            raw = Counter(c["printed_name"] for c in cs).most_common(1)[0][0]
            base = tidy_name(split_diet(raw)[0])
            name = base
            if kind == "ngci" and "non gluten containing" not in base.lower():
                name = base + NGCI_SUFFIX
            elif kind == "hub":
                name = base + " (Hub)"
            core = [c for c in cs if c["origin"] != "hub"] or cs  # Hub repeats of a Thyme dish don't decide its category
            cat = HUB if kind == "hub" else Counter(c["cat"] for c in core).most_common(1)[0][0]
            diet = "VE" if any(c["diet"] == "VE" for c in cs) else ("V" if any(c["diet"] == "V" for c in cs) else "")
            pages = sorted({(c["source_label"], c["page"]) for c in cs})
            where = "; ".join(f"{lab} p{'/'.join(str(p) for l2, p in pages if l2 == lab)}" for lab in OrderedDict((l, 0) for l, _ in pages))
            c0 = cs[0]
            prints = {repr(sorted((k, sorted(v)) for k, v in allergens_of(c).items())): c for c in cs}
            if len(prints) > 1:
                raise SystemExit(f"{name!r}: the guides print the same dish with different allergens "
                                 + "; ".join(f"{c['source_label']} p{c['page']}: Contains {c['contains_text']!r} / May Contain {c['may_text']!r}"
                                             for c in prints.values()) + ". Decide by hand how to treat it before publishing.")
            kjs = {c["kj"] for c in cs}
            item = dict(name=name, category=cat, serving=serving_of(split_diet(raw)[0], c0["section"]),
                        calories=c0["kcal"], protein_g=c0["protein"], carbs_g=c0["carbs"], fat_g=c0["fat"], sat_fat_g=c0["sat"],
                        sugar_g=c0["sugars"], salt_g=c0["salt"], energy_kj=c0["kj"] if len(kjs) == 1 else "",
                        allergens=allergens_of(c0),
                        tags="|".join((["vegetarian"] if diet else []) + meat_tags(base, diet)),
                        rankable=all(c["rank"] for c in core), notes=where)
            if kind == "ngci":
                item["notes"] += "; from the guide's Non Gluten Containing Ingredients menu"
            if kind == "hub":
                item["notes"] += "; Hub by Premier Inn hotels only"
            if holdback_all and kind == "":
                std_seen += 1
                item["id"] = slug(name) + ("" if std_seen == 1 else f"-{std_seen}")
                others = [x[1][0]["kcal"] for x in tagged if x[0] == "std" and x[1] is not v]
                item["_held"] = (f"The guide prints this dish twice on its standard menus with different numbers ({c0['kcal']} kcal here, "
                                 f"{' and '.join(str(k) for k in others)} kcal in the other), so we can't tell which applies")
                item["notes"] += "; HELD BACK: conflicting versions"
            else:
                item["id"] = slug(name)
            item["_cands"] = cs
            items.append(item)
    for i in items:
        if i["id"] in EXTRA_NOTES:
            i["notes"] += "; " + EXTRA_NOTES[i["id"]]
    missing = [k for k in EXTRA_NOTES if k not in {i["id"] for i in items}]
    assert not missing, f"EXTRA_NOTES names items that no longer exist: {missing}"
    # sort categories into display order (stable inside a category)
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids: " + repr([k for k, n in Counter(ids).items() if n > 1])
    for i in items:   # accuracy audit 2026-10-08: the guide's own figures contradict each other (held back, never corrected)
        if i["id"] in AUDIT_HELD and "_held" not in i:
            i["_held"] = AUDIT_HELD[i["id"]]
            i["notes"] += "; HELD BACK: the guide's own figures contradict each other"
    missing = [k for k in AUDIT_HELD if k not in {i["id"] for i in items}]
    assert not missing, f"AUDIT_HELD names items that no longer exist: {missing}"
    for i in items:
        if i["id"] in ALLERGEN_HELD and "_held" not in i:
            i["_held"] = ALLERGEN_HELD[i["id"]]
            i["notes"] += "; HELD BACK: the allergen row contradicts the dish's name"
    missing = [k for k in ALLERGEN_HELD if k not in {i["id"] for i in items}]
    assert not missing, f"ALLERGEN_HELD names items that no longer exist: {missing}"
    held = [(i["id"], i["_held"]) for i in items if "_held" in i]
    return items, held, exclusions


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--restaurant", type=Path, required=True, help="pi-2.pdf (Thyme and The Social restaurant menu)")
    ap.add_argument("--breakfast", type=Path, required=True, help="breakfast.pdf")
    ap.add_argument("--hub", type=Path, required=True, help="hub.pdf")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDFs")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--list", action="store_true", help="print the decisions and write nothing")
    args = ap.parse_args()

    cands, counts, digest = collect(args.restaurant, args.breakfast, args.hub)
    diffs = problems(counts, digest)
    if diffs and not args.list:
        print("The guides no longer match what premier_inn.py was written for: " + "; ".join(diffs) + ". Run with --list, check what was "
              "added, renamed or removed, decide categories, tags and exclusions in premier_inn.py, then update EXPECTED_ROWS "
              "and EXPECTED_NAMES_SHA256.", file=sys.stderr)
        return 1
    items, held, exclusions = build(cands)

    if args.list:
        print(f"row counts {counts}\nnames hash {digest}")
        for d in diffs:
            print("WARNING:", d)
        for i in items:
            flag = "HELD " if "_held" in i else ""
            print(f"{flag}{i['category']:<24}| {i['name']} | {i['serving']} | {i['calories']} kcal | {i['tags']} | rankable={i['rankable']} | {i['notes']}")
        return 0

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Premier Inn", cuisine="Hotel restaurant", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=ALIASES,
        items=[{k: v for k, v in i.items() if not k.startswith("_")} for i in items], out=args.out, note=NOTE, holdback=held,
        allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    published = len(items) - len(held)
    print(f"wrote {len(items)} items ({published} published, {len(held)} held back) to {out}")
    for label, pdf in (("restaurant", args.restaurant), ("breakfast", args.breakfast), ("hub", args.hub)):
        print(f"  {label}: {pdf.name} sha256 {sha256_file(pdf)}")
    for reason, n in exclusions.items():
        print(f"  excluded {n} Hub rows: {reason}")
    print("  meat type not stated (no tag; red-meat dishes whose name gives no meat):")
    for i in items:
        if ("_held" not in i and RED_MEAT_UNSTATED.search(i["name"]) and "contains_beef" not in i["tags"]
                and not re.search(r"\b(chicken|vegan)\b|burger bun", i["name"], re.I)):
            print(f"    {i['name']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
