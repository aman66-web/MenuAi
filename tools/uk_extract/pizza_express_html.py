#!/usr/bin/env python3
"""Build data/source/pizza-express/ from PizzaExpress's own online menu (a CALORIES-ONLY chain).

    python3 tools/uk_extract/pizza_express_html.py CACHE_DIR --fetch                         # download politely (robots checked)
    python3 tools/uk_extract/pizza_express_html.py CACHE_DIR --checked-on 2026-10-10 [--out DIR]

NEVER reads the nutrition PDF that PizzaExpress also publishes: its host (content-cdn.pizzaexpress.com) disallows `/*.pdf` in robots.txt, which is
why the earlier version of this chain was pulled (data/held-robots/pizza-express/). Nothing in that folder is read here.

Source: https://mobile-pay.pizzaexpress.com/restaurant-menu/main-menu, the page that the "Menu" link on https://www.pizzaexpress.com/ opens (the chain's
own domain). It is a single-page app; the menu it draws comes from the JSON `GET /api/Menu/GetGlobalMenu` (and `GET /api/Menu/GetMenu/<restaurant id>`
for one restaurant's menu), which is what this script downloads. For every dish the page prints "NNN kcal" taken from the end of the dish description
("... mozzarella and tomato (711 kcal)"): the page's own script shows the first bracketed text that contains "kcal". Protein, carbs and fat are NOT
printed anywhere, so they stay blank (docs/DATA.md "Calories-only chains"; every item is then not rankable).

robots.txt: https://mobile-pay.pizzaexpress.com/robots.txt does not exist (the host answers every unknown path with its app shell, HTML, status 200), so
there are no rules; the script checks that with robots_rfc.py anyway and stops if the answer ever turns into a real robots file that disallows a path
it uses. https://www.pizzaexpress.com/robots.txt (the site that links to the menu) disallows only /book/, /offers/*/claim, /offers/*/ready and
/enquiry/confirmed/.

Region: "GetGlobalMenu" is the menu of one restaurant (id 2151, Amersham Sycamore Road, Buckinghamshire: England; the app shows it before a
restaurant is chosen). The script also downloads the menus of six more restaurants (Edinburgh and Renfrew in Scotland, Cardiff in Wales, Leeds,
Brighton and London in England; SITES below, each id checked against GetSingleRestaurant) and publishes a figure only when every restaurant that prints
that dish prints the same name and the same kcal (the 2-or-more-sites rule; prices differ by restaurant but names, descriptions and calories were
identical at all 7 on 2026-10-10). Northern Ireland, airport and the three restaurants the chain gives their own guide (Brixton, Finsbury Park, Earl's
Court: pizzaexpress.com/allergens-and-nutritionals) were not read.

Published: every dish whose description has exactly one "(NNN kcal)" (the "(998 kcal: serves 2)" sharers get serving "Serves 2"), plus
 - Twinings tea varieties (the page prints "[1 kcal]" per variety inside one description),
 - the kids' Piccolo menu components (each choice prints its own "(NNN kcal)"),
 - the gelato and sorbet flavours ("NNN kcal per scoop", serving "1 scoop").
Left out: dishes with no kcal on the page (wines, cocktails, gin, spirits, six beers and ciders, the Duo Romana, the Piccolo and Gelato & Sorbet parent
entries), the Piccolo Sundae (two values in one line), option lines such as pizza toppings, "With 'Nduja Sausage", "With Gluten-Free Dough Balls"
and the dessert accompaniments (their figures are add-ons whose basis is not stated). Held back (holdback.csv): Mac & Cheese, whose own description
says 494 kcal while its option list says 636 kcal for the same dish without 'nduja.
Two-size dishes (Classic pizzas: Classic / Large Classic; Dr Pepper: Regular / Large) print ONE figure that does not say which size it is for. They are
published as printed, serving blank, and the chain note says so; set HOLD_TWO_SIZE_DISHES = True to hold them back instead.
Allergens: none (the page shows only Gluten-Free / Vegetarian / Vegan marks; the allergen tables are PDFs on a host robots.txt disallows).
Tags: vegetarian only when the page marks the dish Vegetarian or Vegan; contains_pork / contains_beef when its printed name or description names
ham, bacon, pepperoni, sausage, pancetta, 'nduja, pork or beef, steak, brisket, bolognese ("meat type not stated" otherwise).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "pizza-express"
HOST = "mobile-pay.pizzaexpress.com"
BASE = f"https://{HOST}"
PAGE_PATH = "/restaurant-menu/main-menu"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
SOURCE_URL = BASE + PAGE_PATH
SOURCE_TITLE = ("PizzaExpress online menu with calories per dish (mobile-pay.pizzaexpress.com, the page the Menu link on pizzaexpress.com opens; "
                "identical at the 7 England, Scotland and Wales restaurants read)")
HOLD_TWO_SIZE_DISHES = True
MIN_ITEMS, MAX_ITEMS = 150, 320

# (restaurant id, expected name fragment, country) : the first one is the restaurant behind GetGlobalMenu
SITES = [
    ("2151", "Amersham Sycamore Road", "England"),
    ("1851", "Edinburgh Northbridge", "Scotland"),
    ("3252", "Braehead Grid", "Scotland"),
    ("1581", "Cardiff High Street", "Wales"),
    ("3345", "Leeds Albion Place", "England"),
    ("3477", "Brighton Jubilee Street", "England"),
    ("161", "London Dean Street", "England"),
]

NOTE = ("Calories only, per dish as printed on PizzaExpress's own menu page (the same at the 7 England, Scotland and Wales restaurants read); protein, carbs, fat "
        "and allergens are not published there. " + ("Classic pizzas and Dr Pepper are left out: the page shows one figure for two sizes. " if HOLD_TWO_SIZE_DISHES else
        "Classic pizzas (Classic or Large Classic) and Dr Pepper (Regular or Large) show one figure that does not say which size it is for. ") +
        "Tea, Americano and Dolcetti figures leave out milk, coffee or tea.")

PORK = re.compile(r"\b(pork|bacon|ham|pepperoni|sausages?|salami|chorizo|pancetta|prosciutto|gammon|'?nduja|’nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steaks?|brisket|bolognese|burnt ends)\b", re.I)
KC = re.compile(r"\(\s*(\d+)\s*kcal(?::\s*serves 2)?\s*\)", re.I)
SERVES2 = re.compile(r"\(\s*\d+\s*kcal:\s*serves 2\s*\)", re.I)

# page section (top category, sub category) -> category name used in the app, in display order
CATEGORY = {
    ("Starters & Sides", "Appetisers"): "Appetisers", ("Starters & Sides", "Dough Balls"): "Dough Balls", ("Starters & Sides", "To Share"): "To share",
    ("Starters & Sides", "Starters"): "Starters", ("Starters & Sides", "Sides"): "Sides", ("Starters & Sides", "Dips"): "Dips",
    ("Pizzeria", "Romana Pizza"): "Romana pizzas", ("Pizzeria", "Classic Pizza"): "Classic pizzas", ("Pizzeria", "Leggera"): "Leggera pizzas",
    ("Pizzeria", "Gluten-Free"): "Gluten-free pizzas", ("Pizzeria", "Dips"): "Dips",
    ("Mains", "Salads"): "Salads", ("Mains", "Al Forno"): "Al forno pasta",
    ("Desserts", "Desserts"): "Desserts", ("Desserts", "Dolcetti"): "Dolcetti",
    ("Kids", "Piccolo - Our Kids' Menu"): "Kids' drinks",
    ("Drinks", "Hot Drinks"): "Hot drinks", ("Drinks", "Soft Drinks"): "Soft drinks", ("Drinks", "Sparkles & Juices"): "Juices and sparkles",
    ("Drinks", "Beer & Cider"): "Beer and cider",
}
EXTRA_CATEGORIES = {"gelato": "Gelato and sorbet", "piccolo": "Piccolo kids' menu", "tea": "Hot drinks"}
ORDER = ["Appetisers", "Dough Balls", "To share", "Starters", "Sides", "Dips", "Romana pizzas", "Classic pizzas", "Leggera pizzas", "Gluten-free pizzas",
         "Salads", "Al forno pasta", "Desserts", "Dolcetti", "Gelato and sorbet", "Piccolo kids' menu", "Kids' drinks", "Hot drinks", "Soft drinks",
         "Juices and sparkles", "Beer and cider"]
# categories that hold every dish of that kind: two-size dishes (one kcal figure, two sizes on the page)
TWO_SIZE_CHOICES = [{"Classic", "Large Classic"}, {"Regular", "Large"}]


# ---------------------------------------------------------------------------------------------- fetching (polite, robots-checked)
def curl(url: str, out: Path) -> tuple[int, str]:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-H", "Accept: application/json, text/html", "-o", str(out), "-w", "%{http_code} %{content_type}", url],
                         capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    code, _, ctype = res.stdout.strip().partition(" ")
    return int(code or 0), ctype


def robots_rules(cache: Path) -> list:
    """The rules of mobile-pay's robots.txt. The host has none and answers with its HTML app shell: that is read as 'no rules' (RFC 9309: an
    unparseable file has no valid rules) but ONLY if the answer is HTML and says nothing like Disallow; a real robots file is parsed and obeyed."""
    path = cache / "robots_mobile-pay.txt"
    if not path.exists():
        code, ctype = curl(f"{BASE}/robots.txt", path)
        (cache / "robots_mobile-pay.status").write_text(f"{code} {ctype}\n", encoding="utf-8")
        time.sleep(1.1)
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    if re.search(r"<html|<!doctype", text[:300], re.I) and not re.search(r"^\s*(user-agent|disallow)\s*:", text, re.I | re.M):
        return []
    rules = robots_rfc.parse(text)
    return rules


def check_robots(rules: list, path: str) -> None:
    if not robots_rfc.allowed(rules, path):
        raise SystemExit(f"robots.txt of {HOST} disallows {path}: stop (never work round it)")


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    rules = robots_rules(cache)

    def get(path: str, name: str) -> None:
        out = cache / name
        if out.exists() and out.stat().st_size > 50:
            return
        check_robots(rules, path)
        code, ctype = curl(BASE + path, out)
        if code != 200:
            out.unlink(missing_ok=True)
            raise SystemExit(f"HTTP {code} for {BASE}{path}: stop (never work round a block)")
        time.sleep(1.1)

    get(PAGE_PATH, "page_main-menu.html")
    get("/api/Menu/GetGlobalMenu", "global_menu.json")
    for rid, _name, _country in SITES:
        get(f"/api/Restaurant/GetSingleRestaurant/test/{rid}", f"restaurant_{rid}.json")
        get(f"/api/Menu/GetMenu/{rid}", f"menu_{rid}.json")


# ---------------------------------------------------------------------------------------------- reading
def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").replace(" ", " ").replace("​", "")).strip()


def walk(cats, path=()):
    for c in cats:
        p = path + (c["name"],)
        for item in c.get("menuItems") or []:
            yield p, item
        yield from walk(c.get("menuCategories") or [], p)


def tags_of(item_diet: list, text: str) -> str:
    vegetarian = "Vegetarian" in item_diet or "Vegan" in item_diet
    tags = []
    if vegetarian:
        tags.append("vegetarian")
    else:
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
    return "|".join(tags)


def records(menu: dict) -> dict:
    """{key: record} for one restaurant's menu. key = (kind, id, name). A record has the published fields; `skip` entries explain what was left out."""
    data = menu["data"]
    if "menuCategories" not in data:
        raise SystemExit("the menu JSON no longer has data.menuCategories: the source changed shape, re-check the script")
    recs, skipped, seen_ids = {}, [], set()
    for path, item in walk(data["menuCategories"]):
        if item["id"] in seen_ids:
            continue  # the Dips appear under both Starters & Sides and Pizzeria
        seen_ids.add(item["id"])
        top, sub = path[0], path[-1]
        name = norm(item["name"])
        desc = norm(item.get("description"))
        diet = item.get("dietaryAndAllergens") or []
        choices = [norm(x["name"]) for c in item.get("menuItemChoices") or [] for x in c["menuItemChoiceItems"]]
        n_kcal = len(re.findall(r"kcal", desc, re.I))
        cat = CATEGORY.get((top, sub))
        if name == "Twinings Tea":
            for tname, val in re.findall(r"([A-Z][A-Za-z ]+?) \[(\d+) kcal\]", desc):
                recs[("tea", item["id"], tname)] = dict(name=f"Twinings tea, {tname.strip()}", category=EXTRA_CATEGORIES["tea"], calories=val, serving="",
                                                        diet=diet, text=tname, note="Calories displayed do not include milk (page)", choices=choices)
            continue
        if name == "Piccolo Menu":
            for c in item["menuItemChoices"]:
                for x in c["menuItemChoiceItems"]:
                    for grp in x.get("menuItemChoices") or []:
                        if not re.match(r"[123]\.", grp["name"]):
                            continue
                        for y in grp["menuItemChoiceItems"]:
                            yname, ydesc = norm(y["name"]), norm(y.get("description"))
                            both = yname + " " + ydesc
                            if len(re.findall("kcal", both)) != 1:
                                skipped.append((f"{yname} ({grp['name'][:2]})", both[:100]))
                                continue
                            m = re.search(r"\((\d+) kcal\)", both)
                            if not m:
                                skipped.append((yname, both[:100]))
                                continue
                            clean = norm(re.sub(r"\(\d+ kcal\)", "", yname))
                            recs[("piccolo", y["id"], clean)] = dict(name=f"{clean} (Piccolo)", category=EXTRA_CATEGORIES["piccolo"], calories=m.group(1),
                                                                     serving="", diet=y.get("dietaryAndAllergens") or [], text=clean + " " + ydesc,
                                                                     note="", choices=[])
            continue
        if name == "Gelato & Sorbet":
            for c in item["menuItemChoices"]:
                for x in c["menuItemChoiceItems"]:
                    for grp in x.get("menuItemChoices") or []:
                        if grp["name"] != "Gelato Flavours":
                            continue
                        for y in grp["menuItemChoiceItems"]:
                            m = re.fullmatch(r"(.+?)\s*\((\d+) kcal per scoop\)", norm(y["name"]))
                            if not m:
                                skipped.append((norm(y["name"]), "gelato flavour without 'NNN kcal per scoop'"))
                                continue
                            recs[("gelato", y["id"], m.group(1))] = dict(name=m.group(1), category=EXTRA_CATEGORIES["gelato"], calories=m.group(2), serving="1 scoop",
                                                                         diet=y.get("dietaryAndAllergens") or [], text=m.group(1), note="", choices=[])
            continue
        if n_kcal == 0:
            skipped.append((name, "no calories on the page"))
            continue
        m = KC.findall(desc)
        if n_kcal != 1 or len(m) != 1:
            skipped.append((name, f"calories not a single '(NNN kcal)': {desc[-120:]!r}"))
            continue
        if cat is None:
            raise SystemExit(f"{name!r}: section {path} is not in CATEGORY: the menu changed, add it (or leave it out) by hand")
        serving = "Serves 2" if SERVES2.search(desc) else ""
        # drinks sold in a stated size ("... - 330ml") put the size in the serving column
        sm = re.search(r"\s+-\s+(\d+\s?ml)$", name)
        if sm:
            serving = sm.group(1).replace(" ", "")
            name = name[:sm.start()].strip()
        recs[("dish", item["id"], norm(item["name"]))] = dict(name=name, category=cat, calories=m[0], serving=serving, diet=diet, text=name + " " + desc, note="",
                                                            choices=choices, desc=desc)
    return {"recs": recs, "skipped": skipped}


