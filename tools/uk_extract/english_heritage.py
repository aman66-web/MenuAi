#!/usr/bin/env python3
"""Build data/source/english-heritage/ from English Heritage's own food data portal (a CALORIES-ONLY chain, with complete allergens).

    python3 tools/uk_extract/english_heritage.py --cache DIR --checked-on 2026-10-08 [--fetch] [--products DIR] [--out DIR]

Source: https://englishheritage.mysaffronportal.com/Menus  (Civica Food Data Hub, "v2.16.0.25" in the footer; linked from the
food-and-drink pages of english-heritage.org.uk as "allergen and nutritional information"). The portal's robots.txt answers 404 (no
rules) and the pages need no login. It lists 36 menus (8 per page, 5 pages): one per site cafe/tearoom/kiosk plus "Seasonal Menu" and
"Soft Scoop Ice Cream". Every menu page is server-rendered HTML (see english_heritage_pages.py) and shows each dish TWICE (a narrow
list and a wide table); both renderings are parsed with different code and must agree on every figure and every allergen mark.
--fetch downloads the list pages and every menu once into --cache (browser User-Agent, one request per second); without it the
script reads --cache only. All 36 menus are read.

--products DIR (with --fetch it downloads the missing pages, 503 requests at one per second, about 20 minutes) adds a third, independent
check: every published dish's own product page (/Products/<id>) is read with different code and must repeat the menu's kcal, kJ, fat,
saturates, sugars, salt and allergen words exactly; the page's per-100 g column must agree with the per-portion figures (implied portion
weight from calories, fat and salt within a factor of 2 and under 1.5 kg), and a portion label that is a gram weight ("Each 283g
contains") is published as weight_g. Without --products the run still works, but weight_g stays blank and the Cottage Pie hold-back (see
PRODUCT_HOLDBACK) is kept without being re-derived.

What the portal prints per dish ("Each portion contains"): energy as "583kcal (2439kJ)", Fat, Saturates, Sugars, Salts (grams) and the
allergen marks of the 14 UK allergens ("Contains X" / "May Contain X", with the named cereals and tree nuts nested under them) and
"Suitable for a Halal / Vegan / Vegetarian Diet". There is NO protein, carbohydrate or fibre anywhere (the product pages repeat the same five
nutrients per portion and per 100 g; the filter form that mentions protein and carbohydrate has nothing behind it), so this is a
calories-only chain (docs/DATA.md "Calories-only chains"). Published per dish: calories, energy_kj, sat_fat_g, sugar_g, salt_g. Total fat IS
printed, but DATA.md says protein, carbs and fat stay blank for a calories-only chain, so fat_g is left blank and the printed value is
kept in the item's notes (set PUBLISH_FAT = True to publish it). Portion weights are not printed, so `serving` is blank.

The menus differ by site: the same dish name often has different figures at different sites (the portal builds each site's recipe
separately: "Cream Tea" has 20 different calorie values over 36 menus). Founder's rule for this chain: publish a dish ONLY when every
one of its printed figures (kcal, kJ, fat, saturates, sugars, salt), its allergen marks (contains / may contain, with the named cereals and
nuts) and its diet flags are identical in EVERY menu that prints that dish name; differing figures are never merged, picked from or
averaged, the dish is left out (and listed in the run's output). Dish names are compared exactly as printed except for capitalisation,
spaces, "&" / "and" and punctuation (so "Strawberry Ice Cream Milkshake" and "...MilkShake", which differ, count as one dish and are left
out; likewise "Leek & Potato Soup" and "Leek and Potato Soup"). A dish printed in one menu only is published from that menu (its notes say so). The same dish listed twice in one menu (identical
figures) counts once.

Allergens (docs/DATA.md "Allergens") are complete: every published dish has its marks from the same portal page. The portal never
prints a "not known" state, so a dish with no mark is a dish the portal lists as free of all 14 (25 dishes print no mark at all, mostly
drinks and plain items). "Suitable for ... Diet" lines, halal flags and the free-text line under a dish name are not allergens. The named
cereals (wheat, rye, barley, oats) and tree nuts listed under a "Contains" line are published; named ones printed only as "May Contain"
cannot be expressed (the format names contained cereals and nuts only), so a dish that contains one nut or cereal but only MAY contain
others shows the contained ones; its key (gluten / nuts) is still "contains", so nobody is told a gluten or nut dish is free of it.

Tags: vegetarian when the portal's own flag says "Suitable for a Vegetarian / Vegan Diet" or the line under the name says exactly
"Suitable for vegans" / "Suitable for vegetarians", unless the same dish's allergens say it contains fish, crustaceans or molluscs (then it
is not tagged and the clash is reported). contains_pork / contains_beef only when the dish NAME says so (ingredients are not read).

Sanity (docs/UK_DATA_PLAYBOOK.md): HOLDBACK names dishes whose OWN figures are impossible or absurd for one portion; they stay in items.csv
and are listed in holdback.csv (never corrected). The script stops if a sanity detector finds anything not in HOLDBACK.
"""
from __future__ import annotations
import argparse
import collections
import hashlib
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import english_heritage_pages as pages  # noqa: E402
from common import allergen_words, write_chain_folder  # noqa: E402

