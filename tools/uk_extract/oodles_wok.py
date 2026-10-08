#!/usr/bin/env python3
"""Build data/source/oodles-wok/ from Oodles Wok's own "Nutritional Information" web page (full nutrition per portion size).

    python3 tools/uk_extract/oodles_wok.py path/to/nutritional-information.html --checked-on 2026-10-08 \
        [--pdf path/to/oodles-wok-nutrition-jan-2025.pdf] [--allergen-page path/to/allergen-information.html] [--out DIR]

Source (saved with one plain GET each, a normal browser User-Agent, robots.txt allows /; the pages are server-rendered):
    https://oodleswok.co.uk/nutritional-information/   (the /nutritional-information path answers 308 to the slash form)
    The page says: "Values are from an independent nutritional analysis of our standard recipes (lab-calculated, dated Jan 2025).
    Portion sizes are Value, Regular and Large where applicable; single-portion items show one row. Figures may vary slightly
    between stores." It links the same analysis as a PDF: https://oodleswok.co.uk/assets/oodles-wok-nutrition-jan-2025.pdf
    ("Nutritional Data V03 Nutrition January 2025", created 31 Jan 2025, 2 A3 pages, text layer).

PAGE OR PDF (checked 2026-10-08, rule from the founder's brief: if the PDF is older than the page or they disagree, publish only
what the newer official page prints). Both carry the same January 2025 analysis. On the 31 dishes the page lists, the page's numbers
equal the PDF's to within rounding (the PDF prints 4 decimals / unrounded laboratory figures; the page shows them to 3 significant
figures, kJ to a whole number): --pdf re-checks every cell of every one of them and stops on any difference. But the PDF has 27 more
dishes than the page (see PDF_ONLY below: wraps, 7 of 8 wings, bento boxes, dumplings, haloumi fries, two more dry dishes, ...). The
page is what the chain serves now, the live menu (https://oodleswok.co.uk/our-food/) and the 6 Oct 2026 allergen chart rename or no
longer list those dishes ("Oodles Signature Wings", "Fried Chicken Dumplings", "Wok-Fired Beef Wrap"; no bento boxes, haloumi fries,
Fiery Garlic Chicken or Crispy Veg), and none can be matched to a current dish by an exact name. So only what the page prints is
published; the PDF-only dishes are not. The numbers published are the page's own printed cells (3 significant figures), not the PDF's
unrounded ones.

How it is read: the page is Next.js server-rendered. Each dish is a <div data-slug=...> card with a <table> (Portion, Energy kcal,
Energy kJ, Protein, Fat, Saturated fat, Carbs, Sugars, Fibre, Salt): the printed cells are copied as text. The same page embeds the
dishes as JSON (self.__next_f.push): every printed cell is checked against it (the printed cell must be that value rounded to the
digits shown), so two readings of the same page must agree. Nothing is converted or estimated. Salt is salt_g as printed (no sodium).

Per-serving figures only: every portion size is its own item ("Caramel Chicken (Large)"). The PDF's footnote says its values are
"a reference to a perfect Oodles half-portion in your food container" and to add bases and toppings when building a box (a box is 2
bases + 1 saucy dish + 1 dry dish, per the live menu), so the bases, saucy dishes, dry dishes and sides are parts of an order and
not rankable. The one Wok Wings dish is a whole portion (x4 wings) and is rankable.

Held back (holdback.csv; never corrected): Oodles Crispy Chicken (3 sizes) and Torpedo Prawns. For both the page AND the PDF print a
kcal figure that contradicts the same row's kJ and its protein/carbs/fat: Torpedo Prawns 167 kcal beside 877 kJ (= 210 kcal) and
macros adding to 206 kcal; Oodles Crispy Chicken 194 / 233 / 272 kcal beside 689 / 827 / 965 kJ (= 165 / 198 / 231 kcal) and macros
adding to 162 / 195 / 227 kcal. Every other row has kJ within 1.4% of 4.184 x kcal.

Tags: none of vegetarian (the nutrition page does not mark it; the live menu feed does for a few dishes but that is not the
nutrition guide), contains_pork (a halal chain; no dish names pork); contains_beef only for "Wok-Fired Beef" (named in the dish).
Dishes whose name states no meat, fish or vegetable ("meat type not stated"): Egg Fried Rice, Schezuan Rice, Udon Noodles, Spicy
Chips, Plain Chips.

Allergens (docs/DATA.md "Allergens"): link-only. The chain's allergen page (https://oodleswok.co.uk/allergen-information/, "Data
taken directly from our official 6 Oct 2026 allergen chart") embeds 36 dishes as JSON with the same names as the nutrition page,
but has no row for 3 of the 31 published dishes: Veg Spring Rolls, Teriyaki Wings and Blackbean Chicken (the live menu feed marks
all three "allergensAssessed": false). The chart PDF it is taken from (/assets/allergens/oodles-wok-allergens-06-oct-2026.pdf,
"LAST UPDATED: OCT 2026", MC = may contain, 2 A3 pages) does list "VEG SPRING ROLLS", "CHICKEN IN BLACKBEAN" and one "TERIYAKI WINGS
(& CHIPS)" row, but with names that differ from the nutrition page for two of them, and its "contains" ticks are drawn graphics,
not text (the text layer holds only the MC marks), so it cannot be read by script. Allergens are safety information: no name matching,
no reading marks by eye into a table, so all or nothing means the guide link only. --allergen-page re-checks which published dishes
the page's chart lacks and stops if that changes (a human then decides whether allergens can be published in full).
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "oodles-wok"
NAME = "Oodles Wok"
SOURCE_URL = "https://oodleswok.co.uk/nutritional-information/"
SOURCE_TITLE = "Oodles Wok Nutritional Information page (independent lab analysis dated Jan 2025; accessed 2026-10-08)"
PDF_URL = "https://oodleswok.co.uk/assets/oodles-wok-nutrition-jan-2025.pdf"
PDF_FOOTER = "Nutritional Data V03 Nutrition January 2025"
ALLERGEN_URL = "https://oodleswok.co.uk/allergen-information/"
ALLERGEN_TITLE = "Oodles Wok Allergen Information page and chart (official allergen chart dated 6 Oct 2026)"
# The chart prints "MC = MAY CONTAIN" and a cross-contamination notice: traces information is published.
MAY_CONTAIN_PUBLISHED = True
ALIASES = ["oodles wok", "oodles"]
NOTE = ("Each figure is for one dish in the portion size shown (Value, Regular or Large) from a lab analysis dated Jan 2025; "
        "stores may vary slightly. A box is two bases, a saucy and a dry dish, so add them up. Wraps, bao, bubble tea and "
        "desserts have no figures on the page. Torpedo Prawns and Oodles Crispy Chicken are left out: their calories contradict their own kJ.")

PORTION_COLUMNS = ["Portion", "Energykcal", "EnergykJ", "Proteing", "Fatg", "Saturated fatg", "Carbsg", "Sugarsg", "Fibreg", "Saltg"]
JSON_KEYS = ["kcal", "kj", "protein", "fat", "satFat", "carbs", "sugars", "fibre", "salt"]
ITEM_KEYS = ["calories", "energy_kj", "protein_g", "fat_g", "sat_fat_g", "carbs_g", "sugar_g", "fiber_g", "salt_g"]

# Display order and names. Category (as the page prints it) -> [(name as printed on the page, display name)].
# The page lists its cards in no useful order; the order here follows how the chain builds a box (bases, saucy, dry).
ORDER = [
    ("Bases", [("Egg Fried Rice", "Egg Fried Rice"), ("Veg Rice", "Veg Rice"), ("Schezuan Rice", "Schezuan Rice"),
               ("Veg Noodles", "Veg Noodles"), ("Udon Noodles", "Udon Noodles"), ("Spicy Chips", "Spicy Chips"),
               ("Plain Chips", "Plain Chips")]),
    ("Saucy Dishes", [("Malaysian Chicken", "Malaysian Chicken"), ("Chilli Chicken", "Chilli Chicken"),
                      ("Manchurian Chicken", "Manchurian Chicken"), ("Sweet & Sour Chicken", "Sweet & Sour Chicken"),
                      ("Blackbean Chicken", "Blackbean Chicken"), ("Katsu Chicken Curry", "Katsu Chicken Curry"),
                      ("Chilli Prawns", "Chilli Prawns"), ("Chilli Fish", "Chilli Fish"), ("Veg Stir Fry", "Veg Stir Fry"),
                      ("Katsu Veg Curry", "Katsu Veg Curry")]),
    ("Dry Dishes", [("Caramel Chicken", "Caramel Chicken"), ("Salt & Pepper Chicken", "Salt & Pepper Chicken"),
                    ("Oodles Crispy Chicken", "Oodles Crispy Chicken"), ("Teriyaki Chicken", "Teriyaki Chicken"),
                    ("Hot & Tangy Chicken", "Hot & Tangy Chicken"), ("Kung Po Chicken", "Kung Po Chicken"),
                    ("Smoked BBQ Chicken", "Smoked BBQ Chicken"), ("Wok-Fired beef", "Wok-Fired Beef"),
                    ("Oodles Crispy Prawns", "Oodles Crispy Prawns"), ("Schezuan Paneer", "Schezuan Paneer")]),
    ("Sides", [("Veg Spring Rolls", "Veg Spring Rolls"), ("Jumbo Chicken Roll", "Jumbo Chicken Roll"),
               ("Torpedo Prawns", "Torpedo Prawns")]),
    ("Wok Wings", [("Teriyaki Wings", "Teriyaki Wings")]),
]
CATEGORY_SHOWN = {"Bases": "Bases", "Saucy Dishes": "Saucy dishes", "Dry Dishes": "Dry dishes", "Sides": "Sides", "Wok Wings": "Wok wings"}
# Portion labels as the page prints them -> the serving text shown. Dishes with three sizes show Value / Regular / Large.
SIZES = ["Value", "Regular", "Large"]
SINGLE_SERVING = {"x5 Pieces": "5 pieces", "Single": "Single", "Value Box": "Value box", "x4 Wings": "4 wings"}
RANKABLE_CATEGORIES = {"Wok Wings"}  # a whole portion as sold; the rest are parts of a box or sides
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
# Dishes whose name states no meat, fish or vegetable.
MEAT_NOT_STATED = {"Egg Fried Rice", "Schezuan Rice", "Udon Noodles", "Spicy Chips", "Plain Chips"}

# Held back: id -> reason (see the module docstring). Never corrected.
HOLDBACK = [
    ("torpedo-prawns", "The page and the PDF print 167 kcal beside 877 kJ (= 210 kcal) and protein/carbs/fat adding to 206 kcal: the kcal figure "
                       "contradicts both, so the row is not published (nothing corrected)."),
    ("oodles-crispy-chicken-value", "Printed 194 kcal beside 689 kJ (= 165 kcal) and protein/carbs/fat adding to 162 kcal: the kcal figure "
                                    "contradicts both, so the row is not published (nothing corrected)."),
    ("oodles-crispy-chicken-regular", "Printed 233 kcal beside 827 kJ (= 198 kcal) and protein/carbs/fat adding to 195 kcal: the kcal figure "
                                      "contradicts both, so the row is not published (nothing corrected)."),
    ("oodles-crispy-chicken-large", "Printed 272 kcal beside 965 kJ (= 231 kcal) and protein/carbs/fat adding to 227 kcal: the kcal figure "
                                    "contradicts both, so the row is not published (nothing corrected)."),
]

# Dishes in the Jan 2025 PDF that the page does not list (checked 2026-10-08, 27 dishes). Not published: see the docstring.
PDF_ONLY = {
    "Spicy Chips Toppings", "Plain Chips Toppings", "Fiery Garlic Chicken", "Crispy Veg",
    "Bento Rice - Chicken", "Bento Rice - Paneer", "Bento Rice - Beef", "Bento Rice - Prawns",
    "Bento Noodles - Chicken", "Bento Noodles - Paneer", "Bento Noodles - Beef", "Bento Noodles - Prawn",
    "Dry Salt & Pepper Chips", "Chicken Dumplings", "Vegetable Dumplings", "Haloumi Fries",
    "Dry Salt & Pepper Wings", "Dry Salt & Pepper Wings & CHIPS", "BBQ Wings", "BBQ Wings & CHIPS", "Teriyaki Wings & CHIPS",
    "Wok Wings", "Wok Wings & CHIPS", "Paneer Wrap", "Beef Wrap", "Salt & Pepper Wrap", "Smoked BBQ Wrap",
}
# Published dishes with no row in the allergen chart (page) on 2026-10-08: allergens stay link-only while this is not empty.
NOT_IN_ALLERGEN_PAGE = {"Veg Spring Rolls", "Teriyaki Wings", "Blackbean Chicken"}


# ---------------------------------------------------------------- reading the page
class _Cards(HTMLParser):
    """Each <div data-slug> card: first category label, first <h3> name, first <table> rows (cell text as rendered)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.cards = []  # type: list
        self.cur = None
        self.in_h3 = False
        self.in_cat = False
        self.table_state = 0  # 0 = none yet, 1 = inside the card's first table, 2 = finished
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "div" and "data-slug" in a:
            self.cur = {"slug": a["data-slug"], "category": None, "name": None, "rows": []}
            self.cards.append(self.cur)
            self.table_state = 0
            return
        if self.cur is None:
            return
        cls = a.get("class", "") or ""
        if tag == "h3" and self.cur["name"] is None:
            self.in_h3 = True
            self.cur["name"] = ""
        elif tag == "div" and "uppercase" in cls and "tracking-[0.25em]" in cls and self.cur["category"] is None:
            self.in_cat = True
            self.cur["category"] = ""
        elif tag == "table" and self.table_state == 0:
            self.table_state = 1
        elif tag == "tr" and self.table_state == 1:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = ""

    def handle_endtag(self, tag):
        if self.cur is None:
            return
        if tag == "h3":
            self.in_h3 = False
        elif tag == "div":
            self.in_cat = False
        elif tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(self.cell.strip())
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.cur["rows"].append(self.row)
            self.row = None
        elif tag == "table" and self.table_state == 1:
            self.table_state = 2

    def handle_data(self, data):
        if self.cur is None:
            return
        if self.in_h3:
            self.cur["name"] += data
        if self.in_cat:
            self.cur["category"] += data
        if self.cell is not None:
            self.cell += data


