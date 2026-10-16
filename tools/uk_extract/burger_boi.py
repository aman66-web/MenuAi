#!/usr/bin/env python3
"""Build data/source/burger-boi/ from Burger Boi's own allergen and nutrition table, and write the chain's halal row.

    python3 -I tools/uk_extract/burger_boi.py --cache DIR --checked-on 2026-10-16 [--out DIR] [--halal-csv FILE | --no-halal]

SOURCE (official). https://burgerboi.co.uk/allergens/ is the allergen page of Burger Boi's own website. It is server-rendered HTML (a
WordPress theme whose class names start with `tk-`; it is NOT one of the Ten Kites layouts, so tenkites_c's table readers do not apply, only
its small DOM helper is reused). The page is headed "Burger Boi 2026" and "Allergen information last updated 5 October 2026" (its own date). One
table, 77 dishes in 14 sections. Each dish row carries: the 14 allergens as "Contains" / "May contain" marks, five "Suitable for" marks
(Vegetarian, Vegan, Halaal, Gluten Free, Kosher) and eight "Nutrition values per serving" cells (Energy kCal, Fat, of which saturates,
Carbohydrate, of which sugars, Fibre, Protein, Salt). A figure the chain does not print is an em dash. Numbers are copied exactly as printed
(a thousands comma is dropped); nothing is converted, rounded, summed or filled in. Salt is salt_g (no sodium is printed).
Every request goes through images_common.polite_get (RFC 9309 robots matcher, one request a second, a normal browser User-Agent, cached by URL in
--cache). robots.txt of burgerboi.co.uk is "User-agent: * / Allow: /" (checked 2026-10-16). A 401/403/429 or a robots refusal stops the run and is
never retried another way.

Pages read (21): the allergen table; the 13 category pages under /menu/ and the 5 "Find your fuel" hub pages under /find-your-fuel/ (both read only to
cross-check the table, see below); /sitemap.xml and /locations/ (the site count: 19 location pages in the sitemap, "20+ Stores & Growing", all with one
menu; breakfast is the Manchester shop's only).

WHAT IS PUBLISHED. A dish is published only when the table prints calories, fat, carbohydrate AND protein for it (macros are all or none; a missing
fat figure is never filled in). That is 39 of the 77 dishes. The others are not published, and the run counts them by reason:
  - 4 dishes print calories, carbohydrate and protein but no fat (the four Fuel dishes: three bowls and the Butterfly Grilled Sandwich),
  - 11 print protein only (six smash burgers, three chicken sandwiches, the half and quarter chicken),
  - 23 print no figure at all (Bad Boi Rice, Lean Mess, kids box, tater tots, Hot Honey Ranch, a frappe, churros, the whole breakfast menu ...).
Breakfast (Manchester only, "Select Locations") prints no figures. Alcohol: none on the menu.

CROSS-CHECKS (nothing is chosen between, averaged or corrected; the run stops when the page changes shape):
  1. The page's header columns must be exactly the 14 + 5 + 8 expected; every row must have 27 cells; the title's "(NNN kcal)" must equal the
     Energy cell and the row's data-kcal attribute.
  2. Allergens are printed three ways for each dish: the 14 marked cells, the "Contains: ... May contain: ..." lines of the dish's detail row (which
     also name the cereals and tree nuts) and the data-contains / data-may attributes the page's own filter reads. All three must give the same
     allergens, the same named cereals and the same named nuts, or the run stops. The same holds for the Suitable-for marks (cells, detail line,
     data-diet) and the detail row's own nutrition mini-table (must equal the row's cells).
  3. The chain's category pages (/menu/<section>/) print a card per dish; a card may print "Ng protein" (and, for the Fuel range, carbs and kcal).
     Where a card prints a figure for a dish that the table also prints, the two must be the same, or the dish is held back (holdback.csv) with
     both figures in the reason. Two burgers differ by 1 g of protein: American (table 35.0, page 34g) and Hot Honey (table 42.0, page 41g).
     One card is a copy of another dish's card (the sauce page's "Korean Seoul" repeats the chicken sandwich's description and 33g protein, but the
     sauce's own table row prints 1.1 g): a card whose name, description and figures are identical to a card on another page is a repeat and is not
     compared (the run checks it really is one).
  4. The five "Find your fuel" hub pages (/find-your-fuel/protein-hub/ ... meal-prep-hub/; found by the independent second reader on 2026-10-16, they are
     one templated marketing page printed five times) list six dishes with "Ng protein" and, for four, "N cal". Where such a card names a dish the table
     prints (same name when the name is unique in the table; "Triple Cheese Boi" = Smash / Triple Cheese and "Hot Honey Smash" = Smash / Hot Honey, the
     same dishes by their main ingredients and sauces; HUB_ALIASES) and a printed figure differs, a PUBLISHED dish is held back like a menu-page disagreement. Today: Triple Cheese
     (table and menu card 55 g, hub 61 g) joins American and Hot Honey in holdback.csv (Hot Honey: hub 54 g, table 42 g, card 41 g); the hub's Cali Peri Bowl
     (48 g / 540 cal against 39 g / 382 kcal) and Teriyaki Beef Bowl (47 g / 520 cal against 32 g / 514 kcal) differ too but are not published anyway, and
     the Korean Seoul Bowl and Caesar Wrap are not in the table at all. The hub is otherwise weak evidence (it names Bristol among its shops though the sitemap has no Bristol page, calls the
     61 g dish the highest-protein item although the table prints 66 g and 77 g for the half chicken and ten wings, and shows a "SEARCH.NO" placeholder),
     so this is a judgement for the founder: delete a dish's line in holdback.csv to publish it on the table and menu card, which agree.
  5. A dish the table marks Vegan must not also be marked as containing milk, eggs, fish, crustaceans or molluscs (the chain's own row would contradict
     itself): such a dish is held back, nothing chosen between. Today: Ranch (Vegetarian, Vegan and Halaal, Contains: Eggs, Milk).
  6. The energy check of the pipeline (kcal against 4P + 4C + 9F) and the accuracy audit run on the built chain (check_chain.py).

OTHER RULES. Names are the chain's own with the "(NNN kcal)" tag removed; a name printed in more than one section gets a short suffix naming the
section ("Hot Honey (smash burger)", "(chicken sandwich)", "(dip)"). Tags: vegetarian only where the page marks the dish Vegetarian or Vegan; contains_beef /
contains_pork only where the dish's own name or its card description on the chain's menu page names beef or a pork product ("100% grass fed smashed beef";
"turkey bacon" is not pork). rankable: burgers, sandwiches, tender and wing portions, the Hot Mess dishes and the sides are rankable; dips, shakes and drinks are
not. A "NEW" badge on a card is a launch label, not a limited-time offer. Allergens are complete for every published dish, so allergens.csv is written; may-contain
is published.

HALAL. The page never makes a general statement about halal; its table marks the dishes it calls "Suitable for ... Halaal" (41 of 77 dishes, 39 of them
with full nutrition). That is the chain's own wording, so the chain is recorded as scope "some" in data/dietary/halal-burger-boi.csv (the file build_halal.py reads),
quoting the column header, one dish and its mark in the order the page prints them (the same approach as Bagel Factory, Puttshack and Powerleague). The script checks that the
three fragments occur in that order in the page's text, and that the Halaal marks agree between cells, detail lines and data-diet, before writing it.

HOW TO RERUN. Use a new --cache directory (or delete it). The run prints each page's SHA-256 and every decision. If it stops, read the message: a changed
section, header, count or disagreeing allergen row is a human check, never something to bypass.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import hashlib
import re
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import ROOT, allergen_words, write_chain_folder  # noqa: E402

CHAIN_ID = "burger-boi"
NAME = "Burger Boi"
SITE = "https://burgerboi.co.uk"
ALLERGENS_URL = SITE + "/allergens/"
SITEMAP_URL = SITE + "/sitemap.xml"
LOCATIONS_URL = SITE + "/locations/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

ALLERGEN_COLUMNS = ["Cereals with Gluten", "Tree Nuts", "Peanuts", "Eggs", "Milk", "Fish", "Crustaceans", "Molluscs", "Celery", "Mustard",
                    "Sesame Seeds", "Soya", "Sulphites", "Lupin"]
DIET_COLUMNS = ["Vegetarian", "Vegan", "Halaal", "Gluten Free", "Kosher"]
NUTRITION_COLUMNS = ["Energy (kCal)", "Fat (g)", "of which saturates (g)", "Carbohydrate (g)", "of which sugars (g)", "Fibre (g)",
                     "Protein (g)", "Salt (g)"]
FIELDS = ["calories", "fat_g", "sat_fat_g", "carbs_g", "sugar_g", "fiber_g", "protein_g", "salt_g"]   # same order as NUTRITION_COLUMNS
EXPECTED_ROWS = 77
EXPECTED_HEADING = "Burger Boi 2026"

# section printed in the table -> (category shown, rankable, the /menu/<page>/ that shows its cards or None, expected dishes)
SECTIONS = {
    "FUEL": ("Fuel bowls and wraps", True, "fuel", 4),
    "Smash": ("Smash burgers", True, "smashed-burgers", 10),
    "Tenders & Wings": ("Tenders and wings", True, "tenders-wings", 4),
    "Hot Mess": ("Hot Mess", True, "hot-mess", 4),
    "Chicken Sandwiches": ("Chicken sandwiches", True, "buttermilk-fried-chicken-sandwiches", 6),
    "Grilled Chicken": ("Grilled chicken", True, "grilled-chicken", 2),
    "Free From Meat": ("Free from meat", True, "free-from-meat", 1),
    "Kids": ("Kids", True, "kids", 1),
    "Sides": ("Sides", True, "sides", 3),
    "DIPS": ("Dips", False, "sauces", 9),
    "Shakes": ("Shakes", False, "bad-boi-shakes", 6),
    "Desserts": ("Desserts", False, "bad-boi-desserts", 2),
    "Drinks": ("Drinks", False, None, 10),
    "Breakfast": ("Breakfast (Manchester only)", True, "breakfast-manchester", 15),
}
# how a repeated name is told apart (only used for a name printed in more than one section)
SUFFIX = {"Smash": "smash burger", "Chicken Sandwiches": "chicken sandwich", "DIPS": "dip"}

# the five "Find your fuel" hub pages (one templated marketing page, printed five times); read only to cross-check the table
HUB_SLUGS = ["protein-hub", "smash-hub", "grilled-hub", "loaded-hub", "meal-prep-hub"]
# a hub card whose name is not the table's name but which describes the table's dish (same beef, cheese and sauces): hub name -> (table section, table name)
HUB_ALIASES = {"Triple Cheese Boi": ("Smash", "Triple Cheese"), "Hot Honey Smash": ("Smash", "Hot Honey")}
# a dish the table marks Vegan cannot also contain any of these
ANIMAL_ALLERGENS = {"milk", "eggs", "fish", "crustaceans", "molluscs"}

PORK = re.compile(r"\b(pork|ham|gammon|sausages?|salami|chorizo|pepperoni|pancetta|prosciutto|lardons?|lard|nduja)\b|(?<!turkey )\bbacon\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?|brisket|sirloin|rump|ribeye)\b", re.I)


def sha(data: bytes | str) -> str:
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode("utf-8")).hexdigest()


def get(url: str, cache: Path) -> bytes:
    return ic.polite_get(url, cache, accept=HTML_ACCEPT)


# ---------------------------------------------------------------- the allergen table

def cell_marks(td: tk.Node) -> tuple[str, str]:
    """('yes'|'may'|'', the screen-reader text) of one allergen / diet cell."""
    state = ""
    if td.find(cls="tk-tick"):
        state = "yes"
    if td.find(cls="tk-may"):
        if state:
            raise SystemExit("STOP: a cell carries both a tick and a 'may' mark")
        state = "may"
    sr = td.find(cls="screen-reader-text")
    return state, (sr.text() if sr else "")


def split_attr(value: str) -> set[str]:
    return {w.replace("-", " ") for w in value.split() if w}


def parse_line(text: str, head: str) -> list:
    """'Contains: Cereals with Gluten (Wheat), Milk' -> parts [(head, [inner]), ...]."""
    assert text.startswith(head)
    return tk._parts(text[len(head):])


def read_table(page: str, report: list[str]) -> tuple[list[dict], str, str]:
    root = tk.parse_html(page)
    table = root.find(cls="tk-table")
    if table is None:
        raise SystemExit("STOP: the allergen page no longer has its table (class tk-table): read it by hand")
    heading = (root.find(cls="tk-menu-name").text() if root.find(cls="tk-menu-name") else "")
    date_node = root.find(cls="tk-menu-name__date")
    m = re.search(r"Allergen information last updated (\d{1,2} [A-Za-z]+ \d{4})", date_node.text() if date_node else "")
    if not m or not heading.startswith(EXPECTED_HEADING):
        raise SystemExit(f"STOP: the page heading/date changed ({heading!r}): re-check the menu year and the date line")
    printed_date = m.group(1)
    # header: the second header row lists the 27 columns in order
    head_rows = table.find(tag="thead").find_all(tag="tr")
    cols = [th.text() for th in head_rows[1].find_all(tag="th")]
    want = ALLERGEN_COLUMNS + DIET_COLUMNS + NUTRITION_COLUMNS
    if cols != want:
        raise SystemExit(f"STOP: the table's columns changed.\n  now:      {cols}\n  expected: {want}")
    groups = [th.text() for th in head_rows[0].find_all(tag="th")]
    if groups != ["Contains/May contain", "Suitable for", "Nutrition values per serving"]:
        raise SystemExit(f"STOP: the table's column groups changed: {groups}")

    rows: list[dict] = []
    details: dict[str, tk.Node] = {}
    category = None
    for tbody in table.find_all(tag="tbody"):
        for tr in tbody.children:
            if not isinstance(tr, tk.Node) or tr.tag != "tr":
                continue
            if tr.has("tk-cat__row"):
                category = tr.find(tag="th").text()
                continue
            if tr.has("tk-detail"):
                details[tr.attrs.get("id", "")] = tr
                continue
            if not tr.has("tk-row"):
                continue
            title_node = tr.find(cls="tk-row__title")
            toggle = tr.find(cls="tk-row__toggle")
            tds = [td for td in tr.children if isinstance(td, tk.Node) and td.tag == "td"]
            if len(tds) != len(want):
                raise SystemExit(f"STOP: row {title_node.text()!r} has {len(tds)} cells, expected {len(want)}")
            rows.append({"section": category, "title": title_node.text(), "tds": tds, "attrs": tr.attrs, "detail_id": toggle.attrs.get("aria-controls", "")})
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"STOP: the table has {len(rows)} dishes, this script expects {EXPECTED_ROWS}: the menu changed, re-check the rules.")

    out = []
    per_section = collections.Counter(r["section"] for r in rows)
    if dict(per_section) != {k: v[3] for k, v in SECTIONS.items()}:
        raise SystemExit(f"STOP: the sections or their dish counts changed: {dict(per_section)}")
    for r in rows:
        where = f"{r['section']} / {r['title']}"
        tds = r["tds"]
        # nutrition
        nutr_cells = [tk.printed(td.text()) for td in tds[19:]]
        nums = {}
        for field, label, v in zip(FIELDS, NUTRITION_COLUMNS, nutr_cells):
            if v in ("—", "", "-"):
                nums[field] = ""
            elif tk.is_number(v) and not v.startswith("<"):
                nums[field] = v
            else:
                raise SystemExit(f"STOP: {where}: {label} prints {v!r}, which is neither a number nor a dash: read the page by hand")
        # title tag "(NNN kcal)"
        mt = re.match(r"^(.*?)\s*\(([\d,]+) kcal\)$", r["title"])
        name = (mt.group(1) if mt else r["title"]).strip()
        title_kcal = mt.group(2).replace(",", "") if mt else ""
        data_kcal = r["attrs"].get("data-kcal", "")
        if not (title_kcal == nums["calories"] == data_kcal):
            raise SystemExit(f"STOP: {where}: the title says {title_kcal!r} kcal, the Energy cell {nums['calories']!r}, data-kcal {data_kcal!r}")
        # allergens: cells
        cell_contains, cell_may = [], []
        for label, td in zip(ALLERGEN_COLUMNS, tds[:14]):
            state, sr = cell_marks(td)
            if state == "yes":
                if sr != f"Contains {label}":
                    raise SystemExit(f"STOP: {where}: cell for {label} reads {sr!r}")
                cell_contains.append(label)
            elif state == "may":
                if sr != f"May contain {label}":
                    raise SystemExit(f"STOP: {where}: cell for {label} reads {sr!r}")
                cell_may.append(label)
            elif sr:
                raise SystemExit(f"STOP: {where}: cell for {label} has text {sr!r} but no mark")
        # diet marks
        diets = []
        for label, td in zip(DIET_COLUMNS, tds[14:19]):
            state, sr = cell_marks(td)
            if state == "yes":
                if sr != f"Suitable for {label}":
                    raise SystemExit(f"STOP: {where}: diet cell {label} reads {sr!r}")
                diets.append(label)
            elif state or sr:
                raise SystemExit(f"STOP: {where}: diet cell {label} is {state!r} {sr!r}")
        # the detail row
        det = details.get(r["detail_id"])
        if det is None:
            raise SystemExit(f"STOP: {where}: no detail row {r['detail_id']!r}")
        lines, notes = [], []
        for p in det.find_all(cls="tk-detail__line"):
            (notes if p.has("tk-detail__note") else lines).append(p.text())
        contains_line = next((x for x in lines if x.startswith("Contains:")), "")
        may_line = next((x for x in lines if x.startswith("May contain:")), "")
        suit_line = next((x for x in lines if x.startswith("Suitable for:")), "")
        unknown = [x for x in lines if x not in (contains_line, may_line, suit_line)]
        if unknown or len([x for x in lines if x.startswith("Contains:")]) > 1:
            raise SystemExit(f"STOP: {where}: an unknown or repeated line in the dish's detail: {unknown}")
        c_parts = parse_line(contains_line, "Contains:") if contains_line else []
        m_parts = parse_line(may_line, "May contain:") if may_line else []
        c_keys, c_cereals, c_nuts = tk._keys(c_parts, where, None)
        m_keys, m_cereals, m_nuts = tk._keys(m_parts, where, None)
        col_c, _, _ = allergen_words(cell_contains, where)
        col_m, _, _ = allergen_words(cell_may, where)
        # one cell holds one state: an allergen printed under both Contains and May contain (wheat contained, barley/oats/rye possible) is ticked as Contains
        if col_c != c_keys or col_m != m_keys - c_keys:
            raise SystemExit(f"STOP: {where}: allergen cells (contains {sorted(col_c)}, may {sorted(col_m)}) disagree with the printed lines "
                             f"(contains {sorted(c_keys)}, may {sorted(m_keys)})")
        # data-contains lists the contained allergens and their named cereals/nuts; data-may the may-contain ones
        a_contains, a_may = split_attr(r["attrs"].get("data-contains", "")), split_attr(r["attrs"].get("data-may", ""))
        att_c, att_c_cer, att_c_nut = allergen_words(sorted(a_contains), where + " data-contains")
        att_m, att_m_cer, att_m_nut = allergen_words(sorted(a_may), where + " data-may")
        if (att_c, att_c_cer, att_c_nut) != (c_keys, c_cereals, c_nuts) or (att_m, att_m_cer, att_m_nut) != (m_keys, m_cereals, m_nuts):
            raise SystemExit(f"STOP: {where}: the page's filter attributes (contains {sorted(a_contains)}, may {sorted(a_may)}) disagree with the printed lines")
        # diet: detail line and data-diet
        diet_line = sorted(x.strip() for x in suit_line.removeprefix("Suitable for:").split(",") if x.strip())
        diet_attr = sorted(r["attrs"].get("data-diet", "").split())
        if diet_line != sorted(diets) or diet_attr != sorted(d.lower().replace(" ", "-") for d in diets):
            raise SystemExit(f"STOP: {where}: Suitable-for marks disagree: cells {diets}, line {diet_line}, data-diet {r['attrs'].get('data-diet')!r}")
        # the detail row's own nutrition mini-table must equal the cells
        mini = det.find(cls="tk-nutrition")
        mini_vals = [tk.printed(td.text()) for td in mini.find_all(tag="td")] if mini else []
        if mini_vals != nutr_cells:
            raise SystemExit(f"STOP: {where}: the detail row's nutrition {mini_vals} differs from the table row {nutr_cells}")
        out.append({"section": r["section"], "raw": r["title"], "name": name, "nums": nums, "diets": diets,
                    "contains": c_keys, "may": m_keys, "cereals": c_cereals, "nuts": c_nuts, "notes": notes})
    report.append(f"table: {len(out)} dishes in {len(per_section)} sections, columns and all cross-checks agree")
    return out, printed_date, root.find(cls="tk-table").text()


# ---------------------------------------------------------------- the category pages (cross-check only)

def read_cards(page: str) -> list[dict]:
    root = tk.parse_html(page)
    cards = []
    for art in root.find_all(cls="mcard"):
        title = art.find(cls="mcard__title")
        desc = art.find(cls="mcard__desc")
        meta = [li.text() for li in art.find_all(cls="mcard__meta-item")]
        cards.append({"name": title.text() if title else "", "desc": desc.text() if desc else "", "meta": meta})
    return cards


def card_figures(meta: list[str]) -> dict:
    """{'protein_g': '34', 'carbs_g': '38', 'calories': '382'} from 'Ng protein', 'Ng carbs', 'N kcal' items; other items are ignored."""
    out = {}
    for item in meta:
        for rx, field in ((r"^(\d+(?:\.\d+)?)\s*g protein$", "protein_g"), (r"^(\d+(?:\.\d+)?)\s*g carbs$", "carbs_g"), (r"^([\d,]+)\s*kcal$", "calories")):
            m = re.match(rx, item)
            if m:
                out[field] = m.group(1).replace(",", "")
    return out


def read_hub_cards(page: str) -> list[dict]:
    """The 'Find your fuel' hub's dish cards: name, description and the 'Ng protein' / 'N cal' items."""
    root = tk.parse_html(page)
    cards = []
    for li in root.find_all(cls="ffprod"):
        title = li.find(cls="ffprod__title")
        desc = li.find(cls="ffprod__desc")
        meta = [x.text() for x in li.find_all(cls="ffprod__meta-item")]
        cards.append({"name": title.text() if title else "", "desc": desc.text() if desc else "", "meta": meta})
    return cards


