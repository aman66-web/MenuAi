#!/usr/bin/env python3
"""Build data/source/sams-chicken/ from Sam's Chicken's own website (a FULL-nutrition chain; allergens: guide link only).

    python3 tools/uk_extract/sams_chicken.py --cache DIR [--fetch] [--checked-on YYYY-MM-DD] [--out DIR]

Sources (the chain's own site; robots.txt answers 404 = no rules, RFC 9309):
  * https://samschicken.com/category/<n>_<slug>   ten menu categories (1_chicken ... 10_sauces-dips) that list the item pages;
  * https://samschicken.com/item/<n>_<slug>       one static HTML page per menu item (95). Each prints a nutrition table
    (ENERGY in cal = kcal, PROTEIN, FAT, SAT FAT, CARBS, SUGARS, SODIUM; grams except energy), usually a basis line such as
    "Average per one wing." and an "Allergens :" line;
  * https://samschicken.com/allergen              the chain's allergen chart: a table of 74 items with energy, the same basis line and
    allergens. It is the chain's own second listing of the same data, used here as a cross-check on energy and basis (a mismatch
    holds the item back);
  * https://samschicken.com/locations (45 branches, checked to be 3 or more) and https://samschicken.com/about_us (the halal
    sentence, recorded for the Halal filter by the orchestrator, not here).
  The pages carry no edition date (the site footer is (c) 2025), so source_title says "accessed {date}, no edition date shown".

Pacing is the risk: the host answered HTTP 429 at one request a second in earlier runs. --fetch therefore waits DELAY seconds (6)
between requests, caches every page in --cache (so a rerun, a spot check or this parser never asks twice) and STOPS the run on the
first 429 / 403 / 401 / any other HTTP error (a stop in our rules; it never retries faster or works round it). Rerun later with the
same --cache to carry on from the pages already saved. Without --fetch the script only reads --cache.

How the numbers are read (copied by this script, never typed; only names, categories and grouping are written by hand):
  * Each figure is copied exactly as printed (strings such as "32.26"). ENERGY is printed in "cal", which is kcal. Salt is not
    printed and is left blank (never derived).
  * SODIUM is printed in grams (1.69 g) and is NOT published (PUBLISH_SODIUM = False). The column cannot be sodium as labelled: 30.1 g
    for the Fiery Bucket would be 75 g of salt, 14.25 g for the Family Mini Mix 36 g and 11.29 g for a whole peri chicken 28 g, so the
    figures look like salt under a sodium heading; it also prints 0, or one copied figure (0.84 g with and without chicken or poppers),
    on the Loaded dishes. Reading it as salt would be a guess and converting is not allowed, so it is left out and each row's notes keep
    the printed figure. With PUBLISH_SODIUM = True it is written in milligrams (1.69 g -> 1690, a pure unit change), blank where it is
    0 beside energy, on the Loaded dishes and where two pages of the chain disagree.
  * The basis line is the page's own serving ("Average per one wing.", "Average per 150g."). Where a page prints one, `serving` says so
    ("1 wing (average)") and the item is named with that unit ("Fiery Wing (1 wing)"); larger options the page mentions ("4, 8, 12, 20
    portions") are not published and nothing is multiplied. About two thirds of the pages (burgers, boxes, wraps, buckets, loaded
    dishes, desserts) print NO basis line: their figures are for the item as listed and `serving` stays blank.
  * "20 Fiery Wings", "20 Peri Wings" and "20 BBQ Wings" are listed under Family but print the figures of ONE wing. "20 Fiery Wings"
    repeats the Wings page exactly and "20 Peri Wings" repeats Peri Wings except in sodium, so neither is a separate item; the BBQ one
    has no other page and is published as "BBQ Wing (1 wing)" under Chicken.

What is not published (every row stays in items.csv and is listed in holdback.csv with its reason, so a rerun cannot bring it back by
accident; nothing is corrected, and the script stops if the pattern behind a decision changes):
  * 24 pages that print 0 for every figure (soft drinks, Fruit Shoots, the grilled dishes, Salad, three sauces): no nutrition is
    published; the chain's allergen chart calls ten of them "Awaiting for more info...";
  * dishes whose own figures cannot hold: energy against 4P+4C+9F more than 30% apart, saturates above fat, sugars above carbohydrate,
    and, where the page's basis line is a weight ("Average per 25g."), more protein + carbohydrate + fat than that weight allows
    (the audit's macros-exceed-weight rule: more than weight x 1.05 + 1 g) or more than 9.3 kcal a gram (kcal-per-gram). That holds
    back Sam's Mayo (261 cal, 35.3 g of macros in 25 g, 10.4 kcal/g) and Sweet Chili Mayo (27.6 g in 25 g); Chili Mayo (25.7 g in
    25 g) is inside the audit's tolerance and stays published. The gram basis is also written to `weight_g`, so check_chain.py and
    tools/audit/accuracy_audit.py enforce the same two rules on every later run;
  * dishes whose page copies another page's figures: Hash Brown (one piece) and Spicy Fries print the identical seven figures as Fries
    (150 g), the set the chain's own Combo Box and Blaze Box pages add up from (489 + 2 x 184 + 295 = 1152 kcal, and the same for
    protein, fat and carbohydrate; checked on every run), so Fries is published and the two copies are not; two Ben & Jerry's flavours
    print one identical set and nothing says which page is the copy, so neither is published;
  * a box whose figures do not add up to the pages of what the chain's menu card says it holds. Eleven of the twelve boxes, buckets
    and whole-chicken meals add up to those pages to within 0.1% (COMPOSITIONS); the Devil Box prints 142.6 g protein against 95.9 g and
    61.9 g fat against 79.7 g for its parts, so it is held back.

Allergens: each item page and the chart print an allergen line, but the lines contradict the dishes themselves (the Combo Box, a
burger with two wings, fries and a drink, lists no gluten; the Mozzarella Sticks, described as "100% Arla Mozzarella", list no milk;
the Value Bucket of chicken pieces and fries lists only "Sulphur"; ten of the eleven sides, even the Corn Cobette, BBQ Beans and
Salad, list "Gluten" only), 21 items are not on the chart at all and the chart prints "Sulphur". They are therefore not used: only the
link to the chain's allergen chart is published (docs/DATA.md: all or nothing). The chart prints no "may contain" information.

Rerun: python3 tools/uk_extract/sams_chicken.py --cache /path/to/cache --fetch   (then check_chain.py sams-chicken)
"""
from __future__ import annotations

