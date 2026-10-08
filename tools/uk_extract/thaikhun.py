#!/usr/bin/env python3
"""Build data/source/thaikhun/ from Thaikhun's allergen and calorie page hosted by Ten Kites (a CALORIES-ONLY chain).

    python3 tools/uk_extract/thaikhun.py --page DIR/thaikhun.html --checked-on 2026-10-08 [--fetch] [--ten-kites-only] [--out DIR]

Source: https://menus.tenkites.com/tlg/thaikhun ("THAIKHUN STREET FOOD MENU", Thai Leisure Group's page, no date shown). robots.txt there
only disallows /fonts/, /views/ and *.less. The page lists 138 dishes in 10 sections; each shows "- 417 kcal" beside its name (a
thousands comma in 12 of them: "1,070 kcal") and a pop-up with "Contains:" / "May contain:" lines. It prints no protein, carbs, fat or any
other nutrient, so protein, carbs and fat stay blank (docs/DATA.md "Calories-only chains"). Calories are copied exactly as printed.
`serving` stays blank (the page says nothing about portions). The page's other two menus (KIDS MENU, 9 dishes, and COCKTAILS, 13
dishes: same layout, `?mguid=` links) are not read: the brief was the street food menu, nibbles to desserts.

What the script does with the printed allergens: each dish's "Contains" and "May contain" lines are read with the shared helpers
(common.allergen_words, tenkites_c._keys) and checked against the label ids on the dish (the page's own allergen filter names them): the two
must agree for all 138 dishes or the run stops. One quirk is handled openly: the page prints a generic "Nuts" label (id 29) that its filter does not
offer; it is read as tree nuts (the conservative reading, and what the chain's other page says for the same dishes). A dish with no label id at
all (no allergen and no Vegan/Vegetarian mark) has no allergen information on the page, so it cannot be published (the 7 meat curries).

SOURCE PROBLEM FOUND 2026-10-08 (read this before banking): the Ten Kites page is not linked from thaikhun.co.uk. Every restaurant's own
menu page links "Allergen & Calorie information" to https://igfd.menu/gateshead/thaikhun-metrocentre-oizg, whose dishes match the chain's
current main menu (TK_Main_Menu_AUG26.pdf), and the Ten Kites page is an older copy: of its 138 dishes only 68 have a dish of the
same name on the current page, and for 53 of those 64 (the other 4 rows are a name printed twice) the current page prints a different
calorie figure (Thai Green Curry Prawn 744 vs 501, Massaman Chicken 1,037 vs 621, Jasmine Rice 374 vs 265...). The Ten Kites page also
carries "Curry of the Month (May 2025) by Chef Ning - TK Bath". Neither page is chosen over the other: by default a dish is published ONLY when both pages print the
same calories under the same name AND the same allergens (thaikhun_current_page.py holds what the current page prints, captured 2026-10-08).
Every other dish stays in items.csv but is listed in holdback.csv with the reason (delete a line there to restore it), or with
--ten-kites-only the cross-check is skipped and everything the Ten Kites page prints is published (the founder's call).

Names: the page prints many in capitals, some with chilli marks and a heart: the marks are dropped, capitals are tidied,
three typos are corrected (CHICKIEN, CHCIKEN twice; the printed spelling is kept in the row's notes) and dishes whose names collide get
the description's flavour added, e.g. "Pork Rib Stack (Salt and Pepper)". Tags: vegetarian when the page marks the dish Vegetarian or Vegan;
contains_pork / contains_beef when the name or description says so. Run python with -I when reading saved pages. Python 3.9 compatible.
"""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tenkites_c as tk  # noqa: E402
import thaikhun_current_page as cur  # noqa: E402
from common import allergen_words, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "thaikhun"
URL = "https://menus.tenkites.com/tlg/thaikhun"
SOURCE_TITLE = "Thaikhun Street Food Menu allergen and calorie page (Ten Kites, accessed {date}, no date shown)"
ALLERGEN_TITLE = "Thaikhun Street Food Menu allergen information (Ten Kites)"
ALIASES = ["thaikhun", "thai khun", "thaikhun street food", "thaikhun thai street food"]
EXPECTED_DISHES = 138
EXPECTED_SECTIONS = ["Nibbles", "Sharing Starters", "Small Plates", "Curry", "STIR FRY", "Noodles & Fried Rice", "Specials", "Thai Bowls",
                     "SIDES", "Desserts"]
