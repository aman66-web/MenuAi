#!/usr/bin/env python3
"""Build data/source/puccinos/ from Puccino's official "Allergen and Nutritional Information Guide" PDF.

    python3 tools/uk_extract/puccinos.py path/to/guide.pdf --checked-on 2026-10-06 [--out DIR]

Needs poppler's `pdftotext`. The guide is one big table set: every item sits in a block of rows (drinks: Small /
Regular / Large rows, or a single row when the guide prints no size; food and extras: one row). Each row prints 9 numbers
per 100 g followed by 9 numbers per serving (kJ, Kcal, Fats, Sats, Carbs, Sugar, Fibre, Protein, Salts). Only the
per-serving half is used, copied as printed (kJ is not used). Item names, sizes and the Vegan / Vegetarian label are read
from the PDF too; by hand below: the category/rankable/limited-time rules, the pork/beef words, the holdbacks and the
notes about odd rows.

Safety: the script stops (exit 1) when the PDF no longer matches what was checked by hand (table header, section
headings, number of blocks/rows, the list of item names) so that a new guide is re-read by a human first. After checking
a new guide, update EXPECTED_* below. Held-back rows are re-detected from the numbers: a size conflict that is not
declared in HOLDBACK also stops the script.

Source: https://www.puccinosworldwide.com/wp-content/uploads/Puccinos-Allergen-Nutritional-Information-Guide-27-08-2026.pdf
(linked from https://www.puccinosworldwide.com/allergens/). Great Britain menu only: the guide has no Ireland / regional rows.
"""
import argparse
import hashlib
import html
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "puccinos"
SOURCE_URL = "https://www.puccinosworldwide.com/wp-content/uploads/Puccinos-Allergen-Nutritional-Information-Guide-27-08-2026.pdf"
SOURCE_TITLE = "Puccino's Allergen and Nutritional Information Guide, V2 (file dated 27 August 2026)"
EXPECTED_SHA256 = "a4c93b4f27c5e2c28b6792b76e5ea968965babe9bfe895980638138e78dbcd15"  # the file that was checked by hand

# What the guide looked like when it was checked by hand (see the stop messages in main()).
EXPECTED_BLOCKS = 365
EXPECTED_ROWS = 669
EXPECTED_NAMES_SHA256 = "55ad37bcc322603e581b62967658b91111a923d6edccb26ed5f064c1fc781593"  # hash of the ordered "id|category" list

HEADER = ["kJ", "Kcal", "Fats", "Sats", "Carbs", "Sugar", "Fibre", "Protein", "Salts"] * 2
NUM = re.compile(r"^<?\d+(\.\d+)?$")
SIZE_RANK = {"Small": 0, "Regular": 1, "Large": 2}
LABEL = re.compile(r"^(Vegan|Vegetarian|Vegetarian, Vegan)$")

# Big page headings -> (category, limited_time). "Food" and "Milk Alternatives & Extras" are split by each table's own title.
SECTION = {
    "Hot Coffee": ("Hot coffee", False),
    "Tea": ("Tea", False),
    "Other Hot Drinks": ("Other hot drinks", False),
    "Iced Drinks": ("Iced drinks", False),
    "Matcha": ("Matcha", False),
    "Seasonal": ("Seasonal drinks", True),
    "Food": None,
    "Milk Alternatives & Extras": None,
}
# Table titles on the food and extras pages -> (category, rankable, limited_time)
TABLE = {
    "Pastries": ("Pastries", False, False),
    "Savoury Food": ("Savoury food", True, False),
    "Sweet Treats": ("Sweet treats", False, False),
    "Seasonal Food": ("Seasonal food", False, True),
    "Syrups": ("Syrups", False, False),
    "Extras": ("Extras", False, False),
}
CATEGORY_ORDER = ["Hot coffee", "Tea", "Other hot drinks", "Iced drinks", "Matcha", "Seasonal drinks", "Pastries",
                  "Savoury food", "Sweet treats", "Seasonal food", "Syrups", "Extras"]

PORK_WORDS = re.compile(r"\b(bacon|ham|pepperoni|sausage|pork|salami|chorizo)\b", re.I)
BEEF_WORDS = re.compile(r"\b(beef|steak)\b", re.I)

