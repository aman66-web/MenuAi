#!/usr/bin/env python3
"""Build data/source/bills/ from Bill's own allergen & nutrition pages (hosted by Ten Kites).

    python3 tools/uk_extract/bills.py --pages DIR --checked-on 2026-10-08 [--fetch]

DIR holds the 12 saved menu pages (bills_m00.html ... bills_m11.html); --fetch downloads them first (one request per page, one
second apart). The pages are the "Allergen & Nutritional" menus Bill's links from https://www.bills-website.co.uk/menus:
    https://menus.tenkites.com/bills/bills            (opens on Breakfast)
    https://menus.tenkites.com/bills/bills?mguid=...   (the other 11 menus: see MENUS)
Bill's prints ONE nutrient per dish, "Energy (kCal)" under "Nutrition (per portion)": no protein, carbs, fat, salt, sugar or
kJ anywhere. So this is a CALORIES-ONLY chain (docs/DATA.md): protein, carbs and fat stay blank, every item is not rankable.
The script stops if any pop-up prints another nutrient, so a richer page is noticed.

Every dish pop-up (and every "build your own" option: sizes, add-ons, milks) is read by bills_pages.py, in page order, and the
calories are copied as printed ("1,440" -> "1440"). The reading is cross-checked against the schema.org menu the same page
embeds: every number in that data must be on a pop-up with the same name. Only names' capitalisation, categories and the
choices below are typed by hand. The run stops if a menu gains or loses a dish, a menu tab appears or goes, a pop-up prints
another nutrient or a name can't be made unique.

Allergens (docs/DATA.md "Allergens"): complete. Each pop-up prints "Contains: ..." (cereals and tree nuts named in brackets) and
"May contain: ...", and the dish carries the label ids the page's own allergen filter reads; tenkites_c.allergens_checked
cross-checks the two for every dish (and stops if they disagree). "This dish contains none of the listed allergens" is an
empty contains list. "Vegetarian" / "Vegan" in the pop-up's own "Suitable for:" line is the vegetarian tag.

What is left out, and why (each is counted in the run's report):
- 84 pop-ups (58 names) print "-" (alcoholic drinks, wine, beer, one Cawston Press juice): not published, so no calories to copy.
- Sunday roasts and the sides under them: the page says "Available in selected trial sites only" (two menus).
- Pancake Parlour (Kids menus): "Available at selected sites".
- The Croissant: "(Available in Lewes only)".
- One option whose name is "(VG Optiotn available)": not a dish name, so it can't be matched to a dish.
Held back (holdback.csv): "Add ..." options whose value is larger than the dish they are added to, so the page's own number
can't be the add-on alone (see HOLDBACK_NOTE); nothing is corrected.
"""
from __future__ import annotations
import argparse
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import bills_pages as bp  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "bills"
BASE = "https://menus.tenkites.com/bills/bills"
# (file, tab title, mguid or None for the page that opens by default, pop-ups the page holds incl. the "-" ones)
MENUS = [
    ("bills_m00.html", "Breakfast", None, 54),
    ("bills_m01.html", "Brunch, Lunch & Dinner", "3a1c6ec8-1bbc-4c24-9bf4-f9933f0710c3", 129),
    ("bills_m02.html", "Set Heritage Lunch Menu", "f0cad41b-b4a4-4d8f-a841-a1ad24f5a7e5", 48),
    ("bills_m03.html", "Drinks Menu", "ccde1fc3-8911-40ea-ad7f-30459b52a142", 146),
    ("bills_m04.html", "Desserts", "dcde345e-793a-41a6-beb6-b5f947a6f67b", 16),
    ("bills_m05.html", "Kids Menu", "7e3fa419-444f-4efe-895e-6800131e853f", 85),
    ("bills_m06.html", "Gluten-Free Kids Menu", "79c37770-b5b6-4a32-963f-fcf38f09c69b", 59),
    ("bills_m07.html", "Gluten Free Breakfast Menu", "ba7b7183-8ecc-4d3d-a2eb-63b9f3df4def", 40),
    ("bills_m08.html", "Gluten-Free Brunch, Lunch & Dinner", "1fbc5bf0-b7de-4f01-953a-a4a5a19234a7", 76),
    ("bills_m09.html", "Pre-Theatre Menu", "aeb32af6-6ed8-482a-bc45-607683b05c6e", 45),
    ("bills_m10.html", "Christmas Set Menu", "78616a1b-becb-46c2-a454-feccf348b346", 18),
    ("bills_m11.html", "GF Christmas Set Menu", "9b5db779-bcbe-4a62-b033-d32a7768dae9", 14),
]
SOURCE_TITLE = ("Bill's Allergen & Nutritional menus, all 12 menu tabs (Ten Kites pages linked from bills-website.co.uk/menus; "
                "accessed 2026-10-08, no date shown)")
