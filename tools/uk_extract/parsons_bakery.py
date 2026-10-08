#!/usr/bin/env python3
"""Build data/source/parsons-bakery/ from Parsons Bakery's own allergens page and its one-PDF-per-product nutrition reports.

    python3 tools/uk_extract/parsons_bakery.py --pdfs DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://www.parsonsbakery.co.uk/allergens (Squarespace; no date shown). The page lists every product under an h3 heading (Bread,
Cake, Sandwiches & Filled Baguette, Hot Savouries, Tea & coffee, Paninis) with a link "/s/<file>.pdf" to the product's own one-page report
(NutriCalc, "Report date" printed on it). Each report prints a "Nutrition" table with a per 100g column and ONE column for the item as sold
("per Each Sandwich", "per 283g", "per Per Pasty", ...), the ingredient declaration, an "Allergens" list ("Contains Gluten", "Contains
Wheat", ..., "Suitable for Vegetarians") and a front-of-pack panel. Only the per-item column is used, copied as printed (the per 100g column
is never used or converted). `--fetch` downloads the page and each PDF once into --pdfs (robots.txt first: it disallows only /config,
/search, /account, /api/, /static/ and some query strings, so /s/*.pdf is allowed; 1.1 s between requests, browser User-Agent).
Needs poppler's `pdftotext`. Python 3.9 compatible.

Numbers are never typed: each figure is read from the PDF's text layer and cross-checked against the same PDF's front-of-pack panel
(energy, fat, saturates, sugars, salt must equal the table's per-item cells; the one older report whose panel cannot be read is listed in
NO_FOP and checked by eye). Item NAMES, categories and the choices below are typed by hand. The run stops when the page's list of
links, the 404s or the PDFs change (a new product, a removed link, a table or allergen line this reader does not understand), so a human
re-checks first.

Checked by hand on 2026-10-08: the allergens page (94 product links; 92 PDFs fetched, 2 links answer HTTP 404), the report dates 19/12/2024 to
06/10/2026, and the combined SHA-256 of the sorted "file sha256" lines of the 92 PDFs, printed by every run:
c53e08e9d2fce43ce298c30c85528d0fd2ceebb6b5b5f1e5f58b146847256ea7 (per-file hashes are printed too).

Name rule: the chain's own link text on the page, except TITLE_WINS (the PDF's title adds a qualifier the link omits).

Not published (each also in the report): see NOT_PUBLISHED. The two "sachet" files are a supplier's (Heinz / Erudus) per 100 g specification
(no per-item figures); the three 2025 reports for the White Chocolate & Raspberry Muffin, Custard Slice and Fruit & Nut Flapjack are
photographs of a printed page with no text layer (reading them needs OCR, which misread digits when tried, so they are not published rather
than hand-corrected); two links on the page answer HTTP 404.

Allergens: every published item's allergens are copied from its own report's "Allergens" list. The reports print no "may contain" / traces
information at all (may_contain_published = no). An item whose list shows no "Contains" line (Espresso, Tea Black) is one the report marks
as containing none of the 14 allergens.
"""
from __future__ import annotations
import argparse
import hashlib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import parsons_bakery_pages as pages  # noqa: E402
import parsons_bakery_pdf as reader  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "parsons-bakery"
SITE_PAGE = pages.PAGE_URL
ALIASES = ["parsons bakery", "parsons"]

# heading on the page -> (category, rankable). Plain bread, sweet bakes and drinks are not suggested as an order.
SECTIONS = {
    "Bread allergens": ("Bread", False),
    "Cake Allergens": ("Cakes and sweet bakes", False),
    "Sandwiches & Filled Baguette Allergens": ("Sandwiches and filled baguettes", True),
    "Hot Savouries Allergens": ("Hot savouries", True),
    "Tea & coffee Allergens": ("Tea and coffee", False),
    "Paninis": ("Paninis", True),
}
EXPECTED_LINKS = 94          # product links on the page on 2026-10-08 (the pay gap report, linked twice in the header, is not one)
EXPECTED_ITEM_COUNT = 86     # items written (87 text reports less one exact duplicate)

