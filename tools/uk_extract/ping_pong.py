#!/usr/bin/env python3
"""Build data/source/ping-pong/ from Ping Pong's own nutrition PDF ("Jun Full Menu 2025 - Nutr Info", printed 09/06/2025).

    python3 tools/uk_extract/ping_pong.py path/to/Nutr-Info-Jun-2025.pdf --checked-on 2026-10-06

The file is one A3 page (a spreadsheet printed to PDF, with a text layer) linked from https://www.pingpongdimsum.com/menus/.
Each row prints every nutrient twice: per portion and per 100 g. ONLY THE PER-PORTION COLUMNS ARE PUBLISHED (kcal, fat,
saturates, carbohydrate, sugars, fibre, protein, salt), copied exactly as printed; the per-100 g columns are read only to
spot rows that contradict themselves. Nothing is converted or corrected. Only the names, grouping and tags below are typed.

Every row is matched on its printed code and name, so if Ping Pong adds, removes, renames or reorders a dish, or a new
section or an unexplained impossible number appears, the run stops and a human re-checks ROWS / HELD / ACCEPTED.
Needs `pdftotext` (poppler). Output files: items.csv, chain.csv, holdback.csv, note.txt, allergens.csv, allergen_guide.csv (and the
empty optional CSVs).

Allergens (docs/DATA.md "Allergens", all or nothing): the chain's own "Allergen Matrix / Free From Menus" PDF
    https://www.pingpongdimsum.com/wp-content/uploads/2025/06/Ping_Pong_Allergen_Matrix_Free_From_Menus_100625.pdf
(linked as "Allergen Matrix" from https://www.pingpongdimsum.com/menus/; robots.txt there allows everything, Crawl-delay 10 was honoured)
is read by ping_pong_matrix.py: one row per dish, a printed "x" under each of the 14 allergens (columns 4-17); the 16 "additional
allergens & ingredient" columns (Onion, Garlic, Gluten, Seafood, Shellfish, Wheat, MSG ...) are not among the 14 and are not published.
The matrix's "Cereals" column is the cereals-containing-gluten allergen and is published as gluten, with no cereal named (the matrix
names none; its Wheat column is an ingredient flag, not a statement that wheat is the only cereal). The matrix has NO per-dish "may
contain": only the blanket sentence "all our dishes and drinks may contain traces of nuts, nut oils or egg" (and a fryer cross-contact
warning), so may_contain_published is "no" and the app says the guide does not say what may be present in traces.

Tying a nutrition row to a matrix row (ALLERGEN_ROW; the matrix prints no codes itself, but the same file's 21 "Made without ..."
pages print the chain's dish code beside each matrix row, in the same order): a published item takes a matrix row only if
  (code) the nutrition guide's code is the code printed beside that matrix row (the names differ only by spelling, "4x", "(al)", a
         qualifier such as "(w. sesame dip)", or a short/long form; each pair is listed in ALLERGEN_ROW), or
  (name) the printed names are identical once diet/halal/alcohol marks, quantities and bracketed qualifiers are removed (the
         nutrition guide's code is missing or differs from the matrix's: apple gyoza 227 / 277, earl grey macaron 390 / 388).
An item that fails both is held back (ALLERGEN_HELD, listed in holdback.csv with the reason), never guessed. The matrix is read three ways
that agree: the printed x positions; the chain's own "Made without X" pages (a dish is named there exactly when the matrix has no x:
1,155 cells over 21 columns); and a rendered-page comparison done by eye (data/audit/verified/ping-pong-allergens.json).
Run: python3 tools/uk_extract/ping_pong.py NUTR.pdf --matrix ALLERGEN_MATRIX.pdf --checked-on 2026-10-08
"""
from __future__ import annotations
import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ping_pong_matrix as matrix_reader  # noqa: E402
from common import ROOT, allergen_words, slug, write_allergens, write_chain_folder  # noqa: E402

CHAIN_ID = "ping-pong"
SOURCE_URL = "https://www.pingpongdimsum.com/wp-content/uploads/2025/06/Nutr-Info-Jun-2025.pdf"
TITLE_LINE = "Jun Full Menu 2025 - Nutr Info"
PRINTED_ON = "09/06/2025"
SOURCE_TITLE = ('Ping Pong Nutritional Information, "Jun Full Menu 2025 - Nutr Info" (guide dated June 2025, printed '
                '09/06/2025)')
NOTE = ("Guide dated June 2025, so some dishes may have changed since. Per portion as printed, no drinks; dishes with impossible "
        "numbers or no allergen row are left out. Allergens are from Ping Pong's June 2025 matrix: its Cereals mark shows as gluten, "
        "even on dishes it labels gluten-free (wheat starch), and it says any dish may contain traces of nuts or egg.")