def read_cards(page_html: str) -> list:
    p = _Cards()
    p.feed(page_html)
    cards = []
    for c in p.cards:
        header, rows = (c["rows"][0] if c["rows"] else None), c["rows"][1:]
        if header != PORTION_COLUMNS:
            raise SystemExit(f"{c['slug']}: the table header changed: {header}. Expected {PORTION_COLUMNS}. Re-check the columns before running again.")
        cards.append({"slug": c["slug"], "category": (c["category"] or "").strip(), "name": html.unescape((c["name"] or "").strip()), "rows": rows})
    return cards


def embedded_json(page_html: str) -> dict:
    """The {"items": [...]} object the page embeds in its Next.js payload."""
    parts = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', page_html):
        parts.append(json.loads('"' + m.group(1) + '"'))
    flight = "".join(parts)
    i = flight.find('{"items":[{"slug":')
    if i < 0:
        raise SystemExit("The page no longer embeds its dishes as JSON: the layout changed, re-check the reader.")
    obj, _ = json.JSONDecoder().raw_decode(flight[i:])
    return obj


def decimals(text: str) -> int:
    return len(text.split(".")[1]) if "." in text else 0


def same_as_rounded(printed: str, raw: float, slack: float = 0.0) -> bool:
    """True when `printed` is `raw` rounded (half up allowed) to the digits the page shows. `slack` allows for the page's own double
    rounding when `raw` is the PDF's unrounded figure: the page's JSON keeps 3 decimals and then shows 1 or 2 (1.0452 -> 1.045 -> "1.04")."""
    return abs(float(printed) - raw) <= 0.5 * 10 ** (-decimals(printed)) + slack + 1e-9