# Items not published, by id. Never corrected: the guide's own numbers contradict themselves.
CONTRADICTS = "The guide's own numbers contradict each other, so this row is not published: "
HOLDBACK = {
    "classic-iced-latte-semi-skimmed-milk": CONTRADICTS + "sugars (26 g) are more than carbohydrate (13 g) per serving.",
    "classic-iced-latte-almond-milk": CONTRADICTS + "sugars (22 g) are more than carbohydrate (8.8 g) per serving.",
    "classic-iced-latte-coconut-milk": CONTRADICTS + "sugars (23 g) are more than carbohydrate (10 g) per serving.",
    "vegan-cream-extra": "Every number is printed as 0 (per 100 g and per serving), including energy, fat and carbohydrate: a cream cannot be "
                         "zero energy, so this looks like an empty placeholder row.",
    "iced-americano-coconut-milk": "Numbers and the allergen text (Tree nuts, Almonds) are identical to the Almond Milk row above it and unlike "
                                   "every other coconut milk drink: the row looks copied from the almond one.",
    "salted-caramel-latte-semi-skimmed-milk-small": CONTRADICTS + "the Small row is identical to the Skimmed Milk Small row (same fat, same energy) "
                                                    "although the Regular and Large rows show skimmed milk well below semi-skimmed.",
    "salted-caramel-latte-skimmed-milk-small": CONTRADICTS + "the Small row is identical to the Semi Skimmed Milk Small row (same fat, same energy) "
                                               "although the Regular and Large rows show skimmed milk well below semi-skimmed.",
    "toasted-marshmallow-hot-chocolate-oat-milk-small": CONTRADICTS + "Small and Regular have identical numbers (389 kcal) but Large differs.",
    "toasted-marshmallow-hot-chocolate-oat-milk-regular": CONTRADICTS + "Small and Regular have identical numbers (389 kcal) but Large differs.",
    "toasted-marshmallow-hot-chocolate-soya-milk-regular": CONTRADICTS + "Regular and Large have identical numbers (403 kcal) but Small differs.",
    "toasted-marshmallow-hot-chocolate-soya-milk-large": CONTRADICTS + "Regular and Large have identical numbers (403 kcal) but Small differs.",
    "caramelised-orange-hot-chocolate-skimmed-milk-regular": CONTRADICTS + "Regular (475 kcal) is printed as larger than Large (407 kcal).",
    "caramelised-orange-hot-chocolate-skimmed-milk-large": CONTRADICTS + "Regular (475 kcal) is printed as larger than Large (407 kcal).",
    "caramelised-orange-hot-chocolate-almond-milk-regular": CONTRADICTS + "Regular (345 kcal) is printed as larger than Large (305 kcal).",
    "caramelised-orange-hot-chocolate-almond-milk-large": CONTRADICTS + "Regular (345 kcal) is printed as larger than Large (305 kcal).",
}

# Odd rows that ARE published (notes are not exported). Keys must be real ids.
NOTES = {
    "mocha-semi-skimmed-milk-small": "The guide prints no Large row for this drink (the row is blank in the PDF).",
    "mocha-semi-skimmed-milk-regular": "The guide prints no Large row for this drink (the row is blank in the PDF).",
    "matcha-tea-small": "Small and Regular print identical numbers (9 kcal); per 100g shows matcha powder values, not the drink.",
    "matcha-tea-regular": "Small and Regular print identical numbers (9 kcal); per 100g shows matcha powder values, not the drink.",
}

NOTE_TXT = ("Puccino's gives drink values per cup by milk and size (Small, Regular, Large; no cup volume is stated); iced drinks and "
            "food show one serving with no stated size. Extra syrups, sauces and cream are listed separately as extras.")


def read_pages(pdf: Path) -> list[list[tuple]]:
    proc = subprocess.run(["pdftotext", "-bbox", str(pdf), "-"], capture_output=True, text=True, check=True)
    pages = []
    for pg in proc.stdout.split("<page ")[1:]:
        ws = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
              re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg)]
        pages.append([w for w in ws if w[1] < 1140])  # drop the footer line
    return pages