MATRIX_URL = "https://www.pingpongdimsum.com/wp-content/uploads/2025/06/Ping_Pong_Allergen_Matrix_Free_From_Menus_100625.pdf"
ALLERGEN_GUIDE_TITLE = ('Ping Pong Allergen Matrix, "Summer 2025 Allergen List" (Allergen Info Free from MATRIX - 2025 06, '
                        'last updated 08/06/2025)')
# the matrix's printed column headers for the 14 allergens, by printed column number (read by allergen_words, which stops on an unknown word)
ALLERGEN_HEADER = {4: "Celery", 5: "Cereals", 6: "Crustacean", 7: "Eggs", 8: "Fish", 9: "Lupin", 10: "Milk", 11: "Molluscs",
                   12: "Mustard", 13: "Nuts", 14: "Peanuts", 15: "Sesame", 16: "Soya", 17: "Sulphur dioxide"}

# printed section heading -> category shown
SECTIONS = {
    "KIDS MENUS": "Kids menus", "NIBBLES": "Nibbles", "RICE": "Rice", "SHARING / BAOS": "Sharing & baos",
    "CRISPY": "Crispy", "BUNS": "Buns", "STEAMED DUMPLINGS": "Steamed dumplings",
    "GRIDDLED GYOZA & DUMPLING": "Griddled gyoza & dumplings", "DESSERTS": "Desserts",
}
V, P, BF = "vegetarian", "contains_pork", "contains_beef"

