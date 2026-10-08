#!/usr/bin/env python3
"""Build data/source/barburrito/ from BarBurrito's own allergen and nutrition pages (hosted by Ten Kites): a CALORIES-ONLY chain.

    python3 tools/uk_extract/barburrito.py --pages DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: https://tkmenus.com/barburrito, the page behind "NUTRITIONAL INFO" and "ALLERGENS INFO" on https://barburrito.co.uk/menu/
(both buttons link to it). It has nine menus, each chosen with ?mguid=<menu id> (see MENUS); --fetch saves each once into --pages
(one request per second), and barburrito_pages.py reads the saved pages. The pages show no guide date (their file names carry the
day they were generated), so the source title says "accessed <date>, no date shown".

What the page prints: Energy (kcal) per entry ("Nutritional values (per dish)") and nothing else, so protein, carbs and fat stay blank
(docs/DATA.md "Calories-only chains"); every entry also has its allergens (the 14, "Contains" and "May contain"). Every number and
allergen is copied; only names, categories and the choices below are typed here.

Two kinds of entry. A "dish" is a menu item sold as it is (Chicken Bites, Can Coca Cola). An "ingredient" is a part of a build-your-own
burrito, bowl or nachos ("Choose your Protein: CHICKEN 111 kcal"): BarBurrito prints calories for each part and NONE for a finished
burrito, bowl or nachos, so the parts are published as items (non-rankable, category "Build your own: ...") and the note says so.
A part printed identically (name, kcal, allergens, diet marks) in several dishes is one item; a part whose value differs between
dishes gets the dish in its name ("Slaw (Superfood burrito)"). The base of a dish ("Regular Burrito" 289 kcal, printed first, before
the choices, and "The Beast Two Tortilla Wraps" 578 = twice that) is named "(base)" because the fillings are separate entries.

Left out, each checked on every run: the whole BREAKFAST menu (barburrito.co.uk/menu says "BREAKFAST IS SERVED IN AIRPORT STORES ONLY":
single-venue); "Sparkling Wine - Prosecco" (the page prints '-' for its calories); the two entries both named "Bottomless Soda" (18 and
15 kcal, same allergens, nothing to tell them apart). The script stops if a menu's entry count, the JSON-LD cross-check, a section name
or an allergen word is not the one expected.
"""
from __future__ import annotations
import argparse
import collections
import re
import sys
import time
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import barburrito_pages as bp  # noqa: E402
import tenkites_b as tk  # noqa: E402
import tenkites_c as tc  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "barburrito"
BASE_URL = "https://tkmenus.com/barburrito"
CHAIN_PAGE = "https://barburrito.co.uk/menu/"
# label -> (menu id, name on the page's menu list, entries expected on the page, published?)
MENUS = {
    "burritos": ("663d8e54-6c96-48e9-922f-fbdf4d349f28", "Burritos", 187, True),
    "bowls": ("c860a62f-d507-4b0c-9a7e-b74c9a020a6d", "Bowls", 143, True),
    "extras": ("92a108d5-3dc8-4123-8875-b2821d3f3f90", "Main Menu Extras", 17, True),
    "nachos": ("616c73ba-0214-47be-a36b-8a67352a0338", "Nachos", 33, True),
    "sides": ("6b5f2784-19c0-437e-8311-426df565f4d9", "Sides", 40, True),
    "desserts": ("2bb8651d-a09e-4731-a5f8-6269c3c73bb7", "Dessert Menu", 6, True),
    "kids": ("ee30ba61-1941-40b6-8d39-637784325171", "Kids Menu", 71, True),
    "breakfast": ("e2798692-f63d-4a05-843a-f86c7e33f69e", "BREAKFAST", 38, False),  # airport stores only
    "drinks": ("3d57d95f-96b6-410b-b96b-b71536b1211f", "Drinks Menu", 33, True),
}
SOURCE_TITLE = ("BarBurrito allergen & nutritional information (tkmenus.com/barburrito: Burritos, Bowls, Main Menu Extras, Nachos, Sides, "
                "Dessert Menu, Kids Menu and Drinks Menu; accessed {date}, no date shown)")
