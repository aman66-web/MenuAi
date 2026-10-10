#!/usr/bin/env python3
"""Build data/source/avanti-west-coast/ from the onboard menu PDFs Avanti West Coast publishes (a CALORIES-ONLY chain: one train operator).

    python3 tools/uk_extract/avanti_west_coast.py CACHE_DIR --fetch                       # download the pages and PDFs politely
    python3 tools/uk_extract/avanti_west_coast.py CACHE_DIR --checked-on 2026-10-10 [--out DIR] [--cross-check]

Source (all on https://www.avantiwestcoast.co.uk, robots.txt: `User-agent: * / Disallow: /sitecore / Disallow: /beta`, checked with robots_rfc.py; one
request per 1.1 seconds, a browser User-Agent, 10 PDFs and 3 pages in all):
  * https://www.avantiwestcoast.co.uk/classes-of-travel/first-class/first-class-service lists the First Class menus: "Summer menu: From 1 July -
    13 October 2026" for Weekdays Pendolino trains, Weekdays Evero trains and Weekends (Pendolino and Evero 807), each with a Menu, a Non-Gluten
    Containing Menu and an Allergens (ingredients and allergens) PDF, plus two First Class lounge menus at stations (NOT onboard food: not used).
    Files: /-/media/avanti-pdfs/avanti-menus/summer-2026/{weekdays/pendolino,weekdays/evero,weekend}/summer-fc-menu-*-digital-fa.pdf (PDFs created
    30 June 2026).
  * https://www.avantiwestcoast.co.uk/onboard/onboard-shop links "See the menu": /-/media/avanti-pdfs/avanti-menus/onboard-shop/avanti-onboard-shop---menu.pdf
    ("Tuck in!", PDF created 12 May 2026; no date printed).
SHA-256 of the files read on 10 Oct 2026: weekdays Pendolino menu 51849cb3..., weekdays Evero menu a4a6e547..., weekend menu 7fd58ad7..., non-gluten Pendolino
d1ee625e..., non-gluten Evero 4760d8c3..., non-gluten weekend 3478a969..., onboard shop menu 7d73557b... (full digests: every run prints the first 16 characters
of each; SHOP_SHA256 holds the shop's).
THE FIRST CLASS SUMMER MENUS END ON 13 OCTOBER 2026 ("Summer menu: From 1 July - 13 October 2026" on the First Class page): the autumn menus will replace them, so this
chain needs re-reading (re-run with --fetch in a fresh cache folder; the script warns when the page no longer says 13 October).
The pages and PDFs have a text layer; every figure is read by the script (pdftotext) from "(NNN kcal)" beside a dish (First Class) or "NNN Kcal" before
the price (shop). Names are as printed. The First Class menus print "Kcal information provided is per serving / portion"; the shop menu "Adults need around
2000 Kcal a day". Protein, carbs and fat are never printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable).

One operator, so the "2 or more sites" rule does not apply. The rules that do:
  * a calorie RANGE ("Toast with Butter and Preserves (214 - 315 kcal)") is left out;
  * a name printed with different calories on different menus is left out (never chosen): the First Class menus differ by train type (the Pendolino
    weekday menu has other recipes for the bacon roll, porridge and smoked salmon), the non-gluten menus use other ingredients for the same names, and
    the shop and First Class menus print different figures for Hot Chocolate and Decaf Coffee (CLASH lines in the output). A name that contains another
    name of the First Class menus (two words or more) with other calories is left out too;
  * "Add a poached egg if you like. (417 kcal)" is left out: the menu does not say whether 417 is the egg or the dish with the egg;
  * options printed with their own figure are listed under their own names: "banana and honey. (401 kcal)" (porridge with banana and honey),
    "Vegetarian option (...)" and "or cheese & crackers (...)" (Ploughman's platter);
  * drinks that print no calories (spirits, beer, wine) are not listed; the First Class lounges' menus are not used.
Tags: none for vegetarian on the First Class menus (they mark dishes with picture icons next to the name that have no text, so the script cannot read them);
on the shop menu the dishes carrying a V or VG icon (SHOP_VEG, read by eye from the page image) get vegetarian;
contains_pork / contains_beef only where the printed name or description says bacon, ham, sausage / beef, steak.
Allergens: the three "ingredients and allergens" PDFs list each dish's ingredients with the allergens in capitals, but they are not a table of the 14 allergens
(and the shop menu has none), so there is no allergens.csv and no allergen link. They are used for the cross-check: every published First Class food figure
must also be printed as "Per serving N kcal" in the matching ingredients PDF (`--cross-check`; the PDFs have two columns, so the check looks for "N kcal").
"""
from __future__ import annotations

