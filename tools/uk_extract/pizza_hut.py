#!/usr/bin/env python3
"""Build data/source/pizza-hut/ from Pizza Hut Restaurants UK's official dine-in "Dietary Information" booklet
(allergen, ingredients and nutrition tables in one PDF).

    python3 tools/uk_extract/pizza_hut.py path/to/DINE-IN_AIN_Booklet.pdf --checked-on 2026-10-05

Numbers are copied from the PDF as printed (kcal, protein, carbs, sugars, fat, saturates, salt; the guide prints no
kJ and no fibre, so those stay blank). Pizza rows are PER SLICE; everything else is per portion, and the printed
"(Average) Weight of Portion (g)" becomes weight_g (pizza rows print the whole pizza's weight, so weight_g stays blank there). Only names, categories, grouping, tags and the exclusions below are typed by hand. The script
walks the PDF's nutrition tables in order and stops with a clear message if a heading, a row count or a column count
no longer matches, so a human re-checks the lists.

Source (found on https://www.pizzahut.co.uk/restaurants/food/nutritional-information, the "Read More..." button):
https://assets.ctfassets.net/kahtja4ygpol/3lSanvl3X7vbTSxlptqtfx/d3479ac67d929e328d4638b469749a79/DINE-IN_AIN_Booklet_C3_2026_FINAL_V1.pdf
This is the DINE-IN (restaurant) booklet. The delivery/takeaway guide on https://www.pizzahut.co.uk/allergens/ is a
JavaScript app and could not be read from the build machine, so it is not used.

Allergens: LINK ONLY (allergen_guide.csv, no allergens.csv). The booklet's allergen tables (pages 2-4, "●" contains, "○" may
contain) cannot give every published item its allergens: there is no row for the Hot Honey Sriracha Chicken & Pepperoni pizza;
pizza rows must add the chosen base ("Allergen Information for Pizza Combinations does not include Pizza Bases") and the
booklet prints two Handcrafted bases (with / without garlic sprinkle, different milk marks) while the nutrition rows don't say
which; pasta, kids' pizzas, sides, drinks and desserts and several salad-station rows have no row of their own; and one column
is "Fish / shellfish" (fish and crustaceans not told apart). So the app links to the booklet instead (all or nothing).

Re-checked 2026-10-08 (allergen pass, data/audit/verified/pizza-hut-allergens.json): same answer. The booklet is per COMPONENT for pizzas (base,
sauce, cheese, topping and finisher tables; "Pizza Combinations" rows exclude the base, so a pizza needs two rows). Of 237 published items, 108
are pizzas (none has one row of its own; 8 Hot Honey Sriracha pizzas have no combination row at all), and kids' pizzas, Lasagne, Classic and
Take Away Mac 'N' Cheese and the kids' sides, drinks and desserts have no row under their own names, so well over a third would be held back
under the all-or-nothing rule. Only the Handcrafted rows marked "WITHOUT Garlic Sprinkle" say which Handcrafted base they use. The
booklet is on assets.ctfassets.net (no robots.txt there, 404) and the page that links it (pizzahut.co.uk, robots allow) names no other
allergen document for the dine-in menu.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pizza_hut_pdf  # noqa: E402
from common import EXTRA_KEYS, write_allergens  # noqa: E402

CHAIN_ID = "pizza-hut"
SOURCE_URL = ("https://assets.ctfassets.net/kahtja4ygpol/3lSanvl3X7vbTSxlptqtfx/"
              "d3479ac67d929e328d4638b469749a79/DINE-IN_AIN_Booklet_C3_2026_FINAL_V1.pdf")
SOURCE_TITLE = ("Pizza Hut Restaurants UK dine-in Dietary Information booklet: allergen, ingredients and nutrition "
                "(July 2026, Version 1)")

ALLERGEN_TITLE = "Pizza Hut Restaurants UK dine-in Dietary Information booklet: Allergen Information (July 2026, Version 1)"

# Categories in display order.
PAN, HAND, STUFFED, CHEESY, GF = "Pan pizzas", "Handcrafted pizzas", "Stuffed crust pizzas", "Cheesy Bites pizzas", "Gluten free pizzas"
VEGAN, FLAT, PASTA, SIDES, KIDS = "Vegan pizzas", "Flatbreads", "Pasta", "Sides", "Kids menu"
SALAD, SAUCES, DESSERTS, BUFPIZZA, BUFSIDES = "Salad station", "Sauces & dips", "Desserts", "Buffet pizzas", "Buffet sides"
CATEGORY_ORDER = [PAN, HAND, STUFFED, CHEESY, GF, VEGAN, FLAT, PASTA, SIDES, KIDS, SALAD, SAUCES, DESSERTS, BUFPIZZA, BUFSIDES]

COLS_PORTION = ["weight", "kcal", "protein", "carbs", "sugars", "fat", "sat", "salt"]
COLS_PIZZA = ["slices", "weight", "kcal", "protein", "carbs", "sugars", "fat", "sat", "salt"]

PER100G_REASON = "printed per 100 g (not per serving)"


def S(heading):
    """A section heading that has no rows of its own."""
    return {"h": heading, "section": True}


def G(gid, heading, category, n, *, kind="portion", rank=False, avg=True, diet=None, diet_name=None, prefix="",
      dup="", exclude=None, note=""):
    """One table group, in the PDF's reading order. `n` = number of printed rows we expect in it."""
    return dict(gid=gid, h=heading, category=category, n=n, kind=kind, rank=rank, avg=avg, diet=diet,
                diet_name=diet_name, prefix=prefix, dup=dup, exclude=exclude, note=note)