# ---------------------------------------------------------------- the PDF (cross-check only)
def read_pdf(pdf: Path) -> dict:
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    if PDF_FOOTER not in text:
        raise SystemExit(f"The PDF no longer says {PDF_FOOTER!r}: a new version, re-check it before running again.")
    secs = ["Bases", "Saucy Dishes", "Dry Dishes", "Bento Box", "Sides", "Wok Wings", "Wraps"]
    num = r"-?\d+(?:\.\d+)?"
    sec, cur, dishes = None, None, []
    for line in text.splitlines():
        s = line.strip()
        if s in secs:
            sec = s
            continue
        m = re.match(r"^(.*?)\s+=\s+Energy Values", s)
        if m:
            cur = {"sec": sec, "name": m.group(1).strip(), "portions": []}
            dishes.append(cur)
            continue
        m = re.match(r"^(.*?)\s+=\s+((?:" + num + r"\s+){8}" + num + r")\s*$", s)
        if m and cur is not None:
            cur["portions"].append((m.group(1).strip(), [float(x) for x in m.group(2).split()]))
    return {"dishes": dishes}


def pdf_key(name: str) -> str:
    n = name.lower().replace("vegetable", "veg").replace(" sauce chicken", " chicken").replace("&", "and")
    return " ".join(n.split())


