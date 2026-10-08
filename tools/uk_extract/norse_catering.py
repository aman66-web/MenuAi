#!/usr/bin/env python3
"""Build data/source/norse-catering/ from Norse Catering's official "Nutrition Analysis for Primary Menu, Spring/Summer 2026" PDF.

    python3 -I tools/uk_extract/norse_catering.py --pdf FILE --checked-on 2026-10-08 [--fetch] [--allergen-pdf FILE] [--out DIR]

Source: https://norsegroup.co.uk/catering-hub/ ("Norfolk catering hub: menus, food and allergen guidance and educational resources for
schools") links "Nutritional report" =
https://norsegroup.co.uk/wp-content/uploads/2026/07/Nutrition-Analysis-for-Primary-Menu-Spring-Summer-2026.pdf (9 pages, an Excel export,
PDF created 26 March 2026; robots.txt of norsegroup.co.uk allows everything). It is the Norse Group's own analysis of the Norfolk primary
school lunch menu of Spring/Summer 2026. The chain's menu PDF for that term (created 25 Feb 2026) runs its three-week rotation up to the
week of 19 October 2026, so on the run date the analysis is for the menu still being served; the hub links no Autumn/Winter primary
analysis yet (its Autumn/Winter file is the E3 secondary menu, which has no figures).

What this is NOT: a restaurant. These are school dinners for Norfolk primary schools; the public cannot order them. The chain is published
because the founder wants every official nutrition table (docs/UK_DATA_STATUS.md); note.txt says what it is. Items are never "Best for you"
suggestions (child-sized portions at a school): every item is rankable = false.

What the PDF prints, per dish and per day ("Values per portion size", 15 tables: Week 1-3 x Monday-Friday): Portion (grams of the recipe
BEFORE cooking unless the name says cooked, or "1 each" / "1 tbsp"), Energy (Kcal), Fat (g), Saturates (g), Carb (g), Protein (g), and
Carb (g) per 100g. Published here: calories, fat_g, sat_fat_g, carbs_g, protein_g and weight_g (the portion, when it is a weight). NOT
printed, so blank: kJ, sugars, fibre, salt. The per-100g column is not a serving value and is never used (it is only used as a check
that the carbohydrate column is the one read: carb / portion weight x 100 = carb per 100g).

The same dish is printed on many days (and in the hot-meal and packed-lunch halves of a day). A dish is one item per (name, portion);
printed several times with identical figures it counts once; printed with DIFFERENT figures it is left out (listed in the run's output,
never chosen between). Left out too: rows with no figures ("Fresh Fruit Platter", "Fruit Portion"), the last table (Jacket Potato and
fillings: it has no Fat and no Protein column, and its jacket "size may vary"), and any row whose energy cell does not print "kcal"
(Beetroot Brownie 58.62g prints "264.92g": the unit is wrong, and nothing is corrected).

Tags: vegetarian for the chain's own "(v)" and "(Ve)" marks (the files give no key; both are the usual marks for vegetarian and vegan).
contains_pork / contains_beef only when the dish NAME says so (common.py convention: pork, ham, bacon, sausage ...).

Allergens: the chain's separate Allergen Chart PDF (same date) has its own dish names ("Marble Shortbread (Bitesize)" against "Marble
Shortbread", "Plant Sausage Hot Dog (v)" against "Plant Sausages (v)", "(uncooked)" on one side only) and a different row order on
some days, so not every dish can be matched exactly: link only (docs/DATA.md "Allergens": all or nothing). The chart prints no
"may contain" information (only a general line that the kitchens are nut-free but cannot guarantee a 100% allergen-free environment).
"""
from __future__ import annotations
import argparse
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import norse_catering_pdf as npdf  # noqa: E402
import robots_rfc  # noqa: E402
import tenkites_c as tk  # noqa: E402  (browser User-Agent and the pork / beef name patterns shared by the UK extractors)
from common import sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "norse-catering"
HUB_URL = "https://norsegroup.co.uk/catering-hub/"
NUTRITION_URL = "https://norsegroup.co.uk/wp-content/uploads/2026/07/Nutrition-Analysis-for-Primary-Menu-Spring-Summer-2026.pdf"
ALLERGEN_URL = "https://norsegroup.co.uk/wp-content/uploads/2026/07/Allergen-Chart-Primary-Menu-Spring-Summer-2026.pdf"
EXPECTED_FIGURE_ROWS = 173      # dish rows with figures in the 15 day tables
EXPECTED_NAME_ONLY = ["Fresh Fruit Platter", "Fruit Portion", "Fruit Portion"]
EXPECTED_JACKET_ROWS = 7
CATEGORY = "Primary school lunch menu"
SOURCE_TITLE = "Norse Catering Nutrition Analysis for Primary Menu, Spring/Summer 2026 (PDF created 26 March 2026)"
ALLERGEN_TITLE = "Norse Catering Allergen Chart, Primary Menu Spring/Summer 2026 (PDF created 26 March 2026)"
ALIASES = ["norse catering", "norse group", "norse", "norfolk school meals"]
NOTE = ("Norfolk primary school lunches (Norse Catering), not a restaurant: the public cannot order them. Spring/Summer 2026 analysis "
        "(March 2026). Portions are recipe weights before cooking, so figures are a guide. Salt, sugar and fibre are not published.")
