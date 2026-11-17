#!/usr/bin/env python3
"""Build data/source/chipotle/ from Chipotle UK's official "UK Restaurants Nutrition Guide" and "Allergen Guide" (one PDF).

    curl -A "Mozilla/5.0" -o UK_Allergen_Guide_Nov2026.pdf "https://www.chipotle.co.uk/content/dam/chipotle/menu/nutrition/2026/eu/UK_Allergen_Guide_Nov2026%202-94.pdf"
    python3 tools/uk_extract/chipotle.py UK_Allergen_Guide_Nov2026.pdf --checked-on 2026-11-17

SOURCE: CHART_URL, linked as "NUTRITION" from https://www.chipotle.co.uk/allergens (read 2026-11-17; robots.txt of www.chipotle.co.uk
disallows only /error-page). Two pages, each footed "Version 1.0 | Information correct at 3 November 2026" and headed "VALID FROM
NOVEMBER 2026" (PDF created 13 Nov 2026, Last-Modified 13 Nov 2026, sha256 37afec5f...):
  * page 1 "NUTRITION GUIDE": one table, in sections (TORTILLAS & CHIPS ... TRACTOR DRINKS). Each row: the ingredient's label, its
    serving ("113 g", "450 ml"), then nine figures per serving (kJ, kcal, fat, saturates, carbohydrate, sugars, fibre, protein, salt)
    and the same nine per 100 g (drinks per 100 ml). The page has a text layer, so the figures are COPIED by this script
    (`pdftotext -layout`), exactly as printed ("<0.5" stays "<0.5": docs/DATA.md "Less than" values). Only names, ids, categories,
    serving words and notes are written by hand (SPEC below).
  * page 2 "ALLERGEN GUIDE": the same ingredients (one line per product, not per size), the dietary marks V and VG (text layer) and a
    grid of the 14 allergens where a red tick marks "Contains" (drawn, not text). The ticks are read by this script from a 100 dpi render
    (pdftoppm): each cell of the grid is measured for the tick's red; a cell that is neither clearly empty nor clearly ticked stops the run,
    and so does any red mark in an ingredient's row outside a cell. Under the grid: "CEREALS CONTAINING GLUTEN / Contains wheat: Burrito
    flour tortilla and Taco flour tortillas." (read from the text layer; the script stops unless exactly those rows carry the gluten tick)
    and a general "MAY CONTAIN" paragraph that names no ingredient (so no item gets a may-contain; may_contain_published = no).

CHECKS (the run stops on any of them): the two "Information correct at 3 November 2026" lines (a re-issued guide must be looked at by a
human); the section names and the number of rows in each; 18 printed numbers per row; every per-serving figure agrees with the per-100 g
figure times the serving within the printed rounding (catches a column read in the wrong place); every page-1 row has exactly one
page-2 allergen line and every page-2 line is used; every product in SPEC is printed and vice versa.

HISTORY: until 17 Nov 2026 the source was the image-only chart Allergen-UK270726.pdf (Aug 2026), transcribed by eye; it is no longer
linked from the allergens page. This guide prints new figures for every product (e.g. coriander-lime white rice 185 -> 229 kcal) and
adds the rows that chart's extraction had left out (crispy corn taco shells, kids' chips, queso, supergreens, the limited-time chickens
and the drinks). Item ids of the products that were already published are kept.

Items are not rankable: the guide publishes each ingredient but no finished burrito, bowl, salad or taco ("Add up the ingredients you
choose"), and building one would mean adding ingredients together.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, write_chain_folder  # noqa: E402

CHAIN_ID = "chipotle"
CHART_URL = "https://www.chipotle.co.uk/content/dam/chipotle/menu/nutrition/2026/eu/UK_Allergen_Guide_Nov2026%202-94.pdf"
GUIDE_DATE = "3 November 2026"
VERSION = "Version 1.0"
SOURCE_TITLE = "Chipotle UK Restaurants Nutrition Guide and Allergen Guide, per serving (Version 1.0, information correct at 3 November 2026)"
ALLERGEN_GUIDE = {"title": "Chipotle UK Restaurants Allergen Guide (Version 1.0, information correct at 3 November 2026)", "url": CHART_URL,
                  "may_contain_published": False}
ALIASES = ["chipotle", "chipotle mexican grill"]
BEEF, PORK, VEG = "contains_beef", "contains_pork", "vegetarian"

# The page-1 sections as printed, in order, with the number of rows each must have -> our category.
SECTIONS = [("TORTILLAS & CHIPS", 6, "Tortillas & chips"), ("RICE & BEANS", 4, "Rice & beans"), ("PROTEINS & VEGGIES", 6, "Proteins & veggies"),
            ("SALSAS", 4, "Salsas"), ("TOPPINGS & DRESSING", 11, "Toppings & dressing"), ("LIMITED TIME OFFERS", 3, "Limited time"),
            ("FOUNTAIN DRINKS", 12, "Fountain drinks"), ("TRACTOR DRINKS", 8, "Tractor drinks")]

# Page 2's 14 allergen columns as printed (header words) -> our key (docs/DATA.md).
GRID = [("Cereals containing gluten", "gluten"), ("Crustaceans", "crustaceans"), ("Eggs", "eggs"), ("Fish", "fish"), ("Peanuts", "peanuts"),
        ("Soya", "soya"), ("Milk", "milk"), ("Tree nuts", "nuts"), ("Celery", "celery"), ("Mustard", "mustard"), ("Sesame", "sesame"),
        ("Sulphites", "sulphites"), ("Lupin", "lupin"), ("Molluscs", "molluscs")]

# Page-1 label -> (item id, our name, serving words, extra tags, note). Ids of products published before 17 Nov 2026 are kept.
# `serving` only where the portion is more than a plain weight or volume (the item page shows the weight itself).
SPEC = {
    "Burrito flour tortilla": ("flour-tortilla-burrito", "Flour Tortilla (burrito)", "1 tortilla", [], ""),
    "Taco flour tortillas (3)": ("flour-tortillas-taco-3", "Flour Tortillas (taco, 3)", "3 tortillas", [], ""),
    "Crispy corn taco shells (3)": ("crispy-corn-taco-shells-3", "Crispy Corn Taco Shells (3)", "3 shells", [], ""),
    "Tortilla chips Regular": ("chips-regular", "Chips (regular)", "Regular", [], ""),
    "Tortilla chips Large": ("chips-large", "Chips (large)", "Large", [], ""),
    "Tortilla chips Kids": ("chips-kids", "Chips (kids)", "Kids", [], ""),
    "Coriander-lime white rice": ("coriander-lime-white-rice", "Coriander-Lime White Rice", "", [], ""),
    "Coriander-lime brown rice": ("coriander-lime-brown-rice", "Coriander-Lime Brown Rice", "", [], ""),
    "Black beans": ("black-beans", "Black Beans", "", [], ""),
    "Pinto beans": ("pinto-beans", "Pinto Beans", "", [], ""),
    "Chicken": ("chicken", "Chicken", "", [], ""),
    "Steak": ("steak", "Steak", "", [BEEF], ""),
    "Barbacoa": ("barbacoa", "Barbacoa", "", [], "The guide does not state the meat, so no meat tag"),
    "Carnitas": ("carnitas", "Carnitas", "", [PORK], "Pork: Chipotle's allergens page (chipotle.co.uk/allergens) says 'Our carnitas are made with pork'"),
    "Sofritas": ("sofritas-braised-tofu", "Sofritas (braised tofu)", "", [], ""),
    "Fajita vegetables": ("fajita-vegetables", "Fajita Vegetables", "", [], ""),
    "Fresh tomato salsa": ("fresh-tomato-salsa", "Fresh Tomato Salsa", "", [], ""),
    "Chilli-corn salsa": ("chilli-corn-salsa", "Chilli-Corn Salsa", "", [], ""),
    "Roasted tomato green-chilli salsa": ("roasted-tomato-green-chilli-salsa", "Roasted Tomato Green-Chilli Salsa", "", [], ""),
    "Roasted tomato red-chilli salsa": ("roasted-tomato-red-chilli-salsa", "Roasted Tomato Red-Chilli Salsa", "", [], ""),
    "Sour cream": ("sour-cream", "Sour Cream", "", [], ""),
    "Monterey Jack cheese": ("monterey-jack-cheese", "Monterey Jack Cheese", "", [], ""),
    "Queso Entree": ("queso-entree", "Queso (entree)", "Entree", [], "The guide's 'Entree' portion"),
    "Queso Side": ("queso-side", "Queso (side)", "Side", [], ""),
    "Queso Large": ("queso-large", "Queso (large)", "Large", [], ""),
    "Guacamole Topping/side": ("guacamole-topping-side", "Guacamole (topping/side)", "", [], ""),
    "Guacamole Large": ("guacamole-large", "Guacamole (large)", "Large", [], ""),
    "Romaine lettuce Salad": ("romaine-lettuce-85-g", "Romaine Lettuce (salad)", "Salad", [], ""),
    "Romaine lettuce Topping": ("romaine-lettuce-28-g", "Romaine Lettuce (topping)", "Topping", [], ""),
    "Supergreens salad mix": ("supergreens-salad-mix", "Supergreens Salad Mix", "", [], ""),
    "Chipotle-honey vinaigrette": ("chipotle-honey-vinaigrette", "Chipotle Honey Vinaigrette", "", [], ""),
    "Chicken al pastor": ("chicken-al-pastor", "Chicken al Pastor", "", [], "Limited time offer"),
    "Chipotle honey chicken": ("chipotle-honey-chicken", "Chipotle Honey Chicken", "", [], "Limited time offer"),
    "Pollo asado": ("pollo-asado", "Pollo Asado", "", [], "Limited time offer"),
}
for _size, _ml in (("16 oz", "450 ml"), ("20 oz", "565 ml")):
    for _drink in ("Coca Cola", "Diet Coke", "Coke Zero", "Sprite Zero", "Dr Pepper Zero", "Fanta Orange", "Watermelon Mint",
                   "Mandarin & Cardamom", "Berry Patch", "Lemonade"):
        _label = f"{_drink} {_size}"
        SPEC[_label] = (re.sub(r"[^a-z0-9]+", "-", _label.lower()).strip("-"), f"{_drink} ({_size})", f"{_size} ({_ml})", [], "")

# Rows the guide prints impossibly (a part larger than its whole): not published, never corrected. None in Version 1.0.
HOLDBACK: list[tuple[str, str]] = []

NOTE = ("Chipotle UK publishes values for single ingredients only, not finished burritos or bowls, and we don't add them together. Its "
        "guide says allergens are handled in its kitchens, some equipment is shared and some ingredients are made where gluten cereals "
        "and soya are handled, so it cannot guarantee any item is free from any allergen.")

NUM = re.compile(r"^<?\d+(?:\.\d+)?$")
ROW = re.compile(r"^\s*(\S.*?)\s{2,}(\d+(?:\.\d+)?) (g|ml)\s+(.*\S)\s*$")
NUTRIENTS = ("energy_kj", "calories", "fat_g", "sat_fat_g", "carbs_g", "sugar_g", "fiber_g", "protein_g", "salt_g")
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
DPI = 100


def die(msg: str) -> int:
    print(msg, file=sys.stderr)
    return 1


def pdftotext(pdf: Path, page: int, *opts: str) -> str:
    return subprocess.run(["pdftotext", *opts, "-f", str(page), "-l", str(page), str(pdf), "-"], check=True, capture_output=True,
                          text=True).stdout


def unit(printed: str) -> float:
    """The step of the last printed digit: '18' -> 1, '0.6' -> 0.1, '0.02' -> 0.01."""
    p = printed.lstrip("<")
    return 10 ** -len(p.split(".")[1]) if "." in p else 1.0


def read_nutrition(pdf: Path) -> list[dict]:
    """Page 1 -> [{"section", "label", "size", "uom", <NUTRIENTS> as printed}] in printed order."""
    text = pdftotext(pdf, 1, "-layout")
    if f"Information correct at {GUIDE_DATE}" not in text or f"{VERSION} | Information correct at {GUIDE_DATE}" not in text:
        raise SystemExit(f"page 1 no longer says '{VERSION} | Information correct at {GUIDE_DATE}': a re-issued guide, look at it first")
    names = [s for s, _, _ in SECTIONS]
    rows, section = [], None
    for line in text.splitlines():
        if line.strip() in names:
            section = line.strip()
            continue
        m = ROW.match(line)
        if not m:
            continue
        label, size, uom, rest = m.group(1), m.group(2), m.group(3), m.group(4).split()
        if section is None:
            raise SystemExit(f"a row before the first section: {line!r}")
        if len(rest) != 18 or not all(NUM.match(t) for t in rest):
            raise SystemExit(f"{label!r}: expected 18 printed numbers, got {rest}")
        per_serving, per_100 = rest[:9], rest[9:]
        for key, a, b in zip(NUTRIENTS, per_serving, per_100):
            if a.startswith("<") or b.startswith("<"):
                continue
            want = float(b) * float(size) / 100
            tol = 0.5 * unit(b) * float(size) / 100 + 0.5 * unit(a) + 0.02 * float(a)
            if abs(float(a) - want) > tol:
                raise SystemExit(f"{label!r} {key}: per serving {a} does not fit per 100 {b} x {size} {uom} (= {want:.2f}): column misread?")
        rows.append({"section": section, "label": label, "size": size, "uom": uom, **dict(zip(NUTRIENTS, per_serving))})
    for name, count, _ in SECTIONS:
        got = sum(1 for r in rows if r["section"] == name)
        if got != count:
            raise SystemExit(f"section {name!r} has {got} rows, this script expects {count}: the guide changed, re-check SPEC")
    return rows


def _words(xml: str) -> list[tuple[float, float, float, float, str]]:
    import html
    return [(float(a), float(b), float(c), float(d), html.unescape(e)) for a, b, c, d, e in WORD.findall(xml)]


def read_allergens(pdf: Path) -> tuple[list[dict], set[str]]:
    """Page 2 -> ([{"name", "V", "VG", "contains": set}], names the 'Contains wheat:' line lists)."""
    from PIL import Image
    text = pdftotext(pdf, 2, "-layout")
    if f"{VERSION} | Information correct at {GUIDE_DATE}" not in text:
        raise SystemExit(f"page 2 no longer says '{VERSION} | Information correct at {GUIDE_DATE}': look at it first")
    m = re.search(r"Contains wheat:\s*(.+?)\.\s*$", text, re.M)
    if not m:
        raise SystemExit("the 'Contains wheat:' line under the grid is gone: re-check how the guide names cereals")
    wheat = {n.strip().lower() for n in re.split(r",| and ", m.group(1)) if n.strip()}
    words = _words(pdftotext(pdf, 2, "-bbox-layout"))
    # column centres from the rotated header words (the header band sits between "INGREDIENT" and the first section bar)
    head = [w for w in words if 395 < w[1] < 480 and w[0] > 390]
    cols = []
    for label, key in GRID:
        parts = label.split()
        ws = [w for w in head if w[4] in parts]
        xs = sorted({round((w[0] + w[2]) / 2, 1) for w in ws})
        group = [x for x in xs if abs(x - xs[0]) < 15] if xs else []
        if not group or (len(parts) == 1 and len(ws) != 1):
            raise SystemExit(f"allergen column {label!r} not found in the header")
        cols.append((key, sum(group) / len(group) if label != "Cereals containing gluten" else (min(w[0] for w in ws) + max(w[2] for w in ws)) / 2))
    xs = [c[1] for c in cols]
    if xs != sorted(xs) or min(b - a for a, b in zip(xs, xs[1:])) < 40:
        raise SystemExit(f"allergen columns out of order or too close: {cols}")
    # ingredient lines: words at x=57 (the name column) between the header and the "CEREALS CONTAINING GLUTEN" box, not section bars
    end_y = min(w[1] for w in words if w[4] == "CEREALS")
    lines: dict[float, list] = {}
    for w in words:
        if w[0] < 300 and 480 < w[1] < end_y:
            key = next((k for k in lines if abs(k - w[1]) < 3), w[1])
            lines.setdefault(key, []).append(w)
    rows = []
    for y, ws in sorted(lines.items()):
        name = " ".join(w[4] for w in sorted(ws, key=lambda w: w[0]))
        if name.isupper():   # a section bar
            continue
        marks = {w[4] for w in words if 300 < w[0] < 390 and abs(w[1] - y - 0.5) < 3.5}
        rows.append({"name": name, "y": (min(w[1] for w in ws) + max(w[3] for w in ws)) / 2, "V": "V" in marks, "VG": "VG" in marks})
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-f", "2", "-l", "2", "-r", str(DPI), "-png", str(pdf), f"{tmp}/p"], check=True)
        img = Image.open(next(Path(tmp).glob("p*.png"))).convert("RGB")
    s = DPI / 72.0
    px = img.load()

    def red(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return r > 140 and g < 90 and b < 90 and r - g > 80

    x_lo, x_hi = int((xs[0] - 27) * s), int((xs[-1] + 27) * s)
    for row in rows:
        row["contains"] = set()
        cy = row["y"] * s
        band = range(int(cy - 8 * s), int(cy + 8 * s) + 1)
        claimed = set()
        for key, cx in cols:
            box = [(x, y) for x in range(int((cx - 8) * s), int((cx + 8) * s) + 1) for y in band]
            frac = sum(red(x, y) for x, y in box) / len(box)
            if frac > 0.25:
                row["contains"].add(key)
            elif frac > 0.02:
                raise SystemExit(f"{row['name']!r} / {key}: the cell is neither clearly ticked nor clearly empty ({frac:.2f} red): look at it")
            claimed.update(x for x, _ in box)
        stray = [(x, y) for x in range(x_lo, x_hi) for y in band if x not in claimed and red(x, y)]
        if stray:
            raise SystemExit(f"{row['name']!r}: red marks in the row outside any allergen cell, e.g. {stray[:3]}: look at it")
    return rows, wheat


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="UK_Allergen_Guide_Nov2026 2-94.pdf, downloaded from CHART_URL")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the guide")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    digest = hashlib.sha256(args.pdf.read_bytes()).hexdigest()

    nutrition = read_nutrition(args.pdf)
    allergen_rows, wheat = read_allergens(args.pdf)
    labels = [r["label"] for r in nutrition]
    if sorted(labels) != sorted(SPEC):
        return die(f"rows printed but not in SPEC: {sorted(set(labels) - set(SPEC))}; in SPEC but not printed: {sorted(set(SPEC) - set(labels))}")
    by_name = {r["name"].lower(): r for r in allergen_rows}
    if len(by_name) != len(allergen_rows):
        return die("two allergen lines with the same name")
    used = set()
    items = []
    cats = {s: c for s, _, c in SECTIONS}
    for r in nutrition:
        lab = r["label"].lower()   # the allergen line is the product's name; a size or count may follow it on page 1
        matches = [lab] if lab in by_name else [n for n in by_name if lab.startswith(n + " ")]
        if len(matches) != 1:
            return die(f"{r['label']!r}: expected one allergen line, found {matches}")
        a = by_name[matches[0]]
        used.add(matches[0])
        iid, name, serving, tags, note = SPEC[r["label"]]
        if a["V"]:
            tags = tags + [VEG]
        if a["VG"] and not a["V"]:
            return die(f"{r['label']!r}: marked VG but not V")
        if "gluten" in a["contains"] and matches[0] not in wheat:
            return die(f"{r['label']!r}: gluten ticked but not named in 'Contains wheat:'")
        items.append({
            "id": iid, "name": name, "category": cats[r["section"]], "serving": serving,
            "calories": r["calories"], "protein_g": r["protein_g"], "carbs_g": r["carbs_g"], "fat_g": r["fat_g"], "sat_fat_g": r["sat_fat_g"],
            "sodium_mg": "", "salt_g": r["salt_g"], "sugar_g": r["sugar_g"], "fiber_g": r["fiber_g"], "energy_kj": r["energy_kj"],
            "weight_g": r["size"] if r["uom"] == "g" else "",
            "tags": "|".join(sorted(set(tags))), "limited_time": r["section"] == "LIMITED TIME OFFERS", "rankable": False,
            "notes": "; ".join(x for x in (f"Nutrition Guide ({VERSION}, {GUIDE_DATE}) p1 '{r['label']}', serving {r['size']} {r['uom']}"
                                           + (f"; allergens from the Allergen Guide line '{a['name']}'" if a["name"] != r["label"] else ""),
                                           note) if x),
            "allergens": {"contains": set(a["contains"]), "may_contain": set(),
                          "cereals": {"wheat"} if "gluten" in a["contains"] else set(), "nuts": set()},
        })
    unused = set(by_name) - used
    if unused:
        return die(f"allergen lines with no nutrition row: {sorted(unused)}")
    ticked_gluten = {n for n, r in by_name.items() if "gluten" in r["contains"]}
    if ticked_gluten != wheat:
        return die(f"'Contains wheat:' names {sorted(wheat)} but the grid ticks gluten for {sorted(ticked_gluten)}")
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    missing = [h for h, _ in HOLDBACK if h not in ids]
    assert not missing, f"holdback names items that no longer exist: {missing}"

    if not HOLDBACK:   # write_chain_folder writes holdback.csv only when something is held back: drop a stale one
        (Path(args.out) / "holdback.csv").unlink(missing_ok=True)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Chipotle", cuisine="Mexican", source_title=SOURCE_TITLE, source_url=CHART_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=HOLDBACK or None,
                             allergen_guide={**ALLERGEN_GUIDE, "checked_on": args.checked_on})
    if not (out / "allergens.csv").exists():
        return die("allergens.csv was not written: every item must have its allergens")
    ticks = sorted((r["name"], k) for r in allergen_rows for k in r["contains"])
    print(f"allergen ticks read: {len(ticks)}: {ticks}")
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {out} (guide sha256 {digest})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
