#!/usr/bin/env python3
"""Build data/source/gordon-ramsay-restaurants/ from the group's own calorie menus (a CALORIES-ONLY chain).

    python3 tools/uk_extract/gordon_ramsay_restaurants.py --checked-on 2026-10-08 --fetch DIR      # download, then build
    python3 tools/uk_extract/gordon_ramsay_restaurants.py --checked-on 2026-10-08 --pdfs DIR [--out DIR]

Gordon Ramsay Restaurants is a GROUP of separate restaurants. Only these publish calories, each in its own PDF linked from its own
menus page on gordonramsayrestaurants.com (robots.txt allows /assets/ and these pages; checked with tools/uk_extract/robots_rfc.py):

  Street Burger + Street Pizza  https://www.gordonramsayrestaurants.com/assets/1Calorie-Matrices/DUAL-STREET-CALORIE-MATRIX.pdf
      linked from https://www.gordonramsayrestaurants.com/en/uk/street-burger/menus/standard (and the street-pizza menus page)
      as "our full menu with calories". Current file (read 17 November 2026): created 14 October 2026 (InDesign), served
      Last-Modified 15 October 2026, sha256 ebaadf8f...; it replaced the file of 7 April 2026 (read 8 October 2026). One page, two columns.
  Lucky Cat Manchester          https://www.gordonramsayrestaurants.com/assets/1Menus-With-Calories/Lucky-Cat/Manchester/Lucky-Cat-Manchester-KCAL.pdf
      linked from https://www.gordonramsayrestaurants.com/lucky-cat-manchester/menus/ ("To view our full menu with calories, click
      here"). Current file (read 17 November 2026): created 14 October 2026, served Last-Modified 16 October 2026, sha256 0964144d...;
      it replaced the file of 24 June 2026. One page, two columns; the restaurant's menus on the same page are dated 14 October 2026
      (ALC-14102026.pdf and others), the same day as this file.

NOT published, and why (every restaurant page on the site was searched for a calorie, kcal, nutrition or allergen link):
  - Lucky Cat Mayfair: its calorie menu (Lucky-Cat-Mayfair-KCAL.pdf) is dated 17 October 2025 (still the file served on 17 November
    2026, Last-Modified 17 Oct 2025, while the restaurant's menus were re-issued on 14 October 2026) and no longer matches the restaurant's
    current A La Carte (15 September 2026), which prints calories beside each dish and differs from the old file (new dishes such as
    wagyu short rib bao and grilled madagascan prawn, and other values, e.g. salmon sashimi 125 now, 123 in the old file; tuna kinilaw
    138 now). Two official files that disagree are never chosen between, so Mayfair is left out until the chain re-issues its file.
  - Bread Street Kitchen (all sites), Restaurant Gordon Ramsay, High, Pétrus, 1890, Savoy Grill, River Restaurant, Heddon Street Kitchen,
    Bar & Grill Mayfair, Plane Food, Lucky Cat Bishopsgate: no calories published on the group's site. Pizza East and Gordon Ramsay at
    Sea Containers have their own websites (pizzaeast.com, seacontainerslondon.com) and were not read.
  - "FULL SCOTTISH (Edinburgh only)" in the April 2026 Street matrix: a single-venue dish (playbook rule 4), left out (the October 2026
    file no longer prints it).
  - "sashimi selection 6 pieces | 10 pieces 476 | 450kcal" (October 2026 Lucky Cat file): the 10-piece selection is printed with FEWER
    calories than the 6-piece selection on the same row (the April file printed 476 | 1092), so the file's own figures cannot both be
    right; the 10-piece row is held back (holdback.csv), the 6-piece row (476, the same as the previous file) is published.

The files print calories ONLY: protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"; every item is not rankable and
the app shows "not published"). Calories are copied from the PDFs as printed (a row that prints two values for sashimi | nigiri
becomes two items). Only names' capitalisation, categories and tags are produced by the script. It STOPS if the printed rows change
(section list, rows per section, or the digest of every printed line), so a human re-checks when the chain re-issues a file.

Categories keep each restaurant separate: "<restaurant> · <the PDF's own section heading>". Dishes that share a name (Brocolli, G.F.C,
Short rib, Grilled tenderstem broccoli ...) are different rows with different calories in the file: both are kept, in their own
sections, never merged; their ids carry the section.

Allergens: neither restaurant publishes an allergen table or guide (the pages say "speak to your server"), so there is no
allergens.csv and no allergen_guide.csv.

Names: as printed, with capitalisation tidied (all-caps names title-cased, lower-case names get a capital first letter). Spelling is not
corrected: the row notes say what the file prints. A lone stray opening quote is dropped. The October 2026 Street file marks some dips
"(SB ONLY)", "(SP ONLY)" or "(SB & SP)": the name says "(Street Burger only)" / "(Street Pizza only)", and nothing for both. A few names
are written out where the file's own heading gives the context (RENAME: "GORDON’S WELLINGTON" and "G.F.C" under BURGERS become
"... Burger", the kids' "PLANT-BASED" and "BEEF" become "Kids ... Burger", "NEW CORN RIBS" is "Corn Ribs"); the row notes keep
the printed name. Tags: vegetarian only where the printed name says vegan; contains_pork / contains_beef only where the
printed name names the meat (ham, chorizo, pepperoni, bacon, pork; beef, ribeye, wagyu); the vegan sausage is not pork.
Needs `pdftotext` (poppler). Runs on Python 3.9.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, str(Path(__file__).parent))
import gordon_ramsay_restaurants_pdf as pdf_reader  # noqa: E402
import robots_rfc  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "gordon-ramsay-restaurants"
HOST = "https://www.gordonramsayrestaurants.com"
ALIASES = ["gordon ramsay restaurants", "gordon ramsay", "street burger", "street pizza", "lucky cat", "lucky cat manchester"]
CUISINE = "Burgers, pizza & Japanese"

STREET = "Street Burger & Pizza"
LUCKY = "Lucky Cat Manchester"
DOCS = {
    "street": dict(file="DUAL-STREET-CALORIE-MATRIX.pdf", path="/assets/1Calorie-Matrices/DUAL-STREET-CALORIE-MATRIX.pdf",
                   restaurant=STREET, skip_above=0.0, skip_below=0.0, rows=98, digest="05cee0b1d75a1f38074d50328060f77b14d0716b3435a5514ec4c1c070857f0e"),
    "lucky": dict(file="Lucky-Cat-Manchester-KCAL.pdf", path="/assets/1Menus-With-Calories/Lucky-Cat/Manchester/Lucky-Cat-Manchester-KCAL.pdf",
                  restaurant=LUCKY, skip_above=300.0, skip_below=1280.0, rows=89, digest="81a262422ec67b148c2d9f566d4e242382273eabfa32ecdbedd2b6d27abfd5b1"),
}
SOURCE_URL = HOST + DOCS["street"]["path"]
SOURCE_TITLE = ("Gordon Ramsay Restaurants calorie menus: Street Burger & Street Pizza (DUAL-STREET-CALORIE-MATRIX.pdf, created 14 October 2026) "
                "and Lucky Cat Manchester (Lucky-Cat-Manchester-KCAL.pdf, created 14 October 2026)")
NOTE = ("Calories only, from each restaurant's own calorie menu: Street Burger & Street Pizza (PDF of 14 Oct 2026) and Lucky Cat Manchester "
        "(PDF of 14 Oct 2026). The group's other restaurants publish no calories; Lucky Cat Mayfair's calorie menu (Oct 2025) is out of "
        "date, so it is not listed.")

# Section headings expected per document, in reading order (left column, then right), with the rows each prints. The script stops if
# a heading or a count changes.
SECTIONS = {  # the files of 14 October 2026
    "street": [("PIZZAS PER SLICE", 7), ("DIPS", 16), ("BURGERS", 15), ("SUPERCHARGE YOUR MEAL", 8), ("PASTA", 2), ("KIDS BURGERS", 4),
               ("SIDES & SHARERS", 9), ("SALADS", 7), ("HOTTER THAN HELL SPICY WINGS OR VEGAN BITES", 12), ("DESSERTS", 4),
               ("MILKSHAKES", 4), ("NON-ALCOHOLIC DRINKS", 5), ("MOCKTAILS", 5)],
    "lucky": [("SNACKS", 6), ("RAW BAR", 4), ("SASHIMI & NIGIRI", 7), ("MAKI", 6), ("SALAD", 3), ("TEMPURA", 3), ("FISH", 4), ("MEAT", 5),
              ("DUMPLINGS & BAO", 4), ("VEGETABLES & RICE", 3), ("DESSERT", 11), ("BRUNCH & LUNCH MENU", 3), ("AFTERNOON TEA", 7),
              ("NON-ALCOHOLIC DRINKS", 7), ("COFFEE", 8), ("TEA", 8)],
}
# A row that prints two values ("123 | 301kcal") is two items; the names are written here (the numbers are copied).
MULTI = {
    "salmon sashimi | nigiri": ["Salmon sashimi", "Salmon nigiri"],
    "akami sashimi | nigiri": ["Akami sashimi", "Akami nigiri"],
    "toro sashimi | nigiri": ["Toro sashimi", "Toro nigiri"],
    "yellowtail sashimi | nigiri": ["Yellowtail sashimi", "Yellowtail nigiri"],
    "nigiri selection 3 pieces | 5 pieces": ["Nigiri selection 3 pieces", "Nigiri selection 5 pieces"],
    "sashimi selection 6 pieces | 10 pieces": ["Sashimi selection 6 pieces", "Sashimi selection 10 pieces"],
    "BBQ RIBS & FRIES HALF/FULL": ["BBQ Ribs & Fries Half Rack", "BBQ Ribs & Fries Full Rack"],  # the names of the April 2026 file's two rows
}
# Names written out where the file's own heading gives the context (the printed name stays in the row notes).
RENAME = {
    ("street", "BURGERS", "GORDON’S WELLINGTON"): "Gordon’s Wellington Burger",
    ("street", "BURGERS", "G.F.C"): "G.F.C Burger",
    ("street", "KIDS BURGERS", "PLANT-BASED"): "Kids Plant-Based Burger",
    ("street", "KIDS BURGERS", "BEEF"): "Kids Beef Burger",
    ("street", "SIDES & SHARERS", "NEW CORN RIBS"): "Corn Ribs",
}
# Where a Street dip is sold, as the file marks it (SB = Street Burger, SP = Street Pizza: the file covers those two restaurants).
WHERE = re.compile(r"\s*\((SB ONLY|SP ONLY|SB & SP)\)$")
WHERE_NAME = {"SB ONLY": " (Street Burger only)", "SP ONLY": " (Street Pizza only)", "SB & SP": ""}
# Rows the file prints impossibly: left out of the published menu (never corrected), listed in the check report.
HOLDBACK = {
    ("lucky", "Sashimi selection 10 pieces"): ("The file prints 'sashimi selection 6 pieces | 10 pieces 476 | 450kcal': the 10-piece selection "
                                               "with fewer calories than the 6-piece one on the same row, so the two figures cannot both be "
                                               "right (the previous file printed 476 | 1092). Restore by deleting this line once the chain "
                                               "corrects the file."),
}
EXCLUDED = {("street", "FULL SCOTTISH (Edinburgh only)"): "single-venue dish (Edinburgh only)"}
KACL_OK = {("street", "G.F.C", "PIZZAS PER SLICE")}  # the one row whose unit the file misspells "kacl"
SERVING = {("street", "PIZZAS PER SLICE"): "1 slice"}  # the heading prints "PIZZAS PER SLICE"
TYPOS = {
    ("street", "BROCOLLI"): "printed 'BROCOLLI' (sic)",
    ("lucky", "G.F.G"): "printed 'G.F.G' in the tempura section; the same file prints 'G.F.C (small portion)' in the lunch menu",
}
AMBIGUOUS = {
    ("lucky", "chocolate truffles (all)"): "printed '(all)': the file does not say how many pieces the value covers",
    ("lucky", "mochi (all)"): "printed '(all)': the file does not say how many pieces the value covers",
    ("lucky", "zenmai"): "printed 'zenmai'; the chef's selection (a shared dish): the file prints no description",
    ("lucky", "lucky cat to share"): "printed 801kcal, the same figure as 'sobacha & honeycomb lucky cat' in the same section; entered as printed",
}
PORK = re.compile(r"\b(pork|ham|bacon|chorizo|pepperoni|sausage|salami)\b", re.I)
BEEF = re.compile(r"\b(beef|ribeye|wagyu|steak|sirloin)\b", re.I)
MEATY = re.compile(r"\b(burger|smash|ribs?|lasagne|cannelloni|wellington|wings?|chicken|lamb|duck|kitchen|idiot|o\.g\.r|g\.f\.c|g\.f\.g|gfc)\b",
                   re.I)  # names that suggest meat: used only to list "meat type not stated" in the report
SMALL = {"&": "&", "à": "à", "and": "and"}


def tidy_upper(name: str) -> str:
    """ALL-CAPS printed name -> Title Case, keeping initialisms (G.F.C, O.G.R, BBQ, GFC), counts (3X -> 3x) and 7UP."""
    if "‘" in name and "’" not in name:
        name = name.replace("‘", "")
    out = []
    for w in name.split(" "):
        low = w.lower()
        if low in SMALL:
            out.append(SMALL[low])
        elif "." in w or w in ("BBQ", "GFC"):
            out.append(w)
        elif re.fullmatch(r"\d+X", w):
            out.append(w[:-1] + "x")
        elif re.fullmatch(r"\d+[A-Z]+", w):
            out.append(w)  # 7UP
        elif w.startswith("(") and w.endswith(")"):
            out.append("(" + w[1:-1].capitalize() + ")")
        elif w.startswith("("):
            out.append("(" + w[1:].capitalize())
        elif w.endswith(")"):
            out.append(w[:-1].capitalize() + ")")
        else:
            out.append(w.capitalize())
    return " ".join(out)


def tidy_lower(name: str) -> str:
    return name[:1].upper() + name[1:]


def tags_for(name: str) -> List[str]:
    tags = []
    vegan = bool(re.search(r"\bvegan\b", name, re.I))
    if vegan:
        tags.append("vegetarian")
    if not vegan and PORK.search(name):
        tags.append("contains_pork")
    if not vegan and BEEF.search(name):
        tags.append("contains_beef")
    return tags


def digest(rows: List[Dict]) -> str:
    text = "\n".join("|".join([r["column"], r["section"], r["name"], " | ".join(r["values"]), r["unit"]]) for r in rows)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def read_doc(key: str, pdf: Path) -> List[Dict]:
    doc = DOCS[key]
    rows = pdf_reader.read_rows(pdf, doc["skip_above"], doc["skip_below"])
    if len(rows) != doc["rows"]:
        raise SystemExit(f"{doc['file']}: {len(rows)} rows printed, this script expects {doc['rows']}: the file changed, re-check it and update DOCS/SECTIONS.")
    seen: List[Tuple[str, int]] = []
    for r in rows:
        if seen and seen[-1][0] == r["section"]:
            seen[-1] = (r["section"], seen[-1][1] + 1)
        else:
            seen.append((r["section"], 1))
    if seen != SECTIONS[key]:
        raise SystemExit(f"{doc['file']}: sections/rows are now {seen}, expected {SECTIONS[key]}: the file changed, re-check it.")
    got = digest(rows)
    if got != doc["digest"]:
        raise SystemExit(f"{doc['file']}: the printed rows changed (digest {got}, expected {doc['digest']}). Re-read the file, then update the digest in DOCS.")
    return rows


def build_items(key: str, rows: List[Dict]) -> List[Dict]:
    doc = DOCS[key]
    upper = key == "street"
    items = []
    for r in rows:
        name_key = (key, r["name"])
        if name_key in EXCLUDED:
            continue
        if r["unit"] != "kcal" and (key, r["name"], r["section"]) not in KACL_OK:
            raise SystemExit(f"{doc['file']}: {r['line']!r} prints the unit {r['unit']!r}: not one of the known typos, re-check.")
        printed = [r["line"]]
        if len(r["values"]) > 1:
            if r["name"] not in MULTI or len(MULTI[r["name"]]) != len(r["values"]):
                raise SystemExit(f"{doc['file']}: {r['line']!r} prints {len(r['values'])} values and has no entry in MULTI.")
            names = MULTI[r["name"]]
        elif (key, r["section"], r["name"]) in RENAME:
            names = [RENAME[(key, r["section"], r["name"])]]
        else:
            where = WHERE.search(r["name"]) if upper else None
            base = WHERE.sub("", r["name"]) if where else r["name"]
            names = [(tidy_upper(base) + WHERE_NAME[where.group(1)]) if where else (tidy_upper(base) if upper else tidy_lower(base))]
        notes = ["printed '%s'" % r["line"], "section '%s'" % r["section"]]
        if r["unit"] == "kacl":
            notes.append("the file prints the unit as 'kacl' (typo for kcal)")
        if "‘" in r["name"] and "’" not in r["name"]:
            notes.append("printed with a stray opening quote, dropped")
        if name_key in TYPOS:
            notes.append(TYPOS[name_key])
        if name_key in AMBIGUOUS:
            notes.append(AMBIGUOUS[name_key])
        category = "%s · %s" % (doc["restaurant"], r["section"].capitalize())
        for name, value in zip(names, r["values"]):
            items.append(dict(name=name, category=category, serving=SERVING.get((key, r["section"]), ""), calories=value,
                              tags="|".join(tags_for(name)), rankable=False, notes="; ".join(notes), _section=r["section"],
                              _restaurant=doc["restaurant"], _meaty=bool(MEATY.search(name) and not re.search(r"\bvegan\b", name, re.I))))
    return items


def assign_ids(items: List[Dict]) -> None:
    """slug(name); where two rows share a name (different sections, different calories) both get slug(name + section) instead."""
    count: Dict[str, int] = {}
    for it in items:
        count[slug(it["name"])] = count.get(slug(it["name"]), 0) + 1
    for it in items:
        base = slug(it["name"])
        it["id"] = base if count[base] == 1 else slug("%s %s %s" % (it["_restaurant"], it["name"], it["_section"]))
    ids = [it["id"] for it in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("ids are not unique after adding the section: " + str(sorted({i for i in ids if ids.count(i) > 1})))


# ------------------------------------------------------------------------------------------------ download (polite, robots-aware)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def fetch_all(dest: Path) -> None:
    """One request per file, one second apart, only paths robots.txt allows (RFC 9309 matcher). A refusal stops the run."""
    dest.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(HOST + "/robots.txt", headers={"User-Agent": UA})
    rules = robots_rfc.parse(urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace"))
    for doc in DOCS.values():
        if not robots_rfc.allowed(rules, doc["path"]):
            raise SystemExit(f"robots.txt disallows {doc['path']}: not downloaded; ask the founder to save the file by hand.")
        time.sleep(1.05)
        last: Optional[Exception] = None
        for _ in range(3):  # the server sometimes resets a first connection: that is not a refusal
            try:
                data = urllib.request.urlopen(urllib.request.Request(HOST + doc["path"], headers={"User-Agent": UA}), timeout=60).read()
                (dest / doc["file"]).write_bytes(data)
                last = None
                break
            except Exception as e:  # noqa: BLE001
                if getattr(e, "code", None) in (401, 403, 429):
                    raise SystemExit(f"{doc['path']} answered {e.code}: blocked, not worked round; ask the founder to save the file by hand.")
                last = e
                time.sleep(3)
        if last:
            raise SystemExit(f"could not download {doc['path']}: {last}")


def pdf_date(pdf: Path) -> str:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    return "; ".join(l.strip() for l in out.splitlines() if l.startswith(("CreationDate", "ModDate", "Pages")))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDFs were downloaded/read")
    ap.add_argument("--pdfs", type=Path, help="folder holding the two PDFs")
    ap.add_argument("--fetch", type=Path, help="download the PDFs into this folder first, then build from it")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    folder = args.fetch or args.pdfs
    if folder is None:
        ap.error("give --pdfs DIR or --fetch DIR")
    if args.fetch:
        fetch_all(args.fetch)
    items: List[Dict] = []
    for key, doc in DOCS.items():
        pdf = folder / doc["file"]
        print(f"{doc['file']} sha256 {sha256_file(pdf)}  ({pdf_date(pdf)})")
        rows = read_doc(key, pdf)
        built = build_items(key, rows)
        print(f"  {doc['restaurant']}: {len(rows)} printed rows -> {len(built)} items")
        items += built
    assign_ids(items)
    held = []
    for (key, name), why in HOLDBACK.items():
        match = [it for it in items if it["_restaurant"] == DOCS[key]["restaurant"] and it["name"] == name]
        if len(match) != 1:
            raise SystemExit(f"HOLDBACK names {name!r}, which is not (exactly once) in the file any more: re-check it")
        held.append((match[0]["id"], why))
    out = write_chain_folder(chain_id=CHAIN_ID, name="Gordon Ramsay Restaurants", cuisine=CUISINE, source_title=SOURCE_TITLE,
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out,
                             note=NOTE, nutrition_level="calories", holdback=held)
    print(f"wrote {len(items)} items to {out}")
    not_stated = [it["name"] for it in items if it["_meaty"] and not any(t in it["tags"] for t in ("contains_pork", "contains_beef", "vegetarian"))]
    print(f"meat type not stated ({len(not_stated)}): " + "; ".join(not_stated))
    return 0


if __name__ == "__main__":
    sys.exit(main())
