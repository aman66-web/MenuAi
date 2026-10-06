"""Reader for the Mitchells & Butlers (M&B) "Allergen Guide" HTML pages on allergens.mbplc.io.

One page per brand (All Bar One, Browns, Ember Inns, Nicholsons, O'Neill's ...), all in the same machine-generated
layout. The page is a list of menus (`div[data-menu-block]`, titled by an <u> heading), each holding sections
(`p.sectionContainerH`) of dishes (`div.recipe-card`). A dish has a bold name, an optional description, allergen
text, and a `div.nutrition` table:

    (blank) | kJ/kcal | Fat | Saturates | Carbohydrate | Sugars | Protein | Salt
    Per Portion: | 1516KJ/361Kcal | 11g | 1.1g | 59g | 0.8g | 6.6g | 0.89g

Drinks and a few dishes have an EMPTY nutrition div: they have no published numbers and are not extracted.

This module only READS the page and returns the cells exactly as printed (units stripped, nothing rounded,
converted or filled). Naming, categories and exclusions are decided by the per-chain scripts. Standard library only.
"""
import argparse
import collections
import hashlib
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import slug, write_chain_folder  # noqa: E402

# Table header text -> our key. Anything else in a header row stops the parse (the layout changed).
HEADERS = {"kj/kcal": "energy", "fat": "fat", "saturates": "sat", "carbohydrate": "carbs", "sugars": "sugars",
           "protein": "protein", "salt": "salt"}
ENERGY_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*kj\s*/\s*(-?\d+(?:\.\d+)?)\s*kcal\s*$", re.I)
GRAMS_RE = re.compile(r"^\s*(<?\s*-?\d+(?:\.\d+)?)\s*g\s*$", re.I)


class GuideLayoutError(Exception):
    """The page no longer looks the way this reader expects: a human must re-check it."""


