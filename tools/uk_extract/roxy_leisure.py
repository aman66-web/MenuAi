#!/usr/bin/env python3
"""Build data/source/roxy-leisure/ from Roxy Ball Room / Roxy Lanes' own allergen & nutrition pages (hosted by Ten Kites).

    python3 tools/uk_extract/roxy_leisure.py --pages DIR --checked-on 2026-10-09 [--fetch] [--explain]

Roxy Leisure (roxyleisure.co.uk) runs about 20 venues; each venue's page on https://roxyleisure.co.uk/menu/<venue>-menu/ has an
"ALLERGEN INFO" link to its own Ten Kites page https://menus.tenkites.com/roxyleisure/<venue>, with one tab per menu (food,
"Roxy Drinks (Drinks 2026)", "Roxy takes Kentucky ..."). Every dish prints "Nutrition values per serving" (energy kcal, fat,
saturates, carbohydrate, sugars, fibre, protein, salt), 14 allergen columns, and a "Contains: / May contain:" line.
--fetch downloads each venue's pages into DIR/<venue>/menu-<n>.html (one request per second, robots.txt checked by hand: Ten Kites
disallows only /fonts/, /views/ and *.less; roxyleisure.co.uk disallows only /wp-admin/ and /scoring/).

MENUS DIFFER BY VENUE (founder's rule, 9 Oct 2026): Roxy prints a "Side A" menu at 12 venues and a "Side B" menu at 5 (Old Street and
Cheltenham differ again), and the same dish name sometimes carries different numbers or allergens at different venues. A dish is
published ONLY when exactly the same printed row (name, all eight numbers, allergens, vegetarian mark) appears at 2 or more venues.
When one name has two different rows that each appear at 2 or more venues, nothing is chosen: the dish is left out. Nothing is
averaged, corrected or filled in. If a page gains or loses dishes, or a new tab or section appears, the run stops.
"""
from __future__ import annotations
import argparse
import collections
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_a as ta  # noqa: E402
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "roxy-leisure"
BASE = "https://menus.tenkites.com/roxyleisure/"
SOURCE_URL = BASE + "leedsboarlane02"
GUIDE_URL = "https://roxyleisure.co.uk/menu/"
# Ten Kites slug -> venue, in the order of the chain's own venue list. Leeds Merrion Street and Liverpool School Lane have a
# menu page on roxyleisure.co.uk but no allergen/nutrition link (drinks only / no Ten Kites page): left out.
VENUES = [
    ("birminghamdigbeth02", "Birmingham Digbeth"), ("birminghamvictoriasquare02", "Birmingham Victoria Square"),
    ("bristolunionstreet02", "Bristol Union Street"), ("cardiffthefriary02", "Cardiff The Friary"),
    ("cheltenhamhighstreet", "Cheltenham High Street"), ("edinburghrosestreet02", "Edinburgh Rose Street"),
    ("leedsboarlane02", "Leeds Boar Lane"), ("leedsthelight02", "Leeds The Light"),
    ("leicesterhumberstonegate02", "Leicester Humberstone Gate"), ("liverpoolcavernquarter02", "Liverpool Cavern Quarter"),
    ("liverpoolhanoverstreet02", "Liverpool Hanover Street"), ("londonholborn02", "London Holborn"),
    ("londonoldst02", "London Old Street"), ("londonstmaryaxe02", "London St Mary Axe"),
    ("manchesterarndale02", "Manchester Arndale"), ("manchesterdeansgate02", "Manchester Deansgate"),
    ("nottinghambottlelane02", "Nottingham Bottle Lane"), ("nottinghamthecornerhouse02", "Nottingham Cornerhouse"),
    ("sheffieldchartersquare02", "Sheffield Charter Square"), ("yorkthestonebow02", "York The Stonebow"),
]
# dishes each venue's tabs print today (food, drinks, Kentucky); the run stops if a page changes so a human re-checks the rules
EXPECTED = {
    "birminghamdigbeth02": [74, 93, 2], "birminghamvictoriasquare02": [81, 93, 9], "bristolunionstreet02": [81, 93, 9],
    "cardiffthefriary02": [81, 93, 9], "cheltenhamhighstreet": [81], "edinburghrosestreet02": [81, 93, 9],
    "leedsboarlane02": [74, 93, 2], "leedsthelight02": [81, 93, 9], "leicesterhumberstonegate02": [81, 93, 9],
    "liverpoolcavernquarter02": [81, 9], "liverpoolhanoverstreet02": [74, 93, 2], "londonholborn02": [81, 93],
    "londonoldst02": [75], "londonstmaryaxe02": [81, 93, 9], "manchesterarndale02": [81, 93, 9],
    "manchesterdeansgate02": [81, 93, 9], "nottinghambottlelane02": [73, 93, 9], "nottinghamthecornerhouse02": [81, 93, 9],
    "sheffieldchartersquare02": [74, 93, 2], "yorkthestonebow02": [81, 93, 9],
}
NUTRIENT_COLUMNS = ("Energy (kCal)", "Fat (g)", "of which saturates (g)", "Carbohydrate (g)", "of which sugars (g)", "Fibre (g)",
                    "Protein (g)", "Salt (g)")
