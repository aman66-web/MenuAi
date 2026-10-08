#!/usr/bin/env python3
"""Build data/source/real-greek/ from The Real Greek's official "Macronutrient Allergen Menu" (a FULL-nutrition chain).

    python3 tools/uk_extract/real_greek.py path/to/TRG-Allergen-Menu-Spring-26.pdf --checked-on 2026-10-08 [--out DIR]

Source (one PDF, 4 pages, InDesign, text layer; robots.txt of therealgreek.com is `User-agent: * / Disallow:` = everything allowed):
    https://www.therealgreek.com/wp-content/uploads/2026/03/TRG-Allergen-Menu-Spring-26.pdf (the real file name has en dashes)
    page 1 is dated "30 SEPTEMBER 2026"; the PDF was created 2026-10-05 and served Last-Modified 2026-10-05.
Needs `pdftotext` (poppler). Page 1 is read by position (real_greek_pdf.py): one table with kcal, protein, fat, saturates, carbs,
sugars, fibre and salt per dish as served, and an ALLERGENS column of letter codes (key printed on the page). Numbers and allergen
codes are copied exactly as printed; only the display names, categories, rankable flags and the exclusions below are written by hand
in ITEMS. The script stops if the printed rows differ from ITEMS (a new, renamed or removed dish, another number of rows) or if an
allergen code is not in the page's own key, so a human re-checks the table when the chain publishes a new menu.

What is and is not published (all of it written to the check report and the chain's note):
- Pages 2-4 (lunch, ice cream/coffee/tea, kids) print calories only, so they cannot be rows of a full-nutrition chain: not read.
- 7 rows on page 1 print allergens but no numbers (Spartan Breakfast, Athenian Breakfast, Yoghurt and Berries, Feta Scrambled Eggs,
  Prawn Saganaki, Grilled Sardines, Dakos Salad): left out. "Pork Gyros 160g (delivery only)" is left out too (a delivery-only
  portion, as Nando's delivery-only rows were).
- Held back (holdback.csv, never corrected): rows whose printed kcal cannot come from their own protein, carbs and fat (printed kcal
  more than 30% above or more than 25% below 4P+4C+9F, found by this script); rows whose figure the chain's own lunch page (page 2)
  prints differently by more than 10% for the same dish (Tzatziki, Rice, Grilled Aubergine, the Chicken Gyros wrap with tzatziki, the
  Pork Gyros wrap; the Tzatziki 50 g row is exactly 5/7 of the Tzatziki row so it goes with it); the four "Dip Trio" rows, which print
  exactly the numbers of the single dip although a trio is served with flat bread, so their serving is unclear; the three "(50 g)"
  dip rows whose printed protein + carbs + fat weigh more than the 50 g they claim to be (Houmous 57.9 g, Taramasalata 67.9 g,
  Whipped Spicy Feta 55.7 g; found by this script, independent re-check 2026-10-08: every "50G" row's protein, carbs and fat are exactly 5/7 of the dip's
  own row above it, so the chain scaled the wrong base and the figures are not per 50 g).
- "Warm Greek Flatbread" (506 kcal) is 533 kcal as "Greek Flatbread" on the lunch page (5% apart): published, noted in `notes`.

Allergens (docs/DATA.md "Allergens") are complete: every published row carries its own letter codes in the same table. Codes are
the page's key (D dairy, S sesame, CR crustaceans, SD sulphur dioxide, MU mustard, G gluten, F fish, P peanuts, N nuts, E egg,
M molluscs, L lupin, C celery, SO soy, V vegetarian, VG vegan); the brackets after a code name the cereal / nut / species and are
copied (G (WHEAT) -> wheat; N (WALNUTS ALMONDS) -> walnut, almond). "GF" is printed on two rows (Fava, Kokkinisto with Mash) but is not
in the page's key: it is not an allergen code, it adds nothing, and the run reports it. The Baked Cheesecake row also prints "MIGHT
CONTAIN OTHER NUTS AND SOYBEANS": soya goes to may contain; "other nuts" is not representable next to "contains nuts (almond)" and
is said in the chain note. Dishes marked * (fryer) "may come into contact with other ingredients and allergens which are not listed":
traces information is published, so may_contain_published = yes, but no per-dish list is given for them.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import real_greek_pdf as pdf_reader  # noqa: E402
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "real-greek"
SOURCE_URL = "https://www.therealgreek.com/wp-content/uploads/2026/03/TRG%E2%80%93Allergen%E2%80%93Menu-Spring%E2%80%9326.pdf"
SOURCE_TITLE = ("The Real Greek Macronutrient Allergen Menu, 30 September 2026 (page 1 of TRG-Allergen-Menu-Spring-26.pdf, "
                "PDF created 5 October 2026)")
ALLERGEN_GUIDE_TITLE = ("The Real Greek Macronutrient Allergen Menu, 30 September 2026 (allergen letter codes beside each dish; "
                        "same PDF as the nutrition table)")
ALIASES = ["the real greek", "real greek", "therealgreek", "real greek restaurant"]
MAY_CONTAIN_PUBLISHED = True
EXPECTED_ROWS = 77

FD, SMALL, SKEWERS, MAINS, WRAPS, PLATTERS, SIDES, SALADS, DESSERTS, ICE = (
    "Flatbread and dips", "Small plates", "Skewers", "Mains", "Wraps", "Platters", "Sides", "Salads", "Desserts", "Ice cream and sorbet")
CATEGORY_ORDER = [FD, SMALL, SKEWERS, MAINS, WRAPS, PLATTERS, SIDES, SALADS, DESSERTS, ICE]

# printed name -> (display name, category, rankable, serving, weight_g). Whole meals (mains, wraps, a large salad) are rankable;
# dips, sides, small plates, single skewers (the lunch menu serves them as the choice on a grill plate), desserts and ice cream are not.
ITEMS = {
    "GLUTEN FREE GREEK FLATBREAD": ("Gluten-Free Greek Flatbread", FD, False, "", ""),
    "WARM GREEK FLATBREAD": ("Warm Greek Flatbread", FD, False, "", ""),
    "TZATZIKI": ("Tzatziki", FD, False, "", ""),
    "TZATZIKI 50G": ("Tzatziki (50 g)", FD, False, "50 g", "50"),
    "TZATZIKI DIP TRIO (SERVED WITH FLAT BREAD)": ("Tzatziki Dip Trio (served with flat bread)", FD, False, "", ""),
    "WHIPPED SPICY FETA": ("Whipped Spicy Feta", FD, False, "", ""),
    "WHIPPED SPICY FETA 50G": ("Whipped Spicy Feta (50 g)", FD, False, "50 g", "50"),
    "WHIPPED SPICY FETA DIP TRIO (SERVED WITH FLAT BREAD)": ("Whipped Spicy Feta Dip Trio (served with flat bread)", FD, False, "", ""),
    "TARAMASALATA": ("Taramasalata", FD, False, "", ""),
    "TARAMASALATA 50G": ("Taramasalata (50 g)", FD, False, "50 g", "50"),
    "TARAMASALATA DIP TRIO (SERVED WITH FB)": ("Taramasalata Dip Trio (served with FB)", FD, False, "", ""),
    "HOUMOUS": ("Houmous", FD, False, "", ""),
    "HOUMOUS 50G": ("Houmous (50 g)", FD, False, "50 g", "50"),
    "HOUMOUS DIP TRIO (SERVED WITH FLAT BREAD)": ("Houmous Dip Trio (served with flat bread)", FD, False, "", ""),
    "FAVA": ("Fava", FD, False, "", ""),
    "OLIVES": ("Olives", SMALL, False, "", ""),
    "HALLOUMI POPCORN*": ("Halloumi Popcorn", SMALL, False, "", ""),
    "CHICKEN SKEWER": ("Chicken Skewer", SKEWERS, False, "", ""),
    "LOUKANICO SKEWER": ("Loukanico Skewer", SKEWERS, False, "", ""),
    "LAMB SKEWER": ("Lamb Skewer", SKEWERS, False, "", ""),
    "KING PRAWNS SKEWER": ("King Prawns Skewer", SKEWERS, False, "", ""),
    "HALLOUMI SKEWER": ("Halloumi Skewer", SKEWERS, False, "", ""),
    "OCTOPUS SKEWER": ("Octopus Skewer", SKEWERS, False, "", ""),
    "PORK SKEWER": ("Pork Skewer", SKEWERS, False, "", ""),
    "GRILLED SEA BREAM": ("Grilled Sea Bream", MAINS, True, "", ""),
    "GRILLED AUBERGINE": ("Grilled Aubergine", SMALL, False, "", ""),
    "GRILLED AUBERGINE VEGAN": ("Grilled Aubergine (Vegan)", SMALL, False, "", ""),
    "FRIED KALAMARI*": ("Fried Kalamari", SMALL, False, "", ""),
    "LAMB MEATBALLS": ("Lamb Meatballs", MAINS, False, "", ""),
    "SPETSOFAI": ("Spetsofai", MAINS, True, "", ""),
    "COURGETTE FRITTER*": ("Courgette Fritter", SMALL, False, "", ""),
    "DOLMADES": ("Dolmades", SMALL, False, "", ""),
    "SPINACH PIE*": ("Spinach Pie", SMALL, False, "", ""),
    "PASTITSIO (500G)": ("Pastitsio (500 g)", MAINS, True, "500 g", "500"),
    "PASTITSIO (KIDS)": ("Pastitsio (Kids)", MAINS, False, "", ""),
    "KOKKINISTO WITH MASH": ("Kokkinisto with Mash", MAINS, True, "", ""),
    "MOUSSAKA*": ("Moussaka", MAINS, True, "", ""),
    "VEGETABLE MOUSSAKA*": ("Vegetable Moussaka", MAINS, True, "", ""),
    "CHICKEN GYROS WRAP (TZATZIKI)*": ("Chicken Gyros Wrap (Tzatziki)", WRAPS, True, "", ""),
    "CHICKEN GYROS WRAP (MUSTARD)*": ("Chicken Gyros Wrap (Mustard)", WRAPS, True, "", ""),
    "HALLOUMI WRAP*": ("Halloumi Wrap", WRAPS, True, "", ""),
    "LOUKANICO WRAP*": ("Loukanico Wrap", WRAPS, True, "", ""),
    "COURGETTE FRITTER WRAP*": ("Courgette Fritter Wrap", WRAPS, True, "", ""),
    "PORK GYROS WRAP*": ("Pork Gyros Wrap", WRAPS, True, "", ""),
    "MEAT PLATTER*": ("Meat Platter", PLATTERS, False, "", ""),
    "FISH PLATTER*": ("Fish Platter", PLATTERS, False, "", ""),
    "VEG PLATTER*": ("Veg Platter", PLATTERS, False, "", ""),
    "HALLOUMI FRIES*": ("Halloumi Fries", SIDES, False, "", ""),
    "CHIPS SMALL*": ("Chips (Small)", SIDES, False, "", ""),
    "CHIPS LARGE*": ("Chips (Large)", SIDES, False, "", ""),
    "RICE": ("Rice", SIDES, False, "", ""),
    "POTATO SALAD": ("Potato Salad", SIDES, False, "", ""),
    "CHICKPEA SALAD": ("Chickpea Salad", SIDES, False, "", ""),
    "GREEK SALAD SMALL": ("Greek Salad (Small)", SALADS, False, "", ""),
    "GREEK SALAD LARGE": ("Greek Salad (Large)", SALADS, True, "", ""),
    "VEGAN GREEK SALAD SMALL": ("Vegan Greek Salad (Small)", SALADS, False, "", ""),
    "VEGAN GREEK SALAD LARGE": ("Vegan Greek Salad (Large)", SALADS, True, "", ""),
    "GREEN LEAF SALAD": ("Green Leaf Salad", SALADS, False, "", ""),
    "BAKLAVA": ("Baklava", DESSERTS, False, "", ""),
    "GREEK FILO CUSTARD PIE*": ("Greek Filo Custard Pie", DESSERTS, False, "", ""),
    "BAKED CHEESECAKE": ("Baked Cheesecake", DESSERTS, False, "", ""),
    "GREEK ORANGE CAKE": ("Greek Orange Cake", DESSERTS, False, "", ""),
    "YOGHURT HONEY": ("Yoghurt and Honey", DESSERTS, False, "", ""),
    "CHOCOLATE BROWNIE": ("Chocolate Brownie", DESSERTS, False, "", ""),
    "RASPBERRY SORBET": ("Raspberry Sorbet", ICE, False, "", ""),
    "VANILLA": ("Vanilla Ice Cream", ICE, False, "", ""),
    "VEGAN VANILLA": ("Vegan Vanilla Ice Cream", ICE, False, "", ""),
    "CHOCOLATE": ("Chocolate Ice Cream", ICE, False, "", ""),
    "PISTACHIO": ("Pistachio Ice Cream", ICE, False, "", ""),
}
# Rows printed with allergens but no numbers (left out) and the delivery-only portion (left out).
NO_NUMBERS = ["SPARTAN BREAKFAST", "ATHENIAN BREAKFAST", "YOGHURT AND BERRIES", "FETA SCRAMBLED EGGS", "PRAWN SAGANAKI", "GRILLED SARDINES",
              "DAKOS SALAD"]
DELIVERY_ONLY = ["PORK GYROS 160G (DELIVERY ONLY)"]
# Printed kcal vs 4P+4C+9F: more than 30% above or more than 25% below it cannot come from the row's own macros. The set found on
# this guide (the script stops if a new guide gives another set, so a human looks again).
ENERGY_HIGH, ENERGY_LOW = 1.30, 0.75
EXPECTED_ENERGY_HELD = {"HALLOUMI POPCORN*", "KING PRAWNS SKEWER", "GRILLED AUBERGINE VEGAN", "FRIED KALAMARI*", "SPINACH PIE*", "MEAT PLATTER*",
                        "FISH PLATTER*", "VEG PLATTER*", "HALLOUMI FRIES*", "VEGAN GREEK SALAD SMALL", "VEGAN GREEK SALAD LARGE", "BAKLAVA",
                        "RASPBERRY SORBET"}
# A row that states its weight must not print protein + carbs + fat above it. The set found on this guide (the script stops if a new guide
# gives another set, so a human looks again). Tzatziki 50 g (27.9 g) passes this test and is held back by the lunch-page conflict below.
EXPECTED_WEIGHT_HELD = {"HOUMOUS 50G", "TARAMASALATA 50G", "WHIPPED SPICY FETA 50G"}
# Same dish, different figure on the chain's own lunch page (page 2): printed text that must be on page 2, and how far apart.
LUNCH_CONFLICTS = {
    "TZATZIKI": ("TZATZIKI D SD V 71kcal", "Tzatziki prints 311 kcal here and 71 kcal on the chain's own lunch page (page 2)"),
    "TZATZIKI 50G": ("TZATZIKI D SD V 71kcal", "Printed 222 kcal, exactly 5/7 of the Tzatziki row (311 kcal), which the chain's own lunch page (page 2) prints as 71 kcal"),
    "RICE": ("RICE C V VG 333kcal", "Rice prints 501.8 kcal here and 333 kcal on the chain's own lunch page (page 2)"),
    "GRILLED AUBERGINE": ("GRILLED AUBERGINE D (MILK) V 270kcal", "Grilled Aubergine prints 473 kcal here and 270 kcal on the chain's own lunch page (page 2)"),
    "CHICKEN GYROS WRAP (TZATZIKI)*": ("CHICKEN GYROS WITH TZATZIKI* G (WHEAT) D S MU SO SD 1123kcal", "Chicken Gyros wrap with tzatziki prints 675 kcal here and 1123 kcal on the chain's own lunch page (page 2)"),
    "PORK GYROS WRAP*": ("PORK GYROS* G (WHEAT) D C MU SO S SD 838kcal", "Pork Gyros wrap prints 986 kcal here and 838 kcal on the chain's own lunch page (page 2)"),
}
# Noted only (5% apart, under the 10% line): the printed phrase must be on page 2.
LUNCH_NOTED = {"WARM GREEK FLATBREAD": ("GREEK FLATBREAD G (WHEAT) S V VG 533kcal", "the lunch page (page 2) prints 533 kcal for 'Greek Flatbread'")}
TRIOS = ["TZATZIKI DIP TRIO (SERVED WITH FLAT BREAD)", "WHIPPED SPICY FETA DIP TRIO (SERVED WITH FLAT BREAD)",
         "TARAMASALATA DIP TRIO (SERVED WITH FB)", "HOUMOUS DIP TRIO (SERVED WITH FLAT BREAD)"]
TRIO_REASON = ("Prints exactly the numbers of the single dip, although a dip trio is served with flat bread: the serving is unclear "
               "(whether the values are one dip of the trio or the whole trio)")
# The meat is not stated on the chain's page 1 for these dishes (so no pork/beef tag): listed in the report.
MEAT_NOT_STATED = ["SPETSOFAI", "KOKKINISTO WITH MASH", "MOUSSAKA*", "PASTITSIO (500G)", "PASTITSIO (KIDS)"]
PORK = re.compile(r"\b(PORK|LOUKANICO)\b")  # the chain's own lunch and kids pages call it "LOUKANICO PORK SAUSAGE"
BEEF = re.compile(r"\b(BEEF|STEAK)\b")

CODES = {"D": "milk", "S": "sesame", "CR": "crustaceans", "SD": "sulphites", "MU": "mustard", "G": "gluten", "F": "fish", "P": "peanuts",
         "N": "nuts", "E": "eggs", "M": "molluscs", "L": "lupin", "C": "celery", "SO": "soya"}
MARKS = {"V", "VG"}
UNEXPLAINED_MARKS = {"GF"}  # printed on two rows, not in the page's key: not an allergen, reported
QUALIFIERS = {"D": {"MILK"}, "F": {"COD"}, "CR": {"CRUSTACEANS", "PRAWNS"}, "M": {"OCTOPUS", "KALAMARI"}, "P": {"PEANUTS"}}
TOKEN = r"[A-Z]{1,2}(?:\s*\([^)]*\))?"
TOKENS_RE = re.compile(rf"^{TOKEN}(?:\s+{TOKEN})*$")
ONE_TOKEN = re.compile(r"([A-Z]{1,2})(?:\s*\(([^)]*)\))?")


def parse_allergens(text: str, where: str) -> dict:
    """The printed allergen codes of one row -> {contains, may_contain, cereals, nuts (sets), marks (set), unexplained (set)}."""
    may_text = ""
    if " MIGHT CONTAIN " in text:
        text, may_text = text.split(" MIGHT CONTAIN ", 1)
    if not TOKENS_RE.match(text):
        raise SystemExit(f"{where}: the allergen text {text!r} is not a list of letter codes with optional brackets")
    contains, cereals, nuts, marks, unexplained = set(), set(), set(), set(), set()
    for code, inside in ONE_TOKEN.findall(text):
        if code in MARKS:
            marks.add(code)
            continue
        if code in UNEXPLAINED_MARKS:
            unexplained.add(code)
            continue
        if code not in CODES:
            raise SystemExit(f"{where}: allergen code {code!r} is not in the page's key: do not guess, report it")
        words = [w for w in re.split(r"[\s&,]+", re.sub(r"\d+(?:\.\d+)?%|\bPOWDER\b", " ", inside)) if w]
        if code in ("G", "N"):
            keys, c, n = allergen_words([CODES[code]] if not words else words, where)
            if keys != {CODES[code]}:
                raise SystemExit(f"{where}: brackets after {code} name {words}, which are not all {CODES[code]}")
            cereals |= c
            nuts |= n
            contains.add(CODES[code])
        else:
            if set(words) - QUALIFIERS.get(code, set()):
                raise SystemExit(f"{where}: unexpected words {words} in brackets after {code}")
            contains.add(allergen_words([CODES[code]], where)[0].pop())
    may = set()
    if may_text:
        m = re.match(r"^OTHER (.+)$", may_text)
        if not m:
            raise SystemExit(f"{where}: unexpected 'might contain' text {may_text!r}")
        keys, _, _ = allergen_words(m.group(1).split(" AND "), where)
        may |= keys
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts, "marks": marks, "unexplained": unexplained}


def fnum(s: str) -> float:
    return float(s)


def build(pdf: Path) -> tuple:
    rows = pdf_reader.read_rows(pdf)
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"Page 1 has {len(rows)} rows, this script expects {EXPECTED_ROWS}: the menu changed, re-check ITEMS first.")
    printed = [r["name"] for r in rows]
    if len(set(printed)) != len(printed):
        raise SystemExit("A printed name appears twice on page 1: check the layout")
    silent = [r["name"] for r in rows if not r["cells"]["calories"]]
    if silent != NO_NUMBERS:
        raise SystemExit(f"Rows without numbers changed: now {silent}, expected {NO_NUMBERS}")
    expected = set(ITEMS) | set(NO_NUMBERS) | set(DELIVERY_ONLY)
    new, gone = sorted(set(printed) - expected), sorted(expected - set(printed))
    if new or gone:
        raise SystemExit(f"The menu changed. Printed but not in ITEMS: {new}. In ITEMS but no longer printed: {gone}. Update ITEMS after reading the new menu.")
    page2 = " ".join(subprocess.run(["pdftotext", "-raw", "-f", "2", "-l", "2", str(pdf), "-"], check=True, capture_output=True, text=True).stdout.split())
    for printed_name, (phrase, _) in list(LUNCH_CONFLICTS.items()) + list(LUNCH_NOTED.items()):
        if phrase not in page2:
            raise SystemExit(f"Page 2 no longer prints {phrase!r} (needed for {printed_name}): re-read the lunch page")
    items, holdback, report, unexplained_seen = [], [], [], []
    energy_held, weight_held = set(), set()
    for r in rows:
        name = r["name"]
        if name in NO_NUMBERS or name in DELIVERY_ONLY:
            continue
        display, category, rankable, serving, weight = ITEMS[name]
        c = r["cells"]
        for k, v in c.items():
            if v == "":
                raise SystemExit(f"{name}: no value printed in {k}")
        a = parse_allergens(r["allergens"], name)
        unexplained_seen += [f"{name}: {m}" for m in sorted(a["unexplained"])]
        tags = ["vegetarian"] if a["marks"] else []
        if PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        kcal = fnum(c["calories"])
        implied = 4 * fnum(c["protein_g"]) + 4 * fnum(c["carbs_g"]) + 9 * fnum(c["fat_g"])
        ratio = kcal / implied if implied else 0.0
        notes = [f"printed '{name}'"]
        if name.endswith("*"):
            notes.append("fryer dish (*): may come into contact with other allergens not listed")
        if name in LUNCH_NOTED:
            notes.append(LUNCH_NOTED[name][1])
        if name in ITEMS and name in MEAT_NOT_STATED:
            report.append(f"meat type not stated: {display}")
        item_id = slug(display)
        reason = None
        if ratio > ENERGY_HIGH or ratio < ENERGY_LOW:
            energy_held.add(name)
            reason = (f"Printed {c['calories']} kcal but its own protein ({c['protein_g']} g), carbs ({c['carbs_g']} g) and fat ({c['fat_g']} g) "
                      f"add up to about {implied:.0f} kcal: the energy and the macros cannot both be right")
        if weight:
            heavy = fnum(c["protein_g"]) + fnum(c["carbs_g"]) + fnum(c["fat_g"])
            if heavy > fnum(weight):
                weight_held.add(name)
                reason = (reason + "; " if reason else "") + (
                    f"Printed protein ({c['protein_g']} g), carbs ({c['carbs_g']} g) and fat ({c['fat_g']} g) add up to {heavy:.1f} g, more than "
                    f"the {weight} g serving it claims, so the figures cannot be per {weight} g (its protein, carbs and fat are exactly 5/7 of the dip's own row above it)")
        if name in LUNCH_CONFLICTS:
            reason = (reason + "; " if reason else "") + LUNCH_CONFLICTS[name][1] + ": neither can be chosen"
        if name in TRIOS:
            reason = TRIO_REASON
        if reason:
            holdback.append((item_id, reason))
            notes.append("held back: " + reason)
        items.append({"id": item_id, "name": display, "category": category, "serving": serving, "calories": c["calories"],
                      "protein_g": c["protein_g"], "carbs_g": c["carbs_g"], "fat_g": c["fat_g"], "sat_fat_g": c["sat_fat_g"],
                      "sugar_g": c["sugar_g"], "fiber_g": c["fiber_g"], "salt_g": c["salt_g"], "weight_g": weight,
                      "tags": "|".join(tags), "rankable": rankable, "notes": "; ".join(notes), "allergens": a})
    if energy_held != EXPECTED_ENERGY_HELD:
        raise SystemExit(f"Rows whose kcal contradict their macros changed: now {sorted(energy_held)}, expected {sorted(EXPECTED_ENERGY_HELD)}. "
                         "Re-read the table and update EXPECTED_ENERGY_HELD.")
    if weight_held != EXPECTED_WEIGHT_HELD:
        raise SystemExit(f"Rows whose macros outweigh their stated serving changed: now {sorted(weight_held)}, expected {sorted(EXPECTED_WEIGHT_HELD)}. "
                         "Re-read the table and update EXPECTED_WEIGHT_HELD.")
    report.insert(0, "left out, no numbers printed: " + ", ".join(NO_NUMBERS))
    report.insert(1, "left out, delivery only: " + ", ".join(DELIVERY_ONLY))
    report += [f"unexplained mark (not in the page's key, not an allergen): {u}" for u in unexplained_seen]
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="TRG-Allergen-Menu-Spring-26.pdf (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded and read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    items, holdback, report = build(args.pdf)
    note = ("Per dish as served, from the chain's own 30 September 2026 Macronutrient Allergen Menu (page 1). Its lunch, ice cream, "
            "coffee, tea and kids pages print calories only, so those dishes are not listed. Dishes marked * are fried and may touch "
            "other allergens. Baked Cheesecake: almond; may also contain other nuts and soya.")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="The Real Greek", cuisine="Greek", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=note, holdback=holdback,
                             allergen_guide=guide)
    print("\n".join(report))
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items ({len(items) - len(holdback)} published, {len(holdback)} held back) to {out}: " +
          ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
