#!/usr/bin/env python3
"""Build data/source/belhaven-pubs/ from Belhaven's own online pub menus (a CALORIES-ONLY chain; Greene King's Scottish pubs).

    python3 -I tools/uk_extract/belhaven_pubs.py --cache DIR --checked-on 2026-10-12 [--fetch] [--out DIR]

Source: the menu data each pub page of www.belhaven.co.uk loads once a pub is picked (its allergens page and menus ask the visitor to pick a pub;
earlier triage: BLOCKED, the site answered Akamai 403 on 2026-10-09 and 2026-10-10; on 2026-10-12 robots.txt and every page answered 200). Each
pub's menu page (for example https://www.belhaven.co.uk/pubs/angus/trades-house/menu) carries the pub's venue id (`rawVenueId`) and calls
    https://www.belhaven.co.uk/api/menus/getmenus/<venue id>   every menu of the pub: categories, products, portions, calories
Greene King's pub platform, read as in farmhouse_inns.py / chef_and_brewer.py. robots.txt disallows /sitecore/, /media/, /images/, /js/ and
similar folders, not /pubs/ or /api/menus/. --fetch reads sitemap.xml, takes every /pubs/<area>/<pub>/menu page it lists (94 on 2026-10-12),
and downloads each page and then its getmenus file: about 190 requests, one every 1.2 seconds, stopping at the first refusal.
62 of the 94 pubs print menus (32 list none); the pubs run several formats (main/lunch/desserts menus, bar-snack and ciabatta menus, seniors'
and kids' menus, Sunday roasts), so menus differ by pub.

The chain prints CALORIES ONLY (one "calories" figure per portion): protein, carbohydrate and fat stay blank. Prices are not used.

Rule for chains whose sites print different menus: a dish is published only when it is printed at 2 or more pubs and every pub that prints it
(the feed's own product id and portion) prints the same calories. In addition, one printed name on menus of one kind (MENU_KIND: "Desserts
Menu" and "Dessert Menu" are one kind) and in one section with two different figures (two product ids at different pubs, e.g. a Balmoral
Burger at 1,562 and 1,771 kcal) is the same dish printed with two figures: every version is left out, never chosen between. Two products
with one name in different menus or sections (a starter and a small-plate portion, the no-gluten version, the seniors' or kids' portion) are
told apart by what the feed itself says (menu or section label); a product printed only on a no-gluten menu or section says "(no-gluten)".

Left out on purpose (counted in the run's output): every alcoholic drink (the wine, sparkling, spritz and cocktail sections; the "0%
Cocktails" section too unless the product's own name says 0%), products with no calories printed, "... of the Day" dishes, products printed
at one pub only, seasonal menus, and any product whose description says its calories are given at the counter.
Tags: vegetarian when the feed lists "Vegetarian" or "Vegan"; contains_pork / contains_beef from the dish's name or description
(tenkites_c.meat_tags). Allergens: link only (each pub's allergen menu opens Smart Chef, whose robots.txt is "Disallow: /"); the chain's own
page https://www.belhaven.co.uk/allergens is the guide link.
Second read: data/audit/verified/belhaven-pubs.json (seven pubs' menu pages rendered as a visitor sees them, each menu).
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
import tenkites_c as tk  # noqa: E402  (meat_tags)
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "belhaven-pubs"
BASE = "https://www.belhaven.co.uk"
SOURCE_URL = BASE + "/pubs/angus/trades-house/menu"
ALLERGEN_GUIDE_URL = BASE + "/allergens"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
DELAY = 1.2
MIN_PUBS = 2

# Menu names as the feed prints them -> short label used when two versions of a dish need telling apart (order = which keeps the plain name)
MENU_ORDER = ["Main Menu", "Lunch Menu", "Hot Bar Snacks", "Ciabattas", "Pizza Menu", "Sunday Roasts Menu", "Sunday Roasts", "Sunday Menu",
              "Desserts Menu", "Dessert Menu", "Seniors Menu", "Kids' Menu", "Kids' Plus Menu", "No Gluten Containing Ingredients Menu",
              "No Gluten Containing Menu", "Drinks"]
MENU_LABEL = {"Main Menu": "main menu", "Lunch Menu": "lunch menu", "Hot Bar Snacks": "bar snacks", "Ciabattas": "ciabattas",
              "Pizza Menu": "pizza menu", "Sunday Roasts Menu": "Sunday menu", "Sunday Roasts": "Sunday menu", "Sunday Menu": "Sunday menu",
              "Desserts Menu": "desserts menu", "Dessert Menu": "desserts menu", "Seniors Menu": "seniors' menu", "Kids' Menu": "kids' menu",
              "Kids' Plus Menu": "kids' plus menu", "No Gluten Containing Ingredients Menu": "no-gluten menu",
              "No Gluten Containing Menu": "no-gluten menu", "Drinks": "drinks menu"}
# The pub formats name the same kind of menu differently ("Desserts Menu" at 61 pubs, "Dessert Menu" at 15): one name printed with two
# figures on menus of one kind and in one section is the same dish with two figures (left out), not two dishes.
MENU_KIND = {"Dessert Menu": "Desserts Menu", "No Gluten Containing Menu": "No Gluten Containing Ingredients Menu",
             "Sunday Roasts": "Sunday Roasts Menu", "Sunday Menu": "Sunday Roasts Menu"}
NG_MENUS = {"No Gluten Containing Ingredients Menu", "No Gluten Containing Menu"}
SEASONAL = re.compile(r"christmas|festive|boxing|new year|valentine|mother'?s day|father'?s day|easter", re.I)
ALCOHOL_CATS = re.compile(r"\b(wine|ros[eé]|fizz|prosecco|champagne|sparking|sparkling|spritz|cocktails?|beers?|lagers?|ciders?|spirits?|gin|"
                          r"whisk(?:e)?y|vodka|rum|ales?)\b", re.I)
ALCOHOL_FREE = re.compile(r"\b0(?:\.0)?\s?%|alcohol[- ]free|non[- ]alcoholic|mocktail|\b0\.0\b", re.I)
KIDS = re.compile(r"little ones|younger guests|kids", re.I)
# Left out on purpose: every product whose own description says its calories are given at the counter (as on Farmhouse Inns' carvery plates).
AT_THE_COUNTER = re.compile(r"calorie information can be found at the", re.I)
# category (lower case, after the menu's own name) -> our category; unknown categories stop the run
CATEGORY = {
    "sharers": "Sharers", "sharer": "Sharers", "small plates": "Small plates", "small plate": "Small plates", "starters": "Starters",
    "burgers": "Burgers", "classics": "Pub classics", "pub classics": "Pub classics", "grills": "Grills", "loaded chips": "Loaded chips",
    "sides": "Sides", "sunday sides": "Sides", "mains": "Pub classics", "desserts": "Desserts", "dessert": "Desserts",
    "lunch club": "Lunch", "no gluten containing ingredients": "No-gluten lunch", "pizza": "Pizza", "bar snacks": "Bar snacks",
    "ciabattas": "Ciabattas", "sunday roast": "Sunday roasts", "sunday roasts": "Sunday roasts",
    "no gluten containing ingredients sunday": "No-gluten Sunday roasts",
}
UNRANKABLE = {"Sharers", "Sides", "Desserts", "Loaded chips", "Bar snacks", "Drinks", "Kids: starters", "Kids: mains", "Kids: puddings",
              "Kids: drinks"}
CATEGORY_ORDER = ["Starters", "Small plates", "Sharers", "Burgers", "Pub classics", "Grills", "Pizza", "Lunch", "No-gluten lunch", "Ciabattas", "Sunday roasts", "No-gluten Sunday roasts",
                  "Seniors", "Loaded chips", "Bar snacks", "Sides", "Desserts", "Kids: starters", "Kids: mains", "Kids: puddings", "Kids: drinks",
                  "Drinks"]

DAY_LABEL = {"Weekday carvery": "weekday", "Saturday carvery": "Saturday", "Sunday & bank holiday carvery": "Sunday & bank holiday"}

# Rows the feed prints impossibly or that contradict themselves: left out of the published menu (never corrected). Filled after the check.
HOLDBACK: dict[str, str] = {}

NOTE = ("Calories only, as each Belhaven pub's own online menu prints them (per portion as listed). Pubs list different dishes, so a dish "
        "is shown only if 2 or more of the pubs read print it with the same calories and none differs. Alcoholic drinks are not listed.")
assert len(NOTE) < 400


NOT_BEEF_STEAK = re.compile(r"\b(gammon|lamb|tuna|salmon|cauliflower|halloumi|chicken|pork|swordfish|celeriac|mushroom|aubergine)\s+steaks?\b", re.I)
MEAT_FREE_SAUSAGE = re.compile(r"(?:quorn|veggie|vegetarian|vegan|plant[- ]based|meat[- ]free)\W*\s*(?:\w+\s+){0,2}sausages?\W*", re.I)


def tag_text(text: str) -> str:
    """Words the pork/beef tags are read from: 'lamb steak', 'gammon steak' (pork from 'gammon') or 'cauliflower steak' must not make a
    dish beef, and a plant-based sausage is not pork. Only the tag reading changes; nothing shown changes."""
    text = NOT_BEEF_STEAK.sub(lambda m: m.group(1), text)
    text = re.sub(r"\blamb\s+rump\b", "lamb", text, flags=re.I)   # a lamb rump is lamb, not a beef rump
    return MEAT_FREE_SAUSAGE.sub(" ", text)


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower().replace("&", " and ").replace("™", "").replace("®", "")).strip()


def clean(s: str) -> str:
    return " ".join((s or "").split())


def curl(url: str, dest: Path, missing_ok: bool = False) -> bool:
    """One GET. 200 -> saved, True. 404 with missing_ok -> False (a pub whose menu the site does not have; recorded, not retried).
    Anything else (401/403/429, a challenge, a dropped connection) stops the run: never worked round."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):  # a dropped connection (curl 35/52/56) is retried twice, 5 s apart; it is not a refusal
        proc = subprocess.run(["curl", "-sS", "--compressed", "-L", "--max-time", "60", "-A", UA, "-o", str(dest), "-w", "%{http_code}", url],
                              capture_output=True, text=True)
        time.sleep(DELAY)
        if proc.returncode not in (35, 52, 56) or attempt == 2:
            break
        time.sleep(5)
    code = proc.stdout.strip()
    if proc.returncode == 0 and code == "200":
        return True
    if dest.exists():
        dest.unlink()
    if proc.returncode == 0 and code == "404" and missing_ok:
        return False
    raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}, HTTP {code}): stop, do not work round it")


