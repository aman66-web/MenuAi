#!/usr/bin/env python3
"""Build data/source/wagamama/ from Wagamama UK's own menu page, which carries every item's nutrition.

    curl -sSL -A 'Mozilla/5.0 ...' -o menu.html https://www.wagamama.com/menu      # one request, no crawl
    python3 tools/uk_extract/wagamama.py menu.html --checked-on 2026-10-06

Numbers are copied from the page's embedded menu data exactly as printed (kcal, kJ, protein, carbs, fat, saturates, sugars,
fibre, salt, all PER SERVING; per-100g values and the page's sodium are not used). Only names, categories and grouping are handled here.
https://www.wagamama.com/menu is the Great Britain site (Northern Ireland has its own page, /menu-ni, which is not read).

If Wagamama adds, removes or moves items the counts below no longer match and this script stops, so a human re-checks.

Allergens come from the same page: every recipe carries the menu's own allergen flags (the 14 allergens, with the named
cereals and tree nuts as sub-flags), each "yes" (shown on the site as contains) or "maybe" (shown as "may contain allergens").
The flag names are read from the page and mapped with common.allergen_words; an unknown flag name or value stops the script.
Wagamama's allergen table (ALLERGEN_TABLE, the same "17 June 2026" menu) prints the same flags for the food dishes and was
used to cross-check them on 2026-10-06. Two of the page's notices are not allergens and are reported, not read:
"for allergen information please check the label" (bottled soft drinks, beers, wines: the flags still list what the
drink contains, e.g. gluten for beer) and "do not display the allergen/nutrition" (an item the site hides: held back).

What is left out, and why (every rule is counted, so a change in any of them stops the script):
  * Items whose nutrition the page prints as "-" (all alcoholic drinks: cocktails, beer, cider, wine, sake). Not published.
  * Gluten free menu entries that are the same recipe as a standard item (same id) or a separate recipe whose numbers are
    identical to the standard dish (GF_SAME_AS): listing them twice would only duplicate rows. A gluten free recipe whose numbers
    DIFFER from the standard dish is published as its own item, named "... (gluten free menu)".
"""
from __future__ import annotations
import argparse
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import wagamama_page  # noqa: E402
from common import ROOT, allergen_words, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "wagamama"
SOURCE_URL = "https://www.wagamama.com/menu"
ALLERGEN_TABLE = "https://menus.tenkites.com/wagamamauk/wagamamainternalallergymatrix"  # linked from wagamama.com/allergen-information

# The page's own flags that are not allergens (diet marks, badges, two notices). Every other flag name must be one of the 14
# allergens or a named cereal / tree nut (common.allergen_words), otherwise the script stops.
CHECK_LABEL, HIDDEN = "for allergen information please check the label", "do not display the allergen/nutrition"
NOT_ALLERGEN_FLAGS = {"vegan", "vegetarian", "vegan hero", "new", "refreshed", "lighter", CHECK_LABEL, HIDDEN}

