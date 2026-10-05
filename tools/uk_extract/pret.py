#!/usr/bin/env python3
"""Build data/source/pret/ from Pret A Manger UK's official product nutrition data (pret.co.uk).

    python3 tools/uk_extract/pret.py --fetch /tmp/pret-raw --checked-on 2026-10-05      # download once, then extract
    python3 tools/uk_extract/pret.py --raw /tmp/pret-raw --checked-on 2026-10-05        # re-extract from saved files

Pret has no nutrition PDF (its Allergen Guide PDF lists allergens only). The per-serving nutrition table of every
product is on the product-category pages of https://www.pret.co.uk/en-GB/products, and tools/uk_extract/pret_feed.py
reads exactly the data those pages load (one request per category, no login or key).

Numbers are copied as printed (kcal, fat, saturates, carbohydrate, sugars, fibre, protein, salt; kJ is only used to
flag disagreements). The `perServing` column is used, never `per100g`. Only the display categories, the rankable
flags and the tag word lists below are typed by hand. If the site adds categories/subcategories, changes nutrient
labels, or the item count changes, this script stops so a human re-checks (see EXPECTED_ITEMS, `--expect`).
"""
import argparse
import csv
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pret_feed  # noqa: E402

CHAIN_ID = "pret"
SOURCE_URL = "https://www.pret.co.uk/en-GB/products"
SOURCE_TITLE = ("Pret A Manger UK website: product nutritional information, GB shops "
                "(pret.co.uk product pages, retrieved {checked_on}; the pages carry no version date)")
EXPECTED_ITEMS = 329  # set after the reviewed run of 2026-10-05; if the menu changes the script stops: re-check, then pass --expect N

# Display categories, in display order.
SW, BR, HF, SP, SN, FR, KD, HD, CD, AH = (
    "Sandwiches, baguettes & wraps", "Breakfast", "Hot food", "Salads, plates & protein pots",
    "Snacks & sweet treats", "Fruit", "Little Pret Stars", "Hot drinks", "Cold drinks", "Pret at home")
VG = "Veggie & vegan-friendly"
CATEGORY_ORDER = [SW, BR, HF, SP, SN, FR, KD, VG, HD, CD, AH]

# (site category slug, site subcategory slug or "<top>") -> (display category, rankable). A product that appears in several
# places gets the FIRST match in this list. Anything not listed makes the script stop.
PRIORITY: list[tuple[str, str, str, bool]] = [
    ("breakfast", "breakfast-porridge", BR, True),
    ("breakfast", "breakfast-baguettes", BR, True),
    ("breakfast", "breakfast-rolls", BR, True),
    ("breakfast", "breakfast-protein-pot", BR, True),
    ("breakfast", "birchers-and-yoghurt-bowls", BR, True),
    ("breakfast", "breakfast-pastries", BR, False),          # croissants and the like: treated as treats
    ("sandwiches-baguettes-wraps-and-flatbreads", "sandwiches", SW, True),
    ("sandwiches-baguettes-wraps-and-flatbreads", "baguettes", SW, True),
    ("sandwiches-baguettes-wraps-and-flatbreads", "wraps-and-flatbreads", SW, True),
    ("sandwiches-baguettes-wraps-and-flatbreads", "toasted-sandwiches-baguettes-and-wraps", SW, True),
    ("sandwiches-baguettes-wraps-and-flatbreads", "breakfast-rolls", BR, True),
    ("hot-food", "porridge", BR, True),
    ("hot-food", "hot-food-boxes", HF, True),
    ("hot-food", "soup-and-breads", HF, True),
    ("hot-food", "toasted-sandwiches-wraps-and-baguettes", SW, True),
    ("hot-food", "breakfast-rolls", BR, True),
    ("hot-food", "hot-pots", HF, True),
    ("hot-food", "hot-pastries", HF, False),
    ("super-plates-salads-and-protein-pots", "super-plates", SP, True),
    ("super-plates-salads-and-protein-pots", "salads", SP, True),
    ("super-plates-salads-and-protein-pots", "protein-pots", SP, True),
    ("sweet-and-savoury-snacks", "yoghurt-bowls-and-birchers", SN, True),
    ("sweet-and-savoury-snacks", "crisps-and-popcorn", SN, False),
    ("sweet-and-savoury-snacks", "pastries", SN, False),
    ("sweet-and-savoury-snacks", "bars-and-bites", SN, False),
    ("sweet-and-savoury-snacks", "nuts-and-dried-fruit-snacks", SN, False),
    ("sweet-and-savoury-snacks", "cookies-and-cakes", SN, False),
    ("fruit-and-fruit-pots", "fresh-fruit", FR, False),
    ("fruit-and-fruit-pots", "fruit-pots", FR, False),
    ("little-pret-stars", "<top>", KD, False),                 # children's portions: not suggested as an adult order
    ("veggie-and-vegan-friendly", "<top>", VG, True),         # only reached by items listed nowhere else
    ("hot-drinks", "coffee", HD, False),
    ("hot-drinks", "tea-and-other-hot-drinks", HD, False),
    ("cold-drinks", "iced-favourites", CD, False),
    ("cold-drinks", "iced-coffee", CD, False),
    ("cold-drinks", "juices-and-smoothies", CD, False),
    ("cold-drinks", "water-and-soft-drinks", CD, False),
    ("pret-at-home", "coffee-at-home", AH, False),
]
# Site subcategory entries that exist but are only an "all" view with no products of their own.
ALL_VIEWS = {"All"}

