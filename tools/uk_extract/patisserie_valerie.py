#!/usr/bin/env python3
"""Build data/source/patisserie-valerie/ from Patisserie Valerie's five official allergen PDFs (a CALORIES-ONLY chain).

    python3 tools/uk_extract/patisserie_valerie.py --pdfs DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

DIR holds Standard.pdf, Counter.pdf, Kiosk.pdf, Drinks.pdf and Valerie.pdf; --fetch reads the page's own links and downloads the five PDFs (one request each, 1.2 s apart).
Source (the page the chain itself publishes them on, visible links under "Nutritional and allergen information for all our instore
products is available to download below:"): https://patisserie-valerie.co.uk/pages/nutritional-and-allergen-information  (robots.txt allows it)
    Standard Menu  PV_ALLERGENS_Autumn_26_-_Standard_Menu.pdf  3 pages  created 2026-09-29
    Counter Menu   PV_ALLERGENS_Autumn_26_-_Counter_Menu.pdf   3 pages  created 2026-09-29
    Kiosk          PV_ALLERGENS_Autumn_26_-_Kiosk_Menu.pdf     1 page   created 2026-09-29
    Drinks         PV_ALLERGENS_Autumn_26_-_Drinks_Menu.pdf    4 pages  created 2026-09-29
    Valerie Menu   PV_ALLERGENS_Autumn_26_-_Valerie_Menu.pdf   1 page   created 2026-09-29
    all under https://cdn.shopify.com/s/files/1/0272/5848/6851/files/ (the ?v= part of the links is only a cache tag).
Needs `pdftotext` (poppler). The grid is read by position: see patisserie_valerie_pdf.py.

What the guide prints: an allergen grid whose only nutrition column is "Kcal" (one figure per product; no protein, carbs, fat, sat fat,
salt, sugar, fibre, kJ or weight). So this is a calories-only chain (docs/DATA.md): protein, carbs and fat stay blank and every item is
not rankable. Calories are copied exactly as printed. The Kcal cell is read as follows:
  "198"                  the figure for the product as listed (no basis printed)
  "198 per 1 whole" / "628 per portion" / "343 per serving"   the figure with the basis the chain prints (serving "1 whole" / "1 portion" /
                         "1 serving")
  "198 X 1", "1 x 116"   one piece at that figure (the "1 x" is the quantity): no serving text added, the printed form goes in notes
  "1 x 207 (half 104)"   207 for one; the half-portion figure is not published
Not published (excluded, listed in the run output): rows whose Kcal cell is blank or says "see menu" / "pg9" / "Pepsi 141", and rows whose
Kcal cell is one merged cell across several rows ("38" across the four vegan top-tier fruit rows, "534 per person" across the three
children's sandwiches): there is no figure for that row alone.

Held back (holdback.csv, never corrected): a product printed with different figures in the guide (the same name, or the same Nutritics
code, with different Kcal in different places or menus), and four rows whose figure looks wrong or unclear against its own siblings in the guide (MANUAL_HOLDBACK).

Allergens (docs/DATA.md "Allergens", all or nothing, added 2026-10-08): copied from the same rows by patisserie_valerie_allergens.py. Each
row's 21 grid cells are read three ways that must agree (the text mark, the cell's fill colour from the vector drawing, and the column the mark
sits in by its header word); a Y cell is "contains", an MC cell is "may contain", and the allergens named in the row's free-text "May contain"
cell (tied to its row by the table's own borders, so cells merged across rows and wrapped lines are read whole) are "may contain" too: the grid
and that column disagree on many rows (of 497 readable rows, 186 name allergens the grid does not mark MC, 19 have an MC the text does not name), so both are
published and nothing is dropped or reconciled. Every published dish needs ONE readable row, identical wherever the guide prints the dish and
for every dish sharing its Nutritics code; otherwise the dish is held back (never chosen between): blank cells (the Valerie menu leaves Lupin
and Molluscs blank, Eggs Benedict leaves Peanuts blank, Pain Au Raisin leaves Milk blank), a mark whose text and fill colour disagree (18 cells),
or two printed rows for one recipe that disagree (Egg & Cress sandwiches, code AUAT001).
Also printed but not a product: Kiosk menu "Rasberry Croissant" (a name with no figures and no marks).
"""
from __future__ import annotations
import argparse
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import patisserie_valerie_allergens as alg_reader  # noqa: E402
import patisserie_valerie_pdf as pdf_reader  # noqa: E402
from common import ROOT, sha256_file, slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "patisserie-valerie"
PAGE_URL = "https://patisserie-valerie.co.uk/pages/nutritional-and-allergen-information"
# file stem -> (menu name as the page links it, rows the reader must find)
PDFS = {"Standard": ("Standard Menu", 188), "Counter": ("Counter Menu", 117), "Kiosk": ("Kiosk", 56), "Valerie": ("Valerie Menu", 19),
        "Drinks": ("Drinks", 146)}
