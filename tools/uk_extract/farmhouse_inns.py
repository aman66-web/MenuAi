#!/usr/bin/env python3
"""Build data/source/farmhouse-inns/ from Farmhouse Inns' own online pub menus (a CALORIES-ONLY chain; Greene King's carvery pubs).

    python3 -I tools/uk_extract/farmhouse_inns.py --cache DIR --checked-on 2026-10-12 [--fetch] [--out DIR]

Source: the menu data the chain's own pub pages load once a pub is picked (farmhouseinns.co.uk/allergens and the menus page ask the visitor to
pick a venue; earlier triage: BLOCKED, the site answered 403 on 2026-10-10; robots.txt answered 200 on 2026-10-12). Each pub's menu page (for
example https://www.farmhouseinns.co.uk/pubs/northumberland/willow-farm/menu, which shows "Beans on Toast ... 316 kcal" once rendered) carries
the pub's venue id (`rawVenueId`) and calls a JSON endpoint of the same site:
    https://www.farmhouseinns.co.uk/api/menus/getmenus/<venue id>   every menu of the pub: categories, products, portions, calories
It is Greene King's pub platform, the one chef_and_brewer.py and hungry_horse.py read; this script follows chef_and_brewer.py. robots.txt of
www.farmhouseinns.co.uk (read 2026-10-12) disallows /sitecore/, /media/, /images/, /js/ and similar folders, not /pubs/ or /api/menus/.
--fetch reads sitemap.xml, takes every /pubs/<county>/<pub>/menu page it lists (62 on 2026-10-12), and downloads each page and then its
getmenus file: about 125 requests, one every 1.2 seconds, a normal browser User-Agent, stopping at the first refusal (nothing is worked round).

The chain prints CALORIES ONLY (one "calories" figure per portion): protein, carbohydrate and fat stay blank (docs/DATA.md "Calories-only
chains"). Prices are not used. (Each pub page also links a "Nutritional Information" PDF with full figures, but it is the Autumn Winter 2025
main menu, a year older than the menus read here, so it is not used.)

MENUS DIFFER BY PUB. Rule for chains whose sites print different menus: a dish is published only when it is printed at 2 or more pubs and EVERY
pub that prints it (the feed's own product id and portion) prints the same calories; a dish with two different figures anywhere is left out,
never chosen between. Two products printed with one name are told apart by what the feed itself says (vegan, the menu, the section); the same
name with the same figure in one section twice is one item; a product printed only on the no-gluten menu says "(no-gluten)".

Left out on purpose (counted in the run's output):
- every product whose own description says "calorie information can be found at the carvery counter" / "... breakfast counter" (all carvery
  plates, adult and kids, and the buffet breakfasts): the chain itself says each plate differs, so its printed figure can't describe a plate;
- alcoholic drinks (none on these menus), products with no calories printed, "... of the Day" dishes, products printed at one pub only, and
  seasonal (Christmas, festive) menus.
Tags: vegetarian when the feed lists "Vegetarian" or "Vegan"; contains_pork / contains_beef when the dish's name or description says so
(tenkites_c.meat_tags). Allergens: link only (each pub's allergen menu opens Smart Chef, whose robots.txt is "Disallow: /"); the chain's
own page https://www.farmhouseinns.co.uk/allergens is the guide link.
Second read: data/audit/verified/farmhouse-inns.json (three pub menu pages rendered as a visitor sees them, every menu).
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

CHAIN_ID = "farmhouse-inns"
BASE = "https://www.farmhouseinns.co.uk"
SOURCE_URL = BASE + "/pubs/northumberland/willow-farm/menu"
ALLERGEN_GUIDE_URL = BASE + "/allergens"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
DELAY = 1.2
MIN_PUBS = 2

# Menu names as the feed prints them -> short label used when two versions of a dish need telling apart (order = which keeps the plain name)
MENU_ORDER = ["Main Menu", "Breakfast", "Desserts", "Kids' Menu", "No-Gluten Containing Menu", "Click & Collect Breakfast"]
MENU_LABEL = {"Main Menu": "main menu", "Breakfast": "breakfast menu", "Desserts": "desserts menu", "Kids' Menu": "kids' menu",
              "No-Gluten Containing Menu": "no-gluten menu", "Click & Collect Breakfast": "click & collect breakfast"}
SEASONAL = re.compile(r"christmas|festive|boxing|new year|valentine|mother'?s day|father'?s day|easter", re.I)
ALCOHOL_CATS = re.compile(r"\b(wine|ros[eé]|fizz|prosecco|champagne|spritz|cocktails?|beers?|lagers?|ciders?|spirits?|gin|whisk(?:e)?y|"
                          r"vodka|rum|ales?)\b", re.I)
ALCOHOL_FREE = re.compile(r"\b0(?:\.0)?\s?%|alcohol[- ]free|non[- ]alcoholic|mocktail|\b0\.0\b", re.I)
KIDS = re.compile(r"little ones|younger guests|kids", re.I)
# Left out on purpose: every product whose own description says its calories are given at the counter ("As each and every carvery plate is
# different, calorie information can be found at the carvery counter"; the same for the buffet breakfast plates): the chain itself says the
# printed figure can't describe the plate a diner fills (all carvery plates, adult and kids, and the buffet breakfasts).
AT_THE_COUNTER = re.compile(r"calorie information can be found at the", re.I)
# category (lower case, after the menu's own name) -> our category; unknown categories stop the run
CATEGORY = {
    "for the table": "For the table", "starters": "Starters", "all-time faves": "Mains", "grills": "Grills", "burgers with bite": "Burgers",
    "chicken done right": "Chicken", "lighter bites": "Lighter bites", "fancy a side": "Sides", "fancy a side?": "Sides",
    "weekday carvery": "Weekday carvery", "saturday carvery": "Saturday carvery", "sunday & bank holiday carvery": "Sunday & bank holiday carvery",
    "top your toast": "Breakfast", "no gluten-containing breakfast": "No-gluten breakfast", "rise & dine": "Breakfast", "soft drinks": "Drinks",
    "desserts": "Desserts", "pudding, please": "Desserts", "cakeaway": "Cakeaway", "ice cream sundaes": "Desserts",
    "ice cream parlour": "Desserts",
}
UNRANKABLE = {"For the table", "Sides", "Desserts", "Cakeaway", "Drinks", "Kids: starters", "Kids: mains", "Kids: puddings", "Kids: drinks"}
CATEGORY_ORDER = ["For the table", "Starters", "Weekday carvery", "Saturday carvery", "Sunday & bank holiday carvery", "Mains", "Grills",
                  "Burgers", "Chicken", "Lighter bites", "Breakfast", "No-gluten breakfast", "Sides", "Desserts", "Cakeaway",
                  "Kids: starters", "Kids: mains", "Kids: puddings", "Kids: drinks", "Drinks"]

DAY_LABEL = {"Weekday carvery": "weekday", "Saturday carvery": "Saturday", "Sunday & bank holiday carvery": "Sunday & bank holiday"}

# Rows the feed prints impossibly or that contradict themselves: left out of the published menu (never corrected). Filled after the check.
HOLDBACK: dict[str, str] = {}

NOTE = ("Calories only, as each Farmhouse Inns pub's own online menu prints them (per portion as listed). Pubs list different dishes, so a "
        "dish is shown only if 2 or more of the pubs read print it with the same calories and none differs. Carvery plates and the buffet "
        "breakfast are not listed: the chain says each plate differs and gives their calories at the counter.")
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
    return sorted(set(re.findall(r"<loc>https://www\.farmhouseinns\.co\.uk(/pubs/[^/<]+/[^/<]+/menu)</loc>", sitemap)))


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
    if len(pubs) < 40:
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
        elif all(m == "No-Gluten Containing Menu" for m in d["menus"]) or d["cat"] == "No-gluten breakfast":
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
    for grp in groups.values():
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
        chain_id=CHAIN_ID, name="Farmhouse Inns", cuisine="Carvery",
        source_title=f"Farmhouse Inns pub menus with calories: each pub's own online menu (getmenus feed of {len(pubs)} pubs, accessed "
                     f"{args.checked_on}, no date shown)",
        source_url=SOURCE_URL, checked_on=args.checked_on,
        aliases=["farmhouse inns", "farmhouse inn", "farmhouse carvery", "farmhouse inns carvery"],
        items=items, out=args.out, note=NOTE, nutrition_level="calories",
        holdback=[(slug(n), why) for n, why in HOLDBACK.items()] or None,
        allergen_guide={"title": f"Farmhouse Inns allergens: each pub's allergen menu (accessed {args.checked_on}, no date shown)",
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
