#!/usr/bin/env python3
"""Build data/source/caffe-nero/ from Caffe Nero UK's website nutrition pages (caffenero.com/uk/menu).

    python3 tools/uk_extract/caffe_nero.py --fetch DIR --checked-on 2026-10-06 --guide guide-gb.pdf   # download pages, extract
    python3 tools/uk_extract/caffe_nero.py --raw DIR --checked-on 2026-10-06 --guide guide-gb.pdf     # re-extract saved pages

Each of the eight menu pages (breakfast, coffee, hot and iced drinks, panini/tostati/Nero Deli, salads/soups/hot pots,
snacks, sweet treats) holds one server-rendered nutrition table per product, per milk option and per size, with a "per
100g" and a "per product" column. Only the "per product" column is used (a per-serving value); kJ flags
disagreements with kcal and is also published as the item's energy_kj (the per-product kJ exactly as printed; the site prints no
serving weight or caffeine). Numbers are copied as printed. The site carries no date.

Scope (Great Britain menu only): products whose name ends "(NI)" are Northern Ireland only and are left out. The chain's
own "Allergen, Nutritional & Ingredient Guide (GB)" PDF (https://caffenerowebsite.blob.core.windows.net/production/data/
menus/caffenero_nutrition_allergens-en_GB.pdf, "Issued: 09/09/26") also marks a few products as selected-stores-only or
airport-only; none of them is on the website pages. `--guide guide.pdf` (that PDF, downloaded) compares every website
number with the dated guide and reports differences (no number from the PDF is written to data/source).

Allergens (docs/DATA.md "Allergens"): every nutrition table on the pages is followed by its own "Allergens:" list, so each
product, milk option and size carries the allergens printed for exactly that variant, e.g. "Gluten (wheat, barley)",
"Nuts (almond)", "Soy", "Sulphur Dioxide" (an empty list = the page names none of the 14). The site prints no "may contain"
information. Those lists are cross-checked against the allergens the same dated guide prints (its counter-food tables and
the ALLERGENS column of its drink tables) wherever the guide prints a row with exactly the same name ("<product> - <milk>"
for drinks, normalised for case, punctuation and spacing). If any checked row disagrees, or one product is printed twice
on the website with different allergens, allergens.csv is NOT written: the chain gets only allergen_guide.csv, a link to
the dated guide (all or nothing), and the run lists every disagreement.

Only names, categories, rankable flags and tags are decided by hand below. If a page gains, loses or renames a product
or option the fingerprint no longer matches and this script stops, so a human re-checks (see EXPECTED_*).
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
import time
import urllib.request
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "caffe-nero"
SOURCE_URL = "https://www.caffenero.com/uk/menu"
GUIDE_URL = "https://caffenerowebsite.blob.core.windows.net/production/data/menus/caffenero_nutrition_allergens-en_GB.pdf"
BASE = "https://www.caffenero.com/uk/menu/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
# page file name -> path under BASE. Order = display order of the pages.
PAGES = {
    "breakfast": "food/breakfast",
    "panini": "food/panini-tostati-nero-deli",
    "salads": "food/salads-soups-hot-pots",
    "snacks": "food/snacks",
    "sweet-treats": "food/sweet-treats",
    "coffee": "coffee",
    "hot-drinks": "drinks/hot-drinks",
    "iced-drinks": "drinks/iced-drinks",
}
# Set after the reviewed run of 2026-10-06; re-set on 2026-10-08 after the website dropped two products (Plant Based Mushroom
# & Tomato Ragu Panini, Cappuccino Cake: 436 -> 434 tables; every other table was unchanged). If the website's products/options change, the script stops: re-check, then update.
EXPECTED_ROWS = 434          # nutrition tables on the eight pages (including Northern Ireland rows and cross-page repeats)
EXPECTED_FINGERPRINT = "d9d64694c9048ff8"  # first 16 hex of sha256 over the sorted page|product|option|size keys

# --- display categories (display order) -------------------------------------------------------------------------
BRK, PAS, SAN, SAL, SNK, CAK = ("Breakfast", "Pastries", "Sandwiches, paninis & tostati", "Salads, soups & hot pots",
                                "Snacks", "Cakes & sweet treats")
COF, HOT, ICE, EXT = "Coffee", "Hot drinks", "Iced drinks", "Extras & toppings"
CATEGORY_ORDER = [BRK, PAS, SAN, SAL, SNK, CAK, COF, HOT, ICE, EXT]
PAGE_DEFAULT = {"breakfast": (BRK, True), "panini": (SAN, True), "salads": (SAL, True), "snacks": (SNK, False),
                "sweet-treats": (CAK, False), "coffee": (COF, False), "hot-drinks": (HOT, False), "iced-drinks": (ICE, False)}
# Product ids (the site's own slugs) that sit on a page but belong elsewhere.
EXTRAS = {"honey", "raspberry-conserve", "strawberry-conserve", "clotted-cream", "whipped-cream",
          "plant-based-creamy-topping", "marshmallows"}
PASTRIES = {"pastel-de-nata", "pistachio-croissant", "almond-croissant", "apricot-croissant", "butter-croissant",
            "cinnamon-swirl", "pain-aux-raisin", "pain-au-chocolat", "raspberry-croissant", "cinnamon-bun"}

# Milk option labels as the site prints them -> wording used in item names (sorted in this order).
MILKS = {"Semi Skimmed Milk": "semi skimmed milk", "Semi Skimmed": "semi skimmed milk", "Skimmed Milk": "skimmed milk",
         "Whole Milk": "whole milk", "Soya": "soya milk", "Oat": "oat milk", "Coconut": "coconut milk",
         "Almond": "almond milk", "Almond Milk": "almond milk", "Alpro Soya": "Alpro soya milk",
         "Alpro Oat": "Alpro oat milk", "Alpro Coconut": "Alpro coconut milk", "Alpro Almond": "Alpro almond milk"}
MILK_ORDER = ["", "semi skimmed milk", "skimmed milk", "whole milk", "soya milk", "oat milk", "coconut milk", "almond milk",
              "Alpro soya milk", "Alpro oat milk", "Alpro coconut milk", "Alpro almond milk"]
SIZE_ORDER = ["", "Single", "Double", "Regular", "Grande"]

# Website milk option label -> the wording the dated guide prints after "<drink> - " (used only to find the guide's row
# for the allergen cross-check; labels not listed here, e.g. "Alpro Soya", are simply not cross-checked).
GUIDE_MILK = {"Semi Skimmed Milk": "Semi Skimmed Milk", "Semi Skimmed": "Semi Skimmed Milk", "Skimmed Milk": "Skimmed Milk",
              "Whole Milk": "Whole Milk", "Soya": "Soya", "Oat": "Oat", "Coconut": "Coconut", "Almond": "Almond",
              "Almond Milk": "Almond"}

# One row, no milk option, but the product text names the milk: the site says "made with whole milk" (and the dated guide's
# "Flat White - Whole Milk" row has the same numbers), so the milk is named in the item.
DEFAULT_MILK = {"flat-white": "Whole Milk"}

# Names where the site's text needs more than "drop NEW" or sentence-casing (everything else is kept as printed).
NAME_OVERRIDES = {"New Forest Feast Matcha Chocolate Almonds": "Forest Feast Matcha Chocolate Almonds",
                  "New Lindor Pistachio bar": "Lindor Pistachio Bar"}

# Items held back (not published, listed in the check report): the site prints impossible or contradicted numbers.
# Keyed by final item name. Nothing is corrected.
HOLDBACK = {
    "Chicken & Mixed Grain Salad":
        "Website prints salt as -4 g per product (a negative amount); the Sept 2026 PDF guide prints 1.30 g.",
    "Banoffee Matcha Latte (oat milk)":
        "Website prints 26.3 g carbohydrate, which does not fit its 232 kcal; the Sept 2026 PDF guide prints 36.3 g. "
        "The two official sources disagree.",
}
# Per-item notes (not exported): odd numbers that are published exactly as printed.
NOTES = {
    "Mocha (whole milk, grande)":
        "Website prints fibre 1.6 g; the Sept 2026 PDF guide prints 26.2 g for this row (sugars 26.2 g repeated).",
    "Spicy Chicken & Red Pepper Focaccia":
        "Salt per product (0.88 g) does not fit the per-100g salt (1.04 g) and the portion size; the website and the "
        "Sept 2026 PDF guide both print 0.88 g.",
    "Feta & Grain Salad":
        "Fat and carbohydrate are both printed as 27.2 g (website and the Sept 2026 PDF guide); calories fit.",
    "Espresso & Caramel Luxury Frappe (oat milk)":
        "Website and the Sept 2026 PDF guide print different values (website 488 kcal, 3.3 g protein, 65.6 g carbs; "
        "guide 491 kcal, 2.5 g, 67.5 g). Website used.",
}

PORK = re.compile(r"\b(bacon|ham|pork|sausage|pancetta|prosciutto|salami|chorizo|nduja|pepperoni)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_UNSPECIFIED = re.compile(r"\b(meatball|meatballs|meat|mince|minced)\b", re.I)
ROW_LABELS = {"Energy (kJ)": "kj", "Energy (kcal)": "calories", "Fat": "fat_g", "Saturated Fat": "sat_fat_g",
              "Carbohydrates": "carbs_g", "Sugars": "sugar_g", "Fibre": "fiber_g", "Protein": "protein_g", "Salt": "salt_g"}
UNITS = {"kj": "kj", "calories": "kcal"}
CELL = re.compile(r"^(<?-?\d+(?:\.\d+)?)\s*(kj|kcal|g)$", re.I)


# --- tiny HTML tree (stdlib only) -----------------------------------------------------------------------------------
class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []

    def text(self) -> str:
        return " ".join("".join(k if isinstance(k, str) else k.text() for k in self.kids).split())

    def walk(self):
        yield self
        for k in self.kids:
            if not isinstance(k, str):
                yield from k.walk()

    def classes(self) -> list[str]:
        return (self.attrs.get("class") or "").split()

    def children(self, tag):
        return [k for k in self.kids if not isinstance(k, str) and k.tag == tag]


class _Parser(HTMLParser):
    VOID = {"img", "br", "col", "input", "meta", "link", "hr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = self.cur = Node("root", [], None)

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in self.VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        c = self.cur
        while c is not None and c.tag != tag:
            c = c.parent
        if c is not None and c.parent is not None:
            self.cur = c.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def parse_html(path: Path) -> Node:
    p = _Parser()
    p.feed(Path(path).read_text(encoding="utf-8"))
    return p.root


# --- reading a page -------------------------------------------------------------------------------------------------
def read_page(page: str, path: Path) -> list[dict]:
    """One dict per nutrition table: page, pid, name, desc, milk, size, badges, values (printed, 'per product')."""
    rows = []
    for prod in parse_html(path).walk():
        if not prod.attrs.get("id", "").startswith("menu__product-details--"):
            continue
        pid = prod.attrs["id"][len("menu__product-details--"):]
        name = next(n for n in prod.walk() if n.tag == "h2").text()
        detail = next(n for n in prod.walk() if "menu__product-detail" in n.classes())
        desc_nodes = detail.children("p")
        desc = desc_nodes[0].text() if desc_nodes else ""
        for opt in [n for n in prod.walk() if "menu__product-detail__options__option" in n.classes()]:
            osum = opt.children("summary")
            milk = osum[0].text() if osum else ""
            for sz in [n for n in opt.walk() if "menu__product-detail__size" in n.classes()]:
                ssum = sz.children("summary")
                size = ssum[0].text() if ssum else ""
                if not milk and size in MILKS:      # site quirk: the default milk's label sits in the size slot
                    milk, size = size, ""
                table = next(n for n in sz.walk() if n.tag == "table")
                head = [th.text().lower() for th in table.walk() if th.tag == "th" and th.attrs.get("scope") == "col"]
                if "per product" not in head:
                    raise SystemExit(f"{page}/{pid}: no 'per product' column ({head}).")
                col = head.index("per product")
                values = {}
                for tr in [n for n in table.walk() if n.tag == "tr"]:
                    th, td = tr.children("th"), tr.children("td")
                    if not th or len(td) != len(head):
                        continue
                    label = th[0].text()
                    if label not in ROW_LABELS:
                        raise SystemExit(f"{page}/{pid}: unknown nutrient row {label!r}.")
                    m = CELL.match(td[col].text())
                    key = ROW_LABELS[label]
                    if not m or (key in UNITS and m.group(2).lower() != UNITS[key]) or (key not in UNITS and m.group(2).lower() != "g"):
                        raise SystemExit(f"{page}/{pid}: cannot read {label} = {td[col].text()!r}.")
                    values[key] = m.group(1)
                badges = sorted(c.rsplit("--", 1)[1] for n in sz.walk() if n.tag == "img" for c in n.classes()
                                if c.startswith("menu__product-badge--"))
                dls = [n for n in sz.walk() if "menu__product-detail__allergens" in n.classes()]
                if len(dls) != 1 or [n.text() for n in dls[0].children("dt")] != ["Allergens:"]:
                    raise SystemExit(f"{page}/{pid}: no single 'Allergens:' list under the {milk or 'only'} {size} table.")
                rows.append({"page": page, "pid": pid, "name": name, "desc": desc, "milk": milk, "size": size,
                             "badges": badges, "values": values,
                             "allergens": [_dd_text(dd) for dd in dls[0].children("dd")]})
    return rows


def _dd_text(dd: Node) -> str:
    """One printed allergen entry without the separating comma, e.g. 'Gluten (wheat, barley)'."""
    parts = [k if isinstance(k, str) else ("" if "comma" in k.classes() else k.text()) for k in dd.kids]
    return " ".join("".join(parts).split())


def site_allergens(printed: list[str], where: str) -> dict:
    """The website's printed list -> allergens dict. 'Gluten (wheat, rye)' names the cereals, 'Nuts (almond)' the nuts; the
    words in brackets must be kinds of the word before them. Unknown words stop the run (common.allergen_words)."""
    contains, cereals, nuts = set(), set(), set()
    for entry in printed:
        m = re.fullmatch(r"([^()]+?)\s*(?:\(([^()]*)\))?", entry)
        if not m:
            raise SystemExit(f"{where}: cannot read the allergen entry {entry!r}.")
        keys, c, n = allergen_words([m.group(1)], where)
        contains |= keys
        cereals |= c
        nuts |= n
        if m.group(2):
            inner, c, n = allergen_words(m.group(2).split(","), where)
            if not inner <= keys:
                raise SystemExit(f"{where}: {entry!r}: the words in brackets are not kinds of {m.group(1)!r}.")
            cereals |= c
            nuts |= n
    return {"contains": contains, "may_contain": set(), "cereals": cereals, "nuts": nuts}


def fetch(outdir: Path) -> dict[str, Path]:
    """Download the eight pages (one request per second) into outdir/<page>.html."""
    outdir.mkdir(parents=True, exist_ok=True)
    out = {}
    for page, path in PAGES.items():
        req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
        with urllib.request.urlopen(req, timeout=60) as r:
            (outdir / f"{page}.html").write_bytes(r.read())
        out[page] = outdir / f"{page}.html"
        time.sleep(1.0)
    return out


# --- building items -------------------------------------------------------------------------------------------------
def clean_name(name: str) -> str:
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    name = re.sub(r"^NEW\s+", "", name)
    return name.title() if name.isupper() else name


def item_name(base: str, milk: str, size: str) -> str:
    parts = [p for p in (MILKS[milk] if milk else "", size.lower()) if p]
    return f"{base} ({', '.join(parts)})" if parts else base


def category_of(page: str, pid: str) -> tuple[str, bool]:
    if pid in EXTRAS:
        return EXT, False
    if pid in PASTRIES:
        return PAS, False
    if page == "coffee" and pid.startswith("iced-"):
        return ICE, False
    return PAGE_DEFAULT[page]


def kj_disagrees(v: dict) -> bool:
    kj, kcal = Decimal(v["kj"].lstrip("<")), Decimal(v["calories"].lstrip("<"))
    return kcal > 0 and abs(kcal * Decimal("4.184") - kj) / kj > Decimal("0.06")


def build(rows: list[dict]):
    fingerprint = hashlib.sha256("\n".join(sorted(f"{r['page']}|{r['pid']}|{r['milk']}|{r['size']}" for r in rows)).encode()).hexdigest()[:16]
    if len(rows) != EXPECTED_ROWS or fingerprint != EXPECTED_FINGERPRINT:
        per_page = {p: len([r for r in rows if r["page"] == p]) for p in PAGES}
        sys.exit(f"The website has {len(rows)} nutrition tables (fingerprint {fingerprint}); this script expects {EXPECTED_ROWS} "
                 f"({EXPECTED_FINGERPRINT}). Tables per page: {per_page}. A product, milk option or size was added, removed or "
                 "renamed: re-check CATEGORY/EXTRAS/PASTRIES/HOLDBACK against the pages, then update EXPECTED_*.")
    excluded_ni, repeats, items, seen, conflicts = [], [], [], {}, []
    for r in rows:
        if r["name"].rstrip().endswith("(NI)"):
            excluded_ni.append(r["name"])
            continue
        base = clean_name(r["name"])
        milk = r["milk"] or DEFAULT_MILK.get(r["pid"], "")
        name = item_name(base, milk, r["size"])
        v = r["values"]
        for need in ("calories", "protein_g", "carbs_g", "fat_g"):
            if need not in v:
                sys.exit(f"{r['page']}/{r['pid']}: {name} has no {need}.")
        allergens = site_allergens(r["allergens"], f"{r['page']}/{r['pid']} {name}")
        if name in seen:
            if seen[name]["values"] != v:
                sys.exit(f"{name!r} appears twice with different numbers ({seen[name]['page']} vs {r['page']}): re-check.")
            if seen[name]["allergens"] != allergens:
                conflicts.append(f"{name}: the {seen[name]['page']} page prints allergens {r_list(seen[name]['allergens'])}, "
                                 f"the {r['page']} page {r_list(allergens)}")
            repeats.append((name, r["page"]))
            continue
        category, rankable = category_of(r["page"], r["pid"])
        text = f"{r['name']} {r['desc']}"
        tags = []
        if "vegetarian" in r["badges"] or "vegan" in r["badges"]:
            tags.append("vegetarian")
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        notes = []
        if kj_disagrees(v):
            notes.append(f"printed kJ ({v['kj']}) and kcal ({v['calories']}) do not agree")
        if name in NOTES:
            notes.append(NOTES[name])
        item = {"id": slug(name), "name": name, "category": category, "serving": r["size"], "calories": v["calories"],
                "protein_g": v["protein_g"], "carbs_g": v["carbs_g"], "fat_g": v["fat_g"], "sat_fat_g": v.get("sat_fat_g", ""),
                "salt_g": v.get("salt_g", ""), "sugar_g": v.get("sugar_g", ""), "fiber_g": v.get("fiber_g", ""),
                "energy_kj": v["kj"], "tags": "|".join(tags), "rankable": rankable, "notes": "; ".join(notes), "allergens": allergens,
                "_milk": milk, "_text": text, "_pid": r["pid"], "_base": base, "_printed_allergens": r["allergens"]}
        seen[name] = {"values": v, "page": r["page"], "allergens": allergens}
        items.append(item)
    ids = [i["id"] for i in items]
    if len(ids) != len(set(ids)):
        sys.exit("duplicate item ids: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    missing = [n for n in HOLDBACK if n not in seen]
    if missing:
        sys.exit(f"HOLDBACK names not found on the pages any more: {missing}")
    # category order, then page order; a product's variants by milk then size
    items.sort(key=lambda i: (CATEGORY_ORDER.index(i["category"]),))
    first = {}
    for n, i in enumerate(items):
        first.setdefault((i["category"], i["_pid"]), n)
    items.sort(key=lambda i: (CATEGORY_ORDER.index(i["category"]), first[(i["category"], i["_pid"])],
                              MILK_ORDER.index(MILKS[i["_milk"]] if i["_milk"] else ""),
                              SIZE_ORDER.index(i["serving"])))
    return items, excluded_ni, repeats, conflicts


def r_list(a: dict) -> str:
    return "[" + ", ".join(sorted(a["contains"])) + "]"


def _norm(name: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", name.lower()).split())


def check_allergens(items: list[dict], guide_rows: list[tuple[str, set[str]]]) -> tuple[int, list[str]]:
    """Compare each item's website allergens with the dated guide's row of exactly the same name (normalised). The guide
    prints some drinks twice (e.g. with and without whipped cream): the website must agree with one of them. Returns the
    number of items checked and the disagreements."""
    by_name: dict[str, list[set[str]]] = {}
    for name, keys in guide_rows:
        by_name.setdefault(_norm(name), []).append(keys)
    checked, problems = 0, []
    for it in items:
        if it["_milk"] and it["_milk"] not in GUIDE_MILK:
            continue
        key = _norm(f"{it['_base']} - {GUIDE_MILK[it['_milk']]}" if it["_milk"] else it["_base"])
        if key not in by_name:
            continue
        checked += 1
        if it["allergens"]["contains"] not in by_name[key]:
            problems.append(f"{it['name']}: website prints {it['_printed_allergens'] or 'none'}; the guide's "
                            f"{key!r} row prints " + " / ".join(str(sorted(k)) for k in by_name[key]))
    return checked, problems


# --- optional cross-check against the dated PDF guide ---------------------------------------------------------------
def compare_with_guide(items: list[dict], pdf: Path) -> None:
    import caffe_nero_pdf
    keys = ["calories", "fat_g", "sat_fat_g", "carbs_g", "sugar_g", "fiber_g", "protein_g", "salt_g"]
    gl = ["Kcal", "Fat", "Sat", "Carbs", "Sugar", "Fibre", "Protein", "Salt"]

    def dec(s):
        m = re.match(r"^<?(-?\d+(?:\.\d+)?)", str(s))
        return Decimal(m.group(1)) if m else None
    guide = [tuple(dec(g["portion"].get(k)) for k in gl) for g in caffe_nero_pdf.read_guide(pdf)]
    exact, near, none = 0, [], []
    for it in items:
        t = tuple(dec(it[k]) for k in keys)
        best, score = None, (-1, 0)
        for g in guide:       # most equal nutrients wins; ties go to the smallest total difference
            s = (sum(1 for a, b in zip(t, g) if a == b), -sum(abs(a - b) for a, b in zip(t, g) if a is not None and b is not None))
            if s > score:
                best, score = g, s
        score = score[0]
        if score == 8:
            exact += 1
        elif score >= 5:
            near.append((it["name"], [f"{k} site {a} / guide {b}" for k, a, b in zip(keys, t, best) if a != b]))
        else:
            none.append(it["name"])
    print(f"\nGuide cross-check (PDF sha256 {sha256_file(pdf)[:16]}, {len(guide)} guide rows): "
          f"{exact} items agree on all 8 nutrients, {len(near)} differ slightly, {len(none)} have no counterpart.")
    for n, d in near:
        print("  differs:", n, "|", "; ".join(d))
    print("  no counterpart in the dated guide (newer or renamed on the website):", "; ".join(none))


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--fetch", type=Path, help="download the eight pages into this folder, then extract")
    g.add_argument("--raw", type=Path, help="extract from pages saved earlier in this folder")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--guide", type=Path, required=True,
                    help="the GB Allergen, Nutritional & Ingredient Guide PDF (GUIDE_URL), to cross-check numbers and allergens")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    folder = args.fetch or args.raw
    paths = fetch(folder) if args.fetch else {p: folder / f"{p}.html" for p in PAGES}
    for p, path in paths.items():
        if not path.exists():
            sys.exit(f"missing {path}")
        print(f"{p:13} sha256 {sha256_file(path)}")
    rows = [r for p, path in paths.items() for r in read_page(p, path)]
    items, excluded_ni, repeats, conflicts = build(rows)

    held = [(slug(n), why) for n, why in HOLDBACK.items()]
    source_title = ("Caffè Nero UK website: product nutrition pages, GB menu (caffenero.com/uk/menu food, coffee, hot and iced "
                    f"drinks pages, retrieved {args.checked_on}; the pages carry no date), cross-checked against the Allergen, "
                    "Nutritional & Ingredient Guide (GB) issued 09/09/26")
    note = ("Values are per product as the chain's website shows them. Drinks are listed by milk; where the chain prints one "
            "row with no cup size, none is shown. Plain Mocha and Hot Chocolate are without whipped cream, which is listed as an extra.")
    import caffe_nero_pdf
    issued = caffe_nero_pdf.issued(args.guide)
    checked, problems = check_allergens(items, caffe_nero_pdf.read_allergens(args.guide))
    problems = conflicts + problems
    if problems:   # all or nothing: the website's lists are not published, the app links to the dated guide
        guide = {"title": f"Caffè Nero Allergen, Nutritional & Ingredient Guide (GB), issued {issued}", "url": GUIDE_URL,
                 "checked_on": args.checked_on, "may_contain_published": False}
    else:
        guide = {"title": ("Caffè Nero UK website: allergens printed with each product, milk and size (caffenero.com/uk/menu "
                           f"pages, retrieved {args.checked_on}), cross-checked against the Allergen, Nutritional & Ingredient "
                           f"Guide (GB) issued {issued}"),
                 "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": False}
    public = [{k: v for k, v in i.items() if not k.startswith("_")} for i in items]
    if problems:
        for i in public:
            i["allergens"] = None
    out = write_chain_folder(chain_id=CHAIN_ID, name="Caffè Nero", cuisine="Coffee", source_title=source_title,
                             source_url=SOURCE_URL, checked_on=args.checked_on,
                             aliases=["caffe nero", "caffè nero", "cafe nero"], items=public, out=args.out, note=note,
                             holdback=held, allergen_guide=guide)
    from collections import Counter
    print(f"\nwrote {len(public)} items ({len(held)} held back) to {out}")
    for c, n in Counter(i["category"] for i in public).items():
        print(f"  {c}: {n}")
    print(f"excluded as Northern Ireland only ({len(excluded_ni)} tables): {sorted(set(excluded_ni))}")
    print(f"identical repeats dropped ({len(repeats)}): {sorted(set(n for n, _ in repeats))}")
    print("kJ/kcal disagree:", [i["name"] for i in public if "do not agree" in i["notes"]])
    print("pork:", sum("contains_pork" in i["tags"] for i in public), " beef:", sum("contains_beef" in i["tags"] for i in public),
          " vegetarian:", sum("vegetarian" in i["tags"] for i in public))
    print("meat type not stated:", sorted({i["name"] for i in items if MEAT_UNSPECIFIED.search(i["_text"])
                                           and "contains_pork" not in i["tags"] and "contains_beef" not in i["tags"]}))
    compare_with_guide(public, args.guide)
    print(f"\nAllergens: {checked} of {len(items)} items have a guide row of the same name and were cross-checked.")
    print("  printed with no allergens:", sorted(i["name"] for i in items if not i["_printed_allergens"]))
    if problems:
        print(f"  NOT PUBLISHED (allergen_guide.csv only, linking {GUIDE_URL}): {len(problems)} disagreement(s):")
        for line in problems:
            print("   ", line)
    else:
        print(f"  allergens.csv written for all {len(items)} items")
    return 0


if __name__ == "__main__":
    sys.exit(main())