def hub_figures(meta: list[str]) -> dict:
    """{'protein_g': '61', 'calories': '540'} from the hub's 'Ng protein' and 'N cal' items."""
    out = {}
    for item in meta:
        for rx, field in ((r"^(\d+(?:\.\d+)?)\s*g protein$", "protein_g"), (r"^([\d,]+)\s*cal$", "calories")):
            m = re.match(rx, item)
            if m:
                out[field] = m.group(1).replace(",", "")
    return out


def num_eq(a: str, b: str) -> bool:
    return float(a) == float(b)


def card_diffs(nums: dict, card: dict) -> list[tuple[str, str, str]]:
    """[(label, table value, card value)] for each figure the card prints that the table also prints and that differs."""
    out = []
    for field, printed_v in card_figures(card["meta"]).items():
        if nums[field] != "" and not num_eq(nums[field], printed_v):
            out.append(({"protein_g": "protein", "carbs_g": "carbs", "calories": "kcal"}[field], nums[field], printed_v))
    return out


# ---------------------------------------------------------------- decisions

def tags_for(dish: dict, card: dict | None) -> list[str]:
    tags = []
    if "Vegetarian" in dish["diets"] or "Vegan" in dish["diets"]:
        tags.append("vegetarian")
    text = dish["name"] + " " + ((card or {}).get("desc") or "")
    if PORK.search(text):
        tags.append("contains_pork")
    if BEEF.search(text):
        tags.append("contains_beef")
    return tags