CATEGORY = {"STIR FRY": "Stir fry", "SIDES": "Sides"}  # the other printed section names are used as printed
ENERGY = re.compile(r"^- ([\d,]+) kcal$")
MARKS = re.compile("[\U0001F336♥️]")  # chilli and heart marks printed beside names
SMALL = {"and", "with", "on", "or", "of", "the", "in"}
KEEP_UPPER = {"BBQ"}
# Typos the page prints (after the marks are removed): shown corrected, printed spelling kept in notes.
TYPOS = {"STREET NOODLES CHICKIEN": "Street Noodles Chicken", "CHILLI AND CASHEW NUTS CRISPY CHCIKEN": "Chilli and Cashew Nuts Crispy Chicken",
         "SWEET AND SOUR CRISPY CHCIKEN": "Sweet and Sour Crispy Chicken", "6 Chicken Wing": "6 Chicken Wings"}
GENERIC_NUTS_ID = "29"  # the page's own "Nuts" label (not one of the labels its allergen filter offers)
BATH_SPECIAL = re.compile(r"Curry of the Month|TK Bath")


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower().replace("&", "and")).strip()


def tidy(name: str) -> str:
    """'THAI GARLIC & BLACK PEPPER CHICKEN' -> 'Thai Garlic & Black Pepper Chicken'. Names already in mixed case are left alone."""
    letters = [c for c in name if c.isalpha()]
    if not letters or not all(c.isupper() for c in letters):
        return name
    out = []
    for i, w in enumerate(name.split()):
        if w.upper() in KEEP_UPPER:
            out.append(w.upper())
        elif i and w.lower() in SMALL:
            out.append(w.lower())
        else:
            out.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(out)


# ---------------------------------------------------------------- reading the page

def read_page(text: str) -> list[dict]:
    """One row per dish, in page order: {"section", "printed", "kcal", "desc", "contains", "may", "ids", "no_may_ids"}."""
    root = tk.parse_html(text)
    body = root.find("k10-all-courses")
    if body is None:
        raise SystemExit("the page no longer has a k10-all-courses block: its layout changed, check the script before running again")
    filt = tk.filter_labels(root)
    suitable = {n.attrs["data-label-id"]: n.attrs["data-label-name"].strip() for n in root.iter()
                if n.attrs.get("data-label-id") and n.attrs.get("data-label-isext") == "False"}
    if suitable != {"52": "Vegan", "50": "Vegetarian"}:
        raise SystemExit(f"the page's dietary labels are now {suitable}: check the script (expected 52 Vegan, 50 Vegetarian)")
    rows = []
    for rec in body.iter():
        if not rec.has("k10-recipe_menu-item"):
            continue
        printed = rec.find("k10-recipe__name-wrapper").text()
        energy = rec.find("k10-recipe__nutrient_energy")
        m = ENERGY.match(energy.text() if energy is not None else "")
        if not m:
            raise SystemExit(f"{printed!r}: no '- NNN kcal' beside the name ({energy.text() if energy is not None else None!r}): the page changed")
        desc = rec.find("k10-recipe__desc")
        lines = {"contains": None, "may": None}
        pop = rec.find("k10-popover__label-names-wrapper")
        for div in (c for c in (pop.children if pop is not None else []) if isinstance(c, tk.Node) and c.tag == "div"):
            if div.text():
                tk._line(div.text(), lines, {"Contains:": "contains", "May contain:": "may", "Suitable for:": None}, printed)
        ids = [x for x in rec.attrs.get("data-all-labels", "").split(",") if x]
        no_may = [x for x in rec.attrs.get("data-no-may-labels", "").split(",") if x]
        rows.append({"section": tk._course_section(rec), "printed": printed, "kcal": m.group(1).replace(",", ""),
                     "desc": desc.text() if desc is not None else "", **lines, "ids": ids, "no_may_ids": no_may,
                     "named": {i: n for i, n in filt.items()}})
    return rows


