#!/usr/bin/env python3
"""Build data/source/gails/ from GAIL's official "Beverages Nutrition & Allergen Guide" (a CALORIES-ONLY chain: drinks only).

    python3 tools/uk_extract/gails.py path/to/CoffeeMatrix_Autumn_26.pdf --checked-on 2026-10-07 [--fetch] [--out DIR]

Source (the file behind the "Hot drink information" button on GAIL's own allergen page https://gails.com/pages/allergens):
    https://cdn.shopify.com/s/files/1/0717/9658/8827/files/CoffeeMatrix_Autumn_26.pdf  (18 pages, text layer; PDF created
    2026-09-10, no date printed in the guide). `--fetch` downloads it to the given path first (one request).
Needs `pdftotext` / `pdfinfo` (poppler). The table is read by position: see gails_pdf.py.

What the guide prints per drink: KCAL PER 100g, KCAL PER PORTION, ALLERGENS (the 14, as words; "None" when none) and DIETARY marks
(V vegetarian, VN vegan). Only the PER PORTION column is used (per-100g values are never published, never converted). The guide does
not state the portion size, so `serving` stays blank; the size words in the names (Small, Regular) are as printed. Protein, carbs,
fat, salt etc. are not printed, so this is a calories-only chain (docs/DATA.md "Calories-only chains"). Every drink row carries a V
mark, so every item is tagged vegetarian (the guide's own mark).

NOT PUBLISHED, and why (read before changing anything):
- GAIL's FOOD. Every product page on gails.com shows a "Nutrition" panel (energy, fat, saturates, carbohydrate, sugars, protein, fibre,
  salt) read from `window.allergenProducts`, an EPOS list of 906 PLUs embedded in each page (js: product-nutrition-js.js). Neither the
  panel nor the page nor the FAQ states the basis (per portion, per 100 g, per loaf), and the values are plainly mixed: sourdough loaves
  show 224 kcal / 49 g carbohydrate (a per-100g figure) while a croissant shows 374 kcal and the Kimchi croissant 716 kcal (per item);
  some rows have kcal and kJ swapped (Bruern Sourdough - Halved kcal=956 kJ=228; hazelnut spread kcal=2539), salt in mg beside salt in g
  (1.2, 0.03), and catering boxes, modifiers and discontinued PLUs are mixed in. A row without a stated basis is not published (rule 4
  of docs/UK_DATA_PLAYBOOK.md), so no food item is listed. GAIL's food allergen matrix (https://gails.com/pages/allergens, built from
  the same list) is therefore not used either.
- Drink rows printed N/A (filter coffee box and the Sproud filter coffees): no figure.
- Four matcha tea rows whose per-portion column prints ">1" beside 12 kcal per 100 g: written to items.csv as printed and held back.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import gails_pdf as pdf_reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "gails"
SOURCE_URL = "https://cdn.shopify.com/s/files/1/0717/9658/8827/files/CoffeeMatrix_Autumn_26.pdf"
SOURCE_TITLE = ("GAIL's Beverages Nutrition & Allergen Guide, Autumn 2026 (file CoffeeMatrix_Autumn_26.pdf, PDF created 10 September 2026; "
                "no date printed in the guide)")
ALLERGEN_PAGE = "https://gails.com/pages/allergens"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
# The guide's footer ("we cannot guarantee our food and drinks are free from allergens") is a general statement; it gives no
# per-drink "may contain" information, so the app must not imply "no traces" and says the guide doesn't list them.
MAY_CONTAIN_PUBLISHED = False
NOTE = ("Hot and cold drinks only, from GAIL's drinks guide: calories per portion (the guide doesn't state portion sizes). GAIL's doesn't "
        "say whether the nutrition on its food pages is per portion or per 100 g, so no food is listed. Drinks with no figure (N/A) are left out.")
EXPECTED_ROWS = 281           # table rows in the PDF
EXPECTED_NA = 8               # rows printed N/A in both columns
EXPECTED_HELD = 4             # per-portion ">1"
EXPECTED_REPEATS = {"regular-iced-mocha-oat-drink", "regular-iced-mocha-soya-drink"}
NA_DRINKS = {"FILTER COFFEE BOX", "REGULAR FILTER COFFEE", "SMALL FILTER COFFEE"}
SECTIONS = {"COFFEE": "Coffee", "TEA": "Tea", "MATCHA": "Matcha", "HOT / ICED CHOCOLATE": "Hot and iced chocolate", "SPROUD DRINK": "Sproud drinks"}
# Second title line -> how it reads after the drink name. Anything else stops the run (a new milk, size or layout).
VARIANTS = {
    "COW’S MILK": "cow’s milk", "SEMI SKIMMED MILK": "semi skimmed milk", "OAT DRINK": "oat drink", "SOYA DRINK": "soya drink",
    "DECAF": "decaf", "DECAF COW’S MILK": "decaf cow’s milk", "DECAF SEMI SKIMMED MILK": "decaf semi skimmed milk",
    "DECAF OAT DRINK": "decaf oat drink", "DECAF SOYA DRINK": "decaf soya drink", "SPROUD": "Sproud",
}
CONTINUED_TITLES = {("APPLE & CINNAMON ICED", "MATCHA")}   # one drink name printed over two lines
PRINTED_TYPOS = {"MUSC0VADO ICED LATTE": "MUSCOVADO ICED LATTE"}  # the PDF's text layer has a zero for the letter O (Sproud section); the page renders it as O


def tidy(title: str) -> str:
    return " ".join(w.capitalize() for w in title.split(" "))


def fetch(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sS", "--fail", "-L", "-A", USER_AGENT, "-o", str(dest), SOURCE_URL], check=True)
    time.sleep(1.0)


def section_for(page: int, headings: dict) -> str:
    before = [p for p in headings if p < page]
    if not before:
        raise SystemExit(f"page {page} has no section heading before it")
    heading = headings[max(before)]
    if heading not in SECTIONS:
        raise SystemExit(f"new section heading {heading!r} on page {max(before)}: add it to SECTIONS")
    return SECTIONS[heading]


def build(rows: list, headings: dict) -> tuple:
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The guide has {len(rows)} table rows but this script expects {EXPECTED_ROWS}: it changed, re-check before running again.")
    items, holdback, report = [], [], []
    skipped_na = []
    for r in rows:
        lines = r["title_lines"]
        printed = " / ".join(lines)
        if r["portion"] == "N/A" or r["per100"] == "N/A":
            if r["portion"] != r["per100"] or lines[0] not in NA_DRINKS:
                raise SystemExit(f"{printed!r}: an unexpected N/A row (page {r['page']})")
            skipped_na.append(printed)
            continue
        if len(lines) > 2:
            raise SystemExit(f"{printed!r}: a title over {len(lines)} lines (page {r['page']}); re-check the layout")
        drink, variant = lines[0], ""
        if len(lines) == 2:
            if (lines[0], lines[1]) in CONTINUED_TITLES:
                drink = lines[0] + " " + lines[1]
            elif lines[1] in VARIANTS:
                variant = VARIANTS[lines[1]]
            else:
                raise SystemExit(f"{printed!r}: unknown second title line {lines[1]!r} (page {r['page']}): add it to VARIANTS or CONTINUED_TITLES")
        notes = [f"page {r['page']}; per-portion value printed {r['portion']!r}"]
        if drink in PRINTED_TYPOS:
            notes.append(f"title's text layer has a zero for the letter O ({drink!r}; it renders as O); read as {PRINTED_TYPOS[drink]!r}")
            drink = PRINTED_TYPOS[drink]
        name = tidy(drink) + (", " + variant if variant else "")
        keys, cereals, nuts = allergen_words([] if r["allergen_text"].strip().lower() == "none" else r["allergen_text"].split(","), f"{name} (page {r['page']})")
        marks = set(r["marks"])
        if not marks <= {"V", "VN"} or "V" not in marks:
            raise SystemExit(f"{name}: unexpected dietary marks {r['marks']}")
        item = dict(name=name, category=section_for(r["page"], headings), serving="", calories=r["portion"], tags="vegetarian", rankable=False,
                    notes="; ".join(notes), allergens={"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts})
        if r["portion"].startswith(">"):
            holdback.append((slug(name), f"Per-portion column prints {r['portion']!r} beside 12 kcal per 100 g: not a usable number (not corrected)"))
            report.append(f"held back: {name} (per portion printed {r['portion']!r})")
        items.append(item)
    if len(skipped_na) != EXPECTED_NA:
        raise SystemExit(f"{len(skipped_na)} N/A rows, expected {EXPECTED_NA}")
    if len(holdback) != EXPECTED_HELD:
        raise SystemExit(f"{len(holdback)} rows printed '>', expected {EXPECTED_HELD}")
    # The guide prints "Regular Iced Mocha, oat drink" and "soya drink" twice (end of page 6 and top of page 7), the second pair in the
    # place of the decaf rows but without the word DECAF, with every printed cell identical: the repeat is dropped, anything else stops.
    kept, seen = [], {}
    for it in items:
        key = slug(it["name"])
        if key in seen:
            first = seen[key]
            same = (first["calories"], first["allergens"], first["tags"]) == (it["calories"], it["allergens"], it["tags"])
            if not same or key not in EXPECTED_REPEATS:
                raise SystemExit(f"two different rows named {it['name']!r}: re-check the guide")
            report.append(f"dropped exact repeat: {it['name']} (printed twice with identical values; the second has no DECAF label)")
            continue
        seen[key] = it
        kept.append(it)
    items = kept
    if sum(1 for x in report if x.startswith("dropped exact repeat")) != len(EXPECTED_REPEATS):
        raise SystemExit("the repeated rows changed: expected exactly the two Regular Iced Mocha rows printed twice")
    # Small Iced Matcha Latte: semi skimmed (50 per 100 g) prints higher than oat (41), the reverse of every sibling drink: kept as printed.
    for it in items:
        if it["name"] in ("Small Iced Matcha Latte, semi skimmed milk", "Small Iced Matcha Latte, oat drink"):
            it["notes"] += "; semi skimmed prints higher than oat here, the reverse of the other matcha lattes: kept as printed"
            report.append(f"odd (kept as printed): {it['name']} {it['calories']} kcal")
    report += [f"not listed (N/A): {n}" for n in skipped_na]
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDF was downloaded and read")
    ap.add_argument("--fetch", action="store_true", help="download the PDF to `pdf` first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.pdf)
    print(f"{args.pdf} sha256 {sha256_file(args.pdf)}")
    rows, headings = pdf_reader.read_rows(args.pdf)
    items, holdback, report = build(rows, headings)
    guide = {"title": SOURCE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="GAIL's Bakery", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["gails", "gail's", "gails bakery", "gail's bakery", "gail"], items=items,
                             out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    print("\n".join(report))
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
