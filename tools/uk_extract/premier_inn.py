#!/usr/bin/env python3
"""Build data/source/premier-inn/ from Premier Inn's three official "Allergy and dietary information" PDFs.

    python3 tools/uk_extract/premier_inn.py --restaurant allergy-nutrition-thyme-2.pdf \
        --breakfast allergy-nutrition-breakfast.pdf --hub allergy-nutrition-hub.pdf --checked-on 2026-10-06
    (add --list to print every row the script reads, with the decision taken, and write nothing)

Sources (Great Britain editions; the -ROI-NI variants are not used), all under
https://www.premierinn.com/content/dam/global/restaurants/allergy-nutrition-info/ :
  allergy-nutrition-thyme-2.pdf    restaurant menus (5 menu blocks, see RESTAURANT_MENUS), published 8 April 2026
  allergy-nutrition-breakfast.pdf  Unlimited Cooked Breakfast and buffet items, published 9 April 2026
  allergy-nutrition-hub.pdf        Hub by Premier Inn, published 20 April 2026

Numbers are copied from the PDFs as printed (kcal, fat, saturates, carbs, sugars, protein, salt; kJ is not used and the
guides print no fibre or sodium). Everything is "Per Portion"; where the printed name gives the portion ("(per piece)",
"(per 30g)") that is the serving. Only names (tidied capitalisation), categories, tags and the exclusions below are
decided here. The script stops with a clear message if the guides' rows, headings or names change, so a human re-checks.

Rules applied when the same dish is printed more than once:
  * same name, same numbers  -> one item (the repeats are dropped);
  * same name, different numbers:
      - a version found only on the "Non Gluten Containing Ingredients" menus -> its own item, named "... (non-gluten
        containing ingredients)";
      - a version found only in the Hub guide -> its own item in "Hub by Premier Inn", named "... (Hub)";
      - two or more versions on the standard menus -> NONE is published (the guide does not say which applies): all are
        written to items.csv and listed in holdback.csv.
"""
import argparse
import hashlib
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import premier_inn_pdf  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "premier-inn"
SOURCE_URL = "https://www.premierinn.com/content/dam/global/restaurants/allergy-nutrition-info/allergy-nutrition-thyme-2.pdf"
SOURCE_TITLE = ("Premier Inn allergy and nutrition guides: restaurant menus (published 8 April 2026), Unlimited Cooked "
                "Breakfast (9 April 2026) and Hub by Premier Inn (20 April 2026)")
ALIASES = ["premier inn", "premier inn hotel", "premier inn restaurant", "hub by premier inn"]
NOTE = ("Values are per portion from Premier Inn's own guides for its restaurants, breakfast buffet and Hub by Premier Inn "
        "(its drinks menu lists allergens only). Menus differ by hotel, so not every item is served everywhere. Dishes the "
        "guide prints twice with different numbers are not shown.")

# Things a human noticed in the guides (kept out of the numbers, which are always entered as printed). Keyed by item id.
KCAL_NOTE = "Printed kcal {dir} than the printed fat, carbs and protein add up to (about {approx}); kJ agrees with kcal; entered as printed"
EXTRA_NOTES = {
    "5-crispy-prawns-with-dip": KCAL_NOTE.format(dir="is higher", approx="243"),
    "add-crispy-prawns-x-5": KCAL_NOTE.format(dir="is higher", approx="154"),
    "add-corn-ribs": KCAL_NOTE.format(dir="is lower", approx="90"),
    "chipotle-beef-chilli-topped-chips-sharer-per-person": "Printed with the same numbers as the single portion above it",
    "chipotle-beef-chilli-topped-baked-chips-sharer-per-portion": "Printed with the same numbers as the single portion below it",
    "katsu-chicken-topped-chips-sharer-per-person": "Printed within 1 kcal of the single portion",
    "katsu-chicken-topped-baked-chips-sharer-per-portion": "Printed within 1 kcal of the single portion",
    "big-stack-burger-with-baked-chips-without-bun-non-gluten-containing-ingredients":
        "Printed numbers match the standard version except salt (2.77 g here, 4.76 g standard)",
    "chicken-caesar-bacon-sandwhich": "Name spelled as printed",
    "grilled-mediterranean-sea-bas-with-veg": "Name spelled as printed",
    "spinach-and-riccotta-fresh-pasta": "Name spelled as printed",
    "add-jalapeos": "Name spelled as printed",
    "gluten-free-museli-per-50g": "Name spelled as printed",
    "museli-fruit-per-45g": "Name spelled as printed",
    "demerra-brown-sugar-per-sachet": "Name spelled as printed",
    "chicken-tikka-pizzette-bid": "Name as printed, including (BID)",
}

