#!/usr/bin/env python3
"""Build data/source/simmons-bakers/ from Simmons Bakers' own nutrition pages (simmonsbakers.com/nutritional-information).

    python3 tools/uk_extract/simmons_bakers.py --cache DIR --checked-on 2026-10-08 [--fetch] [--all-butter-salad] [--out DIR]

--fetch downloads what the cache lacks (one GET per product page, one POST per made-in-store product, 1.1 s apart; see
simmons_bakers_pages.py). The run STOPS when the listing changes shape, a page has an option panel this script has no rule for, or a
block (401/403/429) appears.

Two kinds of product page (the listing's two tabs):
* "From the bakery" (RM, about 135 products): a static table "Per <unit>" next to "Per 100g", an allergen line and dietary advice.
  Only the per-unit column is used. When the per-unit column equals the per-100 g column in every row (the page cannot be telling us
  a per-item figure) or every figure is 0, the product is held back (holdback.csv) and never published.
* "Made in store" (MO, about 230 products: baguettes, baps, ciabatta, doorsteps, rolls, sandwiches, toasted, salads, jacket
  potatoes, soup, drinks): the customer picks options (bread, butter and salad, cheese, milk...) and the page's script adds the
  rows of the filling and of every pick (POST /ingredientoptionslookup) into the totals it shows. The numbers on the product page itself
  are placeholders. This script makes the same request and adds the rows exactly as the script does (same order, kJ and kcal rounded to
  whole numbers, other values two decimals: see total()), so every item is one concrete order with the totals the site shows for it.
  Each combination of the bread-like picks (bread, roll, cheese, milk, dressing, filling, soup flavour) is its own item. For "Butter &
  Salad" the site has four rows, each a separate figure (the "With Butter and Salad" row is NOT butter plus salad); only
  "With Butter and Salad" is published (the usual sandwich), --all-butter-salad publishes all four. Drinks that force a syrup pick
  (Latte, Cappuccino, Flat White, Mocha, Iced Coffee: 17 syrups, no plain choice) are left out.
Allergens (docs/DATA.md "Allergens"): LINK ONLY (allergen_guide.csv, no allergens.csv), because the made-in-store pages do not give a
reliable allergen list. Their own "Allergens & Dietary" box is hidden, and the list the page's script builds leaves out the filling: a
rendered "Baguette, Egg Mayo (Sourdough, With Butter and Salad)" lists "Milk, Gluten, Rye, Wheat" (no egg), a Ciabatta, Chicken Mayo & Bacon
lists only "Milk" (no gluten), and a ciabatta's "filling ingredients" paragraph is the ciabatta bread's. The bakery (RM) pages do print a
usable allergen line; --allergens writes allergens.csv from them AND from the made-in-store marks (union of bold words in the filling's
ingredients and each pick's allergens line), but that file is NOT safe for made-in-store items: do not publish it. Allergens are all or
nothing per chain, so the chain shows the guide link only.
Figures the chain's own pages contradict are held back, never corrected: figures_that_disagree() holds back any row the audit
(tools/audit/accuracy_audit.py) calls impossible (kJ against kcal beyond 15%, kcal against 4P+4C+9F beyond 30%, ...), and static pages
whose per-unit column equals the per-100 g column, are all zero, or whose per-100 g column is above 900 kcal.
"""
from __future__ import annotations
import argparse
import itertools
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import simmons_bakers_pages as sp  # noqa: E402
from common import _A, allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "simmons-bakers"
SOURCE_URL = sp.BASE + sp.LISTING
ALIASES = ["simmons bakers", "simmons", "simmons bakery", "simmons the bakers"]
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|gammon|pepperoni|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT = re.compile(r"\b(chicken|turkey|pastrami|lamb|meatball|mince|burger|duck)\b", re.I)

# Option panels this script knows. Anything else stops the run.
BUTTER_SALAD, KEEP = "Butter & Salad", "With Butter and Salad"
SKIP_PANELS = {"Coffee Extras", "Syrup Flavours"}  # forced extras with no plain choice: the product is left out
LABELS = {"Milk Type": {"Oat": "Oat milk", "Semi-Skimmed": "Semi-skimmed milk", "None": "No milk"},
          "Salad Dressings": {"Balsamic": "Balsamic dressing", "French": "French dressing", "Vinaigrette": "Vinaigrette dressing"},
          "Soup Flavour": {}}
