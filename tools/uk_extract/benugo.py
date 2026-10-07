#!/usr/bin/env python3
"""Build data/source/benugo/ from Benugo's own online ordering menus (a CALORIES-ONLY chain, allergens link-only).

    python3 -I tools/uk_extract/benugo.py --pages DIR --checked-on 2026-10-07 [--fetch] [--out DIR]

Source: https://www.benugo.com/order-online/ (the chain's own page) links "Order now" to https://api.getspoonfed.com/262/benugo,
Benugo's ordering site for office/event delivery (hosted by Spoonfed). Its three menu pages are the ones the script reads:
    Lunch            https://api.getspoonfed.com/262/benugo/menus/?c=1310
    Breakfast        https://api.getspoonfed.com/262/benugo/menus/?c=1309
    Cakes & Snacks   https://api.getspoonfed.com/262/benugo/menus/?c=1315
DIR holds the three saved pages (names in PAGES below); --fetch downloads them first. The pages show no date. robots.txt on
api.getspoonfed.com prints "Crawl-delay: 2200" and no Disallow: fetch each page ONCE and not again (--fetch waits 5 s between pages;
a run from saved pages makes no request at all).

Benugo's own "Autumn Delivery menu" PDF (benugo.com/app/uploads/2026/09/Benugo_AW26_Delivery_Menu.pdf) says on its last page "This
is a sample menu, visit benugo.com/order-online and click 'order now' for the latest menu including allergen and nutritional
information", and several of its values differ from the live pages (Cookie box 4810 vs 4825 kcal, Bloomer box 4934 vs 4947, Fruit pot
128 vs 121...). So the live ordering pages are the source, and the PDF is NOT used for any value.

What the pages print: ONE nutrient, "NNN Kcal", optionally "per box|pot|portion|slice|cake", on the items that have one (energy-info
line). No protein, carbs, fat, kJ, salt or weights anywhere (checked: the pages contain none of those words), so chain.csv gets
nutrition_level=calories and every other column stays blank. Items that print no kcal (the whole fruit box, crisps, popcorn, bars,
drinks, the baguette, several lunch-bag parts) are not published; the run prints them.

Reading rules (every one is visible in the code):
- One row per product record (name, price, description, flag lines "Vegetarian"/"Vegan"/"Dairy Free"/"Gluten Free", "Allergens: ...").
  The same product shown in several menus (e.g. lunch bags repeat the individual items) is kept once when its name, kcal text and
  allergen text are identical; the run STOPS if a name repeats with different numbers and is not listed in RENAMES.
- serving is only what the page states: "per box" -> "1 box" (+ "suitable for N people" when the item prints it, else the section's
  "Serves 4-6"), "per pot|portion|slice|cake" -> "1 pot|portion|slice|cake". A bare "NNN Kcal" on a single bowl/sandwich/wrap has no
  stated basis, so serving stays blank. A bare "Kcal" on an item in a "Sharing Boxes" section is a box (serving "1 box (...)").
- Names are as printed; a trailing "(v)", "(vg)" or stray "v)" marker is removed from the name and becomes the vegetarian tag.
  vegetarian = the page's Vegetarian or Vegan flag, or that marker. contains_pork / contains_beef only from the item's name and
  description (shared word lists in tenkites_c); nothing is inferred beyond that.
- Allergens are LINK-ONLY: the pages print an "Allergens:" line per item but have no line at all for items with none, and the live
  page leaves it off at least one item whose own sample PDF lists milk (Yoghurt Cranberries), so an absent line cannot be read as
  "none". All or nothing (docs/DATA.md): allergen_guide.csv only.

If a page gains or loses rows, a new menu/section appears, or a kcal line has a form this script doesn't know, the run stops.
"""
from __future__ import annotations
import argparse
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import write_chain_folder  # noqa: E402

