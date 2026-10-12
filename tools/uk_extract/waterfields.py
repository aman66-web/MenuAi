#!/usr/bin/env python3
"""Build data/source/waterfields/ from the nutrition tables on Waterfields' own product pages (full nutrition, 36 North West bakeries).

    python3 tools/uk_extract/waterfields.py --cache DIR --checked-on 2026-10-12 [--out DIR]

Source: waterfields-bakers.co.uk (a Shopify shop; robots.txt allows /products/ and /collections/, disallows only cart, checkout, account,
admin and filter paths). The product descriptions are read from the shop's own product feed, which carries the same description HTML the
product pages show:
    https://www.waterfields-bakers.co.uk/products.json?limit=250          (50 products on 2026-10-12)
    https://www.waterfields-bakers.co.uk/collections/<bread|savouries|cream-cakes>/products.json?limit=250   (the shop's own grouping)
One request each, a second apart, cached in --cache so reruns never fetch again. The site's banner says "36 shops across the North West".

What the pages print: 22 of the 50 products end their description with a table "Nutrient: | Per item / per 100g" and one row per
nutrient, each cell "<per item> / <per 100 g>" (energy kJ and kcal, fat, saturates, mono- and polyunsaturates, carbohydrate, sugars,
starch, fibre, protein, "Salt Equivalent" and sodium in grams). No date or version is printed. The per-item figures are copied exactly as
printed (unrounded, e.g. 461.28 kcal); per-100 g figures are never published, they are only used to check the per-item column.

Founder's decision (2026-10-12): publish the products whose own figures agree. A product is held back (holdback.csv, with the figures
that disagree; never corrected, never chosen between) when its own table:
  * prints one figure per row under the two-column heading (basis unknown), or
  * prints kJ and kcal that disagree (outside 0.93-1.07 x 4.184 kJ per kcal, the accuracy audit's own line), in either column, or
  * prints salt and sodium that disagree (salt outside 0.8-1.25 x 2.5 x sodium and more than 0.15 g apart, the audit's line), or
  * prints a per-item energy, macro, saturates, sugars, fibre or salt figure that is not the same multiple of its per-100 g figure as the
    kcal (the item weight implied by the two columns differs from nutrient to nutrient), or
  * is word for word the same table as another product's (both are held back: which one it belongs to can't be told), or
  * prints saturates above fat or sugars above carbohydrate.
An optional extra (mono- or polyunsaturates) whose two columns disagree is left blank for that product (neither figure is used); the rest of
the row is published. Starch and sodium are never published (no column for starch; sodium is printed in grams beside salt, and the UK figure
is salt: we never convert).

Allergens: the chain's allergen page (pages/allergen-information) embeds 12 published Google Sheets (Breakfast, Savouries & Toasties,
Soups, Quiche, Seasonal, Other Products, Made to Order, Keepers, Hot Drinks, Dailys, Cream Cakes, Breads & Rolls) with a contains / may
contain matrix. Several published products have no row of exactly their name (Éclair vs "Milk and White Chocolate Éclair", Vanilla vs
"Vanilla Slice", Steak Pie vs both "CHUNKY STEAK PIE" and "Steak Pie", Medium Pork Pie vs "MED PORK PIE", Spicy Vegetable Pastie vs
"VEGETABLE PASTIE", Small Crown Cob vs "Crown Cob", GI Bread vs "Low Gi Bread" and "Large GI Loaf"), and the Cream Cakes sheet marks cells
"*", which its key ("( ✓ ) Product contains | ( C ) May Contain") does not define. All or nothing: the chain gets a link to its allergen
page only.

Tags: vegetarian only where the product's own description says "This product is suitable for vegetarians."; contains_pork / contains_beef
only from the description's words (pork; steak, beef). rankable: savouries yes; cream cakes and whole loaves no.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import write_chain_folder  # noqa: E402

CHAIN_ID = "waterfields"
HOST = "https://www.waterfields-bakers.co.uk"
FEED = HOST + "/products.json?limit=250"
COLLECTIONS = {"bread": "Bread", "savouries": "Savouries", "cream-cakes": "Cream Cakes"}
ORDER = ["Savouries", "Cream Cakes", "Bread"]
SOURCE_URL = HOST + "/collections"
SOURCE_TITLE = "Waterfields product pages, nutrition per item (undated; read 12 October 2026)"
ALLERGEN_URL = HOST + "/pages/allergen-information"
ALLERGEN_TITLE = "Waterfields Allergen information (contains / may contain sheets)"
ALIASES = ["waterfields", "waterfields bakers", "waterfield's", "waterfields bakery"]
NOTE = ("Per item, from the nutrition table on each product's page of Waterfields' website (undated); only the products whose own figures "
        "agree are listed, and the breads are whole loaves. Allergens are on the chain's allergen page.")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
EXPECTED_PRODUCTS = 50
EXPECTED_TABLES = 22

# Row labels as printed (after the trailing colon is dropped) -> our key. Order is the table's own.
ROWS = [("Energy (kJ)", "energy_kj"), ("Energy (kcal)", "calories"), ("Fat (g)", "fat_g"), ("of which Saturates (g)", "sat_fat_g"),
        ("of which Mono-unsaturates (g)", "mono_fat_g"), ("of which Poly-unsaturates (g)", "poly_fat_g"), ("Carbohydrate (g)", "carbs_g"),
        ("of which Sugars (g)", "sugar_g"), ("of which Starch (g)", "starch"), ("Fibre (g)", "fiber_g"), ("Protein (g)", "protein_g"),
        ("Salt Equivalent (g)", "salt_g"), ("Sodium (g)", "sodium")]
NOT_PUBLISHED = {"starch", "sodium"}
OPTIONAL_EXTRAS = {"mono_fat_g", "poly_fat_g"}
NUM = re.compile(r"^\d+(\.\d+)?$")


# ---------------------------------------------------------------- fetching

def fetch_all(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    urls = {"products.json": FEED}
    urls.update({f"collection-{h}.json": f"{HOST}/collections/{h}/products.json?limit=250" for h in COLLECTIONS})
    if all((cache / n).exists() for n in urls):
        return
    req = urllib.request.Request(HOST + "/robots.txt", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            rules = robots_rfc.parse(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429) or e.code >= 500:
            raise SystemExit(f"robots.txt answered HTTP {e.code}: stop")
        rules = []
    for name, url in urls.items():
        if (cache / name).exists():
            continue
        path = url[len(HOST):]
        if not robots_rfc.allowed(rules, path):
            raise SystemExit(f"robots.txt disallows {path}: stop")
        time.sleep(1.1)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                (cache / name).write_bytes(r.read())
        except urllib.error.HTTPError as e:
            raise SystemExit(f"{url} answered HTTP {e.code}: stop (never worked round)")


# ---------------------------------------------------------------- parsing

def table_cells(body_html: str) -> list[str]:
    t = re.sub(r"<[^>]+>", "|", body_html)
    t = html.unescape(t).replace("\xa0", " ")
    return [" ".join(c.split()) for c in t.split("|") if c.strip()]


def parse_table(body_html: str, where: str) -> dict | None:
    """{key: (per_item, per_100g or None)} exactly as printed, or None when the description has no nutrition table."""
    cells = table_cells(body_html)
    if "Nutrient:" not in cells:
        return None
    i = cells.index("Nutrient:")
    if cells[i + 1] != "Per item / per 100g":
        raise SystemExit(f"{where}: unexpected table heading {cells[i + 1]!r}")
    labels = {lab: key for lab, key in ROWS}
    out: dict[str, tuple[str, str | None]] = {}
    j = i + 2
    while j < len(cells):
        lab = cells[j].rstrip(":").strip()
        if lab not in labels:
            raise SystemExit(f"{where}: unexpected row label {cells[j]!r}")
        val = cells[j + 1]
        parts = [p.strip() for p in val.split("/")]
        if len(parts) == 1:
            item, per100 = parts[0], None
        elif len(parts) == 2:
            item, per100 = parts
        else:
            raise SystemExit(f"{where}: {lab}: cell {val!r} has more than two figures")
        for p in (item, per100):
            if p is not None and not NUM.match(p):
                raise SystemExit(f"{where}: {lab}: figure {p!r} is not a plain number")
        out[labels[lab]] = (item, per100)
        j += 2
    if [k for _, k in ROWS] != list(out):
        raise SystemExit(f"{where}: the table's rows are not the 13 expected ones: {list(out)}")
    return out


def check(table: dict) -> tuple[list[str], set[str]]:
    """(reasons to hold the product back, optional extras to leave blank). Uses only the product's own printed figures."""
    reasons: list[str] = []
    blank: set[str] = set()
    if any(per100 is None for _, per100 in table.values()):
        if all(per100 is None for _, per100 in table.values()):
            return ["its table prints one figure per row under the heading 'Per item / per 100g', so the basis of the figures is not known"], blank
        return ["some rows of its table print one figure, others two"], blank
    f = {k: (float(a), float(b)) for k, (a, b) in table.items()}
    for col, label in ((0, "per item"), (1, "per 100 g")):
        kj, kcal = f["energy_kj"][col], f["calories"][col]
        r = kj / (kcal * 4.184)
        if not 0.93 <= r <= 1.07:
            reasons.append(f"{label} it prints {table['energy_kj'][col]} kJ against {table['calories'][col]} kcal "
                           f"({table['calories'][col]} kcal would be about {kcal * 4.184:.0f} kJ)")
        salt, sod = f["salt_g"][col], f["sodium"][col]
        if sod > 0:
            rs = salt / (sod * 2.5)
            if not 0.8 <= rs <= 1.25 and abs(salt - sod * 2.5) > 0.15:
                reasons.append(f"{label} it prints salt {table['salt_g'][col]} g against sodium {table['sodium'][col]} g "
                               f"(that much sodium is {sod * 2.5:.2f} g of salt)")
        if f["sat_fat_g"][col] > f["fat_g"][col] + 0.6:
            reasons.append(f"{label} saturates {table['sat_fat_g'][col]} g are more than fat {table['fat_g'][col]} g")
        if f["sugar_g"][col] > f["carbs_g"][col] + 1.0:
            reasons.append(f"{label} sugars {table['sugar_g'][col]} g are more than carbohydrate {table['carbs_g'][col]} g")
    # the two columns: every figure's per-item / per-100 g multiple must be the kcal's (the item's weight / 100 g)
    base = f["calories"][0] / f["calories"][1]
    off: dict[str, list[str]] = {}
    for key, (item, per100) in f.items():
        if key in NOT_PUBLISHED or key == "calories" or per100 < 1.0:  # below 1 g the per-100 g rounding alone can move it
            continue
        m = item / per100
        if abs(m / base - 1) > 0.03:
            if key in OPTIONAL_EXTRAS:
                blank.add(key)
            else:
                lab = next(lab for lab, k in ROWS if k == key).split(" (")[0].replace("of which ", "").lower()
                off.setdefault(f"{m:.2f}", []).append(f"{lab} ({table[key][0]} / {table[key][1]})")
    for m, labs in off.items():
        reasons.append(f"its per-item kcal is {base:.2f} times its per-100 g kcal ({table['calories'][0]} / {table['calories'][1]}) but "
                       f"{m} times for {', '.join(labs)}, so the two columns imply different item weights")
    if all(a == b for a, b in table.values()):
        if reasons:
            reasons.append("its per-item column is the same as its per-100 g column in every row")
    return reasons, blank


