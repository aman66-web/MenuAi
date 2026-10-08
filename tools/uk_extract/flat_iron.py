#!/usr/bin/env python3
"""Build data/source/flat-iron/ from Flat Iron's own online menu page (a CALORIES-ONLY chain).

    python3 tools/uk_extract/flat_iron.py --pages DIR --checked-on 2026-10-08 [--out DIR] [--fetch]

DIR holds four saved files: menu.html, allergens.html, style.css and calories.js; --fetch downloads them first (one request each,
one second apart, normal browser user-agent; robots.txt of flatironsteak.co.uk is `User-agent: *` / `Disallow:` = everything allowed,
checked with tools/uk_extract/robots_rfc.py). --out defaults to data/source/flat-iron.

Source (the chain's own pages, https://flatironsteak.co.uk, WordPress):
    https://flatironsteak.co.uk/menu/       the menu; 15 paragraphs with class "calories" print kcal beside dishes
                                            (WordPress REST API says the page was last modified 2026-08-18; no date is shown on it)
    https://flatironsteak.co.uk/allergens/  "Allergens Guide", prints "DATE REVIEWED: 1/7/2026" (modified 2026-07-07)
    https://flatironsteak.co.uk/wp-content/themes/flatiron4/style.css          the theme stylesheet: `.calories { display: none; }`
    https://flatironsteak.co.uk/wp-content/themes/flatiron4/js/calories.js     the page's own script that undoes that rule

HOW A VISITOR SEES THE CALORIES (checked 2026-10-08 with Chromium on the live page): the figures start hidden (stylesheet rule above),
and the footer of the menu has three buttons, "ALLERGENS", "CALORIES" and "SUPPLIERS". Clicking CALORIES (class `toggle-calories`) runs
calories.js, `$('.calories').toggle()`, and all 15 figures appear in italics under their dishes (15 of 15 visible after the click,
0 of 15 before). So the calories ARE published to visitors, behind the chain's own Calories button. (An earlier version of this script,
written 2026-10-07, missed that button and held the data back as "hidden"; that was wrong.) The script checks on every run that the
button and the toggle script are still there, and stops if they are not: a page that hides the figures without a way to show them
would be the founder's call.

What the page prints: calories ONLY, per dish, as sold, with no portion size, no kJ, no protein, carbs, fat, salt, etc. So protein, carbs
and fat stay blank (docs/DATA.md "Calories-only chains": every item is then not rankable). Calories are copied from the page as printed;
only names, categories and tags are typed here (BLOCKS below). The script stops if the page's dishes, their printed lines or the number
of calorie paragraphs differ from this table, so a human re-checks when Flat Iron changes its menu.

How the printed figures are read:
- A calorie paragraph belongs to the paragraph just above it. Two paragraphs print several dishes with one list of values, matched in the
  printed order and checked (same count): "HOUSE FIZZES  Lime & Mint / Apple & Rhubarb / Rose Lemonade" -> "52 / 70 / 58 kcal", and
  "Bearnaise / Peppercorn / Homemade Smoked Chilli Mayo / Wild Mushroom" -> "195 / 55 / 210 / 55 kcal" (the page's own order).
- "Wagyu Steak of the Day" prints a RANGE ("446 - 694 kcal", depends on the cut): not one value for one dish, so it is not listed.
- Roast Aubergine's 420 kcal is printed with the side (5.0); the footnote "* Available as a main - 9.0" has no calories of its own.
- No serving is printed anywhere, so `serving` stays blank. The three 0% cocktails and House Fizzes have no volume.
- Wines, beers and the alcoholic cocktails, soft drinks other than the House Fizzes, and "Blackboard Specials" print no calories.
- Tags: contains_beef when the dish's name says steak or beef (Flat Iron Steak, Homemade Beef Dripping Chips, "Flat Iron Herd Beef"
  burger), or the menu groups it under its own "BEEF specials" heading (35 Day Aged Ribeye). vegetarian only for Green Salad, which the
  chain's own FAQ (https://flatironsteak.co.uk/faqs/) calls "totally vegetarian (but not vegan)". Roast Aubergine and Creamed Spinach are
  NOT tagged: the FAQ says both contain Parmesan made with rennet. Bone Marrow Garlic Mash: animal not stated (no tag).

Allergens (docs/DATA.md "Allergens") are LINK-ONLY. The guide is a name list, not the menu's names, and cannot be matched exactly:
"ALL STEAKS" is one group row (no row for Flat Iron Steak or 35 Day Aged Ribeye by name); "BEEF DRIPPING CHIPS" (menu: Homemade Beef
Dripping Chips); "BONE MARROW MASH" (menu: Crispy Bone Marrow Garlic Mash); "TRUFFLE MAC & CHEESE" (menu: Truffled Macaroni Cheese);
"TONY'S 0% MARGARITA" (menu: Citrus Margarita); "0% PASSIONFRUIT COLLINS" (menu: Virgin Passion Fruit Collins); "GREEN SALAD" and a
separate "GREEN SALAD DRESSING" row (the guide does not say whether the salad's row includes the dressing). Allergens are safety
information: no name matching, no guessing, so only the guide's link is published (all or nothing).
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "flat-iron"
BASE = "https://flatironsteak.co.uk"
PAGES = {  # file name -> url
    "menu.html": BASE + "/menu/",
    "allergens.html": BASE + "/allergens/",
    "style.css": BASE + "/wp-content/themes/flatiron4/style.css",
    "calories.js": BASE + "/wp-content/themes/flatiron4/js/calories.js",
}
SOURCE_URL = BASE + "/menu/"
SOURCE_TITLE = "Flat Iron menu with calories (flatironsteak.co.uk/menu, accessed 2026-10-08, no date shown; page last modified 2026-08-18 per the site's own API)"
ALLERGEN_GUIDE_TITLE = "Flat Iron Allergens Guide (page says: DATE REVIEWED 1/7/2026)"
ALLERGEN_GUIDE_URL = BASE + "/allergens/"
# The guide prints "May contain traces of ..." for many dishes and the sentence "We make every effort to avoid cross-contamination
# but sadly cannot guarantee dishes and drinks are allergen-free": traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Flat Iron's menu page lists calories only (behind its Calories button), per dish, with no portion sizes: protein, carbs "
        "and fat are not published. Wines, beers, alcoholic cocktails and the Wagyu steak of the day (a range) print no single figure.")

STEAK, BEEF, SIDES, SAUCES, ZERO, SOFTS = "Steak", "Beef specials", "Sides", "Sauces", "0% cocktails", "Softs"
EXPECTED_CALORIE_PARAGRAPHS = 15
PRICE_LINE = re.compile(r"^[–—\-\s]*\d+(\.\d+)?[–—\-\s]*$")  # "— 14.0 —", "–– 15.0 ––"

# One entry per paragraph that has a calorie paragraph under it: (h2 section, the paragraph's printed lines without price lines,
# the calorie paragraph's printed text, items in printed order). Item = (printed name, name shown, category, tags, note).
BLOCKS = [
    ("STEAK", ["FLAT IRON STEAK"], "325 kcal",
     [("FLAT IRON STEAK", "Flat Iron Steak", STEAK, ["contains_beef"], "Name says steak. Printed 15.0 under STEAK; no weight printed")]),
    ("BEEF specials", ["Smashed Onion Double Cheeseburger", "Flat Iron Herd Beef"], "796 kcal",
     [("Smashed Onion Double Cheeseburger", "Smashed Onion Double Cheeseburger", BEEF, ["contains_beef"],
       "Menu line says 'Flat Iron Herd Beef'; printed 14.0")]),
    ("BEEF specials", ["35 Day Aged Ribeye"], "416 kcal",
     [("35 Day Aged Ribeye", "35 Day Aged Ribeye", BEEF, ["contains_beef"],
       "Sits under the menu's own 'BEEF specials' heading; the name does not say beef or steak. Printed 20.0")]),
    ("Sides", ["Homemade Beef Dripping Chips"], "490kcal",
     [("Homemade Beef Dripping Chips", "Homemade Beef Dripping Chips", SIDES, ["contains_beef"], "Name says beef dripping. Printed 4.5")]),
    ("Sides", ["Crispy Bone Marrow Garlic Mash"], "543kcal",
     [("Crispy Bone Marrow Garlic Mash", "Crispy Bone Marrow Garlic Mash", SIDES, [], "Bone marrow: the animal is not stated, so no meat tag. Printed 5.0")]),
    ("Sides", ["Creamed Spinach"], "425kcal",
     [("Creamed Spinach", "Creamed Spinach", SIDES, [], "FAQ says it contains Parmesan made with rennet, so not tagged vegetarian. Printed 4.5")]),
    ("Sides", ["Green Salad"], "210kcal",
     [("Green Salad", "Green Salad", SIDES, ["vegetarian"], "Vegetarian tag from the chain's FAQ ('totally vegetarian (but not vegan)'), not from the menu page. Printed 3.5")]),
    ("Sides", ["Truffled Macaroni Cheese"], "525kcal",
     [("Truffled Macaroni Cheese", "Truffled Macaroni Cheese", SIDES, [], "Printed 5.5")]),
    ("Sides", ["Roast Aubergine*", "Tomato, basil, mozzarella"], "420kcal",
     [("Roast Aubergine*", "Roast Aubergine", SIDES, [],
       "Value printed with the side (5.0); footnote '* Available as a main - 9.0' has no calories. FAQ says Parmesan with rennet: not tagged vegetarian")]),
    ("Sauces", ["Bearnaise / Peppercorn", "Homemade Smoked Chilli Mayo / Wild Mushroom"], "195 / 55 / 210 / 55 kcal",
     [("Bearnaise", "Bearnaise sauce", SAUCES, [], "One list of 4 values, matched in printed order; printed 1.5"),
      ("Peppercorn", "Peppercorn sauce", SAUCES, [], "One list of 4 values, matched in printed order; printed 1.5"),
      ("Homemade Smoked Chilli Mayo", "Homemade Smoked Chilli Mayo", SAUCES, [], "One list of 4 values, matched in printed order; printed 1.5"),
      ("Wild Mushroom", "Wild Mushroom sauce", SAUCES, [], "One list of 4 values, matched in printed order; printed 1.5")]),
    ("Cocktails", ["Citrus Margarita", "Lemon, lime, orange, hibiscus"], "91kcal",
     [("Citrus Margarita", "Citrus Margarita", ZERO, [], "Under '0% COCKTAILS — 5.0'")]),
    ("Cocktails", ["Virgin Passion Fruit Collins", "Passion fruit, vanilla, lime, soda"], "86kcal",
     [("Virgin Passion Fruit Collins", "Virgin Passion Fruit Collins", ZERO, [], "Under '0% COCKTAILS — 5.0'")]),
    ("Cocktails", ["Sober Mule", "0% rum, pineapple, makrut lime, ginger beer"], "54kcal",
     [("Sober Mule", "Sober Mule", ZERO, [], "Under '0% COCKTAILS — 5.0'")]),
    ("Softs", ["HOUSE FIZZES", "Lime & Mint / Apple & Rhubarb / Rose Lemonade"], "52 / 70 / 58 kcal",
     [("Lime & Mint", "Lime & Mint House Fizz", SOFTS, [], "One list of 3 values, matched in printed order"),
      ("Apple & Rhubarb", "Apple & Rhubarb House Fizz", SOFTS, [], "One list of 3 values, matched in printed order"),
      ("Rose Lemonade", "Rose Lemonade House Fizz", SOFTS, [], "One list of 3 values, matched in printed order")]),
]
# Calorie paragraphs we read and deliberately do not list: (section, printed lines) -> (printed value, why).
EXCLUDED = {
    ("BEEF specials", ("Wagyu Steak of the Day", "Ask your server for today’s cut")):
        ("446 – 694 kcal", "a range that depends on the cut, not one value for one dish"),
}
CALORIES_RE = re.compile(r"^(\d+(?: / \d+)*)\s*kcal$")


class MenuParser(HTMLParser):
    """Collects the text of every <h2> and <p> inside <main> (line breaks kept) with its classes, in page order."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.skip = 0
        self.cur = None
        self.blocks: list[dict] = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self.in_main = True
            return
        if not self.in_main:
            return
        if tag in ("script", "style", "svg"):
            self.skip += 1
        elif tag in ("h2", "p") and self.cur is None:
            self.cur = {"tag": tag, "classes": (a.get("class") or "").split(), "text": []}
        elif tag == "br" and self.cur is not None:
            self.cur["text"].append("\n")

    def handle_endtag(self, tag):
        if not self.in_main:
            return
        if tag == "main":
            self.in_main = False
        elif tag in ("script", "style", "svg") and self.skip:
            self.skip -= 1
        elif self.cur is not None and tag == self.cur["tag"]:
            raw = "".join(self.cur["text"]).replace("\xa0", " ")
            lines = [" ".join(ln.split()) for ln in raw.split("\n")]
            self.blocks.append({"tag": self.cur["tag"], "classes": self.cur["classes"], "lines": [ln for ln in lines if ln]})
            self.cur = None

    def handle_data(self, data):
        if self.in_main and not self.skip and self.cur is not None:
            self.cur["text"].append(data)


