#!/usr/bin/env python3
"""Build data/source/burger-and-lobster/ from Burger & Lobster's own menu pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/burger_and_lobster.py --pages DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

DIR holds the ten saved UK menu pages (file names in LOCATIONS below); --fetch downloads them first. burgerandlobster.com's robots.txt
says "Crawl-delay: 10" and disallows /dish/, /dietary-option/ and /product/ (never fetched here), so --fetch waits 11 seconds between
requests and one page per restaurant is all it asks for.

Source: each restaurant's menu page, e.g. https://www.burgerandlobster.com/locations/london/bond-street/menu/ (server-rendered HTML, read by
burger_and_lobster_pages.py). The page has no date or version. Bond Street is the reference; the other nine UK pages (Bread Street,
Knightsbridge, Leicester Square, Mayfair, Oxford Circus, Threadneedle Street, West India Quay, High Street Kensington, Brighton) are read
too and every published figure must be printed identically wherever it appears; a page that prints a different figure for a dish it describes
in the same words holds that dish back (the script lists it). The 2026-10-07 reading found the ten pages agree on every published figure
except the B&L Ice Cream Sandwich: nine pages print 949 kcal for "Caramelised brioche, Bailey's ice cream, brownie, caramel, popcorn" and
Brighton prints 928 kcal for a differently described dish ("Boho Gelato vanilla, meringue, strawberry"), so Brighton's is another recipe
and is not published (the London figure is). Brighton's Affogato says "Boho Gelato" instead of "Hackney Gelato" at the same 178 kcal.

The pages print calories ONLY ("1407kcal" beside a dish, or beside each size/option): protein, carbs and fat are never printed, so they
stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable and the app shows "not published"). No salt, sugar or
other nutrient, no weights and no kJ are printed either. Numbers are copied exactly as printed; only the names of items that have size or
option lines, the categories and the tags are decided by this script, and it stops if the dishes on the reference page differ from the
tables below (a new, renamed or removed dish), so a human re-checks when the menu changes.

How the page's own wording is read:
- A dish with option lines ("7oz Original Burger" with "Corn-fed Nebraskan beef 1407kcal / Grass-fed Irish beef 1307kcal") is one item per
  option, named "7oz Original Burger (Corn-fed Nebraskan beef)". The combos name the option line itself ("Half Lobster & Beef Burger
  (B&L Combo)"); the kids' sides are "B&L Fries (Kid's Sides)". Oscietra Caviar prints "15g 45 kcal" and "30g 85 kcal": serving "15g"/"30g".
- Not listed because the page prints no calories for them: all drinks (cocktails, wine, beer, cider, non-alcoholic drinks), the whole
  lobsters (1.25lb to 2lb) and Jumbo Lobsters, Two Scoops of Ice Cream, Seasonal Vegetables (kids' side).
- Not listed although calories are printed, because the figure cannot be tied to one thing: three "Add" lines that print two values in one
  line ("Cheddar or American cheese 166kcal | 136kcal", "Blue or Brie cheese 181kcal | 285kcal", "Half or full lobster tail 56kcal | 112kcal":
  which value belongs to which option is only the order on the line); Rock Oysters ("40 kcal", "£3 each": the page does not say whether 40
  kcal is for one oyster or a serving).
- Soft drinks (Coke, Fever-Tree, juices, water) and an "Intune CBD" drink print kcal on only the High Street Kensington and Brighton pages
  and with no bottle/can size: not listed (no stated serving, not on the standard menu pages).
- The Surf & Turf set menu (Monday - Sunday, 12pm - 6pm) repeats three dishes with the same figure as the main menu (Calamari 588,
  Grilled Greens and Stracciatella 430, Crème Brûlée 554): the main-menu row is kept and the set-menu repeat dropped. The set menu's
  "Beyond Meat Burger" (1211 kcal, no V mark) is a different figure from the main menu's "Beyond-Meat Burger" (998 kcal, V), so it is kept
  and named "Beyond Meat Burger (set menu)".
- Threadneedle Street's page calls the 450 kcal side "Sweet Potato Chips"; the other nine say "Sweet Potato Wedges" (also 450 kcal).
- Tags: vegetarian only when the dish line carries the page's own "V" mark (the page prints no legend for it). contains_pork /
  contains_beef when the dish's own words say so (bacon; beef, steak, sirloin, wagyu). Nothing else is inferred.

Allergens: the site publishes none. Its FAQ says only "If you have any specific allergy requirements, we always recommend getting in
touch with the restaurant", and the dish pages (/dish/) that may carry more are disallowed in robots.txt. So there is no allergen file
and no allergen_guide.csv.
Re-checked 2026-10-09 (allergen pass): still nothing to publish. The Bond Street menu page (one request, Crawl-delay honoured) has no allergen text
or marks (only the V mark and calories) and links to no /dish/ page; the FAQ (https://www.burgerandlobster.com/faq/) only says "If you have any
specific allergy requirements, we always recommend getting in touch with the restaurant"; robots.txt still lists /dish/, /dietary-option/ and /product/
(the file's "Crawl-delay: 10Disallow: /dish/" line is malformed, and it is read the cautious way). Per-dish allergen data, if the chain has any, can only
be on those pages, so the founder would have to read it in a browser or ask the chain.
"""
from __future__ import annotations
import argparse
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import burger_and_lobster_pages as pages  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "burger-and-lobster"
BASE = "https://www.burgerandlobster.com"
REFERENCE = "bond-street"
LOCATIONS = {  # file stem -> page path (every UK restaurant the site lists; Britain only)
    "bond-street": "/locations/london/bond-street/menu/",
    "bread-street": "/locations/london/bread-street/menu/",
    "knightsbridge": "/locations/london/knightsbridge/menu/",
    "leicester-square": "/locations/london/leicester-square/menu/",
    "mayfair": "/locations/london/mayfair/menu/",
    "oxford-circus": "/locations/london/oxford-circus/menu/",
    "threadneedle-street": "/locations/london/threadneedle-street/menu/",
    "west-india-quay": "/locations/london/west-india-quay/menu/",
    "high-street-kensington": "/locations/london/high-street-kensington/menu/",
    "brighton": "/locations/brighton/market-street/menu/",
}
SOURCE_URL = BASE + LOCATIONS[REFERENCE]
SOURCE_TITLE = ("Burger & Lobster menu pages with calories, Bond Street reference page compared with the other nine UK restaurants' "
                "pages (accessed 2026-10-07, no date shown)")