def join_line(words: list[tuple]) -> str:
    return " ".join(w[4] for w in sorted(words, key=lambda w: w[0]))


def fail(msg: str) -> None:
    print("STOP: " + msg, file=sys.stderr)
    sys.exit(1)


def parse(pdf: Path):
    """Return a list of blocks: dict(page, category, rankable, limited, name, label, allergens, rows=[(size, [18 numbers])])."""
    pages = read_pages(pdf)
    blocks = []
    section = None
    for pno, ws in enumerate(pages, 1):
        hdr = sorted(w for w in ws if w[4] == "Allergens")
        if not hdr or not any(w[4] == "kJ" for w in ws):
            continue  # cover and "About this guide" pages carry no table
        # big section heading (font height ~29.6): only on the first page of a section
        big = sorted([w for w in ws if w[0] < 400 and w[3] - w[1] > 27], key=lambda w: (round(w[1]), w[0]))
        if big:
            title = " ".join(w[4] for w in big)
            if title not in SECTION:
                fail(f"page {pno}: unknown section heading {title!r}")
            section = title
        for ti, h in enumerate(hdr):
            hy = h[1]
            head_words = sorted([w for w in ws if abs(w[1] - hy) < 6 and w[0] > h[0]], key=lambda w: w[0])
            if "kJ" not in [w[4] for w in head_words]:
                continue  # page 2 ("About this guide") has the word Allergens in a sentence, not a table header
            if [w[4] for w in head_words] != HEADER:
                fail(f"page {pno}: table header columns changed: {[w[4] for w in head_words]}")
            if section is None:
                fail(f"page {pno}: table before any section heading")
            k1 = head_words[0][0]
            nxt = hdr[ti + 1][1] - 100 if ti + 1 < len(hdr) else 5000
            body = [w for w in ws if hy + 8 < w[1] < nxt]
            title_words = [w for w in ws if w[0] < 400 and 22 < w[3] - w[1] < 24 and hy - 70 < w[1] < hy - 3]
            table_title = " ".join(w[4] for w in sorted(title_words, key=lambda w: (round(w[1]), w[0])))
            if SECTION[section] is not None:
                category, limited = SECTION[section]
                rankable = False
            else:
                if table_title not in TABLE:
                    fail(f"page {pno}: unknown table title {table_title!r}")
                category, rankable, limited = TABLE[table_title]
            # data rows: 18 numbers (plus an optional size word) to the right of the allergen column
            lines: dict[int, list] = {}
            for w in body:
                if w[0] >= k1 - 80:
                    lines.setdefault(round(w[1] / 4), []).append(w)
            rows = []
            for key in sorted(lines):
                L = sorted(lines[key], key=lambda w: w[0])
                nums = [w for w in L if w[0] >= k1 - 15 and NUM.match(w[4])]
                if not nums:
                    continue
                if len(nums) != 18:
                    fail(f"page {pno}: a row has {len(nums)} numbers instead of 18: {[w[4] for w in L]}")
                size = [w[4] for w in L if w[4] in SIZE_RANK]
                rows.append({"y": sum(w[1] + w[3] for w in L) / 2 / len(L), "size": size[0] if size else "", "n": [w[4] for w in nums]})
            # left-hand text: names (start at the left margin), Vegan/Vegetarian labels, allergen text
            left = [w for w in body if w[0] < k1 - 80]
            ylines: dict[int, list] = {}
            for w in left:
                ylines.setdefault(round((w[1] + w[3]) / 2 / 3), []).append(w)
            names, labels, allerg = [], [], []
            for key in sorted(ylines):
                L = sorted(ylines[key], key=lambda w: w[0])
                yc = (L[0][1] + L[0][3]) / 2
                if L[0][0] < 150:
                    if LABEL.match(join_line(L)):
                        labels.append((yc, join_line(L)))
                        continue
                    parts = [L[0]]
                    for w in L[1:]:
                        if w[0] - parts[-1][2] < 10:
                            parts.append(w)
                        else:
                            break
                    names.append((yc, " ".join(p[4] for p in parts)))
                    rest = L[len(parts):]
                else:
                    rest = L
                if rest:
                    allerg.append((yc, " ".join(p[4] for p in rest)))
            # group rows into blocks: a size row that does not go up in size starts a new block
            bl, prev = [], -1
            for r in rows:
                rk = SIZE_RANK.get(r["size"], -1)
                if rk == -1 or rk <= prev or not bl:
                    bl.append({"rows": [r]})
                else:
                    bl[-1]["rows"].append(r)
                prev = rk
            for b in bl:
                b.update(y0=min(r["y"] for r in b["rows"]), y1=max(r["y"] for r in b["rows"]), names=[], allerg=[], labels=[],
                         page=pno, category=category, rankable=rankable, limited=limited)

            def dist(b, y):
                return 0 if b["y0"] - 3 <= y <= b["y1"] + 3 else min(abs(y - b["y0"]), abs(y - b["y1"]))
            for y, t in names:
                min(bl, key=lambda b: dist(b, y))["names"].append((y, t))
            for y, t in allerg:
                min(bl, key=lambda b: dist(b, y))["allerg"].append((y, t))
            for y, t in labels:
                above = [b for b in bl if b["y1"] <= y + 6]
                if not above:
                    fail(f"page {pno}: a {t!r} label has no item above it")
                max(above, key=lambda b: b["y1"])["labels"].append(t)
            blocks.extend(bl)
    for b in blocks:
        b["name"] = " ".join(t for _, t in sorted(b["names"]))
        b["allergens"] = " ".join(t for _, t in sorted(b["allerg"]))
        if not b["name"]:
            fail(f"page {b['page']}: a block of numbers has no item name")
        if len(b["labels"]) > 1:
            fail(f"page {b['page']}: {b['name']!r} got two labels {b['labels']}")
    return blocks


