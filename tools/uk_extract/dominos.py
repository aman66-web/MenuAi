#!/usr/bin/env python3
"""Build data/source/dominos/ from Domino's UK "Nutrition Information Guide" PDFs (founder downloaded 2026-10-10, both "Correct as of 7th September 2026").

    python3 tools/uk_extract/dominos.py data/held-downloads/dominos --checked-on 2026-10-10

Inputs (in the folder): nutrition_pizzas.pdf and nutrition_sides-and-desserts.pdf. Numbers are copied from the PDFs as printed
(strings such as "17.1375" or "<0.5" are kept); only names, categories and grouping are assembled from the table cells.

Pizzas: each table row prints the whole pizza AND one slice. We publish the SLICE figures (serving "1 slice"; the guide does not print the
number of slices, so none is stated), like the Pizza Hut chain; the pizza name, crust and cheese of a row are read from the drawn
table cell that contains the row (dominos_pdf.py), never guessed from the text order. Rows with the standard cheese carry no suffix;
the "Reduced Fat Mozzarella" rows are named "... (reduced fat mozzarella)". Sides, dips, wraps, desserts and Chick 'N' Dip: the figures "As Sold"
for the product (the per portion/piece column is labelled inconsistently by the guide); products marked IRL (Ireland) are left out.
Allergens are in a separate leaflet that is not laid out per menu item here, so the chain carries the link to Domino's own allergen guide only.
Any structure the script does not expect (row counts, unknown crust/cheese words, missing numbers) stops it with a message.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import dominos_pdf as dp  # noqa: E402
from common import write_chain_folder  # noqa: E402

CHAIN_ID = "dominos"
PIZZA_SOURCE = "https://dominos.a.bigcontent.io/v1/static/nutrition_pizzas"
SIDES_SOURCE = "https://dominos.a.bigcontent.io/v1/static/nutrition_sides-and-desserts"
GUIDE_URL = "https://corporate.dominos.co.uk/about-us/our-food/allergens-and-nutrition"

# Column order of the 20 numbers on a pizza row: per pizza then per slice, each: kcal, kJ, fat, sat, carb, sugars, fibre, protein, salt, sodium
KEYS = ["calories", "energy_kj", "fat_g", "sat_fat_g", "carbs_g", "sugar_g", "fiber_g", "protein_g", "salt_g", "sodium_g"]
CRUSTS = {"Classic Crust": "Classic Crust", "Italian Style Crust": "Italian Style Crust", "Double Decadence": "Double Decadence",
          "Douoble Decadence": "Double Decadence",  # the guide's own typo in one crust label (page 3), the label only
          "Stuffed Crust": "Stuffed Crust", "Thin & Crispy Crust": "Thin & Crispy Crust"}
CATEGORY_BY_CRUST = {"Classic Crust": "Classic crust pizzas", "Italian Style Crust": "Italian style crust pizzas",
                     "Double Decadence": "Double Decadence crust pizzas", "Stuffed Crust": "Stuffed crust pizzas",
                     "Thin & Crispy Crust": "Thin & crispy crust pizzas"}
GROUP_CATEGORY = {"Gluten Free Pizzas": "Gluten free pizzas", "Plant-Based Pizzas": "Plant-based pizzas",
                  "Cheeky Little Pizzas": "Cheeky Little Pizzas", "Italiano Pizzas": "Italiano pizzas", "Delight Pizzas": "Delight pizzas"}


def tidy(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s.replace("Supreme- Thin", "Supreme - Thin")      # the guide prints no space before the dash in one name


def pizza_items(pdf: Path, checked_on: str) -> list[dict]:
    words = dp._words(pdf)
    rows = dp.read_rows(pdf)
    if any(r["n"] != 20 for r in rows):
        raise SystemExit("a pizza row does not have exactly 20 numbers: the PDF layout changed")
    items: list[dict] = []
    prev = None
    for r in rows:
        c = r["cells"]
        mozz_text = c.get(91, "")
        if "Reduced" in mozz_text:
            mozz = "reduced"
        elif "Standard" in mozz_text:
            mozz = "standard"
        elif mozz_text == "":
            mozz = None
        else:
            raise SystemExit(f"unknown cheese cell {mozz_text!r} on page {r['page']}")
        left = tidy(c.get(51, ""))
        mid = tidy(c.get(105, ""))
        line_words = " ".join(w[4] for w in sorted(words[r["page"] - 1], key=lambda w: w[0])
                              if abs((w[1] + w[3]) / 2 - r["y"]) <= 3.0 and 104.5 <= w[0] <= 206 and w[4] not in dp.SIZES)
        line_words = tidy(line_words)
        if mid in CRUSTS:                                       # the big blocks: pizza name | cheese | crust | size
            name, crust, category = left, CRUSTS[mid], CATEGORY_BY_CRUST[CRUSTS[mid]]
            if not name:
                # the page's first rows can belong to a block whose name cell started on the previous page
                if prev is None:
                    raise SystemExit(f"row without a pizza name at the top of page {r['page']}")
                name = prev["name"]
        elif left in GROUP_CATEGORY or left.startswith("Plant-Based Pizzas"):
            group = "Plant-Based Pizzas" if left.startswith("Plant-Based Pizzas") else left
            category, crust = GROUP_CATEGORY[group], None
            if group == "Italiano Pizzas":                      # name and crust share one cell
                m = re.match(r"^(.*?)\s*I?talian Style(?: Crust)?$", mid)
                if not m:
                    raise SystemExit(f"cannot split Italiano cell {mid!r}")
                name, crust = tidy(m.group(1)), "Italian Style Crust"
            else:                                               # the name is printed on the row's own line
                name = tidy(mid or line_words)
        elif not left and mid in CRUSTS:
            raise SystemExit("unreachable")
        else:
            # continuation row of a block on a page that starts mid-pizza (no cells drawn): inherit from the row before
            if prev is None or r["page"] == prev["page"]:
                raise SystemExit(f"cannot place row on page {r['page']} y={r['y']}: cells {c}")
            name, crust, category, mozz = prev["name"], prev["crust"], prev["category"], prev["mozz"]
            label = tidy(" ".join(w[4] for w in words[r["page"] - 1] if abs((w[1] + w[3]) / 2 - r["y"]) <= 12 and 104.5 <= w[0] <= 206 and w[4] not in dp.SIZES))
            top_mozz = tidy(" ".join(w[4] for w in words[r["page"] - 1] if abs((w[1] + w[3]) / 2 - r["y"]) <= 12 and 89 <= w[0] <= 104.5))
            if mozz == "reduced" and "Reduced" not in top_mozz and "Fat" not in top_mozz and top_mozz:
                raise SystemExit(f"continuation row on page {r['page']} has cheese label {top_mozz!r}")
            if CRUSTS.get(label) != crust:
                raise SystemExit(f"continuation row on page {r['page']} has crust label {label!r}, expected {crust!r}")
        if not name:
            raise SystemExit(f"no pizza name for page {r['page']} y={r['y']}")
        nums = r["nums"][10:]                                   # per slice
        whole = r["nums"][:10]
        rec = {"name": name, "crust": crust, "mozz": mozz, "size": r["size"], "category": category, "slice": dict(zip(KEYS, nums)),
               "whole": dict(zip(KEYS, whole)), "page": r["page"]}
        items.append(rec)
        prev = rec
    return items


def _f(x: str):
    try:
        return float(x.lstrip("<"))
    except ValueError:
        return None


def pizza_holdbacks(rows: list[dict]) -> dict[str, str]:
    """Rows whose own figures contradict each other are held back, never corrected (docs/UK_DATA_PLAYBOOK.md):
    (1) the per-pizza figures divided by the per-slice figures must give one whole slice count for every nutrient, equal to the usual
    count for that size (Large 10, Medium 8, Small 6, Personal 4: read off the guide's own rows, not printed in it);
    (2) within one pizza, crust and cheese the whole-pizza calories must fall as the size gets smaller."""
    out: dict[str, str] = {}
    usual: dict[str, Counter] = {}
    ratios_by_row = []
    for r in rows:
        rs = []
        for k in ("calories", "energy_kj", "fat_g", "carbs_g", "protein_g"):
            a, b = _f(r["whole"][k]), _f(r["slice"][k])
            if a and b and a >= 8 and b >= 3:                       # tiny values are dominated by rounding
                rs.append(a / b)
        ratios_by_row.append(rs)
        if rs:
            usual.setdefault(r["size"], Counter())[round(sum(rs) / len(rs))] += 1
    allowed = {size: {n for n, c in cnt.items() if c >= 3} for size, cnt in usual.items()}   # slice counts shared by at least 3 rows of a size
    for r, rs in zip(rows, ratios_by_row):
        key = item_name(r)
        if rs:
            n = round(sum(rs) / len(rs))
            if n not in allowed[r["size"]] or any(abs(x - n) > 0.08 * n for x in rs):
                out[key] = (f"The guide's per-pizza and per-slice figures do not agree for this {r['size']} row (whole pizza {r['whole']['calories']} kcal, "
                            f"slice {r['slice']['calories']} kcal: a count of {'/'.join(str(x) for x in sorted(allowed[r['size']]))} slices is usual for this size, "
                            f"this row implies {n}): the guide contradicts itself, so the row is held back")
    order = {"Large": 3, "Medium": 2, "Small": 1, "Personal": 0}
    groups: dict[tuple, list[dict]] = {}
    for r in rows:
        groups.setdefault((r["name"], r["mozz"], r["crust"]), []).append(r)
    for g in groups.values():
        g2 = sorted(g, key=lambda r: -order[r["size"]])
        ks = [_f(r["whole"]["calories"]) for r in g2]
        if all(k is not None for k in ks) and any(b >= a for a, b in zip(ks, ks[1:])):
            seq = ", ".join(r2["size"] + " " + r2["whole"]["calories"] for r2 in g2)
            for r in g:
                out.setdefault(item_name(r), "Within this pizza, crust and cheese the guide's whole-pizza calories do not fall as the size gets smaller "
                                              "(" + seq + "): the guide contradicts itself, so these rows are held back")
    return out


def item_name(r: dict) -> str:
    suffix = " (reduced fat mozzarella)" if r["mozz"] == "reduced" else ""
    crust = f", {r['crust']}" if r["crust"] and r["category"] in CATEGORY_BY_CRUST.values() else ""
    if r["category"] in GROUP_CATEGORY.values():
        return f"{r['name']} - {r['size']}{suffix}"
    return f"{r['name']}{crust} - {r['size']}{suffix}"


def side_rows(pdf: Path) -> list[dict]:
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    num = r"(<?\d+(?:\.\d+)?)"
    pat = re.compile(r"^\s*(?P<name>.+?)\s+(?P<serves>\d+)\s+" + r"\s+".join([num] * 10) + r"\s+(?P<unit>Portion|Piece|Dip|Wrap)\s+" + r"\s+".join([num] * 10) + r"\s*$")
    section = None
    out = []
    for line in text.splitlines():
        s = line.strip()
        if s in ("Sides", "Dips", "Wraps", "Desserts", "Chick 'N' Dip"):
            section = s
            continue
        m = pat.match(line)
        if m:
            g = m.groups()
            out.append({"section": section, "name": tidy(g[0]), "serves": g[1], "asold": dict(zip(KEYS, g[2:12])), "unit": g[12], "portion": dict(zip(KEYS, g[13:23]))})
        elif re.search(r"\s\d+\.\d+\s+\d+\.\d+\s+\d", line) and section:
            raise SystemExit(f"a sides row did not match the expected pattern: {line.strip()[:120]}")
    return out


PORK_WORDS = re.compile(r"\b(bacon|ham|pepperoni|sausage|pork|salami|chorizo)\b", re.I)


def to_item(name: str, category: str, serving: str, nums: dict, *, rankable: bool, notes: str = "") -> dict:
    it = {"name": name, "category": category, "serving": serving, "rankable": rankable, "notes": notes}
    # CLAUDE.md / playbook: contains_pork only when the item's name says so (meat type not stated -> no tag); vegetarian only if the guide marks it (it does not)
    if PORK_WORDS.search(name):
        it["tags"] = "contains_pork"
    for k in KEYS:
        if k == "sodium_g":
            continue
        it[k] = nums[k]
    return it


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    folder = Path(args.folder)
    pizzas_pdf, sides_pdf = folder / "nutrition_pizzas.pdf", folder / "nutrition_sides-and-desserts.pdf"

    items: list[dict] = []
    prows = pizza_items(pizzas_pdf, args.checked_on)
    seen = Counter()
    for r in prows:
        name = item_name(r)
        seen[name] += 1
        notes = f"Per slice; per pizza the guide prints {r['whole']['calories']} kcal"
        items.append(to_item(name, r["category"], "1 slice", r["slice"], rankable=True, notes=notes))
    dupes = [n for n, c in seen.items() if c > 1]
    if dupes:
        raise SystemExit(f"duplicate pizza item names: {dupes[:5]}")
    holdback_names = pizza_holdbacks(prows)

    srows = side_rows(sides_pdf)
    cat_by_section = {"Sides": "Sides", "Dips": "Dips", "Wraps": "Wraps", "Desserts": "Desserts", "Chick 'N' Dip": "Chick 'N' Dip"}
    for r in srows:
        if re.search(r"\bIRL\b", r["name"]):
            continue                                            # Ireland only: not the Great Britain menu
        name = r["name"]
        rank = r["section"] in ("Wraps", "Chick 'N' Dip", "Sides")     # dips and desserts are never ranked (playbook conventions)
        notes = f"As sold, serves {r['serves']}; the guide's per {r['unit'].lower()} figure is {r['portion']['calories']} kcal"
        items.append(to_item(name, cat_by_section[r["section"]], f"as sold, serves {r['serves']}", r["asold"], rankable=rank, notes=notes))
    names = Counter(i["name"] for i in items)
    if any(c > 1 for c in names.values()):
        raise SystemExit(f"duplicate item names across the guide: {[n for n, c in names.items() if c > 1][:5]}")

    sha = hashlib.sha256(pizzas_pdf.read_bytes()).hexdigest()[:16] + "/" + hashlib.sha256(sides_pdf.read_bytes()).hexdigest()[:16]
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Domino's", cuisine="Pizza",
        source_title="Domino's UK Nutrition Information Guides: Pizzas, Bases & Toppings and Sides & Desserts (correct as of 7th September 2026)",
        source_url=GUIDE_URL, checked_on=args.checked_on, aliases=["dominos", "domino's pizza", "dominos pizza"], items=items,
        out=Path(args.out) if args.out else None,
        note=("Pizzas show the figures for one slice (the guide also prints the whole pizza; it does not state the slice count). Sides, dips, wraps and "
              "desserts show the product as sold. Pizza nutrition excludes dips. Menus and recipes can vary by store."),
        allergen_guide={"title": "Domino's allergens and nutrition (allergen leaflet and ingredients guide)", "url": GUIDE_URL,
                        "checked_on": args.checked_on, "may_contain_published": False})
    if holdback_names:
        import csv
        from common import slug
        ids, used = {}, {}
        for it in items:
            base = slug(it["name"])
            n = used.get(base, 0)
            used[base] = n + 1
            ids[it["name"]] = base if n == 0 else f"{base}-{n + 1}"
        with open(out / "holdback.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["item_id", "reason"])
            for nm, why in holdback_names.items():
                w.writerow([ids[nm], why])
        print(f"held back {len(holdback_names)} pizza rows whose own figures contradict each other")
    print(f"wrote {out}: {len(items)} items ({len(prows)} pizza rows, {len(srows)} side rows read); source files {sha}")
    print(Counter(i["category"] for i in items))


if __name__ == "__main__":
    main()