def load(cache: Path) -> dict:
    """{site id: records(...)} for every restaurant in SITES, with the restaurant name checked against GetSingleRestaurant."""
    out = {}
    for rid, frag, country in SITES:
        r = json.loads((cache / f"restaurant_{rid}.json").read_text(encoding="utf-8"))
        if frag.lower() not in r["name"].lower():
            raise SystemExit(f"restaurant {rid} is now called {r['name']!r}, expected {frag!r}: re-check SITES")
        menu = json.loads((cache / f"menu_{rid}.json").read_text(encoding="utf-8"))
        if menu.get("code") != 200:
            raise SystemExit(f"menu {rid}: code {menu.get('code')}")
        out[rid] = records(menu)
        out[rid]["restaurant"] = r
    # the page's own menu (GetGlobalMenu) must be the first restaurant's menu
    glob = json.loads((cache / "global_menu.json").read_text(encoding="utf-8"))
    if str(glob["data"].get("restaurantId")) != SITES[0][0]:
        raise SystemExit(f"GetGlobalMenu is now the menu of restaurant {glob['data'].get('restaurantId')}, not {SITES[0][0]}: re-check SITES")
    g = records(glob)
    if {k: v["calories"] for k, v in g["recs"].items()} != {k: v["calories"] for k, v in out[SITES[0][0]]["recs"].items()}:
        raise SystemExit("GetGlobalMenu and GetMenu/2151 differ: re-check")
    return out


