#!/usr/bin/env python3
"""Build data/source/maroush/ from Maroush's official "Allergen & Calorie Menu" (a CALORIES-ONLY chain, allergens link-only).

    python3 tools/uk_extract/maroush.py path/to/Maroush-Allergen-Calorie-Menu-Sep-26.pdf --checked-on 2026-10-08 \
        [--page-html path/to/allergen-and-calorie.html] [--out DIR]

Source (the file the chain's own page https://www.maroush.com/allergen-and-calorie/ links as "Open the Allergen & Calorie Menu (PDF)"):
    https://www.maroush.com/wp-content/uploads/2026/09/Maroush-Allergen-Calorie-Menu-Sep-26.pdf
    6 pages, text layer; cover "SEPTEMBER 2026 / Version 01 - verification copy"; footer "Source: Maroush House Menu 2024 V10/SAN |
    Prepared September 2026"; served Last-Modified 2026-09-11. robots.txt of maroush.com: "Allow: /" (one page and one PDF fetched).
Needs `pdftotext` and `pdftoppm` (poppler); the table is read by position and the allergen dots by pixel sampling: see maroush_pdf.py.

The guide prints ONE calorie figure per dish (column "CALORIES (KCAL)") and no protein, carbohydrate, fat, salt, weight or kJ, so every
item is calories-only (docs/DATA.md "Calories-only chains"). Calories are copied as printed. Only names, categories and tags are written
here: the script stops if the sections, the number of rows in a section or the number of dishes with a calorie figure differ from
EXPECTED below, so a human re-checks this file when Maroush publishes a new guide.

Independent check of the calories (done with --page-html): the same chain page that links the PDF also prints an HTML table of the same
dishes ("Menu Item | Dietary | Calories | Notes"). All 92 calorie figures and every V / VG mark in the PDF equal that table's.

What is published, what is not:
- 92 dishes with a printed calorie figure. Soft drinks, water, coffee and tea (30 rows: Soda ... Peppermint Tea) print "-" for calories and
  are NOT listed (no figure printed: nothing is filled in).
- Names are the PDF's, with two changes that use the chain's own page of the same guide: the 12 dishes under "SANDWICHES OR WRAPS"
  are printed there as "Falafel Wrap", "Shawarma Lamb Wrap" ... (the PDF prints just "Falafel", "Shawarma Lamb", which are also dishes in
  other sections), and the juices are "Fresh Orange Juice", "Mango Juice", "Fruit Cocktail Juice" (the PDF prints "Fresh Orange",
  "Mango", "Fruit Cocktail"). With --page-html the script checks every changed name against that page.
- No serving is printed in the PDF. Sizes that are part of the printed name are copied ("Baklawa 140g": serving "140 g", weight_g 140);
  the set menus are "Total for 2" / "Total for 4" on the chain's page. No portion is stated for any other dish, so serving stays blank.
- Tags: vegetarian where the guide prints V or VG. No item name says pork or beef (the page's notes say lamb or chicken for many dishes;
  Maqaneq and Soujok are "Lebanese sausages" with no meat type stated), so no contains_pork / contains_beef.

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. The guide has a complete 14-allergen dot matrix, but:
  1. its own text says it is a draft: cover "Version 01 - verification copy"; page 6 "Verification required before customer issue. This
     draft was transcribed from the published Maroush House Menu 2024 V10/SAN. It must be checked against current standard recipes,
     ingredient labels and supplier specifications" and "If the current recipe or ingredient information cannot be confirmed, the dish
     should not be served";
  2. the chain's own page table for the same dishes contradicts the dots: it says Kibbeh "Contains ... Pine nuts", Fattet Hommos
     B'laban "Contains Milk, Gluten, Nuts" and Sambousek Lamb "Contains Gluten, Pine nuts", and the PDF has no Nuts dot on any of the three;
  3. "Gluten" is wheat only and bread is counted as gluten by section, a blank cell "is not a free-from claim", no may-contain is printed.
Allergens are safety information: an unverified draft that disagrees with the chain's other table is not copied (all or nothing).
The dots are still read on every run (maroush_pdf.read_rows) and the run STOPS if the PDF stops saying it is a verification copy, so a
human decides then whether to publish them (the data is already read: add write_allergens rows from `dots`).
"""
from __future__ import annotations
import argparse
import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import maroush_pdf as pdf_reader  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "maroush"
SOURCE_URL = "https://www.maroush.com/wp-content/uploads/2026/09/Maroush-Allergen-Calorie-Menu-Sep-26.pdf"
SOURCE_TITLE = "Maroush Allergen & Calorie Menu, September 2026 (Version 01 - verification copy; PDF last modified 11 September 2026)"
PAGE_URL = "https://www.maroush.com/allergen-and-calorie/"
ALIASES = ["maroush", "maroush restaurant"]
ALLERGEN_GUIDE_TITLE = "Maroush Allergen & Calorie Menu, September 2026 (marked Version 01 - verification copy)"
MAY_CONTAIN_PUBLISHED = False  # only a general cross-contact statement, no per-dish may-contain
NOTE = ("Calories only, per dish as served: the guide prints no protein, carbs or fat. The guide is marked 'Version 01 - verification "
        "copy' (September 2026). Soft drinks, tea and coffee print no calories and are not listed. Set menus are totals for 2 or 4.")

