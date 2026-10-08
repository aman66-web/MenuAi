#!/usr/bin/env python3
"""Build data/source/brasserie-blanc/ from Brasserie Blanc's own menus with nutrition and allergens (hosted by Ten Kites).

    python3 tools/uk_extract/brasserie_blanc.py --pages DIR --checked-on 2026-10-08 [--fetch] [--report]

DIR holds the saved menu pages (see MENUS and VARIANTS); --fetch downloads them first (one request per page, one second apart; the
robots.txt of menus.tenkites.com disallows only /fonts/, /views/ and *.less, and brasserieblanc.com allows everything). The pages are the
menus brasserieblanc.com/brasseries/<site>/menu/<menu>/ embed, all on the same Ten Kites account as Heartwood Inns (hwc):
    https://menus.tenkites.com/hwc/bbalacarte          À la carte Evening  (Beaconsfield, Bournemouth, Cheltenham, Chichester, Leeds,
                                                       Milton Keynes, Oxford, Portsmouth, Winchester; Hale Barns and the three London
                                                       sites print the same dishes on bbalacarteb/hb02 and bbalacartepm02)
    https://menus.tenkites.com/hwc/bbalacarte04        À la carte Day (the same sites; Bournemouth: bbalacartebournemouth02)
    https://menus.tenkites.com/hwc/bbsunday            Sunday (also bbsunday02 Southbank, bbsundaybhb02 Bournemouth and Hale Barns)
    https://menus.tenkites.com/hwc/bbpretheatresouthbank02   Pre-theatre (Southbank; Chichester's "Le Club Déjeuner" is bbleclubdejeuner)
    https://menus.tenkites.com/hwc/bbbreakfast         Breakfast (Beaconsfield; Threadneedle Street: bbbreakfastthreadneedle02)
    https://menus.tenkites.com/hwc/bbbreakfastalcforhotels   Breakfast à la carte (Bournemouth and Hale Barns)
    https://menus.tenkites.com/hwc/bbchildren          Children (bbchildren02 at Chancery Lane, Hale Barns, Southbank, Threadneedle Street)
    https://menus.tenkites.com/hwc/bbdrinks123         Drinks list "Autumn 2026" (bbdrinks12302 is the "Summer 2026" list the London sites and Hale Barns print)
The site codes come from the "menuMenu" field of each brasserie's menu pages (14 sites, read 2026-10-08). A variant page must print
the same dishes, numbers and allergens as its main page or the run stops (VARIANTS): so the menu is one chain-wide menu, not one per site.

Every dish, and every choice inside a "build your own" block (a bread, a bun, a sauce...), has an info pop-up with an allergen box
("Suitable for:", "Contains:", "May contain:") and a table headed "Nutrition (per portion)": Energy (kCal), Protein, Carb, of which
Sugars, Fat, Sat Fat, Salt, all in grams. The page prints no kJ, weight, fibre, mono/poly/trans fat or caffeine, so none of those columns
exist for this chain. heartwood_inns_pages.py (same template) reads the pop-ups; numbers are copied exactly as printed. The reading is
cross-checked against the schema.org menu the same page embeds and against the kcal shown on each dish line.

Nutrition is published behind the page's own visible "Hide Nutrition" switch (toolbar, "Yes" = hidden when the page opens). Switching it
to "No" shows each dish's kcal and the pop-up's table: checked by rendering the page in a browser (see the report), so it counts as published.

Allergens (docs/DATA.md "Allergens"): complete. Each pop-up prints "Contains: ..." (cereals and tree nuts named in brackets) or "This dish
contains none of the listed allergens", and optionally "May contain: ..."; the dish also carries the label ids the page's own allergen filter
reads, and tenkites_c.allergens_checked stops the run if the two disagree for any dish. Only the vegetarian tag comes from the pop-up's own
"Suitable for:" line (Vegetarian or Vegan).

What is left out, and why (each counted in the run's report):
- Wine list (bbwinel, bbwinel02: 55 wines): 51 print 0 for every nutrient and the other four print figures with no glass or bottle size.
- Room service (bbroomservice at Hale Barns, bbroomservicebournemouth): in-room menus for hotel guests at two sites only.
- bbsundaynew04 (Milton Keynes only): the Sunday menu of that one site prints different figures for the roast beef and the roast chicken
  than the Sunday menu of the other nine sites, and two different dishes; a single-site variant is not published.
- Group dining (bbparty), Christmas Day / Christmas Party, party-night and charity-dinner events (bbevents, bbevents02), New Year's Eve
  (bbnewyears02) and the Cheltenham Festival menu: pre-booked or seasonal menus, not the everyday menu.
- Fulham Reach: its menu pages exist but link no Ten Kites menu yet (menuMenu is empty).
- "Children's breakfast buffet" (hotel breakfast): listed on the page's embedded menu with no nutrition pop-up at all.
- Rows whose own numbers are impossible or contradict each other are HELD BACK (holdback.csv), never corrected; the rules are in HOLD_RULES.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
import time
import unicodedata
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import heartwood_inns_pages as hp  # noqa: E402  (same Ten Kites template)
import tenkites_a as ta  # noqa: E402  (meat words, SHARING)
import tenkites_c as tk  # noqa: E402
from common import ROOT, sha256_file, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "brasserie-blanc"
BASE = "https://menus.tenkites.com/hwc/"
# (file, code, label, kind, pop-ups the page holds). Order matters: the first page that has a dish decides its category.
MENUS = [
    ("bbalacarte.html", "bbalacarte", "À la carte Evening", "main", 73),
    ("bbalacarte04.html", "bbalacarte04", "À la carte Day", "main", 73),
    ("bbsunday.html", "bbsunday", "Sunday", "main", 68),
    ("bbpretheatresouthbank02.html", "bbpretheatresouthbank02", "Pre-theatre", "main", 25),
    ("bbbreakfast.html", "bbbreakfast", "Breakfast", "breakfast", 25),
    ("bbbreakfastalcforhotels.html", "bbbreakfastalcforhotels", "Breakfast à la carte (hotels)", "breakfast", 11),
    ("bbchildren.html", "bbchildren", "Children", "kids", 23),
    ("bbdrinks123.html", "bbdrinks123", "Drinks (Autumn 2026)", "drinks", 138),
    ("bbdrinks12302.html", "bbdrinks12302", "Drinks (Summer 2026)", "drinks", 139),
]
# (file, code, main page it must equal, pop-ups, sites)
VARIANTS = [
    ("bbalacarteb_hb02.html", "bbalacarteb/hb02", "bbalacarte.html", 73, "Hale Barns"),
    ("bbalacartepm02.html", "bbalacartepm02", "bbalacarte.html", 73, "Chancery Lane, Southbank, Threadneedle Street"),
    ("bbalacartebournemouth02.html", "bbalacartebournemouth02", "bbalacarte04.html", 73, "Bournemouth"),
    ("bbsunday02.html", "bbsunday02", "bbsunday.html", 68, "Southbank"),
    ("bbsundaybhb02.html", "bbsundaybhb02", "bbsunday.html", 68, "Bournemouth, Hale Barns"),
    ("bbleclubdejeuner.html", "bbleclubdejeuner", "bbpretheatresouthbank02.html", 25, "Chichester"),
    ("bbbreakfastthreadneedle02.html", "bbbreakfastthreadneedle02", "bbbreakfast.html", 25, "Threadneedle Street"),
    ("bbchildren02.html", "bbchildren02", "bbchildren.html", 23, "Chancery Lane, Hale Barns, Southbank, Threadneedle Street"),
]
SOURCE_URL = BASE + "bbalacarte"
SOURCE_TITLE = ("Brasserie Blanc menus with nutrition and allergens (Ten Kites pages embedded on brasserieblanc.com/menu): À la carte "
                "Evening and Day, Sunday, Pre-theatre, Breakfast, Children and Drinks (accessed 2026-10-08, no date shown)")
ALLERGEN_TITLE = ("Brasserie Blanc menus with allergens (Ten Kites): per-dish 'Contains' and 'May contain' on the same pages "
                  "(accessed 2026-10-08, no date shown)")
NOTE = ("Figures are per portion from Brasserie Blanc's own menu pages (no fibre, kJ or weights printed). Only menus served at more than "
        "one brasserie are included: à la carte (some dishes only after 5pm and on Saturdays), Sunday, pre-theatre, breakfast, children's "
        "and drinks. Wine, room service, group and Christmas menus are not. Alcoholic drinks print calories that include the alcohol.")
assert len(NOTE) < 400
ALIASES = ["brasserie blanc", "brasserieblanc", "raymond blanc brasserie"]

LABELS = OrderedDict([  # printed row name -> items.csv column
    ("Energy (kCal)", "calories"), ("Protein (g)", "protein_g"), ("Carb (g)", "carbs_g"), ("of which Sugars (g)", "sugar_g"),
    ("Fat (g)", "fat_g"), ("Sat Fat (g)", "sat_fat_g"), ("Salt (g)", "salt_g")])
CAPTION = "Nutrition (per portion)"
# the one pop-up-less entry the embedded menu lists (see the docstring)
LD_ONLY = {"bbbreakfastalcforhotels": Counter({("Children’s breakfast buffet", "0"): 1})}

# ---------------------------------------------------------------- categories
ADDONS = "Add-ons & extras"
MAIN_COURSE = {   # printed course (first path part) -> (category, rankable)
    "PRE ENTRÉE": ("Nibbles", False), "ENTRÉE": ("Starters", True), "STEAK": ("Steaks", True), "PLAT": ("Mains", True),
    "ACCOMPAGNEMENTS": ("Sides", False), "DESSERTS": ("Desserts", False), "FROMAGES": ("Cheese", False),
    "DIMANCHE": ("Sunday roasts", True),
}
BREAKFAST_COURSE = {"PETITS PLATS": ("Breakfast: Small plates", False), "PLAT": ("Breakfast: Mains", True),
                    "SUPPLÉMENTS": ("Breakfast: Extras", False)}
KIDS_COURSE = {"ENTRÉE": "Kids: Starters", "PLATS": "Kids: Mains", "DESSERTS": "Kids: Desserts", "DRINKS": "Kids: Drinks"}
DRINK_COURSE = {   # first printed course of the drinks page -> category
    "LES FAVORIS DE SAISON": "Drinks: Cocktails", "LE CLASSIQUE FRANCAIS": "Drinks: Cocktails", "LES COCKTAILS CLASSIQUE": "Drinks: Cocktails",
    "APÉRO PÉTILLANT": "Drinks: Cocktails", "ET VOILÀ!": "Drinks: Cocktails", "LES GINS": "Drinks: Gin",
    "LES APÉRITIFS SANS ALCOOL": "Drinks: Low & no alcohol", "REFROIDISSEURS": "Drinks: Low & no alcohol",
    "LES MOCKTAILS": "Drinks: Low & no alcohol", "BIÈRE PEU ALCOOLISÉE OU SANS ALCOOL": "Drinks: Low & no alcohol",
    "LES SANS ALCOOL": "Drinks: Soft drinks & mixers", "LES TONIQUES ET SODAS": "Drinks: Soft drinks & mixers",
    "VODKA 25ml": "Drinks: Spirits & liqueurs", "RHUM 25ml": "Drinks: Spirits & liqueurs", "TEQUILA 25ml": "Drinks: Spirits & liqueurs",
    "WHISK(E)Y 25ml": "Drinks: Spirits & liqueurs", "BRANDY 25ML": "Drinks: Spirits & liqueurs", "COGNAC 25ML": "Drinks: Spirits & liqueurs",
    "CALVADOS 25ML": "Drinks: Spirits & liqueurs", "ARMAGNAC 25ML": "Drinks: Spirits & liqueurs", "PORT 50ml": "Drinks: Spirits & liqueurs",
    "SHERRY 50ml": "Drinks: Spirits & liqueurs", "LIQUEUR & VERMOUTH 25ML UNLESS STATED": "Drinks: Spirits & liqueurs",
    "BIÈRE": "Drinks: Beer & cider", "CIDRE": "Drinks: Beer & cider", "PETITES BOUCHÉES": "Bar snacks",
}
CATEGORY_ORDER = ["Nibbles", "Starters", "Steaks", "Mains", "Sides", "Desserts", "Cheese", "Sunday roasts", ADDONS,
                  "Breakfast: Small plates", "Breakfast: Mains", "Breakfast: Extras",
                  "Kids: Starters", "Kids: Mains", "Kids: Desserts", "Kids: Drinks",
                  "Drinks: Cocktails", "Drinks: Gin", "Drinks: Beer & cider", "Drinks: Low & no alcohol", "Drinks: Soft drinks & mixers",
                  "Drinks: Spirits & liqueurs", "Bar snacks"]
# courses whose drinks contain alcohol (their kcal then includes alcohol energy the three macros don't show)
ALCOHOL_COURSES = {"LES FAVORIS DE SAISON", "LE CLASSIQUE FRANCAIS", "LES COCKTAILS CLASSIQUE", "APÉRO PÉTILLANT", "ET VOILÀ!", "LES GINS",
                   "VODKA 25ml", "RHUM 25ml", "TEQUILA 25ml", "WHISK(E)Y 25ml", "BRANDY 25ML", "COGNAC 25ML", "CALVADOS 25ML",
                   "ARMAGNAC 25ML", "PORT 50ml", "SHERRY 50ml", "LIQUEUR & VERMOUTH 25ML UNLESS STATED", "BIÈRE", "CIDRE"}
NOT_ALCOHOL_PARTS = {"SANS ALCOOL"}
# typing slips in the names the pages print (names only; no number is ever touched)
NAME_FIXES = [("Grapefuit", "Grapefruit"), ("Margarita(on", "Margarita (on"),
              ("Lyre's Agave Blanco 9non-alcoholic)", "Lyre's Agave Blanco (non-alcoholic)"), (" (All Sites)", ""),
              ("EXTRAS : ", "Extras: "), ("Free range", "Free-range")]
SHARING_DISH = re.compile(r"\b(pour deux|for two|plateau)\b", re.I)

# ---------------------------------------------------------------- held back (checked on every run)
HOLD_ENERGY = 0.35      # the row's kcal and its own 4P+4C+9F differ by more than this share of the kcal
HOLD_SALT_G = 15.0      # grams of salt in one portion
HOLD_NAMES = {          # (name as printed on the page, block) -> reason: contradicted by other figures on the same page
    ("three scoops & biscuit", "SELECTION DE GLACES"):
        "46 kcal for three scoops of ice cream and a biscuit is less than half of any single flavour listed beside it (88-104 kcal each), so the figure cannot be right.",
    ("BUFFET", ""):
        "the page describes this only as 'Please ask your server for details': a self-service buffet has no defined portion, so the printed figures cannot be tied to one.",
}
HOLD_NAME_PATTERN = (re.compile(r"\bDNU\b|\(old\)", re.I),
                     "the page itself labels this entry '(old) DNU' (out of date, do not use).")


def hold_reasons(nums: dict, alcohol: bool) -> list:
    """Reasons a row's own numbers cannot all be right (the row is held back, never corrected)."""
    f = {k: float(v) for k, v in nums.items() if v != ""}
    out = []
    if f["calories"] == 0 and f["protein_g"] == 0 and f["carbs_g"] == 0 and f["fat_g"] == 0:
        out.append("every nutrient is printed as 0: a placeholder, not a measurement.")
    if f["sat_fat_g"] > f["fat_g"] + 0.05:
        out.append(f"saturates {nums['sat_fat_g']} g exceed total fat {nums['fat_g']} g.")
    if f["sugar_g"] > f["carbs_g"] + 0.05:
        out.append(f"sugars {nums['sugar_g']} g exceed carbohydrate {nums['carbs_g']} g.")
    if f["salt_g"] > HOLD_SALT_G:
        out.append(f"salt {nums['salt_g']} g in one portion is not credible.")
    est = 4 * f["protein_g"] + 4 * f["carbs_g"] + 9 * f["fat_g"]
    cal = f["calories"]
    if cal >= 50:
        gap = (est - cal) if alcohol else abs(est - cal)       # alcohol adds energy the three macros don't show
        if gap / cal > HOLD_ENERGY:
            out.append(f"the table prints {nums['calories']} kcal, but its own macros ({nums['protein_g']} g protein, {nums['carbs_g']} g carbs, "
                       f"{nums['fat_g']} g fat) add up to about {est:.0f} kcal.")
    elif est > cal + 50:
        out.append(f"the table prints {nums['calories']} kcal, but its own macros add up to about {est:.0f} kcal.")
    elif not alcohol and cal >= 20 and est == 0:
        out.append(f"the table prints {nums['calories']} kcal for a drink with no alcohol, but 0 g protein, carbohydrate and fat.")
    return out