def build(cache: Path) -> tuple:
    sites = load(cache)
    base_id = SITES[0][0]
    published, left_out, hold = [], [], []
    keys = []
    for rid in sites:
        for k in sites[rid]["recs"]:
            if k not in keys:
                keys.append(k)
    base_keys = list(sites[base_id]["recs"])
    for k in keys:
        if k not in base_keys:
            left_out.append((k[2], f"only on some restaurants' menus (not at {SITES[0][2]} {SITES[0][1]}): not published"))
    for k in base_keys:
        recs = {rid: sites[rid]["recs"][k] for rid in sites if k in sites[rid]["recs"]}
        kcals = {r["calories"] for r in recs.values()}
        sigs = {(r["name"], r["calories"], r["category"], tuple(sorted(r["diet"])), tuple(r["choices"])) for r in recs.values()}
        if len(recs) < 2:
            left_out.append((k[2], "printed at fewer than 2 restaurants"))
            continue
        if len(kcals) != 1:
            left_out.append((k[2], f"restaurants print different kcal: {sorted(kcals)}"))
            continue
        if len(sigs) != 1:
            left_out.append((k[2], "restaurants differ in name, section, dietary marks or size options: not published"))
            continue
        published.append((k, sites[base_id]["recs"][k], len(recs)))
    return sites, published, left_out


