#!/usr/bin/env python3
"""Build data/source/jamies-italian/ from Jamie's Italian (UK)'s official "Nutritional Information" PDF.

    python3 tools/uk_extract/jamies_italian.py path/to/jamies-italian-nutrition-menu-1506.pdf \
        --allergen-pdf path/to/allergen-menu-080926.pdf --checked-on 2026-10-06 [--out DIR]

Numbers are copied by script from the PDF's "Label values per serving" block exactly as printed (kJ, kcal, fat, saturates,
carbohydrate, sugars, fibre, protein, salt; the "per 100g" block is not used; salt stays salt; no serving weight is printed). Names and sections are
read from the PDF too; only the grouping into categories, the rankable flag, notes and the pork/beef tags are written by hand
below. If Jamie's Italian adds, removes, renames or reorders a row, or the column headings change, this script stops and shows
the difference, so a person re-checks the names, categories and tags before running again.

Vegetarian marks: the nutrition PDF has none. They come from the chain's own Allergen Menu PDF (linked next to it on
https://www.jamiesitalian.co.uk/allergens/): an item gets the `vegetarian` tag only when that menu's Vegetarian or Vegan
column says "Yes" for the same name (two names are spelt differently in the two PDFs: ALLERGEN_NAME). A name not found, or
found twice with different marks, gets no tag.

Pork/beef tags: from the item name (pepperoni, prosciutto, 'nduja, steak ...) or, where the chain's own July 2026 main menu
PDF (https://www.jamiesitalian.co.uk/media/lmkf2ucl/ji_july_main-1.pdf) describes the same dish with the meat in it, from that
description (INGREDIENT_TAGS, each with the quoted words). Anything else is "meat type not stated" and gets no tag.

Sources (the nutrition PDF is "June V1", created 2026-06-17; the allergen menu is "Sept V1", created 2026-09-08):
  page   https://www.jamiesitalian.co.uk/allergens/
  file   https://www.jamiesitalian.co.uk/media/qmqjxvyt/jamies-italian-nutrition-menu-1506.pdf   (nutrition, used for every number)
  file   https://www.jamiesitalian.co.uk/media/nu0n1orc/allergen-menu-080926.pdf               (vegetarian marks only)
Requires `pdftotext` (poppler). Nothing is converted, rounded or estimated here.

Allergens (docs/DATA.md "Allergens", all or nothing): copied by script from the grid of the chain's own Allergen Menu PDF (Sept V1,
`jamies_italian_allergens.py`): "Contains" = contains, "MC" = may contain (the guide's own find-and-replace of "may contain"; its
fryer sentence reads "Foods cooked in our fryers MC traces of allergens"), blank = not listed; it names no cereal and no tree nut.
A dish is tied to a row only when its printed name is EXACTLY the row's name: three June dishes are not on the September menu at all
(Pork Milanese, Amalfi Coast Trout, Steak Tagliata), three are printed under another name or without a size (Antipasto Plank for 2 /
Antipasto Plank, Giardiniera / Giardiniera Pickles, San Danielle Salad Large / San Danielle Salad), and one's row contradicts its own name
(the 'Nduja hot honey mayo dip lists no egg): those seven are held back (ALLERGEN_HOLDBACK, holdback.csv), never matched by guess.
The two dishes the menu prints in two places (Garlic Bread, Garlic Bread with Nduja Hot Honey: starters and sides) must have identical rows
or the run stops. The allergen menu is three months newer than the nutrition PDF: allergens are those of the September recipes.
"""
from __future__ import annotations
import argparse
import difflib
import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import jamies_italian_allergens as allergen_reader  # noqa: E402
from common import sha256_file, slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "jamies-italian"
SOURCE_URL = "https://www.jamiesitalian.co.uk/media/qmqjxvyt/jamies-italian-nutrition-menu-1506.pdf"
SOURCE_TITLE = ("Jamie's Italian Nutritional Information (June V1, PDF dated 17 June 2026); vegetarian marks and allergens from the "
                "Allergen Menu (Sept V1, PDF dated 8 September 2026)")
