#!/usr/bin/env python3
"""Build data/source/blacklock/ from Blacklock's own allergy and nutrition page (a CALORIES-ONLY chain with complete allergens).

    python3 tools/uk_extract/blacklock.py --checked-on 2026-10-08 [--pages DIR] [--fetch] [--out DIR]

Source: https://viewthe.menu/by8v, the page Blacklock's own menus page (https://theblacklock.com/menus/) links as "Click here to view our
full allergy and nutrition list" (a Ten Kites page). It has a menu selector with two menus, which this script reads both of:
    main    "Autumn 2026 Menu Manchester" (the page's own description: "Set Menu Template for all locations")   https://viewthe.menu/by8v
    sunday  "Sunday Main"                                                                                         https://viewthe.menu/by8v?mguid=ccc23017-143d-467e-95d2-038c799b8dd4
--fetch saves each page once into --pages (one request per second, a browser User-Agent; robots.txt of viewthe.menu is read first and
checked with the RFC 9309 matcher: it disallows only /fonts/, /views/ and /*.less$); without --fetch the saved pages are read. The
pages show no menu date, so the title says "accessed <checked-on>, no date shown". Python 3.9 compatible; standard library only.

What the page prints. Each dish row carries the 14 allergen columns (a tick = contains, "M" = may contain) and one nutrition column,
"Energy (kCal)", under "Nutrition values per serving" (hidden until the page's own "View nutrition information" button is pressed). Each
dish's card repeats it in two tables, "per 100g" and "per serving"; only the per-serving figure is used (the row must equal the card's
per-serving table and the row's `data-calories`), the per-100g figure is never read into the data. No protein, carbs, fat, kJ, salt or
weights exist anywhere on the page, so this is a calories-only chain (docs/DATA.md "Calories-only chains"): `calories` is the only
nutrient, copied as printed ("1,144" -> 1144), every item is not rankable, and `serving` stays blank (the page states no portion).
Every dish prints its allergens in three forms (the 14 columns, the card's "Contains:" / "May contain:" lines with cereals and tree nuts
named, and the label ids behind the page's own allergen filter); tenkites_b.allergens_from_rec requires all three to agree for every
dish or the run stops, so allergens.csv is complete for every published item. A dish that ticks nothing prints a complete ingredient
list that names no allergen: it is published with "contains: none" exactly as the page marks it. The page has no Vegan / Vegetarian
column, so no item is tagged vegetarian.

Scope (the run stops if a page's title, menu list, section list or row count changes):
  published   both menus: 61 + 21 rows printed, 72 items after the rows the two menus print identically are merged (4 starters, 5
              sauces and Creamed Spinach, with the same energy and allergens, are one item each, listed under the Autumn menu's section).
  not listed  drinks, cocktails, beers, wines and everything else on the chain's PDF menus: those print no calories (the PDFs were read).
  names       exactly as the page prints them (internal tags such as "MNC", "26" and "2024" and the page's own typos are kept: the
              chain's recipe names). A name clash between the two menus would be told apart with the menu name (none today).
  tags        no vegetarian tag (the page has no such mark). contains_pork / contains_beef only where the dish's name or its printed
              ingredient list names pork (incl. pig's head) or beef (incl. steak, sirloin, rib-eye, beef stock, beef dripping), as
              tenkites_b.diet_tags reads it. Bavette, Rump Cap and Blacklock Fillet name a cut and no animal: "meat type not stated".
  held back   nothing: no row's own figures are impossible or contradicted by the page.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, List, Tuple

sys.path.insert(0, str(Path(__file__).parent))
import blacklock_pages as bp  # noqa: E402
import robots_rfc  # noqa: E402
import tenkites_b as tb  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "blacklock"
SITE = "https://viewthe.menu"
PAGE_PATH = "/by8v"
PAGE_URL = SITE + PAGE_PATH
CHAIN_MENUS_PAGE = "https://theblacklock.com/menus/"
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")

# label -> (menu guid the selector gives it, the page's own <title>, dish rows expected, short menu name). Page order = category order.
MENUS = {
    "main": ("0986dfd1-a440-42db-b653-d64ccc198933", "Autumn 2026 Menu Manchester", 61, "Autumn menu"),
    "sunday": ("ccc23017-143d-467e-95d2-038c799b8dd4", "Sunday Main", 21, "Sunday"),
}
MENU_RANK = {"main": 0, "sunday": 1}
LONG = {k: v[3] for k, v in MENUS.items()}
SHORT = dict(LONG)

# (menu, printed section path) -> category shown. A new or renamed section stops the run.
CATEGORY = {
    ("main", ("Blacklock", "PRE CHOP BITES")): "Pre chop bites",
    ("main", ("Blacklock", "STARTERS")): "Starters",
    ("main", ("Blacklock", "PARTICULARLY GOOD AT LUNCH")): "Particularly good at lunch",
    ("main", ("Blacklock", "Meat Free Main")): "Meat free main",
    ("main", ("Blacklock", "Specials")): "Specials",
    ("main", ("Blacklock", "CHOPS")): "Chops",
    ("main", ("Blacklock", "STEAKS")): "Steaks",
    ("main", ("Blacklock", "All In")): "All in",
    ("main", ("Blacklock", "Big Chops")): "Big chops",
    ("main", ("Blacklock", "Sides")): "Sides",
    ("main", ("Blacklock", "Sauces & Table Pleasers")): "Sauces & table pleasers",
    ("main", ("PUDDING",)): "Pudding",
    ("main", ("PUDDING", "Bowl of Ice Cream")): "Pudding: bowl of ice cream",
    ("sunday", ("Starters",)): "Sunday: starters",
    ("sunday", ("Roasts",)): "Sunday: roasts",
    ("sunday", ("Roasts", "Sauces")): "Sunday: roast sauces",
    ("sunday", ("Roasts", "Sides")): "Sunday: roast sides",
}
# Cut names that name no animal (checked against the page's own ingredient lists): "meat type not stated". The run stops if one of
# them starts to carry a pork/beef tag, so the list is re-read.
MEAT_TYPE_NOT_STATED = ["Bavette", "Rump Cap", "Blacklock Fillet"]
PIG = re.compile(r"\bpigs?'?s?\s+head\b", re.I)  # "Pig's Head on Toast", "Pigs Head Terrine": pork

NOTE = ("Calories only, per serving, from Blacklock's own allergy and nutrition page (Autumn and Sunday menus); no protein, carbs, fat or "
        "portions. The page warns its grills also cook flatbreads with gluten and milk and allergens are handled in all kitchen areas. "
        "One page for all 7 restaurants. Four big chops sold by weight are left out: their per-serving figures nearly equal the per-100g ones.")
SOURCE_TITLE = ("Blacklock full allergy and nutrition list: Autumn 2026 Menu Manchester (the menu template for all locations) and Sunday Main "
                "(viewthe.menu/by8v, linked from theblacklock.com/menus; accessed {d}, no date shown)")
ALLERGEN_TITLE = ("Blacklock full allergy and nutrition list: Autumn 2026 Menu and Sunday Main (viewthe.menu/by8v, linked from "
                  "theblacklock.com/menus; accessed {d}, no date shown)")
BIG_CHOPS = ["Lamb Rump", "Bone in Sirloin", "Prime Rib", "Porterhouse"]  # sold per 100 g on the chain's PDF menu (the NOTE says so)


# ---------------------------------------------------------------- fetching
def page_url(label: str) -> str:
    return PAGE_URL if label == "main" else f"{PAGE_URL}?mguid={MENUS[label][0]}"


def fetch_pages(dest: Path) -> None:
    """Save each menu page once (one request per second). Stops if robots.txt disallows a page."""
    dest.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(SITE + "/robots.txt", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        rules = robots_rfc.parse(resp.read().decode("utf-8", errors="replace"))
    time.sleep(1.1)
    for label in MENUS:
        url = page_url(label)
        if not robots_rfc.allowed(rules, url[len(SITE):]):
            raise SystemExit(f"robots.txt disallows {url}: not fetched")
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt in range(3):  # a dropped connection is retried, still one request at a time
            try:
                with urllib.request.urlopen(req, timeout=180) as resp:
                    (dest / f"{label}.html").write_bytes(resp.read())
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(5)
        time.sleep(1.1)


# ---------------------------------------------------------------- reading
def _page_checks(path: Path, label: str) -> None:
    guid, title, expected, _ = MENUS[label]
    text = path.read_text(encoding="utf-8", errors="replace")
    got = tb.page_title(path)
    if got != title:
        raise SystemExit(f"{label}: the page title is {got!r}, expected {title!r}: the menu behind this page changed")
    # the menu selector must list exactly the two menus this script reads (a third menu would be unread information)
    options = re.findall(r'data-menu-identifier="([^"]+)"[^>]*>\s*<span[^>]*>\s*([^<]*?)\s*</span>', text)
    if options != [(MENUS["main"][0], MENUS["main"][1]), (MENUS["sunday"][0], MENUS["sunday"][1])]:
        raise SystemExit(f"{label}: the page's menu selector lists {options}, expected the Autumn and Sunday menus only: "
                         "a menu was added or renamed, re-read the page")
    shows = "ShowNutrients = 'true' === 'true'" in text
    button = "k10-toolbar__button_nutrition" in text and "View nutrition information" in text
    header = "Nutrition values per serving" in text and "Nutrition values per 100g" in text and "Energy (kCal)" in text
    if not (shows and button and header):
        raise SystemExit(f"{label}: the page no longer offers 'View nutrition information' with 'Nutrition values per serving' "
                         f"(setting {shows}, button {button}, header {header}): re-read the page before publishing")
    ids = set(re.findall(r'data-recipe-id="(\d+)"', text))
    if len(ids) != expected:
        raise SystemExit(f"{label}: the page names {len(ids)} different recipes but this script expects {expected} dish rows")


def read_menu(path: Path, label: str) -> List[dict]:
    _page_checks(path, label)
    recs = bp.read_menu(path)
    expected = MENUS[label][2]
    if len(recs) != expected:
        raise SystemExit(f"{label}: the page has {len(recs)} dish rows but this script expects {expected}: the menu changed, "
                         "re-check CATEGORY and MEAT_TYPE_NOT_STATED before running again.")
    if len({r["recipe_id"] for r in recs}) != expected:
        raise SystemExit(f"{label}: two dish rows share a recipe id")
    for rec in recs:
        where = f"{label} / {rec['name']}"
        if list(rec["nutrients"]) != ["Energy (kCal)"]:
            raise SystemExit(f"{where}: nutrient columns are {list(rec['nutrients'])}, expected only Energy (kCal): map any new column first")
        raw = rec["nutrients"]["Energy (kCal)"]
        if not re.fullmatch(r"[1-9]\d{0,2}(,\d{3})*|[1-9]\d*", raw):
            raise SystemExit(f"{where}: energy printed as {raw!r}, not a whole number above zero")
        if rec["data_calories"] != raw:
            raise SystemExit(f"{where}: the row's data-calories {rec['data_calories']!r} disagrees with the printed {raw!r}")
        rec["menu"], rec["kcal"], rec["section"] = label, raw.replace(",", ""), tuple(rec["course"])
        if (label, rec["section"]) not in CATEGORY:
            raise SystemExit(f"{where}: section {rec['section']!r} is not mapped: add it to CATEGORY after checking the page")
        if rec["per100"].get("Energy (kCal)", "") == "":
            raise SystemExit(f"{where}: no per-100g energy on the card (the per-100g/per-serving pair has changed)")
    return recs


# ---------------------------------------------------------------- building
def allergen_key(a: dict) -> tuple:
    return tuple(tuple(sorted(a[k])) for k in ("contains", "may_contain", "cereals", "nuts"))


def build(pages: Dict[str, Path]) -> Tuple[List[dict], List[Tuple[str, str]], List[str]]:
    """(items, holdback rows, report lines)."""
    rows: Dict[tuple, dict] = {}
    report: List[str] = []
    for label in MENUS:
        names_in_menu = set()
        for rec in read_menu(pages[label], label):
            where = f"{label} / {rec['name']}"
            if rec["name"] in names_in_menu:
                raise SystemExit(f"{where}: printed twice in one menu: the script would merge two rows")
            names_in_menu.add(rec["name"])
            allergens = tb.allergens_from_rec(rec, where)
            if allergens is None:
                raise SystemExit(f"{where}: does not carry all 14 allergen columns")
            # The card's "May contain:" line can name a kind of an allergen the dish already CONTAINS ("Contains Cereals with Gluten
            # (Barley, Rye, Wheat)" with "May contain Cereals with Gluten (Oats)"; "Contains Tree Nuts (Pecan)" with "may contain Tree
            # Nuts (Almond, Brazil ...)"). tenkites_b keeps the contained kinds and drops that may-contain; list the key in
            # may_contain as well, so common.write_allergens drops the named kinds and publishes the generic allergen instead.
            may_line = rec["allergen_src"].get("may")
            if may_line is not None:
                allergens["may_contain"] = set(allergens["may_contain"]) | (tb._printed_list(may_line, where, None)[0] & set(allergens["contains"]))
            if rec["yes_labels"] and any(x in ("Vegan", "Vegetarian") for x in rec["yes_labels"]):
                raise SystemExit(f"{where}: the page now ticks a Vegan / Vegetarian column: read it and tag vegetarian dishes")
            text = rec["name"] + " " + rec["ingredients"]
            tags, conflict = tb.diet_tags(text, False)
            if PIG.search(text) and "contains_pork" not in tags:
                tags = "|".join(x for x in (tags, "contains_pork") if x)
            notes = [f"{label}: {' > '.join(rec['section'])}"]
            if conflict:
                notes.append(conflict)
            key = (tb.norm_name(rec["name"]), rec["kcal"], allergen_key(allergens))
            if key in rows:  # the same row printed on the other menu
                rows[key]["menus"].append(label)
                continue
            rows[key] = {"name": rec["name"], "menus": [label], "where": rec["section"][-1], "category": CATEGORY[(label, rec["section"])],
                         "kcal": rec["kcal"], "allergens": allergens, "tags": tags, "notes": notes, "printed": rec["name"],
                         "per100": rec["per100"]["Energy (kCal)"].replace(",", "")}
    row_list = list(rows.values())
    tb.unique_names(row_list, MENU_RANK, SHORT, LONG)
    items: List[dict] = []
    for r in row_list:
        item_id = slug(tb.fold(r["name"]))
        notes = list(r["notes"])
        if len(r["menus"]) > 1:
            notes.append("also printed identically on: " + ", ".join(LONG[m] for m in r["menus"][1:]))
        if r["name"] != r["printed"]:
            notes.append(f"printed '{r['printed']}'")
        if r["name"] in BIG_CHOPS:
            notes.append("sold per 100 g on the PDF menu; the page's per-serving figure is almost its per-100g figure")
        items.append({"id": item_id, "name": r["name"], "category": r["category"], "serving": "", "calories": r["kcal"], "tags": r["tags"],
                      "rankable": False, "notes": "; ".join(notes), "allergens": r["allergens"]})
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two items share an id")
    if len({tb.norm_name(i["name"]) for i in items}) != len(items):
        raise SystemExit("two items share a name")
    by_name = {i["name"]: i for i in items}
    for n in BIG_CHOPS + MEAT_TYPE_NOT_STATED:
        if n not in by_name:
            raise SystemExit(f"{n!r} is no longer on the page: update BIG_CHOPS / MEAT_TYPE_NOT_STATED")
    for n in MEAT_TYPE_NOT_STATED:
        if by_name[n]["tags"]:
            raise SystemExit(f"{n!r} now names pork or beef ({by_name[n]['tags']}): take it out of MEAT_TYPE_NOT_STATED")
    report.append("meat type not stated (cut named, no animal): " + ", ".join(MEAT_TYPE_NOT_STATED))
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt must be under 400 characters (is {len(NOTE)})")
    held = [(i["id"], "Sold by weight: the page's per-serving figure is almost its per-100g figure, so the serving basis can't be trusted")
            for i in items if i["name"] in BIG_CHOPS]
    report.append(f"held back (basis unclear): {', '.join(BIG_CHOPS)}")
    return items, held, report


def content_hash(items: List[dict]) -> str:
    keep = [dict(i) for i in items]
    for k in keep:
        a = k.get("allergens") or {}
        k["allergens"] = {x: sorted(a.get(x, ())) for x in ("contains", "may_contain", "cereals", "nuts")}
    return hashlib.sha256(json.dumps(keep, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--pages", type=Path, default=Path("/tmp/blacklock-pages"))
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch:
        fetch_pages(args.pages)
    pages = {label: args.pages / f"{label}.html" for label in MENUS}
    for p in pages.values():
        if not p.exists():
            print(f"{p} is missing: run with --fetch", file=sys.stderr)
            return 1
    items, holdback, report = build(pages)
    guide = {"title": ALLERGEN_TITLE.format(d=args.checked_on), "url": PAGE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Blacklock", cuisine="Steakhouse", source_title=SOURCE_TITLE.format(d=args.checked_on), source_url=PAGE_URL,
        checked_on=args.checked_on, aliases=["blacklock", "the blacklock", "blacklock chophouse", "blacklock soho", "blacklock shoreditch"],
        items=items, out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    for label, p in pages.items():
        print(f"{label:7} sha256 {sha256_file(p)}  {tb.page_title(p)}  ({p.stat().st_size} bytes)")
    print(f"extracted content sha256 {content_hash(items)}")
    print("\n".join(report))
    print("\n".join(tb.ALLERGEN_NOTES))
    by_cat: Dict[str, int] = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {folder}: " + ", ".join(f"{c} {n}" for c, n in by_cat.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
