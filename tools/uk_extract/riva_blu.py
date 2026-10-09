#!/usr/bin/env python3
"""Build data/source/riva-blu/ from Riva Blu's own allergen and calorie guide (one PDF for the whole brand). A CALORIES-ONLY chain.

    python3 tools/uk_extract/riva_blu.py path/to/riva-blu.pdf --checked-on 2026-10-09 [--fetch] [--out DIR]

Source: https://www.rivablu.co.uk/allergens/riva-blu-manchester (the file the chain's own menu page calls "our allergen guide (PDF)": "Allergen
and calorie information for this restaurant is in our allergen guide"). The same address with -hull, -leeds-springs and -liverpool serves the
byte-identical file (SHA-256 680ece22f23c054ca664fff27a7e5e0d6962b022a61984e0a4b2ef17b549b266, checked 2026-10-09; the Leeds address answers 404
and Leeds' own menu page does not link a guide). The PDF is titled "V18 Riva Al & Cal AW25", 26 pages with a text layer, created 25 August 2026
and dated "25/08/2026" on its first page. --fetch downloads it to the given path (one request). robots.txt of www.rivablu.co.uk disallows only
/order/, /api/, /healthz, /sign-in, /sign-up, /account, /bookings and /cms-preview. Needs `pdftotext` (poppler). Reader: riva_blu_pdf.py.

SITES (founder's bar, 10 Oct 2026: 3 or more UK sites). https://www.rivablu.co.uk/locations (read 2026-10-09) lists five restaurants: Hull
(Kingswood Retail Park), Leeds (Park Row), Leeds The Springs, Liverpool and Manchester (Corn Exchange).

WHAT IS PRINTED. Each dish row prints calories in a "Kcal" column and 14 allergen cells (the cereal or YES/NO, the tree nut named or YES/NO, and
YES/NO for the other twelve) and nothing else numeric: no protein, carbohydrate, fat, salt, sugar, fibre, kJ or weight. So protein_g, carbs_g,
fat_g and every other nutrient column stay blank (never 0) and the chain is calories-only (docs/DATA.md). A thousands comma is dropped
("1,166" -> 1166); nothing else is changed. The guide prints no "may contain" information, so may_contain_published is no.

TABLES WITH CALORIES (141 rows) are published; the tables without a Kcal column (Bambini, Lunch, Set menu, Drinks, Wine, Bottomless Brunch and the
Venti Sapori drinks / pizza list: 363 rows) are not listed, because this is a calories chain.

CHOICES (all logged in the report; none touches a number):
- "METRO ONLY" tables (Sharing, Secondi Piatti) are published: the chain's own menu pages for Hull, Leeds, Liverpool and Manchester carry those dishes
  (TAGLIERE MISTO, TONNO GRIGLIATO, ORATA ... checked 2026-10-09), four of the five sites; Leeds The Springs' page does not. The "PIZZA (RETAIL ONLY)"
  table (one row, BURRATA pizza, 1,455 kcal) is for Leeds The Springs only (the one other site page that lists a pizza BURRATA), so it is left out.
- The Sunday Roast table on page 12 is headed "DRINKS" in the guide (a template slip); its rows are the Sunday roast. The Venti Sapori menu has its own
  Sunday roast table (page 11) with other calories, so the same names (Manzo, Pollo, Porchetta, Vegano) appear twice: each is kept under its own
  category with the category in brackets in the name.
- A dish printed on two tables with the same name, calories and allergens is dropped as a repeat (the first table in the guide is kept); the same name
  with other calories (Calamari 942 / 905, Fettuccine Bolognese 588 / 562) is kept under the name plus the category in brackets.
- "ZUCCHUNE E TARTUFO" is printed so in the guide; the chain's own menu page prints ZUCCHINE E TARTUFO, so the name is spelled that way.
- Names are the guide's capitals turned into title case. Tags: vegetarian only where the dish's printed name says VEGAN / VEGANO / VEGETARIAN
  (the guide has no other diet mark); contains_pork / contains_beef only from the printed name (prosciutto, pancetta, porchetta, manzo = beef, steak cuts).
- The Canapé menu rows are published as printed (the guide does not say "per piece"; the row is the canapé).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import riva_blu_pdf as rp  # noqa: E402
import tenkites_c as tk  # noqa: E402  (only for PORK / BEEF / meat_tags)
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "riva-blu"
SOURCE_URL = "https://www.rivablu.co.uk/allergens/riva-blu-manchester"
SOURCE_TITLE = "Riva Blu allergen guide with calories, V18 Riva Al & Cal AW25 (dated 25/08/2026; one guide for all restaurants)"
ALLERGEN_TITLE = "Riva Blu allergen guide, V18 Riva Al & Cal AW25 (dated 25/08/2026)"
EXPECTED_TOTAL_ROWS = 504
EXPECTED_KCAL_ROWS = 141
NOTE = ("Calories only: protein, carbs and fat are not published. Five restaurants per rivablu.co.uk/locations, checked {checked}; the guide's "
        "'metro only' dishes are on four of them (not Leeds The Springs). Tables without calories (kids, lunch, set menu, drinks, wine) are not listed.")
# (box title, table header) -> (category, published?) ; the reason a table is left out is in `why`
TABLES = {
    ("MAIN MENU", "SHARING"): "Sharing",
    ("MAIN MENU", "SHARING (METRO ONLY)"): "Sharing (metro only)",
    ("MAIN MENU", "BRUSCHETTA & ANTIPASTI"): "Bruschetta & antipasti",
    ("MAIN MENU", "PASTA & RISOTTO"): "Pasta & risotto",
    ("MAIN MENU", "PIZZA"): "Pizza",
    ("MAIN MENU", "PIZZA (RETAIL ONLY)"): None,
    ("MAIN MENU", "SALSETTE (HOUSE DIPS)"): "Salsette (house dips)",
    ("MAIN MENU", "SECONDI PIATTI (METRO ONLY)"): "Secondi piatti (metro only)",
    ("MAIN MENU", "STEAK SAUCES"): "Steak sauces",
    ("MAIN MENU", "EXTRA"): "Extras",
    ("MAIN MENU", "SIDES"): "Sides",
    ("DESSERT MENU", "DESSERTS"): "Desserts",
    ("DESSERT MENU", "GELATI E SORBETTI"): "Gelati e sorbetti",
    ("DESSERT MENU", "CELEBRATION CAKES"): "Celebration cakes",
    ("VENTI MENU", "STARTERS"): "Venti Sapori: starters",
    ("VENTI MENU", "MAINS"): "Venti Sapori: mains",
    ("VENTI MENU", "SUNDAY ROAST"): "Venti Sapori: Sunday roast",
    ("SUNDAY ROAST", "DRINKS"): "Sunday roast",          # the guide's own header slip (see CHOICES)
    ("CANAPE MENU", "BRUSCHETTA"): "Canapés: bruschetta",
    ("CANAPE MENU", "PIZZETTE"): "Canapés: pizzette",
    ("CANAPE MENU", "FRITTI"): "Canapés: fritti",
    ("CANAPE MENU", "CICCHETTI"): "Canapés: cicchetti",
}
EXCLUDED = {("MAIN MENU", "PIZZA (RETAIL ONLY)"): "one site only (Leeds The Springs)"}
EXPECTED_COUNTS = {   # rows with calories per table, so a change in the guide stops the run
    ("MAIN MENU", "SHARING"): 4, ("MAIN MENU", "SHARING (METRO ONLY)"): 3, ("MAIN MENU", "BRUSCHETTA & ANTIPASTI"): 13,
    ("MAIN MENU", "PASTA & RISOTTO"): 14, ("MAIN MENU", "PIZZA"): 8, ("MAIN MENU", "PIZZA (RETAIL ONLY)"): 1,
    ("MAIN MENU", "SALSETTE (HOUSE DIPS)"): 3, ("MAIN MENU", "SECONDI PIATTI (METRO ONLY)"): 15, ("MAIN MENU", "STEAK SAUCES"): 1,
    ("MAIN MENU", "EXTRA"): 3, ("MAIN MENU", "SIDES"): 10, ("DESSERT MENU", "DESSERTS"): 9, ("DESSERT MENU", "GELATI E SORBETTI"): 8,
    ("DESSERT MENU", "CELEBRATION CAKES"): 1, ("VENTI MENU", "STARTERS"): 6, ("VENTI MENU", "MAINS"): 12,
    ("VENTI MENU", "SUNDAY ROAST"): 5, ("SUNDAY ROAST", "DRINKS"): 9, ("CANAPE MENU", "BRUSCHETTA"): 4, ("CANAPE MENU", "PIZZETTE"): 4,
    ("CANAPE MENU", "FRITTI"): 4, ("CANAPE MENU", "CICCHETTI"): 4,
}
# Rows held back for a reason of their own (never corrected): item id -> reason.
HOLDBACK = {
    "almond-wafer-cone": "The guide prints NO under tree nuts for its ALMOND WAFER CONE row (gluten and soya only, the same on its three tables), "
                         "but the dish's own name says almond: the allergen row contradicts the name, so the row is not published.",
}
NAME_FIXES = {"ZUCCHUNE E TARTUFO": "ZUCCHINE E TARTUFO", "ZUCCHUNE E TARTUFO VEGAN": "ZUCCHINE E TARTUFO VEGAN"}
SMALL = {"di", "e", "al", "alla", "ai", "con", "da", "del", "della", "in", "a", "all", "dei", "delle", "and", "with", "of", "the"}
DIET = re.compile(r"\b(vegan|vegano|vegetarian)\b", re.I)
ITALIAN_BEEF = re.compile(r"\b(manzo)\b", re.I)
ITALIAN_PORK = re.compile(r"\b(porchetta)\b", re.I)
# column -> the allergen word allergen_words() knows it by
WORD = {"milk": "milk", "egg": "eggs", "peanuts": "peanuts", "crustaceans": "crustaceans", "mustard": "mustard", "fish": "fish", "lupin": "lupin",
        "sesame": "sesame", "celery": "celery", "soya": "soya", "molluscs": "molluscs", "sulphites": "sulphites"}


def fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def title_case(printed: str) -> str:
    """'PANE FINO ALL'AGLIO - GARLIC & ROSEMARY FOCACCIA' -> "Pane Fino All'Aglio - Garlic & Rosemary Focaccia"."""
    out = []
    for i, tok in enumerate(printed.split()):
        if re.search(r"\d", tok) or tok in ("&", "-"):
            out.append(tok)
        elif i and tok.lower() in SMALL:
            out.append(tok.lower())
        else:
            out.append(re.sub(r"[A-Za-zÀ-ÿ]+", lambda m: m.group(0).capitalize(), tok.lower()))
    return " ".join(out)


