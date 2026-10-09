#!/usr/bin/env python3
"""Build data/source/daves-hot-chicken/ from Dave's Hot Chicken UK menu page (a CALORIES-ONLY chain).

    python3 tools/uk_extract/daves_hot_chicken.py --page DIR/menus.html --checked-on 2026-10-08 [--fetch] [--out DIR]
                                                  [--allergens-from-page-data]

Source: https://www.daveshotchicken.co.uk/menus (robots.txt: Allow /). The page shows each item's name, "<n> kcal" and a
Vegan / Vegetarian chip, and nothing else: no serving, no protein/carbs/fat, no sugar, salt or weight. The page's own HTML and
the data it ships (the Next.js payload, the "menuSections" array) carry the same names and calories; this script reads the payload
and then checks it against the rendered article elements and stops if they disagree, or if sections or counts change.
(/menus/drinks serves the identical menu. --fetch makes one request, with a normal browser User-Agent.)

The page prints calories ONLY, once per item for every spice level ("Dave's #1 (Mild > Reaper Spices)"), so protein, carbs and fat stay
BLANK (docs/DATA.md "Calories-only chains": every item is then not rankable and the app shows "not published"). Calories, names and the
Vegan/Vegetarian marks are copied as the page prints them; only the category spelling (sentence case) is typed by hand.
- "Top-Loaded Fries - Small (Medium & Hot Spices)" is listed twice (under Mains and under Sides) with the same price, photo, calories
  and allergen list but different internal ids: one product shown in two places, so only the first (Mains) is kept.
- The three "LRG ... Top-loaded shake" rows print 121, 374 and 239 kcal against 630-828 kcal for the plain shakes. The page doesn't say
  what they cover (perhaps the topping alone); they are published as printed and note.txt says so.
- Tags: vegetarian when the page's chip says Vegetarian or Vegan. Nothing prints pork or beef, so contains_pork/contains_beef are never set.

ALLERGENS are LINK-ONLY (docs/DATA.md "Allergens"). The page's data also holds a per-item allergen list (`dietary.allergens`: the 14,
cereal species, and "garlic", which is not one of the 14) but the page never shows it: the item panel shows kcal and the diet chip only,
and the "Allergen Information" panel says the chain's allergen guide is the downloadable "Allergen Information Instore & Catering"
matrix (PDF on cdn.sanity.io, whose robots.txt disallows PDFs, so it is not read here; /allergen-uk links Allergens-matrix-JUNE-26.pdf,
/menus/drinks links Allergens-matrix-JUL-26.pdf). Hidden data that can't be compared with the chain's own displayed guide is not good
enough for safety information, so allergens.csv is NOT written. `--allergens-from-page-data` writes it anyway (for a founder who has
compared the page data with the matrix and agrees); allergen words outside the 14 other than garlic stop the run.
The page says it gives no "may contain" information and that all equipment and fryers are shared, so may_contain_published = no.

Re-checked 2026-10-08 (allergen pass, data/audit/verified/daves-hot-chicken-allergens.json): same answer, link-only stays. The only
per-dish allergen data the chain publishes that a visitor can see is the downloadable matrix PDF ("Allergens-matrix-JUNE-26.pdf" linked from
/allergen-uk, "Allergens-matrix-JUL-26.pdf" linked from /menus and /menus/drinks: two different issues), hosted on cdn.sanity.io, whose
robots.txt says `Disallow: /*.pdf` (the only Allow is /files/cgnmnbqj/; Dave's files are under /files/ysupxjc9/), so it is not downloaded.
The page's own data does hold a list for each item (54 rows by --allergens-from-page-data) but nothing on screen shows it (checked in a
rendered browser: the item panel shows name, kcal and the diet chip; the Allergen Information panel only links the two PDFs), so there is
no rendered source to compare the 40+ items against and no way to tell whether it is current (the two matrices are already different
issues). To publish: the founder downloads the two matrix PDFs from their own browser and sends them; they would then be read as the source
and the page data compared with them.
"""
from __future__ import annotations
import argparse
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "daves-hot-chicken"
# The page prints 121, 374 and 239 kcal for the three "LRG ... Top-loaded shake" rows, against 630-828 for the plain shakes, and does not say
# what they cover (probably the topping only): not published rather than guessed.
_TOPPING = ("The page prints this large top-loaded shake at far fewer calories than the plain shakes (630-828) and does not say what "
            "the figure covers. Not published.")
HOLDBACK = [("lrg-lucky-charms-top-loaded-shake", _TOPPING), ("lrg-m-and-m-top-loaded-shake", _TOPPING),
            ("lrg-oreo-top-loaded-shake", _TOPPING)]
