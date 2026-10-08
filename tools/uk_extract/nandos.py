#!/usr/bin/env python3
"""Build data/source/nandos/ from Nando's UK official menu data (the feed behind https://www.nandos.co.uk/food/menu).

    python3 tools/uk_extract/nandos.py --fetch /tmp/nandos --checked-on 2026-10-05      # download (2 requests) + build
    python3 tools/uk_extract/nandos.py path/to/page-data.json --published 2026-10-02 --checked-on 2026-10-05

Numbers are copied from the feed as printed on the menu page's product panels (kcal, fat, saturates, carbohydrates, sugars,
fibre, protein, salt; kJ is not used). The feed stores grams as milligrams, so each value is divided by exactly 1000 the way the
page does it (36800 -> 36.8). Only names, categories, serving text and rankable are decided by hand below. If Nando's adds or
removes a dish the set of entries no longer matches REVIEWED and this script stops, so a human re-checks names and flags.
See nandos_feed.py for where the feed lives and why the old unversioned page-data.json must never be used.

What goes in: everything the public menu page shows to all of Great Britain (entries with no `restaurantGroup`), the Nandino
side options and the spice levels, each exactly as published and never added together. Left out: entries tied to a restaurant
group (Gatwick only, pricing trials, Scotland, Northern Ireland, Ninos, beer/cocktail trials, delivery-only alcohol), trial items,
entries with no nutrition, and what SKIP lists (drinks with no stated volume, sharing platters whose values are chicken only).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import email.utils
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import nandos_feed as nf  # noqa: E402

CHAIN_ID = "nandos"
SOURCE_URL = "https://www.nandos.co.uk/food/menu"

CATEGORY_ORDER = [
    "The Lunch Fix", "Starters", "PERi-PERi Chicken", "Burgers, Pittas, Wraps", "Salads & Bowls", "Veggie",
    "Nandinos (Kids)", "Sides", "Dips & Extras", "Spice levels", "Drinks", "Desserts",
]

# Every entry reviewed by a human on 2026-10-05, in feed order. New or removed entries stop the script (see docstring).
REVIEWED = """
sol-bowl:extra-hot-meal-deals hearty-bowl:extra-hot-meal-deals
halloooooomi-sticks:starters chicken-chorizo:starters halloumi-sticks-dip:starters halloumi-sticks-honey:starters
houmous-with-pe-ri-pe-ri-drizzle:starters sweet-potato-wedges-with-garlic-pe-rinaise:starters cheesy-garlic-pitta:starters
spicy-mixed-olives:starters pe-ri-pe-ri-nuts:starters
4-boneless-chicken-thighs:pe-ri-pe-ri-chicken chicken-butterfly:pe-ri-pe-ri-chicken 1-2-chicken:pe-ri-pe-ri-chicken
1-4-chicken:pe-ri-pe-ri-chicken whole-chicken:pe-ri-pe-ri-chicken 5-phantom-wings:pe-ri-pe-ri-chicken
10-phantom-wings:pe-ri-pe-ri-chicken 3-phantom-wings:pe-ri-pe-ri-chicken 5-chicken-wings:pe-ri-pe-ri-chicken
10-chicken-wings:pe-ri-pe-ri-chicken 3-chicken-wings:pe-ri-pe-ri-chicken 10-wing-roulette:pe-ri-pe-ri-chicken
5-saucy-wings:pe-ri-pe-ri-chicken 10-saucy-wings:pe-ri-pe-ri-chicken 3-saucy-wings:pe-ri-pe-ri-chicken
chicken-livers-portuguese-roll:pe-ri-pe-ri-chicken
butterfly-burger:burgers-pittas-wraps sunset-burger:burgers-pittas-wraps garlic-churrasco-burger:burgers-pittas-wraps
grilled-chicken-burger:burgers-pittas-wraps double-chicken-burger:burgers-pittas-wraps grilled-chicken-wrap:burgers-pittas-wraps
double-chicken-wrap:burgers-pittas-wraps fino-pitta:burgers-pittas-wraps grilled-chicken-pitta:burgers-pittas-wraps
double-chicken-pitta:burgers-pittas-wraps
spicy-rice-bowl:salads mediterranean-salad:salads caesar-salad:salads
full-platter:sharing-platters boneless-platter:sharing-platters family-platter:sharing-platters all-in-platter:sharing-platters
xl-wing-platter:sharing-platters
the-big-cheese:veggie the-great-imitator-wrap:veggie beanie-wrap:veggie beanie-burger:veggie beanie-pitta:veggie
nandino-burger:nandinos-kids nandinos-mac-and-cheese:nandinos-kids chicken-breast-fillet:nandinos-kids
nandinos-3-chicken-wings:nandinos-kids little-pitta:nandinos-kids soft-swirl-tub:nandinos-kids cloudy-apple-juice:nandinos-kids
pineapple-mango-smoothie:nandinos-kids
fully-loaded-chips:sides loaded-pe-ri-mac:sides pe-ri-mac-and-cheese:sides charred-corn:sides portuguese-tomato-salad:sides
tombstone-chips:sides pe-ri-salted-chips:sides chips:sides garlic-bread:sides spicy-rice:sides coleslaw:sides creamy-mash:sides
corn-on-the-cob:sides long-stem-broccoli:sides macho-peas:sides rainbow-slaw:sides hearty-grains:sides
grilled-halloumi-cheese:extras 2-chicken-thighs-extra:extras cheddar-cheese:extras chicken-breast-extra:extras pineapple:extras
herby-pickles-extra:extras 1-2-avocado:extras pe-ri-pe-ri-drizzle:extras beanie-patty-extra:extras per-plant-strips-extra:extras
pe-rinaise:extras garlic-pe-rinaise:extras pe-ri-chicken-gravy:extras chilli-jam:extras pe-ri-honey:extras
toasted-pitta-bread-with-butter:extras portuguese-roll:extras lemon-herb-wrap:extras
bottomless-coca-cola:drinks bottomless-diet-coke:drinks bottomless-coke-zero:drinks bottomless-dr-pepper:drinks
bottomless-sprite-zero:drinks bottomless-fanta-zero:drinks cloudy-lemonade:drinks still-water:drinks sparkling-water:drinks
karma-drinks-gingerella:drinks rubro-peach:drinks rubro-berry:drinks rubro-lemon:drinks momo-kombucha:drinks tiny-rebel-ipa:drinks
sagres:drinks sxollie-cider:drinks bero-golden-pils:drinks freedom-pils:drinks beavertown-lazer-crush:drinks
spier-chardonnay:drinks spier-sauvignon-blanc:drinks creative-block-2:drinks spier-merlot:drinks spier-cabernet-sauvignon:drinks
creative-block-5:drinks spier-rose:drinks
one-toffee-pastel-de-nata:desserts four-toffee-pastel-de-nata:desserts ultimate-chocolate-brownie-gelado:desserts
soft-swirl-tub:desserts choc-a-lot-cake:desserts gooey-caramel-cheesecake:desserts mango-gelado:desserts
nandinos-side:chips nandinos-side:corn-on-the-cob nandinos-side:cucumber-sticks nandinos-side:spicy-rice
spice:new-spice spice:extrahot spice:hot spice:medium spice:lemonherb spice:peritamer
""".split()

# Entries left out on purpose. Drinks: rule 4 (the feed prints a kcal figure but neither a volume nor a pack size). Platters: see below.
SKIP = {
    "momo-kombucha:drinks": "no volume stated",
    "spier-chardonnay:drinks": "wine with no glass or bottle size stated",
    "creative-block-2:drinks": "wine with no glass or bottle size stated",
    "spier-cabernet-sauvignon:drinks": "wine with no glass or bottle size stated",
    "creative-block-5:drinks": "wine with no glass or bottle size stated",
    # Rule 3 (never fill a gap or combine): the panel says these figures are only "the Chicken included within this platter"
    # and to "add together the calories from individual items" for a total, and the menu page itself hides platter kcal on its cards.
    "full-platter:sharing-platters": "values cover only the chicken in the platter, not sides or spice",
    "boneless-platter:sharing-platters": "values cover only the chicken in the platter, not sides or spice",
    "family-platter:sharing-platters": "values cover only the chicken in the platter, not sides or spice",
    "all-in-platter:sharing-platters": "values cover only the chicken in the platter, not sides, drinks or spice",
    "xl-wing-platter:sharing-platters": "values cover only the chicken in the platter, not sides or spice",
}

# Printed names that clash with another entry (the same words appear in the main menu and in the Nandinos set menu).
NAME_OVERRIDE = {
    "nandinos-3-chicken-wings:nandinos-kids": "3 Chicken Wings (Nandinos)",
    "soft-swirl-tub:nandinos-kids": "Bottomless Soft Swirl Tub (Nandinos)",
}
# Entries whose rankable differs from the category rule below.
RANKABLE_OVERRIDE = {
    "tombstone-chips:sides": (False, "Printed 'Large serves 2' next to a single set of values, so it is unclear whether they are for a shared portion"),
}
# Hand-written notes (not exported) for things the tags/columns cannot say.
NOTE_EXTRA = {
    "chicken-chorizo:starters": "Name says chorizo but the menu text says 'No pork', so no pork tag",
    "10-wing-roulette:pe-ri-pe-ri-chicken": "Meat type not stated ('10 Wings'); no pork/beef tag",
}
# Printed on the menu page's hero banner ("Limited time. HalloOoOoOomi Sticks."); the card itself only says "new".
LIMITED_BY_BANNER = {"halloooooomi-sticks:starters"}

# Categories whose entries are never a person's order on their own (rankable=false).
NEVER_RANK = {"Nandinos (Kids)", "Dips & Extras", "Spice levels", "Drinks", "Desserts"}

# Messages printed in the product panel that change how the numbers should be read. Copied verbatim into `notes`.
NOTE_MESSAGE = re.compile(r"(?i)calorie|kcal|nutritional info is|specific to the chicken|regular size only")
VOLUME = re.compile(r"(?:^|, )(\d+ ?ml)\.")
PER_GLASS = re.compile(r"per (\d+ ?ml) glass", re.I)


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() and c.isascii() else "-" for c in name.replace("'", "").replace("’", ""))
    return "-".join(p for p in out.split("-") if p)


def serving_for(row: nf.Row) -> tuple[str, list[str]]:
    """Serving text copied from what the page prints (never invented). Returns (serving, extra notes)."""
    if row.portion == "Regular":
        return "Regular", []
    if row.portion == "Large":
        return ("Large (serves 2)" if re.search(r"(?i)large serves 2", row.serving_info) else "Large"), []
    for msg in row.messages:
        m = PER_GLASS.search(msg)
        if m:
            return f"{m.group(1)} glass", []
        m = re.search(r"(?i)per filled (tub|jug/pot)", msg)
        if m:
            return f"Filled {m.group(1).lower()}", []
    m = VOLUME.search(row.description)
    if m:
        return m.group(1), []
    if row.serving_info.lower().startswith("large"):
        return "", [f"Printed '{row.serving_info}' but only one set of values; size not stated"]
    return row.serving_info, []


def rankable_for(row: nf.Row) -> bool:
    if row.key in RANKABLE_OVERRIDE:
        return RANKABLE_OVERRIDE[row.key][0]
    if row.category in NEVER_RANK:
        return False
    shared = re.search(r"(?i)serves|meal for", row.serving_info) and row.portion != "Regular"
    return not shared


def _energy_note(f: dict) -> str:
    """Same test as the pipeline's energy warning (docs/DATA.md), so the oddity is written down next to the row."""
    try:
        kcal = f["energyKcal"]
        est = 4 * f["proteinMg"] / 1000 + 4 * f["totalCarbsMg"] / 1000 + 9 * f["fatMg"] / 1000
    except (KeyError, TypeError):
        return ""
    if kcal < 50:
        flagged = est > kcal + 25
    else:
        flagged = abs(kcal - est) / kcal > 0.15
    if not flagged:
        return ""
    return f"Printed {kcal} kcal is not close to what the printed protein, carbohydrate and fat give ({est:.0f} kcal); entered as printed"