def allergens_of(cells: dict, where: str) -> dict:
    keys, cereals, nuts = set(), set(), set()
    for col, word in WORD.items():
        v = cells[col]
        if v not in ("YES", "NO"):
            raise SystemExit(f"{where}: the {col} cell prints {v!r}, expected YES or NO")
        if v == "YES":
            keys.add(allergen_words([word], where)[0].pop())
    cer = cells["cereals"]
    if cer != "NO":
        k, c, _ = allergen_words(cer.replace("&", " ").replace(",", " ").split(), where)
        if k != {"gluten"}:
            raise SystemExit(f"{where}: the cereals cell prints {cer!r}, which is not only gluten cereals")
        keys.add("gluten")
        cereals |= c
    nu = cells["nuts"]
    if nu == "YES":
        keys.add("nuts")
    elif nu != "NO":
        k, _, n = allergen_words(nu.replace("&", " ").replace(",", " ").split(), where)
        if k != {"nuts"}:
            raise SystemExit(f"{where}: the nuts cell prints {nu!r}, which is not only tree nuts")
        keys.add("nuts")
        nuts |= n
    return {"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts}


def sig(e: dict) -> tuple:
    a = e["allergens"]
    return (e["name"], e["kcal"], tuple(sorted(a["contains"])), tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])))


