#!/usr/bin/env python3
"""Build data/source/san-carlo/ from San Carlo's own allergen & nutrition pages (hosted by Ten Kites, menus.tenkites.com).

    python3 tools/uk_extract/san_carlo.py --pages DIR --checked-on 2026-10-08 [--fetch]

How the source works (read from the pages' own scripts): every restaurant has a landing page
https://menus.tenkites.com/sancarlo/<unit> that lists its menus and carries a session identifier; the menu itself is the
page's own GET <unit>?cl=true&mguid=<menu guid> sent with that identifier in the X-TENKITES-API-SessionIdentifier header
(exactly what the page's JavaScript does). Two views exist:

  * "Web Menu" (the pages sancarlo.co.uk embeds, one per restaurant): a pop-up per dish with "Nutrition (per portion)"
    (kcal, protein, carb, sugars, fat, saturates, salt) and "Contains / May contain" lines -> tenkites_c.read_popover_layout;
  * "Allergen Page" (San Carlo Bristol only, the page the printed menus' QR code opens): a wide table with the same
    figures and one column per allergen -> tenkites_c.read_table_layout.

THE RULE FOR A CHAIN WITH ONE MENU PER RESTAURANT: figures differ by restaurant and by menu. A dish is published only when
EVERY restaurant (and both views of Bristol) that prints it, in the same kind of menu (a la carte, lunch, children's,
Christmas...), gives identical figures and identical allergens; a dish printed with different figures anywhere in the same
kind of menu is left out entirely (never merged, averaged or picked; listed in the run's report). A dish whose figures differ
BETWEEN kinds of menu (a smaller lunch portion) is published once per distinct set of figures, the later ones named after
their menu, e.g. "Mozzarella in Carrozza (lunch menu)". Starter/Main sizes and other choices the page prints are separate
items. A row the page does not label (two sizes both called "Chicken Caesar Salad") is only accepted if its figures equal
one of the labelled sizes. Rows whose own numbers contradict themselves (saturates over fat, sugars over carbohydrate,
salt of 100 g+, or kcal 35%+ (and 50+ kcal) away from what the printed protein/carbs/fat add up to) go to holdback.csv.
Completeness is checked against a second copy of every dish's kcal that each page embeds as schema.org JSON-LD.

Wine, bar, spirits and soft-drink lists are not read: they print no serving size (a glass? a bottle? a measure?) and most
rows are '-'. If a menu gains or loses dishes, or a new section or label appears, the run stops so a human re-checks.
"""
from __future__ import annotations
import argparse
import hashlib
import http.client
import re
import sys
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug  # noqa: E402

CHAIN_ID = "san-carlo"
BASE = "https://menus.tenkites.com/sancarlo/"
# unit code -> restaurant. The ten San Carlo restaurants in Great Britain (sancarlo.co.uk/brands/san-carlo/); the group's other
# brands (Cicchetti, Fumo, Alto, Isola, Ciccaro, Signor Sassi, Flying Pizza, Gran Cafe, Bottega, Champagne Bar) are separate chains.
UNITS = OrderedDict([
    ("sancarlobristol02", "San Carlo Bristol (Allergen Page)"),
    ("sancarlobristol", "San Carlo Bristol"),
    ("sancarlobirmingham", "San Carlo Birmingham"),
    ("sancarloalderleyedge", "San Carlo Alderley Edge"),
    ("sancarlofiorentina", "San Carlo Fiorentina (Hale)"),
    ("sancarloleedssouthparade", "San Carlo Leeds"),
    ("sancarloleicester", "San Carlo Leicester"),
    ("sancarloliverpool", "San Carlo Liverpool"),
    ("sancarloknightsbridge", "San Carlo Knightsbridge"),
    ("sancarloregentst", "San Carlo Regent Street"),
    ("sancarlomanchester", "San Carlo Manchester"),
])
# menus that are drinks lists (not read): see the module docstring
SKIP_MENU = re.compile(r"^(Wine|Bar|Spirits)$", re.I)


# ---------------------------------------------------------------- fetching (one request per page, >= 1 s apart)