CHAIN_ID = "english-heritage"
HOST = "https://englishheritage.mysaffronportal.com"
SOURCE_URL = HOST + "/Menus"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SOURCE_TITLE = ("English Heritage food and drink: allergen and nutritional information, all 36 menus of the Civica Food Data Hub portal "
                "(v2.16.0.25; accessed {checked_on}, no date shown)")
ALLERGEN_GUIDE_TITLE = ("English Heritage allergen and nutritional information, Civica Food Data Hub portal (v2.16.0.25; accessed {checked_on}, "
                        "no date shown)")
ALLERGEN_GUIDE_URL = SOURCE_URL
MAY_CONTAIN_PUBLISHED = True
ALIASES = ["english heritage", "english heritage cafe", "english heritage cafes", "english heritage tearoom", "english heritage restaurant",
           "english heritage kiosk"]
NAME = "English Heritage Cafes"
CUISINE = "Cafe"
PUBLISH_FAT = False  # DATA.md: fat stays blank for a calories-only chain; the printed value goes in the notes column

EXPECTED_MENUS = 36
EXPECTED_DISH_ROWS = 2364        # dish blocks over all 36 menus (a dish is listed once per menu and course)
EXPECTED_DISHES = 531            # distinct dishes (names compared as above)
EXPECTED_CONFLICTS = 28          # dishes whose figures differ between menus: left out
EXPECTED_PUBLISHED = 503         # items in items.csv (of which HOLDBACK are not published)

NOTE = ("Read from all 36 site menus of English Heritage's food portal. Menus differ by site, so a dish is listed only if its figures and "
        "allergens are identical on every menu that prints it (28 differing dishes left out); it may not be sold at every site. Calories "
        "only, per portion: no protein or carbs. Named nuts and cereals a dish only may contain aren't listed.")

# Course names as the portal prints them -> the category shown (display order = this order).
CATEGORY_LABEL = {"Breakfast": "Breakfast", "Light Bites": "Light Bites", "Sandwiches & Wraps": "Sandwiches & Wraps", "Soups": "Soups",
                  "Salads": "Salads", "Starters": "Starters", "Main Meals": "Main Meals", "Specials": "Specials",
                  "Extra Portion": "Extra Portion", "Childrens": "Children's", "Cakes & Desserts": "Cakes & Desserts",
                  "Desserts": "Desserts", "Ice Cream": "Ice Cream", "Hot Beverages": "Hot Beverages", "Cold Beverages": "Cold Beverages",
                  "Items not on a course": "Other items"}