SOURCE_TITLE = ("Patisserie Valerie Nutritional and Allergen Information, Autumn 2026 (five PDFs: Standard, Counter, Kiosk, Drinks and "
                "Valerie menus, created 29 September 2026)")
GUIDE_TITLE = "Patisserie Valerie Nutritional and Allergen Information, Autumn 2026 (five allergen PDFs, created 29 September 2026)"
ALIASES = ["patisserie valerie", "patisserie valerie cafe", "patisserie valerie café", "valerie"]
# The five PDFs print "May contain" marks (MC) and text, so traces information is published (both are used: see the module docstring).
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Calories only: the chain's Autumn 2026 allergen guide prints one Kcal figure per product and no other nutrients or sizes. "
        "Allergens are its grid plus its 'May contain' column, shown together (they don't always agree). "
        "Dishes printed with different figures, or with blank or conflicting allergen cells, are left out. Alcoholic and 'see menu' drinks have no figure.")

# printed section heading (lower-case) -> category shown. A heading matches when it is exactly one of EXACT, else when it starts with
# one of PREFIXES (first match wins). Headings are taken from the PDFs as printed (some are cut short by the chain's own layout).
EXACT = {
    "brunch": "Brunch", "main dishes": "Main dishes", "little valerie menu": "Little Valerie menu", "deluxe macarons": "Deluxe macarons",
    "macarons": "Macarons", "patisserie slices": "Patisserie slices", "tarts": "Tarts", "éclair": "Éclairs",
    "celebration cakes": "Celebration cakes", "other": "Other patisserie",
    "boards & plates": "Boards & plates", "pies": "Pies", "salads": "Salads", "burgers": "Burgers", "from the oven": "From the oven",
    "sides & nibbles": "Sides & nibbles",
    "seasonal drinks": "Seasonal drinks", "matcha": "Matcha", "frappes": "Frappes", "milkshakes": "Milkshakes",
    "iced coffees": "Iced coffees", "coolers": "Coolers", "tea": "Tea", "soft drinks": "Soft drinks", "alcoholic drinks": "Alcoholic drinks",
}
PREFIXES = [
    ("madame valeries vegetarian afternoon tea", "Vegetarian afternoon tea for two"),
    ("madame valeries vegan afternoon tea", "Vegan afternoon tea for two"),
    ("madame valeries afternoon tea", "Afternoon tea for two"),
    ("macarons - various flavours used", "Afternoon tea for two"),
    ("childrens afternoon tea", "Children's afternoon tea"),
    ("macarons - patisserie valerie brand", "Macarons"),
    ("the below drinks can be purchased with alternative milk options", "Drinks with alternative milk options"),
]
LIMITED_TIME = {"Seasonal drinks"}  # the guide's own heading is "SEASONAL DRINKS"
TYPOS = {"Sizzing": "Sizzling", "Scrambed": "Scrambled", "Casear": "Caesar", "Meditteranean": "Mediterranean", "chciken": "chicken",
         "Stawberries": "Strawberries", "Bluberries": "Blueberries"}
PORK = re.compile(r"\b(pork|bacon|ham|gammon|pepperoni|sausages?|salami|chorizo|pancetta|prosciutto)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?|brisket|sirloin)\b", re.I)
NAMED_MEAT = re.compile(r"\b(chicken|turkey|duck|lamb|venison|salmon|fish|tuna|prawns?|crab|beef|steaks?|pork|ham|bacon|sausages?|chorizo)\b", re.I)
SIZE_WORDS = re.compile(r"\b(large|medium|small|regular|reg)\b", re.I)

