#!/usr/bin/env python3
"""Build data/source/powerleague/ from Powerleague's own food and drink menu PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/powerleague.py CACHE_DIR --fetch                    # robots.txt, the three menu PDFs, the club pages (60 s apart)
    python3 tools/uk_extract/powerleague.py CACHE_DIR --checked-on 2026-11-17 [--out DIR]

Source: "FOOD & DRINK MENU", November 2026 edition (the menu prints no date or edition; the files sit under /wp-content/uploads/2026/11/ and the PDFs were
created on 5 November 2026), 20-page A4 PDF with a text layer, one file per price tier, all under
https://www.powerleague.com/wp-content/uploads/2026/11/MENU_<TIER>_DIGITAL.pdf for <TIER> = TIER-3, TIER-1 and SCOTLAND. Those are the files the clubs'
own menu pages point to (https://www.powerleague.com/menu-<club>/ answers 301 to /menu-open/?club=...&menu=<the PDF>; /menu-open/?... itself is disallowed by
robots.txt, so only the Location header of the 301 is read: Battersea -> TIER-1, Gateshead -> TIER-3, Glasgow -> SCOTLAND, checked 2026-11-17).
It replaced the Q2 May 2026 edition (469U-PL-Q2-MAY_DIGITAL-MENU_A4_<TIER>_SINGLE-PAGES_FINAL-compressed.pdf, a different layout).
The files differ in prices: `read_dishes` reads every "Name NNN kcal  £ price" line of each file and the run stops unless every dish prints the same kcal in
all three, except the dishes in HOLDBACK, which must still disagree (if they agree again, a human re-checks). Forty-two food lines print calories (breakfast
rolls and their extras, Chicago Town pizzas, hot food, kids' food, ice creams); hot drinks (Costa), beers, spirits, wine and soft drinks print none, and no
file prints protein, carbs, fat or allergens ("Please speak to a member of the team for any allergy or dietary requirements").
A name the PDF wraps onto two lines ("Walls Cornetto Soft Cookies &" / "Chocolate 381 kcal") is joined: the first line carries the prices and no kcal, the
second the kcal and no price.
robots.txt (https://www.powerleague.com/robots.txt, `User-agent: *`): `Disallow: /*?`, /team?team_id=, /wp-admin/ (admin-ajax allowed) and **Crawl-delay: 60**. The delay is honoured
by `polite_get`: at least 61 seconds between any two requests to the host, remembered in CACHE_DIR/last_request_epoch.txt and logged in requests.log.

Clubs: the chain's own club pages (https://www.powerleague.com/location/<slug>) list "Key Features" such as Floodlights, Kids parties and Bar. A page that lists
Bar is a club with a bar; this script reads the CLUBS pages in the cache and stops unless MIN_CLUBS_WITH_BAR (5) of them list it. The membership page and every club page say
"Members get a discount on food and drink when they scan QR code at their local club"; the menu says each section's items are "subject to availability".

Display names and categories are written by hand in DISHES (below); the script checks that DISHES and the names the reader finds in the PDF are the same set, so nothing
can be added or lost silently. Tags: vegetarian where the printed name says vegan or veggie; contains_pork / contains_beef where the printed name or description says pork,
bacon, ham, sausage, pepperoni, salami, chorizo or beef (docs/UK_DATA_PLAYBOOK.md); everything else "meat type not stated".
"""
from __future__ import annotations

import argparse
import html
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "powerleague"
HOST = "www.powerleague.com"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
DELAY = 61.0  # robots.txt: Crawl-delay: 60
PDF_STEM = f"{BASE}/wp-content/uploads/2026/11/MENU_%s_DIGITAL.pdf"
TIERS = ["TIER-3", "TIER-1", "SCOTLAND"]
SOURCE_URL = PDF_STEM % "TIER-3"
SOURCE_TITLE = ("Powerleague Food & Drink Menu, November 2026 (no date printed; files in /uploads/2026/11/, created 5 November 2026; "
                "calories per dish, the same figures in the Tier 3, Tier 1 and Scotland files)")
NOTE = ("Calories only, as printed on Powerleague's November 2026 food and drink menu; the same figures are in every price tier. Not every club has a bar, "
        "and the menu says items are subject to availability.")
