#!/usr/bin/env python3
"""Build data/source/avanti-west-coast/ from the onboard menu PDFs Avanti West Coast publishes (a CALORIES-ONLY chain: one train operator).

    python3 tools/uk_extract/avanti_west_coast.py CACHE_DIR --fetch                       # download the pages and PDFs politely
    python3 tools/uk_extract/avanti_west_coast.py CACHE_DIR --checked-on 2026-11-17 [--out DIR] [--cross-check]

Source (all on https://www.avantiwestcoast.co.uk, robots.txt: `User-agent: * / Disallow: /sitecore / Disallow: /beta`, checked with robots_rfc.py; one
request per 1.1 seconds, a browser User-Agent, 10 PDFs and 3 pages in all):
  * https://www.avantiwestcoast.co.uk/classes-of-travel/first-class/first-class-service lists the First Class menus: "Autumn / Winter menu: From
    14 October 2026 - 1 December 2026" for Weekdays Pendolino trains, Weekdays Evero trains and Weekend, each with a Menu, a Non-Gluten Containing Menus
    and an Allergens (ingredients and allergens) PDF, plus two First Class lounge menus at stations (NOT onboard food: not used).
    Files: /-/media/avanti-pdfs/avanti-menus/aw-menus-2026/{weekdays/pendolino,weekdays/evero,weekend}/winter-fc-menu-*.pdf (PDFs created 19 October
    2026). The ingredients & allergens PDFs head themselves "from 14th October – 16th March 2027"; the page's own dates (to 1 December 2026) are quoted.
  * https://www.avantiwestcoast.co.uk/onboard/onboard-shop links "See the menu": /-/media/avanti-pdfs/avanti-menus/onboard-shop/onboard-shop---menu-nov-2026.pdf
    ("Tuck in!", PDF created 9 October 2026; no date printed). (The page's FAQ still links the older avanti-onboard-shop---menu.pdf: not used.)
Earlier seasons: the First Class summer 2026 menus (1 July - 13 October 2026, "(NNN kcal)" beside each dish) and the May 2026 shop menu were read on
10 Oct 2026 (git history has that reader).
THE FIRST CLASS AUTUMN / WINTER MENUS END ON 1 DECEMBER 2026 by the First Class page: re-read this chain then (re-run with --fetch in a fresh cache folder;
the script warns when the page no longer says "From 14 October 2026 - 1 December 2026").
The pages and PDFs have a text layer; every figure is read by the script. First Class menus (autumn / winter 2026 layout): a grid of dishes, each a bold
(Averta-Semibold) name, its description and an italic "NNN kcal" line, with V / VG marks as text after the figure; the script reads them with
`pdftohtml -xml` (positions and fonts) and ties each figure to the name and description stacked directly above it in the same column. Shop: "NNN Kcal"
before the price (pdftotext -layout). The First Class menus print "Kcal information is per serving or portion"; the shop menu "Adults need around 2000
Kcal a day". Protein, carbs and fat are never printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable).

One operator, so the "2 or more sites" rule does not apply. The rules that do:
  * a calorie RANGE ("Toast with Butter & Preserves 214–315 kcal") is left out;
  * a name printed with different calories on different menus is left out (never chosen): the First Class menus differ by train type (the Evero weekday
    menu has other recipes for the breakfast, bacon roll, porridge and smoked salmon), the non-gluten menus use other ingredients for the same names, and
    the shop and First Class menus print different figures for the Bacon Roll and Hot Chocolate (CLASH lines in the output). A name that contains another
    name of the First Class menus (two words or more) with other calories is left out too;
  * the Breakfast Hash prints "293 kcal VG / 362 kcal V" ("Delicious as it comes, or add a free-range poached egg"): 293 is the hash as it comes; the
    "/ 362 kcal" figure is left out (an add-on figure, as the summer menu's poached egg was);
  * an option printed with its own figure is listed under its own name: "729 kcal. Or cheese and biscuits (470 kcal)." (Grazing Plate);
  * drinks that print no calories (spirits, beer, wine) are not listed; the First Class lounges' menus are not used.
  * a dish whose figure the matching ingredients & allergens PDF contradicts is held back (HOLDBACK -> holdback.csv): the Beef Stew (menus 228 kcal,
    ingredients PDFs updated 16 November 2026: 240 kcal).
Tags: vegetarian where the First Class menu prints V or VG after the figure (on every menu that prints the dish); on the shop menu the dishes carrying a
V or VG icon (SHOP_VEG: the VG and GF marks are text, the V marks are pictures, read by eye from the page image); contains_pork / contains_beef only
where the printed name or description says bacon, ham, sausage / beef, steak.
Allergens: the three "ingredients and allergens" PDFs list each dish's ingredients with the allergens in capitals, but they are not a table of the 14 allergens
(and the shop menu has none), so there is no allergens.csv and no allergen link. They are used for the cross-check: every published First Class food figure
must also be printed as "Per serving N kcal" in the matching ingredients PDF (`--cross-check`; their text layer splits words and figures with stray spaces,
"Pe r s er ving 55 3 kcal", so the check removes every space and looks for "Nkcal").
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
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "avanti-west-coast"
HOST = "www.avantiwestcoast.co.uk"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
SOURCE_URL = f"{BASE}/classes-of-travel/first-class/first-class-service"
SOURCE_TITLE = ("Avanti West Coast onboard menus with calories (First Class autumn / winter 2026 menus for Pendolino weekdays, Evero weekdays and "
                "weekends, from 14 October to 1 December 2026, and the onboard shop menu, November 2026)")
ALIASES = ["avanti west coast", "avanti", "avanti west coast first class", "avanti west coast onboard shop", "west coast main line"]
NOTE = ("Calories only, for onboard food: First Class autumn / winter 2026 menus (Pendolino and Evero weekdays, weekends; 14 October - 1 December 2026) "
        "and the November 2026 onboard shop menu. Protein, carbs, fat and allergens are not published. Dishes printed with different calories on different "
        "menus, and ranges, are left out.")
MIN_ITEMS = 25
PAGES = ["classes-of-travel/first-class/first-class-service", "onboard/onboard-shop", "onboard/food-and-drink"]
MEDIA = "/-/media/avanti-pdfs/avanti-menus/"
FC_MENUS = {  # key: (published path under MEDIA, label, allergens/ingredients PDF that goes with it)
    "pendolino": ("aw-menus-2026/weekdays/pendolino/winter-fc-menu-pendo-evero-weekday.pdf", "First Class weekday menu, Pendolino trains",
                  "aw-menus-2026/weekdays/pendolino/pendolino-weekday-allergens-and-ingredients-october-menu-2026-v2.pdf"),
    "evero": ("aw-menus-2026/weekdays/evero/winter-fc-menu-evero-weekday.pdf", "First Class weekday menu, Evero trains",
              "aw-menus-2026/weekdays/evero/evero-weekday-allergens-and-ingredients-october-menu-2026-v2-.pdf"),
    "weekend": ("aw-menus-2026/weekend/winter-fc-menu-pendo-evero-weekend.pdf", "First Class weekend menu",
                "aw-menus-2026/weekend/pendolino-evero-weekend-allergens-and-ingredients-october-menu-2026.pdf"),
    "ng-pendolino": ("aw-menus-2026/weekdays/pendolino/winter-fc-menu-non-gluten-pendo-evero-weekday.pdf", "First Class non-gluten weekday menu, Pendolino",
                     "aw-menus-2026/weekdays/pendolino/pendolino-weekday-allergens-and-ingredients-october-menu-2026-v2.pdf"),
    "ng-evero": ("aw-menus-2026/weekdays/evero/winter-fc-menu-non-gluten-evero-weekday.pdf", "First Class non-gluten weekday menu, Evero",
                 "aw-menus-2026/weekdays/evero/evero-weekday-allergens-and-ingredients-october-menu-2026-v2-.pdf"),
    "ng-weekend": ("aw-menus-2026/weekend/winter-fc-menu-non-gluten-pendo-evero-weekend.pdf", "First Class non-gluten weekend menu",
                   "aw-menus-2026/weekend/pendolino-evero-weekend-allergens-and-ingredients-october-menu-2026.pdf"),
}
SHOP = ("onboard-shop/onboard-shop---menu-nov-2026.pdf", "Onboard shop menu (Tuck in!, November 2026)")

FCB, FCS, FCL, FCH, FCD = ("First Class breakfast", "First Class snacks & treats", "First Class larger plates", "First Class hot drinks",
                           "First Class soft drinks")
SF, SH = "Onboard shop food", "Onboard shop hot drinks"
CATEGORY_ORDER = [FCB, FCL, FCS, FCH, FCD, SF, SH]
# The side heading of each menu page (printed as a column of letters at the right edge) and the section headings under it -> our category
# (None: a bar section, whose drinks print no calories). A heading not listed here stops the script: the menu changed, re-check.
PAGE_SECTIONS = {"BREAKFAST": {"THECLASSICS": FCB, "BAKERY&FRUIT": FCB},
                 "RESTOFDAY": {"LIGHTSNACKS": FCS, "TREATS": FCS, "LARGERPLATES": FCL},
                 "DRINKS": {"SOMETHINGTOSIP": None, "WINE&SPARKLING": None, "BEER&CIDER": None, "LO&NO": None, "SPIRITS": None, "SOFTDRINKS": FCD, "HOTDRINKS": FCH}}
KCAL_ONE = re.compile(r"^(\d+) kcal$")
KCAL_RANGE = re.compile(r"^(\d+)\s*[–—-]\s*(\d+) kcal$")
KCAL_OR = re.compile(r"^(\d+) kcal\. Or (.+?) \((\d+) kcal\)\.?$")
LINE_GAP = 75  # lines of one dish are 50-55 apart (pdftohtml units); dishes are further apart
# Dishes whose menu figure the chain's own ingredients & allergens PDF contradicts (never chosen between: not published; holdback.csv).
HOLDBACK = {"beef-stew": ("The weekday menus print 228 kcal for the Beef Stew; the matching ingredients & allergens PDFs (Pendolino and Evero, "
                          "updated 16 November 2026) print 'Per serving 240 kcal' for it.")}
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
    if "From 14 October 2026 - 1 December 2026" not in re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fc)):
        print("WARNING: the First Class page no longer says 'From 14 October 2026 - 1 December 2026': new season? re-check the menus and NOTE")


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


def meat_tags(text: str) -> list:
    tags = []
    if PORK_RX.search(text):
        tags.append("contains_pork")
    if BEEF_RX.search(text):
        tags.append("contains_beef")
    return tags


def pdf_elements(path: Path) -> list:
    """Every text run of the PDF, per page, with its position and font (pdftohtml -xml): [[{top, left, right, size, fam, bold, ital, text}]]."""
    x = subprocess.run(["pdftohtml", "-xml", "-i", "-q", "-nodrm", "-stdout", str(path)], capture_output=True, text=True).stdout
    fonts = {m.group(1): (int(m.group(2)), m.group(3).split("+")[-1])
             for m in re.finditer(r'<fontspec id="(\d+)" size="(\d+)" family="([^"]*)"', x)}
    pages = []
    for pg in re.finditer(r'<page number="(\d+)"(.*?)</page>', x, re.S):
        els = []
        for t in re.finditer(r'<text top="(\d+)" left="(\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)</text>', pg.group(2), re.S):
            top, left, w, _h, f, raw = t.groups()
            size, fam = fonts[f]
            txt = " ".join(html.unescape(re.sub(r"<[^>]+>", "", raw)).split())
            if txt:
                els.append(dict(top=int(top), left=int(left), right=int(left) + int(w), size=size, fam=fam, bold="<b>" in raw, ital="<i>" in raw,
                                text=txt))
        pages.append(els)
    if not pages:
        raise SystemExit(f"{path.name}: pdftohtml read nothing")
    return pages


def fc_records(path: Path) -> tuple:
    """([(display name, kcal, category, description, dish it belongs to, marks)], [left-out notes]) for one First Class menu (autumn / winter 2026 layout).
    Each "NNN kcal" (italic) is tied to the lines stacked directly above it in the same column: the dish's description (regular) under its name (bold,
    Averta-Semibold). Anything the script does not recognise stops it."""
    out, notes = [], []
    for pno, els in enumerate(pdf_elements(path), 1):
        side = "".join(e["text"].replace(" ", "") for e in sorted(els, key=lambda e: e["top"]) if e["left"] >= 1500 and e["fam"] == "Averta")
        kcals = [e for e in els if e["ital"] and re.search(r"\bkcal\b", e["text"]) and e["fam"] == "Averta"]
        if side not in PAGE_SECTIONS:
            if kcals:
                raise SystemExit(f"{path.name} p{pno}: calories on a page without a known side heading ({side!r}): the menu changed")
            continue
        heads = sorted((e["top"], e["text"].replace(" ", "")) for e in els if e["bold"] and e["size"] >= 57 and e["fam"] == "Averta" and e["left"] < 1500)
        for _t, h in heads:
            if h not in PAGE_SECTIONS[side]:
                raise SystemExit(f"{path.name} p{pno}: unknown section heading {h!r} under {side}: the menu changed, re-check PAGE_SECTIONS")
        body = [e for e in els if e["fam"].startswith("Averta") and e["size"] >= 39 and e["left"] < 1500]
        for k in kcals:
            if k["text"].startswith("/"):
                continue  # a second figure on the same line, handled with the first
            above = sorted((e for e in body if e["top"] < k["top"] and e["left"] < k["right"] and e["right"] > k["left"]), key=lambda e: -e["top"])
            run, cur = [], k["top"]
            for e in above:
                if cur - e["top"] > LINE_GAP or e["ital"] or e["size"] >= 57:
                    break
                run.append(e)
                cur = e["top"]
            run.reverse()
            n = 0
            while n < len(run) and run[n]["bold"] and run[n]["fam"].endswith("Semibold"):
                n += 1
            names, desc = run[:n], run[n:]
            if not names or any(e["bold"] for e in desc):
                raise SystemExit(f"{path.name} p{pno}: cannot tie {k['text']!r} (top {k['top']}) to a name above it: the layout changed")
            name = " ".join(" ".join(e["text"] for e in names).split())
            desc_text = " ".join(e["text"] for e in desc)
            sec = [h for t, h in heads if t < names[0]["top"]]
            if not sec:
                raise SystemExit(f"{path.name} p{pno}: {name!r} sits above every section heading: the layout changed")
            cat = PAGE_SECTIONS[side][sec[-1]]
            if cat is None:
                raise SystemExit(f"{path.name} p{pno}: {name!r} prints calories in a bar section ({sec[-1]}): re-check")
            row = sorted((e for e in els if abs(e["top"] - k["top"]) <= 12 and e["left"] > k["left"]), key=lambda e: e["left"])
            nxt = next((e["left"] for e in row if e["ital"] and e["text"].strip()), 10 ** 6)
            marks = sorted({e["text"] for e in row if e["left"] < nxt and e["bold"] and e["size"] <= 30 and e["text"] in ("V", "VG")})
            second = [e for e in row if e["ital"] and e["text"].startswith("/")]
            m1, mr, mo = KCAL_ONE.match(k["text"]), KCAL_RANGE.match(k["text"]), KCAL_OR.match(k["text"])
            if mr:
                notes.append(f"{name}: a range ({mr.group(1)} - {mr.group(2)} kcal) is left out")
                continue
            if second:
                if not m1 or len(second) != 1 or not re.fullmatch(r"/ (\d+) kcal", second[0]["text"]):
                    raise SystemExit(f"{path.name} p{pno}: {name!r}: unexpected second figure {[e['text'] for e in second]}")
                notes.append(f"{name}: the second figure '{second[0]['text']}' (with the add-on the description offers) is left out")
            if m1:
                out.append((name, m1.group(1), cat, desc_text, name, marks))
            elif mo:
                out.append((name, mo.group(1), cat, desc_text, name, marks))
                out.append((f"{name}, {mo.group(2)}", mo.group(3), cat, "", name, []))  # an option does not inherit the dish's description
            else:
                raise SystemExit(f"{path.name} p{pno}: {name!r}: unrecognised calorie text {k['text']!r}")
    return out, notes


SHOP_LINE = re.compile(r"^\s*(?P<name>[A-Za-z][A-Za-z&'’.\- ]*?)\*?\s+(?P<k>\d+)\s*Kcal\b(?P<marks>(?:\s+(?:VG|GF|V))*)\s+£", re.I)
SHOP_RENAME: dict = {}  # the November 2026 menu prints "Gluten Free Bacon Roll" itself
# The shop menu marks dishes with round V (vegetarian) / VG (vegan) / GF icons; on the November 2026 menu the VG and GF marks are text but the V marks
# are pictures. The names carrying a V or VG icon (looked at on the page image, 110 dpi); the script stops if the PDF is not the one this was read from.
SHOP_SHA256 = "cdac3d9b493bad1e88e146e738189a49fa9a32512897e78541b2b3e11ef40e46"
SHOP_VEG = {"Cheddar Cheese Ploughman's Sandwich", "Falafel Flatbread", "Free Range Egg & Tomato Sandwich", "Porridge Golden Syrup",
            "Porridge No Added Sugar", "Stone Baked Pizza"}


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
        for name, k, cat, desc, dish, marks in recs:
            c = cands.setdefault((name, k), dict(name=name, kcal=k, cat=cat, menus=set(), desc="", service="fc", marks=[], dish=dish, veg=[]))
            c["menus"].add(label)
            c["desc"] += " " + desc
            c["veg"].append(bool(marks))
    for c in cands.values():
        c["marks"] = ["VG"] if c["veg"] and all(c["veg"]) else []  # V or VG printed on every menu that prints the dish
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
            t = subprocess.run(["pdftotext", "-raw", str(p), "-"], capture_output=True, text=True).stdout
            texts[p] = "".join(t.split())  # the text layer splits words and figures with stray spaces ("55 3 kcal"): drop every space
    bad = 0
    for c in kept:
        if c["service"] != "fc" or c["cat"] in (FCH, FCD) or c["name"] in ("Banana", "Easy Peeler"):
            continue  # the ingredients PDFs cover food only (no drinks, no whole fruit)
        for key, (rel, label, al) in FC_MENUS.items():
            if label in c["menus"]:
                t = texts[pdf_path(cache, al)]
                # the PDFs are two columns, so "Per serving" is sometimes separated from its figure: look for the figure and "kcal"
                if not re.search(r"(?<![\d.])" + c["kcal"] + r"kcal", t, re.I):
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
    ids = {slug(i["name"]) for i in items}
    if not set(HOLDBACK) <= ids:
        raise SystemExit(f"HOLDBACK names dishes that are not on the menus any more: {sorted(set(HOLDBACK) - ids)}: re-check")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Avanti West Coast", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, nutrition_level="calories",
                             holdback=sorted(HOLDBACK.items()))
    counts = collections.Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items ({len(cands) - len(kept)} dishes left out) to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
