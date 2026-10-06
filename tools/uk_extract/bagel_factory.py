#!/usr/bin/env python3
"""Build data/source/bagel-factory/ from Bagel Factory's own website (bagelfactory.co.uk).

    python3 tools/uk_extract/bagel_factory.py --checked-on 2026-10-06 [--cache DIR] [--out DIR]

Source: https://bagelfactory.co.uk/menu/ lists the bagels; each bagel's own page (/menu/<slug>/) prints
"Nutrition Facts per portion" (kcal, kJ, fat, saturates, carbohydrates, sugars, fibre, protein, salt). The /menu/ listing
page also carries the same blocks, but they are inside HTML comments (switched off, and out of date), so this script strips
every HTML comment and reads ONLY the live block on each bagel's page. Per-100 g blocks are ignored.

Numbers are copied exactly as printed (units removed); the printed kJ goes to energy_kj (the pages print no serving weight,
mono/poly/trans fat or caffeine). Only names, categories, servings, rankable and the pork/beef tags
are typed by hand in ROWS below. The categories and the vegetarian tag come from the chain's own filter pages
(/menu/breakfast/, /cream-cheese/, /deli/, /gluten-free/, /seafood/, /spread/, /veggie/ = "Veggie & Vegan").

The script STOPS (exit 1, nothing written) if: the set of bagels on /menu/ changes; a bagel's printed name changes; a
nutrition block is not the expected nine rows; the "plain bagel bun" statement appears or disappears; a filter page's
members differ from the table; or the pork/beef tags no longer match the ingredient text. Then re-check ROWS by hand.

--cache DIR keeps the downloaded pages (menu.html, items/<slug>.html, filters/<filter>.html, allergen-guide.pdf) so a re-run
does not download again; files already there are read instead of fetched. Downloads are one request per second.

Allergens (docs/DATA.md "Allergens"): the chain's allergen information is its "Ingredient List" PDF, linked from /menu/ as
"VIEW OUR ALLERGENS" (it says "For allergens, see ingredients in BOLD"; it prints no per-item "may contain"). It cannot be
tied to the published items, so only allergen_guide.csv is written (the app links to the guide) and no allergens.csv:
  * most of its item names differ from the bagel pages' names ("Mini Bacon Bagel" vs "BACON MINI", "Bacon & Egg Bagel" vs
    "BACON AND EGG", "Tuna Melt" vs "TUNA MELT BAGEL", ...); items are matched by exact name only, never by a hand-made map;
  * its filled bagels start "BAGEL BUN OF CUSTOMER CHOICE", so an entry does not name the bun's allergens, while our numbers are
    for a bagel made with the plain bun.
The script reads the guide's issue and date from the PDF for the guide's title and prints how many items have an exact-name
entry, so a later guide that lines up can be re-checked. Needs `pdftotext` (poppler).
"""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "bagel-factory"
BASE = "https://bagelfactory.co.uk"
MENU_URL = f"{BASE}/menu/"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
SOURCE_TITLE = "Bagel Factory website menu: Nutrition Facts per portion on each bagel's page ({dates})"  # dates read from the pages

# Chain filter pages -> our category (the chain's own grouping; every bagel is in exactly one).
FILTERS = {
    "breakfast": "Breakfast",
    "cream-cheese": "Cream Cheese",
    "deli": "Deli",
    "gluten-free": "Gluten Free",
    "seafood": "Seafood",
    "spread": "Spreads",
    "veggie": "Veggie & Vegan",
}
VEGETARIAN_FILTER = "veggie"  # the chain's own "Veggie & Vegan" filter is its vegetarian/vegan marking

STD = "1 bagel (plain bun)"      # the page says: "Nutritional values refer to a bagel prepared with a plain bagel bun"
MINI = "1 mini bagel"
GFBOX = "1 bagel box"