ALLERGEN_TITLE = ("Bill's Allergen & Nutritional menus (Ten Kites): per-dish allergens and 'may contain' on the same pages "
                  "(accessed 2026-10-08, no date shown)")
NOTE = ("Bill's prints calories only, per portion, so protein, carbs and fat are not published. Menu items may vary per location. "
        "Alcoholic drinks (and one juice) print no calories and are not listed; Sunday roasts and the Kids pancake parlour are on "
        "selected sites only and are left out.")
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None)}   # printed with a space after the slash
ENERGY = "Energy (kCal)"

# ---------------------------------------------------------------- what is left out (checked on every run)
EXCLUDE_PATH = {"SUNDAY ROASTS": "page says 'Available in selected trial sites only'",
                "Pancake Parlour": "page says 'Available at selected sites'"}
EXCLUDE_NAME = {("CROISSANT", "Lewes"): "printed '(Available in Lewes only)'",
                ("(VG Optiotn available)", ""): "not a dish name: an option label with no dish to attach it to"}
LIMIT_WORDS = re.compile(r"\b(only|selected)\b", re.I)
# held back after the independent accuracy re-read of 2026-10-08 (data/audit/verified/bills.json): the page's allergen row
# contradicts the dish's own name and we can't tell which is right, so neither is published (nothing is corrected)
ALLERGEN_HOLDBACK = {
    "Hazelnut Syrup": ("allergen row contradicts the dish name/ingredients: the page prints 'This dish contains none of the listed "
                       "allergens' (no tree nuts) for a hazelnut-named syrup and nothing on the page says the name is only a flavour"),
}

# ---------------------------------------------------------------- names and categories
ACRONYMS = {"BBQ", "GF", "VG", "SMK", "AVO", "G&T", "CBD", "IPA", "UK"}
SMALL_WORDS = {"a", "an", "and", "of", "the", "with", "in", "on", "to", "for", "or", "&"}
# the section's own words added to a dish name that doesn't carry them (the section title says what the dish is)
SECTION_SUFFIX = {"PANCAKES": ("PANCAKE", " Pancakes"), "VEGAN PANCAKES": ("PANCAKE", " Pancakes"),
                  "SHAWARMAS": ("SHAWARMA", " Shawarma"), "BILL'S SHAWARMAS": ("SHAWARMA", " Shawarma")}
