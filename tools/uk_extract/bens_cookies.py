#!/usr/bin/env python3
"""Build data/source/bens-cookies/ from Ben's Cookies' own Nutritional Information page (and its Allergens page).

    python3 tools/uk_extract/bens_cookies.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the two saved pages (nutritional-information.html, allergens.html); --fetch downloads them first (robots.txt is read
with robots_rfc.py, one request per page, 1.2 s apart, a normal browser User-Agent). Python 3.9 compatible.

Source: https://www.benscookies.com/nutritional-information/ ("Our Nutritional Index", one <table>, 28 cookies, no date printed;
the page's own metadata says modified 2026-05-20). Numbers are copied from the cells as printed (a trailing unit letter such as
"<0.1g" is dropped; "<0.1" is kept as the pipeline expects). Only the category, serving text and tags are written here.

BASIS (checked, because the page never says "per cookie" or "per 100 g"): every row's "Avg Size" is 85g, one column is headed
"Starch by Diff g/85g", and protein + fat + total carbohydrate + moisture + ash add up to 81.6-85.2 g in all 28 rows: the figures
are for one average 85 g cookie, not per 100 g (a per-100 g table would add up to 100 g). main() stops if that stops being true.

Columns copied: Energy Kcal, Energy KJ, protein, fat, saturates (printed "incl. trans fats"), mono- and poly-unsaturates, trans
fat, total carbohydrate, total sugar, dietary fibre, sodium (mg) and the last column "Salt: est. from" (its header is cut off in
the page; values are 2.5 x sodium in grams, Ben's own estimate), plus Avg Size as weight_g. Printed but with no column in the data
contract: starch, cholesterol, available carbohydrate, moisture, ash (kept in each row's `notes`, which is not exported).

Allergens (docs/DATA.md "Allergens"): the table's own "Allergens" column gives every cookie's contains list (copied, two cells have a
missing/extra comma that the chain's allergens page prints correctly: TYPO_FIXES). May-contain: both pages print "Ben's Cookies are
not suitable for egg, milk, nut, peanut, soya and sulphite allergy sufferers", so every cookie's may-contain is those six allergens
minus the ones it contains (a contained tree nut keeps "nuts" in may-contain: "other nuts"). That rule is checked against all 26
per-cookie "Allergens / May Contain" cards on the allergens page and the run stops on any difference. Vegan Classic and Vegan Double
have no card there (the table's column covers them; the may-contain rule is the page's own statement).
"""
from __future__ import annotations
import argparse
import html
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "bens-cookies"
SITE = "https://www.benscookies.com"
NUTRITION_URL = SITE + "/nutritional-information/"
ALLERGENS_URL = SITE + "/allergens/"
PAGES = {"nutritional-information.html": NUTRITION_URL, "allergens.html": ALLERGENS_URL}
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SOURCE_TITLE = "Ben's Cookies Nutritional Information: Our Nutritional Index (benscookies.com/nutritional-information, accessed {d}, no date shown)"
ALLERGEN_TITLE = ("Ben's Cookies Allergens page (benscookies.com/allergens, accessed {d}, no date shown) and the Allergens column of "
                  "its Nutritional Information table")
EXPECTED_ROWS = 28
EXPECTED_CARDS = 27
EXPECTED_HEADER = ["Cookie", "Avg Size", "Allergens", "Energy Kcal", "Energy KJ", "Starch by Diff g/85g", "Chol mg", "Protein (Nx6.25) g",
                   "Fat (Total) g", "Saturates Fats incl. Trans Fats g", "Mono-un-saturates", "Poly-un-saturates g", "Trans Fats g",
                   "Total Carbo-hydrate g", "Avail Carbo-hydrate g", "Total sugar g", "Dietary Fiber (AOAC) g", "Sodium mg",
                   "Moisture (Vacuum) g", "Ash g", "Salt: est. from"]
COL = {name: i for i, name in enumerate(["name", "size", "allergens", "kcal", "kj", "starch", "chol", "protein", "fat", "sat", "mono",
                                         "poly", "trans", "carbs", "avail", "sugar", "fibre", "sodium", "moisture", "ash", "salt"])}