import argparse
import collections
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "avanti-west-coast"
HOST = "www.avantiwestcoast.co.uk"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
SOURCE_URL = f"{BASE}/classes-of-travel/first-class/first-class-service"
SOURCE_TITLE = ("Avanti West Coast onboard menus with calories (First Class summer 2026 menus for Pendolino weekdays, Evero weekdays and weekends, "
                "valid 1 July to 13 October 2026, and the onboard shop menu, May 2026)")
ALIASES = ["avanti west coast", "avanti", "avanti west coast first class", "avanti west coast onboard shop", "west coast main line"]
NOTE = ("Calories only, for onboard food: First Class summer 2026 menus (Pendolino and Evero weekdays, weekends; valid 1 July - 13 October 2026) and the "
        "onboard shop menu. Protein, carbs, fat and allergens are not published. Dishes printed with different calories on different menus, and ranges, "
        "are left out.")
MIN_ITEMS = 25
PAGES = ["classes-of-travel/first-class/first-class-service", "onboard/onboard-shop", "onboard/food-and-drink"]
MEDIA = "/-/media/avanti-pdfs/avanti-menus/"
FC_MENUS = {  # key: (published path under MEDIA, label, allergens/ingredients PDF that goes with it)
    "pendolino": ("summer-2026/weekdays/pendolino/summer-fc-menu-pendolino-digital-fa.pdf", "First Class weekday menu, Pendolino trains",
                  "summer-2026/weekdays/pendolino/pendolino-weekday-allergens-and-ingredients-summer-menu-2026.pdf"),
    "evero": ("summer-2026/weekdays/evero/summer-fc-menu-evero-digital-fa.pdf", "First Class weekday menu, Evero trains",
              "summer-2026/weekdays/evero/evero-weekday-allergens-and-ingredients-summer-menu-2026.pdf"),
    "weekend": ("summer-2026/weekend/summer-fc-menu-weekend-digital-fa.pdf", "First Class weekend menu, Pendolino and Evero 807",
                "summer-2026/weekend/pendolino-and-evero-807-weekend-allergens-and-ingredients-summer-menu-2026.pdf"),
    "ng-pendolino": ("summer-2026/weekdays/pendolino/summer-fc-menu-non-gluten-pendolino-digital-fa.pdf", "First Class non-gluten weekday menu, Pendolino",
                     "summer-2026/weekdays/pendolino/pendolino-weekday-allergens-and-ingredients-summer-menu-2026.pdf"),
    "ng-evero": ("summer-2026/weekdays/evero/summer-fc-menu-non-gluten-evero-digital-fa.pdf", "First Class non-gluten weekday menu, Evero",
                 "summer-2026/weekdays/evero/evero-weekday-allergens-and-ingredients-summer-menu-2026.pdf"),
    "ng-weekend": ("summer-2026/weekend/summer-fc-menu-non-gluten-weekend-digital-fa.pdf", "First Class non-gluten weekend menu",
                   "summer-2026/weekend/pendolino-and-evero-807-weekend-allergens-and-ingredients-summer-menu-2026.pdf"),
}
SHOP = ("onboard-shop/avanti-onboard-shop---menu.pdf", "Onboard shop menu (Tuck in!)")

FCB, FCS, FCL, FCH, FCD = ("First Class breakfast", "First Class snacks & treats", "First Class larger plates", "First Class hot drinks",
                           "First Class soft drinks")
SF, SH = "Onboard shop food", "Onboard shop hot drinks"
CATEGORY_ORDER = [FCB, FCL, FCS, FCH, FCD, SF, SH]
HEADINGS = {"Breakfast": "breakfast", "Rest of the day": "rest", "Hot drinks": "hot", "Soft drinks": "soft", "Spirits": "bar", "Beers & Cider": "bar",
            "Sparkling & Wine": "bar", "Something from the bar?": "bar"}
SUB = {"Lighter choices": "snack", "Larger plates": "large", "Snacks & treats": "snack"}
# printed option lines that carry their own figure -> display name relative to the dish above them; and lines left out
VARIANTS = [(re.compile(r"(?:with\s+)?banana and honey\.?$", re.I), "{base} with banana and honey"),
            (re.compile(r"vegetarian option$", re.I), "{base}, vegetarian option"),
            (re.compile(r"cheese & crackers\.?$", re.I), "{base}, cheese & crackers")]
IGNORED = {"Add a poached egg if you like.": "the menu does not say whether 417 kcal is the egg or the whole dish"}

