#!/usr/bin/env python3
"""Build data/source/away-resorts/ from the menu PDFs Away Resorts links on its parks' own "menus" pages (a CALORIES-ONLY chain).

    python3 tools/uk_extract/away_resorts.py CACHE_DIR --fetch                      # download pages + PDFs politely (skips what is cached)
    python3 tools/uk_extract/away_resorts.py CACHE_DIR --checked-on 2026-10-08 [--out DIR]   # build from the cache

Source: each park's page https://www.awayresorts.co.uk/parks/<county>/<park>/food-(and-)drink/menus/ (sitemap.xml lists them) links menu PDFs on
https://owners.awayresorts.co.uk/media/<id>/<file>.pdf (text layer, "Calories shown are per serving"; drinks: "per drink"). 19 parks list menus.
robots.txt (checked with robots_rfc.py): www.awayresorts.co.uk disallows only /admin/, /account*, /api/, /book*, /search/*, /styleguide/,
/availabilities/lowest_price/; owners.awayresorts.co.uk disallows nothing. PDFs linked from other hosts (the retired awayresortscms.iptxt.com,
a lodge-park site) are not downloaded. Two links are dead (HTTP 404): Bay Filey's main menu and allergen menu.

Menus differ by park, so a dish is published only when ALL of these hold (checked by this script, never by hand):
  1. it is printed with a calorie value in the menu PDFs of at least MIN_PARKS (3) different parks;
  2. every file that prints that name prints the same value (a thousands comma is ignored: "1,095" = "1095"; "1.013" is NOT the same);
  3. no OTHER file in the cache prints the same name with another value (a name printed with two values anywhere, e.g. Margherita 1159 here
     and 1136 at another park's restaurant, or Cod Bites 197 and 457 in the same file, is left out: the script prints that list).
Dishes are matched by their printed name (case, apostrophes, full stops and "NEW!" ignored). Calories are copied from the PDF text; only the
display names, sections, sizes and tags below are written by hand. The script stops if a shared PDF prints a dish that is neither in the
table below nor in IGNORED (a new, renamed or removed dish), or if a block of values changes layout, so a human re-checks the table.

Nutrition: calories only (protein, carbs, fat are never printed): `nutrition_level = calories`, so every item is non-rankable.
Left out on purpose (see IGNORED): extra-sauce and chicken-flavour add-ons of the Fried Chicken block (printed under two different meanings
of the same name), ice cream scoops printed "choose any 3 scoops" without saying what the value covers, "Rice Crispies"/"Rice Krispies"
(spelt differently in different parks' files), milkshakes' separate PDF (no calories in its text layer), dishes printed at fewer than 3 parks.
Allergens: none. The menus only say "allergen menus are available on request"; the per-park allergen PDFs that exist (The Lookout, Cornwall;
John Paul Jones, Bay Filey) are on the retired CMS host or return 404, and none covers every published dish: nothing is published.
Tags: vegetarian only when the dish's printed name or description says vegan/vegetarian/plant-based (the menus' V icons are pictures, not
text); contains_pork / contains_beef only when the printed name or description says bacon, sausage, ham, pork, beef, steak. Everything
else is "meat type not stated".
"""
from __future__ import annotations

import argparse
import collections
import html
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import away_resorts_pdf as P  # noqa: E402
import robots_rfc  # noqa: E402
from common import ROOT, sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "away-resorts"
MIN_PARKS = 3
EXPECTED_ITEMS = 170  # the script stops if the number of published dishes changes: re-check the table against the new menus
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
WWW, OWNERS = "www.awayresorts.co.uk", "owners.awayresorts.co.uk"
SOURCE_URL = "https://owners.awayresorts.co.uk/media/fxjjbi3j/mill-rythe-main-menu.pdf"
MENUS_PAGE = re.compile(r"/parks/[^/]+/[^/]+/food-(?:and-)?drink/menus/$")
NOTE = ("Calories only (per serving or drink); protein, carbs and fat are not published. Menus differ by park: only dishes printed with the same "
        "name and calories in the menu PDFs of at least 3 parks are listed, and a name printed with two different values is left out.")

