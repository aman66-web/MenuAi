#!/usr/bin/env python3
"""Build data/source/vue/ from Vue Cinemas' official food nutrition PDF (hand-READ from the rendered pages).

    python3 tools/uk_extract/vue.py path/to/vue-nutritional-food-feb-2025.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file Vue's own site serves; the site's HTML pages sit behind a Cloudflare challenge and were not touched):
    https://www.myvue.com/-/media/vuecinemas/documents/allergens-info/m19911-nutritional-food---feb-2025.pdf?rev=7e1eaa5c527d496d9ed1f08366c55545
    "M19911-Nutritional-FOOD - Feb 2025.pdf", 7 A4 pages, created 2025-02-04, served Last-Modified 2025-02-05.
    SHA-256 d4fc738b9c239bc214f26069ea49df800b698788d411f73f77ed8cd55e9a79c0 (the script stops if the file differs).

WHY THE NUMBERS ARE IN A CSV. The PDF's text layer cannot be used for numbers: its font has no usable glyph for the digit 7, so every 7
is silently missing ("678 kcal" reads "68", "17.8 g" reads "1.8"). The pages render correctly, so the numbers in
tools/uk_extract/vue_values.csv were READ from the rendered pages (220 and 300 dpi) and checked twice: once by eye against zoomed
renders, once by tesseract OCR. This script then re-checks the whole table on every run with the one fact the text layer still gives:
a transcribed value with its 7s removed must equal the text-layer token (so every other digit, the number of cells and the order of
rows are verified automatically; a missing or invented 7 is what the eye and OCR checks covered). If pdftotext (poppler) is not
installed the structure check is skipped with a warning; the SHA-256 check still pins the exact file.

Rows (the CSV lists EVERY row of the PDF, in order; 'exclude' rows carry no numbers and say why):
- published: one row per portion / size / pack: popcorn (Kids/Snackit, Junior, Regular, Large), the Joe & Sephs popcorn packs, the
  popcorn toppings, hot dog parts and combinations (Regular, Large), nachos (Regular, Large) and pre-packed snacks (the PACK row).
- left out: the "per 100 g" rows (the guide's own "100g" line next to each pack; never a serving), products that are listed per 100 g only
  (nacho toppings, some crisps and nuts, all protein bars: their kJ and kcal columns are even swapped), Dublin / Ireland rows, the Swindon
  rows (one cinema) and the popcorn table for six named cinemas (Cleveleys, Cwmbran, Doncaster, Finchley Road, Inverness, Reading).
- figures are copied as printed: stray units ("0g", "14g", "1133g") lose the 'g'; a '-' cell stays blank. kJ is energy_kj; the
  portion/pack weight is weight_g when the size column is a weight ("70g").
- SODIUM: the sodium (mg) column is unusable on most rows: it prints 0 beside salt figures of 0.1-4 g, and values like 1.1 or 2.3 (grams,
  not mg) beside a salt figure. A sodium figure that is below 10 mg while the same row's salt is 0.1 g or more cannot be a real mg value, so
  it is NOT published (the salt figure, which is printed on every row, is). Nothing is converted. Where sodium is plausible it is copied
  (e.g. Nacho Libre 813 mg beside 3 g salt is printed that way and is kept as printed, see the report).
- Held back (holdback.csv): The Brooklyn (Large): carbohydrate prints "9" beside sugars 9.96 and 676 kcal, which is impossible.
- Allergens: link only. Vue's food allergen matrix is dated 30 April 2024 (ten months older), names the kitchen's items ("Large Hotdog
  (Bun & Frankfurter No Sauces)", "Large Chicken Hotdog") and has no row for The Yankee, The Brooklyn, Nacho Libre, West Side Sizzler or
  Harlem Hot: it cannot be matched row by row, and allergens are all-or-nothing.
- Tags: contains_pork only where the item NAME says pork (the Pork Frankfurter); the five hot dog combinations do not say what meat they
  hold ("meat type not stated"). The guide marks nothing vegetarian, so no vegetarian tags.
"""
from __future__ import annotations
import argparse
import csv
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "vue"
PDF_SHA256 = "d4fc738b9c239bc214f26069ea49df800b698788d411f73f77ed8cd55e9a79c0"
SOURCE_URL = "https://www.myvue.com/-/media/vuecinemas/documents/allergens-info/m19911-nutritional-food---feb-2025.pdf?rev=7e1eaa5c527d496d9ed1f08366c55545"
SOURCE_TITLE = "Vue Entertainment food nutritional information (PDF M19911, February 2025; created 4 February 2025)"
ALLERGEN_TITLE = "Vue Entertainment food allergens information (PDF M19339, 30 April 2024; yes / no / maybe matrix)"
ALLERGEN_URL = "https://www.myvue.com/-/media/vuecinemas/documents/allergens-info/m19339-allergen-info-food_30apr24.pdf"
ALIASES = ["vue", "vue cinema", "vue cinemas", "vue entertainment", "myvue"]
VALUES_CSV = Path(__file__).with_name("vue_values.csv")
EXPECTED_ROWS = 125          # every row of the PDF's table (published and left out)
EXPECTED_PUBLISHED = 59
NOTE = ("Per portion or pack, from Vue's own food PDF dated February 2025: the cinemas' current food offer is not confirmed. Pick 'n' mix, "
        "per-100 g-only items, Ireland and single-cinema rows are left out. Sodium is not shown where the PDF prints it as 0 or in grams.")