KC = re.compile(r"(?P<name>[^()]*?)\s*\((?P<lo>\d+)(?:\s*[–—-]\s*(?P<hi>\d+))?\s*kcal\)", re.I)
PORK_RX = re.compile(r"\b(pork|bacon|ham|sausages?|salami|pancetta|pepperoni|chorizo|prosciutto|gammon)\b", re.I)
BEEF_RX = re.compile(r"\b(beef|steaks?|ribeye|sirloin|brisket|mince)\b", re.I)


# ----------------------------------------------------------------------------------------------------------------------- fetching
def curl(url: str, out: Path) -> int:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    return int(res.stdout.strip() or 0)


def fetch(cache: Path) -> None:
    (cache / "pages").mkdir(parents=True, exist_ok=True)
    (cache / "pdf").mkdir(exist_ok=True)
    robots = cache / "robots.txt"
    if not robots.exists():
        if curl(f"{BASE}/robots.txt", robots) != 200:
            raise SystemExit(f"cannot read {BASE}/robots.txt: stop (never work round it)")
        time.sleep(1.1)
    rules = robots_rfc.parse(robots.read_text(encoding="utf-8-sig"))
    for path in PAGES:
        out = cache / "pages" / (path.replace("/", "_") + ".html")
        if out.exists() and out.stat().st_size > 5000:
            continue
        if not robots_rfc.allowed(rules, f"/{path}"):
            raise SystemExit(f"robots.txt disallows /{path}: stop")
        if curl(f"{BASE}/{path}", out) != 200:
            out.unlink(missing_ok=True)
            raise SystemExit(f"HTTP error for {BASE}/{path}")
        time.sleep(1.1)
    linked = set()
    for f in (cache / "pages").glob("*.html"):
        linked |= set(re.findall(r"/-/media/avanti-pdfs/avanti-menus/[^\"'<>\\ ]+\.pdf", f.read_text(encoding="utf-8")))
    wanted = [MEDIA + v[0] for v in FC_MENUS.values()] + [MEDIA + v[2] for v in FC_MENUS.values()] + [MEDIA + SHOP[0]]
    for rel in sorted(set(wanted)):
        if rel not in linked:
            raise SystemExit(f"{rel} is no longer linked from the Avanti pages: the menus changed, re-check FC_MENUS")
        out = pdf_path(cache, rel[len(MEDIA):])
        if out.exists() and out.stat().st_size > 500:
            continue
        if not robots_rfc.allowed(rules, rel):
            raise SystemExit(f"robots.txt disallows {rel}: stop")
        code = curl(BASE + rel, out)
        if code != 200 or out.read_bytes()[:5] != b"%PDF-":
            out.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code}, not a PDF: {rel}")
        time.sleep(1.1)
    # the pages must still announce the menus' dates
    fc = (cache / "pages" / "classes-of-travel_first-class_first-class-service.html").read_text(encoding="utf-8")
    if "From 1 July - 13 October 2026" not in re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fc)):
        print("WARNING: the First Class page no longer says 'From 1 July - 13 October 2026': new season? re-check the menus and NOTE")


def pdf_path(cache: Path, rel: str) -> Path:
    return cache / "pdf" / rel.replace("/", "__")


# ----------------------------------------------------------------------------------------------------------------------- reading
def pkey(s: str) -> str:
    s = s.lower().replace("’", "'").replace("&", " and ").replace("*", " ")
    return " ".join(re.sub(r"[^a-z0-9àâçéèêëîïôûùüÿñæœ]+", " ", s).split())


def nkey(s: str) -> str:
    def sing(w: str) -> str:
        if len(w) > 4 and w.endswith("oes"):
            return w[:-2]
        return w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w

    return " ".join(sing(w) for w in pkey(s).split())


def contained(a: str, b: str) -> bool:
    return len(a.split()) >= 2 and len(b.split()) >= 2 and (f" {a} " in f" {b} " or f" {b} " in f" {a} ")


def clean_name(raw: str) -> str:
    return re.sub(r"^[\s,.]*(?:or\s+)?", "", raw.strip(), flags=re.I).strip()


def meat_tags(text: str) -> list:
    tags = []
    if PORK_RX.search(text):
        tags.append("contains_pork")
    if BEEF_RX.search(text):
        tags.append("contains_beef")
    return tags