# page section path -> (expected recipe count, category, rankable, limited_time, name prefix, name suffix)
# rankable: false for drinks, desserts and extras (sauces, pickles, a single egg); true for everything else (the chain's sides
# are real servings, as for the other chains).
S = [
    (("limited time only", "buldak"), 2, "Limited time", True, True, "", ""),
    (("lunch time",), 5, "Lunch time", True, False, "", ""),
    (("sides", "lighter bites"), 5, "Lighter bites", True, False, "", ""),
    (("sides", "gyoza"), 4, "Gyoza", True, False, "", " gyoza"),
    (("sides", "big flavour bites"), 9, "Big flavour bites", True, False, "", ""),
    (("sides", "bao buns"), 5, "Bao buns", True, False, "", " bao bun"),
    (("the main event", "curries"), 10, "Curries", True, False, "", ""),
    (("the main event", "donburi"), 6, "Donburi", True, False, "", ""),
    (("the main event", "ramen"), 6, "Ramen", True, False, "", ""),
    (("the main event", "teppanyaki"), 10, "Teppanyaki", True, False, "", ""),
    (("extras",), 9, "Extras", False, False, "", ""),
    (("desserts + sweet treats",), 12, "Desserts", False, False, "", ""),
    (("drinks", "freshly made juices"), 5, "Juices", False, False, "", " juice"),
    (("drinks", "soft drinks"), 12, "Soft drinks", False, False, "", ""),
    (("drinks", "cocktails"), 4, "Cocktails", False, False, "", ""),
    (("drinks", "beers + cider"), 5, "Beers + cider", False, False, "", ""),
    (("drinks", "wine + sake"), 7, "Wine + sake", False, False, "", ""),
    (("drinks", "coffee + tea"), 8, "Coffee + tea", False, False, "", ""),
    (("kids", "katsu"), 4, "Kids", True, False, "Kids ", ""),
    (("kids", "ramen"), 4, "Kids", True, False, "Kids ", ""),
    (("kids", "noodles"), 4, "Kids", True, False, "Kids ", ""),
    (("kids", "rice"), 3, "Kids", True, False, "Kids ", ""),
    (("kids", "desserts"), 5, "Kids", False, False, "Kids ", ""),
    (("kids", "drinks"), 6, "Kids", False, False, "Kids ", ""),
    # The gluten free menu repeats many standard items; see GF_SAME_AS and the rules in main().
    (("gluten free", "sides"), 6, "Gluten free menu", True, False, "", " (gluten free menu)"),
    (("gluten free", "the main event"), 14, "Gluten free menu", True, False, "", " (gluten free menu)"),
    (("gluten free", "desserts + sweet treats"), 3, "Gluten free menu", False, False, "", " (gluten free menu)"),
    (("gluten free", "drinks"), 37, "Gluten free menu", False, False, "", " (gluten free menu)"),
]
RULES = {path: rest for path, *rest in S}

# Gluten free recipes (first 8 characters of their id) whose per-serving numbers equal those of the standard dish (id prefix).
# main() re-checks the equality on every run; if one now differs the script stops so a human decides.
GF_SAME_AS = {
    "079343b0": "a3417688", "9dcf7e05": "fb38b3d2", "3decdf59": "f4a7debd", "e739cdd0": "0ce6d91c", "ad6aa444": "9f0af8db",
    "bcdf1718": "3905de0c", "58deb023": "6be06de5", "63f31115": "0aa79163", "7338d320": "c58e57b5", "d09f5dc8": "f60c968a",
    "a6f07f7d": "728dbcfb", "705c94da": "dc6bb597", "77f7461e": "4763aa8d", "6014b9d4": "d7797223", "dd8d177b": "f530a70e",
    "3c496ac9": "1f433859", "20c6a835": "97642a43", "703ba388": "2a8d0628", "a97719a3": "319717a5",
}

# Names that can't be derived from the page's name alone (two recipes with the same name): id prefix -> printed distinction.
NAME_OVERRIDE = {
    "e1e2ccb8": "Kids yasai cha han (vegetarian)",   # the page's internal name: "kids - mini cha han vegetarian"
    "f6fd1c7d": "Kids yasai cha han (vegan)",        # the page's internal name: "kids - mini cha han vegan"
    "13c2c384": "Signature seafood ramen (gluten free menu, may contain small bones)",  # avoids "(...) (gluten free menu)"
}

# Printed nutrient labels on the page -> items.csv columns. Anything else on the page must be one of IGNORED or we stop.
COLUMNS = {
    "energy (kcal)": "calories", "protein (g)": "protein_g", "carb (g)": "carbs_g", "fat (g)": "fat_g",
    "sat fat (g)": "sat_fat_g", "of which sugars (g)": "sugar_g", "fibre (g)": "fiber_g", "salt (g)": "salt_g",
}
IGNORED = {"Energy (kj)", "sodium (g)"}  # kJ is read separately (energy_kj); sodium is printed in g (we never convert sodium to salt or the reverse)

PORK = re.compile(r"\bpork\b|bacon|\bham\b|sausage|chorizo|salami|pepperoni|pancetta", re.I)
BEEF = re.compile(r"\bbeef\b|brisket|steak", re.I)
ANIMAL = re.compile(r"chicken|duck|prawn|salmon|squid|seafood|fish|clams|beef|pork|brisket|steak|bacon|\bham\b", re.I)

