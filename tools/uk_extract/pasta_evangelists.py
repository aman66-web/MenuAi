#!/usr/bin/env python3
"""Build data/source/pasta-evangelists/ from Pasta Evangelists' own Restaurants allergen chart (a CALORIES-ONLY chain).

    python3 tools/uk_extract/pasta_evangelists.py CACHE_DIR --fetch                       # download the page and the chart politely
    python3 tools/uk_extract/pasta_evangelists.py CACHE_DIR --checked-on 2026-10-10 [--out DIR] [--show]

Source. The chain's own page https://pastaevangelists.com/pages/allergens (a Shopify page; robots.txt `User-agent: *` allows /pages/) has five
buttons that are Google Sheets PDF exports. The first, "Restaurants", is
    https://docs.google.com/spreadsheets/d/1I2wXH_PQNO21w4CvaETgOLM7OBJDQCY5b4vq0cK0rEo/export?format=pdf&gid=1206536742&portrait=false&attachment=false
(gid 0 = Delivery/Takeaway, 776180697 = Events, 1919518239 = Manchester Airport, and Harrods has its own sheet: none of those is read). The file is
"Pasta Evangelists Takeaway Allergens Chart - Restaurants Allergens Chart.pdf", 17 pages, Google Sheets PDF with a text layer, headed "Quality
Management System 5.3.1b- Restaurants Allergen Chart"; it carries NO date and the export has no Last-Modified, so the source title says "undated" and
the day it was downloaded. robots.txt of docs.google.com (RFC 9309, robots_rfc.py): `Disallow: /` but `Allow: /spreadsheet`, the longest match wins, so
/spreadsheets/d/... is allowed. Needs poppler's `pdftotext` (-bbox) and `pdfinfo`.

Sites. The chain's own restaurant finder (https://plan.pastaevangelists.com/restaurants, linked from its home page; read 2026-10-10 in Chromium, it is a
JavaScript page) lists 14 Great Britain restaurants: Chelsea, Chiswick, Farringdon, Greenwich Cutty Sark, Guildford, New Oxford Street, Queensway,
Harrods, Richmond, Soho, Winchester, and three pub residencies (Bristol Replay Bar, Oxford Royal Standard, Sale Brooklands Tap); the allergens page also
lists Manchester Airport. One chart covers "Restaurants", so the 2-or-more-sites rule does not apply: there is no per-site menu to compare. Harrods
has its own chart and is not read here.

Nutrition: one column, "Calories per portion (kcal)": calories only, no protein, carbs, fat, kJ, salt or sugar. So protein, carbs and fat stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable). The chart's heading says per portion (one dish, drink or add-on as served);
no weight or serving is printed for the dishes, so `serving` stays blank unless the row prints sizes (see below). Calories are copied from the chart by
this script; item names and categories are the chart's own words (hyphen line-wraps joined, backticks turned into quote marks, nothing re-spelled:
"Fomaggi", "Calamary", "Chioccolato" and "Kocktail" are the chart's spellings).

How the chart is read (it is a Google Sheets table whose cells are vertically centred and have no text-layer table): `pdftotext -bbox` gives every
word's position; the columns are fixed x ranges (COLUMNS, checked against the header words on every page); words in a column are grouped into lines and
a block of lines is one cell (a line wrap is 7.2-7.3 pt, the smallest row pitch is 8.6 pt, so 7.8 pt separates cells); a row is the item cell plus the
block in each other column whose centre is within 1.5 pt of it (every row must match exactly one block in every column). Category headings are the
all-capital item cells with no calories. The script stops if the page count, the header positions, the number of rows (206), the category list or any
cell's shape changes.

Rows with sizes (a row is published once per size, the size is in the name and in `serving`, exactly as printed):
"2 scoops: 315 / 1 scoop: 158" (Hackney Gelato), "Approx. 125ml: 90 / 175ml: 132 / 250ml: 189" (wines; "Approx." is printed on the 125ml size only and is
kept there), "Single- 57 / Double- 114" (spirits; the measure is not stated), "125ml- 389" (Limoncello). Birra Moretti (330ml) / (660ml) carry their size in
the name.

LEFT OUT (EXCLUDED below; the script stops if this list changes):
 - no figure: Acqua Panna Still Water and San Pellegrino Sparkling Water print "N/A".
 - no single portion: Espresso (single/double) and Macchiato (single/double) with Semi-Skimmed Milk print ONE figure for "single/double"; the two draught
   beers Birra Moretti (Draft) 216 and Birrificio Angelo Poretti (Draft) 48 state no measure (and 48 kcal for a 4.6% ABV draught is about what 100 ml
   holds, while the other draught of the same strength prints 216).
 - not a dish as served: five retail products, whose figure cannot be for the weight in the name (Summer Truffle Grinder 10g 5 kcal, Summer Truffle Salt
   100g 1, Summer Truffle Sauce 180g 5, White Truffle Butter 175g 15, Summer Truffle Honey 400g 1).
 - rows the chart contradicts itself on (HELD_BACK below, written to holdback.csv, policy 3 of docs/ACCURACY_AUDIT.md): an allergen printed in capitals in
   the row's own ingredient list that its Allergens column does not mark, or a vegetarian/vegan mark that the row's own allergens or ingredients deny.

Allergens (docs/DATA.md "Allergens"): the chart's "Allergens" column (contains, with the named cereal and nut in brackets) and "May Contain" column are
copied for EVERY published row (all or nothing holds). "None" = none of the 14 marked. The chart also says, above the table, "ALL DISHES MAY CONTAIN
TRACES OF THE 14 MAJOR ALLERGENS", so may_contain_published = yes and note.txt says so; a dish's own "May Contain" column is what the chart lists for it.
Printed spellings kept in ALLERGEN_WORDS ("Cereals Containig Gluten" is the chart's typo). Where a dish contains one tree nut or cereal and "may contain" the
generic kind, common.write_allergens stores the generic allergen.

Tags: vegetarian only where the chart's "Suitable for VEGETARIAN Diet" cell says YES for the row (its key: "(v) = made with vegetarian ingredients"; a
vegan YES must come with a vegetarian YES or the run stops). contains_pork / contains_beef when the dish's printed name or its printed ingredient list
names pork (pork, bacon, ham, pancetta, guanciale, prosciutto, salami, nduja, chorizo, coppa) or beef (beef, steak); a dish the chart marks vegetarian gets
neither. Anything else, e.g. "Chargrilled Chicken", is left untagged; sausage or meatball dishes that name no meat type are listed as "meat type not stated".
"""
from __future__ import annotations