# Dishes the PDF's own figures make impossible or absurd (item id -> reason). Nothing is corrected; they stay in items.csv and holdback.csv.
HOLDBACK = {
    "tex-mex-chilli": ("The PDF's own figures disagree: 84.65 kcal against 55 kcal from its fat 2.65 g, carbohydrate 5.95 g and protein 1.94 g "
                       "(34% apart), and it prints no fibre or alcohol that could explain the gap (accuracy audit, 8 Oct 2026). "
                       "Left out until the chain confirms."),
}
DAYS = {"Monday": "Mon", "Tuesday": "Tue", "Wednesday": "Wed", "Thursday": "Thu", "Friday": "Fri"}


def fetch(pdf_url: str, dest: Path) -> None:
    """One download of the PDF (robots.txt checked first with robots_rfc)."""
    req = urllib.request.Request("https://norsegroup.co.uk/robots.txt", headers={"User-Agent": tk.USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        rules = robots_rfc.parse(resp.read().decode("utf-8", errors="replace"))
    path = pdf_url[len("https://norsegroup.co.uk"):]
    if not robots_rfc.allowed(rules, path):
        raise SystemExit(f"robots.txt of norsegroup.co.uk disallows {path}: stop, do not work round it")
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["curl", "-sS", "--fail", "--compressed", "-A", tk.USER_AGENT, "-o", str(dest), pdf_url], check=True)


def read_rows(pdf: Path):
    """The bbox reader's rows, checked against the layout reader's: every figure of every row must agree."""
    rows, jacket = npdf.read_nutrition(pdf)
    figures = [r for r in rows if r["portion"] is not None]
    name_only = [r["name"] for r in rows if r["portion"] is None]
    if len(figures) != EXPECTED_FIGURE_ROWS or name_only != EXPECTED_NAME_ONLY or len(jacket) != EXPECTED_JACKET_ROWS:
        raise SystemExit(f"the PDF's rows changed: {len(figures)} dish rows (expected {EXPECTED_FIGURE_ROWS}), name-only {name_only}, "
                         f"{len(jacket)} jacket-potato rows (expected {EXPECTED_JACKET_ROWS}): re-check the PDF before running again")
    order = npdf.header_order(pdf)
    if [o for o in order if o == ["Energy", "Fat", "Saturates", "Carb", "Protein", "Carb100"]] != order[:15] or len(order) != 16 or \
            order[15] != ["Energy", "Saturates", "Carb", "Carb100"]:
        raise SystemExit(f"the column order of the tables changed: {order}")
    layout = npdf.layout_rows(pdf)
    mine = [(r["week"], r["day"], r["name"], r["portion"], r["energy"] + ("" if r["energy_unit"] == "kcal" else "g"), r["fat"], r["sat"],
             r["carb"], r["protein"], r["carb100"]) for r in figures]
    if mine != layout:
        diff = [(a, b) for a, b in zip(mine, layout) if a != b][:3]
        raise SystemExit(f"the two readers disagree ({len(mine)} vs {len(layout)} rows), e.g. {diff}")
    return figures


def weight_of(portion: str):
    return portion[:-1] if portion.endswith("g") else ""


def build(figures: list):
    groups: dict = {}
    for r in figures:
        groups.setdefault((r["name"], r["portion"]), []).append(r)
    items, left_out, problems = [], [], []
    for (name, portion), rs in groups.items():
        values = {(r["energy"], r["energy_unit"], r["fat"], r["sat"], r["carb"], r["protein"]) for r in rs}
        days = sorted({f"W{r['week']} {DAYS[r['day']]}" for r in rs}, key=lambda s: (s[1], list(DAYS.values()).index(s.split()[1])))
        if len(values) > 1:
            left_out.append(f"{name!r} {portion}: printed with different figures on different days {sorted(values)}")
            continue
        energy, unit, fat, sat, carb, protein = next(iter(values))
        if unit != "kcal":
            left_out.append(f"{name!r} {portion}: the energy cell prints '{energy}{unit}' (no kcal unit); not corrected, not published")
            continue
        shown = name
        veg = False
        for mark in (" (v)", " (Ve)"):
            if shown.endswith(mark):
                shown, veg = shown[: -len(mark)], True
        meat, unspecified = tk.meat_tags(shown, vegetarian=veg)
        if unspecified and not veg:
            problems.append(f"meat type not stated: {shown}")
        grams = weight_of(portion)
        serving = f"{float(grams):g} g" if grams else portion
        items.append({"name": shown, "category": CATEGORY, "serving": serving, "calories": energy, "protein_g": protein, "carbs_g": carb,
                      "fat_g": fat, "sat_fat_g": sat, "weight_g": grams, "tags": "|".join((["vegetarian"] if veg else []) + meat),
                      "rankable": False, "notes": "Printed on: " + ", ".join(days), "_printed_name": name, "_portion": portion,
                      "_carb100": rs[0]["carb100"]})
    # ids: the name; the name and portion when a dish is printed with more than one portion size
    count: dict = {}
    for it in items:
        count[it["name"]] = count.get(it["name"], 0) + 1
    for it in items:
        it["id"] = slug(it["name"]) if count[it["name"]] == 1 else slug(f"{it['name']} {it['serving']}")
    return items, left_out, problems


def sanity(items: list):
    """Returns (hard, soft) lists of (item id, problem). Hard: figures a portion cannot have, or that show the wrong column was read
    (the run stops unless the dish is in HOLDBACK). Soft: energy that differs from 4 x protein + 4 x carbs + 9 x fat by more than
    max(25 kcal, 15%): the PDF prints no fibre, polyols or alcohol, which carry energy of their own, so it is a question for the
    audit, not an impossibility."""
    found, soft = [], []
    for it in items:
        e, f, s, c, p = (float(it[k]) for k in ("calories", "fat_g", "sat_fat_g", "carbs_g", "protein_g"))
        if s > f + 0.005:
            found.append((it["id"], f"saturates {s} g more than fat {f} g"))
        implied = 4 * p + 4 * c + 9 * f
        if abs(implied - e) > max(25.0, 0.15 * e):
            soft.append((it["id"], f"{e} kcal against {implied:.0f} kcal from protein, carbs and fat"))
        if it["weight_g"]:
            w = float(it["weight_g"])
            if abs(c / w * 100 - float(it["_carb100"])) > max(0.15, 0.01 * float(it["_carb100"])):
                found.append((it["id"], f"carbohydrate {c} g in {w} g is not the printed {it['_carb100']} g per 100 g"))
            if c + f + p > w * 1.02:
                found.append((it["id"], f"fat + carbs + protein {c + f + p:.1f} g in a {w} g portion"))
    return found, soft


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, required=True, help="the nutrition analysis PDF (downloaded here with --fetch)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the PDF was read")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--allergen-pdf", type=Path, default=None, help="the allergen chart PDF, only to print its SHA-256")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        fetch(NUTRITION_URL, args.pdf)
    figures = read_rows(args.pdf)
    items, left_out, problems = build(figures)
    hard, soft = sanity(items)
    bad = [(i, why) for i, why in hard if i not in HOLDBACK]
    if bad:
        raise SystemExit("figures that cannot hold (add to HOLDBACK only after re-reading the PDF row):\n" + "\n".join(f"  {i}: {w}" for i, w in bad))
    unknown = sorted(set(HOLDBACK) - {it["id"] for it in items})
    if unknown:
        raise SystemExit(f"HOLDBACK names dishes that are no longer built: {unknown}")
    if len(NOTE) >= 400:
        raise SystemExit(f"note.txt is {len(NOTE)} characters, over the 400 limit")
    guide = {"title": ALLERGEN_TITLE, "url": ALLERGEN_URL, "checked_on": args.checked_on, "may_contain_published": False}
    for it in items:
        for k in [k for k in it if k.startswith("_")]:
            del it[k]
    out = write_chain_folder(chain_id=CHAIN_ID, name="Norse Catering", cuisine="School meals", source_title=SOURCE_TITLE, source_url=NUTRITION_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=items, out=args.out, note=NOTE,
                             holdback=sorted(HOLDBACK.items()), allergen_guide=guide)
    if not HOLDBACK:
        (out / "holdback.csv").unlink(missing_ok=True)
    print(f"nutrition analysis sha256 {sha256_file(args.pdf)}")
    if args.allergen_pdf:
        print(f"allergen chart sha256 {sha256_file(args.allergen_pdf)} (link only, not read)")
    print(f"{len(figures)} dish rows with figures -> {len(items)} distinct dishes built, {len(HOLDBACK)} held back, {len(left_out)} left out")
    print("\n".join(f"left out: {x}" for x in left_out))
    print("\n".join(f"report: {x}" for x in problems))
    print("\n".join(f"energy question: {i}: {why}" for i, why in soft))
    print("wrote", len(items), "items to", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
