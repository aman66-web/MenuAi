#!/usr/bin/env python3
"""Build data/source/shahs-halal-food/ from Shah's Halal Food UK's own product pages (shahshalalfood.co.uk, WooCommerce).

    python3 tools/uk_extract/shahs_halal_food.py --pages DIR --checked-on 2026-10-08 [--fetch] [--out DIR]

DIR holds the saved pages (sitemap.xml, home.html, allergen.html, pages/<slug>.html); --fetch downloads them first (one request per
page, 1.1 s apart, robots.txt checked). Needs Python 3.9+.

Source: the 31 product pages listed in https://shahshalalfood.co.uk/wp-sitemap-posts-product-1.xml (menu index: https://shahshalalfood.co.uk/menu/).
The site shows no date or version, so the source title says "accessed <date>, no date shown". The chain is real and multi-site (the
site's own store locator, admin-ajax action asl_load_stores, lists 95 UK sites on 2026-10-08, about 20 of them marked "opening soon").

What a page prints (read by shahs_halal_food_pages.py): a heading line "460 Cal / per serving" (drinks "44 kcal / per can") and, for 18
of the 31 products, a "Nutrition Summary" with Calories, Total Carbs, Total Fat, Protein, Saturated Fat, Dietary Fiber, Total Sugars,
Sodium (mg), Trans Fat, Iron, Potassium, Calcium, Vitamin D and "Incl. Added Sugars". It is a US-style panel: sodium in mg, no salt, no
kJ, no serving weight. The 13 other products (pita, three sauces, 7 ICE cans, water, the build-your-own salad) print calories only or
"calories vary", so a full-nutrition chain cannot list them (protein, carbs and fat are required) and they are left out.

Decisions (all conservative; each is easy to undo):
- Basis: the heading says "per serving" and equals the panel's Calories, so the panel (or on 6 platters the one headed "Per Serving") is
  used, serving "1 serving". Those 6 platter pages also print a "Per Container" column that is exactly twice the serving; it is not
  used and the platters are not rankable (the page doesn't say whether a platter is one serving or one container).
- Copied exactly: calories, protein, carbs, fat, saturates, sugars (Total Sugars), fibre, sodium_mg and trans fat. Iron, potassium,
  calcium, vitamin D and "Incl. Added Sugars" have no column. The "Cholesterol" slot on every panel repeats the calorie figure (a page
  bug) and is not read. The pipeline rounds calories and sodium to whole numbers.
- Held back (holdback.csv; computed by this script, never corrected): any item whose panel calories differ from the heading's calories
  (Fish Gyro 688.3 vs 698.3, Kofta Gyro 593.2 vs 590), or whose own protein, carbs and fat give a different energy by more than 15 %
  (the pipeline's energy check: Chicken, Combo, Lamb and Kofta Over Rice, 15-22 % under what the macros imply, same gap in the
  Per Container column), or with saturates above fat or sugars/fibre above carbs. The script stops if that set changes.
- Hot Wings is left out: its panel prints "~430-500 kcal" and other "~" ranges (and the heading says 650 Cal), which is not one number.
  Chicken Nuggets print every figure with "~" (approximate, as the chain marks it) but a single value and a heading that agrees
  (560.27 Cal), so they are published as printed, minus the "~", and the chain note says so.
- Tags: vegetarian only where the product description says "vegetarian" (Falafel); contains_beef where the name or description says
  beef/steak or the home page marks the dish "(Contains Beef)" (the lamb dishes). The site says it uses no pork; contains_pork is never
  set. Meat type not stated: none among the published items.
- Great Britain menu only: every site is in the UK. "Some items may not be available in all stores" (allergen page).
- Platters, Side orders: rankable false (see above; sides and per-piece items are not orders). Gyros and sandwiches are rankable.

Allergens: link only (docs/DATA.md "Allergens", all or nothing). The allergen page (/allergen-infromation/) has a matrix (✓ contains,
M may contain, R, GM, C) whose row names differ from the product names ("KOFTA OVER RICE" for Kofta Kabab Over Rice, "PHILLY" for
Philli, "CHICKEN NUGGETS" for 8 Pcs Chicken Nuggets), and it disagrees with the allergen lists printed on the product pages themselves:
Falafel Over Rice's page lists a white sauce "Contains: Milk, Eggs" and sesame seeds in the falafel, the matrix row has only gluten
and soya; Chicken Gyro's page lists its pita "Contains: Soy, Wheat, Sesame" and white sauce "Milk, Eggs", the matrix row has celery and
gluten as contained and milk, sesame and soya only as "may contain". Safety information is never guessed or chosen between, so only the
guide's link is published. The page also says all dishes may contain traces of the 14 allergens (may_contain_published = yes).
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import shahs_halal_food_pages as pg  # noqa: E402
from common import sha256_file, slug as make_id, write_chain_folder  # noqa: E402

CHAIN_ID = "shahs-halal-food"
SOURCE_URL = pg.MENU_URL
SOURCE_TITLE_FMT = "Shah's Halal Food UK product pages with Nutrition Summary (accessed {d}, no date shown)"
ALLERGEN_GUIDE_TITLE_FMT = "Shah's Halal Food UK allergen information page (accessed {d}, no date shown)"
ALIASES = ["shahs halal food", "shah's halal food", "shahs halal", "shah's halal", "shahs"]
NOTE = ("Figures are per serving from the product pages Shah's publishes (US-style panel: sodium, no salt). Platter pages also print a "
        "per-container figure, twice the serving; it is not used. Chicken Nuggets are marked approximate (~) by Shah's. Pita, sauces and "
        "drinks print calories only, so they are not listed. Some items may not be available in all stores.")
ENERGY_TOLERANCE = 0.15  # the pipeline's own energy check (tools/build_menus.py ENERGY_TOLERANCE)

PLATTERS, GYROS, SANDWICHES, SIDES = "Platters", "Gyros", "Sandwiches", "Side orders"
# slug -> (name, category, rankable, serving). The name is the page's own title, tidied: "Kofta Kabab Over Rice" as printed; "Philli" (menu
# pages) is "Philly" on the allergen page and in the URL; "8 Pcs Chicken Nuggets" keeps its count as the serving.
FOOD = {
    "chicken-over-rice": ("Chicken Over Rice", PLATTERS, False, "1 serving"),
    "lamb-and-chicken-over-rice": ("Combo Over Rice", PLATTERS, False, "1 serving"),
    "lamb-over-rice": ("Lamb Over Rice", PLATTERS, False, "1 serving"),
    "falafel-over-rice": ("Falafel Over Rice", PLATTERS, False, "1 serving"),
    "kofta-over-rice": ("Kofta Kabab Over Rice", PLATTERS, False, "1 serving"),
    "fish-over-rice-2": ("Fish Over Rice", PLATTERS, False, "1 serving"),
    "chicken-gyro": ("Chicken Gyro", GYROS, True, "1 serving"),
    "lamb-gyro": ("Lamb Gyro", GYROS, True, "1 serving"),
    "combo-gyro": ("Combo Gyro", GYROS, True, "1 serving"),
    "falafel-gyro": ("Falafel Gyro", GYROS, True, "1 serving"),
    "kofta-gyro": ("Kofta Gyro", GYROS, True, "1 serving"),
    "fish-gyro": ("Fish Gyro", GYROS, True, "1 serving"),
    "chicken-sandwich": ("Chicken Sandwich", SANDWICHES, True, "1 serving"),
    "beef-burger": ("Beef Burger", SANDWICHES, True, "1 serving"),
    "philly-cheese-steak": ("Philly Cheese Steak", SANDWICHES, True, "1 serving"),
    "chicken-nuggets": ("Chicken Nuggets", SIDES, False, "8 pieces"),
    "hot-wings": ("Hot Wings", SIDES, False, "5 pieces"),
    "french-fries": ("French Fries", SIDES, False, "1 serving"),
}
# Ids may not start with "combo-" (reserved by the pipeline), so the two "Combo ..." items get these ids instead of slug(name).
ID_OVERRIDE = {"lamb-and-chicken-over-rice": "over-rice-combo", "combo-gyro": "gyro-combo"}
# Products whose page has no Nutrition Summary (calories only, or "vary"): not listed.
NO_PANEL = {"build-your-own-salad", "pita", "white-sauce", "green-sauce", "hot-sauce", "water", "ice-classic-cola", "ice-pro",
            "ice-orange-can-330ml", "ice-mango", "ice-strawberry", "ice-lemon", "ice-tropical-can-330ml"}
# The panel can't be read as one number per nutrient (a "~430-500" range, "~1-2g", a sodium sentence): the page is left out.
EXPECTED_UNREADABLE = {"hot-wings"}
# Items the script holds back today; it stops if the computed set differs (a page changed: re-read it).
EXPECTED_HELD = {"chicken-nuggets", "chicken-over-rice", "lamb-and-chicken-over-rice", "lamb-over-rice", "kofta-over-rice", "fish-gyro", "kofta-gyro"}

_NUM = re.compile(r"^(~)?\s*(<)?\s*(\d+(?:\.\d+)?)\s*(Cal\.?|kcal|g|mg)?$", re.I)


def num(text: str, units: tuple, where: str) -> tuple:
    """'55.34g' -> ('55.34', False); '~560.3 kcal' -> ('560.3', True); '<1g' -> ('<1', False). Anything else (a range, a sentence, a
    comma decimal, the wrong unit) raises ValueError so the caller can leave the page out or stop."""
    m = _NUM.match(text.strip())
    if not m or (m.group(4) or "").lower().rstrip(".") not in units:
        raise ValueError(where + ": cannot read " + repr(text) + " as a number with unit " + "/".join(units))
    return (("<" if m.group(2) else "") + m.group(3), bool(m.group(1)))


def fetch_all(dest: Path) -> None:
    robots_path = dest / "robots.txt"
    pg.fetch(pg.HOST + "/robots.txt", robots_path)
    pg.check_robots(robots_path.read_text(encoding="utf-8"))
    pg.fetch(pg.SITEMAP_URL, dest / "sitemap.xml")
    urls = pg.product_urls((dest / "sitemap.xml").read_text(encoding="utf-8"))
    slugs = [pg.slug_of(u) for u in urls]
    expected = set(FOOD) | NO_PANEL
    if set(slugs) != expected or len(slugs) != len(expected):
        raise SystemExit("the product sitemap changed. New: %s. Gone: %s. Re-read the new pages, then update FOOD / NO_PANEL."
                         % (sorted(set(slugs) - expected), sorted(expected - set(slugs))))
    pg.fetch(pg.HOST + "/", dest / "home.html")
    pg.fetch(pg.MENU_URL, dest / "menu.html")
    pg.fetch(pg.ALLERGEN_URL, dest / "allergen.html")
    for u, s in zip(urls, slugs):
        pg.fetch(u, dest / "pages" / (s + ".html"))


def beef_marked_on_home(home: str) -> set:
    return {m.strip() for m in re.findall(r'elementor-image-box-title">([^<]+?)\s*<span class="tab-h-sub">\(Contains Beef\)</span>', home)}


def build(pages_dir: Path) -> tuple:
    home = (pages_dir / "home.html").read_text(encoding="utf-8")
    beef_home = beef_marked_on_home(home)
    if not beef_home:
        raise SystemExit("the home page no longer marks any dish '(Contains Beef)': re-read it, the lamb dishes may have changed")
    items, holdback, report, unreadable = [], [], [], []
    bug_pages = 0
    for slug, (name, category, rankable, serving) in FOOD.items():
        where = slug
        page = pg.read_product((pages_dir / "pages" / (slug + ".html")).read_text(encoding="utf-8"), where)
        if not page["panels"]:
            raise SystemExit(where + ": no Nutrition Summary any more: move it to NO_PANEL")
        panels = page["panels"]
        if len(panels) == 2:
            if [p["label"] for p in panels] != ["Per Serving", "Per Container"]:
                raise SystemExit(where + ": two panels headed %r, expected Per Serving / Per Container" % [p["label"] for p in panels])
        elif panels[0]["label"] not in (None, "Per Serving"):
            raise SystemExit(where + ": the only panel is headed " + repr(panels[0]["label"]))
        panel = panels[0]
        big, rows = panel["big"], panel["rows"]
        head = re.match(r"^([~\d.,<-]+) (?:Cal|kcal)\.? / per serving$", page["headline"])
        if not head:
            raise SystemExit(where + ": heading " + repr(page["headline"]) + " is not '<n> Cal / per serving'")
        try:
            cal, cal_approx = num(big["Calories"], ("cal", "kcal"), where + " Calories")
            protein, a1 = num(big["Protein"], ("g",), where + " Protein")
            carbs, a2 = num(big["Total Carbs"], ("g",), where + " Total Carbs")
            fat, a3 = num(big["Total Fat"], ("g",), where + " Total Fat")
            sat, a4 = num(rows["Saturated Fat"], ("g",), where + " Saturated Fat")
            fibre, a5 = num(rows["Dietary Fiber"], ("g",), where + " Dietary Fiber")
            sugar, a6 = num(rows["Total Sugars"], ("g",), where + " Total Sugars")
            sodium, a7 = num(rows["Sodium"], ("mg",), where + " Sodium")
            trans, a8 = num(rows["Trans Fat"], ("g",), where + " Trans Fat")
            head_cal, _ = num(head.group(1), ("",), where + " heading")
        except (ValueError, KeyError) as e:
            unreadable.append(slug)
            report.append("left out %s: the panel can't be read as one number per nutrient (%s); heading %r" % (name, e, page["headline"]))
            continue
        approx = any((cal_approx, a1, a2, a3, a4, a5, a6, a7, a8))
        if rows.get("Cholesterol") == big["Calories"]:
            bug_pages += 1
        text = name + " " + page["description"]
        tags = []
        if re.search(r"\bvegetarian\b", page["description"], re.I):
            tags.append("vegetarian")
        if re.search(r"\b(beef|steak)\b", text, re.I) or page["name"] in beef_home:
            tags.append("contains_beef")
        if re.search(r"\b(pork|bacon|ham|sausage|pepperoni|salami|chorizo)\b", text, re.I):
            tags.append("contains_pork")
        note = "Page /our-menu/%s/: heading %r; panel %s" % (slug, page["headline"], repr(panel["label"] or "(unlabelled)"))
        if len(panels) == 2:
            note += "; Per Container column also printed (%s), not used" % panels[1]["big"]["Calories"]
        if approx:
            note += "; every figure is marked ~ (approximate) by the chain"
        # holdback checks, on the numbers exactly as printed
        reasons = []
        pf, cf, ff, kc = float(protein.lstrip("<")), float(carbs.lstrip("<")), float(fat.lstrip("<")), float(cal)
        est = 4 * pf + 4 * cf + 9 * ff
        if round(float(head_cal)) != round(kc):
            reasons.append("The page prints two different calorie figures for the same serving: %s Cal in the heading and %s in its "
                           "Nutrition Summary. Neither is chosen." % (head_cal, cal))
        if kc >= 50 and abs(kc - est) / kc > ENERGY_TOLERANCE:
            reasons.append("The page's own figures don't add up: %s Cal printed, but its protein %s g, carbs %s g and fat %s g add up to "
                           "about %d Cal (%d%% off)%s." % (cal, protein, carbs, fat, round(est), round(abs(kc - est) / kc * 100),
                                                          "; its Per Container column has the same gap" if len(panels) == 2 else ""))
        if approx:
            reasons.append("Every figure on the page is printed with ~ (approximate): not published as if exact.")
        if float(sat.lstrip("<")) > ff + 0.0001:
            reasons.append("Saturates %s g are more than total fat %s g." % (sat, fat))
        if float(sugar.lstrip("<")) > cf + 0.0001 or float(fibre.lstrip("<")) > cf + 0.0001:
            reasons.append("Sugars %s g or fibre %s g are more than total carbohydrate %s g." % (sugar, fibre, carbs))
        items.append({"id": ID_OVERRIDE.get(slug) or make_id(name), "name": name, "category": category, "serving": serving, "calories": cal, "protein_g": protein, "carbs_g": carbs,
                      "fat_g": fat, "sat_fat_g": sat, "sodium_mg": sodium, "sugar_g": sugar, "fiber_g": fibre, "trans_fat_g": trans,
                      "tags": "|".join(tags), "rankable": rankable, "notes": note, "_slug": slug, "_held": reasons})
        if reasons:
            holdback.append((slug, " ".join(reasons) + " Not corrected. Restore by deleting this line once the chain corrects the page."))
    if set(unreadable) != EXPECTED_UNREADABLE:
        raise SystemExit("pages left out as unreadable changed: now %s, expected %s" % (sorted(unreadable), sorted(EXPECTED_UNREADABLE)))
    held = {s for s, _ in holdback}
    if held != EXPECTED_HELD:
        raise SystemExit("the set of held-back items changed: now %s, expected %s. Re-read those pages, then update EXPECTED_HELD."
                         % (sorted(held), sorted(EXPECTED_HELD)))
    ids = {it["_slug"]: it["id"] for it in items}
    if len(set(ids.values())) != len(ids):
        raise SystemExit("two items would get the same id")
    holdback = [(ids[s], r) for s, r in holdback]
    for it in items:
        it.pop("_held")
        it.pop("_slug")
    report.append("the 'Cholesterol' slot repeats the calorie figure on %d of %d panel pages (page bug; not used)" % (bug_pages, len(items)))
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the pages were read")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if len(NOTE) >= 400:
        raise SystemExit("NOTE is %d characters, must be under 400" % len(NOTE))
    if args.fetch:
        fetch_all(args.pages)
    items, holdback, report = build(args.pages)
    matrix = pg.read_allergen_matrix((args.pages / "allergen.html").read_text(encoding="utf-8"))
    guide = {"title": ALLERGEN_GUIDE_TITLE_FMT.format(d=args.checked_on), "url": pg.ALLERGEN_URL, "checked_on": args.checked_on,
             "may_contain_published": True}
    out = write_chain_folder(chain_id=CHAIN_ID, name="Shah's Halal Food", cuisine="Middle Eastern",
                             source_title=SOURCE_TITLE_FMT.format(d=args.checked_on), source_url=SOURCE_URL, checked_on=args.checked_on,
                             aliases=ALIASES, items=items, out=args.out, note=NOTE, holdback=holdback, allergen_guide=guide)
    for f in ["sitemap.xml", "home.html", "menu.html", "allergen.html"] + ["pages/%s.html" % s for s in sorted(FOOD)]:
        p = args.pages / f
        if p.exists():
            print("sha256 %s  %s" % (sha256_file(p), f))
    print("\n".join(report))
    print("allergen matrix: %d rows read (not published: it disagrees with the product pages; guide link only)" % len(matrix))
    print("wrote %d items to %s (%d held back)" % (len(items), out, len(holdback)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
