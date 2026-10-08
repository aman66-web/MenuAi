#!/usr/bin/env python3
"""Build data/source/bistrot-pierre/ from Bistrot Pierre's own allergen pages (a CALORIES-ONLY chain with complete allergens).

    python3 tools/uk_extract/bistrot_pierre.py --checked-on 2026-10-08 [--pages DIR] [--fetch] [--out DIR]

Source: the six menu pages https://www.bistrotpierre.co.uk/allergens/ links (hosted by Ten Kites on viewthe.menu, one page per menu):
    hwyv All Day Menu & Menu Pierre   hwdv Breakfast menu   hwuv French Afternoon Tea (for two)
    hw2v Petit Pierre (the chain's "Menu Enfants")   hw7v Bar Pierre (the chain's "Bar Menu")   hw8v Soiree Gastronomique (22 Sept 2026)
--fetch saves each page once into --pages (one request per second, a browser User-Agent; robots.txt of viewthe.menu disallows only
/fonts/, /views/ and /*.less and is checked before every download); without --fetch the saved pages are read. The pages show no menu
date (only the time the page was generated), so the title says "accessed <checked-on>, no date shown". Python 3.9 compatible; standard
library only.

What the pages print. Each dish row carries the 14 allergen columns (a tick = contains, "M" = may contain), the vegan / vegetarian
columns, and a nutrition column "Energy (kCal)" under the header "Nutrition values per serving". The nutrition column is not
visible when the page opens, but the page's own button "View nutrition information" reveals it for any visitor (checked in a browser:
clicking it shows every value; `k10.settings.ShowNutrients` is true on the five published pages). Only energy is printed: no protein,
carbs, fat, kJ, salt or weights, so this is a calories-only chain (docs/DATA.md "Calories-only chains"): `calories` is the only
nutrient, copied as printed ("1,401" -> 1401), and every item is not rankable. The pages state no portion size: `serving` stays blank.
Every dish also prints a "Contains:" / "May contain:" line (cereals and tree nuts named in brackets) and the label ids behind the
page's own allergen filter; tenkites_b.allergens_from_rec requires all three forms to agree for every dish or the run stops, so
allergens.csv is complete for every published item. The row's `data-calories` attribute is a second printed copy of the energy and must
equal the visible figure, and the card's "Suitable for:" line must agree with the ticked Vegan / Vegetarian columns.

Scope (the run stops if a page's title, section list or row count changes):
  published   the five menus above, 132 rows printed, 130 listed (see below).
  not listed  Soiree Gastronomique (hw8v): a one-off event menu on 22 September 2026 whose page prints no nutrition at all (its
              `ShowNutrients` setting is false and it has no "View nutrition information" button): the run checks it stays that way.
  left out    "Ice Cream & Sorbet (Allergens for Icecream and Sorbet flavours are listed below)": a heading row for the flavour rows
              under it (its 905 kcal matches no serving and no sum of the flavours), not a dish. The flavours are listed.
  held back   Cafe Gourmand (358 kcal): the same page prints its four parts as 121 + 115 + 282 + 82 = 600 kcal.
              Lemon Sorbet (0 kcal): the same page prints 68 and 82 kcal for two other sorbets.
              Nothing is corrected: holdback.csv keeps them out of the published menu (docs/DATA.md).
  names       as printed, with ALL-CAPS words set in capitals-then-lower-case (the page prints most dish names in capitals), the dish
              type added where the section title carries it ("HAM & CHEESE" under BAGUETTES -> "Ham & Cheese Baguette"), and a menu or
              section suffix only where two different rows share a name ("Houmous (Petit Pierre)"). A row printed on two menus with the
              same name, energy and allergens is one item.
  tags        vegetarian only where the page ticks Vegetarian or Vegan; contains_pork / contains_beef only where the dish name or
              description says so (tenkites_b.diet_tags, plus "jambon"). A dish the page ticks vegetarian whose own description names
              pork or beef gets no diet tags (the French BLT Salad: "smoked bacon lardons").
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.request
import urllib.robotparser
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_b as tb  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "bistrot-pierre"
SITE = "https://viewthe.menu"
ALLERGENS_PAGE = "https://www.bistrotpierre.co.uk/allergens/"
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")

# label -> (page id, the page's own <title>, dish rows expected, short menu name). Page order = the order categories are shown.
MENUS = {
    "allday": ("hwyv", "All Day Menu & Menu Pierre", 66, "All Day"),
    "breakfast": ("hwdv", "Breakfast menu", 28, "Breakfast"),
    "tea": ("hwuv", "French Afternoon Tea (for two)", 1, "Afternoon Tea"),
    "kids": ("hw2v", "Petit Pierre", 13, "Petit Pierre"),
    "bar": ("hw7v", "Bar Pierre", 24, "Bar Pierre"),
}
# Checked, never published: the page must still print no nutrition at all.
NO_NUTRITION = {"soiree": ("hw8v", "Soirée Gastronomique - 22nd September 2026", 8)}
# Who keeps the plain name when two different rows share a name (adult menus first, the kids' menu last).
MENU_RANK = {"allday": 0, "bar": 1, "breakfast": 2, "tea": 3, "kids": 4}
LONG = {k: v[3] for k, v in MENUS.items()}
SHORT = dict(LONG)

# (menu, printed section) -> category shown. A new section stops the run.
CATEGORY = {
    ("allday", "PETIT PLATS"): "Petit plats", ("allday", "ENTRÉES"): "Entrées", ("allday", "FRITES & STEAKS"): "Frites & steaks",
    ("allday", "PLATS"): "Plats", ("allday", "ACCOMPAGNEMENTS"): "Accompagnements", ("allday", "DESSERTS"): "Desserts",
    ("breakfast", "Menu Complet"): "Breakfast: menu complet", ("breakfast", "Lighter Options"): "Breakfast: lighter options",
    ("breakfast", "Accompagnements"): "Breakfast: accompagnements", ("breakfast", "Kids Breakfast"): "Breakfast: kids",
    ("tea", "Afternoon Tea"): "Afternoon tea",
    ("kids", "STARTERS"): "Petit Pierre (kids): starters", ("kids", "MAINS"): "Petit Pierre (kids): mains",
    ("kids", "DESSERTS"): "Petit Pierre (kids): desserts",
    ("bar", "PETIT PLATS"): "Bar Pierre: petit plats", ("bar", "BAGUETTES"): "Bar Pierre: baguettes", ("bar", "PLATS"): "Bar Pierre: plats",
}
# (menu, printed section, printed name) -> the name shown, where the section title carries the dish type the name lacks.
NAME_OVERRIDES = {
    ("bar", "BAGUETTES", "HAM & CHEESE"): "Ham & Cheese Baguette",
    ("bar", "BAGUETTES", "SMOKED SALMON"): "Smoked Salmon Baguette",
}
# (menu, printed section, printed name) -> why it is not listed at all.
LEFT_OUT = {
    ("allday", "DESSERTS", "Ice Cream & Sorbet (Allergens for Icecream and Sorbet flavours are listed below)"):
        "a heading row for the flavour rows under it (905 kcal matches no serving or sum of the flavours), not a dish",
}
# (menu, printed section, printed name) -> why the printed row is held back (listed in items.csv, not published).
HOLDBACK = {
    ("allday", "DESSERTS", "CAFÉ GOURMAND"):
        "Printed 358 kcal, but the same page prints its four parts (Macaron 121, Brulee Tart 115, Chocolate Mousse 282, Mango sorbet 82) as 600 kcal together",
    ("allday", "DESSERTS", "Lemon Sorbet"):
        "Printed 0 kcal for a sorbet, while the same page prints 68 kcal for Raspberry Sorbet and 82 kcal for the Mango sorbet in Cafe Gourmand",
    ("allday", "PETIT PLATS", "HOUMOUS"):
        "Allergen row contradicts the dish: the All Day / Bar Pierre menus describe it as 'Haricot blanc houmous, sourdough, harissa, toasted "
        "seeds' and mark no sesame (not even may contain), while the same chain's Petit Pierre page marks Sesame Seeds as contained in its "
        "'Haricot blanc houmous' (re-read 2026-10-08)",
    ("allday", "PLATS", "LAMB TAGINE"):
        "Allergen row contradicts the dish's own description: 'mint yoghurt' is named but the row marks no milk (not even may contain; "
        "it marks soya, so the yoghurt might be a soya one, but the page does not say). Not published until the chain's page says which "
        "(re-read 2026-10-08)",
}
NOTE = ("Calories only, per serving, from Bistrot Pierre's own allergen pages (shown with 'View nutrition information'): protein, carbs, fat "
        "and portion sizes are not published. Drinks and the one-off Soirée Gastronomique menu are not in the guide. The afternoon tea page is "
        "titled 'for two' and doesn't say whether its figure is for one or two people.")
SOURCE_TITLE = ("Bistrot Pierre allergen and nutrition pages: All Day, Breakfast, Afternoon Tea, Petit Pierre and Bar Pierre menus "
                "(viewthe.menu/hwyv, hwdv, hwuv, hw2v, hw7v, linked from bistrotpierre.co.uk/allergens; accessed {d}, no date shown)")
ALLERGEN_TITLE = ("Bistrot Pierre allergen guide: All Day, Breakfast, Afternoon Tea, Petit Pierre and Bar Pierre menus "
                  "(viewthe.menu pages linked from bistrotpierre.co.uk/allergens; accessed {d}, no date shown)")

SMALL_WORDS = {"au", "aux", "de", "des", "du", "en", "la", "le", "les", "et", "on", "in", "of", "with", "and", "a"}
KEEP_UPPER = {"BLT"}
JAMBON = re.compile(r"\bjambon\b", re.I)  # French for ham: the name says it


# ---------------------------------------------------------------- fetching
def _robots() -> urllib.robotparser.RobotFileParser:
    req = urllib.request.Request(SITE + "/robots.txt", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(text.splitlines())
    return rp


def fetch_pages(dest: Path) -> None:
    """Save every page once (one request per second). Stops if robots.txt disallows a page."""
    dest.mkdir(parents=True, exist_ok=True)
    rp = _robots()
    pages = [(label, v[0]) for label, v in MENUS.items()] + [(label, v[0]) for label, v in NO_NUTRITION.items()]
    for label, pid in pages:
        url = f"{SITE}/{pid}"
        if not rp.can_fetch(USER_AGENT, url):
            raise SystemExit(f"robots.txt disallows {url}: not fetched")
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(3):  # a dropped connection is retried, still one request at a time
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    (dest / f"{pid}.html").write_bytes(resp.read())
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(5)
        time.sleep(1.1)


# ---------------------------------------------------------------- reading
def tidy(name: str) -> str:
    """Printed name with typographic tidying only: spaces collapsed, ALL-CAPS words set in capitals-then-lower-case ('SALADE VERTE'
    -> 'Salade Verte', '8OZ SIRLOIN' -> '8oz Sirloin'), small words ('au', 'on', 'with') kept lower case after the first word."""
    out: List[str] = []
    for i, word in enumerate(re.sub(r"\s+", " ", name).strip().rstrip(".").split(" ")):
        letters = [c for c in word if c.isalpha()]
        if len(letters) >= 2 and all(c.isupper() for c in letters) and word not in KEEP_UPPER:
            parts = []
            for p in word.split("-"):
                low = p.lower()
                parts.append(low if (i > 0 and low in SMALL_WORDS) else (low[:1].upper() + low[1:] if low[:1].isalpha() else low))
            word = "-".join(parts)
        out.append(word)
    return " ".join(out)


def _page_checks(path: Path, label: str, pid: str, title: str, nutrition: bool) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    got = tb.page_title(path)
    if got != title:
        raise SystemExit(f"{label} ({pid}): the page title is {got!r}, expected {title!r}: the menu behind this page changed")
    shows = "ShowNutrients = 'true' === 'true'" in text
    button = "k10-toolbar__button_nutrition" in text and "View nutrition information" in text
    header = "Nutrition values per serving" in text and "Energy (kCal)" in text
    if nutrition and not (shows and button and header):
        raise SystemExit(f"{label} ({pid}): the page no longer offers 'View nutrition information' with 'Nutrition values per serving' "
                         f"(setting {shows}, button {button}, header {header}): re-read the page before publishing")
    if not nutrition and (shows or button or "Energy (kCal)" in text):
        raise SystemExit(f"{label} ({pid}): this page used to print no nutrition and now offers some: re-read it and add it to MENUS")


def _suitable_lines(path: Path) -> List[List[str]]:
    """The card's 'Suitable for:' line of every dish row, in page order (a second printed copy of the Vegan / Vegetarian ticks)."""
    root = tb.parse_html(path.read_text(encoding="utf-8", errors="replace"))
    out: List[List[str]] = []
    for w in root.find_all("k10-recipe__wrapper"):
        found: List[str] = []
        box = w.find("k10-recipe__label-names-wrapper")
        for line in [c for c in (box.children if box else []) if isinstance(c, tb.Node)]:
            txt = tb._clean(line.text())
            head, sep, rest = txt.partition(":")
            if sep and head.strip().lower() == "suitable for":
                found += [x.strip() for x in rest.split(",") if x.strip()]
        out.append(sorted(found))
    return out