# ---------------------------------------------------------------------------------------------- the table (names, sections, tags by hand)
STARTERS, FRIED, SANDW, MAINS, ADDONS = "Starters & Sharers", "Fried Chicken", "Sandwiches & Wraps", "British Classics & World Flavours", "Add-ons"
SIGN, STACK, PIZZA, SIDES, FILTHY, DESS = "Signature Burgers", "Stacked Burgers", "Pizzas", "Sides", "Filthy Fries", "Desserts"
KIDS, TOTS = "Kids menu", "Tots menu"
BKF, BEGG, BLIGHT, BSWEET, BEXTRA = "Breakfast", "Breakfast eggs", "Light & Lovely", "Breakfast sweet treats", "Breakfast extras"
C22 = "Catch 22 takeaway"
SOFT, SHAKE = "Soft drinks", "Milkshakes"
TAGS = {"p": "contains_pork", "b": "contains_beef", "v": "vegetarian"}


def D(cat, name, keys=None, serving="", tags=""):
    return dict(cat=cat, name=name, keys=[P.norm_name(k) for k in (keys or [name])], serving=serving, tags=tags, block=None)


def B(cat, name, heading, labels, window=8, then="", tags=""):
    """A dish printed in a grid: `heading` is its title line; the calorie numbers that follow are its sizes, in the order of `labels`."""
    return [dict(cat=cat, name=f"{name} ({lab})", keys=[], serving="", tags=tags, block=(heading, i, len(labels), window, then))
            for i, lab in enumerate(labels)]