def holdback_reason(row: nf.Row) -> str:
    """Why a row is not published although the page prints it: the page's own figures contradict each other (never corrected, never
    chosen between). Accuracy audit 2026-10-08. Two tests, both on what the product panel prints:
      * protein alone would supply more energy than the printed kcal (a data-entry error somewhere in the row), or
      * for food and soft drinks of 50 kcal or more, the kcal differs by more than 20% from 4 x protein + 4 x carbohydrate + 9 x fat
        (alcoholic drinks are skipped: alcohol's energy is in no macro column) or by more than 15% when the printed kJ is also more
        than 15% away from the kcal. Nando's kJ agrees with its kcal on every published row, so the first form is the one that fires."""
    f = row.facts
    try:
        kcal = f["energyKcal"]
        prot, carb, fat = f["proteinMg"] / 1000, f["totalCarbsMg"] / 1000, f["fatMg"] / 1000
    except (KeyError, TypeError):
        return ""
    if 4 * prot > kcal * 1.02 + 1:
        return f"the page prints {kcal} kcal but {prot:g} g of protein alone would supply about {round(4 * prot)} kcal"
    if row.abv:  # the feed gives every alcoholic drink its ABV (0 for soft drinks)
        return ""
    est = 4 * prot + 4 * carb + 9 * fat
    kj = f.get("energyKj")
    macro_gap = abs(kcal - est) / kcal if kcal else 0
    kj_gap = abs(kcal - kj / 4.184) / kcal if (kcal and kj) else 0
    if kcal >= 50 and (macro_gap > 0.20 or (macro_gap > 0.15 and kj_gap > 0.15)):
        return (f"the page prints {kcal} kcal, but its own protein, carbohydrate and fat add up to about {round(est)} kcal"
                + (f" ({kj} kJ is about {round(kj / 4.184)} kcal)" if kj else ""))
    return ""