# slug -> (name as printed on the page, tidy name, serving, plain-bun statement printed, pork, beef, note)
# Listed in the chain's category order, and within a category in the order of the chain's own filter page.
ROWS: dict[str, tuple] = {
    # Breakfast
    "sausage-bagel": ("SAUSAGE BAGEL", "Sausage Bagel", STD, True, True, False, ""),
    "veggie-breakfast": ("VEGGIE BREAKFAST", "Veggie Breakfast", STD, True, False, False, ""),
    "bacon-bagel-mini": ("BACON MINI", "Bacon Mini", MINI, False, True, False, ""),
    "bacon-and-egg": ("BACON AND EGG", "Bacon and Egg", STD, True, True, False,
                      "Printed 589 kcal but 2062 kJ (= about 493 kcal) and macros that add up to about 482 kcal: held back"),
    "sausage-and-egg": ("SAUSAGE AND EGG", "Sausage and Egg", STD, True, True, False,
                        "Page says 'Nutritional values are referred to a bagel prepared with a plain bagel bun'"),
    "bacon-bagel": ("BACON", "Bacon", STD, True, True, False, ""),
    # Cream Cheese
    "cream-cheese-bagel-2": ("CREAM CHEESE", "Cream Cheese", STD, True, False, False,
                             "Every number is identical to Garlic & Herbs Cream Cheese"),
    "garlic-herbs-cream-cheese-bagel": ("GARLIC & HERBS CREAM CHEESE", "Garlic & Herbs Cream Cheese", STD, True, False, False,
                                        "Every number is identical to Cream Cheese"),
    "vegan-cream-cheese-bagel": ("VEGAN CREAM CHEESE", "Vegan Cream Cheese", STD, True, False, False, ""),
    # Deli
    "smoky-pulled-pork-2": ("SMOKY PULLED PORK", "Smoky Pulled Pork", STD, True, True, False, ""),
    "chicken-avocado": ("Chicken & Avocado", "Chicken & Avocado", STD, True, False, False, ""),
    "salt-beef-melt": ("SALT BEEF MELT", "Salt Beef Melt", STD, True, False, True, ""),
    "chicken-club": ("CHICKEN CLUB", "Chicken Club", STD, True, True, False, ""),
    # Gluten Free (own gluten-free bun; no plain-bun statement on these pages)
    "gluten-free-bagel-box-salmon-cream-cheese": ("GLUTEN FREE BAGEL BOX WITH AVOCADO & VEGAN CREAM CHEESE",
                                                  "Gluten Free Bagel Box with Avocado & Vegan Cream Cheese", GFBOX, False, False, False,
                                                  "The page's web address says salmon, but its title and ingredients are avocado and vegan cream cheese"),
    "gluten-free-box-salmon-cream-cheese": ("GLUTEN FREE BAGEL BOX WITH SALMON & CREAM CHEESE",
                                            "Gluten Free Bagel Box with Salmon & Cream Cheese", GFBOX, False, False, False, ""),
    # Seafood
    "the-new-yorker": ("The New Yorker", "The New Yorker", STD, True, False, False, ""),
    "tuna-melt-bagel": ("TUNA MELT BAGEL", "Tuna Melt Bagel", STD, True, False, False, ""),
    "the-classic": ("THE CLASSIC", "The Classic", STD, True, False, False, ""),
    "salmon-avocado": ("SALMON & AVOCADO", "Salmon & Avocado", STD, True, False, False, ""),
    "the-classic-mini-bagel": ("THE CLASSIC MINI", "The Classic Mini", MINI, False, False, False, ""),
    # Spreads
    "nutella-bagel": ("NUTELLA BAGEL", "Nutella Bagel", STD, True, False, False, ""),
    "strawberry-jam-bagel": ("STRAWBERRY JAM", "Strawberry Jam", STD, True, False, False,
                             "Carbohydrate is much higher than sugars: the jam is sweetened with sorbitol (a polyol)"),
    "peanut-butter": ("PEANUT BUTTER", "Peanut Butter", STD, True, False, False, ""),
    # Veggie & Vegan
    "honey-heat-halloumi": ("Honey Heat Halloumi", "Honey Heat Halloumi", STD, True, False, False, ""),
    "halloumi-melt": ("HALLOUMI MELT", "Halloumi Melt", STD, True, False, False, ""),
    "mini-vegan-cream-cheese-stack": ("VEGAN CREAM CHEESE STACK MINI", "Vegan Cream Cheese Stack Mini", MINI, False, False, False,
                                      "Page last modified 2025-09-16 (the others 2026); it also prints a per-100 g block, not used"),
    "vegan-cream-cheese-stack": ("VEGAN CREAM CHEESE STACK", "Vegan Cream Cheese Stack", STD, True, False, False, ""),
}