import argparse
import collections
import html
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "pasta-evangelists"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
ALLERGENS_PAGE = "https://pastaevangelists.com/pages/allergens"
CHART_URL = ("https://docs.google.com/spreadsheets/d/1I2wXH_PQNO21w4CvaETgOLM7OBJDQCY5b4vq0cK0rEo/export"
             "?format=pdf&gid=1206536742&portrait=false&attachment=false")
SOURCE_TITLE = ("Pasta Evangelists Restaurants Allergen Chart (Quality Management System 5.3.1b, a Google Sheets PDF export linked from the chain's "
                "Allergens page; the chart prints no date)")
GUIDE_TITLE = "Pasta Evangelists Restaurants Allergen Chart (from the chain's Allergens page, no date printed)"
NOTE = ("Calories only, per portion as the chart prints them (no weights); protein, carbs and fat are not published. Allergens and \"may contain\" are the chart's "
        "own columns, and the chart also says all dishes may contain traces of the 14 major allergens. Restaurants only: Harrods, delivery and events have separate charts.")

EXPECTED_PAGES = 17
EXPECTED_ROWS = 206
EXPECTED_CATEGORIES = ["BREAD & FOCACCIA", "ANTIPASTI", "SIDES", "FRESH PASTA", "SEASONAL SPECIALS", "FILLED PASTA", "BAKED PASTA", "PASTA SHAPES ONLY",
                       "ADD ONS / GARNISHES", "DESSERTS", "SOFT DRINKS", "ALCOHOL-FREE", "BEER & CIDERS", "WINES", "SPIRITS", "COCKTAILS", "HOT DRINKS"]
