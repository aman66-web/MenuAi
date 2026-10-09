#!/usr/bin/env python3
"""Build data/source/mowgli/ from Mowgli Street Food's own Food menu page (a CALORIES-ONLY chain).

    python3 tools/uk_extract/mowgli.py path/to/food.html --allergen-pdf path/to/matrix.pdf --checked-on 2026-10-08 [--out DIR]

Written first as a scratch copy (scratchpad/uk/x-mowgli/) because the founder's rule for that run was "if the page hides its
nutrition from visitors (CSS display:none, hidden elements) do NOT publish". On this page every calorie figure is a
<span class="calorie-info"> that the page's own script sets to display:none on load; a visitor sees the figures only after opening the
"Allergens" button's panel and ticking "Calorie information". The chain has since been installed (data/source/mowgli, git 52d32c1); the
founder is still to confirm that they accept that opt-in toggle as published (data/audit/verified/mowgli.json).

Source: https://mowglistreetfood.com/menus/food/ (WordPress page, no date shown; robots.txt allows it). Each dish prints "(575 kcal)"
and nothing else numeric: no protein, carbs, fat, serving, weight, kJ, salt (calories-only chain, docs/DATA.md). Calories are copied from
the HTML as printed; names, categories and tags come from the same elements (h2/h3 text, V/Vg/Ng marks). The script stops if the page's
structure or counts change. The four "The Light Kitchen" dishes are <h2 class="featured-dish__title">, the rest <h3> inside
<div class="menu-item" data-allergens=...>.

Duplicates: the four Ice Cream Cones are printed twice (Kids Menu and Sweet) with identical calories; kept once, under Sweet.
Tags: vegetarian when the page's own mark list has V or Vg (data-vegetarian agrees on every dish: checked). contains_pork /
contains_beef only when the dish's name or description says so (none do).

ALLERGENS (docs/DATA.md "Allergens", added 2026-10-08). Two official sources of the chain, both read by this script:
  1. the page itself: every dish card carries data-allergens="..." (the list the page's own "Allergens" filter hides dishes by), which
     ties the allergens to the dish exactly (same card as its name and calories);
  2. the page's "View Allergens Matrix PDF" link, the Brighton restaurant's matrix (Mowgli-Mv35 v3, Rev 35), read by mowgli_matrix.py
     (python3 tools/uk_extract/mowgli.py food.html --allergen-pdf matrix.pdf ...).
The page list is what is published. Wherever the matrix has a row for the dish the two must give the same set of allergens (the matrix's
"(tick) Optional ingredient" ticks count as present, as the page does), or the dish is HELD BACK (holdback.csv), never chosen between.
Where the matrix names the dish exactly the same way, its cereal / tree nut kinds (WHEAT, BARLEY, OAT, ALMONDS) are copied too. Seven
dishes are named differently in the matrix (ALIAS below: the page's kids dishes are the matrix's MINI MOWGLI rows, etc.): those are
cross-checked on the set of allergens only and published without kinds. Neither source prints a per-dish "may contain" (the matrix header
only says suppliers may have added warnings), so may_contain_published = no and the app says so.
"""
from __future__ import annotations
import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import mowgli_matrix  # noqa: E402
from common import allergen_words, sha256_file, slug as _slug, write_chain_folder  # noqa: E402

CHAIN_ID = "mowgli"
SOURCE_URL = "https://mowglistreetfood.com/menus/food/"
SOURCE_TITLE = "Mowgli Street Food website, Food menu with calorie information (accessed {day}, no date shown)"
ALLERGEN_GUIDE_TITLE = "Mowgli allergen matrix, Brighton (Mowgli-Mv35 v3, Rev 35; PDF created 2 October 2026)"
ALLERGEN_GUIDE_URL = "https://mowglistreetfood.com/wp-content/uploads/2026/10/Mowgli-Mv35_Allergen-Matrix_Brighton_v3.pdf"
NOTE = ("Calories only, as printed beside each dish on Mowgli's Food menu page (the page shows them when you tick 'Calorie information'). "
        "No serving sizes, protein, carbs or fat are published. Drinks are not on that page.")
EXPECTED_SECTIONS = ["The Light Kitchen", "Street Plates", "The House Kitchen", "Curry Companions", "Kids Menu", "Sweet"]
EXPECTED_PRINTED = 50   # calorie figures on the page
EXPECTED_ITEMS = 46     # after dropping the 4 Kids Menu ice cream cones that repeat the Sweet ones
PORK = re.compile(r"\b(pork|bacon|ham|sausage|chorizo|salami|pepperoni)\b", re.I)
BEEF = re.compile(r"\b(beef|steak)\b", re.I)
PAGE_ALLERGEN_WORDS = {"sulphur": ("sulphites", None)}   # the page's filter calls sulphur dioxide and sulphites "sulphur"
# page dish name -> the matrix's own row for it where the two name it differently (cross-check on the set of allergens only)
ALIAS = {
    "Maa’s Lamb Chops": "Maa’s Lamb Chops & Fries",
    "Garlic Butter Paratha": "Garlic & Coriander Paratha",
    "Kids Mowgli Chocolate Brownie": "Kids Brownie",
    "Kids Mother Butter Chicken & Rice": "Mother Butter Chicken & Rice",
    "Kids House Chicken Curry & Rice": "House Chicken Curry & Rice",
    "Kids Mowgli Paneer & Rice": "Mowgli Paneer & Rice",
    "Kids Temple Dahl & Rice": "Temple Dahl & Rice",
}