def build(cache: Path, checked_on: dt.date) -> dict:
    report: list[str] = []
    # robots.txt first (polite_get also checks it for every URL)
    page_bytes = get(ALLERGENS_URL, cache)
    page = page_bytes.decode("utf-8")
    report.append(f"{ALLERGENS_URL}: {len(page_bytes)} bytes, sha256 {sha(page_bytes)[:16]}")
    dishes, printed_date, table_text = read_table(page, report)

    sitemap = get(SITEMAP_URL, cache).decode("utf-8")
    locations = sorted(set(re.findall(r"<loc>https://burgerboi\.co\.uk/locations/([a-z0-9-]+)/</loc>", sitemap)))
    if len(locations) < 3:
        raise SystemExit(f"STOP: only {len(locations)} location pages in the sitemap: the 3-site rule is not met")
    report.append(f"sitemap: {len(locations)} location pages ({', '.join(locations)}), sha256 {sha(sitemap)[:16]}")
    loc_page = get(LOCATIONS_URL, cache).decode("utf-8")
    m = re.search(r"(\d+\+) Stores", loc_page)
    report.append(f"locations page: {m.group(0) if m else 'no store count printed'}, sha256 {sha(loc_page)[:16]}")

    # category pages -> cards
    cards: dict[str, list[dict]] = {}
    for sec, (_cat, _rk, slug_, _n) in SECTIONS.items():
        if slug_:
            url = f"{SITE}/menu/{slug_}/"
            body = get(url, cache).decode("utf-8")
            cards[sec] = read_cards(body)
            report.append(f"{url}: {len(cards[sec])} cards, sha256 {sha(body)[:16]}")

    # repeated cards: the same name + description + figures on another section's page is a copy
    def card_key(c):
        return (c["name"], c["desc"], tuple(c["meta"]))
    seen_elsewhere: dict[tuple, set] = collections.defaultdict(set)
    for sec, cs in cards.items():
        for c in cs:
            seen_elsewhere[card_key(c)].add(sec)

    # the five "Find your fuel" hub pages -> cards, matched to the table's dishes by name (or HUB_ALIASES); cross-check only
    hub_cards: list[tuple[str, dict]] = []
    for slug_ in HUB_SLUGS:
        url = f"{SITE}/find-your-fuel/{slug_}/"
        try:
            body = get(url, cache).decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                report.append(f"{url}: 404, the page no longer exists (not compared)")
                continue
            raise
        cs = read_hub_cards(body)
        hub_cards.extend((url, c) for c in cs)
        report.append(f"{url}: {len(cs)} hub cards, sha256 {sha(body)[:16]}")
    by_name: dict[str, list[dict]] = collections.defaultdict(list)
    for d in dishes:
        by_name[d["name"]].append(d)
    hub_diffs: dict[int, dict[tuple, set]] = collections.defaultdict(lambda: collections.defaultdict(set))   # id(dish) -> {(hub name, label, table, hub): {urls}}
    hub_unmatched: set[str] = set()
    hub_checks = 0
    for url, c in hub_cards:
        if c["name"] in HUB_ALIASES:
            sec, nm = HUB_ALIASES[c["name"]]
            targets = [d for d in by_name.get(nm, []) if d["section"] == sec]
        else:
            targets = by_name.get(c["name"], [])
            if len(targets) != 1:      # unknown, or printed in two sections: never matched without an alias
                targets = []
        if len(targets) != 1:
            hub_unmatched.add(c["name"])
            continue
        d = targets[0]
        for field, v in hub_figures(c["meta"]).items():
            hub_checks += 1
            if d["nums"][field] != "" and not num_eq(d["nums"][field], v):
                label = {"protein_g": "protein", "calories": "kcal"}[field]
                hub_diffs[id(d)][(c["name"], label, d["nums"][field], v)].add(url)
    if hub_cards:
        report.append(f"hub cross-check: {len(hub_cards)} cards on {len(HUB_SLUGS)} pages, {hub_checks} figures compared with the table; no match in the table for: "
                      + (", ".join(sorted(hub_unmatched)) or "none"))
        for d in dishes:
            for (hub_name, label, t, v), urls in sorted(hub_diffs.get(id(d), {}).items()):
                report.append(f"HUB DIFFERS: {d['section']} / {d['name']}: table {t} {label}, hub card {hub_name!r} {v} ({len(urls)} pages)")

    names_total = collections.Counter(d["name"] for d in dishes)
    for d in dishes:
        d["dup"] = names_total[d["name"]] > 1
        d["display"] = f"{d['name']} ({SUFFIX[d['section']]})" if d["dup"] else d["name"]
        if d["dup"] and d["section"] not in SUFFIX:
            raise SystemExit(f"STOP: {d['name']!r} is printed twice and section {d['section']!r} has no suffix rule")

    holdback: list[tuple[str, str]] = []
    not_published = collections.Counter()
    not_published_names: dict[str, list[str]] = collections.defaultdict(list)
    skipped_cards: list[str] = []
    items: list[dict] = []
    published_dishes = []
    card_checks = 0
    for d in dishes:
        n = d["nums"]
        macro = [n["fat_g"], n["carbs_g"], n["protein_g"]]
        if n["calories"] == "" or "" in macro:
            if n["calories"] == "" and n["protein_g"] == "" and n["carbs_g"] == "" and n["fat_g"] == "":
                why = "no figure at all is printed"
            elif n["calories"] != "" and n["fat_g"] == "":
                why = "calories, carbohydrate and protein are printed but no fat"
            elif n["calories"] == "" and n["protein_g"] != "":
                why = "only protein is printed"
            else:
                why = "an incomplete set of figures is printed"
            not_published[why] += 1
            not_published_names[why].append(f"{d['section']}: {d['display']}")
            continue
        # card cross-check
        section_cards = [c for c in cards.get(d["section"], []) if c["name"] == d["name"]]
        card = None
        hold = ""
        if len(section_cards) > 1:
            raise SystemExit(f"STOP: {d['section']} / {d['name']}: {len(section_cards)} cards with that name on the category page")
        if section_cards:
            card = section_cards[0]
            diffs = card_diffs(n, card)
            checks = len(card_figures(card["meta"]))
            card_checks += checks
            if diffs:
                # An identical card (same name, description and figures) printed on another section's page whose own table row it AGREES with is
                # a repeat of that dish's card, not a figure for this one (the sauce page's "Korean Seoul" repeats the chicken sandwich's card).
                twins = [dd for dd in dishes if dd is not d and dd["name"] == d["name"] and dd["section"] in seen_elsewhere[card_key(card)]
                         and not card_diffs(dd["nums"], card) and card_figures(card["meta"])]
                if twins:
                    skipped_cards.append(f"{d['section']} / {d['name']}: the card ({card['desc']!r}, {card['meta']}) is identical to the card on the {twins[0]['section']} "
                                         f"page, whose table row it agrees with, so it is a repeat of that dish's card and is not compared")
                    card = None
                else:
                    hold = "; ".join(f"the table prints {t} g {l}" if l != "kcal" else f"the table prints {t} kcal" for l, t, _ in diffs)
                    hold += " but the card on " + f"{SITE}/menu/{SECTIONS[d['section']][2]}/" + " prints " + "; ".join(
                        f"{p}g {l}" if l != "kcal" else f"{p} kcal" for l, _, p in diffs)
        item = {"name": d["display"], "category": SECTIONS[d["section"]][0], "calories": n["calories"], "protein_g": n["protein_g"], "carbs_g": n["carbs_g"],
                "fat_g": n["fat_g"], "sat_fat_g": n["sat_fat_g"], "salt_g": n["salt_g"], "sugar_g": n["sugar_g"], "fiber_g": n["fiber_g"],
                "tags": "|".join(tags_for(d, card)), "rankable": SECTIONS[d["section"]][1],
                "allergens": {"contains": d["contains"], "may_contain": d["may"], "cereals": d["cereals"], "nuts": d["nuts"]}}
        # every reason this dish cannot be published: (short text for items.csv notes, full sentence for holdback.csv)
        holds: list[tuple[str, str]] = []
        if hold:
            holds.append((hold, "Burger Boi's own allergen table and its own menu page print different figures for this dish: " + hold +
                          ". Two figures from the chain for one dish, so neither is published."))
        for (hub_name, label, t, v), urls in sorted(hub_diffs.get(id(d), {}).items()):
            first = next((u for u in sorted(urls) if u.endswith('/protein-hub/')), sorted(urls)[0])
            short = f"the table prints {t} {'g ' if label != 'kcal' else ''}{label} but the 'Find your fuel' hub cards for {hub_name!r} on {first} print {v}{'g ' if label != 'kcal' else ' '}{label}"
            holds.append((short, f"Burger Boi's own allergen table and its own 'Find your fuel' pages print different figures for this dish: {short}"
                                 f" ({len(urls)} identical hub pages; the card is matched to this dish by its name or by HUB_ALIASES). Two figures from the chain for one dish, so neither is published."))
        bad_vegan = sorted(set(d["contains"]) & ANIMAL_ALLERGENS) if "Vegan" in d["diets"] else []
        if bad_vegan:
            short = f"the table marks it Vegan and also as containing {', '.join(bad_vegan)}"
            holds.append((short, f"Burger Boi's own allergen table marks this dish Vegan and also marks it as containing {', '.join(bad_vegan)}. "
                                 "Two statements from the chain that cannot both be right, so neither is published."))
        if holds:
            item["notes"] = "held back: " + "; ".join(h[0] for h in holds)
        items.append(item)
        published_dishes.append(d)
        d["item"] = item
        d["holds"] = holds
        d["hold"] = "; ".join(h[0] for h in holds)

    # item ids as write_chain_folder will make them, to name the held-back rows
    from common import slug
    ids = {}
    seen: dict[str, int] = {}
    for it in items:
        base = slug(it["name"])
        k = seen.get(base, 0)
        seen[base] = k + 1
        ids[id(it)] = base if k == 0 else f"{base}-{k + 1}"
    for d in published_dishes:
        if d["holds"]:
            holdback.append((ids[id(d["item"])], " ".join(h[1] for h in d["holds"])))
    n_pub = sum(1 for d in published_dishes if not d["hold"])
    return {"items": items, "holdback": holdback, "dishes": dishes, "printed_date": printed_date, "report": report, "locations": locations,
            "not_published": not_published, "not_published_names": not_published_names, "skipped_cards": skipped_cards, "n_pub": n_pub,
            "table_text": table_text, "card_checks": card_checks, "hub_checks": hub_checks, "published_dishes": published_dishes, "page": page, "ids": ids}