import argparse
import hashlib
import html as htmllib
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "sams-chicken"
SITE = "https://samschicken.com"
ALLERGEN_CHART_URL = f"{SITE}/allergen"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0.0.0 Safari/537.36")
DELAY = 6.0  # seconds between requests to the host (earlier runs at 1 request a second were answered 429)
ALIASES = ["sams chicken", "sam's chicken"]
SOURCE_TITLE = ("Sam's Chicken website: nutrition on each menu item page and the allergen chart "
                "(accessed {checked}, no edition date shown)")
SOURCE_URL = f"{SITE}/category/1_chicken"
ALLERGEN_GUIDE_TITLE = "Sam's Chicken allergen chart (accessed {checked}, no edition date shown)"
CATEGORY_PAGES = [  # (slug on the site, category shown in the app, item pages expected); order = order on the site
    ("1_chicken", "Chicken", 5), ("2_burgers", "Burgers", 10), ("3_box-deals", "Box Deals", 5), ("4_wraps", "Wraps", 4),
    ("5_peri-peri-chicken", "Peri Peri Chicken", 2), ("6_family", "Family", 11), ("7_loaded", "Loaded", 15), ("8_sides", "Sides", 11),
    ("9_drinks-desserts", "Drinks & Desserts", 21), ("10_sauces-dips", "Sauces & Dips", 11),
]
PUBLISH_SODIUM = False  # see the docstring: the chain's "sodium" column cannot be sodium; the printed figure stays in each row's notes
EXPECTED_CHART_ROWS = 74
EXPECTED_BRANCHES_AT_LEAST = 3  # full-nutrition chains need 3+ GB sites; the page lists 45
HALAL_SENTENCE = ("The chicken served in our stores is Halal (to the best of our knowledge, based on the representations of our "
                  "suppliers) and is sourced solely from certified Halal suppliers.")

# The page's own basis line -> `serving` (printed words kept; "one" written as 1). An unknown line stops the run.
BASIS_SERVING = {
    "": "",
    "Average per one piece.": "1 piece (average)", "Average per one wing.": "1 wing (average)",
    "Average per 5 nuggets.": "5 nuggets (average)", "Average per 10 poppers.": "10 poppers (average)",
    "Average per whole chicken.": "1 whole chicken (average)", "Average per 150g.": "150 g (average)",
    "Average per one 150g.": "150 g (average)", "Average per 200g.": "200 g (average)",
    "Average per one cobette.": "1 cobette (average)", "Average per 75g.": "75 g (average)",
    "Average per 5 Mozzarella Sticks.": "5 mozzarella sticks (average)", "Average per 100g.": "100 g (average)",
    "Average per 25g.": "25 g (average)",
}

