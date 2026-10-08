#!/usr/bin/env python3
"""Build data/source/third-space/ from Third Space's own Natural Fitness Food menu pages (the gym group's cafes).

    python3 tools/uk_extract/third_space.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the saved pages: natural-fitness-foods-menu.html and one page per shake (<slug>.html, the page each card on the menu links to).
--fetch downloads them first (robots.txt checked with the RFC 9309 matcher, one request per second, browser User-Agent).

Source: https://www.thirdspace.london/natural-fitness-foods-menu/ (live WordPress page, no date shown; its tab strip labels the
menu "#NFF26") and the 11 shake pages it links to (https://www.thirdspace.london/food/<slug>/). Third Space is a London gym group; the
page says "Natural Fitness Food ... Available at all Third Space clubs" and the site menu lists it under Wellness, so it is the club
group's own in-house cafe brand. naturalfitnessfood.com (linked as "Order delivery") is a retail shop for protein powder with no menu.

What is published: the 11 shakes. Each card prints calories, protein, carbohydrates and fat, and each shake's own page repeats the four
values under the heading "PER 22OZ (1 SERVING)" with its ingredients. The script copies the numbers from the cards and stops unless
the shake's own page prints exactly the same four values. Nothing else is printed (no sat fat, sugar, salt, fibre, kJ or weight).

What is NOT published, and why (the script checks the page still looks like this and stops if it does not):
- "Protein" (4 powders: Chocolate/Vanilla Whey/Vegan) and "Liquids" (5 milks): the page prints no portion for them ("per scoop" and
  "per measure" appear nowhere), so there is no stated basis (UK data playbook rule 4). The milks also print calories only.
- "Add ons" (Power Up+, protein scoop, creatine, electrolytes, nut butter, espresso shot, collagen, additional base): no numbers at all.
- Shake pages that are in the site's sitemap but not on the live menu page (Oreo, Strawberry Pistachio, Volcanic Greens, Cinnamon Swirl,
  Mocha, Elite Greens, Salted Caramel, Biscoff, Beasted Oreo, Berry Beast, IM8): an earlier menu, not offered now as far as the menu
  page shows, so they are not read.
- Allergens: the pages print only "Please talk to us if you have a food allergy ... traces of these may be found in our product."
  There is no allergen guide and no per-item table, so no allergen files are written.

Reading rules: "Limited Edition" is a section heading on the menu page above one shake (Apple Crumble): it is limited_time. No tag is
set (the pages never mark an item vegetarian; the ingredient lists name no meat). Shakes are drinks, so rankable is false.
"""
from __future__ import annotations
import argparse
import html
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import robots_rfc  # noqa: E402
from common import sha256_file, write_chain_folder  # noqa: E402

CHAIN_ID = "third-space"
SITE = "https://www.thirdspace.london"
MENU_PATH = "/natural-fitness-foods-menu/"
MENU_URL = SITE + MENU_PATH
MENU_FILE = "natural-fitness-foods-menu.html"
USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) "
              "Version/17.0 Safari/605.1.15")
SOURCE_TITLE = "Third Space Natural Fitness Food menu: shakes (live page labelled #NFF26, accessed {checked}, no date shown)"
ALIASES = ["third space", "thirdspace", "third space gym", "third space london", "natural fitness food"]
SERVING = "22 oz"  # the shake pages print "PER 22OZ (1 SERVING)"
BASIS = "PER 22OZ (1 SERVING)"
NOTE = ("Third Space's own Natural Fitness Food menu publishes calories, protein, carbs and fat for its 11 shakes, per 22 oz shake. "
        "Protein powders, milks and add-ons are not listed: the page gives no portion for them. No food menu or allergen guide is published.")

# The card order on the menu page: (section anchor, shake name, shake page slug). Names and slugs are what the page prints;
# the run stops if the menu page differs (a new, renamed or removed shake).
EXPECTED = [
    ("limited", "Apple Crumble", "apple-crumble"),
    ("shakes", "Banana Bread", "banana-bread"),
    ("shakes", "Berry Blast", "berry-blast"),
    ("shakes", "Blueberry Almond", "blueberry-almond"),
    ("shakes", "Breakfast Beat", "breakfast-beat"),
    ("shakes", "Chocolate Chief", "chocolate-chief"),
    ("shakes", "Ferrero Rocher", "ferrero-rocher"),
    ("shakes", "Nutter Butter", "nutter-butter"),
    ("shakes", "Snickers", "snickers"),
    ("shakes", "Superhuman", "superman"),  # the page is titled Superhuman, its address says "superman"
    ("shakes", "Perfect Matcha", "perfect-matcha"),
]
# Sections of the menu page that are read but not published (see the docstring); name lists are checked on every run.
NOT_PUBLISHED = {
    "protein": ["Chocolate Whey", "Chocolate vegan", "Vanilla Whey", "Vanilla Vegan"],
    "liquids": ["Almond milk", "Semi-skimmed milk", "Coconut milk", "whole milk", "oat milk"],
    "addons": ["Power Up+", "Protein scoop", "creatine", "Electrolytes", "Nut butter", "Espresso shot", "Collagen", "Additional base"],
}
ALLERGEN_SENTENCE = "Please talk to us if you have a food allergy, intolerance or coeliac disease."
ANCHORS = ["limited", "shakes", "protein", "liquids", "addons"]