def notes_for(row: nf.Row, serving_notes: list[str]) -> str:
    notes = list(serving_notes)
    if row.key in NOTE_EXTRA:
        notes.append(NOTE_EXTRA[row.key])
    if row.key in RANKABLE_OVERRIDE:
        notes.append(RANKABLE_OVERRIDE[row.key][1])
    notes += [m for m in row.messages if NOTE_MESSAGE.search(m)]
    f = row.facts
    if f.get("saturatesMg") is not None and f.get("fatMg") is not None and f["saturatesMg"] > f["fatMg"]:
        notes.append("Saturates are printed higher than total fat")
    if f.get("sugarsMg") is not None and f.get("totalCarbsMg") is not None and f["sugarsMg"] > f["totalCarbsMg"]:
        notes.append("Sugars are printed higher than carbohydrates")
    kj, kcal = f.get("energyKj"), f.get("energyKcal")
    if kj is not None and kcal and kcal >= 20 and abs(kj / 4.184 - kcal) / kcal > 0.03:
        notes.append(f"Printed kJ ({kj}) and kcal ({kcal}) do not agree (kJ is not used)")
    energy = _energy_note(f)
    if energy:
        notes.append(energy)
    if row.abv:
        notes.append(f"Contains alcohol (ABV {row.abv:g}%), which is not in the fat, carbohydrate or protein figures")
    if row.kind == "spice":
        notes.append("Shown when choosing a spice; the dish values on the menu exclude the spice")
    if row.kind == "nandino-side":
        notes.append("Nandino-size side offered with the Nandinos set menu")
    return " | ".join(dict.fromkeys(notes))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("feed", type=Path, nargs="?", help="path to the page-data.<N>.json the live menu page loads")
    ap.add_argument("--fetch", type=Path, metavar="DIR", help="download the menu page + feed into DIR first (2 requests)")
    ap.add_argument("--published", help="YYYY-MM-DD the feed was published (its Last-Modified); required with a local feed")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the feed with the live menu")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    published = args.published
    if args.fetch:
        info = nf.fetch(args.fetch)
        print(f"fetched {info['url']}\n  Last-Modified {info['last_modified']}\n  feed sha256 {info['sha256']}\n  page sha256 {info['html_sha256']}")
        published = published or email.utils.parsedate_to_datetime(info["last_modified"]).date().isoformat()
        feed_path = args.fetch / "page-data.json"
    elif args.feed:
        feed_path = args.feed
    else:
        ap.error("give a feed file or --fetch DIR")
    if not published:
        ap.error("--published YYYY-MM-DD is required with a local feed file")
    published_date = dt.date.fromisoformat(published)

    rows, left_out = nf.read_menu(nf.load(feed_path))
    found = list(dict.fromkeys(r.key for r in rows))
    missing = [k for k in REVIEWED if k not in found]
    new = [k for k in found if k not in REVIEWED]
    if missing or new:
        print("The menu feed no longer matches the entries this script has reviewed.\n"
              f"  new in the feed (check name, category, rankable, then add to REVIEWED): {new}\n"
              f"  no longer in the feed (remove from REVIEWED): {missing}", file=sys.stderr)
        return 1

    items = []
    holdback = []
    for r in rows:
        if r.key in SKIP:
            continue
        name = NAME_OVERRIDE.get(r.key, r.name)
        if r.kind == "nandino-side":
            name = f"{r.name} (Nandinos side)"
        elif r.kind == "spice":
            name = f"{r.name} (spice level)"
        if r.portion:
            name = f"{name} ({r.portion.lower()})"
        serving, serving_notes = serving_for(r)
        cells = nf.facts_to_cells(r.facts)
        items.append({
            "id": slug(name), "name": name, "category": r.category, "serving": serving,
            "calories": cells["calories"], "protein_g": cells["protein_g"], "carbs_g": cells["carbs_g"], "fat_g": cells["fat_g"],
            "sat_fat_g": cells["sat_fat_g"], "sodium_mg": "", "salt_g": cells["salt_g"], "sugar_g": cells["sugar_g"],
            "fiber_g": cells["fiber_g"],
            "tags": "vegetarian" if {"VEGETARIAN", "VEGAN"} & set(r.diets) else "",
            "limited_time": str(bool(r.lozenge and "limited" in r.lozenge.lower()) or r.key in LIMITED_BY_BANNER).lower(),
            "rankable": str(rankable_for(r)).lower(), "components": "", "added_on": "", "notes": notes_for(r, serving_notes),
        })
        why = holdback_reason(r)
        if why:
            holdback.append((items[-1]["id"], why))
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), f"duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}"
    names = [i["name"] for i in items]
    assert len(names) == len(set(names)), f"duplicate names: {sorted({n for n in names if names.count(n) > 1})}"
    unknown = {i["category"] for i in items} - set(CATEGORY_ORDER)
    assert not unknown, f"categories missing from CATEGORY_ORDER: {unknown}"
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(items)
    title = f"Nando's UK menu and nutrition information (nandos.co.uk/food/menu, published {published_date.day} {published_date:%B %Y})"
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Nando's", "Chicken", "standard", title, SOURCE_URL, args.checked_on, "nandos|nando's|nandos restaurant", ""])
    hb = args.out / "holdback.csv"
    if holdback:
        with open(hb, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["item_id", "reason"])
            w.writerows(holdback)
    elif hb.exists():
        hb.unlink()
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")

    print(f"held back (page's own figures contradict each other): {holdback}")
    print(f"wrote {len(items)} items to {args.out} (feed sha256 {hashlib.sha256(feed_path.read_bytes()).hexdigest()[:16]})")
    print("left out of the feed: " + "; ".join(f"{g}: {len(v)}" for g, v in left_out["grouped"].items()))
    print(f"  trial: {left_out['trial']}  no nutrition: {left_out['no_nutrition']}  skipped by rule 4: {sorted(SKIP)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