# ---------------------------------------------------------------- names
SMALL = {"de", "du", "des", "la", "le", "les", "au", "aux", "à", "a", "et", "en", "d", "l", "sur", "ou", "pour", "avec", "sans",
         "and", "with", "of", "the", "in", "on", "or", "for", "an", "to", "n", "e"}


def fix(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    for old, new in NAME_FIXES:
        text = text.replace(old, new)
    return text


def smart_case(name: str) -> str:
    """Names the page prints in capitals ("SOUFFLÉ au FROMAGE") get title case with French small words in lower case
    ("Soufflé au Fromage"); a name that is already mixed case ("Remy Martin VSOP") is left as printed."""
    name = fix(name)
    letters = [c for c in name if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) / len(letters) < 0.6:
        return name[:1].upper() + name[1:]
    out = []
    for i, w in enumerate(name.split(" ")):
        core = re.sub(r"[^\w’']", "", w).lower()
        if "&" in w or not w.isupper() and not (w[:1].isupper() and w[1:].isupper()):
            out.append(w)                      # already mixed case ("St.", "de", "G&T"): as printed
        elif i and core in SMALL:
            out.append(w.lower())
        else:
            m = re.match(r"^([DdLl][’'])(.+)$", w)          # D’ENDIVES -> d’Endives
            if m:
                head = m.group(1).lower() if i else m.group(1).upper()
                rest = m.group(2).lower()
                out.append(head + rest[:1].upper() + rest[1:])
            else:   # CÉLERI-RAVE -> Céleri-Rave: every part of a hyphenated word starts with a capital
                out.append("-".join(re.sub(r"^([^a-zà-ÿœ]*)([a-zà-ÿœ])", lambda mm: mm.group(1) + mm.group(2).upper(), part)
                                    for part in w.lower().split("-")))
    text = " ".join(out)
    text = re.sub(r"\s+:", ":", text)
    return text[:1].upper() + text[1:]


def ascii_slug(name: str) -> str:
    """slug() for ids, with accents dropped first ('Provençale' -> 'provencale', not 'proven-ale')."""
    return slug(unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii"))


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("&", "and"))


SIZE = re.compile(r"\((\d+\s?ml(?: can)?)\)$|\b(\d+\s?ml)\b", re.I)


def serving_for(row: dict, name: str) -> str:
    m = SIZE.search(row["name"]) or SIZE.search(name)
    if m:
        return re.sub(r"\s+(?=ml)", "", m.group(1) or m.group(2)).lower()
    for part in row["path"]:     # "VODKA 25ml", "PORT 50ml", "LIQUEUR & VERMOUTH 25ML UNLESS STATED"
        m = re.search(r"\b(\d+)\s?ml\b", part, re.I)
        if m:
            return f"{m.group(1)}ml"
    return ""


# blocks whose choices read "<Block> (<choice>)": a bread, a bun, a cheese board's crackers...
CHOICE_BLOCKS = {"BAGUETTE", "TREMPETTES", "ESCARGOTS", "LE BURGER", "SELECTION DE FROMAGES", "SELECTION DE GLACES", "TOAST et CONFITURE",
                 "CAWSTON PRESS JUICES"}


def item_name(row: dict) -> str:
    nm, block, sec, path = smart_case(row["name"]), smart_case(row["block"]) if row["block"] else "", row["section"], row["path"]
    if row["kind"] == "dish":
        if path[-1:] == ["Add"]:
            return f"{nm} (porridge add-on)"
        return nm
    if sec == "Garnitures:" or sec == "choose two:":
        return f"{nm} (burger add-on)"          # the kids' burger's free toppings are the same foods as the adult add-ons
    if sec == "SAUCES":
        return f"{nm} (steak sauce)"
    if sec == "Choice of dressing":
        return nm if "dressing" in nm.lower() else f"{nm} (salad dressing)"
    if sec in ("Ice cream:", "Sorbet:"):
        return f"{sec[:-1]}: {nm}"
    if sec:
        raise SystemExit(f"unknown choice heading {sec!r} under {row['block']!r}: add a rule")
    if not block:
        return nm                               # a byo item with no block of its own (Salade mixte, Le Petit Burger)
    if row["block"] == "TWO SCOOPS OF JUDE’S ICE CREAM":
        return f"Ice cream: {nm}"
    if row["block"].upper().startswith("ŒUFS"):
        return f"{nm} (œufs)"
    if row["block"] == "Boulangerie":
        return f"{nm} ({row['block_desc']})"    # "Croissant (with butter and preserve)"
    if row["block"] in CHOICE_BLOCKS:
        printed = fix(row["name"])
        label = row["desc"] if row["desc"] and len(row["desc"]) <= 24 and "," not in row["desc"] else (smart_case(printed) if printed.isupper() else printed)
        return f"{block} ({label})"
    raise SystemExit(f"unknown block {row['block']!r}: add a rule")


def classify(row: dict, kind: str):
    """-> (category, rankable). Raises on a course it doesn't know, so a new section can't slip in unseen."""
    path = row["path"]
    course = path[0] if path else ""
    if kind == "drinks":
        if course not in DRINK_COURSE:
            raise SystemExit(f"Drinks: new section {course!r}: add it to DRINK_COURSE")
        return DRINK_COURSE[course], False
    if kind == "kids":
        if course not in KIDS_COURSE:
            raise SystemExit(f"Children: new section {course!r}: add it to KIDS_COURSE")
        if row["section"] == "choose two:":
            return ADDONS, False
        return KIDS_COURSE[course], False
    if kind == "breakfast":
        if course not in BREAKFAST_COURSE:
            raise SystemExit(f"Breakfast: new section {course!r}: add it to BREAKFAST_COURSE")
        cat, rank = BREAKFAST_COURSE[course]
        if path[-1:] == ["Add"]:
            return BREAKFAST_COURSE["SUPPLÉMENTS"][0], False
        return cat, rank
    if course not in MAIN_COURSE:
        raise SystemExit(f"new section {course!r}: add it to MAIN_COURSE")
    cat, rank = MAIN_COURSE[course]
    if row["kind"] == "choice" and row["section"] in ("Garnitures:", "SAUCES", "Choice of dressing"):
        return ADDONS, False
    if "POUR DEUX" in path or SHARING_DISH.search(row["name"]) or ta.SHARING.search(row["name"]):
        rank = False
    return cat, rank


def is_alcohol(row: dict, name: str) -> bool:
    if not row["path"] or row["path"][0] not in ALCOHOL_COURSES:
        return False
    if any(p in NOT_ALCOHOL_PARTS for p in row["path"]) or re.search(r"non-alcoholic|\b0\.0%", name, re.I):
        return False
    return True


ANIMALS = re.compile(r"\b(trout|bream|monkfish|halibut|haddock|hake|crab|scallops?|lobster|mussels?|prawns?|duck|venison|chicken|rabbit|"
                     r"snails?|boeuf|poulet|lapin|porc|volaille|flétan|truite|cabillaud|saumon)\b", re.I)


def tags_for(row: dict) -> tuple:
    """(tags, meat type not stated). vegetarian only from the pop-up's own 'Suitable for'; pork/beef from the dish's printed name
    or description (a choice inside a dish also counts the dish's name; an add-on does not)."""
    suitable = {s.lower() for s in row["suitable"]}
    if "vegetarian" in suitable or "vegan" in suitable:
        return "vegetarian", False
    parts = [fix(row["name"]), row["desc"]]
    if not row["section"]:
        parts += [row["block"], row["block_desc"]]
    text = " ".join(parts)
    tags = []
    if ta._PORK.search(text) or re.search(r"\b(porc|poitrine|longe|charcuterie|saucisse|jambon)\b", text, re.I):
        tags.append("contains_pork")
    if ta._BEEF.search(text) or re.search(r"\b(boeuf|bœuf)\b", text, re.I):
        tags.append("contains_beef")
    meaty = bool(ta._MEATY.search(text) or re.search(r"charcuterie|scotch egg", text, re.I))
    unstated = meaty and not ta._ANIMAL.search(text) and not ANIMALS.search(text) and not tags
    return "|".join(tags), unstated


# ---------------------------------------------------------------- reading
def sig(r: dict) -> tuple:
    return (tuple(r["path"]), r["block"], r["section"], r["name"], tuple(r["nutrients"].items()), repr(r["contains"]), repr(r["may"]),
            tuple(r["suitable"]))


def read_one(pages_dir: Path, fname: str, code: str, expected: int) -> tuple:
    text = (pages_dir / fname).read_text(encoding="utf-8")
    got = hp.read_menu(text)
    if len(got) != expected:
        raise SystemExit(f"{fname} ({code}) has {len(got)} pop-ups but this script expects {expected}: the menu changed, re-check the rules.")
    if hp.menu_tabs(text):
        raise SystemExit(f"{fname}: the page now has a tab bar {hp.menu_tabs(text)}: the layout changed")
    # the embedded schema.org menu must agree with the pop-ups (names and calories); a zero is an empty field there
    html_side = Counter((r["name"], r["nutrients"]["Energy (kCal)"]) for r in got)
    ld_side = Counter((n, c.replace(",", "") or "0") for _, n, c in hp.json_ld_items(text))
    expected_diff = (Counter(), LD_ONLY.get(code, Counter()))
    if (html_side - ld_side, ld_side - html_side) != expected_diff:
        raise SystemExit(f"{fname}: pop-ups and the embedded menu disagree: {(html_side - ld_side, ld_side - html_side)}")
    for r in got:
        if r["caption"] != CAPTION:
            raise SystemExit(f"{code} > {r['name']}: table is headed {r['caption']!r}, not {CAPTION!r}")
        if list(r["nutrients"]) != list(LABELS):
            raise SystemExit(f"{code} > {r['name']}: nutrient rows are {list(r['nutrients'])}, expected {list(LABELS)}")
        if r["shown_kcal"].replace(",", "") != f"{r['nutrients']['Energy (kCal)']} kcal":
            raise SystemExit(f"{code} > {r['name']}: the dish line shows {r['shown_kcal']!r} but the pop-up says {r['nutrients']['Energy (kCal)']}")
    return got, sha256_file(pages_dir / fname)


def read_pages(pages_dir: Path) -> tuple:
    rows, report, hashes, main_rows = [], [], [], {}
    for fname, code, label, kind, expected in MENUS:
        got, digest = read_one(pages_dir, fname, code, expected)
        main_rows[fname] = got
        hashes.append((fname, digest))
        for r in got:
            r["menu"], r["kind_of_menu"] = label, kind
            rows.append(r)
    for fname, code, main, expected, sites in VARIANTS:
        got, digest = read_one(pages_dir, fname, code, expected)
        hashes.append((fname, digest))
        a, b = [sig(r) for r in main_rows[main]], [sig(r) for r in got]
        if a != b:
            raise SystemExit(f"{fname} ({sites}) no longer prints the same dishes, numbers and allergens as {main}: decide how to treat the site variant")
        report.append(f"{fname} ({sites}) is identical to {main}")
    return rows, report, hashes


def build(pages_dir: Path) -> tuple:
    rows, report, hashes = read_pages(pages_dir)
    items, seen = [], {}
    stats = Counter()
    for r in rows:
        name = item_name(r)
        alcohol = is_alcohol(r, name)
        if r["path"] and r["path"][0] == "LES APÉRITIFS SANS ALCOOL" and "non-alcoholic" not in name.lower():
            name += " (non-alcoholic)"          # "Mojito" exists as a cocktail and as a Lyre's version
        nums = {col: r["nutrients"][lab] for lab, col in LABELS.items()}
        for col, v in nums.items():
            if not re.match(r"^\d+(\.\d+)?$", v):
                raise SystemExit(f"{r['menu']} > {name}: {col} is {v!r}, not a plain number: decide how to read it")
        allergens = tk.allergens_checked(r, f"{r['menu']} > {name}")
        if allergens is None:
            raise SystemExit(f"{r['menu']} > {name}: no allergen information to read")
        category, rankable = classify(r, r["kind_of_menu"])
        key = (norm(name), tuple(nums.values()))
        if key in seen:
            first = seen[key]
            if first["allergens"] != allergens:
                raise SystemExit(f"{name!r} is printed twice with the same numbers but different allergens ({first['menu']} / {r['menu']})")
            if first["category"] != category and not (first["category"] == ADDONS or category == ADDONS):
                report.append(f"{name}: on {first['menu']} as {first['category']} and on {r['menu']} as {category}: kept in the first")
            if r["menu"] not in first["_also"] and r["menu"] != first["menu"]:
                first["_also"].append(r["menu"])
            stats["duplicates dropped"] += 1
            continue
        tags, unstated = tags_for(r)
        item = {"name": name, "category": category, "serving": serving_for(r, name), **nums, "tags": tags, "rankable": rankable,
                "allergens": allergens, "menu": r["menu"], "_also": [], "_row": r, "_alcohol": alcohol, "_unstated": unstated}
        seen[key] = item
        items.append(item)
    holds, ids = [], {}
    for it in items:       # rows whose own numbers cannot be right are held back first, so a placeholder twin never needs a naming rule
        r = it["_row"]
        reasons = hold_reasons({c: it[c] for c in LABELS.values()}, it["_alcohol"])
        special = HOLD_NAMES.get((r["name"], r["block"]))
        if special:
            reasons.append(special)
        if HOLD_NAME_PATTERN[0].search(r["name"]):
            reasons.append(HOLD_NAME_PATTERN[1])
        if reasons:
            it["_held"] = True
            it["_reasons"] = " ".join(reasons)
    # same name, different numbers (both published): say which dish is meant by its course
    by_name = {}
    for it in items:
        if not it.get("_held"):
            by_name.setdefault(norm(it["name"]), []).append(it)
    suffix = {"Starters": "starter", "Sides": "side", "Mains": "main", "Desserts": "dessert"}
    for group in by_name.values():
        if len(group) > 1:
            for g in group:
                if g["category"] not in suffix:
                    raise SystemExit(f"two different rows share the name {g['name']!r} ({[x['menu'] for x in group]}): add a naming rule")
                g["name"] = f"{g['name']} ({suffix[g['category']]})"
    live = {}
    for it in items:       # whatever is still shared is a mistake in the rules above
        if not it.get("_held"):
            live.setdefault(norm(it["name"]), []).append(it)
    for group in live.values():
        if len(group) > 1:
            raise SystemExit(f"two different published rows share the name {group[0]['name']!r} ({[g['menu'] for g in group]}): add a naming rule")
    for it in sorted(items, key=lambda x: bool(x.get("_held"))):     # published rows take the plain id, a held twin gets the suffix
        base = ascii_slug(it["name"])
        n = ids.get(base, 0)
        ids[base] = n + 1
        it["id"] = base if n == 0 else f"{base}-{n + 1}"
    holds = [(it["id"], it["_reasons"]) for it in items if it.get("_held")]
    for it in items:
        r = it["_row"]
        bits = [f"Source: {it['menu']} > {' > '.join(r['path'])}" + (f" > {r['block']}" if r["block"] else "")]
        if it["_also"]:
            bits.append("also on " + ", ".join(sorted(set(it["_also"]))))
        if it["_alcohol"]:
            bits.append("energy includes alcohol")
        it["notes"] = "; ".join(bits)
    order = {c: i for i, c in enumerate(CATEGORY_ORDER)}
    for it in items:
        if it["category"] not in order:
            raise SystemExit(f"category {it['category']!r} is not in CATEGORY_ORDER")
    items.sort(key=lambda it: order[it["category"]])
    return items, holds, report, hashes, stats


def fetch_all(pages_dir: Path) -> None:
    for fname, code, *_ in [(m[0], m[1]) for m in MENUS] + [(v[0], v[1]) for v in VARIANTS]:
        dest = pages_dir / fname
        for attempt in range(4):        # a dropped connection is not a refusal; 403/404/robots would raise at once
            try:
                tk.fetch(BASE + code, dest)
                break
            except subprocess.CalledProcessError as e:
                if attempt == 3 or e.returncode not in (35, 52, 55, 56):
                    raise
                time.sleep(4)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=Path, required=True)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the pages")
    ap.add_argument("--fetch", action="store_true", help="download the pages into --pages first")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    if args.fetch:
        args.pages.mkdir(parents=True, exist_ok=True)
        fetch_all(args.pages)
    items, holds, report, hashes, stats = build(args.pages)
    public = [{k: v for k, v in it.items() if not k.startswith("_") and k != "menu"} for it in items]
    args.out.mkdir(parents=True, exist_ok=True)
    if not holds:
        (Path(args.out) / "holdback.csv").unlink(missing_ok=True)
    out = write_chain_folder(chain_id=CHAIN_ID, name="Brasserie Blanc", cuisine="French", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
                             checked_on=args.checked_on, aliases=ALIASES, items=public, out=args.out, note=NOTE, holdback=holds,
                             allergen_guide={"title": ALLERGEN_TITLE, "url": SOURCE_URL, "checked_on": args.checked_on,
                                             "may_contain_published": True})
    print(f"wrote {len(items)} items to {out} ({len(holds)} held back); {dict(stats)}")
    print("by category:", dict(Counter(i["category"] for i in items)))
    for fname, digest in hashes:
        print(f"{fname} sha256 {digest}")
    print("meat type not stated:", sum(1 for i in items if i["_unstated"] and not i.get("_held")),
          [i["name"] for i in items if i["_unstated"] and not i.get("_held")])
    for line in report:
        print("note:", line)
    if args.report:
        print("-- held back:")
        for hid, why in holds:
            print("  ", hid, "::", why)
    return 0


if __name__ == "__main__":
    sys.exit(main())