# --- the booklet's nutrition tables, in reading order (PDF pages 10-13) -------------------------------------------------
GROUPS = [
    S("Sides & Sauces"),
    G("sides", "Sides", SIDES, 12, rank=True, diet="Sides"),
    G("takeaway-mac", "Take Away Macaroni Cheese", SIDES, 1, rank=True),
    G("tabletop", "Tabletop Sauces", SAUCES, 3, diet="Tabletop Sauces", dup="tabletop"),
    G("dinein-dips", "Dine In Dip Pots", SAUCES, 3, diet="Dips", dup="dine-in dip pot"),
    G("takeaway-dips", "Takeaway Dip Pots", SAUCES, 4, diet="Takeaway Dips"),
    G("finishers", "Pizza Finishers", SAUCES, 9, diet="Pizza Finishers", dup="pizza finisher"),
    S("Salad Station"),
    G("salad-dressed", "Dressed Salads", SALAD, 7, avg=False, diet="Dressed Salad Lines"),
    G("salad-fresh", "Fresh Salad", SALAD, 8, avg=False),
    G("salad-dried", "Dried Items", SALAD, 5, avg=False, diet="Dry Items"),
    G("salad-dressings", "Dressings & Dips", SALAD, 8, avg=False, diet="Dressings", dup="salad station dressing"),
    S("Pizza"),
    G("pz-pepperoni", "Pepperoni", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-pepperoni-feast", "Pepperoni Feast", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-hawaiian", "Hawaiian", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-chicken-supreme", "Chicken Supreme", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-meat-feast", "Meat Feast", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-bbq-americano", "BBQ Americano", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-margherita", "Margherita", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-veggie-supreme", "Veggie Supreme", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-farmhouse", "Farmhouse", None, 10, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("pz-hot-honey", "NEW - Hot Honey Sriracha Chicken & Pepperoni", None, 8, kind="pizza", rank=True, diet="Pizza Combinations"),
    S("Vegan Pizzas"),
    G("vg-margherita", "Vegan Margherita", VEGAN, 5, kind="pizza", rank=True, diet="Pizza Combinations"),
    G("vg-veggie-supreme", "Vegan Veggie Supreme", VEGAN, 5, kind="pizza", rank=True, diet="Pizza Combinations"),
    S("Mains"),
    G("lites", "Lites (Flatbreads)", FLAT, 3, rank=True, diet="Lites (Flatbread) Combinations"),
    G("pasta", "Pasta Dishes", PASTA, 2, rank=True),
    S("Buffet Pizzas"),
    G("bf-margherita", "Margherita", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-pepperoni", "Pepperoni", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-bbq-americano", "BBQ Americano", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-veggie", "Veggie", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-hawaiian", "Hawaiian", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-spicy-chicken", "Spicy Chicken", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-bbq-beef-onion", "BBQ Beef & Onion", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-chicken-fajita", "Chicken Fajita", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-creamy-garlic", "Creamy Garlic", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", prefix="Buffet "),
    G("bf-garlic-chicken", "Garlic Chicken & Mushrooms", BUFPIZZA, 3, kind="pizza", diet="Buffet Pizza", diet_name="Garlic Chicken & Mushroom", prefix="Buffet "),
    S("Buffet Sides"),
    G("bf-pasta", "Buffet Pasta", BUFSIDES, 1, diet="Buffet Sides", prefix="Buffet "),
    G("bf-breadsticks", "Garlic Breadsticks", BUFSIDES, 2, diet="Buffet Sides", diet_name="Garlic Breadsticks", prefix="Buffet "),
    G("bf-cheesy-breadsticks", "Cheesy Garlic Breadsticks", BUFSIDES, 2, diet="Buffet Sides", diet_name="Cheesy Garlic Breadsticks", prefix="Buffet "),
    S("Ice Cream Factory"),
    G("icf", "Ice Cream Factory Toppings", DESSERTS, 11, exclude=PER100G_REASON),
    S("Desserts"),
    G("cookie-hot", "Hot Cookie Dough (served with a scoop of ice cream & drizzle of sauce for all)", DESSERTS, 2, diet="Desserts", dup="dine-in",
      note="Served with a scoop of ice cream and a drizzle of sauce"),
    G("cookie-takeaway", "Takeaway Cookie Dough", DESSERTS, 2, diet="Desserts", prefix="Takeaway "),
    G("desserts", "Desserts", DESSERTS, 10, diet="Desserts"),
    S("Mini & Mega Monster"),
    G("kids-pizza", "Pizza", KIDS, 3, rank=True, prefix="Kids "),
    G("kids-mains", "Mains", KIDS, 3, rank=True, prefix="Kids ", diet="Kids Mains"),
    G("kids-sides", "Sides", KIDS, 3, rank=True, prefix="Kids "),
    G("kids-drinks", "Drinks", KIDS, 5, prefix="Kids "),
    G("kids-desserts", "Desserts", KIDS, 3, prefix="Kids "),
]

# Rows we deliberately leave out (besides whole groups with `exclude`), keyed by (gid, printed name).
DROP = {
    ("sides", "Breaded Chicken Tenders"): "earlier recipe; the guide prints a '(From August 2026)' version of the same item, which is the current one",
    ("sides", "NEW - Hot Honey Sriracha Marinated Breaded Chicken Tenders"): "earlier recipe; the guide prints a '(From August 2026)' version of the same item, which is the current one",
}

# Per-row changes: name (tidied or disambiguated), diet (allergen-table name), tags (meat), note. Keyed by (gid, printed name).
ROW = {
    ("sides", "Breaded Chicken Tenders (From August 2026)"): dict(name="Breaded Chicken Tenders", diet="Breaded Chicken Tenders",
        note="Printed as '(From August 2026)'; the guide also prints an older version, left out"),
    ("sides", "NEW - Hot Honey Sriracha Marinated Breaded Chicken Tenders (From August 2026)"): dict(
        name="Hot Honey Sriracha Marinated Breaded Chicken Tenders", diet="NEW - Hot Honey Sriracha Marinated Breaded Chicken Tenders",
        note="Printed as 'NEW' and '(From August 2026)'; the guide also prints an older version, left out"),
    ("sides", "Halloumi Fries"): dict(diet="Halloumi Fries with a choice of dip, for dips see below"),
    ("sides", "Cheesy Bite Bites"): dict(diet="Cheesy Bite Bites (CBBs) / Loaded CBBs"),
    ("sides", "Loaded Bacon Cheesy Bite Bites"): dict(diet="Loaded Bacon CBBs", tags=["contains_pork"], note="Bacon is in the name"),
    ("tabletop", "Heinz BBQ Sauce"): dict(note="Portion weight is printed as 100 g, so these are effectively per-100 g values"),
    ("tabletop", "Heinz Tomato Ketchup"): dict(note="Portion weight is printed as 100 g, so these are effectively per-100 g values"),
    ("tabletop", "Chilli Flakes"): dict(name="Chilli Flakes (tabletop)", diet=None),
    ("dinein-dips", "Sour Cream"): dict(name="Sour Cream Dip (dine-in)", diet="Sour Cream Dip"),
    ("dinein-dips", "Hot Honey (60ml)"): dict(diet="NEW - Hot Honey Dip"),
    ("dinein-dips", "Sweet Chilli Dip (50ml)"): dict(diet="NEW - Sweet Chilli Dip"),
    ("takeaway-dips", "Sweet Chilli Dip (30ml PP) (Oval)"): dict(diet="Sweet Chilli Dip (Oval pot)"),
    ("takeaway-dips", "Garlic Buttermilk Mayo (30ml PP) (Oval)"): dict(diet="Garlic Buttermilk Mayo (Oval pot)"),
    ("takeaway-dips", "BBQ Dip (30ml PP) (Oval)"): dict(diet="BBQ Dip (Oval pot)"),
    ("takeaway-dips", "Ketchup (30ml PP) (Oval)"): dict(diet="Ketchup (Oval pot)"),
    ("finishers", "Chilli Flakes"): dict(name="Chilli Flakes (pizza finisher)"),
    ("finishers", "Dried Parsley"): dict(note="Printed as 0 kcal with trace protein/carbs/fat for a 1 g portion (rounding)"),
    ("finishers", "BBQ Drizzle (Gluten Free)"): dict(diet="BBQ Sauce Drizzle"),
    ("finishers", "Hot Honey Drizzle"): dict(diet="NEW - Hot Honey Drizzle"),
    ("finishers", "Sriracha Chili Flakes"): dict(diet="Sriracha Seasoning", note="Salt printed as 0.22 g for a 1 g portion"),
    ("salad-dressed", "Jalapenos"): dict(diet="Jalapeños"),
    ("salad-dressed", "Roquito® Chilli Peppers"): dict(diet=None),
    ("salad-dried", "Bacon Bits"): dict(note="Name says bacon, but the guide marks it vegetarian and vegan and lists 'Smoky Flavour Sprinkles' "
                                              "as its ingredient, so it is NOT tagged contains_pork"),
    ("salad-dressings", "Sour Cream"): dict(name="Sour Cream (salad station dressing)", diet=None),
    ("pz-pepperoni", None): dict(tags=["contains_pork", "contains_beef"], note="Pepperoni; the guide's pepperoni ingredients list pork and beef"),
    ("pz-pepperoni-feast", None): dict(tags=["contains_pork", "contains_beef"], note="Pepperoni; the guide's pepperoni ingredients list pork and beef"),
    ("pz-hot-honey", None): dict(name="Hot Honey Sriracha Chicken & Pepperoni", tags=["contains_pork", "contains_beef"],
                                 note="Pepperoni in the name (guide's pepperoni ingredients list pork and beef)"),
    ("bf-pepperoni", None): dict(tags=["contains_pork", "contains_beef"], note="Pepperoni; the guide's pepperoni ingredients list pork and beef"),
    ("bf-bbq-beef-onion", None): dict(tags=["contains_beef"], note="Beef is in the name"),
    ("bf-pasta", "Tomato Sauce Pasta"): dict(diet="Tomato Sauce Pasta"),
    ("cookie-takeaway", None): dict(note="Takeaway version; the guide lists the product once in its allergen table"),
    ("desserts", "I Can't Believe Its Not Cheesecake"): dict(name="I Can't Believe It's Not Cheesecake", diet="I Can't Believe It's Not Cheesecake",
        note="Printed 'Its' in the nutrition table, 'It's' in the allergen table"),
    ("desserts", "Hot Chocolate Brownie (served with ice cream & sauce)"): dict(diet="Chocolate Brownie (Served with Vanilla Ice Cream and Chocolate Sauce)"),
    ("desserts", "Take Away Hot Chocolate Brownie (served with ice cream & sauce)"): dict(diet=None),
    ("desserts", "Mini Donuts with Chocolate Sauce"): dict(diet="Mini Donuts with Chocolate Dip"),
    ("desserts", "Take Away Mini Donuts with Chocolate Sauce"): dict(diet=None),
    ("desserts", "Take Away Vanilla Ice Cream Tub (100ml)"): dict(diet="Take Away Vanilla Ice Cream"),
    ("desserts", "Additional Scoop Vanilla Ice cream"): dict(diet="Vanilla Ice Cream"),
    ("desserts", "Additional Chocolate Sauce"): dict(diet="Chocolate Sauce"),
    ("desserts", "Additional Salted Caramel Sauce"): dict(diet="Salted Caramel Sauce"),
    ("desserts", "Additional o.t.t. Salted Caramel Sauce"): dict(diet=None),
    ("kids-mains", "Spaghetti Bolognese"): dict(tags=["contains_beef"], note="Ingredients list minced beef"),
}

# Non-vegetarian (or not marked) dishes whose meat is not stated in the guide's names/ingredients: listed in the report.
MEAT_NOT_STATED = ["Hawaiian", "Chicken Supreme", "Meat Feast", "BBQ Americano", "Farmhouse", "Lasagne", "Chicken Delight Flatbread",
                   "Buffet Hawaiian", "Buffet BBQ Americano", "Buffet Spicy Chicken", "Buffet Chicken Fajita", "Buffet Garlic Chicken & Mushrooms"]


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", "").replace("’", ""))
    return "-".join(p for p in out.split("-") if p)


def pizza_category(group: dict, label: str) -> str:
    if group["category"]:
        return group["category"]
    for key, cat in (("Gluten Free", GF), ("Cheesy Bites", CHEESY), ("Stuffed Crust", STUFFED), ("Handcrafted", HAND), ("Pan", PAN)):
        if key in label:
            return cat
    raise SystemExit(f"Unknown pizza base/size label {label!r}: add it to pizza_category() after checking the PDF.")


def walk(events: list[tuple]) -> list[tuple[dict, str, list[str]]]:
    """Match the PDF's headings and rows to GROUPS in order. Returns (group, printed name, numbers) per row."""
    out: list[tuple[dict, str, list[str]]] = []
    gi = -1
    count = 0

    def close():
        if gi >= 0 and not GROUPS[gi].get("section") and count != GROUPS[gi]["n"]:
            raise SystemExit(f"Group {GROUPS[gi]['h']!r}: the PDF has {count} rows but this script expects {GROUPS[gi]['n']}. "
                             "The menu changed: re-check GROUPS against the PDF.")

    for ev in events:
        if ev[0] == "heading":
            close()
            gi += 1
            if gi >= len(GROUPS) or GROUPS[gi]["h"] != ev[1]:
                want = GROUPS[gi]["h"] if gi < len(GROUPS) else "(end of tables)"
                raise SystemExit(f"Unexpected heading {ev[1]!r} in the nutrition tables (expected {want!r}): layout or menu changed.")
            count = 0
        else:
            if gi < 0 or GROUPS[gi].get("section"):
                raise SystemExit(f"Row {ev[1]!r} appears outside a table group: layout changed.")
            g = GROUPS[gi]
            want_cols = COLS_PIZZA if g["kind"] == "pizza" else COLS_PORTION
            if len(ev[2]) != len(want_cols):
                raise SystemExit(f"Row {ev[1]!r} has {len(ev[2])} numbers but group {g['h']!r} expects {len(want_cols)}.")
            out.append((g, ev[1], ev[2]))
            count += 1
    close()
    if gi != len(GROUPS) - 1:
        raise SystemExit(f"The PDF ended at group {gi + 1} of {len(GROUPS)}: tables are missing.")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live guide")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    walked = walk(pizza_hut_pdf.read_nutrition_events(args.pdf))
    diet = pizza_hut_pdf.read_dietary(args.pdf)
    # Every pizza base is marked vegetarian in the guide, so a vegetarian pizza recipe is vegetarian on any base.
    for base in ("Original Pan", "Handcrafted with Garlic Sprinkle", "Handcrafted without Garlic Sprinkle", "Stuffed Crust",
                 "Cheesy Bites", "Gluten Free", "Lites (flatbreads)"):
        if diet.get(("Pizza Bases", base), ("?",))[0] != "Yes":
            raise SystemExit(f"Pizza base {base!r} is no longer marked vegetarian: re-think the vegetarian tags on pizzas.")

    items = []
    dropped = []      # (reason, printed name)
    unmatched = []    # items with no allergen-table row (so no vegetarian tag)
    notstated_seen = set()
    for g, printed, nums in walked:
        if g["exclude"]:
            dropped.append((g["exclude"], f"{g['h']}: {printed}"))
            continue
        key = (g["gid"], printed)
        if key in DROP:
            dropped.append((DROP[key], printed))
            continue
        ov = {**ROW.get((g["gid"], None), {}), **ROW.get(key, {})}
        v = dict(zip(COLS_PIZZA if g["kind"] == "pizza" else COLS_PORTION, nums))
        notes = [n for n in (g["note"], ov.get("note", "")) if n]
        if g["kind"] == "pizza":
            recipe = ov.get("name") or re.sub(r"^NEW - ", "", g["h"])
            dish = f"{g['prefix']}{recipe}"
            name = f"{dish} - {printed}"
            category = pizza_category(g, printed)
            serving = f"1 slice (of {v['slices']})"
            notes.append(f"Per slice. Whole pizza {v['weight']} g, {v['slices']} slices")
            dname = g["diet_name"] or re.sub(r"^NEW - ", "", g["h"])
        else:
            name = g["prefix"] + (ov.get("name") or re.sub(r"^NEW - ", "", printed))
            if g["prefix"] == "Kids " and printed.startswith("Kids "):
                name = ov.get("name") or printed
            dish = name
            category = g["category"]
            serving = f"1 portion ({v['weight']} g{' average' if g['avg'] else ''})"
            dname = ov["diet"] if "diet" in ov else (g["diet_name"] or printed)
        if g["h"].startswith("NEW - ") or printed.startswith("NEW - "):
            notes.append("The guide labels this NEW")
        row_diet = diet.get((g["diet"], dname)) if (g["diet"] and dname) else None
        tags = []
        if row_diet and row_diet[0] == "Yes":
            tags.append("vegetarian")
        elif g["diet"] and dname and row_diet is None:
            unmatched.append(name)
        tags += ov.get("tags", [])
        if dish in MEAT_NOT_STATED:
            notstated_seen.add(dish)
        items.append({
            "id": slug(name), "name": name, "category": category, "serving": serving,
            "calories": v["kcal"], "protein_g": v["protein"], "carbs_g": v["carbs"], "fat_g": v["fat"],
            "sat_fat_g": v["sat"], "sodium_mg": "", "salt_g": v["salt"], "sugar_g": v["sugars"], "fiber_g": "",
            "weight_g": "" if g["kind"] == "pizza" else v["weight"],
            "tags": "|".join(tags), "limited_time": "false", "rankable": str(g["rank"]).lower(),
            "components": "", "added_on": "", "notes": "; ".join(notes),
            "_group": g["gid"], "_label": printed, "_dup": g["dup"],
        })

    # Duplicate names (different tables, same printed name) get a short qualifier; ids must end up unique.
    from collections import Counter
    counts = Counter(i["name"] for i in items)
    for i in items:
        if counts[i["name"]] > 1:
            if not i["_dup"]:
                raise SystemExit(f"Duplicate name {i['name']!r}: add a qualifier in ROW or a dup label on its group.")
            i["name"] = f"{i['name']} ({i['_dup']})"
            i["id"] = slug(i["name"])
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids: " + ", ".join(sorted({x for x in ids if ids.count(x) > 1}))

    # Rows whose numbers are identical to another row of the same table group (as printed): say so in notes, change nothing.
    by_group = {}
    for i in items:
        by_group.setdefault(i["_group"], []).append(i)
    for rows in by_group.values():
        sig = {}
        for i in rows:
            s = (i["calories"], i["protein_g"], i["carbs_g"], i["fat_g"], i["sat_fat_g"], i["salt_g"], i["sugar_g"])
            sig.setdefault(s, []).append(i)
        for same in sig.values():
            if len(same) > 1:
                for i in same:
                    others = ", ".join(o["_label"] for o in same if o is not i)
                    i["notes"] = (i["notes"] + "; " if i["notes"] else "") + f"Same numbers as {others}, as printed"

    # Buffet pizzas that the guide also prints in the menu table: say where the two printed rows differ, change nothing.
    by_name = {i["name"]: i for i in items}
    cmp_keys = [("calories", "kcal"), ("protein_g", "protein"), ("carbs_g", "carbs"), ("fat_g", "fat"), ("sat_fat_g", "saturates"),
                ("salt_g", "salt"), ("sugar_g", "sugars")]
    for i in items:
        if i["category"] == BUFPIZZA:
            twin = by_name.get(i["name"][len("Buffet "):])
            if twin:
                diffs = [f"{lab} {twin[k]} on the menu vs {i[k]} here" for k, lab in cmp_keys if twin[k] != i[k]]
                if diffs:
                    i["notes"] += "; The menu table prints this pizza slightly differently: " + ", ".join(diffs)

    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", *EXTRA_KEYS, "tags", "limited_time", "rankable", "components", "added_on", "notes"]
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        w.writeheader()
        w.writerows(items)
    with open(args.out / "chain.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["id", "name", "cuisine", "builder_type", "source_title", "source_url", "checked_on", "aliases", "sample"])
        w.writerow([CHAIN_ID, "Pizza Hut", "Pizza", "standard", SOURCE_TITLE, SOURCE_URL, args.checked_on,
                    "pizza hut|pizzahut|pizza hut restaurant", ""])
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")
    # Link only (see the module docstring): every item's allergens are None, so only allergen_guide.csv is written.
    write_allergens(args.out, CHAIN_ID, [(i["id"], None) for i in items],
                    {"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})

    cats = Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {args.out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    print("by category:", ", ".join(f"{c} {cats[c]}" for c in CATEGORY_ORDER if c in cats))
    print(f"left out ({len(dropped)}):")
    for reason, printed in dropped:
        print(f"  - {printed}  [{reason}]")
    print("no allergen-table row (no vegetarian tag):", "; ".join(unmatched) or "none")
    print("meat not stated:", "; ".join(sorted(notstated_seen)))
    print("tagged vegetarian:", sum("vegetarian" in i["tags"] for i in items), "| pork:", sum("contains_pork" in i["tags"] for i in items),
          "| beef:", sum("contains_beef" in i["tags"] for i in items))
    return 0


if __name__ == "__main__":
    sys.exit(main())