ALLERGEN_TITLE = "BarBurrito allergen information (tkmenus.com/barburrito, accessed {date}, no date shown)"
NOTE = ("BarBurrito prints calories only, and none for a finished burrito, bowl or nachos: each part (wrap, rice, protein, salsa...) is listed "
        "with its own calories, so add up your build. Breakfast (airport stores only) is not included. Menus can differ between restaurants.")

# ---------------------------------------------------------------- how the page's wording maps to our categories
BUILD = "Build your own: "
CAT_ORDER = [BUILD + c for c in ("bases", "rice", "proteins", "second proteins", "veg and beans", "salsas", "toppings",
                                 "cheese and extras", "sauces")] + [
    "Sides", "Loaded fries", "Dips", "Tortilla & dips", "Extras and pots", "Desserts", "Kids (Bambino)", "Soft drinks", "Alcohol", "Postmix"]
# Same name, different numbers, told apart by what the part is rather than by dish: (name, kcal) -> qualifier
QUALIFIER = {("chorizo", "119"): "protein", ("chorizo", "60"): "extra", ("halloumi in hot honey", "273"): "protein",
             ("halloumi in hot honey", "137"): "extra"}
ROLE_CAT = {"bases": BUILD + "bases", "rice": BUILD + "rice", "protein": BUILD + "proteins", "protein2": BUILD + "second proteins",
            "veg": BUILD + "veg and beans", "salsa": BUILD + "salsas", "toppings": BUILD + "toppings",
            "extras": BUILD + "cheese and extras", "sauce": BUILD + "sauces", "kids": "Kids (Bambino)", "dips": "Dips",
            "tortilla-dips": "Tortilla & dips", "dessert": "Desserts"}
# printed choice title (lower case, brackets and punctuation removed) -> role
SECTION_ROLE = {
    "choice of rice": "rice", "choose your rice": "rice",
    "choose your protein": "protein", "choice of protein": "protein",
    "choose your second protein": "protein2",
    "choose veg": "veg", "choice of veg": "veg",
    "add extra": "extras", "want to add cheese to your dish": "extras", "extra extra": "extras", "add cheese": "extras",
    "choose your salsa": "salsa", "choice of salsa": "salsa", "choose salsa": "salsa",
    "choice of included ingredients": "toppings", "choose your inclusive toppings": "toppings", "included ingredients": "toppings",
    "choose your salad": "toppings", "choose your pickles": "toppings",
    "choose your sauce": "sauce", "choice of sauce": "sauce",
    "chips": "bases", "choice of 3 fillings": "kids",
    "add your choice of dip from £1": "tortilla-dips",
}
# "Choose from:" means different things on different menus
CHOOSE_FROM = {"burritos": "veg", "bowls": "veg", "desserts": "dessert", "kids": "kids"}
DISH = {  # (menu, last course title) -> short dish name used when a part's value differs between dishes
    ("burritos", "CLASSIC BURRITO - Our Original Award Winner!"): "Classic burrito", ("burritos", "Loaded Burrito"): "Loaded burrito",
    ("burritos", "Superfood - Swapping rice for slaw & with guac included"): "Superfood burrito",
    ("burritos", "California - Base of fries & melted cheese"): "California burrito", ("burritos", "THE BEAST BURRITO"): "Beast burrito",
    ("burritos", "LIL' CLASSIC BURRITO"): "Lil' Classic burrito",
    ("bowls", "Naked Bowl - GO NAKED ! Our Classic burrito without the wrap"): "Naked bowl",
    ("bowls", "Superfood - GO NAKED !- With Extra protein, Lower carb base"): "Superfood bowl",
    ("bowls", "California - GO NAKED !"): "California bowl", ("bowls", "Salad Bowl"): "Salad bowl",
    ("bowls", "Loaded Burrito - GO NAKED !"): "Loaded bowl",
    ("nachos", "Classic Nachos"): "Classic nachos", ("nachos", "Loaded Nachos"): "Loaded nachos",
    ("kids", "Bambino Burrito"): "Bambino burrito", ("kids", "Bambino Bowl"): "Bambino bowl", ("kids", "Bambino Nachos"): "Bambino nachos",
    ("kids", "Bambino Dessert"): "Bambino dessert", ("sides", "Sides"): "Sides menu", ("desserts", "Dessert"): "Dessert menu",
    ("sides", "LOADED FRIES"): "Loaded fries", ("sides", "VEGAN LOADED FRIES"): "Vegan loaded fries",
    ("extras", "Extras"): "Extras menu", ("drinks", "Soft drinks"): "Soft drinks", ("drinks", "Alcohol"): "Alcohol",
    ("drinks", "Postmix"): "Postmix",
}
# Entries that are a dish's base: printed first, before the choices, in a block that has choices. Names are ours ("(base)").
BASES = {
    ("burritos", "Regular Burrito"): "Regular Burrito (base)", ("kids", "Regular Burrito"): "Regular Burrito (base)",
    ("burritos", "The Beast Two Tortilla Wraps"): "The Beast Two Tortilla Wraps (base)",
    ("burritos", "Lil' Classic Burrito"): "Lil' Classic Burrito (base)",
    ("burritos", "MEXICAN FRIES"): "Mexican Fries (base)", ("bowls", "MEXICAN FRIES"): "Mexican Fries (base)",
    ("bowls", "Salad Base"): "Salad Base", ("nachos", "Tortilla Chips"): "Tortilla Chips (nachos base)",
    ("kids", "TORTILLA CHIPS"): "Tortilla Chips (Bambino nachos base)", ("sides", "TORTILLA & DIPS"): "Tortilla & Dips (base)",
}
# Standalone dishes: which category each printed name goes in (menu, printed name) -> category. Anything else stops the run.
DISH_CATEGORY = {}
for _n in ("Big Pot Sauce", "Chicken Bites", "Side - Mexican Fries", "Side - Mexican Cheesy Fries", "Side - Tortilla Chips Plain"):
    DISH_CATEGORY[("sides", _n)] = "Sides"