# One entry per printed row, in the PDF's order:
# (printed code, printed name, name shown, section, serving, rankable, limited_time, tags, note)
# Tags: V only where the printed name carries "v" / "vg" (or says "vegetarian"); P / BF only where the name says pork / beef.
# The page has no legend, so "v" / "vg" are read as vegetarian / vegan. Printed codes are the chain's own.
ROWS = [
    ("360", "little pandas crispy chicken rice bowl", "Little Pandas Crispy Chicken Rice Bowl", "KIDS MENUS", "", True, False, "", ""),
    ("361", "little pandas crispy tofu rice bowl vg", "Little Pandas Crispy Tofu Rice Bowl", "KIDS MENUS", "", True, False, V, ""),
    ("429", "little pandas dim sum set menu", "Little Pandas Dim Sum Set Menu", "KIDS MENUS", "", True, False, "",
     "Meat type not stated: the set's contents are not listed"),
    ("432", "little pands vegetarian set menu", "Little Pandas Vegetarian Set Menu", "KIDS MENUS", "", True, False, V,
     "Printed 'pands'; vegetarian because the printed name says so (no v mark)"),
    ("224", "prawn crackers gf", "Prawn Crackers", "NIBBLES", "", True, False, "", ""),
    ("264", "edamame with celery sea salt vg gf", "Edamame with Celery Sea Salt", "NIBBLES", "", True, False, V, ""),
    ("83", "seaweed salad vg", "Seaweed Salad", "NIBBLES", "", True, False, V, ""),
    ("287", "long stem broccoli vg", "Long Stem Broccoli", "NIBBLES", "", True, False, V,
     "Portion and per-100 g columns are identical (a 100 g portion)"),
    ("356", "chicken katsu curry rice", "Chicken Katsu Curry Rice", "RICE", "", True, False, "", ""),
    ("38", "vegetable sticky rice vg gf", "Vegetable Sticky Rice", "RICE", "", True, False, V, "HELD BACK, see holdback.csv"),
    ("69", "honey chicken rice pot", "Honey Chicken Rice Pot", "RICE", "", True, False, "", "HELD BACK, see holdback.csv"),
    ("2", "steamed jasmine rice vg gf", "Steamed Jasmine Rice", "RICE", "", True, False, V,
     "Fibre printed n/a, so left blank"),
    ("160", "sweet and sour chicken", "Sweet and Sour Chicken", "SHARING / BAOS", "", True, False, "", ""),
    ("161", "sweet and sour aubergine vg", "Sweet and Sour Aubergine", "SHARING / BAOS", "", True, False, V, ""),
    ("243", "chilli prawn bao", "Chilli Prawn Bao", "SHARING / BAOS", "", True, False, "", ""),
    ("321", "crispy duck bao", "Crispy Duck Bao", "SHARING / BAOS", "", True, False, "", "HELD BACK, see holdback.csv"),
    ("420", "crispy chicken katsu curry bao", "Crispy Chicken Katsu Curry Bao", "SHARING / BAOS", "", True, False, "", ""),
    ("322", "cripsy aubergine bao", "Crispy Aubergine Bao", "SHARING / BAOS", "", True, False, "", "Printed 'cripsy'"),
    ("200", "lucky 8 har gau", "Lucky 8 Har Gau", "SHARING / BAOS", "", True, False, "", ""),
    ("382", "satay prawn gf (dim summer specials)", "Satay Prawn", "CRISPY", "", True, True, "",
     "Labelled 'dim summer specials', so shown as limited time"),
    ("288", "honey-soy chicken skewer gf (dim summer specials)", "Honey-Soy Chicken Skewer", "CRISPY", "", True, True, "",
     "Labelled 'dim summer specials', so shown as limited time"),
    ("198", "king crab surimi hot dog skwers (dim summer specials)", "King Crab Surimi Hot Dog Skewers", "CRISPY", "", True, True, "",
     "Printed 'skwers'; labelled 'dim summer specials', so shown as limited time"),
    ("188", "ping pong fried chicken", "Ping Pong Fried Chicken", "CRISPY", "", True, False, "", ""),
    ("74", "sichuan crispy aubergine vg", "Sichuan Crispy Aubergine", "CRISPY", "", True, False, V, ""),
    ("32", "prawn toast", "Prawn Toast", "CRISPY", "", True, False, "", "HELD BACK, see holdback.csv"),
    ("363", "crispy tofu vg", "Crispy Tofu", "CRISPY", "", True, False, V, ""),
    ("28", "vegetable spring roll vg", "Vegetable Spring Roll", "CRISPY", "", True, False, V, ""),
    ("26", "duck spring roll", "Duck Spring Roll", "CRISPY", "", True, False, "", ""),
    ("23", "char sui bun", "Char Sui Bun", "BUNS", "", True, False, "", "Meat type not stated (the name does not say pork)"),
    ("179", "vegetable bun vg", "Vegetable Bun", "BUNS", "", True, False, V, ""),
    ("354", "shanghai chilli spinach mushroom wonton vg", "Shanghai Chilli Spinach Mushroom Wonton", "STEAMED DUMPLINGS", "", True, False, V, ""),
    ("132", "black prawn dumpling gf", "Black Prawn Dumpling", "STEAMED DUMPLINGS", "", True, False, "",
     "HELD BACK, see holdback.csv"),
    ("6", "prawn and chive dumpling gf", "Prawn and Chive Dumpling", "STEAMED DUMPLINGS", "", True, False, "", "HELD BACK, see holdback.csv"),
    ("11", "pork prawn shu mai", "Pork Prawn Shu Mai", "STEAMED DUMPLINGS", "", True, False, P, ""),
    ("7", "har gau gf", "Har Gau", "STEAMED DUMPLINGS", "", True, False, "", ""),
    ("999", "flaming phoenix – chicken dumpling", "Flaming Phoenix - Chicken Dumpling", "STEAMED DUMPLINGS", "", True, False, "",
     "The guide's code for this row is 999"),
    ("19", "spicy chicken chinese veg dumpling gf", "Spicy Chicken Chinese Veg Dumpling", "STEAMED DUMPLINGS", "", True, False, "",
     "4P+4C+9F comes to 16% more than the printed calories, and by the same amount in the per-100 g columns, so it is not a typo in one cell; published as printed"),
    ("17", "spicy chinese vegetable dumpling vg gf", "Spicy Chinese Vegetable Dumpling", "STEAMED DUMPLINGS", "", True, False, V,
     "4P+4C+9F comes to 16% more than the printed calories, and by the same amount in the per-100 g columns, so it is not a typo in one cell; published as printed"),
    ("146", "mushroom & leek dumpling vg gf", "Mushroom & Leek Dumpling", "STEAMED DUMPLINGS", "", True, False, V, ""),
    ("225", "spinach and mushroom griddled dumpling vg", "Spinach and Mushroom Griddled Dumpling", "GRIDDLED GYOZA & DUMPLING", "", True, False, V, ""),
    ("124", "griddled spicy beef gyoza", "Griddled Spicy Beef Gyoza", "GRIDDLED GYOZA & DUMPLING", "", True, False, BF, ""),
    ("280", "chicken & chinese chive gyoza", "Chicken & Chinese Chive Gyoza", "GRIDDLED GYOZA & DUMPLING", "", True, False, "",
     "HELD BACK, see holdback.csv"),
    ("281", "edamame & vegetable gyoza", "Edamame & Vegetable Gyoza", "GRIDDLED GYOZA & DUMPLING", "", True, False, "",
     "Portion and per-100 g columns are identical (a 100 g portion)"),
    ("227", "apple gyoza v (6pcs) (dim summer specials)", "Apple Gyoza (6 pieces)", "DESSERTS", "6 pieces", False, True, V,
     "Labelled 'dim summer specials', so shown as limited time"),
    ("307", "matcha layered crepe cake v", "Matcha Layered Crepe Cake", "DESSERTS", "", False, False, V, ""),
    ("390", "earl grey macaron (1pc)", "Earl Grey Macaron (1 piece)", "DESSERTS", "1 piece", False, False, "", ""),
    ("", "yuzu macaron (1pc)", "Yuzu Macaron (1 piece)", "DESSERTS", "1 piece", False, False, "", "This row has no code in the guide"),
    # The guide's row 53 "ice cream / sorbet v gf" has no numbers; the six flavours below it have no code. The v mark is the heading's.
    ("", "vanilla", "Ice Cream / Sorbet: Vanilla", "DESSERTS", "", False, False, V, "Flavour row under 53 'ice cream / sorbet v gf'"),
    ("", "chocolate", "Ice Cream / Sorbet: Chocolate", "DESSERTS", "", False, False, V, "Flavour row under 53 'ice cream / sorbet v gf'"),
    ("", "lemon sorbet", "Ice Cream / Sorbet: Lemon Sorbet", "DESSERTS", "", False, False, V, "Flavour row under 53 'ice cream / sorbet v gf'"),
    ("", "black coconut", "Ice Cream / Sorbet: Black Coconut", "DESSERTS", "", False, False, V, "HELD BACK, see holdback.csv"),
    ("", "pear", "Ice Cream / Sorbet: Pear", "DESSERTS", "", False, False, V, "Flavour row under 53 'ice cream / sorbet v gf'"),
    ("", "mango sorbet", "Ice Cream / Sorbet: Mango Sorbet", "DESSERTS", "", False, False, V, "Flavour row under 53 'ice cream / sorbet v gf'"),
]

