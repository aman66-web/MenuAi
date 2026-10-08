#!/usr/bin/env python3
"""Build data/source/wild-bean-cafe/ from bp's "Wild Bean Cafe: Ingredient and nutritional information" PDF.

    python3 tools/uk_extract/wild_bean_cafe.py path/to/guide.pdf --checked-on 2026-10-08 [--out DIR]

Source (the file the chain's own page links; robots.txt allows it):
    https://www.bp.com/en_gb/united-kingdom/home/products-and-services/our-offer/wild-bean-cafe/nutritional-information.html
    -> https://www.bp.com/content/dam/bp/country-sites/en_gb/united-kingdom/home/pdf/products-and-services/ingredient-and-nutritional-information-oct-2026.pdf
    79 pages, PowerPoint export with a text layer, footer "22 September 2026 / WBC-Product Pages-Sept-2026-V2 (coffee re-launch)".
Needs `pdftotext` (poppler); runs on Python 3.9. The pages are read by position: see wild_bean_cafe_pdf.py.

WHAT IS PUBLISHED (a FULL-nutrition chain: docs/DATA.md says a chain is full or calories-only, never a mix):
  Pages 30-78 are food, one slide per product (or per few products), each with kJ, kcal, fat, saturates, carbohydrate, sugars, protein
  and salt PER PORTION/PIECE as sold, with the weight in the column header ("Per Portion (133g)", "Per Cookie (70g)"), plus the
  14-allergen grid. Pages 1-28 are the drinks (coffees, teas, hot chocolates, iced drinks, frappes, smoothies): they print ENERGY
  (kJ, kcal) only (syrups and sauces add carbohydrate and sugars), with no protein or fat, and the contract needs all three for every item of a full chain, so the drinks are NOT
  listed (they could only ship as a separate calories-only chain). The run stops if a drinks page ever prints protein or fat.

LEFT OUT, each re-checked on every run (see EXCLUDED):
  page 29   Bacon Bap / Sausage Bap "(Dealer shops only)": shops run by dealers only, and the same names are printed again, with
            other numbers, as pre-packed items on pages 30-31, which are the ones published.
  page 73   Chocolate Hazelnut Doughnut Bites and page 74 Double Choc Doughnut Bites, page 75 Funfetti Cro-Dough: the "Peanuts" cell of
            the allergen grid is EMPTY (no X, no tick, no "may contain"). Allergens are safety information and the chain is published with
            its complete allergen table (docs/DATA.md: all or nothing), so an item whose grid cannot be read in full is not listed, never
            guessed. (Page 75's numbers are also identical to page 73's although the portion is 102 g, not 25 g: a copy of page 73.)
  page 79   Parisienne Baguette: "Per 100g" only; we never convert per 100 g into a portion.

ALLERGENS are read from each page's grid exactly as printed (X = none, tick = contains, "May contain" = may contain; "Wheat, Rye..."
after a tick names the cereals, "Hazelnut" etc. the tree nuts). Hash Browns and Potato Wedges print "X *" for Egg and Milk with the
footnote "* Made to a vegan recipe but not suitable for those with milk or egg allergies": read as may contain (checked against the
footnote text on the page). Nothing is inferred from the ingredient lists.

TAGS: vegetarian = the grid's "SUITABLE FOR VEGETARIANS: YES". contains_pork / contains_beef = the item name or its own ingredient
list says pork, bacon, ham, sausage, pepperoni ... / beef, steak (a beef collagen sausage casing counts: it says beef).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wild_bean_cafe_pdf as pdf_reader  # noqa: E402
from common import allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "wild-bean-cafe"
SOURCE_URL = "https://www.bp.com/content/dam/bp/country-sites/en_gb/united-kingdom/home/pdf/products-and-services/ingredient-and-nutritional-information-oct-2026.pdf"
SOURCE_TITLE = "Wild Bean Cafe Ingredient and Nutritional Information, 22 September 2026 (WBC-Product Pages-Sept-2026-V2, coffee re-launch)"
ALLERGEN_TITLE = "Wild Bean Cafe Ingredient and Nutritional Information, 22 September 2026 (allergen grid on each product page)"
ALIASES = ["wild bean cafe", "wild bean café", "wildbean cafe", "wild bean", "bp wild bean cafe", "bp wild bean café"]
NOTE = ("Food only: the guide's drinks (coffees, teas, hot chocolates, iced drinks, frappes, smoothies) print energy only, so they are not "
        "listed. Figures are per portion or piece as printed; the range varies by bp site.")
PDF_PAGES = 79
DRINK_PAGES = range(1, 29)
FOOTNOTE = "not suitable for those with milk or egg allergies"

BREAKFAST, HOT_BREAKFAST, SAVOURIES, LUNCH, SLICES, SNACKS, PASTRIES, SWEET, COOKIES, SAUCES = (
    "Breakfast (pre-packed)", "Hot breakfast (made in store)", "Hot savouries", "Hot lunch", "Slices & pasties", "Hot savoury snacks",
    "Pastries", "Sweet treats", "Cookies", "Sauces")


def P(acol, ncol, printed, name, rankable=True):
    """One item: allergen column, nutrition column, the product name as printed in the header, our item name, rankable."""
    return dict(acol=acol, ncol=ncol, printed=printed, name=name, rankable=rankable)


def two_portions(printed, name):
    """A product with ONE allergen column and TWO nutrition columns (the whole item and its printed half)."""
    return [P(0, 0, printed, name), P(0, 1, printed, name + " (half)", False)]


# page -> (heading that must be printed on the page, category, items, ingredient headings for pages with meat words or None)
PAGES = {
    30: ("Breakfast (Pre-packed)", BREAKFAST, [P(0, 0, "Bacon Bap", "Bacon Bap")], None),
    31: ("Breakfast (Pre-packed)", BREAKFAST, [P(0, 0, "Sausage Bap", "Sausage Bap")], None),
    32: ("Breakfast (Pre-packed)", BREAKFAST, [P(0, 0, "All Day Breakfast Baguette", "All Day Breakfast Baguette")], None),
    33: ("Breakfast (Pre-packed)", BREAKFAST, [P(0, 0, "All Day Breakfast Wrap", "All Day Breakfast Wrap")], None),
    34: ("Breakfast (Pre-packed)", BREAKFAST, [P(0, 0, "Cheese & Tomato Croissant", "Cheese & Tomato Croissant")], None),
    35: ("Breakfast (Pre-packed)", BREAKFAST, [P(0, 0, "Egg & Cheese Bap", "Egg & Cheese Bap")], None),
    36: ("Breakfast (Pre-packed)", BREAKFAST, [P(0, 0, "Ham & Cheese Croissant", "Ham & Cheese Croissant")], None),
    37: ("Hot Breakfast (Made in Store)", HOT_BREAKFAST, two_portions("Big Breakfast Ciabatta", "Big Breakfast Ciabatta"), None),
    38: ("Hot Breakfast (Made in Store)", HOT_BREAKFAST, two_portions("Bacon Ciabatta", "Bacon Ciabatta"), None),
    39: ("Hot Breakfast (Made in Store)", HOT_BREAKFAST, two_portions("Sausage Ciabatta", "Sausage Ciabatta"), None),
    40: ("Hot Breakfast (Made in Store)", HOT_BREAKFAST, two_portions("Egg & Cheese Ciabatta", "Egg & Cheese Ciabatta"), None),
    41: ("Hot Savouries - Turnovers", SAVOURIES, [P(0, 0, "Bacon & Cheese Turnover", "Bacon & Cheese Turnover")], None),
    42: ("Hot Savouries - Turnovers", SAVOURIES, [P(0, 0, "Breakfast Turnover", "Breakfast Turnover")], None),
    43: ("Hot Lunch – Pizza Slices", LUNCH, [P(0, 0, "Cheese & Tomato Pizza Slice", "Cheese & Tomato Pizza Slice"),
                                           P(1, 1, "Pepperoni Pizza Slice", "Pepperoni Pizza Slice")],
         ["Cheese & Tomato Pizza Slice:", "Pepperoni Pizza Slice:"]),
    44: ("Hot Lunch – Toasties (Pre-packed)", LUNCH, [P(0, 0, "Cheese & Caramelised Onion Toastie", "Cheese & Caramelised Onion Toastie")], None),
    45: ("Hot Lunch – Toasties (Pre-packed)", LUNCH, [P(0, 0, "Ham & Cheese Toastie", "Ham & Cheese Toastie")], None),
    46: ("Hot Lunch", LUNCH, [P(0, 0, "The Big Smoke", "The Big Smoke")], None),
    47: ("Hot Lunch", LUNCH, [P(0, 0, "Hot Honey Chicken Flatbread", "Hot Honey Chicken Flatbread")], None),
    48: ("Hot Lunch", LUNCH, [P(0, 0, "Philly Cheesesteak Baguette", "Philly Cheesesteak Baguette")], None),
    49: ("Hot Lunch – Ciabattas", LUNCH, [P(0, 0, "Mexican Style Chicken Ciabatta", "Mexican Style Chicken Ciabatta")], None),
    50: ("Hot Lunch – Wraps", LUNCH, [P(0, 0, "Chicken Tikka Wrap", "Chicken Tikka Wrap")], None),
    51: ("Hot Savouries – Sausage Roll", SAVOURIES, [P(0, 0, "Sausage Roll", "Sausage Roll")], None),
    52: ("Slices & Pasties", SLICES, [P(0, 0, "Steak Slice", "Steak Slice"), P(1, 1, "Sticky Pork Rib Slice", "Sticky Pork Rib Slice")],
         ["Steak Slice", "Sticky Pork Rib Slice"]),
    53: ("Slices & Pasties", SLICES, [P(0, 0, "Cheese & Onion Slice", "Cheese & Onion Slice"), P(1, 1, "Chicken Slice", "Chicken Slice")],
         ["Cheese & Onion Slice", "Chicken Slice"]),
    54: ("Slices & Pasties", SLICES, [P(0, 0, "Feta & Red Pepper Slice", "Feta & Red Pepper Slice")], None),
    55: ("Slices & Pasties", SLICES, [P(0, 0, "Sausage & Bean Slice", "Sausage & Bean Slice"), P(1, 1, "Cornish Pasty", "Cornish Pasty")],
         ["Sausage & Bean Slice", "Cornish Pasty"]),
    56: ("Hot Savoury Snacking", SNACKS, [P(0, 0, "Hash Browns", "Hash Browns")], None),
    57: ("Hot Savoury Snacking", SNACKS, [P(0, 0, "Potato Wedges", "Potato Wedges")], None),
    58: ("Hot Savoury Snacking", SNACKS, [P(0, 0, "Crispy Chicken Goujons", "Crispy Chicken Goujons")], None),
    59: ("Pastries", PASTRIES, [P(0, 0, "Butter Croissant", "Butter Croissant", False)], None),
    60: ("Pastries", PASTRIES, [P(0, 0, "Triple Chocolate Pain au Chocolat", "Triple Chocolate Pain au Chocolat", False)], None),
    61: ("Pastries", PASTRIES, [P(0, 0, "Apricot & Custard Slice", "Apricot & Custard Slice", False)], None),
    62: ("Pastries", PASTRIES, [P(0, 0, "Pain aux Raisins", "Pain aux Raisins", False)], None),
    63: ("Pastries", PASTRIES, [P(0, 0, "Cheese Knot", "Cheese Knot", False)], None),
    64: ("Pastries", PASTRIES, [P(0, 0, "Almond Croissant", "Almond Croissant", False)], None),
    65: ("Pastries", PASTRIES, [P(0, 0, "Maple Pecan Plait", "Maple Pecan Plait", False)], None),
    66: ("Pastries", PASTRIES, [P(0, 0, "Chocolate Twist", "Chocolate Twist", False)], None),
    67: ("Sweet Treats", SWEET, [P(0, 0, "Cinnamon Bun", "Cinnamon Bun", False)], None),
    68: ("Large Cookies – 5 pack", COOKIES, [P(0, 0, "Milk Chocolate Cookie 5 pack", "Milk Chocolate Cookie", False),
                                            P(1, 1, "White Chocolate Cookie 5 pack", "White Chocolate Cookie", False)], None),
    69: ("Large Cookies – 5 pack", COOKIES, [P(0, 0, "Triple Chocolate Cookie 5 pack", "Triple Chocolate Cookie", False),
                                            P(1, 1, "Oat & Raisin Cookie 5 pack", "Oat & Raisin Cookie", False)], None),
    70: ("Large Cookie Single", COOKIES, [P(0, 0, "Large Rainbow cookie", "Large Rainbow Cookie", False)], None),
    71: ("Mini Cookies - 8 pack", COOKIES, [P(0, 0, "Mini Black Forest Cookies 8 pack", "Mini Black Forest Cookie", False)], None),
    72: ("Doughnuts", SWEET, [P(0, 0, "Jam Doughnut (4pk / Single)", "Jam Doughnut", False)], None),
    76: ("Mini Muffins 5 pack", SWEET, [P(0, 0, "Mini Chocolate Hazelnut Muffins", "Mini Chocolate Hazelnut Muffin", False),
                                       P(1, 1, "Mini Salted Caramel Hazelnut Muffins", "Mini Salted Caramel Hazelnut Muffin", False)], None),
    77: ("Mini Savoury Rolls 6 pack", SAVOURIES, [P(0, 0, "Mini Sausage Rolls", "Mini Sausage Roll", False),
                                                  P(1, 1, "Mini Cheese & Onion Rolls", "Mini Cheese & Onion Roll", False)],
         ["Mini Sausage Rolls (6 Pack)", "Mini Cheese & Onion Rolls (6 pack)"]),
    78: ("Heinz Sauces", SAUCES, [P(0, 0, "BBQ Sauce", "BBQ Sauce", False), P(1, 1, "Garlic Sauce", "Garlic Sauce", False),
                                  P(2, 2, "Sweet Chilli Sauce", "Sweet Chilli Sauce", False)], None),
}
# pages not published, with the reason (re-checked against the page on every run, so a changed guide stops the script)
EXCLUDED = {
    29: "Breakfast baps 'Dealer shops only' (the same names are published from pages 30-31)",
    73: "Peanuts cell of the allergen grid is empty: allergens cannot be read completely",
    74: "Peanuts cell of the allergen grid is empty: allergens cannot be read completely",
    75: "Peanuts cell of the allergen grid is empty, and the numbers repeat page 73's (25 g bite) for a 102 g product",
    79: "Nutrition printed per 100 g only (never converted)",
}
# items kept in items.csv but not published, with the reason (docs/DATA.md holdback.csv): the chain's OWN numbers contradict themselves
HOLDBACK = {
    "pain-aux-raisins": "Printed carbohydrate 8.2 g but sugars 22.2 g (sugars cannot exceed carbohydrate); 4P+4C+9F = 184 kcal against 341 kcal printed",
}
PORK = re.compile(r"\b(pork|bacon|ham|sausages?|pepperoni|salami|chorizo|gammon)\b", re.I)
BEEF = re.compile(r"\b(beef|[a-z]*steak)\b", re.I)
HEADER = re.compile(r"^per\s+([a-z][a-z ]*?)\s*\(\s*(\d+(?:\.\d+)?)\s*g\s*\)$", re.I)


def segments(ingredients: str, heads: list, where: str) -> list:
    """Split the ingredient box of a multi-product page at each product's own heading (each must appear, in order)."""
    starts, pos = [], 0
    for h in heads:
        i = ingredients.find(h, pos)
        if i < 0:
            raise SystemExit(f"{where}: ingredient heading {h!r} not found after position {pos}")
        starts.append(i)
        pos = i + len(h)
    starts.append(len(ingredients))
    return [ingredients[starts[k]:starts[k + 1]] for k in range(len(heads))]