# Rows judged against their own siblings in the guide (name, kcal) -> reason. The script stops if one of these rows is not found.
MANUAL_HOLDBACK = {
    ("Vanilla Matcha Iced Latte - Medium - Almond", 963):
        "963 kcal for an iced almond latte sits beside 184, 132, 130, 155 and 147 for the same drink with other milks (and 96 for the hot "
        "almond version): looks like a typo in the guide. Not published, not corrected.",
    ("Full Valerie Veggie", 812):
        "The guide prints 812 kcal for Full Valerie Veggie but only 640 for 'Full Valerie veggie - Large' (a different code, SP031, with "
        "different allergen marks): a Large smaller than the regular. Neither is published until the chain says which is right.",
    ("Full Valerie veggie - Large", 640):
        "Large (640 kcal) is smaller than the regular Full Valerie Veggie (812 kcal) printed above it. Not published, not corrected.",
    ("Upgrade to Croque Madam + Egg 56cal", 1076):
        "The name prints '56cal' (the egg) while the Kcal column prints 1076 (Croque Monsieur 1020 + 56): the basis of the row is unclear. "
        "Not published.",
}


def category_of(section: str) -> str:
    s = " ".join(section.lower().split())
    if s in EXACT:
        return EXACT[s]
    for prefix, cat in PREFIXES:
        if s.startswith(prefix):
            return cat
    raise SystemExit(f"Unknown section heading {section!r}: add it to EXACT / PREFIXES after reading the new guide.")


def tidy(name: str) -> tuple[str, str]:
    """-> (shown name, printed name when different). Only whitespace, the chain's NEW markers and obvious typos are touched."""
    n = " ".join(name.split())
    n = re.sub(r"\s*-\s*new$", "", n, flags=re.I)
    n = re.sub(r"\s+new$", "", n)
    n = re.sub(r"(\d) \"", r'\1"', n)
    n = re.sub(r"\(\s+", "(", n)
    n = re.sub(r"\s+\)", ")", n)
    n = re.sub(r"(\w)- ", r"\1 - ", n)
    for wrong, right in TYPOS.items():
        n = re.sub(r"\b%s\b" % re.escape(wrong), right, n)
    return n, ("" if n == " ".join(name.split()) else " ".join(name.split()))


def read_kcal(text: str) -> tuple[int, str, str] | None:
    """Printed Kcal cell -> (value, serving, note), or None when the cell carries no figure for the row."""
    t = text.strip()
    m = re.fullmatch(r"(\d+)", t)
    if m:
        return int(m.group(1)), "", ""
    m = re.fullmatch(r"(\d+) per 1 whole", t)
    if m:
        return int(m.group(1)), "1 whole", ""
    m = re.fullmatch(r"(\d+) [Pp]er (portion|serving)", t)
    if m:
        return int(m.group(1)), "1 " + m.group(2), ""
    m = re.fullmatch(r"(\d+) X 1", t) or re.fullmatch(r"1 x (\d+)", t)
    if m:
        return int(m.group(1)), "", f"Kcal printed as '{t}' (one piece)"
    m = re.fullmatch(r"1 x (\d+) \(half (\d+)\)", t)
    if m:
        return int(m.group(1)), "", f"Kcal printed as '{t}': 207 is for one, the half-portion figure ({m.group(2)}) is not published"
    return None


def unreadable_reason(row: dict, category: str) -> str:
    """Why a row has no usable figure; raises when it is a kind of row this script has not been checked against."""
    k, name = row["kcal"].strip(), row["name"]
    merged = {("Vegan afternoon tea for two", "Strawberries"), ("Vegan afternoon tea for two", "Bluberries"),
              ("Vegan afternoon tea for two", "Raspberries"), ("Vegan afternoon tea for two", "Blackberries"),
              ("Children's afternoon tea", "Ham & Butter Finger Sandwich"),
              ("Children's afternoon tea", "Cucumber & Cream Cheese Finger Sandwich"), ("Children's afternoon tea", "Egg Mayo Sandwich")}
    if (category, name) in merged and k in ("", "534 per person"):
        return "its Kcal cell is one merged cell across several rows (38 across the four fruit rows, 534 per person across the three children's sandwiches)"
    if category == "Alcoholic drinks" and k == "":
        return "alcoholic drinks print no Kcal"
    if k == "see menu" and category == "Drinks with alternative milk options":
        return "the Kcal cell says 'see menu'"
    if (name, k) == ("Iced Americano", "pg9"):
        return "the Kcal cell says 'pg9', not a figure"
    if (name, k) == ("Pepsi Max, Diet Pepsi, Pepsi", "Pepsi 141"):
        return "one row names three drinks and prints 'Pepsi 141'"
    raise SystemExit(f"{row['file']} p{row['page']}: {name!r} has the Kcal cell {k!r}, which this script has not been checked against: read the guide.")


UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def pdf_links(page_html: str) -> dict:
    """The page's own links -> {file stem: url}. Stops if the page no longer links exactly the five expected PDFs."""
    found: dict = {}
    for url in re.findall(r'href="(https://cdn\.shopify\.com/[^"]+\.pdf[^"]*)"', page_html):
        m = re.search(r"_(Standard|Counter|Kiosk|Drinks|Valerie)_Menu\.pdf", url)
        if not m or m.group(1) in found:
            raise SystemExit(f"The page links an unexpected PDF: {url}. Re-check PDFS and the page before running again.")
        found[m.group(1)] = url.replace("&amp;", "&")
    if set(found) != set(PDFS):
        raise SystemExit(f"The page links {sorted(found)} but this script expects {sorted(PDFS)}: the guide changed.")
    return found


def _get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        return r.read()


def fetch(pdfs: Path) -> None:
    """One request for the page, then one per PDF, 1.2 s apart (robots.txt allows /pages/ and the CDN files)."""
    pdfs.mkdir(parents=True, exist_ok=True)
    links = pdf_links(_get(PAGE_URL).decode("utf-8"))
    for stem, url in links.items():
        time.sleep(1.2)
        (pdfs / f"{stem}.pdf").write_bytes(_get(url))


def norm_name(name: str) -> str:
    n = name.lower().strip()
    n = re.sub(r"^(sweets|add|extras)\s*-\s*", "", n)
    n = re.sub(r"^add\s+", "", n)
    return re.sub(r"[^a-z0-9]+", " ", n).strip()


