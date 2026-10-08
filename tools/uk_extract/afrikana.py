#!/usr/bin/env python3
"""Build data/source/afrikana/ from Afrikana Kitchen's own website menu page (a CALORIES-ONLY chain).

    python3 tools/uk_extract/afrikana.py path/to/menu.html --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://www.afrikanakitchen.com/menu  (a Framer site; the menu is server-rendered into the HTML, so no browser is needed).
`--fetch` downloads that one page to the given path first (one request, normal browser User-Agent; robots.txt on 2026-10-08 is
"User-agent: *  Allow: /"). Checked 2026-10-08: HTTP 200, served "Last-Modified: Tue, 22 Sep 2026 12:38:58 GMT"; the page itself shows no
date or version. It is the chain-wide menu: the site lists 20 UK locations (/locations/<town>: Marble Arch, Angel, Birmingham, Cardiff,
Derby, East Ham, Glasgow, Holloway, Hounslow, Ilford, Lakeside, Leicester, Manchester, Mile End, Nottingham, Star City, The O2, Uxbridge,
Walsall, Wembley) and no location page has a menu of its own.

What the page prints: every dish has a name, "NNN Kcal" and (mostly) a description. Nothing else: no protein, carbs, fat, salt, weights or
kJ, and no statement of which sauce or flavour a figure includes. So protein, carbs and fat stay blank (docs/DATA.md "Calories-only
chains"); every item is then not rankable. Calories are copied from the page exactly as printed.

How the page is read (each rule stops the run if the page stops fitting it):
- Sections are the page's own <h3>/<p> headings (Fried Chicken Club, Small Plates, ...); the category is the heading as printed. The page
  repeats the Fried Chicken Club section three times (one copy per layout, 18 dish blocks for 6 dishes): the repeats must be identical
  to the first (same name, figure and description) and are then dropped.
- The page marks the tab "Green Bites (V)": the chain's own vegetarian mark for the whole section, so those four dishes are tagged
  vegetarian. No other item is tagged vegetarian.
- Names are the page's own (it prints them in Title Case). "Five Wings" and "Ten Wings" are printed twice with different figures, in
  Fried Chicken Club (fried, tossed in sauce) and Proper Peri Chicken (grilled, with fries and coleslaw); they get the section in brackets
  so the names are unique. "NEW" badges are not read (the page shows them on some copies of a dish and not others); limited_time stays false.
- Loaded Fries ("667 / 885 Kcal") and Loaded Mac 'N Cheese ("972 / 1043 Kcal") print two figures and spell out which topping each belongs
  to in the description ("- Topped With Chicken (667)", "- Topped With Pulled Beef (885)"): one item per topping, and the two figures
  in the heading must equal the two in the description or the run stops.
- The OG Cheesecake is printed with one figure for its three flavours (classic vanilla, passionfruit, strawberry): one item. Wings and
  tenders are "tossed in your chosen sauce" with one figure whatever the sauce: one item each.
- contains_beef only where the dish name or description says beef or steak; contains_pork where it says pork, bacon, ham, sausage,
  pepperoni, salami or chorizo (no dish does). The page says nothing else about meat types ("smash burger", "chops", "kebab" with no
  meat named), so those get no tag.
- No serving is stated per dish (the sharing platters do not say how many they feed), so `serving` stays blank.

Allergens (docs/DATA.md "Allergens"): NONE. The page's footer has an "Allergens" link, but in the served HTML it is an <a name="Allergens">
with no href, clicking it in a real Chromium does nothing (no navigation, no overlay), and https://www.afrikanakitchen.com/allergens
is a 404 (checked 2026-10-08). Nothing is published, so neither allergens.csv nor allergen_guide.csv is written.
"""
from __future__ import annotations
import argparse
import html as htmllib
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "afrikana"
SOURCE_URL = "https://www.afrikanakitchen.com/menu"
SOURCE_TITLE = "Afrikana Kitchen website menu with calories (accessed {checked}, no date shown)"
ALIASES = ["afrikana", "afrikana kitchen", "afrikana peri kitchen & grill", "afrikana peri kitchen and grill"]
NOTE = ("Afrikana prints calories only, beside each dish on its website menu, so protein, carbs and fat are not published. "
        "The page doesn't say which sauce or flavour a figure includes. It publishes no allergen information.")
