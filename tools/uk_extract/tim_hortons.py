#!/usr/bin/env python3
"""Build data/source/tim-hortons/ from Tim Hortons UK's official nutrition pages (timhortons.co.uk/information/<id>).

    python3 tools/uk_extract/tim_hortons.py --fetch DIR --checked-on 2026-10-06 --pdf Nutrition-....pdf   # download once (1 request/s), extract
    python3 tools/uk_extract/tim_hortons.py --raw DIR --checked-on 2026-10-06 --pdf Nutrition-....pdf     # re-extract from the saved pages

Tim Hortons UK publishes one page per product with a per-serving table (kcal, fat, saturates, carbohydrates, sugars,
fibre, protein, salt; kJ is only used to flag disagreements). The menu index in every page's sidebar lists every product;
drinks with a size switch have /small and /large pages (the page without a suffix is the Medium one). The chain's menu page
also links its "Nutrition" PDF (allergens + the same table, stamped with a version, e.g. "C5 5.10.26 - v6"; save it under its
published file name); `--pdf` compares every row of this extraction against it and reports differences, but the PDF is never a
source of numbers here. Extra per-serving numbers: energy_kj (the page's kJ) and weight_g (only where the serving is printed
in grams).

Allergens (docs/DATA.md "Allergens"): every product page, and every size page of a drink, prints its own "Allergens:" line
under the table (e.g. "milk, wheat, rye"), so each item gets the allergens printed for exactly that product and size. The
pages print no "may contain" information; the PDF's allergen table does (a "Maybe" cell), and those cells become the item's
may_contain (the PDF has one row per product, so every size of a drink gets its row's marks; a product the PDF has no row for
stops the allergen files). Plain coffee, teas, lemonades and fountain drinks print no "Allergens:" line at all;
such an item is read as containing none of the 14 only when the PDF's allergen table has a row of exactly the same name
(case, punctuation and spacing ignored) with no "Yes" in it. Every page line is also cross-checked against that PDF row
where one exists (the PDF prints one row per product, no sizes). Any disagreement or an unconfirmed missing line: the chain
gets only allergen_guide.csv (a link to the PDF, all or nothing) and the run lists why.

Numbers are copied as printed. Only the names (they must match the index exactly), the categories, the rankable flags and
the tag word lists below are typed by hand. If the index gains, loses or renames a product, a size switch changes, or a row's
numbers change which products are held back, this script stops so a human re-checks (see SPEC, EXCLUDED, EXPECTED_HELDBACK).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tim_hortons_page as page  # noqa: E402
import tim_hortons_pdf  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "tim-hortons"
SOURCE_URL = "https://timhortons.co.uk/information/56"
PDF_BASE = "https://timhortons.co.uk/assets/img/products/"   # where the menu page links the Nutrition PDF (file name = version)
SOURCE_TITLE = ("Tim Hortons UK website: product nutritional information, Great Britain menu (timhortons.co.uk/information "
                "pages, retrieved {checked_on}; the pages carry no version date)")

# Display categories, in display order.
BR, BS, WR, TS, MN, BK, HOT, COLD, SOFT, SA, AD = (
    "Breakfast", "Burgers & sandwiches", "Wraps", "Tenders & sides", "Timmies Minis", "Bakery & treats",
    "Hot drinks", "Cold drinks", "Soft drinks", "Sauces", "Add-ons")
CATEGORY_ORDER = [BR, BS, WR, TS, MN, BK, HOT, COLD, SOFT, SA, AD]

# Size labels of drinks with a size switch -> the serving size every such page must print.
SIZE_SERVING = {"Small": "12 oz", "Medium": "16 oz", "Large": "20 oz"}

# One entry per product that is published: (page id, name exactly as the menu index lists it, category, rankable).
# Drinks, sauces, add-ons, per-piece items and bakery treats are not "orders", so rankable is False.
SPEC: list[tuple[str, str, str, bool]] = [
    ('552', 'Americano', HOT, False),
    ('1', 'Original Blend Coffee', HOT, False),
    ('2', 'Dark Roast Coffee', HOT, False),
    ('3', 'Caramel Macchiato', HOT, False),
    ('8', 'Cappuccino', HOT, False),
    ('11', 'Flat White', HOT, False),
    ('179', 'Pumpkin Spice Latte', HOT, False),
    ('347', "Maple Caramel S'mores Latte", HOT, False),
    ('613', 'Matcha Latte', HOT, False),
    ('4', 'Latte', HOT, False),
    ('658', 'Pumpkin Spice French Vanilla', HOT, False),
    ('6', 'French Vanilla Latte', HOT, False),
    ('10', 'French Vanilla', HOT, False),
    ('7', 'Mocha', HOT, False),
    ('9', 'Hot Chocolate', HOT, False),
    ('14', 'Espresso', HOT, False),
    ('13', 'Breakfast Tea', HOT, False),
    ('336', 'Green Tea', HOT, False),
    ('337', 'Peppermint Tea', HOT, False),
    ('364', 'Oat Milk', AD, False),
    ('366', 'Coconut Milk', AD, False),
    ('367', 'Skimmed Milk', AD, False),
    ('612', 'Matcha Iced Latte', COLD, False),
    ('24', 'Iced Latte', COLD, False),
    ('287', 'Iced Caramel Latte', COLD, False),
    ('288', 'Iced Vanilla Latte', COLD, False),
    ('22', 'Iced French Vanilla', COLD, False),
    ('292', 'Iced French Vanilla Latte', COLD, False),
    ('21', 'Iced Caramel Macchiato', COLD, False),
    ('350', "Maple Caramel S'mores Frappé", COLD, False),
    ('611', 'Matcha Frappé', COLD, False),
    ('310', 'Caramel Cream Frappé', COLD, False),
    ('309', 'Chocolate Cream Frappé', COLD, False),
    ('349', "Maple Caramel S'mores Iced Capp®", COLD, False),
    ('311', 'Strawberries & Cream Frappé', COLD, False),
    ('312', 'Cookies & Cream Frappé', COLD, False),
    ('289', 'Caramel Iced Capp®', COLD, False),
    ('290', 'Cookies & Cream Iced Capp®', COLD, False),
    ('291', 'Mocha Iced Capp®', COLD, False),
    ('26', 'Original Iced Capp®', COLD, False),
    ('25', 'Light Iced Capp®', COLD, False),
    ('173', 'Coconut Iced Capp®', COLD, False),
    ('231', 'Lemonade Refresher', COLD, False),
    ('232', 'Strawberry Lemonade Refresher', COLD, False),
    ('238', 'Cherry Crush Cooler', COLD, False),
    ('237', 'Tropical Cooler', COLD, False),
    ('167', 'Tims® Shake Brownie', COLD, False),
    ('18', 'Tims® Shake Chocolate', COLD, False),
    ('20', 'Tims® Shake Strawberry', COLD, False),
    ('368', 'Semi-Skimmed Milk', AD, False),
    ('363', 'Coca-Cola', SOFT, False),
    ('358', 'Coca-Cola Zero Sugar', SOFT, False),
    ('359', 'Diet Coke', SOFT, False),
    ('360', 'Fanta Orange Zero', SOFT, False),
    ('361', 'Sprite Zero', SOFT, False),
    ('362', 'Dr Pepper Zero', SOFT, False),
    ('657', 'Breakfast Burrito', BR, True),
    ('620', 'Bacon Roll (Loin)', BR, True),
    ('37', 'Original Breakfast Wrap', BR, True),
    ('38', 'Big Breakfast Wrap', BR, True),
    ('302', 'Loaded Veggie Wrap', BR, True),
    ('47', 'Egg and Cheese Muffin', BR, True),
    ('655', 'Bacon, Egg and Cheese Muffin (Streaky Bacon)', BR, True),
    ('651', 'Bacon, Egg and Cheese Muffin Stack (Streaky Bacon)', BR, True),
    ('650', 'Double Bacon, Egg and Cheese Muffin (Streaky Bacon)', BR, True),
    ('652', 'Double Bacon & Egg Muffin Stack (Streaky Bacon)', BR, True),
    ('45', 'Sausage & Egg with Cheese Muffin', BR, True),
    ('42', 'Sausage & Egg with Cheese Muffin Stack', BR, True),
    ('340', 'Double Sausage & Egg with Cheese Muffin', BR, True),
    ('300', 'Double Sausage & Egg with Cheese Muffin Stack', BR, True),
    ('44', 'Veggie Egg with Cheese Muffin', BR, True),
    ('303', 'Veggie Egg with Cheese Muffin Stack', BR, True),
    ('40', 'Grilled Breakfast Bagel with Sausage', BR, True),
    ('654', 'Grilled Breakfast Bagel with Bacon (Streaky Bacon)', BR, True),
    ('342', 'Grilled Breakfast Bagel with Veggie Sausage', BR, True),
    ('357', 'Plain Bagel', BR, True),
    ('53', 'Bagel with Butter', BR, True),
    ('56', 'Bagel with Cream Cheese', BR, True),
    ('105', 'Bacon & Maple Pancakes', BR, True),
    ('106', 'Maple Syrup Pancakes', BR, True),
    ('107', 'Chocolate Hazelnut & Cookie Pancakes', BR, True),
    ('49', 'Hash Brown', BR, False),
    ('401', 'Tims® Double Cheeseburger', BS, True),
    ('226', 'Nacho Double Cheeseburger', BS, True),
    ('402', 'Tims® Bacon Double Cheeseburger', BS, True),
    ('403', 'Tims® Triple Cheeseburger', BS, True),
    ('240', 'Nacho Chicken Sandwich', BS, True),
    ('66', 'Tims® Crispy Chicken Sandwich', BS, True),
    ('444', 'Nacho Chicken Stack', BS, True),
    ('65', 'Tims® Crispy Chicken Stack', BS, True),
    ('67', 'Crispy Meatless Sandwich', BS, True),
    ('556', 'BLT Chicken Wrap', WR, True),
    ('554', 'Maple BBQ Chicken Wrap', WR, True),
    ('553', 'Sweet Chilli Mayo Chicken Wrap', WR, True),
    ('239', 'Nacho Chicken Wrap', WR, True),
    ('555', 'Smoky Chipotle Chicken Wrap', WR, True),
    ('557', 'VLT Vegan Wrap', WR, True),
    ('79', '5 Piece Tims® Chicken Tenders', TS, True),
    ('78', '3 Piece Tims® Chicken Tenders', TS, True),
    ('522', 'Nacho Cheese Melt', BS, True),
    ('558', 'Cheese and Herb Melt', BS, True),
    ('559', 'Ham Hock and Cheese Melt', BS, True),
    ('560', 'Maple BBQ Chicken Melt', BS, True),
    ('398', 'Tims® Savers - Hamburger', BS, True),
    ('399', 'Tims® Savers - Cheeseburger', BS, True),
    ('400', 'Tims® Savers - Crispy Chicken Snack Wrap', WR, True),
    ('397', 'Tims® Savers - 2 Chicken Tenders & Dip', TS, True),
    ('521', 'Nacho Chicken Loaded Fries', TS, True),
    ('507', 'Maple BBQ Loaded Lattice Fries', TS, True),
    ('532', '5 Fajita Spiced Chicken Tenders', TS, True),
    ('531', '3 Fajita Spiced Chicken Tenders', TS, True),
    ('525', 'Nacho Chilli Cheese Bites 8pc', TS, True),
    ('524', 'Nacho Chilli Cheese Bites 4pc', TS, True),
    ('191', 'Lattice Fries', TS, True),
    ('396', 'Vegan Mayo', SA, False),
    ('356', 'Chipotle Mayonnaise', SA, False),
    ('353', 'Sweet Chilli Sauce', SA, False),
    ('354', 'Maple BBQ Sauce', SA, False),
    ('355', 'Tomato Ketchup', SA, False),
    ('192', 'Timmies Minis Chicken Mayo Sandwich', MN, True),
    ('195', 'Timmies Minis Cheeseburger', MN, True),
    ('98', 'Timmies Minis 2 Chicken Tenders', MN, True),
    ('451', 'Timmies Minis Cheese Melt', MN, True),
    ('338', 'Timmies Minis Lattice Fries', MN, True),
    ('197', 'Stanley Spider Deluxe Donut', BK, False),
    ('274', 'Maple Syrup, Caramel and Fudge Pancakes', BK, False),
    ('109', 'Chocolate Hazelnut Pancakes made with Oreo®', BK, False),
    ('632', 'Monty the Moose Deluxe Donut', BK, False),
    ('345', "Maple Caramel S'mores Deluxe Donut", BK, False),
    ('157', 'Chocolate Brownie Donut', BK, False),
    ('561', 'Pumpkin Spice Deluxe Donut', BK, False),
    ('158', 'Maple & Caramel Donut', BK, False),
    ('160', 'Caramel Apple Fritter', BK, False),
    ('120', 'Boston Cream Donut', BK, False),
    ('121', 'Canadian Maple Donut', BK, False),
    ('118', 'Maple Dip Donut', BK, False),
    ('117', 'Vanilla Dip Donut', BK, False),
    ('116', 'Chocolate Dip Donut', BK, False),
    ('115', 'Old Fashioned Glazed Donut', BK, False),
    ('122', 'Apple Fritter Donut', BK, False),
    ('123', 'Honey Cruller', BK, False),
    ('278', 'Old Fashioned Glazed Timbits®', BK, False),
    ('305', 'Chocolate Glazed Timbits®', BK, False),
    ('304', 'Honey Dip Timbits®', BK, False),
    ('279', 'Apple Pie Timbits®', BK, False),
    ('283', 'Honey Cruller Timbits®', BK, False),
    ('281', 'White Birthday Cake Timbits®', BK, False),
    ('282', 'Apple Fritter Timbits®', BK, False),
    ('674', 'Bacon & Cheese Breakfast Snack Wrap', BR, True),
    ('675', 'Sausage & Cheese Breakfast Snack Wrap', BR, True),
    ('676', 'Veggie Breakfast Snack Wrap', BR, True),
    ('677', 'Egg & Cheese Breakfast Snack Wrap', BR, True),
    ('656', 'Bacon & Cheese Muffin (Streaky Bacon)', BR, True),
    ('621', 'Big Breakfast Wrap (Streaky Bacon)', BR, True),
    ('442', 'Raspberry Donut', BK, False),
    ('513', 'Raspberry Vanilla Donut', BK, False),
    ('443', 'Raspberry Timbits®', BK, False),
]

# Products on the index that are left out, with the reason (the script checks the reason still holds).
_NI = "Marked 'NI Only' (Northern Ireland): not on the Great Britain menu."
_SEL = "Marked 'selected stores only': not on the full Great Britain menu."
_BOX = "The page prints no nutrition values for the box (only an average kcal per donut, no fat, carbohydrate or protein)."
EXCLUDED: dict[str, tuple[str, str]] = {
    "661": ("Tims\u00ae Double Cheeseburger - NI Only", _NI),
    "662": ("Tims\u00ae Bacon Double Cheeseburger - NI Only", _NI),
    "663": ("Tims\u00ae Triple Cheeseburger - NI Only", _NI),
    "666": ("Tims\u00ae Crispy Chicken Sandwich - NI Only", _NI),
    "667": ("Tims\u00ae Crispy Chicken Stack - NI Only", _NI),
    "669": ("Crispy Meatless Sandwich - NI Only", _NI),
    "670": ("Tims\u00ae Savers - Hamburger - NI Only", _NI),
    "671": ("Tims\u00ae Savers - Cheeseburger - NI Only", _NI),
    "672": ("Timmies Minis Chicken Mayo Sandwich - NI Only", _NI),
    "673": ("Timmies Minis Cheeseburger - NI Only", _NI),
    "617": ("Bacon & Cheese Muffin (selected stores only)", _SEL),
    "622": ("Big Breakfast Bun (selected stores only)", _SEL),
    "618": ("Veggie Cheese Muffin (selected stores only)", _SEL),
    "616": ("Sausage & Cheese Muffin (selected stores only)", _SEL),
    "293": ("6 Box Assorted Donuts", _BOX),
    "294": ("12 Box Assorted Donuts", _BOX),
    "296": ("24 Box Assorted Donuts", _BOX),
    "295": ("12 Box Old Fashioned Glazed Donuts", _BOX),
    "299": ("Dozen Assorted Donuts Plus Dozen Old Fashioned Glazed Donuts", _BOX),
    "297": ("6 Box Deluxe Donuts", _BOX),
    "298": ("12 Box Deluxe Donuts", _BOX),
    "284": ("10 Box Timbits\u00ae", _BOX),
    "285": ("20 Box Timbits\u00ae", _BOX),
    "286": ("50 Box Timbits\u00ae", _BOX),
}

# Item ids (made from the name, see common.slug) that the script holds back on the rules in `impossible()`. If a refresh
# changes this set the script stops: look at the rows, then update the set.
EXPECTED_HELDBACK = {
    "iced-latte-small", "iced-vanilla-latte-small", "mocha-iced-capp-small", "mocha-iced-capp-medium", "mocha-iced-capp-large",
    "raspberry-timbits", "skimmed-milk", "strawberry-lemonade-refresher-large", "dark-roast-coffee-large",
}

PORK_NAME = re.compile(r"\b(bacon|ham|sausage|blt)\b", re.I)  # name says pork (BLT = bacon, lettuce, tomato)
NOT_PORK = re.compile(r"veggie sausage", re.I)
# Items whose name does not say what meat they contain (burgers, breakfast wraps): listed in the run output.
MEAT_NOT_STATED = re.compile(r"burger", re.I)
MEAT_NOT_STATED_IDS = {"657", "37", "38"}  # Breakfast Burrito, Original Breakfast Wrap, Big Breakfast Wrap

NOTE = ("Values are per serving as the chain prints them and do not include dips. Items sold only in Northern Ireland or "
        "selected stores, and boxes of donuts and Timbits (no values printed), are left out.")

# Rows the chain prints that look odd but do not meet the hold-back rules: (page id, size label or "") -> note.
MANUAL_NOTES: dict[tuple[str, str], str] = {
    ("656", ""): "Prints 52 g fat and 623 kcal; the chain's other bacon muffins print about 18 g fat and 333-354 kcal. Consistent with its own macros, so published as printed.",
}


GRAMS = re.compile(r"^(\d+(?:\.\d+)?) ?g(?: ?g)?$")   # a serving printed in grams only ("48 g", "190g g"); "19g oz" is not


def num(x: str) -> float:
    return float(x.lstrip("<"))


def implied_kcal(r: dict) -> float:
    """4 x protein + 4 x carbohydrate + 9 x fat of the printed grams (a '<' value counts as its limit)."""
    return 4 * num(r["protein"]) + 4 * num(r["carbs"]) + 9 * num(r["fat"])


def kj_conflicts(r: dict) -> bool:
    """True when the printed kJ is more than 15% away from the printed kcal x 4.184 (the audit's HIGH threshold, kcal >= 20).
    Then the kJ is not published: the kcal is kept only if its own fat, carbohydrate and protein support it (else `impossible`
    holds the row back, see rule 2 there), so a dish is never lost to a kJ typo alone and a contradicted number is never shown."""
    kcal, kj = num(r["kcal"]), num(r["kj"])
    return kcal >= 20 and not 0.85 <= kj / (kcal * 4.184) <= 1.15


def impossible(r: dict) -> list[str]:
    """Reasons the chain's own row cannot be right (empty list = publish). Nothing is ever corrected.

    A row is held back when (1) its own fat, carbohydrate and protein give more than a third more energy than the kcal it
    prints (and over 10 kcal more), (2) its kcal contradicts its own kJ and is more than a third above what its macros give,
    (3) its macros weigh more than its serving, or (4) it prints more saturates than fat, or more sugars than carbohydrate,
    by over 0.5 g, or (5) its kJ is more than 15% away from its kcal and its own macros are more than 15% away from the kcal
    too (neither figure supports the other). When only the kJ is the odd one out (the kcal agrees with the macros within 15%)
    the dish is kept and its kJ is left unpublished (`kj_conflicts`). Smaller disagreements (the pipeline warns from 15%) are
    published as printed and described in the item's notes."""
    kcal, kj, at = num(r["kcal"]), num(r["kj"]), implied_kcal(r)
    out = []
    if at - kcal > 10 and at > kcal * 4 / 3:
        out.append(f"The page prints {r['kcal']} kcal, but its own fat ({r['fat']} g), carbohydrate ({r['carbs']} g) and protein "
                   f"({r['protein']} g) add up to about {at:.0f} kcal.")
    if kcal >= 10 and kj > 0 and abs(kj / 4.184 - kcal) > 0.3 * kcal and kcal - at > 25 and kcal > at * 4 / 3:
        out.append(f"The page prints {r['kcal']} kcal but {r['kj']} kJ (about {kj / 4.184:.0f} kcal), and its fat, carbohydrate and "
                   f"protein add up to about {at:.0f} kcal.")
    if kj_conflicts(r) and kcal > 0 and abs(at - kcal) / kcal > 0.15 and not out:
        out.append(f"The page prints {r['kcal']} kcal but {r['kj']} kJ (about {kj / 4.184:.0f} kcal), and its fat, carbohydrate and "
                   f"protein add up to about {at:.0f} kcal, so neither figure supports the other.")
    if num(r["sat"]) > num(r["fat"]) + 0.5:
        out.append(f"The page prints {r['sat']} g of saturates but only {r['fat']} g of total fat.")
    if num(r["sugars"]) > num(r["carbs"]) + 0.5:
        out.append(f"The page prints {r['sugars']} g of sugars but only {r['carbs']} g of carbohydrate.")
    grams = re.match(r"^([\d.]+) g$", r["serving"])
    if grams:
        total = sum(num(r[k]) for k in ("fat", "carbs", "protein"))
        if total > float(grams.group(1)) + 1:
            out.append(f"The page prints {total:g} g of fat, carbohydrate and protein in a {r['serving']} serving.")
    return out


def read_rows(raw: Path) -> tuple[list[dict], list[tuple[str, str]], str]:
    """Every published row (one per product and size), the exclusions with reasons, and a digest of all printed tables."""
    index_page = (raw / f"{page.INDEX_ID}.html").read_text(encoding="utf-8")
    listed = {i: n for _, _, items in page.read_index(index_page) for i, n in items}
    expected = {i: n for i, n, _, _ in SPEC} | {i: n for i, (n, _) in EXCLUDED.items()}
    problems = []
    for i in sorted(set(listed) | set(expected), key=int):
        if i not in listed:
            problems.append(f"product {i} ({expected[i]!r}) is no longer in the menu index")
        elif i not in expected:
            problems.append(f"new product {i} ({listed[i]!r}) in the menu index: add it to SPEC or EXCLUDED")
        elif listed[i] != expected[i]:
            problems.append(f"product {i} is now called {listed[i]!r} (script has {expected[i]!r})")
    if problems:
        raise SystemExit("The menu index changed, re-check the script:\n  " + "\n  ".join(problems))

    exclusions, digest = [], []
    for i, (name, reason) in EXCLUDED.items():
        pg = page.read_page((raw / f"{i}.html").read_text(encoding="utf-8"))
        if reason == _BOX:
            if page.printed_numbers(pg["cells"]) is not None:
                raise SystemExit(f"{name!r} now prints nutrition values: it can be published, re-check EXCLUDED.")
        elif ("NI Only" if reason == _NI else "selected stores only") not in name:
            raise SystemExit(f"{name!r} is no longer marked as excluded.")
        digest.append(f"{i}|{pg['cells']}")
        exclusions.append((name, reason))

    rows = []
    for i, name, category, rankable in SPEC:
        if re.search(r"NI Only|selected stores only", name):
            raise SystemExit(f"{name!r} is marked as not for the full GB menu but is listed in SPEC.")
        base_html = (raw / f"{i}.html").read_text(encoding="utf-8")
        sizes = page.read_sizes(base_html)
        if sizes:
            labels = [(label, suffix, here) for label, suffix, here in sizes]
            if ("Medium", "", True) not in labels or [s for s in labels if s[2]] != [("Medium", "", True)] \
                    or not {s[0] for s in labels} <= set(SIZE_SERVING) or any(s[1] != s[0].lower() and s[1] for s in labels):
                raise SystemExit(f"{name!r}: the size switch changed ({labels}), re-check the script.")
        variants = [(label, suffix) for label, suffix, _ in sizes] or [("", "")]
        for label, suffix in variants:
            html_text = base_html if not suffix else (raw / f"{i}_{suffix}.html").read_text(encoding="utf-8")
            pg = page.read_page(html_text)
            if pg["name"] != name:
                raise SystemExit(f"{name!r}: the {label or 'only'} page is titled {pg['name']!r}, re-check the script.")
            printed = page.printed_numbers(pg["cells"])
            if printed is None:
                raise SystemExit(f"{name!r} ({label}) prints no numbers: the page changed, re-check the script.")
            if label and printed["serving"] != SIZE_SERVING[label]:
                raise SystemExit(f"{name!r} ({label}) prints serving {printed['serving_printed']!r}, expected {SIZE_SERVING[label]}.")
            digest.append(f"{i}|{label}|{pg['cells']}")
            veg = bool(re.search(r"vegetarian|vegan", pg["diet"], re.I))
            pork = bool(PORK_NAME.search(name)) and not NOT_PORK.search(name)
            if veg and pork:
                raise SystemExit(f"{name!r} is marked vegetarian by the chain but its name says pork: re-check.")
            rows.append({**printed, "page": i, "label": label, "base_name": name,
                         "allergens_text": pg["allergens"], "allergens_printed": pg["allergens_printed"],
                         "name": f"{name} ({label.lower()})" if label else name,
                         "category": category, "rankable": rankable and not label,
                         "serving_out": f"{label}, {printed['serving']}" if label else printed["serving"],
                         "veg": veg, "pork": pork, "diet": pg["diet"]})
    return rows, exclusions, page.sha256_bytes("\n".join(digest).encode("utf-8"))


def allergens_for(rows: list[dict], matrix: dict[str, list[dict]]) -> tuple[list[str], int]:
    """Fill r['allergens'] from each page's own "Allergens:" line, cross-checked against the PDF's allergen table (see the
    module docstring). Returns the problems (any problem = the chain is not published with allergens) and how many rows had
    a PDF row to check against."""
    problems, checked = [], 0
    for r in rows:
        where = f"{r['name']} (page {r['page']}{'/' + r['label'] if r['label'] else ''})"
        pdf = matrix.get(tim_hortons_pdf.norm_name(r["base_name"]), [])
        pdf_sets = [allergen_words(sorted(p["yes"]), f"PDF {p['name']}") for p in pdf]
        if not pdf:
            # The PDF row is the only place the chain prints "Maybe" (= may contain), so a row without one is not complete.
            problems.append(f"{where}: the PDF has no row of that name, so its 'Maybe' (may contain) marks are unknown")
            continue
        if r["allergens_printed"]:
            words = [w for w in r["allergens_text"].split(",") if w.strip()]
            if not words:
                problems.append(f"{where}: prints an empty 'Allergens:' line")
                continue
            keys, cereals, nuts = allergen_words(words, where)
            checked += 1
            if (keys, cereals, nuts) not in pdf_sets:
                problems.append(f"{where}: page prints '{r['allergens_text']}', the PDF's '{pdf[0]['name']}' row says Yes to "
                                f"{sorted(pdf[0]['yes'])}")
                continue
        else:
            checked += 1
            if any(k for k, _, _ in pdf_sets):
                problems.append(f"{where}: page prints no 'Allergens:' line but the PDF's '{pdf[0]['name']}' row says Yes to "
                                f"{sorted(pdf[0]['yes'])}")
                continue
            keys, cereals, nuts = set(), set(), set()
        # "Maybe" in the PDF's allergen table = may contain. Taken from the PDF row(s) whose Yes cells equal the page's own line
        # (the PDF has one row per product, no sizes); if two such rows differ, both are kept (the wider warning).
        may: set[str] = set()
        for p, sets in zip(pdf, pdf_sets):
            if sets == (keys, cereals, nuts):
                may |= allergen_words(sorted(p["maybe"]), f"PDF {p['name']} (Maybe)")[0]
        r["allergens"] = {"contains": keys, "may_contain": may, "cereals": cereals, "nuts": nuts}   # common.write_allergens drops what is also in contains
    return problems, checked


def notes_for(rows: list[dict]) -> None:
    """Fill r['notes']: everything odd about a printed row, in words (not exported to the app)."""
    same: dict[tuple, list[dict]] = {}
    for r in rows:
        same.setdefault(tuple(r[k] for k in ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt", "serving")), []).append(r)
    for r in rows:
        n = []
        if r["serving_printed"].replace(" ", "") != r["serving"].replace(" ", ""):
            n.append(f"The page prints the serving size as '{r['serving_printed']}' (stray unit); read as {r['serving']}.")
        kcal, kj = num(r["kcal"]), num(r["kj"])
        if kcal >= 10 and not 3.9 <= kj / kcal <= 4.4:
            if kj_conflicts(r):
                n.append(f"Printed kJ ({r['kj']}) and kcal ({r['kcal']}) do not agree (kJ is about {kj / 4.184:.0f} kcal); the kJ is not "
                         "published and the kcal is kept because its own fat, carbohydrate and protein support it.")
            else:
                n.append(f"Printed kJ ({r['kj']}) and kcal ({r['kcal']}) differ by more than 7%; both are published as printed.")
        at = implied_kcal(r)
        if (kcal >= 50 and abs(at - kcal) / kcal > 0.15) or (kcal < 50 and at - kcal > 25):
            n.append(f"Fat, carbohydrate and protein imply about {at:.0f} kcal against {r['kcal']} printed.")
        if num(r["sat"]) > num(r["fat"]):
            n.append(f"Saturates ({r['sat']} g) printed higher than total fat ({r['fat']} g).")
        twins = [t["name"] for t in same[tuple(r[k] for k in ("kj", "kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt", "serving"))]
                 if t is not r and r["page"] != t["page"] and kcal >= 10]
        if twins:
            n.append("Prints exactly the same numbers as " + ", ".join(twins) + ".")
        if (r["page"], r["label"]) in MANUAL_NOTES:
            n.append(MANUAL_NOTES[(r["page"], r["label"])])
        r["notes"] = " ".join(n)


def fetch_all(raw: Path, refresh: bool) -> None:
    """Download the index page, every product page and every size page, one request per second, skipping saved files."""
    raw.mkdir(parents=True, exist_ok=True)

    def get(path: str, name: str) -> None:
        if refresh or not (raw / name).exists():
            print(f"  fetching {page.BASE}{path}", file=sys.stderr)
            page.fetch(path, raw / name)

    get(page.INDEX_ID, f"{page.INDEX_ID}.html")
    index_page = (raw / f"{page.INDEX_ID}.html").read_text(encoding="utf-8")
    for _, _, items in page.read_index(index_page):
        for i, _ in items:
            get(i, f"{i}.html")
            if i in {s[0] for s in SPEC}:
                for _, suffix, _ in page.read_sizes((raw / f"{i}.html").read_text(encoding="utf-8")):
                    if suffix:
                        get(f"{i}/{suffix}", f"{i}_{suffix}.html")


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--fetch", type=Path, metavar="DIR", help="download the pages once into DIR (skips saved ones), then extract")
    g.add_argument("--raw", type=Path, metavar="DIR", help="extract from pages already saved in DIR")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you downloaded the pages")
    ap.add_argument("--refresh", action="store_true", help="with --fetch: download again even if a page is already saved")
    ap.add_argument("--pdf", type=Path, required=True,
                    help="the chain's Nutrition PDF (linked from timhortons.co.uk/menu, saved under its own file name): "
                         "allergen cross-check, and every number is compared with it")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    raw = args.fetch or args.raw
    if args.fetch:
        fetch_all(raw, args.refresh)

    rows, exclusions, digest = read_rows(raw)
    version, matrix = tim_hortons_pdf.read_allergens(args.pdf)
    allergen_problems, allergen_checked = allergens_for(rows, matrix)
    notes_for(rows)
    rows.sort(key=lambda r: CATEGORY_ORDER.index(r["category"]))  # stable: keeps the menu's order inside a category

    items, holdback = [], []
    for r in rows:
        tags = []
        if r["veg"]:
            tags.append("vegetarian")
        if r["pork"]:
            tags.append("contains_pork")
        item = {"name": r["name"], "category": r["category"], "serving": r["serving_out"], "calories": r["kcal"],
                "protein_g": r["protein"], "carbs_g": r["carbs"], "fat_g": r["fat"], "sat_fat_g": r["sat"], "sodium_mg": "",
                "salt_g": r["salt"], "sugar_g": r["sugars"], "fiber_g": r["fibre"], "tags": "|".join(tags),
                "limited_time": False, "rankable": r["rankable"], "notes": r["notes"], "energy_kj": "" if kj_conflicts(r) else r["kj"],
                "weight_g": grams.group(1) if (grams := GRAMS.match(r["serving_printed"])) else "",
                "allergens": None if allergen_problems else r["allergens"]}
        items.append(item)
        reasons = impossible(r)
        if reasons:
            holdback.append((r, " ".join(reasons)))
    ids_out = {}
    # write_chain_folder makes the ids from the names; compute the same ids for the hold-back list.
    seen: dict[str, int] = {}
    for it in items:
        base = slug(it["name"])
        seen[base] = seen.get(base, 0) + 1
        ids_out[it["name"]] = base if seen[base] == 1 else f"{base}-{seen[base]}"
    held = sorted((ids_out[r["name"]], reason) for r, reason in holdback)
    if {i for i, _ in held} != EXPECTED_HELDBACK:
        new = {i for i, _ in held} - EXPECTED_HELDBACK
        gone = EXPECTED_HELDBACK - {i for i, _ in held}
        for i, reason in held:
            print(f"  hold back {i}: {reason}", file=sys.stderr)
        raise SystemExit(f"The set of held-back items changed (new: {sorted(new)}, no longer: {sorted(gone)}). "
                         "Re-check those rows against the pages, then update EXPECTED_HELDBACK.")
    if len({v for v in ids_out.values()}) != len(items):
        raise SystemExit("duplicate item ids")

    if allergen_problems:   # all or nothing: link to the PDF only
        guide = {"title": f"Tim Hortons UK Nutrition PDF with Allergen Information (UK & Ireland), {version}",
                 "url": PDF_BASE + args.pdf.name, "checked_on": args.checked_on, "may_contain_published": True}
    else:
        guide = {"title": ("Tim Hortons UK website: allergens printed on each product and size page (timhortons.co.uk/information "
                           f"pages, retrieved {args.checked_on}), cross-checked against the Nutrition PDF's allergen table, {version}; "
                           "'may contain' = the PDF's 'Maybe' cells"),
                 "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Tim Hortons", cuisine="Coffee", source_title=SOURCE_TITLE.format(checked_on=args.checked_on),
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["tim hortons", "tims", "timmies"], items=items,
        note=NOTE, holdback=held, out=args.out, allergen_guide=guide)

    published = len(items) - len(held)
    by_cat = {c: sum(1 for r in rows if r["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} rows to {out}: {published} published, {len(held)} held back, {len(exclusions)} products excluded")
    print("by category (incl. held back): " + ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    print(f"printed tables sha256 {digest}")
    pages = [raw / f"{page.INDEX_ID}.html"] + sorted(p for p in raw.glob("*.html") if p.name != f"{page.INDEX_ID}.html")
    print(f"saved pages sha256 {page.sha256_bytes(*(p.read_bytes() for p in pages))} ({len(pages)} files)")
    print("meat type not stated: " + ", ".join(sorted({r['base_name'] for r in rows
          if (MEAT_NOT_STATED.search(r['base_name']) or r['page'] in MEAT_NOT_STATED_IDS) and not r['veg']})))
    tim_hortons_pdf.compare(args.pdf, rows)
    print(f"Allergens: {allergen_checked} of {len(rows)} rows had a PDF allergen row of the same name to check against; "
          f"pages with no 'Allergens:' line: {sum(not r['allergens_printed'] for r in rows)}")
    print("  no PDF row of the same name (page line used as printed): "
          + ", ".join(sorted({r['base_name'] for r in rows if r['allergens_printed']
                              and tim_hortons_pdf.norm_name(r['base_name']) not in matrix})))
    if allergen_problems:
        print(f"  NOT PUBLISHED (allergen_guide.csv only): {len(allergen_problems)} problem(s):")
        for line in allergen_problems:
            print("   ", line)
    else:
        print(f"  allergens.csv written for all {len(items)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
