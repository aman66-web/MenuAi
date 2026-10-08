#!/usr/bin/env python3
"""Build data/source/ping-pong/ from Ping Pong's own nutrition PDF ("Jun Full Menu 2025 - Nutr Info", printed 09/06/2025).

    python3 tools/uk_extract/ping_pong.py path/to/Nutr-Info-Jun-2025.pdf --checked-on 2026-10-06

The file is one A3 page (a spreadsheet printed to PDF, with a text layer) linked from https://www.pingpongdimsum.com/menus/.
Each row prints every nutrient twice: per portion and per 100 g. ONLY THE PER-PORTION COLUMNS ARE PUBLISHED (kcal, fat,
saturates, carbohydrate, sugars, fibre, protein, salt), copied exactly as printed; the per-100 g columns are read only to
spot rows that contradict themselves. Nothing is converted or corrected. Only the names, grouping and tags below are typed.

Every row is matched on its printed code and name, so if Ping Pong adds, removes, renames or reorders a dish, or a new
section or an unexplained impossible number appears, the run stops and a human re-checks ROWS / HELD / ACCEPTED.
Needs `pdftotext` (poppler). Output files: items.csv, chain.csv, holdback.csv, note.txt (and the empty optional CSVs).
"""
from __future__ import annotations
import argparse
import hashlib
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import ROOT, slug, write_chain_folder  # noqa: E402

CHAIN_ID = "ping-pong"
SOURCE_URL = "https://www.pingpongdimsum.com/wp-content/uploads/2025/06/Nutr-Info-Jun-2025.pdf"
TITLE_LINE = "Jun Full Menu 2025 - Nutr Info"
PRINTED_ON = "09/06/2025"
SOURCE_TITLE = ('Ping Pong Nutritional Information, "Jun Full Menu 2025 - Nutr Info" (guide dated June 2025, printed '
                '09/06/2025)')
NOTE = ("Guide dated June 2025, so some dishes may have changed since. Values are per portion as printed (portion sizes "
        "are not stated); there are no drinks, and a few dishes whose numbers the guide prints impossibly are left out.")

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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--checked-on", required=True, help="YYYY-MM-DD, the day you read the PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "source" / CHAIN_ID)
    args = ap.parse_args()

    rows = read_rows(args.pdf)
    if len(rows) != len(ROWS):
        print(f"The PDF has {len(rows)} nutrition rows but this script names {len(ROWS)}: the menu changed. Re-check ROWS "
              "against the PDF before running again.", file=sys.stderr)
        return 1

    items, held, flagged = [], [], []
    for printed, spec in zip(rows, ROWS):
        code, pname, name, section, serving, rankable, limited, tags, note = spec
        if (printed["code"], printed["name"]) != (code, pname) or printed["section"] != section:
            print(f"Row mismatch: the PDF has {printed['code']!r} {printed['name']!r} under {printed['section']!r}, the script "
                  f"expects {code!r} {pname!r} under {section!r}. Re-check ROWS.", file=sys.stderr)
            return 1
        p = printed["p"]
        item_id = slug(name)
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

    out = write_chain_folder(
        chain_id=CHAIN_ID, name="Ping Pong", cuisine="Chinese", source_title=SOURCE_TITLE, source_url=SOURCE_URL,
        checked_on=args.checked_on, aliases=["ping pong", "ping pong dim sum", "pingpong", "pingpong dim sum"],
        items=items, note=NOTE, holdback=held, out=args.out)
    print(f"wrote {len(items)} items ({len(held)} held back) to {out} (PDF sha256 {hashlib.sha256(args.pdf.read_bytes()).hexdigest()})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