def fc_records(path: Path) -> tuple:
    """([(display name, kcal, category, description, dish it belongs to)], [left-out notes]) for one First Class menu."""
    txt = subprocess.run(["pdftotext", str(path), "-"], capture_output=True, text=True).stdout
    out, notes = [], []
    section, sub = None, None
    for para in re.split(r"\n\s*\n", txt):
        lines = [l.strip() for l in para.splitlines() if l.strip()]
        titles, desc, base = [], [], None
        for line in lines:
            if line in HEADINGS:
                section, sub = HEADINGS[line], None
                continue
            if line in SUB:
                sub = SUB[line]
                continue
            ms = list(KC.finditer(line))
            if not ms:
                desc.append(line)
                continue
            for m in ms:
                name = clean_name(m.group("name"))
                titles.append((name, m.group("lo"), m.group("hi")))
        if section not in ("breakfast", "rest", "hot", "soft") or not titles:
            continue
        cat = {"breakfast": FCB, "hot": FCH, "soft": FCD}.get(section) or (FCS if sub == "snack" else FCL)
        for name, lo, hi in titles:
            if hi:
                notes.append(f"{name}: a range ({lo} - {hi} kcal) is left out")
                continue
            if name in IGNORED:
                notes.append(f"{name} ({lo} kcal): {IGNORED[name]}")
                continue
            hit = next((fmt for rx, fmt in VARIANTS if rx.search(name)), None)
            if hit:
                if base is None:
                    raise SystemExit(f"{path.name}: option line {name!r} without a dish above it: the menu changed")
                dish = base
                name = hit.format(base=base)
            else:
                base = dish = name
            out.append((name, lo, cat, "" if hit else " ".join(desc), dish))  # an option does not inherit the dish's description (no ham in "cheese & crackers")
    return out, notes


SHOP_LINE = re.compile(r"^\s*(?P<name>[A-Za-z][A-Za-z&'’.\- ]*?)\*?\s+(?P<k>\d+)\s*Kcal\b(?P<marks>(?:\s+(?:VG|GF|V))*)\s+£", re.I)
SHOP_RENAME = {("Bacon Roll", "315"): "Bacon Roll (gluten free)"}
# The shop menu marks dishes with round V (vegetarian) / VG (vegan) / GF icons that are pictures, not text. The names carrying a V or VG icon on the
# 12 May 2026 menu (looked at on the page image, 150 dpi); the script stops if the PDF is not the one this was read from.
SHOP_SHA256 = "7d73557ba1768c5f59242c94251fcbf0f4b37f8e033553ecfb7a07dd457d2ac6"
SHOP_VEG = {"Porridge Golden Syrup", "Porridge No Added Sugar", "Falafel Flatbread", "Free Range Egg & Tomato Sandwich",
            "Cheddar Cheese Ploughman's Sandwich", "Coffee Syrups"}


def shop_records(path: Path) -> list:
    txt = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True).stdout
    out, cat = [], SF
    for line in txt.splitlines():
        if re.match(r"^\s*Hot Drinks\b", line):
            cat = SH
        m = SHOP_LINE.match(line)
        if m:
            name, k = m.group("name").strip(), m.group("k")
            marks = m.group("marks").split()
            out.append((SHOP_RENAME.get((name, k), name), k, cat, marks))
    return out


# ----------------------------------------------------------------------------------------------------------------------- build
def build(cache: Path) -> tuple:
    cands, notes = {}, []
    for key, (rel, label, _al) in FC_MENUS.items():
        path = pdf_path(cache, rel)
        if not path.exists():
            raise SystemExit(f"{path} missing: run --fetch")
        recs, nts = fc_records(path)
        notes += [f"{label}: {n}" for n in nts]
        for name, k, cat, desc, dish in recs:
            c = cands.setdefault((name, k), dict(name=name, kcal=k, cat=cat, menus=set(), desc="", service="fc", marks=[], dish=dish))
            c["menus"].add(label)
            c["desc"] += " " + desc
    spath = pdf_path(cache, SHOP[0])
    if not spath.exists():
        raise SystemExit(f"{spath} missing: run --fetch")
    if sha256_file(spath) != SHOP_SHA256:
        raise SystemExit("The onboard shop menu is not the file the SHOP_VEG marks were read from (SHA-256 differs): re-read its V / VG icons and update "
                         "SHOP_VEG and SHOP_SHA256")
    names = {n for n, _k, _c, _m in shop_records(spath)}
    if not SHOP_VEG <= names:
        raise SystemExit(f"SHOP_VEG names not on the shop menu any more: {sorted(SHOP_VEG - names)}")
    for name, k, cat, marks in shop_records(spath):
        c = cands.setdefault((name, k), dict(name=name, kcal=k, cat=cat, menus=set(), desc="", service="shop", marks=[], dish=name))
        c["menus"].add(SHOP[1])
        c["marks"] = ["VG"] if name in SHOP_VEG else []
    return list(cands.values()), notes