def pub_paths(sitemap: str) -> list[str]:
    return sorted(set(re.findall(r"<loc>https://www\.belhaven\.co\.uk(/pubs/[^/<]+/[^/<]+/menu)</loc>", sitemap)))


def page_file(path: str) -> str:
    return "page_" + path.strip("/").replace("/", "__") + ".html"


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    rob = cache / "robots.txt"
    if not rob.exists():
        curl(BASE + "/robots.txt", rob)
    rules = robots_rfc.parse(rob.read_text(encoding="utf-8", errors="replace"))
    sm = cache / "sitemap.xml"
    if not sm.exists():
        if not robots_rfc.allowed(rules, "/sitemap.xml"):
            raise SystemExit("robots.txt disallows /sitemap.xml: stop")
        curl(BASE + "/sitemap.xml", sm)
    for path in pub_paths(sm.read_text(encoding="utf-8")):
        page = cache / page_file(path)
        if not page.exists():
            if not robots_rfc.allowed(rules, path):
                raise SystemExit(f"robots.txt disallows {path}: stop")
            curl(BASE + path, page)
        m = re.search(r'rawVenueId":"(\d+)"', page.read_text(encoding="utf-8", errors="replace"))
        if not m:
            print(f"no venue id on {path} (pub page without a menu?): skipped", file=sys.stderr)
            continue
        js = cache / f"getmenus_{m.group(1)}.json"
        gone = cache / f"getmenus_{m.group(1)}.404"
        if not js.exists() and not gone.exists():
            api = f"/api/menus/getmenus/{m.group(1)}"
            if not robots_rfc.allowed(rules, api):
                raise SystemExit(f"robots.txt disallows {api}: stop")
            if curl(BASE + api, js, missing_ok=True):
                json.loads(js.read_text(encoding="utf-8"))
            else:
                gone.write_text(f"{BASE}{api} answered 404 on fetch (no online menu for {path})\n", encoding="utf-8")
                print(f"no online menu (404) for {path}: skipped", file=sys.stderr)


