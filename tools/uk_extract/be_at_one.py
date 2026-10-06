#!/usr/bin/env python3
"""Build data/source/be-at-one/ from Be At One's own "Allergen & Nutritional Data" menus (hosted by Ten Kites).

    python3 tools/uk_extract/be_at_one.py --pages DIR --checked-on 2026-10-06 [--fetch]

DIR holds the saved pages beatone_snacks.html (Bar Snacks), beatone_drinks.html (Drinks Menu) and
beatone_cocktailweek.html (Cocktail Week); --fetch downloads them first (one request per second). The pages are
linked from beatone.co.uk/menus ("find all our Allergens here"). Be At One is a cocktail bar and prints protein, carbs and
fat for only part of its menu, so ONLY dishes and drinks whose calories, protein, carbs and fat are all printed are
published; everything else is left out (see NOTE). Numbers are copied from each item's "Nutritional info" grid exactly as
printed (kcal, protein, carbs, sugars, fat, saturates, salt; kJ is not used). The page does not label the basis: the kcal in
the grid is the kcal printed beside the item name, so the figures are per item as served.

Other menus on the same site (Halloween, Cocktail Wonderland, Off Menu Cocktails, Collaboration, Espress-Yo Self, MIXR
Bakewell) were read once and hold no item with all four macros except the fruit choices of "Off Menu Cocktails", which are
parts of a drink whose total is blank, so they are not part of this run.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "be-at-one"
BASE = "https://menus.tenkites.com/beatone"
PAGES = {  # tab -> (file, url, items expected on the page, limited time)
    "snacks": ("beatone_snacks.html", BASE + "?mguid=950c929f-775e-4d16-8aa9-3ebace011ac4", 9, False),
    "drinks": ("beatone_drinks.html", BASE, 146, False),
    "cocktailweek": ("beatone_cocktailweek.html", BASE + "?mguid=1eadb863-8709-40c7-9df2-d6c65442f5a8", 16, True),
}
# first printed section -> category shown
CATEGORY = {
    "Bar Snacks": "Bar snacks", "Popcorn": "Bar snacks", "Sweet Treats": "Sweet treats",
    "Alcohol-Free": "Alcohol-free cocktails", "Alcohol-Free Beer": "Alcohol-free beer", "Beer - Alcohol Free": "Alcohol-free beer",
    "Non-Alcoholic Cocktails": "Non-alcoholic cocktails",
}
MARK = re.compile(r"\s*\((V|VG|VG-M)\)\s*$")  # the chain's own diet mark, written after the name
NOTES = {"Cucumber Tom Collins 0%": "Printed kJ (584) agrees with the 140 kcal; the gap is with the energy of the printed macros",
         "Sweet Treats": "Described as 'The perfect pick-and-mix combo'; the number of sweets is not stated",
         "Rhubarb Hugo 0% - PM": "Printed with the same numbers as Rhubarb Hugo 0%; the '- PM' is not explained on the page"}
# The same pages print each item's "Dietary info" ("Contains: ..." naming the cereals and nuts, "Dish ingredients may also
# contain: ...") and carry the label ids of the page's own allergen filter; tenkites_c.allergens_checked cross-checks the two.
ALLERGEN_EXTRA = {"sulphur dioxide/ sulphites": ("sulphites", None)}   # printed with a space after the slash
ALLERGEN_TITLE = ("Be At One Allergen & Nutritional Data: Bar Snacks (March 2026), Drinks Menu (March 2026) and Cocktail Week "
                  "(October 2026), data correct as of 06 October 2026")
SOURCE_TITLE = "Be At One Allergen & Nutritional Data: Bar Snacks (March 2026), Drinks Menu (March 2026) and Cocktail Week (October 2026)"
NOTE = ("Only items with calories, protein, carbs and fat all printed are included: the bar snacks and the non-alcoholic drinks. "
        "Be At One prints no macros for its alcoholic cocktails, wine or beer, nor a total for items with a choice (dips, fruit).")


def build(pages_dir: Path) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    items, report = [], []
    left_out = {"parts of an item with a choice (printed without a total)": 0, "no protein, carbs or fat printed": 0}
    for tab, (fname, _, expected, limited) in PAGES.items():
        rows = tk.read_box_layout((pages_dir / fname).read_text(encoding="utf-8"))
        if len(rows) != expected:
            raise SystemExit(f"{fname} has {len(rows)} items but this script expects {expected}: the menu changed, "
                             "re-check CATEGORY and the expected counts before running again.")
        for r in rows:
            nums, missing = tk.numbers(r["nutrients"], f"{fname} {r['name']}", extras=True)
            if missing:
                left_out["no protein, carbs or fat printed"] += 1
                continue
            if r["kind"] != "item":
                left_out["parts of an item with a choice (printed without a total)"] += 1
                continue
            first = r["section"].split(" > ")[0]
            if first not in CATEGORY:
                raise SystemExit(f"{fname}: new section {first!r} with full macros: add it to CATEGORY.")
            raw_name = r["name"]
            mark = MARK.search(raw_name)
            name = MARK.sub("", raw_name)
            serving = ""
            m = re.search(r"\s+-\s+(\d+\s?ml)$", name)
            if m:
                name, serving = name[: m.start()], m.group(1).replace(" ", "")
            notes = [NOTES[name]] if name in NOTES else []
            tags = ["vegetarian"] if mark and mark.group(1) in ("V", "VG") else []
            if mark and mark.group(1) == "VG-M":
                notes.append("Marked (VG-M) by the chain; the mark is not explained on the page, so no vegetarian tag")
            meat, unspecified = tk.meat_tags(name, r["desc"], vegetarian=bool(tags))
            if unspecified:
                report.append(f"meat type not stated: {name}")
            items.append({"id": slug(name), "name": name, "category": CATEGORY[first], "serving": serving, **nums,
                          "tags": "|".join(tags + meat), "limited_time": limited, "rankable": False,
                          "notes": "; ".join(notes), "allergens": tk.allergens_checked(r, f"{fname} {name}", ALLERGEN_EXTRA)})
    report += [f"allergens: {n!r} is printed twice with the same numbers but different allergens: not used"
               for n in tk.allergen_conflicts(items)]
    report += [f"allergens: no allergen information to read for {i['name']!r}" for i in items if i["allergens"] is None]
    kept, dropped = tk.dedupe_items(items)
    report += [f"dropped exact duplicate: {n}" for n in dropped]
    report += [f"left out {n} entries: {why}" for why, n in left_out.items()]
    for it in kept:
        extra = tk.annotate(it)
        if extra:
            it["notes"] = "; ".join(filter(None, [it["notes"], *extra]))
            report += [f"{it['name']}: {n}" for n in extra]
    return kept, [], report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you compared the pages with the live menus")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        for fname, url, _, _ in PAGES.values():
            tk.fetch(url, args.pages / fname)
    items, holdback, report = build(args.pages)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Be At One", cuisine="Cocktail bar", source_title=SOURCE_TITLE,
                             source_url=BASE, checked_on=args.checked_on, aliases=["be at one", "beatone", "be-at-one"],
                             items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": BASE, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    for fname, _, _, _ in PAGES.values():
        print(f"{fname} sha256 {tk.sha256_text_file(args.pages / fname)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
