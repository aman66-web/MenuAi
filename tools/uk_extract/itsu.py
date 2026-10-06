#!/usr/bin/env python3
"""Build data/source/itsu/ from itsu UK's official website menu (https://www.itsu.com/menu/).

    python3 tools/uk_extract/itsu.py --fetch /tmp/itsu-raw --checked-on 2026-10-06     # download once (1 request/second), then extract
    python3 tools/uk_extract/itsu.py --raw /tmp/itsu-raw --checked-on 2026-10-06       # re-extract from the saved pages

itsu has no nutrition PDF: the menu page lists every dish, and each dish page carries a "nutrition facts" list with one set of
values for the dish as sold (energy kcal, fat, saturates, protein, carbohydrates, sugars, fibre, salt; no per-100g column, no
date on the pages). tools/uk_extract/itsu_pages.py reads exactly those pages. Numbers are copied as printed (salt is salt, in
grams); the page's own embedded copy of the data is only used to cross-check them (a disagreement beyond rounding stops the
script). Dish names come from the dish page (tidied: capitalised, itsu's joining apostrophe in "rice'bowl" shown as a space).
Only the display categories, the rankable flags, the held-back list and the tag word lists below are typed by hand.

Allergens come from the same dish pages: each prints "contains: ..." and "may contain: ..." (the 14 allergens by name; no
cereal or nut is named). The words are mapped with common.allergen_words (an unknown word stops the script) and must agree with
the page's own embedded copy of the lists, or the script stops. A dish with neither line counts as "none" only when its
embedded lists are present and empty.

The script stops, so a human re-checks, if the menu's set of dishes changes (EXPECTED_PATHS), the categories change, a nutrition
label changes, a dish lacks a required number, or a page failed to load. The menu has no date, so source_title carries the
retrieval date.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import itsu_pages  # noqa: E402
from common import ROOT, allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "itsu"
BASE = "https://www.itsu.com"
SOURCE_URL = BASE + "/menu/"
SOURCE_TITLE = "itsu UK website: menu nutrition facts, per dish (itsu.com/menu dish pages, retrieved {checked_on}; the pages carry no version date)"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# Display categories (in display order) and the site's own category page each one comes from.
RB, NO, SO, SU, GY, BF, DS, HD, CD = ("Rice bowls", "Noodles", "Soups", "Sushi & salads", "Gyoza", "Breakfast",
                                      "Desserts & snacks", "Hot & iced drinks", "Cold drinks")
CATEGORY_ORDER = [RB, NO, SO, SU, GY, BF, DS, HD, CD]
SITE_CATEGORY = {  # site category page -> (display category, rankable by default)
    "/menu/rice-bowls/": (RB, True),
    "/menu/noodles/": (NO, True),
    "/menu/soups/": (SO, True),
    "/menu/sushi-and-salads/": (SU, True),
    "/menu/steamed-gyoza/": (GY, True),
    "/menu/breakfast/": (BF, True),
    "/menu/desserts-and-snacks/": (DS, False),   # snacks, nuts, sweets, kombucha: treats and drinks are never suggested as orders
    "/menu/hot-iced-drinks/": (HD, False),
    "/menu/cold-drinks/": (CD, False),
}
# A curated list of dishes that also live in the categories above; it is not a category of its own.
CURATED_PAGE = "/menu/menu/protein-and-fibre-favourites/"

# Dishes that are not a meal on their own although their category is: freshly baked pastries (like Pret's pastries) are treats.
NOT_RANKABLE = {"/menu/breakfast/coconut-and-pineapple-twist/", "/menu/breakfast/wild-berry-knot/"}

# A name itsu misspells on one dish page while spelling it correctly on the others ("vanilla cappuccino"): only the name changes.
NAME_FIXES = {"Cappucino": "Cappuccino"}

# Dishes held back: the page prints numbers that cannot be right (reason shown in the check report). Nothing is corrected.
HOLDBACK: dict[str, str] = {}

# Dishes whose own page cannot be read: left out (the menu card shows only kcal, never the macros). If the page starts working the
# script publishes the dish normally and prints a reminder to remove it from this list.
UNREADABLE: dict[str, str] = {
    "/menu/noodles/vitality-glass-noodle-bowl/": "itsu's dish page returns HTTP 500 (the menu card prints only 458 kcal, no protein, carbs or fat)",
}

# The set of dishes this script was reviewed against (menu page, 2026-10-06). If itsu adds or removes a dish the script stops.
EXPECTED_PATHS: list[str] = [
    "/menu/breakfast/blueberry-porridge/",
    "/menu/breakfast/blueberry-seeds-porridge/",
    "/menu/breakfast/coconut-and-pineapple-twist/",
    "/menu/breakfast/little-sausages-egg-pot/",
    "/menu/breakfast/mango-yoghurt-pot/",
    "/menu/breakfast/porridge-with-agave/",
    "/menu/breakfast/raspberry-yoghurt-pot/",
    "/menu/breakfast/roasted-bacon-egg-pot/",
    "/menu/breakfast/smoked-salmon-and-avo-egg-pot/",
    "/menu/breakfast/smoked-salmon-and-egg-bun/",
    "/menu/breakfast/soy-roasted-seeds-eggpot/",
    "/menu/breakfast/spinach-and-avo-egg-pot/",
    "/menu/breakfast/spinach-and-seeds-egg-pot/",
    "/menu/breakfast/the-bacon-and-egg-bun/",
    "/menu/breakfast/the-egg-bun/",
    "/menu/breakfast/wild-berry-knot/",
    "/menu/cold-drinks/alcohol-asahi/",
    "/menu/cold-drinks/cocacolacanzero/",
    "/menu/cold-drinks/drinks-can-zen-cucumber-and-mint-2024/",
    "/menu/cold-drinks/drinks-can-zen-water-ginger-and-lime-2024/",
    "/menu/cold-drinks/drinks-can-zen-water-lemon-yuzu-2024/",
    "/menu/cold-drinks/drinks-can-zen-water-peach-lychee-2024/",
    "/menu/cold-drinks/drinks-itsu-sparkling-water-refill/",
    "/menu/cold-drinks/drinks-moju-hot-mango-shot/",
    "/menu/cold-drinks/drinks-raspberry-and-dragon-fruit-zenwater/",
    "/menu/cold-drinks/lemon-bubble-tea/",
    "/menu/cold-drinks/lychee-rose-bubble-tea/",
    "/menu/cold-drinks/mango-passionfruit-bubble-tea/",
    "/menu/cold-drinks/mojugingershot/",
    "/menu/cold-drinks/sparklingwater/",
    "/menu/desserts-and-snacks/angelic-almonds/",
    "/menu/desserts-and-snacks/chocolate-edamame/",
    "/menu/desserts-and-snacks/dark-chocolate-moons/",
    "/menu/desserts-and-snacks/dessert-yuzu-cheesecake-mochi-110926/",
    "/menu/desserts-and-snacks/drinks-fiery-ginger-kombucha/",
    "/menu/desserts-and-snacks/drinks-raspberry-and-elderflower-kombucha/",
    "/menu/desserts-and-snacks/lemon-baked-pistachios/",
    "/menu/desserts-and-snacks/salted-caramel-protein-balls/",
    "/menu/desserts-and-snacks/snacks-about-half-a-mango-160925/",
    "/menu/desserts-and-snacks/snacks-chinese-prawn-crackers/",
    "/menu/desserts-and-snacks/snacks-dark-chocolate-corn-cakes/",
    "/menu/desserts-and-snacks/snacks-katsu-prawn-crackers/",
    "/menu/desserts-and-snacks/snacks-milk-chocolate-corn-cakes/",
    "/menu/desserts-and-snacks/snacks-original-prawn-crackers/",
    "/menu/desserts-and-snacks/snacks-salted-caramel-corn-cakes/",
    "/menu/desserts-and-snacks/snacks-sea-salt-seaweed-thins/",
    "/menu/desserts-and-snacks/snacks-sweet-soy-seaweed-thins/",
    "/menu/desserts-and-snacks/snacks-thai-prawn-crackers/",
    "/menu/desserts-and-snacks/snacks-wasabi-seaweed-thins/",
    "/menu/desserts-and-snacks/sushi-style-nori-crunch/",
    "/menu/desserts-and-snacks/sweet-chilli-toasted-cashews/",
    "/menu/desserts-and-snacks/umami-roasted-almonds/",
    "/menu/drinks-coca-cola-can-diet/",
    "/menu/drinks-coca-cola-can-regular/",
    "/menu/drinks-itsu-still-water-nd/",
    "/menu/drinks-itsu-still-water-refill/",
    "/menu/hot-iced-drinks/americano/",
    "/menu/hot-iced-drinks/blueberry-matcha-latte/",
    "/menu/hot-iced-drinks/cappucino/",
    "/menu/hot-iced-drinks/english-breakfast-tea/",
    "/menu/hot-iced-drinks/espresso/",
    "/menu/hot-iced-drinks/flat-white/",
    "/menu/hot-iced-drinks/green-tea/",
    "/menu/hot-iced-drinks/hot-drinks-jasmine-tea/",
    "/menu/hot-iced-drinks/iced-americano/",
    "/menu/hot-iced-drinks/iced-blueberry-latte/",
    "/menu/hot-iced-drinks/iced-blueberry-matcha-latte/",
    "/menu/hot-iced-drinks/iced-latte/",
    "/menu/hot-iced-drinks/iced-matcha-latte/",
    "/menu/hot-iced-drinks/iced-salted-caramel-latte/",
    "/menu/hot-iced-drinks/iced-salted-caramel-matcha-latte/",
    "/menu/hot-iced-drinks/iced-vanilla-latte/",
    "/menu/hot-iced-drinks/iced-vanilla-matcha-latte/",
    "/menu/hot-iced-drinks/latte/",
    "/menu/hot-iced-drinks/matcha-latte/",
    "/menu/hot-iced-drinks/peppermint-tea/",
    "/menu/hot-iced-drinks/salted-caramel-cappuccino/",
    "/menu/hot-iced-drinks/salted-caramel-latte/",
    "/menu/hot-iced-drinks/salted-caramel-matcha-latte/",
    "/menu/hot-iced-drinks/vanilla-cappuccino/",
    "/menu/hot-iced-drinks/vanilla-latte/",
    "/menu/hot-iced-drinks/vanilla-matcha-latte/",
    "/menu/noodles/chicken-gyoza-noodle-bowl/",
    "/menu/noodles/chilli-chicken-gyoza-noodle-bowl/",
    "/menu/noodles/katsu-curry-noodles/",
    "/menu/noodles/korean-spicy-noodles/",
    "/menu/noodles/thai-noodles/",
    "/menu/noodles/veggie-gyoza-noodle-bowl/",
    "/menu/noodles/vitality-glass-noodle-bowl/",
    "/menu/rice-bowls/chicken-teriyaki/",
    "/menu/rice-bowls/double-chicken-teriyaki/",
    "/menu/rice-bowls/grilled-katsu-chicken-curry/",
    "/menu/rice-bowls/little-chicken-teriyaki/",
    "/menu/rice-bowls/little-grilled-katsu-chicken-curry/",
    "/menu/rice-bowls/little-rice-and-greens/",
    "/menu/rice-bowls/little-spicy-chicken-teriyaki/",
    "/menu/rice-bowls/little-thai-chicken-curry/",
    "/menu/rice-bowls/little-thai-veggie-balls-curry/",
    "/menu/rice-bowls/little-veggie-balls-teriyaki/",
    "/menu/rice-bowls/spicy-chicken-teriyaki/",
    "/menu/rice-bowls/thai-chicken-curry/",
    "/menu/rice-bowls/thai-king-prawn-curry/",
    "/menu/rice-bowls/thai-salmon-curry/",
    "/menu/rice-bowls/thai-veggie-balls-curry/",
    "/menu/rice-bowls/veggie-balls-teriyaki/",
    "/menu/soups/chicken-noodle-soup/",
    "/menu/soups/famous-coconut-chicken-soup/",
    "/menu/soups/hot-chargrilled-chicken-miso-soup-120925/",
    "/menu/soups/hot-detox-miso-noodle-soup-120925/",
    "/menu/soups/hot-king-prawn-miso-soup-120925/",
    "/menu/soups/hot-miso-soup-120925/",
    "/menu/soups/hot-spicy-miso-soup-120925/",
    "/menu/soups/veggie-balls-and-coconut-soup/",
    "/menu/steamed-gyoza/hot-side-chicken-gyoza/",
    "/menu/steamed-gyoza/hot-side-vegetable-gyoza/",
    "/menu/steamed-gyoza/king-prawn-gyoza/",
    "/menu/sushi-and-salads/side-edamame-cup/",
    "/menu/sushi-and-salads/sushi-best-of-itsu/",
    "/menu/sushi-and-salads/the-avo-baby-rolls/",
    "/menu/sushi-and-salads/the-california-rolls/",
    "/menu/sushi-and-salads/the-chicken-bento-salad/",
    "/menu/sushi-and-salads/the-salmon-and-avo-rolls/",
    "/menu/sushi-and-salads/the-salmon-baby-rolls/",
    "/menu/sushi-and-salads/the-salmon-bento-salad/",
    "/menu/sushi-and-salads/the-salmon-dragon/",
    "/menu/sushi-and-salads/the-salmon-full-house/",
    "/menu/sushi-and-salads/the-spicy-tuna-dragon/",
    "/menu/sushi-and-salads/the-super-salmon-light/",
    "/menu/sushi-and-salads/the-sushi-festival/",
    "/menu/sushi-and-salads/the-tuna-and-salmon-sashimi/",
    "/menu/sushi-and-salads/the-tuna-and-salmon-sushi/",
    "/menu/sushi-and-salads/the-veggie-selection/",
    "/menu/sushi-and-salads/tuna-salmon-bento-salad/",
]

PORK = re.compile(r"\b(bacon|ham|pepperoni|sausages?|pork|salami|chorizo|prosciutto|gammon|pancetta|nduja)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT_UNSTATED = re.compile(r"\b(meatballs?|mince|minced|meat|hot dogs?|burgers?|kebabs?|lamb|turkey)\b", re.I)
# Vegetarian only where the dish's own page says so (its description or page title).
VEG_WORDS = re.compile(r"\b(vegan|vegans|vegetarian|plant-based)\b", re.I)
NO_MILK = re.compile(r"kcals? not included", re.I)  # itsu: "with your choice of milk [semi-skimmed or oat, kcals not included below]"
LIMITED = re.compile(r"\b(seasonal|limited[- ]edition|limited[- ]time)\b", re.I)

# Odd values worth a human look (notes are not exported). Nothing here changes a number.
ITEM_NOTES = {
    "coca-cola-zero-sugar": "salt is printed as 0.66 g although the other canned colas print 0: probably a typo on itsu's page, not corrected",
    "edamame": "carbohydrate excludes the 17.4 g of fibre, so kcal is more than 4P+4C+9F (fibre carries about 2 kcal/g)",
    "asahi": "kcal includes the alcohol, which the macros do not",
    "korean-spicy-noodles": "printed 628 kcal but its protein/carbs/fat/fibre add up to about 718 kcal",
    "spinach-and-avo-egg-pot": "printed 204 kcal but its protein/carbs/fat/fibre add up to about 241 kcal",
}

SMALL = {"and", "with", "of", "in", "a", "on", "the", "to", "or", "&"}


def dish_allergens(d: dict, page: str, name: str) -> dict:
    """The dish page's printed "contains" / "may contain" lines, cross-checked with the page's embedded lists."""
    split = lambda text: [w for w in text.split(",") if w.strip()]  # noqa: E731
    contains, cereals, nuts = allergen_words(split(d["contains"]), f"itsu {name} (contains)")
    may, _, _ = allergen_words(split(d["may_contain"]), f"itsu {name} (may contain)")
    emb = itsu_pages.embedded_allergens(page)
    if emb is None:
        raise SystemExit(f"{name}: the page's embedded allergen lists are missing or ambiguous, so the printed lines cannot be checked.")
    e_contains, _, _ = allergen_words(emb[0], f"itsu {name} (embedded contains)")
    e_may, _, _ = allergen_words(emb[1], f"itsu {name} (embedded may contain)")
    if (contains, may) != (e_contains, e_may):
        raise SystemExit(f"{name}: printed allergens {sorted(contains)} / may {sorted(may)} disagree with the page's own data "
                         f"{sorted(e_contains)} / may {sorted(e_may)}: re-check by hand.")
    if contains & may:
        raise SystemExit(f"{name}: {sorted(contains & may)} printed both as contained and as 'may contain'.")
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


def tidy_name(raw: str) -> str:
    """'smoked salmon & avo egg'pot' -> 'Smoked Salmon & Avo Egg Pot'. Only capitalisation and itsu's joining apostrophe change."""
    s = re.sub(r"(?<=[A-Za-z])['’](?=[a-z])", " ", html.unescape(raw))
    s = re.sub(r"\s+", " ", s).strip()
    words = s.split(" ")
    out = []
    for i, w in enumerate(words):
        if w.lower() in SMALL and i > 0:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def get(url: str, must: bytes, tries: int = 4) -> bytes:
    """One polite request (callers keep 1 per second). A page that lacks `must` (itsu sometimes serves an error page with a
    200/500 status) or a transient network failure is retried after a pause."""
    last: Exception | None = None
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if must not in data:
                raise urllib.error.URLError(f"{url} did not contain {must!r}")
            return data
        except (urllib.error.URLError, OSError) as e:  # includes HTTP 5xx and connection resets
            last = e
            time.sleep(3 * (n + 1))
    raise SystemExit(f"Could not fetch {url}: {last}")


def file_for(raw: Path, kind: str, path: str) -> Path:
    return raw / kind / (path.strip("/").replace("/", "__") + ".html")


def fetch_all(raw: Path) -> None:
    """Download the menu page, every category page and every dish page once (a saved, valid page is not fetched again)."""
    (raw / "items").mkdir(parents=True, exist_ok=True)
    (raw / "cats").mkdir(parents=True, exist_ok=True)
    menu = get(SOURCE_URL, b"product-listing-card")
    (raw / "menu.html").write_bytes(menu)
    text = menu.decode("utf-8", "replace")
    jobs = [("items", c["path"], b"energy (kcal)") for c in itsu_pages.menu_cards(text)]
    jobs += [("cats", p, b"product-listing-card") for p in itsu_pages.category_links(text)]
    for kind, path, must in jobs:
        dest = file_for(raw, kind, path)
        if dest.exists():
            if must in dest.read_bytes():
                continue
            dest.unlink()  # an earlier error page
        time.sleep(1.0)
        try:
            dest.write_bytes(get(BASE + path, must))
        except SystemExit as e:
            if path not in UNREADABLE:
                raise
            print(f"warning: {path} could not be read ({UNREADABLE[path]}): {e}", file=sys.stderr)


def read_raw(raw: Path) -> tuple[list[dict], dict[str, set[str]], str]:
    """-> (cards in menu order, category page -> set of dish paths, combined SHA-256 of every page read)."""
    menu_file = raw / "menu.html"
    if not menu_file.exists():
        raise SystemExit(f"{menu_file} is missing: run with --fetch first.")
    menu = menu_file.read_text(encoding="utf-8", errors="replace")
    cards = itsu_pages.menu_cards(menu)
    cats: dict[str, set[str]] = {}
    for p in itsu_pages.category_links(menu):
        f = file_for(raw, "cats", p)
        if not f.exists():
            raise SystemExit(f"Category page {p} is missing from {raw}: run with --fetch.")
        cats[p] = {c["path"] for c in itsu_pages.menu_cards(f.read_text(encoding="utf-8", errors="replace"))}
    sums = [("menu.html", hashlib.sha256(menu_file.read_bytes()).hexdigest())]
    for sub in ("cats", "items"):
        for f in sorted((raw / sub).glob("*.html")):
            sums.append((f"{sub}/{f.name}", hashlib.sha256(f.read_bytes()).hexdigest()))
    (raw / "SHA256SUMS").write_text("".join(f"{h}  {n}\n" for n, h in sums), encoding="utf-8")
    combined = hashlib.sha256("".join(f"{h}  {n}\n" for n, h in sums).encode()).hexdigest()
    return cards, cats, combined


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--fetch", type=Path, metavar="DIR", help="download the menu, category and dish pages once into DIR, then extract")
    g.add_argument("--raw", type=Path, metavar="DIR", help="extract from pages already saved in DIR")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    raw = args.fetch or args.raw
    if args.fetch:
        fetch_all(raw)
    cards, cats, combined = read_raw(raw)

    paths = [c["path"] for c in cards]
    if len(set(paths)) != len(paths):
        raise SystemExit("The menu page lists a dish twice: re-check the source.")
    if sorted(paths) != sorted(EXPECTED_PATHS):
        added, removed = sorted(set(paths) - set(EXPECTED_PATHS)), sorted(set(EXPECTED_PATHS) - set(paths))
        print(f"The menu's dishes changed (expected {len(EXPECTED_PATHS)}, found {len(paths)}).\n  new: {added}\n  gone: {removed}\n"
              "Review the new dishes (category, rankable) and update EXPECTED_PATHS before running again.", file=sys.stderr)
        return 1
    unknown_cats = [p for p in cats if p not in SITE_CATEGORY and p != CURATED_PAGE]
    if unknown_cats:
        print(f"New or changed menu category pages {unknown_cats}: add them to SITE_CATEGORY (or stop if they are not food).", file=sys.stderr)
        return 1

    items, excluded, log = [], [], []
    seen_names: dict[str, str] = {}
    for card in cards:
        path = card["path"]
        homes = [c for c, members in cats.items() if c in SITE_CATEGORY and path in members]
        if len(homes) != 1:
            raise SystemExit(f"{path} is on {len(homes)} category pages ({homes}); expected exactly one: re-check the source.")
        category, rankable = SITE_CATEGORY[homes[0]]
        page_file = file_for(raw, "items", path)
        if not page_file.exists() and path in UNREADABLE:
            excluded.append((tidy_name(card["title"]), path, UNREADABLE[path]))
            continue
        if path in UNREADABLE:
            print(f"note: {path} can be read now; remove it from UNREADABLE.", file=sys.stderr)
        page_text = page_file.read_text(encoding="utf-8", errors="replace")
        d = itsu_pages.read_item(page_text)
        name = tidy_name(d["name"])
        name = NAME_FIXES.get(name, name)
        printed = d["printed"]
        if d["kcal_header"] != f"{printed.get('kcal', '?')} kcal":
            raise SystemExit(f"{name}: the page header says {d['kcal_header']!r} but its table says {printed.get('kcal')!r}.")
        for k, v in printed.items():
            if not itsu_pages.NUM.match(v):
                raise SystemExit(f"{name}: {k} is printed as {v!r}, not a number.")
            e = d["embedded"].get(k)
            if e not in (None, "") and abs(float(e) - float(v)) > 0.0051:
                raise SystemExit(f"{name}: {k} printed {v} but the page's own data says {e}: re-check by hand.")
        missing = [k for k in ("kcal", "fat", "protein", "carbs") if k not in printed]
        if missing:
            excluded.append((name, path, f"required nutrient not printed: {', '.join(missing)}"))
            continue
        item_id = slug(name)
        if name.lower() in seen_names:
            raise SystemExit(f"Two dishes are called {name!r} ({seen_names[name.lower()]} and {path}): re-check the source.")
        seen_names[name.lower()] = path
        text = f"{d['name']} {d['ingredients']}"
        pork, beef = PORK.search(text), BEEF.search(text)
        veg = VEG_WORDS.search(f"{d['description']} {d['title']}")
        tags = []
        if veg:
            tags.append("vegetarian")
        elif pork or beef:
            if pork:
                tags.append("contains_pork")
            if beef:
                tags.append("contains_beef")
        if not veg and not pork and not beef and MEAT_UNSTATED.search(text):
            log.append((name, MEAT_UNSTATED.search(text).group(0)))
        if veg and (pork or beef):
            log.append((name, f"marked vegetarian/vegan by itsu but the text mentions {(pork or beef).group(0)!r}: not tagged"))
            tags = []
        notes = []
        calc = 4 * float(printed["protein"]) + 4 * float(printed["carbs"]) + 9 * float(printed["fat"]) + 2 * float(printed.get("fibre") or 0)
        if item_id not in ITEM_NOTES and abs(calc - float(printed["kcal"])) > max(0.12 * float(printed["kcal"]), 8):
            notes.append(f"printed {printed['kcal']} kcal but its own protein/carbs/fat/fibre add up to about {calc:.0f} kcal")
        serving = "milk not included" if NO_MILK.search(d["description"]) else ""
        if sum(printed.get(k) == "0.5" for k in ("protein", "carbs", "fat", "fibre", "sugars")) >= 3:
            notes.append('protein, carbs, fat, fibre and sugars are all printed as 0.5 (itsu may mean "<0.5")')
        if item_id in ITEM_NOTES:
            notes.append(ITEM_NOTES[item_id])
        if float(printed.get("sugars") or 0) > float(printed["carbs"]) + 1e-9:
            notes.append(f"sugars ({printed['sugars']}) printed higher than carbohydrate ({printed['carbs']})")
        if serving:
            notes.append("itsu's own description says the milk's kcals are not included in these values")
        limited = bool(LIMITED.search(f"{d['name']} {d['description']}"))
        items.append({
            "id": item_id, "name": name, "category": category, "serving": serving,
            "calories": printed["kcal"], "protein_g": printed["protein"], "carbs_g": printed["carbs"], "fat_g": printed["fat"],
            "sat_fat_g": printed.get("sat", ""), "sodium_mg": "", "salt_g": printed.get("salt", ""), "sugar_g": printed.get("sugars", ""),
            "fiber_g": printed.get("fibre", ""), "tags": "|".join(tags), "limited_time": limited,
            "rankable": rankable and path not in NOT_RANKABLE, "notes": "; ".join(notes),
            "allergens": dish_allergens(d, page_text, name),
        })
    if excluded:
        print("Dishes left out:", file=sys.stderr)
        for n, p, why in excluded:
            print(f"  {n} ({p}): {why}", file=sys.stderr)
    ids = [i["id"] for i in items]
    stale = [h for h in HOLDBACK if h not in ids]
    if stale:
        raise SystemExit(f"HOLDBACK names dishes that are not on the menu any more: {stale}")
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))

    note = ("Per dish, as itsu prints it. Milky coffee, matcha and tea drinks are shown without the milk (itsu's values leave it out). "
            "Sushi values leave out the bottle of soy sauce that comes with it, per itsu's own page copy.")
    write_chain_folder(
        chain_id=CHAIN_ID, name="itsu", cuisine="Japanese", source_title=SOURCE_TITLE.format(checked_on=args.checked_on),
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["itsu", "itsu uk"], items=items, out=args.out, note=note,
        holdback=[(i, HOLDBACK[i]) for i in ids if i in HOLDBACK],
        allergen_guide={"title": f"itsu UK website: allergens on each menu dish page (itsu.com/menu, read {args.checked_on})",
                        "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"wrote {len(items)} items ({len(HOLDBACK)} held back) to {args.out}; combined SHA-256 of the {len(list((raw / 'items').glob('*.html')))} "
          f"dish pages, {len(cats)} category pages and the menu page: {combined}")
    for n, w in log:
        print(f"  meat type not stated / flag: {n}: {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