PROPER = [(r"\bkorean\b", "Korean"), (r"\bhoisin\b", "Hoisin"), (r"\bcoke\b", "Coke"), (r"\bsprite\b", "Sprite"),
          (r"\bcawston press\b", "Cawston Press"), (r"\bdouble dutch\b", "Double Dutch"), (r"\basahi\b", "Asahi"),
          (r"\bcappucino\b", "cappuccino")]  # last one fixes the page's misspelling


def tidy(raw: str) -> str:
    s = re.sub(r"\s+", " ", raw).strip()
    if " | " in s:  # the page writes variants as "yasai yaki soba | udon"
        base, variant = s.split(" | ", 1)
        s = f"{base} ({variant})"
    for pat, rep in PROPER:
        s = re.sub(pat, rep, s, flags=re.I)
    return s


def display_name(recipe: dict, prefix: str, suffix: str) -> str:
    if recipe["ident"][:8] in NAME_OVERRIDE:
        return NAME_OVERRIDE[recipe["ident"][:8]]
    s = prefix + tidy(recipe["name"]) + suffix
    return s[0].upper() + s[1:]


def number(text: str, who: str, label: str) -> str:
    """The printed number: only the thousands comma is dropped ("1,012" -> "1012"). Anything unexpected stops the script."""
    t = text.replace(",", "")
    if not re.fullmatch(r"\d+(\.\d+)?", t):
        raise SystemExit(f"{who}: {label} is printed as {text!r}, which this script does not know how to read.")
    return t


def numbers(recipe: dict) -> dict | None:
    """Per-serving values by column, or None if the page prints '-' for everything (not published)."""
    nutr = recipe["nutr"]
    unknown = set(nutr) - set(COLUMNS) - IGNORED
    missing = set(COLUMNS) - set(nutr)
    if unknown or missing:
        raise SystemExit(f"{recipe['name']!r}: the nutrient labels changed (new: {sorted(unknown)}, missing: {sorted(missing)}).")
    printed = {label: nutr[label] for label in list(COLUMNS) + sorted(IGNORED)}
    if all(v == "-" for v in printed.values()):
        return None
    if any(v == "-" for v in printed.values()):
        raise SystemExit(f"{recipe['name']!r}: some nutrients are printed as '-' and some not: decide by hand.")
    return {col: number(nutr[label], recipe["name"], label) for label, col in COLUMNS.items()}


def allergen_flags(names: dict) -> dict:
    """flag id -> (allergen key, named cereal / tree nut or None), from the flag names the page itself defines."""
    flags = {}
    for fid, desc in names.items():
        if desc in NOT_ALLERGEN_FLAGS:
            continue
        keys, cereals, nuts = allergen_words([desc], f"Wagamama flag {fid}")
        flags[fid] = (keys.pop(), next(iter(cereals | nuts), None))
    tops = {k for k, spec in flags.values() if spec is None}
    if len(tops) != 14:
        raise SystemExit(f"The page defines {len(tops)} allergen flags, not 14: {sorted(tops)}. Re-check the reader.")
    return flags