# ---------------------------------------------------------------- build
def build(cards: list, data: dict, pdf: dict = None) -> tuple:
    by_slug = {i["slug"]: i for i in data["items"]}
    if len(cards) != 31 or len(by_slug) != 31 or {c["slug"] for c in cards} != set(by_slug):
        raise SystemExit(f"The page lists {len(cards)} rendered dishes and {len(by_slug)} embedded ones, expected 31 of each with the same names: "
                         "the nutrition page changed. Re-check ORDER, HOLDBACK and PDF_ONLY.")
    expected = {(cat, printed) for cat, dishes in ORDER for printed, _ in dishes}
    found = {(c["category"], c["name"]) for c in cards}
    if expected != found:
        raise SystemExit(f"The page's dishes changed. New on the page: {sorted(found - expected)}. In ORDER but no longer on the page: "
                         f"{sorted(expected - found)}. Update ORDER (names, categories) after reading the page.")
    card_of = {(c["category"], c["name"]): c for c in cards}
    pdf_by_key = {}
    if pdf is not None:
        for d in pdf["dishes"]:
            pdf_by_key.setdefault(pdf_key(d["name"]), []).append(d)
        matched = set()
    items, report, double_rounded = [], [], []
    for cat, dishes in ORDER:
        for printed, display in dishes:
            c = card_of[(cat, printed)]
            raw = by_slug[c["slug"]]
            if raw["name"] != printed or raw["category"] != cat:
                raise SystemExit(f"{printed}: the rendered card and the embedded JSON disagree on name/category ({raw['name']!r}, {raw['category']!r})")
            labels = [r[0] for r in c["rows"]]
            if [p["label"] for p in raw["portions"]] != labels:
                raise SystemExit(f"{printed}: portion labels differ between the table {labels} and the JSON")
            sized = labels == SIZES
            if not sized and not (len(labels) == 1 and labels[0] in SINGLE_SERVING):
                raise SystemExit(f"{printed}: unexpected portion labels {labels}: re-check SIZES / SINGLE_SERVING")
            if pdf is not None:
                cands = pdf_by_key.get(pdf_key(printed))
                if not cands:
                    raise SystemExit(f"{printed}: not found in the PDF")
                cands = [d for d in cands if [p[0] for p in d["portions"]] == labels] or cands
                pd = cands[0]
                matched.add(pd["name"])
                if [p[0] for p in pd["portions"]] != labels:
                    raise SystemExit(f"{printed}: portion labels differ between the page {labels} and the PDF {[p[0] for p in pd['portions']]}")
            for ri, (row, jp) in enumerate(zip(c["rows"], raw["portions"])):
                cells = row[1:]
                if len(cells) != len(ITEM_KEYS):
                    raise SystemExit(f"{printed} {row[0]}: {len(cells)} numeric cells, expected {len(ITEM_KEYS)}")
                for cell, key, col in zip(cells, JSON_KEYS, PORTION_COLUMNS[1:]):
                    if not re.fullmatch(r"\d+(?:\.\d+)?", cell):
                        raise SystemExit(f"{printed} {row[0]} {col}: cell {cell!r} is not a plain number")
                    if not same_as_rounded(cell, jp[key]):
                        raise SystemExit(f"{printed} {row[0]} {col}: printed {cell} but the page's own JSON has {jp[key]}")
                if pdf is not None:
                    for cell, pv, col in zip(cells, pd["portions"][ri][1], PORTION_COLUMNS[1:]):
                        if not same_as_rounded(cell, pv, slack=0.0005):
                            raise SystemExit(f"{printed} {row[0]} {col}: the page prints {cell} but the PDF prints {pv}")
                        if not same_as_rounded(cell, pv):
                            double_rounded.append(f"{printed} {row[0]} {col}: page {cell}, PDF {pv}")
                item = dict(zip(ITEM_KEYS, cells))
                name = f"{display} ({row[0]})" if sized else display
                tags = []
                if BEEF.search(display):
                    tags.append("contains_beef")
                if PORK.search(display):
                    tags.append("contains_pork")
                item.update(name=name, category=CATEGORY_SHOWN[cat], serving=row[0] if sized else SINGLE_SERVING[row[0]],
                            tags="|".join(tags), rankable=cat in RANKABLE_CATEGORIES,
                            notes=f"Page category '{cat}', card '{printed}', row '{row[0]}'")
                items.append(item)
    if pdf is not None:
        only = {d["name"] for d in pdf["dishes"]} - matched
        if only != PDF_ONLY:
            raise SystemExit(f"The PDF's dishes the page does not list changed. Now: {sorted(only - PDF_ONLY)} new, {sorted(PDF_ONLY - only)} gone. "
                             "Re-check whether the page or the PDF is newer before publishing.")
        report.append(f"PDF cross-check: all {len(items)} rows equal the PDF to within the page's rounding; {len(only)} PDF dishes are not on the page and not published")
        report.append(f"cells where the page's double rounding differs from rounding the PDF's figure once ({len(double_rounded)}, page value published): " + "; ".join(double_rounded))
    ids = [slug(i["name"]) for i in items]
    for h, _ in HOLDBACK:
        if h not in ids:
            raise SystemExit(f"HOLDBACK names {h!r}, which is not an item id")
    if len(items) != 81 or len(set(ids)) != len(ids):
        raise SystemExit(f"Expected 81 items with unique ids, built {len(items)}: re-check ORDER / sizes")
    return items, report