# Page name -> published name (the unit the figures are for is part of the name where the page prints one). Names only.
NAMES = {
    "Chicken Pieces": "Chicken Piece (1 piece)", "Wings": "Fiery Wing (1 wing)", "Chicken Strips": "Chicken Strip (1 piece)",
    "Chicken Nuggets": "Chicken Nuggets (5 nuggets)", "Poppers": "Poppers (10 poppers)", "Peri Wings": "Peri Wing (1 wing)",
    "20 BBQ Wings": "BBQ Wing (1 wing)",
    "Loaded Beans with chicken": "Loaded Beans with Chicken", "Loaded Beans with poppers": "Loaded Beans with Poppers",
    "Fries": "Fries (150 g)", "Hash Brown": "Hash Brown (1 piece)", "Spicy Fries": "Spicy Fries (150 g)",
    "Sweet Potato Fries": "Sweet Potato Fries (150 g)", "Wedges": "Wedges (150 g)", "Spicy Rice": "Spicy Rice (200 g)",
    "Corn / Cobette": "Corn / Cobette (1 cobette)", "Coleslaw": "Coleslaw (75 g)", "Mozzarella Sticks": "Mozzarella Sticks (5 sticks)",
    "BBQ Beans": "BBQ Beans (100 g)",
    "BBQ": "BBQ Sauce (25 g)", "Garlic & Herb": "Garlic & Herb Sauce (25 g)", "Sweet & Sour": "Sweet & Sour Sauce (25 g)",
    "Tomato": "Tomato Sauce (25 g)", "Chili Mayo": "Chili Mayo (25 g)", "Sweet Chili Mayo": "Sweet Chili Mayo (25 g)",
    "Sam's Mayo": "Sam's Mayo (25 g)", "Algerian Sauce": "Algerian Sauce (25 g)",
}
# Item ids may not start with "combo-" (docs/DATA.md: reserved for generated orders)
ID_OVERRIDE = {"Combo Box": "sams-combo-box"}
# Page name -> category when it is not the category the site lists it under
CATEGORY_OVERRIDE = {"20 BBQ Wings": "Chicken"}
# Pages that are a second listing of a product already published: page name -> page name of the product. Every figure must be the
# same, except that sodium may differ (then the product's sodium is left blank, see below); anything else stops the run.
DUPLICATE_OF = {"20 Fiery Wings": "Wings", "20 Peri Wings": "Peri Wings"}
# Groups of pages that print one identical set of seven figures (checked on every run: the run stops if the groups change).
# (pages, the page kept or None, reason). In the fries group the Fries page is kept because the chain's own Combo Box and Blaze Box
# pages add up from exactly its figures (COMPOSITIONS, checked on every run); the other two print its set again.
IDENTICAL_GROUPS = [
    ({"Fries", "Hash Brown", "Spicy Fries"}, "Fries",
     "{name} prints one identical set of seven figures ({fig}) as Fries (150 g), with the basis line '{basis}'. The Fries page is the original: the "
     "chain's own Combo Box and Blaze Box pages add up from exactly its figures ({sums}). This page is a copy, so none of its figures is "
     "published."),
    ({"Ben & Jerry’s Chocolate Fudge Brownie", "Ben & Jerry’s Sundae Dulche De-Lish"}, None,
     "Two different flavours (Chocolate Fudge Brownie and Sundae Dulche De-Lish) print one identical set of seven figures ({fig}) and no "
     "basis: one page is a copy of the other and the chain does not say which. Neither is chosen."),
]
# Boxes and buckets are the sum of other pages: the chain's own menu card says what each holds, and 11 of the 12 add up to the figures of
# those pages to within 0.1% (energy, protein, fat, carbohydrate). The card text is asserted on every run (a changed card stops the run),
# a box whose figures do not add up to its parts within 1% is held back, and the Fries decision above rests on Combo Box and Blaze Box.
# page name -> (the menu card's text, [(page, how many)]). Names and counts are read from the card text by hand; numbers never are.
COMPOSITIONS = {
    "Combo Box": ("Chicken Fillet Burger with 2 Fiery Wings, Regular Fries & Drink.",
                  [("Chicken Fillet Burger", 1), ("Wings", 2), ("Fries", 1)]),
    "Blaze Box": ("Spicy Fillet Burger with 2 Fiery Wings, Regular Fries, Regular Coleslaw & Drink.",
                  [("Blaze Burger", 1), ("Wings", 2), ("Fries", 1), ("Coleslaw", 1)]),
    "Club Max Box": ("Club Max Burger with 2 Fiery Wings, 2 Spicy Strips, Regular Fries & Drink.",
                     [("Club Max Burger", 1), ("Wings", 2), ("Chicken Strips", 2), ("Fries", 1)]),
    "Devil Box": ("Spicy Fillet Maxi Burger with 3 Fiery Wings, Large Fries & Drink.",
                  [("Maxi Burger", 1), ("Wings", 3), ("Fries", 1)]),  # large fries are at least the regular ones
    "Family Mini Mix": ("4 Pcs Chicken, 2 Chicken Fillet Burger, 2 Reg. Fries.",
                        [("Chicken Pieces", 4), ("Chicken Fillet Burger", 2), ("Fries", 2)]),
    "Family Mega Mix": ("6 Pcs Chicken, 2 Chicken Strips Burger, 4 Reg. Fries.",
                        [("Chicken Pieces", 6), ("Strips Burger", 2), ("Fries", 4)]),
    "Value Bucket": ("8 Pcs Chicken, 4 Reg. Fries.", [("Chicken Pieces", 8), ("Fries", 4)]),
    "Variety Bucket": ("6 Pcs Chicken, 2 Chicken Fillet Burger, 6 Fiery Wings, 4 Reg. Fries.",
                       [("Chicken Pieces", 6), ("Chicken Fillet Burger", 2), ("Wings", 6), ("Fries", 4)]),
    "Boneless Bucket": ("2 Chicken Wrap, 2 Chicken Fillet Burger, 6 Chicken Strips, 4 Reg. Fries",
                        [("Chicken Wrap", 2), ("Chicken Fillet Burger", 2), ("Chicken Strips", 6), ("Fries", 4)]),
    "Fiery Bucket": ("20 Fiery Wings, 4 Strips Burger, 4 Reg. Fries.", [("Wings", 20), ("Strips Burger", 4), ("Fries", 4)]),
    "Whole Chicken with 3 Fries": ("Whole Chicken with 3 regular Fries.", [("Whole Peri Chicken", 1), ("Fries", 3)]),
    "Whole Chicken with 3 Rice": ("Whole Chicken with 3 Spicy Rice.", [("Whole Peri Chicken", 1), ("Spicy Rice", 3)]),
}
COMPOSITION_TOLERANCE = Decimal("0.01")  # 1% (or 1 unit) between a box and the sum of its parts
# Loaded dishes: sodium would not be published even with PUBLISH_SODIUM (checked on every run: only these two figures appear).
LOADED_SODIUM_SEEN = {Decimal("0"), Decimal("0.84")}
# Categories whose items are never suggested by "Best for you" (portions, shared buckets, drinks, desserts, sauces)
NOT_RANKABLE = {"Chicken", "Peri Peri Chicken", "Family", "Drinks & Desserts", "Sauces & Dips"}
NOTE = ("Figures are as printed on each item's page; only some pages state a basis (such as per wing or per 150 g), the rest are for the "
        "item as listed. Sodium is not shown: the chain's sodium figures are impossible as sodium (30 g in one bucket). The Combo, Blaze and "
        "Club Max boxes come with a drink, but their figures count the food only.")


