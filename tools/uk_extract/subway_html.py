#!/usr/bin/env python3
"""Build data/source/subway/ from Subway UK's own HTML menu pages (a FULL-NUTRITION chain).

    python3 tools/uk_extract/subway_html.py CACHE_DIR --fetch                         # download the pages politely (about 225 pages, 1 a second)
    python3 tools/uk_extract/subway_html.py CACHE_DIR --checked-on 2026-10-11 [--out DIR] [--no-write]

Replaces the old PDF route. Subway's nutrition PDF is on media.subway.com, whose robots.txt says `Disallow: /`, so that PDF (and the old
data/held-robots/subway/ folder that was built from it) is NEVER read here. Everything below comes from three kinds of page on
https://www.subway.com, all allowed by its robots.txt (checked with robots_rfc.py before every request; the file has one group, `User-agent: *`,
which disallows only /sitecore/ and some /en-us, /en-ca, /fr-ca, /es-us, /en-pr and /es-pr delivery-locator paths; no group names ClaudeBot,
anthropic-ai or any other crawler):
    /robots.txt
    /en-gb/menunutrition/menu              the menu landing page: links to the eight category pages
    /en-gb/menu/category/<id>              a category page: sections of product cards (data-testid="card-list-<product id>")
    /en-gb/menu/product/<id>/              a product page: name, a short description and a "NUTRITION INFO" list (static HTML)
Nothing else is requested: no /sitecore/ path, no script or image files, no other host. One request per page (kept in CACHE_DIR, so a rerun
fetches nothing it already holds), at most one a second, a normal browser User-Agent. 401/403/429 stop the run (never worked round).

What a product page prints (the chain's own words, copied as printed): "Serving Size (g)", "Energy (kcal)", "Fat (g)", "of which saturates (g)",
"Carbohydrate (g)", "Fibre (g)", "of which sugars (g)", "Protein (g)", "Salt (g)", "Energy (kj)". The page does not say what the figures are for
beyond its description ("Create your own Chicken Tikka Sub. Select your cheese, fresh salads, sauces and seasonings.") and the line "Nutritional
may not match product image"; it shows one set of figures, no footlong and no choice of bread or sauce. The chain note says so. The figures here
are never mixed with the September 2026 PDF (they differ from it).

How a product qualifies:
- The page has all of serving size, kcal, fat, carbohydrate and protein as numbers (the other figures are copied when printed as numbers, else blank).
- The page's own name (h1) is the name on its category card (after tidying), otherwise it is left out and listed in the report.
- A name that two different product ids print with DIFFERENT figures is left out (two sets for one name); the same figures twice are one item.
- Allergens: none. The product page has only a link to "Ingredient and Allergen Information" (a separate page that is not read here).
"""
from __future__ import annotations

import argparse
import hashlib
import html as htmllib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from azzurri_html import Blocked, http_get, txt  # noqa: E402
from common import ROOT, sha256_file, write_chain_folder  # noqa: E402

HOST = "https://www.subway.com"
LANDING = "/en-gb/menunutrition/menu"
CHAIN_ID = "subway"


# ------------------------------------------------------------------------------------------------------------------ fetching

def robots_rules(cache: Path) -> list:
    """The `*` rules of www.subway.com/robots.txt. Stops if any group names an AI crawler (the owner's refusal) or the file can't be read."""
    path = cache / "robots.txt"
    if not path.exists():
        status, data = http_get(HOST + "/robots.txt", rules=None, accept="text/plain,*/*;q=0.8")
        if status != 200:
            raise Blocked(f"robots.txt answered HTTP {status}: stopped (not read as 'no rules')")
        path.write_bytes(data)
    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        if line.split("#", 1)[0].strip().lower().startswith("user-agent:"):
            agent = line.split(":", 1)[1].strip().lower()
            if any(w in agent for w in ("claude", "anthropic")):
                raise Blocked(f"robots.txt has a group for {agent!r}: the owner refuses Anthropic's agents; stopped")
    return robots_rfc.parse(text)


