#!/usr/bin/env python3
"""Build data/source/soho-coffee-co/ from SOHO Coffee's official "Ingredient & Nutrition Guide (DRINKS)" PDF (UK stores).

    python3 tools/uk_extract/soho_coffee_co.py DRINKS.pdf --checked-on 2026-10-08 [--allergen-pdf MATRIX.pdf] [--out DIR]
    python3 tools/uk_extract/soho_coffee_co.py --fetch DIR --checked-on 2026-10-08     # download both PDFs into DIR first (1 request/s)

Sources (all linked from the chain's own page https://sohocoffee.com/allergens/ ; robots.txt there only disallows a WP Defender trap path):
    DRINKS.pdf  "Nutritional matrix - drinks - all stores": INGREDIENT & NUTRITION GUIDE (DRINKS), Version 4: 26th August 2026 (Autumn drinks)
        https://sohocoffee.com/wp-content/uploads/2026/08/2026-Nutritional-Matrix-Drinks-V4-Autumn-Drinks-26.08.26-1.pdf
        41 pages, text layer; served Last-Modified 2026-08-26; PDF created 2026-08-26.
    MATRIX.pdf  "Allergen Matrix - all stores": ALLERGEN GUIDE, footer "Version 10: 14th September 2026", file name V11 / 18.09.26
        https://sohocoffee.com/wp-content/uploads/2026/09/2026-Allergen-Matrix-V11-Autumn-18.09.26.pdf   (18 pages; Last-Modified 2026-09-18)
    Not used (read by eye on 2026-10-08, see below): the FOOD matrix, "Nutritional matrix - food - all stores", Version 11: 30th September 2026
        https://sohocoffee.com/wp-content/uploads/2026/09/2026-Nutritional-Matrix-Food-V11.pdf
Needs `pdftotext` and `pdftocairo` (poppler). The tables are read by position: see soho_coffee_co_pdf.py.

DRINKS ONLY, FULL NUTRITION. The drinks guide prints, per portion, kJ, kcal, fat, saturates, carbohydrates, sugars, fibre, protein and salt,
so the chain is published at the full level and every drink carries all nine printed columns. The food guide prints only kJ, kcal, fat,
saturates, sugars and salt (no protein, no carbohydrate), so it cannot be full; a chain is either full or calories-only (docs/DATA.md), and
a calories-only chain would have to leave the drinks' printed protein, carbs and fat blank. The drinks' complete figures win: the food is
left out and note.txt says so (the founder can decide later to publish SOHO as calories-only with the food added).

One item per size row the guide prints. "Latte (whole milk)" has Small / Regular / Large rows: three items, "Latte (whole milk), Small" etc.,
with `serving` = the size word as printed ("Reg" is printed on a few rows and is read as Regular). A drink printed with the size "N/A"
(Espresso, Cortado, Babyccino) or on pages without a Size column (add-ons, syrups, smoothies) has a blank serving; the add-ons and syrups
carry their own words ("Caramel (1 pump)") in the name and serving. Every milk is its own row, as the guide prints it (whole, skimmed, oat,
soya, coconut): the milk is part of the name. Names are the guide's own, tidied: "New Recipe" printed after a name is dropped (kept in
notes), "(soya miik)" is a typo for "(soya milk)", capitals of "(whole Milk)" and "Flat white" follow the other rows.

Excluded (written down, per the playbook): pages 39-41, the guide's "TRAVEL SPECIFIC" / "WESTFIELD SPECIFIC" sections (single-venue drinks:
The Green One, The Red One, The Tropical One smoothies, Praline Iced Chocolate in five milks, The Green One and The Orange One juices;
the page 39 subtitle reads "Westfield Specific"). Everything else on pages 4-37 is published: 171 products, one item per size row.

Tags: vegetarian when the row's Vegetarian? cell (or its Vegan? cell) is marked Y; contains_pork / contains_beef only when the row's own
ingredient text names pork / beef (Mini Marshmallows print "Pork Gelatine"). All drinks are `rankable = false`. The SEASONAL section
(Iced Praline Chocolate Cloud Cooler, Autumn drinks) is `limited_time`.

ALLERGENS: link only. SOHO's allergen matrix lists each drink once ("Latte", "House Mocha") with ticks for WHOLE milk, and says "For
alternative milks allergy info please see the specific section" (a separate page lists the milks themselves), while the nutrition guide
lists every milk as its own row and spells several names differently ("House 32% Mocha" against "House Mocha", "Iced 32% House Mocha"
against "Iced Mocha", "Iced Americano" against "Iced Long Black", Cloud Cooler against "Iced Chocolate Praline Cloud Cooler"). Getting
an oat-milk latte's allergens would mean combining two tables: allergens are safety information (docs/DATA.md "Allergens"), so no combining,
no name matching, no inference from the bold ingredient words: only the matrix's link is published. With --allergen-pdf the script counts
how many published items have a same-named matrix row and stops if that is ever all of them, so a human re-checks and switches it on.
The matrix has no per-item "may contain" column; its general sentence ("cannot guarantee ... cross-contamination") is not item data, so
may_contain_published is "no".

Rows held back (holdback.csv; nothing is corrected, the item is simply not published). The script decides by rule, from the printed cells:
  1. a cell that is not a number (the guide prints "0,3", "0/5", "0,0", "2.", "8,6" in single cells),
  2. printed kJ and kcal that contradict each other (more than 4% / 6 kJ from 4.184 kJ per kcal),
  3. saturates above total fat, or sugars above carbohydrate (more than 0.15 g),
  4. calories more than 20% (and 15 kcal) away from 4P+4C+9F of the row's own macros, the check docs/DATA.md applies to every chain
     (the pipeline itself warns from 15%; 20% leaves room for rounding, fibre and sugar alcohols).
The 1 pump of Brown Sugar syrup prints 6 kcal (25 kJ) beside 6.3 g of carbohydrate (about 25 kcal) and is held back by rule 4.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import soho_coffee_co_pdf as pdf_reader  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "soho-coffee-co"
CHAIN_NAME = "SOHO Coffee"
DRINKS_URL = "https://sohocoffee.com/wp-content/uploads/2026/08/2026-Nutritional-Matrix-Drinks-V4-Autumn-Drinks-26.08.26-1.pdf"
MATRIX_URL = "https://sohocoffee.com/wp-content/uploads/2026/09/2026-Allergen-Matrix-V11-Autumn-18.09.26.pdf"
SOURCE_TITLE = "SOHO Coffee Ingredient & Nutrition Guide (Drinks), Version 4: 26 August 2026 (UK stores, Autumn drinks)"
ALLERGEN_TITLE = "SOHO Coffee Allergen Guide (matrix), Version 10: 14 September 2026 (UK stores)"
ALIASES = ["soho coffee", "soho coffee co", "soho coffee company", "soho"]
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

COVER_VERSION = "Version4:26thAugust2026"
EXPECTED_DIVIDERS = ["SEASONAL", "COFFEE", "HOT & ICED CHOCOLATE", "MATCHA", "TEA & ADD ONS", "SMOOTHIES", "TRAVEL SPECIFIC",
                     "WESTFIELD SPECIFIC"]
EXCLUDED_SECTIONS = {"TRAVEL SPECIFIC", "WESTFIELD SPECIFIC"}     # single-venue drinks (pages 39-41)
EXPECTED_BLOCKS, EXPECTED_ROWS = 181, 223                          # everything the guide prints
EXPECTED_EXCLUDED_BLOCKS = 10                                      # page 39 (8 products) + page 41 (2 products)
EXPECTED_PUBLISHED_BLOCKS = 171
NOTE = ("Drinks only: SOHO's food guide prints calories without protein, carbs and fat, so food isn't listed. Figures are per drink as "
        "SOHO prints them, one row per milk and size; the guide says the milk brand can change. Drinks sold only at Westfield and travel "
        "sites aren't listed.")

# band heading as printed -> category shown. The SEASONAL section's band reads "Hot Coffee" in the PDF, but it holds the autumn drink.
CATEGORIES = {"Hot Coffee": "Hot coffee", "Iced Coffee": "Iced coffee", "Hot Chocolate": "Hot chocolate", "Iced Chocolate": "Iced chocolate",
              "Iced Matcha": "Iced matcha", "Hot Matcha": "Hot matcha", "Chai Latte": "Chai latte", "Drink Add Ons": "Drink add-ons",
              "Syrups": "Syrups", "Smoothies": "Smoothies"}
SEASONAL_CATEGORY = "Seasonal drinks"
# printed name fragment -> tidy (typos and capitals only; every use is recorded in the row's notes)
NAME_FIXES = [("(soya miik)", "(soya milk)"), ("(whole Milk)", "(whole milk)"), ("Flat white (", "Flat White (")]
NEW_RECIPE = re.compile(r"\s+New Recipe\s*$")
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
STD = re.compile(r"^<?\d+(?:\.\d+)?$")
LABELS = {"kj": "energy (kJ)", "kcal": "energy (kcal)", "fat": "fat", "sat": "saturates", "carbs": "carbohydrates", "sugars": "sugars",
          "fiber": "fibre", "protein": "protein", "salt": "salt"}


def tidy_name(printed: str):
    """(tidy name, [notes about what was changed])."""
    notes = []
    name = printed
    if NEW_RECIPE.search(name):
        name = NEW_RECIPE.sub("", name)
        notes.append("The guide prints 'New Recipe' after the name")
    for bad, good in NAME_FIXES:
        if bad in name:
            name = name.replace(bad, good)
            notes.append(f"Name tidied: the guide prints {bad.strip('( ')!r} in this name")
    return name.strip(), notes


def number(x: str):
    return float(x.lstrip("<")) if STD.match(x) else None


def hold_reasons(row: dict) -> list:
    """Why a printed row can't be published (see the module docstring), as plain sentences. Empty = fine."""
    bad = [(k, row[k]) for k in pdf_reader.FIELDS if not STD.match(row[k])]
    if bad:
        return [f"The guide prints {LABELS[k]} as '{v}', which is not a number, so the row can't be copied as printed." for k, v in bad]
    n = {k: number(row[k]) for k in pdf_reader.FIELDS}
    out = []
    exp = n["kcal"] * 4.184
    if abs(n["kj"] - exp) > max(6.0, 0.04 * exp):
        out.append(f"The guide prints {row['kcal']} kcal against {row['kj']} kJ ({row['kj']} kJ is about {n['kj'] / 4.184:.0f} kcal).")
    if n["sat"] > n["fat"] + 0.15:
        out.append(f"The guide prints saturates {row['sat']} g above total fat {row['fat']} g.")
    if n["sugars"] > n["carbs"] + 0.15:
        out.append(f"The guide prints sugars {row['sugars']} g above carbohydrate {row['carbs']} g.")
    est = 4 * n["protein"] + 4 * n["carbs"] + 9 * n["fat"]
    if abs(est - n["kcal"]) > max(0.20 * n["kcal"], 15.0):
        out.append(f"The guide prints {row['kcal']} kcal; its own macros add up to about {est:.0f} kcal.")
    return out