class _Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stamp = ""
        self.menus: list[dict] = []
        self.cards: list[dict] = []
        self._menu: dict | None = None
        self._section = ""
        self._card: dict | None = None
        self._stack: list[tuple[str, dict]] = []  # (tag, attrs) for open elements we care about
        self._in_u = False
        self._in_section_a = False
        self._in_b = False
        self._in_stamp = False
        self._in_nutrition = False
        self._nut_rows: list[list[str]] = []
        self._cell: list[str] | None = None
        self._row: list[str] | None = None
        self._desc: list[str] = []
        self._desc_state = 0  # 0 before the bold name, 1 after it, 2 inside the description, 3 done
        self._span_depth = 0
        self._b_span_depth = 0
        self._seen_b = False
        self.notes: list[dict] = []  # section footers / claims printed under a section heading
        self._note: dict | None = None
        self._div_depth = 0
        self._card_depth = -1
        self._nut_depth = -1
        self._menu_depth = -1

    # -- helpers
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "") or ""
        if tag == "div":
            self._div_depth += 1
            if "data-menu-block" in a:
                self._menu = {"id": a.get("id", ""), "title": "", "sections": []}
                self.menus.append(self._menu)
                self._menu_depth = self._div_depth
                self._section = ""
            elif cls == "recipe-card":
                self._card = {"menu": self._menu["title"] if self._menu else "", "menu_id": self._menu["id"] if self._menu else "",
                              "section": self._section, "name": "", "desc": "", "nutrition_rows": []}
                self._card_depth = self._div_depth
                self._seen_b = False
                self._desc, self._desc_state = [], 0
            elif cls == "nutrition" and self._card is not None:
                self._in_nutrition = True
                self._nut_depth = self._div_depth
                self._nut_rows = []
        elif tag == "u" and self._menu is not None and self._card is None:
            self._in_u = True
        elif tag == "a" and "id" in a and re.fullmatch(r"menu\d+section\d+", a["id"] or ""):
            self._in_section_a = True
            self._section = ""
        elif tag == "b" and self._card is not None and not self._seen_b and not self._in_nutrition:
            self._in_b = True
        elif tag == "br" and self._card is not None and self._desc_state == 1 and self._span_depth == self._b_span_depth:
            self._desc_state = 2
        elif tag == "p" and cls in ("footer", "claims") and self._card is None:
            self._note = {"menu": self._menu["title"] if self._menu else "", "section": self._section, "kind": cls, "text": ""}
        elif tag == "span":
            self._span_depth += 1
        elif tag == "tr" and self._in_nutrition:
            self._row = []
        elif tag == "td" and self._in_nutrition and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag == "div":
            if self._in_nutrition and self._div_depth == self._nut_depth:
                self._in_nutrition = False
                if self._card is not None:
                    self._card["nutrition_rows"] = self._nut_rows
            if self._card is not None and self._div_depth == self._card_depth:
                self._card["desc"] = " ".join("".join(self._desc).split())
                self.cards.append(self._card)
                self._card = None
            if self._menu is not None and self._div_depth == self._menu_depth:
                self._menu = None
            self._div_depth -= 1
        elif tag == "p" and self._note is not None:
            self._note["text"] = " ".join(self._note["text"].split())
            if self._note["text"]:
                self.notes.append(self._note)
            self._note = None
        elif tag == "u":
            self._in_u = False
        elif tag == "a" and self._in_section_a:
            self._in_section_a = False
            self._section = " ".join(self._section.split())
            if self._menu is not None:
                self._menu["sections"].append(self._section)
        elif tag == "b" and self._in_b:
            self._in_b = False
            self._seen_b = True
            self._desc_state, self._b_span_depth = 1, self._span_depth
            if self._card is not None:
                self._card["name"] = " ".join(self._card["name"].split())
        elif tag == "span":
            if self._card is not None and self._desc_state in (1, 2) and self._span_depth == self._b_span_depth:
                self._desc_state = 3
            self._span_depth -= 1
        elif tag == "td" and self._cell is not None and self._row is not None:
            self._row.append(" ".join("".join(self._cell).replace("\xa0", " ").split()))
            self._cell = None
        elif tag == "tr" and self._row is not None and self._in_nutrition:
            self._nut_rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._in_u and self._menu is not None and not self._menu["title"]:
            self._menu["title"] += data
            self._menu["title"] = " ".join(self._menu["title"].split())
        elif self._in_u and self._menu is not None:
            self._menu["title"] = " ".join((self._menu["title"] + " " + data).split())
        if self._note is not None:
            self._note["text"] += data
        if self._in_section_a:
            self._section += data
        if self._in_b and self._card is not None:
            self._card["name"] += data
        elif self._card is not None and self._desc_state == 2:
            self._desc.append(data)  # text after the bold name's <br> inside the same <span>
        if self._cell is not None:
            self._cell.append(data)
        if not self.stamp and "Mitchells & Butlers" in data:
            self.stamp = " ".join(data.split())


def parse_page(html: str) -> dict:
    """Return {"stamp": str, "menus": [...], "cards": [...]} with raw cells. Raises GuideLayoutError if odd."""
    p = _Parser()
    p.feed(html)
    p.close()
    if not p.cards:
        raise GuideLayoutError("no recipe cards found")
    return {"stamp": p.stamp, "menus": p.menus, "cards": p.cards, "notes": p.notes}


def read_nutrition(card: dict) -> dict | None:
    """Per-portion numbers of one card exactly as printed, or None when the card has no nutrition table.

    Returns {"kcal": "361", "kj": "1516", "fat": "11", "sat": "1.1", "carbs": "59", "sugars": "0.8", "protein": "6.6",
    "salt": "0.89"} as strings: a '<' or '-' prefix is kept ("<0.5", "-28": the guide prints negative swap differences). Anything
    that is not `n kJ/n kcal` or `n g` (or a header/row label this reader doesn't know) stops the run with GuideLayoutError."""
    rows = card["nutrition_rows"]
    if not rows:
        return None
    if len(rows) != 2:
        raise GuideLayoutError(f"{card['name']!r}: nutrition table has {len(rows)} rows, expected a header and one Per Portion row")
    head, data = rows
    if len(head) != len(data):
        raise GuideLayoutError(f"{card['name']!r}: header has {len(head)} cells but the row has {len(data)}")
    if data[0].lower().rstrip(":") != "per portion":
        raise GuideLayoutError(f"{card['name']!r}: row label is {data[0]!r}, expected 'Per Portion:'")
    out: dict = {}
    for h, v in zip(head[1:], data[1:]):
        key = HEADERS.get(h.strip().lower())
        if key is None:
            raise GuideLayoutError(f"{card['name']!r}: unknown column {h!r}")
        if key == "energy":
            m = ENERGY_RE.match(v)
            if not m:
                raise GuideLayoutError(f"{card['name']!r}: energy cell {v!r} is not 'n kJ/n kcal'")
            out["kj"], out["kcal"] = m.group(1), m.group(2)
        else:
            m = GRAMS_RE.match(v)
            if not m:
                raise GuideLayoutError(f"{card['name']!r}: {h} cell {v!r} is not an amount in grams")
            out[key] = m.group(1).replace(" ", "")
    for k in ("kcal", "fat", "sat", "carbs", "sugars", "protein", "salt"):
        if k not in out:
            raise GuideLayoutError(f"{card['name']!r}: column {k} missing")
    return out