# ---- categories (display order) -------------------------------------------------------------------------------------
STARTERS, SOUP, SALADS, SAND, PIZZA, JACKET = "Starters & light bites", "Soup", "Salads & bowls", "Sandwiches & toasties", "Pizza", "Jacket potatoes"
BURGERS, GRILLS, CLASSICS, PASTA, SIDES = "Burgers", "Grills", "Classics & curries", "Pasta", "Sides"
DESSERTS, TREATS = "Desserts", "Sweet treats"
KIDSM, KIDSS, KIDSD = "Kids mains", "Kids starters & sides", "Kids desserts"
CONDI, ADDON = "Condiments", "Add-ons"
B_COOK, B_BAKE, B_FRUIT, B_CEREAL, B_PORR, B_SPREAD, B_DRINK, B_SUGAR = (
    "Cooked breakfast", "Breakfast bakery", "Breakfast fruit", "Cereals & yoghurts", "Porridge", "Spreads & preserves",
    "Breakfast drinks", "Sugar & sweetener")
HUB = "Hub by Premier Inn"
CATEGORY_ORDER = [STARTERS, SOUP, SALADS, SAND, PIZZA, JACKET, BURGERS, GRILLS, CLASSICS, PASTA, SIDES, DESSERTS, TREATS,
                  KIDSM, KIDSS, KIDSD, CONDI, ADDON, B_COOK, B_BAKE, B_FRUIT, B_CEREAL, B_PORR, B_SPREAD, B_DRINK, B_SUGAR, HUB]

# printed heading -> (category, rankable). Every heading the script meets must be listed here or in HUB_EXCLUDED.
RESTAURANT_SECTIONS = {
    "Nibbles": (STARTERS, True), "Light Bites": (STARTERS, True), "Starters": (STARTERS, True),
    "Salads": (SALADS, True), "Mains - Salads": (SALADS, True),
    "House Toasties": (SAND, True), "Sandwiches": (SAND, True),
    "Pizza": (PIZZA, True), "Mains - Pizza": (PIZZA, True),
    "Jacket Potatoes": (JACKET, True), "Mains - Burgers": (BURGERS, True), "Mains - Grills": (GRILLS, True),
    "Mains - Classics": (CLASSICS, True), "Mains - Pasta": (PASTA, True), "Sides": (SIDES, True),
    "Desserts": (DESSERTS, False), "Sweet Treats": (TREATS, False),
    "Kids - Mains": (KIDSM, True), "Kids Mains - Smaller Appetites": (KIDSM, True), "Kids Mains - Larger Appetites": (KIDSM, True),
    "Kids - Starters": (KIDSS, True), "Kids Starters": (KIDSS, True), "Kids Sides": (KIDSS, True),
    "Kids - Desserts": (KIDSD, False), "Kids Desserts": (KIDSD, False),
    "Condiments": (CONDI, False), "Condiments - V": (CONDI, False),
    "Upgrade": (ADDON, False), "Add Bun or Salad": (ADDON, False), "Add NGCI Bun or Salad": (ADDON, False),
}
BREAKFAST_SECTIONS = {
    "Unlimited Cooked Breakfast": (B_COOK, False), "Bakery": (B_BAKE, False), "Fruits": (B_FRUIT, False),
    "Cereals & Yoghurts": (B_CEREAL, False), "Porridge": (B_PORR, False), "Preserves, Spreads & Jam": (B_SPREAD, False),
    "Cold Drinks": (B_DRINK, False), "Milk": (B_DRINK, False), "Sugar": (B_SUGAR, False),
}
HUB_SECTIONS = {  # the Hub guide's restaurant dishes (pages 15-16)
    "Hub Large - Light Bites": (HUB, True), "Hub Small - Light Bites": (HUB, True),
    "Hub Large - Mains": (HUB, True), "Hub Small - Mains": (HUB, True), "Desserts": (HUB, False),
}
HUB_BREAKFAST_REASON = ("Hub breakfast tables (guide pages 2-14) are not used: the first block lists ingredient contributions to a "
                        "composite breakfast with no stated serving (e.g. Weetabix per 2 biscuits 1 kcal, Greek yoghurt per 125 g 0 kcal), "
                        "and the rest repeat the Unlimited Cooked Breakfast guide's items, some with different numbers for the same name "
                        "inside the Hub guide itself (e.g. Demerra sugar sachet 29 kJ vs 43 kJ, streaky bacon 91 vs 31 kcal)")
