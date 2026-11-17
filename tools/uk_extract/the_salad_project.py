#!/usr/bin/env python3
"""Build data/source/the-salad-project/ from The Salad Project's own food page and its own live guide (full nutrition + allergens).

    python3 -I tools/uk_extract/the_salad_project.py --pages DIR --checked-on 2026-10-10 [--fetch --playwright PATH] [--out DIR]

DIR holds: food.html, menu_items.json (the guide's London menu feed) and detail/<item id>.json (one per published dish).
--fetch downloads them first (robots.txt of both hosts read by the RFC 9309 matcher, 1 request/second, a normal browser User-Agent,
nothing but the pages named here). The guide is a JavaScript page, so it is read the way a visitor's browser reads it: Chromium
(Playwright, `--playwright PATH` = the playwright-core folder) opens /uk/menu and /uk/menu/<id> and the script saves the page's own
data responses (menu_items; the menu list is the one menu_items request /uk/menu makes, the item the request with id=eq.<id>).
Nothing is typed in: every number below is copied from those files.

Sources (all the chain's own):
  FOOD PAGE  https://www.saladproject.co.uk/pages/food (Shopify page; robots allows). Each dish panel prints "/ Macros": Calories,
             Protein, Carbs, Fat, as whole numbers since the November 2026 redesign ("1211", "72G"; decimals before); a dish with
             versions (Chicken / Cauliflower ...) prints one panel per version, keyed by the first 8 characters of the guide item's id
             (checked). Every panel has a "Full Breakdown" link to the live guide below.
  LIVE GUIDE https://absolutelysaladproject.com/uk (the chain's FAQ calls it "our latest allergen and dietary information guide"; the old
             address absolutelysaladproject.co.uk redirects to it; robots.txt: Allow /). Its menu page (/uk/menu) lists every London item
             with its nutrition and allergens; each item's page prints the full per-portion table (energy kJ and kcal, fat, saturates,
             carbohydrate, sugars, fibre, protein, salt) and a serving weight; /uk/allergens is "Live allergen matrix from current
             menu data" (Contains / "T" = May contain (trace)). The guide holds a London and a Paris menu (figures differ: GOAT 943.1 kcal
             in London, 1127.2 in Paris); only items whose region is London are used (the chain has 15 London shops and one in Paris).
  OLD PDF    https://cdn.shopify.com/s/files/1/0878/2387/6429/files/SP_Allergens_15.06.pdf?v=1781210198 ("Allergen Guide: The Salad Project,
             Version: 25th May 2026", created 31 Mar 2026, modified 10 Jun 2026): NOT used. It is no longer linked from the chain's FAQ or
             food page (the FAQ now points to the live guide), and it prints different, whole-number figures: for 14 of the 15 dish versions
             below (The Farm Table is not in it) the figures differ by more than rounding from BOTH the food page and the live guide (BBQ
             Protein Bowl: 1216.6 kcal on the page and in the guide, 912 in the PDF). Where the two current sources agree and an older dated
             file differs, the current ones are used and the PDF is mentioned in note.txt. (Compared on 2026-10-10 with the menu of
             that day; the November 2026 menu was not compared with it again.)

The rule applied to every dish (founder's instruction): the food page's four figures must equal the guide's for the same dish (since the
page prints whole numbers, the guide's figure rounded half up must equal the page's); a dish where they differ is HELD BACK (holdback.csv),
never chosen between. The guide's own figures (with their decimals) are the ones published. Dishes only the guide lists (not on the food
page today: The Cadence Re-fuel bowl, the chicken SP Caesar, sides, snacks, drinks, platters, sets, ingredients) are not published.

Allergens (docs/DATA.md "Allergens"): copied from each dish's own item_allergens rows in the guide (is_contains true = Contains, false =
May contain, the guide's own legend). "Garlic" and "Alcohol" are extra markers the guide prints that are not among the 14 UK allergens and
are not published. Every dish has rows, so allergens.csv is complete.
"""
from __future__ import annotations
import argparse
import html
import json
import re
import subprocess
import sys
import time
import urllib.request
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "the-salad-project"
FOOD_URL = "https://www.saladproject.co.uk/pages/food"
GUIDE_HOST = "https://absolutelysaladproject.com"
GUIDE_MENU_URL = GUIDE_HOST + "/uk/menu"
GUIDE_ALLERGENS_URL = GUIDE_HOST + "/uk/allergens"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"