EXPECTED_DISH_BLOCKS = 84   # dish blocks in the HTML, counting the repeated Fried Chicken Club copies
EXPECTED_DISHES = 72        # distinct dishes
EXPECTED_ITEMS = 74         # the two "loaded" dishes print two figures each
SECTIONS = ["Fried Chicken Club", "Small Plates", "Proper Peri Chicken", "Buns & Bread", "Afrikana Specials", "Sharing Platters",
            "Rice Bowls & Salad", "Regular Sides", "Signature Sides", "Green Bites (V)", "Kids", "Desserts"]
SECTION_COUNTS = {"Fried Chicken Club": 6, "Small Plates": 6, "Proper Peri Chicken": 8, "Buns & Bread": 6, "Afrikana Specials": 12,
                  "Sharing Platters": 4, "Rice Bowls & Salad": 2, "Regular Sides": 9, "Signature Sides": 6, "Green Bites (V)": 4,
                  "Kids": 4, "Desserts": 5}
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
KCAL = re.compile(r"^(\d{2,4}) Kcal$")
KCAL2 = re.compile(r"^(\d{2,4}) / (\d{2,4}) Kcal$")
OPTION = re.compile(r"-\s*Topped [Ww]ith ([A-Za-z ]+?)\s*\((\d{2,4})\)")

_MARKER = re.compile(r'data-framer-name="(Heading|Dish Name|Calories|Description)"')


def _texts(segment: str) -> list:
    """Visible text of each <p>/<h1-6> in a fragment, whitespace collapsed."""
    found = re.findall(r"<(p|h[1-6])\b[^>]*>(.*?)</\1>", segment, flags=re.S)
    return [" ".join(htmllib.unescape(re.sub(r"<[^>]+>", "", body)).split()) for _, body in found]


def read_dish_blocks(page: str) -> list:
    """The page's dish blocks in order: dicts with section, name, kcal (as printed), desc (paragraphs joined by ' | ')."""
    blocks, section = [], None
    for m in _MARKER.finditer(page):
        kind = m.group(1)
        segment = page[m.end():m.end() + 6000]
        nxt = re.search(r"data-framer-name=", segment)
        segment = segment[:nxt.start()] if nxt else segment
        texts = [t for t in _texts(segment) if t]
        if kind == "Heading":
            section = texts[0] if texts else None
        elif kind == "Dish Name":
            if section is None or len(texts) != 1:
                raise SystemExit(f"Dish name block without a section or with {len(texts)} texts: the page layout changed")
            blocks.append({"section": section, "name": texts[0], "kcal": None, "desc": ""})
        elif kind == "Calories":
            if not blocks or blocks[-1]["kcal"] is not None or len(texts) != 1:
                raise SystemExit("Calories block out of place: the page layout changed")
            blocks[-1]["kcal"] = texts[0]
        elif kind == "Description" and blocks:
            blocks[-1]["desc"] = " | ".join(texts)
    return blocks