# Printed nutrient labels (perServing column) -> CSV column.
LABELS = {
    "Energy (KJ)": "kj", "Energy (Kcal)": "calories", "Fat (g)": "fat_g", "of which saturates (g)": "sat_fat_g",
    "Carbohydrates (g)": "carbs_g", "of which sugars (g)": "sugar_g", "Fibre (g)": "fiber_g", "Protein (g)": "protein_g",
    "Salt (g)": "salt_g", "Sodium (mg)": "sodium_mg",
}
# Extra printed rows we do not use (micronutrients); any other unknown label makes the script stop.
IGNORED_LABELS = {
    "Calcium (mg)", "Chloride (mg)", "Copper (mg)", "Fat (Mono Unsaturated) (g)", "Fat (Poly Unsaturated) (g)", "Folate (\u03bcg)",
    "Iodine (\u03bcg)", "Iron (mg)", "Magnesium (mg)", "Niacin (mg)", "Phosphorus (mg)", "Potassium (mg)", "Riboflavin (mg)",
    "Selenium (\u03bcg)", "Thiamin (mg)", "Trans Fats (g)", "Vitamin B12 (\u03bcg)", "Vitamin B6 (mg)", "Vitamin C (mg)", "Zinc (mg)",
}
UNKNOWN_LABELS: set[str] = set()
REQUIRED = {"kj", "calories", "fat_g", "carbs_g", "protein_g"}  # the others are left blank when a row does not print them
NUM = re.compile(r"<?\d+(?:\.\d+)?")
# Variant rows of barista drinks are labelled from the site's own flags (baristaAttributes), checked against its `milk` /
# `caffeine` fields. A milk row with no flag at all ("NO_MILK" on a latte, say) is not explained anywhere on the page.
MILK_FLAGS = {"isBlack": "black", "milkIsOat": "oat milk", "milkIsSemiSkimmed": "semi-skimmed milk", "milkIsSkimmed": "skimmed milk",
              "milkIsSoya": "soya milk", "milkIsHalfAndHalf": "half and half", "milkIsWhole": "whole milk", "milkIsAlmond": "almond milk"}
MILK_ENUM = {"OAT": "milkIsOat", "SEMI_SKIMMED": "milkIsSemiSkimmed", "SKIMMED": "milkIsSkimmed", "SOYA": "milkIsSoya",
             "HALF_AND_HALF": "milkIsHalfAndHalf", "WHOLE": "milkIsWhole", "ALMOND": "milkIsAlmond"}
CAFFEINE_FLAGS = {"isDecaf": "decaf", "isDecafPod": "decaf pod", "isHalfCaf": "half-caf"}