CATEGORY_NAMES = {"BREAD & FOCACCIA": "Bread & focaccia", "ANTIPASTI": "Antipasti", "SIDES": "Sides", "FRESH PASTA": "Fresh pasta",
                  "SEASONAL SPECIALS": "Seasonal specials", "FILLED PASTA": "Filled pasta", "BAKED PASTA": "Baked pasta",
                  "PASTA SHAPES ONLY": "Pasta shapes only", "ADD ONS / GARNISHES": "Add-ons & garnishes", "DESSERTS": "Desserts",
                  "SOFT DRINKS": "Soft drinks", "ALCOHOL-FREE": "Alcohol-free", "BEER & CIDERS": "Beer & ciders", "WINES": "Wines", "SPIRITS": "Spirits",
                  "COCKTAILS": "Cocktails", "HOT DRINKS": "Hot drinks"}

# Column x ranges in points (a word belongs to the column that holds its centre); header words are checked against them on every page.
COLUMNS = [("item", 0, 176), ("allergens", 176, 262), ("may", 262, 337), ("kcal", 337, 390), ("veg", 390, 430), ("vegan", 430, 465), ("ingr", 465, 1000)]
HEADER = {"Item": "item", "Allergens": "allergens", "Contain": "may", "(kcal)": "kcal", "VEGETARIAN": "veg", "VEGAN": "vegan", "Ingredients": "ingr"}
BODY_TOP = 200.0       # the table body starts below the header row (the header ends at 198.9)
SAME_CELL = 7.8        # line pitch up to this joins lines into one cell (a wrapped line is 7.2-7.3 pt, the smallest row pitch 8.6 pt)
MATCH = 1.5            # centres of the cells of one row differ by at most this

# Rows not published (name -> why). The run stops if a name is missing from the chart or another row would need the same treatment.
EXCLUDED = {
    "Acqua Panna Still Water": "calories printed as N/A",
    "San Pellegrino Sparkling Water": "calories printed as N/A",
    "Espresso (single/double)": "one figure printed for 'single/double': which size it is for is not stated",
    "Macchiato (single/double) with Semi-Skimmed Milk": "one figure printed for 'single/double': which size it is for is not stated",
    "Birra Moretti (Draft) (4.6% ABV)": "draught beer with no measure stated",
    "Birrificio Angelo Poretti (Draft) (4.6% ABV)": "draught beer with no measure stated; 48 kcal is about what 100 ml of a 4.6% beer holds while the other draught of the same strength prints 216",
    "Pasta Evangelists Summer Truffle Grinder 10g": "retail product: the figure cannot be for the weight in the name",
    "Pasta Evangelists Summer Truffle Salt 100g": "retail product: the figure cannot be for the weight in the name",
    "Pasta Evangelists Summer Truffle Sauce 180g": "retail product: the figure cannot be for the weight in the name",
    "Pasta Evangelists White Truffle Butter 175g": "retail product: the figure cannot be for the weight in the name",
    "Pasta Evangelists Summer Truffle Honey 400g": "retail product: the figure cannot be for the weight in the name",
}
# Rows the chart contradicts itself on, found by the checks below and confirmed by reading the row in the rendered page (name -> reason).
HELD_BACK: dict[str, str] = {
    "Hackney Gelato Alphonso Mango Sorbetto": ("the chart marks no allergen (Allergens: None) and the dish vegan, but its own ingredient list ends with the "
                                               "mint wafer, printed with WHEAT, SOYA and MILK; the chart contradicts itself, so neither row is chosen"),
    "Egg Fusilli with Tuscan-Style Sausage & Fennel Ragù": ("the Allergens cell ends 'Cereals Containig Gluten (Wheat), Celery, Egg, Milk,' with a dangling comma, "
                                                              "so the list may be cut off; an allergen list that may be incomplete is not published"),
    "Hackney Gelato Strawberry Clotted Cream": ("the May Contain cell ends 'Egg, Peanuts, Soya, Tree Nuts,' with a dangling comma, so the list may be cut off; "
                                                "an allergen list that may be incomplete is not published"),
    "Kocktail Amaretto Sour": ("the ingredient list names Lazzaroni Amaretto (an almond or apricot-kernel liqueur) but the Allergens cell says None; the chart's "
                               "row may omit nuts, so it is not published"),
    "Pinot Grigio, Franz Haas, Dolomiti Pinot Grigio, 2025, 13 ABV": ("the row's own sizes disagree: 175ml 119 and 250ml 170 are both 0.68 kcal per ml, "
                                                                        "but Approx. 125ml 95 is 0.76 kcal per ml (the other 17 wines with three sizes agree within 3%); none is chosen"),
}