CATEGORY_ORDER = list(CATEGORY_LABEL.values())

PORK = re.compile(r"\b(pork|bacon|ham|gammon|sausage|sausages|pepperoni|salami|chorizo|pancetta|prosciutto)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
VEGGIE_NAME = re.compile(r"\b(vegan|vegetarian|veggie|plant based|meat free|isn't)\b", re.I)  # "This Isn't Sausage" is a vegan product

# Dishes held back: (name as printed) -> why. Figures are quoted exactly as printed (identical in every menu that prints the dish).
HOLDBACK = {
    "Carrot & Sweet Potato Soup with Roll & Butter": "Printed 29551 kcal, 358 g sugars and 170.3 g salt for one portion (its own product page: 230 kcal per 100 g): impossible; left out until the portal is corrected",
    "Curried Parsnip Soup with Roll & Butter": "Printed 29059 kcal, 321 g sugars and 170.9 g salt for one portion: impossible; left out until the portal is corrected",
    "Garden Vegetable Soup with Roll & Butter": "Printed 7198.4 kcal, 1432.4 g sugars and 17.8 g salt for one portion: impossible; left out until the portal is corrected",
    "Sticky Toffee Muffin": "Printed 6670 kcal, 352 g fat, 387 g sugars: its product page gives the portion as '1 x 16 x 110g' (a tray of 16), so not one muffin; left out until the portal is corrected",
}
# Dishes held back because the portal's own product page contradicts the menu's per-portion figures (found by check_products, so only
# re-derived when --products is given).
PRODUCT_HOLDBACK = {
    "Cottage Pie": "Printed 879 kcal and 40 g fat per portion, but its own product page prints 24 kcal and 1.1 g fat per 100 g, which would make the portion 3.6 kg: the two cannot both be right; left out until the portal is corrected",
}


def norm(name: str) -> str:
    """Dish-name key: capitalisation, spacing, '&'/'and' and punctuation ignored."""
    s = name.casefold().replace("&", " and ").replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "", s)


# ---------------------------------------------------------------------------------------------------------- fetching
def _get(url: str, delay_state: dict) -> bytes:
    wait = 1.0 - (time.time() - delay_state.get("last", 0.0))
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(3):
        try:
            data = urllib.request.urlopen(req, timeout=60).read()
            break
        except urllib.error.HTTPError as e:
            raise SystemExit(f"STOP: {url} answered HTTP {e.code}. A refusal is never worked round: download the page in a browser and put it in --cache instead.")
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:  # a dropped connection is not a refusal: wait and retry twice
            if attempt == 2:
                raise SystemExit(f"STOP: {url} failed three times ({e!r})")
            time.sleep(10)
    delay_state["last"] = time.time()
    return data


def check_robots(delay_state: dict) -> str:
    """The portal's robots.txt answers 404 (no rules). If it ever has rules, obey them."""
    url = HOST + "/robots.txt"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        body = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "robots.txt: HTTP 404 (no rules)"
        raise SystemExit(f"STOP: robots.txt answered HTTP {e.code}")
    delay_state["last"] = time.time()
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(body.splitlines())
    for path in ("/Menus", "/Menus/Details/x"):
        if not rp.can_fetch(USER_AGENT, HOST + path):
            raise SystemExit(f"STOP: robots.txt disallows {path}:\n{body}")
    return "robots.txt allows /Menus"