CAREFUL = ("calories", "protein_g", "carbs_g", "fat_g")


# ---------------------------------------------------------------------------------------------------------- fetching

def fetch_all(pages: Path) -> None:
    """One request per page, 1 request/second: the first tab of each venue, then the other tabs listed in its tab bar."""
    for vslug, _ in VENUES:
        d = pages / vslug
        d.mkdir(parents=True, exist_ok=True)
        first = d / "menu-0.html"
        if not first.exists():
            first.write_text(ta.fetch_text(BASE + vslug), encoding="utf-8")
            time.sleep(1)
        for i, (_, mid, _) in enumerate(ta.menu_tabs(first.read_text(encoding="utf-8"))):
            path = d / f"menu-{i}.html"
            if i > 0 and not path.exists():
                path.write_text(ta.fetch_text(f"{BASE}{vslug}?mguid={mid}"), encoding="utf-8")
                time.sleep(1)


# ---------------------------------------------------------------------------------------------------------- reading

def tab_kind(index: int, name: str, where: str) -> str:
    if index == 0:
        return "food"
    if name.startswith("Roxy Drinks"):
        return "drinks"
    if name.startswith("Roxy takes Kentucky"):
        return "kentucky"
    raise SystemExit(f"{where}: new menu tab {name!r}: decide whether it is used (tab_kind) before running again")


def diet(suitable: str) -> bool:
    """True when the dish's own "Suitable for:" line says Vegetarian or Vegan (modal layout text)."""
    words = {w.strip().lower() for w in suitable.replace("Suitable for:", "").split(",")}
    return bool(words & {"vegetarian", "vegan"})


def read_venue(pages: Path, vslug: str) -> list[dict]:
    """Every dish on every tab of one venue, as plain records (numbers and allergens exactly as printed)."""
    d = pages / vslug
    files = sorted(d.glob("menu-*.html"), key=lambda p: int(p.stem.split("-")[1]))
    if not files:
        raise SystemExit(f"{vslug}: no saved pages in {d} (run with --fetch)")
    first_text = files[0].read_text(encoding="utf-8")
    tabs = [t[0] for t in ta.menu_tabs(first_text)] or [tk.page_title(first_text)]
    if len(files) != len(tabs):
        raise SystemExit(f"{vslug}: {len(files)} saved pages but the tab bar lists {len(tabs)}: re-fetch")
    out, counts = [], []
    for i, path in enumerate(files):
        text = path.read_text(encoding="utf-8")
        where = f"{vslug}/{path.name}"
        if tk.page_title(text) != tabs[i]:
            raise SystemExit(f"{where}: page title {tk.page_title(text)!r} is not the tab {tabs[i]!r}")
        kind = tab_kind(i, tabs[i], where)
        n0 = len(out)
        if "k10-all-courses k10-all-courses_desktop" in text:
            for r in tk.read_table_layout(text):
                a = tk.allergens_from_columns(r, f"{where} {r['name']}", tk.ALLERGEN_LABELS)
                out.append({"venue": vslug, "tab": tabs[i], "kind": kind, "section": r["section"], "name": r["name"],
                            "nutrients": r["nutrients"], "veg": bool(r["vegetarian"]), "allergens": a, "desc": r["desc"],
                            "ingredients": r["ingredients"]})
        else:   # Cheltenham: the pop-up layout (same labels, "Nutrition (per portion)")
            for r in tk.read_modal_layout(text):
                if r["group"] or r["choice"]:
                    raise SystemExit(f"{where}: {r['dish']!r} has choices: the pop-up layout changed")
                if r["per"] != "Nutrition (per portion)":
                    raise SystemExit(f"{where}: table is labelled {r['per']!r}")
                a = tk.allergens_checked(r, f"{where} {r['dish']}")
                out.append({"venue": vslug, "tab": tabs[i], "kind": kind, "section": r["section"], "name": r["dish"],
                            "nutrients": r["nutrients"], "veg": diet(r["suitable"]), "allergens": a, "desc": r["desc"],
                            "ingredients": ""})
        counts.append(len(out) - n0)
    for rec in out:
        if tuple(rec["nutrients"]) != NUTRIENT_COLUMNS:
            raise SystemExit(f"{vslug} > {rec['name']}: nutrient columns are {list(rec['nutrients'])}, not the eight this script knows")
        if rec["allergens"] is None:
            raise SystemExit(f"{vslug} > {rec['name']}: allergens cannot be read completely: the whole chain would be link-only")
    if counts != EXPECTED[vslug]:
        raise SystemExit(f"{vslug}: tabs print {counts} dishes but this script expects {EXPECTED[vslug]}: the menu changed, "
                         "re-check the rules and EXPECTED before running again")
    return out