# The chart's own allergen spellings, added to common.allergen_words' table.
ALLERGEN_WORDS = {"cereals containig gluten": ("gluten", None)}
# Printed capital-letter words in an ingredient list -> the allergen they name (the chart capitalises allergens in its ingredient lists).
CAPS_ALLERGENS = {"WHEAT": "gluten", "BARLEY": "gluten", "OATS": "gluten", "OAT": "gluten", "RYE": "gluten", "SPELT": "gluten", "MILK": "milk", "EGG": "eggs",
                  "EGGS": "eggs", "SOYA": "soya", "SOY": "soya", "SULPHITES": "sulphites", "SULPHITE": "sulphites", "SULPHUR": "sulphites", "CRUSTACEANS": "crustaceans",
                  "CRUSTACEAN": "crustaceans", "MOLLUSCS": "molluscs", "MOLLUSC": "molluscs", "FISH": "fish", "CELERY": "celery", "MUSTARD": "mustard",
                  "SESAME": "sesame", "LUPIN": "lupin", "PEANUTS": "peanuts", "PEANUT": "peanuts", "HAZELNUTS": "nuts", "HAZELNUT": "nuts", "ALMONDS": "nuts",
                  "ALMOND": "nuts", "CASHEW": "nuts", "CASHEWS": "nuts", "PISTACHIO": "nuts", "PISTACHIOS": "nuts", "WALNUTS": "nuts", "WALNUT": "nuts"}
PORK = re.compile(r"\b(pork|bacon|ham|pancetta|guanciale|prosciutto|salami|n'?duja|chorizo|coppa)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?)\b", re.I)
MEAT_UNSPECIFIED = re.compile(r"sausage|meatball|ragu|ragù|bolognese|lasagne|charcuterie", re.I)
SIZE = re.compile(r"(Approx\.\s*)?(\d+ml|\d+ scoops?|Single|Double)\s*[:\-]\s*(\d+)")


# ---------------------------------------------------------------------------------------------- fetching (polite, robots-checked)
def curl(url: str, out: Path) -> int:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    return int(res.stdout.strip() or 0)


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    for host, name in (("https://pastaevangelists.com", "robots-pastaevangelists.txt"), ("https://docs.google.com", "robots-docs.txt")):
        if not (cache / name).exists():
            if curl(f"{host}/robots.txt", cache / name) != 200:
                raise SystemExit(f"cannot read {host}/robots.txt: stop (never work round it)")
            time.sleep(1.2)
    own = robots_rfc.parse((cache / "robots-pastaevangelists.txt").read_text(encoding="utf-8-sig"))
    docs = robots_rfc.parse((cache / "robots-docs.txt").read_text(encoding="utf-8-sig"))
    if not robots_rfc.allowed(own, "/pages/allergens"):
        raise SystemExit("robots.txt disallows /pages/allergens: stop (never work round it)")
    page = cache / "allergens.html"
    if not page.exists():
        code = curl(ALLERGENS_PAGE, page)
        if code != 200:
            page.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code} for {ALLERGENS_PAGE}")
        time.sleep(1.2)
    if CHART_URL.replace("&", "&amp;") not in page.read_text(encoding="utf-8") and CHART_URL not in page.read_text(encoding="utf-8"):
        raise SystemExit("the chain's Allergens page no longer links the Restaurants chart address in CHART_URL: re-check")
    path = CHART_URL.split("docs.google.com", 1)[1]
    if not robots_rfc.allowed(docs, path):
        raise SystemExit(f"docs.google.com robots.txt disallows {path}: stop (never work round it)")
    pdf = cache / "restaurants.pdf"
    if not pdf.exists():
        code = curl(CHART_URL, pdf)
        if code != 200 or pdf.read_bytes()[:5] != b"%PDF-":
            pdf.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code} or not a PDF for the Restaurants chart: stop")