def _get(url: str, dest: Path, session: str = "") -> None:
    req = urllib.request.Request(url, headers={"User-Agent": tk.USER_AGENT, "Accept-Encoding": "identity"})
    if session:
        req.add_header("X-TENKITES-API-SessionIdentifier", session)
    data = b""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:   # 403 / 429 / anything the server says: stop, never work round it
            raise SystemExit(f"{url}: HTTP {e.code}: stopped, not retried")
        except (urllib.error.URLError, ConnectionError, http.client.HTTPException, TimeoutError) as e:   # a dropped connection is not a refusal
            if attempt == 2:
                raise SystemExit(f"{url}: connection failed three times ({e})")
            time.sleep(3.0)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    time.sleep(1.0)


def landing_info(text: str) -> tuple[str, list[tuple[str, str]]]:
    """(session identifier, [(menu guid, menu name)]) from a unit's landing page."""
    m = re.search(r"SessionIdentifierForApi = '([^']+)'", text)
    if not m:
        raise SystemExit("landing page has no session identifier: the platform changed, re-check the page's scripts")
    menus: list[tuple[str, str]] = []
    for n in tk.parse_html(text).iter():
        g = n.attrs.get("data-menu-identifier")
        if g and n.has("k10-menu-selector__option-name") and (g, n.text()) not in menus:
            menus.append((g, n.text()))
    if not menus:
        raise SystemExit("landing page lists no menus")
    return m.group(1), menus


def fetch_all(pages: Path) -> None:
    for unit in UNITS:
        folder = pages / unit
        landing = folder / "landing.html"
        if not landing.exists():
            _get(BASE + unit, landing)
        session, menus = landing_info(landing.read_text(encoding="utf-8"))
        for guid, name in menus:
            if SKIP_MENU.match(name):
                continue
            dest = folder / f"{guid}.html"
            if not dest.exists():
                _get(f"{BASE}{unit}?cl=true&mguid={guid}", dest, session)
            print(f"fetched {unit} {name!r}")


# ---------------------------------------------------------------- reading the saved pages

# menu name (as the landing page prints it) -> kind. A name that matches none of these stops the run.
MENU_KINDS = [
    (r"^(A la Carte|Main Menu)$", "main"),
    (r"^Seasonal Specials$", "specials"),
    (r"^1996 Menu$", "1996"),
    (r"^(Menu Fisso|Lunch)\b", "lunch"),
    (r"^Theatre\b", "theatre"),
    (r"^Sunday Roast$", "sunday"),
    (r"^Children", "children"),
    (r"^Christmas Fayre Lunch", "xmas-lunch"),
    (r"^Christmas Fayre Dinner", "xmas-dinner"),
    (r"^Christmas Day", "xmas-day"),
    (r"^Seasonal Cocktails$", "cocktails"),
    (r"^Wimbledon Specials$", "wimbledon"),
]
# The 14 allergen columns of the Allergen Page, as printed (the pop-up views print the same names in their lines).
ALLERGEN_COLUMNS = ["Celery", "Cereals with Gluten", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", "Molluscs", "Mustard",
                    "Tree Nuts", "Peanuts", "Sesame Seeds", "Soya", "Sulphur Dioxide/Sulphites"]
NUM_FIELDS = ["calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sugar_g", "fiber_g", "salt_g"]


SKIPPED: list = []       # dishes the pages print without enough to name them: reported, never guessed
# names the page prints in capitals with the restaurant's internal code; only the capitalisation and the code are changed
NAME_FIXES = {"ADD PIZZA SAUCE - SC": "Add Pizza Sauce", "ADD TALEGGIO - SC": "Add Taleggio",
              "EXTRA HORSERADISH - ALL": "Extra Horseradish", "EXTRA MINT SAUCE - ALL": "Extra Mint Sauce"}


def menu_kind(name: str) -> str:
    for rx, kind in MENU_KINDS:
        if re.search(rx, name):
            return kind
    raise SystemExit(f"new menu {name!r}: add it to MENU_KINDS (or SKIP_MENU if it is a drinks list)")


def norm(name: str) -> str:
    """Key for 'the same dish': printed name, whitespace and apostrophes unified, case ignored."""
    return " ".join(name.replace("\u2019", "'").replace("\u2018", "'").split()).casefold()


def allergen_sig(a: dict | None):
    if a is None:
        return None
    return (tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])))


def _popover_numbers(pop: tk.Node) -> dict:
    vals = {}
    for tr in pop.find_all(tag="tr"):
        tds = tr.find_all(tag="td")
        if len(tds) >= 2:
            vals[tds[0].text()] = tk.printed(tds[1].text())
    return vals