# ----------------------------------------------------------------------------------------------------------------------
# From parsed cards to a chain folder. The per-chain scripts only say WHICH menus count, how sections map to categories
# and what the chain is called; everything below is shared so all M&B brands are treated the same way.
# ----------------------------------------------------------------------------------------------------------------------
NOTE_CUT = re.compile(r"\s*(Click through to view.*|(?:Please|Also) (?:refer|see) .*)$", re.I)
FOOTNOTE_CUT = re.compile(r"\s\^\s.*$")
DIET_RE = re.compile(r"\s*\((V|VE|VG)\)", re.I)
MARKS_RE = re.compile(r"[*†‡#^▲​]+")

# Sections -> categories (first match wins). A section no rule matches stops the run so a person picks the category.
CATEGORY_RULES: list[tuple[str, str]] = [
    (r"afternoon tea|warm scones|savouries|mini cakes|gf mini cakes|gf warm scones", "Afternoon tea"),
    (r"tea & hot chocolate|drink|coffee|^teas$|juice|smoothie|beer|cider|cocktail|biscuit & syrups|^ddr$", "Drinks"),
    (r"dessert|pudding|sweet|cakes|pastries|something sweet|afters", "Desserts"),
    (r"breakfast|brunch|eggs|brioche|oats|^lunch$", "Breakfast & brunch"),
    (r"add.?ons?|add a little extra|extras|choices|accompaniment|carb and veg|sides & add|dips|dip it|bread & butter|haggis", "Add-ons"),
    (r"sides?|side dishes|on the side|nibbles|loaded waffle|for the table|bar snacks|snacks", "Sides & snacks"),
    (r"pizza|stone-baked", "Pizza"),
    (r"burger", "Burgers"),
    (r"salad", "Salads"),
    (r"sandwich|sarnies|baps|wraps", "Sandwiches"),
    (r"sunday|roast", "Sunday roasts"),
    (r"starters|small plates|sharing|sharers|to share|canapes|skewers|boards|festive small|large plates", "Starters & sharing"),
    (r"mains|classics|favourites|grill|butcher|from the sea|fish|pie|specials|fantastic|easy eats|create your own|set menu|feel-good|bbq|veggie|vegetarian|vegan|meat|lunch|hungry for more|premium|scotch pies|bang on|fixed price|signature|our ", "Mains"),
]
DISH_CATEGORIES = {"Mains", "Breakfast & brunch", "Starters & sharing", "Burgers", "Salads", "Sandwiches", "Pizza", "Sunday roasts", "Sides & snacks"}
NON_RANKABLE = {"Drinks", "Desserts", "Add-ons", "Afternoon tea"}  # sides and snacks stay rankable (playbook conventions)
PORK_RE = re.compile(r"\b(bacon|ham|gammon|pork|sausages?|chorizo|salami|pepperoni|prosciutto|pancetta|pigs? in blankets?|black pudding|nduja|chipolatas?|hog roast|crackling)\b", re.I)
BEEF_RE = re.compile(r"\b(beef|sirloin|rump|ribeye|rib-eye|brisket|wellington|chateaubriand)\b|"
                     r"(?<!lamb )(?<!gammon )(?<!salmon )(?<!tuna )(?<!cauliflower )(?<!swordfish )(?<!pork )(?<!chicken )(?<!turkey )"
                     r"(?<!duck )(?<!cod )(?<!veal )(?<!venison )(?<!halibut )\bsteak\b", re.I)