# Section heading as printed -> (category, rows in the section, rows with a calorie figure).
EXPECTED = {
    "COLD MEZZA": ("Cold Mezza", 14, 14),
    "SOUPS": ("Soups", 2, 2),
    "HOT MEZZA": ("Hot Mezza", 14, 14),
    "SALADS": ("Salads", 5, 5),
    "BAKERY AND PASTRY": ("Bakery and Pastry", 6, 6),
    "CHARCOAL-GRILLED MAIN COURSES": ("Charcoal-Grilled Main Courses", 8, 8),
    "SHAWARMA ROTISSERIE": ("Shawarma Rotisserie", 3, 3),
    "MAIN COURSES": ("Main Courses", 5, 5),
    "FISH AND SEAFOOD": ("Fish and Seafood", 1, 1),
    "SIDE ORDERS": ("Side Orders", 9, 9),
    "MAROUSH SPECIALS": ("Maroush Specials", 4, 4),
    "SANDWICHES OR WRAPS": ("Sandwiches or Wraps", 12, 12),
    "DESSERTS": ("Desserts", 5, 5),
    "SOFT DRINKS AND WATER": ("Soft Drinks and Water", 15, 0),
    "JUICES": ("Juices", 4, 4),
    "HOT BEVERAGES": ("Hot Beverages", 15, 0),
}
EXPECTED_WITH_KCAL = 92
JUICE_NAMES = {"Fresh Orange": "Fresh Orange Juice", "Mango": "Mango Juice", "Fruit Cocktail": "Fruit Cocktail Juice"}
SET_MENUS = {"Sharing Set Menu for 2": "Total for 2", "Sharing Set Menu for 4": "Total for 4"}  # "(Total for 2)" on the chain's page
SIZE = re.compile(r"(\d+)g$")
MEAT_NAMED = re.compile(r"\b(chicken|lamb|fish|sea bass|shawarma|vegetable)\b", re.I)  # words that already say which animal (or none)


def item_name(section: str, printed: str) -> str:
    if section == "SANDWICHES OR WRAPS":
        return printed + " Wrap"
    if section == "JUICES":
        return JUICE_NAMES.get(printed, printed)
    return printed


def build_items(rows: list) -> list:
    counts: dict = {}
    for r in rows:
        c = counts.setdefault(r["section"], [0, 0])
        c[0] += 1
        c[1] += 0 if r["kcal"] == "-" else 1
    expected = {k: (v[1], v[2]) for k, v in EXPECTED.items()}
    if {k: tuple(v) for k, v in counts.items()} != expected or list(counts) != list(EXPECTED):
        raise SystemExit(f"The guide changed. Sections found (rows, rows with calories): {counts}; expected {expected}. Re-read the guide, update EXPECTED.")
    items = []
    for r in rows:
        if r["kcal"] == "-":
            continue
        if not re.fullmatch(r"\d{1,5}", r["kcal"]):
            raise SystemExit(f"{r['name']}: calorie cell {r['kcal']!r} is not a whole number")
        printed = r["name"]
        name = item_name(r["section"], printed)
        marks = " ".join(m for m, on in (("V", r["v"]), ("VG", r["vg"])) if on)
        note = f"Printed page {r['page']}, section {r['section'].title()}" + (f", marks: {marks}" if marks else "")
        if name != printed:
            note += f"; the PDF prints '{printed}', the chain's page of the same guide prints '{name}'"
        it = dict(name=name, category=EXPECTED[r["section"]][0], calories=r["kcal"], rankable=False,
                  tags="vegetarian" if (r["v"] or r["vg"]) else "")
        m = SIZE.search(printed)
        if m:
            it["serving"] = f"{m.group(1)} g"
            it["weight_g"] = m.group(1)
        if printed in SET_MENUS:
            it["serving"] = SET_MENUS[printed]
            note += "; the chain's page says '(Total for 2)' / '(Total for 4)'"
        it["notes"] = note
        items.append(it)
    if len(items) != EXPECTED_WITH_KCAL:
        raise SystemExit(f"Expected {EXPECTED_WITH_KCAL} dishes with calories, built {len(items)}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique: " + ", ".join(sorted({n for n in names if names.count(n) > 1})))
    return items


