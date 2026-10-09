#!/usr/bin/env python3
"""Build data/source/butcombe-inns/ from Butcombe Inns' own "Allergy Aware" menu pages (a CALORIES-ONLY chain, complete allergens).

    python3 -I tools/uk_extract/butcombe_inns.py --pages DIR --checked-on 2026-10-09 [--fetch] [--fetch-only] [--out DIR] [--report]

Source: https://butcombe.com/allergyaware/ ("Allergy Aware", a drop-down of the group's pubs; robots.txt of butcombe.com allows it) lists 55
pubs, each a Ten Kites menu page such as https://viewthe.menu/szyb (The Methuen Arms) that the group's own page links to. robots.txt of
viewthe.menu only disallows /fonts/, /views/ and /*.less$ (checked with robots_rfc.py before every request). Each pub page opens the pub's
first menu; its tab bar lists the other menus (Sunday, Supper, Lunch, Kids, Breakfast, Puddings, Hot Drinks ...), fetched as
<pub address>?mguid=<menu id>. The pages show no date ("accessed <date>, no date shown"). On 2026-10-09 five of the 55 links lead nowhere
(White Hart Wroughton, Admiral Codrington and Bourne Valley Inn: Ten Kites' own "404 Page Not Found"; Kings Arms Didmarton and Kings Head
Hursley: "No menus have been published to this page"): 50 pubs are read, every tab of each except the 11 "Breakfast Buffet Table" tabs
(self-serve buffet items such as "Kids Cereals" or "Pastries - Croissant & Pain au chocolat" with no stated portion). --fetch downloads
whatever is missing from --pages (one request per page, 1.2 s apart).

What each dish prints: the calories in brackets beside the dish name ("(341 kcal)"), 14 allergen columns marked contains / may contain /
none and a "Dietary Information" card with the printed "Contains / May contain" lines (cereals and tree nuts named in brackets). The
only number is "kcal": there is NO protein, carbohydrate, fat, salt, kJ or weight and no portion size, so this is a calories-only chain
(docs/DATA.md "Calories-only chains"): protein, carbs and fat stay blank and every item is non-rankable; `serving` stays blank (except
"for two" where the dish name says so). The diet marks "(v)" (vegetarian) and "(ve)" (vegan) are printed inside the dish names; "(vo)" /
"(veo)" mean a vegetarian / vegan version can be asked for, which the dish itself is not, so only "(v)" and "(ve)" give the tag `vegetarian`.

The pubs' menus differ (a dish is on some pubs' menus and not others, and the same name can carry different figures at different pubs).
Same rule as Brunning & Price and Hall & Woodhouse: a dish is published ONLY when its printed name, its calories and its allergen marks
(contains / may contain, with the named cereals and nuts) are identical on EVERY menu, at EVERY pub, that prints that dish name, and it
is printed with calories at no fewer than MIN_PUBS (2) pubs. Names are compared as printed except capitalisation, accents, spaces, "&" /
"and" and punctuation; children's-menu dishes are judged apart from adult ones (and end "(children's)"). A different figure is never
merged, picked from or averaged: the dish is left out and listed in the run's output (--report). A figure that sits only in a page's data
attribute (not shown beside the name) is not a printed figure: it is not published, and if it differs from the printed figure of the same
dish elsewhere the dish is left out. A dish that prints no calories anywhere is not published.

Left out on purpose (counted in the run's report):
- alcohol ("Aperitifs": Negroni 13 kcal, gin spritz...): no serving or volume is printed, and 13 kcal cannot be right for a drink with spirit;
- the "Bensons" section of the Kids menus (the dogs' menu);
- the "Hot Drinks" tabs: the table gives every drink the same allergen line (eggs, gluten, milk and soya even on Earl Grey, builder's tea and
  an Americano) and the same figure to different drinks (139 kcal for English Breakfast tea, Earl Grey, builder's tea and a macchiato), so
  it cannot describe single drinks; "Illy Coffee - Black forest Monbana hot chocolate" marks all 14 allergens and every cereal and nut;
- the buffet tabs, dishes printed at one pub only, dishes whose calories or allergens differ at any pub.
HOLD_TEXT: dishes that stay in items.csv but are held back (holdback.csv): the chain's own allergen row contradicts the dish's name
(pancakes, brownies, churros, crumbles, a sticky toffee pudding and beer-battered onion rings with no gluten marked or gluten only under
"May contain"; a vanilla-ice-cream dessert with milk only under "May contain"), a catch-all all-14 row, a figure that cannot belong to one dish
(variable "of the day" dishes, alternatives with one figure, unnamed ice-cream flavours, a 760 kcal breakfast sausage). Never corrected.

Allergens (docs/DATA.md "Allergens") are complete for every published dish: the 14 columns, the printed Contains / May contain lines and
the label ids the page's own allergen filter uses must agree (butcombe_inns_pages.py), or the dish is left out. Named cereals and nuts
are published for "Contains" only, as printed (the pages often list every cereal or tree nut kind); where a key is both contained and
may-contained the key shows as contained and the named kinds are dropped (common.write_allergens). A dish whose every column says "no"
and that prints no line contains none of the 14. The pages say "We cannot 100% guarantee the absence of all allergens in our dishes".

Tags: vegetarian only from the dish's own "(v)" / "(ve)" mark (a dish whose mark contradicts its allergen row is left out); contains_pork /
contains_beef only when the dish NAME says so. Dishes only ever printed on Christmas or festive menus are limited_time (none today).

Independent checks 2026-10-09: every print of every published dish in the saved pages was re-read with a regex-only parser (3,549 prints,
0 differences in calories, Contains, May contain, named cereals and nuts) and 34 dishes were compared on live Chromium-rendered pages of two
pubs (0 differences; rows also looked at as screenshots). Re-runs: check_chain.py's accuracy audit must still show 0 high flags, and its
medium flags need reading against the source (data/audit/reviewed/butcombe-inns.csv holds the ones judged fine).
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import butcombe_inns_pages as bp  # noqa: E402
import tenkites_a as ta  # noqa: E402  (_PORK, _BEEF, _MEATY, _ANIMAL)
import tenkites_c as tk  # noqa: E402
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "butcombe-inns"
HUB_URL = bp.HUB_URL
MIN_PUBS = 2
DEAD_TITLE = "404 Page Not Found"     # a pub whose link on the group's page now leads to Ten Kites' own 404 page
NO_MENUS = "No menus have been published to this page"       # ... or to an empty Ten Kites page


def unusable(text: str) -> bool:
    return tk.page_title(text) == DEAD_TITLE or NO_MENUS in text
SKIP_TABS = re.compile(r"buffet", re.I)     # self-serve buffet tables: no stated portion
ALIASES = ["butcombe", "butcombe inns", "butcombe pubs", "butcombe pub", "butcombe inns and hotels", "butcombe collection"]
CHRISTMAS = re.compile(r"christmas|festive|xmas", re.I)
# Dishes that stay in items.csv but are held back (holdback.csv; restore by deleting the entry). Key = (children's menu?, printed name), reason =
# why. Nothing is corrected: the chain's own allergen row contradicts the dish's own name, or its figure cannot belong to one dish.
# Independent re-read of the rendered pages 2026-10-09 (see docs/UK_DATA_STATUS.md); every one of these is printed identically at every pub.
_NO_G = "allergen row contradicts the dish name: %s but no gluten is marked (neither 'Contains' nor 'May contain')"
_MAY_G = "allergen row contradicts the dish name: %s but gluten is only under 'May contain', never 'Contains'"
HOLD_TEXT = {
    (False, "Butcombe beer-battered onion rings (v)"): "allergen row contradicts the dish name: beer-battered onion rings with no allergen marked at all (no gluten)",
    (False, "Buttermilk pancakes, West Country strawberries, compote, honey and pouring cream (v)"): _NO_G % "pancakes",
    (False, "Buttermilk pancakes, toffee apple compote, cinnamon crunch, maple syrup and cream (v)"): _MAY_G % "pancakes",
    (True, "Kids - BUTTERMILK PANCAKES (v) | Fresh fruit, honey"): _NO_G % "pancakes",
    (False, "Brownie baked Alaska, coffee ice cream, raspberry (v)"): _NO_G % "a brownie base",
    (False, "Dark chocolate and pecan brownie, toffee popcorn, salted honey ice cream (v) (veo)"): _MAY_G % "a brownie",
    (False, "Cinnamon churros, chocolate sauce (ve)"): _NO_G % "churros",
    (False, "Seasonal fruit, apple, almond and oat crumble, vanilla custard or ice cream (v) (veo)"): _NO_G % "an oat crumble",
    (True, "Seasonal fruit crumble, custard or ice cream (v) (veo)"): _NO_G % "a crumble",
    (False, "Classic sticky toffee pudding, Two Drifters Rum and raisin ice cream (v)"): _NO_G % "a sticky toffee pudding",
    (False, "Little Biscoff doughnuts, salted caramel sauce, vanilla ice cream (v)(veo)"):
        "allergen row contradicts the dish name: a (v) dish served with vanilla ice cream but milk is only under 'May contain', never 'Contains'",
    (False, "Somerset charcuterie, pickles, sourdough focaccia, oil and vinegar"):
        "allergen row marks all 14 allergens, every gluten cereal and every tree nut as contained: a catch-all row, not a description of this board",
    (False, "Breakfast sausage"): "figure contradicts the chain's own other figures: 760 kcal for one breakfast sausage is more than its Full English breakfast (594 kcal)",
    (False, "Add skin-on fries or garden salad"): "one figure (463 kcal) for two different foods, fries or salad",
    (False, "Sauces - Béarnaise / Peppercorn / Chimichurri"): "one figure and one allergen line for three different sauces",
    (False, "Brixham market fish of the day - please ask for details (market price)"): "the fish changes daily, so one figure and one allergen row cannot describe the dish",
    (False, "Pie of the week, seasonal greens, proper gravy, your choice of mash or thick-cut chips"):
        "the pie changes weekly; the figure (1416 kcal) is the same as the Beef shin and Butcombe Ale pie's, so it cannot describe the dish",
    (False, "2024 Two scoops of Granny Gothards ice creams and sorbets (v) (veo)"): "no flavour is named (ice creams and sorbets), so the figure cannot be tied to a dish; the name carries a stale '2024'",
    (False, "Two scoops of Granny Gothards ice creams and sorbets (v) (veo)"): "no flavour is named (ice creams and sorbets), so the figure cannot be tied to a dish",
    (True, "Scoop of ice cream or sorbet (v) (veo)"): "no flavour is named (ice cream or sorbet), so the figure cannot be tied to a dish",
}


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def key_of(name: str) -> str:
    """Names compared as printed except capitalisation, accents, spaces, '&' / 'and' and punctuation."""
    s = fold(name).lower().replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def skipped(tab: str) -> bool:
    return bool(SKIP_TABS.search(tab))


def page_path(pages: Path, code: str, guid: str) -> Path:
    return pages / f"{code}_{guid}.html"


def fetch_hub(pages: Path, brules: list) -> list:
    dest = pages / "hub.html"
    bp.get(HUB_URL, dest, brules, "https://butcombe.com")
    return bp.hub_pubs(dest.read_text(encoding="utf-8"))


def fetch_pub(pages: Path, code: str, rules: list) -> list:
    """Download a pub's first page and every other menu tab it lists (except buffet tabs). Returns [(tab name, menu id)] for the tabs
    read, in tab order; pages already on disk are not downloaded again."""
    first_url = f"{bp.SITE}/{code}"
    tmp = pages / f"{code}_first.html"
    if not tmp.exists():
        bp.get(first_url, tmp, rules, bp.SITE)
    if unusable(tmp.read_text(encoding="utf-8")):
        return []
    tabs = bp.menu_tabs(tk.parse_html(tmp.read_text(encoding="utf-8")))
    if not tabs:
        raise SystemExit(f"{code}: no tab bar on the page")
    first_path = page_path(pages, code, tabs[0][1])
    if not first_path.exists():
        tmp.rename(first_path)
    else:
        tmp.unlink()
    for name, guid in tabs[1:]:
        if skipped(name):
            continue
        dest = page_path(pages, code, guid)
        if not dest.exists():
            bp.get(f"{first_url}?mguid={guid}", dest, rules, bp.SITE)
    return [(n, g) for n, g in tabs if not skipped(n)]


def local_tabs(pages: Path, code: str) -> list:
    """The tabs of a pub whose pages are already saved (no download)."""
    saved = sorted(p for p in pages.glob(f"{code}_*.html") if not p.name.endswith("_first.html"))
    first = pages / f"{code}_first.html"
    source = first if first.exists() else (saved[0] if saved else None)
    if source is None:
        raise SystemExit(f"{code}: no pages in {pages}: run with --fetch")
    if unusable(source.read_text(encoding="utf-8")):
        return []
    return [(n, g) for n, g in bp.menu_tabs(tk.parse_html(source.read_text(encoding="utf-8"))) if not skipped(n)]


def load(pages: Path, fetch: bool):
    """Every dish of every menu of every pub: (instances, pubs, page hash lines). With fetch, the hub page and every page are downloaded
    first (one request per page)."""
    vrules = bp.robots(pages / "robots_viewthemenu.txt", bp.SITE, fetch=fetch)
    brules = bp.robots(pages / "robots_butcombe.txt", "https://butcombe.com", fetch=fetch)
    pubs = fetch_hub(pages, brules) if fetch else bp.hub_pubs((pages / "hub.html").read_text(encoding="utf-8"))
    if len(pubs) < 40 or len({c for c, _ in pubs}) != len(pubs):
        raise SystemExit(f"the hub page lists {len(pubs)} pubs (expected about 55, all different): re-check the page")
    instances, hashes, tabs_read, dead = [], [], 0, []
    for code, pub in pubs:
        tabs = fetch_pub(pages, code, vrules) if fetch else local_tabs(pages, code)
        if not tabs:
            dead.append((code, pub))
            continue
        for tab, guid in tabs:
            path = page_path(pages, code, guid)
            where = f"{pub} / {tab}"
            if not path.exists():
                raise SystemExit(f"{where}: page {path.name} is missing: run with --fetch")
            text = path.read_text(encoding="utf-8")
            title = tk.page_title(text)
            if title != tab:
                raise SystemExit(f"{where}: the page is titled {title!r}")
            if (tab, guid) not in bp.menu_tabs(tk.parse_html(text)):
                raise SystemExit(f"{where}: the page's own tab bar no longer lists this menu")
            tabs_read += 1
            for r in bp.read_page(text, where):
                instances.append({"pub": pub, "code": code, "menu": tab, "printed_section": r["section"], **r})
            hashes.append(f"{bp.sha256(path)}  {path.name}  {pub} / {tab}")
    return instances, [p for p in pubs if p not in dead], dead, hashes


MARK = re.compile(r"\(\s*(v|ve|vo|veo)\s*\)", re.I)
ANIMAL = {"milk", "eggs", "fish", "crustaceans", "molluscs"}     # a "(ve)" dish cannot contain these
NOT_PORK = re.compile(r"\b(pheasant|turkey|duck|venison|chicken) (bacon|ham|sausages?|salami)\b|\b(vegan|plant|plant-based|veggie|veg) (bacon|ham|sausages?|bangers?|chorizo)\b", re.I)
NOT_BEEF = re.compile(r"\bpork (rib-?eye|rump)\b|\bvegan (steak|beef)\b", re.I)


def marks_of(name: str) -> set:
    return {m.lower() for m in MARK.findall(name)}


def signature(r: dict) -> tuple:
    """Everything printed about a dish's allergens, so two prints of one dish can be compared."""
    def parts(ps):
        return frozenset((h.lower(), tuple(sorted(x.lower() for x in inner))) for h, inner in ps)
    return (parts(r["lines"]["contains"]), parts(r["lines"]["may"]), tuple(sorted(s.lower() for s in r["suitable"])))