def variant_label(name: str, v: dict) -> tuple[str, str | None]:
    """(milk label or "", caffeine label or "") for a variant; stops on anything not understood."""
    a = v["baristaAttributes"]
    if any(a["cupSizes"].values()) or v["cupSize"] != "NONE":
        raise SystemExit(f"{name}: a cup-size variant appeared ({v['sku']}): extend variant_label() in pret.py.")
    milk_on = [k for k, on in a["milkOptions"].items() if on]
    caf_on = [k for k, on in a["caffeine"].items() if on]
    if len(milk_on) > 1 or any(k not in MILK_FLAGS for k in milk_on) or any(k not in CAFFEINE_FLAGS for k in caf_on):
        raise SystemExit(f"{name}: unexpected variant flags {milk_on} {caf_on} ({v['sku']}): extend variant_label() in pret.py.")
    want = MILK_ENUM.get(v["milk"])
    if (want and milk_on != [want]) or (v["milk"] == "NO_MILK" and milk_on not in ([], ["isBlack"])) or v["milk"] not in {*MILK_ENUM, "NO_MILK"}:
        raise SystemExit(f"{name}: milk {v['milk']} disagrees with flags {milk_on} ({v['sku']}): re-check by hand.")
    if (v["caffeine"] == "DECAF") != ("isDecaf" in caf_on) or v["caffeine"] not in {"DECAF", "CAFFEINATED"}:
        raise SystemExit(f"{name}: caffeine {v['caffeine']} disagrees with flags {caf_on} ({v['sku']}): re-check by hand.")
    caf = "decaf pod" if "isDecafPod" in caf_on else ("decaf" if "isDecaf" in caf_on else ("half-caf" if "isHalfCaf" in caf_on else ""))
    return (MILK_FLAGS[milk_on[0]] if milk_on else None), caf


PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pork|salami|chorizo|prosciutto|gammon|pancetta|nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_UNSTATED = re.compile(r"\b(meatballs?|mince|minced|meat|hot dogs?|burgers?|kebabs?|lamb|turkey)\b", re.I)
SEASONAL = re.compile(r"\b(seasonal|limited[- ]edition|limited[- ]time)\b", re.I)


def slug(name: str) -> str:
    name = "".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c))  # jalapeño -> jalapeno
    out = "".join(c.lower() if c.isalnum() and c.isascii() else "-" for c in name.replace("'", "").replace("’", ""))
    return "-".join(p for p in out.split("-") if p)