def allergens_of(row: dict) -> dict | None:
    """The dish's allergens from its printed lines, checked against its label ids. None when the page gives the dish no label at all."""
    if not row["ids"]:
        return None
    where = row["printed"]
    named = {i: allergen_words([n], where)[0] for i, n in row["named"].items()}

    def from_ids(group):
        keys = set()
        for i in group:
            keys |= named.get(i, set())
            if i == GENERIC_NUTS_ID:
                keys.add("nuts")
        return keys

    contains, cereals, nuts = tk._keys(row["contains"], where, None)
    may, _, _ = tk._keys(row["may"], where, None)
    id_contains = from_ids(row["no_may_ids"])
    id_may = from_ids([i for i in row["ids"] if i not in row["no_may_ids"]])
    if contains != id_contains or (may - contains) != (id_may - id_contains):
        raise SystemExit(f"{where}: the printed allergen lines (contains {sorted(contains)}, may contain {sorted(may - contains)}) disagree "
                         f"with the dish's label ids (contains {sorted(id_contains)}, may contain {sorted(id_may - id_contains)})")
    if ("Nuts" in [h for h, _ in (row["contains"] or [])]) != (GENERIC_NUTS_ID in row["no_may_ids"]):
        raise SystemExit(f"{where}: the generic 'Nuts' label and the label id {GENERIC_NUTS_ID} no longer go together")
    return {"contains": contains, "may_contain": may, "cereals": cereals, "nuts": nuts}


# ---------------------------------------------------------------- cross-check with the chain's current page

def check_against_current(name: str, kcal: str, allergens: dict | None, twice: bool) -> str:
    """'' when both pages agree (publish), else the reason to hold the dish back."""
    if twice:
        return "The Ten Kites page prints this name twice, with the same description but different calories (it contradicts itself): neither row is published."
    entry = cur.CURRENT.get(norm(name))
    if entry is None:
        return (f"Not confirmed: no dish of this name with calories on Thaikhun's current Allergen & Calorie page (igfd.menu, captured "
                f"{cur.CAPTURED_ON}); the Ten Kites page looks like an older copy of the menu.")
    printed_name, values, (c_contains, c_may) = entry
    k = int(kcal)
    if not any(int(float(v)) == k or round(float(v)) == k for v in values):
        return (f"Contradicted: Thaikhun's current Allergen & Calorie page (igfd.menu, captured {cur.CAPTURED_ON}) prints "
                f"{' / '.join(values)} kcal for {printed_name!r}, the Ten Kites page {kcal}.")
    if allergens is not None:
        mine_c, mine_m = sorted(allergens["contains"]), sorted(allergens["may_contain"] - allergens["contains"])
        if mine_c != c_contains or mine_m != sorted(set(c_may) - set(c_contains)):
            return (f"Allergens contradicted: calories agree ({kcal}) but the two Thaikhun pages list different allergens (Ten Kites: contains "
                    f"{mine_c}, may contain {mine_m}; current page: contains {c_contains}, may contain "
                    f"{sorted(set(c_may) - set(c_contains))}). Not published.")
    return ""


# ---------------------------------------------------------------- building the items