def is_kids(r: dict) -> bool:
    return bool(re.search(r"\bkids?\b|child", r["menu"] + " " + r["printed_section"], re.I))


# Sections (and, where a section is only a tab name, the tab) left out on purpose, counted in the run's report:
#   alcohol: the pages print no serving or volume, and the one figure the pages print for a Negroni (13 kcal) cannot be right for a drink
#   containing spirit; "Bensons" is the dogs' menu ("Bensons Fruity Water").
LEFT_OUT_SECTION = re.compile(r"^(aperitifs?|bensons?)$", re.I)
CATEGORY_ORDER = ["Starters and sharing", "Light bites and sandwiches", "Mains", "Sunday roasts", "Sides", "Breakfast and brunch",
                  "Puddings and cheese", "Add-ons and extras",
                  "Children's: Mains", "Children's: Puddings", "Children's: Sunday roasts", "Children's: Breakfast", "Children's: Other"]


def section_category(menu: str, sec: str, kids: bool):
    """-> category, or None for a section left out on purpose. Raises on a section it has not seen, so a new one can't slip in."""
    s, m = sec.lower().replace("&", "and"), menu.lower()
    if LEFT_OUT_SECTION.match(s):
        return None
    if kids:
        if re.search(r"sunday|roast", s):
            return "Children's: Sunday roasts"
        if re.search(r"pudding|dessert|ice cream", s):
            return "Children's: Puddings"
        if s in ("mains", "main", "children", "kids", "kids mains") and "breakfast" not in m:
            return "Children's: Mains"
        if "breakfast" in m or re.fullmatch(r"(breakfast|brunch)", s):
            return "Children's: Breakfast"
        if s in ("pip organic",):
            return "Children's: Other"
        raise SystemExit(f"unmapped children's section {sec!r} on menu {menu!r}: add a rule to section_category")
    if m == "hot drinks":
        if s in ("coffee", "tea", "speciality drinks", "hot chocolate", "hot drinks", "milk", "specialty drinks"):
            return None
        raise SystemExit(f"unmapped hot-drinks section {sec!r}: add a rule to section_category")
    if re.search(r"extras|add on|^dips?$|sauces?$", s):
        return "Add-ons and extras"
    if re.search(r"great british roast|sunday|roast", s):
        return "Sunday roasts"
    if re.search(r"^sides?$|side", s):
        return "Sides"
    if re.search(r"pudding|nearly full|dessert|cheese", s):
        return "Puddings and cheese"
    if "breakfast" in m or re.fullmatch(r"(eggs|pancakes|staples|brunch|breakfast)", s):
        return "Breakfast and brunch"
    if re.search(r"sandwich|salad|flatbread|flat bread|bar menu|burgers?|ploughman|light lunch", s):
        return "Light bites and sandwiches"
    if re.search(r"for the table|starter|oyster|small plate|sharing|to share|nibble|bar snack|^snacks$|wings|loaded fries", s):
        return "Starters and sharing"
    if re.search(r"^mains?$|grill|pies|pasta|favourites|^main|classics|seafood|steaks?|^pizza$", s):
        return "Mains"
    raise SystemExit(f"unmapped section {sec!r} on menu {menu!r}: add a rule to section_category (or to LEFT_OUT_SECTION if it is a drinks list)")