def name_key(name: str) -> str:
    return " ".join(name.lower().split())


def signature(rec: dict) -> tuple:
    a = rec["allergens"]
    return (tuple(rec["nutrients"][c] for c in NUTRIENT_COLUMNS), tuple(sorted(a["contains"])), tuple(sorted(a["may_contain"])),
            tuple(sorted(a["cereals"])), tuple(sorted(a["nuts"])), rec["veg"])


def published(rec: dict) -> bool:
    """The four required numbers are printed as numbers (a dash means the chain did not publish them)."""
    n = rec["nutrients"]
    return all(tk.is_number(n[c]) for c in ("Energy (kCal)", "Protein (g)", "Carbohydrate (g)", "Fat (g)"))


def consensus(records: list[dict]) -> dict:
    """{(kind, name key): {signature: [records, one per venue]}} over published rows. A venue that prints the same name twice
    with different rows in one tab contributes none of them (it contradicts itself, nothing is chosen)."""
    by_venue: dict = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in records:
        if published(r):
            by_venue[(r["venue"], r["kind"])][name_key(r["name"])].append(r)
    table: dict = collections.defaultdict(lambda: collections.defaultdict(list))
    self_conflict = []
    for (venue, kind), names in by_venue.items():
        for key, recs in names.items():
            sigs = {signature(r) for r in recs}
            if len(sigs) > 1:
                self_conflict.append((venue, kind, key))
                continue
            table[(kind, key)][sigs.pop()].append(recs[0])
    return {"table": table, "self_conflict": self_conflict}


def explain(records: list[dict]) -> None:
    c = consensus(records)
    print("venues x tabs read:", collections.Counter((r["kind"]) for r in records))
    print("rows with a dash (not published):", sum(1 for r in records if not published(r)))
    print("venues printing one name twice with different rows:", len(c["self_conflict"]))
    for v, k, n in sorted(c["self_conflict"]):
        print("   ", v, k, n)
    agreed, conflict, single = [], [], []
    for (kind, key), sigs in sorted(c["table"].items()):
        strong = [s for s, recs in sigs.items() if len(recs) >= 2]
        if len(strong) == 1:
            agreed.append((kind, key, sigs[strong[0]]))
        elif len(strong) > 1:
            conflict.append((kind, key, sigs))
        else:
            single.append((kind, key, sigs))
    print(f"agreed at 2+ venues: {len(agreed)}; two rows each at 2+ venues: {len(conflict)}; only one venue or no two agree: {len(single)}")
    for kind, key, recs in agreed:
        sigs = c["table"][(kind, key)]
        extra = sum(len(v) for s, v in sigs.items() if len(v) < len(recs) or v is not recs) - len(recs)
        print(f"  [{kind}] {key!r}: {len(recs)} venues; other rows for this name: {len(sigs) - 1}")
    for kind, key, sigs in conflict:
        print("  CONFLICT", kind, key, [(len(v), s[0][:3]) for s, v in sigs.items()])
    for kind, key, sigs in single:
        print("  SINGLE", kind, key, [(len(v), s[0][:3]) for s, v in sigs.items()])