def check_allergen_page(path: Path, published: list) -> str:
    obj = embedded_json(path.read_text(encoding="utf-8"))
    chart = {i["name"] for i in obj["items"]}
    missing = {n for n in published if n not in chart}
    if missing != NOT_IN_ALLERGEN_PAGE:
        raise SystemExit(f"The allergen page's coverage changed: published dishes without a row now {sorted(missing)}, expected "
                         f"{sorted(NOT_IN_ALLERGEN_PAGE)}. A human should decide whether allergens can now be published in full (exact names only).")
    return f"allergen page: {len(chart)} rows; published dishes with no row: {sorted(missing)} -> allergens stay link-only"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("page", type=Path, help="the saved nutrition page (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the page was read, YYYY-MM-DD")
    ap.add_argument("--pdf", type=Path, help="the linked January 2025 PDF (PDF_URL): every published cell is checked against it")
    ap.add_argument("--allergen-page", type=Path, help="the saved allergen page (ALLERGEN_URL): checks which published dishes it lacks")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    page_html = args.page.read_text(encoding="utf-8")
    print(f"nutrition page sha256 {sha256_file(args.page)}  {args.page}")
    if "dated Jan 2025" not in page_html:
        raise SystemExit("The page no longer says 'dated Jan 2025': the analysis was updated, re-check the source title and the PDF.")
    pdf = None
    if args.pdf:
        print(f"PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
        pdf = read_pdf(args.pdf)
    cards = read_cards(page_html)
    items, report = build(cards, embedded_json(page_html), pdf)
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt is {len(NOTE)} characters; keep it under 400")
    if args.allergen_page:
        print(f"allergen page sha256 {sha256_file(args.allergen_page)}  {args.allergen_page}")
        report.append(check_allergen_page(args.allergen_page, sorted({c['name'] for c in cards})))
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name=NAME, cuisine="Asian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=HOLDBACK, allergen_guide=guide)
    for line in report:
        print(line)
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{k} {v}" for k, v in counts.items()))
    print(f"held back: {[h for h, _ in HOLDBACK]}")
    print(f"meat type not stated: {sorted(MEAT_NOT_STATED)} ({sum(1 for i in items if any(i['name'].startswith(m) for m in MEAT_NOT_STATED))} rows)")


if __name__ == "__main__":
    main()
