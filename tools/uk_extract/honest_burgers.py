#!/usr/bin/env python3
"""Build data/source/honest-burgers/ from Honest Burgers' own allergen and nutrition page, and write the chain's halal statement.

    python3 -I tools/uk_extract/honest_burgers.py --cache DIR --checked-on 2026-10-16 [--out DIR] [--halal-csv FILE | --no-halal]

SOURCE (official). https://www.honestburgers.co.uk/allergy-information/ ("View the allergens and nutritional information for Honest Burgers
menus") links https://menus.tenkites.com/honestburgers/honestburgers, Honest Burgers' own Ten Kites allergen and nutrition page. It has one
tab per menu, addressed with ?mguid=<menu id> (the default tab is Core Burgers). Every tab prints "Updated 28 July 2026" (the page's own
date; the file name of each tab's printable copy carries the day it is opened, 2026-10-16, so it is not a version) although the Special Burgers
tab also carries a limited-time offer dated 6 Oct - 9 Nov 2026, so the page is edited after that label. Each dish has a "Nutrition values per
serving" cell (kcal, fat, saturates, carbohydrate, sugars, fibre, protein, salt; no kJ, no sodium, no serving weight), the 14 allergens as
yes / may / no columns, a "Contains: ... May contain: ..." line and the page's own Vegetarian / Vegan / Halaal / Gluten Free marks. The numbers
are copied by tenkites_c.read_table_layout exactly as printed (a thousands comma is dropped); nothing is converted, rounded or filled in.
Robots: menus.tenkites.com/robots.txt disallows only /fonts/, /views/ and /*.less$; honestburgers.co.uk/robots.txt has no rules but a sitemap.
Every request goes through images_common.polite_get (RFC 9309 matcher, 1 request a second, a normal browser User-Agent, cached by URL in
--cache); a 401/403/429 or a robots refusal stops the run (images_common.Blocked) and is never retried with another client.

TABS READ. Core Burgers, Honest Mighties (HB Core), Special Burgers, Sides & Sauces, Drinks, Kids Meals, Gluten Free Menu, Milkshakes &
Sundaes, GF Milkshakes & Toppings: the menus a guest is given. Master Menu (Creventa) is read only to cross-check them (see below). Local
Burgers is read only to recognise the one-off burgers of single restaurants. Not read at all: "New Menu Trial - Baker St & Tooley St Only"
(two sites). The script stops if the page gains, loses or renames a tab, if a tab's title or row count changes, or if a section it has not
been told about appears, so a human re-checks the rules below.

WHAT IS NOT PUBLISHED, and why (each is counted in the report):
- Local burgers (one burger named for each restaurant: "Baker St", "Bank", "Cardiff BBQ Sriracha", "Truffle Fried Chicken", ... and their "GF"
  versions in the Gluten Free tab): each is a single restaurant's dish, below the 3-site rule. "Local Sides" (Liverpool Salt & Pepper ...) likewise.
- Cocktails (the Drinks tab's "Cocktails" section): alcohol (founder's rule of 11 October 2026). The two homemade soft drinks stay.
- A section dated in the past (Special Burgers "28 July - 07 September Only": the same three Mighties are on the Honest Mighties tab with the
  same figures) and any dish whose figures are all printed as "-" (Lettuce, French's Mustard).
- Dishes on the Master Menu tab only (Honest Cheesy Chips, Chipotle Hot Sauce, Vanilla Milkshake, Seasonal Coleslaw (Autumn/Winter)): no menu a
  guest is given prints them, and Honest Burgers' own menu page (honestburgers.co.uk/menus/) names the dishes "Honest Loaded Chips", "Honest Hot
  Sauce" and "Vanilla Shortbread" milkshake as the guest tabs do, so the Master Menu's other names may be old or internal.

CROSS-CHECKS (nothing is chosen between, averaged or corrected):
- A name printed on more than one tab (the Master Menu included) must print the same figures and the same allergens everywhere. When it does not,
  every version is held back (holdback.csv), except one case: the Kids Meals tab's own portions of a sauce or of the rosemary chips (BBQ Mayo
  75 kcal against 150 in the Sauces; Rosemary Salted Chips 262 against 524) are published as separate dishes named "... (kids' menu)", after the
  menu the chain prints them in, beside the full-size dish. Two names conflict with no such explanation and are held back, both versions:
  Beef & Bacon Gravy (179 kcal in Sides & Sauces; 158 in the Gluten Free Menu and the Master Menu) and Heinz Mayonnaise (258 in Sides & Sauces
  and the Master Menu; 262 in the Gluten Free Menu).
- The coleslaw is a seasonal side printed under three names and three sets of figures (Winter Coleslaw 189 kcal on Sides & Sauces, Seasonal
  Coleslaw (Autumn/Winter) 226 on the Master Menu, "Kids Seasonal Coleslaw Spring/Summer 2026" 112 on Kids Meals); the chain's menu page names
  one current coleslaw, so Winter Coleslaw and the Kids one are held back (see HOLD).
- Allergens: the 14 columns, the printed "Contains / May contain" line and the label ids the page's own allergen filter reads must agree
  (tenkites_c.allergens_from_columns). The page also prints Unpasteurised cheese, Onion and Garlic as allergens: they are not one of the 14, so
  they are left out of every comparison and of the allergen table. A dish whose own allergen row contradicts itself is not published.
- A dish dated by its name ("Launching 31 March") is held back when that date is after the day of the run.

OTHER RULES. Names are the chain's own with the page's marketing tags removed ("[NEW]", "(NEW)", "NEW", "NEW RECIPE", "Launching 31 March",
"LTO"); a dish the page calls LTO, files under "Specials (Limited Time Offers)" on the Master Menu, or lists under a Special Burgers section
whose dates include the day of the run, is limited_time. Tags: vegetarian only where the page marks the dish Vegetarian or Vegan; pork and beef
only from the dish's own name (tenkites_c.meat_tags). Salt is copied as salt_g (sodium is not printed). Allergens are complete for every
published dish, so allergens.csv is written; may-contain is published.

HALAL. The FAQ at https://www.honestburgers.co.uk/feedback-and-faqs/ answers "Is your meat halal?": all the chicken is halal, no halal beef. The
answer is copied from the page (not retyped) into data/dietary/halal-honest-burgers.csv as scope "some" (chicken only). The page's per-dish
"Halaal" marks are not stored (the data contract has no per-dish halal field).

HOW TO RERUN. A monthly refresh deletes --cache (or uses a new one) and runs the command at the top; the run prints each page's SHA-256 and every
decision. If it stops, read the message: a changed tab, section or row count is a human check, never something to bypass.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import hashlib
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "honest-burgers"
NAME = "Honest Burgers"
BASE = "https://menus.tenkites.com/honestburgers/honestburgers"
SITE = "https://www.honestburgers.co.uk"
FAQ_URL = SITE + "/feedback-and-faqs/"
ALLERGY_URL = SITE + "/allergy-information/"
LOCATIONS_URL = SITE + "/locations/"
HTML_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"

# key -> (menu id, page title, rows the table layout reads today)
TABS = {
    "core": ("29c24040-60b9-44f4-ba63-b2233fcdba12", "Core Burgers", 20),
    "mighties": ("a082763a-57e3-496d-8f8b-9f7156d7a990", "Honest Mighties (HB Core)", 3),
    "special": ("418f75d3-5c21-4f40-afad-9e8c2fca2708", "Special Burgers", 6),
    "local": ("b7a0ed3f-f5c5-4e09-a28f-5d1310726eed", "Local Burgers", 45),
    "sides": ("a46a78b3-67cb-4b80-b5d8-6f57f546b892", "Sides & Sauces", 35),
    "drinks": ("fa1052c6-405b-4bdf-9191-47ad79cc19ce", "Drinks", 9),
    "kids": ("10b81121-db01-4d7a-85dd-4149faf27e7a", "Kids Meals", 23),
    "gf": ("e63ec9e2-1914-4066-9db4-56e2c1640072", "Gluten Free Menu", 89),
    "shakes": ("ad9eae3b-eb55-4ceb-a554-7d2f02834567", "Milkshakes & Sundaes", 16),
    "gfshakes": ("386f1945-13d5-489a-9f0e-6620d898ef4b", "GF Milkshakes & Toppings", 9),
    "master": ("a8774fa8-c3f7-4cf9-a2ef-9b955dc26784", "Master Menu (Creventa)", 173),
}
# listed in the page's menu selector but not read (two sites only)
NOT_READ = {"db82996e-bf8a-436b-9538-7a50f19a2372": "New Menu Trial – Baker St & Tooley St Only"}
GUEST_TABS = ["core", "mighties", "special", "sides", "drinks", "kids", "gf", "shakes", "gfshakes"]

# (tab, printed section) -> (category shown, rankable). Anything else stops the run.
SECTIONS = {
    ("core", "Burgers"): ("Burgers", True),
    ("mighties", "Mighties"): ("Mighties", True),
    ("sides", "Sides"): ("Sides", True),
    ("sides", "Sauces"): ("Sauces", False),
    ("drinks", "Homemade Drinks"): ("Drinks", False),
    ("kids", "Kids Menu"): ("Kids menu", True),
    ("kids", "Kids Sides"): ("Kids sides", True),
    ("kids", "Kids Drinks"): ("Kids drinks", False),
    ("kids", "Optional Burger Toppings"): ("Kids burger toppings", False),
    ("gf", "Gluten Free Menu"): ("Gluten-free burgers", True),
    ("gf", "Gluten Free Sides"): ("Sides", True),
    ("gf", "Gluten Free Sauces"): ("Sauces", False),
    ("shakes", "Milkshakes"): ("Milkshakes", False),
    ("shakes", "Sundaes"): ("Sundaes", False),
    ("shakes", "Milkshake & Sundae Toppings"): ("Milkshake and sundae toppings", False),
    ("gfshakes", "Milkshakes"): ("Milkshakes", False),
    ("gfshakes", "Milkshake Toppings"): ("Milkshake and sundae toppings", False),
}
SKIPPED_SECTIONS = {
    ("drinks", "Cocktails"): "alcoholic drinks are not added",
    ("sides", "Local Sides"): "a single restaurant's side (Liverpool), below the 3-site rule",
}
MASTER_SECTIONS_BURGERS = {"Beef Burgers", "Smashed Burgers", "Chicken Burgers", "Vegan & Vegetarian Burgers",
                           "Honest Mighties (Slider Size)", "Specials (Limited Time Offers)"}
MASTER_LOCAL = "Local Burgers"
MASTER_LTO = "Specials (Limited Time Offers)"
MASTER_SECTION_NAMES = MASTER_SECTIONS_BURGERS | {MASTER_LOCAL, "Sides", "Sauces", "Kids Menu", "Homemade Drinks", "Milkshakes"}

# printed by the page as allergens but not one of the 14 the law requires: left out of every allergen comparison and of the table
NOT_ONE_OF_14 = ("Unpasteurised cheese", "Onion", "Garlic")

# Names held back although each is printed once or in agreement, with the reason (never chosen between).
HOLD = {
    "Winter Coleslaw": "The Sides & Sauces tab prints 189 kcal for 'Winter Coleslaw' but the Master Menu prints 226 kcal for 'Seasonal Coleslaw "
                       "(Autumn/Winter)', and the chain's menu page lists one autumn/winter coleslaw: two figures for what looks like one dish "
                       "and nothing says which is current, so neither is published.",
    "Kids Seasonal Coleslaw Spring/Summer 2026": "Printed as a Spring/Summer 2026 seasonal dish; the chain's other tabs now list an Autumn/Winter "
                                                 "coleslaw, so this one may no longer be served.",
}
KIDS_SUFFIX = " (kids' menu)"
NAME_NOISE = [
    (re.compile(r"\s*\[NEW\]"), ""), (re.compile(r"\s*\(NEW\)"), ""),
    (re.compile(r"\s+NEW RECIPE(?:\s+Launching \d{1,2} [A-Za-z]+)?"), ""),
    (re.compile(r"\s+NEW\b"), ""), (re.compile(r"\s+LTO\b"), ""),
]
LAUNCHING = re.compile(r"Launching (\d{1,2}) ([A-Za-z]+)")
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
WINDOW = re.compile(r"^(\d{1,2}) ([A-Za-z]+)\s*[-–]\s*(\d{1,2}) ([A-Za-z]+)(?: Only)?$")
SOURCE_TITLE = ("Honest Burgers allergen and nutritional information (Ten Kites page linked from honestburgers.co.uk/allergy-information/; "
                "printed 'Updated {printed}', read {checked})")
NOTE = ("Per-serving figures from Honest Burgers' own nutrition page (dated 28 July 2026). The one-off local burger each restaurant makes and the "
        "cocktails are not included, and not every dish is on every restaurant's menu.")


# ---------------------------------------------------------------- fetching

def get(url: str, cache: Path) -> str:
    try:
        return ic.polite_get(url, cache, accept=HTML_ACCEPT).decode("utf-8")
    except ic.Blocked as e:
        raise SystemExit(f"STOP: {e}. The chain's site refused this request; do not retry with another client or user agent. "
                         "Report the URL so the files can be saved from a normal browser.") from e


def tab_url(key: str) -> str:
    return BASE if key == "core" else f"{BASE}?mguid={TABS[key][0]}"


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- reading the tabs

def tidy(raw: str) -> str:
    name = raw.strip()
    for rx, rep in NAME_NOISE:
        name = rx.sub(rep, name)
    return re.sub(r"\s+", " ", name).strip()


def gf_base(name: str) -> str | None:
    """'GF Beef Burger' / 'Bristol Cabot Circus GF' -> the name without the gluten-free marker; None if it has none."""
    if name.startswith("GF "):
        return name[3:].strip()
    if name.endswith(" GF"):
        return name[:-3].strip()
    return None


def local_key(name: str) -> str:
    return re.sub(r"\s+New$", "", tidy(name), flags=re.I).lower()


def strip_extras(text: str) -> str:
    """The row's 'Contains: ... May contain: ...' line without Unpasteurised cheese, Onion and Garlic (not among the 14)."""
    mc = re.search(r"Contains:\s*(.*?)\s*(?=May contain:|$)", text, re.S)
    mm = re.search(r"May contain:\s*(.*)$", text, re.S)

    def keep(s: str | None) -> str:
        return ", ".join(p for p in tk._split_top(s or "") if p.split("(")[0].strip() not in NOT_ONE_OF_14)

    out = ""
    if mc:
        out += "Contains: " + keep(mc.group(1))
    if mm:
        out += " May contain: " + keep(mm.group(1))
    return out.strip()