# ---------------------------------------------------------------------------------------------------------- rules

# printed section (case-folded) -> (category shown, rankable). Section names differ a little between venues; an unknown one stops the run.
SECTIONS = {
    "pizza": ("Pizzas", True), "pizzas": ("Pizzas", True), "chicken": ("Chicken", True),
    "loaded fries & tots": ("Loaded fries & tots", True), "small plates": ("Small plates", True),
    "sides & dips": ("Sides & dips", True), "sides and dips": ("Sides & dips", True),
    "combos & platters": ("Combos & platters", True), "combo & platters": ("Combos & platters", True),
    "roxy feast": ("Roxy feast", False), "dietry options": ("Dietary options", True),   # "DIETRY" is the chain's own spelling
}
KENTUCKY_SECTIONS = {"food": ("Roxy takes Kentucky", True), "untitled group": ("Roxy takes Kentucky", True), "drink": None}   # cocktails: left out
# ("untitled group" is how the 2-dish Kentucky tab at the Side B venues prints its two food dishes)
DRINKS_REASON = ("the chain's drinks table is not reliable enough to publish: it prints Pepsi Max with the same 88 kcal and 22 g sugars as "
                 "Pepsi, a pint of Guinness at 1136 kcal and Jubel at 1273 kcal, rows named \"(Incomplete)\" and rows of dashes")
# not a meal on its own: dips and sauces, sharing dishes and feasts
NOT_A_MEAL = re.compile(r"\b(dip|sauce|mayo|sharer|sharing|platter|basket|feast)\b", re.I)
KEEP_UPPER = {"BBQ", "GF", "PAP", "MCPAP", "PAPMC", "OS", "M", "H", "A", "B", "UK"}


def tidy(name: str) -> str:
    """'GF PEPPERONI' -> 'GF Pepperoni', 'SOUTHERN FRIED TENDERS (PAP) A' -> 'Southern Fried Tenders (PAP) A'; names that are
    already mixed case keep their capitals except runs of shouting words ('Bourbon BBQ STACK (MCPAP) A' -> '... BBQ Stack ...')."""
    n = " ".join(name.split())
    letters = [c for c in n if c.isalpha()]
    shout = bool(letters) and all(c.isupper() for c in letters)

    def fix(word: str) -> str:
        core = re.sub(r"[^A-Za-z]", "", word)
        if not core or core.upper() != core or len(core) < 2 and core not in KEEP_UPPER:
            return word
        if core in KEEP_UPPER:
            return word
        if word.lower() in ("and", "of", "with", "the"):
            return word.lower()
        return re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), word, count=1) if shout or len(core) > 2 else word

    words = n.split(" ")
    out = []
    for i, w in enumerate(words):
        core = re.sub(r"[^A-Za-z]", "", w)
        if core in KEEP_UPPER:
            out.append(w)
        elif shout:
            out.append(w.lower() if i and w.lower() in ("and", "of", "with", "the") else re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), w))
        elif len(core) > 2 and core.upper() == core:
            out.append(re.sub(r"[A-Za-z]+", lambda m: m.group(0).capitalize(), w))
        else:
            out.append(w)
    return " ".join(out)


def grams(value: str) -> float:
    return float(value)


