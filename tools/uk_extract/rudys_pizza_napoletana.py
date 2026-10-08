#!/usr/bin/env python3
"""Build data/source/rudys-pizza-napoletana/ from Rudy's Pizza's own allergen and nutrition page (hosted by Ten Kites).

    python3 -I tools/uk_extract/rudys_pizza_napoletana.py --page DIR/page.html --checked-on 2026-10-08 [--fetch] [--out DIR]

Source: https://www.rudyspizza.co.uk/allergen-info/ links to https://viewthe.menu/5zav, the chain's "Food" menu with a grid of
the 14 allergens, "Suitable for" columns (Vegan, Vegetarian) and, under the heading "Nutrition values per serving", energy (kCal),
protein, carbohydrate, of which sugars, fat, saturates and salt for every dish (the page's own "View nutrition information"
button shows them). The page prints no date; its file name for the download is RudysPizza-Food_2026-10-08.pdf, the day it was read.
--fetch downloads the page once (7 MB; viewthe.menu's robots.txt only disallows /fonts/, /views/ and *.less); --page is the saved file.

Numbers are copied from each dish's row exactly as printed and checked against the same dish's "per serving" table in its card (the
per-100g toggle/table is never used). The page prints no kJ, fibre or weights, so only the seven columns above are filled. Allergens
come from the 14 cells of each row, cross-checked with the printed "Contains: / May contain:" lines (which name cereals and tree
nuts) and with the label ids the page's own allergen filter reads (tenkites_c.allergens_checked); any disagreement stops the run.
Only the section names, the choices in SECTIONS and the exclusions / holdbacks below are typed by hand. If the page gains or loses a
dish or a section, the run stops so a human re-checks.

Not read: the second menu in the page's selector, "Rudy's Shop" (bake-at-home pizza kits sold for the customer's own oven: a
retail product, not the restaurant menu), and the ingredient rows inside each dish's card.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
import rudys_pizza_napoletana_pages as pages  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "rudys-pizza-napoletana"
URL = "https://viewthe.menu/5zav"
SOURCE_TITLE = ("Rudy's Pizza allergen and nutrition menu \"Food\" (viewthe.menu, Ten Kites; page generated 2026-10-08, "
                "no other date shown; linked from rudyspizza.co.uk/allergen-info)")
ALLERGEN_TITLE = "Rudy's Pizza allergen and dietary grid with Contains / May contain lines, \"Food\" menu (viewthe.menu, Ten Kites)"
ALIASES = ["rudy's pizza", "rudys pizza", "rudy's pizza napoletana", "rudys pizza napoletana", "rudy's", "rudys"]
NOTE = ("Per serving as printed on Rudy's own allergen and nutrition page, which gives no weights. Extra toppings are per topping "
        "portion. The bake-at-home Rudy's Shop menu is not listed, and a few rows that contradict themselves are held back.")

# printed section path -> (category shown, rankable, limited_time, dishes expected). Pizzas are whole orders; starters / sharers
# (to share), side salads, extra toppings (parts of a pizza), dips and desserts are not suggested as an order on their own.
SECTIONS = {
    "PIZZA": ("Pizza", True, False, 17),
    "MONTHLY PIZZA SPECIALS": ("Monthly pizza specials", True, True, 3),
    "STARTERS + SHARERS": ("Starters + sharers", False, False, 5),
    "STARTERS + SHARERS > Campana": ("Campana", False, False, 3),   # Small Campana prints two sizes (2 rows) + Campana
    "SIDE SALADS": ("Side salads", False, False, 7),
    "DIPS": ("Dips", False, False, 6),
    "DOLCE": ("Dolce", False, False, 9),
    "EXTRA TOPPINGS > VEGGIES": ("Extra toppings: veggies", False, False, 9),
    "EXTRA TOPPINGS > MEATS": ("Extra toppings: meats", False, False, 7),
    "EXTRA TOPPINGS > CHEESE + OILS": ("Extra toppings: cheese + oils", False, False, 8),   # includes the two "Switch to" swaps (EXCLUDED)
}
CATEGORY_ORDER = ["Pizza", "Monthly pizza specials", "Starters + sharers", "Campana", "Side salads", "Dips", "Dolce",
                  "Extra toppings: veggies", "Extra toppings: meats", "Extra toppings: cheese + oils"]
EXPECTED_ROWS = 74

# Names tidied: a footnote asterisk is dropped ("***White pizzas come with no tomato base" is the page's own footnote).
RENAME = {"Portobello - White*": "Portobello - White"}

# Rows that are not items (written down in the report). Both are swaps printed as the DIFFERENCE from a pizza, not a food.
EXCLUDED = {
    "Switch to Vegan Cheese": "a swap printed as a difference to a pizza (0 kcal with 17.9 g carbs and 22.5 g fat), not a dish",
    "Switch to Bufala Mozzarella": "a swap printed as a difference to a pizza (negative values, -244 kcal), not a dish",
}

# Held back by name, with the reasons the page itself gives (numbers are filled in from the printed row).
SPECIAL_HOLD = {
    "Calabrese": "The page prints the same seven figures as Margherita ({cal} kcal, {p} g protein, {c} g carbs, {f} g fat), yet Calabrese adds 'nduja "
                 "(the extra topping Spilinga N'Duja prints 207 kcal): the figures cannot both be right.",
    "Burrata": "The page prints {f} g of fat ({cal} kcal) for a whole burrata with tomatoes and bread, but its own 'Whole Burrata' extra prints "
               "21.3 g of fat (265 kcal) for the burrata alone.",
    "Any 3 Dips": "The page prints one figure ({cal} kcal) for any three dips without saying which three; the single dips print 90-440 kcal each.",
    "Lemon Sorbet": "The page prints 0 kcal and 0 g of everything for a scoop of lemon sorbet (the other scoops print 139-213 kcal).",
}
GAP_HOLD = 0.25   # kcal differing from 4 x protein + 4 x carbs + 9 x fat by this much or more (dishes of 50 kcal or more): held back

PORK_IMPLIED_BY_HALAL = re.compile(r"\bhalal\b", re.I)
# The page calls the ingredient of 'Nduja Ortolana "vegan 'nduja" (ingredient "Symplicity N'duja Mince"): the dish name must not count as pork.
VEGAN_NDUJA_DISH = "'Nduja Ortolana"
VEGAN_NDUJA = re.compile(r"vegan\s+['\u2018\u2019]?nduja", re.I)
# Cured meats the page names without saying which animal: no tag, listed as "meat type not stated".
UNNAMED_MEAT = re.compile(r"\b(bresaola)\b", re.I)


def fetch_page(url: str, dest: Path) -> None:
    """One download (7 MB). A dropped connection (curl exit 35 / 56) is retried twice, 5 s apart: it is not a refusal.
    Any HTTP error (403, 429...) stops the run."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        proc = subprocess.run(["curl", "-sS", "--fail", "--http1.1", "--compressed", "-A", tk.USER_AGENT, "-o", str(dest), url])
        if proc.returncode == 0:
            time.sleep(1)
            return
        if proc.returncode not in (35, 56) or attempt == 2:
            raise SystemExit(f"download of {url} failed (curl exit {proc.returncode}); not worked round")
        time.sleep(5)


