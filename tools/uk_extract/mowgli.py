#!/usr/bin/env python3
"""Build data/source/mowgli/ from Mowgli Street Food's own Food menu page (a CALORIES-ONLY chain).

    python3 tools/uk_extract/mowgli.py path/to/food.html --checked-on 2026-10-07 [--out DIR]

SCRATCH COPY, NOT INSTALLED: written to scratchpad/uk/x-mowgli/ because the founder's rule for this run is "if the page hides its
nutrition from visitors (CSS display:none, hidden elements) do NOT publish". On this page every calorie figure is a
<span class="calorie-info"> that the page's own script sets to display:none on load; a visitor sees the figures only after opening the
"Allergens" button's panel and ticking "Calorie information". To install, the founder must first accept that opt-in toggle as published.

Source: https://mowglistreetfood.com/menus/food/ (WordPress page, no date shown; robots.txt allows it). Each dish prints "(575 kcal)"
and nothing else numeric: no protein, carbs, fat, serving, weight, kJ, salt (calories-only chain, docs/DATA.md). Calories are copied from
the HTML as printed; names, categories and tags come from the same elements (h2/h3 text, V/Vg/Ng marks). The script stops if the page's
structure or counts change. The four "The Light Kitchen" dishes are <h2 class="featured-dish__title">, the rest <h3> inside
<div class="menu-item" data-allergens=...>.

Duplicates: the four Ice Cream Cones are printed twice (Kids Menu and Sweet) with identical calories; kept once, under Sweet.
Tags: vegetarian when the page's own mark list has V or Vg (data-vegetarian agrees on every dish: checked). contains_pork /
contains_beef only when the dish's name or description says so (none do). Allergens: link only (the Brighton allergen matrix PDF is
the page's own "View Allergens Matrix PDF" link).
"""
from __future__ import annotations
import argparse
import html
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import sha256_file, write_chain_folder  # noqa: E402

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
    pat = re.compile(r'<div class="(?:featured-dish__details|menu-item)" data-allergens="[^"]*" data-vegan="(\d)" data-vegetarian="(\d)"[^>]*>(.*?)(?=<div class="(?:featured-dish__details|menu-item)" data-allergens|<div class="menu-section|</main>|$)', re.S)
    for m in pat.finditer(body):
        block = m.group(3)
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
        if ("V" in marks) != (m.group(2) == "1") or ("Vg" in marks) != (m.group(1) == "1"):
            raise SystemExit(f"{name}: printed marks {marks} disagree with the page's data-vegetarian/data-vegan")
        dishes.append(dict(name=name, section=section, kcal=kcal.group(1), marks=marks, desc=clean(desc.group(1)) if desc else ""))
    return dishes


def build_items(dishes: list[dict]) -> list[dict]:
    if len(dishes) != EXPECTED_PRINTED:
        raise SystemExit(f"read {len(dishes)} dishes, expected {EXPECTED_PRINTED}")
    items, seen = [], {}
    for d in dishes:
        key = d["name"]
        if key in seen:
            if seen[key]["calories"] != d["kcal"] or seen[key]["tags"] != _tags(d):
                raise SystemExit(f"{key!r} is printed twice with different values: hold it back by hand")
            continue  # identical repeat (Kids Menu cones); the first one wins
        it = dict(name=d["name"], category=d["section"], calories=d["kcal"], tags=_tags(d), rankable=False,
                  notes=f"marks: {' '.join(d['marks']) or 'none'}")
        seen[key] = it
        items.append(it)
    # the cones are first read under Kids Menu: file them under Sweet, where the chain lists them last
    for it in items:
        if it["name"].startswith("Ice Cream Cone"):
            it["category"] = "Sweet"
            it["notes"] += "; also listed under Kids Menu with the same value"
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"built {len(items)} items, expected {EXPECTED_ITEMS}: the menu changed")
    return items


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
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    print(f"page sha256 {sha256_file(args.html)}  {args.html}")
    items = build_items(read_dishes(args.html.read_text(encoding="utf-8")))
    guide = {"title": ALLERGEN_GUIDE_TITLE, "url": ALLERGEN_GUIDE_URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Mowgli Street Food", cuisine="Indian", source_title=SOURCE_TITLE.format(day=args.checked_on),
                             source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["mowgli", "mowgli street food"], items=items,
                             out=args.out, note=NOTE, allergen_guide=guide, nutrition_level="calories")
    print(f"wrote {len(items)} items to {out}")


if __name__ == "__main__":
    main()