ALIASES = ["burger and lobster", "burger & lobster", "burger lobster", "b&l"]
NOTE = ("Burger & Lobster prints calories only, beside each dish, so protein, carbs and fat are not published. Figures are the "
        "ones on its London pages (Brighton makes its ice cream sandwich differently: 928 kcal there). Drinks, whole lobsters and "
        "some add-ons print no usable calories and are not listed. No allergen guide is published.")
FORBIDDEN = ("/dish/", "/dietary-option/", "/product/", "/wp-admin/")  # robots.txt Disallow lines: never fetched

# (section, subsection) -> category for dishes that print calories on the reference page. The "Add" dish sits under Burger.
CATEGORIES = {
    ("Surf & Turf Set Menu", "Starters"): "Surf & Turf set menu", ("Surf & Turf Set Menu", "Mains"): "Surf & Turf set menu",
    ("Surf & Turf Set Menu", "Dessert"): "Surf & Turf set menu",
    ("Starters", ""): "Starters", ("Oyster Bar", ""): "Oyster bar", ("The Originals", "Burger"): "Burgers",
    ("The Originals", "Lobster Roll"): "Lobster rolls", ("The Combos", ""): "Combos", ("Sides & Sauces", "Sides"): "Sides",
    ("Sides & Sauces", "Sauces"): "Sauces", ("Desserts", ""): "Desserts", ("Kids Menu", ""): "Kids menu",
}
SET_MENU = "Surf & Turf Set Menu"
NO_KCAL_SECTIONS = ("Drinks",)  # no dish in these sections may print calories on the reference page (checked)
NO_KCAL_SUBSECTIONS = ("After Dinner Drinks",)
# option lines whose name comes first in the item name ("Half Lobster & Beef Burger (B&L Combo)")
OPTION_FIRST = {"B&L Combo", "Roll Combo", "Lobster Combo", "Kid's Sides"}
# Everything on the reference page that is NOT published, as (title, option) -> why. The script stops if this set changes.
EXPECTED_UNLISTED = {
    ("Two Scoops of Ice Cream", ""): "no calories printed",
    ("1.25lb Lobster", ""): "no calories printed", ("1.5lb Lobster", ""): "no calories printed",
    ("1.75lb Lobster", ""): "no calories printed", ("2lb Lobster", ""): "no calories printed",
    ("Jumbo Lobsters", ""): "no calories printed", ("Kid's Sides", "Seasonal Vegetables"): "no calories printed",
    ("Add", "Cheddar or American cheese"): "two values on one line (166kcal | 136kcal)",
    ("Add", "Blue or Brie cheese"): "two values on one line (181kcal | 285kcal)",
    ("Add", "Half or full lobster tail"): "two values on one line (56kcal | 112kcal)",
    ("Rock Oysters", ""): "40 kcal printed beside '£3 each' with no stated basis",
}
# Set-menu repeats of main-menu dishes (same figure): dropped, the main-menu row stays.
EXPECTED_SET_MENU_REPEATS = {"Calamari", "Grilled Greens and Stracciatella", "Crème Brûlée"}
EXPECTED_ITEMS = 52
# The same dish under another name on one page, to compare its figure too: (published key) -> (page, key on that page)
OTHER_NAME = {("Sweet Potato Wedges", ""): ("threadneedle-street", ("Sweet Potato Chips", ""))}

PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|sirloin|wagyu)\b", re.I)
KCAL = re.compile(r"^(\d+)\s*kcal$", re.I)
WEIGHT = re.compile(r"^\d+g$")


# slug() would turn the accents into hyphens, and ids may not start with "combo-" (reserved by the pipeline)
ID_OVERRIDES = {"Crème Brûlée": "creme-brulee", "Combo for Two": "for-two-combo"}


def row_id(name: str) -> str:
    return ID_OVERRIDES.get(name) or slug(name)


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower().replace("&", " and ")).strip()


def fetch(pages_dir: Path) -> None:
    pages_dir.mkdir(parents=True, exist_ok=True)
    ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    for i, (stem, path) in enumerate(LOCATIONS.items()):
        if any(bad in path for bad in FORBIDDEN):
            raise SystemExit(f"{path} is disallowed by robots.txt")
        if i:
            time.sleep(11)  # robots.txt: Crawl-delay 10
        req = urllib.request.Request(BASE + path, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=60) as r:
            (pages_dir / f"{stem}.html").write_bytes(r.read())
        print(f"fetched {BASE + path}")


def kcal_of(text: str, where: str) -> str:
    m = KCAL.match(text.strip())
    if not m:
        raise SystemExit(f"{where}: calories {text!r} are not a single 'NNNkcal' value: the page layout changed")
    return m.group(1)


def read_page(pages_dir: Path, stem: str) -> list[dict]:
    return pages.read_dishes((pages_dir / f"{stem}.html").read_text(encoding="utf-8"))


