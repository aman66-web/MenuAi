#!/usr/bin/env python3
"""Build data/source/hall-and-woodhouse/ from Hall & Woodhouse's own allergy / nutrition pages (a CALORIES-ONLY chain, complete allergens).

    python3 -I tools/uk_extract/hall_and_woodhouse.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://www.hall-woodhouse.co.uk/allergens/ ("Allergy Information: please select the pub you are booking for and we will present
the relevant allergy information") is a drop-down of 49 pubs, each a Ten Kites menu page such as https://viewthe.menu/xap7 (see
hall_and_woodhouse_pages.py for the page layout; hall_and_woodhouse_fetch.py lists the pubs read and downloads the pages). robots.txt of
viewthe.menu only disallows /fonts/, /views/ and /*.less$; hall-woodhouse.co.uk prints a stray "Crawl-delay: 10" (kept: 10 s after its one
page) and an empty Disallow. The pages show no date ("accessed <date>, no date shown"). 8 pubs are read, every menu tab of each (except
"Food Modifications", which lists the kitchen's allergy swaps, and the two "Buffet" menus: group platters whose calories are for a whole
platter of no stated size): Hall & Woodhouse Bath, Crowthorne, Portishead, Taplow, Wichelstowe, The Black Rabbit, The Ship Inn, The Plough.

What each dish prints: its calories in brackets beside the name ("(383 kcal)"; none for most drinks), 14 allergen columns marked contains /
may contain / none, two "Gluten Free" cereal columns (Oats, Barley), "Plant Based" and "Vegetarian" columns, and a "Dietary Information"
card with the printed "Suitable for / Contains / May contain" lines and the ingredient list. The only nutrient is "Energy (kCal)"
("Nutrition values per serving"): there is NO protein, carbohydrate, fat, salt, kJ or weight, so this is a calories-only chain
(docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank and every item is non-rankable. `serving` stays blank: the page
says "all Kcals are based on our standard recipe & portion size".

The pubs' menus differ (a dish is on some pubs' menus and not others, and the same name can carry different figures on different menus,
for instance a side and a sharing portion, or a gluten-friendly version). Same rule as Caravan and English Heritage: a dish is published
ONLY when its calories, its allergen marks (contains / may contain, with the named cereals and nuts) and its diet flags are identical on
EVERY menu, at EVERY pub, that prints that dish name, and it is printed at no fewer than MIN_PUBS pubs (a dish seen at one pub only has
nothing to be identical with). Names are compared as printed except capitalisation, accents, spaces, "&" / "and" and punctuation. A
different figure is never merged, picked from or averaged: the dish is left out and listed in the run's output. A dish that prints no
calories anywhere (wines, beers, spirits) is not published. A figure that sits only in a page's data attribute (not shown beside the name)
is not a printed figure and is not published.

Allergens (docs/DATA.md "Allergens") are complete for every published dish: the 14 columns, the printed Contains / May contain lines and
the label ids the page's own allergen filter uses must agree (hall_and_woodhouse_pages.py), or the dish is left out. The pages also
carry "Gluten Free Oats" and "Gluten Free Barley" marks: they are not among the 14 and what they mean for a dish is not stated, so a dish
carrying either mark is left out (never shown without them). "Cross contamination" is stated on the page generally (fried food may share
fryers) and is in the allergen guide's wording only. Named cereals and nuts are published for "Contains" only; where a key is both contained
and may-contained (wheat contained, barley only possible) the key shows as contained and the named kinds are dropped
(common.write_allergens). A dish whose every column says "no" and that prints no line contains none of the 14.

Tags: vegetarian when the dish's own "Vegetarian" or "Plant Based" column is marked (unless it contains fish, crustaceans or molluscs:
then it is not tagged and the clash is reported). contains_pork / contains_beef only when the dish NAME says so (the pages print
ingredients as recipe names, which are not read). A dish whose every print is on a Christmas menu is limited_time.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import hall_and_woodhouse_fetch as hf  # noqa: E402
import hall_and_woodhouse_pages as hp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "hall-and-woodhouse"
HUB_URL = hf.HUB_URL
MIN_PUBS = 2
# printed section (lower case, "&" -> "and") -> category shown. An unlisted section stops the run so a human places it.
CATEGORIES = {
    "small plates": "Small plates",
    "starters and sharers": "Starters and sharers", "starters": "Starters and sharers", "sharers": "Starters and sharers",
    "sharer": "Starters and sharers", "while you wait": "Starters and sharers",
    "nibbles": "Snacks and nibbles", "pork crackling": "Snacks and nibbles", "pasties and sausage rolls": "Snacks and nibbles",
    "on bread": "Sandwiches and bread", "sandwiches": "Sandwiches and bread", "sandwiches and toasties": "Sandwiches and bread",
    "mains": "Mains", "main course": "Mains", "main dishes": "Mains", "main dish": "Mains", "hero mains": "Mains",
    "house favourites": "Mains", "sunday roasts": "Sunday roasts",
    "burgers and pizza": "Burgers and pizza", "burgers": "Burgers and pizza",
    "pizza": "Pizza", "pizza extras": "Pizza", "pizza by the slice": "Pizza",
    "salad": "Salads", "sides": "Sides",
    "kids": "Kids", "kids roasts": "Kids", "other kids mains": "Kids", "kids breakfasts": "Kids",
    "breakfasts": "Breakfast and brunch", "breakfast baps": "Breakfast and brunch", "brunch": "Breakfast and brunch",
    "waffles": "Breakfast and brunch",
    "puddings": "Puddings", "mini treats": "Puddings", "sorbet": "Puddings", "cakes": "Cakes and bakes",
    "condiments": "Sauces and condiments",
    "coffee": "Coffee and tea", "hot chocolate": "Coffee and tea", "tea selection": "Coffee and tea", "milk choices": "Coffee and tea",
    "matcha coffee": "Coffee and tea", "accompaniments": "Coffee extras",
    "soft drinks": "Soft drinks", "packaged soft drinks": "Soft drinks",
    "beers": "Beer and cider", "stouts": "Beer and cider", "cask": "Beer and cider", "cider": "Beer and cider",
    "cocktails": "Spirits and cocktails", "handw, bath and olive branch, wimborne cocktails": "Spirits and cocktails",
    "sunshine serves": "Spirits and cocktails", "midwinter mixes": "Spirits and cocktails", "aperitif": "Spirits and cocktails",
    "low and no": "Spirits and cocktails", "spirits": "Spirits and cocktails", "gin": "Spirits and cocktails",
    "vodka": "Spirits and cocktails", "rum": "Spirits and cocktails", "whisk(e)y": "Spirits and cocktails",
    "liqueur": "Spirits and cocktails", "brandy / cognac": "Spirits and cocktails",
    "white wines": "Wine", "red wines": "Wine", "rose wines": "Wine", "sparkling wines": "Wine", "fortified wines": "Wine",
}
# Dishes that stay in items.csv but are not published (holdback.csv; restore by deleting the line). Nothing is corrected.
HOLDBACK: dict = {}
SOURCE_TITLE = ("Hall & Woodhouse allergy, nutrition and dietary information: the Ten Kites menu pages of 8 pubs (viewthe.menu), food and "
                "drink menus (accessed {date}, no date shown)")
ALLERGEN_TITLE = "Hall & Woodhouse Allergy Information: per-pub allergen matrix on Ten Kites (8 pubs read; accessed {date}, no date shown)"
ALIASES = ["hall and woodhouse", "hall & woodhouse", "h&w", "hall woodhouse", "hall and woodhouse pubs"]
CHRISTMAS = re.compile(r"christmas", re.I)


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def key_of(name: str) -> str:
    """Names compared as printed except capitalisation, accents, spaces, '&' / 'and' and punctuation."""
    s = fold(name).lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def mark_signature(r: dict) -> tuple:
    """Everything printed about a dish's allergens and diet, so two prints of one dish can be compared."""
    def parts(ps):
        return frozenset((h.lower(), tuple(sorted(x.lower() for x in inner))) for h, inner in ps)
    return (parts(r["lines"]["contains"]), parts(r["lines"]["may"]), r["vegetarian"], r["plant_based"])


