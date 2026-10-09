#!/usr/bin/env python3
"""Build data/source/daisy-green/ from Daisy Green's four official calorie PDFs (a CALORIES-ONLY chain).

    python3 tools/uk_extract/daisy_green.py DIR --checked-on 2026-10-09 [--out DIR2]

DIR holds the four PDFs under the names the chain's own page gives them (one download each, 2026-10-09):
    Brunch-cj8d.pdf  LD-gy3n.pdf  DRINKS.pdf  COUNTER.pdf
Source: https://www.daisygreenfood.com/allergen-information ("ALLERGEN AND CALORIE INFO", CALORIES section, four buttons BRUNCH / LUNCH AND
DINNER / DRINKS / COUNTER) -> https://www.daisygreenfood.com/s/<name>.pdf (HTTP 302) -> static1.squarespace.com/static/5efca20cfe631d16cf605e66/...
    Brunch  (t/69de0f034423391ab9a10eab/1776160515425/Brunch.pdf)   created 2026-04-14, 1 page,  26,290 bytes
            SHA-256 44021e73e8a4914cbd359179cf33c719b56d689b32d9fd965b45a9ebc36018f3
    L&D     (t/69de0f1359479a76de7cae89/1776160531694/L%26D.pdf)    created 2026-04-14, 4 pages, 35,446 bytes
            SHA-256 1347eadf066d11367d5a1b95099335d58ad3019db5a404dfd308aaa7f8d2d6f5
    Drinks  (t/691dc8deb3c6796f06e6a1e8/1763559646795/DRINKS.pdf)   created 2025-11-17, 2 pages, 31,021 bytes
            SHA-256 869c15820b9a026d96340793dc4f4a72eb5255d350241797726bb0178c27df18
    Counter (t/691dc8ec4fed8060215617d7/1763559660189/COUNTER.pdf)  created 2025-11-17, 2 pages, 33,594 bytes
            SHA-256 19da2aa19a1bd5a0c0148292e44c0083ed8922392032c413195a8a2ce4b9f14d
robots.txt of www.daisygreenfood.com (Squarespace): only /config, /search, /account, /api/ (except ui-extensions) and /static/ plus some
query strings are disallowed, so /s/ is allowed; static1.squarespace.com serves no robots.txt (404). Needs `pdftotext` (poppler).
Each PDF is one clean text-layer table ("Microsoft: Print To PDF" of a spreadsheet): DISH | CATEGORY | KCAL PER SERVE.

The chain prints calories ONLY ("on a per menu item basis"): no protein, carbs, fat, salt, kJ or weight, so every item is calories-only
(docs/DATA.md "Calories-only chains"). Calories are copied from the PDF as printed. The table is read by regex over `pdftotext -layout`;
the script stops if a line is neither a header line nor a dish line, or if the rows of any PDF differ from what was checked (row count and a
SHA-256 of the printed "dish|category|kcal" lines), so a human re-checks the naming below when the chain publishes new PDFs.

What is published, what is not (286 rows are printed):
- 2 rows are identical repeats and are not listed twice (same name AND same kcal as another row of the same menu or the brunch menu):
  Oyster Mushroom Burger (House Signatures, repeats Brunch Savoury 550) and Wild Mushroom Risotto (House Signatures, repeats Plates 520).
- 6 bread-based items are HELD BACK (holdback.csv): a whole bagel / roll / sandwich printed at 112-138 kcal, while the SAME list prints 230 kcal
  for a Pain au Chocolat, 272 for a Plain Croissant, 280 for the Clayfired Flatbread and 359 for the Kimchi bagel: the figure can't be the
  whole item (probably the filling only). Never corrected.
- Names: pdftotext upper case is tidied to normal capitalisation; a space is added before "(NPG)" where the PDF runs it into the name.
  "(NPG)" is the chain's own marker on 14 counter items and is explained nowhere on the page; it is kept in the name. Spelling fixes: "Chcocolate",
  "Mozarella", "Provalone" (printed forms are kept in `notes`); "NEW" before BBQ Veg is a menu marker and dropped (limited_time stays false).
  A word from the section heading is added where the printed name alone says nothing: the six milks ("Almond" -> "Almond Milk") and the eight
  lamingtons ("Classic" -> "Classic Lamington"). The same dish name printed with different calories on two menus (or the kids menu) gets
  "(Kids)" or "(Counter)" on the second one: Sweetcorn Fritters, Margherita Pizza, Tandoori Salmon, Cream Tea, Pecan Pie.
- Odd but published as printed (nothing in the list itself contradicts them): "Dick Chicken" (a dish name, as printed); Smoked Salmon Slider 73 kcal
  (Bacon Slider is 220); Hot Chocolate, Matcha and Mocha all 70 kcal; Butternut Squash salad 89 kcal; Americano 10 / Double Espresso 5 / Long Black 5.
- `serving` is blank: the PDFs print "KCAL PER SERVE" with no weight or size (sharing dishes say "(sharing)" in the name).
- Tags: vegetarian only where the printed name says vegan; contains_pork when the name says bacon, ham, sausage, chorizo, salami, pork, pig(s),
  mortadella or speck; contains_beef when it says beef, steak (not tuna steak) or wagyu. Nothing else is inferred ("meat type not stated"
  items are listed in MEAT_NOT_STATED for the report).

Allergens (docs/DATA.md "Allergens") are LINK-ONLY: the page prints no per-dish allergen table at all ("...questions that aren't answered above
can be answered upon arrival ... by our waitstaff and chefs"), only general text (gluten and dairy free options at every venue, no nut-free
kitchens, the allergen is likely in the kitchen). Nothing can be tied to any dish, so no allergens.csv; only allergen_guide.csv with the page.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "daisy-green"
PAGE_URL = "https://www.daisygreenfood.com/allergen-information"
SOURCE_TITLE = ("Daisy Green calorie information, four PDFs linked from its allergen and calorie page (Brunch and Lunch & Dinner created "
                "14 April 2026; Drinks and Counter created 17 November 2025)")
GUIDE_TITLE = "Daisy Green allergen and calorie information page (no per-dish allergen table; allergy questions are answered by staff)"
ALIASES = ["daisy green", "daisy green food"]
MAY_CONTAIN_PUBLISHED = False  # only general kitchen-wide wording; nothing per dish
NOTE = ("Calories only: Daisy Green prints kcal per menu item and no protein, carbs or fat. One list for its London venues; the chain says menus "
        "are seasonal and differ slightly from venue to venue. Brunch and Lunch & Dinner dated April 2026, Drinks and Counter November 2025. "
        "\"(NPG)\" on some counter items is the chain's own marker, unexplained.")

# file name -> (key, expected rows, SHA-256 of the printed "dish|category|kcal" lines joined by newlines)
PDFS = {
    "Brunch-cj8d.pdf": ("brunch", 29, "92c26ef5fce68850afab4916442e16689e07cf3a9bc1983754c948d799ddffa4"),
    "LD-gy3n.pdf": ("ld", 141, "3cb141eb0ee9491fd95f5d90eb2d3c1b1017694403a75df3b944d17f108ef909"),
    "DRINKS.pdf": ("drinks", 47, "aeaaf3f8dfbbdee57fd7e16f5300e4b38df5def55a76d637c934d8d72069ee2a"),
    "COUNTER.pdf": ("counter", 69, "4ed57665bf51a1cb40a04f79fdcad96abaa1e0b35a5e309656038c351be84017"),
}
MENU_LABEL = {"brunch": "Brunch", "ld": "Lunch & Dinner", "drinks": "Drinks", "counter": "Counter"}
EXPECTED_ROWS = 286
EXPECTED_ITEMS = 286 - 2  # held-back rows stay in items.csv (holdback.csv keeps them out of the app)

LINE = re.compile(r"^\s*(?P<dish>\S.*?)\s{2,}(?P<cat>\d+\.\s*[A-Z][A-Z &’']*?)\s+(?P<kcal>\d+)\s*$")
HEADER = [re.compile(p) for p in (r"^\s*DAISY GREEN CALORIES\s*$", r"^In accordance to UK law, we have taken every measure",
                                  r"Adults require around 2000kcal per day\s*$", r"^\s*DISH\s+CATEGORY\s+KCAL PER SERVE\s*$")]

SMALL = {"and", "on", "of", "with", "in", "the", "au", "aux"}
KEEP_UPPER = {"BBQ", "HG", "NPG", "GF"}
PORK = re.compile(r"\b(bacon|ham|sausage|pork|chorizo|salami|pepperoni|pigs?|mortadella|speck)\b", re.I)
BEEF = re.compile(r"\b(beef|wagyu)\b|(?<!tuna )\bsteak\b", re.I)
VEGAN = re.compile(r"\bvegan\b", re.I)

# Final names where the tidy printed name is not enough: (menu, printed name) -> (name, why)
RENAME = {
    ("brunch", "NEW BBQ VEG"): ("BBQ Veg", "Printed 'NEW BBQ VEG': NEW is a menu marker"),
    ("ld", "NEW BBQ VEG"): ("BBQ Veg", "Printed 'NEW BBQ VEG': NEW is a menu marker"),
    ("drinks", "WHITE HOT CHCOCOLATE"): ("White Hot Chocolate", "Printed 'WHITE HOT CHCOCOLATE' (spelling)"),
    ("counter", "MOZARELLA PESTO & TOMATO FOCACCIA"): ("Mozzarella Pesto & Tomato Focaccia", "Printed 'MOZARELLA' (spelling)"),
    ("counter", "SALAMI & PROVALONE"): ("Salami & Provolone", "Printed 'PROVALONE' (spelling)"),
    ("ld", "SWEETCORN FRITTERS@10. KIDS"): ("Sweetcorn Fritters (Kids)", "Same name on the brunch menu with 580 kcal"),
    ("ld", "MARGHERITA PIZZA@10. KIDS"): ("Margherita Pizza (Kids)", "Same name and kcal on the pizza list"),
    ("counter", "TANDOORI SALMON"): ("Tandoori Salmon (Counter)", "Same name on the lunch and dinner menu with 550 kcal"),
    ("counter", "CREAM TEA"): ("Cream Tea (Counter)", "Same name on the lunch and dinner menu with 480 kcal"),
    ("counter", "PECAN PIE"): ("Pecan Pie (Counter)", "Same name on the lunch and dinner menu with 520 kcal"),
    ("drinks", "ALMOND"): ("Almond Milk", "Printed 'ALMOND' under MILK"),
    ("drinks", "COCONUT"): ("Coconut Milk", "Printed 'COCONUT' under MILK"),
    ("drinks", "FULL FAT"): ("Full Fat Milk", "Printed 'FULL FAT' under MILK"),
    ("drinks", "OAT MILK"): ("Oat Milk", ""),
    ("drinks", "SKINNY"): ("Skinny Milk", "Printed 'SKINNY' under MILK"),
    ("drinks", "SOY"): ("Soy Milk", "Printed 'SOY' under MILK"),
    ("counter", "CARROT CAKE"): ("Carrot Cake Lamington", "Printed 'CARROT CAKE' under LAMINGTONS"),
    ("counter", "CHOCOLATE MUDCAKE (VEGAN)"): ("Chocolate Mudcake Lamington (Vegan)", "Printed 'CHOCOLATE MUDCAKE (VEGAN)' under LAMINGTONS"),
    ("counter", "CLASSIC"): ("Classic Lamington", "Printed 'CLASSIC' under LAMINGTONS"),
    ("counter", "GOLDEN GAYTIME"): ("Golden Gaytime Lamington", "Printed 'GOLDEN GAYTIME' under LAMINGTONS"),
    ("counter", "LEMON POLENTA (GF)"): ("Lemon Polenta Lamington (GF)", "Printed 'LEMON POLENTA (GF)' under LAMINGTONS"),
    ("counter", "RAINBOW"): ("Rainbow Lamington", "Printed 'RAINBOW' under LAMINGTONS"),
    ("counter", "RED VELVET"): ("Red Velvet Lamington", "Printed 'RED VELVET' under LAMINGTONS"),
    ("counter", "TIRAMISU"): ("Tiramisu Lamington", "Printed 'TIRAMISU' under LAMINGTONS"),
}
# Identical repeats (same name and kcal as a row kept elsewhere): (menu, printed name, category as printed) -> row it repeats
DROP_REPEATS = {
    ("ld", "OYSTER MUSHROOM BURGER", "6. HOUSE SIGNATURES"): ("brunch", "OYSTER MUSHROOM BURGER", "1. BRUNCH SAVOURY"),
    ("ld", "WILD MUSHROOM RISOTTO", "6. HOUSE SIGNATURES"): ("ld", "WILD MUSHROOM RISOTTO", "5. PLATES"),
}
# Held back: whole bread items printed far below the chain's own plain bread items (see the docstring).
HOLD_REASON = ("Printed {k} kcal for a whole {what}, but the same list prints 230 kcal for a Pain au Chocolat, 272 for a Plain Croissant, "
               "280 for the Clayfired Flatbread and 359 for the Kimchi and Asian Pickles Bagel: the figure cannot be the whole item "
               "(probably the filling only). Not published; never corrected.")
HOLD = {
    "Aubergine Roll (NPG)": "roll", "Aubergine Sandwich (NPG)": "sandwich", "Chicken Caesar Bagel (NPG)": "bagel",
    "Smoked Salmon Bagel (NPG)": "bagel", "Tomato & Mozzarella Roll (NPG)": "roll", "Tomatoes and Mozzarella Sandwich (NPG)": "sandwich",
}
# Dishes that may hold pork or beef but whose name does not say (for the report; no tag is set)
MEAT_NOT_STATED = {"Dirty Daisy", "The Bondi", "Club Sandwich", "Larry's Club Sandwich", "Timmy's Cheeseburger", "Hereford Sirloin",
                   "Hereford T-Bone (sharing)", "Flaming Tomahawk (sharing)", "Charcuterie Board", "Bowie's Shepherd's Pie (sharing)"}


def tidy_token(tok: str, first: bool) -> str:
    if tok.startswith("("):
        inner = tok.strip("()")
        if inner in KEEP_UPPER:
            return tok
        if inner.lower() == "sharing":
            return "(sharing)"
        return "(" + inner.capitalize() + ")"
    if tok in ("&", "+", "N'"):
        return tok
    if tok in KEEP_UPPER:
        return tok
    if "-" in tok:
        return "-".join(p.capitalize() for p in tok.split("-"))
    low = tok.lower()
    if not first and low in SMALL:
        return low
    return low[:1].upper() + low[1:]


def tidy(name: str) -> str:
    s = re.sub(r"(\S)\(", r"\1 (", name.strip())
    toks = s.split(" ")
    return " ".join(tidy_token(t, i == 0) for i, t in enumerate(toks))


def category(cat: str) -> str:
    c = re.sub(r"^\d+\.\s*", "", cat).strip()
    return " ".join("&" if w == "&" else w.capitalize() for w in c.split())


def read_pdf(path: Path, key: str, expected: int, digest: str) -> list:
    proc = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True)
    rows = []
    for line in proc.stdout.replace("\x0c", "\n").split("\n"):
        if not line.strip():
            continue
        m = LINE.match(line)
        if m:
            rows.append(dict(menu=key, dish=m["dish"].strip(), cat=m["cat"].strip(), kcal=m["kcal"]))
        elif not any(h.search(line) for h in HEADER):
            raise SystemExit(f"{path.name}: unreadable line {line!r}: the layout changed, re-check the script")
    if len(rows) != expected:
        raise SystemExit(f"{path.name}: {len(rows)} rows, expected {expected}: the menu changed, re-check RENAME / HOLD / DROP_REPEATS")
    got = hashlib.sha256("\n".join(f"{r['dish']}|{r['cat']}|{r['kcal']}" for r in rows).encode("utf-8")).hexdigest()
    if got != digest:
        raise SystemExit(f"{path.name}: the printed rows differ from the ones checked (hash {got}): re-read the PDF, update the tables and the hash")
    return rows


def build(rows: list) -> tuple:
    by_key = {(r["menu"], r["dish"], r["cat"]): r for r in rows}
    if len(by_key) != len(rows):
        raise SystemExit("A (menu, dish, category) row is printed twice")
    for drop, twin in DROP_REPEATS.items():
        a, b = by_key.get(drop), by_key.get(twin)
        if not a or not b or a["kcal"] != b["kcal"]:
            raise SystemExit(f"Repeat {drop} / {twin} is no longer an identical row: re-check DROP_REPEATS")
    items, holdback = [], []
    for r in rows:
        if (r["menu"], r["dish"], r["cat"]) in DROP_REPEATS:
            continue
        printed, notes = r["dish"], []
        rename = RENAME.get((r["menu"], printed + "@" + r["cat"])) or RENAME.get((r["menu"], printed))
        name = tidy(printed)
        if rename:
            name = rename[0]
            if rename[1]:
                notes.append(rename[1])
        elif re.search(r"\w\(", printed):
            notes.append(f"Printed '{printed}' (space added before the bracket)")
        tags = []
        if VEGAN.search(name):
            tags.append("vegetarian")
        if PORK.search(name) and not re.search(r"\btofu\b", name, re.I):  # "Harissa Tofu Sausage Roll" is not pork
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        if name in HOLD:
            holdback.append((slug(name), HOLD_REASON.format(k=r["kcal"], what=HOLD[name])))
        items.append(dict(name=name, category=category(r["cat"]), calories=r["kcal"], tags="|".join(tags), rankable=False,
                          notes="; ".join([f"{MENU_LABEL[r['menu']]} PDF, printed '{printed}' / '{r['cat']}' / {r['kcal']}"] + notes)))
    return items, holdback


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf_dir", type=Path, help="folder with Brunch-cj8d.pdf, LD-gy3n.pdf, DRINKS.pdf, COUNTER.pdf")
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    rows = []
    for fname, (key, expected, digest) in PDFS.items():
        path = args.pdf_dir / fname
        print(f"sha256 {sha256_file(path)}  {fname}")
        rows += read_pdf(path, key, expected, digest)
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"{len(rows)} rows, expected {EXPECTED_ROWS}")
    items, holdback = build(rows)
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"{len(items)} items built, expected {EXPECTED_ITEMS}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    held_names = {h[0] for h in holdback}
    if held_names != {slug(n) for n in HOLD}:
        raise SystemExit(f"Held-back rows changed: {sorted(held_names)} vs HOLD")
    guide = {"title": GUIDE_TITLE, "url": PAGE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Daisy Green", cuisine="Brunch", source_title=SOURCE_TITLE, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print("meat type not stated: " + ", ".join(sorted(n for n in names if n in MEAT_NOT_STATED)))


if __name__ == "__main__":
    main()