# ---------------------------------------------------------------- fetching (polite, stops on any refusal)
class Refused(SystemExit):
    pass


class Fetcher:
    def __init__(self, cache: Path, fetch: bool):
        self.cache, self.fetch, self.last = Path(cache), fetch, 0.0
        self.cache.mkdir(parents=True, exist_ok=True)
        self.rules: list | None = None

    def path_of(self, url: str) -> Path:
        return self.cache / hashlib.sha1(url.encode()).hexdigest()

    def _robots(self, url_path: str) -> bool:
        if self.rules is None:
            f = self.path_of(f"{SITE}/robots.txt")
            if not f.exists():
                self._wait()
                try:
                    data = self._request(f"{SITE}/robots.txt")
                except urllib.error.HTTPError as e:
                    if e.code in (401, 429) or e.code >= 500:
                        raise Refused(f"robots.txt answered {e.code}: stop (RFC 9309)")
                    data = b""  # a 4xx (404 here) means the site has no rules
                f.write_bytes(data)
            self.rules = robots_rfc.parse(f.read_bytes().decode("utf-8", "replace"))
        return robots_rfc.allowed(self.rules, url_path)

    def _wait(self) -> None:
        gap = self.last + DELAY - time.monotonic()
        if gap > 0:
            time.sleep(gap)

    def _request(self, url: str) -> bytes:
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"}), timeout=40) as r:
                    data = r.read()
                self.last = time.monotonic()
                return data
            except urllib.error.HTTPError:
                self.last = time.monotonic()
                raise
            except OSError:  # a dropped connection is not a refusal: wait and ask again, twice at most, same pace
                self.last = time.monotonic()
                if attempt == 2:
                    raise
                time.sleep(DELAY * (attempt + 2))
        raise AssertionError("unreachable")

    def get(self, url: str) -> str:
        f = self.path_of(url)
        if f.exists():
            return f.read_bytes().decode("utf-8")
        if not self.fetch:
            raise SystemExit(f"{url} is not in the cache {self.cache}: run with --fetch")
        if not self._robots(url[len(SITE):]):
            raise Refused(f"robots.txt disallows {url}")
        self._wait()
        try:
            data = self._request(url)
        except urllib.error.HTTPError as e:
            raise Refused(f"HTTP {e.code} from {url}: stopped (never retried faster or worked round). Cached pages are kept; rerun later.")
        f.write_bytes(data)
        return data.decode("utf-8")

    def sha256(self, url: str) -> str:
        return hashlib.sha256(self.path_of(url).read_bytes()).hexdigest()