CHAIN_ID = "benugo"
ENTRY_URL = "https://api.getspoonfed.com/262/benugo"
# In the order the ordering site lists them (Lunch, Breakfast, Cakes & Snacks): file -> url.
PAGES = {
    "benugo_1310_lunch.html": ENTRY_URL + "/menus/?c=1310",
    "benugo_1309_breakfast.html": ENTRY_URL + "/menus/?c=1309",
    "benugo_1315_cakes_snacks.html": ENTRY_URL + "/menus/?c=1315",
}
# (menu title, section title) as printed -> (category shown, products on the page, products with a kcal line). Anything else stops the run.
LB = "Lunch bag items"
SECTIONS = {
    ("Lunch - Sharing Platters", "Sandwiches, Wraps, Bagels, Focaccia, Sausage Rolls, Frittata, Quiche"): ("Lunch sharing platters", 14, 14),
    ("Lunch - Sharing Platters", "Fruit"): ("Fruit boxes", 2, 1),
    ("Salads - Sharing Boxes & Individual Bowls", "Salad Sharing Boxes - Serves 4-6"): ("Salad sharing boxes (serves 4-6)", 11, 11),
    ("Salads - Sharing Boxes & Individual Bowls", "Individual Salads - Serves 1"): ("Individual salads", 5, 5),
    ("Bloomer Lunch Bag", "1. Bloomer"): (LB, 5, 3),
    ("Bloomer Lunch Bag", "2. Fruit"): (LB, 3, 0),
    ("Bloomer Lunch Bag", "3. Cake Slice"): (LB, 5, 4),
    ("Bloomer Lunch Bag", "4. Crisps"): (LB, 3, 0),
    ("Bloomer Lunch Bag", "5. Drink"): (LB, 4, 0),
    ("Salad Lunch Bag", "1. Salad"): (LB, 3, 3),
    ("Salad Lunch Bag", "2. Fruit"): (LB, 3, 0),
    ("Salad Lunch Bag", "3. Cake Slice"): (LB, 5, 4),
    ("Salad Lunch Bag", "4. Crisps"): (LB, 3, 0),
    ("Salad Lunch Bag", "5. Drink"): (LB, 4, 0),
    ("Wrap Lunch Bag", "1. Wrap"): (LB, 4, 3),
    ("Wrap Lunch Bag", "2. Fruit"): (LB, 3, 0),
    ("Wrap Lunch Bag", "3. Cake Slice"): (LB, 5, 4),
    ("Wrap Lunch Bag", "4. Crisps"): (LB, 3, 0),
    ("Wrap Lunch Bag", "5. Drink"): (LB, 4, 0),
    ("Individual Sandwiches, Wraps & Rolls", "Individual Bloomer Sandwiches"): ("Individual bloomer sandwiches", 6, 6),
    ("Individual Sandwiches, Wraps & Rolls", "Individual Wraps"): ("Individual wraps", 4, 4),
    ("Individual Sandwiches, Wraps & Rolls", "Golden Millet Rolls"): ("Golden millet rolls", 2, 2),
    ("Individual Sandwiches, Wraps & Rolls", "Individual Focaccia's"): ("Individual focaccia", 3, 3),
    ("Individual Sandwiches, Wraps & Rolls", "Individual Bagels"): ("Individual bagels", 1, 1),
    ("Individual Sandwiches, Wraps & Rolls", "Baguettes"): ("Baguettes", 1, 0),
    ("Breakfast - Individual Items", "Fruit, Yoghurt & Porridge Pots"): ("Fruit, yoghurt & porridge pots", 8, 8),
    ("Breakfast Boxes", "Breakfast Boxes"): ("Breakfast boxes", 9, 9),
    ("Snacks, Treats & Sweets", "Cake Boxes & Whole Cakes"): ("Cake boxes & whole cakes", 11, 11),
    ("Snacks, Treats & Sweets", "Benugo Handmade Individual Cakes"): ("Individual cakes", 4, 4),
    ("Snacks, Treats & Sweets", "Crisps and popcorn"): ("Crisps & popcorn", 7, 1),
    ("Snacks, Treats & Sweets", "Snacks & Treats"): ("Snacks & treats", 8, 6),
}
SHARING_SECTIONS = {"Salad Sharing Boxes - Serves 4-6"}  # every row is a box that feeds several people
# Same printed name, different numbers in two menus: both are kept under these names (key: file, printed name).
RENAMES = {
    ("benugo_1309_breakfast.html", "Cut Fruit Box"): "Cut Fruit Box (breakfast)",
    ("benugo_1310_lunch.html", "Cut Fruit Box (vg)"): "Cut Fruit Box (lunch)",
    ("benugo_1310_lunch.html", "Falafel & Hummus Wrap (vg)"): "Falafel & Hummus Wrap (lunch bag)",
}
# Rows whose own printed basis is impossible: kept in items.csv exactly as printed and listed in holdback.csv (never corrected).
HOLDBACK = {
    "Whole Pumpkin, Almond & Pecan Streusel Loaf Cake": (
        "Printed '4612 Kcal per slice' on the whole 12-slice cake, but the same page prints 384 Kcal per slice of the same cake; "
        "4612 is about 12 slices, so the basis is wrong on the page. Not corrected."),
}
KCAL = re.compile(r"^(\d+)\s*kcal(?:\s+per\s+(box|pot|portion|slice|cake))?$", re.I)
PEOPLE = re.compile(r"SUITABLE FOR\s+(\d+(?:\s*-\s*\d+)?)\s+PEOPLE", re.I)
SERVES = re.compile(r"Serves\s+(\d+\s*-\s*\d+)", re.I)
MARKER = re.compile(r"\s*\(?\s*\b(vg|v)\s*\)\s*$", re.I)
KNOWN_FLAGS = {"Vegetarian", "Vegan", "Dairy Free", "Gluten Free"}
NOTE = ("Benugo prints calories only (no protein, carbs or fat), on its online ordering menus for delivery and catering, not for its cafes. "
        "Sharing boxes and whole cakes show calories for the whole box or cake, not per person. Items without a printed calorie value are not listed.")