def pubs_in_cache(cache: Path) -> list[tuple[str, str, str]]:
    """[(pub path, venue name, venue id)] for every saved pub page with a saved menus file."""
    out = []
    for path in pub_paths((cache / "sitemap.xml").read_text(encoding="utf-8")):
        page = cache / page_file(path)
        if not page.exists():
            continue
        text = page.read_text(encoding="utf-8", errors="replace")
        m = re.search(r'rawVenueId":"(\d+)"', text)
        name = re.search(r'"venueName":"([^"]*)"', text)
        if m and (cache / f"getmenus_{m.group(1)}.json").exists():
            out.append((path, name.group(1) if name else path, m.group(1)))
    return out


def category_of(menu: str, cat: str) -> str | None:
    c = clean(cat).lower()
    if KIDS.search(menu) or KIDS.search(cat):
        if "drink" in c:
            return "Kids: drinks"
        if "pudding" in c or "dessert" in c:
            return "Kids: puddings"
        if "starter" in c:
            return "Kids: starters"
        return "Kids: mains"
    if menu == "Seniors Menu":
        return "Seniors"
    if menu == "Drinks":
        return "Drinks"
    return CATEGORY.get(c)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--fetch-only", action="store_true")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch or args.fetch_only:
        fetch(args.cache)
        if args.fetch_only:
            return 0
    pubs = pubs_in_cache(args.cache)
    if len(pubs) < 60:
        print(f"only {len(pubs)} pubs in the cache: run with --fetch first", file=sys.stderr)
        return 1

    hashes = []
    # slot = (product id, portion name): the feed's own product id tells two dishes of the same name apart (a vegetarian and a vegan
    # Falafel Burger, a no-gluten pudding). Per slot: {calories: set of pubs}, the menus it is on, names, descriptions, diet marks.
    slots: dict[tuple, dict] = defaultdict(lambda: {"cal": defaultdict(set), "menus": [], "cats": [], "names": set(), "desc": "",
                                                    "diet": set(), "portion": "", "name": ""})
    left = Counter()
    unknown_cats = set()
    menus_seen = Counter()
    alcohol_names = set()
    for path, venue, vid in pubs:
        f = args.cache / f"getmenus_{vid}.json"
        hashes.append(hashlib.sha256(f.read_bytes()).hexdigest())
        for menu in json.loads(f.read_text(encoding="utf-8")):
            mname = clean(menu["name"])
            menus_seen[mname] += 1
            if SEASONAL.search(mname):
                left["seasonal menu rows"] += sum(len(c["products"]) for c in menu.get("categories") or [])
                continue
            if mname not in MENU_LABEL:
                raise SystemExit(f"unknown menu {mname!r} at {venue}: add it to MENU_ORDER / MENU_LABEL after checking the page")
            for cat in menu.get("categories") or []:   # a pub may list a menu with nothing in it
                cname = clean(cat["name"])
                for p in cat["products"]:
                    if AT_THE_COUNTER.search(p.get("description") or ""):
                        left["carvery and buffet plates (calories at the counter, as the description says)"] += 1
                        continue
                    pname = clean(p["name"])
                    if (mname == "Drinks Menu" or ALCOHOL_CATS.search(cname)) and not ALCOHOL_FREE.search(pname):
                        left["alcoholic drink rows"] += 1
                        alcohol_names.add(pname)
                        continue
                    if re.search(r"\bof the day\b", pname, re.I):   # soup / pie of the day: changes daily, one figure cannot describe it
                        left["'of the day' rows"] += 1
                        continue
                    ours = category_of(mname, cname)
                    if ours is None:
                        unknown_cats.add((mname, cname))
                        continue
                    for po in p["portions"]:
                        if po.get("calories") is None:
                            left["rows with no calories printed"] += 1
                            continue
                        portion = clean(po.get("portionName") or po.get("name") or "")
                        s = slots[(str(p["id"]), norm(portion))]
                        s["cal"][int(po["calories"]) if float(po["calories"]).is_integer() else po["calories"]].add(vid)
                        if mname not in s["menus"]:
                            s["menus"].append(mname)
                            s["cats"].append(ours)
                        s["names"].add(pname)
                        if not s["name"]:
                            s["name"], s["portion"], s["desc"] = pname, portion, clean(p.get("description"))
                        s["diet"].add(tuple(sorted(x for x in (p.get("dietaryOptions") or []) if x in ("Vegetarian", "Vegan"))))
    if unknown_cats:
        raise SystemExit(f"unmapped sections: {sorted(unknown_cats)}: add them to CATEGORY after checking the pages")

    # one value everywhere, one name, one diet mark, and printed at 2+ pubs
    rank = {m: i for i, m in enumerate(MENU_ORDER)}
    kept, conflicts, single = [], [], 0
    for key, s in slots.items():
        if len(s["cal"]) > 1:
            conflicts.append((s["name"], key, {k: len(v) for k, v in s["cal"].items()}))
            continue
        (cal, where), = s["cal"].items()
        if len(where) < MIN_PUBS:
            single += 1
            continue
        if len(s["names"]) > 1 or len(s["diet"]) > 1:
            conflicts.append((s["name"], key, f"names {sorted(s['names'])} / diet marks {sorted(s['diet'])} differ between pubs"))
            continue
        first = min(range(len(s["menus"])), key=lambda i: rank[s["menus"][i]])
        kept.append({**s, "cal": cal, "pubs": len(where), "menu": s["menus"][first], "cat": s["cats"][first],
                     "diet": next(iter(s["diet"]))})
    kept.sort(key=lambda d: (rank[d["menu"]], CATEGORY_ORDER.index(d["cat"])))

    # Names. Carvery portions always carry their day ("Small Carvery (Saturday)": the feed prints a figure per day), a product printed only
    # on a no-gluten menu says so, and the same printed figure for the same name in the same section twice (two product ids) is one item.
    # Then two products with one printed name are told apart by what the feed itself says: vegan, the menu, or the section; never a guess.
    for d in kept:
        base = d["name"] + (f" ({d['portion']})" if d["portion"] and d["portion"].lower() != "standard" else "")
        if d["cat"] in DAY_LABEL:
            base = f"{base} ({DAY_LABEL[d['cat']]})"
        elif d["cat"] == "No-gluten lunch":
            base = f"{base} (no-gluten lunch)"
        elif all(m in NG_MENUS for m in d["menus"]) or d["cat"].startswith("No-gluten"):
            base = f"{base} (no-gluten)"
        d["base"] = base
    merged, seen_same = [], {}
    for d in kept:
        k = (norm(d["base"]), d["cal"], d["cat"], d["diet"])
        if k in seen_same:
            seen_same[k]["pubs"] = max(seen_same[k]["pubs"], d["pubs"])
            continue
        seen_same[k] = d
        merged.append(d)
    groups: dict[str, list] = defaultdict(list)
    for d in merged:
        groups[norm(d["base"])].append(d)
    items = []
    name_conflicts = []
    for gkey in list(groups):
        # one printed name, one menu, one section, one diet mark but different figures (different product ids at different pubs, e.g. a
        # burger built two ways): the same dish is printed with two figures, so every version of it is left out, never chosen between
        buckets: dict[tuple, list] = defaultdict(list)
        for d in groups[gkey]:
            buckets[(MENU_KIND.get(d["menu"], d["menu"]), d["cat"], d["diet"])].append(d)
        bad = [k for k, v in buckets.items() if len({d["cal"] for d in v}) > 1]
        for k in bad:
            name_conflicts.append((buckets[k][0]["base"], k[0], k[1], sorted({(d["cal"], d["pubs"]) for d in buckets[k]})))
        groups[gkey] = [d for d in groups[gkey] if (MENU_KIND.get(d["menu"], d["menu"]), d["cat"], d["diet"]) not in bad]
    for grp in groups.values():
        if not grp:
            continue
        # the plain name goes to the first product that is not marked vegan when the others are not (so the vegan one is the labelled one)
        all_vegan = all("Vegan" in g["diet"] for g in grp)  # computed first: a list is empty while it is being sorted
        grp.sort(key=lambda d: ("Vegan" in d["diet"] and not all_vegan, rank[d["menu"]], CATEGORY_ORDER.index(d["cat"])))
        used = set()
        for i, d in enumerate(grp):
            base = d["base"]
            name = base
            if i > 0:
                p0 = grp[0]
                if "Vegan" in d["diet"] and "Vegan" not in p0["diet"]:
                    name = f"{base} ({MENU_LABEL[d['menu']]}, vegan)" if d["menu"] != p0["menu"] else f"{base} (vegan)"
                if norm(name) in used and d["menu"] != p0["menu"]:
                    name = f"{base} ({MENU_LABEL[d['menu']]})"
                if norm(name) in used and d["cat"] != p0["cat"]:
                    name = f"{base} ({d['cat'].lower()})"
            if norm(name) in used:
                raise SystemExit(f"cannot tell apart two products named {base!r}: check the feed")
            used.add(norm(name))
            veg = bool(d["diet"])
            tags, _ = tk.meat_tags(tag_text(d["name"]), tag_text(d["desc"]), vegetarian=veg)
            if veg:
                tags = ["vegetarian"]
            items.append({
                "name": name, "category": d["cat"], "calories": d["cal"], "protein_g": "", "carbs_g": "", "fat_g": "",
                "serving": d["portion"] if d["portion"] and d["portion"].lower() != "standard" else "",
                "tags": "|".join(tags), "rankable": d["cat"] not in UNRANKABLE,
                "notes": f"Printed at {d['pubs']} of {len(pubs)} pubs read; on: " + ", ".join(dict.fromkeys(MENU_LABEL[m] for m in d["menus"]))
                         + (f". {d['desc']}" if d["desc"] else ""),
            })
    items.sort(key=lambda it: CATEGORY_ORDER.index(it["category"]))
    names = [i["name"] for i in items]
    missing = [n for n in HOLDBACK if n not in names]
    if missing:
        print(f"HOLDBACK names no longer on the menu: {missing}", file=sys.stderr)
        return 1
    combined = hashlib.sha256("\n".join(sorted(hashes)).encode()).hexdigest()
    folder = write_chain_folder(
        chain_id=CHAIN_ID, name="Belhaven Pubs", cuisine="Pub",
        source_title=f"Belhaven pub menus with calories: each pub's own online menu (getmenus feed of {len(pubs)} pubs, accessed "
                     f"{args.checked_on}, no date shown)",
        source_url=SOURCE_URL, checked_on=args.checked_on,
        aliases=["belhaven", "belhaven pubs", "belhaven pub", "belhaven inns"],
        items=items, out=args.out, note=NOTE, nutrition_level="calories",
        holdback=[(slug(n), why) for n, why in HOLDBACK.items()] or None,
        allergen_guide={"title": f"Belhaven allergens: each pub's allergen menu (accessed {args.checked_on}, no date shown)",
                        "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": False},
    )
    print(f"pubs read: {len(pubs)}; menus seen: {dict(menus_seen)}")
    print(f"combined sha256 of the {len(hashes)} getmenus files: {combined}")
    print(f"left out: {dict(left)}; distinct alcoholic drinks: {len(alcohol_names)}; printed at one pub only: {single}; "
          f"different calories at different pubs: {len(conflicts)}")
    print(f"one name printed with different figures on the same menu and section (left out): {len(name_conflicts)}")
    for c in name_conflicts:
        print("   name conflict:", c)
    for k, v in conflicts[:60]:
        print("   conflict:", k, v)
    print(f"wrote {len(items)} items to {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