def text_of(fragment: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split())


def number(value: str, where: str, unit: str) -> str:
    """'347kcal' -> '347', '7.9g' -> '7.9' (the number exactly as printed; the unit must be the expected one)."""
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*" + unit, value.strip(), re.I)
    if not m:
        raise SystemExit(f"{where}: expected a number in {unit}, found {value!r}")
    return m.group(1)


def sections(menu_html: str) -> dict:
    """The menu page cut at its section anchors (id="limited", "shakes", "protein", "liquids", "addons")."""
    pos = []
    for a in ANCHORS:
        found = [m.start() for m in re.finditer(r'<div id="%s"' % a, menu_html)]
        if len(found) != 1:
            raise SystemExit(f"menu page: section anchor id=\"{a}\" found {len(found)} times, expected once: the layout changed")
        pos.append(found[0])
    if pos != sorted(pos):
        raise SystemExit("menu page: sections are in a different order than limited, shakes, protein, liquids, addons")
    pos.append(menu_html.index("</main>") if "</main>" in menu_html else len(menu_html))
    return {a: menu_html[pos[i]:pos[i + 1]] for i, a in enumerate(ANCHORS)}


def read_cards(section_html: str, where: str) -> list:
    """One dict per shake card: href slug, name, and the four printed values as the card shows them."""
    cards = []
    for block in section_html.split('data-pegasus-single-card>')[1:]:
        href = re.search(r'href="' + re.escape(SITE) + r'/food/([a-z0-9-]+)/"', block)
        name = re.search(r'<span class="sr-only">([^<]+)</span>', block)
        pairs = re.findall(r"<span>([A-Z ]+)</span>\s*<span>([^<]+)</span>", block)
        if not (href and name and len(pairs) == 4):
            raise SystemExit(f"{where}: a shake card does not have a link, a name and 4 labelled values: the layout changed")
        labels = [p[0] for p in pairs]
        if labels != ["CALORIES", "PROTEIN", "CARBOHYDRATES", "FAT"]:
            raise SystemExit(f"{where}: card {name.group(1)!r} labels are {labels}, expected CALORIES, PROTEIN, CARBOHYDRATES, FAT")
        w = f"{where} / {name.group(1)}"
        cards.append({"slug": href.group(1), "name": html.unescape(name.group(1)).strip(),
                      "calories": number(pairs[0][1], w, "kcal"), "protein_g": number(pairs[1][1], w, "g"),
                      "carbs_g": number(pairs[2][1], w, "g"), "fat_g": number(pairs[3][1], w, "g")})
    return cards


def read_option_names(section_html: str) -> list:
    """Names of the options in the protein / liquids / add-ons sections (bold 14px uppercase paragraphs)."""
    return [text_of(m) for m in re.findall(r'font-size:14px;font-style:normal;font-weight:700;letter-spacing:2px;(?:line-height:1\.5;)?text-transform:uppercase">([^<]+)</p>', section_html)]


def read_option_values(section_html: str) -> list:
    """Labels printed under each option, to prove what the unpublished sections do and do not print."""
    return sorted(set(m.lower() for m in re.findall(r'font-size:10px;line-height:1\.5;text-transform:uppercase">([^<]+)</p>', section_html)))


def read_detail(page_html: str, where: str) -> dict:
    """A shake's own page: name (h1), ingredients, the basis heading and the four values under it."""
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page_html, re.S)
    ing = re.search(r">Ingredients</span>\s*<div[^>]*>(.*?)</div>", page_html, re.S)
    basis = re.search(r'<div class="text-\[10px\] font-bold uppercase tracking-\[1\.2px\]">([^<]+)</div>\s*'
                      r"<div>([^<]+)</div>\s*<div>([^<]+)</div>\s*<div>([^<]+)</div>\s*<div>([^<]+)</div>", page_html)
    labels = re.search(r"<div>Calories</div>\s*<div>Protein</div>\s*<div>Carbohydrates</div>\s*<div>Fat</div>", page_html)
    if not (h1 and ing and basis and labels):
        raise SystemExit(f"{where}: the shake page no longer has a name, ingredients and a labelled nutrition block")
    return {"name": text_of(h1.group(1)), "ingredients": text_of(ing.group(1)), "basis": text_of(basis.group(1)),
            "calories": number(basis.group(2), where, "kcal"), "protein_g": number(basis.group(3), where, "g"),
            "carbs_g": number(basis.group(4), where, "g"), "fat_g": number(basis.group(5), where, "g")}