# options whose own label is not a dish name: (printed name, printed calories) -> name
OVERRIDES = {
    ("SEMI-SKIMMED", "143"): "Iced Berry Matcha with Semi-Skimmed Milk", ("SKIMMED", "135"): "Iced Berry Matcha with Skimmed Milk",
    ("Coconut", "200"): "Iced Berry Matcha with Coconut Milk", ("OAT", "181"): "Iced Berry Matcha with Oat Milk",
    ("SOYA", "134"): "Iced Berry Matcha with Soya Milk", ("With Cream +40p", "331"): "Hot Chocolate with Cream",
    # (until 2026-10-07 the page printed "ICE CREAMS & SORBETS" twice, told apart here by the description line; since the 2026-10-08
    # re-read it prints "GLUTEN FREE ..." and "VEGAN & GLUTEN FREE ICE CREAMS & SORBETS (no wafer)", so no override is needed)
}
CATEGORY_NAMES = {"Mini Dessert & a Hot Drink £7.50": "Mini desserts & a hot drink", "BILL'S SHAWARMAS": "Shawarmas"}
KIDS_MENUS = {5, 6}
SCOPE = {5: "kids", 6: "gluten-free kids", 7: "gluten-free", 8: "gluten-free", 10: "Christmas", 11: "gluten-free Christmas"}
MENU_LABEL = {0: "breakfast", 1: "brunch, lunch & dinner", 2: "set lunch", 3: "drinks", 4: "desserts", 7: "breakfast",
              8: "brunch, lunch & dinner", 9: "pre-theatre"}
LIMITED_SECTIONS = {"SPECIALS", "DRINK SPECIALS"}
LIMITED_MENUS = {10, 11}   # "Available 12th Nov - 30th Dec"


def _cap(part: str) -> str:
    """'(aperol' style: first letter upper-case, the rest lower-case, brackets and digits left in place."""
    m = re.search(r"[A-Za-z\u00c0-\u00ff]", part)
    if not m:
        return part
    i = m.start()
    return part[:i] + part[i].upper() + part[i + 1:].lower()


def tidy(raw: str) -> str:
    """'BILL'S BIG BRUNCH' -> "Bill's Big Brunch". Words the chain already prints with a lower-case letter are left alone."""
    s = re.sub(r"\s+", " ", raw.replace("’", "'").replace("‘", "'")).strip()
    out = []
    for i, w in enumerate(s.split(" ")):
        core = w.strip("()")
        if w != w.upper() or not re.search(r"[A-Za-zÀ-ÿ]", w) or core in ACRONYMS:
            out.append(w)
        elif i and core.lower() in SMALL_WORDS:
            out.append(w.lower())
        else:
            out.append("-".join(_cap(p) for p in w.split("-")))
    return " ".join(out)


def sentence(raw: str) -> str:
    """'MAINS & SALADS' -> 'Mains & salads' (acronyms kept)."""
    words = tidy(raw).split(" ")
    out = [w if w.strip("()") in ACRONYMS else w.lower() for w in words]
    s = " ".join(out)
    return s[:1].upper() + s[1:]


def category_of(r: dict) -> str:
    if r["menu"] in KIDS_MENUS:
        top = sentence(r["path"][0])
        return "Kids " + top[:1].lower() + top[1:]
    inner = r["path"][-1]
    return CATEGORY_NAMES.get(inner, sentence(inner))


def serving_of(name_raw: str, desc: list) -> str:
    """A serving only where the page states one: pancake stacks, Small/Large, scoops, volumes."""
    d0 = desc[0] if desc else ""
    m = re.match(r"^(\d) ?stack\b", d0, re.I)
    if m:
        return f"{m.group(1)} stack"
    if re.match(r"^(Small|Large)\b", d0):
        return d0.split()[0]
    m = re.search(r"\((\d+ scoops?)\)", name_raw, re.I)
    if m:
        return m.group(1).lower()
    m = re.search(r"\b(\d+ ?ml)\b", name_raw) or re.match(r"^.*?\b(\d+ ?ml)\b", d0)
    if m:
        return m.group(1)
    m = re.match(r"^(.*\S)\s+(SMALL|LARGE)$", name_raw)
    return m.group(2).capitalize() if m else ""