KNOWN_PANELS = {"Baguette Type", "Bap Type", "Doorstep Type 2 Slice", "Bread Type 2 Slice", "Roll Type", "Focaccia Type", "Sourdough Type 1 Slice",
                "Cheese Type", "Milk Type", "Salad Dressings", "Soup Flavour", "Gourmet Filling - Meat", "Gourmet Filling - Veg", BUTTER_SALAD, *SKIP_PANELS}
NAME_FIXES = {"Avacado": "Avocado", "Cappucino": "Cappuccino", "Freid": "Fried"}  # typos in the page titles (names only)
# A made-in-store order has one item per bread/cheese/milk choice. So that "Best for you" is not filled with near-identical
# variants of one sandwich (accuracy audit 2026-10-08), only the variants on the plain default bread (or with no bread choice) are
# suggested as an order; every variant stays listed with its own figures.
NONDEFAULT_BREADS = {"Multiseed", "Wholemeal", "Oat", "Harvester", "Multiseed Sourdough", "White Sourdough", "Sourdough", "Crusty"}

# Listing category -> (shown category, rankable). Sweet bakes, bread, fillings, drinks and parts are not suggested as an order.
MO_CATEGORIES = {"Baguettes": True, "Baps": True, "Ciabatta": True, "Doorsteps": True, "Rolls": True, "Sandwiches": True, "Toasted": True,
                 "Salads": True, "Jacket Potatoes": True, "Lunch": True, "Hot Drinks": False, "Iced Drinks": False}
RM_CATEGORIES = {"Bar Cakes": False, "Bread": False, "Gateaux": False, "Pies & Tarts": False, "Rolls & Baps & Baguettes": False,
                 "Sandwich Fillings": False, "Savouries": True, "Seasonal": False, "Small Cakes & Biscuits": False, "Soup": True,
                 "Traybakes": False, "Wrapped Products": False}
GENERIC_UNITS = {"serving", "unit", "item", "portion"}
# Words this chain prints as its allergen marks that common._A does not know. The chain bolds the species or derivative instead of the
# allergen's name in a filling's ingredients ("Salmon", "Prawns", "Tuna"); "Lactose" is printed beside "Milk" in all 8 bakery lines that have it
# (checked below: the run stops if it ever appears without Milk). Only these four words are added; any other unknown word leaves the product out.
EXTRA_WORDS = {"prawns": ("crustaceans", None), "salmon": ("fish", None), "tuna": ("fish", None), "lactose": ("milk", None)}
NO_ALLERGENS = {"none", "this product has no allergens."}
# Pages held back by hand after reading them against their own other column (page path -> reason). Never corrected.
HAND_HOLDBACK = {
    "nutritional-information-rm/10804": ("page prints 'Per serving' 10,256 kcal with 518 kcal per 100 g: that is a 1.98 kg whole log, not a serving "
                                         "(the label does not say what the figure covers)"),
}
NOTE = ("Per serving as Simmons' pages show it (averages). Made-in-store items are the page's own totals for the bread, filling and 'with butter and "
        "salad' picks; other butter and salad choices and syrup drinks aren't listed. Allergens aren't listed per item: the made-in-store allergen lists leave out fillings' allergens.")


def num(v: str) -> str:
    """'9,280' -> '9280' (a thousands separator is formatting, not a value)."""
    return v.replace(",", "").strip()


def fix_name(s: str) -> str:
    for a, b in NAME_FIXES.items():
        s = s.replace(a, b)
    s = " ".join(s.split()).rstrip(",").strip()
    if s.isupper():  # "CANDY CANE CUP CAKE (FRI)" -> "Candy Cane Cup Cake (Fri)"
        s = " ".join(w if w in ("&", "-") else w.capitalize() for w in s.split(" "))
    return s


def split_allergen_line(line: str | None) -> list[str]:
    if line is None:
        raise ValueError("no allergen line")
    if line.strip().lower() in NO_ALLERGENS:
        return []
    return [w for w in (x.strip() for x in line.split(",")) if w and w.lower() != "none"]