def clean(s: str) -> str:
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


def read_dishes(page: str) -> list[dict]:
    start, end = page.find('<div class="menu-sections row">'), page.find("</main>")
    if start < 0 or end < 0:
        raise SystemExit("menu-sections block not found: the page layout changed")
    body = page[start:end]
    n_printed = body.count('class="calorie-info')
    if n_printed != EXPECTED_PRINTED:
        raise SystemExit(f"{n_printed} calorie figures on the page, expected {EXPECTED_PRINTED}")
    heads = [(m.start(), clean(m.group(1))) for m in re.finditer(r'<div class="menu-section[^"]*" id="menu-section-[^"]+"><h2[^>]*>(.*?)</h2>', body)]
    feat = re.search(r'<h2 class="heading">(.*?)</h2>', body)
    heads.insert(0, (feat.start(), clean(feat.group(1))))
    if [h for _, h in heads] != EXPECTED_SECTIONS:
        raise SystemExit(f"sections changed: {[h for _, h in heads]}")
    dishes = []
    pat = re.compile(r'<div class="(?:featured-dish__details|menu-item)" data-allergens="([^"]*)" data-vegan="(\d)" data-vegetarian="(\d)"[^>]*>(.*?)(?=<div class="(?:featured-dish__details|menu-item)" data-allergens|<div class="menu-section|</main>|$)', re.S)
    for m in pat.finditer(body):
        block = m.group(4)
        if "calorie-info" not in block:
            raise SystemExit("a dish block has no calorie figure")
        title = re.search(r"<h[23][^>]*>(.*?)</h[23]>", block, re.S)
        kcal = re.search(r'<span[^>]*class="calorie-info[^"]*">\((\d+) kcal\)</span>', title.group(1)) if title else None
        if not kcal:
            raise SystemExit(f"cannot read a dish title/calories near: {clean(block)[:80]!r}")
        marks_m = re.search(r'<span[^>]*dietary-labels[^>]*>([^<]*)</span>', title.group(1))
        name = clean(re.sub(r"<span.*?</span>", "", title.group(1), flags=re.S))
        marks = [x.strip() for x in (marks_m.group(1) if marks_m else "").split("/") if x.strip()]
        desc = re.search(r'<p class="(?:description|featured-dish__description)">(.*?)</p>', block, re.S)
        section = [h for p, h in heads if p < m.start()][-1]
        if ("V" in marks) != (m.group(3) == "1") or ("Vg" in marks) != (m.group(2) == "1"):
            raise SystemExit(f"{name}: printed marks {marks} disagree with the page's data-vegetarian/data-vegan")
        dishes.append(dict(name=name, section=section, kcal=kcal.group(1), marks=marks, desc=clean(desc.group(1)) if desc else "",
                           allergen_words=[w for w in m.group(1).split(",") if w.strip()]))
    return dishes


def _norm(name: str) -> str:
    """Matrix and page spell the same dish name with different dashes and 'Cone'/'Cones'; nothing else is treated as the same."""
    n = name.replace("–", "-").replace("’", "'").lower()
    n = re.sub(r"\s*-\s*", " ", n)
    n = re.sub(r"\bcones\b", "cone", n)
    return " ".join(n.split())


def attach_allergens(d: dict, row: dict | None, exact: bool) -> tuple:
    """-> (allergens dict for write_allergens, hold-back reason or None). The page's list is the published one; `row` is the
    matrix's row for the dish (or None); `exact` = the matrix names the dish the same way (then its cereal / nut kinds are copied)."""
    keys, _, _ = allergen_words(d["allergen_words"], f"page dish {d['name']!r}", PAGE_ALLERGEN_WORDS)
    a = {"contains": set(keys), "may_contain": set(), "cereals": set(), "nuts": set()}
    if row is None:
        return a, None
    m_keys = set(row["contains"])
    if m_keys != keys:
        optional = sorted(k for k, o in row["contains"].items() if o)
        return a, (f"Mowgli's own documents disagree about this dish's allergens: its menu page lists {sorted(keys) or 'none'}, its allergen matrix "
                   f"row '{row['name']}' lists {sorted(m_keys) or 'none'}" + (f" (optional ingredient ticks: {optional})" if optional else "") +
                   ". Nothing is chosen between them.")
    if exact:
        for key, target in (("gluten", "cereals"), ("nuts", "nuts")):
            if key in row["kinds"] and row["kinds"][key]:
                _, c, n = allergen_words(row["kinds"][key], f"matrix row {row['name']!r}")
                a[target] |= c if key == "gluten" else n
    return a, None


