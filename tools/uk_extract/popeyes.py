#!/usr/bin/env python3
"""Build data/source/popeyes/ from Popeyes UK's official nutrition and allergen data feeds.

    python3 tools/uk_extract/popeyes.py --nutrition nutrition.json --allergens allergens.json --checked-on 2026-10-05

Numbers are copied from the nutrition feed exactly as the feed prints them (kcal, kJ (as energy_kj), fat, saturates,
carbs, sugars, protein, salt, fibre; the feed's unreliable `sodium` field is not used). The vegetarian tag comes from the chain's
own `preference` mark in the allergen feed. Allergens come from the same allergen feed, keyed by the same row ids:
the "Contains" and "May contain traces of" lists that the chain's allergen page shows (see popeyes_feed.py), each printed
allergen name mapped by common.allergen_words (an unknown name stops the run). Only the NAMES, categories, servings and
the include/exclude choices below are typed by hand, keyed by the feed's own row ids. If Popeyes adds, removes or renames
a row, the ids and printed names no longer match ROWS and this script stops, so a human re-checks them.

Source: https://allergensandnutritions.popeyesuk.com/nutritional-information (the page popeyesuk.com links to; it loads
the feeds described in popeyes_feed.py). The page shows no issue date or version. Re-run when the menu changes
(about monthly). Allergen page: https://allergensandnutritions.popeyesuk.com/allergen-information (no date shown).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import popeyes_feed  # noqa: E402
from common import ITEM_FIELDS, allergen_words, write_allergens  # noqa: E402

CHAIN_ID = "popeyes"
SOURCE_URL = "https://allergensandnutritions.popeyesuk.com/nutritional-information"
SOURCE_TITLE = "Popeyes UK Nutritional Information, per serving (live table; no issue date or version shown)"
ALLERGEN_URL = "https://allergensandnutritions.popeyesuk.com/allergen-information"
ALLERGEN_TITLE = "Popeyes UK Allergen Information (live table; no issue date or version shown)"

SW, WR, LC, TE, BO, HW, BR, SI, DI, DS, DR = (
    "Sandwiches", "Wraps", "Signature Louisiana Chicken", "Tenders", "Boneless", "Hot Wings",
    "Breakfast", "Sides", "Dips", "Desserts & treats", "Drinks",
)
CATEGORY_ORDER = [SW, WR, LC, TE, BO, HW, BR, SI, DI, DS, DR]

N_PIECE = "Single piece, so not suggested as an order on its own"
N_SHAKE = "Printed kcal is about 20% higher than 4P+4C+9F from the printed macros; entered as printed"
N_BACON = "Streaky bacon adds about 270 kcal here against about 55 to 75 kcal on the other bacon rows; entered as printed"
N_TWIN = "Same numbers as the other Hot Honey Superstack row (two names in the feed); both entered as printed"
N_ZERO_SALT = "Salt is printed as 0 (the live page shows '-' for 0)"


def row(feed_id: int, printed: str, category: str, *, name: str = "", serving: str = "", rankable: bool = True, note: str = "") -> dict:
    return {"id": feed_id, "printed": printed, "name": name or printed, "category": category, "serving": serving, "rankable": rankable, "note": note}


def skip(feed_id: int, printed: str, reason: str) -> dict:
    return {"id": feed_id, "printed": printed, "skip": reason}


IRELAND = "Ireland only (the row's own name says so)"
SELECTED = "'selected restaurants only' (the row's own name says so)"

# One entry per feed row, keyed by the feed's id. `printed` is the feed's name with spaces tidied; it must match.
ROWS: list[dict] = [
    # Sandwiches
    row(1396, 'Chicken Sandwich Classic', SW),
    row(1246, 'Classic Deluxe Chicken Sandwich', SW),
    row(1224, 'Ghost Pepper Sandwich', SW),
    row(1214, 'Ghost Pepper Superstack Sandwich', SW),
    row(1242, 'Hot Honey Sandwich', SW),
    row(1335, 'Hot Honey Superstack Sandwich', SW, note=N_TWIN),
    row(1270, 'Kids Sandwich ketchup', SW, name='Kids Sandwich Ketchup'),
    row(1269, 'Kids Sandwich Mayo', SW),
    row(1268, 'Kids Sandwich Plain', SW),
    row(280, 'Red Bean Creole Vegan Sandwich', SW, note="Printed kJ (2363.83) and kcal (545.43) disagree by about 3.6%; both entered as printed"),
    row(1244, 'Spicy Chicken Sandwich', SW),
    row(1248, 'Spicy Deluxe Chicken Sandwich', SW),
    row(806, 'Spicy Superstack Sandwich', SW),
    row(1258, 'Superstack Classic Chicken Sandwich', SW),
    row(1254, 'Superstack Classic Deluxe Sandwich', SW),
    row(1252, 'Superstack Hot Honey Sandwich', SW, note=N_TWIN),
    row(1251, 'Superstack Spicy Chicken Sandwich', SW),
    row(1255, 'Superstack Spicy Deluxe Sandwich', SW),
    row(1407, 'The Chicken Cruncher', SW),
    row(261, 'The Double Stack', SW),
    row(1320, 'The Mini Sandwich', SW),
    row(265, 'The Spicy Double Stack', SW),
    row(1321, 'The Spicy Mini Sandwich', SW),
    # Wraps
    row(1410, 'Classic Chicken Wrap', WR),
    row(1412, 'Spicy Chicken Wrap', WR),
    # Signature Louisiana Chicken
    row(1350, '1 Piece Signature Louisiana Chicken', LC, serving='1 piece', rankable=False, note=N_PIECE),
    row(1352, '2 Piece Signature Louisiana Chicken', LC, serving='2 pieces'),
    row(1353, '3 Piece Signature Louisiana Chicken', LC, serving='3 pieces'),
    row(1354, '6 Piece Signature Louisiana Chicken', LC, serving='6 pieces'),
    # Tenders
    row(1336, '1 Classic Tender', TE, serving='1 tender', rankable=False, note=N_PIECE),
    row(1346, '1 Spicy Tender', TE, serving='1 tender', rankable=False, note=N_PIECE),
    row(1324, '2 Classic Tenders / Kids Tenders', TE, serving='2 tenders'),
    row(1347, '2 Spicy Tenders', TE, serving='2 tenders'),
    row(1337, '3 Classic Tenders', TE, serving='3 tenders'),
    row(1348, '3 Spicy Tenders', TE, serving='3 tenders'),
    row(1338, '5 Classic Tenders', TE, serving='5 tenders'),
    row(1349, '5 Spicy Tenders', TE, serving='5 tenders'),
    # Boneless
    row(1322, '4 Boneless Plain / Kids Nuggets', BO, serving='4 pieces'),
    row(1311, '4 Cajun Citrus Boneless', BO, serving='4 pieces'),
    row(1304, '4 Garlic Parmesan Boneless', BO, serving='4 pieces'),
    row(1339, '4 Ghost Pepper Boneless', BO, serving='4 pieces'),
    row(1297, '4 Honey BBQ Boneless', BO, serving='4 pieces'),
    row(1326, '6 Boneless Plain', BO, serving='6 pieces'),
    row(1312, '6 Cajun Citrus Boneless', BO, serving='6 pieces'),
    row(1305, '6 Garlic Parmesan Boneless', BO, serving='6 pieces'),
    row(1265, '6 Ghost Pepper Boneless', BO, serving='6 pieces'),
    row(1298, '6 Honey BBQ Boneless', BO, serving='6 pieces'),
    row(1327, '8 Boneless Plain', BO, serving='8 pieces'),
    row(1313, '8 Cajun Citrus Boneless', BO, serving='8 pieces'),
    row(1306, '8 Garlic Parmesan Boneless', BO, serving='8 pieces'),
    row(1341, '8 Ghost Pepper Boneless', BO, serving='8 pieces'),
    row(1299, '8 Honey BBQ Boneless', BO, serving='8 pieces'),
    row(1356, '10 Boneless Plain', BO, serving='10 pieces'),
    row(1360, '10 Cajun Citrus Boneless', BO, serving='10 pieces'),
    row(1357, '10 Garlic Parmesan Boneless', BO, serving='10 pieces'),
    row(1359, '10 Ghost Pepper Boneless', BO, serving='10 pieces'),
    row(1460, '10 Honey BBQ Boneless', BO, serving='10 pieces'),
    row(1358, '10 Hot Honey Boneless', BO, serving='10 pieces'),
    row(1328, '12 Boneless Plain', BO, serving='12 pieces'),
    row(1314, '12 Cajun Citrus Boneless', BO, serving='12 pieces'),
    row(1307, '12 Garlic Parmesan Boneless', BO, serving='12 pieces'),
    row(1342, '12 Ghost Pepper Boneless', BO, serving='12 pieces'),
    row(1300, '12 Honey BBQ Boneless', BO, serving='12 pieces'),
    row(1296, '12 Hot Honey Boneless', BO, serving='12 pieces'),
    row(1329, '20 Boneless Plain', BO, serving='20 pieces'),
    # Hot Wings
    row(1331, '2 Hot Wings', HW, serving='2 wings'),
    row(1333, '3 Hot Wings', HW, serving='3 wings'),
    row(1315, '6 Cajun Citrus Hot Wings', HW, serving='6 wings'),
    row(1308, '6 Garlic Parmesan Hot Wings', HW, serving='6 wings'),
    row(1343, '6 Ghost Pepper Hot Wings', HW, serving='6 wings'),
    row(1301, '6 Honey BBQ Hot Wings', HW, serving='6 wings'),
    row(1334, '6 Hot Wings', HW, serving='6 wings'),
    row(1316, '8 Cajun Citrus Hot Wings', HW, serving='8 wings'),
    row(1309, '8 Garlic Parmesan Hot Wings', HW, serving='8 wings'),
    row(1344, '8 Ghost Pepper Hot Wings', HW, serving='8 wings'),
    row(1302, '8 Honey BBQ Hot Wings', HW, serving='8 wings'),
    row(1325, '8 Hot Wings', HW, serving='8 wings'),
    row(1355, '10 Hot Wings', HW, serving='10 wings'),
    row(1317, '12 Cajun Citrus Hot Wings', HW, serving='12 wings'),
    row(1310, '12 Garlic Parmesan Hot Wings', HW, serving='12 wings'),
    row(1345, '12 Ghost Pepper Hot Wings', HW, serving='12 wings'),
    row(1303, '12 Honey BBQ Hot Wings', HW, serving='12 wings'),
    row(1330, '12 Hot Wings', HW, serving='12 wings'),
    row(1332, '20 Hot Wings', HW, serving='20 wings'),
    # Breakfast
    row(434, 'Bacon Egg and Cheese Muffin', BR),
    row(205, 'Bacon Roll - Plain', BR),
    row(202, 'Bacon Roll with Cajun Ketchup', BR),
    row(204, 'Bacon Roll with Heinz Ketchup', BR),
    row(201, 'Bacon Roll with HP Sauce', BR),
    row(231, 'Big Breakfast Roll with Chicken Breakfast Patty & Heinz Ketchup', BR),
    row(227, 'Big Breakfast Roll with Chicken Breakfast Patty & HP Sauce', BR),
    row(1422, 'Big Breakfast Roll with Chicken Breakfast Patty, Streaky Bacon & Heinz Ketchup', BR),
    row(1420, 'Big Breakfast Roll with Chicken Breakfast Patty, Streaky Bacon & HP Sauce', BR),
    row(247, 'Big Breakfast Wrap with Chicken Breakfast Patty & Heinz Ketchup', BR),
    row(218, 'Big Breakfast Wrap with Chicken Breakfast Patty, Streaky Bacon & Heinz Ketchup', BR),
    row(216, 'Big Breakfast Wrap with Chicken Breakfast Patty, Streaky Bacon & HP Sauce', BR),
    row(1391, 'Big Cajun Roll with Chicken Breakfast Patty', BR),
    row(1418, 'Big Cajun Roll with Chicken Breakfast Patty & Streaky Bacon', BR, note=N_BACON),
    row(249, 'Big Cajun Wrap with Chicken Breakfast Patty', BR),
    row(220, 'Big Cajun Wrap with Chicken Breakfast Patty & Streaky Bacon', BR, note=N_BACON),
    row(239, 'Breakfast Roll with Chicken Breakfast Patty & Cajun Ketchup', BR),
    row(240, 'Breakfast Roll with Chicken Breakfast Patty & Heinz Ketchup', BR),
    row(238, 'Breakfast Roll with Chicken Breakfast Patty & HP Sauce', BR),
    row(1426, 'Breakfast Roll with Chicken Breakfast Patty, Streaky Bacon & Cajun Ketchup', BR),
    row(1427, 'Breakfast Roll with Chicken Breakfast Patty, Streaky Bacon & Heinz Ketchup', BR),
    row(1423, 'Breakfast Roll with Chicken Breakfast Patty, Streaky Bacon & HP Sauce', BR),
    row(221, 'Cajun Hash Brown', BR, rankable=False, note="Single piece add-on, so not suggested as an order on its own"),
    row(206, 'Chicken Breakfast Patty, Egg & Cheese Muffin', BR),
    row(210, 'Double Bacon, Egg and Cheese Muffin', BR),
    row(212, 'Double Chicken Breakfast Patty, Egg & Cheese Muffin', BR),
    skip(1119, 'Double Sausage, Egg & Cheese Roll *selected restaurants only', SELECTED),
    skip(1123, 'Double Sausage, Egg & Cheese Roll with Brown Sauce*selected restaurants only', SELECTED),
    skip(1121, 'Double Sausage, Egg & Cheese Roll with Ketchup*selected restaurants only', SELECTED),
    skip(963, 'Egg & Cheese Roll *selected restaurants only', SELECTED),
    row(214, 'Egg and Cheese Muffin', BR),
    row(222, 'Hash Brown', BR, rankable=False, note="Single piece add-on, so not suggested as an order on its own"),
    # Sides
    row(869, 'Biscuit', SI),
    row(953, 'Biscuit & Gravy', SI),
    row(874, 'Biscuit & Honey', SI),
    row(875, 'Biscuit & Hot Honey', SI),
    row(1371, 'Cajun Fries (Large)', SI, name='Cajun Fries (large)', serving='Large'),
    row(1370, 'Cajun Fries (Reg)', SI, name='Cajun Fries (regular)', serving='Regular'),
    row(775, 'Cajun Gravy', SI, rankable=False, note="A pot of gravy, so not suggested as an order on its own"),
    row(1290, 'Cheesy Fries', SI),
    row(1287, 'Fries (Large)', SI, name='Fries (large)', serving='Large'),
    row(1288, 'Fries (Reg)', SI, name='Fries (regular)', serving='Regular'),
    row(1289, 'Fries (Small)', SI, name='Fries (small)', serving='Small'),
    row(1106, 'Honey BBQ Cheesy Loaded Fries', SI),
    row(427, 'Kids Side Salad', SI),
    row(520, 'Mac & Cheese', SI),
    row(431, 'Mash & Gravy', SI),
    row(551, 'Smoky Beans', SI),
    # Dips
    row(413, 'Bold BBQ', DI, rankable=False),
    row(414, 'Buffalo', DI, rankable=False),
    row(418, 'Classic Mayonnaise', DI, rankable=False),
    row(415, 'Garlic Mayo', DI, rankable=False),
    row(1403, 'Ghost Pepper Big Dip', DI, rankable=False, note="Saturates printed as 0 although fat is not 0; salt 5.28 g for one dip"),
    row(482, 'Hot Honey', DI, rankable=False),
    row(891, 'Kickback Dip Pot', DI, rankable=False),
    row(416, 'Louisiana Hot', DI, rankable=False),
    row(417, 'Mango Habanero', DI, rankable=False),
    row(419, 'Ranch', DI, rankable=False),
    skip(1261, 'Taco Sauce (Ireland Only)', IRELAND),
    row(1041, 'The Big Cheese', DI, rankable=False),
    row(1405, 'The Big Honey BBQ Dip', DI, rankable=False),
    row(1406, 'The Big Kickback Dip', DI, rankable=False),
    row(1404, 'The Big Ranch Dip', DI, rankable=False),
    # Desserts & treats (the feed files Whipz under "Whipz" and the cookies under "Sides")
    row(404, 'Biscoff Whipz', DS, rankable=False),
    row(397, 'Chocolate Whipz', DS, rankable=False),
    row(868, 'M&Ms Whipz', DS, rankable=False),
    row(197, 'Mini Whipz - Biscoff', DS, rankable=False),
    row(194, 'Mini Whipz - Chocolate', DS, rankable=False),
    row(867, 'Mini Whipz - M&Ms', DS, rankable=False),
    row(1238, 'Mini Whipz - Mud Pie', DS, rankable=False),
    row(198, 'Mini Whipz - Oreo', DS, rankable=False),
    row(199, 'Mini Whipz - Strawberry', DS, rankable=False),
    row(196, 'Mini Whipz - Vanilla', DS, rankable=False),
    row(1237, 'Mud Pie Whipz', DS, rankable=False),
    row(406, 'Oreo Whipz', DS, rankable=False),
    row(410, 'Strawberry Whipz', DS, rankable=False),
    row(411, 'Vanilla Whipz', DS, rankable=False),
    row(871, 'Biscuit & Nutella', DS, rankable=False, note="Sweet spread biscuit, filed with the treats; the feed lists it under Sides"),
    row(1014, 'Double Chocolate Cookie', DS, rankable=False, note="The feed lists it under Sides"),
    row(1013, 'Milk Chocolate Cookie', DS, rankable=False, note="The feed lists it under Sides"),
    # Drinks
    row(1276, 'Black Americano', DR, rankable=False, note="Every value is printed as 0 (the live page shows '-' for 0)"),
    row(471, 'Cappuccino', DR, rankable=False),
    row(514, 'Caramel Latte', DR, rankable=False),
    row(1092, 'Chocolate Shake', DR, rankable=False, note=N_SHAKE),
    skip(517, 'Fanta Low Sugar (Large 22oz) Ireland Only', IRELAND),
    skip(516, 'Fanta Low Sugar (Reg 16oz) Ireland Only', IRELAND),
    skip(515, 'Fanta Low Sugar (small 12oz) Ireland Only', IRELAND),
    row(472, 'Flat White', DR, rankable=False),
    row(476, "Jimmy's Iced Coffee", DR, rankable=False),
    row(1459, 'Kids Oasis Summer Fruits', DR, rankable=False),
    row(400, 'Kids Shake - Chocolate', DR, rankable=False, note=N_SHAKE),
    row(401, 'Kids Shake - Strawberry', DR, rankable=False, note=N_SHAKE),
    row(402, 'Kids Shake - Vanilla', DR, rankable=False, note=N_SHAKE),
    row(1117, 'Large Chocolate Shake', DR, serving='Large', rankable=False, note=N_SHAKE),
    row(819, 'Large Lotus Biscoff Shake', DR, serving='Large', rankable=False, note=N_SHAKE),
    row(821, 'Large Oreo Shake', DR, serving='Large', rankable=False, note=N_SHAKE),
    row(1116, 'Large Strawberry Shake', DR, serving='Large', rankable=False, note=N_SHAKE),
    row(817, 'Large Vanilla Shake', DR, serving='Large', rankable=False, note=N_SHAKE),
    row(473, 'Latte', DR, rankable=False),
    row(1233, 'Lemonade', DR, rankable=False, note=N_ZERO_SALT),
    row(403, 'Lotus Biscoff Shake', DR, rankable=False, note=N_SHAKE),
    row(1429, 'Oasis Summer Fruits Large', DR, name='Oasis Summer Fruits (large)', serving='Large', rankable=False),
    row(1397, 'Oasis Summer Fruits Regular', DR, name='Oasis Summer Fruits (regular)', serving='Regular', rankable=False),
    row(407, 'Oreo Shake', DR, rankable=False, note=N_SHAKE),
    row(1234, 'Peach Lemonade', DR, rankable=False, note=N_ZERO_SALT),
    row(1236, 'Red Bull Citrus Zest', DR, rankable=False),
    skip(1203, 'Red Bull Watermelon - Ireland Only', IRELAND),
    row(1235, 'Strawberry Lemonade', DR, rankable=False, note=N_ZERO_SALT),
    row(1093, 'Strawberry Shake', DR, rankable=False, note=N_SHAKE),
    row(475, 'Tea', DR, rankable=False),
    row(412, 'Vanilla Shake', DR, rankable=False, note=N_SHAKE),
    row(1275, 'White Americano', DR, rankable=False),
]

PORK = re.compile(r"\b(bacon|sausage|ham|pork|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)


def slug(name: str) -> str:
    out = "".join(c.lower() if c.isalnum() else "-" for c in name.replace("'", ""))
    return "-".join(p for p in out.split("-") if p)


def tidy(s: str) -> str:
    return " ".join(s.split())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--nutrition", required=True, type=Path, help="the nutrition feed JSON (see popeyes_feed.py)")
    ap.add_argument("--allergens", required=True, type=Path, help="the allergen feed JSON (allergens and the vegetarian/vegan mark)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you downloaded the feeds")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    feed = popeyes_feed.read_nutrition(args.nutrition)
    prefs = popeyes_feed.read_preferences(args.allergens)
    allergens = popeyes_feed.read_allergens(args.allergens)

    # Stop if the feed and ROWS no longer describe the same menu.
    spec = {r["id"]: r for r in ROWS}
    assert len(spec) == len(ROWS), "duplicate feed id in ROWS"
    problems = []
    feed_ids = {r["id"] for r in feed}
    if len(feed_ids) != len(feed):
        problems.append("the feed repeats an id")
    for fid in sorted(feed_ids - set(spec)):
        problems.append(f"new in the feed, not in ROWS: {fid} {next(r['name'] for r in feed if r['id'] == fid)!r}")
    for fid in sorted(set(spec) - feed_ids):
        problems.append(f"in ROWS but gone from the feed: {fid} {spec[fid]['printed']!r}")
    for r in feed:
        if r["id"] in spec and tidy(r["name"]) != spec[r["id"]]["printed"]:
            problems.append(f"renamed in the feed: {r['id']} {tidy(r['name'])!r} (ROWS has {spec[r['id']]['printed']!r})")
    if set(prefs) != feed_ids:
        problems.append("the allergen feed and the nutrition feed do not list the same ids")
    if problems:
        print(f"The feed has {len(feed)} rows and ROWS names {len(ROWS)}. The menu changed: re-check ROWS before running again.\n  "
              + "\n  ".join(problems), file=sys.stderr)
        return 1

    by_id = {r["id"]: r for r in feed}
    items, skipped = [], []
    for s in ROWS:  # ROWS order = display order inside a category
        printed = by_id[s["id"]]
        if "skip" in s:
            skipped.append(s)
            continue
        pref = prefs[printed["id"]]
        tags = []
        if pref in ("vegetarian", "vegan"):
            tags.append("vegetarian")
        if PORK.search(s["printed"]):
            tags.append("contains_pork")
        if BEEF.search(s["printed"]):
            tags.append("contains_beef")
        assert not ("vegetarian" in tags and len(tags) > 1), f"{s['printed']}: marked vegetarian but its name says meat"
        where = f"allergen feed row {s['id']} {s['printed']!r}"
        contains, cereals, nuts = allergen_words(allergens[s["id"]]["contains"], where)
        may, _, _ = allergen_words(allergens[s["id"]]["may_contain"], where)
        items.append({
            "id": slug(s["name"]), "name": s["name"], "category": s["category"], "serving": s["serving"],
            "calories": printed["kcal"], "protein_g": printed["protein"], "carbs_g": printed["carbohydrates"], "fat_g": printed["fats"],
            "sat_fat_g": printed["saturated_fats"], "sodium_mg": "", "salt_g": printed["salt"], "sugar_g": printed["sugar"],
            "fiber_g": printed["fibre"], "energy_kj": printed["kJ"], "tags": "|".join(tags),
            "limited_time": "false", "rankable": str(s["rankable"]).lower(), "components": "", "added_on": "", "notes": s["note"],
            "_allergens": {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts},
        })
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids: " + ", ".join(i for i, n in Counter(ids).items() if n > 1)
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))  # stable: keeps ROWS order inside a category

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ITEM_FIELDS
    write_allergens(args.out, CHAIN_ID, [(i["id"], i.pop("_allergens")) for i in items],
                    {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True})
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(items)
    (args.out / "chain.csv").write_text(
        "id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample\n"
        f'{CHAIN_ID},Popeyes,Chicken,standard,"{SOURCE_TITLE}",{SOURCE_URL},{args.checked_on},popeyes|popeyes uk|popeyes louisiana kitchen,\n',
        encoding="utf-8")
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")

    print(f"wrote {len(items)} items to {args.out}")
    for cat, n in Counter(i["category"] for i in items).most_common():
        print(f"  {cat}: {n}")
    print(f"left out {len(skipped)}:")
    for s in skipped:
        print(f"  {s['id']} {s['printed']!r}: {s['skip']}")
    print(f"nutrition feed sha256 {hashlib.sha256(args.nutrition.read_bytes()).hexdigest()}")
    print(f"allergen feed sha256  {hashlib.sha256(args.allergens.read_bytes()).hexdigest()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