def base_name(r: dict, group_names: Counter) -> str:
    raw = r["name"]
    kcal = r["nutrients"][ENERGY]
    if (raw, kcal) in OVERRIDES:
        return OVERRIDES[(raw, kcal)]
    name = tidy(raw)
    d0 = r["desc"][0] if r["desc"] else ""
    m = re.match(r"^(.*\S)\s+(SMALL|LARGE)$", raw)
    if m:                                               # 'CRISPY CALAMARI SMALL'
        return f"{tidy(m.group(1))} ({m.group(2).lower()})"
    sect = r["path"][-1]
    if sect in SECTION_SUFFIX and SECTION_SUFFIX[sect][0] not in raw.upper():
        name += SECTION_SUFFIX[sect][1]
    st = re.match(r"^(\d) ?stack\b", d0, re.I)
    if st:                                              # pancakes: 3 stack / 5 stack
        return f"{name} ({st.group(1)} stack)"
    if re.match(r"^(Small|Large)$", d0):                # 'Bill's Chicken & Sesame Dumplings' Small / Large
        return f"{name} ({d0.lower()})"
    if r["kind"] == "option" and group_names[(r["group"], raw)] > 1 and d0:
        return f"{name} ({d0})"                         # wings: 'Small buffalo with blue cheese & celery', burger tray wings
    return name


# ---------------------------------------------------------------- reading
def check_menu_tabs(text: str, where: str) -> None:
    """The page lists its menu tabs: stop if they are not the 12 this script was written for."""
    root = tk.parse_html(text)
    tabs = [(n.attrs.get("data-menu-identifier", ""), n.text()) for n in root.find_all("k10-menu-selector__option-name", "a")]
    names = [t[1] for t in tabs]
    ids = [t[0] for t in tabs]
    if ids != [m[2] or ids[0] for m in MENUS]:
        raise SystemExit(f"{where}: the page's menu tab ids changed: {ids}")
    if names != [m[1] for m in MENUS]:
        raise SystemExit(f"{where}: the page's menu tabs are now {names}; this script expects {[m[1] for m in MENUS]}. "
                         "A menu was added or removed: re-check MENUS.")


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def read_all(pages_dir: Path) -> tuple[list, list]:
    rows, report = [], []
    for i, (fname, title, _, expected) in enumerate(MENUS):
        text = (pages_dir / fname).read_text(encoding="utf-8")
        if tk.page_title(text) != title:
            raise SystemExit(f"{fname}: the page is titled {tk.page_title(text)!r}, expected {title!r}")
        if i == 0:
            check_menu_tabs(text, fname)
        got = bp.read_menu(text, i)
        if len(got) != expected:
            raise SystemExit(f"{fname} ({title}) has {len(got)} pop-ups but this script expects {expected}: the menu changed, "
                             "re-check the lists in this script before running again.")
        # second reading of the same page: its schema.org menu. Every number there must be on a pop-up with the same name.
        html_numbers = Counter((norm(r["name"]), r["nutrients"].get(ENERGY, "").replace(",", "")) for r in got)
        ld = Counter((norm(n), c.replace(",", "")) for _, n, c in bp.json_ld_items(text) if c)
        missing = ld - html_numbers
        if missing:
            raise SystemExit(f"{fname}: numbers in the page's embedded menu that the pop-ups don't carry: {dict(missing)}")
        rows += got
    return rows, report


# ---------------------------------------------------------------- items
def meat_text(r: dict) -> str:
    return " ".join([r["name"], *r["desc"], *r["group_info"]])