CLUBS = ["battersea", "croydon", "gateshead", "glasgow", "manchester-central", "watford", "barnet", "birmingham", "bolton", "bradford", "bury", "cardiff",
         "colchester", "coventry", "enfield", "fairlop", "finchley", "harrow", "leeds-central", "liverpool", "luton", "milton-keynes", "newham", "peterborough"]
MIN_CLUBS_WITH_BAR = 5
EXPECTED_DISHES = 42

BR, EX, PZ, HF, KD, IC = "Breakfast rolls", "Breakfast roll extras", "Chicago Town pizzas", "Hot food", "Kids' food", "Ice cream"
# printed name (curly quotes as printed) -> (display name, category)
DISHES = {
    "Sausage Roll": ("Sausage Roll", BR),
    "Bacon Roll": ("Bacon Roll", BR),
    "Sausage & Bacon Roll": ("Sausage & Bacon Roll", BR),
    "Veggie Sausage Roll": ("Veggie Sausage Roll", BR),
    "The Power Roll": ("The Power Roll", BR),
    "Extra Sausage Patty": ("Extra Sausage Patty", EX),
    "Extra Bacon": ("Extra Bacon", EX),
    "Egg": ("Egg", EX),
    "Hash Brown": ("Hash Brown", EX),
    "Cheese Slice": ("Cheese Slice", EX),
    "Loaded Cheese": ("Loaded Cheese", PZ),
    "Loaded Pepperoni": ("Loaded Pepperoni", PZ),
    "BBQ Magnificent Meat Feast": ("BBQ Magnificent Meat Feast", PZ),
    "BBQ Chicken": ("BBQ Chicken", PZ),
    "Vegan BBQ Jackfruit": ("Vegan BBQ Jackfruit", PZ),
    "Tear’N’Share Cheesy Dough Balls": ("Tear 'n' Share Cheesy Dough Balls", PZ),
    "Hot Dog": ("Hot Dog", HF),
    "Chicken Burger": ("Chicken Burger", HF),
    "3 Chicken Tenders & Dips": ("3 Chicken Tenders & Dips", HF),
    "12 Chicken Nuggets & Dips": ("12 Chicken Nuggets & Dips", HF),
    "Portion of Chips - Large": ("Portion of Chips (large)", HF),
    "Portion of Chips - Small": ("Portion of Chips (small)", HF),
    "Kids’ Individual Cheese Pizza": ("Kids' Individual Cheese Pizza", KD),
    "Fish Finger Roll": ("Fish Finger Roll", KD),
    "6 Chicken Nuggets & Dip": ("6 Chicken Nuggets & Dip", KD),
    "Hartleys Raspberry Jelly": ("Hartleys Raspberry Jelly", KD),
    "Frube Tube (Mixed Flavours)": ("Frube Tube (mixed flavours)", KD),
    "Soreen Lunch Box Loaf": ("Soreen Lunch Box Loaf", KD),
    "Kellogg’s Variety Cereal Pack": ("Kellogg's Variety Cereal Pack", KD),
    "Walls Calippo Orange": ("Walls Calippo Orange", IC),
    "Walls Calippo Cola": ("Walls Calippo Cola", IC),
    "Walls Calippo Strawberry": ("Walls Calippo Strawberry", IC),
    "Walls Twister": ("Walls Twister", IC),
    "Walls Solero Exotic": ("Walls Solero Exotic", IC),
    "Walls Cornetto Go": ("Walls Cornetto Go", IC),
    "Walls Cornetto Strawberry": ("Walls Cornetto Strawberry", IC),
    "Walls Cornetto Soft Cookies & Chocolate": ("Walls Cornetto Soft Cookies & Chocolate", IC),
    "Walls Magnum Classic": ("Walls Magnum Classic", IC),
    "Walls Magnum White": ("Walls Magnum White", IC),
    "Walls Minecraft Ice Cream": ("Walls Minecraft Ice Cream", IC),
    "Walls Magnum Vegan Almond": ("Walls Magnum Vegan Almond", IC),
    "Ben & Jerry’s Cookie Dough Sandwich": ("Ben & Jerry's Cookie Dough Sandwich", IC),
}
# Extra notes (not exported), keyed by printed name.
NOTES = {
    "BBQ Chicken": "The description printed under it describes a salt & pepper pizza (salt & pepper tomato sauce and chicken), as printed",
}
# Dishes whose printed kcal differs between the tier files (printed name -> reason): never chosen between, not published.
HOLDBACK = {
    "Ben & Jerry’s Cookie Dough Sandwich": "The menus disagree: {kcals}. Not published until Powerleague's files agree.",
}