def read_choice_dishes(text: str) -> list[dict]:
    """The dishes the pop-up reader skips: dishes that come in choices (a pasta as Starter or Main, oysters Six or Nine,
    burrata with one of two sides) and dishes with an optional extra ('Patate Fritte' / '... with fresh truffle'). Each
    choice has its own pop-up with its own figures and allergens. One row per choice, in the same shape as
    tk.read_popover_layout, with `name` = the dish plus the choice and `variant` = the choice as printed."""
    root = tk.parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise SystemExit("pop-up layout not found: the page has no k10-all-courses block")
    filt = tk.filter_labels(root)
    rows = []
    for b in body.iter():
        if not b.has("k10-recipe_byo"):
            continue
        head = b.find("k10-byo__name")
        items = b.find_all("k10-byo-item")
        if not items:
            raise SystemExit("a choice dish has no choices")
        base_name = head.text() if head is not None else ""
        first = items[0].find("k10-byo-item__name")
        for it in items:
            nm = it.find("k10-byo-item__name")
            pop = it.find("k10-popover")
            table = it.find("k10-popover__nutrients-table")
            if nm is None or pop is None or table is None:
                raise SystemExit(f"{base_name or '?'}: a choice without a name or a nutrition pop-up")
            choice = nm.text()
            base = base_name
            if head is not None and norm(choice) == norm(base_name):   # Alderley / Fiorentina: two choices both called 'Chicken Caesar Salad'
                name, variant = base_name, ""
            elif head is not None:                     # 'Penne Arrabbiata' + 'Starter'
                name, variant = base_name, choice
            elif it.has("k10-recipe_not-sub-byo") or (first is not None and nm is first):   # the plain dish of an 'or' pair
                base_name, name, variant = choice, choice, ""
                base = name
            elif base_name and choice.startswith("with "):                              # '... with fresh truffle and Grana Padano'
                name, variant = f"{base_name} {choice}", ""
                base = name
            else:
                name, variant, base = "", "", ""
            if choice in ("Starter", "Main") and head is None:    # Knightsbridge prints a lone 'Starter' with no dish name above it
                name, variant, base = "", "", ""
            lines = {"contains": None, "may": None}
            wrap = pop.find("k10-popover__label-names-wrapper")
            for div in (c for c in (wrap.children if wrap is not None else []) if isinstance(c, tk.Node)):
                tk._line(div.text(), lines, {"Contains:": "contains", "May contain:": "may", "Suitable for:": None}, name)
            desc = it.find("k10-byo-item__desc")
            rows.append({"section": tk._course_section(b), "name": name, "base": base, "variant": variant, "choice": choice, "unnamed": not name, "nutrients": _popover_numbers(table),
                         "desc": desc.text() if desc is not None else "", "suitable": wrap.text() if wrap is not None else "",
                         "kind": "choice", **lines, "label_ids": tk._label_ids(it, it.attrs.get("data-recipe-id", "")), "filter": filt})
    return rows


def _kcal(text: str) -> str:
    m = re.match(r"^\s*([\d,]+(?:\.\d+)?)", text or "")
    return m.group(1).replace(",", "") if m else ""