ALLERGEN_URL = "https://www.jamiesitalian.co.uk/media/nu0n1orc/allergen-menu-080926.pdf"
ALLERGEN_TITLE = "Jamie's Italian Allergen Menu (Sept V1, PDF dated 8 September 2026)"
NOTE = ("Values are per serving as printed in the chain's June 2026 guide; serving weights are not published. Allergens come from the "
        "chain's September 2026 allergen menu, which lists a different set of dishes: a dish it does not list under the same name is left out.")

NUM = r"<?\d+(?:\.\d+)?"
# A nutrition row is a name, a wide gap, then 18 numbers (9 per 100g, 9 per serving). The one row split by a page break has its
# first 4 numbers on the name's line and the other 14 on the next line (with the page's "NUTRITIONAL INFORMATION" banner between).
ROW = re.compile(rf"^\s*(?P<name>[^\s\d<].*?)\s{{2,}}(?P<nums>{NUM}(?:\s+{NUM})*)\s*$")
ONLY_NUMBERS = re.compile(rf"^\s*{NUM}(?:\s+{NUM})*\s*$")
SECTIONS = ["Spuntino and Antipasto", "Pizza", "Pasta", "Secondi", "Contorni", "Dolci", "Kids"]
# positions of the per-serving numbers inside the 18 printed numbers (per 100g first, then per serving)
POS = {"energy_kj": 9, "calories": 10, "fat_g": 11, "sat_fat_g": 12, "carbs_g": 13, "sugar_g": 14, "fiber_g": 15, "protein_g": 16, "salt_g": 17}

CATEGORY = {
    "Spuntino and Antipasto": "Starters (spuntino and antipasto)",
    "Pizza": "Pizza",
    "Pasta": "Pasta",
    "Secondi": "Mains (secondi)",
    "Contorni": "Sides (contorni)",
    "Dolci": "Desserts (dolci)",
    "Kids": "Kids",
}

# (section, name as printed, rankable) in the PDF's reading order, one entry per printed row. Names are published as printed.
# rankable=False: sharing plank, sauces/dips, add-ons and desserts (CLAUDE.md / playbook conventions).
S, P, PA, M, C, D, K = SECTIONS
ROWS: list[tuple[str, str, bool]] = [
    (S, "Pasta Croccante", True),
    (S, "Antipasto Plank for 2", False),
    (S, "Bruschetta - Stracciatella & Oil", True),
    (S, "Bruschetta - Stracciatella + Calabrian N'Duja", True),
    (S, "Bruschetta - Stracciatella + Pesto", True),
    (S, "Bruschetta - Stracciatella + Prosciutto", True),
    (S, "Burrata", True),
    (S, "Garlicky Prawns", True),
    (S, "Focaccia and Oil", True),
    (S, "Focaccia and Stracciatella", True),
    (S, "Garlic Bread", True),
    (S, "Garlic Bread with Nduja Hot Honey", True),
    (S, "Giardiniera", True),
    (S, "Mushroom Fritti", True),
    (S, "Nduja Arancini", True),
    (S, "Olives on Ice", True),
    (S, "Ravioli Fritti", True),
    (S, "San Danielle Salad", True),
    (S, "San Danielle Salad Large", True),
    (P, "Funghi Pizza", True),
    (P, "Pepperoni Pizza", True),
    (P, "Calabrian Pizza", True),
    (P, "San Daniele Pizza", True),
    (P, "Margherita Pizza", True),
    (P, "Marinara Pizza", True),
    (P, "Crust Dipper - 'Nduja Hot Honey Mayo", False),
    (P, "Crust Dipper - Super Green Aioli", False),
    (PA, "Seafood Spaghetti Nero", True),
    (PA, "Prawn Linguine", True),
    (PA, "Pappardelle Bolognese", True),
    (PA, "Bucatini Carbonara", True),
    (PA, "Rigatoni Arrabbiata", True),
    (PA, "Spaghetti Pomodoro", True),
    (PA, "Mezze Maniche Pesto", True),
    (PA, "Mezze Maniche Pesto Non Gluten", True),
    (PA, "Pomodoro Non Gluten", True),
    (PA, "Arrabbiata Non Gluten", True),
    (PA, "Prawn Linguine Non Gluten", True),
    (PA, "Bolognese Non Gluten", True),
    (PA, "Carbonara Non Gluten", True),
    (M, "Chicken Al Mattone + Salsa Verde", True),
    (M, "Chicken Al Mattone + Nduja", True),
    (M, "Chicken Al Mattone + Garlic Butter", True),
    (M, "Pork Milanese", True),
    (M, "Amalfi Coast Trout", True),
    (M, "Steak Tagliata", True),
    (M, "Burrata Panzanella", True),
    (M, "Lasagne", True),
    (C, "Green Beans Pomodoro", True),
    (C, "Parmesan Fries", True),
    (C, "Market Salad", True),
    (C, "Polenta Chips", True),
    (D, "Affogato", False),
    (D, "Amalfi Lemon Cheesecake", False),
    (D, "Chocolate Chip Cookie", False),
    (D, "Chocolate Soft Serve", False),
    (D, "Tiramisu", False),
    (D, "Vanilla Soft Serve", False),
    (D, "Add Chocolate Sauce", False),
    (D, "Add Raspberry Sauce", False),
    (K, "Kids Vanilla Ice Cream", False),
    (K, "Kids Cookies and Milk", False),
    (K, "Kids Prawn Pasta", True),
    (K, "Kids Chicken Lollipops", True),
    (K, "Kids Tomato Rigatoni", True),
    (K, "Kids Margherita Pizza", True),
    (K, "Crunchy Veggie Dippers", True),
]

