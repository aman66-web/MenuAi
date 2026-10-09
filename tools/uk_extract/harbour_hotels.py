#!/usr/bin/env python3
"""Build data/source/harbour-hotels/ from the menu PDFs Harbour Hotels links on its hotels' restaurant pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/harbour_hotels.py CACHE_DIR --fetch                          # download the pages and PDFs politely
    python3 tools/uk_extract/harbour_hotels.py CACHE_DIR --checked-on 2026-10-09 [--out DIR] [--candidates]

Source: each hotel's restaurant page, e.g. https://www.harbourhotels.co.uk/our-hotels/cornwall/harbour-hotel-padstow/the-jetty, links its menus as PDFs
under https://www.harbourhotels.co.uk/media/<id>/<file>.pdf (a la carte, breakfast, light bites, desserts, children's, Sunday, set lunch, afternoon tea,
drinks, wine, Christmas ...). 15 properties, 21 restaurant/bar pages (PAGES below). robots.txt (checked with robots_rfc.py) is `User-agent: *` with no
rules. This script downloads the food menus (not wine, drinks, Christmas/New Year, private dining) once each, one request per 1.1 seconds.
Needs `pdftotext` and `pdfinfo` (poppler); the reader is harbour_hotels_pdf.py.

Nutrition: every dish prints calories only, "NNN kcal" at the end of its description: protein, carbs and fat are never printed, so they stay blank
(docs/DATA.md "Calories-only chains"; every item is then not rankable). Calories are copied from the PDFs by the reader; the display names,
categories and which dishes to publish are written by hand in DISHES below.

Menus differ by hotel (each hotel has its own restaurants and seasons), so a dish is published only when ALL of these hold (the script checks them,
never by hand):
  1. it is printed with the same name AND description (the dish's whole printed text, case and punctuation ignored, dietary marks V/VG/VGA and the
     price ignored) and the same calories at 2 or more DIFFERENT hotels (two menus of one hotel count once);
  2. every record of that text in any file prints the same calories;
  3. no other record anywhere prints the same dish NAME (the words before the first comma of a one-line dish, or the heading line) with other
     calories: a name printed with two values anywhere is left out (Mixed House Salad 136 at 6 hotels and 148 at Guildford; Twice Baked Cheese Soufflé
     516 at 8 menus and 747 at the Beach Club; Fish & Chips 844 / 825; Mac & Cheese 390 / 422; Koffmann's Fries 225 / 144 / 255 ...).
The script stops if a dish in DISHES no longer passes, and prints (with --candidates) every other text that agrees at 2 or more hotels, so a human re-checks
the table when the menus change. Fewer than MIN_ITEMS dishes passing stops the run (the chain would not be worth publishing).

Left out after a second look (2026-10-09), although they pass rules 1 to 3 as the paragraph reader sees them: a plain-text scan of all 119 menus
(raw_clashes, printed as RAW-TEXT lines) found the same name printed with another figure in a menu the reader could not attach to a dish:
8oz Ribeye, house salad, fries (922 at 3 hotels; "8oz Ribeye" 443 at Salcombe, 510 at Southampton, "8oz Ribeye Steak" 784 at Chichester),
Cheeseburger, brioche bun, chips (406 at 7 hotels; Christchurch Upper Deck's children's menu prints Cheeseburger with fries 524),
Pasta, tomato, cheese, basil sauce (322 at 6; Christchurch's children's "pasta ... smothered in cheese sauce" 467),
Classic Caesar Salad (494 at 5; Salcombe's "Classic Caesar salad ... anchovy" 912), Posh Fries (296 at 4; Christchurch's light bites 315),
Nut Roast (624 at 6; Southampton's Sunday "Nut Roast ... cep mushroom jus" 577), Vegetarian English (761 at 4; Christchurch's breakfast 630).
The other RAW-TEXT hits were read by eye: they are other dishes whose description contains the name (roast potatoes inside the Sunday roasts,
"Roast Potatoes and Root Vegetables" 418, "Grilled chicken, crisp bacon ..." 1143, Beer-battered haddock 844, "Chicken Milanese" 940), or
a neighbouring column read after the name (Roasted Fillet of Salmon, Bristol: the next figure belongs to the Risotto beside it).
Also left out on purpose: Eggs Any Style and Two Hen's Eggs Any Style, seen as "116 kcal per 100g" (not the dish as served). Eggs Any Style and Two Hen's Eggs Any Style ("116 kcal per 100g": not the dish as served; the reader skips
any figure followed by "per ...", "each" or a weight), two-size dishes ("214/388 kcal", "100g 12 / 180g 20"), dishes with two or more values in one paragraph
("Pancakes ... 383 kcal or berries ... kcal", coffee and tea lists), add-on lines ("Add - Chicken 144 kcal"), the afternoon tea (1581 kcal at 6 hotels, 441 at 2,
1831 at 1: one name, three values), Sunday roasts printed as one block with several meats, and any dish whose name line the reader cannot attach to its
description (the name sits in another column).
Allergens: none. The hotels publish no allergen table or guide: every menu says to ask a member of staff ("If you have any allergies ... please let us know
before ordering"), so no allergens.csv and no allergen link.
Tags: vegetarian only when every record of the dish carries the guide's own V or VG mark (Nut Roast: VG at one hotel, V at four, no mark at Fowey: no tag);
contains_pork / contains_beef when the printed name or description names bacon, ham, sausage, salami, prosciutto, pork; beef, steak, ribeye. A dish the
guide marks V or VG gets neither. Everything else is "meat type not stated".
"""
from __future__ import annotations