def kcal_by_key(dishes: list[dict]) -> dict:
    """(title, option) -> list of (printed calories with spaces removed, description text) for every dish/option line that prints
    calories (the key can occur twice on a page: main menu and set menu)."""
    out: dict = {}
    for d in dishes:
        desc = " ".join(d["description"])
        if d["kcal"]:
            out.setdefault((d["title"], ""), []).append(("".join(" ".join(d["kcal"]).split()), desc))
        for v in d["variations"]:
            if v["kcal"]:
                out.setdefault((d["title"], v["name"]), []).append(("".join(v["kcal"].split()), desc))
    return out


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    dishes = read_page(pages_dir, REFERENCE)
    report: list[str] = []
    candidates: list[dict] = []  # in page order
    unlisted: dict = {}
    for d in dishes:
        section, sub, title = d["section"], d["subsection"], d["title"]
        if section in NO_KCAL_SECTIONS or sub in NO_KCAL_SUBSECTIONS:
            if d["kcal"] or any(v["kcal"] for v in d["variations"]):
                raise SystemExit(f"{title!r} in {section}/{sub} now prints calories: add its category and re-check")
            continue
        if d["marks"] and d["marks"] != ["V"]:
            raise SystemExit(f"{title!r}: unknown mark {d['marks']}")
        vegetarian = d["marks"] == ["V"]
        shared_text = " ".join(d["description"])
        rows = []  # (option name, calories string or None)
        if d["variations"] and d["kcal"]:
            # "Truffle Chunky Chips 708 kcal" with price-only lines "Swap £4" / "Add £7": the calories belong to the dish
            if any(v["kcal"] for v in d["variations"]) or {v["name"] for v in d["variations"]} != {"Swap", "Add"}:
                raise SystemExit(f"{title!r} prints calories both on the dish and on option lines")
            rows.append(("", d["kcal"][0]))
        elif d["variations"]:
            for v in d["variations"]:
                rows.append((v["name"], v["kcal"] or None))
        else:
            if len(d["kcal"]) > 1:
                raise SystemExit(f"{title!r} prints several calorie values: {d['kcal']}")
            rows.append(("", d["kcal"][0] if d["kcal"] else None))
        for option, kcal in rows:
            key = (title, option)
            if key in EXPECTED_UNLISTED:
                unlisted[key] = EXPECTED_UNLISTED[key]
                continue
            if kcal is None:
                raise SystemExit(f"{key} prints no calories and is not in EXPECTED_UNLISTED: the menu changed, re-check")
            cat = CATEGORIES.get((section, sub))
            if cat is None:
                raise SystemExit(f"{key} is in the new section/subsection {(section, sub)!r}: add it to CATEGORIES")
            if title == "Add":
                name, cat = "Add " + option.lower(), "Burger add-ons"
            elif not option:
                name = title
            elif title in OPTION_FIRST:
                name = f"{option} ({title})"
            else:
                name = f"{title} ({option})"
            text = " ".join([option if option else title, shared_text])
            tags = (["vegetarian"] if vegetarian else []) + (["contains_pork"] if PORK.search(text) else []) \
                + (["contains_beef"] if BEEF.search(text) else [])
            serving = option if WEIGHT.match(option) else ""
            if title == "Combo for Two":
                serving = "For two"
            if title == "Half Lobster Mac & Cheese":
                serving = "For two"
            notes = []
            if d["price"] and "supplement" in " ".join(d["price"]):
                notes.append("page prints '" + " ".join(d["price"]) + "'")
            if title == "Half Lobster Mac & Cheese":
                notes.append("page prints 'For two (or for the very hungry...)'")
            if section == SET_MENU:
                notes.append("Surf & Turf set menu, available Monday - Sunday, 12pm - 6pm")
            candidates.append(dict(title=title, option=option, name=name, category=cat, calories=kcal_of(kcal, str(key)), serving=serving,
                                   tags=tags, notes=notes, section=section, text=text))
    # --- drop set-menu repeats, rename set-menu dishes that clash with a different main-menu figure
    main = {norm(c["title"] if not c["option"] else c["name"]): c for c in candidates if c["section"] != SET_MENU}
    items, repeats = [], set()
    for c in candidates:
        if c["section"] == SET_MENU:
            twin = main.get(norm(c["name"]))
            if twin is not None and twin["calories"] == c["calories"]:
                repeats.add(c["title"])
                continue
            if twin is not None:
                c["name"] = c["name"] + " (set menu)"
        items.append(c)
    if repeats != EXPECTED_SET_MENU_REPEATS:
        raise SystemExit(f"Set-menu repeats changed: now {sorted(repeats)}, expected {sorted(EXPECTED_SET_MENU_REPEATS)}")
    missing = set(EXPECTED_UNLISTED) - set(unlisted)
    if missing:
        raise SystemExit(f"Dishes expected on the reference page but not found: {sorted(missing)}")
    names = [c["name"] for c in items]
    if len(set(norm(n) for n in names)) != len(names):
        raise SystemExit("Item names are not unique")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} items, built {len(items)}: the menu changed, re-check the tables")

    # --- compare with the other nine UK pages
    per_page = {stem: kcal_by_key(read_page(pages_dir, stem)) for stem in LOCATIONS}
    holdback: list[tuple[str, str]] = []
    out = []
    for c in items:
        key = (c["title"], c["option"])
        ref_entries = per_page[REFERENCE][key]
        ref_kcal, ref_desc = {k for k, _ in ref_entries}, {d for _, d in ref_entries}
        seen, conflicts, variants = {}, [], []
        for stem, table in per_page.items():
            entries = list(table.get(key, []))
            if key in OTHER_NAME and OTHER_NAME[key][0] == stem:
                entries += table.get(OTHER_NAME[key][1], [])
            if not entries:
                continue
            seen[stem] = entries
            kcals = {k for k, _ in entries}
            if kcals != ref_kcal:
                # a different figure: a contradiction if the page describes the dish in the same words, otherwise another recipe
                same_words = any(d in ref_desc for _, d in entries)
                (conflicts if same_words else variants).append((stem, sorted(kcals), entries[0][1]))
        if conflicts:
            c["conflict"] = "; ".join(f"{stem.replace('-', ' ')} prints {'/'.join(k)}" for stem, k, _ in conflicts) \
                + f"; {REFERENCE.replace('-', ' ')} prints {'/'.join(sorted(ref_kcal))}"
        for stem, kcals, desc in variants:
            c["notes"].append(f"{stem} page lists a differently described dish at {'/'.join(kcals)} ('{desc}'): not this recipe, not published")
            c.setdefault("variant", []).append(stem)
            report.append(f"{c['name']}: {stem} page prints {'/'.join(kcals)} for a different recipe ('{desc}'), left out; "
                          f"{REFERENCE} and {len(seen) - len(variants) - 1} other pages print {'/'.join(sorted(ref_kcal))}")
        c["seen"] = len(seen)
        n = len(seen) - len(variants)
        if n < len(LOCATIONS) - len(variants):
            absent = [s for s in LOCATIONS if s not in seen]
            c["notes"].append(f"calories printed on {n} of {len(LOCATIONS)} UK pages (not on: {', '.join(absent)})")
            report.append(f"{c['name']}: calories printed on {n} of {len(LOCATIONS)} pages, missing on {', '.join(absent)}")
        if key in OTHER_NAME:
            c["notes"].append(f"{OTHER_NAME[key][0].replace('-', ' ')} page names it {OTHER_NAME[key][1][0]} (same figure)")
        if conflicts:
            holdback.append((row_id(c["name"]), "the chain's own UK menu pages print different calories for this dish (" + c["conflict"]
                             + "), so none is published"))
            report.append(f"HELD BACK {c['name']}: {c['conflict']}")
        row = dict(id=row_id(c["name"]), name=c["name"], category=c["category"], serving=c["serving"], calories=c["calories"], tags="|".join(c["tags"]),
                   rankable=False, notes="; ".join(c["notes"]))
        out.append(row)
    # --- report lines
    for c in items:
        if re.search(r"\bburger\b", c["text"], re.I) and not c["tags"] and "Beyond" not in c["text"]:
            report.append(f"meat type not stated: {c['name']}")
    for key, why in sorted(unlisted.items()):
        report.append(f"not listed: {key[0]}{' / ' + key[1] if key[1] else ''}: {why}")
    report.append("set-menu repeats dropped: " + ", ".join(sorted(repeats)))
    return out, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder with the ten saved menu pages (<location>.html)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the ten pages into --pages first (11 s apart)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.pages)
    for stem in LOCATIONS:
        f = args.pages / f"{stem}.html"
        if not f.exists():
            raise SystemExit(f"missing {f}: run with --fetch")
        print(f"sha256 {sha256_file(f)}  {f.name}")
    items, holdback, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Burger & Lobster", cuisine="Burgers & lobster", source_title=SOURCE_TITLE,
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback, allergen_guide=None, nutrition_level="calories")
    if not holdback:
        (out / "holdback.csv").unlink(missing_ok=True)
    cats: dict = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    for line in report:
        print("  " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