def _row_calories(path: Path) -> List[str]:
    """The `data-calories` attribute of every dish row, in page order (a second printed copy of the energy)."""
    root = tb.parse_html(path.read_text(encoding="utf-8", errors="replace"))
    out = []
    for w in root.find_all("k10-recipe__wrapper"):
        row = w.find(attr="data-all-labels")
        out.append((row.attrs.get("data-calories", "") if row is not None else "").replace(",", "").strip())
    return out


def read_menu(path: Path, label: str) -> List[dict]:
    pid, title, expected, _ = MENUS[label]
    _page_checks(path, label, pid, title, True)
    layout, recs = tb.read_menu(path)
    if layout != "table":
        raise SystemExit(f"{label}: expected the 'table' layout, found {layout!r}: the page format changed")
    if len(recs) != expected:
        raise SystemExit(f"{label}: the page has {len(recs)} dish rows but this script expects {expected}: the menu changed, "
                         "re-check CATEGORY, NAME_OVERRIDES, LEFT_OUT and HOLDBACK before running again.")
    suitable, attr_kcal = _suitable_lines(path), _row_calories(path)
    if len(suitable) != len(recs) or len(attr_kcal) != len(recs):
        raise SystemExit(f"{label}: the dish rows and their cards do not line up")
    for rec, suit, attr in zip(recs, suitable, attr_kcal):
        where = f"{label} / {rec['name']}"
        if list(rec["nutrients"]) != ["Energy (kCal)"]:
            raise SystemExit(f"{where}: nutrient columns are {list(rec['nutrients'])}, expected only Energy (kCal): map any new column first")
        raw = rec["nutrients"]["Energy (kCal)"]
        if not re.fullmatch(r"\d{1,3}(,\d{3})*|\d+", raw):
            raise SystemExit(f"{where}: energy printed as {raw!r}, not a whole number")
        if attr != raw.replace(",", ""):
            raise SystemExit(f"{where}: the row's data-calories {attr!r} disagrees with the printed {raw!r}")
        ticked = sorted(x for x in rec["yes_labels"] if x in ("Vegan", "Vegetarian"))
        if suit != ticked:
            raise SystemExit(f"{where}: 'Suitable for' line {suit} disagrees with the ticked columns {ticked}")
        rec["menu"], rec["section"], rec["kcal"] = label, (rec["course"][-1] if rec["course"] else ""), raw.replace(",", "")
        if len(rec["course"]) != 1 or (label, rec["section"]) not in CATEGORY:
            raise SystemExit(f"{where}: section {rec['course']!r} is not mapped: add it to CATEGORY after checking the page")
    return recs