def build(cache: Path):
    feed = json.loads((cache / "products.json").read_text(encoding="utf-8"))["products"]
    if len(feed) != EXPECTED_PRODUCTS:
        raise SystemExit(f"the feed lists {len(feed)} products, expected {EXPECTED_PRODUCTS}: re-check the site, then update EXPECTED_PRODUCTS")
    category: dict[str, str] = {}
    for handle, cat in COLLECTIONS.items():
        for p in json.loads((cache / f"collection-{handle}.json").read_text(encoding="utf-8"))["products"]:
            if p["handle"] in category and category[p["handle"]] != cat:
                raise SystemExit(f"{p['handle']} is in two collections")
            category[p["handle"]] = cat
    tables = []
    for p in feed:
        t = parse_table(p["body_html"], p["handle"])
        if t is not None:
            tables.append((p, t))
    if len(tables) != EXPECTED_TABLES:
        raise SystemExit(f"{len(tables)} products print a nutrition table, expected {EXPECTED_TABLES}: re-check, then update EXPECTED_TABLES")
    # identical tables on different products
    sig: dict[str, list[str]] = {}
    for p, t in tables:
        sig.setdefault(json.dumps(t, sort_keys=True), []).append(p["title"])
    items, holdback, report = [], [], []
    for p, t in tables:
        title = " ".join(p["title"].split())
        if p["handle"] not in category:
            raise SystemExit(f"{p['handle']} ({title}) is in none of the collections {list(COLLECTIONS)}")
        cat = category[p["handle"]]
        desc = " ".join(re.split(r"Nutrient:", " ".join(table_cells(p["body_html"])))[0].split())
        reasons, blank = check(t)
        twins = [n for n in sig[json.dumps(t, sort_keys=True)] if n != p["title"]]
        if twins:
            reasons.append(f"its table is exactly the same as {', '.join(twins)}'s, so which product it belongs to can't be told")
        tags = []
        if "This product is suitable for vegetarians." in desc:
            tags.append("vegetarian")
        if re.search(r"\bpork\b", desc, re.I):
            tags.append("contains_pork")
        if re.search(r"\b(steak|beef)\b", desc, re.I):
            tags.append("contains_beef")
        it = {"name": title, "category": cat, "serving": "per item", "rankable": cat == "Savouries", "tags": "|".join(tags),
              "notes": f"description: {desc}"}
        for key, (item, _) in t.items():
            if key in NOT_PUBLISHED:
                continue
            it[key] = "" if key in blank else item
        if blank:
            it["notes"] += "; left blank because its two columns disagree: " + ", ".join(
                f"{k} printed {t[k][0]} per item / {t[k][1]} per 100 g" for k in sorted(blank))
            report.append(f"{title}: {', '.join(sorted(blank))} left blank (columns disagree: " +
                          ", ".join(f"{t[k][0]} / {t[k][1]}" for k in sorted(blank)) + ")")
        items.append(it)
        if reasons:
            holdback.append((p["handle"], "Waterfields' own table for this product: " + "; ".join(reasons) +
                             ". Held back, never corrected or chosen between."))
    # ids: the shop's own handle (unique), so holdback rows can name them
    for it, (p, _) in zip(items, tables):
        it["id"] = p["handle"]
    items.sort(key=lambda it: ORDER.index(it["category"]))
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    fetch_all(args.cache)
    items, holdback, report = build(args.cache)
    feed_sha = hashlib.sha256((args.cache / "products.json").read_bytes()).hexdigest()
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Waterfields", cuisine="Bakery", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide)
    held = {h for h, _ in holdback}
    print(f"wrote {out}: {len(items)} products with a table, {len(items) - len(held)} published, {len(held)} held back; feed sha256 {feed_sha}")
    for h, why in holdback:
        print(f"  held: {h}: {why}")
    for line in report:
        print(f"  note: {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