PAGE_URL = "https://www.daveshotchicken.co.uk/menus"
ALLERGEN_PAGE_URL = "https://www.daveshotchicken.co.uk/allergen-uk"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SOURCE_TITLE = "Dave's Hot Chicken UK menu page with calories (accessed {d}, no date shown)"
GUIDE_TITLE = "Dave's Hot Chicken UK allergen information page (accessed {d}, no date shown)"
GUIDE_TITLE_PAGE_DATA = "Dave's Hot Chicken UK menu page data (accessed {d}); the lists are in the page's data, not shown on screen"
NOTE = ("Calories are as printed on Dave's UK menu page: one figure per item for every spice level. Protein, carbs and fat aren't on the "
        "page, so aren't shown. The page doesn't say what the Top-loaded shake figures cover (they are lower than the plain shakes). "
        "Vegetarian marks are the chain's own; it says all equipment and fryers are shared.")
ALIASES = ["dave's hot chicken", "daves hot chicken", "dave’s hot chicken"]

# section title as printed -> (category shown, items expected on the page). Anything else stops the run.
SECTIONS = {
    "Mains": ("Mains", 11), "Feed a crowd": ("Feed a crowd", 3), "Sides": ("Sides", 13),
    "Top-Loaded Shakes": ("Top-loaded shakes", 3), "Shakes": ("Shakes", 6), "Slushers": ("Slushers", 2),
    "Top loaded slushers": ("Top-loaded slushers", 5), "Drinks": ("Drinks", 12),
}
EXPECTED_ON_PAGE = 55
EXPECTED_DUPLICATES = {"Top-Loaded Fries - Small (Medium & Hot Spices)"}  # same product listed under Mains and Sides
EXPECTED_PUBLISHED = 54
CLAIMS = {"vegetarian", "vegan"}
NOT_14 = {"garlic"}  # in the page data's allergen lists but not one of the 14 UK allergens
SPECIES_PREFIX = "cereals_containing_gluten_species_"


def fetch(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=60) as r:  # one request, no retries
        dest.write_bytes(r.read())
    time.sleep(1)


def read_payload(text: str) -> list:
    """The page's data: the Next.js chunks joined, then the "menuSections" array."""
    parts = []
    for m in re.finditer(r"self\.__next_f\.push\(\[(\d+),(.*?)\]\)</script>", text, re.S):
        arr = json.loads("[" + m.group(1) + "," + m.group(2) + "]")
        if len(arr) > 1 and isinstance(arr[1], str):
            parts.append(arr[1])
    full = "".join(parts)
    key = '"menuSections":'
    if full.count(key) != 1:
        raise SystemExit(f"Expected one {key} in the page data, found {full.count(key)}: the page layout changed.")
    sections, _ = json.JSONDecoder().raw_decode(full[full.index(key) + len(key):])
    return sections


def read_rendered(text: str) -> list:
    """Second, independent read: the visible article elements -> (section, name, kcal, chips)."""
    out = []
    section = None
    token = re.compile(r'<h2 data-ui="menu-section-heading"[^>]*>(.*?)</h2>|<article data-ui="menu-item".*?</article>', re.S)
    for m in token.finditer(text):
        if m.group(1) is not None:
            section = html.unescape(m.group(1)).strip()
            continue
        block = re.sub(r"<img[^>]*>", "", m.group(0))
        name = re.search(r'data-ui="menu-item-name"[^>]*>(.*?)</h3>', block, re.S)
        kcal = re.search(r'data-ui="menu-item-kcal"[^>]*>\s*(\d+)\s*(?:<!-- -->)?\s*kcal\s*</span>', block, re.S)
        if not name or not kcal:
            raise SystemExit("A menu item on the page has no name or no 'kcal' figure in its HTML: the layout changed.")
        chips = [html.unescape(c).strip().lower() for c in re.findall(r'data-ui="chip"[^>]*>(.*?)</span>', block, re.S)]
        out.append((section, html.unescape(name.group(1)).strip(), kcal.group(1), sorted(chips)))
    return out