# ---------------------------------------------------------------------------------------------- reading the chart
def page_words(pdf: Path, page: int) -> list[tuple]:
    t = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), str(pdf), "-"], capture_output=True, text=True).stdout
    return [(float(a), float(b), float(c), float(d), html.unescape(w))
            for a, b, c, d, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', t)]


def column_of(w: tuple) -> str:
    xc = (w[0] + w[2]) / 2
    for name, lo, hi in COLUMNS:
        if lo <= xc < hi:
            return name
    raise SystemExit(f"word {w[4]!r} is outside every column")


def blocks(ws: list[tuple]) -> list[dict]:
    """The cells of one column: words grouped into lines, lines into blocks (line pitch up to SAME_CELL)."""
    lines: dict[float, list] = collections.defaultdict(list)
    for w in ws:
        lines[round(w[1], 1)].append(w)
    out: list[dict] = []
    for y in sorted(lines):
        ln = sorted(lines[y], key=lambda w: w[0])
        text = " ".join(w[4] for w in ln)
        yc = (min(w[1] for w in ln) + max(w[3] for w in ln)) / 2
        if out and y - out[-1]["last"] <= SAME_CELL:
            out[-1].update(last=y)
            out[-1]["lines"].append(text)
            out[-1]["ys"].append(yc)
        else:
            out.append({"lines": [text], "last": y, "ys": [yc]})
    for b in out:
        b["yc"] = (b["ys"][0] + b["ys"][-1]) / 2
    return out


def read_chart(pdf: Path) -> tuple[list[dict], list[str]]:
    info = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    pages = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    if pages != EXPECTED_PAGES:
        raise SystemExit(f"the chart has {pages} pages, expected {EXPECTED_PAGES}: it changed, re-read it")
    rows: list[dict] = []
    cats: list[str] = []
    cur = None
    for p in range(1, pages + 1):
        allw = page_words(pdf, p)
        for w in allw:  # header words must sit in their own column
            if w[4] in HEADER and 170 < w[1] < 200 and column_of(w) != HEADER[w[4]]:
                raise SystemExit(f"page {p}: header word {w[4]!r} is in column {column_of(w)}, expected {HEADER[w[4]]}: the layout changed")
        if not any(w[4] == "Ingredients" for w in allw):
            raise SystemExit(f"page {p}: no table header: the layout changed")
        ws = [w for w in allw if w[1] >= BODY_TOP]
        cut = [w for w in ws if w[4] == "PASTEURISED"]  # a list of cheeses (no calories) follows the table on the last page
        if cut:
            if p != pages:
                raise SystemExit("the cheese list is no longer on the last page: re-read the chart")
            ws = [w for w in ws if w[1] < cut[0][1] - 1]
        elif p == pages:
            raise SystemExit("the 'PASTEURISED CHEESES' list is not on the last page: re-read the chart")
        by = collections.defaultdict(list)
        for w in ws:
            by[column_of(w)].append(w)
        cells = {n: blocks(by[n]) for n, _, _ in COLUMNS}
        for ib in cells["item"]:
            m = {n: [b for b in cells[n] if abs(b["yc"] - ib["yc"]) <= MATCH] for n, _, _ in COLUMNS if n != "item"}
            name = " ".join(ib["lines"])
            if not m["kcal"] and name.upper() == name:
                cur = name
                cats.append(name)
                continue
            if any(len(v) != 1 for v in m.values()):
                raise SystemExit(f"page {p}: row {name!r} does not match exactly one cell in every column: {{{', '.join(f'{k}: {len(v)}' for k, v in m.items())}}}")
            rows.append(dict(page=p, category=cur, name_lines=ib["lines"], **{k: v[0]["lines"] for k, v in m.items()}))
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"{len(rows)} rows read, expected {EXPECTED_ROWS}: the chart changed")
    if cats != EXPECTED_CATEGORIES:
        raise SystemExit(f"categories are {cats}, expected {EXPECTED_CATEGORIES}")
    return rows, cats