NUM_RE = re.compile(r"^(<?\d+(?:\.\d+)?)(?:g)?$")
SIX = {"eggs", "milk", "nuts", "peanuts", "soya", "sulphites"}  # "not suitable for egg, milk, nut, peanut, soya and sulphite allergy sufferers"
EXTRA_WORDS = {"wheat gluten": ("gluten", "wheat"), "oat gluten": ("gluten", "oats")}
# Two cells of the table print a missing/extra comma; the allergens page prints the same cookies as "Egg, Milk, Soya, Wheat Gluten" and
# "Egg, Milk, Wheat Gluten, Oat Gluten". The words are all valid; only the separators are repaired, and the run stops if the cell changes.
TYPO_FIXES = {
    "Wheat, Gluten Eggs, Milk, Soya": ["Wheat Gluten", "Eggs", "Milk", "Soya"],
    "Wheat Gluten, Oat Gluten Eggs, Milk": ["Wheat Gluten", "Oat Gluten", "Eggs", "Milk"],
}
# allergens-page card name -> the table's name, where the two spell the cookie differently
CARD_NAMES = {"Caramelised Crunch": "Caramelized Crunch", "Double Chocolate & Nut": "Double Chocolate & Nuts",
              "Dark Chocolate & Nut": "Dark Chocolate & Nuts"}
CARDS_WITHOUT_ROW = {"Orange & Dark Chocolate"}  # on the allergens page, not in the nutrition table: no figures, so not published
ROWS_WITHOUT_CARD = {"Vegan Classic", "Vegan Double"}
HOLDBACK = {
    "Rum & Raisin": ("The page prints 422.5 kcal but 1621.0 kJ (about 387 kcal) and protein, fat and carbohydrate that add up to 387 kcal: "
                     "its own calories contradict its kJ and macros. Not corrected."),
}
NOTE = ("Figures are for an average 85 g cookie: the table prints 'Avg Size 85g' but never says 'per cookie' (protein, fat, carbohydrate, "
        "moisture and ash add up to about 85 g). Salt is Ben's own estimate from sodium. The page lists cookies only (no drinks or ice cream). "
        "Rum & Raisin is held back: its printed calories contradict its own kJ.")