def read_calorie_blocks(html: str) -> list[tuple[str, list[str], str]]:
    """-> [(h2 section, the paragraph's lines above the calories without price lines, calorie text)] in page order."""
    parser = MenuParser()
    parser.feed(html)
    out = []
    section, prev = "", None
    for b in parser.blocks:
        if b["tag"] == "h2":
            section, prev = " ".join(b["lines"]), None
        elif "calories" in b["classes"]:
            if prev is None:
                raise SystemExit("A calorie paragraph has no dish paragraph above it: the page layout changed, re-check the page.")
            if len(b["lines"]) != 1:
                raise SystemExit(f"Calorie paragraph with {len(b['lines'])} lines under {prev['lines']}: layout changed.")
            out.append((section, [ln for ln in prev["lines"] if not PRICE_LINE.match(ln)], b["lines"][0]))
        else:
            prev = b
    return out


def has_calorie_button(html: str, js: str) -> bool:
    """True when the menu page still has its CALORIES button (class toggle-calories) and calories.js still toggles .calories."""
    button = re.search(r'class="[^"]*\btoggle-calories\b[^"]*".*?<a href="#">CALORIES</a>', html, re.S) is not None
    toggles = re.search(r"\.toggle-calories['\"]\)\.click\(.*?\$\(['\"]\.calories['\"]\)\.toggle\(\)", js, re.S) is not None
    return button and toggles