def allergen_sets(words: list[str], where: str) -> dict:
    lowered = [w.strip().lower() for w in words]
    if "lactose" in lowered and "milk" not in lowered:
        raise SystemExit(f"{where}: 'Lactose' printed without 'Milk': the Lactose mapping is only safe beside Milk, re-check")
    keys, cereals, nuts = allergen_words(words, where, extra=EXTRA_WORDS)
    return {"contains": keys, "cereals": cereals, "nuts": nuts, "may_contain": set()}


def union(*sets: dict) -> dict:
    out = {"contains": set(), "cereals": set(), "nuts": set(), "may_contain": set()}
    for s in sets:
        for k in out:
            out[k] |= s[k]
    return out


def tags_for(text: str, vegetarian: bool, name: str = "") -> str:
    """vegetarian = the page's own dietary advice. A page that says 'Suitable for vegetarians' is not also tagged pork/beef from a word in its
    ingredient text (a vegan mushroom roll lists 'Sausage Roll Mix', a seasoning): only the dish's NAME is read then, and build_static holds
    the dish back when the name itself says pork or beef."""
    tags = ["vegetarian"] if vegetarian else []
    meat_text = name if vegetarian else text
    if PORK.search(meat_text):
        tags.append("contains_pork")
    if BEEF.search(meat_text):
        tags.append("contains_beef")
    return "|".join(tags)


def load(cache: Path, fetch: bool) -> tuple[list[dict], dict]:
    sp.robots_ok(cache) if fetch else None
    if fetch:
        sp.fetch_page(cache, "nutritional-information")
    listing_file = sp.page_file(cache, "nutritional-information")
    listing = sp.parse_listing(listing_file.read_text(encoding="utf-8"))
    if len(listing) != len({r["id"] for r in listing}) or not 350 < len(listing) < 450:
        raise SystemExit(f"The listing has {len(listing)} products (this script was written for 402): re-check before running again.")
    products = {}
    for r in listing:
        f = sp.fetch_page(cache, r["path"]) if fetch else (sp.page_file(cache, r["path"]) if sp.page_file(cache, r["path"]).exists() else None)
        if f is None:
            products[r["path"]] = None  # HTTP 500 (or not downloaded)
            continue
        p = sp.parse_product(f.read_text(encoding="utf-8"))
        if p["kind"] == "mo":
            ids = [o["id"] for pan in p["panels"] for o in pan["options"]]
            p["rows"] = sp.lookup(cache, p["id"], ids) if fetch or (cache / "lookup" / f"{p['id']}.json").exists() else None
        products[r["path"]] = p
    return listing, products


def build(listing: list[dict], products: dict, all_butter_salad: bool, with_allergens: bool = False) -> tuple[list[dict], list[tuple[str, str]], list[str], dict]:
    items, holdback, report = [], [], []
    stats = {"mo_products": 0, "mo_items": 0, "rm_items": 0, "left_out": 0, "meat_unstated": 0, "mismatch_marks": 0, "unmapped_bold": {}, "broken": {}}
    for r in listing:
        p = products[r["path"]]
        who = f"{r['category']} / {r['name']} ({r['path']})"
        if p is None:
            report.append(f"LEFT OUT {who}: the page answers HTTP 500 (or was not downloaded)")
            stats["left_out"] += 1
            continue
        if p["kind"] == "static":
            built = build_static(r, p, who, report, holdback, with_allergens)
        else:
            built = build_mo(r, p, who, report, all_butter_salad, stats, with_allergens)
        if built is None:
            stats["left_out"] += 1
            continue
        items += built
    stats["rm_items"] = sum(1 for i in items if i["_tab"] == "RM")
    stats["mo_items"] = sum(1 for i in items if i["_tab"] == "MO")
    return items, holdback, report, stats