import argparse
import collections
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import harbour_hotels_pdf as P  # noqa: E402
import robots_rfc  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "harbour-hotels"
HOST = "www.harbourhotels.co.uk"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
SOURCE_URL = f"{BASE}/our-hotels"
SOURCE_TITLE = ("Harbour Hotels restaurant menus with calories (breakfast, light bites, a la carte, desserts, children's, Sunday and set menus; "
                "PDFs linked from each hotel's restaurant page, file names dated 2024 to October 2026)")
MIN_ITEMS = 25
EXPECTED_ITEMS = 28
EXCLUDE = re.compile(r"wine|drinks|xmas|christmas|newyear|boxing|privatedining|cruise|icedlattes|treasuresgems|after-dark|festive")
LINK = re.compile(r"/media/([a-z0-9]+)/([^\"'<>\\ ]+\.pdf)")
NOTE = ("Calories only, per dish as printed on the hotels' menus; protein, carbs, fat and allergens are not published. Each hotel has its own menus, so only "
        "dishes printed with the same name and calories at 2 or more hotels are listed. Children's menu files are dated 2024.")

# (hotel id, restaurant page path); the hotel id is the last folder of the path before the restaurant
PAGES = [
    "bristol/harbour-hotel-bristol/harbour-kitchen", "bristol/harbour-hotel-bristol/the-gold-bar",
    "cornwall/harbour-hotel-fowey/harbour-kitchen-bar-terrace", "cornwall/harbour-hotel-padstow/the-jetty",
    "cornwall/harbour-hotel-st-ives/harbour-kitchen-bar-terrace",
    "lake-district/rothay-garden-by-harbour-hotels/rothay-garden-restaurant-bar",
    "devon/harbour-beach-club-hotel-spa/beach-club-bar-plus-restaurant", "devon/harbour-hotel-salcombe/the-jetty",
    "devon/harbour-hotel-sidmouth/upper-deck", "dorset/harbour-hotel-christchurch/the-jetty", "dorset/harbour-hotel-christchurch/upper-deck",
    "hampshire/harbour-hotel-southampton/the-jetty", "hampshire/harbour-hotel-southampton/harbar-on-6th",
    "london/harbour-hotel-richmond/the-gate", "surrey/harbour-hotel-guildford/restaurants-at-harbour-hotel-guildford",
    "surrey/harbour-hotel-guildford/the-long-bar-grill", "surrey/harbour-hotel-guildford/harbar",
    "sussex/harbour-hotel-brighton/harbar-plus-kitchen", "sussex/harbour-hotel-chichester/the-ship",
    "wales/celtic-royal/castell-restaurant", "wales/celtic-royal/y-copa-bar",
]

PORK = re.compile(r"\b(pork|bacon|ham|sausages?|salami|prosciutto|pepperoni|chorizo|gammon)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?|ribeye|sirloin)\b", re.I)

BKF, LIGHT, START, MAIN, SIDE, DESS, DRINK, KIDS = ("Breakfast", "Light bites", "Starters & snacks", "Mains", "Sides", "Desserts", "Drinks",
                                                     "Children's menu")


def D(name, cat, *keys):
    """One published dish: display name, category, and the printed texts (reader keys) it is printed as."""
    return dict(name=name, cat=cat, keys=list(keys))