OTHER_PROTEIN = re.compile(r"\b(chicken|turkey|duck|lamb|fish|cod|haddock|salmon|prawns?|scampi|calamari|mussels?|crab|lobster|tuna|bass|"
                           r"scallops?|monkfish|goujons?|tenders?|nuggets?|halloumi|egg|eggs|mushroom|falafel|cheese|squid|sardines?|trout|mackerel)\b", re.I)
VEG_WORDS = re.compile(r"\b(vegan|veggie|vegetarian|plant|meat-free|meat free)\b", re.I)


class ChainScriptError(Exception):
    pass


def clean_name(raw: str) -> tuple[str, str]:
    """('Oyster Mushroom Tempura (VE)* Click through ...') -> ('Oyster Mushroom Tempura', 'VE'). The second value is the guide's own
    diet mark: 'V', 'VE' or '' (VG counts as VE)."""
    n = FOOTNOTE_CUT.sub("", NOTE_CUT.sub("", raw))
    marks = [m.upper() for m in DIET_RE.findall(n)] or [m.upper() for m in re.findall(r"\s(VE|V)(?=[*†# ]*$)", n)]
    diet = "VE" if any(m in ("VE", "VG") for m in marks) else ("V" if marks else "")
    n = DIET_RE.sub("", n)
    n = re.sub(r"\s(V|VE)(?=[*†# ]*$)", "", n)
    n = MARKS_RE.sub("", n)
    n = re.sub(r"\s+", " ", n).strip(" -")
    return n, diet


def category_for(section: str, overrides: dict[str, str]) -> str | None:
    s = section.strip().lower()
    if s in overrides:
        return overrides[s]
    for pattern, cat in CATEGORY_RULES:
        if re.search(pattern, s):
            return cat
    return None


def _sig(n: dict) -> tuple:
    return tuple(n.get(k) for k in ("kcal", "fat", "sat", "carbs", "sugars", "protein", "salt"))


def _impossible(n: dict, category: str = "") -> str:
    """Reason a printed row cannot be a real per-portion value (empty string if it can). Never corrects anything."""
    vals = n

    def f(key):
        try:
            return float(str(vals[key]).lstrip("<"))
        except (KeyError, ValueError):
            return None
    fat, sat, carb, sug = f("fat"), f("sat"), f("carbs"), f("sugars")
    if fat is not None and sat is not None and sat > fat * 1.06 + 0.1:
        return f"guide prints saturates {n['sat']} g greater than total fat {n['fat']} g"
    if carb is not None and sug is not None and sug > carb * 1.06 + 0.1:
        return f"guide prints sugars {n['sugars']} g greater than carbohydrate {n['carbs']} g"
    prot, kcal = f("protein"), f("kcal")
    if category != "Drinks" and None not in (fat, carb, prot, kcal):  # drinks can hold alcohol energy that the macros don't show
        macro = 4 * prot + 4 * carb + 9 * fat
        if abs(kcal - macro) > 100 and abs(kcal - macro) / max(kcal, macro) > 0.4:
            return f"guide prints {n['kcal']} kcal; its own protein, carbohydrate and fat add up to about {round(macro)} kcal"
    return ""