# Items the chain's own page prints inconsistently. Nothing is corrected; the item is left out of the menu.
HOLDBACK = {
    "bacon-and-egg": "The page prints 589 kcal; its own macros add up to about 482 kcal and its kJ (2,062) to about 493 kcal.",
}

NOTE = ("Values are for each bagel as made with a plain bagel bun; Bagel Factory lets you choose another bun, which changes "
        "the numbers. Minis and gluten-free boxes are as listed with their own bun. Drinks have no published nutrition.")

LABELS = ["Energy (Kcal)", "Energy (Kj)", "Fat", "of which Saturates", "Carbohydrates", "of which Sugars", "Fibre", "Protein", "Salt"]
# The allergen guide /menu/ links as "VIEW OUR ALLERGENS" (the script stops if the link changes).
ALLERGEN_URL = f"{BASE}/wp-content/uploads/Full-Ingredient-List.pdf"
ALLERGEN_TITLE = "Bagel Factory Ingredient List, allergens in bold (Issue {issue}, {date})"  # issue and date read from the PDF
PORK = re.compile(r"\b(bacon|ham|pepperoni|sausage|pork|salami|chorizo)\b", re.I)
BEEF = re.compile(r"\b(beef|steak|brisket)\b", re.I)


class Stop(Exception):
    pass


class Fetcher:
    def __init__(self, cache: Path | None):
        self.cache, self.last, self.fetched = cache, 0.0, 0

    def get(self, url: str, rel: str) -> str:
        return self.get_bytes(url, rel).decode("utf-8")

    def get_bytes(self, url: str, rel: str) -> bytes:
        if self.cache and (self.cache / rel).exists():
            return (self.cache / rel).read_bytes()
        wait = 1.1 - (time.monotonic() - self.last)  # one request per second at most
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        self.last, self.fetched = time.monotonic(), self.fetched + 1
        if self.cache:
            (self.cache / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.cache / rel).write_bytes(data)
        return data


def strip_comments(page: str) -> str:
    return re.sub(r"<!--.*?-->", "", page, flags=re.S)


def listing_slugs(page: str) -> list[str]:
    """Bagel slugs in page order. Cards without a link (the three drinks) are not bagels."""
    out = []
    for card in re.findall(r"<article>(.*?)</article>", strip_comments(page), re.S):
        m = re.search(r'href="' + re.escape(BASE) + r'/menu/([^"/]+)/"', card)
        if m:
            out.append(m.group(1))
    return out


def parse_item(page: str, slug_: str) -> dict:
    live = strip_comments(page)
    title = re.search(r'<h2 class="text-4xl md:text-6xl hidden">(.*?)</h2>', live, re.S)
    if not title:
        raise Stop(f"{slug_}: no page title found")
    blocks = re.findall(r'<strong class="uppercase text-xl">Nutrition Facts per portion</strong></p>\s*<ul[^>]*>(.*?)</ul>', live, re.S)
    if len(blocks) != 1:
        raise Stop(f"{slug_}: found {len(blocks)} 'per portion' blocks, expected 1")
    pairs = [(html.unescape(a).strip(), html.unescape(b).strip())
             for a, b in re.findall(r"<li[^>]*><span>(.*?)</span><span>(.*?)</span></li>", blocks[0], re.S)]
    if [a for a, _ in pairs] != LABELS:
        raise Stop(f"{slug_}: the nutrition rows are not the expected nine: {[a for a, _ in pairs]}")
    vals = {}
    for (label, raw), unit in zip(pairs, ["kcal", "kj"] + ["g"] * 7):
        m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*" + unit, raw, re.I)
        if not m:
            raise Stop(f"{slug_}: {label!r} is {raw!r}, expected a number in {unit}")
        vals[label] = m.group(1)  # exactly as printed
    # ingredients and the "plain bagel bun" sentence: everything from the ingredients column up to the nutrition block
    start = live.find('<div class="text-sm w-full lg:w-1/2">')
    end = live.find("Nutrition Facts per portion")
    if start < 0 or end < start:
        raise Stop(f"{slug_}: the ingredients column was not found before the nutrition block")
    ingredients = html.unescape(re.sub(r"<[^>]+>", " ", live[start:end]))
    date = re.search(r'"dateModified":"([^"]+)"', page)
    return {
        "printed_name": html.unescape(title.group(1)).strip(),
        "vals": vals,
        "ingredients": re.sub(r"\s+", " ", ingredients),
        "plain_bun": bool(re.search(r"Nutritional values (?:are )?(?:refer|referred) to a bagel prepared with a plain bagel bun", re.sub(r"\s+", " ", ingredients))),
        "modified": date.group(1)[:10] if date else "",
    }