def load_pages(cache: Path, do_fetch: bool) -> tuple[list[tuple[str, str, str, str]], list[str]]:
    """-> ([(slug_path, menu title, html, sha256)], log lines). Reads (and with do_fetch downloads) the list pages and menus."""
    cache.mkdir(parents=True, exist_ok=True)
    state: dict = {}
    log = []
    if do_fetch:
        log.append(check_robots(state))

    def read(fname: str, url: str) -> bytes:
        path = cache / fname
        if not path.exists():
            if not do_fetch:
                raise SystemExit(f"{path} is missing: run with --fetch (one polite download of each page)")
            path.write_bytes(_get(url, state))
        return path.read_bytes()

    menus: list[tuple[str, str]] = []
    total = None
    page = 1
    while True:
        data = read(f"menus-page{page}.html", f"{HOST}/Menus" + (f"?page={page}" if page > 1 else ""))
        text = data.decode("utf-8")
        first, last, tot = pages.list_summary(text)
        total = tot if total is None else total
        found = pages.parse_menu_list(text)
        if len(found) != last - first + 1:
            raise SystemExit(f"Menus page {page}: {len(found)} menus linked but the page says items {first} to {last}")
        menus.extend(found)
        if last >= tot:
            break
        page += 1
    if len(menus) != total or total != EXPECTED_MENUS:
        raise SystemExit(f"The portal lists {total} menus ({len(menus)} read); expected {EXPECTED_MENUS}. Menus were added or removed: re-check the script's counts and note.txt")
    if len({m[0] for m in menus}) != len(menus):
        raise SystemExit("A menu is linked twice")
    out = []
    for slug_path, title in menus:
        fname = "menu-" + re.sub(r"[^a-z0-9]+", "-", slug_path.split("/Menus/Details/")[1].lower()).strip("-") + ".html"
        data = read(fname, HOST + urllib.parse.quote(slug_path))
        out.append((slug_path, title, data.decode("utf-8"), hashlib.sha256(data).hexdigest()))
    return out, log


# ---------------------------------------------------------------------------------------------------------- reading
def read_menus(loaded: list[tuple[str, str, str, str]]) -> list[dict]:
    """Parse every menu with both readers and require them to agree on every dish."""
    menus = []
    for slug_path, list_title, text, sha in loaded:
        where = slug_path
        menu = pages.parse_menu(text, where)
        rows = pages.parse_menu_table(text, where)
        if menu["title"] != list_title:
            raise SystemExit(f"{where}: page heading {menu['title']!r} differs from the menu list's {list_title!r}")
        if len(rows) != len(menu["items"]):
            raise SystemExit(f"{where}: the list view has {len(menu['items'])} dishes, the table view {len(rows)}")
        for a, b in zip(menu["items"], rows):
            same = (a["product_id"], a["name"], a["kcal"], a["kj"], a["fat"], a["sat_fat"], a["sugar"], a["salt"]) == \
                   (b["product_id"], b["name"], b["kcal"], b["kj"], b["fat"], b["sat_fat"], b["sugar"], b["salt"])
            same = same and a["contains"] == {h for h, v in b["marks"].items() if v == "contains"}
            same = same and a["may_contain"] == {h for h, v in b["marks"].items() if v == "may"}
            same = same and {w for _, w in a["contains_sub"]} == set(b["sub_contains"]) and {w for _, w in a["may_sub"]} == set(b["sub_may"])
            if not same:
                raise SystemExit(f"{where}: dish {a['name']!r}: the list view and the table view disagree: {a} / {b}")
        menu["slug"], menu["sha"] = slug_path, sha
        menus.append(menu)
    return menus


def signature(d: dict) -> tuple:
    return (d["kcal"], d["kj"], d["fat"], d["sat_fat"], d["sugar"], d["salt"], tuple(sorted(d["contains"])), tuple(sorted(d["may_contain"])),
            tuple(sorted(d["contains_sub"])), tuple(sorted(d["may_sub"])), tuple(d["flags"]))


def num(s: str) -> float:
    return float(s.lstrip("<"))