# The allergen menu spells these two differently (same dish, same section).
ALLERGEN_NAME = {"Antipasto Plank for 2": "Antipasto Plank", "Giardiniera": "Giardiniera Pickles"}

# Tags come from the item's own name only where it says the meat; "nduja" (a spreadable pork sausage), "prosciutto" (ham)
# and "mortadella" (a pork sausage) are the names of pork products themselves.
PORK_WORDS = re.compile(r"\b(pepperoni|ham|bacon|sausage|pork|salami|chorizo|pancetta|prosciutto|mortadella|n'?duja)\b", re.I)
BEEF_WORDS = re.compile(r"\b(beef|steak)\b", re.I)

# Dishes whose name does not say the meat but whose description on the chain's own July 2026 main menu PDF does
# (printed name -> (tags, the words of the menu). Rendered and read by eye on 2026-10-06.
INGREDIENT_TAGS = {
    "Pappardelle Bolognese": (["contains_pork", "contains_beef"], "July menu, PAPPARDELLE BOLOGNESE: \"slow-cooked beef & pork ragù\""),
    "Bucatini Carbonara": (["contains_pork"], "July menu, BUCATINI CARBONARA: \"Crispy guanciale\" (cured pork cheek)"),
    "Calabrian Pizza": (["contains_pork"], "July menu, CALABRIAN: \"sausage, 'nduja\""),
    "San Daniele Pizza": (["contains_pork"], "July menu, SAN DANIELE: \"prosciutto\""),
    "San Danielle Salad": (["contains_pork"], "July menu, SAN DANIELE PROSCIUTTO SALAD (the guide spells it 'San Danielle')"),
    "San Danielle Salad Large": (["contains_pork"], "July menu, SAN DANIELE PROSCIUTTO SALAD (the guide spells it 'San Danielle')"),
    "Lasagne": (["contains_beef"], "July menu, BEEF SHIN LASAGNE: \"Twelve-hour beef ragù\" (the menu's only lasagne)"),
    "Antipasto Plank for 2": (["contains_pork"], "July menu, SHARING PLANK for two: \"speck, finocchiona, schiacciata piccante, mortadella\" (pork products)"),
}

# Things worth knowing about a row as printed (kept in items.csv `notes`, not exported).
NOTES = {
    "Kids Vanilla Ice Cream": "Per-serving and per-100g columns print the same numbers (a 100 g serving)",
    "Crust Dipper - Super Green Aioli": "Protein and fibre are printed as 0",
    "Add Raspberry Sauce": "Fat, saturates, fibre, protein and salt are printed as 0",
    "Antipasto Plank for 2": "Serving is the plank for two people; not suggested as a single order",
}


# Items the guide prints impossibly: not published, never corrected (id = the id this script gives the row, reason).
# None this time: every printed row passed the checks (kJ vs kcal, macros vs kcal, saturates <= fat, sugars <= carbohydrate,
# per-serving vs per-100g columns), and the build reports no warnings.
HOLDBACK: list[tuple[str, str]] = []