def page_allergens(words: list, where: str) -> dict:
    """Page-data allergen words -> the allergens dict common.write_allergens expects (only used with --allergens-from-page-data)."""
    plain = []
    species = []
    for w in words:
        if w in NOT_14:
            continue
        if w.startswith(SPECIES_PREFIX):
            species.append(w[len(SPECIES_PREFIX):])
        else:
            plain.append(w.replace("_", " "))
    if species and "cereals containing gluten" not in plain:
        raise SystemExit(f"{where}: a gluten cereal is named without 'cereals containing gluten': {words}")
    keys, cereals, nuts = allergen_words(plain + species, where)
    return {"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts}


def build(page: Path, with_allergens: bool):
    text = page.read_text(encoding="utf-8")
    sections = read_payload(text)
    rendered = read_rendered(text)
    titles = [s["title"] for s in sections]
    if titles != list(SECTIONS):
        raise SystemExit(f"Sections changed: page has {titles}, script expects {list(SECTIONS)}. Re-check SECTIONS.")
    flat = []
    for s in sections:
        items = s["items"]
        if len(items) != SECTIONS[s["title"]][1]:
            raise SystemExit(f"Section {s['title']!r} has {len(items)} items, the script expects {SECTIONS[s['title']][1]}: the menu changed.")
        for it in items:
            flat.append((s["title"], it))
    if len(flat) != EXPECTED_ON_PAGE:
        raise SystemExit(f"{len(flat)} items on the page, expected {EXPECTED_ON_PAGE}.")
    # the page data and the visible elements must agree, item by item, in order
    for (title, it), (r_section, r_name, r_kcal, r_chips) in zip(flat, rendered):
        chips = sorted(c.lower() for c in it["dietary"]["claims"])
        if (title, it["name"], str(it["kcal"]), chips) != (r_section, r_name, r_kcal, r_chips):
            raise SystemExit(f"Page data and visible item disagree: data {(title, it['name'], it['kcal'], chips)} "
                             f"vs HTML {(r_section, r_name, r_kcal, r_chips)}")
    if len(rendered) != len(flat):
        raise SystemExit(f"{len(rendered)} visible items but {len(flat)} in the page data.")
    items, report, seen = [], [], {}
    for title, it in flat:
        name = it["name"].strip()
        kcal = it["kcal"]
        if not isinstance(kcal, int) or kcal < 0:
            raise SystemExit(f"{name}: kcal {kcal!r} is not a whole number")
        claims = it["dietary"]["claims"]
        unknown = set(claims) - CLAIMS
        if unknown:
            raise SystemExit(f"{name}: new diet mark(s) {sorted(unknown)}: decide how to tag them")
        signature = (kcal, tuple(sorted(claims)), tuple(sorted(it["dietary"]["allergens"])))
        if name in seen:
            if name not in EXPECTED_DUPLICATES or seen[name] != signature:
                raise SystemExit(f"{name!r} is listed twice with different data or unexpectedly: re-check by hand.")
            report.append(f"dropped exact duplicate (listed again under {title}): {name}")
            continue
        seen[name] = signature
        tags = ["vegetarian"] if claims else []
        row = {"id": slug(name), "name": name, "category": SECTIONS[title][0], "serving": "", "calories": str(kcal),
               "tags": "|".join(tags), "rankable": False, "notes": f"page section: {title}"}
        if name.startswith("LRG ") and "Top-loaded shake" in name:
            row["notes"] += "; far below the plain shakes (630-828 kcal): the page doesn't say what the figure covers"
        if with_allergens:
            row["allergens"] = page_allergens(it["dietary"]["allergens"], name)
        items.append(row)
        if not claims:
            report.append(f"meat type not stated (no vegetarian mark): {name}")
    if len(items) != EXPECTED_PUBLISHED:
        raise SystemExit(f"Built {len(items)} items, expected {EXPECTED_PUBLISHED}: the menu changed, re-check the duplicates.")
    return items, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved /menus page (HTML)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was read")
    ap.add_argument("--fetch", action="store_true", help="download the page to --page first (one request)")
    ap.add_argument("--allergens-from-page-data", action="store_true", help="also write allergens.csv from the page data (see the docstring)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        args.page.parent.mkdir(parents=True, exist_ok=True)
        fetch(PAGE_URL, args.page)
    print(f"page sha256 {sha256_file(args.page)}  {args.page}")
    items, report = build(args.page, args.allergens_from_page_data)
    if args.allergens_from_page_data:
        guide = {"title": GUIDE_TITLE_PAGE_DATA.format(d=args.checked_on), "url": PAGE_URL, "checked_on": args.checked_on, "may_contain_published": False}
    else:
        guide = {"title": GUIDE_TITLE.format(d=args.checked_on), "url": ALLERGEN_PAGE_URL, "checked_on": args.checked_on, "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Dave's Hot Chicken", cuisine="Chicken", source_title=SOURCE_TITLE.format(d=args.checked_on),
                             source_url=PAGE_URL, checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             allergen_guide=guide, nutrition_level="calories", holdback=HOLDBACK)
    print("\n".join(report))
    counts = {}
    for it in items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(f"wrote {len(items)} items to {out}: " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