def sanity_flags(d: dict) -> list[str]:
    kc, kj, fat, sat, sug, salt = (num(d[k]) for k in ("kcal", "kj", "fat", "sat_fat", "sugar", "salt"))
    out = []
    if sat > fat:
        out.append("saturates > fat")
    if kc >= 20 and not 3.9 < kj / kc < 4.5:
        out.append("kJ/kcal = %.2f" % (kj / kc))
    if 9 * fat > kc * 1.12 + 5:
        out.append("fat alone exceeds the calories")
    if 4 * sug > kc * 1.12 + 5:
        out.append("sugars alone exceed the calories")
    if kc >= 2500 or salt >= 15 or sug > 300 or fat > 200:
        out.append("absurd for one portion")
    return out


def allergen_row(d: dict, where: str) -> dict:
    """Printed words -> the 14 keys (+ named cereals / nuts that the dish CONTAINS)."""
    for par, w in d["contains_sub"]:
        if par not in d["contains"]:
            raise SystemExit(f"{where}: sub-allergen 'Contains {w}' under {par!r}, which the dish does not 'Contain'")
    for par, w in d["may_sub"]:
        if par not in d["may_contain"] and par not in d["contains"]:
            raise SystemExit(f"{where}: sub-allergen 'May Contain {w}' under {par!r}, which the dish neither contains nor may contain")
    contains, _, _ = allergen_words(sorted(d["contains"]), where)
    may, _, _ = allergen_words(sorted(d["may_contain"]), where)
    _, cereals, _ = allergen_words(sorted(w for p, w in d["contains_sub"] if p == "Cereals containing Gluten"), where)
    _, _, nuts = allergen_words(sorted(w for p, w in d["contains_sub"] if p == "Nuts"), where)
    others = [(p, w) for p, w in d["contains_sub"] if p not in ("Cereals containing Gluten", "Nuts")]
    if others:
        raise SystemExit(f"{where}: named sub-allergens under {others}: add them to the script before publishing")
    for p_, w in d["may_sub"]:
        if p_ not in ("Cereals containing Gluten", "Nuts"):
            raise SystemExit(f"{where}: May Contain {w} under {p_!r}: not understood")
    return dict(contains=contains, may_contain=may, cereals=cereals, nuts=nuts)


def lost_may_specifics(d: dict) -> list[str]:
    """Named cereals / nuts printed only as 'May Contain' under a key the dish contains (not expressible in allergens.csv)."""
    have = {w for _, w in d["contains_sub"]}
    return sorted(w for p, w in d["may_sub"] if p in d["contains"] and w not in have)


# ---------------------------------------------------------------------------------------------------------- build
def build(menus: list[dict]) -> dict:
    # 1. one record per (menu, dish): collapse a dish listed twice in one menu when every figure is identical.
    per_menu = []
    for m in menus:
        seen: dict = {}
        for d in m["items"]:
            key = norm(d["name"])
            if key in seen:
                if signature(seen[key]) != signature(d) or seen[key]["product_id"] != d["product_id"]:
                    seen[key]["_conflict_in_menu"] = True
                seen[key]["_courses"].append(d["course"])
                continue
            d["_courses"] = [d["course"]]
            seen[key] = d
        per_menu.append((m, seen))
    rows = sum(len(m["items"]) for m in menus)
    if rows != EXPECTED_DISH_ROWS:
        raise SystemExit(f"{rows} dish rows over the {len(menus)} menus; expected {EXPECTED_DISH_ROWS}: the portal's menus changed, re-check the script's counts")
    # 2. group by dish name over all menus
    groups: dict = collections.OrderedDict()
    for m, seen in per_menu:
        for key, d in seen.items():
            groups.setdefault(key, []).append((m, d))
    if len(groups) != EXPECTED_DISHES:
        raise SystemExit(f"{len(groups)} distinct dishes; expected {EXPECTED_DISHES}: re-check the script's counts")
    published, conflicts = [], []
    for key, lst in groups.items():
        sigs = {signature(d) for _, d in lst}
        if len(sigs) > 1 or any(d.get("_conflict_in_menu") for _, d in lst):
            conflicts.append((key, lst))
        else:
            published.append((key, lst))
    if len(conflicts) != EXPECTED_CONFLICTS or len(published) != EXPECTED_PUBLISHED:
        raise SystemExit(f"{len(conflicts)} dishes differ between menus and {len(published)} agree; expected {EXPECTED_CONFLICTS} and {EXPECTED_PUBLISHED}: re-check")
    return dict(published=published, conflicts=conflicts, rows=rows)


