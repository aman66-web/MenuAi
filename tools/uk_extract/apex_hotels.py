#!/usr/bin/env python3
"""Build data/source/apex-hotels/ from the menus of Apex Hotels' restaurants in England (calories only).

    python3 tools/uk_extract/apex_hotels.py --cache DIR --checked-on 2026-10-12 [--out DIR] [--report]

Source (official, https://www.apexhotels.co.uk/robots.txt disallows only /aspnet_client/, /bin/, /base/, /data/ and /python/): each hotel
restaurant's own page links its menus as PDFs under /media/. Apex runs 9 hotels (Bath, Dunblane, Dundee, Edinburgh x3, Glasgow, London x2);
only the three restaurants in England print calories on their menus (England's calorie-labelling rules): Chambers (Apex Temple Court,
London), The Lampery (Apex City of London) and The Orange Artichoke (Apex City of Bath). The Scottish restaurants' menus print none
(their breakfast menus were checked on 12 October 2026: 0 calorie figures), so they are not read.

Menus read: breakfast, brunch, a la carte, bar and dessert. Not read: in-room and night menus (guests only: "To place an order, please dial
'0'"), set and Sunday roast menus (fixed-price sets), afternoon tea (figures for the parts of one set), children's menus (no figures) and
wine and drinks lists (no alcoholic drinks are added). Where a page links two versions of a menu, both are read.

Each PDF is read with pdftohtml -xml in the order its text frames were laid out (left column, then right column), with each run's font:
dish names are bold at the menu's dish size, section headings are bold and larger, calories print as "(NNNkcal)" in a separate run.
A figure belongs to the dish heading above it, except where the words just before it on the same line name a part of that heading
("Croissant (306kcal)" under "Pastries", "Orange (87kcal)" under "Fruit Juice", "natural (198kcal) or fruit yoghurt (210kcal)" under
"Yoghurt") or an extra ("add smoked streaky bacon (201kcal)"). Figures not printed as "(NNNkcal)" ("Average 170kcal per 45g serving")
are left out and counted.

Menus differ by restaurant and many dishes print different calories at different restaurants, so a dish is published only where 2 or
more restaurants print the same name (normalised) with the same calories and no menu read prints another figure for that name (two
versions of a menu at one restaurant count too). Nothing is chosen between, averaged or corrected.
"""
from __future__ import annotations

import argparse
import collections
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import images_common as ic  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "apex-hotels"
SITE = "https://www.apexhotels.co.uk"
RESTAURANTS = [
    ("Chambers", SITE + "/destinations/london/apex-temple-court-hotel/dining/chambers/"),
    ("The Lampery", SITE + "/destinations/london/apex-city-of-london-hotel/the-lampery/"),
    ("The Orange Artichoke", SITE + "/destinations/bath/apex-city-of-bath-hotel/the-orange-artichoke/"),
]
READ = ("breakfast", "brunch", "alc", "bar", "dessert")
SKIP = ("ird", "night", "wine", "drinks", "afternoon", "kids", "set", "sunday-roast", "tasting", "festive", "christmas")
SOURCE_TITLE = ("Apex Hotels restaurant menus in England: Chambers (Apex Temple Court), The Lampery (Apex City of London) and The Orange "
                "Artichoke (Apex City of Bath), spring/summer 2026 PDFs")
ALIASES = ["apex hotels", "apex hotel", "the lampery", "the orange artichoke"]
NOTE = ("Calories as printed on the menus of Apex's restaurants in England (Chambers and The Lampery in London, The Orange Artichoke in "
        "Bath); its Scottish hotels' menus print none. Menus differ by restaurant: a dish is listed only where two or more of them print "
        "the same figure.")
# Dishes that agree under one name in London but which The Orange Artichoke prints, under a slightly different name, with another figure:
# held back (holdback.csv), never chosen between. Keyed by images_common.norm_name of the published name.
HOLD = {
    "cheese selection": "Chambers and The Lampery print 361 kcal, but The Orange Artichoke's dessert menu prints 423 kcal for its 'Artisan Cheese "
                        "Selection': possibly the same dish under a longer name, so not published",
    "truffle and parmesan fries": "Chambers and The Lampery print 311 kcal, but The Orange Artichoke prints 573 kcal for 'Parmesan & Truffle Fries' "
                                  "(the same words in another order): not published",
    "burrata": "Chambers and The Lampery print 378 kcal, but The Orange Artichoke prints 518 kcal for its 'Burrata Salad': possibly the same "
               "dish under a longer name, so not published",
}
KCAL = re.compile(r"\((\d[\d,]*)\s*kcal\)", re.I)
LIGATURE = re.compile(r"(?<=[a-z]) ?(ffi|ffl|ff|fi|fl) (?=[a-z])")
ANY_KCAL = re.compile(r"\d[\d,]*\s*kcal", re.I)
TAGS = re.compile(r"\((?:\s*(?:V|VE|VG|GF|NF|DF|GF\*|VG\*|VE\*|V\*|DF\*|NF\*)\s*,?\s*)+\)|\(\s*\)", re.I)
TRAILING_PRICE = re.compile(r"(?:\s+all)?\s+(?:£\s*)?\d+(?:\.\d+)?(?:\s*each)?\s*$", re.I)
PRICE = re.compile(r"(?:£\s*)?\b\d+(?:\.\d+)?\b(?:\s*each)?|\ball\b|\beach\b|\bsgl\b|\bdbl\b", re.I)
# Headings whose parts are named on the line below: the printed part name is joined to the heading's noun.
PART_NAMES = {"fruit juice": "{} juice", "yoghurt": "{} yoghurt"}
ALCOHOL = re.compile(r"\b(wine|beer|lager|ale|cider|prosecco|champagne|vodka|gin|rum|whisky|whiskey|martini|negroni|spritz|mimosa|bellini|"
                     r"bloody mary|margarita|cocktail|aperol|liqueur)\b", re.I)