def build(pdfs: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    occurrences: list[dict] = []
    excluded: list[tuple[str, str, str]] = []
    for stem, (menu, expected) in PDFS.items():
        rows, _loose = pdf_reader.read_rows(pdfs / f"{stem}.pdf")
        arows = alg_reader.read_allergen_rows(pdfs / f"{stem}.pdf")
        if len(arows) != len(rows) or any((a["page"], round(a["y"], 2), a["name"]) != (r["page"], round(r["y"], 2), r["name"]) for a, r in zip(arows, rows)):
            raise SystemExit(f"{stem}.pdf: the allergen rows do not line up with the product rows.")
        if len(rows) != expected:
            raise SystemExit(f"{stem}.pdf has {len(rows)} product rows but this script expects {expected}: the guide changed, re-check "
                             "CATEGORIES, the exclusions and MANUAL_HOLDBACK before running again.")
        for r, ar in zip(rows, arows):
            cat = category_of(r["section"])
            shown, printed = tidy(r["name"])
            read = read_kcal(r["kcal"])
            if read is None:
                excluded.append((menu, shown, unreadable_reason(dict(r, name=r["name"]), cat)))
                continue
            first = [m for x, m in r["marks"] if abs(x - r["col0"]) < 6]
            if first[:1] not in (["Y"], ["N"]):
                raise SystemExit(f"{stem}.pdf p{r['page']}: no Suitable-for-Vegetarians mark on {r['name']!r}")
            occurrences.append({"menu": menu, "stem": stem, "page": r["page"], "section": r["section"], "cat": cat, "name": shown, "printed": printed,
                                "code": " ".join(r["code"].split()), "value": read[0], "serving": read[1], "note": read[2], "veg": first[0],
                                "alg": alg_reader.record(ar)})
    # one item per (name, figure): the same line printed in several menus is one item
    items: list[dict] = []
    by_key: dict[tuple[str, int], dict] = {}
    seen_ids: dict[str, int] = {}
    for o in occurrences:
        key = (o["name"], o["value"])
        if key in by_key:
            it = by_key[key]
            where = f"{o['menu']} p{o['page']}"
            if where not in it["_menus"]:
                it["_menus"].append(where)
            it["_veg"].add(o["veg"])
            it["_alg"].append((where, o["alg"]))
            continue
        base = slug(o["name"])
        n = seen_ids.get(base, 0)
        seen_ids[base] = n + 1
        serving = o["serving"]
        if not serving:
            if re.search(r"\bMedium\b", o["name"]):
                serving = "Medium"
            elif re.search(r"- REG -", o["name"]):
                serving = "Regular"
        it = {"id": base if n == 0 else f"{base}-{n + 1}", "name": o["name"], "category": o["cat"], "serving": serving, "calories": o["value"],
              "limited_time": o["cat"] in LIMITED_TIME, "rankable": False, "_menus": [f"{o['menu']} p{o['page']}"], "_veg": {o["veg"]},
              "_code": o["code"], "_alg": [(f"{o['menu']} p{o['page']}", o["alg"])], "_notes": [x for x in (o["note"], f"printed name: {o['printed']}" if o["printed"] else "") if x],
              "_section": o["section"]}
        by_key[key] = it
        items.append(it)
    # hold back products the guide itself contradicts
    holdback: dict[str, str] = {}
    groups: dict[str, list[dict]] = {}
    for it in items:
        groups.setdefault(norm_name(it["name"]), []).append(it)
    def where(i: dict) -> str:
        return ", ".join(i["_menus"]) + (f", code {i['_code']}" if i["_code"] else "")

    for grp in groups.values():
        if len({i["calories"] for i in grp}) > 1:
            for i in grp:
                others = "; ".join(f"{o['calories']} ({where(o)})" for o in grp if o is not i)
                holdback[i["id"]] = (f"The guide prints {i['name']!r} with different calories in different places: {i['calories']} here "
                                     f"({where(i)}), but also {others}. Not published.")
    by_code: dict[str, list[dict]] = {}
    for it in items:
        if it["_code"] and it["id"] not in holdback:
            by_code.setdefault(it["_code"], []).append(it)
    for code, grp in by_code.items():
        if len({i["calories"] for i in grp}) < 2:
            continue
        if len({norm_name(SIZE_WORDS.sub("", i["name"])) for i in grp}) == 1:
            continue  # named size variants of one recipe (Full Valerie Breakfast / - Large): the guide itself says they differ
        for i in grp:
            others = "; ".join(f"{o['name']} {o['calories']} ({where(o)})" for o in grp if o is not i)
            holdback[i["id"]] = (f"The guide prints Nutritics code {code} with different calories: {i['name']} {i['calories']} here "
                                 f"({where(i)}), but also {others}. Not published.")
    for (name, value), reason in MANUAL_HOLDBACK.items():
        hit = by_key.get((name, value))
        if hit is None:
            raise SystemExit(f"MANUAL_HOLDBACK row {name!r} ({value}) is no longer in the guide: re-check the list.")
        holdback.setdefault(hit["id"], reason)
    # allergens (docs/DATA.md "Allergens", all or nothing): every published dish needs ONE readable row copied from the guide, identical
    # wherever the guide prints the dish. A dish whose row cannot be read with certainty, or whose rows differ between menus, is held back.
    def alg_key(rec: dict) -> tuple:
        return (frozenset(rec["contains"]), frozenset(rec["may_contain"]), frozenset(rec["cereals"]))

    def describe(rec: dict) -> str:
        may = rec["may_contain"] - rec["contains"]
        return ("contains " + (", ".join(sorted(rec["contains"])) or "none of the 14")) + "; may contain " + (", ".join(sorted(may)) or "none")

    alg_held: dict[str, str] = {}
    for it in items:
        if it["id"] in holdback:
            continue
        recs = it["_alg"]
        unreadable = [(w, r) for w, r in recs if r["why"]]
        if unreadable:
            alg_held[it["id"]] = ("The guide's allergen row for this dish cannot be read with certainty ("
                                  + "; ".join(f"{r['why']}, {w}" for w, r in unreadable) + "). Not published.")
        elif len({alg_key(r) for _, r in recs}) > 1:
            alg_held[it["id"]] = ("The guide prints this dish with different allergen rows in different menus ("
                                  + "; ".join(f"{w}: {describe(r)}" for w, r in recs) + "). Not published.")
        else:
            rec = recs[0][1]
            it["allergens"] = {"contains": rec["contains"], "may_contain": rec["may_contain"], "cereals": rec["cereals"]}
    # the same Nutritics code is the same recipe: two published dishes sharing a code must carry the same allergen row, else neither is shown
    by_alg_code: dict[str, list] = {}
    for it in items:
        if it["id"] not in holdback and it["id"] not in alg_held and it["_code"]:
            by_alg_code.setdefault(it["_code"], []).append(it)
    for code, grp in by_alg_code.items():
        if len({alg_key(i["allergens"]) for i in grp}) > 1:
            for i in grp:
                alg_held[i["id"]] = (f"The guide prints Nutritics code {code} (one recipe) for {' and '.join(repr(g['name']) for g in grp)} "
                                     "with different allergen rows (" + "; ".join(f"{g['name']}: {describe(g['allergens'])}" for g in grp)
                                     + "), so neither row can be trusted. Not published.")
    for hid, why in alg_held.items():
        holdback[hid] = why
    # tags from the chain's own marks and words
    for it in items:
        tags = []
        if it["_veg"] == {"Y"}:
            tags.append("vegetarian")
        elif len(it["_veg"]) > 1:
            it["_notes"].append("the menus disagree on Suitable for Vegetarians: no tag")
        if PORK.search(it["name"]):
            tags.append("contains_pork")
        if BEEF.search(it["name"]):
            tags.append("contains_beef")
        if "vegetarian" in tags and (PORK.search(it["name"]) or BEEF.search(it["name"]) or NAMED_MEAT.search(it["name"])):
            raise SystemExit(f"{it['name']!r} is marked vegetarian but its name names a meat: check the guide.")
        it["tags"] = "|".join(tags)
        it["notes"] = "; ".join(it["_notes"] + [f"printed in: {', '.join(it['_menus'])}", f"section: {it['_section']}"] + ([f"Nutritics code {it['_code']}"] if it["_code"] else []))
    published = [i for i in items if i["id"] not in holdback]
    assert all(isinstance(i.get("allergens"), dict) for i in published), "every published item must have an allergen row"
    report.append(f"allergens: {len(published)} published items each have one readable row (identical in every menu that prints the dish); "
                  f"{len(alg_held)} dishes held back for their allergen rows")
    report.append(f"rows read: {sum(n for _, n in PDFS.values())}; excluded (no usable figure): {len(excluded)}; unique products with a figure: {len(items)}; "
                  f"held back: {len(holdback)}; published: {len(published)}")
    reasons: dict[str, list[str]] = {}
    for menu, name, why in excluded:
        reasons.setdefault(why, []).append(f"{menu}: {name}")
    for why, names in reasons.items():
        report.append(f"excluded ({len(names)}), {why}: " + "; ".join(names))
    not_stated = [i["name"] for i in published if "vegetarian" not in i["tags"] and not i["tags"] and not NAMED_MEAT.search(i["name"])]
    report.append(f"meat type not stated ({len(not_stated)} published items the guide does not mark vegetarian, whose name names no meat or fish): "
                  + "; ".join(not_stated))
    for hid, why in holdback.items():
        report.append(f"held back {hid}: {why}")
    out_items = []
    for i in items:
        out_items.append({k: v for k, v in i.items() if not k.startswith("_")})
    return out_items, sorted(holdback.items(), key=lambda kv: [x["id"] for x in out_items].index(kv[0])), report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdfs", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="the day the PDFs were downloaded and read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the five PDFs into --pdfs first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.pdfs)
    for stem in PDFS:
        print(f"{stem}.pdf sha256 {sha256_file(args.pdfs / (stem + '.pdf'))}")
    items, holdback, report = build(args.pdfs)
    guide = {"title": GUIDE_TITLE, "url": PAGE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Patisserie Valerie", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=PAGE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide, nutrition_level="calories")
    # allergens.csv holds the published dishes only (held-back dishes carry no row: their rows are unreadable or disagree)
    held = {hid for hid, _ in holdback}
    write_allergens(out, CHAIN_ID, [(i["id"], i["allergens"]) for i in items if i["id"] not in held], guide)
    print("\n".join(report))
    cats: dict[str, int] = {}
    for it in items:
        cats[it["category"]] = cats.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