def read_page(path: Path) -> list[dict]:
    """Every product on one saved ordering page, as printed."""
    root = tk.parse_html(path.read_text(encoding="utf-8", errors="replace"))
    rows = []
    for menu in root.find_all(cls="menu-item-wapper"):
        h2 = menu.find(tag="h2")
        menu_title = h2.text() if h2 else ""
        for sec in menu.find_all(cls="menusection"):
            btn = sec.find(tag="button")
            section = btn.text() if btn else ""
            for it in sec.find_all(cls="mod-item"):
                name_node, price_node, desc = it.find(cls="product-name"), it.find(cls="item-amount"), it.find(cls="desc")
                if name_node is None:
                    raise SystemExit(f"{path.name}: a product row without a name in {menu_title!r} / {section!r}")
                lis = desc.find_all(tag="li") if desc else []
                energy = [li.text() for li in lis if li.has("energy-info")]
                flags = [li.text() for li in lis if not li.has("energy-info") and not li.text().startswith("Allergens:")]
                allergens = [li.text() for li in lis if li.text().startswith("Allergens:")]
                if len(energy) > 1 or len(allergens) > 1:
                    raise SystemExit(f"{path.name}: {name_node.text()!r} has several energy or allergen lines")
                bad = [f for f in flags if f not in KNOWN_FLAGS]
                if bad:
                    raise SystemExit(f"{path.name}: {name_node.text()!r} has an unknown flag line {bad}: read it and add it to KNOWN_FLAGS")
                desc_text = desc.text() if desc else ""
                other = desc_text
                for li in lis:
                    other = other.replace(li.text(), " ")
                if re.search(r"kcal|kj", other, re.I):
                    raise SystemExit(f"{path.name}: {name_node.text()!r} prints calories outside the energy line: {other!r}")
                rows.append({"menu": menu_title, "section": section, "printed": name_node.text(), "price": price_node.text() if price_node else "",
                             "desc": desc_text, "energy": energy[0] if energy else "", "flags": flags,
                             "allergens": allergens[0] if allergens else ""})
    return rows


