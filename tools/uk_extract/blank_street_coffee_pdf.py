"""Read Blank Street's official "UK Allergen Guide" PDF into products with their printed calories.

Used by tools/uk_extract/blank_street_coffee.py. Requires `pdftotext` (poppler). Numbers are returned exactly as printed (strings such
as "199"); nothing is converted, rounded or estimated here.

The file is 18 A4 pages with a text layer. Every page (except the ingredient-only page 8 and the index page 11) is a two-column list:

    LEFT column                      RIGHT column
    Latte                            With DAIRY: MILK, Grounded Coffee Bean, Water.
    Hot  | S - 120 | L - 199 kcal     May Contain - Oat (Gluten) | Vegetarian, Contains Caffeine
    Iced | S - 80  | L - 119 kcal     With OAT: OAT Drink [...], Grounded Coffee Bean.
                                     May Contain - Milk | Vegan, Vegetarian, Contains Caffeine

The left column holds the product name and its calories, the right column its ingredient and allergen declaration (one block per milk
for drinks, one block for food) which ends with the guide's own dietary words ("Vegetarian", "Vegan, Vegetarian", "Contains Caffeine").
Section headings are centred capitals. Reading is done per page with `pdftotext -layout`:

  1. a page's right column starts at the column where its "With DAIRY:" / "May Contain" lines start; everything left of it is the left
     column (a character of right-column text never sits left of that column: checked, the run stops otherwise);
  2. left lines are name lines or calorie lines (digits, "S - n | L - n", "Hot"/"Iced"/"Hot/Iced", optional "kcal"); a product is its
     name line(s) followed by its calorie line(s);
  3. right lines are cut into blocks at the dietary words; a "With DAIRY:" block and the "With OAT:" block after it are one product;
  4. the n-th product on the left is the n-th group on the right (the counts must agree, or the run stops).

Anything that does not fit raises SystemExit, so a new layout stops the run instead of attaching a number to the wrong product.
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

PAGES = 18
SKIP_PAGES = {8: "INGREDIENTS", 11: "Continue reading below"}     # ingredient-only page, city index page
# Section headings, exactly as printed (centred capitals). Anything else in capitals on a product page stops the run.
SECTIONS = ["COFFEE", "NOT COFFEE & TEAS", "COLD BREW", "MATCHAS", "HOUSE LATTES", "SIGNATURE ICE CREAM", "CUSTOM",
            "PASTRIES - LONDON STORES", "MANCHESTER PASTRIES & SAVOURIES", "BIRMINGHAM PASTRIES & SAVOURIES",
            "SCOTLAND PASTRIES & SWEETS", "LEEDS PASTRIES & SWEETS", "CAMBRIDGE PASTRIES & SWEETS",
            "BRISTOL PASTRIES & SWEETS", "BRIGHTON PASTRIES & SWEETS"]
PAGE1_HEADER = {"INGREDIENT LIST", "PRODUCT NAME", "INGREDIENT & ALLERGEN DECLARATION", "kcal"}
KCAL_LINE = re.compile(
    r"^(?:(?P<temp>Hot/Iced|Hot|Iced)\s*[|\-–]?\s*)?"
    r"(?:S\s*[-–]\s*(?P<s>\d+)\s*\|\s*L\s*[-–]\s*(?P<l>\d+)|(?P<n>\d+))\s*(?P<unit>kcal)?$", re.I)
RIGHT_START = re.compile(r"^\s*(With (DAIRY|OAT):|May Contain)")
# A block of ingredient text ends on a line carrying the guide's dietary words.
BLOCK_END = re.compile(r"(Vegetarian|Vegan|Contains Caffeine)\s*$")


def _page_text(pdf: Path, page: int) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         check=True, capture_output=True, text=True).stdout
    return out.replace("\f", "").split("\n")


def _is_heading(line: str) -> bool:
    s = line.strip()
    return bool(s) and s == s.upper() and any(c.isalpha() for c in s) and not KCAL_LINE.match(s) and s != "kcal"


def _split_page(lines: list[str], page: int) -> tuple[list[tuple[str, str]], list[str]]:
    """-> (left lines in order, right lines in order). The left list holds ('L', text) for left-column text and ('#', heading) for a
    section heading (headings are centred, so they are taken from the whole line)."""
    starts = [len(ln) - len(ln.lstrip()) for ln in lines if RIGHT_START.match(ln)]
    if not starts:
        raise SystemExit(f"page {page}: no 'With DAIRY:'/'May Contain' line found, the layout changed")
    b = min(starts)
    left, right = [], []
    for ln in lines:
        if not ln.strip():
            continue
        if _is_heading(ln):
            heading = " ".join(ln.split())
            if heading not in SECTIONS and not (page == 1 and heading in PAGE1_HEADER):
                raise SystemExit(f"page {page}: unknown heading {heading!r}, the layout changed (add it to SECTIONS after reading the page)")
            left.append(("#", heading))
            continue
        if page == 1 and " ".join(ln.split()) in PAGE1_HEADER:
            continue
        head, tail = ln[:b], ln[b:]
        if len(ln) > b and head and not head[-1].isspace():
            raise SystemExit(f"page {page}: text crosses the column edge in {ln!r}")
        if head.strip():
            left.append(("L", head.strip()))
        if tail.strip():
            right.append(tail.strip())
    return left, right


def read_products(pdf: Path) -> list[dict]:
    """-> [{section, name, kcal: [{temp, s, l, n, unit}], variants: [text, ...], marks: [set of dietary words per variant]}]"""
    products: list[dict] = []
    left_all: list[tuple[str, str]] = []
    right_all: list[str] = []
    for page in range(1, PAGES + 1):
        lines = _page_text(pdf, page)
        if page in SKIP_PAGES:
            if SKIP_PAGES[page] not in " ".join(" ".join(lines).split()):
                raise SystemExit(f"page {page} no longer starts as expected ({SKIP_PAGES[page]!r})")
            if page == 11:
                text = " ".join(" ".join(lines).split())
                for city in ("MANCHESTER", "BIRMINGHAM", "SCOTLAND", "LEEDS", "CAMBRIDGE", "BRISTOL", "BRIGHTON"):
                    if city not in text:
                        raise SystemExit(f"page 11 no longer lists {city}")
            continue
        left, right = _split_page(lines, page)
        left_all += left
        right_all += right
    # left column -> products
    section = None
    cur = None
    for kind, text in left_all:
        if kind == "#":
            if text in PAGE1_HEADER:
                continue
            section, cur = text, None
            continue
        if section is None:
            raise SystemExit(f"left text {text!r} before any section heading")
        m = KCAL_LINE.match(text)
        if m:
            if cur is None or not cur["name"]:
                raise SystemExit(f"{section}: calorie line {text!r} without a product name")
            cur["kcal"].append({"temp": (m.group("temp") or "").lower(), "s": m.group("s"), "l": m.group("l"), "n": m.group("n"),
                                "unit": m.group("unit") or "", "printed": text})
            cur["done_name"] = True
        else:
            if cur is None or cur.get("done_name"):
                cur = {"section": section, "name": text, "kcal": [], "variants": [], "marks": []}
                products.append(cur)
            else:
                cur["name"] += " " + text
    for p in products:
        p.pop("done_name", None)
        if not p["kcal"]:
            raise SystemExit(f"{p['section']}: {p['name']!r} has no calorie line")
    # right column -> variants (blocks ending on the dietary words) -> groups (DAIRY + OAT pairs)
    variants: list[str] = []
    buf: list[str] = []
    for item in right_all:
        buf.append(item)
        if BLOCK_END.search(item):
            variants.append(" ".join(buf))
            buf = []
    if buf:
        raise SystemExit(f"text after the last dietary words: {' '.join(buf)[:120]!r}")
    groups: list[list[str]] = []
    for v in variants:
        if v.startswith("With OAT:"):
            if not groups or not groups[-1][0].startswith("With DAIRY:") or len(groups[-1]) != 1:
                raise SystemExit(f"'With OAT:' block without its 'With DAIRY:' block: {v[:80]!r}")
            groups[-1].append(v)
        else:
            groups.append([v])
    for g in groups:
        if g[0].startswith("With DAIRY:") and len(g) != 2:
            raise SystemExit(f"'With DAIRY:' block without its 'With OAT:' block: {g[0][:80]!r}")
    if len(groups) != len(products):
        raise SystemExit(f"{len(products)} products on the left but {len(groups)} ingredient blocks on the right: the layout changed")
    for p, g in zip(products, groups):
        p["variants"] = g
        p["marks"] = [{w for w in ("Vegan", "Vegetarian") if re.search(r"\b%s\b" % w, v[-60:])} for v in g]
        milk_drink = g[0].startswith("With DAIRY:")
        # a drink with both milks is only in the drink sections; food sections never have a milk choice
        if milk_drink and p["section"] in ("SIGNATURE ICE CREAM", "CUSTOM") or milk_drink and "PASTRIES" in p["section"]:
            raise SystemExit(f"{p['name']!r}: milk variants in {p['section']}, expected only in drink sections")
    return products