EXTRA_MEATY = re.compile(r"\b(saucisson|black pudding|faggots?|charcuterie|ox cheek|scotch egg)\b", re.I)


def tags_for(name: str, veg: bool):
    """(tags list, meat type not stated). vegetarian only from the chain's own (v)/(ve) mark; pork/beef only from the printed name."""
    if veg:
        return ["vegetarian"], False
    base = MARK.sub(" ", name)
    tags = []
    if ta._PORK.search(NOT_PORK.sub(" ", base)):
        tags.append("contains_pork")
    if ta._BEEF.search(NOT_BEEF.sub(" ", base)):
        tags.append("contains_beef")
    unstated = bool(ta._MEATY.search(base) or EXTRA_MEATY.search(base)) and not ta._ANIMAL.search(base) and not tags
    return tags, unstated


def build(instances: list, n_pubs: int):
    """Group by (children's menu?, dish name), apply the 'identical wherever printed' rule.
    -> (items, report lines, left-out lines, dishes that print no calories anywhere, stats)."""
    groups: dict = {}
    stats: Counter = Counter()
    for inst in instances:
        kids = is_kids(inst)
        cat = section_category(inst["menu"], inst["printed_section"], kids)
        if cat is None:
            stats["dish lines in left-out sections (alcohol aperitifs, the dogs' menu, the hot-drinks tables)"] += 1
            continue
        inst["category"], inst["kids"] = cat, kids
        groups.setdefault((kids, key_of(inst["name"])), []).append(inst)
    items, report, left_out, no_calories = [], [], [], []
    for (kids, _k), group in groups.items():
        first = group[0]
        where = lambda i: f"{i['code']}/{i['menu']}/{i['printed_section']}"  # noqa: E731
        shown = [g for g in group if g["kcal"] is not None]
        kcals = sorted({g["kcal"] for g in shown}, key=int)
        sigs = {signature(g) for g in group}
        names = {g["name"] for g in group}
        pubs = sorted({g["pub"] for g in shown})
        label = first["name"] + (" (children's menu)" if kids else "")
        if len(names) > 1:
            report.append(f"same dish, spelled differently: {sorted(names)}")
        bad = [g for g in group if g["problem"]]
        if bad:
            left_out.append(f"the page's own allergen marks contradict each other: {label!r} at " + ", ".join(sorted({where(g) for g in bad})[:3]))
            continue
        if any(g["options"] for g in group):
            left_out.append(f"has choose-your-option sub-items whose figures are not read: {label!r}")
            continue
        hidden = sorted({g["hidden_kcal"] for g in group if g["hidden_kcal"]}, key=int)
        if not kcals:
            if hidden:
                left_out.append(f"calories only in the page's data attribute, not shown: {label!r} ({', '.join(hidden)})")
            else:
                no_calories.append(first["name"])
            continue
        if len(kcals) > 1:
            by: dict = {}
            for g in shown:
                by.setdefault(g["kcal"], []).append(where(g))
            left_out.append(f"calories differ: {label!r}: " + "; ".join(f"{v} kcal ({len(w)} prints, e.g. {w[0]})" for v, w in sorted(by.items(), key=lambda kv: int(kv[0]))))
            continue
        if set(hidden) - set(kcals):
            left_out.append(f"a print's hidden data attribute differs from the printed calories: {label!r} (printed {kcals[0]}, hidden {hidden})")
            continue
        if len(sigs) > 1:
            left_out.append(f"allergen marks differ: {label!r} in " + ", ".join(sorted({where(g) for g in group})[:4]))
            continue
        if len(pubs) < MIN_PUBS:
            left_out.append(f"printed with calories at {len(pubs)} pub only: {label!r} ({kcals[0]} kcal)")
            continue
        plain = re.sub(r"\s+", " ", first["name"]).strip()
        plain = plain[:1].upper() + plain[1:]
        name = plain + (" (children's)" if kids else "")
        marks = marks_of(first["name"])
        allergens = {**first["allergens"], "may_contain": set(first["allergens"]["may_contain"])}
        veg = bool({"v", "ve"} & marks)
        contained = set(first["allergens"]["contains"])
        if veg and {"fish", "crustaceans", "molluscs"} & contained:
            left_out.append(f"the chain's own (v)/(ve) mark contradicts its allergen row (contains {sorted({'fish', 'crustaceans', 'molluscs'} & contained)}): {name!r}")
            continue
        if "ve" in marks and ANIMAL & contained:
            left_out.append(f"the chain's own (ve) mark contradicts its allergen row (contains {sorted(ANIMAL & contained)}): {name!r}")
            continue
        tags, unstated = tags_for(first["name"], veg)
        if unstated:
            report.append(f"meat type not stated: {name}")
        cat_votes = Counter(g["category"] for g in group)
        top = max(cat_votes.values())
        cat = sorted((c for c, n in cat_votes.items() if n == top), key=CATEGORY_ORDER.index)[0]
        menus = sorted({g["menu"] for g in group})
        limited = all(CHRISTMAS.search(g["menu"] + " " + g["printed_section"]) for g in group)
        notes = f"Printed at {len(pubs)} of {n_pubs} pubs read; menus: {'; '.join(menus)}; marks in the name: {', '.join(sorted(marks)) or 'none'}"
        items.append({"name": name, "id": ascii_slug(name), "category": cat, "serving": "for two" if re.search(r"\bfor two\b", name, re.I) else "",
                      "calories": kcals[0], "tags": "|".join(tags), "rankable": False, "limited_time": limited, "notes": notes, "allergens": allergens,
                      "_pubs": len(pubs), "_unstated": unstated, "_hold": HOLD_TEXT.get((kids, plain), ""), "_hold_key": (kids, plain)})
    ids = Counter(i["id"] for i in items)
    clash = [i for i, c in ids.items() if c > 1]
    if clash:
        raise SystemExit(f"two different dishes make the same id {clash[:5]}: add a naming rule")
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    items.sort(key=lambda it: (order[it["category"]], it["name"].lower()))
    return items, report, left_out, no_calories, stats