def recipe_allergens(recipe: dict, flags: dict) -> dict:
    """The recipe's flags as printed: "yes" -> contains, "maybe" -> may contain; a sub-flag (wheat, almond nuts...) marked
    "yes" names the cereal or nut. Anything else (an unknown value, a sub-flag outside its group) stops the script."""
    contains, may, cereals, nuts, seen = set(), set(), set(), set(), set()
    for fid, val, children in recipe["intols"]:
        if fid in seen:
            raise SystemExit(f"{recipe['name']!r}: flag {fid} is listed twice.")
        seen.add(fid)
        if fid not in flags:
            continue  # a diet mark or a notice
        key, specific = flags[fid]
        if specific is not None or val not in ("yes", "maybe"):
            raise SystemExit(f"{recipe['name']!r}: flag {fid} = {val!r} where an allergen group was expected.")
        (contains if val == "yes" else may).add(key)
        for cid, cval in children:
            ckey, cspec = flags.get(cid, (None, None))
            if ckey != key or cspec is None or cval not in ("yes", "maybe"):
                raise SystemExit(f"{recipe['name']!r}: sub-flag {cid} = {cval!r} under {key!r} is not one this script knows.")
            if cval == "yes":
                if val != "yes":
                    raise SystemExit(f"{recipe['name']!r}: {cspec!r} is marked as contained but {key!r} only as 'may contain'.")
                (cereals if key == "gluten" else nuts).add(cspec)
    return {"contains": contains, "may_contain": may - contains, "cereals": cereals, "nuts": nuts}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("html", type=Path, help="the saved https://www.wagamama.com/menu page")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you downloaded the page")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    menu = wagamama_page.read_menu(args.html)
    recipes = menu["recipes"]
    flags = allergen_flags(menu["intol_names"])
    notice_ids = {fid: desc for fid, desc in menu["intol_names"].items() if desc in (CHECK_LABEL, HIDDEN)}
    if "UK" not in menu["menu_name"]:
        raise SystemExit(f"The menu is now called {menu['menu_name']!r}, not a UK menu: check the page.")

    # 1. Section layout must be exactly what this script knows.
    counts: dict[tuple, int] = {}
    for r in recipes:
        counts[r["section"]] = counts.get(r["section"], 0) + 1
    if counts != {path: rest[0] for path, rest in RULES.items()}:
        raise SystemExit("The menu sections or their item counts changed:\n  page:   "
                         f"{counts}\n  script: { {p: v[0] for p, v in RULES.items()} }\nRe-check S, GF_SAME_AS and NAME_OVERRIDE.")
    standard = {r["ident"][:8]: r for r in recipes if r["section"][0] != "gluten free"}
    for gf, std in GF_SAME_AS.items():
        if std not in standard:
            raise SystemExit(f"GF_SAME_AS names standard recipe {std} which is no longer on the page.")
    wanted_overrides = set(NAME_OVERRIDE)
    if not wanted_overrides <= {r["ident"][:8] for r in recipes}:
        raise SystemExit("NAME_OVERRIDE names a recipe that is no longer on the page.")

    items, unpublished, same_id, same_numbers, variants = [], [], [], [], []
    seen_ids: set[str] = set()
    for r in recipes:
        _, _, rankable, limited, prefix, suffix = RULES[r["section"]]
        category = RULES[r["section"]][1]
        nums = numbers(r)
        first_time = r["ident"] not in seen_ids
        seen_ids.add(r["ident"])
        if nums is None:
            unpublished.append(r["name"])
            continue
        if not first_time:
            same_id.append(r["name"])  # the gluten free menu lists the very same recipe again
            continue
        short = r["ident"][:8]
        if short in GF_SAME_AS:
            other = numbers(standard[GF_SAME_AS[short]])
            if other != nums or r["nutr"] != standard[GF_SAME_AS[short]]["nutr"]:
                raise SystemExit(f"Gluten free {r['name']!r} used to match the standard dish but its numbers now differ: "
                                 "decide whether to publish it as its own item (remove it from GF_SAME_AS).")
            same_numbers.append(r["name"])
            continue
        note = ""
        if r["section"][0] == "gluten free":
            variants.append(r["name"])
            note = "Gluten free menu version: its printed numbers differ from the standard dish of the same name"
        text = " ".join([r["name"], r["orig_name"], r["desc"], r["pro_desc"]])
        tags = []
        if r["vegetarian"] or r["vegan"]:
            tags.append("vegetarian")
        if PORK.search(text):
            tags.append("contains_pork")
        if BEEF.search(text):
            tags.append("contains_beef")
        notes = [note] if note else []
        kcal, kj = float(nums["calories"]), float(number(r["nutr"]["Energy (kj)"], r["name"], "Energy (kj)"))
        if abs(kj - 4.184 * kcal) > 8 and abs(kj - 4.184 * kcal) / (4.184 * kcal) > 0.05:
            notes.append(f"Printed kJ ({r['nutr']['Energy (kj)']}) and kcal ({r['nutr']['energy (kcal)']}) do not agree")
        if float(nums["fiber_g"]) > float(nums["carbs_g"]):
            notes.append("Fibre is printed higher than carbohydrate")
        notices = sorted(notice_ids[fid] for fid, _, _ in r["intols"] if fid in notice_ids)
        items.append({
            "name": display_name(r, prefix, suffix), "category": category, "serving": "", **nums, "sodium_mg": "",
            "energy_kj": number(r["nutr"]["Energy (kj)"], r["name"], "Energy (kj)"),
            "tags": "|".join(tags), "limited_time": limited, "rankable": rankable, "notes": "; ".join(notes),
            "allergens": recipe_allergens(r, flags),
            "_veg": bool(tags and tags[0] == "vegetarian"), "_text": text, "_modified": r["modified"], "_ident": short,
            "_notices": notices,
        })

    # 2. The rules above must leave exactly what was reviewed.
    expected = {"published": 139, "unpublished": 27, "same_id": 25, "same_numbers": 19, "variants": 4}
    got = {"published": len(items), "unpublished": len(unpublished), "same_id": len(same_id), "same_numbers": len(same_numbers),
           "variants": len(variants)}
    if got != expected:
        raise SystemExit(f"The item set changed: expected {expected}, got {got}. Re-review before publishing.")
    names = [i["name"] for i in items]
    ids = [slug(n) for n in names]
    if len(set(ids)) != len(ids):
        dupes = sorted({n for n in names if names.count(n) > 1})
        raise SystemExit(f"Two items got the same name: {dupes}. Add them to NAME_OVERRIDE.")

    # Items printed with exactly the same numbers as another item (not zero-calorie drinks): say so in notes, publish both.
    same_key: dict[tuple, list[dict]] = {}
    for i in items:
        if float(i["calories"]) >= 20:
            same_key.setdefault(tuple(i[c] for c in COLUMNS.values()), []).append(i)
    for group in same_key.values():
        for i in group:
            others = [o["name"] for o in group if o is not i]
            if others:
                i["notes"] = "; ".join(filter(None, [i["notes"], "Printed with exactly the same numbers as " + " and ".join(others)]))

    # Items the site itself hides ("do not display the allergen/nutrition") are held back; "check the label" items are reported.
    holdback = HOLDBACK + [(slug(i["name"]), "Wagamama's own menu data marks this item 'do not display the allergen/nutrition'")
                           for i in items if HIDDEN in i["_notices"]]
    for i in items:
        if CHECK_LABEL in i["_notices"]:
            print(f"'check the label' notice (flags read as printed): {i['name']}", file=sys.stderr)
    for item_id, why in holdback:
        print(f"held back: {item_id}: {why}", file=sys.stderr)

    # Report what a human should look at (not written to the data).
    unstated = [i["name"] for i in items if not i["_veg"] and not ANIMAL.search(i["_text"])]
    print("meat type not stated:", unstated or "none", file=sys.stderr)
    modified = max(i["_modified"] for i in items)[:10]
    modified_text = f"{int(modified[8:10])} {date.fromisoformat(modified):%B %Y}"
    for i in items:
        for k in [k for k in i if k.startswith("_")]:
            del i[k]

    write_chain_folder(
        chain_id=CHAIN_ID, name="Wagamama", cuisine="Japanese",
        source_title=f"Wagamama UK menu and nutrition information (wagamama.com/menu; item records last modified {modified_text})",
        source_url=SOURCE_URL, checked_on=args.checked_on, aliases=["wagamama", "wagamamas"], items=items, out=args.out,
        note=NOTE, holdback=holdback,
        allergen_guide={"title": f"Wagamama UK menu allergen information (wagamama.com/menu, menu \"{menu['menu_name']}\")",
                        "url": SOURCE_URL, "checked_on": args.checked_on, "may_contain_published": True})
    print(f"wrote {len(items)} items to {args.out}; left out: {len(unpublished)} with no published nutrition, "
          f"{len(same_id)} repeated on the gluten free menu, {len(same_numbers)} gluten free with identical numbers; "
          f"{len(variants)} gluten free variants kept (page sha256 {sha256_file(args.html)})")
    return 0


NOTE = ("Alcoholic drinks are not listed because Wagamama publishes no nutrition for them. "
        "Gluten free menu dishes appear only where their numbers differ from the standard dish.")
HOLDBACK: list[tuple[str, str]] = []

if __name__ == "__main__":
    sys.exit(main())