def build_static(r: dict, p: dict, who: str, report: list[str], holdback: list[tuple[str, str]], with_allergens: bool) -> list[dict] | None:
    cat = r["category"]
    if cat not in RM_CATEGORIES and cat not in MO_CATEGORIES:
        raise SystemExit(f"{who}: new category {cat!r}: add it to RM_CATEGORIES")
    rankable = RM_CATEGORIES.get(cat, MO_CATEGORIES.get(cat, False))
    nums = {}
    for key, ours in sp.FIELDS:
        v = p["serving"][key]
        if v is None or v == "":
            report.append(f"LEFT OUT {who}: no per-unit value for {key}")
            return None
        nums[ours] = num(v)
    al = None
    if with_allergens:
        try:
            al = allergen_sets(split_allergen_line(p["allergens"]), who)
        except ValueError:
            report.append(f"LEFT OUT {who}: no allergen line on the page (allergens are all or nothing)")
            return None
        except SystemExit as e:
            report.append(f"LEFT OUT {who}: {e}")
            return None
    unit = p["unit"]
    serving = "" if unit.lower() in GENERIC_UNITS or not unit else unit
    ing = sp.clean(p["ingredients_html"] or "")
    name = fix_name(p["title"])
    veg = (p["dietary"] or "").startswith("Suitable for vegetarians")
    item = {"name": name, "category": cat, "serving": serving, **nums, "tags": tags_for(name + " " + ing, veg, name), "rankable": rankable,
            "allergens": al, "_tab": "RM", "notes": f"page {r['path']}; per {unit or 'serving'}"}
    if MEAT.search(name + " " + ing) and not PORK.search(name + " " + ing) and not BEEF.search(name + " " + ing):
        report.append(f"meat type not stated: {name}")
    item["_id"] = slug(name)
    same = all(p["serving"][k] == p["hundred"][k] for k, _ in sp.FIELDS)
    zero = all(float(num(p["serving"][k])) == 0 for k, _ in sp.FIELDS)
    if zero:
        holdback.append((item["_id"], f"page {r['path']} prints 0 for every figure (no nutrition published)"))
    elif r["path"] in HAND_HOLDBACK:
        holdback.append((item["_id"], HAND_HOLDBACK[r["path"]]))
    elif float(num(p["hundred"]["energyKcal"] or "0")) > 900:  # fat supplies 9 kcal/g, so nothing can have more than 900 kcal per 100 g
        holdback.append((item["_id"], f"page {r['path']} prints {p['hundred']['energyKcal']} kcal per 100 g, above the 900 kcal per 100 g pure fat supplies: "
                                      "its own columns cannot both be right"))
    elif same:
        holdback.append((item["_id"], f"page {r['path']} prints the same figures for 'Per {unit or 'serving'}' and 'Per 100g', so the per-item figure is not shown"))
    elif veg and (PORK.search(name) or BEEF.search(name)):
        holdback.append((item["_id"], f"page {r['path']} says '{p['dietary']}' but the dish is named '{name}': "
                                      "the page's own dietary advice contradicts the dish name. Not corrected."))
    return [item]