for _n in ("CHICKEN", "Extra Mexican Veg", "CHORIZO", "Extra Pork", "BEEF", "HALLOUMI IN HOT HONEY", "Extra VG Steak", "Guacamole",
           "Extra Cheese Sauce"):
    DISH_CATEGORY[("sides", _n)] = "Extras and pots"
for _n in ("Loaded Fries - Chicken", "Loaded Fries - Veg & Guac", "Loaded Fries - Chorizo", "Loaded Fries - Pork", "Loaded Fries - Beef",
           "Loaded Fries - VG Steak", "Loaded Fries - Halloumi in Hot Honey", "Loaded Fries - Veg & Guac VG"):
    DISH_CATEGORY[("sides", _n)] = "Loaded fries"
SINGLE_DISH_CATEGORY = {"extras": "Extras and pots", "desserts": "Desserts"}
KIDS_DISH_CATEGORY = "Kids (Bambino)"
# Printed text we tidy (plain wording only, no numbers): printed -> shown
RENAME = {
    "Btl Coca Cola 0.5L": "Bottle Coca Cola 0.5L", "Btl Dr Pepper 0.5L": "Bottle Dr Pepper 0.5L", "Btl Coke Zero 0.5L": "Bottle Coke Zero 0.5L",
    "Btl Diet Coke 0.5L": "Bottle Diet Coke 0.5L", "Btl Fanta 0.5L": "Bottle Fanta 0.5L", "Btl Sprite 0.5L": "Bottle Sprite 0.5L",
    "CHURROS & DULCE DU LECHE SAUCE": "Churros & Dulce de Leche Sauce",
}
EXCLUDED_NO_KCAL = {"Sparkling Wine - Prosecco"}
EXCLUDED_AMBIGUOUS = ("drinks", "Bottomless Soda")  # printed twice, 18 and 15 kcal, nothing tells them apart
# Entries the page contradicts itself about (kept in items.csv, not published; nothing is corrected). Keys are the item names written below.
_VEGAN_FRIES = ("Listed under the chain's own 'VEGAN LOADED FRIES' heading, but the page's allergens for it include Milk and its 'Suitable for' "
                "line says Vegetarians only (a plain vegan dish would say Vegans): the page is inconsistent about whether this is vegan, and "
                "neither reading is chosen. Restore by deleting this line once BarBurrito corrects the page.")