NUM = re.compile(r"^(?:\d+(?:\.\d+)?|n/a)$")
# printed order of the 16 numbers: (portion, per 100 g) for each of these
COLUMNS = ["kcal", "fat", "sat", "carbs", "sugars", "fibre", "protein", "salt"]


def read_rows(pdf: Path) -> list[dict]:
    """Rows of the table as {section, code, name, p: {col: printed string}, h: {col: printed string}} (h = per 100 g)."""
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    if TITLE_LINE not in text or f"Printed on {PRINTED_ON}" not in text:
        raise SystemExit(f"The PDF no longer says '{TITLE_LINE}' / 'Printed on {PRINTED_ON}': it is a different edition of "
                         "the guide. Re-check ROWS, HELD, SOURCE_TITLE and NOTE against it before running again.")
    if not re.search(r"^\s*53\s+ice cream / sorbet v gf\s*$", text, re.M):
        raise SystemExit("The 'ice cream / sorbet v gf' heading row (code 53) is missing: the layout changed.")
    rows, section = [], None
    for line in text.splitlines():
        toks = line.split()
        tail: list[str] = []
        while toks and NUM.match(toks[-1]) and len(tail) < 16:
            tail.insert(0, toks.pop())
        if len(tail) == 16:
            code = toks[0] if toks and toks[0].isdigit() else ""
            name = " ".join(toks[1:] if code else toks)
            rows.append({"section": section, "code": code, "name": name,
                         "p": dict(zip(COLUMNS, tail[0::2])), "h": dict(zip(COLUMNS, tail[1::2]))})
        elif toks and not tail and line.strip().isupper():
            section = line.strip()
            if section not in SECTIONS:
                raise SystemExit(f"New section {section!r} in the PDF: add it to SECTIONS.")
    return rows


def num(cells: dict, key: str) -> float | None:
    return None if cells[key] == "n/a" else float(cells[key])


def energy_gap(cells: dict) -> float:
    """|kcal - (4P + 4C + 9F)| / kcal, the pipeline's own check (it warns above 15%)."""
    kcal = num(cells, "kcal")
    est = 4 * num(cells, "protein") + 4 * num(cells, "carbs") + 9 * num(cells, "fat")
    return abs(kcal - est) / kcal


def impossible(cells: dict) -> list[str]:
    out = []
    if num(cells, "sat") > num(cells, "fat"):
        out.append("saturates above total fat")
    if num(cells, "sugars") > num(cells, "carbs"):
        out.append("sugars above carbohydrate")
    if num(cells, "kcal") >= 50 and energy_gap(cells) > 0.15:
        out.append("calories more than 15% away from 4P+4C+9F")
    return out