DISHES = [
    D("Battered Haddock with chips", KIDS, "battered haddock with chips"),
    D("Buttermilk Chicken Strips, cajun spices", KIDS, "buttermilk chicken strips cajun spices"),
    D("Chickpea Falafel Wrap", LIGHT, "chickpea falafel wrap lettuce tomato red onion cucumber mint lemon tahini hot sauce"),
    D("Classic Crème Brûlée", DESS, "classic crème brûlée madagascan vanilla infused cream"),
    D("Coconut & Oat French Toast", BKF, "coconut and oat french toast raspberry chia jam blueberries maple"),
    D("Crushed Avocado & Poached Hen’s Egg on Toast", BKF, "crushed avocado and poached hens egg on toast"),
    D("Fish Goujons, lemon mayonnaise, watercress", KIDS, "fish goujons lemon mayonnaise watercress"),
    D("Grilled Chicken, seasonal greens, new potatoes", KIDS, "grilled chicken seasonal greens new potatoes"),
    D("Grilled Kippers", BKF, "grilled kippers lemon and herb butter"),
    D("Hot Chocolate", DRINK, "hot chocolate"),
    D("Parmesan & Truffle Fries", SIDE, "parmesan and truffle fries"),
    D("Prawn Cocktail", START, "prawn cocktail chopped lettuce avocado cucumber pink prawns spiced dressing"),
    D("Roast Pork Shoulder", MAIN, "roast pork shoulder crackling apple sauce"),
    D("Roast Potatoes", SIDE, "roast potatoes garlic and thyme"),
    D("Roasted Fillet of Salmon", MAIN, "roasted fillet of salmon fennel sea vegetables citrus and vermouth beurre blanc dill"),
    D("Roasted Parsnip & Pear Soup", START, "roasted parsnip and pear soup smoked maple chestnut rosemary oil"),
    D("Sausage & Egg Morning Brioche", BKF, "sausage and egg morning brioche cumberland sausage patty fried egg cheese and hash browns stacked in a toasted brioche"),
    D("Selection of Charcuterie", START, "selection of charcuterie prosciutto ham napoli salami bresaola and house pickles with sourdough"),
    D("Severn & Wye Smoked Salmon", START, "severn and wye smoked salmon soda bread lemon"),
    D("Smoked Salmon & Dill Cream Cheese Bagel", LIGHT, "smoked salmon and dill cream cheese bagel red onion capers"),
    D("Smoked Salmon Bagel", LIGHT, "smoked salmon bagel whole wheat bagel dill crème fraîche"),
    D("Sourdough Boule", START, "sourdough boule balsamic olive oil and cultured butter"),
    D("Sourdough Boule for Two to Share", START, "sourdough boule for two to share balsamic olive oil and cultured butter"),
    D("Spinach & Ricotta Soufflé Omelette", BKF, "spinach and ricotta soufflé omelette chives shallots and watercress"),
    D("Steamed Samphire", SIDE, "steamed samphire lemon sea salt"),
    D("The Harbour Club", LIGHT, "the harbour club chicken bacon hens egg tomato lettuce"),
    D("Truffle Chicken Milanese", MAIN, "truffle chicken milanese fried hens egg brioche crumb truffle cream and parmesan watercress"),
    D("Two Poached Eggs", BKF, "two poached eggs crushed peas broad beans lemon"),
]


# ---------------------------------------------------------------------------------------------- fetching (polite, robots-checked)
def curl(url: str, out: Path) -> int:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    return int(res.stdout.strip() or 0)


def page_file(cache: Path, path: str) -> Path:
    parts = path.split("/")
    return cache / "pages" / f"{parts[1]}__{parts[2]}.html"


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
        out = page_file(cache, path)
        if out.exists() and out.stat().st_size > 500:
            continue
        if not robots_rfc.allowed(rules, f"/our-hotels/{path}"):
            raise SystemExit(f"robots.txt disallows /our-hotels/{path}: stop (never work round it)")
        code = curl(f"{BASE}/our-hotels/{path}", out)
        if code != 200:
            out.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code} for {BASE}/our-hotels/{path}")
        time.sleep(1.1)
    for pdf_id, fname, _hotel in menu_links(cache):
        out = cache / "pdf" / f"{pdf_id}__{fname}"
        if out.exists() and out.stat().st_size > 500:
            continue
        if not robots_rfc.allowed(rules, f"/media/{pdf_id}/{fname}"):
            raise SystemExit(f"robots.txt disallows /media/{pdf_id}/{fname}: stop (never work round it)")
        code = curl(f"{BASE}/media/{pdf_id}/{fname}", out)
        if code != 200 or out.read_bytes()[:5] != b"%PDF-":
            out.unlink(missing_ok=True)
            print(f"HTTP {code}, not saved: {fname}")
        time.sleep(1.1)