# ---------------------------------------------------------------- parsing
def text_of(fragment: str) -> str:
    return " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def category_items(page: str) -> list[tuple[str, str, str]]:
    """(item url, name, description) for each item card on a category page, in page order."""
    cards = re.findall(r'<div class="blog-item item-card">(.*?)</center>', page, flags=re.S)
    out = []
    for c in cards:
        url = re.search(r'href="(https://samschicken\.com/item/\d+_[a-z0-9-]+)"', c)
        name = re.search(r"<h4>(.*?)</h4>", c, flags=re.S)
        desc = re.search(r"<p>(.*?)</p>", c, flags=re.S)
        if not (url and name):
            raise SystemExit("an item card on a category page no longer has a link and a name")
        out.append((url.group(1), text_of(name.group(1)), text_of(desc.group(1)) if desc else ""))
    return out


NUTRIENT_HEADS = ["ENERGY", "PROTEIN", "FAT", "SAT FAT", "CARBS", "SUGARS", "SODIUM"]
UNIT = {"ENERGY": "cal", "PROTEIN": "g", "FAT": "g", "SAT FAT": "g", "CARBS": "g", "SUGARS": "g", "SODIUM": "g"}


def item_page(page: str, url: str) -> dict:
    """Name, basis line, the seven printed figures (number text exactly as printed) and the allergen words of one item page."""
    box = re.search(r'<div class="about-item overflow-hidden">(.*?)</table>(.*?)</div>', page, flags=re.S)
    if not box:
        raise SystemExit(f"{url}: no item block")
    head, after = box.group(1), box.group(2)
    name = text_of(re.search(r"<h3>(.*?)</h3>", head, flags=re.S).group(1))
    basis = re.search(r"<label[^>]*>([^<]*)</label>", head, flags=re.S)
    table = re.search(r'<table class="nutritions-table">(.*)', head + "</table>", flags=re.S).group(1)
    heads = [text_of(h) for h in re.findall(r"<th>(.*?)</th>", table, flags=re.S)]
    vals = [text_of(v) for v in re.findall(r"<td>(.*?)</td>", table, flags=re.S)]
    if heads != NUTRIENT_HEADS or len(vals) != len(heads):
        raise SystemExit(f"{url}: nutrition table is {heads} / {vals}, expected {NUTRIENT_HEADS}")
    figures = {}
    for head_, raw in zip(heads, vals):
        m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*" + UNIT[head_], raw)
        if not m:
            raise SystemExit(f"{url} ({name}): {head_} printed as {raw!r}, expected a number then {UNIT[head_]!r}")
        figures[head_] = m.group(1)
    allergen_label = re.search(r'<label class="allergens-lbl">(.*?)</label>', after, flags=re.S)
    allergens = [text_of(s) for s in re.findall(r"<span>(.*?)</span>", allergen_label.group(1), flags=re.S)] if allergen_label else None
    return {"url": url, "name": name, "basis": text_of(basis.group(1)) if basis else "", "figures": figures, "allergens": allergens}