# Rows left out of the menu (never corrected). id -> (reason, guard); the guard must still be true of the printed row,
# otherwise the guide has changed and the run stops so a human can look again.
HELD = {
    "crispy-duck-bao": (
        "The guide prints saturates 116 g against 66.3 g total fat and sugars 52 g against 35.1 g carbohydrate (sugars are "
        "part of carbohydrate); its 1,169.6 kcal is far above what its own macros add up to (about 744 kcal).",
        lambda r: num(r["p"], "sat") > num(r["p"], "fat")),
    "prawn-and-chive-dumpling": (
        "The guide prints saturates 15.3 g against 5.1 g total fat and sugars 5.3 g against 1.5 g carbohydrate (sugars are "
        "part of carbohydrate); its 128.8 kcal is far above what its own macros add up to (about 72 kcal).",
        lambda r: num(r["p"], "sat") > num(r["p"], "fat")),
    "prawn-toast": (
        "The guide prints sugars 19.4 g against 0.9 g carbohydrate (sugars are part of carbohydrate), and 220.2 kcal where "
        "its own macros (0.3 g protein, 0.9 g carbohydrate, 5.8 g fat) add up to about 57 kcal.",
        lambda r: num(r["p"], "sugars") > num(r["p"], "carbs")),
    "vegetable-sticky-rice": (
        "The guide prints 154.6 kcal; its own macros (0.9 g protein, 8.8 g carbohydrate, 4.3 g fat) add up to about 78 kcal.",
        lambda r: energy_gap(r["p"]) > 0.3),
    "honey-chicken-rice-pot": (
        "The guide prints 329.5 kcal; its own macros (16.7 g protein, 61.4 g carbohydrate, 9.8 g fat) add up to about 401 kcal.",
        lambda r: energy_gap(r["p"]) > 0.15),
    "black-prawn-dumpling": (
        "The guide prints protein 7 g per portion but 6.3 g per 100 g, while its other columns show a portion of about 90 g "
        "(132 kcal against 147 kcal per 100 g, fat 3.15 g against 3.5 g), which would be about 5.7 g protein.",
        lambda r: r["p"]["protein"] == "7" and r["h"]["protein"] == "6.3"),
    "chicken-and-chinese-chive-gyoza": (
        "The guide prints saturates 0.134 g per portion but 0.314 g per 100 g, although every other column is identical "
        "per portion and per 100 g (a 100 g portion).",
        lambda r: r["p"]["sat"] == "0.134" and r["h"]["sat"] == "0.314"),
    "ice-cream-sorbet-black-coconut": (
        "The guide prints the same protein (3.5 g) per portion and per 100 g, while its other columns show a portion of "
        "about 60 g (87 kcal against 145 kcal per 100 g, fat 4.68 g against 7.8 g).",
        lambda r: r["p"]["protein"] == r["h"]["protein"] and r["p"]["kcal"] != r["h"]["kcal"]),
}
# Rows that trip the pipeline's energy warning but are consistent with themselves, so they are published as printed.
ACCEPTED = {"spicy-chicken-chinese-veg-dumpling", "spicy-chinese-vegetable-dumpling"}

