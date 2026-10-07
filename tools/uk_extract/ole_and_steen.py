#!/usr/bin/env python3
"""Build data/source/ole-and-steen/ from Ole & Steen's official "Allergen Information" PDF (a CALORIES-ONLY chain, with allergens).

    python3 tools/uk_extract/ole_and_steen.py path/to/guide.pdf --checked-on 2026-10-07 [--fetch] [--out DIR]

Source (the file the chain's own page links as its "Allergen and Calorie guide"):
    https://oleandsteen.co.uk/allergens  ->  https://cdn.sanity.io/files/of2lz0sx/production/3bc9f9bf9d87eb2678fe8d76d06da6e1f72f2fab.pdf
    "Ole & Steen Allergen Information, 01.10.2026 | Version 20" (served as "Ole  Steen Allergen Guide CORE v20.pdf", Last-Modified
    1 Oct 2026, PDF created 22 Sep 2026). 29 pages, Word export with a text layer. robots.txt of oleandsteen.co.uk allows the page.
    --fetch downloads the PDF once with curl (normal browser User-Agent). Needs `pdftotext` and `pdftocairo` (poppler). The tables
    are read by position: see ole_and_steen_pdf.py.

What the guide prints per dish: ONE number, "kcal per serving", and the 14 allergen columns plus Vegan / Vegetarian / Non-Gluten
diets. No protein, carbs, fat, sugar, salt, kJ or weights anywhere, so:
- nutrition_level = "calories": protein, carbs and fat stay BLANK (docs/DATA.md "Calories-only chains"); no extra column is printed.
- The kcal cell is copied as printed. Five loaves print "1708/loaf" and a per-100 g figure: the per-loaf figure is the item as sold
  and is used (serving "1 loaf"); the per-100 g figure is never used. The three celebration cakes print "4731 per cake" and
  "788 per serving": two items, as the guide gives two bases. The "Social Whole" cakes print "per cake (serves 6)".
- Drink sizes are in the printed names ("8oz Latte Whole Milk", "Pistachio Latte 12 oz"), so they are also the serving.

Allergens are read COMPLETELY from the same guide (docs/DATA.md "Allergens"): a tick (√) = contains, MC = "may be present but is not
guaranteed" (the guide's own key). The cereals cell and the nuts cell also name the cereals / nuts ("√ wheat, oats, rye & barley",
"√ almonds MC other nuts"); words after the tick are what it contains, words after MC are what it may contain. Rules, each of which
stops the run if the PDF breaks it (nothing is guessed):
- every dish row needs a tick or MC in every non-empty allergen cell; an unknown allergen word stops the run;
- "GF oats" (gluten-free oats) is printed with a tick in the gluten column of the oat, almond and pistachio milk drinks: the tick is
  exported (contains gluten) but no cereal is named, because the guide distinguishes "GF oats" from plain "oats" (which the Cortado and
  Macchiato oat-milk rows print) and the allergen file cannot carry "gluten-free". The guide's "Non-Gluten diets" column (yes for the
  almond-milk rows) is not exported, so those rows show gluten as contained, the safe direction.
- A cell naming nuts that sits in the wrong column (Ham, Comte & Cornichon Roll: "MC Almond, hazelnut, pistachio nut" is printed
  under PEANUTS, with the Nuts cell empty) is read literally: may contain peanuts (the MC under Peanuts) AND may contain tree nuts
  (the words). Over-reporting is the safe direction; it is listed in MISPLACED so a human re-checks it on every new guide.
- Specific tree nuts / cereals after MC ("MC almonds, hazelnuts, pistachio nuts", "MC other gluten sources") cannot be exported
  (allergens.csv names cereals and nuts only for "contains"); the key itself is exported as may_contain when nothing says contains.

Left out (each is a stop-the-run constant below):
- "Brunch Trials" (5 dishes): the guide's own table title says they are trials and does not say where they are sold (the playbook
  leaves out trials).
- "Add Oat Milk": the only row whose gluten cell prints "GF Oats" with NO tick and no MC (its siblings print "√ GF oats"). The cell
  cannot be read exactly and is not inferred, so the item is not published (restore by reading the cell with Ole & Steen).

Tags: vegetarian when the guide's own Vegetarian or Vegan column says yes. contains_pork / contains_beef from the dish name only
(ham, bacon, sausage, prosciutto, chorizo; beef) because the guide prints no ingredients; every other non-vegetarian dish is listed
as "meat type not stated" in the run's report. Categories are the guide's own table titles. "Seasonal Drinks" are limited_time.
Every item is rankable=false (calories-only chains have no suggestions).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple

sys.path.insert(0, str(Path(__file__).parent))
import ole_and_steen_pdf as pdf_reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "ole-and-steen"
SOURCE_URL = "https://cdn.sanity.io/files/of2lz0sx/production/3bc9f9bf9d87eb2678fe8d76d06da6e1f72f2fab.pdf"
EXPECTED_VERSION = "01.10.2026 | Version 20"
SOURCE_TITLE = "Ole & Steen Allergen Information with kcal per serving, 01.10.2026, Version 20 (PDF created 22 September 2026)"
ALIASES = ["ole & steen", "ole and steen", "ole&steen"]
NOTE = ("Ole & Steen's guide prints calories only: no protein, carbs, fat or other nutrients. Loaves and whole cakes show the calories "
        "of the whole loaf or cake, as printed. Dishes the guide lists as \"Brunch Trials\" are not listed.")
MAY_CONTAIN_PUBLISHED = True  # the guide's key: "MC refers to an ingredient that may be present in the dish but is not guaranteed"

# The guide's table titles in printed order, with the number of dish rows each must have. Anything else stops the run.
EXPECTED_TABLES = [("Rolls & Buns", 9), ("Breads", 5), ("Dry Cakes", 14), ("Cream Cakes", 7), ("Celebration Cakes", 4),
                   ("Danish Pastries", 22), ("Hot Food", 13), ("Cold Food", 14), ("Brunch", 10), ("Additions", 6),
                   ("Drinks Additions", 14), ("Hot Drinks", 75), ("Iced Drinks", 22), ("Seasonal Drinks", 8), ("Brunch Trials", 5)]
EXCLUDED_TABLES = {"Brunch Trials": "titled as trials, with no venues stated (playbook: leave out trials)"}
EXCLUDED_ITEMS = {"Add Oat Milk": "gluten cell prints 'GF Oats' with no tick and no MC: cannot be read exactly (siblings print '√ GF oats')"}
LIMITED_TIME_TABLES = {"Seasonal Drinks"}
# Allergen cells whose words sit in a different column than the words' own allergen (see docstring): (dish name, column key).
MISPLACED = {("Ham, Comte & Cornichon Roll", "peanuts")}
ID_OVERRIDES = {"Crème Brulée Festival Bun": "creme-brulee-festival-bun"}
NAME_FIXES = {"Chicken, Chorizo & Jalapeno FOCACCIA Toastie": "Chicken, Chorizo & Jalapeno Focaccia Toastie",
              "Chicken, Chorizo & Jalapeno SOURDOUGH Toastie": "Chicken, Chorizo & Jalapeno Sourdough Toastie"}  # capitalisation only

# printed column key -> allergen key used by the pipeline
COLUMN_KEY = {"gluten": "gluten", "peanuts": "peanuts", "nuts": "nuts", "fish": "fish", "crustaceans": "crustaceans",
              "molluscs": "molluscs", "sesame": "sesame", "milk": "milk", "eggs": "eggs", "mustard": "mustard", "soya": "soya",
              "celery": "celery", "sulphites": "sulphites", "lupin": "lupin"}
EXTRA_WORDS = {"gf oats": ("gluten", None)}  # the guide's own "GF oats": a gluten cell, but no cereal is named (see the docstring)
PORK = re.compile(r"\b(pork|bacon|ham|sausage|prosciutto|chorizo|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
SPECIES = re.compile(r"\b(chicken|tuna|salmon|prawn)\b", re.I)


class NoMarker(Exception):
    """An allergen cell has words but neither a tick nor MC."""


def _tokens(lines: List[List[str]]) -> List[str]:
    out = []
    for line in lines:
        for w in line:
            w = w.strip().strip(",.;")
            if w and w != "&" and w.lower() != "and":
                out.append(w)
    return out


def parse_allergen_cell(column: str, lines: List[List[str]], where: str, misplaced: bool = False) -> Tuple[Set[str], Set[str], Set[str], Set[str]]:
    """One allergen cell -> (contains keys, may-contain keys, named cereals, named tree nuts). Words after the tick are what the dish
    contains, words after MC what it may contain (specifics there cannot be exported); "other gluten sources" / "other nuts" are the
    guide's generic may-contain wording for the column's own allergen."""
    key = COLUMN_KEY[column]
    contains: Set[str] = set()
    may: Set[str] = set()
    cereals: Set[str] = set()
    nuts: Set[str] = set()
    state = None
    words_c: List[str] = []
    words_m: List[str] = []
    for tok in _tokens(lines):
        if tok == "√":
            state = "c"
            contains.add(key)
        elif tok.lower() == "mc":
            state = "m"
            may.add(key)
        elif state is None:
            raise NoMarker(f"{where}: cell has the words {tok!r}... but neither a tick nor MC")
        elif state == "c":
            words_c.append(tok)
        else:
            words_m.append(tok)
    if not contains and not may:
        raise SystemExit(f"{where}: cell {lines!r} has no tick or MC")
    # words after a tick: the cereals / nuts named (a trailing generic "nuts" is just the unit: "Pecan Nuts")
    if words_c:
        text = " ".join(w.lower() for w in words_c)
        text = text.replace("gf oats", "gf-oats")
        parts = [("gf oats" if w == "gf-oats" else w) for w in text.split()]
        for w in parts:
            keys, c, n = allergen_words([w], where, EXTRA_WORDS)
            if keys != {key}:
                raise SystemExit(f"{where}: word {w!r} after the tick in the {column} cell is a {sorted(keys)} word")
            cereals |= c
            nuts |= n
    # words after MC: only generic wording or allergen words of this column; they add nothing to export beyond the key
    if words_m:
        low = [w.lower() for w in words_m]
        if low in (["other", "gluten", "sources"], ["other", "nuts"]):
            pass
        else:
            for w in words_m:
                keys, _, _ = allergen_words([w], where, EXTRA_WORDS)
                if keys != {key}:
                    if misplaced:
                        may |= keys
                    else:
                        raise SystemExit(f"{where}: word {w!r} after MC in the {column} cell is a {sorted(keys)} word, not {key!r}")
    if (cereals and key != "gluten") or (nuts and key != "nuts"):
        raise SystemExit(f"{where}: cereals/nuts named outside their own column")
    return contains, may, cereals, nuts


def read_kcal(lines: List[List[str]], where: str) -> List[Tuple[str, str, str]]:
    """The kcal cell -> [(calories as printed, suffix for the item name, serving)]. One entry for a plain number; two for a
    celebration cake printed with a per-cake and a per-serving figure."""
    text = " ".join(" ".join(l) for l in lines)
    m = re.fullmatch(r"(\d+(?:\.\d+)?)", text)
    if m:
        return [(m.group(1), "", "")]
    m = re.fullmatch(r"(\d+)/loaf (\d+)/100g", text)
    if m:  # the per-100 g figure is not a serving and is never used
        return [(m.group(1), "", "1 loaf")]
    m = re.fullmatch(r"(\d+)/ Loaf", text)
    if m:
        return [(m.group(1), "", "1 loaf")]
    m = re.fullmatch(r"(\d+) per cake \(serves (\d+)\)", text)
    if m:
        return [(m.group(1), "", f"1 cake (serves {m.group(2)})")]
    m = re.fullmatch(r"(\d+) per cake (\d+(?:\.\d+)?) per serving", text)
    if m:
        return [(m.group(1), " (whole cake)", "1 cake"), (m.group(2), " (per serving)", "1 serving")]
    raise SystemExit(f"{where}: unexpected kcal cell {text!r}: the layout changed, extend read_kcal after reading the guide")


def yes_no(lines: List[List[str]], where: str) -> bool:
    text = " ".join(" ".join(l) for l in lines)
    if text not in ("yes", "no"):
        raise SystemExit(f"{where}: expected yes/no, found {text!r}")
    return text == "yes"


def size_serving(name: str) -> str:
    m = re.search(r"(?:^|\s)(8|12) ?oz\b", name)
    return f"{m.group(1)} oz" if m else ""


def build_items(rows: List[dict]) -> Tuple[List[dict], List[str], List[str]]:
    # structure check: tables, their order and their row counts
    got: List[Tuple[str, int]] = []
    for r in rows:
        if got and got[-1][0] == r["table"]:
            got[-1] = (got[-1][0], got[-1][1] + 1)
        else:
            got.append((r["table"], 1))
    if got != EXPECTED_TABLES:
        raise SystemExit(f"The guide's tables changed.\n  found    {got}\n  expected {EXPECTED_TABLES}\nRead the new guide, then update EXPECTED_TABLES.")
    items: List[dict] = []
    report: List[str] = []
    excluded: List[str] = []
    seen_excluded: Set[str] = set()
    gf_notes = 0
    for r in rows:
        name_printed = r["name"]
        where = f"p{r['page']} {name_printed!r}"
        c = r["cells"]
        if r["table"] in EXCLUDED_TABLES:
            excluded.append(f"{r['table']}: {name_printed} ({EXCLUDED_TABLES[r['table']]})")
            continue
        contains: Set[str] = set()
        may: Set[str] = set()
        cereals: Set[str] = set()
        nuts: Set[str] = set()
        unreadable = None
        notes: List[str] = []
        for col in COLUMN_KEY:
            if col not in c:
                continue
            try:
                a, b, ce, nu = parse_allergen_cell(col, c[col], f"{where} [{col}]", misplaced=(name_printed, col) in MISPLACED)
            except NoMarker as e:
                unreadable = str(e)
                break
            contains |= a
            may |= b
            cereals |= ce
            nuts |= nu
            if (name_printed, col) in MISPLACED:
                printed = " ".join(" ".join(l) for l in c[col])
                notes.append(f"the {col} column prints {printed!r}: tree-nut words under Peanuts, read literally (may contain peanuts and tree nuts)")
                report.append(f"misplaced cell read literally: {name_printed}: {col} column prints {printed!r}")
        if unreadable:
            if name_printed not in EXCLUDED_ITEMS:
                raise SystemExit(unreadable + " (not in EXCLUDED_ITEMS: stop and read the guide)")
            seen_excluded.add(name_printed)
            excluded.append(f"{name_printed} ({EXCLUDED_ITEMS[name_printed]})")
            continue
        if name_printed in EXCLUDED_ITEMS:
            raise SystemExit(f"{name_printed} is in EXCLUDED_ITEMS but its cells now read fine: remove it from EXCLUDED_ITEMS")
        vegan, vegetarian = yes_no(c["vegan"], where), yes_no(c["vegetarian"], where)
        nongluten = yes_no(c["nongluten"], where)
        if vegan and not vegetarian:
            raise SystemExit(f"{where}: vegan yes but vegetarian no")
        veg = vegan or vegetarian
        name_base = NAME_FIXES.get(name_printed, name_printed)
        tags = ["vegetarian"] if veg else []
        if not veg:
            if PORK.search(name_printed):
                tags.append("contains_pork")
            if BEEF.search(name_printed):
                tags.append("contains_beef")
        if vegan and ({"milk", "eggs"} & contains):
            notes.append(f"guide marks it vegan but ticks {sorted({'milk', 'eggs'} & contains)}")
        if nongluten and "gluten" in contains and cereals != {"oats"}:
            notes.append("guide marks it suitable for non-gluten diets but ticks gluten")
        if not veg and not (set(tags) & {"contains_pork", "contains_beef"}):
            report.append(f"meat type not stated: {name_base}" + ("" if not SPECIES.search(name_printed) else f" (names {SPECIES.search(name_printed).group(1).lower()} only)"))
        for calories, suffix, serving in read_kcal(c["kcal"], where):
            name = name_base + suffix
            if not serving:
                serving = size_serving(name)
            item = {"name": name, "category": r["table"], "serving": serving, "calories": calories, "tags": "|".join(tags),
                    "limited_time": r["table"] in LIMITED_TIME_TABLES, "rankable": False,
                    "notes": "; ".join(notes + [f"page {r['page']}"]),
                    "allergens": {"contains": set(contains), "may_contain": set(may), "cereals": set(cereals), "nuts": set(nuts)}}
            if name_printed in ID_OVERRIDES and not suffix:
                item["id"] = ID_OVERRIDES[name_printed]
            if "id" not in item and re.search(r"[^\x00-\x7f]", name):
                raise SystemExit(f"{name!r}: non-ASCII letters would be turned into hyphens in the id: add it to ID_OVERRIDES")
            items.append(item)
            gf_notes += sum(1 for n in notes if n.startswith("guide marks it suitable for non-gluten"))
            for n in notes:
                if not n.startswith("guide marks it suitable for non-gluten"):
                    report.append(f"{name}: {n}")
    if gf_notes:
        report.append(f"{gf_notes} rows tick gluten ('GF oats') but the guide also marks them suitable for non-gluten diets: the tick is exported, see each row's notes")
    by_name = {i["name"]: float(i["calories"]) for i in items}
    for n, kcal in sorted(by_name.items()):  # a 12 oz drink with fewer calories than its 8 oz twin is the guide's own inconsistency
        small = re.match(r"^8oz (.+)$", n) or re.match(r"^(.+) 8 oz$", n)
        if small:
            big = f"12oz {small.group(1)}" if n.startswith("8oz ") else f"{small.group(1)} 12 oz"
            if big in by_name and by_name[big] < kcal:
                msg = f"{big} prints {by_name[big]:g} kcal but {n} prints {kcal:g}: the 12 oz figure is lower; printed as is, one of the two may be a typo"
                report.append(msg)
                for i in items:
                    if i["name"] in (n, big):
                        i["notes"] = "; ".join([msg] + [x for x in i["notes"].split("; ") if x])
    missing = set(EXCLUDED_ITEMS) - seen_excluded
    if missing:
        raise SystemExit(f"EXCLUDED_ITEMS not found among the unreadable rows: {sorted(missing)}")
    ids = [i.get("id") or slug(i["name"]) for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("item ids are not unique")
    return items, report, excluded


def fetch(pdf: Path) -> None:
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    subprocess.run(["curl", "-sS", "-f", "-A", ua, "-o", str(pdf), SOURCE_URL], check=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the PDF to the given path first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.pdf)
    print(f"guide sha256 {sha256_file(args.pdf)}  {args.pdf}")
    header, rows = pdf_reader.read_pages(args.pdf)
    if header != EXPECTED_VERSION:
        raise SystemExit(f"The guide now says {header!r}, this script was written for {EXPECTED_VERSION!r}: read the new guide, "
                         "check EXPECTED_TABLES and the exclusions, then update EXPECTED_VERSION and SOURCE_TITLE.")
    items, report, excluded = build_items(rows)
    guide = {"title": SOURCE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Ole & Steen", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    print("\n".join(report))
    print("left out: " + "; ".join(excluded))
    cats: Dict[str, int] = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{k} {v}" for k, v in cats.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
