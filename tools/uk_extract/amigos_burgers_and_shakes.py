#!/usr/bin/env python3
"""Build data/source/amigos-burgers-and-shakes/ from the chain's own menu item pages (a CALORIES-ONLY chain, allergens link-only).

    python3 tools/uk_extract/amigos_burgers_and_shakes.py --pages DIR --checked-on 2026-10-08 [--fetch] [--allergen-pdf FILE] [--out DIR]

DIR holds one saved page per item (<slug>.html, e.g. b-001.html) plus pages-sitemap.xml and robots.txt; --fetch downloads them
(1.1 s apart, normal browser User-Agent, robots.txt checked first). Source (read 2026-10-08):
    https://www.amigosburgersandshakes.com/menu  -> burger-menu, chicken-menu, v-menu, kidsmenu, breakfastmenu (pages of tiles) -> one page
    per item: https://www.amigosburgersandshakes.com/b-001 ... The pages show no date (footer "(c) 2022"); the sitemap says lastmod 2026-09-04.
Amigos Burgers & Shakes is a real multi-site UK chain: its Locations page lists 22 restaurants (Acton, Shepherds Bush, Gants Hill, Southall,
Wembley, Harrow Road, Harlesden, Kilburn, Slough, Uxbridge, Fulham, Holloway, Commercial Rd, Northwood, Tooting, Feltham, Norbury, Hounslow,
Birmingham, Milton Keynes, Harrow, Streatham) and its FAQ says every restaurant is 100% halal.

What each item page prints: the item name, one line "2656.8kJ | 635kcal" (some print kcal only), sometimes a size line ("(4x Tenders)",
"10x Pieces", "2x 6oz. beef patties"), a description, and an "Allergen Information" list. NO protein, carbs, fat, sugar or salt anywhere,
so this is a calories-only chain (docs/DATA.md): protein/carbs/fat stay blank and every item is not rankable. kJ is published as energy_kj
exactly as printed (the pipeline rounds kJ to a whole number when it writes the menu JSON, like every chain). The figure is per item as sold;
no serving weight or size is stated, so `serving` is only the size line the page itself prints.

How the pages are read (each rule stops the run if the page stops fitting it): the table ITEMS below pairs every page's slug with the
heading the page prints (checked every run) and the hand-written name, category and tags; the figures come from the page. Names follow
the page heading ("CHICK BURGER" -> "Chick Burger"). Categories are the chain's own menu pages (breakfastmenu, burger-menu, chicken-menu,
v-menu, kidsmenu), in the order the site's NEXT/BACK links run. Tags: contains_beef only where the page's own text says beef; vegetarian only
for The Fun-Guy (the chain's own VEGGIE MENU page and the "VEGAN & VEGGIE" block of its allergen guide); no pork tag (turkey bacon and chicken
sausage are not pork and the chain says it is 100% halal). Burgers whose page says "patty" without the meat (Mexican, Happynero, Texan,
Cheese Burger, DBL Cheese, Hamburger) are "meat type not stated".

Not published, and why (checked every run where the page is read):
- Held back (in items.csv + holdback.csv, never corrected): the Breakfast Wrap (page prints 1899.5kJ with 178kcal: 1899.5kJ is about 454kcal,
  so kJ and kcal contradict); both "Veggie Wrap" pages (v-003 says 1188kJ/284kcal, copy-of-halloumi-wrap says 1163kJ/278kcal) and the
  Halloumi Wrap (copy-of-buffalo-wrap-1 says 1163kJ/278kcal, shmicknbites, the Veggie menu's own Halloumi Wrap, says 0kJ/0kcal "(per 100g)"):
  the chain's own site gives two different figures for the same name, so neither is chosen.
- Not read as items: Chicken Wings (c-0010: one figure, 192kcal, beside three sizes "3 / 6 / 9 'V' wings" with no stated size);
  the Shmick'n Burger and BBQ Shmick'n Burger pages (in the sitemap but linked from no menu page; the Veggie menu now lists The Fun-Guy);
  the Sinbad Wrap and Buffalo Wrap tiles (their links redirect to the Veggie Halloumi page and the Breakfast Wrap page); forms and a 404.
- Sides, hot dogs, shakes, desserts and drinks have no item page and print no nutrition.

Allergens (docs/DATA.md "Allergens") are link-only. The chain's own allergen guide is the PDF "allergen menu-print[update25]" (created
28 January 2025; the item pages link to it as "Learn More"): a matrix of 12 allergen columns with a tick for "contained" and a dot for
"cross contamination risk". Each item page also lists the allergens it contains, but the page lists and the guide DISAGREE, so allergens are
not published (all or nothing; safety information is never guessed). Checked 2026-10-08 by reading every tick and dot of the rendered
PDF (pdftoppm, then pixel-reading each cell and looking at the crops) and comparing it with the 39 item pages that have a guide row
(sulphite wording merged: the guide has separate METABISULFITE and SULPHUR DIOXIDE columns, while the chicken-sausage muffin pages say
"Sulphur Dioxide" where the guide ticks METABISULFITE): 31 agree and 8 disagree: Cheese Burger (page prints "Sesame Seeds" twice, guide ticks
soya), Supah Loaded Fries (page says sesame, guide says soya), The Fun-Guy (guide ticks eggs and milk, page lists neither although its text
says mayo and cheese), Turkey Bacon & Egg Muffin (page adds Sulphur Dioxide), DBL Turkey Bacon & Egg Muffin (page lists sesame, guide has only
a cross-contamination dot), the Veggie and Halloumi wrap pages (guide ticks celery and mustard), and the Chicken Wings page. The guide has no
row at all for the Hashbrown & Orange Juice or the Breakfast Wrap, one shared row for 1/4, 1/2 and Whole Chicken, and the pages list
"Metabisulfite" and "Nuts*" (asterisk unexplained), words outside common._A. The guide's 12 columns also leave out crustaceans, molluscs
and lupin. If Amigos fixes its pages, allergens can be extracted from the item pages (each page's list sits between "ingredients." and
"Learn More" in read_item_page's `allergens`) once the pages and the guide agree.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import amigos_burgers_and_shakes_pages as pages  # noqa: E402
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "amigos-burgers-and-shakes"
SOURCE_URL = "https://www.amigosburgersandshakes.com/menu"
SOURCE_TITLE = "Amigos Burgers & Shakes website menu item pages (accessed {checked}, no date shown)"
ALIASES = ["amigos", "amigos burgers", "amigos burgers & shakes", "amigos burgers and shakes", "amigos burgers shakes", "amigo's burgers"]
ALLERGEN_GUIDE_TITLE = "Amigos Burgers & Shakes Allergen Information Guide (PDF \"allergen menu-print[update25]\", created 28 January 2025)"
ALLERGEN_GUIDE_URL = "https://www.amigosburgersandshakes.com/_files/ugd/4a7bb9_8145f12f83fc46c8be0660bd0251a265.pdf"
# The guide marks, per item and allergen, a tick for "contained" and a dot for "present due to cross contamination risk within factory or
# in stores" and says its kitchens can't guarantee any item is allergen free: traces information is published.
MAY_CONTAIN_PUBLISHED = True
NOTE = ("Amigos prints calories (and kJ on most items) per item as sold; protein, carbs and fat are not published and no serving weights are stated. "
        "Sides, hot dogs, shakes, desserts and drinks print no nutrition. Chicken wings and the Veggie, Halloumi and Breakfast wraps are not shown: "
        "the site gives no single usable figure.")

BRK, BUR, CHI, VEG, KID = "Breakfast", "Burgers", "Chicken", "Veggie", "Kids"
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
MEAT = re.compile(r"\b(beef|steak|pork|ham|gammon|bacon|sausage|salami|pepperoni)\b", re.I)
HELD_KJ_MISMATCH = "amigos-wrap-comingsoon"


def E(slug_, head, name, cat, serving="", tags=(), item_id=None, hold=None, note=""):
    return dict(slug=slug_, head=head, name=name, cat=cat, serving=serving, tags=list(tags), id=item_id, hold=hold, note=note)


SAME = "Same printed figures as the {} page"
VEGGIE_HOLD = ("The site has two 'Veggie Wrap' pages with different figures (/v-003: 1188kJ/284kcal; /copy-of-halloumi-wrap: 1163kJ/278kcal); "
               "neither is chosen. Restore by deleting this line once the chain says which is right.")
HALLOUMI_HOLD = ("The site has two 'Halloumi Wrap' pages: /copy-of-buffalo-wrap-1 prints 1163kJ/278kcal, the Veggie menu's own page /shmicknbites "
                 "prints 0kJ/0kcal '(per 100g)'; neither is chosen. Restore by deleting this line once the chain says which is right.")
ITEMS = [
    E("egg-cheese-muffin", "EGG & CHEESE MUFFIN", "Egg & Cheese Muffin", BRK),
    E("chickensausage-egg-muffin", "CHICKEN SAUSAGE & EGG MUFFIN", "Chicken Sausage & Egg Muffin", BRK),
    E("dbl-chickensausage-egg-muffin", "DBL CHICKEN SAUSAGE & EGG MUFFIN", "DBL Chicken Sausage & Egg Muffin", BRK),
    E("turkeybacon-egg-muffin", "TURKEY BACON & EGG MUFFIN", "Turkey Bacon & Egg Muffin", BRK),
    E("dbl-turkeybacon-sausage-egg-muffin", "DBL TURKEY BACON & EGG MUFFIN", "DBL Turkey Bacon & Egg Muffin", BRK),
    E("hashbrown-egg-muffin", "HASHBROWN & EGG MUFFIN", "Hashbrown & Egg Muffin", BRK),
    E("hashbrown-orangejuice", "HASHBROWN & ORANGE JUICE", "Hashbrown & Orange Juice", BRK),
    E("strawberry-pancakes", "STRAWBERRY PANCAKES", "Strawberry Pancakes", BRK, note="Same printed figures as the Maple Syrup Pancakes page"),
    E("syrup-pancakes", "MAPLE SYRUP PANCAKES", "Maple Syrup Pancakes", BRK, note="Same printed figures as the Strawberry Pancakes page; the page <title> says 'SYRUP PANCAKES'"),
    E("amigos-wrap-comingsoon", "BREAKFAST WRAP", "Breakfast Wrap", BRK, item_id="breakfast-wrap",
      hold="The page prints 1899.5kJ with 178kcal: 1899.5kJ is about 454kcal, so kJ and kcal contradict (1899.5kJ is also the Chick Burger's kJ). "
           "Page slug 'amigos-wrap-comingsoon'. Restore by deleting this line once the chain corrects the page."),
    E("b-001", "AMIGO", "Amigo", BUR, tags=["contains_beef"]),
    E("b-004", "MEXICAN", "Mexican", BUR),
    E("copy-of-the-boss", "BREAKIE", "Breakie", BUR, tags=["contains_beef"],
      note="Same kcal (1305) as The Boss, whose page prints no kJ; Breakie's 5460kJ is consistent with 1305kcal. Page slug 'copy-of-the-boss'"),
    E("b-002", "JACOB", "Jacob", BUR, tags=["contains_beef"]),
    E("b-006", "HAPPYNERO", "Happynero", BUR, note="The page prints '577' and 'kcal' as separate text pieces"),
    E("copy-of-breakie", "CHEESE BURGER", "Cheese Burger", BUR, note="Page slug 'copy-of-breakie'"),
    E("b-003", "TEXAN", "Texan", BUR),
    E("b-007", "THE BOSS 2x 6oz. beef patties", "The Boss", BUR, serving="2x 6oz. beef patties", tags=["contains_beef"],
      note="Prints kcal only (no kJ); same kcal (1305) as Breakie"),
    E("copy-of-cheese-burger", "DBL CHEESE", "DBL Cheese", BUR, note="Page slug 'copy-of-cheese-burger'"),
    E("c-004", "1/4 CHICKEN", "1/4 Chicken", CHI),
    E("c-007", "CHICK'N PITTA", "Chick'n Pitta", CHI, note="Same printed figures as the Chick Burger page"),
    E("c-001", "CHICK BURGER", "Chick Burger", CHI, note="Same printed figures as the Chick'n Pitta page; the page <title> says 'Chicken burger'"),
    E("c-008", "AMIGOS WRAP", "Amigos Wrap", CHI, note="Same printed figures (1163kJ/278kcal) as the Crispy Korean, Halloumi and Veggie wrap pages"),
    E("c-005", "1/2 CHICKEN", "1/2 Chicken", CHI),
    E("copy-of-buttermilk-burger", "SUPAH LOADED FRIES", "Supah Loaded Fries", CHI,
      note="Same printed figures (1937kJ/463kcal) as the Buttermilk Burger page, which this page looks cloned from. Page slug 'copy-of-buttermilk-burger'"),
    E("copy-of-buffalo-wrap", "CRISPY KOREAN", "Crispy Korean Wrap", CHI,
      note="Same printed figures (1163kJ/278kcal) as the Amigos Wrap page; the page heading says 'CRISPY KOREAN', the menu tile 'CRISPY KOREAN WRAP'. Page slug 'copy-of-buffalo-wrap'"),
    E("copy-of-buffalo-wrap-1", "HALLOUMI WRAP", "Halloumi Wrap", CHI, item_id="halloumi-wrap", hold=HALLOUMI_HOLD),
    E("c-006", "WHOLE CHICKEN", "Whole Chicken", CHI),
    E("c-009", "CHICK N' RICE (4x Tenders)", "Chick N' Rice", CHI, serving="4x Tenders", note="Prints kcal only (no kJ)"),
    E("c-003", "BUTTERMILKBURGER", "Buttermilk Burger", CHI, note="The page heading runs the words together ('BUTTERMILKBURGER'); the menu tile says 'BUTTERMILK'"),
    E("copy-of-halloumi-wrap", "VEGGIE WRAP", "Veggie Wrap", CHI, item_id="veggie-wrap-chicken-menu", hold=VEGGIE_HOLD),
    E("thefunguy", "THE FUN-GUY", "The Fun-Guy", VEG, tags=["vegetarian"]),
    E("v-003", "VEGGIE WRAP", "Veggie Wrap", VEG, item_id="veggie-wrap-veggie-menu", hold=VEGGIE_HOLD),
    E("k-001", "LIL'CHICKEN BURGER", "Lil' Chicken Burger", KID, note="The page <title> says 'Little chicken burger'"),
    E("k-003", "CHICKEN POPCORN 10x Pieces", "Chicken Popcorn", KID, serving="10x Pieces", note="Prints kcal only (no kJ); the menu tile says 'CHICK'N POPCORN'"),
    E("k-004", "CRISPY CHICK'N DIPPERS 5x Tenders", "Crispy Chick'n Dippers", KID, serving="5x Tenders", note="Prints kcal only (no kJ)"),
    E("k-002", "HAMBURGER", "Hamburger", KID, note="The page <title> says 'Ham Burger'; the heading and menu tile say HAMBURGER"),
]
EXPECTED_PUBLISHED = 33
EXPECTED_HELD = 4
# Pages that are read only to check they still look the way the exclusions above describe: slug -> (printed head, kJ, kcal).
EXCLUDED_READ = {
    "c-0010": ("CHICK'N WINGS 'V' Joint wings", "", "192"),   # one figure beside three sizes (3 / 6 / 9 'V' wings), no size stated
    "shmicknbites": ("HALLOUMI WRAP", "0", "0"),               # the Veggie menu's Halloumi Wrap: a 0kJ/0kcal "(per 100g)" placeholder
    "shmicknburger": ("SHMICK'N BURGER", "1510", "361"),        # in the sitemap, linked from no menu page
    "bbqshmicknburger": ("BARBECUE SHMICK'N BURGER", "1510", "361"),
}
# Every other page in pages-sitemap.xml (checked every run: a new page stops the script so a human looks at it).
OTHER_SITEMAP_SLUGS = {
    "", "menu", "burger-menu", "chicken-menu", "kidsmenu", "sides-and-dogs-menu", "milkshakes-menu", "desserts-and-drinks", "v-menu", "breakfastmenu",
    "career", "book-online", "legal", "blog", "contact-us", "registration", "locations", "meat-the-team", "hiringlandingpage", "provenance",
    "franchising", "faqs", "blank-1", "doa-nf", "ugp-nf", "brumwerehere",
    "copy-of-amigos-wrap", "copy-of-veggie-wrap",  # redirect (301) to amigos-wrap-comingsoon and shmicknbites
}


def read_sitemap_slugs(text: str) -> set:
    out = set()
    for m in re.finditer(r"<loc>https://www\.amigosburgersandshakes\.com/?([^<]*)</loc>", text):
        out.add(m.group(1))
    return out


def fetch_all(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    pages.fetch(pages.HOST + "/robots.txt", dest / "robots.txt")
    pages.check_robots((dest / "robots.txt").read_text(encoding="utf-8"))
    pages.fetch(pages.HOST + "/pages-sitemap.xml", dest / "pages-sitemap.xml")
    for s in [e["slug"] for e in ITEMS] + sorted(EXCLUDED_READ):
        pages.fetch(f"{pages.HOST}/{s}", dest / f"{s}.html")


def build_items(dir_: Path) -> list:
    sitemap = read_sitemap_slugs((dir_ / "pages-sitemap.xml").read_text(encoding="utf-8"))
    known = {e["slug"] for e in ITEMS} | set(EXCLUDED_READ) | OTHER_SITEMAP_SLUGS
    # the c-00N pages that exist on the site: the Supah Loaded Fries page is 'copy-of-buttermilk-burger', also in ITEMS
    new, gone = sorted(sitemap - known), sorted({e["slug"] for e in ITEMS} - sitemap)
    if new or gone:
        raise SystemExit(f"The site changed. In the sitemap but unknown to this script: {new}. Item pages no longer in the sitemap: {gone}. "
                         "Look at the new pages and update ITEMS / EXCLUDED_READ / OTHER_SITEMAP_SLUGS.")
    seen_slugs = [e["slug"] for e in ITEMS]
    if len(set(seen_slugs)) != len(seen_slugs):
        raise SystemExit("ITEMS has a duplicate slug")
    for s, (head, kj, kcal) in EXCLUDED_READ.items():
        r = pages.read_item_page((dir_ / f"{s}.html").read_text(encoding="utf-8"), s)
        if (r["head"], r["kj"], r["kcal"]) != (head, kj, kcal):
            raise SystemExit(f"/{s} changed: now {(r['head'], r['kj'], r['kcal'])}, expected {(head, kj, kcal)}. Re-read the page and decide again.")
    items = []
    for e in ITEMS:
        r = pages.read_item_page((dir_ / f"{e['slug']}.html").read_text(encoding="utf-8"), e["slug"])
        if r["head"] != e["head"]:
            raise SystemExit(f"/{e['slug']}: the page heading is now {r['head']!r}, expected {e['head']!r}")
        if not r["allergens"]:
            raise SystemExit(f"/{e['slug']}: no allergen list on the page any more (layout changed)")
        kcal = float(r["kcal"])
        mismatch = bool(r["kj"]) and abs(float(r["kj"]) / 4.184 - kcal) > 0.6 + 0.01 * kcal
        if mismatch != (e["slug"] == HELD_KJ_MISMATCH):
            raise SystemExit(f"/{e['slug']}: kJ/kcal consistency changed (kJ {r['kj']!r}, kcal {r['kcal']!r}); decide again whether to hold it back")
        text = e["head"] + " " + r["desc"]
        scan = re.sub(r"turkey bacon|chicken sausages?", "", text, flags=re.I)
        if ("contains_beef" in e["tags"]) != bool(BEEF.search(text)):
            raise SystemExit(f"/{e['slug']}: the page's beef wording changed ({text!r}); re-check the contains_beef tag")
        if not e["tags"] and MEAT.search(scan):
            raise SystemExit(f"/{e['slug']}: the page now names a meat ({text!r}); decide about its tags")
        if e["hold"] is None and e["slug"] in ("v-003", "copy-of-halloumi-wrap", "copy-of-buffalo-wrap-1"):
            raise SystemExit(f"/{e['slug']} must stay held back")
        notes = f"Page /{e['slug']}: printed '{e['head']}' {r['kj'] + 'kJ | ' if r['kj'] else ''}{r['kcal']}kcal"
        if e["note"]:
            notes += "; " + e["note"]
        items.append(dict(id=e["id"] or slug(e["name"]), name=e["name"], category=e["cat"], serving=e["serving"], calories=r["kcal"],
                          energy_kj=r["kj"], tags="|".join(e["tags"]), rankable=False, notes=notes))
    published = [e for e in ITEMS if e["hold"] is None]
    held = [e for e in ITEMS if e["hold"] is not None]
    if (len(published), len(held)) != (EXPECTED_PUBLISHED, EXPECTED_HELD):
        raise SystemExit(f"Expected {EXPECTED_PUBLISHED} published and {EXPECTED_HELD} held back, ITEMS has {len(published)} and {len(held)}")
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("Item ids are not unique")
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True, help="folder with <slug>.html pages, pages-sitemap.xml and robots.txt")
    ap.add_argument("--checked-on", required=True, help="the day the pages were downloaded/read, YYYY-MM-DD")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first (about 45 requests, 1.1 s apart)")
    ap.add_argument("--allergen-pdf", type=Path, help="the allergen guide PDF (only to print its SHA-256)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_all(args.pages)
    items = build_items(args.pages)
    digest = hashlib.sha256()
    used = sorted([e["slug"] for e in ITEMS] + list(EXCLUDED_READ))
    for s in used:
        digest.update(s.encode() + sha256_file(args.pages / f"{s}.html").encode())
    print(f"{len(used)} pages read, combined sha256 (slug + file hash, sorted by slug) {digest.hexdigest()}")
    if args.allergen_pdf:
        print(f"allergen PDF sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    held = [(i["id"], e["hold"]) for i, e in zip(items, ITEMS) if e["hold"]]
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": MAY_CONTAIN_PUBLISHED}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Amigos Burgers & Shakes", cuisine="Burgers",
                             source_title=SOURCE_TITLE.format(checked=args.checked_on), source_url=SOURCE_URL, checked_on=args.checked_on,
                             aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=held, allergen_guide=guide, nutrition_level="calories")
    cats = {}
    for i in items:
        cats[i["category"]] = cats.get(i["category"], 0) + 1
    print(f"wrote {len(items)} items ({len(held)} held back) to {out}: " + ", ".join(f"{c} {n}" for c, n in cats.items()))


if __name__ == "__main__":
    main()
