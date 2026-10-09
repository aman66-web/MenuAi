#!/usr/bin/env python3
"""Build data/source/deli-by-shell/ from Shell UK's own "deli by Shell Allergen Matrix" (a CALORIES-ONLY chain with allergens).

    python3 tools/uk_extract/deli_by_shell.py --model allergen-matrix.model.json --checked-on 2026-10-09 [--fetch] [--out DIR]

Source (the page the chain's own deli by Shell page links as "deli by Shell Allergen Matrix"):
    https://www.shell.co.uk/shell-service-stations/food-and-drink-offering/deli-by-shell/allergen-matrix.html
The script reads the JSON that page is built from (the same address with .html replaced by .model.json: shell.co.uk's robots.txt
allows both; the rendered page and the JSON hold the same single table, compared row by row on 2026-10-09). `--fetch` downloads that
JSON once (robots.txt checked first with robots_rfc, a normal browser User-Agent, no retries beyond one).

THE TABLE IS VALID FOR ONE MONTH ONLY. The page says "deli by Shell October 2026 Allergen Matrix is valid from 01.10.26-31.10.26." and
Shell reissues it every month (page last updated 30 September 2026 for October). The script reads that sentence, puts the month into
source_title and note.txt, and stops if --checked-on is outside the validity window. For November: run again, and if it stops on a row
count or a new product, re-check the changes (EXPECTED_ROWS below) before updating them.

What the table prints (one HTML table, 20 columns): Product Range, Shell Code, Product Name, "kcal per Unit/Portion", then the 14
allergens as columns (Celery; Cereals Containing Gluten with the cereals named in brackets; Other Cereals containing Gluten;
Crustaceans; Egg; Fish; Lupin; Milk; Molluscs; Mustard; Nuts with the nuts named; Other Nuts; Peanuts; Sesame; Soya; Sulphites).
- Calories are one number per product "per Unit/Portion"; the unit's size is not stated anywhere, so `serving` stays blank, except the one
  row that prints it ("254 per 1/2 baton": serving "1/2 baton"). No protein, carbs, fat, kJ, salt, weight: nothing else is published, so
  nutrition_level is "calories" and every item is not rankable.
- Allergens: "Y" = contains (with the cereal or nut named in brackets where it is one of those two columns). The page prints "M" in
  283 cells and NO KEY anywhere on the page. We read "M" as MAY CONTAIN: it is the only other mark, it appears where cross-contact is
  expected (sesame/mustard/nuts/soya on every bakery line, fish and molluscs on a prawn sandwich) and reading it as "may contain" can only
  add a warning, never remove one. This is the one reading in the data that the source does not state: the founder is asked to confirm it
  (set READ_M_AS_MAY_CONTAIN = False to publish the guide link only). A blank cell = not marked. "Oatmeal" (Cheese & Onion sandwich, Cereals
  column) is the chain's own spelling and is read as oats.
- "Other Cereals containing Gluten" and "Other Nuts" are read as the generic allergen (gluten / nuts): a "Y" there would be "contains", an
  "M" is "may contain". When a dish contains one cereal/nut and may contain others, common.write_allergens stores the generic allergen
  (the pipeline's rule since 2026-10-08).
- Two rows print no calories (HP Brown Sauce, Heinz Ketchup, range "Sauce"): nothing to publish, they are left out.
- Two rows are the same product twice under different Shell codes (Chicken Samosa 824716 and 993182, identical in every cell): one is
  listed.
- The table is the national list: the range varies by forecourt and some lines are Co-op or other brands (the Co-op ranges are
  named "Co-op ..." in the table and kept). Great Britain only: Shell UK's page is the only one; nothing is region-specific.
- Names are as printed (including the table's own spellings "Hazlenut & Milk Chocolate Cookie" and "Co-op Irresistable Butter Croissant").
"""
from __future__ import annotations
import argparse
import datetime
import html
import json
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "deli-by-shell"
HTML_URL = "https://www.shell.co.uk/shell-service-stations/food-and-drink-offering/deli-by-shell/allergen-matrix.html"
MODEL_URL = "https://www.shell.co.uk/shell-service-stations/food-and-drink-offering/deli-by-shell/allergen-matrix.model.json"
ROBOTS_URL = "https://www.shell.co.uk/robots.txt"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
ALIASES = ["deli by shell", "shell deli", "deli2go"]
READ_M_AS_MAY_CONTAIN = True  # see the docstring: "M" has no key on the page