def get_cached(cache: Path, rel: str, url_path: str, rules: list) -> str:
    f = cache / rel
    if not f.exists():
        status, data = http_get(HOST + url_path, rules=rules)
        if status != 200:
            raise Blocked(f"{url_path} answered HTTP {status}: stopped")
        f.write_bytes(data)
    return f.read_text(encoding="utf-8", errors="replace")


def categories_from_landing(page: str) -> list[tuple[str, str]]:
    seen: dict[str, str] = {}
    for m in re.finditer(r'<a[^>]*href="/en-gb/menu/category/(\d+)"[^>]*>(.*?)</a>', page, re.S):
        seen.setdefault(m.group(1), txt(m.group(2)))
    return list(seen.items())


def fetch_all(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    rules = robots_rules(cache)
    landing = get_cached(cache, "landing.html", LANDING, rules)
    cats = categories_from_landing(landing)
    if len(cats) < 6:
        raise SystemExit(f"the menu landing page now lists {len(cats)} categories (expected 8): the page has changed shape")
    ids: list[str] = []
    for cid, _name in cats:
        page = get_cached(cache, f"category-{cid}.html", f"/en-gb/menu/category/{cid}", rules)
        for pid in re.findall(r'data-testid="card-list-(\d+)"', page):
            if pid not in ids:
                ids.append(pid)
    print(f"{len(cats)} categories, {len(ids)} product ids", file=sys.stderr)
    for n, pid in enumerate(ids, 1):
        get_cached(cache, f"product-{pid}.html", f"/en-gb/menu/product/{pid}/", rules)
        if n % 25 == 0:
            print(f"  {n}/{len(ids)} product pages", file=sys.stderr)


# ------------------------------------------------------------------------------------------------------------------ parsing

# Category pages as the landing page lists them (id -> label). The script stops if the menu has other categories.
CATEGORIES = {"436": "Subs", "1099": "Saver Subs", "663": "Wraps", "437": "Salads", "1405": "Jacket Potatoes", "1102": "Sides",
              "1105": "Cookies & Treats", "997": "Drinks"}
# These category pages split into sections that are real kinds of food (Footlong Sidekicks, Crisps, Cookies, Bottled Drinks...): the section is the
# item's category. The others (Subs, Wraps, Salads, Jacket Potatoes) split by filling (Deli Classics, Chicken, Veggie...) and keep the page's name.
SECTION_AS_CATEGORY = {"1102", "1105", "997"}
CATEGORY_ORDER = ["Subs", "Saver Subs", "Wraps", "Salads", "Jacket Potatoes", "Sides", "Footlong Sidekicks", "Crisps", "Cookies", "Sweet Treats",
                  "Bottled Drinks", "Hot Drinks", "Dispensed Drinks", "Dips"]
NOT_RANKABLE = {"Crisps", "Cookies", "Sweet Treats", "Bottled Drinks", "Hot Drinks", "Dispensed Drinks", "Dips"}
EXPECTED_PRODUCTS = 212  # unique product ids on the eight category pages on 2026-10-11
NUTRITION_NAMES = {"Serving Size (g)": "serving_g", "Serving Size (ml)": "serving_ml", "Energy (kcal)": "calories", "Fat (g)": "fat_g",
                   "of which saturates (g)": "sat_fat_g", "Carbohydrate (g)": "carbs_g", "Fibre (g)": "fiber_g", "of which sugars (g)": "sugar_g",
                   "Protein (g)": "protein_g", "Salt (g)": "salt_g", "Energy (kj)": "energy_kj"}
NUMBER = re.compile(r"\d+(?:\.\d+)?")

SOURCE_TITLE = ("Subway UK menu pages with nutrition (subway.com/en-gb/menu: category pages and the NUTRITION INFO block of each product page: "
                "Subs, Saver Subs, Wraps, Salads, Jacket Potatoes, Sides, Cookies & Treats, Drinks), read 11 October 2026")
SOURCE_URL = HOST + LANDING
ALIASES = ["subway", "subway uk", "subway sandwiches"]
NOTE = ("Each figure is the one set a Subway UK product page prints, with its serving size. The page does not say which bread, size, cheese, salad or "
        "sauce a sub, wrap or salad includes (it says \"Create your own\" and that nutrition may not match the picture), so your order can differ.")

# Held back by hand: the page prints one entry for a choice of products, so its figures cannot belong to one dish.
HELD_BY_ID = {"9945": "The page is a single entry named Dips with no flavour or description (the sides say 'a dip of your choice'), so its 14 g / 50 kcal "
                      "cannot be tied to one dip."}

_PORK = re.compile(r"\b(bacon|ham|pepperoni|salami|sausages?|pork|chorizo)\b", re.I)
_BEEF = re.compile(r"\b(beef|steak)\b", re.I)
_VEG = re.compile(r"\((?:V|VE)\)|suitable for (?:a )?veg", re.I)  # the page's own mark: "(V) Suitable for vegetarian diet", "(VE) Suitable for vegan diet"


def tidy(s: str) -> str:
    return re.sub(r"\s+", " ", txt(s).replace("\xa0", " ")).strip()


def parse_category(page: str, cid: str) -> list[dict]:
    """The cards of a category page in order: product id, section heading above it, card title."""
    out, section = [], ""
    toks = list(re.finditer(r'<h2 class="category__title"[^>]*>(.*?)</h2>|<button data-testid="card-list-(\d+)"', page, re.S))
    for k, m in enumerate(toks):
        if m.group(1) is not None:
            section = tidy(m.group(1))
            continue
        seg = page[m.start(): toks[k + 1].start() if k + 1 < len(toks) else len(page)]
        title = re.search(r'<h2 class="card__title">(.*?)</h2>', seg, re.S)
        out.append({"pid": m.group(2), "cid": cid, "section": section, "card_title": tidy(title.group(1)) if title else None})
    if not out:
        raise SystemExit(f"category {cid}: no product cards found: the page has changed shape")
    return out


def parse_product(page: str, pid: str) -> dict:
    """Name, description and the NUTRITION INFO list of a product page (values exactly as printed)."""
    title = re.search(r'<h1 class="pdp__header-title"[^>]*>(.*?)</h1>', page, re.S)
    desc = re.search(r'<p class="pdp__header-description"[^>]*>(.*?)</p>', page, re.S)
    block = re.search(r'<div class="nutritionInfo__container">(.*?)</ul></div></div>', page, re.S)
    if not title or not block:
        raise SystemExit(f"product {pid}: no title or no NUTRITION INFO block: the page has changed shape")
    pairs = re.findall(r'<span class="nutritionInfo__name"[^>]*>(.*?)</span><span class="nutritionInfo__value"[^>]*>(.*?)</span>', block.group(1), re.S)
    nut: dict[str, str] = {}
    for name, value in pairs:
        name, value = tidy(name), tidy(value)
        if name not in NUTRITION_NAMES:
            raise SystemExit(f"product {pid}: unknown nutrition row {name!r}: the page has changed shape")
        nut[NUTRITION_NAMES[name]] = value
    need = {"calories", "fat_g", "sat_fat_g", "carbs_g", "fiber_g", "sugar_g", "protein_g", "salt_g", "energy_kj"}
    if not need <= set(nut) or ("serving_g" in nut) == ("serving_ml" in nut):
        raise SystemExit(f"product {pid}: nutrition rows {sorted(nut)} are not the usual set: the page has changed shape")
    return {"pid": pid, "title": tidy(title.group(1)), "desc": tidy(desc.group(1)) if desc else "", "nut": nut}


def display_name(title: str, desc: str, cid: str) -> str:
    """The page's own title, without the 'NEW ' flag; subs, wraps and salads get the word the page's description uses ('Create your own Ham Sub')."""
    name = re.sub(r"^NEW\s+", "", title)
    if cid in ("436", "437", "663"):
        m = re.match(r"(?:Previously known as [^.]*\.\s*)?(?:Create your own|Our recommended)\s+(?:.+?\s+)?(Sub|Salad|Wrap|Toastie)\b", desc)
        if not m:
            raise SystemExit(f"{title!r}: the description {desc[:60]!r} no longer says what kind of product it is")
        if not re.search(r"\b(Sub|Salad|Wrap|Toastie)$", name):
            name = f"{name} {m.group(1)}"
    return name


def number(raw: str) -> float:
    if not NUMBER.fullmatch(raw):
        raise SystemExit(f"a figure is not a plain number: {raw!r}")
    return float(raw)


def integrity_problem(p: dict) -> str | None:
    """A reason to hold a product back when the page's own figures contradict each other (the same limits as tools/audit's high flags)."""
    n = {k: number(v) for k, v in p["nut"].items()}
    serving, unit = (n["serving_g"], "g") if "serving_g" in n else (n["serving_ml"], "ml")
    kcal, protein, carbs, fat = n["calories"], n["protein_g"], n["carbs_g"], n["fat_g"]
    if serving == 0:
        return f"The page prints serving size 0 {unit} and 0 for every figure, i.e. no figures."
    est = 4 * protein + 4 * carbs + 9 * fat
    if kcal >= 50 and abs(kcal - est) / kcal > 0.30:
        return f"Calories {p['nut']['calories']} but protein, carbs and fat on the same page give {est:.0f} kcal ({abs(kcal - est) / kcal:.0%} apart): the page contradicts itself."
    if kcal >= 20 and not 0.85 <= n["energy_kj"] / (kcal * 4.184) <= 1.15:
        return f"{p['nut']['energy_kj']} kJ does not match {p['nut']['calories']} kcal on the same page."
    if n["sat_fat_g"] > fat + 0.6 or n["sugar_g"] > carbs + 1.0:
        return "Saturates exceed fat, or sugars exceed carbohydrate, on the same page."
    macros = protein + carbs + fat
    if unit == "g" and (macros > serving * 1.05 + 1 or kcal / serving > 9.3):
        return f"Protein, carbs and fat ({macros:.0f} g) or {kcal:.0f} kcal cannot fit in a {serving:g} g serving."
    if unit == "ml" and macros > 0.6 * serving:
        return f"{macros:.0f} g of protein, carbs and fat cannot be in a {serving:g} ml drink."
    return None


def read(cache: Path, report: list[str]) -> tuple[list[dict], list[tuple[str, str]], dict]:
    """(items for items.csv, holdback rows, stats). Every published and held-back product is an item; the build leaves out the held-back ones."""
    landing = (cache / "landing.html").read_text(encoding="utf-8")
    cats = dict(categories_from_landing(landing))
    if cats != CATEGORIES:
        raise SystemExit(f"the landing page's categories are now {cats} (expected {CATEGORIES}): re-check CATEGORIES")
    listed: dict[str, dict] = {}
    for cid in CATEGORIES:
        for card in parse_category((cache / f"category-{cid}.html").read_text(encoding="utf-8"), cid):
            prev = listed.get(card["pid"])
            if prev is None or cid == "1099":  # four Saver Subs are also listed under Subs: their own category is the one called Saver Subs
                if prev and prev["card_title"] != card["card_title"]:
                    raise SystemExit(f"product {card['pid']} has two different card titles")
                listed[card["pid"]] = card
    if len(listed) != EXPECTED_PRODUCTS:
        raise SystemExit(f"{len(listed)} products on the category pages (expected {EXPECTED_PRODUCTS}): the menu has changed, re-check the rules and EXPECTED_PRODUCTS")
    products = []
    for pid, card in listed.items():
        p = parse_product((cache / f"product-{pid}.html").read_text(encoding="utf-8"), pid)
        if card["card_title"] != p["title"]:
            raise SystemExit(f"product {pid}: card says {card['card_title']!r} but the page says {p['title']!r}")
        p["card"] = card
        products.append(p)
    # items
    items: list[dict] = []
    by_name: dict[str, list[dict]] = defaultdict(list)
    for p in products:
        card, n = p["card"], p["nut"]
        cid = card["cid"]
        category = card["section"] if cid in SECTION_AS_CATEGORY else CATEGORIES[cid]
        if category not in CATEGORY_ORDER:
            raise SystemExit(f"product {p['pid']} ({p['title']!r}): unknown category {category!r}")
        name = display_name(p["title"], p["desc"], cid)
        unit = "g" if "serving_g" in n else "ml"
        serving_raw = n.get("serving_g", n.get("serving_ml"))
        text = f"{name} {p['desc']}"
        tags = []
        if category != "Crisps":  # a crisp flavour (Roast Beef, Prawn Cocktail) is not an ingredient
            tags += [t for t, rx in (("contains_pork", _PORK), ("contains_beef", _BEEF)) if rx.search(text)]
        if _VEG.search(f"{p['title']} {p['desc']}"):
            tags.append("vegetarian")
        item = {"name": name, "category": category, "serving": f"{serving_raw} {unit}", "calories": n["calories"], "protein_g": n["protein_g"],
                "carbs_g": n["carbs_g"], "fat_g": n["fat_g"], "sat_fat_g": n["sat_fat_g"], "salt_g": n["salt_g"], "sugar_g": n["sugar_g"],
                "fiber_g": n["fiber_g"], "energy_kj": n["energy_kj"], "weight_g": serving_raw if unit == "g" else "", "tags": "|".join(tags),
                "rankable": category not in NOT_RANKABLE and not re.search(r"\b(dunk pot|dips?|sharer)\b", name, re.I),
                "notes": f"product {p['pid']}; listed under {CATEGORIES[cid]}" + (f" > {card['section']}" if card["section"] else ""), "_pid": p["pid"], "_p": p}
        items.append(item)
        by_name[name.lower()].append(item)
    held: dict[str, str] = {}  # pid -> reason
    for pid, why in HELD_BY_ID.items():
        if pid not in listed:
            raise SystemExit(f"HELD_BY_ID names product {pid}, which is no longer listed")
        held[pid] = why
    for it in items:
        why = integrity_problem(it["_p"])
        if why:
            held.setdefault(it["_pid"], why)
    # packs of three cookies against the single cookie: each figure must be about three times the single's
    singles = {it["name"].lower(): it for it in items}
    for it in items:
        m = re.match(r"3x\s+(.+)$", it["name"], re.I) or re.match(r"(.+?)\s+x3$", it["name"], re.I)
        single = singles.get(m.group(1).lower()) if m else None
        if single is None or it["_pid"] in held:
            continue
        for key in ("calories", "protein_g", "carbs_g", "fat_g"):
            want, got = 3 * float(single[key]), float(it[key])
            if abs(got - want) > max(0.15 * want, 1.0):
                held[it["_pid"]] = (f"A pack of three prints {key.replace('_g', '')} {it[key]} but the single ({single['name']}) prints {single[key]} "
                                    f"(three would be about {want:g}): the page's own figures disagree.")
                break
    # a regular and a large of one drink: kcal per g (or ml) must be alike
    sizes: dict[str, dict[str, dict]] = defaultdict(dict)
    for it in items:
        m = re.match(r"(Regular|Large)\s+(.+)$", it["name"])
        if m and it["category"] in ("Hot Drinks", "Dispensed Drinks"):
            sizes[m.group(2).lower()][m.group(1)] = it
    for base, pair in sizes.items():
        if len(pair) == 2 and pair["Regular"]["serving"].split()[1] == pair["Large"]["serving"].split()[1]:
            dens = {k: float(v["calories"]) / float(v["serving"].split()[0]) for k, v in pair.items() if float(v["serving"].split()[0]) > 0}
            if len(dens) == 2 and max(dens.values()) > 1.5 * min(dens.values()):
                for it in pair.values():
                    held.setdefault(it["_pid"], f"Regular and Large {base} differ too much: {pair['Regular']['calories']} kcal in {pair['Regular']['serving']} against "
                                                f"{pair['Large']['calories']} kcal in {pair['Large']['serving']}; the page cannot be right for both, so neither is published.")
    # one name, two products: the same figures twice is one item, different figures are held back (never choose)
    for name, group in by_name.items():
        if len(group) < 2:
            continue
        figures = {tuple(sorted(g["_p"]["nut"].items())) for g in group}
        if len(figures) == 1:
            for g in group[1:]:
                g["_drop"] = True
                report.append(f"duplicate of {group[0]['name']} (product {g['_pid']}) dropped: same figures")
        else:
            for g in group:
                held.setdefault(g["_pid"], f"Two products ({', '.join(x['_pid'] for x in group)}) are both named '{g['name']}' and print different figures; the page does not say which is which.")
    items = [i for i in items if not i.get("_drop")]
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    stats = {"products": len(products), "held": len(held)}
    return items, held, stats


# ------------------------------------------------------------------------------------------------------------------ main

def source_hashes(cache: Path) -> tuple[str, int]:
    """One SHA-256 over 'file sha256' lines of every cached page (sorted by name), and the number of files."""
    files = sorted(f for f in cache.iterdir() if f.suffix in (".html", ".txt") and f.name != "SHA256SUMS")
    lines = [f"{sha256_file(f)}  {f.name}" for f in files]
    (cache / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return hashlib.sha256("\n".join(lines).encode()).hexdigest(), len(files)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cache", type=Path)
    ap.add_argument("--fetch", action="store_true", help="download the pages first (pages already in the cache are not fetched again)")
    ap.add_argument("--checked-on", help="the day the pages were read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.cache)
        print("fetched into", args.cache)
        if not args.checked_on:
            return 0
    if not args.checked_on:
        ap.error("--checked-on is required")
    digest, nfiles = source_hashes(args.cache)
    print(f"{nfiles} cached pages, combined sha256 {digest} (per-file list in {args.cache / 'SHA256SUMS'})")
    print(f"landing.html sha256 {sha256_file(args.cache / 'landing.html')}; robots.txt sha256 {sha256_file(args.cache / 'robots.txt')}")
    report: list[str] = []
    items, held, stats = read(args.cache, report)
    # ids: from the name; two products with one name (both held back) get -2
    seen: Counter = Counter()
    for it in items:
        base = re.sub(r"[^a-z0-9]+", "-", it["name"].lower().replace("&", " and ").replace("'", "").replace("’", "")).strip("-")
        seen[base] += 1
        it["id"] = base if seen[base] == 1 else f"{base}-{seen[base]}"
    holdback = [(it["id"], held[it["_pid"]]) for it in items if it["_pid"] in held]
    for line in report:
        print(line)
    for item_id, why in holdback:
        print(f"held back {item_id}: {why}")
    if args.no_write:
        print(f"would write {len(items)} items, {len(holdback)} of them held back, {len(items) - len(holdback)} published")
        return 0
    out = write_chain_folder(chain_id=CHAIN_ID, name="Subway", cuisine="Sandwiches", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback)
    pub = [i for i in items if i["_pid"] not in held]
    print(f"wrote {len(items)} items to {out}: {len(pub)} published, {len(holdback)} held back; " +
          ", ".join(f"{c} {sum(1 for i in pub if i['category'] == c)}" for c in CATEGORY_ORDER))
    return 0


if __name__ == "__main__":
    sys.exit(main())
