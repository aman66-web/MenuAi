#!/usr/bin/env python3
"""Build data/source/wasabi/ from Wasabi's official nutritional information guide (a CALORIES-ONLY chain).

    python3 tools/uk_extract/wasabi.py path/to/guide.pdf --checked-on 2026-10-07 [--per-item-allergens] [--out DIR]

Source (the file Wasabi's own website links as its nutrition guide):
    https://www.wasabi.uk.com/wp-content/uploads/2026/09/WAS_Nutritional_Guide_210926v3.pdf
    "nutritional information, Version 34, Released 17th September 2026" (28 pages, text layer; PDF created 2026-09-21,
    served Last-Modified 2026-09-23). robots.txt allows it (Crawl-delay 10; one download). The pages are read by position:
    see wasabi_pdf.py. Needs `pdftotext` (poppler).

WHAT THE GUIDE PRINTS (and what is published)
    Energy is printed per 100 g, in kJ per 100 g and in kcal PER PORTION. Protein, carbohydrate, sugar, fat, saturates and salt are
    printed per 100 g ONLY. Per-100 g figures are not per-serving figures and we never convert them, so the chain is calories-only
    (docs/DATA.md "Calories-only chains"): calories = the printed kcal per portion; weight_g = the printed portion size in grams;
    protein, carbs, fat, sat fat, sugar, salt and kJ stay blank. The per-100 g figures are used for one thing only: a consistency
    check that stops the run when a row's printed per-portion energy contradicts its own per-100 g energy and weight (below).

How rows become items
  * One item per row and size. Bain marie rows print a standard AND a large portion (own kcal and grams each): two items, named
    "... (standard)" / "... (large)" with serving Standard / Large; a bain marie row with no large portion is one item. The platters
    print kcal per portion (one of 4) AND kcal per pack: two items ("..." = one portion with its 286 g, "... (whole platter)" =
    the pack; the pack weight is not printed, so it stays blank, nothing is multiplied).
  * Names: as printed, whitespace tidied, a few printed typos fixed (NAME_FIXES, each recorded in the item's notes). When the same
    name is printed in two sections with different or identical figures (bain marie / hot cabinet / hot sides) the section is
    added in brackets. Mixed bento rows print the base in a second column: "(with rice)" / "(with yakisoba noodles)".
  * Not listed: bain marie "Curry sauce" (no portion size or portion energy printed: n/a) and the Ponzu sachet's "for counter
    salad" energy (2.1 kcal, no portion size printed, not a whole number).
  * Tags: vegetarian when the row's "Suitable for Vegetarians" mark is Y; contains_pork / contains_beef only when the dish NAME
    says so (bacon, sausage, beef). The mixed bento tables print no dietary marks, so those items carry no tags.
  * rankable is false for everything (calories-only chain).

Rows held back (HOLDBACK): rows whose own printed numbers contradict each other, found by `problems()` and listed with the reason.
The script stops if the set of rows with such problems changes, so a human decides about every new one.

Allergens (docs/DATA.md "Allergens"). The guide prints, for every row of every table except the 29 MIXED BENTO rows (pages 15-17
carry no allergen or dietary columns at all), the allergens of the product as the guide's own key letters (WG, BG, Cel, C, E, F,
L, Mi, Mo, Mu, TN, PN, SS, S, So2) plus, on sushi, salad and platter rows, a second cell "condiments only", and free text on
drinks and pots ("May contain milk", "Oats (may contain gluten)"...). Allergens are all or nothing, so by default only the
guide's link is published (allergen_guide.csv, `may_contain_published = yes`: some rows print "may contain").
`--per-item-allergens` instead DROPS the 29 mixed bento items and publishes allergens.csv for every other item:
    contains = the product cell plus the condiments cell of the same row (an item is sold with its sachets: the with-dressing
               rows' weights and energy include the dressing),
    may_contain = the guide's own "may contain" text (never inferred).
Every allergen text must be one of the printed key letters or one of the exact phrases in PHRASES; anything else stops the run.
The key letters are checked on every run in both modes.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wasabi_pdf as pdf_reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "wasabi"
SOURCE_URL = "https://www.wasabi.uk.com/wp-content/uploads/2026/09/WAS_Nutritional_Guide_210926v3.pdf"
SOURCE_TITLE = "Wasabi nutritional information guide, Version 34 (released 17 September 2026)"
ALLERGEN_GUIDE_TITLE = "Wasabi nutritional information guide, Version 34 (released 17 September 2026): allergen columns and key"
ALIASES = ["wasabi", "wasabi sushi & bento", "wasabi sushi and bento", "wasabi sushi bento"]
NOTE = ("Wasabi prints calories per portion, but protein, carbs, fat, sugar and salt only per 100 g, so only calories and the portion "
        "weight are published. Rows marked (excl. dressing) leave the sachet or dressing out; sachets and sauces are listed separately.")
EXPECTED_ITEMS = 214            # items built from the 199 table rows (see build_items)
EXPECTED_MIXED_BENTO = 29       # rows of pages 15-17 (no allergen columns)

# Printed typos in item names (the numbers are never touched). The fix is recorded in the item's notes.
NAME_FIXES = {
    "Cappucino 16oz (semi skimmed milk)": "Cappuccino 16oz (semi skimmed milk)",
    "White Americano 16oz (oat mikl)": "White Americano 16oz (oat milk)",
    "White Americano 12oz (oat mikl)": "White Americano 12oz (oat milk)",
    "Hot vegetable gyoza (Fried- 2 pieces)": "Hot vegetable gyoza (Fried - 2 pieces)",
    "Chicken katsu curry+ Curry sauce": "Chicken katsu curry + Curry sauce",
}
# The header words of every table (sha1 of the sorted lower-case words): a changed column set stops the run.
HEADER_SIGNATURES = {
    (4, 0): "75b96235bc8a", (5, 0): "75b96235bc8a", (6, 0): "75b96235bc8a", (7, 0): "75b96235bc8a", (8, 0): "fb76abb168d7",
    (9, 0): "be0118764541", (10, 0): "be0118764541", (11, 0): "b1a4e763567c", (12, 0): "7d68eed2f329", (12, 1): "7d68eed2f329",
    (12, 2): "7d68eed2f329", (13, 0): "052537bc0a27", (14, 0): "052537bc0a27", (15, 0): "dc8e58075cac", (16, 0): "dc8e58075cac",
    (17, 0): "dc8e58075cac", (18, 0): "7d68eed2f329", (19, 0): "7d68eed2f329", (20, 0): "7d68eed2f329", (21, 0): "be0118764541",
    (22, 0): "7d68eed2f329", (23, 0): "37a634611638", (24, 0): "7d68eed2f329", (25, 0): "7d68eed2f329", (25, 1): "7d68eed2f329",
    (26, 0): "7d68eed2f329", (27, 0): "9c0a448c2e1c", (28, 0): "fad865e9d269",
}
# Rows (page, printed name) whose own numbers contradict each other; every item built from the row is held back.
HOLDBACK = {
    (9, "Chicken katsu tasting box (excl. dressing)"):
        "Printed energy per portion (817 kcal) contradicts the same row's per-100 g energy and weight (161 kcal per 100 g x 478 g is about 770 kcal; the with-dressing row, 508 g, is consistent at 825 kcal).",
    (13, "Tofu curry yakisoba bento"):
        "The row's kcal figure (172 kcal per 100 g) is about 55% above its own kJ (453 kJ per 100 g = 108 kcal) and above its protein, carbohydrate and fat (about 118 kcal per 100 g); the portion energy follows the kcal figure.",
    (16, "Tofu curry + Sweet chilli chicken"):
        "The row's kcal figure (154 kcal per 100 g) is about 18% above its own kJ (526 kJ per 100 g = 126 kcal) and about 15% above its protein, carbohydrate and fat (about 130 kcal per 100 g), which agree with each other; the portion energy (769 kcal) follows the kcal figure.",
    (18, "Tofu curry yakisoba bento"):
        "The row's kcal figure (164 kcal per 100 g) is about 50% above its own kJ (449 kJ per 100 g = 107 kcal) and above its protein, carbohydrate and fat (about 116 kcal per 100 g); the portion energy follows the kcal figure.",
    (25, "Babyccino"):
        "Printed energy per portion (206 kcal) is the kJ figure: the row prints 49 kcal per 100 g and a 100 g portion.",
    (26, "Semi skimmed milk"):
        "Printed energy per portion (206 kcal) is the kJ figure: the row prints 49 kcal per 100 g and a 100 g portion.",
    (26, "Oat milk"):
        "Printed energy per portion (247 kcal) is the kJ figure: the row prints 59 kcal per 100 g and a 100 g portion.",
}

PORK = re.compile(r"\b(pork|bacon|ham|sausage|chorizo|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)

# --------------------------------------------------------------------------------------------------------------- allergens
# The guide's own key: "Barley Gluten (BG), Celery & celeriac (Cel), Crustaceans (C), Egg (E), Fish (F), Lupin (L), Milk (Mi),
# Mollusc (Mo), Mustard (Mu), Tree nuts (TN), Peanut (PN), Sesame Seeds (SS), Soya (S), Sulphur Dioxide/Sulphite (So2),
# Wheat gluten (WG)". "Oats" is printed in words on porridge pots (common._A knows it).
KEY = {"wg": ("gluten", "wheat"), "bg": ("gluten", "barley"), "cel": ("celery", None), "c": ("crustaceans", None), "e": ("eggs", None),
       "f": ("fish", None), "l": ("lupin", None), "mi": ("milk", None), "mo": ("molluscs", None), "mu": ("mustard", None),
       "tn": ("nuts", None), "pn": ("peanuts", None), "ss": ("sesame", None), "s": ("soya", None), "so2": ("sulphites", None)}
# Free text the guide prints in an allergen cell (lower case, single spaces) -> (words that are contained, words that may be
# contained). Nothing else is accepted.
PHRASES = {
    "may contain milk": ([], ["milk"]),
    "may contain gluten from oats & milk": ([], ["gluten", "milk"]),
    "mi, oats (may contain nuts, peanuts, wheat gluten)": (["mi", "oats"], ["nuts", "peanuts", "gluten"]),
    "oats (may contain gluten)": (["oats"], ["gluten"]),
    # The guide marks WG and adds "not suitable for soy allergy" although no soya letter is printed: the safe reading is that the
    # item may contain soya (never silently dropped).
    "wg (not suitable for soy allergy)": (["wg"], ["soya"]),
}


def parse_cell(text: str, where: str) -> tuple[set, set, set, set]:
    """One allergen cell -> (contains keys, may-contain keys, cereals, nuts). 'n/a' = the guide lists none."""
    t = " ".join(text.replace("S o 2", "So2").split())  # pdftotext splits "So2" into three words on one row
    if t.lower() in ("n/a", ""):
        return set(), set(), set(), set()
    contains_words, may_words = PHRASES.get(t.lower(), (None, None))
    if contains_words is None:
        contains_words, may_words = [w for w in t.split(",")], []
    keys, cereals, nuts = allergen_words(contains_words, where, extra=KEY)
    may_keys, _, _ = allergen_words(may_words, where, extra=KEY)
    return keys, may_keys, cereals, nuts


def allergens_for(row: dict) -> dict:
    where = f"page {row['page']} {row['name']!r}"
    text = row["allergens"]
    condiments = row["condiments"]
    if "Condiments only" in text:  # hot sides print the condiments line inside the one allergen cell
        text, condiments = [x.strip() for x in text.split("Condiments only", 1)]
    keys, may, cereals, nuts = parse_cell(text, where)
    ckeys, cmay, ccereals, cnuts = parse_cell(condiments, where + " condiments")
    out = dict(contains=keys | ckeys, may_contain=may | cmay, cereals=cereals | ccereals, nuts=nuts | cnuts)
    # the guide's "Contains Gluten" mark must agree with the letters (the mark covers the product, the letters may add condiments)
    flag = row["cells"].get("gluten", "").rstrip("*")
    if flag == "Y" and "gluten" not in (out["contains"] | out["may_contain"]):
        raise SystemExit(f"{where}: 'Contains Gluten' is Y but no gluten allergen is printed")
    if flag == "N" and "gluten" in keys:
        raise SystemExit(f"{where}: 'Contains Gluten' is N but the product cell prints a gluten allergen")
    return out


# ---------------------------------------------------------------------------------------------------------------- checks
def num(s: str):
    return float(s) if re.match(r"^\d+(\.\d+)?$", s) else None


def problems(row: dict) -> list[str]:
    """Contradictions inside one printed row. Used only to detect typos in the guide, never to publish a derived number."""
    c, out = row["cells"], []
    sizes = [("kcal_std", "w_std", "standard"), ("kcal_large", "w_large", "large")] if row["layout"] == "bain" else [("kcal", "weight", "portion")]
    k100 = num(c["kcal100"])
    for kc, wc, label in sizes:
        k, w = num(c[kc]), num(c[wc])
        if None in (k, w, k100):
            continue
        expected = k100 * w / 100
        if abs(k - expected) > 4 and abs(k - expected) / max(expected, 1) > 0.06:
            out.append(f"{label} energy {k:g} kcal vs {k100:g} kcal per 100 g x {w:g} g = {expected:.0f}")
    kj, p, cb, f = (num(c[x]) for x in ("kj100", "protein100", "carbs100", "fat100"))
    if None not in (k100, kj, p, cb, f) and k100 >= 20:
        from_kj, from_macros = kj / 4.184, 4 * p + 4 * cb + 9 * f
        # "agrees" means within 15% (accuracy re-check of 8 Oct 2026): a kJ figure that disagrees alone is not a reason to hold a row back
        # (we publish no kJ), but a kcal figure that more than 15% off BOTH its kJ and its own protein + carbs + fat, while those two agree with
        # each other, is contradicted by the guide's own row.
        far = lambda a, b: abs(a - b) / max(a, 1) > 0.15  # noqa: E731
        if far(k100, from_kj) and far(k100, from_macros) and abs(from_kj - from_macros) / max(from_kj, from_macros) < 0.15 and from_macros < 1000:
            out.append(f"{k100:g} kcal per 100 g vs {kj:g} kJ ({from_kj:.0f} kcal) and macros ({from_macros:.0f} kcal)")
    return out


# ------------------------------------------------------------------------------------------------------------------ items
def build_items(rows: list[dict], per_item_allergens: bool) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    items: list[dict] = []
    skipped: list[str] = []
    problem_rows = {}
    for row in rows:
        printed = " ".join(row["name"].split())
        if problems(row):
            problem_rows[(row["page"], printed)] = problems(row)
    if set(problem_rows) != set(HOLDBACK):
        raise SystemExit("Rows whose own numbers contradict each other changed.\n  found: " + "; ".join(f"p{p} {n}: {m}" for (p, n), m in sorted(problem_rows.items()))
                         + f"\n  held back in HOLDBACK: {sorted(HOLDBACK)}\nDecide about each difference, then update HOLDBACK.")
    allergens_by_row: dict[int, dict] = {}
    for i, row in enumerate(rows):
        if row["layout"] != "mixed":
            allergens_by_row[i] = allergens_for(row)  # parsed (and checked) in both modes
    for i, row in enumerate(rows):
        c = row["cells"]
        printed = " ".join(row["name"].split())
        name = NAME_FIXES.get(printed, printed)
        notes = [f"Guide page {row['page']}"]
        if name != printed:
            notes.append(f"printed '{printed}'")
        tags = []
        if row["layout"] != "mixed" and (c["veg"].startswith("Y") or c["vegan"].startswith("Y")):
            tags.append("vegetarian")
        if PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        held = (row["page"], printed) in HOLDBACK
        base = dict(category=row["category"], tags="|".join(tags), rankable=False, section=row["category"], row_key=(row["page"], printed),
                    allergens=allergens_by_row.get(i), held=held)
        if row["layout"] == "mixed":
            if per_item_allergens:
                continue
            name = f"{name} (with {row['base'].lower()})"
            items.append(dict(base, name=name, calories=c["kcal"], weight_g=c["weight"], notes="; ".join(notes)))
        elif row["layout"] == "bain":
            if num(c["kcal_std"]) is None:
                skipped.append(f"p{row['page']} {printed}: no portion energy or size printed (n/a)")
                continue
            two = num(c["kcal_large"]) is not None
            items.append(dict(base, name=name + (" (standard)" if two else ""), serving="Standard" if two else "", calories=c["kcal_std"],
                              weight_g=c["w_std"], notes="; ".join(notes)))
            if two:
                items.append(dict(base, name=name + " (large)", serving="Large", calories=c["kcal_large"], weight_g=c["w_large"], notes="; ".join(notes)))
        elif row["layout"] == "platter":
            n = c["servings"]
            items.append(dict(base, name=name, serving=f"1 portion (of {n})", calories=c["kcal"], weight_g=c["weight"], notes="; ".join(notes)))
            pack = name[: -len(" (excl. dressing)")] + " (whole platter, excl. dressing)" if name.endswith(" (excl. dressing)") else name + " (whole platter)"
            items.append(dict(base, name=pack, serving=f"Whole platter ({n} portions)", calories=c["kcal_pack"], weight_g="",
                              notes="; ".join(notes + ["energy per pack as printed; pack weight not printed"])))
        else:
            if num(c["kcal"]) is None or num(c["weight"]) is None:
                raise SystemExit(f"Page {row['page']} {printed!r}: no portion energy/size ({c['kcal']!r}, {c['weight']!r})")
            if row["layout"] in ("sauce27", "sauce28") and num(c["kcal_counter"]) is not None:
                skipped.append(f"p{row['page']} {printed}: 'for counter salad' energy {c['kcal_counter']} kcal printed with no portion size (n/a) and not a whole number")
            items.append(dict(base, name=name, calories=c["kcal"], weight_g=c["weight"], notes="; ".join(notes)))
    # Disambiguate names printed in two sections (the figures may differ): add the section in brackets.
    counts: dict[str, int] = {}
    for it in items:
        counts[it["name"].lower()] = counts.get(it["name"].lower(), 0) + 1
    for it in items:
        if counts[it["name"].lower()] > 1:
            it["name"] = f"{it['name']} ({it['section'].lower()})"
            it["notes"] += "; same name printed in another section"
    names = [it["name"].lower() for it in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique after adding sections: " + str(sorted({n for n in names if names.count(n) > 1})))
    expected = EXPECTED_ITEMS - (EXPECTED_MIXED_BENTO if per_item_allergens else 0)
    if len(items) != expected:
        raise SystemExit(f"Expected {expected} items, built {len(items)}: the guide changed, re-check the script")
    for it in items:  # ids first (write_chain_folder derives them the same way), then the holdback list
        it["id"] = slug(it["name"])
    ids = [it["id"] for it in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids clash: " + str(sorted({i for i in ids if ids.count(i) > 1})))
    holdback = [(it["id"], HOLDBACK[it["row_key"]]) for it in items if it["held"]]
    return items, holdback, skipped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--per-item-allergens", action="store_true",
                    help="publish per-item allergens and drop the 29 mixed bento items (they print no allergens): see the docstring")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"guide PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    rows, _ = pdf_reader.read_tables(args.pdf, expected_headers=HEADER_SIGNATURES)
    mixed = sum(1 for r in rows if r["layout"] == "mixed")
    if mixed != EXPECTED_MIXED_BENTO:
        raise SystemExit(f"Expected {EXPECTED_MIXED_BENTO} mixed bento rows, found {mixed}")
    items, holdback, skipped = build_items(rows, args.per_item_allergens)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    for it in items:
        if not args.per_item_allergens:
            it["allergens"] = None  # link only: the 29 mixed bento rows print no allergens, so all or nothing
    out = write_chain_folder(chain_id=CHAIN_ID, name="Wasabi", cuisine="Japanese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    cats: dict[str, int] = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print("allergens: " + ("per item (mixed bento dropped)" if args.per_item_allergens else "guide link only (mixed bento prints none)"))
    for s in skipped:
        print("not listed: " + s)


if __name__ == "__main__":
    main()