TABLE = [
    # ---- Pub & Kitchen main menu (29 Sep 2026 at most parks)
    D(STARTERS, "Soup of the Day"), D(STARTERS, "Garlic Bread"), D(STARTERS, "Cheesy Garlic Bread"),
    *B(STARTERS, "Cauliflower Wings", "cauliflower wings", ["Regular", "Large"], 6),
    D(STARTERS, "Cheese Nachos", serving="Serves 2"), D(STARTERS, "Pulled Pork Nachos", serving="Serves 2", tags="p"),
    D(STARTERS, "Beef Chilli Nachos", serving="Serves 2", tags="b"), D(STARTERS, "Cajun Chicken Nachos", serving="Serves 2"),
    D(STARTERS, "Vegan Nachos", ["Vegan Nachos (Serves 2)", "Vegan Nachos"], serving="Serves 2", tags="v"),
    D(STARTERS, "Cheese and Bacon Quesadilla", tags="p"),
    *B(FRIED, "Strips", r"Strips reg .*", ["regular", "large"], 0), *B(FRIED, "Boneless Bites", r"Boneless Bites reg .*", ["regular", "large"], 0),
    D(SANDW, "B.L.T Ciabatta", tags="p"), D(SANDW, "Triple Cheese Toastie"), D(SANDW, "Falafel Wrap"), D(SANDW, "Crispy Fried Chicken Wrap"),
    D(SANDW, "Add Chips", ["Add Chips"]), D(SANDW, "Add Side Salad", ["Side Salad"]),
    D(MAINS, "Hunter's Chicken Stack", tags="p"), D(MAINS, "Rump Steak", tags="b"), D(MAINS, "Caesar Salad"),
    D(MAINS, "Bang Bang Chilli Chicken Noodles"), D(MAINS, "Balti Pie"), D(MAINS, "Chicken Tikka Masala"), D(MAINS, "Steak and Ale Pie", tags="b"),
    D(MAINS, "Chicken Souvlaki Wrap"), D(MAINS, "Crispy Cauliflower Salad"), D(MAINS, "Skillet Bacon Mac & Cheese", tags="p"),
    D(ADDONS, "Add Axle Jack Glaze"), D(ADDONS, "Add Sliced Chicken Breast"), D(ADDONS, "Add Vegan Fried Chick’n", tags="v"),
    D(ADDONS, "Add Bread & Butter"),
    D(SIGN, "The Big Boi", tags="p|b"), D(SIGN, "Notorious P.I.G.", tags="p|b"), D(SIGN, "The Big Bird", tags="p"), D(SIGN, "Chicken Strip B.L.T", tags="p"),
    *B(STACK, "Classic", "Classic", ["double", "triple"]), *B(STACK, "Cheese", "Cheese", ["double", "triple"], tags="b"),
    *B(STACK, "Bacon Cheese", "Bacon Cheese", ["double", "triple"], tags="p"),
    D(PIZZA, "BBQ Chicken and Bacon", tags="p"),
    D(SIDES, "Skinny Fries"), D(SIDES, "Chunky Chips"), D(SIDES, "Onion Rings"),
    *B(FILTHY, "Dirty Fries", "dirty fries", ["regular", "large"]), *B(FILTHY, "Hunters BBQ Fries", "hunters bbq", ["regular", "large"], tags="p"),
    *B(FILTHY, "Fully Loaded Fries", "fully loaded", ["regular", "large"], tags="p"), *B(FILTHY, "Habanero Hot Fries", "habanero hot", ["regular", "large"]),
    *B(FILTHY, "Chilli Fries", "chilli", ["regular", "large"], tags="b"), *B(FILTHY, "Chicken Katsu Curry Fries", "katsu curry", ["regular", "large"], 3),
    D(DESS, "Dubai Style Cookie Ice Cream Sandwich", ["ice cream sandwich"]), D(DESS, "Chocolate Fudge Brownie"),
    D(DESS, "Millionaire’s Sundae"), D(DESS, "Knickerbocker Sundae"),
    # ---- Kids and Tots menus
    D(KIDS, "Rainbow Sticks"), D(KIDS, "Crunchy Garlic Bread"), D(KIDS, "Tortilla Chips"), D(KIDS, "Kickin’ Chick*n Burger", tags="v"),
    D(KIDS, "Gloriously Grilled Chicken Salad"), D(KIDS, "Cheeky Cheeseburger"), D(KIDS, "Funky Fried Chicken Strips"),
    D(KIDS, "Nibbly Nutella Pancakes"), D(KIDS, "Bear’s Chocolate & Oreo Sundae"), D(KIDS, "Pip Organic Rainbow Lolly"), D(KIDS, "Chocolate Ice Cream"),
    D(TOTS, "Fish Fingers and Chips"), D(TOTS, "Pastacadabra"), D(TOTS, "Banging Burger"), D(TOTS, "Chompin’ Chicken Chunks"), D(TOTS, "Lucy’s Mini Donuts"),
    # ---- Breakfast menus (Feb and Sep 2026 versions)
    D(BKF, "Big Away Breakfast", tags="p"), D(BKF, "Traditional Breakfast", tags="p"), D(BKF, "Small Breakfast", tags="p"),
    D(BKF, "Vegetarian Breakfast", tags="v"), D(BKF, "Plant-Based Breakfast", tags="v"), D(BKF, "Breakfast Hash", tags="p"),
    D(BEGG, "Eggs Benedict", tags="p"), D(BEGG, "Eggs Florentine"), D(BEGG, "Eggs on Toast"), D(BEGG, "Ham and Cheese Omelette", tags="p"),
    D(BEGG, "Cheese and Mushroom Omelette"), D(BEGG, "Poached Eggs and Smashed Avocado on Toast", ["Avocado on Toast"]), D(BEGG, "Spicy Baked Eggs"),
    D(BEGG, "Breakfast Burrito"),
    D(BLIGHT, "Sausage, Egg and Beans", tags="p"), D(BLIGHT, "Bacon, Egg and Beans", tags="p"), D(BLIGHT, "Beans on Toast"), D(BLIGHT, "Toast and Jam"),
    D(BLIGHT, "Toasted Teacake"), D(BLIGHT, "Toasted Crumpet"), D(BLIGHT, "Granola Pot"), D(BLIGHT, "Cornflakes"), D(BLIGHT, "Crunchy Nut Cornflakes"),
    D(BLIGHT, "Special K"),
    D(BSWEET, "Bear Waffle Breakfast", tags="p"), D(BSWEET, "Croissant and Jam"), D(BSWEET, "Pain au Chocolat"),
    D(BSWEET, "Sweet Bear Waffle", ["Waffle"]),
    *B(BSWEET, "Pancakes with Maple Syrup", r"Maple Syrup \d+\.\d\d", ["regular", "large"], 4),
    *B(BSWEET, "Pancakes with Fresh Fruit", r"Fresh Fruit \d+\.\d\d", ["regular", "large"], 4),
    *B(BSWEET, "Pancakes with Bacon and Maple Syrup", r"Bacon and Maple Syrup \d+\.\d\d", ["regular", "large"], 4, tags="p"),
    *B(BSWEET, "Pancakes with Nutella", r"Nutella \d+\.\d\d", ["regular", "large"], 4),
    D(BEXTRA, "Mushrooms", ["Mushrooms", "Mushroom"]), D(BEXTRA, "Tomato"), D(BEXTRA, "Hash Brown"), D(BEXTRA, "Baked Beans"), D(BEXTRA, "Fried Egg"),
    D(BEXTRA, "Poached Egg"), D(BEXTRA, "Fried Bread"), D(BEXTRA, "Vegan Sausage", tags="v"), D(BEXTRA, "Black Pudding", ["BlackPudding", "Black Pudding"]),
    # ---- Catch 22 takeaway menu (2026)
    D(C22, "Small Cod"), D(C22, "Large Cod"), D(C22, "Small Chips"), D(C22, "Large Chips"), D(C22, "Salt & Pepper Spice Bag", ["Salt & Pepper Spice Bag", "Spice Bag"]),
    D(C22, "Small Sausage", tags="p"), D(C22, "Large Sausage", tags="p"), D(C22, "Small Battered Sausage", tags="p"),
    D(C22, "Large Battered Sausage", tags="p"), D(C22, "Chicken Nuggets"),
    D(C22, "Bread Roll"), D(C22, "Curry Sauce"), D(C22, "Mushy Peas"), D(C22, "Beans"),
    # ---- Drinks menus (Feb 2026): "Calories shown are per drink"
    D(SOFT, "Appletiser"), D(SOFT, "J2O Apple and Raspberry"), D(SOFT, "J2O Orange and Passion Fruit"), D(SOFT, "Pepsi Bottle"),
    *B(SOFT, "Diet Pepsi", "Diet Pepsi", ["child", "small", "regular"], 8, r"Child \d+ kcal"),
    *B(SOFT, "Lemonade", "Lemonade", ["child", "small", "regular"], 8, r"Child \d+ kcal"),
    *B(SOFT, "Pepsi Max", "Pepsi Max", ["child", "small", "regular"], 8, r"Child \d+ kcal"),
    D(SOFT, "Red Bull"), D(SOFT, "Apple Juice", ["Apple Juice 10oz"], serving="10oz"), D(SOFT, "Orange Juice", ["Orange Juice 10oz"], serving="10oz"),
    D(SOFT, "Pip Organic Cloudy Apple"), D(SOFT, "Pip Organic Strawberry and Blackcurrant", ["Pip Organic Strawberry and Blackcurrant", "and Blackcurrant"]),
    D(SOFT, "Britvic Slimline Tonic"), D(SOFT, "Britvic Tonic"), D(SOFT, "Fever-Tree Elderflower"), D(SOFT, "Fever-Tree Ginger Ale"),
    D(SOFT, "Fever-Tree Indian Tonic"), D(SOFT, "Fever-Tree Mediterranean Tonic", ["Fever-Tree Mediterranean Tonic", "Mediterranean Tonic"]),
    D(SOFT, "Fever-Tree Slimline Tonic"), D(SOFT, "Harrogate Sparkling Water", ["Harrogate Sparkling Water 330ml"], serving="330ml"),
    D(SOFT, "Harrogate Still Water", ["Harrogate Still Water 330ml"], serving="330ml"),
    D(SHAKE, "Biscoff Billionaire Milkshake", ["biscoff billionaire"]), D(SHAKE, "Strawberries & Cream Milkshake", ["Strawberries & Cream"]),
    D(SHAKE, "Dubai Style Milkshake", ["dubai style"]), D(SHAKE, "Oreo Chocolate Milkshake", ["oreo Chocolate"]),
]