def distinct_dishes(blocks: list) -> list:
    if len(blocks) != EXPECTED_DISH_BLOCKS:
        raise SystemExit(f"Expected {EXPECTED_DISH_BLOCKS} dish blocks, found {len(blocks)}: the menu changed, re-read the page")
    dishes, seen = [], {}
    for b in blocks:
        if b["kcal"] is None:
            raise SystemExit(f"{b['name']!r} has no calories block")
        key = (b["section"], b["name"])
        if key in seen:
            first = seen[key]
            if (first["kcal"], first["desc"]) != (b["kcal"], b["desc"]):
                raise SystemExit(f"{key} is printed twice with different figures or descriptions: {first} vs {b}")
            continue
        seen[key] = b
        dishes.append(b)
    if len(dishes) != EXPECTED_DISHES:
        raise SystemExit(f"Expected {EXPECTED_DISHES} distinct dishes, found {len(dishes)}")
    if [s for s in dict.fromkeys(d["section"] for d in dishes)] != SECTIONS:
        raise SystemExit(f"Sections changed: {list(dict.fromkeys(d['section'] for d in dishes))}")
    for section, n in SECTION_COUNTS.items():
        got = sum(1 for d in dishes if d["section"] == section)
        if got != n:
            raise SystemExit(f"Section {section!r} has {got} dishes, expected {n}")
    return dishes


def build_items(dishes: list) -> list:
    printed = {}
    for d in dishes:
        printed.setdefault(d["name"], []).append(d["section"])
    clashes = {n for n, secs in printed.items() if len(secs) > 1}
    if clashes != {"Five Wings", "Ten Wings"}:
        raise SystemExit(f"Dish names printed in more than one section changed: {sorted(clashes)}")
    items = []
    for d in dishes:
        name = d["name"] + (f" ({d['section']})" if d["name"] in clashes else "")
        base_note = f"Printed '{d['name']} {d['kcal']}' under {d['section']}"
        vegetarian = "(V)" in d["section"]
        two = KCAL2.match(d["kcal"])
        if two:
            options = OPTION.findall(d["desc"])
            if len(options) != 2 or [o[1] for o in options] != [two.group(1), two.group(2)]:
                raise SystemExit(f"{d['name']}: heading figures {two.groups()} do not match the description's options {options}")
            for label, value in options:
                label = " ".join(label.split()).lower()
                option_name = f"{d['name']} topped with {label}"
                items.append(dict(name=option_name, category=d["section"], calories=value,
                                  tags="|".join(_tags(option_name, vegetarian)), rankable=False,
                                  notes=f"{base_note}; option 'Topped with {label}' ({value}) from the description"))
            continue
        one = KCAL.match(d["kcal"])
        if not one:
            raise SystemExit(f"{d['name']}: calories text {d['kcal']!r} is not 'NNN Kcal'")
        items.append(dict(name=name, category=d["section"], calories=one.group(1),
                          tags="|".join(_tags(d["name"] + " " + d["desc"], vegetarian)), rankable=False, notes=base_note))
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}")
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    # Identical figures on different dishes are entered as printed; say so in the (unexported) notes.
    by_value = {}
    for it in items:
        by_value.setdefault(it["calories"], []).append(it)
    for value, group in by_value.items():
        if len(group) > 1:
            for it in group:
                others = ", ".join(o["name"] for o in group if o is not it)
                it["notes"] += f"; same printed figure ({value}) as {others}"
    return items


def _tags(text: str, vegetarian: bool) -> list:
    tags = []
    if vegetarian:
        tags.append("vegetarian")
    if PORK.search(text):
        tags.append("contains_pork")
    if BEEF.search(text):
        tags.append("contains_beef")
    return tags


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("html", type=Path, help="the saved menu page (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the page was read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download SOURCE_URL to the given path first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 (fixed https URL)
            args.html.write_bytes(resp.read())
    print(f"menu page sha256 {sha256_file(args.html)}  {args.html}")
    page = args.html.read_text(encoding="utf-8")
    dishes = distinct_dishes(read_dish_blocks(page))
    items = build_items(dishes)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Afrikana Kitchen", cuisine="Chicken", source_title=SOURCE_TITLE.format(checked=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             allergen_guide=None, nutrition_level="calories")
    counts = {s: sum(1 for i in items if i["category"] == s) for s in SECTIONS}
    print(f"wrote {len(items)} items ({len(dishes)} dishes) to {out}: " + ", ".join(f"{s} {n}" for s, n in counts.items()))


if __name__ == "__main__":
    main()