SIZE_LABELS = {"Kids/Snackit", "Junior", "Regular", "Large"}
# printed section -> (category shown, rankable). Popcorn, toppings, pre-packed snacks and the parts of a hot dog are not suggested as an
# order; the hot dog combinations and the nachos are the cinema's meal-like items.
SECTIONS = {
    "POPCORN": ("Popcorn", False),
    "POPCORNTOPPINGS": ("Popcorn toppings", False),
    "HOTDOGS": ("Hot dogs", False),
    "HOTDOGCOMBINATIONS": ("Hot dog combinations", True),
    "NACHOS": ("Nachos", True),
    "PRE-PACKED": ("Pre-packed snacks", False),
}
HOLDBACK = {  # (section, product, size) -> reason
    ("HOTDOGCOMBINATIONS", "The Brooklyn", "Large"):
        "Carbohydrate prints 9 g beside sugars 9.96 g and 676 kcal (4P+4C+9F is 491): the guide's own row is impossible",
}
NUM_KEYS = ["kj", "kcal", "protein", "carbs", "sugars", "fat", "sat", "fibre", "sodium", "salt"]
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
SIZE_ROW = re.compile(r"^(Kids/Snackit|Junior|Regular|Large|[0-9.]*g)\s+(.+)$")


def norm_section(text: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"\(CONT\.\)", "", text)).upper()


def read_values() -> list:
    lines = [ln for ln in VALUES_CSV.read_text(encoding="utf-8").splitlines() if not ln.startswith("#")]
    rows = list(csv.DictReader(lines))
    for r in rows:
        r["sec"] = norm_section(r["section"])
        if r["status"] != "publish" and not r["status"].startswith("exclude: "):
            raise SystemExit(f"vue_values.csv: bad status {r['status']!r} on {r['product']} {r['size']}")
        if r["status"].startswith("exclude") and any(r[k] for k in NUM_KEYS):
            raise SystemExit(f"vue_values.csv: excluded row {r['product']} {r['size']} carries numbers")
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"vue_values.csv has {len(rows)} rows, expected {EXPECTED_ROWS}")
    return rows


def text_layer_rows(pdf: Path):
    """The PDF's table as pdftotext sees it: [(section, product, size, [tokens])] with every 7 missing from the tokens."""
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    rows, section, product, product_parts, heading_parts = [], None, None, [], []
    for line in out.splitlines():
        raw = line.replace("", "").replace(" ", "")  # the font's "missing glyph" (the digit 7) comes out as U+E008 in places
        s = raw.strip()
        if not s or s.startswith("VUE ENTERTAINMENT"):
            continue
        m = SIZE_ROW.match(s)
        if m and re.search(r"\d", m.group(2)):
            if heading_parts:
                section, heading_parts = norm_section(" ".join(heading_parts)), []
            if product_parts:
                product, product_parts = " ".join(product_parts), []
            rows.append((section, product, m.group(1), m.group(2).split()))
            continue
        if len(raw) - len(raw.lstrip()) > 6:
            continue  # column headings ("Energy/ Kilojoules (KJ)", ...)
        if s == s.upper() and re.search(r"[A-Z]", s):
            heading_parts.append(s)
            product_parts = []
            continue
        if heading_parts:
            section, heading_parts = norm_section(" ".join(heading_parts)), []
        product_parts.append(s)
    return rows