def serving_for(row: dict, basis: str | None, name: str) -> tuple[str, str]:
    """(serving, how it was read) from what the page prints; blank when no basis is stated."""
    people_m, serves_m = PEOPLE.search(row["desc"]), SERVES.search(row["section"])
    people = f"suitable for {people_m.group(1).replace(' ', '')} people" if people_m else (f"serves {serves_m.group(1).replace(' ', '')}" if serves_m else "")
    sharing = row["section"] in SHARING_SECTIONS
    unit = basis or ("box" if sharing else "")
    if not unit:
        return "", "no basis printed (single item as sold)"
    text = f"1 {unit}" + (f" ({people})" if people and unit in ("box", "cake") else "")
    return text, (f"basis '{basis}' printed" if basis else "bare Kcal on an item in a sharing-box section, read as per box")


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    report: list[str] = []
    counts: dict = {}
    published, seen = [], {}
    page_rows = [(fname, r) for fname in PAGES for r in read_page(pages_dir / fname)]
    # A lunch bag lists parts that are also sold on their own menus: a bag row identical to a row on a non-bag menu is dropped in
    # favour of that row (so the item sits under its own menu section, not under "Lunch bag items").
    own_keys = {}
    for fname, r in page_rows:
        if r["energy"] and SECTIONS.get((r["menu"], r["section"]), ("",))[0] != LB:
            own_keys[(tk.tidy_case(MARKER.sub("", r["printed"]).strip()), r["energy"])] = (f"{r['menu']} / {r['section']}", r["allergens"])
    for fname, r in page_rows:
        key = (r["menu"], r["section"])
        if key not in SECTIONS:
            raise SystemExit(f"{fname}: new menu/section {key}: add it to SECTIONS (category, expected counts) after reading the page.")
        c = counts.setdefault(key, [0, 0])
        c[0] += 1
        c[1] += 1 if r["energy"] else 0
        if not r["energy"]:
            report.append(f"no kcal printed, not listed: {r['printed']!r} ({r['menu']} / {r['section']})")
            continue
        m = KCAL.match(r["energy"])
        if not m:
            raise SystemExit(f"{fname}: {r['printed']!r}: unknown kcal line {r['energy']!r}: read it and extend KCAL.")
        kcal, basis = m.group(1), (m.group(2).lower() if m.group(2) else None)
        printed = r["printed"]
        name = RENAMES.get((fname, printed)) or tk.tidy_case(MARKER.sub("", printed).strip())
        dup_key = (name, r["energy"])
        if SECTIONS[key][0] == LB and dup_key in own_keys:
            where, own_allergens = own_keys[dup_key]
            if own_allergens != r["allergens"]:
                raise SystemExit(f"{name!r} in a lunch bag has the same kcal but different allergens than on {where}: read both menus.")
            report.append(f"dropped lunch-bag copy of {name!r}: the same item (same kcal and allergens) is on {where}")
            continue
        if dup_key in seen:
            if seen[dup_key]["allergens"] != r["allergens"]:
                raise SystemExit(f"{name!r} is printed twice with the same kcal but different allergens: read both menus.")
            report.append(f"dropped exact duplicate: {name!r} ({r['menu']} / {r['section']}) = {seen[dup_key]['where']}")
            continue
        marker = bool(MARKER.search(printed))
        flagged = "Vegetarian" in r["flags"] or "Vegan" in r["flags"]
        if marker and not flagged:
            report.append(f"vegetarian marker in the name but no page flag: {printed!r} (tagged vegetarian from the marker)")
        tags, unspecified = tk.meat_tags(name, r["desc"], vegetarian=marker or flagged)
        if unspecified:
            report.append(f"meat type not stated: {name}")
        serving, how = serving_for(r, basis, name)
        category = SECTIONS[(r["menu"], r["section"])][0]
        notes = [f"Printed {r['energy']!r} in {r['menu']} / {r['section']} (name {printed!r}" + (f", {r['price']}" if r["price"] else ", no price") + f"); serving: {how}"]
        if printed in HOLDBACK:
            notes.append("held back: see holdback.csv")
        if name == "Plant Power Salad Bowl" and basis == "box":
            notes.append("page prints 'per box' on this single bowl (Individual Salads, serves 1, 6.95); serving left blank, number copied as printed")
            serving = ""
        pork_words = {w.lower() for w in tk.PORK.findall(name + " " + r["desc"])}
        if "contains_pork" in tags and pork_words == {"mortadella"}:
            notes.append("tagged pork only because the item names mortadella (shared word list); the page does not say the meat")
        rec = {"name": name, "category": category, "serving": serving, "calories": kcal, "tags": "|".join((["vegetarian"] if (marker or flagged) else []) + tags),
               "rankable": False, "notes": "; ".join(notes), "allergens": None, "printed": printed, "where": f"{r['menu']} / {r['section']}",
               "allergen_text": r["allergens"], "flags": r["flags"]}
        seen[dup_key] = {"allergens": r["allergens"], "where": rec["where"]}
        published.append(rec)
    for key, (cat, n, nk) in SECTIONS.items():
        got = counts.get(key)
        if got != [n, nk]:
            raise SystemExit(f"{key}: the page now has {got} (products, with kcal) but this script expects {[n, nk]}: the menu changed, re-check before running again.")
    names = [p["name"] for p in published]
    clash = sorted({n for n in names if names.count(n) > 1})
    if clash:
        raise SystemExit(f"Same name with different numbers, add them to RENAMES: {clash}")
    missing = [k for k in RENAMES if not any(p["printed"] == k[1] for p in published)]
    if missing:
        raise SystemExit(f"RENAMES entries no longer on the pages: {missing}")
    held = []
    for p in published:
        if p["printed"] in HOLDBACK:
            held.append((p["name"], HOLDBACK[p["printed"]]))
    if len(held) != len(HOLDBACK):
        raise SystemExit("A HOLDBACK row is no longer on the pages: re-check")
    no_allergen_line = [p["name"] for p in published if not p["allergen_text"]]
    report.append(f"published items without an 'Allergens:' line (why allergens are link-only): {no_allergen_line}")
    return published, held, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were fetched/read")
    ap.add_argument("--fetch", action="store_true", help="download the three pages into --pages first (one request each, 5 s apart)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for fname, url in PAGES.items():
            tk.fetch(url, args.pages / fname, delay=5.0)
    items, held, report = build(args.pages)
    # holdback ids come from the writer's id rule: slug of the name (clashes are rejected above, so no suffixes)
    from common import slug
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Benugo", cuisine="Sandwiches",
        source_title=f"Benugo online ordering menus: Lunch, Breakfast, Cakes & Snacks (api.getspoonfed.com, accessed {args.checked_on}, no date shown)",
        source_url=ENTRY_URL, checked_on=args.checked_on, aliases=["benugo"], items=items, out=args.out, note=NOTE,
        holdback=[(slug(n), why) for n, why in held],
        allergen_guide={"title": f"Benugo online ordering menus with an allergens line per item (api.getspoonfed.com, accessed {args.checked_on}, no date shown)",
                        "url": ENTRY_URL, "checked_on": args.checked_on, "may_contain_published": False},
        nutrition_level="calories")
    for fname in PAGES:
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    by_cat: dict = {}
    for it in items:
        by_cat[it["category"]] = by_cat.get(it["category"], 0) + 1
    print("wrote %d items to %s: %s" % (len(items), out, ", ".join(f"{c} {n}" for c, n in by_cat.items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