# ---------------------------------------------------------------- building
def allergen_key(a: dict) -> tuple:
    return tuple(tuple(sorted(a[k])) for k in ("contains", "may_contain", "cereals", "nuts"))


def build(pages: Dict[str, Path]) -> Tuple[List[dict], List[Tuple[str, str]], List[str]]:
    """(items, holdback rows, report lines)."""
    rows: Dict[tuple, dict] = {}
    left_out: List[str] = []
    report: List[str] = []
    seen_special = set()
    for label in MENUS:
        for rec in read_menu(pages[label], label):
            where = f"{label} / {rec['name']}"
            special = (label, rec["section"], rec["name"])
            if special in LEFT_OUT:
                seen_special.add(special)
                left_out.append(f"{rec['name']!r} ({label}): {LEFT_OUT[special]}")
                continue
            allergens = tb.allergens_from_rec(rec, where)
            if allergens is None:
                raise SystemExit(f"{where}: does not carry all 14 allergen columns")
            # tb.allergens_from_rec leaves out of may_contain whatever the dish already contains. Put the page's own may-contain keys
            # back (Houmous: contains Cereals (Wheat), may contain Cereals (Barley, Oats, Rye)), so that common.write_allergens
            # sees both lines and publishes the generic allergen without naming only the contained kinds.
            if rec["allergen_src"].get("contains") is not None and rec["allergen_src"].get("may"):
                raw_may, _, _ = tb._printed_list(rec["allergen_src"]["may"], where, None)
                allergens["may_contain"] = set(allergens["may_contain"]) | raw_may
            name = NAME_OVERRIDES.get(special) or tidy(rec["name"])
            if special in NAME_OVERRIDES:
                seen_special.add(special)
            veg = bool({"Vegetarian", "Vegan"} & set(rec["yes_labels"]))
            text = " ".join([rec["name"], rec["desc"]])
            tags, conflict = tb.diet_tags(text, veg)
            if JAMBON.search(text) and not veg and "contains_pork" not in tags:
                tags = "|".join(x for x in (tags, "contains_pork") if x)
            notes = [f"{label}: {rec['section']}", f"printed '{rec['name']}'" if name != rec["name"] else ""]
            if conflict:
                notes.append(conflict)
            if "Vegan" in rec["yes_labels"] and {"milk", "eggs"} & allergens["contains"]:
                notes.append("page ticks Vegan but its allergen columns say contains " + ", ".join(sorted({"milk", "eggs"} & allergens["contains"])))
            key = (tb.norm_name(name), rec["kcal"], allergen_key(allergens))
            if key in rows:  # the same row printed on another menu
                rows[key]["menus"].append(label)
                continue
            rows[key] = {"name": name, "menus": [label], "where": tidy(rec["section"]), "category": CATEGORY[(label, rec["section"])],
                         "kcal": rec["kcal"], "allergens": allergens, "tags": tags, "notes": [n for n in notes if n],
                         "special": special, "printed": rec["name"]}
    for table in (LEFT_OUT, NAME_OVERRIDES, HOLDBACK):
        gone = [k for k in table if k not in seen_special and k not in {r["special"] for r in rows.values()}]
        if gone:
            raise SystemExit(f"{gone} is no longer on the pages (the menu changed): update LEFT_OUT / NAME_OVERRIDES / HOLDBACK")
    row_list = list(rows.values())
    tb.unique_names(row_list, MENU_RANK, SHORT, LONG)
    items: List[dict] = []
    holdback: List[Tuple[str, str]] = []
    for r in row_list:
        item_id = slug(tb.fold(r["name"]))
        notes = list(r["notes"])
        if len(r["menus"]) > 1:
            notes.append("also printed identically on: " + ", ".join(LONG[m] for m in r["menus"][1:]))
        if r["special"] in HOLDBACK:
            holdback.append((item_id, HOLDBACK[r["special"]]))
        items.append({"id": item_id, "name": r["name"], "category": r["category"], "serving": "", "calories": r["kcal"], "tags": r["tags"],
                      "rankable": False, "notes": "; ".join(notes), "allergens": r["allergens"]})
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two items share an id: extend NAME_OVERRIDES")
    names = [i["name"] for i in items]
    if len(set(tb.norm_name(n) for n in names)) != len(names):
        raise SystemExit("two items share a name: extend NAME_OVERRIDES")
    held = {h[0] for h in holdback}
    if len(held) != len(HOLDBACK):
        raise SystemExit("a HOLDBACK row was not found among the items")
    report += left_out
    return items, holdback, report