def extract_items(html: str, *, menus: dict[str, dict], excluded_menus: dict[str, str], category_overrides: dict[str, str] | None = None,
                  row_exclusions=None, no_desc_sections: dict[str, str] | None = None, name_categories: dict[str, str] | None = None) -> dict:
    """Turn a parsed guide into item dicts. Returns {"items", "holdback", "log", "stamp", "ambiguous"}: nothing is written here.

    menus: title -> {"category": forced category (optional), "label": suffix for names that clash with the standard menu,
    "limited": bool}. Titles in neither `menus` nor `excluded_menus` stop the run (the guide gained a menu)."""
    page = parse_page(html)
    overrides = {k.lower(): v for k, v in (category_overrides or {}).items()}
    known = set(menus) | set(excluded_menus)
    unknown = sorted({m["title"] for m in page["menus"] if m["title"] not in known})
    if unknown:
        raise ChainScriptError(f"menus in the guide that this script does not know (decide include/exclude): {unknown}")
    log: collections.Counter = collections.Counter()
    records: dict = collections.OrderedDict()
    for card in page["cards"]:
        title = card["menu"]
        if title in excluded_menus:
            log[f"menu excluded: {excluded_menus[title]} [{title}]"] += 1
            continue
        rule = menus[title]
        if not card["nutrition_rows"]:
            log["no nutrition table printed (drinks, cocktails, a few dishes)"] += 1
            continue
        name, diet = clean_name(card["name"])
        if not name:
            raise ChainScriptError(f"empty name for card {card['name']!r}")
        reason = row_exclusions(name, card) if row_exclusions else None
        if reason:
            log[reason] += 1
            continue
        nut = read_nutrition(card)
        if any(str(v).startswith("-") for v in nut.values()):
            log["row with negative numbers (a swap difference between two dishes, not a dish)"] += 1
            continue
        category = category_for(card["section"], overrides)
        if category is None:
            raise ChainScriptError(f"no category for section {card['section']!r} (menu {title!r}): add it to category_overrides")
        if rule.get("category") and category.lstrip("~") in DISH_CATEGORIES:
            category = rule["category"]  # e.g. every dish of the Small Appetites menu; its drinks, desserts and add-ons keep theirs
        if not card["desc"].strip() and card["section"].strip().lower() in (no_desc_sections or {}):
            category = no_desc_sections[card["section"].strip().lower()]
        if re.match(r"(add|extra|upgrade|double up)\b", name, re.I):
            category = "Add-ons"
        if name.lower() in (name_categories or {}):
            category = name_categories[name.lower()]
        key = (name.lower(), re.sub(r"\s+", " ", card["desc"]).strip().lower())
        rec = records.setdefault(key, {"name": name, "desc": card["desc"], "entries": []})
        rec["entries"].append({"menu": title, "section": card["section"], "category": category, "veg": bool(diet), "diet": diet, "nut": nut,
                               "label": rule.get("label", ""), "limited": rule.get("limited", False),
                               "choices": bool(NOTE_CUT.search(card["name"]))})
    # 1. one product per (name+description, label group, numbers); a dish printed in several menus with the same numbers is one item
    products: list[dict] = []
    ambiguous: list = []
    for rec in records.values():
        groups: dict[str, dict] = collections.OrderedDict()
        for e in rec["entries"]:
            groups.setdefault(e["label"], collections.OrderedDict()).setdefault(_sig(e["nut"]), []).append(e)
        for label, by_sig in groups.items():
            if len(by_sig) > 1:
                # other menus print other numbers for the same dish: if the primary menu(s) print exactly one set, use it
                prim = {sg for sg, es in by_sig.items() if any(menus[e["menu"]].get("primary") for e in es)}
                if len(prim) == 1:
                    sg = next(iter(prim))
                    log["same name printed with other numbers in a non-primary menu: the primary menu's numbers are used, the others ignored"] += len(by_sig) - 1
                    by_sig = {sg: by_sig[sg]}
            if len(by_sig) > 1:
                # the same dish in different sections (a starter portion and a side portion): the section tells them apart
                secs = [sec for es in by_sig.values() for sec in {e["section"] for e in es}]
                diets = [{e["diet"] for e in es} for es in by_sig.values()]
                if len(secs) == len(set(secs)) or (all(len(d) == 1 for d in diets) and len({next(iter(d)) for d in diets}) == len(diets)):
                    for sg, es in by_sig.items():
                        products.append({"name": rec["name"], "desc": rec["desc"], "label": label, "sig": sg, "entries": es})
                    continue
            if len(by_sig) > 1:
                ambiguous.append((rec["name"], label, [(e["menu"], e["section"], _sig(e["nut"])) for g in by_sig.values() for e in g]))
                log["same name and description printed with different numbers in the same kind of menu (cannot tell them apart): not published"] += 1
                continue
            (sig, ents), = by_sig.items()
            products.append({"name": rec["name"], "desc": rec["desc"], "label": label, "sig": sig, "entries": ents})
    merged: dict = collections.OrderedDict()
    for pr in products:  # the same dish with the same numbers in different menus is one item (a label is kept only if every menu has one)
        k = (pr["name"].lower(), pr["sig"])
        if k in merged:
            merged[k]["entries"].extend(pr["entries"])
            if not pr["label"]:
                merged[k]["label"] = ""
        else:
            merged[k] = pr
    products = list(merged.values())
    # 2. two different products with the same printed name: tell them apart with the guide's own words, never by guessing
    def groups_by_name():
        gb: dict[str, list] = collections.defaultdict(list)
        for pr in products:
            gb[pr["name"].lower()].append(pr)
        return [g for g in gb.values() if len(g) > 1]
    for group in groups_by_name():  # round 1: the menu a portion comes from (Children's, Afternoon Tea ...)
        for pr in group:
            if pr["label"]:
                pr["name"] = f"{pr['name']} ({pr['label']})"
    for group in groups_by_name():  # round 1b: the section each portion is printed in, when the sections differ
        secs = [{e["section"].strip().lower() for e in pr["entries"]} for pr in group]
        if all(secs) and sum(len(x) for x in secs) == len(set().union(*secs)):
            for pr in group:
                sec = " ".join(pr["entries"][0]["section"].split())
                pr["name"] = f"{pr['name']} ({sec.title() if sec.isupper() else sec})"
    for group in groups_by_name():  # round 1c: the guide's own vegan mark when the others are not
        if len({pr["entries"][0]["diet"] for pr in group}) > 1:
            for pr in group:
                if pr["entries"][0]["diet"] == "VE":
                    pr["name"] = f"{pr['name']} (vegan)"
    for group in groups_by_name():  # round 2: the accompaniment / choice the guide prints under the dish name
        for pr in group:
            d = pr["desc"].strip(" .")
            m = re.search(r"\bwith\b[^:]*$", d, re.I)
            extra = m.group(0).strip(" .") if m else (d if d and len(d) <= 60 and "," not in d else "")
            if not extra or len(extra) > 45:
                continue
            if m:
                pr["name"] = f"{pr['name']} {extra}"
            elif pr["name"].endswith(")"):
                pr["name"] = f"{pr['name'][:-1]}, {extra})"
            else:
                pr["name"] = f"{pr['name']} ({extra})"
    for group in groups_by_name():  # round 3: still cannot be told apart: none of them is published
        for pr in group:
            ambiguous.append((pr["name"], pr["label"], [(e["menu"], e["section"], pr["sig"]) for e in pr["entries"]]))
            log["different numbers under one name that the guide gives no way to tell apart: not published"] += 1
        drop = {id(pr) for pr in group}
        products = [pr for pr in products if id(pr) not in drop]
    # 3. rows
    items, holdback = [], []
    used_ids: dict[str, int] = {}
    for pr in products:
        ents = pr["entries"]
        first = ents[0]
        nut = first["nut"]
        base = slug(pr["name"])
        n_used = used_ids.get(base, 0)
        used_ids[base] = n_used + 1
        item_id = base if n_used == 0 else f"{base}-{n_used + 1}"
        veg = any(e["veg"] for e in ents) or bool(re.search(r"\b(vegetarian|vegan|veggie)\b", pr["name"], re.I))
        text = f"{pr['name']} {pr['desc']}"
        tags = []
        if veg:
            tags.append("vegetarian")
        elif not VEG_WORDS.search(pr["name"]):
            # "vegan sausages" / "veggie burger" in a description are not pork or beef
            plain = re.sub(r"\b(vegan|veggie|vegetarian|plant-based|meat-free)\s+(?:\w+\s+){0,2}?(sausages?|bacon|burgers?|chorizo|ham|mince|chicken|beef|pork|steak|brisket)\b", "", text, flags=re.I)
            if PORK_RE.search(plain):
                tags.append("contains_pork")
            if BEEF_RE.search(plain):
                tags.append("contains_beef")
        note = f"{first['menu']} / {first['section']}"
        if len(ents) > 1:
            note += f" (+{len(ents) - 1} more menu entries, same numbers)"
        if any(e["choices"] for e in ents):
            note += "; the guide flags this dish as having choices (its numbers may not include them)"
        try:
            kj, kc = float(nut["kj"]), float(nut["kcal"])
            if kc >= 20 and not (3.9 <= kj / kc <= 4.5):
                note += f"; printed kJ {nut['kj']} and kcal {nut['kcal']} do not agree"
        except (KeyError, ValueError, ZeroDivisionError):
            pass
        cat = next((e["category"] for e in ents if not e["category"].startswith("~")), first["category"]).lstrip("~")
        item = {
            "id": item_id, "name": pr["name"], "category": cat, "serving": "", "calories": nut["kcal"], "protein_g": nut["protein"],
            "carbs_g": nut["carbs"], "fat_g": nut["fat"], "sat_fat_g": nut["sat"], "sodium_mg": "", "salt_g": nut["salt"],
            "sugar_g": nut["sugars"], "fiber_g": "", "tags": "|".join(tags),
            "limited_time": all(e["limited"] for e in ents), "rankable": cat not in NON_RANKABLE,
            "notes": note, "_desc": pr["desc"],
        }
        items.append(item)
        bad = _impossible(nut, cat)
        if bad:
            holdback.append((item_id, bad))
    return {"items": items, "holdback": holdback, "log": log, "stamp": page["stamp"], "ambiguous": ambiguous}