def only_the_14(row: dict) -> dict:
    r = dict(row)
    drop = {i for i, n in row["filter"].items() if n in NOT_ONE_OF_14}
    r["filter"] = {i: n for i, n in row["filter"].items() if n not in NOT_ONE_OF_14}
    ids = row["label_ids"]
    r["label_ids"] = None if ids is None else ([x for x in ids[0] if x not in drop], [x for x in ids[1] if x not in drop])
    r["label_names"] = strip_extras(row["label_names"])
    return r


def allergen_signature(a: dict | None) -> tuple | None:
    if a is None:
        return None
    return (tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"] - a["contains"])), tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])))


def read_tabs(cache: Path, report: list[str]) -> tuple[dict, str]:
    """{tab key: [parsed rows]} for every tab in TABS, after checking the page's menu selector, each tab's title, menu id and row count."""
    pages: dict[str, str] = {}
    default = get(BASE, cache)
    pages["core"] = default
    root = tk.parse_html(default)
    selector = {n.attrs["data-menu-identifier"]: n.text() for n in root.iter()
                if n.tag == "span" and n.has("k10-menu-selector__option-name") and "data-menu-identifier" in n.attrs}
    expected = {g: t for g, t, _ in TABS.values()} | NOT_READ
    if selector != expected:
        raise SystemExit(f"STOP: the page's menu selector changed.\n  now: {selector}\n  expected: {expected}\nRe-check TABS and the rules in the docstring.")
    for key in TABS:
        if key != "core":
            pages[key] = get(tab_url(key), cache)
    printed = set()
    out = {}
    for key, (guid, title, count) in TABS.items():
        text = pages[key]
        if tk.page_title(text) != title:
            raise SystemExit(f"STOP: tab {key} is titled {tk.page_title(text)!r}, expected {title!r}")
        sections = re.findall(r'<section class="k10-menus[^>]*data-menu-identifier="([^"]+)"', text)
        if sections != [guid]:
            raise SystemExit(f"STOP: tab {key} carries menu ids {sections}, expected [{guid!r}]")
        printed |= set(re.findall(r"Updated (\d{1,2} [A-Za-z]+ \d{4})", text))
        rows = tk.read_table_layout(text)
        if len(rows) != count:
            raise SystemExit(f"STOP: tab {key} has {len(rows)} dishes but this script expects {count}: the menu changed, re-check the rules.")
        for r in rows:
            if r["per"] != "serving":
                raise SystemExit(f"STOP: {key} {r['name']!r} is printed per {r['per']!r}, not per serving")
        out[key] = rows
        report.append(f"{key}: {title}: {len(rows)} dishes, sha256 {sha(text)[:16]}, {len(text) / 1e6:.1f} MB")
    if len(printed) != 1:
        raise SystemExit(f"STOP: the tabs print different 'Updated' dates {sorted(printed)}")
    return out, printed.pop()


# ---------------------------------------------------------------- decisions

def window_state(section: str, today: dt.date) -> str | None:
    """'current' | 'ended' | 'upcoming' for a Special Burgers section named like '06 Oct - 09 Nov'; None if it is not a date window."""
    m = WINDOW.match(section.strip())
    if not m:
        return None
    d1, m1, d2, m2 = int(m.group(1)), MONTHS[m.group(2)[:3].lower()], int(m.group(3)), MONTHS[m.group(4)[:3].lower()]
    start, end = dt.date(today.year, m1, d1), dt.date(today.year, m2, d2)
    if end < start:
        raise SystemExit(f"STOP: the section {section!r} crosses a year end: read it by hand")
    return "ended" if today > end else "upcoming" if today < start else "current"


def make_dish(tab: str, r: dict, where: str) -> dict:
    nums, missing = tk.numbers(r["nutrients"], where)
    try:
        alg = tk.allergens_from_columns(only_the_14(r), where, tk.ALLERGEN_LABELS)
        alg_error = "" if alg is not None else "the page prints no allergen row for it"
    except SystemExit as e:
        alg, alg_error = None, str(e)
    return {"tab": tab, "section": r["section"], "raw": r["name"], "name": tidy(r["name"]), "nums": nums, "missing": missing, "row": r,
            "allergens": alg, "alg_error": alg_error,
            "key": tuple(nums[k] for k in tk.LABELS), "alg_sig": allergen_signature(alg)}


def build(cache: Path, checked_on: dt.date) -> tuple[list[dict], list[tuple[str, str]], list[str], str]:
    report: list[str] = []
    tabs, printed = read_tabs(cache, report)
    dishes = {t: [make_dish(t, r, f"{t} {r['name']}") for r in rows] for t, rows in tabs.items()}

    # --- which names are the one-off burgers of single restaurants
    master_burgers = {d["name"] for d in dishes["master"] if d["section"] in MASTER_SECTIONS_BURGERS}
    for d in dishes["master"]:
        if d["section"] not in MASTER_SECTION_NAMES:
            raise SystemExit(f"STOP: new Master Menu section {d['section']!r}")
    known_burgers = ({d["name"] for d in dishes["core"]} | {d["name"] for d in dishes["special"]} | {d["name"] for d in dishes["mighties"]}
                     | master_burgers)
    local_names = ({local_key(d["raw"]) for d in dishes["local"]}
                   | {local_key(gf_base(d["raw"]) or d["raw"]) for d in dishes["master"] if d["section"] == MASTER_LOCAL})
    master_lto = {d["name"] for d in dishes["master"] if d["section"] == MASTER_LTO}

    skipped: dict[str, list[str]] = collections.defaultdict(list)
    cands: list[dict] = []
    for tab in GUEST_TABS:
        for d in dishes[tab]:
            sec, key = d["section"], (tab, d["section"])
            d["limited"] = "LTO" in d["raw"].split() or d["name"] in master_lto
            if tab == "special":
                state = window_state(sec, checked_on)
                if state is None:
                    raise SystemExit(f"STOP: Special Burgers section {sec!r} is not a date window: read it by hand")
                if state != "current":
                    skipped[f"Special Burgers section '{sec}' is {state} on {checked_on}"].append(d["name"])
                    continue
                d["category"], d["rankable"], d["limited"] = "Specials", True, True
            elif key in SKIPPED_SECTIONS:
                skipped[f"{tab} / {sec}: {SKIPPED_SECTIONS[key]}"].append(d["name"])
                continue
            elif key in SECTIONS:
                d["category"], d["rankable"] = SECTIONS[key]
            else:
                raise SystemExit(f"STOP: new section {sec!r} on tab {tab}: add it to SECTIONS or SKIPPED_SECTIONS.")
            if tab == "gf" and sec == "Gluten Free Menu":
                base = gf_base(d["name"])
                if base is None:
                    raise SystemExit(f"STOP: {d['name']!r} on the Gluten Free tab has no GF marker")
                if base not in known_burgers:
                    if local_key(base) in local_names:
                        skipped["a single restaurant's gluten-free local burger"].append(d["name"])
                        continue
                    raise SystemExit(f"STOP: Gluten Free Menu dish {d['name']!r} is neither a core burger nor a local one: re-check")
            if d["missing"]:
                skipped[f"figures printed as '-' ({', '.join(d['missing'])} missing)"].append(d["name"])
                continue
            m = LAUNCHING.search(d["raw"])
            if m and dt.date(checked_on.year, MONTHS[m.group(2)[:3].lower()], int(m.group(1))) > checked_on:
                d["hold"] = f"The page says the printed recipe is 'Launching {m.group(1)} {m.group(2)}', after {checked_on}."
            cands.append(d)

    # --- group by name and compare every printing, the Master Menu included
    master_by_name: dict[str, list[dict]] = collections.defaultdict(list)
    for d in dishes["master"]:
        if d["section"] != MASTER_LOCAL:
            master_by_name[d["name"]].append(d)
    groups: dict[str, list[dict]] = collections.OrderedDict()
    for d in cands:
        groups.setdefault(d["name"], []).append(d)
    master_only = sorted({n for n in master_by_name if n not in groups})
    skipped["only on the Master Menu tab, on no guest menu"] += master_only

    items: list[dict] = []
    holds: list[tuple[str, str]] = []
    unreadable: list[str] = []
    used_ids: dict[str, int] = {}

    def add(d: dict, name: str, hold: str = "") -> None:
        base = slug(name)
        n = used_ids.get(base, 0) + 1
        used_ids[base] = n
        item_id = base if n == 1 else f"{base}-{n}"
        row = d["row"]
        meat, unspecified = tk.meat_tags(d["raw"], row["desc"], row["ingredients"], vegetarian=bool(row["vegetarian"]))
        if unspecified:
            report.append(f"meat type not stated: {name}")
        tags = (["vegetarian"] if row["vegetarian"] else []) + meat
        item = {"id": item_id, "name": name, "category": d["category"], "serving": "", **d["nums"], "tags": "|".join(tags),
                "limited_time": d["limited"], "rankable": d["rankable"], "allergens": d["allergens"], "notes": ""}
        notes = tk.annotate(item)
        item["notes"] = "; ".join(notes)
        report.extend(f"{name}: {n}" for n in notes)
        items.append(item)
        if hold:
            holds.append((item_id, hold))

    for name, group in groups.items():
        printings = group + master_by_name.get(name, [])
        if any(p["allergens"] is None for p in group):
            bad = next(p for p in group if p["allergens"] is None)
            unreadable.append(f"{name} ({bad['tab']}): {bad['alg_error'][:160]}")
            continue
        variants: dict[tuple, list[dict]] = collections.OrderedDict()
        for p in printings:
            variants.setdefault((p["key"], p["alg_sig"]), []).append(p)
        first_of = {k: next((p for p in v if p["tab"] != "master"), v[0]) for k, v in variants.items()}
        hold_reason = next((d.get("hold") for d in group if d.get("hold")), "") or HOLD.get(name, "")
        if len(variants) == 1:
            add(first_of[next(iter(variants))], name, hold_reason)
            continue
        where = {k: sorted({p["tab"] for p in v}) for k, v in variants.items()}
        kids_only = [k for k, t in where.items() if t == ["kids"]]
        others = [k for k in variants if k not in kids_only]
        if len(kids_only) == 1 and len(others) == 1 and variants[others[0]] and not hold_reason:
            report.append(f"kept apart by menu: {name!r} is {others[0][0][0]} kcal on {'/'.join(where[others[0]])} and "
                          f"{kids_only[0][0][0]} kcal on Kids Meals: published as {name!r} and {name + KIDS_SUFFIX!r}")
            add(first_of[others[0]], name)
            add(first_of[kids_only[0]], name + KIDS_SUFFIX)
            continue
        text = "; ".join(f"{k[0][0]} kcal on {'/'.join(where[k])}" for k in variants)
        reason = hold_reason or (f"The page prints '{name}' with different figures ({text}); nothing says which is right, so none is published.")
        for k in variants:
            add(first_of[k], name, reason)

    report.append("")
    report.append("Not published:")
    for why, names in skipped.items():
        report.append(f"  {why}: {len(names)}" + (f" ({', '.join(names[:8])}{', ...' if len(names) > 8 else ''})" if len(names) <= 40 else ""))
    for u in unreadable:
        report.append(f"  allergen row unreadable, dish dropped: {u}")
    report += [f"held back: {i}: {why[:110]}" for i, why in holds]

    # --- gates that apply to every dish (the audit repeats them; they hold back, never correct)
    kept: list[dict] = []
    held_ids = {i for i, _ in holds}
    for it in items:
        salt = float(it["salt_g"]) if it.get("salt_g") not in ("", None) else 0.0
        if it["id"] not in held_ids and salt > 50:
            holds.append((it["id"], f"The page prints {salt:g} g of salt, more than the whole serving weighs, so its figures cannot be trusted."))
        kept.append(it)
    report.append(f"printed date: Updated {printed}")
    return kept, holds, report, printed


# ---------------------------------------------------------------- halal statement and the site

def text_of(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def halal_statement(cache: Path) -> str:
    page = get(FAQ_URL, cache)
    m = re.search(r"<h3>\s*Is your meat halal\?\s*</h3>\s*<hr>\s*(.*?)<a href=\"#main\"", page, re.S)
    if not m:
        raise SystemExit("STOP: the FAQ no longer has an 'Is your meat halal?' answer in the expected place: read the page by hand")
    answer = text_of(m.group(1))
    if not answer.startswith("All of the chicken in our restaurants is halal."):
        raise SystemExit(f"STOP: the halal answer changed: {answer!r}")
    return "Is your meat halal? " + answer


def count_locations(cache: Path) -> int:
    page = get(LOCATIONS_URL, cache)
    slugs = set(re.findall(r'href="https://www\.honestburgers\.co\.uk/locations/([a-z0-9-]+)/"', page))
    return len(slugs)


def write_halal(path: Path, statement: str, checked_on: str) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["chain_id", "scope", "statement", "source_url", "checked_on"])
        w.writerow([CHAIN_ID, "some", statement, FAQ_URL, checked_on])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder for the downloaded pages (fetched once, cached by URL)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--halal-csv", type=Path, default=ROOT / "data" / "dietary" / "halal-honest-burgers.csv")
    ap.add_argument("--no-halal", action="store_true")
    args = ap.parse_args()
    checked = dt.date.fromisoformat(args.checked_on)
    items, holdback, report, printed = build(args.cache, checked)
    locations = count_locations(args.cache)
    guide = {"title": f"Honest Burgers allergen and nutritional information (Ten Kites page, printed 'Updated {printed}')", "url": BASE,
             "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name=NAME, cuisine="Burgers",
                             source_title=SOURCE_TITLE.format(printed=printed, checked=args.checked_on), source_url=BASE,
                             checked_on=args.checked_on, aliases=["honest burgers", "honest burger", "honest"], items=items, out=args.out,
                             note=NOTE, holdback=holdback, allergen_guide=guide)
    if not args.no_halal:
        write_halal(args.halal_csv, halal_statement(args.cache), args.checked_on)
        report.append(f"halal statement written to {args.halal_csv}")
    cats = collections.Counter(i["category"] for i in items)
    print("\n".join(report))
    print(f"location pages listed on {LOCATIONS_URL}: {locations}")
    print("items by category:", dict(cats))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