# Printed calorie values that are NOT published although they sit in a shared PDF (norm_name -> why). Names printed with two values are not
# listed here: the script finds them itself ("left out: same name, different values").
IGNORED = {
    "adults need around": "the footer 'Adults need around 2000 kcal a day', not a dish",
    "calories shown are per drink adults need around": "footer, not a dish",
    "around": "footer, not a dish",
    # the Fried Chicken block: Step 2 flavours and Step 3 extra sauces (a name such as Maple Mustard is printed for two different amounts)
    "axle jack": "Fried Chicken flavour add-on", "habanero hot": "Fried Chicken flavour add-on (also the title of a Filthy Fries dish)",
    "katsu": "Fried Chicken extra-sauce add-on", "mustard": "Fried Chicken flavour add-on (printed 'Original Maple / Mustard')",
    "bbq": "Fried Chicken extra-sauce add-on", "salt n pepper": "Fried Chicken flavour add-on", "sour cream": "Fried Chicken extra-sauce add-on",
    # sizes of dishes that are read by their heading (see B() in TABLE): the number is published under the dish, not under 'Large'
    "strips reg": "read with its large size under Fried Chicken 'Strips'", "boneless bites reg": "read with its large size under 'Boneless Bites'",
    "large": "Cauliflower Wings, large (read under its heading)",
    "rice crispies": "spelt 'Rice Crispies' in some parks' files and 'Rice Krispies' in others: the name is not identical, so neither is listed",
    "rice krispies": "see 'Rice Crispies'",
    "triple chocolate ice cream": "printed under 'Carte D'or Ice Cream: choose any 3 scoops from', without saying what the value covers",
}