def make_items(published: list, menu_count: int) -> tuple[list[dict], dict]:
    items, stats = [], collections.Counter()
    held_names = set()
    flagged_unexpected = []
    for key, lst in published:
        name_counts = collections.Counter(d["name"] for _, d in lst)
        name = sorted(name_counts, key=lambda n: (-name_counts[n], [d["name"] for _, d in lst].index(n)))[0]
        d = lst[0][1]
        where = f"{name!r}"
        if len({d2["product_id"] for _, d2 in lst}) > 1:
            stats["same figures, several product ids"] += 1
        if len(name_counts) > 1:
            stats["printed with different capitalisation (same figures)"] += 1
        courses = collections.Counter(c for _, d2 in lst for c in d2["_courses"])
        first_seen = []
        for _, d2 in lst:
            for c in d2["_courses"]:
                if c not in first_seen:
                    first_seen.append(c)
        course = sorted(courses, key=lambda c: (-courses[c], first_seen.index(c)))[0]
        if course not in CATEGORY_LABEL:
            raise SystemExit(f"{where}: new course name {course!r}: add it to CATEGORY_LABEL")
        allergens = allergen_row(d, where)
        lost = lost_may_specifics(d)
        if lost:
            stats["dishes with 'may contain' nuts/cereals not expressible"] += 1
        flags = d["flags"]
        note_line = d["note"]
        veg_claim = "Vegetarian" in flags or "Vegan" in flags or note_line in ("Suitable for vegans", "Suitable for vegetarians")
        tags = []
        if veg_claim and (allergens["contains"] & {"fish", "crustaceans", "molluscs"}):
            stats["vegetarian claim contradicted by fish/crustacean/mollusc allergen (not tagged)"] += 1
        elif veg_claim:
            tags.append("vegetarian")
        if PORK.search(name) and not VEGGIE_NAME.search(name) and not veg_claim:
            tags.append("contains_pork")
        if BEEF.search(name) and not VEGGIE_NAME.search(name) and not veg_claim:
            tags.append("contains_beef")
        menus_with = [m["title"] for m, _ in lst]
        notes = [f"Menus: {len(lst)} of {menu_count}" + (" (" + menus_with[0] + ")" if len(lst) == 1 else ""), f"portal id {d['product_id']}",
                 f"fat {d['fat']} g printed" + ("" if PUBLISH_FAT else " (blank: calories-only chain)")]
        if note_line:
            notes.append(f"portal line under the name: {note_line!r}")
        if flags:
            notes.append("portal diet flags: " + "/".join(flags))
        if len(set(courses)) > 1:
            notes.append("listed under: " + ", ".join(f"{c} ({courses[c]})" for c in sorted(courses, key=lambda c: -courses[c])))
        if lost:
            notes.append("may-contain only (not in allergens.csv): " + ", ".join(lost))
        item = dict(_dish=d, _pid=d["product_id"], name=name, category=CATEGORY_LABEL[course], calories=d["kcal"], energy_kj=d["kj"], sat_fat_g=d["sat_fat"], sugar_g=d["sugar"],
                    salt_g=d["salt"], tags="|".join(tags), rankable=False, allergens=allergens, notes="; ".join(notes))
        if PUBLISH_FAT:
            item["fat_g"] = d["fat"]
        sf = sanity_flags(d)
        if name in HOLDBACK:
            if not sf:
                raise SystemExit(f"{name!r} is in HOLDBACK but no sanity detector flags it any more: re-check")
            held_names.add(name)
        elif sf:
            flagged_unexpected.append((name, sf, {k: d[k] for k in ("kcal", "kj", "fat", "sat_fat", "sugar", "salt")}))
        items.append(item)
    if flagged_unexpected:
        raise SystemExit("Sanity detectors flag dishes that are not in HOLDBACK (decide: hold back, or explain in a comment):\n"
                         + "\n".join(f"  {n}: {f} {v}" for n, f, v in flagged_unexpected))
    if held_names != set(HOLDBACK):
        raise SystemExit(f"HOLDBACK names not found among the published dishes: {sorted(set(HOLDBACK) - held_names)}")
    missing = sorted(set(PRODUCT_HOLDBACK) - {it["name"] for it in items})
    if missing:
        raise SystemExit(f"PRODUCT_HOLDBACK names not found among the published dishes: {missing}")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    items.sort(key=lambda it: order[it["category"]])  # stable: dishes keep first-seen order inside a category
    return items, stats