def read_allergens(text: str, where: str) -> dict:
    """The guide's allergen column for one item: "Contains: A, B, C (May Contain: D, E)". Either part may be missing; an item
    with no text at all (a plain tea, a syrup) is printed with no allergens. Every word must be a known allergen word (stops
    otherwise). A printed "Contains: Oats" is stored as gluten with the cereal oats (oats are a cereal containing gluten)."""
    text = " ".join(text.split())
    m = re.match(r"^(?:Contains:\s*(?P<c>.*?))?\s*(?:\(May Contain:\s*(?P<m>.*?)\))?$", text)
    if not m:
        fail(f"{where}: cannot read the allergen text {text!r}")
    c = [w for w in (m.group("c") or "").split(",") if w.strip()]
    mc = [w for w in (m.group("m") or "").split(",") if w.strip()]
    if text and not c and not mc:
        fail(f"{where}: allergen text {text!r} has no allergens in it")
    keys, cereals, nuts = allergen_words(c, where)
    mkeys, _, _ = allergen_words(mc, where)  # which cereal / nut kinds "may" be present is not stored: the generic allergen is
    return {"contains": keys, "may_contain": mkeys, "cereals": cereals, "nuts": nuts}


def tidy(name: str) -> str:
    return re.sub(r"\bmilk\b", "Milk", name)  # the guide prints "Almond milk" in a few rows


def build_items(blocks):
    items, notes_seen = [], set()
    for b in blocks:
        sized = [r for r in b["rows"] if r["size"]]
        base = tidy(b["name"])
        label = b["labels"][0] if b["labels"] else ""
        contains = b["allergens"].split("(May Contain")[0]
        allergens = read_allergens(b["allergens"], f"page {b['page']} {b['name']!r}")
        vegan_name = bool(re.search(r"\bVegan\b", base))
        for r in b["rows"]:
            n = r["n"]
            name = f"{base} ({r['size'].lower()})" if len(sized) > 1 else base
            item_id = slug(name)
            tags = []
            if label or vegan_name:
                tags.append("vegetarian")
            if not vegan_name and PORK_WORDS.search(base):
                tags.append("contains_pork")
            if not vegan_name and BEEF_WORDS.search(base):
                tags.append("contains_beef")
            notes = []
            if label and re.search(r"\b(Milk|Eggs)\b", contains):
                notes.append(f"Marked {label} in the guide although its allergens list {contains.replace('Contains:', '').strip()}.")
            if vegan_name and not label:
                notes.append("Called vegan in its name; the guide shows no Vegan label for it.")
            if item_id in NOTES:
                notes.append(NOTES[item_id])
                notes_seen.add(item_id)
            items.append({
                "id": item_id, "name": name, "category": b["category"], "serving": r["size"],
                "calories": n[10], "protein_g": n[16], "carbs_g": n[13], "fat_g": n[11],
                "sat_fat_g": n[12], "sodium_mg": "", "salt_g": n[17], "sugar_g": n[14], "fiber_g": n[15],
                "tags": "|".join(tags), "limited_time": b["limited"], "rankable": b["rankable"],
                "notes": " ".join(notes), "allergens": allergens, "_page": b["page"], "_block": id(b), "_size": r["size"],
            })
    missing = set(NOTES) - notes_seen
    if missing:
        fail(f"NOTES names items that no longer exist: {sorted(missing)}")
    return items