def apply_rules(cands: list) -> tuple:
    """Left out: a name printed with other calories on another menu (exact name anywhere; containing names within the First Class menus)."""
    dropped: dict = {}
    for a in cands:
        for b in cands:
            if a is b or a["kcal"] == b["kcal"]:
                continue
            ka, kb = nkey(a["name"]), nkey(b["name"])
            # an option of a dish ("Ploughman's Platter, cheese & crackers") is not a clash with the dish itself
            same = ka == kb or (a["service"] == b["service"] == "fc" and a["dish"] != b["dish"] and contained(ka, kb))
            if same:
                dropped.setdefault(id(a), (a, []))[1].append(f"{b['name']} {b['kcal']} kcal ({'; '.join(sorted(b['menus']))})")
    kept = [c for c in cands if id(c) not in dropped]
    return kept, [(a["name"], a["kcal"], why) for a, why in dropped.values()]


def cross_check(cache: Path, kept: list) -> None:
    """Every published First Class figure must also be printed as 'Per serving N kcal' in the matching ingredients & allergens PDF."""
    texts = {}
    for key, (rel, label, al) in FC_MENUS.items():
        p = pdf_path(cache, al)
        if p not in texts:
            t = subprocess.run(["pdftotext", str(p), "-"], capture_output=True, text=True).stdout
            texts[p] = " ".join(t.split())
    bad = 0
    for c in kept:
        if c["service"] != "fc" or c["cat"] in (FCH, FCD) or c["name"] == "Banana":
            continue  # the ingredients PDFs cover food only (no drinks, no whole fruit)
        for key, (rel, label, al) in FC_MENUS.items():
            if label in c["menus"]:
                t = texts[pdf_path(cache, al)]
                # the PDFs are two columns, so "Per serving" is sometimes separated from its figure: look for the figure and "kcal"
                if not re.search(r"(?<![\d.])" + c["kcal"] + r"\s*kcal|Per serving\s*" + c["kcal"] + r"\b", t):
                    bad += 1
                    print(f"CROSS-CHECK {c['name']} {c['kcal']} kcal ({label}): no '{c['kcal']} kcal' in {al.rsplit('/', 1)[-1]}")
    print(f"cross-check against the ingredients & allergens PDFs: {bad} figures not found")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path, help="folder for the downloaded pages and PDFs")
    ap.add_argument("--fetch", action="store_true", help="download the pages and PDFs first (skips what is already there)")
    ap.add_argument("--checked-on", help="the day the PDFs were read, YYYY-MM-DD")
    ap.add_argument("--cross-check", action="store_true", help="compare each First Class figure with the ingredients & allergens PDF")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
        if not args.checked_on:
            return 0
    if not args.checked_on:
        ap.error("--checked-on is required")
    for key, (rel, label, al) in FC_MENUS.items():
        print(f"sha256 {sha256_file(pdf_path(args.cache, rel))[:16]}  {label}")
    print(f"sha256 {sha256_file(pdf_path(args.cache, SHOP[0]))[:16]}  {SHOP[1]}")
    cands, notes = build(args.cache)
    for n in sorted(set(notes)):
        print("LEFT OUT " + n)
    kept, dropped = apply_rules(cands)
    for name, kcal, why in dropped:
        print(f"CLASH left out: {name} {kcal} kcal; also printed as {'; '.join(why)}")
    if args.cross_check:
        cross_check(args.cache, kept)
    if len(kept) < MIN_ITEMS:
        raise SystemExit(f"only {len(kept)} dishes pass (minimum {MIN_ITEMS}): do not publish")
    kept.sort(key=lambda c: CATEGORY_ORDER.index(c["cat"]))
    names = [c["name"] for c in kept]
    if len(set(names)) != len(names):
        dup = [n for n, k in collections.Counter(names).items() if k > 1]
        raise SystemExit(f"item names are not unique: {dup}")
    items = []
    for c in kept:
        if "VG" in c["marks"]:
            tags = ["vegetarian"]
        else:
            tags = meat_tags(c["name"] + " " + c["desc"])
        items.append(dict(name=c["name"], category=c["cat"], calories=c["kcal"], tags="|".join(tags), rankable=False,
                          notes=f"printed {c['kcal']} kcal on: {', '.join(sorted(c['menus']))}"))
    assert len(NOTE) < 400
    out = write_chain_folder(chain_id=CHAIN_ID, name="Avanti West Coast", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories")
    counts = collections.Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items ({len(cands) - len(kept)} dishes left out) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