HEADER = ["Product Range", "Shell Code", "Product Name", "kcal per Unit/Portion", "Celery", "Cereals Containing Gluten",
          "Other Cereals containing Gluten", "Crustaceans", "Egg", "Fish", "Lupin", "Milk", "Molluscs", "Mustard", "Nuts",
          "Other Nuts", "Peanuts", "Sesame", "Soya", "Sulphites"]
# allergen column header -> the printed word handed to common.allergen_words (so every key still comes from the shared table)
COLUMN_WORD = {"Celery": "celery", "Cereals Containing Gluten": "cereals containing gluten",
               "Other Cereals containing Gluten": "cereals containing gluten", "Crustaceans": "crustaceans", "Egg": "egg",
               "Fish": "fish", "Lupin": "lupin", "Milk": "milk", "Molluscs": "molluscs", "Mustard": "mustard", "Nuts": "nuts",
               "Other Nuts": "nuts", "Peanuts": "peanuts", "Sesame": "sesame", "Soya": "soya", "Sulphites": "sulphites"}
BRACKET_COLUMNS = {"Cereals Containing Gluten", "Nuts"}  # the only columns that name the cereal / nut after "Y"
EXTRA_WORDS = {"oatmeal": ("gluten", "oats")}  # the chain's own spelling in "Y (Wheat, Oatmeal, Barley)"

# Product Range as printed -> category shown. The range order of first appearance is the order shown.
CATEGORY = {"Chilled Prepacked": "Chilled Prepacked", "Baked Confectionery": "Baked Confectionery", "Bakery": "Bakery",
            "Hot Sandwich": "Hot Sandwich", "Hot Savoury": "Hot Savoury", "Sauce": "Sauce",
            "CO-OP BAKED CONFECTIONERY": "Co-op Baked Confectionery", "CO-OP BAKERY": "Co-op Bakery"}
# Rows per Product Range in the October 2026 table (93 in all). The run stops if any number changes: a human re-checks the change.
EXPECTED_ROWS = {"Chilled Prepacked": 15, "Baked Confectionery": 21, "Bakery": 6, "Hot Sandwich": 12, "Hot Savoury": 17, "Sauce": 2,
                 "CO-OP BAKED CONFECTIONERY": 9, "CO-OP BAKERY": 11}
# Rows that print no calories and so are not published (checked on every run).
EXPECTED_WITHOUT_KCAL = {"82032": "HP Brown Sauce", "77878": "Heinz Ketchup"}
# Rows identical to another row but for the Shell code: the second code is not listed.
EXPECTED_DUPLICATES = {"993182": "824716"}