def build(pdf: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    rows = rp.read_pdf(pdf)
    if len(rows) != EXPECTED_TOTAL_ROWS:
        raise SystemExit(f"The guide has {len(rows)} table rows but this script expects {EXPECTED_TOTAL_ROWS}: the guide changed, re-check TABLES")
    kcal_rows = [r for r in rows if r["kcal"] is not None]
    if len(kcal_rows) != EXPECTED_KCAL_ROWS or any(not r["has_kcal"] for r in kcal_rows):
        raise SystemExit(f"{len(kcal_rows)} rows have calories (expected {EXPECTED_KCAL_ROWS}), or a calorie row sits in a table without a Kcal column")
    if any(r["has_kcal"] and r["kcal"] is None for r in rows):
        raise SystemExit("a row of a table with a Kcal column prints no calories: re-check the guide")
    counts: dict = {}
    for r in kcal_rows:
        counts[(r["menu"], r["section"])] = counts.get((r["menu"], r["section"]), 0) + 1
    if counts != EXPECTED_COUNTS:
        raise SystemExit(f"The tables with calories changed: now {counts}, expected {EXPECTED_COUNTS}")
    silent = sorted({(r["menu"], r["section"]) for r in rows if r["kcal"] is None})
    report.append(f"tables without calories (not listed, {len(rows) - len(kcal_rows)} rows): {silent}")

    entries = []
    for r in kcal_rows:
        key = (r["menu"], r["section"])
        printed = r["name"]
        where = f"page {r['page']} {key} {printed!r}"
        if key not in TABLES:
            raise SystemExit(f"{where}: a table with calories that TABLES does not know")
        if not printed.strip():
            raise SystemExit(f"{where}: a row without a name")
        if TABLES[key] is None:
            report.append(f"left out ({EXCLUDED[key]}): {key[1]} > {printed} ({r['kcal']} kcal)")
            continue
        kcal = r["kcal"].replace(",", "")
        if not re.fullmatch(r"\d+", kcal):
            raise SystemExit(f"{where}: calories {r['kcal']!r} is not a plain number")
        name = title_case(NAME_FIXES.get(printed, printed))
        entries.append({"printed": printed, "name": name, "category": TABLES[key], "kcal": kcal, "key": key, "page": r["page"],
                        "allergens": allergens_of(r["cells"], where), "raw_kcal": r["kcal"]})

    kept: dict = {}
    for e in entries:                       # tables in the guide's order: the first one wins
        k = sig(e)
        if k in kept:
            first = kept[k]
            report.append(f"dropped repeat: {e['key'][0]} > {e['key'][1]} > {e['name']} ({e['kcal']} kcal) is the same dish, calories and allergens as "
                          f"{first['key'][0]} > {first['key'][1]}")
            continue
        kept[k] = e
    keep_ids = {id(e) for e in kept.values()}
    entries = [e for e in entries if id(e) in keep_ids]
    by_name: dict = {}
    for e in entries:
        by_name.setdefault(slug(fold(e["name"])), []).append(e)
    for group in by_name.values():
        if len(group) > 1:
            for e in group:
                e["name"] = f"{e['name']} ({e['category'].lower().replace(' (', ', ').rstrip(')')})"
                report.append(f"same name on different dishes, renamed: {e['name']!r} ({e['kcal']} kcal)")
    names = [slug(fold(e["name"])) for e in entries]
    if len(set(names)) != len(names):
        raise SystemExit(f"item ids still not unique: {sorted({n for n in names if names.count(n) > 1})}")

    items = []
    for e in entries:
        tags = []
        vegetarian = bool(DIET.search(e["printed"]))
        if vegetarian:
            tags.append("vegetarian")
        meat, unspecified = tk.meat_tags(e["name"], vegetarian=vegetarian)
        if ITALIAN_BEEF.search(e["name"]) and "contains_beef" not in meat and not vegetarian:
            meat.append("contains_beef")
        if ITALIAN_PORK.search(e["name"]) and "contains_pork" not in meat and not vegetarian:
            meat.append("contains_pork")
        tags += meat
        if not vegetarian and not meat and re.search(r"\b(diavola|tagliere|cheeseburger|polpett\w*|ragu|bolognese|lasagne|capricciosa|calzone|carpaccio|"
                                                     r"filetto|ribeye|tagliata|spiedini|tricolore|salame)\b", e["name"], re.I):
            report.append(f"meat type not stated: {e['name']}")
        notes = [f"Printed {e['printed']!r} on page {e['page']}, {e['key'][0]} > {e['key'][1]}, '{e['raw_kcal']}' kcal"]
        if e["printed"] in NAME_FIXES:
            notes.append(f"the guide prints the name as {e['printed']!r}; the chain's menu page prints {NAME_FIXES[e['printed']]!r}")
        items.append({"id": slug(fold(e["name"])), "name": e["name"], "category": e["category"], "serving": "", "calories": e["kcal"],
                      "tags": "|".join(tags), "rankable": False, "notes": "; ".join(notes), "allergens": e["allergens"]})
    ids = {i["id"] for i in items}
    missing = [k for k in HOLDBACK if k not in ids]
    if missing:
        raise SystemExit(f"HOLDBACK names items that are no longer built: {missing}")
    for k in HOLDBACK:
        report.append(f"HELD BACK: {k}")
    return items, list(HOLDBACK.items()), report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide (SOURCE_URL); with --fetch it is downloaded here first")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDF was downloaded")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.pdf.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "-sSL", "--fail", "--compressed", "-A", tk.USER_AGENT, "-o", str(args.pdf), SOURCE_URL], check=True)
    print(f"guide sha256 {rp.sha256_file(args.pdf)}  {args.pdf}")
    items, holdback, report = build(args.pdf)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Riva Blu", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["riva blu", "riva blu restaurant", "riva blu italian"], items=items, out=args.out,
        note=NOTE.format(checked=args.checked_on), holdback=holdback, nutrition_level="calories",
        allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": False})
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