def allergen_guide_text(pdf: bytes) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "guide.pdf"
        path.write_bytes(pdf)
        out = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, check=True)
    return out.stdout


def read_allergen_guide(text: str) -> tuple[str, str, list[str]]:
    """-> (issue, date, the guide's names for its filled bagels, minis and gluten-free boxes). Stops if the guide no longer
    says that allergens are shown in bold or carries no issue/date."""
    if "For allergens, see ingredients in BOLD" not in text:
        raise Stop("the allergen guide no longer says 'For allergens, see ingredients in BOLD': re-check how it shows allergens")
    issues = set(re.findall(r"ISSUE (\d+) DATE (\d\d/\d\d/\d{4})", text))
    if len(issues) != 1:
        raise Stop(f"the allergen guide's issue/date is not one clear value: {sorted(issues)}")
    (issue, date), = issues
    lines = text.split("\n")
    fillings = ("BAGEL BUN OF CUSTOMER CHOICE", "PLAIN MINI BAGEL BUN", "GLUTEN-FREE PLAIN BAGEL")
    names = [re.sub(r"(,?\s+(V|VG|H))+$", "", line).strip()
             for line, nxt in zip(lines, lines[1:] + [""]) if line and not line[0].isspace() and nxt.startswith(fillings)]
    return issue, date, names