# ---------------------------------------------------------------------------------------------- cells
def join_name(lines: list[str]) -> str:
    """A name cell's lines joined: a line that ends in a hyphen was wrapped at the hyphen ("Add-" / "on" = "Add-on")."""
    out = ""
    for ln in lines:
        out = out + ln if out.endswith("-") else (out + " " + ln if out else ln)
    return re.sub(r"\s+", " ", out.replace("`", "'")).strip()


def split_top(text: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def parse_allergen_cell(lines: list[str], where: str) -> tuple[set, set, set]:
    text = re.sub(r"\s+", " ", " ".join(lines)).strip().rstrip(",").strip()
    if text.lower() == "none":
        return set(), set(), set()
    words = []
    for token in split_top(text):
        m = re.fullmatch(r"(.+?)\s*\((.+)\)", token)
        if m:
            words.append(m.group(1))
            words += [x.strip() for x in m.group(2).split(",")]
        else:
            words.append(token)
    return allergen_words(words, where, ALLERGEN_WORDS)


def caps_allergens(ingredients: str) -> set:
    return {CAPS_ALLERGENS[w] for w in re.findall(r"\b[A-Z]{3,}\b", ingredients) if w in CAPS_ALLERGENS}


def yes_no(lines: list[str], where: str) -> bool:
    v = " ".join(lines).strip().upper()
    if v not in ("YES", "NO"):
        raise SystemExit(f"{where}: dietary cell {lines!r} is neither YES nor NO")
    return v == "YES"


def kcal_options(lines: list[str], where: str) -> list[tuple[str, str, str]]:
    """[(size label for the name, serving as printed, calories)]; one entry with empty labels for a plain figure."""
    text = " ".join(lines).strip()
    if re.fullmatch(r"\d+(\.\d+)?", text):
        return [("", "", text)]
    found = list(SIZE.finditer(text))
    if not found or " ".join(m.group(0) for m in found) != text:
        raise SystemExit(f"{where}: calories cell {lines!r} is not a plain number or a list of sizes: re-read the chart")
    return [(m.group(2), (m.group(1) or "") + m.group(2), m.group(3)) for m in found]


# ---------------------------------------------------------------------------------------------- build
def build(pdf: Path) -> tuple[list[dict], list[tuple], list[str], dict]:
    rows, _cats = read_chart(pdf)
    items, holdback, report = [], [], []
    stats = collections.Counter()
    seen_excluded = set()
    contradictions = []
    for r in rows:
        name = join_name(r["name_lines"])
        where = f"page {r['page']} {name!r}"
        if name in EXCLUDED:
            seen_excluded.add(name)
            stats["left out"] += 1
            continue
        contains, cereals, nuts = parse_allergen_cell(r["allergens"], where)
        may, _c2, _n2 = parse_allergen_cell(r["may"], where)
        veg, vegan = yes_no(r["veg"], where), yes_no(r["vegan"], where)
        if vegan and not veg:
            raise SystemExit(f"{where}: marked vegan but not vegetarian")
        ingredients = re.sub(r"\s+", " ", " ".join(r["ingr"])).strip()
        text = f"{name} {ingredients}"
        mismatch = sorted(caps_allergens(ingredients) - contains)
        flag = []
        if mismatch:
            flag.append(f"its ingredient list names {', '.join(mismatch)} in capitals but the Allergens column does not mark it")
        for col_name, cell in (("Allergens", r["allergens"]), ("May Contain", r["may"])):
            if " ".join(cell).strip().endswith(","):
                flag.append(f"its {col_name} cell ends with a comma ({' '.join(cell)!r}), so the list may be cut off")
        if veg and (contains & {"fish", "crustaceans", "molluscs"} or PORK.search(text) or BEEF.search(text)):
            flag.append("marked vegetarian although its allergens or ingredients name fish, shellfish, pork or beef")
        if flag:
            contradictions.append((name, "; ".join(flag)))
        if name in HELD_BACK:
            holdback.append((name, HELD_BACK[name]))
        tags = []
        if veg:
            tags.append("vegetarian")
        else:
            if PORK.search(text):
                tags.append("contains_pork")
            if BEEF.search(text):
                tags.append("contains_beef")
            if not tags and MEAT_UNSPECIFIED.search(text):
                report.append(f"meat type not stated: {name}")
        for label, serving, kcal in kcal_options(r["kcal"], where):
            item_name = f"{name} - {label}" if label else name
            if not label and re.search(r"\((330ml|660ml)\)", name):
                serving = re.search(r"\((330ml|660ml)\)", name).group(1)
            items.append(dict(name=item_name, category=CATEGORY_NAMES[r["category"]], serving=serving, calories=kcal, tags="|".join(tags), rankable=False,
                              allergens=dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts),
                              notes=f"page {r['page']}: '{name}' {' '.join(r['kcal'])} kcal; vegetarian {' '.join(r['veg'])}, vegan {' '.join(r['vegan'])}"))
            stats["published"] += 1
    if seen_excluded != set(EXCLUDED):
        raise SystemExit(f"EXCLUDED names not in the chart any more: {sorted(set(EXCLUDED) - seen_excluded)}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("item names are not unique: " + ", ".join(n for n, c in collections.Counter(names).items() if c > 1))
    return items, holdback, report, dict(stats=stats, contradictions=contradictions, rows=rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path, help="folder for the downloaded page and chart")
    ap.add_argument("--fetch", action="store_true", help="download the page and the chart first (skips what is already there)")
    ap.add_argument("--checked-on", help="the day the chart was read, YYYY-MM-DD")
    ap.add_argument("--show", action="store_true", help="print every row read")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
        if not args.checked_on:
            return 0
    if not args.checked_on:
        ap.error("--checked-on is required")
    pdf = args.cache / "restaurants.pdf"
    items, holdback, report, extra = build(pdf)
    held = {n for n, _ in holdback}
    for name, why in extra["contradictions"]:
        print(("HELD BACK " if name in held else "CONTRADICTION (not yet in HELD_BACK) ") + f"{name}: {why}")
    if any(n not in held for n, _ in extra["contradictions"]):
        raise SystemExit("some rows contradict themselves: read each in the rendered chart and add it to HELD_BACK (or explain it)")
    unknown = set(HELD_BACK) - {i["name"].split(" - ")[0] for i in items}
    if unknown:
        raise SystemExit(f"HELD_BACK names not in the chart any more: {sorted(unknown)}")
    holdback = [(slug(i["name"]), HELD_BACK[i["name"].split(" - ")[0]]) for i in items if i["name"].split(" - ")[0] in held]
    print(f"chart sha256 {sha256_file(pdf)}; {EXPECTED_ROWS} rows read; {extra['stats']['left out']} left out, {len(holdback)} items held back")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Pasta Evangelists", cuisine="Italian", source_title=SOURCE_TITLE, source_url=CHART_URL,
                             checked_on=args.checked_on, aliases=["pasta evangelists", "pastaevangelists"], items=items, out=args.out, note=NOTE,
                             holdback=holdback, nutrition_level="calories",
                             allergen_guide=dict(title=GUIDE_TITLE, url=ALLERGENS_PAGE, checked_on=args.checked_on, may_contain_published=True))
    print("\n".join(report))
    counts = collections.Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    if args.show:
        for i in items:
            print(f"{i['category']:20} {i['name'][:70]:70} {i['serving']:16} {i['calories']:>5} {i['tags']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