def build(pages_dir: Path) -> tuple[list, list, list]:
    rows, report = read_all(pages_dir)
    group_names = Counter((r["group"], r["name"]) for r in rows if r["kind"] == "option")
    skipped_dash, excluded = [], []
    cands = []
    for r in rows:
        if set(r["nutrients"]) != {ENERGY}:
            raise SystemExit(f"menu {r['menu']} {r['name']!r}: the pop-up prints {sorted(r['nutrients'])}, not only {ENERGY!r}: "
                             "Bill's now publishes more than calories; extend this script to copy it.")
        kcal = r["nutrients"][ENERGY]
        if kcal == "-":
            skipped_dash.append(tidy(r["name"]))
            continue
        if not tk.is_number(kcal):
            raise SystemExit(f"menu {r['menu']} {r['name']!r}: calories {kcal!r} is not a number or '-'")
        text = " ".join([*r["desc"], *r["group_info"]])
        why = next((w for p, w in EXCLUDE_PATH.items() if p in r["path"]), None)
        if why is None:
            why = next((w for (n, key), w in EXCLUDE_NAME.items() if r["name"] == n and (key in text or key == "")), None)
        if why:
            excluded.append(f"{tidy(r['name'])} (menu {r['menu']}, {' > '.join(r['path'])}): {why}")
            continue
        if LIMIT_WORDS.search(text):
            raise SystemExit(f"menu {r['menu']} {r['name']!r} prints a limit this script doesn't know: {text!r}")
        veg = bool(re.search(r"Vegetarian|Vegan", re.split(r"Contains:|May contain:|This dish", r["suitable"].replace("Suitable for:", ""))[0]))
        meat, unspecified = tk.meat_tags(r["name"], " ".join([*r["desc"], *r["group_info"]]), vegetarian=veg)
        allergens = tk.allergens_checked(r, f"menu {r['menu']} {r['name']}", ALLERGEN_EXTRA)
        name = base_name(r, group_names)
        cands.append({"row": r, "base": name, "kcal": kcal.replace(",", ""), "allergens": allergens, "veg": veg, "meat": tuple(meat),
                      "unspecified": unspecified, "serving": serving_of(r["name"], r["desc"]), "category": category_of(r),
                      "limited": r["menu"] in LIMITED_MENUS or any(p in LIMITED_SECTIONS for p in r["path"]),
                      "scope": scope_of(r)})
    # same dish printed on several menus with the same number and allergens is one item
    def akey(a):
        return None if a is None else (tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])), tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])))
    by_name: OrderedDict = OrderedDict()
    for c in cands:
        variants = by_name.setdefault(c["base"], OrderedDict())
        v = variants.setdefault((c["kcal"], akey(c["allergens"])), [])
        if v and (v[0]["veg"], v[0]["meat"], v[0]["serving"]) != (c["veg"], c["meat"], c["serving"]):
            raise SystemExit(f"{c['base']}: the same dish and number is tagged differently on two menus")
        v.append(c)
    items, merged = [], 0
    for base, variants in by_name.items():
        vs = list(variants.values())
        quals = qualifiers(vs) if len(vs) > 1 else [vs[0][0]["scope"] if "bigger eater" in vs[0][0]["scope"] else ""]
        for v, q in zip(vs, quals):
            first = v[0]
            name = (base[:-1] + f", {q})" if base.endswith(")") else f"{base} ({q})") if q else base
            merged += len(v) - 1
            places = list(OrderedDict.fromkeys(f"{bp_title(x['row']['menu'])} > {x['row']['path'][-1]}" for x in v))
            note = "Printed in: " + "; ".join(places)
            if len(variants) > 1:
                note += ". Another dish of the same name has a different number, so the name carries a qualifier"
            extra = [x for x in first["row"]["desc"][1:2] if re.match(r"^With gluten free oats", x, re.I)]
            if extra:
                note += f". Page also says: {extra[0]}"
            items.append({"name": name, "category": first["category"], "serving": first["serving"], "calories": first["kcal"],
                          "tags": "|".join((["vegetarian"] if first["veg"] else []) + list(first["meat"])),
                          "limited_time": first["limited"], "rankable": False, "notes": note, "allergens": first["allergens"],
                          "_unspecified": first["unspecified"], "_row": first["row"]})
    names = [i["name"] for i in items]
    dup = [n for n, k in Counter(n.lower() for n in names).items() if k > 1]
    if dup:
        raise SystemExit(f"names are not unique after qualifying: {dup}: add a rule or an override")
    items = hold_back_and_clean(items, rows, report)
    report.append(f"printed '-' (not published, left out): {len(skipped_dash)} pop-ups, {len(set(skipped_dash))} names: " + ", ".join(sorted(set(skipped_dash))))
    report += [f"left out: {e}" for e in excluded]
    report.append(f"rows merged because the same dish has the same number and allergens on another menu: {merged}")
    return items[0], items[1], report