def read_cell(key: str, text: str, where: str, page_text: str) -> tuple:
    """One allergen cell -> (state, cereals, nuts) with state in none / contains / may."""
    t = " ".join(text.replace("✓", " ✓ ").split())
    if t == "":
        raise SystemExit(f"{where}: empty {key} cell (the guide prints no mark): not publishable")
    if t == "X":
        return "none", set(), set()
    if t == "X *":
        if key not in ("milk", "eggs") or FOOTNOTE not in " ".join(page_text.split()):
            raise SystemExit(f"{where}: {key} cell 'X *' without the footnote about milk or egg allergies")
        return "may", set(), set()
    if t.startswith("✓"):
        rest = t[1:].strip()
        head = re.split(r"\bmay\b", rest, maxsplit=1, flags=re.I)[0]
        head = head.strip(" ,.;")
        cereals, nuts = set(), set()
        if head:
            if key not in ("gluten", "nuts"):
                raise SystemExit(f"{where}: {key} cell names {head!r}: only cereals and tree nuts are named")
            words = [w for w in re.split(r"[,/]|\band\b", head) if w.strip()]
            _, cereals, nuts = allergen_words(words, f"{where} {key}")
        return "contains", cereals, nuts
    if re.fullmatch(r"may contain( traces)?", t, flags=re.I):
        return "may", set(), set()
    raise SystemExit(f"{where}: unreadable {key} cell {t!r}")


