#!/usr/bin/env python3
"""Build data/source/fullers/ from Fuller's own pub menus on Ten Kites (nutrition per portion and allergens for every dish).

    python3 -I tools/uk_extract/fullers.py --pages DIR --checked-on 2026-10-10 [--fetch] [--fetch-only] [--out DIR] [--report]

Source: every Fuller's pub website (www.turksheadtwickenham.co.uk, www.londonspride.com, ...) has a "Menus" page (<pub site>/food/menus) that
embeds the pub's Ten Kites menu by its menu code (`/api/tenkites?menuId=turkshead12`); the same menu is public at
https://tkmenus.com/fullers/<menu code>. The codes below were read from the pub websites' own /food/menus pages on 2026-10-10 (robots.txt of
each pub site disallows only /sitecore/, /ManagerTraining, /pseqblu1, /bs100 and /homepage/; fullers.co.uk answers 403 to this
environment and was not used or worked round). robots.txt of tkmenus.com disallows only /fonts/, /views/ and /*.less$, and images.tenkites.com
(disallowed in full) is never fetched. --fetch downloads each pub's first menu page and every other tab it lists (?mguid=<menu id>), one
request per page, 1.2 s apart.

What each dish prints: an info pop-up headed "Nutrition (per portion)" with Energy (kCal), Protein, Carb, of which Sugars, Fat, Sat Fat and
Salt (grams), plus "Suitable for:", "Contains:" and "May contain:" (cereals and tree nuts named in brackets). heartwood_inns_pages.py reads
those pop-ups (same Ten Kites template); here its rows are cross-checked against the kcal shown on the dish line and the schema.org menu the page
embeds. Numbers are copied exactly as printed (a thousands comma is dropped); nothing is converted, rounded or estimated.

MENUS DIFFER BY PUB. The pubs share a core menu but each has its own dishes and sometimes its own figures for a dish with the same name.
Founder's rule (9-10 Oct 2026): a dish is published ONLY when its printed name and ALL its printed figures and allergens are identical on
every menu, at every pub, that prints it with nutrition, and it is printed at 2 or more pubs. When pubs print different figures (or allergens)
for one name, or one pub prints one name twice with different figures, nothing is chosen, averaged or corrected: the dish is left out and
counted in the run's report. Children's-menu dishes are judged apart from adult ones. A choice offered with a dish (a side, a sauce, an ice-cream
flavour, a bun, bacon on a burger) is its own row on the page, but what it describes depends on the dish it is offered with ("Vanilla",
"Coconut", "Mashed potato"), so those rows are not published.

Left out on purpose (counted in the run's report):
- every "Tea & Coffee" / "Hot Drinks" row: the page prints the espresso or tea alone (a latte is 44 kcal) and the milk as a separate choice, so a
  row cannot describe the drink as served;
- choices and extras that the page lists under another dish (a bun, a sauce, a side, an ice-cream flavour such as "Vanilla" or "Coconut", bacon
  on a burger, mash or chips with a pie): what they describe depends on the dish, and the same words appear under several headings;
- rows that print no nutrition ("-": soups and pies "of the day", "Selection of ice-creams by the scoop", a few desserts);
- dishes printed at one pub only, and dishes whose figures or allergens differ between pubs.
HOLD_TEXT and own_problems(): dishes that stay in items.csv but are held back (holdback.csv): figures the chain's own page makes impossible (a
portion of 572,356 kcal, saturates above total fat, calories far from the dish's own protein, carbs and fat) and allergen rows that contradict the
dish's name (a club sandwich, brownies and fusilli with no gluten). Never corrected.

Allergens (docs/DATA.md "Allergens") are complete for every published dish: the printed Contains / May contain lines and the label ids the page's own
allergen filter reads must agree (tenkites_c.allergens_checked). "Garlic / Onion Products" is printed beside the allergens but is not one of the 14
allergens: it is left out of the allergen lists (the chain's own page still shows it). Tags: vegetarian only from the pop-up's own "Suitable for"
(Vegetarian / Vegan / Plant Based; a mark that contradicts the dish's allergens leaves the dish out); contains_pork / contains_beef only when the dish
name or its printed description says so.

Independent checks 2026-10-10: see data/audit/verified/fullers.json.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import butcombe_inns_pages as bp  # noqa: E402  (robots-checked downloads)
import heartwood_inns_pages as hp  # noqa: E402  (the Ten Kites pop-up reader)
import tenkites_a as ta  # noqa: E402  (_PORK, _BEEF, _MEATY, _ANIMAL)
import tenkites_c as tk  # noqa: E402
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "fullers"
CLIENT = "fullers"
HOST = "https://tkmenus.com"
BASE = f"{HOST}/{CLIENT}/"
MIN_PUBS = 2
# (menu code, pub, pub website whose /food/menus embeds the code)
PUBS = [
    ("turkshead12", "The Turk's Head, Twickenham", "www.turksheadtwickenham.co.uk"),
    ("londonspride12", "The London's Pride, Heathrow Terminal 2", "www.londonspride.com"),
    ("barrowboyandbanker11", "The Barrowboy & Banker, London Bridge", "www.barrowboy-and-banker.co.uk"),
    ("admiralty12", "The Admiralty, Trafalgar Square", "www.admiraltytrafalgar.co.uk"),
    ("sanctuaryhouse13", "Sanctuary House Hotel, Westminster", "www.sanctuaryhousehotel.co.uk"),
    ("parcelyard14", "The Parcel Yard, King's Cross", "www.parcelyard.co.uk"),
    ("georgeiv13", "The George IV, Chiswick", "www.georgeiv.co.uk"),
    ("frogandwicket12", "The Frog & Wicket, Eversley Cross", "www.thefrogandwicket.co.uk"),
    ("headoftheriver14", "The Head of the River, Oxford", "www.headoftheriveroxford.co.uk"),
    ("herefordarms14", "The Hereford Arms, South Kensington", "www.herefordarms.co.uk"),
]
SOURCE_URL = BASE + PUBS[0][0]
ALIASES = ["fullers", "fuller's", "fullers pubs", "fuller's pubs", "fullers ale and pie", "fuller's ale and pie house", "fullers pub"]
NUTRIENTS = [("Energy (kCal)", "calories"), ("Protein (g)", "protein_g"), ("Carb (g)", "carbs_g"), ("of which Sugars (g)", "sugar_g"),
             ("Fat (g)", "fat_g"), ("Sat Fat (g)", "sat_fat_g"), ("Salt (g)", "salt_g")]
CAPTION = "Nutrition (per portion)"
NUTRIENT_LABELS = [lab for lab, _ in NUTRIENTS]
REQUIRED = ("calories", "protein_g", "carbs_g", "fat_g")
NOT_ONE_OF_14 = "Garlic / Onion Products"
GARLIC_ID = "14"
EXTRA_WORDS = {"sulphur dioxide / sulphites": ("sulphites", None)}   # as the page prints the label


# ---------------------------------------------------------------------------------------------------------------- fetching
def page_path(pages: Path, code: str, guid: str) -> Path:
    return pages / f"{code}_{guid}.html"


def fetch_pub(pages: Path, code: str, rules: list, client: str = CLIENT, host: str = HOST) -> list:
    """Download a pub's first page and every other menu tab it lists. Returns [(tab name, menu id)] in tab order. Pages already saved are not
    downloaded again."""
    tmp = pages / f"{code}_first.html"
    if not tmp.exists():
        bp.get(f"{host}/{client}/{code}", tmp, rules, host)
    tabs = hp.menu_tabs(tmp.read_text(encoding="utf-8"))
    if not tabs:
        raise SystemExit(f"{code}: no tab bar on the page")
    first = page_path(pages, code, tabs[0][1])
    if not first.exists():
        first.write_bytes(tmp.read_bytes())
    for name, guid in tabs[1:]:
        dest = page_path(pages, code, guid)
        if not dest.exists():
            bp.get(f"{host}/{client}/{code}?mguid={guid}", dest, rules, host)
    return tabs


def local_tabs(pages: Path, code: str) -> list:
    first = pages / f"{code}_first.html"
    if not first.exists():
        raise SystemExit(f"{code}: no saved first page in {pages}: run with --fetch")
    return hp.menu_tabs(first.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------------------------------------------- reading
def norm(text: str) -> str:
    """Names compared as printed except capitalisation, accents, spaces, '&' / 'and', apostrophes (straight or curly) and punctuation."""
    s = text.replace("\u2019", "'").replace("\u2018", "'")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower().replace("&", " and ").replace("'", "")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s)).strip()


def tidy(text: str) -> str:
    t = re.sub(r"\s+", " ", text).strip().rstrip(",;:").strip()
    return t[:1].upper() + t[1:]


def ascii_slug(name: str) -> str:
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii"))


def is_num(v: str) -> bool:
    return bool(re.fullmatch(r"\d+(?:\.\d+)?", v))


def allergens_of(row: dict, where: str) -> dict | None:
    """The dish's allergens from its printed lines, checked against the page's filter ids. 'Garlic / Onion Products' (printed beside the
    allergens, not one of the 14) is dropped from the lines, the filter and the ids before the check."""
    r = dict(row)
    drop = lambda parts: None if parts is None else [(h, i) for h, i in parts if h != NOT_ONE_OF_14]  # noqa: E731
    r["contains"], r["may"] = drop(row["contains"]), drop(row["may"])
    r["filter"] = {i: n for i, n in row["filter"].items() if n != NOT_ONE_OF_14}
    if row["label_ids"] is not None:
        r["label_ids"] = tuple([x for x in ids if x != GARLIC_ID] for ids in row["label_ids"])
    return tk.allergens_checked(r, where, EXTRA_WORDS)


def sig_alg(a: dict) -> tuple:
    return (tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"] - a["contains"])), tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])))


def block_positions(text: str) -> list:
    """For every 'choice' row hp.read_menu returns (same traversal, same order): (is in the block's root list, position in it, items in it).
    A 'build your own' block on these pages is a dish followed by the extras the page lists under it (bacon on a burger, a curry sauce)
    or a list of independent dishes (four sandwiches, the children's mains); the page marks neither, so the price tells them apart
    (see is_extra)."""
    root = tk.parse_html(text)
    body = root.find("k10-all-courses")
    out = []
    for rec in body.iter():
        if not rec.has("k10-recipe") or rec.has("k10-recipe_menu-item") or not rec.has("k10-recipe_byo"):
            continue
        for sec in rec.find_all("k10-byo__section"):
            items = [it for it in sec.children if isinstance(it, tk.Node) and it.has("k10-byo-item")]
            for i, it in enumerate(items):
                price = it.find("k10-byo-item__price")
                out.append({"name": it.find("k10-byo-item__name").text(), "root": sec.has("k10-byo__section_root"), "pos": i, "n": len(items),
                            "price": price.text() if price is not None else ""})
    return out


def read_page(text: str, where: str, pub_tab_expected: int | None = None) -> list:
    """Every dish of one saved page as a plain record; stops if the page is not the layout this script was checked against."""
    rows = hp.read_menu(text)
    ld = Counter((re.sub(r"\s+", " ", n).strip(), c.replace(",", "") or "0") for _, n, c in hp.json_ld_items(text))
    out = []
    seen_ld = Counter()
    pos = block_positions(text)
    choices = [r for r in rows if r["kind"] == "choice"]
    if len(pos) != len(choices) or any(p["name"] != r["name"] for p, r in zip(pos, choices)):
        raise SystemExit(f"{where}: the choice rows no longer line up with the page's blocks: the layout changed")
    for p, r in zip(pos, choices):
        r["blk"] = p
    for r in rows:
        here = f"{where} > {r['name']}"
        if r["caption"] != CAPTION:
            raise SystemExit(f"{here}: table is headed {r['caption']!r}, not {CAPTION!r}")
        if list(r["nutrients"]) != [lab for lab, _ in NUTRIENTS]:
            raise SystemExit(f"{here}: nutrient rows are {list(r['nutrients'])}, expected {[lab for lab, _ in NUTRIENTS]}")
        kcal = r["nutrients"]["Energy (kCal)"]
        shown = r["shown_kcal"].replace(",", "")
        if is_num(kcal):
            if shown != f"{kcal} kcal":
                raise SystemExit(f"{here}: the dish line shows {r['shown_kcal']!r} but the pop-up says {kcal}")
        elif shown:
            raise SystemExit(f"{here}: the pop-up prints {kcal!r} but the dish line shows {r['shown_kcal']!r}")
        seen_ld[(re.sub(r"\s+", " ", r["name"]).strip(), kcal if is_num(kcal) else "0")] += 1
        allergens = allergens_of(r, here)
        if allergens is None:
            raise SystemExit(f"{here}: no allergen information to read")
        out.append({"row": r, "allergens": allergens})
    # the page's embedded schema.org menu must hold every dish the pop-ups do, with the same calories ('-' is "0" there)
    if seen_ld - ld:
        raise SystemExit(f"{where}: pop-ups and the embedded menu disagree: {dict(seen_ld - ld)}")
    return out


def load(pages: Path, fetch: bool, pubs=PUBS, client: str = CLIENT, host: str = HOST):
    rules = bp.robots(pages / f"robots_{host.split('//')[1]}.txt", host, fetch=fetch)
    instances, hashes, tabs_read, empty = [], [], 0, []
    for code, pub, _site in pubs:
        tabs = fetch_pub(pages, code, rules, client, host) if fetch else local_tabs(pages, code)
        for tab, guid in tabs:
            path = page_path(pages, code, guid)
            if not path.exists():
                raise SystemExit(f"{pub} / {tab}: page {path.name} is missing: run with --fetch")
            text = path.read_text(encoding="utf-8")
            where = f"{pub} / {tab}"
            if tk.page_title(text) != tab:
                raise SystemExit(f"{where}: the page is titled {tk.page_title(text)!r}")
            if hp.active_tab(text) != tab or (tab, guid) not in hp.menu_tabs(text):
                raise SystemExit(f"{where}: the page's own tab bar no longer lists this menu")
            tabs_read += 1
            recs = read_page(text, where)
            if not recs:
                empty.append(where)
            for rec in recs:
                instances.append({"pub": pub, "code": code, "tab": tab, **rec})
            hashes.append(f"{bp.sha256(path)}  {path.name}  {where}")
    return instances, hashes, empty


# ---------------------------------------------------------------------------------------------------------------- rules
KIDS = re.compile(r"\bkid'?s?'?\b|children", re.I)
LEFT_OUT_COURSE = re.compile(r"\b(tea\s*&\s*coffee|hot drinks)\b", re.I)
DAYS = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
CATEGORY_ORDER = ["Starters and small plates", "Bar snacks and sharing", "Sandwiches", "Mains", "Pies", "Pizzas", "Sunday roasts", "Dish of the day",
                  "Breakfast and brunch", "Sides", "Puddings", "Drinks", "Add-ons and extras",
                  "Children's: Starters", "Children's: Mains", "Children's: Sides", "Children's: Puddings", "Children's: Breakfast"]
RANKABLE = {"Starters and small plates", "Sandwiches", "Mains", "Pies", "Pizzas", "Sunday roasts", "Dish of the day", "Breakfast and brunch"}


def course_category(top: str, kids: bool, where: str):
    """-> category or None (left out). Raises on a course it has not seen, so a new one can't slip in."""
    t = norm(top)
    if LEFT_OUT_COURSE.search(top):
        return None
    if kids:
        if re.fullmatch(r"starters|soup", t):
            return "Children's: Starters"
        if re.fullmatch(r"mains|pies|sunday roasts?|roasts|sunday roast|roasts served on sundays only", t):
            return "Children's: Mains"
        if t == "sides":
            return "Children's: Sides"
        if t == "puddings":
            return "Children's: Puddings"
        if t in ("breakfast", "kids breakfast"):
            return "Children's: Breakfast"
        raise SystemExit(f"{where}: unmapped children's course {top!r}: add a rule to course_category")
    if t in DAYS:
        return "Dish of the day"
    if re.fullmatch(r"add ons?|add ons and extras|extra add ons|add on s", t):
        return "Add-ons and extras"
    if re.fullmatch(r"starters|starters and small plates|small plates and starters|bar snacks and small plates|while you wait|nibbles|bar snacks", t):
        return "Starters and small plates" if "starters" in t else "Bar snacks and sharing"
    if re.fullmatch(r"sharers|sharing boards|wings|chicken wings|nachos", t):
        return "Bar snacks and sharing"
    if t == "sandwiches":
        return "Sandwiches"
    if re.fullmatch(r"mains|brunch", t):
        return "Breakfast and brunch" if t == "brunch" else "Mains"
    if re.fullmatch(r"handcrafted pies|pies", t):
        return "Pies"
    if t == "pizzas":
        return "Pizzas"
    if re.fullmatch(r"sunday roasts?", t):
        return "Sunday roasts"
    if t == "sides":
        return "Sides"
    if re.fullmatch(r"puddings|after dinner|cake of the day|miniature puddings|sweet", t):
        return "Puddings"
    if re.fullmatch(r"breakfast|breakfast brunch|brunch and breakfast|breakfast baps and pastries|breakfast baps|st ewe eggs|bagels|takeaway bagels|breakfast buffet", t):
        return "Breakfast and brunch"
    if t == "juices":
        return "Drinks"
    raise SystemExit(f"{where}: unmapped course {top!r}: add a rule to course_category (or to LEFT_OUT_COURSE)")


def is_kids(tab: str, path: list) -> bool:
    return bool(KIDS.search(tab) or (path and KIDS.search(path[0])))


def context_of(r: dict) -> str:
    """The heading a choice sits under ('' for a dish): its sub-section, else the nested course it is listed in."""
    if r["kind"] == "choice" and r["section"]:
        c = r["section"]
    elif len(r["path"]) > 1:
        c = r["path"][-1]
    else:
        return ""
    c = re.sub(r"\s+", " ", c).strip().rstrip(":")
    return c.capitalize() if c.isupper() else c


def is_extra(r: dict) -> bool:
    """A choice that is not the first of its block's own list and is cheap or free is an extra offered with the dish above it (bacon on a
    burger, a curry sauce, mash or chips with a pie). Items priced 5.00 or more are independent dishes (the sandwiches, the children's mains)."""
    b = r.get("blk")
    if r["kind"] != "choice" or not b or not b["root"] or b["n"] < 2:
        return False
    priced = re.fullmatch(r"\d+(?:\.\d+)?", b["price"].strip())
    if b["pos"] == 0:       # a list that opens with an unpriced item is a list of choices (mash or chips with a pie), not a dish
        return not priced
    return (not priced) or float(b["price"]) < 5.0


def display_name(r: dict) -> str:
    base = tidy(r["name"])
    ctx = context_of(r)
    return f"{base} ({ctx})" if ctx else base


def own_problems(vals: dict) -> list:
    """Reasons a dish's own printed numbers cannot all be right (the row is held back, never corrected)."""
    num = lambda c: float(vals[c]) if is_num(vals[c]) else None  # noqa: E731
    out = []
    if num("calories") > 6000:
        out.append(f"{vals['calories']} kcal in one portion is not credible")
    for c, lab in (("protein_g", "protein"), ("carbs_g", "carbohydrate"), ("fat_g", "fat")):
        if num(c) > 600:
            out.append(f"{vals[c]} g of {lab} in one portion is not credible")
    fat, sat, carbs, sugar = num("fat_g"), num("sat_fat_g"), num("carbs_g"), num("sugar_g")
    if None not in (sat, fat) and sat > fat + 0.05:
        out.append(f"saturates ({sat:g} g) are printed higher than total fat ({fat:g} g)")
    if None not in (sugar, carbs) and sugar > carbs + 0.05:
        out.append(f"sugars ({sugar:g} g) are printed higher than carbohydrate ({carbs:g} g)")
    if num("salt_g") is not None and num("salt_g") > 15:
        out.append(f"salt {vals['salt_g']} g in one portion is not credible")
    kcal, protein = num("calories"), num("protein_g")
    est = 4 * protein + 4 * carbs + 9 * fat
    if kcal >= 50 and abs(kcal - est) / kcal > 0.30:
        out.append(f"printed calories ({kcal:g}) differ by more than 30% from the energy of its own protein, carbs and fat (about {est:.0f} kcal)")
    elif kcal < 50 and est > kcal + 50:
        out.append(f"printed calories ({kcal:g}) are far below the energy of its own protein, carbs and fat (about {est:.0f} kcal)")
    return out


# Dishes that stay in items.csv but are held back (holdback.csv; restore by deleting the entry). Key = (children's menu?, published name); nothing is
# corrected: the chain's own allergen row contradicts the dish's own name.
_NO_G = "allergen row contradicts the dish name: %s but no gluten is marked (neither 'Contains' nor 'May contain'). Restore by deleting this entry once the chain confirms the allergens."
HOLD_TEXT = {
    (False, "Club sandwich"): _NO_G % "a sandwich (bread)",
    (False, "Miniature chocolate brownie"): _NO_G % "a brownie",
    (True, "Fusilli pesto pasta"): _NO_G % "fusilli pasta",
}


def tags_for(r: dict) -> tuple:
    suitable = {s.lower() for s in r["suitable"]}
    if suitable & {"vegetarian", "vegan", "plant based"}:
        return ["vegetarian"], False
    text = " ".join([r["name"], r["desc"]]) if r["kind"] == "dish" or not context_of(r) else r["name"]
    tags = []
    if ta._PORK.search(text):
        tags.append("contains_pork")
    if ta._BEEF.search(text):
        tags.append("contains_beef")
    unstated = bool(ta._MEATY.search(text)) and not ta._ANIMAL.search(text) and not tags
    return tags, unstated


# not an order for one person: sharing dishes, boards, platters, "for two"
NOT_A_MEAL = re.compile(r"\b(to share|sharing|sharer|share it|share or not|for two|for 2|boards?|platters?|bulk recipe|tower|feast|\d+ ?kilos?)\b", re.I)
CFG = {"course_category": course_category, "is_kids": is_kids, "category_order": CATEGORY_ORDER, "rankable": RANKABLE, "hold_text": HOLD_TEXT,
       "not_a_meal": NOT_A_MEAL}


def build(instances: list, n_pubs: int, min_pubs: int = MIN_PUBS, cfg: dict | None = None):
    """Group prints by (children's menu?, printed name + heading), apply the 'identical wherever printed, at 2+ pubs' rule.
    -> (items, report lines, left-out lines, stats)."""
    cfg = cfg or CFG
    groups: dict = {}
    stats: Counter = Counter()
    for inst in instances:
        r = inst["row"]
        kids = cfg["is_kids"](inst["tab"], r["path"])
        where = f"{inst['pub']} / {inst['tab']} / {r['name']}"
        if r.get("skip_reason"):
            stats[r["skip_reason"]] += 1
            continue
        top = r["path"][0] if r["path"] else ""
        cat = cfg["course_category"](top, kids, where)
        if cat is None:
            stats["rows in the Tea & Coffee / Hot Drinks courses (milk is a separate choice)"] += 1
            continue
        choice = bool(context_of(r)) or (is_extra(r) and not kids)
        if choice:
            stats["choices and extras listed under another dish (a bun, a sauce, an ice-cream flavour, bacon on a burger)"] += 1
        vals = {col: tk.printed(r["nutrients"][lab]) for lab, col in NUTRIENTS}
        if not all(is_num(vals[c]) for c in REQUIRED):
            if not choice:
                stats["rows that print no nutrition ('-')"] += 1
            continue
        for c in ("sugar_g", "sat_fat_g", "salt_g"):
            if not is_num(vals[c]):
                vals[c] = ""
        # A choice is never published, but a dish of the same name that has other figures than the choice is: the pub prints one name for two
        # different amounts, so nothing is chosen (the choice joins the dish's group only to show that).
        key = (kids, norm(r["name"]), "")
        groups.setdefault(key, []).append({**inst, "category": cat, "kids": kids, "vals": vals, "choice": choice})
    items, report, left_out = [], [], []
    for key, group in groups.items():
        dishes = [g for g in group if not g["choice"]]
        if not dishes:
            continue
        first = dishes[0]
        label = display_name(first["row"]) + (" (children's)" if first["kids"] else "")
        pubs = sorted({g["code"] for g in dishes})
        # one pub printing the name twice with different figures contradicts itself
        by_pub: dict = defaultdict(set)
        for g in group:
            by_pub[g["code"]].add((tuple(g["vals"].values()), sig_alg(g["allergens"]), tuple(sorted(s.lower() for s in g["row"]["suitable"]))))
        if any(len(s) > 1 for s in by_pub.values()):
            left_out.append(f"one pub prints the name twice with different figures or allergens: {label!r} at " +
                            ", ".join(sorted(c for c, s in by_pub.items() if len(s) > 1)))
            continue
        sigs = {next(iter(s)) for s in by_pub.values()}
        if len(sigs) > 1:
            nums = {s[0] for s in sigs}
            kind = "figures differ" if len(nums) > 1 else "allergens or diet marks differ (same figures)"
            counts = Counter(next(iter(s))[0][0] for s in by_pub.values())
            left_out.append(f"{kind} between pubs: {label!r} kcal printed: {dict(counts)}")
            continue
        if len(pubs) < min_pubs:
            left_out.append(f"printed with nutrition at {len(pubs)} pub only: {label!r}")
            continue
        r = first["row"]
        name = display_name(r) + (" (children's)" if first["kids"] else "")
        contained = set(first["allergens"]["contains"])
        suitable = {s.lower() for s in r["suitable"]}
        if suitable & {"vegan", "plant based"} and {"milk", "eggs", "fish", "crustaceans", "molluscs"} & contained:
            left_out.append(f"the chain's own vegan / plant-based mark contradicts its allergen row (contains {sorted(contained)}): {name!r}")
            continue
        if suitable & {"vegetarian", "vegan", "plant based"} and {"fish", "crustaceans", "molluscs"} & contained:
            left_out.append(f"the chain's own vegetarian mark contradicts its allergen row (contains {sorted(contained)}): {name!r}")
            continue
        tags, unstated = tags_for(r)
        if unstated:
            report.append(f"meat type not stated: {name}")
        votes = Counter(g["category"] for g in dishes)
        top = max(votes.values())
        cat = sorted((c for c, n in votes.items() if n == top), key=cfg["category_order"].index)[0]
        menus = sorted({f"{g['tab']}" for g in dishes})
        notes = f"Same figures and allergens printed at {len(pubs)} of {n_pubs} pubs read; on menus: {'; '.join(menus)}"
        v = first["vals"]
        est = 4 * float(v["protein_g"]) + 4 * float(v["carbs_g"]) + 9 * float(v["fat_g"])
        if float(v["calories"]) >= 50 and abs(float(v["calories"]) - est) / float(v["calories"]) > 0.15:
            notes += (f"; the printed calories ({v['calories']}) differ by {abs(float(v['calories']) - est) / float(v['calories']):.0%} from 4P+4C+9F "
                      f"({est:.0f}): entered as printed, the same at every pub")
        items.append({"name": name, "id": ascii_slug(name), "category": cat, "serving": "", **first["vals"], "tags": "|".join(tags),
                      "rankable": cat in cfg["rankable"] and not cfg["not_a_meal"].search(name), "limited_time": False, "notes": notes, "allergens": first["allergens"],
                      "_pubs": len(pubs), "_unstated": unstated, "_vals": first["vals"], "_row": r,
                      "_hold_key": (first["kids"], display_name(r))})
    ids = Counter(i["id"] for i in items)
    clash = [i for i, c in ids.items() if c > 1]
    if clash:
        raise SystemExit(f"two different dishes make the same id {clash[:5]}: add a naming rule")
    order = {c: i for i, c in enumerate(cfg["category_order"])}
    items.sort(key=lambda it: (order[it["category"]], it["name"].lower()))
    holds = []
    for it in items:
        why = own_problems(it["_vals"])
        if why:
            holds.append((it["id"], "The chain's own page contradicts itself for this dish, so nothing is chosen: " + "; ".join(why) + "."))
        elif it["_hold_key"] in cfg["hold_text"]:
            holds.append((it["id"], cfg["hold_text"][it["_hold_key"]]))
    stale = [k for k in cfg["hold_text"] if k not in {it["_hold_key"] for it in items}]
    if stale:
        raise SystemExit(f"HOLD_TEXT names dishes that are no longer published: {stale}: re-check the table")
    return items, report, left_out, holds, stats


NOTE_TEMPLATE = ("Menus differ by pub, so a dish is listed only if its name, figures and allergens are identical at every pub that prints it, "
                 "and at {min_pubs} or more of the {n} pubs read. Figures are per portion. Tea and coffee, and sauces, sides and flavours "
                 "offered with another dish, are not listed.")


def main(argv=None, *, chain_id=CHAIN_ID, name="Fuller's", aliases=ALIASES, pubs=PUBS, client=CLIENT, host=HOST, source_url=SOURCE_URL,
         title_fn=None, guide_url=None, cfg=None, load_fn=None, note_fn=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or receiving, with --fetch) the pub pages")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download every menu page into --pages first (1.2 s apart)")
    ap.add_argument("--fetch-only", action="store_true")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / chain_id)
    ap.add_argument("--report", action="store_true", help="also print every dish left out")
    args = ap.parse_args(argv)
    cfg = cfg or CFG
    instances, hashes, empty = (load_fn or load)(args.pages, args.fetch, pubs, client, host)
    if args.fetch_only:
        print(f"{len(pubs)} pubs, {len(hashes)} pages, {len(instances)} printed dishes; empty tabs: {empty}")
        return 0
    n_pubs = len(pubs)
    items, report, left_out, holds, stats = build(instances, n_pubs, cfg=cfg)
    if not items:
        raise SystemExit("no items built")
    note = (note_fn or NOTE_TEMPLATE.format)(min_pubs=MIN_PUBS, n=n_pubs)
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters, over the 400 limit")
    title = (title_fn or (lambda n, d: f"{name} pub menus with nutrition and allergens (Ten Kites pages for {n} pubs, each linked from the pub's own "
                                       f"website; accessed {d}, no date shown)"))(n_pubs, args.checked_on)
    may = any(i["allergens"]["may_contain"] for i in items)
    lines = "'Contains' and 'May contain' lines" if may else "'Contains' line"
    guide = {"title": f"{name} pub menus: the {lines} of every dish on each pub's Ten Kites page ({n_pubs} pubs read; accessed {args.checked_on}, no date shown)",
             "url": guide_url or source_url, "checked_on": args.checked_on, "may_contain_published": may}
    public = [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]
    out = write_chain_folder(chain_id=chain_id, name=name, cuisine="Pub", source_title=title, source_url=source_url,
                             checked_on=args.checked_on, aliases=aliases, items=public, out=args.out, note=note, holdback=holds,
                             allergen_guide=guide)
    if not holds:
        (out / "holdback.csv").unlink(missing_ok=True)
    combined = hashlib.sha256("\n".join(sorted(h.split()[0] for h in hashes)).encode()).hexdigest()
    if args.report:
        print("\n".join(hashes))
    print(f"combined sha256 of the {len(hashes)} page hashes (sorted): {combined}")
    distinct = len({(cfg["is_kids"](i["tab"], i["row"]["path"]), norm(i["row"]["name"]), norm(context_of(i["row"]))) for i in instances})
    print(f"{n_pubs} pubs, {len(hashes)} pages, {len(instances)} printed dishes -> {distinct} distinct names -> {len(items)} built, "
          f"{len(holds)} held back, {len(left_out)} left out; empty tabs: {empty}")
    print("stats:", dict(stats))
    kinds = Counter(x.split(":")[0].split(" (")[0][:70] for x in left_out)
    print("left out by reason:", dict(kinds))
    print("pubs per published dish:", dict(Counter("2-3" if i["_pubs"] < 4 else "4-6" if i["_pubs"] < 7 else "7+" for i in items)))
    print("meat type not stated:", sum(1 for i in items if i["_unstated"]))
    if args.report:
        print("\n".join(f"report: {r}" for r in report))
        print("\n".join(f"left out: {x}" for x in left_out))
        for hid, why in holds:
            print("held back:", hid, "::", why)
    counts = Counter(i["category"] for i in items)
    print("wrote", len(items), "items to", out, ":", ", ".join(f"{c} {n}" for c, n in sorted(counts.items(), key=lambda kv: cfg["category_order"].index(kv[0]))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