def own_problems(vals: dict) -> list[str]:
    """Reasons a dish's own printed numbers cannot all be right (the row is held back, never corrected)."""
    out = []
    for col in NUTRIENT_COLUMNS[1:]:
        if grams(vals[col]) > 1000:
            out.append(f"it prints {vals[col]} g for '{col}' in one serving, which is impossible")
    fat, sat, carbs, sugar = (grams(vals[c]) for c in ("Fat (g)", "of which saturates (g)", "Carbohydrate (g)", "of which sugars (g)"))
    if sat > fat + 0.05:
        out.append(f"saturates ({sat:g} g) are printed higher than total fat ({fat:g} g)")
    if sugar > carbs + 0.05:
        out.append(f"sugars ({sugar:g} g) are printed higher than carbohydrate ({carbs:g} g)")
    gap = ta.energy_gap({"calories": vals["Energy (kCal)"], "protein_g": vals["Protein (g)"], "carbs_g": vals["Carbohydrate (g)"],
                         "fat_g": vals["Fat (g)"]})
    if gap:
        kcal = grams(vals["Energy (kCal)"])
        est = 4 * grams(vals["Protein (g)"]) + 4 * carbs + 9 * fat
        if kcal >= 50 and abs(kcal - est) / kcal > 0.30:
            out.append(f"printed calories ({kcal:g}) differ by more than 30% from the energy of its own protein, carbs and fat (about {est:.0f} kcal)")
    return out


def classify(rec: dict):
    """(category, rankable) for a record, or a string = the reason it is left out."""
    if rec["kind"] == "drinks":
        return DRINKS_REASON
    section = rec["section"].strip().lower()
    if rec["kind"] == "kentucky":
        if section not in KENTUCKY_SECTIONS:
            raise SystemExit(f"{rec['venue']} > {rec['name']}: new Kentucky section {rec['section']!r}: add it to KENTUCKY_SECTIONS")
        spec = KENTUCKY_SECTIONS[section]
        return spec if spec else "a cocktail on the Kentucky tab: the chain's drinks figures are not published (see the drinks table)"
    if section not in SECTIONS:
        raise SystemExit(f"{rec['venue']} > {rec['name']}: new section {rec['section']!r}: add it to SECTIONS (category, rankable)")
    category, rankable = SECTIONS[section]
    if category == "Sides & dips":
        rankable = bool(re.search(r"\b(fries|tots)\b", rec["name"], re.I))
    if category == "Combos & platters":   # platters, baskets and sharer fries are for the table; a slice with fries is one person's order
        rankable = bool(re.search(r"\bslice\b", rec["name"], re.I))
    return category, rankable and not NOT_A_MEAL.search(rec["name"])


ANIMAL = re.compile(r"\b(pork|bacon|ham|salami|pepperoni|chorizo|nduja|sausages?|beef|chicken|turkey|lamb|duck|fish|salmon|tuna|anchov\w*|prawns?|shrimp)\b", re.I)


def vegetarian_contradiction(rec: dict) -> str:
    """The page marks the dish vegetarian but its own ingredient list names an animal product (a meat or fish word): returns the words."""
    if not rec["veg"]:
        return ""
    # a "contains" allergen list is not an ingredient list, so only the ingredients text is read; 'May contain traces of ...' and the
    # allergy advice sentence that follow it are cut off first
    text = re.split(r"May contain traces", rec["ingredients"], flags=re.I)[0]
    found = sorted({m.group(0).lower() for m in ANIMAL.finditer(text)})
    return ", ".join(found)


