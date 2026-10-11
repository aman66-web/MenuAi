#!/usr/bin/env python3
"""Build data/source/powerleague/ from Powerleague's own food and drink menu PDF (a CALORIES-ONLY chain).

    python3 tools/uk_extract/powerleague.py CACHE_DIR --fetch                    # robots.txt, the three menu PDFs, the club pages (60 s apart)
    python3 tools/uk_extract/powerleague.py CACHE_DIR --checked-on 2026-10-10 [--out DIR]

Source: "FOOD AND DRINK MENU", Q2 May 2026 edition, 16-page A4 PDF with a text layer, one file per price tier, all under
https://www.powerleague.com/wp-content/uploads/2026/05/469U-PL-Q2-MAY_DIGITAL-MENU_A4_<TIER>_SINGLE-PAGES_FINAL-compressed.pdf for <TIER> = TIER-3, TIER-4 and SCOTLAND
(TIER-1 and TIER-2 answer 404: they do not exist under that name). The files differ in prices and promotions only: `same_kcal` below checks that the
text of every "NNN kcal" line is identical in all three, and the run stops if not. Twenty food lines print calories ("Breakfast roll with sausage. 519 kcal",
"... 1,712 kcal" under a pizza); hot drinks (Costa), beers, spirits, wine and soft drinks print none, and no file prints protein, carbs, fat or allergens
("Please speak to a member of the team for any allergy or dietary requirements").
robots.txt (https://www.powerleague.com/robots.txt, `User-agent: *`): `Disallow: /*?`, /team?team_id=, /wp-admin/ (admin-ajax allowed) and **Crawl-delay: 60**. The delay is honoured
by `polite_get`: at least 61 seconds between any two requests to the host, remembered in CACHE_DIR/last_request_epoch.txt and logged in requests.log.
(One request in the first manual session, the Tier-3 PDF, was sent 20 seconds after robots.txt, before this helper existed: it is noted in the log.)

Clubs: the chain's own club pages (https://www.powerleague.com/location/<slug>) list "Key Features" such as Floodlights, Kids parties and Bar. A page that lists
Bar is a club with a bar; this script reads CLUBS and stops unless MIN_CLUBS_WITH_BAR (5) of them list it. The membership page and every club page say "Members get a
discount on food and drink when they scan QR code at their local club"; the menu itself says "Not all items listed are stocked in all locations".

Left out on purpose: "ROLLOVER ORIGINAL HOT DOG *" and "ROLLOVER HALAL HOT DOG *" (the menu marks them "*Selected locations only"); everything without a printed kcal. Display names and
categories are written by hand in DISHES (below); the script checks that DISHES and the headings the reader finds in the PDF are the same set, so nothing can be added or lost silently.
Tags: vegetarian where the printed name says vegan or veggie; contains_pork / contains_beef where the printed name or description says pork, bacon, ham, sausage, pepperoni, salami, chorizo
or beef (docs/UK_DATA_PLAYBOOK.md); everything else "meat type not stated".
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
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "powerleague"
HOST = "www.powerleague.com"
BASE = f"https://{HOST}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
DELAY = 61.0  # robots.txt: Crawl-delay: 60
PDF_STEM = f"{BASE}/wp-content/uploads/2026/05/469U-PL-Q2-MAY_DIGITAL-MENU_A4_%s_SINGLE-PAGES_FINAL-compressed.pdf"
TIERS = ["TIER-3", "TIER-4", "SCOTLAND"]
SOURCE_URL = PDF_STEM % "TIER-3"
SOURCE_TITLE = "Powerleague Food and Drink Menu, Q2 May 2026 (calories per dish; same figures in the Tier 3, Tier 4 and Scotland files)"
NOTE = ("Calories only, as printed on Powerleague's May 2026 food and drink menu; the same figures are in every price tier. Not every club has a bar or stocks every item. "
        "Two hot dogs sold at selected locations only are not listed.")
CLUBS = ["battersea", "croydon", "gateshead", "glasgow", "manchester-central", "watford", "barnet", "birmingham", "bolton", "bradford", "bury", "cardiff",
         "colchester", "coventry", "enfield", "fairlop", "finchley", "harrow", "leeds-central", "liverpool", "luton", "milton-keynes", "newham", "peterborough"]
MIN_CLUBS_WITH_BAR = 5
EXPECTED_DISHES = 20
EXPECTED_PUBLISHED = 18

BR, PZ, HF, KD = "Breakfast rolls", "Chicago Town pizzas", "Hot food", "Kids' food"
# printed heading -> (display name, category)
DISHES = {
    "SAUSAGE ROLL": ("Sausage Roll", BR),
    "BACON ROLL": ("Bacon Roll", BR),
    "SAUSAGE & BACON ROLL": ("Sausage & Bacon Roll", BR),
    "VEGGIE SAUSAGE ROLL": ("Veggie Sausage Roll", BR),
    "LOADED CHEESE": ("Loaded Cheese", PZ),
    "LOADED PEPPERONI": ("Loaded Pepperoni", PZ),
    "MAGNIFICENT MEAT FEAST": ("Magnificent Meat Feast", PZ),
    "SALT & PEPPER CHICKEN": ("Salt & Pepper Chicken", PZ),
    "VEGAN BBQ JACKFRUIT": ("Vegan BBQ Jackfruit", PZ),
    "TEAR ‘N’ SHARE CHEESY DOUGH BALLS": ("Tear 'n' Share Cheesy Dough Balls", PZ),
    "ROLLOVER ORIGINAL HOT DOG *": None,  # "*Selected locations only"
    "ROLLOVER HALAL HOT DOG *": None,
    "12 CHICKEN NUGGETS & DIPS": ("12 Chicken Nuggets & Dips", HF),
    "PORTION OF CHIPS": ("Portion of Chips", HF),
    "KIDS’ INDIVIDUAL CHEESE PIZZA - 1 OF 5-A-DAY": ("Kids' Individual Cheese Pizza", KD),
    "6 CHICKEN NUGGETS & DIPS": ("6 Chicken Nuggets & Dips", KD),
    "HARTLEYS RASPBERRY JELLY": ("Hartleys Raspberry Jelly", KD),
    "FRUBE TUBE (MIXED FLAVOURS)": ("Frube Tube (mixed flavours)", KD),
    "SOREEN LUNCH BOX LOAF": ("Soreen Lunch Box Loaf", KD),
    "KELLOGG’S VARIETY CEREAL PACK": ("Kellogg's Variety Cereal Pack", KD),
}

PORK = re.compile(r"\b(pork|bacon|ham|sausages?|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\bbeef\b", re.I)
HEADING = re.compile(r"^([A-Z0-9][A-Z0-9 &'’‘\-\(\)\*,\.]*?)\s{2,}£\d")
KCAL = re.compile(r"(?<![\d,])(\d{1,3}(?:,\d{3})+|\d+) kcal")


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
    """{printed heading: (kcal exactly as printed, the description lines under the heading)} for every heading that is followed by a 'NNN kcal'."""
    out: dict[str, tuple[str, str]] = {}
    heading, desc = None, []
    for line in text.splitlines():
        m = HEADING.match(line.strip())
        if m and not m.group(1).startswith("£"):
            heading, desc = m.group(1).strip(), []
            continue
        k = KCAL.search(line)
        if k and heading:
            if heading in out:
                raise SystemExit(f"{heading!r} prints two calorie figures: the menu changed shape")
            out[heading] = (k.group(1), " ".join(desc + [line.strip()]))
            continue
        if heading and line.strip() and not k:
            desc.append(line.strip())
    return out


def same_kcal(texts: dict[str, str]) -> None:
    ref = None
    for name, t in sorted(texts.items()):
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in t.splitlines() if KCAL.search(ln)]
        if ref is None:
            ref = (name, lines)
        elif lines != ref[1]:
            raise SystemExit(f"{name} prints different kcal lines from {ref[0]}: look before publishing")


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
    texts = {t: pdf_text(cache / f"{t}.pdf") for t in TIERS}
    same_kcal(texts)
    found = read_dishes(texts[TIERS[0]])
    for t in TIERS[1:]:
        if {k: v[0] for k, v in read_dishes(texts[t]).items()} != {k: v[0] for k, v in found.items()}:
            raise SystemExit(f"{t}: dishes or kcal differ from {TIERS[0]}")
    if set(found) != set(DISHES) or len(found) != EXPECTED_DISHES:
        raise SystemExit(f"the menu's dishes changed: only in PDF {sorted(set(found) - set(DISHES))}, only in DISHES {sorted(set(DISHES) - set(found))}")
    clubs = {c: key_features((cache / f"club-{c}.html").read_text(encoding="utf-8", errors="replace")) for c in CLUBS if (cache / f"club-{c}.html").exists()}
    with_bar = sorted(c for c, f in clubs.items() if "Bar" in f)
    print(f"club pages read: {len(clubs)}; listing a Bar: {len(with_bar)} {with_bar}")
    for c, f in sorted(clubs.items()):
        print(f"   {c}: {f}")
    if len(with_bar) < MIN_CLUBS_WITH_BAR:
        raise SystemExit(f"only {len(with_bar)} club pages list a Bar (need {MIN_CLUBS_WITH_BAR}): the chain does not qualify, stop and report")
    items, left_out = [], []
    for heading, spec in DISHES.items():
        kcal, desc = found[heading]
        if spec is None:
            left_out.append(f"{heading} (marked '*Selected locations only')")
            continue
        name, cat = spec
        items.append(dict(name=name, category=cat, serving=serving_of(desc), calories=kcal.replace(",", ""), tags=tags_of(name, desc), rankable=False,
                          notes=f"printed as {kcal} kcal under {heading!r}"))
    if len(items) != EXPECTED_PUBLISHED:
        raise SystemExit(f"{len(items)} items, expected {EXPECTED_PUBLISHED}")
    write_chain_folder(chain_id=CHAIN_ID, name="Powerleague", cuisine="Bar & Kitchen", source_title=SOURCE_TITLE, source_url=SOURCE_URL, checked_on=checked_on,
                       aliases=["powerleague", "power league", "powerleague football", "powerleague soccer centre"], items=items, out=out, note=NOTE,
                       nutrition_level="calories")
    print(f"published {len(items)} of {len(found)} dishes with kcal; left out: {left_out}")
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
