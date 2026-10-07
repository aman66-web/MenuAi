#!/usr/bin/env python3
"""Build data/source/cafe-concerto/ from Caffè Concerto's own allergen guides (a CALORIES-ONLY chain, allergens read completely).

    python3 tools/uk_extract/cafe_concerto.py --pdfs DIR --checked-on 2026-10-07 [--out DIR]

Source: https://www.caffeconcerto.co.uk/allergens (the chain's own "Allergen Information" page) links six PDF allergen grids, all on
https://f004.backblazeb2.com/file/caffe-concerto/ (the chain's own file store): BREAKFAST MENU new, Lunch Menu new, CAKES new, HOT AND
COLD DRINKS new, COCKTAILS AND MOCKTAILS_ALLERGENS and AFTERNOON TEA AND CREAM TEA_allergens. DIR holds the six files under those names.
Needs `pdftotext`, `pdftocairo`, `pdfinfo` (poppler).

NO DOWNLOAD OPTION, ON PURPOSE: that file host's robots.txt (https://f004.backblazeb2.com/robots.txt) reads "User-agent: *" and
"Disallow: /", so the PDFs are to be downloaded by a person in a browser (the links are on the chain's page above), not by a script.
The chain's own site (caffeconcerto.co.uk) has a robots.txt with no rules.

What the guides print: one row per dish with the dish name, and the calories INSIDE the name text ("Bruschetta (kcal 377)", "CROISSANT
(394 kcal)", "Antipasto Misto (For One kcal734, For Two kcal 950)"). No protein, carbs, fat, salt or serving size anywhere, so this is a
calories-only chain (docs/DATA.md): protein, carbs and fat stay blank. The calories are read from the name text by the patterns below
and copied exactly; only the case of ALL-CAPS names is tidied. A dish whose name carries no calories (Afternoon Tea, Macaroons, cans and
bottles, teas, three cocktails...) is not published. The "For Two" figures of two starters print no "kcal" beside the number
("For Two 631"): held back rather than assumed (holdback.csv).

Allergens come from the same rows of the same grids (the marks are bitmap icons: see cafe_concerto_pdf.py, which maps each icon to its
meaning by its own pixels via the legend of its page). Green tick = contains, M = may contain (suppliers' cross contamination or a shared
fryer, as the page says), R = removable (read as the allergen being removable from the dish: ignored, so the allergen still counts as
printed). The gluten and tree nut cells print one small label per cereal / nut with its own tick or M; the crustacean and mollusc cells
print species labels. Contains / may contain at allergen level come from the column; cereals and nuts list only the TICKED labels. All
rows that are published have their allergens (same row as the calories), so allergens.csv is complete.

The script stops (SystemExit) if a guide's rows change (counts, sections, unknown icon, unknown label, a calorie form it doesn't know).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cafe_concerto_pdf as pdf_reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "cafe-concerto"
PAGE_URL = "https://www.caffeconcerto.co.uk/allergens"
# file name -> (rows the grid has, section banner it prints, category used). The banner texts are printed as shown (including the
# guide's own typo "COCTAILS").
PDFS = {
    "BREAKFAST+MENU+new.pdf": (38, "Breakfast Menu", "Breakfast"),
    "Lunch+Menu+new.pdf": (52, "Lunch Menu", "Lunch"),
    "CAKES++new.pdf": (42, "CAKES", "Cakes & pastries"),
    "HOT+AND+COLD+DRINKS+new.pdf": (43, "HOT AND COLD DRINKS", "Hot & cold drinks"),
    "COCKTAILS+AND+MOCKTAILS_ALLERGENS.pdf": (34, "COCTAILS AND MOCKTAILS", "Cocktails & mocktails"),
    "AFTERNOON+TEA+AND+CREAM+TEA_allergens.pdf": (3, "AFTERNOON TEA AND CREAM TEA", "Afternoon tea"),
}
SHARED = "Breakfast & lunch"  # the same dish, same figure and same marks in both the Breakfast and the Lunch guide
CATEGORY_ORDER = [SHARED, "Breakfast", "Lunch", "Cakes & pastries", "Hot & cold drinks", "Cocktails & mocktails"]
EXPECTED_ITEMS = 176  # published rows after merging shared dishes and splitting For one / For two (the held-back ones included)
EXPECTED_HELD_BACK = 2
EXPECTED_NO_CALORIES = 20  # printed without calories: listed in the report

SOURCE_TITLE = ("Caffè Concerto allergen guides with calories in the dish names: Breakfast, Lunch, Cakes, Hot and cold drinks "
                "(each \"Reviewed by Wiola on 25-02-2024\") and Cocktails and mocktails (undated; PDFs created February-April 2024)")
ALLERGEN_TITLE = ("Caffè Concerto Allergen Information: six allergen guides (Breakfast, Lunch, Afternoon tea, Cakes, Cocktails and mocktails, "
                  "Hot and cold drinks; four print \"Reviewed by Wiola on 25-02-2024\")")
NOTE = ("Caffè Concerto prints calories only, inside each dish's name in its allergen guides (reviewed February 2024), so protein, "
        "carbs and fat are not published. No serving size is given except the For one / For two options. Dishes and drinks without a "
        "printed calorie figure are not listed. Figures are as printed; whole pizzas and some sandwiches are very high.")

# ---- allergen columns: heading as printed -> allergen key (through common.allergen_words) ----
HEADINGS = {
    "celery": "celery & celeriac", "gluten": "cereals containing gluten", "crustaceans": "crustacean", "eggs": "eggs", "fish": "fish",
    "lupin": "lupin", "milk": "milk", "molluscs": "molluscs", "mustard": "mustard", "peanuts": "peanuts", "sesame": "sesame seeds",
    "soya": "soya", "sulphites": "sulphur dioxide (sulphites)", "nuts": "tree nuts",
}
EXTRA_WORDS = {"celery & celeriac": ("celery", None), "sulphur dioxide (sulphites)": ("sulphites", None)}
CEREAL_LABELS = {"Barley", "Kamut", "Oats", "Rye", "Spelt", "Wheat"}
NUT_LABELS = {"Almonds", "Brazil nuts", "Cashews", "Hazelnuts", "Macadamia nuts", "Pecans", "Pistachios", "Queensland nuts", "Walnut"}
# Species labels the guide prints beside a mark in these two cells: kept out of the data (the schema has no place for them), but a
# new one stops the run so a person looks.
SPECIES_LABELS = {
    "crustaceans": {"Crab", "Crayfish", "Lobster", "Prawns"},
    "molluscs": {"Clams", "Cuttlefish", "Mussels", "Octopus", "Oysters", "Scallops", "Snails", "Squid", "Whelks"},
}

# ---- calories inside the dish name ----
MULTI = re.compile(r"\(\s*(?P<a>For\s+(?:One|Two))\s+kcal\s*(?P<an>\d+)\s*,\s*(?P<b>For\s+(?:One|Two))\s+(?P<bk>kcal\s*)?(?P<bn>\d+)\s*\)", re.I)
SINGLE_A = re.compile(r"\(\s*kcal\s*(?P<n>\d+)\s*\)\s*$", re.I)
SINGLE_B = re.compile(r"\(\s*(?P<n>\d+)\s*kcal\s*\)\s*$", re.I)
SMALL = {"and", "of", "with", "the", "a", "in", "on"}
PORK = re.compile(r"\b(bacon|ham|salami|pepperoni|sausages?|pork|chorizo|prosciutto|pancetta)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
VEG = re.compile(r"\b(vegan|vegetarian)\b", re.I)
# names that point at a meat dish without saying which meat (listed in the report only)
MEAT_UNSTATED = re.compile(r"\b(BLT|Croque|Full English|Capriciossa)\b", re.I)


def _title_word(w: str) -> str:
    """'(STRAWBERRY' -> '(Strawberry'; words without letters ('&', '-', '75') are left alone."""
    m = re.match(r"^([^A-Za-z]*)([A-Za-z].*)$", w)
    return w if not m else m.group(1) + m.group(2).capitalize()


def tidy(name: str) -> str:
    """Tidy spacing; Title Case only for names the guide prints in ALL CAPS."""
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"\(\s+", "(", name)
    name = re.sub(r"\s+\)", ")", name)
    if name.upper() == name:
        words = []
        for i, w in enumerate(name.split(" ")):
            words.append(w.lower() if (i and w.lower() in SMALL) else _title_word(w))
        name = " ".join(words)
    return name


def parse_name(raw: str):
    """-> list of (name suffix/serving or '', kcal, unit_printed) or None when the name carries no calories."""
    raw = re.sub(r"\s+", " ", raw).strip()
    m = MULTI.search(raw)
    if m:
        base = raw[:m.start()].strip()
        opts = [(m.group("a"), m.group("an"), True), (m.group("b"), m.group("bn"), bool(m.group("bk")))]
        if raw[m.end():].strip():
            raise SystemExit(f"{raw!r}: text after the calories")
        if opts[0][0].lower() == opts[1][0].lower():
            raise SystemExit(f"{raw!r}: the two options have the same label")
        return base, [(re.sub(r"\s+", " ", lbl).lower().capitalize(), n, unit) for lbl, n, unit in opts]
    for rx in (SINGLE_A, SINGLE_B):
        m = rx.search(raw)
        if m:
            return raw[:m.start()].strip(), [("", m.group("n"), True)]
    if re.search(r"kcal", raw, re.I):
        raise SystemExit(f"{raw!r}: a calorie form this script does not know: update the patterns after reading the guide")
    return None


def allergens_for(row: dict, where: str) -> dict:
    contains, may, cereals, nuts = set(), set(), set(), set()
    marks = row["marks"]
    if "none" in marks:
        if len(marks) != 1 or marks["none"][0]["meanings"] != ["contains"] or len(marks["none"]) != 1:
            raise SystemExit(f"{where}: NO ALLERGENS ticked together with something else")
        return {"contains": set(), "may_contain": set(), "cereals": set(), "nuts": set()}
    if not marks:
        raise SystemExit(f"{where}: no mark in any column (not even NO ALLERGENS)")
    for col, lines in marks.items():
        key = next(iter(allergen_words([HEADINGS[col]], where, EXTRA_WORDS)[0]))
        ticked_here = False
        may_here = False
        for ln in lines:
            meanings = [m for m in ln["meanings"] if m != "removable"]
            if "removable" in ln["meanings"] and len(ln["meanings"]) == 1:
                raise SystemExit(f"{where}: a Removable icon alone in the {col} cell: read the guide")
            if meanings not in (["contains"], ["may"]):
                raise SystemExit(f"{where}: unexpected icons {ln['meanings']} in the {col} cell")
            label = ln["label"]
            if col == "gluten" and label not in CEREAL_LABELS or col == "nuts" and label not in NUT_LABELS:
                raise SystemExit(f"{where}: unknown {col} label {label!r}")
            if col in SPECIES_LABELS and label not in SPECIES_LABELS[col]:
                raise SystemExit(f"{where}: unknown {col} label {label!r}")
            if col not in ("gluten", "nuts") and col not in SPECIES_LABELS and (label or len(lines) != 1):
                raise SystemExit(f"{where}: unexpected label {label!r} / several marks in the {col} cell")
            if meanings == ["contains"]:
                ticked_here = True
                if col == "gluten":
                    cereals |= allergen_words([label.lower()], where)[1]
                if col == "nuts":
                    nuts |= allergen_words([label.lower()], where)[2]
            else:
                may_here = True
        if ticked_here:
            contains.add(key)
        if may_here:
            may.add(key)
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


def build(pdf_dir: Path):
    seen = {}  # (tidied name, suffix) -> record
    order = []
    report, no_calories = [], []
    for fname, (expected_rows, banner, category) in PDFS.items():
        rows = pdf_reader.read_pdf(pdf_dir / fname)
        if len(rows) != expected_rows:
            raise SystemExit(f"{fname}: {len(rows)} rows but this script expects {expected_rows}: the guide changed, re-check it")
        for r in rows:
            if r["section"] != banner:
                raise SystemExit(f"{fname} page {r['page']}: section {r['section']!r}, expected {banner!r}")
            parsed = parse_name(r["name"])
            if parsed is None:
                no_calories.append(f"{category}: {tidy(r['name'])}")
                continue
            base, options = parsed
            where = f"{fname} p{r['page']} {r['name']!r}"
            al = allergens_for(r, where)
            has_r = any("removable" in ln["meanings"] for ls in r["marks"].values() for ln in ls)
            for suffix, kcal, unit in options:
                name = tidy(base) + (f" ({suffix.lower()})" if suffix else "")
                key = name.lower()
                rec = {"name": name, "serving": suffix, "calories": kcal, "unit_printed": unit, "allergens": al, "category": category,
                       "printed": re.sub(r"\s+", " ", r["name"]).strip(), "pdfs": [fname], "removable": has_r}
                if key in seen:
                    old = seen[key]
                    same = (old["calories"] == kcal and old["allergens"] == al and old["serving"] == suffix
                            and {old["category"], category} == {"Breakfast", "Lunch"})
                    if not same:
                        raise SystemExit(f"{where}: the same dish name is printed twice with different calories, marks or menus")
                    old["category"] = SHARED
                    old["pdfs"].append(fname)
                    continue
                seen[key] = rec
                order.append(key)
    recs = [seen[k] for k in order]
    recs.sort(key=lambda x: CATEGORY_ORDER.index(x["category"]) if x["category"] in CATEGORY_ORDER else 99)
    bad = [x["name"] for x in recs if x["category"] not in CATEGORY_ORDER]
    if bad:
        raise SystemExit(f"dishes in a category without a place in CATEGORY_ORDER: {bad}")
    items, holdback = [], []
    for x in recs:
        tags = []
        if VEG.search(x["name"]):
            tags.append("vegetarian")
        if PORK.search(x["name"]):
            tags.append("contains_pork")
        if BEEF.search(x["name"]):
            tags.append("contains_beef")
        if MEAT_UNSTATED.search(x["name"]) and not tags:
            report.append(f"meat type not stated: {x['name']}")
        notes = [f"Printed '{x['printed']}' in {', '.join(x['pdfs'])}"]
        if x["removable"]:
            notes.append("the guide's Removable (R) icon appears in one of this dish's cells")
        items.append({"name": x["name"], "category": x["category"], "serving": x["serving"], "calories": x["calories"],
                      "tags": "|".join(tags), "rankable": False, "notes": "; ".join(notes), "allergens": x["allergens"]})
        if not x["unit_printed"]:
            holdback.append((slug(x["name"]), f"The guide prints '{x['serving']} {x['calories']}' with no 'kcal' beside the number "
                                              "(the other option of this dish says kcal): not assumed."))
    return items, holdback, report, no_calories


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdfs", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDFs were downloaded/read")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    for fname in PDFS:
        if not (args.pdfs / fname).is_file():
            raise SystemExit(f"missing {args.pdfs / fname}: download the six PDFs linked from {PAGE_URL} (see the top of this file)")
        print(f"{fname} sha256 {sha256_file(args.pdfs / fname)}")
    items, holdback, report, no_calories = build(args.pdfs)
    if len(items) != EXPECTED_ITEMS or len(holdback) != EXPECTED_HELD_BACK or len(no_calories) != EXPECTED_NO_CALORIES:
        raise SystemExit(f"items {len(items)} (expected {EXPECTED_ITEMS}), held back {len(holdback)} (expected {EXPECTED_HELD_BACK}), "
                         f"without calories {len(no_calories)} (expected {EXPECTED_NO_CALORIES}): the guides changed, re-check")
    names = [slug(i["name"]) for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("two dishes have the same id")
    guide = {"title": ALLERGEN_TITLE, "url": PAGE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Caffè Concerto", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=["caffè concerto", "caffe concerto", "cafe concerto"], items=items,
                             out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    print("not published (no calories in the name): " + "; ".join(no_calories))
    counts = {c: sum(1 for i in items if i["category"] == c) for c in CATEGORY_ORDER}
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