def build(pages: Path) -> tuple:
    menu = (pages / MENU_FILE).read_text(encoding="utf-8")
    report = []
    secs = sections(menu)
    cards = read_cards(secs["limited"], "limited") + read_cards(secs["shakes"], "shakes")
    anchor_of = ["limited"] * len(read_cards(secs["limited"], "limited")) + ["shakes"] * len(read_cards(secs["shakes"], "shakes"))
    got = [(a, c["name"], c["slug"]) for a, c in zip(anchor_of, cards)]
    if got != EXPECTED:
        raise SystemExit(f"The shakes on the menu page changed.\n  page:     {got}\n  expected: {EXPECTED}\nRe-read the page, then update EXPECTED.")
    # the sections that are read but not published: still the same names, and they still print no portion
    for key, names in NOT_PUBLISHED.items():
        found = read_option_names(secs[key])
        if found != names:
            raise SystemExit(f"menu page section {key!r} changed: now {found}, expected {names}. A portion or new numbers may now be "
                             "printed: re-read the section before deciding what to publish.")
    # the options print only their value labels (no "per scoop" / portion line); the add-ons print no numbers at all
    if read_option_values(secs["liquids"]) != ["calories"]:
        raise SystemExit(f"liquids now print {read_option_values(secs['liquids'])}, expected calories only")
    if read_option_values(secs["protein"]) != ["calories", "carbohydrates", "fat", "protein"]:
        raise SystemExit(f"protein options now print {read_option_values(secs['protein'])}: a portion or new column may have appeared")
    if re.search(r"\d\s*(kcal|g\b)", text_of(secs["addons"]), re.I):
        raise SystemExit("the add-ons now print numbers: re-read the section before deciding what to publish")
    if ALLERGEN_SENTENCE not in text_of(menu):
        raise SystemExit("the allergen sentence changed: read the new wording, a guide may now be linked")
    if re.search(r"allergen\s+(guide|matrix|information)|\.pdf", text_of(menu), re.I):
        raise SystemExit("the menu page now mentions an allergen guide or a PDF: check it")
    items = []
    for (anchor, name, slug), card in zip(EXPECTED, cards):
        detail = read_detail((pages / f"{slug}.html").read_text(encoding="utf-8"), f"{slug}.html")
        if detail["name"].lower() != name.lower():
            raise SystemExit(f"{slug}.html is titled {detail['name']!r}, the card says {name!r}")
        if detail["basis"].upper() != BASIS:
            raise SystemExit(f"{slug}.html prints the basis {detail['basis']!r}, expected {BASIS!r}: the shake size changed")
        for k in ("calories", "protein_g", "carbs_g", "fat_g"):
            if detail[k] != card[k]:
                raise SystemExit(f"{name}: the menu card prints {k} {card[k]} but the shake's own page prints {detail[k]}: held for a human")
        notes = f"Ingredients as printed: {detail['ingredients']}"
        if anchor == "limited":
            notes += "; listed under the menu page's 'Limited Edition' heading"
        items.append({"name": name, "category": "Shakes", "serving": SERVING,
                      "calories": card["calories"], "protein_g": card["protein_g"], "carbs_g": card["carbs_g"], "fat_g": card["fat_g"],
                      "tags": "", "limited_time": anchor == "limited", "rankable": False, "notes": notes})
    report.append("not published (no portion printed): protein options " + ", ".join(NOT_PUBLISHED["protein"]) +
                  "; milks " + ", ".join(NOT_PUBLISHED["liquids"]) + " (calories only)")
    report.append("not published (no numbers): add-ons " + ", ".join(NOT_PUBLISHED["addons"]))
    report.append("meat type not stated: 0 (the ingredient lists name no meat)")
    return items, report


def fetch_all(pages: Path) -> None:
    pages.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(SITE + "/robots.txt", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        rules = robots_rfc.parse(r.read().decode("utf-8", "replace"))
    time.sleep(1.0)

    def get(path: str, dest: str) -> None:
        if not robots_rfc.allowed(rules, path):
            raise SystemExit(f"robots.txt disallows {path}: stop and ask the founder to save the page")
        subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", USER_AGENT, "-o", str(pages / dest), SITE + path], check=True)
        time.sleep(1.0)

    get(MENU_PATH, MENU_FILE)
    for _, _, slug in EXPECTED:
        get(f"/food/{slug}/", f"{slug}.html")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the 12 pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    items, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Third Space", cuisine="Cafe", source_title=SOURCE_TITLE.format(checked=args.checked_on),
                             source_url=MENU_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE)
    print(f"{MENU_FILE} sha256 {sha256_file(args.pages / MENU_FILE)}")
    for _, _, slug in EXPECTED:
        print(f"{slug}.html sha256 {sha256_file(args.pages / (slug + '.html'))}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