def check_page_html(path: Path, items: list) -> None:
    """Compare every item with the chain's own HTML table of the same guide: name, calories and V/VG. Stops on any difference."""
    text = path.read_text(encoding="utf-8", errors="replace")
    page = {}
    for attrs, inner in re.findall(r"<tr([^>]*)>(.*?)</tr>", text, flags=re.S):
        tds = [html.unescape(re.sub(r"<[^>]+>", "", t)).strip() for t in re.findall(r"<td[^>]*>(.*?)</td>", inner, flags=re.S)]
        kcal = [m.group(1) for m in (re.fullmatch(r"(\d+) kcal", t) for t in tds) if m]
        if len(tds) < 3 or len(kcal) != 1:
            continue  # rows without a number ("Varies", "0-5 kcal") are not items we publish
        diet = re.search(r'data-diet="([^"]*)"', attrs)
        veg = bool(diet) and "v" in diet.group(1).split()
        page.setdefault(tds[0].replace("Baklawa (", "Baklawa ").replace("g)", "g"), (veg, kcal[0]))
    problems = []
    for it in items:
        key = it["name"]
        if key not in page:
            problems.append(f"{key}: not on the chain's page")
            continue
        veg, k = page[key]
        if k != it["calories"]:
            problems.append(f"{key}: PDF {it['calories']} kcal, page {k}")
        if veg != ("vegetarian" in it["tags"]):
            problems.append(f"{key}: vegetarian mark differs (PDF {'vegetarian' in it['tags']}, page {veg})")
    if problems:
        raise SystemExit("The chain's own page disagrees with the PDF:\n  " + "\n  ".join(problems))
    print(f"page check: all {len(items)} items agree with the chain's own HTML table (name, calories, vegetarian mark)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--page-html", type=Path, help="the chain's page PAGE_URL saved as HTML: cross-checks names, calories and V/VG")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    info = subprocess.run(["pdfinfo", str(args.pdf)], capture_output=True, text=True, check=True).stdout
    if not re.search(r"^Pages:\s+6\s*$", info, flags=re.M):
        raise SystemExit("The PDF no longer has 6 pages: re-read the guide")
    cover = pdf_reader.pdf_text(args.pdf, 1, 1) + pdf_reader.pdf_text(args.pdf, 6, 6)
    for needed in ("SEPTEMBER 2026", "Version 01 - verification copy", "Verification required before customer issue"):
        if needed not in cover:
            raise SystemExit(f"The cover / information page no longer says {needed!r}: this is a different edition. Re-check the date and "
                             "whether the guide is still a draft; if it is verified, a human decides whether to publish its allergen dots "
                             "(maroush_pdf.read_rows reads them), then update SOURCE_TITLE and this check.")
    rows, dots_per_page = pdf_reader.read_rows(args.pdf)
    items = build_items(rows)
    if args.page_html:
        check_page_html(args.page_html, items)
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Maroush", cuisine="Lebanese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    by_cat: dict = {}
    for i in items:
        by_cat[i["category"]] = by_cat.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    print("printed with '-' for calories (not listed): " + ", ".join(r["name"] for r in rows if r["kcal"] == "-"))
    print(f"allergen dots read (NOT published, see docstring): per page {dots_per_page}, total {sum(dots_per_page.values())}")
    unstated = [i["name"] for i in items if "vegetarian" not in i["tags"] and i["category"] != "Juices" and i["name"] != "Fresh Lemonade"
                and not MEAT_NAMED.search(i["name"])]
    print(f"non-vegetarian items whose name does not say chicken/lamb/fish ('meat type not stated'): {len(unstated)}: " + ", ".join(unstated))


if __name__ == "__main__":
    main()