def _dish_allergens(row: dict, where: str):
    """(allergens dict, vegetarian bool) for one printed dish: the 14 cells, the printed lines and the filter ids must agree."""
    states = row["states"]
    cols = [lab for lab in tk.ALLERGEN_LABELS]
    names = {"Sesame Seeds": "Sesame Seeds", "Sulphites": "Sulphur Dioxide/Sulphites"}
    cols = [names.get(c, c) for c in cols]
    for c in cols + ["Vegan", "Vegetarian"]:
        if states.get(c) not in ("yes", "may", "no"):
            raise SystemExit(f"{where}: column {c!r} is not marked")
    lines = row["lines"]
    parsed = {"contains": tk._parts(lines.get("Contains")), "may": tk._parts(lines.get("May contain")),
              "label_ids": row["label_ids"], "filter": row["filter"]}
    result = tk.allergens_checked(parsed, where)
    if result is None:
        raise SystemExit(f"{where}: no allergen label ids to check the printed lines against")
    col_yes = allergen_words([c for c in cols if states[c] == "yes"], where)[0]
    col_may = allergen_words([c for c in cols if states[c] == "may"], where)[0]
    if col_yes != result["contains"] or col_may - col_yes != result["may_contain"] - result["contains"]:
        raise SystemExit(f"{where}: the 14 allergen cells (contains {sorted(col_yes)}, may {sorted(col_may)}) disagree with the printed lines "
                         f"(contains {sorted(result['contains'])}, may {sorted(result['may_contain'])})")
    vegan, veg = states["Vegan"] == "yes", states["Vegetarian"] == "yes"
    suitable = {w.strip().lower() for w in (lines.get("Suitable for") or "").split(",") if w.strip()}
    if suitable != ({"vegan"} if vegan else set()) | ({"vegetarian"} if veg else set()):
        raise SystemExit(f"{where}: the Vegan / Vegetarian cells ({vegan}, {veg}) disagree with the printed 'Suitable for' line {sorted(suitable)}")
    return result, (vegan or veg)