def size_notes(prev, cur: dict) -> list:
    """A larger size should not print less than the next smaller one (numbers are entered as printed either way)."""
    if not prev:
        return []
    lower = [LABELS[k] for k in ("kj", "kcal", "fat", "carbs", "protein") if STD.match(cur[k]) and STD.match(prev[k]) and number(cur[k]) < number(prev[k])]
    return [f"{cur['size']} prints less {', '.join(lower)} than {prev['size']}"] if lower else []


def build(drinks_pdf: Path):
    pages = pdf_reader.bbox_pages(drinks_pdf)
    version = pdf_reader.guide_version(pages)
    if version != COVER_VERSION:
        raise SystemExit(f"The guide's cover says {version!r}, this script was written for {COVER_VERSION!r}: re-check every rule here.")
    blocks, dividers = pdf_reader.read_drinks(drinks_pdf)
    if dividers != EXPECTED_DIVIDERS:
        raise SystemExit(f"The guide's sections are {dividers}, the script expects {EXPECTED_DIVIDERS}: a human re-checks CATEGORIES and the exclusions.")
    n_rows = sum(len(b["rows"]) for b in blocks)
    if (len(blocks), n_rows) != (EXPECTED_BLOCKS, EXPECTED_ROWS):
        raise SystemExit(f"The guide prints {len(blocks)} products / {n_rows} size rows, the script expects {EXPECTED_BLOCKS} / {EXPECTED_ROWS}: the guide changed, re-check.")
    kept = [b for b in blocks if b["section"] not in EXCLUDED_SECTIONS]
    excluded = [b for b in blocks if b["section"] in EXCLUDED_SECTIONS]
    if len(excluded) != EXPECTED_EXCLUDED_BLOCKS or len(kept) != EXPECTED_PUBLISHED_BLOCKS:
        raise SystemExit(f"{len(kept)} products published and {len(excluded)} excluded; expected {EXPECTED_PUBLISHED_BLOCKS} and {EXPECTED_EXCLUDED_BLOCKS}.")
    items, holdback, report = [], [], []
    seen_ids = set()
    for b in kept:
        printed_name = b["name"]
        name, name_notes = tidy_name(printed_name)
        if b["section"] == "SEASONAL":
            category, limited = SEASONAL_CATEGORY, True
        else:
            if b["band"] not in CATEGORIES:
                raise SystemExit(f"page {b['page']}: new category heading {b['band']!r}: add it to CATEGORIES.")
            category, limited = CATEGORIES[b["band"]], False
        if b["veg"] not in ("", "Y") or b["vegan"] not in ("", "Y"):
            raise SystemExit(f"page {b['page']}: {printed_name!r} has a flag other than Y: {b['veg']!r} {b['vegan']!r}")
        tags = ["vegetarian"] if (b["veg"] == "Y" or b["vegan"] == "Y") else []
        if PORK.search(b["ingredients"]) or PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(b["ingredients"]) or BEEF.search(name):
            tags.append("contains_beef")
        multi = len(b["rows"]) > 1
        prev = None
        for r in b["rows"]:
            sized = r["size"] not in ("", "N/A")
            full_name = f"{name}, {r['size']}" if multi else name
            serving = r["size"] if sized else ("1 pump" if "(1 pump)" in name else "")
            item_id = slug(full_name)
            if item_id in seen_ids:
                raise SystemExit(f"page {b['page']}: two items would both be {item_id!r} ({full_name!r}): re-check the names.")
            seen_ids.add(item_id)
            notes = list(name_notes) + size_notes(prev, r)
            if r["size"] == "N/A":
                notes.append("Size printed as N/A")
            if b["veg"] == "" and b["vegan"] == "" and not any(t == "vegetarian" for t in tags):
                notes.append("Not marked vegetarian in the guide")
            items.append({
                "id": item_id, "name": full_name, "category": category, "serving": serving,
                "calories": r["kcal"], "protein_g": r["protein"], "carbs_g": r["carbs"], "fat_g": r["fat"], "sat_fat_g": r["sat"],
                "sugar_g": r["sugars"], "fiber_g": r["fiber"], "salt_g": r["salt"], "energy_kj": r["kj"],
                "tags": "|".join(tags), "limited_time": limited, "rankable": False, "notes": "; ".join(notes),
                "_page": b["page"], "_printed": printed_name,
            })
            reasons = hold_reasons(r)
            if reasons:
                holdback.append((item_id, " ".join(reasons)))
            prev = r
    # the printed values must not be rounded by anything here: a whole-number kcal is expected, others are reported
    for it in items:
        if not re.fullmatch(r"\d+", it["calories"]):
            report.append(f"{it['name']}: calories printed as {it['calories']!r} (the pipeline rounds half up to a whole number)")
    return items, holdback, report, excluded, blocks