def build(records: list[dict]) -> tuple[list[dict], list[tuple[str, str]], list[str], dict]:
    table = consensus(records)
    report: list[str] = []
    stats: dict = collections.Counter()
    left_out = collections.Counter()
    conflicts, singles = [], []
    items: list[dict] = []
    seen = set()
    for rec in records:
        ident = (rec["kind"], name_key(rec["name"]))
        if ident in seen or not published(rec):
            continue
        seen.add(ident)
        sigs = table["table"].get(ident)
        if sigs is None:
            conflicts.append((rec["venue"], rec["name"], "this venue prints the name twice with different figures"))
            continue
        spec = classify(rec)
        if isinstance(spec, str):
            left_out[spec] += 1
            continue
        strong = [s for s, v in sigs.items() if len(v) >= 2]
        if len(strong) > 1:
            conflicts.append((", ".join(sorted({v[0]['name'] for v in sigs.values()})), "", f"{len(strong)} different printed rows, each at 2 or more venues: {sorted(len(sigs[s]) for s in strong)} venues"))
            continue
        if not strong:
            singles.append(rec["name"])
            continue
        recs = sigs[strong[0]]
        others = sum(len(v) for s, v in sigs.items() if s != strong[0])
        printed = collections.Counter(r["name"] for r in recs)
        top = max(printed.values())
        raw = next(r["name"] for r in recs if printed[r["name"]] == top)
        rep = next((r for r in recs if r["ingredients"]), recs[0])
        category, rankable = spec
        name = tidy(raw)
        vals = rep["nutrients"]
        nums, missing = tk.numbers(vals, name)
        if missing:
            raise SystemExit(f"{name}: {missing} not printed but the row counted as published")
        a = rep["allergens"]
        veg_bad = vegetarian_contradiction(rep)
        meat, unspecified = tk.meat_tags(name, rep["desc"], rep["ingredients"], vegetarian=rep["veg"])
        if unspecified:
            report.append(f"meat type not stated: {name}")
        note = f"Same figures and allergens printed at {len(recs)} of {len(VENUES)} venues" + (f"; {others} venue(s) print other figures for this name" if others else "")
        items.append({"id": slug(name), "name": name, "category": category, "serving": "", **nums,
                      "tags": "|".join((["vegetarian"] if rep["veg"] else []) + meat), "rankable": rankable, "notes": note,
                      "allergens": a, "_problems": own_problems(vals) + ([f"the page marks it vegetarian but its own ingredient list names {veg_bad}"] if veg_bad else []),
                      "_venues": [r["venue"] for r in recs]})
    names = [i["name"] for i in items]
    clash = sorted({n for n in names if names.count(n) > 1})
    ids = [i["id"] for i in items]
    if clash or len(set(ids)) != len(ids):
        raise SystemExit(f"two dishes would get the same name or id: {clash or 'ids'}")
    order = []
    for it in items:
        if it["category"] not in order:
            order.append(it["category"])
    holds = [(i["id"], "The chain's own page contradicts itself for this dish, so nothing is chosen: " + "; ".join(i["_problems"]) + ".") for i in items if i["_problems"]]
    stats.update(published=len(items), held=len(holds), conflicts=len(conflicts), singles=len(singles))
    return items, holds, report, {"stats": stats, "left_out": left_out, "conflicts": conflicts, "singles": singles}


NOTE = ("Roxy's menus differ by venue: five printed menu versions at 20 venues. A dish is listed only if at least two venues print exactly "
        "the same figures and allergens; dishes with two different printed versions are left out. Drinks and cocktails are not listed. "
        "Figures are per serving; no weights are printed.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--explain", action="store_true")
    ap.add_argument("--report", action="store_true", help="print every dish left out and why")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    records = []
    for vslug, _ in VENUES:
        records += read_venue(args.pages, vslug)
    if args.explain:
        explain(records)
        return 0
    items, holds, report, info = build(records)
    pub_items = [{k: v for k, v in it.items() if not k.startswith("_")} for it in items]
    title = ("Roxy Ball Room & Roxy Lanes allergen and nutrition menus, one Ten Kites page per venue (20 venues; Side A, Side B and "
             f"Old Street food menus; pages read {args.checked_on}, each page names its own export as dated 2026-10-09)")
    guide = {"title": "Roxy Ball Room & Roxy Lanes allergen information (each venue's menu page links its own Ten Kites allergen page)",
             "url": GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    if not holds:
        (Path(args.out or Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID) / "holdback.csv").unlink(missing_ok=True)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Roxy Leisure", cuisine="Bowling diner", source_title=title, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["roxy leisure", "roxy ball room", "roxy lanes", "roxy ballroom", "roxy"],
                             items=pub_items, out=args.out, note=NOTE, holdback=holds, allergen_guide=guide)
    st = info["stats"]
    print(f"wrote {st['published']} items to {out} ({st['held']} held back for impossible numbers)")
    print(f"left out: {st['conflicts']} names with conflicting or self-contradicting rows; {st['singles']} names where no two venues agree")
    for why, n in info["left_out"].items():
        print(f"left out {n} dishes: {why}")
    if args.report:
        for c in info["conflicts"]:
            print("  conflict:", c)
        print("  single-venue names:", info["singles"])
    for line in report:
        print(line)
    for _, why in holds:
        print("held back:", why)
    return 0


if __name__ == "__main__":
    sys.exit(main())