# ---------------------------------------------------------------------------------------------- fetching (polite, robots-checked)
def curl(url: str, out: Path) -> int:
    res = subprocess.run(["curl", "-sS", "-L", "-A", UA, "-o", str(out), "-w", "%{http_code}", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"download failed for {url}: {res.stderr.strip()}")
    return int(res.stdout.strip() or 0)


def robots_for(cache: Path, host: str):
    f = cache / f"robots-{host}.txt"
    if not f.exists():
        if curl(f"https://{host}/robots.txt", f) != 200:
            raise SystemExit(f"cannot read https://{host}/robots.txt: stop (never work round it)")
        time.sleep(1.1)
    return robots_rfc.parse(f.read_text(encoding="utf-8-sig"))


def menu_pages(cache: Path) -> list:
    sm = (cache / "sitemap.xml").read_text(encoding="utf-8")
    urls = []
    for u in re.findall(r"<loc>([^<]*)</loc>", sm):
        if MENUS_PAGE.search(u) and u not in urls:
            urls.append(u)
    return urls


def park_links(cache: Path) -> dict:
    """{park: [(pdf url, link label)]} for the PDFs on owners.awayresorts.co.uk linked from each park's menus page."""
    out = {}
    for f in sorted((cache / "pages").glob("*.html")):
        t = f.read_text(encoding="utf-8")
        links = []
        for m in re.finditer(r'<a[^>]*href="(https://owners\.awayresorts\.co\.uk/media/[^"]*\.pdf)"[^>]*>(.*?)</a>', t, re.S):
            label = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", m.group(2))).split())
            if (m.group(1), label) not in links:
                links.append((m.group(1), label))
        out[f.stem] = links
    return out


def pdf_path(cache: Path, url: str) -> Path:
    return cache / "pdf" / url.split("/media/")[1].replace("/", "__")


def fetch(cache: Path) -> None:
    (cache / "pages").mkdir(parents=True, exist_ok=True)
    (cache / "pdf").mkdir(exist_ok=True)
    www = robots_for(cache, WWW)
    if not (cache / "sitemap.xml").exists():
        if curl(f"https://{WWW}/sitemap.xml", cache / "sitemap.xml") != 200:
            raise SystemExit("cannot read sitemap.xml")
        time.sleep(1.1)
    for u in menu_pages(cache):
        path = "/" + u.split("/", 3)[3]
        out = cache / "pages" / (u.split("/")[5] + ".html")
        if not robots_rfc.allowed(www, path):
            print(f"robots.txt disallows {u}: skipped")
        elif not out.exists():
            code = curl(u, out)
            print(f"{code} {u}")
            if code != 200:
                out.unlink(missing_ok=True)
            time.sleep(1.1)
    owners = robots_for(cache, OWNERS)
    urls = sorted({u for links in park_links(cache).values() for u, _ in links})
    for u in urls:
        out = pdf_path(cache, u)
        if out.exists() and out.stat().st_size > 500:
            continue
        if not robots_rfc.allowed(owners, "/" + u.split("/", 3)[3]):
            print(f"robots.txt disallows {u}: skipped")
            continue
        code = curl(u, out)
        if code != 200 or not out.read_bytes()[:5] == b"%PDF-":
            print(f"HTTP {code}, not saved: {u}")
            out.unlink(missing_ok=True)
        time.sleep(1.1)


# ---------------------------------------------------------------------------------------------- reading
def created(path: Path) -> str:
    info = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True).stdout
    for line in info.splitlines():
        if line.startswith("CreationDate:"):
            return datetime.strptime(line.split(":", 1)[1].strip().replace(" UTC", ""), "%a %b %d %H:%M:%S %Y").strftime("%Y-%m-%d")
    return ""