def matrix_names(matrix_pdf: Path) -> list:
    """Product names printed on the drinks pages of the allergen matrix (first cell of each row), for the same-name check."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "m.txt"
        subprocess.run(["pdftotext", "-layout", str(matrix_pdf), str(out)], check=True)
        pages = out.read_text(encoding="utf-8").split("\f")
    names = []
    for text in pages:
        lines = [l for l in text.split("\n") if l.strip()]
        head = re.split(r"\s{2,}", lines[0].strip())[0] if lines else ""
        if head not in ("SEASONAL DRINKS", "HOT DRINKS", "COLD DRINKS", "ALTERNATIVE MILKS"):
            continue
        started = False
        for l in lines:
            first = re.split(r"\s{2,}", l.strip())[0]
            if first == "Product":
                started = True
                continue
            if not started or first.startswith("Our food is handmade") or "allergen info" in first:
                continue
            names.append(first)
    return names


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def fetch(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if not data.startswith(b"%PDF"):
        raise SystemExit(f"{url} did not return a PDF")
    dest.write_bytes(data)
    time.sleep(1.2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("drinks_pdf", type=Path, nargs="?")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the PDFs with the live page")
    ap.add_argument("--allergen-pdf", type=Path, default=None, help="the allergen matrix PDF (only used for the same-name check)")
    ap.add_argument("--fetch", type=Path, default=None, help="download both PDFs into this folder first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.fetch.mkdir(parents=True, exist_ok=True)
        args.drinks_pdf = args.fetch / "drinks.pdf"
        args.allergen_pdf = args.fetch / "allergen-matrix.pdf"
        fetch(DRINKS_URL, args.drinks_pdf)
        fetch(MATRIX_URL, args.allergen_pdf)
    if not args.drinks_pdf:
        ap.error("give the drinks PDF, or --fetch DIR")
    items, holdback, report, excluded, blocks = build(args.drinks_pdf)
    if args.allergen_pdf:
        names = {norm(n) for n in matrix_names(args.allergen_pdf)}
        same = [it for it in items if norm(it["name"].split(", ")[0] if re.search(r", (Small|Regular|Large)$", it["name"]) else it["name"]) in names]
        report.append(f"allergen matrix: {len(same)} of {len(items)} published items have a same-named row ({len(names)} names in the matrix's drink pages): "
                      + ", ".join(it["name"] for it in same))
        if len(same) == len(items):
            raise SystemExit("Every published item has a same-named row in the allergen matrix: re-check it by eye and switch allergens on in this script.")
    out = write_chain_folder(
        chain_id=CHAIN_ID, name=CHAIN_NAME, cuisine="Coffee", source_title=SOURCE_TITLE, source_url=DRINKS_URL,
        checked_on=args.checked_on, aliases=ALIASES, items=[{k: v for k, v in it.items() if not k.startswith("_")} for it in items],
        out=args.out, note=NOTE, holdback=holdback,
        allergen_guide={"title": ALLERGEN_TITLE, "url": MATRIX_URL, "checked_on": args.checked_on, "may_contain_published": False})
    print(f"drinks.pdf sha256 {sha256_file(args.drinks_pdf)}")
    if args.allergen_pdf:
        print(f"allergen matrix sha256 {sha256_file(args.allergen_pdf)}")
    print(f"excluded (single-venue): {', '.join(e['name'] for e in excluded)}")
    print("\n".join(report))
    for item_id, why in holdback:
        print(f"HELD BACK {item_id}: {why}")
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