SMALL = {"and", "of", "with", "or", "on", "in", "a", "the", "&", "au", "en"}


def tidy(s: str) -> str:
    """ALL-CAPS menu names -> 'Selection of Seasonal Sliced Fruits & Berries' (capitalisation only)."""
    if s != s.upper():
        return s
    words = s.lower().split()
    return " ".join(w if (i and w in SMALL) else w[:1].upper() + w[1:] for i, w in enumerate(words))


def pdf_links(page: str) -> list[str]:
    links = sorted(set(re.findall(r'href="((?:https://www\.apexhotels\.co\.uk)?/media/[^"]+?\.pdf)"', page)))
    keep = []
    for link in links:
        fname = link.rsplit("/", 1)[-1].lower()
        if any(s in fname for s in SKIP):
            continue
        if any(r in fname for r in READ):
            keep.append(link if link.startswith("http") else SITE + link)
        else:
            raise SystemExit(f"{link}: menu file not classified: add its kind to READ or SKIP")
    return keep


def runs(pdf: bytes) -> list[dict]:
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(pdf)
        f.flush()
        xml = subprocess.run(["pdftohtml", "-xml", "-i", "-stdout", f.name], capture_output=True, text=True, check=True).stdout
    root = ET.fromstring(re.sub(r"<!DOCTYPE[^>]*>", "", xml))
    fonts, out = {}, []
    for page in root.iter("page"):
        for el in page:
            if el.tag == "fontspec":
                fonts[el.get("id")] = (el.get("family"), int(el.get("size")))
            elif el.tag == "text":
                fam, size = fonts[el.get("font")]
                bold = el.find("b") is not None or bool(re.search(r"Bold|Demi|Black|Heavy|Semibold", fam))
                text = " ".join("".join(el.itertext()).split())
                # ligatures the PDF's fonts split into separate runs ("Mu ffi n" -> "Muffin")
                text = LIGATURE.sub(r"\1", text)
                out.append(dict(page=int(page.get("number")), top=int(el.get("top")), size=size, bold=bold, text=text))
    return out