PORK = re.compile(r"\b(pork|bacon|ham|sausages?|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
KCAL_LINE = re.compile(r"^(?P<name>.*?\S)\s+(?P<kcal>(?<![\d,])(?:\d{1,3}(?:,\d{3})+|\d+)) kcal(?P<rest>.*)$")
NAME_THEN_PRICE = re.compile(r"^(?P<name>[^£]*?\S)\s{2,}£\s*\d+\.\d{2}(?:\s+\d+\.\d{2})?\s*$")  # a name whose kcal is on the next line


# ---------------------------------------------------------------------------------------------- fetching (polite: Crawl-delay 60)
def polite_get(cache: Path, url: str, out: Path) -> int:
    stamp, log = cache / "last_request_epoch.txt", cache / "requests.log"
    last = float(stamp.read_text()) if stamp.exists() else 0.0
    wait = last + DELAY - time.time()
    if wait > 0:
        print(f"waiting {wait:.0f}s (Crawl-delay: 60)", flush=True)
        time.sleep(wait)
    t = time.time()
    stamp.write_text(str(t))
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    code = int(res.stdout.strip() or 0)
    with open(log, "a") as f:
        f.write(f"{time.strftime('%H:%M:%S', time.gmtime(t))}Z {url} -> {code}\n")
    return code


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    robots = cache / "robots.txt"
    if not robots.exists() and polite_get(cache, f"{BASE}/robots.txt", robots) != 200:
        robots.unlink(missing_ok=True)
        raise SystemExit("cannot read robots.txt: stop (never work round it)")
    rules = robots_rfc.parse(robots.read_text(encoding="utf-8-sig"))
    todo = [(PDF_STEM % t, cache / f"{t}.pdf") for t in TIERS] + [(f"{BASE}/location/{c}", cache / f"club-{c}.html") for c in CLUBS]
    for url, out in todo:
        path = url[len(BASE):]
        if not robots_rfc.allowed(rules, path):
            raise SystemExit(f"robots.txt disallows {path}: stop (never work round it)")
    for url, out in todo:
        if out.exists() and out.stat().st_size > 500:
            continue
        code = polite_get(cache, url, out)
        if code != 200 or (out.suffix == ".pdf" and out.read_bytes()[:5] != b"%PDF-"):
            out.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code} for {url}: stop")


# ---------------------------------------------------------------------------------------------- reading the PDF
def pdf_text(pdf: Path) -> str:
    return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout


def read_dishes(text: str) -> dict[str, tuple[str, str]]:
    """{printed name: (kcal exactly as printed, the description lines under it)} for every line that prints 'NNN kcal'."""
    out: dict[str, tuple[str, str]] = {}
    pending: str | None = None   # a name printed with its prices and no kcal: the kcal must be on the very next line
    current: str | None = None   # the dish whose description lines follow
    desc: dict[str, list[str]] = {}
    kcal_of: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            current = None
            pending = None
            continue
        m = KCAL_LINE.match(line)
        if m:
            name, rest = m["name"].strip(), m["rest"].strip()
            if pending is not None:
                if rest:
                    raise SystemExit(f"{line!r}: the second line of a wrapped name prints more than its kcal: the menu changed shape")
                name, pending = f"{pending} {name}", None
            elif not rest.startswith("£"):
                raise SystemExit(f"{line!r}: a kcal line without a price: the menu changed shape")
            name = re.sub(r"\s+", " ", name)
            if name in kcal_of:
                raise SystemExit(f"{name!r} prints two calorie figures: the menu changed shape")
            kcal_of[name], desc[name], current = m["kcal"], [], name
            continue
        p = NAME_THEN_PRICE.match(line)
        if p:
            pending, current = re.sub(r"\s+", " ", p["name"]), None
            continue
        pending = None
        if current is not None:
            desc[current].append(re.sub(r"\s+", " ", line))
    for name, kcal in kcal_of.items():
        out[name] = (kcal, " ".join(desc[name]))
    return out