# Dishes whose allergens cannot be published, so (all or nothing) neither can the dish: no allergen row of EXACTLY this name, or a row that
# contradicts the dish's own name (docs/ACCURACY_AUDIT.md policy 3). name as printed -> reason. Checked on every run: a dish listed here that
# now has an exact row, or a dish with no row that is not listed here, stops the run so a person decides.
_NOROW = "The September 2026 allergen menu has no row named exactly '{name}'{why}, so its allergens cannot be published (and, all or nothing, neither is the dish)."
ALLERGEN_HOLDBACK = {
    "Antipasto Plank for 2": _NOROW.format(name="Antipasto Plank for 2", why=" (it prints 'Antipasto Plank', with no size)"),
    "Giardiniera": _NOROW.format(name="Giardiniera", why=" (it prints 'Giardiniera Pickles')"),
    "San Danielle Salad Large": _NOROW.format(name="San Danielle Salad Large", why=" (it prints one 'San Danielle Salad' row with no size)"),
    "Pork Milanese": _NOROW.format(name="Pork Milanese", why=" (the dish is not on that menu)"),
    "Amalfi Coast Trout": _NOROW.format(name="Amalfi Coast Trout", why=" (the dish is not on that menu)"),
    "Steak Tagliata": _NOROW.format(name="Steak Tagliata", why=" (the dish is not on that menu)"),
}
# The row exists but contradicts the dish's own name (policy 3): held back, not shown with a "safe" row.
ALLERGEN_CONTRADICTS = {
    "Crust Dipper - 'Nduja Hot Honey Mayo": "The allergen menu's row for this mayonnaise dip marks no egg (it marks mustard and sulphites only) and neither Vegetarian nor "
                                            "Vegan, so the row contradicts the dish's own name; held back rather than shown with a possibly wrong 'no egg' row "
                                            "(docs/ACCURACY_AUDIT.md policy 3).",
}


def _text(pdf: Path) -> str:
    return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout


def read_rows(pdf: Path) -> list[tuple[str, str, list[str]]]:
    """(section, name, 18 numbers as printed) for every nutrition row, in reading order."""
    text = _text(pdf)
    flat = re.sub(r"\s+", " ", text)
    if not re.search(r"Label values per 100g .*?Label values per serving", flat):
        raise SystemExit("The column blocks are no longer 'Label values per 100g' then 'Label values per serving': the layout changed.")
    for words in ("Energy Kj", "Saturated", "Carbohydr", "Sugars", "Fibre", "Protein", "Salt"):
        if words not in flat:
            raise SystemExit(f"The column heading {words!r} is missing from the PDF: the layout changed.")
    rows: list[tuple[str, str, list[str]]] = []
    section = ""
    pending: list | None = None
    for line in text.split("\n"):
        if not line.strip():
            continue
        if pending is not None:
            if line.strip() == "NUTRITIONAL INFORMATION":
                continue
            if not ONLY_NUMBERS.match(line):
                raise SystemExit(f"Row {pending[1]!r} is split across lines in a way this script does not know: {line.strip()!r}")
            pending[2] += line.split()
            if len(pending[2]) == 18:
                rows.append((pending[0], pending[1], pending[2]))
                pending = None
            elif len(pending[2]) > 18:
                raise SystemExit(f"Row {pending[1]!r} has more than 18 numbers.")
            continue
        if line.strip() in SECTIONS:
            section = line.strip()
            continue
        m = ROW.match(line)
        if not m:
            continue
        nums = m["nums"].split()
        name = re.sub(r"\s+", " ", m["name"]).strip()
        if len(nums) == 18:
            rows.append((section, name, nums))
        elif len(nums) < 18:
            pending = [section, name, nums]
        else:
            raise SystemExit(f"Row {name!r} has {len(nums)} numbers, expected 18.")
    if pending is not None:
        raise SystemExit(f"Row {pending[1]!r} is incomplete at the end of the PDF.")
    return rows