def menu_links(cache: Path) -> list:
    """[(pdf id, file name, hotel id)] for every food menu PDF linked from the cached restaurant pages."""
    seen, out = set(), []
    for path in PAGES:
        f = page_file(cache, path)
        if not f.exists():
            continue
        hotel = path.split("/")[1]
        for pdf_id, fname in sorted(set(LINK.findall(f.read_text(encoding="utf-8")))):
            if EXCLUDE.search(fname.lower()) or (pdf_id, hotel) in seen:
                continue
            seen.add((pdf_id, hotel))
            out.append((pdf_id, fname, hotel))
    return out


def created(path: Path) -> str:
    info = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True).stdout
    for line in info.splitlines():
        if line.startswith("CreationDate:"):
            return datetime.strptime(line.split(":", 1)[1].strip().replace(" UTC", ""), "%a %b %d %H:%M:%S %Y").strftime("%Y-%m-%d")
    return ""


# ---------------------------------------------------------------------------------------------- reading
def load_records(cache: Path) -> tuple:
    files, paras = [], {}
    for pdf_id, fname, hotel in menu_links(cache):
        path = cache / "pdf" / f"{pdf_id}__{fname}"
        if not path.exists():
            continue
        files.append((hotel, fname, path))
        paras[(hotel, fname)] = P.paragraphs(path)
    titles = P.section_titles([p for v in paras.values() for p in v])
    records = []
    for (hotel, fname), ps in paras.items():
        for p in ps:
            r = P.record(p, titles)
            if r:
                records.append(dict(r, hotel=hotel, file=fname, page=p["page"]))
    return files, records


def raw_clashes(files: list, items: list) -> list:
    """Safety net for what the paragraph reader misses: search the plain text of every menu for each published dish's name (the words before
    its first comma) and read the first "NNN kcal" after it (within 250 characters, before the next name-like heading); lists every file that
    prints another figure. Printed for a human to look at: such a hit is usually another dish with a longer name."""
    texts = []
    for hotel, fname, path in files:
        raw = subprocess.run(["pdftotext", str(path), "-"], capture_output=True, text=True).stdout
        texts.append((hotel, fname, " ".join(raw.replace("\u2019", "'").split())))
    out = []
    for it in items:
        name = P.norm(it["name"].split(",")[0])
        rx = re.compile(r"(?<![\w])" + r"\W+".join(re.escape(w) for w in name.split()) + r"(?![\w])", re.I)
        for hotel, fname, text in texts:
            for m in rx.finditer(text.replace("&", " and ")):
                tail = text.replace("&", " and ")[m.end():m.end() + 250]
                km = P.KC.search(tail)
                if km and km.group(1).strip() != it["calories"] and "/" not in km.group(1) and "kcal" not in tail[:km.start()].lower():
                    out.append(f"{it['name']} ({it['calories']}): {hotel} {fname} prints {km.group(1)} kcal after '{m.group(0)}' ... {tail[:km.start()][:70]!r}")
    return out