PORK = re.compile(r"\b(pork|bacon|blt|ham|sausage|pepperoni|chorizo|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_UNSPECIFIED = re.compile(r"\b(pasty|breakfast|stuffing)\b", re.I)  # names a meat dish without saying which meat

NOTE_TEMPLATE = ("Calories only, per unit or portion as sold (unit size not stated). This table is valid for {month} only and Shell reissues "
                 "it every month, so figures can change. The range varies by forecourt, and some lines are Co-op brand.")


class _Table(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._cur: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._cur = []
        elif tag in ("td", "th"):
            self._cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._cur is not None:
            self._cur.append(" ".join("".join(self._cell).replace("\xa0", " ").split()))
            self._cell = None
        elif tag == "tr" and self._cur is not None:
            self.rows.append(self._cur)
            self._cur = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def _strings(node):
    if isinstance(node, dict):
        for v in node.values():
            yield from _strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _strings(v)
    elif isinstance(node, str):
        yield node


def fetch(dest: Path) -> None:
    """One download of the page's JSON, after checking robots.txt (RFC 9309 matching). Stops on anything but 200."""
    def get(url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json,text/plain,*/*"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status != 200:
                raise SystemExit(f"{url} answered HTTP {resp.status}: not working round it. Download the file in your browser and pass --model.")
            return resp.read()
    rules = robots_rfc.parse(get(ROBOTS_URL).decode("utf-8", "replace"))
    path = "/" + MODEL_URL.split("/", 3)[3]
    if not robots_rfc.allowed(rules, path):
        raise SystemExit(f"robots.txt disallows {path}: stop; not downloading.")
    time.sleep(1.0)
    dest.write_bytes(get(MODEL_URL))


def read_model(model_path: Path) -> tuple[list[list[str]], dict]:
    """(table rows including the header row, page facts: validity dates, last-modified date)."""
    model = json.loads(model_path.read_text(encoding="utf-8"))
    tables = [s for s in _strings(model) if "kcal per Unit" in s and "<table" in s]
    if len(tables) != 1:
        raise SystemExit(f"Expected one table with 'kcal per Unit' in the page model, found {len(tables)}: the page changed.")
    parser = _Table()
    parser.feed(tables[0])
    rows = parser.rows
    if not rows or rows[0] != HEADER:
        raise SystemExit(f"The table header changed: {rows[0] if rows else None}\nexpected {HEADER}")
    bad = [i for i, r in enumerate(rows) if len(r) != len(HEADER)]
    if bad:
        raise SystemExit(f"Rows {bad[:5]} do not have {len(HEADER)} cells: the table layout changed.")
    texts = [" ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split()) for s in _strings(model)]
    valid = [m for t in texts for m in re.findall(r"valid from (\d\d)\.(\d\d)\.(\d\d)\s*-\s*(\d\d)\.(\d\d)\.(\d\d)", t)]
    if len(valid) != 1:
        raise SystemExit(f"Expected one 'valid from dd.mm.yy-dd.mm.yy' sentence, found {len(valid)}.")
    d1, m1, y1, d2, m2, y2 = (int(x) for x in valid[0])
    start, end = datetime.date(2000 + y1, m1, d1), datetime.date(2000 + y2, m2, d2)
    modified = [l["value"] for l in model.get("model", {}).get("links", []) if l.get("name") == "dateModified"]
    if len(modified) != 1:
        raise SystemExit("No dateModified in the page model.")
    return rows, {"start": start, "end": end, "modified": datetime.date.fromisoformat(modified[0][:10])}


def parse_allergens(row: list[str], where: str) -> dict:
    contains, may = set(), set()
    cereals, nuts = set(), set()
    for col, cell in zip(HEADER[4:], row[4:]):
        if cell == "":
            continue
        if cell == "M":
            keys, _, _ = allergen_words([COLUMN_WORD[col]], f"{where} {col}")
            may |= keys
            continue
        m = re.fullmatch(r"Y(?: \(([^()]+)\))?", cell)
        if not m:
            raise SystemExit(f"{where}: unexpected {col} cell {cell!r} (expected Y, M or Y (names)).")
        keys, _, _ = allergen_words([COLUMN_WORD[col]], f"{where} {col}")
        contains |= keys
        if m.group(1):
            if col not in BRACKET_COLUMNS:
                raise SystemExit(f"{where}: {col} cell {cell!r} names something but only {sorted(BRACKET_COLUMNS)} do.")
            names = [w.strip() for w in m.group(1).split(",")]
            k2, c2, n2 = allergen_words(names, f"{where} {col}", extra=EXTRA_WORDS)
            if k2 - keys:
                raise SystemExit(f"{where}: {col} names {sorted(k2)} which is not {sorted(keys)}.")
            cereals |= c2
            nuts |= n2
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


def build(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    body = rows[1:]
    counts: dict[str, int] = {}
    for r in body:
        counts[r[0]] = counts.get(r[0], 0) + 1
    if counts != EXPECTED_ROWS:
        raise SystemExit(f"The table changed. Rows per range now {counts}, expected {EXPECTED_ROWS}. Read the changes, then update EXPECTED_ROWS.")
    codes = [r[1] for r in body]
    if len(set(codes)) != len(codes):
        raise SystemExit("A Shell code is printed twice.")
    without = {r[1]: r[2] for r in body if r[3] == ""}
    if without != EXPECTED_WITHOUT_KCAL:
        raise SystemExit(f"Rows without calories changed: now {without}, expected {EXPECTED_WITHOUT_KCAL}.")
    report: list[str] = []
    items: list[dict] = []
    by_code: dict[str, dict] = {}
    for r in body:
        code, name, kcal_cell = r[1], r[2], r[3]
        if kcal_cell == "":
            report.append(f"left out (no calories printed): {name} ({code}, {r[0]})")
            continue
        m = re.fullmatch(r"(\d+)(?: per (.+))?", kcal_cell)
        if not m:
            raise SystemExit(f"{name}: unexpected calories cell {kcal_cell!r}.")
        kcal, serving = m.group(1), m.group(2) or ""
        allergens = parse_allergens(r, f"{name} ({code})")  # always parsed, so an unknown word or cell still stops the run
        if not READ_M_AS_MAY_CONTAIN:
            allergens = None  # guide link only
        tags = []
        if PORK.search(name):
            tags.append("contains_pork")
        if BEEF.search(name):
            tags.append("contains_beef")
        if MEAT_UNSPECIFIED.search(name) and not tags:
            report.append(f"meat type not stated: {name}")
        notes = [f"Shell code {code}", f"range '{r[0]}'"]
        if serving:
            notes.append(f"printed '{kcal_cell}'")
        item = dict(name=name, category=CATEGORY[r[0]], serving=serving, calories=kcal, tags="|".join(tags), rankable=False,
                    notes="; ".join(notes), allergens=allergens, _cells=r[3:], _code=code)
        by_code[code] = item
        items.append(item)
    kept = []
    for it in items:
        orig = EXPECTED_DUPLICATES.get(it["_code"])
        if orig:
            first = by_code[orig]
            if first["name"] != it["name"] or first["_cells"] != it["_cells"]:
                raise SystemExit(f"{it['name']} ({it['_code']}) is no longer identical to {first['name']} ({orig}).")
            report.append(f"dropped identical duplicate: {it['name']} ({it['_code']}) = {orig}")
            first["notes"] += f"; Shell code {it['_code']} prints an identical row"
            continue
        kept.append(it)
    names = [i["name"] for i in kept]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique after removing the known duplicates.")
    for it in kept:
        del it["_cells"], it["_code"]
    return kept, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True, help="the page's JSON (MODEL_URL); with --fetch it is downloaded to this path")
    ap.add_argument("--checked-on", required=True, help="the day the table was read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download MODEL_URL to --model first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.model)
    checked = datetime.date.fromisoformat(args.checked_on)
    rows, facts = read_model(args.model)
    if not (facts["start"] <= checked <= facts["end"]):
        raise SystemExit(f"--checked-on {checked} is outside the table's validity {facts['start']} to {facts['end']}.")
    month = facts["start"].strftime("%B %Y")
    if facts["start"].replace(day=1) != facts["start"] or (facts["end"] + datetime.timedelta(days=1)).day != 1 or facts["start"].month != facts["end"].month:
        raise SystemExit(f"Validity {facts['start']} to {facts['end']} is not a whole calendar month: re-read the page's sentence.")
    items, report = build(rows)
    day = lambda d: f"{d.day} {d.strftime('%B %Y')}"  # noqa: E731
    source_title = (f"deli by Shell Allergen Matrix, {month} (valid {day(facts['start'])} to {day(facts['end'])} only; "
                    f"page last updated {day(facts['modified'])})")
    guide = {"title": f"deli by Shell Allergen Matrix, {month} (the page prints no key: Y read as contains, M as may contain)",
             "url": HTML_URL, "checked_on": args.checked_on, "may_contain_published": READ_M_AS_MAY_CONTAIN}
    if not READ_M_AS_MAY_CONTAIN:
        guide["title"] = f"deli by Shell Allergen Matrix, {month}"
    out = write_chain_folder(chain_id=CHAIN_ID, name="Deli by Shell", cuisine="Sandwiches", source_title=source_title, source_url=HTML_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out,
                             note=NOTE_TEMPLATE.format(month=month), allergen_guide=guide, nutrition_level="calories")
    print(f"model sha256 {sha256_file(args.model)}  {args.model}")
    print(f"validity {facts['start']} to {facts['end']}; page last modified {facts['modified']}")
    print("\n".join(report))
    cats: dict[str, int] = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