def content_hash(items: List[dict]) -> str:
    keep = [dict(i) for i in items]
    for k in keep:
        a = k.get("allergens") or {}
        k["allergens"] = {x: sorted(a.get(x, ())) for x in ("contains", "may_contain", "cereals", "nuts")}
    return hashlib.sha256(json.dumps(keep, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path("/tmp/bistrot-pierre-pages"))
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch:
        fetch_pages(args.pages)
    pages = {label: args.pages / f"{v[0]}.html" for label, v in MENUS.items()}
    for label, (pid, title, _) in NO_NUTRITION.items():
        pages[label] = args.pages / f"{pid}.html"
    for p in pages.values():
        if not p.exists():
            print(f"{p} is missing: run with --fetch", file=sys.stderr)
            return 1
    for label, (pid, title, _) in NO_NUTRITION.items():
        _page_checks(pages[label], label, pid, title, False)
    items, holdback, report = build(pages)
    guide = {"title": ALLERGEN_TITLE.format(d=args.checked_on), "url": ALLERGENS_PAGE, "checked_on": args.checked_on, "may_contain_published": True}
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Bistrot Pierre", cuisine="French", source_title=SOURCE_TITLE.format(d=args.checked_on), source_url=ALLERGENS_PAGE,
        checked_on=args.checked_on, aliases=["bistrot pierre", "bistrotpierre"], items=items, out=args.out, note=NOTE, holdback=holdback,
        allergen_guide=guide, nutrition_level="calories")
    for label, p in pages.items():
        print(f"{label:9} sha256 {sha256_file(p)}  {tb.page_title(p)}")
    print(f"extracted content sha256 {content_hash(items)}")
    print("\n".join("left out: " + r for r in report))
    print("\n".join(tb.ALLERGEN_NOTES))
    by_cat: Dict[str, int] = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {folder}: " + ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