HUB_EXCLUDED = {h: HUB_BREAKFAST_REASON for h in (
    "Breakfast", "Hub Lounge and Proven Dough Breakfast", "HUB LOUNGE CONT BREAKFAST SS25", "HUB CONTINENTAL BREAKFAST- PRESERVES, SPREADS AND JAM (per item) - V",
    "HUB LOUNGE CONT - BAKERY (per item/ slice) - V", "HUB LOUNGE CONT - SUGAR - VE",
    "HUB LOUNGE CONTINENTAL - DRINKS (per serving) - VE", "HUB LOUNGE HOT BREAKFAST", "UNLIMITED CONTINENTAL - FRUITS",
    "Hub Lounge Continental - Cereal & Yoghurts", "Hub Lounge Continental - Fruits", "Unlimited Continental - Bakery",
    "Hub Lounge Continental - Preserve and Spreads", "Hub Lounge Continental - Sugar (per sachet)",
    "Hub Lounge Continental - Drinks", "Hub Lounge Hot Breakfast (per item)")}

# Restaurant guide page ranges: menu label, first page, last page. Pages 1 and 52-60 carry no nutrition tables
# (introduction; drinks menu with allergen ticks only).
RESTAURANT_MENUS = [("menu 1", 2, 6), ("menu 2", 7, 22), ("menu 3", 23, 38), ("non-gluten menu (chips)", 40, 45),
                    ("non-gluten menu (baked chips)", 46, 51)]
NGCI_MENUS = {"non-gluten menu (chips)", "non-gluten menu (baked chips)"}
NGCI_SUFFIX = " (non-gluten containing ingredients)"

# What the three PDFs contained when this script was written (April 2026 guides). Counts are rows per source/menu; the
# hash covers every printed heading and item name in order (not the numbers, which may change month to month).
EXPECTED_ROWS = {"restaurant/menu 1": 40, "restaurant/menu 2": 151, "restaurant/menu 3": 153,
                 "restaurant/non-gluten menu (chips)": 52, "restaurant/non-gluten menu (baked chips)": 52,
                 "breakfast/all": 57, "hub/all": 140}
EXPECTED_NAMES_SHA256 = "218de75829518f9771347422849590d85b2a0ce8b44512f48cc98d8937f71194"

# ---- item rules -----------------------------------------------------------------------------------------------------
KEEP_UPPER = {"BBQ", "BLT", "HP", "BID"}
SMALL = {"with", "and", "of", "in", "the", "a", "on"}
PORK = re.compile(r"\b(bacon|ham|gammon|pepperoni|sausages?|pork|salami|chorizo|blt)\b", re.I)
BEEF = re.compile(r"\b(beef|sirloin)\b", re.I)
RED_MEAT_UNSTATED = re.compile(r"\b(burger|bolognese|bologense|mixed grill|black pudding|mince)\b", re.I)
UNIT_WORDS = {"piece": "1 piece", "spoon": "1 spoon", "slice": "1 slice", "half": "1 half", "fruit": "1 fruit", "each": "1 each",
              "sachet": "1 sachet", "person": "1 person", "portion": "1 portion"}


def tidy_name(raw: str) -> str:
    """Tidy capitalisation only: 'BIG STACK BURGER WITH CHIPS' -> 'Big Stack Burger with Chips'. Words already in lower or
    mixed case, and spelling (typos included), are kept exactly as printed."""
    out = []
    for i, word in enumerate(re.sub(r"\(\s+", "(", raw).split()):
        core = word.strip("()")
        if not core.isupper() or core in KEEP_UPPER or not re.search(r"[A-Z]", core):
            out.append(word)
            continue
        if re.fullmatch(r"\d+(OZ|G|ML)", core):
            new = core.lower()
        elif core.lower() in SMALL and i > 0:
            new = core.lower()
        else:
            new = "-".join(p.capitalize() for p in core.split("-"))
        out.append(word.replace(core, new))
    return " ".join(out)


