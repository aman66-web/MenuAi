#!/usr/bin/env python3
"""Build data/source/chaiiwala/ from Chaiiwala's own website menu pages (a CALORIES-ONLY chain) and its allergen matrix.

    python3 tools/uk_extract/chaiiwala.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds three saved files (--fetch downloads them first, one request per second, robots.txt checked):
    menu.html              https://www.chaiiwala.co.uk/menu               (the menu page, server-rendered, every dish card)
    allergens.html         https://www.chaiiwala.co.uk/allergens          (the allergen matrix as an HTML table)
    allergen-matrix.pdf    https://www.chaiiwala.co.uk/api/allergen-matrix.pdf  (the same matrix as a 13-page PDF, "V15 October 2026";
                                                                          robots.txt explicitly allows this one path under /api)
The PDF is only used as a cross-check (needs `pdftotext` from poppler); without it the HTML matrix alone is used.

Calories: each dish card on /menu prints "NNN kcal" (drinks print "Regular NNN kcal, Large NNN kcal"). Nothing else is
printed anywhere on the site (no protein, carbs, fat, salt, kJ, weights): so this is a calories-only chain
(docs/DATA.md "Calories-only chains"; protein, carbs and fat stay blank and every item is non-rankable). The values are copied as
printed. The page embeds the same dish records the cards are drawn from (Next.js data in the HTML); the script reads those records
and then checks every card's visible name and kcal against them, so a change in either stops the run.

Items: one row per dish with a printed kcal; a drink with a Large figure becomes two rows "(Regular)" and "(Large)" with the serving
"Regular" / "Large". Dishes with no kcal printed (fridge drinks, Grab & Go, some desserts and wraps) are not listed. All-lowercase
names are capitalised (Title Case); nothing else is changed. Categories are the menu's own sections, in page order.

Select stores: 18 listed dishes carry the chain's own "in select stores" flag. The chain does not say which stores, so this is not a
single-venue or regional-trial row: they are kept (set EXCLUDE_SELECT_STORES = True to drop them).

Allergens (docs/DATA.md "Allergens"): the matrix has a row for every dish on the menu (142 rows, names identical to the cards) and
24 columns: the six gluten cereals, eggs, peanuts, soya, milk, nine tree nuts, celery, mustard, sesame seeds, sulphur, lupin. A tick
means contains, an asterisk means may contain traces. It has NO columns for fish, crustaceans or molluscs, so those three are never
marked (the app shows them as "Not listed", which it explains is not "free from"); note.txt says so. "sulphur" is read as sulphites
(the column for sulphur dioxide and sulphites). "queensland nuts" is read as macadamia (the same nut, common._A). The HTML matrix,
the PDF matrix and the allergen icons on the menu cards must all agree, or the run stops.
Published since 2026-10-08 (PUBLISH_ALLERGENS = True): every one of the 132 published items has its own matrix row (the names are identical to
the cards), copied exactly. Fish, crustaceans and molluscs are not matrix columns, so they read "Not listed" in the app, never "free from".
Set PUBLISH_ALLERGENS = False to publish the guide link only.

Tags: vegetarian when the card shows the chain's Vegetarian or Vegan badge. contains_pork / contains_beef only when the dish name or its
one-line summary on the card says pork / ham / bacon / beef / steak and so on ("lamb bacon" and "chicken sausage" are not pork; the
long marketing descriptions are not read for tags). The chain's menu names no pork or beef dish, so no item carries either tag.
"""
from __future__ import annotations
import argparse
import html
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "chaiiwala"
BASE = "https://www.chaiiwala.co.uk"
FILES = {  # file name -> url
    "menu.html": BASE + "/menu",
    "allergens.html": BASE + "/allergens",
    "allergen-matrix.pdf": BASE + "/api/allergen-matrix.pdf",
}
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SOURCE_TITLE = "Chaiiwala website menu pages with calories (accessed 2026-10-08, no date shown); allergens from Allergen Information V15, October 2026"
ALLERGEN_TITLE = "Chaiiwala allergen matrix, Allergen Information V15 (October 2026)"
ALLERGEN_URL = BASE + "/allergens"
MAY_CONTAIN_PUBLISHED = True  # the matrix prints "*" = may contain traces
PUBLISH_ALLERGENS = True    # 2026-10-08: published. The matrix has no fish, crustacean or mollusc columns, so those three are never marked and the
                            # app shows them as "Not listed" (it says that is not "free from"); the chain note says so too. False = link only.
