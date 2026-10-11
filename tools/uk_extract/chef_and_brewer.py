#!/usr/bin/env python3
"""Build data/source/chef-and-brewer/ from Chef & Brewer's own online pub menus (a CALORIES-ONLY chain).

    python3 -I tools/uk_extract/chef_and_brewer.py --cache DIR --checked-on 2026-10-11 [--fetch] [--out DIR]

Source: the menu data the chain's own pub pages load. Each pub's menu page (for example
https://www.chefandbrewer.com/pubs/northamptonshire/green-man-inn/menu, which shows "Crispy Squid ... 524 kcal" once rendered) carries the
pub's venue id (`rawVenueId`) and calls a JSON endpoint of the same site:
    https://www.chefandbrewer.com/api/menus/getmenus/<venue id>   every menu of the pub: categories, products, portions, calories
It is Greene King's pub platform, the same one Hungry Horse uses (hungry_horse.py). robots.txt of www.chefandbrewer.com (read 2026-10-11)
disallows /sitecore/, /media/, /images/ and similar folders, not /pubs/ or /api/menus/. --fetch reads sitemap.xml, takes every
/pubs/<county>/<pub>/menu page it lists (139 on 2026-10-11), and downloads each page and then its getmenus file: about 280 requests, one
every 1.2 seconds, a normal browser User-Agent, stopping at the first refusal (nothing is worked round). Files are kept in --cache.

The chain prints CALORIES ONLY (one "calories" figure per portion): no kJ, protein, carbohydrate or fat anywhere, so those stay blank
(docs/DATA.md "Calories-only chains"). Prices are not used.

MENUS DIFFER BY PUB (a pub lists only some dishes, and a few pubs print their own figures). Founder's rule for chains whose sites print
different menus: a dish is published only when it is printed at 2 or more pubs and EVERY pub that prints it (on the same menu, in the same
section, with the same portion name) prints the same calories. A dish with two different figures anywhere is left out, never chosen between,
and counted in the run's output. The same dish (name and portion) on several menus with the same calories is one item; with different
calories (a no-gluten version, a children's portion, a lunch size) it is one item per figure, the later one named after its menu.

Left out on purpose (counted in the run's output):
- every alcoholic drink (founder, 11 Oct 2026: "You don't need to add alcohol drinks"): the wine, fizz, spritz and cocktail sections are
  skipped whatever they print, unless the product's own name says it is alcohol-free (0%, alcohol free, mocktail);
- products with no calories printed (specials), "... of the Day" dishes (they change daily) and products printed at one pub only;
- the Christmas and festive menus (seasonal).
Tags: vegetarian when the feed lists "Vegetarian" or "Vegan"; contains_pork / contains_beef when the dish's name or description says so
(tenkites_c.meat_tags). `serving` only when the portion name is not "Standard".
Allergens: link only. Chef & Brewer's per-dish allergen menus (each pub's "Allergens & Nutrition" page) open Smart Chef (smartchef.co.uk),
whose robots.txt is "Disallow: /" for every robot, so they are not read here (same as Hungry Horse). The chain's own page
https://www.chefandbrewer.com/allergens-and-nutrition is the guide link.

Read on 2026-10-11: 139 pub menu pages, 138 getmenus files (Butley Ash answered 404: no online menu; a 404 is recorded, not retried; a
401/403/429 would stop the run), combined sha256 9c50df7d6fc99301745d228de68a6def3c04722fd4efc7626827972b87819976. Every product (by the
feed's own product id) printed the same calories at every pub listing it. Independent check: data/audit/verified/chef-and-brewer.json.
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

CHAIN_ID = "chef-and-brewer"
BASE = "https://www.chefandbrewer.com"
SOURCE_URL = BASE + "/pubs/northamptonshire/green-man-inn/menu"
ALLERGEN_GUIDE_URL = BASE + "/allergens-and-nutrition"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
DELAY = 1.2
MIN_PUBS = 2

# Menu names as the feed prints them -> short label used when two versions of a dish need telling apart (order = which keeps the plain name)
MENU_ORDER = ["Main Menu", "Lunch Menu", "Picky Bits", "Sunday Menu", "Breakfast Menu", "Puddings", "Little Ones Menu",
              "No-Gluten Containing Main Menu", "No-Gluten Containing Lunch Menu", "No-Gluten Containing Sunday Menu",
              "No-Gluten Containing Breakfast Menu", "No-Gluten Containing Little Ones", "Drinks Menu"]
MENU_LABEL = {"Main Menu": "main menu", "Lunch Menu": "lunch menu", "Picky Bits": "picky bits", "Sunday Menu": "Sunday menu",
              "Puddings": "puddings menu", "Little Ones Menu": "little ones' menu", "No-Gluten Containing Main Menu": "no-gluten menu",
              "No-Gluten Containing Lunch Menu": "no-gluten lunch menu", "No-Gluten Containing Sunday Menu": "no-gluten Sunday menu",
              "No-Gluten Containing Little Ones": "no-gluten little ones' menu", "Drinks Menu": "drinks menu",
              "Breakfast Menu": "breakfast menu", "No-Gluten Containing Breakfast Menu": "no-gluten breakfast menu"}
SEASONAL = re.compile(r"christmas|festive|boxing|new year|valentine|mother'?s day|father'?s day|easter", re.I)
ALCOHOL_CATS = re.compile(r"\b(wine|ros[eé]|fizz|prosecco|champagne|spritz|cocktails?|beers?|lagers?|ciders?|spirits?|gin|whisk(?:e)?y|"
                          r"vodka|rum|ales?)\b", re.I)
ALCOHOL_FREE = re.compile(r"\b0(?:\.0)?\s?%|alcohol[- ]free|non[- ]alcoholic|mocktail|\b0\.0\b", re.I)
KIDS = re.compile(r"little ones|younger guests|kids", re.I)
# category (lower case, after the menu's own name) -> our category; unknown categories stop the run
CATEGORY = {
    "nibbles": "Nibbles", "starters": "Starters", "mains": "Mains", "burgers": "Burgers", "grill": "Grill", "salads": "Salads",
    "sides & nibbles": "Sides", "sides": "Sides", "puddings": "Puddings", "no-gluten containing puddings": "Puddings",
    "just for lunch": "Lunch", "picky bits": "Picky bits", "our sunday roasts": "Sunday roasts",
    "cooked": "Breakfast", "lighter breakfasts": "Breakfast", "sandwiches": "Breakfast",
}
UNRANKABLE = {"Nibbles", "Sides", "Puddings", "Picky bits", "Kids: starters", "Kids: mains", "Kids: puddings", "Kids: drinks", "Drinks"}
CATEGORY_ORDER = ["Nibbles", "Starters", "Mains", "Burgers", "Grill", "Salads", "Lunch", "Sunday roasts", "Breakfast", "Sides", "Picky bits", "Puddings",
                  "Kids: starters", "Kids: mains", "Kids: puddings", "Kids: drinks", "Drinks"]

# Rows the feed prints impossibly or that contradict themselves: left out of the published menu (never corrected). Filled after the check.
HOLDBACK: dict[str, str] = {}

NOTE = ("Calories only, as each Chef & Brewer pub's own online menu prints them (per portion as listed); protein, carbs and fat are not "
        "published. Pubs list different dishes, so a dish is shown only if 2 or more of the pubs read print it with the same calories and "
        "none differs. Alcoholic drinks are not listed.")
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
    return sorted(set(re.findall(r"<loc>https://www\.chefandbrewer\.com(/pubs/[^/<]+/[^/<]+/menu)</loc>", sitemap)))


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
    if menu == "Drinks Menu":
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
    if len(pubs) < 100:
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

    # the same printed name for two different products: the one in the earliest menu keeps the plain name; the other is told apart by
    # what the feed itself says (vegan, or the menu it comes from), never by a guess
    groups: dict[str, list] = defaultdict(list)
    for d in kept:
        groups[norm(d["name"]) + "|" + norm(d["portion"])].append(d)
    items = []
    for grp in groups.values():
        used = set()
        for i, d in enumerate(grp):
            base = d["name"] + (f" ({d['portion']})" if d["portion"] and d["portion"].lower() != "standard" else "")
            name = base
            if i > 0:
                if "Vegan" in d["diet"] and not all("Vegan" in g["diet"] for g in grp):
                    name = f"{base} (vegan)"
                if norm(name) in used:
                    name = f"{base} ({MENU_LABEL[d['menu']]})"
                if norm(name) in used:
                    name = f"{base} ({MENU_LABEL[d['menu']]}, {d['cal']} kcal)"
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
        chain_id=CHAIN_ID, name="Chef & Brewer", cuisine="Pub",
        source_title=f"Chef & Brewer pub menus with calories: each pub's own online menu (getmenus feed of {len(pubs)} pubs, accessed "
                     f"{args.checked_on}, no date shown)",
        source_url=SOURCE_URL, checked_on=args.checked_on,
        aliases=["chef & brewer", "chef and brewer", "chef brewer", "chef & brewer pub"],
        items=items, out=args.out, note=NOTE, nutrition_level="calories",
        holdback=[(slug(n), why) for n, why in HOLDBACK.items()] or None,
        allergen_guide={"title": f"Chef & Brewer allergens & nutrition: each pub's allergen menu (accessed {args.checked_on}, no date shown)",
                        "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": False},
    )
    print(f"pubs read: {len(pubs)}; menus seen: {dict(menus_seen)}")
    print(f"combined sha256 of the {len(hashes)} getmenus files: {combined}")
    print(f"left out: {dict(left)}; distinct alcoholic drinks: {len(alcohol_names)}; printed at one pub only: {single}; "
          f"different calories at different pubs: {len(conflicts)}")
    for k, v in conflicts[:60]:
        print("   conflict:", k, v)
    print(f"wrote {len(items)} items to {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