def build(cache: Path, show_candidates: bool = False) -> tuple:
    files, records = load_records(cache)
    by_key = collections.defaultdict(list)
    by_name = collections.defaultdict(list)
    for r in records:
        by_key[r["key"]].append(r)
        by_name[r["name_key"]].append(r)
    items, report, listed, near_notes = [], [], set(), []
    for d in DISHES:
        recs = [r for k in d["keys"] for r in by_key.get(k, [])]
        for k in d["keys"]:
            listed.add(k)
            if k not in by_key:
                raise SystemExit(f"{d['name']}: the printed text {k!r} is no longer in any menu: the menus changed, re-check DISHES")
        hotels = {r["hotel"] for r in recs}
        kcals = {r["kcal"] for r in recs}
        if len(hotels) < 2 or len(kcals) != 1:
            raise SystemExit(f"{d['name']}: now printed at {len(hotels)} hotel(s) with calories {sorted(kcals)}: re-check DISHES")
        for nk in {r["name_key"] for r in recs}:
            other = {r["kcal"] for r in by_name[nk]} - kcals
            if other:
                raise SystemExit(f"{d['name']}: the name {nk!r} is also printed with {sorted(other)} calories: leave the dish out")
        # 3b. the same dish under a longer or shorter name ("8oz Ribeye" 922 / "8oz Ribeye Steak" 784): left out too
        for nk in {r["name_key"] for r in recs}:
            for m, others in by_name.items():
                if m != nk and len(nk.split()) >= 2 and len(m.split()) >= 2 and (f" {nk} " in f" {m} " or f" {m} " in f" {nk} "):
                    other = {r["kcal"] for r in others} - kcals
                    if other:
                        near_notes.append(f"{d['name']}: the similar name {m!r} is printed with {sorted(other)} calories (a different dish? checked by eye)")
        marks = [set(r["marks"]) for r in recs]
        veg = all(m & {"V", "VG"} for m in marks)
        text = recs[0]["name"] + " " + recs[0]["body"]
        tags = []
        if veg:
            tags.append("vegetarian")
        elif any(m & {"V", "VG"} for m in marks):
            report.append(f"{d['name']}: dietary mark on some menus only ({sorted(set().union(*marks))}): no vegetarian tag")
        if not any(m & {"V", "VG"} for m in marks):
            if PORK.search(text):
                tags.append("contains_pork")
            if BEEF.search(text):
                tags.append("contains_beef")
            if not PORK.search(text) and not BEEF.search(text) and re.search(r"burger|sausage|mince|meatball", text, re.I):
                report.append(f"meat type not stated: {d['name']}")
        where = "; ".join(sorted({f"{r['hotel']} ({r['file']})" for r in recs}))
        items.append(dict(name=d["name"], category=d["cat"], calories=next(iter(kcals)), tags="|".join(tags), rankable=False,
                          notes=f"printed '{recs[0]['name']}'{(' / ' + recs[0]['body']) if recs[0]['body'] else ''} {next(iter(kcals))} kcal at {len(hotels)} hotels: {where}"))
        report.append(f"{d['name']}: {next(iter(kcals))} kcal at {len(hotels)} hotels")
    for n in near_notes:
        print("NEAR-NAME " + n)
    for n in raw_clashes(files, items):
        print("RAW-TEXT " + n)
    if show_candidates:
        print("--- other texts that agree at 2 or more hotels with one value (not in DISHES; look at each before adding):")
        for k, recs in sorted(by_key.items()):
            if k in listed:
                continue
            hs, ks = {r["hotel"] for r in recs}, {r["kcal"] for r in recs}
            if len(hs) >= 2 and len(ks) == 1:
                clash = {r["kcal"] for r in by_name[recs[0]["name_key"]]} - ks
                print(f"   {next(iter(ks)):>5} kcal, {len(hs)} hotels{'  NAME CLASH ' + str(sorted(clash)) if clash else ''}: {recs[0]['name']} / {recs[0]['body'][:50]}")
    if len(items) < MIN_ITEMS:
        raise SystemExit(f"only {len(items)} dishes agree at 2 or more hotels (minimum {MIN_ITEMS}): do not publish")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: re-check DISHES")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("item names are not unique")
    return items, report, files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path, help="folder for the downloaded pages and PDFs")
    ap.add_argument("--fetch", action="store_true", help="download the pages and PDFs first (skips what is already there)")
    ap.add_argument("--checked-on", help="the day the PDFs were read, YYYY-MM-DD")
    ap.add_argument("--candidates", action="store_true", help="also list texts that agree at 2+ hotels but are not in DISHES")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
        if not args.checked_on:
            return 0
    if not args.checked_on:
        ap.error("--checked-on is required")
    items, report, files = build(args.cache, args.candidates)
    dates = sorted(created(p) for _, _, p in files)
    print(f"{len(files)} menu PDFs read (created {dates[0]} to {dates[-1]}); hotels: {len({h for h, _, _ in files})}")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Harbour Hotels", cuisine="Hotel restaurant", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["harbour hotels", "harbour hotel", "harbour kitchen", "the jetty", "upper deck",
                                                                "harbar", "harbour hotel and spa"],
                             items=items, out=args.out, note=NOTE, nutrition_level="calories")
    print("\n".join(report))
    counts = collections.Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