def read_allergens(grid_col: list, where: str, page_text: str) -> dict:
    contains, may, cereals, nuts = set(), set(), set(), set()
    for key, text in grid_col:
        state, c, n = read_cell(key, text, where, page_text)
        if state == "contains":
            contains.add(key)
            cereals |= c
            nuts |= n
        elif state == "may":
            may.add(key)
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


def serving_and_weight(header: str, where: str) -> tuple:
    m = HEADER.match(" ".join(header.split()))
    if not m:
        raise SystemExit(f"{where}: unreadable nutrition header {header!r}")
    unit, weight = m.group(1).lower(), m.group(2)
    serving = f"{weight} g" if unit == "portion" else (f"Half, {weight} g" if unit == "half" else f"1 {unit}, {weight} g")
    return serving, weight


def check_excluded(pages: dict) -> list:
    """Every excluded page must still deserve its exclusion; returns lines for the report."""
    lines = []
    for page, reason in EXCLUDED.items():
        text = " ".join(w["text"] for w in pages[page])
        if page == 29:
            ok = "Dealer shops only" in " ".join(text.split())
        elif page == 79:
            ok = bool(re.search(r"\bPer 100g\b", text)) and not re.search(r"\bPer (Portion|Pack)\b", text, re.I)
        else:
            d = pdf_reader.read_product_page(pages[page], page)
            ok = dict(d["grid"][0])["peanuts"] == ""
            if page == 75:
                twin = pdf_reader.read_product_page(pages[73], 73)["nutrition"][0]
                ok = ok and all(d["nutrition"][0][k] == twin[k] for k in twin if k != "header")
        if not ok:
            raise SystemExit(f"page {page} was excluded because: {reason}. That no longer holds: the guide changed, re-read it.")
        lines.append(f"excluded page {page}: {reason}")
    return lines