# ---------------------------------------------------------------- halal row

def halal_row(res: dict, checked_on: dt.date) -> list[str]:
    """chain_id, scope, statement, source_url, checked_on: the table's own "Suitable for ... Halaal" marks, quoted in page order."""
    dishes = res["dishes"]
    ticked = [d for d in dishes if "Halaal" in d["diets"]]
    if len(ticked) != 41:
        raise SystemExit(f"STOP: {len(ticked)} dishes are marked Halaal (41 expected): the halal marks changed, re-read the page")
    pick = next((d for d in res["published_dishes"] if not d["hold"] and "Halaal" in d["diets"]), None)
    if pick is None:
        raise SystemExit("STOP: no published dish is marked Halaal")
    statement = f"Suitable for … Halaal … {pick['raw']} … Suitable for Halaal"
    text = res["table_text"]
    pos = 0
    for frag in ("Suitable for", "Halaal", pick["raw"], "Suitable for Halaal"):
        i = text.find(frag, pos)
        if i < 0:
            raise SystemExit(f"STOP: the halal quote's fragment {frag!r} does not occur in order in the page's table text")
        pos = i + len(frag)
    return [CHAIN_ID, "some", statement, ALLERGENS_URL, checked_on.isoformat()]


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--halal-csv", type=Path, default=ROOT / "data" / "dietary" / "halal-burger-boi.csv")
    g.add_argument("--no-halal", action="store_true")
    args = ap.parse_args()
    checked_on = dt.date.fromisoformat(args.checked_on)
    try:
        res = build(args.cache, checked_on)
    except ic.Blocked as e:
        print(f"STOP (blocked, never worked round): {e}", file=sys.stderr)
        return 2

    n_items, n_hold = len(res["items"]), len(res["holdback"])
    total = len(res["dishes"])
    note = (f"Per-serving figures from Burger Boi's own allergen table. It prints calories, fat, carbs and protein for only {n_items} of its {total} dishes, so the rest "
            f"(most burgers, the Fuel bowls, breakfast) are not shown" + (f", and {n_hold} dishes are left out because the chain's own pages or marks disagree with its table." if n_hold else "."))
    guide = {"title": f"Burger Boi allergen and nutrition table (burgerboi.co.uk/allergens, printed 'Allergen information last updated {res['printed_date']}')",
             "url": ALLERGENS_URL, "checked_on": args.checked_on, "may_contain_published": True}
    write_chain_folder(
        chain_id=CHAIN_ID, name=NAME, cuisine="Burgers",
        source_title=f"Burger Boi allergen and nutrition table (menu 'Burger Boi 2026', printed 'Allergen information last updated {res['printed_date']}', read {args.checked_on})",
        source_url=ALLERGENS_URL, checked_on=args.checked_on, aliases=["burger boi", "burgerboi"],
        items=res["items"], out=args.out, note=note, holdback=res["holdback"], allergen_guide=guide)
    if not res["holdback"]:
        (args.out / "holdback.csv").unlink(missing_ok=True)

    print("\n".join(res["report"]))
    print(f"\nwrote {args.out}: {n_items} items in {len({i['category'] for i in res['items']})} categories, {n_hold} held back (published {res['n_pub']}), "
          f"{len(res['locations'])} GB sites, printed date {res['printed_date']}")
    cats = collections.Counter(i["category"] for i in res["items"])
    for c, k in cats.items():
        print(f"  {c}: {k}")
    print(f"card cross-checks run: {res['card_checks']}; hub figures compared: {res['hub_checks']}")
    for h in res["holdback"]:
        print("HELD BACK", h[0], "-", h[1])
    for s in res["skipped_cards"]:
        print("CARD NOT COMPARED:", s)
    print("NOT PUBLISHED (the table's own figures are incomplete):")
    for why, k in res["not_published"].items():
        print(f"  {k} dishes: {why}: " + "; ".join(res["not_published_names"][why]))
    if not args.no_halal:
        row = halal_row(res, checked_on)
        args.halal_csv.parent.mkdir(parents=True, exist_ok=True)
        with open(args.halal_csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["chain_id", "scope", "statement", "source_url", "checked_on"])
            w.writerow(row)
        print(f"wrote {args.halal_csv}: {row[1]}: {row[2]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