# food page section -> category shown (a new section stops the run)
CATEGORY = {"Salads": "Salads", "Bowls": "Bowls"}   # the page's two menu tabs (until October 2026: "Salads", "Protein Bowls")
# (page dish, the version's button label or "") -> the guide's name for that version (region london). Menu of November 2026.
GUIDE_NAME = {
    ("Caesar Protein Bowl", ""): "Caesar Protein Bowl",
    ("Golden Mezze Fibre Bowl", "Chicken"): "Golden Mezze Fibre Bowl - Chicken",
    ("Golden Mezze Fibre Bowl", "Cauliflower"): "Golden Mezze Fibre Bowl - Cauliflower",
    ("Hot Off The Ranch", ""): "Hot Off The Ranch",
    ("Mex on the Beach", "Honey Mustard Chicken"): "Mex on the Beach - Honey Mustard Chicken",
    ("Mex on the Beach", "Sesame Chilli Tofu"): "Mex on the Beach - Sesame Chilli Tofu",
    ("Miso Salmon", ""): "Miso Salmon",
    ("Satay Protein Bowl", "Chicken"): "Satay Protein Bowl - Chicken",
    ("Satay Protein Bowl", "Tofu"): "Satay Protein Bowl - Tofu",
    ("Seoul Focus Bowl", ""): "Seoul Focus Bowl",
    ("Steak Performance Bowl", ""): "Steak Performance Bowl",
    ("Surf or Turf Energy Bowl", "Prawns"): "Surf or Turf Energy Bowl - Prawns",
    ("Surf or Turf Energy Bowl", "Steak"): "Surf or Turf Energy Bowl - Steak",
    ("Thai Me Up", "Honey Mustard Chicken"): "Thai Me Up - Honey Mustard Chicken",
    ("Thai Me Up", "Bold Bean Satay"): "Thai Me Up - Bold Bean Satay",
    ("The GOAT", ""): "The GOAT",
    # the card lists "Black pepper prawns" (checked below); the guide also has a chicken version the page does not list
    ("The SP Caesar", ""): "The SP Caesar - Black Pepper Prawns",
}
EXPECTED_DISHES = 12
EXPECTED_ITEMS = 17
GUIDE_DISH_CATEGORIES = {"Salad", "Protein Bowl", "LTOs"}  # the guide's categories that hold the food page's dishes
NOT_ONE_OF_THE_14 = {"Garlic", "Alcohol"}  # extra markers in the guide; never published
PORK = re.compile(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
PAGE_KEYS = [("Calories", "calories_per_portion"), ("Protein", "protein_per_portion"), ("Carbs", "carbs_per_portion"), ("Fat", "fat_per_portion")]
# our column <- the guide's per-portion field (copied as printed)
FIELDS = {"calories": "calories_per_portion", "protein_g": "protein_per_portion", "carbs_g": "carbs_per_portion", "fat_g": "fat_per_portion",
          "sat_fat_g": "saturated_fat_per_portion", "sugar_g": "sugars_per_portion", "fiber_g": "fibre_per_portion",
          "salt_g": "salt_per_portion", "energy_kj": "energy_kj_per_portion", "weight_g": "serving_weight_g"}

NOTE = ("Per dish as the chain lists it (its ingredients include the dressing), for its 15 London shops; its Paris menu differs. "
        "The chain's food page and live guide agree; an older allergen PDF (25 May 2026) prints different figures and is not used.")
GUIDE_TITLE = "The Salad Project live allergen and dietary guide (Absolutely Salad Project, London menu)"


# ------------------------------------------------------------------------------------------------ fetching
def _robots(host: str) -> list:
    req = urllib.request.Request(host + "/robots.txt", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return robots_rfc.parse(r.read().decode("utf-8", "replace"))


NODE_JS = r"""
const { chromium } = require(process.env.PW_CORE);
const fs = require('fs');
(async () => {
  const [out, mode, ...ids] = process.argv.slice(1).filter((x, i) => !(i === 0 && x === '[eval]'));  // `node -e`: no script path in argv
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ userAgent: process.env.UA, viewport: { width: 1200, height: 1400 } });
  const visit = async (url, want, file) => {
    const p = await ctx.newPage(); const pend = [];
    p.on('response', r => { if (want(r.url())) pend.push(r.body().then(x => fs.writeFileSync(file, x))); });
    await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(2500); await Promise.all(pend); await p.close();
  };
  if (mode === 'list') await visit(process.env.GUIDE + '/uk/menu', u => u.includes('/rest/v1/menu_items?') && u.includes('is_internal') && !u.includes('id=eq.'), out + '/menu_items.json');
  else for (const id of ids) { await visit(process.env.GUIDE + '/uk/menu/' + id, u => u.includes('/rest/v1/menu_items?') && u.includes('id=eq.' + id), out + '/detail/' + id + '.json'); await new Promise(r => setTimeout(r, 1200)); }
  await b.close();
})();
"""


def fetch_all(folder: Path, playwright: Path, chrome: str) -> None:
    import os
    (folder / "detail").mkdir(parents=True, exist_ok=True)
    shop, guide = _robots("https://www.saladproject.co.uk"), _robots(GUIDE_HOST)
    time.sleep(1)
    if not robots_rfc.allowed(shop, "/pages/food") or not robots_rfc.allowed(guide, "/uk/menu"):
        raise SystemExit("robots.txt disallows a page this script reads: stop and ask the founder")
    req = urllib.request.Request(FOOD_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:  # a 403/challenge raises: never work round it
        (folder / "food.html").write_bytes(r.read())
    time.sleep(1)
    env = {**os.environ, "PW_CORE": str(playwright), "CHROME": chrome, "UA": UA, "GUIDE": GUIDE_HOST}
    subprocess.run(["node", "-e", NODE_JS, str(folder), "list"], env=env, check=True)
    feed = json.loads((folder / "menu_items.json").read_text(encoding="utf-8"))
    london = {x["name_display"]: x["id"] for x in feed if x.get("regions") == ["london"]}
    ids = [london[n] for n in GUIDE_NAME.values() if n in london]
    for i in ids:
        if not robots_rfc.allowed(guide, "/uk/menu/" + i):
            raise SystemExit("robots.txt disallows an item page")
    subprocess.run(["node", "-e", NODE_JS, str(folder), "detail", *ids], env=env, check=True)


# ------------------------------------------------------------------------------------------------ the food page
# The page's layout since November 2026 (Shopify theme t/15): one <div class="menu-showcase__nutrition" data-menu-stack="item-N"> per dish
# with its title (h3), and either one macro list or one <div class="menu-showcase__nutrition-pane" data-menu-protein-pane="<slug>-<first 8
# characters of the guide item's id>"> per version, each with its ingredient list and its four macro values ("1211", "72G"). The dish's
# menu tab (Salads / Bowls) is on its navigation dot (data-menu-dot="item-N" data-menu-item-category="..."). A version's name is the
# label of its button (data-menu-protein="<same key>").
_TAGS = re.compile(r"<[^>]+>")


def _text(fragment: str) -> str:
    return " ".join(html.unescape(_TAGS.sub(" ", fragment)).split())


def _macros(fragment: str, where: str) -> dict:
    found = re.findall(r'menu-showcase__nutrition-macro--(\w+)"><span class="menu-showcase__nutrition-value">([^<]*)</span>\s*<span>\[\s*([^\]]+?)\s*\]</span>', fragment)
    labels = {label: value.strip() for _, value, label in found}
    if [lab for _, _, lab in found] != [label for label, _ in PAGE_KEYS]:
        raise SystemExit(f"{where}: macro labels are {[lab for _, _, lab in found]}, expected {[label for label, _ in PAGE_KEYS]}")
    return labels


def _ingredients(fragment: str) -> str:
    m = re.search(r'<ul class="menu-showcase__nutrition-ingredients"[^>]*>(.*?)</ul>', fragment, re.S)
    return " ".join(_text(li) for li in re.findall(r"<li>(.*?)</li>", m.group(1), re.S)) if m else ""


def read_food_page(html_text: str) -> list[dict]:
    """One dict per dish: section, name, description, and its versions [(label, pane key, macros, ingredients)]."""
    sections = dict(re.findall(r'data-menu-dot="(item-\d+)"\s*data-menu-item-category="([^"]+)"', html_text))
    dishes = []
    for chunk in re.split(r'<div class="menu-showcase__nutrition" data-menu-stack="', html_text)[1:]:
        sid = chunk[:chunk.index('"')]
        title = re.search(r'<h3 class="menu-showcase__nutrition-title">(.*?)</h3>', chunk, re.S)
        if not title:
            raise SystemExit(f"{sid}: a dish panel without a title: the layout changed")
        name = _text(title.group(1))
        desc = re.search(r'<p\s+class="menu-showcase__nutrition-intro"[^>]*>(.*?)</p>', chunk, re.S)
        buttons = {k: _text(v) for k, v in re.findall(r'data-menu-protein="([^"]+)"\s*aria-pressed="\w+"\s*>(.*?)</button>', chunk, re.S)}
        panes = re.split(r'class="menu-showcase__nutrition-pane"\s*data-menu-protein-pane="', chunk)
        versions = []
        if len(panes) > 1:
            for pane in panes[1:]:
                key = pane[:pane.index('"')]
                if key not in buttons:
                    raise SystemExit(f"{name}: a version panel {key!r} has no button naming it")
                versions.append((buttons[key], key, _macros(pane, f"{name} / {buttons[key]}"), _ingredients(pane)))
            if len(versions) != len(buttons):
                raise SystemExit(f"{name}: {len(buttons)} version buttons but {len(versions)} panels")
        else:
            if buttons:
                raise SystemExit(f"{name}: version buttons but no version panels: the layout changed")
            versions.append(("", "", _macros(chunk, name), _ingredients(chunk)))
        dishes.append({"section": sections.get(sid, ""), "name": name, "description": _text(desc.group(1)) if desc else "", "versions": versions})
    return dishes


def split_values(printed: str, where: str) -> list[str]:
    """'636.3 / 756.9' -> ['636.3', '756.9']; '16.5G' -> ['16.5']. Stops on anything that is not a plain decimal."""
    values = []
    for x in (p.strip() for p in printed.split("/")):
        x = re.sub(r"\s*[gG]$", "", x)
        if not re.fullmatch(r"\d+(\.\d+)?", x):
            raise SystemExit(f"{where}: cannot read {printed!r} as a plain number (or 'a / b' pair): check the page")
        values.append(x)
    return values


def page_versions(dishes: list[dict]) -> list[dict]:
    """One row per dish version: name, label, section, the four printed numbers, ingredients text, the pane's guide id prefix."""
    if len(dishes) != EXPECTED_DISHES:
        raise SystemExit(f"The food page now has {len(dishes)} dishes, expected {EXPECTED_DISHES}: {[d['name'] for d in dishes]}. "
                         "Re-read the page and update GUIDE_NAME / EXPECTED_DISHES.")
    rows = []
    for d in dishes:
        if d["section"] not in CATEGORY:
            raise SystemExit(f"{d['name']}: new menu section {d['section']!r}: add it to CATEGORY")
        for label, key, macros, ingredients in d["versions"]:
            if (d["name"], label) not in GUIDE_NAME:
                raise SystemExit(f"{d['name']} / {label!r} is not in GUIDE_NAME: the page has a dish or version this script doesn't know")
            page = {}
            for lab, k in PAGE_KEYS:
                if lab == "Calories" and re.search(r"[gG]\s*$", macros[lab]):
                    raise SystemExit(f"{d['name']}: calories printed with a gram unit: {macros[lab]!r}")
                vals = split_values(macros[lab], f"{d['name']} {label} {lab}")
                if len(vals) != 1:
                    raise SystemExit(f"{d['name']} {label}: {lab} prints {macros[lab]!r}, expected one number per version")
                page[k] = vals[0]
            rows.append({"dish": d["name"], "label": label, "section": d["section"], "page": page, "ingredients": ingredients,
                         "description": d["description"], "id_prefix": key.rsplit("-", 1)[-1] if key else ""})
    if len(rows) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} dish versions on the page, found {len(rows)}")
    sp = [r for r in rows if r["dish"] == "The SP Caesar"][0]
    if "black pepper prawns" not in sp["ingredients"].lower():
        raise SystemExit("The SP Caesar card no longer lists black pepper prawns: it is mapped to the guide's prawn version, re-check")
    return rows


# ------------------------------------------------------------------------------------------------ the guide
def _load(path: Path):
    """JSON with every number kept as the text the guide printed (so 622.8 stays '622.8', 700.0 becomes '700')."""
    return json.loads(path.read_text(encoding="utf-8"), parse_float=lambda s: s, parse_int=lambda s: s)


def as_printed(v) -> str:
    s = str(v)
    return s[:-2] if s.endswith(".0") else s


def same_number(page: str, guide: str) -> bool:
    """The food page prints whole numbers since November 2026 ("1211", "72G"): it agrees with the guide when the guide's figure, rounded
    half up to a whole number, is the same. A figure the page prints with decimals must equal the guide's exactly."""
    if "." in page:
        return Decimal(page) == Decimal(guide)
    return Decimal(guide).quantize(Decimal(1), rounding=ROUND_HALF_UP) == Decimal(page)


def allergen_row(rows: list[dict], where: str) -> dict:
    contains, may = [], []
    for r in rows:
        name = r["allergen"]
        if name in NOT_ONE_OF_THE_14:
            continue
        (contains if r["is_contains"] is True else may).append(name)
        if r["is_contains"] not in (True, False):
            raise SystemExit(f"{where}: allergen {name!r} has is_contains={r['is_contains']!r}")
    ck, cereals, nuts = allergen_words(contains, where)
    mk, _, _ = allergen_words(may, where)
    return {"contains": ck, "may_contain": mk, "cereals": cereals, "nuts": nuts}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--playwright", type=Path, help="playwright-core folder (with --fetch)")
    ap.add_argument("--chrome", default="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        if not args.playwright:
            raise SystemExit("--fetch needs --playwright PATH (the playwright-core folder)")
        fetch_all(args.pages, args.playwright, args.chrome)
    food = args.pages / "food.html"
    feed_path = args.pages / "menu_items.json"
    print(f"food.html sha256 {sha256_file(food)}\nmenu_items.json sha256 {sha256_file(feed_path)}")
    versions = page_versions(read_food_page(food.read_text(encoding="utf-8")))
    feed = _load(feed_path)
    london = {}
    for x in feed:
        if x.get("regions") == ["london"]:
            london.setdefault(x["name_display"], []).append(x)
    items, holdback, report = [], [], []
    for v in versions:
        gname = GUIDE_NAME[(v["dish"], v["label"])]
        found = london.get(gname, [])
        if len(found) != 1:
            raise SystemExit(f"{gname}: {len(found)} London items in the guide, expected exactly 1")
        listed = found[0]
        if v["id_prefix"] and not listed["id"].startswith(v["id_prefix"]):
            raise SystemExit(f"{gname}: the page's version panel points at guide item {v['id_prefix']}..., the guide's London item is {listed['id']}")
        if listed["category"] not in GUIDE_DISH_CATEGORIES:
            raise SystemExit(f"{gname}: the guide's category is {listed['category']!r}, expected one of {sorted(GUIDE_DISH_CATEGORIES)}")
        detail_file = args.pages / "detail" / f"{listed['id']}.json"
        sha = sha256_file(detail_file)
        rows = _load(detail_file)
        if len(rows) != 1 or rows[0]["id"] != listed["id"]:
            raise SystemExit(f"{detail_file}: not the one item {listed['id']}")
        d = rows[0]
        nut = d["item_nutritionals"]
        for k in ("calories_per_portion", "protein_per_portion", "carbs_per_portion", "fat_per_portion"):
            if str(nut[k]) != str(listed["item_nutritionals"][k]):
                raise SystemExit(f"{gname}: the item page and the menu list print different {k}: {nut[k]} vs {listed['item_nutritionals'][k]}")
        if sorted((a["allergen"], a["is_contains"]) for a in d["item_allergens"]) != sorted((a["allergen"], a["is_contains"]) for a in listed["item_allergens"]):
            raise SystemExit(f"{gname}: the item page and the menu list print different allergens")
        if not d["item_allergens"]:
            raise SystemExit(f"{gname}: no allergen rows in the guide: allergens would not be complete")
        for k in FIELDS.values():
            if k in ("salt_per_portion", "energy_kj_per_portion", "serving_weight_g", "saturated_fat_per_portion", "sugars_per_portion", "fibre_per_portion") and nut.get(k) is None:
                raise SystemExit(f"{gname}: the guide prints no {k}")
        name = v["dish"] if not v["label"] else f"{v['dish']} - {v['label']}"
        if v["dish"] == "The SP Caesar":
            name = "The SP Caesar - Black Pepper Prawns"
        diffs = [f"{label.lower()} {v['page'][k]} (page) vs {nut[k]} (guide)" for label, k in PAGE_KEYS if not same_number(v["page"][k], str(nut[k]))]
        if diffs:
            reason = (f"The chain's food page and its live guide print different figures for this dish ({'; '.join(diffs)}); "
                      "the two official sources disagree, so neither is published.")
            holdback.append((slug(name), reason))
            report.append(f"HELD BACK {name}: {'; '.join(diffs)}")
        else:
            report.append(f"page = guide: {name} ({nut['calories_per_portion']} kcal)")
        flags = [f["flag"] for f in d["item_dietaries"]]
        text = d["ingredients_full"] + " " + v["ingredients"]
        tags = (["vegetarian"] if ("Vegetarian" in flags or "Vegan" in flags) else []) + \
               (["contains_pork"] if PORK.search(text) else []) + (["contains_beef"] if BEEF.search(text) else [])
        it = {"name": name, "category": CATEGORY[v["section"]], "serving": "", "tags": "|".join(tags),
              "limited_time": bool(re.search(r"limited edition", v["description"] + " " + (d.get("description") or ""), re.I)),
              "rankable": True, "allergens": allergen_row(d["item_allergens"], name),
              "notes": f"guide item {listed['id']} (detail sha256 {sha[:12]}); page printed {v['page']['calories_per_portion']} kcal; "
                       f"guide diet flags: {', '.join(flags) or 'none'}"}
        for ours, theirs in FIELDS.items():
            it[ours] = as_printed(nut[theirs])
        items.append(it)
    # what the guide lists as dishes that the page does not (reported, not published)
    page_guide_names = set(GUIDE_NAME.values())
    guide_only = sorted(n for n, xs in london.items() if xs[0]["category"] in GUIDE_DISH_CATEGORIES and n not in page_guide_names)
    guide = {"title": GUIDE_TITLE, "url": GUIDE_ALLERGENS_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="The Salad Project", cuisine="Bowls",
        source_title=f"The Salad Project food page and its live guide: nutrition and allergens, London menu (accessed {args.checked_on}, no date shown)",
        source_url=FOOD_URL, checked_on=args.checked_on, aliases=["the salad project", "salad project", "saladproject"],
        items=items, out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide)
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    print("guide dishes (London) not on the food page, not published: " + ", ".join(guide_only))
    return 0


if __name__ == "__main__":
    sys.exit(main())