EXCLUDE_SELECT_STORES = False
ALIASES = ["chaiiwala"]
NOTE = ("Calories only: Chaiiwala prints kcal on its menu pages (drinks for Regular and Large), no protein, carbs or fat. Dishes with no kcal "
        "printed (fridge drinks, Grab & Go, a few others) are not listed. Some dishes are sold in select stores only. The allergen matrix "
        "has no fish, crustacean or mollusc columns, so those read Not listed, not free from.")

# Menu section id (from the page) -> category shown. A new section stops the run.
SECTIONS = {
    "menu-section-hot-drinks": "Hot drinks",
    "menu-section-wala-bundles": "Wala bundles",
    "menu-section-cold-drinks": "Cold drinks",
    "menu-section-all-day-breakfast": "All day breakfast",
    "menu-section-wala-wraps": "Wala wraps",
    "menu-section-bombay-bowls": "Lunch & dinner bowls",
    "menu-section-bombay-toasties": "Bombay toasties",
    "menu-section-street-food": "Street food",
    "menu-section-wala-kids": "Wala kids",
    "menu-section-signature-desserts": "Desserts",
    "menu-section-grabngo": "Grab & Go",
}
EXPECTED_CARDS = 142          # dish cards on /menu (and rows in the matrix)
EXPECTED_WITH_KCAL = 103      # of which print a kcal figure
EXPECTED_WITH_LARGE = 29      # of which also print a Large figure
EXPECTED_ITEMS = EXPECTED_WITH_KCAL + EXPECTED_WITH_LARGE
EXPECTED_SELECT_STORES_WITH_KCAL = 18
# The serving a bundle states about itself (checked against the dish's own short description on every run).
BUNDLE_SERVING = {
    "the-wala-box": ("perfect for 1", "Perfect for 1"),
    "the-wala-box-veg": ("perfect for 1", "Perfect for 1"),
    "the-family-platter": ("feast for 4", "Feast for 4"),
    "the-family-platter-veg": ("feast for 4", "Feast for 4"),
    "chaii-flask": ("six generous cups", "Flask, 6 cups"),  # said in the description
}

# The matrix columns in order, exactly as the page headings print them.
GLUTEN_COLS = ["wheat", "rye", "barley", "oats", "spelt", "kamut"]
NUT_COLS = ["almonds", "hazelnuts", "walnuts", "cashews", "pecan nuts", "brazil nuts", "pistachio nuts", "macadamia", "queensland nuts"]
COLUMNS = GLUTEN_COLS + ["eggs", "peanuts", "soya", "milk"] + NUT_COLS + ["celery", "mustard", "sesame seeds", "sulphur", "lupin"]
EXTRA_WORDS = {"sulphur": ("sulphites", None)}  # the column for sulphur dioxide and sulphites
# Card allergen ids (menu data) -> matrix column heading
CARD_ID_TO_COLUMN = {c.replace(" ", "-"): c for c in COLUMNS}

PORK = re.compile(r"\b(pork|ham|bacon|gammon|pepperoni|salami|chorizo|prosciutto|pancetta)\b", re.I)
PORK_NOT = re.compile(r"\b(lamb|turkey|beef|chicken|veg|vegan)\s+(bacon|ham|sausages?|pepperoni|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|brisket)\b", re.I)
MEAT_WORD = re.compile(r"\b(chicken|lamb|mutton|beef|pork|turkey|fish|prawns?|tuna|bacon|ham|sausages?|egg|eggs|omelette)\b", re.I)


# ---------------------------------------------------------------------------------------------------- fetching
def robots_allows(robots_txt: str, path: str) -> bool:
    """robots.txt for 'User-agent: *' with the longest matching rule winning (Allow wins a tie): Python's own parser takes the
    first match, which would let '/api' pass because of 'Allow: /'. Chaiiwala allows exactly /api/allergen-matrix.pdf under /api."""
    rules, in_star = [], False
    for line in robots_txt.splitlines():
        line = line.split("#")[0].strip()
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            in_star = value == "*"
        elif in_star and key in ("allow", "disallow") and value:
            rules.append((key, value))
    best = None
    for key, value in rules:
        if path.startswith(value) and (best is None or len(value) > len(best[1]) or (len(value) == len(best[1]) and key == "allow")):
            best = (key, value)
    return best is None or best[0] == "allow"