def build_mo(r: dict, p: dict, who: str, report: list[str], all_butter_salad: bool, stats: dict, with_allergens: bool) -> list[dict] | None:
    cat = r["category"]
    if cat not in MO_CATEGORIES:
        raise SystemExit(f"{who}: new category {cat!r}: add it to MO_CATEGORIES")
    headers = [pan["header"] for pan in p["panels"]]
    unknown = [h for h in headers if h not in KNOWN_PANELS]
    if unknown:
        raise SystemExit(f"{who}: option panel {unknown} has no rule in KNOWN_PANELS: add one (variant, extra or left out) and re-run.")
    if SKIP_PANELS & set(headers):
        report.append(f"LEFT OUT {who}: forces a pick from {sorted(SKIP_PANELS & set(headers))} (no plain version published)")
        return None
    if p["rows"] is None:
        report.append(f"LEFT OUT {who}: option rows not downloaded")
        return None
    if with_allergens and p["base_html"] is None:
        report.append(f"LEFT OUT {who}: the page prints no ingredients for the filling, so its allergens cannot be read")
        return None
    rows_by_id = {row["id"]: row for row in p["rows"] if row["id"]}
    bases = [row for row in p["rows"] if not row["id"]]
    if len(bases) != 1:
        report.append(f"LEFT OUT {who}: {len(bases)} base rows in the answer")
        return None
    base = bases[0]
    base_al = None
    if with_allergens:
        try:
            base_al = allergen_sets(sp.bold_words(p["base_html"]), who + " filling")
            if base["allergens"]:
                base_al = union(base_al, allergen_sets(split_allergen_line(base["allergens"]), who + " base row"))
        except SystemExit as e:
            report.append(f"LEFT OUT {who}: {e}")
            return None
    # picks that become variants; Butter & Salad reduced to the usual sandwich unless all are asked for
    panels = []
    for pan in p["panels"]:
        opts = pan["options"]
        if pan["header"] == BUTTER_SALAD and not all_butter_salad:
            opts = [o for o in opts if o["label"] == KEEP]
            if len(opts) != 1:
                report.append(f"LEFT OUT {who}: no '{KEEP}' choice")
                return None
        panels.append({"header": pan["header"], "options": opts})
    # bread-like picks first in the name, butter and salad last
    order = sorted(range(len(panels)), key=lambda i: (panels[i]["header"] == BUTTER_SALAD, i))
    title = fix_name(p["title"])
    built = []
    for combo in itertools.product(*[pan["options"] for pan in panels]):
        picks = [rows_by_id.get(o["id"]) for o in combo]
        if any(x is None for x in picks):
            report.append(f"LEFT OUT {who}: option row missing in the answer")
            return None
        try:
            nums = sp.total([base] + picks)
        except ValueError as e:  # the page would print NaN for this order: nothing to publish
            stats["broken"][str(e)] = stats["broken"].get(str(e), 0) + 1
            continue
        al = None
        if with_allergens:
            try:
                al = union(base_al, *[pick_allergens(x, who, stats) for x in picks])
            except SystemExit as e:
                report.append(f"LEFT OUT {who} ({', '.join(o['label'] for o in combo)}): {e}")
                return None
        labels = []
        for i in order:
            lab = combo[i]["label"]
            labels.append(LABELS.get(panels[i]["header"], {}).get(lab, lab))
        name = title + (" (" + ", ".join(labels) + ")" if labels else "")
        # the meat tags read the filling's own text AND the picks' names and ingredients (a focaccia's filling, "Hunters Chicken" with bacon
        # or "New York Style Pastrami" made of beef, is a pick: the page title and base text name neither)
        text = (title + " " + sp.clean(p["base_html"] or "") + " " + " ".join(o["label"] for o in combo) + " "
                + " ".join(sp.clean(x["ingredients"] or "") for x in picks))
        built.append({"name": name, "category": cat, "serving": "", **nums, "tags": tags_for(text, False), "rankable": MO_CATEGORIES[cat] and (labels[0] if labels else "") not in NONDEFAULT_BREADS,
                      "allergens": al, "_tab": "MO", "_id": slug(name),
                      "notes": f"page {r['path']}: total of the filling + " + " + ".join(x["shortDescription"] for x in picks)})
    if not built:
        report.append(f"LEFT OUT {who}: every order shows NaN on the site (a row has no figures)")
        return None
    stats["mo_products"] += 1
    if MEAT.search(text) and not PORK.search(text) and not BEEF.search(text):
        report.append(f"meat type not stated: {title}")
    return built


def pick_allergens(row: dict, who: str, stats: dict) -> dict:
    """A pick's allergens: its own allergens line, plus the words in bold in its ingredients (the page's other allergen marks)."""
    line = split_allergen_line(row["allergens"]) if row["allergens"] is not None else []
    a = allergen_sets(line, f"{who} {row['shortDescription']}")
    bold = sp.bold_words(row["ingredients"])
    known = [w for w in bold if w.strip().lower() in _A or w.strip().lower() in EXTRA_WORDS]
    for w in bold:
        if w not in known:
            stats["unmapped_bold"][w] = stats["unmapped_bold"].get(w, 0) + 1  # e.g. Buttermilk, E223: the row's allergens line covers them
    b = allergen_sets(known, f"{who} {row['shortDescription']} (bold)")
    if b["contains"] - a["contains"]:
        stats["mismatch_marks"] += 1
    return union(a, b)


# Audit codes (tools/audit/accuracy_audit.py nutrition_flags) that mean the chain's OWN figures for one row cannot all be true.
# Such rows are held back (never corrected). "huge" is not here: a whole cake or log printed per cake is checked by hand instead.
# kJ against kcal is held back at the audit's stricter band (kJ outside 0.93-1.07 x kcal x 4.184), not only beyond 15%: the made-in-store
# filling rows (salads, chicken tikka, ...) print a kcal figure that is 7-15% BELOW both their own kJ and their own 4P+4C+9F, in all 44 such
# orders (verifier re-read 2026-10-09, data/audit/verified/simmons-bakers.json), so the printed kcal would understate the calories.
IMPOSSIBLE = {"kj-kcal", "energy-gap", "zero-kcal", "sat-gt-fat", "sugar-gt-carbs", "salt-sodium", "macros-exceed-weight", "kcal-per-gram",
              "protein-over-energy", "all-zero"}