def build(text: str, ten_kites_only: bool) -> tuple[list[dict], list[tuple[str, str]], list[str]]:
    rows = read_page(text)
    if len(rows) != EXPECTED_DISHES:
        raise SystemExit(f"the page has {len(rows)} dishes but this script expects {EXPECTED_DISHES}: the menu changed, re-check before running again")
    sections = []
    for r in rows:
        if r["section"] not in sections:
            sections.append(r["section"])
    if sections != EXPECTED_SECTIONS:
        raise SystemExit(f"sections are now {sections}, expected {EXPECTED_SECTIONS}")
    report: list[str] = []
    # names after tidying; a name printed more than once is told apart by its description when that differs
    for r in rows:
        clean = re.sub(r"\s+", " ", MARKS.sub("", r["printed"])).strip()
        r["clean"] = clean
        r["name"] = TYPOS.get(clean) or tidy(clean)
        r["desc_flat"] = re.sub(r"\s+", " ", r["desc"]).strip().rstrip(".")
    groups: dict = {}
    for r in rows:
        groups.setdefault(norm(r["name"]), []).append(r)
    twice = set()
    for g in groups.values():
        if len(g) > 1:
            descs = {re.sub(r"\s+", "", x["desc_flat"]).lower() for x in g}
            if len(descs) == len(g):
                for x in g:
                    x["name"] = f"{x['name']} ({x['desc_flat']})"
            else:  # same name and same description: the page contradicts itself
                if len({x["kcal"] for x in g}) > 1:
                    twice.update(id(x) for x in g)
    items, holdback = [], []
    for r in rows:
        allergens = allergens_of(r)
        if BATH_SPECIAL.search(r["desc"]):
            report.append(f"excluded {r['name']!r}: a single-restaurant special ('{BATH_SPECIAL.search(r['desc']).group(0)}', TK Bath, May 2025)")
            continue
        if allergens is None:
            report.append(f"excluded {r['name']!r}: the page gives this dish no allergen or dietary label at all, so its allergens are unknown")
            continue
        veg = ("50" in r["ids"]) or ("52" in r["ids"])
        meat, unspecified = tk.meat_tags(r["name"], r["desc"], vegetarian=veg)
        if unspecified:
            report.append(f"meat type not stated: {r['name']}")
        notes = []
        if r["clean"] != r["name"] and r["clean"] in TYPOS:
            notes.append(f"printed '{r['printed']}'")
        if r["printed"] != r["clean"]:
            notes.append(f"printed '{r['printed']}' (heart / chilli marks dropped)")
        item = {"name": r["name"], "category": CATEGORY.get(r["section"], r["section"]), "serving": "", "calories": r["kcal"],
                "tags": "|".join((["vegetarian"] if veg else []) + meat), "rankable": False, "allergens": allergens,
                "notes": "; ".join(dict.fromkeys(notes))}
        items.append(item)
        item["_reason"] = "" if ten_kites_only else check_against_current(r["name"], r["kcal"], allergens, id(r) in twice)
    # ids exactly as write_chain_folder will make them (slug of the name, numeric suffix for a clash)
    seen: dict = {}
    for it in items:
        base = slug(it["name"])
        n = seen.get(base, 0)
        seen[base] = n + 1
        it["_id"] = base if n == 0 else f"{base}-{n + 1}"
        reason = it.pop("_reason")
        if reason:
            holdback.append((it["_id"], reason))
    return items, holdback, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", type=Path, required=True, help="the saved Ten Kites page (thaikhun.html)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day the page was saved")
    ap.add_argument("--fetch", action="store_true", help="download the page into --page first (one request)")
    ap.add_argument("--ten-kites-only", action="store_true",
                    help="skip the cross-check with the chain's current page: publish every dish the Ten Kites page prints (founder's call)")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()
    if args.fetch:
        tk.fetch(URL, args.page)
    text = args.page.read_text(encoding="utf-8")
    items, holdback, report = build(text, args.ten_kites_only)
    published = len(items) - len(holdback)
    note = (f"Calories only: protein, carbs and fat are not published. Thaikhun's allergen page and its current Allergen & Calorie page show "
            f"different calories for many dishes, so only the {published} dishes on which both agree are listed. Kids menu, cocktails and drinks are not included."
            if not args.ten_kites_only else
            "Calories only: protein, carbs and fat are not published. Figures are from an undated Thaikhun page that may be older than the chain's "
            "current menu. Kids menu, cocktails and drinks are not included.")
    out = write_chain_folder(chain_id=CHAIN_ID, name="Thaikhun", cuisine="Thai", source_title=SOURCE_TITLE.format(date=args.checked_on),
                             source_url=URL, checked_on=args.checked_on, aliases=ALIASES, items=[{k: v for k, v in it.items() if k != "_id"} for it in items],
                             out=args.out, note=note, holdback=holdback, nutrition_level="calories",
                             allergen_guide={"title": ALLERGEN_TITLE, "url": URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"{args.page.name} sha256 {tk.sha256_text_file(args.page)}")
    print("\n".join(report))
    print(f"held back {len(holdback)}:")
    for item_id, reason in holdback:
        print(f"  {item_id}: {reason}")
    print(f"wrote {len(items)} items ({published} published, {len(holdback)} held back) to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