# ---------------------------------------------------------------- fetching
def fetch(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(SITE + "/robots.txt", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        rules = robots_rfc.parse(resp.read().decode("utf-8", errors="replace"))
    for fname, url in PAGES.items():
        time.sleep(1.2)
        if not robots_rfc.allowed(rules, url[len(SITE):]):
            raise SystemExit(f"robots.txt disallows {url}: not fetched")
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as resp:
            (dest / fname).write_bytes(resp.read())


# ---------------------------------------------------------------- reading
class _Tables(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: list = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.tables.append([])
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None and self.tables:
            self.tables[-1].append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def read_table(page: Path) -> list:
    parser = _Tables()
    parser.feed(page.read_text(encoding="utf-8"))
    found = [t for t in parser.tables if t and t[0] == EXPECTED_HEADER]
    if len(found) != 1:
        raise SystemExit(f"Expected exactly one table with the header {EXPECTED_HEADER}, found {len(found)}: the page changed, re-read it.")
    rows = found[0][1:]
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"The table has {len(rows)} rows, expected {EXPECTED_ROWS}: the menu changed, re-check the script.")
    for r in rows:
        if len(r) != len(EXPECTED_HEADER):
            raise SystemExit(f"Row {r[:1]} has {len(r)} cells, expected {len(EXPECTED_HEADER)}")
    return rows


def num(raw: str, where: str) -> str:
    m = NUM_RE.match(raw.strip())
    if not m:
        raise SystemExit(f"{where}: {raw!r} is not a number as printed")
    return m.group(1)


def value(raw: str) -> float:
    return float(num(raw, "value").lstrip("<"))


def parse_allergen_cell(cell: str, where: str) -> tuple:
    cell = " ".join(cell.split())
    words = TYPO_FIXES.get(cell) or [w.strip() for w in cell.split(",")]
    tokens: list = []
    for w in words:
        m = re.fullmatch(r"Nuts \(([A-Za-z]+)\)", w)
        tokens += ["nuts", m.group(1)] if m else [w]
    return allergen_words(tokens, where, extra=EXTRA_WORDS)


def read_cards(page: Path) -> dict:
    text = page.read_text(encoding="utf-8")
    blocks = re.findall(r'<a href="https://www\.benscookies\.com/shop/[^"]+/" class="h6[^"]*">([^<]+)</a>(.*?)</div>\s*</div>\s*</div>', text, flags=re.S)
    if len(blocks) != EXPECTED_CARDS:
        raise SystemExit(f"The allergens page has {len(blocks)} cookie cards, expected {EXPECTED_CARDS}: re-read the page.")
    cards = {}
    for raw_name, rest in blocks:
        name = html.unescape(raw_name).strip()
        fields = {k.strip().rstrip(":"): " ".join(html.unescape(v).split())
                  for k, v in re.findall(r'<p[^>]*><span class="fw-bold">([^<]*)</span>\s*([^<]*)</p>', rest)}
        if set(fields) != {"Allergens", "May Contain"}:
            raise SystemExit(f"Card {name!r} has fields {sorted(fields)}, expected Allergens and May Contain")
        cards[name] = fields
    return cards


def may_contain_words(text: str) -> set:
    t = re.sub(r"(?i)^may contain\s+", "", " ".join(text.split()))
    tokens = [re.sub(r"(?i)^other\s+", "", x.strip()) for x in t.split(",")]
    return allergen_words(tokens, "card May Contain")[0]


def allergen_sets(contains: set) -> tuple:
    """(contains, may_contain) for one cookie: may-contain = the six allergens of the page's own statement, minus those it contains;
    a contained tree nut stays in may-contain ('other nuts', as the cards print)."""
    return contains, SIX - (contains - {"nuts"})


def check_statements(nutrition: Path, allergens: Path) -> None:
    for page, needles in ((nutrition, ["Our vegan cookies are prepared to a vegan recipe"]), (allergens, [])):
        text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", page.read_text(encoding="utf-8"))).split())
        for needle in ["not suitable for egg, milk, nut, peanut, soya and sulphite allergy sufferers",
                       "All Ben’s cookies contain cereals containing gluten"] + needles:
            if needle not in text:
                raise SystemExit(f"{page.name} no longer says {needle!r}: the allergen wording changed, re-read it.")


def build(pages: Path) -> tuple:
    nutrition, allergens = pages / "nutritional-information.html", pages / "allergens.html"
    check_statements(nutrition, allergens)
    rows = read_table(nutrition)
    cards = read_cards(allergens)
    names = [r[0].strip() for r in rows]
    if len(set(names)) != len(names):
        raise SystemExit("Cookie names in the table are not unique")
    # ---- allergen cross-check against the allergens page's own per-cookie cards
    card_rows = {CARD_NAMES.get(n, n): c for n, c in cards.items() if n not in CARDS_WITHOUT_ROW}
    if set(card_rows) != set(names) - ROWS_WITHOUT_CARD:
        raise SystemExit(f"Allergen cards and table rows no longer line up: only cards {sorted(set(card_rows) - set(names))}, "
                         f"only rows {sorted(set(names) - set(card_rows) - ROWS_WITHOUT_CARD)}")
    if set(cards) & CARDS_WITHOUT_ROW != CARDS_WITHOUT_ROW:
        raise SystemExit("A card expected without a table row is gone: re-check CARDS_WITHOUT_ROW")
    items, report = [], []
    for r in rows:
        name = r[0].strip()
        where = f"{name}"
        if r[COL["size"]] != "85g":
            raise SystemExit(f"{where}: Avg Size is {r[COL['size']]!r}, expected 85g for every row")
        mass = sum(value(r[COL[k]]) for k in ("protein", "fat", "carbs", "moisture", "ash"))
        if not 80.0 <= mass <= 90.0:
            raise SystemExit(f"{where}: protein+fat+carbohydrate+moisture+ash = {mass:.1f} g, not about 85 g: the basis is no longer clear "
                             "(per 100 g?), re-read the page before publishing")
        kcal, kj = value(r[COL["kcal"]]), value(r[COL["kj"]])
        if name not in HOLDBACK and abs(kj / 4.184 - kcal) / kcal > 0.05:
            raise SystemExit(f"{where}: {kcal} kcal vs {kj} kJ disagree by more than 5%: add it to HOLDBACK or re-read the page")
        contains, cereals, nuts = parse_allergen_cell(r[COL["allergens"]], where)
        contains_keys, may = allergen_sets(contains)
        card = card_rows.get(name)
        if card:
            c_keys, c_cereals, c_nuts = parse_allergen_cell(card["Allergens"], f"card {name}")
            if (c_keys, c_cereals, c_nuts) != (contains, cereals, nuts):
                raise SystemExit(f"{where}: the table's allergens {sorted(contains)} {sorted(cereals)} {sorted(nuts)} differ from the allergens "
                                 f"page's card {card['Allergens']!r}")
            if may_contain_words(card["May Contain"]) != may:
                raise SystemExit(f"{where}: may-contain rule gives {sorted(may)} but the card prints {card['May Contain']!r}")
        else:
            report.append(f"{name}: no card on the allergens page; contains from the table's column, may-contain from the page's own statement")
        n = {
            "calories": num(r[COL["kcal"]], where), "energy_kj": num(r[COL["kj"]], where), "weight_g": "85",
            "protein_g": num(r[COL["protein"]], where), "fat_g": num(r[COL["fat"]], where), "sat_fat_g": num(r[COL["sat"]], where),
            "mono_fat_g": num(r[COL["mono"]], where), "poly_fat_g": num(r[COL["poly"]], where), "trans_fat_g": num(r[COL["trans"]], where),
            "carbs_g": num(r[COL["carbs"]], where), "sugar_g": num(r[COL["sugar"]], where), "fiber_g": num(r[COL["fibre"]], where),
            "sodium_mg": num(r[COL["sodium"]], where), "salt_g": num(r[COL["salt"]], where),
        }
        also = (f"Also printed, no column in the data contract: starch {r[COL['starch']]} g, cholesterol {r[COL['chol']]} mg, available "
                f"carbohydrate {r[COL['avail']]} g, moisture {r[COL['moisture']]} g, ash {r[COL['ash']]} g. Saturates is printed 'incl. trans "
                f"fats'. Printed allergens: {' '.join(r[COL['allergens']].split())!r}. Protein+fat+carbohydrate+moisture+ash = {mass:.1f} g.")
        tags = ["vegetarian"] if name.startswith("Vegan ") else []
        items.append({"name": name, "category": "Cookies", "serving": "1 cookie (avg 85 g)", **n, "tags": "|".join(tags), "rankable": False,
                      "notes": also, "allergens": {"contains": contains_keys, "may_contain": may, "cereals": cereals, "nuts": nuts}})
    return items, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.pages)
    items, report = build(args.pages)
    holdback = []
    for it in items:
        if it["name"] in HOLDBACK:
            holdback.append((slug(it["name"]), HOLDBACK[it["name"]]))
    if len(holdback) != len(HOLDBACK):
        raise SystemExit("A HOLDBACK name is no longer in the table")
    d = args.checked_on
    guide = {"title": ALLERGEN_TITLE.format(d=d), "url": ALLERGENS_URL, "checked_on": d, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Ben's Cookies", cuisine="Bakery", source_title=SOURCE_TITLE.format(d=d),
                             source_url=NUTRITION_URL, checked_on=d, aliases=["ben's cookies", "bens cookies", "ben's", "bens"],
                             items=items, out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide)
    for fname in PAGES:
        print(f"{fname} sha256 {sha256_file(args.pages / fname)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