def split_diet(printed: str) -> tuple[str, str]:
    """('SKIN-ON CHIPS - VE') -> ('SKIN-ON CHIPS', 'VE'). The guide's own V / VE mark; '' when unmarked."""
    m = re.match(r"^(.*?)\s*-\s*(VE|V)$", printed)
    return (m.group(1).strip(), m.group(2)) if m else (printed.strip(), "")


def norm_key(base: str) -> str:
    """Name key for spotting repeats: case, '&'/'and', the word 'a' and the guide's BOLOGENSE typo don't matter."""
    toks = re.findall(r"[a-z0-9]+", base.lower().replace("&", " and "))
    return " ".join("bolognese" if t == "bologense" else t for t in toks if t != "a")


def serving_of(base: str) -> str:
    m = re.search(r"\(per ([^)]+)\)", base)
    if not m:
        return "1 portion"  # the guides print "Per Portion" for every table
    unit = m.group(1).strip()
    if unit in UNIT_WORDS:
        return UNIT_WORDS[unit]
    m2 = re.fullmatch(r"(\d+)\s*(g|ml)", unit)
    return f"{m2.group(1)} {m2.group(2)}" if m2 else unit


def meat_tags(base: str, diet: str) -> list[str]:
    if diet or re.search(r"\bvegan\b|\bvegetable\b|\bveggie\b", base, re.I):
        return []
    tags = []
    if PORK.search(base):
        tags.append("contains_pork")
    if BEEF.search(base):
        tags.append("contains_beef")
    return tags


# ---- reading ---------------------------------------------------------------------------------------------------------
def collect(restaurant: Path, breakfast: Path, hub: Path):
    """Read the three PDFs. Returns (rows, row counts per source/menu, hash of the printed headings and names).
    Stops on a heading or page it does not know."""
    cands, counts, sig = [], Counter(), []
    sources = [("restaurant", "Restaurant guide", restaurant), ("breakfast", "Breakfast guide", breakfast), ("hub", "Hub guide", hub)]
    for key, label, pdf in sources:
        for r in premier_inn_pdf.read_rows(pdf):
            page, headings = r["page"], r["headings"]
            if key == "restaurant":
                menu = next((m for m, a, b in RESTAURANT_MENUS if a <= page <= b), None)
                if menu is None:
                    raise SystemExit(f"Restaurant guide page {page} has a nutrition table outside the known menu pages {RESTAURANT_MENUS}: "
                                     "the guide's layout changed. Re-check RESTAURANT_MENUS in premier_inn.py.")
                counts[f"restaurant/{menu}"] += 1
            else:
                menu = "all"
                counts[f"{key}/all"] += 1
            sig.append(f"{key}|{menu}|{'/'.join(headings)}|{r['printed_name']}")
            r.update(source=key, source_label=label, menu=menu)
            r["_headings"] = headings
            cands.append(r)
    # sections are sticky: a heading applies to the rows after it until the next heading
    section = {}
    for r in cands:
        cur = section.get(r["source"])
        sec_map = {"restaurant": RESTAURANT_SECTIONS, "breakfast": BREAKFAST_SECTIONS, "hub": {**HUB_SECTIONS, **HUB_EXCLUDED}}[r["source"]]
        for h in r["_headings"]:
            if h not in sec_map:
                raise SystemExit(f"{r['source_label']} page {r['page']}: unknown section heading {h!r}. The guide changed: decide its "
                                 "category in premier_inn.py (RESTAURANT_SECTIONS / BREAKFAST_SECTIONS / HUB_SECTIONS / HUB_EXCLUDED).")
            cur = h
        if cur is None:
            # A hub block starts with a heading on its own; a missing heading means the name line itself is the group header
            raise SystemExit(f"{r['source_label']} page {r['page']}: no section heading before {r['printed_name']!r}")
        section[r["source"]] = cur
        r["section"] = cur
    digest = hashlib.sha256("\n".join(sig).encode()).hexdigest()
    return cands, dict(counts), digest