def read_vegetarian(pdf: Path) -> dict[str, set[str] | None]:
    """name -> {'vegetarian','vegan'} marks from the allergen menu ("Yes" under the Vegetarian / Vegan heading).
    None = the name is printed more than once with different marks."""
    html_text = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    out: dict[str, set[str] | None] = {}
    for page in html_text.split("<page ")[1:]:
        words = [(float(a), float(b), float(c), html.unescape(t)) for a, b, c, t in
                 re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">(.*?)</word>', page)]
        veg = [(a + c) / 2 for a, _, c, t in words if t == "Vegetarian"]
        vegan = [(a + c) / 2 for a, _, c, t in words if t == "Vegan"]
        if not veg or not vegan or max(veg) - min(veg) > 3 or max(vegan) - min(vegan) > 3:
            raise SystemExit("The allergen menu's Vegetarian / Vegan columns are not where this script expects: the layout changed.")
        vx, nx = veg[0], vegan[0]
        name_words = sorted([w for w in words if w[2] < 268], key=lambda w: (w[1], w[0]))
        rows: list[dict] = []
        for w in name_words:
            for r in rows:
                if abs(r["y"] - w[1]) < 2.5:
                    r["w"].append(w)
                    break
            else:
                rows.append({"y": w[1], "w": [w]})
        yes = [w for w in words if w[3] == "Yes"]
        for w in yes:
            if min(abs((w[0] + w[2]) / 2 - vx), abs((w[0] + w[2]) / 2 - nx)) > 12:
                raise SystemExit("A 'Yes' in the allergen menu is outside the Vegetarian / Vegan columns: the layout changed.")
        for r in rows:
            name = re.sub(r"\s+", " ", " ".join(x[3] for x in sorted(r["w"], key=lambda x: x[0]))).strip()
            marks = set()
            for w in yes:
                if abs(w[1] - r["y"]) < 3:
                    centre = (w[0] + w[2]) / 2
                    marks.add("vegetarian" if abs(centre - vx) < abs(centre - nx) else "vegan")
            if name in out and out[name] != marks:
                out[name] = None
            elif name not in out:
                out[name] = marks
    return out


def build_allergens(matrix: list[dict], names: list[str]) -> tuple[dict[str, dict], list[str]]:
    """printed dish name -> {"contains", "may_contain"} for every name in `names` that has an exact row; the report lines.
    A name printed in two places must carry identical rows (contains, may contain, vegetarian, vegan) or the run stops."""
    by_name: dict[str, list[dict]] = {}
    for r in matrix:
        by_name.setdefault(r["label"], []).append(r)
    found: dict[str, dict] = {}
    report: list[str] = []
    for name in names:
        rows = by_name.get(name)
        if not rows:
            continue
        first = rows[0]
        for other in rows[1:]:
            same = all(first[k] == other[k] for k in ("contains", "may_contain", "vegetarian", "vegan"))
            if not same:
                raise SystemExit(f"{name!r} is printed {len(rows)} times in the allergen menu with different rows: not published (hold it back).")
        if len(rows) > 1:
            report.append(f"{name!r} is printed {len(rows)} times in the allergen menu (pages {[r['page'] for r in rows]}) with identical rows")
        found[name] = {"contains": set(first["contains"]), "may_contain": set(first["may_contain"])}
    return found, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the nutrition PDF")
    ap.add_argument("--allergen-pdf", type=Path, required=True, help="the allergen menu PDF (vegetarian marks)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDF with the live page")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    printed = read_rows(args.pdf)
    got = [(s, n) for s, n, _ in printed]
    want = [(s, n) for s, n, _ in ROWS]
    if got != want:
        print(f"The PDF has {len(got)} nutrition rows but this script names {len(want)}, or the rows differ. Re-check the names, "
              "sections, tags and holdbacks against the PDF before running again:", file=sys.stderr)
        for line in difflib.unified_diff([f"{s} | {n}" for s, n in want], [f"{s} | {n}" for s, n in got], "script", "PDF", lineterm="", n=0):
            print("  " + line, file=sys.stderr)
        return 1

    marks = read_vegetarian(args.allergen_pdf)
    items, no_mark, meat_unstated = [], [], []
    for (section, name, nums), (_, _, rankable) in zip(printed, ROWS):
        ak = ALLERGEN_NAME.get(name, name)
        m = marks.get(ak, "missing")
        tags: list[str] = []
        notes = [NOTES[name]] if name in NOTES else []
        if m == "missing":
            no_mark.append(name)
            notes.append("Not on the September 2026 allergen menu: no vegetarian mark available")
        elif m is not None and m:  # 'vegetarian' and/or 'vegan' marked "Yes"
            tags.append("vegetarian")
        if PORK_WORDS.search(name):
            tags.append("contains_pork")
        if BEEF_WORDS.search(name):
            tags.append("contains_beef")
        if name in INGREDIENT_TAGS:
            extra, why = INGREDIENT_TAGS[name]
            tags += [t for t in extra if t not in tags]
            notes.append(why)
        if "vegetarian" in tags and any(t in tags for t in ("contains_pork", "contains_beef")):
            raise SystemExit(f"{name}: marked vegetarian but also tagged pork/beef: re-check")
        if "vegetarian" not in tags and not any(t in tags for t in ("contains_pork", "contains_beef")):
            meat_unstated.append(name)
        item = {"name": name, "category": CATEGORY[section], "serving": "", "rankable": rankable, "limited_time": False,
                "tags": "|".join(tags), "notes": "; ".join(notes)}
        for key, pos in POS.items():
            item[key] = nums[pos]
        item["sodium_mg"] = ""
        items.append(item)

    # ---- allergens: exact-name rows only (see the module docstring)
    matrix = allergen_reader.read_matrix(args.allergen_pdf)
    names = [it["name"] for it in items]
    found, allergen_report = build_allergens(matrix, names)
    no_row = {n for n in names if n not in found}
    if no_row != set(ALLERGEN_HOLDBACK):
        print("The dishes without an exact allergen row changed.\n"
              f"  now without a row, not in ALLERGEN_HOLDBACK: {sorted(no_row - set(ALLERGEN_HOLDBACK)) or '-'}\n"
              f"  in ALLERGEN_HOLDBACK, now with a row or gone: {sorted(set(ALLERGEN_HOLDBACK) - no_row) or '-'}\n"
              "Decide for each (publish it or hold it back with a reason) before running again.", file=sys.stderr)
        return 1
    gone = [n for n in ALLERGEN_CONTRADICTS if n not in found]
    if gone:
        print(f"ALLERGEN_CONTRADICTS names dishes that are no longer published or have no allergen row: {gone}", file=sys.stderr)
        return 1
    held = {**ALLERGEN_HOLDBACK, **ALLERGEN_CONTRADICTS}
    if len(held) * 3 > len(items):
        print(f"{len(held)} of {len(items)} dishes would be held back: link-only is better. Stopping.", file=sys.stderr)
        return 1
    # cross-check of two independent readings of the same PDF: the vegetarian / vegan marks (read_vegetarian, by name and row height)
    # against the grid reader's Vegetarian / Vegan columns, for every dish tied to a row
    matrix_marks = {r["label"]: {m for m, on in (("vegetarian", r["vegetarian"]), ("vegan", r["vegan"])) if on} for r in matrix}
    for n in found:
        if marks.get(n) != matrix_marks[n]:
            raise SystemExit(f"{n!r}: the vegetarian/vegan marks read two ways disagree ({marks.get(n)} vs {matrix_marks[n]}): the layout changed.")
    ids = [slug(i["name"]) for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    holdback = HOLDBACK + [(slug(n), why) for n, why in held.items()]
    allergen_rows = [(slug(n), found[n]) for n in names if n not in held]
    assert len(allergen_rows) == len(items) - len(held), "every published dish must have exactly one allergen row"
    for it in items:
        it["id"] = slug(it["name"])
        it["allergens"] = None  # write_chain_folder writes the guide link only; allergens.csv is written below for the published dishes
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True}

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Jamie's Italian", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["jamies italian", "jamie's italian"], items=items, note=NOTE,
        out=args.out, holdback=holdback or None, allergen_guide=guide)
    write_allergens(out, CHAIN_ID, allergen_rows, guide)
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out} (nutrition PDF sha256 {sha256_file(args.pdf)}, "
          f"allergen PDF sha256 {sha256_file(args.allergen_pdf)})")
    print(f"allergens published for {len(allergen_rows)} dishes ({len(matrix)} grid rows read; {len(ALLERGEN_HOLDBACK)} dishes with no exact row, "
          f"{len(ALLERGEN_CONTRADICTS)} whose row contradicts its name)")
    print("\n".join(allergen_report))
    used = set(names)
    print(f"allergen-menu rows with no published dish: {[r['label'] for r in matrix if r['label'] not in used][:60]}")
    print(f"not found on the allergen menu (no vegetarian mark): {no_mark}")
    print(f"no vegetarian mark and no pork/beef tag ({len(meat_unstated)}): {meat_unstated}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