def build_items(dishes: list[dict], matrix_rows: list[dict] | None = None) -> tuple:
    if len(dishes) != EXPECTED_PRINTED:
        raise SystemExit(f"read {len(dishes)} dishes, expected {EXPECTED_PRINTED}")
    by_norm: dict = {}
    for r in matrix_rows or []:
        if _norm(r["name"]) in by_norm:
            raise SystemExit(f"the matrix names two rows {r['name']!r}")
        by_norm[_norm(r["name"])] = r
    items, seen, holdback, used, page_only = [], {}, [], set(), []
    for d in dishes:
        key = d["name"]
        if key in seen:
            if seen[key]["calories"] != d["kcal"] or seen[key]["tags"] != _tags(d):
                raise SystemExit(f"{key!r} is printed twice with different values: hold it back by hand")
            if sorted(set(d["allergen_words"])) != seen[key]["_page_words"]:
                raise SystemExit(f"{key!r} is printed twice with different allergens: it must not be published")
            continue  # identical repeat (Kids Menu cones); the first one wins
        it = dict(name=d["name"], category=d["section"], calories=d["kcal"], tags=_tags(d), rankable=False,
                  notes=f"marks: {' '.join(d['marks']) or 'none'}")
        it["_page_words"] = sorted(set(d["allergen_words"]))
        exact = by_norm.get(_norm(d["name"]))
        alias = by_norm.get(_norm(ALIAS[d["name"]])) if d["name"] in ALIAS else None
        if exact is not None and alias is not None:
            raise SystemExit(f"{d['name']!r} has an exact matrix row and an ALIAS: remove the alias")
        if d["name"] in ALIAS and alias is None:
            raise SystemExit(f"ALIAS {d['name']!r} -> {ALIAS[d['name']]!r}: the matrix has no such row any more")
        row = exact or alias
        if matrix_rows is not None:
            if row is not None:
                used.add(row["name"])
            else:
                page_only.append(d["name"])
        it["allergens"], reason = attach_allergens(d, row, exact is not None)
        if reason:
            holdback.append((_slug(d["name"]), reason))
        seen[key] = it
        items.append(it)
    for it in items:
        del it["_page_words"]
    # the cones are first read under Kids Menu: file them under Sweet, where the chain lists them last
    for it in items:
        if it["name"].startswith("Ice Cream Cone"):
            it["category"] = "Sweet"
            it["notes"] += "; also listed under Kids Menu with the same value"
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"built {len(items)} items, expected {EXPECTED_ITEMS}: the menu changed")
    if matrix_rows is not None:
        unused = [r["name"] for r in matrix_rows if r["name"] not in used]
        print(f"allergens: {len(items) - len(page_only)} dishes cross-checked against a matrix row ({len(ALIAS)} by ALIAS), "
              f"{len(page_only)} on the page only: {page_only}")
        print(f"matrix rows with no dish on the food page (vegan variants, the Brighton exclusive): {unused}")
    return items, holdback


def _tags(d: dict) -> str:
    tags = []
    if "V" in d["marks"] or "Vg" in d["marks"]:
        tags.append("vegetarian")
    text = d["name"] + " " + d["desc"]
    if PORK.search(text):
        tags.append("contains_pork")
    if BEEF.search(text):
        tags.append("contains_beef")
    return "|".join(tags)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("html", type=Path)
    ap.add_argument("--checked-on", required=True)
    ap.add_argument("--allergen-pdf", type=Path, required=True, help="the 'View Allergens Matrix PDF' file (ALLERGEN_GUIDE_URL)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"page sha256 {sha256_file(args.html)}  {args.html}")
    print(f"matrix sha256 {sha256_file(args.allergen_pdf)}  {args.allergen_pdf}")
    items, holdback = build_items(read_dishes(args.html.read_text(encoding="utf-8")), mowgli_matrix.read_rows(args.allergen_pdf))
    # no per-dish "may contain" is printed anywhere (see the docstring), so the app is told the guide doesn't say
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": False}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Mowgli Street Food", cuisine="Indian", source_title=SOURCE_TITLE.format(day=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["mowgli", "mowgli street food"], items=items,
                             out=args.out, note=NOTE, allergen_guide=guide, holdback=holdback, nutrition_level="calories")
    print(f"wrote {len(items)} items ({len(holdback)} held back for disagreeing allergen lists) to {out}")
    for item_id, reason in holdback:
        print(f"  held back {item_id}: {reason}")


if __name__ == "__main__":
    main()