def parse_pdf(pdf: bytes) -> tuple[list[dict], list[str], int]:
    """Returns (occurrences [section, name, kcal, raw], left-out notes, number of calorie mentions in the text)."""
    rs = [r for r in runs(pdf) if r["text"]]
    mentions = sum(len(ANY_KCAL.findall(r["text"])) for r in rs)
    names = [r for r in rs if r["bold"] and not TAGS.fullmatch(r["text"]) and not PRICE.sub("", r["text"]).strip(" ()£") == ""]
    sizes = collections.Counter(r["size"] for r in names)
    dish_size = sizes.most_common(1)[0][0] if sizes else 0
    occ, left = [], []
    section, heading, heading_line = "", "", None
    line_top, line_page, prefix = None, None, ""
    joinable = False
    for r in rs:
        t = r["text"]
        if line_top is None or r["page"] != line_page or abs(r["top"] - line_top) > 6:
            line_top, line_page, prefix = r["top"], r["page"], ""
        # a bold run that is only a price ("6", "3.5 EACH") is skipped; a price at the end of a name run is cut off
        name_text = TAGS.sub("", TRAILING_PRICE.sub("", t)).strip(" ,()") if PRICE.sub("", t).strip(" ()£") else ""
        if r["bold"] and not KCAL.search(t) and name_text and not TAGS.fullmatch(t.strip()):
            if r["size"] > dish_size + 1:
                section, heading, joinable = tidy(name_text), "", False
            elif joinable and heading_line is not None and r["page"] == heading_line[0] and 0 <= r["top"] - heading_line[1] <= 22:
                heading = LIGATURE.sub(r"\1", f"{heading} {name_text}")      # a dish name broken over two lines
                heading_line = (r["page"], r["top"])
            else:
                heading, heading_line, joinable = name_text, (r["page"], r["top"]), True
            prefix = ""
            continue
        if r["bold"] and not KCAL.search(t):
            continue                                     # tags and prices
        pos = 0
        for m in KCAL.finditer(t):
            pre = LIGATURE.sub(r"\1", " ".join(TAGS.sub("", prefix + " " + t[pos:m.start()]).split())).strip(" ,")
            pos = m.end()
            prefix = ""
            kcal = int(m.group(1).replace(",", ""))
            hkey = ic.norm_name(heading)
            part = re.sub(r"^or\s+", "", pre, flags=re.I)
            if pre.lower().startswith("add ") and len(pre.split()) <= 6:
                name = pre[:1].upper() + pre[1:]
            elif hkey in PART_NAMES and not part:
                left.append(f"{kcal}kcal under {heading!r} with no part name on its line ({t!r})")
                continue
            elif hkey in PART_NAMES and part and "," not in part and len(part.split()) <= 3:
                name = part if PART_NAMES[hkey].format("").strip() in part.lower() else PART_NAMES[hkey].format(part)
                name = name[:1].upper() + name[1:]
            elif part and part[0].isupper() and "," not in part and len(part.split()) <= 5 and heading:
                name = part                              # a named part of the heading: "Croissant (306kcal)"
            elif heading:
                name = heading
            else:
                left.append(f"no dish name for {kcal}kcal ({t!r})")
                continue
            occ.append(dict(section=section or "Menu", name=tidy(name), kcal=kcal, raw=f"{heading} | {pre} | {kcal}"))
            joinable = False
        prefix += " " + t[pos:]
        if KCAL.search(t):
            joinable = False
        for m in ANY_KCAL.finditer(t):
            if not KCAL.search(t[max(0, m.start() - 2):m.end() + 1]):
                left.append(f"figure not printed as (NNNkcal): {t!r}")
    return occ, left, mentions


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    occurrences, left_out, files = [], [], []
    for ri, (rname, url) in enumerate(RESTAURANTS):
        page = ic.polite_get(url, args.cache, accept="text/html").decode("utf-8", "replace")
        links = pdf_links(page)
        if not links:
            raise SystemExit(f"{url}: no menus found: the page changed")
        for link in links:
            pdf = ic.polite_get(link, args.cache, accept="application/pdf")
            occ, left, mentions = parse_pdf(pdf)
            files.append((rname, link, len(occ), len(left), mentions))
            if len(occ) + len(left) != mentions:
                raise SystemExit(f"{link}: {mentions} calorie mentions but {len(occ)} read and {len(left)} left out: every figure must be used or left out once")
            occurrences += [(ri, link, o) for o in occ]
            left_out += [(rname, link, x) for x in left]
    by_name: dict[str, list] = collections.defaultdict(list)
    for ri, link, o in occurrences:
        by_name[ic.norm_name(o["name"])].append((ri, link, o))
    items, conflicts, single = [], [], []
    for key, occs in by_name.items():
        rs = sorted({ri for ri, _, _ in occs})
        vals = sorted({o["kcal"] for _, _, o in occs})
        if len(vals) > 1:
            conflicts.append(occs)
        elif len(rs) < 2:
            single.append(occs)
        else:
            first = min(occs, key=lambda t: occurrences.index(t))
            o = first[2]
            if ALCOHOL.search(o["name"]):
                raise SystemExit(f"alcohol word in a published name: {o['name']!r}: decide (alcoholic drinks are never added)")
            items.append(dict(name=o["name"], category=o["section"], calories=o["kcal"], rankable=False, allergens=None,
                              notes=f"same {o['kcal']} kcal at {', '.join(RESTAURANTS[i][0] for i in rs)}",
                              _order=occurrences.index(first)))
    items.sort(key=lambda it: it.pop("_order"))
    holdback = [(slug(it["name"]), HOLD[ic.norm_name(it["name"])]) for it in items if ic.norm_name(it["name"]) in HOLD]
    for key in HOLD:
        if key not in {ic.norm_name(it["name"]) for it in items}:
            raise SystemExit(f"HOLD entry {key!r} no longer matches a dish: re-check the menus and remove it")
    if len(items) - len(holdback) < 15:
        raise SystemExit(f"only {len(items)} dishes agree at 2+ restaurants: the menus changed, re-check before publishing")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Apex Hotels", cuisine="Hotel restaurant", source_title=SOURCE_TITLE,
                             source_url=SITE + "/dining/", checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out,
                             note=NOTE, nutrition_level="calories", holdback=holdback)
    print(f"wrote {len(items)} items to {out}")
    print(f"figures read: {len(occurrences)}; left out by rule: {len(left_out)}; names with different figures: {len(conflicts)}; "
          f"names at one restaurant only: {len(single)}")
    if args.report:
        for f in files:
            print("  file", f)
        print("\n## Published")
        for it in items:
            print(f"  {it['category']:28s} {it['name']:50s} {it['calories']:>5}  {it['notes']}")
        print("\n## Different figures for the same name (not published)")
        for occs in conflicts:
            print(f"  {occs[0][2]['name']}: " + "; ".join(f"{RESTAURANTS[ri][0]} {o['kcal']} ({link.rsplit('/', 1)[-1]})" for ri, link, o in occs))
        print("\n## At one restaurant only (not published)")
        for occs in single:
            print(f"  {RESTAURANTS[occs[0][0]][0]}: {occs[0][2]['name']} {occs[0][2]['kcal']}")
        print("\n## Left out by rule")
        for rname, link, x in left_out:
            print(f"  [{rname} {link.rsplit('/', 1)[-1]}] {x}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