def build_items(found: list[tuple[str, list[str], str]]) -> tuple[list[dict], list[str]]:
    if len(found) != EXPECTED_CALORIE_PARAGRAPHS:
        raise SystemExit(f"The menu page has {len(found)} calorie paragraphs, expected {EXPECTED_CALORIE_PARAGRAPHS}: the menu changed, re-check BLOCKS.")
    table = {(sec, tuple(lines)): (kcal, items) for sec, lines, kcal, items in BLOCKS}
    if len(table) != len(BLOCKS):
        raise SystemExit("BLOCKS has a duplicate (section, lines)")
    seen, built, report = set(), {}, []
    for sec, lines, kcal_text in found:
        key = (sec, tuple(lines))
        if key in EXCLUDED:
            printed, why = EXCLUDED[key]
            if kcal_text != printed:
                raise SystemExit(f"{key}: printed {kcal_text!r}, expected {printed!r}: re-check")
            report.append(f"not listed: {lines[0]!r} prints {printed!r} ({why})")
            seen.add(key)
            continue
        if key not in table:
            raise SystemExit(f"Dish paragraph {key} is not in BLOCKS (renamed, added or moved): update BLOCKS after reading the page.")
        expected_kcal, specs = table[key]
        if kcal_text != expected_kcal:
            raise SystemExit(f"{key}: the page now prints {kcal_text!r}, the table expects {expected_kcal!r}: re-read the page, then update BLOCKS.")
        m = CALORIES_RE.match(kcal_text)
        if not m:
            raise SystemExit(f"{key}: calorie text {kcal_text!r} is not 'N kcal' or 'N / N kcal'")
        values = m.group(1).split(" / ")
        if len(values) != len(specs):
            raise SystemExit(f"{key}: {len(values)} values for {len(specs)} dishes")
        text = " / ".join(lines)
        pos = -1
        for printed, *_ in specs:  # the dishes must appear in the printed text in this order (positional matching)
            nxt = text.find(printed, pos + 1)
            if nxt < 0:
                raise SystemExit(f"{key}: printed name {printed!r} not found after position {pos} in {text!r}")
            pos = nxt
        built[key] = []
        for value, (printed, name, cat, tags, note) in zip(values, specs):
            built[key].append({"name": name, "category": cat, "calories": value, "tags": "|".join(tags), "rankable": False,
                               "notes": f"Printed '{printed}' {kcal_text}; {note}"})
            if "animal is not stated" in note:
                report.append(f"meat type not stated: {name}")
        seen.add(key)
    missing = [k for k in list(table) + list(EXCLUDED) if k not in seen]
    if missing:
        raise SystemExit(f"In the table but no longer on the page: {missing}")
    items = [it for sec, lines, _, _ in BLOCKS for it in built[(sec, tuple(lines))]]  # menu order we want, not the page's column order
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    return items, report


