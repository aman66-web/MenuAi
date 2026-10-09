#!/usr/bin/env python3
"""Build data/source/pgl-travel/ from PGL Travel's own "UK Families Menu Week 1 2026" allergen and nutrition page (hosted by Ten Kites).

    python3 tools/uk_extract/pgl_travel.py --page DIR/pgl02.html --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://menus.tenkites.com/pgltravel/pgl02 (robots.txt of menus.tenkites.com disallows only /fonts/, /views/ and *.less; the
photo host images.tenkites.com disallows everything, so no photos are taken). The page carries no date, only the menu name
"UK Families Menu Week 1 2026". It is a weekly rota for PGL's children's activity-holiday centres: Monday to Sunday, each with breakfast,
lunch and dinner sections, plus a packed lunch. This is NOT a restaurant menu (nobody orders a dish) and other weeks (Week 2) and the
2027 menu are other pages that are not read here.

What is read (see pgl_travel_pages.py): for every dish and every size row the page prints, the pop-up's "Nutrition (per portion)" table
(kcal, protein, carbohydrate, sugars, fat, saturates, fibre, salt: exactly as printed, "-" = not published) and its "Contains:" /
"May contain:" lines, which are checked against the label ids the page's own allergen filter reads. Rules applied:
- The "100g" size every dish carries is the reference weight, not a serving: it is skipped (the script proves its per-portion table equals
  the per-100g one). The page's JSON-LD block is not used: its numbers are rounded and, for some dishes, are the per-100g row.
- A dish repeated on several days is ONE item when every copy prints identical numbers and allergens. If copies ever differ the item is
  listed in holdback.csv (never chosen between). Today all 224 printed dishes collapse to 99 names with no differences.
- A dish with a child and an adult size becomes two items "X (child's serving)" / "X (adult serving)"; `serving` is the size text as printed
  (spaces tidied). A dish with a single size, or with no size row (desserts, yoghurt, packed-lunch snacks: "per portion" only), keeps its name.
  Portion weights are not printed, so weight_g stays blank.
- Dishes that print no numbers at all ("Fresh Fruit", "Plant-based milk alternatives available on request") are left out.
- Names are as printed, including the footnote stars (note.txt gives the page's own footnotes); only the leading "or " of the choice line
  "or Jacket Potato Wedges" is dropped.
- Hold back (never correct) an item whose own numbers are impossible: saturates above fat, or sugars above carbohydrate.
- Allergens: all 14 from the page's own pop-ups, checked against the filter ids; every published item has a row (complete).
- Tags: vegetarian only where the page's "Suitable for" line says Vegetarian or Vegan (cross-checked with its V / VE badges); contains_pork /
  contains_beef only where the dish name or the page's own description says so ("Sausage ... in a beef casing" is beef; ham is pork by the page's footnote).
- rankable: only whole mains (Main Course Options, pizzas, burgers, sandwiches, omelette, toast, cereal, ...) in the adult or single serving; parts of a plate,
  sides, desserts, fillings, snacks and every child's serving are not suggested on their own.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import pgl_travel_pages as pp  # noqa: E402
import tenkites_c as tc  # noqa: E402
from common import slug, write_chain_folder  # noqa: E402

CHAIN_ID = "pgl-travel"
URL = "https://menus.tenkites.com/pgltravel/pgl02"
MENU_TITLE = "UK Families Menu Week 1 2026"
SOURCE_TITLE = ('PGL Travel "UK Families Menu Week 1 2026": allergen and nutrition information, "Nutrition (per portion)" '
                "(menus.tenkites.com, accessed {checked_on}, no date shown)")
ALLERGEN_TITLE = 'PGL Travel "UK Families Menu Week 1 2026" allergen information (Ten Kites page, accessed {checked_on}, no date shown)'
FOOTNOTE = "*Chopped and shaped chicken. ** Where used, our ham is reformed from selected cuts of pork with added water."
NOTE = ("Meals at PGL children's activity centres, not a restaurant. Only the weekly rota 'UK Families Menu Week 1 2026' is included, "
        "not other weeks. Figures are per portion as PGL prints them; each dish appears once, child and adult servings separately. "
        "Dishes with no numbers are left out. * Chopped and shaped chicken. ** Ham is reformed from cuts of pork with added water.")
ALIASES = ["pgl", "pgl travel"]

# What the page holds today. The run stops if any of this changes, so a human re-checks the rules above.
EXPECTED_COPIES = 224          # dishes as printed (a dish repeated on several days counts once per day)
EXPECTED_DISHES = 99           # distinct dish names
EXPECTED_ITEMS = 147           # distinct (dish, size) with printed numbers, "100g" rows excluded
EXPECTED_WITHOUT_NUMBERS = {"Fresh Fruit", "Plant-based milk alternatives available on request"}
EXPECTED_BAD100 = {"Homemade Vegetable Lasagne"}   # its "100g" row prints the child's serving figures: held back
EXPECTED_ORPHANS = 1           # Chicken Nuggets*: a hidden pop-up with "-" everywhere

# printed section (nearest heading above the dish, " - available on request" removed) -> category shown
SECTIONS = {
    "Hot Options": "Breakfast: hot options",
    "Self Serve Light Options": "Breakfast: self-serve light options",
    "LUNCH": "Lunch",
    "Simple Sandwiches": "Lunch: simple sandwiches (on request)",
    "Main Course Options": "Dinner: main course options",
    "Sides": "Dinner: sides",
    "Dessert": "Dinner: dessert",
    "Packed Lunch": "Packed lunch (on request)",
}
# Whole dishes that can be suggested on their own (adult or single serving). Everything else on the page is a part of a plate (sausage,
# beans, rice, vegetables, gravy), a filling or topping, a side, a dessert or a snack. Every "Main Course Options" dish is a main.
MAIN_SECTIONS = {"Main Course Options"}
MAIN_NAMES = {
    "Omelette", "Toast with Sunflower Spread & Jam",
    "Corn Flakes with Semi Skimmed Milk", "Wheat Biscuits with Semi Skimmed Milk", "Crisp Puffed Rice with Semi Skimmed Milk",
    "Ham Pizza", "Margherita Pizza", "Homemade Beef Bolognese", "Homemade Chilli non Carne", "Cheese Burger", "Vegetable Burger",
    "Harry Ramsden™ Battered Fish", "Fishless Fingers", "Jumbo Pork Sausage", "Roasted Chicken Breast",
    "Meatless Farm™ Plant-Based Chicken Breast",
    "Ham** Sandwiches", "Tuna Mayo Sandwiches", "Cheese Sandwiches", "Sheese™ Vegan Sandwiches",
    "Cheese Baguette", "Freshly Baked Pork Sausage Roll",
}
PRINTED_AS = {"or Jacket Potato Wedges": "Jacket Potato Wedges"}   # the choice line prints its connecting "or"
DAYS = {"Monday": "Mon", "Tuesday": "Tue", "Wednesday": "Wed", "Thursday": "Thu", "Friday": "Fri", "Saturday": "Sat", "Sunday": "Sun"}

PORK = re.compile(r"\b(pork|bacon|ham|gammon|pepperoni|salami|chorizo)\b", re.I)
SAUSAGE = re.compile(r"\bsausages?\b", re.I)
NOT_PORK_SAUSAGE = re.compile(r"\b(chicken|turkey|vegetable|veggie|plant)\b", re.I)


def norm_section(text: str) -> str:
    return re.sub(r"\s*-\s*available on request( only)?$", "", text).strip()


def size_kind(size: str) -> str:
    s = size.strip().lower()
    if re.fullmatch(r"100\s*g", s):
        return "100g"
    if re.match(r"1 child", s):
        return "child"
    if re.match(r"1 adult", s):
        return "adult"
    return "single"


def tidy_serving(size: str) -> str:
    s = re.sub(r"\s+", " ", size).strip()
    s = re.sub(r",(?=\S)", ", ", s)
    return re.sub(r"\.{2,}$", "", s)


def parts_text(parts: list) -> str:
    return ";".join(f"{head}({','.join(inner)})" if inner else head for head, inner in parts)


def signature(size: dict) -> tuple:
    return (tuple(sorted(size["portion"].items())), parts_text(size["contains"]), parts_text(size["may"]), size["suitable"])


def meat_tags(name: str, desc: str, vegetarian: bool) -> tuple:
    if vegetarian:
        return [], False
    text = f"{name} {desc}"
    tags = []
    if PORK.search(text) or (SAUSAGE.search(text) and not NOT_PORK_SAUSAGE.search(name)):
        tags.append("contains_pork")
    if tc.BEEF.search(text):
        tags.append("contains_beef")
    unspecified = bool(tc.MEAT_UNSPECIFIED.search(name)) and not tags and not tc.OTHER_SPECIES.search(name)
    return tags, unspecified


def own_numbers_problem(nums: dict) -> str:
    def f(k):
        try:
            return float(nums[k])
        except (TypeError, ValueError):
            return None
    fat, sat, carbs, sugar = f("fat_g"), f("sat_fat_g"), f("carbs_g"), f("sugar_g")
    if sat is not None and fat is not None and sat > fat:
        return f"saturates ({nums['sat_fat_g']} g) are printed higher than total fat ({nums['fat_g']} g)"
    if sugar is not None and carbs is not None and sugar > carbs:
        return f"sugars ({nums['sugar_g']} g) are printed higher than carbohydrate ({nums['carbs_g']} g)"
    return ""


def build(page_path: Path) -> tuple:
    text = Path(page_path).read_text(encoding="utf-8")
    data = pp.read_page(text)
    if data["title"] != MENU_TITLE:
        raise SystemExit(f"the page is now titled {data['title']!r}, not {MENU_TITLE!r}: another week's menu, stop and re-check")
    notes_foot = pp.footnotes(text)
    if notes_foot != [FOOTNOTE]:
        raise SystemExit(f"the page's footnotes changed: {notes_foot!r}; update FOOTNOTE and NOTE before running again")
    copies, report = data["copies"], []
    if len(copies) != EXPECTED_COPIES:
        raise SystemExit(f"the page prints {len(copies)} dishes, this script expects {EXPECTED_COPIES}: the menu changed, re-check before running again")
    if len(data["orphans"]) != EXPECTED_ORPHANS:
        raise SystemExit(f"hidden pop-ups changed: {data['orphans']}")
    report += [f"ignored: {o}" for o in data["orphans"]]

    # one recipe id per dish name
    by_name: dict = {}
    for c in copies:
        by_name.setdefault(c["name"], set()).add(c["recipe_id"])
    if len(by_name) != EXPECTED_DISHES:
        raise SystemExit(f"{len(by_name)} distinct dish names, expected {EXPECTED_DISHES}: the menu changed")
    for name, ids in by_name.items():
        if len(ids) > 1:
            raise SystemExit(f"{name!r} is printed with several recipe ids {sorted(ids)}: same name, different dishes: decide by hand")

    # allergens + diet checks per copy/size, then group copies of the same (dish, size)
    groups: dict = {}
    bad100: dict = {}
    for c in copies:
        sec = norm_section(c["section"])
        if sec not in SECTIONS:
            raise SystemExit(f"new section {c['section']!r}: add it to SECTIONS")
        suit_words = [w.strip() for w in c["sizes"][0]["suitable"].split(",") if w.strip()]
        for s in c["sizes"]:
            if s["suitable"] != c["sizes"][0]["suitable"]:
                raise SystemExit(f"{c['name']}: sizes disagree on the 'Suitable for' line")
        veg = "Vegetarian" in suit_words or "Vegan" in suit_words
        if ("V" in c["diet_labels"]) != ("Vegetarian" in suit_words) or ("VE" in c["diet_labels"]) != ("Vegan" in suit_words):
            raise SystemExit(f"{c['name']}: the V / VE badges {c['diet_labels']} disagree with the 'Suitable for' line {suit_words}")
        for s in c["sizes"]:
            where = f"{c['name']} / {s['size'] or 'no size'}"
            al = tc.allergens_checked({"contains": s["contains"], "may": s["may"], "label_ids": (c["all_labels"], c["contained_labels"]),
                                       "filter": data["filter"]}, where)
            if al is None:
                raise SystemExit(f"{where}: allergens could not be checked against the page's filter")
            kind = size_kind(s["size"])
            if kind == "100g":
                if s["portion"] != s["per100"]:
                    # the page contradicts itself about this dish: all its servings are held back (never chosen between)
                    bad100[c["name"]] = (f"the page's own '100g' size prints per-portion figures ({s['portion']['Energy (kCal)']} kcal) that differ from its "
                                         f"per-100g figures ({s['per100']['Energy (kCal)']} kcal), so the page contradicts itself about this dish")
                continue
            key = (c["name"], s["size"])
            groups.setdefault(key, []).append({"copy": c, "size": s, "allergens": al, "vegetarian": veg, "section": sec})

    # sizes of one dish
    sizes_of: dict = {}
    for (name, size) in groups:
        sizes_of.setdefault(name, []).append(size)
    items, holdback, without_numbers = [], [], set()
    for name in by_name:
        sizes = sizes_of.get(name, [])
        kinds = [size_kind(x) for x in sizes]
        if sorted(kinds) == ["adult", "child"]:
            suffix = True
        elif len(sizes) == 1:
            suffix = False
        else:
            raise SystemExit(f"{name}: sizes {sizes} are not (child + adult) or a single size: decide by hand")
        for size in sizes:
            members = groups[(name, size)]
            first = members[0]
            kind = size_kind(size)
            nums, missing = tc.numbers(first["size"]["portion"], f"{name} / {size}")
            if missing:
                if len(missing) == 4 and all(v == "-" for v in first["size"]["portion"].values()):
                    without_numbers.add(name)
                    report.append(f"left out {name!r}: the page prints no numbers for it")
                    continue
                raise SystemExit(f"{name} / {size}: only some numbers printed (missing {missing}): decide by hand")
            base = PRINTED_AS.get(name, name)
            if suffix:
                shown = f"{base} (child's serving)" if kind == "child" else f"{base} (adult serving)"
            else:
                shown = base
            iid = slug(shown)
            category = SECTIONS[first["section"]]
            tags = ["vegetarian"] if first["vegetarian"] else []
            meat, unspecified = meat_tags(name, first["copy"]["desc"], first["vegetarian"])
            if unspecified:
                report.append(f"meat type not stated: {name}")
            notes = []
            if name in PRINTED_AS:
                notes.append(f"the page prints this dish as '{name}' (a choice line)")
            if "*" in name:
                notes.append("the star is the page's footnote mark: " + FOOTNOTE)
            if size and size != tidy_serving(size):
                notes.append(f"the page prints the size as '{size}'")
            if not size:
                notes.append("the page prints no portion size or weight for this dish, only 'per portion'")
            days = []
            for m in members:
                d = DAYS.get(m["copy"]["day"], "Packed lunch")
                if d not in days:
                    days.append(d)
            where_on = ", ".join(sorted(set(SECTIONS[m["section"]] for m in members)))
            notes.append(f"printed {len(members)}x on this rota ({', '.join(days)}; {where_on})")
            # copies of one dish must agree on numbers and allergens, else the item is held back (never chosen between)
            if len(set(signature(m["size"]) for m in members)) > 1:
                holdback.append((iid, f"printed on several days with different numbers or allergens ({', '.join(days)})"))
                notes.append("held back: copies on different days differ")
            if name in bad100:
                holdback.append((iid, bad100[name]))
                notes.append("held back: " + bad100[name])
            problem = own_numbers_problem(nums)
            if problem:
                holdback.append((iid, problem))
                notes.append(f"held back: {problem}")
            rank = kind != "child" and (name in MAIN_NAMES or any(m["section"] in MAIN_SECTIONS for m in members))
            items.append({"id": iid, "name": shown, "category": category, "serving": tidy_serving(size), **nums,
                          "tags": "|".join(tags + meat), "rankable": bool(rank), "allergens": first["allergens"],
                          "notes": "; ".join(notes)})

    ids = [it["id"] for it in items]
    if len(set(ids)) != len(ids):
        dup = sorted(i for i in set(ids) if ids.count(i) > 1)
        raise SystemExit(f"two items would share an id: {dup}")
    if set(bad100) != EXPECTED_BAD100:
        raise SystemExit(f"dishes whose '100g' row contradicts their per-100g table changed: {sorted(bad100)}")
    if without_numbers != EXPECTED_WITHOUT_NUMBERS:
        raise SystemExit(f"dishes without numbers changed: {sorted(without_numbers)}")
    if len(items) != EXPECTED_ITEMS:
        raise SystemExit(f"{len(items)} items, expected {EXPECTED_ITEMS}: the menu changed, re-check before running again")
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved page (pgl02.html)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was read")
    ap.add_argument("--fetch", action="store_true", help="download the page to --page first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt is {len(NOTE)} characters, the limit is 400")
    if args.fetch:
        tc.fetch(URL, args.page)
    items, holdback, report = build(args.page)
    guide = {"title": ALLERGEN_TITLE.format(checked_on=args.checked_on), "url": URL, "checked_on": args.checked_on, "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="PGL Travel", cuisine="Activity holiday centre meals",
                             source_title=SOURCE_TITLE.format(checked_on=args.checked_on), source_url=URL, checked_on=args.checked_on,
                             aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide)
    print(f"{args.page.name} sha256 {tc.sha256_text_file(args.page)}")
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