def scope_of(r: dict) -> str:
    """What kind of menu the dish is on: kids, gluten-free, Christmas; and Bigger Eater upsizes ('Increase your ... for £2')."""
    scope = SCOPE.get(r["menu"], "")
    if not scope and any(re.search(r"gluten[ -]free", p, re.I) for p in r["path"]):
        scope = "gluten-free"
    if any(re.search(r"increase your", p, re.I) for p in r["path"]):
        scope = (scope + ", " if scope else "") + "bigger eater"
    return scope


def bp_title(menu: int) -> str:
    return MENUS[menu][1]


MENU_PRIORITY = [0, 1, 4, 3, 2, 9, 7, 8, 5, 6, 10, 11]


def qualifiers(variants: list) -> list:
    """Qualifiers for the variants of one dish name (each variant = the candidates that share its number and allergens). The one
    ordinary-menu variant keeps the plain name; the others are told apart by what they are (kids, gluten-free, Christmas, bigger
    eater), then the menu, then the section. Uniqueness is checked by the caller."""
    n = len(variants)
    scope = [v[0]["scope"] for v in variants]

    def label(i):
        menus = {c["row"]["menu"] for c in variants[i]}
        return MENU_LABEL.get(next(m for m in MENU_PRIORITY if m in menus), "")

    def section(i):
        sec = sentence(variants[i][0]["row"]["path"][-1])
        return sec[:1].lower() + sec[1:] if sec.split(" ")[0] not in ACRONYMS else sec

    def join(*parts):
        return ", ".join(p for p in parts if p)

    res = list(scope)
    for step in (label, section, lambda i: join(label(i), section(i))):
        snap = list(res)
        for i in range(n):
            if snap.count(snap[i]) > 1:
                res[i] = join(scope[i], step(i))
    return res


def hold_back_and_clean(items: list, rows: list, report: list) -> tuple:
    """Hold back 'Add ...' options whose number is larger than the base dish of their group."""
    base_kcal = {}
    for r in rows:
        if r["kind"] == "option" and r["group"] not in base_kcal and not r["name"].upper().startswith("ADD ") and r["nutrients"][ENERGY] != "-" and tk.is_number(r["nutrients"][ENERGY]):
            base_kcal[r["group"]] = (tidy(r["name"]), int(r["nutrients"][ENERGY].replace(",", "")))
    holdback = []
    for it in items:
        r = it.pop("_row")
        if it["name"] in ALLERGEN_HOLDBACK:
            holdback.append((slug(it["name"]), ALLERGEN_HOLDBACK[it["name"]]))
        if it.pop("_unspecified"):
            report.append(f"meat type not stated: {it['name']}")
        if r["kind"] == "option" and r["name"].upper().startswith("ADD ") and r["group"] in base_kcal:
            b_name, b = base_kcal[r["group"]]
            if int(it["calories"]) > b:
                holdback.append((slug(it["name"]),
                                 f"printed as an add-on to {b_name} ({b} kcal) but its number ({it['calories']} kcal) is larger than the dish itself, "
                                 "so it can't be the add-on alone (looks like the dish with the add-on); the page doesn't say"))
    return items, holdback


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    ap.add_argument("--fetch", action="store_true", help="download the 12 pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for fname, _, guid, _ in MENUS:
            tk.fetch(BASE if guid is None else f"{BASE}?mguid={guid}", args.pages / fname)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Bill's", cuisine="British", source_title=SOURCE_TITLE, source_url=BASE,
                             checked_on=args.checked_on, aliases=["bill's", "bills", "bills restaurant", "bill's restaurant"],
                             items=items, out=args.out, note=NOTE, holdback=holdback, nutrition_level="calories",
                             allergen_guide={"title": ALLERGEN_TITLE, "url": BASE, "checked_on": args.checked_on, "may_contain_published": True})
    for fname, _, _, _ in MENUS:
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