def tidy(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def plain(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "")


def read_nutrition(rows: list, who: str) -> dict[str, str] | None:
    """{csv column: printed per-serving value} from a product's (or variant's) `nutritionals` table."""
    got: dict[str, str] = {}
    for row in rows:
        d = {c["name"]: c["value"] for c in row}
        label = d.get("nutrient")
        if label not in LABELS:
            if label not in IGNORED_LABELS:
                UNKNOWN_LABELS.add(label)
            continue
        v = d.get("perServing")
        if v is None or not NUM.fullmatch(v):
            raise SystemExit(f"{who}: perServing value {v!r} for {label} is not a number as expected: re-check by hand.")
        got[LABELS[label]] = v
    missing = REQUIRED - set(got)
    if missing:
        return None
    return got


def num(v: str) -> float:
    return 0.0 if v.startswith("<") else float(v)


def collect(rawdir: Path):
    """Unique products in first-seen priority order: [(product, display category, rankable, [(cat, sub)...])]."""
    pages = pret_feed.load(rawdir)
    for slug_, pp in pages:
        live = [c["slug"] for c in pp["categories"]]
        if set(live) != set(pret_feed.CATEGORY_SLUGS):
            raise SystemExit(f"The site's category list changed: {live}. Update CATEGORY_SLUGS in pret_feed.py and PRIORITY in pret.py.")
    found: dict[str, dict] = {}
    places: dict[str, list[tuple[str, str]]] = {}
    for cat, pp in pages:
        sc = pp["selectedCategory"]
        groups = [("<top>", sc.get("products") or [])] + [(s["slug"], s.get("products") or []) for s in sc.get("subcategories") or []]
        for sub, prods in groups:
            if not prods:
                continue
            if not any(cat == c and sub == s for c, s, _, _ in PRIORITY):
                raise SystemExit(f"New site section with products: {cat} / {sub}. Add it to PRIORITY in pret.py after checking it.")
            for p in prods:
                if p["id"] in found and found[p["id"]] != p:
                    raise SystemExit(f"{p['name']!r} appears twice with different data ({cat}/{sub}): re-check by hand.")
                found[p["id"]] = p
                places.setdefault(p["id"], []).append((cat, sub))
    out = []
    for pid, p in found.items():
        for c, s, display, rankable in PRIORITY:
            if (c, s) in places[pid]:
                out.append((p, display, rankable, places[pid]))
                break
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    out.sort(key=lambda t: order[t[1]])
    return out


def build_items(rawdir: Path):
    items, excluded, notes_log = [], [], []
    products = collect(rawdir)
    print(f"products read: {len(products)} unique ({sum(1 for p, *_ in products if p.get('variants'))} with drink variants)")
    for p, display, rankable, where in products:
        name = tidy(p["name"])
        sku = p["sku"]
        if not sku.startswith("UK"):
            raise SystemExit(f"{name}: SKU {sku} is not a UK SKU: re-check the market.")
        variants = p.get("variants") or []
        if not variants:
            if not p["nutritionals"]:
                excluded.append((name, sku, "no nutrition table printed"))
                continue
            entries = [(name, p["nutritionals"], None)]
        else:
            default = [v for v in variants if v.get("defaultVariant")]
            if len(default) != 1:
                raise SystemExit(f"{name}: expected exactly one default variant, found {len(default)}.")
            entries = []
            for v in variants:
                milk, caf = variant_label(name, v)
                default_row = v is default[0]
                if milk is None and not default_row:
                    excluded.append((f"{name} (variant {v['sku']}{', ' + caf if caf else ''})", v["sku"],
                                     "milk row with no milk named (flags all off): not explained on the page"))
                    continue
                # The default row is what the product page shows on load: a black drink's default has no milk suffix.
                parts = [x for x in ((None if milk in (None, "black") and default_row else milk), caf) if x]
                iname = f"{name} ({', '.join(parts)})" if parts else name
                entries.append((iname, v["nutritionals"], v))
        for iname, table, v in entries:
            n = read_nutrition(table, iname)
            if n is None:
                printed = [{c["name"]: c["value"] for c in r}.get("nutrient") for r in table]
                excluded.append((iname, p["sku"] if v is None else v["sku"], f"required nutrient not printed (prints: {', '.join(printed)})"))
                continue
            desc = (p.get("description") or "")
            ing = plain(p.get("ingredients"))
            veg = bool(p["suitableForVegetarians"] or p["suitableForVegans"])
            tags = []
            if veg:
                tags.append("vegetarian")
            text = f"{iname} {ing}"
            pork, beef = PORK.search(text), BEEF.search(text)
            notes = []
            if not veg:
                if pork:
                    tags.append("contains_pork")
                if beef:
                    tags.append("contains_beef")
                if not pork and not beef and MEAT_UNSTATED.search(f"{iname} {ing}"):
                    notes_log.append(("meat type not stated", iname, MEAT_UNSTATED.search(f"{iname} {ing}").group(0)))
            elif pork or beef:
                notes.append(f"marked vegetarian/vegan by Pret but the text mentions {(pork or beef).group(0)!r}: not tagged")
                notes_log.append(("veg-flag vs meat word", iname, (pork or beef).group(0)))
            limited = bool(SEASONAL.search(f"{p['name']} {desc}"))
            if limited:
                notes.append("Pret's own description calls it seasonal")
            kj, kcal = num(n["kj"]), num(n["calories"])
            if abs(kj - 4.184 * kcal) > max(0.05 * kj, 8):  # 8 kJ is about 2 kcal of rounding
                notes.append(f"printed kJ {n['kj']} and kcal {n['calories']} do not agree")
            if n.get("sat_fat_g") and num(n["sat_fat_g"]) > num(n["fat_g"]):
                notes.append("saturates printed higher than fat")
            if n.get("sugar_g") and num(n["sugar_g"]) > num(n["carbs_g"]):
                notes.append("sugars printed higher than carbohydrate")
            for col, label in (("sat_fat_g", "saturates"), ("sugar_g", "sugars"), ("fiber_g", "fibre"), ("salt_g", "salt")):
                if col not in n:
                    notes.append(f"{label} not printed")
            if "sodium_mg" in n:
                notes.append("row prints both salt (g) and sodium (mg): both entered as printed, neither converted" if "salt_g" in n
                             else "row prints sodium (mg) only: entered as printed, not converted")
            p4 = 4 * num(n["protein_g"]) + 4 * num(n["carbs_g"]) + 9 * num(n["fat_g"])
            if kcal >= 50 and abs(kcal - p4) > 0.15 * kcal and n.get("fiber_g"):
                if abs(kcal - (p4 + 2 * num(n["fiber_g"]))) <= 0.10 * kcal:
                    notes.append("kcal is above 4P+4C+9F because UK labels count fibre separately from carbohydrate (about 2 kcal/g); "
                                 "kcal entered as printed")
            items.append({
                "id": slug(iname), "name": iname, "category": display, "serving": "",
                "calories": n["calories"], "protein_g": n["protein_g"], "carbs_g": n["carbs_g"], "fat_g": n["fat_g"],
                "sat_fat_g": n.get("sat_fat_g", ""), "sodium_mg": n.get("sodium_mg", ""), "salt_g": n.get("salt_g", ""),
                "sugar_g": n.get("sugar_g", ""), "fiber_g": n.get("fiber_g", ""),
                "tags": "|".join(tags), "limited_time": str(limited).lower(), "rankable": str(rankable).lower(),
                "components": "", "added_on": "", "notes": "; ".join(notes),
            })
    if UNKNOWN_LABELS:
        raise SystemExit(f"Unknown nutrient labels {sorted(UNKNOWN_LABELS)}: add each to LABELS (if we use it) or IGNORED_LABELS in pret.py.")
    ids = [i["id"] for i in items]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise SystemExit(f"Duplicate item ids {dupes}: two products share a name, re-check by hand.")
    bad = [i["id"] for i in items if i["id"].startswith(("var-", "combo-"))]
    if bad:
        raise SystemExit(f"Reserved id prefix: {bad}")
    return items, excluded, notes_log


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--fetch", type=Path, metavar="DIR", help="download the category data once into DIR, then extract")
    g.add_argument("--raw", type=Path, metavar="DIR", help="extract from category files already saved in DIR")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you downloaded the data")
    ap.add_argument("--expect", type=int, default=EXPECTED_ITEMS, help="expected number of items (stop if different)")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rawdir = args.fetch or args.raw
    if args.fetch:
        pret_feed.fetch(rawdir)
    items, excluded, notes_log = build_items(rawdir)
    if args.expect and len(items) != args.expect:
        print(f"{len(items)} items extracted but {args.expect} were expected. The menu changed: re-check the names, categories and "
              "the excluded list (run once with the new count in --expect to see it), then update EXPECTED_ITEMS.", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)
    fields = ["id", "name", "category", "serving", "calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "sodium_mg", "salt_g",
              "sugar_g", "fiber_g", "tags", "limited_time", "rankable", "components", "added_on", "notes"]
    with open(args.out / "items.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(items)
    title = SOURCE_TITLE.format(checked_on=args.checked_on)
    (args.out / "chain.csv").write_text(
        "id,name,cuisine,builder_type,source_title,source_url,checked_on,aliases,sample\n"
        f'{CHAIN_ID},Pret A Manger,Sandwiches,standard,"{title}",{SOURCE_URL},{args.checked_on},pret|pret a manger|pret uk|pret a manger uk,\n',
        encoding="utf-8")
    (args.out / "components.csv").write_text(
        "id,group,name,portion,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags,removable,allow_double\n", encoding="utf-8")
    (args.out / "modifiers.csv").write_text(
        "item_id,id,label,kind,calories,protein_g,carbs_g,fat_g,sat_fat_g,sodium_mg,salt_g,sugar_g,fiber_g,tags\n", encoding="utf-8")
    (args.out / "combos.csv").write_text("id,name,item_ids\n", encoding="utf-8")

    digests = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(rawdir.glob("*.json"))}
    combined = hashlib.sha256("".join(f"{k}:{v}\n" for k, v in digests.items()).encode()).hexdigest()
    print(f"wrote {len(items)} items to {args.out}")
    by_cat: dict[str, int] = {}
    for i in items:
        by_cat[i["category"]] = by_cat.get(i["category"], 0) + 1
    for c in CATEGORY_ORDER:
        if c in by_cat:
            print(f"  {c}: {by_cat[c]}")
    print(f"excluded ({len(excluded)}):")
    for e in excluded:
        print("  ", e)
    print("log:")
    for e in notes_log:
        print("  ", e)
    print("sha256 of each saved category file:")
    for k, v in digests.items():
        print(f"  {v}  {k}")
    print(f"combined sha256 (of the lines above): {combined}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
