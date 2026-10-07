#!/usr/bin/env python3
"""Build data/source/burger-shack/ from Burger Shack's own page on Young's pubs' website (a CALORIES-ONLY chain).

    python3 tools/uk_extract/burger_shack.py --page path/to/burger-shack.html --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: https://www.youngs.co.uk/burger-shack  (Young & Co.'s Brewery PLC: "Burger Shack - The Best Burgers in Young's Pub Gardens").
The page shows no date or version, so the source title says "(accessed <date>, no date shown)". --fetch downloads the page once
(normal browser User-Agent; robots.txt on youngs.co.uk is `User-agent: * / Disallow:` = nothing disallowed).

What the page prints: a "Menus" grid of twelve cards. SIX are dishes whose description ends with the dish's calories in brackets
("... sesame bun (757Kcal)", i.e. per burger or hot dog as sold): The Original, Chilli Cheese, Bacon, Chilli Cheese, Loaded Plant,
Hot Chick, Bratwurst Dog. The other six cards (Sharing, On the Side, On Top, Be Extra, Get Saucy, Little
Jude's In the freezer) list choices and print NO calories, so they are not listed. Protein, carbs, fat, salt and every other nutrient
are never printed, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows
"not published"). Calories are copied from the page exactly as printed. The page also has NO allergen guide or allergen marks (only a
"VE" vegan mark on Loaded Plant and on the ice creams), and Young's site has none either (checked: sitemap, the Burger Shack page and
the Food & Drink page), so no allergen files are written.

The numbers are read from the page's visible HTML cards AND, as a second method, from the Next.js data payload embedded in the same
page; the run stops if the two disagree, if a calorie figure appears anywhere else on the page, or if the cards change (a new, renamed
or removed card, another number of calorie values), so a human re-checks ITEMS when Young's changes the page.
"""
from __future__ import annotations
import argparse
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "burger-shack"
PAGE_URL = "https://www.youngs.co.uk/burger-shack"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
ALIASES = ["burger shack", "burgershack", "young's burger shack", "youngs burger shack"]
NOTE = ("Calories only, as Young's prints them on the Burger Shack page (per burger or hot dog as listed): protein, carbs and fat are "
        "not published. Burger Shack is served in Young's pub gardens. Sides, extras, sauces and ice creams print no calories and are not listed.")

BURGERS, DOG = "Burgers", "Hot dog"
# printed card title -> (category, vegetarian mark expected). Names are as printed on the page.
ITEMS = {
    "The Original": BURGERS,
    "Chilli Cheese": BURGERS,
    "Bacon, Chilli Cheese": BURGERS,
    "Loaded Plant": BURGERS,
    "Hot Chick": BURGERS,
    "Bratwurst Dog": DOG,
}
EXPECTED_ITEMS = len(ITEMS)  # 6 cards with calories
# Cards that print no calories (checked on every run; anything else stops the script).
EXPECTED_WITHOUT_KCAL = ["Sharing", "On the Side", "On Top", "Be Extra", "Get Saucy", "Little Jude's In the freezer"]

PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
KCAL_END = re.compile(r"\(\s*(\d+)\s*Kcal\s*\)\s*$", re.I)
CARD = re.compile(
    r'menuItemTitle">(?P<title>.*?)</p>\s*<p[^>]*menuItemPrice">(?P<price>.*?)</p>\s*<p[^>]*menuItemDesc">(?P<desc>.*?)'
    r'(?:<!-- -->)?\s*<span data-allergens="(?P<mark>[^"]*)"', re.S)


def fetch(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=60) as r:  # one request, nothing else
        dest.write_bytes(r.read())


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", s)).split())


def read_cards(page: str) -> list[dict]:
    """The visible HTML cards: title, description (with its calories), the small mark after it."""
    cards = [dict(title=clean(m["title"]), price=clean(m["price"]), desc=clean(m["desc"]), mark=m["mark"].strip().lower())
             for m in CARD.finditer(page)]
    if not cards:
        raise SystemExit("No menu cards found: the page layout changed, re-check this script")
    return cards


def read_payload(page: str) -> list[dict]:
    """Second method: the menuItems array of the Next.js data embedded in the same page (escaped inside a JS string)."""
    key = '\\"menuItems\\":['
    start = page.find(key)
    if start < 0:
        raise SystemExit("The embedded menuItems data was not found: the page changed, re-check this script")
    i = start + len(key) - 1
    depth, j = 0, i
    while j < len(page):
        c = page[j]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                break
        j += 1
    raw = page[i:j + 1].replace('\\"', '"').replace("\\\\", "\\")
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise SystemExit(f"Could not parse the embedded menuItems data ({e}): re-check this script")
    return [dict(title=d["title"].strip(), price=d["price"].strip(), desc=" ".join(d["description"].split()),
                 mark=d["allergens"].strip().lower()) for d in data]


def build_items(cards: list[dict], payload: list[dict]) -> list[dict]:
    if cards != payload:
        raise SystemExit("The visible cards and the embedded page data disagree: stop and re-read the page by eye.\n"
                         f"cards:   {cards}\npayload: {payload}")
    # No calorie figure may appear outside the description's closing "(NNNKcal)" of a dish card.
    for c in cards:
        body = KCAL_END.sub("", c["desc"])
        if re.search(r"kcal|kj|calorie", body + " " + c["title"] + " " + c["price"], re.I):
            raise SystemExit(f"{c['title']}: a calorie figure appears somewhere other than the end of the description: {c['desc']!r}")
    with_kcal = [c for c in cards if KCAL_END.search(c["desc"])]
    without = [c["title"] for c in cards if not KCAL_END.search(c["desc"])]
    printed = [c["title"] for c in with_kcal]
    if sorted(printed) != sorted(ITEMS) or len(printed) != len(set(printed)):
        raise SystemExit(f"The menu changed. Printed with calories: {printed}. Expected: {list(ITEMS)}. Update ITEMS after reading the page.")
    if without != EXPECTED_WITHOUT_KCAL:
        raise SystemExit(f"Cards without calories changed: now {without}, expected {EXPECTED_WITHOUT_KCAL}")
    items = []
    for c in with_kcal:
        text = c["title"] + " " + c["desc"]
        tags = []
        if c["mark"] == "ve":  # the page's own VE (vegan) mark; the text also says "Vegan patty ... vegan sesame bun"
            tags.append("vegetarian")
        elif c["mark"]:
            raise SystemExit(f"{c['title']}: unknown mark {c['mark']!r}")
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        kcal = KCAL_END.search(c["desc"]).group(1)
        notes = "Printed: " + c["desc"]
        if re.search(r"\bsausage\b", text, re.I) and not re.search(r"\b(pork|bacon|ham)\b", text, re.I):
            notes += ". The page says 'sausage' without naming the meat: contains_pork comes from the playbook's sausage rule"
        items.append(dict(name=c["title"], category=ITEMS[c["title"]], calories=kcal, tags="|".join(tags), rankable=False, notes=notes))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved page (PAGE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the page was read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the page into --page first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(PAGE_URL, args.page)
    page = args.page.read_text(encoding="utf-8")
    print(f"page sha256 {sha256_file(args.page)}  {args.page}")
    items = build_items(read_cards(page), read_payload(page))
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Burger Shack", cuisine="Burgers",
        source_title=f"Young's Burger Shack page (accessed {args.checked_on}, no date shown)", source_url=PAGE_URL,
        checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, allergen_guide=None,
        nutrition_level="calories")
    print(f"wrote {len(items)} items to {out}")
    print("printed without calories (not listed): " + ", ".join(EXPECTED_WITHOUT_KCAL))


if __name__ == "__main__":
    main()