def load(pages_dir: Path, fetch: bool):
    """Every dish of every menu of every pub read: (instances, page hash lines). instance = {pub, menu, category, printed_section, + the
    row from hall_and_woodhouse_pages}. With fetch, the hub page and every page are downloaded first (one request per page)."""
    hub = pages_dir / "hub.html"
    if fetch:
        hub_pubs = hf.fetch_hub(hub)
    else:
        hub_pubs = hf.hub_pubs(hub)
    listed = {code: name for code, name in hub_pubs}
    for code, name in hf.PUBS:
        if code not in listed:
            raise SystemExit(f"{name} ({code}) is no longer in the hub page's drop-down: re-check the pub list")
    rules = hp.robots_rules(pages_dir / "robots.txt", fetch=fetch)
    instances, hashes = [], []
    for code, pub in hf.PUBS:
        if fetch:
            tabs = hf.fetch_pub(pages_dir, code, rules)
        else:
            any_page = sorted(p for p in pages_dir.glob(f"{code}_*.html") if not p.name.endswith("_first.html"))
            if not any_page:
                raise SystemExit(f"{pub}: no pages in {pages_dir}: run with --fetch")
            tabs = [(n, g) for n, g in hp.menu_tabs(tk.parse_html(any_page[0].read_text(encoding="utf-8"))) if not hf.skipped(n)]
        for tab, guid in tabs:
            path = hf.page_path(pages_dir, code, guid)
            where = f"{pub} / {tab}"
            if not path.exists():
                raise SystemExit(f"{where}: page {path.name} is missing: run with --fetch")
            text = path.read_text(encoding="utf-8")
            title = tk.page_title(text)
            if title != tab:
                raise SystemExit(f"{where}: the page is titled {title!r}")
            found = hp.menu_tabs(tk.parse_html(text))
            if (tab, guid) not in found:
                raise SystemExit(f"{where}: the page's own tab bar no longer lists this menu")
            for r in hp.read_page(text, where):
                sec = r["section"].lower().replace("&", "and")
                if sec not in CATEGORIES:
                    raise SystemExit(f"{where}: new section {r['section']!r}: add it to CATEGORIES.")
                instances.append({"pub": pub, "menu": tab, "category": CATEGORIES[sec], "printed_section": r["section"], **r})
            hashes.append(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}  {pub} / {tab}")
    return instances, hashes


