#!/usr/bin/env python3
"""Build data/source/the-light-cinemas/ from The Light Cinemas' own concession menus (a CALORIES-ONLY chain, allergens link-only).

    python3 -I tools/uk_extract/the_light_cinemas.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://thelight.co.uk lists 14 cinemas (a landing page whose buttons open https://<site>.thelight.co.uk). Each cinema's own page
links ONE menu PDF ("drinks menu" on the six /food-and-drink pages of Bolton, Bradford, Cambridge, New Brighton, Thetford and Wisbech;
"view menu" on the /diner pages of the other eight: Addlestone, Banbury, Huddersfield, Redhill, Sheffield, Sittingbourne, Stockport,
Walsall, whose menus are restaurant menus with their own recipes). SITES below holds each page, the PDF it links and the footer code
the PDF prints ("TL CAM JUL26 V1"). --fetch downloads the 14 pages and 14 PDFs (one request per second, robots.txt read first with
robots_rfc.py: thelight.co.uk and *.thelight.co.uk allow everything, central.lightcinemas.co.uk has no robots.txt) and stops if a page
no longer links the PDF below or the allergen guide below ("a newer file is linked: re-check"). Without --fetch DIR must hold
<site>.pdf for each site (and <site>.html if the links are to be re-checked). Needs pdftotext (poppler); the text is read in "raw"
(content) order, which keeps each menu column together.

WHAT IS PRINTED. The six cinema PDFs are one-page A4/A5 menus (footer codes TL <site> JUL26 V1, all created 13 July 2026) with the
same drinks list on every page; Cambridge, Bradford, Thetford and Wisbech add two pizzas and a topping, Bolton and New Brighton sell no
pizza. A calorie figure ("925kcal", "330ml 0.5% ABV / 83kcal") is printed beside pizza, the two "Low & no" drinks and the soft drinks;
nothing else (no popcorn, nachos, hot dogs, sweets, beers, wines, hot drinks, ice cream). There is no protein, carbohydrate, fat, salt,
kJ or weight anywhere, so those columns stay blank (never 0) and the chain is calories-only (docs/DATA.md). `serving` is the volume the
menu prints beside a drink; blank for pizza and the topping (the page states no weight).

PUBLISH RULE (the founder's): an item is published only when its name and calories are identical on every page that prints it. The
script reads all six cinema pages, requires the same items and figures on each (pizza on exactly the four pizza sites), then reads the
eight diner menus for the same names: the soft-drink lines (J2O, Gingerella, Appletiser, water), Bero Pilsner and the jalapeño topping
print the same figures there, and a name printed with another figure anywhere would stop the run. Diner dishes (about 100 per menu, two
families: Fratelli's at Addlestone, Sheffield and Walsall; Lower Decks / Diner at Banbury, Huddersfield, Redhill, Sittingbourne,
Stockport) are NOT extracted: they differ by family (Lemony Lemonade is 50 kcal on one and 84 on the other) and their allergens are in two
other matrices (CinKit_TL_Allergens_160726.pdf, Ent_TL_Allergens_080726.pdf).
Not published: Ice Blast (Cherry / Mixed / Raspberry): "18kcal / 25kcal" beside two prices "5.95 / 6.75" and no sizes named. "Guinness 0%"
(440ml, 75 kcal) is a different product from the diners' "Guinness 0% Micro Draught" (558ml, 95 kcal): the names differ, both are as printed.

ALLERGENS are link-only (all or nothing, docs/DATA.md). The chain's guide is a 7-page "Concessions Allergen Guide" matrix dated 11/08/26
(yes / may / - for 14 allergens and the named cereals and tree nuts) linked from every cinema page. It does not list J2O, Appletiser or
Gingerella at all, and names others differently from the menu ("Margherita 12\"", "Extra Jalapenos"): no row can be matched exactly, and
the PDF's text layer is scrambled, so nothing is matched by guessing. The guide's link is published instead.

Tags: vegetarian where the menu prints "v" or "vg" (Margherita, the jalapeño topping). contains_pork only because the NAME says pepperoni.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "the-light-cinemas"
FOOD = "https://central.lightcinemas.co.uk/media/food"
ALLERGEN_URL = FOOD + "/allergens/Concessions_TL_Allergens_240726.pdf"
ALLERGEN_TITLE = "The Light Concessions Allergen Guide (matrix dated 11/08/26, linked from each cinema's Eat & Drink page)"
SOURCE_URL = FOOD + "/CAM/TheLight_Cambridge_Menu.pdf"
SOURCE_TITLE = ("The Light Cinemas concession menus, one PDF per cinema (Bolton, Bradford, Cambridge, New Brighton, Thetford and Wisbech; "
                "footer codes TL <site> JUL26 V1, PDFs created 13 July 2026; linked from each cinema's Eat & Drink page on thelight.co.uk)")
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
# (site, page URL, menu PDF the page links, footer code, kind). kind "cinema" = the Eat & Drink menu that is published; "diner" = read for the
# cross-check only. has_pizza says which cinema menus must carry the pizza lines.
SITES = [
    ("cambridge", "https://cambridge.thelight.co.uk/food-and-drink", FOOD + "/CAM/TheLight_Cambridge_Menu.pdf", "TL CAM JUL26 V1", "cinema", True),
    ("bradford", "https://bradford.thelight.co.uk/food-and-drink", FOOD + "/BD/WEB_Bradford_Menu_Final_Oct23.pdf", "TL BRAD JUL26 V1", "cinema", True),
    ("thetford", "https://thetford.thelight.co.uk/food-and-drink", FOOD + "/Thet/WEB_Thetford_Menu_Final_Oct23.pdf", "TL THE JUL26 V1", "cinema", True),
    ("wisbech", "https://wisbech.thelight.co.uk/food-and-drink", FOOD + "/WI/Wisbech_Menu_Aug23_FINAL.pdf", "TL WIS JUL26 V1", "cinema", True),
    ("bolton", "https://bolton.thelight.co.uk/food-and-drink", FOOD + "/BO/Bolton_A5Menu_Dig.pdf", "TL BOL JUL26 V1", "cinema", False),
    ("newbrighton", "https://newbrighton.thelight.co.uk/food-and-drink", FOOD + "/Nb/NB_A5Menu_dig_1.pdf", "TL NB JUL26 V1", "cinema", False),
    ("addlestone", "https://addlestone.thelight.co.uk/diner", FOOD + "/add/ADD_Fratellis.pdf", "TL ADD JUL26 V1", "diner", False),
    ("banbury", "https://banbury.thelight.co.uk/diner", FOOD + "/BAN/BAN_LowerDecks_Menu.pdf", "TL BAN JUL26 V1", "diner", False),
    ("huddersfield", "https://huddersfield.thelight.co.uk/diner", FOOD + "/HUD/Huddersfield_Menu_online_version.pdf", "TL HUD JUL26 V1", "diner", False),
    ("redhill", "https://redhill.thelight.co.uk/diner", FOOD + "/RED/Redhill_Menu.pdf", "TL RED JUL26 V1", "diner", False),
    ("sheffield", "https://sheffield.thelight.co.uk/diner", FOOD + "/shf/SHF_Fratellis_Menu.pdf", "TL SHEF JUL26 V1", "diner", False),
    ("sittingbourne", "https://sittingbourne.thelight.co.uk/diner", FOOD + "/sit/SIT_DinerMenu.pdf", "TL SIT JUL26 V1", "diner", False),
    ("stockport", "https://stockport.thelight.co.uk/diner", FOOD + "/st/STO_Diner_Menu.pdf", "TL STO JUL26 V1", "diner", False),
    ("walsall", "https://walsall.thelight.co.uk/diner", FOOD + "/wal/WAL_Fratellis_Menu.pdf", "TL WAL JUL26 V2", "diner", False),
]
HEADINGS = {"WHITE WINE", "RED WINE", "ROSÉ", "SPARKLING WINE", "PIZZA", "ICE CREAM", "BEER & CIDER", "LOW & NO", "HOT DRINKS",
            "SOFT DRINKS", "ALLERGENS"}
PRICE = r"\d+\.\d\d"
NOTE = ("Calories only, as printed beside each item on the concession menus of The Light's cinemas (July 2026 editions), the same on every "
        "page that prints it. Only items with a calorie figure are listed: not popcorn, nachos, hot dogs, sweets, beers or hot drinks. "
        "Pizza is sold at four cinemas, not Bolton or New Brighton. The diner restaurants' own menus are not included.")
assert len(NOTE) < 400, len(NOTE)
UNPUBLISHED = {
    "Ice Blast Cherry": "two calorie figures (18 / 25 kcal) beside two prices (5.95 / 6.75) and no size is named on the menu",
    "Ice Blast Mixed": "two calorie figures (18 / 25 kcal) beside two prices (5.95 / 6.75) and no size is named on the menu",
    "Ice Blast Raspberry": "two calorie figures (18 / 25 kcal) beside two prices (5.95 / 6.75) and no size is named on the menu",
}
PORK = re.compile(r"\b(pepperoni|bacon|ham|sausage|salami|chorizo)\b", re.I)


def fold(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


# ------------------------------------------------------------------------------------------------ fetching

def _curl(url: str, dest: Path) -> None:
    for attempt in range(3):   # a dropped connection is retried twice; an HTTP error is not
        proc = subprocess.run(["curl", "-sS", "-L", "--fail", "--compressed", "-A", UA, "-o", str(dest), url])
        if proc.returncode == 0:
            return
        if proc.returncode not in (35, 52, 56) or attempt == 2:
            raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}): stop and check by hand, do not work round it")
        time.sleep(5)


def fetch_all(pages: Path, delay: float = 1.0) -> None:
    """Pages and PDFs, one request per second, robots.txt of each host read first (a missing robots.txt allows everything)."""
    rules: dict = {}

    def allowed(url: str) -> bool:
        host, path = url.split("://", 1)[1].split("/", 1)
        if host not in rules:
            tmp = pages / f"robots-{host}.txt"
            proc = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(tmp), "-w", "%{http_code}", f"https://{host}/robots.txt"],
                                  capture_output=True, text=True)
            time.sleep(delay)
            code = proc.stdout.strip()
            rules[host] = robots_rfc.parse(tmp.read_text(encoding="utf-8", errors="replace")) if code == "200" else []
            if code not in ("200", "404"):
                raise SystemExit(f"robots.txt of {host} answered HTTP {code}: stop and check by hand")
        return robots_rfc.allowed(rules[host], "/" + path)

    for site, page_url, pdf_url, _, _, _ in SITES:
        for url, name in ((page_url, f"{site}.html"), (pdf_url, f"{site}.pdf")):
            if not allowed(url):
                raise SystemExit(f"robots.txt disallows {url}: do not work round it, ask the founder")
            _curl(url, pages / name)
            time.sleep(delay)


def check_links(pages: Path) -> list:
    """Each saved page must still link its menu PDF and the allergen guide. Returns the sites whose page file was missing."""
    skipped = []
    for site, page_url, pdf_url, _, _, _ in SITES:
        f = pages / f"{site}.html"
        if not f.exists():
            skipped.append(site)
            continue
        text = f.read_text(encoding="utf-8", errors="replace")
        for want in (pdf_url, ALLERGEN_URL):
            if want not in text:
                raise SystemExit(f"{site}: the page {page_url} no longer links {want}: a newer file is linked, re-check before running again")
    return skipped


# ------------------------------------------------------------------------------------------------ reading

def raw_text(pdf: Path) -> str:
    proc = subprocess.run(["pdftotext", "-raw", str(pdf), "-"], capture_output=True, text=True, check=True)
    return proc.stdout


def pdf_created(pdf: Path) -> str:
    proc = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True)
    m = re.search(r"^CreationDate:\s*(.*)$", proc.stdout, re.M)
    return m.group(1).strip() if m else ""


def parse_cinema(raw: str, where: str) -> tuple:
    """(entries, left_out) for one cinema page. entry: {name, section, serving, kcal, veg}. Every line carrying 'kcal' must be read by a
    rule below or the run stops; the footer sentence 'Adults need around 2000 kcals a day' is the one line allowed to stay."""
    lines = [re.sub(r"\s+", " ", l).strip() for l in raw.replace("\t", " ").split("\n")]
    lines = [l for l in lines if l]
    entries, left_out, used = [], [], set()
    section = ""
    i = 0
    while i < len(lines):
        l = lines[i]
        if l in HEADINGS:
            section = l
            i += 1
            continue
        if section == "PIZZA":
            m = re.fullmatch(r"(Margherita|Pepperoni) \(12 inch\) " + PRICE, l)
            if m:
                k = re.fullmatch(r"(v )?(\d+)kcal", lines[i + 1]) if i + 1 < len(lines) else None
                if not k:
                    raise SystemExit(f"{where}: no calories under {l!r}")
                entries.append({"name": f"{m.group(1)} (12 inch)", "section": "Pizza", "serving": "", "kcal": k.group(2), "veg": bool(k.group(1))})
                used.update({i + 1})
            m = re.fullmatch(r"Add (Jalapeños) (v|vg) (\d+)kcal \+" + PRICE, l)
            if m:
                entries.append({"name": f"Add {m.group(1)}", "section": "Pizza", "serving": "", "kcal": m.group(3), "veg": True})
                used.add(i)
        elif section == "LOW & NO":
            m = re.fullmatch(r"(.+?) " + PRICE, l)
            if m and i + 1 < len(lines):
                k = re.fullmatch(r"(\d+ml) \d+(?:\.\d+)?% ABV(?: / (\d+)kcal)?", lines[i + 1])
                if k and k.group(2):
                    entries.append({"name": m.group(1), "section": "Low & no", "serving": k.group(1), "kcal": k.group(2), "veg": False})
                    used.add(i + 1)
        elif section == "SOFT DRINKS":
            m = re.fullmatch(r"J2O (\d+ml) " + PRICE, l)
            if m:
                for j, flavour in ((1, "Apple and Raspberry"), (2, "Orange and Passionfruit")):
                    k = re.fullmatch(re.escape(flavour) + r" (\d+)kcal", lines[i + j])
                    if not k:
                        raise SystemExit(f"{where}: expected {flavour!r} with calories under {l!r}, found {lines[i + j]!r}")
                    entries.append({"name": f"J2O {flavour}", "section": "Soft drinks", "serving": m.group(1), "kcal": k.group(1), "veg": False})
                    used.add(i + j)
            m = re.fullmatch(r"(Gingerella Ginger Ale|Still / Sparkling Water) " + PRICE, l)
            if m:
                k = re.fullmatch(r"(\d+ml) / (\d+)kcal", lines[i + 1])
                if not k:
                    raise SystemExit(f"{where}: no size and calories under {l!r}")
                entries.append({"name": m.group(1), "section": "Soft drinks", "serving": k.group(1), "kcal": k.group(2), "veg": False})
                used.add(i + 1)
            m = re.fullmatch(r"Appletiser (\d+ml) / (\d+)kcal " + PRICE, l)
            if m:
                entries.append({"name": "Appletiser", "section": "Soft drinks", "serving": m.group(1), "kcal": m.group(2), "veg": False})
                used.add(i)
            m = re.fullmatch(r"Ice Blast " + PRICE + " / " + PRICE, l)
            if m:
                for j in (1, 2, 3):
                    k = re.fullmatch(r"(Cherry|Mixed|Raspberry) (\d+)kcal / (\d+)kcal", lines[i + j])
                    if not k:
                        raise SystemExit(f"{where}: expected an Ice Blast flavour line, found {lines[i + j]!r}")
                    left_out.append((f"Ice Blast {k.group(1)}", f"{k.group(2)} / {k.group(3)}"))
                    used.add(i + j)
        i += 1
    for j, l in enumerate(lines):
        if "kcal" in l and j not in used and l != "Adults need around 2000 kcals a day":
            raise SystemExit(f"{where}: a calorie line no rule reads: {l!r}: the menu changed, extend the reader after looking at the PDF")
    return entries, left_out


def diner_checks(raw: str) -> dict:
    """What a diner menu prints for the names the cinema menus publish: {key: [figures found]}. Same patterns, whole text."""
    found = {}
    pats = {
        "Bero Pilsner": r"Bero Pilsner " + PRICE + r"\n(\d+ml) \d+(?:\.\d+)?% ABV / (\d+)kcal",
        "J2O Apple and Raspberry": r"J2O (\d+ml) " + PRICE + r"\nApple and Raspberry (\d+)kcal",
        "J2O Orange and Passionfruit": r"J2O (\d+ml) " + PRICE + r"\nApple and Raspberry \d+kcal\nOrange and Passionfruit (\d+)kcal",
        "Gingerella Ginger Ale": r"Gingerella Ginger Ale " + PRICE + r"\n(\d+ml) / (\d+)kcal",
        "Appletiser": r"Appletiser (\d+ml) / (\d+)kcal " + PRICE,
        "Still / Sparkling Water": r"Still / Sparkling Water " + PRICE + r"\n(\d+ml) / (\d+)kcal",
        "Add Jalapeños": r"() ?Jalapeños (?:v|vg) (\d+)kcal",
    }
    for key, pat in pats.items():
        found[key] = [(m.group(1), m.group(2)) for m in re.finditer(pat, raw)]
    found["Guinness 0% (a different product)"] = re.findall(r"Guinness 0% Micro(?: Draught)?", raw)
    return found


# ------------------------------------------------------------------------------------------------ building

def build(pages: Path) -> tuple:
    report = []
    skipped = check_links(pages)
    if skipped:
        report.append(f"links not re-checked (no saved page for {', '.join(skipped)})")
    per_site, left_by_site = {}, {}
    for site, _, _, footer, kind, has_pizza in SITES:
        pdf = pages / f"{site}.pdf"
        if not pdf.exists():
            raise SystemExit(f"missing {pdf}")
        raw = raw_text(pdf)
        if footer not in raw:
            raise SystemExit(f"{site}: the PDF no longer prints the footer {footer!r}: a new edition, re-check before running again")
        if kind == "cinema":
            entries, left = parse_cinema(raw, site)
            names = [e["name"] for e in entries]
            pizza = [n for n in names if "(12 inch)" in n or n == "Add Jalapeños"]
            if bool(pizza) != has_pizza or (has_pizza and len(pizza) != 3):
                raise SystemExit(f"{site}: pizza lines {pizza} but this script expects {'3' if has_pizza else 'none'}: the menu changed")
            if len(names) != (10 if has_pizza else 7) or len(left) != 3:
                raise SystemExit(f"{site}: {len(names)} calorie items and {len(left)} left out; expected {10 if has_pizza else 7} and 3")
            per_site[site] = entries
            left_by_site[site] = left
    # the same item must print the same name, section, volume and calories on every cinema page that prints it
    items = {}
    for site, entries in per_site.items():
        for e in entries:
            key = e["name"]
            if key in items:
                first = items[key]
                if (first["kcal"], first["serving"], first["section"], first["veg"]) != (e["kcal"], e["serving"], e["section"], e["veg"]):
                    raise SystemExit(f"{key!r} differs between {first['sites'][0]} and {site}: {first} vs {e}")
                first["sites"].append(site)
            else:
                items[key] = {**e, "sites": [site]}
    for name, why in UNPUBLISHED.items():
        vals = {dict(l).get(name) for l in left_by_site.values()}
        if vals != {"18 / 25"}:
            raise SystemExit(f"{name}: expected '18 / 25 kcal' on every cinema page, found {vals}")
    # the diner menus print the same names with the same figures, or not at all
    diner_pages = [s for s in SITES if s[4] == "diner"]
    diner_notes = {}
    for site, *_ in diner_pages:
        for key, found in diner_checks(raw_text(pages / f"{site}.pdf")).items():
            if key.startswith("Guinness"):
                diner_notes.setdefault(key, []).append((site, len(found)))
                continue
            want = items[key]
            bad = [f for f in found if f[1] != want["kcal"] or (f[0] and f[0] != want["serving"] and key != "Add Jalapeños")]
            if bad:
                raise SystemExit(f"{key!r} is printed with another figure or size on the {site} diner menu: {bad} (cinemas: {want['serving']} {want['kcal']} kcal)")
            diner_notes.setdefault(key, []).append((site, len(found)))
    rows = []
    order = ["Pizza", "Low & no", "Soft drinks"]
    for e in sorted(items.values(), key=lambda e: order.index(e["section"])):
        name = e["name"]
        tags = (["vegetarian"] if e["veg"] else []) + (["contains_pork"] if PORK.search(name) else [])
        diner_sites = [s for s, n in diner_notes.get(name, []) if n]
        notes = f"Printed on the cinema menus of: {', '.join(e['sites'])}"
        if diner_sites:
            notes += f"; the same figure is printed on {len(diner_sites)} of 8 diner menus"
        rows.append({"id": slug(fold(name)), "name": name, "category": e["section"], "serving": e["serving"], "calories": e["kcal"],
                     "tags": "|".join(tags), "rankable": False, "notes": notes})
        report.append(f"{name}: {e['kcal']} kcal{' per ' + e['serving'] if e['serving'] else ''}; cinemas {len(e['sites'])}/6 "
                      f"({', '.join(e['sites'])}); diner menus with the same figure {len(diner_sites)}/8")
    for name, why in UNPUBLISHED.items():
        report.append(f"not published: {name}: {why}")
    report.append("diners' own products with a similar name (not published): " + str(diner_notes.get("Guinness 0% (a different product)")))
    return rows, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder holding (or to receive, with --fetch) <site>.pdf and <site>.html for the 14 sites")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were downloaded")
    ap.add_argument("--fetch", action="store_true", help="download the 14 pages and 14 PDFs into --pages first (one request per second)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.pages.mkdir(parents=True, exist_ok=True)
        fetch_all(args.pages)
    rows, report = build(args.pages)
    out = write_chain_folder(
        chain_id=CHAIN_ID, name="The Light Cinemas", cuisine="Cinema", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["the light", "the light cinema", "the light cinemas", "light cinemas"], items=rows, out=args.out,
        note=NOTE, nutrition_level="calories",
        allergen_guide={"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": True})
    for site, *_ in SITES:
        pdf = args.pages / f"{site}.pdf"
        print(f"{hashlib.sha256(pdf.read_bytes()).hexdigest()}  {site}.pdf  created {pdf_created(pdf)}")
    print("\n".join(report))
    print(f"wrote {len(rows)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