def build(pdf: Path) -> tuple:
    pages = pdf_reader.read_pages(pdf)
    if len(pages) != PDF_PAGES:
        raise SystemExit(f"The guide now has {len(pages)} pages, expected {PDF_PAGES}: re-read it and update PAGES / EXCLUDED.")
    for p in DRINK_PAGES:  # the drinks pages must still print energy only
        text = " ".join(w["text"] for w in pages[p])
        if re.search(r"\b(Protein|Fat) \(g\)", text) or "kcal" not in text.lower():
            raise SystemExit(f"page {p} (a drinks page) no longer prints energy only: re-read the drinks pages")
    report = check_excluded(pages)
    expected_pages = set(PAGES) | set(EXCLUDED)
    unknown = sorted(set(range(DRINK_PAGES.stop, PDF_PAGES + 1)) - expected_pages)
    if unknown:
        raise SystemExit(f"Pages {unknown} are not in PAGES or EXCLUDED: the guide changed, re-read them.")
    items, meat_unstated = [], []
    for page, (heading, category, specs, heads) in sorted(PAGES.items()):
        where = f"page {page}"
        d = pdf_reader.read_product_page(pages[page], page)
        if heading not in " ".join(d["text"].split()):
            raise SystemExit(f"{where}: heading {heading!r} is not printed on the page")
        n_cols = len(d["grid"])
        if len({s["acol"] for s in specs}) != n_cols or any(s["acol"] >= n_cols or s["ncol"] >= len(d["nutrition"]) for s in specs):
            raise SystemExit(f"{where}: {n_cols} allergen columns and {len(d['nutrition'])} nutrition columns do not match PAGES")
        if heads is None and n_cols > 1:
            if PORK.search(d["ingredients"]) or BEEF.search(d["ingredients"]):
                raise SystemExit(f"{where}: meat words on a multi-product page without ingredient headings")
            segs = [d["ingredients"]] * n_cols
        else:
            segs = segments(d["ingredients"], heads, where) if heads else [d["ingredients"]]
        for s in specs:
            printed = " ".join(d["names"][s["acol"]].split())
            if s["printed"] not in printed:
                raise SystemExit(f"{where}: expected product {s['printed']!r} in column {s['acol']}, the page prints {printed!r}")
            nut = d["nutrition"][s["ncol"]]
            serving, weight = serving_and_weight(nut["header"], f"{where} {s['name']}")
            veg_cell, vegan_cell = d["diet"][s["acol"]]
            tags = ["vegetarian"] if veg_cell == "YES" else []
            ing = segs[s["acol"]]
            pork, beef = bool(PORK.search(s["name"] + " " + ing)), bool(BEEF.search(s["name"] + " " + ing))
            if pork:
                tags.append("contains_pork")
            if beef:
                tags.append("contains_beef")
            if veg_cell != "YES" and not pork and not beef:
                meat_unstated.append(s["name"])
            item = {"name": s["name"], "category": category, "serving": serving, "weight_g": weight,
                    "calories": nut["calories"], "protein_g": nut["protein_g"], "carbs_g": nut["carbs_g"], "fat_g": nut["fat_g"],
                    "sat_fat_g": nut["sat_fat_g"], "sugar_g": nut["sugar_g"], "salt_g": nut["salt_g"], "energy_kj": nut["energy_kj"],
                    "tags": "|".join(tags), "rankable": s["rankable"],
                    "allergens": read_allergens(d["grid"][s["acol"]], f"{where} {s['name']}", d["text"])}
            notes = [f"Page {page}, printed '{printed}', header '{nut['header']}'"]
            for field in ("sat_fat_g", "fat_g", "carbs_g", "sugar_g", "protein_g", "salt_g", "energy_kj", "calories"):
                if item[field].lower() == "trace":
                    notes.append(f"{field} printed 'Trace': left blank (not a number)")
                    item[field] = ""
            try:
                est = 4 * float(item["protein_g"]) + 4 * float(item["carbs_g"]) + 9 * float(item["fat_g"])
                gap = (est - float(item["calories"])) / float(item["calories"])
                if abs(gap) > 0.08:
                    notes.append(f"energy check: 4P+4C+9F = {est:.0f} kcal against {item['calories']} printed ({gap * 100:+.0f}%); entered as printed")
            except ValueError:
                pass  # a "<0.1" value: no check
            if "." in item["calories"]:
                notes.append(f"calories printed with a decimal ({item['calories']}); the pipeline rounds it")
            if beef and not re.search(r"\bbeef\b(?!\s+collagen)|steak", s["name"] + " " + ing, re.I):
                notes.append("beef only as the sausage's beef collagen casing")
            if vegan_cell.endswith("*"):
                notes.append("vegan cell printed with a footnote star (made to a vegan recipe, milk and egg allergen warning)")
            item["notes"] = "; ".join(notes)
            items.append(item)
    return items, report, meat_unstated


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="the guide PDF (SOURCE_URL)")
    ap.add_argument("--checked-on", required=True, help="the day the PDF was downloaded/read, YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"guide PDF sha256 {sha256_file(args.pdf)}  {args.pdf}")
    items, report, meat_unstated = build(args.pdf)
    holdback = []
    ids = {slug(i["name"]) for i in items}
    for item_id, reason in HOLDBACK.items():
        if item_id not in ids:
            raise SystemExit(f"HOLDBACK names {item_id!r} which is not an item")
        holdback.append((item_id, reason))
    out = write_chain_folder(chain_id=CHAIN_ID, name="Wild Bean Cafe", cuisine="Cafe", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    counts = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out} ({len(holdback)} held back): " + ", ".join(f"{c} {n}" for c, n in counts.items()))
    print(f"not vegetarian and no pork/beef tag ({len(meat_unstated)}; meat named in the ingredients, e.g. chicken): " + ", ".join(meat_unstated))
    return 0


if __name__ == "__main__":
    sys.exit(main())