def size_conflicts(items) -> set[str]:
    """Ids whose sizes contradict each other inside one drink (identical rows, or a larger size with fewer kcal),
    for drinks of 50 kcal or more (smaller ones can match after rounding)."""
    by_block: dict[int, list] = {}
    for it in items:
        if it["_size"]:
            by_block.setdefault(it["_block"], []).append(it)
    bad: set[str] = set()
    key = ("calories", "protein_g", "carbs_g", "fat_g", "sat_fat_g", "salt_g", "sugar_g", "fiber_g")
    for rows in by_block.values():
        rows.sort(key=lambda it: SIZE_RANK[it["_size"]])
        for a, c in zip(rows, rows[1:]):
            if float(a["calories"]) < 50 and float(c["calories"]) < 50:
                continue
            if all(a[k] == c[k] for k in key) or float(c["calories"]) < float(a["calories"]):
                bad.update((a["id"], c["id"]))
    return bad


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you extracted the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    sha = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    if sha != EXPECTED_SHA256:
        print(f"note: this PDF (sha256 {sha[:16]}...) is not the file that was checked by hand "
              f"({EXPECTED_SHA256[:16]}...); the structural checks below decide whether it can be read.", file=sys.stderr)
    blocks = parse(args.pdf)
    nrows = sum(len(b["rows"]) for b in blocks)
    if len(blocks) != EXPECTED_BLOCKS or nrows != EXPECTED_ROWS:
        fail(f"the PDF has {len(blocks)} items / {nrows} rows but this script expects {EXPECTED_BLOCKS} / {EXPECTED_ROWS}. "
             "The menu or layout changed: re-check the names, sizes and categories against the PDF before running again.")
    items = build_items(blocks)
    names_sha = hashlib.sha256("\n".join(f"{it['id']}|{it['category']}" for it in items).encode()).hexdigest()
    if EXPECTED_NAMES_SHA256 and names_sha != EXPECTED_NAMES_SHA256:
        fail("the list of item names/categories changed although the counts match (a rename or a swap). "
             f"Re-check the PDF, then update EXPECTED_NAMES_SHA256 = {names_sha!r}")
    ids = [it["id"] for it in items]
    if len(ids) != len(set(ids)):
        fail(f"duplicate ids: {sorted({i for i in ids if ids.count(i) > 1})}")
    unknown = set(HOLDBACK) - set(ids)
    if unknown:
        fail(f"HOLDBACK names items that no longer exist: {sorted(unknown)}")
    undeclared = size_conflicts(items) - set(HOLDBACK)
    if undeclared:
        fail(f"these rows contradict their own size rows but are not in HOLDBACK (decide by hand): {sorted(undeclared)}")
    items.sort(key=lambda it: CATEGORY_ORDER.index(it["category"]))
    holdback = [(i, HOLDBACK[i]) for i in ids if i in HOLDBACK]
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Puccino's", cuisine="Coffee", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["puccinos", "puccino's", "puccinos coffee", "puccino's coffee"],
        items=[{k: v for k, v in it.items() if not k.startswith("_")} for it in items], out=args.out, note=NOTE_TXT, holdback=holdback,
        allergen_guide={"title": SOURCE_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"wrote {len(items)} items ({len(holdback)} of them held back) to {out}; PDF sha256 {sha}; names hash {names_sha}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