def check_complete(text: str, rows: list[dict], where: str) -> None:
    """Completeness check against a second copy of the figures the same page embeds (schema.org JSON-LD, whole numbers):
    every dish the JSON-LD lists with calories must have been read, with the same kcal, and no more rows than that."""
    import json
    from collections import Counter
    ld: Counter = Counter()

    def walk(o):
        if isinstance(o, dict):
            if o.get("@type") == "MenuItem" and "nutrition" in o:
                ld[(o["name"].strip(), _kcal(o["nutrition"].get("calories", "")))] += 1
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    names_ok = True
    for block in re.findall(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", text, re.S):
        try:
            walk(json.loads(block))
        except ValueError:      # a restaurant's own text broke the JSON (Leicester): compare the kcal figures alone
            names_ok = False
            for m in re.finditer(r'"calories":"([\d,.]+) ?calories?"', block):
                ld[("", m.group(1).replace(",", ""))] += 1
    if not names_ok:
        ld = Counter({("", k[1]): v for k, v in ld.items()})
    have: Counter = Counter()
    for r in rows:
        kcal = _kcal(r["nutrients"].get("Energy (kCal)", ""))
        have[("" if not names_ok else r["choice"].strip() if r.get("kind") == "choice" else r["name"].strip(), kcal)] += 1
    # a choice's own name in the JSON-LD is the choice ('Starter', 'Main', 'with garlic butter'); a plain dish's is its name
    ld = Counter({k: v for k, v in ld.items() if k[1] not in ("", "0")})      # the JSON-LD leaves out a dish's calories when they are empty or 0
    have = Counter({k: v for k, v in have.items() if k[1] not in ("", "0")})
    missing = ld - have
    extra = have - ld
    if missing or extra:
        raise SystemExit(f"{where}: the page's embedded figures disagree with the dishes read: only in JSON-LD {dict(missing)}; "
                         f"only read {dict(extra)}")


def read_unit(pages: Path, unit: str) -> list[dict]:
    """Every dish of every food menu saved for one restaurant, as plain records (numbers as printed)."""
    folder = pages / unit
    _, menus = landing_info((folder / "landing.html").read_text(encoding="utf-8"))
    out: list[dict] = []
    for guid, mname in menus:
        if SKIP_MENU.match(mname):
            continue
        kind = menu_kind(mname)
        text = (folder / f"{guid}.html").read_text(encoding="utf-8")
        table = unit.endswith("02")      # the Allergen Page view
        rows = tk.read_table_layout(text) if table else tk.read_popover_layout(text) + read_choice_dishes(text)
        if not rows:
            raise SystemExit(f"{unit} {mname!r}: no dishes found: the page layout changed")
        if not table:
            check_complete(text, rows, f"{unit} / {mname}")
        for r in rows:
            nm = " ".join(r["name"].split())
            if r.get("kind") == "item" and (nm in ("Starter", "Main") or nm.startswith("with ")):
                r["unnamed"], r["choice"] = True, nm       # Knightsbridge lists a choice as a plain row without its dish name
            if r.get("unnamed"):
                SKIPPED.append(f"{unit} / {mname}: not read, the page prints the choice {r['choice']!r} without a dish name above it "
                               f"({r['nutrients'].get('Energy (kCal)', '?')} kcal)")
        rows = [r for r in rows if not r.get("unnamed")]
        same = {}     # how many rows in this menu share a dish name
        for r in rows:
            k = NAME_FIXES.get(" ".join(r.get("base", r["name"]).split()), " ".join(r.get("base", r["name"]).split()))
            same[k] = same.get(k, 0) + 1
        for r in rows:
            base = " ".join(r.get("base", r["name"]).split())
            base = NAME_FIXES.get(base, base)
            where = f"{unit} / {mname} / {base}"
            if not table and r.get("kind") not in ("item", "choice"):
                raise SystemExit(f"{where}: unexpected row kind {r.get('kind')!r}")
            label, unlabelled = "", False
            if r.get("kind") == "choice":
                label = r.get("variant", "")
                if label in ("Starter", "Main", "Six", "Nine"):
                    label = label.lower()
                elif not label:
                    unlabelled = same[base] > 1
            elif same[base] > 1:    # the same name several times in one menu (Chicken Caesar Salad: Starter / Main; Garlic Bread:
                sub = " ".join(r["desc"].split())    # plain / with tomato / with cheese): the page's own sub-line says which
                subs = [" ".join(x["desc"].split()) for x in rows if " ".join(x.get("base", x["name"]).split()) == base]
                if sub and len(sub) <= 30 and len(set(subs)) == len(subs):
                    label = sub[:1].lower() + sub[1:]
                else:
                    unlabelled = True       # the page does not say which is which: see decide()
            nums, missing = tk.numbers(r["nutrients"], where)
            if table:
                allergens = tk.allergens_from_columns(r, where, ALLERGEN_COLUMNS)
                veg = r.get("vegetarian")
            else:
                allergens = tk.allergens_checked(r, where)
                veg = bool(re.search(r"Suitable for:[^:]*(Vegetarian|Vegan)", r.get("suitable", ""))) or None
            out.append({"unit": unit, "menu": mname, "kind": kind, "section": r["section"], "base": base, "label": label,
                        "desc": r["desc"], "nums": nums, "missing": missing, "allergens": allergens, "veg": veg,
                        "unlabelled": unlabelled})
    return out


# ---------------------------------------------------------------- deciding what is published

# Menu kinds in the order that decides a dish's category and which figures carry the plain name.
KIND_ORDER = ["main", "specials", "wimbledon", "1996", "lunch", "theatre", "sunday", "children", "xmas-lunch", "xmas-dinner",
              "xmas-day", "cocktails"]
KIND_QUALIFIER = {"specials": "seasonal specials", "wimbledon": "Wimbledon specials", "1996": "1996 menu", "lunch": "lunch menu",
                  "theatre": "theatre menu", "sunday": "Sunday roast menu", "children": "children's menu",
                  "xmas-lunch": "Christmas lunch", "xmas-dinner": "Christmas dinner", "xmas-day": "Christmas Day",
                  "cocktails": "seasonal cocktails", "main": "main menu"}
# kinds that are seasonal or one-off: a dish only ever printed there is a limited-time item
LIMITED_KINDS = {"specials", "wimbledon", "1996", "xmas-lunch", "xmas-dinner", "xmas-day", "cocktails"}

# A la Carte / Main Menu sections as printed -> (category, rankable). The printed spellings differ a little between restaurants.
MAIN_SECTIONS = {
    "": ("To start", False), "Bruschette e Pane": ("Bruschette e pane", False), "Antipasti": ("Antipasti", False),
    "To Share": ("To share", False), "Zuppe": ("Zuppe", False), "Formaggi": ("Formaggi", False), "Ostriche": ("Ostriche", False),
    "Pizza": ("Pizza", True), "Pasta": ("Pasta e risotto", True), "Pasta e Risotto": ("Pasta e risotto", True),
    "Pasta e Risotti": ("Pasta e risotto", True), "Gran Pasta": ("Pasta e risotto", True), "Carne": ("Carne", True),
    "Macelleria": ("Macelleria", True), "Macelleria From The Grill": ("Macelleria", True), "Grill": ("Macelleria", True),
    "Big cuts to share, for 2 people": ("Big cuts to share", False), "Pesci": ("Pesci", True), "Pesce": ("Pesci", True),
    "Specials": ("Specials", True), "Contorni": ("Contorni", False), "Dolci": ("Dolci", False), "Gelato": ("Gelato", False),
    "Condiments": ("Condiments", False), "Toppings": ("Toppings", False),
}
SET_SECTIONS = {   # kind -> {printed section: (category, rankable)}; only a course of mains (and pizzas) is a whole meal
    "specials": {"Antipasti": ("Seasonal specials", False), "Pasta e Risotto": ("Seasonal specials", True), "Carne": ("Seasonal specials", True),
                 "Pesci": ("Seasonal specials", True), "Dolci": ("Seasonal specials", False)},
    "1996": {"Starters": ("1996 menu: Starters", False), "Mains": ("1996 menu: Mains", True), "Desserts": ("1996 menu: Desserts", False)},
    "lunch": {"Starters": ("Lunch menu: Starters", False), "Mains": ("Lunch menu: Mains", True), "Desserts": ("Lunch menu: Desserts", False),
              "Pizza (Burrata & Tartufo supplement \u00a33)": ("Lunch menu: Pizza", True)},
    "theatre": {"Starters": ("Theatre menu: Starters", False), "Mains": ("Theatre menu: Mains", True), "Desserts": ("Theatre menu: Desserts", False)},
    "sunday": {"": ("Sunday roast", True)},
    "children": {"Antipasti (Little Starters)": ("Children's menu: Little starters", False), "Secondi (The Main Event)": ("Children's menu: Main event", False),
                 "Contorni (Little Sides)": ("Children's menu: Little sides", False), "Dolci (Something Sweet)": ("Children's menu: Something sweet", False),
                 "Gelati & Toppings": ("Children's menu: Gelati & toppings", False), "Gelati Extras": ("Children's menu: Gelati extras", False)},
    "xmas-lunch": {"Starters": ("Christmas menu: Starters", False), "Mains": ("Christmas menu: Mains", True), "Desserts": ("Christmas menu: Desserts", False)},
    "xmas-dinner": {"Starters": ("Christmas menu: Starters", False), "Mains": ("Christmas menu: Mains", True), "Desserts": ("Christmas menu: Desserts", False)},
    "xmas-day": {"Starters": ("Christmas menu: Starters", False), "Mains": ("Christmas menu: Mains", True), "Desserts": ("Christmas menu: Desserts", False)},
    "cocktails": {"": ("Seasonal cocktails", False)},
    "wimbledon": {"": ("Wimbledon specials", False)},
}
SIZE_LABELS = {"starter": "Starter", "main": "Main", "six": "Six", "nine": "Nine"}


def sig(r: dict):
    return (tuple(r["nums"][f] for f in NUM_FIELDS), allergen_sig(r["allergens"]))


def category_for(kind: str, section: str) -> tuple[str, bool]:
    table = MAIN_SECTIONS if kind == "main" else SET_SECTIONS.get(kind)
    if table is None or section not in table:
        raise SystemExit(f"new section {section!r} in a {kind!r} menu: add it to MAIN_SECTIONS / SET_SECTIONS (category, rankable)")
    return table[section]


def display(base: str, label: str) -> str:
    return f"{base} ({label})" if label else base


def decide(recs: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    """The rule: a dish is published only if every restaurant and every menu of the same kind that prints it gives identical
    figures and allergens. Dishes printed with different figures in the same kind of menu are dropped entirely; a dish whose
    figures differ between kinds of menu (a smaller lunch portion) is published once per distinct set of figures, the
    later ones named after the menu. Returns (published records, report lines, conflict lines)."""
    groups: dict = {}
    for r in recs:
        groups.setdefault(norm(r["base"]), []).append(r)
    published, report, conflicts = [], [], []
    for gkey, rs in groups.items():
        base = rs[0]["base"]
        labelled = [r for r in rs if r["label"]]
        unl = [r for r in rs if not r["label"]]
        problem = ""
        # 1. identical across restaurants (and the two views of Bristol) within the same kind of menu
        by = {}
        for r in rs:
            by.setdefault((r["label"], r["kind"]), set()).add(sig(r))
        if labelled:
            for (label, kind), sigs in by.items():
                if label and len(sigs) > 1:
                    problem = f"{display(base, label)} in {kind} menus: {len(sigs)} different sets of figures"
            allowed = {sig(r) for r in labelled}
            for r in unl:      # a row the page does not label (one size only, or two unlabelled sizes) must match a labelled size
                if sig(r) not in allowed and not problem:
                    problem = f"{base} ({r['unit']}, {r['kind']}): unlabelled figures that match none of the labelled sizes"
        else:
            for (label, kind), sigs in by.items():
                if len(sigs) > 1:
                    problem = f"{base} in {kind} menus: {len(sigs)} different sets of figures"
        if problem:
            conflicts.append(problem)
            continue
        # 2. one item per label and distinct figures; later kinds with other figures are named after their menu
        variants = sorted({r["label"] for r in labelled}) if labelled else [""]
        for label in variants:
            mine = [r for r in rs if r["label"] == label] if labelled else rs
            items: list[dict] = []
            for kind in KIND_ORDER:
                kr = [r for r in mine if r["kind"] == kind]
                if not kr:
                    continue
                s0 = sig(kr[0])
                hit = next((i for i in items if i["sig"] == s0), None)
                if hit:
                    hit["recs"] += kr
                else:
                    items.append({"sig": s0, "recs": list(kr), "kind": kind, "qualifier": "" if not items else KIND_QUALIFIER[kind]})
            for it in items:
                name = display(base, label)
                if it["qualifier"]:
                    name = f"{name} ({it['qualifier']})"
                published.append({"name": name, "base": base, "label": label, "kind": it["kind"], "recs": it["recs"], "rec": it["recs"][0]})
    return published, report, conflicts


def build(pages: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    recs: list[dict] = []
    for unit in UNITS:
        recs += read_unit(pages, unit)
    pub, report, conflicts = decide(recs)
    report += sorted(set(SKIPPED))
    report += [f"left out (different figures for one name): {c}" for c in sorted(conflicts)]
    items, holdback, used = [], [], set()
    for p in pub:
        r = p["rec"]
        nums = dict(r["nums"])
        where = p["name"]
        if r["missing"]:
            report.append(f"skipped {where!r}: {r['missing']} not printed")
            continue
        if float(nums["calories"]) == 0 and float(nums["protein_g"]) == 0 and float(nums["carbs_g"]) == 0 and float(nums["fat_g"]) == 0:
            report.append(f"skipped {where!r}: every figure is printed as 0")
            continue
        category, rankable = category_for(p["kind"], r["section"])
        if p["label"] in ("starter", "six", "nine") or p["kind"] == "children":
            rankable = False
        kinds = {x["kind"] for x in p["recs"]}
        veg = all(x["veg"] is True for x in p["recs"])
        meat, unspecified = tk.meat_tags(p["name"], r["desc"], vegetarian=veg)
        if unspecified:
            report.append(f"meat type not stated: {p['name']}")
        base_id = slug(p["name"])
        item_id, n = base_id, 1
        while item_id in used:
            n += 1
            item_id = f"{base_id}-{n}"
        used.add(item_id)
        item = {"id": item_id, "name": p["name"], "category": category, "serving": SIZE_LABELS.get(p["label"], ""), **nums,
                "tags": "|".join((["vegetarian"] if veg else []) + meat), "rankable": rankable,
                "limited_time": kinds <= LIMITED_KINDS, "notes": "", "allergens": r["allergens"]}
        notes = tk.annotate(item)
        if ("cocktail" in p["name"].lower() or p["kind"] == "cocktails") and any(n.startswith("Printed calories") for n in notes):
            notes = [n for n in notes if not n.startswith("Printed calories")] + [
                "Printed calories are higher than the energy of the printed protein, carbs and fat (alcohol is not listed)"]
        item["notes"] = "; ".join(notes)
        report += [f"{p['name']}: {n}" for n in notes]
        # impossible on their own figures: held back, never corrected
        why = []
        f = lambda k: float(nums[k]) if nums[k] not in ("", None) else None   # noqa: E731
        if f("sat_fat_g") is not None and f("fat_g") is not None and f("sat_fat_g") > f("fat_g"):
            why.append("saturates printed higher than fat")
        if f("sugar_g") is not None and f("carbs_g") is not None and f("sugar_g") > f("carbs_g"):
            why.append("sugars printed higher than carbohydrate")
        if f("salt_g") is not None and f("salt_g") >= 100:
            why.append("salt of 100 g or more")
        cocktail = p["kind"] == "cocktails" or "cocktail" in p["name"].lower()     # alcohol adds energy the table does not list
        kc, pr, cb, ft = f("calories"), f("protein_g"), f("carbs_g"), f("fat_g")
        implied = 4 * pr + 4 * cb + 9 * ft
        if not cocktail and abs(kc - implied) >= 50 and abs(kc - implied) / kc >= 0.35:
            why.append(f"the page prints {kc:g} kcal, but its own protein, carbohydrate and fat add up to about {implied:.0f} kcal")
        if why:
            holdback.append((item_id, "; ".join(why)))
        items.append(item)
    order: list = []
    for cat in [v[0] for v in MAIN_SECTIONS.values()] + [v[0] for k in KIND_ORDER[1:] for v in SET_SECTIONS.get(k, {}).values()]:
        if cat not in order:
            order.append(cat)
    items.sort(key=lambda it: order.index(it["category"]))      # stable: dishes keep the order the menu prints them in
    return items, holdback, report


SOURCE_URL = "https://sancarlo.co.uk/menus/"
SOURCE_TITLE = ("San Carlo allergen and calorie information, Web Menu pages of 10 restaurants and the Bristol Allergen Page "
                "(menus.tenkites.com, live menus; no date shown)")
ALLERGEN_TITLE = "San Carlo allergen and calorie information (menus.tenkites.com, live menus; no date shown)"
NOTE = ("Per portion, from San Carlo's own calorie and allergen pages for its 10 restaurants. A dish is listed only when every "
        "restaurant prints the same figures for it; dishes that differ between restaurants are left out. Menus vary by "
        "restaurant, so not every dish is served everywhere. Wine, bar and spirits lists are not included.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the live pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the landing pages and menus into --pages first (skips files already there)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    items, holdback, report = build(args.pages)
    from common import write_chain_folder
    out = write_chain_folder(chain_id=CHAIN_ID, name="San Carlo", cuisine="Italian", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["san carlo", "san carlo restaurant"],
                             items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    digest = hashlib.sha256()
    for f in sorted(args.pages.glob("*/*.html")):
        h = tk.sha256_text_file(f)
        digest.update(f"{f.parent.name}/{f.name} {h}\n".encode())
        print(f"{f.parent.name}/{f.name} sha256 {h}")
    print(f"combined sha256 of all pages {digest.hexdigest()}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