def verify_against_pdf(rows: list, pdf: Path) -> None:
    """Every transcribed value with its 7s removed must equal the text-layer token, rows and sections must line up."""
    if shutil.which("pdftotext") is None:
        print("WARNING: pdftotext not found: structure and digit check against the PDF's text layer skipped (SHA-256 still checked)")
        return
    tl = text_layer_rows(pdf)
    if len(tl) != len(rows):
        raise SystemExit(f"the PDF's text layer has {len(tl)} table rows but vue_values.csv lists {len(rows)}: the guide changed")
    for (section, product, size, toks), r in zip(tl, rows):
        where = f"{r['product']} [{r['size']}] (page {r['page']})"
        if (section, product) != (r["sec"], r["product"]) or size != r["size"].replace("7", ""):
            raise SystemExit(f"row mismatch at {where}: the PDF has {section!r} / {product!r} / {size!r}")
        if r["status"] != "publish":
            continue
        expected = [r[k].strip().replace("7", "") for k in NUM_KEYS]
        expected = [e for e in expected if e != ""]  # a token that was only a 7 vanished from the text layer
        if toks != expected:
            raise SystemExit(f"digits differ from the PDF's text layer at {where}:\n  csv (7s removed) {expected}\n  pdf text         {toks}")


def clean(v: str) -> str:
    v = v.strip()
    if v == "-":
        return ""
    return v[:-1] if v.endswith("g") else v  # '0g', '14g', '1133g': a stray unit typed in the number cell


def build(rows: list) -> tuple:
    items, holdback, report = [], [], []
    for r in rows:
        if r["status"] != "publish":
            continue
        if r["sec"] not in SECTIONS:
            raise SystemExit(f"new section {r['section']!r}: add it to SECTIONS")
        category, rankable = SECTIONS[r["sec"]]
        v = {k: clean(r[k]) for k in NUM_KEYS}
        product, size = r["product"], r["size"]
        name = f"{product} ({size})" if size in SIZE_LABELS else product
        if r["sec"] == "NACHOS":
            name = f"{product} Nachos ({size})"
        if r["sec"] == "POPCORNTOPPINGS" and "Topping" not in product:
            name = f"{product} (popcorn topping)"
        notes = []
        sodium = v["sodium"]
        if sodium != "" and float(sodium) < 10 and float(v["salt"] or 0) >= 0.1:
            notes.append(f"sodium printed as {r['sodium'].strip()} beside salt {v['salt']} g: not published")
            sodium = ""
        elif sodium != "" and float(sodium) >= 10 and float(v["salt"] or 0) >= 0.1:
            implied = float(sodium) * 2.5 / 1000   # g of salt that the printed sodium would be
            if not 0.75 <= float(v["salt"]) / implied <= 1.33:
                notes.append(f"sodium {v['sodium']} mg and salt {v['salt']} g disagree: sodium not published")
                sodium = ""
        weight = size[:-1] if size.endswith("g") and re.fullmatch(r"[0-9.]+", size[:-1]) else ""
        tags = []
        if PORK.search(product):
            tags.append("contains_pork")
        if BEEF.search(product):
            tags.append("contains_beef")
        if r["sec"] == "HOTDOGCOMBINATIONS":
            report.append(f"meat type not stated: {name}")
        if float(v["sugars"] or 0) > float(v["carbs"]) + 0.01 or float(v["sat"] or 0) > float(v["fat"]) + 0.01:
            if (r["sec"], product, size) not in HOLDBACK:
                raise SystemExit(f"{name}: sugars > carbs or saturates > fat in the printed row; hold it back (HOLDBACK) after checking the page")
        items.append({"name": name, "category": category, "serving": size, "calories": v["kcal"], "protein_g": v["protein"],
                      "carbs_g": v["carbs"], "fat_g": v["fat"], "sat_fat_g": v["sat"], "sugar_g": v["sugars"], "fiber_g": v["fibre"],
                      "sodium_mg": sodium, "salt_g": v["salt"], "energy_kj": v["kj"], "weight_g": weight,
                      "tags": "|".join(tags), "rankable": rankable, "notes": "; ".join(notes), "_key": (r["sec"], product, size)})
        report += [f"{name}: {n}" for n in notes]
    for it in items:
        key = it.pop("_key")
        if key in HOLDBACK:
            holdback.append((it["name"], HOLDBACK[key]))
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDF was downloaded and compared with vue_values.csv")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    digest = sha256_file(args.pdf)
    if digest != PDF_SHA256:
        raise SystemExit(f"{args.pdf} has SHA-256 {digest}, but vue_values.csv was read from {PDF_SHA256}: a new PDF needs its pages "
                         "read again (render with pdftoppm -r 220 and look at every page), then update vue_values.csv and PDF_SHA256.")
    rows = read_values()
    verify_against_pdf(rows, args.pdf)
    items, holdback, report = build(rows)
    if len(items) != EXPECTED_PUBLISHED:
        raise SystemExit(f"{len(items)} published rows, expected {EXPECTED_PUBLISHED}")
    # item ids come from write_chain_folder (slug of the name); the hold-back list needs the same ids
    holdback = [(slug(n), why) for n, why in holdback]
    out = write_chain_folder(chain_id=CHAIN_ID, name="Vue", cuisine="Cinema snacks", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    print(f"pdf sha256 {digest}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