def ascii_slug(name: str) -> str:
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or receiving, with --fetch) the pub pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the hub page and every menu page into --pages first (1.2 s apart)")
    ap.add_argument("--fetch-only", action="store_true", help="download and stop")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--report", action="store_true", help="also print every dish left out")
    args = ap.parse_args()
    instances, pubs, dead, hashes = load(args.pages, args.fetch)
    if args.fetch_only:
        print(f"{len(pubs)} pubs, {len(hashes)} pages, {len(instances)} printed dishes; dead links: {dead}")
        return 0
    items, report, left_out, no_calories, stats = build(instances, len(pubs))
    if not items:
        raise SystemExit("no items built")
    holds = [(it["id"], it["_hold"]) for it in items if it["_hold"]]
    stale = [k for k in HOLD_TEXT if k not in {it["_hold_key"] for it in items}]
    if stale:
        raise SystemExit(f"HOLD_TEXT names dishes that are no longer published: {stale}: re-check the table")
    n_pubs = len(pubs)
    note = (f"Calories only, as printed beside each dish; the pages state no portion size. The pubs have no shared menu, so a dish is listed only "
            f"if its name, calories and allergens are identical at every pub that prints it, and at {MIN_PUBS} or more of the {n_pubs} pubs read. "
            "Not every pub serves every dish. Buffet tables, alcohol and hot drinks are not listed.")
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters, over the 400 limit")
    title = (f"Butcombe Inns 'Allergy Aware' menus: each pub's Ten Kites page with calories and allergens per dish ({n_pubs} pubs read; "
             f"viewthe.menu pages linked from butcombe.com/allergyaware; accessed {args.checked_on}, no date shown)")
    guide = {"title": f"Butcombe Inns Allergy Aware: 'Contains' and 'May contain' per dish on each pub's Ten Kites page ({n_pubs} pubs read; "
                      f"accessed {args.checked_on}, no date shown)",
             "url": HUB_URL, "checked_on": args.checked_on, "may_contain_published": True}
    public = [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]
    out = write_chain_folder(chain_id=CHAIN_ID, name="Butcombe Inns", cuisine="Pub", source_title=title, source_url=HUB_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=public, out=args.out, note=note, holdback=holds,
                             allergen_guide=guide, nutrition_level="calories")
    if not holds:
        (out / "holdback.csv").unlink(missing_ok=True)
    combined = hashlib.sha256("\n".join(sorted(h.split()[0] for h in hashes)).encode()).hexdigest()
    if args.report:
        print("\n".join(hashes))
    print(f"combined sha256 of the {len(hashes)} page hashes (sorted): {combined}")
    distinct = len({(is_kids(i), key_of(i["name"])) for i in instances})
    print(f"{n_pubs} pubs, {len(hashes)} pages, {len(instances)} printed dishes -> {distinct} distinct (children's flag + name) -> "
          f"{len(items)} built, {len(holds)} held back, {len(left_out)} left out, {len(no_calories)} print no calories anywhere (not listed)")
    print("stats:", dict(stats))
    kinds = Counter(x.split(":")[0].split(" (")[0][:60] for x in left_out)
    print("left out by reason:", dict(kinds))
    spread = Counter("2-4" if i["_pubs"] < 5 else "5-9" if i["_pubs"] < 10 else "10-29" if i["_pubs"] < 30 else "30+" for i in items)
    print("pubs per published dish:", dict(spread))
    print("meat type not stated:", sum(1 for i in items if i["_unstated"]))
    if args.report:
        print("\n".join(f"report: {r}" for r in report))
        print("\n".join(f"left out: {x}" for x in left_out))
        print(f"no calories printed anywhere ({len(no_calories)} dishes): " + "; ".join(no_calories[:60]) + (" ..." if len(no_calories) > 60 else ""))
    counts = Counter(i["category"] for i in items)
    print("wrote", len(items), "items to", out, ":", ", ".join(f"{c} {n}" for c, n in sorted(counts.items(), key=lambda kv: CATEGORY_ORDER.index(kv[0]))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