def fetch_all(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(BASE + "/robots.txt", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
        robots = r.read().decode("utf-8", "replace")
    time.sleep(1.0)
    for fname, url in FILES.items():
        if not robots_allows(robots, url[len(BASE):]):
            raise SystemExit(f"robots.txt does not allow {url}: stop and ask the founder to download the file himself")
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
            (dest / fname).write_bytes(r.read())
        time.sleep(1.0)


# ---------------------------------------------------------------------------------------------------- menu page
def _flight_payload(text: str) -> str:
    """The page's Next.js data: the concatenated strings of every self.__next_f.push([1, "..."]) call."""
    dec = json.JSONDecoder()
    out = []
    for m in re.finditer(r"self\.__next_f\.push\(", text):
        try:
            arr, _ = dec.raw_decode(text, m.end())
        except ValueError:
            continue
        if isinstance(arr, list) and len(arr) == 2 and arr[0] == 1 and isinstance(arr[1], str):
            out.append(arr[1])
    return "".join(out)


def read_records(menu_html: str) -> list[dict]:
    full = _flight_payload(menu_html)
    m = re.search(r'\{"items":\[\{"id":', full)
    if not m:
        raise SystemExit("menu.html: the embedded dish records were not found: the page layout changed, re-check the reader")
    records, _ = json.JSONDecoder().raw_decode(full, full.index("[", m.start()))
    for r in records:  # later records point at an earlier record's category object
        if isinstance(r["category"], str):
            ref = re.match(r"^\$[0-9a-f]+:\d+:props:items:(\d+):category$", r["category"])
            if not ref:
                raise SystemExit(f"menu.html: unexpected category reference {r['category']!r}")
            r["category"] = records[int(ref.group(1))]["category"]
    return records


def strip_scripts(text: str) -> str:
    return re.sub(r"<script.*?</script>", "", text, flags=re.S)


def read_cards(menu_html: str) -> list[dict]:
    """The dish cards as drawn: section id, slug, name, visible kcal figures, badge, allergen icons (in page order)."""
    body = strip_scripts(menu_html)
    cards = []
    sections = re.findall(r'<section aria-labelledby="(menu-section-[^"]+)">(.*?)</section>', body, flags=re.S)
    if [s for s, _ in sections] != list(SECTIONS):
        raise SystemExit(f"menu.html: sections are now {[s for s, _ in sections]}, expected {list(SECTIONS)}: update SECTIONS")
    for sec, inner in sections:
        for slug_, card in re.findall(r'<a class="group block" href="/menu/([^"]+)">(.*?)</a>', inner, flags=re.S):
            h3 = re.search(r"<h3[^>]*>(.*?)</h3>", card, flags=re.S)
            kcal = [int(v.replace(",", "")) for v in re.findall(r">([\d,]+)<!-- --> kcal<", card)]
            labels = re.findall(r'role="img" aria-label="([^"]*)"', card)
            badge = re.findall(r'aria-label="(Vegetarian|Vegan)"', card)
            cards.append(dict(section=sec, slug=slug_, name=html.unescape(re.sub(r"<[^>]+>", "", h3.group(1))) if h3 else "",
                              kcal=kcal, badge=badge, allergen_labels=[html.unescape(x) for x in labels]))
    return cards


def check_cards(records: list[dict], cards: list[dict]) -> None:
    if len(records) != EXPECTED_CARDS or len(cards) != EXPECTED_CARDS:
        raise SystemExit(f"menu.html: {len(records)} records and {len(cards)} cards, expected {EXPECTED_CARDS}: the menu changed, re-check")
    by_slug = {r["slug"]: r for r in records}
    if len(by_slug) != len(records):
        raise SystemExit("menu.html: duplicate dish slugs")
    for c in cards:
        r = by_slug.get(c["slug"])
        if r is None:
            raise SystemExit(f"menu.html: card {c['slug']!r} has no record")
        want = [] if r.get("kcal") is None else [r["kcal"]] + ([r["kcalLarge"]] if r.get("kcalLarge") else [])
        if c["kcal"] != want:
            raise SystemExit(f"menu.html: {r['name']!r}: card shows kcal {c['kcal']} but the record says {want}")
        if c["name"].strip() != r["name"].strip():
            raise SystemExit(f"menu.html: card name {c['name']!r} differs from the record {r['name']!r}")
        diet = r.get("dietary") or {}
        if bool(c["badge"]) != bool(diet.get("vegetarian") or diet.get("vegan")):
            raise SystemExit(f"menu.html: {r['name']!r}: badge {c['badge']} disagrees with dietary flags {diet}")
        if SECTIONS[c["section"]].lower() != r["category"]["name"].lower():
            raise SystemExit(f"menu.html: {r['name']!r} sits in section {c['section']} but its record says category {r['category']['name']!r}")


# ---------------------------------------------------------------------------------------------------- allergen matrix
def read_matrix_html(text: str) -> dict[str, dict]:
    """name -> {"cells": {column: "contains"|"may"}} from the HTML tables (one per menu section)."""
    body = strip_scripts(text)
    rows: dict[str, dict] = {}
    for table in re.findall(r"<table.*?</table>", body, flags=re.S):
        trs = re.findall(r"<tr\b.*?</tr>", table, flags=re.S)
        heads = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip() for x in re.findall(r"<th\b[^>]*>(.*?)</th>", trs[0] + trs[1], flags=re.S)]
        if heads != ["item", "cereals containing gluten", "eggs", "peanuts", "soya", "milk", "tree nuts", "celery", "mustard", "sesame seeds",
                     "sulphur", "lupin"] + COLUMNS[:6] + COLUMNS[10:19]:
            raise SystemExit(f"allergens.html: column headings changed: {heads}")
        for tr in trs[2:]:
            ths = re.findall(r"<th\b[^>]*>(.*?)</th>", tr, flags=re.S)
            if not ths:
                continue  # a sub-heading row ("Signatures")
            name = html.unescape(re.sub(r"<[^>]+>", "", ths[0].split("<span")[0])).strip()
            tds = re.findall(r"<td\b([^>]*)>(.*?)</td>", tr, flags=re.S)
            if len(tds) != len(COLUMNS):
                raise SystemExit(f"allergens.html: row {name!r} has {len(tds)} cells, expected {len(COLUMNS)}")
            cells = {}
            for col, (attrs, inner) in zip(COLUMNS, tds):
                sym = re.sub(r"<[^>]+>", "", inner).strip()
                label = re.search(r'aria-label="([^"]*)"', attrs)
                label = html.unescape(label.group(1)) if label else ""
                if sym == "":
                    if label:
                        raise SystemExit(f"allergens.html: {name!r}/{col}: label {label!r} on an empty cell")
                    continue
                want = {"✓": "contains " + col, "*": "may contain traces of " + col}.get(sym)
                if want is None or label != want:
                    raise SystemExit(f"allergens.html: {name!r}/{col}: mark {sym!r} with label {label!r}, expected {want!r}")
                cells[col] = "contains" if sym == "✓" else "may"
            if name in rows:
                raise SystemExit(f"allergens.html: {name!r} appears twice")
            rows[name] = {"cells": cells}
    return rows


def read_matrix_pdf(pdf: Path) -> dict[str, dict]:
    """name -> {column: "contains"|"may"} from the PDF, by the position of each mark under its column heading."""
    xml = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    centres = [236.3 + 24.58 * i for i in range(len(COLUMNS))]  # column centres measured from the headings on page 2
    rows: dict[str, dict] = {}
    for page in xml.split("<page ")[1:]:
        words = [(float(a), float(b), float(c), float(d), html.unescape(w))
                 for a, b, c, d, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', page)]
        marks = [w for w in words if w[4] in ("•", "*") and w[1] > 150 and w[0] > 220]  # not the legend on page 1
        names = sorted([w for w in words if w[2] < 232 and w[1] > 150], key=lambda w: (round((w[1] + w[3]) / 2), w[0]))
        lines: list[dict] = []
        for w in names:
            yc = (w[1] + w[3]) / 2
            if lines and abs(lines[-1]["y"] - yc) < 3.0:
                lines[-1]["w"].append(w)
            else:
                lines.append({"y": yc, "w": [w]})
        for ln in lines:
            text = " ".join(x[4] for x in sorted(ln["w"], key=lambda z: z[0])).replace("(selected stores only)", "").strip()
            cells = {}
            for m in marks:
                if abs((m[1] + m[3]) / 2 - ln["y"]) < 4.5:
                    xc = (m[0] + m[2]) / 2
                    idx = min(range(len(centres)), key=lambda i: abs(centres[i] - xc))
                    if abs(centres[idx] - xc) > 6:
                        raise SystemExit(f"allergen PDF: a mark at x={xc:.0f} is under no column ({text!r})")
                    cells[COLUMNS[idx]] = "contains" if m[4] == "•" else "may"
            rows[text] = cells
    return rows


def check_matrix(records: list[dict], cards: list[dict], matrix: dict[str, dict], pdf_rows: dict | None) -> None:
    names = {r["name"].strip() for r in records}
    if set(matrix) != names:
        raise SystemExit(f"allergens.html rows differ from the menu: only in matrix {sorted(set(matrix) - names)}, only on menu {sorted(names - set(matrix))}")
    for r in records:  # the matrix and the menu data behind the cards must say the same
        cells = matrix[r["name"].strip()]["cells"]
        card_contains = {CARD_ID_TO_COLUMN[x] for x in (r.get("containsAllergens") or [])}
        card_may = {CARD_ID_TO_COLUMN[x] for x in (r.get("tracesAllergens") or [])}
        if {c for c, v in cells.items() if v == "contains"} != card_contains or {c for c, v in cells.items() if v == "may"} != card_may:
            raise SystemExit(f"{r['name']!r}: the allergen matrix and the menu data disagree")
    if pdf_rows is not None:
        want = {k: v["cells"] for k, v in matrix.items()}
        found = {k: v for k, v in pdf_rows.items() if k in want}
        if set(found) != set(want):
            raise SystemExit(f"allergen PDF has no row for {sorted(set(want) - set(found))}")
        for k in want:
            if found[k] != want[k]:
                raise SystemExit(f"allergen PDF row {k!r} differs from the HTML matrix")


def allergens_for(cells: dict[str, str], where: str) -> dict:
    contains, cereals, nuts = allergen_words([c for c, v in cells.items() if v == "contains"], where, EXTRA_WORDS)
    may, _, _ = allergen_words([c for c, v in cells.items() if v == "may"], where, EXTRA_WORDS)
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


# ---------------------------------------------------------------------------------------------------- items
def tidy(name: str) -> str:
    n = " ".join(name.split())
    if n == n.lower():  # all-lowercase names (CSS lowercases the headings) get a capital on every word
        n = " ".join(w[:1].upper() + w[1:] for w in n.split(" "))
    return n


def build(menu_html: str, matrix: dict[str, dict]) -> tuple[list[dict], list[str]]:
    records = read_records(menu_html)
    cards = read_cards(menu_html)
    check_cards(records, cards)
    by_slug = {r["slug"]: r for r in records}
    report: list[str] = []
    items: list[dict] = []
    with_kcal = with_large = select_kept = 0
    skipped_no_kcal: list[str] = []
    skipped_select: list[str] = []
    for c in cards:  # page order: sections as printed, cards as printed
        r = by_slug[c["slug"]]
        if r.get("kcal") is None:
            skipped_no_kcal.append(r["name"].strip())
            continue
        with_kcal += 1
        select = bool(r.get("selectStoresOnly"))
        if select and EXCLUDE_SELECT_STORES:
            skipped_select.append(r["name"].strip())
            continue
        select_kept += 1 if select else 0
        category = SECTIONS[c["section"]]
        name = tidy(r["name"])
        diet = r.get("dietary") or {}
        text = " ".join([r["name"], r.get("shortDescription") or "", r.get("description") or ""])  # for the meat-type report only
        named = " ".join([r["name"], r.get("shortDescription") or ""])  # pork / beef tags: the dish name and its one-line summary only
        text_pork = PORK_NOT.sub(" ", named)
        tags = []
        if diet.get("vegetarian") or diet.get("vegan"):
            tags.append("vegetarian")
        if PORK.search(text_pork):
            tags.append("contains_pork")
        if BEEF.search(named):
            tags.append("contains_beef")
        if not tags and not MEAT_WORD.search(text) and category not in ("Hot drinks", "Cold drinks", "Desserts", "Grab & Go"):
            report.append(f"meat type not stated / not vegetarian-flagged: {name}")
        cells = matrix[r["name"].strip()]["cells"]
        allergens = allergens_for(cells, f"allergens {r['name'].strip()!r}") if PUBLISH_ALLERGENS else None
        serving_text = BUNDLE_SERVING.get(r["slug"])
        base_note = [f"menu card /menu/{r['slug']}"]
        if r.get("isNew"):
            base_note.append("marked NEW")
        if select:
            base_note.append("flagged 'in select stores' (no stores named)")
        if serving_text:
            if serving_text[0] not in (text + " " + (r.get("description") or "")).lower():
                raise SystemExit(f"{name}: the page no longer says {serving_text[0]!r}")
            serving = serving_text[1]
            base_note.append(f"serving taken from the dish's own text ({serving_text[0]!r}); one figure printed for a bundle with choices")
        else:
            serving = ""
        sizes = [("", r["kcal"])]
        if r.get("kcalLarge"):
            with_large += 1
            if r["kcalLarge"] <= r["kcal"]:
                raise SystemExit(f"{name}: Large {r['kcalLarge']} kcal is not above Regular {r['kcal']}")
            sizes = [("Regular", r["kcal"]), ("Large", r["kcalLarge"])]
        for size, kcal in sizes:
            items.append(dict(name=f"{name} ({size})" if size else name, category=category, serving=size or serving, calories=kcal,
                              tags="|".join(tags), rankable=False, allergens=allergens, notes="; ".join(base_note)))
    if with_kcal != EXPECTED_WITH_KCAL or with_large != EXPECTED_WITH_LARGE or len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"{with_kcal} dishes with kcal, {with_large} with a Large figure, {len(items)} items: expected "
                         f"{EXPECTED_WITH_KCAL}, {EXPECTED_WITH_LARGE}, {EXPECTED_ITEMS}. The menu changed: re-check, then update the expected counts.")
    if select_kept != EXPECTED_SELECT_STORES_WITH_KCAL and not EXCLUDE_SELECT_STORES:
        raise SystemExit(f"{select_kept} select-stores dishes, expected {EXPECTED_SELECT_STORES_WITH_KCAL}")
    ids = [slug(i["name"]) for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("item names are not unique")
    report.append(f"not listed, no kcal printed ({len(skipped_no_kcal)}): " + ", ".join(skipped_no_kcal))
    if skipped_select:
        report.append(f"not listed, select stores only ({len(skipped_select)}): " + ", ".join(skipped_select))
    return items, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding menu.html, allergens.html, allergen-matrix.pdf")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were downloaded and read")
    ap.add_argument("--fetch", action="store_true", help="download the three files into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    for fname in FILES:
        p = args.pages / fname
        if p.exists():
            print(f"{fname} sha256 {sha256_file(p)}")
    menu_html = (args.pages / "menu.html").read_text(encoding="utf-8")
    matrix = read_matrix_html((args.pages / "allergens.html").read_text(encoding="utf-8"))
    pdf_path = args.pages / "allergen-matrix.pdf"
    pdf_rows = None
    if pdf_path.exists():
        try:
            pdf_rows = read_matrix_pdf(pdf_path)
        except FileNotFoundError:
            print("pdftotext (poppler) is not installed: cross-check against the PDF skipped")
    else:
        print("allergen PDF not found: cross-check against the PDF skipped")
    records = read_records(menu_html)
    check_matrix(records, read_cards(menu_html), matrix, pdf_rows)
    items, report = build(menu_html, matrix)
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Chaiiwala", cuisine="Indian", source_title=SOURCE_TITLE, source_url=BASE + "/menu",
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    counts: dict[str, int] = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