# ------------------------------------------------------------------------------------------------ allergens
# item id -> (printed name of the matrix row, tie, remark). tie "code": the nutrition guide's code is the code the "Made without ..."
# pages print beside that matrix row; tie "name": identical names once marks, quantities and bracketed qualifiers are removed.
# The remark says how the two printed names differ. A matrix row is used by at most one item.
ALLERGEN_ROW = {
    "little-pandas-crispy-chicken-rice-bowl": ("Little pandas chicken katsu rice bowl", "code", "'crispy chicken' vs 'chicken katsu'; same code 360"),
    "little-pandas-crispy-tofu-rice-bowl": ("Little pandas crispy tofu rice bowl vg", "code", ""),
    "prawn-crackers": ("prawn crackers gf", "code", ""),
    "edamame-with-celery-sea-salt": ("edamame with celery sea salt vg gf", "code", ""),
    "seaweed-salad": ("seaweed salad vg gf", "code", "matrix adds gf"),
    "long-stem-broccoli": ("long stem broccoli vg (al) (w. sesame dip)", "code", "matrix adds '(al)' and '(w. sesame dip)' (a qualifier)"),
    "chicken-katsu-curry-rice": ("chicken katsu curry rice bowl (H)", "code", "matrix adds 'bowl'"),
    "steamed-jasmine-rice": ("steamed jasmine rice vg gf", "code", ""),
    "sweet-and-sour-chicken": ("sweet & sour chicken (H)", "code", ""),
    "sweet-and-sour-aubergine": ("sweet & sour aubergine vg", "code", ""),
    "chilli-prawn-bao": ("4x chilli prawn bao", "code", "matrix says 4x"),
    "crispy-chicken-katsu-curry-bao": ("4x crispy chicken katsu curry bao (H)", "code", "matrix says 4x"),
    "crispy-aubergine-bao": ("4x crispy aubergine bao vg", "code", "nutrition prints 'cripsy'; matrix says 4x"),
    "lucky-8-har-gau": ("lucky 8 har gau gf (8 pcs)", "code", ""),
    "satay-prawn": ("satay prawn skewer gf", "code", "matrix adds 'skewer'"),
    "honey-soy-chicken-skewer": ("soy marinated chicken skewer gf (H)", "code", "'honey-soy' vs 'soy marinated'; same code 288"),
    "king-crab-surimi-hot-dog-skewers": ("king crab surimi hot dog skewers", "code", "nutrition prints 'skwers'"),
    "ping-pong-fried-chicken": ("ping pong fried chicken (H) (chilli)", "code", ""),
    "sichuan-crispy-aubergine": ("sichuan crispy aubergine vg", "code", ""),
    "crispy-tofu": ("crispy tofu vg", "code", ""),
    "vegetable-spring-roll": ("vegetable spring roll vg", "code", ""),
    "duck-spring-roll": ("crispy duck spring roll", "code", "matrix adds 'crispy'"),
    "char-sui-bun": ("char sui bun (al)", "code", ""),
    "vegetable-bun": ("vegetable bun vg (al)", "code", ""),
    "shanghai-chilli-spinach-mushroom-wonton": ("shanghai chilli wontons vg", "code", "nutrition names the filling; matrix is the short form"),
    "pork-prawn-shu-mai": ("pork & prawn siu mai", "code", "'shu mai' vs 'siu mai'"),
    "har-gau": ("har gau gf", "code", ""),
    "flaming-phoenix-chicken-dumpling": ("flaming phoenix dumpling (chicken) gf V.Hot (H)", "code", "word order; same code 999"),
    "spicy-chicken-chinese-veg-dumpling": ("spicy chicken dumpling gf (H)", "code", "nutrition adds 'chinese veg'; same code 19"),
    "spicy-chinese-vegetable-dumpling": ("spicy vegetable dumpling vg gf (al)", "code", "nutrition adds 'chinese'; same code 17"),
    "mushroom-and-leek-dumpling": ("mushroom & leek dumpling vg, gf", "code", ""),
    "spinach-and-mushroom-griddled-dumpling": ("spinach & mushroom griddled dumpling vg", "code", ""),
    "griddled-spicy-beef-gyoza": ("griddled beef dumpling (chilli) (H)", "code", "'spicy ... gyoza' vs '... dumpling (chilli)'; same code 124"),
    "edamame-and-vegetable-gyoza": ("edamame & vegetable gyoza (5pcs) vg, al", "code", ""),
    "apple-gyoza-6-pieces": ("apple gyoza (w cinnamon & honney) 6pcs v", "name", "same name and 6 pieces; the matrix adds a bracketed qualifier; the codes differ (227 / 277)"),
    "matcha-layered-crepe-cake": ("matcha layered crepe cake v", "code", ""),
    "earl-grey-macaron-1-piece": ("earl grey macaron v gf", "name", "same name; the codes differ (390 / 388)"),
    "yuzu-macaron-1-piece": ("yuzu macaron gf", "name", "same name; the nutrition row has no code"),
    "ice-cream-sorbet-mango-sorbet": ("mango sorbet vg gf", "name", "same name; the nutrition row has no code"),
}
# Items with no allergen row they may take (held back, never guessed): id -> (reason, guard that must still be true of the matrix).
ALLERGEN_HELD = {
    "little-pandas-dim-sum-set-menu": (
        "Ping Pong's allergen matrix has no row for this set menu (it lists only 'chicken katsu curry (bento)', 'crispy tofu gyoza vg' and "
        "two Little Pandas rice bowls as set-menu items), so its allergens are not published.",
        lambda names: not any("set menu" in n or "dim sum" in n for n in names)),
    "little-pandas-vegetarian-set-menu": (
        "Ping Pong's allergen matrix has no row for this set menu (it lists only 'chicken katsu curry (bento)', 'crispy tofu gyoza vg' and "
        "two Little Pandas rice bowls as set-menu items), so its allergens are not published.",
        lambda names: not any("set menu" in n or "vegetarian" in n for n in names)),
    "ice-cream-sorbet-vanilla": (
        "The allergen matrix prints 'vanilla ice cream v gf', the nutrition guide prints 'vanilla' under 'ice cream / sorbet' with no "
        "code, so the two names are not identical and the dish is not tied to a row by guesswork.",
        lambda names: "vanilla ice cream v gf" in names),
    "ice-cream-sorbet-chocolate": (
        "The allergen matrix prints 'chocolate ice cream v gf', the nutrition guide prints 'chocolate' under 'ice cream / sorbet' with no "
        "code, so the two names are not identical and the dish is not tied to a row by guesswork.",
        lambda names: "chocolate ice cream v gf" in names),
    "ice-cream-sorbet-pear": (
        "The allergen matrix prints 'pear sorbet vg gf', the nutrition guide prints 'pear' under 'ice cream / sorbet' with no code, so "
        "the two names are not identical and the dish is not tied to a row by guesswork.",
        lambda names: "pear sorbet vg gf" in names),
    "ice-cream-sorbet-lemon-sorbet": (
        "The allergen matrix has no lemon sorbet row (its sorbets are pear and mango), so the dish's allergens are not published.",
        lambda names: not any("lemon" in n for n in names)),
}
# Printed codes for the "name" ties, which the script checks so that a changed guide stops the run: item -> (nutrition code, matrix code).
NAME_TIE_CODES = {"apple-gyoza-6-pieces": ("227", "277"), "earl-grey-macaron-1-piece": ("390", "388"),
                  "yuzu-macaron-1-piece": ("", "389"), "ice-cream-sorbet-mango-sorbet": ("", None)}