def problems(counts: dict, digest: str) -> list[str]:
    """Differences between the PDFs and what this script was written for (empty = identical item set)."""
    out = []
    if counts != EXPECTED_ROWS:
        diff = {k: (counts.get(k, 0), EXPECTED_ROWS.get(k, 0)) for k in sorted(set(counts) | set(EXPECTED_ROWS))
                if counts.get(k, 0) != EXPECTED_ROWS.get(k, 0)}
        out.append("row counts changed (found, expected): " + repr(diff))
    if digest != EXPECTED_NAMES_SHA256:
        out.append(f"the printed headings or item names changed (names hash {digest})")
    return out


def build(cands):
    """Turn raw rows into (items, held_back, exclusions)."""
    exclusions: Counter = Counter()
    rows = []
    for r in cands:
        sec = r["section"]
        base, diet = split_diet(r["printed_name"])
        if r["source"] == "hub":
            if sec in HUB_EXCLUDED:
                exclusions[HUB_EXCLUDED[sec]] += 1
                continue
            cat, rank = HUB_SECTIONS[sec]
            origin = "hub"
        elif r["source"] == "breakfast":
            cat, rank = BREAKFAST_SECTIONS[sec]
            origin = "std"
        else:
            cat, rank = RESTAURANT_SECTIONS[sec]
            origin = "ngci" if r["menu"] in NGCI_MENUS else "std"
        if r["source"] != "hub":
            if re.match(r"^add\b", base, re.I):
                cat, rank = ADDON, False
            elif re.search(r"\bsoup\b", base, re.I):
                cat, rank = SOUP, True
            if base.upper() == "PIZZA BASE":
                rank = False
            if r["source"] == "breakfast" and base.upper().startswith("PORRIDGE WITH"):
                rank = True
        nums = tuple(r[k] for k in ("kcal", "protein", "carbs", "fat", "sat", "sugars", "salt"))
        rows.append(dict(r, base=base, diet=diet, cat=cat, rank=rank, origin=origin, nums=nums, key=norm_key(base)))

    groups: "OrderedDict[str, OrderedDict[tuple, list]]" = OrderedDict()
    for r in rows:
        groups.setdefault(r["key"], OrderedDict()).setdefault(r["nums"], []).append(r)

    items, held = [], []
    for key, variants in groups.items():
        def origin_of(v):
            os_ = {c["origin"] for c in v}
            return "std" if "std" in os_ else ("ngci" if "ngci" in os_ else "hub")
        tagged = [(origin_of(v), v) for v in variants.values()]
        std_v = [v for o, v in tagged if o == "std"]
        ngci_v = [v for o, v in tagged if o == "ngci"]
        hub_v = [v for o, v in tagged if o == "hub"]
        if len(ngci_v) > 1 or len(hub_v) > 1:
            raise SystemExit(f"{key!r}: several different versions on the non-gluten or Hub menus only: decide how to name them.")
        plan = [(v, "") for v in std_v]
        if ngci_v:
            plan.append((ngci_v[0], "ngci"))
        if hub_v:
            plan.append((hub_v[0], "hub"))
        holdback_all = len(std_v) > 1
        std_seen = 0
        for v, kind in plan:
            cs = v
            raw = Counter(c["printed_name"] for c in cs).most_common(1)[0][0]
            base = tidy_name(split_diet(raw)[0])
            name = base
            if kind == "ngci" and "non gluten containing" not in base.lower():
                name = base + NGCI_SUFFIX
            elif kind == "hub":
                name = base + " (Hub)"
            core = [c for c in cs if c["origin"] != "hub"] or cs  # Hub repeats of a Thyme dish don't decide its category
            cat = HUB if kind == "hub" else Counter(c["cat"] for c in core).most_common(1)[0][0]
            diet = "VE" if any(c["diet"] == "VE" for c in cs) else ("V" if any(c["diet"] == "V" for c in cs) else "")
            pages = sorted({(c["source_label"], c["page"]) for c in cs})
            where = "; ".join(f"{lab} p{'/'.join(str(p) for l2, p in pages if l2 == lab)}" for lab in OrderedDict((l, 0) for l, _ in pages))
            c0 = cs[0]
            item = dict(name=name, category=cat, serving=serving_of(split_diet(raw)[0]),
                        calories=c0["kcal"], protein_g=c0["protein"], carbs_g=c0["carbs"], fat_g=c0["fat"], sat_fat_g=c0["sat"],
                        sugar_g=c0["sugars"], salt_g=c0["salt"],
                        tags="|".join((["vegetarian"] if diet else []) + meat_tags(base, diet)),
                        rankable=all(c["rank"] for c in core), notes=where)
            if kind == "ngci":
                item["notes"] += "; from the guide's Non Gluten Containing Ingredients menu"
            if kind == "hub":
                item["notes"] += "; Hub by Premier Inn hotels only"
            if holdback_all and kind == "":
                std_seen += 1
                item["id"] = slug(name) + ("" if std_seen == 1 else f"-{std_seen}")
                others = [x[1][0]["kcal"] for x in tagged if x[0] == "std" and x[1] is not v]
                item["_held"] = (f"The guide prints this dish twice on its standard menus with different numbers ({c0['kcal']} kcal here, "
                                 f"{' and '.join(str(k) for k in others)} kcal in the other), so we can't tell which applies")
                item["notes"] += "; HELD BACK: conflicting versions"
            else:
                item["id"] = slug(name)
            item["_cands"] = cs
            items.append(item)
    for i in items:
        if i["id"] in EXTRA_NOTES:
            i["notes"] += "; " + EXTRA_NOTES[i["id"]]
    missing = [k for k in EXTRA_NOTES if k not in {i["id"] for i in items}]
    assert not missing, f"EXTRA_NOTES names items that no longer exist: {missing}"
    # sort categories into display order (stable inside a category)
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids: " + repr([k for k, n in Counter(ids).items() if n > 1])
    held = [(i["id"], i["_held"]) for i in items if "_held" in i]
    return items, held, exclusions


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--restaurant", type=Path, required=True, help="allergy-nutrition-thyme-2.pdf (restaurant menus)")
    ap.add_argument("--breakfast", type=Path, required=True, help="allergy-nutrition-breakfast.pdf")
    ap.add_argument("--hub", type=Path, required=True, help="allergy-nutrition-hub.pdf")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDFs")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--list", action="store_true", help="print the decisions and write nothing")
    args = ap.parse_args()

    cands, counts, digest = collect(args.restaurant, args.breakfast, args.hub)
    diffs = problems(counts, digest)
    if diffs and not args.list:
        print("The guides no longer match what premier_inn.py was written for: " + "; ".join(diffs) + ". Run with --list, check what was "
              "added, renamed or removed, decide categories, tags and exclusions in premier_inn.py, then update EXPECTED_ROWS "
              "and EXPECTED_NAMES_SHA256.", file=sys.stderr)
        return 1
    items, held, exclusions = build(cands)

    if args.list:
        print(f"row counts {counts}\nnames hash {digest}")
        for d in diffs:
            print("WARNING:", d)
        for i in items:
            flag = "HELD " if "_held" in i else ""
            print(f"{flag}{i['category']:<24}| {i['name']} | {i['serving']} | {i['calories']} kcal | {i['tags']} | rankable={i['rankable']} | {i['notes']}")
        return 0

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Premier Inn", cuisine="Hotel restaurant", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=ALIASES,
        items=[{k: v for k, v in i.items() if not k.startswith("_")} for i in items], out=args.out, note=NOTE, holdback=held)
    published = len(items) - len(held)
    print(f"wrote {len(items)} items ({published} published, {len(held)} held back) to {out}")
    for label, pdf in (("restaurant", args.restaurant), ("breakfast", args.breakfast), ("hub", args.hub)):
        print(f"  {label}: {pdf.name} sha256 {sha256_file(pdf)}")
    for reason, n in exclusions.items():
        print(f"  excluded {n} Hub rows: {reason}")
    print("  meat type not stated (no tag; red-meat dishes whose name gives no meat):")
    for i in items:
        if ("_held" not in i and RED_MEAT_UNSTATED.search(i["name"]) and "contains_beef" not in i["tags"]
                and not re.search(r"\b(chicken|vegan)\b|burger bun", i["name"], re.I)):
            print(f"    {i['name']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