def default_row_exclusions(name: str, card: dict) -> str | None:
    """Rows that are choices of another dish rather than something you order on its own."""
    n = name.lower()
    if n.startswith(("with ", "swap", "or ", "add on/select option", "select ")) or re.search(r"\bchoice\b", n):
        return "choice/swap row ('With ...', 'Swap ...', '... choice', 'Add on/select option ...'): no dish name, only meaningful beside its dish"
    return None


def sha_of(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main_for(*, chain_id: str, chain_name: str, cuisine: str, aliases: list[str], source_url: str, brand_label: str, menus: dict,
             excluded_menus: dict, category_overrides: dict | None = None, row_exclusions=default_row_exclusions, note: str = "",
             expected_brand_stamp: str = "", no_desc_sections: dict | None = None,
             name_categories: dict | None = None) -> int:
    ap = argparse.ArgumentParser(description=f"Build data/source/{chain_id}/ from the M&B allergen guide ({source_url})")
    ap.add_argument("html", type=Path, help="the downloaded guide page")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the guide was downloaded")
    ap.add_argument("--out", type=Path, default=None, help="output folder (default data/source/<id>)")
    args = ap.parse_args()
    html = args.html.read_text(encoding="utf-8")
    try:
        res = extract_items(html, menus=menus, excluded_menus=excluded_menus, category_overrides=category_overrides,
                            row_exclusions=row_exclusions, no_desc_sections=no_desc_sections,
                            name_categories={k.lower(): v for k, v in (name_categories or {}).items()})
    except (GuideLayoutError, ChainScriptError) as e:
        print(f"{chain_id}: stopped. The guide no longer matches this script: {e}", file=sys.stderr)
        return 1
    stamp = res["stamp"]
    if expected_brand_stamp and not stamp.startswith(expected_brand_stamp):
        print(f"the page is stamped {stamp!r}, expected it to start with {expected_brand_stamp!r}", file=sys.stderr)
        return 1
    m = re.search(r"(\d{4}-\d{2}-\d{2})", stamp)
    page_date = m.group(1) if m else "undated"
    items = res["items"]
    for it in items:
        it.pop("_desc", None)
    out = write_chain_folder(
        chain_id=chain_id, name=chain_name, cuisine=cuisine,
        source_title=f"{brand_label} Allergen & Nutrition Guide, Mitchells & Butlers (page stamped {page_date})",
        source_url=source_url, checked_on=args.checked_on, aliases=aliases, items=items, out=args.out, note=note,
        holdback=res["holdback"])
    print(f"wrote {len(items)} items ({len(res['holdback'])} held back) to {out}; page stamp {stamp!r}; sha256 {sha_of(args.html)}")
    print(f"  {sum('flags this dish as having choices' in i['notes'] for i in items)} published items are dishes the guide flags as having choices")
    for reason, n in sorted(res["log"].items()):
        print(f"  left out {n:4d} rows: {reason}")
    for name, label, ents in res["ambiguous"]:
        print(f"  ambiguous {name!r} [{label}]: {ents}")
    return 0