def allergen_chart(page: str) -> dict[str, dict]:
    """The chain's allergen chart: item name -> {energy text, basis line, allergen words}."""
    rows = re.findall(r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>", page, flags=re.S)
    out = {}
    for n, e, a in rows:
        name = text_of(re.sub(r"<p>.*?</p>", "", n, flags=re.S))
        energy = text_of(re.sub(r"<label[^>]*>.*?</label>", "", e, flags=re.S))
        basis = text_of(" ".join(re.findall(r"<label[^>]*>(.*?)</label>", e, flags=re.S)))
        words = [text_of(x) for x in re.findall(r'<label class="allergen-lbl">(.*?)</label>', a, flags=re.S)]
        if name in out:
            raise SystemExit(f"allergen chart lists {name!r} twice")
        out[name] = {"energy": energy, "basis": basis, "allergens": words}
    return out


# ---------------------------------------------------------------- the rules
def dec(s: str) -> Decimal:
    return Decimal(s)


def sodium_mg(grams: str) -> str:
    """Printed grams -> milligrams, a pure unit change (1.69 g -> 1690). Stops if it would not be a whole number."""
    mg = dec(grams) * 1000
    if mg != mg.to_integral_value():
        raise SystemExit(f"sodium {grams} g is not a whole number of mg")
    return str(int(mg))


def figure_text(f: dict) -> str:
    return (f"{f['ENERGY']} cal, protein {f['PROTEIN']} g, fat {f['FAT']} g, saturates {f['SAT FAT']} g, carbohydrate {f['CARBS']} g, "
            f"sugars {f['SUGARS']} g, sodium {f['SODIUM']} g")


GRAMS_BASIS = re.compile(r"Average per (?:one )?(\d+)g\.")


def basis_grams(basis: str) -> Decimal | None:
    """The weight in grams a page's basis line is for ("Average per 25g." -> 25), or None for a count ("per one wing")."""
    m = GRAMS_BASIS.fullmatch(basis)
    return Decimal(m.group(1)) if m else None


def contradiction(f: dict, grams: Decimal | None = None) -> str | None:
    """Why a dish's own figures cannot hold (the audit's high-severity rules), or None. `grams` is the weight the page's basis line
    names, when it names one: the same two weight rules as tools/audit/accuracy_audit.py (macros-exceed-weight, kcal-per-gram)."""
    k, p, c, fat = dec(f["ENERGY"]), dec(f["PROTEIN"]), dec(f["CARBS"]), dec(f["FAT"])
    est = 4 * p + 4 * c + 9 * fat
    if k >= 50 and abs(k - est) / k > Decimal("0.30"):
        return (f"prints {k} cal but its own protein ({p} g), carbohydrate ({c} g) and fat ({fat} g) add up to about {est:.0f} kcal "
                f"({abs(k - est) / k:.0%} apart)")
    if dec(f["SAT FAT"]) > fat + Decimal("0.6"):
        return f"prints saturates {f['SAT FAT']} g above fat {fat} g"
    if dec(f["SUGARS"]) > c + 1:
        return f"prints sugars {f['SUGARS']} g above carbohydrate {c} g (sugars are part of the carbohydrate)"
    if k >= 100 and p * 4 > k * Decimal("1.02"):
        return f"prints protein {p} g, which alone would supply {p * 4:.0f} kcal of {k}"
    if grams:
        macros = p + c + fat
        if macros > grams * Decimal("1.05") + 1:
            more = f" (and {k} cal is {k / grams:.1f} kcal a gram, more than pure fat)" if k / grams > Decimal("9") else ""
            return f"prints protein {p} g, carbohydrate {c} g and fat {fat} g, {macros:.1f} g of macros in a basis of only {grams} g{more}"
        if k / grams > Decimal("9.3"):
            return f"prints {k} cal in a basis of {grams} g, {k / grams:.1f} kcal a gram (pure fat is 9)"
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", type=Path, required=True)
    ap.add_argument("--fetch", action="store_true", help="download what is not cached yet (6 s apart; stops on the first refusal)")
    ap.add_argument("--checked-on", default=date.today().isoformat())
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    fx = Fetcher(args.cache, args.fetch)

    # 1. category pages -> item pages (the list must still be the one this script was written for)
    listing: dict[str, dict] = {}
    for slug_, cat, expected in CATEGORY_PAGES:
        cards = category_items(fx.get(f"{SITE}/category/{slug_}"))
        if len(cards) != expected:
            raise SystemExit(f"category {cat}: {len(cards)} item pages now, expected {expected}: re-read the menu and update this script")
        for url, _name, desc in cards:
            if url in listing:
                raise SystemExit(f"{url} is listed under two categories: update this script")
            listing[url] = {"category": cat, "desc": desc}
    pages = {}
    for url, meta in listing.items():
        d = item_page(fx.get(url), url)
        d["category"] = CATEGORY_OVERRIDE.get(d["name"], meta["category"])
        d["desc"] = meta["desc"]
        if d["name"] in pages:
            raise SystemExit(f"two item pages are named {d['name']!r}")
        if d["basis"] not in BASIS_SERVING:
            raise SystemExit(f"{url}: new basis line {d['basis']!r}: add it to BASIS_SERVING after reading what it means")
        pages[d["name"]] = d
    print(f"{len(pages)} item pages read from {len(CATEGORY_PAGES)} category pages")

    # 2. the allergen chart, the locations and the halal sentence (cross-checks and evidence)
    chart = allergen_chart(fx.get(ALLERGEN_CHART_URL))
    if len(chart) != EXPECTED_CHART_ROWS:
        raise SystemExit(f"the allergen chart lists {len(chart)} items, expected {EXPECTED_CHART_ROWS}")
    unknown = sorted(set(chart) - set(pages))
    if unknown:
        raise SystemExit(f"allergen chart items with no item page: {unknown}")
    locations = fx.get(f"{SITE}/locations")
    branches = len(re.findall(r'class="row location-details-container"', locations))
    if branches < EXPECTED_BRANCHES_AT_LEAST:
        raise SystemExit(f"/locations lists {branches} branches: full-nutrition chains need {EXPECTED_BRANCHES_AT_LEAST}+ sites")
    about = " ".join(htmllib.unescape(re.sub(r"<[^>]+>", " ", fx.get(f"{SITE}/about_us"))).split())
    print(f"{branches} branches on /locations; halal sentence on /about_us: {'present' if HALAL_SENTENCE in about else 'NOT FOUND (check the orchestrator row)'}")

    # 3. decide each page: published / held back / second listing of a product
    zero = {n for n, d in pages.items() if all(dec(v) == 0 for v in d["figures"].values())}
    partial_zero = {n for n, d in pages.items() if dec(d["figures"]["ENERGY"]) == 0 and n not in zero}
    if partial_zero:
        raise SystemExit(f"energy printed 0 but other figures not: {sorted(partial_zero)}")
    sodium_conflict: dict[str, str] = {}
    for dup, base in DUPLICATE_OF.items():
        a, b = pages[dup]["figures"], pages[base]["figures"]
        diff = [k for k in a if a[k] != b[k]]
        if not diff:
            continue
        if diff == ["SODIUM"]:
            sodium_conflict[base] = (f"the chain's '{dup}' page prints sodium {a['SODIUM']} g but its '{base}' page prints {b['SODIUM']} g "
                                     f"for the same wing, so sodium is not published (all other figures are identical on both pages)")
        else:
            raise SystemExit(f"{dup} differs from {base} in {diff}: it is not a plain second listing; decide by hand")
    pool = {n: d for n, d in pages.items() if n not in DUPLICATE_OF and n not in zero}
    by_vector = defaultdict(set)
    for n, d in pool.items():
        by_vector[tuple(d["figures"][h] for h in NUTRIENT_HEADS)].add(n)
    found_groups = [g for g in by_vector.values() if len(g) > 1]
    if sorted(map(sorted, found_groups)) != sorted(sorted(g) for g, _, _ in IDENTICAL_GROUPS):
        raise SystemExit(f"pages with identical figures changed: {sorted(map(sorted, found_groups))}")
    loaded_sodium = {dec(d["figures"]["SODIUM"]) for d in pages.values() if d["category"] == "Loaded" and d["name"] not in zero}
    if not loaded_sodium <= LOADED_SODIUM_SEEN:
        raise SystemExit(f"Loaded dishes now print sodium {sorted(loaded_sodium)}: re-read whether it can be published")

    off_parts: dict[str, str] = {}  # box -> why its figures do not add up to what the chain says it holds
    sums = {}
    for box, (card, parts) in COMPOSITIONS.items():
        if pages[box]["desc"] != card:
            raise SystemExit(f"{box}: the menu card now reads {pages[box]['desc']!r}, not {card!r}: re-read what it holds")
        gaps = []
        for head, label in (("ENERGY", "cal"), ("PROTEIN", "g protein"), ("FAT", "g fat"), ("CARBS", "g carbohydrate")):
            total = sum(dec(pages[part]["figures"][head]) * qty for part, qty in parts)
            printed = dec(pages[box]["figures"][head])
            if abs(total - printed) > max(printed * COMPOSITION_TOLERANCE, Decimal(1)):
                gaps.append(f"{printed} {label} against {total}")
        sums[box] = " + ".join((f"{qty} x " if qty > 1 else "") + pages[part]["figures"]["ENERGY"] for part, qty in parts) \
            + f" = {pages[box]['figures']['ENERGY']} kcal"
        if gaps:
            off_parts[box] = (f"The item page prints {'; '.join(gaps)}, but the pages of what the chain says it holds ('{card}') add up to the "
                              f"second figure each time; the other {len(COMPOSITIONS) - 1} boxes and buckets add up to within 1%, so this page's figures "
                              "cannot be relied on. None is published or corrected.")
    for box in ("Combo Box", "Blaze Box"):
        if box in off_parts:
            raise SystemExit(f"{box} no longer adds up to its parts: the fries decision rests on it; re-read the pages")
    held: dict[str, str] = {}
    for n, d in pages.items():
        if n in DUPLICATE_OF:
            continue
        f = d["figures"]
        if n in zero:
            on_chart = chart.get(n)
            held[n] = ("The item page prints 0 for every figure (no nutrition published)"
                       + ("; the chain's allergen chart lists it as 'Awaiting for more info...'." if on_chart and on_chart["basis"].startswith("Awaiting")
                          else " and no serving; the other drinks print the same zeros."))
            continue
        for grp, keep, reason in IDENTICAL_GROUPS:
            if n in grp and n != keep:
                held[n] = reason.format(name=NAMES.get(n, n), fig=figure_text(f), basis=d["basis"] or "none",
                                        sums=sums["Combo Box"] + "; " + sums["Blaze Box"])
        if n in held:
            continue
        if n in off_parts:
            held[n] = off_parts[n]
            continue
        why = contradiction(f, basis_grams(d["basis"]))
        if why:
            held[n] = f"The item page {why}: the chain's own figures contradict each other, so none is published or corrected."
            continue
        c = chart.get(n)
        if c is not None and (c["energy"] != f"{f['ENERGY']} cal" or c["basis"] != d["basis"]):
            held[n] = (f"The item page prints {f['ENERGY']} cal ({d['basis'] or 'no basis'}) but the chain's allergen chart prints "
                       f"{c['energy'] or 'no energy'} ({c['basis'] or 'no basis'}) for the same item; neither is chosen.")

    # 4. the rows
    rows, holdback = [], []
    ids: set[str] = set()
    for n, d in pages.items():
        if n in DUPLICATE_OF:
            continue
        f = d["figures"]
        name = NAMES.get(n, n)
        item_id = ID_OVERRIDE.get(n, slug(name))
        if item_id in ids:
            raise SystemExit(f"two items would get the id {item_id}")
        ids.add(item_id)
        notes = [d["url"]]
        sodium = ""
        if not PUBLISH_SODIUM:
            notes.append(f"page prints sodium {f['SODIUM']} g: not published (see the script docstring)")
        else:
            sodium = sodium_mg(f["SODIUM"])
            if n not in zero and d["category"] == "Loaded":
                sodium = ""
                notes.append(f"page prints sodium {f['SODIUM']} g; Loaded dishes print 0 or 0.84 whatever the topping, so sodium is not published")
            if dec(f["SODIUM"]) == 0 and n not in zero and sodium != "":
                sodium = ""
                notes.append("page prints sodium 0 g beside a non-zero energy: shown as not published, not as a measured zero")
            if n in sodium_conflict:
                sodium = ""
                notes.append(sodium_conflict[n])
        if n in COMPOSITIONS and n not in off_parts:
            notes.append("adds up to the pages of its parts within 1%")
            if COMPOSITIONS[n][0].rstrip(".").endswith("& Drink"):
                # Found by the independent re-read (16 Oct): the menu card says "& Drink", yet the printed figures equal the food named on the
                # card alone (checked just above, within 1%), so no drink is counted; the chain's drink pages print 0 for every figure.
                notes.append("the menu card says the box comes with a drink, but its figures equal the food named on the card alone: no drink is "
                             "counted (the chain's drink pages print 0 for every figure)")
        if n == "20 BBQ Wings":
            notes.append("listed under Family as '20 BBQ Wings' but the page's basis is one wing; published as the one-wing figures")
        rows.append({"name": name, "id": item_id, "category": d["category"], "serving": BASIS_SERVING[d["basis"]],
                     "calories": f["ENERGY"], "protein_g": f["PROTEIN"], "carbs_g": f["CARBS"], "fat_g": f["FAT"],
                     "sat_fat_g": f["SAT FAT"], "sodium_mg": sodium, "sugar_g": f["SUGARS"],
                     "weight_g": str(basis_grams(d["basis"]) or ""), "rankable": d["category"] not in NOT_RANKABLE, "notes": "; ".join(notes)})
        if n in held:
            holdback.append((item_id, held[n]))
    note = " ".join(NOTE.split())
    if len(note) >= 400:
        raise SystemExit(f"note.txt is {len(note)} characters; the limit is 400")

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Sam's Chicken", cuisine="Chicken", source_title=SOURCE_TITLE.format(checked=args.checked_on),
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=ALIASES, items=rows, out=args.out, note=note, holdback=holdback,
        allergen_guide={"title": ALLERGEN_GUIDE_TITLE.format(checked=args.checked_on), "url": ALLERGEN_CHART_URL,
                        "checked_on": args.checked_on, "may_contain_published": False})
    published = [r for r in rows if r["id"] not in {h for h, _ in holdback}]
    print(f"wrote {out}: {len(rows)} rows, {len(published)} published, {len(holdback)} held back, {len(DUPLICATE_OF)} second listings dropped")
    by_cat = defaultdict(int)
    for r in published:
        by_cat[r["category"]] += 1
    print("published by category:", dict(by_cat))
    fingerprint = hashlib.sha256("".join(f"{u} {fx.sha256(u)}\n" for u in sorted(listing)).encode()).hexdigest()
    print(f"SHA-256 of the allergen chart page: {fx.sha256(ALLERGEN_CHART_URL)}")
    print(f"combined SHA-256 over the {len(listing)} item pages (url + page sha256, sorted): {fingerprint}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