def key_features(html_text: str) -> list[str]:
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", html_text, flags=re.S)
    lines = [ln.strip() for ln in html.unescape(re.sub(r"<[^>]+>", "\n", t)).splitlines() if ln.strip()]
    if "Key Features" not in lines:
        return []
    i = lines.index("Key Features")
    j = next((k for k in range(i + 1, len(lines)) if lines[k] == "Contact"), None)
    return lines[i + 1:j] if j else []


def serving_of(description: str) -> str:
    m = re.match(r"(\d+)”", description)
    return f'{m.group(1)}" pizza' if m else ""


def tags_of(name: str, description: str) -> str:
    if re.search(r"\b(vegan|veggie)\b", name, re.I):
        return "vegetarian"
    tags = []
    if PORK.search(name + " " + description):
        tags.append("contains_pork")
    if BEEF.search(name + " " + description):
        tags.append("contains_beef")
    return "|".join(tags)


# ---------------------------------------------------------------------------------------------- build
def build(cache: Path, checked_on: str, out: Path | None) -> None:
    per_tier = {t: read_dishes(pdf_text(cache / f"{t}.pdf")) for t in TIERS}
    found = per_tier[TIERS[0]]
    for t in TIERS[1:]:
        if set(per_tier[t]) != set(found):
            raise SystemExit(f"{t}: dishes differ from {TIERS[0]}: {sorted(set(per_tier[t]) ^ set(found))}")
    for name in found:
        kcals = {t: per_tier[t][name][0] for t in TIERS}
        if name in HOLDBACK:
            if len(set(kcals.values())) == 1:
                raise SystemExit(f"{name!r} now prints the same kcal in every file ({kcals}): re-check it and take it out of HOLDBACK")
        elif len(set(kcals.values())) != 1:
            raise SystemExit(f"{name!r} prints different kcal in the tier files {kcals}: look before publishing")
    if set(found) != set(DISHES) or len(found) != EXPECTED_DISHES:
        raise SystemExit(f"the menu's dishes changed: only in PDF {sorted(set(found) - set(DISHES))}, only in DISHES {sorted(set(DISHES) - set(found))}")
    clubs = {c: key_features((cache / f"club-{c}.html").read_text(encoding="utf-8", errors="replace")) for c in CLUBS if (cache / f"club-{c}.html").exists()}
    with_bar = sorted(c for c, f in clubs.items() if "Bar" in f)
    print(f"club pages read: {len(clubs)}; listing a Bar: {len(with_bar)} {with_bar}")
    for c, f in sorted(clubs.items()):
        print(f"   {c}: {f}")
    if len(with_bar) < MIN_CLUBS_WITH_BAR:
        raise SystemExit(f"only {len(with_bar)} club pages list a Bar (need {MIN_CLUBS_WITH_BAR}): the chain does not qualify, stop and report")
    items, holdback = [], []
    for printed, (name, cat) in DISHES.items():
        kcal, desc = found[printed]
        note = f"printed as {kcal} kcal under {printed!r}"
        if printed in NOTES:
            note += f"; {NOTES[printed]}"
        if printed in HOLDBACK:
            kcals = ", ".join(f"the {t} file prints {per_tier[t][printed][0]} kcal" for t in TIERS)
            note += f"; HELD BACK: {kcals}"
            holdback.append((slug(name), HOLDBACK[printed].format(kcals=kcals)))
        items.append(dict(name=name, category=cat, serving=serving_of(desc), calories=kcal.replace(",", ""), tags=tags_of(name, desc), rankable=False, notes=note))
    write_chain_folder(chain_id=CHAIN_ID, name="Powerleague", cuisine="Bar & Kitchen", source_title=SOURCE_TITLE, source_url=SOURCE_URL, checked_on=checked_on,
                       aliases=["powerleague", "power league", "powerleague football", "powerleague soccer centre"], items=items, out=out, note=NOTE,
                       nutrition_level="calories", holdback=holdback)
    print(f"wrote {len(items)} of {len(found)} dishes with kcal; held back: {[h[0] for h in holdback]}")
    for t in TIERS:
        print("sha256", t, sha256_file(cache / f"{t}.pdf"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--checked-on", default=time.strftime("%Y-%m-%d"))
    ap.add_argument("--out", type=Path)
    a = ap.parse_args()
    if a.fetch:
        fetch(a.cache)
    build(a.cache, a.checked_on, a.out)


if __name__ == "__main__":
    main()