def to_items(published: list) -> tuple[list, list]:
    items, hold = [], []
    for k, r, n in published:
        item = dict(name=r["name"], category=r["category"], serving=r["serving"], calories=r["calories"], tags=tags_of(r["diet"], r["text"]),
                    rankable=False, notes=r["note"])
        two_size = any(set(r["choices"]) == s for s in TWO_SIZE_CHOICES)
        if two_size:
            item["notes"] = "page prints one kcal figure for a dish sold in two sizes (" + " / ".join(r["choices"]) + ") without saying which"
        items.append(item)
    order = {c: i for i, c in enumerate(ORDER)}
    items.sort(key=lambda it: order.get(it["category"], 99))  # stable: keeps the page order inside a category
    return items, hold


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--checked-on", default=time.strftime("%Y-%m-%d"))
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
    sites, published, left_out = build(args.cache)
    items, _ = to_items(published)
    if not MIN_ITEMS <= len(items) <= MAX_ITEMS:
        raise SystemExit(f"{len(items)} items: outside {MIN_ITEMS}-{MAX_ITEMS}; the menu changed shape, re-check before publishing")
    # hold back what the page contradicts itself about, and (optionally) the two-size dishes
    holdback = []
    ids = {}
    from common import slug  # noqa: E402
    for it in items:
        base = slug(it["name"])
        n = ids.get(base, 0)
        ids[base] = n + 1
        it["_id"] = base if n == 0 else f"{base}-{n + 1}"
    for it in items:
        if it["name"] == "Mac & Cheese":
            holdback.append((it["_id"], "the page's own description says 494 kcal but its option list says 636 kcal for the same dish without 'nduja"))
        if HOLD_TWO_SIZE_DISHES and it["notes"].startswith("page prints one kcal figure"):
            holdback.append((it["_id"], it["notes"]))
        it.pop("_id")
    out = write_chain_folder(chain_id=CHAIN_ID, name="PizzaExpress", cuisine="Pizza", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["pizza express", "pizzaexpress"], items=items, out=args.out, note=NOTE,
                             holdback=holdback, nutrition_level="calories")
    print(f"wrote {out}: {len(items)} items ({len(holdback)} held back); read {len(sites)} restaurants")
    for rid, s in sites.items():
        print(f"  {rid} {s['restaurant']['name']} | {norm(s['restaurant'].get('fullAddress'))}")
    shas = {n: sha256_file(args.cache / n) for n in ("page_main-menu.html", "global_menu.json")}
    for n, h in shas.items():
        print(f"  sha256 {n} {h}")
    print(f"left out ({len(left_out)} from the menu comparison, {len(sites[SITES[0][0]]['skipped'])} skipped while reading):")
    for name, why in left_out:
        print(f"  - {name}: {why}")
    for name, why in sites[SITES[0][0]]["skipped"]:
        print(f"  - skipped {name}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