def fetch(url: str, dest: Path) -> None:
    subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A",
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
                    "-o", str(dest), url], check=True)
    time.sleep(1)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--out", type=Path, default=None, help="folder to write (default data/source/flat-iron)")
    ap.add_argument("--fetch", action="store_true", help="download the four files into --pages first")
    args = ap.parse_args()
    args.pages.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        for fname, url in PAGES.items():
            fetch(url, args.pages / fname)
    for fname in PAGES:
        if not (args.pages / fname).exists():
            raise SystemExit(f"{args.pages / fname} is missing: run with --fetch (or save the page from {PAGES[fname]})")
        print(f"{fname} sha256 {sha256_file(args.pages / fname)}")
    found = read_calorie_blocks((args.pages / "menu.html").read_text(encoding="utf-8"))
    items, report = build_items(found)
    allergens = (args.pages / "allergens.html").read_text(encoding="utf-8")
    allergen_text = " ".join(re.sub(r"<[^>]+>", "", allergens).split())  # the date is split by a <strong> tag in the HTML
    if "DATE REVIEWED: 1/7/2026" not in allergen_text:
        raise SystemExit("The allergen guide's 'DATE REVIEWED' changed: update ALLERGEN_GUIDE_TITLE and re-read the guide.")
    if "May contain traces of" not in allergen_text:
        raise SystemExit("The allergen guide no longer prints 'May contain traces of': set MAY_CONTAIN_PUBLISHED to False after reading it.")
    if not has_calorie_button((args.pages / "menu.html").read_text(encoding="utf-8"), (args.pages / "calories.js").read_text(encoding="utf-8")):
        raise SystemExit("The menu page no longer has its CALORIES button (class toggle-calories) wired to calories.js: the figures may be hidden "
                         "from visitors. Open https://flatironsteak.co.uk/menu/ in a browser; publishing hidden figures is the founder's call.")
    print("CALORIES button and calories.js toggle found: visitors can show the figures with one click.")
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Flat Iron", cuisine="Steakhouse", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["flat iron", "flat iron steak", "flat iron steak restaurant"],
                             items=items, out=args.out, note=NOTE, allergen_guide=guide,
                             nutrition_level="calories")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