def core_name(s: str) -> str:
    """Printed name without bracketed qualifiers, diet/halal/alcohol marks and quantities (for the 'name' ties only)."""
    s = re.sub(r"\([^)]*\)", " ", s.lower())
    toks = [t.strip(",.") for t in re.split(r"\s+", s)]
    return " ".join(t for t in toks if t and t not in {"gf", "vg", "v", "al", "h"} and not re.fullmatch(r"\d+(x|pcs?)", t))


def build_allergens(matrix_pdf: Path, items: list, printed: dict, held: set) -> tuple:
    """-> (allergen rows for write_allergens, ids held back for allergens {id: reason}, report lines).
    Stops (SystemExit) unless every other published item is tied to exactly one matrix row by the rules in the docstring."""
    data = matrix_reader.read_allergen_pdf(matrix_pdf)
    by_name = {r["name"]: r for r in data["rows"]}
    code_of = data["code_of"]
    names = {matrix_reader.norm(n) for n in by_name}
    rows, extra_held, used, report = [], {}, {}, []
    for it in items:
        item_id = it["id"]
        if item_id in held:
            continue
        if item_id in ALLERGEN_HELD:
            reason, guard = ALLERGEN_HELD[item_id]
            if not guard(names):
                raise SystemExit(f"{item_id}: the allergen matrix now has a row that may match: re-check ALLERGEN_HELD before running again.")
            extra_held[item_id] = reason
            continue
        if item_id not in ALLERGEN_ROW:
            raise SystemExit(f"{item_id}: no allergen matrix row is mapped for this item: map it in ALLERGEN_ROW or hold it back in ALLERGEN_HELD.")
        row_name, tie, remark = ALLERGEN_ROW[item_id]
        if row_name not in by_name:
            raise SystemExit(f"{item_id}: the allergen matrix has no row named {row_name!r}: the guide changed, re-check ALLERGEN_ROW.")
        if row_name in used:
            raise SystemExit(f"{row_name!r} is mapped to both {used[row_name]} and {item_id}: one matrix row may serve one item only.")
        used[row_name] = item_id
        nutr_code = printed[item_id]["code"]
        matrix_code = code_of.get(row_name)
        if tie == "code":
            if not nutr_code or nutr_code != matrix_code:
                raise SystemExit(f"{item_id}: code tie broken: the nutrition guide's code is {nutr_code!r}, the matrix row {row_name!r} has {matrix_code!r}.")
        else:
            if core_name(printed[item_id]["name"]) != core_name(row_name):
                raise SystemExit(f"{item_id}: name tie broken: {core_name(printed[item_id]['name'])!r} vs {core_name(row_name)!r}.")
            if NAME_TIE_CODES[item_id] != (nutr_code, matrix_code):
                raise SystemExit(f"{item_id}: the codes are now {(nutr_code, matrix_code)}, this tie was reviewed with {NAME_TIE_CODES[item_id]}: re-check it.")
        marks = by_name[row_name]["marks"]
        contains = set()
        for col in matrix_reader.ALLERGEN_COLUMNS:
            if col in marks:
                keys, _cereals, _nuts = allergen_words([ALLERGEN_HEADER[col]], f"matrix column {col}")
                contains |= keys
        rows.append((item_id, {"contains": contains, "may_contain": set(), "cereals": set(), "nuts": set()}))
        report.append(f"  {item_id} <- {row_name!r} ({tie}{': ' + remark if remark else ''}) -> {sorted(contains) or 'no allergen marked'}")
    unused = [n for n in by_name if n not in used]
    r = data["report"]
    head = (f"allergens: {len(rows)} published items tied to matrix rows ({r['matrix_rows']} matrix rows, {len(unused)} used by no item); "
            f"{len(extra_held)} items held back for want of an exact row; {r['marks_total']} marks, {r['cells_cross_checked']} cells "
            f"cross-checked against the {r['made_without_pages']} 'Made without' pages")
    return rows, extra_held, [head] + report + ["matrix rows used by no item: " + "; ".join(unused)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--matrix", type=Path, required=True, help="the chain's Allergen Matrix / Free From Menus PDF (MATRIX_URL)")
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}: the menu changed. Re-check ROWS "
              "against the PDF before running again.", file=sys.stderr)
        return 1

    items, held, flagged, printed_by_id = [], [], [], {}
    for printed, spec in zip(rows, ROWS):
        code, pname, name, section, serving, rankable, limited, tags, note = spec
        if (printed["code"], printed["name"]) != (code, pname) or printed["section"] != section:
            print(f"Row mismatch: the PDF has {printed['code']!r} {printed['name']!r} under {printed['section']!r}, the script "
                  f"expects {code!r} {pname!r} under {section!r}. Re-check ROWS.", file=sys.stderr)
            return 1
        p = printed["p"]
        item_id = slug(name)
        printed_by_id[item_id] = {"code": code, "name": pname}
        provenance = f"Printed row: {code or 'no code'} '{pname}'"
        items.append({
            "id": item_id, "name": name, "category": SECTIONS[section], "serving": serving,
            "calories": p["kcal"], "protein_g": p["protein"], "carbs_g": p["carbs"], "fat_g": p["fat"],
            "sat_fat_g": p["sat"], "sodium_mg": "", "salt_g": p["salt"], "sugar_g": p["sugars"],
            "fiber_g": "" if p["fibre"] == "n/a" else p["fibre"],
            "tags": tags, "limited_time": limited, "rankable": rankable, "notes": f"{provenance}. {note}".strip(),
        })
        if item_id in HELD:
            reason, guard = HELD[item_id]
            if not guard(printed):
                print(f"{name}: the row no longer shows the problem it was held back for. Re-check HELD before running again.",
                      file=sys.stderr)
                return 1
            held.append((item_id, reason))
        elif (found := impossible(p)) and item_id not in ACCEPTED:
            flagged.append(f"{name}: {', '.join(found)}")
    if flagged:
        print("These rows look impossible and are neither in HELD nor in ACCEPTED: decide for each.\n  " + "\n  ".join(flagged),
              file=sys.stderr)
        return 1
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids)), "duplicate ids"
    assert {h[0] for h in held} == set(HELD), "a HELD id matches no row"

    # allergens: every published item gets the row of the chain's own matrix, or is held back (never guessed)
    allergen_rows, allergen_held, allergen_report = build_allergens(args.matrix, items, printed_by_id, {h[0] for h in held})
    held_all = list(held)
    for it in items:
        if it["id"] in allergen_held:
            held_all.append((it["id"], allergen_held[it["id"]]))
            it["notes"] += " HELD BACK for allergens, see holdback.csv"

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Ping Pong", cuisine="Chinese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["ping pong", "ping pong dim sum", "pingpong", "pingpong dim sum"],
        items=items, note=NOTE, holdback=held_all, out=args.out)
    # written after the folder so that held-back items need no row (the build ignores rows of held-back items anyway)
    write_allergens(out, CHAIN_ID, allergen_rows, {"title": ALLERGEN_GUIDE_TITLE, "url": MATRIX_URL, "checked_on": args.checked_on,
                                                    "may_contain_published": False})
    published = [i for i in items if i["id"] not in {h[0] for h in held_all}]
    assert {i["id"] for i in published} == {a[0] for a in allergen_rows}, "every published item needs an allergen row"
    print(f"wrote {len(items)} items ({len(held_all)} held back: {len(held)} for numbers, {len(allergen_held)} for allergens) to {out} "
          f"(nutrition PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()}, "
          f"allergen PDF sha256 {hashlib.sha256(args.matrix.read_bytes()).hexdigest()})")
    print("\n".join(allergen_report))
    return 0


if __name__ == "__main__":
    sys.exit(main())
