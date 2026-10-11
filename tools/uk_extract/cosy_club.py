#!/usr/bin/env python3
"""Build data/source/cosy-club/ from Cosy Club's own menu pages on Ten Kites. A CALORIES-ONLY chain.

    python3 -I tools/uk_extract/cosy_club.py --pages DIR --checked-on 2026-10-11 [--fetch] [--out DIR]

Source: each Cosy Club venue's menu record on the chain's own site (https://content.cosyclub.co.uk/wp-json/wp/v2/menu, the data
behind https://cosyclub.co.uk/menus/ and https://cosyclub.co.uk/menu/<venue>/) names the Ten Kites page the venue's menu page embeds
in its `tenkites_menu` field, e.g. https://menus.tenkites.com/loungers/cosyclubss26. On 2026-10-11 the 38 venues (the chain's own
location list, https://content.cosyclub.co.uk/wp-json/wp/v2/location) used seven such pages: cosyclubss26 (10 venues), cosyclubss2602
(14), cosyclubss2604 (8), cosyclubss2605 (3), cosyclubss2606 (1), cosyclubaw2503 (1) and staging/cosyclubss2604 (1, Swansea). Each
page holds nine menus (BREAKFAST, LUNCH, DINNER, DESSERTS, KIDS, GLUTEN FREE, VEGAN, COCKTAILS AND MIXED DRINKS, WINE): the first at the
page's address, the others at ?mguid=<menu id> from the page's own menu selector. --fetch reads the two lists and then every page and
menu (about 65 requests, one every 1.1 seconds, a normal browser User-Agent, robots.txt checked with the RFC 9309 matcher first; any
401/403/429 stops the run: nothing is worked round). robots.txt: cosyclub.co.uk and content.cosyclub.co.uk have none (404 = no
rules); menus.tenkites.com disallows only /fonts/, /views/ and /*.less$. The "Download Menu" PDFs on images.tenkites.com (robots.txt
"Disallow: /") are never fetched. Reader: cosy_club_pages.py (+ tenkites_c.py).

CALORIES ARE HIDDEN BY DEFAULT behind a visible "Hide Calories" switch (Yes / No, starting on Yes), exactly as on the Lounge pages
(loungers.py; decision of the founder's delegate: a figure the chain's own page lets any visitor reveal with a visible control counts
as published). The figures are in the page's HTML all along; the script checks the switch is still there on every page.

WHAT IS PRINTED: one calorie figure per dish ("1,055 kcal" beside the name, the same in the pop-up's "Nutrition (per portion)" table)
and nothing else numeric, so protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"). A thousands comma is dropped;
nothing else is changed. Dishes with no figure are not listed.

PAGES DIFFER (price bands and a few menus differ by venue). Founder's rule for chains whose sites print different menus: a dish is
published only when the venues whose pages print it number 2 or more and EVERY page that prints it (the same menu, section, name and,
for an add-on, the same dish it belongs to) prints the same calories and the same allergens. A dish printed with two different figures
anywhere is left out, never chosen between (listed in the run's output). The staging page is linked by Swansea's own menu record, so it
is read like the others.

Left out on purpose (counted in the output): every alcoholic drink (founder, 11 Oct 2026): the WINE menu, the COCKTAILS / spritz /
beer / cider / spirit sections, unless the dish's own name says it is alcohol-free (Virgin, 0%, alcohol free, mocktail).

ALLERGENS are complete: every pop-up prints "Contains:" (cereals and tree nuts named in brackets) and "May contain:" lines (a dish
with neither prints "none of the listed allergens"); tenkites_c.allergens_checked() compares them with the label ids the page's own
allergen filter reads and the run stops if they ever disagree. "Suitable for: Vegan, Vegetarian" gives the vegetarian tag, checked
against the same label ids.

Add-ons ("Add: Smoked Salmon" under Smashed Avocado) are rows of their own named "Add <name>", each with its own printed figure (not a
dish total). The same dish printed on several menus of a page with the same name, calories and allergens is one item (the first menu in
MENU_ORDER keeps it); the same name with different numbers gets its menu or section in brackets.

Independent check: data/audit/verified/cosy-club.json.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import cosy_club_pages as cp  # noqa: E402
import images_common as ic  # noqa: E402  (robots.txt check, RFC 9309)
import loungers_pages as lp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "cosy-club"
MENU_API = "https://content.cosyclub.co.uk/wp-json/wp/v2/menu?per_page=100"
LOCATION_API = "https://content.cosyclub.co.uk/wp-json/wp/v2/location?per_page=100"
MENUS_PAGE = "https://cosyclub.co.uk/menus/"
TK_PREFIX = "https://menus.tenkites.com/loungers/"
UA = tk.USER_AGENT
DELAY = 1.1
MIN_VENUES = 2
EXPECTED_VENUES = 38

MENU_ORDER = ["BREAKFAST", "LUNCH", "DINNER", "DESSERTS", "KIDS", "GLUTEN FREE", "VEGAN", "Sunday Roast", "COCKTAILS AND MIXED DRINKS", "WINE"]
SKIP_MENUS = {"WINE"}   # every row is wine or fizz (alcohol)
ALCOHOL_SECTIONS = re.compile(r"cocktail|spritz|wine|fizz|prosecco|champagne|beer|lager|cider|spirit|gin\b|vodka|rum\b|whisk|tequila|"
                              r"shot|bubbles|aperitivo|negroni|martini|margarita", re.I)
ALCOHOL_FREE = re.compile(r"\bvirgin\b|\b0(?:\.0)?\s?%|alcohol[- ]free|non[- ]alcoholic|mocktail|\bnojito\b", re.I)
# The section (or menu) a dish is filed under in the app. Unknown sections stop the run.
CATEGORY = {
    ("BREAKFAST", "BREAKFAST"): "Breakfast", ("BREAKFAST", "EXTRAS"): "Breakfast extras",
    ("BREAKFAST", "JUICES AND SMOOTHIES"): "Juices & smoothies", ("BREAKFAST", "COCKTAILS"): "Soft drinks",
    ("DESSERTS", "DESSERTS"): "Desserts", ("DESSERTS", "DRINKS"): "Hot drinks",
    ("KIDS", "BREAKFAST"): "Kids: breakfast", ("KIDS", "MAINS"): "Kids: mains", ("KIDS", "DESSERTS"): "Kids: desserts",
    ("COCKTAILS AND MIXED DRINKS", "TEETOTAL TIPPLES"): "Soft drinks", ("COCKTAILS AND MIXED DRINKS", "COOLERS"): "Soft drinks",
    ("COCKTAILS AND MIXED DRINKS", "SMOOTHIES"): "Juices & smoothies",
}
for _m in ("LUNCH", "DINNER"):
    CATEGORY.update({(_m, "SMALL PLATES"): "Small plates", (_m, "MAINS"): "Mains", (_m, "SANDWICHES"): "Sandwiches",
                     (_m, "BURGERS"): "Burgers", (_m, "STEAKS"): "Steaks", (_m, "SIDES"): "Sides", (_m, "BRUNCH"): "Brunch"})
ONE_CATEGORY = {"GLUTEN FREE": "Gluten free menu", "VEGAN": "Vegan menu", "Sunday Roast": "Sunday roast"}
# Named alcoholic drinks printed outside the alcohol sections (the dessert menu's drinks list): left out like the rest.
ALCOHOL_NAMES = re.compile(r"\birish coffee\b|\bmartini\b|\bnegroni\b|\bold fashioned\b|sauternes|\bwhisk(?:e)?y\b|woodford|talisker|"
                           r"burnt faith|diplomatico|\bliqueur\b|\bbaileys\b|\bprosecco\b|\bmimosa\b", re.I)
SAFE_SECTIONS = {"TEETOTAL TIPPLES"}   # the chain's own alcohol-free section (Everleaf, Pentire)
# Superseded page: Stamford's menu record still links cosyclubaw2503, which now holds the Spring/Summer 2026 menu (its menus are
# "COSYSPRINGSUMMER26-..."), while the other 37 venues' pages hold the current Autumn/Winter 2026 menu. It is not used (a past
# season's menu, like the superseded June menus left out for The Chapter Collection); the run stops if that page changes season.
SUPERSEDED = {"cosyclubaw2503": "COSYSPRINGSUMMER26"}
CURRENT_SEASON = "COSYAUTUMNWINTER26"
LIMITED_MENUS: set[str] = set()
EXTRA_ALLERGEN_WORDS = {"sulphur dioxide/ sulphites": ("sulphites", None)}
NOT_VEGETARIAN = {"fish", "crustaceans", "molluscs"}
NOT_VEGAN = NOT_VEGETARIAN | {"milk", "eggs"}
PIG = re.compile(r"\bpigs?[- ]in[- ]blankets?\b", re.I)

NOTE = ("Calories only, as Cosy Club's own menu pages print them (the page hides them until \"Hide Calories\" is set to No); protein, "
        "carbs and fat are not published. Menus differ a little between venues, so a dish is listed only where the venues' pages agree "
        "on its calories and allergens. Alcoholic drinks are not listed.")
assert len(NOTE) < 400


# ---------------------------------------------------------------- fetching

_last = [0.0]


def get(url: str, dest: Path) -> bytes:
    """One polite GET (robots.txt first). 401/403/429 or a robots refusal stops the run."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest.read_bytes()
    if not ic._robots_allow(url):
        raise SystemExit(f"robots.txt disallows {url}: stopped (never worked round)")
    wait = _last[0] + DELAY - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json;q=0.9,*/*;q=0.8"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            raise SystemExit(f"HTTP {e.code} from {url}: stopped (never worked round)") from e
        except (urllib.error.URLError, OSError):
            # a dropped connection (reset, timeout), not a refusal: wait and ask again, twice at most
            if attempt == 2:
                raise
            time.sleep(10 * (attempt + 1))
        finally:
            _last[0] = time.monotonic()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data


def page_key(url: str) -> str:
    if not url.startswith(TK_PREFIX):
        raise SystemExit(f"a venue links a menu page outside the chain's Ten Kites folder: {url}")
    return url[len(TK_PREFIX):].replace("/", "_")


def venue_pages(pages: Path) -> dict[str, list[str]]:
    """{Ten Kites page url: [venue slugs]} from the chain's own menu and location records."""
    menus = json.loads((pages / "menu_api.json").read_text())
    locations = json.loads((pages / "location_api.json").read_text())
    loc_slugs = {l["slug"] for l in locations}
    out: dict[str, list[str]] = {}
    for m in menus:
        url = (m.get("acf") or {}).get("tenkites_menu") or ""
        if not url:
            raise SystemExit(f"venue {m['slug']}: its menu record names no Ten Kites page")
        if m["slug"] not in loc_slugs:
            raise SystemExit(f"menu record {m['slug']} has no matching venue in the location list")
        out.setdefault(url, []).append(m["slug"])
    if len(locations) != EXPECTED_VENUES or sum(len(v) for v in out.values()) != EXPECTED_VENUES:
        raise SystemExit(f"{len(locations)} venues / {sum(len(v) for v in out.values())} menu records, expected {EXPECTED_VENUES}: "
                         "the venue list changed, re-check it")
    return out


def fetch_all(pages: Path) -> None:
    get(MENU_API, pages / "menu_api.json")
    get(LOCATION_API, pages / "location_api.json")
    for url in venue_pages(pages):
        key = page_key(url)
        first = get(url, pages / key / "default.html").decode("utf-8", "replace")
        for name, mid in lp.menu_tabs(first):
            get(f"{url}?mguid={mid}", pages / key / f"{slug(name)}.html")


# ---------------------------------------------------------------- reading

def read_page(pages: Path, url: str) -> list[dict]:
    key = page_key(url)
    first = (pages / key / "default.html").read_text(encoding="utf-8", errors="replace")
    tabs = lp.menu_tabs(first)
    if not {t[0] for t in tabs} <= set(MENU_ORDER):
        raise SystemExit(f"{key}: the menu selector reads {[t[0] for t in tabs]}: a menu not in MENU_ORDER, decide how to read it")
    rows = []
    for name, mid in tabs:
        text = (pages / key / f"{slug(name)}.html").read_text(encoding="utf-8", errors="replace")
        if lp.page_title(text) != name:
            raise SystemExit(f"{key}/{slug(name)}.html is the page {lp.page_title(text)!r}, expected {name!r}")
        info = lp.toggle_info(text)
        if info != {"label": "Hide Calories", "default_hides": True, "on": "Yes", "off": "No"}:
            raise SystemExit(f"{key} {name}: the calorie switch changed ({info}): re-check how the page shows calories")
        for r in cp.read_dishes(text, name):
            r["page"] = key
            rows.append(r)
    return rows


def skip_reason(r: dict) -> str | None:
    if r["menu"] in SKIP_MENUS:
        return "alcoholic drink (wine menu)"
    if r["section"] in SAFE_SECTIONS:
        return None
    if (ALCOHOL_SECTIONS.search(r["section"]) or ALCOHOL_SECTIONS.search(r["subsection"])) and not ALCOHOL_FREE.search(r["name"]):
        return "alcoholic drink"
    if ALCOHOL_NAMES.search(r["name"]) and not ALCOHOL_FREE.search(r["name"]):
        return "alcoholic drink (named)"
    return None


def season(pages: Path, key: str) -> set[str]:
    names = set()
    for f in (pages / key).glob("*.html"):
        names |= set(re.findall(r'data-file-name="([A-Z0-9]+)-', f.read_text(encoding="utf-8", errors="replace")))
    return names


def item_name(r: dict) -> str:
    name = title_name(r["name"])
    if r["role"] == "option":
        if r["group"] == "Add":
            return f"Add {name}"
        if r["group"].lower() in ("add a sauce", "choose a sauce"):
            return f"{name} (sauce)"
        if r["group"].lower() == "choose a topping":
            return f"{name} (topping)"
        raise SystemExit(f"{r['name']}: an add-on under the new heading {r['group']!r}: decide how it is named")
    return name


def build(pages: Path) -> tuple[list[dict], list[tuple[str, str]], list[str], dict]:
    report: list[str] = []
    vp = venue_pages(pages)
    used: dict[str, int] = {}          # page key -> venues linking it
    for url, venues in vp.items():
        key = page_key(url)
        found = season(pages, key)
        if key in SUPERSEDED:
            if found != {SUPERSEDED[key]}:
                raise SystemExit(f"{key}: its menus are now {sorted(found)}: re-check whether it is still a past season's page")
            report.append(f"not used: {key} (linked by {', '.join(venues)}) holds the past Spring/Summer 2026 menu")
            continue
        if found != {CURRENT_SEASON}:
            raise SystemExit(f"{key}: menus {sorted(found)}, expected {CURRENT_SEASON}: the season changed, re-check every page")
        used[key] = len(venues)
    printed: dict[tuple, dict[str, dict]] = {}
    order: list[tuple] = []
    skipped = []
    for url in vp:
        key = page_key(url)
        if key not in used:
            continue
        for r in read_page(pages, url):
            where = f"{key} {r['menu']} > {r['section']} > {r['name']}"
            why = skip_reason(r)
            if why:
                skipped.append((key, r["menu"], r["name"], why))
                continue
            kcal, problem = lp.calories(r)
            if problem:
                raise SystemExit(f"{key} {r['menu']}: {problem}")
            if bool(kcal) != bool(r["energy"]):
                raise SystemExit(f"{where}: the figure beside the dish and the pop-up disagree about whether there is a figure")
            if not kcal:
                skipped.append((key, r["menu"], r["name"], "no calories printed"))
                continue
            al = lp.allergens(r, where, EXTRA_ALLERGEN_WORDS)
            if al is None:
                raise SystemExit(f"{where}: no allergen data to check against; the page layout changed")
            suitable = {x.lower() for x in r["suitable"]}
            if suitable - {"vegan", "vegetarian"}:
                raise SystemExit(f"{where}: unknown 'Suitable for' value(s) {sorted(suitable)}")
            ids = set(r["label_ids"][0])
            if ("52" in ids) != ("vegan" in suitable) or ("50" in ids) != ("vegetarian" in suitable):
                raise SystemExit(f"{where}: 'Suitable for' {sorted(suitable)} disagrees with the label ids")
            dkey = (r["menu"], r["section"], r.get("base", ""), r["group"], r["name"])
            akey = (tuple(sorted(al["contains"])), tuple(sorted(al["may_contain"])), tuple(sorted(al["cereals"])), tuple(sorted(al["nuts"])))
            val = {"kcal": kcal, "al": akey, "veg": tuple(sorted(suitable)), "row": r, "allergens": al}
            pages_for = printed.setdefault(dkey, {})
            if key in pages_for:
                if (pages_for[key]["kcal"], pages_for[key]["al"]) != (kcal, akey):
                    raise SystemExit(f"{where}: printed twice on one page with different figures")
                continue
            pages_for[key] = val
            if dkey not in order:
                order.append(dkey)
    entries = []
    for dkey in order:
        pv = printed[dkey]
        variants = {(v["kcal"], v["al"], v["veg"]) for v in pv.values()}
        venues = sum(used[k] for k in pv)
        menu, section, base, group, name = dkey
        if len(variants) > 1:
            detail = "; ".join(f"{k}: {v['kcal']} kcal" for k, v in sorted(pv.items()))
            report.append(f"left out (pages differ): {menu} > {section} > {name}: {detail}")
            continue
        if venues < MIN_VENUES:
            report.append(f"left out (printed for {venues} venue only): {menu} > {section} > {name}")
            continue
        v = next(iter(pv.values()))
        r = v["row"]
        entries.append({**r, "kcal": v["kcal"], "al": v["allergens"], "tidy": item_name(r), "category": category(r),
                        "vegan": "vegan" in v["veg"], "vegetarian": bool(v["veg"]), "venues": venues, "pages": sorted(pv)})

    def sig(e):
        a = e["al"]
        return (e["tidy"], e["kcal"], tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])),
                tuple(sorted(a["nuts"])), e["vegetarian"], e["vegan"])

    kept: dict = {}
    for e in entries:
        k = sig(e)
        if k in kept:
            report.append(f"dropped repeat: {e['menu']} > {e['section']} > {e['tidy']} ({e['kcal']} kcal) = {kept[k]['menu']} > "
                          f"{kept[k]['section']} > {kept[k]['tidy']}")
            continue
        kept[k] = e
    entries = list(kept.values())
    by_name: dict = {}
    for e in entries:
        by_name.setdefault(slug(e["tidy"]), []).append(e)
    for group in by_name.values():
        if len(group) > 1:
            suffixes = [e["category"].lower() for e in group]
            if len(set(suffixes)) < len(suffixes):
                suffixes = [f"{e['category'].lower()}, {e['menu'].lower()}" for e in group]
            if len(set(suffixes)) < len(suffixes):
                suffixes = [f"{e['category'].lower()}, {e['menu'].lower()}" + (f", with {e['base']}" if e.get("base") else "")
                            for e in group]
            for e, suffix in zip(group, suffixes):
                e["tidy"] = f"{e['tidy']} ({suffix})"
                report.append(f"same name on different dishes, renamed: {e['tidy']!r} ({e['kcal']} kcal)")
    names = [slug(e["tidy"]) for e in entries]
    if len(set(names)) != len(names):
        raise SystemExit(f"names still not unique: {sorted(n for n in names if names.count(n) > 1)}")
    items = []
    for e in entries:
        tags = ["vegetarian"] if e["vegetarian"] else []
        meat, unspecified = tk.meat_tags(e["name"], e["desc"], vegetarian=e["vegetarian"])
        if not e["vegetarian"] and "contains_pork" not in meat and PIG.search(f"{e['name']} {e['desc']}"):
            meat.append("contains_pork")
        tags += meat
        if unspecified and not e["vegetarian"]:
            report.append(f"meat type not stated: {e['tidy']}")
        group_txt = f" > the {e['group']!r} block after {e['base']}" if e["group"] else ""
        notes = [f"Printed {e['name']!r} under {e['menu']} > {e['section']}{group_txt}, '{e['energy']}', on {len(e['pages'])} of "
                 f"{len(used)} menu pages ({e['venues']} venues)"]
        if e["role"] == "option":
            notes.append("an add-on with its own figure, not a dish total")
        bad = NOT_VEGAN if e["vegan"] else NOT_VEGETARIAN
        if e["vegetarian"] and (set(e["al"]["contains"]) & bad):
            msg = f"{'Vegan' if e['vegan'] else 'Vegetarian'} mark but contains {sorted(set(e['al']['contains']) & bad)}"
            notes.append(msg)
            report.append(f"{e['tidy']}: {msg}")
        items.append({"id": slug(e["tidy"]), "name": e["tidy"], "category": e["category"], "serving": "", "calories": e["kcal"],
                      "tags": "|".join(tags), "rankable": False, "limited_time": e["menu"] in LIMITED_MENUS, "notes": "; ".join(notes),
                      "allergens": e["al"]})
    from collections import Counter
    report.append(f"skipped printings: {dict(Counter(w for _, _, _, w in skipped))}")
    return items, [], report, used


def category(r: dict) -> str:
    if r["menu"] in ONE_CATEGORY:
        return ONE_CATEGORY[r["menu"]]
    key = (r["menu"], r["section"])
    if key not in CATEGORY:
        raise SystemExit(f"new section {r['section']!r} (sub-section {r['subsection']!r}) on the {r['menu']} menu: add it to CATEGORY")
    return CATEGORY[key]


def title_name(printed: str) -> str:
    return " ".join(printed.split())


def explore(pages: Path) -> None:
    """Print every (menu, section, sub-section) with its dish count per page: used to fill CATEGORY."""
    from collections import Counter
    for url, venues in venue_pages(pages).items():
        rows = read_page(pages, url)
        c = Counter((r["menu"], r["section"], r["subsection"]) for r in rows)
        print(f"== {page_key(url)} ({len(venues)} venues): {len(rows)} rows")
        for k, n in c.items():
            print("  ", k, n)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--explore", action="store_true")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    if args.explore:
        explore(args.pages)
        return 0
    items, holdback, report, used = build(args.pages)
    first = TK_PREFIX + "cosyclubss26"
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Cosy Club", cuisine="Cafe bar",
        source_title=("Cosy Club menus on Ten Kites linked from each venue's menu page (menus.tenkites.com/loungers/cosyclubss26 and its "
                      "sister pages cosyclubss2602, cosyclubss2604, cosyclubss2605, cosyclubss2606: Autumn/Winter 2026 Breakfast, Lunch, "
                      f"Dinner, Desserts, Kids, Gluten Free, Vegan and drinks menus; read {args.checked_on})"),
        source_url=first, checked_on=args.checked_on, aliases=["cosy club", "the cosy club", "cosyclub"], items=items, out=args.out,
        note=NOTE, holdback=holdback, nutrition_level="calories",
        allergen_guide={"title": f"Cosy Club allergen information on its Ten Kites menus (Autumn/Winter 2026, read {args.checked_on})",
                        "url": first, "checked_on": args.checked_on, "may_contain_published": True})
    h = hashlib.sha256()
    for f in sorted(args.pages.rglob("*.html")):
        if f.parent.name in used:
            h.update(f.read_bytes())
    print(f"pages used: {used}; combined sha256 of their saved menus {h.hexdigest()}")
    print("\n".join(report))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