def norm_name(name: str) -> str:
    """Exact-name comparison: case, punctuation and spaces only."""
    return re.sub(r"[^a-z0-9]+", "", html.unescape(name).lower())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    ap.add_argument("--cache", type=Path, help="folder to keep/read downloaded pages (menu.html, items/, filters/)")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()
    fetch = Fetcher(args.cache)
    try:
        menu = fetch.get(MENU_URL, "menu.html")
        found = listing_slugs(menu)
        if sorted(found) != sorted(ROWS) or len(found) != len(set(found)):
            raise Stop("the bagels on /menu/ changed.\n  new on the site: %s\n  gone from the site: %s\n"
                       "Re-check ROWS (names, serving, pork/beef) against the pages, then run again."
                       % (sorted(set(found) - set(ROWS)), sorted(set(ROWS) - set(found))))
        # categories and vegetarian marking from the chain's own filter pages
        category, vegetarian = {}, set()
        for f, cat in FILTERS.items():
            members = listing_slugs(fetch.get(f"{BASE}/menu/{f}/", f"filters/{f}.html"))
            for s in members:
                if s not in ROWS:
                    raise Stop(f"filter {f!r} lists {s!r}, which is not in ROWS")
                if s in category:
                    raise Stop(f"{s!r} is in two filters ({category[s]!r} and {cat!r}): decide its category by hand")
                category[s] = cat
                if f == VEGETARIAN_FILTER:
                    vegetarian.add(s)
        if set(category) != set(ROWS):
            raise Stop(f"bagels in no filter page: {sorted(set(ROWS) - set(category))}")
        # the order of ROWS must follow the filter bar, so categories keep the chain's order
        cat_order = [category[s] for s in ROWS]
        firsts = list(dict.fromkeys(cat_order))
        if firsts != list(FILTERS.values()) or cat_order != sorted(cat_order, key=firsts.index):
            raise Stop("ROWS is not grouped in the filter bar's order: " + str(firsts))

        items, anomalies, shas, modified = [], [], {}, []
        for s, (printed, name, serving, plain, pork, beef, note) in ROWS.items():
            page = fetch.get(f"{BASE}/menu/{s}/", f"items/{s}.html")
            shas[s] = hashlib.sha256(page.encode("utf-8")).hexdigest()
            got = parse_item(page, s)
            if got["printed_name"] != printed:
                raise Stop(f"{s}: the page title is now {got['printed_name']!r}, ROWS has {printed!r}")
            if got["plain_bun"] != plain:
                raise Stop(f"{s}: the 'plain bagel bun' statement is {'now' if got['plain_bun'] else 'no longer'} on the page; "
                           "the serving text depends on it")
            if bool(PORK.search(got["ingredients"])) != pork or bool(BEEF.search(got["ingredients"])) != beef:
                raise Stop(f"{s}: the ingredients no longer match the pork/beef tags in ROWS: {got['ingredients'][:200]}")
            modified.append(got["modified"])
            v = got["vals"]
            kj_as_kcal = float(v["Energy (Kj)"]) / 4.184
            if abs(kj_as_kcal - float(v["Energy (Kcal)"])) > 0.05 * float(v["Energy (Kcal)"]):
                anomalies.append(f"{s}: {v['Energy (Kcal)']} kcal vs {v['Energy (Kj)']} kJ (= {kj_as_kcal:.0f} kcal)")
            tags = ["vegetarian"] if s in vegetarian else []
            tags += ["contains_pork"] if pork else []
            tags += ["contains_beef"] if beef else []
            items.append({
                "id": slug(name), "name": name, "category": category[s], "serving": serving,
                "calories": v["Energy (Kcal)"], "protein_g": v["Protein"], "carbs_g": v["Carbohydrates"], "fat_g": v["Fat"],
                "sat_fat_g": v["of which Saturates"], "sodium_mg": "", "salt_g": v["Salt"], "sugar_g": v["of which Sugars"],
                "fiber_g": v["Fibre"], "energy_kj": v["Energy (Kj)"],
                "tags": "|".join(tags), "limited_time": False, "rankable": True, "notes": note,
            })
        ids = [i["id"] for i in items]
        assert len(ids) == len(set(ids)), "duplicate ids"
        holdback = [(slug(ROWS[s][1]), reason) for s, reason in HOLDBACK.items()]

        # allergens: the guide /menu/ links to; link only (see the module docstring)
        links = set(re.findall(r'href="([^"]+)"[^>]*><span[^>]*>VIEW OUR </span><strong> ALLERGENS</strong>', strip_comments(menu)))
        if links != {ALLERGEN_URL}:
            raise Stop(f"/menu/'s 'VIEW OUR ALLERGENS' link is now {sorted(links)}, not {ALLERGEN_URL}: re-check the allergen guide")
        issue, date, guide_names = read_allergen_guide(allergen_guide_text(fetch.get_bytes(ALLERGEN_URL, "allergen-guide.pdf")))
        in_guide = {norm_name(n) for n in guide_names}
        unmatched = [ROWS[s][0] for s in ROWS if norm_name(ROWS[s][0]) not in in_guide]
        allergen_guide = {"title": ALLERGEN_TITLE.format(issue=issue, date=date), "url": ALLERGEN_URL,
                          "checked_on": args.checked_on, "may_contain_published": False}
    except Stop as e:
        print(f"STOP: {e}", file=sys.stderr)
        return 1

    menu_date = re.search(r'"dateModified":"([^"]+)"', menu)
    if not menu_date or not all(modified):
        print("STOP: a page carries no dateModified, so the source title cannot name its date", file=sys.stderr)
        return 1
    dates = f"/menu/ page updated {menu_date.group(1)[:10]}; bagel pages updated {min(modified)} to {max(modified)}"
    write_chain_folder(chain_id=CHAIN_ID, name="Bagel Factory", cuisine="Bakery", source_title=SOURCE_TITLE.format(dates=dates), source_url=MENU_URL,
                       checked_on=args.checked_on, aliases=["bagel factory", "the bagel factory", "bagelfactory"], items=items,
                       out=args.out, note=NOTE, holdback=holdback, allergen_guide=allergen_guide)
    digest = hashlib.sha256(json.dumps(shas, sort_keys=True).encode()).hexdigest()
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {args.out}")
    print(f"allergens: link to {allergen_guide['title']} only. {len(ROWS) - len(unmatched)} of {len(ROWS)} bagel names have an "
          f"exact-name entry in the guide; no entry: {', '.join(unmatched)}. Filled bagels' entries also leave out the bun "
          "('BAGEL BUN OF CUSTOMER CHOICE').")
    print(f"/menu/ page sha256 {hashlib.sha256(menu.encode('utf-8')).hexdigest()}; combined sha256 of the {len(shas)} bagel pages {digest}")
    print(f"downloaded {fetch.fetched} pages this run")
    for a in anomalies:
        print("kcal/kJ disagree (more than 5%):", a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