def load_files(cache: Path):
    """{sha: file record} for every cached PDF linked from a park page, with the parks that link it; plus the dead links."""
    files, dead = {}, []
    for park, links in park_links(cache).items():
        for url, label in links:
            path = pdf_path(cache, url)
            if not path.exists() or path.stat().st_size < 500:
                dead.append((park, url))
                continue
            sha = sha256_file(path)
            if sha not in files:
                text = P.pdf_text(path)
                files[sha] = dict(path=path, url=url, text=text, pairs=P.kcal_pairs(text), parks=set(), labels=set(), created=created(path))
            files[sha]["parks"].add(park)
            files[sha]["labels"].add(label)
    return files, dead


def plain(value: str) -> str:
    return value.replace(",", "")


def build(cache: Path):
    files, dead = load_files(cache)
    if not files:
        raise SystemExit("no PDFs in the cache: run with --fetch first")
    shared = {sha for sha, f in files.items() if len(f["parks"]) >= MIN_PARKS}
    # every printed (name -> values) over ALL files, for the "same name, other value" rule
    printed = collections.defaultdict(lambda: collections.defaultdict(set))  # norm name -> value -> {sha}
    for sha, f in files.items():
        for pr in f["pairs"]:
            for nm in {P.norm_name(pr["name"]), P.norm_name(pr["full"])} - {""}:
                printed[nm][plain(pr["kcal"])].add(sha)  # '1.013' (a dot) stays a different value from '1013'; '1,013' is the same
    items, left_out, problems = [], [], []
    used_shas = set()
    all_keys = set()
    for d in TABLE:
        all_keys.update(d["keys"])
        evidence = {}  # sha -> set of values printed for this dish
        if d["block"]:
            heading, idx, count, window, then = d["block"]
            for sha, f in files.items():
                try:
                    vals = P.block_values(f["text"], heading, count, window, then)
                except P.LayoutError as e:
                    if sha in shared:
                        raise SystemExit(f"{d['name']}: {f['url']}: {e}: the layout changed, re-check the table")
                    problems.append(f"{d['name']}: {f['url']} not readable ({e}); not used as evidence")
                    continue
                if vals:
                    evidence.setdefault(sha, set()).add(plain(vals[idx]))
        else:
            for sha, f in files.items():
                for pr in f["pairs"]:
                    if {P.norm_name(pr["name"]), P.norm_name(pr["full"])} & set(d["keys"]):
                        evidence.setdefault(sha, set()).add(plain(pr["kcal"]))
        values = set().union(*evidence.values()) if evidence else set()
        parks = set().union(*(files[s]["parks"] for s in evidence)) if evidence else set()
        if not evidence:
            problems.append(f"{d['name']}: not printed in any file (removed from the menus?)")
            continue
        if len(values) != 1:
            left_out.append((d["name"], f"printed with different values {sorted(values)} in {len(parks)} parks"))
            continue
        if len(parks) < MIN_PARKS:
            left_out.append((d["name"], f"printed at only {len(parks)} park(s)"))
            continue
        used_shas.update(evidence)
        tags = "|".join(TAGS[t] for t in d["tags"].split("|") if t) if d["tags"] else ""
        items.append(dict(name=d["name"], category=d["cat"], serving=d["serving"], calories=next(iter(values)), tags=tags, rankable=False,
                          notes=f"printed with the same value in the menus of {len(parks)} parks ({', '.join(sorted(parks))})"))
    # dishes in the shared PDFs that the table does not know
    unknown, auto_left, unnamed = {}, {}, 0
    for sha in shared:
        for pr in files[sha]["pairs"]:
            names = {P.norm_name(pr["name"]), P.norm_name(pr["full"])} - {""}
            if not names:
                unnamed += 1  # a grid cell (e.g. the third number of a burger's sizes); dishes in grids are read by their heading above
                continue
            if names & all_keys or names & set(IGNORED):
                continue
            conflicted = [n for n in names if len(printed[n]) > 1]
            if conflicted:
                n = conflicted[0]
                auto_left[n] = sorted(printed[n])
            else:
                unknown[pr["full"] or pr["name"]] = pr["kcal"]
    if unknown:
        raise SystemExit("Calories printed in a shared PDF for dishes that are not in TABLE or IGNORED (new, renamed or a layout fragment): "
                         + "; ".join(f"{k} = {v}" for k, v in sorted(unknown.items())))
    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        raise SystemExit("Item names are not unique")
    if EXPECTED_ITEMS and len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"Expected {EXPECTED_ITEMS} dishes, built {len(items)}: the menus changed, re-check the table")
    return items, left_out, auto_left, problems, files, used_shas, dead, len(shared), unnamed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path, help="folder for the downloaded pages and PDFs")
    ap.add_argument("--fetch", action="store_true", help="download the park pages and PDFs (skips what is cached), then stop")
    ap.add_argument("--checked-on", help="the day the PDFs were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(args.cache)
        return
    if not args.checked_on:
        ap.error("--checked-on is required")
    items, left_out, auto_left, problems, files, used, dead, n_shared, unnamed = build(args.cache)
    dates = sorted(files[s]["created"] for s in used if files[s]["created"])
    title = (f"Away Resorts park menus with calories (PDFs on owners.awayresorts.co.uk linked from each park's menus page; "
             f"created {dates[0]} to {dates[-1]}; main menu 2026-09-29)")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Away Resorts", cuisine="Holiday park restaurant", source_title=title, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=["away resorts"], items=items, out=args.out, note=NOTE, nutrition_level="calories")
    cats = collections.OrderedDict()
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))
    print(f"{len(files)} distinct PDFs read from {len({p for f in files.values() for p in f['parks']})} parks; {n_shared} are shared by {MIN_PARKS}+ parks")
    print("\nPDFs that carry published dishes (sha256, created, parks, one URL):")
    for sha in sorted(used, key=lambda s: files[s]["url"]):
        f = files[sha]
        print(f"  {sha}  {f['created']}  {len(f['parks'])} parks  {f['url']}")
    print(f"\n{unnamed} calorie values in the shared PDFs have no name beside them (grid cells, read through their headings)")
    print("\nLeft out because the table's dish is not consistent or not wide enough:")
    for n, why in left_out:
        print(f"  {n}: {why}")
    print("\nLeft out because the same name is printed with different values (name: values):")
    for n, vals in sorted(auto_left.items()):
        print(f"  {n}: {', '.join(vals)}")
    if dead:
        print("\nLinks that are not in the cache (404 or not fetched): " + ", ".join(sorted({u.split('/media/')[1] for _, u in dead})))
    for p in problems:
        print("WARNING " + p)


if __name__ == "__main__":
    main()