def figures_that_disagree(items: list[dict], already: set) -> list[tuple[str, str]]:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "audit"))
    import accuracy_audit as aa  # noqa: E402

    def f(v: str):
        return float(v) if str(v).strip() != "" else None
    out = []
    for it in items:
        if it["_id"] in already:
            continue
        n = {"calories": f(it["calories"]), "protein": f(it["protein_g"]), "carbs": f(it["carbs_g"]), "fat": f(it["fat_g"]),
             "saturatedFat": f(it["sat_fat_g"]), "sugar": f(it["sugar_g"]), "fiber": f(it["fiber_g"]), "salt": f(it["salt_g"]),
             "energyKj": f(it["energy_kj"])}
        bad = [(code, msg) for sev, code, msg in aa.nutrition_flags({"name": it["name"], "category": it["category"], "nutrients": n})
               if (sev == aa.HIGH and code in IMPOSSIBLE) or code == "kj-kcal"]  # kJ against kcal: the stricter 0.93-1.07 band (see below)
        if bad:
            out.append((it["_id"], "the page's own figures disagree with each other: " + "; ".join(f"{c}: {m}" for c, m in bad)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--fetch", action="store_true", help="download what the cache lacks (polite: see simmons_bakers_pages.py)")
    ap.add_argument("--all-butter-salad", action="store_true", help="publish all four Butter & Salad choices instead of 'With Butter and Salad'")
    ap.add_argument("--allergens", action="store_true",
                    help="also write allergens.csv (NOT safe for made-in-store items: see the module docstring); default is the guide link only")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    listing, products = load(args.cache, args.fetch)
    items, holdback, report, stats = build(listing, products, args.all_butter_salad, args.allergens)
    # exact duplicate names inside a category: same numbers = one product listed twice; different numbers = keep both (ids get a suffix)
    seen, kept = {}, []
    for it in items:
        k = (it["category"], it["name"])
        if k in seen:
            if all(seen[k][f] == it[f] for _, f in sp.FIELDS):
                report.append(f"dropped exact duplicate: {it['name']} ({it['category']})")
                continue
            report.append(f"same name, different figures kept: {it['name']} ({it['category']})")
        seen[k] = it
        kept.append(it)
    holdback += figures_that_disagree(kept, {h for h, _ in holdback})
    ids = {}
    for it in kept:
        ids[it["_id"]] = ids.get(it["_id"], 0) + 1
    # a held-back id must point at exactly one item
    for item_id, _ in holdback:
        if ids.get(item_id, 0) != 1:
            raise SystemExit(f"held-back id {item_id} is not unique: {ids.get(item_id)}")
    guide = {"title": "Simmons Bakers nutritional and allergen information: product pages (accessed " + args.checked_on + ", no date shown)",
             "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Simmons Bakers", cuisine="Bakery",
                             source_title="Simmons Bakers nutritional and allergen information (simmonsbakers.com, accessed " + args.checked_on + ", no date shown)",
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=kept, out=args.out, note=NOTE,
                             holdback=holdback, allergen_guide=guide)
    print("\n".join(report))
    print("orders the site cannot total (a pick row has no figures, the page prints NaN), not published:", stats["broken"])
    print("bold words in pick rows not in the shared table (covered by the row's own allergens line):", stats["unmapped_bold"])
    print("listing page sha256", sp.sha256_text(sp.page_file(args.cache, "nutritional-information")), "| digest of all cached pages + lookups", sp.cache_digest(args.cache))
    print(f"wrote {len(kept)} items to {out}: made-in-store {stats['mo_items']} (from {stats['mo_products']} products), bakery {stats['rm_items']}; "
          f"held back {len(holdback)}; products left out {stats['left_out']}; picks whose bold words add an allergen the line lacks: {stats['mismatch_marks']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
