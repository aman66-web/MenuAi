#!/usr/bin/env python3
"""Build data/source/warrens-bakery/ from Warrens Bakery's official "Calories & Allergens Guide" (a CALORIES-ONLY chain, with allergens).

    python3 tools/uk_extract/warrens_bakery.py path/to/guide.pdf --checked-on 2026-10-07 [--out DIR]

Source (the file the chain's own page links; one download, no login):
    page  https://warrensbakery.co.uk/about-us/calories-allergens/
    file  https://warrensbakery.co.uk/content/uploads/2026/07/WB1039_WARRENS-NUTRITIONAL-AND-ALLERGY-SHEETS-JULY26-LIVERPOOL-ST.pdf
    "CALORIES & ALLERGENS GUIDE JULY 2026", 15 pages, Adobe InDesign, PDF created 2026-07-23, served Last-Modified 2026-07-23.
Needs `pdftotext` (poppler). The table is read by position: see warrens_bakery_pdf.py.

What the guide prints: for every item ONE calorie figure (no weight, portion, protein, carbs, fat, kJ or any other nutrient), the
allergens it contains, and the allergens it "may contain". So this is a calories-only chain (docs/DATA.md "Calories-only chains"):
protein, carbs and fat stay blank. The figure is copied as printed, as the guide's item is sold (the guide states no basis).

How the guide's own wording is read (every rule below is checked against the PDF on each run; the script stops when it changes):
- Tabs: Breakfast, Drinks, Pasties, Savouries, Sweet Bakery, Last Chance Buys, Seasonal, Liverpool Street Station. The last is
  one London station shop's own list (same names, different figures): single venue, so not listed here. Rows whose name says they
  are sold only in some shops ("Railway sites only", "Devon stores only", "- Travel sites") are left out for the same reason.
- Tabs overlap: most Seasonal rows repeat Sweet Bakery rows, and some rows are printed twice (a second copy in Title Case). Rows with
  the same name and calories are ONE item. If their allergen lists differ, the longest printed list is used only when every other
  copy's list is contained in it (the more cautious printed row); otherwise the run stops. Items in the Seasonal tab are marked
  limited_time (the guide labels them seasonal).
- Two rows print the same name with different calories (Berry Bakewell 381 / 501) and the guide doesn't say how they differ: both held back.
- Whipped Cream (per serving) prints "NO ALLERGENS PRESENT" while the guide's own Travel-sites whipped cream prints MILK, SOYA: the
  guide contradicts itself on a safety fact, so the row is held back. Marshmallows print the allergen word "MAISE", which is not one of
  the 14 allergens and not a spelling of one: left out rather than guessed.
- Allergens are copied from the same row. "GLUTEN FROM WHEAT" is gluten with the cereal wheat; "WHEAT" / "BARLEY" alone are read the
  same way; "SULPHUR" is read as sulphites and "OTHER NUTS" as nuts; a list that forgot a comma ("MILK SOYA") is read word by word.
  "NO ALLERGENS PRESENT" is an empty list. Any other word stops the run.
- Names: tidied capitalisation, sizes as "(large)" / "(regular)" in the name and in `serving`; four spelling slips in names are mended
  (NAME_FIXES) and the printed name is kept in `notes`. "(PD)" and "(DB)" are the guide's own suffixes and are kept.
- Tags: vegetarian only where the name says VEGAN; contains_pork / contains_beef only when the name says so.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import warrens_bakery_pdf as pdf_reader  # noqa: E402
from common import _A, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "warrens-bakery"
SOURCE_URL = "https://warrensbakery.co.uk/content/uploads/2026/07/WB1039_WARRENS-NUTRITIONAL-AND-ALLERGY-SHEETS-JULY26-LIVERPOOL-ST.pdf"
SOURCE_TITLE = "Warrens Bakery Calories & Allergens Guide, July 2026 (PDF created 23 July 2026)"
ALLERGEN_TITLE = "Warrens Bakery Calories & Allergens Guide, July 2026 (PDF created 23 July 2026)"
ALIASES = ["warrens bakery", "warrens", "warren's bakery", "warrens 1860"]
# The guide has a "May Contain" column, and its page says "The allergens shown in this guide includes the allergens containing and
# that which may contain within a product".
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Warrens prints calories only, one figure per item as sold with no weight or portion, so protein, carbs and fat are not published. "
        "Liverpool Street Station's separate list and items sold only in Devon, at railway or travel sites are left out.")

EXPECTED_TABS = {"Breakfast": 14, "Drinks": 48, "Pasties": 14, "Savouries": 17, "Sweet Bakery": 53, "Last Chance Buys": 14, "Seasonal": 25,
                 "Liverpool Street Station | Sweet Bakery": 39}
SINGLE_VENUE_TAB = "Liverpool Street Station | Sweet Bakery"
# Rows whose printed name limits them to some shops: left out.
VENUE_LIMIT = re.compile(r"\((railway sites only|devon stores only)\)|- travel sites$", re.I)
EXPECTED_VENUE_LIMITED = {"LARGE HALAL SAUSAGE ROLL (Railway sites only)", "BELGIAN BUN (Devon stores only)", "CHELSEA BUN (Devon stores only)",
                          "CREAM FINGER DOUGHNUT (Devon Stores only)", "WHIPPED CREAM (PER SERVING) - Travel sites"}
# Rows whose allergen text holds a word that is neither one of the 14 allergens nor a spelling of one: left out (name -> the word).
UNREADABLE_ALLERGEN = {"MARSHMALLOWS (PER SERVING)": "MAISE"}

# The chain's own spellings that are not in common._A: each is one of the 14 allergens written another way.
EXTRA_WORDS = {
    "gluten from wheat": ("gluten", "wheat"), "gluten from barley": ("gluten", "barley"), "gluten from rye": ("gluten", "rye"),
    "gluten from oats": ("gluten", "oats"),
    "sulphur": ("sulphites", None),
    "other nuts": ("nuts", None),
}
TABLE = {**_A, **EXTRA_WORDS}
NO_ALLERGENS = "no allergens present"

# Spelling slips in printed names (word -> mended); the printed name is kept in notes.
NAME_FIXES = {"CAPPUCINO": "CAPPUCCINO", "TEADY": "TEDDY", "FILLEDCOOKIE": "FILLED COOKIE", "CHOOLATE": "CHOCOLATE"}
KEEP_UPPER = {"PD", "DB"}
# Dept (as printed) -> category shown. A Dept the script doesn't know stops the run.
CATEGORY = {
    "Breakfast Cold": "Breakfast (cold)", "Breakfast Hot": "Breakfast (hot)",
    "Cold Drinks - Iced Coffee": "Iced coffee", "Cold Drinks - Iced Tea": "Iced tea", "Cold Drinks - Smoothies": "Smoothies",
    "Cold Drinks - Smoothies - Extras": "Smoothie extras", "Hot Drinks - Coffee": "Coffee", "Hot Drinks - Extras": "Hot drink extras",
    "Hot Drinks - Hot Chocolate": "Hot chocolate", "Hot Drinks - Speciality Tea": "Speciality tea", "Hot Drinks - Tea": "Tea",
    "Hot Drinks - White Hot Chocolate": "White hot chocolate",
    "Pasties - Best Sellers Large": "Pasties", "Pasties - Best Sellers Medium": "Pasties", "Pasties - Other": "Pasties",
    "Savoury Rolls": "Savoury rolls", "Savoury Slices": "Savoury slices", "Savouries - Other": "Other savouries",
    "Cakes": "Cakes", "Cookies & Biscuits": "Cookies & biscuits", "Doughnuts": "Doughnuts", "Meringues": "Meringues", "Saffron": "Saffron",
    "Tray Bakes": "Tray bakes", "Traybakes": "Tray bakes",
    "": "Fruit",  # APPLE and BANANA print no Group or Dept (they sit at the end of the Sweet Bakery tab)
}
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo|gammon)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
SIZE = re.compile(r"^(.*\S)\s+(LARGE|REGULAR)$")
# Items where the guide's name implies meat but not which: reported, never tagged.
MEAT_NOT_STATED = {"Meat Pattie", "Breakfast Turnover", "Cornish Cocktail Pasty"}

HOLD_BACK = {
    "whipped-cream-per-serving": "The guide prints NO ALLERGENS PRESENT for this whipped cream but MILK, SOYA for its own Travel-sites whipped cream: it contradicts itself on a safety fact, so neither is published until Warrens confirms.",
    "berry-bakewell-sweet-bakery": "The guide prints Berry Bakewell twice with different calories (381 in Sweet Bakery, 501 in Last Chance Buys) and does not say how they differ.",
    "berry-bakewell-last-chance-buys": "The guide prints Berry Bakewell twice with different calories (381 in Sweet Bakery, 501 in Last Chance Buys) and does not say how they differ.",
}
# Odd things in the guide, kept in `notes` (not exported) and in the report; the numbers are entered as printed.
ANOMALY_NOTES = {
    "large-cheese-and-onion-pasty": "Same printed value (1347) as the Large Creamy Chicken Pasty, while the medium sizes print 822 and 706",
    "large-creamy-chicken-pasty": "Same printed value (1347) as the Large Cheese & Onion Pasty, while the medium sizes print 822 and 706",
    "jam-doughnut-3-pack": "The name says 3 pack and the guide states no basis, so it is not known whether 213 is for the pack or one doughnut",
    "biscoff-doughnut": "Printed in the Seasonal tab without the (DB) suffix, with the same figures as Biscoff Doughnut (DB): kept as a separate item because the names differ",
}
EXPLICIT_IDS = {("BERRY BAKEWELL", "381"): "berry-bakewell-sweet-bakery", ("BERRY BAKEWELL", "501"): "berry-bakewell-last-chance-buys"}


def tidy_name(printed: str) -> str:
    """'CHEESE & VEGETABLE PASTY (GLUTEN FREE)' -> 'Cheese & Vegetable Pasty (gluten free)'; 'DOUGHNUT(DB)' -> 'Doughnut (DB)'."""
    s = re.sub(r"(\S)\(", r"\1 (", printed.strip())
    out, depth = [], 0
    for tok in s.split():
        word = tok.strip("()")
        if depth > 0 or tok.startswith("("):
            out.append(tok if word in KEEP_UPPER else tok.lower())
        elif tok == "&":
            out.append(tok)
        else:
            out.append(tok[:1].upper() + tok[1:].lower())
        depth += tok.count("(") - tok.count(")")
    return " ".join(out)


def final_name(row: dict) -> tuple:
    """(display name, serving) from a printed row."""
    name = row["name"].strip()
    for bad, good in NAME_FIXES.items():
        name = re.sub(r"\b" + bad + r"\b", good, name)
    serving = ""
    best = re.search(r"Best Sellers (Large|Medium)$", row["dept"])
    if best:
        serving = best.group(1)
    m = SIZE.match(name) if row["dept"].startswith("Hot Drinks") else None
    if m:
        base, serving = m.group(1), m.group(2).capitalize()
        if row["dept"].endswith("White Hot Chocolate"):
            if base != "HOT CHOCOLATE":
                raise SystemExit(f"White Hot Chocolate row named {base!r}: re-check the naming rule")
            base = "WHITE HOT CHOCOLATE"
        name = base[:-1] + f", {serving.lower()})" if base.endswith(")") else f"{base} ({serving.lower()})"
    return tidy_name(name), serving


# ---------------------------------------------------------------- allergens
def _split_top(text: str) -> list:
    """Split on commas that are not inside parentheses."""
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts


def _words(phrase: str, where: str) -> list:
    """One printed phrase -> allergen words from TABLE, longest match first ('milk soya' -> milk, soya). Unknown word: stop."""
    toks = phrase.lower().split()
    out, i = [], 0
    while i < len(toks):
        for j in range(len(toks), i, -1):
            cand = " ".join(toks[i:j])
            if cand in TABLE:
                out.append(cand)
                i = j
                break
        else:
            raise SystemExit(f"{where}: allergen word {toks[i]!r} (in {phrase!r}) is not one of the 14 allergens or a known spelling: "
                             "check the guide; do not guess")
    return out


def parse_allergens(text: str, where: str) -> tuple:
    """Printed allergen cell -> (keys, cereals, tree nuts). 'NO ALLERGENS PRESENT' = nothing."""
    text = text.strip()
    if text.lower() == NO_ALLERGENS:
        return set(), set(), set()
    keys, cereals, nuts = set(), set(), set()
    for token in _split_top(text):
        token = token.strip()
        if not token:  # a trailing comma
            continue
        m = re.match(r"^(.*?)\s*\((.*)\)\s*$", token)
        pieces = [m.group(1)] + _split_top(m.group(2)) if m else [token]
        for piece in pieces:
            for sub in re.split(r"\s*&\s*|\s+and\s+", piece.strip(), flags=re.I):
                if not sub.strip():
                    continue
                for w in _words(sub, where):
                    key, specific = TABLE[w]
                    keys.add(key)
                    if key == "gluten" and specific:
                        cereals.add(specific)
                    if key == "nuts" and specific:
                        nuts.add(specific)
    return keys, cereals, nuts


def allergen_record(row: dict) -> dict:
    where = f"{row['name']} (page {row['page']})"
    c, cer, nut = parse_allergens(row["allergens"], where)
    m, _, _ = parse_allergens(row["may_contain"], where + " May Contain")
    return {"contains": c, "may_contain": m, "cereals": cer, "nuts": nut}


def _subset(a: dict, b: dict) -> bool:
    return all(a[k] <= b[k] for k in ("contains", "may_contain", "cereals", "nuts"))


def merge_copies(name: str, copies: list, report: list) -> dict:
    """Allergens of an item printed more than once: all copies equal, or the largest one when the others fit inside it."""
    recs = [allergen_record(r) for r in copies]
    best = max(recs, key=lambda a: sum(len(a[k]) for k in a))
    if all(_subset(a, best) for a in recs):
        if any(a != best for a in recs):
            report.append(f"printed {len(recs)} times with different allergen lists: used the longest (it contains every other copy): {name}")
        return best
    raise SystemExit(f"{name}: printed {len(recs)} times with allergen lists that do not nest: decide by hand before rebuilding")


# ---------------------------------------------------------------- build
def build(rows: list) -> tuple:
    report = []  # type: list
    counts = {}  # type: dict
    for r in rows:
        counts[r["tab"]] = counts.get(r["tab"], 0) + 1
    if counts != EXPECTED_TABS:
        raise SystemExit(f"The guide changed: rows per tab are now {counts}, expected {EXPECTED_TABS}. Re-read the new guide and update the "
                         "expected counts, CATEGORY and the exclusion lists below.")
    venue = [r for r in rows if r["tab"] != SINGLE_VENUE_TAB and VENUE_LIMIT.search(r["name"])]
    if {r["name"] for r in venue} != EXPECTED_VENUE_LIMITED:
        raise SystemExit(f"Rows limited to some shops changed: now {sorted(r['name'] for r in venue)}, expected {sorted(EXPECTED_VENUE_LIMITED)}")
    unreadable = [r for r in rows if r["name"] in UNREADABLE_ALLERGEN]
    for r in unreadable:
        if UNREADABLE_ALLERGEN[r["name"]].lower() not in r["allergens"].lower():
            raise SystemExit(f"{r['name']}: the allergen text is now {r['allergens']!r}, re-check UNREADABLE_ALLERGEN")
    report.append(f"left out: {counts[SINGLE_VENUE_TAB]} rows of the single-venue Liverpool Street Station tab")
    report += [f"left out (shops it is limited to): {r['name']} {r['calories']} kcal" for r in venue]
    report += [f"left out (allergen word {UNREADABLE_ALLERGEN[r['name']]!r} is not one of the 14): {r['name']} {r['calories']} kcal" for r in unreadable]
    skip = {id(r) for r in venue} | {id(r) for r in unreadable}
    included = [r for r in rows if r["tab"] != SINGLE_VENUE_TAB and id(r) not in skip]

    groups = {}  # type: dict
    order = []  # type: list
    for r in included:
        name, serving = final_name(r)
        if r["dept"] not in CATEGORY:
            raise SystemExit(f"New Dept {r['dept']!r} ({r['name']}): add it to CATEGORY")
        key = (name, r["calories"])
        if key not in groups:
            groups[key] = {"name": name, "serving": serving, "rows": []}
            order.append(key)
        groups[key]["rows"].append(r)
    by_name = {}  # type: dict
    for name, cal in order:
        by_name.setdefault(name, []).append(cal)
    clashes = {n: c for n, c in by_name.items() if len(c) > 1}
    if set(clashes) != {"Berry Bakewell"}:
        raise SystemExit(f"Names printed with different calories: {clashes}; expected only Berry Bakewell. Decide by hand (hold back or rename).")

    items, holdback = [], []
    for key in order:
        g = groups[key]
        rs = g["rows"]
        first = rs[0]
        printed = first["name"].strip()
        tabs = []
        for r in rs:
            if r["tab"] not in tabs:
                tabs.append(r["tab"])
        depts = {r["dept"] for r in rs}
        if len(depts) > 1:
            raise SystemExit(f"{g['name']}: copies sit in different Depts {sorted(depts)}")
        # an identical-name copy in another Dept would have been a different item; the Seasonal/Last Chance tabs repeat Group and Dept
        allergens = merge_copies(g["name"], rs, report)
        name = g["name"]
        tags = []
        if re.search(r"\bvegan\b", name, re.I):
            tags.append("vegetarian")
        if PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        if name in MEAT_NOT_STATED:
            report.append(f"meat type not stated: {name}")
        notes = [f"Printed '{printed}'" if printed.upper() != name.upper() else "", f"Dept {first['dept'] or '(none printed)'}; tab {', '.join(tabs)}"]
        if len(rs) > 1:
            notes.append(f"printed {len(rs)} times")
        item_id = EXPLICIT_IDS.get((printed.upper(), key[1]), slug(name))
        if item_id in ANOMALY_NOTES:
            notes.append(ANOMALY_NOTES[item_id])
        item = {"id": item_id, "name": name, "category": CATEGORY[first["dept"]], "serving": g["serving"], "calories": key[1], "tags": "|".join(tags),
                "limited_time": "Seasonal" in tabs, "rankable": False, "notes": "; ".join(n for n in notes if n), "allergens": allergens}
        items.append(item)
        if item_id in HOLD_BACK:
            holdback.append((item_id, HOLD_BACK[item_id]))
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids are not unique")
    missing = [h for h in list(HOLD_BACK) + list(ANOMALY_NOTES) if h not in ids]
    if missing:
        raise SystemExit(f"Ids named in HOLD_BACK / ANOMALY_NOTES not found in the items: {missing}")
    return items, holdback, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"guide PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    rows = pdf_reader.read_rows(args.pdf)
    items, holdback, report = build(rows)
    guide = {"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    assert len(NOTE) < 400, len(NOTE)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Warrens Bakery", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    cats = {}  # type: dict
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))


if __name__ == "__main__":
    main()