# ---------------------------------------------------------------------------------------------------------- product pages
def load_products(items: list[dict], folder: Path, do_fetch: bool) -> dict:
    """{product id: html} for every dish, from --products (downloaded politely when --fetch is given)."""
    folder.mkdir(parents=True, exist_ok=True)
    state: dict = {}
    out = {}
    for it in items:
        pid = it["_pid"]
        path = folder / (pid + ".html")
        if not path.exists():
            if not do_fetch:
                raise SystemExit(f"{path} is missing: run with --fetch (one polite download of each product page)")
            path.write_bytes(_get(f"{HOST}/Products/{urllib.parse.quote(pid)}", state))
        out[pid] = path.read_text(encoding="utf-8")
    return out


def check_products(items: list[dict], products: dict) -> dict:
    """Compare every dish with its product page; returns {item name: weight in grams} for portions labelled as a weight and
    the set of names whose per-100 g column contradicts the per-portion figures."""
    weights, inconsistent = {}, set()
    for it in items:
        d, pid = it["_dish"], it["_pid"]
        pr = pages.parse_product(products[pid], pid)
        where = f"{it['name']!r} (product {pid})"
        expected = " ".join(x for x in (d["name"], d["note"]) if x)
        if pr["name_line"] != expected and not pr["name_line"].startswith(d["name"]):
            raise SystemExit(f"{where}: product page heading {pr['name_line']!r} differs from the menu's {expected!r}")
        for k in ("kcal", "kj", "fat", "sat_fat", "sugar", "salt"):
            if pr[k] != d[k]:
                raise SystemExit(f"{where}: {k} is {d[k]} on the menu but {pr[k]} on the product page")
        menu_contains = set(d["contains"]) | {w for _, w in d["contains_sub"]}
        menu_may = set(d["may_contain"]) | {w for _, w in d["may_sub"]}
        if pr["contains"] != menu_contains or pr["may"] != menu_may:
            raise SystemExit(f"{where}: allergens differ: menu {sorted(menu_contains)} / {sorted(menu_may)}, product page {sorted(pr['contains'])} / {sorted(pr['may'])}")
        w = re.match(r"^(\d+(?:\.\d+)?)g$", pr["label"])
        if w:
            weights[it["name"]] = w.group(1)
        # per-100 g column against the per-portion figures: implied portion weights must agree and be a plausible plate
        implied = []
        p100, ptn = pr["per100"], pr["portion_table"]
        if num(p100["kcal"]) >= 20:
            implied.append(num(ptn["kcal"]) / num(p100["kcal"]) * 100)
        for key in ("fat", "salt"):
            floor = 1 if key == "fat" else 0.2
            if not p100[key].startswith("<") and num(p100[key]) >= floor:
                implied.append(num(ptn[key]) / num(p100[key]) * 100)
        if (len(implied) >= 2 and max(implied) / min(implied) > 2.0) or (implied and max(implied) > 1500) or " x " in pr["label"]:
            inconsistent.add(it["name"])
    return dict(weights=weights, inconsistent=inconsistent)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True, help="folder holding (or receiving) the downloaded portal pages")
    ap.add_argument("--fetch", action="store_true", help="download missing pages (one request per second)")
    ap.add_argument("--products", type=Path, default=None, help="folder of product pages for the extra per-dish check (see the docstring)")
    ap.add_argument("--checked-on", required=True, help="the day the pages were read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    loaded, log = load_pages(args.cache, args.fetch)
    for line in log:
        print(line)
    manifest = "".join(f"{slug}  {sha}\n" for slug, _, _, sha in sorted(loaded))
    print(f"{len(loaded)} menu pages read; sha256 of the sorted '<menu path>  <sha256>' list: {hashlib.sha256(manifest.encode()).hexdigest()}")
    menus = read_menus(loaded)
    result = build(menus)
    items, stats = make_items(result["published"], len(menus))
    if args.products:
        res = check_products(items, load_products(items, args.products, args.fetch))
        unexplained = res["inconsistent"] - set(HOLDBACK) - set(PRODUCT_HOLDBACK)
        if unexplained:
            raise SystemExit(f"The product pages' per-100 g columns contradict the per-portion figures of {sorted(unexplained)}: decide, then add to PRODUCT_HOLDBACK")
        not_flagged = set(PRODUCT_HOLDBACK) - res["inconsistent"]
        if not_flagged:
            raise SystemExit(f"{sorted(not_flagged)} are in PRODUCT_HOLDBACK but the product pages no longer contradict them: re-check")
        for it in items:
            if it["name"] in res["weights"]:
                it["weight_g"] = res["weights"][it["name"]]
        print(f"product pages: all {len(items)} dishes repeat the menu's figures and allergens; weights printed for {len(res['weights'])}: "
              + ", ".join(f"{n} {w} g" for n, w in sorted(res["weights"].items())))
    # holdback.csv wants item ids, which write_chain_folder assigns: it uses slug(name) (names are unique after norm(); check here).
    from common import slug
    ids = [slug(it["name"]) for it in items]
    if len(set(ids)) != len(ids):
        dup = sorted(i for i, c in collections.Counter(ids).items() if c > 1)
        raise SystemExit(f"Two dishes share the item id(s) {dup}: give them explicit ids")
    held = dict(HOLDBACK)
    held.update(PRODUCT_HOLDBACK)  # always held; --products re-derives them
    holdback = [(slug(n), why) for n, why in held.items()]
    guide = {"title": ALLERGEN_GUIDE_TITLE.format(checked_on=args.checked_on), "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on,
             "may_contain_published": MAY_CONTAIN_PUBLISHED}
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt is {len(NOTE)} characters; the limit is 400")
    out = write_chain_folder(chain_id=CHAIN_ID, name=NAME, cuisine=CUISINE, source_title=SOURCE_TITLE.format(checked_on=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=holdback, allergen_guide=guide, nutrition_level="calories")
    counts = collections.Counter(it["category"] for it in items)
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}: " + ", ".join(f"{c} {counts[c]}" for c in CATEGORY_ORDER if counts[c]))
    print(f"dish rows over {len(menus)} menus: {result['rows']}; distinct dishes {len(result['published']) + len(result['conflicts'])}; left out because the menus differ: {len(result['conflicts'])}")
    for key, lst in result["conflicts"]:
        values = sorted({d["kcal"] for _, d in lst}, key=num)
        print(f"  differs: {lst[0][1]['name']!r} printed in {len(lst)} menus with {len(values)} different kcal values ({values[0]} to {values[-1]})")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")
    print("tagged vegetarian:", sum("vegetarian" in it["tags"] for it in items), " pork:", sum("contains_pork" in it["tags"] for it in items),
          " beef:", sum("contains_beef" in it["tags"] for it in items))


if __name__ == "__main__":
    main()