def _gap(nums: dict):
    kcal = float(nums["calories"])
    est = 4 * float(nums["protein_g"]) + 4 * float(nums["carbs_g"]) + 9 * float(nums["fat_g"])
    return kcal, est, ((kcal - est) / kcal if kcal else 0.0)


def build(page: Path):
    rows = pages.read_food_menu(Path(page).read_text(encoding="utf-8"))
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(f"the page has {len(rows)} dish rows but this script expects {EXPECTED_ROWS}: the menu changed, re-check SECTIONS "
                         "(and EXCLUDED / SPECIAL_HOLD) before running again.")
    counts: dict = {}
    for r in rows:
        if r["section"] not in SECTIONS:
            raise SystemExit(f"new section {r['section']!r}: add it to SECTIONS (category, rankable, limited_time, expected count).")
        counts[r["section"]] = counts.get(r["section"], 0) + 1
    for sec, spec in SECTIONS.items():
        n = counts.get(sec, 0)
        if n != spec[3]:
            raise SystemExit(f"section {sec!r} has {n} rows, this script expects {spec[3]}: the menu changed, re-check before running again.")

    items, holdback, report, excluded = [], [], [], []
    for r in rows:
        printed_name = r["name"]
        name = RENAME.get(printed_name, printed_name)
        if r["size"]:
            name = f"{name} ({r['size']})"
        where = f"{r['section']} / {name}"
        if printed_name in EXCLUDED:
            excluded.append(f"{printed_name}: {EXCLUDED[printed_name]}")
            continue
        nums = pages.numbers_checked(r)
        allergens, vegetarian = _dish_allergens(r, where)
        category, rankable, limited, _ = SECTIONS[r["section"]]
        evidence_name = "Ortolana" if printed_name == VEGAN_NDUJA_DISH else name
        meat, unspecified = tk.meat_tags(evidence_name, VEGAN_NDUJA.sub("vegan topping", r["desc"]), r["ingredients"], vegetarian=vegetarian)
        if UNNAMED_MEAT.search(name + " " + r["desc"] + " " + r["ingredients"]) and not meat:
            unspecified = True
        if PORK_IMPLIED_BY_HALAL.search(name + " " + r["ingredients"]) and "contains_pork" in meat:
            meat.remove("contains_pork")      # halal pepperoni: the chain's word "Halal" means the page does not say which meat
            unspecified = True
        tags = (["vegetarian"] if vegetarian else []) + meat
        if unspecified:
            report.append(f"meat type not stated: {name}")
        it = {"id": slug(name), "name": name, "category": category, "serving": r["size"], **nums, "fiber_g": "", "tags": "|".join(tags),
              "rankable": rankable, "limited_time": limited, "notes": "", "allergens": allergens}
        notes = tk.annotate(it)
        if printed_name == "Wild Boar Salame":
            notes.append("Tagged contains_pork by the 'salame' rule: the page names it wild boar salame (Simonini Salami : Cinghiale)")
        if printed_name == VEGAN_NDUJA_DISH:
            notes.append("The page calls the 'nduja on this pizza vegan (ingredient Symplicity N'duja Mince): no pork tag")
        kcal, est, gap = _gap(nums)
        if printed_name in SPECIAL_HOLD:
            holdback.append((it["id"], SPECIAL_HOLD[printed_name].format(cal=nums["calories"], p=nums["protein_g"], c=nums["carbs_g"], f=nums["fat_g"])))
        elif kcal >= 50 and abs(gap) >= GAP_HOLD:
            holdback.append((it["id"], f"The page prints {nums['calories']} kcal; its own protein, carbohydrate and fat "
                                       f"({nums['protein_g']} g, {nums['carbs_g']} g, {nums['fat_g']} g) add up to about {est:.0f} kcal."))
        it["notes"] = "; ".join(notes)
        report += [f"{name}: {n}" for n in notes]
        items.append(it)
    ids = [i["id"] for i in items]
    if len(set(ids)) != len(ids):
        raise SystemExit("two dishes would get the same id: " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
    items.sort(key=lambda i: CATEGORY_ORDER.index(i["category"]))
    return items, holdback, report, excluded


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved page (page.html)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the page")
    ap.add_argument("--fetch", action="store_true", help="download the page into --page first (one request)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch_page(URL, args.page)
    items, holdback, report, excluded = build(args.page)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Rudy's Pizza Napoletana", cuisine="Pizza", source_title=SOURCE_TITLE, source_url=URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"{args.page.name} sha256 {tk.sha256_text_file(args.page)}")
    print("\n".join(f"excluded: {e}" for e in excluded))
    print("\n".join(f"held back: {i}: {why}" for i, why in holdback))
    print("\n".join(report))
    print(f"wrote {len(items)} items ({len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