HOLDBACK = {
    "Loaded Fries - VG Steak (Vegan loaded fries)": _VEGAN_FRIES,
    "Loaded Fries - Veg & Guac VG": _VEGAN_FRIES,
}
EMOJI = re.compile(r"[☀-➿\U0001F300-\U0001FAFF️]")


SMALL_WORDS = {"a", "an", "and", "of", "the", "with", "in", "on", "to", "for", "or", "de"}
KEEP_CAPS = {"BBQ", "VG", "CBD"}


def tidy(name: str) -> str:
    """Plain wording only: emoji removed; words printed in capitals become Title Case (BBQ, VG and CBD stay as the chain writes them)."""
    words = re.sub(r"\s+", " ", EMOJI.sub("", name)).strip().split(" ")
    out = []
    for i, w in enumerate(words):
        core = re.sub(r"[^A-Za-z]", "", w)
        if len(core) > 1 and core.isupper() and core not in KEEP_CAPS:
            w = w.lower()
            k = len(w) - len(w.lstrip("("))
            if not (i and w.strip("()") in SMALL_WORDS):
                w = w[:k] + w[k:k + 1].upper() + w[k + 1:]
        out.append(w)
    return " ".join(out)


def norm(name: str) -> str:
    return tk.norm_name(name)


def section_key(raw: str) -> str:
    s = re.sub(r"\(.*?\)", "", raw).lower()
    s = re.sub(r"[?:]", "", s)
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- reading
def fetch_pages(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for label, (guid, _, _, _) in MENUS.items():
        out = dest / f"{label}.html"
        subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", tk.USER_AGENT, "-o", str(out), f"{BASE_URL}?mguid={guid}"], check=True)
        time.sleep(1.2)


def check_page(label: str, path: Path, recs: list[dict]) -> None:
    _, name, expected, _ = MENUS[label]
    if tk.page_title(path) != name:
        raise SystemExit(f"{label}: the page is titled {tk.page_title(path)!r}, expected {name!r}")
    if len(recs) != expected:
        raise SystemExit(f"{label}: {len(recs)} entries, this script expects {expected}: the menu changed, re-check the mappings")
    # second reading of the same numbers: the page's schema.org data (its order differs on the Sides menu, so compare as sets)
    ld = collections.Counter((n, c.replace(" calories", "").strip()) for n, c in bp.json_ld_names(path))
    dom = collections.Counter()
    for r in recs:
        e = r["nutrients"].get("Energy (kcal)", "")
        shown = re.sub(r"\s*kcal$", "", r["shown"])
        if r["shown"] and shown != e:
            raise SystemExit(f"{label}: {r['name']!r} shows {r['shown']!r} beside its name but {e!r} in its table")
        if set(r["nutrients"]) != {"Energy (kcal)"}:
            raise SystemExit(f"{label}: {r['name']!r} prints {sorted(r['nutrients'])}: this chain printed only Energy (kcal), map the new columns first")
        # the JSON-LD leaves a zero out (no calories at all), so a printed 0 matches an empty value there
        dom[(r["name"], "" if e == "0" else ("" if e == "-" else e))] += 1
    if ld != dom:
        raise SystemExit(f"{label}: the page's JSON-LD and its pop-ups disagree: only in JSON-LD {sorted((ld - dom).items())[:5]}, "
                         f"only in pop-ups {sorted((dom - ld).items())[:5]}")


def role_of(label: str, rec: dict, block_has_choices: bool) -> str:
    if rec["root"]:
        return "bases" if block_has_choices else "dips"
    key = section_key(rec["section"])
    if key == "choose from":
        if label not in CHOOSE_FROM:
            raise SystemExit(f"{label}: 'Choose from' is not mapped for this menu ({rec['name']!r})")
        return CHOOSE_FROM[label]
    if key not in SECTION_ROLE:
        raise SystemExit(f"{label}: choice title {rec['section']!r} (for {rec['name']!r}) is not in SECTION_ROLE: map it after reading the page")
    return SECTION_ROLE[key]


def allergen_key(a: dict) -> tuple:
    return tuple(tuple(sorted(a[k])) for k in ("contains", "may_contain", "cereals", "nuts"))


def collect(pages: Path) -> tuple[list[dict], list[str], dict]:
    """Distinct entries (merged where printed identically) in page order, plus report lines and counts."""
    report: list[str] = []
    counts = {"read": 0, "breakfast": 0, "no kcal": 0, "ambiguous": 0, "merged": 0}
    groups: dict = {}
    order: list = []
    for label, (_, _, _, published) in MENUS.items():
        path = pages / f"{label}.html"
        recs = bp.read_page(path)
        check_page(label, path, recs)
        counts["read"] += len(recs)
        if not published:
            counts["breakfast"] += len(recs)
            continue
        # which byo blocks have choices (a root with choices is a "base", a root alone is a dish)
        block_sizes: dict = collections.Counter()
        for r in recs:
            if r["kind"] == "ingredient" and not r["root"]:
                block_sizes[r["block"]] += 1
        for r in recs:
            where = f"{label} {r['name']}"
            e = r["nutrients"]["Energy (kcal)"]
            if r["name"] in EXCLUDED_NO_KCAL:
                if e != "-":
                    raise SystemExit(f"{where}: now prints {e!r} kcal, it was left out because it printed '-'")
                counts["no kcal"] += 1
                report.append(f"left out (page prints '-' for calories): {r['name']}")
                continue
            if e == "-" or not re.fullmatch(r"\d+", e):
                raise SystemExit(f"{where}: calories {e!r} are not a whole number: check the page")
            if (label, r["name"]) == EXCLUDED_AMBIGUOUS:
                counts["ambiguous"] += 1
                continue
            allerg = tk.allergens_from_rec(r, where)
            if allerg is None:
                raise SystemExit(f"{where}: allergens could not be read")
            course_last = r["course"][-1] if r["course"] else ""
            if (label, course_last) not in DISH:
                raise SystemExit(f"{where}: course {course_last!r} is not in DISH: name it after reading the page")
            if r["kind"] == "ingredient":
                has_choices = block_sizes[r["block"]] > 0
                role = role_of(label, r, has_choices)
                category = ROLE_CAT[role]
                printed = r["name"]
                if role == "bases":
                    if (label, printed) not in BASES:
                        raise SystemExit(f"{where}: a base not in BASES")
                    name = BASES[(label, printed)]
                else:
                    name = tidy(printed)
                if role == "dessert" and label == "desserts":
                    category = "Desserts"
            else:
                role = "dish"
                printed = r["name"]
                if label in SINGLE_DISH_CATEGORY:
                    category = SINGLE_DISH_CATEGORY[label]
                elif label == "kids":
                    category = KIDS_DISH_CATEGORY
                elif label == "drinks":
                    category = {"Soft drinks": "Soft drinks", "Alcohol": "Alcohol", "Postmix": "Postmix"}[course_last]
                else:
                    if (label, printed) not in DISH_CATEGORY:
                        raise SystemExit(f"{where}: a dish not in DISH_CATEGORY")
                    category = DISH_CATEGORY[(label, printed)]
                name = tidy(RENAME.get(printed, printed))
            veg = bool(re.search(r"Vegetarian|Vegan", r["suitable"]))
            key = (norm(name), e, allergen_key(allerg), veg, r["suitable"])
            use = {"menu": label, "course": course_last, "dish": DISH[(label, course_last)], "role": role, "printed": printed,
                   "section": r["section"], "category": category}
            if key in groups:
                g = groups[key]
                g["uses"].append(use)
                counts["merged"] += 1
                if g["desc"] != r["desc"]:
                    g["desc"] = (g["desc"] + " | " + r["desc"]).strip(" |")
                continue
            groups[key] = {"name": name, "kcal": e, "allergens": allerg, "veg": veg, "desc": r["desc"], "kind": r["kind"], "uses": [use],
                           "category": category}
            order.append(key)
    return [groups[k] for k in order], report, counts


def settle_names(entries: list[dict]) -> None:
    """Give every distinct entry a unique name: when the same name stands for different numbers, say which. The entry used in the
    most dishes keeps the plain name; the others name their dish (or the qualifier in QUALIFIER)."""
    by_name: dict[str, list[dict]] = collections.defaultdict(list)
    for e in entries:
        by_name[norm(e["name"])].append(e)
    for key, grp in by_name.items():
        if len(grp) == 1:
            continue
        plain = grp[0]["name"]
        if all((key, g["kcal"]) in QUALIFIER for g in grp):
            for g in grp:
                g["name"] = f"{plain} ({QUALIFIER[(key, g['kcal'])]})"
            continue
        grp.sort(key=lambda g: -len({u["dish"] for u in g["uses"]}))
        names = [plain]
        for g in grp[1:]:
            dishes = list(dict.fromkeys(u["dish"] for u in g["uses"]))
            names.append(f"{plain} ({' / '.join(dishes[:2])}{f' +{len(dishes) - 2} more' if len(dishes) > 2 else ''})")
        if len({norm(n) for n in names}) != len(grp):
            raise SystemExit(f"names still clash for {plain!r}: {names}")
        for g, n in zip(grp, names):
            g["name"] = n


def serving_of(name: str) -> str:
    m = re.search(r"\b(\d+(?:\.\d+)?\s?(?:ml|L))\b", name)
    if m:
        return m.group(1)
    m = re.match(r"^(\d+) Churros\b", name)
    return f"{m.group(1)} churros" if m else ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder with the nine saved pages (burritos.html, ...)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the nine pages into --pages first (one request per second)")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    if args.fetch:
        fetch_pages(args.pages)
    entries, report, counts = collect(args.pages)
    settle_names(entries)

    items, unspecified = [], []
    for e in entries:
        name = e["name"]
        text = name + " " + e["desc"] + " " + " ".join(u["printed"] for u in e["uses"])
        text = re.sub(r"\bVG\b", "Vegan", text)  # the chain's own "VG" (vegan) steak, marked Vegetarians/Vegans on the page
        tags, conflict = tk.diet_tags(text, e["veg"])
        meat, unsp = tc.meat_tags(text, vegetarian=e["veg"])
        if unsp:
            unspecified.append(name)
        used = "; ".join(sorted({f"{u['menu']}/{u['dish']}/{u['section'] or 'base'}" for u in e["uses"]}))
        notes = f"Printed as {' / '.join(dict.fromkeys(u['printed'] for u in e['uses']))}; seen in: {used}"
        if conflict:
            notes += f"; {conflict}"
        items.append({"name": name, "category": e["category"], "serving": serving_of(name), "calories": e["kcal"],
                      "tags": tags, "rankable": False, "notes": notes, "allergens": e["allergens"]})
    missing_hold = sorted(set(HOLDBACK) - {i["name"] for i in items})
    if missing_hold:
        raise SystemExit(f"HOLDBACK names no longer on the menu (the pages changed): {missing_hold}")
    rank = {c: i for i, c in enumerate(CAT_ORDER)}
    unknown = sorted({i["category"] for i in items} - set(rank))
    if unknown:
        raise SystemExit(f"categories not in CAT_ORDER: {unknown}")
    items.sort(key=lambda i: rank[i["category"]])  # stable: page order inside a category
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="BarBurrito", cuisine="Mexican", source_title=SOURCE_TITLE.format(date=args.checked_on),
        source_url=BASE_URL, checked_on=args.checked_on, aliases=["barburrito", "bar burrito", "bar burrito uk"], items=items, out=args.out,
        note=NOTE, nutrition_level="calories", holdback=[(slug(n), why) for n, why in HOLDBACK.items()],
        allergen_guide={"title": ALLERGEN_TITLE.format(date=args.checked_on), "url": BASE_URL, "checked_on": args.checked_on,
                        "may_contain_published": True})
    for label in MENUS:
        p = args.pages / f"{label}.html"
        print(f"{label:10} sha256 {sha256_file(p)}  {tk.page_title(p)}")
    print("\n".join(report))
    print(f"entries read {counts['read']}: breakfast (airport only) {counts['breakfast']}, no calories {counts['no kcal']}, "
          f"ambiguous Bottomless Soda {counts['ambiguous']}, identical repeats merged {counts['merged']}")
    print("meat type not stated:", unspecified or "none")
    print("\n".join(tk.ALLERGEN_NOTES))
    cats = collections.Counter(i["category"] for i in items)
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {cats[c]}" for c in CAT_ORDER if cats[c]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