def build(instances: list):
    """Group by dish name, apply the 'identical wherever printed' rule. Returns (items, report lines, left-out lines for dishes that print
    calories but conflict or cannot be published, names of dishes that print no calories anywhere)."""
    groups: dict = {}
    for inst in instances:
        groups.setdefault(key_of(inst["name"]), []).append(inst)
    items, report, left_out, no_calories = [], [], [], []
    for k, group in groups.items():
        first = group[0]
        where = lambda i: f"{i['pub']}/{i['menu']}/{i['printed_section']}"  # noqa: E731
        kcals = sorted({g["kcal"] for g in group if g["kcal"] is not None}, key=int)
        sigs = {mark_signature(g) for g in group}
        names = {g["name"] for g in group}
        pubs = sorted({g["pub"] for g in group})
        if len(names) > 1:
            report.append(f"same dish, spelled differently: {sorted(names)}")
        bad = [g for g in group if g["problem"]]
        if bad:
            left_out.append(f"the page's own allergen marks contradict each other: {first['name']!r} at " + ", ".join(sorted({where(g) for g in bad})[:3]))
            continue
        if any(g["options"] for g in group):
            left_out.append(f"has choose-your-option sub-items whose figures are not read: {first['name']!r}")
            continue
        if not kcals:
            hidden = sorted({g["hidden_kcal"] for g in group if g["hidden_kcal"]})
            if hidden:
                left_out.append(f"calories only in the page's data attribute, not shown: {first['name']!r} ({', '.join(hidden)})")
            else:
                no_calories.append(first["name"])
            continue
        gf = sorted({c for g in group for c in g["gf_cereal"]})
        if gf:
            left_out.append(f"carries a {' / '.join(gf)} mark (not one of the 14 allergens, meaning not stated): {first['name']!r}")
            continue
        if len(kcals) > 1:
            by: dict = {}
            for g in group:
                by.setdefault(g["kcal"], []).append(where(g))
            left_out.append(f"calories differ: {first['name']!r}: " + "; ".join(
                f"{v} kcal ({len(w)} prints, e.g. {w[0]})" for v, w in sorted(by.items(), key=lambda kv: (kv[0] is None, int(kv[0] or 0)))))
            continue
        if len(sigs) > 1:
            left_out.append(f"allergen or diet marks differ: {first['name']!r} in " + ", ".join(sorted({where(g) for g in group})[:4]))
            continue
        if len(pubs) < MIN_PUBS:
            left_out.append(f"printed at {len(pubs)} pub only ({pubs[0]}): {first['name']!r} ({kcals[0]} kcal)")
            continue
        name = first["name"].strip()
        allergens = {**first["allergens"], "may_contain": set(first["allergens"]["may_contain"])}
        for head, key in (("cereals with gluten", "gluten"), ("tree nuts", "nuts")):
            if key in allergens["contains"] and any(h.lower() == head for h, _inner in first["lines"]["may"]):
                allergens["may_contain"].add(key)
        veg = first["vegetarian"] or first["plant_based"]
        if veg and {"fish", "crustaceans", "molluscs"} & set(first["allergens"]["contains"]):
            report.append(f"CLASH, not tagged vegetarian although the chain marks it so (it contains fish, crustaceans or molluscs): {name}")
            veg = False
        meat, unspecified = tk.meat_tags(name, vegetarian=veg)
        if unspecified and not veg:
            report.append(f"meat type not stated: {name}")
        menus = sorted({g["menu"] for g in group})
        limited = all(CHRISTMAS.search(g["menu"]) for g in group)
        notes = f"Printed at {len(pubs)} of {len(hf.PUBS)} pubs read; menus: {'; '.join(menus)}"
        items.append({"name": name, "id": slug(fold(name)), "category": first["category"], "serving": "", "calories": kcals[0],
                      "tags": "|".join((["vegetarian"] if veg else []) + meat), "rankable": False, "limited_time": limited,
                      "notes": notes, "allergens": allergens})
    return items, report, left_out, no_calories


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or receiving, with --fetch) the pub pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the hub page and every menu page into --pages first (1.5 s apart)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    instances, hashes = load(args.pages, args.fetch)
    items, report, left_out, no_calories = build(instances)
    if not items:
        raise SystemExit("no items built")
    unknown = sorted(set(HOLDBACK) - {it["id"] for it in items})
    if unknown:
        raise SystemExit(f"HOLDBACK names dishes that are no longer built: {unknown}")
    note = ("Calories only, as printed beside each dish (standard recipe and portion size). The pubs' menus differ, so a dish is listed only if "
            f"its calories and allergens are identical at every pub that prints it (8 pubs read, 2 or more each): not every pub serves every "
            f"dish. Buffet menus are not listed.")
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters, over the 400 limit")
    title = SOURCE_TITLE.format(date=args.checked_on)
    guide = {"title": ALLERGEN_TITLE.format(date=args.checked_on), "url": HUB_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Hall & Woodhouse", cuisine="Pub", source_title=title, source_url=HUB_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=note, holdback=sorted(HOLDBACK.items()),
                             allergen_guide=guide, nutrition_level="calories")
    if not HOLDBACK:
        (out / "holdback.csv").unlink(missing_ok=True)
    combined = hashlib.sha256("\n".join(sorted(h.split()[0] for h in hashes)).encode()).hexdigest()
    print("\n".join(hashes))
    print(f"combined sha256 of the {len(hashes)} page hashes (sorted): {combined}")
    distinct = len({key_of(i["name"]) for i in instances})
    print(f"{len(instances)} printed dishes -> {distinct} distinct names -> {len(items)} built, {len(HOLDBACK)} held back, "
          f"{len(left_out)} left out, {len(no_calories)} print no calories anywhere (not listed)")
    print("\n".join(f"report: {r}" for r in report))
    print("\n".join(f"left out: {x}" for x in left_out))
    print(f"no calories printed anywhere ({len(no_calories)} dishes): " + "; ".join(no_calories[:40]) + (" ..." if len(no_calories) > 40 else ""))
    counts: dict = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print("wrote", len(items), "items to", out, ":", ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