# 404 on 2026-10-08: the page links these but the file is not there. Nothing is published for them.
DEAD_LINKS = {"/s/Caramel-Jacks-Broken-Bits-180926.pdf", "/s/Bacon-and-Sausage-Baguette-231224.pdf"}
# link path -> why it is not published
NOT_PUBLISHED = {
    "/s/Tomato-Ketchup-70x26ml.pdf": "supplier (Heinz, via Erudus) specification of a 70 x 26 ml case: per 100 g only, no per-item figures",
    "/s/Brown-Sauce-70x26ml.pdf": "supplier specification of a 70 x 26 ml case: per 100 g only, no per-item figures",
    "/s/White-Chocolate-Raspberry-Muffin-200125.pdf": "image-only scan (report dated 20/01/2025), no text layer; OCR not reliable enough",
    "/s/Custard-Slice-200125.pdf": "image-only scan (report dated 20/01/2025), no text layer; OCR not reliable enough",
    "/s/Fruit-and-Nut-Flapjack-120325.pdf": "image-only scan (report dated 12/03/2025), no text layer; OCR not reliable enough",
}
# Reports whose front-of-pack panel is laid out differently (spaced letters), so the cross-check cannot read it: checked by eye.
NO_FOP = {"Pizza-Baguette-191224"}
# link text -> name when the PDF's own title says more (the sandwiches are made on white bread; the danish has sultanas; the pasty is steak)
TITLE_WINS = {
    "Bacon and Sausage Sandwich": "Bacon & Sausage Sandwich (white bread)",
    "Sausage Sandwich": "Sausage Sandwich (white bread)",
    "Bacon Sandwich": "Bacon Sandwich (white bread)",
    "Apple Danish": "Apple and Sultana Danish",
    "Traditional Pasty": "Traditional Steak Pasty",
}
TIDY = {"Ham Salad sandwich (malted wheat bread)": "Ham Salad Sandwich (malted wheat bread)", "Tea, black": "Tea, Black"}
# Exact duplicates on the page: the same title, numbers and allergens twice (link path -> path it repeats).
DUPLICATES = {"/s/Flat-White-Coffee-260326-8yna.pdf": "/s/Flat-White-Coffee-260326.pdf"}
# Held back (item name -> reason). Never corrected, never chosen between.
HOLDBACK = {
    "Flat White": ("Every figure and the weight (283 g, 13 kcal, 0.7 g fat, 0.7 g protein, 0.05 g salt) are identical to the Decaf White Coffee "
                   "report, and far below the same chain's Latte (283 g, 154 kcal) and Oat Milk Flat White (186 g, 87 kcal): the report looks "
                   "copied from the white coffee, so it is not published (the page links the same file twice, as Flat White and Flat White Coffee)."),
    "Pepperoni Pizza Stick": ("The page links it as 'Pepperoni Pizza Stick' but the PDF is titled 'Pepperoni Pizza' and prints figures for 820 g "
                              "(2064 kcal), far more than the same page's Pizza Stick (127.5 g): the numbers may be for a whole pizza, not a stick, "
                              "so they are not published."),
}
PORK = re.compile(r"\b(bacon|ham|pork|sausages?|pepperoni|salami|chorizo|gammon)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
WORDS = re.compile(r"[a-z]+")

NOTE = ("Figures are per item as sold, from Parsons Bakery's own one-page report for each product (report dates Dec 2024 to Oct 2026). "
        "Bread values are for the whole loaf or roll the report names. Not included: three 2025 reports that are scanned images, "
        "and two sauce sachet files that give per 100 g only.")


def serving_for(basis: str, name: str, title: str) -> tuple:
    """(serving, weight_g, note) from the per-item column header. 'per Each Sandwich' -> '1 sandwich' only when every word of it appears in
    the item's name or the PDF title (some reports reuse another product's header: the paninis say 'Each Baguette'); '283g' -> weight_g."""
    gm = re.fullmatch(r"(\d+(?:\.\d+)?)g", basis)
    if gm:
        return "", gm.group(1), ""
    label = re.sub(r"^(Each|Per)\s+", "", basis, flags=re.I).strip().lower()
    words = WORDS.findall(label)
    hay = (name + " " + title).lower()
    if words and all(w in hay for w in words):
        return "1 " + label, "", ""
    return "", "", "the table header reads 'per %s', which does not match the product" % basis


def norm(s: str) -> str:
    return " ".join(s.lower().replace("&", "and").split())


def build(pdf_dir: Path):
    index = pages.parse_index((pdf_dir / "allergens.html").read_text(encoding="utf-8", errors="replace"))
    if len(index) != EXPECTED_LINKS:
        raise SystemExit("The page now has %d product links (expected %d): a product was added or removed. Re-check NOT_PUBLISHED, "
                         "DEAD_LINKS, TITLE_WINS and EXPECTED_LINKS, then run again." % (len(index), EXPECTED_LINKS))
    headings = {h for h, _, _ in index}
    if headings != set(SECTIONS):
        raise SystemExit("The page's headings changed: %s. Update SECTIONS." % sorted(headings ^ set(SECTIONS)))
    paths = {p for _, _, p in index}
    for name, table in (("DEAD_LINKS", DEAD_LINKS), ("NOT_PUBLISHED", NOT_PUBLISHED), ("DUPLICATES", DUPLICATES)):
        stale = set(table) - paths
        if stale:
            raise SystemExit("%s names links that are no longer on the page: %s" % (name, sorted(stale)))
    items, report, holdback_rows, hashes = [], [], [], []
    seen = {}
    for heading, link_text, path in index:
        fname = Path(path).name
        f = pdf_dir / fname
        if path in DEAD_LINKS:
            if f.exists():
                raise SystemExit("%s is on the dead-link list but a file exists: it came back, re-check." % path)
            report.append("not published, link answers 404: %s" % link_text)
            continue
        if not f.exists():
            raise SystemExit("%s is missing from %s: run with --fetch (it was not on the dead-link list)." % (fname, pdf_dir))
        hashes.append((fname, hashlib.sha256(f.read_bytes()).hexdigest()))
        if path in NOT_PUBLISHED:
            report.append("not published: %s: %s" % (link_text, NOT_PUBLISHED[path]))
            continue
        try:
            d = reader.read_pdf(f)
        except reader.PdfError as e:
            raise SystemExit("%s (%s): %s: the report's layout changed or is new, a human must check it." % (fname, link_text, e))
        category, rankable = SECTIONS[heading]
        title = d["title"]
        if path in DUPLICATES:
            first = seen[DUPLICATES[path]]
            if (first["pdf"]["item"], first["pdf"]["contains"], first["pdf"]["title"]) != (d["item"], d["contains"], d["title"]):
                raise SystemExit("%s is listed as a duplicate of %s but the reports differ" % (path, DUPLICATES[path]))
            report.append("dropped exact duplicate: %s (same title, numbers and allergens as %s)" % (link_text, first["name"]))
            continue
        name = TITLE_WINS.get(link_text) or TIDY.get(link_text) or link_text
        if link_text in TITLE_WINS and norm(title) != norm(name):
            raise SystemExit("TITLE_WINS for %r expects the PDF title %r but it is %r" % (link_text, name, title))
        it = d["item"]
        fop = d["fop"]
        if fname[:-4] in NO_FOP:
            if fop:
                raise SystemExit("%s: the front-of-pack panel is readable now: remove it from NO_FOP" % fname)
            report.append("front-of-pack panel not machine-readable, numbers checked by eye only: %s" % name)
        else:
            if not fop:
                raise SystemExit("%s: front-of-pack panel not read: re-check the layout" % fname)
            bad = [k for k in fop if fop[k] != it.get(k)]
            if bad:
                raise SystemExit("%s: the table and the front-of-pack panel disagree on %s: %s vs %s" % (fname, bad, {k: it.get(k) for k in bad}, {k: fop[k] for k in bad}))
        serving, weight, snote = serving_for(d["basis"], name, title)
        suitable = " ".join(d["suitable"]).lower()
        vegetarian = "vegetarian" in suitable
        text = name + " " + d["ingredients"]
        tags = []
        if vegetarian:
            tags.append("vegetarian")
        else:
            if PORK.search(text):
                tags.append("contains_pork")
            if BEEF.search(text):
                tags.append("contains_beef")
        keys, cereals, nuts = allergen_words(d["contains"], "%s (%s)" % (fname, name))
        notes = ["file %s, report date %s, table header 'per %s'" % (fname, d["date"], d["basis"])]
        if norm(title) != norm(name):
            notes.append("the PDF is titled %r, the page links it as %r" % (title, link_text))
        if snote:
            notes.append(snote)
        if "polyols" in it:
            notes.append("also prints of which Polyols %sg" % it["polyols"])
        if category in ("Sandwiches and filled baguettes", "Hot savouries", "Paninis") and not vegetarian and not any(t.startswith("contains_") for t in tags):
            report.append("no vegetarian mark and no pork or beef in name or ingredients (meat type per ingredient list): %s" % name)
        row = {"name": name, "category": category, "serving": serving, "calories": it["energy"][1], "energy_kj": it["energy"][0],
               "protein_g": it["protein"], "carbs_g": it["carbs"], "fat_g": it["fat"], "sat_fat_g": it["sat"], "sugar_g": it["sugar"],
               "fiber_g": it.get("fibre", ""), "salt_g": it["salt"], "weight_g": weight, "tags": "|".join(tags),
               "rankable": rankable, "notes": "; ".join(notes),
               "allergens": {"contains": keys, "may_contain": set(), "cereals": cereals, "nuts": nuts}}
        seen[path] = {"name": name, "pdf": d, "row": row}
        items.append(row)
    dates = sorted({seen[p]["pdf"]["date"] for p in seen}, key=lambda s: s[6:] + s[3:5] + s[:2])
    if len(items) != EXPECTED_ITEM_COUNT:
        raise SystemExit("%d items built, expected %d: the pages changed, re-check and update EXPECTED_ITEM_COUNT" % (len(items), EXPECTED_ITEM_COUNT))
    names = [i["name"] for i in items]
    for h in HOLDBACK:
        if h not in names:
            raise SystemExit("HOLDBACK names %r which is not an item" % h)
    return items, report, hashes, dates[0], dates[-1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdfs", type=Path, required=True, help="folder with allergens.html and the product PDFs")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page and PDFs were fetched/read")
    ap.add_argument("--fetch", action="store_true", help="download the page and every product PDF into --pdfs first (one request each)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        _, dead = pages.fetch_all(args.pdfs)
        if set(dead) != DEAD_LINKS:
            raise SystemExit("The 404 links changed: now %s, expected %s. Re-check DEAD_LINKS." % (sorted(dead), sorted(DEAD_LINKS)))
    items, report, hashes, first, last = build(args.pdfs)
    holdback = []
    for name, reason in HOLDBACK.items():
        holdback.append((slug(name), reason))
    source_title = ("Parsons Bakery allergens page: one nutrition and allergen report per product (report dates %s to %s; page accessed %s, "
                    "no date shown)" % (first, last, args.checked_on))
    guide = {"title": "Parsons Bakery allergens page: one allergen report per product (PDF), accessed %s" % args.checked_on,
             "url": SITE_PAGE, "checked_on": args.checked_on, "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Parsons Bakery", cuisine="Bakery", source_title=source_title, source_url=SITE_PAGE,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide=guide)
    total = hashlib.sha256("\n".join("%s %s" % h for h in sorted(hashes)).encode()).hexdigest()
    print("\n".join(report))
    print("PDFs read: %d; combined sha256 of 'file sha256' lines (sorted): %s" % (len(hashes), total))
    for h in sorted(hashes):
        print("%s %s" % (h[1], h[0]))
    print("wrote %d items to %s (%d held back)" % (len(items), out, len(holdback)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
